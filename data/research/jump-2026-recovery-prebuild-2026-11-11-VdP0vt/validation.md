# 2026 Jump cache recovery: blocked before build

11 November 2026. Exploratory historical evidence only.

**No candidate was built. Do not accept or activate a candidate.** The mandatory source-integrity check failed: 209 old-cache rows across 25 races lack full-result source payloads. All 209 lack winning times; 204 have null result status and five are non-runners. The requested stop condition applies. No filtered or reduced-scope rebuild was attempted.

A later read-only reporting connection also returned ECONNREFUSED at 127.0.0.1:5432. Earlier successful audits are recorded below; final server availability could not be confirmed. No server was started and no connection configuration was modified.

## Database/source verification

The configured server initially responded as racing_analysis, role neilrowland, pg_is_in_recovery=false, with transaction_read_only=on. Expected courses, horses, jockeys, race_runners, races, source_imports and trainers tables were present. All audit connections explicitly used default_transaction_read_only=on.

All 33,004 old target IDs resolve to 3,368 races. Across 388,339 Sporting Life runners, there were zero orphan race/horse/course/non-null trainer/non-null jockey references and zero missing race datetimes or race/runner/horse source IDs. Earlier timed inputs for old target horses comprised 102,790 runner records across 20,137 races, with zero missing full-result payloads and zero inconsistent runner/race/horse/course source namespaces. This verifies stored availability for that queried population, not continuous historical completeness or original publication timestamps.

The builder's result source type is full-result-next-data. Precisely 209 target rows lack that payload and race_summary. They belong to 25 races dated 9 and 15 October. Prices are populated on those rows, but prices alone do not establish final SP or settled outcomes. There are 231 old target rows with missing winning time in total. Missing times are not automatically equivalent to missing target prior features; the existing logic excludes untimed prior inputs.

## Old versus candidate

| Measure | Existing cache | Candidate |
| --- | --- | --- |
| Runner rows | 33,004 | Not built |
| Races | 3,368 | Not built |
| Actual dates | 1 January–15 October 2026 | Not built |
| Manifest requested end | 31 December 2026 | Not built |
| Guard | jump_winning_time_guard_v1 | Required v2; absent |
| Current Jump compatibility | Rejected by guard requirement | Not assessed; absent |

Existing path: `data/research/backtest-cache/backtest_features_v4-sporting_life-jump-2026-01-01-2026-12-31`.

New isolated cache location: **none**. This report directory contains only reports. No existing cache, snapshot, application, database, model, rule, monitor or Today's Racing data was written.

Old schema/source versions: backtest_features_v4 / historical_target_metrics_v4. Calculation versions: jump_speed_v1, weight_performance_v1 and todays_rating_v1; manifest also carries aw_speed_v1 and turf_speed_v2. Current compatibility requires jump_winning_time_guard_v2_missing_minute and does not allow relabelling v1.

Measured old-cache identity checks: 0 duplicate feature runner IDs, 0 duplicate race/horse pairs, 0 duplicate outcome runner IDs and 0 feature/outcome positional identity mismatches. The three old cache files have matching SHA-256 hashes before and after report preparation, recorded in validation.json. No build was run at any point.

## Corrections, ratings and chronological construction

All ten registered correction source IDs, race dates and corrected winning times matched database values during the successful read-only audit. The registry version is jump_winning_time_corrections_v1. Five corrections are in 2026: Newcastle 904023, Navan 908530, Perth 925595, Ballinrobe 929076 and Hexham 941317. Five are in 2025 and can affect prior histories.

The existing Jump rating loader reads stored race winning times, which already contain these approved corrections. The registry preserves original/corrected values and independent-source references; the applied-repairs log records their prior application. No correction was applied in this task. The registry's authority names a temporary audit file; archival availability and fresh independent-source verification were not established here. Local registry/database agreement is not proof that every other source record is correct.

Current production guard v2 withholds suspect generic extreme times and likely missing-minute times. Its +60-second comparison is a diagnostic hypothesis, never a replacement time. Guard tests confirm null withheld ratings, preserved source values and no guessed repair. No new rating formula was introduced.

The existing historical builder buildBacktestFeatureCache accepts outputDir, though its stock CLI does not expose that option. The stock default-output command was not run. Historical target code restricts prior runs to raceDateTime strictly before the target; Jump ratings use context as of each prior run and exclude the rated race from guard peers. Existing chronology and dependent-rating tests passed. A coarse old-cache check found 0 latest-prior dates not earlier than target date. This is not a full reconstruction or publication-time lineage audit.

Speed, Performance, Today's Rating and eligible-coverage differences are **not measured** because no candidate exists. It is therefore not possible to confirm guard-only attribution. The live database extends to 11 November whereas the old snapshot was generated on 15 October; a future build must explicitly distinguish matched old-target guard effects from source/coverage changes. No new input scope was silently chosen.

## Price-band baseline

These are old-cache descriptive counts, **not recovered usable coverage**. Finite features mean old Best L3 Speed, Performance and Today's Rating simultaneously. They do not make the stale cache compatible or establish settlement eligibility. SP bands include returned stake. Some stored prices may come from racecards, especially the missing-result rows; their true final SP is unverified.

| Cached decimal SP | Old rows | All three finite old features | Cached winners |
| --- | ---: | ---: | ---: |
| (1,3] | 2794 | 2528 | 1090 |
| (3,6] | 6956 | 6378 | 1253 |
| (6,11] | 7225 | 6518 | 609 |
| (11,21] | 6439 | 5621 | 274 |
| >21 | 9535 | 6800 | 118 |
| Unknown/invalid | 55 | 40 | 0 |

Individual feature counts are in validation.json. Largest cached winning decimal SP: 301. All original stored SPs and returns remain unchanged and uncapped. No outsider return was removed, no return was recomputed and no strategy was evaluated. Candidate coverage by price band remains unavailable.

## Existing validation tests

85 passed, zero failed, across ten existing test files: backtest-cache, research-cache, research-holdout, historical-target-metrics, jump-winning-time-integrity, jump-missing-minute-integrity, jump-winning-time-production, jump-speed-rating, jump-performance-rating and todays-rating. Command: bun test followed by those src/lib/racing/*.test.ts paths. These validate existing compatibility, guard, chronological feature and dependent calculation behavior; they do not validate an absent candidate. No application changes required build/lint or Python typechecking.

## Research relevance and recommendation

A future compatible recovery could restore 2026 Jump rows to the existing filters workspace, historical Speed/Performance/Today's Rating comparisons, OR-relative research and pre-existing fixed rule/holdout evaluations. Existing subtype, handicap, field-size and SP-band breakdowns could gain 2026 coverage. Model/tissue evaluations remain conditional on their own complete inputs; this task cannot claim those would all become available. The filters workspace currently explicitly excludes this v1 cache. No strategy search, optimisation, model fitting, frozen-rule change or prospective-monitor change took place.

Recommendation: **do not accept now; no candidate exists**. A separately authorised source-recovery task must resolve or independently verify the 25 missing full-result records, and the configured database must be accessible again. Then repeat the full prebuild gate. A reduced-scope rebuild would require an explicit scope change; it was not assumed. Any eventual candidate still needs complete before/after rating attribution, eligible-runner/price-band coverage, source and settlement/field checks, chronological lineage review and separate approval before activation. All recovered 2026 evidence remains exploratory.

## Missing full-result race identities

| Date | Sporting Life race ID | Old cache rows |
| --- | --- | ---: |
| 2026-10-09 | 942540 | 7 |
| 2026-10-09 | 942545 | 11 |
| 2026-10-09 | 942765 | 6 |
| 2026-10-09 | 943053 | 10 |
| 2026-10-09 | 942539 | 10 |
| 2026-10-09 | 942762 | 9 |
| 2026-10-09 | 942544 | 15 |
| 2026-10-09 | 942542 | 11 |
| 2026-10-09 | 942768 | 14 |
| 2026-10-09 | 942767 | 9 |
| 2026-10-09 | 942764 | 9 |
| 2026-10-15 | 943578 | 4 |
| 2026-10-15 | 943575 | 9 |
| 2026-10-15 | 944162 | 8 |
| 2026-10-15 | 943572 | 4 |
| 2026-10-15 | 943577 | 9 |
| 2026-10-15 | 943573 | 10 |
| 2026-10-15 | 943570 | 9 |
| 2026-10-15 | 943571 | 6 |
| 2026-10-15 | 943569 | 7 |
| 2026-10-15 | 943574 | 6 |
| 2026-10-15 | 943568 | 6 |
| 2026-10-15 | 943567 | 7 |
| 2026-10-15 | 943576 | 9 |
| 2026-10-15 | 943566 | 4 |
