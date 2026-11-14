import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, constants } from "node:fs";
import { access, chmod, copyFile, link, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CHASE_SPEED_SNAPSHOT_DIRECTORY } from "../src/lib/racing/chase-speed-reliability-capture";
import { BACKUP_ARTIFACTS, BACKUP_RECOVERY_SOURCES } from "./backup-artifact-inventory";
import { promisify } from "node:util";
import { HISTORICAL_DEPENDENCIES } from "./backup-historical-dependencies";
import { EPOCH_MANIFEST, EPOCHS } from "../src/lib/racing/prospective-epoch-config";
import { loadPositiveNeutral } from "../src/lib/racing/tissue-positive-neutral";
import { loadHurdleV3Shadow } from "../src/lib/racing/hurdle-v3-shadow";
import { loadHurdleMarketEdge } from "../src/lib/racing/hurdle-v3-market-edge";
import { epochManifestSchema } from "../src/lib/racing/prospective-epoch-integrity";
import { BACKUP_TRACKERS } from "./backup-tracker-inventory";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export type Tracker = { filename: string; source: string; bytes: number; sha256: string; identifiers: Record<string, string | number> };
export type Artifact = Tracker & { role: typeof BACKUP_ARTIFACTS[number][1] };
export type RecoverySource = { filename: string; bytes: number; sha256: string };
export type HistoricalSource = RecoverySource & { originalFilename: string; revision: string };
const gitFile = promisify(execFile);
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
type Command = (command: string, args: string[], env?: NodeJS.ProcessEnv) => Promise<string>;

export function backupName(date: Date) {
  // Explicit UTC naming avoids dependence on the scheduler's timezone.
  return `racing-analysis-weekly-${date.toISOString().slice(0, 19).replace("T", "_").replaceAll(":", "")}`;
}

export function destinations(env: NodeJS.ProcessEnv, root = PROJECT_ROOT) {
  const expand = (path: string) => resolve(root, path.replace(/^~(?=\/|$)/, homedir()));
  return { local: expand(env.RACING_BACKUP_DIR || join(root, "backups")), offsite: env.RACING_BACKUP_OFFSITE_DIR ? expand(env.RACING_BACKUP_OFFSITE_DIR) : null };
}

export function databaseConfig(env: NodeJS.ProcessEnv) {
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required; use bun run backup:weekly to load .env.local.");
  let url: URL;
  try { url = new URL(env.DATABASE_URL); } catch { throw new Error("Invalid DATABASE_URL"); }
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !database) throw new Error("DATABASE_URL must identify a PostgreSQL database.");
  const connectionEnv: NodeJS.ProcessEnv = {
    ...env, DATABASE_URL: undefined,
    PGHOST: url.hostname.replace(/^\[|\]$/g, ""), PGPORT: url.port || "5432",
    PGDATABASE: database, PGUSER: decodeURIComponent(url.username) || env.PGUSER,
    PGPASSWORD: url.password ? decodeURIComponent(url.password) : env.PGPASSWORD,
    PGCONNECT_TIMEOUT: "10",
  };
  const parameters: Record<string, string> = {
    host: "PGHOST", hostaddr: "PGHOSTADDR", port: "PGPORT", dbname: "PGDATABASE",
    user: "PGUSER", password: "PGPASSWORD", passfile: "PGPASSFILE",
    sslmode: "PGSSLMODE", sslcert: "PGSSLCERT", sslkey: "PGSSLKEY",
    sslrootcert: "PGSSLROOTCERT", sslcrl: "PGSSLCRL", sslcrldir: "PGSSLCRLDIR",
    sslpassword: "PGSSLPASSWORD", ssl_min_protocol_version: "PGSSLMINPROTOCOLVERSION",
    ssl_max_protocol_version: "PGSSLMAXPROTOCOLVERSION", sslnegotiation: "PGSSLNEGOTIATION",
    connect_timeout: "PGCONNECT_TIMEOUT", application_name: "PGAPPNAME", options: "PGOPTIONS",
    channel_binding: "PGCHANNELBINDING", target_session_attrs: "PGTARGETSESSIONATTRS",
    gssencmode: "PGGSSENCMODE", krbsrvname: "PGKRBSRVNAME", requirepeer: "PGREQUIREPEER",
  };
  for (const [key, value] of url.searchParams) {
    if (!parameters[key]) throw new Error(`Unsupported DATABASE_URL connection option: ${key}; configure the equivalent PG environment variable.`);
    connectionEnv[parameters[key]] = value;
  }
  if (!connectionEnv.PGDATABASE) throw new Error("DATABASE_URL must identify a database");
  return { database: connectionEnv.PGDATABASE, env: connectionEnv };
}

export async function sha256(path: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function validateActiveLedger(path: string, filename: string) {
  if (`data/research/${filename}` === EPOCHS.positiveNeutral.ledger) await loadPositiveNeutral(path);
  if (`data/research/${filename}` === EPOCHS.shadow.ledger) await loadHurdleV3Shadow(path);
  if (`data/research/${filename}` === EPOCHS.marketEdge.ledger) await loadHurdleMarketEdge(path);
}

export async function inspectTracker(root: string, filename: string, source: string): Promise<Tracker> {
  const path = join(root, "data/research", filename);
  let buffer: Buffer;
  try { buffer = await readFile(path); } catch { throw new Error(`Required tracker missing or unreadable: ${filename}`); }
  let data: unknown;
  try { data = JSON.parse(buffer.toString("utf8")); } catch { throw new Error(`Invalid tracker JSON: ${filename}`); }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error(`Tracker must be a JSON object: ${filename}`);
  await validateActiveLedger(path, filename);
  const identifiers = Object.fromEntries(Object.entries(data).filter(([key, value]) => /version|tracker|schema|generation|checksum|epoch|frozenAt|developmentCutoff/i.test(key) && (typeof value === "string" || typeof value === "number"))) as Tracker["identifiers"];
  return { filename, source, bytes: buffer.length, sha256: createHash("sha256").update(buffer).digest("hex"), identifiers };
}

export async function inspectArtifact(root: string, filename: string, role: Artifact["role"], source: string): Promise<Artifact> {
  try { return { ...await inspectTracker(root, filename, source), role }; }
  catch (error) { throw new Error(`Required research artifact ${filename}: ${(error as Error).message}`); }
}

function safeRelativePath(filename: string) {
  if (!filename || filename.includes("\\") || filename.split("/").some(part => !part || part === "." || part === "..")) {
    throw new Error(`Unsafe backup path: ${filename}`);
  }
  return filename;
}

// Hashes embedded in frozen provenance may describe an older implementation.
// Keep references verbatim. Active pins must match; reviewed historical ledger
// differences additionally require original bytes. Artifact development references
// retain their existing informational status (not collection authorisation).
async function researchDependencies(files: Tracker[], read: (filename: string) => Promise<Buffer>, legacy = false) {
  const sources = new Set<string>([...(legacy ? BACKUP_RECOVERY_SOURCES.slice(0, 7) : BACKUP_RECOVERY_SOURCES), ...files.map(file => file.source)]);
  const pins: { owner: string; filename: string; sha256: string; requiredMatch: boolean }[] = [];
  for (const file of files) {
    const data = JSON.parse((await read(file.filename)).toString("utf8")) as Record<string, unknown>;
    if (!legacy && file.filename === EPOCH_MANIFEST.replace("data/research/", "")) {
      const manifest = epochManifestSchema.parse(data);
      const seen = new Set<string>();
      const visit = (path: string) => {
        if (seen.has(path)) return;
        if (!manifest.sourceHashes[path] || !manifest.dependencyGraph[path]) throw new Error(`Incomplete epoch provenance: ${path}`);
        seen.add(path); manifest.dependencyGraph[path].forEach(visit);
      };
      manifest.roots.forEach(visit);
      const originalLedgers = ["tissue-positive-neutral-prospective-v1.json", "hurdle-v3-prospective-shadow-v1.json", "hurdle-v3-market-edge-prospective-v1.json"];
      for (const [index, epoch] of Object.values(EPOCHS).entries()) {
        const ledger = JSON.parse((await read(epoch.ledger.replace("data/research/", ""))).toString("utf8"));
        const original = JSON.parse((await read(originalLedgers[index])).toString("utf8"));
        if (JSON.stringify(Object.keys(ledger.sourceHashes ?? {}).sort()) !== JSON.stringify(Object.keys(original.sourceHashes ?? {}).sort())) throw new Error(`Epoch ledger pin set mismatch: ${epoch.ledger}`);
        if (ledger.armedAt !== manifest.activatedAt) throw new Error(`Epoch activation boundary mismatch: ${epoch.ledger}`);
        for (const [path, hash] of Object.entries(ledger.sourceHashes ?? {})) {
          if (manifest.sourceHashes[path] !== undefined && manifest.sourceHashes[path] !== hash) throw new Error(`Epoch ledger pin mismatch: ${epoch.ledger} -> ${path}`);
        }
      }
      for (const [path, hash] of Object.entries(manifest.originalEvidenceHashes)) {
        if (files.find(f => `data/research/${f.filename}` === path)?.sha256 !== hash) throw new Error(`Original epoch evidence mismatch: ${path}`);
      }
    }
    for (const key of ["sourceHashes", "codeHashes", "scoringCodeHashes"]) {
      const hashes = data[key];
      if (hashes === undefined) continue;
      if (!hashes || typeof hashes !== "object" || Array.isArray(hashes)) throw new Error(`Invalid ${key}: ${file.filename}`);
      for (const [filename, hash] of Object.entries(hashes)) {
        safeRelativePath(filename);
        if (typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash)) throw new Error(`Invalid dependency hash: ${file.filename}/${filename}`);
        if (!filename.startsWith("data/research/")) sources.add(filename);
        else if (!files.some(item => `data/research/${item.filename}` === filename)) throw new Error(`Required research dependency not inventoried: ${filename} (${file.filename})`);
        pins.push({ owner: file.filename, filename, sha256: hash, requiredMatch: !("role" in file) || (!legacy && file.filename === EPOCH_MANIFEST.replace("data/research/", "")) });
      }
    }
  }
  return { sources: [...sources].sort(), pins };
}

export async function inspectRecoverySources(root: string, files: Tracker[]) {
  const dependencies = await researchDependencies(files, filename => readFile(join(root, "data/research", filename)));
  const recoverySources = await Promise.all(dependencies.sources.map(async filename => {
    let buffer: Buffer;
    try { buffer = await readFile(join(root, safeRelativePath(filename))); }
    catch { throw new Error(`Required recovery source missing or unreadable: ${filename}`); }
    return { filename, bytes: buffer.length, sha256: createHash("sha256").update(buffer).digest("hex") };
  }));
  const historicalSources: HistoricalSource[] = [];
  const historicalBytes = new Map<string, Buffer>();
  const references = await Promise.all(dependencies.pins.map(async pin => {
    const actual = pin.filename.startsWith("data/research/")
      ? files.find(file => `data/research/${file.filename}` === pin.filename)!.sha256
      : recoverySources.find(file => file.filename === pin.filename)!.sha256;
    let historicalPath: string | undefined;
    if (pin.requiredMatch && actual !== pin.sha256) {
      const known = HISTORICAL_DEPENDENCIES.find(item => item.owner === pin.owner && item.path === pin.filename && item.expected === pin.sha256 && item.current === actual);
      if (!known) throw new Error(`Required ledger dependency checksum mismatch: ${pin.owner} -> ${pin.filename}`);
      let bytes: Buffer;
      try { bytes = (await gitFile("git", ["-C", root, "show", `${known.revision}:${known.path}`], { encoding: "buffer", maxBuffer: 16 * 1024 * 1024 })).stdout; }
      catch { throw new Error(`Historical dependency unavailable: ${pin.owner} -> ${pin.filename} at ${known.revision}`); }
      if (digest(bytes) !== pin.sha256) throw new Error(`Historical dependency checksum mismatch: ${pin.owner} -> ${pin.filename}`);
      historicalPath = `historical/${pin.sha256}/${pin.filename}`;
      historicalSources.push({ filename: historicalPath, originalFilename: pin.filename, revision: known.revision, bytes: bytes.length, sha256: pin.sha256 });
      historicalBytes.set(historicalPath, bytes);
    }
    return { ...pin, actualSha256: actual, matches: actual === pin.sha256, ...(historicalPath ? { historicalPath } : {}) };
  }));
  historicalSources.sort((a, b) => a.filename.localeCompare(b.filename));
  return { recoverySources, references, historicalSources: [...new Map(historicalSources.map(item => [item.filename, item])).values()], historicalBytes };
}

export function buildManifest(input: { createdAt: string; name: string; database: string; dump: { bytes: number; sha256: string }; trackers: Tracker[]; artifacts?: Artifact[]; recoverySources?: RecoverySource[]; historicalSources?: HistoricalSource[]; references?: Awaited<ReturnType<typeof inspectRecoverySources>>["references"]; commit: string; branch: string; pgDumpVersion: string }) {
  return {
    backupVersion: 4, project: "racing-analysis", createdAt: input.createdAt,
    gitCommitSha: input.commit, gitBranch: input.branch,
    database: { name: input.database, filename: "postgres.dump", ...input.dump, format: "postgres-custom", verification: "PASS" },
    trackers: input.trackers.map((tracker) => ({ ...tracker, path: `research/${tracker.filename}` })),
    artifacts: (input.artifacts ?? []).map(artifact => ({ ...artifact, path: `research/${artifact.filename}` })),
    recoverySources: (input.recoverySources ?? []).map(source => ({ ...source, path: `recovery/${source.filename}` })),
    historicalSources: (input.historicalSources ?? []).map(source => ({ ...source, path: source.filename })),
    dependencyReferences: input.references ?? [],
    totalArtifactCount: input.artifacts?.length ?? 0, totalRecoverySourceCount: input.recoverySources?.length ?? 0,
    totalTrackerCount: input.trackers.length, archiveFilename: `${input.name}.tar.gz`,
    runtime: { node: process.version, bun: process.versions.bun ?? null, pgDump: input.pgDumpVersion },
    notes: ["Historical ledger pins are verified against reviewed original Git bytes; active epoch pins must match current bytes. Historical artifact development-input references remain informational.", "Dump verified using pg_restore --list. No restore performed.", "UTC filename timestamp. Research files are byte-for-byte copies; no capture or settlement code invoked.", "Database snapshot and individual tracker copies are not a globally atomic snapshot. Pause research writers for a coordinated backup.", "Archive is published only after tar listing and extracted-file checksum verification. Offsite status is printed separately.", "Turf v1 and all required frozen models/calibration/provenance included. recovery/ preserves current methodology and pinned source bytes; dependencyReferences distinguishes historical provenance hashes from current source hashes. Full repository/raw training history remain separate archival responsibilities."],
  };
}

async function commandOutput(command: string, args: string[], env = process.env) {
  return new Promise<string>((resolveOutput, reject) => {
    const chunks: Buffer[] = [];
    let stderr = "";
    const child = spawn(command, args, { cwd: PROJECT_ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
    child.stderr.on("data", (chunk: Buffer) => { stderr = (stderr + chunk.toString("utf8")).slice(-64000); });
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.once("error", () => reject(new Error(`Cannot run ${command}; check that it is installed and on PATH.`)));
    child.once("close", (code) => {
      if (code === 0) return resolveOutput(Buffer.concat(chunks).toString("utf8").trim());
      for (const secret of [env.DATABASE_URL, env.PGPASSWORD, env.PGSSLPASSWORD]) {
        if (secret) stderr = stderr.replaceAll(secret, "[REDACTED]");
      }
      reject(new Error(`${command} failed with exit code ${code ?? 1}: ${stderr.trim()}`));
    });
  });
}

async function writableAncestor(path: string) {
  let candidate = path;
  while (true) {
    try {
      const details = await stat(candidate);
      if (!details.isDirectory()) throw new Error(`Backup destination is not a directory: ${candidate}`);
      await access(candidate, constants.W_OK | constants.X_OK);
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT" || dirname(candidate) === candidate) throw error;
      candidate = dirname(candidate);
    }
  }
}

type WeeklyManifest = ReturnType<typeof buildManifest>;
// v2 archives retain their original tracker-only coverage; do not invent v3 payloads.
export type VerifiableManifest = Omit<WeeklyManifest, "artifacts" | "recoverySources" | "dependencyReferences" | "totalArtifactCount" | "totalRecoverySourceCount" | "historicalSources"> & Partial<Pick<WeeklyManifest, "artifacts" | "recoverySources" | "dependencyReferences" | "totalArtifactCount" | "totalRecoverySourceCount" | "historicalSources">>;

export async function verifyExtracted(directory: string, manifest: VerifiableManifest) {
  if (![2, 3, 4].includes(manifest.backupVersion)) throw new Error(`Unsupported backup version: ${manifest.backupVersion}`);
  if (manifest.backupVersion >= 3) {
    if (!Array.isArray(manifest.artifacts) || !Array.isArray(manifest.recoverySources) || !Array.isArray(manifest.dependencyReferences)) throw new Error("Incomplete v3 research manifest");
    if (manifest.totalTrackerCount !== manifest.trackers.length || manifest.totalArtifactCount !== manifest.artifacts.length || manifest.totalRecoverySourceCount !== manifest.recoverySources.length) throw new Error("Manifest payload count mismatch");
    for (const [filename] of (manifest.backupVersion === 3 ? BACKUP_TRACKERS.slice(0, 31) : BACKUP_TRACKERS)) if (!manifest.trackers.some(file => file.filename === filename)) throw new Error(`Manifest missing required tracker: ${filename}`);
    for (const [filename, role, source] of (manifest.backupVersion === 3 ? BACKUP_ARTIFACTS.slice(0, 18) : BACKUP_ARTIFACTS)) if (!manifest.artifacts.some(file => file.filename === filename && file.role === role && file.source === source)) throw new Error(`Manifest missing required artifact: ${filename}`);
  }
  if (manifest.backupVersion === 4 && !Array.isArray(manifest.historicalSources)) throw new Error("Incomplete v4 historical manifest");
  const payloads = [{ path: "postgres.dump", ...manifest.database }, ...manifest.trackers, ...(manifest.artifacts ?? []), ...(manifest.recoverySources ?? []), ...(manifest.historicalSources ?? [])];
  const paths = new Set<string>();
  for (const item of payloads) {
    safeRelativePath(item.path);
    if (paths.has(item.path)) throw new Error(`Duplicate manifest path: ${item.path}`);
    paths.add(item.path);
    const path = join(directory, item.path);
    let details;
    try { details = await stat(path); } catch { throw new Error(`Required backup payload missing: ${item.path}`); }
    if (!details.isFile() || details.size !== item.bytes || await sha256(path) !== item.sha256) throw new Error(`Backup checksum mismatch: ${item.path}`);
  }
  if (manifest.database.filename !== "postgres.dump") throw new Error("Invalid database dump path");
  if (manifest.backupVersion >= 3) {
    const research = [...manifest.trackers, ...manifest.artifacts!];
    for (const file of research) if (file.path !== `research/${safeRelativePath(file.filename)}`) throw new Error(`Invalid research payload path: ${file.path}`);
    for (const file of manifest.recoverySources!) if (file.path !== `recovery/${safeRelativePath(file.filename)}`) throw new Error(`Invalid recovery payload path: ${file.path}`);
    if (manifest.backupVersion >= 4) for (const file of research) await validateActiveLedger(join(directory, file.path), file.filename);
    const dependencies = await researchDependencies(research, filename => readFile(join(directory, "research", filename)), manifest.backupVersion === 3);
    for (const filename of dependencies.sources) if (!manifest.recoverySources!.some(file => file.filename === filename)) throw new Error(`Manifest missing required recovery source: ${filename}`);
    const references = dependencies.pins.map(pin => {
      const actual = pin.filename.startsWith("data/research/")
        ? research.find(file => `data/research/${file.filename}` === pin.filename)!.sha256
        : manifest.recoverySources!.find(file => file.filename === pin.filename)!.sha256;
      let historicalPath: string | undefined;
      if (pin.requiredMatch && actual !== pin.sha256) {
        const known = manifest.backupVersion >= 4 && HISTORICAL_DEPENDENCIES.find(item => item.owner === pin.owner && item.path === pin.filename && item.expected === pin.sha256 && item.current === actual);
        const original = manifest.historicalSources?.find(item => item.originalFilename === pin.filename && item.sha256 === pin.sha256);
        historicalPath = `historical/${pin.sha256}/${pin.filename}`;
        if (!known || !original || original.revision !== known.revision || original.path !== historicalPath || original.filename !== historicalPath) throw new Error(`Required ledger dependency checksum mismatch: ${pin.owner} -> ${pin.filename}`);
      }
      return { ...pin, actualSha256: actual, matches: actual === pin.sha256, ...(historicalPath ? { historicalPath } : {}) };
    });
    if (JSON.stringify(references) !== JSON.stringify(manifest.dependencyReferences)) throw new Error("Manifest dependency references mismatch");
  }
  if (JSON.stringify(JSON.parse(await readFile(join(directory, "manifest.json"), "utf8"))) !== JSON.stringify(manifest)) throw new Error("Archived manifest mismatch");
}

export async function createWeeklyBackup(options: { dryRun?: boolean; root?: string; env?: NodeJS.ProcessEnv; now?: Date; run?: Command } = {}) {
  const root = options.root ?? PROJECT_ROOT;
  const env = options.env ?? process.env;
  const run = options.run ?? commandOutput;
  const config = databaseConfig(env);
  const destination = destinations(env, root);
  await writableAncestor(destination.local);
  const pgDumpVersion = await run("pg_dump", ["--version"]);
  await run("pg_restore", ["--version"]);
  await run("tar", ["--version"]);
  const commit = await run("git", ["rev-parse", "HEAD"]);
  const branch = await run("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
  const shadowDirectory = join(root, CHASE_SPEED_SNAPSHOT_DIRECTORY);
  let shadowFiles: string[] = [];
  try { shadowFiles = (await readdir(shadowDirectory)).filter(f => f.endsWith(".json")).sort(); }
  catch { throw new Error(`Required research snapshot directory missing or unreadable: ${CHASE_SPEED_SNAPSHOT_DIRECTORY}`); }
  const shadowTrackers = shadowFiles.map(f => [`chase-speed-reliability-shadow-v1/${f}`, "src/lib/racing/chase-speed-reliability-capture.ts"] as const);
  const trackers = await Promise.all([...BACKUP_TRACKERS, ...shadowTrackers].map(([filename, source]) => inspectTracker(root, filename, source)));
  const artifacts = await Promise.all(BACKUP_ARTIFACTS.map(([filename, role, source]) => inspectArtifact(root, filename, role, source)));
  const { recoverySources, references, historicalSources, historicalBytes } = await inspectRecoverySources(root, [...trackers, ...artifacts]);
  for (const reference of references.filter(pin => !pin.matches)) console.warn(`Historical provenance reference differs from current bytes: ${reference.owner} -> ${reference.filename}; both hashes retained in manifest; ledger originals additionally preserved under historical/.`);
  console.log(`Required artifacts: ${artifacts.length}\nRecovery sources: ${recoverySources.length}`);
  console.log(`Database: ${config.database}\nLocal destination: ${destination.local}\nOffsite destination: ${destination.offsite ?? "NOT CONFIGURED"}\nTrackers (${trackers.length}):\n${trackers.map((t) => t.filename).join("\n")}`);
  if (destination.offsite) {
    try { await access(destination.offsite, constants.W_OK | constants.X_OK); if (!(await stat(destination.offsite)).isDirectory()) throw new Error(); }
    catch { console.warn("Offsite directory unavailable; local backup will still complete."); }
  }
  if (options.dryRun) { console.log("DRY RUN PASS: prerequisites and JSON/checksums validated; no dump/archive created. Database connectivity is checked by pg_dump on a real run."); return; }

  const now = options.now ?? new Date();
  const name = backupName(now);
  const archiveFilename = `${name}.tar.gz`;
  await mkdir(destination.local, { recursive: true, mode: 0o700 });
  const staging = await mkdtemp(join(destination.local, ".weekly-incomplete-"));
  const directory = join(staging, name);
  const archivePath = join(destination.local, archiveFilename);
  let manifest: ReturnType<typeof buildManifest>;
  let archiveHash: string;
  let archiveBytes: number;
  try {
    await mkdir(join(directory, "research"), { recursive: true });
    const dumpPath = join(directory, "postgres.dump");
    console.log("Creating read-only PostgreSQL custom-format dump...");
    await run("pg_dump", ["-Fc", "--no-password", "--file", dumpPath], config.env);
    if (!(await stat(dumpPath)).size) throw new Error("PostgreSQL dump is empty");
    await run("pg_restore", ["--list", dumpPath]);
    console.log("PostgreSQL dump verification: PASS. Copying required trackers...");
    for (const tracker of [...trackers, ...artifacts]) {
      const target = join(directory, "research", tracker.filename);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(join(root, "data/research", tracker.filename), target, constants.COPYFILE_EXCL);
      if (await sha256(target) !== tracker.sha256) throw new Error(`Tracker changed during backup: ${tracker.filename}; retry while writers are idle.`);
    }
    for (const source of recoverySources) {
      const target = join(directory, "recovery", source.filename);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(join(root, source.filename), target, constants.COPYFILE_EXCL);
      if (await sha256(target) !== source.sha256) throw new Error(`Recovery source changed during backup: ${source.filename}`);
    }
    for (const [path, bytes] of historicalBytes) {
      await mkdir(dirname(join(directory, path)), { recursive: true });
      await writeFile(join(directory, path), bytes, { flag: "wx" });
    }
    manifest = buildManifest({ createdAt: now.toISOString(), name, database: config.database, dump: { bytes: (await stat(dumpPath)).size, sha256: await sha256(dumpPath) }, trackers, artifacts, recoverySources, historicalSources, references, commit, branch, pgDumpVersion });
    await writeFile(join(directory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    const partial = join(staging, archiveFilename);
    console.log("Creating archive and verifying extracted checksums...");
    await run("tar", ["-czf", partial, "-C", staging, name]);
    const listing = (await run("tar", ["-tzf", partial])).split("\n");
    for (const file of ["postgres.dump", "manifest.json", ...[...trackers, ...artifacts].map((t) => `research/${t.filename}`), ...recoverySources.map(s => `recovery/${s.filename}`), ...historicalBytes.keys()]) {
      if (!listing.includes(`${name}/${file}`)) throw new Error(`Archive missing ${file}`);
    }
    const verification = join(staging, "verify");
    await mkdir(verification);
    await run("tar", ["-xzf", partial, "-C", verification]);
    await verifyExtracted(join(verification, name), manifest);
    await chmod(partial, 0o600);
    archiveHash = await sha256(partial);
    archiveBytes = (await stat(partial)).size;
    // Hard-link on the same filesystem publishes atomically and fails if the
    // name already exists, even with concurrent backups. Never use rename here.
    await link(partial, archivePath);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }

  let offsiteStatus = "NOT CONFIGURED";
  if (destination.offsite) {
    let offsiteStaging: string | undefined;
    try {
      // Require an existing folder: never create a fake local Drive mount.
      offsiteStaging = await mkdtemp(join(destination.offsite, ".weekly-incomplete-"));
      const partial = join(offsiteStaging, archiveFilename);
      await copyFile(archivePath, partial, constants.COPYFILE_EXCL);
      if (await sha256(partial) !== archiveHash) throw new Error("Offsite checksum mismatch");
      await chmod(partial, 0o600);
      await link(partial, join(destination.offsite, archiveFilename));
      offsiteStatus = "COPIED";
    } catch (error) {
      offsiteStatus = "FAILED";
      console.warn(`Offsite copy failed (${(error as NodeJS.ErrnoException).code ?? "verification or filesystem error"}); local archive retained.`);
    } finally {
      if (offsiteStaging) await rm(offsiteStaging, { recursive: true, force: true }).catch(() => console.warn("Could not clean offsite temporary directory."));
    }
  }
  console.log(`BACKUP COMPLETE\n\nDatabase:\n${config.database}\n\nPostgres dump:\n${archiveFilename}/${name}/postgres.dump (inside archive)\n${manifest.database.bytes} bytes\nverification: PASS\n\nResearch trackers:\n${trackers.length}\nvalidation: PASS\n\nResearch artifacts:\n${artifacts.length}\nRecovery sources:\n${recoverySources.length}\nvalidation: PASS\n\nArchive:\n${archivePath}\n${archiveBytes} bytes\nSHA-256: ${archiveHash}\nverification: PASS\n\nOff-device copy:\n${offsiteStatus}\n\nGit commit:\n${commit}`);
  if (offsiteStatus !== "COPIED") console.log("Backup complete locally; copy/upload this archive to Google Drive.");
  return { archivePath, archiveHash, manifest, offsiteStatus };
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  try {
    if (process.argv.slice(2).some((arg) => arg !== "--dry-run")) throw new Error("Usage: bun run backup:weekly [--dry-run]");
    await createWeeklyBackup({ dryRun: process.argv.includes("--dry-run") });
  } catch (error) { console.error(`BACKUP FAILED: ${(error as Error).message}`); process.exitCode = 1; }
}
