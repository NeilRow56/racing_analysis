# Isolated 2026 Jump candidate — qualified exploratory validation

**Built; not activated. Recommendation: withhold unfiltered Research Filters release.** Technical reconstruction passes, but historical source gaps and original publication/context lineage prevent unrestricted research-readiness or holdout claims. A separately approved exploratory integration could use the conservative eligibility sidecar; it must not silently consume the raw cache.

## A–D. Location, scope, database and compatibility

Candidate: `data/research/jump-2026-isolated-candidate-2026-11-11-vKE4Te/cache/backtest_features_v4-sporting_life-jump-2026-01-01-2026-10-14`.

The existing `buildBacktestFeatureCache` was called with an explicit isolated `outputDir`, in a **repeatable-read, read-only transaction**. Its default paths and application code were not edited. Build duration: 149.5 seconds; generated at `2026-11-11T16:56:04.829Z`. The output location was absent before this one build; no existing candidate/cache was overwritten.

Scope is **inclusive racing dates 1 January–14 October 2026**. Actual target timestamps are `2026-01-01T11:49:00.000Z` to `2026-10-14T16:13:00.000Z`. Historical priors remain strictly earlier than each target; rating contexts retain the existing per-run cutoffs and target-exclusion rules.

| Coverage | Original | Candidate |
| --- | ---: | ---: |
| Runner records | 33,004 | 32,901 |
| Races | 3,368 | 3,353 |
| Actual end date | 15 October | 14 October |
| Three finite Best L3 fields | 27,795 within candidate dates | 27,789 |
| Guard | V1, currently incompatible | `jump_winning_time_guard_v2_missing_minute` |

All **32,901 original scoped identities** are retained: no new or silently removed matching observations, duplicate runner IDs, duplicate race/horse pairs, or feature/outcome identity mismatches. The period removes 103 rows/15 races, including the 98 unresolved rows/14 races. The broader preflight metadata heuristic also identified three graded I.N.H. Flat races (27 rows), outside the existing builder's SQL target-family universe; these were never in the original scoped cache. That existing universe was not changed.

The configured `racing_analysis` database at `127.0.0.1:5432` was accessed through the existing host configuration, with read-only startup/session enforcement. The same Postgres.app server remained running. No service/configuration changes or task database writes occurred. Sandboxed access intermittently failed with ECONNREFUSED; host access succeeded.

**Prebuild source checks passed:** all 11 recovered races/111 runners match committed recovered fields; each new full-result database payload exactly equals its retained local payload, whose original SHA-256 verifies. All ten authoritative correction registry values match stored dates and winning times. No missing minute was guessed and the guard was never disabled. Every candidate target has full-result provenance; no timed prior in the audited horse population lacks full-result provenance. All 98 unresolved identities were freshly checked: null results/times, no full-result import, all dated 15 October. Exact identities and counts are in `unresolved-current-database.json` and `unresolved-races.csv`.

The candidate passes the existing compatibility validator and isolated cache reader: `backtest_features_v4`, `historical_target_metrics_v4`, required guard V2, and current Speed/Performance/Today's Rating calculation versions. Outcomes carry the separately recorded `canonical_settlement_v3` basis. `candidate-provenance.json` records 612 unchanged code/configuration/correction hashes, existing cache hashes, candidate hashes and database snapshots.

## E. Rating reconstruction and differences

An independent pass recomputed **83,338 prior ratings** using the unchanged production guard, then rebuilt all 15 audited Speed/Performance/Today's Rating aggregates for every target. **Zero aggregate mismatches and zero cutoff violations.** This validates reconstruction against current stored inputs, not original publication-time availability.

**333 of 32,901 rows** differ in at least one audited rating field; 32,568 match to a tolerance of 1e-8. Representative differences:

| Field | Changed rows | Finite → missing | Largest finite absolute change |
| --- | ---: | ---: | ---: |
| latestSpeedRating | 161 | 1 | 155.6120 |
| bestSpeedLast3 | 128 | 6 | 104.8438 |
| latestPerformanceRating | 161 | 1 | 151.6707 |
| bestPerformanceLast3 | 128 | 6 | 124.0418 |
| latestTodaysRating | 161 | 1 | 151.6707 |
| bestTodaysRatingLast3 | 128 | 6 | 124.0418 |

Direct-prior screening alone was insufficient. Re-evaluating historical guard contexts at each contributing prior's cutoff traced **328 changed rows through V2 guard/standard/meeting-context paths and five through recovered-result paths**; none remains without an identified dependency path. The investigation audited 1,262 contributing race contexts, identifying 24 relevant dynamically flagged races. These paths establish causal possibility, not exclusive numerical counterfactuals: the original cache does not retain every per-rating context hash. No V1 override or guessed time was used. Full row/field deltas and dependency paths are retained in `rating-comparison.json` and `difference-investigation.json`.

Reference coverage means V3-settleable, valid-SP observations with all three Best L3 ratings finite, without strategy thresholds. Old outcome evidence was identity-annotated **in memory** by the existing adapter; original prices, positions and features were retained. Coverage changes from **25,166 to 25,251**: 90 gain eligibility and five lose it. This is a data/feature coverage comparison, not a strategy-performance result.

## F. Missing data and dependency exclusions

The date cutoff does **not** establish complete history. The broad preflight inventory found 357 untimed horse records across 72 races, including NRs, voids and non-final payloads. Actual earlier-run dependency checks identify:

- **22 completed untimed run records across eight races**, affecting 110 later target rows: 792271 (Taunton, 2024-04-11, 6 relevant records); 828496 (Exeter, 2024-11-08, 1 relevant records); 830739 (Catterick, 2024-11-22, 1 relevant records); 871677 (Galway, 2025-08-03, 6 relevant records); 875397 (Cartmel, 2025-08-25, 5 relevant records); 888683 (Kempton, 2025-11-10, 1 relevant records); 913485 (Warwick, 2026-04-23, 1 relevant records); 916506 (Hereford, 2026-05-12, 1 relevant records).
- **252 uncertain historical records across 43 races**, affecting 886 target rows. Non-final/pre-race evidence is not converted into completed starts or losses.
- **76 targets** have omitted untimed records in a conservative last-three window. Some are uncertain starts; this is not a claim that all occurred.
- Broad, deliberately conservative course/standard/meeting-context screening flags 13,824 rows' L3 contexts and 16,167 rows' wider prior contexts. These are upper-bound potential exposures, not proven bad ratings. Reasons overlap.
- The candidate itself contains **22 untimed target records** in Warwick 913485, Hereford 916506 and void Uttoxeter 929549. A target's missing current-race time is distinguished from missing pre-race features.

**All raw observations remain in the candidate.** `eligibility.ndjson` records per-runner reasons and contributing IDs; no data was fabricated, repaired, silently dropped, or supplied from older rated runs to alter the frozen window. The builder's existing omission of untimed priors remains visible rather than being called complete history.

There are **5,112 rows missing the three Best L3 fields**, 25,251 reference-eligible rows and **10,661 strictly screened usable observations**. The screen excludes 14,590 otherwise reference-eligible rows for known/uncertain/context dependencies. A less restrictive L3-only screen yields 12,772, but is not recommended as a substitute for full dependency review. These are validation subsets; no research selection definitions were changed.

## G. Historical decimal SP coverage

Counts are runner observations, not discovered strategy selections. “Reference” requires V3 settlement and all three finite Best L3 fields; “strict” adds the conservative dependency screen. Winners are winner records, including fractional-stake dead-heat settlements. Exclusions include outcome, feature and dependency reasons; no price-based strategy filter was applied.

| Decimal SP | All records | Reference usable / winners | Strict usable / winners | Excluded from strict |
| --- | ---: | ---: | ---: | ---: |
| (1,3] | 2,779 | 2,375 / 983 | 742 / 316 | 2,037 |
| (3,6] | 6,928 | 5,878 / 1,172 | 1,972 / 370 | 4,956 |
| (6,11] | 7,201 | 5,863 / 552 | 2,401 / 218 | 4,800 |
| (11,21] | 6,420 | 4,925 / 247 | 2,302 / 121 | 4,118 |
| >21 | 9,518 | 6,210 / 90 | 3,244 / 36 | 6,274 |
| unknown/invalid | 55 | 0 / 0 | 0 / 0 | 55 |

All 118 settled winners above SP 21 remain represented; the largest is **301** (Crokes Cross), with uncapped gross return **£301 per £1**. Historical SP is settlement/retrospective evidence only. No strategy search, threshold optimisation, model fitting or profitability ranking was performed.

## H–I. Settlement, tests and evidence preservation

Canonical V3 validation identifies **29,856 settleable observations**, **3,036 genuine NRs**, **nine void observations**, **zero unresolved candidate outcomes**, **4,784 started non-finisher losses**, and **six dead-heat winner records**. Void/NR/unresolved cases have no settlement stake. Uttoxeter's source `RACEVOID` is respected despite its database runner status `other`. Dead heats use SP/divisor gross returns; legitimate long-price returns remain uncapped. Only pure in-memory settlement helpers ran—no operational settlement or ledger writer was invoked.

**122 existing tests passed, zero failed**, across 13 cache, chronology, missing-minute, rating and settlement suites (`regression-tests.log`). Strict TypeScript, targeted ESLint and diff checks passed. No application source or Python files were changed; no production build, ingestion, model training or Research Filters activation was run.

The full preservation baseline covers **42,802 existing files**. **42,800 remain byte-exact**, including all original caches, raw historical evidence, models, rules, application code and **all 15 files of the newly activated prospective epochs**. Their 141 source/artifact pins also verify.

Two existing mutable ledgers changed concurrently: Context Weight Shadow and Tissue Generation each gained 17 outcomes. Removing **only those newly timed outcomes in memory** reconstructs the exact untouched starting SHA-256 for both files. Hash-verified starting bytes and observed current bytes are retained; captures, prices, model inputs, identities, record counts and previously stored outcomes are unchanged. No live file was restored or rewritten by this task.

The database-wide preservation check likewise correctly failed and its failure is retained. Concurrent external activity updated race **948031 on 11 November**, 17 runners, and added one full-result import at 16:56:28 UTC. Timestamp/identity queries found **zero historical race, runner or source changes through 15 October**; the four saved rules/snapshots retain their exact full-row digest. All task connections were read-only; the external process was not identified. This is a documented exception to global byte/digest equality, not a replaced baseline or claim that no external writes occurred.

## J–K. Readiness and recommendation

Compatible reconstructed 2026 inputs could technically support existing fixed Speed, Performance, Today's Rating, OR-relative, Best L3, subtype/handicap/field-size and price-coverage evaluations. Each remains conditional on its required inputs and explicit exclusions. No evaluation was run, and tissue/model eligibility is not inferred.

**Partial/qualified validation only. Withhold approval of the raw candidate for unrestricted Research Filters use.** If separately approved, a dedicated exploratory integration could expose the **10,661 strictly screened rows with the full sidecar and provenance warnings**. It would need to show exclusions, maintain complete field/rank context for any rule that uses rankings, and preserve the original cache. The broad context screen is conservative and original publication-time lineage is incomplete; it cannot certify an untouched holdout or guarantee unobserved history completeness. The reconstructed 2026 data must always be labelled exploratory. No automatic activation or live-default change has occurred.
