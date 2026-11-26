# Hurdle and Chase profitability comparison tables

[Phase 3 decision report](tissue-profitability-phase-3-2026-11-26.md) · [Course tables](tissue-profitability-phase-3-courses-2026-11-26.md)

## Reading the tables

`spPL` is final Sporting Life SP. `capPL` is a genuine pre-off quote or frozen captured quote. Earlier 2026 quote-based rankings still come from historical Tissue reconstruction or the stored Chase promotion study. Market rank is competition rank by shortest decimal odds. Market expectation is inverse odds normalized across that price basis's full board. The SP field is the final starter roster. A November captured board includes the original captured field, so its probabilities can include a subsequently withdrawn runner. Comparisons use all long-priced wins and losses. Races / bets gives the identical count for each of T1–T3. Model A/E and market A/E use fractional actual wins for dead heats. Largest-winner columns give net contribution from one £1 winning ticket. The removal of that ticket is a separate sensitivity. A dash denotes unavailable or undefined.

Unknown handicap and missing distance are excluded from their interactions. Handicap × going also excludes mixed or missing descriptions. Distance × market excludes books without the corresponding price board. The going mapping uses a recognizable leading primary description with a trailing parenthetical “in places” qualifier removed. Firm and Good to Firm enter Good / faster. Good to Yielding and Yielding enter Good to Soft / yielding. Yielding to Soft enters Soft and Soft to Heavy enters Heavy. Other compound strings with no recognized primary stay mixed. These are diagnostic buckets from the recorded result context.

Combined is the two retrospective years. November is the separate frozen prospective rank cohort analysed after results. The interaction tables display the complete coarse grids for these families and periods, including sparse cells. Recorded exact yardage determines eligibility. The actionable rules use race family, handicap and distance fields.

## Replaying the historical comparisons

1. Read `source.ndjson` and `dataset.ndjson` from the existing full-history backtest snapshot. Use `historyFamily` to count source races. Only use proved results from the dataset under exact race ID, runner ID and horse ID. Keep the source's structured handicap flag, course, yardage and reported going. Use the existing dataset's ordered runner, outcome and quote arrays for settlement.
2. For Hurdle and 2025 Chase, join all starters to the feature cache. Use the 2025 v4 missing-minute cache and the pinned isolated 2026 cache through 14 October. Build the 18 numerical features in frozen model order with the stored missingness indicators. Use `jumpTissueNumericVector` semantics with cached OR, Jump Speed, trainer/jockey priors, run history, age, weight and race metadata. Use the reconciled starter count for the retrospective field-size input. Log count inputs use `log1p`. Join the prior raw comment by provider race, ride and horse identity over proved historical fields from 2024 onwards. Keep the last three nonempty comments strictly before the target date and use `commentVector`. Hurdle completion context uses the last three proved result records strictly before the target date, passed to `tissueGenerationFeatures`. Prior dates are conservative day cutoffs. Unarchived prior records and late historically edited form can affect this replay. Target SP, finishing outcomes and quotes are excluded from scoring. Historical selection over the reconciled starter field uses knowledge of eventual withdrawals.
3. Supplement Hurdle with the existing pre-epoch Value books from 20 October–4 November. Of 159 frozen books, 94 link to the exact proved starter set, 59 link to a different proved field roster, and six lack a proved dataset field. Reuse the 94 full stored vectors and captured quotes in runner order. Recalculate only the Hurdle V2 context features using prior-day histories. The 94 overlap the model development set. Apply the frozen base plus adjustment logits and race softmax to both Hurdle sources. Sort descending probability and ascending runner UUID for exact ties.
4. For 2026 Chase, join the stored promotion probability to the proved dataset on matching race date, full starter IDs and winner IDs. All 1,220 race books match. Use Shadow probability directly because the frozen Chase model embeds that base and its adjustment weights are zero. The 2025 Chase reconstruction is a local replay and can differ from an earlier reconstructed snapshot because it uses these archive histories and cutoffs.
5. For November, use the unmodified generation loader and recorded original ranks. Reconcile a uniquely matched final archive by racing date, normalized full starter-name set and finishing positions, and check course identity. Preserve frozen captured medians, dead-heat divisors and original NR/void records. January–14 October sensitivity uses the same inclusive calendar window in both historical years. Policy comparisons use identical matched races first, then all settled November opportunities with refunds and abstentions.

Archive history linked 21,728 race payloads and lacked a uniquely linked raw payload for 14. It contained 124,959 linked comment records before individual prior selection. Cache OR and Best L3 Speed were missing on 8,809 and 5,913 Hurdle 2025 runner vectors, 5,654 and 3,264 Hurdle 2026 cache runner vectors, and 1,191 and 1,595 Chase 2025 runner vectors. The frozen calculation uses missingness indicators. The late Hurdle vectors and stored Chase promotion predictions are outside these cache coverage counts.

[Full-history reconciliation](../scripts/build-full-history-profitability.ts) · [Frozen-score primitives](../scripts/diagnose-independent-tissue-feasibility.ts) · [Generation scoring](../src/lib/racing/tissue-generation-model.ts)

To reproduce the pinned November ledger from the later 26 November copy, use an in-memory projection clearing outcomes timestamped at or after 14:02:06.141 UTC on 26 November. Serializing with two-space indentation and a terminal newline reproduced the original hash below. The later copy had the same 635 capture IDs and added three settled Hurdles and three settled Chases.

## Input identities

| Input | SHA-256 |
| --- | --- |
| data/research/backtest-cache/backtest_features_v4-sporting_life-jump-2025-01-01-2025-12-31/features.ndjson | dd8a3eab0ffbd877dc6523fdce7d2e084d4cf0085b111b6317cbfb028ea311c0 |
| data/research/jump-2026-isolated-candidate-2026-11-11-vKE4Te/cache/backtest_features_v4-sporting_life-jump-2026-01-01-2026-10-14/features.ndjson | 23b50dbb51cb1b19943d9e453d96ea79cdb74aafa1ffe94ceda51c1b4922de93 |
| data/research/backtest-cache/full-history-profitability-v1/dataset.ndjson | c1c263f00b0d24a534d5a7d13f84b8ac347c30178546441fbfabb23be693fa67 |
| data/research/backtest-cache/full-history-profitability-v1/source.ndjson | f94b8dce3d2d92f2732f802d5e6e0f21ce43d330841c7f630905898e5f835160 |
| data/research/tissue-generation-chase-promotion-2026-11.json | 56116ca16d8e3d514d407833b08a8de6c7a6e253c3fd733aaf995ebe49ab1ff2 |
| Pre-epoch Hurdle Value books with outcomes omitted | b9e3c0314b7b4d2277ad5e2ecbe8e430a5d3ed4db409205a1b8e7fd2dc910d60 |
| Generation ledger snapshot | b8ea21b8976d1b4025d4ce01de19ff57625acf4c7740b4c0406fab086bfe074e |
| Linked historic prior comment records | 252bb2b6cd34e51aecb11c9e7b6eee37eb8806988434848f355bbd70df813c80 |
| November final result archive | 467d51d281d01d9557dc42fe9cd79bba78823768ebd5802cbfc348386a073492 |

## Baseline

| Family | Period | Basis | Rank | Races | Bets | Wins | Strike | £ P/L | ROI | Avg winning decimal | Median winning decimal | Model E | A/E model | Market E | A/E market | Largest winning ticket £ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| HURDLE | 2025 | spPL | 1 | 2900 | 2900 | 765 | 26.4% | -460.52 | -15.9% | 3.19 | 2.50 | 781.54 | 0.98 | 720.50 | 1.06 | 28.00 |
| HURDLE | 2025 | spPL | 2 | 2900 | 2900 | 531 | 18.3% | -606.27 | -20.9% | 4.32 | 3.25 | 503.00 | 1.06 | 518.74 | 1.02 | 28.00 |
| HURDLE | 2025 | spPL | 3 | 2900 | 2900 | 421 | 14.5% | -575.92 | -19.9% | 5.52 | 4.33 | 381.32 | 1.10 | 407.96 | 1.03 | 40.00 |
| HURDLE | 2026 | spPL | 1 | 2120 | 2120 | 531 | 25.0% | -403.17 | -19.0% | 3.24 | 2.40 | 562.60 | 0.94 | 522.12 | 1.02 | 28.00 |
| HURDLE | 2026 | spPL | 2 | 2120 | 2120 | 402 | 19.0% | -316.69 | -14.9% | 4.49 | 3.75 | 364.77 | 1.10 | 382.56 | 1.05 | 25.00 |
| HURDLE | 2026 | spPL | 3 | 2120 | 2120 | 301 | 14.2% | -437.64 | -20.6% | 5.59 | 3.75 | 276.98 | 1.08 | 297.52 | 1.01 | 80.00 |
| HURDLE | Combined | spPL | 1 | 5020 | 5020 | 1296 | 25.8% | -863.70 | -17.2% | 3.21 | 2.50 | 1344.14 | 0.96 | 1242.63 | 1.04 | 28.00 |
| HURDLE | Combined | spPL | 2 | 5020 | 5020 | 933 | 18.6% | -922.96 | -18.4% | 4.39 | 3.50 | 867.76 | 1.08 | 901.30 | 1.04 | 28.00 |
| HURDLE | Combined | spPL | 3 | 5020 | 5020 | 722 | 14.4% | -1013.56 | -20.2% | 5.55 | 4.00 | 658.30 | 1.10 | 705.48 | 1.02 | 80.00 |
| HURDLE | November | spPL | 1 | 211 | 211 | 51 | 24.2% | -62.28 | -29.5% | 2.92 | 2.38 | 51.99 | 0.98 | 55.98 | 0.91 | 10.00 |
| HURDLE | November | spPL | 2 | 211 | 211 | 48 | 22.7% | -16.19 | -7.7% | 4.06 | 3.13 | 35.63 | 1.35 | 38.03 | 1.26 | 14.00 |
| HURDLE | November | spPL | 3 | 211 | 211 | 22 | 10.4% | -109.35 | -51.8% | 4.62 | 4.33 | 27.47 | 0.80 | 32.18 | 0.68 | 10.00 |
| HURDLE | November | capPL | 1 | 184 | 184 | 43 | 23.4% | -53.57 | -29.1% | 3.03 | 2.25 | 44.24 | 0.97 | 45.86 | 0.94 | 11.00 |
| HURDLE | November | capPL | 2 | 184 | 184 | 42 | 22.8% | -9.02 | -4.9% | 4.17 | 3.00 | 30.90 | 1.36 | 32.50 | 1.29 | 16.00 |
| HURDLE | November | capPL | 3 | 184 | 184 | 18 | 9.8% | -104.72 | -56.9% | 4.40 | 3.50 | 23.75 | 0.76 | 25.90 | 0.69 | 9.00 |
| CHASE | 2025 | spPL | 1 | 1677 | 1677 | 427 | 25.5% | -146.01 | -8.7% | 3.59 | 3.00 | 437.56 | 0.98 | 413.18 | 1.03 | 33.00 |
| CHASE | 2025 | spPL | 2 | 1677 | 1677 | 333 | 19.9% | -129.73 | -7.7% | 4.65 | 3.75 | 317.84 | 1.05 | 322.92 | 1.03 | 33.00 |
| CHASE | 2025 | spPL | 3 | 1677 | 1677 | 292 | 17.4% | -15.40 | -0.9% | 5.69 | 4.50 | 256.72 | 1.14 | 261.49 | 1.12 | 66.00 |
| CHASE | 2026 | spPL | 1 | 1211 | 1211 | 315 | 26.0% | -152.01 | -12.6% | 3.36 | 2.88 | 324.92 | 0.97 | 308.31 | 1.02 | 28.00 |
| CHASE | 2026 | spPL | 2 | 1211 | 1211 | 230 | 19.0% | -192.29 | -15.9% | 4.43 | 3.50 | 237.52 | 0.97 | 236.05 | 0.97 | 28.00 |
| CHASE | 2026 | spPL | 3 | 1211 | 1211 | 200 | 16.5% | -176.01 | -14.5% | 5.17 | 4.33 | 190.67 | 1.05 | 195.30 | 1.02 | 22.00 |
| CHASE | Combined | spPL | 1 | 2888 | 2888 | 742 | 25.7% | -298.02 | -10.3% | 3.49 | 2.88 | 762.48 | 0.97 | 721.48 | 1.03 | 33.00 |
| CHASE | Combined | spPL | 2 | 2888 | 2888 | 563 | 19.5% | -322.02 | -11.2% | 4.56 | 3.75 | 555.36 | 1.01 | 558.97 | 1.01 | 33.00 |
| CHASE | Combined | spPL | 3 | 2888 | 2888 | 492 | 17.0% | -191.40 | -6.6% | 5.48 | 4.50 | 447.39 | 1.10 | 456.79 | 1.08 | 66.00 |
| CHASE | November | spPL | 1 | 114 | 114 | 29 | 25.4% | -9.69 | -8.5% | 3.67 | 2.75 | 28.41 | 1.00 | 27.66 | 1.03 | 9.00 |
| CHASE | November | spPL | 2 | 114 | 114 | 24 | 21.1% | -8.88 | -7.8% | 4.38 | 3.50 | 21.38 | 1.12 | 21.53 | 1.11 | 12.00 |
| CHASE | November | spPL | 3 | 114 | 114 | 24 | 21.1% | -4.48 | -3.9% | 4.56 | 4.75 | 17.51 | 1.37 | 19.98 | 1.20 | 9.00 |
| CHASE | November | capPL | 1 | 103 | 103 | 26 | 25.2% | -11.53 | -11.2% | 3.59 | 3.25 | 26.29 | 0.97 | 24.49 | 1.04 | 12.00 |
| CHASE | November | capPL | 2 | 103 | 103 | 24 | 23.3% | 5.89 | 5.7% | 4.54 | 3.38 | 19.66 | 1.22 | 19.91 | 1.21 | 12.00 |
| CHASE | November | capPL | 3 | 103 | 103 | 21 | 20.4% | -6.23 | -6.0% | 4.61 | 4.50 | 16.11 | 1.30 | 17.43 | 1.20 | 7.00 |

## Handicap priority

| Family | Period | Handicap | Races / bets | T1 W / £ / ROI | T2 W / £ / ROI | T3 W / £ / ROI | T2 less largest £ | T2 largest win £ | Median winning SP T1/2/3 | T1/2/3 model minus market probability pp | T1/2/3 actual / market expected |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| HURDLE | 2025 | Handicap | 1643 | 337 / -259.62 / -15.8% | 288 / -267.64 / -16.3% | 223 / -223.41 / -13.6% | -292.64 | 25.00 | 3.50 / 4.00 / 5.00 | 4.5 / 0.3 / 0.1 | 337.0/322.2 · 288.0/267.9 · 223.0/214.2 |
| HURDLE | 2025 | Non-handicap | 1257 | 428 / -200.91 / -16.0% | 243 / -338.63 / -26.9% | 198 / -352.50 / -28.0% | -366.63 | 28.00 | 1.83 / 2.63 / 3.25 | -1.0 / -1.7 / -2.2 | 428.0/398.3 · 243.0/250.8 · 198.0/193.8 |
| HURDLE | 2026 | Handicap | 1250 | 233 / -245.39 / -19.6% | 216 / -76.42 / -6.1% | 160 / -289.40 / -23.2% | -101.42 | 25.00 | 3.25 / 4.33 / 4.50 | 4.1 / 0.7 / -0.2 | 232.5/240.7 · 216.0/196.4 · 159.5/166.0 |
| HURDLE | 2026 | Non-handicap | 870 | 298 / -157.79 / -18.1% | 186 / -240.27 / -27.6% | 141 / -148.24 / -17.0% | -254.27 | 14.00 | 1.83 / 2.75 / 2.88 | -1.3 / -3.1 / -2.1 | 298.0/281.4 · 186.0/186.2 · 141.0/131.5 |
| HURDLE | Combined | Handicap | 2893 | 570 / -505.00 / -17.5% | 504 / -344.06 / -11.9% | 383 / -512.81 / -17.7% | -369.06 | 25.00 | 3.50 / 4.00 / 5.00 | 4.3 / 0.5 / -0.0 | 569.5/563.0 · 504.0/464.3 · 382.5/380.2 |
| HURDLE | Combined | Non-handicap | 2127 | 726 / -358.70 / -16.9% | 429 / -578.90 / -27.2% | 339 / -500.75 / -23.5% | -606.90 | 28.00 | 1.83 / 2.75 / 3.00 | -1.1 / -2.2 / -2.2 | 726.0/679.7 · 429.0/437.0 · 339.0/325.3 |
| HURDLE | November | Handicap | 112 | 20 / -26.43 / -23.6% | 23 / 9.70 / 8.7% | 14 / -33.33 / -29.8% | -4.30 | 14.00 | 3.13 / 4.33 / 4.75 | 2.8 / -0.5 / -2.0 | 20.0/21.8 · 23.0/18.2 · 14.0/16.3 |
| HURDLE | November | Non-handicap | 85 | 28 / -28.16 / -33.1% | 22 / -17.96 / -21.1% | 6 / -71.01 / -83.5% | -23.96 | 6.00 | 1.57 / 2.56 / 2.19 | -7.9 / -1.7 / -2.4 | 28.0/29.8 · 22.0/16.6 · 6.0/13.1 |
| HURDLE | November | Unknown | 14 | 3 / -7.68 / -54.8% | 3 / -7.93 / -56.6% | 2 / -5.00 / -35.7% | -9.31 | 1.38 | 1.57 / 2.25 / 4.50 | -3.2 / -2.9 / -3.5 | 3.0/4.4 · 3.0/3.2 · 2.0/2.8 |
| CHASE | 2025 | Handicap | 1322 | 313 / -91.08 / -6.9% | 261 / -64.13 / -4.9% | 237 / -39.47 / -3.0% | -86.13 | 22.00 | 3.25 / 4.00 / 4.50 | 1.8 / -0.2 / -0.3 | 313.0/303.6 · 261.0/248.1 · 237.0/206.5 |
| CHASE | 2025 | Non-handicap | 355 | 114 / -54.92 / -15.5% | 72 / -65.60 / -18.5% | 55 / 24.08 / 6.8% | -98.60 | 33.00 | 2.15 / 2.94 / 4.20 | 0.1 / -0.8 / -0.4 | 114.0/109.5 · 72.0/74.8 · 55.0/55.0 |
| CHASE | 2026 | Handicap | 960 | 245 / -89.93 / -9.4% | 171 / -187.51 / -19.5% | 150 / -137.53 / -14.3% | -215.51 | 28.00 | 3.00 / 3.50 / 4.50 | 1.9 / 0.3 / -0.3 | 245.0/226.4 · 171.0/182.3 · 150.0/154.5 |
| CHASE | 2026 | Non-handicap | 251 | 70 / -62.09 / -24.7% | 59 / -4.78 / -1.9% | 50 / -38.48 / -15.3% | -20.78 | 16.00 | 2.17 / 2.88 / 3.38 | -0.6 / -0.8 / -0.5 | 70.0/81.9 · 59.0/53.8 · 50.0/40.8 |
| CHASE | Combined | Handicap | 2282 | 558 / -181.01 / -7.9% | 432 / -251.64 / -11.0% | 387 / -177.00 / -7.8% | -279.64 | 28.00 | 3.25 / 4.00 / 4.50 | 1.8 / 0.0 / -0.3 | 558.0/530.1 · 432.0/430.4 · 387.0/361.0 |
| CHASE | Combined | Non-handicap | 606 | 184 / -117.01 / -19.3% | 131 / -70.38 / -11.6% | 105 / -14.40 / -2.4% | -103.38 | 33.00 | 2.15 / 2.88 / 3.75 | -0.2 / -0.8 / -0.4 | 184.0/191.4 · 131.0/128.5 · 105.0/95.8 |
| CHASE | November | Handicap | 85 | 15 / -25.18 / -29.6% | 17 / -7.75 / -9.1% | 19 / 11.38 / 13.4% | -19.75 | 12.00 | 3.25 / 3.50 / 5.00 | 1.2 / -0.1 / -1.4 | 14.5/18.9 · 17.0/15.5 · 19.0/14.3 |
| CHASE | November | Non-handicap | 27 | 13 / 16.08 / 59.6% | 6 / -0.63 / -2.3% | 5 / -13.86 / -51.3% | -9.13 | 8.50 | 2.50 / 3.50 / 2.25 | -1.4 / 1.1 / -5.7 | 13.0/7.8 · 6.0/5.1 · 5.0/5.6 |
| CHASE | November | Unknown | 2 | 1 / -0.60 / -30.0% | 1 / -0.50 / -25.0% | 0 / -2.00 / -100.0% | -1.00 | 0.50 | 1.40 / 1.50 / — | 4.6 / -18.8 / 14.2 | 1.0/1.0 · 1.0/0.9 · 0.0/0.1 |

## Distance

| Family | Period | Category | Races / bets | T1 W / £ / ROI | T2 W / £ / ROI | T3 W / £ / ROI | T2 less largest £ | T2 largest win £ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| HURDLE | 2025 | Short | 1220 | 350 / -169.91 / -13.9% | 224 / -315.51 / -25.9% | 170 / -347.18 / -28.5% | -343.51 | 28.00 |
| HURDLE | 2025 | Intermediate | 1122 | 284 / -179.73 / -16.0% | 205 / -198.79 / -17.7% | 174 / -131.74 / -11.7% | -226.79 | 28.00 |
| HURDLE | 2025 | Staying | 558 | 131 / -110.88 / -19.9% | 102 / -91.97 / -16.5% | 77 / -97.00 / -17.4% | -113.97 | 22.00 |
| HURDLE | 2026 | Short | 881 | 244 / -179.07 / -20.3% | 171 / -209.24 / -23.7% | 119 / -211.47 / -24.0% | -234.24 | 25.00 |
| HURDLE | 2026 | Intermediate | 798 | 187 / -188.87 / -23.7% | 160 / -26.32 / -3.3% | 122 / -75.56 / -9.5% | -48.32 | 22.00 |
| HURDLE | 2026 | Staying | 441 | 100 / -35.23 / -8.0% | 71 / -81.13 / -18.4% | 60 / -150.62 / -34.2% | -93.13 | 12.00 |
| HURDLE | Combined | Short | 2101 | 594 / -348.98 / -16.6% | 395 / -524.74 / -25.0% | 289 / -558.65 / -26.6% | -552.74 | 28.00 |
| HURDLE | Combined | Intermediate | 1920 | 471 / -368.60 / -19.2% | 365 / -225.11 / -11.7% | 296 / -207.30 / -10.8% | -253.11 | 28.00 |
| HURDLE | Combined | Staying | 999 | 231 / -146.12 / -14.6% | 173 / -173.10 / -17.3% | 137 / -247.62 / -24.8% | -195.10 | 22.00 |
| HURDLE | November | Short | 97 | 29 / -11.94 / -12.3% | 16 / -46.83 / -48.3% | 8 / -58.83 / -60.7% | -57.83 | 11.00 |
| HURDLE | November | Intermediate | 85 | 19 / -28.96 / -34.1% | 25 / 36.31 / 42.7% | 12 / -33.51 / -39.4% | 22.31 | 14.00 |
| HURDLE | November | Staying | 29 | 3 / -21.38 / -73.7% | 7 / -5.67 / -19.5% | 2 / -17.00 / -58.6% | -9.17 | 3.50 |
| CHASE | 2025 | Short | 392 | 117 / -18.82 / -4.8% | 76 / -65.05 / -16.6% | 75 / 85.74 / 21.9% | -81.05 | 16.00 |
| CHASE | 2025 | Intermediate | 865 | 210 / -147.76 / -17.1% | 179 / -4.14 / -0.5% | 149 / -79.61 / -9.2% | -37.14 | 33.00 |
| CHASE | 2025 | Staying | 420 | 100 / 20.57 / 4.9% | 78 / -60.53 / -14.4% | 68 / -21.52 / -5.1% | -78.53 | 18.00 |
| CHASE | 2026 | Short | 259 | 63 / -79.76 / -30.8% | 49 / -80.29 / -31.0% | 47 / -49.01 / -18.9% | -91.29 | 11.00 |
| CHASE | 2026 | Intermediate | 654 | 180 / -71.16 / -10.9% | 119 / -50.14 / -7.7% | 102 / -75.95 / -11.6% | -78.14 | 28.00 |
| CHASE | 2026 | Staying | 298 | 72 / -1.10 / -0.4% | 62 / -61.86 / -20.8% | 51 / -51.05 / -17.1% | -77.86 | 16.00 |
| CHASE | Combined | Short | 651 | 180 / -98.59 / -15.1% | 125 / -145.34 / -22.3% | 122 / 36.73 / 5.6% | -161.34 | 16.00 |
| CHASE | Combined | Intermediate | 1519 | 390 / -218.91 / -14.4% | 298 / -54.28 / -3.6% | 251 / -155.56 / -10.2% | -87.28 | 33.00 |
| CHASE | Combined | Staying | 718 | 172 / 19.48 / 2.7% | 140 / -122.39 / -17.0% | 119 / -72.57 / -10.1% | -140.39 | 18.00 |
| CHASE | November | Short | 27 | 10 / 14.55 / 53.9% | 4 / -9.88 / -36.6% | 7 / 4.37 / 16.2% | -18.38 | 8.50 |
| CHASE | November | Intermediate | 56 | 14 / -8.84 / -15.8% | 13 / 5.88 / 10.5% | 9 / -20.35 / -36.3% | -6.13 | 12.00 |
| CHASE | November | Staying | 31 | 5 / -15.40 / -49.7% | 7 / -4.88 / -15.7% | 8 / 11.50 / 37.1% | -9.88 | 5.00 |

## Going

| Family | Period | Category | Races / bets | T1 W / £ / ROI | T2 W / £ / ROI | T3 W / £ / ROI | T2 less largest £ | T2 largest win £ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| HURDLE | 2025 | Good / faster | 1240 | 365 / -68.07 / -5.5% | 249 / -213.51 / -17.2% | 188 / -146.31 / -11.8% | -241.51 | 28.00 |
| HURDLE | 2025 | Good to soft / yielding | 884 | 198 / -226.20 / -25.6% | 159 / -149.11 / -16.9% | 121 / -260.93 / -29.5% | -177.11 | 28.00 |
| HURDLE | 2025 | Soft | 527 | 130 / -139.88 / -26.5% | 96 / -146.35 / -27.8% | 74 / -193.13 / -36.6% | -168.35 | 22.00 |
| HURDLE | 2025 | Heavy | 245 | 72 / -22.38 / -9.1% | 27 / -93.29 / -38.1% | 37 / 23.95 / 9.8% | -121.29 | 28.00 |
| HURDLE | 2025 | Mixed / other | 4 | 0 / -4.00 / -100.0% | 0 / -4.00 / -100.0% | 1 / 0.50 / 12.5% | — | — |
| HURDLE | 2026 | Good / faster | 1109 | 293 / -113.73 / -10.3% | 198 / -264.10 / -23.8% | 166 / -139.13 / -12.5% | -286.10 | 22.00 |
| HURDLE | 2026 | Good to soft / yielding | 494 | 104 / -135.55 / -27.4% | 101 / -21.14 / -4.3% | 63 / -176.08 / -35.6% | -35.14 | 14.00 |
| HURDLE | 2026 | Soft | 295 | 70 / -107.95 / -36.6% | 64 / 4.41 / 1.5% | 37 / -96.85 / -32.8% | -15.59 | 20.00 |
| HURDLE | 2026 | Heavy | 210 | 61 / -38.82 / -18.5% | 35 / -58.74 / -28.0% | 34 / -15.19 / -7.2% | -72.74 | 14.00 |
| HURDLE | 2026 | Mixed / other | 12 | 3 / -7.13 / -59.4% | 4 / 22.88 / 190.6% | 1 / -10.38 / -86.5% | -2.13 | 25.00 |
| HURDLE | Combined | Good / faster | 2349 | 658 / -181.79 / -7.7% | 447 / -477.61 / -20.3% | 354 / -285.44 / -12.2% | -505.61 | 28.00 |
| HURDLE | Combined | Good to soft / yielding | 1378 | 302 / -361.75 / -26.3% | 260 / -170.25 / -12.4% | 184 / -437.01 / -31.7% | -198.25 | 28.00 |
| HURDLE | Combined | Soft | 822 | 200 / -247.83 / -30.1% | 160 / -141.94 / -17.3% | 111 / -289.98 / -35.3% | -163.94 | 22.00 |
| HURDLE | Combined | Heavy | 455 | 133 / -61.20 / -13.5% | 62 / -152.03 / -33.4% | 71 / 8.76 / 1.9% | -180.03 | 28.00 |
| HURDLE | Combined | Mixed / other | 16 | 3 / -11.13 / -69.5% | 4 / 18.88 / 118.0% | 2 / -9.88 / -61.8% | -6.13 | 25.00 |
| HURDLE | November | Good / faster | 98 | 25 / -18.72 / -19.1% | 23 / -15.03 / -15.3% | 13 / -41.39 / -42.2% | -26.03 | 11.00 |
| HURDLE | November | Good to soft / yielding | 70 | 17 / -23.52 / -33.6% | 14 / -12.85 / -18.4% | 7 / -38.96 / -55.7% | -26.85 | 14.00 |
| HURDLE | November | Soft | 24 | 5 / -7.66 / -31.9% | 6 / 6.66 / 27.7% | 1 / -21.00 / -87.5% | -1.34 | 8.00 |
| HURDLE | November | Heavy | 6 | 3 / -0.68 / -11.3% | 1 / 7.00 / 116.7% | 0 / -6.00 / -100.0% | -5.00 | 12.00 |
| HURDLE | November | Mixed / other | 13 | 1 / -11.70 / -90.0% | 4 / -1.97 / -15.1% | 1 / -2.00 / -15.4% | -5.47 | 3.50 |
| CHASE | 2025 | Good / faster | 688 | 184 / -89.61 / -13.0% | 158 / 26.15 / 3.8% | 127 / 62.12 / 9.0% | -6.85 | 33.00 |
| CHASE | 2025 | Good to soft / yielding | 546 | 131 / -25.24 / -4.6% | 94 / -97.88 / -17.9% | 96 / 11.76 / 2.2% | -113.88 | 16.00 |
| CHASE | 2025 | Soft | 317 | 79 / -35.42 / -11.2% | 59 / -35.73 / -11.3% | 46 / -85.52 / -27.0% | -47.73 | 12.00 |
| CHASE | 2025 | Heavy | 123 | 32 / 1.26 / 1.0% | 22 / -19.26 / -15.7% | 22 / -17.76 / -14.4% | -31.26 | 12.00 |
| CHASE | 2025 | Mixed / other | 3 | 1 / 3.00 / 100.0% | 0 / -3.00 / -100.0% | 1 / 14.00 / 466.7% | — | — |
| CHASE | 2026 | Good / faster | 586 | 169 / -58.89 / -10.0% | 113 / -63.21 / -10.8% | 92 / -137.80 / -23.5% | -91.21 | 28.00 |
| CHASE | 2026 | Good to soft / yielding | 300 | 72 / -48.13 / -16.0% | 53 / -72.21 / -24.1% | 49 / -26.21 / -8.7% | -84.21 | 12.00 |
| CHASE | 2026 | Soft | 214 | 48 / -15.85 / -7.4% | 42 / -50.59 / -23.6% | 39 / 10.65 / 5.0% | -70.59 | 20.00 |
| CHASE | 2026 | Heavy | 94 | 21 / -25.12 / -26.7% | 18 / -5.13 / -5.5% | 19 / -8.39 / -8.9% | -21.13 | 16.00 |
| CHASE | 2026 | Mixed / other | 17 | 5 / -4.03 / -23.7% | 4 / -1.15 / -6.8% | 1 / -14.25 / -83.8% | -6.65 | 5.50 |
| CHASE | Combined | Good / faster | 1274 | 353 / -148.50 / -11.7% | 271 / -37.07 / -2.9% | 219 / -75.69 / -5.9% | -70.07 | 33.00 |
| CHASE | Combined | Good to soft / yielding | 846 | 203 / -73.37 / -8.7% | 147 / -170.09 / -20.1% | 145 / -14.44 / -1.7% | -186.09 | 16.00 |
| CHASE | Combined | Soft | 531 | 127 / -51.27 / -9.7% | 101 / -86.32 / -16.3% | 85 / -74.87 / -14.1% | -106.32 | 20.00 |
| CHASE | Combined | Heavy | 217 | 53 / -23.86 / -11.0% | 40 / -24.39 / -11.2% | 41 / -26.16 / -12.1% | -40.39 | 16.00 |
| CHASE | Combined | Mixed / other | 20 | 6 / -1.02 / -5.1% | 4 / -4.15 / -20.7% | 2 / -0.25 / -1.3% | -9.65 | 5.50 |
| CHASE | November | Good / faster | 71 | 18 / -16.50 / -23.2% | 15 / -9.75 / -13.7% | 18 / 17.90 / 25.2% | -21.75 | 12.00 |
| CHASE | November | Good to soft / yielding | 35 | 11 / 14.81 / 42.3% | 6 / -5.13 / -14.6% | 5 / -22.88 / -65.4% | -11.63 | 6.50 |
| CHASE | November | Soft | 8 | 0 / -8.00 / -100.0% | 3 / 6.00 / 75.0% | 1 / 0.50 / 6.3% | 1.50 | 4.50 |

## Market agreement for original T2

| Family | Period | Rank basis | T2 market tier | Races / bets | T1 W / £ / ROI | T2 W / £ / ROI | T3 W / £ / ROI | T2 less largest £ | T2 largest win £ | Mean market rank T1 / T2 / T3 | Model minus market pp T1 / T2 / T3 | T1 actual / model E / market E | T2 actual / model E / market E | T2 outsider bets / wins / £ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| HURDLE | 2025 | spPL | 1–3 | 1822 | 488 / -314.64 / -17.3% | 459 / -283.60 / -15.6% | 262 / -335.84 / -18.4% | -301.60 | 18.00 | 2.6 / 1.9 / 4.1 | 2.7 / -5.4 / -0.2 | 488.0 / 528.7 / 479.6 | 459.0 / 342.0 / 440.3 | 35 / 2 / -4.00 |
| HURDLE | 2025 | spPL | 4–6 | 771 | 212 / -112.35 / -14.6% | 65 / -127.67 / -16.6% | 119 / -186.40 / -24.2% | -155.67 | 28.00 | 2.4 / 4.7 / 3.8 | 0.5 / 7.3 / -2.4 | 212.0 / 192.8 / 189.1 | 65.0 / 122.4 / 66.3 | 326 / 18 / -40.00 |
| HURDLE | 2025 | spPL | 7+ | 307 | 65 / -33.54 / -10.9% | 7 / -195.00 / -63.5% | 40 / -53.67 / -17.5% | -220.00 | 25.00 | 3.3 / 8.9 / 4.8 | 2.7 / 8.6 / -1.2 | 65.0 / 60.1 / 51.8 | 7.0 / 38.6 / 12.1 | 295 / 5 / -203.00 |
| HURDLE | 2026 | spPL | 1–3 | 1335 | 352 / -240.33 / -18.0% | 342 / -162.02 / -12.1% | 187 / -229.33 / -17.2% | -169.52 | 7.50 | 2.7 / 1.9 / 4.1 | 3.1 / -6.2 / -0.0 | 352.0 / 384.3 / 342.9 | 342.0 / 243.5 / 326.0 | 18 / 0 / -18.00 |
| HURDLE | 2026 | spPL | 4–6 | 531 | 135 / -129.29 / -24.3% | 49 / -80.67 / -15.2% | 86 / -96.88 / -18.2% | -100.67 | 20.00 | 2.5 / 4.7 / 3.7 | -0.0 / 8.1 / -3.3 | 134.5 / 133.8 / 133.8 | 49.0 / 89.2 / 46.3 | 214 / 12 / -58.00 |
| HURDLE | 2026 | spPL | 7+ | 254 | 44 / -33.55 / -13.2% | 11 / -74.00 / -29.1% | 28 / -111.42 / -43.9% | -99.00 | 25.00 | 3.4 / 8.8 / 4.6 | -0.4 / 8.6 / -1.0 | 44.0 / 44.5 / 45.5 | 11.0 / 32.0 / 10.2 | 246 / 10 / -76.00 |
| HURDLE | 2026 | capPL | 1–3 | 130 | 39 / 0.25 / 0.2% | 27 / -43.37 / -33.4% | 22 / 44.01 / 33.9% | -47.87 | 4.50 | 2.6 / 1.9 / 3.6 | 5.6 / -5.2 / -1.7 | 39.0 / 38.3 / 31.0 | 27.0 / 25.3 / 32.1 | 1 / 0 / -1.00 |
| HURDLE | 2026 | capPL | 4–6 | 42 | 13 / -0.28 / -0.7% | 4 / -10.50 / -25.0% | 4 / -25.22 / -60.0% | -18.50 | 8.00 | 2.6 / 4.6 / 4.3 | 1.8 / 7.2 / -2.6 | 13.0 / 10.7 / 10.0 | 4.0 / 6.7 / 3.6 | 14 / 0 / -14.00 |
| HURDLE | 2026 | capPL | 7+ | 20 | 3 / -6.87 / -34.4% | 1 / -9.00 / -45.0% | 0 / -20.00 / -100.0% | -19.00 | 10.00 | 2.7 / 8.3 / 5.5 | 3.6 / 7.5 / 1.0 | 3.0 / 4.0 / 3.2 | 1.0 / 2.5 / 1.0 | 15 / 1 / -4.00 |
| HURDLE | Combined | spPL | 1–3 | 3157 | 840 / -554.97 / -17.6% | 801 / -445.63 / -14.1% | 449 / -565.18 / -17.9% | -463.63 | 18.00 | 2.7 / 1.9 / 4.1 | 2.9 / -5.7 / -0.2 | 840.0 / 913.0 / 822.4 | 801.0 / 585.5 / 766.3 | 53 / 2 / -22.00 |
| HURDLE | Combined | spPL | 4–6 | 1302 | 347 / -241.64 / -18.6% | 114 / -208.33 / -16.0% | 205 / -283.29 / -21.8% | -236.33 | 28.00 | 2.5 / 4.7 / 3.8 | 0.3 / 7.6 / -2.8 | 346.5 / 326.6 / 322.9 | 114.0 / 211.6 / 112.6 | 540 / 30 / -98.00 |
| HURDLE | Combined | spPL | 7+ | 561 | 109 / -67.09 / -12.0% | 18 / -269.00 / -48.0% | 68 / -165.09 / -29.4% | -294.00 | 25.00 | 3.3 / 8.8 / 4.7 | 1.3 / 8.6 / -1.1 | 109.0 / 104.6 / 97.3 | 18.0 / 70.6 / 22.4 | 541 / 15 / -279.00 |
| HURDLE | Combined | capPL | 1–3 | 130 | 39 / 0.25 / 0.2% | 27 / -43.37 / -33.4% | 22 / 44.01 / 33.9% | -47.87 | 4.50 | 2.6 / 1.9 / 3.6 | 5.6 / -5.2 / -1.7 | 39.0 / 38.3 / 31.0 | 27.0 / 25.3 / 32.1 | 1 / 0 / -1.00 |
| HURDLE | Combined | capPL | 4–6 | 42 | 13 / -0.28 / -0.7% | 4 / -10.50 / -25.0% | 4 / -25.22 / -60.0% | -18.50 | 8.00 | 2.6 / 4.6 / 4.3 | 1.8 / 7.2 / -2.6 | 13.0 / 10.7 / 10.0 | 4.0 / 6.7 / 3.6 | 14 / 0 / -14.00 |
| HURDLE | Combined | capPL | 7+ | 20 | 3 / -6.87 / -34.4% | 1 / -9.00 / -45.0% | 0 / -20.00 / -100.0% | -19.00 | 10.00 | 2.7 / 8.3 / 5.5 | 3.6 / 7.5 / 1.0 | 3.0 / 4.0 / 3.2 | 1.0 / 2.5 / 1.0 | 15 / 1 / -4.00 |
| HURDLE | November | spPL | 1–3 | 131 | 31 / -46.59 / -35.6% | 43 / 5.31 / 4.1% | 13 / -70.89 / -54.1% | -0.69 | 6.00 | 2.4 / 1.9 / 3.8 | -1.2 / -7.1 / -1.0 | 31.0 / 33.1 / 34.7 | 43.0 / 23.1 / 32.4 | 4 / 0 / -4.00 |
| HURDLE | November | spPL | 4–6 | 63 | 15 / -25.69 / -40.8% | 3 / -32.50 / -51.6% | 8 / -27.96 / -44.4% | -43.50 | 11.00 | 2.0 / 4.6 / 3.5 | -3.2 / 8.6 / -4.4 | 15.0 / 15.9 / 18.0 | 3.0 / 10.5 / 5.1 | 33 / 1 / -21.00 |
| HURDLE | November | spPL | 7+ | 17 | 5 / 10.00 / 58.8% | 2 / 11.00 / 64.7% | 1 / -10.50 / -61.8% | -3.00 | 14.00 | 2.5 / 8.6 / 4.2 | -2.3 / 8.9 / -3.9 | 5.0 / 3.0 / 3.3 | 2.0 / 2.0 / 0.5 | 17 / 2 / 11.00 |
| HURDLE | November | capPL | 1–3 | 114 | 24 / -50.57 / -44.4% | 35 / -8.02 / -7.0% | 14 / -48.97 / -43.0% | -13.02 | 5.00 | 2.3 / 1.9 / 3.9 | 0.3 / -6.2 / -0.7 | 24.0 / 28.1 / 27.7 | 35.0 / 19.9 / 26.9 | 3 / 0 / -3.00 |
| HURDLE | November | capPL | 4–6 | 55 | 15 / -5.75 / -10.5% | 5 / -14.00 / -25.5% | 4 / -40.75 / -74.1% | -22.50 | 8.50 | 1.9 / 4.5 / 3.3 | -3.7 / 7.3 / -2.7 | 15.0 / 13.2 / 15.2 | 5.0 / 9.1 / 5.0 | 18 / 0 / -18.00 |
| HURDLE | November | capPL | 7+ | 15 | 4 / 2.75 / 18.3% | 2 / 13.00 / 86.7% | 0 / -15.00 / -100.0% | -3.00 | 16.00 | 3.0 / 8.5 / 5.6 | 0.0 / 9.1 / 0.5 | 4.0 / 3.0 / 3.0 | 2.0 / 1.9 / 0.5 | 15 / 2 / 13.00 |
| CHASE | 2025 | spPL | 1–3 | 1122 | 306 / -50.56 / -4.5% | 281 / -98.73 / -8.8% | 188 / -58.04 / -5.2% | -106.73 | 8.00 | 2.4 / 1.9 / 3.7 | 2.3 / -4.2 / 0.6 | 306.0 / 314.0 / 288.5 | 281.0 / 227.6 / 274.9 | 6 / 0 / -6.00 |
| CHASE | 2025 | spPL | 4–6 | 441 | 97 / -92.36 / -20.9% | 48 / -10.00 / -2.3% | 90 / 61.17 / 13.9% | -26.00 | 16.00 | 2.2 / 4.8 / 3.4 | -0.2 / 7.5 / -2.4 | 97.0 / 104.4 / 105.5 | 48.0 / 76.0 / 42.9 | 144 / 13 / 23.00 |
| CHASE | 2025 | spPL | 7+ | 114 | 24 / -3.08 / -2.7% | 4 / -21.00 / -18.4% | 14 / -18.52 / -16.2% | -54.00 | 33.00 | 3.2 / 8.7 / 4.9 | -0.1 / 8.0 / -0.6 | 24.0 / 19.1 / 19.2 | 4.0 / 14.3 / 5.1 | 112 / 4 / -19.00 |
| CHASE | 2026 | spPL | 1–3 | 808 | 226 / -103.32 / -12.8% | 193 / -164.79 / -20.4% | 138 / -110.59 / -13.7% | -171.29 | 6.50 | 2.4 / 1.9 / 3.6 | 2.2 / -3.9 / 0.5 | 226.0 / 232.0 / 214.4 | 193.0 / 169.9 / 201.7 | 8 / 0 / -8.00 |
| CHASE | 2026 | spPL | 4–6 | 311 | 72 / -38.97 / -12.5% | 32 / 0.50 / 0.2% | 54 / -10.04 / -3.2% | -27.50 | 28.00 | 2.2 / 4.6 / 3.3 | -0.6 / 8.2 / -1.9 | 72.0 / 77.2 / 79.1 | 32.0 / 55.6 / 29.9 | 104 / 11 / 65.00 |
| CHASE | 2026 | spPL | 7+ | 92 | 17 / -9.72 / -10.6% | 5 / -28.00 / -30.4% | 8 / -55.38 / -60.2% | -40.00 | 12.00 | 3.2 / 8.4 / 3.8 | 1.0 / 8.3 / -2.6 | 17.0 / 15.7 / 14.8 | 5.0 / 12.0 / 4.4 | 87 / 5 / -23.00 |
| CHASE | 2026 | capPL | 1–3 | 78 | 21 / -24.03 / -30.8% | 21 / 6.64 / 8.5% | 11 / -24.13 / -30.9% | 1.64 | 5.00 | 1.9 / 2.1 / 3.2 | 1.1 / -1.3 / -0.2 | 21.0 / 23.6 / 22.8 | 21.0 / 17.4 / 18.4 | 0 / 0 / 0.00 |
| CHASE | 2026 | capPL | 4–6 | 20 | 7 / 14.58 / 72.9% | 1 / -15.67 / -78.3% | 3 / -10.12 / -50.6% | -19.00 | 3.33 | 2.4 / 4.5 / 2.8 | 1.4 / 7.3 / -2.3 | 7.0 / 5.3 / 5.0 | 1.0 / 3.8 / 2.3 | 3 / 0 / -3.00 |
| CHASE | 2026 | capPL | 7+ | 6 | 1 / -3.25 / -54.2% | 0 / -6.00 / -100.0% | 2 / 1.08 / 18.0% | — | — | 3.3 / 7.8 / 3.0 | 0.9 / 8.9 / -6.9 | 1.0 / 1.0 / 0.9 | 0.0 / 0.8 / 0.3 | 6 / 0 / -6.00 |
| CHASE | Combined | spPL | 1–3 | 1930 | 532 / -153.89 / -8.0% | 474 / -263.52 / -13.7% | 326 / -168.63 / -8.7% | -271.52 | 8.00 | 2.4 / 1.9 / 3.6 | 2.2 / -4.1 / 0.5 | 532.0 / 546.0 / 502.9 | 474.0 / 397.5 / 476.6 | 14 / 0 / -14.00 |
| CHASE | Combined | spPL | 4–6 | 752 | 169 / -131.33 / -17.5% | 80 / -9.50 / -1.3% | 144 / 51.13 / 6.8% | -37.50 | 28.00 | 2.2 / 4.7 / 3.4 | -0.4 / 7.8 / -2.2 | 169.0 / 181.6 / 184.6 | 80.0 / 131.5 / 72.8 | 248 / 24 / 88.00 |
| CHASE | Combined | spPL | 7+ | 206 | 41 / -12.80 / -6.2% | 9 / -49.00 / -23.8% | 22 / -73.90 / -35.9% | -82.00 | 33.00 | 3.2 / 8.5 / 4.4 | 0.4 / 8.1 / -1.5 | 41.0 / 34.8 / 34.0 | 9.0 / 26.3 / 9.5 | 199 / 9 / -42.00 |
| CHASE | Combined | capPL | 1–3 | 78 | 21 / -24.03 / -30.8% | 21 / 6.64 / 8.5% | 11 / -24.13 / -30.9% | 1.64 | 5.00 | 1.9 / 2.1 / 3.2 | 1.1 / -1.3 / -0.2 | 21.0 / 23.6 / 22.8 | 21.0 / 17.4 / 18.4 | 0 / 0 / 0.00 |
| CHASE | Combined | capPL | 4–6 | 20 | 7 / 14.58 / 72.9% | 1 / -15.67 / -78.3% | 3 / -10.12 / -50.6% | -19.00 | 3.33 | 2.4 / 4.5 / 2.8 | 1.4 / 7.3 / -2.3 | 7.0 / 5.3 / 5.0 | 1.0 / 3.8 / 2.3 | 3 / 0 / -3.00 |
| CHASE | Combined | capPL | 7+ | 6 | 1 / -3.25 / -54.2% | 0 / -6.00 / -100.0% | 2 / 1.08 / 18.0% | — | — | 3.3 / 7.8 / 3.0 | 0.9 / 8.9 / -6.9 | 1.0 / 1.0 / 0.9 | 0.0 / 0.8 / 0.3 | 6 / 0 / -6.00 |
| CHASE | November | spPL | 1–3 | 76 | 21 / -8.17 / -10.7% | 20 / -6.38 / -8.4% | 16 / 9.25 / 12.2% | -11.88 | 5.50 | 2.3 / 1.9 / 3.4 | 1.2 / -3.7 / -0.7 | 20.5 / 20.4 / 19.5 | 20.0 / 15.3 / 18.2 | 1 / 0 / -1.00 |
| CHASE | November | spPL | 4–6 | 30 | 7 / 2.97 / 9.9% | 3 / -4.00 / -13.3% | 6 / -9.63 / -32.1% | -16.00 | 12.00 | 2.4 / 4.5 / 2.8 | 0.0 / 6.6 / -5.3 | 7.0 / 6.5 / 6.5 | 3.0 / 5.0 / 3.1 | 8 / 1 / 5.00 |
| CHASE | November | spPL | 7+ | 8 | 1 / -4.50 / -56.3% | 1 / 1.50 / 18.8% | 2 / -4.10 / -51.2% | -7.00 | 8.50 | 1.6 / 8.1 / 6.3 | -2.0 / 8.7 / -4.2 | 1.0 / 1.5 / 1.6 | 1.0 / 1.0 / 0.3 | 7 / 0 / -7.00 |
| CHASE | November | capPL | 1–3 | 73 | 19 / -13.11 / -18.0% | 20 / -1.61 / -2.2% | 17 / 10.97 / 15.0% | -7.61 | 6.00 | 2.3 / 1.9 / 3.4 | 2.0 / -3.0 / -0.7 | 18.5 / 19.9 / 18.4 | 20.0 / 15.0 / 17.2 | 1 / 0 / -1.00 |
| CHASE | November | capPL | 4–6 | 22 | 5 / 0.33 / 1.5% | 3 / 5.50 / 25.0% | 4 / -9.20 / -41.8% | -6.50 | 12.00 | 2.1 / 4.6 / 2.7 | 1.8 / 6.4 / -5.3 | 5.0 / 5.1 / 4.7 | 3.0 / 3.7 / 2.3 | 4 / 1 / 9.00 |
| CHASE | November | capPL | 7+ | 8 | 2 / 1.25 / 15.6% | 1 / 2.00 / 25.0% | 0 / -8.00 / -100.0% | -7.00 | 9.00 | 2.0 / 8.9 / 7.6 | -1.0 / 6.3 / 4.2 | 2.0 / 1.3 / 1.4 | 1.0 / 0.9 / 0.4 | 6 / 0 / -6.00 |

## Handicap by distance

| Family | Period | Basis | Eligible interaction | Races / bets | T1 W / £ / ROI | T2 W / £ / ROI | T3 W / £ / ROI | T2 less largest £ | T2 largest win £ | T1 minus T2 £ | T3 minus T2 £ | Largest T1 / T3 win £ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| HURDLE | 2025 | spPL | Handicap / Short | 517 | 106 / -59.04 / -11.4% | 94 / -86.95 / -16.8% | 69 / -120.41 / -23.3% | -100.95 | 14.00 | 27.91 | -33.46 | 14.00 / 28.00 |
| HURDLE | 2025 | spPL | Handicap / Intermediate | 678 | 133 / -119.99 / -17.7% | 113 / -129.78 / -19.1% | 98 / -27.94 / -4.1% | -154.78 | 25.00 | 9.79 | 101.84 | 28.00 / 22.00 |
| HURDLE | 2025 | spPL | Handicap / Staying | 448 | 98 / -80.59 / -18.0% | 81 / -50.91 / -11.4% | 56 / -75.07 / -16.8% | -72.91 | 22.00 | -29.67 | -24.15 | 10.00 / 25.00 |
| HURDLE | 2025 | spPL | Non-handicap / Short | 703 | 244 / -110.88 / -15.8% | 130 / -228.56 / -32.5% | 101 / -226.77 / -32.3% | -256.56 | 28.00 | 117.68 | 1.79 | 20.00 / 40.00 |
| HURDLE | 2025 | spPL | Non-handicap / Intermediate | 444 | 151 / -59.73 / -13.5% | 92 / -69.02 / -15.5% | 76 / -103.80 / -23.4% | -97.02 | 28.00 | 9.28 | -34.78 | 12.00 / 20.00 |
| HURDLE | 2025 | spPL | Non-handicap / Staying | 110 | 33 / -30.30 / -27.5% | 21 / -41.06 / -37.3% | 21 / -21.93 / -19.9% | -51.06 | 10.00 | 10.76 | 19.12 | 6.00 / 10.00 |
| HURDLE | 2026 | spPL | Handicap / Short | 393 | 71 / -106.29 / -27.0% | 65 / -74.25 / -18.9% | 45 / -105.73 / -26.9% | -99.25 | 25.00 | -32.04 | -31.48 | 22.00 / 33.00 |
| HURDLE | 2026 | spPL | Handicap / Intermediate | 495 | 87 / -124.89 / -25.2% | 94 / 52.69 / 10.6% | 68 / -68.89 / -13.9% | 30.69 | 22.00 | -177.58 | -121.58 | 25.00 / 33.00 |
| HURDLE | 2026 | spPL | Handicap / Staying | 362 | 75 / -14.20 / -3.9% | 57 / -54.86 / -15.2% | 47 / -114.77 / -31.7% | -66.86 | 12.00 | 40.66 | -59.92 | 28.00 / 12.00 |
| HURDLE | 2026 | spPL | Non-handicap / Short | 488 | 173 / -72.77 / -14.9% | 106 / -134.98 / -27.7% | 74 / -105.73 / -21.7% | -148.98 | 14.00 | 62.21 | 29.25 | 18.00 / 80.00 |
| HURDLE | 2026 | spPL | Non-handicap / Intermediate | 303 | 100 / -63.98 / -21.1% | 66 / -79.00 / -26.1% | 54 / -6.67 / -2.2% | -93.00 | 14.00 | 15.03 | 72.34 | 11.00 / 50.00 |
| HURDLE | 2026 | spPL | Non-handicap / Staying | 79 | 25 / -21.03 / -26.6% | 14 / -26.28 / -33.3% | 13 / -35.84 / -45.4% | -37.28 | 11.00 | 5.24 | -9.56 | 4.00 / 5.50 |
| HURDLE | November | spPL | Handicap / Short | 36 | 9 / 15.24 / 42.3% | 3 / -18.75 / -52.1% | 3 / -14.50 / -40.3% | -29.75 | 11.00 | 33.99 | 4.25 | 10.00 / 10.00 |
| HURDLE | November | spPL | Handicap / Intermediate | 52 | 9 / -22.93 / -44.1% | 15 / 35.12 / 67.5% | 9 / -6.83 / -13.1% | 21.12 | 14.00 | -58.04 | -41.95 | 5.50 / 6.00 |
| HURDLE | November | spPL | Handicap / Staying | 24 | 2 / -18.75 / -78.1% | 5 / -6.67 / -27.8% | 2 / -12.00 / -50.0% | -10.17 | 3.50 | -12.08 | -5.33 | 2.25 / 8.50 |
| HURDLE | November | spPL | Non-handicap / Short | 48 | 18 / -17.26 / -36.0% | 10 / -21.15 / -44.1% | 3 / -40.33 / -84.0% | -25.65 | 4.50 | 3.89 | -19.18 | 2.13 / 3.33 |
| HURDLE | November | spPL | Non-handicap / Intermediate | 32 | 9 / -8.28 / -25.9% | 10 / 2.19 / 6.8% | 3 / -25.68 / -80.2% | -3.81 | 6.00 | -10.47 | -27.87 | 5.00 / 1.38 |
| HURDLE | November | spPL | Non-handicap / Staying | 5 | 1 / -2.63 / -52.5% | 2 / 1.00 / 20.0% | 0 / -5.00 / -100.0% | -1.50 | 2.50 | -3.63 | -6.00 | 1.38 / — |
| CHASE | 2025 | spPL | Handicap / Short | 297 | 81 / -15.10 / -5.1% | 62 / -37.88 / -12.8% | 60 / 12.16 / 4.1% | -53.88 | 16.00 | 22.78 | 50.04 | 12.00 / 18.00 |
| CHASE | 2025 | spPL | Handicap / Intermediate | 677 | 150 / -119.14 / -17.6% | 133 / 5.81 / 0.9% | 122 / -22.50 / -3.3% | -16.19 | 22.00 | -124.95 | -28.31 | 12.00 / 25.00 |
| CHASE | 2025 | spPL | Handicap / Staying | 348 | 82 / 43.15 / 12.4% | 66 / -32.06 / -9.2% | 55 / -29.13 / -8.4% | -50.06 | 18.00 | 75.21 | 2.92 | 33.00 / 20.00 |
| CHASE | 2025 | spPL | Non-handicap / Short | 95 | 36 / -3.72 / -3.9% | 14 / -27.17 / -28.6% | 15 / 73.58 / 77.5% | -41.17 | 14.00 | 23.45 | 100.76 | 9.00 / 66.00 |
| CHASE | 2025 | spPL | Non-handicap / Intermediate | 188 | 60 / -28.62 / -15.2% | 46 / -9.96 / -5.3% | 27 / -57.11 / -30.4% | -42.96 | 33.00 | -18.66 | -47.16 | 7.50 / 18.00 |
| CHASE | 2025 | spPL | Non-handicap / Staying | 72 | 18 / -22.58 / -31.4% | 12 / -28.47 / -39.5% | 13 / 7.61 / 10.6% | -34.47 | 6.00 | 5.89 | 36.08 | 7.50 / 12.00 |
| CHASE | 2026 | spPL | Handicap / Short | 201 | 48 / -60.20 / -29.9% | 38 / -60.47 / -30.1% | 30 / -53.70 / -26.7% | -71.47 | 11.00 | 0.28 | 6.77 | 5.50 / 16.00 |
| CHASE | 2026 | spPL | Handicap / Intermediate | 517 | 138 / -31.29 / -6.1% | 91 / -40.31 / -7.8% | 80 / -43.38 / -8.4% | -68.31 | 28.00 | 9.02 | -3.07 | 16.00 / 22.00 |
| CHASE | 2026 | spPL | Handicap / Staying | 242 | 59 / 1.56 / 0.6% | 42 / -86.72 / -35.8% | 40 / -40.45 / -16.7% | -98.72 | 12.00 | 88.29 | 46.28 | 28.00 / 14.00 |
| CHASE | 2026 | spPL | Non-handicap / Short | 58 | 15 / -19.56 / -33.7% | 11 / -19.82 / -34.2% | 17 / 4.69 / 8.1% | -26.32 | 6.50 | 0.25 | 24.51 | 4.00 / 7.00 |
| CHASE | 2026 | spPL | Non-handicap / Intermediate | 137 | 42 / -39.87 / -29.1% | 28 / -9.82 / -7.2% | 22 / -32.57 / -23.8% | -23.82 | 14.00 | -30.04 | -22.75 | 4.50 / 18.00 |
| CHASE | 2026 | spPL | Non-handicap / Staying | 56 | 13 / -2.66 / -4.7% | 20 / 24.86 / 44.4% | 11 / -10.60 / -18.9% | 8.86 | 16.00 | -27.52 | -35.46 | 12.00 / 11.00 |
| CHASE | November | spPL | Handicap / Short | 19 | 4 / 2.83 / 14.9% | 3 / -11.38 / -59.9% | 6 / 10.75 / 56.6% | -13.13 | 1.75 | 14.20 | 22.13 | 9.00 / 6.00 |
| CHASE | November | spPL | Handicap / Intermediate | 40 | 8 / -12.00 / -30.0% | 9 / 8.88 / 22.2% | 6 / -13.63 / -34.1% | -3.13 | 12.00 | -20.88 | -22.50 | 5.00 / 9.00 |
| CHASE | November | spPL | Handicap / Staying | 26 | 3 / -16.00 / -61.5% | 5 / -5.25 / -20.2% | 7 / 14.25 / 54.8% | -10.25 | 5.00 | -10.75 | 19.50 | 3.50 / 8.00 |
| CHASE | November | spPL | Non-handicap / Short | 7 | 5 / 11.32 / 161.7% | 1 / 2.50 / 35.7% | 1 / -5.38 / -76.9% | -6.00 | 8.50 | 8.82 | -7.88 | 6.50 / 0.62 |
| CHASE | November | spPL | Non-handicap / Intermediate | 15 | 6 / 4.16 / 27.7% | 3 / -3.50 / -23.3% | 3 / -5.72 / -38.2% | -7.00 | 3.50 | 7.66 | -2.22 | 8.00 / 4.50 |
| CHASE | November | spPL | Non-handicap / Staying | 5 | 2 / 0.60 / 12.0% | 2 / 0.38 / 7.5% | 1 / -2.75 / -55.0% | -1.63 | 2.00 | 0.23 | -3.13 | 2.50 / 1.25 |

## Handicap by going

| Family | Period | Basis | Eligible interaction | Races / bets | T1 W / £ / ROI | T2 W / £ / ROI | T3 W / £ / ROI | T2 less largest £ | T2 largest win £ | T1 minus T2 £ | T3 minus T2 £ | Largest T1 / T3 win £ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| HURDLE | 2025 | spPL | Handicap / Good / faster | 776 | 184 / -56.18 / -7.2% | 145 / -127.61 / -16.4% | 111 / -67.39 / -8.7% | -152.61 | 25.00 | 71.42 | 60.22 | 28.00 / 28.00 |
| HURDLE | 2025 | spPL | Handicap / Good to soft / yielding | 477 | 88 / -93.86 / -19.7% | 82 / -46.73 / -9.8% | 61 / -84.12 / -17.6% | -68.73 | 22.00 | -47.12 | -37.39 | 12.00 / 25.00 |
| HURDLE | 2025 | spPL | Handicap / Soft or heavy | 388 | 65 / -107.58 / -27.7% | 61 / -91.30 / -23.5% | 51 / -69.90 / -18.0% | -113.30 | 22.00 | -16.28 | 21.40 | 14.00 / 25.00 |
| HURDLE | 2025 | spPL | Non-handicap / Good / faster | 464 | 181 / -11.89 / -2.6% | 104 / -85.91 / -18.5% | 77 / -78.92 / -17.0% | -113.91 | 28.00 | 74.02 | 6.99 | 18.00 / 25.00 |
| HURDLE | 2025 | spPL | Non-handicap / Good to soft / yielding | 407 | 110 / -132.34 / -32.5% | 77 / -102.38 / -25.2% | 60 / -176.80 / -43.4% | -130.38 | 28.00 | -29.96 | -74.43 | 9.00 / 12.00 |
| HURDLE | 2025 | spPL | Non-handicap / Soft or heavy | 384 | 137 / -54.68 / -14.2% | 62 / -148.35 / -38.6% | 60 / -99.28 / -25.9% | -176.35 | 28.00 | 93.66 | 49.06 | 20.00 / 40.00 |
| HURDLE | 2026 | spPL | Handicap / Good / faster | 717 | 150 / -64.55 / -9.0% | 112 / -142.26 / -19.8% | 100 / -165.90 / -23.1% | -164.26 | 22.00 | 77.71 | -23.64 | 28.00 / 33.00 |
| HURDLE | 2026 | spPL | Handicap / Good to soft / yielding | 267 | 40 / -67.63 / -25.3% | 49 / 26.18 / 9.8% | 29 / -102.42 / -38.4% | 12.18 | 14.00 | -93.81 | -128.59 | 25.00 / 14.00 |
| HURDLE | 2026 | spPL | Handicap / Soft or heavy | 261 | 43 / -108.20 / -41.5% | 53 / 14.16 / 5.4% | 31 / -16.08 / -6.2% | -5.84 | 20.00 | -122.36 | -30.24 | 12.00 / 33.00 |
| HURDLE | 2026 | spPL | Non-handicap / Good / faster | 392 | 143 / -49.18 / -12.5% | 86 / -121.84 / -31.1% | 66 / 26.77 / 6.8% | -135.84 | 14.00 | 72.67 | 148.61 | 18.00 / 80.00 |
| HURDLE | 2026 | spPL | Non-handicap / Good to soft / yielding | 227 | 64 / -67.92 / -29.9% | 52 / -47.32 / -20.8% | 34 / -73.67 / -32.5% | -58.32 | 11.00 | -20.60 | -26.35 | 11.00 / 16.00 |
| HURDLE | 2026 | spPL | Non-handicap / Soft or heavy | 244 | 88 / -38.57 / -15.8% | 46 / -68.48 / -28.1% | 40 / -95.96 / -39.3% | -82.48 | 14.00 | 29.92 | -27.48 | 6.00 / 7.50 |
| HURDLE | November | spPL | Handicap / Good / faster | 62 | 15 / -3.18 / -5.1% | 13 / -7.55 / -12.2% | 8 / -21.67 / -34.9% | -18.55 | 11.00 | 4.36 | -14.12 | 10.00 / 6.00 |
| HURDLE | November | spPL | Handicap / Good to soft / yielding | 34 | 3 / -15.00 / -44.1% | 6 / 4.50 / 13.2% | 5 / -6.67 / -19.6% | -9.50 | 14.00 | -19.50 | -11.17 | 7.50 / 8.50 |
| HURDLE | November | spPL | Handicap / Soft or heavy | 11 | 2 / -3.25 / -29.5% | 2 / 11.00 / 100.0% | 0 / -11.00 / -100.0% | -1.00 | 12.00 | -14.25 | -22.00 | 4.50 / — |
| HURDLE | November | spPL | Non-handicap / Good / faster | 28 | 8 / -10.60 / -37.9% | 7 / -5.55 / -19.8% | 4 / -17.72 / -63.3% | -9.55 | 4.00 | -5.05 | -12.17 | 2.75 / 3.33 |
| HURDLE | November | spPL | Non-handicap / Good to soft / yielding | 33 | 13 / -8.77 / -26.6% | 8 / -14.35 / -43.5% | 2 / -29.29 / -88.8% | -17.35 | 3.00 | 5.58 | -14.94 | 2.13 / 1.38 |
| HURDLE | November | spPL | Non-handicap / Soft or heavy | 16 | 6 / -2.09 / -13.1% | 5 / 5.66 / 35.4% | 0 / -16.00 / -100.0% | -0.34 | 6.00 | -7.75 | -21.66 | 5.00 / — |
| CHASE | 2025 | spPL | Handicap / Good / faster | 591 | 152 / -74.17 / -12.6% | 134 / 24.77 / 4.2% | 108 / -46.63 / -7.9% | 2.77 | 22.00 | -98.94 | -71.40 | 10.00 / 20.00 |
| CHASE | 2025 | spPL | Handicap / Good to soft / yielding | 406 | 89 / 5.40 / 1.3% | 67 / -56.48 / -13.9% | 77 / 49.66 / 12.2% | -72.48 | 16.00 | 61.88 | 106.14 | 33.00 / 25.00 |
| CHASE | 2025 | spPL | Handicap / Soft or heavy | 323 | 71 / -26.31 / -8.1% | 60 / -30.41 / -9.4% | 52 / -40.50 / -12.5% | -42.41 | 12.00 | 4.10 | -10.09 | 11.00 / 18.00 |
| CHASE | 2025 | spPL | Non-handicap / Good / faster | 97 | 32 / -15.44 / -15.9% | 24 / 1.38 / 1.4% | 19 / 108.75 / 112.1% | -31.62 | 33.00 | -16.82 | 107.37 | 5.00 / 66.00 |
| CHASE | 2025 | spPL | Non-handicap / Good to soft / yielding | 140 | 42 / -30.64 / -21.9% | 27 / -41.39 / -29.6% | 19 / -37.89 / -27.1% | -55.39 | 14.00 | 10.75 | 3.50 | 7.50 / 18.00 |
| CHASE | 2025 | spPL | Non-handicap / Soft or heavy | 117 | 40 / -7.85 / -6.7% | 21 / -24.59 / -21.0% | 16 / -62.78 / -53.7% | -35.59 | 11.00 | 16.74 | -38.19 | 9.00 / 6.00 |
| CHASE | 2026 | spPL | Handicap / Good / faster | 507 | 145 / -50.84 / -10.0% | 96 / -59.05 / -11.6% | 74 / -126.13 / -24.9% | -87.05 | 28.00 | 8.21 | -67.09 | 9.00 / 22.00 |
| CHASE | 2026 | spPL | Handicap / Good to soft / yielding | 216 | 51 / -16.55 / -7.7% | 32 / -66.75 / -30.9% | 33 / -28.25 / -13.1% | -78.75 | 12.00 | 50.20 | 38.50 | 10.00 / 14.00 |
| CHASE | 2026 | spPL | Handicap / Soft or heavy | 231 | 48 / -21.04 / -9.1% | 42 / -60.22 / -26.1% | 43 / 22.85 / 9.9% | -80.22 | 20.00 | 39.18 | 83.07 | 28.00 / 20.00 |
| CHASE | 2026 | spPL | Non-handicap / Good / faster | 79 | 24 / -8.05 / -10.2% | 17 / -4.17 / -5.3% | 18 / -11.67 / -14.8% | -15.17 | 11.00 | -3.89 | -7.51 | 12.00 / 6.50 |
| CHASE | 2026 | spPL | Non-handicap / Good to soft / yielding | 84 | 21 / -31.58 / -37.6% | 21 / -5.46 / -6.5% | 16 / 2.04 / 2.4% | -17.46 | 12.00 | -26.11 | 7.50 | 4.50 / 18.00 |
| CHASE | 2026 | spPL | Non-handicap / Soft or heavy | 77 | 21 / -19.93 / -25.9% | 18 / 4.50 / 5.8% | 15 / -20.59 / -26.7% | -11.50 | 16.00 | -24.43 | -25.09 | 4.50 / 6.00 |
| CHASE | November | spPL | Handicap / Good / faster | 57 | 11 / -20.68 / -36.3% | 12 / -9.75 / -17.1% | 15 / 22.63 / 39.7% | -21.75 | 12.00 | -10.93 | 32.38 | 5.00 / 9.00 |
| CHASE | November | spPL | Handicap / Good to soft / yielding | 23 | 4 / 0.50 / 2.2% | 4 / 1.50 / 6.5% | 3 / -14.75 / -64.1% | -5.00 | 6.50 | -1.00 | -16.25 | 9.00 / 1.88 |
| CHASE | November | spPL | Handicap / Soft or heavy | 5 | 0 / -5.00 / -100.0% | 1 / 0.50 / 10.0% | 1 / 3.50 / 70.0% | -4.00 | 4.50 | -5.50 | 3.00 | — / 7.50 |
| CHASE | November | spPL | Non-handicap / Good / faster | 12 | 6 / 4.77 / 39.8% | 2 / 0.50 / 4.2% | 3 / -2.73 / -22.7% | -8.00 | 8.50 | 4.27 | -3.23 | 6.50 / 4.50 |
| CHASE | November | spPL | Non-handicap / Good to soft / yielding | 12 | 7 / 14.31 / 119.3% | 2 / -6.63 / -55.2% | 2 / -8.13 / -67.8% | -8.63 | 2.00 | 20.94 | -1.51 | 8.00 / 1.25 |
| CHASE | November | spPL | Non-handicap / Soft or heavy | 3 | 0 / -3.00 / -100.0% | 2 / 5.50 / 183.3% | 0 / -3.00 / -100.0% | 2.00 | 3.50 | -8.50 | -8.50 | — / — |

## Distance by market disagreement

| Family | Period | Basis | Eligible interaction | Races / bets | T1 W / £ / ROI | T2 W / £ / ROI | T3 W / £ / ROI | T2 less largest £ | T2 largest win £ | T1 minus T2 £ | T3 minus T2 £ | Largest T1 / T3 win £ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| HURDLE | 2025 | spPL | Short / 1–3 | 778 | 230 / -109.93 / -14.1% | 204 / -93.01 / -12.0% | 100 / -241.52 / -31.0% | -111.01 | 18.00 | -16.93 | -148.51 | 18.00 / 40.00 |
| HURDLE | 2025 | spPL | Short / 4–6 | 301 | 89 / -23.61 / -7.8% | 18 / -111.50 / -37.0% | 48 / -55.79 / -18.5% | -139.50 | 28.00 | 87.89 | 55.71 | 20.00 / 28.00 |
| HURDLE | 2025 | spPL | Short / 7+ | 141 | 31 / -36.38 / -25.8% | 2 / -111.00 / -78.7% | 22 / -49.87 / -35.4% | -125.00 | 14.00 | 74.62 | 61.13 | 7.50 / 12.00 |
| HURDLE | 2025 | spPL | Intermediate / 1–3 | 703 | 180 / -97.82 / -13.9% | 171 / -147.29 / -21.0% | 113 / -71.64 / -10.2% | -154.79 | 7.50 | 49.48 | 75.65 | 28.00 / 22.00 |
| HURDLE | 2025 | spPL | Intermediate / 4–6 | 311 | 85 / -56.30 / -18.1% | 32 / 17.50 / 5.6% | 49 / -56.80 / -18.3% | -10.50 | 28.00 | -73.80 | -74.30 | 7.50 / 14.00 |
| HURDLE | 2025 | spPL | Intermediate / 7+ | 108 | 19 / -25.61 / -23.7% | 2 / -69.00 / -63.9% | 12 / -3.30 / -3.1% | -94.00 | 25.00 | 43.39 | 65.70 | 7.00 / 18.00 |
| HURDLE | 2025 | spPL | Staying / 1–3 | 341 | 78 / -106.89 / -31.3% | 84 / -43.30 / -12.7% | 49 / -22.68 / -6.7% | -48.30 | 5.00 | -63.59 | 20.62 | 10.00 / 25.00 |
| HURDLE | 2025 | spPL | Staying / 4–6 | 159 | 38 / -32.44 / -20.4% | 15 / -33.67 / -21.2% | 22 / -73.82 / -46.4% | -47.67 | 14.00 | 1.22 | -40.15 | 7.00 / 5.50 |
| HURDLE | 2025 | spPL | Staying / 7+ | 58 | 15 / 28.45 / 49.1% | 3 / -15.00 / -25.9% | 6 / -0.50 / -0.9% | -37.00 | 22.00 | 43.45 | 14.50 | 7.50 / 25.00 |
| HURDLE | 2026 | spPL | Short / 1–3 | 578 | 167 / -104.25 / -18.0% | 155 / -70.57 / -12.2% | 75 / -139.47 / -24.1% | -78.07 | 7.50 | -33.68 | -68.90 | 22.00 / 80.00 |
| HURDLE | 2026 | spPL | Short / 4–6 | 211 | 62 / -48.97 / -23.2% | 13 / -94.67 / -44.9% | 35 / -21.55 / -10.2% | -108.67 | 14.00 | 45.70 | 73.12 | 7.00 / 25.00 |
| HURDLE | 2026 | spPL | Short / 7+ | 92 | 15 / -25.85 / -28.1% | 3 / -44.00 / -47.8% | 9 / -50.45 / -54.8% | -69.00 | 25.00 | 18.15 | -6.45 | 22.00 / 9.00 |
| HURDLE | 2026 | spPL | Intermediate / 1–3 | 492 | 118 / -133.01 / -27.0% | 131 / -42.82 / -8.7% | 78 / 10.70 / 2.2% | -49.82 | 7.00 | -90.20 | 53.52 | 14.00 / 50.00 |
| HURDLE | 2026 | spPL | Intermediate / 4–6 | 197 | 47 / -39.22 / -19.9% | 23 / 17.50 / 8.9% | 31 / -52.16 / -26.5% | -2.50 | 20.00 | -56.72 | -69.66 | 25.00 / 14.00 |
| HURDLE | 2026 | spPL | Intermediate / 7+ | 109 | 22 / -16.63 / -15.3% | 6 / -1.00 / -0.9% | 13 / -34.10 / -31.3% | -23.00 | 22.00 | -15.63 | -33.10 | 12.00 / 8.00 |
| HURDLE | 2026 | spPL | Staying / 1–3 | 265 | 67 / -3.07 / -1.2% | 56 / -48.63 / -18.4% | 34 / -100.57 / -37.9% | -54.13 | 5.50 | 45.57 | -51.93 | 12.00 / 12.00 |
| HURDLE | 2026 | spPL | Staying / 4–6 | 123 | 26 / -41.10 / -33.4% | 13 / -3.50 / -2.8% | 20 / -23.17 / -18.8% | -15.50 | 12.00 | -37.60 | -19.67 | 6.50 / 12.00 |
| HURDLE | 2026 | spPL | Staying / 7+ | 53 | 7 / 8.93 / 16.9% | 2 / -29.00 / -54.7% | 6 / -26.88 / -50.7% | -41.00 | 12.00 | 37.93 | 2.13 | 28.00 / 6.00 |
| HURDLE | 2026 | capPL | Short / 1–3 | 55 | 16 / -4.29 / -7.8% | 15 / -8.04 / -14.6% | 8 / 39.58 / 72.0% | -11.54 | 3.50 | 3.75 | 47.62 | 7.00 / 66.00 |
| HURDLE | 2026 | capPL | Short / 4–6 | 18 | 6 / -1.96 / -10.9% | 2 / -3.00 / -16.7% | 1 / -8.50 / -47.2% | -10.50 | 7.50 | 1.04 | -5.50 | 3.00 / 8.50 |
| HURDLE | 2026 | capPL | Short / 7+ | 7 | 1 / -4.37 / -62.4% | 0 / -7.00 / -100.0% | 0 / -7.00 / -100.0% | — | — | 2.63 | 0.00 | 1.63 / — |
| HURDLE | 2026 | capPL | Intermediate / 1–3 | 50 | 15 / 3.35 / 6.7% | 8 / -25.33 / -50.7% | 10 / 17.00 / 34.0% | -29.83 | 4.50 | 28.68 | 42.33 | 16.00 / 18.00 |
| HURDLE | 2026 | capPL | Intermediate / 4–6 | 13 | 3 / -3.07 / -23.6% | 1 / -5.50 / -42.3% | 3 / -5.72 / -44.0% | -12.00 | 6.50 | 2.43 | -0.22 | 4.50 / 2.50 |
| HURDLE | 2026 | capPL | Intermediate / 7+ | 8 | 1 / -4.50 / -56.3% | 1 / 3.00 / 37.5% | 0 / -8.00 / -100.0% | -7.00 | 10.00 | -7.50 | -11.00 | 2.50 / — |
| HURDLE | 2026 | capPL | Staying / 1–3 | 25 | 8 / 1.19 / 4.8% | 4 / -10.00 / -40.0% | 4 / -12.57 / -50.3% | -13.00 | 3.00 | 11.19 | -2.57 | 5.50 / 3.33 |
| HURDLE | 2026 | capPL | Staying / 4–6 | 11 | 4 / 4.75 / 43.2% | 1 / -2.00 / -18.2% | 0 / -11.00 / -100.0% | -10.00 | 8.00 | 6.75 | -9.00 | 4.50 / — |
| HURDLE | 2026 | capPL | Staying / 7+ | 5 | 1 / 2.00 / 40.0% | 0 / -5.00 / -100.0% | 0 / -5.00 / -100.0% | — | — | 7.00 | 0.00 | 6.00 / — |
| HURDLE | November | spPL | Short / 1–3 | 56 | 17 / -8.55 / -15.3% | 15 / -17.83 / -31.8% | 5 / -31.67 / -56.5% | -22.33 | 4.50 | 9.28 | -13.84 | 7.00 / 10.00 |
| HURDLE | November | spPL | Short / 4–6 | 31 | 10 / -6.90 / -22.3% | 1 / -19.00 / -61.3% | 2 / -23.67 / -76.3% | -30.00 | 11.00 | 12.10 | -4.67 | 7.50 / 3.33 |
| HURDLE | November | spPL | Short / 7+ | 10 | 2 / 3.50 / 35.0% | 0 / -10.00 / -100.0% | 1 / -3.50 / -35.0% | — | — | 13.50 | 6.50 | 10.00 / 5.50 |
| HURDLE | November | spPL | Intermediate / 1–3 | 54 | 12 / -22.67 / -42.0% | 21 / 20.81 / 38.5% | 7 / -20.72 / -38.4% | 14.81 | 6.00 | -43.47 | -41.53 | 5.00 / 6.00 |
| HURDLE | November | spPL | Intermediate / 4–6 | 24 | 4 / -12.79 / -53.3% | 2 / -5.50 / -22.9% | 5 / -5.79 / -24.1% | -14.00 | 8.50 | -7.29 | -0.29 | 3.00 / 4.00 |
| HURDLE | November | spPL | Intermediate / 7+ | 7 | 3 / 6.50 / 92.9% | 2 / 21.00 / 300.0% | 0 / -7.00 / -100.0% | 7.00 | 14.00 | -14.50 | -28.00 | 5.50 / — |
| HURDLE | November | spPL | Staying / 1–3 | 21 | 2 / -15.38 / -73.2% | 7 / 2.33 / 11.1% | 1 / -18.50 / -88.1% | -1.17 | 3.50 | -17.71 | -20.83 | 2.25 / 1.50 |
| HURDLE | November | spPL | Staying / 4–6 | 8 | 1 / -6.00 / -75.0% | 0 / -8.00 / -100.0% | 1 / 1.50 / 18.8% | — | — | 2.00 | 9.50 | 1.00 / 8.50 |
| HURDLE | November | capPL | Short / 1–3 | 47 | 12 / -18.16 / -38.6% | 13 / -14.51 / -30.9% | 6 / -17.22 / -36.6% | -17.84 | 3.33 | -3.65 | -2.71 | 5.00 / 9.00 |
| HURDLE | November | capPL | Short / 4–6 | 30 | 10 / -3.62 / -12.1% | 1 / -21.50 / -71.7% | 2 / -23.75 / -79.2% | -29.00 | 7.50 | 17.88 | -2.25 | 5.50 / 2.50 |
| HURDLE | November | capPL | Short / 7+ | 8 | 2 / 3.50 / 43.8% | 0 / -8.00 / -100.0% | 0 / -8.00 / -100.0% | — | — | 11.50 | 0.00 | 9.00 / — |
| HURDLE | November | capPL | Intermediate / 1–3 | 50 | 10 / -21.41 / -42.8% | 17 / 7.36 / 14.7% | 8 / -14.75 / -29.5% | 2.36 | 5.00 | -28.77 | -22.11 | 5.50 / 8.00 |
| HURDLE | November | capPL | Intermediate / 4–6 | 21 | 5 / 1.87 / 8.9% | 4 / 11.50 / 54.8% | 1 / -16.00 / -76.2% | 3.00 | 8.50 | -9.63 | -27.50 | 11.00 / 4.00 |
| HURDLE | November | capPL | Intermediate / 7+ | 6 | 2 / 0.25 / 4.2% | 2 / 22.00 / 366.7% | 0 / -6.00 / -100.0% | 6.00 | 16.00 | -21.75 | -28.00 | 2.50 / — |
| HURDLE | November | capPL | Staying / 1–3 | 17 | 2 / -11.00 / -64.7% | 5 / -0.87 / -5.1% | 0 / -17.00 / -100.0% | -4.37 | 3.50 | -10.13 | -16.13 | 3.00 / — |
| HURDLE | November | capPL | Staying / 4–6 | 4 | 0 / -4.00 / -100.0% | 0 / -4.00 / -100.0% | 1 / -1.00 / -25.0% | — | — | 0.00 | 3.00 | — / 2.00 |
| HURDLE | November | capPL | Staying / 7+ | 1 | 0 / -1.00 / -100.0% | 0 / -1.00 / -100.0% | 0 / -1.00 / -100.0% | — | — | 0.00 | 0.00 | — / — |
| CHASE | 2025 | spPL | Short / 1–3 | 273 | 79 / -24.13 / -8.8% | 64 / -61.05 / -22.4% | 51 / 45.95 / 16.8% | -68.05 | 7.00 | 36.92 | 107.01 | 12.00 / 28.00 |
| CHASE | 2025 | spPL | Short / 4–6 | 94 | 32 / 1.35 / 1.4% | 11 / 4.00 / 4.3% | 23 / 62.69 / 66.7% | -10.00 | 14.00 | -2.65 | 58.69 | 3.50 / 66.00 |
| CHASE | 2025 | spPL | Short / 7+ | 25 | 6 / 3.96 / 15.8% | 1 / -8.00 / -32.0% | 1 / -22.90 / -91.6% | -24.00 | 16.00 | 11.96 | -14.90 | 7.00 / 1.10 |
| CHASE | 2025 | spPL | Intermediate / 1–3 | 573 | 155 / -66.83 / -11.7% | 147 / -30.14 / -5.3% | 98 / -34.14 / -6.0% | -38.14 | 8.00 | -36.68 | -3.99 | 9.00 / 25.00 |
| CHASE | 2025 | spPL | Intermediate / 4–6 | 238 | 42 / -81.55 / -34.3% | 30 / 23.00 / 9.7% | 41 / -60.10 / -25.3% | 9.00 | 14.00 | -104.55 | -83.10 | 12.00 / 7.00 |
| CHASE | 2025 | spPL | Intermediate / 7+ | 54 | 13 / 0.63 / 1.2% | 2 / 3.00 / 5.6% | 10 / 14.63 / 27.1% | -30.00 | 33.00 | -2.38 | 11.63 | 5.50 / 14.00 |
| CHASE | 2025 | spPL | Staying / 1–3 | 276 | 72 / 40.40 / 14.6% | 70 / -7.53 / -2.7% | 39 / -69.86 / -25.3% | -14.03 | 6.50 | 47.93 | -62.33 | 33.00 / 12.00 |
| CHASE | 2025 | spPL | Staying / 4–6 | 109 | 23 / -12.16 / -11.2% | 7 / -37.00 / -33.9% | 26 / 58.58 / 53.7% | -53.00 | 16.00 | 24.84 | 95.58 | 10.00 / 20.00 |
| CHASE | 2025 | spPL | Staying / 7+ | 35 | 5 / -7.67 / -21.9% | 1 / -16.00 / -45.7% | 3 / -10.25 / -29.3% | -34.00 | 18.00 | 8.33 | 5.75 | 9.00 / 11.00 |
| CHASE | 2026 | spPL | Short / 1–3 | 182 | 48 / -49.79 / -27.4% | 45 / -34.29 / -18.8% | 31 / -48.11 / -26.4% | -40.79 | 6.50 | -15.50 | -13.82 | 5.00 / 8.00 |
| CHASE | 2026 | spPL | Short / 4–6 | 59 | 12 / -23.39 / -39.6% | 3 / -40.00 / -67.8% | 14 / 6.10 / 10.3% | -46.00 | 6.00 | 16.61 | 46.10 | 4.50 / 16.00 |
| CHASE | 2026 | spPL | Short / 7+ | 18 | 3 / -6.58 / -36.6% | 1 / -6.00 / -33.3% | 2 / -7.00 / -38.9% | -17.00 | 11.00 | -0.58 | -1.00 | 5.50 / 4.50 |
| CHASE | 2026 | spPL | Intermediate / 1–3 | 425 | 131 / -27.72 / -6.5% | 93 / -106.14 / -25.0% | 69 / -39.98 / -9.4% | -112.14 | 6.00 | 78.42 | 66.16 | 9.00 / 20.00 |
| CHASE | 2026 | spPL | Intermediate / 4–6 | 184 | 40 / -36.05 / -19.6% | 23 / 62.00 / 33.7% | 29 / -8.72 / -4.7% | 34.00 | 28.00 | -98.05 | -70.72 | 16.00 / 22.00 |
| CHASE | 2026 | spPL | Intermediate / 7+ | 45 | 9 / -7.39 / -16.4% | 3 / -6.00 / -13.3% | 4 / -27.25 / -60.6% | -18.00 | 12.00 | -1.39 | -21.25 | 6.50 / 5.50 |
| CHASE | 2026 | spPL | Staying / 1–3 | 201 | 47 / -25.81 / -12.8% | 55 / -24.36 / -12.1% | 38 / -22.51 / -11.2% | -28.86 | 4.50 | -1.45 | 1.86 | 14.00 / 14.00 |
| CHASE | 2026 | spPL | Staying / 4–6 | 68 | 20 / 20.47 / 30.1% | 6 / -21.50 / -31.6% | 11 / -7.42 / -10.9% | -37.50 | 16.00 | 41.97 | 14.08 | 28.00 / 12.00 |
| CHASE | 2026 | spPL | Staying / 7+ | 29 | 5 / 4.25 / 14.7% | 1 / -16.00 / -55.2% | 2 / -21.13 / -72.8% | -28.00 | 12.00 | 20.25 | -5.13 | 10.00 / 4.00 |
| CHASE | 2026 | capPL | Short / 1–3 | 17 | 4 / -6.13 / -36.1% | 5 / 1.38 / 8.1% | 3 / -3.75 / -22.1% | -3.12 | 4.50 | -7.51 | -5.13 | 3.50 / 6.50 |
| CHASE | 2026 | capPL | Short / 4–6 | 4 | 1 / -1.62 / -40.5% | 1 / 0.33 / 8.3% | 0 / -4.00 / -100.0% | -3.00 | 3.33 | -1.95 | -4.33 | 1.38 / — |
| CHASE | 2026 | capPL | Short / 7+ | 1 | 0 / -1.00 / -100.0% | 0 / -1.00 / -100.0% | 0 / -1.00 / -100.0% | — | — | 0.00 | 0.00 | — / — |
| CHASE | 2026 | capPL | Intermediate / 1–3 | 42 | 14 / -7.38 / -17.6% | 9 / -0.37 / -0.9% | 7 / -8.88 / -21.1% | -5.37 | 5.00 | -7.01 | -8.51 | 3.00 / 6.50 |
| CHASE | 2026 | capPL | Intermediate / 4–6 | 12 | 4 / 13.50 / 112.5% | 0 / -12.00 / -100.0% | 2 / -6.12 / -51.0% | — | — | 25.50 | 5.88 | 12.00 / 2.00 |
| CHASE | 2026 | capPL | Intermediate / 7+ | 4 | 1 / -1.25 / -31.3% | 0 / -4.00 / -100.0% | 1 / 0.33 / 8.3% | — | — | 2.75 | 4.33 | 1.75 / 3.33 |
| CHASE | 2026 | capPL | Staying / 1–3 | 19 | 3 / -10.52 / -55.4% | 7 / 5.63 / 29.6% | 1 / -11.50 / -60.5% | 2.63 | 3.00 | -16.15 | -17.13 | 2.50 / 6.50 |
| CHASE | 2026 | capPL | Staying / 4–6 | 4 | 2 / 2.70 / 67.5% | 0 / -4.00 / -100.0% | 1 / 0.00 / 0.0% | — | — | 6.70 | 4.00 | 3.50 / 3.00 |
| CHASE | 2026 | capPL | Staying / 7+ | 1 | 0 / -1.00 / -100.0% | 0 / -1.00 / -100.0% | 1 / 1.75 / 175.0% | — | — | 0.00 | 2.75 | — / 1.75 |
| CHASE | November | spPL | Short / 1–3 | 17 | 7 / 4.92 / 29.0% | 3 / -9.38 / -55.1% | 5 / 10.25 / 60.3% | -11.13 | 1.75 | 14.30 | 19.63 | 6.50 / 6.00 |
| CHASE | November | spPL | Short / 4–6 | 7 | 3 / 12.63 / 180.4% | 0 / -7.00 / -100.0% | 1 / -5.38 / -76.9% | — | — | 19.63 | 1.62 | 9.00 / 0.62 |
| CHASE | November | spPL | Short / 7+ | 3 | 0 / -3.00 / -100.0% | 1 / 6.50 / 216.7% | 1 / -0.50 / -16.7% | -2.00 | 8.50 | -9.50 | -7.00 | — / 1.50 |
| CHASE | November | spPL | Intermediate / 1–3 | 39 | 12 / 0.16 / 0.4% | 10 / -3.13 / -8.0% | 5 / -15.25 / -39.1% | -8.63 | 5.50 | 3.29 | -12.13 | 8.00 / 9.00 |
| CHASE | November | spPL | Intermediate / 4–6 | 14 | 2 / -6.00 / -42.9% | 3 / 12.00 / 85.7% | 3 / -3.50 / -25.0% | 0.00 | 12.00 | -18.00 | -15.50 | 4.50 / 4.00 |
| CHASE | November | spPL | Intermediate / 7+ | 3 | 0 / -3.00 / -100.0% | 0 / -3.00 / -100.0% | 1 / -1.60 / -53.3% | — | — | 0.00 | 1.40 | — / 0.40 |
| CHASE | November | spPL | Staying / 1–3 | 20 | 2 / -13.25 / -66.3% | 7 / 6.13 / 30.6% | 6 / 14.25 / 71.3% | 1.13 | 5.00 | -19.38 | 8.13 | 3.50 / 8.00 |
| CHASE | November | spPL | Staying / 4–6 | 9 | 2 / -3.65 / -40.6% | 0 / -9.00 / -100.0% | 2 / -0.75 / -8.3% | — | — | 5.35 | 8.25 | 2.25 / 4.50 |
| CHASE | November | spPL | Staying / 7+ | 2 | 1 / 1.50 / 75.0% | 0 / -2.00 / -100.0% | 0 / -2.00 / -100.0% | — | — | 3.50 | 0.00 | 2.50 / — |
| CHASE | November | capPL | Short / 1–3 | 17 | 6 / -1.14 / -6.7% | 3 / -9.37 / -55.1% | 5 / 6.88 / 40.5% | -11.12 | 1.75 | 8.23 | 16.25 | 3.50 / 5.50 |
| CHASE | November | capPL | Short / 4–6 | 6 | 2 / 1.75 / 29.2% | 0 / -6.00 / -100.0% | 2 / -1.70 / -28.3% | — | — | 7.75 | 4.30 | 3.50 / 1.50 |
| CHASE | November | capPL | Short / 7+ | 3 | 1 / 3.50 / 116.7% | 1 / 7.00 / 233.3% | 0 / -3.00 / -100.0% | -2.00 | 9.00 | -3.50 | -10.00 | 5.50 / — |
| CHASE | November | capPL | Intermediate / 1–3 | 38 | 10 / -2.72 / -7.2% | 11 / 6.13 / 16.1% | 7 / -2.74 / -7.2% | 0.13 | 6.00 | -8.85 | -8.87 | 12.00 / 7.00 |
| CHASE | November | capPL | Intermediate / 4–6 | 8 | 2 / 2.25 / 28.1% | 2 / 11.00 / 137.5% | 0 / -8.00 / -100.0% | -1.00 | 12.00 | -8.75 | -19.00 | 5.50 / — |
| CHASE | November | capPL | Intermediate / 7+ | 2 | 0 / -2.00 / -100.0% | 0 / -2.00 / -100.0% | 0 / -2.00 / -100.0% | — | — | 0.00 | 0.00 | — / — |
| CHASE | November | capPL | Staying / 1–3 | 18 | 3 / -9.25 / -51.4% | 6 / 1.63 / 9.1% | 5 / 6.83 / 37.9% | -1.87 | 3.50 | -10.88 | 5.20 | 2.50 / 7.00 |
| CHASE | November | capPL | Staying / 4–6 | 8 | 1 / -3.67 / -45.9% | 1 / 0.50 / 6.3% | 2 / 0.50 / 6.3% | -7.00 | 7.50 | -4.17 | 0.00 | 3.33 / 4.00 |
| CHASE | November | capPL | Staying / 7+ | 3 | 1 / -0.25 / -8.3% | 0 / -3.00 / -100.0% | 0 / -3.00 / -100.0% | — | — | 2.75 | 0.00 | 1.75 / — |

## Development policies versus T2

| Idea | Period | Basis | Opportunity races | Affected races | Policy bets / W | Baseline £ | Policy £ | Change £ | Affected T2 £ | Affected policy £ | Largest affected winner £ | Affected policy £ without largest | Affected winners missed by abstention |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 Hurdle short non-handicap abstention | 2025 | spPL | 2900 | 703 | 2197 / 401 | -606.27 | -377.71 | 228.56 | -228.56 | 0.00 | 28.00 | — | 130 |
| 1 Hurdle short non-handicap abstention | 2026 | spPL | 2120 | 488 | 1632 / 296 | -316.69 | -181.70 | 134.98 | -134.98 | 0.00 | 14.00 | — | 106 |
| 1 Hurdle short non-handicap abstention | 2026 | capPL | 192 | 49 | 143 / 23 | -62.87 | -44.83 | 18.04 | -18.04 | 0.00 | 7.50 | — | 9 |
| 1 Hurdle short non-handicap abstention | Combined | spPL | 5020 | 1191 | 3829 / 697 | -922.96 | -559.41 | 363.54 | -363.54 | 0.00 | 28.00 | — | 236 |
| 1 Hurdle short non-handicap abstention | Combined | capPL | 192 | 49 | 143 / 23 | -62.87 | -44.83 | 18.04 | -18.04 | 0.00 | 7.50 | — | 9 |
| 1 Hurdle short non-handicap abstention | November | spPL | 211 | 48 | 163 / 38 | -16.19 | 4.96 | 21.15 | -21.15 | 0.00 | 4.50 | — | 10 |
| 1 Hurdle short non-handicap abstention | November | capPL | 184 | 42 | 142 / 34 | -9.02 | 13.00 | 22.02 | -22.02 | 0.00 | 3.33 | — | 8 |
| 2 Chase handicap T3 | 2025 | spPL | 1677 | 1322 | 1677 / 309 | -129.73 | -105.08 | 24.65 | -64.13 | -39.47 | 25.00 | -64.47 | 0 |
| 2 Chase handicap T3 | 2026 | spPL | 1211 | 960 | 1211 / 209 | -192.29 | -142.31 | 49.99 | -187.51 | -137.53 | 22.00 | -159.53 | 0 |
| 2 Chase handicap T3 | 2026 | capPL | 104 | 84 | 104 / 16 | -15.03 | -34.24 | -19.21 | -11.41 | -30.62 | 6.50 | -37.12 | 0 |
| 2 Chase handicap T3 | Combined | spPL | 2888 | 2282 | 2888 / 518 | -322.02 | -247.38 | 74.64 | -251.64 | -177.00 | 25.00 | -202.00 | 0 |
| 2 Chase handicap T3 | Combined | capPL | 104 | 84 | 104 / 16 | -15.03 | -34.24 | -19.21 | -11.41 | -30.62 | 6.50 | -37.12 | 0 |
| 2 Chase handicap T3 | November | spPL | 114 | 85 | 114 / 26 | -8.88 | 10.25 | 19.13 | -7.75 | 11.38 | 9.00 | 2.38 | 0 |
| 2 Chase handicap T3 | November | capPL | 103 | 77 | 103 / 24 | 5.89 | 12.14 | 6.25 | 1.01 | 7.26 | 7.00 | 0.26 | 0 |
| 3 Chase staying handicap T1 | 2025 | spPL | 1677 | 348 | 1677 / 349 | -129.73 | -54.51 | 75.21 | -32.06 | 43.15 | 33.00 | 10.15 | 0 |
| 3 Chase staying handicap T1 | 2026 | spPL | 1211 | 242 | 1211 / 247 | -192.29 | -104.00 | 88.29 | -86.72 | 1.56 | 28.00 | -26.44 | 0 |
| 3 Chase staying handicap T1 | 2026 | capPL | 104 | 21 | 104 / 20 | -15.03 | -22.93 | -7.90 | -0.12 | -8.02 | 3.50 | -11.52 | 0 |
| 3 Chase staying handicap T1 | Combined | spPL | 2888 | 590 | 2888 / 596 | -322.02 | -158.52 | 163.50 | -118.78 | 44.72 | 33.00 | 11.72 | 0 |
| 3 Chase staying handicap T1 | Combined | capPL | 104 | 21 | 104 / 20 | -15.03 | -22.93 | -7.90 | -0.12 | -8.02 | 3.50 | -11.52 | 0 |
| 3 Chase staying handicap T1 | November | spPL | 114 | 26 | 114 / 22 | -8.88 | -19.63 | -10.75 | -5.25 | -16.00 | 3.50 | -19.50 | 0 |
| 3 Chase staying handicap T1 | November | capPL | 103 | 24 | 103 / 22 | 5.89 | -5.53 | -11.42 | -1.50 | -12.92 | 3.33 | -16.25 | 0 |

## Same-calendar historical sensitivity

| Idea | Year | Races / bets per original rank | Affected races | Affected T2 £ | Affected policy £ | Difference £ |
| --- | --- | --- | --- | --- | --- | --- |
| 1 Hurdle short non-handicap abstention | 2025 | 2029 | 454 | -106.75 | 0.00 | 106.75 |
| 1 Hurdle short non-handicap abstention | 2026 | 2026 | 455 | -135.68 | 0.00 | 135.68 |
| 2 Chase handicap T3 | 2025 | 1171 | 921 | -43.07 | -23.47 | 19.60 |
| 2 Chase handicap T3 | 2026 | 1145 | 905 | -168.46 | -139.53 | 28.93 |
| 3 Chase staying handicap T1 | 2025 | 1171 | 233 | -1.14 | 15.76 | 16.90 |
| 3 Chase staying handicap T1 | 2026 | 1145 | 226 | -74.72 | 9.19 | 83.91 |

## Same-board historical and November price basis

| Family | Period | Races | Captured T1 / T2 / T3 £ | SP T1 / T2 / T3 £ |
| --- | --- | --- | --- | --- |
| HURDLE | 2026 | 192 | -6.90 / -62.87 / -1.21 | -5.37 / -41.85 / 4.61 |
| HURDLE | November | 184 | -53.57 / -9.02 / -104.72 | -54.35 / -6.69 / -103.55 |
| CHASE | 2026 | 104 | -12.70 / -15.03 / -33.17 | -6.16 / -13.92 / -25.96 |
| CHASE | November | 103 | -11.53 / 5.89 / -6.23 | -15.94 / 2.13 / -6.51 |

## Coverage validation

| Family | Period | First | Last | Ranked races | Missing exact going | Unknown handicap | Missing distance | Complete historic/frozen market | SP matched T1–T3 | SP matched going missing |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| HURDLE | 2025 | 2025-01-01 | 2025-12-31 | 2905 | 0 | 0 | 0 | 0 | 2900 | 0 |
| HURDLE | 2026 | 2026-01-01 | 2026-11-04 | 2125 | 0 | 0 | 0 | 192 | 2120 | 0 |
| HURDLE | November | 2026-11-05 | 2026-11-26 | 238 | 0 | 14 | 0 | 209 | 211 | 0 |
| CHASE | 2025 | 2025-01-01 | 2025-12-31 | 1698 | 0 | 0 | 0 | 0 | 1677 | 0 |
| CHASE | 2026 | 2026-01-01 | 2026-10-29 | 1220 | 0 | 0 | 0 | 105 | 1211 | 0 |
| CHASE | November | 2026-11-05 | 2026-11-26 | 140 | 0 | 3 | 0 | 125 | 114 | 0 |

## Ranked replay sources

| Family | Period | Provenance | Ranked fields | Matched SP | Matched captured | SP T1/T2/T3 £ |
| --- | --- | --- | --- | --- | --- | --- |
| HURDLE | 2025 | Local frozen-coefficient replay | 2905 | 2900 | 0 | -460.52 / -606.27 / -575.92 |
| HURDLE | 2026 | Local frozen-coefficient replay | 2031 | 2026 | 98 | -412.17 / -307.97 / -389.83 |
| HURDLE | 2026 | October Value input replay | 94 | 94 | 94 | 9.00 / -8.72 / -47.81 |
| HURDLE | November | Frozen November | 238 | 211 | 184 | -62.28 / -16.19 / -109.35 |
| CHASE | 2025 | Local frozen-coefficient replay | 1698 | 1677 | 0 | -146.01 / -129.73 / -15.40 |
| CHASE | 2026 | Stored Chase promotion | 1220 | 1211 | 104 | -152.01 / -192.29 / -176.01 |
| CHASE | November | Frozen November | 140 | 114 | 103 | -9.69 / -8.88 / -4.48 |

## Switch sensitivity excluding largest alternative winner race

| Idea | Period | Basis | Affected races | Largest winner decimal | P/L gain with all races | P/L gain after removing that race |
| --- | --- | --- | --- | --- | --- | --- |
| 2 Chase handicap T3 | 2025 | spPL | 1322 | 26.00 | 24.65 | -1.35 |
| 2 Chase handicap T3 | 2026 | spPL | 960 | 23.00 | 49.99 | 26.99 |
| 2 Chase handicap T3 | 2026 | capPL | 84 | 7.50 | -19.21 | -26.71 |
| 2 Chase handicap T3 | November | spPL | 85 | 10.00 | 19.13 | 9.13 |
| 2 Chase handicap T3 | November | capPL | 77 | 8.00 | 6.25 | -1.75 |
| 3 Chase staying handicap T1 | 2025 | spPL | 348 | 34.00 | 75.21 | 41.21 |
| 3 Chase staying handicap T1 | 2026 | spPL | 242 | 29.00 | 88.29 | 59.29 |
| 3 Chase staying handicap T1 | 2026 | capPL | 21 | 4.50 | -7.90 | -12.40 |
| 3 Chase staying handicap T1 | November | spPL | 26 | 4.50 | -10.75 | -15.25 |
| 3 Chase staying handicap T1 | November | capPL | 24 | 4.33 | -11.42 | -15.75 |

## November opportunity-level confirmation of accounting

| Idea | Basis | Settled race opportunities | Abstentions (T2 winners skipped) | Switches | T2 bets / W | Policy bets / W | T2 £ | Policy £ | Change £ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 Hurdle short non-handicap abstention | spPL | 238 | 55 (12) | 0 | 228 / 53 | 174 / 41 | -4.18 | 2.24 | 6.42 |
| 1 Hurdle short non-handicap abstention | capPL | 209 | 49 (10) | 0 | 200 / 47 | 152 / 37 | 11.33 | 12.85 | 1.52 |
| 2 Chase handicap T3 | spPL | 140 | 0 (0) | 102 | 129 / 28 | 130 / 30 | -4.95 | 6.97 | 11.92 |
| 2 Chase handicap T3 | capPL | 125 | 0 (0) | 91 | 115 / 26 | 119 / 28 | 1.59 | 17.64 | 16.05 |
| 3 Chase staying handicap T1 | spPL | 140 | 0 (0) | 32 | 129 / 28 | 128 / 25 | -4.95 | -18.20 | -13.25 |
| 3 Chase staying handicap T1 | capPL | 125 | 0 (0) | 29 | 115 / 26 | 114 / 24 | 1.59 | -8.83 | -10.42 |
