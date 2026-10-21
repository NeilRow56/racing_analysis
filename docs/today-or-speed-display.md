# Today's Racing: OR + Speed

Ordinary Flat Turf races use the existing `isOrdinaryFlatTurfRaceForDisplay`
classification. The compact OR + Speed column replaces their separate OR and
selectable Speed columns. It always displays `officialRating` and
`metrics.bestTurfSpeedLast3`, independently. The shared Speed selector continues
to control the existing Speed column for Jump and other unsupported race families;
it does not change Turf or AW Best L3 or their comparisons.

All-Weather races use the existing `isAllWeatherRaceForDisplay` classification
and share the same compact OR + Speed column, cell, comparison algorithm and
two-tier OR-rank emphasis. The authoritative AW input is
`runner.metrics.bestAwSpeedLast3`, exposed by
`canonicalFamilyFormMetrics(metrics, "aw").speed.bestLast3` and populated by
`calculateHorseMetricsAsOf` in `src/lib/racing/horse-metrics.ts` as
`maxRating(awSpeedValuesLast3)`. The existing aggregation takes AW Speed values
from the canonical last-three prior-run window; this UI does not reselect runs,
recalculate AW Speed, or fall back to Turf Speed or TPR. The AW tooltip describes
eligible All-Weather Speed figures. `sameOrAwSpeedEdges` selects that AW field
and shares the display comparison and OR context with Turf. Family-specific
values, selection and number formatting are unchanged.

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
introducing a different eligibility cohort. OR and Best L3 retain compact formatting. Speed edges use exactly two decimal places in both badge and tooltip (including tiny positive edges that display as 0.00); exact calculated gaps are unchanged. This is a
descriptive research observation and creates no combined rating.

## Two-tier emphasis

Every positive same-OR edge remains visible. Edges outside OR rank 1–3 use a
restrained slate badge, including gaps >=10. Edges at OR rank 1–3 use moderately
stronger emerald styling, regardless of gap size, for both Turf and AW. Gap size
alone never controls prominence. This follows the implementation request's shared
Top-3 OR rule; the historical report's more restrictive AW large-edge candidate
is not used here.

`officialRatingRanks` ranks all finite ORs in the displayed race descending,
including runners with missing Speed and displayed non-runners, using competition
ties: 86, 84, 84, 82 ranks 1, 2, 2, 4. All horses sharing the highest OR have rank 1;
rank <=3 may include more than three horses. Missing/nonfinite OR has no rank.
Ranks only provide display context and do not change ordering or any rating.

Badge tooltips describe the two-decimal gap to the next-highest same-OR Speed runner.
Top-tier tooltips also explain Top-3 OR membership and OR rank, with top-OR context
for rank 1. No permanent line or wider badge is added. Higher-OR horses win more
often, but the diagnostic did not find a materially stronger same-OR Speed effect
at the top. The styling conveys OR context rather than a new prediction or score.

## Prospective OR + Best L3 tracker

Activated at **2026-10-21T08:39:44.000Z** (`OR_BEST_L3_SPEED_FORWARD_V1`).
The versioned local JSON tracker is `data/research/or-best-l3-speed-forward-v1.json`,
using the established lock plus atomic rename persistence pattern. No database
migration is required. Initial observations are empty; no historical cache is used.

`bun run research:morning` captures immediately after racecard acquisition,
before other tracker stages. Only current London-date Turf/AW races scheduled
strictly after capture time qualify, with no result evidence and a complete
loaded declaration field. The capture time is taken after loading. Repeated runs
can add newly eligible runner/race pairs, but never rewrite an existing pair.
Races already run, previous days, and pre-activation captures cannot be added.
The fallback for existing current-day racecards remains available; price is not
part of eligibility, and stale bookmaker quotes are not retained by this tracker.

Capture and the UI share `or-speed-comparison.ts`: exact OR grouping, family-specific
Best L3, unique positive leaders and competition OR ranks. The displayed cohort
includes any displayed non-runners, matching the card. Frozen fields include IDs,
race/date/off/course/name/family, declared and available starter counts, handicap
classification (including unknown), class, exact OR/Speed/gap, comparison group
size/next-highest figure, Speed calculation version and metric, OR rank, Top-3 and
top-OR flags, >=10 flag, display string and tier. Optional prices/TPR/Tissue are
not required or newly calculated.

`research:settle`, also called by `research:live` and `research:after`, loads only
pending captured race IDs. It never creates observations. Canonical void/non-runner
and result readiness semantics apply; valid starters with non-finishing statuses
remain settled losing observations, with last-place rank. Normalized finish is
`(finishRank - 1) / (starters - 1)` (0 for a one-starter race). Non-runners/voids
are excluded from performance denominators. Dead-heat winners each count as
winners; divisor and fractional winner credit are retained. Settlement is final
once recorded, following the existing tracker pattern.

Read-only results are at `/racing/research/or-speed`, linked from Research, and
`bun run or-speed:summary`. No new daily command is required. Turf and AW each
report all edges, Top-3 OR, rank 4+, >=10, and Top-3 OR plus >=10 cohorts. Each
reports observations, settled starters, winners, win %, Top-3 %, mean normalized
finish and sample size labels based on settled starters: <50 TOO EARLY, 50–149
EARLY, 150–299 DEVELOPING, 300+ MEANINGFUL. Cohorts overlap; labels do not establish
statistical significance. No profit, ROI, A/E or staking is calculated.

## Manual verification

Check Turf and AW cards with unique same-OR leaders and tied/missing figures,
including ranks 1–3 versus 4+, gaps above/below 10, narrow-screen overflow and family-specific hover
help. Confirm AW displays Best L3 regardless of the shared Speed selector.
Confirm a low-OR large edge stays restrained and a top-OR small edge is emphasized.
Check Hurdle and Chase cards for unchanged family-specific displays and absence
of Speed-edge badges. Confirm Today's Rating remains absent and TPR is retained.
The tests cover display components and page wiring without rendering the
database-backed page, whose existing request path writes research snapshots and refreshes results.
