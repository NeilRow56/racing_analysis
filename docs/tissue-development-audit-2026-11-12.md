# Tissue model development audit — 12 November 2026

Diagnostic only. No application, model, database, capture, epoch, settlement or monitor changes were made. No fitting, calibration fitting, optimisation, ingestion, backfill or live capture was run.

The concern is supported in a limited but concrete sense: some replacements improved probability loss while reducing winner capture or Top2 ranking in the very evidence used to develop them. This does not establish that every later version is worse, that an original component should automatically be restored, or that Tissue 2 is a profitable betting strategy.

## Findings answering A–I

| Question | Audit conclusion |
|---|---|
| A. Why V1 → V2? | Different answers by family. Turf: repair the Speed input regime and refit the original specification. AW: replace the smaller numeric model with the canonical Turf-core method, fitted separately on AW and adding surface history/comments. Hurdle: retain shared Jump coefficients and add six small fitted context terms. Chase: promote a Chase-only refit of the existing inputs. |
| B. Why V2 → V3? | Turf: repair declaration/result-count leakage and live input semantics. AW: add three November context terms to its frozen V2. Hurdle: rebuild ambiguous cross-code history, missingness and participant-denominator semantics as a separate challenger. Hurdle V3 has **not** replaced V2. No Chase V3 artifact or production generation was established. |
| C. Evidence-supported changes? | Technical evidence supports Turf chronology/batch consistency and declaration-only fixes. November adjustments passed a small later-block log-loss selection gate; Chase had a larger retrospective quality comparison. Hurdle V3 feature groups were selected chronologically within 2025. None establishes captured-bookmaker profitability. |
| D. Missing rationale? | No recoverable explanation for each jointly fitted coefficient/sign, each original feature choice, or why better log loss justified observed ranking losses. AW methodological parity is documented, but an original numerical V1-versus-V2 promotion case was not recovered. See the decision register below for explicit unknowns. |
| E. Demonstrably weakened identification/ranking? | **Yes on specified samples.** AW V3 loses Top1/Top2 in its development and selected validation results; Hurdle V2 loses Top2; Turf V4 loses development Top2. The preserved 5–6 November replay has old T1 19 winners versus new T1 14. These are measured sample regressions, not proof of persistent population deterioration. |
| F. Original Tissue 2 advantage? | The earliest recoverable directly matching evidence is the 5–6 November component study: T2 23/76 versus T1 14/75. It measures same-model ranking performance, not V2 versus V1. T2 also exceeded captured-market winner expectation on its priced subset, yet both overall portfolios lost money. |
| G. Components worth preserving/examining? | Preserve original artifacts, full feature semantics, raw Speed, OR, trainer/jockey inputs, comments and missingness definitions as diagnostic references. Examine AW context, Chase coefficient changes and Hurdle history/comment redesign. Broad removal of comments or missing flags is contradicted by some preserved ablations. |
| H. Existing monitoring sufficient? | Full frozen vectors and prices already permit most fixed-coefficient attribution and paired replays. Original source histories and timing are incomplete in older books. Existing Hurdle V2/V3 paired infrastructure provides genuine prospective model comparisons; a separate live monitor for every component is unnecessary. |
| I. Smallest justified next step? | One read-only paired attribution review on already captured full-field books, keeping model/scorer/source/collection/settlement cohorts separate. Compare the original model, current model and one predeclared component-removal diagnostic at identical captured prices; show ranking and probability quality together. Use existing future observations for confirmation. No production intervention is justified by this audit alone. |

## Scope, evidence and reproducibility

Repository HEAD was `77167d7` (10 November 2026). The working tree contains substantial later changes, including settlement remediation and the 11 November collection epochs. Git history, committed documentation and frozen model artifacts were distinguished from those current uncommitted implementations. Dates below distinguish model creation, implementation boundary, first stored capture and commit time; they are not interchangeable. UTC timestamps in November are also London time; September/October timestamps labelled UTC precede London daylight-saving conversion.

Primary evidence:

- [Frozen parameter inventory](tissue-development-audit-2026-11-12-parameters.md): every name, mean, scale, weight and effective slope for 13 relevant base, production and shadow artifacts. This is the exact coefficient appendix, including coefficients not singled out in the narrative.
- [Machine-readable audit evidence](tissue-development-audit-2026-11-12-evidence.json): model/file hashes, source hashes, original-cohort calculations, paired sensitivity, context coefficients and replay errors.
- [November generation specification](tissue-generation-2026-11.md), [development manifest](../data/research/tissue-generation-2026-11-manifest.json), [development books](../data/research/tissue-generation-development-2026-11.json), [Chase reference](../data/research/tissue-generation-chase-promotion-2026-11.json).
- [Turf semantics](turf-tissue-live-semantics.md), [AW methodology](tissue-model-methodology.md), [AW V1](aw-tissue-v1.md), [Jump V1](jump-tissue-v1.md), [Hurdle V3](hurdle-v3-challenger.md), [Chase coefficient audit](chase-comment-balance-audit-2026-11-06.md).
- Preserved local originals: [5–6 November component summary](/tmp/tissue-generation-component-audit-summary.md), [component workbook](/tmp/tissue-generation-component-audit-2026-11-05-to-06.xlsx), [T1/T2 analysis JSON](/tmp/tissue-t1-vs-t2-analysis-data.json), [swap audit](/tmp/tissue-t1-t2-swap-driver-audit.md), [Hurdle rebuild report](/tmp/hurdle-v3-rebuild-report.md), [line-by-line Hurdle comparison](/tmp/hurdle-v2-v3-line-by-line-comparison.md).

Temporary originals remain in their original locations and were not edited or relocated. They are recoverable now but are less durable than committed evidence. Their hashes are recorded. A complete original instruction/conversation archive was not recovered. Statements about authorisation are attributed to existing documents; these do not prove phrase-by-phrase user approval.

The original workbook's Artifact Tool import failed with an XML-reader error. Its unmodified OOXML values were therefore read using the standard-library ZIP/XML reader. All 725 runner identities, capture times, probabilities, ranks and prices matched the same frozen entries in the current generation ledger. Outcomes were taken from the **original workbook**, preserving its pending/NR state instead of silently using later settlements. Full-field current-artifact replay matched these 725 probabilities within `1.11e-16`; book sums were within `3.34e-16` of one.

## Version and terminology map

| Label | Actual meaning |
|---|---|
| Turf V1/V2/V3 | Distinct frozen fitted artifacts; V1 is internally named `independent_tissue_numeric_comments_v1_2025`. |
| November production | Turf `TURF_TISSUE_V4`, AW `AW_TISSUE_V3`, Hurdle `HURDLE_TISSUE_V2`, Chase `CHASE_TISSUE_V2`. No universal common version number exists. |
| Tissue 1 / Tissue 2; T1 / T2 | Rank-1/rank-2 runners in a single probability book. One model creates both. They are selection cohorts, not separate models. Ties and eligibility conventions must be retained. |
| AW-T0 / AW-T1; J-T1 | Candidate experiment identifiers, unrelated to daily Tissue 1/2. AW V1 is AW-T0 numeric-only; Jump V1 is J-T1 numeric plus comments. |
| Value 1 / VALUE_RANK_V1/V2 | A separate market-relative selection/ranking policy. A Value leader need not be Tissue 1. Old all-runner Value books also retain older tissue model identities. |
| Settlement V2/V3 | Outcome/return classification semantics, not predictive model versions. A changed winner/loser denominator can change metrics without changing any coefficient. |
| Collection V2 | New source/collection provenance after 11 November; frozen model coefficients remain unchanged. It is not Hurdle model V2 or V3 promotion. |
| Shadow | Separately frozen diagnostic scorer or ledger. Some shadows were later promoted (Chase); others were not (AW parity, Hurdle V3). |

[Today's Rating display removal](today-or-speed-display.md) did **not** remove its underlying Turf/AW model inputs. The October display commits must not be interpreted as model ablation.

## Chronological lineage and current operating status

| Date/boundary | Event and exact identity | Status at audit |
|---|---|---|
| 19 Sep, trained 11:35:34 UTC | Turf V1, 4,598 races / 42,947 runners from 2025; 95 inputs. Commit `f1eca6e`. First stored capture 12:26:43 UTC. | Historical archive; 36 stored books. |
| 19 Sep, trained/boundary 17:35:53 UTC | Turf V2, same training population/specification, corrected `turf_speed_v2`. Commit `55423c7`. First preserved V2 capture is 25 Sep 06:28:31 UTC, not the nominal start date. | Historical archive; 453 books. |
| 2 Oct, 05:16:55 UTC | AW V1 implementation, AW-T0, 3,091 training races; 16 numeric values plus 16 missing flags. Commit `6bc8a54`; first stored capture 06:39:54 UTC. | Retired primary capture; 200 books preserved. |
| 2 Oct, 13:45:00 UTC | Shared Jump V1 for Hurdle/Chase and separately reported NH Flat; 1,927 races / 14,266 runners, 79 inputs. First stored capture 15:57:47 UTC; artifact entered Git by `4a886c1` (3 Oct). | Retired primary capture; 573 mixed-subtype books preserved. Still an embedded Hurdle base and legacy Value scorer. |
| 7 Oct, 03:57:11 UTC | AW parity shadow V1 / AW-R2: 39 inputs, participant depths and three weakened-comment features. | Historical shadow, never production AW V2. |
| 12 Oct, 18:44:47 UTC; 13 Oct, 04:32:19 UTC | Hurdle `HURDLE_TISSUE_EXCUSE_HALF_SHADOW_V1`: halve 30 named adverse/excuse comment contributions without refitting. Separate Chase mismatch-zero experiment starts on 13 Oct. | Retired paired experiments; neither is the November Hurdle/Chase V2. |
| 19 Oct, 20:13:37 UTC | `TURF_TISSUE_V2_LIVE_FIX`: repair live mapper and guards while preserving V2 fitted artifact. | Distinct historical scorer cohort, not another fitted model. |
| 19 Oct, 20:20:55 UTC boundary; trained 20:23:47 UTC | Turf V3 declaration-only refit. Commit `594da13` on 20 Oct; first stored book 20 Oct 02:29:14 UTC. | Retired standalone primary; 152 books preserved; exact base embedded in Turf V4. |
| 20 Oct, trained 03:44:27 UTC; epoch 03:54:38 UTC | AW V2, 3,028 races / 27,880 runners; canonical 95-input core with surface-history substitution. Commit `daeb1f1`; first stored capture 05:18:03 UTC. | Retired standalone primary; 190 books preserved; exact base embedded in AW V3. |
| 30 Oct, 06:41:15 UTC shadow epoch | Frozen Chase-only `CHASE_SHADOW_V1`, candidate A with the original 79 input names. Commit `66b28cf`. | Old shadow collection retired; its exact fitted parameters became Chase V2. |
| 5 Nov, 07:26:36.629 UTC epoch | November generation: Turf V4, AW V3, Hurdle V2 and Chase V2. Development cutoff 06:57:32 UTC. Commit `b357721`. | Current production generation; four frozen loaders validated successfully. |
| 7 Nov, created 13:47:05 UTC | Hurdle V3 challenger, Hurdle-only history, 18 active inputs, 1,169 2025 races / 9,373 runners. Commit `f6ef593`. | Frozen challenger, never production. |
| 8 Nov, armed 09:35:06; first pair 09:58:39 | Genuine V2/V3 Hurdle shadow pairs. Commit `416dc9c`, followed by validator correction `24c4515`. | Original ledger retained with 49 observations through 11 Nov; original collection closed by later workflow. |
| 11 Nov, 16:39:41.798 UTC | Separate source-pinned collection epochs for Positive/Neutral, Hurdle V3 Shadow and Market Edge. | Read-only integrity report returned **ACTIVE**, each new ledger empty at audit. Low Form fresh collection remains suspended. No model promotion. |

Counts above describe raw stored books, not automatically eligible/settled performance denominators. The global workflow and writer guards retire older primary/paired captures after the November boundary. Old summary commands remain available; their continued existence does not make those models current production. Legacy all-runner Value capture remains a distinct older-model research stream. Older docs saying “active Turf V3” or “AW V2 active” describe their own implementation period; current authority is [generation config](../src/lib/racing/tissue-generation-config.ts), [model registry](../src/lib/racing/tissue-generation-model.ts) and workflow routing.

## Decision register: exact changes, rationale and evidence at the time

### Turf V1 → V2: technical input repair, joint refit

Git `55423c7` changes Turf Speed context construction in `turf-speed-ratings.ts`: calculate canonical standard/same-day contexts per target and cutoff; load peer standard keys correctly; avoid arbitrary target-batch membership affecting the context population. Tests explicitly cover reversed/partitioned batches and targets with different chronologies. The calculation dependency becomes `turf_speed_v2`.

The model retains 26 numeric inputs, 26 missing flags and 43 comment inputs; 90 conditional-logit epochs, L2=.02 and original training population. **85/95 fitted weights change; nine means and nine scales change.** Those nine inputs are latest/best/average Performance, Speed and Today's Rating. The builder's wording that only three Speed feature regimes change is narrower than this numerical artifact comparison: downstream rating distributions also change. It did not merely replace three coefficients. No comment component was removed.

Rationale: deterministic, chronology-safe corrected ratings; classification **technical correction**. The builder contains a specified numeric-versus-comments, common-runner, calibration and bootstrap validation procedure, and reports only modest focused coefficient changes. Its generated `/tmp/tissue-model-v2-validation.md` was not recovered in this audit. Original exact quality gains/losses therefore remain unverified. **Rationale not established** for claiming V2 was a superior winner finder or more profitable, or for each jointly fitted coefficient change. Tests demonstrate the technical defect/repair, not betting benefit.

### Turf V2 → live fix → V3: semantics and leakage repair

The old feature mapper could supply generic Performance/Today aggregates to a Turf-trained model. The October repair selects the six Turf-family aggregates and their availability flags; retains the canonical prior-start window without replenishing missing Turf slots; bounds history/comments at capture; rejects result-bearing, post-off and incomplete prospective books. V2's fitted bytes were retained under a new scorer marker.

V3 then refits the 95-column model using `declaredRunnerCount` for `field_size` and `draw / declaredRunnerCount` for `draw_fraction`, instead of `actualRunnerCount ?? declaredRunnerCount`. Source copies are transformed rather than overwriting caches. Two scalers and **85 fitted coefficients** change. This separates a valid fit from repaired-V2's remaining training/inference mismatch.

Rationale: remove identified target-result count leakage and align live/training semantics; classification **technical correction**, explicitly documented. Same declaration-only 2026 population: 3,935 races / 36,223 runners; V2/V3 log loss `2.001080948 / 2.001119453`, Brier `.835650372 / .835654893`. V3 is fractionally worse on those proper scores. That is no evidence of improved identification or returns. Exact paired Top1/Top2 counts from the original validation output were not recovered; **Rationale not established** for a ranking superiority claim. Historical publication-time provenance remains incomplete.

### AW V1 → V2: substantial representation replacement

V1's 32 columns become V2's 95: use canonical numeric transforms, 43 prior-comment columns and separately fitted AW coefficients; add Best-L3 Performance and latest/best/average Today's Rating; add trainer/jockey log exposure, log history, draw fraction and other canonical slots. AW Speed remains family-specific despite inherited `*_turf_speed` names. Numeric missingness changes from observed-training-mean fill to **zero plus missing flags**, followed by fixed training standardisation. Prior-start counting/window semantics are not interchangeable with V1's explicit supported AW-starter count.

Two canonical going slots and flags are replaced with surface history: `log1p(matching-material eligible runs in 365 days)` and `n/(n+5) × (matching-material mean performance − all-material mean performance)` within the latest five eligible AW starts. Slicing precedes material/rating filtering. Unknown material/history remains explicit; no Turf fallback. Declarations, capture cutoffs and vector freezing follow Turf V3. Training is AW-only 2025, 90 epochs, L2=.02, no post-fit calibration. Training population differs from V1.

Documented rationale: approved canonical methodological parity and an AW-relevant surface substitution; the earlier 99-column race-category proposal was rejected because race-common terms cancel. Classification **documented modelling choice/hypothesis with technical controls**. Its approval and implementation are documented in [methodology](tissue-model-methodology.md). An original preserved numerical paired V1/V2 report demonstrating improvement was not recovered: **Rationale not established** for superiority of the extra comments, new imputation, surface terms or each changed coefficient individually. AW parity shadow is supporting earlier research, not this 95-column artifact. Before/after live totals cannot resolve this because dates, fields, features and prices differ.

### November additions: Turf V3 → V4, AW V2 → V3, Jump → Hurdle V2

The first three families retain their original base coefficients/means/scales exactly. They add standardized context logits before full-field softmax. Effective slopes below are logits per encoded raw unit; centering contributes only race-common constants.

| Added input | Turf V4 | AW V3 | Hurdle V2 |
|---|---:|---:|---:|
| Best-L3 Speed rank 2 or 3 | +.181532 | +.168112 | +.011176 |
| Speed rank unavailable | −.269154 | +.308468 | +.008279 |
| Same-OR Speed gap / 10 | +.219268 | −.333090 | absent |
| Recent non-completion | absent | absent | −.293052 |
| Latest pulled-up | absent | absent | −.168634 |
| Completed-last-three fraction | absent | absent | +.119072 |
| Completion history absent | absent | absent | −.110171 |

Same-OR gap compares Best-L3 Speed with the mean among **other** captured runners sharing exact OR; absent peer/OR/Speed gives zero. Hurdle completion context was loaded across source codes, not Hurdle-only. The misleading family-specific description in the November specification does not change the loader: [context query](../src/lib/racing/tissue-generation-context.ts) has no Hurdle subtype restriction. This was later central to V3 redesign. Recent means the inherited ≤30-day condition; latest PU and completion are separate, potentially overlapping effects.

Motivation: earlier frozen non-red T1/Speed-rank, same-OR and Hurdle recency/completion research; fit small regularised adjustments instead of refitting 79–95 coefficients on a small sample. Classification **hypothesis plus measured but limited development evidence**. Family capture-order split is first 70% fit, last 30% choose L2=.2 or 2 by log loss; then selected adjustment refitted on all development books. Total 305 races / 2,766 runners. Prices/ROI did not select parameters. The later block is selection evidence, not independent validation; same-day capture batches can straddle its boundary.

| Family / transition | All development races | Old → new Top1 | Old → new Top2 | Old → new loss | Selected later-block old → new loss | Later-block Top1 / Top2 old → new |
|---|---:|---:|---:|---:|---:|---|
| Turf V3 → V4 | 71 | 19 → 20 | 31 → 28 | 2.116369 → 2.091260 | 2.156795 → 2.117417 (22 races) | 7 → 8 / 9 → 10 |
| AW V2 → V3 | 79 | 14 → 11 | 33 → 28 | 2.174843 → 2.145091 | 2.200180 → 2.171600 (24 races) | 2 → 1 / 9 → 6 |
| Jump V1 → Hurdle V2 | 94 | 28 → 28 | 49 → 45 | 1.958005 → 1.941527 | 1.822254 → 1.817993 (29 races) | 10 → 10 / 18 → 15 |
| Jump V1 → Chase V2 | 61 | 18 → 18 | 32 → 30 | 1.737896 → 1.729752 | 1.541705 → 1.559665 (19 races) | 8 → 7 / 14 → 12 |

Chase's final column compares old shared Jump with promoted Shadow; its context gate compared fitted additions against **Shadow**, not old Jump. Neither Chase context candidate beat the Shadow base, so all four additional Chase weights are zero. Chase promotion used the broader reference below.

The recorded selection objective explains how these models were chosen. **Rationale not established** for treating reduced Top2 or AW Top1 as acceptable for the user's winner-identification objective beyond that log-loss choice. Better probabilistic calibration is a different objective from Top1/Top2 capture and captured-price profit.

### Chase V1 → V2: new fitted balance, same input names

Chase V2 embeds exact `CHASE_SHADOW_V1` candidate A: a Chase-only joint refit of the original 79 Jump inputs. Jan–Sep 2025 develops candidates, Oct–Dec validates using loss and stated ECE/Top2/feature-count tie-breaks, then all eligible 2025 Chases refit. Alternatives with specialised Chase Speed/context were not selected. Of 79 parameters, 68 means/scales/weights change; 42/43 effective comment slopes change and 11 switch sign. Examples: latest-led `.213449 → .067096`; latest-stayed-on `.141119 → .259219`; last-three-strong-finish `.1222 → −.2136` logits per encoded unit. Age becomes more negative; trainer rate and latest Speed slopes decline. Exact rows are in the parameter appendix.

Documented rationale: Chase-specific probability quality, not a manually chosen comment boost. Classification **measured retrospective evidence for the joint refit**. The reconciled 2026 reference is 1,220 races / 9,083 runners: log loss `1.8583 → 1.8251`, ECE `1.58% → .76%`, Top1 `303 → 321`, Top2 `547 → 554`. November recent development is less favourable, as the preceding table shows. These are different populations and cannot be substituted for each other.

[The 6 November audit](chase-comment-balance-audit-2026-11-06.md) confirms intentional joint refitting, not separate user approval for every phrase change. It does not prove each altered comment coefficient independently improves quality. **Rationale not established** for individual signs or a precise desired comment/numeric influence ratio. Comment dispersion fell 17.1% on its then-current fields while numeric dispersion fell 36.4%, increasing comments' relative role without a literal block multiplier.

### Hurdle V2 → V3 challenger: explicit semantics redesign, not promotion

V2 inherited mixed-code experience/comments/completion, rated-history windows, zero-fill/multiple missing flags and participant priors whose starter denominators omitted canonical non-finishers in the diagnosed case. The V3 rebuild restricts horse history to prior settled Hurdle starters; actual last-three starters include unrated/DNF slots. Latest Speed is actual latest Hurdle start, not the latest rated substitute. Trainer/jockey ability stays deliberately all-code, but denominators include valid non-finishers.

V3 uses 18 inputs: OR; latest/best/average Hurdle Speed; trainer/jockey rates and log exposure; Hurdle completion fraction; five absence gates; log Hurdle starts; jump-error/finish/weakened comment channels. Observed-training-mean imputation gives missing numerics zero contribution; absence increments are constrained non-positive. Comments collapse from 43 features to three channels from the latest nonempty Hurdle comment ≤180 days old, decaying with 90-day half-life; finish/weakening are exclusive. The old latest-PU, recent-noncompletion, age, weight, recency and rank-context terms are absent from final scoring. Some were tested and rejected, not arbitrarily forgotten. Generic race-constant context is metadata, not a new suitability model.

Rationale: verified semantics defects, smaller interpretable specification, canonical denominators and explicit missingness; classification **technical correction plus chronologically selected modelling changes**. Jan–Aug 2025 trains, Sep–Oct selects, Nov–Dec can trigger core fallback; final fit on all 2025. Experience and comments passed the selection gate; other listed groups did not. L2=.01; comments receive 4× penalty; no fitted calibration. Individual conditional Best-L3 Speed slope remains negative (`−.004165`) and jump-error positive (`+.145164`), explicitly unresolved in the original report.

| Same-field comparison | 2025: 1,169 races | 2026: 844 races |
|---|---:|---:|
| V2 → V3 loss | 1.798034 → 1.823707 | 1.810486 → 1.807274 |
| V2 → V3 Top1 winners | 355 → 342 | 244 → 258 |
| V2 → V3 Top2 winners | 603 → 578 | 427 → 417 |
| V2 → V3 mean winner rank | 3.179641 → 3.239521 | 3.222749 → 3.279621 |

These preserved evaluations show a real Top2 and mean-rank regression in both years despite improved 2026 Top1/proper scores. 2025 is fitting/selection evidence; earlier V2/Atlas work already saw 2026. None is an untouched design holdout. Diagnosis of the cross-code issue does not establish that every discarded cross-code signal was useless. Example Avatar Jet changed diagnostic rank 2 → 5 when V2's 18 mostly Flat/AW starts and three cross-code comments became zero Hurdle starts/no Hurdle comments; that explains a semantic change, not future winner superiority. No production switch occurred.

The 8 November Bun/Node final-bit validator repair changed tolerance on specified logarithmic/decay values, not coefficients or official scoring. LED and PU studies remain separately labelled diagnostics: the shadow stores a fixed LED counterfactual but neither LED nor PU was added to official V3.

## Material component inventory

All original coefficients are in the parameter appendix. Influence means `weight × (encoded value − training mean) / scale`, then race softmax. Probability effects depend on the full field; no legitimate fixed percentage of model importance can be assigned from coefficient magnitudes alone. Intended effects below describe the implemented representation, not a recovered causal justification for every original feature. Unless stated otherwise, an individual component's incremental predictive benefit and negative effect were **not established separately**.

| Component / definition and source | First presence and later changes | Intended effect, evidence and known limitations |
|---|---|---|
| OR: source target official rating | Turf V1, AW V1, Jump V1; retained throughout; own missing flags/gates | Ability context. V3 Hurdle effective slope +.015091, missing-OR gate −.577474. Missing OR can materially drive ordering; historical flag-driven associations do not establish causal ability. |
| Raw Speed: canonical family rating from time/standard, distance, margin and available going context; latest/best/average prior windows | All three original families; Turf V2 repairs calculation context; AW V2 names remain Turf-labelled but read AW; Hurdle V3 changes actual starter/history scope | Prior timed performance. Correlated summary slots can have counterintuitive conditional signs. Raw Speed remains present; Hurdle V3's negative Best-L3 slot does not mean all Speed information is negative. |
| Performance: family raw Speed + historical carried lb −168 | Turf V1 latest/best/average; AW V1 latest/average, AW V2 adds best and canonical semantics; absent from Jump/Hurdle/Chase tissue vectors | Weight-adjusted prior performance. Missing historical weight makes unavailable. No independent component-specific betting gain recovered. |
| Today's Rating: Performance − (target carried lb −168), latest/best/average | Turf V1; AW V2; retained in current Turf/AW base. October UI removal leaves scoring intact | Re-express performance at today's weight. Shares raw Speed/weight information; not an independent TPR/S2 prediction. No isolated incremental tissue benefit recovered. |
| Trainer/jockey prior win rates and exposure | Turf/Jump V1 rates plus `log1p(starts)`; AW V1 rates, parity/AW V2 add exposure; Hurdle V3 repairs starter denominators | Generic prior participant ability and sample depth. Major T1/T2 contribution drivers in preserved studies. Strong standalone association/large logits do not prove unique incremental value. |
| Recency, age, experience | Turf/Jump V1 and AW V1. AW canonical regime logs prior depth; Jump's `log_prior_jump_starts` live input actually uses generic `metrics.priorRuns`; Hurdle V3 replaces with Hurdle-only log starts and drops age/recency | History/exposure context. Names do not prove family provenance. Chase refit strengthens age/layoff penalties and changes depth sign; some harmful swaps result. |
| Carried weight | Target `weight_lbs` in original models; also appears inside Turf/AW Performance/Today transforms; Hurdle V3 candidate rejected | Conditional weight information. No standalone hand-coded tissue weight penalty. Separate direct and derived effects must be analysed jointly. |
| Class, distance, field size, handicap, going soft/heavy/firm flags | Canonical Turf/Jump core; AW V1 has class/distance/field/handicap, AW V2 swaps going for surface history | These are **race-level main effects**, generally identical for all runners and cancelling in linear race softmax. No explicit horse-by-distance/going/class suitability interaction exists in these slots. Missingness anomalies aside, they cannot discriminate within race. Field-size repair affects draw fraction/fit; it is still required for semantic integrity. |
| Draw and draw fraction | Turf V1; AW V1 draw, AW V2 fraction; Turf V3 declaration-only denominator | Runner-varying draw information; not a separately fitted course/distance draw map. No isolated incremental benefit recovered. |
| Generic prior comments: count ≤3, latest flags and last-three counts for 21 phrases | Turf V1, Jump V1; AW V1 none, parity shadow three columns, AW V2 full 43. Chase V2 refits all; Hurdle V3 replaces | Captures start, pace, trouble, finish/weakening and equipment descriptions. Broad chronology filter does not certify original publication times. Counts overlap; joint removal changes correlated predictors. |
| Hurdle V3 comments | Three Hurdle-only decayed channels described above | Comments passed 2025 validation gain ≈.019736 loss. This supports the block in that protocol; positive jump-error sign and reduced Top2 remain unresolved. |
| Missing values and flags | Turf/Jump zero-fill + flags; AW V1/parity mean-fill + flags; AW V2 zero-fill + flags; Hurdle V3 mean-fill + bounded gates | Missing is not real zero. Raw numeric zero-fill offsets and explicit flag contributions must be evaluated together. Broad removal of AW flags worsened preserved 2025/2026 loss; residual missing-history premium remains uncertain. |
| AW surface history | AW V2, inherited unchanged by AW V3 | Material familiarity and recent within-horse surface contrast, not generic going suitability. Actual definitions, shrinkage and missing flags preserved. Independent incremental benefit at introduction not recovered. |
| Speed-rank/same-OR context | November Turf V4/AW V3/Hurdle V2; Chase tested but zero | Re-expression/interaction of already present Speed/OR and missingness. Small-sample selected loss improves; ranking can deteriorate. AW rewards missing rank and penalises same-OR Speed gap. |
| Completion / latest PU | Six-term Hurdle V2 context; V3 retains Hurdle-only completion and drops duplicate failure/recency terms | Completion/reliability context with overlapping failure terms. Mixed-code provenance invalidates calling V2's history Hurdle-specific. No blanket removal benefit established. |
| Calibration / normalization | Original models use fitted logits + race softmax. Hurdle V3 explicitly temperature=1, intercept=0; AW V2 no post-fit calibration | No deployed extra calibrator found in these artifacts. The separately named Hurdle V2 calibration experiment is not production `HURDLE_TISSUE_V2`. A positive monotonic transform can preserve ranking while changing value estimates. |

No market odds, SP, returns, Timewise or Value rank enter the tissue model vectors identified here. Market prices are evaluation/selection-layer inputs. No standalone recent finishing-position score, separate race-class penalty, or learned horse-by-going/distance suitability module should be inferred from the presence of class/going/distance metadata.

Later preserved diagnostics are useful context but were unavailable for the original decisions. [Winner-alignment study](/tmp/model-vs-winner-alignment-diagnostic.md) found AW flag removal worsened loss by .04330/.03199 in 2025/2026; AW context removal improved loss by .02041/.03731, while the small fitted-book later slice disagreed. Turf same-OR removal improved .01460/.00947. [Hurdle/Chase alignment](/tmp/hurdle-chase-winner-alignment-diagnostic.md) found Chase comment removal worsened loss by .01700/.01484; Hurdle comment removal worsened .05088/.00975, while partial reduction behaved differently by year. These are retrospective, often selection-informed counterfactuals, not new training or evidence that an original decision already had those results. They argue for examining blocks jointly rather than deleting apparently undesirable signs.

## Original Tissue 1 versus Tissue 2 comparison reproduced

The strongest directly matching recovered evidence is the component study of **5–6 November**, exported by 7 November. It contains **78 distinct races / 725 runners**: AW 34, Hurdle 25, Chase 19, Turf zero. Each race contributes one T1 and one T2 reference selection: 156 selection observations, not 156 independent races. It uses the November production family models. There is no evidence here that the user's earlier conversation necessarily referred to this exact export; any earlier unspecified “original Tissue 2 study” remains unidentified.

At its frozen outcome snapshot, 14 runners were unresolved and 30 NR. Pending was not counted as loss; original ranks and probabilities were retained without withdrawal renormalisation.

| Cohort | Captured selections / races | Settled | Winners | Strike | Model expected winners |
|---|---:|---:|---:|---:|---:|
| All T1 | 78 / 78 | 75 | 14 | 18.67% | 18.0455 |
| All T2 | 78 / 78 | 76 | 23 | 30.26% | 13.7977 |
| AW T1 / T2 | 34 each | 34 / 34 | 6 / 9 | 17.65% / 26.47% | 7.2241 / 5.4647 |
| Hurdle T1 / T2 | 25 each | 25 / 24 | 5 / 7 | 20.00% / 29.17% | 6.2125 / 4.4635 |
| Chase T1 / T2 | 19 each | 16 / 18 | 3 / 7 | 18.75% / 38.89% | 4.6089 / 3.8696 |

Market comparison below uses only settled selections with complete **original captured full-field** prices: inverse median-bookmaker decimal prices normalized over the captured field, including runners later NR, matching the original frozen book. No SP, forecasts, later quotes or estimated prices were used. Six of 78 books lacked complete prices; one further priced race was pending. Model expectation and winners are explicitly restricted to each displayed priced cohort.

| Captured-price cohort | N | Winners | Model expected | Market expected | £1 P/L | ROI |
|---|---:|---:|---:|---:|---:|---:|
| All T1 | 70 | 14 | 16.9760 | 16.8009 | −£15.87 | −22.67% |
| All T2 | 71 | 21 | 12.9403 | 13.6400 | −£6.65 | −9.37% |
| AW T1 | 32 | 6 | 6.8103 | 6.7949 | +£1.35 | +4.22% |
| AW T2 | 32 | 8 | 5.1485 | 5.2293 | −£6.11 | −19.09% |
| Hurdle T1 | 25 | 5 | 6.2125 | 6.4309 | −£14.83 | −59.32% |
| Hurdle T2 | 24 | 7 | 4.4635 | 4.6380 | −£5.38 | −22.42% |
| Chase T1 | 13 | 3 | 3.9532 | 3.5751 | −£2.39 | −18.38% |
| Chase T2 | 15 | 6 | 3.3283 | 3.7727 | +£4.84 | +32.27% |

These return amounts are new diagnostic arithmetic on the original winner/price snapshot, not an original published ROI table or re-settlement of a ledger. This workbook does not expose a reliable recorded settlement-version field; amounts cannot be certified as a remediated Settlement V3 portfolio. There are no dead-heat winners in this original cohort; each settled winner contributes its captured decimal return and each losing starter −£1. This is not an assertion that all quoted bets were executed or fillable at scale.

For a fairer same-race check, both T1 and T2 were settled in **74 races**: T1 14/74 (18.92%), T2 21/74 (28.38%). Model expectations were 17.9324 / 13.3806. On the **69 common complete-price races**, T1/T2 had 14/19 winners, market expectations 16.6211 / 13.1120, P/L −£14.87 / −£12.35 and ROI −21.55% / −17.90%. The apparent return gap shrinks materially when denominators match.

Conditional on the 35 paired races won by either selection, a descriptive two-sided exact sign test for 21 versus 14 gives `p≈.311`. This selected two-day sample, repeated horses and multiple previous subgroup investigations prevent treating that as an independent confirmatory test. There is no stable superiority finding from this sample.

**What was real:** more T2 winners in the preserved sample, exceeding its model expectation and the captured-market expectation on the smaller priced cohort. **What was not established:** durable superiority, independent incremental market information, or overall captured-price profitability. AW T2 illustrates the distinction especially clearly: more winners and above-market winner count, yet worse returns than T1.

### Did model changes affect that advantage?

The workbook already contains old-model replay on the exact same frozen fields. Old T1 had **19/75** winners versus new T1 **14/75**; old T2 had **17/75** versus new T2 **23/76**. Old/new per-rank eligibility differs because selected NR identities differ; these are not fully identical settled selection cohorts. They demonstrate a sample change in ordering, not a general model effect or a paired monetary test.

The subsequent [swap audit](/tmp/tissue-t1-t2-swap-driver-audit.md), with its own later outcome snapshot, records 13 old-T1→new-T2 demotions: six old leaders won, no replacement leaders won, six neither, one pending. Four of those winning demotions were Chase; two AW. At the earlier component snapshot, six of the 23 T2 winners were old T1, 13 were already old T2, four came from outside old Top2. Therefore T2's lead is partly explained by demotion of successful old leaders, but not entirely.

Mathematical drivers are identifiable: AW missing-Speed +.308468 changes three demotions; same-OR context changes two. Chase changes combine comments, trainer/jockey, age, weight/experience and recency. Comments oppose some harmful swaps, including Royal Infantry; restoring comments in isolation is not a universal repair. Hurdle's single early demotion was a small Speed-rank effect. These observations strengthen the concern about ordering; they do not establish that a specific old coefficient package should be reinstated. Hurdle V3 was created after this sample and never altered these official selections, so cannot have weakened its original T2 advantage.

## Which paired comparisons are valid?

| Comparison | Technically feasible from preserved evidence? | Interpretation and limitations |
|---|---|---|
| Turf V1/V2/V3 original definitions | Partially | All fitted artifacts survive; archived V1 and corrected caches are referenced. Correct reproduction needs each version's rating regime, original comments/count semantics and source snapshots. The original generated V1/V2 validation report and immutable historic publication times were not recovered. One modern vector fed to all three is coefficient sensitivity, not original-definition replay. |
| Turf V2 versus V3 on declaration-only vectors | Yes, coefficient/fit comparison | Published proper scores above; V2's original fitting count semantics differed. Label the experiment accordingly. |
| Turf V3 versus V4; AW V2 versus V3; shared Jump versus Hurdle V2 | Yes on generation full-field vectors | Exact base models and all adjustment vectors frozen; remove added logits and re-softmax, with original field/price/outcome cohort held fixed. Older-model scores are retrospective counterfactuals on genuine prospective inputs. |
| Shared Jump versus Chase V2 | Yes | Same 79 named input semantics on compatible frozen books; use each model's own means/scales. Original broader reference also preserved. No new feature reconstruction required for coefficient attribution. |
| AW V1 versus V2 | Limited | Different 32/95-column semantics/imputation/history, not interchangeable vectors. Date-cohort totals are not paired evidence. Requires both frozen representations at a common cutoff; do not manufacture missing prices or history. |
| AW V1 versus parity shadow | Yes on existing paired books | Respect two capture times and incomplete changed-leader price coverage; shadow extras were separately loaded. This is not AW production V2/V3. |
| Hurdle V2 versus V3 | Yes in preserved rebuilt dataset and genuine shadow pairs | Dataset is historical reconstruction; November pre-V3 replay is diagnostic. Only post-arming accepted pairs are genuine prospective V3. New/old collection epochs must remain separate. |
| Excuse-half / mismatch-zero paired experiments | Yes within their original frozen ledgers | Fixed coefficient/input counterfactuals, not production V2 models or independent tests selected after reviewing returns. |
| Model generation and current sources | Only with source provenance retained | Identical coefficients do not imply identical effective model if upstream starter/history definitions changed. November 11 reports document fixture ranking effects under unchanged weights. |

Source pins must remain part of model identity. The [11 November collection report](../data/research/prospective-epochs-2026-11-11/report.md) explicitly separates current production dependencies and Settlement V3 from old preserved evidence. Model artifacts, collection epochs, scorer markers and settlement versions are all required grouping keys. Do not infer current source compatibility solely from a historic content checksum. No replay here is described as an independent holdout.

## Component monitoring feasibility

Existing generation books store family/model hash, feature order, each runner's base and adjustment inputs, capture/cutoff/off timestamps, original full field, prices/quotes and outcomes. Hurdle shadow adds Hurdle source evidence, canonical participant counts/digests, official V3 and separate LED outputs. Older AW/Jump books freeze model vectors and some raw/provenance fields; older Turf coverage is more limited. Some underlying historical comments/material/run details cannot be recovered from a numeric flag alone.

| Question | Possible now from frozen observations | What still needs future evidence or unavailable inputs |
|---|---|---|
| Standalone winner identification | Rank available component values/contributions within each stored complete field; report availability, wins and ties using fixed definitions | An optimally fitted single-component probability model would require fitting and is outside this audit. Missing original source inputs cannot be reconstructed as if prospectively observed. |
| Ranking contribution | Exact per-feature and grouped T1–T2 or old–new logit margins; current and base ranks; winner rank and Top1/Top2 hits | No causal claim from one influential coefficient or a losing swap. Correlated/overlapping groups require joint interpretation. |
| Incremental fixed-model prediction benefit | Zero a predeclared block's **contribution**, recompute full-field softmax, compare race-paired loss/Brier/calibration and ranking | This is fixed-weight ablation, not the best refitted model without that feature. Fresh later evidence is needed after diagnostic selection. |
| Market-relative prediction | Compare the same frozen selection/cohort against normalized complete captured markets; fixed price/rank strata | Incomplete books cannot supply full-field market expectation. Cross-stream capture joins need exact timestamps/identity; SP is a different retrospective benchmark. |
| Captured-price profitability | £1 returns at each actually frozen runner price, restricted to jointly eligible, priced, settled selections and recorded settlement basis | A changed leader without a captured quote has no return estimate. No price substitution, execution guarantee, threshold search or pooled duplicate stakes. |
| Original source provenance | Existing source metadata, Hurdle shadow evidence and current collection dependency pins | Old numeric snapshots do not prove original publication time, full raw comment text/history, or why an earlier developer chose a feature. |

Standalone association, additive ranking influence, fixed-model ablation and refitted incremental benefit are four different questions. Existing reports already cover component score decomposition, reliability, Speed-rank strata, Chase swaps and Hurdle V2/V3 disagreements. A read-only diagnostic over those ledgers can answer most remaining attribution questions; it does not require one live monitor per component.

The smallest useful follow-up should be predeclared once, use common races/prices and preserve all existing files. Its main priority is AW context and Chase old-leader demotions, with Hurdle V2/V3 Top2 loss reported alongside Top1 and log loss. Future existing shadow/collection observations can assess persistence without fitting or changing collection. The currently active new collection ledgers contain zero observations, so they provide no new performance evidence yet.

## Remaining unknowns and validation boundary

- The exact earliest conversation/report meant by “Tissue 2 was better” is not uniquely recoverable. The 5–6 November evidence is directly matching and reproduced; it must not be relabelled as a model-version comparison or an older unspecified study.
- Original Turf V1/V2 generated validation output and a numerical AW V1/V2 promotion comparison were not recovered. Builder code is evidence of intended procedure, not proof of actual numerical outcomes.
- Original feature-by-feature motivations, individual fitted signs and an explicit winner-capture tradeoff approval are not documented. **Rationale not established.** Joint fitting and loss minimisation explain a mechanism, not a feature-specific justification.
- Several later component studies reuse historical development or previously inspected 2026 data. They can expose weaknesses but cannot retroactively justify decisions or establish new independent validation.
- Historical publication/revision times and parts of raw source history are incomplete. Frozen prospective vectors support exact later arithmetic; they cannot repair those old unknowns.
- Reported original monetary calculations retain the original snapshot's outcomes and missing-price coverage. No settlement correction or cross-epoch aggregate was performed.

Validation for this diagnostic comprised original-cohort reconciliation, full-field frozen-parameter replay, production artifact loader validation, read-only collection source integrity, coefficient/scaler comparison and before/after file hashing. No application or Python script was changed, so application build/typecheck and Pyright were not needed. The only repository additions made by this audit are this report, its parameter appendix and evidence JSON.

The starting hash inventory covered 1,107 existing files. Ten mutable research ledgers changed during the audit, consistent with concurrent workflow activity; no existing non-ledger file in that inventory changed and none was missing. This audit invoked no capture, settlement, ingestion or ledger mutation. The evidence JSON records the affected paths and before/after hashes rather than claiming global byte preservation. All 725 original runner capture times, probabilities, ranks and prices were rechecked successfully after those updates. Original workbook outcomes, rather than newly updated ledger outcomes, remain the comparison basis. The earlier source-ledger hash in the evidence manifest identifies the snapshot read for the calculation; it is not asserted to be the file's later hash.
