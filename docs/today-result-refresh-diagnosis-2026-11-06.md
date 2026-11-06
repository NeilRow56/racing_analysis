# Today result refresh diagnosis — 6 November 2026

## Root cause

`getEligibleResultRefreshRaces` required at least one runner with a frozen saved-rule match. That restricted automatic and manual result imports to rule-selection races, although Today displays all races. It was not a publication-delay, results-index, retry, cache, or status-update problem in the reported comparison.

Diagnosis was performed before changing behaviour. Read-only PostgreSQL queries and the existing Today loader with the same frozen-rule/trainer-cohort matching as the page established:

| Hexham race | Source ID | Off (GMT) | Time threshold | Frozen matches | Initial database result |
| --- | --- | --- | --- | --- | --- |
| Mares' Novices' Hurdle | 947282 | 13:00 | 13:10 | None | No winning time, winner, or full-result import |
| Handicap Chase | 947283 | 13:35 | 13:45 | Chases - 2026 non summer | Full result committed at 14:17:30.778 GMT, one winner |

The 13:00 race could never pass the old selection gate, even hours after the time threshold or on forced manual retry. The 13:35 race passed it and imported successfully. Each full-result URL was fetched once read-only during diagnosis; both passed the Python importer's completeness checks. This proves availability at diagnosis time, not their original publication times.

## Request, import and display flow

1. Today loads current racecards/results directly from PostgreSQL, then attaches saved-rule matches.
2. Refresh considers only today's date, excludes conclusive results, requires a source ID, and waits until scheduled off plus ten minutes. Previously it also required a frozen-rule selection.
3. Each attempted race is throttled for fifteen minutes in the server process. The refresh calls the Python single-result importer directly with a generated full-result URL. **No results-index request is made.**
4. Python checks matching source ID, winning time, all runner outcomes, a winner, and SPs for participating runners. Incomplete payloads return `not_ready`; temporary request errors return `failed` for that attempt. Neither outcome is persisted as a permanent exclusion.
5. Complete results are written to the raw archive, then upserted into PostgreSQL in a committed transaction. `imported` is reported only after commit. Database failures do not report success.
6. After any successful import, the page calls `getTodaysRacingData` again and reattaches rule matches before rendering. `todayRaceHasConclusiveResult` derives completion from stored result fields; there is no separate stored Today status flag to update. It produces `Race over`, and the winner component uses stored position 1 to render `WINNER`.

## Completed-race trace after the fix

The running development app picked up the source edit and its next Today refresh reported:

```text
TODAY_RESULT_REFRESH date=2026-11-06 total_races=36 scheduled_to_have_finished=10 already_settled=2 eligible=8 attempted=8 imported=8 still_unavailable=0 failed=0
```

These are the ten races past the refresh threshold at that visit. Times below are GMT, from PostgreSQL rather than the development log's timestamp prefix. For the eight new imports, a successful commit establishes that the full result was requested, available, and accepted. No results index was checked for any of them.

| Course | Source ID | Scheduled off | Time threshold | Result committed | Refresh outcome |
| --- | --- | --- | --- | --- | --- |
| Hexham | 947281 | 12:25 | 12:35 | 14:23:55.633 | Imported after fix |
| Aintree | 947288 | 12:40 | 12:50 | 14:23:53.003 | Imported after fix |
| Fontwell | 947275 | 12:50 | 13:00 | 14:23:54.075 | Imported after fix |
| Hexham | 947282 | 13:00 | 13:10 | 14:23:56.131 | Imported after fix |
| Aintree | 947289 | 13:15 | 13:25 | 13:34:17.997 | Already imported; not reimported |
| Fontwell | 947276 | 13:25 | 13:35 | 14:23:54.605 | Imported after fix |
| Hexham | 947283 | 13:35 | 13:45 | 14:17:30.778 | Already imported; not reimported |
| Aintree | 947290 | 13:50 | 14:00 | 14:23:53.571 | Imported after fix |
| Fontwell | 947277 | 14:00 | 14:10 | 14:23:55.123 | Imported after fix |
| Hexham | 947284 | 14:10 | 14:20 | 14:23:56.653 | Imported after fix |

The remaining 26 scheduled races were not yet past their refresh thresholds at that visit. They were not probed for results during diagnosis.

After the app's refresh, a fresh read through the actual Today loader confirmed:

| Race | Conclusive | Status | Winner |
| --- | --- | --- | --- |
| Hexham 13:00 | true | Race over | Kamille Au Kanada |
| Hexham 13:35 | true | Race over | Defence Witness |

## Fix required: YES

Removed only the frozen-rule eligibility requirement and its unused helper. Races without rule selections now use the same refresh path as selected races. No model, value, tissue, or research-history logic was changed. The already modified research ledger in the working tree was not edited by this patch.

## Retry behaviour

The existing ten-minute buffer and fifteen-minute per-source-race automatic retry interval remain unchanged. Both `not_ready` and temporary failures become eligible again after the interval. Successful conclusive results stop further imports. The existing cutoff is the end of the local racing date; this patch adds no background polling or requests for historical dates. Manual refresh retains its existing throttle bypass.

Abandoned/void races without a conclusive result still use the existing same-day retry cutoff; there is no independent terminal race-status field in the current Today type. This patch does not introduce cancellation detection.

## Cache invalidation

No cache fix was needed. Today is `force-dynamic`, its loader is uncached, and it rereads PostgreSQL within the same render after an import. The manual action also revalidates `/racing/today`. The research database and derived-report cache keys include table counts and maximum `updated_at` values; result upserts update these timestamps. No Next.js restart is needed. File-backed research settlement continues through its existing workflow.

## Files changed and validation

- `src/lib/racing/today-result-refresh.ts`: remove selection-only gate.
- `src/lib/racing/today-result-refresh.test.ts`: cover no-selection eligibility, no premature import, unavailable then successful retry, both forms of temporary failure, automatic status/winner display, settled-race suppression, and existing page reload/manual revalidation wiring.
- This report.

Validation passed: 42 tests across Today refresh, winner rendering, research cache, and read-only result-surface SQL fixtures; TypeScript typecheck; targeted ESLint. The initial test invocation omitted the database environment and failed the SQL fixture; rerunning with `.env.local` and local database access passed all 42. Cache wiring is checked structurally; the live loader/database checks above separately verify real result state after the running app imported it.
