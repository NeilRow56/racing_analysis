# Tissue positive / neutral prospective monitor

Version: `TISSUE_POSITIVE_NEUTRAL_PROSPECTIVE_V1`.
Ledger: `data/research/tissue-positive-neutral-prospective-v1.json`.

Armed on **10 November 2026 at 15:20:25.079 Europe/London**
(`2026-11-10T15:20:25.079Z`). Initialization left the epoch pending, with zero
observations and no historical backfill. No existing research ledger changed
during initialization.

This monitor tests whether production Tissue T1/T2 positive-or-neutral market
badges identify stronger prospective selections. It does not change Tissue
rankings/probabilities, Value, watch lists, market capture, canonical settlement,
model coefficients, existing observations or Today presentation. Hurdle means
**HURDLE_TISSUE_V2**; V3 shadow is not accepted or mixed into this monitor.

## Cohorts and frozen badge rules

The main cohorts require original frozen Tissue rank **1 or 2**, and a **POSITIVE**
or **NEUTRAL** badge. Negative, fallback and NR selections do not enter eligible
main results. There is no promotion of lower-ranked horses after withdrawals.

The existing pure Today `tissueMarketBadge` function is reused unchanged:

| Badge | Frozen Tissue minus market probability |
| --- | --- |
| POSITIVE | At least +0.5 percentage points |
| NEUTRAL | Absolute difference below 0.5 percentage points |
| NEGATIVE | At most −0.5 percentage points |
| FALLBACK | No valid complete frozen market comparison |

Its existing `1e-12` probability roundoff allowance at the ±0.5 pp boundary is
preserved, so monitor membership matches the displayed badge exactly.

Report T1 POSITIVE, T1 NEUTRAL, T1 POSITIVE + NEUTRAL, and the corresponding three
T2 cohorts separately. The additional **TOP2 POSITIVE + NEUTRAL COMBINED** row is
a pool of qualifying selections, with one £1 stake per horse, not a race-level
Top2 hit rate. Primary reporting keeps T1 and T2 separate. All cohorts split into
ALL FAMILIES, AW, Turf, Hurdle and Chase.

Original production competition-rank ties, including Turf ties, are retained.
Several horses can share T1 and there may be no T2. No synthetic tie-break or
replacement selection is introduced. Counts are selections; unique race counts
are also available in the summary.

## Capture and same-market requirement

The normal production capture workflow passes only new books actually accepted
by that invocation's writer to this independent monitor. A complete validated
production book supplies the exact frozen Tissue probability and normalized
market probability used by Today, independently of Value. Existing records with
an absent normalized field can only use their own book's frozen prices, through
the same arithmetic as Today's production projection. No later odds, SP, Value
market, approximate match or historical replay is accepted.

`market_probability_i = (1 / frozen_decimal_price_i) / sum_j(1 / frozen_decimal_price_j)`

`edge_pp = 100 × (frozen_Tissue_probability − frozen_market_probability)`.

Each observation freezes date, course, scheduled time, family, model version/hash,
capture timestamp, feature cutoff, monitor freeze time, source, completeness and
book identity. Each original T1/T2 selection freezes horse/runner identity, rank,
Tissue probability, normalized market probability, decimal price, competition
market rank, edge pp, badge state, inclusion flag and descriptive bands. A digest
binds the entire exact capture, excluding only outcomes.

Negative and fallback T1/T2 snapshots are retained **only as reference data**.
They are excluded from the headline. This makes ALL T1 and ALL T2 baselines
contemporaneous and permits separately labelled negative cohorts. The all-Tissue
baseline includes fallback captures, which can lack price observations. No old
observations are imported to manufacture a comparison.

The first genuine post-arming capture per race is retained. A newly accepted,
genuinely fresh post-arming production refresh can be that first observation;
later captures cannot replace it. The feature cutoff and capture must both be
after arming, before scheduled off, on the current local racing date, no more
than 60 seconds old, with no target outcomes. The writer rechecks the real clock
under its atomic lock. No already-stored book is scanned for new additions.

## Fixed descriptive bands

Positive selections only:

| Edge band (pp) |
| --- |
| +0.5 to <2 |
| 2 to <5 |
| 5 to <10 |
| 10+ |

Positive/neutral selections by frozen decimal market price:

| Price band |
| --- |
| <3.0 |
| 3.0 to <5.0 |
| 5.0 to <11.0 |
| 11.0+ |

Both band tables retain family and T1/T2 separation. No threshold optimization
or betting rule is introduced. Neutral is retained separately because it can
behave differently from a positive model-versus-market edge.

## Settlement and metrics

There is no new settlement algorithm or result writer. Reporting joins to the
exact same canonical production race/capture by timestamp, model/family and full
capture digest. Later market snapshots cannot supply outcomes for a mismatched
capture. A missing/mismatched source is explicitly unavailable, not a loss.
The normal existing production results workflow supplies outcomes; no additional
settlement command is needed.

NR/void horses remain frozen in capture provenance but are excluded from settled
counts, losses, expected winners and stakes. Their captured count is retained,
and NR/void status counts are exposed separately in the structured summary.
Pending results stay pending. PU, fall and unseated are canonical losses.

For every cohort, price band, edge band and family report:

- Captured selections, unique races, eligible settled selections and winning selections.
- Strike rate = winning selections / settled selections.
- Expected winners = sum of original frozen Tissue probabilities over settled selections.
- Actual/Model = fractional winning credit / expected winners; a winning dead-heat horse receives `1 / deadHeatDivisor` credit. Strike rates still count a winning selection as a hit.
- Price observations = settled selections with a frozen valid price and canonical numeric £1 P/L. £1 level-stake P/L is the sum of those persisted settlements, inheriting the existing canonical dead-heat convention unchanged. ROI = P/L / price observations. Unpriced observations do not become stakes or zero P/L.
- Selection-level Bernoulli log loss `−y log(p) − (1−y) log(1−p)` and Brier `(p−y)^2`, averaged across settled selections. `p` is the frozen probability and `y` is fractional dead-heat target credit. Numerical log arguments are clipped to `[1e-15, 1−1e-15]` only. These are binary selection scores, not full-race multiclass scores.
- Average market rank and edge pp use captured selections with known values.
- Pending, NR, void and exact-source-unavailable counts.

Probability and ranking are never recomputed after NR settlement. The comparison
uses the original capture's prediction, not a new model evaluation or a later
market. Proper-score and expected-winner denominators match settled selections;
ROI uses its explicitly reported priced denominator.

ALL T1 versus filtered T1, and ALL T2 versus filtered T2, use the same prospective
race period. Report filtered-minus-all differences in strike, Actual/Model, ROI,
binary log loss and average market rank. Negative reference cohorts are separate.
These are descriptive comparisons of differing selection mixes, not causal or
statistically independent evidence that filtering improves the model.

## Arming, epoch and immutability

Initialize once with `bun run tissue-positive-neutral:init`; exclusive creation
refuses to overwrite an existing ledger. `armedAt` records initialization and
`epoch` remains null until the first accepted genuine post-arming book. The epoch
includes reference-only books so ALL/negative/fallback comparisons share the
prospective period. Qualifying headline selections can still be zero at that point.
Page reads and `bun run tissue-positive-neutral:summary` do not capture anything.
There is no sync, historical date, backfill, replay or replacement command.

Source hashes pin the monitor method/capture/metrics, existing badge helper,
production projection/validation, normalization and all four frozen model
artifacts. Model version/checksum must remain fixed. Arming time, established
epoch, methodology, classifications, bands, prices and prior observations are
immutable. Source drift prevents additions; methodological changes require a
new versioned monitor rather than recategorizing existing observations.

The Research page section **TISSUE — POSITIVE / NEUTRAL MARKET BADGES** contains
the compact family T1/T2 headline and expandable badge, pooled Top2, price, edge,
all-versus-filtered and negative-reference tables. There is no new Today marker.
Monitor failures fail open for production and the other independent monitors.

## Validation

Focused synthetic fixtures and temporary ledgers cover badge inclusion, all four
families, Hurdle V2/V3 separation, fallback/negative references, exact captures,
bands, canonical settlement, NR/void/dead heats, price returns, selection scores,
Turf ties, no replay/replacement, source drift and Research rendering.

```sh
bun test src/lib/racing/tissue-positive-neutral.test.tsx src/lib/racing/tissue-generation.test.tsx src/app/racing/today/tissue-market-badge.test.tsx src/lib/racing/hurdle-v3-market-edge.test.tsx
bun run typecheck
bun run lint -- src/lib/racing/tissue-positive-neutral-method.ts src/lib/racing/tissue-positive-neutral.ts src/lib/racing/tissue-positive-neutral-metrics.ts src/lib/racing/tissue-positive-neutral.test.tsx scripts/track-tissue-positive-neutral.ts src/app/racing/research/forward-value/tissue-positive-neutral-monitor.tsx src/lib/racing/tissue-generation-sync.ts src/app/racing/research/forward-value/forward-value-page.tsx
```

No Python changes or full production build are required.
Setup validation passed: **50 targeted tests**, strict TypeScript typecheck and
targeted ESLint. The new monitor's source pins were verified after arming.
