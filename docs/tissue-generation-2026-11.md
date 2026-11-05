# Tissue generation — November 2026

MODEL GENERATION: **TISSUE_GENERATION_2026_11**

DEVELOPMENT CUT-OFF: **2026-11-05T06:57:32.000Z**

NEW PROSPECTIVE EPOCH: **2026-11-05T07:26:36.629Z**

One probability model per family produces the complete runner book and both T1/T2 rankings. T1 and T2 are not separately trained models. The new ledger begins with zero captures; implementation did not force a live capture or settlement.

## Specification and development

The established core coefficients and feature definitions are preserved. The new family models add small, regularised adjustments to the frozen racing logits, followed by race softmax. This limits fitting to at most six additional coefficients rather than refitting 79–95 core parameters on a small recent sample. Each artifact embeds its base parameters and adjustment in the existing names/means/scales/weights format, with a pinned checksum. There is no automatic retraining.

Inherited core training information includes the original 2025 model development. The new context development uses 305 complete, single-winner, all-starter frozen race books (2,766 runners) from the existing four Value capture files, plus strictly pre-capture canonical completion history and as-of Jump Speed availability. All runners in each accepted field are used, not just Value 1. Race books with unresolved outcomes, any NR/void, or multiple winners are excluded from fitting. This narrow, price-complete development population is smaller than the broader future family-model cohort; transfer is not established.

The fixed development procedure orders each family by capture timestamp and race ID, uses the first 70% for fitting and last 30% for regularisation selection, tests only L2=0.2 and L2=2, and retains an adjustment only when its later-block log loss beats the frozen base. The selected specification is then fitted on all eligible development races before freezing. No ROI, prices, market rank, Value rank, model/market ratio or market movement enters scoring or model selection. Capture-order splits can divide same-day capture batches; they are development comparisons, not a clean real-time or untouched holdout. Both portions, the old research period and the Chase reference informed development.

Feature effects are conditional on the existing core. Speed rank 2–3 is exposed as information, never a manual rejection. Its estimated coefficient is not forced negative; in the small Turf/AW development fits it is positive after conditioning on the base model. This must not be misrepresented as independent confirmation or disproof of the earlier selected-Tissue watch.

## Family models

| Family | Old model | New model | Change |
| --- | --- | --- | --- |
| Turf | tissue_model_v3 | TURF_TISSUE_V4 | Frozen v3 core + Speed rank 2–3, missing-Speed rank, same-OR relative Speed gap |
| AW | AW_TISSUE_V2 | AW_TISSUE_V3 | Frozen v2 core/surface history + the same three context features; inherited Speed slot contains AW Speed |
| Hurdle | JUMP_TISSUE_V1 | HURDLE_TISSUE_V2 | Frozen Jump core + six Hurdle-specific fitted context terms: Speed rank 2–3, missing Speed, recent non-completion, latest PU, completed-last-three fraction, missing completion history |
| Chase | JUMP_TISSUE_V1 | CHASE_TISSUE_V2 | Promote exact frozen CHASE_SHADOW_V1 coefficients. Extra Speed-rank/usable-count adjustment tested but not retained |

Same-OR gap is (runner Best L3 Speed − mean usable Speed among other runners with the same frozen OR) / 10. With no comparable peer or missing Speed/OR it contributes zero; there is no betting threshold or hard-coded direction. Speed ranks use the complete captured field with competition ties and explicit missing flags.

Hurdle prior runs are filtered strictly before capture and exclude the target race, NR and void. Completion uses the existing canonical helper: a numeric finish position is completion; pulled-up/fell/unseated/brought-down/refused are non-completion. Recent means the existing <=30-day recency condition. Latest-PU, last-three completion fraction and missing-history status are separate inputs; a missing history is not a non-completer.

Chase usable Jump Speed count is the underlying numeric 0–3 count in the existing eligible recent all-code window, not a GOOD/CAUTION/HIGH label. Four context inputs were exposed and tested. The later-block base log loss was 1.5597; neither fitted context candidate beat it. Therefore the frozen Chase production artifact has zero adjustment coefficients and scores exactly as the promoted 79-input Shadow base. This is a quality-based omission, not a manual reliability rule. The new clean monitor deliberately adds no reliability subgroup dashboard.

## Research findings reconciled before use

The supplied examples reproduce from the project’s existing frozen files: broad non-red T1 = 386 settled / 101 winners / 26.17% / Actual-model 1.1443; separate complete-price complement = 358 selections / +£16.27 / +4.54% ROI. Overall broad T1 = 534 settled / 134 winners / 25.09% / Actual-model 1.0707. Its separate 491-selection monetary cohort has −6.07% ROI. These denominators must not be mixed.

Hurdle recency also reconciles: recent completers 665 settled, Top3 29.575%, Actual/Market 1.0866; recent non-completers 57 settled, Top3 28.571%, Actual/Market 0.5903; latest-PU 108 settled, Top3 19.0%, Actual/Market 1.0098. Actual/Market is a winner-credit calibration ratio; the Top3 rate has its own eligible-field denominator. These figures are previous research used in development, not validation of the new models.

## Chase promotion reconciliation

| Model | Races | Runners | Log loss | Calibration error | Top1 winners | Top2 winners |
| --- | --- | --- | --- | --- | --- | --- |
| JUMP_TISSUE_V1 | 1220 | 9083 | 1.8583 | 1.58% | 303 | 547 |
| CHASE_SHADOW_V1 | 1220 | 9083 | 1.8251 | 0.76% | 321 | 554 |

The original 1,220-race / 9,083-runner 2026 comparison was reproduced exactly to its published precision. Compatible v4 cached features cover through 15 October; 73 additional Chase targets for 16–29 October were reconstructed in explicitly read-only PostgreSQL sessions. Prior comment vectors, frozen artifacts and the original complete-field/single-winner rules were used. The original Shadow artifact is unchanged and pinned by both its original file/model hashes. This prior Shadow comparison is reference/development evidence for the newly selected generation, not prospective validation of it.
| 2026 quarter | Old races | Old log loss | Shadow log loss | Old calibration | Shadow calibration |
| --- | --- | --- | --- | --- | --- |
| 1 | 509 | 1.8589 | 1.8251 | 1.74% | 1.60% |
| 2 | 377 | 1.9128 | 1.8666 | 1.67% | 0.72% |
| 3 | 203 | 1.8177 | 1.8018 | 1.57% | 1.80% |
| 4 | 131 | 1.7615 | 1.7416 | 2.79% | 2.13% |


## Old vs new model quality — full DEVELOPMENT population

These are apparent fitted-development results on identical fields, not unseen validation. Races contain one winner and all captured runners became starters. Calibration error is sum of absolute observed-minus-expected winners in fixed probability bins (<10%, 10–<15%, 15–<20%, 20–<30%, 30%+) divided by runners; Brier is the mean race sum of squared probability errors. Top-k counts are winning races covered by the deterministically ordered top k; mean winner rank uses that same UUID tie break. Live Turf retains native competition-rank ties.
| Family/model | Races | Runners | Log loss | Calibration error | Race Brier | Top1 W | Top2 W | Top3 W | Mean winner rank |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TURF OLD | 71 | 743 | 2.1164 | 0.55% | 0.8591 | 19 | 31 | 38 | 3.9155 |
| TURF NEW | 71 | 743 | 2.0913 | 0.45% | 0.8556 | 20 | 28 | 38 | 3.9155 |
| AW OLD | 79 | 781 | 2.1748 | 2.44% | 0.8751 | 14 | 33 | 45 | 4.1899 |
| AW NEW | 79 | 781 | 2.1451 | 0.77% | 0.8679 | 11 | 28 | 43 | 4.2532 |
| HURDLE OLD | 94 | 840 | 1.9580 | 1.39% | 0.8177 | 28 | 49 | 56 | 3.7553 |
| HURDLE NEW | 94 | 840 | 1.9415 | 1.15% | 0.8135 | 28 | 45 | 57 | 3.6383 |
| CHASE OLD | 61 | 402 | 1.7379 | 2.18% | 0.7980 | 18 | 32 | 37 | 3.2623 |
| CHASE NEW | 61 | 402 | 1.7298 | 1.97% | 0.7982 | 18 | 30 | 38 | 3.1475 |

Log loss improves on all four apparent full-development populations, but Top2 winner counts fall in every family; AW Top1 also falls. Chase Brier is slightly worse in this small recent sample. This is not demonstrated improvement in T1/T2 hit rate. The user’s requested quality-first consolidation has been frozen with these trade-offs recorded; future results will decide performance.

## Chronological development selection

| Family | Earlier races | Later races | Later begins (capture UTC) | Old LL | Base LL | Context L2=.2 LL | Context L2=2 LL | Retained context |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TURF | 49 | 22 | 2026-10-30T05:08:54.583Z | 2.1568 | 2.1568 | 2.1174 | 2.1401 | True |
| AW | 55 | 24 | 2026-10-30T05:08:54.583Z | 2.2002 | 2.2002 | 2.1716 | 2.1866 | True |
| HURDLE | 65 | 29 | 2026-11-01T05:51:30.664Z | 1.8223 | 1.8223 | 1.8340 | 1.8180 | True |
| CHASE | 42 | 19 | 2026-11-01T05:51:30.664Z | 1.5417 | 1.5597 | 1.5943 | 1.5652 | False |

For Chase, the base is Shadow and differs from the old shared Jump control. On the latest 19-race development portion the old shared Jump model is better than Shadow; the reproducible 1,220-race, all-quarter Shadow advantage supplies the stronger base-selection evidence. No clean new-generation holdout is claimed. Model/specification selection used all these observations before the epoch.

## Chronological blocks — fixed descriptive calendar portions

The reporting blocks are 20–27 October, 28–31 October, and 1–4 November in this snapshot. Both old and final frozen models are evaluated on the same fields in each block. The final adjustment was trained on all development blocks, so these are stability descriptions, not independent forward tests.
| Family | Block | Model | Races | Runners | Log loss | Calibration error | Top1 W | Top2 W | Top3 W | Mean winner rank |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TURF | 2026-10-early | OLD | 39 | 377 | 2.0936 | 1.32% | 10 | 18 | 21 | 3.8462 |
| TURF | 2026-10-early | NEW | 39 | 377 | 2.0891 | 1.88% | 9 | 14 | 21 | 3.8974 |
| TURF | 2026-10-late | OLD | 19 | 221 | 2.1057 | 2.52% | 6 | 10 | 13 | 3.1053 |
| TURF | 2026-10-late | NEW | 19 | 221 | 2.0994 | 2.03% | 7 | 10 | 12 | 3.3158 |
| TURF | 2026-11-early | OLD | 13 | 145 | 2.2001 | 1.58% | 3 | 3 | 4 | 5.3077 |
| TURF | 2026-11-early | NEW | 13 | 145 | 2.0859 | 1.56% | 4 | 4 | 5 | 4.8462 |
| AW | 2026-10-early | OLD | 40 | 399 | 2.2166 | 1.57% | 9 | 16 | 21 | 4.4500 |
| AW | 2026-10-early | NEW | 40 | 399 | 2.2301 | 2.76% | 5 | 15 | 18 | 4.9000 |
| AW | 2026-10-late | OLD | 18 | 185 | 2.0868 | 4.86% | 3 | 10 | 13 | 3.5000 |
| AW | 2026-10-late | NEW | 18 | 185 | 1.9660 | 5.69% | 4 | 8 | 14 | 2.7778 |
| AW | 2026-11-early | OLD | 21 | 197 | 2.1707 | 2.92% | 2 | 7 | 11 | 4.2857 |
| AW | 2026-11-early | NEW | 21 | 197 | 2.1367 | 2.38% | 2 | 5 | 11 | 4.2857 |
| HURDLE | 2026-10-early | OLD | 39 | 357 | 2.1082 | 2.35% | 10 | 16 | 18 | 4.2821 |
| HURDLE | 2026-10-early | NEW | 39 | 357 | 2.0893 | 1.61% | 11 | 16 | 19 | 3.9487 |
| HURDLE | 2026-10-late | OLD | 24 | 191 | 1.8607 | 2.55% | 8 | 14 | 15 | 3.5833 |
| HURDLE | 2026-10-late | NEW | 24 | 191 | 1.8410 | 3.49% | 8 | 14 | 15 | 3.5000 |
| HURDLE | 2026-11-early | OLD | 31 | 292 | 1.8444 | 3.44% | 10 | 19 | 23 | 3.2258 |
| HURDLE | 2026-11-early | NEW | 31 | 292 | 1.8334 | 3.41% | 9 | 15 | 23 | 3.3548 |
| CHASE | 2026-10-early | OLD | 25 | 174 | 1.9106 | 2.53% | 6 | 10 | 12 | 3.9600 |
| CHASE | 2026-10-early | NEW | 25 | 174 | 1.8553 | 4.13% | 7 | 12 | 13 | 3.7200 |
| CHASE | 2026-10-late | OLD | 15 | 102 | 1.6318 | 6.71% | 4 | 8 | 9 | 2.8000 |
| CHASE | 2026-10-late | NEW | 15 | 102 | 1.6780 | 7.78% | 4 | 6 | 12 | 2.6000 |
| CHASE | 2026-11-early | OLD | 21 | 126 | 1.6081 | 5.11% | 8 | 14 | 16 | 2.7619 |
| CHASE | 2026-11-early | NEW | 21 | 126 | 1.6172 | 4.72% | 7 | 12 | 13 | 2.8571 |


## T1/T2 agreement and movement

| Family | Races | T1 agreement | T2 agreement | Top2 set agreement | T1 only changes | T2 only changes | Both positions change | Both set members replaced |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TURF | 71 | 69.01% | 54.93% | 70.42% | 1 | 11 | 21 | 1 |
| AW | 79 | 69.62% | 45.57% | 54.43% | 3 | 22 | 21 | 2 |
| HURDLE | 94 | 97.87% | 90.43% | 91.49% | 0 | 7 | 2 | 0 |
| CHASE | 61 | 60.66% | 44.26% | 55.74% | 2 | 12 | 22 | 2 |

Both positions changing includes swaps; both set members replaced is the stricter zero-overlap measure. These are development-race comparisons, not retrospective replacement of stored ranks.

## Freeze and artifacts

| Family | Frozen artifact | Checksum |
| --- | --- | --- |
| TURF | data/research/tissue-generation-2026-11-turf.json | e106fadd07263b1fcc4ece821a4bfcad645faeae873db026433a4902eabbe3fe |
| AW | data/research/tissue-generation-2026-11-aw.json | c8f75faa0aeacc88ba76f100e7d154a872bc9b2ee31a5a42d18e611e3e64f9a5 |
| HURDLE | data/research/tissue-generation-2026-11-hurdle.json | 53defc50d717aba63c80c9f3c01c4df4360b709f6f4a21509a514179e23cce90 |
| CHASE | data/research/tissue-generation-2026-11-chase.json | be65702490403f6a287d11ecb19307a67b58ca975ee7bd9ece71b4e0d759aa81 |

Each new artifact records the old base version/checksum, complete base and adjustment feature lists/scalers/coefficients, development cut-off, dataset/source hashes, selected regularisation, sample size and prospective epoch. The pinned loader rejects wrong identities, parameters or epoch. The manifest records the repository HEAD, source SHA-256 hashes for scoring/features/context/capture/configuration, and marks the implementation as uncommitted; the model checksum is the concrete model identifier. Models are loaded, never fitted, by capture/Today/settlement. A new version is required for any future parameter change.

The original model files, all original coefficients/artifacts, prospective epochs and existing research JSON remain unchanged. The old ACTIVE_TURF_TISSUE_CONFIG and other legacy scorer exports remain compatibility inputs for historical reporting and the unchanged Value layer; the new generation’s explicit family registry owns active Today Tissue and the new clean monitor.

## Retired active research and archive

ARCHIVED, NOT DELETED: **YES**. The active research page now shows one clean Tissue generation monitor alongside independent Value monitoring. Previous Tissue headline performance, Speed rank 2–3/complement and input-reliability views, Hurdle recency, Chase Speed reliability, old rank-one tracking and paired Tissue challengers are in the labelled historical archive. The Winter 2026 dashboard and Chase Shadow comparison remain accessible with an archive banner. All old data/reports remain in place.

Normal morning/late workflows stop the old Turf/AW/Jump, rank-one, Hurdle recency, paired/challenger and AW-shadow captures. Capture/append boundaries also reject post-epoch additions to those ledgers, and Chase Speed sidecar capture stops, including when Value sync calls it. Old pending observations continue through existing canonical settlement. Live/after use research:settle for the new ledger and print the new summary; they do not create new-generation observations. Independent OR/Speed, rating, Forward Value and Value 1 work is retained.

## Today and agreement

Today uses the new family-model probabilities/ranks only on eligible post-epoch captures. A missing new capture shows unavailable rather than borrowing an old rank or reconstructing a finished race. Familiar T1/T2/T3+ hierarchy is preserved. New-generation rows no longer display the pale-red Speed warning, amber Tissue Data caution, or competing Chase Shadow badges. The old non-red research shortlist is retired from the active Today view. Historical books retain their original fields.

T1=V1 now compares the new active Tissue T1 against the existing active Value 1 V2 flag. Value’s frozen probabilities, scores, ranking formula, experience gate, quotes and records are unchanged and are not overwritten with new Tissue outputs. The new Tissue model does not consume Value or bookmaker information.

Unrelated current odds, the blue captured-price context marker, OR/Speed/JPR ratings and ordinary Speed-quality information remain available; they are not the retired Tissue input-reliability watch.

## New clean Tissue monitor and settlement

NEW ACTIVE TISSUE MONITOR: Tissue Rank 1, Tissue Rank 2 and Tissue Top 2, each by Turf/AW/Hurdle/Chase/All. Captured/settled/winners/strike/model expected/Actual-model are reported. The smaller genuine complete-market price subset separately reports price n, captured-price £1 P/L and ROI; no SP/BSP/forecast fallback exists. Quotes and source are frozen with the book. NR/void are excluded from settled stakes, probabilities are not hindsight-renormalised, and dead heats use canonical settlement. No additional subgroup dashboards are introduced.

New ledger: data/research/tissue-generation-forward-2026-11.json. It starts empty at the new epoch; no old observations are copied. First capture wins under an atomic lock; capture fields, ranks, model identity and already settled outcomes cannot be rewritten. Unknown/changed fields remain pending rather than receiving fabricated outcomes.

Commands: bun run tissue-generation:summary (read only), bun run tissue-generation:sync (normal current-day capture), bun run tissue-generation:results (settlement only). Morning/late invoke capture through the existing research wrappers; research:live, research:after and research:settle share the new canonical settlement path. Today can accept its first valid current-day pre-off capture. The new ledger is included in the backup inventory. No SQL schema change is required.

## Validation and data safety

TESTS: 11 focused generation integration tests, 111 surrounding Value/workflow/Today/layout tests, 143 legacy model/tracker/settlement tests, and 8 research race-table tests pass (273 unique targeted tests). Historical workflow fixtures now explicitly pass a pre-activation clock, while new tests verify the post-activation retired workflow. Existing pending settlements, no-backfill gates, frozen versions, missing Speed, canonical completion/PU, captured-price/dead-heat/NR/void behavior, model-feature parity, active agreement and Value regressions are covered.

TYPECHECK/LINT/BUILD: Strict TypeScript, targeted ESLint across all changed TypeScript files, git diff --check, and bun run build --webpack pass. Webpack is the documented fallback for the sandbox’s known Turbopack local-port restriction. The read-only new-generation summary reports zero captured races and zero headline observations. Implementation did not call sync or settlement against production data.

HISTORICAL TISSUE DATA CHANGED: **NO**. SHA-256 checks confirm every one of the 77 pre-existing top-level research/model files is byte-for-byte unchanged. New models, manifest and empty generation ledger are additive. Database development queries explicitly used read-only transactions; no database data/schema writes occurred.

VALUE LOGIC CHANGED: **NO**. MODEL CORE REFIT: **NO**; new small family-specific adjustments were fitted, and Chase promoted the existing frozen Shadow base. BACKFILL: **NO**. DATABASE SCHEMA: **UNCHANGED**. SETTLEMENT HISTORY ALTERED: **NO**.

## Interpretation

**The new models incorporate information discovered partly from the previous prospective research period. Therefore their historical/development performance is NOT a clean prospective validation. The new prospective epoch is the first clean evaluation of the consolidated model generation.**

From that point onward the models remain frozen. No automated re-fitting, ROI optimisation, promotion, exclusion overlay or continuing collection for the retired Tissue watches is enabled. The new prospective results, good or bad, are the evaluation.

## Immutable audit datasets

The exact development export is preserved at `data/research/tissue-generation-development-2026-11.json`; its bytes match the dataset hash recorded in every model. The reproduced old Chase comparison, including paired runner probabilities, is preserved at `data/research/tissue-generation-chase-promotion-2026-11.json`. The manifest pins both file hashes and labels them DEVELOPMENT / HISTORICAL REFERENCE, never prospective observations. Neither dataset is loaded into the new monitor or an active capture workflow. They preserve the inputs and reference evidence for later audit without relying on temporary files.
