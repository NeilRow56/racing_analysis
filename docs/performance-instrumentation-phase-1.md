# Performance instrumentation — Phase 1

Implemented on 14 November 2026. Instrumentation only: no optimisation, new cache, changed loading order, workflow restructuring, schedule activation, commit or deployment. Pre-existing working-tree changes were retained.

## Enable and disable

`RACING_PROFILE=1` enables server diagnostics for Today and Forward Value. `RESEARCH_PROFILE=1` remains a supported alias. Only the exact value `1` enables profiling; unset both flags or set both to `0` to disable it. Restart a running Next process after changing its environment.

Ordinary page profiling preserves ordinary operational behaviour. It does **not** make Today read-only. Use the diagnostic commands below for safe measurement. Disabled profiling emits no new timing logs and bypasses span allocation, clocks and request-ID creation; existing application logs remain unchanged.

## Safe measurement procedure

From the project root, with existing database configuration:

```sh
bun --env-file=.env.local scripts/profile-pages.tsx today
bun --env-file=.env.local scripts/profile-pages.tsx forward-value
bun --env-file=.env.local scripts/profile-pages.tsx forward-value --archive
```

Optional Today date: `--date=2026-11-14`. The existing `scripts/profile-forward-value.tsx` command now delegates to this same safe profiler; its optional `--verify-results` projection parity check remains available and read-only.

Each command forces profiling on and performs first and repeat passes with distinct request IDs. Run a fresh process for another first pass. Preserve the JSON lines from server stdout. Use the same stored data and machine load when comparing runs; note that PostgreSQL and OS caches may already be warm. Existing Forward Value process caches are retained without alteration.

The CLI forces a request-local diagnostic scope. Today enters its existing stored-data branch directly, without attempting lock acquisition. Snapshot writes, result refresh/import, production sync, capture and companion settlement are unreachable through that branch. Every new PostgreSQL connection receives `options=-c default_transaction_read_only=on`, replacing any URL options. The CLI renders to a server stream and waits for deferred components before finishing. There is no diagnostic HTTP route or query parameter, and no form actions are submitted. CLI failures suppress underlying error details.

Do not navigate to ordinary Today or submit refresh forms as part of this procedure. Leave both LaunchAgents disabled. The command does not start Next, activate schedules, collect data, settle observations or write research artifacts. It was tested with mocked pages/connections; **these real-data CLI commands were not executed during this task**.

## Output and interpretation

Illustrative output only; these are not measured production durations:

```json
{"type":"racing_profile","requestId":"example-request","operation":"loadHurdleV3Shadow","durationMs":217.42,"status":"ok","spanId":8,"parentSpanId":5,"occurrence":1,"repeated":false}
{"type":"racing_profile","requestId":"example-request","operation":"loadHurdleV3Shadow","durationMs":230.11,"status":"ok","spanId":10,"parentSpanId":6,"occurrence":2,"repeated":true}
{"type":"racing_profile","requestId":"example-request","operation":"results.import","durationMs":15.3,"status":"error","spanId":12,"parentSpanId":11,"occurrence":1,"repeated":false}
```

Rows contain request ID, operation, milliseconds and status. Span rows also have unique IDs and a parent ID when nested; callback/event rows can omit a span ID. `occurrence` counts completed calls of the same operation in the request; `repeated` flags the second and later completions. Different operations or distinct epoch/original ledgers are not duplicates merely because their implementations match. Durations are inclusive, concurrent spans overlap, and parent/child durations must not be added together. No SQL text, arguments, exception messages, lock credentials or connection identities are logged by the profiler.

Deferred monitor work explicitly carries its page's context after page-data preparation returns. Consequently a page-data parent may finish before a monitor row appears. The CLI's outer diagnostic request and `server_render` span include stream completion. Logging failures cannot replace application results or errors.

Status `ok` means the function returned. A monitor that deliberately catches a reader failure can return fallback UI successfully; its nested reader span still records `error`. Result imports also emit a zero-duration `results.import_outcome` event carrying the existing returned outcome, so a returned failure is distinguishable from a thrown error. `shared_lock.access` is a zero-duration acquired/busy event, separate from acquisition duration.

## Coverage

| Area | Measurements |
| --- | --- |
| Shared exclusion | `shared_lock.acquire`, acquired/busy event, `shared_lock.ownership` through lease release, including failure |
| Initial Today data | `getTodaysRacingData`, existing index/racecard/freshness/reconciliation/filter timing callbacks |
| Historical retrieval and runner metrics | Existing target, trainer, jockey, going-form and historical-form callback stages; trainer-cohort calls separately counted |
| Runner rating/grouping | `today.runner_rating_and_grouping_tail`, explicitly marked `estimated`: time from the final successful loader callback to return, including Promise continuation overhead |
| Today operations | Rating snapshot writes, refresh checks, each result import/outcome, production generation or legacy AW/Jump sync, companion comparison sync and tracker settlement |
| Today stored ledgers/display | Tracker, Market Edge/Value cohorts through `loadAllTissueValue`, generation, original/epoch Hurdle Shadow read/validation, Chase and context shadows, current-price overlay, final watch-list and page preparation |
| Forward Value data | Existing individual dataset loader spans, filesystem identity, DB modification identity, card/result/price projections, existing cache boundaries |
| Research monitors | Deferred epoch, positive/neutral, Shadow, Market Edge, Low Form, Early Turf, Value and OR/Speed monitors; individual shared Shadow/generation reader calls in unpinned display adapters |
| Reporting/archive | Prospective sources, reporting scope, dashboard, summaries, disagreement/probability diagnostics, observation filtering, archive sections, Value projection and final page preparation |

Real stored-ledger parity tests confirm that the sampled Forward Value monitors read the original Hurdle Shadow ledger three times and production generation twice in one request. The epoch report additionally reads historical/current ledgers internally. Today conditionally loads its complete racecard data again after a successful result import. Trainer-cohort lookups can repeat across saved rules. These observations identify existing work; no calls have been removed or coalesced.

Frozen sources are unchanged. Metric-loader spans include their internal queries and calculations; they do not split every SQL statement from CPU work. The rating/grouping tail is an estimate, not a pure CPU measurement. The source-pinned epoch report and sync/settlement implementations have inclusive boundary timings rather than exhaustive internal spans. Duplicate counts therefore cover the instrumented boundaries, not every nested filesystem read. Cached loaders that do not execute on a repeat pass have no new inner span.

## Validation

- 87 targeted tests passed across nine files: flags, disabled parity, correlation/concurrent requests, nested/deferred spans, unique span IDs, duplicates, error identity, logging failure, callback forwarding, CLI read-only database options, actual Today mutation exclusion, result-refresh rules, real monitor HTML parity, reporting/archive rendering and existing cache behaviour.
- 13 operational-lock fixture tests passed with profiling disabled and again with `RACING_PROFILE=1`: busy exclusion, inherited ownership, sibling completion before release, failures/timeouts, request-local credentials, Python/Bun interoperability and CLI preload guards. These needed sandbox escalation because process identity checks use `/bin/ps`.
- `bun run typecheck`: passed.
- Targeted ESLint over all changed TypeScript/TSX files: passed.
- `bun scripts/validate-performance-pins.ts`: all 141 source hashes, dependency edges and frozen model fingerprints match the epoch manifest.
- `git diff --check`: passed.
- No Python files were changed by this task. No live operational page requests or database writes were made.

## Remaining Stage B risks and limits

The read-only CLI deliberately omits operational refresh, capture, sync and settlement. It cannot establish their real latency or validate their external side effects. Their spans are ready for later explicitly authorised observation; fixture timings are not representative operational timings.

Today still holds its operational lease during read-only preparation. An available-lock Today request can still import results, write snapshots, synchronise prospective generation and settle companion ledgers. Those behaviours, retry rules and exclusion remain unchanged. No multi-second lock regression has been established. PostgreSQL/OS cache warmth and Next's development rendering can make CLI timing differ from browser timing. Full Stage B readiness and the causes of the reported 45.612s/9.972s/9.424s timings remain unproven until representative, appropriately scoped measurements are collected. Both schedules remain disabled.

## Files changed by this task

Pre-existing changes in the working tree are not part of this inventory. Some listed files already contained user changes, which were preserved.

- `src/lib/racing/performance-profile.ts`
- `src/lib/racing/performance-profile.test.ts`
- `src/lib/racing/today-performance.ts`
- `src/lib/racing/today-performance.test.ts`
- `src/lib/racing/profiled-monitor-readers.ts`
- `src/lib/racing/research-profile.ts`
- `src/lib/racing/operational-lock.ts`
- `src/lib/racing/today-result-refresh.ts`
- `src/lib/racing/today-result-refresh.test.ts`
- `src/app/racing/today/page.tsx`
- `src/app/racing/today/hurdle-shadow-display.ts`
- `src/app/racing/research/forward-value/forward-value-page.tsx`
- `src/app/racing/research/forward-value/profiled-server-work.tsx`
- `src/app/racing/research/forward-value/profiled-server-work.test.tsx`
- `src/app/racing/research/forward-value/hurdle-v3-shadow-monitor.tsx`
- `src/app/racing/research/forward-value/hurdle-v3-market-edge-monitor.tsx`
- `src/app/racing/research/forward-value/hurdle-low-form-monitor.tsx`
- `src/app/racing/research/forward-value/tissue-positive-neutral-monitor.tsx`
- `src/app/racing/research/forward-value/turf-early-season-monitor.tsx`
- `src/app/racing/research/forward-value/or-speed-monitoring.test.tsx`
- `scripts/profile-pages.tsx`
- `scripts/profile-pages.test.ts`
- `scripts/profile-forward-value.tsx`
- `scripts/validate-performance-pins.ts`
- `scripts/today-operational-exclusion.test.ts`
- `scripts/operational-lock.test.ts`
- `docs/performance-instrumentation-phase-1.md`
