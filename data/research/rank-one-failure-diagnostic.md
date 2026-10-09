# Rank-1 Failure Diagnostic

Diagnostic only. Final SP is used after each model has already frozen rank 1; it is not a model input.
Actual-minus-expectation columns are winner counts minus summed implied/model probabilities.

## All Weather / AW_TISSUE_V1

Selections: 66 | winners: 14 | strike: 21.2%

| SP band | Selections | Winners | Strike | Market implied win rate | Model predicted win rate | Actual - market exp | Actual - model exp |
| --- | --- | --- | --- | --- | --- | --- | --- |
| odds-on | 8 | 7 | 87.5% | 68.3% | 27.1% | +1.54 | +4.83 |
| evens to <2/1 | 17 | 5 | 29.4% | 42.3% | 24.6% | -2.19 | +0.82 |
| 2/1 to <4/1 | 10 | 1 | 10.0% | 25.8% | 19.5% | -1.58 | -0.95 |
| 4/1 to <8/1 | 17 | 1 | 5.9% | 16.0% | 18.3% | -1.71 | -2.12 |
| 8/1+ | 14 | 0 | 0.0% | 7.6% | 18.1% | -1.06 | -2.53 |

Short-price confidence gate diagnostic

| Market group / confidence | Selections | Winners | Strike | Market implied win rate | Model predicted win rate | Actual - market exp | Actual - model exp |
| --- | --- | --- | --- | --- | --- | --- | --- |
| < Evens / high | 4 | 4 | 100.0% | 72.1% | 34.4% | +1.12 | +2.62 |
| < Evens / medium | 4 | 3 | 75.0% | 64.5% | 19.8% | +0.42 | +2.21 |
| Evens to <6/4 / high | 4 | 2 | 50.0% | 48.3% | 25.4% | +0.07 | +0.98 |
| Evens to <6/4 / medium | 3 | 0 | 0.0% | 44.0% | 18.0% | -1.32 | -0.54 |
| Evens to <6/4 / low | 1 | 1 | 100.0% | 50.0% | 15.8% | +0.50 | +0.84 |
| 6/4 to <2/1 / high | 4 | 0 | 0.0% | 38.7% | 38.6% | -1.55 | -1.54 |
| 6/4 to <2/1 / medium | 4 | 2 | 50.0% | 37.2% | 19.6% | +0.51 | +1.22 |
| 6/4 to <2/1 / low | 1 | 0 | 0.0% | 40.0% | 13.6% | -0.40 | -0.14 |
| >=2/1 / high | 6 | 0 | 0.0% | 18.0% | 26.1% | -1.08 | -1.57 |
| >=2/1 / medium | 26 | 1 | 3.8% | 14.8% | 18.2% | -2.86 | -3.73 |
| >=2/1 / low | 9 | 1 | 11.1% | 15.8% | 14.5% | -0.42 | -0.31 |

## All Weather / AW-D

Selections: 90 | winners: 22 | strike: 24.4%

| SP band | Selections | Winners | Strike | Market implied win rate | Model predicted win rate | Actual - market exp | Actual - model exp |
| --- | --- | --- | --- | --- | --- | --- | --- |
| odds-on | 7 | 7 | 100.0% | 68.2% | 20.4% | +2.23 | +5.57 |
| evens to <2/1 | 19 | 9 | 47.4% | 43.0% | 20.2% | +0.84 | +5.16 |
| 2/1 to <4/1 | 22 | 4 | 18.2% | 27.0% | 20.2% | -1.93 | -0.44 |
| 4/1 to <8/1 | 14 | 1 | 7.1% | 15.5% | 19.9% | -1.17 | -1.78 |
| 8/1+ | 28 | 1 | 3.6% | 5.2% | 20.2% | -0.45 | -4.67 |

Short-price confidence gate diagnostic

| Market group / confidence | Selections | Winners | Strike | Market implied win rate | Model predicted win rate | Actual - market exp | Actual - model exp |
| --- | --- | --- | --- | --- | --- | --- | --- |
| < Evens / medium | 7 | 7 | 100.0% | 68.2% | 20.4% | +2.23 | +5.57 |
| Evens to <6/4 / medium | 12 | 6 | 50.0% | 45.6% | 20.3% | +0.53 | +3.57 |
| Evens to <6/4 / low | 1 | 1 | 100.0% | 45.5% | 18.9% | +0.55 | +0.81 |
| 6/4 to <2/1 / medium | 6 | 2 | 33.3% | 37.3% | 20.3% | -0.24 | +0.78 |
| >=2/1 / medium | 39 | 4 | 10.3% | 16.1% | 20.6% | -2.26 | -4.05 |
| >=2/1 / low | 25 | 2 | 8.0% | 13.2% | 19.3% | -1.29 | -2.84 |

## Jump / JPR-A

Selections: 113 | winners: 22 | strike: 19.5%

| SP band | Selections | Winners | Strike | Market implied win rate | Model predicted win rate | Actual - market exp | Actual - model exp |
| --- | --- | --- | --- | --- | --- | --- | --- |
| odds-on | 6 | 3 | 50.0% | 61.2% | 19.9% | -0.67 | +1.80 |
| evens to <2/1 | 18 | 6 | 33.3% | 41.7% | 20.6% | -1.51 | +2.29 |
| 2/1 to <4/1 | 32 | 8 | 25.0% | 26.3% | 19.9% | -0.41 | +1.65 |
| 4/1 to <8/1 | 27 | 4 | 14.8% | 16.2% | 19.6% | -0.37 | -1.29 |
| 8/1+ | 30 | 1 | 3.3% | 6.2% | 20.3% | -0.87 | -5.10 |

Short-price confidence gate diagnostic

| Market group / confidence | Selections | Winners | Strike | Market implied win rate | Model predicted win rate | Actual - market exp | Actual - model exp |
| --- | --- | --- | --- | --- | --- | --- | --- |
| < Evens / medium | 6 | 3 | 50.0% | 61.2% | 19.9% | -0.67 | +1.80 |
| Evens to <6/4 / medium | 9 | 5 | 55.6% | 45.0% | 20.6% | +0.95 | +3.15 |
| Evens to <6/4 / low | 2 | 0 | 0.0% | 42.1% | 18.9% | -0.84 | -0.38 |
| 6/4 to <2/1 / medium | 7 | 1 | 14.3% | 37.4% | 21.1% | -1.62 | -0.48 |
| >=2/1 / medium | 49 | 9 | 18.4% | 17.0% | 20.9% | +0.69 | -1.25 |
| >=2/1 / low | 40 | 4 | 10.0% | 15.8% | 18.7% | -2.34 | -3.50 |

## Jump / JUMP_TISSUE_V1

Selections: 75 | winners: 17 | strike: 22.7%

| SP band | Selections | Winners | Strike | Market implied win rate | Model predicted win rate | Actual - market exp | Actual - model exp |
| --- | --- | --- | --- | --- | --- | --- | --- |
| odds-on | 9 | 7 | 77.8% | 60.0% | 41.9% | +1.60 | +3.23 |
| evens to <2/1 | 15 | 4 | 26.7% | 43.2% | 36.5% | -2.48 | -1.48 |
| 2/1 to <4/1 | 23 | 5 | 21.7% | 27.8% | 25.6% | -1.40 | -0.89 |
| 4/1 to <8/1 | 15 | 1 | 6.7% | 16.6% | 24.0% | -1.48 | -2.60 |
| 8/1+ | 13 | 0 | 0.0% | 6.4% | 20.0% | -0.83 | -2.60 |

Short-price confidence gate diagnostic

| Market group / confidence | Selections | Winners | Strike | Market implied win rate | Model predicted win rate | Actual - market exp | Actual - model exp |
| --- | --- | --- | --- | --- | --- | --- | --- |
| < Evens / high | 7 | 6 | 85.7% | 61.2% | 46.7% | +1.72 | +2.73 |
| < Evens / medium | 2 | 1 | 50.0% | 56.2% | 25.1% | -0.12 | +0.50 |
| Evens to <6/4 / high | 7 | 4 | 57.1% | 44.7% | 44.2% | +0.87 | +0.90 |
| Evens to <6/4 / medium | 3 | 0 | 0.0% | 48.4% | 19.4% | -1.45 | -0.58 |
| 6/4 to <2/1 / high | 4 | 0 | 0.0% | 38.7% | 38.7% | -1.55 | -1.55 |
| 6/4 to <2/1 / medium | 1 | 0 | 0.0% | 34.8% | 25.7% | -0.35 | -0.26 |
| >=2/1 / high | 15 | 4 | 26.7% | 21.2% | 34.5% | +0.82 | -1.18 |
| >=2/1 / medium | 22 | 1 | 4.5% | 20.0% | 21.1% | -3.40 | -3.64 |
| >=2/1 / low | 14 | 1 | 7.1% | 15.2% | 16.3% | -1.13 | -1.28 |

## Turf / TPR_S2_V1

Selections: 180 | winners: 33 | strike: 18.3%

| SP band | Selections | Winners | Strike | Market implied win rate | Model predicted win rate | Actual - market exp | Actual - model exp |
| --- | --- | --- | --- | --- | --- | --- | --- |
| odds-on | 16 | 11 | 68.8% | 67.3% | 18.3% | +0.23 | +8.07 |
| evens to <2/1 | 15 | 4 | 26.7% | 38.6% | 18.6% | -1.79 | +1.22 |
| 2/1 to <4/1 | 33 | 6 | 18.2% | 25.9% | 17.2% | -2.54 | +0.32 |
| 4/1 to <8/1 | 47 | 7 | 14.9% | 15.6% | 16.6% | -0.31 | -0.79 |
| 8/1+ | 69 | 5 | 7.2% | 6.6% | 16.7% | +0.48 | -6.52 |

Short-price confidence gate diagnostic

| Market group / confidence | Selections | Winners | Strike | Market implied win rate | Model predicted win rate | Actual - market exp | Actual - model exp |
| --- | --- | --- | --- | --- | --- | --- | --- |
| < Evens / high | 2 | 1 | 50.0% | 85.0% | 21.8% | -0.70 | +0.56 |
| < Evens / medium | 14 | 10 | 71.4% | 64.8% | 17.8% | +0.93 | +7.50 |
| Evens to <6/4 / high | 1 | 0 | 0.0% | 45.5% | 21.8% | -0.45 | -0.22 |
| Evens to <6/4 / medium | 3 | 1 | 33.3% | 43.2% | 16.0% | -0.30 | +0.52 |
| 6/4 to <2/1 / high | 2 | 2 | 100.0% | 37.2% | 21.8% | +1.26 | +1.56 |
| 6/4 to <2/1 / medium | 7 | 1 | 14.3% | 36.6% | 19.9% | -1.56 | -0.39 |
| 6/4 to <2/1 / low | 2 | 0 | 0.0% | 36.4% | 13.0% | -0.73 | -0.26 |
| >=2/1 / high | 3 | 0 | 0.0% | 10.1% | 21.8% | -0.30 | -0.65 |
| >=2/1 / medium | 65 | 11 | 16.9% | 15.9% | 18.6% | +0.67 | -1.06 |
| >=2/1 / low | 81 | 7 | 8.6% | 12.0% | 15.1% | -2.74 | -5.27 |

## Turf / Turf Tissue v2

Selections: 267 | winners: 59 | strike: 22.1%

| SP band | Selections | Winners | Strike | Market implied win rate | Model predicted win rate | Actual - market exp | Actual - model exp |
| --- | --- | --- | --- | --- | --- | --- | --- |
| odds-on | 21 | 14 | 66.7% | 64.4% | 32.5% | +0.47 | +7.18 |
| evens to <2/1 | 33 | 12 | 36.4% | 41.1% | 25.6% | -1.56 | +3.54 |
| 2/1 to <4/1 | 89 | 18 | 20.2% | 26.7% | 22.3% | -5.76 | -1.80 |
| 4/1 to <8/1 | 78 | 12 | 15.4% | 15.7% | 19.7% | -0.24 | -3.36 |
| 8/1+ | 46 | 3 | 6.5% | 6.6% | 16.8% | -0.02 | -4.72 |

Short-price confidence gate diagnostic

| Market group / confidence | Selections | Winners | Strike | Market implied win rate | Model predicted win rate | Actual - market exp | Actual - model exp |
| --- | --- | --- | --- | --- | --- | --- | --- |
| < Evens / high | 14 | 11 | 78.6% | 66.1% | 36.3% | +1.75 | +5.92 |
| < Evens / medium | 6 | 2 | 33.3% | 61.0% | 26.8% | -1.66 | +0.39 |
| < Evens / low | 1 | 1 | 100.0% | 61.9% | 12.7% | +0.38 | +0.87 |
| Evens to <6/4 / high | 5 | 3 | 60.0% | 45.3% | 27.0% | +0.74 | +1.65 |
| Evens to <6/4 / medium | 8 | 2 | 25.0% | 46.9% | 25.4% | -1.75 | -0.03 |
| Evens to <6/4 / low | 2 | 1 | 50.0% | 44.9% | 14.6% | +0.10 | +0.71 |
| 6/4 to <2/1 / high | 5 | 2 | 40.0% | 36.5% | 30.2% | +0.18 | +0.49 |
| 6/4 to <2/1 / medium | 10 | 4 | 40.0% | 37.6% | 27.5% | +0.24 | +1.25 |
| 6/4 to <2/1 / low | 3 | 0 | 0.0% | 35.3% | 17.6% | -1.06 | -0.53 |
| >=2/1 / high | 42 | 7 | 16.7% | 21.6% | 31.5% | -2.08 | -6.24 |
| >=2/1 / medium | 64 | 15 | 23.4% | 19.1% | 22.2% | +2.75 | +0.78 |
| >=2/1 / low | 107 | 11 | 10.3% | 16.5% | 14.4% | -6.69 | -4.43 |
