# Tissue Ranks 3, 4 and 5 · performance diagnostic

## Executive conclusion

**Chase T3 warrants further independent prospective research. The existing evidence does not establish a profitable lower-rank strategy.** On the frozen November generation, Chase T3 produced 22 winners from 82 settled selections, ahead of T1's 20/82 and T2's 15/79. It returned 1.65 times market-expected winners across the 71 selections with market probabilities. On 49 fields where all five Tissue ranks settled as starters, T3 found 14 winners, compared with 10 for T1 and six for T2. Its market A/E rose to 1.88 on those fields.

| Family / frozen model | T3 winners / settled · A/Market · ROI | T4 winners / settled · A/Market · ROI | T5 winners / settled · A/Market · ROI |
| --- | --- | --- | --- |
| Turf V4 | 0/8 · 0.00 · — | 0/8 · 0.00 · — | 0/8 · 0.00 · — |
| All Weather V3 | 5/71 · 0.74 · −100.0% | 9/68 · 1.15 · −24.1% | 9/72 · 1.23 · +77.2% |
| Hurdle V2 | 23/146 · 0.97 · −39.8% | 19/143 · 1.25 · −35.9% | 10/132 · 0.98 · −64.7% |
| Chase V2 | 22/82 · 1.65 · +50.8% | 11/80 · 1.13 · −38.5% | 5/62 · 0.72 · −13.2% |

Winner counts cover recorded settled selections. A/Market uses the subset with normalized captured-market probabilities. ROI uses the narrower subset with a valid captured price and a recorded canonical-v3 return. Turf has no qualifying canonical monetary stakes in this snapshot.

### What survived closer comparison

- **Potential signal requiring independent validation — Chase T3.** The combined Chase T3–T5 group exceeded the T1–T2 market residual by 9.0 percentage points after comparing within fixed captured-odds and market-rank bands. The gap ranged from +6.3 to +13.9 pp when dropping one race date at a time. The positive T3 return came from 25 stakes over six dates. Its £12.71 profit shrank to £5.71 without the largest winning race and **£0.21** without the largest two. On the stricter matched fields, the 14 qualifying stakes went from +£11.38 to **−£1.12** after the same sensitivity check. Most of the broad profit came from the 5–<11 price band, rather than the 11+ band. The same-race evidence supports investigating the winner-rate signal independently of the return.
- **Interesting but fragile — All Weather T5.** The £23.16 profit on 30 stakes across five dates turned into **−£3.84** after dropping the two largest winning races. The 11+ odds band supplied £16.00 and broke even without its largest winner. T5's market A/E fell from 1.23 to 1.08 on the fully settled same-race fields. AW T2 had a stronger market A/E on both comparisons, and the pooled lower ranks trailed after the fixed-band adjustment.
- **No consistent additional value — production Hurdle T3–T5.** All three lost money. T4's broad market A/E of 1.25 fell to 1.03 on the fully settled matched fields. In the separate current Hurdle shadow epoch, experimental V3 T4 made £7.40 on 30 stakes and fell to −£3.60 after its largest winning race was removed. The remaining shadow lower ranks were negative.
- **Insufficient evidence — Turf.** Eight races on one date yielded no T3–T5 winners. The snapshot gives too little coverage to judge the ranks.

Across 292 final races with all five ranks captured, Tissue Top 2 found 107 winners at race level and Top 5 found 210. Across the 252 comparable races with complete captured markets, market Top 5 found 202 winners versus Tissue's 178. Tissue T3–T5 identified 12 winners whose market rank was outside five. These individual cases show where the orderings differ. The market still covered more winners overall.

The older Value books and the generation development export answer different questions. Many race IDs overlap with the current or development populations, so a similar pattern in the older books does not provide independent replication. No untouched historical holdout with auditable T1–T5 predictions was available. Any follow-up should evaluate Chase T3 on later, independently observed results under a fixed analysis, with no change to the existing models, ranks, rules or collection.

## Data coverage and provenance

Snapshot read at 2026-11-18T15:51:34.718Z. Current cohort `TISSUE_GENERATION_2026_11` begins 2026-11-05T07:26:36.629Z. There are 345 unique races across 14 dates (345 stored captures, using the latest genuine pre-off whole book per race). Each outcome stays with its exact book. The report reads local frozen artifacts only.

| Family | Current frozen model | Model checksum | Current races / dates | Older Value races / model | Development races | Current races with a market |
| --- | --- | --- | --- | --- | --- | --- |
| TURF | TURF_TISSUE_V4 | `e106fadd07263b1fcc4ece821a4bfcad645faeae873db026433a4902eabbe3fe` | 8 / 2026-11-07 to 2026-11-07 (1 dates) | 139 / tissue_model_v3 | 71 | 7 |
| AW | AW_TISSUE_V3 | `c8f75faa0aeacc88ba76f100e7d154a872bc9b2ee31a5a42d18e611e3e64f9a5` | 88 / 2026-11-05 to 2026-11-18 (8 dates) | 238 / AW_TISSUE_V2 | 79 | 83 |
| HURDLE | HURDLE_TISSUE_V2 | `53defc50d717aba63c80c9f3c01c4df4360b709f6f4a21509a514179e23cce90` | 157 / 2026-11-05 to 2026-11-18 (13 dates) | 287 / JUMP_TISSUE_V1 | 94 | 133 |
| CHASE | CHASE_TISSUE_V2 | `be65702490403f6a287d11ecb19307a67b58ca975ee7bd9ece71b4e0d759aa81` | 92 / 2026-11-05 to 2026-11-18 (13 dates) | 171 / JUMP_TISSUE_V1 | 61 | 78 |

**Historical development.** The 305-book development export contains stored **older** ranks and normalized markets. The chronological tuning split informed model selection and the final fit reused all eligible development races. The separate 1220-race Chase promotion reference retains paired probabilities and winner flags, without stored rank positions or captured prices. It informed model choice and is left outside the rank tables.

**Historical holdout.** The 2025/2026 racing caches and holdout snapshots retain race features and results, such as finishing positions and SP, and prior reports contain selected aggregate evaluations. The inspected holdout artifacts lack a saved per-runner current-generation Tissue rank/probability book with matching model ID and as-of capture lineage. The older Jump model points to a temporary stage-one prediction export that is absent. There is no auditable untouched T1–T5 historical holdout for these models here. No ranks were reconstructed.

**Earlier prospective records.** The older Value ledgers provide complete captured price/probability books; all stored Tissue ranks are used, without applying Value 1 selection rules. 305 of those race IDs also appear in the development export and 293 also appear in the current generation. These populations are shown independently and are never added together. Older standalone Turf/AW/Jump or experimental paired ledgers retain some full ranks too, but use separate timing, partial prediction coverage, selected-only price/P&L or result-time SP. The consistent legacy comparison uses the full-field Value books and the exact Hurdle shadow pairs. The Positive/Neutral ledgers store T1/T2 only; the Market Edge monitor's featured cohorts likewise target T1/T2.

## Current prospective performance by family and rank

T1–T5 are positions in the unchanged stored Tissue ordering. Capture odds are Sporting Life median bookmaker decimal odds, recorded pre-off. Market expectation uses the recorded normalized full-book probability, or the existing full-book normalization of the same frozen prices when the stored probability is absent. The market denominator includes only settled selections with market probabilities. Expected winners sum frozen probabilities without renormalizing after withdrawals, and A/E uses fractional dead-heat credit. Winners and strike count recorded winning selections. Pending, NR and void are outside settled denominators. Capture odds n counts valid odds across captures. Settled priced and odds averages cover settled selections with valid captured odds. P/L and ROI use only finite recorded canonical-v3 returns and one £1 per qualifying stake. Unversioned/older outcomes remain visible in recorded result counts, with their monetary returns excluded. A dash means no eligible denominator.

| Family / model | Rank | Captured | Settled | Winners | Strike | Model E | A/Model | Market n | Market E | A/Market | Capture odds n | Settled priced | V3 stakes | P/L £ | ROI | Mean odds | Median odds |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TURF | T1 | 8 | 8 | 1 | 12.5% | 1.34 | 0.75 | 7 | 0.66 | 0.00 | 7 | 7 | 0 | — | — | 9.86 | 11.00 |
| TURF | T2 | 8 | 8 | 1 | 12.5% | 0.99 | 1.01 | 7 | 0.81 | 1.23 | 7 | 7 | 0 | — | — | 9.41 | 8.00 |
| TURF | T3 | 8 | 8 | 0 | 0.0% | 0.84 | 0.00 | 7 | 0.63 | 0.00 | 7 | 7 | 0 | — | — | 12.48 | 7.50 |
| TURF | T4 | 8 | 8 | 0 | 0.0% | 0.76 | 0.00 | 7 | 0.58 | 0.00 | 7 | 7 | 0 | — | — | 9.79 | 9.50 |
| TURF | T5 | 8 | 8 | 0 | 0.0% | 0.66 | 0.00 | 7 | 0.47 | 0.00 | 7 | 7 | 0 | — | — | 18.00 | 11.00 |
| AW | T1 | 88 | 72 | 10 | 13.9% | 14.98 | 0.67 | 67 | 13.98 | 0.72 | 83 | 67 | 29 | -16.92 | -58.3% | 6.38 | 4.00 |
| AW | T2 | 88 | 73 | 16 | 21.9% | 11.11 | 1.44 | 68 | 10.14 | 1.48 | 83 | 68 | 30 | -10.90 | -36.3% | 7.77 | 6.25 |
| AW | T3 | 88 | 71 | 5 | 7.0% | 8.35 | 0.60 | 67 | 6.74 | 0.74 | 83 | 67 | 30 | -30.00 | -100.0% | 14.68 | 8.00 |
| AW | T4 | 88 | 68 | 9 | 13.2% | 6.80 | 1.32 | 64 | 6.10 | 1.15 | 83 | 64 | 28 | -6.75 | -24.1% | 17.05 | 10.00 |
| AW | T5 | 88 | 72 | 9 | 12.5% | 6.23 | 1.44 | 68 | 6.52 | 1.23 | 83 | 68 | 30 | 23.16 | 77.2% | 15.16 | 9.75 |
| HURDLE | T1 | 157 | 151 | 38 | 25.2% | 38.23 | 0.99 | 127 | 30.72 | 1.01 | 133 | 127 | 52 | -17.43 | -33.5% | 5.04 | 3.75 |
| HURDLE | T2 | 157 | 146 | 28 | 19.2% | 25.13 | 1.11 | 123 | 22.72 | 1.01 | 133 | 123 | 50 | -2.26 | -4.5% | 9.28 | 5.00 |
| HURDLE | T3 | 157 | 146 | 23 | 15.8% | 19.50 | 1.18 | 123 | 18.48 | 0.97 | 133 | 123 | 47 | -18.72 | -39.8% | 9.80 | 6.50 |
| HURDLE | T4 | 154 | 143 | 19 | 13.3% | 14.75 | 1.29 | 123 | 12.85 | 1.25 | 131 | 123 | 50 | -17.95 | -35.9% | 19.43 | 9.00 |
| HURDLE | T5 | 147 | 132 | 10 | 7.6% | 11.38 | 0.88 | 112 | 9.20 | 0.98 | 125 | 112 | 46 | -29.75 | -64.7% | 22.14 | 12.00 |
| CHASE | T1 | 92 | 82 | 20 | 24.4% | 22.23 | 0.90 | 69 | 18.62 | 0.86 | 78 | 69 | 23 | -14.14 | -61.5% | 3.95 | 3.25 |
| CHASE | T2 | 92 | 79 | 15 | 19.0% | 15.91 | 0.94 | 67 | 14.34 | 0.98 | 78 | 67 | 22 | -13.75 | -62.5% | 5.82 | 4.33 |
| CHASE | T3 | 91 | 82 | 22 | 26.8% | 13.29 | 1.65 | 71 | 12.10 | 1.65 | 77 | 71 | 25 | 12.71 | 50.8% | 9.37 | 5.50 |
| CHASE | T4 | 87 | 80 | 11 | 13.8% | 10.33 | 1.07 | 69 | 8.88 | 1.13 | 73 | 69 | 26 | -10.00 | -38.5% | 13.94 | 7.50 |
| CHASE | T5 | 70 | 62 | 5 | 8.1% | 6.47 | 0.77 | 52 | 5.59 | 0.72 | 57 | 52 | 19 | -2.50 | -13.2% | 11.68 | 8.25 |

| Family | T1–T5 pending | NR | Void | Settled canonical v3 | Settled unversioned/older | Settled without captured odds |
| --- | --- | --- | --- | --- | --- | --- |
| TURF | 0 | 0 | 0 | 0 | 40 | 5 |
| AW | 75 | 9 | 0 | 147 | 209 | 22 |
| HURDLE | 5 | 45 | 4 | 329 | 389 | 110 |
| CHASE | 20 | 27 | 0 | 152 | 233 | 57 |

## Captured-price breakdown

The project's four existing badge price bands serve as fixed bins. Unpriced observations are outside the bands. Winners in each band include all recorded settled outcomes; £1 P/L uses the separate v3 stakes column.

### TURF

| Rank | Decimal odds | Captured | Settled | Priced | Winners | Market E | A/Market | V3 stakes | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | <3 | 0 | 0 | 0 | 0 | — | — | 0 | — | — |
| T1 | 3-<5 | 1 | 1 | 1 | 0 | 0.22 | 0.00 | 0 | — | — |
| T1 | 5-<11 | 2 | 2 | 2 | 0 | 0.22 | 0.00 | 0 | — | — |
| T1 | 11+ | 4 | 4 | 4 | 0 | 0.22 | 0.00 | 0 | — | — |
| T2 | <3 | 1 | 1 | 1 | 1 | 0.27 | 3.75 | 0 | — | — |
| T2 | 3-<5 | 1 | 1 | 1 | 0 | 0.16 | 0.00 | 0 | — | — |
| T2 | 5-<11 | 4 | 4 | 4 | 0 | 0.36 | 0.00 | 0 | — | — |
| T2 | 11+ | 1 | 1 | 1 | 0 | 0.02 | 0.00 | 0 | — | — |
| T3 | <3 | 0 | 0 | 0 | 0 | — | — | 0 | — | — |
| T3 | 3-<5 | 2 | 2 | 2 | 0 | 0.32 | 0.00 | 0 | — | — |
| T3 | 5-<11 | 2 | 2 | 2 | 0 | 0.20 | 0.00 | 0 | — | — |
| T3 | 11+ | 3 | 3 | 3 | 0 | 0.11 | 0.00 | 0 | — | — |
| T4 | <3 | 0 | 0 | 0 | 0 | — | — | 0 | — | — |
| T4 | 3-<5 | 0 | 0 | 0 | 0 | — | — | 0 | — | — |
| T4 | 5-<11 | 4 | 4 | 4 | 0 | 0.41 | 0.00 | 0 | — | — |
| T4 | 11+ | 3 | 3 | 3 | 0 | 0.17 | 0.00 | 0 | — | — |
| T5 | <3 | 0 | 0 | 0 | 0 | — | — | 0 | — | — |
| T5 | 3-<5 | 0 | 0 | 0 | 0 | — | — | 0 | — | — |
| T5 | 5-<11 | 3 | 3 | 3 | 0 | 0.29 | 0.00 | 0 | — | — |
| T5 | 11+ | 4 | 4 | 4 | 0 | 0.19 | 0.00 | 0 | — | — |

### AW

| Rank | Decimal odds | Captured | Settled | Priced | Winners | Market E | A/Market | V3 stakes | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | <3 | 20 | 15 | 15 | 4 | 6.25 | 0.64 | 6 | -2.92 | -48.7% |
| T1 | 3-<5 | 28 | 24 | 24 | 2 | 5.00 | 0.40 | 11 | -11.00 | -100.0% |
| T1 | 5-<11 | 28 | 22 | 22 | 4 | 2.48 | 1.61 | 8 | 1.00 | 12.5% |
| T1 | 11+ | 7 | 6 | 6 | 0 | 0.25 | 0.00 | 4 | -4.00 | -100.0% |
| T2 | <3 | 11 | 10 | 10 | 7 | 3.66 | 1.91 | 3 | 0.60 | 20.0% |
| T2 | 3-<5 | 14 | 11 | 11 | 4 | 2.13 | 1.88 | 5 | -0.50 | -10.0% |
| T2 | 5-<11 | 35 | 28 | 28 | 3 | 3.27 | 0.92 | 13 | -13.00 | -100.0% |
| T2 | 11+ | 23 | 19 | 19 | 1 | 1.08 | 0.92 | 9 | 2.00 | 22.2% |
| T3 | <3 | 4 | 3 | 3 | 1 | 0.95 | 1.05 | 2 | -2.00 | -100.0% |
| T3 | 3-<5 | 9 | 8 | 8 | 1 | 1.49 | 0.67 | 3 | -3.00 | -100.0% |
| T3 | 5-<11 | 40 | 33 | 33 | 2 | 3.47 | 0.58 | 15 | -15.00 | -100.0% |
| T3 | 11+ | 30 | 23 | 23 | 1 | 0.82 | 1.22 | 10 | -10.00 | -100.0% |
| T4 | <3 | 1 | 1 | 1 | 0 | 0.38 | 0.00 | 0 | — | — |
| T4 | 3-<5 | 9 | 8 | 8 | 4 | 1.60 | 2.50 | 3 | 4.25 | 141.7% |
| T4 | 5-<11 | 37 | 27 | 27 | 3 | 3.02 | 0.99 | 13 | 1.00 | 7.7% |
| T4 | 11+ | 36 | 28 | 28 | 0 | 1.10 | 0.00 | 12 | -12.00 | -100.0% |
| T5 | <3 | 1 | 1 | 1 | 0 | 0.34 | 0.00 | 0 | — | — |
| T5 | 3-<5 | 12 | 11 | 11 | 3 | 2.05 | 1.46 | 6 | 2.66 | 44.3% |
| T5 | 5-<11 | 31 | 25 | 25 | 3 | 2.63 | 1.14 | 11 | 4.50 | 40.9% |
| T5 | 11+ | 39 | 31 | 31 | 2 | 1.50 | 1.34 | 13 | 16.00 | 123.1% |

### HURDLE

| Rank | Decimal odds | Captured | Settled | Priced | Winners | Market E | A/Market | V3 stakes | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | <3 | 48 | 46 | 46 | 21 | 18.62 | 1.13 | 16 | -5.51 | -34.4% |
| T1 | 3-<5 | 41 | 40 | 40 | 6 | 8.21 | 0.73 | 19 | -0.42 | -2.2% |
| T1 | 5-<11 | 28 | 25 | 25 | 3 | 2.95 | 1.02 | 10 | -4.50 | -45.0% |
| T1 | 11+ | 16 | 16 | 16 | 1 | 0.94 | 1.07 | 7 | -7.00 | -100.0% |
| T2 | <3 | 25 | 24 | 24 | 13 | 9.76 | 1.33 | 9 | -5.76 | -64.0% |
| T2 | 3-<5 | 35 | 33 | 33 | 6 | 6.94 | 0.86 | 13 | -3.00 | -23.1% |
| T2 | 5-<11 | 51 | 45 | 45 | 2 | 5.20 | 0.38 | 19 | -3.50 | -18.4% |
| T2 | 11+ | 22 | 21 | 21 | 2 | 0.82 | 2.44 | 9 | 10.00 | 111.1% |
| T3 | <3 | 18 | 15 | 15 | 5 | 5.56 | 0.90 | 3 | 1.03 | 34.3% |
| T3 | 3-<5 | 24 | 24 | 24 | 4 | 5.16 | 0.77 | 7 | -0.25 | -3.6% |
| T3 | 5-<11 | 63 | 58 | 58 | 8 | 6.63 | 1.21 | 22 | -4.50 | -20.5% |
| T3 | 11+ | 28 | 26 | 26 | 1 | 1.13 | 0.88 | 15 | -15.00 | -100.0% |
| T4 | <3 | 4 | 4 | 4 | 1 | 1.49 | 0.67 | 3 | -1.70 | -56.7% |
| T4 | 3-<5 | 20 | 20 | 20 | 6 | 4.21 | 1.43 | 3 | 3.75 | 125.0% |
| T4 | 5-<11 | 49 | 47 | 47 | 9 | 5.31 | 1.69 | 21 | 3.00 | 14.3% |
| T4 | 11+ | 58 | 52 | 52 | 0 | 1.84 | 0.00 | 23 | -23.00 | -100.0% |
| T5 | <3 | 1 | 1 | 1 | 1 | 0.30 | 3.39 | 1 | 1.75 | 175.0% |
| T5 | 3-<5 | 18 | 17 | 17 | 1 | 3.25 | 0.31 | 10 | -5.50 | -55.0% |
| T5 | 5-<11 | 38 | 30 | 30 | 2 | 3.12 | 0.64 | 12 | -3.00 | -25.0% |
| T5 | 11+ | 68 | 64 | 64 | 5 | 2.53 | 1.98 | 23 | -23.00 | -100.0% |

### CHASE

| Rank | Decimal odds | Captured | Settled | Priced | Winners | Market E | A/Market | V3 stakes | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | <3 | 24 | 23 | 23 | 10 | 9.40 | 1.06 | 6 | 2.86 | 47.7% |
| T1 | 3-<5 | 35 | 31 | 31 | 5 | 7.46 | 0.67 | 10 | -10.00 | -100.0% |
| T1 | 5-<11 | 16 | 13 | 13 | 1 | 1.61 | 0.62 | 7 | -7.00 | -100.0% |
| T1 | 11+ | 3 | 2 | 2 | 0 | 0.14 | 0.00 | 0 | — | — |
| T2 | <3 | 23 | 20 | 20 | 6 | 7.09 | 0.85 | 3 | -0.25 | -8.3% |
| T2 | 3-<5 | 23 | 20 | 20 | 4 | 4.43 | 0.90 | 9 | -9.00 | -100.0% |
| T2 | 5-<11 | 26 | 21 | 21 | 4 | 2.55 | 1.57 | 8 | -2.50 | -31.3% |
| T2 | 11+ | 6 | 6 | 6 | 0 | 0.27 | 0.00 | 2 | -2.00 | -100.0% |
| T3 | <3 | 10 | 10 | 10 | 5 | 3.80 | 1.32 | 4 | 0.71 | 17.8% |
| T3 | 3-<5 | 23 | 21 | 21 | 7 | 4.81 | 1.46 | 6 | 2.00 | 33.3% |
| T3 | 5-<11 | 29 | 26 | 26 | 8 | 2.94 | 2.72 | 12 | 13.00 | 108.3% |
| T3 | 11+ | 15 | 14 | 14 | 0 | 0.56 | 0.00 | 3 | -3.00 | -100.0% |
| T4 | <3 | 2 | 2 | 2 | 0 | 0.71 | 0.00 | 1 | -1.00 | -100.0% |
| T4 | 3-<5 | 15 | 15 | 15 | 3 | 3.29 | 0.91 | 7 | -3.50 | -50.0% |
| T4 | 5-<11 | 37 | 34 | 34 | 7 | 4.10 | 1.71 | 9 | 3.50 | 38.9% |
| T4 | 11+ | 19 | 18 | 18 | 0 | 0.78 | 0.00 | 9 | -9.00 | -100.0% |
| T5 | <3 | 0 | 0 | 0 | 0 | — | — | 0 | — | — |
| T5 | 3-<5 | 9 | 8 | 8 | 1 | 1.58 | 0.63 | 2 | 2.50 | 125.0% |
| T5 | 5-<11 | 24 | 23 | 23 | 1 | 2.88 | 0.35 | 9 | -9.00 | -100.0% |
| T5 | 11+ | 24 | 21 | 21 | 2 | 1.13 | 1.77 | 8 | 4.00 | 50.0% |

## Same-race winner capture

Each race contributes at most once to a hit. The distribution uses the best rank of the recorded winner or co-winners. For both orderings Top k means frozen rank ≤ k, including all tied selections and preserving skipped positions. Final means every original runner has a recorded outcome and at least one settled winner. Market and Tissue hit rates are compared only in the same complete-market races. The last column identifies races with a T3–T5 winner whose market rank was outside five.

| Family | All ranks captured | Final | Dead heats / tied books | Best winner rank 1 / 2 / 3 / 4 / 5 / >5 | Top 1 / 2 / 3 / 5 | Outside 5 |
| --- | --- | --- | --- | --- | --- | --- |
| TURF | 8 | 8 | 0 / 0 | 1 / 1 / 0 / 0 / 0 / 6 | 1 (12.5%) / 2 (25.0%) / 2 (25.0%) / 2 (25.0%) | 6 (75.0%) |
| AW | 88 | 73 | 0 / 0 | 10 / 16 / 5 / 9 / 9 / 24 | 10 (13.7%) / 26 (35.6%) / 31 (42.5%) / 49 (67.1%) | 24 (32.9%) |
| HURDLE | 147 | 145 | 0 / 0 | 32 / 27 / 21 / 18 / 10 / 37 | 32 (22.1%) / 59 (40.7%) / 80 (55.2%) / 108 (74.5%) | 37 (25.5%) |
| CHASE | 70 | 66 | 0 / 0 | 12 / 8 / 16 / 10 / 5 / 15 | 12 (18.2%) / 20 (30.3%) / 36 (54.5%) / 51 (77.3%) | 15 (22.7%) |

| Family | Matched market races | Tissue Top 1 / 2 / 3 / 5 | Market Top 1 / 2 / 3 / 5 | T3–T5 winner / market >5 |
| --- | --- | --- | --- | --- |
| TURF | 7 | 0 (0.0%) / 1 (14.3%) / 1 (14.3%) / 1 (14.3%) | 3 (42.9%) / 3 (42.9%) / 3 (42.9%) / 3 (42.9%) | 0 |
| AW | 68 | 10 (14.7%) / 25 (36.8%) / 30 (44.1%) / 45 (66.2%) | 22 (32.4%) / 33 (48.5%) / 43 (63.2%) / 52 (76.5%) | 3 |
| HURDLE | 123 | 26 (21.1%) / 48 (39.0%) / 65 (52.8%) / 89 (72.4%) | 40 (32.5%) / 56 (45.5%) / 77 (62.6%) / 99 (80.5%) | 7 |
| CHASE | 54 | 9 (16.7%) / 16 (29.6%) / 30 (55.6%) / 43 (79.6%) | 13 (24.1%) / 28 (51.9%) / 36 (66.7%) / 48 (88.9%) | 2 |

### T1–T5 on identical settled fields

Here all frozen T1–T5 selections must have settled as starters. This stricter cohort removes races with a withdrawal at an evaluated rank; market and ROI still apply their own coverage conditions.

| Family / model | Rank | Captured | Settled | Winners | Strike | Model E | A/Model | Market n | Market E | A/Market | Capture odds n | Settled priced | V3 stakes | P/L £ | ROI | Mean odds | Median odds |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TURF | T1 | 8 | 8 | 1 | 12.5% | 1.34 | 0.75 | 7 | 0.66 | 0.00 | 7 | 7 | 0 | — | — | 9.86 | 11.00 |
| TURF | T2 | 8 | 8 | 1 | 12.5% | 0.99 | 1.01 | 7 | 0.81 | 1.23 | 7 | 7 | 0 | — | — | 9.41 | 8.00 |
| TURF | T3 | 8 | 8 | 0 | 0.0% | 0.84 | 0.00 | 7 | 0.63 | 0.00 | 7 | 7 | 0 | — | — | 12.48 | 7.50 |
| TURF | T4 | 8 | 8 | 0 | 0.0% | 0.76 | 0.00 | 7 | 0.58 | 0.00 | 7 | 7 | 0 | — | — | 9.79 | 9.50 |
| TURF | T5 | 8 | 8 | 0 | 0.0% | 0.66 | 0.00 | 7 | 0.47 | 0.00 | 7 | 7 | 0 | — | — | 18.00 | 11.00 |
| AW | T1 | 65 | 65 | 10 | 15.4% | 13.53 | 0.74 | 62 | 13.03 | 0.77 | 62 | 62 | 27 | -14.92 | -55.3% | 6.51 | 4.17 |
| AW | T2 | 65 | 65 | 15 | 23.1% | 9.93 | 1.51 | 62 | 9.49 | 1.58 | 62 | 62 | 27 | -7.90 | -29.3% | 7.73 | 6.00 |
| AW | T3 | 65 | 65 | 4 | 6.2% | 7.64 | 0.52 | 62 | 6.28 | 0.64 | 62 | 62 | 27 | -27.00 | -100.0% | 14.97 | 8.25 |
| AW | T4 | 65 | 65 | 9 | 13.8% | 6.54 | 1.38 | 62 | 6.01 | 1.16 | 62 | 62 | 27 | -5.75 | -21.3% | 16.36 | 10.00 |
| AW | T5 | 65 | 65 | 7 | 10.8% | 5.61 | 1.25 | 62 | 5.53 | 1.08 | 62 | 62 | 27 | 21.83 | 80.9% | 15.96 | 10.00 |
| HURDLE | T1 | 111 | 111 | 24 | 21.6% | 25.64 | 0.94 | 94 | 21.57 | 0.93 | 94 | 94 | 36 | -14.96 | -41.6% | 5.36 | 4.00 |
| HURDLE | T2 | 111 | 111 | 22 | 19.8% | 17.92 | 1.23 | 94 | 16.20 | 1.05 | 94 | 94 | 36 | -12.63 | -35.1% | 9.40 | 5.50 |
| HURDLE | T3 | 111 | 111 | 16 | 14.4% | 14.10 | 1.13 | 94 | 13.23 | 0.98 | 94 | 94 | 36 | -18.72 | -52.0% | 10.66 | 6.50 |
| HURDLE | T4 | 111 | 111 | 13 | 11.7% | 11.51 | 1.13 | 94 | 9.72 | 1.03 | 94 | 94 | 36 | -21.70 | -60.3% | 19.24 | 9.25 |
| HURDLE | T5 | 111 | 111 | 8 | 7.2% | 9.79 | 0.82 | 94 | 7.81 | 1.02 | 94 | 94 | 36 | -19.75 | -54.9% | 22.71 | 13.00 |
| CHASE | T1 | 49 | 49 | 10 | 20.4% | 10.91 | 0.92 | 41 | 9.57 | 0.84 | 41 | 41 | 14 | -7.39 | -52.8% | 4.32 | 3.50 |
| CHASE | T2 | 49 | 49 | 6 | 12.2% | 8.57 | 0.70 | 41 | 6.71 | 0.89 | 41 | 41 | 14 | -8.50 | -60.7% | 6.99 | 5.50 |
| CHASE | T3 | 49 | 49 | 14 | 28.6% | 7.23 | 1.94 | 41 | 6.38 | 1.88 | 41 | 41 | 14 | 11.38 | 81.3% | 9.14 | 6.50 |
| CHASE | T4 | 49 | 49 | 7 | 14.3% | 6.12 | 1.14 | 41 | 5.24 | 1.34 | 41 | 41 | 14 | -7.50 | -53.6% | 8.91 | 7.50 |
| CHASE | T5 | 49 | 49 | 2 | 4.1% | 5.15 | 0.39 | 41 | 4.32 | 0.23 | 41 | 41 | 14 | -9.50 | -67.9% | 12.04 | 9.00 |

## Market-adjusted comparison

On those same fully settled fields, compare T3–T5 with T1–T2 within fixed joint price/market-rank bins. Only cells containing both groups are retained. Each cell is weighted by its pooled selection count. Rates are descriptive, with fractional winner credit. The omit-one-date range recomputes all cells and weights after dropping each date in turn. It measures sensitivity to a single date. Differences in win rate, model probability, and market probability can remain within a bin. Sparse cells, shared races and dates, and the small number of winners limit inference.

| Family | Common n / eligible | Cells | T1–2 n / T3–5 n | T1–2 model / market / realised | T3–5 model / market / realised | T3–5 residual minus T1–2 | Omit one date range |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TURF | 29 / 35 | 7 | 12 / 17 | 12.6% / 8.1% / 0.0% | 8.6% / 7.7% / 0.0% | 0.4 pp | — |
| AW | 307 / 310 | 11 | 122 / 185 | 16.7% / 13.6% / 14.9% | 10.4% / 12.2% / 11.4% | -2.2 pp | -4.6 to 0.5 pp |
| HURDLE | 465 / 470 | 13 | 183 / 282 | 17.3% / 14.8% / 16.2% | 11.1% / 14.4% / 14.2% | -1.6 pp | -3.6 to 1.1 pp |
| CHASE | 200 / 205 | 11 | 80 / 120 | 19.2% / 15.8% / 11.8% | 13.3% / 15.4% / 20.5% | 9.0 pp | 6.3 to 13.9 pp |

## Profit robustness

Every positive current rank or price-band cell is shown. Stake A/Market uses the same canonical-priced selections as ROI. Largest winners are ordered by recorded gross return. Removal drops the entire associated race from the subgroup, including any tied selections, and recomputes stakes and net ROI. Removing two winners uses two distinct races where available. Race dates are distinct dates, with no statistical independence assumed. Calendar blocks show period sensitivity; the strongest track is the one contributing the greatest net P/L. Trainer identity is absent from these frozen books, and no mutable trainer lookup was used.

| Positive cohort | V3 stakes / dates / wins | Stake A/Market | P/L £ / ROI | Largest winner (gross / net £) | Second gross £ | Drop largest £ / ROI | Drop two £ / ROI | Before 5 Nov stakes / £ | 5–11 Nov stakes / £ | 12 Nov onward stakes / £ | Top track stakes / £ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| AW T1, 5-<11 | 8 / 3 / 1 | 1.04 | 1.00 / 12.5% | It's A Love Thing at 9.00 (9.00 / 8.00) | — | -7.00 / -100.0% | -7.00 / -100.0% | 0 / — | 2 / -2.00 | 6 / 3.00 | Wolverhampton 2 / 7.00 |
| AW T2, <3 | 3 / 2 / 2 | 1.71 | 0.60 / 20.0% | Lookingforarainbow at 2.10 (2.10 / 1.10) | 1.50 | -0.50 / -25.0% | -1.00 / -100.0% | 0 / — | 2 / 0.10 | 1 / 0.50 | Southwell 1 / 0.50 |
| AW T2, 11+ | 9 / 3 / 1 | 1.85 | 2.00 / 22.2% | Xirivella at 11.00 (11.00 / 10.00) | — | -8.00 / -100.0% | -8.00 / -100.0% | 0 / — | 0 / — | 9 / 2.00 | Dundalk 2 / 9.00 |
| AW T4, 3-<5 | 3 / 3 / 2 | 3.28 | 4.25 / 141.7% | Glitter And Glory at 3.75 (3.75 / 2.75) | 3.50 | 1.50 / 75.0% | -1.00 / -100.0% | 0 / — | 0 / — | 3 / 4.25 | Southwell 1 / 2.50 |
| AW T4, 5-<11 | 13 / 5 / 2 | 1.36 | 1.00 / 7.7% | Castan at 8.50 (8.50 / 7.50) | 5.50 | -6.50 / -54.2% | -11.00 / -100.0% | 0 / — | 2 / -2.00 | 11 / 3.00 | Southwell 3 / 11.00 |
| AW T5, all prices | 30 / 5 / 6 | 2.16 | 23.16 / 77.2% | The Bear Trap at 17.00 (17.00 / 16.00) | 12.00 | 7.16 / 24.7% | -3.84 / -13.7% | 0 / — | 7 / 14.33 | 23 / 8.83 | Dundalk 12 / 18.33 |
| AW T5, 3-<5 | 6 / 4 / 2 | 1.85 | 2.66 / 44.3% | Shoot To Kill at 4.33 (4.33 / 3.33) | 4.33 | -0.67 / -13.4% | -4.00 / -100.0% | 0 / — | 1 / 3.33 | 5 / -0.67 | Dundalk 2 / 2.33 |
| AW T5, 5-<11 | 11 / 5 / 2 | 1.84 | 4.50 / 40.9% | Theorist at 9.00 (9.00 / 8.00) | 6.50 | -3.50 / -35.0% | -9.00 / -100.0% | 0 / — | 3 / -3.00 | 8 / 7.50 | Southwell 2 / 4.50 |
| AW T5, 11+ | 13 / 5 / 2 | 3.31 | 16.00 / 123.1% | The Bear Trap at 17.00 (17.00 / 16.00) | 12.00 | 0.00 / 0.0% | -11.00 / -100.0% | 0 / — | 3 / 14.00 | 10 / 2.00 | Dundalk 5 / 12.00 |
| HURDLE T2, 11+ | 9 / 4 / 1 | 2.82 | 10.00 / 111.1% | Rose Warrior at 19.00 (19.00 / 18.00) | — | -8.00 / -100.0% | -8.00 / -100.0% | 0 / — | 0 / — | 9 / 10.00 | Uttoxeter 1 / 18.00 |
| HURDLE T3, <3 | 3 / 3 / 2 | 1.54 | 1.03 / 34.3% | Boombox at 2.63 (2.63 / 1.63) | 1.40 | -0.60 / -30.0% | -1.00 / -100.0% | 0 / — | 1 / -1.00 | 2 / 2.03 | Uttoxeter 1 / 1.63 |
| HURDLE T4, 3-<5 | 3 / 2 / 2 | 2.69 | 3.75 / 125.0% | Theanniversary Man at 3.75 (3.75 / 2.75) | 3.00 | 1.00 / 50.0% | -1.00 / -100.0% | 0 / — | 0 / — | 3 / 3.75 | Limerick 1 / 2.75 |
| HURDLE T4, 5-<11 | 21 / 5 / 4 | 1.59 | 3.00 / 14.3% | Spellacy's Cross at 8.00 (8.00 / 7.00) | 6.00 | -4.00 / -20.0% | -9.00 / -47.4% | 0 / — | 2 / -2.00 | 19 / 5.00 | Limerick 5 / 8.00 |
| HURDLE T5, <3 | 1 / 1 / 1 | 3.39 | 1.75 / 175.0% | Thinkitdontjinxit at 2.75 (2.75 / 1.75) | — | — | — | 0 / — | 0 / — | 1 / 1.75 | Navan 1 / 1.75 |
| CHASE T1, <3 | 6 / 5 / 4 | 1.74 | 2.86 / 47.7% | Palamon at 2.88 (2.88 / 1.88) | 2.25 | 0.98 / 19.6% | -0.27 / -6.7% | 0 / — | 1 / -1.00 | 5 / 3.86 | Wetherby 1 / 1.88 |
| CHASE T3, all prices | 25 / 6 / 8 | 1.75 | 12.71 / 50.8% | Livin On Luco at 8.00 (8.00 / 7.00) | 6.50 | 5.71 / 23.8% | 0.21 / 0.9% | 0 / — | 3 / 2.00 | 22 / 10.71 | Fontwell 1 / 7.00 |
| CHASE T3, <3 | 4 / 3 / 2 | 1.22 | 0.71 / 17.8% | Air Apparent at 2.88 (2.88 / 1.88) | 1.83 | -1.17 / -39.0% | -2.00 / -100.0% | 0 / — | 0 / — | 4 / 0.71 | Carlisle 1 / 1.88 |
| CHASE T3, 3-<5 | 6 / 4 / 2 | 1.57 | 2.00 / 33.3% | Clap Of Thunder at 4.50 (4.50 / 3.50) | 3.50 | -1.50 / -30.0% | -4.00 / -100.0% | 0 / — | 2 / -2.00 | 4 / 4.00 | Plumpton 2 / 6.00 |
| CHASE T3, 5-<11 | 12 / 4 / 4 | 2.65 | 13.00 / 108.3% | Livin On Luco at 8.00 (8.00 / 7.00) | 6.50 | 6.00 / 54.5% | 0.50 / 5.0% | 0 / — | 1 / 4.00 | 11 / 9.00 | Fontwell 1 / 7.00 |
| CHASE T4, 5-<11 | 9 / 5 / 2 | 1.72 | 3.50 / 38.9% | The Wallpark at 6.50 (6.50 / 5.50) | 6.00 | -2.00 / -25.0% | -7.00 / -100.0% | 0 / — | 1 / -1.00 | 8 / 4.50 | Navan 1 / 5.50 |
| CHASE T5, 3-<5 | 2 / 2 / 1 | 2.66 | 2.50 / 125.0% | Midnight View at 4.50 (4.50 / 3.50) | — | -1.00 / -100.0% | -1.00 / -100.0% | 0 / — | 1 / 3.50 | 1 / -1.00 | Warwick 1 / 3.50 |
| CHASE T5, 11+ | 8 / 4 / 1 | 2.89 | 4.00 / 50.0% | Fay Ce Que Voudras at 12.00 (12.00 / 11.00) | — | -7.00 / -100.0% | -7.00 / -100.0% | 0 / — | 0 / — | 8 / 4.00 | Fontwell 2 / 10.00 |
| Current matched · AW T5 | 27 / 5 / 5 | 2.03 | 21.83 / 80.9% | The Bear Trap at 17.00 (17.00 / 16.00) | 12.00 | 5.83 / 22.4% | -5.17 / -20.7% | 0 / — | 7 / 14.33 | 20 / 7.50 | Dundalk 12 / 18.33 |
| Current matched · CHASE T3 | 14 / 6 / 5 | 2.27 | 11.38 / 81.3% | Livin On Luco at 8.00 (8.00 / 7.00) | 6.50 | 4.38 / 33.7% | -1.12 / -9.3% | 0 / — | 2 / -2.00 | 12 / 13.38 | Fontwell 1 / 7.00 |

| Family / period | Rank | Settled | Winners | Market E | A/Market | V3 stakes | P/L £ | ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TURF 5–11 November | T3 | 8 | 0 | 0.63 | 0.00 | 0 | — | — |
| TURF 5–11 November | T4 | 8 | 0 | 0.58 | 0.00 | 0 | — | — |
| TURF 5–11 November | T5 | 8 | 0 | 0.47 | 0.00 | 0 | — | — |
| TURF 12 November onward | T3 | 0 | 0 | — | — | 0 | — | — |
| TURF 12 November onward | T4 | 0 | 0 | — | — | 0 | — | — |
| TURF 12 November onward | T5 | 0 | 0 | — | — | 0 | — | — |
| AW 5–11 November | T3 | 48 | 5 | 4.14 | 1.21 | 7 | -7.00 | -100.0% |
| AW 5–11 November | T4 | 47 | 5 | 3.94 | 0.76 | 7 | -7.00 | -100.0% |
| AW 5–11 November | T5 | 49 | 5 | 4.36 | 0.92 | 7 | 14.33 | 204.7% |
| AW 12 November onward | T3 | 23 | 0 | 2.59 | 0.00 | 23 | -23.00 | -100.0% |
| AW 12 November onward | T4 | 21 | 4 | 2.16 | 1.85 | 21 | 0.25 | 1.2% |
| AW 12 November onward | T5 | 23 | 4 | 2.16 | 1.86 | 23 | 8.83 | 38.4% |
| HURDLE 5–11 November | T3 | 87 | 14 | 13.81 | 0.87 | 4 | -4.00 | -100.0% |
| HURDLE 5–11 November | T4 | 83 | 10 | 7.96 | 1.13 | 4 | -4.00 | -100.0% |
| HURDLE 5–11 November | T5 | 72 | 6 | 5.27 | 1.14 | 2 | -2.00 | -100.0% |
| HURDLE 12 November onward | T3 | 59 | 9 | 4.68 | 1.28 | 43 | -14.72 | -34.2% |
| HURDLE 12 November onward | T4 | 60 | 9 | 4.89 | 1.43 | 46 | -13.95 | -30.3% |
| HURDLE 12 November onward | T5 | 60 | 4 | 3.94 | 0.76 | 44 | -27.75 | -63.1% |
| CHASE 5–11 November | T3 | 52 | 14 | 8.11 | 1.60 | 3 | 2.00 | 66.7% |
| CHASE 5–11 November | T4 | 51 | 8 | 5.85 | 1.20 | 3 | -3.00 | -100.0% |
| CHASE 5–11 November | T5 | 38 | 3 | 4.08 | 0.74 | 2 | 2.50 | 125.0% |
| CHASE 12 November onward | T3 | 30 | 8 | 3.99 | 1.75 | 22 | 10.71 | 48.7% |
| CHASE 12 November onward | T4 | 29 | 3 | 3.03 | 0.99 | 23 | -7.00 | -30.4% |
| CHASE 12 November onward | T5 | 24 | 2 | 1.51 | 0.66 | 17 | -5.00 | -29.4% |

## Earlier model versions and historical comparison

Earlier Value-era and development rows use the captured ranks of the older model shown in the coverage table. The development rows are a subset of the older books, and none of their recorded outcomes is canonical v3. Old-to-new comparisons across time also change field composition and pricing coverage.

### Prior prospective Value-era books

| Family / model | Rank | Captured | Settled | Winners | Strike | Model E | A/Model | Market n | Market E | A/Market | Capture odds n | Settled priced | V3 stakes | P/L £ | ROI | Mean odds | Median odds |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TURF | T1 | 139 | 126 | 28 | 22.2% | 26.11 | 1.07 | 126 | 23.83 | 1.17 | 139 | 126 | 0 | — | — | 5.98 | 5.00 |
| TURF | T2 | 139 | 124 | 21 | 16.9% | 18.44 | 1.14 | 124 | 19.92 | 1.05 | 139 | 124 | 0 | — | — | 7.19 | 5.50 |
| TURF | T3 | 139 | 125 | 9 | 7.2% | 14.46 | 0.62 | 125 | 13.90 | 0.65 | 139 | 125 | 0 | — | — | 10.48 | 7.50 |
| TURF | T4 | 139 | 123 | 10 | 8.1% | 11.94 | 0.84 | 123 | 12.20 | 0.82 | 139 | 123 | 0 | — | — | 12.34 | 8.00 |
| TURF | T5 | 137 | 123 | 10 | 8.1% | 10.57 | 0.95 | 123 | 9.67 | 1.03 | 137 | 123 | 0 | — | — | 17.26 | 11.00 |
| AW | T1 | 238 | 209 | 48 | 23.0% | 44.41 | 1.08 | 209 | 44.14 | 1.09 | 238 | 209 | 28 | -19.09 | -68.2% | 5.34 | 4.00 |
| AW | T2 | 238 | 206 | 41 | 19.9% | 31.68 | 1.29 | 206 | 32.18 | 1.27 | 238 | 206 | 27 | -0.40 | -1.5% | 6.77 | 5.50 |
| AW | T3 | 238 | 209 | 25 | 12.0% | 25.41 | 0.98 | 209 | 24.31 | 1.03 | 238 | 209 | 28 | -12.25 | -43.8% | 10.96 | 7.50 |
| AW | T4 | 237 | 209 | 22 | 10.5% | 21.30 | 1.03 | 209 | 20.54 | 1.07 | 237 | 209 | 28 | 7.50 | 26.8% | 13.39 | 8.50 |
| AW | T5 | 236 | 198 | 20 | 10.1% | 17.48 | 1.14 | 198 | 17.77 | 1.13 | 236 | 198 | 27 | 4.33 | 16.0% | 14.06 | 9.50 |
| HURDLE | T1 | 287 | 263 | 72 | 27.4% | 63.94 | 1.13 | 263 | 62.77 | 1.15 | 287 | 263 | 44 | -4.51 | -10.3% | 5.00 | 3.75 |
| HURDLE | T2 | 287 | 255 | 49 | 19.2% | 43.12 | 1.14 | 255 | 45.90 | 1.07 | 287 | 255 | 40 | 11.00 | 27.5% | 7.59 | 5.00 |
| HURDLE | T3 | 287 | 258 | 34 | 13.2% | 33.64 | 1.01 | 258 | 36.61 | 0.93 | 287 | 258 | 41 | -15.24 | -37.2% | 10.39 | 6.50 |
| HURDLE | T4 | 285 | 256 | 33 | 12.9% | 26.71 | 1.24 | 256 | 28.73 | 1.15 | 285 | 256 | 41 | -2.75 | -6.7% | 15.50 | 8.50 |
| HURDLE | T5 | 273 | 235 | 21 | 8.9% | 20.63 | 1.02 | 235 | 20.31 | 1.03 | 273 | 235 | 35 | -32.25 | -92.1% | 21.98 | 11.00 |
| CHASE | T1 | 171 | 147 | 38 | 25.9% | 45.22 | 0.84 | 147 | 36.68 | 1.04 | 171 | 147 | 20 | -14.97 | -74.9% | 4.60 | 3.50 |
| CHASE | T2 | 171 | 144 | 31 | 21.5% | 30.39 | 1.02 | 144 | 29.87 | 1.04 | 171 | 144 | 18 | 14.51 | 80.6% | 6.19 | 4.50 |
| CHASE | T3 | 168 | 148 | 21 | 14.2% | 22.81 | 0.92 | 148 | 24.11 | 0.87 | 168 | 148 | 20 | 1.50 | 7.5% | 7.65 | 5.50 |
| CHASE | T4 | 160 | 143 | 31 | 21.7% | 17.60 | 1.76 | 143 | 19.82 | 1.56 | 160 | 143 | 19 | -7.50 | -39.5% | 9.70 | 6.50 |
| CHASE | T5 | 134 | 120 | 18 | 15.0% | 11.79 | 1.53 | 120 | 13.59 | 1.32 | 134 | 120 | 14 | 4.50 | 32.1% | 11.73 | 8.00 |

### Frozen development subset

| Family / model | Rank | Captured | Settled | Winners | Strike | Model E | A/Model | Market n | Market E | A/Market | Capture odds n | Settled priced | V3 stakes | P/L £ | ROI | Mean odds | Median odds |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TURF | T1 | 71 | 71 | 19 | 26.8% | 16.40 | 1.16 | 71 | 15.37 | 1.24 | 71 | 71 | 0 | — | — | 5.16 | 4.50 |
| TURF | T2 | 71 | 71 | 12 | 16.9% | 11.18 | 1.07 | 71 | 11.85 | 1.01 | 71 | 71 | 0 | — | — | 7.73 | 5.50 |
| TURF | T3 | 71 | 71 | 7 | 9.9% | 8.57 | 0.82 | 71 | 8.01 | 0.87 | 71 | 71 | 0 | — | — | 11.63 | 8.00 |
| TURF | T4 | 71 | 71 | 7 | 9.9% | 7.13 | 0.98 | 71 | 7.42 | 0.94 | 71 | 71 | 0 | — | — | 11.24 | 8.00 |
| TURF | T5 | 69 | 69 | 6 | 8.7% | 6.01 | 1.00 | 69 | 5.48 | 1.09 | 69 | 69 | 0 | — | — | 17.68 | 11.00 |
| AW | T1 | 79 | 79 | 14 | 17.7% | 17.92 | 0.78 | 79 | 16.21 | 0.86 | 79 | 79 | 0 | — | — | 5.30 | 4.00 |
| AW | T2 | 79 | 79 | 19 | 24.1% | 12.97 | 1.47 | 79 | 13.76 | 1.38 | 79 | 79 | 0 | — | — | 6.26 | 5.00 |
| AW | T3 | 79 | 79 | 12 | 15.2% | 10.47 | 1.15 | 79 | 10.56 | 1.14 | 79 | 79 | 0 | — | — | 10.19 | 6.50 |
| AW | T4 | 78 | 78 | 5 | 6.4% | 8.32 | 0.60 | 78 | 8.28 | 0.60 | 78 | 78 | 0 | — | — | 12.65 | 7.50 |
| AW | T5 | 77 | 77 | 7 | 9.1% | 7.18 | 0.98 | 77 | 6.93 | 1.01 | 77 | 77 | 0 | — | — | 13.01 | 9.00 |
| HURDLE | T1 | 94 | 94 | 28 | 29.8% | 24.99 | 1.12 | 94 | 23.04 | 1.22 | 94 | 94 | 0 | — | — | 4.75 | 3.75 |
| HURDLE | T2 | 94 | 94 | 21 | 22.3% | 16.92 | 1.24 | 94 | 18.14 | 1.16 | 94 | 94 | 0 | — | — | 6.58 | 4.50 |
| HURDLE | T3 | 94 | 94 | 7 | 7.4% | 12.66 | 0.55 | 94 | 13.12 | 0.53 | 94 | 94 | 0 | — | — | 13.00 | 6.25 |
| HURDLE | T4 | 94 | 94 | 4 | 4.3% | 10.01 | 0.40 | 94 | 11.21 | 0.36 | 94 | 94 | 0 | — | — | 17.59 | 8.50 |
| HURDLE | T5 | 90 | 90 | 13 | 14.4% | 7.88 | 1.65 | 90 | 8.27 | 1.57 | 90 | 90 | 0 | — | — | 23.57 | 10.00 |
| CHASE | T1 | 61 | 61 | 18 | 29.5% | 18.86 | 0.95 | 61 | 14.23 | 1.26 | 61 | 61 | 0 | — | — | 4.95 | 4.00 |
| CHASE | T2 | 61 | 61 | 14 | 23.0% | 13.31 | 1.05 | 61 | 13.72 | 1.02 | 61 | 61 | 0 | — | — | 5.19 | 4.50 |
| CHASE | T3 | 59 | 59 | 5 | 8.5% | 9.65 | 0.52 | 59 | 9.72 | 0.51 | 59 | 59 | 0 | — | — | 6.28 | 5.00 |
| CHASE | T4 | 55 | 55 | 9 | 16.4% | 7.11 | 1.27 | 55 | 8.08 | 1.11 | 55 | 55 | 0 | — | — | 10.15 | 6.50 |
| CHASE | T5 | 45 | 45 | 6 | 13.3% | 4.58 | 1.31 | 45 | 5.79 | 1.04 | 45 | 45 | 0 | — | — | 8.93 | 8.00 |

### Shared races across family model versions

For the race-capture comparison below, both versions must preserve the identical runner ID set and ranks 1–5. Each model is scored against the same recorded winner or co-winners in the current book. Both books were frozen pre-off, but may have been captured at different times. Their odds and returns are not pooled.

| Family | Common final races | Current Top 1 / 2 / 3 / 5 | Older Top 1 / 2 / 3 / 5 |
| --- | --- | --- | --- |
| TURF | 7 | 0 (0.0%) / 1 (14.3%) / 1 (14.3%) / 1 (14.3%) | 0 (0.0%) / 1 (14.3%) / 1 (14.3%) / 1 (14.3%) |
| AW | 66 | 9 (13.6%) / 23 (34.8%) / 28 (42.4%) / 43 (65.2%) | 10 (15.2%) / 25 (37.9%) / 32 (48.5%) / 46 (69.7%) |
| HURDLE | 113 | 25 (22.1%) / 44 (38.9%) / 60 (53.1%) / 84 (74.3%) | 27 (23.9%) / 46 (40.7%) / 60 (53.1%) / 86 (76.1%) |
| CHASE | 46 | 7 (15.2%) / 14 (30.4%) / 26 (56.5%) / 37 (80.4%) | 8 (17.4%) / 17 (37.0%) / 24 (52.2%) / 42 (91.3%) |

### Hurdle V2 versus V3 on identical books

The two Hurdle shadow collection epochs remain separate. The full official shadow ordering is used, with no LED counterfactual. The matched sample requires ranks 1–5 present and settled in both model orderings, with the same archived production field, market probabilities and recorded outcomes.

**HURDLE_V2_V3_PROSPECTIVE_SHADOW_V1** · 34/49 matched races (2026-11-08 to 2026-11-11 (4 dates)).

| Family / model | Rank | Captured | Settled | Winners | Strike | Model E | A/Model | Market n | Market E | A/Market | Capture odds n | Settled priced | V3 stakes | P/L £ | ROI | Mean odds | Median odds |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| HURDLE_TISSUE_V2 | T1 | 34 | 34 | 10 | 29.4% | 8.62 | 1.16 | 32 | 8.08 | 1.24 | 32 | 32 | 1 | 2.75 | 275.0% | 4.81 | 3.75 |
| HURDLE_TISSUE_V2 | T2 | 34 | 34 | 6 | 17.6% | 5.78 | 1.04 | 32 | 5.96 | 0.84 | 32 | 32 | 1 | -1.00 | -100.0% | 8.65 | 5.50 |
| HURDLE_TISSUE_V2 | T3 | 34 | 34 | 4 | 11.8% | 4.43 | 0.90 | 32 | 4.96 | 0.81 | 32 | 32 | 1 | -1.00 | -100.0% | 8.13 | 5.75 |
| HURDLE_TISSUE_V2 | T4 | 34 | 34 | 3 | 8.8% | 3.51 | 0.85 | 32 | 3.55 | 0.85 | 32 | 32 | 1 | -1.00 | -100.0% | 18.93 | 8.00 |
| HURDLE_TISSUE_V2 | T5 | 34 | 34 | 3 | 8.8% | 2.99 | 1.00 | 32 | 2.46 | 1.22 | 32 | 32 | 1 | -1.00 | -100.0% | 22.01 | 13.00 |
| HURDLE_TISSUE_V3_CHALLENGER | T1 | 34 | 34 | 9 | 26.5% | 7.84 | 1.15 | 32 | 7.40 | 1.22 | 32 | 32 | 1 | 2.75 | 275.0% | 5.69 | 4.00 |
| HURDLE_TISSUE_V3_CHALLENGER | T2 | 34 | 34 | 6 | 17.6% | 5.67 | 1.06 | 32 | 5.37 | 0.93 | 32 | 32 | 1 | -1.00 | -100.0% | 10.89 | 6.00 |
| HURDLE_TISSUE_V3_CHALLENGER | T3 | 34 | 34 | 4 | 11.8% | 4.36 | 0.92 | 32 | 4.72 | 0.64 | 32 | 32 | 1 | -1.00 | -100.0% | 13.02 | 7.75 |
| HURDLE_TISSUE_V3_CHALLENGER | T4 | 34 | 34 | 4 | 11.8% | 3.76 | 1.06 | 32 | 2.83 | 1.41 | 32 | 32 | 1 | -1.00 | -100.0% | 20.94 | 10.00 |
| HURDLE_TISSUE_V3_CHALLENGER | T5 | 34 | 34 | 3 | 8.8% | 3.26 | 0.92 | 32 | 3.43 | 0.88 | 32 | 32 | 1 | -1.00 | -100.0% | 25.26 | 9.25 |

**HURDLE_V3_SHADOW_COLLECTION_V2_2026_11_11** · 42/68 matched races (2026-11-12 to 2026-11-18 (6 dates)).

| Family / model | Rank | Captured | Settled | Winners | Strike | Model E | A/Model | Market n | Market E | A/Market | Capture odds n | Settled priced | V3 stakes | P/L £ | ROI | Mean odds | Median odds |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| HURDLE_TISSUE_V2 | T1 | 42 | 42 | 8 | 19.0% | 9.76 | 0.82 | 30 | 6.69 | 0.75 | 30 | 30 | 30 | -17.65 | -58.8% | 5.69 | 4.17 |
| HURDLE_TISSUE_V2 | T2 | 42 | 42 | 9 | 21.4% | 6.64 | 1.36 | 30 | 4.75 | 1.05 | 30 | 30 | 30 | -6.63 | -22.1% | 10.22 | 5.50 |
| HURDLE_TISSUE_V2 | T3 | 42 | 42 | 6 | 14.3% | 5.24 | 1.14 | 30 | 3.46 | 1.16 | 30 | 30 | 30 | -12.72 | -42.4% | 13.08 | 9.50 |
| HURDLE_TISSUE_V2 | T4 | 42 | 42 | 4 | 9.5% | 4.26 | 0.94 | 30 | 2.67 | 0.75 | 30 | 30 | 30 | -20.00 | -66.7% | 19.26 | 10.25 |
| HURDLE_TISSUE_V2 | T5 | 42 | 42 | 2 | 4.8% | 3.59 | 0.56 | 30 | 2.76 | 0.72 | 30 | 30 | 30 | -22.75 | -75.8% | 22.30 | 13.00 |
| HURDLE_TISSUE_V3_CHALLENGER | T1 | 42 | 42 | 10 | 23.8% | 9.45 | 1.06 | 30 | 5.69 | 1.05 | 30 | 30 | 30 | -7.34 | -24.5% | 7.84 | 4.42 |
| HURDLE_TISSUE_V3_CHALLENGER | T2 | 42 | 42 | 6 | 14.3% | 6.35 | 0.94 | 30 | 4.65 | 0.65 | 30 | 30 | 30 | -18.93 | -63.1% | 9.97 | 7.00 |
| HURDLE_TISSUE_V3_CHALLENGER | T3 | 42 | 42 | 4 | 9.5% | 5.13 | 0.78 | 30 | 3.86 | 0.78 | 30 | 30 | 30 | -22.63 | -75.4% | 18.86 | 7.25 |
| HURDLE_TISSUE_V3_CHALLENGER | T4 | 42 | 42 | 6 | 14.3% | 4.13 | 1.45 | 30 | 3.19 | 1.88 | 30 | 30 | 30 | 7.40 | 24.7% | 13.46 | 8.50 |
| HURDLE_TISSUE_V3_CHALLENGER | T5 | 42 | 42 | 4 | 9.5% | 3.68 | 1.09 | 30 | 2.45 | 0.41 | 30 | 30 | 30 | -26.75 | -89.2% | 18.62 | 13.00 |

### Sensitivity of positive older-model and shadow rows

| Positive cohort | V3 stakes / dates / wins | Stake A/Market | P/L £ / ROI | Largest winner (gross / net £) | Second gross £ | Drop largest £ / ROI | Drop two £ / ROI | Before 5 Nov stakes / £ | 5–11 Nov stakes / £ | 12 Nov onward stakes / £ | Top track stakes / £ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Earlier Value · AW T4 | 28 / 4 / 3 | 1.25 | 7.50 / 26.8% | The Bear Trap at 17.00 (17.00 / 16.00) | 10.00 | -8.50 / -31.5% | -17.50 / -67.3% | 0 / — | 7 / 10.00 | 21 / -2.50 | Dundalk 10 / 7.00 |
| Earlier Value · AW T5 | 27 / 4 / 5 | 2.13 | 4.33 / 16.0% | Theorist at 9.00 (9.00 / 8.00) | 8.00 | -3.67 / -14.1% | -10.67 / -42.7% | 0 / — | 6 / -1.67 | 21 / 6.00 | Southwell 9 / 9.00 |
| Earlier Value · HURDLE T2 | 40 / 5 / 7 | 0.97 | 11.00 / 27.5% | Rose Warrior at 19.00 (19.00 / 18.00) | 8.50 | -7.00 / -17.9% | -14.50 / -38.2% | 0 / — | 7 / -4.25 | 33 / 15.25 | Uttoxeter 4 / 15.00 |
| Earlier Value · CHASE T2 | 18 / 4 / 7 | 1.65 | 14.51 / 80.6% | Getawhisky at 10.00 (10.00 / 9.00) | 8.50 | 5.51 / 32.4% | -1.99 / -12.4% | 0 / — | 8 / 7.50 | 10 / 7.01 | Bangor-on-Dee 3 / 10.25 |
| Earlier Value · CHASE T3 | 20 / 4 / 4 | 1.08 | 1.50 / 7.5% | Welonlyhavedone at 6.50 (6.50 / 5.50) | 5.50 | -4.00 / -21.1% | -8.50 / -47.2% | 0 / — | 8 / 3.50 | 12 / -2.00 | Ayr 2 / 4.50 |
| Earlier Value · CHASE T5 | 14 / 4 / 3 | 2.03 | 4.50 / 32.1% | Whistle Stop Tour at 8.00 (8.00 / 7.00) | 6.00 | -2.50 / -19.2% | -7.50 / -62.5% | 0 / — | 5 / 7.50 | 9 / -3.00 | Ayr 1 / 7.00 |
| Shadow epoch V1 HURDLE_TISSUE_V2 · HURDLE T1 | 1 / 1 / 1 | 4.76 | 2.75 / 275.0% | Ballynoe Boy at 3.75 (3.75 / 2.75) | — | — | — | 0 / — | 1 / 2.75 | 0 / — | Ayr 1 / 2.75 |
| Shadow epoch V1 HURDLE_TISSUE_V3_CHALLENGER · HURDLE T1 | 1 / 1 / 1 | 4.76 | 2.75 / 275.0% | Ballynoe Boy at 3.75 (3.75 / 2.75) | — | — | — | 0 / — | 1 / 2.75 | 0 / — | Ayr 1 / 2.75 |
| Shadow epoch V2 HURDLE_TISSUE_V3_CHALLENGER · HURDLE T4 | 30 / 5 / 6 | 1.88 | 7.40 / 24.7% | Lord De Choisel at 12.00 (12.00 / 11.00) | 7.50 | -3.60 / -12.4% | -10.10 / -36.1% | 0 / — | 0 / — | 30 / 7.40 | Limerick 3 / 14.00 |

## Integrity and reproducibility

Reproduce the tables with `bun scripts/diagnose-tissue-ranks-3-5.ts`. The script prints to stdout, validates model metadata and ledger schemas, checks the active epoch source pins and confirms the source bytes still match the start of the run. It never scrapes, settles, fits, backfills or connects to the database.

| Source checked | SHA-256 |
| --- | --- |
| `data/research/tissue-generation-forward-2026-11.json` | `27c487d8bcec66dfa2ca936e253b4ca50f00e735174c5a188e57377239723499` |
| `data/research/tissue-generation-2026-11-manifest.json` | `0b688caf76a575fb874a582d40a98016182d014c02f1a91b62c4a242a368e89a` |
| `data/research/tissue-generation-development-2026-11.json` | `0dc2c37ce5ce14426e8399a1bfb68254ea8f714e12184bcce430c124064fd4b1` |
| `data/research/tissue-generation-chase-promotion-2026-11.json` | `56116ca16d8e3d514d407833b08a8de6c7a6e253c3fd733aaf995ebe49ab1ff2` |
| `data/research/hurdle-v3-prospective-shadow-v1.json` | `77f58bc6e86421e4349a5dc2ff5cc88ff83fabffe79da594877cc4af2349b53b` |
| `data/research/prospective-epochs-2026-11-11/activation.json` | `67ff6f99c5a90975a82bbe149c17dc2649d4df1a260fb209be80dc9114d7ec59` |
| `data/research/prospective-epochs-2026-11-11/positive-neutral-v2.json` | `cf2d0b345686bd02459fa8626697ac49e1787cb95e24722e1742f93388d45461` |
| `data/research/prospective-epochs-2026-11-11/hurdle-v3-shadow-v2.json` | `03b877b902b82c454cb3b1ff2ce312e0f7674458047001953ce30a391367a381` |
| `data/research/prospective-epochs-2026-11-11/hurdle-v3-market-edge-v2.json` | `31adfdba0dee0532c1565b1e9bbdab59e68d4262a663995e8290fd208e6e53b8` |
| `data/research/tissue-generation-2026-11-turf.json` | `dcbe9fac4f7f3b56c5d9297e77b82357ace92d4d5c34f2152afd02cfb9bf9b8a` |
| `data/research/tissue-generation-2026-11-aw.json` | `d9c44881e2ea13ee1ed637122e2eb49028866aba8668086718d757c0e94a7f8c` |
| `data/research/tissue-generation-2026-11-hurdle.json` | `2b6495fceb4079da756e52a00c7b45f9d8051ea6d63305dd96ae5c7f8ab6499e` |
| `data/research/tissue-generation-2026-11-chase.json` | `35208f1c097ede47b2637e535b4a186c4fc79ee34dd4cb0e5b8852342f5e854d` |
| `data/research/tissue-model-v3.json` | `cc3db9e2a52c0c8d57c1c4dbd0ce7dbe82b27962ad60e193f9f2dc176f64f57a` |
| `data/research/aw-tissue-model-v2.json` | `6a2694fbd975db2ce4937a57087cc8f34c2ba690026b12ce72aa0778e371ad23` |
| `data/research/jump-tissue-model-v1.json` | `bfc152a49d029e57dcd0d40e06a2b5e097d00aa90cc53cb6de0fe1f2c4c661c7` |
| `data/research/turf-tissue-v3-value-forward-v1.json` | `568c1fdd2d7daf447d95c530ed6e75a2903a61daf9a79fed624cc1796c19706d` |
| `data/research/aw-tissue-v2-value-forward-v1.json` | `c90854468854e37fe42fe7f4cfbce8c773d6123de4ce426ecd30d09ecc6bc8e4` |
| `data/research/hurdle-jump-tissue-v1-value-forward-v1.json` | `f54d60e19e58e4affb3c6402733b958f3a8bf93b1ec7d53f234d90ac19b28c80` |
| `data/research/chase-jump-tissue-v1-value-forward-v1.json` | `8cd4985dc33145b655bd1ee2d79c7afc0dda5d5f8e8a44a83a39b89faa0a4fc1` |
| `data/research/tissue-positive-neutral-prospective-v1.json` | `d103abec5d7092685cc2646dc7e39d357ffa27e04a3dedf0f96b761b882de4b3` |
| `data/research/hurdle-v3-market-edge-prospective-v1.json` | `2cc981ff2dd6e27664f15d9a854a023b9d16b026e4583dd820b9a21d4d24a42e` |
| `data/research/hurdle-low-form-prospective-v1.json` | `6463b902ac9e8539d2fb7dc72ea810fee339b26f6d74e6273c0f201707a805a6` |
