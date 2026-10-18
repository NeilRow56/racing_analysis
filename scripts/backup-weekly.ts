import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, constants } from "node:fs";
import { access, chmod, copyFile, link, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { BACKUP_TRACKERS } from "./backup-tracker-inventory";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export type Tracker = { filename: string; source: string; bytes: number; sha256: string; identifiers: Record<string, string | number> };
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

export async function inspectTracker(root: string, filename: string, source: string): Promise<Tracker> {
  const path = join(root, "data/research", filename);
  let buffer: Buffer;
  try { buffer = await readFile(path); } catch { throw new Error(`Required tracker missing or unreadable: ${filename}`); }
  let data: unknown;
  try { data = JSON.parse(buffer.toString("utf8")); } catch { throw new Error(`Invalid tracker JSON: ${filename}`); }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error(`Tracker must be a JSON object: ${filename}`);
  const identifiers = Object.fromEntries(Object.entries(data).filter(([key, value]) => /version|tracker|schema/i.test(key) && (typeof value === "string" || typeof value === "number"))) as Tracker["identifiers"];
  return { filename, source, bytes: buffer.length, sha256: createHash("sha256").update(buffer).digest("hex"), identifiers };
}

export function buildManifest(input: { createdAt: string; name: string; database: string; dump: { bytes: number; sha256: string }; trackers: Tracker[]; commit: string; branch: string; pgDumpVersion: string }) {
  return {
    backupVersion: 2, project: "racing-analysis", createdAt: input.createdAt,
    gitCommitSha: input.commit, gitBranch: input.branch,
    database: { name: input.database, filename: "postgres.dump", ...input.dump, format: "postgres-custom", verification: "PASS" },
    trackers: input.trackers.map((tracker) => ({ ...tracker, path: `research/${tracker.filename}` })),
    totalTrackerCount: input.trackers.length, archiveFilename: `${input.name}.tar.gz`,
    runtime: { node: process.version, bun: process.versions.bun ?? null, pgDump: input.pgDumpVersion },
    notes: ["Dump verified using pg_restore --list. No restore performed.", "UTC filename timestamp. Research files are byte-for-byte copies; no capture or settlement code invoked.", "Database snapshot and individual tracker copies are not a globally atomic snapshot. Pause research writers for a coordinated backup.", "Archive is published only after tar listing and extracted-file checksum verification. Offsite status is printed separately.", "Turf v1 included because tissue:v1:sync remains available. Frozen models/calibration artifacts excluded; retain the repository separately."],
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

export async function verifyExtracted(directory: string, manifest: ReturnType<typeof buildManifest>) {
  for (const item of [{ path: "postgres.dump", ...manifest.database }, ...manifest.trackers]) {
    const path = join(directory, item.path);
    if ((await stat(path)).size !== item.bytes || await sha256(path) !== item.sha256) throw new Error(`Backup checksum mismatch: ${item.path}`);
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
  const trackers = await Promise.all(BACKUP_TRACKERS.map(([filename, source]) => inspectTracker(root, filename, source)));
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
    for (const tracker of trackers) {
      const target = join(directory, "research", tracker.filename);
      await copyFile(join(root, "data/research", tracker.filename), target, constants.COPYFILE_EXCL);
      if (await sha256(target) !== tracker.sha256) throw new Error(`Tracker changed during backup: ${tracker.filename}; retry while writers are idle.`);
    }
    manifest = buildManifest({ createdAt: now.toISOString(), name, database: config.database, dump: { bytes: (await stat(dumpPath)).size, sha256: await sha256(dumpPath) }, trackers, commit, branch, pgDumpVersion });
    await writeFile(join(directory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    const partial = join(staging, archiveFilename);
    console.log("Creating archive and verifying extracted checksums...");
    await run("tar", ["-czf", partial, "-C", staging, name]);
    const listing = (await run("tar", ["-tzf", partial])).split("\n");
    for (const file of ["postgres.dump", "manifest.json", ...trackers.map((t) => `research/${t.filename}`)]) {
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
  console.log(`BACKUP COMPLETE\n\nDatabase:\n${config.database}\n\nPostgres dump:\n${archiveFilename}/${name}/postgres.dump (inside archive)\n${manifest.database.bytes} bytes\nverification: PASS\n\nResearch trackers:\n${trackers.length}\nvalidation: PASS\n\nArchive:\n${archivePath}\n${archiveBytes} bytes\nSHA-256: ${archiveHash}\nverification: PASS\n\nOff-device copy:\n${offsiteStatus}\n\nGit commit:\n${commit}`);
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
