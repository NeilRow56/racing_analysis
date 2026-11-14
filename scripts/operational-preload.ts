/** Bun's project preload protects pinned entry points without rewriting their source. */
import { basename, dirname, resolve } from "node:path";
import { acquireOperationalLock, assertNoLiveDescendants } from "../src/lib/racing/operational-lock";

export function operationalScript(path: string, args: string[]): boolean {
  if (dirname(resolve(path)) !== resolve(import.meta.dirname)) return false;
  const name = basename(path);
  if (name.endsWith(".test.ts")) return false;
  if (name === "diagnose-tpr-vs-timewise-forward.ts") return args[0] === "add";
  // Conservative: even legacy 'today' reports can synchronise/settle ledgers.
  if (name.startsWith("track-") || name === "report-forward-value.ts") return args[0] !== "summary";
  return ["activate-prospective-epochs.ts", "run-research-workflow.ts", "settle-research-results.ts", "refresh-today-racecards.ts", "refresh-today-prices.ts", "backfill-research-holdout-coverage.ts"].includes(name);
}

if (process.argv[1] && operationalScript(process.argv[1], process.argv.slice(2))) {
  const lease = acquireOperationalLock(`cli:${basename(process.argv[1])}`);
  if (!lease) {
    console.error("WORKFLOW_BUSY: another operational owner or unrecovered lock exists; no workflow started. Retry after review/completion.");
    process.exit(75);
  }
  Object.assign(process.env, lease.environment);
  // SIGKILL/abrupt termination intentionally leaves a blocking lock for review.
  process.once("exit", () => {
    try { assertNoLiveDescendants(); lease.release(); } catch (error) { console.error(String(error)); process.exitCode = 74; }
  });
}
