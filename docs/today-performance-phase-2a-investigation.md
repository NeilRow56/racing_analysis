# Today performance — Phase 2A investigation, 14 November 2026

The user chose **investigation and diagnostics only** after confirming that the Today loader, horse metrics, speed loaders and database factory are in the frozen source graph. All 141 source pins and frozen model fingerprints validate. Editing those implementations would invalidate that graph; no source pins were updated and no replacement production loader was introduced.

## Findings

`today_target_metrics_load` calls `getTargetRunnerMetricsForDate` in `src/lib/racing/horse-metrics.ts`. It reads targets, reads candidate horse histories once, and concurrently loads Jump as-of ratings, AW as-of ratings and Turf ratings. The expensive work is primarily **Turf surface extraction from imported historical JSON**, rather than repeated loading of the complete horse-history dataset.

The diagnostic recorded 44 SELECTs on the first loader pass and 39 on repeat. Neither pass repeated identical SQL with identical parameters. First/repeat counts:

| Query category | First | Repeat |
| --- | ---: | ---: |
| Horse history | 1 | 1 |
| Trainer history | 1 | 1 |
| Jockey history | 1 | 1 |
| Jump/AW speed targets | 2 | 2 |
| Jump speed context | 21 | 21 |
| AW speed context | 2 | 2 |
| Turf speed targets/context | 6 | 1 |
| Runner margins | 3 | 3 |
| Racecard rows | 1 | 1 |
| Other reads | 6 | 6 |
| Total | 44 | 39 |

Five Turf context reads disappear on repeat because the existing Turf context cache is warm. No cache was added or changed. Counts cover the loader, not all queries made by the Today page.

`turf-speed-ratings.ts` selects `raceResultSurface(source)` and invokes it again in `turfRaceCondition`. That helper performs a correlated lookup into `source_imports.payload`. The two largest context plans returned 7,618 and 6,380 rows and executed the surface subplans 7,618/7,623 and 6,380/6,537 times. Their serial EXPLAIN execution times were 5.941s and 5.668s in the classified run (6.071s and 5.206s in the earlier run). Each plan performs the surface extraction both for filtering and for output. The largest sorts used in-memory quicksort; their inclusive times largely reflect their input scans, not sorting alone.

The Turf target read also performs a surface lookup for every candidate runner before filtering to Turf in JavaScript: 3,288 subplan loops, even though multiple runners share races. This is a second source of repeated historical payload work. The serial EXPLAIN timings for all distinct Turf queries from both passes totalled 17.044s; this is **not** the concurrent page span or a measure to add to page timings. Jump context queries were numerous but their EXPLAIN execution times totalled only 0.174s in that run.

Trainer history returned 94,112 rows and used an external merge sort in the earlier plan. It remains secondary to the surface lookups. Trainer and jockey histories are each loaded once by Today; the separate `getHistoricalTargetRunnerMetrics` research loader is not the source of this Today span.

## Reuse, batching and correctness constraints

- The main horse history is loaded once, already grouped by horse for calculation. The family rating loaders retrieve overlapping identities/metadata, but Jump, AW and Turf have different context selection, family classification and cutoff rules. Identical-query request caching would have saved zero queries in these measured passes.
- Jump and AW process chronological batches of 500 rating targets sequentially. Each batch loads standard and same-day contexts concurrently, then may load extra peer standards. Batching across cutoffs requires preserving each historical run's context and peer inclusion rules. Broadly merging these reads is not supported by the measurements alone.
- Turf context loading precedes its runner-margin read. Those reads are independent once targets are known and could potentially overlap, but neither that orchestration nor a surface-query rewrite was changed because both are pinned.
- The main target loader already runs all three rating families concurrently. Today also runs trainer, jockey, going-form and historical-form loaders alongside target metrics.
- Going form and historical-form flags overlap horse identities but intentionally use different eligibility, fields and result filters. Going form includes prior first/second finishes without requiring a winning time; speed-history loading requires completed timing. Substituting the speed dataset would silently omit required form evidence.
- Race reconciliation/filtering happens before the metric and participant loads. Only displayed target runner IDs are requested. Non-runners are intentionally included so their historical data and frozen display positions remain available. The read-only profiler supplies no race filter, so all 36 reconciled races are displayed.
- All currently displayed family metrics, historical cutoffs, ratings, form evidence and coverage are required. No input was removed or deferred. Filtering histories only by today's family could discard cross-family metrics present in the existing output.

## Racecard query

`getRacecardRowsWhere` in `todays-racing.ts` contains four correlated payload subplans:

1. Surface lookup, preferring racecard data.
2. Race-stage lookup, preferring full-result data.
3. Ride JSON expansion for forecast odds.
4. The same ride JSON expansion for bookmaker quotes.

All four ran 352 times in the plan, once per runner. The earlier EXPLAIN took 0.936s; the classified run took 1.316s. Forecast/bookmaker `Function Scan` nodes repeated JSON expansion for every runner. Surface and stage additionally repeat payload lookup and preference sorting, even though each race shares those values. The final 352-row ordering used quicksort and is not the primary issue. The EXISTS predicate enforces imported-card/result eligibility and must be retained.

A future candidate is to select the two preferred payloads per race and extract both forecast and bookmaker data from a single matching ride. Surface and stage have **different preferences**, and missing payloads/ride matches and `LIMIT 1` semantics must remain equivalent. No rewritten query was tested, no equivalent-plan claim is made, and no schema or index changes were attempted. The existing surface helper explicitly warns that a broad JSON-filtering join can decompress unrelated payloads; a join rewrite needs actual plan verification.

## Reproducible diagnostics and equivalence

New command:

```sh
bun --env-file=.env.local scripts/diagnose-today-performance.ts --date=2026-11-14 --explain --page
```

The command forces PostgreSQL `default_transaction_read_only=on`, uses a read-only repeatable-read transaction for both loader passes, and never invokes collection, capture, scraping or settlement. It writes only to a newly created temporary directory. `--explain` performs additional serial SELECT-only EXPLAIN ANALYZE executions; these timings are not normal page timings. Plan summaries exclude SQL parameters, predicates and connection details. `--page` additionally renders the actual read-only Today page twice using its own read-only connections, outside the loader transaction. Full-page timings are deliberately excluded from the loader measurements.

To compare a future loader against a saved baseline:

```sh
bun --env-file=.env.local scripts/diagnose-today-performance.ts --date=2026-11-14 --compare=/path/to/first.json --page
```

Live stored data can change between runs; a mismatch must be investigated, never resolved by rewriting research evidence. For a future implementation comparison, retain a stable database snapshot or replay fixture. The current command provides a reproducible read-only output snapshot, not an offline database replay fixture.

Results:

- Five meetings, 36 races, 352 runners. Both first/repeat loader snapshots matched byte-for-byte. A second independent run also matched the initial saved loader snapshot using `--compare`.
- Loader SHA-256: `f8cdd0553cc832223e0c341b250099b4d8ff93994c0ff7a71de03ac7677ce495`.
- Exact comparison includes race/runner IDs, official ratings, all metric fields and speed coverage, trainer/jockey metrics, going/form flags, JPR-A scores/ranks/coverage, current odds/quotes, results and non-runner handling.
- Actual full-page HTML matched byte-for-byte between two read-only renders, including the attached Tissue/Value, frozen V2/V3 selections, displayed probabilities/prices and non-runner presentation available in the stored card. HTML SHA-256: `f1a255fb815a132bd60cd19e4c3898f2003174e2a61fe562a3d8eb59dca44ff6`.
- These are stability/evidence checks on unchanged production code, not before/after proof for an optimisation.

Temporary artifacts (not research ledgers):

- Initial loader snapshots and plans: `/var/folders/l7/nyzm7s3x5lngjr7yqbb4gryh0000gn/T/racing-phase2a-UO2gJ1/`.
- Classified plans, matching loader snapshots and full HTML: `/var/folders/l7/nyzm7s3x5lngjr7yqbb4gryh0000gn/T/racing-phase2a-v3S52C/`.

## Page measurements

Both runs used the existing command, a fresh Bun process, the same stored date, read-only page mode and PostgreSQL read-only connections. Regression tests were not running during either page measurement. Database/OS cache state was not reset, and the follow-up followed diagnostic reads. No production change occurred, so **no performance improvement is claimed**.

```sh
bun --env-file=.env.local scripts/profile-pages.tsx today
```

Seconds, first / repeat:

| Span | User's Phase 1 baseline | Initial Phase 2A measurement | Unchanged-code follow-up | Follow-up minus initial |
| --- | ---: | ---: | ---: | ---: |
| Total diagnostic page | 20.392 / 7.720 | 18.146 / 8.083 | 17.697 / 7.593 | -0.450 / -0.490 |
| getTodaysRacingData | 18.864 / 6.444 | 16.685 / 6.796 | 16.264 / 6.375 | -0.421 / -0.421 |
| Target metrics | 16.852 / 4.466 | 14.272 / 4.931 | 14.275 / 4.558 | +0.003 / -0.373 |
| Racecard rows | 1.989 / 1.964 | 2.387 / 1.850 | 1.968 / 1.804 | -0.418 / -0.046 |

Spans overlap/nest. These deltas are run-to-run variation, not optimisation gains. The diagnostic loader transaction serialises reads on one reserved connection, so its 23.090s / 10.225s timings are **not comparable** with the normal concurrent page command. Query counts above come from that dedicated loader diagnostic, not added instrumentation in the pinned production code.

Raw page logs: `/tmp/phase2a-before-network-profile.log` and `/tmp/phase2a-followup-profile.log`. The first sandbox-only attempt failed database access and was excluded.

## Validation and remaining limits

- 453 tests passed and seven failed across 35 separately executed loader/rating/display/profiling files. All targeted loader/rating, trainer/jockey, going/form, read-only CLI and operational-exclusion tests passed.
- The seven existing Today source-text assertions fail in six files: `hurdle-model-comparison.test.tsx`, `chase-shadow-badges.test.tsx`, `context-weight-shadow-badge.test.tsx`, `page.test.ts` (two assertions), `tissue-ranks.test.tsx`, and `non-red-tissue-daily-list.test.tsx`. They expect direct-call/source arrangements changed by pre-existing Phase 1 instrumentation. Neither those tests nor the production files they inspect were changed here. Detailed output: `/tmp/phase2a-isolated-tests.log`; file summary: `/tmp/phase2a-isolated-tests-summary.log`.
- 13 shared-lock fixture tests passed with process inspection available. An initial sandboxed run could not verify `/bin/ps` process identity. Broad multi-file Bun runs also produced Bun 1.3.5 `node:test` nesting errors after failures; the counts above use isolated file runs instead.
- One new diagnostic regression test passed: forced read-only connection/transaction, request scope, exact-query counts, SELECT-only plan invocation, matching loader/page snapshots and connection cleanup. Total final isolated results: **467 passed, seven existing failures**.
- `bun run typecheck`, targeted ESLint and `git diff --check` passed.
- `bun scripts/validate-performance-pins.ts` passed: 141 source pins, dependency graph and frozen model fingerprints unchanged.
- No Python code was changed. No build was necessary for diagnostic-only additions.

Remaining bottlenecks are historical Turf surface extraction, racecard payload/ride extraction, and secondary participant-history reads. Stage B activation readiness is unchanged: this work identifies costs and preserves evidence but does not implement a speedup or clear the existing display-test failures. No schedule was activated, no operational workflow was executed, no database record/schema or frozen evidence was changed, and no commit/deployment was made. Forward Value Phase 2B was not started.

Files added by this task only:

- `scripts/diagnose-today-performance.ts`
- `scripts/diagnose-today-performance.test.ts`
- `docs/today-performance-phase-2a-investigation.md`

All pre-existing working-tree changes were retained.
