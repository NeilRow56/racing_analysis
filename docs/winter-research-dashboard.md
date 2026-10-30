# Winter 2026/27 research dashboard

Route: `/racing/research/winter-2026`, linked once from Racing Research navigation.

Reporting only. AW and Hurdle remain KEEP; Chase remains INVESTIGATE. Red watch
classification C remains VISUAL ONLY; longer-price context remains DESCRIPTIVE
ONLY. Retrain now: NO for all three families. No decisions are inferred from the
displayed results.

## Data and denominators

Reuses `buildProspectiveTissueSources` and its 20 October 2026 epoch, activation,
native rank, full-field Speed rank, canonical result and identity quarantine guards.
Only AW, Hurdle and Chase Tissue ranks 1/2 are displayed. Data loaders read existing
local files; rendering never calls capture, settlement, database or mutation APIs.

Primary family books provide settled/winners/strike/model expected/Actual-model.
Separate complete-market Value books provide captured-price ROI, with their own
frozen ranks, probabilities and classifications. Every table exposes price n.
Price-conditioned rows use the Value cohort throughout, never a cross-book price
join. Prices must be finite and greater than 1; longer-price uses the unchanged
`isLongerPriceTissueTop2` helper (>6.00). P/L is persisted canonical settlement,
never recalculated. Missing price returns are excluded from price n/ROI.

Chase reliability uses `attachChaseSpeedState` with exact cohort/race/capturedAt/
runner identity. Unclassified runners are shown separately. Race type uses the
owning frozen `handicap` input and missing flag. OR uses full-field descending
competition ranks over frozen official ratings, including subsequent NRs and
runners outside Tissue Top 2. No current history or race-name inference is used.

Hurdle completion uses existing recency snapshots joined by race/runner identity,
requiring firstCapturedAt <= the owning Tissue capture and strictly before both
stored off times. Later snapshots never backfill earlier captures. Hurdle HIGH /
MEDIUM/LOW Speed reliability is unavailable: its exact annotation ledger does not
exist. Numeric input completeness must not be substituted for Speed reliability.

## Frozen chronology provenance

Source: **Winter 2026 Season Transition Review**, 30 October 2026, originally
`/tmp/winter-2026-season-transition-review.md`. The review covered captures
20–30 October and settled outcomes 20–29 October. These definitions are recorded
here so the deployed page does not depend on temporary review artifacts.

The diagnostic split ordered settled race-time clusters into quarters, preserving
whole races and simultaneous offs. Its boundaries are constants in this dashboard;
they are never recomputed as new results arrive. Intervals are start-inclusive and
end-exclusive, using scheduled off in UTC.

| Context | Fixed cut times (UTC, 2026) |
| --- | --- |
| Full-sample review quarters (originally including Turf) | 22 Oct 15:05; 24 Oct 19:00; 27 Oct 15:40 |
| Recent red/non-red block | Full-sample Q4: 27 Oct 15:40 onward, displayed for winter families only |
| Chase quarters | 22 Oct 15:53; 25 Oct 12:32; 27 Oct 15:31 |
| Chase halves | 25 Oct 12:32 |
| AW halves | 26 Oct 16:30 |
| Fixed review weeks | [20 Oct, 27 Oct), [27 Oct, 3 Nov) |

The review labelled week 2 “27–30 Oct (incomplete)”; its actual predicate ends on
3 November. The dashboard displays the complete interval without shifting it.
Chase's last quarter and both families' second halves stay open, as in the review.
Weeks, quarters and halves overlap. The recent red block is the review's
full-sample Q4, not its separate strict-post quarter. Red declaration remains
24 October (no authoritative intraday timestamp); strict confirmation uses
captures from 25 October. Full-period and recent off-time tables are explicitly
descriptive and do not claim independent confirmation.

Manual reconciliation against the review snapshot: AW 198/43, model expected
35.8710, ROI 0% on 173; Hurdle 167/36, expected 34.6195, ROI −7.3161% on 155;
Chase 87/17, expected 20.8315, ROI −36.4167% on 84. Chase reliability coverage:
HIGH 7, MEDIUM 1, LOW 0, unclassified 79 settled. These are review evidence,
not hardcoded dashboard results.
