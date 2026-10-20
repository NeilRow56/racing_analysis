# Turf v3 core + AW Tissue v2 surface-history methodology

Turf **`tissue_model_v3`** remains unchanged. AW **`AW_TISSUE_V2`** is separately fitted on AW 2025 records using the same canonical core methodology, with the explicitly approved two-feature surface-history substitution. Status: **READY — activated for future captures**.

The earlier 99-column race-category proposal is superseded. Race-level categories cancel from conditional-logit probabilities; no Turf v4 was created. AW v2 has 95 columns: 91 names identical to Turf v3 and four renamed value/flag columns. This is approved core-method parity, not exact semantic identity of all 95 columns.

## Canonical machinery

- Numeric/comment transforms, optimizer, standardized score, softmax and historical metrics: `scripts/diagnose-independent-tissue-feasibility.ts`. Fitting uses its actual `fitModel` function, not an AW rewrite.
- AW feature mapping: `src/lib/racing/aw-tissue-v2-features.ts`; live core uses Turf's existing `featureInput` followed by AW-only performance/Today/speed source selection. All other numeric parsers, transforms and flags are the original canonical routine.
- Mapping: frozen `data/research/aw-surface-material-v1.json` / `aw_surface_material_v1`; checksum `8851a944e5517620de62628291e1d959fddf33ac0de3f344c9f6c3cdf4c25e22`. Registry is course+date scoped, with explicit provenance and no guessed transition gaps. Raw/registry conflicts become UNKNOWN.
- Fit artifact: `data/research/aw-tissue-model-v2.json`; checksum `ba7d2ea42a87d4ce432288d57a02cee8528217fafa04efa37723446924bdab82`; schema `aw_tissue_v2_turf_v3_core_surface_history_v1`; methodology `TURF_V3_CORE_AW_SURFACE_HISTORY_V1`.
- Fit: AW-only settled single-winner 2025 population, 90 zero-initialized full-batch conditional-logit epochs, L2 .02, rate .12/sqrt(1+epoch/10), no AW-specific tuning or post-fit calibration. Training population mean/SD (floor 1e-6) on zero-imputed values and missing flags; no training-mean imputation.
- Chronological holdout: 2026; outcome/SP fields never enter predictor vectors. Historical market forecasting uses normalized SP for comparison only; no claim of captured-bookmaker ROI.

## Approved substitution

| Position (1-based) | Turf v3 | AW v2 |
|---:|---|---|
| 25 | going_soft | log_surface_runs_365d |
| 26 | going_firm | surface_recent_performance_delta |
| 51 | going_soft_missing | log_surface_runs_365d_missing |
| 52 | going_firm_missing | surface_recent_performance_delta_missing |

The three inherited `*_turf_speed` names retain their canonical positions but read AW family raw-speed aggregates in AW. Six performance/Today values and flags read AW-only evidence; non-AW starts still occupy canonical L3 core history slots before missing family values are removed. No older AW starts replenish those slots.

## Surface-history definitions

Eligible starts: loaded, source-matched AW results, non-NR/non-void, timed/completed prior history, datetime strictly before the fixed capture cutoff (or target off for historical fitting), target race excluded. Lookback begins at target off minus 365 days. Duplicate runs are refused.

`log_surface_runs_365d = log1p(n)` for eligible starts matching today's known material, including starts with unavailable performance ratings. A successfully loaded observed-source history with no matching starts gives real 0/flag 0. It is not a guaranteed lifetime count.

For `surface_recent_performance_delta`, first take the five latest eligible AW starts inside that window, then filter usable ratings/material; never replenish slots. Performance = AW raw speed + historical carried lb − 168 using the canonical weight-performance helper. A = average usable performance across those slots; S = matching-material average; n = usable matching ratings. Value = n/(n+5) × (S−A). No usable matching rating gives null/flag 1. A real zero contrast gives flag 0. Missing historical weight removes its performance, not its counted start. Unknown target material prevents field capture/fitting; unresolved prior material makes both surface inputs missing. Audit reason fields distinguish no history, unrated recent history, unknown material and loading failure.

Zero-impute null values and set the paired missing flag. No known value is filled from Turf/Jump history. All four column replacements are declared in a frozen schema; raw material and sample counts are metadata, not extra predictors.

## Capture, ranking and tracking

Live loader `aw-tissue-v2-sync.ts` uses the same capture-bounded horse/trainer/jockey source loaders/options as Turf v3, plus the shared historical/live AW surface builder. It filters comments strictly before capture, ignores actual/result field counts and refuses result-bearing, post-off, pre-model, pre-epoch, incomplete and nonfinite books. Unknown target material cannot fall back to v1.

Scores use the original standardized score and stable within-race softmax. Competition ranks share ties; Rank 1 selects the lowest stable runner ID among tied leaders. Tests compare AW/Turf guard behavior and normalization without requiring equal fitted coefficients.

Each book freezes its exact 95 modelInputs, model/checksum/scorer/epoch, mapping version, history cutoff, surface evidence and first-capture market values (nullable when no valid market was present). The separate Rank 1 ledger requires full valid bookmaker markets and freezes the selected price, normalized market rank/probability, vector and model probability. Existing per-race deduplication prevents reselecting an already captured v1 race. Prices are never filled from SP/forecast.

AW v2 tracker: `data/research/aw-tissue-forward-v2.json`; scorer `AW_TISSUE_V2_TURF_V3_CORE_PRERACE`; epoch **2026-10-20T03:54:38.000Z**. No historical books are backfilled. Active readers/sync/settlement and Research Rank 1 point to v2 only after activation; v1 artifacts/books remain accessible using `bun run aw-tissue:v1:summary`. Research keeps labelled v1/v2 Rank 1 cohorts separate.

Rank 1 `buildRankOneObservations`, `appendRankOne`, `settleRankOne`, `rankOneMetrics` are shared across all families: first valid bookmaker median, full-field normalized market rank, no backfill, NR/void exclusion and canonical dead-heat settlement. Strike = winners/settled, ROI = total one-unit captured-price P/L / priced-settled count, A/E = winners/sum(normalized captured market probabilities). Book result enrichment reuses the existing AW settlement path; input vectors/probabilities stay frozen.

No new AW VALUE threshold or betting rule was created. AW v2 stores the model-bound fields/prices needed for later Value Monitoring. Model-neutral price/settlement types remain compatible, but no new VALUE qualification state is invented for this cohort.

## Reproduction

```sh
bun run aw-tissue:v2:audit
bun run aw-tissue:v2:build
bun run aw-tissue:summary
bun run aw-tissue:v1:summary
```

Audit/fitter database sessions enforce read-only mode. Audit outputs under `/tmp` bind source rows/validated numeric vectors with checksums. The frozen fitter refuses to overwrite a different v2 checksum. A source/comment revision may therefore require a new version, not rewriting v2.

## Historical limitation

Publication/revision times of historical source metadata, comments and weights are not fully verified. Source imports are upserts, not immutable early-capture archives. The implementation removes known target/future-result inputs and enforces history chronology; it cannot certify every historical value's first publication. Frozen prospective vectors solve future replay only. Course-era assignments inferred from published histories are not direct TAPETA labels in the cached source.

## Exact AW v2 column order

```text
01 official_rating
02 latest_performance
03 best_l3_performance
04 avg_l3_performance
05 latest_turf_speed
06 best_l3_turf_speed
07 avg_l3_turf_speed
08 latest_todays_rating
09 best_l3_todays_rating
10 avg_l3_todays_rating
11 trainer_prior_rate
12 log_trainer_prior_runs
13 jockey_prior_rate
14 log_jockey_prior_runs
15 days_since_run
16 log_prior_runs
17 age
18 weight_lbs
19 class
20 distance_furlongs
21 field_size
22 draw
23 draw_fraction
24 handicap
25 log_surface_runs_365d
26 surface_recent_performance_delta
27 official_rating_missing
28 latest_performance_missing
29 best_l3_performance_missing
30 avg_l3_performance_missing
31 latest_turf_speed_missing
32 best_l3_turf_speed_missing
33 avg_l3_turf_speed_missing
34 latest_todays_rating_missing
35 best_l3_todays_rating_missing
36 avg_l3_todays_rating_missing
37 trainer_prior_rate_missing
38 log_trainer_prior_runs_missing
39 jockey_prior_rate_missing
40 log_jockey_prior_runs_missing
41 days_since_run_missing
42 log_prior_runs_missing
43 age_missing
44 weight_lbs_missing
45 class_missing
46 distance_furlongs_missing
47 field_size_missing
48 draw_missing
49 draw_fraction_missing
50 handicap_missing
51 log_surface_runs_365d_missing
52 surface_recent_performance_delta_missing
53 prior_comment_count
54 last_slowlyAway
55 last_awkwardStart
56 last_prominent
57 last_led
58 last_heldUpRear
59 last_racedFreely
60 last_hampered
61 last_bumped
62 last_checked
63 last_deniedRoom
64 last_shortRoom
65 last_switched
66 last_racedWide
67 last_stayedOn
68 last_strongFinish
69 last_weakened
70 last_faded
71 last_eased
72 last_neverDangerous
73 last_lostTouch
74 last_equipment
75 last3_slowlyAway_count
76 last3_awkwardStart_count
77 last3_prominent_count
78 last3_led_count
79 last3_heldUpRear_count
80 last3_racedFreely_count
81 last3_hampered_count
82 last3_bumped_count
83 last3_checked_count
84 last3_deniedRoom_count
85 last3_shortRoom_count
86 last3_switched_count
87 last3_racedWide_count
88 last3_stayedOn_count
89 last3_strongFinish_count
90 last3_weakened_count
91 last3_faded_count
92 last3_eased_count
93 last3_neverDangerous_count
94 last3_lostTouch_count
95 last3_equipment_count
```
