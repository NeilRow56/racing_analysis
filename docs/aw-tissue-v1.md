# AW Tissue v1

AW Tissue is prospective diagnostic monitoring. AW-D/A remain separate. No betting
rule is created and historical trackers are not rewritten.

## Frozen Model

- Version: `AW_TISSUE_V1`.
- Feature schema: `aw_tissue_stage1_features_v1`.
- Candidate: Stage 1 `AW-T0`, numeric only.
- Training: 2025-01-01 through 2025-12-31, 3,091 eligible races.
- Implementation epoch: `2026-10-02T05:16:55.000Z`.
- Artifact: `data/research/aw-tissue-model-v1.json`.
- Artifact checksum: `52376e5361e41da6b991aebfbb7f202cebb1f437b1259d55711824f55eead8a8`.
- Stage 1 source checksum: `073f19c1aadc53807d683fbeaa3d28c9f63e0fa5bffda7f73fe76a055389fc8c`.
- Dependencies: `aw_speed_v1`, `weight_performance_v1`, `canonical_settlement_v2`.

The checksum hashes the JSON artifact excluding its checksum property. The loader
checks the checksum against a pinned value and checks schema, versions, training
period and implementation epoch. Parameters, training means and scales were copied
from the Stage 1 artifact without retraining or coefficient changes.

The ordered inputs are Average L3 AW Speed, trainer prior strike rate, jockey prior
strike rate, declared field size, class, distance in furlongs, handicap status,
latest AW Speed, Best L3 AW Speed, Average L3 AW Performance, latest AW Performance,
OR, prior AW starts, age, draw and days since run. Each has a matching missingness
flag. Rates retain their canonical percentage units. The model uses the original
2025 means for missing values, original scales and coefficients, followed by race
softmax. Race-constant context cancels from softmax, as documented in Stage 1.
Ties use ascending runner UUID, with exactly one runner at each ordinal rank.

AW-T1 comments shadow is deferred: prospective comment capture, chronology and
provenance need a separate audited workflow. It does not affect this model.

## History and Coverage

Prior AW starts are counted from supported source races strictly before the target
datetime, including started non-finishers. This query matches Stage 1 and does not
restrict the count to timed races or runs with usable speed. It does not alter the
existing horse-metric calculations or implement a fallback model.

Known zero-history runners retain null AW speed/performance inputs. The original
model's mean imputation and missingness flags are explicit in each captured runner's
`rawInputs` and `modelInputs`; no substitute history is fabricated. Unknown counts
or unavailable canonical metrics produce an unavailable reason. A conditional-logit
book requires the whole active field, so an unsupported runner leaves the field
unpredicted. This is a mathematical completeness requirement, not a tuned minimum
coverage threshold. Coverage metadata is independent of the AW-D coverage guard.

## Forward Tracker

Tracker: `data/research/aw-tissue-forward-v1.json`.

Capture is strictly after the implementation epoch and before off. Result cards
and past races are rejected. Repeated sync preserves the first capture, model inputs,
probabilities, ranks and selected runners. A file lock and atomic rename prevent
concurrent requests from losing captures. Today requests also sync this new tracker.

Pending races are settled from imported results before new capture. Missing runners,
incomplete fields and unresolved starter outcomes remain pending. Non-runners are
void, started non-finishers lose, and dead heats use canonical divisors. New starters
after capture exclude that race from model analysis. Forecast prices never settle
market edges. Final SP and captured median/best returns use canonical settlement.

Probability quality uses complete settled fields without subsequent void runners.
Frozen probabilities are never renormalised after withdrawals. Dead-heat log loss
uses total winning probability mass; Brier uses equal winner shares. Top-k excludes
void selections, calibration excludes void runners, and AW-D comparison requires
both frozen leaders to have valid settled labels. These conventions are shown in
the summary. Early forward samples do not establish superiority.

## Commands and Displays

```sh
bun run aw-tissue:sync
bun run aw-tissue:today
bun run aw-tissue:summary
```

Sync defaults to the current local racing date. An optional date is accepted for
pending settlement/reporting, but historical pre-race capture is never permitted.
Today CLI reads frozen records. The Today page shows AW Tissue probability/rank in
an AW-only column alongside AW-D. It never recalculates previously captured books.

Forward Value has a separate AW Tissue section and separate CLI output. Its price
records live in the new AW tracker; the existing Forward Value tracker is not
rewritten or reused for AW Tissue rows. Pricing uses `median_bookmaker_v1`, with
quote provenance, best price and forecast recorded separately. No forecast fallback
is permitted. Early, T-180 and T-60 use the existing snapshot windows, freeze the
first qualifying quote and leave missed windows null; Final SP arrives at settlement.

AW model agreement joins only clean median-bookmaker AW-D observations captured
after the AW Tissue epoch, on the same race and a common snapshot stage. Historical
AW-D observations are never retrospectively augmented. The display reports common
races, same/different leaders and the four positive-edge combinations, without rules.
