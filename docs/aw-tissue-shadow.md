# AW Tissue V1 / Parity Shadow Forward Validation

This is a separate diagnostic, with no application integration or automatic scheduling. Production AW_TISSUE_V1, Forward Value, price capture and settlement remain unchanged. This phase evaluates prospective probability quality; it does not recommend promotion.

## Frozen Candidate

`data/research/aw-tissue-parity-shadow-model-v1.json` copies the exact AW-R2 means, scales and coefficients from the completed parity research, without refitting. Version: `AW_TISSUE_PARITY_SHADOW_V1`; schema: `aw_tissue_parity_shadow_features_v1`. Content checksum: `a31c8be2f1e86034bf22ae8955ca59bbda2f3f18e4ab1529bf6e8212b7d1bf1e`. The loader pins this checksum, the V1 checksum, feature order and diagnostic identity.

There are 39 columns: the existing 16 V1 numeric features, `log_trainer_prior_runs`, `log_jockey_prior_runs`, the 18 matching missing indicators, then `prior_comment_count`, `last_weakened`, `last3_weakened_count`. Numeric nulls use candidate training means; all columns use candidate training standardization; scores use race softmax. No market inputs or post-calibration are used.

Comment policy is unchanged from AW-R2: latest three nonempty prior source comments across race families, target race excluded, matching `/\bweakened\b/i`. Only already-observed earlier races can enter a live capture. Raw comments, source race times, participant depths and full input vectors are stored. Missing participant identity uses the canonical zero-run depth convention, not an invented fallback model.

Training provenance is recorded in the artifact: 2025-only, 3,091 races / 28,535 runners, 90 epochs, L2=0.02, learning rate `0.12/sqrt(1+epoch/10)`. Research source checksum: `d0cfc60550f12b7a6702721448efb0bf3148334c7a63284dce860984b05a3653`.

## Commands

Run from the repository root. Existing production trackers must independently capture V1 observations and subsequently update their own prices/results through their existing workflow.

```sh
# Capture eligible future races and copy already-frozen source updates.
bun run sync:aw-shadow

# Read-only cumulative comparison; no database or tracker write required.
bun run scripts/track-aw-tissue-shadow.ts summary
```

`sync` accepts an optional racing date after the command. It never calls a production sync/mutation, takes a new market-price snapshot or changes a stored production probability. It reads today's canonical metrics and prior comments from the database, then writes only its independent shadow observation file. Run it early enough before races, and again later to persist source prices/outcomes. No scheduler or production entry point was changed.

Both commands write `/tmp/aw-tissue-shadow-comparison.md` and `/tmp/aw-tissue-shadow-comparison.json`. The JSON report includes every runner's inputs, probabilities, ranks, source snapshot prices/times, implied probabilities, both edges and canonical price settlement.

### Operational Guard

The wrapper is independent of every production sync: existing daily/manual commands are unchanged. Run `bun run sync:aw-shadow` immediately after the normal AW V1 sync, early before racing; repeat it after normal price-window syncs and after settlement. An optional date is supported, for example `bun run sync:aw-shadow 2026-10-07`; this never permits post-off historical capture.

Console warnings carry `AW_SHADOW_DIAGNOSTIC_WARNING` and are included in the Markdown/JSON reports. `NO_CAPTURES` means loaded AW racecards have zero paired prospective captures; `PARTIAL_CAPTURES` lists uncovered cards. Already captured races count toward coverage, so an idempotent repeat does not generate a false missed-capture warning. `UNPRICED_CHANGED_LEADER` identifies a different candidate Top-1 with no clean frozen price at any supported stage. `PRE_SHADOW_PRICE` identifies existing market snapshots rejected because they predate shadow prediction; only those value observations are excluded, not the probability race or later qualifying stages. Warnings do not alter capture eligibility, prices, predictions or settlement. Today's racecard coverage is checked during sync; summary stays database-free.

## Prospective Observations

Observations live in `data/research/aw-tissue-parity-shadow-forward-v1.json`, with atomic, locked updates and immutable predictions. Start epoch: `2026-10-07T03:57:11.000Z`. A race requires an existing clean complete V1 pre-race record, a matching current active field and V1 base inputs, no result evidence, and completion of all shadow input reads strictly before scheduled off. V1 probabilities/ranks are copied from its original snapshot and checked against its frozen inputs. The candidate uses those same base inputs plus the newly observed depth/comment inputs. The report retains both capture times; they are not asserted to be simultaneous.

Matching failures are skipped and counted in sync output. The report counts existing V1 races lacking a paired capture. Nothing is backfilled: the 60 existing V1 records at implementation have no frozen candidate-depth/comment snapshot and supply zero true prospective pairs. Retrospective/imported rows, if separately added in future research, are explicitly excluded from every prospective metric and identified by capture mode.

## Prices and Settlement

The diagnostic reads `data/research/aw-tissue-forward-v1.json` and `data/research/forward-value-v1.json`; it does not write either. It reuses existing AW Tissue leader or clean AW Forward Value leader/tissue price snapshots, with the existing median-bookmaker basis, at `early`, `t180` and `t60` stages. Once copied, a stage's price is immutable. Snapshot capture must be at or after the shadow prediction and strictly before the frozen scheduled off. A pre-shadow early snapshot is excluded, so later price-stage capture is often necessary. Missing stages/prices remain missing.

Existing sources price selected leaders rather than every runner. A changed candidate leader often has no frozen price. Reports distinguish all observed priced runners from each model's own rank-1 population, show coverage, and never substitute a forecast, current quote or final SP. These incomplete price populations must not be interpreted as whole-field or matched-leader value comparisons.

Edges are percentage points, `(p - 1/price) * 100`. The fixed cumulative thresholds are `>0pp`, `>=2.5pp`, `>=5pp`, `>=7.5pp`, `>=10pp`. They overlap; stages must not be pooled as independent bets. No retrospective threshold selection occurs.

Outcomes are copied from the unchanged V1 tracker once its canonical settlement is known. Frozen-price profit uses the existing `settleSelection`; the value observation is checked with the existing `isCleanPhase2Observation`. Started non-finishers are losses. Non-runners are excluded from clean value observations, and a field with a later void runner is excluded from full-field probability quality without renormalization. Dead heats use canonical settlement divisors, winner probability mass for log loss and equal winner shares for Brier. Calibration/strike use the existing win-indicator convention. Field changes are excluded.

`summary` merges source prices/results in memory, so it can show the latest known outcomes without writing the independent tracker. It does not query or reconstruct historical predictions. A source tracker that has not yet settled a race leaves the diagnostic pending.

## Verification

Tests cover frozen artifact identity/tampering, chronology, missingness, normalized books, market invariance, production isolation, pre-off and field guards, immutable source prices, canonical non-finisher/non-runner/dead-heat behavior, retrospective separation, fixed thresholds, leader-change coverage and concurrent independent storage.
