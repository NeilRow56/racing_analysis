# Today's Racing: OR + Speed

Ordinary Flat Turf races use the existing `isOrdinaryFlatTurfRaceForDisplay`
classification. The compact OR + Speed column replaces their separate OR and
selectable Speed columns. It always displays `officialRating` and
`metrics.bestTurfSpeedLast3`, independently. The shared Speed selector continues
to control the existing Speed column for other race families; it does not change
Turf Best L3 or the comparison.

Today's Rating is removed from the runner display for all families. Its
calculation, stored fields and research uses are unchanged. AW, Hurdle, Chase
and NH Flat retain their other existing displays and receive no Turf comparison.
Turf TPR retains its value, rank, provenance and warnings, with quieter value
typography.

Comparison is local to the displayed runners of one race, grouped by exact OR.
Only finite OR and Best L3 values are comparable. A unique highest-Speed runner
gets its positive gap to the next-highest comparable runner; tied leaders receive
no badge. Lower runners receive no badge. No runners are reordered or mutated.
This uses the displayed list, including any displayed non-runner, rather than
introducing a different eligibility cohort. Emphasis is based on the unrounded
gap >=10. Figures display up to two decimal places (very small nonzero figures
use two significant digits); the tooltip retains the exact gap. This is a
descriptive research observation and creates no combined rating.

## Prospective capture inspection

The page saves TPR and W50 shadow snapshots through
`turf-performance-rating-snapshots.ts`. Those snapshot schemas store ratings,
ranks and provenance, not the complete OR/Best L3 inputs or same-OR comparisons.
The existing TPR forward input snapshot in `tpr-timewise-forward-context.ts`
stores canonical TPR inputs and W100/W50 outputs, also without the complete
OR/Best L3 comparison inputs.

Separately, Turf tissue feature construction already consumes OR and Best L3,
and its v3 tracker stores model-input vectors. These serve that model's existing
methodology; they are not a frozen record of this page's displayed comparison
cohort or explicit same-OR availability/edge/large-edge flags.

Prospective capture is unchanged. Freezing the complete requested observation
would expand the established snapshot/tracker contract and needs a separate
decision. This change adds no tracker, schema, database migration, historical
backfill or research-data writes. It does not reconstruct frozen observations
from later display values.

## Manual verification

Check a Turf card with a unique same-OR leader and one with tied/missing figures,
including narrow-screen overflow and hover help. Check an AW and a Jump card
for unchanged family-specific displays and absence of Today's Rating. The tests
cover display components and page wiring without rendering the database-backed
page, whose existing request path writes research snapshots and refreshes results.
