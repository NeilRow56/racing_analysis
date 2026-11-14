import { profileStage, profileSync, recordTiming } from "./performance-profile";
/** Process-wide operational exclusion; deliberately outside the frozen research graph. */
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const OPERATIONAL_ROOT = join(homedir(), "Library/Logs/RacingAnalysis");
const OWNER_ENV = "RACING_OPERATIONAL_OWNER";
type Owner = { pid: number; started: string; token: string; at: string; caller: string };
export type OperationalLease = { environment: Record<string, string>; release: () => void };
const scope = new AsyncLocalStorage<Record<string, string>>();

function processInfo(pid: number): { parent: number; started: string } | null {
  try {
    const output = execFileSync("/bin/ps", ["-p", String(pid), "-o", "ppid=", "-o", "lstart="], { encoding: "utf8", timeout: 2000, env: { ...process.env, LC_ALL: "C", TZ: "UTC" }, stdio: ["ignore", "pipe", "pipe"] }).trim();
    const match = /^(\d+)\s+(.+)$/.exec(output);
    return match ? { parent: Number(match[1]), started: match[2] } : null;
  } catch { return null; }
}
function inheritedOwner(owner: Owner, credential: string | null | undefined): boolean {
  if (credential !== owner.token || processInfo(owner.pid)?.started !== owner.started) return false;
  let pid = process.pid;
  const seen = new Set<number>();
  while (pid > 1 && !seen.has(pid)) {
    if (pid === owner.pid) return true;
    seen.add(pid); pid = processInfo(pid)?.parent ?? 0;
  }
  return false;
}
function readOwner(path: string): Owner {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    if (fstatSync(fd).nlink !== 1) throw new Error("operational_lock_hardlink_rejected");
    return JSON.parse(readFileSync(fd, "utf8")) as Owner;
  } finally { closeSync(fd); }
}

/** No TTL, PID-only recovery or automatic stale takeover. Invalid metadata is busy. */
export function acquireOperationalLock(caller: string, root = OPERATIONAL_ROOT, inherited: string | null | undefined = process.env[OWNER_ENV]): OperationalLease | null {
  mkdirSync(root, { recursive: true, mode: 0o700 });
  if (lstatSync(root).isSymbolicLink()) throw new Error("operational_lock_directory_symlink_rejected");
  const path = join(root, "workflow.lock");
  const environment = (token: string) => ({ [OWNER_ENV]: token });
  let fd: number;
  try { fd = openSync(path, "wx", 0o600); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    try {
      const owner = readOwner(path);
      if (inheritedOwner(owner, inherited)) return { environment: environment(owner.token), release() {} };
    } catch { /* Existing legacy, partial, dead or unverifiable owner: fail closed. */ }
    return null;
  }
  const started = processInfo(process.pid)?.started;
  const owner: Owner = { pid: process.pid, started: started ?? "unverifiable", token: randomUUID(), at: new Date().toISOString(), caller };
  try { writeFileSync(fd, JSON.stringify(owner)); } finally { closeSync(fd); }
  if (!started) throw new Error("operational_owner_identity_unverifiable_lock_retained");
  let released = false;
  return { environment: environment(owner.token), release() {
    if (released) return;
    const current = readOwner(path);
    if (current.token !== owner.token || current.pid !== owner.pid || current.started !== owner.started) throw new Error("workflow_lock_ownership_changed_manual_review_required");
    unlinkSync(path); released = true;
  } };
}

export function assertNoLiveDescendants() {
  const output = execFileSync("/bin/ps", ["-axo", "pid=,ppid=,comm="], { encoding: "utf8", timeout: 2000, env: { ...process.env, LC_ALL: "C", TZ: "UTC" }, stdio: ["ignore", "pipe", "pipe"] });
  const rows = output.split("\n").flatMap(line => {
    const match = /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(line);
    return match ? [{ pid: Number(match[1]), parent: Number(match[2]), command: match[3] }] : [];
  });
  if (rows.some(row => row.parent === process.pid && row.command !== "ps" && row.command !== "/bin/ps")) {
    throw new Error("workflow_descendants_alive_lock_retained_for_review");
  }
}

export function operationalEnvironment(): NodeJS.ProcessEnv {
  return { ...process.env, ...scope.getStore() };
}

/** Busy requests still execute the read-only branch; credentials stay request-local. */
export async function withOperationalAccess<T>(caller: string, render: (available: boolean) => Promise<T>, root = OPERATIONAL_ROOT): Promise<T> {
  const lease = profileSync("shared_lock.acquire", () => acquireOperationalLock(caller, root, null));
  recordTiming("shared_lock.access", 0, lease ? "acquired" : "busy");
  if (!lease) return render(false);
  return profileStage("shared_lock.ownership", async () => {
    try { return await scope.run(lease.environment, () => render(true)); }
    finally { lease.release(); }
  });
}

/** Wait for every sibling operation before propagating failure and releasing its lease. */
export async function finishOperationalTasks<const T extends readonly unknown[]>(tasks: { [P in keyof T]: Promise<T[P]> }): Promise<T> {
  const results = await Promise.allSettled(tasks);
  return results.map(result => {
    if (result.status === "rejected") throw result.reason;
    return result.value;
  }) as unknown as T;
}
