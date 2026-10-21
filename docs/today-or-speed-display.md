# Today's Racing: OR + Speed

Ordinary Flat Turf races use the existing `isOrdinaryFlatTurfRaceForDisplay`
classification. The compact OR + Speed column replaces their separate OR and
selectable Speed columns. It always displays `officialRating` and
`metrics.bestTurfSpeedLast3`, independently. The shared Speed selector continues
to control the existing Speed column for Jump and other unsupported race families;
it does not change Turf or AW Best L3 or their comparisons.

All-Weather races use the existing `isAllWeatherRaceForDisplay` classification
and share the same compact OR + Speed column, cell, comparison algorithm and
unrounded >=10 emphasis. The authoritative AW input is
`runner.metrics.bestAwSpeedLast3`, exposed by
`canonicalFamilyFormMetrics(metrics, "aw").speed.bestLast3` and populated by
`calculateHorseMetricsAsOf` in `src/lib/racing/horse-metrics.ts` as
`maxRating(awSpeedValuesLast3)`. The existing aggregation takes AW Speed values
from the canonical last-three prior-run window; this UI does not reselect runs,
recalculate AW Speed, or fall back to Turf Speed or TPR. The AW tooltip describes
eligible All-Weather Speed figures. `sameOrAwSpeedEdges` selects that AW field
and shares only the display comparison with Turf. Turf defaults, help text,
formatting and existing tests remain unchanged.

Today's Rating is removed from the runner display for all families. Its
calculation, stored fields and research uses are unchanged. Hurdle, Chase
and NH Flat retain their existing displays and receive no AW or Turf comparison.
AW retains its other existing diagnostic displays.
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

The existing AW forward-comparison records in `aw-forward-comparisons.ts`
store Best L3 and its whole-race rank for their draw/distance cohorts, but omit
OR and explicit same-OR edges. AW rating forward records store component ranks
and rating outputs. Neither contract is expanded for this display. Freezing the
AW comparison would need the displayed cohort, OR/Best L3 inputs and explicit
edge/availability flags in a separately agreed capture change.

Prospective capture is unchanged. Freezing the complete requested observation
for Turf or AW would expand the established snapshot/tracker contract and needs
a separate decision. This change adds no tracker, schema, database migration,
historical backfill or research-data writes. It does not reconstruct frozen observations
from later display values.

## Manual verification

Check Turf and AW cards with unique same-OR leaders and tied/missing figures,
including gaps above/below 10, narrow-screen overflow and family-specific hover
help. Confirm AW displays Best L3 regardless of the shared Speed selector.
Check Hurdle and Chase cards for unchanged family-specific displays and absence
of Speed-edge badges. Confirm Today's Rating remains absent and TPR is retained.
The tests cover display components and page wiring without rendering the
database-backed page, whose existing request path writes research snapshots and refreshes results.
