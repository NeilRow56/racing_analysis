# Tissue component attribution — matched comparisons, 12 November 2026

Diagnostic only. No model fitting, coefficient changes, calibration fitting, application/database changes, Value-rule changes, new generations/epochs, backfills or monitor activation. All corrected monetary calculations use the existing canonical Settlement V3 function, in memory, with original captured bookmaker prices and no odds cap. No 5% ROI target was used to select variants, coefficients, thresholds, prices or exclusions.

The measured answer is mixed: later versions sometimes improved probability scores or calibration while losing winners from Top1/Top2. The recent samples are too small to establish a durable profitable improvement. The clearest broad adverse component result is the added AW same-OR Speed term on historical frozen reconstructions; recent observations do not confirm its harm. Chase's coefficient changes explain harmful recent leader demotions but the whole refit improved its original larger reference sample. Hurdle input corrections and redesign have different, interacting effects.

Read with the [development audit](tissue-development-audit-2026-11-12.md). Complete computed results, source hashes, exact race IDs, calibration bins, expected/actual winners, confidence intervals, component variants and headline winner movements are in the [evidence JSON](tissue-component-attribution-2026-11-12-evidence.json). The [detailed tables](tissue-component-attribution-2026-11-12-details.md) show every evaluated variant, all three selection cohorts, monetary sensitivity and uncertainty. Exact frozen weights/scalers remain in the [parameter inventory](tissue-development-audit-2026-11-12-parameters.md).

## Method, populations and uncertainty

Mutable inputs were copied once into an isolated temporary diagnostic directory and hashed. Frozen artifacts and linked original reports/manifests were read without modification. No database connection or source-history refresh was used. The generation dataset has 305 development races; its original context representation was reproduced from the frozen contextual histories with the original November status rules, rather than importing today's modified history classifier. Frozen production adjustment vectors were used directly. Maximum accepted generation replay probability error was 2.23e-16; Hurdle shadow official logit replay error was zero.

Each comparison uses the same complete runner field and outcomes for every variant. The strict headline cohort excludes the **whole race** if any captured runner is NR/void or unresolved under Settlement V3. This intentionally avoids hindsight selection replacements and withdrawal renormalisation. It narrows the original audit's populations; it does not mean those valid non-runner-affected books were erased or their original selections were losses. Eleven development fields previously called settled contain at least one unresolved V3 outcome; they remain excluded, not reclassified from their old win booleans. No performance or odds threshold selects the exclusions.

| Frozen source | Turf | AW | Hurdle | Chase |
|---|---:|---:|---:|---:|
| Development: original → V3-resolvable strict fields | 71 → 69 | 79 → 78 | 94 → 88 | 61 → 59 |
| Production: original → strict resolved fields | 8 → 6 | 50 → 34 | 89 → 53 | 58 → 41 |
| Production exclusion reasons | 2 NR/void | 16 NR/void | 32 NR/void, 4 unresolved | 16 NR/void, 1 unresolved |

Hurdle original genuine shadow has 49 pairs: 18 NR/void-affected and three unresolved excluded, leaving 28. Its separate new collection has zero pairs. The 28 shadow pairs overlap production Hurdle records and must never be added to the 53 as independent races. Historical Atlas books and development books can also overlap; their totals are never pooled.

Probability metrics: mean race multinomial log loss, mean race **summed** Brier, and runner-weighted ECE in ten fixed bins [0,.1), … [.9,1]. Lower is better. ECE is a sample binning statistic, not synonymous with log loss or a separately fitted calibrator. The original Chase report used other calibration bands; its published 0.76% error and this report's ten-bin ECE need not match. Top1, rank 2 and cumulative Top2 are race hits, selected by descending frozen score with runner-ID tie-break; no reranking after a selection becomes NR. Dead heats split probability target/actual-expected credit equally, but headline hits count races. Consequently Top1 + rank-2 hits can exceed cumulative Top2 hits in dead heats. Ties and full denominators are retained in the evidence.

Uncertainty is descriptive: 95% intervals use paired race differences for loss, Brier, Top1, rank 2, Top2 and captured-price ROI. Absolute strike rates have Wilson intervals. They do not adjust for repeated horses, temporal dependence, development reuse or hundreds of exploratory comparisons. ECE changes have no calibrated population confidence claim. Empirical variance intervals can collapse when no outcomes differ or all bets lose; that does not prove population equality or certainty. For example, zero Turf T1 winners from six races still has an absolute Wilson upper bound near 39%. Every comparison's sample size and intervals are in the details/evidence; none is an independent holdout.

“OLD” and “CURRENT” are local to a table: generally the preceding model and November production; for the Hurdle redesign comparison they mean production Hurdle V2 and shadow V3. Hypothetical scores are retrospective replays even when their inputs were genuinely frozen before racing. Only actual production scores and genuine paired V3 captures count as prospective observations of those models.

## Turf

V1→V2 corrected Turf Speed's per-target chronology/batch-context construction and jointly refitted the same 95 inputs (85 weights; nine rating means/scales changed). V2→V3 repaired the live family-specific Performance/Today's Rating mapper, declaration-only field size/draw fraction, history cutoff and pre-off/result guards; two scalers and 85 weights changed. These are technical/input-semantic repairs; they must not be credited as predictive or monetary gains without a valid paired replay. Today's Rating display removal was not model-feature removal.

V3→V4 retains every base coefficient and adds three context logits: Speed rank 2–3, missing Speed rank and same-OR relative Speed. No extra calibration was fitted; normalization remains full-field softmax. Ranking retains deterministic top-slot identity for this diagnostic. Rationale: small regularised context additions selected on later-block development loss; the [generation manifest](../data/research/tissue-generation-2026-11-manifest.json) records it. Rationale for each original fitted sign and for accepting reduced Top2 capture is not established.

| Versions / changes / matched cohort | Races / runners | Loss and Brier | ECE | Top1 / rank 2 / cumulative Top2 | Ranking | Captured-price T1 results | Evidence strength / limit |
|---|---:|---|---|---|---|---|---|
| V1→V2: corrected Speed regime + refit | unavailable | Original generated paired validation output not recovered | unavailable | unavailable | Cannot isolate input repair from refit on original frozen inputs | No captured-price claim | Insufficient original-definition paired evidence |
| V2→V3: declaration-only refit; existing published comparison | 3,935 / 36,223 | Loss 2.001080948 → 2.001119453; Brier .835650372 → .835654893 | unavailable | unavailable | V2 evaluated on V3 declaration-only vectors; coefficient/fit sensitivity, not original-V2 semantic replay | No captured-price claim | Published retrospective paired proper scores only |
| V3→V4: all three context terms; development | 69 / 728 | 2.117216 → 2.089028; Brier 0.852968 → 0.848804 | 0.58% → 0.80% | 19/10/29 → 19/8/27 | Winner Top2 in/out 1/3; 1→2 / 2→1 3/3 | −£5.54 / -8.03% → +£3.35 / 4.86%; A/E 1.298 → 1.337 (69 races) | Development; all adjustment fits reused these observations |
| V3→V4: preserved historical reconstruction, 2025 | 4608 / 43056 | 2.017314 → 2.039193; Brier 0.836721 → 0.843038 | 0.29% → 0.66% | 1161/803/1962 → 1135/756/1889 | Winner Top2 in/out 195/268; 1→2 / 2→1 138/119 | No captured-price claim | Base training era retrospective |
| V3→V4: preserved historical reconstruction, 2026 | 4011 / 37011 | 2.003415 → 2.017540; Brier 0.835523 → 0.840103 | 0.28% → 0.51% | 1038/702/1740 → 990/713/1703 | Winner Top2 in/out 187/224; 1→2 / 2→1 146/111 | No captured-price claim | Previously inspected 2026 retrospective; not independent holdout |
| V3→V4: 7 November frozen fields | 6 / 94 | 2.694379 → 2.729603; Brier 0.932841 → 0.939301 | 2.61% → 2.33% | 0/1/1 → 0/1/1 | Winner Top2 in/out 0/0; 1→2 / 2→1 0/0 | −£6.00 / -100.00% → −£6.00 / -100.00%; A/E 0.000 → 0.000 (6 races) | Current production probabilities prospective; old and component scores retrospective replay; no claim of untouched evaluation |

On 4,011 later historical fields, V4 loses 48 Top1 and 37 Top2 hits while worsening loss by .014125 [ .008228, .020021 ]. The small development cohort points the other way on loss, exposing a population/transfer problem. Six recent fields cannot resolve it: no T1 hit under either model, unchanged Top2 capture and both T1 portfolios −£6.

The three single additions distinguish improved calibration from winner capture:

| Frozen comparison and component changed alone | Races | Δ loss [95% descriptive interval] | Δ ECE (pp) | Δ Top1 / rank 2 / Top2 | Δ captured-price T1 ROI (pp) |
|---|---:|---|---:|---:|---:|
| TURF; atlas 2026: ADD:speed_rank_2_3 | 4011 | +0.003222 [0.000836, 0.005607] | -0.120 | -33 / 19 / -14 | unpriced |
| TURF; atlas 2026: ADD:speed_rank_missing | 4011 | -0.000074 [-0.002442, 0.002293] | -0.085 | -5 / -7 / -12 | unpriced |
| TURF; atlas 2026: ADD:same_or_speed_gap | 4011 | +0.007984 [0.003691, 0.012276] | -0.047 | -23 / 5 / -18 | unpriced |

All three individually reduce Top1/Top2 capture in the 2026 reconstruction. Rank 2–3 and same-OR additions worsen loss despite lowering ECE. The full-model ECE is worse overall because bins and component interactions are nonlinear: individual ECE gains cannot be added. These are conditional fixed-coefficient results, not a refit or proof that raw Speed is harmful. The raw Speed inputs remain active in V3.

## All Weather

V1→V2 is a major representation replacement: 32 mean-imputed numeric/missing columns become 95 zero-imputed canonical numeric/missing/comment columns. It adds/changes Performance, Today's Rating, participant exposure, logged history, draw fraction and 43 prior-comment features, and replaces Turf going slots with AW material-history count/contrast. All AW coefficients/scalers are separately fitted; family history/window semantics change. V1's 3,091 training races and V2's 3,028 differ. The documented rationale is canonical methodology plus AW surface history; an original numerical paired promotion case and individual component rationales are not established. A before/after total would confound versions and inputs. The separate 39-column AW parity shadow is not production AW V2 and cannot fill this gap.

V2→V3 preserves the complete V2 base and adds the same three context terms as Turf, but with different signs: missing Speed adds +.308468 logits per flag and same-OR gap/10 has −.333090 slope. No normalizer/calibrator replacement occurs. The loss-based small-sample rationale is documented; a winner-capture superiority rationale is not established.

| Versions / changes / matched cohort | Races / runners | Loss and Brier | ECE | Top1 / rank 2 / cumulative Top2 | Ranking | Captured-price T1 results | Evidence strength / limit |
|---|---:|---|---|---|---|---|---|
| V1→V2: new representation, missingness policy, surface history, comments and refit | unavailable | Original compatible 32/95-column paired snapshots not established | unavailable | unavailable | Do not feed one modern vector to both versions and call it original-definition replay | No captured-price claim | Cannot reliably attribute original transition |
| V2→V3: three context additions; development | 78 / 767 | 2.175778 → 2.142253; Brier 0.875517 → 0.867498 | 1.82% → 0.88% | 14/18/32 → 11/17/28 | Winner Top2 in/out 3/7; 1→2 / 2→1 4/3 | −£28.30 / -36.28% → −£40.05 / -51.35%; A/E 0.866 → 0.727 (78 races) | Development; all adjustment fits reused these observations |
| V2→V3: historical reconstruction, 2025 | 3039 / 27979 | 2.015866 → 2.036281; Brier 0.838036 → 0.842944 | 0.33% → 0.23% | 771/536/1306 → 749/518/1266 | Winner Top2 in/out 139/179; 1→2 / 2→1 99/100 | No captured-price claim | Base training era retrospective |
| V2→V3: historical reconstruction, 2026 | 2032 / 18204 | 1.985253 → 2.022567; Brier 0.831470 → 0.842277 | 0.43% → 0.18% | 529/364/893 → 508/345/853 | Winner Top2 in/out 93/133; 1→2 / 2→1 59/52 | No captured-price claim | Previously inspected 2026 retrospective; not independent holdout |
| V2→V3: 5–11 November frozen fields | 34 / 370 | 2.109558 → 2.099649; Brier 0.854207 → 0.850192 | 2.63% → 1.79% | 6/10/16 → 7/10/17 | Winner Top2 in/out 3/2; 1→2 / 2→1 2/1 | −£11.82 / -34.76% → +£2.35 / 6.91%; A/E 0.773 → 0.953 (34 races) | Current production probabilities prospective; old and component scores retrospective replay; no claim of untouched evaluation |

The 2,032 historical 2026 fields show the concern directly: ECE improves 0.427%→0.178%, but Top1 falls 529→508 and Top2 893→853; loss worsens .037314 [ .024009, .050619 ]. The 34 recent strict fields instead gain one Top1/Top2 winner, loss change −.009909 [−.071814, .051995], Top1-rate change +2.94pp [−10.10, +15.99]. That recent improvement is neither precise nor broad confirmation.

| Frozen comparison and component changed alone | Races | Δ loss [95% descriptive interval] | Δ ECE (pp) | Δ Top1 / rank 2 / Top2 | Δ captured-price T1 ROI (pp) |
|---|---:|---|---:|---:|---:|
| AW; atlas 2026: ADD:speed_rank_2_3 | 2032 | -0.002416 [-0.005559, 0.000728] | -0.111 | 7 / -21 / -14 | unpriced |
| AW; atlas 2026: ADD:speed_rank_missing | 2032 | +0.005478 [0.001316, 0.009641] | +0.086 | -1 / -13 / -14 | unpriced |
| AW; atlas 2026: ADD:same_or_speed_gap | 2032 | +0.038218 [0.025456, 0.050980] | -0.165 | -17 / -18 / -35 | unpriced |
| AW; production frozen prospective inputs: ADD:speed_rank_2_3 | 34 | -0.001484 [-0.025240, 0.022271] | -0.349 | 1 / -2 / -1 | +25.00 |
| AW; production frozen prospective inputs: ADD:speed_rank_missing | 34 | +0.009328 [-0.028145, 0.046800] | -0.240 | 0 / 0 / 0 | +4.91 |
| AW; production frozen prospective inputs: ADD:same_or_speed_gap | 34 | -0.011952 [-0.070637, 0.046732] | +0.042 | 1 / 0 / 1 | +36.76 |

The negative same-OR term is the largest adverse historical individual addition: −17 Top1 and −35 Top2, loss +.038218. Missing-rank reward also worsens historical loss/capture. Speed rank 2–3 gains seven Top1 but loses 14 cumulative Top2 despite lower ECE. Recent same-OR and rank context recover winners, while all paired loss intervals cross zero. Therefore there is reason to inspect transfer and ordering, not a validated instruction to remove the context.

On these recent 34 races, current T1 ROI +6.91% happens to exceed the user's long-term 5% target. It falls to −17.12% after omitting its largest winning bet, Royal Message at 9.00; the target is not supported by this sample. Uncapped returns are retained in the primary result. Current T2 is +£4.64 / +13.65%; old T2 was +£16.31 / +47.97%. Current Top2 is +£6.99 on 68 stakes / +10.28%, but becomes −1.51% without its largest winning bet. “More Top1 winners” is not a uniformly better rank-2 portfolio.

## Hurdle

Shared Jump V1→Hurdle V2 retains the 79-column base and adds six terms: Speed-rank 2–3, missing Speed, recent non-completion, latest PU, completion fraction and absent completion history. The original completion/history source was mixed-code. No new fitted calibration/normalization/ranking scheme was deployed. Rationale is small-sample conditional context adjustment selected on loss; original failure terms overlap and do not represent independent evidence.

V2→V3 has never been a production promotion. V3 changes horse history to Hurdle-only actual starter windows, participant denominators to all valid starters, experience/completion scope, mean imputation with non-positive absence gates, comments to three decayed Hurdle-only channels, and jointly refits 18 selected inputs. Age, weight, recency, latest-failure and rank-context candidates are not in the final model. Softmax temperature remains one; intercept zero. [V3 rationale](hurdle-v3-challenger.md) is semantics repair plus 2025 chronological feature selection. A good semantic correction does not guarantee improved ranking with the old frozen coefficients or after joint refitting.

| Versions / changes / matched cohort | Races / runners | Loss and Brier | ECE | Top1 / rank 2 / cumulative Top2 | Ranking | Captured-price T1 results | Evidence strength / limit |
|---|---:|---|---|---|---|---|---|
| Jump V1→Hurdle V2: six context terms; development | 88 / 782 | 1.950889 → 1.934126; Brier 0.813260 → 0.808636 | 0.62% → 1.07% | 26/21/47 → 26/17/43 | Winner Top2 in/out 0/4; 1→2 / 2→1 0/1 | −£21.55 / -24.49% → −£15.28 / -17.36%; A/E 1.174 → 1.219 (88 races) | Development; all adjustment fits reused these observations |
| Jump V1→Hurdle V2: 5–11 November frozen fields | 53 / 477 | 1.932616 → 1.950889; Brier 0.816384 → 0.820510 | 2.83% → 2.32% | 16/8/24 → 15/8/23 | Winner Top2 in/out 0/1; 1→2 / 2→1 1/0 | −£2.94 / -5.55% → −£5.94 / -11.21%; A/E 1.117 → 1.060 (53 races) | Current production probabilities prospective; old and component scores retrospective replay; no claim of untouched evaluation |
| Hurdle V2→V3: 2025 fit-era reconstruction | 1169 / 9373 | 1.798034 → 1.823707; Brier 0.794407 → 0.802537 | 1.10% → 0.68% | 355/248/603 → 342/236/578 | Winner Top2 in/out 99/124; 1→2 / 2→1 56/62 | No captured-price claim | Historical redesign and fixed-weight corrections; 2025 fitting era; source mismatches flagged in 2026 |
| Hurdle V2→V3: 829 source-matched 2026 fields | 829 / 6558 | 1.806579 → 1.800540; Brier 0.801685 → 0.794743 | 0.78% → 0.76% | 239/179/418 → 255/156/411 | Winner Top2 in/out 71/78; 1→2 / 2→1 35/49 | No captured-price claim | 829 matched participant-source historical races; still previously inspected/selection-informed |
| Hurdle V2→V3: genuine 8–11 November pairs | 28 / 242 | 1.921328 → 1.975531; Brier 0.809148 → 0.833915 | 1.82% → 1.91% | 10/3/13 → 8/5/13 | Winner Top2 in/out 3/3; 1→2 / 2→1 1/1 | +£7.70 / 27.50% → −£5.02 / -17.93%; A/E 1.249 → 1.119 (28 races) | Genuine frozen prospective model pair; component removals are retrospective diagnostic scores; no selection by ROI |

The 829 matched-source historical fields improve Top1 by 16 and ECE slightly, but lose seven cumulative Top2 and 23 rank-2 hits. Loss change is −.006039 [−.026572, .014493]; Top1-rate +1.93pp [−.78, +4.64], Top2-rate −.84pp [−3.73, +2.04]. This does not establish superiority. Twenty-eight genuine paired races instead show V3 Top1 8 versus V2 10, equal Top2 13, and loss deterioration +.054203 [−.061556, .169961]. Genuine shadow evidence is still too small; no model promotion is justified here.

The preserved [corrected-input bridge](/tmp/hurdle-v2-corrected-vs-v3.md), newly brought into this diagnostic, is important additional evidence beyond the earlier development audit. It keeps V2 coefficients/scalers/encoding and corrects six input blocks. Fifteen 2026 fields have participant-source mismatches; the main attribution excludes them rather than accepting inferred actor identities. On 829 fields: V2 loss 1.806579, bridge 1.807299, V3 1.800540; Top1 239→244→255; rank 2 179→169→156; Top2 418→413→411. Corrections explain five of seven net Top2 losses, while the full redesign residual explains the other two. These are path-specific descriptive differences, not an additive causal decomposition of independently optimised parts.

| Frozen comparison and component changed alone | Races | Δ loss [95% descriptive interval] | Δ ECE (pp) | Δ Top1 / rank 2 / Top2 | Δ captured-price T1 ROI (pp) |
|---|---:|---|---:|---:|---:|
| HURDLE; historical 2026 matched-source: CORRECT:A | 829 | -0.001511 [-0.003168, 0.000146] | +0.147 | 3 / -3 / 0 | unpriced |
| HURDLE; historical 2026 matched-source: CORRECT:B | 829 | -0.005590 [-0.015729, 0.004550] | -0.155 | 14 / -17 / -3 | unpriced |
| HURDLE; historical 2026 matched-source: CORRECT:C | 829 | +0.003964 [0.000316, 0.007613] | -0.090 | 4 / -6 / -2 | unpriced |
| HURDLE; historical 2026 matched-source: CORRECT:D | 829 | -0.001187 [-0.002998, 0.000623] | -0.030 | -3 / 10 / 7 | unpriced |
| HURDLE; historical 2026 matched-source: CORRECT:E | 829 | +0.000147 [-0.001517, 0.001810] | +0.085 | 1 / 5 / 6 | unpriced |
| HURDLE; historical 2026 matched-source: CORRECT:H | 829 | +0.001763 [-0.001295, 0.004821] | -0.264 | 1 / 5 / 6 | unpriced |

Bridge labels: A=Hurdle-only start count; B=Hurdle-only **original V2** comments; C=Hurdle-only completion/recent-failure/PU; D=all-starter jockey denominator; E=all-starter trainer denominator; H=Hurdle-only original Speed/history-recency/rank context. C worsens loss and Top2 while improving ECE/Top1; B improves loss/ECE/Top1 but loses Top2. D gains seven Top2 but loses three Top1. In the 1,169 fit-era 2025 fields, B instead worsens loss by .020150 and loses 14 Top1/17 Top2. No correction has a uniform “better at everything” result.

The appendix also evaluates replacing one V2 contribution group with its V3 counterpart and removing each of V3's 18 contributions, historically and in genuine shadow pairs. These are fixed-score hybrid sensitivities: feature scope, missingness, imputation and weights change together within a replacement group. They are not a clean isolation of “mean imputation alone” or “refit alone”. Missing flags and their numeric zero-fill offsets need joint interpretation.

V2's recent T1 +27.50% ROI in the genuine shadow population comes from a different 28-race subset than the 53-race Jump→V2 comparison. They cannot be compared across tables as a model gain. Its largest winner, Le Moulin Rouge at 12.00, moves 1→11 under V3; omitting that bet changes V2 T1 ROI to −12.22%. V3 T1 returns −£5.02 / −17.93%; V3 T2 improves from V2's −77.71% to −33.04%, while whole Top2 stays near −25%. The rise in rank-2 hits does not establish a better overall portfolio.

## Chase

V1→V2 promotes the exact frozen Chase-only Shadow A fit of the same 79 named Jump inputs. Sixty-eight weights/scalers/means change; 42/43 effective comment slopes change and 11 switch sign. Trainer/jockey, age, recency, weight and Speed also change. Four additional context slots are present with zero weights. There is no Chase V3 artifact. No new post-fit calibration is present; full-field softmax remains the normalizer. Documented rationale is Chase-specific probability quality and 2025 chronological candidate selection; individual sign/phrase motivations and a separately desired comment/numeric balance are not established.

| Versions / changes / matched cohort | Races / runners | Loss and Brier | ECE | Top1 / rank 2 / cumulative Top2 | Ranking | Captured-price T1 results | Evidence strength / limit |
|---|---:|---|---|---|---|---|---|
| Jump V1→Chase V2: original promotion reference | 1220 / 9083 | 1.858267 → 1.825072; Brier 0.826250 → 0.813572 | 1.58% → 0.77% | 303/244/547 → 321/233/554 | Winner Top2 in/out 107/100; 1→2 / 2→1 43/58 | No captured-price claim | Original historical promotion reference; probability-only file has no captured prices |
| Jump V1→Chase V2: recent development fields | 59 / 388 | 1.711639 → 1.709640; Brier 0.791358 → 0.792768 | 2.14% → 2.12% | 18/14/32 → 18/12/30 | Winner Top2 in/out 3/5; 1→2 / 2→1 3/4 | +£19.47 / 33.00% → +£14.62 / 24.78%; A/E 1.314 → 1.234 (59 races) | Development; all adjustment fits reused these observations |
| Jump V1→Chase V2: later reconstructed 2025 inputs | 539 / 3047 | 1.575676 → 1.560370; Brier 0.769022 → 0.760265 | 1.96% → 1.19% | 181/107/288 → 168/133/301 | Winner Top2 in/out 52/39; 1→2 / 2→1 32/23 | No captured-price claim | Base training era retrospective |
| Jump V1→Chase V2: later reconstructed 2026 inputs | 453 / 2522 | 1.574716 → 1.579200; Brier 0.774343 → 0.769846 | 1.78% → 0.77% | 143/102/245 → 146/93/239 | Winner Top2 in/out 35/41; 1→2 / 2→1 17/24 | No captured-price claim | Previously inspected 2026 retrospective; not independent holdout |
| Jump V1→Chase V2: 5–11 November frozen fields | 41 / 247 | 1.673498 → 1.663493; Brier 0.794298 → 0.789028 | 2.46% → 3.55% | 13/7/20 → 9/9/18 | Winner Top2 in/out 1/3; 1→2 / 2→1 5/1 | −£1.97 / -4.92% → −£13.24 / -33.10%; A/E 1.082 → 0.804 (40 races) | Current production probabilities prospective; old and component scores retrospective replay; no claim of untouched evaluation |

The original 1,220-race comparison is positive: +18 Top1, +7 Top2, loss −.033195 [−.052540, −.013850]. It has no captured bookmaker-price books in that probability-only reference. The smaller Atlas 2026 reconstruction has different evidence: +3 Top1, −6 Top2 and loss +.004484 [−.020924, .029891]. Of 425 overlapping original-reference races, only 370 reproduce both stored probability books within 1e-10; 55 differ, by up to .1040 old-model and .0820 new-model probability. The files therefore cannot be treated as interchangeable. The two **within-file** paired comparisons remain informative; differences between their conclusions confound sample and reconstructed inputs/source provenance. The broad original reference does not independently prove each later block change was beneficial.

On 41 recent strict fields, V2 loses four Top1 and two Top2; ECE worsens despite slightly better loss/Brier. Five winners move 1→2 and one 2→1; one enters Top2 and three leave. The loss interval crosses zero; Top1-rate change −9.76pp [−23.11, +3.60]. Forty complete-price races give T1 −£13.24 / −33.10% versus old −£1.97 / −4.92%; rank 2 improves but Top2 declines from −15.38% to −23.56%.

| Frozen comparison and component changed alone | Races | Δ loss [95% descriptive interval] | Δ ECE (pp) | Δ Top1 / rank 2 / Top2 | Δ captured-price T1 ROI (pp) |
|---|---:|---|---:|---:|---:|
| CHASE; production frozen prospective inputs: ADD_GROUP:OR | 41 | +0.000033 [-0.002396, 0.002461] | +0.072 | 0 / 0 / 0 | +0.00 |
| CHASE; production frozen prospective inputs: ADD_GROUP:speed | 41 | -0.002925 [-0.009106, 0.003256] | +0.333 | -1 / 2 / 1 | -8.75 |
| CHASE; production frozen prospective inputs: ADD_GROUP:trainer | 41 | -0.013484 [-0.038470, 0.011503] | -0.479 | -1 / 3 / 2 | -6.58 |
| CHASE; production frozen prospective inputs: ADD_GROUP:jockey | 41 | +0.003174 [-0.014040, 0.020389] | -0.136 | -3 / 3 / 0 | -19.82 |
| CHASE; production frozen prospective inputs: ADD_GROUP:recency | 41 | +0.000656 [-0.008968, 0.010281] | +0.466 | -3 / 4 / 1 | -19.20 |
| CHASE; production frozen prospective inputs: ADD_GROUP:experience | 41 | -0.001035 [-0.011416, 0.009346] | +0.843 | 0 / 0 / 0 | +0.00 |
| CHASE; production frozen prospective inputs: ADD_GROUP:age | 41 | -0.000975 [-0.024568, 0.022617] | +1.406 | -3 / 4 / 1 | -19.20 |
| CHASE; production frozen prospective inputs: ADD_GROUP:weight | 41 | +0.005579 [-0.006027, 0.017184] | +1.193 | -1 / 1 / 0 | -8.75 |
| CHASE; production frozen prospective inputs: ADD_GROUP:other | 41 | +0.000000 [-0.000000, 0.000000] | +0.000 | 0 / 0 / 0 | +0.00 |
| CHASE; production frozen prospective inputs: ADD_GROUP:missingness | 41 | -0.004311 [-0.009075, 0.000452] | +0.182 | 0 / 0 / 0 | +0.00 |
| CHASE; production frozen prospective inputs: ADD_GROUP:comments | 41 | -0.003391 [-0.056804, 0.050023] | +0.867 | -1 / 2 / 1 | -9.08 |

These rows replace **only** the named coefficient/scaler contribution block against the old model; missing flags form a separate block. They cannot be added to predict the full change. In this small sample, comments alone lose one Top1 but gain one Top2; jockey, age and recency changes each lose three Top1. Thus “the four lost leaders were caused entirely by comments” is unsupported. Restoring old comments within the complete new model is separately tabulated. That question differs from adding new comments to the old model. All 68 effective individual feature-slope changes are also tested in the appendix. They remain exploratory conditional effects, not independently validated weights.

## Ranking movement and mechanism

The evidence JSON lists every changed winner rank for headline comparisons. These selected recent examples explain the principal mechanisms without confusing a winning demotion with a full-field causal proof:

| Matched comparison | Winner movement | Meaning |
|---|---|---|
| AW V2→V3 | Fenaroli 1→2; Lady Mariko 1→2 | Original missing-Speed context and same-OR term can reverse close margins. These losses coexist with later gained leaders, so the 34-race net Top1 is +1. |
| Chase V1→V2 | Bond Broker, Marlacoo, Royal Infantry, Cadell and First Confession 1→2 | Joint coefficient changes reduce original leader margins. Previous exact attribution shows comments resist Royal Infantry's demotion; numeric changes overcome them. |
| Chase V1→V2 | Rula Bula 3→1; Ruby Island and Cheesy Icon 2→3; Anzadam 1→3 | Genuine ranking recoveries and Top2 losses both occur. Changes are not merely exchanges of first and second. |
| Hurdle V2→V3 genuine shadow | Rialannah/Port Station 3→2; Marvelous Dragones 4→2 | New history/representation and fitted balance recover three Top2 winners. |
| Hurdle V2→V3 genuine shadow | The Mourne Rambler 2→6; Minella Machine 1→3; Le Moulin Rouge 1→11 | Three Top2 winners are lost, offsetting the three gains. Original V2's long-priced winner is preserved in monetary results. |
| Hurdle V2→V3 genuine shadow | Corner Forward 1→2; Rockson Piel 2→1 | One direct winning demotion and promotion; deeper losses still produce net −2 Top1. |

Top1/Top2 transitions are counted on identical races and runners, not selected-price-only subsets. Profitability then restricts both models to the same complete-price fields. A changed model can select a different horse from that common field: unchanged selections have identical canonical cash returns, while model expectation can change. Therefore a monetary difference arises from changed selections, not a new settlement rule or filled-in price. Model expectation versus actual winner-credit totals for T1, T2 and Top2 are shown in the detailed tables; full-field total expectation equals one per race by construction and is not evidence of calibration.

## Captured-price performance and largest-winner sensitivity

The following table uses the recent common complete-price races only. Each Top2 bet stakes £1 on **each** original top-two runner; T1/T2 each stake £1. Normalized captured full-field bookmaker probability supplies market expected winners; A/E uses fractional dead-heat winner credit. Historical SP is never a replacement quote. All original prices and legitimate long-priced wins remain uncapped in primary results. “Without largest” is a sensitivity only: remove that winning bet and its stake, without replacement or changing model selections.

| Comparison / model | Priced races | T1 £P/L / ROI / market A/E | Rank 2 £P/L / ROI / A/E | Top2 £P/L / ROI / A/E | T1 ROI without largest 1 / 3 winning bets |
|---|---:|---|---|---|---|
| TURF generation: OLD | 6 | −£6.00 / -100.00% / 0.000 | −£3.12 / -52.00% / 1.327 | −£9.12 / -76.00% / 0.743 | -100.00% / -100.00% |
| TURF generation: CURRENT | 6 | −£6.00 / -100.00% / 0.000 | −£3.12 / -52.00% / 1.370 | −£9.12 / -76.00% / 0.756 | -100.00% / -100.00% |
| AW generation: OLD | 34 | −£11.82 / -34.76% / 0.773 | +£16.31 / 47.97% / 1.867 | +£4.49 / 6.60% / 1.219 | -60.06% / -84.90% |
| AW generation: CURRENT | 34 | +£2.35 / 6.91% / 0.953 | +£4.64 / 13.65% / 1.794 | +£6.99 / 10.28% / 1.316 | -17.12% / -65.00% |
| HURDLE generation: OLD | 53 | −£2.94 / -5.55% / 1.117 | −£31.85 / -60.09% / 0.847 | −£34.79 / -32.82% / 1.010 | -26.81% / -44.38% |
| HURDLE generation: CURRENT | 53 | −£5.94 / -11.21% / 1.060 | −£33.85 / -63.87% / 0.834 | −£39.79 / -37.54% / 0.969 | -32.58% / -50.38% |
| CHASE generation: OLD | 40 | −£1.97 / -4.92% / 1.082 | −£10.33 / -25.82% / 0.823 | −£12.30 / -15.38% / 0.975 | -19.15% / -34.38% |
| CHASE generation: CURRENT | 40 | −£13.24 / -33.10% / 0.804 | −£5.61 / -14.02% / 0.980 | −£18.85 / -23.56% / 0.883 | -48.05% / -64.84% |
| Hurdle genuine V2/V3: OLD | 28 | +£7.70 / 27.50% / 1.249 | −£21.76 / -77.71% / 0.556 | −£14.06 / -25.11% / 0.970 | -12.22% / -46.20% |
| Hurdle genuine V2/V3: CURRENT | 28 | −£5.02 / -17.93% / 1.119 | −£9.25 / -33.04% / 0.902 | −£14.27 / -25.48% / 1.025 | -38.96% / -60.08% |

Every recent paired T1 ROI-difference interval includes zero, apart from Turf's unchanged empirical returns (which provide no population assurance). AW's +41.68pp difference has interval [−31.67, +115.02]pp; Chase's −28.18pp [−65.22, +8.87]pp; genuine Hurdle V3's −45.43pp [−133.26, +42.40]pp. Heavy tails, small samples and reuse mean no 5% long-run ROI conclusion follows. A/E above one can coexist with negative ROI because normalized-market winner expectations and bookmaker cash returns measure different things. No overlapping cohorts or historical/forward stakes are pooled into an “overall ROI”.

The Settlement V3 calculation is a new diagnostic projection on stored result evidence, not a rewrite of old outcome/return fields. It honours NR/void/unresolved states, treats canonical non-finishers as losing starters and divides the entire decimal winning return in a dead heat. Where race-stage evidence is absent, only the preserved runner evidence and full consistent field are available; no new official source certification is claimed. Eleven older development fields are excluded for insufficient canonical outcome evidence. The report cannot infer their cash results from an old settled flag alone.

## Individual contribution versus interactions

Three controlled questions were calculated without fitting:

1. **ADD / CORRECT / ADD_GROUP / REPLACE_V3_GROUP:** change only one documented term, old-input correction or contribution block against the relevant frozen old baseline. Chase block replacement includes each original model's own mean/scale. Hurdle V3 replacements jointly include the source/definition and fitted effect; those cannot be reduced to one coefficient.
2. **REMOVE / RESTORE_GROUP / REMOVE_V3:** remove one current contribution, or restore the old block within the complete current model. This is incremental dependence of the fixed model. It is not a refitted model without that feature and is not necessarily the inverse of question 1.
3. **ONLY:** score a newly added context term alone, using its existing conditional fitted coefficient, then softmax. This is an explicitly unrefitted standalone sensitivity, often dominated by ties; it is not an independently calibrated standalone model. Raw standalone associations do not establish incremental information beyond the existing model or market.

All exposed component variants are tabulated, rather than selecting whichever happens to deliver 5% ROI. Nonlinearity matters even though logits add: softmax, log loss, ECE bins and top-rank boundaries do not. For example, AW's individual same-OR and rank additions each gain one recent Top1, while the combined model gains one, not two. Hurdle's six recent context additions individually have no Top1 change, but their joint model loses one. Chase's single-block Top1 losses sum to more than the whole model's four lost Top1 hits because groups often affect the same race and can offset.

## Conclusions A–F and prospective feasibility

**A. Demonstrated identification improvements:** the original larger Chase joint refit gains 18 Top1/seven Top2 on its paired historical reference. Hurdle V3 gains 16 Top1 on the matched-source later reconstruction, while losing Top2; individual Hurdle-only comment correction gains 14 Top1 there, but reverses direction in 2025. AW rank-2/3 context gains seven historical Top1 but loses Top2. These are sample-specific measured gains, with explicit uncertainty and development/source limits, not durable independent improvements.

**B. Calibration gains with capture losses:** AW V3 is the clearest broad example: ECE falls but historical Top1/Top2 decline. Individual negative same-OR context also lowers ECE while worsening loss and both capture measures. Hurdle V3 lowers historical ECE and increases Top1 while losing Top2; V2's recent six-term package lowers ECE while losing Top1/Top2. Lower ECE alone did not protect winner identification.

**C. Promising components:** preserve raw Speed/OR, participant priors and frozen original component definitions as controls. Hurdle-only comments, experience and correct starter denominators show useful but objective-dependent gains; they merit evaluation together with ranking losses. There is no newly established component that reliably improves all of calibration, Top1, Top2 and captured-price ROI. Existing beneficial comment/missingness block evidence in the development audit still argues against blanket removal.

**D. Population explanations:** AW V1/V2 training counts/representations differ, so transition improvement is unestablished. The original Chase reference, later Atlas reconstruction and recent prospective books differ in both membership and some reconstructed source values. Historical/development context results disagree, consistent with transfer uncertainty; no unpaired period is used to establish a version gain. NR/unresolved/pricing exclusions change denominators between this report and the earlier audit and are fully disclosed.

**E. Existing prospective infrastructure:** generation books already freeze full fields, base and adjustment vectors, timestamps, model hashes, probabilities, prices and outcomes. Exact contributions, pairwise margins, changed leader identities and predeclared fixed-term replays can be calculated read-only, with no new generation or epoch. Genuine Hurdle pairs additionally freeze V3 raw inputs/source evidence. They can support both quality and price-return comparisons on the same production quotes. Old/new collection epochs remain separate; the new empty Hurdle collection adds no evidence. No original historical source publication time or missing quote can be recovered from an encoded feature vector. A claim about a future unselected component rule needs later observations; no historical replay becomes independent merely by excluding direct fitting-race IDs.

**F. At most two hypotheses for possible future review, using existing captures only:**

1. **AW same-OR context:** assess whether the negative same-OR contribution displaces winners relative to frozen V2, especially when it changes Top2 membership. The historical term-alone loss/capture deterioration is material; recent gain and wide uncertainty are counterevidence. Keep probability quality, ranking, market A/E and original captured-price returns together.
2. **Chase comment-coefficient changes in old-leader demotions:** test whether comment-margin changes identify harmful old-T1→new-T2 moves beyond the numeric block, comparing original/full/new-comments-only and old-comments-restored diagnostic scores. Recent joint ranking loss and exact earlier swap attribution support examination, but several harmful swaps are numeric-driven and the original joint refit improved its larger reference. This is not a recommendation to remove comments.

These are hypotheses, not activated monitors or betting rules. No other component-level monitoring hypothesis is recommended. The smallest next action is to review these fixed diagnostics on later records already arriving through existing authorised infrastructure, without tuning coefficients, selecting price thresholds or changing collection. The approximate 5% ROI aim remains unvalidated.

## Verification and preservation

The diagnostic checked 559 frozen source books for pre-off chronology (including overlapping source cohorts); all accepted shadow pairs shared their production capture timestamp and froze before off. Across 456 strict resolved source books, every winning dead-heat divisor matched the full-field winner count. Frozen model loaders, probability/logit replay, common-field/price coverage, report links and report whitespace checks passed. Code and model semantics were inspected; no application build or Python typecheck was needed because neither application nor Python files were edited.

Before/after SHA256 comparison covered 1,110 existing project source, script, documentation and research files: zero changed and zero missing. Only this report, its detailed tables and derived evidence JSON were added to the repository. Original frozen evidence, outcomes, prices, model artifacts and existing monitors remain unchanged.
