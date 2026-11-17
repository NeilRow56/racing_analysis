# Tissue Generation: prospective Rank 1 versus Rank 2 diagnostic


Snapshot: 2026-11-15T12:45:38.972Z (Europe/London is UTC on this date). Research only. £1 per eligible selection; T2 minus T1 throughout.


## Executive summary

The displayed 15 November headlines reproduce exactly. T2 has a higher realised captured-price return in the matched sample, but a repeatable value advantage is not established. Both overall ranks lose money. Family, withdrawal status, a few winning returns and limited racing dates materially affect the interpretation.

- On 196 priced paired races across 9 dates, T1 returns £-49.68 (-25.35%) and T2 £-2.86 (-1.46%). The £46.82 difference is 23.89% of one £1 stake per paired race. Its date-clustered 95% interval is -30.23% to 73.40%: direction remains uncertain.

- All-Weather is the clearest descriptive anomaly: 15/53 T2 winners versus 7/53 T1, although it spans only five dates. Its positive priced T2 P/L becomes negative after removing its two largest T2 winning-return races.

- Overall relative outperformance survives removal of the largest two winning-return races, shrinking to £10.82. Hurdle and Chase advantages each reverse after removing their own largest T2 winning-return race.

- The overall lead is concentrated in races containing an NR/void elsewhere in the field: excluding those races reverses the return difference. Stored results do not establish bookmaker withdrawal deductions or executable betting returns.

- T1 overprediction and T2 underprediction are plausible early calibration patterns, especially on AW, but paired/date-clustered intervals do not establish a stable rank-specific calibration defect. Continue unchanged observation; do not promote T2, recalibrate, or change thresholds.


## 1. Population and reconciliation

The exact page source is `data/research/tissue-generation-forward-2026-11.json`, generation `TISSUE_GENERATION_2026_11`, activated **2026-11-05T07:26:36.629Z**. Development ended 2026-11-05T06:57:32.000Z. One family probability book supplies both ranks; these are not two separately fitted models. The page flattens every stored book, without filtering to the separately armed V3 or Value experiments. There are 275 books and distinct race IDs, 2603 frozen runner observations, and 231 complete-market books. No duplicate race captures or tied T1/T2 selections occur in this snapshot.

| Family | Frozen model version | Model content hash |
| --- | --- | --- |
| AW | AW_TISSUE_V3 | `c8f75faa0aeacc88ba76f100e7d154a872bc9b2ee31a5a42d18e611e3e64f9a5` |
| HURDLE | HURDLE_TISSUE_V2 | `53defc50d717aba63c80c9f3c01c4df4360b709f6f4a21509a514179e23cce90` |
| CHASE | CHASE_TISSUE_V2 | `be65702490403f6a287d11ecb19307a67b58ca975ee7bd9ece71b4e0d759aa81` |
| TURF | TURF_TISSUE_V4 | `e106fadd07263b1fcc4ece821a4bfcad645faeae873db026433a4902eabbe3fe` |

Counts below are selections. Pending means no persisted outcome; NR/void are excluded from settled stakes and expected wins. These independently summed figures equal the supplied page values, including family ROI and A/E after rounding.

| Family | Rank | Captured | Settled | Pending | NR | Void | Winners | Expected | Strike | A/E | Price n | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ALL | 1 | 275 | 249 | 16 | 9 | 1 | 56 | 62.84 | 22.49% | 0.89 | 206 | -52.47 | -25.47% |
| ALL | 2 | 275 | 245 | 16 | 14 | 0 | 54 | 43.77 | 22.04% | 1.23 | 204 | -3.16 | -1.55% |
| AW | 1 | 53 | 53 | 0 | 0 | 0 | 7 | 11.06 | 13.21% | 0.63 | 48 | -11.65 | -24.27% |
| AW | 2 | 53 | 53 | 0 | 0 | 0 | 15 | 8.31 | 28.30% | 1.81 | 48 | 11.24 | 23.42% |
| HURDLE | 1 | 132 | 120 | 8 | 3 | 1 | 31 | 31.57 | 25.83% | 0.98 | 96 | -16.84 | -17.54% |
| HURDLE | 2 | 132 | 118 | 8 | 6 | 0 | 24 | 20.90 | 20.34% | 1.15 | 95 | -8.12 | -8.55% |
| CHASE | 1 | 82 | 68 | 8 | 6 | 0 | 17 | 18.87 | 25.00% | 0.90 | 55 | -16.98 | -30.87% |
| CHASE | 2 | 82 | 66 | 8 | 8 | 0 | 14 | 13.57 | 21.21% | 1.03 | 54 | -2.16 | -4.00% |
| TURF | 1 | 8 | 8 | 0 | 0 | 0 | 1 | 1.34 | 12.50% | 0.75 | 7 | -7.00 | -100.00% |
| TURF | 2 | 8 | 8 | 0 | 0 | 0 | 1 | 0.99 | 12.50% | 1.01 | 7 | -4.12 | -58.86% |

The wider T1/T2 model cohorts contain 249/245 settled selections. Their complete-market priced subsets contain 206/204. Missing any runner's contemporaneous usable bookmaker price makes the entire book incomplete: even available individual quotes are not used for P/L or market edges. This explains why a model winner need not contribute a monetary return: Turf T1 has one winner in the wider cohort and none among its seven priced selections.

The difference in T1/T2 settled eligibility comes from 9 versus 14 NRs and 1 versus 0 voids; pending is 16 for each. Original ranks are retained after a withdrawal, without replacing a void T1 with T2 or reranking. Canonical non-finishers are settled losses. Existing settlement records supply P/L; no results are fetched or resettled. There are zero dead-heat books. A/E here is winner count divided by frozen expected probability mass, matching the page; scoring diagnostics would use fractional dead-heat credit if needed.


## 2. Same-race comparison

The broad paired sample requires both original selections to be settled starters. The priced paired sample additionally requires the same complete pre-off market book and finite persisted P/L for both selections. Monetary conclusions use the latter. Unmatched selections are never filled in or compared as if paired.

| Family | Model paired races | Model dates | T1 W / E | T2 W / E | T1 A/E | T2 A/E | Priced pairs | Price dates |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ALL | 237 | 10 | 54 / 59.16 | 52 / 42.12 | 0.91 | 1.23 | 196 | 9 |
| AW | 53 | 5 | 7 / 11.06 | 15 / 8.31 | 0.63 | 1.81 | 48 | 5 |
| HURDLE | 115 | 9 | 29 / 29.92 | 24 / 20.26 | 0.97 | 1.18 | 92 | 8 |
| CHASE | 61 | 9 | 17 / 16.84 | 12 / 12.56 | 1.01 | 0.96 | 49 | 8 |
| TURF | 8 | 1 | 1 / 1.34 | 1 / 0.99 | 0.75 | 1.01 | 7 | 1 |

| Family / rank | Priced n | Winners | Strike | Expected | A/E | Mean odds | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ALL T1 | 196 | 42 | 21.43% | 48.55 | 0.87 | 5.09 | -49.68 | -25.35% |
| ALL T2 | 196 | 45 | 22.96% | 35.04 | 1.28 | 7.59 | -2.86 | -1.46% |
| AW T1 | 48 | 7 | 14.58% | 9.92 | 0.71 | 5.45 | -11.65 | -24.27% |
| AW T2 | 48 | 14 | 29.17% | 7.59 | 1.85 | 7.44 | 11.24 | 23.42% |
| HURDLE T1 | 92 | 22 | 23.91% | 23.22 | 0.95 | 5.28 | -20.05 | -21.79% |
| HURDLE T2 | 92 | 19 | 20.65% | 16.12 | 1.18 | 8.78 | -5.12 | -5.57% |
| CHASE T1 | 49 | 13 | 26.53% | 14.42 | 0.90 | 3.72 | -10.98 | -22.41% |
| CHASE T2 | 49 | 11 | 22.45% | 10.50 | 1.05 | 5.26 | -4.86 | -9.92% |
| TURF T1 | 7 | 0 | 0.00% | 0.99 | 0.00 | 9.86 | -7.00 | -100.00% |
| TURF T2 | 7 | 1 | 14.29% | 0.83 | 1.20 | 9.41 | -4.12 | -58.86% |

| Family | Total T2−T1 £ | Difference £ / race | ROI difference pp | Date-clustered 95% interval (pp) | Race-bootstrap interval (pp) |
| --- | --- | --- | --- | --- | --- |
| ALL | 46.82 | 0.239 | 23.89 | -30.23% to 73.40% | -21.79% to 71.73% |
| AW | 22.89 | 0.477 | 47.69 | -88.09% to 216.40% | -49.81% to 146.56% |
| HURDLE | 14.93 | 0.162 | 16.23 | -75.79% to 89.60% | -55.14% to 94.00% |
| CHASE | 6.12 | 0.125 | 12.49 | -83.32% to 104.22% | -62.18% to 93.06% |
| TURF | 2.88 | 0.411 | 41.14 | not estimable | 0.00% to 123.43% |

ROI difference uses one £1 stake for each rank per race. It is not the ROI of staking £2 on Top2. The broad 237-race sample has 54 versus 52 winners (22.78% versus 21.94%); the priced sample reverses that ordering to 42 versus 45. Thus a blanket claim that T1 finds more winners while T2 finds value depends on the chosen population.

| Unmatched rank | Settled selections | Winners | Expected | Priced n | P/L £ |
| --- | --- | --- | --- | --- | --- |
| 1 | 12 | 2 | 3.68 | 10 | -2.79 |
| 2 | 8 | 2 | 1.65 | 8 | -0.30 |

There are 41 broad paired races without a usable complete captured market. Reconciliation: T1 237+12=249 and T2 237+8=245 settled; T1 196+10=206 and T2 196+8=204 priced. The unmatched monetary difference contributes £2.49 of the headline £49.31 gap; the remaining £46.82 is paired.


## 3. Family interpretation

**All-Weather:** T2's 15 winners exceed 8.31 expected, while T1's seven trail 11.06. On 48 priced races, T2 has 14 winners against 7.59 model-expected and 7.52 normalized-market-expected; T1 has seven against 9.92 and 10.11. T2's odds average 7.44 versus 5.45. Because T2 also wins more often despite lower market probabilities, longer offered odds alone do not explain this realised anomaly. However, only five dates support it, the return-gap interval spans zero widely, and absolute profitability is outlier-sensitive. This is the strongest question to monitor, not statistical proof.

**Hurdles:** On 115 paired settled races T1 wins 29 versus 29.92 expected and T2 24 versus 20.26. T1 still finds more winners. On 92 priced pairs the longer T2 average price (8.78 versus 5.28) supports a smaller loss despite fewer winners. Actual-minus-market winner residuals are nearly identical between ranks; the paired difference is only 0.67 percentage points. Rose Warrior at 19.0 alone is sufficient to reverse the family return comparison when its race is omitted. This is a price/outlier story with weak evidence of a distinct rank effect.

**Chases:** Broad pairing changes the original narrative: T1 A/E is 1.01 and T2 0.96, rather than the unmatched headlines 0.90 and 1.03. Both paired priced cohorts lose. The £6.12 relative T2 lead reverses without Getawhisky at 10.0. Eligibility imbalance matters appreciably; evidence for systematic T2 superiority is weak.

**Turf:** Eight model pairs and seven priced pairs, all on one date. One priced T2 winner accounts for the entire £2.88 relative advantage. Its removal leaves both ranks at −100% ROI. There is no usable independent-date estimate; the report deliberately does not present a degenerate single-date bootstrap interval as confidence.


## 4. Captured price and market-rank diagnostics

Descriptive price ranges reuse the project's existing 3, 5 and 11 decimal boundaries from `tissue-positive-neutral-method.ts`: (1,3), [3,5), [5,11), [11,∞). Their use here does not adopt that experiment's eligibility or alter frozen rules. Market-rank bands reuse `tissue-value-metrics.ts`: 1, 2, 3, 4–5, 6–10, 11+. Ties share competition rank. All tables in this section use the 196 priced pairs; family detail is in the evidence JSON.

Market probability q = (1 / captured decimal price) / Σ(1 / captured decimal price) across the original complete field. This removes the frozen book's overround. Raw reciprocal odds are also shown. Edge means frozen model p minus normalized q; no later price or starting price is substituted. Normalized q is a benchmark, not an executable price or a claim of market truth.

| Rank | Mean odds | Mean market rank | Mean p | Mean raw 1/odds | Mean q | Mean p−q pp | Actual W | Market E |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 5.09 | 2.49 | 24.77% | 29.39% | 23.47% | 1.30 | 42 | 46.00 |
| 2 | 7.59 | 3.11 | 17.88% | 23.87% | 19.11% | -1.23 | 45 | 37.46 |

| Rank | Decimal range | n | W | Mean p | Mean q | Edge pp | Mean market rank | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | (1,3) | 58 | 24 | 31.15% | 40.62% | -9.47 | 1.05 | -9.43 | -16.26% |
| 1 | [3,5) | 74 | 10 | 25.15% | 22.07% | 3.08 | 1.78 | -38.75 | -52.36% |
| 1 | [5,11) | 43 | 7 | 19.51% | 11.43% | 8.07 | 3.53 | 7.50 | 17.44% |
| 1 | [11,infinity) | 21 | 1 | 16.60% | 5.65% | 10.94 | 6.81 | -9.00 | -42.86% |
| 2 | (1,3) | 50 | 24 | 23.34% | 37.19% | -13.85 | 1.24 | 4.31 | 8.62% |
| 2 | [3,5) | 46 | 11 | 17.62% | 20.84% | -3.23 | 1.85 | -5.17 | -11.24% |
| 2 | [5,11) | 70 | 7 | 15.48% | 11.26% | 4.22 | 3.70 | -19.00 | -27.14% |
| 2 | [11,infinity) | 30 | 3 | 14.78% | 4.65% | 10.13 | 6.80 | 17.00 | 56.67% |

| Model rank | Market-rank band | n | W | Mean odds | Mean p | Mean q | Edge pp | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 80 | 25 | 2.56 | 28.38% | 35.29% | -6.91 | -26.81 | -33.51% |
| 1 | 2 | 52 | 8 | 3.93 | 25.40% | 21.16% | 4.23 | -24.25 | -46.63% |
| 1 | 3 | 24 | 5 | 5.85 | 23.22% | 14.97% | 8.25 | 3.88 | 16.17% |
| 1 | 4–5 | 23 | 3 | 8.98 | 19.81% | 9.51% | 10.30 | 2.50 | 10.87% |
| 1 | 6–10 | 15 | 1 | 13.07 | 14.97% | 6.14% | 8.83 | -3.00 | -20.00% |
| 1 | 11+ | 2 | 0 | 23.50 | 13.38% | 2.95% | 10.43 | -2.00 | -100.00% |
| 2 | 1 | 55 | 26 | 2.82 | 20.39% | 32.38% | -11.99 | 11.05 | 20.09% |
| 2 | 2 | 43 | 10 | 3.66 | 19.61% | 24.00% | -4.39 | -7.91 | -18.40% |
| 2 | 3 | 25 | 2 | 6.63 | 17.82% | 13.28% | 4.54 | -13.50 | -54.00% |
| 2 | 4–5 | 49 | 3 | 10.28 | 15.87% | 9.91% | 5.96 | -25.50 | -52.04% |
| 2 | 6–10 | 22 | 3 | 21.07 | 13.59% | 4.99% | 8.60 | 18.00 | 81.82% |
| 2 | 11+ | 2 | 1 | 21.50 | 8.55% | 2.93% | 5.62 | 15.00 | 750.00% |

The price-bin pattern is not uniform: T2 wins money below 3.0 and at 11.0+, but loses in both middle bands; T1 outperforms T2 in [5,11). The 11.0+ T2 profit depends on three winners. T2's short-price selections have a negative average model-minus-market edge despite their positive realised return. Thus neither longer prices nor a positive frozen model edge provides a complete explanation, and these retrospective bands should not become selection rules.

Exploratory direct standardization jointly by price band and market-rank band retains 390/392 selections in 14 cells containing both ranks. Each cell receives its pooled selection-count weight. Standardized T1/T2 ROI is -14.85% / 2.68%, a 17.53% difference (date-clustered interval -39.65% to 73.90%). The sign survives coarse adjustment, but sparse cells and residual within-bin/family differences prevent a claim of odds-independent superiority. Bootstrap resamples recompute overlap and weights; this is an exploratory stability summary, not a fixed-population causal estimate.

On the same races, T2's actual-minus-normalized-market winner residual exceeds T1's by 5.88%, with interval -6.66% to 15.09%. This also permits no advantage. T2's observed performance cannot be reduced simply to longer quoted odds, but neither market-rank conditioning nor market residuals establishes a repeatable advantage.


## 5. Outliers, withdrawals and sparse prices

Remove a winning selection's entire paired race from both ranks, preserving the paired estimand. These are analytical exclusions only. The largest pooled winning returns are also T2's two largest overall: Rose Warrior, 14 November, 19.0; Westin Pimpernel, 9 November, 17.0. With no dead heats, each family's longest-priced T2 winner is also its largest gross return; those scenarios coincide.

| Family | Scenario | Pairs | T1 P/L £ | T2 P/L £ | T2 ROI | Gap £ / race |
| --- | --- | --- | --- | --- | --- | --- |
| ALL | baseline | 196 | -49.68 | -2.86 | -1.46% | 0.239 |
| ALL | remove top 1 T2 winning-return races | 195 | -48.68 | -20.86 | -10.70% | 0.143 |
| ALL | remove top 2 T2 winning-return races | 194 | -47.68 | -36.86 | -19.00% | 0.056 |
| ALL | remove top 1 pooled winning-return races | 195 | -48.68 | -20.86 | -10.70% | 0.143 |
| ALL | remove top 2 pooled winning-return races | 194 | -47.68 | -36.86 | -19.00% | 0.056 |
| AW | baseline | 48 | -11.65 | 11.24 | 23.42% | 0.477 |
| AW | remove top 1 T2 winning-return races | 47 | -10.65 | 1.24 | 2.64% | 0.253 |
| AW | remove top 2 T2 winning-return races | 46 | -9.65 | -5.76 | -12.52% | 0.085 |
| AW | remove top 1 pooled winning-return races | 47 | -10.65 | 1.24 | 2.64% | 0.253 |
| AW | remove top 2 pooled winning-return races | 46 | -18.65 | 2.24 | 4.87% | 0.454 |
| HURDLE | baseline | 92 | -20.05 | -5.12 | -5.57% | 0.162 |
| HURDLE | remove top 1 T2 winning-return races | 91 | -19.05 | -23.12 | -25.41% | -0.045 |
| HURDLE | remove top 2 T2 winning-return races | 90 | -18.05 | -39.12 | -43.47% | -0.234 |
| HURDLE | remove top 1 pooled winning-return races | 91 | -19.05 | -23.12 | -25.41% | -0.045 |
| HURDLE | remove top 2 pooled winning-return races | 90 | -18.05 | -39.12 | -43.47% | -0.234 |
| CHASE | baseline | 49 | -10.98 | -4.86 | -9.92% | 0.125 |
| CHASE | remove top 1 T2 winning-return races | 48 | -9.98 | -13.86 | -28.88% | -0.081 |
| CHASE | remove top 2 T2 winning-return races | 47 | -8.98 | -19.86 | -42.26% | -0.231 |
| CHASE | remove top 1 pooled winning-return races | 48 | -9.98 | -13.86 | -28.88% | -0.081 |
| CHASE | remove top 2 pooled winning-return races | 47 | -8.98 | -19.86 | -42.26% | -0.231 |
| TURF | baseline | 7 | -7.00 | -4.12 | -58.86% | 0.411 |
| TURF | remove top 1 T2 winning-return races | 6 | -6.00 | -6.00 | -100.00% | 0.000 |
| TURF | remove top 2 T2 winning-return races | 6 | -6.00 | -6.00 | -100.00% | 0.000 |
| TURF | remove top 1 pooled winning-return races | 6 | -6.00 | -6.00 | -100.00% | 0.000 |
| TURF | remove top 2 pooled winning-return races | 6 | -6.00 | -6.00 | -100.00% | 0.000 |

Overall, removing the top two T2 winner races consumes £36 of the £46.82 paired gap (76.9%) while leaving a £10.82 relative lead. AW's own top two T2 winners are Xirivella at 11.0 and Leading Times at 8.0: excluding both leaves T2 at −£5.76, although still £3.89 ahead of T1. Relative superiority and absolute profitability are different conclusions.

| Family | Any recorded NR/void in field? | Pairs | T1 P/L £ | T2 P/L £ | T1 ROI | T2 ROI | Gap £ / race |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ALL | no | 150 | -19.70 | -32.57 | -13.13% | -21.71% | -0.086 |
| ALL | yes | 46 | -29.98 | 29.71 | -65.17% | 64.59% | 1.298 |
| AW | no | 37 | -0.65 | 12.64 | -1.76% | 34.16% | 0.359 |
| AW | yes | 11 | -11.00 | -1.40 | -100.00% | -12.73% | 0.873 |
| HURDLE | no | 64 | 0.31 | -36.23 | 0.48% | -56.61% | -0.571 |
| HURDLE | yes | 28 | -20.36 | 31.11 | -72.71% | 111.11% | 1.838 |
| CHASE | no | 43 | -13.36 | -5.86 | -31.07% | -13.63% | 0.174 |
| CHASE | yes | 6 | 2.38 | 1.00 | 39.67% | 16.67% | -0.230 |
| TURF | no | 6 | -6.00 | -3.12 | -100.00% | -52.00% | 0.480 |
| TURF | yes | 1 | -1.00 | -1.00 | -100.00% | -100.00% | 0.000 |

The main paired cohort already excludes NR/void T1/T2 selections. This extra split asks about withdrawals anywhere else in the field. On 150 races with no NR/void anywhere, T2 trails T1 by £12.87. The other 46 races contribute a £59.69 T2 lead. This is a descriptive post-outcome split, not a deployable pre-off filter or proof that withdrawals cause the gap. The ledgers do not establish the time of withdrawal or any bookmaker deduction. Frozen selection probabilities are not rescored after NRs, and original captured market books still include their mass.

The family differences matter: AW retains a positive T2 gap and positive T2 P/L in its 37 NR-free races, whereas Hurdle T2 trails by £36.54 in 64 NR-free races and leads by £51.47 in 28 withdrawal-containing races. The overall withdrawal sensitivity therefore does not erase the separate AW anomaly or establish one common explanation across families.

The generation settlement path passes captured odds and dead-heat divisor into `settleSelection`; it does not pass a withdrawal/Rule 4 adjustment. Stored P/L is therefore captured-price research accounting, not verified executable betting profit. The investigation preserves it exactly and does not estimate missing deductions. This limitation is particularly relevant to the withdrawal-associated return concentration.

| Price-quality sensitivity | Pairs | T1 P/L £ | T2 P/L £ | Gap £ / race |
| --- | --- | --- | --- | --- |
| all priced pairs | 196 | -49.68 | -2.86 | 0.239 |
| both selections >=2 quotes (exploratory) | 196 | -49.68 | -2.86 | 0.239 |
| every runner >=2 quotes (exploratory) | 196 | -49.68 | -2.86 | 0.239 |
| no NR/void anywhere in frozen race | 150 | -19.70 | -32.57 | -0.086 |

Exploratory quote-depth exclusions at two quotes remove no paired races: every runner in each paired complete book has at least two stored quotes. They therefore add no independent robustness evidence. Entire incomplete books remain excluded; their outcomes must not be used to invent market edges.


## 6. Calibration and probability scoring

Primary calibration preserves the original frozen probability, matching the page. A/E below/above one means fewer/more winners than the frozen expectation, rather than a demonstrated parameter error. Both rank outcomes are kept together when resampling dates. Binary Brier and Bernoulli log loss are proper selection-level scores (lower is better), but the two ranks have different outcome prevalence; comparing their scalar losses does not by itself identify a better race winner predictor. There is one shared multiclass probability model per family, not one per rank.

| Family / rank | Paired model n | Mean p | Win rate | Actual−expected pp | 95% interval for gap (pp) | A/E | 95% interval for A/E | Brier | Log loss |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ALL T1 | 237 | 24.96% | 22.78% | -2.18 | -6.22% to 3.54% | 0.91 | 0.751 to 1.132 | 0.1651 | 0.5162 |
| ALL T2 | 237 | 17.77% | 21.94% | 4.17 | -1.17% to 9.61% | 1.23 | 0.940 to 1.528 | 0.1661 | 0.5111 |
| AW T1 | 53 | 20.87% | 13.21% | -7.66 | -16.79% to 0.09% | 0.63 | 0.170 to 1.004 | 0.1266 | 0.4295 |
| AW T2 | 53 | 15.67% | 28.30% | 12.63 | -3.79% to 25.35% | 1.81 | 0.755 to 2.569 | 0.2059 | 0.6032 |
| HURDLE T1 | 115 | 26.02% | 25.22% | -0.80 | -10.52% to 10.24% | 0.97 | 0.593 to 1.388 | 0.1698 | 0.5255 |
| HURDLE T2 | 115 | 17.62% | 20.87% | 3.25 | -2.65% to 8.40% | 1.18 | 0.853 to 1.474 | 0.1610 | 0.5018 |
| CHASE T1 | 61 | 27.61% | 27.87% | 0.26 | -12.79% to 14.71% | 1.01 | 0.549 to 1.564 | 0.2018 | 0.6065 |
| CHASE T2 | 61 | 20.60% | 19.67% | -0.93 | -12.47% to 9.35% | 0.96 | 0.388 to 1.437 | 0.1504 | 0.4740 |
| TURF T1 | 8 | 16.71% | 12.50% | -4.21 | not estimable | 0.75 | not estimable | 0.0733 | 0.2690 |
| TURF T2 | 8 | 12.39% | 12.50% | 0.11 | not estimable | 1.01 | not estimable | 0.0949 | 0.3171 |

| Overall rank | Frozen-probability bin | n | Expected W | Actual W | Mean p | Win rate | A/E |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | [0,0.1) | 3 | 0.27 | 2 | 8.94% | 66.67% | 7.45 |
| 1 | [0.1,0.2) | 90 | 14.35 | 17 | 15.94% | 18.89% | 1.19 |
| 1 | [0.2,0.3) | 89 | 21.52 | 11 | 24.18% | 12.36% | 0.51 |
| 1 | [0.3,0.4) | 38 | 13.09 | 9 | 34.44% | 23.68% | 0.69 |
| 1 | [0.4,0.5) | 21 | 9.18 | 10 | 43.72% | 47.62% | 1.09 |
| 1 | [0.5,0.6) | 7 | 3.81 | 6 | 54.43% | 85.71% | 1.57 |
| 1 | [0.6,0.7) | 1 | 0.62 | 1 | 62.21% | 100.00% | 1.61 |
| 2 | [0,0.1) | 12 | 1.09 | 1 | 9.04% | 8.33% | 0.92 |
| 2 | [0.1,0.2) | 161 | 24.27 | 30 | 15.07% | 18.63% | 1.24 |
| 2 | [0.2,0.3) | 58 | 13.74 | 16 | 23.69% | 27.59% | 1.16 |
| 2 | [0.3,0.4) | 13 | 4.21 | 7 | 32.42% | 53.85% | 1.66 |
| 2 | [0.4,0.5) | 1 | 0.46 | 0 | 46.07% | 0.00% | 0.00 |

Bins are fixed deciles, not optimized calibration thresholds. This bin table uses each rank's wider settled population, so it does not share the paired-score denominator. Family bins are retained in the evidence JSON. Sparse bins and observed-family multiplicity make isolated departures weak evidence.

On all 237 paired settled races, T2−T1 Brier difference is 0.0010 (interval -0.054 to 0.047); log-loss difference is -0.0051 (-0.138 to 0.104). Both include zero. Paired A/E intervals include one overall for both ranks. AW T1's individual A/E upper endpoint is approximately one; five dates, exploratory family inspection and T2's wide interval preclude a strong family calibration claim.

An analytical sensitivity renormalizes the existing frozen probabilities over recorded settled starters, without changing stored books or original ranks. On 237 broad paired races, expected wins move from 59.16/42.12 to 61.14/43.54; actual remains 54/52. The directional under/overprediction pattern remains. Corresponding Brier is 0.1654/0.1656, log loss 0.5178/0.5099. This conditions on observed starters and does not reconstruct pre-off knowledge of withdrawals.

The data support monitoring a possible rank-specific calibration imbalance. They do not distinguish a durable model defect from a short cluster of AW outcomes, price-coverage selection and early sampling variation. No refit or recalibration was performed.


## 7. Time evolution and leave-one-date-out

The period always starts at the original activation; no start-date optimization. Daily counts below refer to priced pairs. Cumulative A/E, winners and P/L share that priced-pair cohort; the next table separately gives broad paired A/E. Zero priced pairs on a date do not imply that no model observations exist. All 15 November selections remain pending at this snapshot.

| Date | Day pairs | Day W1/W2 | Day gap £ | Cum pairs | Cum W1/W2 | Cum A/E1 | Cum A/E2 | Cum P/L1 £ | Cum P/L2 £ | Cum gap £ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-11-05 | 38 | 7/14 | 15.62 | 38 | 7/14 | 0.74 | 1.99 | -12.36 | 3.26 | 15.62 |
| 2026-11-06 | 31 | 7/5 | -13.10 | 69 | 14/19 | 0.83 | 1.52 | -14.87 | -12.35 | 2.52 |
| 2026-11-07 | 33 | 5/7 | 17.81 | 102 | 19/26 | 0.81 | 1.48 | -33.80 | -13.47 | 20.33 |
| 2026-11-08 | 17 | 8/1 | -29.61 | 119 | 27/27 | 0.96 | 1.30 | -19.90 | -29.18 | -9.28 |
| 2026-11-09 | 17 | 5/3 | 6.51 | 136 | 32/30 | 0.98 | 1.25 | -22.76 | -25.53 | -2.77 |
| 2026-11-10 | 14 | 3/2 | -5.05 | 150 | 35/32 | 0.97 | 1.21 | -27.26 | -35.08 | -7.82 |
| 2026-11-11 | 21 | 4/7 | 16.15 | 171 | 39/39 | 0.92 | 1.28 | -36.06 | -27.73 | 8.33 |
| 2026-11-12 | 0 | 0/0 | 0.00 | 171 | 39/39 | 0.92 | 1.28 | -36.06 | -27.73 | 8.33 |
| 2026-11-13 | 3 | 0/1 | 11.00 | 174 | 39/40 | 0.91 | 1.29 | -39.06 | -19.73 | 19.33 |
| 2026-11-14 | 22 | 3/5 | 27.49 | 196 | 42/45 | 0.87 | 1.28 | -49.68 | -2.86 | 46.82 |
| 2026-11-15 | 0 | 0/0 | 0.00 | 196 | 42/45 | 0.87 | 1.28 | -49.68 | -2.86 | 46.82 |

| Date | Cum broad paired races | Broad A/E1 | Broad A/E2 |
| --- | --- | --- | --- |
| 2026-11-05 | 39 | 0.73 | 1.95 |
| 2026-11-06 | 74 | 0.78 | 1.57 |
| 2026-11-07 | 114 | 0.80 | 1.43 |
| 2026-11-08 | 131 | 0.94 | 1.27 |
| 2026-11-09 | 150 | 0.97 | 1.21 |
| 2026-11-10 | 165 | 0.95 | 1.20 |
| 2026-11-11 | 187 | 0.92 | 1.25 |
| 2026-11-12 | 207 | 0.97 | 1.25 |
| 2026-11-13 | 210 | 0.95 | 1.26 |
| 2026-11-14 | 237 | 0.91 | 1.23 |
| 2026-11-15 | 237 | 0.91 | 1.23 |

T2 leads on six of nine priced dates and trails on three. It was behind cumulatively on 8–10 November. The 14 November gain of £27.49 is 58.7% of the final £46.82 gap. The lead is spread across multiple dates, but its size is concentrated; its positive result is not a smooth time trend.

| Omitted date | Remaining pairs | T1 P/L £ | T2 P/L £ | Gap £ / race |
| --- | --- | --- | --- | --- |
| 2026-11-05 | 158 | -37.32 | -6.12 | 0.197 |
| 2026-11-06 | 165 | -47.17 | 12.75 | 0.363 |
| 2026-11-07 | 163 | -30.75 | -1.74 | 0.178 |
| 2026-11-08 | 179 | -63.58 | 12.85 | 0.427 |
| 2026-11-09 | 179 | -46.82 | -6.51 | 0.225 |
| 2026-11-10 | 182 | -45.18 | 6.69 | 0.285 |
| 2026-11-11 | 175 | -40.88 | -10.21 | 0.175 |
| 2026-11-13 | 193 | -46.68 | -10.86 | 0.186 |
| 2026-11-14 | 174 | -39.06 | -19.73 | 0.111 |

The overall gap remains positive after leaving out any one priced date (£0.111–£0.427 per remaining race). This is a useful stability check, not independent replication or a significance test. AW also retains a positive relative gap after each date omission; Hurdle reverses when 14 November is omitted, and Chase reverses when 6 or 11 November is omitted. Turf has no second date to retain.

| Family | Omitted date | Remaining pairs | T1 P/L £ | T2 P/L £ | Gap £ / race |
| --- | --- | --- | --- | --- | --- |
| AW | 2026-11-05 | 30 | -4.40 | 3.35 | 0.258 |
| AW | 2026-11-06 | 34 | -20.25 | 25.24 | 1.338 |
| AW | 2026-11-07 | 42 | -8.65 | 1.49 | 0.241 |
| AW | 2026-11-11 | 41 | -4.65 | 11.64 | 0.397 |
| AW | 2026-11-13 | 45 | -8.65 | 3.24 | 0.264 |
| HURDLE | 2026-11-05 | 79 | -11.33 | -2.48 | 0.112 |
| HURDLE | 2026-11-06 | 81 | -14.94 | -2.38 | 0.155 |
| HURDLE | 2026-11-07 | 82 | -12.68 | 1.88 | 0.178 |
| HURDLE | 2026-11-08 | 78 | -33.70 | 7.59 | 0.529 |
| HURDLE | 2026-11-09 | 82 | -20.85 | -15.77 | 0.062 |
| HURDLE | 2026-11-10 | 82 | -10.05 | 0.43 | 0.128 |
| HURDLE | 2026-11-11 | 86 | -26.25 | -1.87 | 0.283 |
| HURDLE | 2026-11-14 | 74 | -10.55 | -23.24 | -0.171 |
| CHASE | 2026-11-05 | 42 | -14.59 | -2.87 | 0.279 |
| CHASE | 2026-11-06 | 43 | -4.98 | -5.99 | -0.023 |
| CHASE | 2026-11-07 | 39 | -9.42 | -5.11 | 0.111 |
| CHASE | 2026-11-08 | 46 | -11.23 | -1.86 | 0.204 |
| CHASE | 2026-11-09 | 42 | -7.32 | 2.14 | 0.225 |
| CHASE | 2026-11-10 | 45 | -16.48 | -0.86 | 0.347 |
| CHASE | 2026-11-11 | 41 | -2.98 | -15.86 | -0.314 |
| CHASE | 2026-11-14 | 45 | -9.86 | -3.61 | 0.139 |
| TURF | 2026-11-07 | 0 | 0.00 | 0.00 | — |


## 8. Relationship to Hurdle V3 research

These are separate research populations. Tissue Generation activation is 5 November. Original V3 Shadow was armed 8 November and Market Edge V1 on 10 November; the distinct Collection V2 experiments were armed 11 November. The V2 files retain their internal original schema version strings; the file paths and collection activation identify their separate populations. Nothing is pooled across them.

A genuine match requires race ID, capture timestamp and exact original production book (excluding settlement fields). Market Edge additionally requires its frozen shadow digest to match the same shadow observation. The digest is recomputed only for identity checking; source pins and records remain unchanged. Shadow outcomes are taken from that shadow's own production book, without importing newer generation outcomes into it.

| Population | Shadow armed | Shadow first capture | Shadow n / exact generation matches / fully settled | Edge armed | Edge first capture | Edge n / exact matches / settled / priced |
| --- | --- | --- | --- | --- | --- | --- |
| Original V1 | 2026-11-08T09:35:06.976Z | 2026-11-08T09:58:39.727Z | 49 / 49 / 48 | 2026-11-10T15:09:46.483Z | 2026-11-11T05:17:22.656Z | 10 / 10 / 10 / 9 |
| Collection V2 | 2026-11-11T16:39:41.798Z | 2026-11-12T08:55:14.067Z | 43 / 43 / 35 | 2026-11-11T16:39:41.798Z | 2026-11-12T08:55:14.067Z | 43 / 43 / 35 / 18 |

| Separate shadow population | V2 original rank | Settled starters | Winners | V3 T1 count | Winners among V3 T1 | Still V3 Top2 |
| --- | --- | --- | --- | --- | --- | --- |
| Original V1 | 1 | 46 | 17 | 29 | 14 | 36 |
| Original V1 | 2 | 45 | 8 | 14 | 3 | 28 |
| Collection V2 | 1 | 35 | 7 | 22 | 5 | 28 |
| Collection V2 | 2 | 35 | 8 | 7 | 3 | 19 |

Original V1 matched V2 T2 has 8 winners from 45 starters; Collection V2 has 8 from 35. V3 promotes 14 and 7 of those original T2 runners to its T1, yielding three winners in each separate population. This suggests monitoring rank disagreements, but neither population establishes that promotions improve value.

For the complete, settled, exactly matched Market Edge subsets, original V1 contains seven eligible V2 T2 starters and one winner; Collection V2 contains 18 and four. In Collection V2, the winning V2 T2 runners include Rose Warrior (V3 rank 2, frozen V3 edge +13.03pp), Fasol (V3 rank 1, +15.00pp), Beckistine (V3 rank 2, +7.42pp) and an odds-on/market-favourite winner with negative V3 edge. These are observations within existing classifications, not evidence to select a new cutoff. Westin Pimpernel predates Market Edge V1 and must not be backfilled into it.

Useful questions within the already frozen V3 groups are whether original V2 T2 winners are retained or promoted by V3, whether same-capture edge/market-rank and existing speed-depth groups behave consistently over later dates, and whether apparent gains persist without the named long-price wins. Do not redefine tags, pool V1/V2 collections or change any selection classifications.


## 9. Answers and research recommendation

1. **Is T2 genuinely outperforming on a paired basis?** Its realised return is higher by £46.82 on 196 priced pairs. Evidence is insufficient to call the advantage repeatable; clustered intervals include reversal and both overall ROIs are negative.

2. **Does the lead persist without the largest returns?** Overall, yes in relative terms after the largest two (£10.82 remains), but most of the gap disappears. AW remains relatively ahead after its own largest two while becoming unprofitable. Hurdle/Chase reverse without their largest winner.

3. **Is the strongest evidence confined to AW?** The strongest descriptive winner-versus-expectation anomaly is AW. Positive raw return gaps occur in every family, but those outside AW are especially fragile; none establishes a stable advantage, including AW.

4. **Is T1 better at winners but worse at value?** Only narrowly in the broad paired sample (54 versus 52), and more clearly in Hurdles/Chases. The priced sample has more T2 winners (45 versus 42), driven by AW. A universal distinction is unsupported.

5. **Are probabilities miscalibrated between ranks?** The aggregate direction suggests T1 overprediction/T2 underprediction. Short-date clustered intervals, family heterogeneity and withdrawal/price subsets prevent a firm systematic diagnosis.

6. **Enough independent prospective evidence for further research?** Yes to continued observation of a concrete anomaly; no to model changes, rank replacement, profitability claims or deployment. Hundreds of selections represent only ten settled racing dates, nine with paired prices and five for AW. Further selected slices of these same dates are not fresh validation.

7. **What next without changing the model?** Retain the existing epoch, captures, rankings and automated workflow. At routine future reviews, repeat the same paired/family summaries, cumulative calibration, quote coverage, withdrawal split and top-one/top-two/leave-date sensitivities over all accumulated dates. Track whether later independent dates reproduce AW's T2 win surplus; whether NR-free races show a consistent gap; and whether Hurdle/Chase gains cease to depend on isolated winners. Treat missing withdrawal timing/deductions as unavailable evidence, not a reason to invent adjusted returns. Observe V3 only through each experiment's already frozen definitions.


## Methods, reproducibility and safeguards

Uncertainty uses deterministic percentile bootstrap (12,000 replicates per statistic; LCG seed 20261115). Primary resampling draws racing dates with replacement and keeps all same-date races and both rank selections together. The ratio-of-totals statistic is recomputed in each draw; race counts may vary. A secondary bootstrap samples whole paired races. Both preserve within-race dependence; only the date method also allows shared day conditions. With five to ten date clusters, percentile coverage is approximate and heavy tails may be missed; the family/band exploration has no multiplicity adjustment. Single-date clustered intervals are unavailable. There is no significance-based threshold selection, model fitting or optimized start date.

Evidence: [machine-readable calculations](tissue-generation-rank1-vs-rank2-2026-11-15-evidence.json). The new diagnostic script is [diagnose-tissue-generation-rank1-vs-rank2.ts](../scripts/diagnose-tissue-generation-rank1-vs-rank2.ts). Run with Bun from the repo root; it reads the then-current ledgers, snapshots them in a new temporary directory, and writes only this diagnostic report and evidence file. A later run may have a different population. This report's exact temporary source copies are in `/var/folders/l7/nyzm7s3x5lngjr7yqbb4gryh0000gn/T/tissue-rank-diagnostic-tCAkq5` (0–5.json in the source order below); source hashes identify the research snapshot even after temporary files expire.

| Input source | SHA256 |
| --- | --- |
| data/research/tissue-generation-forward-2026-11.json | `8f1e1bab6790d7e039c30524bb32189d5c1fdebeff7318b14b1c690150ae41aa` |
| data/research/hurdle-v3-prospective-shadow-v1.json | `77f58bc6e86421e4349a5dc2ff5cc88ff83fabffe79da594877cc4af2349b53b` |
| data/research/hurdle-v3-market-edge-prospective-v1.json | `2cc981ff2dd6e27664f15d9a854a023b9d16b026e4583dd820b9a21d4d24a42e` |
| data/research/prospective-epochs-2026-11-11/hurdle-v3-shadow-v2.json | `5306a6de3c38b498800ae31bfddfac46a41ef0a0eb3c7b91209f7f72249e5b7d` |
| data/research/prospective-epochs-2026-11-11/hurdle-v3-market-edge-v2.json | `1c71a20350a28eb5cc253ffb3d814f4e343bd94238b84e8c97a50c67ecaf4a15` |
| data/research/tissue-generation-2026-11-manifest.json | `0b688caf76a575fb874a582d40a98016182d014c02f1a91b62c4a242a368e89a` |

All six inputs were byte-identical between initial read and end-of-analysis verification: **yes**. Other pre-existing working-tree changes were left in place. No database, schema, scraper, capture, collection, settlement, workflow lock, automation schedule, frozen observation, price, source pin, model, probability, coefficient, ranking, rule or threshold was modified. No commit or deployment was made.
