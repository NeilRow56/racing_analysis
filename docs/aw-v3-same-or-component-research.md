# AW V3 controlled component research

**Removing the signed term reduced the broad T1 loss in both years, but worsened T2 and the combined T1/T2 return in both.** The 403-race pre-off-anchored subset showed a smaller T2 loss after removal. Its result weakened after removing the two largest favourable switches. The frozen model is retained.

The two arms are **A · frozen AW V3** and **B · the same formula with the same-OR Speed coefficient set to zero**. No coefficients were re-estimated. The study uses original frozen vectors or the established AW feature pipeline, with one shared race field for both arms.

## 1. Component inventory

AW V3 adds a frozen 95-column AW V2 base logit and three contextual contributions. Each term has the form `weight × (input − fitted mean) / fitted scale`. The existing scorer sums all terms without clipping or a probability calibration step. It applies a race softmax, with the maximum logit subtracted for numerical stability. Tissue ranks descend by probability, with runner ID breaking exact ties. Race-wide constants cancel in the softmax. [Frozen parameters and exact input order](../data/research/tissue-generation-2026-11-aw.json) · [Generation scorer](../src/lib/racing/tissue-generation-model.ts) · [AW input builder](../src/lib/racing/aw-tissue-v2-features.ts)

| Base block | Inputs and treatment |
| --- | --- |
| Official rating, form and speed | Target official rating, latest/best/mean last-three AW performance, AW Speed and AW Today's Rating. The Speed columns retain their inherited `turf_speed` names but use AW values. Recent performance and Today's Rating incorporate earlier race outcomes via the existing AW ratings. Several columns describe overlapping runs, so their coefficient signs describe partial changes at fixed values of the other columns. |
| Trainer, jockey and experience | Prior win rates, log-transformed prior counts, days since last run, prior runs and age. Zero observed history and a missing numeric rating are represented according to their own input contracts. |
| Race and draw | Weight, class, furlongs, declared field size, draw, draw divided by declared field size and handicap. Class, distance, field size and handicap are usually shared across the race. Field size still affects the runner-specific draw fraction. |
| Surface | Log of one plus same-material starts in the prior 365 days, and the performance difference between same-material runs and usable AW runs among the five most recent eligible slots, multiplied by `n/(n+5)` for `n` usable same-material ratings. The latter is missing with no usable rated matching slot. |
| Missing numeric input | 26 paired flags. Missing values are encoded as zero in the raw numeric column and one in its flag. A missing feature therefore contributes through both the standardised zero and the standardised flag. A zero coefficient makes that slot inert. |
| Prior comments | 43 columns. Number of eligible prior comments, the latest comment's parsed flags and sums of those flags over the latest three eligible comments. With no eligible comments, the count and flag inputs are zero before standardisation. The latest comment can contribute both its flag and one count. |

The three contextual columns are calculated from the same AW Best L3 Speed evidence. Finite measured figures compete for Speed ranks, with tied values sharing a competition rank.

| Context input | When it changes the score |
| --- | --- |
| `speed_rank_2_3` | The binary indicator adds **0.168112** logit units when it switches from zero to one. An unavailable Speed rank cannot trigger it. |
| `speed_rank_missing` | The binary indicator adds **0.308468** logit units when it switches from zero to one. It can coexist with the AW V2 base Speed missingness terms. |
| `same_or_speed_gap` | With known official rating, measured Best L3 Speed and at least one other runner in the field with the same known official rating and usable Speed, the raw input is `(runner Speed − mean peer Speed)/10`. It is zero otherwise. A runner ten Speed points above its peers loses approximately **0.333090** score units relative to a zero gap. Ten points below its peers adds the same amount. Removal zeros the weight and leaves both binary adjustments and all AW V2 components intact. |

The same-OR term shares both inputs with base columns and changes when measured same-OR peers change. A known Speed can affect its numerical AW V2 score, the field Speed rank and the peer gap simultaneously. Within an official-rating group with usable Speed, the uncentred peer gaps sum to zero. The term redistributes logit scores within that group. There are no extra cross-products in the scorer. Missing OR or Speed disables the peer calculation. [Context calculations](../src/lib/racing/tissue-generation-features.ts) · [Prior formula diagnostics](aw-v3-isolated-adjustment-diagnostic.md)

<details>
<summary>All 98 contributions · signed slope and observed range</summary>

Slopes are logit units per raw input unit. Positive and negative signs show the local direction at fixed values of the other scored inputs. P05 and P95 are the empirical central range across 1,633 frozen AW V3 runner vectors. The observed minimum and maximum show effects on rarer flags. Values shown as zero are rounded at six decimal places.

| Frozen input | Logit slope | P05 | P95 | Observed min | Observed max |
| --- | --- | --- | --- | --- | --- |
| `official_rating` | 0.004564 | -0.239385 | 0.148584 | -0.239385 | 0.249000 |
| `latest_performance` | 0.003596 | -0.172731 | 0.109602 | -0.340872 | 0.189550 |
| `best_l3_performance` | 0.002362 | -0.110124 | 0.077165 | -0.211544 | 0.125254 |
| `avg_l3_performance` | 0.003603 | -0.154485 | 0.113672 | -0.309233 | 0.204657 |
| `latest_turf_speed` | 0.001271 | -0.099960 | 0.042363 | -0.109819 | 0.075467 |
| `best_l3_turf_speed` | 0.000977 | -0.072083 | 0.038893 | -0.072083 | 0.054628 |
| `avg_l3_turf_speed` | 0.001231 | -0.086524 | 0.046716 | -0.086524 | 0.073123 |
| `latest_todays_rating` | 0.000565 | -0.044397 | 0.020676 | -0.046063 | 0.037591 |
| `best_l3_todays_rating` | 0.000260 | -0.019255 | 0.011008 | -0.020021 | 0.016312 |
| `avg_l3_todays_rating` | 0.000629 | -0.044179 | 0.025333 | -0.046033 | 0.041795 |
| `trainer_prior_rate` | 0.055744 | -0.306814 | 0.414355 | -0.602425 | 1.123112 |
| `log_trainer_prior_runs` | 0.060675 | -0.078624 | 0.124367 | -0.363272 | 0.142350 |
| `jockey_prior_rate` | 0.041697 | -0.439181 | 0.242400 | -0.439181 | 0.679246 |
| `log_jockey_prior_runs` | 0.138662 | -0.447201 | 0.245818 | -0.862597 | 0.277413 |
| `days_since_run` | -0.000407 | -0.038353 | 0.016205 | -0.341679 | 0.016205 |
| `log_prior_runs` | 0.006113 | -0.012589 | 0.009806 | -0.012589 | 0.013021 |
| `age` | -0.049219 | -0.132946 | 0.113149 | -0.379040 | 0.113149 |
| `weight_lbs` | 0.030708 | -0.283401 | 0.238639 | -0.498359 | 0.760678 |
| `class` | 0.000000 | 0.000000 | 0.000000 | 0.000000 | 0.000000 |
| `distance_furlongs` | 0.000000 | 0.000000 | 0.000000 | 0.000000 | 0.000000 |
| `field_size` | 0.000000 | 0.000000 | 0.000000 | 0.000000 | 0.000000 |
| `draw` | -0.012892 | -0.093584 | 0.061116 | -0.145151 | 0.074007 |
| `draw_fraction` | 0.048548 | -0.024264 | 0.020238 | -0.028310 | 0.039658 |
| `handicap` | 0.000000 | 0.000000 | 0.000000 | 0.000000 | 0.000000 |
| `log_surface_runs_365d` | 0.062031 | -0.065119 | 0.071178 | -0.065119 | 0.126623 |
| `surface_recent_performance_delta` | 0.002202 | -0.001969 | 0.002000 | -0.010373 | 0.008818 |
| `official_rating_missing` | -0.159122 | -0.129637 | 0.029484 | -0.129637 | 0.029484 |
| `latest_performance_missing` | 0.130174 | -0.021590 | 0.108584 | -0.021590 | 0.108584 |
| `best_l3_performance_missing` | 0.099270 | -0.025159 | 0.074110 | -0.025159 | 0.074110 |
| `avg_l3_performance_missing` | 0.099270 | -0.025159 | 0.074110 | -0.025159 | 0.074110 |
| `latest_turf_speed_missing` | 0.130174 | -0.021590 | 0.108584 | -0.021590 | 0.108584 |
| `best_l3_turf_speed_missing` | 0.099270 | -0.025159 | 0.074110 | -0.025159 | 0.074110 |
| `avg_l3_turf_speed_missing` | 0.099270 | -0.025159 | 0.074110 | -0.025159 | 0.074110 |
| `latest_todays_rating_missing` | 0.130174 | -0.021590 | 0.108584 | -0.021590 | 0.108584 |
| `best_l3_todays_rating_missing` | 0.099270 | -0.025159 | 0.074110 | -0.025159 | 0.074110 |
| `avg_l3_todays_rating_missing` | 0.099270 | -0.025159 | 0.074110 | -0.025159 | 0.074110 |
| `trainer_prior_rate_missing` | -1.048845 | 0.000602 | 0.000602 | -1.048243 | 0.000602 |
| `log_trainer_prior_runs_missing` | 0.000000 | 0.000000 | 0.000000 | 0.000000 | 0.000000 |
| `jockey_prior_rate_missing` | 0.229914 | -0.000363 | -0.000363 | -0.000363 | 0.229551 |
| `log_jockey_prior_runs_missing` | 0.000000 | 0.000000 | 0.000000 | 0.000000 | 0.000000 |
| `days_since_run_missing` | -0.280542 | -0.263043 | 0.017499 | -0.263043 | 0.017499 |
| `log_prior_runs_missing` | 0.000000 | 0.000000 | 0.000000 | 0.000000 | 0.000000 |
| `age_missing` | 0.000000 | 0.000000 | 0.000000 | 0.000000 | 0.000000 |
| `weight_lbs_missing` | 0.000000 | 0.000000 | 0.000000 | 0.000000 | 0.000000 |
| `class_missing` | 0.000000 | 0.000000 | 0.000000 | 0.000000 | 0.000000 |
| `distance_furlongs_missing` | 0.000000 | 0.000000 | 0.000000 | 0.000000 | 0.000000 |
| `field_size_missing` | 0.000000 | 0.000000 | 0.000000 | 0.000000 | 0.000000 |
| `draw_missing` | 0.000000 | 0.000000 | 0.000000 | 0.000000 | 0.000000 |
| `draw_fraction_missing` | 0.000000 | 0.000000 | 0.000000 | 0.000000 | 0.000000 |
| `handicap_missing` | 0.000000 | 0.000000 | 0.000000 | 0.000000 | 0.000000 |
| `log_surface_runs_365d_missing` | 0.000000 | 0.000000 | 0.000000 | 0.000000 | 0.000000 |
| `surface_recent_performance_delta_missing` | 0.089374 | -0.024520 | 0.064854 | -0.024520 | 0.064854 |
| `prior_comment_count` | 0.010513 | -0.027461 | 0.004078 | -0.027461 | 0.004078 |
| `last_slowlyAway` | -0.044859 | -0.040576 | 0.004283 | -0.040576 | 0.004283 |
| `last_awkwardStart` | -0.173634 | 0.001619 | 0.001619 | -0.172015 | 0.001619 |
| `last_prominent` | 0.053618 | -0.003821 | 0.049797 | -0.003821 | 0.049797 |
| `last_led` | 0.283687 | -0.055598 | 0.228089 | -0.055598 | 0.228089 |
| `last_heldUpRear` | -0.027936 | -0.019436 | 0.008500 | -0.019436 | 0.008500 |
| `last_racedFreely` | 0.091175 | -0.005239 | -0.005239 | -0.005239 | 0.085936 |
| `last_hampered` | -0.207476 | 0.003401 | 0.003401 | -0.204075 | 0.003401 |
| `last_bumped` | 0.007713 | -0.000074 | -0.000074 | -0.000074 | 0.007639 |
| `last_checked` | -0.671689 | 0.000626 | 0.000626 | -0.671063 | 0.000626 |
| `last_deniedRoom` | -1.384892 | 0.000099 | 0.000099 | 0.000099 | 0.000099 |
| `last_shortRoom` | -0.081111 | 0.002071 | 0.002071 | -0.079039 | 0.002071 |
| `last_switched` | 0.078206 | -0.005417 | -0.005417 | -0.005417 | 0.072790 |
| `last_racedWide` | 0.490631 | -0.005526 | -0.005526 | -0.005526 | 0.485105 |
| `last_stayedOn` | 0.223890 | -0.016470 | 0.207419 | -0.016470 | 0.207419 |
| `last_strongFinish` | 0.297752 | -0.003652 | -0.003652 | -0.003652 | 0.294099 |
| `last_weakened` | -0.295103 | -0.235310 | 0.059793 | -0.235310 | 0.059793 |
| `last_faded` | -0.509446 | 0.009337 | 0.009337 | -0.500108 | 0.009337 |
| `last_eased` | 0.130713 | -0.001711 | -0.001711 | -0.001711 | 0.129002 |
| `last_neverDangerous` | -0.133083 | 0.005919 | 0.005919 | -0.127164 | 0.005919 |
| `last_lostTouch` | -0.523966 | 0.001861 | 0.001861 | -0.522105 | 0.001861 |
| `last_equipment` | -0.088985 | -0.087025 | 0.001960 | -0.087025 | 0.001960 |
| `last3_slowlyAway_count` | -0.028299 | -0.020816 | 0.007483 | -0.077414 | 0.007483 |
| `last3_awkwardStart_count` | 0.039571 | -0.001084 | -0.001084 | -0.001084 | 0.078058 |
| `last3_prominent_count` | 0.046523 | -0.009024 | 0.037498 | -0.009024 | 0.130543 |
| `last3_led_count` | 0.020598 | -0.011240 | 0.029957 | -0.011240 | 0.050555 |
| `last3_heldUpRear_count` | -0.024409 | -0.027929 | 0.020890 | -0.052339 | 0.020890 |
| `last3_racedFreely_count` | 0.061803 | -0.009612 | 0.052191 | -0.009612 | 0.175797 |
| `last3_hampered_count` | 0.029229 | -0.001341 | -0.001341 | -0.001341 | 0.027889 |
| `last3_bumped_count` | -0.035845 | 0.000963 | 0.000963 | -0.034882 | 0.000963 |
| `last3_checked_count` | -0.187259 | 0.000450 | 0.000450 | -0.186809 | 0.000450 |
| `last3_deniedRoom_count` | -1.639740 | 0.000235 | 0.000235 | 0.000235 | 0.000235 |
| `last3_shortRoom_count` | 0.118162 | -0.008489 | 0.109673 | -0.008489 | 0.109673 |
| `last3_switched_count` | -0.009583 | -0.007717 | 0.001866 | -0.017300 | 0.001866 |
| `last3_racedWide_count` | -0.104518 | 0.003483 | 0.003483 | -0.101035 | 0.003483 |
| `last3_stayedOn_count` | 0.089676 | -0.019328 | 0.070348 | -0.019328 | 0.160024 |
| `last3_strongFinish_count` | -0.128429 | -0.123795 | 0.004634 | -0.252223 | 0.004634 |
| `last3_weakened_count` | -0.167310 | -0.241135 | 0.093485 | -0.408445 | 0.093485 |
| `last3_faded_count` | 0.004609 | -0.000216 | -0.000216 | -0.000216 | 0.009001 |
| `last3_eased_count` | -0.016925 | 0.000606 | 0.000606 | -0.016320 | 0.000606 |
| `last3_neverDangerous_count` | -0.049906 | -0.043693 | 0.006213 | -0.093599 | 0.006213 |
| `last3_lostTouch_count` | -0.491063 | 0.003822 | 0.003822 | -0.978304 | 0.003822 |
| `last3_equipment_count` | -0.039628 | -0.077082 | 0.002175 | -0.116710 | 0.002175 |
| `speed_rank_2_3` | 0.168112 | -0.031212 | 0.136900 | -0.031212 | 0.136900 |
| `speed_rank_missing` | 0.308468 | -0.102691 | 0.205777 | -0.102691 | 0.205777 |
| `same_or_speed_gap` | -0.333090 | -0.324288 | 0.308659 | -2.061941 | 2.213806 |

</details>

## 2. Frozen reproduction and matched coverage

The production scorer reproduced all **142 AW V3 books** and **1,633 runner ranks** exactly, with no probability, rank or adjustment-input mismatch. A separate pass reproduced the frozen AW V2 probabilities and archived rank semantics on **190 books** (maximum absolute probability error 2.78e-17). The historical rerun matched both old experiment arms’ T1/T2 identities on **4,975** fields, with maximum probability difference 2.22e-16.


| Year | AW database races | Verified final-SP books | Historical vectors | Card reconstruction | V2 pre-off archive | V3 pre-off frozen | Matched total |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2025 | 3,106 | 3,102 | 3,028 | 0 | 0 | 0 | 3,028 |
| 2026 | 2,591 | 2,550 | 1,947 | 132 | 150 | 121 | 2,350 |



| Year | Unreconciled final field | No eligible vectors | Later NR among the four picks | Roster conflict |
| --- | --- | --- | --- | --- |
| 2025 | 4 | 74 | 0 | 0 |
| 2026 | 41 | 181 | 19 | 0 |


Each race appears once. Input priority is original AW V3 capture, original AW V2 capture, verified archived-card reconstruction, then saved historical vectors. Neither arm feeds final SP, the target finish or the winner label into the scorer. Earlier starter-roster and declaration-count limitations are documented below. The equal-stake table requires both variants’ T1 and T2 to be priced starters. A later withdrawal has no stake and does not promote another runner. Its race stays out of the equal-stake comparison when any of the four picks is withdrawn. The captured scoring field otherwise stays intact even if a lower-ranked runner withdraws. All £1 win returns use uncapped final SP and canonical settlement v3 with dead-heat deductions to gross return.


### Which populations are auditable pre-off?

- **Historical vectors, 2025 and January–21 September 2026.** The earlier audit retained all 52 AW V2 numeric slots and the full frozen-base probabilities. The three AW V3 context inputs can be computed from those numeric slots. Since `log(base probability)` differs from the AW V2 logit by a constant within a field, it preserves the exact relative base score, including the comment contribution, without inventing missing raw comments. The inputs and forecasts passed their original SHA-256 pins. The 2025 period was used to fit the AW V2 base.
- **Historical limitation.** The earlier fields are actual-starter fields and their original publication timestamps are unverified. Where terminal records include withdrawals, the cached declaration count equals the final starter count in 1,316 of 1,316 such 2025 fields and 772 of 772 such early-2026 fields. This can influence draw fraction and the Speed peer group. Those annual figures are retrospective, conditional on the saved fields. The no-recorded-NR slice removes the known withdrawal cases, with publication timing still unverified. No comparable 2025 timestamped source was available for the remaining 74 otherwise reconciled fields.
- **Archived-card reconstruction, 28 September–19 October 2026.** The read-only lookup started with 225 otherwise verified fields lacking reusable vectors and a recorded pre-off card time. It verified race, ride and horse IDs, card state and timestamp, roster count and relevant stable target metadata. Last-known trainer/jockey identities and weight had to match the archived declarations and the target metadata used by the loaders. It used the existing AW capture-context builder and the frozen AW V2 vector builder. Horse form, comments, participant rates and surface history were cut off at local midnight before race-day events. Rejections included 77 incomplete cards or changed target metadata and 14 unverifiable declarations. Archival publication times for earlier days, and later revisions to prior results, remain unverified.
- **Original pre-off archives.** AW V2 captures supply the full original 95-column base field, to which the AW V3 adjustment block is applied. AW V3 captures supply the original field and adjustment inputs. The final-SP snapshot ends on 20 November 2026. Later or unresolved races cannot contribute returns. Distinct late periods and source types are shown separately below. [Historical source audit](racing-2025-2026-data-market-trainer-audit.md) · [Final-SP source inventory](full-history-profitability-inventory-v1.json) · [Frozen archive replay](aw-v3-reversed-speed-adjustment.md)

## 3. Final-SP results

One stake per race for each rank and variant. The price and sensitivity breakdowns retain all valid winners in the primary figures.


| Year | Rank | Races / stakes per arm | A wins | A strike | A P/L | A ROI | B wins | B strike | B P/L | B ROI | B − A P/L |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2025 | T1 | 3,028 | 743 | 24.54% | −£321.45 | -10.62% | 756 | 24.97% | −£275.88 | -9.11% | +£45.57 |
| 2025 | T2 | 3,028 | 514 | 16.97% | −£642.32 | -21.21% | 531 | 17.54% | −£758.41 | -25.05% | −£116.09 |
| 2026 | T1 | 2,350 | 579 | 24.64% | −£349.00 | -14.85% | 609 | 25.91% | −£304.68 | -12.96% | +£44.33 |
| 2026 | T2 | 2,350 | 406 | 17.28% | −£440.24 | -18.73% | 402 | 17.11% | −£551.15 | -23.45% | −£110.91 |


<details>
<summary>Results by evidence source</summary>


| Year | Inputs | Races | Rank | A wins | A P/L | A ROI | B wins | B P/L | B ROI | B − A P/L |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2025 | Historical vectors | 3,028 | T1 | 743 | −£321.45 | -10.62% | 756 | −£275.88 | -9.11% | +£45.57 |
| 2025 | Historical vectors | 3,028 | T2 | 514 | −£642.32 | -21.21% | 531 | −£758.41 | -25.05% | −£116.09 |
| 2025 | Historical vectors, no recorded NR | 1,712 | T1 | 441 | −£139.72 | -8.16% | 454 | −£107.21 | -6.26% | +£32.51 |
| 2025 | Historical vectors, no recorded NR | 1,712 | T2 | 292 | −£353.12 | -20.63% | 300 | −£388.98 | -22.72% | −£35.86 |
| 2026 | Historical vectors | 1,947 | T1 | 497 | −£272.31 | -13.99% | 516 | −£265.16 | -13.62% | +£7.15 |
| 2026 | Historical vectors | 1,947 | T2 | 325 | −£392.16 | -20.14% | 318 | −£532.96 | -27.37% | −£140.80 |
| 2026 | Card rebuild | 132 | T1 | 34 | +£18.90 | 14.32% | 38 | +£34.60 | 26.21% | +£15.70 |
| 2026 | Card rebuild | 132 | T2 | 25 | −£18.85 | -14.28% | 24 | −£19.05 | -14.43% | −£0.20 |
| 2026 | V2 archive | 150 | T1 | 27 | −£55.28 | -36.85% | 33 | −£29.67 | -19.78% | +£25.60 |
| 2026 | V2 archive | 150 | T2 | 28 | −£31.72 | -21.15% | 31 | −£13.01 | -8.67% | +£18.71 |
| 2026 | V3 frozen | 121 | T1 | 21 | −£40.32 | -33.32% | 22 | −£44.45 | -36.73% | −£4.13 |
| 2026 | V3 frozen | 121 | T2 | 28 | +£2.49 | 2.06% | 29 | +£13.87 | 11.46% | +£11.38 |
| 2026 | Historical vectors, no recorded NR | 1,175 | T1 | 304 | −£126.24 | -10.74% | 317 | −£88.80 | -7.56% | +£37.44 |
| 2026 | Historical vectors, no recorded NR | 1,175 | T2 | 186 | −£292.19 | -24.87% | 189 | −£336.02 | -28.60% | −£43.82 |
| 2026 | All pre-off sources | 403 | T1 | 82 | −£76.70 | -19.03% | 93 | −£39.52 | -9.81% | +£37.17 |
| 2026 | All pre-off sources | 403 | T2 | 81 | −£48.08 | -11.93% | 84 | −£18.19 | -4.51% | +£29.89 |


</details>

## 4. Selections and winning ranks


| Year | Rank | Changed horses | Winners gained | Winners lost | Both replacements won | B − A P/L |
| --- | --- | --- | --- | --- | --- | --- |
| 2025 | T1 | 483 | 87 | 74 | 0 | +£45.57 |
| 2025 | T2 | 814 | 127 | 110 | 0 | −£116.09 |
| 2026 | T1 | 375 | 78 | 48 | 0 | +£44.33 |
| 2026 | T2 | 606 | 84 | 88 | 0 | −£110.91 |


A gained winner means the new pick won and the old pick lost. A lost winner is the reverse. When both picks won a dead heat, the switch counts as a changed selection but contributes neither a gain nor a loss to the win count. Winner moves below track the same winning horse across ranks.


| Year | Winner T1 → T2 | Winner T2 → T1 | Winners entering top two | Winners leaving top two | Net top-two winner tickets |
| --- | --- | --- | --- | --- | --- |
| 2025 | 54 | 50 | 110 | 80 | 30 |
| 2026 | 30 | 40 | 92 | 66 | 26 |


The largest favourable and adverse changes below are ranked by the change in settled £1 profit, with no odds or winner discarded.


| Year | Rank | Change | Race | Original → Removed | £1 difference |
| --- | --- | --- | --- | --- | --- |
| 2025 | T1 | Largest gain | 2025-11-19 Dundalk | Kitty Bear (9/1) → Nibras Rainbow (16/1) **W** | +£17.00 |
| 2025 | T1 | Largest loss | 2025-04-04 Southwell | Thunderous Love (20/1) **W** → Port Hedland (4/1) | −£21.00 |
| 2025 | T2 | Largest gain | 2025-04-18 Lingfield | Sun Dancer Girl (22/1) → Obsidian Knight (20/1) **W** | +£21.00 |
| 2025 | T2 | Largest loss | 2025-12-10 Kempton | Up The Anti (50/1) **W** → Guiteau (18/1) | −£51.00 |
| 2026 | T1 | Largest gain | 2026-08-12 Kempton | Bridget's View (25/1) → Racingbreaks Ryder (16/1) **W** | +£17.00 |
| 2026 | T1 | Largest loss | 2026-05-26 Dundalk | Grey Fable (22/1) **W** → Copper Craft (6/5) | −£23.00 |
| 2026 | T2 | Largest gain | 2026-10-24 Southwell | Spirit Of Nature (9/2) → Clipsham Noble (16/1) **W** | +£17.00 |
| 2026 | T2 | Largest loss | 2026-01-28 Dundalk | Thaloria (40/1) **W** → Ballymagreehan (4/1) | −£41.00 |


## 5. SP distribution and winner sensitivity

The averages and medians use final decimal SP for all picks. The separate sensitivity columns remove each variant’s own largest net winning returns. The paired sensitivity removes the one or two most favourable changed races from both arms and tests the size of the incremental result.


| Year | Rank | A mean / median SP | B mean / median SP | A P/L excl. largest / two | B P/L excl. largest / two | B − A after excl. largest favourable / two |
| --- | --- | --- | --- | --- | --- | --- |
| 2025 | T1 | 6.81 / 4.50 | 6.04 / 4.33 | −£346.45 / −£368.45 | −£300.88 / −£322.88 | +£28.57 / +£13.57 |
| 2025 | T2 | 9.46 / 6.00 | 8.53 / 5.50 | −£692.32 / −£725.32 | −£780.41 / −£800.41 | −£137.09 / −£152.09 |
| 2026 | T1 | 6.60 / 4.33 | 5.78 / 4.00 | −£371.00 / −£385.00 | −£320.68 / −£334.68 | +£27.33 / +£14.33 |
| 2026 | T2 | 9.27 / 5.50 | 8.56 / 5.50 | −£480.24 / −£505.24 | −£567.15 / −£583.15 | −£127.91 / −£142.91 |


<details>
<summary>Final-SP bands · stakes / winners / £1 P/L / ROI</summary>


| Year | Rank | Final SP | A | B |
| --- | --- | --- | --- | --- |
| 2025 | T1 | Under 8/1 | 2,438 / 708 / −£169.45 / -6.95% | 2,539 / 721 / −£219.38 / -8.64% |
| 2025 | T1 | 8/1 to under 12/1 | 250 / 24 / −£10.00 / -4.00% | 225 / 24 / +£15.50 / 6.89% |
| 2025 | T1 | 12/1 to under 20/1 | 202 / 7 / −£97.00 / -48.02% | 184 / 8 / −£64.00 / -34.78% |
| 2025 | T1 | 20/1 and above | 138 / 4 / −£45.00 / -32.61% | 80 / 3 / −£8.00 / -10.00% |
| 2025 | T2 | Under 8/1 | 2,099 / 471 / −£320.82 / -15.28% | 2,185 / 497 / −£353.91 / -16.20% |
| 2025 | T2 | 8/1 to under 12/1 | 384 / 25 / −£129.50 / -33.72% | 385 / 20 / −£178.50 / -46.36% |
| 2025 | T2 | 12/1 to under 20/1 | 291 / 13 / −£88.00 / -30.24% | 258 / 10 / −£112.00 / -43.41% |
| 2025 | T2 | 20/1 and above | 254 / 5 / −£104.00 / -40.94% | 200 / 4 / −£114.00 / -57.00% |
| 2026 | T1 | Under 8/1 | 1,918 / 560 / −£142.50 / -7.43% | 1,997 / 592 / −£154.18 / -7.72% |
| 2026 | T1 | 8/1 to under 12/1 | 197 / 13 / −£63.50 / -32.23% | 169 / 10 / −£65.50 / -38.76% |
| 2026 | T1 | 12/1 to under 20/1 | 136 / 5 / −£67.00 / -49.26% | 124 / 7 / −£25.00 / -20.16% |
| 2026 | T1 | 20/1 and above | 99 / 1 / −£76.00 / -76.77% | 60 / 0 / −£60.00 / -100.00% |
| 2026 | T2 | Under 8/1 | 1,644 / 365 / −£269.24 / -16.38% | 1,714 / 368 / −£310.65 / -18.12% |
| 2026 | T2 | 8/1 to under 12/1 | 286 / 22 / −£59.00 / -20.63% | 290 / 23 / −£53.50 / -18.45% |
| 2026 | T2 | 12/1 to under 20/1 | 229 / 17 / +£12.00 / 5.24% | 200 / 11 / −£41.00 / -20.50% |
| 2026 | T2 | 20/1 and above | 191 / 2 / −£124.00 / -64.92% | 146 / 0 / −£146.00 / -100.00% |


</details>

## 6. Monthly results

Each cell shows wins / £1 P/L / ROI. The same race count applies to each of the four rank-policy series.


| Month | Races | A T1 | B T1 | A T2 | B T2 |
| --- | --- | --- | --- | --- | --- |
| 2025-01 | 397 | 104 / +£14.68 / 3.70% | 102 / −£9.85 / -2.48% | 68 / −£121.36 / -30.57% | 80 / −£57.34 / -14.44% |
| 2025-02 | 316 | 81 / −£30.43 / -9.63% | 86 / +£10.18 / 3.22% | 58 / −£42.09 / -13.32% | 57 / −£65.90 / -20.86% |
| 2025-03 | 337 | 88 / −£36.86 / -10.94% | 86 / −£32.75 / -9.72% | 63 / −£62.91 / -18.67% | 67 / −£92.53 / -27.46% |
| 2025-04 | 220 | 57 / +£19.34 / 8.79% | 56 / −£9.50 / -4.32% | 30 / −£78.91 / -35.87% | 35 / −£49.08 / -22.31% |
| 2025-05 | 120 | 32 / +£3.90 / 3.25% | 29 / +£2.01 / 1.68% | 26 / +£11.44 / 9.53% | 23 / −£2.05 / -1.71% |
| 2025-06 | 123 | 36 / −£27.28 / -22.18% | 38 / −£13.92 / -11.32% | 23 / −£13.24 / -10.76% | 24 / −£17.61 / -14.32% |
| 2025-07 | 63 | 8 / −£32.18 / -51.07% | 9 / −£27.18 / -43.14% | 13 / −£14.98 / -23.77% | 12 / −£19.98 / -31.71% |
| 2025-08 | 170 | 41 / −£10.70 / -6.29% | 41 / −£1.12 / -0.66% | 32 / +£5.64 / 3.32% | 30 / −£23.27 / -13.69% |
| 2025-09 | 271 | 61 / −£40.21 / -14.84% | 58 / −£64.71 / -23.88% | 44 / −£99.71 / -36.79% | 46 / −£92.13 / -34.00% |
| 2025-10 | 339 | 81 / −£60.34 / -17.80% | 86 / −£47.41 / -13.99% | 48 / −£93.61 / -27.61% | 48 / −£103.78 / -30.61% |
| 2025-11 | 320 | 65 / −£89.22 / -27.88% | 72 / −£52.86 / -16.52% | 50 / −£92.49 / -28.90% | 54 / −£99.42 / -31.07% |
| 2025-12 | 352 | 89 / −£32.15 / -9.13% | 93 / −£28.78 / -8.18% | 59 / −£40.10 / -11.39% | 55 / −£135.31 / -38.44% |
| 2026-01 | 400 | 104 / −£11.68 / -2.92% | 114 / +£17.82 / 4.45% | 56 / −£102.80 / -25.70% | 57 / −£173.44 / -43.36% |
| 2026-02 | 322 | 66 / −£101.21 / -31.43% | 75 / −£63.71 / -19.78% | 61 / −£55.91 / -17.36% | 55 / −£82.98 / -25.77% |
| 2026-03 | 342 | 88 / −£24.68 / -7.22% | 87 / −£54.53 / -15.95% | 60 / −£62.29 / -18.21% | 59 / −£77.01 / -22.52% |
| 2026-04 | 242 | 67 / −£41.41 / -17.11% | 66 / −£52.02 / -21.50% | 39 / −£57.30 / -23.68% | 37 / −£88.56 / -36.60% |
| 2026-05 | 103 | 26 / −£6.94 / -6.73% | 28 / −£23.33 / -22.65% | 19 / −£33.32 / -32.35% | 18 / −£35.17 / -34.15% |
| 2026-06 | 87 | 18 / −£19.29 / -22.17% | 17 / −£26.29 / -30.22% | 10 / −£34.74 / -39.93% | 15 / −£4.74 / -5.45% |
| 2026-07 | 119 | 22 / −£59.18 / -49.73% | 21 / −£63.18 / -53.09% | 20 / −£11.18 / -9.39% | 21 / −£1.93 / -1.62% |
| 2026-08 | 160 | 50 / −£3.85 / -2.41% | 52 / +£16.39 / 10.24% | 29 / +£9.64 / 6.02% | 27 / −£17.99 / -11.24% |
| 2026-09 | 193 | 64 / +£10.13 / 5.25% | 65 / +£1.40 / 0.73% | 35 / −£43.30 / -22.44% | 33 / −£50.17 / -26.00% |
| 2026-10 | 226 | 45 / −£50.69 / -22.43% | 53 / −£14.62 / -6.47% | 46 / −£24.13 / -10.68% | 45 / −£16.20 / -7.17% |
| 2026-11 | 156 | 29 / −£40.21 / -25.77% | 31 / −£42.61 / -27.31% | 31 / −£24.91 / -15.97% | 35 / −£2.95 / -1.89% |

## 7. Interpretation

- **Rank 1 returns improved in the two broad replays.** Removal reduced the loss by £45.57 in 2025 and £44.33 in 2026. The Rank 1 policy remained loss-making in both years.
- **Rank 2 profitability deteriorated over both broad years.** The incremental P/L was −£116.09 in 2025 and −£110.91 in 2026. The 17 additional 2025 T2 winners paid too little to offset the winners lost and the changes in price mix. Counting both ranks, the removal lost an extra £70.52 in 2025 and £66.59 in 2026.
- **The earlier archive limitation is material to interpretation.** In the historical slice with no recorded withdrawals, removing the term changed T2 P/L by −£35.86 in 2025 and −£43.82 in early 2026. The timing of those older feature publications remains unverified. On the 403 fields anchored to original pre-off archives, T2 improved by +£29.89 to −£18.19 (-4.51%). Removing the two most favourable changed races from both arms leaves an incremental +£3.39. 79 of these fields were used in AW V3 adjustment development.
- **Winners also entered and left the top two.** Removal changed the identities that both ranks caught, alongside transfers between T1 and T2. The 20/1-plus rows show where changing those identities reduced the value of the longer-priced selections.

**Decision.** Keep frozen AW V3. The negative broad T2 results and the inconsistent result by evidence source give insufficient support for a permanent change. The narrower pre-off improvement describes a tested historical subset with development overlap. It does not establish prospective profitability.

Validation reproduced the original frozen scorer and the previous historical ranks, reconciled the canonical settlement population, and passed 29 targeted AW and settlement tests and focused TypeScript checks. Frozen model and capture-ledger hashes matched their initial values. No production, model, settlement or collection file changed.
