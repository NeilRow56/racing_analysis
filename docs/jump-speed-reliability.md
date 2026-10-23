# Jump Speed history confidence

The daily Hurdle and Chase racecards show a small High / Med / Low indicator
under Speed when **Best L3** is selected. It describes recent evidence coverage,
not horse ability or the magnitude of the figure. Latest and Previous retain
their numeric displays without an L3 indicator. Turf, AW and NH Flat cards do
not show this indicator.

The assessment uses the exact already eligible, chronological last-three
all-code prior-run window used by `bestJumpSpeedLast3`. It never expands the
window to find three usable Jump runs. Relevant means the existing pooled Jump
domain, classified with `isJumpRace`: Hurdle, Chase and NH Flat count together.
Hurdle/Chase switching therefore does not itself reduce confidence. A non-Jump
run, including Flat/AW, still consumes a slot but supplies no Jump evidence.

- **HIGH:** three relevant Jump runs with finite usable Jump Speed figures.
- **MEDIUM:** two relevant Jump runs with usable figures, including two Jump
  runs plus a Flat/AW run or an unavailable third figure.
- **LOW:** zero or one relevant Jump run with a usable figure, or missing history.

The tooltip explains the count and any non-Jump or unavailable history.
Non-Jump history is identified by the canonical classifier, without guessing
its surface from the race title. No result quality, OR, price, rating magnitude,
model rank or Value rank enters the assessment. The metadata is optional on
the in-memory horse metrics; it is not a stored feature or tracker schema.

Glen To Glen's Cheltenham 23 October 2026 example is **MEDIUM**: the recent
window contains Hurdle 71.07566504917321, Chase 75.84646128484849 and a Flat run
with no Jump figure. Best L3 stays 75.84646128484849 (displayed 76). The older
130.93586244343888 Chase remains outside L3. No horse name is used in the rule.

All rating calculations, eligibility/window selection, TPR, model features,
standardisation, scores, probabilities, Tissue/Value ranks and market comparisons
are unchanged. No database migration, backfill, capture or tracker change is
required. Regression tests compare full model predictions and captured Value
books with and without the presentation metadata.
