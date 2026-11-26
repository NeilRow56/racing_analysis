# Tissue ranking and profitability review

**Phase 1 · 26 November 2026**

**Use Tissue 2 as the provisional primary profitability reference for research and future shadow comparisons.** On identical settled races, T2 beat T1 by **£120.60 on 496 captured-price pairs** and **£136.41 on 551 final-SP pairs** per £1 staked on each rank. T2 still lost money on both headline bases. AW and Hurdle supplied almost all of the lead, while Chase was effectively tied at SP. Future observations are needed before any live selection change.

## 1. Frozen population and price audit

| Family | Books | Settled | All void | Pending | Runners | Complete markets (settled) | Runners missing quote | Books with result match | Settled starters with SP / starters | NR runners / races | Void runners / races | Dead heats | Ranks |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| All | 635 | 592 | 1 | 42 | 6440 | 575 (535) | 437 | 592 | 5649 / 5649 | 363 / 225 | 7 / 1 | 1 | 26 |
| AW | 222 | 212 | 0 | 10 | 2522 | 209 (200) | 107 | 212 | 2289 / 2289 | 115 / 77 | 0 / 0 | 0 | 26 |
| HURDLE | 255 | 234 | 1 | 20 | 2614 | 226 (205) | 216 | 234 | 2237 / 2237 | 167 / 98 | 7 / 1 | 0 | 25 |
| CHASE | 150 | 138 | 0 | 12 | 1182 | 133 (123) | 113 | 138 | 1003 / 1003 | 79 / 48 | 0 / 0 | 1 | 21 |
| TURF | 8 | 8 | 0 | 0 | 122 | 7 (7) | 1 | 8 | 120 / 120 | 2 / 2 | 0 / 0 | 0 | 23 |


The generation opened at **07:26:36 UTC on 5 November 2026**. The snapshot contains 635 distinct race IDs across 22 dates through 26 November, with 592 settled races through 25 November, one fully void Hurdle and 42 pending. A settled race has a recorded outcome for every captured runner and at least one winner. The void race was at Huntingdon on 10 November, with seven void runner records and one NR. One Chase had a dead heat. Ranks T1 and T2 are present in every book. T3, T4 and T5 are absent in 1, 11 and 43 books respectively. Higher ranks are stored up to the family maxima shown above, with thinner and changing field-size coverage.

Each book passes the repository's frozen-model, schema, quote-median and cutoff checks. Capture preceded the scheduled off by 8.9 to 995.3 minutes. That verifies pre-scheduled-off book timestamps and frozen quote provenance. Individual quote timestamps and proof of execution are unavailable. Captured odds are the stored Sporting Life median bookmaker quote. A complete book requires a usable quote for every captured runner. There were 60 incomplete books. Of the 55 settled T1/T2 pairs excluded from captured P/L, both horses had individual quotes in 20. All 55 remain missing on that basis.

Final SP comes from archived Sporting Life full results with a final race status. Each of the 592 settled books joined uniquely by date, full starter-name set and all recorded finishing positions, with the archived course verified separately. All 5,649 settled starters had a valid fractional SP or evens. The SP basis excludes the 42 pending books and the void race. SP is a distinct result-time comparison. The report uses the frozen ledger's winners and dead-heat divisors and reproduces its captured returns, including older unversioned settlements. The canonical-only captured pair check gives T1 −£98.66 and T2 +£10.26 on 338 pairs.

A win returns decimal odds divided by the dead-heat divisor, less £1, and a loss costs £1. NR and void carry no settled stake. Captured returns are nominal at the archived quote, without bookmaker-specific Rule 4 deductions or execution adjustments. Seven matched archive results list deductions. Winners and strike count winning selections. A/E divides fractional actual wins by the sum of the frozen model probabilities on the same bets, without renormalizing for withdrawals. ROI divides P/L by settled stakes. [Frozen ledger](../data/research/tissue-generation-forward-2026-11.json) · [Generation rules](../src/lib/racing/tissue-generation-forward.ts) · [SP import definition](../scraper/sporting_life/importing.py)

## 2. Tissue 1 versus Tissue 2

Both ranks must have settled as starters. Each price basis then requires both prices on that race. On the common 496 races with both price bases, the T2 lead was £120.60 captured and £147.33 at SP.

| Family | Basis | Rank | Eligible pairs | Bets | W | Strike | Model E | A/E | Avg winning decimal | £ P/L | ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| All | Captured | 1 | 551 | 496 | 108 | 21.8% | 115.52 | 0.93 | 3.39 | -131.67 | -26.5% |
| All | Captured | 2 | 551 | 496 | 107 | 21.6% | 81.85 | 1.31 | 4.53 | -11.07 | -2.2% |
| All | Final SP | 1 | 551 | 551 | 124 | 22.5% | 129.48 | 0.95 | 3.22 | -154.20 | -28.0% |
| All | Final SP | 2 | 551 | 551 | 116 | 21.1% | 90.98 | 1.28 | 4.60 | -17.79 | -3.2% |
| AW | Captured | 1 | 205 | 193 | 34 | 17.6% | 40.77 | 0.83 | 3.81 | -63.49 | -32.9% |
| AW | Captured | 2 | 205 | 193 | 39 | 20.2% | 28.79 | 1.35 | 4.75 | -7.92 | -4.1% |
| AW | Final SP | 1 | 205 | 205 | 37 | 18.0% | 43.65 | 0.85 | 3.46 | -76.81 | -37.5% |
| AW | Final SP | 2 | 205 | 205 | 40 | 19.5% | 30.54 | 1.31 | 5.08 | -1.63 | -0.8% |
| HURDLE | Captured | 1 | 218 | 190 | 44 | 23.2% | 46.33 | 0.95 | 3.02 | -57.20 | -30.1% |
| HURDLE | Captured | 2 | 218 | 190 | 44 | 23.2% | 31.77 | 1.38 | 4.35 | 1.33 | 0.7% |
| HURDLE | Final SP | 1 | 218 | 218 | 52 | 23.9% | 54.28 | 0.96 | 2.88 | -68.18 | -31.3% |
| HURDLE | Final SP | 2 | 218 | 218 | 50 | 22.9% | 36.64 | 1.36 | 4.19 | -8.40 | -3.9% |
| CHASE | Captured | 1 | 120 | 106 | 30 | 28.3% | 27.43 | 1.08 | 3.47 | -3.98 | -3.8% |
| CHASE | Captured | 2 | 120 | 106 | 23 | 21.7% | 20.46 | 1.12 | 4.59 | -0.36 | -0.3% |
| CHASE | Final SP | 1 | 120 | 120 | 34 | 28.3% | 30.22 | 1.11 | 3.51 | -2.54 | -2.1% |
| CHASE | Final SP | 2 | 120 | 120 | 25 | 20.8% | 22.80 | 1.10 | 4.71 | -2.38 | -2.0% |
| TURF | Captured | 1 | 8 | 7 | 0 | 0.0% | 0.99 | 0.00 | — | -7.00 | -100.0% |
| TURF | Captured | 2 | 8 | 7 | 1 | 14.3% | 0.83 | 1.20 | 2.88 | -4.12 | -58.9% |
| TURF | Final SP | 1 | 8 | 8 | 1 | 12.5% | 1.34 | 0.75 | 1.33 | -6.67 | -83.3% |
| TURF | Final SP | 2 | 8 | 8 | 1 | 12.5% | 0.99 | 1.01 | 2.63 | -5.38 | -67.2% |


- **AW** contributed +£55.57 captured and +£75.18 at SP. T2 won more often and at longer average winning odds. The captured gap stayed positive in both chronological blocks and in withdrawal-free fields.
- **Hurdle** contributed +£58.53 captured and +£59.78 at SP. T2 won at longer average odds, with equal captured wins and fewer SP wins. In fields without any captured NR or void, T2 trailed by £18.03 captured and £25.86 at SP. The withdrawal split is descriptive and cannot isolate the effect of deductions or field composition.
- **Chase** contributed +£3.62 captured and +£0.17 at SP. Omitting the Jet Of Dreams race, where T2 won at 13.00 on both bases, reverses both gaps. The direction also shifts across periods and price bases.
- **Turf** has eight settled races from one date, of which seven have a complete capture. Evidence is sparse.

The 95% date-cluster bootstrap interval for the paired T2 ROI advantage is **−3.1 to +49.9 percentage points captured** and **−1.8 to +48.8 points at SP**. Both include reversal. The captured lead survives removing the races of the two largest T2 winning returns, Rose Warrior and Westin Pimpernel, at **+£84.60**. At SP, removing the two largest T2 winning-return races leaves **+£98.41**. These are supplementary sensitivity checks. Every winner remains in the headline figures.

## 3. Existing ranks 1 through 5

The strict rank comparison uses the same 458 settled races with all five ranks present and all five selections settled as starters. All 458 have SPs, and 418 have complete captured markets. The appendix also shows all eligible observations for each individual rank, since conditioning on all five starters changes the sample.

| Family | Rank | Eligible | Capture bets | W | £ P/L | ROI | Avg W odds | SP bets | W | £ P/L | ROI | Avg W odds | Capture winners by odds <5 / 5–<11 / 11+ | Capture 11+ group £ | Top two gross % |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| All | 1 | 458 | 418 | 83 | -115.59 | -27.7% | 3.67 | 458 | 94 | -134.20 | -29.3% | 3.47 | 68 / 13 / 2 | -28.00 | 8.3% |
| All | 2 | 458 | 418 | 92 | 13.04 | 3.1% | 4.69 | 458 | 97 | 3.12 | 0.7% | 4.75 | 60 / 27 / 5 | -17.00 | 7.0% |
| All | 3 | 458 | 418 | 49 | -153.53 | -36.7% | 5.40 | 458 | 56 | -161.65 | -35.3% | 5.29 | 28 / 20 / 1 | -83.00 | 16.6% |
| All | 4 | 458 | 418 | 46 | -112.33 | -26.9% | 6.70 | 458 | 52 | -84.74 | -18.5% | 7.23 | 19 / 25 / 2 | -114.00 | 20.3% |
| All | 5 | 458 | 418 | 31 | -78.51 | -18.8% | 10.95 | 458 | 33 | -82.51 | -18.0% | 11.38 | 12 / 11 / 8 | -1.00 | 37.4% |
| AW | 1 | 189 | 179 | 32 | -53.56 | -29.9% | 3.92 | 189 | 35 | -64.77 | -34.3% | 3.55 | 25 / 7 / 0 | -28.00 | 14.3% |
| AW | 2 | 189 | 179 | 39 | 6.08 | 3.4% | 4.75 | 189 | 39 | 13.04 | 6.9% | 5.18 | 23 / 14 / 2 | -18.00 | 12.4% |
| AW | 3 | 189 | 179 | 19 | -56.00 | -31.3% | 6.47 | 189 | 20 | -63.46 | -33.6% | 6.28 | 11 / 7 / 1 | -21.00 | 35.8% |
| AW | 4 | 189 | 179 | 17 | -31.25 | -17.5% | 8.69 | 189 | 19 | -26.04 | -13.8% | 8.58 | 8 / 7 / 2 | -8.00 | 42.0% |
| AW | 5 | 189 | 179 | 14 | -61.59 | -34.4% | 8.39 | 189 | 15 | -67.59 | -35.8% | 8.09 | 3 / 7 / 4 | -32.00 | 27.3% |
| HURDLE | 1 | 174 | 154 | 33 | -45.16 | -29.3% | 3.30 | 174 | 38 | -50.87 | -29.2% | 3.24 | 27 / 5 / 1 | -3.00 | 20.2% |
| HURDLE | 2 | 174 | 154 | 36 | 0.83 | 0.5% | 4.30 | 174 | 41 | -1.67 | -1.0% | 4.20 | 27 / 7 / 2 | -2.00 | 18.1% |
| HURDLE | 3 | 174 | 154 | 15 | -82.59 | -53.6% | 4.76 | 174 | 18 | -85.58 | -49.2% | 4.91 | 8 / 7 / 0 | -44.00 | 26.6% |
| HURDLE | 4 | 174 | 154 | 16 | -69.16 | -44.9% | 5.30 | 174 | 20 | -49.28 | -28.3% | 6.24 | 7 / 9 / 0 | -75.00 | 23.6% |
| HURDLE | 5 | 174 | 154 | 15 | 59.08 | 38.4% | 14.21 | 174 | 15 | 63.58 | 36.5% | 15.84 | 7 / 4 / 4 | 66.00 | 59.6% |
| CHASE | 1 | 87 | 78 | 18 | -9.87 | -12.7% | 3.90 | 87 | 20 | -11.89 | -13.7% | 3.86 | 16 / 1 / 1 | 7.00 | 28.6% |
| CHASE | 2 | 87 | 78 | 16 | 10.25 | 13.1% | 5.52 | 87 | 16 | -2.88 | -3.3% | 5.26 | 9 / 6 / 1 | 4.00 | 26.1% |
| CHASE | 3 | 87 | 78 | 15 | -7.94 | -10.2% | 4.67 | 87 | 18 | -4.61 | -5.3% | 4.58 | 9 / 6 / 0 | -15.00 | 22.8% |
| CHASE | 4 | 87 | 78 | 13 | -4.92 | -6.3% | 5.83 | 87 | 13 | -1.42 | -1.6% | 6.79 | 4 / 9 / 0 | -28.00 | 21.9% |
| CHASE | 5 | 87 | 78 | 2 | -69.00 | -88.5% | 4.50 | 87 | 3 | -70.50 | -81.0% | 5.50 | 2 / 0 / 0 | -31.00 | 100.0% |
| TURF | 1 | 8 | 7 | 0 | -7.00 | -100.0% | — | 8 | 1 | -6.67 | -83.3% | 1.33 | 0 / 0 / 0 | -4.00 | — |
| TURF | 2 | 8 | 7 | 1 | -4.12 | -58.9% | 2.88 | 8 | 1 | -5.38 | -67.2% | 2.63 | 1 / 0 / 0 | -1.00 | 100.0% |
| TURF | 3 | 8 | 7 | 0 | -7.00 | -100.0% | — | 8 | 0 | -8.00 | -100.0% | — | 0 / 0 / 0 | -3.00 | — |
| TURF | 4 | 8 | 7 | 0 | -7.00 | -100.0% | — | 8 | 0 | -8.00 | -100.0% | — | 0 / 0 / 0 | -3.00 | — |
| TURF | 5 | 8 | 7 | 0 | -7.00 | -100.0% | — | 8 | 0 | -8.00 | -100.0% | — | 0 / 0 / 0 | -4.00 | — |

**T2 leads overall on both bases**, including in the wider rank-specific results. In the strict comparison, Hurdle T5 leads Hurdle T2 on both bases and Chase T4 narrowly leads Chase T2 at SP by £1.46. In the wider samples, Chase T3 leads Chase T2 at SP by £1.30 despite three more bets, while Chase T2 leads at captured prices. The Chase rank ordering is sensitive to coverage and offers little evidence for switching the benchmark.

Hurdle T5's **£59.08 captured and £63.58 SP** on the strict sample include Unknown Stranger at **101.00 captured and 81.00 SP**. Omitting that race leaves **−£40.92 captured and −£16.42 SP**. Bethpage Theatre paid 26.00 captured and 41.00 SP, while Fire Flyer paid 17.00 captured and 41.00 SP. The two biggest captured wins supplied 59.6% of Hurdle T5 gross return. Hurdle T5 was profitable in the wider rank-specific sample as well, with the same largest winner decisive. The appendix includes all captured wins at 11.00 or greater in the matched rank comparison, both-basis price-band P/L and losing stakes.

## 4. Model rank, market price and realised return

| Family | N | T1/T2 p | Median logit gap | OR gap (n) | Latest speed gap (n) | Best L3 speed gap (n) | Base / context logit gap | Market rank T1/T2 | Quote odds T1/T2 | T1/T2 model×odds | T1/T2 W credits vs market E |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| All | 496 | 0.23 / 0.17 | 0.23 | 1.28 (357) | 0.18 (400) | 0.30 (353) | 0.30 / 0.02 | 2.58 / 3.41 | 5.66 / 8.36 | 1.15 / 1.29 | 107.5 vs 113.2 / 107.0 vs 83.0 |
| AW | 193 | 0.21 / 0.15 | 0.24 | 1.12 (145) | -1.06 (120) | -1.77 (85) | 0.28 / 0.05 | 2.98 / 3.80 | 6.90 / 8.46 | 1.32 / 1.18 | 34.0 vs 39.2 / 39.0 vs 27.6 |
| HURDLE | 190 | 0.24 / 0.17 | 0.24 | 1.11 (109) | 1.25 (167) | 3.10 (157) | 0.34 / 0.01 | 2.29 / 3.17 | 4.88 / 9.39 | 1.04 / 1.53 | 44.0 vs 47.6 / 44.0 vs 33.8 |
| CHASE | 106 | 0.26 / 0.19 | 0.19 | 1.89 (96) | -0.00 (106) | -2.02 (104) | 0.28 / 0.00 | 2.23 / 3.05 | 4.50 / 6.29 | 1.02 / 1.05 | 29.5 vs 25.7 / 23.0 vs 20.9 |
| TURF | 7 | 0.14 / 0.12 | 0.19 | -1.00 (7) | -1.53 (7) | -2.77 (7) | 0.30 / -0.12 | 5.14 / 4.57 | 9.86 / 9.41 | 1.29 / 1.01 | 0.0 vs 0.7 / 1.0 vs 0.8 |


The feature table uses the 496 captured-price pairs. Gaps are T1 minus T2, with pairwise exclusion where either frozen input has its missing flag set. The flat models store the recent and best-last-three speed inputs under `latest_turf_speed` and `best_l3_turf_speed`. The jump models use their corresponding jump inputs. Class, handicap and distance use the stored pre-off inputs. Market rank 1 is shortest odds, with tied prices sharing rank. Model × odds is the model-implied gross return per £1 and market E sums proportional, margin-normalized implied probabilities.

Overall, the captured prices ranked T1 shorter, and T1 converted 107.5 winner credits against 113.2 market-expected. T2 converted 107 against 83.0. That supports relative overvaluation of T1 versus T2 in this sample. AW illustrates the distinction between model and market calibration. Frozen model × odds gave T1 a higher average gross expectation than T2, yet the return ran the other way. Hurdle shows a stronger T2 model-implied price advantage. Chase shows both ranks beating normalized-market winner expectations and nearly identical nominal P/L at SP.

T1's OR advantage was small among pairs with observed OR. Best-last-three speed favoured T2 in AW and Chase and T1 in Hurdle. Most of the average model logit gap was already in the base score. In handicaps T2 led by £79.15 across 299 captured pairs and in non-handicaps by £42.15 across 181. Sixteen pairs have unavailable handicap classification. Classes 1–3 and 4–6 and all three fixed distance bands favoured T2 in aggregate, while Chase non-handicaps and Chase classes 1–3 favoured T1. These tabulations support a relative pricing and calibration diagnosis, with insufficient evidence for a universal scoring flaw or a specific speed or OR coefficient correction.

## 5. Three consistent adjustments

The frozen model standardizes its archived inputs, adds base and context logits, and applies a race softmax. Recalculation reproduced every stored probability within 2.8 × 10⁻¹⁷. The candidates use fixed structural rules and the archived pre-off inputs. [Frozen scoring implementation](../src/lib/racing/tissue-generation-model.ts)

- **Base only** removes the entire fitted context contribution. It reranks the whole field by the stored model's base logit.
- **Top-two value** selects whichever of frozen T1 and T2 has the higher model probability × captured decimal odds. A tie keeps T1. It promotes T2 without abstaining on a complete market.
- **Positive T1** keeps T1 only when its probability × captured decimal odds exceeds the mathematical break-even of 1. It abstains without promoting another horse.

The two price rules require a complete frozen quote book. Their common comparison universe with T1–T3 and base-only contains 574 captured races, of which 534 settled, 39 were pending and one was entirely void. One settled complete-market Chase lacks T3. The score-only rule was also evaluated against T1–T3 on the 591 settled races with all comparators, including incomplete markets, using SP. The tables keep selection intent on the original field and show post-capture NR/void as refunds with zero P/L. Per-race P/L uses every eligible settled race including abstentions and refunds.

| Family/period | Basis | Policy | Races | Promotions | Abstain | Refund | Bets | W | £ P/L | ROI / bet | P/L per race |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| All | capPL | T1 | 534 | 0 | 0 | 17 | 517 | 112 | -129.30 | -25.0% | -24.2% |
| All | capPL | T2 | 534 | 534 | 0 | 23 | 511 | 112 | -2.87 | -0.6% | -0.5% |
| All | capPL | T3 | 534 | 534 | 0 | 19 | 515 | 69 | -128.13 | -24.9% | -24.0% |
| All | capPL | Base only | 534 | 65 | 0 | 15 | 519 | 126 | -85.82 | -16.5% | -16.1% |
| All | capPL | Top-two value | 534 | 258 | 0 | 24 | 510 | 70 | -109.94 | -21.6% | -20.6% |
| All | capPL | Positive T1 | 534 | 0 | 303 | 7 | 224 | 25 | -74.76 | -33.4% | -14.0% |
| All | spPL | T1 | 534 | 0 | 0 | 17 | 517 | 112 | -139.86 | -27.1% | -26.2% |
| All | spPL | T2 | 534 | 534 | 0 | 23 | 511 | 112 | 1.53 | 0.3% | 0.3% |
| All | spPL | T3 | 534 | 534 | 0 | 19 | 515 | 69 | -130.52 | -25.3% | -24.4% |
| All | spPL | Base only | 534 | 65 | 0 | 15 | 519 | 126 | -97.58 | -18.8% | -18.3% |
| All | spPL | Top-two value | 534 | 258 | 0 | 24 | 510 | 70 | -134.46 | -26.4% | -25.2% |
| All | spPL | Positive T1 | 534 | 0 | 303 | 7 | 224 | 25 | -91.87 | -41.0% | -17.2% |

Base-only changed 65 selections, 55 in AW and 10 in Hurdle. It added 14 captured-price winners and £43.48 against T1 with two more settled stakes. It still trailed T2 by £82.95 captured and £99.11 at SP. On the wider 591-race SP comparison, base-only returned −£105.83 against T1's −£151.61 and T2's −£19.14. Top-two value switched 258 selections and was materially worse than T2 at both prices. Positive T1 cut 303 bets by design before refunds. The cash loss fell against T1 as exposure fell, while ROI per stake deteriorated on both price bases. No candidate beat T2 overall or in either chronological block on either basis.

## 6. Chronology and decision

| Family | Period | Captured pairs | T1 £ / T2 £ | Final SP pairs | T1 £ / T2 £ |
| --- | --- | --- | --- | --- | --- |
| All | Early | 210 | -60.26 / -15.24 | 251 | -69.11 / -23.19 |
| All | Later | 286 | -71.41 / 4.17 | 300 | -85.09 / 5.41 |
| AW | Early | 48 | -11.65 / 11.24 | 53 | -22.30 / 19.94 |
| AW | Later | 145 | -51.84 / -19.16 | 152 | -54.51 / -21.57 |
| HURDLE | Early | 100 | -26.83 / -11.50 | 123 | -32.54 / -19.38 |
| HURDLE | Later | 90 | -30.37 / 12.83 | 95 | -35.65 / 10.98 |
| CHASE | Early | 55 | -14.78 / -10.86 | 67 | -7.61 / -18.38 |
| CHASE | Later | 51 | 10.80 / 10.50 | 53 | 5.07 / 16.00 |
| TURF | Early | 7 | -7.00 / -4.12 | 8 | -6.67 / -5.38 |
| TURF | Later | 0 | 0.00 / 0.00 | 0 | 0.00 / 0.00 |


Early is 5–15 November, aligning with the earlier T1/T2 review. Later is 16–26 November, with settled results through 25 November. Both blocks favour T2 overall on both bases. AW T2 lost money in the later block despite leading T1. The split is a time-stability check within a dataset whose results already shaped the questions. There was no threshold search or model fitting in this review. Bootstrap intervals use 12,000 date-cluster draws with whole paired races retained. The captured pairs span 20 dates. Family estimates have fewer dates, and Turf has one.

The inherited core uses original 2025 development data. The 305 older Value-era development books were used for chronological model selection and reused in the final eligible fit. The earlier 1,220-race 2026 Chase comparison informed selection of the Chase base. Neither training/reference export shares race IDs with the current generation. The older Value ledgers overlap with all 305 development race IDs and with 567 current-generation race IDs, so they cannot provide independent replication. The historical result and feature caches lack a verified frozen current-generation T1–T5 holdout. The 15 and 18 November research reports also examined subsets of the current generation. [Generation development](tissue-generation-2026-11.md) · [Earlier T1/T2 review](tissue-generation-rank1-vs-rank2-2026-11-15.md) · [Earlier T3–T5 review](tissue-generation-ranks-3-5-2026-11-18.md)

**Decision.** T2 is the provisional profitability benchmark. Its lead justifies prospective shadow validation on genuinely new race IDs, with the paired price bases, family strata, missing-price handling and outlier sensitivities fixed before results. AW is the clearest replication target. Hurdle needs specific attention to withdrawal exposure, and Chase needs more evidence to distinguish its ranks. The three adjustments have insufficient evidence to advance as challengers to T2. Base-only can serve as a fixed diagnostic comparator if the context contribution is revisited.

[Detailed audit and comparison tables](tissue-profitability-phase-1-tables-2026-11-26.md)
