# Tissue 2 profitability challenge comparison tables

[Phase 2 report and rule definitions](tissue-profitability-phase-2-2026-11-26.md)

`capPL` is captured bookmaker P/L and `spPL` is final SP P/L. All stakes are £1 win. All excludes Turf. Main and chronology tables use the same settled, complete-book opportunities for every policy. The largest-winner sensitivity removes that winning ticket and its £1 stake. Largest-winner share uses gross returns. Switched outcomes compare net £1 P/L for the same race, treating a refunded ticket as zero. Outsiders have decimal odds of 11.00 or more on the corresponding basis.

Frozen generation ledger SHA-256 `35a95d3976035f0b1ab6b5629d9df74bd90ed702fb379f610cdc56ed1e7d7545`. AW Profit V1 ledger SHA-256 `e4cc4bca41622dd31890876e8fa1dd1838268b35607de4fff669b89217c6d932`. Phase 1's matched final-result archive and frozen runner settlement calculations supply the runner-level P/L used here. V1 replays use the repository's frozen numeric extraction, competition ranking and existing V1 selector.

## Main matched comparison

| Cohort | Basis | Policy | Eligible | Abstain | Refund | Bets | W | Strike | £ P/L | ROI | Mean winning odds | Coverage | £ per opportunity | £ excluding largest winner | Largest winner share of gross |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| All | capPL | T2 | 528 | 0 | 23 | 505 | 111 | 22.0% | 0.25 | 0.0% | 4.55 | 95.6% | 0.00 | -17.75 | 3.8% |
| All | capPL | A1 Break-even | 528 | 301 | 13 | 214 | 20 | 9.3% | -36.71 | -17.2% | 8.86 | 40.5% | -0.07 | -54.71 | 10.7% |
| All | capPL | A2 Market top three | 528 | 202 | 12 | 314 | 93 | 29.6% | 14.75 | 4.7% | 3.53 | 59.5% | 0.03 | 6.75 | 2.7% |
| All | capPL | B T3 speed and price | 528 | 0 | 25 | 503 | 94 | 18.7% | -50.85 | -10.1% | 4.81 | 95.3% | -0.10 | -78.85 | 6.4% |
| All | spPL | T2 | 528 | 0 | 23 | 505 | 111 | 22.0% | 4.91 | 1.0% | 4.59 | 95.6% | 0.01 | -13.09 | 3.7% |
| All | spPL | A1 Break-even | 528 | 301 | 13 | 214 | 20 | 9.3% | -57.80 | -27.0% | 7.81 | 40.5% | -0.11 | -75.80 | 12.2% |
| All | spPL | A2 Market top three | 528 | 202 | 12 | 314 | 93 | 29.6% | 3.41 | 1.1% | 3.41 | 59.5% | 0.01 | -3.09 | 2.4% |
| All | spPL | B T3 speed and price | 528 | 0 | 25 | 503 | 94 | 18.7% | -30.74 | -6.1% | 5.02 | 95.3% | -0.06 | -63.74 | 7.2% |
| AW | capPL | T2 | 200 | 0 | 4 | 196 | 41 | 20.9% | -2.92 | -1.5% | 4.71 | 98.0% | -0.01 | -13.92 | 6.2% |
| AW | capPL | A1 Break-even | 200 | 113 | 2 | 85 | 6 | 7.1% | -32.17 | -37.8% | 8.80 | 42.5% | -0.16 | -43.17 | 22.7% |
| AW | capPL | A2 Market top three | 200 | 88 | 2 | 110 | 34 | 30.9% | 22.58 | 20.5% | 3.90 | 55.0% | 0.11 | 14.58 | 6.8% |
| AW | capPL | B T3 speed and price | 200 | 0 | 5 | 195 | 40 | 20.5% | -6.25 | -3.2% | 4.72 | 97.5% | -0.03 | -17.25 | 6.4% |
| AW | capPL | C AW Profit V1 | 200 | 44 | 3 | 153 | 41 | 26.8% | 40.39 | 26.4% | 4.72 | 76.5% | 0.20 | 7.39 | 17.6% |
| AW | spPL | T2 | 200 | 0 | 4 | 196 | 41 | 20.9% | 14.54 | 7.4% | 5.14 | 98.0% | 0.07 | -3.46 | 9.0% |
| AW | spPL | A1 Break-even | 200 | 113 | 2 | 85 | 6 | 7.1% | -34.50 | -40.6% | 8.42 | 42.5% | -0.17 | -44.50 | 21.8% |
| AW | spPL | A2 Market top three | 200 | 88 | 2 | 110 | 34 | 30.9% | 18.54 | 16.9% | 3.78 | 55.0% | 0.09 | 12.04 | 5.8% |
| AW | spPL | B T3 speed and price | 200 | 0 | 5 | 195 | 40 | 20.5% | 11.20 | 5.7% | 5.16 | 97.5% | 0.06 | -6.80 | 9.2% |
| AW | spPL | C AW Profit V1 | 200 | 44 | 3 | 153 | 41 | 26.8% | 53.91 | 35.2% | 5.05 | 76.5% | 0.27 | 25.91 | 14.0% |
| HURDLE | capPL | T2 | 205 | 0 | 9 | 196 | 45 | 23.0% | 2.83 | 1.4% | 4.42 | 95.6% | 0.01 | -15.17 | 9.6% |
| HURDLE | capPL | A1 Break-even | 205 | 119 | 6 | 80 | 8 | 10.0% | -1.17 | -1.5% | 9.85 | 39.0% | -0.01 | -19.17 | 24.1% |
| HURDLE | capPL | A2 Market top three | 205 | 78 | 3 | 124 | 38 | 30.6% | -3.67 | -3.0% | 3.17 | 60.5% | -0.02 | -10.17 | 6.2% |
| HURDLE | capPL | B T3 speed and price | 205 | 0 | 10 | 195 | 34 | 17.4% | -21.44 | -11.0% | 5.10 | 95.1% | -0.10 | -49.44 | 16.7% |
| HURDLE | spPL | T2 | 205 | 0 | 9 | 196 | 45 | 23.0% | -2.18 | -1.1% | 4.31 | 95.6% | -0.01 | -20.18 | 9.8% |
| HURDLE | spPL | A1 Break-even | 205 | 119 | 6 | 80 | 8 | 10.0% | -10.40 | -13.0% | 8.70 | 39.0% | -0.05 | -28.40 | 27.3% |
| HURDLE | spPL | A2 Market top three | 205 | 78 | 3 | 124 | 38 | 30.6% | -8.18 | -6.6% | 3.05 | 60.5% | -0.04 | -14.18 | 6.0% |
| HURDLE | spPL | B T3 speed and price | 205 | 0 | 10 | 195 | 34 | 17.4% | -17.27 | -8.9% | 5.23 | 95.1% | -0.08 | -50.27 | 19.1% |
| CHASE | capPL | T2 | 123 | 0 | 10 | 113 | 25 | 22.1% | 0.34 | 0.3% | 4.53 | 91.9% | 0.00 | -11.66 | 11.5% |
| CHASE | capPL | A1 Break-even | 123 | 69 | 5 | 49 | 6 | 12.2% | -3.37 | -6.9% | 7.60 | 39.8% | -0.03 | -15.37 | 28.5% |
| CHASE | capPL | A2 Market top three | 123 | 36 | 7 | 80 | 21 | 26.3% | -4.16 | -5.2% | 3.61 | 65.0% | -0.03 | -10.16 | 9.2% |
| CHASE | capPL | B T3 speed and price | 123 | 0 | 10 | 113 | 20 | 17.7% | -23.16 | -20.5% | 4.49 | 91.9% | -0.19 | -35.16 | 14.5% |
| CHASE | spPL | T2 | 123 | 0 | 10 | 113 | 25 | 22.1% | -7.45 | -6.6% | 4.22 | 91.9% | -0.06 | -19.45 | 12.3% |
| CHASE | spPL | A1 Break-even | 123 | 69 | 5 | 49 | 6 | 12.2% | -12.90 | -26.3% | 6.02 | 39.8% | -0.10 | -24.90 | 36.0% |
| CHASE | spPL | A2 Market top three | 123 | 36 | 7 | 80 | 21 | 26.3% | -6.95 | -8.7% | 3.48 | 65.0% | -0.06 | -13.45 | 10.3% |
| CHASE | spPL | B T3 speed and price | 123 | 0 | 10 | 113 | 20 | 17.7% | -24.68 | -21.8% | 4.42 | 91.9% | -0.20 | -36.67 | 14.7% |
| TURF | capPL | T2 | 7 | 0 | 0 | 7 | 1 | 14.3% | -4.12 | -58.9% | 2.88 | 100.0% | -0.59 | -6.00 | 100.0% |
| TURF | capPL | A1 Break-even | 7 | 5 | 0 | 2 | 0 | 0.0% | -2.00 | -100.0% | — | 28.6% | -0.29 | — | — |
| TURF | capPL | A2 Market top three | 7 | 4 | 0 | 3 | 1 | 33.3% | -0.12 | -4.0% | 2.88 | 42.9% | -0.02 | -2.00 | 100.0% |
| TURF | capPL | B T3 speed and price | 7 | 0 | 0 | 7 | 1 | 14.3% | -4.12 | -58.9% | 2.88 | 100.0% | -0.59 | -6.00 | 100.0% |
| TURF | spPL | T2 | 7 | 0 | 0 | 7 | 1 | 14.3% | -4.38 | -62.5% | 2.63 | 100.0% | -0.63 | -6.00 | 100.0% |
| TURF | spPL | A1 Break-even | 7 | 5 | 0 | 2 | 0 | 0.0% | -2.00 | -100.0% | — | 28.6% | -0.29 | — | — |
| TURF | spPL | A2 Market top three | 7 | 4 | 0 | 3 | 1 | 33.3% | -0.38 | -12.5% | 2.63 | 42.9% | -0.05 | -2.00 | 100.0% |
| TURF | spPL | B T3 speed and price | 7 | 0 | 0 | 7 | 1 | 14.3% | -4.38 | -62.5% | 2.63 | 100.0% | -0.63 | -6.00 | 100.0% |

## Chronological comparison

| Cohort | Basis | Policy | Eligible | Abstain | Refund | Bets | W | Strike | £ P/L | ROI | Mean winning odds | Coverage | £ per opportunity | £ excluding largest winner | Largest winner share of gross |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| All 5–15 Nov | capPL | T2 | 223 | 0 | 12 | 211 | 47 | 22.3% | -11.42 | -5.4% | 4.25 | 94.6% | -0.05 | -29.42 | 9.5% |
| All 5–15 Nov | capPL | A1 Break-even | 223 | 138 | 5 | 80 | 8 | 10.0% | -2.04 | -2.5% | 9.75 | 35.9% | -0.01 | -20.04 | 24.4% |
| All 5–15 Nov | capPL | A2 Market top three | 223 | 79 | 9 | 135 | 40 | 29.6% | -15.92 | -11.8% | 2.98 | 60.5% | -0.07 | -21.92 | 5.9% |
| All 5–15 Nov | capPL | B T3 speed and price | 223 | 0 | 12 | 211 | 42 | 19.9% | -15.98 | -7.6% | 4.64 | 94.6% | -0.07 | -43.98 | 14.9% |
| All 5–15 Nov | spPL | T2 | 223 | 0 | 12 | 211 | 47 | 22.3% | -2.48 | -1.2% | 4.44 | 94.6% | -0.01 | -20.48 | 9.1% |
| All 5–15 Nov | spPL | A1 Break-even | 223 | 138 | 5 | 80 | 8 | 10.0% | -5.40 | -6.8% | 9.32 | 35.9% | -0.02 | -23.40 | 25.5% |
| All 5–15 Nov | spPL | A2 Market top three | 223 | 79 | 9 | 135 | 40 | 29.6% | -13.48 | -10.0% | 3.04 | 60.5% | -0.06 | -19.98 | 6.2% |
| All 5–15 Nov | spPL | B T3 speed and price | 223 | 0 | 12 | 211 | 42 | 19.9% | 1.76 | 0.8% | 5.07 | 94.6% | 0.01 | -31.24 | 16.0% |
| AW 5–15 Nov | capPL | T2 | 48 | 0 | 0 | 48 | 14 | 29.2% | 11.24 | 23.4% | 4.23 | 100.0% | 0.23 | 1.24 | 18.6% |
| AW 5–15 Nov | capPL | A1 Break-even | 48 | 27 | 0 | 21 | 2 | 9.5% | -5.67 | -27.0% | 7.67 | 43.8% | -0.12 | -15.67 | 71.8% |
| AW 5–15 Nov | capPL | A2 Market top three | 48 | 22 | 0 | 26 | 12 | 46.2% | 14.24 | 54.8% | 3.35 | 54.2% | 0.30 | 9.74 | 13.7% |
| AW 5–15 Nov | capPL | B T3 speed and price | 48 | 0 | 0 | 48 | 14 | 29.2% | 11.24 | 23.4% | 4.23 | 100.0% | 0.23 | 1.24 | 18.6% |
| AW 5–15 Nov | capPL | C AW Profit V1 | 48 | 10 | 1 | 37 | 9 | 24.3% | 22.14 | 59.8% | 6.57 | 77.1% | 0.46 | -10.86 | 57.5% |
| AW 5–15 Nov | spPL | T2 | 48 | 0 | 0 | 48 | 14 | 29.2% | 23.60 | 49.2% | 5.11 | 100.0% | 0.49 | 7.60 | 23.7% |
| AW 5–15 Nov | spPL | A1 Break-even | 48 | 27 | 0 | 21 | 2 | 9.5% | -5.50 | -26.2% | 7.75 | 43.8% | -0.11 | -14.50 | 64.5% |
| AW 5–15 Nov | spPL | A2 Market top three | 48 | 22 | 0 | 26 | 12 | 46.2% | 18.60 | 71.5% | 3.72 | 54.2% | 0.39 | 12.10 | 16.8% |
| AW 5–15 Nov | spPL | B T3 speed and price | 48 | 0 | 0 | 48 | 14 | 29.2% | 23.60 | 49.2% | 5.11 | 100.0% | 0.49 | 7.60 | 23.7% |
| AW 5–15 Nov | spPL | C AW Profit V1 | 48 | 10 | 1 | 37 | 9 | 24.3% | 19.56 | 52.9% | 6.28 | 77.1% | 0.41 | -8.44 | 51.3% |
| HURDLE 5–15 Nov | capPL | T2 | 107 | 0 | 4 | 103 | 20 | 19.4% | -14.50 | -14.1% | 4.42 | 96.3% | -0.14 | -32.50 | 21.5% |
| HURDLE 5–15 Nov | capPL | A1 Break-even | 107 | 67 | 2 | 38 | 3 | 7.9% | 6.50 | 17.1% | 14.83 | 35.5% | 0.06 | -11.50 | 42.7% |
| HURDLE 5–15 Nov | capPL | A2 Market top three | 107 | 41 | 3 | 63 | 16 | 25.4% | -26.00 | -41.3% | 2.31 | 58.9% | -0.24 | -29.50 | 12.2% |
| HURDLE 5–15 Nov | capPL | B T3 speed and price | 107 | 0 | 4 | 103 | 15 | 14.6% | -14.56 | -14.1% | 5.90 | 96.3% | -0.14 | -42.56 | 32.8% |
| HURDLE 5–15 Nov | spPL | T2 | 107 | 0 | 4 | 103 | 20 | 19.4% | -14.63 | -14.2% | 4.42 | 96.3% | -0.14 | -32.63 | 21.5% |
| HURDLE 5–15 Nov | spPL | A1 Break-even | 107 | 67 | 2 | 38 | 3 | 7.9% | 8.00 | 21.1% | 15.33 | 35.5% | 0.07 | -10.00 | 41.3% |
| HURDLE 5–15 Nov | spPL | A2 Market top three | 107 | 41 | 3 | 63 | 16 | 25.4% | -25.13 | -39.9% | 2.37 | 58.9% | -0.23 | -28.46 | 11.4% |
| HURDLE 5–15 Nov | spPL | B T3 speed and price | 107 | 0 | 4 | 103 | 15 | 14.6% | -11.66 | -11.3% | 6.09 | 96.3% | -0.11 | -44.66 | 37.2% |
| CHASE 5–15 Nov | capPL | T2 | 68 | 0 | 8 | 60 | 13 | 21.7% | -8.16 | -13.6% | 3.99 | 88.2% | -0.12 | -17.16 | 19.3% |
| CHASE 5–15 Nov | capPL | A1 Break-even | 68 | 44 | 3 | 21 | 3 | 14.3% | -2.87 | -13.7% | 6.04 | 30.9% | -0.04 | -11.87 | 55.2% |
| CHASE 5–15 Nov | capPL | A2 Market top three | 68 | 16 | 6 | 46 | 12 | 26.1% | -4.16 | -9.0% | 3.49 | 67.6% | -0.06 | -10.16 | 16.7% |
| CHASE 5–15 Nov | capPL | B T3 speed and price | 68 | 0 | 8 | 60 | 13 | 21.7% | -12.66 | -21.1% | 3.64 | 88.2% | -0.19 | -18.66 | 14.8% |
| CHASE 5–15 Nov | spPL | T2 | 68 | 0 | 8 | 60 | 13 | 21.7% | -11.45 | -19.1% | 3.73 | 88.2% | -0.17 | -19.95 | 19.6% |
| CHASE 5–15 Nov | spPL | A1 Break-even | 68 | 44 | 3 | 21 | 3 | 14.3% | -7.90 | -37.6% | 4.37 | 30.9% | -0.12 | -16.40 | 72.5% |
| CHASE 5–15 Nov | spPL | A2 Market top three | 68 | 16 | 6 | 46 | 12 | 26.1% | -6.95 | -15.1% | 3.25 | 67.6% | -0.10 | -13.45 | 19.2% |
| CHASE 5–15 Nov | spPL | B T3 speed and price | 68 | 0 | 8 | 60 | 13 | 21.7% | -10.18 | -17.0% | 3.83 | 88.2% | -0.15 | -16.68 | 15.1% |
| All 16–25 Nov | capPL | T2 | 305 | 0 | 11 | 294 | 64 | 21.8% | 11.67 | 4.0% | 4.78 | 96.4% | 0.04 | -0.33 | 4.3% |
| All 16–25 Nov | capPL | A1 Break-even | 305 | 163 | 8 | 134 | 12 | 9.0% | -34.67 | -25.9% | 8.28 | 43.9% | -0.11 | -46.67 | 13.1% |
| All 16–25 Nov | capPL | A2 Market top three | 305 | 123 | 3 | 179 | 53 | 29.6% | 30.67 | 17.1% | 3.96 | 58.7% | 0.10 | 22.67 | 4.3% |
| All 16–25 Nov | capPL | B T3 speed and price | 305 | 0 | 13 | 292 | 52 | 17.8% | -34.87 | -11.9% | 4.94 | 95.7% | -0.11 | -46.87 | 5.1% |
| All 16–25 Nov | spPL | T2 | 305 | 0 | 11 | 294 | 64 | 21.8% | 7.39 | 2.5% | 4.71 | 96.4% | 0.02 | -10.61 | 6.3% |
| All 16–25 Nov | spPL | A1 Break-even | 305 | 163 | 8 | 134 | 12 | 9.0% | -52.40 | -39.1% | 6.80 | 43.9% | -0.17 | -64.40 | 15.9% |
| All 16–25 Nov | spPL | A2 Market top three | 305 | 123 | 3 | 179 | 53 | 29.6% | 16.89 | 9.4% | 3.70 | 58.7% | 0.06 | 10.89 | 3.6% |
| All 16–25 Nov | spPL | B T3 speed and price | 305 | 0 | 13 | 292 | 52 | 17.8% | -32.51 | -11.1% | 4.99 | 95.7% | -0.11 | -50.51 | 7.3% |
| AW 16–25 Nov | capPL | T2 | 152 | 0 | 4 | 148 | 27 | 18.2% | -14.16 | -9.6% | 4.96 | 97.4% | -0.09 | -25.16 | 9.0% |
| AW 16–25 Nov | capPL | A1 Break-even | 152 | 86 | 2 | 64 | 4 | 6.3% | -26.50 | -41.4% | 9.38 | 42.1% | -0.17 | -37.50 | 32.0% |
| AW 16–25 Nov | capPL | A2 Market top three | 152 | 66 | 2 | 84 | 22 | 26.2% | 8.34 | 9.9% | 4.20 | 55.3% | 0.05 | 0.34 | 9.7% |
| AW 16–25 Nov | capPL | B T3 speed and price | 152 | 0 | 5 | 147 | 26 | 17.7% | -17.49 | -11.9% | 4.98 | 96.7% | -0.12 | -28.49 | 9.3% |
| AW 16–25 Nov | capPL | C AW Profit V1 | 152 | 34 | 2 | 116 | 32 | 27.6% | 18.25 | 15.7% | 4.20 | 76.3% | 0.12 | 9.25 | 7.4% |
| AW 16–25 Nov | spPL | T2 | 152 | 0 | 4 | 148 | 27 | 18.2% | -9.07 | -6.1% | 5.15 | 97.4% | -0.06 | -27.07 | 13.7% |
| AW 16–25 Nov | spPL | A1 Break-even | 152 | 86 | 2 | 64 | 4 | 6.3% | -29.00 | -45.3% | 8.75 | 42.1% | -0.19 | -39.00 | 31.4% |
| AW 16–25 Nov | spPL | A2 Market top three | 152 | 66 | 2 | 84 | 22 | 26.2% | -0.07 | -0.1% | 3.82 | 55.3% | -0.00 | -6.07 | 8.3% |
| AW 16–25 Nov | spPL | B T3 speed and price | 152 | 0 | 5 | 147 | 26 | 17.7% | -12.40 | -8.4% | 5.18 | 96.7% | -0.08 | -30.40 | 14.1% |
| AW 16–25 Nov | spPL | C AW Profit V1 | 152 | 34 | 2 | 116 | 32 | 27.6% | 34.35 | 29.6% | 4.70 | 76.3% | 0.23 | 16.35 | 12.6% |
| HURDLE 16–25 Nov | capPL | T2 | 98 | 0 | 5 | 93 | 25 | 26.9% | 17.33 | 18.6% | 4.41 | 94.9% | 0.18 | 7.33 | 10.0% |
| HURDLE 16–25 Nov | capPL | A1 Break-even | 98 | 52 | 4 | 42 | 5 | 11.9% | -7.67 | -18.3% | 6.87 | 42.9% | -0.08 | -17.67 | 32.0% |
| HURDLE 16–25 Nov | capPL | A2 Market top three | 98 | 37 | 0 | 61 | 22 | 36.1% | 22.33 | 36.6% | 3.79 | 62.2% | 0.23 | 15.83 | 9.0% |
| HURDLE 16–25 Nov | capPL | B T3 speed and price | 98 | 0 | 6 | 92 | 19 | 20.7% | -6.88 | -7.5% | 4.48 | 93.9% | -0.07 | -16.88 | 12.9% |
| HURDLE 16–25 Nov | spPL | T2 | 98 | 0 | 5 | 93 | 25 | 26.9% | 12.45 | 13.4% | 4.22 | 94.9% | 0.13 | 0.45 | 12.3% |
| HURDLE 16–25 Nov | spPL | A1 Break-even | 98 | 52 | 4 | 42 | 5 | 11.9% | -18.40 | -43.8% | 4.72 | 42.9% | -0.19 | -26.40 | 38.1% |
| HURDLE 16–25 Nov | spPL | A2 Market top three | 98 | 37 | 0 | 61 | 22 | 36.1% | 16.95 | 27.8% | 3.54 | 62.2% | 0.17 | 10.95 | 9.0% |
| HURDLE 16–25 Nov | spPL | B T3 speed and price | 98 | 0 | 6 | 92 | 19 | 20.7% | -5.61 | -6.1% | 4.55 | 93.9% | -0.06 | -17.61 | 15.0% |
| CHASE 16–25 Nov | capPL | T2 | 55 | 0 | 2 | 53 | 12 | 22.6% | 8.50 | 16.0% | 5.13 | 96.4% | 0.15 | -3.50 | 21.1% |
| CHASE 16–25 Nov | capPL | A1 Break-even | 55 | 25 | 2 | 28 | 3 | 10.7% | -0.50 | -1.8% | 9.17 | 50.9% | -0.01 | -12.50 | 47.3% |
| CHASE 16–25 Nov | capPL | A2 Market top three | 55 | 20 | 1 | 34 | 9 | 26.5% | 0.00 | 0.0% | 3.78 | 61.8% | 0.00 | -5.50 | 19.1% |
| CHASE 16–25 Nov | capPL | B T3 speed and price | 55 | 0 | 2 | 53 | 7 | 13.2% | -10.50 | -19.8% | 6.07 | 96.4% | -0.19 | -22.50 | 30.6% |
| CHASE 16–25 Nov | spPL | T2 | 55 | 0 | 2 | 53 | 12 | 22.6% | 4.00 | 7.5% | 4.75 | 96.4% | 0.07 | -8.00 | 22.8% |
| CHASE 16–25 Nov | spPL | A1 Break-even | 55 | 25 | 2 | 28 | 3 | 10.7% | -5.00 | -17.9% | 7.67 | 50.9% | -0.09 | -17.00 | 56.5% |
| CHASE 16–25 Nov | spPL | A2 Market top three | 55 | 20 | 1 | 34 | 9 | 26.5% | 0.00 | 0.0% | 3.78 | 61.8% | 0.00 | -5.50 | 19.1% |
| CHASE 16–25 Nov | spPL | B T3 speed and price | 55 | 0 | 2 | 53 | 7 | 13.2% | -14.50 | -27.4% | 5.50 | 96.4% | -0.26 | -26.50 | 33.8% |

## Full settled benchmark and AW V1 at SP

| Cohort | Basis | Policy | Eligible | Abstain | Refund | Bets | W | Strike | £ P/L | ROI | Mean winning odds | Coverage | £ per opportunity | £ excluding largest winner | Largest winner share of gross |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| All | spPL | T2 | 584 | 0 | 25 | 559 | 120 | 21.5% | -14.76 | -2.6% | 4.54 | 95.7% | -0.03 | -32.76 | 3.5% |
| AW | spPL | T2 | 212 | 0 | 4 | 208 | 42 | 20.2% | 3.87 | 1.9% | 5.04 | 98.1% | 0.02 | -14.13 | 9.0% |
| AW | spPL | C AW Profit V1 | 212 | 49 | 3 | 160 | 44 | 27.5% | 52.37 | 32.7% | 4.83 | 75.5% | 0.25 | 24.37 | 13.7% |
| HURDLE | spPL | T2 | 234 | 0 | 10 | 224 | 51 | 22.8% | -12.68 | -5.7% | 4.14 | 95.7% | -0.05 | -30.68 | 9.0% |
| CHASE | spPL | T2 | 138 | 0 | 11 | 127 | 27 | 21.3% | -5.95 | -4.7% | 4.48 | 92.0% | -0.04 | -17.95 | 10.7% |
| TURF | spPL | T2 | 8 | 0 | 0 | 8 | 1 | 12.5% | -5.38 | -67.2% | 2.63 | 100.0% | -0.67 | -7.00 | 100.0% |

## Abstention cost

| Family | Basis | Rule | Abstentions | T2 bets omitted | T2 winners missed | T2 losing bets omitted | Omitted T2 £ | Whole rule £ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| All | capPL | A1 Break-even | 301 | 291 | 91 | 200 | 36.96 | -36.71 |
| All | capPL | A2 Market top three | 202 | 191 | 18 | 173 | -14.50 | 14.75 |
| All | spPL | A1 Break-even | 301 | 291 | 91 | 200 | 62.71 | -57.80 |
| All | spPL | A2 Market top three | 202 | 191 | 18 | 173 | 1.50 | 3.41 |
| AW | capPL | A1 Break-even | 113 | 111 | 35 | 76 | 29.25 | -32.17 |
| AW | capPL | A2 Market top three | 88 | 86 | 7 | 79 | -25.50 | 22.58 |
| AW | capPL | C AW Profit V1 | 44 | 44 | 8 | 36 | -3.00 | 40.39 |
| AW | spPL | A1 Break-even | 113 | 111 | 35 | 76 | 49.04 | -34.50 |
| AW | spPL | A2 Market top three | 88 | 86 | 7 | 79 | -4.00 | 18.54 |
| AW | spPL | C AW Profit V1 | 44 | 44 | 8 | 36 | -6.28 | 53.91 |
| HURDLE | capPL | A1 Break-even | 119 | 116 | 37 | 79 | 4.00 | -1.17 |
| HURDLE | capPL | A2 Market top three | 78 | 72 | 7 | 65 | 6.50 | -3.67 |
| HURDLE | spPL | A1 Break-even | 119 | 116 | 37 | 79 | 8.22 | -10.40 |
| HURDLE | spPL | A2 Market top three | 78 | 72 | 7 | 65 | 6.00 | -8.18 |
| CHASE | capPL | A1 Break-even | 69 | 64 | 19 | 45 | 3.71 | -3.37 |
| CHASE | capPL | A2 Market top three | 36 | 33 | 4 | 29 | 4.50 | -4.16 |
| CHASE | spPL | A1 Break-even | 69 | 64 | 19 | 45 | 5.45 | -12.90 |
| CHASE | spPL | A2 Market top three | 36 | 33 | 4 | 29 | -0.50 | -6.95 |

## Substitution attribution

| Family | Basis | Rule | Changes | Improved | Worsened | Tied | Substitute bets / W | Substitute £ | Original T2 £ on changes | Switch increment £ | Whole policy £ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| All | capPL | B T3 speed and price | 69 | 8 | 23 | 38 | 63 / 3 | -23.00 | 28.10 | -51.10 | -50.85 |
| All | spPL | B T3 speed and price | 69 | 8 | 23 | 38 | 63 / 3 | -17.00 | 18.65 | -35.65 | -30.74 |
| AW | capPL | B T3 speed and price | 7 | 1 | 1 | 5 | 6 / 0 | -6.00 | -2.67 | -3.33 | -6.25 |
| AW | capPL | C AW Profit V1 | 103 | 26 | 17 | 60 | 100 / 23 | 22.04 | -18.27 | 40.31 | 40.39 |
| AW | spPL | B T3 speed and price | 7 | 1 | 1 | 5 | 6 / 0 | -6.00 | -2.67 | -3.33 | 11.20 |
| AW | spPL | C AW Profit V1 | 103 | 26 | 17 | 60 | 100 / 23 | 21.49 | -11.61 | 33.10 | 53.91 |
| HURDLE | capPL | B T3 speed and price | 35 | 3 | 13 | 19 | 32 / 1 | -3.00 | 21.27 | -24.27 | -21.44 |
| HURDLE | spPL | B T3 speed and price | 35 | 3 | 13 | 19 | 32 / 1 | 2.00 | 17.09 | -15.09 | -17.27 |
| CHASE | capPL | B T3 speed and price | 27 | 4 | 9 | 14 | 25 / 2 | -14.00 | 9.50 | -23.50 | -23.16 |
| CHASE | spPL | B T3 speed and price | 27 | 4 | 9 | 14 | 25 / 2 | -13.00 | 4.22 | -17.22 | -24.68 |
| TURF | capPL | B T3 speed and price | 1 | 0 | 0 | 1 | 1 / 0 | -1.00 | -1.00 | 0.00 | -4.12 |
| TURF | spPL | B T3 speed and price | 1 | 0 | 0 | 1 | 1 / 0 | -1.00 | -1.00 | 0.00 | -4.38 |

## Outsiders and winning contributions

| Family | Basis | Policy | 11+ bets | 11+ losses | 11+ winners | 11+ £ | Largest winning tickets (decimal and net £) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| All | capPL | T2 | 94 | 88 | 6 | -11.00 | Rose Warrior 19.00 (18.00), Westin Pimpernel 17.00 (16.00), Jet Of Dreams 13.00 (12.00) |
| All | capPL | A1 Break-even | 93 | 87 | 6 | -10.00 | Rose Warrior 19.00 (18.00), Westin Pimpernel 17.00 (16.00), Jet Of Dreams 13.00 (12.00) |
| All | capPL | A2 Market top three | 5 | 5 | 0 | -5.00 | Lost Signal 9.00 (8.00), Thatsnotmyname 7.50 (6.50), Josh The Boss 7.00 (6.00) |
| All | capPL | B T3 speed and price | 111 | 105 | 6 | -18.00 | Masaccio 29.00 (28.00), Westin Pimpernel 17.00 (16.00), Jet Of Dreams 13.00 (12.00) |
| All | spPL | T2 | 124 | 116 | 8 | -5.00 | Rose Warrior 19.00 (18.00), Magna Gee Gee 19.00 (18.00), Leading Times 17.00 (16.00) |
| All | spPL | A1 Break-even | 107 | 102 | 5 | -37.00 | Rose Warrior 19.00 (18.00), Westin Pimpernel 15.00 (14.00), Jet Of Dreams 13.00 (12.00) |
| All | spPL | A2 Market top three | 13 | 13 | 0 | -13.00 | Josh The Boss 7.50 (6.50), Crown The Future 7.50 (6.50), Ala Et Prece 7.00 (6.00) |
| All | spPL | B T3 speed and price | 147 | 139 | 8 | -13.00 | Masaccio 34.00 (33.00), Magna Gee Gee 19.00 (18.00), Leading Times 17.00 (16.00) |
| AW | capPL | T2 | 45 | 43 | 2 | -22.00 | This Farh 12.00 (11.00), Xirivella 11.00 (10.00), Vallejo 9.00 (8.00) |
| AW | capPL | A1 Break-even | 45 | 43 | 2 | -22.00 | This Farh 12.00 (11.00), Xirivella 11.00 (10.00), Vallejo 9.00 (8.00) |
| AW | capPL | A2 Market top three | 1 | 1 | 0 | -1.00 | Lost Signal 9.00 (8.00), Ala Et Prece 7.00 (6.00), Two And Two 6.50 (5.50) |
| AW | capPL | B T3 speed and price | 45 | 43 | 2 | -22.00 | This Farh 12.00 (11.00), Xirivella 11.00 (10.00), Vallejo 9.00 (8.00) |
| AW | capPL | C AW Profit V1 | 15 | 14 | 1 | 19.00 | Berkshire Dream 34.00 (33.00), Because We Can 10.00 (9.00), Shangri La 9.00 (8.00) |
| AW | spPL | T2 | 58 | 55 | 3 | -11.00 | Magna Gee Gee 19.00 (18.00), Leading Times 17.00 (16.00), This Farh 11.00 (10.00) |
| AW | spPL | A1 Break-even | 52 | 51 | 1 | -41.00 | This Farh 11.00 (10.00), Xirivella 10.00 (9.00), Vallejo 10.00 (9.00) |
| AW | spPL | A2 Market top three | 2 | 2 | 0 | -2.00 | Crown The Future 7.50 (6.50), Ala Et Prece 7.00 (6.00), Kinetic Force 6.50 (5.50) |
| AW | spPL | B T3 speed and price | 61 | 58 | 3 | -14.00 | Magna Gee Gee 19.00 (18.00), Leading Times 17.00 (16.00), This Farh 11.00 (10.00) |
| AW | spPL | C AW Profit V1 | 20 | 16 | 4 | 54.00 | Berkshire Dream 29.00 (28.00), Magna Gee Gee 19.00 (18.00), Because We Can 15.00 (14.00) |
| HURDLE | capPL | T2 | 37 | 34 | 3 | 10.00 | Rose Warrior 19.00 (18.00), Westin Pimpernel 17.00 (16.00), Party Vibes 11.00 (10.00) |
| HURDLE | capPL | A1 Break-even | 36 | 33 | 3 | 11.00 | Rose Warrior 19.00 (18.00), Westin Pimpernel 17.00 (16.00), Party Vibes 11.00 (10.00) |
| HURDLE | capPL | A2 Market top three | 3 | 3 | 0 | -3.00 | Thatsnotmyname 7.50 (6.50), Thankyouforthedays 6.00 (5.00), Typhoon Warrior 5.50 (4.50) |
| HURDLE | capPL | B T3 speed and price | 47 | 44 | 3 | 10.00 | Masaccio 29.00 (28.00), Westin Pimpernel 17.00 (16.00), Party Vibes 11.00 (10.00) |
| HURDLE | spPL | T2 | 49 | 45 | 4 | 10.00 | Rose Warrior 19.00 (18.00), Westin Pimpernel 15.00 (14.00), Le Midnightdancer 13.00 (12.00) |
| HURDLE | spPL | A1 Break-even | 39 | 36 | 3 | 7.00 | Rose Warrior 19.00 (18.00), Westin Pimpernel 15.00 (14.00), Fasol 12.00 (11.00) |
| HURDLE | spPL | A2 Market top three | 9 | 9 | 0 | -9.00 | Moments In Time 7.00 (6.00), Darby O'gill 5.50 (4.50), Typhoon Warrior 5.50 (4.50) |
| HURDLE | spPL | B T3 speed and price | 64 | 60 | 4 | 10.00 | Masaccio 34.00 (33.00), Westin Pimpernel 15.00 (14.00), Le Midnightdancer 13.00 (12.00) |
| CHASE | capPL | T2 | 12 | 11 | 1 | 1.00 | Jet Of Dreams 13.00 (12.00), Getawhisky 10.00 (9.00), Top Guy 8.50 (7.50) |
| CHASE | capPL | A1 Break-even | 12 | 11 | 1 | 1.00 | Jet Of Dreams 13.00 (12.00), Getawhisky 10.00 (9.00), Top Guy 8.50 (7.50) |
| CHASE | capPL | A2 Market top three | 1 | 1 | 0 | -1.00 | Josh The Boss 7.00 (6.00), Echoing Silence 6.50 (5.50), Kappa Jy Pyke 5.50 (4.50) |
| CHASE | capPL | B T3 speed and price | 19 | 18 | 1 | -6.00 | Jet Of Dreams 13.00 (12.00), Top Guy 8.50 (7.50), Josh The Boss 7.00 (6.00) |
| CHASE | spPL | T2 | 17 | 16 | 1 | -4.00 | Jet Of Dreams 13.00 (12.00), Getawhisky 9.50 (8.50), Josh The Boss 7.50 (6.50) |
| CHASE | spPL | A1 Break-even | 16 | 15 | 1 | -3.00 | Jet Of Dreams 13.00 (12.00), Getawhisky 9.50 (8.50), Hard Dealt 5.50 (4.50) |
| CHASE | spPL | A2 Market top three | 2 | 2 | 0 | -2.00 | Josh The Boss 7.50 (6.50), Cote D'ange 6.50 (5.50), Montregard 6.00 (5.00) |
| CHASE | spPL | B T3 speed and price | 22 | 21 | 1 | -9.00 | Jet Of Dreams 13.00 (12.00), Josh The Boss 7.50 (6.50), Cheesy Icon 7.00 (6.00) |

## Recorded AW Profit V1 shadow comparisons

| Cohort | Basis | Policy | Eligible | Abstain | Refund | Bets | W | Strike | £ P/L | ROI | Mean winning odds | Coverage | £ per opportunity | £ excluding largest winner | Largest winner share of gross |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| AW Profit shadow complete | capPL | T2 | 71 | 0 | 4 | 67 | 10 | 14.9% | -5.50 | -8.2% | 6.15 | 94.4% | -0.08 | -16.50 | 19.5% |
| AW Profit shadow complete | capPL | C AW Profit V1 | 71 | 20 | 1 | 50 | 13 | 26.0% | 14.87 | 29.7% | 4.99 | 70.4% | 0.21 | 5.87 | 15.4% |
| AW Profit shadow complete | capPL | T1 | 71 | 0 | 1 | 70 | 10 | 14.3% | -27.89 | -39.8% | 4.21 | 98.6% | -0.39 | -36.89 | 23.7% |
| AW Profit shadow complete | spPL | T2 | 71 | 0 | 4 | 67 | 10 | 14.9% | 1.63 | 2.4% | 6.86 | 94.4% | 0.02 | -16.38 | 27.7% |
| AW Profit shadow complete | spPL | C AW Profit V1 | 71 | 20 | 1 | 50 | 13 | 26.0% | 29.63 | 59.3% | 6.13 | 70.4% | 0.42 | 11.63 | 23.9% |
| AW Profit shadow complete | spPL | T1 | 71 | 0 | 1 | 70 | 10 | 14.3% | -24.63 | -35.2% | 4.54 | 98.6% | -0.35 | -38.63 | 33.1% |

| Cohort | Basis | Policy | Eligible | Abstain | Refund | Bets | W | Strike | £ P/L | ROI | Mean winning odds | Coverage | £ per opportunity | £ excluding largest winner | Largest winner share of gross |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| AW Profit shadow paired active | capPL | T2 | 45 | 0 | 0 | 45 | 7 | 15.6% | -3.00 | -6.7% | 6.00 | 100.0% | -0.07 | -14.00 | 28.6% |
| AW Profit shadow paired active | capPL | C AW Profit V1 | 45 | 0 | 0 | 45 | 10 | 22.2% | -2.13 | -4.7% | 4.29 | 100.0% | -0.05 | -9.63 | 19.8% |
| AW Profit shadow paired active | capPL | T1 | 45 | 0 | 0 | 45 | 7 | 15.6% | -19.13 | -42.5% | 3.70 | 100.0% | -0.43 | -26.63 | 32.9% |
| AW Profit shadow paired active | spPL | T2 | 45 | 0 | 0 | 45 | 7 | 15.6% | 5.13 | 11.4% | 7.16 | 100.0% | 0.11 | -12.88 | 37.9% |
| AW Profit shadow paired active | spPL | C AW Profit V1 | 45 | 0 | 0 | 45 | 10 | 22.2% | 8.13 | 18.1% | 5.31 | 100.0% | 0.18 | -9.88 | 35.8% |
| AW Profit shadow paired active | spPL | T1 | 45 | 0 | 0 | 45 | 7 | 15.6% | -19.04 | -42.3% | 3.71 | 100.0% | -0.42 | -26.04 | 30.8% |

## AW Profit V1 by date and decision

| Date | Opportunities | V1 bets / wins | V1 captured £ | T2 captured £ | V1 SP £ | T2 SP £ |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-22 | 9 | 6 / 0 | -6.00 | 8.00 | -6.00 | 5.25 |
| 2026-11-23 | 18 | 14 / 5 | 7.12 | -9.50 | 11.00 | -10.63 |
| 2026-11-24 | 18 | 12 / 6 | 21.50 | 0.00 | 19.63 | 0.50 |
| 2026-11-25 | 26 | 18 / 2 | -7.75 | -4.00 | 5.00 | 6.50 |

| Population | Basis | V1 decision | Races | V1 bets / W | V1 £ | T2 £ | T1 £ |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Recorded shadow | capPL | T1 | 23 | 23 / 6 | 7.55 | -4.75 | 7.55 |
| Recorded shadow | capPL | T2 | 20 | 20 / 4 | -0.75 | -0.75 | -13.68 |
| Recorded shadow | capPL | T3 | 8 | 7 / 3 | 8.07 | 3.50 | -8.00 |
| Recorded shadow | capPL | Abstain | 20 | 0 / 0 | 0.00 | -3.50 | -13.76 |
| Recorded shadow | spPL | T1 | 23 | 23 / 6 | 12.63 | -6.38 | 12.63 |
| Recorded shadow | spPL | T2 | 20 | 20 / 4 | 11.75 | 11.75 | -13.67 |
| Recorded shadow | spPL | T3 | 8 | 7 / 3 | 5.25 | 2.25 | -8.00 |
| Recorded shadow | spPL | Abstain | 20 | 0 / 0 | 0.00 | -6.00 | -15.58 |
| AW replay outside shadow | capPL | T1 | 51 | 50 / 12 | -11.58 | -4.02 | -11.58 |
| AW replay outside shadow | capPL | T2 | 33 | 33 / 14 | 19.10 | 19.10 | -18.57 |
| AW replay outside shadow | capPL | T3 | 21 | 20 / 2 | 18.00 | -13.00 | 8.25 |
| AW replay outside shadow | capPL | Abstain | 24 | 0 / 0 | 0.00 | 0.50 | -7.70 |
| AW replay outside shadow | spPL | T1 | 51 | 50 / 12 | -9.88 | -3.48 | -9.88 |
| AW replay outside shadow | spPL | T2 | 33 | 33 / 14 | 20.67 | 20.67 | -18.77 |
| AW replay outside shadow | spPL | T3 | 21 | 20 / 2 | 13.50 | -4.00 | 7.68 |
| AW replay outside shadow | spPL | Abstain | 24 | 0 / 0 | 0.00 | -0.28 | -13.56 |

| Family | Basis | Switched outsider bets | W | Losing bets | £ P/L | Winning outsiders |
| --- | --- | --- | --- | --- | --- | --- |
| All | capPL | 22 | 1 | 21 | 7.00 | Masaccio 29.00 |
| All | spPL | 30 | 1 | 29 | 4.00 | Masaccio 34.00 |
| AW | capPL | 0 | 0 | 0 | 0.00 | — |
| AW | spPL | 3 | 0 | 3 | -3.00 | — |
| HURDLE | capPL | 14 | 1 | 13 | 15.00 | Masaccio 29.00 |
| HURDLE | spPL | 19 | 1 | 18 | 15.00 | Masaccio 34.00 |
| CHASE | capPL | 8 | 0 | 8 | -8.00 | — |
| CHASE | spPL | 8 | 0 | 8 | -8.00 | — |
