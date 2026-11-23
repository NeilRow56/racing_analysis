# AW V3 — reversing the same-OR Speed adjustment

Reversing the sign **gained two T1 winners and lost five T2 winners** over the same 120 settled November races. T1 returned **−£35.70**, an improvement of £3.63, while T2 fell from **+£2.16 to −£20.59**. Across both ranks the reversal lost **£56.29**, compared with **−£37.16** for the original and **−£29.91** with the term removed. Removal also had the best log loss and Brier score in both complete matched periods. The reversal has a racing rationale worth testing, but these results give removal the stronger case for a fresh prospective comparison.

## Exact formula and isolation

On the original pre-off field, the scorer reads the finite, observed `best_l3_turf_speed` column, which carries **AW Best L3 Speed** in this inherited schema. It uses the runner's observed official rating (OR) to select **other** runners in the same book with exactly that OR and usable Best L3 Speed. Both observations must have a zero companion missing flag. The peer mean is arithmetic, excludes the runner itself and allows a single usable peer. A runner with no own usable Speed, no observed OR, or no eligible peer gets a raw gap of zero. Declared non-runners at capture have already been removed from the field. The terminal field plays no role in the peer calculation. [Generation input construction](../src/lib/racing/tissue-generation-features.ts) · [Capture wiring](../src/lib/racing/tissue-generation-sync.ts) · [AW V2 inputs](../src/lib/racing/aw-tissue-v2-features.ts)

```text
g = (own Best L3 Speed − mean Best L3 Speed of eligible equal-OR peers) / 10
mean = 1.2793863279931382e−18
scale = 0.5228380954857
weight = −0.17415188659050265
signed same-OR contribution = weight × ((g − mean) / scale)
```

The effective slope is **−0.3330895129757541 score units per raw gap unit**, with one unit equal to ten Speed points. Ten points faster than the peer mean subtracts about 0.333090 from the logit. Ten points slower adds the same amount. A zero raw gap contributes about +4.26 × 10⁻¹⁹ under the original weight because of the fitted centering. The feature, standardized value and runner score have no clipping. The final field probabilities use the production softmax, subtracting the maximum score for numerical stability. Rank is descending probability with exact ties broken by ascending runner ID. [Frozen AW V3 parameters](../data/research/tissue-generation-2026-11-aw.json) · [Production scorer](../src/lib/racing/tissue-generation-model.ts) · [Score and softmax implementation](../scripts/diagnose-independent-tissue-feasibility.ts)

| Term | A · Original | B · Term removed | C · Term reversed |
| --- | --- | --- | --- |
| 95-column AW V2 base, with all Speed terms | Frozen | Same | Same |
| Best L3 Speed rank 2–3 adjustment | Frozen | Same | Same |
| Missing Best L3 Speed rank adjustment | Frozen | Same | Same |
| Signed same-OR Speed contribution | As fitted | Zero | Multiply the original centred term by −1 |

The rank-2/3 adjustment adds **0.168112** relative to an otherwise equivalent nonqualifying runner. The missing-Speed-rank bonus adds **0.308468** relative to an observed rank. The replay preserves both, the original scaling parameters and the original gap values. On a runner with original same-OR contribution `t`, B shifts its score by `−t` and C shifts it by `−2t`. No coefficient was fitted. Variant B here corresponds to **variant C** in the previous isolated-adjustment diagnostic. [Previous isolated-adjustment report](aw-v3-isolated-adjustment-diagnostic.md)

## November · 123 original books, 120 matched races

The matched race IDs are exactly those in the prior diagnostic. All three November exclusions remain outside the matched table. They are Dundalk 6 November at 17:15 and Wolverhampton 16 November at 16:30 and 20 November at 20:30 UTC. Each prior exclusion involved at least one non-runner among the compared selections. The reversal introduces no additional non-runner picks on the 120 fixed races. All 123 books enter the rank-change audit and supplementary full-field quality rows. The same-OR gap is nonzero for **344 runners in 68** original books and for at least one runner in **66** of the matched races. [Frozen November ledger](../data/research/tissue-generation-forward-2026-11.json) · [Previous race-level evidence and cohort membership](aw-v3-isolated-adjustment-evidence.json)

Money uses the reconciled fractional final SP and canonical v3 £1 win settlement, including dead-heat treatment. There is no replacement for a later non-runner. Model-expected wins sum the variant's probabilities on the original pre-off field. Market expectations sum reciprocals of final SP normalized over the terminal starter field. Market A/E uses dead-heat-adjusted win credit. The favourite benchmark picks the shortest final SP, breaking ties by runner ID. Log loss and multiclass Brier use variant probabilities conditioned on the actual starters, with split outcome credit if there is a dead heat. The SP book supplies the parallel probability benchmark. [Terminal reconciliation](../src/lib/racing/hurdle-final-sp.ts) · [Canonical v3 settlement](settlement-v3.md)

The market-alignment table uses competition ranks for equal SPs. Full-field agreement measures the share of unequal-SP starter pairs ordered the same way by model and market, counting a model tie as half and averaging within race before averaging across races. In the price-band tables each cell gives **selections / winners / £1 P/L / ROI**. All bands use final SP as an evaluation label.

| Measure | Original | Term removed | Term reversed | SP favourite / SP book |
| --- | --- | --- | --- | --- |
| T1 / T2 identity changes, all scored books | 0 / 0 | 13 / 23 | 30 / 39 | — |
| T1 / T2 identity changes, matched races | 0 / 0 | 12 / 22 | 29 / 38 | — |
| Top-two membership changes, matched races | 0 | 24 | 40 | — |
| T1 · Winners / stakes | 21 / 120 | 22 / 120 | 23 / 120 | 37 / 120 |
| T1 · Strike rate | 17.5% | 18.3% | 19.2% | 30.8% |
| T1 · Winners gained / lost vs original | 0 gained / 0 lost | 3 gained / 2 lost | 7 gained / 5 lost | — |
| T1 · Final-SP P/L | −£39.32 | −£43.45 | −£35.70 | −£23.79 |
| T1 · Final-SP ROI | -32.8% | -36.2% | -29.7% | -19.8% |
| T1 · Model-expected wins | 25.27 | 24.90 | 26.00 | — |
| T1 · SP market-expected wins | 25.72 | 27.15 | 26.79 | 37.10 |
| T1 · SP market A/E | 0.82 | 0.81 | 0.86 | 1.00 |
| T2 · Winners / stakes | 27 / 120 | 28 / 120 | 22 / 120 | — |
| T2 · Strike rate | 22.5% | 23.3% | 18.3% | — |
| T2 · Winners gained / lost vs original | 0 gained / 0 lost | 4 gained / 3 lost | 1 gained / 6 lost | — |
| T2 · Final-SP P/L | +£2.16 | +£13.54 | −£20.59 | — |
| T2 · Final-SP ROI | 1.8% | 11.3% | -17.2% | — |
| T2 · Model-expected wins | 18.00 | 18.32 | 18.93 | — |
| T2 · SP market-expected wins | 18.67 | 19.19 | 19.58 | — |
| T2 · SP market A/E | 1.45 | 1.46 | 1.12 | — |
| Top-two winner hits / stakes | 48 / 240 | 50 / 240 | 45 / 240 | — |
| Top-two £1 SP P/L / ROI | −£37.16 / -15.5% | −£29.91 / -12.5% | −£56.29 / -23.5% | — |
| Matched log loss | 2.21133 | 2.20363 | 2.22477 | 1.91236 |
| Matched Brier | 0.86743 | 0.86498 | 0.87028 | 0.79053 |
| All complete terminal fields · log loss | 2.19861 | 2.19011 | 2.21086 | 1.89376 |
| All complete terminal fields · Brier | 0.86529 | 0.86258 | 0.86778 | 0.78400 |

| Market alignment | Original | Term removed | Term reversed |
| --- | --- | --- | --- |
| T1 · Mean SP market rank | 2.98 | 2.75 | 2.79 |
| T1 · SP favourite or joint favourite | 42 | 47 | 45 |
| T1 · Mean decimal SP | 7.11 | 6.31 | 6.34 |
| T1 · Replacement SP shorter / equal / longer | — | 10 / 0 / 2 | 15 / 1 / 13 |
| T2 · Mean SP market rank | 4.00 | 3.77 | 3.68 |
| T2 · SP favourite or joint favourite | 21 | 23 | 26 |
| T2 · Mean decimal SP | 10.21 | 9.09 | 9.21 |
| T2 · Replacement SP shorter / equal / longer | — | 13 / 1 / 8 | 20 / 0 / 18 |
| Full-field order agrees with SP | 70.1% | 71.8% | 71.4% |

| Rank | Final SP | Original | Term removed | Term reversed | Reversed minus original P/L |
| --- | --- | --- | --- | --- | --- |
| T1 | Under 8/1 | 91 / 19 / −£31.32 / -34.4% | 98 / 20 / −£42.45 / -43.3% | 97 / 21 / −£35.70 / -36.8% | −£4.38 |
| T1 | 8/1 to under 12/1 | 18 / 2 / +£3.00 / 16.7% | 12 / 2 / +£9.00 / 75.0% | 14 / 2 / +£9.00 / 64.3% | +£6.00 |
| T1 | 12/1 to under 20/1 | 6 / 0 / −£6.00 / -100.0% | 5 / 0 / −£5.00 / -100.0% | 4 / 0 / −£4.00 / -100.0% | +£2.00 |
| T1 | 20/1 and greater | 5 / 0 / −£5.00 / -100.0% | 5 / 0 / −£5.00 / -100.0% | 5 / 0 / −£5.00 / -100.0% | £0.00 |
| T2 | Under 8/1 | 73 / 25 / +£22.16 / 30.4% | 77 / 26 / +£29.54 / 38.4% | 76 / 20 / −£3.59 / -4.7% | −£25.75 |
| T2 | 8/1 to under 12/1 | 19 / 1 / −£9.00 / -47.4% | 19 / 1 / −£9.00 / -47.4% | 18 / 1 / −£8.00 / -44.4% | +£1.00 |
| T2 | 12/1 to under 20/1 | 17 / 1 / £0.00 / 0.0% | 16 / 1 / +£1.00 / 6.3% | 16 / 1 / +£1.00 / 6.3% | +£1.00 |
| T2 | 20/1 and greater | 11 / 0 / −£11.00 / -100.0% | 8 / 0 / −£8.00 / -100.0% | 10 / 0 / −£10.00 / -100.0% | +£1.00 |

| Variant | Rank | Short SP → 8/1+ | 8/1+ → short SP | Original 8/1+ out of top two | Original 8/1+ moved to other rank | New 8/1+ entrant into top two |
| --- | --- | --- | --- | --- | --- | --- |
| Term removed | T1 | 0 | 7 | 5 | 3 | 0 |
| Term removed | T2 | 4 | 8 | 12 | 1 | 6 |
| Term reversed | T1 | 4 | 10 | 11 | 4 | 7 |
| Term reversed | T2 | 9 | 12 | 19 | 2 | 14 |

| Variant | Rank | Replacement SP | Changes | Original / replacement winners | P/L change |
| --- | --- | --- | --- | --- | --- |
| Term removed | T1 | Shorter | 10 | 2 / 3 | −£4.13 |
| Term removed | T1 | Equal | 0 | 0 / 0 | £0.00 |
| Term removed | T1 | Longer | 2 | 0 / 0 | £0.00 |
| Term removed | T2 | Shorter | 13 | 0 / 4 | +£21.88 |
| Term removed | T2 | Equal | 1 | 0 / 0 | £0.00 |
| Term removed | T2 | Longer | 8 | 3 / 0 | −£10.50 |
| Term reversed | T1 | Shorter | 15 | 1 / 4 | +£3.88 |
| Term reversed | T1 | Equal | 1 | 0 / 1 | +£12.00 |
| Term reversed | T1 | Longer | 13 | 4 / 2 | −£12.25 |
| Term reversed | T2 | Shorter | 20 | 0 / 1 | +£2.63 |
| Term reversed | T2 | Equal | 0 | 0 / 0 | £0.00 |
| Term reversed | T2 | Longer | 18 | 6 / 0 | −£25.38 |

### What changed in November

- **Reversal tilted both ranks towards the market overall.** T1 mean SP rank moved from 2.98 to 2.79 and T2 from 4.00 to 3.68. Full-field agreement rose from 70.1% to 71.4%, while removal reached 71.8%. Reversal still replaced 18 original T2s with longer-priced runners, losing six winner hits in those switches, three of which moved up to T1. Closer agreement with SP ordering did not translate into better probability scores.
- **There were fewer 8/1+ picks.** Reversal cut T1 from 29 to 23 and T2 from 47 to 44, for **76 to 67** across both ranks. It pushed **19 original long-priced T2s out of the top two** and moved two more to T1. Fourteen new 8/1+ horses entered the top two at T2. Under removal, the total fell to 65.
- **The T1 return improved through the outsiders.** The under-8/1 T1 bucket gained two winners but lost a further **£4.38**. The 8/1+ T1 buckets gained **£8.00** in aggregate with the same two winners overall. Thai Baht (9/1) left both ranks while Law Of Average (11/1) entered at T1. Over both ranks the number of 8/1+ winners stayed at four. None won at 20/1 or longer in any variant.
- **T2 drove the aggregate deterioration.** On the fixed races the under-8/1 T2 bucket fell from 25 to 20 winners and lost **£25.75** more. The 8/1+ T2 buckets collectively improved by £3.00 with their two winners intact. The shorter/longer switch table compares the two prices within each race. A longer replacement can still sit under 8/1, and a shorter replacement can still be an outsider.

Reversal brought four race winners into the top two and dropped seven, net **−3**; removal brought four in and dropped two, net **+2**. Those are joint-rank membership changes. The T1 and T2 winner changes also include winners moving between the two ranks. On the 66 matched races with a nonzero gap, log loss was **2.35537 / 2.34137 / 2.37979** for original, removal and reversal, with Brier **0.89776 / 0.89332 / 0.90295**. The quality result therefore also holds on the subset where the variants can change rankings.

### Winning and losing examples

- **Wolverhampton, 16 November, 18:30.** Law Of Average (11/1, winner) and Rhythm N Hooves shared OR 89. Their Best L3 figures were 109.60 and 99.93. Law Of Average's original contribution was −0.322243, so the runner moved from **T7 at score 0.093252** to **T1 at 0.737739** under reversal. Removal alone left Fiorella Princess (11/1, lost) first. This was a gained winner at an unchanged price.
- **Southwell, 5 November, 17:00.** Thai Baht (9/1, winner) and Quiet Soul (12/1, lost) shared OR 62 with figures 95.70 and 105.34. Thai Baht dropped from 1.140075 to 0.498060 while Quiet Soul rose from 0.420427 to 1.062443. Reversal took Thai Baht out of the top two. Removal kept the winner T1.
- **Chelmsford City, 5 November, 16:15.** Hitched (33/1, lost) and The Hare Rail (2/1, lost) shared OR 71 with figures 88.94 and 115.61. Reversal made the original +0.888479 contribution negative for Hitched and the original −0.888479 contribution positive for The Hare Rail. The Hare Rail went from T6 to T1 and Hitched left the top two. Havana Touch won. The resulting market-friendly swap did not improve the result.
- **Southwell, 7 November, 15:13.** Crown The Future (13/2, winner) lost its original +0.227111 term under removal and stayed T2. Reversal deducted a further 0.227111 and brought its score to 0.349907. Solid Bond (40/1, lost) had no usable Best L3 Speed and a zero raw gap. Its score stayed 0.490195 and it became T2. The reversal can promote an outsider through a change to a rival even when the outsider's own input is unaffected.

## Earlier 2026 · exploratory AW V2 archive replay

The 172 books from **20 October to 4 November** contain the original 95-column pre-off AW V2 vectors. AW V2 is AW V3's frozen base. For these books A means the **AW V3 formula replayed** with the original sign. The three AW V3 context inputs were calculated from each original field's saved inputs. Seven books lacked frozen settlement, three failed terminal-result reconciliation, and 18 further books did not make the previous common sample because at least one compared pick was a non-runner. The same **144** from that prior sample are used here, with no extra reversal exclusions. All 172 enter the identity audit and 162 reconciled complete terminal fields enter the supplementary full-field quality rows. The 144 matched books include **78** used in adjustment development and **66** outside that race-ID set. [Archived AW V2 ledger](../data/research/aw-tissue-forward-v2.json) · [Development race manifest](../data/research/tissue-generation-development-2026-11.json)

| Measure | Original | Term removed | Term reversed | SP favourite / SP book |
| --- | --- | --- | --- | --- |
| T1 / T2 identity changes, all scored books | 0 / 0 | 25 / 37 | 41 / 56 | — |
| T1 / T2 identity changes, matched races | 0 / 0 | 21 / 31 | 35 / 48 | — |
| Top-two membership changes, matched races | 0 | 30 | 43 | — |
| T1 · Winners / stakes | 26 / 144 | 32 / 144 | 31 / 144 | 47 / 144 |
| T1 · Strike rate | 18.1% | 22.2% | 21.5% | 32.6% |
| T1 · Winners gained / lost vs original | 0 gained / 0 lost | 8 gained / 2 lost | 9 gained / 4 lost | — |
| T1 · Final-SP P/L | −£55.78 | −£30.17 | −£33.17 | −£20.54 |
| T1 · Final-SP ROI | -38.7% | -21.0% | -23.0% | -14.3% |
| T1 · Model-expected wins | 30.81 | 30.60 | 32.13 | — |
| T1 · SP market-expected wins | 29.99 | 30.92 | 31.10 | 44.87 |
| T1 · SP market A/E | 0.87 | 1.03 | 1.00 | 1.05 |
| T2 · Winners / stakes | 28 / 144 | 30 / 144 | 34 / 144 | — |
| T2 · Strike rate | 19.4% | 20.8% | 23.6% | — |
| T2 · Winners gained / lost vs original | 0 gained / 0 lost | 7 gained / 5 lost | 10 gained / 4 lost | — |
| T2 · Final-SP P/L | −£25.72 | −£24.01 | −£4.68 | — |
| T2 · Final-SP ROI | -17.9% | -16.7% | -3.2% | — |
| T2 · Model-expected wins | 22.22 | 22.13 | 22.38 | — |
| T2 · SP market-expected wins | 23.51 | 24.66 | 24.32 | — |
| T2 · SP market A/E | 1.19 | 1.22 | 1.40 | — |
| Top-two winner hits / stakes | 54 / 288 | 62 / 288 | 65 / 288 | — |
| Top-two £1 SP P/L / ROI | −£81.50 / -28.3% | −£54.19 / -18.8% | −£37.85 / -13.1% | — |
| Matched log loss | 2.15318 | 2.14161 | 2.15843 | 1.78211 |
| Matched Brier | 0.86497 | 0.86095 | 0.86517 | 0.78102 |
| All complete terminal fields · log loss | 2.14263 | 2.12899 | 2.14480 | 1.78551 |
| All complete terminal fields · Brier | 0.86189 | 0.85749 | 0.86203 | 0.78008 |

| Market alignment | Original | Term removed | Term reversed |
| --- | --- | --- | --- |
| T1 · Mean SP market rank | 3.03 | 2.95 | 3.00 |
| T1 · SP favourite or joint favourite | 44 | 48 | 48 |
| T1 · Mean decimal SP | 6.89 | 6.74 | 6.69 |
| T1 · Replacement SP shorter / equal / longer | — | 14 / 0 / 7 | 20 / 0 / 15 |
| T2 · Mean SP market rank | 3.68 | 3.26 | 3.10 |
| T2 · SP favourite or joint favourite | 34 | 35 | 33 |
| T2 · Mean decimal SP | 9.03 | 7.75 | 7.61 |
| T2 · Replacement SP shorter / equal / longer | — | 21 / 1 / 9 | 35 / 0 / 13 |
| Full-field order agrees with SP | 70.0% | 71.8% | 71.9% |

| Rank | Final SP | Original | Term removed | Term reversed | Reversed minus original P/L |
| --- | --- | --- | --- | --- | --- |
| T1 | Under 8/1 | 112 / 26 / −£23.78 / -21.2% | 114 / 31 / −£13.17 / -11.6% | 114 / 30 / −£16.17 / -14.2% | +£7.60 |
| T1 | 8/1 to under 12/1 | 15 / 0 / −£15.00 / -100.0% | 14 / 0 / −£14.00 / -100.0% | 13 / 0 / −£13.00 / -100.0% | +£2.00 |
| T1 | 12/1 to under 20/1 | 11 / 0 / −£11.00 / -100.0% | 10 / 1 / +£3.00 / 30.0% | 11 / 1 / +£2.00 / 18.2% | +£13.00 |
| T1 | 20/1 and greater | 6 / 0 / −£6.00 / -100.0% | 6 / 0 / −£6.00 / -100.0% | 6 / 0 / −£6.00 / -100.0% | £0.00 |
| T2 | Under 8/1 | 97 / 25 / −£10.72 / -11.1% | 106 / 28 / −£5.01 / -4.7% | 109 / 32 / +£11.32 / 10.4% | +£22.04 |
| T2 | 8/1 to under 12/1 | 19 / 2 / £0.00 / 0.0% | 18 / 2 / +£1.00 / 5.6% | 16 / 2 / +£3.00 / 18.8% | +£3.00 |
| T2 | 12/1 to under 20/1 | 17 / 1 / −£4.00 / -23.5% | 14 / 0 / −£14.00 / -100.0% | 13 / 0 / −£13.00 / -100.0% | −£9.00 |
| T2 | 20/1 and greater | 11 / 0 / −£11.00 / -100.0% | 6 / 0 / −£6.00 / -100.0% | 6 / 0 / −£6.00 / -100.0% | +£5.00 |

| Variant | Rank | Short SP → 8/1+ | 8/1+ → short SP | Original 8/1+ out of top two | Original 8/1+ moved to other rank | New 8/1+ entrant into top two |
| --- | --- | --- | --- | --- | --- | --- |
| Term removed | T1 | 2 | 4 | 6 | 2 | 4 |
| Term removed | T2 | 2 | 11 | 12 | 2 | 3 |
| Term reversed | T1 | 6 | 8 | 7 | 3 | 5 |
| Term reversed | T2 | 2 | 14 | 19 | 3 | 7 |

| Variant | Rank | Replacement SP | Changes | Original / replacement winners | P/L change |
| --- | --- | --- | --- | --- | --- |
| Term removed | T1 | Shorter | 14 | 1 / 7 | +£25.35 |
| Term removed | T1 | Equal | 0 | 0 / 0 | £0.00 |
| Term removed | T1 | Longer | 7 | 1 / 1 | +£0.25 |
| Term removed | T2 | Shorter | 21 | 2 / 6 | +£4.96 |
| Term removed | T2 | Equal | 1 | 0 / 0 | £0.00 |
| Term removed | T2 | Longer | 9 | 3 / 1 | −£3.25 |
| Term reversed | T1 | Shorter | 20 | 1 / 8 | +£29.85 |
| Term reversed | T1 | Equal | 0 | 0 / 0 | £0.00 |
| Term reversed | T1 | Longer | 15 | 3 / 1 | −£7.25 |
| Term reversed | T2 | Shorter | 35 | 2 / 9 | +£20.54 |
| Term reversed | T2 | Equal | 0 | 0 / 0 | £0.00 |
| Term reversed | T2 | Longer | 13 | 2 / 1 | +£0.50 |

Across the 144 matched races, reversal added five T1 and six T2 winners and improved combined P/L by **£43.64** versus the original sign. Removal added six T1 and two T2 winners and improved combined P/L by **£27.31**. Reversal's T2 return improvement came from the under-8/1 band, which gained **£22.04** while the three longer bands lost **£1.00** combined. T1 gained **£15.00** in the longer bands. At both ranks combined, reversal cut 8/1+ picks from **79 to 61**. The same three 8/1+ winners appeared in every variant.

At Wolverhampton on **23 October at 15:25**, Yehudi (12/1, winner) moved from T2 to T1 under either change. Yehudi's gap was zero. Palliser's original +0.519537 term, earned from a lower Best L3 Speed figure than equal-OR Asian Journey, had put Palliser ahead. Reversal also promoted Asian Journey (8/1, lost) to T2. This is an outsider winner moving between ranks as the comparative adjustment on other horses changes.

The original sign gave slightly better October probability scores than reversal even though reversal recovered more top-two winners and money. Removal led both scores. Outside the adjustment's development race-ID set, reversal had marginally better log loss than removal, while removal had the lower Brier. This split is small and was inspected retrospectively.

## Wider 2025 and early 2026 · audited historical forecast replay

The earlier [data and market audit](racing-2025-2026-data-market-trainer-audit.md) retained the **52 AW V2 numeric slots** used to fit the frozen model and saved the **AW V2 base probabilities** from its separate verified replay. The numeric row digest matches the frozen AW V2 model's pinned `source.rowsChecksum`. It supplies all inputs to the three AW V3 adjustments. The saved base probability already includes the historical comment vector's score contribution. For each runner, `log(base probability) = base score − race-wide log normalizer`. The normalizer is common within a field and cancels in the subsequent softmax. This gives an exact relative base score for the saved forecasts, with no need to reconstruct any missing raw comment or other model inputs. All base books summed to one within **4.45 × 10⁻¹⁶**, and every stored AW V2 T1 matched the base-forecast rank replay. [AW V2 frozen source pins](../data/research/aw-tissue-model-v2.json)

The retained historical books use the **actual starter roster**, unlike the prospective November and October books. Historical publication timestamps were never independently certified for the input cache. In each earlier race the saved numeric rows, base forecasts and complete audited terminal field matched exactly by race and runner IDs. Final outcomes, dead-heat credit and fractional SP reconciled to the prior terminal audit before recalculating canonical v3 returns. The 2025 cohort covers **3,028 races and 27,880 runners** from January through December. The early-2026 cohort covers **1,947 races and 17,370 runners** from 1 January through 21 September. These are the frozen base's training-era and historical holdout records respectively. They are separate from the prospective-ledger replays and from the previously published reconstructed Atlas cohort. The older Atlas runner file is unavailable, and its 3,039 2025 races answer a different question.

Audit inputs were read from the retained `/private/tmp/racing-audit.1mgsVE` directory. The numeric pre-fit row SHA-256 is `fea708306814f2b8f49c3b0bc0f9d5b8c525ed817607f6c492bb36ff78e5c419` and the saved forecast SHA-256 is `eca8637accb61569c4b0fb48bbb1fb95f38b28df76c8b83b3b306e2162412a40`. The terminal population comes from that audit's read-only Sporting Life result export.

### 2025 · AW V2 training era

| Measure | Original | Term removed | Term reversed | SP favourite / SP book |
| --- | --- | --- | --- | --- |
| T1 / T2 identity changes, all scored books | 0 / 0 | 483 / 814 | 813 / 1056 | — |
| T1 / T2 identity changes, matched races | 0 / 0 | 483 / 814 | 813 / 1056 | — |
| Top-two membership changes, matched races | 0 | 703 | 1079 | — |
| T1 · Winners / stakes | 743 / 3028 | 756 / 3028 | 734 / 3028 | 1078 / 3028 |
| T1 · Strike rate | 24.5% | 25.0% | 24.2% | 35.6% |
| T1 · Winners gained / lost vs original | 0 gained / 0 lost | 87 gained / 74 lost | 134 gained / 143 lost | — |
| T1 · Final-SP P/L | −£321.45 | −£275.88 | −£363.77 | −£170.06 |
| T1 · Final-SP ROI | -10.6% | -9.1% | -12.0% | -5.6% |
| T1 · Model-expected wins | 750.26 | 744.34 | 786.08 | — |
| T1 · SP market-expected wins | 672.89 | 693.22 | 685.25 | 966.45 |
| T1 · SP market A/E | 1.10 | 1.09 | 1.07 | 1.12 |
| T2 · Winners / stakes | 514 / 3028 | 531 / 3028 | 559 / 3028 | — |
| T2 · Strike rate | 17.0% | 17.5% | 18.5% | — |
| T2 · Winners gained / lost vs original | 0 gained / 0 lost | 127 gained / 110 lost | 187 gained / 142 lost | — |
| T2 · Final-SP P/L | −£642.32 | −£758.41 | −£495.23 | — |
| T2 · Final-SP ROI | -21.2% | -25.0% | -16.4% | — |
| T2 · Model-expected wins | 520.99 | 520.03 | 529.07 | — |
| T2 · SP market-expected wins | 513.48 | 532.91 | 531.13 | — |
| T2 · SP market A/E | 1.00 | 1.00 | 1.05 | — |
| Top-two winner hits / stakes | 1257 / 6056 | 1287 / 6056 | 1293 / 6056 | — |
| Top-two £1 SP P/L / ROI | −£963.76 / -15.9% | −£1034.28 / -17.1% | −£859.00 / -14.2% | — |
| Matched log loss | 2.03640 | 2.01990 | 2.03991 | 1.75912 |
| Matched Brier | 0.84478 | 0.84098 | 0.84699 | 0.76793 |
| All complete terminal fields · log loss | 2.03640 | 2.01990 | 2.03991 | 1.75912 |
| All complete terminal fields · Brier | 0.84478 | 0.84098 | 0.84699 | 0.76793 |

| Market alignment | Original | Term removed | Term reversed |
| --- | --- | --- | --- |
| T1 · Mean SP market rank | 2.80 | 2.60 | 2.65 |
| T1 · SP favourite or joint favourite | 1159 | 1214 | 1191 |
| T1 · Mean decimal SP | 6.81 | 6.04 | 6.17 |
| T1 · Replacement SP shorter / equal / longer | — | 299 / 11 / 173 | 447 / 21 / 345 |
| T2 · Mean SP market rank | 3.46 | 3.26 | 3.32 |
| T2 · SP favourite or joint favourite | 662 | 717 | 714 |
| T2 · Mean decimal SP | 9.46 | 8.53 | 8.73 |
| T2 · Replacement SP shorter / equal / longer | — | 470 / 16 / 328 | 564 / 30 / 462 |
| Full-field order agrees with SP | 70.7% | 72.5% | 72.2% |

| Rank | Final SP | Original | Term removed | Term reversed | Reversed minus original P/L |
| --- | --- | --- | --- | --- | --- |
| T1 | Under 8/1 | 2438 / 708 / −£169.45 / -7.0% | 2539 / 721 / −£219.38 / -8.6% | 2522 / 699 / −£274.77 / -10.9% | −£105.33 |
| T1 | 8/1 to under 12/1 | 250 / 24 / −£10.00 / -4.0% | 225 / 24 / +£15.50 / 6.9% | 237 / 25 / +£12.00 / 5.1% | +£22.00 |
| T1 | 12/1 to under 20/1 | 202 / 7 / −£97.00 / -48.0% | 184 / 8 / −£64.00 / -34.8% | 183 / 7 / −£84.00 / -45.9% | +£13.00 |
| T1 | 20/1 and greater | 138 / 4 / −£45.00 / -32.6% | 80 / 3 / −£8.00 / -10.0% | 86 / 3 / −£17.00 / -19.8% | +£28.00 |
| T2 | Under 8/1 | 2099 / 471 / −£320.82 / -15.3% | 2185 / 497 / −£353.91 / -16.2% | 2167 / 517 / −£243.23 / -11.2% | +£77.59 |
| T2 | 8/1 to under 12/1 | 384 / 25 / −£129.50 / -33.7% | 385 / 20 / −£178.50 / -46.4% | 381 / 25 / −£125.00 / -32.8% | +£4.50 |
| T2 | 12/1 to under 20/1 | 291 / 13 / −£88.00 / -30.2% | 258 / 10 / −£112.00 / -43.4% | 264 / 11 / −£103.00 / -39.0% | −£15.00 |
| T2 | 20/1 and greater | 254 / 5 / −£104.00 / -40.9% | 200 / 4 / −£114.00 / -57.0% | 216 / 6 / −£24.00 / -11.1% | +£80.00 |

| Variant | Rank | Short SP → 8/1+ | 8/1+ → short SP | Original 8/1+ out of top two | Original 8/1+ moved to other rank | New 8/1+ entrant into top two |
| --- | --- | --- | --- | --- | --- | --- |
| Term removed | T1 | 59 | 160 | 126 | 76 | 29 |
| Term removed | T2 | 158 | 244 | 255 | 72 | 165 |
| Term reversed | T1 | 127 | 211 | 198 | 82 | 135 |
| Term reversed | T2 | 218 | 286 | 342 | 61 | 253 |

| Variant | Rank | Replacement SP | Changes | Original / replacement winners | P/L change |
| --- | --- | --- | --- | --- | --- |
| Term removed | T1 | Shorter | 299 | 27 / 62 | +£11.62 |
| Term removed | T1 | Equal | 11 | 1 / 1 | +£0.67 |
| Term removed | T1 | Longer | 173 | 46 / 24 | +£33.28 |
| Term removed | T2 | Shorter | 470 | 40 / 102 | −£6.86 |
| Term removed | T2 | Equal | 16 | 1 / 3 | +£9.33 |
| Term removed | T2 | Longer | 328 | 69 / 22 | −£118.56 |
| Term reversed | T1 | Shorter | 447 | 49 / 99 | +£16.47 |
| Term reversed | T1 | Equal | 21 | 2 / 3 | +£12.67 |
| Term reversed | T1 | Longer | 345 | 92 / 32 | −£71.46 |
| Term reversed | T2 | Shorter | 564 | 49 / 138 | +£61.92 |
| Term reversed | T2 | Equal | 30 | 5 / 3 | −£8.83 |
| Term reversed | T2 | Longer | 462 | 88 / 46 | +£94.00 |

### Early 2026 · AW V2 historical holdout

| Measure | Original | Term removed | Term reversed | SP favourite / SP book |
| --- | --- | --- | --- | --- |
| T1 / T2 identity changes, all scored books | 0 / 0 | 320 / 520 | 543 / 696 | — |
| T1 / T2 identity changes, matched races | 0 / 0 | 320 / 520 | 543 / 696 | — |
| Top-two membership changes, matched races | 0 | 458 | 706 | — |
| T1 · Winners / stakes | 497 / 1947 | 516 / 1947 | 509 / 1947 | 686 / 1947 |
| T1 · Strike rate | 25.5% | 26.5% | 26.1% | 35.2% |
| T1 · Winners gained / lost vs original | 0 gained / 0 lost | 61 gained / 42 lost | 99 gained / 87 lost | — |
| T1 · Final-SP P/L | −£272.31 | −£265.16 | −£237.34 | −£180.60 |
| T1 · Final-SP ROI | -14.0% | -13.6% | -12.2% | -9.3% |
| T1 · Model-expected wins | 500.39 | 490.23 | 524.34 | — |
| T1 · SP market-expected wins | 452.74 | 472.29 | 467.68 | 636.67 |
| T1 · SP market A/E | 1.10 | 1.09 | 1.09 | 1.08 |
| T2 · Winners / stakes | 325 / 1947 | 318 / 1947 | 314 / 1947 | — |
| T2 · Strike rate | 16.7% | 16.3% | 16.1% | — |
| T2 · Winners gained / lost vs original | 0 gained / 0 lost | 67 gained / 74 lost | 96 gained / 107 lost | — |
| T2 · Final-SP P/L | −£392.16 | −£532.96 | −£541.46 | — |
| T2 · Final-SP ROI | -20.1% | -27.4% | -27.8% | — |
| T2 · Model-expected wins | 341.90 | 341.95 | 345.19 | — |
| T2 · SP market-expected wins | 338.81 | 346.35 | 343.91 | — |
| T2 · SP market A/E | 0.96 | 0.92 | 0.91 | — |
| Top-two winner hits / stakes | 822 / 3894 | 834 / 3894 | 823 / 3894 | — |
| Top-two £1 SP P/L / ROI | −£664.47 / -17.1% | −£798.11 / -20.5% | −£778.80 / -20.0% | — |
| Matched log loss | 2.01717 | 1.97863 | 1.99833 | 1.74701 |
| Matched Brier | 0.84206 | 0.83120 | 0.83815 | 0.76776 |
| All complete terminal fields · log loss | 2.01717 | 1.97863 | 1.99833 | 1.74701 |
| All complete terminal fields · Brier | 0.84206 | 0.83120 | 0.83815 | 0.76776 |

| Market alignment | Original | Term removed | Term reversed |
| --- | --- | --- | --- |
| T1 · Mean SP market rank | 2.67 | 2.46 | 2.46 |
| T1 · SP favourite or joint favourite | 791 | 849 | 832 |
| T1 · Mean decimal SP | 6.57 | 5.68 | 5.73 |
| T1 · Replacement SP shorter / equal / longer | — | 211 / 9 / 100 | 322 / 14 / 207 |
| T2 · Mean SP market rank | 3.39 | 3.19 | 3.24 |
| T2 · SP favourite or joint favourite | 441 | 464 | 450 |
| T2 · Mean decimal SP | 9.21 | 8.48 | 8.53 |
| T2 · Replacement SP shorter / equal / longer | — | 287 / 13 / 220 | 362 / 24 / 310 |
| Full-field order agrees with SP | 71.2% | 73.4% | 72.9% |

| Rank | Final SP | Original | Term removed | Term reversed | Reversed minus original P/L |
| --- | --- | --- | --- | --- | --- |
| T1 | Under 8/1 | 1605 / 483 / −£97.81 / -6.1% | 1668 / 505 / −£117.66 / -7.1% | 1670 / 498 / −£114.34 / -6.8% | −£16.53 |
| T1 | 8/1 to under 12/1 | 147 / 9 / −£58.50 / -39.8% | 129 / 6 / −£70.50 / -54.7% | 129 / 4 / −£86.00 / -66.7% | −£27.50 |
| T1 | 12/1 to under 20/1 | 111 / 4 / −£55.00 / -49.5% | 103 / 5 / −£30.00 / -29.1% | 94 / 6 / −£6.00 / -6.4% | +£49.00 |
| T1 | 20/1 and greater | 84 / 1 / −£61.00 / -72.6% | 47 / 0 / −£47.00 / -100.0% | 54 / 1 / −£31.00 / -57.4% | +£30.00 |
| T2 | Under 8/1 | 1379 / 290 / −£288.16 / -20.9% | 1437 / 291 / −£333.96 / -23.2% | 1417 / 284 / −£367.46 / -25.9% | −£79.30 |
| T2 | 8/1 to under 12/1 | 230 / 18 / −£44.00 / -19.1% | 233 / 18 / −£47.00 / -20.2% | 238 / 19 / −£48.00 / -20.2% | −£4.00 |
| T2 | 12/1 to under 20/1 | 185 / 15 / +£26.00 / 14.1% | 161 / 9 / −£36.00 / -22.4% | 173 / 10 / −£33.00 / -19.1% | −£59.00 |
| T2 | 20/1 and greater | 153 / 2 / −£86.00 / -56.2% | 116 / 0 / −£116.00 / -100.0% | 119 / 1 / −£93.00 / -78.2% | −£7.00 |

| Variant | Rank | Short SP → 8/1+ | 8/1+ → short SP | Original 8/1+ out of top two | Original 8/1+ moved to other rank | New 8/1+ entrant into top two |
| --- | --- | --- | --- | --- | --- | --- |
| Term removed | T1 | 37 | 100 | 79 | 47 | 25 |
| Term removed | T2 | 83 | 141 | 165 | 38 | 98 |
| Term reversed | T1 | 76 | 141 | 122 | 51 | 78 |
| Term reversed | T2 | 137 | 175 | 222 | 30 | 163 |

| Variant | Rank | Replacement SP | Changes | Original / replacement winners | P/L change |
| --- | --- | --- | --- | --- | --- |
| Term removed | T1 | Shorter | 211 | 22 / 51 | +£18.16 |
| Term removed | T1 | Equal | 9 | 1 / 0 | −£3.75 |
| Term removed | T1 | Longer | 100 | 19 / 10 | −£7.26 |
| Term removed | T2 | Shorter | 287 | 29 / 48 | −£101.47 |
| Term removed | T2 | Equal | 13 | 2 / 3 | +£5.00 |
| Term removed | T2 | Longer | 220 | 43 / 16 | −£44.33 |
| Term reversed | T1 | Shorter | 322 | 38 / 75 | +£35.36 |
| Term reversed | T1 | Equal | 14 | 3 / 1 | −£6.13 |
| Term reversed | T1 | Longer | 207 | 46 / 23 | +£5.74 |
| Term reversed | T2 | Shorter | 362 | 36 / 63 | −£82.87 |
| Term reversed | T2 | Equal | 24 | 3 / 6 | +£5.63 |
| Term reversed | T2 | Longer | 310 | 68 / 27 | −£72.06 |

Reversal's 2025 two-rank gain of **£104.76** came with a T1 deterioration and a T2 improvement. At T2, the two biggest favourable switches, Lion's House at **66/1** and Novak at **33/1**, accounted for **£101** of the **£147.08** uplift. Across both ranks, the under-8/1 bands lost £27.74 more, while the longer bands gained £132.50. In early 2026, reversal gained **£34.97** at T1 but lost **£149.30** at T2 versus the original. Across both ranks, the under-8/1 bands deteriorated by **£95.83**, and the longer bands by **£18.50**. Both earlier samples move closer to SP ranking under reversal, and both move closer still with the term removed.

## Consistency and prospective case

### Period splits and paired uncertainty

The splits below use the same 120 November and 144 October race IDs as the tables above. The paired intervals use 10,000 resamples of whole racing dates, preserving within-day dependence. They are descriptive. November has ten racing dates, October 14, 2025 259 and early 2026 178. The intervals compare variants on the same races and use the unrounded results. Negative log loss or Brier differences favour the challenger.

| Period | Variant | Matched races | T1 / T2 wins | T1 / T2 P/L | Log loss | Brier |
| --- | --- | --- | --- | --- | --- | --- |
| Nov 5–12 | Original | 49 | 7 / 13 | −£18.30 / +£12.60 | 2.19829 | 0.87154 |
| Nov 5–12 | Term removed | 49 | 7 / 12 | −£20.80 / +£13.60 | 2.21915 | 0.87688 |
| Nov 5–12 | Term reversed | 49 | 5 / 11 | −£30.80 / +£2.60 | 2.27333 | 0.88983 |
| Nov 13–20 | Original | 71 | 14 / 14 | −£21.02 / −£10.44 | 2.22033 | 0.86459 |
| Nov 13–20 | Term removed | 71 | 15 / 16 | −£22.65 / −£0.07 | 2.19293 | 0.85678 |
| Nov 13–20 | Term reversed | 71 | 18 / 11 | −£4.90 / −£23.19 | 2.19125 | 0.85679 |
| October · development overlap | Original | 78 | 11 / 17 | −£39.93 / −£24.05 | 2.14225 | 0.86750 |
| October · development overlap | Term removed | 78 | 14 / 19 | −£29.81 / −£15.97 | 2.16315 | 0.86988 |
| October · development overlap | Term reversed | 78 | 15 / 19 | −£27.06 / −£14.39 | 2.20623 | 0.87713 |
| October · outside development | Original | 66 | 15 / 11 | −£15.84 / −£1.67 | 2.16609 | 0.86198 |
| October · outside development | Term removed | 66 | 18 / 11 | −£0.37 / −£8.04 | 2.11616 | 0.85041 |
| October · outside development | Term reversed | 66 | 16 / 15 | −£6.12 / +£9.71 | 2.10194 | 0.85103 |

<details>
<summary>November · paired differences and 95% intervals</summary>

| Comparison | Scope | Measure | Delta | 2.5th pct | 97.5th pct |
| --- | --- | --- | --- | --- | --- |
| Term removed vs Original | T1 | strike (pp) | +0.83 | −3.09 | +4.00 |
| Term removed vs Original | T1 | ROI (pp) | −3.44 | −27.38 | +14.18 |
| Term removed vs Original | T2 | strike (pp) | +0.83 | −1.83 | +3.88 |
| Term removed vs Original | T2 | ROI (pp) | +9.48 | −0.34 | +26.51 |
| Term removed vs Original | Full field | logLoss | −0.00770 | −0.03321 | +0.01923 |
| Term removed vs Original | Full field | brier | −0.00244 | −0.00786 | +0.00323 |
| Term reversed vs Original | T1 | strike (pp) | +1.67 | −3.88 | +6.67 |
| Term reversed vs Original | T1 | ROI (pp) | +3.02 | −21.68 | +23.83 |
| Term reversed vs Original | T2 | strike (pp) | −4.17 | −8.13 | 0.00 |
| Term reversed vs Original | T2 | ROI (pp) | −18.96 | −38.08 | −0.12 |
| Term reversed vs Original | Full field | logLoss | +0.01343 | −0.03613 | +0.06984 |
| Term reversed vs Original | Full field | brier | +0.00285 | −0.00742 | +0.01446 |
| Term reversed vs Term removed | T1 | strike (pp) | +0.83 | −3.67 | +5.88 |
| Term reversed vs Term removed | T1 | ROI (pp) | +6.46 | −15.83 | +37.38 |
| Term reversed vs Term removed | T2 | strike (pp) | −5.00 | −8.80 | −1.34 |
| Term reversed vs Term removed | T2 | ROI (pp) | −28.44 | −48.93 | −10.95 |
| Term reversed vs Term removed | Full field | logLoss | +0.02113 | −0.00464 | +0.05109 |
| Term reversed vs Term removed | Full field | brier | +0.00530 | −0.00035 | +0.01152 |

</details>

<details>
<summary>October · paired differences and 95% intervals</summary>

| Comparison | Scope | Measure | Delta | 2.5th pct | 97.5th pct |
| --- | --- | --- | --- | --- | --- |
| Term removed vs Original | T1 | strike (pp) | +4.17 | +1.38 | +7.27 |
| Term removed vs Original | T1 | ROI (pp) | +17.78 | +2.87 | +35.24 |
| Term removed vs Original | T2 | strike (pp) | +1.39 | −1.90 | +4.65 |
| Term removed vs Original | T2 | ROI (pp) | +1.19 | −15.96 | +17.93 |
| Term removed vs Original | Full field | logLoss | −0.01157 | −0.03472 | +0.01425 |
| Term removed vs Original | Full field | brier | −0.00402 | −0.00780 | +0.00002 |
| Term reversed vs Original | T1 | strike (pp) | +3.47 | +0.72 | +7.03 |
| Term reversed vs Original | T1 | ROI (pp) | +15.70 | −0.24 | +34.05 |
| Term reversed vs Original | T2 | strike (pp) | +4.17 | +1.97 | +6.41 |
| Term reversed vs Original | T2 | ROI (pp) | +14.61 | +0.02 | +31.60 |
| Term reversed vs Original | Full field | logLoss | +0.00525 | −0.03753 | +0.05485 |
| Term reversed vs Original | Full field | brier | +0.00020 | −0.00672 | +0.00708 |
| Term reversed vs Term removed | T1 | strike (pp) | −0.69 | −3.57 | +2.34 |
| Term reversed vs Term removed | T1 | ROI (pp) | −2.08 | −13.49 | +10.21 |
| Term reversed vs Term removed | T2 | strike (pp) | +2.78 | −1.32 | +6.62 |
| Term reversed vs Term removed | T2 | ROI (pp) | +13.43 | −3.75 | +32.55 |
| Term reversed vs Term removed | Full field | logLoss | +0.01682 | −0.00433 | +0.04152 |
| Term reversed vs Term removed | Full field | brier | +0.00422 | −0.00031 | +0.01002 |

</details>

<details>
<summary>2025 · paired differences and 95% intervals</summary>

| Comparison | Scope | Measure | Delta | 2.5th pct | 97.5th pct |
| --- | --- | --- | --- | --- | --- |
| Term removed vs Original | T1 | strike (pp) | +0.43 | −0.43 | +1.28 |
| Term removed vs Original | T1 | ROI (pp) | +1.50 | −3.60 | +6.74 |
| Term removed vs Original | T2 | strike (pp) | +0.56 | −0.52 | +1.63 |
| Term removed vs Original | T2 | ROI (pp) | −3.83 | −11.59 | +3.37 |
| Term removed vs Original | Full field | logLoss | −0.01650 | −0.02311 | −0.00996 |
| Term removed vs Original | Full field | brier | −0.00380 | −0.00554 | −0.00207 |
| Term reversed vs Original | T1 | strike (pp) | −0.30 | −1.43 | +0.78 |
| Term reversed vs Original | T1 | ROI (pp) | −1.40 | −8.31 | +5.27 |
| Term reversed vs Original | T2 | strike (pp) | +1.49 | +0.29 | +2.69 |
| Term reversed vs Original | T2 | ROI (pp) | +4.86 | −5.24 | +15.46 |
| Term reversed vs Original | Full field | logLoss | +0.00350 | −0.00970 | +0.01653 |
| Term reversed vs Original | Full field | brier | +0.00221 | −0.00147 | +0.00579 |
| Term reversed vs Term removed | T1 | strike (pp) | −0.73 | −1.57 | +0.10 |
| Term reversed vs Term removed | T1 | ROI (pp) | −2.90 | −7.86 | +1.81 |
| Term reversed vs Term removed | T2 | strike (pp) | +0.92 | −0.13 | +1.99 |
| Term reversed vs Term removed | T2 | ROI (pp) | +8.69 | +1.10 | +17.33 |
| Term reversed vs Term removed | Full field | logLoss | +0.02001 | +0.01305 | +0.02693 |
| Term reversed vs Term removed | Full field | brier | +0.00601 | +0.00374 | +0.00823 |

</details>

<details>
<summary>Early 2026 · paired differences and 95% intervals</summary>

| Comparison | Scope | Measure | Delta | 2.5th pct | 97.5th pct |
| --- | --- | --- | --- | --- | --- |
| Term removed vs Original | T1 | strike (pp) | +0.98 | −0.10 | +2.09 |
| Term removed vs Original | T1 | ROI (pp) | +0.37 | −5.19 | +5.61 |
| Term removed vs Original | T2 | strike (pp) | −0.36 | −1.63 | +0.92 |
| Term removed vs Original | T2 | ROI (pp) | −7.23 | −16.68 | +1.42 |
| Term removed vs Original | Full field | logLoss | −0.03854 | −0.05283 | −0.02543 |
| Term removed vs Original | Full field | brier | −0.01086 | −0.01548 | −0.00669 |
| Term reversed vs Original | T1 | strike (pp) | +0.62 | −0.84 | +2.12 |
| Term reversed vs Original | T1 | ROI (pp) | +1.80 | −6.43 | +9.75 |
| Term reversed vs Original | T2 | strike (pp) | −0.56 | −1.98 | +0.84 |
| Term reversed vs Original | T2 | ROI (pp) | −7.67 | −17.85 | +1.57 |
| Term reversed vs Original | Full field | logLoss | −0.01884 | −0.03918 | +0.00106 |
| Term reversed vs Original | Full field | brier | −0.00391 | −0.01009 | +0.00208 |
| Term reversed vs Term removed | T1 | strike (pp) | −0.36 | −1.42 | +0.74 |
| Term reversed vs Term removed | T1 | ROI (pp) | +1.43 | −4.37 | +7.53 |
| Term reversed vs Term removed | T2 | strike (pp) | −0.21 | −1.43 | +0.96 |
| Term reversed vs Term removed | T2 | ROI (pp) | −0.44 | −7.46 | +6.42 |
| Term reversed vs Term removed | Full field | logLoss | +0.01970 | +0.00805 | +0.03211 |
| Term reversed vs Term removed | Full field | brier | +0.00695 | +0.00265 | +0.01156 |

</details>

**The proposed direction has a racing rationale.** With equal official ratings, a stronger observed Speed figure can contain information about underlying ability. But the base already uses latest, Best L3 and average Speed and derived weight-adjusted ratings. A full sign change adds the same relative signal again and doubles the logit change relative to removing the term. The opposite-signed contribution on two equal-OR peers can create a large change in their relative scores even where the peer group is just two runners. In the Chelmsford example, an approximately 26.67-point Speed gap shifted the two peers' relative score by about 3.55 logit units from original to reversed.

**The statistical case favours removing the term as the first fresh shadow comparator.** Removal had the lowest full-field log loss and Brier in November, October, 2025 and early 2026. Reversal improved both scores against the original only in early 2026, and it was behind removal there. Combined SP returns favoured reversal against the original in 2025 and October, and favoured the original in early 2026 and November. The November switch slightly improved T1 and materially weakened T2, while October improved both. The 2025 base-training exposure, October adjustment-development overlap and price concentration limit inference from the profitable differences.

A prospective comparison is warranted for the isolated removal, with reversal included as a secondary fixed challenger if the direction itself is the research question. Use fresh books, preserve both other adjustments, and decide the comparison horizon and primary log-loss and Brier endpoints in advance. Compare T1, T2 and outsider membership and final-SP returns on the same races. These results do not justify changing the production sign.

### Verification

The checksum-validated scorer reproduced the **1,410** November runner probabilities with a maximum absolute error of **1.11 × 10⁻¹⁶** and retained every original rank. The **1,925** archived October AW V2 runner probabilities reproduced within **2.78 × 10⁻¹⁷** before applying AW V3 context. Original and removal picks, probabilities, scores and settlements were cross-checked against the previous diagnostic for all 295 books. The rerun also verified for each runner that the removed score is the midpoint of the original and reversed scores. Saved historical forecasts and result evidence were processed independently of the flags determining the sign variants. Source and evidence hashes were checked before and after the replay. The four targeted scoring and settlement test files passed all 39 tests.

## Race-by-race changes

Each cell lists **T1 / T2** in that order. A dash is an unchanged position in a variant column or missing settlement beside a horse's name. **W** marks a verified winner. All times are UTC. A blank matched flag means the book contributed to identity counts only. Historical replay ranks are shadow calculations on their own audited books.

<details>
<summary>November · all changed original pre-off books</summary>

| Date / course / scheduled UTC | Matched | Original T1 / T2 | Removed T1 / T2 | Reversed T1 / T2 |
| --- | --- | --- | --- | --- |
| 2026-11-05 Southwell 15:28 | Yes | Dovey Moon (9/4) / Ey Up He's A Star (8/1) | — / Benacre (7/1) **W** | Benacre (7/1) **W** / Dovey Moon (9/4) |
| 2026-11-05 Chelmsford City 16:15 | Yes | Nakaaha (10/1) / Hitched (33/1) | — / The Hare Rail (2/1) | The Hare Rail (2/1) / Nakaaha (10/1) |
| 2026-11-05 Southwell 16:30 | Yes | Forbidden Colours (11/1) / Lady Mariko (7/2) **W** | Lady Mariko (7/2) **W** / Forbidden Colours (11/1) | Ribenska (11/4) / — |
| 2026-11-05 Southwell 17:00 | Yes | Thai Baht (9/1) **W** / Dream On Kent (9/1) | — / Quiet Soul (12/1) | Quiet Soul (12/1) / — |
| 2026-11-05 Chelmsford City 17:15 | Yes | Kigali (9/1) / National Pride (6/4) **W** | — / Roosike (4/1) | — / Roosike (4/1) |
| 2026-11-05 Southwell 18:00 | Yes | Modern Times (11/4) / Jellystone Park (9/1) | — / — | Jellystone Park (9/1) / Modern Times (11/4) |
| 2026-11-06 Newcastle 14:53 | Yes | Sovereign View (14/1) / Twisting Physics (13/2) | — / — | Twisting Physics (13/2) / Bearish (9/1) |
| 2026-11-06 Newcastle 16:00 | Yes | Printing Money (3/1) / Admiral Leach (13/2) | — / Texting (4/1) | Texting (4/1) / Printing Money (3/1) |
| 2026-11-06 Newcastle 18:00 | Yes | Oxford Circus (5/2) **W** / Cloch Nua (11/1) | — / Yaaser (11/1) | Yaaser (11/1) / Barleybrown (7/1) |
| 2026-11-06 Newcastle 18:30 | Yes | Wise Crack (6/1) **W** / Educating Rita (10/3) | Educating Rita (10/3) / Blazing Son (10/1) | Tactical Blitz (11/1) / Blazing Son (10/1) |
| 2026-11-06 Newcastle 19:00 | Yes | Battenburg Belle (16/1) / Lord Abama (12/1) | — / Get Up Everybody (8/1) | Get Up Everybody (8/1) / Battenburg Belle (16/1) |
| 2026-11-07 Southwell 14:05 | Yes | Burford Beauty (7/2) / Union Island (16/1) | — / — | Titainium (11/4) / Asian Journey (4/1) |
| 2026-11-07 Southwell 15:13 | Yes | Ridger (6/5) / Crown The Future (13/2) **W** | — / — | — / Solid Bond (40/1) |
| 2026-11-07 Southwell 16:25 | Yes | Masai Angel (4/1) / Up The Anti (18/1) | — / — | — / Auntie Jo (25/1) |
| 2026-11-07 Southwell 18:00 | Yes | Clipsham Noble (2/1) / Masego (5/2) | — / — | — / Prince Achille (11/1) |
| 2026-11-07 Southwell 18:30 | Yes | Junkyard Dog (5/1) / Jack Langley (15/2) | — / — | — / Fram Castle (85/40) |
| 2026-11-16 Wolverhampton 16:30 | — | Roosike (NR) / Go Go Girl (4/1) | Go Go Girl (4/1) / Roosike (NR) | Lord Ragnar (5/2) **W** / — |
| 2026-11-16 Wolverhampton 18:30 | Yes | Fiorella Princess (11/1) / Rhythm N Hooves (4/1) | — / Rosenpur (18/1) | Law Of Average (11/1) **W** / Rosenpur (18/1) |
| 2026-11-16 Wolverhampton 19:00 | Yes | Receipt (66/1) / Mumayaz (25/1) | Valentine Boy (4/1) / — | Valentine Boy (4/1) / Newsreader (5/2) |
| 2026-11-16 Wolverhampton 19:30 | Yes | R P Mcmurphy (9/2) / Jojo's Legacy (8/1) | Criminal Shore (7/1) / R P Mcmurphy (9/2) | Criminal Shore (7/1) / Danehill Star (9/1) |
| 2026-11-16 Wolverhampton 20:00 | Yes | Ted Le Saux (11/8) / Oman (16/1) | — / Camino Del Ray (22/1) | Camino Del Ray (22/1) / Ted Le Saux (11/8) |
| 2026-11-16 Wolverhampton 20:30 | Yes | It's A Love Thing (7/1) **W** / Heart Sign (11/1) | Saxophonic (11/10) / It's A Love Thing (7/1) **W** | Saxophonic (11/10) / Man Of Desert (12/1) |
| 2026-11-17 Southwell 16:30 | Yes | Jax Edge (11/1) / Binadham (18/1) | Managing Director (3/1) / — | Managing Director (3/1) / Beaumadier (14/1) |
| 2026-11-17 Southwell 17:30 | Yes | Almekarem (5/2) / Gloryous (15/2) | — / — | Fahidi (11/4) / Almekarem (5/2) |
| 2026-11-17 Southwell 18:30 | Yes | Moving Shadow (5/2) / Silent City (11/1) | — / — | — / Anthropologist (11/2) |
| 2026-11-17 Southwell 19:30 | Yes | Edmond Halley (3/1) / Oh So Perfect (9/2) | — / Strong Voice (5/1) | — / Strong Voice (5/1) |
| 2026-11-18 Dundalk 14:30 | Yes | Pocket Jacks (2/1) / Chester Nimitz (9/2) | — / — | — / The Bear Trap (5/1) |
| 2026-11-18 Dundalk 16:30 | Yes | Go Out (9/4) / Tourin (25/1) | — / Phoenix Pairc (6/1) | — / Phoenix Pairc (6/1) |
| 2026-11-18 Kempton 17:30 | Yes | Lady Blanche (5/1) / Paper View (7/1) | — / Divine Whisper (9/4) | — / Divine Whisper (9/4) |
| 2026-11-18 Dundalk 17:40 | Yes | Medieval Night (7/1) / Legato (33/1) | — / — | — / Captain Ciano (14/1) |
| 2026-11-18 Kempton 18:00 | Yes | You're Sensational (8/1) / Divine Rhythm (6/4) **W** | — / — | Divine Rhythm (6/4) **W** / You're Sensational (8/1) |
| 2026-11-18 Kempton 19:00 | Yes | Palladas (13/8) / Princling (15/8) **W** | — / — | Princling (15/8) **W** / Chantilly Lace (22/1) |
| 2026-11-19 Lingfield 14:38 | Yes | American Gal (11/1) / Queen's Reign (80/1) | Enchanted Queen (5/2) / American Gal (11/1) | Enchanted Queen (5/2) / American Gal (11/1) |
| 2026-11-19 Lingfield 15:08 | Yes | Cooramook (17/2) / Orange Emperor (9/2) | Orange Emperor (9/2) / Credit Forgedd It (2/1) **W** | Credit Forgedd It (2/1) **W** / — |
| 2026-11-19 Newcastle 18:10 | Yes | Luminare (9/1) / Frankies Dream (5/2) **W** | Frankies Dream (5/2) **W** / Luminare (9/1) | Frankies Dream (5/2) **W** / The Dragon King (25/1) |
| 2026-11-19 Newcastle 19:10 | Yes | Real Jack (9/2) / Forever Twenty (4/1) | — / — | Archangel Josepi (11/2) / Real Jack (9/2) |
| 2026-11-19 Newcastle 19:40 | Yes | Our Absent Friends (28/1) / Kinetic Force (11/2) **W** | — / — | Come On Over (10/1) / Duran (9/1) |
| 2026-11-20 Wolverhampton 16:30 | Yes | Borderline Madness (10/1) / Ignition (28/1) | Ignition (28/1) / Age Of Time (11/2) | Ignition (28/1) / Book Of Life (11/4) |
| 2026-11-20 Wolverhampton 17:00 | Yes | Navona Grey (12/1) / Oliaku (2/1) **W** | Frantic (11/10) / — | Frantic (11/10) / — |
| 2026-11-20 Dundalk 17:15 | Yes | Surpass And Shine (13/8) **W** / Treasured Royal (11/1) | — / — | One Cool Bear (4/1) / Surpass And Shine (13/8) **W** |
| 2026-11-20 Wolverhampton 19:00 | Yes | Beechwood Glory (9/4) / Alfey Moon (8/1) | Printing Money (15/8) **W** / — | Printing Money (15/8) **W** / Better Nature (28/1) |
| 2026-11-20 Dundalk 19:45 | Yes | Flying Fortress (9/2) **W** / Walhaan (11/1) | — / Tribal Moon (11/2) | — / Tribal Moon (11/2) |
| 2026-11-20 Wolverhampton 20:00 | Yes | Love Alive (17/2) / Tomarlo (14/1) | — / Our Planet (15/8) **W** | — / Barry The Worm (9/4) |
| 2026-11-20 Wolverhampton 20:30 | — | Super Hit (NR) / Exotic Baby (3/1) **W** | — / — | — / Chesneys Charm (14/1) |

</details>

<details>
<summary>October · all changed archived pre-off books</summary>

| Date / course / scheduled UTC | Matched | Original T1 / T2 | Removed T1 / T2 | Reversed T1 / T2 |
| --- | --- | --- | --- | --- |
| 2026-10-20 Newcastle 16:30 | Yes | Get Up Everybody (13/2) / Educating Rita (15/2) | — / Sole Spirit (8/1) | Sole Spirit (8/1) / Get Up Everybody (13/2) |
| 2026-10-20 Newcastle 19:00 | Yes | Doon The Glen (11/2) / Liquid Cooled (17/2) | Aleppo Pepper (11/1) / Doon The Glen (11/2) | Aleppo Pepper (11/1) / Doon The Glen (11/2) |
| 2026-10-21 Kempton 17:30 | Yes | Somers Isles (14/1) / Aljoon (28/1) | Farasan (6/1) / Somers Isles (14/1) | Farasan (6/1) / Somers Isles (14/1) |
| 2026-10-21 Kempton 18:00 | Yes | Level Look (3/1) / Brasil Power (22/1) | Synergism (10/1) / Level Look (3/1) | Synergism (10/1) / Level Look (3/1) |
| 2026-10-21 Kempton 18:30 | Yes | Initial Blue (6/1) / Modern Times (15/2) | — / Serenity Dream (9/2) | — / Serenity Dream (9/2) |
| 2026-10-22 Southwell 17:30 | Yes | Piazza (5/1) / Sir Paul Ramsey (12/1) | — / Rapide Vega (9/2) | Rapide Vega (9/2) / Piazza (5/1) |
| 2026-10-22 Southwell 19:00 | Yes | Kirkdale (10/3) / Hypnotised (3/1) | — / Come On Over (6/1) | Come On Over (6/1) / Kirkdale (10/3) |
| 2026-10-23 Wolverhampton 15:25 | Yes | Palliser (14/1) / Yehudi (12/1) **W** | Yehudi (12/1) **W** / Ballybunion (9/2) | Yehudi (12/1) **W** / Asian Journey (8/1) |
| 2026-10-23 Dundalk 16:45 | Yes | Saga Lucia (12/1) / Faoladh (7/1) | — / — | — / Mehman (3/1) **W** |
| 2026-10-23 Wolverhampton 18:00 | Yes | Freddy Robinson (17/2) / Jodhpur Blue (10/3) | Just Typical (5/1) / R P Mcmurphy (7/2) **W** | Just Typical (5/1) / R P Mcmurphy (7/2) **W** |
| 2026-10-23 Wolverhampton 18:30 | Yes | Cristo (22/1) / Vincenzo Peruggia (10/1) | Vincenzo Peruggia (10/1) / Warrior Mode (9/2) | Warrior Mode (9/2) / Hauteluce (10/3) |
| 2026-10-23 Wolverhampton 19:00 | Yes | So Sassy (2/1) **W** / Velvet Rhythm (4/1) | — / — | — / Hilltop (3/1) |
| 2026-10-24 Southwell 16:00 | Yes | Moulin Booj (15/2) / Almaty Star (11/1) | — / — | Almaty Star (11/1) / Moulin Booj (15/2) |
| 2026-10-24 Southwell 16:30 | — | Wyvill (—) / Spirit Of Nature (—) | Nymphaea (—) / Clipsham Noble (—) | Clipsham Noble (—) / Miss Veronika (—) |
| 2026-10-24 Southwell 18:00 | Yes | Lili Marleen (4/1) **W** / Crown The Future (13/2) | Kev (7/2) / Lili Marleen (4/1) **W** | Kev (7/2) / African Spirit (6/1) |
| 2026-10-24 Southwell 18:30 | Yes | Captain Parma (13/2) / Gladiadora (11/1) | Anthropologist (4/1) **W** / Finn Ironside (11/1) | Anthropologist (4/1) **W** / Red Hat Eagle (7/1) |
| 2026-10-26 Kempton 17:45 | — | Rogue Messiah (—) / Weffaag (—) | — / — | I'm Workin On It (—) / Rogue Messiah (—) |
| 2026-10-26 Southwell 18:00 | Yes | Yimmna (11/2) / Sterling Fortune (10/3) | — / Toastmaster (13/8) **W** | — / Toastmaster (13/8) **W** |
| 2026-10-26 Southwell 18:30 | Yes | Honey Dale (5/2) **W** / Thestral (7/1) | — / Able Astra (11/2) | Able Astra (11/2) / Honey Dale (5/2) **W** |
| 2026-10-26 Kempton 18:45 | Yes | Breathe Easy (10/3) / Drifts Away (9/2) | — / — | Drifts Away (9/2) / Breathe Easy (10/3) |
| 2026-10-26 Kempton 19:15 | — | Ataturk (NR) / Heart Sign (18/1) | — / Kathleen Mary (10/3) | — / Open To Offers (33/1) |
| 2026-10-26 Kempton 19:45 | Yes | Preferred (4/1) / Roy Lane (1/1) **W** | Roy Lane (1/1) **W** / Preferred (4/1) | Roy Lane (1/1) **W** / Preferred (4/1) |
| 2026-10-27 Wolverhampton 16:30 | Yes | Eighty Eight (5/2) / Boy Named Sioux (11/1) | Sant Alessio (4/1) / Eighty Eight (5/2) | Sant Alessio (4/1) / Eighty Eight (5/2) |
| 2026-10-27 Wolverhampton 18:30 | Yes | Midnight's Dream (3/1) / Imelda (14/1) | — / The Caribbean (7/1) | — / The Caribbean (7/1) |
| 2026-10-27 Wolverhampton 19:00 | — | Sprinting Speed (NR) / Barry The Worm (3/1) | Territorial Star (11/4) **W** / — | Territorial Star (11/4) **W** / — |
| 2026-10-27 Wolverhampton 20:00 | Yes | Ted Le Saux (3/1) / Roi De Coeur (11/4) **W** | Roi De Coeur (11/4) **W** / Newfangled (5/1) | Kaaranah (5/1) / — |
| 2026-10-28 Kempton 16:15 | Yes | King Cherry (13/2) / Insuspense (7/4) | — / — | Insuspense (7/4) / King Cherry (13/2) |
| 2026-10-28 Dundalk 16:30 | Yes | Una Matata (9/4) / Pattyandselma (40/1) | — / — | — / Final Boss (12/1) |
| 2026-10-28 Kempton 18:15 | Yes | Maria Da Silva (7/4) **W** / Medway Queen (6/1) | — / Rating (25/1) | — / Goomah (2/1) |
| 2026-10-28 Kempton 20:15 | Yes | Herculeus (10/1) / Whitesnake (5/2) | — / — | Strong Voice (9/2) **W** / — |
| 2026-10-29 Southwell 16:25 | Yes | Monsieur Bondy (9/2) / Anthropologist (1/1) **W** | Anthropologist (1/1) **W** / Monsieur Bondy (9/2) | Anthropologist (1/1) **W** / Monsieur Bondy (9/2) |
| 2026-10-29 Southwell 17:30 | Yes | Passerine (14/1) / Wintour (12/1) | — / — | — / Perfect Hope (6/1) |
| 2026-10-29 Southwell 18:00 | Yes | Edmond Halley (15/8) **W** / Homme De Fer (6/1) | Homme De Fer (6/1) / Edmond Halley (15/8) **W** | Homme De Fer (6/1) / Edmond Halley (15/8) **W** |
| 2026-10-29 Southwell 19:30 | Yes | Revelio (9/1) / Sevenkingsmustdie (3/1) | Fleur De Mer (8/1) / — | Fleur De Mer (8/1) / Smokey Malone (33/1) |
| 2026-10-29 Southwell 20:00 | — | Sibling Rivelry (NR) / Midnight Media (15/8) | Lilly Lux (5/2) / — | Lilly Lux (5/2) / — |
| 2026-10-30 Newcastle 16:15 | Yes | Alembic (5/2) / Yaaser (12/1) | — / — | — / Golspie (10/3) **W** |
| 2026-10-30 Newcastle 17:15 | Yes | Pequenita (13/8) / Lady Caroline Lamb (85/40) **W** | Lady Caroline Lamb (85/40) **W** / Pequenita (13/8) | Lady Caroline Lamb (85/40) **W** / Pequenita (13/8) |
| 2026-10-30 Newcastle 17:45 | Yes | Ennoble (3/1) / Storm Esme (7/2) | — / Brave Traveller (6/1) | — / Brave Traveller (6/1) |
| 2026-10-30 Newcastle 18:15 | Yes | Tatterstall (9/1) / Michaela's Boy (28/1) | Elyam (15/8) **W** / Tatterstall (9/1) | Elyam (15/8) **W** / Tatterstall (9/1) |
| 2026-10-30 Newcastle 18:45 | — | Regal Desire (20/1) / Project Geofin (6/1) | Project Geofin (6/1) / Blue To Blue (15/2) | Cosmos Raj (10/1) / Mwafaq (7/2) |
| 2026-10-30 Newcastle 19:45 | Yes | Jamaican Storm (5/1) / Viviana (18/1) | Educating Rita (7/2) / — | Educating Rita (7/2) / Lanarra (8/1) |
| 2026-10-30 Dundalk 20:00 | Yes | Go Out (3/1) **W** / Battle Borne (14/1) | — / — | Battle Borne (14/1) / Go Out (3/1) **W** |
| 2026-10-30 Newcastle 20:20 | Yes | Ey Up He's A Star (10/3) / Pallas Lord (18/1) | Starliner (9/2) / Ey Up He's A Star (10/3) | Starliner (9/2) / Ey Up He's A Star (10/3) |
| 2026-10-31 Southwell 16:00 | Yes | Launceston (9/1) / Joud (11/1) | — / — | — / Oxford Circus (13/2) **W** |
| 2026-11-02 Wolverhampton 19:00 | Yes | Ottoman (7/1) / That Darn Cantor (2/1) | — / — | — / Captain Cairney (3/1) |
| 2026-11-02 Wolverhampton 19:30 | Yes | Shes Got The Blues (3/1) / Sovereign Bay (9/2) | — / Rajendra (5/2) **W** | — / Rajendra (5/2) **W** |
| 2026-11-02 Chelmsford City 19:45 | Yes | Orange Emperor (9/2) / Intervention (6/4) | — / — | — / Yachtsman (11/2) |
| 2026-11-02 Chelmsford City 20:15 | Yes | Hamdania (10/1) / Liberate (50/1) | Mr Nugget (28/1) / Magician of Riga (7/2) | Magician of Riga (7/2) / Mr Nugget (28/1) |
| 2026-11-02 Wolverhampton 20:30 | — | My Mate Kev (3/1) / A Lott Of Kane (NR) | — / — | A Lott Of Kane (NR) / My Mate Kev (3/1) |
| 2026-11-03 Wolverhampton 16:30 | Yes | Rovinia (7/1) / Luna Beaux (25/1) | Mini Mac (8/11) **W** / Rovinia (7/1) | Mini Mac (8/11) **W** / Rovinia (7/1) |
| 2026-11-03 Wolverhampton 17:00 | — | Oppenheimer (2/5) **W** / Sonbelievable (NR) | — / Barry The Worm (7/1) | — / Barry The Worm (7/1) |
| 2026-11-03 Wolverhampton 19:00 | Yes | Rogue Citation (5/1) / Politely (6/4) | — / — | — / Star Mirage (12/1) |
| 2026-11-03 Wolverhampton 20:00 | Yes | Atalanta Mist (7/2) / Tropical Talent (33/1) | — / Saxophonic (7/4) **W** | Saxophonic (7/4) **W** / Pureis King (14/1) |
| 2026-11-04 Kempton 14:25 | Yes | King Of Ithaca (4/1) / Kitaro Kich (3/1) | — / — | Mythical Composer (2/1) / King Of Ithaca (4/1) |
| 2026-11-04 Kempton 15:00 | — | Senor Campanaro (NR) / Port Erin (14/1) | — / Palliser (9/2) | — / Snooker McCrew (3/1) **W** |
| 2026-11-04 Dundalk 16:40 | Yes | Thumama Glory (10/3) / Always Magic (11/4) | — / Monologue (4/1) | Monologue (4/1) / Thumama Glory (10/3) |
| 2026-11-04 Kempton 17:00 | Yes | Heathcliff (11/1) / Force And Valour (14/1) | Valvano (3/1) / — | Valvano (3/1) / — |
| 2026-11-04 Dundalk 17:15 | Yes | Real Encounter (5/1) / Collective Power (11/2) | — / Caffu Zafeen (10/3) **W** | — / Caffu Zafeen (10/3) **W** |
| 2026-11-04 Kempton 18:00 | Yes | Invincible Speed (9/1) / Monsieur Patat (10/1) | — / — | Lieutenant Kije (9/2) / Invincible Speed (9/1) |
| 2026-11-04 Kempton 18:30 | Yes | Super Hit (9/2) / Ataturk (13/8) | — / — | Little Miss India (20/1) / Super Hit (9/2) |
| 2026-11-04 Dundalk 18:45 | — | Carrigans Grove (11/2) **W** / Final Boss (9/2) | — / Volendam (80/1) | — / Iff In Doubt (NR) |

</details>

<details>
<summary>2025 · all changed historical forecast books</summary>

| Date / course / scheduled UTC | Matched | Original T1 / T2 | Removed T1 / T2 | Reversed T1 / T2 |
| --- | --- | --- | --- | --- |
| 2025-01-01 Newcastle 14:24 | Yes | Ever Hopefull (12/1) / Sonnerie Power (15/2) | — / — | Sonnerie Power (15/2) / Midnight Lion (11/1) **W** |
| 2025-01-01 Newcastle 14:59 | Yes | Dreams Adozen (7/1) **W** / Fleurman (7/1) | — / Hedonista (10/3) | Hedonista (10/3) / Dreams Adozen (7/1) **W** |
| 2025-01-01 Newcastle 15:34 | Yes | Albasheer (4/1) / Amazonian Dream (10/1) | — / We Never Stop (7/2) | — / Fire Demon (17/2) |
| 2025-01-01 Newcastle 16:40 | Yes | Rory (25/1) / Wee Fat Mac (9/1) | — / Too Much (6/1) | — / Novak (33/1) **W** |
| 2025-01-02 Newcastle 13:52 | Yes | Jujubella (9/2) **W** / Treasure Storm (8/1) | Come On John (11/10) / Jujubella (9/2) **W** | Come On John (11/10) / Jujubella (9/2) **W** |
| 2025-01-02 Newcastle 14:27 | Yes | Busby (3/1) / Typewritten (80/1) | — / Rubellite (11/4) **W** | Lednikov (12/1) / Rubellite (11/4) **W** |
| 2025-01-02 Newcastle 15:02 | Yes | Brazilian Rose (12/1) **W** / Art Fantastique (16/1) | Lahab (7/4) / — | Lahab (7/4) / Noble Consort (85/40) |
| 2025-01-02 Newcastle 16:40 | Yes | Angel Of Antrim (5/6) **W** / Finn Ironside (9/2) | — / — | Streak Lightning (15/2) / Angel Of Antrim (5/6) **W** |
| 2025-01-02 Newcastle 17:40 | Yes | Cherry King (1/1) / Alexander James (15/2) **W** | — / Eva Rosie (12/1) | Eva Rosie (12/1) / Cherry King (1/1) |
| 2025-01-02 Newcastle 18:10 | Yes | Cloch Nua (13/8) **W** / Pop Favorite (6/1) | — / — | Pop Favorite (6/1) / Cloch Nua (13/8) **W** |
| 2025-01-03 Lingfield 13:15 | Yes | Therapist (10/3) / Hebridean Nomad (7/1) | — / Knockbrex (4/1) **W** | — / Knockbrex (4/1) **W** |
| 2025-01-03 Lingfield 14:45 | Yes | Gordon Grey (25/1) / Spectacular Style (4/1) | — / Etretat (9/4) **W** | — / Calanthe (20/1) |
| 2025-01-03 Lingfield 15:45 | Yes | Gold Aura (9/4) / Arch Legend (7/2) | — / Doublethetrouble (5/1) | — / Doublethetrouble (5/1) |
| 2025-01-03 Southwell 18:00 | Yes | The Outlaw (7/4) / Whizz By (7/2) **W** | — / — | — / Brightandbeautiful (7/1) |
| 2025-01-03 Southwell 19:00 | Yes | Autumn Angel (2/1) / Trulie Good (28/1) | — / Bernie The Bear (6/1) | — / Bernie The Bear (6/1) |
| 2025-01-03 Southwell 19:30 | Yes | Kapparis Kid (9/5) **W** / Angel Of Mather's (125/1) | — / Liv Lucky (10/1) | — / Liv Lucky (10/1) |
| 2025-01-03 Southwell 20:00 | Yes | Union Island (5/2) / Commander Crouch (4/1) | Commander Crouch (4/1) / Union Island (5/2) | Commander Crouch (4/1) / Union Island (5/2) |
| 2025-01-03 Southwell 20:30 | Yes | Tea Sea (4/1) **W** / Jaamir (10/3) | Drifts Away (9/4) / Tea Sea (4/1) **W** | Drifts Away (9/4) / Tea Sea (4/1) **W** |
| 2025-01-04 Southwell 16:03 | Yes | Wedgewood Sapphire (12/1) / Dandy Lichious (6/1) | Dandy Lichious (6/1) / Star Of Atlantis (10/3) **W** | Platinum Jubilee (17/2) / — |
| 2025-01-04 Wolverhampton 16:20 | Yes | National Health (4/1) / Bobby Dassler (9/1) | — / — | Eccentric (15/2) / Cherry King (10/11) |
| 2025-01-04 Wolverhampton 16:50 | Yes | Init Together (11/4) **W** / Doras Tamar (80/1) | — / — | — / Dors Delight (18/1) |
| 2025-01-04 Southwell 17:35 | Yes | Just Ten High (9/4) / Bomb Squad (10/1) **W** | Bomb Squad (10/1) **W** / Three Beauz (4/1) | Bomb Squad (10/1) **W** / Three Beauz (4/1) |
| 2025-01-04 Southwell 18:05 | Yes | Fircombe Hall (5/2) / Radiant Angel (16/1) | — / Sir Maxi (4/1) | Sir Maxi (4/1) / Fircombe Hall (5/2) |
| 2025-01-04 Southwell 18:35 | Yes | Ormolulu (7/2) **W** / Many A Star (9/2) | — / — | Rebel Empire (2/1) / Ormolulu (7/2) **W** |
| 2025-01-04 Southwell 19:05 | Yes | Grey Operations (7/2) / Ceira G (8/1) | Ceira G (8/1) / Grey Operations (7/2) | Ceira G (8/1) / Kaleidoscope Eyes (10/3) |
| 2025-01-04 Wolverhampton 19:50 | Yes | Vibrato (5/1) / Diamondonthehill (66/1) | — / Cynosure (5/2) | Cynosure (5/2) / Vibrato (5/1) |
| 2025-01-06 Wolverhampton 19:00 | Yes | Havana Force (17/2) / The Caribbean (14/1) | Mesaafi (4/1) / Havana Force (17/2) | Mesaafi (4/1) / Havana Force (17/2) |
| 2025-01-07 Wolverhampton 17:00 | Yes | Forever Proud (16/5) **W** / Doctor Awtaad (50/1) | — / Ravenglass (7/2) | — / Ravenglass (7/2) |
| 2025-01-07 Wolverhampton 18:30 | Yes | Revolucion (8/1) / Red Walls (9/2) | Red Walls (9/2) / Revolucion (8/1) | Red Walls (9/2) / Revolucion (8/1) |
| 2025-01-07 Wolverhampton 19:00 | Yes | Monsieur Kodi (9/2) / Power Over Me (14/1) | — / Lir Speciale (5/2) | — / Lir Speciale (5/2) |
| 2025-01-07 Wolverhampton 19:30 | Yes | Alfheim (6/1) **W** / Dark Mystery (7/2) | — / Hill Station (9/2) | — / Hill Station (9/2) |
| 2025-01-08 Newcastle 13:03 | Yes | Star Chorus (3/1) / Dandy Magic (10/3) | — / — | — / Blinky (11/4) |
| 2025-01-08 Newcastle 15:03 | Yes | Racing Vicar (25/1) / Powerful Response (5/1) | — / Sandret (7/2) | Sandret (7/2) / Racing Vicar (25/1) |
| 2025-01-08 Newcastle 15:33 | Yes | William Dewhirst (3/1) **W** / Barnaby (8/1) | — / — | — / Commander Of Life (12/1) |
| 2025-01-08 Newcastle 16:03 | Yes | Drakeholes (12/1) / Drafted (8/1) | — / Wyvern (3/1) | — / Wyvern (3/1) |
| 2025-01-08 Kempton 17:00 | Yes | Largo Bay (15/8) / Disquietude (17/2) | Disquietude (17/2) / Sneaky Blinder (10/3) **W** | Muy Barato (10/1) / Sneaky Blinder (10/3) **W** |
| 2025-01-08 Kempton 18:30 | Yes | Grenham Bay (6/4) / Tyger Bay (11/2) | — / Runaround Sioux (11/2) | — / Runaround Sioux (11/2) |
| 2025-01-08 Kempton 19:00 | Yes | Beauty Generation (7/2) / Saturnalia (9/1) | — / Drumstick (7/4) | Drumstick (7/4) / Timetobenice (20/1) |
| 2025-01-09 Lingfield 12:28 | Yes | Douglas Dc (22/1) / Hello Sweety (40/1) | — / Moon Over The Sea (5/2) | Moon Over The Sea (5/2) / Douglas Dc (22/1) |
| 2025-01-09 Lingfield 14:32 | Yes | Starshiba (7/2) / Invincible Aura (7/2) **W** | — / Bowood (5/2) | — / Master Of Combat (11/4) |
| 2025-01-09 Chelmsford City 17:30 | Yes | Comedian Leader (11/1) / Time Patrol (11/10) | Time Patrol (11/10) / Comedian Leader (11/1) | Time Patrol (11/10) / Comedian Leader (11/1) |
| 2025-01-09 Chelmsford City 18:30 | Yes | Alex The Great (15/2) / Foinix (22/1) | Carlton (4/5) **W** / Alex The Great (15/2) | Carlton (4/5) **W** / Zooks (13/2) |
| 2025-01-09 Chelmsford City 19:00 | Yes | The Outlaw (8/11) **W** / Khutulun (10/3) | — / — | Khutulun (10/3) / The Outlaw (8/11) **W** |
| 2025-01-09 Chelmsford City 19:30 | Yes | Triggered (5/2) / Adace (13/2) | — / Mammy (12/1) **W** | Mammy (12/1) **W** / Triggered (5/2) |
| 2025-01-09 Chelmsford City 20:00 | Yes | Poles Apart (7/2) / Advindi (28/1) | — / Headshot (13/2) | Marinakis (5/2) **W** / Poles Apart (7/2) |
| 2025-01-09 Chelmsford City 20:30 | Yes | Phone Tag (4/1) **W** / Solanna (15/8) | Solanna (15/8) / Phone Tag (4/1) **W** | Solanna (15/8) / Auguste Lumiere (2/1) |
| 2025-01-10 Newcastle 16:10 | Yes | Eva Rosie (7/1) / Martin's Brig (18/1) | Just Typical (11/2) / Eva Rosie (7/1) | Just Typical (11/2) / Eva Rosie (7/1) |
| 2025-01-10 Dundalk 16:30 | Yes | Bansha Belle (7/1) / Lyle The Crocodile (11/2) | Tomarlo (11/10) / Bansha Belle (7/1) | Tomarlo (11/10) / Bansha Belle (7/1) |
| 2025-01-10 Dundalk 17:00 | Yes | Clarita (9/2) / Sayifyouwill (5/2) **W** | — / — | Shoot To Kill (11/4) / Clarita (9/2) |
| 2025-01-10 Newcastle 17:15 | Yes | Thunder Star (8/1) / Darlo Pride (5/1) | Darlo Pride (5/1) / Thunder Star (8/1) | Darlo Pride (5/1) / Thunder Star (8/1) |
| 2025-01-10 Newcastle 17:45 | Yes | Kranjcar (6/4) / Alexander James (7/1) | Agent Mayfair (7/1) / — | Agent Mayfair (7/1) / Gunnerside (5/1) |
| 2025-01-10 Newcastle 18:15 | Yes | Beaumadier (7/2) **W** / Desert Master (5/1) | — / — | — / Beneficiary (7/2) |
| 2025-01-10 Dundalk 19:00 | Yes | Camachero (66/1) / Bungle Inthedesert (14/1) | — / — | — / Aljadel (22/1) |
| 2025-01-11 Chelmsford City 13:30 | Yes | Delta Legend (20/1) / Carlton (13/8) **W** | Carlton (13/8) **W** / Delta Legend (20/1) | Carlton (13/8) **W** / Addosh (33/1) |
| 2025-01-11 Newcastle 14:35 | Yes | Dash Gordon (10/11) / Doon The Glen (8/1) | — / — | — / Arlington (16/1) |
| 2025-01-11 Chelmsford City 14:40 | Yes | Altmore (13/2) / Apiarist (11/4) **W** | — / — | Eagle Day (5/1) / — |
| 2025-01-11 Chelmsford City 16:27 | Yes | Crocus Time (22/1) / Bernie The Bear (11/4) | Bernie The Bear (11/4) / Crocus Time (22/1) | Bernie The Bear (11/4) / You Are Everything (5/1) |
| 2025-01-11 Newcastle 16:45 | Yes | Novak (11/2) / Wee Fat Mac (4/1) | — / — | — / Jackson Street (7/1) |
| 2025-01-11 Newcastle 17:15 | Yes | Dazy Mazy (10/3) / Giselles Izzy (11/1) | — / — | — / Brazilian Rose (9/4) **W** |
| 2025-01-11 Wolverhampton 18:30 | Yes | Manara (2/1) **W** / Tiempo Alegre (8/1) | Fernando (7/2) / Manara (2/1) **W** | Fernando (7/2) / — |
| 2025-01-11 Wolverhampton 19:30 | Yes | Party Bear (5/2) / Navarre Special (40/1) | — / Roysdelight (9/2) | — / Sarafina Mshairi (13/2) |
| 2025-01-11 Wolverhampton 20:00 | Yes | Maharajas Express (7/4) / Rogue Thunder (4/1) | — / Toussarok (11/2) | — / Toussarok (11/2) |
| 2025-01-11 Wolverhampton 20:30 | Yes | Equion (15/2) / Yeoman (8/1) | Yeoman (8/1) / Equion (15/2) | Finn Russell (3/1) / — |
| 2025-01-13 Lingfield 12:30 | Yes | Frankies Dream (11/8) / Kameko Spirit (9/2) | — / — | — / Sunny Time (9/4) **W** |
| 2025-01-13 Lingfield 13:30 | Yes | Tadreeb (5/6) **W** / Super Hit (18/1) | Super Hit (18/1) / Tadreeb (5/6) **W** | Super Hit (18/1) / Tadreeb (5/6) **W** |
| 2025-01-13 Lingfield 14:30 | Yes | Realise The Dream (18/1) / Eva's Eyes (13/2) | — / — | — / Manton Road (1/1) **W** |
| 2025-01-13 Lingfield 15:00 | Yes | Welsh Fizz (40/1) / Born Too Run (22/1) | Born Too Run (22/1) / Perfect Parole (11/4) | Born Too Run (22/1) / Perfect Parole (11/4) |
| 2025-01-13 Lingfield 16:00 | Yes | Time Tested (5/1) **W** / Fior Di Bosco (25/1) | — / Masqool (10/3) | Masqool (10/3) / Time Tested (5/1) **W** |
| 2025-01-13 Wolverhampton 17:30 | Yes | Blue Collar (11/1) / Further Measure (2/1) | Further Measure (2/1) / Mr Zippi (7/1) | Further Measure (2/1) / Daaris (5/4) |
| 2025-01-13 Wolverhampton 18:00 | Yes | My Genghis (14/1) / Maharajas Express (13/8) | — / — | Maharajas Express (13/8) / My Genghis (14/1) |
| 2025-01-13 Wolverhampton 19:00 | Yes | Kitaab (6/1) / Havana Sky (4/1) | — / — | Invincible Speed (16/1) / Kitaab (6/1) |
| 2025-01-13 Wolverhampton 19:30 | Yes | Land Lover (11/2) / Nelson Gay (4/1) | — / — | — / Prince Of Bel Lir (17/2) **W** |
| 2025-01-13 Wolverhampton 20:00 | Yes | Autumn Rose (4/1) / Monsieur Patat (18/1) | Surprise Picture (5/2) / Autumn Rose (4/1) | Surprise Picture (5/2) / Autumn Rose (4/1) |
| 2025-01-14 Southwell 12:52 | Yes | Horus (10/3) / Triple Charged (5/2) | — / Flicka's Girl (22/1) | — / Flicka's Girl (22/1) |
| 2025-01-14 Southwell 14:22 | Yes | High Court Judge (8/13) **W** / Rubellite (15/8) | — / — | — / Desejada (20/1) |
| 2025-01-14 Dundalk 15:00 | Yes | Star Mind (50/1) / Nedita (3/1) | Morning Approach (4/1) / Rockbury Lad (7/2) | Morning Approach (4/1) / Brains (8/1) |
| 2025-01-14 Southwell 15:22 | Yes | Saligo Bay (33/1) / Two Auld Pals (4/1) | Two Auld Pals (4/1) / Dance Time (2/1) | At Vimeiro (11/2) **W** / Dance Time (2/1) |
| 2025-01-14 Southwell 15:55 | Yes | Marinakis (7/4) / Fifty Sent (28/1) | — / — | Fifty Sent (28/1) / Marinakis (7/4) |
| 2025-01-14 Newcastle 16:13 | Yes | William Dewhirst (6/4) **W** / Starliner (6/1) | — / — | — / Swiss Ace (7/2) |
| 2025-01-14 Dundalk 17:30 | Yes | Cousin Shay (11/10) **W** / Woodlander (50/1) | — / Rumbled Again (17/2) | Rumbled Again (17/2) / Cousin Shay (11/10) **W** |
| 2025-01-14 Newcastle 18:15 | Yes | Paris Lights (7/2) / Cusack (7/2) **W** | — / Profitman (6/1) | — / Profitman (6/1) |
| 2025-01-14 Newcastle 18:45 | Yes | Tomorrow Day (1/1) **W** / Stormy Pearl (28/1) | — / — | — / Tickets (10/3) |
| 2025-01-15 Southwell 12:08 | Yes | Fortunate Star (5/4) / Better (14/1) | — / So Obsessed (25/1) | — / So Obsessed (25/1) |
| 2025-01-15 Southwell 13:08 | Yes | Risen Again (20/1) / Palazzo Persico (11/1) | Palazzo Persico (11/1) / The Bay Warrior (4/1) **W** | The Bay Warrior (4/1) **W** / — |
| 2025-01-15 Southwell 13:38 | Yes | Angel Of Antrim (11/1) / Lattaash (11/2) | — / — | — / Enola Grey (14/1) |
| 2025-01-15 Southwell 14:08 | Yes | One Moonbeam (100/1) / Tres Chic (11/1) | Tres Chic (11/1) / Aspire To Glory (11/1) | Aspire To Glory (11/1) / — |
| 2025-01-15 Southwell 14:40 | Yes | Miss Billie (18/1) / My Boy Jack (11/4) | My Boy Jack (11/4) / Miss Billie (18/1) | My Boy Jack (11/4) / Coconut Bay (18/1) |
| 2025-01-15 Southwell 15:50 | Yes | Call Glory (5/1) / Bomb Squad (9/2) | — / — | — / Bibendum (7/1) |
| 2025-01-15 Kempton 16:25 | Yes | McCauley's Tavern (3/1) / Don't Fight It (20/1) | Collusion (13/8) / — | Collusion (13/8) / — |
| 2025-01-15 Kempton 18:30 | Yes | Morindoo (8/1) / Cherry King (9/2) | Cherry King (9/2) / United Force (11/2) | Cherry King (9/2) / Stella Hogan (7/2) **W** |
| 2025-01-15 Kempton 19:30 | Yes | Sweet Fantastic (6/1) **W** / Choreographic (15/2) | — / — | — / Reporter (7/2) |
| 2025-01-15 Kempton 20:00 | Yes | Gray Rainbow (7/2) / Abstract Art (10/3) | — / Rosco Rogers (7/1) | — / Rosco Rogers (7/1) |
| 2025-01-16 Chelmsford City 20:00 | Yes | Etretat (15/8) / Cephalus (2/1) | — / — | — / Gordon Grey (11/1) **W** |
| 2025-01-16 Chelmsford City 20:30 | Yes | The Spotlight Kid (11/4) / Claxton Bay (8/1) | — / Union Island (11/10) | Union Island (11/10) / The Spotlight Kid (11/4) |
| 2025-01-17 Newcastle 13:35 | Yes | Dubai Bling (6/1) / Marchogion (8/1) | — / — | Cyclonite (4/1) / Dubai Bling (6/1) |
| 2025-01-17 Newcastle 14:10 | Yes | Misty Grey (25/1) / Heathcliff (6/1) | Heathcliff (6/1) / Misty Grey (25/1) | Heathcliff (6/1) / Misty Grey (25/1) |
| 2025-01-17 Newcastle 14:45 | Yes | Metallo (5/1) / Northern Ruler (4/1) | Northern Ruler (4/1) / Fantasy Believer (33/1) | Dream Harder (16/1) / — |
| 2025-01-17 Southwell 17:00 | Yes | Wiltshire Wonder (6/1) / Path To Dubai (4/1) | — / Plage De Havre (7/2) **W** | Desert Emperor (22/1) / Plage De Havre (7/2) **W** |
| 2025-01-17 Dundalk 17:15 | Yes | Nusra (10/1) / Gregorina (50/1) | Mephisto (13/2) / — | Mephisto (13/2) / — |
| 2025-01-17 Southwell 18:00 | Yes | Toptime (11/4) / Miggy Magic (11/4) | — / — | — / Havechatma (25/1) |
| 2025-01-17 Dundalk 18:15 | Yes | Port Louis (14/1) / Volatile Analyst (85/40) **W** | — / Sarmiento Power (22/1) | — / Sarmiento Power (22/1) |
| 2025-01-17 Southwell 18:30 | Yes | Rhythm N Hooves (11/2) **W** / Existent (10/11) | Existent (10/11) / G'day Mate (12/1) | Existent (10/11) / G'day Mate (12/1) |
| 2025-01-17 Southwell 19:30 | Yes | Little Bittern (25/1) **W** / A Fine Claret (15/8) | — / — | A Fine Claret (15/8) / Little Bittern (25/1) **W** |
| 2025-01-17 Southwell 20:00 | Yes | Venus Slipper (17/2) / Charlatan (1/2) | Charlatan (1/2) / Venus Slipper (17/2) | Charlatan (1/2) / Calcutta Dream (12/1) **W** |
| 2025-01-17 Southwell 20:30 | Yes | Just Typical (11/8) **W** / Quick Away (6/1) | Quick Away (6/1) / Just Typical (11/8) **W** | Quick Away (6/1) / Just Typical (11/8) **W** |
| 2025-01-18 Lingfield 10:15 | Yes | Hedonista (17/2) / Upepo (8/1) | — / — | — / Sun Dancer Girl (14/1) |
| 2025-01-18 Lingfield 10:45 | Yes | Charlie Mason (10/3) / Honour Your Dreams (12/1) | Honour Your Dreams (12/1) / Charlie Mason (10/3) | Honour Your Dreams (12/1) / Lady Wingalong (15/2) |
| 2025-01-18 Lingfield 12:50 | Yes | Kalamunda (7/1) / Brasil Power (20/1) | — / Urban Sprawl (7/1) | Helm Rock (7/1) / Kalamunda (7/1) |
| 2025-01-18 Lingfield 13:25 | Yes | Charlotte's Web (5/2) **W** / Timetoshine (14/1) | — / Santorini Star (11/4) | Santorini Star (11/4) / Charlotte's Web (5/2) **W** |
| 2025-01-18 Wolverhampton 16:30 | Yes | Ash Wednesday (4/7) **W** / Mashaan (17/2) | — / — | — / Hawajes (28/1) |
| 2025-01-18 Wolverhampton 17:00 | Yes | Ravenglass (5/2) / Star Of Atlantis (7/2) | — / — | — / Anamika (33/1) |
| 2025-01-18 Wolverhampton 18:00 | Yes | Payment Plan (6/4) **W** / Lumberjack (18/1) | — / Shaad (11/2) | Shaad (11/2) / Payment Plan (6/4) **W** |
| 2025-01-18 Wolverhampton 19:00 | Yes | Second Collection (6/1) / Buraback (7/2) **W** | Buraback (7/2) **W** / Second Collection (6/1) | Buraback (7/2) **W** / Nordic Glory (8/1) |
| 2025-01-18 Wolverhampton 20:30 | Yes | Khangai (9/2) / Jujubella (4/11) | — / — | — / Harlington (12/1) |
| 2025-01-20 Kempton 15:05 | Yes | River Wharfe (11/2) / Stella Hogan (4/5) | Stella Hogan (4/5) / Heerathetrack (11/2) | Stella Hogan (4/5) / Heerathetrack (11/2) |
| 2025-01-20 Kempton 16:45 | Yes | Alshimali (11/10) / Smasher (16/1) | — / Court Drive (4/1) **W** | — / Maith An Farhh (18/1) |
| 2025-01-20 Wolverhampton 17:00 | Yes | Showhound (6/1) / Port Erin (4/1) | Port Erin (4/1) / Showhound (6/1) | Port Erin (4/1) / H Key Lails (5/1) |
| 2025-01-20 Wolverhampton 17:30 | Yes | Starfighter (9/2) / Virtual Hug (10/1) | — / Max Of Stars (8/1) | — / Max Of Stars (8/1) |
| 2025-01-20 Kempton 17:45 | Yes | Commendation (8/1) / Miakoda (12/1) | Miakoda (12/1) / Cosmic Force (6/5) | Miakoda (12/1) / Cosmic Force (6/5) |
| 2025-01-20 Kempton 18:15 | Yes | Groovy Baby (12/1) / King David (9/4) | King David (9/4) / Bell Shot (10/3) | King David (9/4) / Bell Shot (10/3) |
| 2025-01-20 Wolverhampton 19:00 | Yes | Port Noir (10/1) / Kitaro Kich (17/2) **W** | — / — | Kitaro Kich (17/2) **W** / Carey Street (13/2) |
| 2025-01-20 Wolverhampton 19:30 | Yes | Invincible Love (11/1) / Aneedah Hero (3/1) | Aneedah Hero (3/1) / Invincible Love (11/1) | Manton Road (1/1) **W** / — |
| 2025-01-20 Wolverhampton 20:30 | Yes | So Obsessed (16/1) / Second Collection (15/2) | Second Collection (15/2) / So Obsessed (16/1) | Second Collection (15/2) / Desert Master (4/1) |
| 2025-01-21 Newcastle 16:40 | Yes | Urban Dandy (6/1) / Bungle Bay (6/1) | Bungle Bay (6/1) / Urban Dandy (6/1) | Bungle Bay (6/1) / Urban Dandy (6/1) |
| 2025-01-21 Newcastle 17:15 | Yes | Kranjcar (3/1) / Fircombe Hall (10/3) | — / — | Fircombe Hall (10/3) / Kranjcar (3/1) |
| 2025-01-21 Newcastle 17:45 | Yes | Time Tested (5/2) / Electric Avenue (14/1) | — / Cusack (17/2) | — / Cusack (17/2) |
| 2025-01-21 Newcastle 18:45 | Yes | A Fine Claret (5/1) / Magic Topissima (14/1) | Bantz (11/4) **W** / A Fine Claret (5/1) | Bantz (11/4) **W** / A Fine Claret (5/1) |
| 2025-01-21 Newcastle 19:15 | Yes | Quandary (11/2) / Super Hit (25/1) | Brazilian Rose (6/4) / Quandary (11/2) | Brazilian Rose (6/4) / Quandary (11/2) |
| 2025-01-21 Newcastle 19:45 | Yes | Frankies Dream (4/5) / Until Dawn (10/3) **W** | — / Roselily (17/2) | Roselily (17/2) / Frankies Dream (4/5) |
| 2025-01-22 Lingfield 12:25 | Yes | Con Te Partiro (3/1) / Obsidian Knight (10/3) | — / — | Annexation (40/1) / — |
| 2025-01-22 Lingfield 13:25 | Yes | Merrimack (11/4) / Diamond Dreamer (12/1) | Recon Mission (7/1) / Merrimack (11/4) | Recon Mission (7/1) / Merrimack (11/4) |
| 2025-01-22 Lingfield 13:55 | Yes | Rumseg (7/1) / Sandhill Dancer (10/1) | — / — | Made The Cut (12/1) / Specified (15/2) |
| 2025-01-22 Lingfield 14:25 | Yes | Claxton Bay (18/1) / Raqraaq (4/1) **W** | Overnight Oats (4/1) / Delta Legend (7/1) | Overnight Oats (4/1) / Delta Legend (7/1) |
| 2025-01-22 Lingfield 14:55 | Yes | Hierarchy (15/2) **W** / Tyger Bay (7/2) | Tyger Bay (7/2) / Hierarchy (15/2) **W** | Tyger Bay (7/2) / Hierarchy (15/2) **W** |
| 2025-01-22 Lingfield 15:55 | Yes | Dubai Harbour (6/5) / We'renotreallyhere (10/3) | — / — | — / Sir Laurence Graff (15/2) |
| 2025-01-22 Kempton 18:00 | Yes | Enpassant (15/2) / Lunarscape (13/2) | — / Beauty Generation (15/8) **W** | Beauty Generation (15/8) **W** / Enpassant (15/2) |
| 2025-01-22 Kempton 20:30 | Yes | Orchestra (12/1) / Comte De Loir (1/1) **W** | Percy Jones (7/1) / Orchestra (12/1) | Percy Jones (7/1) / Haliphon (12/1) |
| 2025-01-23 Newcastle 13:11 | Yes | Beneficiary (3/1) **W** / Phoenix Star (15/2) | Lady Of The Garr (10/3) / Beneficiary (3/1) **W** | Lady Of The Garr (10/3) / Beneficiary (3/1) **W** |
| 2025-01-23 Newcastle 13:46 | Yes | Aspire To Glory (12/1) / Cloch Nua (1/1) **W** | — / — | — / Martin's Brig (10/1) |
| 2025-01-23 Newcastle 14:21 | Yes | Nights Over Egypt (22/1) / Sir Maxi (4/1) | — / Wee Fat Mac (5/2) | — / Wee Fat Mac (5/2) |
| 2025-01-23 Newcastle 16:06 | Yes | Arlington (4/1) / Stroxx (12/1) **W** | — / — | Stroxx (12/1) **W** / The Princes Poet (10/1) |
| 2025-01-23 Southwell 19:00 | Yes | Hitched (3/1) / King's School (22/1) | — / Cavalry Call (5/1) | — / Cavalry Call (5/1) |
| 2025-01-23 Southwell 20:00 | Yes | Blinky (9/4) / Em Four (7/1) | — / Kiss Me My Love (18/1) | — / Kiss Me My Love (18/1) |
| 2025-01-24 Lingfield 13:08 | Yes | High Court Judge (4/9) **W** / Largo Bay (7/1) | — / Doras Tamar (200/1) | — / Wannabeawallaby (16/1) |
| 2025-01-24 Lingfield 14:15 | Yes | Kinetic (20/1) / Charlie's Choice (8/1) | Charlie's Choice (8/1) / Star Time (7/2) | Tortured Soul (4/1) **W** / — |
| 2025-01-24 Lingfield 14:50 | Yes | Neptune Legend (2/1) / Jazz State (40/1) | — / Run Joy Run (40/1) | — / Run Joy Run (40/1) |
| 2025-01-24 Lingfield 15:25 | Yes | Lupset Flossy Pop (22/1) / Poles Apart (10/1) | Poles Apart (10/1) / Lupset Flossy Pop (22/1) | Hawajes (4/1) / — |
| 2025-01-24 Southwell 18:45 | Yes | Mahato (15/2) / Filly One (18/1) | Filly One (18/1) / Mahato (15/2) | Filly One (18/1) / Lir Speciale (13/2) |
| 2025-01-24 Southwell 19:15 | Yes | Shamardia (4/1) / Bomb Squad (9/4) | — / — | — / King's Crown (7/2) **W** |
| 2025-01-24 Southwell 20:15 | Yes | Carlton (9/4) / Alfheim (8/1) | — / — | — / Hill Station (9/1) |
| 2025-01-25 Newcastle 16:04 | Yes | Eva Rosie (9/2) **W** / Fifty Sent (8/1) | Stand Free (18/1) / Our Noble Lord (22/1) | Stand Free (18/1) / Our Noble Lord (22/1) |
| 2025-01-25 Wolverhampton 16:15 | Yes | Incan Empire (8/1) / Sisterandbrother (2/1) | Pysanka (13/2) / — | Pysanka (13/2) / — |
| 2025-01-25 Newcastle 16:35 | Yes | Above (11/2) / Water Of Leith (15/2) | — / — | Water Of Leith (15/2) / Above (11/2) |
| 2025-01-25 Wolverhampton 16:50 | Yes | Douglas Dc (4/1) / Union Island (5/2) | Union Island (5/2) / Douglas Dc (4/1) | Union Island (5/2) / Bella Veneta (6/1) |
| 2025-01-25 Newcastle 17:35 | Yes | Brewing (9/2) **W** / Empirestateofmind (6/1) | — / Society Man (5/2) | Tropez Power (16/1) / Brewing (9/2) **W** |
| 2025-01-25 Wolverhampton 18:20 | Yes | Giant (4/1) / Lessay (7/1) | — / — | He's A Gentleman (10/1) **W** / — |
| 2025-01-25 Newcastle 18:35 | Yes | Believe Me Now (9/4) / Monsieur Fantaisie (2/1) | — / — | — / Elettaria (7/2) **W** |
| 2025-01-25 Newcastle 19:05 | Yes | Tomorrow Day (9/4) / Northcliff (5/1) | — / Havana Sky (13/2) | Havana Sky (13/2) / Tomorrow Day (9/4) |
| 2025-01-25 Wolverhampton 19:50 | Yes | Saturnalia (5/1) / Outrace (8/1) | — / — | Calanthe (7/1) / — |
| 2025-01-25 Wolverhampton 20:20 | Yes | Timetobenice (6/1) / African Spirit (11/1) | — / Kracking (2/1) | Kracking (2/1) / Timetobenice (6/1) |
| 2025-01-27 Wolverhampton 16:26 | Yes | Fior Di Bosco (22/1) / Kitaro Kich (11/4) | — / — | King Of Speed (9/1) / Fior Di Bosco (22/1) |
| 2025-01-27 Dundalk 16:45 | Yes | Cuban Grey (11/1) **W** / Sam's Xpress (7/2) | — / — | Turn Up The Beat (3/1) / Livingston Range (3/1) |
| 2025-01-27 Wolverhampton 17:00 | Yes | Top Of The Class (9/4) / Zandita (11/1) | Gaiety Musical (11/10) **W** / Top Of The Class (9/4) | Gaiety Musical (11/10) **W** / Top Of The Class (9/4) |
| 2025-01-27 Dundalk 17:15 | Yes | Belles Feuilles (9/2) / Rumbled Again (25/1) | — / Guest Star (11/1) **W** | Jawhary (11/2) / Guest Star (11/1) **W** |
| 2025-01-27 Dundalk 17:45 | Yes | Rhythm And Tyne (28/1) / Sir Callisto (11/2) | Vivacious Lady (3/1) / Koniag (7/4) **W** | Vivacious Lady (3/1) / Koniag (7/4) **W** |
| 2025-01-27 Wolverhampton 19:30 | Yes | Starfighter (7/2) **W** / Mirabello Bay (17/2) | — / Hawa Jumeirah (8/11) | Rose Light (8/1) / Starfighter (7/2) **W** |
| 2025-01-27 Wolverhampton 20:00 | Yes | National Health (13/8) / Advindi (12/1) | — / Back From Dubai (13/2) **W** | — / Eccentric (8/1) |
| 2025-01-27 Wolverhampton 20:30 | Yes | Spartan Times (5/2) / Lucky Question (12/1) | — / — | Northstead Gardens (6/1) / Spartan Times (5/2) |
| 2025-01-28 Wolverhampton 19:00 | Yes | Lovesick (8/1) / This Farh (9/4) | — / — | Blue Secret (5/1) / — |
| 2025-01-28 Wolverhampton 19:30 | Yes | Blue Seeker (10/11) / Blue Empress (13/2) | — / Panama Black (7/2) | — / Panama Black (7/2) |
| 2025-01-28 Wolverhampton 20:00 | Yes | Rogue Thunder (7/2) / Alafdhal (13/2) | Galel (13/2) / Rogue Thunder (7/2) | Galel (13/2) / Rogue Thunder (7/2) |
| 2025-01-28 Wolverhampton 20:30 | Yes | I Can't Believe (2/1) / Init Together (7/4) **W** | — / Cryptos Dream (8/1) | — / Cryptos Dream (8/1) |
| 2025-01-29 Kempton 17:00 | Yes | Drifts Away (5/4) **W** / Ciotog (7/2) | — / — | — / Persian Phoenix (13/2) |
| 2025-01-29 Dundalk 17:17 | Yes | Dream Today (6/1) / Mint Man (4/1) | — / — | Sporting Hero (7/2) / Dream Today (6/1) |
| 2025-01-29 Kempton 19:00 | Yes | Midnight's Dream (3/1) **W** / Enpassant (7/1) | Enpassant (7/1) / Midnight's Dream (3/1) **W** | Enpassant (7/1) / Midnight's Dream (3/1) **W** |
| 2025-01-29 Kempton 19:30 | Yes | Camera Shy (7/1) / Dream Voyage (16/1) | — / Trouble Man (11/4) **W** | Trouble Man (11/4) **W** / Camera Shy (7/1) |
| 2025-01-29 Kempton 20:00 | Yes | Cornish Storm (7/2) / Spitfire Bridge (66/1) | — / Mr Nugget (85/40) | — / The Colorist (17/2) |
| 2025-01-30 Southwell 13:12 | Yes | Caramay (16/1) / Skye Breeze (10/3) | Charlie's Choice (9/4) **W** / Caramay (16/1) | Charlie's Choice (9/4) **W** / — |
| 2025-01-30 Southwell 13:42 | Yes | Dyrholaey (11/4) / Glorious Angel (28/1) | — / Rohaan (4/1) | — / Zero Carbon (50/1) |
| 2025-01-30 Southwell 14:12 | Yes | Star Legend (9/2) / Doublethetrouble (8/1) | — / Blue Sky Boy (5/2) | Blue Sky Boy (5/2) / Star Legend (9/2) |
| 2025-01-30 Southwell 15:12 | Yes | Porfin (5/2) / Hawajes (9/4) **W** | — / — | — / Anamika (9/1) |
| 2025-01-30 Chelmsford City 17:30 | Yes | Mashaan (10/3) / Almodovar Del Rio (13/2) | — / Windsor Pass (2/1) **W** | Windsor Pass (2/1) **W** / Mashaan (10/3) |
| 2025-01-30 Chelmsford City 18:30 | Yes | Match Anthem (13/8) / Heartrate (14/1) | — / Lilkian (5/2) | — / Lilkian (5/2) |
| 2025-01-30 Chelmsford City 19:00 | Yes | Rebel Path (6/4) / Rainyniteingeorgia (18/1) | — / Angle Land (11/2) | — / Angle Land (11/2) |
| 2025-01-30 Chelmsford City 19:30 | Yes | Kameko Spirit (5/1) / Sunny Time (8/11) | — / — | Sunny Time (8/11) / Kameko Spirit (5/1) |
| 2025-01-30 Chelmsford City 20:30 | Yes | Cherry King (6/5) **W** / Billy McGarry (2/1) | — / Genta (20/1) | — / Genta (20/1) |
| 2025-01-31 Newcastle 13:28 | Yes | Rosco Rogers (11/8) / National Voice (33/1) | Sweet Cicely (15/2) / Rosco Rogers (11/8) | Sweet Cicely (15/2) / Rosco Rogers (11/8) |
| 2025-01-31 Newcastle 13:58 | Yes | Yakhabar (22/1) / Flying Scotsman (9/2) **W** | Letmeseethecolts (4/5) / — | Letmeseethecolts (4/5) / — |
| 2025-01-31 Newcastle 15:28 | Yes | Tickets (9/2) **W** / Momaer (14/1) | — / Muscika (15/2) | Muscika (15/2) / Tickets (9/2) **W** |
| 2025-01-31 Dundalk 16:13 | Yes | Ferrari Desert (13/2) / Cross Border (15/2) | — / — | — / Clonmacash (5/1) **W** |
| 2025-01-31 Newcastle 16:29 | Yes | Cusack (3/1) / Paris Lights (13/2) | Mambha (28/1) / — | Mambha (28/1) / — |
| 2025-01-31 Southwell 17:00 | Yes | Em Jay Kay (5/1) / Wee Fat Mac (11/4) | Court Drive (7/2) / Em Jay Kay (5/1) | Court Drive (7/2) / Em Jay Kay (5/1) |
| 2025-01-31 Southwell 18:00 | Yes | Optician (3/1) / Robusto (7/1) | Robusto (7/1) / Optician (3/1) | Robusto (7/1) / Optician (3/1) |
| 2025-01-31 Southwell 18:30 | Yes | Eydon (1/1) / Champagne Prince (11/10) **W** | — / — | Champagne Prince (11/10) **W** / Eydon (1/1) |
| 2025-01-31 Dundalk 18:45 | Yes | Migdam (17/2) / Mo Ghille Mar (11/2) | Persian Bliss (9/4) **W** / — | Persian Bliss (9/4) **W** / — |
| 2025-01-31 Dundalk 19:15 | Yes | Reclaim (5/1) / Darkened (9/2) | Ranko Express (4/1) **W** / Reclaim (5/1) | Ranko Express (4/1) **W** / Reclaim (5/1) |
| 2025-01-31 Southwell 19:30 | Yes | Dee's Dream (85/40) / Cookie Queen (11/1) | — / The Resdev Way (7/2) | The Resdev Way (7/2) / Dee's Dream (85/40) |
| 2025-01-31 Southwell 20:00 | Yes | Kingdom Of Time (40/1) / Joolianoss (7/5) **W** | Joolianoss (7/5) **W** / Commander Of Life (8/1) | Youarenotforgiven (14/1) / — |
| 2025-01-31 Southwell 20:30 | Yes | Tiger Crusade (3/1) / Brasil Power (8/1) | — / Diamondonthehill (10/1) | Diamondonthehill (10/1) / Tiger Crusade (3/1) |
| 2025-02-01 Newcastle 16:17 | Yes | Toby Tops (16/1) / Urban Road (7/4) **W** | Urban Road (7/4) **W** / Blue Yonder (11/2) | Alpine Sierra (10/1) / — |
| 2025-02-01 Wolverhampton 16:40 | Yes | Cynosure (9/2) / Metallo (3/1) | — / — | King's Code (5/1) / Cynosure (9/2) |
| 2025-02-01 Newcastle 16:50 | Yes | Frankies Dream (6/4) **W** / Mum's Called (9/1) | — / — | — / Causin A Commotion (5/1) |
| 2025-02-01 Wolverhampton 17:10 | Yes | Forest Spirit (10/3) / Arc Zoosve (11/2) | — / — | Albert Lasker (11/2) / — |
| 2025-02-01 Newcastle 17:25 | Yes | Molveno (1/1) **W** / Royal Alliance (7/4) | Royal Alliance (7/4) / Molveno (1/1) **W** | Royal Alliance (7/4) / Molveno (1/1) **W** |
| 2025-02-01 Newcastle 17:55 | Yes | Three Beauz (9/2) / Lady Of The Garr (16/5) | Lady Of The Garr (16/5) / Stroxx (6/1) | Lady Of The Garr (16/5) / Stroxx (6/1) |
| 2025-02-01 Wolverhampton 18:40 | Yes | Spectacular Style (2/1) / Paradoxical (5/2) | — / — | — / Turner Girl (12/1) |
| 2025-02-01 Newcastle 18:55 | Yes | Swiss Ace (7/2) / Quandary (10/3) | Quandary (10/3) / Swiss Ace (7/2) | Quandary (10/3) / Swiss Ace (7/2) |
| 2025-02-01 Newcastle 19:25 | Yes | Time Patrol (11/4) **W** / Fircombe Hall (7/2) | — / Ana Emaraaty (13/2) | — / Ana Emaraaty (13/2) |
| 2025-02-01 Wolverhampton 19:40 | Yes | Sovereign Knight (9/1) / Siobhanbrogan (14/1) | — / — | Ultramarine (10/3) / Sovereign Knight (9/1) |
| 2025-02-01 Newcastle 19:55 | Yes | My Boy Jack (5/1) / Pinpoint (11/1) | — / — | — / Blackcurrent (10/3) |
| 2025-02-01 Wolverhampton 20:10 | Yes | Autumn Rose (10/3) **W** / Bint Havana Gold (10/3) | Bint Havana Gold (10/3) / Autumn Rose (10/3) **W** | Bint Havana Gold (10/3) / Global Warning (10/1) |
| 2025-02-02 Lingfield 14:05 | Yes | Monsieur Beaulieu (4/5) / Cairn Gorm (2/1) | Cairn Gorm (2/1) / Monsieur Beaulieu (4/5) | Cairn Gorm (2/1) / Monsieur Beaulieu (4/5) |
| 2025-02-02 Lingfield 16:17 | Yes | Under Curfew (9/1) / Kento (6/1) | — / Unavailable (4/1) | Unavailable (4/1) / — |
| 2025-02-03 Wolverhampton 17:00 | Yes | Arlecchino's Rex (5/2) / Invincible Melody (5/2) | Blue Anthem (5/1) **W** / Arlecchino's Rex (5/2) | Blue Anthem (5/1) **W** / Arlecchino's Rex (5/2) |
| 2025-02-03 Wolverhampton 18:30 | Yes | Level Up (5/2) / Wedgewood (14/1) | — / — | Rosenpur (4/1) **W** / Level Up (5/2) |
| 2025-02-03 Wolverhampton 19:00 | Yes | Daaris (5/2) / Easter Icon (15/2) | Easter Icon (15/2) / Daaris (5/2) | Easter Icon (15/2) / Daaris (5/2) |
| 2025-02-03 Wolverhampton 20:00 | Yes | King's Crown (4/1) / Southbank (10/3) | Southbank (10/3) / King's Crown (4/1) | Southbank (10/3) / Just Ten High (3/1) **W** |
| 2025-02-03 Wolverhampton 20:30 | Yes | Cooperation (9/4) / Kensington Agent (9/2) | Kensington Agent (9/2) / Cooperation (9/4) | Kensington Agent (9/2) / Cooperation (9/4) |
| 2025-02-04 Newcastle 17:00 | Yes | Time Patrol (10/3) / Conquest Of Power (2/1) | — / — | — / Korroor (25/1) |
| 2025-02-04 Newcastle 17:30 | Yes | Bobby Joe Leg (9/1) / Harlem Nights (15/2) | Mereside Madness (4/1) **W** / — | Mereside Madness (4/1) **W** / Tasever (6/4) |
| 2025-02-05 Kempton 18:30 | Yes | Grenham Bay (10/3) **W** / Big R (14/1) | — / General Assembly (11/1) | — / General Assembly (11/1) |
| 2025-02-05 Kempton 19:00 | Yes | Enpassant (5/2) **W** / Tyger Bay (8/1) | — / Straight A (3/1) | — / Straight A (3/1) |
| 2025-02-06 Southwell 17:30 | Yes | Biplane (9/5) / Runaround Sioux (2/1) | — / — | — / Lady Wingalong (9/2) **W** |
| 2025-02-06 Southwell 20:00 | Yes | Pinjarra (5/1) / Billy McGarry (3/1) | Stella Hogan (11/4) / Pinjarra (5/1) | Stella Hogan (11/4) / Pinjarra (5/1) |
| 2025-02-06 Southwell 20:30 | Yes | American Rose (12/1) / Devasboy (9/2) | — / Thanks Dad (9/1) | Thanks Dad (9/1) / American Rose (12/1) |
| 2025-02-07 Lingfield 13:02 | Yes | Etretat (7/2) / Polling Day (12/1) | Annexation (5/1) / Etretat (7/2) | Annexation (5/1) / Tribal Wisdom (7/2) |
| 2025-02-07 Lingfield 15:02 | Yes | Giorgio M (8/1) / Tadreeb (5/2) | — / How Impressive (10/1) | — / How Impressive (10/1) |
| 2025-02-07 Lingfield 16:05 | Yes | Arlecchino's Gift (11/1) / Brunel Charm (2/1) | — / — | — / Watermelon Sugar (3/1) **W** |
| 2025-02-07 Southwell 16:10 | Yes | Kind Of Kiss (11/1) / Diderot (9/1) | Diderot (9/1) / Empirestateofmind (10/1) | Nikovo (8/1) / — |
| 2025-02-07 Lingfield 16:40 | Yes | Backer Bilk (5/4) **W** / Emily Rebecca (11/2) | — / Ignition (11/10) | Ignition (11/10) / Backer Bilk (5/4) **W** |
| 2025-02-07 Southwell 16:45 | Yes | Init Together (15/8) **W** / Come On John (85/40) | Come On John (85/40) / Init Together (15/8) **W** | Come On John (85/40) / Jaamir (22/1) |
| 2025-02-07 Southwell 17:45 | Yes | Stanley Spencer (7/4) / Batal Dubai (9/2) | — / Many A Star (5/1) **W** | — / Many A Star (5/1) **W** |
| 2025-02-08 Newcastle 17:00 | Yes | Ballyare (6/1) / Pockley (15/8) **W** | Pockley (15/8) **W** / Glory Call (8/1) | Pockley (15/8) **W** / Glory Call (8/1) |
| 2025-02-08 Newcastle 17:30 | Yes | Blast The Dream (3/1) **W** / Lady Mariko (17/2) | — / Golden Thorn (15/2) | — / Golden Thorn (15/2) |
| 2025-02-08 Wolverhampton 17:45 | Yes | Egoiste (10/1) / Meet Me In Meraki (15/2) | Meet Me In Meraki (15/2) / Crafter (11/4) | Tasmanian Legend (7/1) / — |
| 2025-02-08 Wolverhampton 18:45 | Yes | Overnight Oats (3/1) / Autumn Rose (7/2) | — / — | Bint Havana Gold (9/2) **W** / Overnight Oats (3/1) |
| 2025-02-08 Wolverhampton 20:15 | Yes | Mount Olympus (4/1) / Khangai (15/2) | Kinetic (4/1) / — | Kinetic (4/1) / — |
| 2025-02-10 Wolverhampton 16:25 | Yes | Finn Russell (3/1) / Paradoxical (10/3) **W** | — / — | — / English Spirit (10/3) |
| 2025-02-10 Wolverhampton 17:30 | Yes | Darlo Pride (9/4) / Counsel (15/8) **W** | — / — | Counsel (15/8) **W** / Darlo Pride (9/4) |
| 2025-02-10 Wolverhampton 18:00 | Yes | Scarlet Sunset (6/4) **W** / Panama Black (5/2) | Panama Black (5/2) / Packetofbiscuits (9/2) | Panama Black (5/2) / Packetofbiscuits (9/2) |
| 2025-02-10 Wolverhampton 18:30 | Yes | You Are Everything (9/2) / Big Narstie (9/2) | — / — | — / Miss Calculation (9/2) |
| 2025-02-10 Wolverhampton 19:00 | Yes | Available Angel (18/1) / Jazz State (100/1) | Match Anthem (5/2) / Available Angel (18/1) | Seas Of Elzaam (5/2) / Match Anthem (5/2) |
| 2025-02-10 Wolverhampton 20:00 | Yes | National Health (7/1) / Walk The Moon (11/2) | — / — | Limelight (25/1) / National Health (7/1) |
| 2025-02-11 Wolverhampton 17:00 | Yes | Hannasboy (16/1) / Zumaaty (8/1) | Zumaaty (8/1) / Sun Festival (4/1) | Marinakis (8/13) / — |
| 2025-02-11 Wolverhampton 18:00 | Yes | Lord Rapscallion (10/3) **W** / Fools Rush In (5/2) | Serenity Dream (6/1) / Lord Rapscallion (10/3) **W** | Serenity Dream (6/1) / — |
| 2025-02-11 Wolverhampton 20:30 | Yes | Sax Appeal (13/2) **W** / Lexington Knight (22/1) | — / Wonder (2/1) | — / Wonder (2/1) |
| 2025-02-12 Southwell 12:25 | Yes | Harry The Haggler (7/4) **W** / Sweet Painted Lady (33/1) | — / Alioski (10/1) | — / Miss Raindrop (18/1) |
| 2025-02-12 Southwell 12:55 | Yes | Sassy Redhead (20/1) / Stallone (9/2) | — / — | — / Agent Mayfair (13/8) **W** |
| 2025-02-12 Dundalk 14:10 | Yes | Winsome (6/1) / Maharajjah (7/1) | — / Mythical Rock (8/11) | — / Mythical Rock (8/11) |
| 2025-02-12 Southwell 15:50 | Yes | Blue Seeker (3/1) / Montrachet Girl (17/2) **W** | — / McKenna (5/2) | — / McKenna (5/2) |
| 2025-02-12 Dundalk 17:40 | Yes | Genoah (1/1) **W** / Annaghmccanns (7/1) | — / Autocrat (7/2) | — / Autocrat (7/2) |
| 2025-02-12 Kempton 19:30 | Yes | Spectacular Style (9/4) / Eton Blue (22/1) | — / Sonnerie Power (8/1) | Upepo (9/2) / Spectacular Style (9/4) |
| 2025-02-13 Chelmsford City 19:00 | Yes | No Release (13/2) / Maid Of Killybegs (7/1) | — / Camden Flyer (14/1) | — / Clipsham Noble (13/2) |
| 2025-02-14 Southwell 13:00 | Yes | Star Pupil (9/2) / Overnight Oats (11/4) **W** | — / — | Overnight Oats (11/4) **W** / Star Pupil (9/2) |
| 2025-02-14 Southwell 13:30 | Yes | Clyde Bay (3/1) / Lumenbourg (5/1) **W** | — / Northbound (10/3) | Spartan Fighter (8/1) / Northbound (10/3) |
| 2025-02-14 Southwell 15:30 | Yes | Neptune Legend (15/8) / Asadjumeirah (13/2) | — / — | — / Combustion (10/3) **W** |
| 2025-02-14 Southwell 16:00 | Yes | Scylla (16/1) / Mamdoh (4/1) | Rubellite (5/1) / — | Rubellite (5/1) / Desejada (40/1) |
| 2025-02-14 Southwell 16:30 | Yes | Master Of My Fate (10/3) / Rhythm N Hooves (9/2) | — / — | — / Grace Angel (14/1) |
| 2025-02-14 Newcastle 16:57 | Yes | Annandale (10/1) / Volenti (4/1) | — / — | Volenti (4/1) / Annandale (10/1) |
| 2025-02-14 Newcastle 18:00 | Yes | Respectful (18/1) / Tickets (5/1) | Tickets (5/1) / Respectful (18/1) | Roaring Ralph (9/1) / — |
| 2025-02-14 Newcastle 19:00 | Yes | Big Narstie (7/2) / Urban Dandy (11/2) | Jems Bond (4/1) **W** / — | Jems Bond (4/1) **W** / Martin's Brig (7/1) |
| 2025-02-14 Dundalk 19:15 | Yes | Vierson (20/1) / Ice Opera (17/2) | Seti (4/1) / — | Seti (4/1) / Trishuli River (7/2) |
| 2025-02-15 Southwell 16:05 | Yes | Jesse Luc (3/1) **W** / Raft Up (9/2) | Raft Up (9/2) / Jesse Luc (3/1) **W** | Raft Up (9/2) / Jesse Luc (3/1) **W** |
| 2025-02-15 Newcastle 16:20 | Yes | Swinging London (5/2) / Mafia Power (16/1) | — / Doublethetrouble (10/3) | Breathless Bishop (40/1) / Swinging London (5/2) |
| 2025-02-15 Southwell 16:40 | Yes | Blue Anthem (2/1) / Spec Of Light (11/2) | — / Squires Treaty (9/4) | — / Sweet Cicely (11/1) |
| 2025-02-15 Newcastle 16:55 | Yes | Show No Fear (6/1) / Elemental Eye (12/1) | High Court Judge (5/2) **W** / Jujubella (10/3) | High Court Judge (5/2) **W** / Jujubella (10/3) |
| 2025-02-15 Southwell 17:10 | Yes | Callout (9/2) / Crest Of Light (9/4) **W** | — / Eva Dickson (7/1) | — / Eva Dickson (7/1) |
| 2025-02-15 Southwell 18:40 | Yes | Leadenhall Street (5/4) **W** / Midnight City (7/1) | — / — | Cemlyn (10/1) / — |
| 2025-02-15 Newcastle 18:55 | Yes | Strong Power (14/1) / Biplane (10/1) | Novak (17/2) / — | Beale Street (10/3) **W** / Novak (17/2) |
| 2025-02-15 Southwell 19:10 | Yes | Nelson Gay (4/1) **W** / Green Tax (80/1) | Dash Gordon (9/4) / Nelson Gay (4/1) **W** | Dash Gordon (9/4) / Nelson Gay (4/1) **W** |
| 2025-02-16 Lingfield 13:52 | Yes | Diamondonthehill (14/1) / Thapa VC (18/1) | — / Cavalry Call (11/2) | Cavalry Call (11/2) / Invincible Aura (9/4) |
| 2025-02-16 Lingfield 15:22 | Yes | Alice's Impact (11/2) / Brinton (11/2) | — / — | Brinton (11/2) / Alice's Impact (11/2) |
| 2025-02-16 Lingfield 15:52 | Yes | Not Me (2/1) / Arcadian Nights (10/3) **W** | Arcadian Nights (10/3) **W** / Not Me (2/1) | Arcadian Nights (10/3) **W** / Not Me (2/1) |
| 2025-02-16 Lingfield 16:22 | Yes | Honrado (15/8) / Venus Slipper (6/1) **W** | Venus Slipper (6/1) **W** / Honrado (15/8) | Venus Slipper (6/1) **W** / Honrado (15/8) |
| 2025-02-17 Wolverhampton 17:00 | Yes | Overnight Oats (7/2) / Caelan (22/1) | — / Straight A (9/2) | Straight A (9/2) / Overnight Oats (7/2) |
| 2025-02-17 Wolverhampton 18:30 | Yes | Enzos Angel (11/4) / Marioento (5/2) **W** | — / — | Cryptos Dream (17/2) / — |
| 2025-02-17 Wolverhampton 19:00 | Yes | Rogue Thunder (10/3) / Neptune Legend (2/1) | Neptune Legend (2/1) / Rogue Thunder (10/3) | Neptune Legend (2/1) / Heartrate (7/2) **W** |
| 2025-02-18 Wolverhampton 18:00 | Yes | Marvellous Lady (12/1) / Corsican Caper (33/1) | — / Addosh (3/1) | — / Hawa Jumeirah (11/4) |
| 2025-02-18 Wolverhampton 18:30 | Yes | Mamdoh (9/5) **W** / Ezmerellda (11/1) | Daaris (5/2) / Mamdoh (9/5) **W** | Daaris (5/2) / Mamdoh (9/5) **W** |
| 2025-02-18 Wolverhampton 19:00 | Yes | City Of God (5/4) / Master Technician (9/4) **W** | — / — | — / Sweet Fantastic (4/1) |
| 2025-02-18 Wolverhampton 19:30 | Yes | Wedgewood Sapphire (12/1) / Scarfo (4/1) | Scarfo (4/1) / Dandy Lichious (11/4) | Dandy Lichious (11/4) / — |
| 2025-02-18 Wolverhampton 20:30 | Yes | High Court Judge (10/11) / Aikhal (12/1) | — / Sense Of Worth (9/2) **W** | — / Sense Of Worth (9/2) **W** |
| 2025-02-19 Kempton 16:25 | Yes | Zepparella (20/1) / El Hibri (16/5) | El Hibri (16/5) / Zepparella (20/1) | Roman Emperor (9/2) / — |
| 2025-02-19 Kempton 16:55 | Yes | Man On A Mission (6/5) / Arlecchino's Gift (11/1) **W** | — / Mighty Gurkha (11/4) | Mighty Gurkha (11/4) / Man On A Mission (6/5) |
| 2025-02-19 Kempton 19:30 | Yes | Grenham Bay (5/2) / Shallow (11/4) **W** | — / — | — / Mesaafi (4/1) |
| 2025-02-19 Kempton 20:00 | Yes | Cracking Gold (9/4) / Local Hero (15/8) | Local Hero (15/8) / Sterling Knight (9/2) | Silent Age (25/1) / Sterling Knight (9/2) |
| 2025-02-20 Newcastle 16:55 | Yes | Rock Armour (1/1) / Rampant (13/2) | Rampant (13/2) / Rock Armour (1/1) | Rampant (13/2) / Rock Armour (1/1) |
| 2025-02-20 Newcastle 19:00 | Yes | Just Typical (3/1) **W** / Urban Dandy (11/2) | — / — | Urban Dandy (11/2) / Just Typical (3/1) **W** |
| 2025-02-20 Newcastle 19:30 | Yes | Mereside Madness (6/4) / Tasever (15/8) | — / — | — / Havana Prince (10/1) |
| 2025-02-21 Dundalk 18:00 | Yes | Little Keilee (8/1) / Little Empire (9/2) | — / — | — / Clonmacash (3/1) **W** |
| 2025-02-21 Southwell 18:15 | Yes | Chief Mankato (4/1) / Many A Star (4/1) | Rohaan (3/1) / Cairn Gorm (7/1) | Cairn Gorm (7/1) / Rohaan (3/1) |
| 2025-02-21 Southwell 18:45 | Yes | Taskheer (2/1) / Van Zant (14/1) | Van Zant (14/1) / Taskheer (2/1) | Van Zant (14/1) / You Are Everything (5/1) |
| 2025-02-21 Southwell 19:15 | Yes | Pinjarra (10/1) / Bomb Squad (7/1) **W** | Bomb Squad (7/1) **W** / Pinjarra (10/1) | Bomb Squad (7/1) **W** / Pinjarra (10/1) |
| 2025-02-21 Dundalk 19:30 | Yes | Signor Ferrari (4/1) / Ranko Express (7/2) | — / — | — / Albion Princess (80/1) |
| 2025-02-21 Southwell 20:15 | Yes | Kinetic (4/1) / Super Superjack (28/1) | — / Tortured Soul (7/2) | — / Tortured Soul (7/2) |
| 2025-02-22 Southwell 14:40 | Yes | Marshman (15/8) / Fivethousandtoone (14/1) | — / Valiant Force (4/1) | — / Valiant Force (4/1) |
| 2025-02-22 Southwell 15:50 | Yes | Glen Buck (10/11) **W** / Dream Harder (9/1) | — / — | Cello (9/1) / Glen Buck (10/11) **W** |
| 2025-02-22 Chelmsford City 18:15 | Yes | Agent Mayfair (15/2) / Miss Moonshine (7/1) | Miss Moonshine (7/1) / Agent Mayfair (15/2) | Miss Moonshine (7/1) / Combustion (11/10) **W** |
| 2025-02-22 Southwell 18:30 | Yes | Midnight's Dream (7/2) / Ghaihaban (22/1) | — / Commander Of Life (14/1) | — / Commander Of Life (14/1) |
| 2025-02-22 Chelmsford City 18:45 | Yes | Land Lover (25/1) / Lequinto (8/1) | Lequinto (8/1) / Brunel Charm (9/2) | Temple Bruer (7/1) **W** / — |
| 2025-02-22 Southwell 19:00 | Yes | Cephalus (85/40) **W** / The Cookstown Cafu (16/1) | — / Kracking (11/2) | — / Master Of Combat (10/1) |
| 2025-02-22 Chelmsford City 20:15 | Yes | Dash Power (7/2) / Forest Haze (125/1) | — / Poles Apart (11/2) | — / Rising Force (11/4) |
| 2025-02-24 Wolverhampton 17:00 | Yes | Show Biz Kid (22/1) / Urban Road (7/2) **W** | Urban Road (7/2) **W** / Show Biz Kid (22/1) | Annexation (14/1) / — |
| 2025-02-24 Wolverhampton 17:30 | Yes | Miggy Magic (5/2) / Rosenpur (5/1) | — / — | Rosenpur (5/1) / Miggy Magic (5/2) |
| 2025-02-24 Wolverhampton 19:00 | Yes | Quick Away (9/2) / Sun Festival (10/3) | — / — | — / Northstead Gardens (22/1) |
| 2025-02-24 Wolverhampton 20:00 | Yes | Backer Bilk (4/1) / Manton Road (10/3) | — / — | Manton Road (10/3) / Zadkiel (12/1) |
| 2025-02-25 Wolverhampton 16:55 | Yes | Star Of Jupiter (8/1) / Khangai (7/2) | — / My Brother Mike (9/4) **W** | Port Noir (15/2) / My Brother Mike (9/4) **W** |
| 2025-02-25 Wolverhampton 19:30 | Yes | Just Typical (4/1) / Pessoa (13/2) | Aspire To Glory (12/1) **W** / Just Typical (4/1) | Aspire To Glory (12/1) **W** / Carey Street (8/1) |
| 2025-02-25 Wolverhampton 20:00 | Yes | Init Together (5/1) / Sense Of Worth (7/1) | — / — | — / Early Morning Dew (11/2) |
| 2025-02-27 Newcastle 13:35 | Yes | Chantilly Moon (16/1) / Strategic Fortune (13/2) | Strategic Fortune (13/2) / Rubellite (9/5) **W** | Rubellite (9/5) **W** / — |
| 2025-02-27 Newcastle 14:45 | Yes | Just Ten High (5/2) / Tomorrow Day (4/1) | — / — | — / Too Much (7/1) |
| 2025-02-27 Chelmsford City 19:30 | Yes | Forest Gunner (5/1) / So Obsessed (16/1) | So Obsessed (16/1) / Forest Gunner (5/1) | So Obsessed (16/1) / Forest Gunner (5/1) |
| 2025-02-27 Chelmsford City 20:00 | Yes | Elterwater (4/6) **W** / Birthday Angel (22/1) | — / Jenson Benson (17/2) | Cloud Free (4/1) / Elterwater (4/6) **W** |
| 2025-02-28 Lingfield 13:55 | Yes | Graffiti (12/1) / Bearaway (7/4) **W** | Bearaway (7/4) **W** / Graffiti (12/1) | Solanna (12/1) / — |
| 2025-02-28 Lingfield 15:00 | Yes | Good Banter (11/4) / Marchogion (17/2) | — / Red Evolution (12/1) | — / Red Evolution (12/1) |
| 2025-02-28 Lingfield 16:45 | Yes | King's Code (14/1) / Genoah (14/1) | Dragon Icon (5/2) / Charlotte's Web (4/1) | Dragon Icon (5/2) / The Glen Rovers (13/2) **W** |
| 2025-02-28 Dundalk 17:00 | Yes | Charanda (28/1) / Tam Lin (7/2) | Tam Lin (7/2) / Charanda (28/1) | Tam Lin (7/2) / Charanda (28/1) |
| 2025-02-28 Southwell 17:15 | Yes | San Juanito (15/2) / Dividend (11/4) **W** | Dividend (11/4) **W** / City Of God (5/4) | City Of God (5/4) / — |
| 2025-02-28 Southwell 20:15 | Yes | Love Games (11/4) / Hype Merchant (15/8) | Hype Merchant (15/8) / Love Games (11/4) | Sun Keeper (15/2) / — |
| 2025-03-01 Southwell 16:25 | Yes | Ziggy's Missile (4/1) / Rhythm N Hooves (13/8) **W** | — / — | Rhythm N Hooves (13/8) **W** / Ziggy's Missile (4/1) |
| 2025-03-01 Southwell 17:00 | Yes | Rogue Tornado (5/1) **W** / Cinnodin (13/2) | Hebridean Nomad (11/4) / Rogue Tornado (5/1) **W** | Hebridean Nomad (11/4) / Swinging London (9/2) |
| 2025-03-01 Newcastle 17:15 | Yes | Midnight Lion (11/4) / Asgard's Captain (7/1) | — / Mighty Nebula (15/2) | — / Mighty Nebula (15/2) |
| 2025-03-01 Southwell 17:30 | Yes | Therapist (10/3) / Alpine Oasis (6/1) | — / Caramay (9/2) | Charmaine (2/1) **W** / Therapist (10/3) |
| 2025-03-01 Newcastle 17:45 | Yes | Dash Gordon (10/3) / Posh Maisie (80/1) | Three Beauz (7/4) / Dash Gordon (10/3) | Three Beauz (7/4) / Dash Gordon (10/3) |
| 2025-03-01 Newcastle 18:45 | Yes | Tomorrow Day (5/4) / Saisons D'Or (11/2) | — / Lumenbourg (5/1) | — / Lumenbourg (5/1) |
| 2025-03-01 Newcastle 19:15 | Yes | Paris Lights (7/2) / Volenti (7/2) | — / — | L'Ennemi (13/2) / Paris Lights (7/2) |
| 2025-03-01 Southwell 19:30 | Yes | Dash Power (7/2) / Hawajes (12/1) | — / — | — / Vixey (9/1) **W** |
| 2025-03-01 Southwell 20:00 | Yes | Nad Alshiba Rain (22/1) / Spiritualism (33/1) | — / — | Spiritualism (33/1) / Nad Alshiba Rain (22/1) |
| 2025-03-01 Southwell 20:30 | Yes | Port Hedland (9/1) / Back Tomorrow (3/1) | Back Tomorrow (3/1) / Port Hedland (9/1) | Back Tomorrow (3/1) / Port Hedland (9/1) |
| 2025-03-03 Wolverhampton 16:25 | Yes | City Escape (7/2) **W** / Sir Laurence Graff (15/2) | Sir Laurence Graff (15/2) / City Escape (7/2) **W** | Busby (6/5) / — |
| 2025-03-03 Wolverhampton 16:55 | Yes | Khangai (3/1) **W** / Douglas Dc (11/2) | — / — | — / Mhajim (11/2) |
| 2025-03-03 Wolverhampton 17:30 | Yes | National Health (7/2) / Come On John (6/4) **W** | — / — | Come On John (6/4) **W** / National Health (7/2) |
| 2025-03-03 Wolverhampton 19:00 | Yes | Tilsworth Ony Ta (5/1) / Lynwood Lad (13/2) **W** | — / — | — / Rogue Thunder (1/1) |
| 2025-03-03 Wolverhampton 19:30 | Yes | Miss Calculation (13/2) / Second Collection (7/2) | Second Collection (7/2) / Nordic Glory (2/1) **W** | Nordic Glory (2/1) **W** / — |
| 2025-03-03 Wolverhampton 20:30 | Yes | Nelson Gay (5/1) / Beaumadier (11/8) | Beaumadier (11/8) / Nelson Gay (5/1) | Beaumadier (11/8) / Nelson Gay (5/1) |
| 2025-03-04 Newcastle 13:50 | Yes | Media Mogul (2/1) / Market House (3/1) **W** | Market House (3/1) **W** / Spectacular Style (11/2) | Spectacular Style (11/2) / — |
| 2025-03-04 Newcastle 14:22 | Yes | Bantz (5/1) / Manton Road (3/1) **W** | Manton Road (3/1) **W** / Bantz (5/1) | Manton Road (3/1) **W** / Bantz (5/1) |
| 2025-03-04 Newcastle 16:22 | Yes | Blackjack (9/2) / Harry Did (2/1) **W** | — / Roaring Ralph (9/2) | — / Roaring Ralph (9/2) |
| 2025-03-04 Newcastle 16:52 | Yes | Pallas Lord (4/1) **W** / Wyvern (9/4) | — / Heretic (11/1) | — / Heretic (11/1) |
| 2025-03-04 Southwell 17:00 | Yes | Appleblossomwhite (15/2) / Al Waseela (9/1) | — / Bad Habits (80/1) | — / Bad Habits (80/1) |
| 2025-03-04 Southwell 18:00 | Yes | Rich Rhythm (9/2) / Emily Post (9/1) | — / Zu Run (11/2) | — / Zu Run (11/2) |
| 2025-03-04 Southwell 20:00 | Yes | High Court Judge (7/2) **W** / Super Superjack (125/1) | — / Mr Nugget (13/8) | — / Detroit Lion (12/1) |
| 2025-03-04 Southwell 20:30 | Yes | Sportingsilvermine (2/1) **W** / Aiming High (4/1) | — / — | Gozo (6/4) / — |
| 2025-03-05 Lingfield 16:12 | Yes | Kitaro Kich (1/1) **W** / Runaround Sioux (4/1) | — / Kondratiev Wave (12/1) | — / Split Elevens (12/1) |
| 2025-03-05 Lingfield 17:17 | Yes | Sonic Pioneer (10/3) / Currahee (7/2) | — / Backer Bilk (7/4) | Backer Bilk (7/4) / Sonic Pioneer (10/3) |
| 2025-03-05 Kempton 19:00 | Yes | Ben Y Bryn (15/2) / Enpassant (4/1) | Enpassant (4/1) / Ben Y Bryn (15/2) | Enpassant (4/1) / Ben Y Bryn (15/2) |
| 2025-03-05 Kempton 19:30 | Yes | Gunlock (16/1) / Dingle (5/1) **W** | Mr Baloo (11/4) / — | Mr Baloo (11/4) / — |
| 2025-03-05 Kempton 20:00 | Yes | Shallow (9/2) / Supreme King (16/5) **W** | — / Grenham Bay (9/1) | — / Grenham Bay (9/1) |
| 2025-03-05 Kempton 20:30 | Yes | Almosh'her (4/6) **W** / Arqoob (10/1) | Arqoob (10/1) / Almosh'her (4/6) **W** | Arqoob (10/1) / Haku (9/1) |
| 2025-03-06 Newcastle 19:00 | Yes | Overnight Oats (5/1) / The Cookstown Cafu (17/2) | — / — | — / Quiet Resolve (2/1) |
| 2025-03-07 Newcastle 17:15 | Yes | Alex The Great (5/4) **W** / Unification (16/1) | — / — | — / Man Of Action (13/2) |
| 2025-03-07 Dundalk 18:00 | Yes | I'm Spartacus (4/1) / Dream Today (11/1) | — / Devil's Angel (13/2) | — / Devil's Angel (13/2) |
| 2025-03-07 Newcastle 18:15 | Yes | Prince Of Bel Lir (18/1) / Sibyl Charm (9/4) | — / Kats Bob (5/2) **W** | — / Kats Bob (5/2) **W** |
| 2025-03-07 Newcastle 19:15 | Yes | Margot Robbie (5/4) **W** / Wedgewood Sapphire (14/1) | — / — | Wedgewood Sapphire (14/1) / Margot Robbie (5/4) **W** |
| 2025-03-07 Dundalk 19:30 | Yes | Apache Outlaw (5/2) / Big Gossey (11/2) | — / Valiant Force (8/11) **W** | — / Valiant Force (8/11) **W** |
| 2025-03-07 Newcastle 19:45 | Yes | Fifty Sent (11/4) / Martin's Brig (4/1) | — / Danehill Star (15/2) **W** | Danehill Star (15/2) **W** / Fifty Sent (11/4) |
| 2025-03-07 Newcastle 20:15 | Yes | King's School (5/2) / Power Of Zeus (25/1) | — / Tasever (4/1) | Tasever (4/1) / King's School (5/2) |
| 2025-03-07 Dundalk 20:30 | Yes | Volatile Analyst (5/2) / Tribal Moon (16/1) | — / Albion Power (20/1) | — / Albion Power (20/1) |
| 2025-03-08 Wolverhampton 17:05 | Yes | Knebworth (6/1) / Habooba (6/1) | — / — | Habooba (6/1) / Knebworth (6/1) |
| 2025-03-08 Chelmsford City 17:25 | Yes | Curtiz (5/2) / Persian Phoenix (9/1) | — / — | Major Major (4/1) / — |
| 2025-03-08 Wolverhampton 18:15 | Yes | Arcadian Nights (7/2) **W** / Eagle Day (6/1) | — / — | Eagle Day (6/1) / Arcadian Nights (7/2) **W** |
| 2025-03-08 Chelmsford City 19:00 | Yes | Poetic Jack (8/1) / Lion Ring (17/2) | — / Silky Robin (3/1) | — / Silky Robin (3/1) |
| 2025-03-08 Chelmsford City 19:30 | Yes | Mashaan (10/1) / Time Patrol (15/2) | — / Windsor Pass (11/2) | Windsor Pass (11/2) / Mashaan (10/1) |
| 2025-03-08 Chelmsford City 20:30 | Yes | Velvet Vortex (9/4) / Comedian Leader (16/1) | Comedian Leader (16/1) / Boujee Gold (15/2) | Boujee Gold (15/2) / — |
| 2025-03-10 Newcastle 17:30 | Yes | Market House (1/2) **W** / Flying Scotsman (3/1) | — / — | — / Night Bear (7/1) |
| 2025-03-10 Newcastle 18:30 | Yes | Neptune Legend (7/1) / Fistral Beach (11/2) **W** | — / — | — / Bossy Parker (5/1) |
| 2025-03-10 Newcastle 19:30 | Yes | Miakoda (17/2) / Bay Of Dreams (17/2) **W** | — / Zadkiel (11/1) | — / Zadkiel (11/1) |
| 2025-03-10 Newcastle 20:00 | Yes | Tickets (7/2) / Arc Shadowfax (11/2) | — / — | — / Beneficiary (18/1) |
| 2025-03-10 Newcastle 20:30 | Yes | Bernie The Bear (10/3) / Golden Prosperity (25/1) | — / Tommytwohoots (11/2) | — / Tommytwohoots (11/2) |
| 2025-03-11 Wolverhampton 16:30 | Yes | Ten Club (33/1) / Betweenthesticks (14/1) | Betweenthesticks (14/1) / Ten Club (33/1) | Betweenthesticks (14/1) / Ten Club (33/1) |
| 2025-03-11 Wolverhampton 17:00 | Yes | Enzos Angel (3/1) / City Escape (5/1) | — / — | — / Celebrating Ethel (20/1) |
| 2025-03-11 Wolverhampton 19:00 | Yes | Miss Billie (20/1) / Lynwood Lad (5/2) | Lynwood Lad (5/2) / My Boy Jack (12/1) | Seas Of Elzaam (5/1) / Ravenglass (9/4) **W** |
| 2025-03-11 Southwell 19:45 | Yes | Catch Cunningham (9/2) / Jungle Run (7/1) | Jungle Run (7/1) / Catch Cunningham (9/2) | Jungle Run (7/1) / Birkenhead (14/1) |
| 2025-03-11 Wolverhampton 20:00 | Yes | Big Narstie (15/8) / Alyara (15/2) | — / Coconut Bay (4/1) | Coconut Bay (4/1) / Big Narstie (15/8) |
| 2025-03-11 Southwell 20:15 | Yes | Super Hit (14/1) / Novak (13/2) | Ciotog (18/1) / One More Dream (4/1) | Ciotog (18/1) / One More Dream (4/1) |
| 2025-03-11 Wolverhampton 20:30 | Yes | Adversary (15/2) / Kaleidoscope Eyes (9/2) | Kaleidoscope Eyes (9/2) / Adversary (15/2) | Kaleidoscope Eyes (9/2) / Enchanted Way (17/2) |
| 2025-03-12 Wolverhampton 16:55 | Yes | Kings Merchant (18/5) / Almaty Star (5/1) | — / — | — / Rhythm N Hooves (4/1) |
| 2025-03-12 Newcastle 17:45 | Yes | Sibyl Charm (6/4) / Prefer The Sister (11/2) | — / One Of Our Own (28/1) | — / One Of Our Own (28/1) |
| 2025-03-12 Newcastle 19:15 | Yes | Pallas Lord (2/1) / Turbo Command (9/1) | — / — | — / Broken Spear (11/4) **W** |
| 2025-03-12 Wolverhampton 19:30 | Yes | Treasure Bay (33/1) / Kessaar Power (20/1) | Tonal (6/5) / Northbound (16/1) | Tonal (6/5) / Northbound (16/1) |
| 2025-03-12 Newcastle 19:45 | Yes | Pockley (2/1) / Latin Five (6/1) | — / Jamie Bond (9/1) | — / Jamie Bond (9/1) |
| 2025-03-12 Wolverhampton 20:00 | Yes | Bungle Bay (5/1) **W** / Al Baahy (7/2) | — / — | Al Baahy (7/2) / Bungle Bay (5/1) **W** |
| 2025-03-13 Newcastle 16:50 | Yes | Violeta (7/1) **W** / Keen Interest (11/2) | — / Rampant (7/2) | — / Dee's Dream (5/2) |
| 2025-03-13 Chelmsford City 17:05 | Yes | Safari Dream (10/3) / Kurimu (12/1) | — / Sir Maxi (2/1) **W** | — / Sir Maxi (2/1) **W** |
| 2025-03-13 Newcastle 18:00 | Yes | Cemlyn (5/1) / Frankies Dream (6/5) | — / — | Frankies Dream (6/5) / Cemlyn (5/1) |
| 2025-03-13 Chelmsford City 18:15 | Yes | Southbank (7/4) / Kodi Red (18/1) | — / Just Ten High (9/4) | — / Dion Baker (15/2) |
| 2025-03-13 Newcastle 19:00 | Yes | Vibrato (9/1) / Mereside Madness (8/1) | — / Mr Baloo (7/2) **W** | Mr Baloo (7/2) **W** / Vibrato (9/1) |
| 2025-03-13 Newcastle 19:30 | Yes | Castan (11/4) / Monks Dream (9/4) **W** | — / — | — / Zarzyni (10/1) |
| 2025-03-14 Dundalk 16:30 | Yes | Beano Power (9/2) / Crystal Luna (10/1) **W** | Crystal Luna (10/1) **W** / Beano Power (9/2) | Crystal Luna (10/1) **W** / Beano Power (9/2) |
| 2025-03-14 Dundalk 17:05 | Yes | Cousin Shay (13/2) / Comfort Line (6/1) | Comfort Line (6/1) / Cousin Shay (13/2) | Comfort Line (6/1) / Cousin Shay (13/2) |
| 2025-03-14 Dundalk 18:40 | Yes | Daonethatgotaway (4/1) / Pink Oxalis (6/1) **W** | — / Seti (7/2) | — / Seti (7/2) |
| 2025-03-14 Wolverhampton 18:50 | Yes | Himawari (28/1) / Stroxx (7/1) | — / Midnightattheoasis (6/4) **W** | — / Midnightattheoasis (6/4) **W** |
| 2025-03-14 Wolverhampton 19:50 | Yes | Port Noir (10/1) / Mr Trick (18/1) | — / — | — / City Escape (9/4) |
| 2025-03-14 Wolverhampton 20:20 | Yes | Enrolled (7/2) / Ventura Dream (10/1) | War Hawk (4/1) / Enrolled (7/2) | War Hawk (4/1) / Tuco Salamanca (7/4) **W** |
| 2025-03-15 Southwell 16:38 | Yes | One Horse Town (11/2) / Scarlet Sunset (4/1) | — / — | — / Hi Ya Mal (15/2) |
| 2025-03-15 Southwell 17:13 | Yes | Viennoise (7/2) / Gaiety Musical (9/4) | Gaiety Musical (9/4) / Viennoise (7/2) | Gaiety Musical (9/4) / Viennoise (7/2) |
| 2025-03-15 Wolverhampton 18:00 | Yes | Rosenpur (16/1) / General Assembly (6/1) **W** | — / Maharajas Express (7/2) | — / Maharajas Express (7/2) |
| 2025-03-15 Wolverhampton 18:30 | Yes | Come On John (3/1) / Palazzo Persico (12/1) | — / Init Together (7/4) | — / Percy Willis (15/2) |
| 2025-03-15 Wolverhampton 19:30 | Yes | Nordic Glory (2/1) / Coco Hill (14/1) | — / — | — / Ustath (14/1) |
| 2025-03-15 Wolverhampton 20:00 | Yes | Bay Of Dreams (4/5) / Ballarat Bertie (15/2) **W** | — / — | — / Herkeios (9/1) |
| 2025-03-15 Wolverhampton 20:30 | Yes | National Health (15/8) / Two Plus Two (7/2) | — / Walk The Moon (7/2) | — / Walk The Moon (7/2) |
| 2025-03-17 Wolverhampton 16:27 | Yes | Enthused (18/1) / Paradoxical (11/4) **W** | Paradoxical (11/4) **W** / Kingdom Of Time (16/5) | Kingdom Of Time (16/5) / — |
| 2025-03-17 Wolverhampton 17:00 | Yes | Second Collection (7/2) / Kipp Kelly (6/1) | — / Bankrupt (10/3) | — / Bankrupt (10/3) |
| 2025-03-17 Wolverhampton 18:30 | Yes | South Dakota Sioux (9/4) / Lequinto (11/2) | — / Ash Wednesday (9/5) **W** | — / Ash Wednesday (9/5) **W** |
| 2025-03-17 Wolverhampton 19:00 | Yes | Kensington Agent (16/5) **W** / Beauzon (6/1) | — / Francisco (4/1) | — / Francisco (4/1) |
| 2025-03-17 Wolverhampton 19:30 | Yes | Bear Baby (40/1) / Top Of Pleinmont (7/1) | Captain Brett (11/4) / Ta Craic Ann (10/1) | Captain Brett (11/4) / Currahee (15/2) |
| 2025-03-17 Wolverhampton 20:00 | Yes | Quick Away (2/1) **W** / Brinton (5/1) | — / Danehill Star (9/2) | — / Danehill Star (9/2) |
| 2025-03-17 Wolverhampton 20:30 | Yes | Zumaaty (9/1) / Alice's Impact (13/2) **W** | — / — | Alice's Impact (13/2) **W** / Zumaaty (9/1) |
| 2025-03-18 Wolverhampton 17:25 | Yes | Apache Star (2/1) / Under Curfew (15/8) | — / — | Under Curfew (15/8) / Apache Star (2/1) |
| 2025-03-18 Wolverhampton 18:30 | Yes | Ravenglass (6/1) / Till It Shines (9/1) | — / Galileo Glass (20/1) | — / Galileo Glass (20/1) |
| 2025-03-18 Wolverhampton 19:00 | Yes | Pessoa (3/1) **W** / Match Anthem (3/1) | — / Pembrokeshire (7/1) | Sam's Hope (13/2) / Pembrokeshire (7/1) |
| 2025-03-18 Wolverhampton 19:30 | Yes | Mariner (10/3) / Charlatan (9/2) | — / Tambourine Dream (28/1) | Tambourine Dream (28/1) / Mariner (10/3) |
| 2025-03-18 Wolverhampton 20:30 | Yes | Forest Spirit (11/10) **W** / Starfighter (9/1) | Harry The Haggler (4/1) / Forest Spirit (11/10) **W** | Harry The Haggler (4/1) / Forest Spirit (11/10) **W** |
| 2025-03-19 Southwell 16:52 | Yes | Early Release (4/1) / Blinky (8/1) **W** | — / Captain Kinsella (7/2) | Captain Kinsella (7/2) / Early Release (4/1) |
| 2025-03-19 Southwell 17:25 | Yes | Caballo De Mar (10/11) **W** / Sun Dancer Girl (10/1) | — / Con Te Partiro (17/2) | Swinging London (7/1) / Caballo De Mar (10/11) **W** |
| 2025-03-19 Southwell 18:00 | Yes | Gozo (3/1) / Ocean Heights (28/1) | Tortured Soul (7/4) / Gozo (3/1) | Tortured Soul (7/4) / Without Compromise (10/1) |
| 2025-03-19 Southwell 18:30 | Yes | Sovereign Sea (3/1) / Cracking Gold (11/4) **W** | — / Barnaby (10/1) | Barnaby (10/1) / — |
| 2025-03-20 Newcastle 17:30 | Yes | Asgard's Captain (11/4) / Value Added (125/1) | — / Beraz (5/2) | — / Midnight Lion (15/2) **W** |
| 2025-03-20 Newcastle 19:00 | Yes | Miss Attitude (3/1) / Fahrenheit Seven (7/1) | — / — | — / Bergerac (7/2) |
| 2025-03-20 Newcastle 20:00 | Yes | Korroor (5/4) **W** / My Boy Jack (9/1) | — / Blackcurrent (5/1) | — / Blackcurrent (5/1) |
| 2025-03-21 Southwell 18:00 | Yes | It's Tim (66/1) / First Greyed (15/8) **W** | King Of York (2/1) / — | King Of York (2/1) / — |
| 2025-03-21 Dundalk 18:15 | Yes | Tam Lin (4/1) / Brigid's Cloak (7/2) | Merchants Arch (4/1) / — | Merchants Arch (4/1) / — |
| 2025-03-21 Southwell 19:00 | Yes | Legal Reform (2/1) / Aquacell (16/5) | — / Silver Samurai (11/2) | — / Silver Samurai (11/2) |
| 2025-03-21 Dundalk 19:15 | Yes | Ferrari Desert (7/1) / Miss Abby Jools (7/1) | — / — | — / Harry The Rogue (7/2) |
| 2025-03-21 Dundalk 19:45 | Yes | Not Just Any Eagle (14/1) / Tribal Star (7/1) | Tribal Star (7/1) / Genoah (7/2) | Tribal Star (7/1) / Genoah (7/2) |
| 2025-03-21 Southwell 20:00 | Yes | Kitten's Dream (125/1) / Scylla (22/1) | Scylla (22/1) / Fiftyshadesaresdev (6/1) | Freewheelin (40/1) / Fiftyshadesaresdev (6/1) |
| 2025-03-22 Wolverhampton 16:18 | Yes | Mamdoh (2/1) / Prince Hector (5/1) | — / — | — / Abstract (40/1) |
| 2025-03-22 Wolverhampton 17:28 | Yes | Kinetic (6/1) / Bajan Blue (11/4) | — / Aiming High (2/1) **W** | — / Aiming High (2/1) **W** |
| 2025-03-22 Newcastle 17:45 | Yes | Pallas Lord (10/3) / Too Much (9/2) | — / — | — / Broken Spear (4/1) |
| 2025-03-22 Newcastle 18:45 | Yes | Miakoda (6/1) **W** / Falaise Blanc (10/1) | — / Triple Wishes (14/1) | — / Triple Wishes (14/1) |
| 2025-03-22 Wolverhampton 19:00 | Yes | Kathleen's Glory (9/2) / Party Bear (13/2) **W** | — / Beta Reader (11/4) | — / Beta Reader (11/4) |
| 2025-03-22 Newcastle 19:15 | Yes | Rebecca's Girl (3/1) / Lord Abama (9/2) **W** | Lord Abama (9/2) **W** / Rebecca's Girl (3/1) | Lord Abama (9/2) **W** / Rebecca's Girl (3/1) |
| 2025-03-22 Wolverhampton 19:30 | Yes | I Can't Believe (11/2) / It's A Love Thing (11/2) **W** | — / Mr Nugget (5/1) | — / Mr Nugget (5/1) |
| 2025-03-22 Newcastle 19:45 | Yes | Marcello Si (7/1) / Two B Tanned (14/1) | Tantomile (9/2) / Marcello Si (7/1) | Tantomile (9/2) / Marcello Si (7/1) |
| 2025-03-22 Newcastle 20:15 | Yes | Above (4/1) **W** / Fierce (14/1) | — / Dark Kestrel (9/2) | — / Dark Kestrel (9/2) |
| 2025-03-24 Lingfield 14:17 | Yes | Crafter (16/5) / Prince Rasam (4/1) | Prince Rasam (4/1) / Newfangled (11/2) | Prince Rasam (4/1) / Newfangled (11/2) |
| 2025-03-24 Lingfield 15:17 | Yes | Ya Rayah (6/1) / Royal Jet (17/2) | — / — | Royal Jet (17/2) / Ya Rayah (6/1) |
| 2025-03-24 Lingfield 16:47 | Yes | Honrado (9/2) / Walk The Moon (11/1) | National Health (12/1) / — | National Health (12/1) / Foinix (13/2) |
| 2025-03-24 Lingfield 17:17 | Yes | Venus Slipper (17/2) / Danehill Star (9/2) | Danehill Star (9/2) / Venus Slipper (17/2) | Danehill Star (9/2) / Poles Apart (5/1) |
| 2025-03-24 Lingfield 17:47 | Yes | Vitruvian Dawn (80/1) / Sir Laurence Graff (7/2) | Sir Laurence Graff (7/2) / Big Narstie (14/1) | Sir Laurence Graff (7/2) / Big Narstie (14/1) |
| 2025-03-24 Wolverhampton 18:00 | Yes | Green Team (9/4) **W** / Wannabe Brave (9/2) | Wannabe Brave (9/2) / Green Team (9/4) **W** | Wannabe Brave (9/2) / Show No Fear (10/3) |
| 2025-03-24 Wolverhampton 19:00 | Yes | Ash Wednesday (5/2) **W** / Straight A (7/2) | — / City Cyclone (17/2) | — / City Cyclone (17/2) |
| 2025-03-24 Wolverhampton 19:30 | Yes | Ziggy's Condor (4/1) / Supreme King (9/2) | Supreme King (9/2) / Ziggy's Condor (4/1) | Supreme King (9/2) / Twilight Romance (9/2) |
| 2025-03-24 Wolverhampton 20:30 | Yes | Mr Baloo (13/8) **W** / How's The Guvnor (12/1) | — / Paradoxical (3/1) | Paradoxical (3/1) / Mr Baloo (13/8) **W** |
| 2025-03-25 Newcastle 17:45 | Yes | Market House (5/2) / Alex The Great (9/4) | — / — | Alex The Great (9/4) / Val Bassett (5/1) |
| 2025-03-26 Kempton 19:30 | Yes | Spirit Lead Me (11/1) / Sweet Fantastic (10/3) | Sweet Fantastic (10/3) / Spirit Lead Me (11/1) | Sweet Fantastic (10/3) / Invited (4/1) **W** |
| 2025-03-26 Kempton 20:30 | Yes | Legacy Power (6/5) / Donald Llewellyn (15/2) | Grey Fox (7/2) **W** / Doublethetrouble (14/1) | Doublethetrouble (14/1) / Grey Fox (7/2) **W** |
| 2025-03-27 Wolverhampton 14:20 | Yes | Infantry Officer (1/4) **W** / Eva's Eyes (10/1) | Eva's Eyes (10/1) / Infantry Officer (1/4) **W** | Eva's Eyes (10/1) / Infantry Officer (1/4) **W** |
| 2025-03-27 Wolverhampton 15:20 | Yes | Media Mogul (85/40) **W** / Come On John (7/2) | Come On John (7/2) / Media Mogul (85/40) **W** | Upepo (15/2) / It's A Love Thing (13/8) |
| 2025-03-27 Wolverhampton 15:50 | Yes | My Turn Now (6/1) / The Cola Kid (11/2) | — / Coco Hill (9/1) | Second Collection (17/2) / My Turn Now (6/1) |
| 2025-03-27 Wolverhampton 16:25 | Yes | Nordic Glory (9/2) **W** / Himawari (33/1) | Himawari (33/1) / Nordic Glory (9/2) **W** | Himawari (33/1) / Nordic Glory (9/2) **W** |
| 2025-03-27 Wolverhampton 17:00 | Yes | Pessoa (2/1) / Absolutely Not (11/1) | — / Port Noir (5/1) | — / Port Noir (5/1) |
| 2025-03-27 Chelmsford City 17:30 | Yes | Star Legend (3/1) **W** / Blue Sky Boy (2/1) | Blue Sky Boy (2/1) / Payment Plan (7/2) | Blue Sky Boy (2/1) / Payment Plan (7/2) |
| 2025-03-27 Wolverhampton 17:35 | Yes | Boujee Gold (12/1) / Tactical Control (6/1) | — / L'immortale (11/8) | Ravenglass (10/3) / L'immortale (11/8) |
| 2025-03-27 Chelmsford City 18:00 | Yes | Watkins (9/1) / Off The Bench (11/2) | — / Dark Sorceress (10/3) **W** | One For Harvey (11/2) / Watkins (9/1) |
| 2025-03-27 Chelmsford City 19:30 | Yes | Once Adaay (5/1) / Kracking (10/3) | Kracking (10/3) / Kondratiev Wave (7/1) | Kracking (10/3) / Kondratiev Wave (7/1) |
| 2025-03-27 Chelmsford City 20:00 | Yes | Where's Freddy (5/2) / Benacre (7/2) | Benacre (7/2) / Where's Freddy (5/2) | Benacre (7/2) / Lady Flora (25/1) |
| 2025-03-28 Lingfield 14:52 | Yes | Francis Drake (3/1) / Hidden Verse (4/1) | — / — | — / Private Island (7/2) **W** |
| 2025-03-28 Southwell 16:40 | Yes | Blue Force (13/2) **W** / Nelson Gay (11/2) | — / — | Nelson Gay (11/2) / Blue Force (13/2) **W** |
| 2025-03-28 Lingfield 17:07 | Yes | Combustion (11/10) **W** / Piperstown (4/1) | — / Agent Mayfair (15/2) | Agent Mayfair (15/2) / Combustion (11/10) **W** |
| 2025-03-28 Lingfield 17:37 | Yes | Diamondonthehill (11/2) / Batal Dubai (3/1) | — / Lerwick (10/1) | — / Lerwick (10/1) |
| 2025-03-28 Dundalk 18:30 | Yes | Makaiah (14/1) / Pegasus Of Harry (40/1) | Billie Frechette (7/4) **W** / Makaiah (14/1) | Billie Frechette (7/4) **W** / Makaiah (14/1) |
| 2025-03-28 Southwell 18:45 | Yes | Waleyfa (7/2) / King Of York (2/1) | — / — | King Of York (2/1) / Waleyfa (7/2) |
| 2025-03-28 Southwell 19:45 | Yes | American Star (22/1) / Fifty Sent (4/1) | Fifty Sent (4/1) / Match Anthem (10/3) | Thanks Dad (8/1) **W** / — |
| 2025-03-28 Southwell 20:15 | Yes | Twilight Diamond (9/2) / Commander Of Life (5/1) | Commander Of Life (5/1) / Twilight Diamond (9/2) | Commander Of Life (5/1) / One More Dream (13/2) |
| 2025-03-28 Dundalk 20:30 | Yes | Tyder (7/1) / Wrecking Ball Paul (14/1) | Wrecking Ball Paul (14/1) / Chopsticks (2/1) | Chopsticks (2/1) / Villemacho (15/2) |
| 2025-03-29 Kempton 14:05 | Yes | Kamboo (2/1) / Tritonic (33/1) | Who's Glen (11/4) / Kamboo (2/1) | Who's Glen (11/4) / Kamboo (2/1) |
| 2025-03-29 Kempton 17:00 | Yes | Walbank (14/1) / Cajetan (13/2) | — / — | — / Ararat (40/1) |
| 2025-03-29 Kempton 17:35 | Yes | Knockbrex (9/2) / Arqoob (9/1) **W** | Java Raja (9/4) / Aiming High (8/1) | Java Raja (9/4) / Aiming High (8/1) |
| 2025-03-29 Newcastle 19:30 | Yes | Saxonia (4/1) / Hot To Dot (8/1) | — / Tuco Salamanca (5/6) **W** | — / Tuco Salamanca (5/6) **W** |
| 2025-03-29 Newcastle 20:30 | Yes | Roaring Ralph (11/2) / King's School (9/1) | — / — | — / Tomorrow Day (6/1) |
| 2025-03-31 Wolverhampton 15:55 | Yes | Kurimu (13/2) / Under Curfew (16/1) | Under Curfew (16/1) / Kurimu (13/2) | Alafdhal (4/1) / — |
| 2025-03-31 Wolverhampton 17:00 | Yes | Star Pupil (4/1) **W** / Ciotog (22/1) | — / Tea Sea (7/2) | — / Pursuit Of Truth (15/8) |
| 2025-03-31 Wolverhampton 17:30 | Yes | Mr Baloo (11/8) **W** / Perfectly Timed (14/1) | — / Eagle Day (11/1) | — / Eagle Day (11/1) |
| 2025-03-31 Wolverhampton 18:00 | Yes | Telecommunication (6/5) / Pine Cliffs (11/1) | Pink Petunia (7/1) / Telecommunication (6/5) | Pink Petunia (7/1) / Antelope (8/1) |
| 2025-03-31 Wolverhampton 19:00 | Yes | Big Narstie (11/2) / King of The Dance (11/5) | — / Hawajes (16/1) | — / We'renotreallyhere (17/2) |
| 2025-03-31 Wolverhampton 19:30 | Yes | You Are Everything (8/1) / Comedian Leader (3/1) | Comedian Leader (3/1) / Sir Laurence Graff (5/1) | Comedian Leader (3/1) / Star Of Atlantis (9/1) |
| 2025-04-01 Lingfield 14:02 | Yes | Willow's Kiss (12/1) / Daisy Roots (6/4) | — / Help Me Rhonda (7/2) | Help Me Rhonda (7/2) / Willow's Kiss (12/1) |
| 2025-04-01 Lingfield 14:38 | Yes | Dance Time (5/1) **W** / Upepo (7/2) | — / Wannabe Brave (10/3) | Wannabe Brave (10/3) / Dance Time (5/1) **W** |
| 2025-04-01 Lingfield 15:48 | Yes | Robbo (9/2) / Urban Sprawl (2/1) **W** | Urban Sprawl (2/1) **W** / Robbo (9/2) | Urban Sprawl (2/1) **W** / Enpassant (16/1) |
| 2025-04-01 Lingfield 16:20 | Yes | Midnightattheoasis (7/5) **W** / Recon Mission (7/1) | — / — | — / The Defiant (15/2) |
| 2025-04-01 Wolverhampton 16:25 | Yes | Douglas Dc (15/2) / Marinakis (11/4) | Avarice (6/1) / Douglas Dc (15/2) | Avarice (6/1) / Douglas Dc (15/2) |
| 2025-04-01 Wolverhampton 18:00 | Yes | Jungle Land (5/4) / Mumayaz (12/1) | — / Giant (4/1) | — / Giant (4/1) |
| 2025-04-01 Wolverhampton 18:30 | Yes | Nad Alshiba Rain (7/1) / The Thames Lady (10/1) | — / Kiss Me My Love (11/4) | — / Kiss Me My Love (11/4) |
| 2025-04-02 Southwell 15:55 | Yes | Best Adventure (13/2) / West Tyrone (5/1) | — / Tuco Salamanca (4/5) | Tuco Salamanca (4/5) / — |
| 2025-04-02 Southwell 17:00 | Yes | Margot Robbie (3/1) / Bandello (22/1) | — / Fistral Beach (3/1) | — / Fistral Beach (3/1) |
| 2025-04-02 Southwell 18:00 | Yes | Oriental Prince (4/6) **W** / Lequinto (14/1) | — / Safari Dream (11/2) | — / Safari Dream (11/2) |
| 2025-04-02 Southwell 19:30 | Yes | Spartan Times (7/1) / Fiftyshadesaresdev (10/3) | — / Yakhabar (14/1) | — / Typewritten (22/1) |
| 2025-04-03 Chelmsford City 16:25 | Yes | Foinix (9/1) / Global Resolve (4/1) | — / Cryptos Dream (6/1) | — / Cryptos Dream (6/1) |
| 2025-04-03 Chelmsford City 18:00 | Yes | Sir Rodneyredblood (6/1) / Southbank (7/2) | Southbank (7/2) / Sir Rodneyredblood (6/1) | Southbank (7/2) / Sir Rodneyredblood (6/1) |
| 2025-04-03 Chelmsford City 19:00 | Yes | G'daay (3/1) / Nammos (11/4) | — / — | — / Super Hit (6/1) |
| 2025-04-04 Dundalk 17:12 | Yes | Villemacho (8/1) / Rattletheonionbag (3/1) | — / — | Rattletheonionbag (3/1) / Villemacho (8/1) |
| 2025-04-04 Southwell 17:55 | Yes | Las Ramblas (4/1) / Overnight Oats (5/1) | Overnight Oats (5/1) / Kingdom Of Time (9/2) | Bajan Bandit (6/1) / Narmar (9/1) |
| 2025-04-04 Dundalk 19:15 | Yes | Numidia (18/1) / Gracesolution (14/1) | Beauparc (10/11) **W** / Dromore Glory (3/1) | Beauparc (10/11) **W** / Dromore Glory (3/1) |
| 2025-04-04 Southwell 19:30 | Yes | Thunderous Love (20/1) **W** / Port Hedland (4/1) | Port Hedland (4/1) / Arlington (13/2) | Port Hedland (4/1) / Asadjumeirah (7/2) |
| 2025-04-05 Wolverhampton 17:15 | Yes | Last Shamardal (17/2) **W** / Amor Cordis (40/1) | Invincible Melody (3/1) / Sabrimento (15/2) | Invincible Melody (3/1) / Sabrimento (15/2) |
| 2025-04-05 Wolverhampton 17:45 | Yes | Desert Champion (3/1) / Megaphone (7/4) | — / — | — / Ruby's Profit (5/2) **W** |
| 2025-04-05 Wolverhampton 19:15 | Yes | Zooks (5/2) / Alioski (13/2) | — / Fine Print (5/2) **W** | Bella Bluesky (8/1) / Zooks (5/2) |
| 2025-04-06 Southwell 15:20 | Yes | Cinque Verde (20/1) / Rhythm N Hooves (10/1) | Moulin Booj (7/1) / Cinque Verde (20/1) | Moulin Booj (7/1) / Almaty Star (5/1) |
| 2025-04-06 Southwell 15:55 | Yes | Ferrous (9/2) **W** / Shartash (14/1) | — / Wiltshire (6/1) | Wiltshire (6/1) / Ferrous (9/2) **W** |
| 2025-04-07 Wolverhampton 14:05 | Yes | Watermelon Sugar (10/1) / Aces Wild (5/2) | Aces Wild (5/2) / Phoenix Beach (10/1) **W** | Phoenix Beach (10/1) **W** / — |
| 2025-04-07 Wolverhampton 15:35 | Yes | Forest Spirit (4/1) / Banderas (10/3) | Standbackandlook (11/2) / Forest Spirit (4/1) | Standbackandlook (11/2) / Liberated Lad (7/1) |
| 2025-04-07 Wolverhampton 16:05 | Yes | River Alwen (11/4) / Dash Power (12/1) | — / — | — / Port Noir (4/1) |
| 2025-04-07 Wolverhampton 16:35 | Yes | Cryptos Dream (7/2) / Sir Laurence Graff (15/2) | Sir Laurence Graff (15/2) / The Pug (10/3) | Sir Laurence Graff (15/2) / The Pug (10/3) |
| 2025-04-07 Wolverhampton 17:10 | Yes | Saffredi (9/1) **W** / White Umbrella (9/1) | — / — | — / Autumn Angel (12/1) |
| 2025-04-07 Kempton 18:00 | Yes | Al Ameen (11/4) **W** / Berry Clever (17/2) | Berry Clever (17/2) / Al Ameen (11/4) **W** | Berry Clever (17/2) / Al Ameen (11/4) **W** |
| 2025-04-07 Kempton 18:30 | Yes | Tattie Bogle (25/1) / Noble Victory (5/1) | — / — | Proudly Yours (33/1) / The Flying Seagull (7/1) |
| 2025-04-07 Kempton 19:00 | Yes | Robusto (5/1) / Hebridean Nomad (5/2) | Hebridean Nomad (5/2) / Rogue Tornado (4/1) | Zoran (11/2) / — |
| 2025-04-07 Kempton 19:30 | Yes | Solanna (4/1) / Egoiste (4/1) **W** | Egoiste (4/1) **W** / Foreseen (5/1) | Foreseen (5/1) / — |
| 2025-04-08 Southwell 16:27 | Yes | Ana Emaraaty (7/1) **W** / Lednikov (15/2) | — / — | — / This Time Maybe (15/2) |
| 2025-04-08 Southwell 18:00 | Yes | Art Patron (16/1) / Party Bear (3/1) **W** | — / Veraison (5/1) | Veraison (5/1) / Eliza Bennet (13/2) |
| 2025-04-09 Kempton 19:10 | Yes | Justenzia (7/2) / Staffordshire (15/2) | — / — | West Wickham (13/2) / Justenzia (7/2) |
| 2025-04-10 Newcastle 16:00 | Yes | Sea Legend (4/1) / King Chaos (13/8) | King Chaos (13/8) / Ninth Life (10/1) | Ninth Life (10/1) / — |
| 2025-04-10 Lingfield 16:18 | Yes | Ancient State (13/2) / Royal Accord (15/8) **W** | Woodhay Whisper (9/2) / — | Woodhay Whisper (9/2) / She's A Dark Horse (18/1) |
| 2025-04-10 Lingfield 16:53 | Yes | Backer Bilk (3/1) / Eva Dickson (5/1) | Eva Dickson (5/1) / Backer Bilk (3/1) | Eva Dickson (5/1) / Backer Bilk (3/1) |
| 2025-04-10 Newcastle 18:00 | Yes | Gressington (8/1) / Jungle Land (10/3) | Jungle Land (10/3) / Gressington (8/1) | Jungle Land (10/3) / Gressington (8/1) |
| 2025-04-11 Dundalk 17:00 | Yes | She's Smart (8/1) / Carrigans Grove (16/1) **W** | — / — | — / Beano Power (5/1) |
| 2025-04-15 Kempton 17:00 | Yes | Dream Pirate (9/2) / Ciotog (17/2) | — / — | Newfangled (7/2) / Dream Pirate (9/2) |
| 2025-04-15 Kempton 17:30 | Yes | Calanthe (3/1) / The Spotlight Kid (7/2) | — / — | — / Drumstick (3/1) |
| 2025-04-15 Kempton 18:00 | Yes | Invincible Melody (2/1) / Jersey Maverick (28/1) | — / Knights Gold (4/1) **W** | — / Knights Gold (4/1) **W** |
| 2025-04-18 Lingfield 12:30 | Yes | High Court Judge (25/1) / Sun Dancer Girl (22/1) | — / Obsidian Knight (20/1) **W** | Tortured Soul (7/1) / Shahbaz (9/2) |
| 2025-04-18 Chelmsford City 12:40 | Yes | Nogo's Dream (4/1) **W** / Charlie Mason (6/1) | — / — | Dicko The Legend (7/2) / — |
| 2025-04-18 Newcastle 12:50 | Yes | Berkshire Whisper (9/2) **W** / Hello Zaman (6/1) | — / Carbine Harvester (14/1) | Humam (11/2) / Carbine Harvester (14/1) |
| 2025-04-18 Newcastle 13:25 | Yes | Cloud Cover (11/8) / Quandary (11/2) | — / Shallow (17/2) | — / Shallow (17/2) |
| 2025-04-18 Lingfield 13:40 | Yes | Legal Reform (16/1) / Dragon Icon (3/1) | — / — | Blue Prince (9/2) / Legal Reform (16/1) |
| 2025-04-18 Newcastle 14:00 | Yes | Roi De France (4/1) / Destructive (8/1) | — / — | Destructive (8/1) / Roi De France (4/1) |
| 2025-04-18 Lingfield 14:15 | Yes | Cajetan (5/1) / Silky Wilkie (10/3) | — / Diamondonthehill (7/1) | — / Diamondonthehill (7/1) |
| 2025-04-18 Chelmsford City 14:25 | Yes | Enpassant (9/1) / Dark Dreamer (20/1) | — / Kondratiev Wave (9/2) | Kondratiev Wave (9/2) / Enpassant (9/1) |
| 2025-04-18 Chelmsford City 15:00 | Yes | Steel Tiger (7/1) **W** / Don Simon (9/2) | Cello (13/2) / — | Cello (13/2) / — |
| 2025-04-18 Newcastle 15:07 | Yes | Old Harrovian (6/4) / Charlotte's Web (10/1) | — / Glen Buck (4/1) | — / Paradias (28/1) |
| 2025-04-18 Lingfield 15:20 | Yes | Dance Time (14/1) / Optician (18/1) | — / Rogue Tornado (8/1) | Rogue Tornado (8/1) / Dance Time (14/1) |
| 2025-04-18 Lingfield 15:50 | Yes | Soldiers Star (14/1) / Backspin (5/2) | Backspin (5/2) / Soldiers Star (14/1) | Backspin (5/2) / Coul Angel (9/2) |
| 2025-04-18 Chelmsford City 16:00 | Yes | Star Pupil (4/1) / Westernesse (12/1) | — / — | — / Midnight's Dream (16/1) |
| 2025-04-18 Chelmsford City 16:30 | Yes | Notimeforchitchat (11/4) / Caspian King (11/2) | — / Cristo (10/3) **W** | — / Cristo (10/3) **W** |
| 2025-04-19 Wolverhampton 16:20 | Yes | Billy McGarry (7/2) / Northbound (16/1) **W** | — / Dappled Light (4/1) | — / Dappled Light (4/1) |
| 2025-04-19 Wolverhampton 18:00 | Yes | Romantic Spirit (6/5) **W** / I'll Give It A Go (7/1) | — / Zaraquelle (3/1) | Magic Runner (4/1) / Romantic Spirit (6/5) **W** |
| 2025-04-19 Wolverhampton 18:30 | Yes | Slowdownbarney (4/5) / Laser Focus (16/1) | — / Emaculate Soldier (9/1) | Emaculate Soldier (9/1) / Slowdownbarney (4/5) |
| 2025-04-19 Wolverhampton 19:00 | Yes | Aljezur (7/1) / Kensington Agent (15/2) | Kensington Agent (15/2) / Saffredi (4/1) | Kensington Agent (15/2) / Saffredi (4/1) |
| 2025-04-20 Southwell 13:42 | Yes | Eva Rosie (10/3) **W** / Sunset In Paris (15/2) | — / — | L'immortale (11/5) / — |
| 2025-04-20 Southwell 14:17 | Yes | Lhebayeb (17/2) / The Pug (7/1) | The Ormer Gatherer (8/1) / — | The Ormer Gatherer (8/1) / Trusty Scout (11/1) |
| 2025-04-20 Southwell 15:27 | Yes | Threatening (6/4) **W** / Enchanted Way (11/2) | Enchanted Way (11/2) / Threatening (6/4) **W** | Enchanted Way (11/2) / We've Got This (16/1) |
| 2025-04-20 Southwell 16:02 | Yes | Aspire To Glory (8/1) / Lady In Havana (10/1) | — / — | — / Arc Shadowfax (6/1) |
| 2025-04-21 Wolverhampton 13:10 | Yes | Moon Over The Sea (11/2) / Boasty (11/2) | Boasty (11/2) / Moon Over The Sea (11/2) | Boasty (11/2) / Bella Veneta (11/2) |
| 2025-04-21 Wolverhampton 13:45 | Yes | Ballarat Bertie (9/2) / Captious Cantor (40/1) | — / Lady Mary (14/1) | Lady Mary (14/1) / Ballarat Bertie (9/2) |
| 2025-04-21 Kempton 14:30 | Yes | Sky Safari (13/8) **W** / Top Of The Class (5/2) | — / — | — / More Than A Feelin (10/1) |
| 2025-04-21 Wolverhampton 14:55 | Yes | Reigning Profit (6/4) / Recon Mission (9/1) | — / Rosenpur (7/1) **W** | — / Rosenpur (7/1) **W** |
| 2025-04-21 Kempton 15:05 | Yes | Follow Your Heart (17/2) / Kitaro Kich (14/1) | Ahlain (9/2) / Follow Your Heart (17/2) | Supreme King (15/2) / Ahlain (9/2) |
| 2025-04-21 Wolverhampton 15:30 | Yes | Fistral Beach (10/3) **W** / Monsieur Fantaisie (8/1) | — / Ravenglass (13/2) | — / Bold Suitor (15/8) |
| 2025-04-21 Wolverhampton 16:45 | Yes | Danehill Star (6/1) **W** / Strategic Fortune (13/2) | — / — | — / Port Noir (9/1) |
| 2025-04-23 Lingfield 16:50 | Yes | Golden Dove (10/3) / Naasma (7/4) | Kinetic (5/1) **W** / Cerulean Summer (4/1) | Cerulean Summer (4/1) / Kinetic (5/1) **W** |
| 2025-04-24 Chelmsford City 17:55 | Yes | Flag Of St George (9/4) / Rich Rhythm (15/2) **W** | — / G'daay (7/1) | — / G'daay (7/1) |
| 2025-04-24 Chelmsford City 18:25 | Yes | Scarlet Lady (22/1) / Stacey Racey (17/2) | Overlooked (11/4) / — | Overlooked (11/4) / — |
| 2025-04-24 Chelmsford City 18:55 | Yes | National Health (11/2) / Forglen (11/4) | — / — | — / Yakhabar (6/1) |
| 2025-04-24 Chelmsford City 19:25 | Yes | Hala Joza (10/3) / Castellina (6/1) | — / Woodhay Whisper (11/4) **W** | Woodhay Whisper (11/4) **W** / Hala Joza (10/3) |
| 2025-04-26 Wolverhampton 19:45 | Yes | Riyadh Gem (5/4) **W** / Zizi (12/1) | — / — | — / Crackalackin (13/2) |
| 2025-04-27 Southwell 14:15 | Yes | How Impressive (15/2) / Drifts Away (10/3) | Quandary (15/2) / How Impressive (15/2) | Quandary (15/2) / King Of Ithaca (13/2) |
| 2025-04-27 Southwell 16:45 | Yes | Handcuffed (14/1) / Noble Victory (7/1) | — / Hammer The Hammer (7/2) **W** | — / Hammer The Hammer (7/2) **W** |
| 2025-04-27 Southwell 17:45 | Yes | Wahraan (20/1) / Manxman (4/1) | Manxman (4/1) / Charging Thunder (4/1) | Heathen (16/1) / — |
| 2025-04-28 Lingfield 14:15 | Yes | Rockit Tommy (20/1) / Surrey Fire (7/4) | Surrey Fire (7/4) / Kitty Furnival (11/4) | Surrey Fire (7/4) / Kitty Furnival (11/4) |
| 2025-04-28 Wolverhampton 16:50 | Yes | Faster Bee (14/1) / Annalee Lass (6/1) | — / — | — / Trusty Scout (15/2) |
| 2025-04-28 Wolverhampton 17:50 | Yes | I Follow Rivers (5/6) **W** / California Fling (25/1) | — / Kilteel (4/1) | — / Kilteel (4/1) |
| 2025-04-29 Wolverhampton 18:00 | Yes | Angle Land (3/1) / Rebel Star (9/4) | — / — | — / Moe's Legacy (12/1) |
| 2025-04-29 Wolverhampton 19:00 | Yes | Emaculate Soldier (7/2) **W** / Zooks (4/1) | — / — | — / Corsican Caper (17/2) |
| 2025-04-30 Southwell 16:05 | Yes | Chillhi (7/1) / An Bradan Feasa (6/5) | — / — | — / Persian Phoenix (11/1) |
| 2025-04-30 Southwell 17:10 | Yes | Desiderata (7/1) / This Time Maybe (7/2) | — / — | Disquietude (28/1) / Lednikov (5/1) |
| 2025-04-30 Southwell 18:10 | Yes | Brinton (4/1) / Ya Rayah (17/2) | — / Quick Away (9/2) | — / Copper Mountain (10/1) |
| 2025-04-30 Southwell 19:10 | Yes | Adversary (6/1) / Classic Cause (10/3) | — / Yorkshire Myth (11/1) | — / Dovey Moon (4/1) |
| 2025-05-01 Southwell 16:20 | Yes | Filly One (10/1) **W** / Charlie Mason (16/5) | — / — | Charlie Mason (16/5) / Hierarchy (9/4) |
| 2025-05-01 Chelmsford City 17:45 | Yes | It's Tim (10/11) **W** / Drouthy Neebor (2/1) | — / Forglen (5/1) | Foinix (18/1) / It's Tim (10/11) **W** |
| 2025-05-01 Chelmsford City 19:15 | Yes | Noble Consort (1/2) **W** / Sir Rodneyredblood (25/1) | — / Dark Side Prince (8/1) | — / Dark Side Prince (8/1) |
| 2025-05-01 Chelmsford City 19:45 | Yes | Big Gypsy King (5/2) **W** / Aim For The Bull (3/1) | Kilteel (4/1) / — | Kilteel (4/1) / — |
| 2025-05-02 Newcastle 18:20 | Yes | Westernesse (10/1) / Savvy Kingdom (9/1) **W** | Mr Mistoffelees (7/4) / Clear Angel (4/1) | Mr Mistoffelees (7/4) / Hale End (10/1) |
| 2025-05-02 Newcastle 19:30 | Yes | Madame Plaintiff (17/2) / Harry Magnus (17/2) | — / — | — / Cuban Fiesta (3/1) **W** |
| 2025-05-02 Newcastle 20:00 | Yes | The Gay Blade (11/2) / Asadjumeirah (5/2) | Asadjumeirah (5/2) / The Gay Blade (11/2) | Asadjumeirah (5/2) / The Gay Blade (11/2) |
| 2025-05-05 Kempton 13:35 | Yes | I Follow Rivers (3/1) **W** / Amber Honey (22/1) | — / Big Gypsy King (1/2) | — / Big Gypsy King (1/2) |
| 2025-05-05 Kempton 14:10 | Yes | Persian Spirit (9/1) **W** / Shallow (9/2) | Scattering Light (16/1) / Persian Spirit (9/1) **W** | Scattering Light (16/1) / Persian Spirit (9/1) **W** |
| 2025-05-05 Kempton 14:45 | Yes | Umbria (11/4) / Elterwater (7/1) | Elterwater (7/1) / Umbria (11/4) | Charmaine (10/3) **W** / — |
| 2025-05-05 Kempton 15:20 | Yes | Telepathic (10/3) / The New Bay Pearl (22/1) | — / Pietro (2/1) | — / Pietro (2/1) |
| 2025-05-05 Kempton 15:55 | Yes | Saxonia (3/1) / Bintshuaa (22/1) | — / — | — / Orchard (13/8) **W** |
| 2025-05-05 Kempton 16:30 | Yes | Havana Touch (5/2) **W** / The Spotlight Kid (11/2) | The Spotlight Kid (11/2) / Royal Jet (11/1) | Royal Jet (11/1) / — |
| 2025-05-06 Wolverhampton 18:30 | Yes | Yellow Card (15/8) **W** / Crackalackin (13/2) | Romantic Spirit (4/1) / — | Romantic Spirit (4/1) / Hock Eye The Noo (16/1) |
| 2025-05-06 Wolverhampton 19:00 | Yes | Snow Creek (9/2) / Take The Boat (3/1) | Take The Boat (3/1) / Snow Creek (9/2) | Take The Boat (3/1) / Snow Creek (9/2) |
| 2025-05-06 Wolverhampton 19:30 | Yes | Boujee Gold (9/1) / Brinton (3/1) | — / — | Brinton (3/1) / Saachi (10/3) |
| 2025-05-07 Kempton 18:30 | Yes | Study Up (8/1) / Chalk Mountain (7/1) | — / — | Silver Trumpet (25/1) / — |
| 2025-05-07 Kempton 19:30 | Yes | Thurso (9/2) / Dr Ali (14/1) | — / — | — / Cheeky Stanley (9/4) |
| 2025-05-08 Chelmsford City 17:55 | Yes | Bint Havana Gold (6/1) / Jesse Luc (5/2) **W** | Jesse Luc (5/2) **W** / Bint Havana Gold (6/1) | Jesse Luc (5/2) **W** / Bint Havana Gold (6/1) |
| 2025-05-08 Chelmsford City 19:25 | Yes | Carlton (13/8) **W** / Son Of Red (9/2) | Wannabe Brave (5/2) / Carlton (13/8) **W** | Wannabe Brave (5/2) / Star Legend (13/2) |
| 2025-05-11 Newcastle 13:50 | Yes | Sea Legend (4/1) / Mr Mistoffelees (7/4) | Mr Mistoffelees (7/4) / King Chaos (18/1) | Mr Mistoffelees (7/4) / King Chaos (18/1) |
| 2025-05-11 Newcastle 14:25 | Yes | Free Speech (18/1) / Ninth Life (10/3) | Ninth Life (10/3) / Free Speech (18/1) | Ninth Life (10/3) / Londoner (6/5) **W** |
| 2025-05-11 Newcastle 15:00 | Yes | Tilted Kilt (4/1) / Cristo (3/1) | Cristo (3/1) / Tilted Kilt (4/1) | Cristo (3/1) / Tilted Kilt (4/1) |
| 2025-05-11 Newcastle 17:45 | Yes | Ferrous (13/8) **W** / Korker (20/1) | — / Willem Twee (11/1) | Willem Twee (11/1) / Ferrous (13/8) **W** |
| 2025-05-12 Wolverhampton 18:20 | Yes | Strategic Fortune (7/1) / Serious Look (10/11) **W** | Serious Look (10/11) **W** / Strategic Fortune (7/1) | Serious Look (10/11) **W** / Myna (12/1) |
| 2025-05-12 Wolverhampton 18:55 | Yes | Aikhal (15/2) / Pessoa (7/1) | Pessoa (7/1) / Aikhal (15/2) | Pessoa (7/1) / Eden Storm (9/2) |
| 2025-05-12 Wolverhampton 19:30 | Yes | Al Shabab (7/2) / Bizarre Law (6/1) **W** | — / Dumfries (7/2) | Willow's Kiss (25/1) / Al Shabab (7/2) |
| 2025-05-12 Wolverhampton 20:00 | Yes | Hellavapace (7/1) / Star Of Atlantis (3/1) **W** | — / — | Star Of Atlantis (3/1) **W** / Hellavapace (7/1) |
| 2025-05-15 Kempton 18:30 | Yes | Kosometsuke (6/4) **W** / Kazakh (50/1) | Bear Island (14/1) / Kosometsuke (6/4) **W** | Bear Island (14/1) / Kosometsuke (6/4) **W** |
| 2025-05-15 Kempton 19:00 | Yes | Dash Of Azure (11/8) **W** / Al Khawssaa (7/2) | Al Khawssaa (7/2) / Dash Of Azure (11/8) **W** | Al Khawssaa (7/2) / Dash Of Azure (11/8) **W** |
| 2025-05-21 Kempton 17:10 | Yes | Kebili (40/1) / A La Louche (33/1) | Take The Boat (9/1) / Bizou (4/1) | Beta Reader (10/1) / Take The Boat (9/1) |
| 2025-05-21 Kempton 17:40 | Yes | Radiant Beauty (18/1) **W** / Bill's Baar (5/1) | — / — | A Major Payne (5/1) / — |
| 2025-05-21 Kempton 18:40 | Yes | Racingbreaks Ryder (33/1) / Al Ameen (10/3) **W** | Al Ameen (10/3) **W** / Habrdi (25/1) | Habrdi (25/1) / — |
| 2025-05-21 Kempton 19:10 | Yes | Drama (11/8) **W** / Scarboroughwarning (7/1) | — / — | Scarboroughwarning (7/1) / Drama (11/8) **W** |
| 2025-05-21 Kempton 19:40 | Yes | Autumn's Breeze (12/1) / Sneaky Blinder (7/1) | Marinakis (5/1) / Autumn's Breeze (12/1) | Marinakis (5/1) / Cloudside Rock (6/1) |
| 2025-05-22 Chelmsford City 16:15 | Yes | Egoiste (14/1) / Meadram (5/2) | — / — | Crafter (10/1) / — |
| 2025-05-22 Wolverhampton 18:00 | Yes | Coiled (28/1) / Banksman (15/8) | Banksman (15/8) / Coiled (28/1) | Banksman (15/8) / Amber Honey (16/5) **W** |
| 2025-05-22 Wolverhampton 19:00 | Yes | White Umbrella (12/1) / The Cola Brasil (11/1) | — / Emerald Army (9/5) | — / Emerald Army (9/5) |
| 2025-05-22 Chelmsford City 19:20 | Yes | Safari Dream (6/4) **W** / Forever Noah (14/1) | Forever Noah (14/1) / Safari Dream (6/4) **W** | Forever Noah (14/1) / Safari Dream (6/4) **W** |
| 2025-05-27 Wolverhampton 18:12 | Yes | The Feminine Urge (11/4) / Hint Of Humour (10/1) | — / Startling (7/2) | — / Startling (7/2) |
| 2025-05-27 Wolverhampton 18:42 | Yes | Serious Look (5/2) / Dopamine (4/1) | — / Star Pupil (9/1) **W** | — / Star Pupil (9/1) **W** |
| 2025-05-27 Wolverhampton 19:42 | Yes | Solar Pass (11/10) / Tralee Girl (9/4) **W** | Tralee Girl (9/4) **W** / Solar Pass (11/10) | Tralee Girl (9/4) **W** / Kokinelli (6/1) |
| 2025-05-28 Kempton 16:18 | Yes | Mbappe (16/1) / Stella Hogan (9/2) **W** | — / Foreseen (5/1) | — / Foreseen (5/1) |
| 2025-05-28 Kempton 18:22 | Yes | Binhareer (5/1) / Force And Valour (10/3) | — / Blue Rc (11/4) | Blue Rc (11/4) / Binhareer (5/1) |
| 2025-05-28 Kempton 18:52 | Yes | Kinetic (16/1) / Chilli Queen (7/2) **W** | — / Silver Nightfall (22/1) | — / Silver Nightfall (22/1) |
| 2025-05-28 Kempton 19:22 | Yes | Arqoob (11/1) / Turquino (15/8) | Haku (14/1) **W** / — | Haku (14/1) **W** / — |
| 2025-05-29 Lingfield 13:30 | Yes | Tango Sunset (18/1) / Queensland Boy (5/2) **W** | Smith (7/1) / Tango Sunset (18/1) | Smith (7/1) / Tango Sunset (18/1) |
| 2025-05-31 Southwell 16:25 | Yes | Imperial Guard (7/2) / Alligator Alley (16/5) | — / — | — / Lion's House (66/1) **W** |
| 2025-06-01 Chelmsford City 14:45 | Yes | Crimson Sand (10/1) / Supreme King (9/1) | Supreme King (9/1) / Crimson Sand (10/1) | Supreme King (9/1) / Crimson Sand (10/1) |
| 2025-06-01 Chelmsford City 16:15 | Yes | Palmar Bay (2/1) **W** / Tennessee Gold (14/1) | — / — | Tennessee Gold (14/1) / Palmar Bay (2/1) **W** |
| 2025-06-01 Chelmsford City 16:45 | Yes | Rosenpur (11/1) / Nogo's Dream (5/1) | Nogo's Dream (5/1) / Rosenpur (11/1) | Nogo's Dream (5/1) / Spring Is Sprung (7/2) **W** |
| 2025-06-01 Chelmsford City 17:15 | Yes | She's A Warrior (5/1) / Ciara Pearl (10/1) | — / — | Ciara Pearl (10/1) / She's A Warrior (5/1) |
| 2025-06-03 Lingfield 17:15 | Yes | Artavian (9/2) / Solanna (12/1) | — / — | — / Meleri (5/1) **W** |
| 2025-06-03 Wolverhampton 17:30 | Yes | Two B Tanned (4/1) / Luisa (9/1) | — / Romantic Spirit (16/5) **W** | Romantic Spirit (16/5) **W** / Two B Tanned (4/1) |
| 2025-06-03 Lingfield 17:45 | Yes | Drouthy Neebor (9/4) / Certain Style (12/1) | — / — | — / Casual Encounter (10/3) |
| 2025-06-03 Wolverhampton 19:00 | Yes | Aljezur (6/1) / Aspire To Glory (9/2) | Aspire To Glory (9/2) / Aljezur (6/1) | Aspire To Glory (9/2) / Pessoa (9/2) **W** |
| 2025-06-03 Wolverhampton 20:00 | Yes | Star Of Atlantis (16/1) / Forever Noah (9/2) | Forever Noah (9/2) / Star Of Atlantis (16/1) | Forever Noah (9/2) / Drafted (3/1) |
| 2025-06-05 Lingfield 13:20 | Yes | Star Legend (10/3) **W** / Donald Llewellyn (3/1) | — / — | Poncho (15/8) / — |
| 2025-06-05 Lingfield 13:50 | Yes | Foro Romano (11/2) / Dutch Finale (7/2) **W** | — / — | Dutch Finale (7/2) **W** / Foro Romano (11/2) |
| 2025-06-05 Lingfield 15:25 | Yes | Touchwood (7/4) **W** / Thorntonledale Max (7/1) | — / Tronido (5/1) | Tronido (5/1) / Touchwood (7/4) **W** |
| 2025-06-05 Lingfield 15:55 | Yes | Maid In Chelsea (6/1) / Rebel Empire (6/1) | Mesaafi (8/15) **W** / Batal Dubai (12/1) | Mesaafi (8/15) **W** / Batal Dubai (12/1) |
| 2025-06-05 Chelmsford City 17:35 | Yes | Notimeforchitchat (8/1) / Enrolled (9/4) | — / Yuvraaj (13/2) | Yuvraaj (13/2) / Hot Dancer (85/40) **W** |
| 2025-06-05 Chelmsford City 19:17 | Yes | Ornately (4/1) / American Treasure (14/1) | The New Bay Pearl (9/2) / Ornately (4/1) | The New Bay Pearl (9/2) / Ornately (4/1) |
| 2025-06-05 Chelmsford City 19:47 | Yes | Adelaide Bay (15/8) **W** / Dr Ali (16/1) | — / City Captain (11/8) | — / City Captain (11/8) |
| 2025-06-10 Wolverhampton 16:15 | Yes | Anificas Beauty (15/8) **W** / Dors Delight (16/1) | — / Sir Laurence Graff (4/1) | Sir Laurence Graff (4/1) / Change Of Fortune (7/2) |
| 2025-06-11 Kempton 18:10 | Yes | Savvy Exchange (9/1) / Giant (11/1) | Dubai Beach (5/1) **W** / Ombrecell (16/1) | Dubai Beach (5/1) **W** / Ombrecell (16/1) |
| 2025-06-11 Kempton 18:40 | Yes | Persian Spirit (4/1) / Xanthe (20/1) | — / — | Xanthe (20/1) / Leadenhall Street (7/2) **W** |
| 2025-06-11 Kempton 19:10 | Yes | Lady Odette (8/1) / Zizi (4/1) | Zizi (4/1) / Lesson Of Life (9/4) | Zizi (4/1) / Phrygia (7/2) **W** |
| 2025-06-12 Chelmsford City 18:00 | Yes | Flicka's Girl (14/1) / She Went Whoosh (15/2) | Cheeky Stanley (9/4) / Jagetme (10/3) | Cheeky Stanley (9/4) / Jagetme (10/3) |
| 2025-06-12 Chelmsford City 19:00 | Yes | Paragon (15/8) / Herkeios (16/1) | — / — | Harryella (5/4) / Paragon (15/8) |
| 2025-06-12 Chelmsford City 19:30 | Yes | Tactical Control (10/1) / Beaming Light (10/11) **W** | — / — | Beaming Light (10/11) **W** / Tactical Control (10/1) |
| 2025-06-16 Wolverhampton 19:10 | Yes | Inquisition (4/5) **W** / Paragon (11/4) | Paragon (11/4) / Inquisition (4/5) **W** | Paragon (11/4) / Inquisition (4/5) **W** |
| 2025-06-17 Southwell 16:25 | Yes | Frostmagic (5/4) **W** / Karthon (4/1) | — / Hibernate (14/1) | — / Hibernate (14/1) |
| 2025-06-17 Southwell 18:00 | Yes | Sir Benedict (7/2) / Irish Dancer (2/1) **W** | War Zone (12/1) / Sir Benedict (7/2) | War Zone (12/1) / Sir Benedict (7/2) |
| 2025-06-17 Southwell 19:30 | Yes | Age Of Baroque (3/1) **W** / Sibyl Charm (13/8) | — / — | — / Noisy Music (85/40) |
| 2025-06-17 Southwell 20:00 | Yes | Immediate Effect (5/1) **W** / Fort Campbell (11/4) | Fort Campbell (11/4) / Immediate Effect (5/1) **W** | Loch Leven (10/1) / Wiltshire Lad (3/1) |
| 2025-06-18 Lingfield 16:45 | Yes | Apple's Angel (7/4) **W** / Writteninthestars (11/4) | — / — | My Boy Harry (11/2) / Apple's Angel (7/4) **W** |
| 2025-06-19 Chelmsford City 16:05 | Yes | Waiting For Love (15/2) / Radiant Beauty (9/1) | Radiant Beauty (9/1) / Dubai Beach (1/1) **W** | Radiant Beauty (9/1) / Hitched (20/1) |
| 2025-06-19 Lingfield 16:58 | Yes | Semser (8/1) / Dubai Harbour (9/2) | Persian Phoenix (9/4) **W** / Semser (8/1) | Persian Phoenix (9/4) **W** / Semser (8/1) |
| 2025-06-19 Lingfield 19:10 | Yes | Kessaar Power (9/4) / Vitalline (3/1) **W** | — / — | — / Shot Of Love (3/1) |
| 2025-06-23 Wolverhampton 13:00 | Yes | Abu Royal (40/1) / Sonic Pioneer (4/1) | Ventura Dream (9/2) / Abu Royal (40/1) | Ventura Dream (9/2) / Abu Royal (40/1) |
| 2025-06-23 Wolverhampton 14:00 | Yes | Shiplake (3/1) / Reddeef (11/1) | — / — | Queue Dos (11/4) **W** / — |
| 2025-06-23 Wolverhampton 16:05 | Yes | Star Of Atlantis (7/2) / Royal Jet (9/1) | — / — | Royal Jet (9/1) / Bold Suitor (5/4) **W** |
| 2025-06-25 Kempton 16:30 | Yes | Raavi (5/2) / Snow Creek (11/1) | Snow Creek (11/1) / Raavi (5/2) | Snow Creek (11/1) / Arlecchino's Rex (7/1) |
| 2025-06-25 Kempton 17:00 | Yes | Mahra's Love (5/4) **W** / Eliza Bennet (10/1) | — / — | — / Stella Hogan (9/2) |
| 2025-06-25 Kempton 18:30 | Yes | Encourager (33/1) / Notimeforchitchat (11/1) **W** | Dubai Beach (4/11) / — | Dubai Beach (4/11) / — |
| 2025-06-25 Kempton 19:30 | Yes | Lilly Lux (80/1) / Umbria (13/8) | Sanitiser (50/1) / Wonder (11/1) | Wonder (11/1) / Forca Timao (80/1) |
| 2025-06-25 Kempton 20:00 | Yes | The Colorist (9/1) / Letmebetheboss (11/8) **W** | Letmebetheboss (11/8) **W** / The Colorist (9/1) | Letmebetheboss (11/8) **W** / Leon Trotsky (7/1) |
| 2025-06-26 Newcastle 17:05 | Yes | Crocodile River (40/1) / Coramento (10/3) | Encircle (50/1) / — | Encircle (50/1) / Herkeios (13/2) |
| 2025-06-27 Newcastle 17:30 | Yes | Callianassa (4/1) **W** / Starliner (15/2) | Starliner (15/2) / Ajdayet (20/1) | Starliner (15/2) / Ajdayet (20/1) |
| 2025-06-27 Newcastle 19:10 | Yes | Gis A Sub (10/1) / Newyorkstateofmind (7/2) | — / Crafty Spirit (33/1) | Crafty Spirit (33/1) / Gis A Sub (10/1) |
| 2025-06-28 Newcastle 13:40 | Yes | Artisan Dancer (9/1) / Humble Spark (12/1) | Humble Spark (12/1) / Contacto (7/2) | Midnight Lion (40/1) / — |
| 2025-06-28 Newcastle 14:15 | Yes | Manxman (12/1) / Pappano (12/1) | Pappano (12/1) / East India Dock (7/2) | Duke Of Oxford (11/1) / — |
| 2025-06-28 Newcastle 16:30 | Yes | L'Eagle Aid (4/1) **W** / Freddy Robinson (25/1) | — / — | Spiced Rum (11/4) / L'Eagle Aid (4/1) **W** |
| 2025-06-30 Wolverhampton 18:30 | Yes | Scarboroughwarning (5/1) / Crestofdistinction (10/11) **W** | — / — | — / Stanley Spencer (7/1) |
| 2025-06-30 Wolverhampton 19:00 | Yes | Hello Zaman (15/8) / Don Pacifico (3/1) | — / — | — / Abbey Heights (5/1) **W** |
| 2025-06-30 Wolverhampton 20:00 | Yes | This Time Maybe (5/2) / Fazen (12/1) **W** | Fazen (12/1) **W** / This Time Maybe (5/2) | Rose Light (18/1) / Kilima (11/1) |
| 2025-07-01 Chelmsford City 18:30 | Yes | Profitman (16/1) / Finbar's Lad (4/1) **W** | Finbar's Lad (4/1) **W** / Little Keilee (11/2) | Finbar's Lad (4/1) **W** / Stella Hogan (9/2) |
| 2025-07-01 Chelmsford City 20:00 | Yes | Bamburgh (13/8) / Savvy Kingdom (7/1) | Savvy Kingdom (7/1) / Bamburgh (13/8) | Savvy Kingdom (7/1) / Bamburgh (13/8) |
| 2025-07-03 Kempton 17:23 | Yes | Midnight's Dream (9/4) / Sky Safari (7/2) **W** | — / — | — / Debora's Dream (16/1) |
| 2025-07-03 Kempton 17:58 | Yes | Arqoob (14/1) / Assail (6/1) | Kitty Furnival (9/1) / — | Grand Providence (16/1) / Kitty Furnival (9/1) |
| 2025-07-03 Kempton 18:33 | Yes | Suzuka (13/2) / Silca Bay (15/2) | Pouting (13/2) / Em Four (4/1) | Em Four (4/1) / Pouting (13/2) |
| 2025-07-03 Kempton 19:43 | Yes | Papabella (5/1) / Delagate This Lord (22/1) | Delagate This Lord (22/1) / Havana Sky (11/1) | Delagate This Lord (22/1) / Havana Sky (11/1) |
| 2025-07-09 Kempton 16:50 | Yes | Beach Point (5/2) / Dr Waksman (3/1) | — / Foreseen (9/2) | Foreseen (9/2) / Beach Point (5/2) |
| 2025-07-13 Southwell 15:40 | Yes | Kitty Furnival (7/1) / Wisper (14/1) | — / Likealot (4/1) | Likealot (4/1) / Kitty Furnival (7/1) |
| 2025-07-22 Wolverhampton 19:30 | Yes | Brave Guest (11/1) / Invincible Storm (18/1) | Invincible Storm (18/1) / Toby's Time (25/1) | Ignition (6/1) / — |
| 2025-07-26 Newcastle 14:40 | Yes | Sheriff's Court (9/4) / Rogue Encore (9/2) | — / Beraz (10/3) | — / Beraz (10/3) |
| 2025-07-26 Newcastle 16:55 | Yes | Martin's Brig (11/4) / Mary Anne Maximus (20/1) | Mary Anne Maximus (20/1) / Martin's Brig (11/4) | Mary Anne Maximus (20/1) / Spartan Fighter (8/1) |
| 2025-07-31 Wolverhampton 16:45 | Yes | Scarboroughwarning (4/1) / Aberama Gold (5/1) | Aberama Gold (5/1) / Scarboroughwarning (4/1) | Aberama Gold (5/1) / Rebel Empire (20/1) |
| 2025-07-31 Wolverhampton 19:45 | Yes | Andaleep (6/1) / Fox Avatar (10/3) | — / Londoner (6/1) | Londoner (6/1) / Andaleep (6/1) |
| 2025-08-01 Southwell 14:25 | Yes | Ocean Odyssey (11/4) **W** / Woodleigh (9/1) | — / Aspire To Glory (9/1) | Aspire To Glory (9/1) / Ocean Odyssey (11/4) **W** |
| 2025-08-01 Southwell 16:50 | Yes | Implied Volatility (10/1) / Haazeez (11/4) **W** | — / — | — / Rogue Dancer (16/1) |
| 2025-08-04 Lingfield 13:53 | Yes | Thundering Breeze (13/8) / Al Shabab (11/4) | — / — | — / Vitalline (10/1) |
| 2025-08-06 Kempton 17:00 | Yes | Grand Echo (14/1) / Believeinthisone (12/1) | Red Savitar (7/2) / — | Red Savitar (7/2) / — |
| 2025-08-07 Chelmsford City 14:30 | Yes | Tyger Bay (4/1) **W** / Havana Sky (9/2) | — / My Mate Mike (4/1) | My Mate Mike (4/1) / Tyger Bay (4/1) **W** |
| 2025-08-07 Chelmsford City 15:30 | Yes | Palazzo Persico (9/2) / Fihrayn (2/1) | Fihrayn (2/1) / Masqool (11/1) | Meadram (13/2) / — |
| 2025-08-07 Chelmsford City 16:00 | Yes | Little Keilee (10/3) / Suzuka (9/2) | — / — | Lunarscape (13/2) / Little Keilee (10/3) |
| 2025-08-10 Wolverhampton 16:07 | Yes | Saxonia (13/8) / Waiting For Love (5/1) | — / Run With It (9/2) **W** | — / Run With It (9/2) **W** |
| 2025-08-11 Kempton 16:22 | Yes | Solar Pass (11/2) / Tempted (12/1) | — / Miss Wong (6/1) **W** | — / Miss Wong (6/1) **W** |
| 2025-08-12 Lingfield 14:00 | Yes | Invited (7/1) **W** / I Maximus (9/4) | — / Noble Victory (11/2) | Noble Victory (11/2) / Invited (7/1) **W** |
| 2025-08-14 Chelmsford City 18:15 | Yes | Medinilla (7/1) / Left Over Love (12/1) | — / Backspin (5/2) | — / Zabeel Road (12/1) **W** |
| 2025-08-19 Wolverhampton 18:40 | Yes | Kento (7/2) / War Zone (16/1) | — / — | — / Black Cab (10/1) |
| 2025-08-19 Wolverhampton 19:10 | Yes | Havana Sky (11/4) **W** / Glory Hyde (9/4) | Glory Hyde (9/4) / Havana Sky (11/4) **W** | Glory Hyde (9/4) / Havana Sky (11/4) **W** |
| 2025-08-20 Kempton 18:20 | Yes | Rhapsody (11/1) / Dragon Icon (11/4) | — / — | Sheriff's Court (7/2) / Notimeforchitchat (11/1) |
| 2025-08-21 Lingfield 14:45 | Yes | Grey Owl (5/2) / Girl Of Gold (22/1) | — / Fair Dinkum (13/2) | Sydney Seabreeze (13/2) / Grey Owl (5/2) |
| 2025-08-21 Chelmsford City 16:30 | Yes | Harswell Duke (6/1) / Apodictique (11/1) | — / — | — / Meadram (9/2) |
| 2025-08-21 Newcastle 17:15 | Yes | Gran Descans (4/1) / Circus Of Rome (5/2) **W** | — / — | — / Midnight Lion (22/1) |
| 2025-08-21 Chelmsford City 19:00 | Yes | Rajlakshmi (18/1) / Fallen Soldier (15/2) | — / Polar Rebel (9/2) | — / Polar Rebel (9/2) |
| 2025-08-21 Newcastle 19:15 | Yes | Flag Of St George (16/1) / Crack On Boys (18/1) **W** | — / Tilted Kilt (10/1) | — / Tilted Kilt (10/1) |
| 2025-08-25 Southwell 13:15 | Yes | New York Minute (5/2) / Damascus Steel (13/2) | — / — | — / Swinging London (11/1) |
| 2025-08-25 Southwell 13:50 | Yes | Tiempo Alegre (7/2) / Eva Rosie (12/1) | — / Woodleigh (8/1) | — / Woodleigh (8/1) |
| 2025-08-25 Southwell 15:33 | Yes | Arboreous (25/1) / Dannick (2/1) | Dannick (2/1) / Arboreous (25/1) | Dannick (2/1) / Zabeel Road (8/1) |
| 2025-08-25 Southwell 16:08 | Yes | Manhattan Mirage (18/1) / Royal Musketeer (16/1) | Royal Musketeer (16/1) / Belsito (11/1) | Royal Musketeer (16/1) / Belsito (11/1) |
| 2025-08-26 Lingfield 15:10 | Yes | Moel Arthur (11/4) / Senor Cortez (4/6) **W** | Senor Cortez (4/6) **W** / Throne Hall (12/1) | Senor Cortez (4/6) **W** / Sun Dancer Girl (18/1) |
| 2025-08-26 Lingfield 16:40 | Yes | Silk And Steel (10/3) / Kilima (2/1) | — / — | — / Both Of Us (7/1) |
| 2025-08-26 Lingfield 17:10 | Yes | Harryella (6/4) **W** / Northern Blaze (25/1) | — / — | — / Grey Selkie (28/1) |
| 2025-08-26 Lingfield 18:10 | Yes | Saytarr (5/6) **W** / Daisy Roots (11/2) | Daisy Roots (11/2) / Thorntonledale Max (12/1) | Flag Carrier (10/1) / Thorntonledale Max (12/1) |
| 2025-08-27 Kempton 18:37 | Yes | Muhaajim (7/2) / Bulletin (13/8) **W** | — / — | — / Advancing (5/2) |
| 2025-08-27 Kempton 19:07 | Yes | Rogue Allegiance (13/2) / Haazeez (9/1) **W** | Haazeez (9/1) **W** / Kiniro (16/5) | Haazeez (9/1) **W** / Hello Zaman (7/2) |
| 2025-08-27 Kempton 19:37 | Yes | Karthon (13/8) / Divot (9/2) | — / Golden Garden (17/2) | — / Golden Garden (17/2) |
| 2025-08-28 Chelmsford City 13:20 | Yes | Demetrius (6/4) **W** / Too Hot To Love (9/2) | Too Hot To Love (9/2) / Demetrius (6/4) **W** | Too Hot To Love (9/2) / Demetrius (6/4) **W** |
| 2025-08-28 Southwell 16:45 | Yes | Cotswold Cottage (20/1) / Spirit Of Jura (7/2) | Percy Jones (25/1) / Cotswold Cottage (20/1) | Percy Jones (25/1) / Cotswold Cottage (20/1) |
| 2025-08-29 Newcastle 18:30 | Yes | Back Tomorrow (15/2) / Dorothy May (5/1) **W** | Dorothy May (5/1) **W** / Back Tomorrow (15/2) | Dorothy May (5/1) **W** / Latin Five (3/1) |
| 2025-08-29 Newcastle 19:00 | Yes | Joe Masseria (40/1) / Flying Fletcher (2/1) | Flying Fletcher (2/1) / Black Storm (7/2) | Flying Fletcher (2/1) / Black Storm (7/2) |
| 2025-08-29 Newcastle 20:00 | Yes | Cuban Fiesta (17/2) / Yafaarr (12/1) | Yafaarr (12/1) / Cuban Fiesta (17/2) | Yafaarr (12/1) / Park Street (10/3) |
| 2025-08-30 Lingfield 16:25 | Yes | Halla Bil Zain (2/1) / Blooming Legend (9/2) **W** | — / Booziebrunch (7/4) | Booziebrunch (7/4) / Halla Bil Zain (2/1) |
| 2025-08-30 Lingfield 17:25 | Yes | Kento (20/1) / Invincible Navy (5/1) | Invincible Navy (5/1) / Kento (20/1) | Invincible Navy (5/1) / Royal Jet (5/1) |
| 2025-08-30 Chelmsford City 18:40 | Yes | Apple's Angel (13/2) / Sam's Xpress (16/5) **W** | — / — | Sam's Xpress (16/5) **W** / Apple's Angel (13/2) |
| 2025-08-30 Chelmsford City 19:10 | Yes | Young Endless (10/3) / Grand Harbour (5/2) | Grand Harbour (5/2) / Inlet (11/2) | Inlet (11/2) / — |
| 2025-08-30 Chelmsford City 19:40 | Yes | American Treasure (28/1) / Rusheen Boy (9/2) **W** | — / Jackson Street (10/1) | Jackson Street (10/1) / American Treasure (28/1) |
| 2025-09-02 Wolverhampton 16:10 | Yes | Guiteau (11/2) / Sceptic (4/1) **W** | — / Boujee Gold (14/1) | Eden Storm (3/1) / Guiteau (11/2) |
| 2025-09-02 Southwell 17:30 | Yes | Go On Rosie (14/1) / Tanjen (3/1) **W** | Tanjen (3/1) **W** / Go On Rosie (14/1) | Tanjen (3/1) **W** / Go On Rosie (14/1) |
| 2025-09-02 Wolverhampton 17:45 | Yes | Romantic Spirit (11/2) / Baikal (13/2) **W** | — / Little Miss India (7/1) | — / Waiting For Love (11/2) |
| 2025-09-02 Southwell 18:30 | Yes | Run With It (3/1) **W** / Great Dream (10/3) | — / — | Great Dream (10/3) / Run With It (3/1) **W** |
| 2025-09-02 Wolverhampton 19:15 | Yes | Moonlit Cloud (16/1) / This Time Maybe (3/1) | This Time Maybe (3/1) / Berkshire Phantom (11/4) | Rubellite (5/1) **W** / — |
| 2025-09-02 Wolverhampton 19:45 | Yes | Mighty Gurkha (9/1) / How's The Guvnor (10/1) | Outer Edge (14/1) / — | Outer Edge (14/1) / Macarone (9/4) **W** |
| 2025-09-02 Southwell 20:00 | Yes | Langholm (10/1) / Retraction (3/1) | — / — | — / Arlecchino's Rex (13/2) |
| 2025-09-03 Lingfield 13:05 | Yes | Motazzen (10/3) / Curran (11/2) | Surrey Fire (2/1) **W** / Motazzen (10/3) | Surrey Fire (2/1) **W** / — |
| 2025-09-03 Lingfield 16:05 | Yes | Due West (8/15) / Inns Of Fear (12/1) | — / Saxonia (13/2) | Saxonia (13/2) / — |
| 2025-09-03 Kempton 19:30 | Yes | Enrolled (3/1) **W** / Preanka (10/1) | Marquis Pompeo (16/1) / Enrolled (3/1) **W** | Marquis Pompeo (16/1) / Enrolled (3/1) **W** |
| 2025-09-03 Kempton 20:00 | Yes | Scarboroughwarning (9/4) / Court Drive (10/1) | — / Improve Your Move (14/1) | Thursday's Child (7/2) / Scarboroughwarning (9/4) |
| 2025-09-04 Southwell 15:25 | Yes | Cliffcake (6/1) / Saisons D'Or (14/1) | — / — | Thorntonledale Max (11/4) **W** / Cliffcake (6/1) |
| 2025-09-04 Southwell 16:00 | Yes | Popeye Doyle (5/1) / Grey Soul (5/1) | — / Bear Island (3/1) | — / Bear Island (3/1) |
| 2025-09-04 Southwell 16:35 | Yes | Beautiful Dawn (10/3) / Elvetham (4/1) | — / — | Back From Dubai (7/1) / Beautiful Dawn (10/3) |
| 2025-09-04 Lingfield 18:20 | Yes | Rovinia (13/2) / Beautiful Things (9/1) | Sarabi (16/1) / Rovinia (13/2) | Sarabi (16/1) / Rovinia (13/2) |
| 2025-09-05 Kempton 18:17 | Yes | Gilet (8/1) / Aspull (11/2) | Aspull (11/2) / Gilet (8/1) | Best Rate (5/2) / — |
| 2025-09-05 Kempton 19:47 | Yes | Detroit Lion (4/1) / Sharp Distinction (6/1) **W** | Brodie's Boy (13/2) / Detroit Lion (4/1) | Brodie's Boy (13/2) / Nivelle's Magic (10/3) |
| 2025-09-06 Kempton 13:05 | Yes | Sky Safari (5/2) **W** / Final Voyage (7/1) | — / — | Mr Baloo (50/1) / Sky Safari (5/2) **W** |
| 2025-09-06 Kempton 15:20 | Yes | Dino Bellagio (4/1) / Caprelo (2/1) **W** | — / — | Caprelo (2/1) **W** / Molten Sea (16/5) |
| 2025-09-06 Kempton 15:50 | Yes | Haku (11/1) / Assail (4/1) | — / Siempre Arturo (3/1) **W** | — / Great Bedwyn (9/1) |
| 2025-09-06 Wolverhampton 18:12 | Yes | Dancing Bay (10/3) / Pretty Spirited (2/1) | — / — | Pretty Spirited (2/1) / Dancing Bay (10/3) |
| 2025-09-06 Wolverhampton 19:42 | Yes | Volto Di Medusa (3/1) / Bernalda (6/1) **W** | Bernalda (6/1) **W** / Volto Di Medusa (3/1) | Bernalda (6/1) **W** / Mercurius Power (10/1) |
| 2025-09-08 Lingfield 14:22 | Yes | Harryella (6/5) **W** / Suzuka (5/1) | — / Glenridding (9/1) | — / Live Each Day (18/1) |
| 2025-09-08 Lingfield 14:58 | Yes | Kranjcar (11/2) **W** / Zaltalla (7/2) | — / B Associates (15/2) | — / B Associates (15/2) |
| 2025-09-08 Newcastle 15:39 | Yes | Lechuga Lad (15/2) / Ninth Life (9/1) | — / — | Hosanna Power (11/4) / — |
| 2025-09-08 Newcastle 19:40 | Yes | Herakles (3/1) / A Girl Named Ivy (10/1) | — / — | Dorothy May (17/2) / Herakles (3/1) |
| 2025-09-11 Chelmsford City 14:10 | Yes | Bernard Spierpoint (12/1) / Kodi Red (11/2) **W** | — / Sarabi (12/1) | Sarabi (12/1) / Twilight Poppy (25/1) |
| 2025-09-13 Lingfield 12:25 | Yes | The Bay Warrior (7/1) **W** / Kintbury (8/1) | Destinado (3/1) / The Bay Warrior (7/1) **W** | Typhoon Dancer (5/1) / Destinado (3/1) |
| 2025-09-13 Lingfield 14:55 | Yes | Summertime Blues (10/11) **W** / Callout (18/1) | — / Cooramook (9/4) | — / Cooramook (9/4) |
| 2025-09-13 Lingfield 15:30 | Yes | Parish Councillor (85/40) **W** / Bear To Dream (10/1) | — / — | — / Bayadere (15/2) |
| 2025-09-13 Lingfield 16:00 | Yes | Glamorous Breeze (13/2) / Fidelius (11/2) | — / Grandlad (6/1) | — / Grandlad (6/1) |
| 2025-09-15 Kempton 16:30 | Yes | Midnight Rodeo (2/1) **W** / Hamaleel (10/1) | Hamaleel (10/1) / Midnight Rodeo (2/1) **W** | Hamaleel (10/1) / Flying Macs (14/1) |
| 2025-09-15 Kempton 17:30 | Yes | Toralou (11/2) / Riyadh Gem (3/1) | — / — | — / Mythical Bird (9/2) |
| 2025-09-15 Kempton 18:30 | Yes | Champion Again Ole (16/5) **W** / Havana Sky (10/1) | Havana Sky (10/1) / Champion Again Ole (16/5) **W** | Havana Sky (10/1) / Silca Bay (10/1) |
| 2025-09-16 Wolverhampton 18:00 | Yes | Kingston Sunflower (9/1) / Warrior Lion (10/3) | Warrior Lion (10/3) / Forglen (11/4) | Advertorial (11/2) **W** / — |
| 2025-09-16 Wolverhampton 19:00 | Yes | Stipulation (5/1) **W** / Harryella (7/4) | Harryella (7/4) / Stipulation (5/1) **W** | Harryella (7/4) / Stipulation (5/1) **W** |
| 2025-09-16 Wolverhampton 19:30 | Yes | Jagetme (10/1) / Jungle Dance (3/1) | — / — | Jungle Dance (3/1) / Jagetme (10/1) |
| 2025-09-18 Kempton 15:27 | Yes | Master Milan (33/1) / Island Ocean (5/1) **W** | — / — | Reignman (5/1) / — |
| 2025-09-18 Kempton 16:40 | Yes | Opening Bat (13/8) / Dovey Moon (12/1) | — / Saytarr (5/4) **W** | — / Saytarr (5/4) **W** |
| 2025-09-18 Chelmsford City 18:00 | Yes | Thanh Nam (11/4) / Fanjove (5/1) | — / Captain Bruce (4/1) | — / Captain Bruce (4/1) |
| 2025-09-18 Kempton 18:45 | Yes | Catherine's Gift (4/1) / Fihrayn (9/1) | Fihrayn (9/1) / Catherine's Gift (4/1) | Fihrayn (9/1) / Upepo (100/1) |
| 2025-09-18 Kempton 19:15 | Yes | Top Biller (12/1) / Early Release (9/2) **W** | Early Release (9/2) **W** / Galel (11/1) | Early Release (9/2) **W** / Galel (11/1) |
| 2025-09-19 Dundalk 17:00 | Yes | Bint Elnadim Star (12/1) / Tofino (7/1) | Tofino (7/1) / Bint Elnadim Star (12/1) | Tofino (7/1) / Bint Elnadim Star (12/1) |
| 2025-09-19 Newcastle 17:45 | Yes | Sassy Glory (9/4) / Yafaarr (7/2) | — / — | — / Desert Raider (7/2) |
| 2025-09-19 Newcastle 19:15 | Yes | Newyorkstateofmind (9/1) / Bibendum (11/2) | Sanbona (4/1) / Newyorkstateofmind (9/1) | Sanbona (4/1) / Newyorkstateofmind (9/1) |
| 2025-09-20 Wolverhampton 18:30 | Yes | Karakula (7/2) / Photon (13/2) | Photon (13/2) / Youarenotforgiven (11/2) **W** | Photon (13/2) / Youarenotforgiven (11/2) **W** |
| 2025-09-20 Wolverhampton 19:30 | Yes | One More Dream (7/2) **W** / Dragonfly In Amber (4/1) | — / Rye (16/1) | Rye (16/1) / One More Dream (7/2) **W** |
| 2025-09-21 Southwell 14:07 | Yes | Degale (9/1) / My Margie (17/2) | — / Dragon Icon (3/1) **W** | Dragon Icon (3/1) **W** / Degale (9/1) |
| 2025-09-21 Southwell 16:40 | Yes | Great Bedwyn (18/1) / Byblos (85/40) | — / — | Surrey Fire (12/1) / Great Bedwyn (18/1) |
| 2025-09-22 Wolverhampton 16:30 | Yes | Smartanck (5/2) **W** / Vintage Heat (10/3) | Priestess (2/1) / Smartanck (5/2) **W** | Priestess (2/1) / Smartanck (5/2) **W** |
| 2025-09-22 Wolverhampton 17:00 | Yes | Hint Of The Jungle (11/2) / Star Of Atlantis (11/1) | — / Arlecchino's Rex (5/1) | Arlecchino's Rex (5/1) / Hint Of The Jungle (11/2) |
| 2025-09-22 Wolverhampton 17:30 | Yes | Penelope Valentine (5/2) **W** / King Of War (20/1) | — / — | — / Valadero (11/8) |
| 2025-09-22 Wolverhampton 18:00 | Yes | Backspin (10/3) / Anthropologist (16/1) | — / Arboreous (10/1) | — / Devious Devan (10/1) |
| 2025-09-22 Wolverhampton 18:30 | Yes | Record Art (7/1) / Young Endless (16/5) | — / Inlet (9/2) | Inlet (9/2) / Record Art (7/1) |
| 2025-09-23 Lingfield 13:45 | Yes | Riffa Spirit (11/2) / Portacloy (4/1) | Portacloy (4/1) / Riffa Spirit (11/2) | Portacloy (4/1) / Riffa Spirit (11/2) |
| 2025-09-23 Lingfield 15:45 | Yes | Recon Mission (4/1) / Flicka's Girl (25/1) | — / Gogo Yubari (15/2) | — / Gogo Yubari (15/2) |
| 2025-09-23 Lingfield 16:15 | Yes | Triggered (7/2) / Kondratiev Wave (7/2) | — / Jackson Street (5/1) | — / Jackson Street (5/1) |
| 2025-09-23 Lingfield 16:45 | Yes | Takteek (13/2) / Borderline Madness (4/1) **W** | — / Three On Thursday (8/1) | — / Elvetham (15/2) |
| 2025-09-23 Southwell 19:30 | Yes | Belle Amie (28/1) / Both Of Us (6/5) **W** | Both Of Us (6/5) **W** / Aoife's Thunder (15/2) | Aoife's Thunder (15/2) / — |
| 2025-09-24 Kempton 14:58 | Yes | Mount Olympus (7/2) **W** / Seraphic (14/1) | Seraphic (14/1) / Uzincso (7/2) | Golden Dove (10/3) / — |
| 2025-09-24 Kempton 16:05 | Yes | Live Each Day (12/1) **W** / Hilltop (13/8) | Hilltop (13/8) / Live Each Day (12/1) **W** | Hilltop (13/8) / Live Each Day (12/1) **W** |
| 2025-09-24 Kempton 17:10 | Yes | Baikal (5/1) / Blast The Dream (9/1) | Blast The Dream (9/1) / Baikal (5/1) | Blast The Dream (9/1) / Raedwald (10/1) |
| 2025-09-24 Kempton 18:40 | Yes | Ten Club (28/1) / Dollyana (7/1) | — / — | Dollyana (7/1) / Ten Club (28/1) |
| 2025-09-24 Kempton 19:10 | Yes | Muma Myflo (4/1) / Initial Blue (7/2) | — / — | — / Alashos (80/1) |
| 2025-09-25 Newcastle 16:30 | Yes | Rubellite (13/8) / Percy Willis (11/2) | — / Fleur De Mer (2/1) | — / Speechman (12/1) |
| 2025-09-25 Newcastle 18:00 | Yes | Miakoda (4/1) / Mu Mu Land (12/1) | — / Call Me Betty (15/2) | Happy To Fly (9/2) / Miakoda (4/1) |
| 2025-09-25 Newcastle 18:30 | Yes | Oselton (3/1) / Langholm (16/1) | — / — | Instant Bond (10/1) / — |
| 2025-09-25 Newcastle 19:00 | Yes | Parish Councillor (6/5) **W** / Coloane (4/1) | — / Urban Dandy (12/1) | — / Urban Dandy (12/1) |
| 2025-09-26 Dundalk 17:15 | Yes | Four White Fury (13/2) / Ms Olivia (9/1) | Ms Olivia (9/1) / Four White Fury (13/2) | Ms Olivia (9/1) / The Bog Bank (12/1) |
| 2025-09-26 Newcastle 18:30 | Yes | Beauty Blossom (18/1) / Uncle Sam (10/1) | — / — | — / Yafaarr (9/2) |
| 2025-09-26 Dundalk 18:45 | Yes | Sacred Oath (15/2) / Quickshot (3/1) **W** | Nocturnal (9/1) / Sacred Oath (15/2) | Nocturnal (9/1) / Sacred Oath (15/2) |
| 2025-09-27 Southwell 15:19 | Yes | Rajak (8/1) / Havin A Flyer (5/2) | Havin A Flyer (5/2) / Call Me By My Name (4/1) | Havin A Flyer (5/2) / Call Me By My Name (4/1) |
| 2025-09-27 Southwell 17:00 | Yes | Holly Holy (40/1) / Amor Cordis (16/1) | Amor Cordis (16/1) / Havana Touch (13/2) | Havana Touch (13/2) / — |
| 2025-09-27 Southwell 18:00 | Yes | Kiniro (3/1) / Jesse Luc (4/1) | — / — | — / Smooth Silesie (18/1) |
| 2025-09-27 Southwell 18:30 | Yes | Woodhay Whisper (16/1) / Zuffolo (7/2) | Zuffolo (7/2) / Woodhay Whisper (16/1) | Zuffolo (7/2) / Nelson Gay (12/1) |
| 2025-09-28 Newcastle 13:45 | Yes | King's School (13/2) / Highland Olly (12/1) | Giant (7/1) / — | Giant (7/1) / — |
| 2025-09-28 Newcastle 14:20 | Yes | Both Of Us (11/10) / Spring Festival (28/1) | — / Queen Roslyn (10/3) **W** | — / Queen Roslyn (10/3) **W** |
| 2025-09-28 Newcastle 17:45 | Yes | Telemark (6/1) / Oliver Show (13/2) | — / — | Nikovo (14/1) / — |
| 2025-09-29 Southwell 17:30 | Yes | Phoenix Moon (7/2) / Spiritualism (80/1) | — / After Love (7/2) **W** | — / Ziggy's Queen (10/1) |
| 2025-09-30 Newcastle 18:00 | Yes | Smartanck (11/2) / Fanjove (5/1) **W** | — / Moo Deng (16/1) | — / Moo Deng (16/1) |
| 2025-09-30 Newcastle 18:30 | Yes | Barleybrown (3/1) / Stockpyle (4/1) | — / — | Mercurius Power (6/1) / — |
| 2025-09-30 Newcastle 19:00 | Yes | Penelope Valentine (1/1) / Starshot (15/2) | — / My Mate Beattie (18/1) | — / Woodrafff (11/4) **W** |
| 2025-09-30 Newcastle 19:30 | Yes | Invitorio (3/1) / Yazaman (11/1) | — / Bomb Squad (7/1) | — / Bomb Squad (7/1) |
| 2025-10-01 Kempton 16:30 | Yes | Palmarian (3/1) / Tattie Bogle (16/1) | — / Revolutionise (11/1) | King Of Ithaca (20/1) / Palmarian (3/1) |
| 2025-10-01 Kempton 18:00 | Yes | Olympic Candle (3/1) **W** / Footwork (11/1) | — / Cogitate (10/3) | — / Cogitate (10/3) |
| 2025-10-02 Chelmsford City 17:45 | Yes | Captain Parma (20/1) / Wadacre Maestro (4/1) | Summertime Blues (15/8) / — | Summertime Blues (15/8) / — |
| 2025-10-02 Newcastle 18:00 | Yes | Al Joory (15/8) / Galaxy Zoo (9/4) | Galaxy Zoo (9/4) / Al Joory (15/8) | Galaxy Zoo (9/4) / Heavenly Heather (13/2) |
| 2025-10-02 Newcastle 19:30 | Yes | Pacifist (9/1) / Seed Investor (7/4) | Mister Invincible (12/1) / Pacifist (9/1) | Mister Invincible (12/1) / — |
| 2025-10-03 Southwell 15:00 | Yes | Simiyann (7/1) / Kingdom Of Stars (3/1) | New York Minute (5/2) **W** / — | New York Minute (5/2) **W** / — |
| 2025-10-03 Southwell 17:15 | Yes | Zabeel Alkabeir (8/15) **W** / Shamacid (4/1) | Shamacid (4/1) / Zabeel Alkabeir (8/15) **W** | Shamacid (4/1) / Zabeel Alkabeir (8/15) **W** |
| 2025-10-03 Southwell 17:45 | Yes | Bernalda (4/1) / Blue Prince (5/1) | — / — | — / Al Rufaa (5/1) |
| 2025-10-03 Southwell 18:15 | Yes | Backspin (16/5) / Baba Reza (11/2) | — / True Promise (7/2) | True Promise (7/2) / Backspin (16/5) |
| 2025-10-03 Southwell 19:15 | Yes | Mission Possible (9/4) / Sun Dancer Girl (25/1) | Night Tara (13/8) / — | Night Tara (13/8) / Kokinelli (8/1) **W** |
| 2025-10-04 Wolverhampton 15:20 | Yes | Paroled (7/2) / Kalokalo (5/2) | Ibn Altheeb (4/1) **W** / — | Ibn Altheeb (4/1) **W** / — |
| 2025-10-04 Newcastle 16:15 | Yes | Renewal (7/1) / Natzor (80/1) | — / Ninth Life (16/1) | — / Advancing (11/4) |
| 2025-10-04 Wolverhampton 17:00 | Yes | Holy Smoker (25/1) / Sangara (6/1) | Sangara (6/1) / Takteek (10/1) | Sangara (6/1) / Boujee Gold (33/1) |
| 2025-10-04 Wolverhampton 18:00 | Yes | Top Of Pleinmont (6/1) **W** / Naughty Niall (10/1) | Naughty Niall (10/1) / Damzon (9/2) | Northern Blaze (11/4) / — |
| 2025-10-04 Newcastle 18:45 | Yes | Monsieur Bondy (5/1) / Spell Master (7/2) **W** | Spell Master (7/2) **W** / Bold Impact (11/2) | Master Richard (15/2) / — |
| 2025-10-06 Wolverhampton 16:30 | Yes | Moira Express (6/1) / Dark Mandate (5/2) | — / Moretons (10/3) | Moretons (10/3) / Moira Express (6/1) |
| 2025-10-06 Wolverhampton 18:30 | Yes | High Court Judge (28/1) / Venezuelan (13/8) | Venezuelan (13/8) / Percy Jones (11/1) | Percy Jones (11/1) / Surrey Fire (11/2) **W** |
| 2025-10-06 Wolverhampton 19:00 | Yes | Dancing Bay (14/1) / Adrian (18/1) | Sneaky Blinder (15/8) / Dancing Bay (14/1) | Sneaky Blinder (15/8) / Dancing Bay (14/1) |
| 2025-10-06 Wolverhampton 19:30 | Yes | Strobelight (11/4) / Ottoman (16/1) | — / Hock Eye The Noo (4/1) | Hock Eye The Noo (4/1) / Maywedance (25/1) |
| 2025-10-07 Southwell 18:00 | Yes | She Went Whoosh (16/1) / Forest Gunner (16/1) **W** | — / Colors Of Freedom (4/1) | Colors Of Freedom (4/1) / She Went Whoosh (16/1) |
| 2025-10-07 Southwell 19:00 | Yes | Major Major (11/2) / Shamardal Star (4/1) | Little Miss India (9/2) **W** / — | Harry The Haggler (12/1) / Little Miss India (9/2) **W** |
| 2025-10-08 Kempton 15:35 | Yes | Penn Avenue (12/1) / Cloudside Rock (8/1) | — / Seventy (7/4) | Blue Train (3/1) **W** / Penn Avenue (12/1) |
| 2025-10-08 Kempton 18:10 | Yes | Bear Island (7/4) / Give Me The Night (18/1) | — / Frostmagic (8/1) | — / Frostmagic (8/1) |
| 2025-10-08 Kempton 18:40 | Yes | One More (10/3) / Metaverse (9/2) | — / Follow Your Heart (18/1) | — / Huscal (4/1) |
| 2025-10-08 Kempton 19:10 | Yes | Rosemary's Rose (10/1) / Eulalia (9/2) | Polar Rebel (10/1) / Rosemary's Rose (10/1) | Polar Rebel (10/1) / Rosemary's Rose (10/1) |
| 2025-10-09 Newcastle 15:55 | Yes | La Cadalora (9/4) / Relocal (5/2) | — / — | — / Taylormade Lad (7/1) |
| 2025-10-09 Chelmsford City 17:45 | Yes | Newsreader (7/2) / Benacre (7/2) | Rascal Recknell (11/4) / — | Rascal Recknell (11/4) / — |
| 2025-10-09 Newcastle 18:00 | Yes | Northern Attitude (7/1) / The Green Man (11/8) **W** | The Green Man (11/8) **W** / Northern Attitude (7/1) | The Green Man (11/8) **W** / Northern Attitude (7/1) |
| 2025-10-09 Chelmsford City 18:45 | Yes | Suzuka (9/2) / Fool Again (25/1) | — / Liv My Life (9/1) | Liv My Life (9/1) / Suzuka (9/2) |
| 2025-10-09 Newcastle 19:00 | Yes | Hundred Caps (13/2) / Ziggy's Triton (5/1) | — / — | Ziggy's Triton (5/1) / Hundred Caps (13/2) |
| 2025-10-09 Newcastle 19:30 | Yes | Showmethewayhome (25/1) / Second Fiddle (5/6) **W** | Second Fiddle (5/6) **W** / Spirit Of Bowland (5/1) | Pop Favorite (9/1) / — |
| 2025-10-10 Kempton 15:38 | Yes | Fanjove (7/4) / Lady Milton (10/1) **W** | — / Royalist (4/1) | — / Telfy Boy (5/1) |
| 2025-10-10 Kempton 16:15 | Yes | Hot Shot Lawyer (9/1) / Brave Guest (9/1) | Brave Guest (9/1) / Jimmy Henry (13/2) | Brave Guest (9/1) / Jimmy Henry (13/2) |
| 2025-10-10 Kempton 17:45 | Yes | Absolute Star (7/2) **W** / Devious Devan (16/1) | — / Kaaranah (9/1) | — / Kaaranah (9/1) |
| 2025-10-10 Kempton 18:15 | Yes | Caspian King (7/2) / Pride Of Donegal (11/8) **W** | — / Bajan Blue (9/1) | — / Golden Circet (11/2) |
| 2025-10-10 Dundalk 19:00 | Yes | Sarmiento Power (18/5) / Gallo Dell Cielo (5/1) | Gallo Dell Cielo (5/1) / Sarmiento Power (18/5) | Gallo Dell Cielo (5/1) / Nyota (66/1) |
| 2025-10-10 Kempton 19:15 | Yes | Me Tarzan (4/1) / Waistcoat (11/1) | — / — | — / Ocean Odyssey (17/2) |
| 2025-10-11 Wolverhampton 15:10 | Yes | Rohilla (100/1) / Typeface (6/5) | Typeface (6/5) / Celebrating Ethel (7/1) | Yorkshire Myth (6/1) / — |
| 2025-10-11 Wolverhampton 16:20 | Yes | Thanh Nam (5/2) / Looks Likely (25/1) | — / — | — / Woody Y Fernandez (5/1) |
| 2025-10-11 Wolverhampton 18:20 | Yes | The Bunt (11/2) / Kintbury (10/3) | Curran (9/4) / — | Curran (9/4) / — |
| 2025-10-13 Kempton 15:10 | Yes | Foreseen (5/2) / Blenheim Star (20/1) | — / Super Hit (4/1) | Super Hit (4/1) / Foreseen (5/2) |
| 2025-10-13 Kempton 17:10 | Yes | Thaisa (6/4) / Cotiere (12/1) | — / — | Cotiere (12/1) / Thaisa (6/4) |
| 2025-10-13 Kempton 17:40 | Yes | Raneenn (8/1) **W** / Jettie's Run (4/1) | — / — | Jettie's Run (4/1) / Raneenn (8/1) **W** |
| 2025-10-13 Kempton 18:10 | Yes | Sportingsilvermine (11/10) / Crystal Mariner (10/3) **W** | — / — | — / Clockmaker (12/1) |
| 2025-10-13 Kempton 19:10 | Yes | Jet Black (7/2) / Pergola (7/2) | — / — | — / Nanny Park (5/1) |
| 2025-10-14 Lingfield 12:30 | Yes | Rose Warrior (14/1) / This Time Maybe (4/1) | This Time Maybe (4/1) / Nasim (14/1) | Nasim (14/1) / Dubai Harbour (10/1) |
| 2025-10-14 Lingfield 13:00 | Yes | Ribston Pippin (3/1) / Good Shot (14/1) | Hashtagnotions (13/2) / Ribston Pippin (3/1) | Hashtagnotions (13/2) / Ribston Pippin (3/1) |
| 2025-10-14 Lingfield 14:00 | Yes | Kilkenny Warrior (13/8) **W** / Must Be Ten (50/1) | — / Uncertainty (8/1) | — / Corniche Girl (12/1) |
| 2025-10-14 Lingfield 15:00 | Yes | Saxonia (7/2) / Winston's Warrior (11/2) | — / Bella Perla (4/1) **W** | — / Hitched (16/1) |
| 2025-10-14 Newcastle 16:25 | Yes | Royal Blaze (6/1) / Molinari (4/1) | — / Jack Sparowe (18/5) | Jack Sparowe (18/5) / Royal Blaze (6/1) |
| 2025-10-14 Newcastle 18:00 | Yes | The Real McKay (9/2) **W** / Rain Cap (6/1) | — / — | Rain Cap (6/1) / The Real McKay (9/2) **W** |
| 2025-10-14 Dundalk 18:45 | Yes | Le Fleur Princess (14/1) / Rising Sky (5/1) | — / — | Hieloray (4/1) / Drafted (15/2) |
| 2025-10-14 Newcastle 19:00 | Yes | Lord Abama (16/1) / Havana Sky (9/1) | Havana Sky (9/1) / Lord Abama (16/1) | The Actor (18/1) / — |
| 2025-10-15 Kempton 18:10 | Yes | Red Mirage (11/2) / Pitney (50/1) | — / Kitaro Kich (5/4) **W** | Kitaro Kich (5/4) **W** / Red Mirage (11/2) |
| 2025-10-16 Chelmsford City 15:35 | Yes | Go Lockers Go (9/4) / Beach Partee (9/1) **W** | — / American Flight (5/2) | — / American Flight (5/2) |
| 2025-10-16 Chelmsford City 17:15 | Yes | Revolutionise (13/2) / Giant (11/4) | Kitaro Kich (5/2) / — | Kitaro Kich (5/2) / — |
| 2025-10-16 Chelmsford City 17:45 | Yes | My Mate Beattie (10/1) / Saidha (5/1) | — / — | Valadero (7/2) / My Mate Beattie (10/1) |
| 2025-10-16 Southwell 18:00 | Yes | Jazz Scene (85/40) **W** / Bayadere (9/1) | — / Rusheen Boy (11/1) | — / Rusheen Boy (11/1) |
| 2025-10-16 Southwell 18:30 | Yes | Fancy Dancer (8/1) / Lucius Aurelius (3/1) | Naval Ensign (11/2) / Fancy Dancer (8/1) | Naval Ensign (11/2) / Cape Sovereign (16/1) |
| 2025-10-16 Chelmsford City 18:45 | Yes | Kessaar Power (7/2) **W** / Cuban Fiesta (11/4) | — / — | Cuban Fiesta (11/4) / My Boy Harry (85/40) |
| 2025-10-16 Southwell 19:00 | Yes | Lahire (11/2) / Belaya River (3/1) | — / Inlet (13/2) | Inlet (13/2) / — |
| 2025-10-16 Chelmsford City 19:15 | Yes | Wyld Bill (11/8) **W** / Mister Daydream (13/2) | — / Blenheim Star (8/1) | Masqool (4/1) / Wyld Bill (11/8) **W** |
| 2025-10-16 Southwell 19:30 | Yes | Aoife's Thunder (9/1) / Takteek (7/2) **W** | — / — | — / Weegeebear (9/2) |
| 2025-10-17 Newcastle 15:55 | Yes | Best Adventure (9/2) **W** / Census (15/8) | Census (15/8) / Best Adventure (9/2) **W** | Census (15/8) / Best Adventure (9/2) **W** |
| 2025-10-17 Dundalk 16:15 | Yes | Trishuli River (8/1) / Boogie Inthejungle (33/1) | Boogie Inthejungle (33/1) / Cala Bonita (4/1) **W** | Cala Bonita (4/1) **W** / — |
| 2025-10-17 Newcastle 16:30 | Yes | Swinging London (4/1) **W** / Educate (3/1) | Educate (3/1) / Big Win (5/2) | Bunker Bay (12/1) / — |
| 2025-10-17 Newcastle 17:00 | Yes | Sioux Perfect (5/1) / Pull The Rug (11/1) | — / Love Olivia (13/2) | — / Love Olivia (13/2) |
| 2025-10-17 Newcastle 18:30 | Yes | Ignac Lamar (14/1) / Woodrafff (4/1) | — / Filey Beach (9/1) | — / Filey Beach (9/1) |
| 2025-10-17 Newcastle 19:00 | Yes | Kirkdale (9/1) / Political Power (7/2) | — / — | — / Bambalam (11/2) **W** |
| 2025-10-18 Wolverhampton 15:29 | Yes | Fair Wind (14/1) / Probe (9/1) | — / — | Regal Envoy (14/1) / — |
| 2025-10-18 Wolverhampton 15:59 | Yes | Massimo Blue (13/8) / How's The Guvnor (16/1) | — / Sam's Hope (5/2) **W** | Sam's Hope (5/2) **W** / Massimo Blue (13/8) |
| 2025-10-18 Wolverhampton 17:30 | Yes | Bint Al Daar (9/2) / Popeye Doyle (5/2) | Popeye Doyle (5/2) / Risen Again (14/1) | Popeye Doyle (5/2) / Risen Again (14/1) |
| 2025-10-18 Wolverhampton 18:00 | Yes | Star Of Jupiter (4/1) / T Or Coffey (6/1) | — / — | — / Witch Hazel (8/1) |
| 2025-10-20 Wolverhampton 15:55 | Yes | Diligent Henry (2/1) / Beautiful Dawn (11/2) | Beautiful Dawn (11/2) / Diligent Henry (2/1) | Beautiful Dawn (11/2) / Diligent Henry (2/1) |
| 2025-10-20 Wolverhampton 18:30 | Yes | Megaphone (18/1) / Scarboroughwarning (2/1) | Scarboroughwarning (2/1) / Megaphone (18/1) | Scarboroughwarning (2/1) / Megaphone (18/1) |
| 2025-10-20 Wolverhampton 19:30 | Yes | Little Miss India (7/4) / Meet Me In Meraki (3/1) **W** | — / — | Meet Me In Meraki (3/1) **W** / Little Miss India (7/4) |
| 2025-10-21 Newcastle 18:00 | Yes | Grey Soul (10/3) **W** / Selection (5/1) | — / Terrapin (5/4) | Terrapin (5/4) / — |
| 2025-10-21 Newcastle 18:30 | Yes | Bonnie's Boy (4/1) **W** / Kamekist (40/1) | — / — | Herakles (9/1) / Bonnie's Boy (4/1) **W** |
| 2025-10-22 Kempton 17:10 | Yes | Wild Dahlia (7/2) / Victorious One (9/4) **W** | Victorious One (9/4) **W** / Wild Dahlia (7/2) | Victorious One (9/4) **W** / Wild Dahlia (7/2) |
| 2025-10-22 Kempton 18:10 | Yes | Estmrar (7/2) / Cogitate (6/1) | Cogitate (6/1) / Blue Rc (3/1) | Cogitate (6/1) / Blue Rc (3/1) |
| 2025-10-22 Kempton 19:10 | Yes | Jersey Maverick (7/2) / Kit Gabriel (11/4) | — / King Of Ithaca (6/1) | King Of Ithaca (6/1) / Jersey Maverick (7/2) |
| 2025-10-23 Chelmsford City 16:15 | Yes | So Sassy (12/1) / Heaven Knows (9/2) | — / — | — / Fan Mail (5/1) |
| 2025-10-23 Southwell 16:30 | Yes | Mamma Maria (11/4) / Ghaiyyath Park (16/5) | Live Each Day (17/2) / Mamma Maria (11/4) | Live Each Day (17/2) / Mamma Maria (11/4) |
| 2025-10-23 Chelmsford City 17:45 | Yes | Massimo Blue (13/8) / Alafdhal (8/1) | — / — | — / General Assembly (9/2) **W** |
| 2025-10-23 Chelmsford City 18:15 | Yes | Summer Heat (2/1) / Waiting All Night (5/1) | — / Dalmally (7/1) | — / Dalmally (7/1) |
| 2025-10-23 Southwell 18:30 | Yes | Mission Command (15/2) / Valley Ofthe Kings (9/2) | Valley Ofthe Kings (9/2) / Mission Command (15/2) | Valley Ofthe Kings (9/2) / Mission Command (15/2) |
| 2025-10-23 Chelmsford City 18:45 | Yes | Jack Langley (5/4) / Home And Dry (4/1) **W** | — / — | Home And Dry (4/1) **W** / Jack Langley (5/4) |
| 2025-10-23 Southwell 19:30 | Yes | Always A Star (7/4) / Ludo's Landing (20/1) | Timeless Charm (13/2) / Always A Star (7/4) | Timeless Charm (13/2) / Always A Star (7/4) |
| 2025-10-24 Dundalk 16:45 | Yes | Dontspoilasale (8/1) / Wegotogether (9/1) | — / — | I'm Spartacus (9/1) / Dontspoilasale (8/1) |
| 2025-10-24 Dundalk 17:15 | Yes | Lismacbryan Hill (6/1) / Miss Princess (80/1) | — / Undefeatable (13/8) | Undefeatable (13/8) / Lismacbryan Hill (6/1) |
| 2025-10-24 Southwell 17:30 | Yes | Honour Whim (6/1) / Stintino Sunset (10/1) | — / — | Stintino Sunset (10/1) / Wadacre Giorgio (9/1) |
| 2025-10-24 Southwell 18:00 | Yes | Fifty Sent (15/2) / Quite Sweet (9/2) **W** | — / — | Kodebreaker (6/1) / Fifty Sent (15/2) |
| 2025-10-24 Southwell 19:00 | Yes | Star Of Mali (5/1) **W** / Al Muqdad (15/2) | — / Ziggy's Angel (8/1) | — / Savvy Exchange (10/3) |
| 2025-10-24 Southwell 19:30 | Yes | McCauley's Tavern (25/1) / My Mate Beattie (15/2) | My Mate Beattie (15/2) / Pinjarra (14/1) **W** | My Mate Beattie (15/2) / Pinjarra (14/1) **W** |
| 2025-10-25 Wolverhampton 16:25 | Yes | Vintage Heat (10/3) / Champagne Dream (9/2) | Fanjove (9/4) **W** / Sunshine And Roses (6/1) | Fanjove (9/4) **W** / Sunshine And Roses (6/1) |
| 2025-10-25 Wolverhampton 17:00 | Yes | Golden Thorn (4/1) / Lady Mariko (8/1) | — / Soho Square (9/2) | Soho Square (9/2) / Golden Thorn (4/1) |
| 2025-10-25 Wolverhampton 17:30 | Yes | Tortured Soul (12/1) / Volto Di Medusa (7/2) | — / — | Super Hit (6/1) / Tortured Soul (12/1) |
| 2025-10-25 Wolverhampton 19:00 | Yes | Noss Mayo (33/1) / Echo Of Glory (3/1) | Echo Of Glory (3/1) / Noss Mayo (33/1) | Echo Of Glory (3/1) / Noss Mayo (33/1) |
| 2025-10-27 Lingfield 13:25 | Yes | Tamather (10/1) / Sharpness (13/2) | — / — | Hello Isla (6/1) / — |
| 2025-10-27 Lingfield 13:55 | Yes | Latin (3/1) / Al Shabab (7/2) | Al Shabab (7/2) / Latin (3/1) | Al Shabab (7/2) / Sir Laurence Graff (15/2) **W** |
| 2025-10-27 Lingfield 16:15 | Yes | Unico (11/2) / Nordic Glory (7/2) | — / — | Master Dandy (10/1) / South Shore Island (9/4) |
| 2025-10-27 Wolverhampton 16:23 | Yes | Amber Honey (2/1) / Birkie Boy (9/1) | — / Boujee Gold (14/1) | — / Boujee Gold (14/1) |
| 2025-10-27 Newcastle 17:45 | Yes | Alpine Sierra (7/1) / Bowood (85/40) **W** | — / — | — / Volenti (5/2) |
| 2025-10-27 Wolverhampton 18:30 | Yes | Bizarre Law (7/1) / Classy Clarets (9/2) | Toussarok (5/1) / — | Toussarok (5/1) / Ten Club (8/1) |
| 2025-10-27 Wolverhampton 19:00 | Yes | Space Cowboy (14/1) / Abate (28/1) | Scarboroughwarning (13/8) / Lipsink (7/2) **W** | Scarboroughwarning (13/8) / Lipsink (7/2) **W** |
| 2025-10-27 Newcastle 19:45 | Yes | Goldie Trickett (10/3) / Yafaarr (7/4) **W** | Yafaarr (7/4) **W** / Goldie Trickett (10/3) | Yafaarr (7/4) **W** / Runninsonofagun (7/2) |
| 2025-10-27 Wolverhampton 20:00 | Yes | Crackalackin (16/1) / Al Rufaa (11/4) | — / King's Hand (5/4) | — / King's Hand (5/4) |
| 2025-10-28 Wolverhampton 17:00 | Yes | Von Krolock (8/11) / Flicka's Girl (16/1) | — / Autumn Angel (11/1) | Autumn Angel (11/1) / Von Krolock (8/11) |
| 2025-10-28 Wolverhampton 18:00 | Yes | Merapi (14/1) / Rye (7/2) | After Love (2/1) / — | After Love (2/1) / — |
| 2025-10-28 Wolverhampton 19:00 | Yes | Mission Possible (3/1) / Simiyann (5/4) | — / Saratoga Gold (4/1) | Saratoga Gold (4/1) / Mission Possible (3/1) |
| 2025-10-29 Kempton 16:17 | Yes | Lieutenant Kije (3/1) / Elan D'or (11/10) | Elan D'or (11/10) / Lieutenant Kije (3/1) | Dublin Bay (5/1) / Hello Humphrey (33/1) |
| 2025-10-29 Dundalk 16:35 | Yes | Showhound (14/1) / Nikki Swango (9/4) **W** | — / — | — / Hezahunk (50/1) |
| 2025-10-29 Kempton 19:30 | Yes | Caspian King (5/1) / North Star (15/2) | North Star (15/2) / Caspian King (5/1) | Wonder (16/1) / — |
| 2025-10-29 Kempton 20:00 | Yes | Triggered (7/1) / Naval Ensign (11/1) | — / Neptune Legend (9/1) | — / Neptune Legend (9/1) |
| 2025-10-30 Chelmsford City 17:15 | Yes | Woody Y Fernandez (2/1) / Oh So Perfect (4/1) | — / — | — / Miss Ayala (4/1) |
| 2025-10-30 Southwell 17:30 | Yes | Lightning Touch (15/8) / Aiming High (10/1) | — / Jindri (4/1) | — / Jindri (4/1) |
| 2025-10-30 Southwell 18:30 | Yes | Nunc Est Bibendum (17/2) / Ana Emaraaty (11/2) | Ana Emaraaty (11/2) / Top Of Pleinmont (10/3) | Doddington Guy (3/1) / — |
| 2025-10-30 Chelmsford City 18:45 | Yes | Ottawa (6/1) / Flowstate (2/1) | — / — | Flowstate (2/1) / Ottawa (6/1) |
| 2025-10-30 Chelmsford City 20:15 | Yes | Wyld Bill (6/4) / Mythical Bird (11/2) | — / — | Mythical Bird (11/2) / Wyld Bill (6/4) |
| 2025-10-30 Southwell 20:30 | Yes | Spun To Gold (9/4) **W** / Desert Beauty (14/1) | — / — | Desert Beauty (14/1) / Elvetham (11/2) |
| 2025-10-31 Southwell 16:45 | Yes | Looks Likely (50/1) / Mali Star (10/3) | Thanh Nam (15/8) / — | Thanh Nam (15/8) / — |
| 2025-10-31 Southwell 18:15 | Yes | Sanbona (14/1) / Toptime (15/2) | Good Point (3/1) / — | Good Point (3/1) / — |
| 2025-10-31 Southwell 19:15 | Yes | Rajeko (8/1) / First Principle (9/2) **W** | — / — | — / Whitcombe Rockstar (14/1) |
| 2025-10-31 Southwell 19:45 | Yes | Kondratiev Wave (14/1) / Marry The Night (6/1) | — / Kodebreaker (16/1) | — / Kodebreaker (16/1) |
| 2025-10-31 Southwell 20:15 | Yes | Outrace (9/1) / Back From Dubai (7/2) | Back From Dubai (7/2) / Heretic (13/8) **W** | Duke Orsino (40/1) / — |
| 2025-11-01 Newcastle 15:35 | Yes | Alpine Sierra (8/1) / Royal Blaze (22/1) | Educate (6/4) / Jam Lass (18/1) | Educate (6/4) / Rubellite (15/2) |
| 2025-11-01 Newcastle 17:15 | Yes | Macedonian (4/1) / Joshuas Dream (14/1) | — / — | Mu Mu Land (5/1) / Macedonian (4/1) |
| 2025-11-01 Newcastle 18:15 | Yes | Song N Dance (4/1) **W** / Sea Legend (18/5) | Sea Legend (18/5) / Song N Dance (4/1) **W** | Sea Legend (18/5) / Song N Dance (4/1) **W** |
| 2025-11-01 Newcastle 18:45 | Yes | Beelzebub (9/1) / Profiteer (9/1) | — / — | The Green Man (7/2) / — |
| 2025-11-03 Kempton 13:00 | Yes | Jazz Scene (85/40) / Super Hit (9/2) | — / — | — / Mbappe (4/1) |
| 2025-11-03 Wolverhampton 17:00 | Yes | Moira Express (11/2) / Ophelia Grace (3/1) | — / — | Capitalization (7/2) / — |
| 2025-11-03 Wolverhampton 18:00 | Yes | Von Krolock (11/4) **W** / Bandello (4/1) | — / — | — / I Can Imagine (8/1) |
| 2025-11-03 Wolverhampton 18:30 | Yes | Profit Street (9/4) / Mintana (16/1) | Mintana (16/1) / How's The Guvnor (5/1) | Mintana (16/1) / How's The Guvnor (5/1) |
| 2025-11-03 Southwell 18:45 | Yes | Mae Amor (12/1) / Dandy Magic (13/2) | — / — | Quandary (5/1) / Mae Amor (12/1) |
| 2025-11-03 Southwell 19:15 | Yes | Yellow Card (28/1) / Rukaana (18/1) | — / Eupator (10/3) | — / Enthused (33/1) |
| 2025-11-03 Southwell 19:45 | Yes | T Or Coffey (11/10) / Lawmans Blis (28/1) | — / Billy Bathgate (10/1) | — / Billy Bathgate (10/1) |
| 2025-11-03 Wolverhampton 20:00 | Yes | Sam's Xpress (11/10) / Azucena (25/1) | — / Kento (17/2) | — / Kento (17/2) |
| 2025-11-03 Southwell 20:15 | Yes | Vince Lombardi (9/2) **W** / Nacho Nacho Nacho (4/1) | — / Moostar (18/1) | — / Moostar (18/1) |
| 2025-11-03 Wolverhampton 20:30 | Yes | Sir Laurence Graff (4/1) / Staffordshire (8/1) | Lady Aiyana (7/1) / Sir Laurence Graff (4/1) | Lady Aiyana (7/1) / This Time Maybe (7/1) |
| 2025-11-04 Wolverhampton 14:52 | Yes | On The Right Track (8/1) / Naughty Niall (4/1) **W** | Knight Of Magic (5/4) / — | Starfighter (12/1) / Knight Of Magic (5/4) |
| 2025-11-04 Wolverhampton 15:22 | Yes | Maris Angel (9/4) **W** / Good Earth (10/1) | Simply Blue (5/1) / Maris Angel (9/4) **W** | Simply Blue (5/1) / Maris Angel (9/4) **W** |
| 2025-11-04 Lingfield 15:40 | Yes | Three On Thursday (9/2) / Taskheer (9/1) | — / — | Taskheer (9/1) / Three On Thursday (9/2) |
| 2025-11-04 Wolverhampton 15:52 | Yes | Filly Foden (13/8) / No Claims Bonus (11/4) | — / Havin A Flyer (15/2) | Havin A Flyer (15/2) / Filly Foden (13/8) |
| 2025-11-04 Wolverhampton 18:00 | Yes | Stratocracy (11/2) / The Hare Rail (6/1) | Sant Alessio (14/1) **W** / Political Power (11/4) | Political Power (11/4) / Sant Alessio (14/1) **W** |
| 2025-11-04 Wolverhampton 18:30 | Yes | Kingsclere (7/2) / Magic Runner (16/1) | — / Strobelight (5/1) | Mr Nugget (9/2) **W** / Strobelight (5/1) |
| 2025-11-05 Dundalk 13:45 | Yes | Velvet Skies (10/3) / Dontspoilasale (4/1) | — / — | — / Just Jump (13/2) |
| 2025-11-05 Kempton 14:20 | Yes | Revich (9/2) / Amica (7/1) | Amica (7/1) / Revich (9/2) | Prefer The Sister (11/2) / — |
| 2025-11-05 Dundalk 15:50 | Yes | Nikki Swango (11/8) **W** / Irish Rumour (6/1) | Wellwhatshappenin (5/1) / Nikki Swango (11/8) **W** | Wellwhatshappenin (5/1) / Nikki Swango (11/8) **W** |
| 2025-11-05 Kempton 17:00 | Yes | Arctic Dawn (9/2) / Warrior Mode (13/2) | — / — | — / Jewelry (22/1) |
| 2025-11-05 Dundalk 17:20 | Yes | Kodi Brown (9/2) / Limestone Red (13/2) | — / Porsche Lad (15/8) | Porsche Lad (15/8) / Kodi Brown (9/2) |
| 2025-11-05 Kempton 18:00 | Yes | Cameley Days (9/2) / Southbank (9/2) | — / — | — / Hallowed Time (10/1) |
| 2025-11-06 Newcastle 14:45 | Yes | Madame Koko (20/1) / Athenian Spirit (13/2) | Athenian Spirit (13/2) / Madame Koko (20/1) | Athenian Spirit (13/2) / Madame Koko (20/1) |
| 2025-11-06 Chelmsford City 16:45 | Yes | Captain Cairney (4/6) / Onyeisi (8/1) **W** | — / — | Time For Action (11/2) / Captain Cairney (4/6) |
| 2025-11-06 Newcastle 17:00 | Yes | Bonnie's Boy (5/2) / Easy Peeler (14/1) | — / — | Easy Peeler (14/1) / Bonnie's Boy (5/2) |
| 2025-11-06 Newcastle 17:30 | Yes | Coramento (11/4) **W** / Concert Boy (7/2) | — / — | — / Weegeebear (25/1) |
| 2025-11-06 Newcastle 18:00 | Yes | Bad Habits (25/1) / Chasing Gold (14/1) | — / Uncle Sam (5/1) | Uncle Sam (5/1) / Bad Habits (25/1) |
| 2025-11-06 Newcastle 18:30 | Yes | Bibendum (10/3) / Freak Encounter (33/1) | — / Pancake (7/1) | Pancake (7/1) / Bibendum (10/3) |
| 2025-11-06 Chelmsford City 19:15 | Yes | Lipsink (10/1) / Giant (4/1) | — / Valley Ofthe Kings (4/1) **W** | Valley Ofthe Kings (4/1) **W** / Lipsink (10/1) |
| 2025-11-06 Chelmsford City 19:45 | Yes | General Assembly (5/1) **W** / Mart (3/1) | Mart (3/1) / General Assembly (5/1) **W** | Mart (3/1) / General Assembly (5/1) **W** |
| 2025-11-06 Chelmsford City 20:15 | Yes | Love Your Work (8/1) / Coolree (15/2) | — / Glorious Kitty (3/1) | Glorious Kitty (3/1) / Love Your Work (8/1) |
| 2025-11-07 Newcastle 14:18 | Yes | Midnight Lion (14/1) / Winter Flower (7/2) | — / — | Winter Flower (7/2) / Midnight Lion (14/1) |
| 2025-11-07 Newcastle 16:30 | Yes | Without Flaw (33/1) / Mersea (20/1) | — / — | — / Spirit Of Applause (11/8) |
| 2025-11-07 Dundalk 17:15 | Yes | Lunigiana (5/4) **W** / Masked Angel (11/4) | — / — | — / Whatswrongnow (5/1) |
| 2025-11-07 Newcastle 17:30 | Yes | It's A Love Thing (14/1) / Volto Di Medusa (10/1) | — / Betty Bassett (15/2) | — / Betty Bassett (15/2) |
| 2025-11-07 Newcastle 18:00 | Yes | Ignac Lamar (5/1) / Front Gunner (6/1) **W** | Yafaarr (9/4) / Vizzavona Lady (6/1) | Yafaarr (9/4) / Vizzavona Lady (6/1) |
| 2025-11-07 Dundalk 18:15 | Yes | Benavente (6/1) / Sarmiento Power (10/3) | — / Cherry Pink (9/1) | Cherry Pink (9/1) / Benavente (6/1) |
| 2025-11-07 Newcastle 18:30 | Yes | Fulford Cross (28/1) / Eden Storm (5/1) **W** | Eden Storm (5/1) **W** / Pit Boss (7/1) | Pit Boss (7/1) / Evocative Spark (4/1) |
| 2025-11-07 Dundalk 20:30 | Yes | Alex Belardo (9/2) / Ballymagreehan (3/1) | — / — | Johnny's Oasis (10/3) **W** / — |
| 2025-11-08 Wolverhampton 14:50 | Yes | Aajej (5/1) / Diamond Bay (17/2) | — / Earnest Belief (5/2) | — / Earnest Belief (5/2) |
| 2025-11-08 Wolverhampton 17:30 | Yes | Al Muqdad (10/11) **W** / Tortured Soul (12/1) | — / — | Tortured Soul (12/1) / Al Muqdad (10/11) **W** |
| 2025-11-08 Wolverhampton 18:00 | Yes | Beaumadier (15/8) **W** / Pearl's Edge (40/1) | — / Call Time (9/2) | — / Call Time (9/2) |
| 2025-11-08 Wolverhampton 18:30 | Yes | Invited (12/1) / Great Blasket (33/1) | — / City Of Poets (5/2) **W** | City Of Poets (5/2) **W** / Parlando (14/1) |
| 2025-11-12 Dundalk 14:40 | Yes | Dontspoilasale (2/1) / Just Jump (16/1) | — / Cash Me (14/1) | — / Tomarlo (9/4) |
| 2025-11-12 Dundalk 15:10 | Yes | Elly Bay (9/4) / California Baby (33/1) | — / One Cool Bear (7/1) | — / One Cool Bear (7/1) |
| 2025-11-12 Dundalk 17:10 | Yes | Wegotogether (10/1) / Oiche Rua (7/2) **W** | Oiche Rua (7/2) **W** / I'm Spartacus (15/2) | I'm Spartacus (15/2) / — |
| 2025-11-14 Dundalk 18:30 | Yes | Queen Leila (28/1) / Pints In Peace (4/1) | Pints In Peace (4/1) / Badger's Cove (6/4) **W** | Manifest Destiny (7/2) / — |
| 2025-11-14 Dundalk 19:30 | Yes | Hexagonal (11/1) / Wonderfulwonderful (9/4) | Wonderfulwonderful (9/4) / Soaring Sun (10/1) | Eastern Peace (4/1) **W** / — |
| 2025-11-17 Newcastle 18:40 | Yes | La Scanderbeide (3/1) / Bernalda (10/1) | — / — | Stateira (5/2) **W** / La Scanderbeide (3/1) |
| 2025-11-18 Newcastle 15:45 | Yes | Ana Emaraaty (14/1) / Billy No Mates (28/1) | Educate (5/2) / Ana Emaraaty (14/1) | Educate (5/2) / Ana Emaraaty (14/1) |
| 2025-11-18 Newcastle 16:15 | Yes | Mereside Princess (9/1) / Yorkshire Queen (4/1) | The Tunguska Event (8/11) / Mereside Princess (9/1) | The Tunguska Event (8/11) / — |
| 2025-11-18 Newcastle 18:15 | Yes | Sherlock (9/4) / Sanditon (17/2) | Sanditon (17/2) / Sherlock (9/4) | Sanditon (17/2) / Minshaar (13/2) **W** |
| 2025-11-18 Newcastle 18:45 | Yes | Flash The Dash (7/1) / Haworth Star (17/2) | — / My Mate Beattie (12/1) | — / My Mate Beattie (12/1) |
| 2025-11-18 Newcastle 19:15 | Yes | Korroor (11/8) / Rory (7/2) | — / — | — / Ramon Di Loria (12/1) |
| 2025-11-19 Dundalk 14:20 | Yes | Sakakawea (14/1) / Fleetfootsoldier (9/2) **W** | — / Distillate (11/2) | — / Distillate (11/2) |
| 2025-11-19 Dundalk 14:55 | Yes | Monvoe (9/2) / Enthusiastically (4/1) | — / — | Enthusiastically (4/1) / Monvoe (9/2) |
| 2025-11-19 Dundalk 15:55 | Yes | Everylittlestep (11/2) / Hexagonal (33/1) | — / Ozark Daze (8/1) | Ozark Daze (8/1) / Moyassr (7/2) |
| 2025-11-19 Kempton 16:05 | Yes | Threatening (5/2) / Dapper Gee Gee (50/1) | — / — | Frostmagic (4/1) / Threatening (5/2) |
| 2025-11-19 Dundalk 16:55 | Yes | Kitty Bear (9/1) / Nibras Rainbow (16/1) **W** | Nibras Rainbow (16/1) **W** / Thompson Gunner (7/5) | Nibras Rainbow (16/1) **W** / Thompson Gunner (7/5) |
| 2025-11-19 Kempton 17:40 | Yes | First Principle (10/3) / Silver Peak (4/1) | — / Local Hero (7/2) | — / Local Hero (7/2) |
| 2025-11-19 Kempton 19:10 | Yes | Hello It's Me (10/1) / From The Hip (4/1) **W** | From The Hip (4/1) **W** / Hello It's Me (10/1) | From The Hip (4/1) **W** / Hello It's Me (10/1) |
| 2025-11-19 Kempton 19:40 | Yes | Siobhanbrogan (18/1) / Justcallmepete (10/3) **W** | Justcallmepete (10/3) **W** / Siobhanbrogan (18/1) | Cayman Tai (4/1) / — |
| 2025-11-20 Lingfield 11:10 | Yes | Phaedra (25/1) / Universal Story (16/1) | Crackalackin (11/2) **W** / Age Of Time (5/4) | Crackalackin (11/2) **W** / Age Of Time (5/4) |
| 2025-11-20 Lingfield 15:05 | Yes | Penelope Valentine (7/1) **W** / Ghaiyyath Park (22/1) | — / Vizzavona Lady (5/1) | — / Summertime Blues (6/1) |
| 2025-11-20 Southwell 17:00 | Yes | Francesi (6/1) / Hashtagnotions (12/1) | Hashtagnotions (12/1) / Marry The Night (10/3) **W** | Hashtagnotions (12/1) / Mapledurham (11/1) |
| 2025-11-20 Newcastle 17:15 | Yes | Sanbona (9/2) / Invincible Annice (9/4) **W** | — / Desert Champion (7/2) | Desert Champion (7/2) / — |
| 2025-11-20 Newcastle 17:45 | Yes | Marching Mac (22/1) / Dark Cloud Rising (4/1) **W** | — / Lethal Nymph (10/3) | — / Lethal Nymph (10/3) |
| 2025-11-20 Newcastle 18:15 | Yes | Call Me Betty (9/4) / Soho Square (7/2) | — / Hilltop (7/2) | — / Hilltop (7/2) |
| 2025-11-20 Newcastle 18:45 | Yes | Overlooked (7/1) / Goldmoyne (2/1) | Goldmoyne (2/1) / Overlooked (7/1) | Concert Boy (7/1) **W** / — |
| 2025-11-20 Southwell 19:00 | Yes | Berkshire Sundance (15/8) / Robusto (25/1) | — / — | — / Ribble Vibe (3/1) |
| 2025-11-20 Newcastle 19:15 | Yes | Sibyl Charm (3/1) / Yorkshire Glory (9/4) | Rambuso Creek (5/1) / — | Rambuso Creek (5/1) / — |
| 2025-11-20 Southwell 20:00 | Yes | Susiesparkle (66/1) / Haliphon (11/2) | Young Endless (5/1) **W** / Ana Emaraaty (9/4) | Alex The Great (28/1) / Tightly Bound (14/1) |
| 2025-11-20 Southwell 20:30 | Yes | Cannon Rock (7/2) / Little Miss India (6/1) | — / Appier (20/1) | — / Appier (20/1) |
| 2025-11-21 Southwell 16:30 | Yes | Bin Ajwad (13/8) **W** / Tribal Wisdom (6/1) | — / Bella Perla (5/2) | Bella Perla (5/2) / Bin Ajwad (13/8) **W** |
| 2025-11-21 Southwell 17:00 | Yes | Special Ghaiyyath (9/4) / Almekarem (20/1) | — / Borgi (13/2) | — / Borgi (13/2) |
| 2025-11-21 Southwell 17:30 | Yes | Captain Parma (10/1) / Star Of Mali (16/5) | — / He's A Gentleman (20/1) | He's A Gentleman (20/1) / Captain Parma (10/1) |
| 2025-11-21 Dundalk 17:45 | Yes | Jackie Brown (6/1) / Hero Of The Hour (9/2) | — / Lismacbryan Hill (7/2) **W** | Lismacbryan Hill (7/2) **W** / Jackie Brown (6/1) |
| 2025-11-21 Southwell 19:00 | Yes | Mr Nugget (10/3) / Dust Cover (15/2) **W** | Kingsclere (14/1) / Mr Nugget (10/3) | Kingsclere (14/1) / Mr Nugget (10/3) |
| 2025-11-21 Dundalk 19:45 | Yes | Preparations (12/1) / Convincing (6/1) | Ozark Daze (10/3) / Preparations (12/1) | Ozark Daze (10/3) / Preparations (12/1) |
| 2025-11-21 Dundalk 20:15 | Yes | Vivacious Lady (10/1) / My Vonnie (6/1) | My Vonnie (6/1) / Mr Mills (10/1) | Syosset (7/1) / — |
| 2025-11-21 Southwell 20:30 | Yes | Miss Mendoza (16/1) / Son Of Astar (14/1) | — / — | — / Sam's Hope (17/2) **W** |
| 2025-11-22 Newcastle 15:30 | Yes | Present Times (33/1) / King's Hand (11/4) | King's Hand (11/4) / Izzari (8/1) | Desert Emperor (22/1) **W** / — |
| 2025-11-22 Wolverhampton 17:55 | Yes | Gogo Yubari (13/2) / Juno Star (9/2) | — / — | Juno Star (9/2) / Gogo Yubari (13/2) |
| 2025-11-22 Newcastle 18:10 | Yes | Novak (18/1) / Ziggy's Condor (4/1) | — / — | — / Dandy Magic (6/1) **W** |
| 2025-11-22 Newcastle 18:40 | Yes | Lesley's Boy (4/1) / Judicature (10/3) | Fortamour (9/2) **W** / Kirkdale (11/2) | Fortamour (9/2) **W** / Kirkdale (11/2) |
| 2025-11-22 Newcastle 19:10 | Yes | Look Back Smiling (17/2) / Jesmond Dawn (9/2) | — / — | Powerful Response (7/1) / Look Back Smiling (17/2) |
| 2025-11-22 Newcastle 19:40 | Yes | How's The Guvnor (11/2) / Tiger Tower (14/1) | — / Tootsie (11/1) | Tootsie (11/1) / How's The Guvnor (11/2) |
| 2025-11-24 Newcastle 14:50 | Yes | Tracker Issue (11/2) / Nakatomi (18/1) | Nakatomi (18/1) / Cascade Hall (13/2) | Alfred Spero (6/4) / — |
| 2025-11-24 Newcastle 15:25 | Yes | Havachoc (12/1) / Violeta (28/1) | Wadacre Giorgio (4/1) / — | Wadacre Giorgio (4/1) / — |
| 2025-11-24 Newcastle 17:45 | Yes | Shamacid (8/1) / Raveena (3/1) | — / — | — / Hostility (9/2) |
| 2025-11-24 Wolverhampton 18:00 | Yes | Prince Quattro (11/2) / Safe And Sound (7/2) | Safe And Sound (7/2) / Prince Quattro (11/2) | Cardinal Point (3/1) / — |
| 2025-11-24 Newcastle 18:15 | Yes | Camzara (20/1) / Electric Avenue (4/1) **W** | Electric Avenue (4/1) **W** / Camzara (20/1) | Second Fiddle (3/1) / — |
| 2025-11-24 Wolverhampton 18:30 | Yes | Rye (12/1) / Flowstate (13/2) | Flowstate (13/2) / Act Of Violence (2/1) | Act Of Violence (2/1) / — |
| 2025-11-24 Newcastle 18:45 | Yes | Blufferonthebus (18/1) **W** / Judgment Call (10/3) | Judgment Call (10/3) / Jesmond Dawn (5/2) | Jesmond Dawn (5/2) / — |
| 2025-11-24 Wolverhampton 19:00 | Yes | The Dragon King (11/1) **W** / Force And Valour (10/1) | Force And Valour (10/1) / The Dragon King (11/1) **W** | United Approach (15/2) / Mae Amor (33/1) |
| 2025-11-24 Newcastle 19:15 | Yes | Yafaarr (5/2) / Emery Down (6/1) | — / Studious (7/1) **W** | — / Studious (7/1) **W** |
| 2025-11-24 Wolverhampton 19:30 | Yes | Liv My Life (6/1) / Beaming Light (9/2) | — / Antiquity (11/2) | — / Ernie's Valentine (4/1) **W** |
| 2025-11-24 Wolverhampton 20:00 | Yes | Dark Rosa (7/2) **W** / Troy Story (4/1) | — / Serious Look (11/4) | — / Serious Look (11/4) |
| 2025-11-25 Lingfield 12:00 | Yes | Lilly Lux (100/1) / Baikal (7/2) | Baikal (7/2) / Al Rufaa (7/4) | Wyld Bill (9/2) **W** / — |
| 2025-11-25 Lingfield 12:30 | Yes | Orbaan (16/1) / Oj Lifestyle (14/1) | — / — | Meet Me In Meraki (16/1) / Orbaan (16/1) |
| 2025-11-25 Lingfield 13:00 | Yes | Havana Sky (7/2) / Mumayaz (6/1) | — / Danger Alert (6/1) | — / Danger Alert (6/1) |
| 2025-11-25 Lingfield 14:10 | Yes | Blue Empress (16/1) / Graduated (6/1) | — / — | — / Holy Fire (7/4) |
| 2025-11-25 Lingfield 14:45 | Yes | Rajeteriat (9/1) / Roman Spring (11/4) **W** | South Shore Island (9/2) / — | South Shore Island (9/2) / — |
| 2025-11-25 Lingfield 15:20 | Yes | Raqraaq (5/1) / Onlyriversrunfree (66/1) | Dubai Harbour (15/2) / Raqraaq (5/1) | Dubai Harbour (15/2) / Zaltalla (13/2) |
| 2025-11-25 Wolverhampton 17:30 | Yes | Conscript (8/1) / So Darn Hot (16/1) | So Darn Hot (16/1) / Sarab Star (4/5) **W** | Sarab Star (4/5) **W** / — |
| 2025-11-25 Wolverhampton 18:00 | Yes | Oh So Perfect (4/1) / Rendita (66/1) | — / Molly Mac (13/2) | Molly Mac (13/2) / Oh So Perfect (4/1) |
| 2025-11-25 Wolverhampton 19:00 | Yes | Rinky Tinky Tinky (17/2) / Alafdhal (7/4) | — / — | Alafdhal (7/4) / Rinky Tinky Tinky (17/2) |
| 2025-11-25 Wolverhampton 19:30 | Yes | Rock Master (10/3) / Call Glory (16/5) | Woodhay Whisper (9/4) **W** / Rock Master (10/3) | Woodhay Whisper (9/4) **W** / Rock Master (10/3) |
| 2025-11-25 Wolverhampton 20:30 | Yes | Lightning Touch (15/2) / Percy Jones (5/1) | — / — | Aiming High (6/1) / Lightning Touch (15/2) |
| 2025-11-26 Southwell 11:30 | Yes | Zooks (10/1) / Throne Hall (14/1) | Young Endless (3/1) **W** / — | Young Endless (3/1) **W** / Billy Bathgate (8/1) |
| 2025-11-26 Southwell 13:30 | Yes | Must Believe (11/2) **W** / Life Is Rosie (14/1) | Westcombe (6/4) / Must Believe (11/2) **W** | Westcombe (6/4) / Must Believe (11/2) **W** |
| 2025-11-26 Southwell 15:05 | Yes | Good Banter (4/1) / Thurso (13/2) | Thurso (13/2) / Good Banter (4/1) | Thurso (13/2) / Good Banter (4/1) |
| 2025-11-26 Dundalk 15:18 | Yes | Sonoran (4/1) / Far From Dandy (13/2) **W** | — / Perfect Judgement (6/1) | — / Perfect Judgement (6/1) |
| 2025-11-26 Newcastle 15:30 | Yes | Prince Achille (10/3) / Rock Armour (18/1) | — / Woodleigh (5/1) | Woodleigh (5/1) / Prince Achille (10/3) |
| 2025-11-26 Newcastle 17:30 | Yes | Volenti (3/1) / Cooperation (11/2) | — / — | Coolree (11/2) / Volenti (3/1) |
| 2025-11-26 Newcastle 18:00 | Yes | Ardaddy (9/4) / Invincible Annice (11/2) | Teardrops (2/1) **W** / Ardaddy (9/4) | Teardrops (2/1) **W** / Ardaddy (9/4) |
| 2025-11-26 Newcastle 18:30 | Yes | Tiriac (2/1) / Binadham (11/2) | Binadham (11/2) / King's Crown (5/1) **W** | King's Crown (5/1) **W** / — |
| 2025-11-26 Chelmsford City 18:45 | Yes | Forglen (2/1) / Belle Amie (3/1) | Belle Amie (3/1) / Forglen (2/1) | Belle Amie (3/1) / Fornido (8/1) |
| 2025-11-26 Newcastle 19:00 | Yes | Spun To Gold (6/5) **W** / Em Jay Kay (8/1) | Em Jay Kay (8/1) / Spun To Gold (6/5) **W** | Em Jay Kay (8/1) / Spun To Gold (6/5) **W** |
| 2025-11-26 Chelmsford City 19:15 | Yes | Sensorium (13/2) / Justcallmepete (9/2) **W** | — / — | Justcallmepete (9/2) **W** / Sensorium (13/2) |
| 2025-11-26 Chelmsford City 20:15 | Yes | Egoiste (12/1) / Betty Bassett (10/3) | Love Your Work (2/1) **W** / — | Love Your Work (2/1) **W** / Holly Holy (16/1) |
| 2025-11-27 Newcastle 15:28 | Yes | Jez Bomb (10/3) / Project Geofin (7/2) | Project Geofin (7/2) / Triple Force (9/1) | Project Geofin (7/2) / Triple Force (9/1) |
| 2025-11-27 Newcastle 17:15 | Yes | Aalto (15/2) / First Ambition (4/1) | First Ambition (4/1) / Unassuming (4/1) | First Ambition (4/1) / Nikovo (11/1) |
| 2025-11-27 Chelmsford City 17:30 | Yes | Thanh Nam (7/2) **W** / Mali Star (9/2) | — / Diamond Ali (4/1) | — / Diamond Ali (4/1) |
| 2025-11-27 Newcastle 17:45 | Yes | Desert Champion (9/1) / Papa Don't Preach (12/1) | — / Pockley (6/1) | — / Pockley (6/1) |
| 2025-11-27 Chelmsford City 18:30 | Yes | Rogue Identity (18/5) / Spring (22/1) | Spring (22/1) / Rusheen Boy (9/4) | Rusheen Boy (9/4) / Gladiadora (10/3) **W** |
| 2025-11-27 Newcastle 18:45 | Yes | Filly One (4/1) **W** / Bright (5/1) | — / Arnhem (17/2) | — / Secret Guest (4/1) |
| 2025-11-27 Chelmsford City 19:00 | Yes | Master Dandy (14/1) / All Too Beautiful (13/2) **W** | — / Calafrio (1/1) | Calafrio (1/1) / Master Dandy (14/1) |
| 2025-11-27 Newcastle 19:15 | Yes | Marcello Si (50/1) / Desert Beauty (12/1) | Invincible Love (5/1) / — | Invincible Love (5/1) / Kondratiev Wave (5/1) |
| 2025-11-27 Chelmsford City 19:30 | Yes | Diego El Queso (4/1) / Race To The Stars (11/4) | Londoner (12/1) / Diego El Queso (4/1) | Londoner (12/1) / — |
| 2025-11-27 Chelmsford City 20:30 | Yes | Kindest Nation (15/2) / Merapi (18/1) | — / Stratocracy (3/1) **W** | Stratocracy (3/1) **W** / Kindest Nation (15/2) |
| 2025-11-28 Southwell 15:15 | Yes | Habooba (33/1) / Zoum Zoum (11/4) | — / Invictus Gold (12/1) | Invictus Gold (12/1) / Habooba (33/1) |
| 2025-11-28 Southwell 15:45 | Yes | Stay Sharp (11/1) / Snaafy (10/1) | — / Raging Raj (4/5) **W** | Raging Raj (4/5) **W** / Stay Sharp (11/1) |
| 2025-11-28 Dundalk 17:25 | Yes | Just Jump (4/1) / Steel Magnolia (8/1) | — / Masked Angel (9/4) | Masked Angel (9/4) / Just Jump (4/1) |
| 2025-11-28 Southwell 17:45 | Yes | Mumayaz (3/1) **W** / Massimo Blue (17/2) | — / — | — / Raft Up (15/2) |
| 2025-11-28 Southwell 18:45 | Yes | Sturlasson (6/4) / Blinky (7/2) | — / — | — / Cloud King (10/1) |
| 2025-11-28 Dundalk 19:00 | Yes | Stone Bear (7/1) / Dream Legend (80/1) | — / Kc Bear (14/1) | — / Kc Bear (14/1) |
| 2025-11-28 Dundalk 19:30 | Yes | Shamanka (22/1) / Nikki Swango (4/1) | Nikki Swango (4/1) / Shamanka (22/1) | Nikki Swango (4/1) / Tomarlo (5/2) |
| 2025-11-28 Dundalk 20:30 | Yes | Fixation (5/4) **W** / Benavente (13/2) | — / Magna Gee Gee (25/1) | Cherry Pink (15/2) / Magna Gee Gee (25/1) |
| 2025-11-29 Wolverhampton 17:00 | Yes | Lavender Gold (13/8) / Urgent Call (7/1) | — / — | — / Charlotte Corday (9/1) **W** |
| 2025-11-29 Wolverhampton 18:00 | Yes | Bahadur (6/4) **W** / Arqoob (25/1) | Mersea Island (2/1) / Bahadur (6/4) **W** | Mersea Island (2/1) / — |
| 2025-11-29 Wolverhampton 18:30 | Yes | Woodhay Whisper (3/1) / Neptune Legend (13/2) **W** | — / — | — / Lastchancezouloon (15/2) |
| 2025-11-29 Wolverhampton 19:00 | Yes | Simply Blue (5/2) / Cotiere (22/1) | Cotiere (22/1) / Simply Blue (5/2) | Cotiere (22/1) / Simply Blue (5/2) |
| 2025-11-29 Wolverhampton 19:30 | Yes | Prodigal Son (12/1) / Straight A (11/8) | Straight A (11/8) / Zu Run (7/2) | Enpassant (9/1) / Zu Run (7/2) |
| 2025-11-29 Wolverhampton 20:00 | Yes | Peregrine Falcon (5/1) / Speed Of Maajid (5/2) | Hint Of Humour (4/1) **W** / Peregrine Falcon (5/1) | Hint Of Humour (4/1) **W** / Peregrine Falcon (5/1) |
| 2025-11-29 Wolverhampton 20:30 | Yes | Seraphic (25/1) / So Alex (11/10) **W** | So Alex (11/10) **W** / Hackney Diamonds (12/1) | So Alex (11/10) **W** / Hackney Diamonds (12/1) |
| 2025-12-01 Kempton 14:27 | Yes | Foreseen (3/1) **W** / Studious (7/2) | — / — | Studious (7/2) / Foreseen (3/1) **W** |
| 2025-12-01 Kempton 14:57 | Yes | Final Night (15/8) **W** / Rainwater (5/1) | — / — | — / Marsh Benham (25/1) |
| 2025-12-01 Kempton 15:57 | Yes | Mythical Composer (17/2) **W** / Metaverse (6/1) | — / United Approach (7/4) | — / United Approach (7/4) |
| 2025-12-01 Kempton 16:32 | Yes | Mission Possible (13/8) **W** / Little Miss India (4/1) | Little Miss India (4/1) / Mandana (9/4) | Little Miss India (4/1) / Fool Again (18/1) |
| 2025-12-01 Wolverhampton 17:30 | Yes | Your Love (85/40) / Maris Angel (5/2) **W** | — / — | — / Starproof (4/1) |
| 2025-12-01 Wolverhampton 18:00 | Yes | I Can Imagine (13/2) / Forest Gunner (5/1) | Forest Gunner (5/1) / I Can Imagine (13/2) | Forest Gunner (5/1) / I Can Imagine (13/2) |
| 2025-12-01 Wolverhampton 20:00 | Yes | Study Of Motion (11/2) / The Dark Baron (1/2) | The Dark Baron (1/2) / Study Of Motion (11/2) | The Dark Baron (1/2) / Token Love (25/1) |
| 2025-12-01 Wolverhampton 20:30 | Yes | Revich (11/1) / Dingwall (5/4) **W** | — / Mr Nugget (4/1) | — / Mr Nugget (4/1) |
| 2025-12-02 Lingfield 13:30 | Yes | Quite Sweet (11/4) / Warrnambool (4/1) | — / — | Warrnambool (4/1) / Chico Dulce (5/2) |
| 2025-12-02 Lingfield 14:30 | Yes | Ciotog (28/1) / Bintazzo (6/1) | Bintazzo (6/1) / Salaria (6/1) **W** | Masqool (12/1) / — |
| 2025-12-02 Newcastle 15:12 | Yes | Trojan Sun (12/1) / Return To Dubai (33/1) **W** | — / Machete (2/1) | Machete (2/1) / Trojan Sun (12/1) |
| 2025-12-02 Newcastle 17:45 | Yes | Coloane (18/1) / Concert Boy (16/5) | Concert Boy (16/5) / Good Karma (12/1) | Concert Boy (16/5) / Tasever (9/2) |
| 2025-12-02 Newcastle 18:15 | Yes | Novak (28/1) / Bajan Bandit (14/1) **W** | Jesmond Dawn (5/1) / Novak (28/1) | Jesmond Dawn (5/1) / King's School (9/2) |
| 2025-12-02 Newcastle 18:45 | Yes | State Of Madness (11/4) **W** / Thunderstorm Katie (10/1) | Hunky Dory (3/1) / State Of Madness (11/4) **W** | Hunky Dory (3/1) / State Of Madness (11/4) **W** |
| 2025-12-03 Lingfield 11:30 | Yes | Sovereign Wealth (11/8) / Balthamos (10/3) | — / — | Balthamos (10/3) / Sovereign Wealth (11/8) |
| 2025-12-03 Lingfield 13:00 | Yes | Thundering Breeze (9/2) / Arenas Del Tiempo (16/1) | Knight Of Magic (2/1) / — | Knight Of Magic (2/1) / — |
| 2025-12-03 Lingfield 15:05 | Yes | Alashos (20/1) / Goldmoyne (5/4) | Lahina Bay (5/1) / Alashos (20/1) | Lahina Bay (5/1) / Alashos (20/1) |
| 2025-12-03 Lingfield 15:35 | Yes | Ziggy's Triton (5/1) / Solar Edge (5/1) | — / — | — / Mc Loven (2/1) |
| 2025-12-03 Dundalk 16:55 | Yes | Mveve (14/1) / Nikki Swango (1/1) **W** | — / — | Nikki Swango (1/1) **W** / Mveve (14/1) |
| 2025-12-03 Kempton 20:10 | Yes | Woodstock City (8/1) / Romantic Spirit (11/1) | — / — | Wyld Bill (11/10) **W** / — |
| 2025-12-04 Chelmsford City 18:30 | Yes | Moostar (33/1) / Baba Reza (9/2) | Danger Alert (13/2) / Moostar (33/1) | Danger Alert (13/2) / Moostar (33/1) |
| 2025-12-04 Chelmsford City 19:00 | Yes | Havana Gila (9/2) / Ezra Cee (9/1) | — / Lightning Bear (9/2) | — / Lightning Bear (9/2) |
| 2025-12-04 Chelmsford City 19:30 | Yes | Onemorenomore (7/2) / Nubough (40/1) | — / Toussarok (16/1) | Toussarok (16/1) / Onemorenomore (7/2) |
| 2025-12-04 Chelmsford City 20:00 | Yes | Beauty By My Side (7/1) / Lady Of Arabia (4/1) **W** | — / — | Life Is Rosie (15/2) / — |
| 2025-12-04 Chelmsford City 20:30 | Yes | Ribston Pippin (9/1) / Dingwall (5/4) | Dingwall (5/4) / Al Shabab (8/1) | Al Shabab (8/1) / Lady Aiyana (18/1) |
| 2025-12-05 Newcastle 16:15 | Yes | Panthere Noir (14/1) / Smartanck (6/1) | Senor Campanaro (7/4) **W** / — | Senor Campanaro (7/4) **W** / — |
| 2025-12-05 Dundalk 17:00 | Yes | Prairie Girl (2/1) **W** / Billboa (16/1) | — / Sporting Hero (9/2) | — / Sporting Hero (9/2) |
| 2025-12-05 Dundalk 18:00 | Yes | Daler (2/1) / Instant Appeal (2/1) **W** | — / — | Instant Appeal (2/1) **W** / Daler (2/1) |
| 2025-12-05 Newcastle 19:15 | Yes | Concert Boy (6/5) / Sir Maxi (25/1) | — / — | — / Aisling Oscar (7/4) **W** |
| 2025-12-05 Dundalk 20:00 | Yes | Numidia (11/2) / Nibras Rainbow (10/1) | Nibras Rainbow (10/1) / Numidia (11/2) | Nibras Rainbow (10/1) / Numidia (11/2) |
| 2025-12-05 Dundalk 20:30 | Yes | Gaucher (11/4) **W** / Quatre Bras (5/2) | — / Gentleman Joe (4/1) | — / Gentleman Joe (4/1) |
| 2025-12-06 Wolverhampton 18:00 | Yes | R P Mcmurphy (15/8) **W** / Pink Socks (12/1) | — / Desiderata (15/2) | Desiderata (15/2) / R P Mcmurphy (15/8) **W** |
| 2025-12-06 Wolverhampton 19:00 | Yes | Zooks (3/1) / Damzon (20/1) | Doddington Guy (7/2) / Tuba (6/1) | Corsican Caper (15/2) / Doddington Guy (7/2) |
| 2025-12-06 Wolverhampton 20:00 | Yes | Woodhay Whisper (2/1) / Triple Charged (5/1) | — / Gilt Edge (14/1) | — / Gilt Edge (14/1) |
| 2025-12-08 Lingfield 12:07 | Yes | Towerlands (5/1) **W** / Sheikh Raj (2/1) | — / — | Sheikh Raj (2/1) / Thiscouldbefun (18/1) |
| 2025-12-08 Lingfield 13:37 | Yes | Crackalackin (9/4) / Gifted Angel (10/3) | — / Extra Beat (22/1) | — / Extra Beat (22/1) |
| 2025-12-08 Lingfield 14:07 | Yes | Volendam (12/1) / Dandy Khan (9/4) **W** | Jackson Street (7/2) / Volendam (12/1) | Jackson Street (7/2) / Volendam (12/1) |
| 2025-12-08 Lingfield 15:07 | Yes | Amber Honey (10/3) / Tortured Soul (11/4) **W** | — / — | — / Beta Reader (12/1) |
| 2025-12-08 Wolverhampton 19:00 | Yes | Buraback (20/1) / Sioux Warrior (9/2) | — / Fletchers Dream (11/2) | Fletchers Dream (11/2) / Buraback (20/1) |
| 2025-12-08 Wolverhampton 19:30 | Yes | Clover Time (7/1) / Combustion (5/1) | — / Rye (9/2) | Rye (9/2) / — |
| 2025-12-08 Wolverhampton 20:00 | Yes | Insuspense (9/1) / Peregrine Falcon (12/1) | Peregrine Falcon (12/1) / Insuspense (9/1) | Peregrine Falcon (12/1) / Insuspense (9/1) |
| 2025-12-08 Wolverhampton 20:30 | Yes | Penelope Valentine (3/1) / Noisy Music (11/4) | — / Minshaar (11/2) | — / Minshaar (11/2) |
| 2025-12-09 Newcastle 15:18 | Yes | Rubellite (5/1) / Rock Armour (28/1) | Noss Mayo (15/2) / Rubellite (5/1) | Noss Mayo (15/2) / Ana Emaraaty (4/1) |
| 2025-12-09 Newcastle 17:00 | Yes | Rhythm N Hooves (7/1) / Dark Cloud Rising (6/1) | — / — | — / The Caltonian (7/1) |
| 2025-12-09 Newcastle 18:30 | Yes | Uncle Sam (9/2) / Up The Monk (5/1) | Superior Council (2/1) / — | Superior Council (2/1) / — |
| 2025-12-09 Newcastle 19:00 | Yes | Instant Bond (5/1) / Yorkshire Glory (4/1) **W** | Yorkshire Glory (4/1) **W** / Instant Bond (5/1) | Yorkshire Glory (4/1) **W** / Yellow Lemons (22/1) |
| 2025-12-09 Newcastle 19:30 | Yes | Beneficiary (16/1) / Arlington (6/1) | — / — | Arlington (6/1) / Digital (4/1) |
| 2025-12-10 Dundalk 15:45 | Yes | Porsche Lad (5/4) / North Winterfell (7/1) | — / Benavente (9/2) **W** | — / Benavente (9/2) **W** |
| 2025-12-10 Dundalk 16:15 | Yes | Heart Of Darkness (4/1) / Not So Profitable (125/1) | Rock Basher (7/1) / Heart Of Darkness (4/1) | Rock Basher (7/1) / Heart Of Darkness (4/1) |
| 2025-12-10 Dundalk 16:45 | Yes | Colugo (5/1) / Jess Abi (12/1) | — / Spy (3/1) **W** | — / Punk Poet (10/1) |
| 2025-12-10 Kempton 17:30 | Yes | Lexington Jet (14/1) / Tenbob Tommy (13/8) | — / Lerwick (3/1) | — / Lerwick (3/1) |
| 2025-12-10 Dundalk 17:45 | Yes | Plushy (28/1) / This Guy (6/1) | Pivotal Terms (12/1) / — | Pivotal Terms (12/1) / Coincidental Glory (10/3) |
| 2025-12-10 Kempton 18:00 | Yes | Beccadelli (2/1) **W** / Gorey Gold (5/1) | — / Galileo Island (7/2) | — / Galileo Island (7/2) |
| 2025-12-10 Kempton 20:30 | Yes | Pinjarra (10/3) / Up The Anti (50/1) **W** | — / Guiteau (18/1) | — / Guiteau (18/1) |
| 2025-12-11 Chelmsford City 19:00 | Yes | Diomed Spirit (9/1) / Another Abbot (11/2) | — / — | — / Almaty Star (11/8) |
| 2025-12-12 Southwell 17:30 | Yes | Popty Ping (4/1) **W** / New Objective (5/1) | — / Mereside Princess (9/1) | Mereside Princess (9/1) / Popty Ping (4/1) **W** |
| 2025-12-12 Southwell 19:00 | Yes | Rogue Identity (4/1) / Reginald Charles (9/2) **W** | Reginald Charles (9/2) **W** / Rogue Identity (4/1) | Reginald Charles (9/2) **W** / Bomb Squad (9/1) |
| 2025-12-12 Southwell 19:30 | Yes | Sax Appeal (5/1) / Charging Thunder (9/1) | Charging Thunder (9/1) / Enemy (7/2) | Charging Thunder (9/1) / Enemy (7/2) |
| 2025-12-12 Dundalk 19:45 | Yes | I'm Spartacus (5/2) / Sakakawea (11/2) | — / Lismacbryan Hill (17/2) | Lismacbryan Hill (17/2) / I'm Spartacus (5/2) |
| 2025-12-12 Southwell 20:00 | Yes | Speed Of Maajid (11/2) / Spring Bloom (5/1) | — / — | Beaumadier (8/1) / Speed Of Maajid (11/2) |
| 2025-12-12 Dundalk 20:15 | Yes | Preparations (11/1) / Lady Kai (9/2) | No More Kisses (9/4) / — | No More Kisses (9/4) / — |
| 2025-12-12 Southwell 20:30 | Yes | The English Rogue (9/2) / Spec Of Light (4/1) | — / — | Prince Quattro (7/1) / Show Biz Kid (10/1) |
| 2025-12-13 Newcastle 15:05 | Yes | Without Compromise (2/1) **W** / King Chaos (9/2) | — / Blue Sky Boy (12/1) | Blue Sky Boy (12/1) / Light Speed (5/1) |
| 2025-12-13 Newcastle 16:45 | Yes | Fidelius (11/4) / True Promise (6/1) | Jm Jhingree (9/2) / Fidelius (11/4) | Jm Jhingree (9/2) / Fidelius (11/4) |
| 2025-12-13 Wolverhampton 18:00 | Yes | Ciotog (10/1) / Rating (8/1) | Rating (8/1) / Oman (4/1) **W** | Magic Runner (14/1) / — |
| 2025-12-13 Wolverhampton 18:30 | Yes | Brasil Power (7/2) / Zryan (4/1) **W** | — / Shihoku (3/1) | Shihoku (3/1) / Brasil Power (7/2) |
| 2025-12-13 Wolverhampton 19:30 | Yes | South Dakota Sioux (7/4) / Carolus Magnus (6/1) | — / The Caribbean (9/4) **W** | — / The Caribbean (9/4) **W** |
| 2025-12-13 Wolverhampton 20:00 | Yes | Bass Player (7/2) / Equion (13/2) | Corundum (10/3) / Bass Player (7/2) | Corundum (10/3) / Pitney (14/1) |
| 2025-12-13 Wolverhampton 20:30 | Yes | Salaria (11/4) **W** / Yehudi (5/1) | — / — | — / Amber Honey (10/3) |
| 2025-12-15 Lingfield 12:42 | Yes | Global Effort (12/1) / Chasing Gold (9/1) | Chasing Gold (9/1) / Global Effort (12/1) | Chasing Gold (9/1) / Gogo Yubari (13/2) **W** |
| 2025-12-15 Lingfield 13:12 | Yes | Neptune Legend (14/1) / Profit Street (13/8) | — / — | Profit Street (13/8) / Neptune Legend (14/1) |
| 2025-12-15 Lingfield 13:42 | Yes | Latin (11/4) / Trackman (16/1) | — / Tommy's Promise (11/8) **W** | — / Tommy's Promise (11/8) **W** |
| 2025-12-15 Lingfield 14:42 | Yes | Borderline Madness (8/1) / The Dark Baron (7/2) | — / — | — / River Wharfe (9/1) |
| 2025-12-15 Wolverhampton 17:00 | Yes | Handle With Care (14/1) / Electric Avenue (7/2) | Electric Avenue (7/2) / Hilltop (11/2) | Hilltop (11/2) / — |
| 2025-12-15 Wolverhampton 17:30 | Yes | Thanh Nam (11/4) **W** / Molly Mac (25/1) | — / — | — / Chilliconcarneigh (2/1) |
| 2025-12-15 Wolverhampton 20:30 | Yes | Mumayaz (6/1) / Havana Sky (8/1) | State Of Madness (11/4) / Ziggy's Condor (4/1) | State Of Madness (11/4) / Ziggy's Condor (4/1) |
| 2025-12-16 Newcastle 15:12 | Yes | Atlantic Sunset (28/1) / Educate (5/1) | Prince Quattro (11/4) / — | Prince Quattro (11/4) / Haveyoumissedme (9/2) |
| 2025-12-16 Newcastle 17:15 | Yes | Ana Emaraaty (9/2) / Annalee Lass (22/1) | — / Pride Eye (14/1) | Pride Eye (14/1) / Ana Emaraaty (9/2) |
| 2025-12-16 Newcastle 17:45 | Yes | Wichahpi (9/1) / Blufferonthebus (7/1) | Carolus Magnus (15/2) / Front Gunner (10/1) | Carolus Magnus (15/2) / Flowstate (16/1) **W** |
| 2025-12-16 Newcastle 19:15 | Yes | Bibendum (9/2) / Good Point (18/1) | — / Thunderstorm Katie (9/1) | Thunderstorm Katie (9/1) / Water Of Leith (4/1) |
| 2025-12-17 Lingfield 13:35 | Yes | Enpassant (6/1) / Dashing Donkey (9/2) | — / Way To Dubai (15/8) | Way To Dubai (15/8) / Enpassant (6/1) |
| 2025-12-17 Lingfield 14:45 | Yes | Fulford Cross (9/1) **W** / Naval Ensign (6/1) | — / — | — / Lastchancezouloon (11/2) |
| 2025-12-17 Lingfield 15:20 | Yes | Saint Terry (40/1) / Semser (15/2) | — / Villalobos (13/8) | — / Villalobos (13/8) |
| 2025-12-17 Kempton 16:05 | Yes | One Cool Dreamer (16/1) / Letmebetheboss (11/1) | — / — | Westcombe (7/4) **W** / Hebridean Nomad (5/2) |
| 2025-12-17 Dundalk 17:25 | Yes | Pints In Peace (11/4) / Lumiere Des Etoile (16/1) | Coincidental Glory (7/2) **W** / Badger's Cove (9/1) | Coincidental Glory (7/2) **W** / Badger's Cove (9/1) |
| 2025-12-17 Kempton 17:40 | Yes | Berkshire Whisper (4/1) / Bolo Neighs (28/1) | — / — | — / Coul Angel (13/2) |
| 2025-12-17 Dundalk 18:25 | Yes | Profit Surge (7/2) / Rock Basher (6/1) | — / — | Rock Basher (6/1) / Profit Surge (7/2) |
| 2025-12-17 Kempton 18:40 | Yes | Angel Hunter (13/2) / Bravo Zulu (12/1) | Bravo Zulu (12/1) / Unassuming (6/1) | Unassuming (6/1) / — |
| 2025-12-17 Kempton 19:40 | Yes | Gilt Edge (9/1) / Haziym (20/1) | — / — | — / Smasher (9/2) |
| 2025-12-17 Dundalk 19:55 | Yes | Metamorphic (10/1) / Cherry Pink (12/1) | Sierra De Gredos (13/2) / Soaring Sun (13/2) | Sierra De Gredos (13/2) / Ozark Daze (10/3) |
| 2025-12-17 Kempton 20:10 | Yes | Mister Sandman (5/1) / Chasing Gold (10/3) | — / — | — / Magna (5/2) **W** |
| 2025-12-18 Southwell 13:22 | Yes | Overlooked (4/1) / Von Krolock (4/1) | — / — | Sir Maxi (9/1) / Overlooked (4/1) |
| 2025-12-18 Southwell 15:52 | Yes | Angel Of England (9/2) / Zoulu Warrior (7/2) **W** | No Knee Never (10/1) / Angel Of England (9/2) | No Knee Never (10/1) / Angel Of England (9/2) |
| 2025-12-18 Southwell 16:22 | Yes | Neptune Legend (3/1) / Miss Mendoza (18/1) | — / — | — / Raft Up (5/1) |
| 2025-12-18 Southwell 16:52 | Yes | Ziggy's Triton (4/1) **W** / Fiorella Princess (16/1) | — / — | — / Sam's Hope (3/1) |
| 2025-12-18 Southwell 17:22 | Yes | Flynn Ryder (28/1) / Arth's Gold (10/1) | Arth's Gold (10/1) / Dust Cover (10/11) | Arth's Gold (10/1) / Dust Cover (10/11) |
| 2025-12-18 Chelmsford City 17:30 | Yes | Illy's Roo (12/1) **W** / Paranjape (9/2) | Zooella (9/2) / — | Zooella (9/2) / — |
| 2025-12-18 Chelmsford City 19:00 | Yes | Son Of Astar (9/2) / Bluebells Boy (3/1) | — / — | — / Fancy Dancer (8/1) |
| 2025-12-18 Chelmsford City 19:30 | Yes | Justcallmepete (15/2) **W** / Cherry Cobbler (13/2) | — / Existent (4/1) | — / Sensorium (9/1) |
| 2025-12-18 Chelmsford City 20:00 | Yes | Calyxoh (9/2) / Bell Shot (22/1) | — / Uncle Don (11/4) | Uncle Don (11/4) / Calyxoh (9/2) |
| 2025-12-19 Southwell 13:40 | Yes | Taranjerine (7/2) / See Paris (33/1) | Blue Siam (16/1) / Lahire (13/2) | Electric Bass (5/1) / Blue Siam (16/1) |
| 2025-12-19 Southwell 14:15 | Yes | Emma's Letter (4/1) / Stay Sharp (11/2) | — / My Shagaf (5/1) | — / My Shagaf (5/1) |
| 2025-12-19 Newcastle 15:15 | Yes | Humble Spark (8/1) / Machete (5/4) **W** | Machete (5/4) **W** / Humble Spark (8/1) | Machete (5/4) **W** / Desert Emperor (9/2) |
| 2025-12-19 Southwell 16:55 | Yes | Maximising (13/2) / Mumayaz (9/4) | Mumayaz (9/4) / Maximising (13/2) | Mumayaz (9/4) / King Of Ithaca (10/3) **W** |
| 2025-12-19 Southwell 17:25 | Yes | Phoenix Of Dreams (9/2) / Blackjack (20/1) | — / Vince Lombardi (9/4) | Vince Lombardi (9/4) / Phoenix Of Dreams (9/2) |
| 2025-12-19 Newcastle 17:45 | Yes | Falcon Nine (15/2) / Minshaar (8/1) | Tasever (9/4) **W** / Mercurius Power (11/2) | Mercurius Power (11/2) / Tasever (9/4) **W** |
| 2025-12-19 Dundalk 19:00 | Yes | Fixation (9/4) / Far From Dandy (11/4) **W** | Far From Dandy (11/4) **W** / Daler (8/1) | Far From Dandy (11/4) **W** / Daler (8/1) |
| 2025-12-19 Dundalk 20:00 | Yes | Genoah (6/1) **W** / Quatre Bras (5/1) | Quatre Bras (5/1) / Nakasero (4/1) | Quatre Bras (5/1) / Nakasero (4/1) |
| 2025-12-20 Newcastle 15:10 | Yes | Word Of Mouth (7/1) / Prince Achille (11/1) | Bearwith (11/2) / Sea Legend (14/1) | Bearwith (11/2) / Sea Legend (14/1) |
| 2025-12-20 Newcastle 18:00 | Yes | Military Leader (2/1) / Aisling Oscar (3/1) **W** | Aisling Oscar (3/1) **W** / Military Leader (2/1) | Aisling Oscar (3/1) **W** / Military Leader (2/1) |
| 2025-12-20 Wolverhampton 18:45 | Yes | Lightning Touch (16/1) / Westcombe (11/10) **W** | — / — | So Alex (3/1) / Lightning Touch (16/1) |
| 2025-12-20 Wolverhampton 19:15 | Yes | Sergeant Pep (5/1) / Stellenbosch (11/1) | He's A Gentleman (10/3) / Sergeant Pep (5/1) | Mae Amor (40/1) / Follow Your Heart (9/1) **W** |
| 2025-12-20 Wolverhampton 19:45 | Yes | Dandy Khan (3/1) / Havana Club (12/1) | Havana Club (12/1) / Moyowasi (11/2) | Bomb Squad (9/4) / Harbour Vision (7/2) **W** |
| 2025-12-20 Wolverhampton 20:15 | Yes | Maywedance (13/2) / Mr Nugget (3/1) | — / — | Seraphic (18/1) / Maywedance (13/2) |
| 2025-12-22 Lingfield 12:00 | Yes | Gilet (5/2) / Knockbrex (9/1) | — / — | Hitched (7/2) / Gilet (5/2) |
| 2025-12-22 Lingfield 13:00 | Yes | Giorgio M (9/1) **W** / Havana Sky (12/1) | — / Rey De La Batalla (11/2) | — / Rey De La Batalla (11/2) |
| 2025-12-22 Lingfield 14:00 | Yes | Latin (4/1) / Homme De Fer (10/3) **W** | — / Amarachi (7/1) | — / Amarachi (7/1) |
| 2025-12-22 Lingfield 14:30 | Yes | Dion Baker (4/1) / Chloe's Courage (12/1) | Chloe's Courage (12/1) / Horus (16/1) | Chloe's Courage (12/1) / Horus (16/1) |
| 2025-12-22 Lingfield 15:00 | Yes | Mammy (22/1) / I Can Imagine (12/1) | — / Forest Gunner (15/2) | Watermelon Sugar (11/10) **W** / Mammy (22/1) |
| 2025-12-22 Wolverhampton 17:00 | Yes | American Flight (6/5) / Canyouhearthedrums (11/2) | — / Beach Partee (8/1) | — / Beach Partee (8/1) |
| 2025-12-22 Wolverhampton 20:00 | Yes | Zooks (5/2) / Star Of Jupiter (7/2) | — / Damzon (9/2) | Damzon (9/2) / Tuba (3/1) **W** |
| 2025-12-26 Wolverhampton 16:35 | Yes | Unassuming (13/8) / Zryan (7/2) | — / — | Zryan (7/2) / Unassuming (13/8) |
| 2025-12-27 Wolverhampton 17:30 | Yes | Three On Thursday (7/2) / Guinness Lad (12/1) | — / — | Moon Over The Sea (11/2) / Three On Thursday (7/2) |
| 2025-12-27 Wolverhampton 18:30 | Yes | Flame Of Forest (13/2) / Sheikh Raj (2/1) | — / — | Rajapour (9/2) / — |
| 2025-12-27 Wolverhampton 19:00 | Yes | Danehill Star (10/1) / Mbappe (11/2) | Mbappe (11/2) / Danehill Star (10/1) | Mbappe (11/2) / R P Mcmurphy (11/4) |
| 2025-12-27 Wolverhampton 19:30 | Yes | Zooks (10/3) / Alnayef (4/1) | — / — | Daaris (11/4) **W** / Zooks (10/3) |
| 2025-12-27 Wolverhampton 20:00 | Yes | Zoulu Warrior (11/4) **W** / Moostar (9/2) | Moostar (9/2) / Zoulu Warrior (11/4) **W** | Moostar (9/2) / Early Release (9/1) |
| 2025-12-28 Southwell 15:20 | Yes | Yaaser (5/1) / Your Love (10/1) | Hunky Dory (6/4) **W** / — | Hunky Dory (6/4) **W** / True Promise (9/2) |
| 2025-12-28 Southwell 15:50 | Yes | Sax Appeal (6/5) **W** / Trojan Sun (25/1) | — / Traila (18/1) | — / Traila (18/1) |
| 2025-12-28 Southwell 16:50 | Yes | Knight Of Magic (12/1) / King Chaos (5/1) | King Chaos (5/1) / Knight Of Magic (12/1) | King Chaos (5/1) / Spec Of Light (17/2) |
| 2025-12-29 Newcastle 16:15 | Yes | Henriette Ronner (10/3) / Popty Ping (4/1) | Popty Ping (4/1) / Angelic Rascal (22/1) | Popty Ping (4/1) / Angelic Rascal (22/1) |
| 2025-12-29 Newcastle 16:45 | Yes | Towerlands (15/8) / Yaaser (9/4) | — / Gressington (9/1) **W** | — / Gressington (9/1) **W** |
| 2025-12-29 Newcastle 17:15 | Yes | Bright (10/3) **W** / Stirrup Cup (9/1) | — / — | Arnhem (7/2) / Bright (10/3) **W** |
| 2025-12-29 Newcastle 17:45 | Yes | Francesi (3/1) / Merapi (16/1) | — / — | — / Powerful Response (5/1) |
| 2025-12-29 Newcastle 18:45 | Yes | Bomb Squad (4/1) / Ana Emaraaty (9/2) | — / — | Little Ted (9/2) / Bomb Squad (4/1) |
| 2025-12-30 Wolverhampton 16:30 | Yes | Gold Penny (7/1) / Circuit Breaker (9/2) | Circuit Breaker (9/2) / Gold Penny (7/1) | Francesco Baracca (2/1) **W** / — |
| 2025-12-30 Wolverhampton 17:00 | Yes | Blindfold Games (15/2) / Baileys Ontherocks (9/1) | Baileys Ontherocks (9/1) / Blindfold Games (15/2) | Baileys Ontherocks (9/1) / Blindfold Games (15/2) |
| 2025-12-30 Wolverhampton 17:30 | Yes | Kullazain (2/1) **W** / Coachello (7/2) | — / Valley Ofthe Kings (8/1) | Valley Ofthe Kings (8/1) / — |
| 2025-12-30 Wolverhampton 19:30 | Yes | Leeson Street (11/1) / Wilhelmina (4/6) **W** | — / — | Ghaiyyath Park (14/1) / — |
| 2025-12-30 Wolverhampton 20:00 | Yes | Salaria (3/1) / Riyadh Gem (18/1) | — / — | — / Youarenotforgiven (7/1) |
| 2025-12-30 Wolverhampton 20:30 | Yes | Sam's Xpress (6/1) **W** / Amerjeet (3/1) | — / Phoenix Beach (17/2) | — / Alafdhal (9/1) |
| 2025-12-31 Lingfield 15:30 | Yes | Lazzar (10/3) **W** / Woodhay Whisper (11/1) | — / — | Woodhay Whisper (11/1) / Mart (9/2) |

</details>

<details>
<summary>Early 2026 · all changed historical forecast books</summary>

| Date / course / scheduled UTC | Matched | Original T1 / T2 | Removed T1 / T2 | Reversed T1 / T2 |
| --- | --- | --- | --- | --- |
| 2026-01-01 Southwell 14:30 | Yes | So Darn Hot (16/1) / Pocklington (7/4) **W** | — / — | Coul Angel (7/2) / So Darn Hot (16/1) |
| 2026-01-01 Southwell 15:05 | Yes | Tickettothestars (28/1) / Maynora (14/1) | — / Rogue Rebellion (5/1) | Rogue Rebellion (5/1) / Mademoiselle Belle (33/1) |
| 2026-01-01 Newcastle 15:34 | Yes | King's Crown (15/2) **W** / Mesaafi (85/40) | — / — | Hover On The Wind (10/1) / King's Crown (15/2) **W** |
| 2026-01-01 Southwell 15:44 | Yes | Saeculamation (11/2) / Lady Lucky Vegas (10/1) | — / — | — / Grey Horizon (6/4) **W** |
| 2026-01-01 Newcastle 16:35 | Yes | Coramento (11/4) / Springbok (13/2) | — / Pallas Lord (10/1) | — / Pallas Lord (10/1) |
| 2026-01-01 Southwell 16:50 | Yes | Serengeti (12/1) / Popmaster (5/1) | Blue Rc (4/7) **W** / Serengeti (12/1) | Blue Rc (4/7) **W** / Serengeti (12/1) |
| 2026-01-01 Newcastle 17:05 | Yes | Doon The Glen (14/1) / Auntie Jo (20/1) | — / — | — / Sovereign Class (11/1) |
| 2026-01-01 Southwell 17:20 | Yes | Filly One (11/4) / Stanley Spencer (7/2) | — / — | Stanley Spencer (7/2) / Filly One (11/4) |
| 2026-01-01 Newcastle 17:35 | Yes | Classy Clarets (9/1) / Beneficiary (11/1) | — / — | — / Yaahobby (7/1) |
| 2026-01-02 Chelmsford City 12:42 | Yes | Charlie Mason (5/4) / Express Train (25/1) | — / Em Four (9/4) **W** | — / Em Four (9/4) **W** |
| 2026-01-02 Chelmsford City 14:12 | Yes | Space Cowboy (33/1) / Me Tarzan (3/1) | Me Tarzan (3/1) / Chola Empire (5/1) | Me Tarzan (3/1) / Arantes Nascimento (11/4) |
| 2026-01-02 Wolverhampton 16:30 | Yes | Cargin Bhui (5/6) / Betties Bay (15/2) **W** | — / — | — / Bibendum (5/1) |
| 2026-01-02 Wolverhampton 17:00 | Yes | Midnight Call (15/8) **W** / Wee Mary (5/1) | — / — | — / Dubai Magic (25/1) |
| 2026-01-02 Wolverhampton 18:30 | Yes | Arnaz (4/1) / Straight A (9/4) | Chifa (13/8) **W** / Arnaz (4/1) | Chifa (13/8) **W** / Landlordtothestars (15/2) |
| 2026-01-02 Wolverhampton 19:00 | Yes | Threatening (5/2) / Al Rufaa (5/2) | — / Studious (7/1) | — / Studious (7/1) |
| 2026-01-02 Wolverhampton 19:30 | Yes | Beaumadier (4/1) / Basholo (33/1) | — / Speed Of Maajid (11/4) | Speed Of Maajid (11/4) / Beaumadier (4/1) |
| 2026-01-02 Wolverhampton 20:00 | Yes | Moonlight Bomb (7/4) / Naughty Niall (9/2) | — / — | — / Hawaiian King (9/2) |
| 2026-01-02 Wolverhampton 20:30 | Yes | Time Turner (3/1) / Seraphic (17/2) | — / — | — / Eutropia (18/1) |
| 2026-01-03 Lingfield 11:40 | Yes | Calafrio (13/8) / So Sassy (4/1) | — / — | Cooramook (11/1) / Calafrio (13/8) |
| 2026-01-03 Lingfield 12:10 | Yes | Charlotte Corday (7/4) / Florida Suite (4/1) | Florida Suite (4/1) / Charlotte Corday (7/4) | Florida Suite (4/1) / Credit Forgedd It (9/4) |
| 2026-01-03 Lingfield 13:10 | Yes | Union Island (17/2) / Way To Dubai (9/4) | Way To Dubai (9/4) / Union Island (17/2) | Pitney (4/1) / — |
| 2026-01-03 Lingfield 15:29 | Yes | Naval Ensign (11/2) **W** / Toussarok (11/4) | Toussarok (11/4) / Naval Ensign (11/2) **W** | Toussarok (11/4) / Naval Ensign (11/2) **W** |
| 2026-01-03 Southwell 18:00 | Yes | Volendam (5/1) / Bad Habits (9/2) | — / — | Bad Habits (9/2) / Volendam (5/1) |
| 2026-01-03 Southwell 19:00 | Yes | Bravo Zulu (18/1) / Helmsley (80/1) | Helmsley (80/1) / Talis Evolvere (9/4) **W** | Helmsley (80/1) / Talis Evolvere (9/4) **W** |
| 2026-01-03 Southwell 20:00 | Yes | Fascinating Shadow (9/2) / Daaris (14/1) | — / Nunc Est Bibendum (6/4) **W** | Edwardtheninth (11/2) / Fascinating Shadow (9/2) |
| 2026-01-03 Southwell 20:30 | Yes | Arth's Gold (6/1) / Brodie's Boy (9/1) | — / Tortured Soul (7/2) **W** | King's Hand (9/4) / Arth's Gold (6/1) |
| 2026-01-04 Southwell 13:00 | Yes | Dapper Gee Gee (7/1) **W** / Nacho Nacho Nacho (11/2) | — / — | Nacho Nacho Nacho (11/2) / Dapper Gee Gee (7/1) **W** |
| 2026-01-04 Southwell 13:30 | Yes | Down To The Kid (10/3) **W** / Ashen (10/1) | — / How Impressive (15/2) | — / Gressington (5/1) |
| 2026-01-04 Southwell 14:00 | Yes | Magna (11/4) **W** / Forever Noah (14/1) | — / Secret Road (11/8) | — / Secret Road (11/8) |
| 2026-01-04 Southwell 15:00 | Yes | Ziggy's Triton (3/1) / Mon Na Slieve (11/2) | — / Hiya Maite (5/2) | — / Hiya Maite (5/2) |
| 2026-01-04 Southwell 15:35 | Yes | Gogo Yubari (5/1) / Juno Star (7/2) | — / — | Arlington (9/2) **W** / Gogo Yubari (5/1) |
| 2026-01-04 Southwell 16:05 | Yes | Saxon Kingdom (15/2) / Night Bear (6/1) | — / — | Sisterandbrother (9/2) / Saxon Kingdom (15/2) |
| 2026-01-04 Southwell 17:05 | Yes | Top Gun Tina (50/1) / Wrist Art (11/2) | Pink Socks (4/1) / — | Pink Socks (4/1) / Timely Affair (1/1) **W** |
| 2026-01-06 Wolverhampton 13:15 | Yes | King Victorious (7/1) / Alfa Patisserie (6/1) | My Champion (11/4) **W** / King Victorious (7/1) | My Champion (11/4) **W** / King Victorious (7/1) |
| 2026-01-06 Wolverhampton 16:15 | Yes | Bashful Boy (7/4) / Fascinating Shadow (11/4) | Circuit Breaker (5/2) / Bashful Boy (7/4) | Circuit Breaker (5/2) / — |
| 2026-01-06 Wolverhampton 16:45 | Yes | Latin (10/3) **W** / Yehudi (5/1) | First Greyed (5/2) / Latin (10/3) **W** | First Greyed (5/2) / — |
| 2026-01-06 Southwell 17:00 | Yes | Desiderata (11/2) / Knight Of Magic (6/4) **W** | Knight Of Magic (6/4) **W** / Desiderata (11/2) | Knight Of Magic (6/4) **W** / Good Shot (9/1) |
| 2026-01-06 Wolverhampton 17:15 | Yes | Corundum (9/2) / Equion (7/2) | Equion (7/2) / Corundum (9/2) | Equion (7/2) / Corundum (9/2) |
| 2026-01-06 Southwell 17:30 | Yes | Come To Pass (16/1) / Foinix (14/1) | Highfield Comrade (9/4) **W** / Ignition (7/4) | Ignition (7/4) / Jack Andrea (16/1) |
| 2026-01-06 Southwell 18:00 | Yes | Selenic (15/8) / Romantic Spirit (9/2) | — / — | Romantic Spirit (9/2) / Selenic (15/8) |
| 2026-01-06 Southwell 18:30 | Yes | Charlatan (85/40) / R P Mcmurphy (9/4) | — / — | Back From Dubai (5/1) / — |
| 2026-01-07 Lingfield 12:35 | Yes | Tuba (7/2) / Forglen (12/1) | — / Arc Zoosve (15/8) **W** | Arc Zoosve (15/8) **W** / Sapphire Sirocco (4/1) |
| 2026-01-07 Lingfield 13:05 | Yes | Hierarchy (15/2) / Tiger Crusade (15/2) | — / — | Accrual (3/1) **W** / Hierarchy (15/2) |
| 2026-01-07 Lingfield 13:35 | Yes | Fitzmaurice (80/1) / Gogo Yubari (2/1) **W** | Gogo Yubari (2/1) **W** / Rajeteriat (16/5) | Harry Brown (9/4) / — |
| 2026-01-07 Lingfield 14:35 | Yes | Forceful Lady (14/1) / Frankali (14/1) | — / Blue Mountains (18/1) | — / Athenian Spirit (12/1) |
| 2026-01-07 Lingfield 15:35 | Yes | Southbank (11/1) / Woodhay Whisper (9/2) | Woodhay Whisper (9/2) / Southbank (11/1) | Woodhay Whisper (9/2) / Southbank (11/1) |
| 2026-01-07 Kempton 17:00 | Yes | Copperfield (9/2) / Filly Foden (11/4) | Filly Foden (11/4) / Copperfield (9/2) | Filly Foden (11/4) / Copperfield (9/2) |
| 2026-01-07 Kempton 20:00 | Yes | Definite (66/1) / Sands Of Havana (12/1) | Sands Of Havana (12/1) / Saahir (16/5) | Saahir (16/5) / — |
| 2026-01-08 Chelmsford City 18:00 | Yes | World Of Darcy (4/1) / Dubai Magic (9/2) **W** | — / Flicka's Girl (33/1) | Flicka's Girl (33/1) / World Of Darcy (4/1) |
| 2026-01-08 Chelmsford City 18:30 | Yes | Port Hedland (11/2) / Dion Baker (4/1) | — / Roman Emperor (10/3) | — / Analytical Engine (11/4) |
| 2026-01-08 Chelmsford City 19:30 | Yes | Mumayaz (11/1) / Speed Of Maajid (2/1) | — / — | Speed Of Maajid (2/1) / Mumayaz (11/1) |
| 2026-01-08 Chelmsford City 20:00 | Yes | Champagne Powder (5/2) / Nordic Norm (25/1) | — / High On Hope (10/11) **W** | High On Hope (10/11) **W** / Champagne Powder (5/2) |
| 2026-01-08 Chelmsford City 20:30 | Yes | Silkies Sib (15/8) / Noss Mayo (10/3) | — / — | — / Beachborough Girl (7/2) **W** |
| 2026-01-09 Newcastle 13:27 | Yes | Brunello Breeze (25/1) / Bunker Bay (28/1) | King Chaos (7/4) **W** / — | King Chaos (7/4) **W** / — |
| 2026-01-09 Newcastle 14:27 | Yes | Onyeisi (11/4) / Sunday Sinatra (6/1) | — / Family Values (6/1) | — / Family Values (6/1) |
| 2026-01-09 Dundalk 15:55 | Yes | Cinammon Coco (4/1) / Trishuli River (5/1) | Voice Of Reason (11/2) **W** / — | Voice Of Reason (11/2) **W** / — |
| 2026-01-09 Newcastle 16:00 | Yes | Rory (9/2) / Eagles Whistle (12/1) **W** | — / Elettaria (9/2) | — / Elettaria (9/2) |
| 2026-01-09 Newcastle 16:35 | Yes | Little Mi Mi (15/8) / Arlington (12/1) | Arlington (12/1) / Little Mi Mi (15/8) | Arlington (12/1) / Little Mi Mi (15/8) |
| 2026-01-09 Dundalk 17:40 | Yes | Marbush (14/1) / Heart Of Darkness (11/2) | Heart Of Darkness (11/2) / Marbush (14/1) | Heart Of Darkness (11/2) / Marbush (14/1) |
| 2026-01-09 Dundalk 18:15 | Yes | Georg Zhukov (7/2) **W** / Bella Colombia (50/1) | — / — | — / My Vonnie (7/2) |
| 2026-01-10 Lingfield 11:40 | Yes | Three On Thursday (17/2) / Dandy Khan (3/1) | Francesi (3/1) **W** / — | Francesi (3/1) **W** / — |
| 2026-01-10 Lingfield 13:47 | Yes | Meet Me In Meraki (5/1) / Dark Rosa (11/4) | — / Woodstock City (15/2) | — / Woodstock City (15/2) |
| 2026-01-10 Newcastle 15:47 | Yes | Mao Shang Wong (13/2) / Tasever (15/2) | Tasever (15/2) / Mao Shang Wong (13/2) | Second Fiddle (10/3) / — |
| 2026-01-10 Newcastle 16:20 | Yes | Eagles Whistle (7/2) **W** / Annalee Lass (18/1) | — / Crownthorpe (13/2) | — / Crownthorpe (13/2) |
| 2026-01-10 Newcastle 17:50 | Yes | Goldmoyne (11/4) / Bonito Cavalo (40/1) | — / Storm The Dug (8/1) | — / Concert Boy (3/1) |
| 2026-01-10 Newcastle 19:20 | Yes | Instant Bond (7/4) / Ramon Di Loria (5/1) | Ramon Di Loria (5/1) / Instant Bond (7/4) | Ramon Di Loria (5/1) / Queen For Adaay (33/1) |
| 2026-01-11 Chelmsford City 14:12 | Yes | Middleton View (10/3) / Lady Wingalong (11/2) | Lady Wingalong (11/2) / Middleton View (10/3) | Lady Wingalong (11/2) / Ziggy's Condor (7/2) |
| 2026-01-11 Chelmsford City 14:42 | Yes | Three On Thursday (13/8) / Age Of Time (11/2) | Seraphic (5/1) **W** / Three On Thursday (13/8) | Seraphic (5/1) **W** / Enthused (5/2) |
| 2026-01-11 Chelmsford City 15:12 | Yes | Knight Of Magic (10/11) / Come To Pass (22/1) | — / Al Shabab (9/1) | — / Sunset In Paris (18/1) |
| 2026-01-11 Chelmsford City 16:42 | Yes | Simply Blue (15/2) / Al Waqidi (10/3) **W** | — / Galaxy Wonder (2/1) | — / Galaxy Wonder (2/1) |
| 2026-01-12 Lingfield 12:40 | Yes | Diomed Spirit (18/5) / Almaty Star (5/2) | Almaty Star (5/2) / Diomed Spirit (18/5) | Almaty Star (5/2) / Diomed Spirit (18/5) |
| 2026-01-12 Lingfield 14:10 | Yes | Lynwood Lad (5/1) / Midnight Call (7/4) | Midnight Call (7/4) / Beauzon (6/4) **W** | Midnight Call (7/4) / Beauzon (6/4) **W** |
| 2026-01-12 Lingfield 15:40 | Yes | H Key Lails (7/2) / Foreseen (6/5) **W** | Way To Dubai (4/1) / H Key Lails (7/2) | Way To Dubai (4/1) / H Key Lails (7/2) |
| 2026-01-12 Wolverhampton 17:30 | Yes | Blindfold Games (11/2) / Espona Bay (11/10) | — / — | — / Far Too Fizzy (17/2) |
| 2026-01-12 Wolverhampton 18:30 | Yes | Arnaz (16/1) / The Caribbean (5/1) | The Caribbean (5/1) / Bella Bisbee (7/2) | The Caribbean (5/1) / Flowstate (7/2) |
| 2026-01-12 Wolverhampton 20:00 | Yes | Eagles Whistle (10/11) **W** / Desiderata (6/1) | Wrist Art (7/1) / Eagles Whistle (10/11) **W** | Wrist Art (7/1) / — |
| 2026-01-13 Dundalk 14:00 | Yes | Magna Gee Gee (16/1) / Daonethatgotaway (3/1) | — / Una Matata (4/1) | — / Bint Majestic Roi (14/1) |
| 2026-01-13 Newcastle 14:08 | Yes | Profit Street (9/4) / Bad Habits (5/1) | — / — | — / Teardrops (4/1) **W** |
| 2026-01-13 Dundalk 15:00 | Yes | Platino Bianco (12/1) / Charanda (16/1) | Ballymagreehan (7/2) / Platino Bianco (12/1) | Ballymagreehan (7/2) / Platino Bianco (12/1) |
| 2026-01-13 Newcastle 15:08 | Yes | Digital (7/4) / Em Jay Kay (4/1) | — / — | Em Jay Kay (4/1) / Digital (7/4) |
| 2026-01-13 Newcastle 15:40 | Yes | Criminal Shore (15/2) / Flying Fletcher (4/1) **W** | — / — | Eve's Boy (11/2) / Criminal Shore (15/2) |
| 2026-01-13 Newcastle 16:45 | Yes | Aisling Oscar (6/4) **W** / Moyowasi (5/2) | — / Pallas Lord (5/1) | Pallas Lord (5/1) / Aisling Oscar (6/4) **W** |
| 2026-01-13 Southwell 17:00 | Yes | Galette (66/1) / Call Glory (11/8) **W** | — / Headshot (17/2) | Headshot (17/2) / Galette (66/1) |
| 2026-01-13 Dundalk 17:10 | Yes | Nibras Rainbow (10/1) / Si Senior (33/1) | — / Church Mountain (9/2) | Church Mountain (9/2) / Nibras Rainbow (10/1) |
| 2026-01-13 Southwell 17:30 | Yes | Pink Socks (8/11) **W** / Nutcracker (66/1) | — / Kodebreaker (11/1) | Kodebreaker (11/1) / Pink Socks (8/11) **W** |
| 2026-01-13 Southwell 18:30 | Yes | Clover Time (10/3) / Cargin Bhui (13/8) | — / Showtime Mahomes (4/1) | — / Showtime Mahomes (4/1) |
| 2026-01-14 Lingfield 12:25 | Yes | Forest Gunner (9/4) **W** / Colors Of Freedom (15/8) | — / — | Colors Of Freedom (15/8) / Forest Gunner (9/4) **W** |
| 2026-01-14 Lingfield 13:25 | Yes | Urban Law (16/1) / Chilliconcarneigh (3/1) | — / — | Giles Glory (5/6) / — |
| 2026-01-14 Kempton 19:00 | Yes | Liv My Life (7/2) **W** / Mandana (9/5) | — / Maid In Chelsea (2/1) | Maid In Chelsea (2/1) / Liv My Life (7/2) **W** |
| 2026-01-14 Kempton 20:30 | Yes | Deferred Interest (50/1) / High Favour (11/1) | Nymphaea (10/1) / Guinness Lad (11/2) | Nymphaea (10/1) / Duchess (4/1) |
| 2026-01-15 Chelmsford City 18:00 | Yes | Lexington Jet (6/1) **W** / My Mate Mike (3/1) | — / Blue Eclipse (10/3) | — / Blue Eclipse (10/3) |
| 2026-01-15 Chelmsford City 19:00 | Yes | Lazzar (13/8) **W** / Siobhanbrogan (15/2) | — / Stapleford Park (66/1) | — / Stapleford Park (66/1) |
| 2026-01-15 Chelmsford City 19:30 | Yes | Carlton (11/4) / Must Believe (4/1) | Must Believe (4/1) / Veraison (5/1) | Must Believe (4/1) / Veraison (5/1) |
| 2026-01-15 Chelmsford City 20:30 | Yes | Rodoya (66/1) / Oman (14/1) | Oman (14/1) / Time Tested (85/40) | Time Tested (85/40) / — |
| 2026-01-16 Newcastle 12:30 | Yes | True Promise (4/1) / Kirkdale (6/1) | Kirkdale (6/1) / True Promise (4/1) | Kirkdale (6/1) / True Promise (4/1) |
| 2026-01-16 Newcastle 13:05 | Yes | Dandy Magic (7/1) / Maxi Boy (4/1) | Maxi Boy (4/1) / Dandy Magic (7/1) | Maxi Boy (4/1) / Fiscal Policy (9/2) |
| 2026-01-16 Newcastle 15:55 | Yes | Monarch's Gold (6/1) / Ten Carat Harry (4/1) **W** | Bassenthwaite (14/1) / — | Bassenthwaite (14/1) / — |
| 2026-01-16 Dundalk 17:15 | Yes | Gallo Dell Cielo (6/1) **W** / Pons Aelius (16/1) | — / Numidia (5/1) | — / Jake Peter (11/1) |
| 2026-01-16 Dundalk 17:45 | Yes | Carolina Jetstream (11/4) **W** / Apache Outlaw (9/1) | Instant Appeal (2/1) / Carolina Jetstream (11/4) **W** | Instant Appeal (2/1) / Carolina Jetstream (11/4) **W** |
| 2026-01-16 Dundalk 18:15 | Yes | Clonmacash (10/3) **W** / Bella Colombia (28/1) | — / — | — / Salah Belle (11/2) |
| 2026-01-16 Wolverhampton 19:00 | Yes | Advancing (4/7) / Hitched (9/1) | — / Sea Founder (16/1) | — / Sea Founder (16/1) |
| 2026-01-16 Wolverhampton 19:30 | Yes | Break Point (5/6) / Dancing Bay (33/1) | — / Damzon (3/1) | Ice Opera (22/1) **W** / Break Point (5/6) |
| 2026-01-16 Wolverhampton 20:00 | Yes | Highfield Comrade (5/4) / Celebrating Ethel (25/1) | — / Warrior Lion (5/2) | — / Black Smoke (18/1) |
| 2026-01-17 Lingfield 11:30 | Yes | Lord Mayor (15/8) / Double Combo (13/2) | Double Combo (13/2) / Morbeh (6/4) **W** | Double Combo (13/2) / Morbeh (6/4) **W** |
| 2026-01-17 Lingfield 12:05 | Yes | Zooks (11/4) / Girl Of Gold (9/2) | — / — | Girl Of Gold (9/2) / The Craftymaster (11/4) |
| 2026-01-17 Lingfield 12:40 | Yes | Bolo Neighs (18/1) / Zoulu Chief (2/1) | Completely Random (13/8) **W** / — | Completely Random (13/8) **W** / — |
| 2026-01-17 Southwell 17:00 | Yes | Forest Caper (17/2) / Al Hofzan (9/1) | — / Double Time (13/2) | Love Your Work (12/1) / Double Time (13/2) |
| 2026-01-17 Southwell 17:30 | Yes | Mr Wonka (2/1) **W** / Fermain (14/1) | Beckon (6/4) / — | Beckon (6/4) / — |
| 2026-01-17 Southwell 18:00 | Yes | Pink Socks (8/11) **W** / Stoneacre (50/1) | — / Shoptilyoudrop (28/1) | Shoptilyoudrop (28/1) / Pink Socks (8/11) **W** |
| 2026-01-17 Southwell 18:30 | Yes | Secret Road (2/1) / Top Gun Tina (22/1) | — / Yorkstone (9/1) | — / Yorkstone (9/1) |
| 2026-01-17 Southwell 20:00 | Yes | Lednikov (40/1) / Spec Of Light (16/1) | Spec Of Light (16/1) / Mr Nugget (4/1) | Spec Of Light (16/1) / Mr Nugget (4/1) |
| 2026-01-17 Southwell 20:30 | Yes | Woody Y Fernandez (9/1) / Mademoiselle Belle (17/2) | — / — | — / Oh So Perfect (16/1) |
| 2026-01-19 Kempton 13:38 | Yes | Magna (13/8) / Horus (15/2) | — / Respectable Jack (9/4) | — / Respectable Jack (9/4) |
| 2026-01-19 Kempton 16:08 | Yes | I'm Workin On It (6/5) **W** / King David (4/1) | — / Lerwick (8/1) | — / Lerwick (8/1) |
| 2026-01-19 Wolverhampton 18:00 | Yes | Al Baahy (11/2) **W** / Al Shabab (7/2) | — / Relevant Range (11/10) | Relevant Range (11/10) / Al Baahy (11/2) **W** |
| 2026-01-19 Wolverhampton 20:00 | Yes | Hardstyle (2/5) **W** / Ganthorpe (22/1) | — / Blue Mountains (11/1) | — / Blue Mountains (11/1) |
| 2026-01-20 Newcastle 13:13 | Yes | Superior Council (7/2) / Catherine Chroi (6/1) | Catherine Chroi (6/1) / Superior Council (7/2) | Catherine Chroi (6/1) / Superior Council (7/2) |
| 2026-01-20 Newcastle 14:13 | Yes | Tasever (3/1) / Sea Legend (13/2) | — / — | Aisling Oscar (11/8) **W** / Tasever (3/1) |
| 2026-01-20 Newcastle 16:13 | Yes | Our Absent Friends (9/1) / Digital (5/1) **W** | — / — | Digital (5/1) **W** / Harb (9/1) |
| 2026-01-20 Southwell 17:00 | Yes | Overlooked (4/1) / No Knee Never (5/1) **W** | — / Asian Journey (14/1) | — / Asian Journey (14/1) |
| 2026-01-20 Southwell 17:30 | Yes | Sergeant Pep (8/1) / Hundred Caps (25/1) **W** | — / Hunky Dory (11/8) | Hunky Dory (11/8) / Sergeant Pep (8/1) |
| 2026-01-20 Southwell 18:30 | Yes | Pride Eye (10/1) / How's The Guvnor (5/1) **W** | How's The Guvnor (5/1) **W** / Pride Eye (10/1) | How's The Guvnor (5/1) **W** / Roaring Ralph (13/2) |
| 2026-01-20 Southwell 19:30 | Yes | Forglen (7/4) / West Wickham (25/1) | — / Flame Dancer (100/1) | Himself (3/1) **W** / Forglen (7/4) |
| 2026-01-21 Lingfield 13:35 | Yes | Marinakis (9/4) / Monks Mead (10/3) **W** | Wrist Art (7/4) / Marinakis (9/4) | Wrist Art (7/4) / Marinakis (9/4) |
| 2026-01-21 Lingfield 14:05 | Yes | Spaceage Love Song (10/3) / Thundering Breeze (5/2) | Thundering Breeze (5/2) / Spaceage Love Song (10/3) | Thundering Breeze (5/2) / Myna (25/1) **W** |
| 2026-01-21 Lingfield 15:08 | Yes | Chilliconcarneigh (7/1) / Thanh Nam (14/1) | Hardstyle (8/11) / — | Hardstyle (8/11) / — |
| 2026-01-21 Lingfield 15:38 | Yes | Henriette Ronner (3/1) / Far Too Fizzy (9/5) **W** | Far Too Fizzy (9/5) **W** / Henriette Ronner (3/1) | Far Too Fizzy (9/5) **W** / Mister Moet (11/2) |
| 2026-01-21 Kempton 16:30 | Yes | Roker Roar (10/11) / Only In Manila (7/1) **W** | — / — | — / New Bay Star (3/1) |
| 2026-01-21 Kempton 17:30 | Yes | City Cyclone (13/2) **W** / Nemov (7/2) | State Of Madness (4/1) / — | State Of Madness (4/1) / Iconic Times (8/1) |
| 2026-01-21 Kempton 18:00 | Yes | Zoran (10/3) / Bashful Boy (4/1) | — / Appier (9/2) | Appier (9/2) / — |
| 2026-01-21 Kempton 20:00 | Yes | Maxwellcan (9/2) / Trust No One (10/3) | Onyeisi (6/5) / Maxwellcan (9/2) | Onyeisi (6/5) / — |
| 2026-01-22 Southwell 13:40 | Yes | Sanditon (6/1) / Dream Illusion (9/2) | — / — | Dream Illusion (9/2) / Sanditon (6/1) |
| 2026-01-22 Southwell 14:15 | Yes | Operation Gimcrack (3/1) / Simply Blue (16/1) | — / — | — / Bomb Squad (5/1) |
| 2026-01-22 Southwell 15:25 | Yes | Laurens Dream (9/4) / Tootsie (18/1) | — / Royal Jet (2/1) **W** | — / Royal Jet (2/1) **W** |
| 2026-01-22 Southwell 16:00 | Yes | Geordie Mackem (17/2) / Fleur De Mer (14/1) | Nunc Est Bibendum (10/11) / Arc Zoosve (10/3) | Nunc Est Bibendum (10/11) / Arc Zoosve (10/3) |
| 2026-01-22 Southwell 16:35 | Yes | Silkies Sib (5/2) / Alfred Spero (11/10) **W** | — / — | Night Bear (5/1) / Silkies Sib (5/2) |
| 2026-01-22 Newcastle 17:00 | Yes | Mademoiselle Belle (7/2) / Ya Habibti (9/1) | — / — | — / Contorno (7/4) **W** |
| 2026-01-22 Southwell 17:40 | Yes | Profit Street (85/40) / Initial Blue (9/1) | — / — | Initial Blue (9/1) / Profit Street (85/40) |
| 2026-01-23 Wolverhampton 12:57 | Yes | Mr Nugget (11/4) **W** / Apache Green (7/2) | — / — | Apache Green (7/2) / Three Yorkshiremen (12/1) |
| 2026-01-23 Wolverhampton 13:27 | Yes | Eupator (6/5) **W** / Fools Rush In (5/1) | — / Forest Caper (7/2) | — / Forest Caper (7/2) |
| 2026-01-23 Dundalk 15:55 | Yes | Tommy McJohn (14/1) / Hero Of The Hour (9/2) | Hero Of The Hour (9/2) / Tommy McJohn (14/1) | Hero Of The Hour (9/2) / Rift Valley (22/1) |
| 2026-01-23 Dundalk 16:30 | Yes | Comfort Line (8/1) / Hasten Slowly (50/1) | Autocrat (3/1) **W** / Jawhary (10/3) | Autocrat (3/1) **W** / Jawhary (10/3) |
| 2026-01-23 Wolverhampton 16:40 | Yes | Berezka (9/2) / Cardinal Point (7/4) **W** | Cardinal Point (7/4) **W** / Hackney Diamonds (3/1) | Cardinal Point (7/4) **W** / Word Of Mouth (15/2) |
| 2026-01-23 Southwell 16:45 | Yes | Force Of Honour (50/1) / Amber Honey (12/1) | Amber Honey (12/1) / Amarachi (8/1) | Amber Honey (12/1) / Coramento (9/2) |
| 2026-01-23 Southwell 17:45 | Yes | Brazilian Rose (6/4) **W** / Miss Mendoza (15/2) | — / — | — / Insuspense (9/1) |
| 2026-01-23 Southwell 18:15 | Yes | Giorgio M (18/1) / Down To The Kid (3/1) **W** | — / — | Down To The Kid (3/1) **W** / Giorgio M (18/1) |
| 2026-01-23 Southwell 19:45 | Yes | Cosmic Soul (17/2) **W** / Arc Zoosve (9/4) | — / — | Edwardtheninth (9/4) / Cosmic Soul (17/2) **W** |
| 2026-01-23 Southwell 20:15 | Yes | Reason's Power (15/2) / Chilliconcarneigh (4/1) | — / Grey Sands (11/8) **W** | — / Grey Sands (11/8) **W** |
| 2026-01-24 Lingfield 14:14 | Yes | Sonnerie Power (4/1) / Hebridean Nomad (11/4) **W** | — / — | The Sweet Escape (11/1) / Sonnerie Power (4/1) |
| 2026-01-24 Newcastle 16:05 | Yes | Noss Mayo (5/2) **W** / Alpine Sierra (4/1) | — / Star Cast (10/3) | — / Star Cast (10/3) |
| 2026-01-24 Newcastle 16:35 | Yes | Wee Mary (7/2) **W** / Korroor (15/8) | — / Bishop's Glory (10/3) | — / Bishop's Glory (10/3) |
| 2026-01-24 Newcastle 18:05 | Yes | Beale Street (8/1) / True Promise (4/1) | — / — | — / Raatea (18/1) |
| 2026-01-24 Newcastle 18:35 | Yes | Ana Emaraaty (3/1) **W** / Sogannie (80/1) | — / Woodrafff (3/1) | — / No Nay Nevermind (13/2) |
| 2026-01-24 Newcastle 19:05 | Yes | That Lucas Fella (9/1) / Sir Maxi (14/1) | — / — | — / Relevant Range (6/4) **W** |
| 2026-01-26 Wolverhampton 17:00 | Yes | Watchdog (5/2) / Berlinetta (10/1) | — / — | Berlinetta (10/1) / Watchdog (5/2) |
| 2026-01-26 Wolverhampton 18:30 | Yes | Pickersgill (33/1) / Enpassant (9/2) | — / Yehudi (7/2) | Yehudi (7/2) / Pickersgill (33/1) |
| 2026-01-26 Wolverhampton 19:00 | Yes | Eagle Day (7/2) / Monty Beau (13/2) | Eupator (11/8) **W** / Tortured Soul (9/1) | Eupator (11/8) **W** / Tortured Soul (9/1) |
| 2026-01-26 Wolverhampton 19:30 | Yes | Welljudged (13/8) / Penelope Valentine (11/1) **W** | — / — | Penelope Valentine (11/1) **W** / Welljudged (13/8) |
| 2026-01-26 Wolverhampton 20:00 | Yes | Knight Of Magic (6/5) **W** / Dancing Bay (17/2) | — / — | — / Starfighter (11/2) |
| 2026-01-27 Wolverhampton 16:28 | Yes | How's The Guvnor (15/8) **W** / Homme De Fer (13/8) | — / Fistral Beach (6/1) | — / Fistral Beach (6/1) |
| 2026-01-27 Wolverhampton 18:00 | Yes | Midnight Call (4/5) **W** / Juno Star (5/1) | — / Sultan Of Oj (12/1) | — / Sultan Of Oj (12/1) |
| 2026-01-27 Wolverhampton 18:30 | Yes | Prince Quattro (10/3) / Daaris (7/2) | — / Slowdownbarney (11/4) | — / Slowdownbarney (11/4) |
| 2026-01-27 Wolverhampton 19:30 | Yes | Rajinoora (10/11) / Leeson Street (13/2) | — / — | — / Pink Socks (9/2) |
| 2026-01-27 Wolverhampton 20:00 | Yes | Son Of Astar (9/4) / Spendmore Lane (14/1) | — / — | — / Alafdhal (4/1) |
| 2026-01-27 Wolverhampton 20:30 | Yes | Amerjeet (2/1) / Forest Gunner (9/1) | — / — | — / Street Life (7/2) |
| 2026-01-28 Dundalk 15:02 | Yes | Mehman (4/1) / Plushy (15/2) | — / — | — / I'm Spartacus (5/2) |
| 2026-01-28 Dundalk 15:32 | Yes | Mount Ruapehu (9/4) / Thaloria (40/1) **W** | — / Ballymagreehan (4/1) | — / Ballymagreehan (4/1) |
| 2026-01-28 Dundalk 16:02 | Yes | Alfred Tennyson (50/1) / Inishfallen (7/4) | Inishfallen (7/4) / Venetian (16/1) | Little Empire (2/1) / — |
| 2026-01-29 Lingfield 13:20 | Yes | Thecoffeepoddotco (9/4) **W** / Captain Kinsella (8/1) | — / — | — / Gustav Graves (10/3) |
| 2026-01-29 Lingfield 14:20 | Yes | Charles Morin (18/1) / Volendam (5/2) | Volendam (5/2) / Charles Morin (18/1) | Volendam (5/2) / Charles Morin (18/1) |
| 2026-01-29 Lingfield 15:20 | Yes | Didaar (7/2) / King's Hand (9/4) **W** | Alta Rica (25/1) / — | Bownder (17/2) / Alta Rica (25/1) |
| 2026-01-29 Chelmsford City 18:00 | Yes | Poetic Jack (18/5) / Dubai Magic (3/1) | Dubai Magic (3/1) / Poetic Jack (18/5) | Dubai Magic (3/1) / Poetic Jack (18/5) |
| 2026-01-29 Chelmsford City 20:00 | Yes | Mandana (10/3) / Gennadius (7/2) | — / Luminous Warrior (4/1) | — / H Key Lails (5/1) |
| 2026-01-30 Southwell 13:32 | Yes | Hale End (5/1) / Thequietman (22/1) | — / Tonal (11/10) | Tonal (11/10) / Hale End (5/1) |
| 2026-01-30 Southwell 15:03 | Yes | Legal Reform (9/1) / Talis Evolvere (9/4) | — / — | Talis Evolvere (9/4) / Legal Reform (9/1) |
| 2026-01-30 Southwell 16:10 | Yes | Time Turner (4/1) / Rogue Identity (6/4) | — / — | — / Beachborough Girl (7/1) |
| 2026-01-30 Dundalk 16:15 | Yes | Stone Bear (18/5) / Queen Leila (7/2) | — / Beau Army (5/1) **W** | — / Commander Kabaw (50/1) |
| 2026-01-30 Wolverhampton 17:30 | Yes | Headshot (10/1) / Dash Power (4/1) | Lady Delila (13/2) / Headshot (10/1) | Lady Delila (13/2) / — |
| 2026-01-30 Wolverhampton 19:00 | Yes | Hardstyle (5/1) / Toastmaster (2/1) | — / — | — / Phantom Watch (6/1) |
| 2026-01-30 Dundalk 19:15 | Yes | Church Mountain (9/2) / Doctor Grace (12/1) | — / — | Mapa (10/1) / Church Mountain (9/2) |
| 2026-01-30 Wolverhampton 19:30 | Yes | City Of God (9/2) / Special Ghaiyyath (9/2) | Borgi (9/2) / City Of God (9/2) | Borgi (9/2) / — |
| 2026-01-30 Wolverhampton 20:00 | Yes | My Shagaf (16/1) / Urgent Call (33/1) | Balthamos (4/1) / My Shagaf (16/1) | Balthamos (4/1) / Three Non Blondes (5/1) **W** |
| 2026-01-30 Wolverhampton 20:30 | Yes | Lovat Scout (12/1) / Papa Cocktail (5/2) **W** | — / — | — / Em Four (11/2) |
| 2026-01-31 Lingfield 12:35 | Yes | Party Bear (11/4) **W** / Dream Of Mischief (11/4) | — / Me Tarzan (4/1) | — / Me Tarzan (4/1) |
| 2026-01-31 Lingfield 13:38 | Yes | Al Baahy (7/4) **W** / Hijo De La Luna (5/1) | — / Monks Mead (5/2) | Iftikhaar (8/1) / Al Baahy (7/4) **W** |
| 2026-01-31 Lingfield 16:30 | Yes | No Knee Never (15/2) / Naval Ensign (33/1) | — / Pitney (15/2) | Pitney (15/2) / No Knee Never (15/2) |
| 2026-01-31 Newcastle 16:55 | Yes | Pal Joey (8/1) **W** / Wrestling Revenue (80/1) | — / — | Water Of Leith (7/2) / I Need Your Love (6/1) |
| 2026-01-31 Newcastle 17:55 | Yes | War Howl (20/1) / Northern Spirit (16/1) | — / Midnight's Dream (4/1) | — / Midnight's Dream (4/1) |
| 2026-01-31 Newcastle 18:25 | Yes | Annandale (20/1) / Springbok (13/2) | Wyvern (4/1) / Annandale (20/1) | Wyvern (4/1) / Mercurius Power (10/1) |
| 2026-01-31 Newcastle 18:55 | Yes | Henriette Ronner (15/2) **W** / Mademoiselle Belle (9/2) | — / Surgeon Commander (6/1) | Surgeon Commander (6/1) / — |
| 2026-02-02 Wolverhampton 17:00 | Yes | Shahbaz (11/8) / Golden Move (50/1) | The Corporate Guy (8/1) / Shahbaz (11/8) | The Corporate Guy (8/1) / Shahbaz (11/8) |
| 2026-02-02 Wolverhampton 18:30 | Yes | Latin (9/4) / Mr Nugget (11/2) **W** | — / — | — / First Greyed (8/1) |
| 2026-02-02 Wolverhampton 19:00 | Yes | Stipulation (9/4) / Poetic Force (22/1) | — / Tiger Beetle (22/1) | — / Powerful Response (6/1) |
| 2026-02-03 Wolverhampton 19:00 | Yes | One Cool Dreamer (4/1) / Hill Station (25/1) | — / Captain Robert (9/4) | Captain Robert (9/4) / One Cool Dreamer (4/1) |
| 2026-02-03 Wolverhampton 20:00 | Yes | Flash Rascal (9/4) / Whizzy Dizzy (22/1) | — / Grey Horizon (6/5) | Grey Horizon (6/5) / Flash Rascal (9/4) |
| 2026-02-03 Wolverhampton 20:30 | Yes | Thanh Nam (4/1) / Lexington Express (15/8) | — / — | — / Popty Ping (13/2) |
| 2026-02-04 Kempton 12:50 | Yes | Mbappe (3/1) / Galaxy Wonder (2/1) | — / — | Galaxy Wonder (2/1) / Mbappe (3/1) |
| 2026-02-04 Kempton 14:35 | Yes | Portoro (6/4) / U S S Constitution (5/2) **W** | U S S Constitution (5/2) **W** / Portoro (6/4) | U S S Constitution (5/2) **W** / Portoro (6/4) |
| 2026-02-04 Kempton 15:45 | Yes | Must Believe (11/2) / Johnny Boom (20/1) | — / Imperial Trooper (14/1) | — / Imperial Trooper (14/1) |
| 2026-02-04 Kempton 16:15 | Yes | Initial Blue (11/4) **W** / Alashos (8/1) | — / — | Magna (4/1) / — |
| 2026-02-04 Newcastle 19:00 | Yes | Mission Command (3/1) / Castan (5/1) | Castan (5/1) / Mission Command (3/1) | Castan (5/1) / King's Crown (14/1) |
| 2026-02-04 Newcastle 20:00 | Yes | Wrist Art (4/1) / Sir Maxi (8/1) | — / — | Sir Maxi (8/1) / Wrist Art (4/1) |
| 2026-02-04 Newcastle 20:30 | Yes | Sea Legend (2/1) **W** / Pallas Lord (5/2) | — / — | — / Tasever (9/2) |
| 2026-02-05 Southwell 15:50 | Yes | Amarachi (5/2) / Law Degree (11/1) | — / Scenario (9/2) | Scenario (9/2) / Amarachi (5/2) |
| 2026-02-05 Southwell 16:25 | Yes | Autumn Angel (4/1) / Superior Council (6/1) | Superior Council (6/1) / Autumn Angel (4/1) | Superior Council (6/1) / Dubai Magic (7/1) **W** |
| 2026-02-05 Southwell 18:00 | Yes | Night Bear (5/1) / Havachoc (5/2) **W** | — / — | Havachoc (5/2) **W** / Rosco Rogers (5/1) |
| 2026-02-05 Southwell 18:30 | Yes | Moon Over The Sea (7/2) / Smokey Malone (5/1) **W** | — / — | Karismatique (13/2) / Moon Over The Sea (7/2) |
| 2026-02-05 Southwell 19:00 | Yes | Studious (9/2) / Forest Caper (17/2) | Aisling Oscar (3/1) **W** / Studious (9/2) | Aisling Oscar (3/1) **W** / Studious (9/2) |
| 2026-02-05 Southwell 19:30 | Yes | Reginald Charles (9/2) / Simply Blue (14/1) | — / Cill Mocheallog (10/3) | — / No Knee Never (11/2) |
| 2026-02-05 Southwell 20:00 | Yes | Enpassant (7/1) / Landlordtothestars (5/1) | — / — | Landlordtothestars (5/1) / Enpassant (7/1) |
| 2026-02-06 Wolverhampton 13:12 | Yes | Albert Cee (3/1) / Nacho Nacho Nacho (7/2) | Early Release (20/1) / Albert Cee (3/1) | Early Release (20/1) / Cooramook (20/1) |
| 2026-02-06 Wolverhampton 14:12 | Yes | Dequinto (6/1) / Oldbury Lad (9/1) **W** | Legendsoftheland (12/1) / Dequinto (6/1) | Legendsoftheland (12/1) / Tootsie (12/1) |
| 2026-02-06 Wolverhampton 14:42 | Yes | Von Krolock (6/4) **W** / Rock Master (5/1) | Rock Master (5/1) / Von Krolock (6/4) **W** | Rock Master (5/1) / Von Krolock (6/4) **W** |
| 2026-02-06 Wolverhampton 15:17 | Yes | Royal Jet (3/1) **W** / Bad Habits (5/1) | — / — | — / No Nay Nevermind (20/1) |
| 2026-02-06 Wolverhampton 15:52 | Yes | Marra Donna (1/1) / Luna Beaux (9/2) | — / — | Luna Beaux (9/2) / Marra Donna (1/1) |
| 2026-02-06 Newcastle 17:00 | Yes | Bella Bisbee (14/1) / Straight A (9/1) | Goldmoyne (11/8) / Flowstate (5/1) **W** | Goldmoyne (11/8) / Judgment Call (12/1) |
| 2026-02-06 Newcastle 17:30 | Yes | Lerwick (9/1) / Sea Legend (13/8) | Sea Legend (13/8) / Novak (12/1) | Sea Legend (13/8) / Novak (12/1) |
| 2026-02-06 Newcastle 18:00 | Yes | Pal Joey (2/1) / Albegone (25/1) | — / Ganesha (15/2) | — / Ganesha (15/2) |
| 2026-02-06 Dundalk 18:15 | Yes | Una Matata (9/4) **W** / Mehman (9/2) | Go Out (9/2) / Una Matata (9/4) **W** | Go Out (9/2) / Una Matata (9/4) **W** |
| 2026-02-06 Dundalk 18:45 | Yes | Georg Zhukov (15/2) / Beat The Devil (15/8) | — / — | Beat The Devil (15/8) / Georg Zhukov (15/2) |
| 2026-02-06 Newcastle 19:00 | Yes | Apache Outlaw (12/1) / Air Force One (11/1) | — / Elegant Erin (33/1) | — / Elegant Erin (33/1) |
| 2026-02-06 Dundalk 19:15 | Yes | Glamorous Marlene (50/1) / Stonking (125/1) | Drucker (4/1) **W** / Church Mountain (6/1) | Drucker (4/1) **W** / Satono Chevalier (10/3) |
| 2026-02-06 Newcastle 19:30 | Yes | Mostar Dreams (9/1) / Champagne Powder (11/2) | Champagne Powder (11/2) / Callianassa (14/1) **W** | Callianassa (14/1) **W** / Advancing (3/1) |
| 2026-02-06 Newcastle 20:00 | Yes | The Dragon King (6/1) / Sunriseontheboyne (28/1) | — / — | — / Maximising (10/3) |
| 2026-02-06 Newcastle 20:30 | Yes | Hundred Caps (10/3) / Sergeant Pep (17/2) | Sergeant Pep (17/2) / Hundred Caps (10/3) | Sergeant Pep (17/2) / Arnhem (6/1) |
| 2026-02-07 Lingfield 14:55 | Yes | Mr Cool (17/2) / Serenity Dream (18/5) | Serenity Dream (18/5) / Mr Cool (17/2) | Monsieur Kodi (7/2) **W** / — |
| 2026-02-07 Lingfield 16:05 | Yes | Silkies Sib (4/1) / Eutropia (7/1) | — / — | Muy Muy Loco (13/8) **W** / — |
| 2026-02-08 Chelmsford City 15:37 | Yes | Jodhpur Blue (2/1) / Harlington (15/8) **W** | Harlington (15/8) **W** / Jodhpur Blue (2/1) | Harlington (15/8) **W** / Gennadius (6/1) |
| 2026-02-08 Chelmsford City 16:07 | Yes | Gundogan (2/1) / Forever Noah (5/2) **W** | Respectable Jack (2/1) / Gundogan (2/1) | Respectable Jack (2/1) / — |
| 2026-02-09 Wolverhampton 17:30 | Yes | Thecoffeepoddotco (4/1) / Beaumadier (4/1) | — / — | Hint Of Humour (8/1) / Thecoffeepoddotco (4/1) |
| 2026-02-09 Wolverhampton 18:00 | Yes | Deferred Interest (3/1) / Belle Amie (7/4) **W** | Belle Amie (7/4) **W** / Deferred Interest (3/1) | Belle Amie (7/4) **W** / Deferred Interest (3/1) |
| 2026-02-09 Wolverhampton 18:30 | Yes | Starfighter (4/6) / Petra Grey (14/1) | — / — | — / Nakatomi (10/1) |
| 2026-02-10 Lingfield 13:48 | Yes | Nogo's Dream (4/1) / Star Chorus (9/4) | — / — | — / Fidelius (6/4) **W** |
| 2026-02-10 Lingfield 15:48 | Yes | Arcadian Nights (6/1) / Bravo Zulu (22/1) | Wyld Bill (4/1) **W** / Cristo (11/2) | Wyld Bill (4/1) **W** / Cristo (11/2) |
| 2026-02-10 Lingfield 16:18 | Yes | Three On Thursday (85/40) / Top Of Pleinmont (10/1) | — / Take The Boat (5/2) | — / Take The Boat (5/2) |
| 2026-02-10 Newcastle 16:45 | Yes | Lord Mayor (10/3) / Wicksey (11/8) **W** | — / Cospicua (6/1) | — / Cospicua (6/1) |
| 2026-02-10 Newcastle 18:45 | Yes | Beneficiary (5/1) / Green Valentine (22/1) | Sir Maxi (5/2) / Beneficiary (5/1) | Sir Maxi (5/2) / Beneficiary (5/1) |
| 2026-02-10 Newcastle 19:15 | Yes | Dc Cogent (3/1) / Spartan Fighter (7/2) **W** | — / Phoenix Of Dreams (9/1) | — / Phoenix Of Dreams (9/1) |
| 2026-02-11 Southwell 14:14 | Yes | Fleur De Mer (11/2) / Himself (1/1) | — / Moab (6/1) | Billy Bathgate (9/1) / Fleur De Mer (11/2) |
| 2026-02-11 Dundalk 14:38 | Yes | Gallo Dell Cielo (9/2) / Tatateo (13/8) | — / Umala (40/1) | — / Umala (40/1) |
| 2026-02-11 Southwell 14:44 | Yes | Calaxy (28/1) / Liberty Bird (15/2) | Dream Illusion (7/1) **W** / Heretic (6/1) | Dream Illusion (7/1) **W** / Mercurius Power (6/1) |
| 2026-02-11 Southwell 15:44 | Yes | Nammos (10/3) / Brother Dave (10/1) | — / Hint Of The Jungle (3/1) **W** | — / Hint Of The Jungle (3/1) **W** |
| 2026-02-11 Southwell 16:14 | Yes | Em Four (9/1) / Blue Lakota (11/1) | State Of Madness (5/4) / Em Four (9/1) | State Of Madness (5/4) / Em Four (9/1) |
| 2026-02-11 Kempton 16:28 | Yes | Cynthia (5/1) / D Day Arvalenreeva (11/4) | — / — | — / Lunar Power (14/1) |
| 2026-02-11 Kempton 18:40 | Yes | All Moonshine (6/4) **W** / Summer Heat (17/2) | — / — | — / True Colors (9/2) |
| 2026-02-11 Kempton 19:40 | Yes | Alibey (16/1) / Veraison (7/2) | Veraison (7/2) / Aiming High (13/2) | Aiming High (13/2) / — |
| 2026-02-11 Kempton 20:10 | Yes | My Boy Harry (7/1) / Vizzavona Lady (9/2) | Token Gesture (5/2) / — | Token Gesture (5/2) / — |
| 2026-02-12 Lingfield 14:33 | Yes | This Guy (13/2) / Henrythenate (5/2) **W** | — / Loleeta (33/1) | — / U S S Charleston (11/2) |
| 2026-02-12 Lingfield 15:08 | Yes | Kento (6/1) / Captain Kinsella (6/1) | — / — | — / An Laochmor (4/6) **W** |
| 2026-02-12 Lingfield 15:43 | Yes | Everest (66/1) / Come To Pass (14/1) | Come To Pass (14/1) / Haveagobeau (10/3) | Thundering Breeze (10/1) / Haveagobeau (10/3) |
| 2026-02-12 Lingfield 16:15 | Yes | Foreseen (6/1) / Hitched (6/1) | Hitched (6/1) / Foreseen (6/1) | Hitched (6/1) / Lexington Jet (6/1) |
| 2026-02-12 Lingfield 16:50 | Yes | Mintana (4/1) **W** / Friday Again (16/1) | — / — | — / Woodrafff (10/11) |
| 2026-02-13 Dundalk 16:28 | Yes | Irish Ballet (40/1) / Vibrato (50/1) | — / Bold Optimist (4/1) | — / Bold Optimist (4/1) |
| 2026-02-13 Wolverhampton 17:45 | Yes | Chourmo (10/3) / Captain Pickles (5/1) | Captain Pickles (5/1) / Lhebayeb (9/2) | Pave The Way (28/1) / Lhebayeb (9/2) |
| 2026-02-13 Dundalk 18:00 | Yes | Southgreen (40/1) / March To The Band (17/2) | Alex Belardo (10/3) / Profit Surge (7/2) | Profit Surge (7/2) / Jazzy Dancer (8/1) **W** |
| 2026-02-13 Dundalk 19:30 | Yes | Daonethatgotaway (3/1) / Unterberg (3/1) **W** | — / — | — / Captain Ciano (25/1) |
| 2026-02-14 Lingfield 15:45 | Yes | Angry Ant (28/1) / Ebn Sabt (5/1) **W** | Ebn Sabt (5/1) **W** / Who's On First (6/4) | Corniche Girl (20/1) / — |
| 2026-02-14 Lingfield 16:20 | Yes | Mart (3/1) / Ottawa (12/1) | — / Combustion (8/11) **W** | Combustion (8/11) **W** / Mart (3/1) |
| 2026-02-14 Newcastle 16:25 | Yes | Forest Caper (3/1) / Mao Shang Wong (5/1) | — / — | — / Golspie (11/2) |
| 2026-02-14 Newcastle 16:55 | Yes | Teardrops (10/1) / Rajstar (7/1) | Pit Boss (10/3) / Teardrops (10/1) | Pit Boss (10/3) / — |
| 2026-02-14 Newcastle 17:55 | Yes | Inspired (2/1) / Bajan Bandit (20/1) | — / Aisling Oscar (5/2) | Aisling Oscar (5/2) / Francesi (7/2) **W** |
| 2026-02-14 Newcastle 18:25 | Yes | Rogue Rebellion (11/4) / Mythical Night (7/2) | — / Mystical Land (5/2) | — / Mademoiselle Belle (10/3) **W** |
| 2026-02-15 Newcastle 13:42 | Yes | Showmedemoney (5/1) / Staffordshire (7/1) **W** | — / Oh So Cool (7/2) | Oh So Cool (7/2) / Showmedemoney (5/1) |
| 2026-02-15 Newcastle 14:42 | Yes | Nymphaea (9/1) / I Am Simba (12/1) | — / Yquem (9/4) | Yquem (9/4) / Nymphaea (9/1) |
| 2026-02-15 Newcastle 15:12 | Yes | Desert Quest (33/1) / Dancing Bay (9/1) | Highland Harvey (5/2) / Desert Quest (33/1) | Highland Harvey (5/2) / Desert Quest (33/1) |
| 2026-02-15 Newcastle 15:42 | Yes | I Can Boogy (10/3) / Bandello (7/1) | — / Sir Maxi (11/2) | Sir Maxi (11/2) / I Can Boogy (10/3) |
| 2026-02-15 Newcastle 16:12 | Yes | Flowstate (10/3) **W** / Tasever (7/2) | — / — | — / Front Gunner (3/1) |
| 2026-02-15 Newcastle 17:12 | Yes | Toomuchforme (50/1) / Digital (6/5) **W** | — / — | Digital (6/5) **W** / Correspondence (17/2) |
| 2026-02-16 Wolverhampton 17:00 | Yes | Alondra (3/1) / El Bufalo (9/4) | — / Lion's House (7/4) | — / Lion's House (7/4) |
| 2026-02-16 Wolverhampton 17:30 | Yes | Bad Habits (6/4) / Nammos (7/2) | — / — | — / Instant Bond (7/2) |
| 2026-02-16 Wolverhampton 19:30 | Yes | Samra Star (8/1) **W** / Magic Runner (10/3) | Magic Runner (10/3) / Samra Star (8/1) **W** | Magic Runner (10/3) / Pink Socks (9/1) |
| 2026-02-17 Wolverhampton 16:22 | Yes | Annandale (10/3) / Knight Of Magic (13/8) **W** | — / — | Spaceage Love Song (3/1) / Annandale (10/3) |
| 2026-02-17 Wolverhampton 16:57 | Yes | Rosco Rogers (9/4) / Pride Of Nepal (14/1) | Pride Of Nepal (14/1) / Queensland Boy (7/2) | Queensland Boy (7/2) / — |
| 2026-02-17 Wolverhampton 17:30 | Yes | Water Of Leith (4/6) / Woodhay Whisper (9/2) **W** | — / — | — / White Umbrella (28/1) |
| 2026-02-17 Wolverhampton 18:30 | Yes | Forever Noah (9/4) / Second Collection (9/2) **W** | Second Collection (9/2) **W** / Forever Noah (9/4) | Second Collection (9/2) **W** / Forever Noah (9/4) |
| 2026-02-17 Wolverhampton 19:30 | Yes | Corundum (9/4) / How's The Guvnor (9/2) | — / Mr Nugget (4/1) | Mr Nugget (4/1) / Corundum (9/4) |
| 2026-02-17 Wolverhampton 20:00 | Yes | He's Our Cracker (16/1) / Scenario (13/2) | Scenario (13/2) / He's Our Cracker (16/1) | Scenario (13/2) / He's Our Cracker (16/1) |
| 2026-02-18 Kempton 17:30 | Yes | Warning Symbol (6/4) **W** / Maria Da Silva (11/1) | Maria Da Silva (11/1) / Silver State (2/1) | Maria Da Silva (11/1) / Silver State (2/1) |
| 2026-02-18 Kempton 18:00 | Yes | King Of Fury (11/2) / Atmosphere (2/1) | Atmosphere (2/1) / King Of Fury (11/2) | Atmosphere (2/1) / King Of Fury (11/2) |
| 2026-02-18 Kempton 18:30 | Yes | Zoustellar (28/1) / Crimson Rambler (5/2) | Crimson Rambler (5/2) / Who's On First (6/5) **W** | Who's On First (6/5) **W** / — |
| 2026-02-18 Kempton 20:00 | Yes | Merrimack (22/1) / Irish Nectar (15/2) | Irish Nectar (15/2) / Charlie Mason (5/1) | Irish Nectar (15/2) / Charlie Mason (5/1) |
| 2026-02-19 Newcastle 15:57 | Yes | Fleurman (40/1) / Vaguely Royal (50/1) | Humble Spark (6/1) / Hatysa (7/4) | Hatysa (7/4) / Weddell Sea (6/1) |
| 2026-02-19 Newcastle 16:30 | Yes | Al Najashi (1/4) **W** / Okiru (25/1) | — / — | — / My Shagaf (20/1) |
| 2026-02-19 Newcastle 17:30 | Yes | Rosemary's Rose (10/1) / Showmedemoney (9/5) **W** | Dequinto (13/2) / — | Dequinto (13/2) / Esque Elegance (11/2) |
| 2026-02-19 Newcastle 18:00 | Yes | Wyvern (6/1) / Lord Capulet (5/4) **W** | Pit Boss (7/2) / — | Pit Boss (7/2) / Call Glory (11/1) |
| 2026-02-19 Newcastle 18:30 | Yes | The Gay Blade (9/4) **W** / Daley T (16/1) | — / — | — / Yaahobby (6/1) |
| 2026-02-19 Newcastle 19:30 | Yes | Tickets (6/4) **W** / Marcello Si (15/2) | — / Laura's Breeze (13/2) | She'sashambles (5/1) / Tickets (6/4) **W** |
| 2026-02-19 Newcastle 20:00 | Yes | Dandy Magic (7/2) / Binadham (11/1) | Binadham (11/1) / Dandy Magic (7/2) | Binadham (11/1) / True Promise (3/1) |
| 2026-02-20 Southwell 16:26 | Yes | Goldmoyne (9/4) / Golden Strike (7/2) | — / — | — / Judgment Call (22/1) |
| 2026-02-20 Dundalk 16:40 | Yes | Thaloria (15/2) / Lahore Da King (6/1) | Lahore Da King (6/1) / Thaloria (15/2) | Lahore Da King (6/1) / Thaloria (15/2) |
| 2026-02-20 Southwell 16:58 | Yes | The Caribbean (11/2) / No Knee Never (12/1) | No Knee Never (12/1) / The Caribbean (11/2) | No Knee Never (12/1) / Dream Illusion (9/2) |
| 2026-02-20 Southwell 17:30 | Yes | Wonder (1/1) **W** / Traila (16/1) | — / — | — / Gifted Angel (8/1) |
| 2026-02-20 Southwell 18:00 | Yes | I Need Your Love (13/2) / Zoulu Warrior (10/1) | Dc Cogent (5/1) / I Need Your Love (13/2) | Dc Cogent (5/1) / Mumayaz (9/2) |
| 2026-02-20 Dundalk 18:15 | Yes | Walhaan (8/1) / Unterberg (3/1) **W** | Voice Of Reason (10/3) / — | Voice Of Reason (10/3) / — |
| 2026-02-20 Southwell 18:30 | Yes | Betsen (13/2) / Aberama Gold (15/2) | Aberama Gold (15/2) / Betsen (13/2) | Silky Wilkie (9/2) / Stanley Spencer (7/1) |
| 2026-02-20 Dundalk 18:45 | Yes | Eighty Eight (10/3) / Imperial Fighter (16/1) | — / Doctor Grace (5/1) | Doctor Grace (5/1) / Marians Gal (7/2) |
| 2026-02-20 Southwell 19:00 | Yes | Midnight Lion (16/1) / Zryan (15/2) | Unassuming (4/1) / Midnight Lion (16/1) | Unassuming (4/1) / Midnight Lion (16/1) |
| 2026-02-20 Southwell 20:00 | Yes | Almaty Star (15/2) / Sam's Hope (15/2) | — / — | — / Nogo's Dream (18/5) |
| 2026-02-20 Southwell 20:30 | Yes | Down To The Kid (7/2) **W** / Madame De Sevigne (10/3) | Madame De Sevigne (10/3) / Down To The Kid (7/2) **W** | Madame De Sevigne (10/3) / Down To The Kid (7/2) **W** |
| 2026-02-21 Lingfield 14:33 | Yes | Hebridean Nomad (3/1) / Sword Of Wessex (5/1) | — / Relocal (9/4) | Relocal (9/4) / Hebridean Nomad (3/1) |
| 2026-02-21 Lingfield 16:27 | Yes | Danehill Star (9/1) / Phyllis Burton (18/1) | Phyllis Burton (18/1) / Danehill Star (9/1) | Ardaddy (11/4) / — |
| 2026-02-21 Lingfield 17:00 | Yes | Madman (6/5) / Rosieisme Darling (5/1) | — / — | Rosieisme Darling (5/1) / Madman (6/5) |
| 2026-02-21 Chelmsford City 18:30 | Yes | Albasheer (13/2) / The Thames Boatman (9/1) | — / — | — / Michaela's Boy (4/1) |
| 2026-02-21 Chelmsford City 20:00 | Yes | Sanditon (5/2) / Homme De Fer (4/1) | — / — | — / Hint Of The Jungle (7/4) **W** |
| 2026-02-23 Wolverhampton 18:00 | Yes | Von Krolock (11/2) / Bad Habits (5/1) | — / — | — / Ramon Di Loria (15/2) **W** |
| 2026-02-23 Wolverhampton 18:30 | Yes | Nammos (5/2) / Fistral Beach (10/3) **W** | — / Faster Bee (13/8) | Faster Bee (13/8) / Nammos (5/2) |
| 2026-02-23 Wolverhampton 20:00 | Yes | Keeper Of Secrets (50/1) / Chourmo (9/4) | Chourmo (9/4) / Gemini Man (9/4) **W** | Chourmo (9/4) / Gemini Man (9/4) **W** |
| 2026-02-24 Newcastle 14:42 | Yes | Amerjeet (2/1) / Sherlock (6/1) **W** | Sherlock (6/1) **W** / Amerjeet (2/1) | Sherlock (6/1) **W** / Amerjeet (2/1) |
| 2026-02-24 Newcastle 15:42 | Yes | True Promise (3/1) / Beale Street (16/1) | — / Dandy Magic (11/2) | — / Dandy Magic (11/2) |
| 2026-02-24 Southwell 15:55 | Yes | Forest Caper (17/2) / Studious (9/2) | — / Mr Nugget (10/3) **W** | Mr Nugget (10/3) **W** / Forest Caper (17/2) |
| 2026-02-24 Southwell 16:25 | Yes | Autumn Angel (11/2) / Ring Of Gold (9/2) | Stacey Racey (13/8) / Autumn Angel (11/2) | Stacey Racey (13/8) / Marcello Si (12/1) |
| 2026-02-24 Newcastle 16:42 | Yes | Bomb Squad (7/2) / Habrdi (11/2) | — / Call Glory (6/1) | — / Call Glory (6/1) |
| 2026-02-24 Southwell 17:00 | Yes | Homer Stokes (9/2) / Aim For The Bull (6/1) **W** | Woodrafff (15/8) / Homer Stokes (9/2) | Laura's Breeze (15/2) / Woodrafff (15/8) |
| 2026-02-24 Southwell 17:30 | Yes | Forever Noah (11/4) / Dubai Magic (11/1) | Yorkshire Glory (13/8) **W** / Asadjumeirah (12/1) | Yorkshire Glory (13/8) **W** / Asadjumeirah (12/1) |
| 2026-02-24 Newcastle 17:42 | Yes | Union Island (14/1) / Corundum (3/1) **W** | Dream Illusion (5/4) / — | Dream Illusion (5/4) / — |
| 2026-02-24 Southwell 18:00 | Yes | Gundogan (10/3) / Top Biller (15/2) | — / — | Top Biller (15/2) / Gundogan (10/3) |
| 2026-02-24 Southwell 18:30 | Yes | Corduroy (9/4) / Wicksey (4/5) **W** | Wicksey (4/5) **W** / Corduroy (9/4) | Wicksey (4/5) **W** / Very Demure (13/2) |
| 2026-02-24 Southwell 20:00 | Yes | Captain Robert (7/2) / Final Entry (33/1) | — / King's Cruiser (16/1) | — / King's Cruiser (16/1) |
| 2026-02-25 Lingfield 16:42 | Yes | Profit Street (9/4) / Just Jump (14/1) | — / Southbank (14/1) | — / Southbank (14/1) |
| 2026-02-25 Kempton 17:05 | Yes | Telling Time (8/1) / Electrocution (5/2) | Electrocution (5/2) / Giles Glory (15/8) | Electrocution (5/2) / Giles Glory (15/8) |
| 2026-02-25 Kempton 18:40 | Yes | Luminous Warrior (11/2) / I Am Me (2/1) **W** | I Am Me (2/1) **W** / Apache Green (6/1) | Apache Green (6/1) / — |
| 2026-02-25 Kempton 19:40 | Yes | Only In Manila (11/4) / Parisian Scholar (4/1) | Parisian Scholar (4/1) / Only In Manila (11/4) | Toastmaster (10/3) / — |
| 2026-02-25 Kempton 20:10 | Yes | Combustion (13/8) **W** / Invincible Speed (16/1) | — / Serenity Dream (4/1) | — / Serenity Dream (4/1) |
| 2026-02-26 Chelmsford City 17:30 | Yes | Hitched (10/1) / City Of God (9/2) **W** | — / — | City Of God (9/2) **W** / Hitched (10/1) |
| 2026-02-26 Chelmsford City 18:00 | Yes | Thecoffeepoddotco (4/1) / Arklow Lad (11/10) **W** | — / — | — / Mumayaz (8/1) |
| 2026-02-26 Chelmsford City 19:30 | Yes | Mr Cool (16/1) / Signcastle City (9/5) | Signcastle City (9/5) / Captain Parma (4/1) **W** | Captain Parma (4/1) **W** / — |
| 2026-02-26 Chelmsford City 20:00 | Yes | Silkies Sib (13/8) **W** / Kaaress (10/1) | — / — | — / Night Bear (4/1) |
| 2026-02-27 Lingfield 13:42 | Yes | Kathleen Mary (9/2) / My Awele (7/1) | Bownder (13/2) / — | Muy Muy Loco (3/1) / Bownder (13/2) |
| 2026-02-27 Lingfield 14:12 | Yes | Mr Juggles (11/1) / One And Gone (11/1) | Henrythenate (9/2) / — | Henrythenate (9/2) / — |
| 2026-02-27 Lingfield 14:42 | Yes | Penelope Valentine (11/1) / Brazilian Rose (18/1) | — / — | — / Powdering (11/2) |
| 2026-02-27 Dundalk 17:00 | Yes | Incredible Army (16/1) / Electric Night (4/1) | — / — | — / One Cool Bear (14/1) |
| 2026-02-27 Wolverhampton 17:13 | Yes | Rainwater (7/2) / Ardaddy (6/4) | — / — | Ardaddy (6/4) / Rainwater (7/2) |
| 2026-02-27 Dundalk 18:00 | Yes | Flanker Jet (12/1) / Liberation Date (9/1) | Liberation Date (9/1) / Flanker Jet (12/1) | Liberation Date (9/1) / Echo Of Faith (13/2) |
| 2026-02-27 Dundalk 18:30 | Yes | Qamari (40/1) / Showyoutheropes (14/1) | Showyoutheropes (14/1) / Echinacea (9/2) | Pearl Jewel (11/1) / Echinacea (9/2) |
| 2026-02-27 Wolverhampton 18:45 | Yes | Coparisi (12/1) / Kanes A Lott (7/1) | — / Buckland Belle (9/2) | Buckland Belle (9/2) / Ganthorpe (7/1) |
| 2026-02-27 Wolverhampton 19:15 | Yes | Way To Dubai (9/1) / Hint Of Humour (4/1) | — / Cayman Tai (1/1) | Cayman Tai (1/1) / Way To Dubai (9/1) |
| 2026-02-27 Wolverhampton 19:45 | Yes | Intinso (14/1) / Pride Of Donegal (6/5) **W** | Pride Of Donegal (6/5) **W** / Francesco Baracca (7/2) | Francesco Baracca (7/2) / — |
| 2026-02-27 Wolverhampton 20:15 | Yes | Aneirin's Sword (6/4) **W** / Inherent Resolve (9/4) | — / Sup Of Red (15/2) | Sup Of Red (15/2) / Aneirin's Sword (6/4) **W** |
| 2026-02-28 Lingfield 13:30 | Yes | Arishka's Dream (5/2) / Cool Molly (9/1) **W** | — / Far Too Fizzy (11/4) | — / Far Too Fizzy (11/4) |
| 2026-02-28 Lingfield 14:35 | Yes | Richie's Rocket (1/1) / Shahik (66/1) | — / Sir Albert (6/1) | Star Strewn (25/1) / Richie's Rocket (1/1) |
| 2026-02-28 Southwell 19:00 | Yes | Glistening (15/2) / Bravo Zulu (7/1) | Aisling Oscar (3/1) / Glistening (15/2) | Aisling Oscar (3/1) / Glistening (15/2) |
| 2026-02-28 Southwell 20:00 | Yes | Seraphic (9/2) / Velvet Red (16/5) | — / Hackney Diamonds (11/2) | Hackney Diamonds (11/2) / Seraphic (9/2) |
| 2026-02-28 Southwell 20:30 | Yes | Love Alive (5/1) / Liverpool Star (10/3) | — / — | — / Alfa Duplicate (16/1) **W** |
| 2026-03-02 Kempton 14:37 | Yes | Real Gold (9/1) / Faithful Dream (2/1) | Life After Love (7/2) / — | Life After Love (7/2) / — |
| 2026-03-02 Kempton 15:07 | Yes | Big Bard (22/1) / Early Release (7/2) **W** | Sub Thirteen (9/1) / — | Sub Thirteen (9/1) / — |
| 2026-03-02 Kempton 15:37 | Yes | Lady Dora Mae (11/8) **W** / Stay Salty (13/8) | — / Dance Fantasy (11/1) | — / Dance Fantasy (11/1) |
| 2026-03-02 Kempton 16:07 | Yes | Mission Command (11/2) / Iconic Times (7/2) | — / Media Shooter (13/2) | — / Media Shooter (13/2) |
| 2026-03-02 Kempton 17:40 | Yes | Cezarro (3/1) / Charming Fellow (100/1) | Rosemary's Rose (11/4) **W** / The Spotlight Kid (5/1) | Rosemary's Rose (11/4) **W** / Dodging The Bullet (6/1) |
| 2026-03-02 Wolverhampton 19:00 | Yes | Port Hedland (5/1) / Classy Clarets (15/8) **W** | Auntie Jo (9/1) / She Went Whoosh (9/1) | Sultan Of Oj (12/1) / Auntie Jo (9/1) |
| 2026-03-02 Wolverhampton 19:30 | Yes | Diamont Katie (9/2) / Insuspense (3/1) | — / So Sassy (9/1) | — / So Sassy (9/1) |
| 2026-03-02 Wolverhampton 20:00 | Yes | Forever Noah (5/1) / Spendmore Lane (3/1) **W** | — / — | Spendmore Lane (3/1) **W** / Forever Noah (5/1) |
| 2026-03-03 Wolverhampton 17:25 | Yes | Circuit Breaker (11/1) / Shrimp Shady (5/2) **W** | — / — | Shrimp Shady (5/2) **W** / Gemmari (2/1) |
| 2026-03-03 Wolverhampton 19:30 | Yes | Alazwar (12/1) / Auric (18/1) | — / — | Auric (18/1) / Alazwar (12/1) |
| 2026-03-03 Wolverhampton 20:30 | Yes | Moon Over The Sea (8/1) / Silkies Sib (7/4) | Silkies Sib (7/4) / Moon Over The Sea (8/1) | Silkies Sib (7/4) / Mooretown Lad (22/1) |
| 2026-03-04 Southwell 13:32 | Yes | How's The Guvnor (11/4) / Asian Journey (9/4) | — / — | — / Heretic (17/2) |
| 2026-03-04 Southwell 14:02 | Yes | No Knee Never (9/4) / Eagles Whistle (5/1) | — / Jamaican Storm (6/1) | — / Jamaican Storm (6/1) |
| 2026-03-04 Southwell 14:32 | Yes | Yorkstone (10/3) / Annalee Lass (15/2) | — / Spirit Of Bowland (13/8) | Spirit Of Bowland (13/8) / Yorkstone (10/3) |
| 2026-03-04 Southwell 15:02 | Yes | Homer Stokes (11/10) **W** / Dash Power (3/1) | Dash Power (3/1) / Hopjes (7/2) | Hopjes (7/2) / — |
| 2026-03-04 Southwell 15:32 | Yes | Lexington Express (4/1) / Quick Turn (6/1) | — / — | Quick Turn (6/1) / Lexington Express (4/1) |
| 2026-03-04 Southwell 16:02 | Yes | Azure Angel (11/2) / Spring Is Sprung (4/1) | Spring Is Sprung (4/1) / Ziggy's Triton (7/1) | Spring Is Sprung (4/1) / Ziggy's Triton (7/1) |
| 2026-03-04 Kempton 17:00 | Yes | Alashos (4/1) / Snow Boots (50/1) | — / Magna (5/2) | — / Magna (5/2) |
| 2026-03-04 Southwell 17:07 | Yes | Kate O'Riley (2/1) / Spirit Of Jura (11/4) | — / Caramay (5/1) | Caramay (5/1) / Kate O'Riley (2/1) |
| 2026-03-04 Southwell 17:40 | Yes | Hatysa (10/11) / Appier (9/1) | — / Call My Bluff (40/1) | — / Tarbat Ness (7/1) |
| 2026-03-04 Kempton 18:00 | Yes | Mr Baloo (17/2) / Shihoku (11/2) | Shihoku (11/2) / I'm Workin On It (4/1) | I'm Workin On It (4/1) / — |
| 2026-03-04 Kempton 20:00 | Yes | Rizal (5/2) / Naval Tribute (9/1) **W** | — / Jodhpur Blue (9/4) | Jodhpur Blue (9/4) / Lilly Lux (11/1) |
| 2026-03-05 Lingfield 14:53 | Yes | Gogo Yubari (13/2) / Beaumadier (5/4) | Beaumadier (5/4) / Gogo Yubari (13/2) | Beaumadier (5/4) / Gogo Yubari (13/2) |
| 2026-03-05 Lingfield 16:00 | Yes | Bradbury (9/4) / Montu (7/4) | — / — | — / Bergamo Gold (17/2) **W** |
| 2026-03-05 Lingfield 16:33 | Yes | Potters Prince (13/2) / Danehill Star (6/4) | Danehill Star (6/4) / Potters Prince (13/2) | Danehill Star (6/4) / Villalobos (5/2) |
| 2026-03-05 Newcastle 16:55 | Yes | Lightening Company (80/1) / Monty Beau (3/1) | Monty Beau (3/1) / Imperial Trooper (9/2) | Monty Beau (3/1) / Imperial Trooper (9/2) |
| 2026-03-05 Newcastle 17:30 | Yes | Arishka's Dream (2/1) / Tactical Blitz (11/4) **W** | — / Elizabetty (6/1) | Elizabetty (6/1) / Arishka's Dream (2/1) |
| 2026-03-05 Newcastle 19:00 | Yes | South Coast Star (11/1) / Panthere Noir (18/1) | Popty Ping (4/1) / Kingofthecarnival (15/8) **W** | Popty Ping (4/1) / Kingofthecarnival (15/8) **W** |
| 2026-03-05 Newcastle 19:30 | Yes | Moonstone Boy (13/2) / Castan (5/1) | Castan (5/1) / Moonstone Boy (13/2) | Castan (5/1) / Moonstone Boy (13/2) |
| 2026-03-05 Newcastle 20:00 | Yes | Lady Delila (9/2) / Woodrafff (3/1) **W** | — / Esque Elegance (7/4) | Esque Elegance (7/4) / Sir Maxi (10/1) |
| 2026-03-06 Dundalk 18:15 | Yes | Umala (5/1) / Drucker (13/8) | Drucker (13/8) / Umala (5/1) | Drucker (13/8) / Minella Mate (10/3) |
| 2026-03-06 Dundalk 18:45 | Yes | Jurality (7/2) / Syosset (9/1) | Syosset (9/1) / Doctor Grace (11/1) | Syosset (9/1) / Without Love (10/3) |
| 2026-03-06 Newcastle 19:00 | Yes | Moyowasi (4/9) **W** / Dequinto (9/1) | — / — | — / Wyvern (15/2) |
| 2026-03-06 Dundalk 19:45 | Yes | Distillate (13/2) / Imperial Fighter (7/1) | — / Bella Colombia (7/1) **W** | Bella Colombia (7/1) **W** / Distillate (13/2) |
| 2026-03-06 Newcastle 20:00 | Yes | Call Glory (15/2) / Pit Boss (7/2) | Yorkshire Glory (13/8) **W** / — | Yorkshire Glory (13/8) **W** / — |
| 2026-03-07 Wolverhampton 14:05 | Yes | Kullazain (11/4) / Knebworth (7/2) **W** | — / Cinque Verde (9/1) | — / Cinque Verde (9/1) |
| 2026-03-07 Wolverhampton 14:42 | Yes | Kingdom Come (17/2) / First Principle (5/1) | — / Regal Ulixes (8/1) | Regal Ulixes (8/1) / Kingdom Come (17/2) |
| 2026-03-07 Wolverhampton 15:15 | Yes | Cool Hoof Luke (11/4) **W** / Ferrous (9/2) | — / — | — / Palmar Bay (7/1) |
| 2026-03-07 Wolverhampton 16:25 | Yes | Kento (5/4) **W** / Washington Heir (33/1) | — / Henery Hawk (9/2) | — / Henery Hawk (9/2) |
| 2026-03-07 Wolverhampton 17:00 | Yes | Elashgar (5/6) / Rosieisme Darling (11/4) | — / — | — / Kanes A Lott (5/1) |
| 2026-03-07 Wolverhampton 17:35 | Yes | Arcadian Nights (4/1) / Way Of Life (12/1) **W** | Towerlands (6/4) / Arcadian Nights (4/1) | Towerlands (6/4) / — |
| 2026-03-07 Chelmsford City 19:00 | Yes | Spendmore Lane (7/4) / Ararat (7/2) | — / Thurso (9/2) | Thurso (9/2) / Spendmore Lane (7/4) |
| 2026-03-07 Chelmsford City 20:00 | Yes | Desdemona (11/4) **W** / Master Zack (14/1) | — / Daley T (22/1) | — / Daley T (22/1) |
| 2026-03-07 Chelmsford City 20:30 | Yes | Renesmee (11/2) **W** / Antiquity (9/4) | Antiquity (9/4) / H Key Lails (5/2) | Antiquity (9/4) / H Key Lails (5/2) |
| 2026-03-09 Wolverhampton 17:30 | Yes | Pessoa (10/3) / Book Of Life (15/8) | Book Of Life (15/8) / Pessoa (10/3) | Book Of Life (15/8) / Concert Boy (4/1) |
| 2026-03-09 Wolverhampton 19:00 | Yes | Champion Again Ole (7/4) **W** / Monsieur Kodi (9/1) | — / Pressure's On (5/1) | Candonomore (7/2) / Champion Again Ole (7/4) **W** |
| 2026-03-09 Wolverhampton 20:00 | Yes | City Of Dreams (11/2) / Crimson Rambler (8/13) **W** | Crimson Rambler (8/13) **W** / City Of Dreams (11/2) | Crimson Rambler (8/13) **W** / Angry Ant (20/1) |
| 2026-03-09 Wolverhampton 20:30 | Yes | Corduroy (9/1) / Wedonttellthetruth (7/4) **W** | — / Sweet Love (13/2) | Sweet Love (13/2) / — |
| 2026-03-10 Wolverhampton 17:30 | Yes | Gemini Man (10/11) / Saachi (4/1) **W** | — / Virtual Hug (4/1) | — / Virtual Hug (4/1) |
| 2026-03-10 Wolverhampton 18:00 | Yes | Oh So Cool (4/1) / Man Is King (17/2) | — / Starfighter (5/2) | — / Belle Of Kt (9/2) **W** |
| 2026-03-10 Southwell 19:45 | Yes | Homer Stokes (13/8) / Embarked (12/1) | — / Laura's Breeze (14/1) | Laura's Breeze (14/1) / Homer Stokes (13/8) |
| 2026-03-10 Southwell 20:15 | Yes | Ruby Red Gove (9/1) / Dc Cogent (5/1) | Dc Cogent (5/1) / Ruby Red Gove (9/1) | Dc Cogent (5/1) / Ruby Red Gove (9/1) |
| 2026-03-10 Wolverhampton 20:30 | Yes | Woodrafff (5/2) / Paps Of Jura (16/1) | — / — | — / Stacey Racey (2/1) |
| 2026-03-11 Newcastle 17:00 | Yes | Wave Rock (4/1) / Staffordshire (4/1) | Staffordshire (4/1) / Wave Rock (4/1) | Staffordshire (4/1) / Teggy Lasso (5/2) |
| 2026-03-11 Southwell 17:05 | Yes | River Wharfe (10/1) **W** / Rambuso Creek (10/3) | Rambuso Creek (10/3) / River Wharfe (10/1) **W** | Rambuso Creek (10/3) / Von Krolock (11/1) |
| 2026-03-11 Newcastle 17:30 | Yes | Edwardtheninth (9/4) / Free Pic (5/1) | — / — | Nakatomi (28/1) / Edwardtheninth (9/4) |
| 2026-03-11 Southwell 17:40 | Yes | Artanis (1/1) / Dagger Strike (15/8) | — / Loquella (28/1) | Loquella (28/1) / Artanis (1/1) |
| 2026-03-11 Newcastle 19:00 | Yes | Coparisi (16/1) / Liquid Cooled (9/2) **W** | Ganthorpe (9/2) / Coparisi (16/1) | Ganthorpe (9/2) / Container Express (5/1) |
| 2026-03-11 Southwell 19:15 | Yes | Faster Bee (17/2) / Up The Monk (10/1) | — / Elvetham (2/1) | Elvetham (2/1) / Faster Bee (17/2) |
| 2026-03-11 Southwell 19:45 | Yes | Charlie Darling (66/1) / Velvet Red (11/2) **W** | Tenadaay (3/1) / — | Tenadaay (3/1) / — |
| 2026-03-11 Southwell 20:15 | Yes | Goldmoyne (5/2) **W** / Bee My Honey (14/1) | — / Packetofbiscuits (11/4) | Packetofbiscuits (11/4) / How Impressive (11/1) |
| 2026-03-12 Newcastle 16:28 | Yes | Regal Glory (3/1) / Rock Armour (10/1) | Sir Maxi (13/2) / Myna (16/1) | Sir Maxi (13/2) / Myna (16/1) |
| 2026-03-12 Newcastle 17:08 | Yes | Clansman (11/2) **W** / Golspie (5/2) | — / Jack Sparowe (11/2) | Jack Sparowe (11/2) / Clansman (11/2) **W** |
| 2026-03-12 Chelmsford City 17:30 | Yes | Respond (1/2) **W** / Penzance (15/2) | — / Dark Moon Rising (13/2) | — / Dark Moon Rising (13/2) |
| 2026-03-12 Newcastle 18:15 | Yes | Havana Jag (8/1) / Enter Sandman (4/1) | — / Mademoiselle Belle (4/1) | — / Mystical Land (6/1) |
| 2026-03-12 Chelmsford City 18:30 | Yes | Frankali (6/1) / Giles Glory (6/1) | — / — | — / Oh So Perfect (7/2) **W** |
| 2026-03-12 Newcastle 20:15 | Yes | Pit Boss (11/4) / Pallas Lord (11/1) | — / Front Gunner (6/1) | Ey Up He's A Star (17/2) / Pit Boss (11/4) |
| 2026-03-13 Wolverhampton 16:25 | Yes | Brasil Power (5/2) **W** / Sheradann (5/2) | — / Sax Appeal (4/1) | Sax Appeal (4/1) / Brasil Power (5/2) **W** |
| 2026-03-13 Wolverhampton 17:05 | Yes | Macarone (10/3) / Just Jump (9/2) | — / — | — / Initial Blue (4/1) |
| 2026-03-13 Southwell 17:10 | Yes | Seven Fires (11/8) **W** / Early Release (4/1) | Early Release (4/1) / Seven Fires (11/8) **W** | Early Release (4/1) / Woodhay Whisper (13/2) |
| 2026-03-13 Dundalk 18:00 | Yes | Al What (11/2) / Eighty Eight (10/3) | — / — | Aingeal Dorcha (5/1) **W** / — |
| 2026-03-13 Dundalk 18:30 | Yes | Voice Of Reason (5/2) / Daonethatgotaway (5/2) | — / — | — / Tassarolo (20/1) |
| 2026-03-13 Dundalk 19:00 | Yes | Darkdeserthighway (4/1) / Summer Island (13/8) | — / Expound (16/1) | Expound (16/1) / Beat The Devil (15/2) |
| 2026-03-13 Southwell 19:20 | Yes | Marry The Night (7/2) **W** / Enpassant (14/1) | Asian Journey (9/4) / Marry The Night (7/2) **W** | Asian Journey (9/4) / Jamaican Storm (9/2) |
| 2026-03-13 Wolverhampton 19:40 | Yes | South Kensington (4/1) / Pessoa (5/2) | — / Call Glory (2/1) | — / Call Glory (2/1) |
| 2026-03-13 Wolverhampton 20:10 | Yes | Invincible Melody (15/2) / Fistral Beach (7/2) | — / Ardaddy (9/4) | Ardaddy (9/4) / Invincible Melody (15/2) |
| 2026-03-13 Southwell 20:20 | Yes | Knight Of Magic (7/4) / Deferred Interest (17/2) | — / — | Deferred Interest (17/2) / Hickton (9/2) |
| 2026-03-13 Dundalk 20:30 | Yes | Jazzy Dancer (5/2) / Skillman Ave (28/1) | — / Sovereign Banter (4/1) | Sovereign Banter (4/1) / Jazzy Dancer (5/2) |
| 2026-03-14 Southwell 18:00 | Yes | Iconic Times (14/1) / Qazaq (9/4) | — / Anthropologist (15/2) | Anthropologist (15/2) / Iconic Times (14/1) |
| 2026-03-14 Southwell 18:30 | Yes | Aspire To Glory (10/1) / Pinjarra (13/2) | — / Amerjeet (10/3) | Amerjeet (10/3) / Bullington Bry (9/2) |
| 2026-03-14 Southwell 19:00 | Yes | Woodrafff (6/4) / Dash Power (9/2) | — / — | — / Hopjes (5/1) |
| 2026-03-14 Southwell 20:30 | Yes | Master Of My Fate (9/4) / Sam's Hope (7/1) | — / — | — / Sports Coach (9/4) **W** |
| 2026-03-16 Wolverhampton 18:00 | Yes | Lhebayeb (11/4) / Resilient Lady (12/1) | — / — | Nutcracker (33/1) / Lhebayeb (11/4) |
| 2026-03-16 Wolverhampton 19:00 | Yes | Legacy Rock (3/1) / Sup Of Red (10/3) | Corniche Girl (13/2) / — | Corniche Girl (13/2) / — |
| 2026-03-16 Wolverhampton 19:30 | Yes | Beauzon (11/4) / Mart (11/1) | — / Water Of Leith (6/4) **W** | — / Water Of Leith (6/4) **W** |
| 2026-03-16 Wolverhampton 20:00 | Yes | Kento (6/4) / Lion Ring (10/1) | — / Phil's Dream (5/1) **W** | — / Phil's Dream (5/1) **W** |
| 2026-03-17 Wolverhampton 18:00 | Yes | Punchbowl Flyer (11/1) / Landlordtothestars (6/1) | Pickersgill (11/1) / — | Pickersgill (11/1) / Crystal Dagger (16/1) |
| 2026-03-17 Wolverhampton 18:30 | Yes | Al Shabab (9/4) / Keeper Of Secrets (8/1) | Arlecchino's Rex (11/4) / Al Shabab (9/4) | Arlecchino's Rex (11/4) / Al Shabab (9/4) |
| 2026-03-17 Wolverhampton 20:30 | Yes | Galaxy Wonder (15/8) **W** / Masqool (18/1) | — / River Wharfe (12/1) | — / Eutropia (17/2) |
| 2026-03-18 Kempton 18:00 | Yes | Acclaimed Freedom (7/1) / Hardstyle (15/2) | — / — | Hardstyle (15/2) / Lion of Mali (9/2) **W** |
| 2026-03-18 Kempton 19:00 | Yes | Sea Founder (5/1) / Jazzy Baby (3/1) | Jazzy Baby (3/1) / Final Night (15/8) **W** | Final Night (15/8) **W** / Atmosphere (11/2) |
| 2026-03-18 Kempton 19:30 | Yes | Serenity Dream (5/4) / Invincible Speed (11/2) | — / Media Shooter (11/1) | — / Media Shooter (11/1) |
| 2026-03-18 Kempton 20:00 | Yes | Imperial Decision (5/2) / Seraphic (15/2) **W** | — / — | — / Far And Above (10/1) |
| 2026-03-18 Kempton 20:30 | Yes | Tortured Soul (6/1) / King's Hand (11/4) | — / — | King's Hand (11/4) / Tortured Soul (6/1) |
| 2026-03-19 Newcastle 17:25 | Yes | Mao Shang Wong (7/2) **W** / Star Cast (16/1) | Dingwall (3/1) / Mao Shang Wong (7/2) **W** | Riyadh Gem (5/1) / Dingwall (3/1) |
| 2026-03-19 Newcastle 20:00 | Yes | Spirit Of Bowland (6/1) / Woodrafff (15/8) | Woodrafff (15/8) / Spirit Of Bowland (6/1) | Esque Elegance (4/1) / — |
| 2026-03-20 Lingfield 14:42 | Yes | A Taste of Glory (5/1) **W** / Exotic Baby (12/1) | Al Azd (11/4) / — | Al Azd (11/4) / — |
| 2026-03-20 Lingfield 15:12 | Yes | Profit Street (2/1) / Way To Dubai (16/1) | — / My Mate Mike (11/2) | — / Cayman Tai (6/1) |
| 2026-03-20 Lingfield 16:17 | Yes | Rogue Dynasty (15/8) / Rosemary's Rose (7/4) | — / — | — / Salaria (11/4) **W** |
| 2026-03-20 Lingfield 16:50 | Yes | Wedgewood (9/2) **W** / Running Cool (6/1) | — / Sonic Si (11/4) | Sonic Si (11/4) / Wedgewood (9/2) **W** |
| 2026-03-20 Dundalk 17:10 | Yes | Collective Power (9/2) / Mehman (9/4) | — / Inishfallen (7/2) | Inishfallen (7/2) / — |
| 2026-03-20 Lingfield 17:25 | Yes | Goldmoyne (9/2) **W** / Foreseen (6/1) | — / Warning Sign (66/1) | — / Maximising (9/4) |
| 2026-03-20 Wolverhampton 18:00 | Yes | Youarenotforgiven (9/2) **W** / Marry The Night (7/2) | — / — | — / Antiquity (11/2) |
| 2026-03-20 Dundalk 18:15 | Yes | Wellwhatshappenin (9/2) / Georg Zhukov (12/1) | Georg Zhukov (12/1) / Johnny's Oasis (11/2) | Johnny's Oasis (11/2) / — |
| 2026-03-20 Wolverhampton 18:30 | Yes | Ernie's Valentine (7/4) / Up The Jazz (10/1) | — / Eagle Day (11/2) | Jewel Maker (33/1) / Ernie's Valentine (7/4) |
| 2026-03-20 Wolverhampton 19:00 | Yes | First Principle (11/4) **W** / City Of Poets (4/1) | — / — | Advancing (9/2) / First Principle (11/4) **W** |
| 2026-03-20 Dundalk 19:15 | Yes | Daler (9/4) / Ocean Manifest (11/2) | — / — | Una Matata (16/1) / Daler (9/4) |
| 2026-03-20 Wolverhampton 19:30 | Yes | Fierce Fortitude (9/1) / My Fermoy (3/1) **W** | Spanish Voice (3/1) / Metallo (13/2) | Spanish Voice (3/1) / High On Hope (5/1) |
| 2026-03-20 Dundalk 19:45 | Yes | Drucker (3/1) / Voice Of Reason (7/2) | — / Unterberg (4/1) **W** | — / Beauparc (3/1) |
| 2026-03-20 Wolverhampton 20:00 | Yes | Pietro (9/1) **W** / North View (14/1) | The Dragon King (5/2) / Pietro (9/1) **W** | The Dragon King (5/2) / Pietro (9/1) **W** |
| 2026-03-21 Southwell 13:43 | Yes | Tuscan Point (11/10) / Mount Ruapehu (9/2) **W** | — / Bullington Bry (11/1) | — / Bullington Bry (11/1) |
| 2026-03-21 Southwell 14:20 | Yes | Scenario (16/1) / Volendam (8/1) | Heretic (3/1) / Scenario (16/1) | Heretic (3/1) / — |
| 2026-03-21 Newcastle 17:00 | Yes | Alther Walden (2/1) **W** / Rastnet (10/3) | Rastnet (10/3) / Alther Walden (2/1) **W** | Rastnet (10/3) / Alther Walden (2/1) **W** |
| 2026-03-21 Southwell 17:13 | Yes | Green Sky (16/1) / Solar Pass (4/1) **W** | Little Miss India (9/4) / Lilly Lux (4/1) | Little Miss India (9/4) / Lilly Lux (4/1) |
| 2026-03-21 Newcastle 19:00 | Yes | Mr Nugget (9/2) / Harswell Ruby (18/1) | Tasever (8/1) / Mr Nugget (9/2) | Barry's Boy (9/4) **W** / Tasever (8/1) |
| 2026-03-21 Newcastle 20:30 | Yes | Tarlac (25/1) / South Road (50/1) | Pit Boss (15/8) **W** / Andalprofit (7/2) | Andalprofit (7/2) / Pit Boss (15/8) **W** |
| 2026-03-23 Wolverhampton 16:50 | Yes | Fistral Beach (11/4) **W** / Zu Run (11/4) | — / — | Faster Bee (4/1) / Fistral Beach (11/4) **W** |
| 2026-03-23 Wolverhampton 17:25 | Yes | Romanovich (9/4) **W** / Bernie The Bear (14/1) | Bernie The Bear (14/1) / Bungle Bay (17/2) | Bungle Bay (17/2) / — |
| 2026-03-23 Wolverhampton 19:30 | Yes | East Tyrone (3/1) / Charging Bull (28/1) | — / Midnight Call (7/2) | Midnight Call (7/2) / East Tyrone (3/1) |
| 2026-03-23 Wolverhampton 20:30 | Yes | Betsen (15/8) / The Flying Seagull (2/1) | The Flying Seagull (2/1) / Betsen (15/8) | Dyrholaey (5/1) / — |
| 2026-03-24 Wolverhampton 16:23 | Yes | Karmacy (16/1) / Worlington (7/2) | Quick Turn (9/4) **W** / Karmacy (16/1) | Quick Turn (9/4) **W** / Lapidarist (10/3) |
| 2026-03-24 Wolverhampton 16:55 | Yes | Angry Ant (8/1) / Sorted (5/4) | Lexington Express (85/40) **W** / Angry Ant (8/1) | Lexington Express (85/40) **W** / Angry Ant (8/1) |
| 2026-03-24 Wolverhampton 17:30 | Yes | Kento (11/4) **W** / Kipp Kelly (4/1) | — / — | — / Henery Hawk (15/2) |
| 2026-03-24 Wolverhampton 18:30 | Yes | Autumn Angel (4/1) / Mister Mcgregor (8/1) | Beneficiary (9/2) / Autumn Angel (4/1) | Beneficiary (9/2) / Optimistic (11/2) |
| 2026-03-24 Wolverhampton 19:30 | Yes | American Bay (2/1) / Smooth Silesie (18/1) | — / Mr Lightside (85/40) | — / Mr Lightside (85/40) |
| 2026-03-24 Wolverhampton 20:30 | Yes | Spaceport (40/1) / Farasi Lane (11/10) **W** | Farasi Lane (11/10) **W** / Helm Rock (4/1) | Helm Rock (4/1) / — |
| 2026-03-25 Lingfield 15:22 | Yes | Filly Foden (9/1) / Welcome Retreat (7/2) | Welcome Retreat (7/2) / Filly Foden (9/1) | Welcome Retreat (7/2) / Whiskey Kisses (11/2) |
| 2026-03-25 Lingfield 15:52 | Yes | Nymphaea (7/1) / Everest (16/1) **W** | Keeper Of Secrets (14/1) / Belle Of Kt (11/4) | Keeper Of Secrets (14/1) / Belle Of Kt (11/4) |
| 2026-03-25 Lingfield 16:22 | Yes | Saachi (5/4) / Foinix (33/1) | — / Paps Of Jura (14/1) | Warrior Lion (8/1) / Saachi (5/4) |
| 2026-03-25 Lingfield 16:52 | Yes | Profit Street (6/5) / Way To Dubai (9/2) | — / — | — / Style King (11/2) |
| 2026-03-25 Kempton 17:30 | Yes | Unknown Journey (10/1) / Homme De Fer (9/2) | — / — | — / Timely Affair (11/10) |
| 2026-03-25 Kempton 19:00 | Yes | Thestral (7/2) / Blues And Royals (3/1) **W** | — / — | — / Hamaleel (10/1) |
| 2026-03-26 Southwell 14:07 | Yes | Mad Dash (15/2) / Enter Sandman (2/1) | Enter Sandman (2/1) / Mad Dash (15/2) | Enter Sandman (2/1) / Life After Love (3/1) **W** |
| 2026-03-26 Southwell 16:07 | Yes | Quick Quasar (13/2) / Fickle Mcselfish (7/2) | Fickle Mcselfish (7/2) / Popty Ping (6/1) **W** | Popty Ping (6/1) **W** / — |
| 2026-03-26 Southwell 17:07 | Yes | Insuspense (11/4) / Winchurch (6/1) | — / Dragon God (25/1) | — / Good Earth (7/1) **W** |
| 2026-03-26 Chelmsford City 18:00 | Yes | Gold Star Hero (9/2) **W** / Tyger Bay (10/1) | — / Lazzar (9/1) | — / Lazzar (9/1) |
| 2026-03-26 Chelmsford City 18:30 | Yes | Faithful Dream (7/2) / Go Lockers Go (10/3) **W** | — / — | — / Hurricane Ann (11/1) |
| 2026-03-26 Chelmsford City 19:00 | Yes | Dynamite Defense (7/2) / El Ghaawy (20/1) | — / Fiddlers Green (4/1) | Fiddlers Green (4/1) / Dynamite Defense (7/2) |
| 2026-03-26 Chelmsford City 20:00 | Yes | Orbital Chime (10/1) / King David (11/2) | — / My Boy Harry (10/1) | — / My Boy Harry (10/1) |
| 2026-03-26 Chelmsford City 20:30 | Yes | Pantile's Gift (9/1) / Zipwire (5/1) | Zipwire (5/1) / Engross (6/5) **W** | Berkshire Schmokin (13/2) / — |
| 2026-03-27 Lingfield 14:12 | Yes | Latin (13/2) **W** / Volto Di Medusa (9/2) | — / Under The Sun (4/1) | — / Under The Sun (4/1) |
| 2026-03-27 Lingfield 15:42 | Yes | Okiru (4/1) / Pretty Danielle (8/1) | — / — | — / My Shagaf (9/1) |
| 2026-03-27 Lingfield 17:17 | Yes | The Corporate Guy (11/1) / Sneaky Blinder (14/1) | — / Forglen (11/4) | The Craftymaster (6/1) **W** / The Corporate Guy (11/1) |
| 2026-03-27 Newcastle 18:00 | Yes | Kitaab (50/1) / Water Of Leith (9/2) | Mayo County (14/1) / — | Mayo County (14/1) / Cayman Tai (7/1) |
| 2026-03-27 Dundalk 18:15 | Yes | Jasmine Affanalis (18/1) / Sakakawea (3/1) | Sakakawea (3/1) / Jazzy Dancer (6/1) | Sakakawea (3/1) / Jazzy Dancer (6/1) |
| 2026-03-27 Newcastle 18:30 | Yes | Sherlock (2/1) / Pianoforte (5/1) | Teardrops (5/1) / Sherlock (2/1) | Teardrops (5/1) / Velvet Skies (5/1) |
| 2026-03-27 Dundalk 18:45 | Yes | Black Soul (9/1) / Jazz Forever (12/1) | — / Numidia (11/2) | Numidia (11/2) / Black Soul (9/1) |
| 2026-03-27 Newcastle 19:30 | Yes | Maestro Bernstein (40/1) / Sir Paul Ramsey (9/1) | Sir Paul Ramsey (9/1) / Nyman (18/1) | Harry The Rogue (25/1) / Nyman (18/1) |
| 2026-03-27 Newcastle 20:00 | Yes | City Captain (8/1) / Philanthropist (2/1) | — / — | Philanthropist (2/1) / City Captain (8/1) |
| 2026-03-27 Dundalk 20:15 | Yes | Rising Sky (13/2) **W** / Captain Hanley (7/4) | — / — | Storm Eric (2/1) / Rising Sky (13/2) **W** |
| 2026-03-27 Newcastle 20:30 | Yes | Station X (3/1) / Master Of My Fate (11/1) | — / Havana Blast (10/1) | — / Havana Blast (10/1) |
| 2026-03-28 Southwell 17:00 | Yes | Westgate Warrior (5/1) / Woodhay Whisper (14/1) | Woodhay Whisper (14/1) / Westgate Warrior (5/1) | Woodhay Whisper (14/1) / Westgate Warrior (5/1) |
| 2026-03-28 Southwell 18:00 | Yes | Dagger Strike (9/2) / The Resdev Scholar (8/1) | — / — | — / Illy's Roo (12/1) |
| 2026-03-28 Southwell 19:30 | Yes | Moon Over The Sea (16/1) / Balqaa (15/2) | Balqaa (15/2) / Moon Over The Sea (16/1) | Balqaa (15/2) / Shabu Shabu (14/1) |
| 2026-03-28 Southwell 20:00 | Yes | Jack Andrea (10/3) **W** / Highfield Comrade (4/1) | — / — | Cezarro (7/2) / — |
| 2026-03-28 Southwell 20:30 | Yes | Drumcondra (11/1) / Danehill Star (17/2) | Danehill Star (17/2) / Drumcondra (11/1) | Danehill Star (17/2) / Drumcondra (11/1) |
| 2026-03-30 Kempton 15:40 | Yes | Amber Hamur (7/2) / Quick Quasar (10/3) **W** | — / — | — / Prancy Peer (5/1) |
| 2026-03-30 Kempton 16:10 | Yes | Kindly Queen (3/1) / Wedonttellthetruth (9/1) | — / — | — / Blackisthenewblack (11/2) |
| 2026-03-30 Wolverhampton 18:00 | Yes | Bergamo Gold (5/2) / Causing Problems (15/8) | — / — | — / Wind Summer (15/2) |
| 2026-03-30 Wolverhampton 19:30 | Yes | Sceptic (9/2) / First Encounter (13/2) | — / — | Mooretown Lad (6/1) / Sceptic (9/2) |
| 2026-03-31 Wolverhampton 17:30 | Yes | He's A Gentleman (8/1) / Giorgio M (15/2) | Farasi Lane (5/6) **W** / He's A Gentleman (8/1) | Farasi Lane (5/6) **W** / Al Muqdad (10/1) |
| 2026-03-31 Wolverhampton 18:00 | Yes | Phyllis Burton (28/1) / Danehill Star (6/5) **W** | Danehill Star (6/5) **W** / Phyllis Burton (28/1) | Danehill Star (6/5) **W** / Marinakis (12/1) |
| 2026-03-31 Wolverhampton 19:00 | Yes | Tuba (2/1) **W** / Knight Of Magic (15/2) | — / — | Havachoc (9/1) / Three Yorkshiremen (11/1) |
| 2026-03-31 Wolverhampton 19:30 | Yes | Maid In Devon (11/2) / Baileys Ontherocks (28/1) | — / A Lott Of Kane (5/4) **W** | — / Jane Of The Jungle (5/2) |
| 2026-04-01 Dundalk 17:15 | Yes | Lady Landhort (12/1) / One Cool Bear (10/3) | — / — | One Cool Bear (10/3) / Faustyna (5/1) |
| 2026-04-01 Dundalk 18:15 | Yes | Alex Belardo (4/1) / Star Mind (10/1) | — / — | — / Punk Poet (9/1) |
| 2026-04-01 Kempton 19:00 | Yes | Stock Market (14/1) / Arry Up (3/1) **W** | Lovethiswayagain (7/1) / Corniche Girl (5/1) | Lovethiswayagain (7/1) / Corniche Girl (5/1) |
| 2026-04-01 Kempton 19:30 | Yes | True Promise (3/1) / Em Four (7/2) | State Of Madness (7/2) / True Promise (3/1) | State Of Madness (7/2) / Ruby Red Gove (10/1) |
| 2026-04-02 Southwell 16:48 | Yes | Mr Lightside (8/1) / Cajetan (18/1) | — / Hundred Caps (7/4) | Hundred Caps (7/4) / Mr Lightside (8/1) |
| 2026-04-02 Southwell 17:18 | Yes | Tewkesbury (9/2) / Hardstyle (9/2) | — / — | Booziebrunch (9/2) / Tewkesbury (9/2) |
| 2026-04-02 Southwell 17:48 | Yes | Little Mi Mi (15/8) / Fortunate Star (4/1) | — / Auntie Jo (18/1) | — / Auntie Jo (18/1) |
| 2026-04-02 Southwell 18:18 | Yes | Polka Blue (7/2) / Espanita (10/11) | Espanita (10/11) / Polka Blue (7/2) | Espanita (10/11) / Polka Blue (7/2) |
| 2026-04-02 Southwell 18:48 | Yes | A Mere Bagatelle (9/1) / Captain Robert (7/4) | — / — | Bruce Banner (7/1) / — |
| 2026-04-03 Lingfield 13:05 | Yes | Selenic (6/1) / St Faz (7/1) | Shrimp Shady (11/4) / Selenic (6/1) | Shrimp Shady (11/4) / Dance Time (16/1) |
| 2026-04-03 Lingfield 14:15 | Yes | Unterberg (12/1) / Londoner (14/1) **W** | Towerlands (15/2) / Night Breeze (20/1) | Wyld Bill (5/1) / Towerlands (15/2) |
| 2026-04-03 Newcastle 14:35 | Yes | Marshman (9/2) / Berkshire Whisper (14/1) | — / — | — / Pocklington (9/2) |
| 2026-04-03 Lingfield 14:50 | Yes | Sir Paul Ramsey (22/1) / Invited (10/1) | Talis Evolvere (9/2) / The Dragon King (8/1) | Talis Evolvere (9/2) / Borgi (7/1) |
| 2026-04-03 Newcastle 15:10 | Yes | Gaucher (3/1) / Paradias (10/1) | — / Regal Ulixes (7/4) | Regal Ulixes (7/4) / Gaucher (3/1) |
| 2026-04-03 Lingfield 15:25 | Yes | Space Bear (5/1) / Numero Vingt (22/1) | Henrythenate (16/1) / Space Bear (5/1) | Henrythenate (16/1) / Space Bear (5/1) |
| 2026-04-03 Newcastle 15:42 | Yes | Duke Of Oxford (7/2) / Beylerbeyi (5/2) | — / — | — / Dramatic Star (11/4) |
| 2026-04-03 Lingfield 16:00 | Yes | Wonder (9/2) / Sea Founder (11/2) | — / Damascus Steel (9/1) | — / Damascus Steel (9/1) |
| 2026-04-04 Wolverhampton 16:50 | Yes | Orbital Chime (4/1) / Not So Sobers (9/1) | — / — | Not So Sobers (9/1) / Orbital Chime (4/1) |
| 2026-04-04 Wolverhampton 17:55 | Yes | Cayman Tai (7/4) / Kirkdale (9/4) **W** | Kirkdale (9/4) **W** / Cayman Tai (7/4) | Kirkdale (9/4) **W** / Cayman Tai (7/4) |
| 2026-04-04 Wolverhampton 18:30 | Yes | Codiak (15/8) / Pride Of Donegal (11/8) **W** | Pride Of Donegal (11/8) **W** / Codiak (15/8) | Pride Of Donegal (11/8) **W** / Codiak (15/8) |
| 2026-04-05 Southwell 16:20 | Yes | Jack Andrea (5/4) **W** / Sycamore Gap (13/2) | — / Silkies Sib (17/2) | Silkies Sib (17/2) / Jack Andrea (5/4) **W** |
| 2026-04-06 Wolverhampton 12:55 | Yes | River Wharfe (16/1) / Coloane (11/10) **W** | Coloane (11/10) **W** / The Ubermensch (7/2) | Coloane (11/10) **W** / Lessay (9/1) |
| 2026-04-06 Wolverhampton 14:05 | Yes | Magician of Riga (3/1) **W** / Kelly Burn (1/1) | Kelly Burn (1/1) / Magician of Riga (3/1) **W** | Kelly Burn (1/1) / Magician of Riga (3/1) **W** |
| 2026-04-06 Kempton 14:30 | Yes | Marnier (7/2) / Topteam (9/2) **W** | — / — | — / Midnight Rumble (15/2) |
| 2026-04-06 Wolverhampton 14:40 | Yes | One More (9/2) / Elements Of Fire (10/3) **W** | Kullazain (9/2) / One More (9/2) | Kullazain (9/2) / One More (9/2) |
| 2026-04-06 Wolverhampton 15:15 | Yes | The Craftymaster (5/2) / King's Cruiser (15/8) | King's Cruiser (15/8) / The Craftymaster (5/2) | King's Cruiser (15/8) / The Craftymaster (5/2) |
| 2026-04-06 Kempton 15:40 | Yes | Mr Baloo (5/1) / Champagne Powder (11/2) | Final Night (1/1) / — | Final Night (1/1) / — |
| 2026-04-06 Kempton 16:50 | Yes | Fair Dinkum (5/1) / Mio Amico (5/1) | — / Bashful Boy (10/3) | — / Bashful Boy (10/3) |
| 2026-04-06 Wolverhampton 16:55 | Yes | Beachborough Girl (4/1) / It's A Love Thing (18/1) | He's Our Cracker (3/1) / Beachborough Girl (4/1) | He's Our Cracker (3/1) / Three On Thursday (17/2) |
| 2026-04-07 Southwell 16:30 | Yes | Blue Lakota (7/2) / Brazilian Belle (11/4) | — / — | Brazilian Belle (11/4) / Castan (10/3) **W** |
| 2026-04-07 Southwell 17:00 | Yes | Sovereign View (9/2) / Island Bear (12/1) | — / Captain Fox (7/2) | — / Captain Fox (7/2) |
| 2026-04-07 Southwell 18:00 | Yes | Studious (11/2) **W** / Lexington Jet (8/1) | — / Moonjid (6/1) | Moonjid (6/1) / Tonal (4/1) |
| 2026-04-07 Southwell 19:30 | Yes | Camera Shy (4/1) / Reginald Charles (7/2) | Raft Up (17/2) / — | Raft Up (17/2) / — |
| 2026-04-08 Kempton 17:30 | Yes | Jersey Maverick (11/1) / State Of Madness (13/2) | — / Atmosphere (11/8) | Atmosphere (11/8) / Jersey Maverick (11/1) |
| 2026-04-08 Kempton 19:00 | Yes | Initial Blue (7/2) **W** / Twilight Madness (11/8) | Teardrops (15/2) / Initial Blue (7/2) **W** | Teardrops (15/2) / Hint Of The Jungle (10/1) |
| 2026-04-08 Kempton 19:30 | Yes | Mrembo (28/1) / Iwantmytimewithyou (11/2) | Iwantmytimewithyou (11/2) / Take The Boat (5/2) | Fiddlers Green (5/2) / — |
| 2026-04-09 Southwell 13:07 | Yes | Call Margot (13/2) **W** / Alfa Duplicate (5/1) | La Belle Forest (11/8) / — | La Belle Forest (11/8) / — |
| 2026-04-09 Southwell 16:25 | Yes | City Of Dreams (4/1) / Nicolai (5/1) | — / Electrocution (9/2) | — / Electrocution (9/2) |
| 2026-04-09 Wolverhampton 16:30 | Yes | Port Noir (3/1) **W** / Crafter (10/3) | — / Naughty Niall (9/4) | Naughty Niall (9/4) / Port Noir (3/1) **W** |
| 2026-04-09 Wolverhampton 19:00 | Yes | On The Inlet (2/9) **W** / Lifeguard (28/1) | — / Sup Of Red (10/1) | — / Sup Of Red (10/1) |
| 2026-04-10 Dundalk 16:42 | Yes | Hot To Foxtrot (4/1) / Oxford Circus (5/2) | Jered Maddox (11/4) **W** / — | Jered Maddox (11/4) **W** / — |
| 2026-04-10 Dundalk 17:50 | Yes | Methgal (7/2) / Macadam's Rock (10/1) | — / — | Will Be King (12/1) / Methgal (7/2) |
| 2026-04-10 Wolverhampton 18:00 | Yes | Divot (11/10) / Versatile (10/1) | — / Moon Over The Sea (9/1) | — / Moon Over The Sea (9/1) |
| 2026-04-10 Wolverhampton 18:30 | Yes | Tilani (11/2) / Dayman (11/1) | — / — | Present Times (9/2) / Tilani (11/2) |
| 2026-04-10 Dundalk 18:50 | Yes | Jawhary (4/1) / Sarmiento Power (7/1) | Sarmiento Power (7/1) / Doctor Grace (7/1) | Celtic Druid (5/1) **W** / — |
| 2026-04-11 Southwell 16:15 | Yes | Optician (18/1) / Sword Of Wessex (9/1) | — / Tortured Soul (9/2) | Tortured Soul (9/2) / Optician (18/1) |
| 2026-04-11 Southwell 17:45 | Yes | Aim For The Bull (11/1) / Gundogan (7/1) | — / Timely Affair (13/8) | Timely Affair (13/8) / Aim For The Bull (11/1) |
| 2026-04-11 Southwell 19:15 | Yes | Fircombe Hall (9/2) / Piperstown (4/1) **W** | — / — | Piperstown (4/1) **W** / Fircombe Hall (9/2) |
| 2026-04-13 Newcastle 16:30 | Yes | Sovereign Bright (11/2) / Meritocratic (11/4) | — / Pantile's Gift (11/8) **W** | — / Pantile's Gift (11/8) **W** |
| 2026-04-13 Newcastle 17:00 | Yes | Anorah Unleashed (18/1) / Taaklam (4/1) | — / — | Fille Unique (16/1) / Anorah Unleashed (18/1) |
| 2026-04-13 Newcastle 18:00 | Yes | Evening Saigon (6/4) **W** / Toyotomi (11/1) | Toyotomi (11/1) / Albasheer (9/1) | Toyotomi (11/1) / Paddy's Day (15/2) |
| 2026-04-13 Newcastle 19:00 | Yes | The Cookstown Cafu (3/1) **W** / Book Of Life (11/2) | Barleybrown (7/2) / — | Barleybrown (7/2) / — |
| 2026-04-13 Newcastle 19:30 | Yes | Dc Cogent (10/3) / Rock Of England (7/1) **W** | — / Darlo Pride (9/2) | — / Herakles (9/2) |
| 2026-04-14 Lingfield 16:00 | Yes | Okiru (7/1) / Victory Ace (8/1) **W** | — / Clipper (9/1) | — / Clipper (9/1) |
| 2026-04-14 Lingfield 18:00 | Yes | Bergamo Gold (9/2) / Grey Sands (5/4) | Grey Sands (5/4) / Bergamo Gold (9/2) | Grey Sands (5/4) / Bergamo Gold (9/2) |
| 2026-04-14 Lingfield 18:30 | Yes | Profit Street (5/2) / Zubaru (10/3) | — / Daisy Roots (13/2) | — / Daisy Roots (13/2) |
| 2026-04-15 Southwell 18:30 | Yes | Orbital Chime (10/3) / Rusheen Boy (4/1) | — / — | — / Dancing With Drums (11/2) |
| 2026-04-17 Wolverhampton 13:08 | Yes | Travel Agent (6/4) **W** / Style King (11/2) | — / — | — / Jojo Rabbit (9/1) |
| 2026-04-17 Wolverhampton 16:35 | Yes | Scenario (16/1) / Naughty Niall (5/2) | — / Bossy Parker (11/1) | Arlecchino's Rex (5/1) / Bossy Parker (11/1) |
| 2026-04-20 Lingfield 13:21 | Yes | No Knee Never (5/2) **W** / Alazwar (7/2) | — / Little She (14/1) | — / Little She (14/1) |
| 2026-04-20 Newcastle 17:00 | Yes | Mao Shang Wong (5/2) / Analogical (10/3) **W** | Analogical (10/3) **W** / Mao Shang Wong (5/2) | Analogical (10/3) **W** / Mao Shang Wong (5/2) |
| 2026-04-20 Newcastle 18:30 | Yes | Territorial Star (5/1) / Fille Unique (8/1) | — / Enter Sandman (9/2) **W** | — / Enter Sandman (9/2) **W** |
| 2026-04-20 Newcastle 19:00 | Yes | Criminal Shore (7/1) / Anthropologist (9/2) | The Green Man (16/1) / Criminal Shore (7/1) | The Green Man (16/1) / Phoenix Of Dreams (9/2) |
| 2026-04-20 Newcastle 19:30 | Yes | Cloch Nua (11/1) / Teggy Lasso (3/1) | Teggy Lasso (3/1) / Cloch Nua (11/1) | Teggy Lasso (3/1) / Trais Fluors (13/2) |
| 2026-04-21 Wolverhampton 16:30 | Yes | Corduroy (11/1) / Crown Inn To Win (6/5) | Crown Inn To Win (6/5) / Itsonlyrockandroll (10/3) | Itsonlyrockandroll (10/3) / — |
| 2026-04-21 Wolverhampton 17:00 | Yes | Binadham (5/2) / Midnight Call (13/2) | Em Four (9/4) **W** / — | Em Four (9/4) **W** / — |
| 2026-04-21 Wolverhampton 18:30 | Yes | Faster Bee (5/2) **W** / Star Of Atlantis (11/1) | — / — | — / Bungle Bay (7/1) |
| 2026-04-21 Wolverhampton 19:30 | Yes | Kaaranah (11/10) **W** / Distinction (6/1) | — / Karakula (15/2) | Karakula (15/2) / Kaaranah (11/10) **W** |
| 2026-04-23 Dundalk 17:45 | Yes | Rampage (3/1) / Famous Enough (9/1) | — / — | Master Garvey (4/1) / Rampage (3/1) |
| 2026-04-23 Southwell 18:00 | Yes | Lexington Express (9/2) **W** / Raspoutine (4/7) | Raspoutine (4/7) / Lexington Express (9/2) **W** | Raspoutine (4/7) / Lexington Express (9/2) **W** |
| 2026-04-23 Southwell 19:00 | Yes | Enpassant (9/4) / Mwafaq (11/4) | — / — | — / Bomb Squad (3/1) **W** |
| 2026-04-23 Dundalk 19:15 | Yes | Copper Craft (13/8) / Fine Print (40/1) | — / Electric Beauty (13/2) | — / Ferrari Desert (20/1) |
| 2026-04-25 Southwell 17:00 | Yes | Rose Warrior (11/1) / Sovereign Applause (11/2) | Sovereign Applause (11/2) / Rose Warrior (11/1) | Sovereign Applause (11/2) / Rose Warrior (11/1) |
| 2026-04-25 Southwell 18:00 | Yes | Winston's Warrior (4/1) **W** / Down To The Kid (10/3) | — / — | — / Farasi Lane (9/2) |
| 2026-04-25 Southwell 19:30 | Yes | Marry The Night (3/1) / Iconic Times (17/2) | Iconic Times (17/2) / Marry The Night (3/1) | Iconic Times (17/2) / Superfortress (11/4) |
| 2026-04-27 Lingfield 15:45 | Yes | Storm Point (2/1) / If I Could Dream (33/1) | — / Caviar Cowboy (2/1) **W** | — / Caviar Cowboy (2/1) **W** |
| 2026-04-27 Lingfield 16:20 | Yes | Adjuvant (10/1) / Rogue Impact (28/1) | Wonder (9/4) / Son Of Man (2/1) | Way Of Life (5/1) **W** / Wonder (9/4) |
| 2026-04-27 Wolverhampton 16:30 | Yes | No Knee Never (9/4) **W** / Volendam (6/1) | — / — | — / Sassy Glory (14/1) |
| 2026-04-27 Wolverhampton 17:30 | Yes | Lordsbridge Blu (5/2) / Echalar (12/1) | Echalar (12/1) / Jez Bomb (11/2) | Echalar (12/1) / Jez Bomb (11/2) |
| 2026-04-27 Wolverhampton 18:30 | Yes | Frankali (4/1) / Starakova (14/1) **W** | — / Giles Glory (9/2) | Giles Glory (9/2) / Shes Got The Blues (9/2) |
| 2026-04-27 Wolverhampton 19:00 | Yes | Head Girl (9/2) / Montu (5/1) | Forever Perfect (6/1) / Bradbury (10/3) | Forever Perfect (6/1) / Bradbury (10/3) |
| 2026-04-27 Wolverhampton 19:30 | Yes | Forever Noah (9/2) / Master Dandy (22/1) | — / — | Master Dandy (22/1) / Forever Noah (9/2) |
| 2026-04-28 Southwell 13:20 | Yes | Fistral Beach (13/2) / Reenie's Dream (13/2) | — / — | — / King Sharja (11/1) |
| 2026-04-28 Southwell 13:55 | Yes | Nad Alshiba Snow (11/2) / Arlington (4/1) | — / Beneficiary (17/2) | Beneficiary (17/2) / Nad Alshiba Snow (11/2) |
| 2026-04-28 Southwell 15:05 | Yes | Jack Andrea (15/8) / Artavian (22/1) | — / Shaffron (18/1) | Arth's Gold (11/2) **W** / Lednikov (12/1) |
| 2026-04-28 Southwell 15:35 | Yes | Payment Plan (12/1) / Colinski (11/1) | Colinski (11/1) / Crystal Guard (28/1) | Charlie Darling (6/1) **W** / — |
| 2026-04-28 Lingfield 15:43 | Yes | Mick's Spirit (11/1) / Ancient State (8/15) | Ancient State (8/15) / Spendmore Lane (15/2) **W** | Spendmore Lane (15/2) **W** / — |
| 2026-04-28 Southwell 16:42 | Yes | Dapper Gee Gee (9/2) / Receipt (6/1) **W** | — / — | — / Phoenix Of Dreams (10/3) |
| 2026-04-28 Lingfield 17:20 | Yes | Enter Sandman (2/1) **W** / Mortubo (16/1) | — / Luna Beaux (15/8) | Luna Beaux (15/8) / Enter Sandman (2/1) **W** |
| 2026-04-28 Lingfield 18:20 | Yes | Joseph (10/3) **W** / Onslow Gardens (22/1) | Onslow Gardens (22/1) / Joseph (10/3) **W** | Etretat (11/1) / — |
| 2026-04-28 Lingfield 18:50 | Yes | Wild Thoughts (2/9) **W** / Katalyst (10/1) | — / — | — / Timely Salute (10/1) |
| 2026-04-29 Southwell 14:30 | Yes | Gemical (20/1) / Magician of Riga (9/4) **W** | Extraterrestrial (13/2) / Gemical (20/1) | Extraterrestrial (13/2) / Gemical (20/1) |
| 2026-04-29 Southwell 15:05 | Yes | Welljudged (15/2) / Wondrous Light (2/1) | — / — | — / Donna Nook (9/2) |
| 2026-04-29 Southwell 17:15 | Yes | Tabby (10/3) **W** / Belsito (12/1) | — / — | — / Glamour Show (7/1) |
| 2026-04-30 Lingfield 15:05 | Yes | Tuscan Point (4/6) **W** / Wedgewood (5/1) | Wedgewood (5/1) / Tuscan Point (4/6) **W** | Wedgewood (5/1) / Tuscan Point (4/6) **W** |
| 2026-04-30 Lingfield 15:35 | Yes | Flightofthephoenix (17/2) / Lady Mcc (80/1) | Mythical Bird (10/3) **W** / Flightofthephoenix (17/2) | Mythical Bird (10/3) **W** / Flightofthephoenix (17/2) |
| 2026-04-30 Southwell 16:17 | Yes | Nymphaea (9/2) / Angelardo (9/1) | — / — | Bronte Beach (5/1) **W** / Nymphaea (9/2) |
| 2026-04-30 Lingfield 16:40 | Yes | Spirit Lead Me (28/1) / Virtue Patience (7/1) | Virtue Patience (7/1) / Havana Touch (4/1) | Bella Bisbee (10/3) / — |
| 2026-04-30 Kempton 16:45 | Yes | Wild Thoughts (2/7) **W** / Kingofthecarnival (10/1) | — / Sup Of Red (18/1) | Sup Of Red (18/1) / — |
| 2026-04-30 Southwell 16:52 | Yes | It's A Love Thing (14/1) / Roman Secret (9/1) | Roman Secret (9/1) / The Bay Warrior (11/4) | Roman Secret (9/1) / The Bay Warrior (11/4) |
| 2026-04-30 Lingfield 17:10 | Yes | Upepo (4/1) / Divot (4/1) | — / Skimming Along (10/1) | — / Skimming Along (10/1) |
| 2026-04-30 Kempton 18:15 | Yes | Sea Founder (7/4) **W** / Berry Clever (16/5) | — / Jazzy Baby (9/2) | — / Jazzy Baby (9/2) |
| 2026-04-30 Southwell 18:30 | Yes | Station X (11/8) **W** / Alondra (17/2) | — / — | Alondra (17/2) / Beaujolais Nouveau (22/1) |
| 2026-04-30 Kempton 18:45 | Yes | Leonie (5/2) **W** / Tenzi (7/1) | — / Space Bear (6/4) | Space Bear (6/4) / Leonie (5/2) **W** |
| 2026-04-30 Kempton 19:15 | Yes | Saxophonic (4/1) / Blackisthenewblack (5/1) **W** | — / — | Rajbello (11/1) / Saxophonic (4/1) |
| 2026-05-01 Newcastle 16:20 | Yes | Haveyoumissedme (8/1) / Sea The Light (11/1) | Sound Janet (33/1) / Free Speech (40/1) | King Of Fury (14/1) / Mao Shang Wong (9/1) |
| 2026-05-01 Newcastle 19:10 | Yes | Caragio (6/4) / Goal Line (40/1) | — / Raft Up (11/4) **W** | Raft Up (11/4) **W** / Caragio (6/4) |
| 2026-05-06 Kempton 17:30 | Yes | Blues And Royals (11/8) **W** / Melody De Vega (15/2) | Melody De Vega (15/2) / Blues And Royals (11/8) **W** | Melody De Vega (15/2) / Victory Ace (7/1) |
| 2026-05-06 Kempton 19:00 | Yes | Prosperitas (11/2) / Silca Bay (14/1) | — / — | — / Receipt (15/2) |
| 2026-05-06 Kempton 19:30 | Yes | Divine Wish (17/2) / Yehudi (15/8) **W** | Bint Havana Gold (5/1) / — | Bint Havana Gold (5/1) / — |
| 2026-05-07 Southwell 17:30 | Yes | Holly Mist (15/2) / Lordsbridge Grey (7/2) | Bellasio (10/1) / Roaring Ralph (11/2) | Roaring Ralph (11/2) / Bellasio (10/1) |
| 2026-05-07 Southwell 18:00 | Yes | Fanjove (9/2) / Cosmic Man (13/2) | — / — | — / Real Jack (15/2) |
| 2026-05-08 Wolverhampton 17:00 | Yes | Rubellite (2/1) **W** / Havachoc (11/10) | — / — | Havachoc (11/10) / Rubellite (2/1) **W** |
| 2026-05-08 Wolverhampton 18:00 | Yes | Itsonlyrockandroll (4/1) / Caraway (6/5) | Caraway (6/5) / Itsonlyrockandroll (4/1) | Caraway (6/5) / Forever Perfect (11/4) |
| 2026-05-08 Wolverhampton 19:30 | Yes | Faster Bee (8/1) / Homme De Fer (9/2) | — / — | — / Ravenglass (25/1) |
| 2026-05-11 Wolverhampton 18:30 | Yes | Wave Rock (2/1) **W** / Arlecchino's Rex (6/1) | Arlecchino's Rex (6/1) / Crafter (14/1) | Brinton (8/1) / — |
| 2026-05-11 Wolverhampton 19:30 | Yes | Captain Pickles (9/2) / Street Dancer (5/4) **W** | Street Dancer (5/4) **W** / Captain Pickles (9/2) | Street Dancer (5/4) **W** / Captain Pickles (9/2) |
| 2026-05-12 Lingfield 16:15 | Yes | Polling Day (18/1) / An Bradan Feasa (11/2) | Arc Zoosve (1/2) **W** / — | Arc Zoosve (1/2) **W** / — |
| 2026-05-12 Lingfield 17:50 | Yes | Thestral (10/3) / Lovethiswayagain (6/1) | Slack Bob (11/4) **W** / Thestral (10/3) | Slack Bob (11/4) **W** / — |
| 2026-05-12 Lingfield 18:20 | Yes | Zatsgood (10/11) **W** / Frostmagic (17/2) | — / Studious (10/1) | Studious (10/1) / Zatsgood (10/11) **W** |
| 2026-05-12 Lingfield 18:50 | Yes | The Third Star (11/5) / Barefoot Beach (9/2) | Barefoot Beach (9/2) / Bela Sonata (18/1) | Barefoot Beach (9/2) / Queue Dos (10/1) |
| 2026-05-18 Wolverhampton 19:30 | Yes | Court Of Stars (6/4) / Seeing Stars (3/1) | — / — | — / Okiru (14/1) |
| 2026-05-18 Wolverhampton 20:00 | Yes | Free Speech (12/1) / Kelly Burn (7/4) **W** | Desert Belle (6/4) / — | You Got To My Soul (6/1) / Desert Belle (6/4) |
| 2026-05-19 Newcastle 15:35 | Yes | Golden Havana (7/1) / Houndhill (3/1) **W** | Brave Traveller (8/1) / Golden Havana (7/1) | Brave Traveller (8/1) / Oasis Cover (4/1) |
| 2026-05-19 Newcastle 16:05 | Yes | Annie Edson Taylor (13/2) / Hen Party (11/4) | — / Tashi Delek (9/1) | — / Tashi Delek (9/1) |
| 2026-05-19 Newcastle 16:35 | Yes | Criminal Shore (17/2) / King's School (5/1) **W** | — / — | Red Mirage (14/1) / Yaajooz (11/1) |
| 2026-05-20 Kempton 18:00 | Yes | Quick Turn (17/2) / Karakula Dancer (9/2) | Karakula Dancer (9/2) / Quick Turn (17/2) | Kingofthecarnival (20/1) / — |
| 2026-05-20 Kempton 18:30 | Yes | Influential (4/1) **W** / Man Of Desert (4/1) | — / — | Lady Manzor (7/2) / Sant Alessio (18/1) |
| 2026-05-20 Kempton 19:00 | Yes | Sea Suite (9/2) / I'm Workin On It (3/1) | — / — | I'm Workin On It (3/1) / Sea Suite (9/2) |
| 2026-05-21 Southwell 16:57 | Yes | Fantasy Obsessor (7/2) / Peregrine Falcon (22/1) | Westgate Warrior (10/3) / Fantasy Obsessor (7/2) | Westgate Warrior (10/3) / J Street (11/2) |
| 2026-05-21 Southwell 19:30 | Yes | Sanditon (14/1) / South Kensington (8/11) **W** | South Kensington (8/11) **W** / Sanditon (14/1) | South Kensington (8/11) **W** / Sanditon (14/1) |
| 2026-05-21 Southwell 20:00 | Yes | Daytona Lady (10/3) / Iconic Times (9/1) | — / — | — / Bomb Squad (7/2) |
| 2026-05-26 Dundalk 17:48 | Yes | Sporting Hero (7/1) / Arctic Steps (6/1) | — / — | — / Collective Power (13/2) |
| 2026-05-26 Dundalk 18:48 | Yes | Grey Fable (22/1) **W** / Church Mountain (16/1) | Copper Craft (6/5) / — | Skib Gold (17/2) / Copper Craft (6/5) |
| 2026-05-27 Kempton 19:00 | Yes | Caviar Cowboy (4/1) / Ya Karim (5/2) | King's Trust (13/2) / Caviar Cowboy (4/1) | King's Trust (13/2) / Caviar Cowboy (4/1) |
| 2026-05-29 Wolverhampton 18:50 | Yes | Enamorus (3/1) / Inferno (22/1) | — / Court Of Stars (4/1) | Court Of Stars (4/1) / Enamorus (3/1) |
| 2026-05-29 Wolverhampton 19:25 | Yes | Ancient State (15/8) / Spendmore Lane (15/2) | True Promise (7/4) **W** / Ancient State (15/8) | True Promise (7/4) **W** / Ancient State (15/8) |
| 2026-06-01 Lingfield 13:07 | Yes | Virtue Patience (11/4) / Searchingtheblues (8/1) | Searchingtheblues (8/1) / Virtue Patience (11/4) | Searchingtheblues (8/1) / Virtue Patience (11/4) |
| 2026-06-01 Lingfield 13:42 | Yes | Southbank (1/1) / Jackson Street (13/2) | — / Walking On Clouds (9/2) **W** | — / Walking On Clouds (9/2) **W** |
| 2026-06-01 Wolverhampton 17:00 | Yes | Rosemary's Rose (13/2) / Fistral Beach (6/1) | South Kensington (3/1) / Lessay (7/1) | South Kensington (3/1) / Lessay (7/1) |
| 2026-06-01 Wolverhampton 17:30 | Yes | Silky Lass (7/1) / Romantic Spirit (4/1) | Romantic Spirit (4/1) / Wave Rock (6/4) | Romantic Spirit (4/1) / Imola (8/1) **W** |
| 2026-06-01 Wolverhampton 18:00 | Yes | Asian Journey (9/4) **W** / Hachiman (12/1) | — / Terries Royale (11/1) | — / Age Of Time (8/1) |
| 2026-06-01 Wolverhampton 19:30 | Yes | A Lott Of Kane (16/5) / She Went Whoosh (20/1) | — / Nad Alshiba Snow (7/1) | — / Colors Of Freedom (6/1) |
| 2026-06-02 Newcastle 17:15 | Yes | Lawmans Blis (10/3) / Heartened (5/1) | Yakhabar (14/1) / — | Yakhabar (14/1) / Millbuie (16/1) |
| 2026-06-02 Wolverhampton 19:00 | Yes | Zoulette (4/5) / City Of Dreams (10/1) | City Of Dreams (10/1) / South Coast Star (9/2) **W** | South Coast Star (9/2) **W** / — |
| 2026-06-02 Wolverhampton 19:30 | Yes | Musical Soldier (5/6) / Based (3/1) **W** | — / — | Based (3/1) **W** / Musical Soldier (5/6) |
| 2026-06-02 Newcastle 19:45 | Yes | Wicklow Way (13/2) / Penny Mountain (12/1) | Barleybrown (10/3) / Cable Beach (17/2) | Barleybrown (10/3) / Trais Fluors (13/2) |
| 2026-06-04 Lingfield 16:10 | Yes | Fort Augustus (25/1) / Yehudi (10/3) | — / — | Yehudi (10/3) / Fort Augustus (25/1) |
| 2026-06-04 Lingfield 16:40 | Yes | Peregrine Falcon (7/2) / Style King (11/4) | — / Shalaa Asker (5/1) **W** | — / Shalaa Asker (5/1) **W** |
| 2026-06-04 Lingfield 17:40 | Yes | Central Command (6/1) **W** / Kaori (3/1) | Kaori (3/1) / Lexington Express (10/1) | Booziebrunch (10/3) / — |
| 2026-06-04 Lingfield 18:10 | Yes | Polka Blue (1/1) **W** / Diamondinthedark (16/1) | — / Startled Lady (9/1) | Startled Lady (9/1) / Hamaleel (16/1) |
| 2026-06-10 Kempton 16:08 | Yes | Tarbat Ness (5/2) / Saratoga Gold (5/1) | — / Karthon (9/2) | Rogue Empire (5/1) **W** / Tarbat Ness (5/2) |
| 2026-06-10 Kempton 17:40 | Yes | Criminal (5/1) / Billy Mill (3/1) | — / — | — / Bold Suitor (11/1) |
| 2026-06-10 Kempton 19:40 | Yes | St Just In Time (25/1) / Karakula (11/2) | Semele (28/1) / — | Sonnerie Power (9/2) / Semele (28/1) |
| 2026-06-16 Wolverhampton 16:15 | Yes | Pentonville (5/2) **W** / Sandret (40/1) | — / — | Sandret (40/1) / Pentonville (5/2) **W** |
| 2026-06-16 Wolverhampton 18:45 | Yes | Sorted (13/2) / Arlecchino's Rex (4/1) | Arlecchino's Rex (4/1) / First Encounter (12/1) | Arlecchino's Rex (4/1) / Smoker Bellamy (9/1) |
| 2026-06-16 Wolverhampton 19:54 | Yes | Asian Journey (9/2) / Saliko (12/1) | — / Study Up (7/1) | Study Up (7/1) / Asian Journey (9/2) |
| 2026-06-18 Southwell 17:30 | Yes | La Belle Forest (11/1) / Life After Love (4/1) | — / Fantasy Obsessor (16/5) | Fantasy Obsessor (16/5) / J Street (10/3) **W** |
| 2026-06-18 Southwell 20:00 | Yes | Gaurdman (4/1) / Ghisa (11/1) | — / Enricher (17/2) | — / Enricher (17/2) |
| 2026-06-25 Newcastle 13:02 | Yes | Wise Crack (5/1) / Based (4/1) | — / — | Henriette Ronner (50/1) / Wise Crack (5/1) |
| 2026-06-25 Newcastle 16:32 | Yes | The Tunguska Event (11/2) / Koffee And Kale (15/2) | — / — | Brave Traveller (7/1) / The Tunguska Event (11/2) |
| 2026-06-25 Newcastle 17:07 | Yes | Woodleigh (7/1) / Oselton (16/1) | — / — | Cable Beach (11/2) / Woodleigh (7/1) |
| 2026-06-26 Newcastle 17:18 | Yes | Sailthisshipalone (22/1) / They All Know Me (9/1) | — / — | — / Asian Journey (8/1) |
| 2026-06-27 Newcastle 14:15 | Yes | Spirit Mixer (18/1) / Blazeon Five (22/1) | Blazeon Five (22/1) / Spirit Mixer (18/1) | Kirchner (17/2) / — |
| 2026-06-27 Newcastle 14:45 | Yes | Power Fizz (11/4) / Topwarrior (40/1) | — / Tuco Salamanca (13/2) **W** | Pocklington (6/1) / Power Fizz (11/4) |
| 2026-06-28 Wolverhampton 13:37 | Yes | The Stone Power (9/2) / Aerial Silk (14/1) | Magician of Riga (9/1) / The Stone Power (9/2) | Faeberon (3/1) **W** / Magician of Riga (9/1) |
| 2026-06-28 Wolverhampton 14:47 | Yes | The Craftymaster (3/1) **W** / The Bay Warrior (2/1) | — / — | — / Four Fifty (9/2) |
| 2026-06-28 Wolverhampton 15:23 | Yes | Alafdhal (18/1) / Sunlit Sea (8/1) | — / Trust Sergei (9/2) **W** | — / King David (9/2) |
| 2026-06-28 Wolverhampton 16:03 | Yes | Level Up (6/4) / Style King (10/3) | — / — | Shalaa Asker (2/1) / Level Up (6/4) |
| 2026-06-29 Kempton 17:45 | Yes | Ironist (3/1) / Hamaleel (6/1) | Trio (4/1) / Ironist (3/1) | Daisy Roots (10/1) / Trio (4/1) |
| 2026-07-02 Kempton 17:33 | Yes | Zabeel Alkabeir (11/2) / Blue Prince (4/1) | — / — | — / Maximising (4/1) |
| 2026-07-02 Kempton 19:17 | Yes | The Lost Sock (7/2) / Night Shining (4/1) | — / — | Night Shining (4/1) / The Lost Sock (7/2) |
| 2026-07-05 Southwell 14:05 | Yes | King Of Fury (3/1) **W** / Portman Blue (11/1) | Pickersgill (9/2) / King Of Fury (3/1) **W** | Pickersgill (9/2) / Tough Enough (12/1) |
| 2026-07-05 Southwell 14:40 | Yes | Hamda's Joy (3/1) / Cixi (2/1) | — / — | Cixi (2/1) / Hamda's Joy (3/1) |
| 2026-07-05 Southwell 16:25 | Yes | Club Class (7/4) / Northwest Passage (13/2) | — / — | Jupiter Ammon (10/3) / — |
| 2026-07-06 Lingfield 15:50 | Yes | Dyrholaey (5/1) / Ziggy's Missile (10/1) | — / Solar Edge (9/2) | Solar Edge (9/2) / Dyrholaey (5/1) |
| 2026-07-06 Wolverhampton 17:30 | Yes | South Shore (13/8) **W** / She's A Gift (12/1) | She's A Gift (12/1) / South Shore (13/8) **W** | Winemaker (2/1) / — |
| 2026-07-06 Wolverhampton 18:30 | Yes | Moostar (3/1) / Maharajas Express (17/2) | — / Havana Sky (8/1) | Daytona Lady (10/3) / Moostar (3/1) |
| 2026-07-06 Wolverhampton 19:00 | Yes | Safe Harbor (11/4) / If I Could Dream (33/1) | — / — | Karakula Dancer (9/2) / Safe Harbor (11/4) |
| 2026-07-07 Wolverhampton 16:40 | Yes | Havin A Flyer (11/8) / Wondrous (40/1) | — / Baileys Ontherocks (11/1) | — / Baileys Ontherocks (11/1) |
| 2026-07-07 Wolverhampton 17:10 | Yes | Reds And Wolves (11/8) **W** / Pursuit Of Truth (33/1) | — / Eagle Day (7/1) | Eagle Day (7/1) / Reds And Wolves (11/8) **W** |
| 2026-07-07 Wolverhampton 17:40 | Yes | First Encounter (3/1) / Blue Jammin (22/1) | — / Stacey Racey (15/2) | Stacey Racey (15/2) / First Encounter (3/1) |
| 2026-07-07 Wolverhampton 18:10 | Yes | Knightmare (1/1) / Nutcracker (13/8) **W** | Nutcracker (13/8) **W** / Knightmare (1/1) | Nutcracker (13/8) **W** / Knightmare (1/1) |
| 2026-07-07 Wolverhampton 19:10 | Yes | On Key (11/10) / Amaysmont (5/2) | — / — | Amaysmont (5/2) / On Key (11/10) |
| 2026-07-07 Wolverhampton 19:40 | Yes | The Craftymaster (11/4) / Havachoc (7/4) | Havachoc (7/4) / The Craftymaster (11/4) | Havachoc (7/4) / The Craftymaster (11/4) |
| 2026-07-08 Kempton 18:13 | Yes | Baileys Khelstar (3/1) **W** / Dust Cover (13/2) | — / Nunc Est Bibendum (11/4) | — / Nunc Est Bibendum (11/4) |
| 2026-07-08 Kempton 18:48 | Yes | Thestral (28/1) / Music Academy (14/1) | — / — | — / Roccobear (33/1) |
| 2026-07-08 Kempton 19:20 | Yes | Thapa VC (7/2) / Volto Di Medusa (7/2) | — / — | — / Gladiadora (11/4) |
| 2026-07-12 Dundalk 13:35 | Yes | Kc Bear (4/1) / Sagasti (9/1) | Sagasti (9/1) / Iff In Doubt (2/1) | Iff In Doubt (2/1) / — |
| 2026-07-12 Dundalk 15:20 | Yes | Sonny Corleone (13/2) / Tero D'rosa (9/2) | Tero D'rosa (9/2) / Baila Conmigo (8/1) **W** | Tero D'rosa (9/2) / Baila Conmigo (8/1) **W** |
| 2026-07-13 Lingfield 18:10 | Yes | Zooella (3/1) **W** / Pilgrim's Progress (10/1) | — / — | — / Sydney Rock (8/1) |
| 2026-07-13 Lingfield 18:40 | Yes | Nutcracker (2/1) / Love You More (10/3) **W** | — / — | Love You More (10/3) **W** / Nutcracker (2/1) |
| 2026-07-13 Lingfield 19:40 | Yes | Alex The Great (50/1) / Sapphire Dream (11/4) **W** | — / Douglas Dc (16/1) | — / Douglas Dc (16/1) |
| 2026-07-14 Wolverhampton 18:55 | Yes | Luan (13/8) **W** / Nala The Lioness (17/2) | — / — | — / Roman Secret (6/1) |
| 2026-07-17 Wolverhampton 14:53 | Yes | Moostar (6/1) / So Sassy (6/1) **W** | — / — | So Sassy (6/1) **W** / Moostar (6/1) |
| 2026-07-21 Wolverhampton 17:00 | Yes | Into Combat (2/1) / Shopaholic (9/1) | — / One Million Dreams (18/1) | — / One Million Dreams (18/1) |
| 2026-07-21 Wolverhampton 18:30 | Yes | Grand Vista (3/1) / Torbados (5/2) | — / Athenian Spirit (12/1) | — / Hakin Adraar (11/2) |
| 2026-07-21 Wolverhampton 19:30 | Yes | Blue Celestial (6/4) / Positive Thoughts (4/1) | Positive Thoughts (4/1) / Blue Celestial (6/4) | Positive Thoughts (4/1) / Blue Celestial (6/4) |
| 2026-07-23 Southwell 15:53 | Yes | Anthropologist (5/1) / Avatar Jet (4/1) | — / — | Timely Affair (9/2) **W** / Dannick (3/1) |
| 2026-07-25 Newcastle 12:35 | Yes | Sweet Kiss (10/1) / Naturalia (14/1) | — / — | — / Rubellite (16/1) |
| 2026-07-25 Newcastle 15:35 | Yes | Book Of Life (15/2) / Little Ted (4/1) | Little Ted (4/1) / Adelaide Bay (6/4) | Suzette (14/1) / — |
| 2026-07-25 Newcastle 16:45 | Yes | Langton Wold (9/1) / Filey Beach (4/1) | Filey Beach (4/1) / Timebar (10/1) | Sassy Glory (10/3) / Angel Of England (6/1) |
| 2026-07-27 Southwell 14:30 | Yes | James Choice (7/1) / Prince Of Calypso (12/1) | Prince Of Calypso (12/1) / Fans Favourite (9/1) | Ziggy's Avenger (5/1) / — |
| 2026-07-27 Southwell 15:00 | Yes | Venetian Lion (10/3) / Cobalt Comet (17/2) | Cobalt Comet (17/2) / Hatamoto (9/1) | Sagremor (20/1) / — |
| 2026-07-27 Southwell 17:05 | Yes | Modern Times (2/1) **W** / Bright (6/1) | — / — | — / Belsito (12/1) |
| 2026-07-30 Wolverhampton 16:10 | Yes | Portman Blue (10/3) / Between Me And U (5/1) **W** | — / — | Between Me And U (5/1) **W** / Pearly Squirrel (7/2) |
| 2026-07-30 Wolverhampton 17:57 | Yes | Manly Fireball (7/2) / Jungle Drums (9/4) | Jungle Drums (9/4) / Trust Sergei (66/1) | Jungle Drums (9/4) / Trust Sergei (66/1) |
| 2026-07-30 Wolverhampton 18:32 | Yes | Worlington (15/2) / Evening Fades (18/1) | Evening Fades (18/1) / La Kosmos (40/1) | La Kosmos (40/1) / Goldfinder (10/1) |
| 2026-07-31 Newcastle 13:10 | Yes | Rogers Dream (7/2) / Wicklow Way (6/4) **W** | — / — | Wicklow Way (6/4) **W** / Rogers Dream (7/2) |
| 2026-07-31 Newcastle 14:55 | Yes | Brave Traveller (6/1) / Taaklam (4/1) | Taaklam (4/1) / Brave Traveller (6/1) | Taaklam (4/1) / Brave Traveller (6/1) |
| 2026-07-31 Wolverhampton 15:20 | Yes | Roc De Fer (1/4) **W** / Fans Favourite (12/1) | — / Jodhpur Blue (28/1) | — / Jodhpur Blue (28/1) |
| 2026-07-31 Newcastle 15:30 | Yes | Reginald Charles (6/4) / Judicature (9/2) | — / — | — / Jamaican Storm (9/2) **W** |
| 2026-07-31 Wolverhampton 15:55 | Yes | Papa Cocktail (13/2) / King Of Chaos (8/1) | King Of Chaos (8/1) / Papa Cocktail (13/2) | King Of Chaos (8/1) / Papa Cocktail (13/2) |
| 2026-08-04 Lingfield 17:48 | Yes | Style King (15/8) / Just Jump (3/1) | — / Federal Envoy (5/1) | Federal Envoy (5/1) / Style King (15/8) |
| 2026-08-06 Southwell 16:04 | Yes | Hear The Drums (11/4) **W** / Distillation (11/4) | Distillation (11/4) / Hear The Drums (11/4) **W** | Distillation (11/4) / Hear The Drums (11/4) **W** |
| 2026-08-06 Southwell 18:51 | Yes | Baba Reza (11/2) / Dorney Lake (9/2) **W** | — / — | Camera Shy (10/1) / Fierce (15/2) |
| 2026-08-06 Southwell 19:26 | Yes | Spinning Wheel (7/2) **W** / El Burhan (9/1) | — / Port Of London (3/1) | Port Of London (3/1) / Spinning Wheel (7/2) **W** |
| 2026-08-06 Southwell 20:00 | Yes | Norflondonforever (25/1) / Dingwall (4/1) | — / — | — / Golspie (4/1) |
| 2026-08-08 Lingfield 16:40 | Yes | Si White (2/1) / Fabled Spirit (15/2) | Fabled Spirit (15/2) / Man Of The Sea (50/1) | Fabled Spirit (15/2) / Man Of The Sea (50/1) |
| 2026-08-08 Lingfield 17:40 | Yes | Halimede (8/15) **W** / Shopaholic (15/2) | — / — | — / Artavian (16/1) |
| 2026-08-10 Kempton 15:30 | Yes | Shirakawa (9/2) / Ghost Story (4/1) | Ghost Story (4/1) / Shirakawa (9/2) | Ghost Story (4/1) / Flightofthephoenix (10/3) **W** |
| 2026-08-11 Lingfield 13:30 | Yes | Little Tiger (12/1) / Shifra (4/1) | — / Warrnambool (6/1) | — / Warrnambool (6/1) |
| 2026-08-11 Lingfield 16:00 | Yes | Material Girl (11/1) / Aplaceinthesun (20/1) | Aplaceinthesun (20/1) / Jackson Street (4/1) | Aplaceinthesun (20/1) / Jackson Street (4/1) |
| 2026-08-12 Kempton 18:00 | Yes | Bridget's View (25/1) / Chalk Mountain (4/1) | Racingbreaks Ryder (16/1) **W** / Bridget's View (25/1) | Racingbreaks Ryder (16/1) **W** / Bridget's View (25/1) |
| 2026-08-12 Kempton 19:30 | Yes | Kokbastau (11/10) **W** / The Green Mile (13/2) | — / Classical Allusion (11/2) | — / Forever Penywern (11/2) |
| 2026-08-13 Lingfield 17:58 | Yes | Ridger (22/1) / Zaltalla (13/8) | Zaltalla (13/8) / Pure Passion (13/2) | Zaltalla (13/8) / Pure Passion (13/2) |
| 2026-08-15 Dundalk 15:00 | Yes | Queen Leila (28/1) / Reponse Finale (6/4) **W** | Bullet Bourbon (8/1) / — | Bullet Bourbon (8/1) / — |
| 2026-08-15 Dundalk 15:35 | Yes | Crypto Force (28/1) / Iron Fist (7/1) | Iron Fist (7/1) / Genoah (20/1) | Tribal Star (7/1) / — |
| 2026-08-15 Dundalk 16:10 | Yes | Retro Gal (12/1) / Rising Sky (7/1) | — / — | Navajo Point (6/1) / Retro Gal (12/1) |
| 2026-08-16 Southwell 12:30 | Yes | Mehmas Champion (66/1) / Astrological (11/8) | Wonder (13/2) / — | Wonder (13/2) / — |
| 2026-08-16 Southwell 13:00 | Yes | Heretic (6/1) **W** / Tardaff (10/1) | — / — | Ribston Pippin (4/1) / Heretic (6/1) **W** |
| 2026-08-17 Lingfield 15:30 | Yes | Star Marian (9/1) / Pure Passion (1/2) **W** | Pure Passion (1/2) **W** / Star Marian (9/1) | Pure Passion (1/2) **W** / Star Marian (9/1) |
| 2026-08-17 Lingfield 16:00 | Yes | Boston Run (5/2) / Bergamo Gold (4/1) | — / Hove Ranger (3/1) **W** | — / Hove Ranger (3/1) **W** |
| 2026-08-17 Wolverhampton 17:10 | Yes | Nascent Star (4/1) / Green Titan (11/2) | Green Titan (11/2) / Wondervision (4/1) **W** | Green Titan (11/2) / Wondervision (4/1) **W** |
| 2026-08-18 Lingfield 15:45 | Yes | Zaltalla (4/1) / Edergole's Gift (3/1) | Edergole's Gift (3/1) / Zaltalla (4/1) | Edergole's Gift (3/1) / Mademoiselle Belle (20/1) |
| 2026-08-18 Lingfield 16:52 | Yes | Happier (3/1) / Balon D'or (7/2) **W** | Balon D'or (7/2) **W** / Happier (3/1) | Balon D'or (7/2) **W** / Dashing Donkey (5/2) |
| 2026-08-19 Kempton 20:00 | Yes | Viviana (10/1) / Slack Bob (4/1) | — / — | Obsidian Verse (4/1) / Viviana (10/1) |
| 2026-08-20 Lingfield 14:20 | Yes | Ocean Force (15/8) / Whitesnake (12/1) **W** | — / Manton Road (6/1) | Warrnambool (22/1) / Ocean Force (15/8) |
| 2026-08-20 Lingfield 15:30 | Yes | Royal County Glory (9/4) / Fuseboard (11/2) **W** | Fuseboard (11/2) **W** / Royal County Glory (9/4) | Pennine Way (4/1) / — |
| 2026-08-20 Newcastle 17:19 | Yes | Fleur De Mer (3/1) / Niffler (13/8) **W** | — / Billy Bathgate (7/1) | Billy Bathgate (7/1) / Fleur De Mer (3/1) |
| 2026-08-20 Newcastle 19:54 | Yes | Get Up Everybody (9/2) **W** / Operation Gimcrack (11/2) | — / — | — / White Umbrella (12/1) |
| 2026-08-25 Lingfield 15:00 | Yes | Musical Soldier (9/4) **W** / Strong Voice (11/4) | — / Quick Quasar (11/2) | — / Bird Of War (9/4) |
| 2026-08-25 Lingfield 16:02 | Yes | Time To Sparkle (9/4) **W** / Sovereign Bright (9/2) | — / — | — / Thunder Goddess (7/2) |
| 2026-08-26 Wolverhampton 15:00 | Yes | D Day Major Winter (12/1) / Lawmans Blis (14/1) **W** | — / Spaceage Love Song (11/2) | — / Spaceage Love Song (11/2) |
| 2026-08-26 Kempton 19:21 | Yes | Wezzeer (11/4) / Caviar Cowboy (6/1) | Caviar Cowboy (6/1) / Wezzeer (11/4) | Caviar Cowboy (6/1) / Aigeas (9/1) |
| 2026-08-26 Kempton 19:51 | Yes | Evening Fades (13/2) / Amrum (7/1) | — / — | Lord Mayor (11/2) / — |
| 2026-08-27 Lingfield 13:22 | Yes | Kiss Cam (25/1) / Whiskey Galore (12/1) | Whiskey Galore (12/1) / Kiss Cam (25/1) | Whiskey Galore (12/1) / Bollengo Boy (18/1) |
| 2026-08-27 Lingfield 15:55 | Yes | King Cherry (4/1) / Credit Forgedd It (17/2) | Royal County Glory (4/7) **W** / Melodical (15/2) | Royal County Glory (4/7) **W** / Ruiz (40/1) |
| 2026-08-27 Southwell 17:30 | Yes | Give Me The Night (3/1) / Fulford Cross (6/1) | — / — | — / Respectable Jack (14/1) |
| 2026-08-27 Southwell 18:00 | Yes | Mr Noble (7/4) **W** / Haaderr (7/2) | Haaderr (7/2) / Mr Noble (7/4) **W** | Haaderr (7/2) / Mr Noble (7/4) **W** |
| 2026-08-31 Southwell 14:17 | Yes | Aim For The Bull (22/1) / Just Typical (7/2) | — / — | Portman Blue (11/1) / — |
| 2026-08-31 Southwell 16:00 | Yes | Thunderous Love (8/1) / Dicko The Legend (11/4) | Dicko The Legend (11/4) / Thunderous Love (8/1) | Dicko The Legend (11/4) / Thunderous Love (8/1) |
| 2026-08-31 Southwell 16:35 | Yes | Taaklam (10/3) **W** / Masai Angel (14/1) | Surgeon Commander (4/1) / — | Surgeon Commander (4/1) / — |
| 2026-09-01 Wolverhampton 17:55 | Yes | Melting Snow (8/1) **W** / Khepri (10/1) | — / Perfect Ruler (4/1) | Perfect Ruler (4/1) / Melting Snow (8/1) **W** |
| 2026-09-02 Newcastle 15:45 | Yes | Let's Go Hugo (3/1) / Pivotal Terms (9/2) | — / Lady Bouquet (12/1) | — / Lady Bouquet (12/1) |
| 2026-09-02 Newcastle 16:45 | Yes | Barleybrown (2/1) / Itszaboy (10/1) | — / — | Lady Delila (12/1) / Barleybrown (2/1) |
| 2026-09-02 Kempton 19:30 | Yes | Joseph (5/1) **W** / Pershalla (13/2) | Madjid (4/9) / — | Madjid (4/9) / — |
| 2026-09-03 Newcastle 13:17 | Yes | Finlaggan (7/1) / Mao Shang Wong (11/1) | — / — | Mwafaq (10/3) / Finlaggan (7/1) |
| 2026-09-03 Newcastle 15:35 | Yes | Willowinghurn (6/1) / Victory Sound (2/1) **W** | — / Turbo Command (8/1) | Turbo Command (8/1) / Willowinghurn (6/1) |
| 2026-09-03 Lingfield 17:00 | Yes | Hamaleel (7/1) / Angels' Share (11/8) **W** | — / — | Angels' Share (11/8) **W** / Hamaleel (7/1) |
| 2026-09-03 Southwell 19:10 | Yes | Kirkdale (9/2) / Modern Times (3/1) | — / — | — / Flowstate (40/1) |
| 2026-09-04 Kempton 17:54 | Yes | Go Rimbaud (2/1) / Fallacious Promise (5/1) | — / Wuood (7/1) | — / Wuood (7/1) |
| 2026-09-04 Kempton 18:24 | Yes | Metaverse (33/1) / Yankee Dude (15/2) | Shiplake (6/4) **W** / Gilet (6/1) | Gilet (6/1) / Shiplake (6/4) **W** |
| 2026-09-04 Kempton 18:54 | Yes | Mission Command (9/2) / Newsreader (11/4) | — / — | — / Irish Nectar (3/1) |
| 2026-09-04 Kempton 19:24 | Yes | Must Believe (7/2) / Division Day (10/1) | Educator (7/2) / — | Educator (7/2) / — |
| 2026-09-05 Kempton 13:20 | Yes | Cavolo Nero (6/1) / Nikovo (5/1) | Nikovo (5/1) / Warrior Mode (3/1) | Nikovo (5/1) / Warrior Mode (3/1) |
| 2026-09-05 Newcastle 18:00 | Yes | Riley Rocks (7/2) / Storm Esme (9/1) **W** | — / — | — / Sea Her Excel (18/1) |
| 2026-09-07 Wolverhampton 18:00 | Yes | Yazoo (3/1) **W** / Rajendra (13/2) | — / Miss Mambo (5/2) | Miss Mambo (5/2) / Crown The Future (10/1) |
| 2026-09-09 Kempton 16:00 | Yes | Viking Glory (15/2) / Diane Chasseresse (20/1) | — / — | Mmmbop (11/4) / Viking Glory (15/2) |
| 2026-09-09 Kempton 17:00 | Yes | Happy Banner (6/1) / Royale Goodnight (18/1) | Asteverdi (7/1) / Happy Banner (6/1) | Asteverdi (7/1) / Happy Banner (6/1) |
| 2026-09-09 Kempton 19:00 | Yes | Minerality (16/1) / Battle Hymn (16/1) | — / Birthday Angel (9/2) | Tinsel (10/3) / Uzincso (10/3) |
| 2026-09-10 Lingfield 17:05 | Yes | Pure Passion (11/1) / Little Jaybee (11/2) | — / — | My Mate Kev (7/2) / — |
| 2026-09-10 Lingfield 18:05 | Yes | Meritocratic (16/1) / Thisonesforyou (5/4) **W** | Thisonesforyou (5/4) **W** / Meritocratic (16/1) | Thisonesforyou (5/4) **W** / Meritocratic (16/1) |
| 2026-09-12 Lingfield 13:13 | Yes | James Choice (15/8) **W** / Pace Attack (15/8) | — / — | Pace Attack (15/8) / James Choice (15/8) **W** |
| 2026-09-12 Lingfield 17:17 | Yes | Exhibitioning (11/1) / Iconic Dawn (9/2) **W** | — / Walking On Clouds (4/1) | — / Walking On Clouds (4/1) |
| 2026-09-14 Kempton 15:30 | Yes | Ivat Ghia (9/2) / Wellwhatshappenin (3/1) | — / Calaxy (25/1) | — / Calaxy (25/1) |
| 2026-09-15 Wolverhampton 14:28 | Yes | Trust Sergei (10/3) **W** / Apex Star (9/4) | Apex Star (9/4) / King Cherry (5/1) | Apex Star (9/4) / King Cherry (5/1) |
| 2026-09-15 Wolverhampton 17:00 | Yes | R P Mcmurphy (3/1) **W** / Cloch Nua (40/1) | — / Captive Beauty (7/2) | — / Captive Beauty (7/2) |
| 2026-09-17 Southwell 14:20 | Yes | Pageant Girl (50/1) / Wopbopaloomop (4/1) | Sovereign Beach (14/1) / Stoney Wood (7/2) | Secret Rival (12/1) / Sovereign Beach (14/1) |
| 2026-09-17 Southwell 14:50 | Yes | Preferred (25/1) / Sprinting Speed (25/1) | Von Krolock (8/1) / Staniel Cay (17/2) | Von Krolock (8/1) / Woolridge (11/1) |
| 2026-09-17 Southwell 17:30 | Yes | Dream Illusion (4/1) / No Knee Never (13/2) | Sailor's Return (4/1) / Dream Illusion (4/1) | Sailor's Return (4/1) / Dream Illusion (4/1) |
| 2026-09-17 Southwell 18:00 | Yes | Beach Partee (17/2) / Havin A Flyer (11/2) | Havin A Flyer (11/2) / Beach Partee (17/2) | Mimime (4/1) / — |
| 2026-09-18 Wolverhampton 15:10 | Yes | Rovinia (9/4) / Based (7/1) | — / King Sharja (13/8) **W** | King Sharja (13/8) **W** / Rovinia (9/4) |
| 2026-09-18 Dundalk 16:30 | Yes | Kc Bear (8/1) / Una Matata (5/1) | — / — | — / The Bear Trap (8/1) |
| 2026-09-18 Wolverhampton 16:45 | Yes | Luan (7/2) **W** / Tenadaay (11/4) | — / — | — / Belle Amie (6/4) |
| 2026-09-18 Wolverhampton 17:45 | Yes | Shopaholic (7/2) **W** / Niffler (2/5) | Niffler (2/5) / Shopaholic (7/2) **W** | Niffler (2/5) / Hellion (66/1) |
| 2026-09-19 Newcastle 14:10 | Yes | New Objective (13/2) **W** / Skirt Around (40/1) | Gemini Man (9/2) / Pride Eye (11/2) | Whiskey Pete (17/2) / Gemini Man (9/2) |
| 2026-09-19 Newcastle 14:45 | Yes | Fairydale (10/1) / Ten Sixty Six (6/1) | — / — | — / Raise The Stakes (4/1) |
| 2026-09-21 Wolverhampton 14:00 | Yes | Volto Di Medusa (6/1) / The Anthony Gover (9/4) **W** | The Anthony Gover (9/4) **W** / John Harrison (3/1) | The Anthony Gover (9/4) **W** / Look Back Smiling (6/1) |
| 2026-09-21 Wolverhampton 16:12 | Yes | Cuban Fiesta (7/2) / Joud (13/2) | — / Faster Bee (5/1) | — / Faster Bee (5/1) |
| 2026-09-21 Wolverhampton 17:42 | Yes | Grey Sands (16/1) / Highland Harvey (3/1) | Satyress (11/10) **W** / Grey Sands (16/1) | Satyress (11/10) **W** / Grey Sands (16/1) |

</details>
