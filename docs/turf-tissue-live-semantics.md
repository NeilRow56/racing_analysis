# Canonical Turf Tissue methodology: v3

The active model for new Turf scoring is **`tissue_model_v3`**. Its frozen artifact
is `data/research/tissue-model-v3.json`; prospective books start empty in the
separate `data/research/tissue-forward-v3.json` tracker. The scorer marker is
`TURF_TISSUE_V3_PRERACE`, with implementation epoch
**2026-10-19T20:20:55.000Z** (21:20:55 BST). Actual use begins with the first new
capture by this implementation. No historical observations were backfilled.

The user explicitly authorized both a separate rebuild/refit to remove count
leakage and promotion of v3 for future live scoring. V1/v2 artifacts and all
existing prospective records are preserved for historical comparison. V3 has
newly fitted means, scales and coefficients; it is not v2 with relabelled weights.

## Inputs and timing

The 95 columns retain their exact names/order: 26 numeric values, 26 missingness
flags and 43 prior-comment features. Numeric nulls become zero with missing flag
1; a real zero is available, with flag 0. Fixed training means/scales standardize
inputs. Conditional-logit scores use within-race softmax and competition ranks.
Market odds, SP, target result, target comment, betting returns and prior Tissue
predictions are absent from the model vector.

Six performance/Today's Rating inputs use only the Turf family aggregates:
`latestTurfPerformanceRating`, `bestTurfPerformanceLast3`,
`averageTurfPerformanceLast3`, `latestTurfTodaysRating`,
`bestTurfTodaysRatingLast3`, `averageTurfTodaysRatingLast3`. The six missing flags
use that same Turf-only availability. Latest selects the latest usable Turf
value. Last-three selects the last three completed timed prior starts across
families first, then drops unavailable Turf values, without replenishing slots.
Performance = Turf raw speed + historical carried lb - 168; Today's Rating =
performance - (target carried lb - 168). Missing required weights stay missing.

Both training and inference ignore `actualRunnerCount`. `field_size` is the
racecard's declared count; `draw_fraction` is draw divided by that declared count,
with the original null/zero availability rules. Results cannot supply either
column, or the Turf prospective-field completeness check. Do not substitute a
post-race starter count or result-list cardinality.

Live v3 requires a complete declaration field and an explicitly loaded history
cutoff no later than capture. It refuses post-off, pre-epoch, result-bearing,
incomplete or nonfinite captures. Horse history, rating context and trainer/
jockey history are bounded by the fixed capture cutoff. Comments at/after that
cutoff are excluded even if earlier than target off. Existing recency definitions
remain relative to target off; only available prior history can contribute.
Other race families retain their original loaders and behavior.

Each new v3 book stores `featureCutoffAt`, model version/checksum, scorer marker
and the actual 95 `modelInputs` for every runner, alongside frozen probabilities
and ranks. This supports exact replay of new observations. Scoring timestamp is
taken after feature loading; history can conservatively end earlier.

## Reproducible fitting and validation

```sh
bun run tissue:v3:build
```

`scripts/refit-turf-tissue-declarations.ts` reads the original caches without
rewriting them, applies `declarationOnlyTurfFeatures` to copies, and reconstructs
strictly prior comments through read-only PostgreSQL. It first verifies all 95
original v2 training means/scales exactly. V3 uses the same 2025 population
(4,598 races / 42,947 runners), 90 optimization epochs, L2 penalty and 95-column
model specification. No hyperparameter search or profitable filters are used.
The 2026 chronological holdout contains 3,935 races / 36,223 runners.

Only `field_size` and `draw_fraction` change scaler values; joint refitting
changes 85 coefficients. Holdout log loss is 2.001119453 versus 2.001080948 for
v2 on the same declaration-only inputs; Brier is 0.835654893 versus 0.835650372.
This is a leakage/definition repair, not evidence of improved betting performance.
Validation output: `/tmp/turf-tissue-v3-validation.json`.

The builder refuses to overwrite frozen v3 with a different checksum: a changed
fit requires a new version. The model loader verifies the v3 schema, positive
scales, finite parameters, declaration-only semantics and content checksum.

Historical cached declarations, age/OR/weight and comment text are retrospective
metadata rather than immutable early-capture snapshots. The revised definitions
remove identified target-result inputs and enforce pre-race chronology, but
cannot prove the publication/revision time of every historical metadata value.
Do not describe historical evaluation as an exact early-capture replay. New live
input snapshots address reproducibility going forward; they do not backfill that
missing historical provenance.

## Runtime and cohorts

`tissue:sync`, `tissue:summary`, `tissue:today`, Rank 1 scoring, current Turf book
readers and Turf settlement use v3 by default. The model has its own forward
tracker; it does not migrate v2 books. `tissue:v1:summary` and `tissue:v2:summary`
remain available to inspect archived models and books.

Rank 1 monitoring separates v3, the earlier repaired-v2 scorer
`TURF_TISSUE_V2_LIVE_FIX` (epoch 2026-10-19T20:13:37.000Z), and original legacy
Turf observations. The shared rank-one ledger remains append-only for captures;
per-race deduplication prevents a new counterfactual selection for an already
captured race. New value snapshots carry model version/checksum; v3 cannot enrich
or reattribute an older model's observation. Current Turf value displays use the
v3 cohort; the detailed UI retains a labelled v1/v2 historical section. Financial
settlement, price capture, qualifying thresholds and ROI/A-E formulas are unchanged.

V2's existing artifact is byte-identical to its original version. Its previous
live mapper repair is retained, but it is no longer the canonical model because
its original fit used retrospective result-list counts. Stored v2 predictions
are never recomputed. No production sync or settlement was run for this change.

## Contract for the subsequent AW rebuild

Use this v3 methodology as canonical:

- AW-only training rows and separately fitted means, scales and coefficients.
- AW-only rating aggregates with the same prior-start windows, weight formulas,
  availability rules and missingness flags; no Turf/Jump substitution.
- Declaration-only count inputs in both fitting and live scoring.
- Prior-only history, capture-time live cutoffs, result/post-off guards, frozen
  feature vectors, distinct model/scorer versions and prospective cohorts.
- The same feature ordering, optimizer and softmax/rank definitions unless a
  separately reviewed AW change is explicitly requested.

AW, Hurdle and Chase models were not rebuilt or changed here.
