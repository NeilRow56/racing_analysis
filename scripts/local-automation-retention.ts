/** Operational files only. No imports from research writers and no recursive deletion. */
import { lstat, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Event } from "./local-automation";
import { randomUUID } from "node:crypto";

export type RetentionPolicy = { logDays: number; protectedHours: number; maxLogBytes: number; journalDays: number; maxEvents: number; maxJournalBytes: number; streamBytes: number };
export const RETENTION: Readonly<RetentionPolicy> = Object.freeze({ logDays: 30, protectedHours: 24, maxLogBytes: 256 * 1024 * 1024,
  journalDays: 90, maxEvents: 20_000, maxJournalBytes: 16 * 1024 * 1024, streamBytes: 8 * 1024 * 1024 });
const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const executionLog = new RegExp(`^(${uuid})\\.(stdout|stderr)\\.log$`);
const day = 86_400_000;

export async function atomicOperationalJson(root: string, name: string, value: unknown) {
  const directory = await lstat(root);
  if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error("automation_log_directory_must_not_be_a_symlink");
  if (!["retention.json", "last-error.json", "overlap-collection.json", "overlap-settlement.json"].includes(name)) throw new Error("not_an_operational_metadata_file");
  const temp = join(root, `${name}.${process.pid}.${randomUUID()}.tmp`);
  await writeFile(temp, JSON.stringify(value) + "\n", { mode: 0o600, flag: "wx" });
  try { await rename(temp, join(root, name)); }
  finally { await unlink(temp).catch(() => {}); }
}

export function compactEvents(events: Event[], now: Date, policy = RETENTION) {
  const protectedIds = new Set<string>();
  const terminal = new Set(events.filter(e => ["success", "partial", "failed"].includes(e.status)).map(e => e.id));
  for (const e of events) {
    if (Date.parse(e.at) >= now.getTime() - 2 * day || (e.status === "started" && !terminal.has(e.id))) protectedIds.add(e.id);
  }
  for (const role of ["collection", "settlement"]) {
    const last = [...events].reverse().find(e => e.role === role && e.status === "success");
    if (last) protectedIds.add(last.id);
  }
  const mandatory = events.filter(e => protectedIds.has(e.id));
  // Reserve room for this invocation's readiness/start/end records.
  const max = policy.maxEvents - 20;
  if (mandatory.length > max) throw new Error("protected_journal_history_exceeds_budget_manual_review_required");
  const optional = events.filter(e => !protectedIds.has(e.id) && Date.parse(e.at) >= now.getTime() - policy.journalDays * day);
  const slots = Math.max(0, max - mandatory.length);
  const selected = new Set(slots ? optional.slice(-slots) : []);
  let kept = events.filter(e => protectedIds.has(e.id) || selected.has(e));
  const bytes = () => Buffer.byteLength(kept.map(e => JSON.stringify(e) + "\n").join(""));
  while (bytes() > policy.maxJournalBytes - 16_384) {
    const index = kept.findIndex(e => !protectedIds.has(e.id));
    if (index < 0) throw new Error("protected_journal_bytes_exceed_budget_manual_review_required");
    kept = kept.filter((_, i) => i !== index);
  }
  return { kept, protectedIds };
}

export type RetentionReport = { at: string; deletedFiles: number; deletedBytes: number; remainingLogBytes: number; protectedFiles: number; budgetExceeded: boolean; journalRecords: number; policy: typeof RETENTION };

/** Caller must own the shared workflow lock; status never calls this. */
export async function maintainLogs(root: string, now: Date, currentId: string, policy = RETENTION): Promise<RetentionReport> {
  const directory = await lstat(root);
  if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error("automation_log_directory_must_not_be_a_symlink");
  const lock = JSON.parse(await readFile(join(root, "workflow.lock"), "utf8")) as { pid: number };
  if (lock.pid !== process.pid) throw new Error("retention_requires_own_workflow_lock");
  let events: Event[] = [];
  const journalPath = join(root, "executions.jsonl");
  try {
    const info = await lstat(journalPath);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > 2 * policy.maxJournalBytes) throw new Error("journal_not_safe_for_automatic_compaction");
    events = (await readFile(journalPath, "utf8")).split("\n").filter(Boolean).map(line => JSON.parse(line) as Event);
    if (events.some(e => !e.id || !Number.isFinite(Date.parse(e.at)) || !["collection", "settlement"].includes(e.role))) throw new Error("invalid_execution_history");
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const { kept, protectedIds } = compactEvents(events, now, policy);
  protectedIds.add(currentId);
  if (kept.length !== events.length) {
    const temp = join(root, `executions.jsonl.${process.pid}.tmp`);
    await writeFile(temp, kept.map(e => JSON.stringify(e) + "\n").join(""), { flag: "wx", mode: 0o600 });
    try { await rename(temp, journalPath); } finally { await unlink(temp).catch(() => {}); }
  }
  const logs: { name: string; size: number; mtime: number; protected: boolean }[] = [];
  for (const name of await readdir(root)) {
    const temp = /^(?:executions\.jsonl\.(\d+)|(?:retention|last-error|overlap-collection|overlap-settlement)\.json\.(\d+)\.[0-9a-f-]{36})\.tmp$/.exec(name);
    if (temp) {
      const info = await lstat(join(root, name));
      let dead = false;
      try { process.kill(Number(temp[1] ?? temp[2]), 0); } catch (error) { dead = (error as NodeJS.ErrnoException).code === "ESRCH"; }
      if (dead && info.isFile() && !info.isSymbolicLink() && info.nlink === 1 && info.mtimeMs < now.getTime() - policy.protectedHours * 3_600_000) await unlink(join(root, name));
      continue;
    }
    const match = executionLog.exec(name);
    if (!match) continue; // Never touch unknown files, backups, plists or directories.
    const info = await lstat(join(root, name));
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) continue;
    logs.push({ name, size: info.size, mtime: info.mtimeMs, protected: protectedIds.has(match[1]) || info.mtimeMs >= now.getTime() - policy.protectedHours * 3_600_000 });
  }
  logs.sort((a, b) => a.mtime - b.mtime);
  let remainingLogBytes = logs.reduce((n, file) => n + file.size, 0), deletedFiles = 0, deletedBytes = 0;
  for (const file of logs) {
    if (file.protected || (file.mtime >= now.getTime() - policy.logDays * day && remainingLogBytes <= policy.maxLogBytes)) continue;
    await unlink(join(root, file.name));
    remainingLogBytes -= file.size; deletedFiles++; deletedBytes += file.size;
  }
  const result: RetentionReport = { at: now.toISOString(), deletedFiles, deletedBytes, remainingLogBytes, protectedFiles: logs.filter(f => f.protected).length,
    budgetExceeded: remainingLogBytes > policy.maxLogBytes, journalRecords: kept.length, policy };
  await atomicOperationalJson(root, "retention.json", result);
  return result;
}
