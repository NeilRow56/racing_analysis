import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { acquireLock, agentStates, BUN, classifyAgent, evidenceStatus, formatStatus, londonClock, main, plan, readEvents, redact, ROOT, runCommand, runScheduled, SETTLEMENT_TIMEOUT_MS, statusReport, workflowEnvironment, WORKFLOW_TIMEOUT_MS, type Dependencies, type Event } from "./local-automation";

const dirs: string[] = [];
async function fixture(overrides: Partial<Dependencies> = {}) {
  const logRoot = await mkdtemp(join(tmpdir(), "racing-automation-test-")); dirs.push(logRoot);
  const calls: string[][] = [];
  const deps: Dependencies = { now: () => new Date("2026-11-14T08:00:00Z"), logRoot, ready: async () => {}, pause: async () => {},
    command: async command => { calls.push(command.args); return { code: 0, timedOut: false, hookWarning: false }; }, ...overrides };
  return { deps, calls };
}
afterEach(async () => { await Promise.all(dirs.splice(0).map(d => rm(d, { recursive: true, force: true }))); });
const started: Event = { id: "fixture", at: "2026-11-14T08:00:00Z", role: "collection", date: "2026-11-14", status: "started", mode: "morning" };

describe("local scheduling without operational execution", () => {
  test("London dates handle summer time, midnight and previous day", () => {
    assert.deepEqual(londonClock(new Date("2026-06-30T23:30:00Z")), { date: "2026-07-01", yesterday: "2026-06-30", minute: 30 });
    assert.equal(londonClock(new Date("2026-11-14T08:00:00Z")).minute, 480);
    assert.equal(londonClock(new Date("2026-03-29T07:00:00Z")).minute, 480);
    assert.equal(londonClock(new Date("2026-10-25T08:00:00Z")).minute, 480);
  });
  test("missed and premature collection windows do not invoke commands", async () => {
    for (const hour of [7, 11, 23]) {
      const f = await fixture({ now: () => new Date(`2026-11-14T${String(hour).padStart(2, "0")}:00:00Z`) });
      assert.equal(await runScheduled("collection", f.deps), hour === 7 ? 0 : 65); assert.equal((f.calls).length, 0);
    }
  });
  test("existing started marker suppresses replay even after a crash", () => {
    assert.equal(plan("collection", new Date("2026-11-14T08:10:00Z"), [started]).mode, undefined);
  });
  test("morning invokes only existing workflow once, with no force or independent shadow call", async () => {
    const f = await fixture(); assert.equal(await runScheduled("collection", f.deps), 0);
    assert.deepEqual(f.calls, [["--env-file=.env.local", "run", "research:morning", "2026-11-14"]]);
    assert.equal(await runScheduled("collection", f.deps), 0); assert.equal((f.calls).length, 1);
    assert.equal(((await readEvents(f.deps.logRoot)).filter(e => e.status === "success")).length, 1);
  });
  test("bounded readiness retries do not start workflows or claim server outage", async () => {
    let tries = 0; const pauses: number[] = [];
    const f = await fixture({ ready: async () => { tries++; throw new Error("ECONNREFUSED"); }, pause: async ms => { pauses.push(ms); } });
    assert.equal(await runScheduled("collection", f.deps), 69); assert.equal(tries, 3); assert.deepEqual(pauses, [2000, 4000]); assert.equal((f.calls).length, 0);
    assert.equal((await readEvents(f.deps.logRoot)).every(e => e.status === "database_unreachable" && e.code === 69), true);
    // A later launch may retry readiness because no workflow started.
    f.deps.ready = async () => {}; assert.equal(await runScheduled("collection", f.deps), 0);
  });
  test("readiness cannot cross collection deadline and still capture", async () => {
    let now = new Date("2026-11-14T10:59:59Z");
    const f = await fixture({ now: () => now, ready: async () => { now = new Date("2026-11-14T11:00:01Z"); } });
    assert.equal(await runScheduled("collection", f.deps), 65); assert.equal((f.calls).length, 0);
  });
  test("monitoring cannot cross collection deadline and still capture", async () => {
    let now = new Date("2026-11-14T10:59:59Z");
    const f = await fixture({ now: () => now, audit: async () => { now = new Date("2026-11-14T11:00:01Z"); return []; } });
    assert.equal(await runScheduled("collection", f.deps), 65); assert.equal(f.calls.length, 0);
  });
  test("shared filesystem lock blocks overlapping roles and is released", async () => {
    const f = await fixture(); const release = await acquireLock(f.deps.logRoot); assert.notEqual(release, null);
    assert.equal(await runScheduled("collection", f.deps), 75); assert.equal(await runScheduled("settlement", f.deps), 75); assert.equal((f.calls).length, 0);
    await release!(); const next = await acquireLock(f.deps.logRoot); assert.notEqual(next, null); await next!();
  });
  test("workflow failures, hook warnings and new gaps are not successful collection", async () => {
    for (const [code, warning, gap] of [[2, false, false], [0, true, false], [0, false, true]] as const) {
      let audits = 0; const f = await fixture({ command: async () => ({ code, timedOut: false, hookWarning: warning }), audit: async () => ++audits > 1 && gap ? ["new_gap"] : [] });
      assert.equal(await runScheduled("collection", f.deps), code || 70);
      assert.equal((await readEvents(f.deps.logRoot)).at(-1)?.status, code ? "failed" : "partial");
      assert.equal(await runScheduled("collection", f.deps), 0); // skipped, never replayed
    }
  });
  test("missing evidence monitor fails closed before workflow starts", async () => {
    const f = await fixture({ audit: async () => { throw new Error("unreadable"); } });
    assert.equal(await runScheduled("collection", f.deps), 78); assert.equal((f.calls).length, 0);
  });
  test("settlement reconciles yesterday once then uses current-day live workflow", async () => {
    const f = await fixture({ now: () => new Date("2026-11-14T09:00:00Z") });
    assert.equal(await runScheduled("settlement", f.deps), 0); assert.equal(await runScheduled("settlement", f.deps), 0);
    assert.deepEqual(f.calls.map(c => c.slice(-2)), [["research:after", "2026-11-13"], ["research:live", "2026-11-14"]]);
    assert.equal(await runScheduled("settlement", f.deps), 0); assert.equal(f.calls.length, 2); // repeated trigger in same hour is suppressed
  });
  test("collection and settlement have distinct bounded headroom; timed-out collection is never replayed", async () => {
    for (const role of ["collection", "settlement"] as const) {
      let calls = 0;
      const f = await fixture({ now: () => new Date("2026-11-14T09:00:00Z"), command: async command => {
        calls++; assert.equal(command.timeoutMs, role === "collection" ? WORKFLOW_TIMEOUT_MS : SETTLEMENT_TIMEOUT_MS);
        return { code: 124, timedOut: true, hookWarning: false };
      } });
      assert.equal(await runScheduled(role, f.deps), 124);
      const report = await statusReport(f.deps.logRoot, f.deps.logRoot, f.deps.now());
      assert.equal(report.timedOutExecutions.length, 1); assert.match(formatStatus(report), /Timed-out runs: 1/);
      if (role === "collection") { await runScheduled(role, f.deps); assert.equal(calls, 1); }
    }
  });
  test("status preserves last success alongside a later failure and readiness errors", async () => {
    const f = await fixture();
    const events: Event[] = [
      { ...started, id: "old", at: "2026-11-13T08:00:00Z", date: "2026-11-13", status: "success" },
      { ...started, status: "database_unreachable", code: 69 }, { ...started, status: "failed", code: 124 },
    ];
    await writeFile(join(f.deps.logRoot, "executions.jsonl"), events.map(e => JSON.stringify(e)).join("\n") + "\n");
    const report = await statusReport(f.deps.logRoot, f.deps.logRoot, f.deps.now());
    assert.equal(report.lastSuccessfulCollection?.id, "old"); assert.equal(report.lastCollectionInvocation?.status, "failed");
    assert.match(formatStatus(report), /Last successful collection: 2026-11-13/); assert.match(formatStatus(report), /readiness failures: 1/);
  });
  test("CLI requires explicit operational opt-in and rejects arbitrary modes or dates", async () => {
    for (const args of [["collection"], ["night", "--execute"], ["collection", "--execute", "2026-10-01"]]) await assert.rejects(main(args));
  });
  test("environment and redaction withhold secrets and stale acquisition guards", () => {
    assert.equal(workflowEnvironment().RESEARCH_EXISTING_CARDS_DATE, undefined); assert.equal(workflowEnvironment().RESEARCH_REFRESH_SOURCE_IDS, undefined); assert.equal(workflowEnvironment().TZ, "Europe/London");
    const env = { NODE_ENV: "test" as const, DATABASE_URL: "postgres://test:secret-value@127.0.0.1:5432/racing_analysis" };
    assert.ok(!(redact(`error ${env.DATABASE_URL} password secret-value`, env)).includes("secret-value"));
  });
  test("read-only evidence monitor distinguishes partial quotes, pending and exact capture gaps", () => {
    const b = { family: "HURDLE", raceId: "r", capturedAt: "2026-11-14T08:00:00Z", raceDate: "2026-11-14", scheduledOff: "2026-11-14T12:00:00Z", completeMarket: false, runners: [{ outcome: null, quotes: [4] }] };
    const report = evidenceStatus({ generation: [b], shadow: [], edge: [], positive: [] }, new Date("2026-11-14T14:00:00Z"), "2026-11-11T16:39:41Z");
    assert.equal((report.production.partialRawQuoteBooks).length, 1); assert.equal((report.production.overduePending).length, 1); assert.deepEqual(report.gaps.productionWithoutShadow, ["r|2026-11-14T08:00:00Z"]);
  });
  test("status uses no database; absent operational history is explicit", async () => {
    const f = await fixture(); const report = await statusReport(f.deps.logRoot, f.deps.logRoot, new Date("2026-11-14T14:00:00Z"));
    assert.equal(report.lastSuccessfulCollection, null); assert.equal(report.missedCollectionWindowToday, true); assert.equal(report.settlementHeartbeatOverdue, true); assert.equal((report.evidence as { unavailable: boolean }).unavailable, true);
  });
  test("human summary reports empty history without claiming zero failures or missed scheduled runs", async () => {
    const f = await fixture(); const report = await statusReport(f.deps.logRoot, f.deps.logRoot);
    const text = formatStatus(report);
    assert.match(text, /AUTOMATION/); assert.match(text, /RESEARCH COLLECTION/); assert.match(text, /DATA QUALITY/);
    assert.match(text, /No executions recorded/); assert.match(text, /failures and missed runs unassessed/);
    assert.doesNotMatch(text, /Failed\/partial executions: 0|heartbeat overdue|No successful wrapper collection/);
  });
  test("activation detection distinguishes absent, loaded idle, running and restricted inspection", async () => {
    const absent = { status: 113, stdout: "", stderr: "Could not find service uk.racing-analysis.collection" };
    assert.equal(classifyAgent(true, absent, false, false).state, "not_activated");
    assert.equal(classifyAgent(true, absent, true, false).state, "not_loaded");
    assert.equal(classifyAgent(true, absent, false, true).state, "not_loaded");
    assert.equal(classifyAgent(false, absent, false, false).state, "unknown");
    assert.equal(classifyAgent(true, { status: 1, stdout: "", stderr: "Operation not permitted" }, false, false).state, "unknown");
    assert.equal(classifyAgent(true, { status: 0, stdout: "state = waiting", stderr: "" }, true, false).state, "loaded_not_running");
    assert.equal(classifyAgent(true, { status: 0, stdout: "pid = 123", stderr: "" }, true, false).state, "running");
    const f = await fixture();
    const states = await agentStates([], f.deps.logRoot, args => args[1].split("/").length === 2 ? { status: 0, stdout: "", stderr: "" } : absent);
    assert.equal(states.collection.state, "not_activated"); assert.equal(states.settlement.state, "not_activated");
  });
  test("summary uses counts for markets, pending and gaps; JSON retains diagnostic identities", async () => {
    const f = await fixture(); const base = await statusReport(f.deps.logRoot, f.deps.logRoot);
    const book = { family: "HURDLE", raceId: "technical-race-identifier", raceDate: "2026-11-14", capturedAt: "2026-11-14T08:00:00Z", scheduledOff: "2026-11-14T12:00:00Z", completeMarket: false, runners: [{ outcome: null, quotes: [4] }, { outcome: null, quotes: [] }] };
    const report = { ...base, evidence: evidenceStatus({ generation: [book], shadow: [{ raceId: book.raceId, capturedAt: book.capturedAt, production: book }], edge: [], positive: [{ raceId: book.raceId, capturedAt: book.capturedAt }] }, new Date("2026-11-14T14:00:00Z"), "2026-11-11T16:39:41Z") };
    const text = formatStatus(report);
    assert.match(text, /Positive\/Neutral V2: Captured 1 \| Resolved 0 \| Pending 1/);
    assert.match(text, /Complete frozen market 0 \| Incomplete frozen market 1/);
    assert.match(text, /Cross-ledger gaps: 1/); assert.doesNotMatch(text, /technical-race-identifier/);
    const json = JSON.parse(JSON.stringify(report)); assert.ok(json.evidence.gaps.shadowWithoutMarketEdge[0].includes(book.raceId));
    assert.equal(json.evidence.positiveNeutral.pending, 1);
    const resolved = { ...book, completeMarket: true, runners: [{ outcome: { status: "settled" } }] };
    const e = evidenceStatus({ generation: [resolved], shadow: [{ ...resolved, production: resolved }], edge: [resolved], positive: [resolved] }, new Date(), "2026-11-11T16:39:41Z");
    assert.equal(e.marketEdge.resolvedCompleteBooks, 1); assert.equal(e.marketEdge.pending, 0);
  });
  test("status --json CLI is read-only JSON and preserves complete existing diagnostic fields", () => {
    const child = spawnSync(BUN, ["run", "scripts/local-automation.ts", "status", "--json"], { cwd: ROOT, encoding: "utf8", timeout: 10_000 });
    assert.equal(child.status, 0); const json = JSON.parse(child.stdout);
    for (const key of ["lastSuccessfulCollection", "lastSuccessfulSettlement", "failedExecutions", "databaseReadinessFailures", "missedCollectionWindowToday", "settlementHeartbeatOverdue", "missedExecutions", "unfinished", "lock", "evidence"]) assert.ok(key in json);
    assert.equal(typeof json.evidence.marketEdge.books, "number"); assert.ok(Array.isArray(json.evidence.marketEdge.incompleteMarkets));
  });
  test("malformed execution history fails closed rather than losing replay guards", async () => {
    const f = await fixture(); await writeFile(join(f.deps.logRoot, "executions.jsonl"), "bad json\n");
    assert.equal(await runScheduled("collection", f.deps), 78); assert.equal((f.calls).length, 0);
    const release = await acquireLock(f.deps.logRoot); assert.notEqual(release, null); await release!();
  });
  test("harmless process persists output and flags split-line hook warnings", async () => {
    const f = await fixture(); const prefix = join(f.deps.logRoot, "dummy");
    const result = await runCommand({ executable: process.execPath, args: ["-e", "console.log('dummy');process.stderr.write('Shadow un');setTimeout(()=>process.stderr.write('available\\n'),20)"], cwd: f.deps.logRoot, env: { NODE_ENV: "test" }, timeoutMs: 2000, logPrefix: prefix });
    assert.deepEqual(result, { code: 0, timedOut: false, hookWarning: true }); assert.ok((await readFile(`${prefix}.stdout.log`, "utf8")).includes("dummy"));
  });
  test("timeout kills harmless process group including a TERM-resistant descendant", async () => {
    const f = await fixture(); const marker = join(f.deps.logRoot, "escaped-marker");
    const descendant = `process.on('SIGTERM',()=>{});setTimeout(()=>require('fs').writeFileSync(${JSON.stringify(marker)},'bad'),1700);setInterval(()=>{},100)`;
    const parent = `require('child_process').spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{stdio:'ignore'});setInterval(()=>{},100)`;
    const start = Date.now(); const result = await runCommand({ executable: process.execPath, args: ["-e", parent], cwd: f.deps.logRoot, env: { NODE_ENV: "test" }, timeoutMs: 150, graceMs: 1000, logPrefix: join(f.deps.logRoot, "timeout") });
    assert.equal(result.code, 124); assert.equal(result.timedOut, true); assert.ok((Date.now() - start) < 3000);
    await new Promise(done => setTimeout(done, 650)); await assert.rejects(readFile(marker));
  });
  test("normal parent exit also cleans up lingering harmless descendants", async () => {
    const f = await fixture(); const marker = join(f.deps.logRoot, "orphan-marker");
    const descendant = `process.on('SIGTERM',()=>{});setTimeout(()=>require('fs').writeFileSync(${JSON.stringify(marker)},'bad'),1700);setInterval(()=>{},100)`;
    const parent = `require('child_process').spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{stdio:'ignore'});setTimeout(()=>process.exit(0),150)`;
    const result = await runCommand({ executable: process.execPath, args: ["-e", parent], cwd: f.deps.logRoot, env: { NODE_ENV: "test" }, timeoutMs: 2000, graceMs: 1000, logPrefix: join(f.deps.logRoot, "orphan") });
    assert.equal(result.code, 0); await new Promise(done => setTimeout(done, 650)); await assert.rejects(readFile(marker));
  });
  test("LaunchAgents are valid disabled templates with explicit paths and no independent collectors", () => {
    for (const role of ["collection", "settlement"]) {
      const path = join(ROOT, "ops/launchd", `uk.racing-analysis.${role}.plist`);
      const syntax = spawnSync("/usr/bin/plutil", ["-lint", path], { encoding: "utf8" }); assert.equal(syntax.status, 0);
      const converted = spawnSync("/usr/bin/plutil", ["-convert", "json", "-o", "-", path], { encoding: "utf8" }); assert.equal(converted.status, 0);
      const p = JSON.parse(converted.stdout); assert.equal(p.Disabled, true); assert.equal(p.KeepAlive, false); assert.equal(p.WorkingDirectory, ROOT); assert.deepEqual(p.ProgramArguments, [BUN, "--env-file=.env.local", "run", "scripts/local-automation.ts", role, "--execute"]); assert.equal(p.EnvironmentVariables.TZ, "Europe/London");
      assert.equal(p.ExitTimeOut, 30); assert.equal(p.StandardOutPath, "/dev/null"); assert.equal(p.StandardErrorPath, "/dev/null");
      if (role === "settlement") assert.deepEqual(p.StartCalendarInterval[0], { Hour: 10, Minute: 30 });
    }
  });
});
