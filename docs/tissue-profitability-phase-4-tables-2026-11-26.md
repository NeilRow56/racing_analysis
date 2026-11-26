# Chase T2 and T3 matched comparison tables

[Phase 4 decision report](tissue-profitability-phase-4-2026-11-26.md)

The source is the pinned Phase 3 replay and the November ledger before the 14:02 UTC settlement batch on 26 November. Historical features join the same 2025 missing-minute cache and isolated 2026 cache through 14 October by original runner ID. Earlier Chase ranks use all 1,220 promotion reference fields where available and class comes from the proved full-history dataset. November class, distance, handicap, OR and Jump Speed come from the frozen book inputs. Unmeasured or unlinked features are excluded pairwise. The historical performance proxy is `latestPerformanceRating`. Prior win rate is the cached pre-race win percentage, not the current race. No Chase-only Speed or recent-finish field is imputed. [Phase 3 replay provenance and source hashes](tissue-profitability-phase-3-tables-2026-11-26.md)

`spPL` is final SP. `capPL` is verified pre-off median bookmaker odds. `quotedSP` means SP on those same verified quote boards. Nominal captured returns precede any bookmaker-specific withdrawal deductions. Market rank is competition rank by decimal odds on the indicated board. Historical SP market ranks use eventual starters. November captured market ranks retain the frozen declared field. For win payout decomposition, first multiply the change in winner count by T2's mean gross return per winner, then multiply T3's winner count by the difference between average winning gross payouts. Fractional dead-heat credit applies to model A/E and the official stake divisor applies to gross returns. Figures are rounded after calculation.

Rows headed bets/W / £ / ROI show stakes and wins followed by net P/L and ROI. Model E is the sum of frozen probabilities. In historical and November matched policy tables, all races have valid stakes for both T2 and T3 under the given basis. In “known decision opportunities” the original T2 remains in the universe even on a later NR or when T3 is unavailable. Refunds carry zero stake. Removing a winning race or day removes it from both arms. Calendar sensitivity compares the same Jan–14 October dates, excluding the November frozen period. Earlier quoted cohorts cover September–October only. Omitted rows have zero available matched opportunities.

## Handicap benchmark

| Period | Cohort | Price basis | Rank | Matched races / bets | Winners | Strike | Avg winning odds | £ P/L | ROI | Model E / actual credit | Market ranks 1–3 / 4–6 / 7+ | 11+ bets / W / £ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2025 | All SP | spPL | T2 | 1322 | 261 | 19.7% | 4.82 | -64.13 | -4.9% | 245.77 / 261.00 | 871 / 358 / 93 | 182 / 13 / 6.00 |
| 2025 | All SP | spPL | T3 | 1322 | 237 | 17.9% | 5.41 | -39.47 | -3.0% | 203.05 / 237.00 | 731 / 461 / 130 | 300 / 14 / -70.00 |
| 2026 | All SP | spPL | T2 | 960 | 171 | 17.8% | 4.52 | -187.51 | -19.5% | 185.65 / 171.00 | 634 / 247 / 79 | 147 / 11 / 18.00 |
| 2026 | All SP | spPL | T3 | 960 | 150 | 15.6% | 5.48 | -137.53 | -14.3% | 151.24 / 150.00 | 535 / 340 / 85 | 206 / 13 / -24.00 |
| 2026 | Quoted only | capPL | T2 | 84 | 18 | 21.4% | 4.03 | -11.41 | -13.6% | 17.68 / 18.00 | 64 / 16 / 4 | 5 / 0 / -5.00 |
| 2026 | Quoted only | capPL | T3 | 84 | 12 | 14.3% | 4.45 | -30.62 | -36.5% | 14.09 / 12.00 | 56 / 23 / 5 | 9 / 0 / -9.00 |
| 2026 | Quoted only | spPL | T2 | 84 | 18 | 21.4% | 4.15 | -9.29 | -11.1% | 17.68 / 18.00 | 61 / 20 / 3 | 7 / 0 / -7.00 |
| 2026 | Quoted only | spPL | T3 | 84 | 12 | 14.3% | 5.14 | -22.38 | -26.6% | 14.09 / 12.00 | 50 / 31 / 3 | 14 / 0 / -14.00 |
| November | All SP | spPL | T2 | 91 | 18 | 19.8% | 4.41 | -11.55 | -12.7% | 16.58 / 18.00 | 58 / 29 / 4 | 11 / 1 / 2.00 |
| November | All SP | spPL | T3 | 91 | 20 | 22.0% | 4.99 | 8.88 | 9.8% | 14.10 / 20.00 | 55 / 29 / 7 | 14 / 0 / -14.00 |
| November | Quoted only | capPL | T2 | 83 | 18 | 21.7% | 4.46 | -2.79 | -3.4% | 15.36 / 18.00 | 56 / 22 / 5 | 8 / 1 / 5.00 |
| November | Quoted only | capPL | T3 | 83 | 18 | 21.7% | 4.99 | 6.76 | 8.1% | 13.13 / 18.00 | 43 / 32 / 8 | 10 / 0 / -10.00 |
| November | Quoted only | spPL | T2 | 83 | 18 | 21.7% | 4.41 | -3.55 | -4.3% | 15.36 / 18.00 | 51 / 28 / 4 | 11 / 1 / 2.00 |
| November | Quoted only | spPL | T3 | 83 | 18 | 21.7% | 4.90 | 5.25 | 6.3% | 13.13 / 18.00 | 53 / 24 / 6 | 11 / 0 / -11.00 |

## Sources of the matched gap

| Period | Subset | Races | T2 SP £ | T3 SP £ | SP gap £ | Captured gap £ | T2 wins/losses | T3 wins/losses | Average gross per win T2/T3 at SP | Win count contribution £ | Win payout contribution £ | T2/T3 SP-minus-quote payouts £ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2025 | All SP | 1322 | -64.13 | -39.47 | 24.65 | — | 261/1061 | 237/1085 | 4.82 / 5.41 | -115.67 | 140.32 | — / — |
| 2025 | Unquoted | 1322 | -64.13 | -39.47 | 24.65 | — | 261/1061 | 237/1085 | 4.82 / 5.41 | -115.67 | 140.32 | — / — |
| 2026 | All SP | 960 | -187.51 | -137.53 | 49.99 | — | 171/789 | 150/810 | 4.52 / 5.48 | -94.87 | 144.85 | — / — |
| 2026 | Quoted | 84 | -9.29 | -22.38 | -13.08 | -19.21 | 18/66 | 12/72 | 4.15 / 5.14 | -24.90 | 11.82 | 2.12 / 8.25 |
| 2026 | Unquoted | 876 | -178.22 | -115.15 | 63.07 | — | 153/723 | 138/738 | 4.56 / 5.51 | -68.41 | 131.48 | — / — |
| November | All SP | 91 | -11.55 | 8.88 | 20.43 | — | 18/73 | 20/71 | 4.41 / 4.99 | 8.83 | 11.60 | — / — |
| November | Quoted | 83 | -3.55 | 5.25 | 8.80 | 9.55 | 18/65 | 18/65 | 4.41 / 4.90 | 0.00 | 8.80 | -0.76 / -1.51 |
| November | Unquoted | 8 | -8.00 | 3.63 | 11.63 | — | 0/8 | 2/6 | — / 5.81 | — | — | — / — |

## Movement on exact captured boards

| Period | Rank | Pairs | All shortened / flat / drifted | Median SP/quote all | Winners shortened / flat / drifted | Winning gross shift £ | Largest winner shifts (quote → SP) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026 | T2 | 84 | 32/8/44 | 1.080 | 8/3/7 | 2.12 | ID c4aef1e2 5.00 → 8.50, Palamon 5.50 → 3.75, Birdie Or Bust 5.50 → 7.00 |
| 2026 | T3 | 84 | 22/9/53 | 1.161 | 3/0/9 | 8.25 | ID c48f94a4 7.50 → 4.50, ID ae868d9b 3.00 → 6.00, ID 181a262f 3.75 → 6.00 |
| November | T2 | 83 | 29/11/43 | 1.045 | 6/4/8 | -0.76 | Top Guy 8.50 → 4.50, Montregard 4.50 → 6.00, Cote D'ange 5.50 → 6.50 |
| November | T3 | 83 | 38/12/33 | 1.000 | 7/4/7 | -1.51 | Kientzheim 8.00 → 2.63, Cheesy Icon 4.50 → 7.00, Burning It Up 8.00 → 10.00 |

## Handicap conditions

| Dimension | Group | Period | Basis | T2 bets/W / £ / ROI | T3 bets/W / £ / ROI | T3–T2 £ |
| --- | --- | --- | --- | --- | --- | --- |
| Distance | Short | 2025 | spPL | 297/62 / -37.88 / -12.8% | 297/60 / 12.16 / 4.1% | 50.04 |
| Distance | Short | 2026 | spPL | 201/38 / -60.47 / -30.1% | 201/30 / -53.70 / -26.7% | 6.77 |
| Distance | Short | 2026 | capPL | 18/6 / 4.71 / 26.2% | 18/3 / -4.75 / -26.4% | -9.46 |
| Distance | Short | November | spPL | 20/3 / -12.38 / -61.9% | 20/6 / 9.75 / 48.8% | 22.13 |
| Distance | Short | November | capPL | 20/3 / -12.37 / -61.9% | 20/6 / 6.38 / 31.9% | 18.75 |
| Distance | Intermediate | 2025 | spPL | 677/133 / 5.81 / 0.9% | 677/122 / -22.50 / -3.3% | -28.31 |
| Distance | Intermediate | 2026 | spPL | 517/91 / -40.31 / -7.8% | 517/80 / -43.38 / -8.4% | -3.07 |
| Distance | Intermediate | 2026 | capPL | 45/6 / -16.00 / -35.6% | 45/7 / -15.12 / -33.6% | 0.88 |
| Distance | Intermediate | November | spPL | 42/10 / 9.07 / 21.6% | 42/7 / -12.13 / -28.9% | -21.20 |
| Distance | Intermediate | November | capPL | 36/10 / 14.08 / 39.1% | 36/6 / -4.12 / -11.4% | -18.20 |
| Distance | Staying | 2025 | spPL | 348/66 / -32.06 / -9.2% | 348/55 / -29.13 / -8.4% | 2.92 |
| Distance | Staying | 2026 | spPL | 242/42 / -86.72 / -35.8% | 242/40 / -40.45 / -16.7% | 46.28 |
| Distance | Staying | 2026 | capPL | 21/6 / -0.12 / -0.6% | 21/2 / -10.75 / -51.2% | -10.63 |
| Distance | Staying | November | spPL | 29/5 / -8.25 / -28.4% | 29/7 / 11.25 / 38.8% | 19.50 |
| Distance | Staying | November | capPL | 27/5 / -4.50 / -16.7% | 27/6 / 4.50 / 16.7% | 9.00 |
| Going | Good / faster | 2025 | spPL | 591/134 / 24.77 / 4.2% | 591/108 / -46.63 / -7.9% | -71.40 |
| Going | Good / faster | 2026 | spPL | 507/96 / -59.05 / -11.6% | 507/74 / -126.13 / -24.9% | -67.09 |
| Going | Good / faster | 2026 | capPL | 60/13 / -6.29 / -10.5% | 60/7 / -23.12 / -38.5% | -16.83 |
| Going | Good / faster | November | spPL | 61/12 / -13.75 / -22.5% | 61/16 / 22.13 / 36.3% | 35.88 |
| Going | Good / faster | November | capPL | 55/12 / -8.49 / -15.4% | 55/15 / 21.00 / 38.2% | 29.49 |
| Going | Good to soft / yielding | 2025 | spPL | 406/67 / -56.48 / -13.9% | 406/77 / 49.66 / 12.2% | 106.14 |
| Going | Good to soft / yielding | 2026 | spPL | 216/32 / -66.75 / -30.9% | 216/33 / -28.25 / -13.1% | 38.50 |
| Going | Good to soft / yielding | 2026 | capPL | 16/4 / -3.12 / -19.5% | 16/4 / -2.25 / -14.1% | 0.87 |
| Going | Good to soft / yielding | November | spPL | 25/5 / 1.70 / 6.8% | 25/3 / -16.75 / -67.0% | -18.45 |
| Going | Good to soft / yielding | November | capPL | 23/5 / 4.70 / 20.4% | 23/2 / -17.24 / -75.0% | -21.94 |
| Going | Soft | 2025 | spPL | 244/44 / -26.20 / -10.7% | 244/35 / -50.67 / -20.8% | -24.47 |
| Going | Soft | 2026 | spPL | 167/32 / -33.27 / -19.9% | 167/29 / 14.35 / 8.6% | 47.62 |
| Going | Soft | 2026 | capPL | 8/1 / -2.00 / -25.0% | 8/1 / -5.25 / -65.6% | -3.25 |
| Going | Soft | November | spPL | 5/1 / 0.50 / 10.0% | 5/1 / 3.50 / 70.0% | 3.00 |
| Going | Soft | November | capPL | 5/1 / 1.00 / 20.0% | 5/1 / 3.00 / 60.0% | 2.00 |
| Going | Heavy | 2025 | spPL | 79/16 / -4.21 / -5.3% | 79/17 / 10.17 / 12.9% | 14.37 |
| Going | Heavy | 2026 | spPL | 64/10 / -26.95 / -42.1% | 64/14 / 8.50 / 13.3% | 35.45 |
| Going | Mixed / missing | 2025 | spPL | 2/0 / -2.00 / -100.0% | 2/0 / -2.00 / -100.0% | 0.00 |
| Going | Mixed / missing | 2026 | spPL | 6/1 / -1.50 / -25.0% | 6/0 / -6.00 / -100.0% | -4.50 |
| Class | Class 1–3 | 2025 | spPL | 413/95 / 54.28 / 13.1% | 413/77 / 22.34 / 5.4% | -31.94 |
| Class | Class 1–3 | 2026 | spPL | 273/45 / -93.84 / -34.4% | 273/37 / -89.26 / -32.7% | 4.58 |
| Class | Class 1–3 | 2026 | capPL | 24/4 / -7.50 / -31.3% | 24/2 / -18.25 / -76.0% | -10.75 |
| Class | Class 1–3 | November | spPL | 30/7 / -1.13 / -3.8% | 30/5 / -2.00 / -6.7% | -0.88 |
| Class | Class 1–3 | November | capPL | 28/7 / -0.25 / -0.9% | 28/5 / -2.00 / -7.1% | -1.75 |
| Class | Class 4–6 | 2025 | spPL | 753/148 / -66.57 / -8.8% | 753/141 / -26.81 / -3.6% | 39.76 |
| Class | Class 4–6 | 2026 | spPL | 557/100 / -88.25 / -15.8% | 557/99 / -11.27 / -2.0% | 76.99 |
| Class | Class 4–6 | 2026 | capPL | 52/10 / -14.66 / -28.2% | 52/10 / -4.37 / -8.4% | 10.29 |
| Class | Class 4–6 | November | spPL | 50/11 / 0.57 / 1.1% | 50/14 / 19.00 / 38.0% | 18.42 |
| Class | Class 4–6 | November | capPL | 46/11 / 6.46 / 14.0% | 46/12 / 14.88 / 32.3% | 8.42 |
| Class | Unknown / other | 2025 | spPL | 156/18 / -51.83 / -33.2% | 156/19 / -35.01 / -22.4% | 16.83 |
| Class | Unknown / other | 2026 | spPL | 130/26 / -5.42 / -4.2% | 130/14 / -37.00 / -28.5% | -31.58 |
| Class | Unknown / other | 2026 | capPL | 8/4 / 10.75 / 134.4% | 8/0 / -8.00 / -100.0% | -18.75 |
| Class | Unknown / other | November | spPL | 11/0 / -11.00 / -100.0% | 11/1 / -8.13 / -73.9% | 2.88 |
| Class | Unknown / other | November | capPL | 9/0 / -9.00 / -100.0% | 9/1 / -6.12 / -68.0% | 2.88 |
| Field size | 3–6 | 2025 | spPL | 544/131 / -31.47 / -5.8% | 544/116 / -27.09 / -5.0% | 4.38 |
| Field size | 3–6 | 2026 | spPL | 453/98 / -60.74 / -13.4% | 453/80 / -63.89 / -14.1% | -3.16 |
| Field size | 3–6 | 2026 | capPL | 47/9 / -13.00 / -27.7% | 47/8 / -9.37 / -19.9% | 3.63 |
| Field size | 3–6 | November | spPL | 40/10 / -0.25 / -0.6% | 40/12 / 16.88 / 42.2% | 17.13 |
| Field size | 3–6 | November | capPL | 39/10 / 0.26 / 0.7% | 39/11 / 12.38 / 31.7% | 12.12 |
| Field size | 7–10 | 2025 | spPL | 543/98 / -22.44 / -4.1% | 543/95 / 49.00 / 9.0% | 71.44 |
| Field size | 7–10 | 2026 | spPL | 331/55 / -49.57 / -15.0% | 331/53 / -25.72 / -7.8% | 23.85 |
| Field size | 7–10 | 2026 | capPL | 31/9 / 7.59 / 24.5% | 31/4 / -15.25 / -49.2% | -22.84 |
| Field size | 7–10 | November | spPL | 31/4 / -15.80 / -51.0% | 31/7 / 3.50 / 11.3% | 19.30 |
| Field size | 7–10 | November | capPL | 28/4 / -12.55 / -44.8% | 28/6 / 2.38 / 8.5% | 14.93 |
| Field size | 11+ | 2025 | spPL | 235/32 / -10.22 / -4.3% | 235/26 / -61.38 / -26.1% | -51.17 |
| Field size | 11+ | 2026 | spPL | 176/18 / -77.21 / -43.9% | 176/17 / -47.92 / -27.2% | 29.29 |
| Field size | 11+ | 2026 | capPL | 6/0 / -6.00 / -100.0% | 6/0 / -6.00 / -100.0% | 0.00 |
| Field size | 11+ | November | spPL | 20/4 / 4.50 / 22.5% | 20/1 / -11.50 / -57.5% | -16.00 |
| Field size | 11+ | November | capPL | 16/4 / 9.50 / 59.4% | 16/1 / -8.00 / -50.0% | -17.50 |

## Courses with at least 20 matched handicaps in each historical period

| Course | 2025 T2 | 2025 T3 | 2025 gap | 2026 T2 | 2026 T3 | 2026 gap | November T2 | November T3 | November gap |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Bangor-on-Dee | 28/4 / -15.29 / -54.6% | 28/6 / 4.75 / 17.0% | 20.04 | 25/4 / -16.09 / -64.4% | 25/3 / -11.55 / -46.2% | 4.54 | 5/3 / 5.13 / 102.5% | 5/0 / -5.00 / -100.0% | -10.13 |
| Cartmel | 26/6 / 2.33 / 9.0% | 26/5 / 1.50 / 5.8% | -0.83 | 25/8 / 3.58 / 14.3% | 25/5 / -0.88 / -3.5% | -4.46 | — | — | — |
| Ffos Las | 28/5 / -0.05 / -0.2% | 28/6 / -0.29 / -1.0% | -0.24 | 30/5 / 1.63 / 5.4% | 30/6 / 9.00 / 30.0% | 7.38 | 3/1 / 3.50 / 116.7% | 3/0 / -3.00 / -100.0% | -6.50 |
| Fontwell | 45/12 / 22.11 / 49.1% | 45/7 / -4.38 / -9.7% | -26.49 | 28/0 / -28.00 / -100.0% | 28/2 / -16.50 / -58.9% | 11.50 | 3/1 / -0.80 / -26.7% | 3/1 / 5.50 / 183.3% | 6.30 |
| Hereford | 30/4 / -15.63 / -52.1% | 30/11 / 14.87 / 49.6% | 30.49 | 21/4 / -7.50 / -35.7% | 21/5 / 18.38 / 87.5% | 25.88 | 1/1 / 2.50 / 250.0% | 1/0 / -1.00 / -100.0% | -3.50 |
| Hexham | 33/6 / 1.08 / 3.3% | 33/6 / 2.75 / 8.3% | 1.67 | 25/2 / -17.13 / -68.5% | 25/7 / 28.10 / 112.4% | 45.23 | 5/0 / -5.00 / -100.0% | 5/3 / 9.75 / 195.0% | 14.75 |
| Huntingdon | 35/7 / 0.63 / 1.8% | 35/12 / 19.74 / 56.4% | 19.12 | 24/6 / 30.58 / 127.4% | 24/4 / -1.47 / -6.1% | -32.05 | 5/1 / -1.50 / -30.0% | 5/2 / 5.50 / 110.0% | 7.00 |
| Kelso | 27/6 / 12.25 / 45.4% | 27/4 / -10.17 / -37.7% | -22.42 | 23/8 / 14.42 / 62.7% | 23/2 / -14.00 / -60.9% | -28.42 | 2/1 / 1.50 / 75.0% | 2/1 / 8.00 / 400.0% | 6.50 |
| Market Rasen | 46/10 / -5.19 / -11.3% | 46/8 / -0.55 / -1.2% | 4.64 | 40/6 / -16.25 / -40.6% | 40/10 / 14.88 / 37.2% | 31.13 | 2/0 / -2.00 / -100.0% | 2/1 / 0.63 / 31.3% | 2.63 |
| Newcastle | 28/3 / -17.50 / -62.5% | 28/8 / 6.46 / 23.1% | 23.96 | 20/0 / -20.00 / -100.0% | 20/6 / 15.33 / 76.7% | 35.33 | 2/0 / -2.00 / -100.0% | 2/0 / -2.00 / -100.0% | 0.00 |
| Newton Abbot | 38/9 / -8.49 / -22.3% | 38/10 / 4.88 / 12.8% | 13.37 | 40/5 / -22.38 / -55.9% | 40/6 / -19.46 / -48.6% | 2.92 | — | — | — |
| Perth | 27/7 / 1.66 / 6.1% | 27/5 / -5.50 / -20.4% | -7.16 | 24/4 / 13.25 / 55.2% | 24/4 / 4.67 / 19.4% | -8.58 | — | — | — |
| Plumpton | 28/8 / 2.53 / 9.0% | 28/4 / -0.80 / -2.9% | -3.33 | 22/3 / -13.31 / -60.5% | 22/4 / -10.47 / -47.6% | 2.84 | 5/2 / 0.50 / 10.0% | 5/3 / 10.00 / 200.0% | 9.50 |
| Sedgefield | 33/5 / -6.50 / -19.7% | 33/5 / -6.63 / -20.1% | -0.13 | 27/5 / -4.84 / -17.9% | 27/2 / -15.00 / -55.6% | -10.16 | — | — | — |
| Southwell | 35/9 / 9.91 / 28.3% | 35/11 / 23.50 / 67.1% | 13.59 | 22/8 / 2.68 / 12.2% | 22/4 / -2.13 / -9.7% | -4.81 | 2/1 / 2.00 / 100.0% | 2/0 / -2.00 / -100.0% | -4.00 |
| Stratford | 32/9 / 10.13 / 31.6% | 32/4 / -14.40 / -45.0% | -24.52 | 36/8 / 2.96 / 8.2% | 36/10 / 7.38 / 20.5% | 4.42 | 3/0 / -3.00 / -100.0% | 3/0 / -3.00 / -100.0% | 0.00 |
| Uttoxeter | 55/13 / 13.82 / 25.1% | 55/5 / -10.25 / -18.6% | -24.07 | 38/7 / -7.42 / -19.5% | 38/5 / -3.25 / -8.6% | 4.18 | 5/0 / -5.00 / -100.0% | 5/1 / 2.00 / 40.0% | 7.00 |
| Warwick | 36/11 / 12.08 / 33.5% | 36/4 / -22.63 / -62.8% | -34.70 | 22/5 / -4.50 / -20.5% | 22/3 / -12.13 / -55.1% | -7.63 | 5/2 / 2.88 / 57.5% | 5/1 / 0.00 / 0.0% | -2.88 |
| Worcester | 37/6 / 5.25 / 14.2% | 37/1 / -30.00 / -81.1% | -35.25 | 40/7 / -7.13 / -17.8% | 40/3 / -22.00 / -55.0% | -14.88 | — | — | — |

## Paired form evidence among handicaps

| Pre-off variable | Period | Paired coverage | Mean T3 minus T2 | T3 stronger n | SP gap if T3 stronger | Others SP gap | Captured n if stronger / gap |
| --- | --- | --- | --- | --- | --- | --- | --- |
| or | 2025 | 1322/1322 | -1.15 | 580 | -57.28 | 81.94 | 0 / — |
| or | 2026 | 905/960 | -0.62 | 420 | -118.12 | 147.05 | 16 / -7.87 |
| or | November | 91/91 | -0.97 | 40 | 26.88 | -6.45 | 37 / 36.38 |
| latest | 2025 | 1313/1322 | -2.43 | 611 | 10.02 | 13.99 | 0 / — |
| latest | 2026 | 903/960 | -2.22 | 439 | -29.37 | 62.30 | 26 / -21.50 |
| latest | November | 91/91 | -0.68 | 48 | 13.30 | 7.13 | 47 / 3.80 |
| best | 2025 | 1281/1322 | -1.94 | 595 | 27.31 | 7.55 | 0 / — |
| best | 2026 | 888/960 | -2.09 | 427 | -57.25 | 111.27 | 23 / -24.58 |
| best | November | 90/91 | -0.53 | 42 | 20.88 | -10.45 | 39 / 18.88 |
| performance | 2025 | 1313/1322 | -2.61 | 618 | 5.72 | 18.28 | 0 / — |
| performance | 2026 | 903/960 | -2.78 | 427 | -25.79 | 58.72 | 27 / -15.25 |
| performance | November | 0/91 | — | 0 | — | — | 0 / — |
| recentWinRate | 2025 | 1321/1322 | -2.19 | 516 | -90.63 | 115.28 | 0 / — |
| recentWinRate | 2026 | 905/960 | -0.90 | 390 | -75.71 | 104.64 | 25 / -19.33 |
| recentWinRate | November | 0/91 | — | 0 | — | — | 0 / — |
| days | 2025 | 1321/1322 | 3.62 | 639 | 9.97 | 14.68 | 0 / — |
| days | 2026 | 905/960 | 3.14 | 405 | 9.69 | 19.24 | 25 / -14.96 |
| days | November | 0/91 | — | 0 | — | — | 0 / — |

## Frozen probabilities and market preference

| Period | Market ordering basis | Handicap pairs | Mean p T2 / T3 | Mean logit gap | T3 shorter n | T3 shorter cap £ gap | T3 shorter SP £ gap | Same or longer n | Same or longer cap £ gap | Same or longer SP £ gap |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2025 | spPL | 1322 | 18.6% / 15.4% | 0.181 | 525 | — | 119.70 | 797 | — | -95.05 |
| 2026 | spPL | 960 | 19.3% / 15.8% | 0.193 | 385 | — | -76.94 | 575 | — | 126.92 |
| 2026 | capPL | 84 | 21.1% / 16.8% | 0.217 | 33 | -15.95 | -10.88 | 51 | -3.26 | -2.21 |
| November | spPL | 91 | 18.2% / 15.5% | 0.154 | 39 | — | -6.13 | 52 | — | 26.55 |
| November | capPL | 83 | 18.5% / 15.8% | 0.149 | 31 | 6.26 | 5.88 | 52 | 3.29 | 2.93 |

## Fixed candidates against T2

| Policy | Period | Basis | Opportunities | Switches | T2 bets/W / £ / ROI | Policy bets/W / £ / ROI | W gained / missed | Affected T2 £ | Affected T3 £ | Gain £ | Gain omit largest T3 winning race £ | Gain omit best difference day £ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A T3 all handicaps | 2025 | spPL | 1677 | 1322 | 1677/333 / -129.73 / -7.7% | 1677/309 / -105.08 / -6.3% | 237 / 261 | -64.13 | -39.47 | 24.65 | -1.35 | -15.68 |
| A T3 all handicaps | 2026 | spPL | 1211 | 960 | 1211/230 / -192.29 / -15.9% | 1211/209 / -142.31 / -11.8% | 150 / 171 | -187.51 | -137.53 | 49.99 | 26.99 | 22.15 |
| A T3 all handicaps | 2026 | capPL | 104 | 84 | 104/22 / -15.03 / -14.5% | 104/16 / -34.24 / -32.9% | 12 / 18 | -11.41 | -30.62 | -19.21 | -26.71 | -26.71 |
| A T3 all handicaps | 2026 | quotedSP | 104 | 84 | 104/22 / -13.92 / -13.4% | 104/16 / -27.00 / -26.0% | 12 / 18 | -9.29 | -22.38 | -13.08 | -22.08 | -22.58 |
| A T3 all handicaps | November | spPL | 121 | 91 | 121/26 / -12.45 / -10.3% | 121/28 / 7.97 / 6.6% | 20 / 18 | -11.55 | 8.88 | 20.42 | 10.42 | 5.42 |
| A T3 all handicaps | November | capPL | 110 | 83 | 110/26 / 6.59 / 6.0% | 110/26 / 16.14 / 14.7% | 18 / 18 | -2.79 | 6.76 | 9.55 | 1.55 | -4.95 |
| A T3 all handicaps | November | quotedSP | 110 | 83 | 110/26 / -1.45 / -1.3% | 110/26 / 7.35 / 6.7% | 18 / 18 | -3.55 | 5.25 | 8.80 | -1.20 | -6.20 |
| B T3 short handicaps | 2025 | spPL | 1677 | 297 | 1677/333 / -129.73 / -7.7% | 1677/331 / -79.69 / -4.8% | 60 / 62 | -37.88 | 12.16 | 50.04 | 31.04 | 31.04 |
| B T3 short handicaps | 2026 | spPL | 1211 | 201 | 1211/230 / -192.29 / -15.9% | 1211/222 / -185.52 / -15.3% | 30 / 38 | -60.47 | -53.70 | 6.77 | -10.23 | -10.23 |
| B T3 short handicaps | 2026 | capPL | 104 | 18 | 104/22 / -15.03 / -14.5% | 104/19 / -24.49 / -23.5% | 3 / 6 | 4.71 | -4.75 | -9.46 | -16.96 | -16.96 |
| B T3 short handicaps | 2026 | quotedSP | 104 | 18 | 104/22 / -13.92 / -13.4% | 104/19 / -24.92 / -24.0% | 3 / 6 | 6.75 | -4.25 | -11.00 | -17.00 | -17.00 |
| B T3 short handicaps | November | spPL | 121 | 20 | 121/26 / -12.45 / -10.3% | 121/29 / 9.67 / 8.0% | 6 / 3 | -12.38 | 9.75 | 22.13 | 15.13 | 15.13 |
| B T3 short handicaps | November | capPL | 110 | 20 | 110/26 / 6.59 / 6.0% | 110/29 / 25.34 / 23.0% | 6 / 3 | -12.37 | 6.38 | 18.75 | 12.25 | 12.25 |
| B T3 short handicaps | November | quotedSP | 110 | 20 | 110/26 / -1.45 / -1.3% | 110/29 / 20.67 / 18.8% | 6 / 3 | -12.38 | 9.75 | 22.13 | 15.13 | 15.13 |
| C T3 Class 4–6 handicaps | 2025 | spPL | 1677 | 753 | 1677/333 / -129.73 / -7.7% | 1677/326 / -89.96 / -5.4% | 141 / 148 | -66.57 | -26.81 | 39.76 | 13.76 | 13.76 |
| C T3 Class 4–6 handicaps | 2026 | spPL | 1211 | 557 | 1211/230 / -192.29 / -15.9% | 1211/229 / -115.31 / -9.5% | 99 / 100 | -88.25 | -11.27 | 76.99 | 53.99 | 50.15 |
| C T3 Class 4–6 handicaps | 2026 | capPL | 104 | 52 | 104/22 / -15.03 / -14.5% | 104/22 / -4.74 / -4.6% | 10 / 10 | -14.66 | -4.37 | 10.29 | 2.79 | 2.79 |
| C T3 Class 4–6 handicaps | 2026 | quotedSP | 104 | 52 | 104/22 / -13.92 / -13.4% | 104/22 / 0.96 / 0.9% | 10 / 10 | -12.00 | 2.88 | 14.88 | 5.88 | 5.88 |
| C T3 Class 4–6 handicaps | November | spPL | 121 | 50 | 121/26 / -12.45 / -10.3% | 121/29 / 5.97 / 4.9% | 14 / 11 | 0.57 | 19.00 | 18.42 | 8.42 | 8.42 |
| C T3 Class 4–6 handicaps | November | capPL | 110 | 46 | 110/26 / 6.59 / 6.0% | 110/27 / 15.01 / 13.6% | 12 / 11 | 6.46 | 14.88 | 8.42 | 0.42 | 0.42 |
| C T3 Class 4–6 handicaps | November | quotedSP | 110 | 46 | 110/26 / -1.45 / -1.3% | 110/27 / 5.35 / 4.9% | 12 / 11 | 4.57 | 11.38 | 6.80 | -3.20 | -3.20 |

## Known decision opportunities including November refunds

| Policy | Basis | Eligible | Switches | T2 stakes / W / £ | Policy stakes / W / £ | Gain £ | Wins gained / missed |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A T3 all handicaps | spPL | 140 | 102 | 129 / 28 / -4.95 | 130 / 30 / 6.97 | 11.92 | 22 / 20 |
| A T3 all handicaps | capPL | 125 | 91 | 115 / 26 / 1.59 | 119 / 28 / 17.64 | 16.05 | 20 / 18 |
| B T3 short handicaps | spPL | 140 | 21 | 129 / 28 / -4.95 | 130 / 32 / 21.67 | 26.63 | 7 / 3 |
| B T3 short handicaps | capPL | 125 | 21 | 115 / 26 / 1.59 | 116 / 30 / 26.84 | 25.25 | 7 / 3 |
| C T3 Class 4–6 handicaps | spPL | 140 | 55 | 129 / 28 / -4.95 | 132 / 33 / 18.47 | 23.42 | 16 / 11 |
| C T3 Class 4–6 handicaps | capPL | 125 | 51 | 115 / 26 / 1.59 | 118 / 29 / 17.51 | 15.92 | 14 / 11 |

## Named winner concentration

| Period | Basis | Rank | Largest net tickets (date course, decimal, £) | Top two gross share | T3–T2 gap omit top T3 winning race £ |
| --- | --- | --- | --- | --- | --- |
| 2025 | spPL | 2 | 2025-04-11 Fontwell Jack Sparrow Grey 23.00 (22.00), 2025-06-29 Uttoxeter Only The Bold 19.00 (18.00), 2025-02-25 Catterick Sean Og 17.00 (16.00) | 3.3% | — |
| 2025 | spPL | 3 | 2025-01-24 Doncaster Harjo 26.00 (25.00), 2025-07-25 Uttoxeter Eightytwo Team 21.00 (20.00), 2025-01-27 Plumpton Miss Fedora 19.00 (18.00) | 3.7% | -1.35 |
| 2026 | spPL | 2 | 2026-07-02 Perth Button Rock 29.00 (28.00), 2026-01-22 Huntingdon Where's Cato 21.00 (20.00), 2026-05-25 Huntingdon Uncle Al 15.00 (14.00) | 6.5% | — |
| 2026 | spPL | 3 | 2026-05-02 Hexham Scairp Dubh 23.00 (22.00), 2026-06-08 Roscommon Kilkee Bay 21.00 (20.00), 2026-03-25 Hereford Quinta Brigada 17.00 (16.00) | 5.3% | 26.99 |
| 2026 | capPL | 2 | 2026-10-14 Ffos Las Torneo 6.00 (5.00), 2026-10-11 Cork Birdie Or Bust 5.50 (4.50), 2026-10-13 Southwell Palamon 5.50 (4.50) | 15.8% | — |
| 2026 | capPL | 3 | 2026-10-13 Southwell Mumford's Magic 7.50 (6.50), 2026-10-17 Stratford 7.50 (6.50), 2026-09-24 Perth Upfordebate 7.00 (6.00) | 28.1% | -26.71 |
| November | spPL | 2 | 2026-11-20 Catterick Jet Of Dreams 13.00 (12.00), 2026-11-07 Aintree Josh The Boss 7.50 (6.50), 2026-11-18 Ffos Las Cote D'ange 6.50 (5.50) | 25.8% | — |
| November | spPL | 3 | 2026-11-07 Kelso Burning It Up 10.00 (9.00), 2026-11-06 Hexham Defence Witness 9.00 (8.00), 2026-11-15 Fontwell Livin On Luco 8.50 (7.50) | 19.0% | 10.42 |
| November | capPL | 2 | 2026-11-20 Catterick Jet Of Dreams 13.00 (12.00), 2026-11-23 Bangor-on-Dee Top Guy 8.50 (7.50), 2026-11-07 Aintree Josh The Boss 7.00 (6.00) | 26.8% | — |
| November | capPL | 3 | 2026-11-07 Kelso Burning It Up 8.00 (7.00), 2026-11-09 Carlisle Kientzheim 8.00 (7.00), 2026-11-15 Fontwell Livin On Luco 8.00 (7.00) | 17.8% | 1.55 |

## Historical calendar and course sensitivity

| Policy | Year | Jan–14 Oct triggers | Jan–14 Oct SP gain £ | Full period trigger courses | Most favourable course and gain £ | Gain excluding that course £ | First–last quoted trigger |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A T3 all handicaps | 2025 | 921 | 19.60 | 61 | Ascot 35.33 | -10.68 | — |
| A T3 all handicaps | 2026 | 905 | 28.93 | 61 | Hexham 45.23 | 4.76 | 2026-09-09–2026-10-29 |
| A T3 all handicaps | November | — | — | 35 | Hexham 14.75 | 5.67 | 2026-11-05–2026-11-26 |
| B T3 short handicaps | 2025 | 212 | 20.99 | 59 | Ascot 28.50 | 21.54 | — |
| B T3 short handicaps | 2026 | 190 | -4.73 | 56 | Hereford 17.00 | -10.23 | 2026-09-09–2026-10-27 |
| B T3 short handicaps | November | — | — | 15 | Uttoxeter 7.00 | 15.13 | 2026-11-05–2026-11-25 |
| C T3 Class 4–6 handicaps | 2025 | 537 | 86.75 | 39 | Hereford 26.49 | 13.27 | — |
| C T3 Class 4–6 handicaps | 2026 | 526 | 55.68 | 38 | Hexham 45.23 | 31.76 | 2026-09-09–2026-10-29 |
| C T3 Class 4–6 handicaps | November | — | — | 22 | Hexham 11.50 | 6.92 | 2026-11-05–2026-11-25 |

## Recommended rule winning returns

| Period | Basis | Races | T2 avg winning decimal | T3 avg winning decimal | T2 11+ bets/W/£ | T3 11+ bets/W/£ | Largest T3 winners |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2025 | spPL | 753 | 4.64 | 5.15 | 84/8/39.00 | 146/5/-56.00 | 2025-01-24 Doncaster Harjo 26.00 (25.00), 2025-07-25 Uttoxeter Eightytwo Team 21.00 (20.00), 2025-01-27 Plumpton Miss Fedora 19.00 (18.00) |
| 2026 | spPL | 557 | 4.69 | 5.51 | 69/8/57.00 | 103/9/19.00 | 2026-05-02 Hexham Scairp Dubh 23.00 (22.00), 2026-03-25 Hereford Quinta Brigada 17.00 (16.00), 2026-03-14 Uttoxeter Jasmin De Cotte 13.00 (12.00) |
| 2026 | capPL | 52 | 3.73 | 4.76 | 3/0/-3.00 | 6/0/-6.00 | 2026-10-13 Southwell Mumford's Magic 7.50 (6.50), 2026-10-17 Stratford  7.50 (6.50), 2026-09-24 Perth Upfordebate 7.00 (6.00) |
| November | spPL | 50 | 4.60 | 4.93 | 9/1/4.00 | 4/0/-4.00 | 2026-11-07 Kelso Burning It Up 10.00 (9.00), 2026-11-06 Hexham Defence Witness 9.00 (8.00), 2026-11-16 Plumpton Clap Of Thunder 5.50 (4.50) |
| November | capPL | 46 | 4.77 | 5.07 | 4/1/9.00 | 2/0/-2.00 | 2026-11-07 Kelso Burning It Up 8.00 (7.00), 2026-11-09 Carlisle Kientzheim 8.00 (7.00), 2026-11-05 Plumpton Diplomatic Ash 6.50 (5.50) |
