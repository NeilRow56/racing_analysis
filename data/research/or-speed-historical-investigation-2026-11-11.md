# OR + Best L3 Speed: historical investigation

As of 11 November 2026. Research only. **Classification: insufficient evidence; continue existing prospective observation.** Best L3 Speed adds modest finishing-order information to OR, but OR/Speed rank disagreement does not demonstrate a repeatable market advantage or a viable SP return. Stop threshold exploration on these historical samples; retain the existing frozen observation only. No new hypothesis is recommended.

## Data coverage and provenance

Read only: current Sporting Life AW feature caches loaded through `loadLatestBacktestFeatureCacheForYear`, with its existing invalidation, schema, source and calculation-version guards. Both accepted manifests use `backtest_features_v4 / historical_target_metrics_v4`, `aw_speed_v1`, `weight_performance_v1`, `todays_rating_v1`. The unrelated Turf/Jump version entries do not redefine AW. Cache build timestamps: 2025, 20 September 2026 05:50:19.291 UTC; 2026, 22 September 2026 15:44:22.014 UTC. The 2026 manifest ends 31 December but actual rows end **21 September**; no later historical data is implied.

| Period | Actual dates | Cached rows / races | NR/void | Cached starters | Unverified-field races / starters | Verified-field starters | Matched runners / races |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2025 | 2025-01-01–2025-12-31 | 30633 / 3104 | 1978 | 28655 | 1343 / 12611 | 16044 | 10675 / 1561 |
| 2026 | 2026-01-01–2026-09-21 | 19065 / 2008 | 1103 | 17962 | 796 / 7203 | 10759 | 7653 / 1081 |

Complete-field eligibility is verified **before inclusion in the primary analysis**: cached non-void starter count must equal the consistent known actual runner count. This accepts 1,761 / 1,212 races. Count discrepancies exclude 1,343 / 796 races and 12,611 / 7,203 starters; whether these reflect missing rows or inaccurate field-size metadata cannot be resolved read only. No count was corrected or inferred. Of verified-field starters, missing OR is 3,074 / 1,825; missing Speed 3,980 / 2,277; missing either 5,369 / 3,106 (overlapping counts). After matching, all 10,675 / 7,653 runners have settlement, valid SP and complete-book benchmarks: zero further benchmark or settlement exclusions. Matching removes another 200 / 131 verified races with no runner carrying both metrics. Missing features and field-verification exclusions create substantial selection bias; these estimates need not generalize to all AW declarations. Date spans do not establish continuous daily coverage.

Historical Best L3 Speed is the stored canonical `bestSpeedLast3`, equal to `bestAwSpeedLast3` on every cached row. It is the maximum eligible AW Speed in the existing canonical last-three prior-run window, not the last three available AW figures selected from an unlimited history. Historical features are calculated as of the target race using prior runs; these are reconstructed historical caches, not contemporaneously captured declarations or obtainable bookmaker prices. OR is the target-race OR stored in the historical record.

## Existing evidence and exact hypotheses

**A. Whole-race disagreement:** competition ranks descending over complete verified starter fields with each metric available, calculated before matching or selecting runners. Missing values have no rank; finite zero/negative Speed remains valid. Ties share rank and leave gaps (86,84,84,82 → 1,2,2,4); rank ≤3 can include more than three runners. Speed-missing horses still count in OR rank. NR/void runners are excluded under the current historical comparison convention. All portfolios below share the same OR-and-Speed-valid population.

Fixed before outcomes were calculated: let gap = OR rank − Best L3 Speed rank. A = Speed rank 1; B = Speed rank ≤3; C = gap >0; D = materially better, gap ≥3; E = Speed rank ≤3 and OR rank ≥4; F = equal ranks. The descriptive gap ladder is 1–2, 3–5, ≥6. No threshold or portfolio was selected by historical profit.

**B. Frozen same-OR experiment:** group the captured displayed declaration field by exactly equal finite OR. Among at least two runners with finite family Best L3, select only a unique highest-Speed runner; edge = its Speed minus the next-highest Speed. Tied leaders, singleton groups, and missing comparisons have no edge. Top-three OR means captured OR competition rank ≤3; rank 4+ means >3. Edge ≥10 uses the exact unrounded difference; the combined cohort requires both conditions. This edge is measured in Speed points, not rank positions. Captured displayed non-runners remain in comparison groups and OR ranks; later NR/void outcomes leave performance denominators. This is deliberately different from historical starter ranking. Neither hypothesis is a combined rating.

Prior review: `docs/today-or-speed-display.md` records earlier same-OR diagnostics: higher OR horses won more often, but the same-OR Speed effect was not materially stronger near the top; it also references a restrictive AW large-edge candidate. No corresponding preserved numerical historical same-OR report was found in the repository or available temporary research reports, so those statements are background, not newly verified numerical evidence. The frozen implementation and ledger are the authoritative prospective definitions. The prior Latest Speed versus Latest Today’s Rating report (`/private/tmp/aw-phase1-report.md`) already found better ordering without reliable market value; it was reviewed, not rerun. `diagnose-aw-best-l3-calibration.ts` investigates **Best L3 Performance**, including OR disagreement, rather than this unadjusted Best L3 Speed hypothesis. `diagnose-best-l3-rank-value.ts` studies a trainer ≥15%, field ≤5 baseline, not the full AW question. The new evidence here is matched whole-race **Best L3 Speed versus OR**, normalized complete-market evaluation, and a current frozen-ledger snapshot.

## Historical comparison

£1 per selected runner, uncapped actual historical SP, canonical dead-heat settlement, no commission or price uplift. Selections equal matched qualifying runners; every selection in these tables is settled. Winners/strike rate count winning runners. Expected wins = sum of normalized inverse SP over a **complete actual starter book**, built before selections. A/E uses fractional dead-heat wins and expected wins on exactly the same benchmark-covered subset. A/E >1 can coexist with negative ROI because normalization removes the SP overround. Unverifiable starter fields are excluded from both return and A/E primary estimates. These are not captured pre-race prices.

| Year / category | Selections = settled | Races | Winners | Win % | SP P/L £ | ROI % | Expected wins | A/E | Benchmark N / excluded |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2025 Matched all | 10675 | 1561 | 1227 | 11.49 | -2304.13 | -21.58 | 1211.34 | 1.009 | 10675 / 0 |
| 2025 OR rank 1 | 1893 | 1345 | 318 | 16.80 | -287.56 | -15.19 | 308.12 | 1.029 | 1893 / 0 |
| 2025 OR ranks 1–3 | 4089 | 1533 | 620 | 15.16 | -858.60 | -21.00 | 616.10 | 1.001 | 4089 / 0 |
| 2025 A Speed rank 1 | 1482 | 1482 | 252 | 17.00 | -335.22 | -22.62 | 252.14 | 0.997 | 1482 / 0 |
| 2025 B Speed ranks 1–3 | 4274 | 1545 | 639 | 14.95 | -922.36 | -21.58 | 636.24 | 1.000 | 4274 / 0 |
| 2025 C Speed better than OR | 4949 | 1383 | 507 | 10.24 | -1241.70 | -25.09 | 510.41 | 0.993 | 4949 / 0 |
| 2025 D Gap >=3 | 2734 | 1195 | 259 | 9.47 | -733.39 | -26.82 | 263.57 | 0.983 | 2734 / 0 |
| 2025 E Speed <=3 and OR >=4 | 2226 | 1255 | 257 | 11.55 | -518.88 | -23.31 | 260.45 | 0.987 | 2226 / 0 |
| 2025 F Equal ranks | 1507 | 995 | 239 | 15.86 | -38.63 | -2.56 | 218.08 | 1.089 | 1507 / 0 |
| 2026 Matched all | 7653 | 1081 | 891 | 11.64 | -1710.05 | -22.34 | 882.14 | 1.008 | 7653 / 0 |
| 2026 OR rank 1 | 1331 | 951 | 242 | 18.18 | -210.76 | -15.83 | 220.25 | 1.097 | 1331 / 0 |
| 2026 OR ranks 1–3 | 3016 | 1068 | 474 | 15.72 | -540.69 | -17.93 | 460.55 | 1.027 | 3016 / 0 |
| 2026 A Speed rank 1 | 1040 | 1039 | 204 | 19.62 | 3.57 | 0.34 | 184.93 | 1.103 | 1040 / 0 |
| 2026 B Speed ranks 1–3 | 3022 | 1073 | 496 | 16.41 | -231.39 | -7.66 | 466.46 | 1.061 | 3022 / 0 |
| 2026 C Speed better than OR | 3416 | 990 | 363 | 10.63 | -744.41 | -21.79 | 370.58 | 0.978 | 3416 / 0 |
| 2026 D Gap >=3 | 1842 | 839 | 193 | 10.48 | -371.77 | -20.18 | 182.24 | 1.056 | 1842 / 0 |
| 2026 E Speed <=3 and OR >=4 | 1523 | 891 | 198 | 13.00 | -115.23 | -7.57 | 186.22 | 1.061 | 1523 / 0 |
| 2026 F Equal ranks | 1083 | 702 | 151 | 13.94 | -300.45 | -27.74 | 149.72 | 1.009 | 1083 / 0 |

Eleven of the twelve A–F year/category portfolios lose. Disagreement alone (C) has A/E 0.993 / 0.978 and ROI −25.09% / −21.79%. D and E improve in 2026 but fail to repeat a market edge from 2025. Speed rank 1 returns just +£3.57 (+0.34%) in 2026, versus −£335.22 (−22.62%) in 2025; removing its largest winner makes 2026 ROI −3.51%. This is not a repeatable break-even result.

| Gap category | 2025 N / ROI % / A/E | 2026 N / ROI % / A/E |
| --- | --- | --- |
| Gap 1–2 | 2215 / -22.95 / 1.005 | 1574 / -23.67 / 0.903 |
| Gap 3–5 | 1940 / -32.16 / 0.937 | 1309 / -25.34 / 1.034 |
| Gap >=6 | 794 / -13.79 / 1.120 | 533 / -7.53 / 1.124 |

## Predictive ordering versus market value

Within-race unequal finishing-position pairs on identical matched runners with positive numeric finishes and valid SP; score ties receive half credit, finish ties are omitted. The market ranks lower SP first. The same verified complete starter fields underlie both ordering and A/E; pair comparisons additionally require valid numeric finishes. Started non-finishers remain losing settlements but are not assigned invented numeric finishes in this ordering calculation.

| Year | Pairs / races | Speed accuracy % | OR accuracy % | SP accuracy % | Speed minus OR, percentage points (95% CI) | Same-OR pairs: Speed / SP % |
| --- | --- | --- | --- | --- | --- | --- |
| 2025 | 38934 / 1425 | 56.21 | 55.14 | 66.90 | 1.07 [0.05, 2.05] | 3366: 53.12 / 65.76 |
| 2026 | 28158 / 1009 | 57.49 | 56.08 | 66.87 | 1.42 [0.32, 2.61] | 2348: 57.33 / 65.31 |

Equal-race weighting agrees: Speed / OR / SP accuracy is 56.37% / 55.35% / 67.09% in 2025 and 57.72% / 55.72% / 66.77% in 2026. Within exactly equal OR pairs, Speed orders finishers above the tied-OR 50% baseline in both years, but the market orders them substantially better. This supports descriptive information beyond OR, not incremental information beyond SP or an independently validated conditional betting model. These pairwise same-OR observations are not the frozen unique-leader cohort.

## Fixed breakdowns

The table shows C, the primary rank-disagreement hypothesis. Full counts, races, winners, strike rate, P/L, ROI, expected wins, A/E and exclusions for **every category**, by handicap status, field size, final-SP band, quarter and month, are in the accompanying CSV. SP bands are retrospective diagnostics and cannot be used as executable pre-race filters.

| C: Speed better than OR | 2025 settled / ROI % / A/E | 2026 settled / ROI % / A/E |
| --- | --- | --- |
| Type handicap | 4583 / -23.79 / 0.978 | 3048 / -21.39 / 0.978 |
| Type non_handicap | 360 / -40.94 / 1.208 | 356 / -27.61 / 0.938 |
| Type unknown | 6 / -70.00 / 0.749 | 12 / 49.24 / 1.812 |
| Field 12–15 | 1431 / -21.20 / 1.037 | 839 / -38.51 / 0.882 |
| Field 16+ | 34 / -26.47 / 0.989 | 14 / -21.43 / 1.689 |
| Field 2–7 | 731 / -23.54 / 0.977 | 599 / -8.96 / 1.030 |
| Field 8–11 | 2753 / -27.51 / 0.983 | 1964 / -18.56 / 0.983 |
| SP (1, 3] | 254 / -9.78 / 1.083 | 214 / -8.79 / 1.062 |
| SP (11, 21] | 1129 / -23.38 / 0.890 | 720 / -15.28 / 1.027 |
| SP (3, 6] | 1117 / -17.53 / 0.996 | 783 / -23.38 / 0.911 |
| SP (6, 11] | 1230 / -13.01 / 1.033 | 892 / -16.76 / 1.000 |
| SP 21+ | 1219 / -48.97 / 0.730 | 807 / -35.07 / 0.939 |

Calendar consistency: C loses in every quarter of both years. Its quarterly ROI is −21.87%, −15.69%, −37.01%, −28.03% in 2025 and −18.98%, −23.09%, −28.75% in 2026 (Q3 ends 21 September). No known handicap/non-handicap C group or field-size C band is profitable in either year. The small “unknown” handicap group and the 16+ starter bands (only 34 / 14 C runners) are not candidates. The detailed fixed breakdowns identify any isolated positive cells transparently; no follow-on threshold search was performed.

## Robustness

| Year / category | A/E 95% interval | Best winner: decimal SP / net £ | Share of winning gross % | ROI excluding that runner % | Positive months / observed months |
| --- | --- | --- | --- | --- | --- |
| 2025 A Speed rank 1 | [0.892, 1.102] | 26 / 25 | 2.27 | -24.32 | 2 / 12 |
| 2025 B Speed ranks 1–3 | [0.946, 1.054] | 67 / 66 | 2.00 | -23.13 | 1 / 12 |
| 2025 C Speed better than OR | [0.932, 1.058] | 67 / 66 | 1.81 | -26.43 | 2 / 12 |
| 2025 D Gap >=3 | [0.881, 1.088] | 67 / 66 | 3.35 | -29.25 | 2 / 12 |
| 2025 E Speed <=3 and OR >=4 | [0.885, 1.083] | 67 / 66 | 3.92 | -26.29 | 3 / 12 |
| 2025 F Equal ranks | [0.985, 1.198] | 201 / 200 | 13.69 | -15.85 | 3 / 12 |
| 2025 Gap >=6 | [0.889, 1.363] | 67 / 66 | 9.79 | -22.13 | 4 / 12 |
| 2026 A Speed rank 1 | [0.975, 1.229] | 41 / 40 | 3.93 | -3.51 | 4 / 9 |
| 2026 B Speed ranks 1–3 | [0.997, 1.125] | 51 / 50 | 1.83 | -9.31 | 3 / 9 |
| 2026 C Speed better than OR | [0.906, 1.058] | 51 / 50 | 1.91 | -23.26 | 0 / 9 |
| 2026 D Gap >=3 | [0.932, 1.177] | 41 / 40 | 2.79 | -22.37 | 1 / 9 |
| 2026 E Speed <=3 and OR >=4 | [0.937, 1.178] | 41 / 40 | 2.91 | -10.20 | 3 / 9 |
| 2026 F Equal ranks | [0.883, 1.142] | 34 / 33 | 4.34 | -30.82 | 1 / 9 |
| 2026 Gap >=6 | [0.861, 1.393] | 41 / 40 | 8.32 | -15.06 | 5 / 9 |

Intervals use 2,000 deterministic race-cluster percentile bootstrap resamples (seed 20261111), keeping within-race dependence and the actual covered A/E subset. They are pointwise exploratory uncertainty intervals, not multiplicity-adjusted proof, and do not account for repeated horses across races or shared meeting conditions. Every A–F interval includes 1. Largest-winner removal drops its £1 stake as well as its profit. Gap ≥6 has A/E about 1.12 in both years, but returns −13.79% / −7.53%, with wide uncertainty and no stable profit. Speed rank 1 in 2026 is the sole positive A–F portfolio and is only +0.34%; Now The Eagle at decimal 41 (+£40) accounts for more than the entire +£3.57 portfolio profit. Neither is promoted to a candidate.

| Complete OR-and-Speed starter fields | 2025 N / ROI % / A/E | 2026 N / ROI % / A/E |
| --- | --- | --- |
| A Speed rank 1 | 497 / -32.00 / 0.789 | 455 / -0.27 / 1.126 |
| C Speed better than OR | 1732 / -21.80 / 0.993 | 1531 / -15.61 / 0.982 |
| D Gap >=3 | 859 / -28.71 / 0.949 | 776 / -13.86 / 1.067 |
| E Speed <=3 and OR >=4 | 765 / -28.05 / 0.933 | 662 / -1.76 / 1.080 |

As a missing-feature sensitivity check, restricting to races with all actual starters present and both metrics valid leaves 497 / 454 races. Disagreement C still loses and has A/E below 1 in both years. Speed rank 1 shifts from strongly negative in 2025 to nearly break-even in 2026. These narrower fields are another selected population, not a cure for coverage bias. 2025 is development evidence. Previously inspected 2026 is exploratory evidence, not a fresh holdout. Unequal calendar coverage and field composition limit year-on-year comparisons.

**Unverified-field sensitivity, not primary evidence:** retaining all cached fields gives 19,199 / 12,764 matched runners. C ROI is −21.25% / −19.09%; Speed rank 1 is −14.03% / −7.10%. The ≥6 gap group is −14.07% / +2.86%, but the 2026 gain becomes −5.97% after removing Spartan Fighter at decimal 81. Those extra fields fail the recorded starter-count check; ranks cannot be certified complete. The apparent positive gap result disappears in the verified-field population. The separate sensitivity JSON preserves all original calculations; no outcome-based field eligibility was used.

## Frozen prospective evidence: separate hypothesis

`OR_BEST_L3_SPEED_FORWARD_V1`, activation **2026-10-21T08:39:44.000Z**. Frozen exact inputs and first-capture times were read unchanged. Turf observed race dates: 22 October–7 November; AW: 22 October–11 November. Turf captures range `2026-10-22T02:50:06.304Z` to `2026-11-07T04:38:50.404Z`; AW to `2026-11-11T05:15:45.591Z`. Speed versions are `turf_speed_v2` / `aw_speed_v1`; recorded settlements use `canonical_settlement_v2`. Snapshot audit found zero duplicate race/runner pairs, pre-epoch/post-off captures, inconsistent Top-3 or ≥10 flags, or nonpositive/arithmetic edge mismatches. No results were refreshed or backfilled.

| Family / frozen cohort | Observations / races | Settled starters | Winners | Win % | Top-3 % | Mean normalized finish | NR/void / pending |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TURF ALL SPEED EDGES | 255 / 91 | 210 | 15 | 7.14 | 20.00 | 0.500 | 15 / 30 |
| TURF TOP-3 OR SPEED EDGES | 64 / 58 | 53 | 5 | 9.43 | 24.53 | 0.494 | 5 / 6 |
| TURF OR RANK 4+ SPEED EDGES | 191 / 81 | 157 | 10 | 6.37 | 18.47 | 0.502 | 10 / 24 |
| TURF EDGE >=10 | 72 / 51 | 57 | 4 | 7.02 | 15.79 | 0.492 | 7 / 8 |
| TURF TOP-3 OR + EDGE >=10 | 16 / 16 | 11 | 1 | 9.09 | 18.18 | 0.488 | 2 / 3 |
| AW ALL SPEED EDGES | 232 / 118 | 215 | 20 | 9.30 | 32.09 | 0.450 | 11 / 6 |
| AW TOP-3 OR SPEED EDGES | 85 / 79 | 78 | 8 | 10.26 | 38.46 | 0.448 | 6 / 1 |
| AW OR RANK 4+ SPEED EDGES | 147 / 97 | 137 | 12 | 8.76 | 28.47 | 0.452 | 5 / 5 |
| AW EDGE >=10 | 65 / 50 | 61 | 4 | 6.56 | 31.15 | 0.431 | 2 / 2 |
| AW TOP-3 OR + EDGE >=10 | 22 / 21 | 22 | 1 | 4.55 | 36.36 | 0.439 | 0 / 0 |

Normalized finish is (finish rank −1)/(settled starters −1), lower is better; started non-finishers rank last. NR/voids and pending observations are outside performance denominators. Winning runners include dead-heat winners, as frozen. No cohort has 300 settled starters, and the Top-3 OR + ≥10 cohorts have only 11 / 22. Top-3 OR edges have higher win and Top-3 rates than rank 4+ edges, which is consistent with OR context alone. Increasing the Speed edge to ≥10 does not improve win rate in either family. Mean normalized finish near 0.45 for AW is descriptive: there is no matched no-edge or market baseline in this ledger. Turf is near 0.50. Neither supplies a market-value test.

These overlapping cohorts must not be pooled; historical observations must not be appended to them. No captured pre-race prices exist in this tracker, so prospective P/L, ROI and market A/E are **not calculated**. The frozen same-OR hypothesis neither validates nor directly contradicts the historical whole-race disagreement result. Its samples and absent price benchmark cannot establish a realistic break-even opportunity.

## Conclusions and interface reproducibility

- **Does Speed add to OR?** Yes for descriptive finishing order, including tied-OR pairs, consistently across both years. A fully conditional causal or predictive improvement beyond OR plus other race factors has not been established.
- **Does disagreement beat market expectations?** No convincing evidence. C is below A/E 1 in both years; D and E do not repeat an edge. Eleven of twelve A–F portfolios lose; the exception is +0.34% in 2026 and fails largest-winner removal.
- **What repeats?** Better Speed ordering, substantially stronger SP ordering, and broad portfolio losses. The ≥6 gap A/E uplift repeats but remains uncertain and unprofitable in both verified-field samples.
- **Does prospective evidence support the historical claim?** It observes a different frozen same-OR selection rule. It shows no clear increasing-edge win benefit and cannot test market outperformance. Keep Turf/AW and the two hypotheses separate.
- **Continue or stop?** **Insufficient evidence; continue existing prospective observation only.** Stop mining these historical samples and do not create a strategy, monitor or revised threshold. No specific candidate qualifies for independent validation, and no additional hypothesis is recommended.

Research Filters can reproduce Best L3 Speed rank 1 and ≤3 with AW, the same dates and an OR-valid population, but exact primary replication also requires the complete-starter-field gate; the current workspace applies complete books to the benchmark rather than gating every selected return. Thus its ungated headline returns match the broader sensitivity population, not the primary report. Advanced Filters provide OR-rank criteria, including Speed ≤3 plus OR ≥4 and the OR reference portfolios. Full-field ranks must remain computed before those filters. The comparison workspace provides historical SP summaries, complete-book A/E, standard breakdowns and winner concentration. It lacks OR as a side-by-side comparison model, a native condition comparing **two rank values** (gap/equality), matched Speed-versus-OR ordering diagnostics, race-cluster A/E intervals, a monthly portfolio summary in this workspace, and the frozen same-OR unique-leader condition. Thus the interface can reproduce the A/B/E selection logic and context slices, but cannot reproduce this complete report directly; the standalone calculations fill those analysis gaps without changing the app. Forward Research → Secondary Monitoring already reproduces the prospective cohort summaries.

## Audit and deliverables

No application code, database, cache, model, frozen rule, prospective ledger, collection process or live selection was changed. All seven input files (six cache files plus the ledger) retained identical SHA-256 hashes during analysis; hashes and source manifests are in the JSON evidence. Existing unrelated working-tree changes were left intact. Validation: 81 relevant existing tests passed; the temporary analysis script passed strict TypeScript checking. All 26 portfolios were independently checked against the existing Research `rankRows` helper, including counts, winners, P/L, A/E and breakdown/monthly partitions. The temporary Python report-editing helper passed the project Pyright command with zero errors or warnings; no Python scraping or training code was changed.

- [Complete evidence JSON](or-speed-historical-investigation-2026-11-11.json): manifests, source hashes, definitions, all summaries, bootstrap intervals, outliers, monthly results, complete-field sensitivity, prospective snapshot.
- [Detailed historical breakdown CSV](or-speed-historical-investigation-2026-11-11-breakdowns.csv): all predefined categories and fixed breakdowns; separate years, no pooled estimate.
- [Monthly CSV](or-speed-historical-investigation-2026-11-11-monthly.csv): every category/year/month.
- [Unverified-field sensitivity JSON](or-speed-historical-investigation-2026-11-11-unverified-field-sensitivity.json): broader cached population, excluded from primary evidence.
- Calculation source retained at `/private/tmp/or-speed-investigation/analyze.ts`; run from the repository with `bun run /private/tmp/or-speed-investigation/analyze.ts`. It only reads existing evidence and writes temporary analysis outputs. Statistical definitions are also documented above and in the JSON.

Implementation references: `src/lib/racing/backtest-cache.ts`, `research-model-comparison.ts`, `or-speed-comparison.ts`, `or-speed-forward.ts`, `scripts/track-or-speed-forward.ts`, `docs/research-filters-phase-1.md`, and `docs/today-or-speed-display.md`.
