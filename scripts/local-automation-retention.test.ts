import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { randomUUID } from "node:crypto";
import { link, lstat, mkdir, mkdtemp, readFile, rm, symlink, truncate, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { acquireLock, readEvents, runCommand, runScheduled, statusReport, type Dependencies, type Event } from "./local-automation";
import { compactEvents, maintainLogs, RETENTION } from "./local-automation-retention";

const now = new Date("2026-11-14T08:00:00Z");
const old = new Date("2026-07-01T00:00:00Z");
const dirs: string[] = [];
async function directory() { const root = await mkdtemp(join(tmpdir(), "racing-retention-")); dirs.push(root); return root; }
afterEach(async () => { await Promise.all(dirs.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
function event(id: string, status: Event["status"], at = old.toISOString()): Event { return { id, at, role: "collection", date: at.slice(0, 10), status, mode: "morning" }; }
async function log(root: string, id: string, at = old, bytes = 5) {
  const file = join(root, `${id}.stdout.log`); await writeFile(file, "x".repeat(bytes)); await utimes(file, at, at); return file;
}

test("age retention protects active, unfinished, recent and last-success logs; ignores unknown files", async () => {
  const root = await directory(); const release = await acquireLock(root); assert.ok(release);
  try {
    const active = randomUUID(), unfinished = randomUUID(), success = randomUUID(), expired = randomUUID(), recent = randomUUID();
    await writeFile(join(root, "executions.jsonl"), [event(unfinished, "started"), event(success, "success")].map(e => JSON.stringify(e)).join("\n") + "\n");
    const removed = await log(root, expired); const preserved = await Promise.all([log(root, active), log(root, unfinished), log(root, success), log(root, recent, now)]);
    await writeFile(join(root, "research-ledger.json"), "evidence"); await mkdir(join(root, "backups")); await writeFile(join(root, "backups", "old.log"), "backup");
    const result = await maintainLogs(root, now, active);
    assert.equal(result.deletedFiles, 1); await assert.rejects(readFile(removed));
    for (const file of preserved) assert.equal(await readFile(file, "utf8"), "xxxxx");
    assert.equal(await readFile(join(root, "research-ledger.json"), "utf8"), "evidence"); assert.equal(await readFile(join(root, "backups/old.log"), "utf8"), "backup");
    assert.equal(JSON.parse(await readFile(join(root, "workflow.lock"), "utf8")).pid, process.pid);
  } finally { await release(); }
});

test("size budget removes only oldest inactive managed logs and reports protected excess", async () => {
  const root = await directory(); const release = await acquireLock(root); assert.ok(release);
  try {
    const first = await log(root, randomUUID(), new Date("2026-11-01T00:00:00Z"), 50);
    const second = await log(root, randomUUID(), new Date("2026-11-02T00:00:00Z"), 50);
    const recent = await log(root, randomUUID(), now, 50);
    const result = await maintainLogs(root, now, randomUUID(), { ...RETENTION, maxLogBytes: 70 });
    assert.equal(result.deletedFiles, 2); assert.equal(result.remainingLogBytes, 50); assert.equal(result.budgetExceeded, false);
    await assert.rejects(readFile(first)); await assert.rejects(readFile(second)); assert.equal((await lstat(recent)).size, 50);
    const over = await maintainLogs(root, now, randomUUID(), { ...RETENTION, maxLogBytes: 20 });
    assert.equal(over.budgetExceeded, true); assert.equal(over.deletedFiles, 0); assert.equal((await lstat(recent)).size, 50);
  } finally { await release(); }
});

test("journal compaction preserves replay markers, unfinished runs and last successes within bounds", () => {
  const events = [event("success", "success"), event("unfinished", "started"), event("today", "started", now.toISOString()),
    ...Array.from({ length: 15 }, (_, i) => event(`old-${i}`, "failed", "2026-11-01T09:00:00Z"))];
  const { kept } = compactEvents(events, now, { ...RETENTION, maxEvents: 26 });
  assert.equal(kept.length, 6);
  for (const id of ["success", "unfinished", "today"]) assert.ok(kept.some(e => e.id === id));
  assert.ok(!kept.some(e => e.id === "old-0"));
  const mandatory = Array.from({ length: 10 }, (_, i) => event(`${i}`, "started", now.toISOString()));
  assert.throws(() => compactEvents(mandatory, now, { ...RETENTION, maxEvents: 25 }), /protected_journal/);
});

test("retention never follows symlinks or deletes hard-linked logs or nested directories", async () => {
  const root = await directory(), outside = await directory(); const release = await acquireLock(root); assert.ok(release);
  try {
    const evidence = join(outside, "evidence"); await writeFile(evidence, "immutable"); await utimes(evidence, old, old);
    await symlink(evidence, join(root, `${randomUUID()}.stdout.log`));
    await link(evidence, join(root, `${randomUUID()}.stderr.log`));
    await mkdir(join(root, `${randomUUID()}.stdout.log`));
    const result = await maintainLogs(root, now, randomUUID());
    assert.equal(result.deletedFiles, 0); assert.equal(await readFile(evidence, "utf8"), "immutable");
  } finally { await release(); }
  const alias = join(outside, "alias"); await symlink(root, alias);
  await assert.rejects(acquireLock(alias), /symlink/);
});

test("retention requires the owning live lock and never removes another lock", async () => {
  const root = await directory(); await writeFile(join(root, "workflow.lock"), JSON.stringify({ pid: process.pid + 99999 }));
  await assert.rejects(maintainLogs(root, now, randomUUID()), /requires_own_workflow_lock/);
  assert.equal(await acquireLock(root), null); assert.equal(JSON.parse(await readFile(join(root, "workflow.lock"), "utf8")).pid, process.pid + 99999);
});

test("lock release never removes a replaced ownership token", async () => {
  const root = await directory(); const release = await acquireLock(root); assert.ok(release);
  await writeFile(join(root, "workflow.lock"), JSON.stringify({ pid: process.pid, token: "different-owner" }));
  await assert.rejects(release(), /ownership_changed/);
  assert.equal(JSON.parse(await readFile(join(root, "workflow.lock"), "utf8")).token, "different-owner");
});

test("protected budget overflow blocks before database readiness or workflow execution", async () => {
  const root = await directory(); const file = await log(root, randomUUID(), now); await truncate(file, RETENTION.maxLogBytes + 1); // sparse dummy file
  let called = false;
  const deps: Dependencies = { logRoot: root, now: () => now, ready: async () => { called = true; }, pause: async () => {}, command: async () => { called = true; return { code: 0, hookWarning: false, timedOut: false }; } };
  assert.equal(await runScheduled("collection", deps), 78); assert.equal(called, false);
  assert.match(await readFile(join(root, "last-error.json"), "utf8"), /retention_or_journal_safety_failure/);
});

test("status reports corrupt history and is strictly non-mutating, including expired logs", async () => {
  const root = await directory(); const file = await log(root, randomUUID()); await writeFile(join(root, "executions.jsonl"), "broken\n");
  const report = await statusReport(root, root, now);
  assert.equal(report.historyUnverifiable, true); assert.equal(await readFile(file, "utf8"), "xxxxx"); await assert.rejects(readFile(join(root, "retention.json")));
});

test("child stdout and stderr have byte caps while output is drained", async () => {
  const root = await directory(); const prefix = join(root, randomUUID());
  const result = await runCommand({ executable: process.execPath, args: ["-e", "for(let i=0;i<100;i++){console.log('x'.repeat(500));console.error('y'.repeat(500))}"], cwd: root, env: { NODE_ENV: "test" }, timeoutMs: 3000, streamBytes: 1024, logPrefix: prefix });
  assert.equal(result.code, 0); assert.equal(result.hookWarning, true);
  for (const stream of ["stdout", "stderr"]) { const data = await readFile(`${prefix}.${stream}.log`, "utf8"); assert.ok(Buffer.byteLength(data) < 1200); assert.match(data, /byte limit reached/); }
});

test("concurrent lock losers use independent bounded metadata without touching the journal", async () => {
  const root = await directory(); const release = await acquireLock(root); assert.ok(release);
  try {
    await writeFile(join(root, "executions.jsonl"), "");
    const deps: Dependencies = { logRoot: root, now: () => now, ready: async () => { throw new Error("must not run"); }, pause: async () => {}, command: async () => { throw new Error("must not run"); } };
    const codes = await Promise.all([runScheduled("collection", deps), runScheduled("settlement", deps)]);
    assert.deepEqual(codes, [75, 75]); assert.equal(await readFile(join(root, "executions.jsonl"), "utf8"), "");
    assert.equal((await readEvents(root)).filter(e => e.status === "locked").length, 2);
  } finally { await release(); }
});
