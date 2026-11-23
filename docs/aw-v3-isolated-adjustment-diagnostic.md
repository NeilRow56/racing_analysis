# All Weather V3 isolated adjustment diagnostic

**Recommendation: insufficient evidence for a production change.** Removing the missing-Speed bonus is the clearest candidate for a fresh, predeclared comparison. It replaces unmeasured Best L3 Speed with observed Speed in every T1 switch it makes, and the November wins and returns improved. Its probability results are mixed across periods, and the November paired intervals include no improvement. The signed same-OR Speed term is harder to justify as a direct racing rule. Removing it produces encouraging historical results but worsened T1 final-SP returns in November. Removing both won most often in the two local replays, with mixed calibration and no stable lead on returns.

The [race evidence](aw-v3-isolated-adjustment-evidence.json) identifies T1 and T2 for A–D in every evaluated field and lists every T1 change with the original and alternative runners, scores, inputs, terminal SP, market rank, result and exact removed-score differential. It includes all 295 books, including fields excluded from matched settlement.

## 1. Exact calculations

AW V3 keeps the 95-column frozen AW V2 base and adds the three terms below. The production base score is the sum of `w_j × (x_j − mean_j) / scale_j` on the saved vector. Each context term uses the same standardization. AW's historic columns named `*_turf_speed` actually contain AW Speed. The scorer uses the saved Best L3 Speed value only when its companion missing flag is zero. Finite observed figures are ranked high to low with competition ties.

| Term | Raw input | Frozen mean | Frozen scale | Frozen weight | Score change per raw unit |
|---|---|---:|---:|---:|---:|
| Speed rank 2–3 | 1 if Best L3 Speed competition rank is 2 or 3, else 0 | 0.1856594110 | 0.3888315755 | +0.0653672382 | +0.1681119597 |
| Missing Speed rank | 1 when no observed Best L3 Speed rank exists, else 0 | 0.3329065301 | 0.4712534056 | +0.1453665375 | +0.3084678769 |
| Same-OR Speed gap | (Own Speed − mean Speed of other runners with exactly the same observed OR and usable Speed) ÷ 10. Zero if no usable comparison exists. | ~0 | 0.5228380955 | −0.1741518866 | −0.3330895130 |

A missing runner's centred term is +0.205777. A runner with known Speed has −0.102691. The **between-runner advantage is +0.308468**. This term supplements the AW V2 base's missingness treatment. Missing Best L3 also makes the same-OR gap zero, and a missing runner cannot get the Speed-rank 2–3 bonus. The positive coefficient came from a joint regularized fit against race log loss, with frozen base logits as offsets. It was not a manual instruction that a horse with no Speed should be favoured. The original development process chose L2 = 0.2 and retained the whole context block after later-block loss fell from 2.200180 to 2.171600 on 24 races. The block was then refit on 79 development races. That selection exercise did not establish a benefit for this coefficient in isolation.

With an observed same-OR peer mean, a horse ten Speed points faster receives about −0.33309 score. A horse ten points slower receives about +0.33309. This is a signed contrast. A zero due to no matching evidence carries essentially no gap contribution. Two equal-OR horses can be moved apart by equal and opposite terms. As a statistical feature it could counter correlated information already in the base. The prior fit offers no independent evidence that the negative direction is warranted.

There is no product of the adjustment terms. The inputs have shared availability and the terms add to the same score, so their effects on rank and softmax probability can interact. The final score is base plus retained terms. On the original captured field, `p_i = exp(S_i − max(S)) / Σ exp(S_j − max(S))`. Rank is descending probability, with exact ties broken by ascending runner ID. The SP data enter only at evaluation.

| Variant | Speed rank 2–3 | Missing Speed rank | Same-OR Speed gap |
|---|---|---|---|
| A · Original AW V3 | Retain | Retain | Retain |
| B · Remove missing-Speed adjustment | Retain | Zero | Retain |
| C · Remove same-OR Speed-gap term | Retain | Retain | Zero |
| D · Remove both specified terms | Retain | Zero | Zero |

C and D zero the entire signed same-OR term, which removes its positive-gap penalty and negative-gap bonus together. D uses the original base plus the unchanged Speed-rank 2–3 term. This isolates exactly the two coefficients in scope. All four retain the base's existing Speed values, zero-fill, missing flags, OR, surface and other inputs. The earlier finding of 28 T1 changes compared all three context terms against base alone. It is a different comparison from A versus D here.

[Frozen AW V3 model](../data/research/tissue-generation-2026-11-aw.json) · [feature construction](../src/lib/racing/tissue-generation-features.ts#L14) · [live score and rank](../src/lib/racing/tissue-generation-model.ts#L40) · [weighted score and race softmax](../scripts/diagnose-independent-tissue-feasibility.ts) · [original context fit](../scripts/develop-tissue-generation.ts#L16) · [development manifest](../data/research/tissue-generation-2026-11-manifest.json) · [prior T1/T2 diagnostic](tissue-rank1-vs-rank2-diagnostic.md)

## 2. Populations and settlement

- **5–20 November 2026, current AW generation.** 123 unique frozen books and 1,410 runner vectors. All had terminal, fully priced final-SP fields. The comparison of T1 and T2 outcomes uses the same **120 races** for every variant and the SP favourite. Three books were excluded because one or more candidate picks were non-runners. The previous A-only T1/T2 comparison had 121 races, a different eligibility rule.
- **20 October–4 November 2026, earlier historical replay.** 172 unique archived AW V2 pre-off books and 1,925 original runner vectors. AW V2 is the exact AW V3 base. The three AW V3 context values were derived solely from those original pre-off vectors under the existing function. Earlier books contain no originally published AW V3 ranks. For matched results, 7 books lacked frozen settlements, 3 disagreed with the terminal starter/result records and 18 had at least one non-runner selected by a variant. **144 races** remained, 78 from the development race-ID set and 66 outside it. The latter is a sensitivity, since that period and its selection mechanism are known.
- **2025.** The prior attribution report published A, B and C summaries for reconstructed 2025 fields. Its row-level AW atlas inputs are unavailable in the workspace. There are no 2025 frozen AW V2 full vectors here. The source cache does not preserve the complete original surface and comment vectors. The 2025 results below are the saved aggregates. There is no new same-field D, SP A/E, ROI or winner sensitivity for that year.

All four variants rerank the entire original capture field for each book. In the matched table both ranks for every variant are original pre-off selections and verified terminal starters with valid final SP. No substitution takes place. Raw terminal prices are checked against the normalized database SP and used for canonical v3 £1 win settlement, including dead-heat stake division. Results are matched by race and runner IDs, with full-starter-field, finishing position, winner and divisor checks. Market expected winners sum the normalized reciprocals of decimal SP over all actual starters. The SP favourite is the shortest final price, with ties broken by ascending runner ID. Expected model wins use the original pre-off probabilities. For full-field log loss, Brier and ECE, probabilities are conditioned on actual starters, with dead-heat winner credit split. Brier is the sum of squared runner errors averaged per race. ECE uses ten fixed-width bins and weights by runner count. Lower values are better for all three probability metrics, but ECE can be unstable on short samples.

[Current frozen ledger](../data/research/tissue-generation-forward-2026-11.json) · [archived AW V2 ledger](../data/research/aw-tissue-forward-v2.json) · [terminal data checks](../src/lib/racing/hurdle-final-sp.ts#L27) · [canonical settlement](../src/lib/racing/backtest.ts#L506)

## 3. November results

| Variant | T1 / T2 identity changes, all 123 books | T1 / T2 identity changes, matched 120 | Matched T1 picks missing Best L3 Speed |
|---|---|---|---|
| A · Original | 0 / 0 | 0 / 0 | 44 |
| B · No missing-Speed term | 19 / 40 | 19 / 38 | 25 |
| C · No same-OR term | 13 / 23 | 12 / 22 | 43 |
| D · Neither term | 31 / 59 | 31 / 57 | 24 |

| Variant | Rank | Races / stakes | Wins | Δ wins vs A | Strike | Model expected | Model A/E | SP expected | Market A/E | £1 SP P/L | SP ROI |
|---|---|---|---|---|---|---|---|---|---|---|---|
| A | T1 | 120 | 21 | +0 | 17.5% | 25.27 | 0.83 | 25.72 | 0.82 | −£39.32 | −32.8% |
| A | T2 | 120 | 27 | +0 | 22.5% | 18.00 | 1.50 | 18.67 | 1.45 | +£2.16 | 1.8% |
| B | T1 | 120 | 25 | +4 | 20.8% | 25.91 | 0.96 | 26.90 | 0.93 | −£23.28 | −19.4% |
| B | T2 | 120 | 22 | −5 | 18.3% | 17.91 | 1.23 | 17.89 | 1.23 | −£6.13 | −5.1% |
| C | T1 | 120 | 22 | +1 | 18.3% | 24.90 | 0.88 | 27.15 | 0.81 | −£43.45 | −36.2% |
| C | T2 | 120 | 28 | +1 | 23.3% | 18.32 | 1.53 | 19.19 | 1.46 | +£13.54 | 11.3% |
| D | T1 | 120 | 26 | +5 | 21.7% | 25.51 | 1.02 | 28.42 | 0.91 | −£27.41 | −22.8% |
| D | T2 | 120 | 25 | −2 | 20.8% | 18.26 | 1.37 | 18.10 | 1.38 | +£21.24 | 17.7% |
| SP favourite | T1 | 120 | 37 | +16 | 30.8% | — | — | 37.10 | 1.00 | −£23.79 | −19.8% |

B added four T1 wins and moved T1 model A/E from 0.83 to 0.96 and market A/E from 0.82 to 0.93. It lost five T2 wins. C added one T1 win and lost £4.13 at T1 versus A. It improved T2 by £11.38. D added five T1 wins and lost two T2 wins. D had the highest T1 strike rate among the variants and B the best T1 ROI. The final-SP favourite won 37 races, eleven more than D. B's T1 ROI was 0.4 percentage points better than the favourite's, a much smaller difference than the uncertainty around its gain against A.

| Variant | Log loss | Brier | ECE | Log loss on all terminal fields | Brier on all terminal fields | ECE on all terminal fields |
|---|---|---|---|---|---|---|
| A · Original | 2.21133 | 0.86743 | 0.64% | 2.19861 | 0.86529 | 0.61% |
| B · No missing-Speed term | 2.20200 | 0.86480 | 0.61% | 2.18980 | 0.86320 | 0.63% |
| C · No same-OR term | 2.20363 | 0.86498 | 0.21% | 2.19011 | 0.86258 | 0.32% |
| D · Neither term | 2.19402 | 0.86205 | 0.89% | 2.18105 | 0.86018 | 0.94% |

The matched SP book scored **1.91236 log loss**, **0.79053 Brier** and **0.93% ECE**.

All three variants improved log loss and Brier on the matched November fields. D gave the largest point improvement. C gave the lowest ECE. B's ECE improved marginally on the matched 120 and worsened marginally on all 123 terminal fields. A score that assigns more probability to the winner can improve log loss even if the fixed-bin calibration statistic moves the other way.

Paired differences below are **variant minus A**. Descriptive 95% intervals use 10,000 resamples of whole racing dates. November contains ten racing dates. These comparisons were motivated by examining this period, so they are exploratory.

| Variant | Δ T1 strike (pp) [95% interval] | Δ T1 ROI (pp) [95% interval] | Δ log loss [95% interval] |
|---|---|---|---|
| B | +3.3 [−2.2, +8.7] | +13.4 [−8.0, +36.1] | −0.0093 [−0.0285, +0.0118] |
| C | +0.8 [−3.1, +3.9] | −3.4 [−27.4, +14.1] | −0.0077 [−0.0339, +0.0192] |
| D | +4.2 [−2.7, +10.9] | +9.9 [−20.7, +39.3] | −0.0173 [−0.0430, +0.0232] |

## 4. Which horses move to T1?

For B, all 19 November switches were from missing to known Best L3 Speed. The missingness bonus can therefore be identified as the reason the horse with less observed Speed evidence led in those fields. It does not imply that a horse with missing Speed was unsuitable. In the earlier matched cohort, all 18 B switches were also missing to known.

For C, the typical question is **Speed relative to the substitute's equal-OR peers**, rather than which of the two T1 contenders has the largest raw Speed figure. Among 12 November changed T1s, one went from missing to measured, six moved to a higher observed figure and five moved to a lower figure. Earlier, 17 of 21 changed T1s moved to higher observed Speed. Two switches moved from missing to measured and two moved to a lower figure. The common mechanism is relief from the signed contrast, with less consistent implications for the evidence quality of the new pick.

### November matched T1 changes by market response

| Variant | Changed T1 | Old / new winner hits | Old / new SP favourites | New shorter / equal / longer | New / old wins when new shorter | New / old wins when new longer |
|---|---|---|---|---|---|---|
| B | 19 | 2 / 6 | 4 / 6 | 9 / 0 / 10 | 4 / 0 | 2 / 2 |
| C | 12 | 2 / 3 | 1 / 6 | 10 / 0 / 2 | 3 / 2 | 0 / 0 |
| D | 31 | 4 / 9 | 5 / 12 | 20 / 0 / 11 | 7 / 2 | 2 / 2 |

### Earlier 2026 matched T1 changes by market response

| Variant | Changed T1 | Old / new winner hits | Old / new SP favourites | New shorter / equal / longer | New / old wins when new shorter | New / old wins when new longer |
|---|---|---|---|---|---|---|
| B | 18 | 4 / 5 | 4 / 8 | 8 / 1 / 9 | 3 / 1 | 2 / 2 |
| C | 21 | 2 / 8 | 3 / 7 | 14 / 0 / 7 | 7 / 1 | 1 / 1 |
| D | 38 | 6 / 14 | 7 / 16 | 23 / 1 / 14 | 11 / 2 | 3 / 3 |

In November all four extra B wins net of A came when the replacement was shorter. Nine of the 19 replacements were shorter, ten were longer. Longer replacements broke even on win count while adding £4.58 to P/L. C selected a shorter horse in ten of 12 changes. In earlier 2026, its shorter replacements accounted for five of six net extra winner hits and £25.35 of the £25.60 T1 return improvement. These tools often move toward runners the market already prefers. They still change some rankings against the market.

### Three frozen examples

- **Lingfield, 19 November, 12:53 UTC.** Grasshopper (5/1, SP rank 3) had no frozen Best L3 Speed or OR. Classic Bellini (11/8 favourite) had Speed 92.56 and OR 64. Under A, Grasshopper led 0.24078 to 0.23778. B removes Grasshopper's 0.30847 relative benefit and Classic Bellini becomes T1 at 0.34047. Classic Bellini won.
- **Lingfield, 19 November, 14:38 UTC.** Enchanted Queen and Queen's Reign both had OR 94, with Best L3 Speeds of 119.11 and 103.28. Their signed same-OR terms were −0.52735 and +0.52735. The original T1 was American Gal without a usable Best L3. B promoted Queen's Reign (80/1), while C promoted Enchanted Queen (5/2 favourite). Kon Tiki won. The arithmetic explains each switch. It also shows that making a ranking more intuitive need not recover the winner.
- **Newcastle, 6 November, 19:00 UTC.** Battenburg Belle (16/1) stayed first when either term was removed on its own. Get Up Everybody (8/1) had known Best L3 Speed of 113.77 and a −0.95313 same-OR term. In D its score recovered to 0.91113 and it passed Battenburg Belle. Kings Merchant won. This interaction is a rank threshold crossed by two additive changes.

The evidence includes **63 November** and **94 earlier-2026** variant-specific T1 switches, across 32 and 47 distinct races respectively. For every switch, the original-score deficit of the incoming horse is overcome by the difference in the term or terms removed. The change list records that arithmetic even when results are outside the matched outcome cohort.

## 5. Historical robustness

### Earlier 2026 on archived pre-off AW V2 inputs

| Variant | T1 / T2 changes, all 172 books | T1 / T2 changes, matched 144 |
|---|---|---|
| A · Original | 0 / 0 | 0 / 0 |
| B · No missing-Speed term | 23 / 54 | 18 / 45 |
| C · No same-OR term | 25 / 37 | 21 / 31 |
| D · Neither term | 46 / 76 | 38 / 65 |

| Variant | Rank | Races / stakes | Wins | Δ wins vs A | Strike | Model expected | Model A/E | SP expected | Market A/E | £1 SP P/L | SP ROI |
|---|---|---|---|---|---|---|---|---|---|---|---|
| A | T1 | 144 | 26 | +0 | 18.1% | 30.81 | 0.84 | 29.99 | 0.87 | −£55.78 | −38.7% |
| A | T2 | 144 | 28 | +0 | 19.4% | 22.22 | 1.26 | 23.51 | 1.19 | −£25.72 | −17.9% |
| B | T1 | 144 | 27 | +1 | 18.8% | 32.00 | 0.84 | 30.73 | 0.88 | −£46.28 | −32.1% |
| B | T2 | 144 | 26 | −2 | 18.1% | 22.31 | 1.17 | 22.85 | 1.14 | −£17.83 | −12.4% |
| C | T1 | 144 | 32 | +6 | 22.2% | 30.60 | 1.05 | 30.92 | 1.03 | −£30.17 | −21.0% |
| C | T2 | 144 | 30 | +2 | 20.8% | 22.13 | 1.36 | 24.66 | 1.22 | −£24.01 | −16.7% |
| D | T1 | 144 | 34 | +8 | 23.6% | 31.81 | 1.07 | 31.99 | 1.06 | −£17.92 | −12.4% |
| D | T2 | 144 | 25 | −3 | 17.4% | 22.21 | 1.13 | 23.06 | 1.08 | −£23.88 | −16.6% |
| SP favourite | T1 | 144 | 47 | +21 | 32.6% | — | — | 44.87 | 1.05 | −£20.54 | −14.3% |

| Variant | Log loss | Brier | ECE | Log loss on all terminal fields | Brier on all terminal fields | ECE on all terminal fields |
|---|---|---|---|---|---|---|
| A · Original | 2.15318 | 0.86497 | 0.74% | 2.14263 | 0.86189 | 0.85% |
| B · No missing-Speed term | 2.16015 | 0.86839 | 1.38% | 2.15282 | 0.86617 | 1.39% |
| C · No same-OR term | 2.14161 | 0.86095 | 0.93% | 2.12899 | 0.85749 | 1.14% |
| D · Neither term | 2.14854 | 0.86399 | 1.05% | 2.13915 | 0.86132 | 1.23% |

The matched SP book scored **1.78211 log loss**, **0.78102 Brier** and **1.87% ECE**.

C and D gained six and eight T1 winners respectively in the earlier replay. B gained one while scoring worse on race log loss, Brier and ECE. D's earlier T1 ROI narrowly exceeded the SP-favourite ROI. The market still won 47 races compared with D's 34. On the 66 matched dates-and-fields outside AW V3's development race-ID set, C and D each won 18 T1s versus A and B at 15. D's +3.6% ROI on that subgroup is sensitive to a few winners. Removing its top two leaves −24.4%, compared with A's −32.6% on the same reduced fields.

### Stability across subperiods

Each cell is **T1 wins / T1 ROI / full-field log loss**. The development overlap and outside-development subsets are parts of earlier 2026. The November halves are parts of the main match. Subsets are descriptive.

| Earlier or later subset | Races | A | B | C | D |
|---|---|---|---|---|---|
| Earlier · development race IDs | 78 | 11 / −51.2% / 2.1423 | 12 / −42.5% / 2.1559 | 14 / −38.2% / 2.1631 | 16 / −26.0% / 2.1769 |
| Earlier · outside development IDs | 66 | 15 / −24.0% / 2.1661 | 15 / −19.8% / 2.1652 | 18 / −0.6% / 2.1162 | 18 / 3.6% / 2.1151 |
| 5–12 November | 49 | 7 / −37.3% / 2.1983 | 8 / −26.5% / 2.1951 | 7 / −42.4% / 2.2191 | 8 / −31.6% / 2.2157 |
| 13–20 November | 71 | 14 / −29.6% / 2.2203 | 17 / −14.5% / 2.2068 | 15 / −31.9% / 2.1929 | 18 / −16.8% / 2.1790 |

### Largest-winner sensitivity

Remove the variant's largest one or two winning payouts **as whole races from both that variant and A**. Each cell shows the resulting **A / variant ROI**, using identical reduced fields. The evidence lists the excluded races and amounts. November's two largest T1 payouts are Amandari (10/1) and Thai Baht (9/1), shared across all variants.

| Population | Variant | T1 drop one | T1 drop two | T2 drop one | T2 drop two |
|---|---|---|---|---|---|
| November | A | −41.4% / −41.4% | −49.4% / −49.4% | −11.6% / −11.6% | −19.4% / −19.4% |
| November | B | −41.4% / −28.0% | −49.4% / −35.8% | −11.6% / −18.6% | −10.9% / −30.6% |
| November | C | −41.4% / −44.9% | −49.4% / −52.9% | −11.6% / −2.1% | −19.4% / −9.7% |
| November | D | −41.4% / −31.4% | −49.4% / −39.3% | −11.6% / 4.4% | −10.9% / −7.4% |
| Earlier 2026 | A | −43.2% / −43.2% | −47.4% / −47.4% | −26.4% / −26.4% | −32.9% / −32.9% |
| Earlier 2026 | B | −38.3% / −38.3% | −42.8% / −42.8% | −17.3% / −26.5% | −25.9% / −35.1% |
| Earlier 2026 | C | −38.3% / −29.5% | −42.8% / −33.9% | −24.3% / −23.1% | −30.1% / −28.9% |
| Earlier 2026 | D | −38.3% / −20.9% | −37.9% / −27.1% | −17.3% / −30.7% | −23.0% / −36.5% |

November B's T1 advantage remained after both largest wins were removed. C's T1 result remained worse than A's on the reduced fields. In earlier 2026, B's T1 advantage disappeared after removing its winner on a race that differs from A. The T1 gains in C and D remained in this sensitivity. The largest-winner comparison does not remove the risk of racing-date variation or retrospective selection.

### 2025 and wider 2026 published historical context

The prior attribution artifact already contains A, B and C evaluations of reconstructed atlas inputs. These are reported below as saved. The 2025 fields are from the AW V2 base training era. The 2026 sample was previously inspected and includes the run-up to AW V3. The atlas files are unavailable for row-level verification or recalculation here. In the prior study those rows carried no auditable complete market. SP metrics, largest-winner sensitivity and the prior D combination are unavailable. The published base-only row drops the Speed-rank 2–3 term and cannot substitute for D.

| Year | Races | Variant | T1 / T2 changed | T1 / T2 wins | Δ wins vs A | Log loss | Brier | ECE |
|---|---|---|---|---|---|---|---|---|
| 2025 | 3039 | A | 0 / 0 | 749 / 518 | +0 / +0 | 2.03628 | 0.84294 | 0.23% |
| 2025 | 3039 | B | 275 / 619 | 754 / 517 | +5 / −1 | 2.03417 | 0.84257 | 0.19% |
| 2025 | 3039 | C | 484 / 817 | 761 / 536 | +12 / +18 | 2.01976 | 0.83916 | 0.19% |
| 2026 | 2032 | A | 0 / 0 | 508 / 345 | +0 / +0 | 2.02257 | 0.84228 | 0.18% |
| 2026 | 2032 | B | 153 / 348 | 517 / 340 | +9 / −5 | 2.01928 | 0.84177 | 0.28% |
| 2026 | 2032 | C | 331 / 540 | 530 / 341 | +22 / −4 | 1.98630 | 0.83193 | 0.43% |

The previously saved 2025 and wider 2026 ranks and proper scores support investigating C. The 2026 atlas T1 count gained 22 and log loss fell 0.03627. In November C's T1 gain was one win, its ECE improved and its T1 ROI moved in the opposite direction. The missing-Speed removal showed small win gains in the prior atlas. Its full-field effects are less consistent across the two local 2026 periods.

[Earlier component tables](tissue-component-attribution-2026-11-12-details.md#aw--atlas-2025) · [saved metrics and rankings](tissue-component-attribution-2026-11-12-evidence.json)

## 6. Decision by adjustment

| Question | Missing-Speed rank (B) | Same-OR Speed gap (C) |
|---|---|---|
| Is the calculation logically justified? | Missingness may signal a different observable population, and the sign came from a joint fit. The fit does not independently justify an automatic +0.3085 relative reward for absent Speed. | Same-OR matching makes a local comparison possible. The negative sign rewards the slower relative figure. It could offset correlated base components, but the fit provides limited evidence for that direction. |
| Does it promote weaker evidence? | The bonus promoted a horse without a recorded Best L3 figure in all matched B switches. Whether the horse had weaker overall evidence depends on its other frozen inputs. | C often restored better observed Speed earlier in 2026. In November the raw Speed comparison was mixed, since the term uses each runner's own equal-OR group. |
| Does removal improve T1 prediction? | Four more November wins and one more earlier. Five and nine more in the previously saved 2025 and wider 2026 atlas. The November paired interval includes zero. | One more November win and six more earlier. The atlas showed 12 and 22 extra respectively. Much of the gain came when the replacement was shorter at SP. |
| Does it improve probabilities? | November log loss and Brier improved slightly. Earlier 2026 both worsened. ECE is mixed. | Log loss and Brier improved in both local periods. ECE improved in November but worsened earlier and in the wider 2026 atlas. |
| Does it improve performance relative to SP? | T1 market A/E and ROI improved in both local periods, and B approximately matched the November favourite on ROI with fewer wins. The earlier matched ROI gain did not survive its largest-win exclusion. | Earlier T1 market A/E and ROI improved, with £25.35 of the £25.60 gain in shorter replacements. November T1 ROI and market A/E worsened. |
| Is it simply following the market? | Nine of 19 November replacements were shorter and six became or shared the SP favourite. All net extra hits came in shorter picks. | Ten of 12 November replacements were shorter and six became or shared the favourite. The earlier win lift also concentrated in the market-preferred replacements. |

**Insufficient evidence.** A narrowly scoped follow-up of B on fresh fields is warranted by the repeatable evidence change and November T1 results. C merits separate scrutiny because the sign is difficult to interpret and the earlier proper-score gains did not translate into November T1 returns. D does not isolate which term caused its gain and had worse November ECE than A. The results do not support a production change selected from these comparisons.

## 7. Validation and safeguards

A reproduced all 1,410 current frozen AW V3 probabilities and ranks, with a maximum probability error of 1.11 × 10⁻¹⁶. Base-only scoring reproduced the stored AW V2 probabilities on all 1,925 earlier vectors to 2.78 × 10⁻¹⁷. The evaluation checked score masks, additive identity, softmax sums, original T1/T2 IDs and scores against the previous diagnostic, settled whole-field SP joins, and common denominators.

All 42 targeted tests and targeted ESLint passed. TypeScript passed including the local evaluator with the pre-existing ignored `backups/` directory excluded. The default configuration reports errors in those backup scripts. Model and source hashes were verified unchanged, and whitespace checks passed. The only delivered files are the report and its evidence. The database was accessed in a read-only transaction. No recalibration, coefficient fitting, model activation, settlement change, collection change, commit, push or deployment was made.
