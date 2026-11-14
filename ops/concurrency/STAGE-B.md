# Stage B execution exclusion review — 14 November 2026

Implementation recommendation: **GO for the guarded, project-root execution paths below**.
Overall unattended activation recommendation: **NO-GO**. Automation remains disabled;
runtime acceptance and the independently observed ledger hash drift below require review.
No activation, installation, bootstrap, live workflow, commit or deployment was performed.

## Caller inventory and nesting

Repository entry points were traced through their imports and process launches. No other
repository cron, timer, API route, worker or scheduled racing caller was found. This is
not an audit of arbitrary external jobs installed on the Mac.

| Entry | Operations and nested dependencies | Exclusion boundary |
| --- | --- | --- |
| `src/app/racing/today/page.tsx` request render | TPR/TPR-shadow DB snapshots; eligible result refresh; production Tissue sync (capture and settlement); legacy AW/Jump sync for older dates; AW comparison capture/settlement and TPR/Timewise enrichment | Entire async page preparation; busy branch performs stored-data reads only |
| `refreshTodaySelectionResultsAction` | Reads cards/rules, AW comparisons, forced eligible-result retry, reload after import, comparison/Timewise enrichment | Before connection/read and any operational effect |
| `saveTimewiseComparisonAction` | Canonical per-ledger Timewise capture/update, preserving existing settlement | Shared guard plus existing ledger lock; busy response preserves displayed selection |
| `today-result-refresh.ts` | `refresh_sporting_life_race_result.py`, source fetch, raw payload and result import | Python child joins request-local verified owner |
| `scripts/run-research-workflow.ts`, aliases `research:night/morning/live/late/after` | Night: next-day racecards only. Morning: racecards, current runner status, OR/speed and other active research captures, production generation. Late: price/card refresh and captures. Live/after: result imports, settlement and reports. Existing activation filtering retires legacy captures; unchanged | Bun project preload owns whole serial workflow; every nested Bun/Python CLI joins the same owner |
| `scripts/refresh-today-racecards.ts` (`today:refresh`) | Source racecard refresh → Tissue-value sync → production generation sync, using only successful source IDs | Bun preload holds across complete chain |
| `scripts/refresh-today-prices.ts` | Python `refresh_today_prices.py`, current prices only | Bun preload, Python verified inheritance |
| `track-tissue-generation.ts sync/results` | Production prediction/capture and/or settlement | Bun preload; pinned source unchanged |
| `track-hurdle-v3-shadow.ts sync/results` | Sync delegates to **normal production generation**, not independent retrospective V3 recalculation; results loads pending IDs and settles existing shadows | Bun preload |
| Production generation hooks | Accepted production books → Positive/Neutral V2; early Turf; existing Hurdle settlement; prepared Hurdle V3 Shadow V2 → Market Edge V2; context-weight shadow. First-per-race and source-pin checks remain unchanged | Same owning caller, no recursive acquisition inside frozen libraries |
| `track-tissue-positive-neutral.ts`, `track-hurdle-v3-market-edge.ts` | `init` or read-only `summary`; actual captures occur through accepted-production hooks, not these summaries | Preload guards non-summary invocations; initialization was **not run** |
| `track-turf-early-season.ts`, `track-hurdle-low-form.ts` | Initialization or summaries; prospective hooks nested under production/Shadow | Same preload policy; no initialization run |
| `settle-research-results.ts` (`research:settle`) | Batched canonical result reads; production, value cohorts, OR/speed, TPR/Timewise, Turf, Jump, AW, paired challengers, Chase, G4, rating-weight and disagreement settlement; context and Hurdle hooks | Bun preload; existing per-ledger locks retained |
| Other manual `track-*.ts` | `track-tpr-forward`, `track-independent-tissue`, `track-jump-rating-forward`, `track-jump-tissue`, `track-jump-g4-forward`, `track-todays-rating-weight-forward`, `track-aw-rating-forward`, `track-aw-tissue`, `track-aw-tissue-paired`, `track-aw-tissue-shadow`, `track-hurdle-tissue-paired`, `track-chase-tissue-paired`, `track-hurdle-recency-forward`, `track-rank-one-forward`, `track-or-speed-forward`, `track-turf-value-forward`, `track-tissue-value-forward`, `track-model-disagreement` | All non-explicit-summary invocations guarded conservatively, including some read-only reports. `track-aw-forward-comparisons` and `track-chase-shadow` expose summaries only |
| `track-model-disagreement.ts` | Night/morning/late/sync can nest Jump/AW Tissue sync and settle disagreement observations | Same owning CLI process, no recursion |
| `diagnose-tpr-vs-timewise-forward.ts add` | Manual tracker observation/outcome entry | Bun preload; `summary`, `tpr-summary`, `report` remain outside operational guard |
| `report-forward-value.ts` | Today/results/summary reporting is read-only; non-summary modes conservatively guarded when nested in workflows | Bun preload (extra exclusion, no changed reporting semantics) |
| Python Sporting Life CLIs | `import_sporting_life_racecards.py`; `import_sporting_life_race.py`; `import_sporting_life_day.py`; `import_sporting_life_range.py` | Explicit main guards before operational execution, independent of caller working directory |
| Python Racing Post CLIs | `import_one_result.py`; `import_results_day.py`; `import_results_range.py` | Same explicit main guards |
| Other Python refresh CLIs | `refresh_sporting_life_race_result.py`, `refresh_today_runner_status.py`, `refresh_today_prices.py` | Same explicit main guards |
| Python range nesting | Ranges call day import functions directly, which share clients/importing routines; the outer main retains ownership across all days | No recursive main guard/function locking |
| `local-automation.ts collection/settlement --execute` | Readiness, retention and pin/evidence baseline, existing research workflow child, after-audit, terminal reporting | Existing wrapper `acquireLock` now delegates to common implementation and passes verified credentials |
| Both prepared LaunchAgents | Launch only `local-automation.ts` from the explicit project directory | Same lock via wrapper; templates untouched and disabled |
| `activate-prospective-epochs.ts`, holdout coverage backfill | Explicit maintenance writers, not ordinary scheduled work | Conservatively guarded by preload; neither was run or authorized for execution here |

Read-only racecard/status CLIs, other research pages, stored-ledger loaders, model
analysis/training scripts and backups do not perform operational racing acquisition or
prospective settlement. Saved-rule edits and post-race analyst review annotations have
separate semantics; they do not launch the enumerated workflows. They were not changed.

## Lock protocol

One canonical file: `~/Library/Logs/RacingAnalysis/workflow.lock`, retaining Stage A's
namespace. Atomic exclusive creation (`wx` / `O_EXCL`) elects the owner. Owner metadata
contains PID, process start identity, random token, timestamp and caller. Process identity
queries use fixed UTC/C locale and bounded native `ps` calls, avoiding locale/TZ mismatch.
Directory symlinks and lock-file symlinks/hardlinks are rejected or fail closed.

A nested child must present the matching random token **and** verify the live owner's
start identity **and** trace its own parent chain to that owner. The environment token
alone is insufficient. A joining child never removes the owner's lock. CLI processes
inherit credentials normally; web subprocess credentials use AsyncLocalStorage and are
never assigned to the shared web process environment. Independent requests explicitly
cannot join, even in the same web process.

Owner release verifies PID/start/token before unlinking. Normal CLI exit and exception
release ownership; web completion/failure uses `finally`. Parallel Today mutation groups
use `allSettled` before propagating failure so a failed sibling cannot release early.
The Bun CLI exit guard refuses release if immediate children remain alive. The wrapper
retains its stronger TERM/KILL process-group cleanup, including surviving descendants,
before release. No live-process lock is stolen.

Dead owner, unknown identity, partial metadata, legacy lock, abrupt termination or
SIGKILL remains **busy**, indefinitely. There is no TTL, PID-only deletion, automatic
recovery, automatic retry queue or evidence replay. Review owner, descendants and partial
writes before any future manual removal; no recovery/removal command was run here.
PID/start verification failure fails closed. Per-ledger locks and immutable validation
are retained; exclusion does not turn separate ledger commits into one transaction.

## Today and manual behavior

An active/broken lock does not wait or block stored-data viewing. Today reads stored
cards, rules, result state, active production/AW/Jump books, quotes and frozen companion
observations. It skips all TPR snapshots, imports, sync/capture/settlement and enrichment,
and shows a non-disruptive status message. Missing or mismatched V3 observations remain
unavailable; no new calculation replaces them. The existing multi-ledger V3 display fix
present at task start is retained.

The refresh action defers without operational reads/writes and revalidates the view.
Timewise save returns a typed busy result displayed by the existing form without
replacing its saved summary. There is no deferred background replay.

Supported Bun operational CLI commands run from the project root with project
`bunfig.toml` loaded. This allows pinned entry points and pinned `package.json` to remain
byte-identical. Explicit `summary` modes stay read-only. Busy commands print
`WORKFLOW_BUSY` and exit 75 **before the main workflow module loads**. Owner failures
release normally; ownership/child-cleanup failures retain the lock and report an error.
Python direct CLI guards apply even outside the project working directory.

This is cooperative exclusion for the supported project commands, not a security
sandbox: deliberately disabling Bun preloads, alternate runtimes, arbitrary imports of
library functions, or running pinned Bun scripts outside the project configuration are
outside the supported boundary. Do not use those paths operationally. Future operational
entry points must join this guard; new `track-*` files are covered conservatively.

## Files changed for Stage B

- New `src/lib/racing/operational-lock.ts`: common protocol, request scope, parallel drain.
- New `bunfig.toml` and `scripts/operational-preload.ts`: guard pinned Bun CLI entry points.
- New `scraper/scripts/operational_lock.py`; main guards in the ten Python CLI files listed above.
- `src/app/racing/today/page.tsx`, `actions.ts`, `timewise-comparison-form.tsx`:
  mutation gating, frozen read branch, busy outcomes.
- `src/lib/racing/today-result-refresh.ts`: request-local child credentials.
- `scripts/local-automation.ts`: delegates lock and propagates credentials, updates obsolete
  concurrency-readiness wording. Logging, retention, readiness, 90/45-minute timeouts,
  failure reporting and replay controls remain intact.
- New `scripts/operational-lock.test.ts`, `scripts/today-operational-exclusion.test.ts`.
- This report, `ops/concurrency/hash-audit.json` and updated `ops/launchd/README.md`.

Stage A files and the prior V3 display changes were already untracked/modified when this
task began. Their presence is not a new Stage B implementation claim. No plist changed.

## Validation and evidence audit

- **110 tests passed, 0 failed, across 9 targeted files**: contention, browser/CLI,
  CLI/wrapper in both ownership directions, verified nesting, copied-token rejection,
  identity/replacement/malformed locks, Python interoperability, crash retention,
  normal success/failure cleanup, parallel-failure draining, harmless process timeout,
  wrapper reporting/retention/replay and existing frozen V3 display behavior.
- Actual Today component rendered with database reads and every mutation mocked;
  busy rendering, refresh action and Timewise action performed zero mutations.
- Strict TypeScript and targeted ESLint passed. One intervening suite run stalled in mocked SSR; the isolated rerun and final complete rerun passed (110/110 in 7.34 seconds).
- Targeted configured Python Pyright: 0 errors, 0 warnings.
- Both disabled plist templates passed `plutil -lint`; existing tests assert `Disabled=true`.
- `assertEpochSources`: **ACTIVE**, all **141** manifest source pins match. All **5**
  original-evidence pins match. No pinned source, model, package manifest or lockfile edited.
- A task-start hash snapshot covered **582** existing source/research files. **580** still
  matched at audit. Two already-dirty live ledgers changed their byte hashes during the
  session: `data/research/tissue-generation-forward-2026-11.json` and
  `data/research/prospective-epochs-2026-11-11/hurdle-v3-shadow-v2.json`.
  First observed mtimes were 13:07:24 UTC; later writes were observed at 13:17:18–19 UTC. See `hash-audit.json` for exact hashes and final audit times. Both retain HEAD row counts (260 / 35),
  and semantic differences from HEAD are confined to runner `outcome` fields.
  They were dirty at entry; no content baseline was saved, so the exact during-session
  outcome delta and writer cannot be established from this audit. No validation command
  explicitly invoked live imports/captures/settlement. Neither ledger was edited,
  repaired, restored or rolled back by an editing command.
- Consequently **the claim that all 164 source/evidence hashes stayed unchanged cannot
  be certified**. Source-pin integrity passes, but the separate live-ledger drift remains
  an explicit review item. Do not conceal it by regenerating evidence or a baseline.
- No build/live route request was used as a probe, avoiding unintended route execution
  and changes to the already-running application. Static checks and mocked SSR cover this change.

## Remaining risks and decision

The code closes ordinary project-root CLI/web/wrapper overlap. A crash may require manual
lock review; independent companion commits can still leave gaps and must never be replayed.
The preload configuration must be present, and all pre-existing processes must be running
the guarded code before any future activation. Other arbitrary external callers and custom
runtime invocations are not controlled by a repository-only cooperative lock.

Collection/settlement ceilings remain conservative headroom rather than a measured SLA.
There was no live run, database check/change, performance trial or scheduler activation.
The unresolved live-ledger hash drift prevents certifying the strict unchanged-evidence
condition. **NO-GO for automation activation** until that drift and runtime acceptance are
reviewed and guarded runtime/configuration presence is confirmed in a separate step.
Stop here. No schedule is enabled, installed, bootstrapped, started, committed or deployed.
