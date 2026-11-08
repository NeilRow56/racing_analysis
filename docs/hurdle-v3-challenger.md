# Hurdle V3 challenger

`HURDLE_TISSUE_V3_CHALLENGER` is a separately fitted, frozen research challenger.
It is **not registered in production**. V2 remains unchanged and active. A separate
[prospective shadow ledger](hurdle-v3-prospective-shadow.md) now pairs new genuine
pre-off V2 captures with the unchanged sealed V3 scorer. There is no V3 Today
selection display. Historical and November diagnostic reconstructions are never
prospective V3 evidence. The artifact's original `prospectiveStatus` is sealed
development metadata; activation lives in the separate shadow ledger.

Artifact: `data/research/hurdle-tissue-v3-challenger.json`.
Schema: `hurdle_only_canonical_starters_mean_imputed_v1`.
The loader validates the checksum, feature names, parameter shapes, training
period, inactive prospective status and non-positive missingness increments.
The sealer uses exclusive creation and refuses to overwrite a different file.

## Input contract

Horse history is strictly Hurdle-only and before the feature cutoff, excluding
the target race, NR/void and unresolved records. Starts include canonical
finishers and non-finishers. Latest Speed is the actual latest Hurdle run's
rating, even when unavailable. Best/average L3 use available ratings within the
last three Hurdle starters, including unrated/DNF starts in that fixed window.
Flat, AW, Chase and bumper runs cannot enter these fields.

Trainer/jockey ability is explicitly generic across codes. Their denominator is
all valid, settled prior starters, including PU/F/UR and other canonical losers.
An unknown participant prior is represented by mean imputation and its own
non-positive absence gate, not a zero-rate assertion.

Numeric missing values use the observed **training-period mean**. No-history and
history-without-Speed flags are mutually exclusive. Missingness coefficients
are constrained non-positive; the reported net package is the raw flag
increment against mean-imputed numeric values with gates off. Centred flags can
have a different absolute score baseline, which is not an absence reward.

The final model uses OR, latest/best/average Hurdle Speed, trainer/jockey rates
and log starter exposure, completion fraction, explicit absence gates, log
Hurdle starts, and three Hurdle-only comment channels. A single latest nonempty
comment must be at most 180 days old and decays with a 90-day half-life. Positive
finish and weakening flags are exclusive; jump-error is a separate mechanism.
Age, weight, recency, latest failure types and OR/Speed rank context were tested
but not selected. Race-constant context cannot identify a linear softmax effect.

## Development and reproduction

The selection protocol is embedded in the artifact. Jan–Aug 2025 trains the
candidate fits; Sep–Oct 2025 selects L2 and secondary groups; Nov–Dec 2025 can
fall back to core. The selected specification is refitted on all 2025. The 2026
and November V3 evaluations occur only after sealing. Earlier Atlas/V2 work
already saw 2026, so this is later chronological evaluation rather than a fully
blind design holdout. Historical publication times are not certified.

Use the established `scraper/.venv/bin/python` interpreter. Install the optional
diagnostic dependency with `scraper/.venv/bin/python -m pip install -r scraper/requirements-hurdle-v3.txt`.
Run sequentially:

```sh
# Preserve the V2 ledger snapshot in a new temporary working directory first.
bun --env-file=.env.local scripts/build-hurdle-v3-dataset.ts /tmp/hurdle-v3-rebuild
OPENBLAS_NUM_THREADS=1 VECLIB_MAXIMUM_THREADS=1 OMP_NUM_THREADS=1 scraper/.venv/bin/python scripts/train-hurdle-v3-challenger.py
bun scripts/seal-hurdle-v3-challenger.ts
OPENBLAS_NUM_THREADS=1 VECLIB_MAXIMUM_THREADS=1 OMP_NUM_THREADS=1 scraper/.venv/bin/python scripts/evaluate-hurdle-v3-challenger.py
```

Before completing Python changes, run:

```sh
bun run typecheck:python scripts/evaluate-hurdle-v3-challenger.py scripts/test-hurdle-v3-training.py scripts/train-hurdle-v3-challenger.py
scraper/.venv/bin/python scripts/test-hurdle-v3-training.py
```

The typecheck command uses the configured interpreter and fails on warnings as
well as errors. Use `bun run typecheck:python` to check all project Python code.

The extractor requires the existing `/tmp/winner-atlas` inputs and a
`/tmp/hurdle-v3-rebuild/v2-forward.json` copied from the generation ledger. It
uses a read-only PostgreSQL connection and writes datasets only under `/tmp`.
For a repeat investigation use a **new temporary directory** and explicit CLI
paths. Do not overwrite the frozen artifact; a materially revised candidate
requires a new version. Training draft creation is also exclusive.

All numerical work is deterministic, with no random seed, full-model V2 warm
start, ROI optimisation or prospective-result selection. The pure feature
builder and scorer do not write data or call production capture/settlement.
Processes guard against RSS above 4 GiB and large stages run sequentially.

## Current decision

**B. V3 FIXES SEMANTICS BUT NEEDS MORE DEVELOPMENT.** V3 improves 2026 loss,
Brier, ECE and Top1, but worsens 2025 loss/Brier/Top1/Top2 and reduces Top2 in
both years. Conditional negative Best-L3 Speed and positive jump-error comment
coefficients remain questionable. Missing OR is not the dominant global driver
but remains influential and needs subgroup monitoring. No production promotion
is made. Prospective shadow capture is separately armed without changing the model.
