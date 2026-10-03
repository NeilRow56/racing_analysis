# Jump Tissue V1

`JUMP_TISSUE_V1` is the first prospective Jump Tissue model. It is intended to
freeze the Stage 1 `J-T1` candidate: numeric Jump core plus the existing
prior-comment representation, with no market predictors and
`canonical_settlement_v2`.

## Versioning

- Model version: `JUMP_TISSUE_V1`
- Feature schema: `jump_tissue_stage1_numeric_prior_comments_v1`
- Implementation epoch: `2026-10-02T13:45:00.000Z`
- Training period: `2025-01-01` to `2025-12-31`
- Settlement dependency: `canonical_settlement_v2`
- Jump speed dependency: `jump_speed_v1`
- Forward tracker: `data/research/jump-tissue-forward-v1.json`

The model artifact is `data/research/jump-tissue-model-v1.json`. It is
self-checking: `loadJumpTissueModel` recomputes a SHA-256 checksum over the
artifact contents and rejects version, schema, dependency, training-window, or
parameter-shape drift.

## Feature Schema

Numeric features:

- official rating
- latest, best last-3, and average last-3 Jump speed
- trainer and jockey prior win rates and log prior-run counts
- days since run
- log prior Jump starts
- age
- weight carried
- race class
- distance in furlongs
- field size
- handicap flag
- soft/heavy going flag
- firm going flag

Each numeric feature is followed by a missingness flag. Missing numeric values
are represented as zero before model standardisation, matching the freeze
script and runtime scorer.

Comment features reuse the existing prior-comment representation:

- prior comment count, maximum three comments
- latest-comment phrase flags
- last-three phrase counts

Only comments with `race_datetime < target race_datetime` are admitted. The
target-race post-result comment is explicitly excluded. Forward records store
comment representation version, source observation cutoff, prior-comment count,
active phrase features, and chronology-safety confirmation.

## Prospective Rules

- No backfill: capture starts at the implementation epoch only.
- Frozen probabilities are never recomputed after capture.
- NH Flat is predicted when the model can score it, but is reported as a
  separate monitoring segment.
- Jump Tissue coverage is independent of the JPR-A coverage guard:
  `activeRunnerCount`, `predictedRunnerCount`, and `predictionCoverage`.
- Zero/sparse history is descriptive only: zero, one, two, or 3+ prior Jump
  starts.
- No betting rule is created.
- JPR-A, JPR-B, JPR-A0, AW Tissue, Turf Tissue, and TPR are not replaced.

## Stage 1 Diagnostic File

The Stage 1 diagnostic predictions file is expected at
`/tmp/jump-tissue-stage1-predictions.json`. It contains frozen 2026 diagnostic
probabilities, not the training coefficients. The freeze script records its
hash when present.

To create the scoring artifact, run:

```sh
bun --env-file=.env.local run scripts/freeze-jump-tissue-model.ts
```

This requires the local database so historical prior comments can be loaded
chronology-safely. If the database is unavailable, the artifact is not generated
because comment-trained coefficients would otherwise be fabricated.
