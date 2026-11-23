# Retrospective racing market discovery

## A. Executive conclusion

The study found one profitable rule in 2025 and no repeatable betting advantage. The rule selected Chase runners in the top three on best last-three Jump speed after 61–120 days off. Its 2025 profit turned negative after removing the two biggest winning races. The unchanged rule lost money in all three full replay quarters of 2026, with a lower strike rate and shorter returns on its winning selections.

The market was substantially stronger than the form-only probability model in every family. Adding form or boosted stumps to final-SP probabilities produced marginal, inconsistent changes. Rescaling the market probabilities alone produced the clearest improvement in probability quality, especially in Turf. It preserved the market ranking and left favourite returns unchanged. The distinction matters for this study because the market-derived scores use final SP as a retrospective benchmark.

The largest ROI among the four 2025 finalists was **CHASE R08 (Speed top 3 and layoff 61–120), 10.39% from 395 priced selections**. The same frozen rule replayed at **-38.99% from 349 stakes** in previously explored 2026. Canonical market A/E was 1.163 and 0.834. Across the full 72-rule search, including rules below the finalist evidence floor, the raw best was CHASE R08 at 10.39% from 395 stakes. 1 of 72 candidates recorded positive 2025 P/L.

## B. Data coverage and provenance

The live local PostgreSQL endpoint refused the read-only connection. The study reads the existing Sporting Life database exports, pinned isolated 2026 Jump cache, and local source result payloads. The current SQL schema and historical feature builder provide the field inventory. There was no rebuild, network scrape, live database write or data backfill.

| Provenance | Available evidence and treatment |
| --- | --- |
| A. Proven pre-off | Latest accepted November Tissue generation books freeze scheduled off, capture timestamp, input vectors, model/version, and complete captured median-bookmaker quotes. The loader verifies capture before scheduled off and feature cutoff before capture. Eligible captures are shown separately. |
| B. Reconstructed before target | Cached date and scheduled time, family/type, course, class, distance, going, declared count, handicap classification, age, weight, official rating, prior speed and Performance Rating, prior runs, layoff and official-rating change. Prior numerical form requires a latest run date strictly before the target calendar date. Within-race ranks are derived among eventual starters and may differ from pre-off ranks. Declarations and provider publication time lack complete historical snapshots. |
| B. Participant history | Trainer and jockey rates are reconstructed from earlier scheduled races. Earlier races on the same date can contribute. Their actual publication times are unavailable, so these rules have greater timing risk. The fitted models exclude both participant rates. |
| C. Post-race | Final SP, finishing position, non-finisher code, winning time, true starter count and final outcomes. Settlement and starter completeness use these fields. Only the explicit market-offset and temperature diagnostics condition on normalized final SP, which is a retrospective baseline and cannot establish a deployable strategy. Absolute actual field size, target result, winning time and final SP do not enter standalone selection features or simple rules. |
| D. Missing or unreliable | No comparable earlier pre-off market book or timestamped Tissue vector history across the four families. Course/class/going exist but are reconstructed. Prior class movement lacks a consistently pinned as-of input in these exports, so the rules use a drop in official rating as a separate, available dimension. Raw result pages may contain future entries or embedded histories, which are excluded entirely. |

The 2025 caches use v4 historical features. 2026 Chase and Hurdle use the isolated Jump cache to 14 October with independent full-result identity proof and the updated time guard. Other races require a unique local final-result match by date, normalized course and race name, one-to-one whole horse roster, distinct provider ride IDs, agreement on places and non-runners, and starter total equal to the source result. Result-only evidence is attached in memory. This offline join lacks the source-ID bridge available for isolated Jump. Unresolved and void races, duplicate or unproved joins, one-runner fields and inconsistent dead heats are excluded. The canonical dead-heat divisor determines gross return. Market probabilities are normalized inverse prices over the complete verified starter field.

| Year | Family | Exported races | Exported runner records | Proved races | Excluded races | Coverage |
| --- | --- | --- | --- | --- | --- | --- |
| 2025 | HURDLE | 2911 | 30820 | 2891 | 20 | 2025-01-01 through 2025-12-31 |
| 2025 | CHASE | 1707 | 14349 | 1688 | 19 | 2025-01-01 through 2025-12-31 |
| 2025 | AW | 3104 | 30633 | 3078 | 26 | 2025-01-01 through 2025-12-31 |
| 2025 | TURF | 4740 | 48657 | 4720 | 20 | 2025-02-03 through 2025-11-08 |
| 2026 | HURDLE | 2032 | 21852 | 2031 | 1 | 2026-01-01 through 2026-10-14 |
| 2026 | CHASE | 1159 | 9537 | 1157 | 2 | 2026-01-01 through 2026-10-14 |
| 2026 | AW | 2008 | 19065 | 1990 | 18 | 2026-01-01 through 2026-09-21 |
| 2026 | TURF | 4059 | 40902 | 4048 | 11 | 2026-02-15 through 2026-09-19 |

| Year | Eligibility exclusion | Races |
| --- | --- | --- |
| 2025 | AW: ambiguous cache race key | 24 |
| 2025 | AW: unproved local final result | 2 |
| 2025 | CHASE: ambiguous cache race key | 13 |
| 2025 | CHASE: canonical outcome incomplete | 4 |
| 2025 | CHASE: unproved local final result | 2 |
| 2025 | HURDLE: ambiguous cache race key | 15 |
| 2025 | HURDLE: canonical outcome incomplete | 1 |
| 2025 | HURDLE: unproved local final result | 4 |
| 2025 | TURF: ambiguous cache race key | 18 |
| 2025 | TURF: unproved local final result | 2 |
| 2026 | AW: ambiguous cache race key | 17 |
| 2026 | AW: unproved local final result | 1 |
| 2026 | CHASE: canonical outcome incomplete | 1 |
| 2026 | CHASE: no independent field proof | 1 |
| 2026 | HURDLE: no independent field proof | 1 |
| 2026 | TURF: ambiguous cache race key | 10 |
| 2026 | TURF: unproved local final result | 1 |

<details>
<summary>Field availability by export</summary>

| Year | Family | Feature | Present | Runner records | Coverage |
| --- | --- | --- | --- | --- | --- |
| 2025 | HURDLE | raceClass | 30820 | 30820 | 100.00% |
| 2025 | HURDLE | distanceYards | 30820 | 30820 | 100.00% |
| 2025 | HURDLE | going | 30773 | 30820 | 99.85% |
| 2025 | HURDLE | declaredRunnerCount | 30820 | 30820 | 100.00% |
| 2025 | HURDLE | actualRunnerCount | 30820 | 30820 | 100.00% |
| 2025 | HURDLE | horseAge | 30820 | 30820 | 100.00% |
| 2025 | HURDLE | weightCarriedLbs | 30820 | 30820 | 100.00% |
| 2025 | HURDLE | officialRating | 21112 | 30820 | 68.50% |
| 2025 | HURDLE | latestPerformanceRating | 25280 | 30820 | 82.02% |
| 2025 | HURDLE | priorRuns | 30820 | 30820 | 100.00% |
| 2025 | HURDLE | daysSinceLastRun | 28914 | 30820 | 93.82% |
| 2025 | HURDLE | trainerPriorWinRate | 30782 | 30820 | 99.88% |
| 2025 | HURDLE | jockeyPriorWinRate | 29809 | 30820 | 96.72% |
| 2025 | HURDLE | latestRunDate | 28914 | 30820 | 93.82% |
| 2025 | HURDLE | bestJumpSpeedLast3 | 24188 | 30820 | 78.48% |
| 2025 | HURDLE | bestAwSpeedLast3 | 0 | 30820 | 0.00% |
| 2025 | HURDLE | bestTurfSpeedLast3 | 0 | 30820 | 0.00% |
| 2025 | CHASE | raceClass | 14349 | 14349 | 100.00% |
| 2025 | CHASE | distanceYards | 14349 | 14349 | 100.00% |
| 2025 | CHASE | going | 14300 | 14349 | 99.66% |
| 2025 | CHASE | declaredRunnerCount | 14349 | 14349 | 100.00% |
| 2025 | CHASE | actualRunnerCount | 14349 | 14349 | 100.00% |
| 2025 | CHASE | horseAge | 14349 | 14349 | 100.00% |
| 2025 | CHASE | weightCarriedLbs | 14349 | 14349 | 100.00% |
| 2025 | CHASE | officialRating | 13045 | 14349 | 90.91% |
| 2025 | CHASE | latestPerformanceRating | 13249 | 14349 | 92.33% |
| 2025 | CHASE | priorRuns | 14349 | 14349 | 100.00% |
| 2025 | CHASE | daysSinceLastRun | 14064 | 14349 | 98.01% |
| 2025 | CHASE | trainerPriorWinRate | 14253 | 14349 | 99.33% |
| 2025 | CHASE | jockeyPriorWinRate | 14008 | 14349 | 97.62% |
| 2025 | CHASE | latestRunDate | 14064 | 14349 | 98.01% |
| 2025 | CHASE | bestJumpSpeedLast3 | 12560 | 14349 | 87.53% |
| 2025 | CHASE | bestAwSpeedLast3 | 0 | 14349 | 0.00% |
| 2025 | CHASE | bestTurfSpeedLast3 | 0 | 14349 | 0.00% |
| 2025 | AW | raceClass | 30633 | 30633 | 100.00% |
| 2025 | AW | distanceYards | 30633 | 30633 | 100.00% |
| 2025 | AW | going | 30633 | 30633 | 100.00% |
| 2025 | AW | declaredRunnerCount | 30633 | 30633 | 100.00% |
| 2025 | AW | actualRunnerCount | 30633 | 30633 | 100.00% |
| 2025 | AW | horseAge | 30633 | 30633 | 100.00% |
| 2025 | AW | weightCarriedLbs | 30633 | 30633 | 100.00% |
| 2025 | AW | officialRating | 25058 | 30633 | 81.80% |
| 2025 | AW | latestPerformanceRating | 25603 | 30633 | 83.58% |
| 2025 | AW | priorRuns | 30633 | 30633 | 100.00% |
| 2025 | AW | daysSinceLastRun | 28753 | 30633 | 93.86% |
| 2025 | AW | trainerPriorWinRate | 30611 | 30633 | 99.93% |
| 2025 | AW | jockeyPriorWinRate | 29962 | 30633 | 97.81% |
| 2025 | AW | latestRunDate | 28753 | 30633 | 93.86% |
| 2025 | AW | bestJumpSpeedLast3 | 0 | 30633 | 0.00% |
| 2025 | AW | bestAwSpeedLast3 | 22892 | 30633 | 74.73% |
| 2025 | AW | bestTurfSpeedLast3 | 0 | 30633 | 0.00% |
| 2025 | TURF | raceClass | 48657 | 48657 | 100.00% |
| 2025 | TURF | distanceYards | 48657 | 48657 | 100.00% |
| 2025 | TURF | going | 48649 | 48657 | 99.98% |
| 2025 | TURF | declaredRunnerCount | 48657 | 48657 | 100.00% |
| 2025 | TURF | actualRunnerCount | 48657 | 48657 | 100.00% |
| 2025 | TURF | horseAge | 48657 | 48657 | 100.00% |
| 2025 | TURF | weightCarriedLbs | 48657 | 48657 | 100.00% |
| 2025 | TURF | officialRating | 38170 | 48657 | 78.45% |
| 2025 | TURF | latestPerformanceRating | 42192 | 48657 | 86.71% |
| 2025 | TURF | priorRuns | 48657 | 48657 | 100.00% |
| 2025 | TURF | daysSinceLastRun | 44663 | 48657 | 91.79% |
| 2025 | TURF | trainerPriorWinRate | 48616 | 48657 | 99.92% |
| 2025 | TURF | jockeyPriorWinRate | 47695 | 48657 | 98.02% |
| 2025 | TURF | latestRunDate | 44663 | 48657 | 91.79% |
| 2025 | TURF | bestJumpSpeedLast3 | 0 | 48657 | 0.00% |
| 2025 | TURF | bestAwSpeedLast3 | 0 | 48657 | 0.00% |
| 2025 | TURF | bestTurfSpeedLast3 | 39512 | 48657 | 81.21% |
| 2026 | HURDLE | raceClass | 21852 | 21852 | 100.00% |
| 2026 | HURDLE | distanceYards | 21852 | 21852 | 100.00% |
| 2026 | HURDLE | going | 21852 | 21852 | 100.00% |
| 2026 | HURDLE | declaredRunnerCount | 21852 | 21852 | 100.00% |
| 2026 | HURDLE | actualRunnerCount | 21852 | 21852 | 100.00% |
| 2026 | HURDLE | horseAge | 21852 | 21852 | 100.00% |
| 2026 | HURDLE | weightCarriedLbs | 21852 | 21852 | 100.00% |
| 2026 | HURDLE | officialRating | 15649 | 21852 | 71.61% |
| 2026 | HURDLE | latestPerformanceRating | 19006 | 21852 | 86.98% |
| 2026 | HURDLE | priorRuns | 21852 | 21852 | 100.00% |
| 2026 | HURDLE | daysSinceLastRun | 20895 | 21852 | 95.62% |
| 2026 | HURDLE | trainerPriorWinRate | 21833 | 21852 | 99.91% |
| 2026 | HURDLE | jockeyPriorWinRate | 21147 | 21852 | 96.77% |
| 2026 | HURDLE | latestRunDate | 20895 | 21852 | 95.62% |
| 2026 | HURDLE | bestJumpSpeedLast3 | 18204 | 21852 | 83.31% |
| 2026 | HURDLE | bestAwSpeedLast3 | 0 | 21852 | 0.00% |
| 2026 | HURDLE | bestTurfSpeedLast3 | 0 | 21852 | 0.00% |
| 2026 | CHASE | raceClass | 9537 | 9537 | 100.00% |
| 2026 | CHASE | distanceYards | 9537 | 9537 | 100.00% |
| 2026 | CHASE | going | 9537 | 9537 | 100.00% |
| 2026 | CHASE | declaredRunnerCount | 9537 | 9537 | 100.00% |
| 2026 | CHASE | actualRunnerCount | 9537 | 9537 | 100.00% |
| 2026 | CHASE | horseAge | 9537 | 9537 | 100.00% |
| 2026 | CHASE | weightCarriedLbs | 9537 | 9537 | 100.00% |
| 2026 | CHASE | officialRating | 8822 | 9537 | 92.50% |
| 2026 | CHASE | latestPerformanceRating | 9245 | 9537 | 96.94% |
| 2026 | CHASE | priorRuns | 9537 | 9537 | 100.00% |
| 2026 | CHASE | daysSinceLastRun | 9435 | 9537 | 98.93% |
| 2026 | CHASE | trainerPriorWinRate | 9469 | 9537 | 99.29% |
| 2026 | CHASE | jockeyPriorWinRate | 9303 | 9537 | 97.55% |
| 2026 | CHASE | latestRunDate | 9435 | 9537 | 98.93% |
| 2026 | CHASE | bestJumpSpeedLast3 | 8893 | 9537 | 93.25% |
| 2026 | CHASE | bestAwSpeedLast3 | 0 | 9537 | 0.00% |
| 2026 | CHASE | bestTurfSpeedLast3 | 0 | 9537 | 0.00% |
| 2026 | AW | raceClass | 19065 | 19065 | 100.00% |
| 2026 | AW | distanceYards | 19065 | 19065 | 100.00% |
| 2026 | AW | going | 19065 | 19065 | 100.00% |
| 2026 | AW | declaredRunnerCount | 19065 | 19065 | 100.00% |
| 2026 | AW | actualRunnerCount | 19065 | 19065 | 100.00% |
| 2026 | AW | horseAge | 19065 | 19065 | 100.00% |
| 2026 | AW | weightCarriedLbs | 19065 | 19065 | 100.00% |
| 2026 | AW | officialRating | 15817 | 19065 | 82.96% |
| 2026 | AW | latestPerformanceRating | 16434 | 19065 | 86.20% |
| 2026 | AW | priorRuns | 19065 | 19065 | 100.00% |
| 2026 | AW | daysSinceLastRun | 18018 | 19065 | 94.51% |
| 2026 | AW | trainerPriorWinRate | 19054 | 19065 | 99.94% |
| 2026 | AW | jockeyPriorWinRate | 18712 | 19065 | 98.15% |
| 2026 | AW | latestRunDate | 18018 | 19065 | 94.51% |
| 2026 | AW | bestJumpSpeedLast3 | 0 | 19065 | 0.00% |
| 2026 | AW | bestAwSpeedLast3 | 14939 | 19065 | 78.36% |
| 2026 | AW | bestTurfSpeedLast3 | 0 | 19065 | 0.00% |
| 2026 | TURF | raceClass | 40902 | 40902 | 100.00% |
| 2026 | TURF | distanceYards | 40902 | 40902 | 100.00% |
| 2026 | TURF | going | 40884 | 40902 | 99.96% |
| 2026 | TURF | declaredRunnerCount | 40902 | 40902 | 100.00% |
| 2026 | TURF | actualRunnerCount | 40902 | 40902 | 100.00% |
| 2026 | TURF | horseAge | 40902 | 40902 | 100.00% |
| 2026 | TURF | weightCarriedLbs | 40902 | 40902 | 100.00% |
| 2026 | TURF | officialRating | 32339 | 40902 | 79.06% |
| 2026 | TURF | latestPerformanceRating | 35898 | 40902 | 87.77% |
| 2026 | TURF | priorRuns | 40902 | 40902 | 100.00% |
| 2026 | TURF | daysSinceLastRun | 37595 | 40902 | 91.91% |
| 2026 | TURF | trainerPriorWinRate | 40875 | 40902 | 99.93% |
| 2026 | TURF | jockeyPriorWinRate | 40069 | 40902 | 97.96% |
| 2026 | TURF | latestRunDate | 37595 | 40902 | 91.91% |
| 2026 | TURF | bestJumpSpeedLast3 | 0 | 40902 | 0.00% |
| 2026 | TURF | bestAwSpeedLast3 | 0 | 40902 | 0.00% |
| 2026 | TURF | bestTurfSpeedLast3 | 33199 | 40902 | 81.17% |

</details>

## C. Market and Tissue baselines

Coverage below uses the proved historical fields. Winner count can exceed race count when there is a dead heat. Probability scores require a complete market and use race-mean win log loss, race-mean summed multiclass Brier and runner-weighted absolute calibration error over ten equal-width bins. Existing Tissue is compared in Section G wherever frozen data match. Earlier cross-family historical Tissue coverage is unavailable.

| Family | Year | Races | Starters | Winners | SP n | SP coverage | Market races | Market runners | Log loss | Brier | Calibration error | Market favourite capture |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CHASE | 2025 | 1688 | 12994 | 1688 | 12994 | 100.00% | 1688 | 12994 | 1.69015 | 0.76935 | 0.95% | 33.41% |
| CHASE | 2026 | 1157 | 8666 | 1158 | 8666 | 100.00% | 1157 | 8666 | 1.65383 | 0.75665 | 1.02% | 36.82% |
| HURDLE | 2025 | 2891 | 27625 | 2891 | 27625 | 100.00% | 2891 | 27625 | 1.66475 | 0.73522 | 0.80% | 39.12% |
| HURDLE | 2026 | 2031 | 19780 | 2033 | 19780 | 100.00% | 2031 | 19780 | 1.71701 | 0.75378 | 0.51% | 35.30% |
| AW | 2025 | 3078 | 28415 | 3089 | 28415 | 100.00% | 3078 | 28415 | 1.76181 | 0.76655 | 0.77% | 35.58% |
| AW | 2026 | 1990 | 17796 | 1994 | 17796 | 100.00% | 1990 | 17796 | 1.74682 | 0.76664 | 0.67% | 35.38% |
| TURF | 2025 | 4720 | 44389 | 4729 | 44389 | 100.00% | 4720 | 44389 | 1.81143 | 0.78229 | 0.47% | 32.39% |
| TURF | 2026 | 4048 | 37511 | 4053 | 37511 | 100.00% | 4048 | 37511 | 1.76601 | 0.76940 | 0.55% | 34.24% |

## D. Search methodology

- 18 fixed rule definitions × four families = **72 configurations**. All were evaluated against known 2025 results, so every figure labelled discovery is **in-sample/backfitted**. Rule thresholds were written before scoring the grid. Existing historical analysis informed the variables and cutoffs (OR, speed, participant rates, layoff and form). Only rule/family finalism and fitted coefficients or tree splits were selected from study outcomes. A rule keeps all tied competition ranks. No selection uses an SP threshold to enter a rule.
- The best 2025 ROI within each family qualified with at least 200 priced stakes, 150 complete-market selections and 60 distinct race dates. The minimums control very small samples. The four selected rules, their predetermined one-step neighbours, all six fitted model configurations per family, and the input/configuration hashes were frozen before the 2026 file was opened. The neighbours are sensitivity checks and were never eligible for promotion. The full candidate table retains failures.
- Six probability configurations × four families = **24 full 2025 fits**. Whole races and dates are also kept intact for expanding-quarter validation. There are 11 eligible held-quarter evaluations per configuration grid (66 additional fits). The holdout quarters use earlier whole dates only. 2026 results are an already explored cross-year replay and never change parameters or the ranking used to choose finalists. No model configuration is selected using 2026.
- The standalone model estimates a softmax over eight interpretable features using race-mean likelihood and L2 .08. The three offset sensitivities add the same feature score to log normalized market probability at L2 .04/.08/.16. The market-only calibration fits a penalized temperature. Features are race-relative midranks for OR, best recent speed (AW uses latest Performance Rating as a shared capture-compatible proxy), weight and age, a 15–60 day layoff indicator, two missing flags and an OR × speed/form interaction. Midranks are centred, ties share a midrank, and missing values take the centre. The model uses no course or trainer IDs, actual field-count feature or participant rates.
- The nonlinear model adds at most 12 depth-one trees to the market offset, testing 31 predefined feature/cutpoint pairs per round. It uses fractional winner residuals and bounded second-order leaf updates with L2 10, shrinkage .25, minimum 150 runners in each leaf and capped leaf increments. No extra tree depth, seed, feature or iteration grid was searched. Full-race softmax keeps the scores coherent. Both the linear and nonlinear market-relative forms require market prices for scoring.
- Comparison intervals use 2,000 deterministic race-date cluster bootstrap draws. They capture sampling variation within the evaluated population. They do not account for the search or repeated prior use of 2026. SP returns are uncapped arithmetic at quoted historical settlement and do not include commissions or execution friction.

Market A/E uses fractional dead-heat credits on market-covered selections. Wins and strike count horses with a winning result flag. A £1 SP stake requires valid canonical v3 settlement and a decimal SP greater than one. These denominators are reported separately.

## E. All 2025 discovery rules

All candidates appear in fixed order. Original thresholds and the single neighbour for each shortlisted rule are fully specified in the script. This table includes rules with zero coverage.

| ID | Family | Definition | Races / dates | Selections | Winners | Strike | Market n | Market E | Market A/E | SP stakes | Mean SP | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R01 | CHASE | OR rank 1 | 1655 / 313 | 1877 | 340 | 18.11% | 1877 | 349.43 | 0.973 | 1877 | 9.78 | -332.18 | -17.70% |
| R02 | CHASE | Family speed rank 1 | 1679 / 312 | 1679 | 285 | 16.97% | 1679 | 297.57 | 0.958 | 1679 | 11.25 | -220.23 | -13.12% |
| R03 | CHASE | Latest Performance Rating rank 1 | 1679 / 312 | 1679 | 288 | 17.15% | 1679 | 303.01 | 0.950 | 1679 | 10.92 | -320.31 | -19.08% |
| R04 | CHASE | OR top 3 and speed top 3 | 1450 / 310 | 2497 | 513 | 20.54% | 2497 | 508.91 | 1.008 | 2497 | 8.01 | -284.86 | -11.41% |
| R05 | CHASE | Speed rank 1 and OR rank 4+ | 696 / 273 | 696 | 94 | 13.51% | 696 | 95.83 | 0.981 | 696 | 12.70 | -137.36 | -19.74% |
| R06 | CHASE | OR rank 1 and speed rank 4+ | 714 / 278 | 776 | 111 | 14.30% | 776 | 112.21 | 0.989 | 776 | 10.76 | -139.85 | -18.02% |
| R07 | CHASE | Speed top 3 and layoff 15–60 | 1563 / 308 | 3293 | 585 | 17.76% | 3293 | 574.33 | 1.019 | 3293 | 10.67 | -402.32 | -12.22% |
| R08 | CHASE | Speed top 3 and layoff 61–120 | 343 / 199 | 395 | 65 | 16.46% | 395 | 55.88 | 1.163 | 395 | 14.50 | 41.05 | 10.39% |
| R09 | CHASE | OR top 3 and trainer prior rate ≥15% | 1227 / 304 | 2263 | 458 | 20.24% | 2263 | 460.91 | 0.994 | 2263 | 7.54 | -291.90 | -12.90% |
| R10 | CHASE | Speed top 3 and jockey prior rate ≥12% | 1519 / 311 | 3015 | 597 | 19.80% | 3015 | 590.85 | 1.010 | 3015 | 8.25 | -376.09 | -12.47% |
| R11 | CHASE | Handicap, OR down ≥3 lb, speed top 3 | 471 / 238 | 562 | 72 | 12.81% | 562 | 68.77 | 1.047 | 562 | 13.23 | -137.16 | -24.41% |
| R12 | CHASE | Handicap, OR top 3, declared field 2–7 | 734 / 267 | 2286 | 458 | 20.03% | 2286 | 459.21 | 0.997 | 2286 | 7.57 | -291.30 | -12.74% |
| R13 | CHASE | Handicap, speed top 3, declared field 8–11 | 413 / 210 | 1239 | 183 | 14.77% | 1239 | 160.20 | 1.142 | 1239 | 11.05 | -169.89 | -13.71% |
| R14 | CHASE | Latest Performance Rating top 3 and ≥5 prior runs | 1644 / 312 | 4193 | 735 | 17.53% | 4193 | 723.20 | 1.016 | 4193 | 10.92 | -583.42 | -13.91% |
| R15 | CHASE | Latest speed rank 1 with speed top 3 | 1488 / 312 | 1488 | 272 | 18.28% | 1488 | 278.95 | 0.975 | 1488 | 10.80 | -199.02 | -13.37% |
| R16 | CHASE | Performance rank 1 and OR rank 4+ | 596 / 258 | 596 | 75 | 12.58% | 596 | 80.66 | 0.930 | 596 | 13.32 | -152.18 | -25.53% |
| R17 | CHASE | Performance top 3 and layoff 15–60 | 1549 / 309 | 3241 | 576 | 17.77% | 3241 | 563.45 | 1.022 | 3241 | 10.90 | -401.66 | -12.39% |
| R18 | CHASE | Performance top 3 and both participant rates ≥12% | 1277 / 308 | 2255 | 480 | 21.29% | 2255 | 475.12 | 1.010 | 2255 | 7.39 | -348.73 | -15.46% |
| R01 | HURDLE | OR rank 1 | 2607 / 320 | 3027 | 580 | 19.16% | 3027 | 565.95 | 1.025 | 3027 | 11.85 | -590.66 | -19.51% |
| R02 | HURDLE | Family speed rank 1 | 2880 / 321 | 2880 | 454 | 15.76% | 2880 | 465.92 | 0.974 | 2880 | 19.13 | -889.64 | -30.89% |
| R03 | HURDLE | Latest Performance Rating rank 1 | 2880 / 321 | 2880 | 477 | 16.56% | 2880 | 464.15 | 1.028 | 2880 | 19.45 | -611.90 | -21.25% |
| R04 | HURDLE | OR top 3 and speed top 3 | 2101 / 319 | 3150 | 628 | 19.94% | 3150 | 638.07 | 0.984 | 3150 | 9.74 | -740.03 | -23.49% |
| R05 | HURDLE | Speed rank 1 and OR rank 4+ | 1044 / 303 | 1044 | 113 | 10.82% | 1044 | 118.41 | 0.954 | 1044 | 15.43 | -319.28 | -30.58% |
| R06 | HURDLE | OR rank 1 and speed rank 4+ | 1239 / 306 | 1406 | 207 | 14.72% | 1406 | 200.96 | 1.030 | 1406 | 13.48 | -248.36 | -17.66% |
| R07 | HURDLE | Speed top 3 and layoff 15–60 | 2651 / 321 | 5457 | 838 | 15.36% | 5457 | 851.16 | 0.985 | 5457 | 20.16 | -1411.33 | -25.86% |
| R08 | HURDLE | Speed top 3 and layoff 61–120 | 655 / 254 | 749 | 105 | 14.02% | 749 | 100.63 | 1.043 | 749 | 22.55 | -200.89 | -26.82% |
| R09 | HURDLE | OR top 3 and trainer prior rate ≥15% | 1581 / 305 | 2602 | 572 | 21.98% | 2602 | 537.46 | 1.064 | 2602 | 8.26 | -355.53 | -13.66% |
| R10 | HURDLE | Speed top 3 and jockey prior rate ≥12% | 2445 / 319 | 4646 | 844 | 18.17% | 4646 | 857.51 | 0.984 | 4646 | 14.27 | -1143.76 | -24.62% |
| R11 | HURDLE | Handicap, OR down ≥3 lb, speed top 3 | 580 / 263 | 670 | 55 | 8.21% | 670 | 60.44 | 0.910 | 670 | 19.72 | -268.24 | -40.04% |
| R12 | HURDLE | Handicap, OR top 3, declared field 2–7 | 519 / 227 | 1618 | 309 | 19.10% | 1618 | 312.24 | 0.990 | 1618 | 8.90 | -345.01 | -21.32% |
| R13 | HURDLE | Handicap, speed top 3, declared field 8–11 | 625 / 261 | 1875 | 224 | 11.95% | 1875 | 240.62 | 0.931 | 1875 | 12.40 | -618.03 | -32.96% |
| R14 | HURDLE | Latest Performance Rating top 3 and ≥5 prior runs | 2434 / 320 | 5395 | 828 | 15.35% | 5395 | 808.85 | 1.024 | 5395 | 14.83 | -1033.01 | -19.15% |
| R15 | HURDLE | Latest speed rank 1 with speed top 3 | 2554 / 321 | 2554 | 439 | 17.19% | 2554 | 425.41 | 1.032 | 2554 | 19.87 | -654.74 | -25.64% |
| R16 | HURDLE | Performance rank 1 and OR rank 4+ | 919 / 293 | 919 | 102 | 11.10% | 919 | 97.73 | 1.044 | 919 | 17.02 | -183.57 | -19.98% |
| R17 | HURDLE | Performance top 3 and layoff 15–60 | 2623 / 319 | 5423 | 841 | 15.51% | 5423 | 844.58 | 0.996 | 5423 | 19.81 | -1320.02 | -24.34% |
| R18 | HURDLE | Performance top 3 and both participant rates ≥12% | 1983 / 314 | 3275 | 713 | 21.77% | 3275 | 699.47 | 1.019 | 3275 | 10.15 | -670.47 | -20.47% |
| R01 | AW | OR rank 1 | 2808 / 259 | 4129 | 667 | 16.15% | 4129 | 661.91 | 1.004 | 4129 | 11.06 | -688.56 | -16.68% |
| R02 | AW | Family speed rank 1 | 3037 / 259 | 3037 | 531 | 17.48% | 3037 | 526.26 | 1.006 | 3037 | 11.53 | -516.38 | -17.00% |
| R03 | AW | Latest Performance Rating rank 1 | 3039 / 259 | 3039 | 518 | 17.05% | 3039 | 517.17 | 0.998 | 3039 | 12.50 | -638.20 | -21.00% |
| R04 | AW | OR top 3 and speed top 3 | 2353 / 259 | 3573 | 645 | 18.05% | 3573 | 652.71 | 0.984 | 3573 | 8.44 | -592.36 | -16.58% |
| R05 | AW | Speed rank 1 and OR rank 4+ | 1218 / 253 | 1218 | 177 | 14.53% | 1218 | 157.50 | 1.117 | 1218 | 12.24 | -147.58 | -12.12% |
| R06 | AW | OR rank 1 and speed rank 4+ | 1304 / 250 | 1655 | 217 | 13.11% | 1655 | 203.36 | 1.060 | 1655 | 14.20 | -216.18 | -13.06% |
| R07 | AW | Speed top 3 and layoff 15–60 | 2663 / 259 | 5036 | 729 | 14.48% | 5036 | 717.79 | 1.013 | 5036 | 16.88 | -1021.29 | -20.28% |
| R08 | AW | Speed top 3 and layoff 61–120 | 448 / 196 | 485 | 62 | 12.78% | 485 | 63.32 | 0.979 | 485 | 19.38 | -69.32 | -14.29% |
| R09 | AW | OR top 3 and trainer prior rate ≥15% | 1119 / 255 | 1481 | 288 | 19.45% | 1481 | 295.87 | 0.970 | 1481 | 7.73 | -358.09 | -24.18% |
| R10 | AW | Speed top 3 and jockey prior rate ≥12% | 2195 / 258 | 3320 | 610 | 18.37% | 3320 | 597.88 | 1.016 | 3320 | 10.52 | -562.10 | -16.93% |
| R11 | AW | Handicap, OR down ≥3 lb, speed top 3 | 353 / 180 | 388 | 24 | 6.19% | 388 | 32.29 | 0.743 | 388 | 21.02 | -97.50 | -25.13% |
| R12 | AW | Handicap, OR top 3, declared field 2–7 | 503 / 205 | 1612 | 302 | 18.73% | 1612 | 314.90 | 0.957 | 1612 | 8.00 | -309.33 | -19.19% |
| R13 | AW | Handicap, speed top 3, declared field 8–11 | 1228 / 254 | 3665 | 514 | 14.02% | 3665 | 508.07 | 1.007 | 3665 | 11.04 | -630.36 | -17.20% |
| R14 | AW | Latest Performance Rating top 3 and ≥5 prior runs | 2528 / 259 | 6636 | 911 | 13.73% | 6636 | 932.87 | 0.973 | 6636 | 12.32 | -1641.28 | -24.73% |
| R15 | AW | Latest speed rank 1 with speed top 3 | 2603 / 259 | 2603 | 470 | 18.06% | 2603 | 472.09 | 0.992 | 2603 | 11.13 | -530.05 | -20.36% |
| R16 | AW | Performance rank 1 and OR rank 4+ | 1117 / 252 | 1117 | 145 | 12.98% | 1117 | 140.75 | 1.027 | 1117 | 12.39 | -187.03 | -16.74% |
| R17 | AW | Performance top 3 and layoff 15–60 | 2675 / 259 | 5117 | 716 | 13.99% | 5117 | 727.24 | 0.981 | 5117 | 17.07 | -1120.46 | -21.90% |
| R18 | AW | Performance top 3 and both participant rates ≥12% | 1189 / 250 | 1528 | 335 | 21.92% | 1528 | 320.18 | 1.045 | 1528 | 9.56 | -263.36 | -17.24% |
| R01 | TURF | OR rank 1 | 4095 / 219 | 5485 | 916 | 16.70% | 5485 | 909.94 | 1.005 | 5485 | 10.61 | -1049.35 | -19.13% |
| R02 | TURF | Family speed rank 1 | 4686 / 219 | 4686 | 846 | 18.05% | 4686 | 793.95 | 1.064 | 4686 | 12.73 | -610.93 | -13.04% |
| R03 | TURF | Latest Performance Rating rank 1 | 4688 / 219 | 4688 | 773 | 16.49% | 4688 | 781.09 | 0.988 | 4688 | 13.38 | -1066.16 | -22.74% |
| R04 | TURF | OR top 3 and speed top 3 | 3415 / 219 | 5310 | 1002 | 18.87% | 5310 | 992.95 | 1.007 | 5310 | 8.48 | -695.37 | -13.10% |
| R05 | TURF | Speed rank 1 and OR rank 4+ | 1871 / 218 | 1871 | 264 | 14.11% | 1871 | 214.26 | 1.230 | 1871 | 14.38 | -123.73 | -6.61% |
| R06 | TURF | OR rank 1 and speed rank 4+ | 2145 / 218 | 2574 | 317 | 12.32% | 2574 | 341.81 | 0.924 | 2574 | 12.70 | -686.64 | -26.68% |
| R07 | TURF | Speed top 3 and layoff 15–60 | 4133 / 219 | 8157 | 1261 | 15.46% | 8157 | 1235.17 | 1.020 | 8157 | 14.85 | -1119.94 | -13.73% |
| R08 | TURF | Speed top 3 and layoff 61–120 | 478 / 154 | 511 | 66 | 12.92% | 511 | 68.60 | 0.962 | 511 | 19.83 | -208.10 | -40.72% |
| R09 | TURF | OR top 3 and trainer prior rate ≥15% | 1879 / 215 | 2764 | 596 | 21.56% | 2764 | 549.71 | 1.083 | 2764 | 7.62 | -239.16 | -8.65% |
| R10 | TURF | Speed top 3 and jockey prior rate ≥12% | 3270 / 216 | 5189 | 990 | 19.08% | 5189 | 977.89 | 1.012 | 5189 | 9.80 | -585.69 | -11.29% |
| R11 | TURF | Handicap, OR down ≥3 lb, speed top 3 | 703 / 201 | 786 | 46 | 5.85% | 786 | 61.65 | 0.746 | 786 | 20.60 | -368.23 | -46.85% |
| R12 | TURF | Handicap, OR top 3, declared field 2–7 | 921 / 187 | 2968 | 564 | 19.00% | 2968 | 579.55 | 0.971 | 2968 | 7.72 | -341.95 | -11.52% |
| R13 | TURF | Handicap, speed top 3, declared field 8–11 | 1318 / 210 | 3947 | 537 | 13.61% | 3947 | 518.33 | 1.034 | 3947 | 11.31 | -513.70 | -13.01% |
| R14 | TURF | Latest Performance Rating top 3 and ≥5 prior runs | 3587 / 219 | 9080 | 1228 | 13.52% | 9080 | 1242.30 | 0.987 | 9080 | 12.22 | -1539.65 | -16.96% |
| R15 | TURF | Latest speed rank 1 with speed top 3 | 4127 / 219 | 4127 | 735 | 17.81% | 4127 | 733.30 | 1.001 | 4127 | 12.56 | -824.05 | -19.97% |
| R16 | TURF | Performance rank 1 and OR rank 4+ | 1797 / 218 | 1797 | 217 | 12.08% | 1797 | 203.16 | 1.066 | 1797 | 14.48 | -356.34 | -19.83% |
| R17 | TURF | Performance top 3 and layoff 15–60 | 4172 / 218 | 8240 | 1223 | 14.84% | 8240 | 1224.95 | 0.998 | 8240 | 15.21 | -1392.41 | -16.90% |
| R18 | TURF | Performance top 3 and both participant rates ≥12% | 2237 / 214 | 3120 | 685 | 21.96% | 3120 | 657.95 | 1.041 | 3120 | 8.51 | -264.11 | -8.47% |

## F. Frozen rule replay

| Family | Rule | Period | Races / dates | Selections | Winners | Strike | Market n | Market E | Market A/E | SP stakes | Mean SP | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CHASE | R08 | 2025 discovery | 343 / 199 | 395 | 65 | 16.46% | 395 | 55.88 | 1.163 | 395 | 14.50 | 41.05 | 10.39% |
| CHASE | R08 | 2026 fixed replay | 308 / 161 | 349 | 47 | 13.47% | 349 | 56.37 | 0.834 | 349 | 11.73 | -136.07 | -38.99% |
| HURDLE | R09 | 2025 discovery | 1581 / 305 | 2602 | 572 | 21.98% | 2602 | 537.46 | 1.064 | 2602 | 8.26 | -355.53 | -13.66% |
| HURDLE | R09 | 2026 fixed replay | 1209 / 235 | 2012 | 432 | 21.47% | 2012 | 424.67 | 1.016 | 2012 | 7.94 | -297.14 | -14.77% |
| AW | R05 | 2025 discovery | 1218 / 253 | 1218 | 177 | 14.53% | 1218 | 157.50 | 1.117 | 1218 | 12.24 | -147.58 | -12.12% |
| AW | R05 | 2026 fixed replay | 783 / 175 | 784 | 119 | 15.18% | 784 | 107.52 | 1.107 | 784 | 11.87 | 97.87 | 12.48% |
| TURF | R05 | 2025 discovery | 1871 / 218 | 1871 | 264 | 14.11% | 1871 | 214.26 | 1.230 | 1871 | 14.38 | -123.73 | -6.61% |
| TURF | R05 | 2026 fixed replay | 1597 / 173 | 1597 | 201 | 12.59% | 1597 | 196.33 | 1.024 | 1597 | 13.60 | -408.06 | -25.55% |

| Family | Rule | Period | Market A/E 95% | ROI 95% | Top two share of winning gross | After largest £ / ROI (stakes) | After two £ / ROI (stakes) | Fixed neighbour £ / ROI (stakes) | Neighbour market A/E |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CHASE | R08 | 2025 | 0.91 to 1.41 | -20.64% to 43.79% | 11.93% | 13.05 / 3.31% (394) | -8.95 / -2.28% (393) | 46.75 / 11.40% (410) | 1.178 |
| CHASE | R08 | 2026 | 0.64 to 1.02 | -57.84% to -17.43% | 15.97% | -154.07 / -44.27% (348) | -168.07 / -48.44% (347) | -140.97 / -39.60% (356) | 0.837 |
| HURDLE | R09 | 2025 | 1.01 to 1.12 | -21.23% to -5.56% | 1.96% | -375.53 / -14.45% (2599) | -394.53 / -15.19% (2597) | -366.23 / -12.15% (3015) | 1.049 |
| HURDLE | R09 | 2026 | 0.95 to 1.08 | -23.47% to -5.82% | 3.03% | -324.14 / -16.13% (2010) | -344.14 / -17.15% (2007) | -420.70 / -16.27% (2585) | 1.027 |
| AW | R05 | 2025 | 0.97 to 1.25 | -27.82% to 3.67% | 5.14% | -175.58 / -14.43% (1217) | -200.58 / -16.49% (1216) | -171.09 / -11.22% (1525) | 1.056 |
| AW | R05 | 2026 | 0.92 to 1.29 | -15.74% to 44.19% | 13.83% | 17.87 / 2.28% (783) | -22.13 / -2.83% (782) | 26.47 / 2.63% (1008) | 1.007 |
| TURF | R05 | 2025 | 1.09 to 1.37 | -21.72% to 9.73% | 4.69% | -163.73 / -8.76% (1870) | -203.73 / -10.90% (1869) | -183.37 / -7.82% (2344) | 1.170 |
| TURF | R05 | 2026 | 0.90 to 1.16 | -37.73% to -10.89% | 5.64% | -448.06 / -28.07% (1596) | -473.06 / -29.66% (1595) | -559.56 / -28.26% (1980) | 0.967 |

The linked source code defines the exact predicates, including the rank tie policy. Each expandable table gives month, quarter, fixed price bands, verified field-size bands and the five largest contributors by gross return for course and trainer. The 2026 window varies by family. Returns and A/E on a given date are estimates from a small number of races.

<details>
<summary>CHASE R08 • 2025</summary>

- Winning race `ad4ecbff-fb73-4dfa-bcd2-fe1e112be7f8` on 2025-02-06 at Thurles, £29.00 gross over 1 selected stakes.
- Winning race `641fc85b-9689-4244-b4e7-057d39741095` on 2025-04-05 at Newcastle, £23.00 gross over 1 selected stakes.

| Month | Races / dates | Selections | Winners | Strike | Market n | Market E | Market A/E | SP stakes | Mean SP | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2025-01 | 15 / 11 | 16 | 3 | 18.75% | 16 | 1.83 | 1.636 | 16 | 23.74 | -1.00 | -6.25% |
| 2025-02 | 61 / 26 | 79 | 8 | 10.13% | 79 | 10.35 | 0.773 | 79 | 19.59 | -16.43 | -20.80% |
| 2025-03 | 67 / 26 | 78 | 10 | 12.82% | 78 | 10.79 | 0.927 | 78 | 13.92 | -3.75 | -4.81% |
| 2025-04 | 38 / 19 | 40 | 11 | 27.50% | 40 | 6.41 | 1.716 | 40 | 10.55 | 39.36 | 98.39% |
| 2025-05 | 25 / 18 | 28 | 4 | 14.29% | 28 | 4.13 | 0.970 | 28 | 10.56 | 1.50 | 5.36% |
| 2025-06 | 19 / 13 | 19 | 2 | 10.53% | 19 | 2.64 | 0.758 | 19 | 10.63 | 0.00 | 0.00% |
| 2025-07 | 22 / 15 | 27 | 7 | 25.93% | 27 | 2.80 | 2.499 | 27 | 14.61 | 15.60 | 57.78% |
| 2025-08 | 22 / 16 | 28 | 5 | 17.86% | 28 | 4.55 | 1.098 | 28 | 8.63 | -4.25 | -15.18% |
| 2025-09 | 18 / 13 | 20 | 5 | 25.00% | 20 | 3.90 | 1.282 | 20 | 20.65 | 8.13 | 40.63% |
| 2025-10 | 28 / 18 | 31 | 8 | 25.81% | 31 | 5.34 | 1.499 | 31 | 8.45 | 15.40 | 49.68% |
| 2025-11 | 13 / 12 | 13 | 1 | 7.69% | 13 | 1.50 | 0.668 | 13 | 10.46 | -3.00 | -23.08% |
| 2025-12 | 15 / 12 | 16 | 1 | 6.25% | 16 | 1.63 | 0.613 | 16 | 21.59 | -10.50 | -65.63% |

| Quarter | Races / dates | Selections | Winners | Strike | Market n | Market E | Market A/E | SP stakes | Mean SP | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Q1 | 143 / 63 | 173 | 21 | 12.14% | 173 | 22.98 | 0.914 | 173 | 17.42 | -21.18 | -12.24% |
| Q2 | 82 / 50 | 87 | 17 | 19.54% | 87 | 13.18 | 1.290 | 87 | 10.57 | 40.86 | 46.96% |
| Q3 | 62 / 44 | 75 | 17 | 22.67% | 75 | 11.26 | 1.510 | 75 | 13.99 | 19.48 | 25.97% |
| Q4 | 56 / 42 | 60 | 10 | 16.67% | 60 | 8.47 | 1.181 | 60 | 12.39 | 1.90 | 3.17% |

| Final decimal SP | Races / dates | Selections | Winners | Strike | Market n | Market E | Market A/E | SP stakes | Mean SP | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| <3 | 34 / 34 | 34 | 12 | 35.29% | 34 | 14.13 | 0.849 | 34 | 2.29 | -9.49 | -27.91% |
| 11–<21 | 71 / 62 | 73 | 9 | 12.33% | 73 | 4.59 | 1.959 | 73 | 13.93 | 53.00 | 72.60% |
| 21+ | 63 / 50 | 63 | 2 | 3.17% | 63 | 1.59 | 1.258 | 63 | 51.43 | -11.00 | -17.46% |
| 3–<5 | 66 / 56 | 67 | 16 | 23.88% | 67 | 15.49 | 1.033 | 67 | 3.87 | -5.46 | -8.15% |
| 5–<11 | 148 / 120 | 158 | 26 | 16.46% | 158 | 20.07 | 1.295 | 158 | 7.16 | 14.00 | 8.86% |

| Proved starter count | Races / dates | Selections | Winners | Strike | Market n | Market E | Market A/E | SP stakes | Mean SP | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 12+ | 56 / 49 | 67 | 7 | 10.45% | 67 | 5.29 | 1.323 | 67 | 20.16 | 24.50 | 36.57% |
| 2–7 | 178 / 130 | 201 | 39 | 19.40% | 201 | 36.13 | 1.079 | 201 | 9.40 | 25.99 | 12.93% |
| 8–11 | 109 / 87 | 127 | 19 | 14.96% | 127 | 14.46 | 1.314 | 127 | 19.57 | -9.44 | -7.43% |

| Course | Selections | Wins | Gross £ | Share of gross | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- |
| Galway | 13 | 5 | 35.13 | 8.06% | 22.13 | 170.19% |
| Thurles | 9 | 1 | 29.00 | 6.65% | 20.00 | 222.22% |
| Newcastle | 6 | 2 | 28.50 | 6.54% | 22.50 | 375.00% |
| Market Rasen | 14 | 5 | 25.50 | 5.85% | 11.50 | 82.14% |
| Kilbeggan | 4 | 2 | 24.00 | 5.50% | 20.00 | 500.00% |

| Trainer | Selections | Wins | Gross £ | Share of gross | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- |
| P Fenton | 1 | 1 | 29.00 | 6.65% | 28.00 | 2800.00% |
| G Hanmer | 3 | 3 | 28.00 | 6.42% | 25.00 | 833.33% |
| H De Bromhead | 15 | 3 | 28.00 | 6.42% | 13.00 | 86.67% |
| W P Mullins | 13 | 3 | 26.44 | 6.06% | 13.44 | 103.42% |
| H Hogarth | 2 | 1 | 23.00 | 5.27% | 21.00 | 1050.00% |

</details>

<details>
<summary>CHASE R08 • 2026</summary>

- Winning race `909f16d9-5fae-4af9-aaa2-1e42db430e8d` on 2026-04-18 at Ayr, £19.00 gross over 1 selected stakes.
- Winning race `a5781dc2-21f3-4aef-8e65-a4138981acb0` on 2026-10-04 at Uttoxeter, £15.00 gross over 1 selected stakes.

| Month | Races / dates | Selections | Winners | Strike | Market n | Market E | Market A/E | SP stakes | Mean SP | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-01 | 27 / 19 | 28 | 1 | 3.57% | 28 | 3.56 | 0.281 | 28 | 16.70 | -21.50 | -76.79% |
| 2026-02 | 53 / 22 | 59 | 5 | 8.47% | 59 | 9.46 | 0.528 | 59 | 11.10 | -48.66 | -82.48% |
| 2026-03 | 70 / 30 | 84 | 14 | 16.67% | 84 | 14.31 | 0.979 | 84 | 9.27 | -14.69 | -17.49% |
| 2026-04 | 52 / 20 | 59 | 7 | 11.86% | 59 | 8.53 | 0.820 | 59 | 12.98 | -18.97 | -32.15% |
| 2026-05 | 32 / 19 | 35 | 4 | 11.43% | 35 | 5.20 | 0.769 | 35 | 17.43 | -23.30 | -66.57% |
| 2026-06 | 11 / 10 | 12 | 2 | 16.67% | 12 | 1.52 | 1.313 | 12 | 17.49 | 1.25 | 10.42% |
| 2026-07 | 11 / 9 | 14 | 1 | 7.14% | 14 | 1.89 | 0.529 | 14 | 11.44 | -11.25 | -80.36% |
| 2026-08 | 15 / 10 | 17 | 3 | 17.65% | 17 | 3.42 | 0.876 | 17 | 7.70 | -2.50 | -14.71% |
| 2026-09 | 21 / 14 | 24 | 5 | 20.83% | 24 | 5.04 | 0.992 | 24 | 7.29 | -5.11 | -21.31% |
| 2026-10 | 16 / 8 | 17 | 5 | 29.41% | 17 | 3.43 | 1.456 | 17 | 8.25 | 8.67 | 50.98% |

| Quarter | Races / dates | Selections | Winners | Strike | Market n | Market E | Market A/E | SP stakes | Mean SP | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Q1 | 150 / 71 | 171 | 20 | 11.70% | 171 | 27.33 | 0.732 | 171 | 11.12 | -84.86 | -49.62% |
| Q2 | 95 / 49 | 106 | 13 | 12.26% | 106 | 15.26 | 0.852 | 106 | 14.96 | -41.02 | -38.70% |
| Q3 | 47 / 33 | 55 | 9 | 16.36% | 55 | 10.35 | 0.869 | 55 | 8.47 | -18.86 | -34.30% |
| Q4 | 16 / 8 | 17 | 5 | 29.41% | 17 | 3.43 | 1.456 | 17 | 8.25 | 8.67 | 50.98% |

| Final decimal SP | Races / dates | Selections | Winners | Strike | Market n | Market E | Market A/E | SP stakes | Mean SP | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| <3 | 45 / 40 | 45 | 20 | 44.44% | 45 | 18.69 | 1.070 | 45 | 2.28 | -1.80 | -4.01% |
| 11–<21 | 72 / 62 | 73 | 3 | 4.11% | 73 | 4.55 | 0.659 | 73 | 14.14 | -24.00 | -32.88% |
| 21+ | 45 / 37 | 47 | 0 | 0.00% | 47 | 1.25 | 0.000 | 47 | 40.51 | -47.00 | -100.00% |
| 3–<5 | 73 / 64 | 74 | 14 | 18.92% | 74 | 17.74 | 0.789 | 74 | 3.74 | -24.77 | -33.47% |
| 5–<11 | 103 / 72 | 110 | 10 | 9.09% | 110 | 14.15 | 0.707 | 110 | 7.07 | -38.50 | -35.00% |

| Proved starter count | Races / dates | Selections | Winners | Strike | Market n | Market E | Market A/E | SP stakes | Mean SP | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 12+ | 40 / 29 | 46 | 2 | 4.35% | 46 | 3.17 | 0.630 | 46 | 23.68 | -25.50 | -55.43% |
| 2–7 | 192 / 127 | 216 | 36 | 16.67% | 216 | 43.60 | 0.826 | 216 | 7.80 | -93.92 | -43.48% |
| 8–11 | 76 / 60 | 87 | 9 | 10.34% | 87 | 9.61 | 0.937 | 87 | 15.15 | -16.65 | -19.14% |

| Course | Selections | Wins | Gross £ | Share of gross | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- |
| Uttoxeter | 14 | 4 | 31.13 | 14.62% | 17.13 | 122.32% |
| Ayr | 10 | 1 | 19.00 | 8.92% | 9.00 | 90.00% |
| Leopardstown | 4 | 1 | 15.00 | 7.04% | 11.00 | 275.00% |
| Worcester | 7 | 3 | 11.91 | 5.59% | 4.91 | 70.13% |
| Stratford | 11 | 2 | 10.50 | 4.93% | -0.50 | -4.55% |

| Trainer | Selections | Wins | Gross £ | Share of gross | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- |
| H De Bromhead | 14 | 6 | 19.29 | 9.06% | 5.29 | 37.80% |
| T Lacey | 2 | 1 | 19.00 | 8.92% | 17.00 | 850.00% |
| S R B Crawford | 4 | 2 | 17.25 | 8.10% | 13.25 | 331.25% |
| P D Niven | 1 | 1 | 15.00 | 7.04% | 14.00 | 1400.00% |
| Deborah Cole | 3 | 1 | 10.00 | 4.70% | 7.00 | 233.33% |

</details>

<details>
<summary>HURDLE R09 • 2025</summary>

- Winning race `eee23162-5009-4bb8-8aa8-de9a5a4250ec` on 2025-03-15 at Uttoxeter, £23.00 gross over 3 selected stakes.
- Winning race `b930135a-6da7-4c38-8b10-8b4fae65a5ed` on 2025-03-09 at Naas, £21.00 gross over 2 selected stakes.

| Month | Races / dates | Selections | Winners | Strike | Market n | Market E | Market A/E | SP stakes | Mean SP | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2025-01 | 131 / 20 | 226 | 41 | 18.14% | 226 | 43.22 | 0.949 | 226 | 9.62 | -58.88 | -26.05% |
| 2025-02 | 185 / 28 | 308 | 66 | 21.43% | 308 | 63.49 | 1.040 | 308 | 8.65 | -37.60 | -12.21% |
| 2025-03 | 198 / 31 | 329 | 83 | 25.23% | 329 | 75.95 | 1.093 | 329 | 7.20 | -28.81 | -8.76% |
| 2025-04 | 168 / 27 | 295 | 66 | 22.37% | 295 | 59.34 | 1.112 | 295 | 7.70 | 2.39 | 0.81% |
| 2025-05 | 132 / 27 | 211 | 50 | 23.70% | 211 | 48.24 | 1.037 | 211 | 6.92 | -37.14 | -17.60% |
| 2025-06 | 84 / 23 | 130 | 27 | 20.77% | 130 | 30.89 | 0.874 | 130 | 6.61 | -49.24 | -37.87% |
| 2025-07 | 81 / 21 | 116 | 22 | 18.97% | 116 | 23.05 | 0.955 | 116 | 8.49 | -41.43 | -35.71% |
| 2025-08 | 45 / 18 | 59 | 17 | 28.81% | 59 | 13.08 | 1.299 | 59 | 6.85 | -1.62 | -2.75% |
| 2025-09 | 72 / 22 | 107 | 32 | 29.91% | 107 | 21.86 | 1.464 | 107 | 7.89 | 26.03 | 24.33% |
| 2025-10 | 130 / 31 | 207 | 53 | 25.60% | 207 | 42.39 | 1.250 | 207 | 8.29 | 23.73 | 11.47% |
| 2025-11 | 179 / 30 | 318 | 60 | 18.87% | 318 | 61.66 | 0.973 | 318 | 9.12 | -102.90 | -32.36% |
| 2025-12 | 176 / 27 | 296 | 55 | 18.58% | 296 | 54.30 | 1.013 | 296 | 9.65 | -50.06 | -16.91% |

| Quarter | Races / dates | Selections | Winners | Strike | Market n | Market E | Market A/E | SP stakes | Mean SP | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Q1 | 514 / 79 | 863 | 190 | 22.02% | 863 | 182.66 | 1.040 | 863 | 8.35 | -125.29 | -14.52% |
| Q2 | 384 / 77 | 636 | 143 | 22.48% | 636 | 138.47 | 1.033 | 636 | 7.22 | -83.99 | -13.21% |
| Q3 | 198 / 61 | 282 | 71 | 25.18% | 282 | 57.99 | 1.224 | 282 | 7.92 | -17.02 | -6.03% |
| Q4 | 485 / 88 | 821 | 168 | 20.46% | 821 | 158.35 | 1.061 | 821 | 9.10 | -129.23 | -15.74% |

| Final decimal SP | Races / dates | Selections | Winners | Strike | Market n | Market E | Market A/E | SP stakes | Mean SP | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| <3 | 542 / 249 | 580 | 289 | 49.83% | 580 | 260.16 | 1.111 | 580 | 2.09 | -9.13 | -1.57% |
| 11–<21 | 339 / 189 | 376 | 31 | 8.24% | 376 | 23.00 | 1.348 | 376 | 14.23 | 21.00 | 5.59% |
| 21+ | 195 / 133 | 214 | 3 | 1.40% | 214 | 6.19 | 0.484 | 214 | 32.24 | -149.00 | -69.63% |
| 3–<5 | 548 / 242 | 616 | 148 | 24.03% | 616 | 143.13 | 1.034 | 616 | 3.81 | -64.40 | -10.45% |
| 5–<11 | 685 / 258 | 816 | 101 | 12.38% | 816 | 104.99 | 0.962 | 816 | 6.98 | -154.00 | -18.87% |

| Proved starter count | Races / dates | Selections | Winners | Strike | Market n | Market E | Market A/E | SP stakes | Mean SP | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 12+ | 292 / 162 | 475 | 61 | 12.84% | 475 | 59.47 | 1.026 | 475 | 12.05 | -94.23 | -19.84% |
| 2–7 | 694 / 251 | 1148 | 318 | 27.70% | 1148 | 310.46 | 1.024 | 1148 | 5.62 | -165.48 | -14.41% |
| 8–11 | 595 / 253 | 979 | 193 | 19.71% | 979 | 167.53 | 1.152 | 979 | 9.52 | -95.82 | -9.79% |

| Course | Selections | Wins | Gross £ | Share of gross | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- |
| Uttoxeter | 129 | 28 | 150.44 | 6.70% | 21.44 | 16.62% |
| Fontwell | 85 | 27 | 122.97 | 5.47% | 37.97 | 44.67% |
| Warwick | 91 | 23 | 117.17 | 5.22% | 26.17 | 28.76% |
| Chepstow | 83 | 22 | 90.65 | 4.04% | 7.65 | 9.21% |
| Fakenham | 54 | 17 | 65.14 | 2.90% | 11.14 | 20.62% |

| Trainer | Selections | Wins | Gross £ | Share of gross | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- |
| O Murphy | 184 | 48 | 194.34 | 8.65% | 10.34 | 5.62% |
| W P Mullins | 142 | 37 | 141.61 | 6.30% | -0.39 | -0.27% |
| P F Nicholls | 131 | 35 | 122.11 | 5.44% | -8.89 | -6.79% |
| F O'Brien | 130 | 29 | 112.63 | 5.01% | -17.37 | -13.36% |
| D Skelton | 134 | 23 | 100.66 | 4.48% | -33.34 | -24.88% |

</details>

<details>
<summary>HURDLE R09 • 2026</summary>

- Winning race `430ce098-2459-4355-8da2-1c008e8f650a` on 2026-07-24 at Uttoxeter, £29.00 gross over 2 selected stakes.
- Winning race `1f671bb0-ecdd-47f3-8c95-d2cc1a8dbc86` on 2026-01-10 at Kempton, £23.00 gross over 3 selected stakes.

| Month | Races / dates | Selections | Winners | Strike | Market n | Market E | Market A/E | SP stakes | Mean SP | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-01 | 133 / 26 | 231 | 56 | 24.24% | 231 | 46.67 | 1.200 | 231 | 8.77 | -7.63 | -3.30% |
| 2026-02 | 187 / 26 | 326 | 62 | 19.02% | 326 | 68.91 | 0.900 | 326 | 8.40 | -76.05 | -23.33% |
| 2026-03 | 200 / 31 | 342 | 75 | 21.93% | 342 | 68.77 | 1.091 | 342 | 8.32 | -29.77 | -8.70% |
| 2026-04 | 177 / 27 | 301 | 64 | 21.26% | 301 | 64.86 | 0.987 | 301 | 7.51 | -75.18 | -24.98% |
| 2026-05 | 138 / 28 | 232 | 54 | 23.28% | 232 | 50.60 | 1.057 | 232 | 7.11 | -30.68 | -13.22% |
| 2026-06 | 84 / 23 | 134 | 33 | 24.63% | 134 | 32.87 | 1.004 | 134 | 6.12 | -15.30 | -11.42% |
| 2026-07 | 84 / 23 | 124 | 18 | 14.52% | 124 | 26.48 | 0.680 | 124 | 7.90 | -26.29 | -21.20% |
| 2026-08 | 55 / 16 | 82 | 23 | 28.05% | 82 | 15.86 | 1.450 | 82 | 9.57 | 19.54 | 23.83% |
| 2026-09 | 90 / 22 | 145 | 29 | 20.00% | 145 | 32.01 | 0.906 | 145 | 6.68 | -24.83 | -17.12% |
| 2026-10 | 61 / 13 | 95 | 18 | 18.95% | 95 | 17.63 | 1.021 | 95 | 9.43 | -30.96 | -32.59% |

| Quarter | Races / dates | Selections | Winners | Strike | Market n | Market E | Market A/E | SP stakes | Mean SP | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Q1 | 520 / 83 | 899 | 193 | 21.47% | 899 | 184.35 | 1.047 | 899 | 8.47 | -113.44 | -12.62% |
| Q2 | 399 / 78 | 667 | 151 | 22.64% | 667 | 148.33 | 1.015 | 667 | 7.09 | -121.16 | -18.16% |
| Q3 | 229 / 61 | 351 | 70 | 19.94% | 351 | 74.36 | 0.941 | 351 | 7.79 | -31.58 | -9.00% |
| Q4 | 61 / 13 | 95 | 18 | 18.95% | 95 | 17.63 | 1.021 | 95 | 9.43 | -30.96 | -32.59% |

| Final decimal SP | Races / dates | Selections | Winners | Strike | Market n | Market E | Market A/E | SP stakes | Mean SP | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| <3 | 456 / 193 | 476 | 213 | 44.75% | 476 | 211.10 | 1.009 | 476 | 2.08 | -68.53 | -14.40% |
| 11–<21 | 240 / 141 | 265 | 16 | 6.04% | 265 | 15.93 | 1.005 | 265 | 14.28 | -39.00 | -14.72% |
| 21+ | 132 / 89 | 149 | 6 | 4.03% | 149 | 4.20 | 1.429 | 149 | 32.83 | -13.00 | -8.72% |
| 3–<5 | 441 / 184 | 504 | 121 | 24.01% | 504 | 115.72 | 1.041 | 504 | 3.81 | -57.11 | -11.33% |
| 5–<11 | 516 / 196 | 618 | 76 | 12.30% | 618 | 77.72 | 0.978 | 618 | 7.10 | -119.50 | -19.34% |

| Proved starter count | Races / dates | Selections | Winners | Strike | Market n | Market E | Market A/E | SP stakes | Mean SP | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 12+ | 226 / 134 | 401 | 55 | 13.72% | 401 | 55.49 | 0.991 | 401 | 12.26 | -55.81 | -13.92% |
| 2–7 | 528 / 185 | 864 | 231 | 26.74% | 864 | 234.41 | 0.985 | 864 | 5.45 | -150.80 | -17.45% |
| 8–11 | 455 / 184 | 747 | 146 | 19.54% | 747 | 134.77 | 1.080 | 747 | 8.49 | -90.54 | -12.12% |

| Course | Selections | Wins | Gross £ | Share of gross | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- |
| Uttoxeter | 103 | 20 | 120.00 | 7.00% | 17.00 | 16.50% |
| Worcester | 91 | 23 | 88.46 | 5.16% | -2.54 | -2.79% |
| Stratford | 84 | 20 | 83.28 | 4.86% | -0.72 | -0.86% |
| Perth | 61 | 16 | 75.51 | 4.40% | 14.51 | 23.78% |
| Chepstow | 82 | 15 | 73.69 | 4.30% | -8.31 | -10.13% |

| Trainer | Selections | Wins | Gross £ | Share of gross | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- |
| D Skelton | 195 | 63 | 165.16 | 9.63% | -29.84 | -15.30% |
| O Murphy | 155 | 38 | 124.71 | 7.27% | -30.29 | -19.54% |
| F O'Brien | 95 | 21 | 99.04 | 5.78% | 4.04 | 4.25% |
| J Candlish | 82 | 16 | 93.36 | 5.44% | 11.36 | 13.85% |
| W P Mullins | 104 | 23 | 73.14 | 4.26% | -30.86 | -29.68% |

</details>

<details>
<summary>AW R05 • 2025</summary>

- Winning race `15e7fab7-6b7b-4e8a-8753-7882202c8d27` on 2025-11-12 at Dundalk, £29.00 gross over 1 selected stakes.
- Winning race `b2dddc93-135f-4864-b3e4-7f0342375e06` on 2025-04-27 at Southwell, £26.00 gross over 1 selected stakes.

| Month | Races / dates | Selections | Winners | Strike | Market n | Market E | Market A/E | SP stakes | Mean SP | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2025-01 | 149 / 27 | 149 | 22 | 14.77% | 149 | 19.47 | 1.130 | 149 | 12.62 | -33.32 | -22.36% |
| 2025-02 | 115 / 25 | 115 | 17 | 14.78% | 115 | 14.70 | 1.156 | 115 | 11.53 | -25.26 | -21.96% |
| 2025-03 | 125 / 26 | 125 | 10 | 8.00% | 125 | 15.40 | 0.649 | 125 | 12.43 | -73.38 | -58.70% |
| 2025-04 | 96 / 22 | 96 | 12 | 12.50% | 96 | 12.91 | 0.891 | 96 | 10.27 | -9.74 | -10.14% |
| 2025-05 | 46 / 15 | 46 | 8 | 17.39% | 46 | 6.60 | 1.213 | 46 | 10.91 | 13.57 | 29.51% |
| 2025-06 | 46 / 15 | 46 | 5 | 10.87% | 46 | 5.18 | 0.965 | 46 | 13.94 | 9.25 | 20.11% |
| 2025-07 | 30 / 9 | 30 | 2 | 6.67% | 30 | 2.64 | 0.757 | 30 | 22.81 | -19.00 | -63.33% |
| 2025-08 | 66 / 19 | 66 | 10 | 15.15% | 66 | 7.11 | 1.406 | 66 | 13.17 | 8.75 | 13.26% |
| 2025-09 | 115 / 22 | 115 | 17 | 14.78% | 115 | 14.14 | 1.202 | 115 | 13.10 | -34.71 | -30.18% |
| 2025-10 | 144 / 27 | 144 | 24 | 16.67% | 144 | 18.62 | 1.289 | 144 | 12.20 | -3.22 | -2.23% |
| 2025-11 | 141 / 21 | 141 | 23 | 16.31% | 141 | 19.38 | 1.187 | 141 | 12.43 | 9.87 | 7.00% |
| 2025-12 | 145 / 25 | 145 | 27 | 18.62% | 145 | 21.35 | 1.241 | 145 | 10.03 | 9.59 | 6.61% |

| Quarter | Races / dates | Selections | Winners | Strike | Market n | Market E | Market A/E | SP stakes | Mean SP | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Q1 | 389 / 78 | 389 | 49 | 12.60% | 389 | 49.57 | 0.988 | 389 | 12.24 | -131.95 | -33.92% |
| Q2 | 188 / 52 | 188 | 25 | 13.30% | 188 | 24.68 | 0.993 | 188 | 11.33 | 13.09 | 6.96% |
| Q3 | 211 / 50 | 211 | 29 | 13.74% | 211 | 23.89 | 1.214 | 211 | 14.50 | -44.96 | -21.31% |
| Q4 | 430 / 73 | 430 | 74 | 17.21% | 430 | 59.35 | 1.238 | 430 | 11.54 | 16.24 | 3.78% |

| Final decimal SP | Races / dates | Selections | Winners | Strike | Market n | Market E | Market A/E | SP stakes | Mean SP | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| <3 | 81 / 66 | 81 | 35 | 43.21% | 81 | 30.55 | 1.129 | 81 | 2.33 | -3.28 | -4.04% |
| 11–<21 | 245 / 160 | 245 | 16 | 6.53% | 245 | 14.71 | 1.087 | 245 | 14.32 | -17.00 | -6.94% |
| 21+ | 197 / 132 | 197 | 4 | 2.03% | 197 | 5.52 | 0.725 | 197 | 35.29 | -95.00 | -48.22% |
| 3–<5 | 224 / 143 | 224 | 58 | 25.89% | 224 | 48.37 | 1.189 | 224 | 3.98 | 2.20 | 0.98% |
| 5–<11 | 471 / 197 | 471 | 64 | 13.59% | 471 | 58.34 | 1.097 | 471 | 7.16 | -34.50 | -7.32% |

| Proved starter count | Races / dates | Selections | Winners | Strike | Market n | Market E | Market A/E | SP stakes | Mean SP | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 12+ | 320 / 153 | 320 | 43 | 13.44% | 320 | 32.52 | 1.322 | 320 | 14.05 | 20.42 | 6.38% |
| 2–7 | 206 / 132 | 206 | 41 | 19.90% | 206 | 37.47 | 1.081 | 206 | 8.90 | -14.78 | -7.17% |
| 8–11 | 692 / 235 | 692 | 93 | 13.44% | 692 | 87.51 | 1.057 | 692 | 12.41 | -153.22 | -22.14% |

| Course | Selections | Wins | Gross £ | Share of gross | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- |
| Wolverhampton | 262 | 43 | 239.40 | 22.37% | -22.60 | -8.63% |
| Dundalk | 120 | 27 | 171.69 | 16.04% | 51.69 | 43.08% |
| Newcastle | 247 | 31 | 170.81 | 15.96% | -76.19 | -30.85% |
| Lingfield | 146 | 26 | 138.06 | 12.90% | -7.94 | -5.44% |
| Southwell | 187 | 17 | 134.96 | 12.61% | -52.04 | -27.83% |

| Trainer | Selections | Wins | Gross £ | Share of gross | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- |
| S C Williams | 16 | 7 | 75.50 | 7.05% | 59.50 | 371.88% |
| A W Carroll | 50 | 8 | 44.83 | 4.19% | -5.17 | -10.33% |
| A McGuinness | 12 | 6 | 38.08 | 3.56% | 26.08 | 217.36% |
| B Ellison | 10 | 2 | 30.33 | 2.83% | 20.33 | 203.33% |
| Conor Maxwell | 2 | 1 | 29.00 | 2.71% | 27.00 | 1350.00% |

</details>

<details>
<summary>AW R05 • 2026</summary>

- Winning race `94fb7d84-09db-4b4d-882e-b9bba288be91` on 2026-09-05 at Newcastle, £81.00 gross over 1 selected stakes.
- Winning race `3f9bd414-c627-41f6-a75a-f6c11b09e742` on 2026-04-06 at Kempton, £41.00 gross over 1 selected stakes.

| Month | Races / dates | Selections | Winners | Strike | Market n | Market E | Market A/E | SP stakes | Mean SP | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-01 | 165 / 28 | 165 | 30 | 18.18% | 165 | 24.79 | 1.210 | 165 | 11.77 | 38.21 | 23.16% |
| 2026-02 | 126 / 25 | 126 | 25 | 19.84% | 126 | 18.38 | 1.360 | 126 | 8.43 | 66.76 | 52.98% |
| 2026-03 | 144 / 25 | 145 | 18 | 12.41% | 145 | 21.36 | 0.843 | 145 | 9.73 | -52.53 | -36.23% |
| 2026-04 | 82 / 23 | 82 | 12 | 14.63% | 82 | 11.97 | 1.002 | 82 | 9.91 | 4.65 | 5.67% |
| 2026-05 | 31 / 14 | 31 | 1 | 3.23% | 31 | 3.21 | 0.311 | 31 | 18.16 | -18.00 | -58.06% |
| 2026-06 | 38 / 11 | 38 | 2 | 5.26% | 38 | 4.22 | 0.474 | 38 | 14.79 | -25.00 | -65.79% |
| 2026-07 | 52 / 15 | 52 | 9 | 17.31% | 52 | 6.28 | 1.434 | 52 | 12.65 | 11.50 | 22.12% |
| 2026-08 | 69 / 19 | 69 | 11 | 15.94% | 69 | 8.20 | 1.341 | 69 | 18.45 | -9.47 | -13.72% |
| 2026-09 | 76 / 15 | 76 | 11 | 14.47% | 76 | 9.09 | 1.210 | 76 | 13.42 | 81.75 | 107.57% |

| Quarter | Races / dates | Selections | Winners | Strike | Market n | Market E | Market A/E | SP stakes | Mean SP | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Q1 | 435 / 78 | 436 | 73 | 16.74% | 436 | 64.54 | 1.131 | 436 | 10.13 | 52.44 | 12.03% |
| Q2 | 151 / 48 | 151 | 15 | 9.93% | 151 | 19.41 | 0.773 | 151 | 12.83 | -38.35 | -25.40% |
| Q3 | 197 / 49 | 197 | 31 | 15.74% | 197 | 23.57 | 1.315 | 197 | 14.98 | 83.78 | 42.53% |

| Final decimal SP | Races / dates | Selections | Winners | Strike | Market n | Market E | Market A/E | SP stakes | Mean SP | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| <3 | 54 / 46 | 54 | 30 | 55.56% | 54 | 20.84 | 1.439 | 54 | 2.30 | 14.25 | 26.39% |
| 11–<21 | 138 / 99 | 138 | 14 | 10.14% | 138 | 8.53 | 1.642 | 138 | 13.97 | 60.00 | 43.48% |
| 21+ | 110 / 79 | 110 | 6 | 5.45% | 110 | 2.91 | 2.063 | 110 | 39.46 | 127.00 | 115.45% |
| 3–<5 | 152 / 96 | 152 | 31 | 20.39% | 152 | 33.80 | 0.917 | 152 | 3.86 | -34.88 | -22.94% |
| 5–<11 | 329 / 147 | 330 | 38 | 11.52% | 330 | 41.44 | 0.917 | 330 | 7.04 | -68.50 | -20.76% |

| Proved starter count | Races / dates | Selections | Winners | Strike | Market n | Market E | Market A/E | SP stakes | Mean SP | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 12+ | 166 / 95 | 166 | 20 | 12.05% | 166 | 17.42 | 1.148 | 166 | 12.73 | -9.33 | -5.62% |
| 2–7 | 149 / 96 | 149 | 37 | 24.83% | 149 | 28.48 | 1.299 | 149 | 7.74 | 18.06 | 12.12% |
| 8–11 | 468 / 157 | 469 | 62 | 13.22% | 469 | 61.62 | 1.006 | 469 | 12.87 | 89.14 | 19.01% |

| Course | Selections | Wins | Gross £ | Share of gross | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- |
| Newcastle | 131 | 25 | 239.15 | 27.12% | 108.15 | 82.56% |
| Kempton | 99 | 17 | 172.46 | 19.56% | 73.46 | 74.20% |
| Lingfield | 124 | 19 | 139.59 | 15.83% | 15.59 | 12.57% |
| Wolverhampton | 192 | 28 | 138.79 | 15.74% | -53.21 | -27.71% |
| Southwell | 152 | 24 | 127.05 | 14.41% | -24.95 | -16.42% |

| Trainer | Selections | Wins | Gross £ | Share of gross | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- |
| A Brittain | 10 | 3 | 87.38 | 9.91% | 77.38 | 773.75% |
| L A Dace | 3 | 2 | 48.50 | 5.50% | 45.50 | 1516.67% |
| A W Carroll | 27 | 6 | 45.25 | 5.13% | 18.25 | 67.59% |
| M D I Usher | 6 | 2 | 42.00 | 4.76% | 36.00 | 600.00% |
| J Butler | 15 | 7 | 38.10 | 4.32% | 23.10 | 154.00% |

</details>

<details>
<summary>TURF R05 • 2025</summary>

- Winning race `715ddd91-7a7d-45b5-b4e5-d71faf56640d` on 2025-07-02 at Tipperary, £41.00 gross over 1 selected stakes.
- Winning race `cc13d5db-6221-4d27-9088-2d52a37cea95` on 2025-05-29 at Fairyhouse, £41.00 gross over 1 selected stakes.

| Month | Races / dates | Selections | Winners | Strike | Market n | Market E | Market A/E | SP stakes | Mean SP | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2025-02 | 1 / 1 | 1 | 0 | 0.00% | 1 | 0.01 | 0.000 | 1 | 67.00 | -1.00 | -100.00% |
| 2025-03 | 22 / 4 | 22 | 2 | 9.09% | 22 | 1.63 | 1.227 | 22 | 16.91 | -8.00 | -36.36% |
| 2025-04 | 157 / 26 | 157 | 22 | 14.01% | 157 | 19.42 | 1.133 | 157 | 13.81 | -41.22 | -26.26% |
| 2025-05 | 306 / 31 | 306 | 45 | 14.71% | 306 | 36.20 | 1.243 | 306 | 15.02 | 30.29 | 9.90% |
| 2025-06 | 295 / 29 | 295 | 60 | 20.34% | 295 | 35.35 | 1.697 | 295 | 15.06 | 58.38 | 19.79% |
| 2025-07 | 322 / 31 | 322 | 55 | 17.08% | 322 | 37.84 | 1.440 | 322 | 12.25 | 67.14 | 20.85% |
| 2025-08 | 298 / 31 | 298 | 38 | 12.75% | 298 | 35.67 | 1.065 | 298 | 13.54 | -63.18 | -21.20% |
| 2025-09 | 261 / 30 | 261 | 24 | 9.20% | 261 | 30.51 | 0.787 | 261 | 14.06 | -118.15 | -45.27% |
| 2025-10 | 194 / 30 | 194 | 18 | 9.28% | 194 | 16.65 | 1.081 | 194 | 17.39 | -33.00 | -17.01% |
| 2025-11 | 15 / 5 | 15 | 0 | 0.00% | 15 | 0.98 | 0.000 | 15 | 15.97 | -15.00 | -100.00% |

| Quarter | Races / dates | Selections | Winners | Strike | Market n | Market E | Market A/E | SP stakes | Mean SP | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Q1 | 23 / 5 | 23 | 2 | 8.70% | 23 | 1.64 | 1.219 | 23 | 19.09 | -9.00 | -39.13% |
| Q2 | 758 / 86 | 758 | 127 | 16.75% | 758 | 90.97 | 1.396 | 758 | 14.78 | 47.45 | 6.26% |
| Q3 | 881 / 92 | 881 | 117 | 13.28% | 881 | 104.02 | 1.120 | 881 | 13.22 | -114.19 | -12.96% |
| Q4 | 209 / 35 | 209 | 18 | 8.61% | 209 | 17.63 | 1.021 | 209 | 17.29 | -48.00 | -22.97% |

| Final decimal SP | Races / dates | Selections | Winners | Strike | Market n | Market E | Market A/E | SP stakes | Mean SP | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| <3 | 92 / 71 | 92 | 45 | 48.91% | 92 | 34.02 | 1.323 | 92 | 2.40 | 10.26 | 11.15% |
| 11–<21 | 456 / 175 | 456 | 33 | 7.24% | 456 | 27.22 | 1.212 | 456 | 14.30 | 3.00 | 0.66% |
| 21+ | 365 / 164 | 365 | 6 | 1.64% | 365 | 9.41 | 0.638 | 365 | 38.63 | -178.00 | -48.77% |
| 3–<5 | 269 / 148 | 269 | 76 | 28.25% | 269 | 59.70 | 1.273 | 269 | 3.94 | 27.51 | 10.23% |
| 5–<11 | 689 / 198 | 689 | 104 | 15.09% | 689 | 83.92 | 1.233 | 689 | 7.27 | 13.50 | 1.96% |

| Proved starter count | Races / dates | Selections | Winners | Strike | Market n | Market E | Market A/E | SP stakes | Mean SP | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 12+ | 611 / 187 | 611 | 60 | 9.82% | 611 | 45.22 | 1.316 | 611 | 18.62 | -54.75 | -8.96% |
| 2–7 | 401 / 161 | 401 | 79 | 19.70% | 401 | 66.48 | 1.188 | 401 | 9.87 | 7.52 | 1.87% |
| 8–11 | 859 / 207 | 859 | 125 | 14.55% | 859 | 102.56 | 1.219 | 859 | 13.47 | -76.50 | -8.91% |

| Course | Selections | Wins | Gross £ | Share of gross | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- |
| Ripon | 40 | 11 | 97.62 | 5.59% | 57.62 | 144.04% |
| Doncaster | 73 | 12 | 92.75 | 5.31% | 19.75 | 27.05% |
| Fairyhouse | 16 | 5 | 73.50 | 4.21% | 57.50 | 359.38% |
| Yarmouth | 56 | 13 | 71.04 | 4.07% | 15.04 | 26.86% |
| Nottingham | 59 | 12 | 69.71 | 3.99% | 10.71 | 18.15% |

| Trainer | Selections | Wins | Gross £ | Share of gross | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- |
| T D Easterby | 89 | 11 | 54.42 | 3.11% | -34.58 | -38.86% |
| T Coyle & K Wood | 8 | 3 | 47.00 | 2.69% | 39.00 | 487.50% |
| E O'Connell | 6 | 2 | 46.00 | 2.63% | 40.00 | 666.67% |
| D Dias | 4 | 1 | 41.00 | 2.35% | 37.00 | 925.00% |
| Mrs R Carr | 18 | 7 | 35.54 | 2.03% | 17.54 | 97.45% |

</details>

<details>
<summary>TURF R05 • 2026</summary>

- Winning race `829201e4-2ffc-42ad-820a-b483d43b652f` on 2026-08-21 at Ffos Las, £41.00 gross over 1 selected stakes.
- Winning race `e866ca40-e37d-45de-ab11-010c260625c3` on 2026-06-16 at Royal Ascot, £26.00 gross over 1 selected stakes.

| Month | Races / dates | Selections | Winners | Strike | Market n | Market E | Market A/E | SP stakes | Mean SP | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-02 | 1 / 1 | 1 | 0 | 0.00% | 1 | 0.02 | 0.000 | 1 | 34.00 | -1.00 | -100.00% |
| 2026-03 | 20 / 5 | 20 | 1 | 5.00% | 20 | 1.36 | 0.734 | 20 | 19.66 | -8.00 | -40.00% |
| 2026-04 | 155 / 26 | 155 | 18 | 11.61% | 155 | 15.77 | 1.142 | 155 | 16.50 | -41.93 | -27.05% |
| 2026-05 | 286 / 31 | 286 | 40 | 13.99% | 286 | 36.12 | 1.107 | 286 | 11.66 | -86.31 | -30.18% |
| 2026-06 | 307 / 30 | 307 | 45 | 14.66% | 307 | 42.85 | 1.050 | 307 | 11.36 | -50.13 | -16.33% |
| 2026-07 | 321 / 30 | 321 | 43 | 13.40% | 321 | 41.72 | 1.031 | 321 | 13.07 | -103.58 | -32.27% |
| 2026-08 | 312 / 31 | 312 | 35 | 11.22% | 312 | 38.62 | 0.906 | 312 | 14.65 | -88.12 | -28.24% |
| 2026-09 | 195 / 19 | 195 | 19 | 9.74% | 195 | 19.86 | 0.957 | 195 | 16.17 | -29.00 | -14.87% |

| Quarter | Races / dates | Selections | Winners | Strike | Market n | Market E | Market A/E | SP stakes | Mean SP | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Q1 | 21 / 6 | 21 | 1 | 4.76% | 21 | 1.39 | 0.722 | 21 | 20.35 | -9.00 | -42.86% |
| Q2 | 748 / 87 | 748 | 103 | 13.77% | 748 | 94.74 | 1.087 | 748 | 12.54 | -178.36 | -23.84% |
| Q3 | 828 / 80 | 828 | 97 | 11.71% | 828 | 100.21 | 0.968 | 828 | 14.39 | -220.70 | -26.65% |

| Final decimal SP | Races / dates | Selections | Winners | Strike | Market n | Market E | Market A/E | SP stakes | Mean SP | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| <3 | 90 / 66 | 90 | 39 | 43.33% | 90 | 34.79 | 1.121 | 90 | 2.34 | -5.06 | -5.62% |
| 11–<21 | 346 / 139 | 346 | 17 | 4.91% | 346 | 20.74 | 0.820 | 346 | 14.15 | -112.00 | -32.37% |
| 21+ | 276 / 124 | 276 | 3 | 1.09% | 276 | 6.96 | 0.431 | 276 | 40.14 | -183.00 | -66.30% |
| 3–<5 | 260 / 125 | 260 | 63 | 24.23% | 260 | 58.30 | 1.081 | 260 | 3.86 | -17.50 | -6.73% |
| 5–<11 | 625 / 160 | 625 | 79 | 12.64% | 625 | 75.54 | 1.046 | 625 | 7.26 | -90.50 | -14.48% |

| Proved starter count | Races / dates | Selections | Winners | Strike | Market n | Market E | Market A/E | SP stakes | Mean SP | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 12+ | 516 / 150 | 516 | 45 | 8.72% | 516 | 40.51 | 1.111 | 516 | 17.87 | -128.54 | -24.91% |
| 2–7 | 373 / 132 | 373 | 67 | 17.96% | 373 | 66.34 | 1.010 | 373 | 9.30 | -86.89 | -23.30% |
| 8–11 | 708 / 164 | 708 | 89 | 12.57% | 708 | 89.48 | 0.995 | 708 | 12.76 | -192.63 | -27.21% |

| Course | Selections | Wins | Gross £ | Share of gross | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- |
| Ffos Las | 19 | 6 | 75.00 | 6.31% | 56.00 | 294.74% |
| Redcar | 43 | 8 | 57.13 | 4.80% | 14.13 | 32.85% |
| Royal Ascot | 20 | 5 | 54.00 | 4.54% | 34.00 | 170.00% |
| Windsor | 69 | 12 | 51.23 | 4.31% | -17.77 | -25.76% |
| Carlisle | 44 | 6 | 48.43 | 4.07% | 4.43 | 10.07% |

| Trainer | Selections | Wins | Gross £ | Share of gross | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- |
| J P O'Brien | 18 | 4 | 47.50 | 4.00% | 29.50 | 163.89% |
| K R Burke | 14 | 4 | 41.50 | 3.49% | 27.50 | 196.43% |
| L Williamson | 1 | 1 | 41.00 | 3.45% | 40.00 | 4000.00% |
| T D Easterby | 69 | 8 | 40.52 | 3.41% | -28.48 | -41.27% |
| J Channon | 12 | 3 | 36.00 | 3.03% | 24.00 | 200.00% |

</details>

The Chase finalist was the only profitable 2025 rule in the grid.

## G. Probability and ranking comparison

Lower log loss, Brier and calibration error are better. Negative Δ log loss favours the candidate. Winner-ranking accuracy uses a runner-ID tie break and Top 3 counts a race once. Monetary results here select the top runner by the model. The historical market models consume final SP, so their Top-1 returns are retrospective benchmarks. November uses archived pre-off captured quotes in the offset, evaluation and returns. It is a small, already monitored sample with potential feature-distribution changes. For AW the model uses Performance Rating in both periods because the frozen AW vectors do not carry the family-specific speed series.

| Family | Held quarter | Races | Final-SP market | Form-only conditional logit | SP offset L2 .04 | SP offset L2 .08 | SP offset L2 .16 | SP temperature calibration | SP offset + boosted stumps |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CHASE | Q2 | 393 | 1.66287 | 1.91409 | 1.68770 | 1.68253 | 1.67676 | 1.66274 | 1.68790 |
| CHASE | Q3 | 201 | 1.79179 | 2.01321 | 1.79312 | 1.79268 | 1.79231 | 1.79172 | 1.79587 |
| CHASE | Q4 | 575 | 1.65009 | 1.88606 | 1.64982 | 1.64977 | 1.64983 | 1.64904 | 1.64911 |
| HURDLE | Q2 | 686 | 1.69600 | 2.06492 | 1.69841 | 1.69762 | 1.69691 | 1.69245 | 1.69976 |
| HURDLE | Q3 | 423 | 1.74652 | 2.21331 | 1.74615 | 1.74619 | 1.74624 | 1.73132 | 1.74485 |
| HURDLE | Q4 | 976 | 1.63176 | 2.11378 | 1.63255 | 1.63221 | 1.63196 | 1.62413 | 1.63321 |
| AW | Q2 | 477 | 1.78182 | 2.15253 | 1.78470 | 1.78342 | 1.78267 | 1.78004 | 1.78561 |
| AW | Q3 | 510 | 1.78767 | 2.16132 | 1.78964 | 1.78904 | 1.78853 | 1.78038 | 1.78582 |
| AW | Q4 | 1041 | 1.79870 | 2.17334 | 1.79998 | 1.79957 | 1.79925 | 1.79506 | 1.80132 |
| TURF | Q3 | 2272 | 1.81362 | 2.09629 | 1.81360 | 1.81357 | 1.81356 | 1.81391 | 1.81351 |
| TURF | Q4 | 481 | 1.86431 | 2.23957 | 1.86334 | 1.86372 | 1.86398 | 1.85886 | 1.86595 |


### CHASE 2025 in-sample (1688 races)

| Model | Log loss | Brier | Calibration error | Δ log loss vs market [95% interval] | Top 1 | Top 3 | Top-1 A/E | Top-1 £ / ROI (stakes) | Without largest £ / ROI (stakes) | Without two £ / ROI (stakes) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Final-SP market | 1.69015 | 0.76935 | 0.95% | — | 33.41% | 69.73% | 1.000 | -201.39 / -11.93% (1688) | -208.89 / -12.38% (1687) | -215.39 / -12.78% (1686) |
| Form-only conditional logit | 1.91303 | 0.83402 | 0.51% | 0.22288 [0.19645 to 0.24817] | 21.21% | 56.87% | 0.999 | -335.13 / -19.85% (1688) | -349.13 / -20.70% (1687) | -363.13 / -21.54% (1686) |
| SP offset L2 .04 | 1.68837 | 0.76881 | 0.88% | -0.00179 [-0.00351 to 0.00006] | 33.47% | 69.96% | 1.003 | -205.57 / -12.18% (1688) | -213.07 / -12.63% (1687) | -219.57 / -13.02% (1686) |
| SP offset L2 .08 | 1.68876 | 0.76891 | 0.92% | -0.00139 [-0.00268 to -0.00003] | 33.41% | 70.08% | 1.001 | -207.36 / -12.28% (1688) | -214.86 / -12.74% (1687) | -221.36 / -13.13% (1686) |
| SP offset L2 .16 | 1.68917 | 0.76903 | 0.93% | -0.00098 [-0.00186 to -0.00006] | 33.23% | 69.96% | 0.995 | -218.48 / -12.94% (1688) | -225.98 / -13.40% (1687) | -232.48 / -13.79% (1686) |
| SP temperature calibration | 1.68947 | 0.76951 | 0.92% | -0.00068 [-0.00195 to 0.00062] | 33.41% | 69.73% | 1.000 | -201.39 / -11.93% (1688) | -208.89 / -12.38% (1687) | -215.39 / -12.78% (1686) |
| SP offset + boosted stumps | 1.68777 | 0.76857 | 0.88% | -0.00238 [-0.00434 to -0.00032] | 33.41% | 70.02% | 1.001 | -200.04 / -11.85% (1688) | -207.54 / -12.30% (1687) | -214.04 / -12.70% (1686) |

### CHASE 2026 fixed replay (1157 races)

| Model | Log loss | Brier | Calibration error | Δ log loss vs market [95% interval] | Top 1 | Top 3 | Top-1 A/E | Top-1 £ / ROI (stakes) | Without largest £ / ROI (stakes) | Without two £ / ROI (stakes) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Final-SP market | 1.65383 | 0.75665 | 1.02% | — | 36.82% | 72.43% | 1.085 | -50.38 / -4.35% (1157) | -56.38 / -4.88% (1156) | -61.38 / -5.31% (1155) |
| Form-only conditional logit | 1.88638 | 0.82940 | 0.70% | 0.23255 [0.20245 to 0.26490] | 20.92% | 57.30% | 0.976 | -220.19 / -19.03% (1157) | -240.19 / -20.78% (1156) | -252.19 / -21.83% (1155) |
| SP offset L2 .04 | 1.65381 | 0.75676 | 1.11% | -0.00002 [-0.00187 to 0.00196] | 36.21% | 72.17% | 1.068 | -73.24 / -6.33% (1157) | -79.24 / -6.85% (1156) | -84.24 / -7.29% (1155) |
| SP offset L2 .08 | 1.65357 | 0.75662 | 1.08% | -0.00026 [-0.00168 to 0.00119] | 36.39% | 72.17% | 1.073 | -67.21 / -5.81% (1157) | -73.21 / -6.33% (1156) | -78.21 / -6.77% (1155) |
| SP offset L2 .16 | 1.65350 | 0.75655 | 1.01% | -0.00033 [-0.00130 to 0.00065] | 36.73% | 72.17% | 1.083 | -55.96 / -4.84% (1157) | -61.96 / -5.36% (1156) | -66.96 / -5.80% (1155) |
| SP temperature calibration | 1.65284 | 0.75641 | 0.74% | -0.00099 [-0.00258 to 0.00054] | 36.82% | 72.43% | 1.085 | -50.38 / -4.35% (1157) | -56.38 / -4.88% (1156) | -61.38 / -5.31% (1155) |
| SP offset + boosted stumps | 1.65362 | 0.75686 | 1.15% | -0.00021 [-0.00223 to 0.00189] | 36.39% | 72.00% | 1.073 | -70.40 / -6.08% (1157) | -76.40 / -6.61% (1156) | -81.40 / -7.05% (1155) |

### CHASE 2026 matched promotion reference (1154 races)

| Model | Log loss | Brier | Calibration error | Δ log loss vs market [95% interval] | Top 1 | Top 3 | Top-1 A/E | Top-1 £ / ROI (stakes) | Without largest £ / ROI (stakes) | Without two £ / ROI (stakes) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Final-SP market | 1.65335 | 0.75696 | 0.99% | — | 36.74% | 72.44% | 1.083 | -53.00 / -4.59% (1154) | -59.00 / -5.12% (1153) | -64.00 / -5.56% (1152) |
| Frozen Tissue | 1.82440 | 0.81294 | 0.73% | 0.17105 [0.14048 to 0.20133] | 26.52% | 62.05% | 1.027 | -144.81 / -12.55% (1154) | -172.81 / -14.99% (1153) | -186.81 / -16.22% (1152) |
| Form-only conditional logit | 1.88537 | 0.82967 | 0.70% | 0.23202 [0.19897 to 0.26497] | 20.88% | 57.37% | 0.976 | -218.82 / -18.96% (1154) | -238.82 / -20.71% (1153) | -250.82 / -21.77% (1152) |
| SP offset L2 .04 | 1.65319 | 0.75703 | 1.09% | -0.00016 [-0.00205 to 0.00175] | 36.14% | 72.18% | 1.066 | -75.87 / -6.57% (1154) | -81.87 / -7.10% (1153) | -86.87 / -7.54% (1152) |
| SP offset L2 .08 | 1.65299 | 0.75690 | 1.06% | -0.00036 [-0.00180 to 0.00106] | 36.31% | 72.18% | 1.071 | -69.83 / -6.05% (1154) | -75.83 / -6.58% (1153) | -80.83 / -7.02% (1152) |
| SP offset L2 .16 | 1.65295 | 0.75685 | 0.99% | -0.00039 [-0.00140 to 0.00058] | 36.66% | 72.18% | 1.081 | -58.58 / -5.08% (1154) | -64.58 / -5.60% (1153) | -69.58 / -6.04% (1152) |
| SP temperature calibration | 1.65238 | 0.75672 | 0.72% | -0.00097 [-0.00262 to 0.00068] | 36.74% | 72.44% | 1.083 | -53.00 / -4.59% (1154) | -59.00 / -5.12% (1153) | -64.00 / -5.56% (1152) |
| SP offset + boosted stumps | 1.65300 | 0.75714 | 1.13% | -0.00034 [-0.00232 to 0.00166] | 36.31% | 72.01% | 1.071 | -73.03 / -6.33% (1154) | -79.03 / -6.85% (1153) | -84.03 / -7.29% (1152) |

### CHASE November frozen capture comparison (41 races)

| Model | Log loss | Brier | Calibration error | Δ log loss vs market [95% interval] | Top 1 | Top 3 | Top-1 A/E | Top-1 £ / ROI (stakes) | Without largest £ / ROI (stakes) | Without two £ / ROI (stakes) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Captured-quote market | 1.51051 | 0.74290 | 6.42% | — | 29.27% | 73.17% | 0.840 | -14.67 / -35.78% (41) | -17.17 / -42.93% (40) | -19.42 / -49.79% (39) |
| Frozen Tissue | 1.57795 | 0.76111 | 3.22% | 0.06744 [-0.02858 to 0.18809] | 26.83% | 78.05% | 0.906 | -15.38 / -37.51% (41) | -17.88 / -44.70% (40) | -20.38 / -52.26% (39) |
| Form-only conditional logit | 1.63276 | 0.77546 | 3.42% | 0.12225 [-0.03420 to 0.29203] | 29.27% | 75.61% | 1.096 | -0.06 / -0.15% (41) | -7.06 / -17.65% (40) | -12.56 / -32.21% (39) |
| Quote offset L2 .04 | 1.51202 | 0.74359 | 5.75% | 0.00151 [-0.00505 to 0.00820] | 31.71% | 73.17% | 0.910 | -11.17 / -27.24% (41) | -13.67 / -34.17% (40) | -16.17 / -41.46% (39) |
| Quote offset L2 .08 | 1.51192 | 0.74345 | 5.76% | 0.00141 [-0.00375 to 0.00659] | 31.71% | 73.17% | 0.910 | -11.17 / -27.24% (41) | -13.67 / -34.17% (40) | -16.17 / -41.46% (39) |
| Quote offset L2 .16 | 1.51170 | 0.74333 | 5.92% | 0.00119 [-0.00250 to 0.00489] | 31.71% | 73.17% | 0.910 | -11.17 / -27.24% (41) | -13.67 / -34.17% (40) | -16.17 / -41.46% (39) |
| Quote temperature calibration | 1.51032 | 0.74356 | 6.70% | -0.00019 [-0.00721 to 0.00637] | 29.27% | 73.17% | 0.840 | -14.67 / -35.78% (41) | -17.17 / -42.93% (40) | -19.42 / -49.79% (39) |
| Quote offset + boosted stumps | 1.50900 | 0.74272 | 5.79% | -0.00151 [-0.00857 to 0.00511] | 29.27% | 73.17% | 0.840 | -14.67 / -35.78% (41) | -17.17 / -42.93% (40) | -19.42 / -49.79% (39) |

### HURDLE 2025 in-sample (2891 races)

| Model | Log loss | Brier | Calibration error | Δ log loss vs market [95% interval] | Top 1 | Top 3 | Top-1 A/E | Top-1 £ / ROI (stakes) | Without largest £ / ROI (stakes) | Without two £ / ROI (stakes) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Final-SP market | 1.66475 | 0.73522 | 0.80% | — | 39.12% | 73.02% | 1.114 | -189.43 / -6.55% (2891) | -195.93 / -6.78% (2890) | -200.93 / -6.96% (2889) |
| Form-only conditional logit | 2.11386 | 0.85947 | 0.54% | 0.44911 [0.42402 to 0.47378] | 20.65% | 50.12% | 1.019 | -600.45 / -20.77% (2891) | -640.45 / -22.16% (2890) | -673.45 / -23.31% (2889) |
| SP offset L2 .04 | 1.66410 | 0.73484 | 0.82% | -0.00065 [-0.00158 to 0.00028] | 39.12% | 73.05% | 1.114 | -195.84 / -6.77% (2891) | -202.34 / -7.00% (2890) | -207.34 / -7.18% (2889) |
| SP offset L2 .08 | 1.66420 | 0.73490 | 0.80% | -0.00055 [-0.00131 to 0.00018] | 39.09% | 73.05% | 1.113 | -200.43 / -6.93% (2891) | -206.93 / -7.16% (2890) | -211.93 / -7.34% (2889) |
| SP offset L2 .16 | 1.66433 | 0.73497 | 0.82% | -0.00042 [-0.00097 to 0.00011] | 39.02% | 73.02% | 1.111 | -203.43 / -7.04% (2891) | -209.93 / -7.26% (2890) | -214.93 / -7.44% (2889) |
| SP temperature calibration | 1.65633 | 0.73256 | 0.24% | -0.00842 [-0.01223 to -0.00460] | 39.12% | 73.02% | 1.114 | -189.43 / -6.55% (2891) | -195.93 / -6.78% (2890) | -200.93 / -6.96% (2889) |
| SP offset + boosted stumps | 1.66341 | 0.73460 | 0.81% | -0.00133 [-0.00233 to -0.00029] | 39.26% | 72.71% | 1.118 | -177.52 / -6.14% (2891) | -184.02 / -6.37% (2890) | -190.02 / -6.58% (2889) |

### HURDLE 2026 fixed replay (2031 races)

| Model | Log loss | Brier | Calibration error | Δ log loss vs market [95% interval] | Top 1 | Top 3 | Top-1 A/E | Top-1 £ / ROI (stakes) | Without largest £ / ROI (stakes) | Without two £ / ROI (stakes) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Final-SP market | 1.71701 | 0.75378 | 0.51% | — | 35.30% | 70.26% | 1.038 | -296.99 / -14.62% (2031) | -302.99 / -14.93% (2030) | -308.49 / -15.20% (2029) |
| Form-only conditional logit | 2.12696 | 0.86064 | 0.77% | 0.40995 [0.37882 to 0.44002] | 20.88% | 50.62% | 0.993 | -412.58 / -20.31% (2031) | -434.58 / -21.41% (2030) | -456.58 / -22.50% (2029) |
| SP offset L2 .04 | 1.71770 | 0.75415 | 0.47% | 0.00068 [-0.00054 to 0.00192] | 35.25% | 70.51% | 1.037 | -302.30 / -14.88% (2031) | -308.30 / -15.19% (2030) | -313.30 / -15.44% (2029) |
| SP offset L2 .08 | 1.71751 | 0.75406 | 0.45% | 0.00050 [-0.00048 to 0.00146] | 35.35% | 70.46% | 1.040 | -292.80 / -14.42% (2031) | -298.80 / -14.72% (2030) | -303.80 / -14.97% (2029) |
| SP offset L2 .16 | 1.71734 | 0.75397 | 0.50% | 0.00032 [-0.00038 to 0.00102] | 35.35% | 70.46% | 1.040 | -292.21 / -14.39% (2031) | -298.21 / -14.69% (2030) | -303.21 / -14.94% (2029) |
| SP temperature calibration | 1.71255 | 0.75341 | 0.28% | -0.00446 [-0.00872 to 0.00006] | 35.30% | 70.26% | 1.038 | -296.99 / -14.62% (2031) | -302.99 / -14.93% (2030) | -308.49 / -15.20% (2029) |
| SP offset + boosted stumps | 1.71831 | 0.75412 | 0.44% | 0.00129 [-0.00019 to 0.00276] | 35.40% | 70.31% | 1.042 | -293.34 / -14.44% (2031) | -299.34 / -14.75% (2030) | -304.34 / -15.00% (2029) |

### HURDLE November frozen capture comparison (54 races)

| Model | Log loss | Brier | Calibration error | Δ log loss vs market [95% interval] | Top 1 | Top 3 | Top-1 A/E | Top-1 £ / ROI (stakes) | Without largest £ / ROI (stakes) | Without two £ / ROI (stakes) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Captured-quote market | 1.61917 | 0.71113 | 1.74% | — | 38.89% | 74.07% | 1.124 | -11.00 / -20.37% (54) | -13.25 / -25.00% (53) | -15.50 / -29.81% (52) |
| Frozen Tissue | 1.96591 | 0.81681 | 1.44% | 0.34674 [0.18858 to 0.49487] | 24.07% | 53.70% | 0.980 | -23.64 / -43.78% (54) | -28.14 / -53.09% (53) | -30.89 / -59.40% (52) |
| Form-only conditional logit | 2.16262 | 0.87338 | 1.97% | 0.54345 [0.38052 to 0.68323] | 12.96% | 44.44% | 0.802 | -24.79 / -45.91% (54) | -34.79 / -65.64% (53) | -40.79 / -78.44% (52) |
| Quote offset L2 .04 | 1.61851 | 0.71193 | 2.20% | -0.00066 [-0.00684 to 0.00550] | 38.89% | 74.07% | 1.124 | -11.00 / -20.37% (54) | -13.25 / -25.00% (53) | -15.50 / -29.81% (52) |
| Quote offset L2 .08 | 1.61859 | 0.71182 | 2.20% | -0.00058 [-0.00564 to 0.00439] | 38.89% | 74.07% | 1.124 | -11.00 / -20.37% (54) | -13.25 / -25.00% (53) | -15.50 / -29.81% (52) |
| Quote offset L2 .16 | 1.61870 | 0.71164 | 2.21% | -0.00047 [-0.00410 to 0.00313] | 38.89% | 74.07% | 1.124 | -11.00 / -20.37% (54) | -13.25 / -25.00% (53) | -15.50 / -29.81% (52) |
| Quote temperature calibration | 1.60057 | 0.70498 | 1.37% | -0.01860 [-0.03872 to 0.00540] | 38.89% | 74.07% | 1.124 | -11.00 / -20.37% (54) | -13.25 / -25.00% (53) | -15.50 / -29.81% (52) |
| Quote offset + boosted stumps | 1.61939 | 0.71152 | 2.03% | 0.00022 [-0.00771 to 0.00741] | 38.89% | 74.07% | 1.124 | -11.00 / -20.37% (54) | -13.25 / -25.00% (53) | -15.50 / -29.81% (52) |

### AW 2025 in-sample (3078 races)

| Model | Log loss | Brier | Calibration error | Δ log loss vs market [95% interval] | Top 1 | Top 3 | Top-1 A/E | Top-1 £ / ROI (stakes) | Without largest £ / ROI (stakes) | Without two £ / ROI (stakes) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Final-SP market | 1.76181 | 0.76655 | 0.77% | — | 35.58% | 69.20% | 1.114 | -180.91 / -5.88% (3078) | -185.91 / -6.04% (3077) | -190.41 / -6.19% (3076) |
| Form-only conditional logit | 2.13475 | 0.86836 | 0.54% | 0.37295 [0.35077 to 0.39394] | 18.71% | 47.60% | 0.991 | -599.06 / -19.46% (3078) | -665.06 / -21.61% (3077) | -705.06 / -22.92% (3076) |
| SP offset L2 .04 | 1.76166 | 0.76653 | 0.74% | -0.00014 [-0.00056 to 0.00027] | 35.12% | 69.33% | 1.100 | -234.16 / -7.61% (3078) | -238.66 / -7.76% (3077) | -243.16 / -7.91% (3076) |
| SP offset L2 .08 | 1.76169 | 0.76654 | 0.73% | -0.00011 [-0.00046 to 0.00022] | 35.09% | 69.40% | 1.099 | -236.66 / -7.69% (3078) | -241.16 / -7.84% (3077) | -245.66 / -7.99% (3076) |
| SP offset L2 .16 | 1.76172 | 0.76654 | 0.74% | -0.00009 [-0.00034 to 0.00017] | 35.06% | 69.36% | 1.098 | -239.91 / -7.79% (3078) | -244.41 / -7.94% (3077) | -248.91 / -8.09% (3076) |
| SP temperature calibration | 1.75640 | 0.76468 | 0.20% | -0.00541 [-0.00819 to -0.00247] | 35.58% | 69.20% | 1.114 | -180.91 / -5.88% (3078) | -185.91 / -6.04% (3077) | -190.41 / -6.19% (3076) |
| SP offset + boosted stumps | 1.76039 | 0.76603 | 0.73% | -0.00141 [-0.00232 to -0.00049] | 35.35% | 69.40% | 1.107 | -217.29 / -7.06% (3078) | -222.79 / -7.24% (3077) | -227.29 / -7.39% (3076) |

### AW 2026 fixed replay (1990 races)

| Model | Log loss | Brier | Calibration error | Δ log loss vs market [95% interval] | Top 1 | Top 3 | Top-1 A/E | Top-1 £ / ROI (stakes) | Without largest £ / ROI (stakes) | Without two £ / ROI (stakes) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Final-SP market | 1.74682 | 0.76664 | 0.67% | — | 35.38% | 68.54% | 1.081 | -177.78 / -8.93% (1990) | -182.28 / -9.16% (1989) | -186.78 / -9.40% (1988) |
| Form-only conditional logit | 2.09621 | 0.86354 | 1.22% | 0.34939 [0.31984 to 0.37922] | 20.00% | 51.71% | 1.030 | -384.29 / -19.31% (1990) | -434.29 / -21.83% (1989) | -467.29 / -23.51% (1988) |
| SP offset L2 .04 | 1.74672 | 0.76661 | 0.71% | -0.00011 [-0.00060 to 0.00037] | 35.23% | 68.79% | 1.076 | -194.86 / -9.79% (1990) | -199.36 / -10.02% (1989) | -203.86 / -10.25% (1988) |
| SP offset L2 .08 | 1.74677 | 0.76664 | 0.74% | -0.00005 [-0.00046 to 0.00034] | 35.23% | 68.74% | 1.076 | -195.36 / -9.82% (1990) | -199.86 / -10.05% (1989) | -204.36 / -10.28% (1988) |
| SP offset L2 .16 | 1.74680 | 0.76665 | 0.72% | -0.00002 [-0.00032 to 0.00027] | 35.23% | 68.74% | 1.076 | -194.24 / -9.76% (1990) | -198.74 / -9.99% (1989) | -203.24 / -10.22% (1988) |
| SP temperature calibration | 1.74411 | 0.76569 | 0.45% | -0.00271 [-0.00656 to 0.00121] | 35.38% | 68.54% | 1.081 | -177.78 / -8.93% (1990) | -182.28 / -9.16% (1989) | -186.78 / -9.40% (1988) |
| SP offset + boosted stumps | 1.74742 | 0.76696 | 0.67% | 0.00060 [-0.00051 to 0.00169] | 34.97% | 68.89% | 1.069 | -210.23 / -10.56% (1990) | -214.73 / -10.80% (1989) | -219.23 / -11.03% (1988) |

### AW November frozen capture comparison (55 races)

| Model | Log loss | Brier | Calibration error | Δ log loss vs market [95% interval] | Top 1 | Top 3 | Top-1 A/E | Top-1 £ / ROI (stakes) | Without largest £ / ROI (stakes) | Without two £ / ROI (stakes) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Captured-quote market | 1.98308 | 0.81185 | 1.12% | — | 32.73% | 63.64% | 1.098 | -7.17 / -13.04% (55) | -10.50 / -19.44% (54) | -13.83 / -26.09% (53) |
| Frozen Tissue | 2.15214 | 0.86126 | 0.78% | 0.16906 [0.01248 to 0.36411] | 21.82% | 50.91% | 0.983 | 2.23 / 4.05% (55) | -5.77 / -10.69% (54) | -13.77 / -25.98% (53) |
| Form-only conditional logit | 2.27787 | 0.88876 | 0.23% | 0.29479 [0.11457 to 0.44385] | 23.64% | 47.27% | 1.306 | 10.70 / 19.45% (55) | -0.30 / -0.56% (54) | -8.30 / -15.66% (53) |
| Quote offset L2 .04 | 1.98189 | 0.81147 | 0.79% | -0.00118 [-0.00494 to 0.00109] | 30.91% | 63.64% | 1.037 | -11.50 / -20.91% (55) | -14.83 / -27.46% (54) | -17.83 / -33.64% (53) |
| Quote offset L2 .08 | 1.98230 | 0.81156 | 0.79% | -0.00077 [-0.00377 to 0.00100] | 30.91% | 63.64% | 1.037 | -11.50 / -20.91% (55) | -14.83 / -27.46% (54) | -17.83 / -33.64% (53) |
| Quote offset L2 .16 | 1.98259 | 0.81164 | 0.98% | -0.00048 [-0.00269 to 0.00085] | 30.91% | 63.64% | 1.037 | -11.50 / -20.91% (55) | -14.83 / -27.46% (54) | -17.83 / -33.64% (53) |
| Quote temperature calibration | 1.98713 | 0.81375 | 1.44% | 0.00405 [-0.02089 to 0.03726] | 32.73% | 63.64% | 1.098 | -7.17 / -13.04% (55) | -10.50 / -19.44% (54) | -13.83 / -26.09% (53) |
| Quote offset + boosted stumps | 1.97629 | 0.80980 | 0.82% | -0.00678 [-0.01413 to 0.00096] | 34.55% | 65.45% | 1.159 | -2.67 / -4.85% (55) | -6.17 / -11.43% (54) | -9.50 / -17.92% (53) |

### TURF 2025 in-sample (4720 races)

| Model | Log loss | Brier | Calibration error | Δ log loss vs market [95% interval] | Top 1 | Top 3 | Top-1 A/E | Top-1 £ / ROI (stakes) | Without largest £ / ROI (stakes) | Without two £ / ROI (stakes) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Final-SP market | 1.81143 | 0.78229 | 0.47% | — | 32.39% | 66.80% | 1.032 | -575.08 / -12.18% (4720) | -582.08 / -12.33% (4719) | -588.58 / -12.48% (4718) |
| Form-only conditional logit | 2.12503 | 0.86470 | 0.51% | 0.31360 [0.29503 to 0.33401] | 19.39% | 48.11% | 1.021 | -820.02 / -17.37% (4720) | -853.02 / -18.08% (4719) | -886.02 / -18.78% (4718) |
| SP offset L2 .04 | 1.81008 | 0.78177 | 0.44% | -0.00135 [-0.00224 to -0.00053] | 32.75% | 66.69% | 1.044 | -514.04 / -10.89% (4720) | -521.04 / -11.04% (4719) | -528.04 / -11.19% (4718) |
| SP offset L2 .08 | 1.81043 | 0.78191 | 0.44% | -0.00101 [-0.00163 to -0.00042] | 32.67% | 66.69% | 1.041 | -526.86 / -11.16% (4720) | -533.86 / -11.31% (4719) | -540.86 / -11.46% (4718) |
| SP offset L2 .16 | 1.81076 | 0.78204 | 0.43% | -0.00068 [-0.00109 to -0.00028] | 32.56% | 66.69% | 1.037 | -550.19 / -11.66% (4720) | -557.19 / -11.81% (4719) | -564.19 / -11.96% (4718) |
| SP temperature calibration | 1.80959 | 0.78193 | 0.26% | -0.00184 [-0.00324 to -0.00045] | 32.39% | 66.80% | 1.032 | -575.08 / -12.18% (4720) | -582.08 / -12.33% (4719) | -588.58 / -12.48% (4718) |
| SP offset + boosted stumps | 1.81044 | 0.78195 | 0.43% | -0.00099 [-0.00166 to -0.00034] | 32.54% | 66.72% | 1.037 | -553.40 / -11.72% (4720) | -560.40 / -11.88% (4719) | -567.40 / -12.03% (4718) |

### TURF 2026 fixed replay (4048 races)

| Model | Log loss | Brier | Calibration error | Δ log loss vs market [95% interval] | Top 1 | Top 3 | Top-1 A/E | Top-1 £ / ROI (stakes) | Without largest £ / ROI (stakes) | Without two £ / ROI (stakes) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Final-SP market | 1.76601 | 0.76940 | 0.55% | — | 34.24% | 69.57% | 1.056 | -443.70 / -10.96% (4048) | -449.20 / -11.10% (4047) | -454.70 / -11.24% (4046) |
| Form-only conditional logit | 2.09746 | 0.85986 | 0.66% | 0.33145 [0.31119 to 0.35105] | 20.21% | 51.36% | 1.018 | -780.20 / -19.27% (4048) | -820.20 / -20.27% (4047) | -853.20 / -21.09% (4046) |
| SP offset L2 .04 | 1.76640 | 0.76953 | 0.50% | 0.00039 [-0.00061 to 0.00144] | 33.92% | 69.37% | 1.047 | -467.71 / -11.55% (4048) | -473.21 / -11.69% (4047) | -478.71 / -11.83% (4046) |
| SP offset L2 .08 | 1.76621 | 0.76944 | 0.49% | 0.00021 [-0.00052 to 0.00094] | 33.92% | 69.39% | 1.046 | -471.76 / -11.65% (4048) | -477.26 / -11.79% (4047) | -482.76 / -11.93% (4046) |
| SP offset L2 .16 | 1.76610 | 0.76940 | 0.50% | 0.00009 [-0.00039 to 0.00057] | 33.89% | 69.39% | 1.045 | -479.77 / -11.85% (4048) | -485.27 / -11.99% (4047) | -490.77 / -12.13% (4046) |
| SP temperature calibration | 1.76324 | 0.76869 | 0.29% | -0.00276 [-0.00422 to -0.00119] | 34.24% | 69.57% | 1.056 | -443.70 / -10.96% (4048) | -449.20 / -11.10% (4047) | -454.70 / -11.24% (4046) |
| SP offset + boosted stumps | 1.76613 | 0.76935 | 0.54% | 0.00012 [-0.00067 to 0.00091] | 33.99% | 69.42% | 1.048 | -470.82 / -11.63% (4048) | -476.32 / -11.77% (4047) | -481.82 / -11.91% (4046) |

### TURF November frozen capture comparison (6 races)

| Model | Log loss | Brier | Calibration error | Δ log loss vs market [95% interval] | Top 1 | Top 3 | Top-1 A/E | Top-1 £ / ROI (stakes) | Without largest £ / ROI (stakes) | Without two £ / ROI (stakes) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Captured-quote market | 2.42331 | 0.87244 | 1.09% | — | 33.33% | 33.33% | 2.053 | 0.88 / 14.67% (6) | -2.12 / -42.40% (5) | -4.00 / -100.00% (4) |
| Frozen Tissue | 2.72960 | 0.93930 | 2.33% | 0.30629 [—] | 0.00% | 16.67% | 0.000 | -6.00 / -100.00% (6) | — | — |
| Form-only conditional logit | 2.58919 | 0.91505 | 0.52% | 0.16587 [—] | 0.00% | 16.67% | 0.000 | -6.00 / -100.00% (6) | — | — |
| Quote offset L2 .04 | 2.43110 | 0.87394 | 1.11% | 0.00778 [—] | 33.33% | 33.33% | 2.053 | 0.88 / 14.67% (6) | -2.12 / -42.40% (5) | -4.00 / -100.00% (4) |
| Quote offset L2 .08 | 2.43026 | 0.87373 | 1.10% | 0.00694 [—] | 33.33% | 33.33% | 2.053 | 0.88 / 14.67% (6) | -2.12 / -42.40% (5) | -4.00 / -100.00% (4) |
| Quote offset L2 .16 | 2.42851 | 0.87339 | 1.10% | 0.00519 [—] | 33.33% | 33.33% | 2.053 | 0.88 / 14.67% (6) | -2.12 / -42.40% (5) | -4.00 / -100.00% (4) |
| Quote temperature calibration | 2.41990 | 0.86942 | 1.06% | -0.00342 [—] | 33.33% | 33.33% | 2.053 | 0.88 / 14.67% (6) | -2.12 / -42.40% (5) | -4.00 / -100.00% (4) |
| Quote offset + boosted stumps | 2.43102 | 0.87332 | 1.10% | 0.00770 [—] | 33.33% | 33.33% | 2.053 | 0.88 / 14.67% (6) | -2.12 / -42.40% (5) | -4.00 / -100.00% (4) |

### Model money concentration

The expandable tables cover every probability configuration with positive in-sample Top-1 SP P/L and its fixed 2026 replay. Market-conditioned selections depend on retrospective prices in these tables.

No probability configuration recorded positive 2025 Top-1 SP P/L.

## H. Tissue disagreement

These descriptive cells are formed only in books with frozen Tissue and a complete market. A runner can appear in more than one agreement comparison. Odds rank here is a benchmark characteristic. Chase T3 is one fixed comparison. AW's archived pre-off vectors do not expose the same AW speed input, so its speed cell is unavailable.

### 2026 historical Chase

| Family | Tissue group | Races / dates | Selections | Winners | Strike | Market n | Market E | Market A/E | SP stakes | Mean SP | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CHASE | T1 agrees with market top slot | 492 / 209 | 492 | 191 | 38.82% | 492 | 186.80 | 1.023 | 492 | 2.63 | -51.19 | -10.40% |
| CHASE | T1 disagrees with family speed rank 1 | 873 / 231 | 873 | 212 | 24.28% | 873 | 215.11 | 0.986 | 873 | 5.42 | -138.76 | -15.89% |
| CHASE | Chase T3 (all covered) | 1145 / 236 | 1145 | 187 | 16.33% | 1145 | 184.79 | 1.012 | 1145 | 9.19 | -176.76 | -15.44% |
| CHASE | T1 disagrees with OR rank 1 | 766 / 227 | 766 | 191 | 24.93% | 766 | 175.84 | 1.086 | 766 | 5.81 | -81.19 | -10.60% |
| CHASE | T1 agrees with family speed rank 1 | 267 / 153 | 267 | 89 | 33.33% | 267 | 78.99 | 1.127 | 267 | 4.44 | -7.67 | -2.87% |
| CHASE | T1 differs from market top slot | 662 / 220 | 662 | 115 | 17.37% | 662 | 111.19 | 1.034 | 662 | 7.11 | -93.63 | -14.14% |
| CHASE | T1 agrees with OR rank 1 | 312 / 170 | 312 | 93 | 29.81% | 312 | 97.38 | 0.955 | 312 | 4.03 | -45.39 | -14.55% |

### November captured quotes

| Family | Tissue group | Races / dates | Selections | Winners | Strike | Market n | Market E | Market A/E | Quote stakes | Mean quote | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CHASE | T1 agrees with market top slot | 21 / 11 | 21 | 7 | 33.33% | 21 | 7.45 | 0.939 | 21 | 2.75 | -7.26 | -34.57% |
| CHASE | T1 disagrees with OR rank 1 | 30 / 11 | 30 | 7 | 23.33% | 30 | 8.65 | 0.810 | 30 | 3.42 | -11.28 | -37.60% |
| CHASE | T1 agrees with family speed rank 1 | 13 / 7 | 13 | 5 | 38.46% | 13 | 4.41 | 1.134 | 13 | 2.84 | -1.55 | -11.92% |
| CHASE | Chase T3 (all covered) | 40 / 11 | 40 | 12 | 30.00% | 40 | 7.45 | 1.611 | 40 | 7.89 | 25.21 | 63.02% |
| CHASE | T1 differs from market top slot | 20 / 10 | 20 | 4 | 20.00% | 20 | 4.69 | 0.853 | 20 | 4.71 | -8.12 | -40.60% |
| CHASE | T1 disagrees with family speed rank 1 | 28 / 11 | 28 | 6 | 21.43% | 28 | 7.74 | 0.776 | 28 | 4.11 | -13.83 | -49.39% |
| CHASE | T1 agrees with OR rank 1 | 9 / 7 | 9 | 2 | 22.22% | 9 | 2.53 | 0.789 | 9 | 5.07 | -5.74 | -63.78% |
| HURDLE | T1 agrees with market top slot | 20 / 10 | 20 | 9 | 45.00% | 20 | 7.84 | 1.148 | 20 | 2.46 | -4.64 | -23.20% |
| HURDLE | T1 disagrees with OR rank 1 | 23 / 10 | 23 | 3 | 13.04% | 23 | 3.72 | 0.807 | 23 | 5.86 | -10.75 | -46.74% |
| HURDLE | T1 disagrees with family speed rank 1 | 39 / 11 | 39 | 7 | 17.95% | 39 | 8.60 | 0.814 | 39 | 5.48 | -20.18 | -51.74% |
| HURDLE | T1 differs from market top slot | 34 / 12 | 34 | 4 | 11.76% | 34 | 5.43 | 0.737 | 34 | 6.74 | -19.00 | -55.88% |
| HURDLE | T1 agrees with OR rank 1 | 7 / 5 | 7 | 0 | 0.00% | 7 | 1.00 | 0.000 | 7 | 10.15 | -7.00 | -100.00% |
| HURDLE | T1 agrees with family speed rank 1 | 12 / 8 | 12 | 4 | 33.33% | 12 | 3.38 | 1.185 | 12 | 4.89 | -3.79 | -31.58% |
| AW | T1 agrees with market top slot | 21 / 8 | 21 | 6 | 28.57% | 21 | 7.51 | 0.799 | 21 | 2.55 | -9.77 | -46.52% |
| AW | T1 agrees with OR rank 1 | 12 / 6 | 12 | 1 | 8.33% | 12 | 2.96 | 0.338 | 12 | 4.17 | -10.17 | -84.75% |
| AW | T1 differs from market top slot | 34 / 8 | 34 | 6 | 17.65% | 34 | 4.69 | 1.278 | 34 | 8.74 | 12.00 | 35.29% |
| AW | T1 disagrees with OR rank 1 | 33 / 8 | 33 | 6 | 18.18% | 33 | 5.23 | 1.147 | 33 | 8.31 | 8.25 | 25.00% |
| TURF | T1 differs from market top slot | 6 / 1 | 6 | 0 | 0.00% | 6 | 0.59 | 0.000 | 6 | 9.67 | -6.00 | -100.00% |
| TURF | T1 disagrees with OR rank 1 | 5 / 1 | 5 | 0 | 0.00% | 5 | 0.50 | 0.000 | 5 | 10.20 | -5.00 | -100.00% |
| TURF | T1 disagrees with family speed rank 1 | 6 / 1 | 6 | 0 | 0.00% | 6 | 0.59 | 0.000 | 6 | 9.67 | -6.00 | -100.00% |
| TURF | T1 agrees with OR rank 1 | 1 / 1 | 1 | 0 | 0.00% | 1 | 0.09 | 0.000 | 1 | 7.00 | -1.00 | -100.00% |

## I. Research Filters

The existing filters support race family, jump subtype, handicap, current race class, distance and field size, runner layoff, historical exposures, participant rates, official-rating and speed/performance ranks, and some OR-relative comparisons. Check competition ranks and the full-runner population when mapping a rule. Filter field size can prefer cached actual count, whereas this experiment uses declared count where size is an input. The family-specific speed series and previous-run OR comparator need the precise research definitions to reproduce these results. Market offset, temperature, the nonlinear score, history availability checks and model disagreement cannot be represented by a simple saved form threshold.

The existing saved Chase, Jump handicap and Turf trainer + TPR filters were reproduced in a separate canonical comparison using their exact saved definitions. This run used those results as context and did not read or update saved records. [Existing cross-year replay](research-filter-cross-year-2026-11-18.md)

## J. Interpretation and independent testing

**Why the Chase result failed.** Its 2025 +£41.05 was close to April’s +£39.36 alone. The two largest returns were £29 and £23 gross. Removing both left −£8.95 (−2.28%). The 11–<21 band contributed +£53.00 in 2025 and −£24.00 on exactly 73 replay stakes. The 21+ band lost money in both windows. The 61–125-day sensitivity gave +11.40% in 2025 and −39.60% in the replay. Neither moving that endpoint by five days nor omitting the biggest winners rescues the result. All three replay field-size bands lost money. Course and trainer tables show concentration across relatively small cells, with no stable explanation for the return reversal.

**Why the AW replay is insufficient.** The fixed speed/OR disagreement rule returned +12.48% from 784 stakes in 2026, after −12.12% from 1,218 in 2025. Market A/E was similar across the two windows (1.117 and 1.107), with both intervals including 1. Newcastle and Kempton supplied 46.68% of 2026 winning gross. The SP 81 and 41 winners accounted for the apparent edge, with ROI falling to −2.83% when both were removed. The same disagreement in Turf lost in both periods and its A/E fell from 1.230 to 1.024. A/E is relative to normalized probabilities, while cash returns use bookmaker SP. A/E above 1 can coexist with a loss, especially when the extra winners come from shorter price bands.

**Probability evidence.** In all four families, the fitted market calibration exponent was above one (Chase 1.051, Hurdle 1.159, AW 1.132 and Turf 1.078). It assigns relatively more probability to shorter-priced runners. Fixed 2026 replay log loss fell in each family. Turf improved from 1.76601 to 1.76324 per race (paired difference −0.00276, 95% interval −0.00422 to −0.00119) and Brier from 0.76940 to 0.76869. Hurdle’s larger point improvement (−0.00446) had an interval extending just above zero. The form-based offsets and nonlinear stumps did not reliably improve upon the raw market, even before using the calibrated market as the harder benchmark. No probability configuration made money on 2025 top picks. The final-SP market also beat frozen Chase Tissue on the matched 1,154 promotion-reference races (log loss 1.65335 versus 1.82440). On the same proved starter fields, Chase T3 returned −15.44% with market A/E 1.012. The separate November captured-quote subset gave T3 +63.02% from 40 stakes across 11 dates and was already monitored. Selection into that available-book subset and the different price basis limit comparison.

### Research hypotheses

1. **Market calibration as a benchmark.** Independently test a frozen power calibration against the raw market using a consistent, genuinely pre-off quote timestamp. Lead with paired log loss, Brier and calibration. The final-SP result is evidence for a calibration study, with no implication of a selection or cash-return advantage.
2. **AW speed versus OR disagreement as an observational control.** If this fixed rule is observed in independent data, test winner credit against calibrated pre-off market expectation and report removal of the two biggest wins. Its cross-year return reversal gives it lower priority than the calibration benchmark.

None of the tested rules or model configurations merits promotion to a prospective betting trial. Any independent work should be observational and pre-registered, with feature and roster availability proved at the quote timestamp. The 2025 finalist was chosen by observed ROI, 2026 had already informed the project, and the historical roster reflects eventual starters. Those constraints apply even though target results and final SP were excluded from the simple-rule and form-only scores.

## K. Reproduction and integrity

The frozen fit reproduced byte-for-byte in a second run. TypeScript typecheck, targeted ESLint and 75 existing tests passed. The two offline extractions verified that the source files and accepted result payloads retained their SHA-256 hashes.

```sh
bun scripts/extract-retrospective-market-research.ts 2025 > /tmp/retrospective-2025.json
bun scripts/retrospective-market-research.ts fit /tmp/retrospective-2025.json > /tmp/retrospective-market-freeze.json
bun scripts/extract-retrospective-market-research.ts 2026 > /tmp/retrospective-2026.json
bun scripts/retrospective-market-research.ts report /tmp/retrospective-2025.json /tmp/retrospective-market-freeze.json /tmp/retrospective-2026.json
```

The fit command consumes only the 2025 export. The report command checks its SHA-256, the experiment specification hash and the analysis-script hash against the frozen artifact. The accompanying research output contains all full fitted parameters and stump cutpoints, forward-quarter scores, all 72 discovery rule results, and the frozen finalists. [Frozen 2025 fit and rule evidence](retrospective-market-beating-models-2026-fit.json)

The historical and prospective files are input only. Lower counts or changed inputs produce a different source fingerprint. November is evaluated separately as a frozen-vector comparability check. Existing v3 settlements are used directly. Legacy books require every runner to have a valid classified finish, a consistent winner and dead-heat divisor, and a canonical v3 recomputation that reproduces the recorded return to 1e−10. This offline projection changed no archived settlement. The resulting quote samples contain 41 Chase, 54 Hurdle, 55 AW and six Turf races. All six Turf races share one date.

- Experiment configuration SHA-256 `c323104dd3ed75aa5fbb992679b5d778e47a045e019fb1c97a45c5c414f49bc5`
- Analysis script SHA-256 `b435dade588f957496b4dc28d27a48eada5b0fbafc2cad1456fe6063e2a56725`
- Extraction script SHA-256 `d1bc872d0e654a7013405fb18baaef22aedd14e806095321f02fca4f1bd455ce`
- 2026 sampled input SHA-256 `103a2e758e3464b4cc6881bb9fa683968b454bbdace9c21dfcb996aaa3bb222b`
- 2025 sampled input SHA-256 `2c6fcf6f789861b8517629a0774b8cb6b6b25931aee8ac727051007fa0adff62`
- Frozen 2025 rules and parameters SHA-256 `06fa006d6306b3c93cc15b8d30a16bc430c6fd491c405222e22e17afe45742af`
- 2025 raw settlement proof digest `ce3a96e1eb5ccd5b83c232101a7ebaa1ad3cd172721d474dbd2a61be361afa12` across 12377 rechecked payloads
- 2026 raw settlement proof digest `14da6d52769438c33f80d25d4e07dc1ff21d36e0b87d4e01df042db40ee5d600` across 9226 rechecked payloads

<details>
<summary>Cache and frozen input hashes</summary>

| Path | SHA-256 |
| --- | --- |
| `data/research/backtest-cache/backtest_features_v4-sporting_life-all_weather_flat-2025-01-01-2025-12-31/features.ndjson` | `53889057d138e2fc219bda6cb734e5bfa7acc2e9d80980ab25b15018744508c5` |
| `data/research/backtest-cache/backtest_features_v4-sporting_life-all_weather_flat-2025-01-01-2025-12-31/manifest.json` | `d1bbbb09c22695c36e849c38738b083f5746b5f203176674b059b1659243bd2d` |
| `data/research/backtest-cache/backtest_features_v4-sporting_life-all_weather_flat-2025-01-01-2025-12-31/outcomes.ndjson` | `96740c036e921f02bf6345be8b558d99317cd73851cd4bbf0db5c6ac7b9d505b` |
| `data/research/backtest-cache/backtest_features_v4-sporting_life-all_weather_flat-2026-01-01-2026-12-31/features.ndjson` | `64daab4be939ca78fe239d088dfa04ee2c92e05b57cac1ee27d251121ba8fe23` |
| `data/research/backtest-cache/backtest_features_v4-sporting_life-all_weather_flat-2026-01-01-2026-12-31/manifest.json` | `b582149b78e40e25587f34f134cae61415ca1e589d07ef74a5a759981de25020` |
| `data/research/backtest-cache/backtest_features_v4-sporting_life-all_weather_flat-2026-01-01-2026-12-31/outcomes.ndjson` | `8be9c77ecf1c2ea274d263f2e587f8c0dfc1eb8c419c59a768c4f3b9aa09ca28` |
| `data/research/backtest-cache/backtest_features_v4-sporting_life-jump-2025-01-01-2025-12-31/features.ndjson` | `dd8a3eab0ffbd877dc6523fdce7d2e084d4cf0085b111b6317cbfb028ea311c0` |
| `data/research/backtest-cache/backtest_features_v4-sporting_life-jump-2025-01-01-2025-12-31/manifest.json` | `456b33c8ca19d5a0e66767bf9f715fc840f005e80c68bac0f9e7e7255d34d1d7` |
| `data/research/backtest-cache/backtest_features_v4-sporting_life-jump-2025-01-01-2025-12-31/outcomes.ndjson` | `ea9b38fdf2220c324ed441a394679e930eb62fa13505d66d467ba46e27a3ec21` |
| `data/research/backtest-cache/backtest_features_v4-sporting_life-turf_flat-2025-01-01-2025-12-31/features.ndjson` | `23ec9e565873bf1172bd6b52bbef5f5a1188999a4e09a840a8179dd6b2e8dc2d` |
| `data/research/backtest-cache/backtest_features_v4-sporting_life-turf_flat-2025-01-01-2025-12-31/manifest.json` | `7de0b79cd85165976ed0f5b399dfa001b459cc7c8d5ce2ac4b46dc2dfedf838b` |
| `data/research/backtest-cache/backtest_features_v4-sporting_life-turf_flat-2025-01-01-2025-12-31/outcomes.ndjson` | `edbaf29eda3554066e9b67ba65b444334ed56e2e3de38aaed2e7ba6ca9db92b6` |
| `data/research/backtest-cache/backtest_features_v4-sporting_life-turf_flat-2026-01-01-2026-12-31/features.ndjson` | `4ca446e1b066119d91346cd0aa843a3683a8d31e8c82bd02c2f59b53d42fbd74` |
| `data/research/backtest-cache/backtest_features_v4-sporting_life-turf_flat-2026-01-01-2026-12-31/manifest.json` | `868d98792212fbf155c5b6df3c970d648610713cbcfce26fbb1b38eb32709d7f` |
| `data/research/backtest-cache/backtest_features_v4-sporting_life-turf_flat-2026-01-01-2026-12-31/outcomes.ndjson` | `b68f51f0a1ef3a8b06d45439fe86a55ced3575073bd7666c4e7e3e965effcb3a` |
| `data/research/jump-2026-isolated-candidate-2026-11-11-vKE4Te/cache/backtest_features_v4-sporting_life-jump-2026-01-01-2026-10-14/features.ndjson` | `23b50dbb51cb1b19943d9e453d96ea79cdb74aafa1ffe94ceda51c1b4922de93` |
| `data/research/jump-2026-isolated-candidate-2026-11-11-vKE4Te/cache/backtest_features_v4-sporting_life-jump-2026-01-01-2026-10-14/manifest.json` | `9e32f91f75b3ec6b198ede2ffe568f069697fc1303bdd2b6f0adcdee3b912260` |
| `data/research/jump-2026-isolated-candidate-2026-11-11-vKE4Te/cache/backtest_features_v4-sporting_life-jump-2026-01-01-2026-10-14/outcomes.ndjson` | `cf63d22701e9f80f74b245ec7142ef1031223d6e7833eaead7fd20b82ad69997` |
| `data/research/jump-2026-isolated-candidate-2026-11-11-vKE4Te/candidate-provenance.json` | `9bb3a4fdb414308c68cab605ff8294076ba2c05595b27937f3ecf9bdd92f55f0` |
| `data/research/jump-2026-isolated-candidate-2026-11-11-vKE4Te/database-races.json` | `76fb4c73e8db2c23b24d8d61dbbe839ebb9a05f96ff2d6ef2c2d7ee33bdbf173` |
| `data/research/jump-2026-isolated-candidate-2026-11-11-vKE4Te/database-runners.json` | `cbc9ad5778f2bd43720604f5580d57b90e179cbd0f94edbe024dfb080fcb38e9` |
| `data/research/jump-2026-isolated-candidate-2026-11-11-vKE4Te/eligibility.ndjson` | `7a1c593abbf7f8b8bdb8800b78f31cbb618e523afde12373ae3bbf14cce2b90b` |
| `data/research/jump-2026-isolated-candidate-2026-11-11-vKE4Te/exclusion-summary.json` | `60d5ea2202b6266173b0069997474f2360689cd128b695616a7f3967c4a31c37` |
| `data/research/jump-2026-isolated-candidate-2026-11-11-vKE4Te/prebuild.json` | `f0a90e625f2e0f8d95132624654dd65fbfd2fbe1c5450d500e2d3c413e88353d` |
| `data/research/jump-2026-isolated-candidate-2026-11-11-vKE4Te/validation.json` | `daa8bab83f784822ef6041d1272919857be37f792650085bc2ffdd34e656daf3` |
| `data/research/tissue-generation-chase-promotion-2026-11.json` | `56116ca16d8e3d514d407833b08a8de6c7a6e253c3fd733aaf995ebe49ab1ff2` |
| `data/research/tissue-generation-forward-2026-11.json` | `55f4877dac4c9c8c488d35fb2cccc3a3f5c3cd88405632487daa1f604a04d537` |

</details>
