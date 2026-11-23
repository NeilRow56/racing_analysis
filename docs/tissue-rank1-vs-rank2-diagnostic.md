# Tissue Rank 1 vs Rank 2 diagnostic

**Evidence window:** 5–20 November 2026. **Scope:** current frozen Tissue generation.

## Executive summary

On 380 identical settled races, T1 won 81 and T2 won 83. At final SP, T1 returned **−£116.56 (−30.7%)** and T2 returned **−£16.99 (−4.5%)**. T2's £99.56 advantage came from almost the same number of wins at better payouts. Average decimal SP was 5.69 for T1 and 10.18 for T2. T2 was marginally profitable on the AW and Chase matched samples and lost on Hurdle and Turf.

- The model allocated 90.33 expected wins to T1 and 64.14 to T2, for actual/model ratios of **0.90 and 1.29**. Final SP expected 93.26 and 68.21. Both model and market expected a clear separation that did not materialise. AW accounted for much of the T2 underestimation. Chase was close to calibrated at both ranks.
- The shorter-SP horse won 118 times in the 370 races where the two prices differed. The longer-SP horse won 41 times. When T2 was shorter, it won **54 to 15** and supplied **£85.21 of the £99.56** aggregate return advantage. When T1 was shorter, it won **64 to 26**, although T2 still lost less at those prices.
- Trainer and jockey history and recent comment flags most often supplied the T1 score lead. The AW adjustment is a specific concern. It awards **+0.3085 score units for missing Best L3 Speed rank** and subtracts **0.3331 per unit of positive same-OR Speed gap**. The combined adjustment changed the highest-scoring runner in 28 of 123 AW books. On the 27 changed races where both frozen picks and the base leader started, the base leader won nine and the final T1 won five.
- Hurdle's completion adjustment changed seven leaders. Chase's generation adjustment is exactly zero. A single shared adjustment, a market input or a separate ranking formula cannot explain the pattern. The evidence justifies an isolated AW attribution follow-up. It does not establish a systematic improvement from promoting T2.

The [race-by-race evidence](tissue-rank1-vs-rank2-diagnostic-evidence.json) contains all 413 frozen pairs, including pending and excluded picks. Each row identifies both horses and runner IDs, frozen input vectors, score components, original ranks and probabilities, final SP and its implied probability, final-SP rank, frozen OR and race-relative OR rank, settlement result and exact per-feature contributions. The parameters section gives every feature name, mean, scale and weight in the order used by the vectors. Aggregate results are included at full precision.

## 1. How the four models rank a horse

For runner i, x is its stored base vector and a is its stored family adjustment vector. The production calculation is

```text
B_i = Σ_j w_j (x_ij − μ_j) / σ_j
A_i = Σ_k v_k (a_ik − m_k) / s_k
S_i = B_i + A_i
p_i = exp(S_i − max(S)) / Σ_r exp(S_r − max(S))
```

Both blocks use the frozen family parameters. There is no separate intercept, temperature, odds blend, filter or manual rank override. Subtracting the maximum score stabilises exponentiation. All horses in the complete pre-off active field receive a probability. Declared non-runners at capture are removed before scoring. Final SP, captured bookmaker quotes, Value thresholds and target outcomes have no role in the score. Capture records market quotes after scoring. Settlement adds outcomes without rescoring, so a later non-runner does not promote the stored T2 to T1.

Rank is descending on the same full-precision probability. AW, Hurdle and Chase break exact ties by ascending runner ID using localeCompare. Turf uses competition ranking. A shared first would skip second. There were no ambiguous T1/T2 books in this extract. The Today reader can select the latest whole valid pre-off capture for a race, while the Research summary counts frozen ledger entries. There was one capture per race ID in this extract.

[Production scorer](../src/lib/racing/tissue-generation-model.ts#L40) · [dot product and softmax](../scripts/diagnose-independent-tissue-feasibility.ts#L111) · [live capture wiring](../src/lib/racing/tissue-generation-sync.ts#L26) · [frozen settlement and Research aggregation](../src/lib/racing/tissue-generation-forward.ts#L68) · [capture selection](../src/lib/racing/frozen-capture-selection.ts)

### Base inputs and sources

| Block | Turf V4 | AW V3 | Hurdle V2 and Chase V2 |
|---|---|---|---|
| Frozen base identity | Turf V3 (`tissue_model_v3`) | AW V2 (`AW_TISSUE_V2`) | Hurdle uses `JUMP_TISSUE_V1`. Chase uses promoted `CHASE_SHADOW_V1`, with its own fitted weights on the Jump vector. |
| Rating and form | Racecard OR. Latest usable, best L3 and average L3 Turf Speed, weight-adjusted Performance and Today's Rating. | Same nine form slots from AW history. The three column names ending in `turf_speed` actually carry AW Speed. | Racecard OR. Latest usable, best L3 and average L3 canonical Jump Speed. No Performance or Today's Rating slots. |
| Connections | Trainer and jockey prior win percentage and `log1p` of their prior run counts. | Same transforms. | Same transforms. |
| Recency, experience and runner conditions | Days since last eligible run, `log1p` of count, racecard age and pounds carried. | Same transforms. | Same transforms. The slot named `log_prior_jump_starts` receives `log1p(metrics.priorRuns)`. The live metric counts eligible horse history across codes. |
| Race conditions | First numeric substring of class, distance in yards ÷ 220, declared field size, draw, draw ÷ declared size, text handicap indicator, text soft/heavy and firm flags. | Same except the two going slots are replaced by AW material exposure and recent performance delta. | Class, distance, declared field size, handicap classification and soft/heavy and firm flags. No draw. Unknown handicap is missing. |
| Missingness | 26 numeric inputs and 26 companion missing flags. | 26 numeric inputs and 26 companion missing flags. | 18 numeric inputs and 18 companion missing flags. |
| Form comments | Count of usable prior comments, 21 indicators for the latest usable comment and 21 counts of positives over up to three prior comments. | Same 43 columns. | Same 43 columns. The prior comment stream is mixed-code. |
| Vector size | 95 base + 3 adjustment | 95 + 3 | Hurdle 79 + 6. Chase 79 + 4, with all four adjustment weights zero. |

The live loader attaches Sporting Life horse history, trainer and jockey histories and comments bounded by the feature cutoff. Horse-history candidates must have a recorded winning time. The horse aggregator excludes non-runners and requires a recorded position or status. “Latest” rating means latest usable rating. Best and average L3 take the last three eligible history slots **before** filtering for usable Speed or ratings. A run on another code or with no rating can therefore occupy a slot. Days since run are floored from elapsed days. Trainer and jockey prior rates use `100 × wins / runs` over position-bearing runs before cutoff. Their denominator excludes non-runners and positionless non-finishers. A zero qualifying run count remains zero after the log transform. Its win rate is missing.

Speed comes from the prior-run rating engine. Turf and Jump use `100 + 37.76 × (standard seconds − equivalent finishing seconds) / furlongs`. AW uses `100 + (standard seconds − equivalent finishing seconds) / seconds per length`. Equivalent finishing time uses the historical winning time and beaten lengths. Where supported, the engines prefer the same-day adjustment to their base standards and can withhold unusable figures. Flat Performance is `Speed + (historical weight − 168 lb)`. Flat Today's Rating is `historical Performance − (target weight − 168 lb)`. The direct target-weight term is additional. Class, distance, field size and going indicators cancel in the pair difference when shared across the field. Historical distance and going can still matter upstream to Speed. There is no dedicated target-distance form or going-suitability bonus in these vectors.

Numeric absence is zero-filled before standardization and gets a companion flag. A zero in the value slot needs its flag to distinguish observed zero from absence. The text-derived going flags are zero when they do not match, including empty going text. Comments are encoded using fixed regular expressions, with zeros for absent flags and counts, and a separate comment count. The flags are slowly away, awkward start, prominent, led, held up/rear, raced freely, hampered, bumped, checked, denied room, short room, switched, raced wide, stayed on, strong finish, weakened, faded, eased, never dangerous, lost touch and equipment. Individual prior comments, individual last-three ratings and historical weights are absent from this ledger. The paired evidence uses the saved aggregates and flags.

[Input capture](../src/lib/racing/tissue-value-sync.ts#L13) · [horse history and aggregates](../src/lib/racing/horse-metrics.ts#L448) · [participant priors](../src/lib/racing/trainer-quality.ts) · [Turf input mapping](../src/lib/racing/tissue-forward.ts#L527) · [AW input mapping](../src/lib/racing/aw-tissue-v2.ts#L44) · [Jump vector](../src/lib/racing/jump-tissue-model.ts#L185) · [comment flags](../scripts/diagnose-independent-tissue-feasibility.ts#L11) · [comment source](../src/lib/racing/jump-tissue-sync.ts#L49) · [Turf Speed](../src/lib/racing/turf-speed-rating.ts#L157) · [AW Speed](../src/lib/racing/aw-speed-rating.ts#L164) · [Jump Speed](../src/lib/racing/jump-speed-rating.ts#L234) · [weight normalization](../src/lib/racing/weight-performance.ts) · [Today's Rating](../src/lib/racing/todays-rating.ts)

### Family adjustments and interactions

The numbers below are effective slopes, weight divided by scale. The centering constants cancel within a race. Exact parameter triplets are in the [family manifest](../data/research/tissue-generation-2026-11-manifest.json) and [paired evidence](tissue-rank1-vs-rank2-diagnostic-evidence.json).

- **Turf V4.** `+0.181532 × [Best L3 Speed rank is 2 or 3] − 0.269154 × [rank missing] + 0.219268 × same-OR Speed gap`. Speed rank uses finite observed values and competition ties. Same-OR Speed gap is `(own Speed − mean Speed of other runners at identical observed OR) / 10`. It is zero without a usable comparison.
- **AW V3.** `+0.168112 × [Best L3 Speed rank is 2 or 3] + 0.308468 × [rank missing] − 0.333090 × same-OR Speed gap`, using AW Speed. The base also takes `log1p(same-material timed AW starts in the prior 365 days)`. The performance delta selects five recent eligible AW slots first. With m usable same-material Performance ratings it is `m/(m+5) × (mean matching Performance − mean all usable recent AW Performance)`. It is missing without a usable matching rating or reliable history/material mapping. Zero exposure with known history is distinct from missing exposure.
- **Hurdle V2.** `+0.011176 × [Speed rank 2 or 3] + 0.008279 × [rank missing] − 0.293052 × [recent non-completion] − 0.168634 × [latest pulled up] + 0.119072 × [fraction completed] − 0.110171 × [completion history missing]`. Completion uses up to three recent timestamped Sporting Life result records across codes, excluding the target and NR/void records. A numeric finish counts as completion. The 30-day flag combines the existing days-since-run feature with the newest completion record's status. Latest PU and recent failure can both fire. No history gives fraction zero with the missing-history flag set.
- **Chase V2.** Speed ranks, the count of slots with usable Jump Speed in the latest three eligible all-code slots and the unknown-count flag are stored. All four adjustment weights equal zero. The final score is the promoted Chase Shadow base score. A zero usable count is known. Unknown count gets zero with the missing flag set.

The scorer adds the two linear blocks. Interactions arise entirely in the input construction, including the same-OR Speed term, draw fraction, weight adjustment, material context and Hurdle recency gate.

[Generation feature code](../src/lib/racing/tissue-generation-features.ts#L14) · [completion loader](../src/lib/racing/tissue-generation-context.ts#L6) · [completion status](../src/lib/racing/hurdle-recency-forward.ts#L143) · [AW material formula](../src/lib/racing/aw-tissue-v2-features.ts#L21) · [Chase Speed count](../src/lib/racing/jump-speed-reliability.ts#L21) · [retained-adjustment rule](../scripts/develop-tissue-generation.ts#L96)

## 2. Cohorts and result reconciliation

The exact figures supplied in the brief are reproduced at the **20 November 13:40:49.039 UTC** settlement batch. At that point T1 had 372 settled, 77 wins and 89.6765 expected, with 322 priced at −35.16%. T2 had 365 settled, 78 wins and 62.2722 expected, with 317 priced at −5.97%. Those price counts and returns are the Research page's persisted **capture-price** basis. They are included only to reconcile that display. The corresponding final-SP matched sample at that cutoff was 355 races and 74 versus 76 winners, with ROI **−33.9% versus −5.4%**. The full-day ledger is the main analysis below.

### Original Research page cohorts at the full-day cutoff

| Family | Rank | Captured | Settled | Winners | Model expected | Actual/model | Research priced | Research ROI |
|---|---|---|---|---|---|---|---|---|
| All families | 1 | 413 | 397 | 84 | 94.85 | 0.89 | 347 | −31.33% |
| All families | 2 | 413 | 392 | 86 | 66.38 | 1.30 | 344 | −3.72% |
| Turf | 1 | 8 | 8 | 1 | 1.34 | 0.75 | 7 | −100.00% |
| Turf | 2 | 8 | 8 | 1 | 0.99 | 1.01 | 7 | −58.86% |
| AW | 1 | 123 | 121 | 21 | 25.52 | 0.82 | 116 | −27.16% |
| AW | 2 | 123 | 123 | 29 | 18.46 | 1.57 | 118 | −1.31% |
| Hurdle | 1 | 178 | 173 | 40 | 43.26 | 0.92 | 144 | −30.71% |
| Hurdle | 2 | 178 | 168 | 37 | 28.83 | 1.28 | 140 | −5.69% |
| Chase | 1 | 104 | 95 | 22 | 24.74 | 0.89 | 80 | −32.50% |
| Chase | 2 | 104 | 93 | 19 | 18.09 | 1.05 | 79 | 1.06% |


There were 413 unique frozen race books. Two had no settlement yet (Newcastle, 5 November and Thurles, 19 November) and one was void (Huntingdon, 10 November). Each had an original T1 and T2. Across the full ledger, 16 T1 and 21 T2 picks were outside the settled denominator. Among settled picks, 17 T1 and 12 T2 had no settled counterpart in the same race. These picks remain in the full-cohort results.

The final-SP read joined frozen race and runner IDs to Sporting Life terminal full-result rides and checked the full starter field, position, winner and dead-heat divisor against the frozen settlements. It checked the raw fractional SP against the normalized database decimal, then used the original fractional price in canonical v3. All 410 settled result fields reconciled, all had complete final-SP books, and no eligible T1 or T2 price was missing. Pending, NR and void choices have no monetary stake. Unversioned early outcomes keep their frozen result status. Their monetary returns were independently evaluated under canonical v3 against terminal results, without editing the archive. No selected dead heats occurred in this sample.

An individual SP implies raw probability 1 / decimal SP. Market expectation and market rank below use the complete terminal starter field. Probabilities are normalized by dividing each reciprocal by the race's sum of reciprocals. Rank is the count of strictly shorter prices plus one. The average final SP is the arithmetic average of the decimal prices. Every stake is £1, settled at final SP. Model expected wins sum the original pre-off probabilities, retaining the probability mass originally assigned to subsequent withdrawals. This reproduces the Research page's model denominator. Raw market implied probabilities and the full-field normalization are available per race in the evidence.

[Research metric definition](../src/lib/racing/tissue-prospective-summary.ts#L17) · [capture ledger](../data/research/tissue-generation-forward-2026-11.json) · [terminal evidence checks](../src/lib/racing/hurdle-final-sp.ts#L27) · [canonical win settlement](../src/lib/racing/backtest.ts#L506)

### Full individual cohorts at final SP

| Family | Rank | Settled / SP stakes | Winners | Model expected / A/E | Mean model p | SP expected / A/E | Mean SP | Mean SP rank | P/L | ROI |
|---|---|---|---|---|---|---|---|---|---|---|
| All families | 1 | 397 / 397 | 84 | 94.85 / 0.89 | 23.9% | 99.28 / 0.85 | 5.58 | 2.52 | −£124.31 | −31.3% |
| All families | 2 | 392 / 392 | 86 | 66.38 / 1.30 | 16.9% | 71.98 / 1.19 | 9.98 | 3.42 | −£21.57 | −5.5% |
| Turf | 1 | 8 / 8 | 1 | 1.34 / 0.75 | 16.7% | 1.47 / 0.68 | 8.87 | 4.38 | −£6.67 | −83.3% |
| Turf | 2 | 8 / 8 | 1 | 0.99 / 1.01 | 12.4% | 0.88 / 1.14 | 12.08 | 5.00 | −£5.38 | −67.2% |
| AW | 1 | 121 / 121 | 21 | 25.52 / 0.82 | 21.1% | 25.88 / 0.81 | 7.10 | 2.97 | −£40.32 | −33.3% |
| AW | 2 | 123 / 123 | 29 | 18.46 / 1.57 | 15.0% | 19.70 / 1.47 | 10.05 | 3.94 | +£4.49 | 3.7% |
| Hurdle | 1 | 173 / 173 | 40 | 43.26 / 0.92 | 25.0% | 47.00 / 0.85 | 4.70 | 2.21 | −£55.36 | −32.0% |
| Hurdle | 2 | 168 / 168 | 37 | 28.83 / 1.28 | 17.2% | 32.41 / 1.14 | 11.45 | 3.18 | −£20.24 | −12.0% |
| Chase | 1 | 95 / 95 | 22 | 24.74 / 0.89 | 26.0% | 24.93 / 0.88 | 4.95 | 2.35 | −£21.96 | −23.1% |
| Chase | 2 | 93 / 93 | 19 | 18.09 / 1.05 | 19.5% | 18.98 / 1.00 | 7.05 | 3.00 | −£0.45 | −0.5% |


### Principal comparison on identical settled races

Every row has identical race membership for T1 and T2, and all picks had final SP. Column pairs are **T1 / T2**.

| Family | Races / stakes each | Winners | Model expected | Actual/model | Mean model p | SP expected | Market A/E | Mean SP | Mean SP rank | P/L | ROI |
|---|---|---|---|---|---|---|---|---|---|---|---|
| All families | 380 | 81 / 83 | 90.33 / 64.14 | 0.90 / 1.29 | 23.8% / 16.9% | 93.26 / 68.21 | 0.87 / 1.22 | 5.69 / 10.18 | 2.56 / 3.46 | −£116.56 / −£16.99 | −30.7% / −4.5% |
| Turf | 8 | 1 / 1 | 1.34 / 0.99 | 0.75 / 1.01 | 16.7% / 12.4% | 1.47 / 0.88 | 0.68 / 1.14 | 8.87 / 12.08 | 4.38 / 5.00 | −£6.67 / −£5.38 | −83.3% / −67.2% |
| AW | 121 | 21 / 28 | 25.52 / 18.19 | 0.82 / 1.54 | 21.1% / 15.0% | 25.88 / 19.33 | 0.81 / 1.45 | 7.10 / 10.14 | 2.97 / 3.98 | −£40.32 / +£2.49 | −33.3% / 2.1% |
| Hurdle | 164 | 37 / 37 | 40.93 / 28.09 | 0.90 / 1.32 | 25.0% / 17.1% | 43.69 / 31.26 | 0.85 / 1.18 | 4.81 / 11.65 | 2.26 / 3.22 | −£55.61 / −£16.24 | −33.9% / −9.9% |
| Chase | 87 | 22 / 17 | 22.54 / 16.88 | 0.98 / 1.01 | 25.9% / 19.4% | 22.22 / 16.74 | 0.99 / 1.02 | 5.08 / 7.30 | 2.38 / 3.07 | −£13.96 / +£2.12 | −16.0% / 2.4% |


## 3. What gave T1 the higher score?

For each base or adjustment column the exact contribution to the T1 lead is **(T1 input − T2 input) × weight / scale**. Summing over all columns reproduces the combined score gap. For attribution, related columns and their missingness flags are grouped together. “Largest” counts the most positive grouped contribution in a race. “Reversal” asks whether subtracting that existing contribution alone would reverse the order of the same frozen pair, with all other terms held fixed. Reversals overlap. They are a description of the arithmetic and do not establish the effect of refitting or a causal explanation for a race result.

| Family | All valid pairs | Score gap mean / median | Settled gap mean / median | Gaps < 0.10 / ≥ 0.50 (all) | Largest positive blocks (races) | Base T1 changes | Base T1/T2 reversals |
|---|---|---|---|---|---|---|---|
| All families | 413 | 0.316 / 0.228 | 0.317 / 0.228 | 104 / 89 | Trainer/jockey 180, Comments 134, Age/weight 33 | 35 | 23 |
| Turf | 8 | 0.247 / 0.203 | 0.247 / 0.203 | 2 / 1 | Trainer/jockey 4, Comments 3, Experience/recency 1 | 0 | 0 |
| AW | 123 | 0.315 / 0.240 | 0.319 / 0.242 | 27 / 27 | Trainer/jockey 49, Comments 30, Generation adjustment 16 | 28 | 17 |
| Hurdle | 178 | 0.339 / 0.238 | 0.342 / 0.246 | 42 / 42 | Trainer/jockey 84, Comments 64, Official rating 13 | 7 | 6 |
| Chase | 104 | 0.284 / 0.195 | 0.272 / 0.183 | 33 / 19 | Trainer/jockey 43, Comments 37, Age/weight 21 | 0 | 0 |

| Family | Leading individual terms by frequency | Largest positive count | Within-pair reversals on subtraction |
|---|---|---|---|
| Turf | jockey_prior_rate | 5 | 3 |
| Turf | trainer_prior_rate | 1 | 1 |
| Turf | last_strongFinish | 1 | 0 |
| AW | trainer_prior_rate | 36 | 38 |
| AW | speed_rank_missing | 12 | 15 |
| AW | same_or_speed_gap | 12 | 10 |
| Hurdle | jockey_prior_rate | 39 | 34 |
| Hurdle | last_led | 25 | 19 |
| Hurdle | trainer_prior_rate | 24 | 28 |
| Chase | age | 23 | 24 |
| Chase | jockey_prior_rate | 19 | 15 |
| Chase | last_stayedOn | 18 | 6 |


- **Turf.** Jockey win rate was the largest individual positive difference in five of eight books. The adjustment narrowed the gap by 0.086 score units on average and did not change a leader. Eight races came from one date.
- **AW.** Trainer win rate led individually in 36 books. A five-percentage-point trainer-rate difference is worth about +0.279 score, versus +0.046 for a ten-point OR difference when OR is known for both. The extra adjustment was the largest positive block in 16 books, with 17 direct pair reversals relative to the base. Subtracting the missing-Speed-rank term alone reverses 15 pairs. Subtracting the same-OR Speed gap alone reverses ten. In the **17 settled direct reversals**, final T1 won two and frozen T2 won seven. The missing-rank bonus favoured T1 in 24 books and T2 in 30, so it is locally decisive without systematically rewarding T1 overall.
- **Hurdle.** Trainer/jockey history and comment flags were the largest block in 84 and 64 of 178 books. The jockey win-rate coefficient is 0.0318 score per percentage point. A recent non-completion penalty is 0.2931 and can stack with the 0.1686 latest-PU penalty. Only six direct T1/T2 reversals came from the total adjustment. Five were settled on both sides, with no T1 wins and three T2 wins. Across six leader changes where both frozen picks and the base leader started, the base leader won three and the final T1 won zero. That is a small, selected sample.
- **Chase.** The base supplied the entire score. Connections contributed +0.107 to the lead on average and comments +0.106. Age was the largest individual positive term in 23 books. Its slope is −0.1141 per year, so a two-year age difference can be worth +0.2282 for the younger horse. Weight is only −0.00025 per pound directly in this family.

When one horse lacked a numeric feature and the other had it, the net of its zero-filled value and flag favoured the missing horse at least once in 71 of 80 such AW pairs, 23 of 44 Hurdle pairs, zero of four Chase pairs, and no Turf pairs with differing base missingness. There can be a missingness advantage for each runner on different columns in the same race. The separate AW Speed-rank bonus is in addition to those base effects.

Scaling amplifies some raw differences. For instance, the Hurdle last-three “denied room” count has a tiny fitted scale (~0.00837) and an effective slope of +6.275 per count. It did not differ between T1 and T2 in these books, so it explains none of the observed gap. The +0.3085 AW missing-rank contribution did activate and can be larger than the typical whole AW rank gap (median 0.240). It is an actual fitted term rather than an effect of rounding.

The score–probability link is exact. **p(T1) / p(T2) = exp(score gap)**. The median gap of 0.228 implies a typical ratio of about 1.26, and the mean difference in the matched books is about 6.9 percentage points. Scores widely separated by at least 0.50 supported T1 more convincingly than the smaller gaps.

| Matched score gap | Pairs | Winners T1 / T2 | Model expected T1 / T2 |
|---|---|---|---|
| < 0.10 | 99 | 18 / 25 | 19.79 / 18.81 |
| 0.10 to < 0.50 | 200 | 34 / 45 | 42.61 / 32.47 |
| ≥ 0.50 | 81 | 29 / 13 | 27.92 / 12.86 |


## 4. What the final-SP market saw

T1 or T2 is a favourite when its final price is the lowest in the terminal field. When both shared the minimum, the pair is shown separately to keep the cohorts disjoint. Each number pair below is **T1 / T2**.

| Family | Favourite cohort | Races | Wins | Model expected | SP expected | Market A/E | P/L | ROI |
|---|---|---|---|---|---|---|---|---|
| All families | T1 favourite | 150 | 53 / 20 | 39.87 / 25.65 | 56.30 / 21.49 | 0.94 / 0.93 | −£36.81 / −£24.92 | −24.5% / −16.6% |
| All families | T2 favourite | 79 | 9 / 40 | 19.86 / 14.81 | 14.32 / 28.60 | 0.63 / 1.40 | −£42.75 / +£15.88 | −54.1% / 20.1% |
| All families | Neither favourite | 147 | 18 / 21 | 29.39 / 22.90 | 21.26 / 16.74 | 0.85 / 1.25 | −£35.38 / −£9.58 | −24.1% / −6.5% |
| All families | Both co-favourites | 4 | 1 / 2 | 1.20 / 0.79 | 1.38 / 1.38 | 0.73 / 1.45 | −£1.62 / +£1.62 | −40.6% / 40.6% |
| Turf | T1 favourite | 2 | 1 / 0 | 0.45 / 0.23 | 0.82 / 0.18 | 1.22 / 0.00 | −£0.67 / −£2.00 | −33.3% / −100.0% |
| Turf | T2 favourite | 0 | 0 / 0 | 0.00 / 0.00 | 0.00 / 0.00 | — / — | — / — | — / — |
| Turf | Neither favourite | 5 | 0 / 0 | 0.65 / 0.57 | 0.32 / 0.38 | 0.00 / 0.00 | −£5.00 / −£5.00 | −100.0% / −100.0% |
| Turf | Both co-favourites | 1 | 0 / 1 | 0.23 / 0.19 | 0.32 / 0.32 | 0.00 / 3.10 | −£1.00 / +£1.62 | −100.0% / 162.5% |
| AW | T1 favourite | 41 | 11 / 8 | 9.55 / 6.22 | 14.68 / 4.94 | 0.75 / 1.62 | −£18.95 / +£2.33 | −46.2% / 5.7% |
| AW | T2 favourite | 21 | 2 / 12 | 4.78 / 3.57 | 3.62 / 7.90 | 0.55 / 1.52 | −£13.50 / +£4.66 | −64.3% / 22.2% |
| AW | Neither favourite | 58 | 7 / 8 | 10.90 / 8.30 | 7.24 / 6.15 | 0.97 / 1.30 | −£9.25 / −£3.50 | −15.9% / −6.0% |
| AW | Both co-favourites | 1 | 1 / 0 | 0.29 / 0.09 | 0.34 / 0.34 | 2.91 / 0.00 | +£1.38 / −£1.00 | 137.5% / −100.0% |
| Hurdle | T1 favourite | 70 | 28 / 8 | 19.24 / 11.90 | 27.60 / 9.61 | 1.01 / 0.83 | −£8.48 / −£13.75 | −12.1% / −19.6% |
| Hurdle | T2 favourite | 41 | 5 / 23 | 10.47 / 7.40 | 7.21 / 15.22 | 0.69 / 1.51 | −£17.75 / +£13.97 | −43.3% / 34.1% |
| Hurdle | Neither favourite | 52 | 4 / 6 | 10.83 / 8.55 | 8.48 / 6.02 | 0.47 / 1.00 | −£28.38 / −£15.46 | −54.6% / −29.7% |
| Hurdle | Both co-favourites | 1 | 0 / 0 | 0.38 / 0.24 | 0.41 / 0.41 | 0.00 / 0.00 | −£1.00 / −£1.00 | −100.0% / −100.0% |
| Chase | T1 favourite | 37 | 13 / 4 | 10.63 / 7.29 | 13.21 / 6.77 | 0.98 / 0.59 | −£8.71 / −£11.50 | −23.5% / −31.1% |
| Chase | T2 favourite | 17 | 2 / 5 | 4.60 / 3.84 | 3.49 / 5.48 | 0.57 / 0.91 | −£11.50 / −£2.75 | −67.6% / −16.2% |
| Chase | Neither favourite | 32 | 7 / 7 | 7.00 / 5.48 | 5.21 / 4.18 | 1.34 / 1.67 | +£7.25 / +£14.38 | 22.7% / 44.9% |
| Chase | Both co-favourites | 1 | 0 / 1 | 0.30 / 0.27 | 0.30 / 0.30 | 0.00 / 3.30 | −£1.00 / +£2.00 | −100.0% / 200.0% |


The favourite split distinguishes market disagreements at the top of the entire field. The next split also captures cases where neither pick was favourite but the market priced one ahead of the other.

| Family | Price ordering | Races | Winners T1 / T2 | P/L T1 / T2 | T2 less T1 P/L |
|---|---|---|---|---|---|
| All families | T1 shorter | 232 | 64 / 26 | −£65.18 / −£49.58 | +£15.60 |
| All families | T2 shorter | 138 | 15 / 54 | −£53.75 / +£31.46 | +£85.21 |
| All families | Equal | 10 | 2 / 3 | +£2.38 / +£1.12 | −£1.25 |
| Turf | T1 shorter | 4 | 1 / 0 | −£2.67 / −£4.00 | −£1.33 |
| Turf | T2 shorter | 3 | 0 / 0 | −£3.00 / −£3.00 | £0.00 |
| Turf | Equal | 1 | 0 / 1 | −£1.00 / +£1.62 | +£2.62 |
| AW | T1 shorter | 73 | 15 / 9 | −£30.20 / −£12.67 | +£17.53 |
| AW | T2 shorter | 43 | 4 / 18 | −£17.50 / +£14.66 | +£32.16 |
| AW | Equal | 5 | 2 / 1 | +£7.38 / +£0.50 | −£6.88 |
| Hurdle | T1 shorter | 103 | 31 / 11 | −£25.86 / −£25.92 | −£0.06 |
| Hurdle | T2 shorter | 60 | 6 / 26 | −£28.75 / +£10.68 | +£39.43 |
| Hurdle | Equal | 1 | 0 / 0 | −£1.00 / −£1.00 | £0.00 |
| Chase | T1 shorter | 52 | 17 / 6 | −£6.46 / −£7.00 | −£0.54 |
| Chase | T2 shorter | 32 | 5 / 10 | −£4.50 / +£9.12 | +£13.62 |
| Chase | Equal | 3 | 0 / 1 | −£3.00 / £0.00 | +£3.00 |


As a diagnostic benchmark, selecting the **whole-field SP favourite** on the same races was better than Tissue T1 for win capture. It was better on ROI overall, with exceptions by family. Ties use ascending runner ID to make the one-selection benchmark reproducible. The market is known at settlement time, so these are retrospective benchmarks. “Shorter of T1/T2” picks only within the frozen pair and uses T1 on equal SP.

| Family | Races | SP favourite wins | SP expected / A/E | SP favourite P/L / ROI | Shorter of T1/T2 wins | Shorter of T1/T2 P/L / ROI |
|---|---|---|---|---|---|---|
| All families | 380 | 133 | 127.65 / 1.04 | −£53.59 / −14.1% | 120 | −£31.34 / −8.2% |
| Turf | 8 | 3 | 2.08 / 1.44 | +£1.08 / 13.5% | 1 | −£6.67 / −83.3% |
| AW | 121 | 38 | 37.77 / 1.01 | −£23.46 / −19.4% | 35 | −£8.16 / −6.7% |
| Hurdle | 164 | 64 | 59.03 / 1.08 | −£13.77 / −8.4% | 57 | −£16.18 / −9.9% |
| Chase | 87 | 28 | 28.77 / 0.97 | −£17.44 / −20.1% | 27 | −£0.34 / −0.4% |


Across all 380 races the SP favourite picked 133 winners versus 81 for Tissue T1 and 83 for Tissue T2. Its −14.1% ROI was better than T1's −30.7% but below T2's −4.5%. In Chase the market favourite picked six more winners than T1 yet returned a lower ROI. Win capture and payout should be judged separately.

## 5. Calibration, ranking and robustness

**Ranking.** The final market separated the two horses better when it disagreed with the model. Market-shorter T2 supplied 85.6% of the combined T2 return advantage. A low number of T1 winners relative to both the model and market also occurred when the market favoured T1 in some families, especially AW. T2's collective win-count edge was two. AW supplied a seven-win T2 advantage, Hurdle and Turf tied, and Chase T1 led by five.

**Calibration.** On matched races, T1 averaged 23.8% model probability against 21.3% winners, a 2.5 percentage-point observed shortfall. T2 averaged 16.9% against 21.8%, a 5.0 pp surplus. The AW rank-specific pattern was strongest (model A/E 0.82 and 1.54), with Hurdle next (0.90 and 1.32). Chase (0.98 and 1.01) shows how profit separation can occur without obvious rank-level probability error. Final SP itself expected fewer T2 winners than observed (market A/E 1.22) and more T1 winners (0.87). The evidence is consistent with overconfidence in the T1/T2 separation in this sample. There is no independent probability calibration stage in the code to pin that on.

**Uncertainty.** A 10,000-draw paired bootstrap resampled whole racing dates (16 dates overall). It gave a descriptive 95% interval of **−8.3 to +58.8 percentage points** for T2 minus T1 ROI (+26.2 pp observed), and **−7.7 to +7.7 pp** for the difference in win rates (+0.5 pp observed). Observed-minus-model probability intervals were −6.0 to +1.7 pp for T1 and −0.2 to +9.8 pp for T2. Each interval includes zero. This was a short period with overlapping races and dates. Turf has only one date, so a day-resampled interval is unavailable.

The two largest T2 payouts were Rose Warrior (18/1, Uttoxeter, 14 November) and Leading Times (16/1, Southwell, 7 November). Removing those races from **both** ranks leaves ROI at −30.3% T1 and −13.5% T2. AW T2 falls to −18.9% after excluding its two largest T2 wins (versus −32.2% T1). Chase T2 falls to −24.6% versus −14.1% T1 after its corresponding two races are excluded. The pooled relative difference survives the two-race sensitivity. The small positive matched AW and Chase ROIs do not.


## 6. Frozen race examples

Examples cover a close T2 win, a large-gap T1 win, and a race where neither pick won in each of AW, Hurdle and Chase. Scores are the production dot products recomputed solely from the frozen vectors. Contributions show the three largest absolute terms, then the remainder. Figures below are rounded. Each race can be located by ID in the paired evidence.


### AW · Lingfield · 2026-11-19 12:53 UTC

| Rank | Horse | Base | Adjustment | Total score | Frozen p | Final SP | Frozen OR | Result |
|---|---|---|---|---|---|---|---|---|
| T1 | Grasshopper | 0.06621 | 0.17457 | 0.24078 | 17.32% | 5/1 | Missing | Lost (position 5) |
| T2 | Classic Bellini | 0.37168 | −0.13390 | 0.23778 | 17.27% | 11/8 | 64 | Won |

| Term | T1 stored input | T2 stored input | T1 minus T2 score |
|---|---|---|---|
| trainer_prior_rate | 16.2016 | 9.4103 | +0.37857 |
| speed_rank_missing | 1.0000 | 0.0000 | +0.30847 |
| official_rating | 0.0000 | 64.0000 | −0.29212 |
| All other terms | — | — | −0.39192 |
| Total | — | — | +0.00300 |


The missing-Speed bonus is what put Grasshopper first. Classic Bellini was ahead by 0.30547 before the generation adjustment, then lost the lead by 0.00300. The final market had Classic Bellini much shorter, and it won. Frozen race ID `841b660d-3ae4-4978-80cb-33135baea780`.


### AW · Lingfield · 2026-11-19 13:28 UTC

| Rank | Horse | Base | Adjustment | Total score | Frozen p | Final SP | Frozen OR | Result |
|---|---|---|---|---|---|---|---|---|
| T1 | Zooella | 2.08813 | −0.13390 | 1.95423 | 53.24% | 4/9 | 83 | Won |
| T2 | Moonlight Mirage | 0.63747 | 0.03421 | 0.67168 | 14.77% | 33/1 | 77 | Lost (position 5) |

| Term | T1 stored input | T2 stored input | T1 minus T2 score |
|---|---|---|---|
| trainer_prior_rate | 18.2312 | 8.5938 | +0.53723 |
| last_strongFinish | 1.0000 | 0.0000 | +0.29775 |
| last_led | 1.0000 | 0.0000 | +0.28369 |
| All other terms | — | — | +0.16388 |
| Total | — | — | +1.28255 |


Zooella led on trainer history and favourable comment flags. Moonlight Mirage received the Speed-rank 2–3 bonus, but this narrowed only part of the large base gap. Zooella won. Frozen race ID `efc964a5-f2ec-448f-a4dc-0f2faa2ae9fb`.


### AW · Southwell · 2026-11-07 14:05 UTC

| Rank | Horse | Base | Adjustment | Total score | Frozen p | Final SP | Frozen OR | Result |
|---|---|---|---|---|---|---|---|---|
| T1 | Burford Beauty | 1.34736 | 0.42380 | 1.77117 | 32.46% | 7/2 | 59 | Lost (position 8) |
| T2 | Union Island | 0.80864 | −0.13246 | 0.67618 | 10.86% | 16/1 | 59 | Lost (position 4) |

| Term | T1 stored input | T2 stored input | T1 minus T2 score |
|---|---|---|---|
| same_or_speed_gap | −1.6743 | −0.0043 | +0.55626 |
| trainer_prior_rate | 20.0873 | 11.8132 | +0.46123 |
| log_jockey_prior_runs | 8.2145 | 6.7845 | +0.19829 |
| All other terms | — | — | −0.12080 |
| Total | — | — | +1.09499 |


Burford Beauty ranked first partly because its lower Speed than equally rated peers earned a positive contribution under the negative same-OR coefficient. The higher trainer rate reinforced that lead. Both horses lost. Frozen race ID `05391a0b-1b6e-4aa0-ab4a-8294ec8d00fc`.


### Hurdle · Chepstow · 2026-11-20 12:22 UTC

| Rank | Horse | Base | Adjustment | Total score | Frozen p | Final SP | Frozen OR | Result |
|---|---|---|---|---|---|---|---|---|
| T1 | Hidden Mountain | 0.58332 | 0.04386 | 0.62718 | 15.85% | 11/8 | Missing | Lost (position 4) |
| T2 | Old Habits | 0.56683 | 0.05503 | 0.62186 | 15.76% | 6/5 | Missing | Won |

| Term | T1 stored input | T2 stored input | T1 minus T2 score |
|---|---|---|---|
| jockey_prior_rate | 15.9371 | 24.3080 | −0.26607 |
| trainer_prior_rate | 16.9591 | 23.5574 | −0.21964 |
| last_led | 1.0000 | 0.0000 | +0.21345 |
| All other terms | — | — | +0.27757 |
| Total | — | — | +0.00532 |


Hidden Mountain edged ahead through the comment block, despite lower trainer and jockey win percentages and a smaller generation adjustment. Old Habits was slightly shorter at SP and won. Neither horse had a frozen OR value. Frozen race ID `0c311963-5d0d-4e7c-9c98-8b8b32f4ed3c`.


### Hurdle · Thurles · 2026-11-12 14:03 UTC

| Rank | Horse | Base | Adjustment | Total score | Frozen p | Final SP | Frozen OR | Result |
|---|---|---|---|---|---|---|---|---|
| T1 | Gunnery Sergeant | 1.15131 | 0.05503 | 1.20635 | 46.35% | 5/6 | 102 | Won |
| T2 | Bayswater Bloom | −0.41192 | 0.04386 | −0.36806 | 9.60% | 12/1 | Missing | Lost (unseated_rider) |

| Term | T1 stored input | T2 stored input | T1 minus T2 score |
|---|---|---|---|
| jockey_prior_rate | 20.6383 | 7.2139 | +0.42670 |
| trainer_prior_rate | 14.7328 | 4.1096 | +0.35361 |
| log_trainer_prior_runs | 8.0596 | 4.3041 | +0.31384 |
| All other terms | — | — | +0.48025 |
| Total | — | — | +1.57441 |


Gunnery Sergeant had stronger connection priors and an observed OR of 102. Bayswater Bloom had missing OR. The value and missing-flag terms together favoured Gunnery Sergeant by 0.4662 before other terms. Gunnery Sergeant won. Frozen race ID `41c4d538-50b2-460e-b8ce-fd80ca2eccaf`.


### Hurdle · Plumpton · 2026-11-16 13:15 UTC

| Rank | Horse | Base | Adjustment | Total score | Frozen p | Final SP | Frozen OR | Result |
|---|---|---|---|---|---|---|---|---|
| T1 | Market House | 1.27108 | 0.05503 | 1.32611 | 35.12% | 10/3 | 98 | Lost (position 3) |
| T2 | Cadillac Ranch | −0.15627 | 0.04386 | −0.11241 | 8.33% | 5/1 | 99 | Lost (position 7) |

| Term | T1 stored input | T2 stored input | T1 minus T2 score |
|---|---|---|---|
| jockey_prior_rate | 24.4792 | 6.0606 | +0.58544 |
| trainer_prior_rate | 18.2927 | 11.9266 | +0.21191 |
| log_trainer_prior_runs | 7.9334 | 5.7930 | +0.17887 |
| All other terms | — | — | +0.46231 |
| Total | — | — | +1.43852 |


Market House had a much stronger jockey prior, plus trainer form and a “stayed on” flag. Cadillac Ranch had the slightly higher OR. The connection edge dominated the score, and both lost. Frozen race ID `7d9bac10-478f-48cb-9cce-d9ba685b4496`.


### Chase · Bangor-on-Dee · 2026-11-11 13:30 UTC

| Rank | Horse | Base | Adjustment | Total score | Frozen p | Final SP | Frozen OR | Result |
|---|---|---|---|---|---|---|---|---|
| T1 | Jupiter Allen | 0.56461 | 0.00000 | 0.56461 | 27.31% | 9/2 | 124 | Lost (position 3) |
| T2 | First Confession | 0.54258 | 0.00000 | 0.54258 | 26.72% | 7/4 | 131 | Won |

| Term | T1 stored input | T2 stored input | T1 minus T2 score |
|---|---|---|---|
| trainer_prior_rate | 25.9259 | 18.3036 | +0.14357 |
| days_since_run | 31.0000 | 245.0000 | +0.11066 |
| last3_weakened_count | 0.0000 | 1.0000 | +0.10230 |
| All other terms | — | — | −0.33450 |
| Total | — | — | +0.02203 |


Jupiter Allen narrowly led through stronger trainer priors, shorter absence and fewer weakening flags. First Confession had higher OR and a stronger jockey rate, and the market preferred it. First Confession won. Frozen race ID `bcb0d716-43e9-44aa-924a-6e51dc8b5a9a`.


### Chase · Clonmel · 2026-11-05 14:35 UTC

| Rank | Horse | Base | Adjustment | Total score | Frozen p | Final SP | Frozen OR | Result |
|---|---|---|---|---|---|---|---|---|
| T1 | A Snow White Park | 1.16469 | 0.00000 | 1.16469 | 62.21% | 8/11 | 122 | Won |
| T2 | Jolie Jewel | −0.32436 | 0.00000 | −0.32436 | 14.03% | 11/8 | 115 | Lost (position 3) |

| Term | T1 stored input | T2 stored input | T1 minus T2 score |
|---|---|---|---|
| last_stayedOn | 1.0000 | 0.0000 | +0.25922 |
| age | 5.0000 | 7.0000 | +0.22817 |
| best_l3_jump_speed | 131.4095 | 0.0000 | +0.15137 |
| All other terms | — | — | +0.85028 |
| Total | — | — | +1.48905 |


A Snow White Park had the positive “stayed on” flag, was two years younger and had a usable Best L3 Jump Speed of 131.41 versus a missing value for Jolie Jewel. The large gap came from the base model, and A Snow White Park won. Frozen race ID `3c62150a-87e3-45b3-852f-64a14f8fc48e`.


### Chase · Warwick · 2026-11-11 14:21 UTC

| Rank | Horse | Base | Adjustment | Total score | Frozen p | Final SP | Frozen OR | Result |
|---|---|---|---|---|---|---|---|---|
| T1 | Broadway Honey | 1.51339 | 0.00000 | 1.51339 | 51.50% | 15/8 | 105 | Lost (position 3) |
| T2 | Ignore The Door | 0.46691 | 0.00000 | 0.46691 | 18.09% | 10/3 | 108 | Lost (position 2) |

| Term | T1 stored input | T2 stored input | T1 minus T2 score |
|---|---|---|---|
| last_stayedOn | 1.0000 | 0.0000 | +0.25922 |
| last3_eased_count | 1.0000 | 0.0000 | +0.17529 |
| log_jockey_prior_runs | 7.3421 | 6.1399 | +0.14063 |
| All other terms | — | — | +0.47134 |
| Total | — | — | +1.04648 |


Broadway Honey led through the “stayed on” flag, recent comment terms and jockey history. Ignore The Door was rated three OR pounds higher and beat Broadway Honey home. Both lost. Frozen race ID `5c70ae9a-0abb-47fe-814e-05f5619aeddf`.


## 7. What the evidence supports

**Confirmed by replay.** All 4,117 stored runner probabilities and ranks reproduced across the 413 books, with a maximum probability discrepancy of 2.78 × 10⁻¹⁷. The largest unexplained score-gap residual after summing the term contributions was 2.87 × 10⁻¹⁵. The only differences are ordinary floating-point rounding. Softmax preserves score order, and none of these races lost its stored top ranks to ties or post-processing.

**Specific candidate for a further isolated experiment.** AW's missing-Speed bonus and negative same-OR coefficient are confirmed ranking mechanisms, with real reversals on both terms. The AW direct-reversal sample and the market-disagreement results justify a separately scoped, held-out attribution experiment focused on those terms. Their effects and overlap should be measured on identical fields by ranking capture and calibration, with SP returns as a secondary outcome. The mixed-code completion and overlapping recent-failure/PU terms in Hurdle are a smaller hypothesis. The Chase gap occurs with no generation adjustment at all and its rank-level probabilities are close to observed frequencies here.

**General T2 advantage.** The observed return gap is substantial and worth monitoring. It is concentrated in market disagreement and better payout prices, with fewer wins for T2 in Chase and uncertain paired intervals overall. There is insufficient evidence to promote T2, alter the calibration, or infer an enduring price advantage from this window.

**Safeguards.** The database transaction was read-only. The diagnostic used frozen pre-race vectors for attribution and terminal results for settlement and SP evaluation. It did not alter scoring formulas, select parameters, backfill predictions, or change the Research page, trainer collection, frozen models, ranks or settlement records.
