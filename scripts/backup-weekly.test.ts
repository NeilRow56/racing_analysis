import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { copyFile, mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { BACKUP_ARTIFACTS, BACKUP_RECOVERY_SOURCES } from "./backup-artifact-inventory";
import { AW_PROFIT_BACKUP_TRACKER, AW_PROFIT_RECOVERY_SOURCES, AW_SAME_OR_BACKUP_TRACKER,
  AW_SAME_OR_RECOVERY_SOURCES, BACKUP_TRACKERS, BACKUP_TRACKERS_V4, BACKUP_TRACKERS_V5 } from "./backup-tracker-inventory";
import { backupName, buildManifest, createWeeklyBackup, databaseConfig, destinations, inspectArtifact, inspectRecoverySources, inspectTracker, sha256, verifyExtracted, type VerifiableManifest } from "./backup-weekly";
import { AW_SAME_OR_POLICY, decideAwSameOr } from "../src/lib/racing/aw-same-or-policy";
import { GENERATION_MODEL_HASHES } from "../src/lib/racing/tissue-generation-config";
import { loadTissueGeneration } from "../src/lib/racing/tissue-generation-forward";
import { loadTissueGenerationModels } from "../src/lib/racing/tissue-generation-model";

const [awProfitFilename, awProfitWriter] = AW_PROFIT_BACKUP_TRACKER;
const emptyAwProfit = { version: "aw_profit_shadow_v1", armedAt: "2026-11-21T13:12:53.086Z", races: [] };
const [sameOrFilename, sameOrWriter] = AW_SAME_OR_BACKUP_TRACKER;
const emptySameOr = { version: "aw_same_or_shadow_v1", policy: AW_SAME_OR_POLICY, armedAt: "2026-11-21T17:00:00.000Z", observations: [] };

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "weekly-test-"));
  directories.push(root);
  await mkdir(join(root, "data/research"), { recursive: true });
  await mkdir(join(root, "data/research/chase-speed-reliability-shadow-v1"));
  for (const [filename] of BACKUP_TRACKERS) { await mkdir(dirname(join(root, "data/research", filename)), { recursive: true }); await writeFile(join(root, "data/research", filename), '{"version":"test_v1"}\n'); }
  for (const [filename] of BACKUP_ARTIFACTS) { await mkdir(dirname(join(root, "data/research", filename)), { recursive: true }); await writeFile(join(root, "data/research", filename), '{"version":"frozen_fixture","checksum":"internal_model_hash"}\n'); }
  await writeFile(join(root, "data/research", awProfitFilename), JSON.stringify(emptyAwProfit));
  await writeFile(join(root, "data/research", sameOrFilename), JSON.stringify(emptySameOr));
  for (const filename of new Set([...BACKUP_RECOVERY_SOURCES, ...AW_PROFIT_RECOVERY_SOURCES, ...AW_SAME_OR_RECOVERY_SOURCES,
    ...BACKUP_TRACKERS.map(t => t[1]), ...BACKUP_ARTIFACTS.map(t => t[2])])) {
    await mkdir(dirname(join(root, filename)), { recursive: true });
    await writeFile(join(root, filename), `fixture source: ${filename}\n`);
  }
  const activation = JSON.parse(await readFile("data/research/prospective-epochs-2026-11-11/activation.json", "utf8"));
  activation.sourceHashes = { "package.json": await sha256(join(root, "package.json")) };
  activation.roots = ["package.json"]; activation.dependencyGraph = { "package.json": [] }; activation.originalEvidenceHashes = {};
  await writeFile(join(root, "data/research/prospective-epochs-2026-11-11/activation.json"), JSON.stringify(activation));
  for (const epoch of Object.values(activation.epochs) as { ledger: string }[]) {
    const ledger = JSON.parse(await readFile(epoch.ledger, "utf8"));
    ledger.observations = []; ledger.epoch = null; ledger.sourceHashes = {};
    await writeFile(join(root, epoch.ledger), JSON.stringify(ledger));
  }
  return root;
}
const exec = promisify(execFile);
async function runner(command: string, args: string[]) {
  if (command === "git") return args.includes("HEAD") && !args.includes("--abbrev-ref") ? "test-commit" : "test-branch";
  if (command === "pg_dump") {
    if (args.includes("--version")) return "pg_dump test";
    await writeFile(args[args.indexOf("--file") + 1], "test dump");
    return "";
  }
  if (command === "pg_restore") return "test listing";
  return (await exec(command, args)).stdout.trim();
}
const now = new Date("2026-10-18T05:30:00Z");
const env = { NODE_ENV: "test" as const, DATABASE_URL: "postgresql://user:secret@localhost:5432/racing_analysis?sslmode=prefer" };

test("inventory is unique, exists, and is tied to current writer path definitions", async () => {
  assert.equal(BACKUP_TRACKERS_V4.length, 36);
  assert.deepEqual(BACKUP_TRACKERS_V5, [...BACKUP_TRACKERS_V4, AW_PROFIT_BACKUP_TRACKER]);
  assert.deepEqual(BACKUP_TRACKERS, [...BACKUP_TRACKERS_V5, AW_SAME_OR_BACKUP_TRACKER]);
  assert.equal(new Set(BACKUP_TRACKERS.map(([name]) => name)).size, 38);
  const isolated = await fixture();
  for (const [filename, source] of BACKUP_TRACKERS) {
    assert.ok((await readFile(source, "utf8")).includes(filename.replace("prospective-epochs-2026-11-11/", "")), `${filename} moved; update inventory`);
    await inspectTracker(filename === sameOrFilename ? isolated : process.cwd(), filename, source);
  }
  assert.ok(!BACKUP_TRACKERS.some(([name]) => name === ("aw-tissue-paired-forward-v1.json" as string)));
});
test("UTC naming and configured destinations", () => {
  assert.equal(backupName(now), "racing-analysis-weekly-2026-10-18_053000");
  assert.deepEqual(destinations({ NODE_ENV: "test" }, "/project"), { local: "/project/backups", offsite: null });
  assert.deepEqual(destinations({ NODE_ENV: "test", RACING_BACKUP_DIR: "/tmp/local", RACING_BACKUP_OFFSITE_DIR: "/tmp/drive" }), { local: "/tmp/local", offsite: "/tmp/drive" });
});
test("database connection maps URI options into private environment without credentials in arguments", () => {
  assert.equal(databaseConfig(env).database, "racing_analysis");
  assert.equal(databaseConfig(env).env.PGDATABASE, "racing_analysis");
  assert.equal(databaseConfig(env).env.PGHOST, "localhost");
  assert.equal(databaseConfig(env).env.PGPASSWORD, "secret");
  assert.equal(databaseConfig(env).env.PGSSLMODE, "prefer");
  assert.equal(databaseConfig(env).env.DATABASE_URL, undefined);
  assert.throws(() => databaseConfig({ NODE_ENV: "test" }), /DATABASE_URL/);
  assert.throws(() => databaseConfig({ NODE_ENV: "test", DATABASE_URL: "https://example.com/db" }), /PostgreSQL/);
});
test("JSON validation, exact bytes, known SHA-256 and identifiers", async () => {
  const root = await fixture();
  const path = join(root, "data/research/example.json");
  await writeFile(path, '{"version":"v2","entries":[]}');
  const tracker = await inspectTracker(root, "example.json", "writer.ts");
  assert.equal(tracker.bytes, 29);
  assert.equal(tracker.sha256, await sha256(path));
  assert.deepEqual(tracker.identifiers, { version: "v2" });
  await writeFile(path, "abc");
  assert.equal(await sha256(path), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  await assert.rejects(inspectTracker(root, "example.json", "writer.ts"), /Invalid tracker JSON/);
  await assert.rejects(inspectTracker(root, "missing.json", "writer.ts"), /missing/);
});
test("manifest contains verification, provenance and no credentials", () => {
  const manifest = buildManifest({ createdAt: now.toISOString(), name: backupName(now), database: "racing_analysis", dump: { bytes: 42, sha256: "abc" }, trackers: [], commit: "sha", branch: "main", pgDumpVersion: "17" });
  assert.equal(manifest.database.verification, "PASS");
  assert.equal(manifest.archiveFilename, `${backupName(now)}.tar.gz`);
  assert.equal(manifest.gitBranch, "main");
  assert.equal(manifest.totalTrackerCount, 0);
  assert.ok(!JSON.stringify(manifest).includes("secret"));
});
test("dry run validates without writes or dump", async () => {
  const root = await fixture();
  const before = await readdir(root);
  await createWeeklyBackup({ root, env, now, dryRun: true, run: async (command, args) => {
    assert.ok(command !== "pg_dump" || args.includes("--version"));
    return "version";
  } });
  assert.deepEqual(await readdir(root), before);
});
test("complete archive, extracted checksums, offsite copy, and no overwrite", async () => {
  const root = await fixture();
  const shadowDirectory = join(root, "data/research/chase-speed-reliability-shadow-v1");
  await writeFile(join(shadowDirectory, "frozen.json"), '{"cohort":"primary","runners":[]}\n');
  await writeFile(join(shadowDirectory, "incomplete.tmp"), "incomplete");
  await writeFile(join(root, "src/lib/racing/chase-speed-reliability-capture.ts"), "snapshot writer");
  const awPath = join(root, "data/research", awProfitFilename);
  const initialTracker = await inspectTracker(root, awProfitFilename, awProfitWriter);
  const observation = {
    raceId: "fixture-aw-race", raceDate: "2026-11-22", course: "Chelmsford City", sourceId: "123",
    scheduledOff: "2026-11-22T15:00:00.000Z", sourceCapturedAt: "2026-11-22T08:00:00.000Z",
    featureCutoffAt: "2026-11-22T08:00:00.000Z", decidedAt: "2026-11-22T08:01:00.000Z", sourceStage: "DORMANT",
    modelVersion: "AW_TISSUE_V3", modelHash: GENERATION_MODEL_HASHES.AW,
    marketSource: "sporting_life_median_bookmaker_at_capture_v1", completeMarket: false,
    runners: [1, 2].map(rank => ({ runnerId: `r${rank}`, horseId: `h${rank}`, horseName: `Horse ${rank}`,
      rank, probability: 0.5, latestPerformance: null, performanceRank: null, bestL3Speed: null,
      medianBookmakerDecimal: null, quotes: [] })),
    picks: { AW_TISSUE_V3: "r1", AW_PROFIT_V1: null, AW_PROFIT_V3: null }, outcomes: {},
  };
  const populatedLedger = JSON.stringify({ ...emptyAwProfit, races: [observation] });
  await writeFile(awPath, populatedLedger);
  const book = (await loadTissueGeneration()).races.find(r => r.raceId === "666725d0-2524-4c04-90f5-73d5fe90bf54");
  assert.ok(book);
  book.raceDate = "2026-11-22";
  book.capturedAt = book.featureCutoffAt = "2026-11-22T08:00:00.000Z";
  book.scheduledOff = "2026-11-22T14:20:00.000Z";
  for (const runner of book.runners) runner.outcome = null;
  const { AW } = await loadTissueGenerationModels();
  const populatedSameOr = JSON.stringify({ ...emptySameOr, observations: [{ book, sourceId: "949648", sourceStage: "DORMANT",
    decidedAt: "2026-11-22T08:01:00.000Z", decision: decideAwSameOr(AW, book), outcomes: {} }] });
  await writeFile(join(root, "data/research", sameOrFilename), populatedSameOr);
  const offsite = join(root, "offsite");
  await mkdir(offsite);
  const options = { root, env: { ...env, RACING_BACKUP_OFFSITE_DIR: offsite }, now: new Date("2026-11-22T16:00:00Z"), run: runner };
  const result = (await createWeeklyBackup(options))!;
  assert.equal(result.manifest.totalTrackerCount, BACKUP_TRACKERS.length + 1);
  assert.ok(result.manifest.trackers.some(t => t.filename === "chase-speed-reliability-shadow-v1/frozen.json"));
  assert.equal((await stat(result.archivePath)).mode & 0o777, 0o600);
  assert.equal(result.offsiteStatus, "COPIED");
  assert.equal(await sha256(join(offsite, result.manifest.archiveFilename)), result.archiveHash);
  const extracted = join(root, "extracted");
  await mkdir(extracted);
  await runner("tar", ["-xzf", result.archivePath, "-C", extracted]);
  const directory = join(extracted, backupName(options.now));
  await verifyExtracted(directory, result.manifest);
  assert.equal(result.manifest.backupVersion, 6);
  assert.equal(await readFile(join(directory, "research", sameOrFilename), "utf8"), populatedSameOr);
  for (const filename of [sameOrWriter, ...AW_SAME_OR_RECOVERY_SOURCES]) {
    assert.ok(result.manifest.recoverySources.some(source => source.filename === filename));
  }
  const awTracker = result.manifest.trackers.find(t => t.filename === awProfitFilename);
  assert.ok(awTracker);
  assert.notEqual(awTracker.sha256, initialTracker.sha256);
  assert.equal(await readFile(join(directory, awTracker.path), "utf8"), populatedLedger);
  for (const filename of [awProfitWriter, ...AW_PROFIT_RECOVERY_SOURCES]) {
    assert.ok(result.manifest.recoverySources.some(source => source.filename === filename));
  }
  const v5 = structuredClone(result.manifest);
  v5.backupVersion = 5;
  v5.trackers = v5.trackers.filter(t => t.filename !== sameOrFilename);
  v5.totalTrackerCount--;
  const sameOrSources: readonly string[] = [sameOrWriter, ...AW_SAME_OR_RECOVERY_SOURCES.filter(s => s !== "scripts/local-automation.ts")];
  v5.recoverySources = v5.recoverySources.filter(s => !sameOrSources.includes(s.filename));
  v5.totalRecoverySourceCount = v5.recoverySources.length;
  const manifestPath = join(directory, "manifest.json");
  const manifestBytes = await readFile(manifestPath);
  await writeFile(manifestPath, JSON.stringify(v5));
  await verifyExtracted(directory, v5);
  await assert.rejects(verifyExtracted(directory, { ...v5, backupVersion: 6 }), /Manifest missing required tracker: aw-same-or-shadow-v1/);
  const v4 = structuredClone(v5);
  v4.backupVersion = 4;
  v4.trackers = v4.trackers.filter(t => t.filename !== awProfitFilename);
  v4.totalTrackerCount--;
  const awSources: readonly string[] = [awProfitWriter, ...AW_PROFIT_RECOVERY_SOURCES];
  v4.recoverySources = v4.recoverySources.filter(source => !awSources.includes(source.filename));
  v4.totalRecoverySourceCount = v4.recoverySources.length;
  await writeFile(manifestPath, JSON.stringify(v4));
  await verifyExtracted(directory, v4);
  await assert.rejects(verifyExtracted(directory, { ...v4, backupVersion: 5 }), /Manifest missing required tracker: aw-profit-shadow-v1/);
  await writeFile(manifestPath, manifestBytes);
  assert.equal(result.manifest.totalArtifactCount, 23);
  assert.deepEqual(result.manifest.artifacts.map(a => a.filename).sort(), BACKUP_ARTIFACTS.map(a => a[0]).sort());
  for (const file of [...result.manifest.trackers, ...result.manifest.artifacts]) {
    assert.equal(await readFile(join(directory, file.path), "utf8"), await readFile(join(root, "data/research", file.filename), "utf8"));
  }
  assert.equal(await readFile(join(directory, "postgres.dump"), "utf8"), "test dump");
  const artifact = result.manifest.artifacts[0];
  const original = await readFile(join(directory, artifact.path));
  await writeFile(join(directory, artifact.path), Buffer.alloc(original.length, 120));
  await assert.rejects(verifyExtracted(directory, result.manifest), /checksum mismatch/);
  await writeFile(join(directory, artifact.path), original);
  await rm(join(directory, artifact.path));
  await assert.rejects(verifyExtracted(directory, result.manifest), /Required backup payload missing/);
  await writeFile(join(directory, artifact.path), original);
  await writeFile(join(directory, "research", BACKUP_TRACKERS[0][0]), "tampered");
  await assert.rejects(verifyExtracted(directory, result.manifest), /checksum mismatch/);
  await assert.rejects(createWeeklyBackup(options), /EEXIST/);
  assert.equal(await sha256(result.archivePath), result.archiveHash);
  assert.equal(await readFile(awPath, "utf8"), populatedLedger);
  assert.deepEqual(await readdir(join(root, "backups")), [result.manifest.archiveFilename]);
});
test("missing required tracker fails before a dump", async () => {
  const root = await fixture();
  await rm(join(root, "data/research", BACKUP_TRACKERS[0][0]));
  await assert.rejects(createWeeklyBackup({ root, env, now, run: runner }), /missing/);
  assert.ok(!(await readdir(root)).includes("backups"));
});
for (const failure of ["pg_dump", "pg_restore", "tar", "checksum"] as const) {
  test(`${failure} failure leaves no completed or partial archive`, async () => {
    const root = await fixture();
    await assert.rejects(createWeeklyBackup({ root, env, now, run: async (command, args) => {
      if (command === failure && !args.includes("--version")) throw new Error("injected failure");
      const output = await runner(command, args);
      if (failure === "checksum" && command === "pg_restore" && args.includes("--list")) await writeFile(join(root, "data/research", BACKUP_TRACKERS[0][0]), '{"changed":true}');
      return output;
    } }));
    assert.deepEqual(await readdir(join(root, "backups")), []);
  });
}
test("unavailable offsite does not fail local backup", async () => {
  const root = await fixture();
  const result = (await createWeeklyBackup({ root, env: { ...env, RACING_BACKUP_OFFSITE_DIR: join(root, "unmounted", "backups") }, now, run: runner }))!;
  assert.equal(result.offsiteStatus, "FAILED");
  assert.equal(await sha256(result.archivePath), result.archiveHash);
});

const prospectiveLedgers = [
  "hurdle-v3-prospective-shadow-v1.json", "hurdle-low-form-prospective-v1.json",
  "hurdle-v3-market-edge-prospective-v1.json", "tissue-positive-neutral-prospective-v1.json",
  "turf-2027-early-season-v1.json", awProfitFilename, sameOrFilename,
];
const frozenModels = [
  "tissue-model-v1.json", "tissue-model-v2.json", "tissue-model-v3.json",
  "aw-tissue-model-v1.json", "aw-tissue-model-v2.json", "jump-tissue-model-v1.json",
  "aw-tissue-parity-shadow-model-v1.json", "chase-shadow-v1-frozen.json", "hurdle-tissue-v3-challenger.json",
  "tissue-generation-2026-11-turf.json", "tissue-generation-2026-11-aw.json",
  "tissue-generation-2026-11-hurdle.json", "tissue-generation-2026-11-chase.json",
];
test("explicit research coverage includes prospective ledgers, every frozen model, calibration and recovery metadata", async () => {
  for (const filename of prospectiveLedgers) assert.ok(BACKUP_TRACKERS.some(t => t[0] === filename));
  assert.deepEqual(BACKUP_ARTIFACTS.filter(a => a[1] === "model").map(a => a[0]).sort(), frozenModels.sort());
  for (const filename of ["forward-value-calibration-v1.json", "aw-surface-material-v1.json", "tissue-generation-2026-11-manifest.json", "tissue-generation-development-2026-11.json", "tissue-generation-chase-promotion-2026-11.json"]) {
    assert.ok(BACKUP_ARTIFACTS.some(a => a[0] === filename));
  }
  assert.equal(new Set(BACKUP_ARTIFACTS.map(a => a[0])).size, 23);
  const artifacts = await Promise.all(BACKUP_ARTIFACTS.map(([filename, role, source]) => inspectArtifact(process.cwd(), filename, role, source)));
  assert.ok(artifacts.every(a => a.bytes > 0 && a.identifiers));
});
for (const filename of [...prospectiveLedgers, ...BACKUP_ARTIFACTS.map(a => a[0])]) {
  test(`required research file ${filename} cannot be silently omitted`, async () => {
    const root = await fixture();
    await rm(join(root, "data/research", filename));
    let dumps = 0;
    await assert.rejects(createWeeklyBackup({ root, env, now, run: async (command, args) => {
      if (command === "pg_dump" && !args.includes("--version")) dumps++;
      return runner(command, args);
    } }), new RegExp(filename.replaceAll(".", "\\.")));
    assert.equal(dumps, 0);
    assert.ok(!(await readdir(root)).includes("backups"));
  });
}
test("invalid artifact JSON fails explicitly", async () => {
  const root = await fixture();
  const [filename, role, source] = BACKUP_ARTIFACTS[0];
  await writeFile(join(root, "data/research", filename), "invalid");
  await assert.rejects(inspectArtifact(root, filename, role, source), /Required research artifact.*Invalid tracker JSON/);
});
test("pinned methodology sources are required, checked, and preserved with historical references", async () => {
  const root = await fixture();
  const [filename, source] = BACKUP_TRACKERS[26];
  const hash = await sha256(join(root, source));
  await writeFile(join(root, "data/research", filename), JSON.stringify({ version: "pinned", sourceHashes: { [source]: hash } }));
  const tracker = await inspectTracker(root, filename, source);
  const [artifactName, role, artifactSource] = BACKUP_ARTIFACTS[0];
  await writeFile(join(root, "data/research", artifactName), JSON.stringify({ version: "old", codeHashes: { [source]: "0".repeat(64) } }));
  const artifact = await inspectArtifact(root, artifactName, role, artifactSource);
  const result = await inspectRecoverySources(root, [tracker, artifact]);
  assert.ok(result.recoverySources.some(s => s.filename === source && s.sha256 === hash));
  assert.equal(result.references[0].matches, true);
  assert.equal(result.references[1].requiredMatch, false);
  assert.equal(result.references[1].matches, false);
  await writeFile(join(root, source), "modified");
  await assert.rejects(inspectRecoverySources(root, [tracker]), /dependency checksum mismatch/);
  await rm(join(root, source));
  await assert.rejects(inspectRecoverySources(root, [tracker]), /Required recovery source missing/);
});
test("verification detects incomplete manifests, missing dump, and source/manifest tampering after real tar extraction", async () => {
  const root = await fixture();
  const [ledger, source] = BACKUP_TRACKERS[26];
  await writeFile(join(root, "data/research", ledger), JSON.stringify({ version: "pinned", sourceHashes: { [source]: await sha256(join(root, source)) } }));
  const activePath = join(root, "data/research/prospective-epochs-2026-11-11/hurdle-v3-shadow-v2.json");
  const active = JSON.parse(await readFile(activePath, "utf8")); active.sourceHashes = { [source]: await sha256(join(root, source)) };
  await writeFile(activePath, JSON.stringify(active));
  const result = (await createWeeklyBackup({ root, env, now, run: runner }))!;
  const extracted = join(root, "extracted");
  await mkdir(extracted);
  await runner("tar", ["-xzf", result.archivePath, "-C", extracted]);
  const directory = join(extracted, backupName(now));
  for (const filename of prospectiveLedgers) {
    const incomplete = structuredClone(result.manifest);
    incomplete.trackers = incomplete.trackers.filter(t => t.filename !== filename);
    incomplete.totalTrackerCount--;
    await assert.rejects(verifyExtracted(directory, incomplete), /Manifest missing required tracker/);
  }
  for (const [filename] of BACKUP_ARTIFACTS) {
    const incomplete = structuredClone(result.manifest);
    incomplete.artifacts = incomplete.artifacts.filter(t => t.filename !== filename);
    incomplete.totalArtifactCount--;
    await assert.rejects(verifyExtracted(directory, incomplete), /Manifest missing required artifact/);
  }
  const incomplete = structuredClone(result.manifest);
  incomplete.recoverySources = incomplete.recoverySources.filter(t => t.filename !== source);
  incomplete.totalRecoverySourceCount--;
  await assert.rejects(verifyExtracted(directory, incomplete), /Manifest missing required recovery source/);
  const wrongCount = { ...result.manifest, totalArtifactCount: 0 };
  await assert.rejects(verifyExtracted(directory, wrongCount), /payload count mismatch/);
  const archivedSource = join(directory, "recovery", source);
  const bytes = await readFile(archivedSource);
  await writeFile(archivedSource, Buffer.alloc(bytes.length));
  await assert.rejects(verifyExtracted(directory, result.manifest), /checksum mismatch/);
  await writeFile(archivedSource, bytes);
  await writeFile(join(directory, "manifest.json"), "{}");
  await assert.rejects(verifyExtracted(directory, result.manifest), /Archived manifest mismatch/);
  await writeFile(join(directory, "manifest.json"), JSON.stringify(result.manifest));
  await rm(join(directory, "postgres.dump"));
  await assert.rejects(verifyExtracted(directory, result.manifest), /Required backup payload missing: postgres.dump/);
});
test("artifact changes during dump abort publication", async () => {
  const root = await fixture();
  await assert.rejects(createWeeklyBackup({ root, env, now, run: async (command, args) => {
    const output = await runner(command, args);
    if (command === "pg_restore" && args.includes("--list")) await writeFile(join(root, "data/research", BACKUP_ARTIFACTS[0][0]), '{"changed":true}');
    return output;
  } }), /Tracker changed during backup/);
  assert.deepEqual(await readdir(join(root, "backups")), []);
});
test("legacy v2 extracted backups verify without claiming expanded coverage", async () => {
  const root = await fixture();
  const dump = join(root, "postgres.dump");
  await writeFile(dump, "legacy dump");
  const legacy: VerifiableManifest = buildManifest({ createdAt: now.toISOString(), name: backupName(now), database: "racing_analysis", dump: { bytes: 11, sha256: await sha256(dump) }, trackers: [], commit: "old", branch: "main", pgDumpVersion: "17" });
  delete legacy.artifacts;
  delete legacy.recoverySources;
  delete legacy.dependencyReferences;
  delete legacy.totalArtifactCount;
  delete legacy.totalRecoverySourceCount;
  legacy.backupVersion = 2;
  await writeFile(join(root, "manifest.json"), JSON.stringify(legacy));
  await verifyExtracted(root, legacy);
});
test("missing existing snapshot collection fails instead of silently dropping historical trackers", async () => {
  const root = await fixture();
  await rm(join(root, "data/research/chase-speed-reliability-shadow-v1"), { recursive: true });
  await assert.rejects(createWeeklyBackup({ root, env, now, run: runner }), /Required research snapshot directory missing/);
  assert.ok(!(await readdir(root)).includes("backups"));
});
test("archive membership omission prevents publication", async () => {
  const root = await fixture();
  await assert.rejects(createWeeklyBackup({ root, env, now, run: async (command, args) => {
    const output = await runner(command, args);
    return command === "tar" && args.includes("-tzf") ? output.split("\n").filter(path => !path.endsWith(BACKUP_ARTIFACTS[0][0])).join("\n") : output;
  } }), /Archive missing research\/tissue-model-v1.json/);
  assert.deepEqual(await readdir(join(root, "backups")), []);
});

// Real evidence is copied into a disposable workspace. PostgreSQL is a stub;
// only the existing Git object database is read to recover original sources.
test("isolated full evidence archive preserves historical and active epochs and rejects corruption", { timeout: 60000 }, async () => {
  const root = await fixture();
  await writeFile(join(root, ".git"), `gitdir: ${join(process.cwd(), ".git")}\n`);
  const research = [...await Promise.all(BACKUP_TRACKERS_V5.map(([f, s]) => inspectTracker(process.cwd(), f, s))),
    ...await Promise.all(BACKUP_ARTIFACTS.map(([f, r, s]) => inspectArtifact(process.cwd(), f, r, s)))];
  const preflight = await inspectRecoverySources(process.cwd(), research);
  for (const file of research) await copyFile(join(process.cwd(), "data/research", file.filename), join(root, "data/research", file.filename));
  for (const file of preflight.recoverySources) {
    await mkdir(dirname(join(root, file.filename)), { recursive: true });
    await copyFile(join(process.cwd(), file.filename), join(root, file.filename));
  }
  for (const file of [sameOrWriter, ...AW_SAME_OR_RECOVERY_SOURCES]) await copyFile(join(process.cwd(), file), join(root, file));
  const result = (await createWeeklyBackup({ root, env, now, run: runner }))!;
  assert.equal(result.manifest.historicalSources.length, 7);
  assert.equal(new Set(result.manifest.historicalSources.map(s => s.path)).size, 7);
  for (const pin of result.manifest.dependencyReferences.filter(p => p.requiredMatch && !p.matches)) {
    assert.ok(pin.historicalPath);
    assert.ok(result.manifest.historicalSources.some(s => s.path === pin.historicalPath && s.sha256 === pin.sha256));
  }
  const extracted = join(root, "extracted"); await mkdir(extracted);
  await runner("tar", ["-xzf", result.archivePath, "-C", extracted]);
  const directory = join(extracted, backupName(now));
  await verifyExtracted(directory, result.manifest);
  for (const file of research) assert.equal(await sha256(join(directory, "research", file.filename)), file.sha256);
  const original = result.manifest.historicalSources[0], path = join(directory, original.path);
  const bytes = await readFile(path); await writeFile(path, Buffer.alloc(bytes.length));
  await assert.rejects(verifyExtracted(directory, result.manifest), /checksum mismatch/);
  await writeFile(path, bytes);
  const missingHistory = structuredClone(result.manifest); missingHistory.historicalSources = [];
  await assert.rejects(verifyExtracted(directory, missingHistory), /dependency checksum mismatch/);
  for (const name of ["positive-neutral", "hurdle-v3-shadow", "hurdle-v3-market-edge"]) {
    const missingEpoch = structuredClone(result.manifest);
    missingEpoch.trackers = missingEpoch.trackers.filter(t => !t.filename.endsWith(`/${name}-v2.json`)); missingEpoch.totalTrackerCount--;
    await assert.rejects(verifyExtracted(directory, missingEpoch), /missing required tracker/);
  }
  // Active manifest pins cannot use historical substitutions.
  for (const filename of ["src/lib/racing/hurdle-v3-challenger-features.ts", "package.json"]) {
    const source = join(root, filename), bytes = await readFile(source);
    await writeFile(source, "deliberate unknown corruption");
    await assert.rejects(inspectRecoverySources(root, research), /dependency checksum mismatch/);
    await writeFile(source, bytes);
  }
  const historical = result.manifest.historicalSources[0];
  await writeFile(join(root, ".git"), "gitdir: /nonexistent-backup-fixture\n");
  await assert.rejects(inspectRecoverySources(root, research), /Historical dependency unavailable/);
  assert.ok(historical.revision);
});
