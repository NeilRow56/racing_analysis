import { acquireOperationalLock } from "../src/lib/racing/operational-lock";
/** External orchestration only. Never imported by production or frozen collectors. */
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import postgres from "postgres";
import { assertEpochSources, loadEpochManifest } from "../src/lib/racing/prospective-epoch-integrity";
import { atomicOperationalJson, maintainLogs, RETENTION, type RetentionReport } from "./local-automation-retention";

export const ROOT = "/Users/neilrowland/racing-analysis";
export const BUN = "/Users/neilrowland/.bun/bin/bun";
export const LOG_ROOT = join(homedir(), "Library/Logs/RacingAnalysis");
export const WORKFLOW_TIMEOUT_MS = 90 * 60_000;
export const SETTLEMENT_TIMEOUT_MS = 45 * 60_000;
export const TERMINATION_GRACE_MS = 10_000;
export type Role = "collection" | "settlement";
type Mode = "morning" | "live" | "after";
export type Event = {
  id: string; at: string; role: Role; date: string;
  status: "started" | "success" | "partial" | "failed" | "database_unreachable" | "locked" | "missed" | "skipped";
  mode?: Mode; code?: number; reason?: string;
};
export type CommandResult = { code: number; timedOut: boolean; hookWarning: boolean };
export type Command = { executable: string; args: string[]; cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number; logPrefix: string; graceMs?: number; streamBytes?: number };
export type Dependencies = {
  now: () => Date;
  ready: () => Promise<void>;
  command: (command: Command) => Promise<CommandResult>;
  pause: (ms: number) => Promise<void>;
  audit?: () => Promise<string[]>;
  logRoot: string;
};

export function londonClock(now: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (name: string) => parts.find(p => p.type === name)!.value;
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  const yesterday = new Date(`${date}T12:00:00Z`); yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return { date, yesterday: yesterday.toISOString().slice(0, 10), minute: Number(get("hour")) * 60 + Number(get("minute")) };
}

export function plan(role: Role, now: Date, events: Event[]): { mode?: Mode; date: string; reason?: string; missed?: boolean } {
  const clock = londonClock(now);
  if (role === "collection") {
    // Never retry a workflow that started: it may already have written captures.
    if (events.some(e => e.role === role && e.date === clock.date && e.status === "started")) return { date: clock.date, reason: "already_attempted_review_status" };
    if (clock.minute < 480) return { date: clock.date, reason: "before_0800_window" };
    if (clock.minute >= 660) return { date: clock.date, reason: "missed_0800_to_1100_window_no_backfill", missed: true };
    return { mode: "morning", date: clock.date };
  }
  if (clock.minute < 540 || clock.minute >= 1440) return { date: clock.date, reason: "outside_0900_to_midnight_window" };
  // Yesterday's import once per day; a failed/partial invocation is not replayed automatically.
  const reconciliation = events.some(e => e.role === role && e.mode === "after" && e.date === clock.yesterday && e.status === "started");
  if (reconciliation && events.some(e => e.role === role && e.mode === "live" && e.date === clock.date && e.status === "started" && Math.floor(londonClock(new Date(e.at)).minute / 60) === Math.floor(clock.minute / 60))) return { date: clock.date, reason: "live_settlement_already_attempted_this_hour" };
  return !reconciliation ? { mode: "after", date: clock.yesterday } : { mode: "live", date: clock.date };
}

export async function readEvents(logRoot: string): Promise<Event[]> {
  let events: Event[];
  try {
    events = (await readFile(join(logRoot, "executions.jsonl"), "utf8")).split("\n").filter(Boolean).map(line => JSON.parse(line) as Event);
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; events = []; }
  // Lock losers cannot append to a journal being atomically compacted by its owner.
  for (const role of ["collection", "settlement"]) {
    try { events.push(JSON.parse(await readFile(join(logRoot, `overlap-${role}.json`), "utf8")) as Event); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  return events.sort((a, b) => a.at.localeCompare(b.at));
}

export async function acquireLock(logRoot: string) {
  const lease = acquireOperationalLock("local_launchd_wrapper", logRoot);
  return lease ? Object.assign(async () => lease.release(), { environment: lease.environment }) : null;
}

export function workflowEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, TZ: "Europe/London", PATH: `${dirname(BUN)}:/usr/bin:/bin:/usr/sbin:/sbin` };
  // These are per-invocation acquisition guards, never scheduler configuration.
  delete env.RESEARCH_EXISTING_CARDS_DATE;
  delete env.RESEARCH_REFRESH_SOURCE_IDS;
  return env;
}

export function redact(text: string, env: NodeJS.ProcessEnv) {
  let safe = text.replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "[REDACTED_DATABASE_URL]");
  const url = env.DATABASE_URL;
  if (url) {
    safe = safe.split(url).join("[REDACTED_DATABASE_URL]");
    try { const password = decodeURIComponent(new URL(url).password); if (password) safe = safe.split(password).join("[REDACTED]"); } catch { /* invalid URL is rejected by readiness */ }
  }
  return safe;
}

/** Detached process group includes Python/Bun grandchildren. No operational commands in tests. */
export function runCommand(command: Command): Promise<CommandResult> {
  return new Promise((done, reject) => {
    const child = spawn(command.executable, command.args, { cwd: command.cwd, env: command.env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    let timedOut = false, hookWarning = false, stopped = false, loggingFailed = false, stopDeadline = 0;
    let writes = Promise.resolve();
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const groupSignal = (signal: NodeJS.Signals) => { if (child.pid) { try { process.kill(-child.pid, signal); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; } } };
    const graceMs = command.graceMs ?? TERMINATION_GRACE_MS;
    const stop = () => {
      if (stopped) return; stopped = true;
      stopDeadline = Date.now() + graceMs;
      groupSignal("SIGTERM");
      killTimer = setTimeout(() => groupSignal("SIGKILL"), graceMs);
    };
    const interrupt = () => { timedOut = true; stop(); };
    process.once("SIGTERM", interrupt); process.once("SIGINT", interrupt);
    for (const [stream, suffix] of [[child.stdout, "stdout"], [child.stderr, "stderr"]] as const) {
      let pending = "";
      let bytes = 0, truncated = false;
      const emit = (line: string) => {
        const safe = redact(line, command.env);
        if (/unavailable|blocked|USING EXISTING LOCAL CARDS|RACECARD_REFRESH_FAILED_USING_EXISTING|source.pin mismatch/i.test(safe)) hookWarning = true;
        if (truncated) return;
        const limit = command.streamBytes ?? RETENTION.streamBytes;
        let output = safe;
        if (bytes + Buffer.byteLength(safe) > limit) { output = "[automation log byte limit reached; remaining output drained, not stored]\n"; truncated = true; hookWarning = true; }
        bytes += Buffer.byteLength(output);
        writes = writes.then(() => appendFile(`${command.logPrefix}.${suffix}.log`, output, { mode: 0o600 })).catch(() => { loggingFailed = true; stop(); });
      };
      stream.setEncoding("utf8");
      stream.on("data", (chunk: string) => {
        pending += chunk;
        let end: number;
        while ((end = pending.indexOf("\n")) >= 0) { emit(pending.slice(0, end + 1)); pending = pending.slice(end + 1); }
        if (pending.length > 1_000_000) { emit("[oversized unterminated output line omitted]\n"); pending = ""; }
      });
      stream.on("end", () => { if (pending) emit(pending); });
    }
    const timer = setTimeout(() => { timedOut = true; stop(); }, command.timeoutMs);
    const cleanup = () => { clearTimeout(timer); process.removeListener("SIGTERM", interrupt); process.removeListener("SIGINT", interrupt); };
    child.once("error", error => { cleanup(); if (killTimer) clearTimeout(killTimer); reject(error); });
    child.once("close", code => {
      clearTimeout(timer);
      // A parent can exit while descendants with redirected stdio remain alive.
      if (!stopped && child.pid) {
        try { process.kill(-child.pid, 0); stop(); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") { reject(error); return; } }
      }
      // Always finish terminating the group before releasing the workflow lock.
      const finish = async () => { try { await writes; if (loggingFailed) throw new Error("persistent_logging_failed"); done({ code: timedOut ? 124 : code ?? 1, timedOut, hookWarning }); } finally { cleanup(); } };
      if (stopped) setTimeout(() => { void finish().catch(reject); }, Math.max(0, stopDeadline + 100 - Date.now()));
      else void finish().catch(reject);
    });
  });
}

export async function databaseReady() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL_missing");
  const url = new URL(raw);
  if (url.hostname !== "127.0.0.1" || (url.port || "5432") !== "5432" || url.pathname !== "/racing_analysis") throw new Error("configured_endpoint_differs_from_verified_endpoint");
  const client = postgres(raw, { max: 1, connect_timeout: 3, idle_timeout: 1 });
  try {
    await client.begin("read only", async sql => {
      await sql`set local statement_timeout = '3000ms'`;
      const rows = await sql`select current_database() as name, current_setting('transaction_read_only') as read_only`;
      if (rows[0]?.name !== "racing_analysis" || rows[0]?.read_only !== "on") throw new Error("unexpected_database_readiness_response");
    });
  } finally { await client.end({ timeout: 1 }); }
}

export async function runScheduled(role: Role, deps: Dependencies): Promise<number> {
  const id = randomUUID();
  await mkdir(deps.logRoot, { recursive: true, mode: 0o700 });
  const record = (event: Omit<Event, "id" | "at" | "role">) => appendFile(join(deps.logRoot, "executions.jsonl"), JSON.stringify({ id, at: deps.now().toISOString(), role, ...event }) + "\n", { mode: 0o600 });
  const release = await acquireLock(deps.logRoot);
  if (!release) {
    await atomicOperationalJson(deps.logRoot, `overlap-${role}.json`, { id, at: deps.now().toISOString(), role, date: londonClock(deps.now()).date, status: "locked", code: 75, reason: "shared_lock_held_no_automatic_stale_lock_removal" }); return 75;
  }
  try {
    try {
      const retention = await maintainLogs(deps.logRoot, deps.now(), id);
      if (retention.budgetExceeded) throw new Error("protected_log_budget_exceeded");
    } catch {
      await atomicOperationalJson(deps.logRoot, "last-error.json", { at: deps.now().toISOString(), role, code: 78, reason: "retention_or_journal_safety_failure_no_workflow_started" }); return 78;
    }
    const selected = plan(role, deps.now(), await readEvents(deps.logRoot));
    if (!selected.mode) { await record({ date: selected.date, status: selected.missed ? "missed" : "skipped", code: selected.missed ? 65 : 0, reason: selected.reason }); return selected.missed ? 65 : 0; }
    let ready = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try { await deps.ready(); ready = true; break; }
      catch {
        await record({ date: selected.date, mode: selected.mode, status: "database_unreachable", code: 69, reason: `readiness_attempt_${attempt + 1}_access_or_configuration_failure_not_proof_of_server_outage` });
        if (attempt < 2) await deps.pause(2000 * (attempt + 1));
      }
    }
    if (!ready) return 69;
    // Readiness retries may cross midnight or the prospective window boundary.
    const freshPlan = plan(role, deps.now(), await readEvents(deps.logRoot));
    if (freshPlan.mode !== selected.mode || freshPlan.date !== selected.date) {
      await record({ date: selected.date, status: "missed", code: 65, reason: "window_or_racing_date_changed_during_readiness" }); return 65;
    }
    let gapsBefore: string[];
    try { gapsBefore = await deps.audit?.() ?? []; }
    catch { await record({ date: selected.date, status: "failed", code: 78, reason: "evidence_monitor_unavailable_no_workflow_started" }); return 78; }
    const finalPlan = plan(role, deps.now(), await readEvents(deps.logRoot));
    if (finalPlan.mode !== selected.mode || finalPlan.date !== selected.date) {
      await record({ date: selected.date, status: "missed", code: 65, reason: "window_or_racing_date_changed_during_monitoring" }); return 65;
    }
    await record({ date: selected.date, mode: selected.mode, status: "started", reason: `caller=local_launchd_wrapper;london_minute=${londonClock(deps.now()).minute}` });
    try {
      const result = await deps.command({ executable: BUN, args: ["--env-file=.env.local", "run", `research:${selected.mode}`, selected.date], cwd: ROOT, env: { ...workflowEnvironment(), ...release.environment }, timeoutMs: role === "collection" ? WORKFLOW_TIMEOUT_MS : SETTLEMENT_TIMEOUT_MS, logPrefix: join(deps.logRoot, id) });
      let monitorWarning = false;
      try { monitorWarning = (await deps.audit?.() ?? []).some(gap => !gapsBefore.includes(gap)); } catch { monitorWarning = true; }
      const status = result.code !== 0 ? "failed" : result.hookWarning || monitorWarning ? "partial" : "success";
      const code = status === "success" ? 0 : result.code || 70;
      await record({ date: selected.date, mode: selected.mode, status, code, reason: result.timedOut ? "timeout_process_group_terminated_no_workflow_retry" : monitorWarning ? "new_capture_gap_or_monitor_failure_no_replay" : result.hookWarning ? "research_warning_review_logs_no_replay" : undefined });
      await maintainLogs(deps.logRoot, deps.now(), id);
      return code;
    } catch {
      await record({ date: selected.date, mode: selected.mode, status: "failed", code: 71, reason: "command_or_logging_failure_review_before_retry" }); return 71;
    }
  } finally { await release(); }
}

type Book = { raceId: string; raceDate: string; capturedAt: string; completeMarket: boolean; scheduledOff: string; runners: { outcome: unknown; quotes?: unknown[] }[] };
type Snapshot = { generation: Book[]; shadow: { raceId: string; capturedAt: string; production: Book }[]; edge: { raceId: string; capturedAt: string; completeMarket: boolean }[]; positive: { raceId: string; capturedAt: string }[] };
export function evidenceStatus(snapshot: Snapshot, now: Date, armedAt: string) {
  const key = (b: { raceId: string; capturedAt: string }) => `${b.raceId}|${b.capturedAt}`;
  // Only HURDLE coverage is compared with Hurdle Shadow/Edge. Positive/Neutral spans all families.
  const sources = new Map(snapshot.generation.map(b => [key(b), b]));
  const paired = new Map(snapshot.shadow.map(b => [key(b), b]));
  const edges = new Set(snapshot.edge.map(key)), positive = new Set(snapshot.positive.map(key));
  const current = snapshot.generation.filter(b => b.capturedAt >= armedAt);
  const shadowMissing = current.filter(b => (b as Book & { family?: string }).family === "HURDLE" && !paired.has(key(b))).map(key);
  const latest = (books: { capturedAt: string }[]) => books.map(b => b.capturedAt).sort().at(-1) ?? null;
  const summarize = (books: Book[]) => ({ books: books.length, captured: books.length, latestCapture: latest(books), resolved: books.filter(b => b.runners.every(r => r.outcome !== null)).length,
    completeMarkets: books.filter(b => b.completeMarket).length,
    resolvedCompleteBooks: books.filter(b => b.completeMarket && b.runners.every(r => r.outcome !== null)).length,
    incompleteMarkets: books.filter(b => !b.completeMarket).map(key),
    partialRawQuoteBooks: books.filter(b => !b.completeMarket && b.runners.some(r => r.quotes?.length)).map(key),
    pending: books.filter(b => b.runners.some(r => r.outcome === null)).length,
    overduePending: books.filter(b => Date.parse(b.scheduledOff) + 60 * 60_000 < now.getTime() && b.runners.some(r => r.outcome === null)).map(key) });
  const positiveBooks = snapshot.positive.map(b => sources.get(key(b))).filter((b): b is Book => !!b);
  return { production: summarize(current), shadow: summarize(snapshot.shadow.map(b => b.production)),
    positiveNeutral: { ...summarize(positiveBooks), books: snapshot.positive.length, captured: snapshot.positive.length, latestCapture: latest(snapshot.positive),
      sourceUnavailable: snapshot.positive.filter(b => !sources.has(key(b))).map(key) },
    marketEdge: { books: snapshot.edge.length, captured: snapshot.edge.length, latestCapture: latest(snapshot.edge), completeMarkets: snapshot.edge.filter(b => b.completeMarket).length,
      resolved: snapshot.edge.filter(b => paired.get(key(b))?.production.runners.every(r => r.outcome !== null)).length,
      incompleteMarkets: snapshot.edge.filter(b => !b.completeMarket).map(key),
      pending: snapshot.edge.filter(b => paired.get(key(b))?.production.runners.some(r => r.outcome === null)).length,
      resolvedCompleteBooks: snapshot.edge.filter(b => b.completeMarket && paired.get(key(b))?.production.runners.every(r => r.outcome !== null)).length },
    gaps: { productionWithoutShadow: shadowMissing, productionWithoutPositiveNeutral: current.filter(b => !positive.has(key(b))).map(key),
      shadowWithoutMarketEdge: snapshot.shadow.filter(b => !edges.has(key(b))).map(key),
      shadowWithoutProduction: snapshot.shadow.filter(b => !sources.has(key(b))).map(key), edgeWithoutShadow: snapshot.edge.filter(b => !paired.has(key(b))).map(key) },
    note: "Exact capture identities; production force-refresh books may legitimately lack a second first-per-race research observation. Gaps require review, never replay." };
}

export type AgentState = { state: "not_activated" | "not_loaded" | "running" | "loaded_not_running" | "unknown"; installed: boolean | null; detail: string; lastExitCode?: number };
type Probe = (args: string[]) => { status: number | null; stdout: string; stderr: string };
export function classifyAgent(domain: boolean, service: ReturnType<Probe>, installed: boolean | null, hasHistory: boolean): AgentState {
  if (service.status === 0) {
    const exit = /last exit code\s*=\s*(\d+)/.exec(service.stdout);
    return { state: /\bpid\s*=\s*\d+/.test(service.stdout) ? "running" : "loaded_not_running", installed, detail: "launchd service is loaded", ...(exit ? { lastExitCode: Number(exit[1]) } : {}) };
  }
  // Permission denial and other errors are not evidence of an absent service.
  if (domain && /could not find service/i.test(service.stderr)) {
    return { state: installed === false && !hasHistory ? "not_activated" : "not_loaded", installed,
      detail: installed === false && !hasHistory ? "not loaded; no installed plist or wrapper history detected (current state, not proof of never activated)" : "not loaded in current GUI domain" };
  }
  return { state: "unknown", installed, detail: "launchd state unverifiable in this execution context" };
}

export async function agentStates(events: Event[], home = homedir(), probe: Probe = args => {
  const result = spawnSync("/bin/launchctl", args, { encoding: "utf8", timeout: 1000, maxBuffer: 1_000_000 });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}): Promise<Record<Role, AgentState>> {
  const uid = process.getuid?.();
  const domain = uid === undefined ? "" : `gui/${uid}`;
  const accessible = !!domain && probe(["print", domain]).status === 0;
  const state = async (role: Role) => {
    let installed: boolean | null = true;
    try { await readFile(join(home, "Library/LaunchAgents", `uk.racing-analysis.${role}.plist`)); }
    catch (error) { installed = (error as NodeJS.ErrnoException).code === "ENOENT" ? false : null; }
    const service = domain ? probe(["print", `${domain}/uk.racing-analysis.${role}`]) : { status: null, stdout: "", stderr: "" };
    return classifyAgent(accessible, service, installed, events.some(e => e.role === role));
  };
  return { collection: await state("collection"), settlement: await state("settlement") };
}

export async function statusReport(logRoot = LOG_ROOT, root = ROOT, now = new Date()) {
  let events: Event[] = [], historyUnverifiable = false;
  try { events = await readEvents(logRoot); } catch { historyUnverifiable = true; }
  const last = (role: Role) => events.filter(e => e.role === role && e.status === "success").at(-1) ?? null;
  const started = events.filter(e => e.status === "started");
  const unfinished = started.filter(e => !events.some(end => end.id === e.id && ["success", "partial", "failed"].includes(end.status)));
  const clock = londonClock(now);
  const missedCollection = clock.minute >= 660 && !events.some(e => e.role === "collection" && e.date === clock.date && e.status === "success");
  const lastSettlementAttempt = [...events].reverse().find(e => e.role === "settlement" && e.status === "started");
  const settlementHeartbeatOverdue = clock.minute >= 690 && (!lastSettlementAttempt || now.getTime() - Date.parse(lastSettlementAttempt.at) > 5 * 60 * 60_000);
  const read = async <T>(path: string) => JSON.parse(await readFile(join(root, path), "utf8")) as T;
  let evidence: ReturnType<typeof evidenceStatus> | { unavailable: true; reason: string };
  try {
    const epoch = "data/research/prospective-epochs-2026-11-11";
    const [generation, shadow, edge, positive, activation] = await Promise.all([
      read<{ races: Book[] }>("data/research/tissue-generation-forward-2026-11.json"),
      read<{ observations: Snapshot["shadow"] }>(`${epoch}/hurdle-v3-shadow-v2.json`),
      read<{ observations: Snapshot["edge"] }>(`${epoch}/hurdle-v3-market-edge-v2.json`),
      read<{ observations: Snapshot["positive"] }>(`${epoch}/positive-neutral-v2.json`),
      read<{ activatedAt: string }>(`${epoch}/activation.json`),
    ]);
    evidence = evidenceStatus({ generation: generation.races, shadow: shadow.observations, edge: edge.observations, positive: positive.observations }, now, activation.activatedAt);
  } catch { evidence = { unavailable: true, reason: "ledger_read_or_shape_failure_no_changes_attempted" }; }
  let lock: unknown = null;
  try { lock = JSON.parse(await readFile(join(logRoot, "workflow.lock"), "utf8")); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") lock = "unreadable"; }
  const activation = await agentStates(events);
  const metadata = async <T>(name: string): Promise<T | null | { unreadable: true }> => {
    try { return JSON.parse(await readFile(join(logRoot, name), "utf8")) as T; }
    catch (error) { return (error as NodeJS.ErrnoException).code === "ENOENT" ? null : { unreadable: true }; }
  };
  const retention = await metadata<RetentionReport>("retention.json");
  const lastLocalError = await metadata<{ at: string; role?: Role; code: number; reason: string }>("last-error.json");
  return { asOf: now.toISOString(), schedulerActivation: `collection=${activation.collection.state};settlement=${activation.settlement.state}`, activation, logRoot,
    activationReadiness: "NO_GO_stage_B_ledger_drift_and_runtime_review_pending",
    historyUnverifiable, retention, retentionPolicy: RETENTION, lastLocalError,
    timedOutExecutions: events.filter(e => e.code === 124),
    overlapIndicators: events.filter(e => e.status === "locked"),
    executionCount: new Set(events.map(e => e.id)).size,
    lastCollectionInvocation: [...events].reverse().find(e => e.role === "collection") ?? null,
    lastSettlementInvocation: [...events].reverse().find(e => e.role === "settlement") ?? null,
    lastSuccessfulCollection: last("collection"), lastSuccessfulSettlement: last("settlement"),
    failedExecutions: events.filter(e => e.status === "failed" || e.status === "partial"), databaseReadinessFailures: events.filter(e => e.status === "database_unreachable"),
    missedCollectionWindowToday: missedCollection, settlementHeartbeatOverdue, missedExecutions: events.filter(e => e.status === "missed"), unfinished, lock, evidence,
    note: "Wrapper history only; browser/manual successes are not inferred. No database or network access. Ledgers are separate atomic reads, not a transactional snapshot; recheck transient gaps." };
}

export function formatStatus(report: Awaited<ReturnType<typeof statusReport>>) {
  const label: Record<AgentState["state"], string> = { not_activated: "Not yet activated", not_loaded: "Not loaded", running: "Running", loaded_not_running: "Loaded, not running", unknown: "Unknown / unverifiable" };
  const invocation = (event: Event | null) => event ? `${event.at} — ${event.status}${event.mode ? ` (${event.mode}, racing date ${event.date})` : ""}` : "No executions recorded";
  const lines = [`Racing Analysis — ${report.asOf}`, "", "AUTOMATION",
    "  Activation readiness: NO-GO — shared exclusion implemented; Stage B ledger drift/runtime review pending",
    `  Collection agent: ${label[report.activation.collection.state]}`,
    `  Settlement agent: ${label[report.activation.settlement.state]}`,
    `  Last collection invocation: ${invocation(report.lastCollectionInvocation)}`,
    `  Last settlement invocation: ${invocation(report.lastSettlementInvocation)}`,
    `  Last successful collection: ${invocation(report.lastSuccessfulCollection)}`,
    `  Last successful settlement: ${invocation(report.lastSuccessfulSettlement)}`];
  if (report.historyUnverifiable) lines.push("  WARNING: Execution history unreadable; outcomes and replay safety unknown");
  else if (report.executionCount === 0) lines.push("  History: No executions recorded; failures and missed runs unassessed");
  else lines.push(`  Failed/partial executions: ${report.failedExecutions.length}; readiness failures: ${report.databaseReadinessFailures.length}`,
    `  Timed-out runs: ${report.timedOutExecutions.length}; latest overlap indicators: ${report.overlapIndicators.length}`,
    `  Recorded missed windows: ${report.missedExecutions.length}; unfinished: ${report.unfinished.length}`);
  for (const role of ["collection", "settlement"] as const) if (report.activation[role].lastExitCode) lines.push(`  WARNING: ${role} launchd last exit code ${report.activation[role].lastExitCode}`);
  if (report.lastLocalError) {
    const error = report.lastLocalError;
    const laterSuccess = !("unreadable" in error) && error.role && (error.role === "collection" ? report.lastSuccessfulCollection : report.lastSuccessfulSettlement);
    const resolved = laterSuccess && !("unreadable" in error) && laterSuccess.at > error.at;
    lines.push(`  ${resolved ? "Historical" : "WARNING:"} Last local infrastructure error: ${"unreadable" in error ? "unreadable" : `${error.at} — ${error.reason}`}${resolved ? " (later role success recorded)" : " (inspect JSON)"}`);
  }
  if (report.retention && "budgetExceeded" in report.retention && report.retention.budgetExceeded) lines.push("  WARNING: Protected automation logs exceed budget; new workflows blocked");
  if (report.retention && "unreadable" in report.retention) lines.push("  WARNING: Retention metadata unreadable");
  else if (report.retention) lines.push(`  Log maintenance: ${report.retention.at}; managed logs ${(report.retention.remainingLogBytes / 1024 / 1024).toFixed(1)} MiB`);
  if (report.lock) lines.push("  WARNING: Workflow lock present; inspect JSON before recovery");
  if (report.executionCount > 0 && report.missedCollectionWindowToday) lines.push("  WARNING: No successful wrapper collection in today's elapsed window");
  if (report.executionCount > 0 && report.settlementHeartbeatOverdue) lines.push("  WARNING: Settlement wrapper heartbeat overdue");
  lines.push("", "RESEARCH COLLECTION");
  if ("unavailable" in report.evidence) {
    lines.push("  Unknown / unverifiable — frozen evidence could not be read", "", "DATA QUALITY", "  WARNING: Ledger read or shape failure; no evidence changed");
  } else {
    const e = report.evidence;
    for (const [name, cohort] of [["Positive/Neutral V2", e.positiveNeutral], ["Hurdle V3 Shadow V2", e.shadow], ["Hurdle V3 Market Edge V2", e.marketEdge]] as const) {
      lines.push(`  ${name}: Captured ${cohort.captured} | Resolved ${cohort.resolved} | Pending ${cohort.pending}`,
        `    Complete frozen market ${cohort.completeMarkets} | Incomplete frozen market ${cohort.incompleteMarkets.length} | Resolved complete ${cohort.resolvedCompleteBooks}`,
        `    Latest capture: ${cohort.latestCapture ?? "None recorded"}`);
    }
    const gaps = Object.values(e.gaps).reduce((n, values) => n + values.length, 0);
    lines.push(`  Cross-ledger gaps: ${gaps}${gaps ? " — review JSON; never backfill" : " among recorded captures"}`, "", "DATA QUALITY",
      `  Market Edge missing-price coverage: ${e.marketEdge.incompleteMarkets.length}/${e.marketEdge.captured} books incomplete`,
      `  Partial raw quote coverage: ${e.shadow.partialRawQuoteBooks.length} Shadow books`,
      `  Outstanding settlements: production ${e.production.pending}; Shadow ${e.shadow.pending}; Market Edge ${e.marketEdge.pending} (overlapping populations)`,
      `  Overdue by >1 hour after off: production ${e.production.overduePending.length}; Shadow ${e.shadow.overduePending.length}`);
    if (e.positiveNeutral.sourceUnavailable.length) lines.push(`  WARNING: ${e.positiveNeutral.sourceUnavailable.length} Positive/Neutral source captures unavailable`);
    lines.push("  Coverage: recorded captures only; unobserved racecards and Today display lookups are not checked");
  }
  lines.push("", "Read-only report. Full identifiers and diagnostics: status --json");
  return lines.join("\n");
}

async function auditGaps() {
  const manifest = await loadEpochManifest();
  if (!manifest) throw new Error("active_epoch_manifest_missing");
  await assertEpochSources(manifest);
  const report = await statusReport();
  const evidence = report.evidence as { unavailable?: boolean; gaps?: Record<string, string[]> };
  if (evidence.unavailable || !evidence.gaps) throw new Error("evidence_monitor_unavailable");
  return Object.entries(evidence.gaps).flatMap(([kind, gaps]) => gaps.map(gap => `${kind}:${gap}`));
}

export async function main(args: string[]) {
  if (args.length === 0 || (args[0] === "status" && (args.length === 1 || (args.length === 2 && args[1] === "--json")))) {
    const report = await statusReport();
    console.log(args.includes("--json") ? JSON.stringify(report, null, 2) : formatStatus(report)); return;
  }
  if (args.length !== 2 || !["collection", "settlement"].includes(args[0]) || args[1] !== "--execute") throw new Error("Use status, or collection|settlement --execute (operational; not for Stage A validation)");
  if (resolve(process.cwd()) !== ROOT) throw new Error("Requires explicit project working directory");
  process.exitCode = await runScheduled(args[0] as Role, { now: () => new Date(), ready: databaseReady, command: runCommand, audit: auditGaps, pause: ms => new Promise(done => setTimeout(done, ms)), logRoot: LOG_ROOT });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(async () => {
    // Bound startup-error storage; launchd also records an exit code if storage is unavailable.
    if (process.argv.includes("--execute")) {
      try { await mkdir(LOG_ROOT, { recursive: true, mode: 0o700 }); await atomicOperationalJson(LOG_ROOT, "last-error.json", { at: new Date().toISOString(), code: 1, reason: "wrapper_startup_failure_no_automatic_repair" }); } catch { /* launchd exit status remains observable */ }
    }
    console.error("Local automation failed; inspect operational logs. No automatic repair or replay."); process.exitCode = 1;
  });
}
