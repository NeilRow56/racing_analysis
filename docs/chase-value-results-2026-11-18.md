# Chase T3 and alternative value models

## Decision

Keep Chase V2 Tissue Rank 3 as the primary prospective validation candidate. The existing generation ledger is sufficient for this report. It captures every ranked runner in the book, sources the market from pre-race Sporting Life bookmaker quotes, records feature and capture clocks, and retains recorded returns. Coverage gaps and the time to scheduled off are visible from the same books. The existing Positive/Neutral V2 ledger focuses on T1 and T2. The new report reads the generation ledger directly.

The captured market had the best full-race probability scores among the tested forecasts. Keep the model experiment offline. The [methods and feasibility review](chase-value-methods.md) describes the external evidence and the two approaches deferred.

## T3 exploratory evidence

The original diagnostic had 22 winners in 82 settled races, market A/E 1.65 and matched-field A/E 1.88. Its 25 corrected priced stakes earned £12.71. P/L fell to £5.71 after the largest winner and £0.21 after the two largest. The original matched monetary subset fell to −£1.12 after removing two.

The separate review froze reporting at 16:05:44 UTC on 18 November 2026. At that clock the same collection had 91 T3 captures, 84 settled races across 13 dates, 22 winners and a 26.2% strike rate. Model expectation was 13.59 winners. The 73 settled selections with a recorded price contributed 20 winner credits versus 12.46 expected from the market. Market A/E was 1.60 with a descriptive 95% date-bootstrap interval of 1.20–2.14. There were 77 recorded prices in 91 captures and 27 corrected priced stakes across six dates. Their £10.71 profit (39.7% ROI) fell to £3.71 without the largest winning race and −£1.79 without the largest two. The descriptive ROI interval was −27.5% to +144.6%.

| Dates in November 2026 | Settled races | Dates | Winners | Market A/E | V3 stakes | £1 P/L |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 5–11 | 52 | 7 | 14 | 1.60 | 3 | £2.00 |
| 12–18 | 32 | 6 | 8 | 1.61 | 24 | £8.71 |

The winner count was spread over all thirteen settled dates. The 5–<11 decimal band had eight wins in 27 settled selections and supplied £12.00 of the £10.71 total. The 11+ band had zero wins in 14 settled selections. The two largest winning races account for the difference between positive and negative P/L. Price availability and the switch to corrected settlements make the money sample particularly sparse.

### Matched-race description

The four selections below are measured on the same 56 complete settled fields with captured prices, across 12 dates. The market favourite uses stable runner ID to break exact price ties. Official-rating means use 52 available records per group. Speed is available for 54 T2s and all other matched selections.

| Pick | Wins | Market A/E | Mean market rank | Mean OR rank | Mean speed rank | Mean best last-three jump speed | Mean prior jump starts |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| T1 | 13 | 0.88 | 2.13 | 2.81 | 3.52 | 114.33 | 11.27 |
| T2 | 11 | 0.93 | 2.82 | 3.83 | 3.50 | 116.21 | 12.63 |
| T3 | 17 | 1.63 | 3.52 | 3.38 | 3.54 | 115.39 | 12.02 |
| Market favourite | 17 | 0.94 | 1.00 | 2.90 | 3.50 | 113.81 | 11.23 |

T3 sits around fourth in the market and its official rating and speed positions roughly match its market position. There is little evidence of a large systematic disagreement on these two dimensions. It has similar jump experience to T1, T2 and the favourite. T3's 17 winners on these fields were worth about 10.46 market-expected winners. The date-bootstrap A/E interval was 1.17–2.29. The 20 corrected-priced stakes made £12.21 and fell to £5.21 after removing one winner and −£0.29 after removing two, with a raw ROI interval of −40.9% to +170.5%.

These matched runners share race conditions by design. The fields averaged 6.57 runners, 20.51 furlongs and class 3.35 where known. Of 55 known handicap flags, 44 were handicaps. Mean observed official rating across the 53 fields with any rating was 114.52. Across the broader T3 review the A/E pattern appeared stronger in handicaps (1.73 vs 1.28), class 4 or higher-numbered races (1.86 vs 1.25) and fields with a mean observed rating under 120 (1.95 vs 1.07). Both distance and field-size bands were above 1. These overlapping descriptive cuts contain missing inputs and small cells. No filter was selected. A testable explanation is that middle-ranked Chase horses could be underpriced in weaker fields. New evidence is needed to distinguish this from sampling noise and correlated race characteristics. A second hypothesis is that the market may compress middle prices too strongly. A future test could use a training-fitted market calibration control before considering additional features.

## Chronological model comparison

The two fits used 61 Chase races over 16 dates from 20 October–4 November. The test contained 57 of 92 available Chase books over 12 dates from 5–18 November. It required complete captured prices and fully settled starter fields. Captures and feature cutoff ranges are recorded in the [machine-readable report](../data/research/chase-market-experiment-2026-11-18.json). The whole comparison is one 2026 Chase slice. There is no cross-year or cross-family replication.

| Forecast | Winner hits | Log loss | Brier | Paired Δ log loss | Top-choice market A/E | Shared V3 P/L | ROI |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Captured market | 18 | 1.547 | 0.749 | baseline | 0.97 | −£8.06 | −40.3% |
| Chase V2 Tissue | 14 | 1.682 | 0.789 | +0.135 | 0.91 | −£7.64 | −38.2% |
| Form ranks | 8 | 1.777 | 0.815 | +0.230 | 0.91 | −£1.50 | −7.5% |
| Market + form ranks | 15 | 1.573 | 0.758 | +0.025 | 0.83 | −£8.06 | −40.3% |

The market-offset fit's paired date-cluster intervals were −0.009 to +0.060 for log loss and −0.011 to +0.029 for Brier. The market led both scores in each chronological slice. The form-only fit was near uniform and the rating coefficient was negative in both fits. With this training sample that is evidence of an unstable or unhelpful predictor specification. The comparison includes 57 captured prices per model and 20 common canonical-priced races across six dates. All four lost money and all four remained negative after removal of one or two largest wins on the pooled sample. The form-only fit's £1.50 profit in the second slice came from 17 shared stakes across five dates with three winners and a worse probability forecast. Its P/L falls to −£6.00 without the largest winner and −£11.50 without the two largest. The full report contains its removal and uncertainty figures, probability calibration and captured-price bands.

## Prospective decision rule

Work on the existing ledger, beginning with race dates from 19 November 2026. Use the first genuine pre-off capture for each race and freeze T3 for that race. Review once there are 200 settled races across at least 30 race dates and at least 80% of settled T3 selections have recorded prices. If coverage falls below that threshold, investigate the missing books without filling from SP. Use date-cluster uncertainty around market A/E as the primary test. If its lower 95% bound fails to exceed 1, stop this validation cycle without creating subfilters. A market A/E signal alone is insufficient to establish a monetary edge. Inspect corrected-price returns, chronological stability and both winner-removal checks before considering any further independent research.

The November diagnostics selected T3 after examining several ranks, families, price bands and cohorts. Date-cluster intervals are conditional on the chosen analyses and carry no selection adjustment. This is an exploratory explanation and an independent future measurement plan.

## Reproduction

Run `bun run scripts/evaluate-chase-market-model.ts` from the repository root to print the comparison, calibration bins, period splits and matched-race diagnostics as JSON. The command validates the frozen model checksums, historical development and promotion artifact hashes, prospective source pins and original evidence hashes before scoring.
