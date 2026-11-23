# Saved Research Filters across 2025 and 2026

## Frozen definitions

All four records are frozen with 1 January–31 December 2025 as their development date range. Ranges below are inclusive. The replay changes only the evaluation dates in memory. Trainer cohorts use prior-calendar-year wins for the applicable family, subject to the current resolver’s minimum of 50 prior-year runners with recorded finishing positions. Thus the 2025 replay uses 2024 standings and the 2026 replay uses 2025 standings.

| Saved record | Exact selection conditions |
| --- | --- |
| Chases - 2026 non summer | Jump, chase subtype, top 20 trainers, at least 30 days since run, at least 5 prior runs, trainer prior win rate at least 14%, jockey prior win rate at least 15%, official-rating race rank 1–3. The saved rule has no summer exclusion. |
| Jump Handicap | Jump handicaps, top 20 trainers, 154–163 lb, at least 14 days since run and trainer prior win rate at least 14%. |
| Jump - handicap 2 | Identical canonical rule and rule identity to Jump Handicap. Its stored summaries came from earlier cache and settlement versions. |
| Trainer 30 1-50 days | Flat turf, top 30 trainers, 1–50 days since run, latest Performance Rating race rank 2–5, TPR_S2_V1 race rank exactly 1. |

The saved snapshots do not establish a universal 2026 loss. The older Jump - handicap 2 record shows +10.88% in 2025 and +3.95% in its recorded 2026 sample. Replaying its own archived inputs with corrected settlement restored 190 and 192 omitted non-finisher losses, yielding **−4.39% and −13.54%** respectively. Jump Handicap already recorded −8.86% on its later 2025 cache. The archived Turf result was positive in both years, at +26.11% and +35.56%. Correcting its original 2025 snapshot yields +25.27%, while the 2026 archived result is unchanged. The Chase record has no saved 2026 result. [Fixed-snapshot settlement audit](../data/research/settlement-v3-validation-2026-11-11-final/report.md)

## Measurement

- Uncapped £1 win stakes at historical Sporting Life starting price, under canonical settlement v3. Refunds and unresolved outcomes are excluded. A classified result without valid SP can contribute to outcome-only strike, but cannot enter settled stakes. Dead-heat payouts and market-expected comparisons use fractional credit. The caches have final SP, with no comparable captured pre-race quote book for these historical cohorts.
- Market A/E compares fractional winner credits with normalized inverse SP across complete starter fields, on the same selected runners. The price-only control chooses one shortest-SP runner on each selected race with a valid full market, breaking ties by runner ID. The favourite control has shorter odds and a different number of stakes where the rule selects multiple runners. Its raw ROI is descriptive.
- Same-season comparisons use the intersection of recorded calendar windows. A second comparison gives both years the same mix of month, subtype, field-size band and race-class band. Each shared cell contributes the smaller count, with equal weighting within each year and cell. A final sensitivity also balances broad SP bands. This is retrospective common-support weighting, and sparse exclusions can change the estimand.
- Largest winners are removed by distinct race and every selection in that race is removed. ROI and A/E intervals use date clusters. They are descriptive and do not adjust for past rule selection or the number of current diagnostic cuts.
- The 2026 Jump default cache has a superseded timing guard. The audit instead uses the existing isolated, pinned 2026 reconstruction and requires independent final-result roster proof. Two fields fail that proof. Its historical publication-time provenance remains incomplete. The history sensitivity separately requires the available sidecar checks on layoff and prior runs and a verified whole-field OR rank where used. It does not certify trainer/jockey-rate, original-declaration or historical publication provenance.

## Canonical replay

| Fixed system | Year | Selected / settled | Races / dates | Winners | Strike | Mean final SP | Market-covered stakes | Market winner credit / expected | A/E | £1 P/L | ROI |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Chase | 2025 | 450 / 450 | 385 / 206 | 110 | 24.44% | 6.48 | 266 | 70 / 61.72 | 1.13 | +£32.51 | +7.22% |
| Chase | 2026 | 345 / 345 | 290 / 154 | 84 | 24.35% | 6.25 | 198 | 51 / 47.98 | 1.06 | −£56.41 | −16.35% |
| Jump handicap | 2025 | 2,010 / 1,883 | 1,225 / 296 | 274 | 14.55% | 10.62 | 1,002 | 140 / 142.81 | 0.98 | −£166.87 | −8.86% |
| Jump handicap | 2026 | 1,387 / 1,284 | 806 / 228 | 170 | 13.24% | 12.08 | 639 | 92 / 94.28 | 0.98 | −£212.44 | −16.55% |
| Turf trainer + TPR | 2025 | 515 / 515 | 515 / 166 | 115 | 22.33% | 9.34 | 273 | 66 / 56.79 | 1.16 | +£130.16 | +25.27% |
| Turf trainer + TPR | 2026 | 413 / 413 | 413 / 144 | 65 | 15.74% | 10.36 | 204 | 34 / 42.42 | 0.80 | +£146.87 | +35.56% |

Jump 2025 runs 1 January–31 December and Jump 2026 runs 1 January–14 October. Turf coverage is 3 February–8 November 2025 and 15 February–19 September 2026. The table uses historical fields available in each cache. Market coverage is only 49–59% of eligible stakes. The 95% date-cluster A/E intervals span 1 for all six rows. Chase intervals are 0.93–1.35 and 0.87–1.26, handicap 0.84–1.12 and 0.83–1.13, Turf 0.97–1.38 and 0.56–1.05. The raw ROI intervals also span zero for all six rows. TPR is a fixed formula using 2025 calibration constants, so 2025 Turf is development evidence even at a fixed rule threshold.

### Return concentration

| Fixed system | Year | Largest winner at decimal SP | Share of winning gross | P/L and ROI without largest winning race | P/L and ROI without two largest winning races |
| --- | --- | --- | ---: | ---: | ---: |
| Chase | 2025 | Nick Rockett, 34 | 7.0% | +£0.51 / +0.11% | −£17.49 / −3.91% |
| Chase | 2026 | Bagheera Ginge, 10 | 3.5% | −£65.41 / −19.01% | −£70.91 / −20.73% |
| Jump handicap | 2025 | Favori De Champdou, 67 | 3.9% | −£227.87 / −12.14% | −£276.87 / −14.77% |
| Jump handicap | 2026 | Sept Etoiles, 81 | 7.6% | −£287.44 / −22.49% | −£318.44 / −24.98% |
| Turf trainer + TPR | 2025 | Qirat, 151 | 23.4% | −£19.84 / −3.86% | −£52.84 / −10.30% |
| Turf trainer + TPR | 2026 | Thistle Nil, 201 | 35.9% | −£53.13 / −12.89% | −£93.13 / −22.66% |

The second-largest Turf winner in 2026 was also Thistle Nil, at SP 41 on a different date. Those two results contributed £242 gross against the rule’s £146.87 net profit.

### Same-race market-only control

| Fixed system / year | System stakes / ROI on complete markets | Favourite stakes / ROI on the same races | Favourite A/E |
| --- | ---: | ---: | ---: |
| Chase / 2025 | 266 / +25.01% | 225 / −9.45% | 1.03 |
| Chase / 2026 | 198 / −8.22% | 168 / −12.87% | 0.99 |
| Jump handicap / 2025 | 1,002 / −9.18% | 632 / −15.73% | 0.98 |
| Jump handicap / 2026 | 639 / −17.26% | 398 / −18.66% | 0.94 |
| Turf / 2025 | 273 / +51.42% | 273 / −15.10% | 1.02 |
| Turf / 2026 | 204 / −15.26% | 204 / −19.69% | 1.00 |

The 2026 Turf rule’s return turns negative on the market-covered subset, while the rule also finds 34 winners against the favourite’s 68 on the same 204 races. Full-population ROI is sensitive to missing benchmark fields. Use normalized-SP A/E for like-for-like market expectation.

### Matched coverage and what changed

| Fixed system | Common-window settled, 2025 → 2026 | Common-window ROI | Race-mix balanced ROI | Race mix + price-band balanced ROI | Race mix + price-band balanced A/E |
| --- | ---: | ---: | ---: | ---: | ---: |
| Chase | 281 → 345 | +12.75% → −16.35% | +18.43% → −9.98% | +16.79% → −17.75% | 1.15 → 0.98 |
| Jump handicap | 1,279 → 1,284 | −11.94% → −16.55% | −9.39% → −11.72% | −4.07% → −10.74% | 0.86 → 1.00 |
| Turf trainer + TPR | 425 → 413 | +41.08% → +35.56% | +51.13% → +40.58% | +67.26% → +70.85% | 1.30 → 0.73 |

The balanced weights sum to 225, 999 and 325 equivalent selections respectively for the race mix, and 176, 829 and 243 when adding price bands. These are common-support weights. They can upweight the long-priced winners. After removing the two largest winning races in each common calendar window and rebalancing race mix, 2025/2026 ROI is −2.04%/−12.89% for Chase, −15.16%/−21.40% for Jump handicap and −3.73%/−23.74% for Turf. The common window is 1 January–14 October for both Jump systems and 15 February–19 September for Turf.

- **Chase winner identification held, and realised winner payouts deteriorated.** Mean SP across all stakes fell from 6.48 to 6.25. Mean gross per winner fell from 4.39 to 3.44. At decimal SP 11 or higher the result was 6/71 → 0/47. April ROI moved +153.9% → −16.1%, with Nick Rockett in the 2025 sample. Coverage among settled chase runners rose 3.4% → 4.0%, average field size rose 7.87 → 8.19 and known mean class was nearly flat at 2.75 → 2.72. Class 1–3 ROI moved +18.4% → −30.3%. The calendar and race mix do not explain the entire drop. No matched pre-race quote series exists to attribute it to bookmaker repricing rather than a change in which horses won. The strict history/OR sensitivity returned −17.86% from 301 stakes, A/E 1.03.
- **Jump handicap changed population.** Hurdles rose from 54% to 61% of stakes, mean field size from 10.91 to 12.02 and missing class from 7.2% to 13.9%. Mean known class moved 3.26 → 3.18. Stake coverage relative to all settled handicap runners moved 7.0% → 6.7%. Longer average SP accompanied lower strike. Gross per winner stayed broadly flat at 6.26 → 6.30. Matching the race mix narrowed the common-window ROI gap from 4.6 to 2.3 percentage points, while losses remained in both years. The strict history sensitivity gave −15.40% from 1,241 stakes, A/E 0.98.
- **Turf lost winner identification despite higher headline ROI.** Strike fell 22.33% → 15.74% and market A/E fell 1.16 → 0.80. The market A/E decline remained after balancing field, class, month and price. Mean field size moved 10.06 → 9.98 and known class moved 3.63 → 3.77. Coverage was about 1.1% of settled Turf runners in both years. The 2026 SP 21+ group produced four winners from 36 stakes. Each shorter price band lost money. June drove the 2026 headline and July drove 2025.
- **Trainer turnover was secondary.** There were 16 common names by stable ID in the Jump top 20 and 24 in the Turf top 30. Restricting to common trainers gives Chase A/E 1.15 → 1.02, Jump handicap 1.01 → 1.01 and Turf 1.13 → 0.87, with limited full-market coverage. Cohort turnover alone does not account for the observed changes.

## Filter contributions

Leave-one-out tests keep all other gates fixed. Numbers below are ROI for the **additional** runners admitted by each removal, with settled counts in parentheses. These overlapping groups describe marginal changes near the original rule.

| System | Condition removed | Added 2025 ROI (stakes) | Added 2026 ROI (stakes) |
| --- | --- | ---: | ---: |
| Chase | Top 20 trainers | +1.0% (257) | −28.7% (246) |
| Chase | Days since run | −33.1% (330) | −5.6% (245) |
| Chase | Prior runs | +0.4% (93) | −77.8% (20) |
| Chase | Trainer prior win rate | −33.5% (69) | −56.2% (8) |
| Chase | Jockey prior win rate | −3.0% (223) | −32.7% (207) |
| Chase | Chase subtype | +4.5% (392) | −25.2% (398) |
| Chase | OR rank | −27.9% (328) | −10.4% (226) |
| Jump handicap | Top 20 trainers | −32.6% (1,772) | −4.4% (1,400) |
| Jump handicap | Days since run | −45.4% (141) | +21.1% (99) |
| Jump handicap | Trainer prior win rate | −34.7% (491) | −33.0% (308) |
| Jump handicap | Weight band | −10.7% (2,460) | −34.1% (1,752) |
| Jump handicap | Handicap | −19.9% (2,039) | −20.1% (1,444) |
| Turf | Top 30 trainers | −17.1% (1,050) | −27.5% (942) |
| Turf | Days since run | −12.6% (99) | +11.6% (84) |
| Turf | Latest Performance Rating rank | −21.4% (851) | −28.1% (756) |
| Turf | TPR rank 1 | −5.6% (4,090) | −27.5% (3,510) |

**Interactions.** In Chase, passing both trainer and jockey rate gates gave A/E 1.13 → 1.06. Passing the trainer gate alone gave 0.76 → 0.80. The jockey-only group shrank from 69 to eight stakes, so that cell cannot identify a joint effect. For Jump handicap, the exact weight and trainer-rate conjunction lost money in both years. The newly admitted below-threshold trainer-rate horses inside the weight band also lost money in both years. That supports a descriptive quality distinction within the band without establishing incremental market information. In Turf, the joint rank gates enriched raw returns relative to passing only either gate. Its A/E fell to 0.80 in 2026, compared with 0.92 and 0.99 for the two one-gate groups. The joint return advantage is longshot-dependent, and the two rank measures share performance inputs.

**Local threshold robustness.** One edge moved at a time using fixed steps of five days, one prior run, one win-rate percentage point, two pounds and one rank. Trainer cohort comparisons use the neighbouring supported sizes of 10, 20 and 30. The exact rule is the reference throughout.

| Example fixed perturbation | 2025 ROI (stakes) | 2026 ROI (stakes) |
| --- | ---: | ---: |
| Chase layoff minimum 30 → 25 days | −4.0% (553) | −15.6% (418) |
| Chase layoff minimum 30 → 35 days | +2.2% (375) | −18.3% (295) |
| Chase OR rank ceiling 3 → 2 | +5.2% (340) | −25.8% (254) |
| Chase OR rank ceiling 3 → 4 | +1.0% (529) | −19.6% (405) |
| Jump handicap trainer-rate minimum 14% → 13% | −15.0% (2,181) | −17.8% (1,348) |
| Jump handicap trainer-rate minimum 14% → 15% | −13.1% (1,703) | −16.0% (1,092) |
| Jump handicap weight ceiling 163 → 161 lb | −7.3% (1,489) | −11.6% (1,009) |
| Jump handicap weight ceiling 163 → 165 lb | −10.2% (2,331) | −19.1% (1,645) |
| Turf layoff ceiling 50 → 45 days | +27.1% (500) | +37.3% (403) |
| Turf TPR ceiling rank 1 → 2 | +7.8% (1,517) | −3.7% (1,208) |
| Turf allow latest Performance Rating rank 1 | −5.4% (1,300) | −3.2% (1,112) |

Every local Chase and Jump handicap perturbation remained negative in 2026. Larger Turf ROI figures under some perturbations retain the same dominant winners and do not imply an improved predictor. The replay outputs the complete fixed-neighbour and joint-gate tables.

## Research Filters capabilities and priorities

Advanced Filters already retains the original rules and saved snapshots, and provides 2025 window stability, nearby-threshold diagnostics and price sensitivity. Model Performance already has historical two-period comparison, matched runners across models, market A/E coverage and winner concentration. These are useful analytical foundations. The visible gap is that the comparable workflow does not accept a saved rule as the fixed unit of analysis across years, with its exact cohort semantics and source status.

1. Prioritise a read-only **saved rule comparison** with native and common-calendar windows, source/settlement labels, price coverage, market A/E, same-race favourite benchmark and both winner-removal checks. Include a stakes-to-market coverage waterfall with separately labelled SP and captured quotes. This addresses the duplicate rule with divergent legacy snapshots and the partial market coverage found here.
2. Add common-support composition and gate diagnostics only after the fixed comparison is useful. Field-size, class, subtype, calendar and price mix are available now. Membership drift, per-condition admission counts and a two-gate table would answer more than adding thresholds. Nearby variants should appear in fixed order with the original reference.
3. Retain the Chase gates as a fixed research candidate for independent observation. Give priority to the jockey-rate and OR rank contributions as hypotheses, with a prespecified market benchmark and pre-race price availability. Keep the Turf ranks for research into the disagreement and rare-winner mechanism. The Jump handicap version is useful as a negative control for settlement, coverage and field composition. The 14% trainer-rate cutoff has an observable admission effect and needs independent market-relative evidence before further development.

The replay supports a stable raw Chase winner rate and a weaker 2026 price payoff. It provides **no credible cross-year evidence of a robust market edge** for the three fixed definitions. Keep the historical systems in Research Filters and record fresh observations under the fixed definitions before reconsidering any of them.

## Monthly appendix

Each cell is settled stakes / ROI using the available dates in that year. October 2026 Jump and September 2026 Turf are partial months. The common-window analysis above aligns boundary dates independently.

| Month | Chase 2025 | Chase 2026 | Handicap 2025 | Handicap 2026 | Turf 2025 | Turf 2026 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 32 / +21.2% | 49 / -40.2% | 132 / -43.6% | 153 / -17.5% | — | — |
| 2 | 49 / +17.8% | 61 / -9.8% | 171 / -32.2% | 176 / +3.2% | — | — |
| 3 | 55 / -26.2% | 54 / -29.2% | 246 / +9.5% | 236 / -47.6% | — | — |
| 4 | 36 / +153.9% | 50 / -16.1% | 255 / -18.2% | 209 / +6.1% | 17 / -40.4% | 17 / -48.5% |
| 5 | 27 / +35.2% | 40 / +7.3% | 138 / -9.4% | 148 / -0.6% | 70 / +3.0% | 62 / -21.4% |
| 6 | 15 / +44.6% | 16 / -40.6% | 84 / -14.9% | 62 / -12.6% | 100 / +40.7% | 111 / +132.8% |
| 7 | 19 / -47.4% | 18 / -77.8% | 67 / -9.1% | 102 / -51.5% | 88 / +145.8% | 103 / +6.5% |
| 8 | 11 / -80.9% | 15 / +39.2% | 48 / +71.4% | 49 / +27.0% | 96 / -9.5% | 77 / +38.9% |
| 9 | 21 / -86.1% | 18 / +55.1% | 86 / -4.9% | 85 / -34.0% | 84 / -3.3% | 43 / -36.4% |
| 10 | 46 / +9.0% | 24 / -21.4% | 133 / -11.5% | 64 / -23.4% | 57 / -44.2% | — |
| 11 | 82 / +0.2% | — | 272 / -23.6% | — | 3 / +100.0% | — |
| 12 | 57 / -14.9% | — | 251 / +19.9% | — | — | — |

Reproduce with `bun --env-file=.env.local run scripts/diagnose-saved-filter-transfer.ts`. The command reads the local rule and trainer records and the original caches, checks selected-runner parity with the application evaluator, verifies the isolated Jump proofs, records cache SHA-256 hashes and prints the detailed output.
