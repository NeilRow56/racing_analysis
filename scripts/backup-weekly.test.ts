import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { BACKUP_TRACKERS } from "./backup-tracker-inventory";
import { backupName, buildManifest, createWeeklyBackup, databaseConfig, destinations, inspectTracker, sha256, verifyExtracted } from "./backup-weekly";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "weekly-test-"));
  directories.push(root);
  await mkdir(join(root, "data/research"), { recursive: true });
  for (const [filename] of BACKUP_TRACKERS) await writeFile(join(root, "data/research", filename), '{"version":"test_v1"}\n');
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
  assert.equal(BACKUP_TRACKERS.length, 18);
  assert.equal(new Set(BACKUP_TRACKERS.map(([name]) => name)).size, 18);
  for (const [filename, source] of BACKUP_TRACKERS) {
    assert.ok((await readFile(source, "utf8")).includes(filename), `${filename} moved; update inventory`);
    await inspectTracker(process.cwd(), filename, source);
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
  await createWeeklyBackup({ root, env, now, dryRun: true, run: async (command, args) => {
    assert.ok(command !== "pg_dump" || args.includes("--version"));
    return "version";
  } });
  assert.deepEqual(await readdir(root), ["data"]);
});
test("complete archive, extracted checksums, offsite copy, and no overwrite", async () => {
  const root = await fixture();
  const offsite = join(root, "offsite");
  await mkdir(offsite);
  const options = { root, env: { ...env, RACING_BACKUP_OFFSITE_DIR: offsite }, now, run: runner };
  const result = (await createWeeklyBackup(options))!;
  assert.equal(result.manifest.totalTrackerCount, 18);
  assert.equal((await stat(result.archivePath)).mode & 0o777, 0o600);
  assert.equal(result.offsiteStatus, "COPIED");
  assert.equal(await sha256(join(offsite, result.manifest.archiveFilename)), result.archiveHash);
  const extracted = join(root, "extracted");
  await mkdir(extracted);
  await runner("tar", ["-xzf", result.archivePath, "-C", extracted]);
  const directory = join(extracted, backupName(now));
  await verifyExtracted(directory, result.manifest);
  await writeFile(join(directory, "research", BACKUP_TRACKERS[0][0]), "tampered");
  await assert.rejects(verifyExtracted(directory, result.manifest), /checksum mismatch/);
  await assert.rejects(createWeeklyBackup(options), /EEXIST/);
  assert.equal(await sha256(result.archivePath), result.archiveHash);
  assert.deepEqual(await readdir(join(root, "backups")), [result.manifest.archiveFilename]);
});
test("missing required tracker fails before a dump", async () => {
  const root = await fixture();
  await rm(join(root, "data/research", BACKUP_TRACKERS[0][0]));
  await assert.rejects(createWeeklyBackup({ root, env, now, run: runner }), /missing/);
  assert.deepEqual(await readdir(root), ["data"]);
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
