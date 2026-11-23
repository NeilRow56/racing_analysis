# Why long-priced horses reach Tissue T1 or T2

## Party Vibes · Warwick, 14:12 on 19 November 2026

**Party Vibes was the original Hurdle V2 T2 at 14.1681%.** She won at **8/1**, sixth in the final-SP market. Three pre-race Chase Speed figures, a favourable balance of comment terms against the horse immediately below her, and one extra completion in the last three gave her the edge over Easy To Follow. Her score lead over T3 was only **0.009849**, equivalent to **0.139 percentage points** in the frozen book. The completion-fraction term tipped that particular comparison. [Sporting Life result](https://www.sportinglife.com/racing/results/2026-11-19/warwick/949228/omoda-and-jaecoo-race-to-victory-mares-handicap-hurdle)

| Frozen identity | Value |
| --- | --- |
| Race | Omoda And Jaecoo Race To Victory Mares' Handicap Hurdle, Sporting Life **949228** |
| Race ID | `09d7fdf7-197a-4abc-9b75-88df57e18212` |
| Party Vibes runner / horse IDs | `2cde74aa-3b58-42ab-ab4b-a1263dc7107d` / `15f570cc-c440-4f01-8102-39b2537215c4` |
| Sporting Life ride | `260245418` |
| Trainer / jockey | Henry Daly / Sam Twiston-Davies |
| Historical feature cutoff | `2026-11-19T08:04:35.793Z` |
| Capture / scheduled off | `2026-11-19T08:04:54.846Z` / `2026-11-19T14:12:00.000Z` |
| Model / model checksum | `HURDLE_TISSUE_V2` / `53defc50d717aba63c80c9f3c01c4df4360b709f6f4a21509a514179e23cce90` |
| Frozen result timestamp | `2026-11-19T16:01:39.399Z` |
| Capture market | Median decimal **11.00**. Full-book normalized probability **7.7435%**. |
| Terminal market | Decimal **9.00**. Raw implied probability **11.1111%**, SP book **118.3905%**, normalized probability **9.3851%**. |

The table below retains the original ranks and probabilities from the nine-runner pre-off book. Scores are recalculated from its saved vectors and checksum-matched model. Final SP and result come from the separately reconciled terminal rides. Shared SPs share a market rank. [Frozen race ledger](../data/research/tissue-generation-forward-2026-11.json) · [Hurdle V2 model](../data/research/tissue-generation-2026-11-hurdle.json) · [Sporting Life racecard](https://www.sportinglife.com/racing/racecards/2026-11-19/warwick/racecard/949228/victory-mares-handicap-hurdle)

| Tissue rank | Horse | Runner ID | Base | Adjustment | Score | Frozen p | Final SP | SP rank | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | Miss Cynthia | df303528-fb52-427b-b1ea-752a6f6cd13b | 0.930753 | +0.043859 | 0.974611 | 17.3836% | 9/1 | 7 | 6 |
| T2 | Party Vibes | 2cde74aa-3b58-42ab-ab4b-a1263dc7107d | 0.726221 | +0.043859 | 0.770080 | 14.1681% | 8/1 | 6 | 1 |
| T3 | Easy To Follow | 7a5e32b3-82e9-4e15-aa23-785075b5e925 | 0.756063 | +0.004168 | 0.760231 | 14.0293% | 7/1 | 4 | 5 |
| T4 | Betty's Daisy | 2afe2524-ba4e-4a1f-b8b7-cd1d421e65d5 | 0.637637 | +0.004168 | 0.641805 | 12.4625% | 12/1 | 8 | 2 |
| T5 | Analiese | 21a2c68b-2908-4e32-8110-cce17b283571 | 0.586876 | +0.043859 | 0.630735 | 12.3253% | 7/2 | 1 | 3 |
| T6 | Crystal Spring | 2f185fc1-f384-430f-a432-64f8b2d655c9 | 0.338987 | +0.043859 | 0.382846 | 9.6192% | 9/2 | 3 | 4 |
| T7 | I Spy A Diva | f23d486a-88c2-4744-b354-ad8d07f71d14 | 0.104688 | +0.055035 | 0.159723 | 7.6955% | 7/1 | 4 | pulled_up |
| T8 | Strong Run | 70aeb057-5411-48cb-8034-bd132129b77c | 0.353555 | −0.277708 | 0.075848 | 7.0764% | 7/2 | 1 | pulled_up |
| T9 | Shallow Bowles | 1b79029c-af97-42f4-904b-8e71398375cf | -0.268420 | +0.043859 | -0.224561 | 5.2402% | 50/1 | 9 | pulled_up |

### Exact Hurdle V2 calculation

The capture code attaches history bounded by the pre-race feature cutoff, excludes horses already declared non-runners, builds the 79-column Jump base vector and adds six family columns. It computes the race softmax over all nine runners before reading market quotes. The base has 18 numeric fields, 18 matching missing flags and 43 comment fields. The model applies both blocks with their saved weights, means and scales.

```text
z[j] = (frozen input[j] − fitted mean[j]) / fitted scale[j]
contribution[j] = fitted weight[j] × z[j]
score = sum(base contributions) + sum(generation contributions)
p = exp(score − highest field score) / sum(exp(each field score − highest field score))
```

Party Vibes scored **0.7262214543125736 + 0.0438586878065272 = 0.7700801421191008**. The maximum was Miss Cynthia's **0.9746114209185489**. Party Vibes' numerator was **0.8150292483824028** and the field denominator **5.752550581727784**, yielding **0.14168137016843196**. Hurdle ranks descending by probability with ascending runner ID as the exact-tie rule. Turf uses competition ranks. [Capture wiring](../src/lib/racing/tissue-generation-sync.ts) · [Hurdle input mapping](../src/lib/racing/jump-tissue-model.ts) · [Score and softmax](../scripts/diagnose-independent-tissue-feasibility.ts) · [Production scorer](../src/lib/racing/tissue-generation-model.ts)

The numeric inputs include racecard OR, three canonical Jump Speed summaries, connection win percentages and log counts, days since run, log horse starts, age, pounds, class, distance in furlongs, declared field size, handicap and two going flags. Warwick supplied class 3, 4,625 yards ÷ 220, nine declarations, handicap = 1, soft/heavy = 1 and firm = 0. Those race terms are identical for all nine and cancel in rank comparisons. The going vector records two text tests. The exact going wording in the source record was *Soft (Good to Soft in places)*. Hurdle V2 has no standalone distance-fit, going-fit, recent-improvement or “lower hurdles mark than chase mark” input. The count named `log_prior_jump_starts` uses all eligible timed horse runs. Days since run is floored from elapsed days. Connection rates are 100 × prior wins ÷ prior runs, and counts use `log1p`. [Input loader](../src/lib/racing/tissue-value-sync.ts) · [Horse metrics](../src/lib/racing/horse-metrics.ts) · [Trainer and jockey priors](../src/lib/racing/trainer-quality.ts)

| Horse | Raw age / weight / OR | Days since run | Eligible horse runs | Trainer wins / runs | Jockey wins / runs | Missing numeric flags |
| --- | --- | --- | --- | --- | --- | --- |
| Miss Cynthia | 6 / 161 lb / 113 | 40 | 15 | 585 / 2,700 | 19 / 93 | 0 |
| Party Vibes | 8 / 164 lb / 116 | 201 | 15 | 73 / 442 | 277 / 1,562 | 0 |
| Easy To Follow | 8 / 156 lb / 108 | 189 | 9 | 394 / 1,670 | 561 / 2,305 | 0 |

Missing numeric values are encoded as a zero plus a separate missing flag before centering. Here every numeric slot for all three was observed. Easy To Follow's missing **individual** Huntingdon Speed did not set an **aggregate** missing flag because the other two figures were usable. The comment vector stores the number of recent usable comments, 21 indicators from the newest usable comment and 21 counts across up to three. A missing comment contributes no text flags. The completion vector uses the last three eligible result records, a separate stream which can include starts without usable Speed. Numeric finishing positions count as completions. A failure on the newest record can trigger the 30-day flag and, if pulled up, the latest-PU flag as well. No eligible history gives completion fraction zero and a missing-history flag. [Comment vector](../scripts/diagnose-independent-tissue-feasibility.ts) · [Completion context](../src/lib/racing/tissue-generation-context.ts) · [Generation features](../src/lib/racing/tissue-generation-features.ts)

### The earlier runs behind the inputs

The archive freezes sums, flags and rating aggregates. It does not freeze the raw per-run timings, margin chain, exact comment strings, trainer/jockey result lists or the original database state. The earlier records below were reread using the frozen cutoff and the capture's historical rating functions. For all three horses the rating aggregates, run counts, connection rates and counts, comment vectors and completion inputs reconciled to the frozen evidence. Dates and figures below refer only to races before 08:04:35.793 UTC on 19 November.

| Horse | Prior race (Sporting Life ID) | Code | Finish | Distance (yd) | Winning time (s) | Cumulative beaten lengths used | Equivalent time (s) | Implied base standard (s) | Jump Speed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Miss Cynthia | 10 Oct 2026 Chepstow 943364 | Hurdle | 3 | 4,280 | 307.50 | 4.75 | 308.410 | 302.680 | 88.878354 |
| Miss Cynthia | 27 Mar 2026 Wetherby 909295 | Hurdle | 11 | 4,676 | 316.40 | 39.75 | 323.572 | 317.930 | 89.975833 |
| Miss Cynthia | 18 Jan 2026 Fakenham 898673 | Hurdle | 1 | 4,401 | 316.15 | 0 | 316.150 | 311.305 | 90.854718 |
| Party Vibes | 2 May 2026 Uttoxeter 915106 | Chase | 5 | 5,290 | 358.42 | 56 | 368.538 | 372.870 | 106.802845 |
| Party Vibes | 6 Apr 2026 Hereford 910755 | Chase | 1 | 4,594 | 323.24 | 0 | 323.240 | 324.770 | 102.766656 |
| Party Vibes | 18 Feb 2026 Ludlow 903444 | Chase | 5 | 4,411 | 318.04 | 23.75 | 322.606 | 315.230 | 86.108026 |
| Easy To Follow | 14 May 2026 Perth 916934 | Hurdle | 2 | 4,435 | 316.34 | 5 | 317.291 | 306.130 | 79.094250 |
| Easy To Follow | 22 Jan 2026 Huntingdon 899403 | Chase | PU | 5,189 | 395.66 | — | — | — | — |
| Easy To Follow | 8 Dec 2025 Fontwell 893026 | Chase | 4 | 4,284 | 323.31 | 46 | 332.568 | 299.920 | 36.692400 |

The Speed engine reconstructs cumulative margins from the result field. It converts them to beaten seconds using the jump length conversion, adds them to winning time, and applies `100 + 37.76 × (standard − equivalent time) / furlongs`. The eight usable figures above were base-method figures with medium confidence. The standards in the table are algebraically recovered from those figures and the equivalent times. Party Vibes' three standards had 17, 29 and 23 supporting standard-time races respectively. Her two figures above 102 support the aggregate independently of one run. The 56-length margin means the Uttoxeter rating deserves more caution than the bare number suggests. The engine's withholding threshold is 75 cumulative lengths. Her latest and best L3 both use Uttoxeter, while average L3 uses all three and is **98.559176**. The Hurdle vector pools Chase and Hurdle Speed, so her fifth at Uttoxeter could supply a higher figure than another horse's better finishing position. [As-of rating loader](../src/lib/racing/jump-speed-ratings.ts) · [Jump Speed formula and withholding](../src/lib/racing/jump-speed-rating.ts) · [Party Vibes form history](https://www.sportinglife.com/racing/profiles/horse/1123374/)

Party Vibes' latest usable comment at Uttoxeter triggered zero flags. Hereford triggered `led` and `stayedOn`, and Ludlow triggered `weakened`. Miss Cynthia's latest Chepstow comment triggered `led` and `weakened`, with a further `heldUpRear` at Fakenham. Easy To Follow's latest Perth comment triggered zero flags and Fontwell supplied `led`, `bumped` and `lostTouch`. Party Vibes and Miss Cynthia both had 3/3 completions. Easy To Follow had 2/3 after the Huntingdon PU. She last ran 189 days before capture, so her PU affected the fraction only. The three Best L3 Speed ranks were 7, 5 and 9, respectively. None received the rank-2/3 adjustment or carried a missing Speed rank. [Comment and completion feature code](../src/lib/racing/jump-tissue-sync.ts) · [Hurdle generation features](../src/lib/racing/tissue-generation-features.ts)

<details>
<summary>Every frozen input and component for T1, T2 and T3</summary>

Each runner cell gives frozen input / standardised value / score contribution. Parameter columns retain full precision. Runner cells show frozen inputs at full precision and other values to six decimals. Zero-valued flags still have centred contributions.

| Input | Mean | Scale | Weight | Miss Cynthia | Party Vibes | Easy To Follow |
| --- | --- | --- | --- | --- | --- | --- |
| official_rating | 70.17440067292864 | 53.959535188538524 | 0.12332534206913932 | 113 / 0.793661 / +0.097879 | 116 / 0.849259 / +0.104735 | 108 / 0.700999 / +0.086451 |
| latest_jump_speed | 80.13179770375604 | 45.05787393028438 | 0.11301666442755515 | 88.87835416193555 / 0.194118 / +0.021939 | 106.8028453925384 / 0.591929 / +0.066898 | 79.0942503991219 / -0.023027 / −0.002602 |
| best_l3_jump_speed | 86.36747893333191 | 50.47163716070506 | 0.009816292874015075 | 90.85471847307436 / 0.088906 / +0.000873 | 106.8028453925384 / 0.404888 / +0.003975 | 79.0942503991219 / -0.144105 / −0.001415 |
| avg_l3_jump_speed | 77.37886759968444 | 44.90801881279394 | 0.04744696672701633 | 89.90296868542565 / 0.278883 / +0.013232 | 98.55917552932829 / 0.471638 / +0.022378 | 57.89332524646427 / -0.433899 / −0.020587 |
| trainer_prior_rate | 13.067014380318886 | 6.642874645267324 | 0.2211192481102265 | 21.666666666666668 / 1.294568 / +0.286254 | 16.515837104072396 / 0.519176 / +0.114800 | 23.592814371257482 / 1.584525 / +0.350369 |
| log_trainer_prior_runs | 5.5891796335064265 | 1.2449992843751154 | 0.10404170721228445 | 7.901377353792616 / 1.857188 / +0.193225 | 6.093569770045136 / 0.405133 / +0.042151 | 7.421177528595393 / 1.471485 / +0.153096 |
| jockey_prior_rate | 13.450078232562012 | 6.660528746765618 | 0.2117071613610977 | 20.43010752688172 / 1.047969 / +0.221863 | 17.733674775928296 / 0.643132 / +0.136156 | 24.338394793926245 / 1.634753 / +0.346089 |
| log_jockey_prior_runs | 5.556264964346884 | 1.0833737728412385 | 0.08203637397689759 | 4.543294782270004 / -0.935014 / −0.076705 | 7.354362330421477 / 1.659720 / +0.136157 | 7.743269700829004 / 2.018698 / +0.165607 |
| days_since_run | 56.1360577597084 | 81.37310801468313 | -0.007311401307156603 | 40 / -0.198297 / +0.001450 | 201 / 1.780243 / −0.013016 | 189 / 1.632775 / −0.011938 |
| log_prior_jump_starts | 1.6679786119655886 | 0.8385570721259157 | 0.05129715222508778 | 2.772588722239781 / 1.317275 / +0.067572 | 2.772588722239781 / 1.317275 / +0.067572 | 2.302585092994046 / 0.756784 / +0.038821 |
| age | 6.134095051170616 | 1.841970540548659 | -0.09253794600241383 | 6 / -0.072800 / +0.006737 | 8 / 1.012994 / −0.093740 | 8 / 1.012994 / −0.093740 |
| weight_lbs | 157.11727183513247 | 6.925576226695445 | 0.04498052035646061 | 161 / 0.560636 / +0.025218 | 164 / 0.993813 / +0.044702 | 156 / -0.161325 / −0.007257 |
| class | 2.781017804570307 | 1.923642254902902 | -2.700805544578044e-19 | 3 / 0.113837 / −0.000000 | 3 / 0.113837 / −0.000000 | 3 / 0.113837 / −0.000000 |
| distance_furlongs | 18.641647974204023 | 3.0215781741279897 | 1.7799155041799014e-18 | 21.022727272727273 / 0.788025 / +0.000000 | 21.022727272727273 / 0.788025 / +0.000000 | 21.022727272727273 / 0.788025 / +0.000000 |
| field_size | 9.840109350904248 | 4.319874173146904 | -3.1090364275781027e-18 | 9 / -0.194475 / +0.000000 | 9 / -0.194475 / +0.000000 | 9 / -0.194475 / +0.000000 |
| handicap | 0.5265666619935511 | 0.4992937136301104 | 3.0297847140595565e-18 | 1 / 0.948206 / +0.000000 | 1 / 0.948206 / +0.000000 | 1 / 0.948206 / +0.000000 |
| going_soft | 0.5784382447777934 | 0.4938091146952827 | 1.26708283659869e-18 | 1 / 0.853694 / +0.000000 | 1 / 0.853694 / +0.000000 | 1 / 0.853694 / +0.000000 |
| going_firm | 0.0858684985279686 | 0.2801697690481623 | 2.6497746493074243e-18 | 0 / -0.306487 / −0.000000 | 0 / -0.306487 / −0.000000 | 0 / -0.306487 / −0.000000 |
| official_rating_missing | 0.3537081172017384 | 0.47811994836788024 | -0.11143789566818532 | 0 / -0.739789 / +0.082441 | 0 / -0.739789 / +0.082441 | 0 / -0.739789 / +0.082441 |
| latest_jump_speed_missing | 0.18842001962708538 | 0.39104720409537386 | 0.004426929216624827 | 0 / -0.481834 / −0.002133 | 0 / -0.481834 / −0.002133 | 0 / -0.481834 / −0.002133 |
| best_l3_jump_speed_missing | 0.21736997055937193 | 0.4124563812797509 | 0.016706793407090182 | 0 / -0.527013 / −0.008805 | 0 / -0.527013 / −0.008805 | 0 / -0.527013 / −0.008805 |
| avg_l3_jump_speed_missing | 0.21736997055937193 | 0.4124563812797509 | 0.016706793407090182 | 0 / -0.527013 / −0.008805 | 0 / -0.527013 / −0.008805 | 0 / -0.527013 / −0.008805 |
| trainer_prior_rate_missing | 0.0015421281368288237 | 0.03923964803153605 | -0.022999396140924097 | 0 / -0.039300 / +0.000904 | 0 / -0.039300 / +0.000904 | 0 / -0.039300 / +0.000904 |
| log_trainer_prior_runs_missing | 0 | 0.000001 | 0 | 0 / 0.000000 / +0.000000 | 0 / 0.000000 / +0.000000 | 0 / 0.000000 / +0.000000 |
| jockey_prior_rate_missing | 0.001331837936352166 | 0.036470044475751036 | -0.044684621773381915 | 0 / -0.036519 / +0.001632 | 0 / -0.036519 / +0.001632 | 0 / -0.036519 / +0.001632 |
| log_jockey_prior_runs_missing | 0 | 0.000001 | 0 | 0 / 0.000000 / +0.000000 | 0 / 0.000000 / +0.000000 | 0 / 0.000000 / +0.000000 |
| days_since_run_missing | 0.1080891630450021 | 0.31049298845103296 | 0.05490528377927746 | 0 / -0.348121 / −0.019114 | 0 / -0.348121 / −0.019114 | 0 / -0.348121 / −0.019114 |
| log_prior_jump_starts_missing | 0 | 0.000001 | 0 | 0 / 0.000000 / +0.000000 | 0 / 0.000000 / +0.000000 | 0 / 0.000000 / +0.000000 |
| age_missing | 0 | 0.000001 | 0 | 0 / 0.000000 / +0.000000 | 0 / 0.000000 / +0.000000 | 0 / 0.000000 / +0.000000 |
| weight_lbs_missing | 0 | 0.000001 | 0 | 0 / 0.000000 / +0.000000 | 0 / 0.000000 / +0.000000 | 0 / 0.000000 / +0.000000 |
| class_missing | 0.2467405018926118 | 0.4311144008478091 | -9.146870972715813e-19 | 0 / -0.572332 / +0.000000 | 0 / -0.572332 / +0.000000 | 0 / -0.572332 / +0.000000 |
| distance_furlongs_missing | 0 | 0.000001 | 0 | 0 / 0.000000 / +0.000000 | 0 / 0.000000 / +0.000000 | 0 / 0.000000 / +0.000000 |
| field_size_missing | 0 | 0.000001 | 0 | 0 / 0.000000 / +0.000000 | 0 / 0.000000 / +0.000000 | 0 / 0.000000 / +0.000000 |
| handicap_missing | 0 | 0.000001 | 0 | 0 / 0.000000 / +0.000000 | 0 / 0.000000 / +0.000000 | 0 / 0.000000 / +0.000000 |
| going_soft_missing | 0 | 0.000001 | 0 | 0 / 0.000000 / +0.000000 | 0 / 0.000000 / +0.000000 | 0 / 0.000000 / +0.000000 |
| going_firm_missing | 0 | 0.000001 | 0 | 0 / 0.000000 / +0.000000 | 0 / 0.000000 / +0.000000 | 0 / 0.000000 / +0.000000 |
| prior_comment_count | 2.4042478620496284 | 1.0394470654380055 | 0.07887692453758846 | 3 / 0.573143 / +0.045208 | 3 / 0.573143 / +0.045208 | 3 / 0.573143 / +0.045208 |
| last_slowlyAway | 0.005958222346838638 | 0.07695922253572383 | -0.0013840197611870231 | 0 / -0.077421 / +0.000107 | 0 / -0.077421 / +0.000107 | 0 / -0.077421 / +0.000107 |
| last_awkwardStart | 0.0004906771344455348 | 0.022145798030221518 | -0.03479057618350504 | 0 / -0.022157 / +0.000771 | 0 / -0.022157 / +0.000771 | 0 / -0.022157 / +0.000771 |
| last_prominent | 0.06399831767839619 | 0.24474993976040055 | -0.022877194821215332 | 0 / -0.261485 / +0.005982 | 0 / -0.261485 / +0.005982 | 0 / -0.261485 / +0.005982 |
| last_led | 0.22977709238749475 | 0.4206894106124308 | 0.08979571534261653 | 1 / 1.830859 / +0.164403 | 0 / -0.546192 / −0.049046 | 0 / -0.546192 / −0.049046 |
| last_heldUpRear | 0.28080751436983037 | 0.4493936517611636 | -0.06993001432617778 | 0 / -0.624859 / +0.043696 | 0 / -0.624859 / +0.043696 | 0 / -0.624859 / +0.043696 |
| last_racedFreely | 0.03217440067292864 | 0.17646305169714824 | -0.011550204086917256 | 0 / -0.182329 / +0.002106 | 0 / -0.182329 / +0.002106 | 0 / -0.182329 / +0.002106 |
| last_hampered | 0.023342212252909014 | 0.15098792461666777 | -0.034911273705941825 | 0 / -0.154597 / +0.005397 | 0 / -0.154597 / +0.005397 | 0 / -0.154597 / +0.005397 |
| last_bumped | 0.0077106406841441185 | 0.08747106209703509 | -0.012846975012439137 | 0 / -0.088151 / +0.001132 | 0 / -0.088151 / +0.001132 | 0 / -0.088151 / +0.001132 |
| last_checked | 0.00021029020047665778 | 0.014499861327205973 | -0.03342548008967111 | 0 / -0.014503 / +0.000485 | 0 / -0.014503 / +0.000485 | 0 / -0.014503 / +0.000485 |
| last_deniedRoom | 0 | 0.000001 | 0 | 0 / 0.000000 / +0.000000 | 0 / 0.000000 / +0.000000 | 0 / 0.000000 / +0.000000 |
| last_shortRoom | 0.008832188420019628 | 0.09356377967854262 | 0.021600846912212802 | 0 / -0.094398 / −0.002039 | 0 / -0.094398 / −0.002039 | 0 / -0.094398 / −0.002039 |
| last_switched | 0.018295247441469226 | 0.13401690700254007 | 0.016854088838435487 | 0 / -0.136514 / −0.002301 | 0 / -0.136514 / −0.002301 | 0 / -0.136514 / −0.002301 |
| last_racedWide | 0.008691994953035189 | 0.09282480367213235 | -0.05258770991197108 | 0 / -0.093639 / +0.004924 | 0 / -0.093639 / +0.004924 | 0 / -0.093639 / +0.004924 |
| last_stayedOn | 0.08327491938875649 | 0.27629731665278595 | 0.03899074616559247 | 0 / -0.301396 / −0.011752 | 0 / -0.301396 / −0.011752 | 0 / -0.301396 / −0.011752 |
| last_strongFinish | 0.007149866816206365 | 0.08425405759199442 | 0.01035863652486184 | 0 / -0.084861 / −0.000879 | 0 / -0.084861 / −0.000879 | 0 / -0.084861 / −0.000879 |
| last_weakened | 0.1786765736716669 | 0.38308126512875323 | -0.04988626732376698 | 1 / 2.143993 / −0.106956 | 0 / -0.466420 / +0.023268 | 0 / -0.466420 / +0.023268 |
| last_faded | 0.011986541427169494 | 0.10882492477270185 | -0.0310071232777302 | 0 / -0.110145 / +0.003415 | 0 / -0.110145 / +0.003415 | 0 / -0.110145 / +0.003415 |
| last_eased | 0.009673349221926258 | 0.09787632776496445 | 0.007277252593013351 | 0 / -0.098832 / −0.000719 | 0 / -0.098832 / −0.000719 | 0 / -0.098832 / −0.000719 |
| last_neverDangerous | 0.017454086639562598 | 0.13095587615355728 | -0.027099172805074328 | 0 / -0.133282 / +0.003612 | 0 / -0.133282 / +0.003612 | 0 / -0.133282 / +0.003612 |
| last_lostTouch | 0.006799383148745269 | 0.08217756103427448 | -0.0012510769716220513 | 0 / -0.082740 / +0.000104 | 0 / -0.082740 / +0.000104 | 0 / -0.082740 / +0.000104 |
| last_equipment | 0.015841861769241555 | 0.12486351422623775 | 0.004865156953338842 | 0 / -0.126873 / −0.000617 | 0 / -0.126873 / −0.000617 | 0 / -0.126873 / −0.000617 |
| last3_slowlyAway_count | 0.019556988644329174 | 0.15382036205585495 | 0.032980732289626565 | 0 / -0.127142 / −0.004193 | 0 / -0.127142 / −0.004193 | 0 / -0.127142 / −0.004193 |
| last3_awkwardStart_count | 0.0009112575353988504 | 0.030173285288527456 | 0.0033219937438418393 | 0 / -0.030201 / −0.000100 | 0 / -0.030201 / −0.000100 | 0 / -0.030201 / −0.000100 |
| last3_prominent_count | 0.16753119304640404 | 0.4167393650077985 | -0.00766322469620563 | 0 / -0.402005 / +0.003081 | 0 / -0.402005 / +0.003081 | 0 / -0.402005 / +0.003081 |
| last3_led_count | 0.6338146642366466 | 0.8425395961723129 | 0.05592457033475556 | 1 / 0.434621 / +0.024306 | 1 / 0.434621 / +0.024306 | 1 / 0.434621 / +0.024306 |
| last3_heldUpRear_count | 0.7399411187438666 | 0.8745502759895765 | -0.0018909861574687911 | 1 / 0.297363 / −0.000562 | 0 / -0.846082 / +0.001600 | 0 / -0.846082 / +0.001600 |
| last3_racedFreely_count | 0.08201317818589654 | 0.29339719451204 | 0.07849804567493703 | 0 / -0.279530 / −0.021943 | 0 / -0.279530 / −0.021943 | 0 / -0.279530 / −0.021943 |
| last3_hampered_count | 0.06378802747791953 | 0.25559118472231285 | 0.025624169416728786 | 0 / -0.249571 / −0.006395 | 0 / -0.249571 / −0.006395 | 0 / -0.249571 / −0.006395 |
| last3_bumped_count | 0.018785924575914763 | 0.13781795050601997 | 0.000376388420717069 | 0 / -0.136310 / −0.000051 | 0 / -0.136310 / −0.000051 | 1 / 7.119639 / +0.002680 |
| last3_checked_count | 0.0007710640684144118 | 0.027757332880099055 | 0.03926911575770598 | 0 / -0.027779 / −0.001091 | 0 / -0.027779 / −0.001091 | 0 / -0.027779 / −0.001091 |
| last3_deniedRoom_count | 0.00007009673349221926 | 0.008372085758050558 | 0.05253715979964217 | 0 / -0.008373 / −0.000440 | 0 / -0.008373 / −0.000440 | 0 / -0.008373 / −0.000440 |
| last3_shortRoom_count | 0.02376279265386233 | 0.15276883126519142 | 0.018155562588851263 | 0 / -0.155547 / −0.002824 | 0 / -0.155547 / −0.002824 | 0 / -0.155547 / −0.002824 |
| last3_switched_count | 0.05145100238328894 | 0.22932296079028555 | -0.005569981359633752 | 0 / -0.224360 / +0.001250 | 0 / -0.224360 / +0.001250 | 0 / -0.224360 / +0.001250 |
| last3_racedWide_count | 0.027337726061965512 | 0.16688953232176854 | 0.045736873731996544 | 0 / -0.163807 / −0.007492 | 0 / -0.163807 / −0.007492 | 0 / -0.163807 / −0.007492 |
| last3_stayedOn_count | 0.2365063788027478 | 0.48502223012178347 | 0.05010270296805907 | 0 / -0.487620 / −0.024431 | 1 / 1.574142 / +0.078869 | 0 / -0.487620 / −0.024431 |
| last3_strongFinish_count | 0.018715827842422542 | 0.13706248951317485 | 0.01674359839145201 | 0 / -0.136550 / −0.002286 | 0 / -0.136550 / −0.002286 | 0 / -0.136550 / −0.002286 |
| last3_weakened_count | 0.46628347119024255 | 0.664762814635838 | -0.09949639661946304 | 1 / 0.802868 / −0.079882 | 1 / 0.802868 / −0.079882 | 0 / -0.701428 / +0.069790 |
| last3_faded_count | 0.031753820271975326 | 0.17733156093894026 | 0.017329165687188456 | 0 / -0.179065 / −0.003103 | 0 / -0.179065 / −0.003103 | 0 / -0.179065 / −0.003103 |
| last3_eased_count | 0.024253469788307863 | 0.1560967851253195 | 0.052273115541824 | 0 / -0.155375 / −0.008122 | 0 / -0.155375 / −0.008122 | 0 / -0.155375 / −0.008122 |
| last3_neverDangerous_count | 0.04941819711201458 | 0.22311411485132257 | 0.017881444624364445 | 0 / -0.221493 / −0.003961 | 0 / -0.221493 / −0.003961 | 0 / -0.221493 / −0.003961 |
| last3_lostTouch_count | 0.017383989906070377 | 0.13439918552547933 | -0.05233336791754772 | 0 / -0.129346 / +0.006769 | 0 / -0.129346 / +0.006769 | 1 / 7.311175 / −0.382618 |
| last3_equipment_count | 0.034207205944203 | 0.21660153793809805 | -0.0030976210878221103 | 0 / -0.157927 / +0.000489 | 0 / -0.157927 / +0.000489 | 0 / -0.157927 / +0.000489 |
| speed_rank_2_3 | 0.2154761904761905 | 0.41115228542969073 | 0.0045950120362376464 | 0 / -0.524079 / −0.002408 | 0 / -0.524079 / −0.002408 | 0 / -0.524079 / −0.002408 |
| speed_rank_missing | 0.19404761904761905 | 0.3954657261882112 | 0.003273891557781568 | 0 / -0.490681 / −0.001606 | 0 / -0.490681 / −0.001606 | 0 / -0.490681 / −0.001606 |
| recent_non_completion | 0.030952380952380953 | 0.173188715180173 | -0.05075321311070166 | 0 / -0.178721 / +0.009071 | 0 / -0.178721 / +0.009071 | 0 / -0.178721 / +0.009071 |
| latest_pulled_up | 0.06547619047619048 | 0.24736422327595578 | -0.0417139308264011 | 0 / -0.264695 / +0.011041 | 0 / -0.264695 / +0.011041 | 0 / -0.264695 / +0.011041 |
| completed_last3_fraction | 0.8428571428571426 | 0.3046843899438158 | 0.03627946980596425 | 1 / 0.515756 / +0.018711 | 1 / 0.515756 / +0.018711 | 0.6666666666666666 / -0.578272 / −0.020979 |
| completion_history_missing | 0.08214285714285714 | 0.27458224298607575 | -0.03025107191415927 | 0 / -0.299156 / +0.009050 | 0 / -0.299156 / +0.009050 | 0 / -0.299156 / +0.009050 |

</details>

| Block | Party Vibes minus T1 | Party Vibes minus T3 |
| --- | --- | --- |
| Speed | +0.057207 | +0.117854 |
| Comments | +0.022237 | +0.340284 |
| OR | +0.006857 | +0.018284 |
| Race conditions/draw | +0.000000 | +0.000000 |
| Generation | +0.000000 | +0.039691 |
| Experience/recency | −0.014466 | +0.027673 |
| Age/weight | −0.080993 | +0.051959 |
| Connections | −0.195373 | −0.585897 |

Miss Cynthia's **+0.195373** connections lead and **+0.080993** age/weight lead more than offset Party Vibes' **+0.057207** Speed and **+0.022237** comments advantages. Their adjustment vectors and score contributions were identical. The high jockey sample for Party Vibes helped relative to Miss Cynthia, but Miss Cynthia's higher trainer rate, larger trainer sample and higher jockey rate outweighed it.

Against Easy To Follow, Party Vibes started **0.029842 behind on the base** despite stronger Speed and comments, because Easy To Follow led the connections block by **0.585897**. The largest individual swing was Easy To Follow's historical `lostTouch` count, worth **+0.389** to Party Vibes in that comparison. Party Vibes also gained **+0.103** from the additional `stayedOn` count and conceded **0.150** for the additional `weakened` count. The **+0.039691** relative completion term lifted her just over Easy To Follow. She had only **1.010×** T3's model probability. This is a multi-input selection with a narrow, adjustment-sensitive rank boundary.

The Fontwell source labels Easy To Follow fourth while the accompanying comment describes her pulling up before the last. The scorer used the structured position for Speed and completion, and the comment for text flags. The archived book reproduces both channels. That disagreement is a concrete input-quality limitation in the worked example. [Sporting Life Fontwell result](https://www.sportinglife.com/racing/results/2025-12-08/fontwell/893026/southern-cranes-and-access-handicap-chase-gbb-race)

### Isolated Warwick sensitivity

All omissions below zero the selected fitted contribution for **every** runner in the original field, keep all other terms fixed, and rerank with the same softmax and tie rules. This is a fixed-parameter comparison. The original frozen probability is the reference for percentage-point changes.

| Omitted from every runner | Score | Rank | Top two | Model p | Change |
| --- | --- | --- | --- | --- | --- |
| OR | 0.582904 | T3 | No | 14.099% | −0.069 pp |
| Speed | 0.696573 | T3 | No | 13.493% | −0.676 pp |
| Connections | 0.338281 | T3 | No | 14.299% | +0.131 pp |
| Experience/recency | 0.734637 | T3 | No | 13.948% | −0.221 pp |
| Age/weight | 0.819118 | T3 | No | 14.915% | +0.747 pp |
| Race conditions/draw | 0.770080 | T2 | Yes | 14.168% | +0.000 pp |
| Comments | 0.722746 | T4 | No | 11.446% | −2.722 pp |
| Generation | 0.726221 | T3 | No | 13.666% | −0.502 pp |
| speed_rank_2_3 | 0.772488 | T2 | Yes | 14.191% | +0.023 pp |
| speed_rank_missing | 0.771687 | T2 | Yes | 14.168% | +0.000 pp |
| recent_non_completion | 0.761010 | T2 | Yes | 13.835% | −0.333 pp |
| latest_pulled_up | 0.759039 | T2 | Yes | 14.168% | +0.000 pp |
| completed_last3_fraction | 0.751369 | T3 | No | 13.978% | −0.190 pp |
| completion_history_missing | 0.761030 | T2 | Yes | 14.168% | +0.000 pp |

Single-term checks on the base reinforce the distinction. Removing the `last3_lostTouch_count` column makes Party Vibes **T4 at 12.5814%**. Removing the `last3_stayedOn_count` column makes her **T3 at 13.0578%**. Removing the latest Speed or average L3 Speed term alone makes her **T3 at 13.6289% or 14.0503%**, respectively. Removing Best L3 alone leaves her **T2 at 14.1524%**. Every original runner takes part in each rerank, which is why a runner can lose rank even when its own probability rises.

## Prospective population at final SP

The current generation includes **413 unique original books from 5–20 November 2026** and 826 original T1/T2 choices. Of the 789 with a reconciled final SP, **185 were 8/1 or longer**. They won **12 times** against **28.22 model-expected** and **10.78 SP market-expected** wins. Overall market A/E was **1.11** and £1 SP P/L was **−£37.50 (−20.3%)**. The 46 selections at 20/1 or longer had **zero wins** against **6.93 model-expected** and **1.18 SP market-expected**. There were 20 at 33/1 or longer, with **3.04 model-expected** and **0.33 market-expected**. Absolute model probabilities in that extreme group deserve scrutiny, while the sample offers little precision about true strike rates.

The earlier standalone primary archives add **1,564 model books and 604 priced 8/1+ selections**. They produced **29 wins**, **35.58 SP market-expected** wins and **−£233.00 (−38.6%)**. Archived T1 was **10/245**, **−£102.00**, and archived T2 was **19/359**, **−£131.00**. There are 42 shared race IDs between the current and archived books and nine between AW V1 and V2 at their transition. A race can therefore appear under multiple contemporaneously frozen model identities. Read the cohorts by model and epoch as selection records. The accompanying counts are descriptive and the time periods differ.

**What qualified.** Each T1/T2 label comes from its own saved pre-off, complete-probability primary book. The archived books are the standalone Turf V1–V3, AW V1–V2 and Jump V1 Hurdle/Chase ledgers. Three non-pre-race Turf V1 books, three previously quarantined race identities and 34 NH Flat books fell outside the population. The separate Value, Hurdle V3 Shadow, paired experiments and historical replays answer different questions and are outside the primary population. The inventory lists every priced qualifier in the primary population, including all losses. Pending, void and NR rows remain in coverage counts. “No terminal field” means the full result join could not validate a terminal field. One of those current choices already has a frozen NR outcome.

**Settlement and market basis.** Sporting Life race ID and ride ID link the stored runners to the terminal result. A complete terminal field must pass the production final-SP index checks. A frozen result conflict excludes the whole associated model book from monetary evaluation. The exclusions include 26 archived rank choices from conflicting books and 206 without a validated terminal field. Final fractional SP must agree with the database decimal within its rounding tolerance. The original fractional price is used in the existing canonical v3 £1 win-settlement function, uncapped. Started non-finishers count as losses. There were no selected dead heats among the priced 8/1+ cohorts. Average SP is arithmetic decimal odds, inclusive of returned stake. SP expected wins sum `(1 / decimal SP) / sum of starter-field reciprocals`. Market A/E uses actual win credit over that denominator. For comparison the current group's raw reciprocals sum to **13.23** before normalization. All priced outsider stakes have complete market books. Final SP classifies the retrospective bands, so “Selections” and “Settled” coincide within bands. Final SP enters after the original ranks, scores and probabilities are fixed. [Terminal result index](../src/lib/racing/hurdle-final-sp.ts) · [Canonical settlement](../src/lib/racing/backtest.ts) · [Settlement v3 definitions](settlement-v3.md) · [Archived identity quarantine](../src/lib/racing/tissue-prospective-sources.ts)

### Current generation

| Family and model | First / last book | Books | Frozen T1/T2 | Final SP | NR | Unavailable / conflict | 8/1+ |
| --- | --- | --- | --- | --- | --- | --- | --- |
| HURDLE HURDLE_TISSUE_V2 | 2026-11-05 / 2026-11-20 | 178 | 356 | 341 | 13 | 1 Void, 1 No terminal field | 71 |
| CHASE CHASE_TISSUE_V2 | 2026-11-05 / 2026-11-20 | 104 | 208 | 188 | 16 | 4 No terminal field | 30 |
| AW AW_TISSUE_V3 | 2026-11-05 / 2026-11-20 | 123 | 246 | 244 | 2 | — | 76 |
| TURF TURF_TISSUE_V4 | 2026-11-07 / 2026-11-07 | 8 | 16 | 16 | 0 | — | 8 |

| Family and rank | Selections | Settled | Wins | Strike | Mean SP (dec.) | SP E | Market n | Market A/E | £1 P/L | ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| All T1 | 62 | 62 | 3 | 4.8% | 15.37 | 3.95 | 62 | 0.76 | −£31.00 | -50.0% |
| All T2 | 123 | 123 | 9 | 7.3% | 22.29 | 6.83 | 123 | 1.32 | −£6.50 | -5.3% |
| TURF T1 | 4 | 4 | 0 | 0.0% | 13.75 | 0.22 | 4 | 0.00 | −£4.00 | -100.0% |
| TURF T2 | 4 | 4 | 0 | 0.0% | 18.25 | 0.22 | 4 | 0.00 | −£4.00 | -100.0% |
| AW T1 | 29 | 29 | 2 | 6.9% | 17.17 | 1.80 | 29 | 1.11 | −£8.00 | -27.6% |
| AW T2 | 47 | 47 | 2 | 4.3% | 18.85 | 2.61 | 47 | 0.77 | −£20.00 | -42.6% |
| HURDLE T1 | 21 | 21 | 0 | 0.0% | 12.60 | 1.45 | 21 | 0.00 | −£21.00 | -100.0% |
| HURDLE T2 | 50 | 50 | 4 | 8.0% | 28.65 | 2.53 | 50 | 1.58 | +£5.00 | 10.0% |
| CHASE T1 | 8 | 8 | 1 | 12.5% | 16.94 | 0.48 | 8 | 2.09 | +£2.00 | 25.0% |
| CHASE T2 | 22 | 22 | 3 | 13.6% | 15.91 | 1.47 | 22 | 2.04 | +£12.50 | 56.8% |

#### All four families by band

| Band | Rank | Selections | Settled | Wins | Strike | Mean SP (dec.) | SP E | Market n | Market A/E | £1 P/L | ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 8–<12/1 | T1 | 38 | 38 | 3 | 7.9% | 10.61 | 2.92 | 38 | 1.03 | −£7.00 | -18.4% |
| 8–<12/1 | T2 | 50 | 50 | 5 | 10.0% | 10.53 | 3.97 | 50 | 1.26 | +£2.50 | 5.0% |
| 12–<20/1 | T1 | 14 | 14 | 0 | 0.0% | 15.14 | 0.75 | 14 | 0.00 | −£14.00 | -100.0% |
| 12–<20/1 | T2 | 37 | 37 | 4 | 10.8% | 15.65 | 1.97 | 37 | 2.04 | +£27.00 | 73.0% |
| 20–<33/1 | T1 | 6 | 6 | 0 | 0.0% | 24.17 | 0.21 | 6 | 0.00 | −£6.00 | -100.0% |
| 20–<33/1 | T2 | 20 | 20 | 0 | 0.0% | 25.70 | 0.64 | 20 | 0.00 | −£20.00 | -100.0% |
| 33/1+ | T1 | 4 | 4 | 0 | 0.0% | 48.25 | 0.07 | 4 | 0.00 | −£4.00 | -100.0% |
| 33/1+ | T2 | 16 | 16 | 0 | 0.0% | 70.13 | 0.26 | 16 | 0.00 | −£16.00 | -100.0% |

#### TURF

| Band | Rank | Selections | Settled | Wins | Strike | Mean SP (dec.) | SP E | Market n | Market A/E | £1 P/L | ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 8–<12/1 | T1 | 1 | 1 | 0 | 0.0% | 12.00 | 0.06 | 1 | 0.00 | −£1.00 | -100.0% |
| 8–<12/1 | T2 | 2 | 2 | 0 | 0.0% | 11.00 | 0.16 | 2 | 0.00 | −£2.00 | -100.0% |
| 12–<20/1 | T1 | 3 | 3 | 0 | 0.0% | 14.33 | 0.16 | 3 | 0.00 | −£3.00 | -100.0% |
| 12–<20/1 | T2 | 1 | 1 | 0 | 0.0% | 17.00 | 0.05 | 1 | 0.00 | −£1.00 | -100.0% |
| 20–<33/1 | T1 | 0 | 0 | 0 | — | — | 0.00 | 0 | — | — | — |
| 20–<33/1 | T2 | 0 | 0 | 0 | — | — | 0.00 | 0 | — | — | — |
| 33/1+ | T1 | 0 | 0 | 0 | — | — | 0.00 | 0 | — | — | — |
| 33/1+ | T2 | 1 | 1 | 0 | 0.0% | 34.00 | 0.02 | 1 | 0.00 | −£1.00 | -100.0% |

#### AW

| Band | Rank | Selections | Settled | Wins | Strike | Mean SP (dec.) | SP E | Market n | Market A/E | £1 P/L | ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 8–<12/1 | T1 | 18 | 18 | 2 | 11.1% | 10.67 | 1.37 | 18 | 1.46 | +£3.00 | 16.7% |
| 8–<12/1 | T2 | 19 | 19 | 1 | 5.3% | 10.58 | 1.46 | 19 | 0.68 | −£9.00 | -47.4% |
| 12–<20/1 | T1 | 6 | 6 | 0 | 0.0% | 15.33 | 0.33 | 6 | 0.00 | −£6.00 | -100.0% |
| 12–<20/1 | T2 | 17 | 17 | 1 | 5.9% | 15.94 | 0.87 | 17 | 1.14 | £0.00 | 0.0% |
| 20–<33/1 | T1 | 2 | 2 | 0 | 0.0% | 27.50 | 0.06 | 2 | 0.00 | −£2.00 | -100.0% |
| 20–<33/1 | T2 | 5 | 5 | 0 | 0.0% | 26.00 | 0.15 | 5 | 0.00 | −£5.00 | -100.0% |
| 33/1+ | T1 | 3 | 3 | 0 | 0.0% | 53.00 | 0.05 | 3 | 0.00 | −£3.00 | -100.0% |
| 33/1+ | T2 | 6 | 6 | 0 | 0.0% | 47.33 | 0.12 | 6 | 0.00 | −£6.00 | -100.0% |

#### HURDLE

| Band | Rank | Selections | Settled | Wins | Strike | Mean SP (dec.) | SP E | Market n | Market A/E | £1 P/L | ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 8–<12/1 | T1 | 15 | 15 | 0 | 0.0% | 10.57 | 1.16 | 15 | 0.00 | −£15.00 | -100.0% |
| 8–<12/1 | T2 | 16 | 16 | 2 | 12.5% | 10.59 | 1.27 | 16 | 1.58 | +£5.00 | 31.3% |
| 12–<20/1 | T1 | 4 | 4 | 0 | 0.0% | 15.00 | 0.22 | 4 | 0.00 | −£4.00 | -100.0% |
| 12–<20/1 | T2 | 15 | 15 | 2 | 13.3% | 15.53 | 0.80 | 15 | 2.50 | +£19.00 | 126.7% |
| 20–<33/1 | T1 | 2 | 2 | 0 | 0.0% | 23.00 | 0.07 | 2 | 0.00 | −£2.00 | -100.0% |
| 20–<33/1 | T2 | 11 | 11 | 0 | 0.0% | 25.18 | 0.36 | 11 | 0.00 | −£11.00 | -100.0% |
| 33/1+ | T1 | 0 | 0 | 0 | — | — | 0.00 | 0 | — | — | — |
| 33/1+ | T2 | 8 | 8 | 0 | 0.0% | 94.13 | 0.10 | 8 | 0.00 | −£8.00 | -100.0% |

#### CHASE

| Band | Rank | Selections | Settled | Wins | Strike | Mean SP (dec.) | SP E | Market n | Market A/E | £1 P/L | ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 8–<12/1 | T1 | 4 | 4 | 1 | 25.0% | 10.13 | 0.33 | 4 | 3.01 | +£6.00 | 150.0% |
| 8–<12/1 | T2 | 13 | 13 | 2 | 15.4% | 10.31 | 1.09 | 13 | 1.84 | +£8.50 | 65.4% |
| 12–<20/1 | T1 | 1 | 1 | 0 | 0.0% | 17.00 | 0.05 | 1 | 0.00 | −£1.00 | -100.0% |
| 12–<20/1 | T2 | 4 | 4 | 1 | 25.0% | 14.50 | 0.25 | 4 | 4.06 | +£9.00 | 225.0% |
| 20–<33/1 | T1 | 2 | 2 | 0 | 0.0% | 22.00 | 0.08 | 2 | 0.00 | −£2.00 | -100.0% |
| 20–<33/1 | T2 | 4 | 4 | 0 | 0.0% | 26.75 | 0.12 | 4 | 0.00 | −£4.00 | -100.0% |
| 33/1+ | T1 | 1 | 1 | 0 | 0.0% | 34.00 | 0.02 | 1 | 0.00 | −£1.00 | -100.0% |
| 33/1+ | T2 | 1 | 1 | 0 | 0.0% | 51.00 | 0.02 | 1 | 0.00 | −£1.00 | -100.0% |

### Earlier primary archives

| Family and model | First / last book | Books | Frozen T1/T2 | Final SP | NR | Unavailable / conflict | 8/1+ |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TURF independent_tissue_numeric_comments_v1_2025 | 2026-09-19 / 2026-09-19 | 33 | 66 | 53 | 13 | — | 11 |
| TURF tissue_model_v2 | 2026-09-25 / 2026-10-19 | 453 | 906 | 814 | 38 | 52 No terminal field, 2 Frozen result conflict | 199 |
| TURF tissue_model_v3 | 2026-10-20 / 2026-11-04 | 152 | 304 | 263 | 15 | 4 Frozen result conflict, 22 No terminal field | 68 |
| AW AW_TISSUE_V1 | 2026-10-02 / 2026-10-20 | 200 | 400 | 325 | 9 | 66 No terminal field | 76 |
| AW AW_TISSUE_V2 | 2026-10-20 / 2026-11-05 | 188 | 376 | 343 | 15 | 6 Frozen result conflict, 12 No terminal field | 77 |
| CHASE JUMP_TISSUE_V1 | 2026-10-02 / 2026-11-05 | 200 | 400 | 337 | 33 | 24 No terminal field, 6 Frozen result conflict | 42 |
| HURDLE JUMP_TISSUE_V1 | 2026-10-03 / 2026-11-05 | 338 | 676 | 598 | 40 | 30 No terminal field, 8 Frozen result conflict | 131 |

#### TURF

| Band | Rank | Selections | Settled | Wins | Strike | Mean SP (dec.) | SP E | Market n | Market A/E | £1 P/L | ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 8–<12/1 | T1 | 49 | 49 | 2 | 4.1% | 10.62 | 3.78 | 49 | 0.53 | −£27.00 | -55.1% |
| 8–<12/1 | T2 | 77 | 77 | 5 | 6.5% | 10.38 | 6.07 | 77 | 0.82 | −£26.00 | -33.8% |
| 12–<20/1 | T1 | 37 | 37 | 2 | 5.4% | 15.32 | 1.96 | 37 | 1.02 | −£9.00 | -24.3% |
| 12–<20/1 | T2 | 43 | 43 | 2 | 4.7% | 15.42 | 2.28 | 43 | 0.88 | −£13.00 | -30.2% |
| 20–<33/1 | T1 | 17 | 17 | 2 | 11.8% | 24.59 | 0.55 | 17 | 3.61 | +£29.00 | 170.6% |
| 20–<33/1 | T2 | 31 | 31 | 0 | 0.0% | 24.26 | 1.02 | 31 | 0.00 | −£31.00 | -100.0% |
| 33/1+ | T1 | 8 | 8 | 0 | 0.0% | 53.50 | 0.13 | 8 | 0.00 | −£8.00 | -100.0% |
| 33/1+ | T2 | 16 | 16 | 0 | 0.0% | 87.50 | 0.22 | 16 | 0.00 | −£16.00 | -100.0% |

#### AW

| Band | Rank | Selections | Settled | Wins | Strike | Mean SP (dec.) | SP E | Market n | Market A/E | £1 P/L | ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 8–<12/1 | T1 | 32 | 32 | 1 | 3.1% | 10.55 | 2.51 | 32 | 0.40 | −£23.00 | -71.9% |
| 8–<12/1 | T2 | 47 | 47 | 6 | 12.8% | 10.48 | 3.70 | 47 | 1.62 | +£14.50 | 30.9% |
| 12–<20/1 | T1 | 17 | 17 | 1 | 5.9% | 15.59 | 0.90 | 17 | 1.12 | −£4.00 | -23.5% |
| 12–<20/1 | T2 | 33 | 33 | 0 | 0.0% | 15.61 | 1.76 | 33 | 0.00 | −£33.00 | -100.0% |
| 20–<33/1 | T1 | 7 | 7 | 0 | 0.0% | 24.57 | 0.24 | 7 | 0.00 | −£7.00 | -100.0% |
| 20–<33/1 | T2 | 6 | 6 | 0 | 0.0% | 24.00 | 0.21 | 6 | 0.00 | −£6.00 | -100.0% |
| 33/1+ | T1 | 4 | 4 | 0 | 0.0% | 44.25 | 0.08 | 4 | 0.00 | −£4.00 | -100.0% |
| 33/1+ | T2 | 7 | 7 | 0 | 0.0% | 42.71 | 0.15 | 7 | 0.00 | −£7.00 | -100.0% |

#### HURDLE

| Band | Rank | Selections | Settled | Wins | Strike | Mean SP (dec.) | SP E | Market n | Market A/E | £1 P/L | ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 8–<12/1 | T1 | 23 | 23 | 0 | 0.0% | 10.20 | 1.91 | 23 | 0.00 | −£23.00 | -100.0% |
| 8–<12/1 | T2 | 25 | 25 | 3 | 12.0% | 10.62 | 1.94 | 25 | 1.55 | +£3.50 | 14.0% |
| 12–<20/1 | T1 | 19 | 19 | 1 | 5.3% | 15.42 | 1.01 | 19 | 0.99 | −£4.00 | -21.1% |
| 12–<20/1 | T2 | 26 | 26 | 2 | 7.7% | 15.77 | 1.38 | 26 | 1.45 | +£8.00 | 30.8% |
| 20–<33/1 | T1 | 13 | 13 | 0 | 0.0% | 23.77 | 0.43 | 13 | 0.00 | −£13.00 | -100.0% |
| 20–<33/1 | T2 | 14 | 14 | 1 | 7.1% | 23.57 | 0.48 | 14 | 2.10 | +£9.00 | 64.3% |
| 33/1+ | T1 | 4 | 4 | 0 | 0.0% | 65.25 | 0.07 | 4 | 0.00 | −£4.00 | -100.0% |
| 33/1+ | T2 | 7 | 7 | 0 | 0.0% | 68.43 | 0.10 | 7 | 0.00 | −£7.00 | -100.0% |

#### CHASE

| Band | Rank | Selections | Settled | Wins | Strike | Mean SP (dec.) | SP E | Market n | Market A/E | £1 P/L | ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 8–<12/1 | T1 | 9 | 9 | 1 | 11.1% | 10.56 | 0.73 | 9 | 1.37 | +£1.00 | 11.1% |
| 8–<12/1 | T2 | 15 | 15 | 0 | 0.0% | 10.63 | 1.20 | 15 | 0.00 | −£15.00 | -100.0% |
| 12–<20/1 | T1 | 4 | 4 | 0 | 0.0% | 14.50 | 0.24 | 4 | 0.00 | −£4.00 | -100.0% |
| 12–<20/1 | T2 | 7 | 7 | 0 | 0.0% | 16.14 | 0.39 | 7 | 0.00 | −£7.00 | -100.0% |
| 20–<33/1 | T1 | 0 | 0 | 0 | — | — | 0.00 | 0 | — | — | — |
| 20–<33/1 | T2 | 2 | 2 | 0 | 0.0% | 24.50 | 0.07 | 2 | 0.00 | −£2.00 | -100.0% |
| 33/1+ | T1 | 2 | 2 | 0 | 0.0% | 37.50 | 0.04 | 2 | 0.00 | −£2.00 | -100.0% |
| 33/1+ | T2 | 3 | 3 | 0 | 0.0% | 55.33 | 0.05 | 3 | 0.00 | −£3.00 | -100.0% |

## Which inputs put outsiders in the top two?

For each current 8/1+ selection, I subtracted the frozen T3 runner's contribution feature by feature. This measures the margin over the top-two boundary even if the selected runner was T1. Each missingness flag travels with its base input in the grouped comparison. “Largest positive block” counts only the biggest positive block per selection. An omission count measures whether a full-field rerank moves the original selection below T2. Several omissions can affect the same runner. The family table lists omission rows with at least two such changes, and its individual-term column shows up to five of the most frequent leaders.

- **Turf V4.** The 95-column Turf V3 base uses Turf Speed, weight-adjusted Performance and Today's Rating, OR, connections, horse history, racecard and comment fields. Its extra terms are **+0.181532** for Best L3 Speed rank 2–3, **−0.269154** when that rank is missing and **+0.219268** per unit of same-OR Speed gap. The gap is the difference from the mean usable Speed of equal-OR rivals divided by ten, or zero if no comparison exists. Comments and connections usually supplied the largest edge here. Circus Of Rome shows how real Speed and Performance evidence combines with the favourable same-OR adjustment. This current Turf sample covers eight books from one day.
- **AW V3.** The analogous 95-column AW V2 base uses AW figures even where inherited columns say `turf_speed`. For the base Flat ratings, Performance adjusts historical Speed by historical weight relative to 168 lb, and Today's Rating then deducts the target weight relative to 168 lb. AW also uses the log count of timed same-material starts over 365 days and a shrunk matching-material Performance delta from up to five recent AW slots. Its three added slopes are **+0.168112** for ranks 2–3, **+0.308468** for a missing rank and **−0.333090** per same-OR Speed-gap unit. The latter increases the score of the slower rated equal-OR horse. Connections and comments often led, but the added terms materially shaped which outsiders reached T1/T2. AW material omitted alone changed four of the 76.
- **Hurdle V2.** Comments and connections supplied the largest positive margin in 55 of 71 cases. The effective slopes of the six adjustments are **+0.011176** for Speed rank 2–3, **+0.008279** for missing rank, **−0.293052** for recent non-completion, **−0.168634** for latest PU, **+0.119072** per unit of completion fraction and **−0.110171** for missing completion history. The completion terms can improve a horse's relative rank by reducing the scores of rivals. Party Vibes is one example. Avatar Jet shows that the base can also elevate a runner with zero usable Jump Speed when participant and comment evidence dominates.
- **Chase V2.** The promoted Chase Shadow coefficients apply to the Jump vector. The four generation weights are **exactly zero**, including both explicit Jump Speed reliability terms. Connections, age/weight and comments supplied the largest positive block for every observed Chase outsider. The age coefficient is about **−0.114 score units per year**, which explains some of the measured age effects. Getawhisky illustrates the strength of participant priors even where the horse already had three usable figures.

Historical distance and going influence the rating engines. Target class, distance, field size and going indicators are common across a complete race, so they supply no direct rank advantage when they have identical values. The live models also use runner-specific OR and weight and the Flat models use draw. A spread between recent Speed figures can affect latest/best/average inputs, but there is no distinct consistency or recent-improvement bonus. The direction of a fitted comment coefficient describes the model's arithmetic. In particular, a positive `racedFreely` term in an individual comparison does not establish that racing freely is an advantage. [Frozen family artifacts](../data/research/tissue-generation-2026-11-manifest.json) · [Family adjustments](../src/lib/racing/tissue-generation-features.ts) · [AW material features](../src/lib/racing/aw-tissue-v2-features.ts) · [Flat weight adjustment](../src/lib/racing/weight-performance.ts)

| Family | n | Largest positive block vs T3 | Most frequent leading individual terms | Top two lost after omission |
| --- | --- | --- | --- | --- |
| TURF | 8 | Comments 4, Connections 3, Generation 1 | jockey_prior_rate 2, last_strongFinish 1, last_weakened 1, last3_led_count 1, last3_weakened_count 1 | Connections 4, Comments 2, Generation 2, Performance/Today's Rating 2 |
| AW | 76 | Connections 27, Comments 23, Generation 19, Age/weight 3, Performance/Today's Rating 2, Experience/recency 1, OR 1 | speed_rank_missing 17, trainer_prior_rate 11, same_or_speed_gap 10, jockey_prior_rate 8, weight_lbs 7 | Connections 33, Generation 33, Comments 32, speed_rank_missing 18, same_or_speed_gap 17, Age/weight 11, Performance/Today's Rating 11, speed_rank_2_3 7, Race conditions/draw 5, Speed 5, AW material 4 |
| HURDLE | 71 | Comments 30, Connections 25, OR 6, Speed 5, Age/weight 4, Experience/recency 1 | jockey_prior_rate 14, trainer_prior_rate 8, last_led 7, last3_eased_count 7, last3_racedFreely_count 7 | Comments 35, Connections 31, Speed 11, Age/weight 10, Generation 8, OR 7, Experience/recency 6, completed_last3_fraction 5, latest_pulled_up 2 |
| CHASE | 30 | Connections 16, Age/weight 7, Comments 7 | age 6, jockey_prior_rate 6, last_stayedOn 3, log_jockey_prior_runs 3, last_eased 2 | Connections 15, Comments 11, Age/weight 8, Experience/recency 5, Speed 4 |

| Family / outcome | n | Verified history n | Mean eligible prior runs | Usable L3 Speed 0 / 1 / 2 / 3 | Median best–mean Speed (2+ figures) | Any missing / mean flags | Median gap to next | Mean SP market p | Mean model minus SP |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| All wins | 12 | 12 | 9.58 | 1 / 2 / 2 / 7 | 8.24 | 6 / 1.42 | 0.084 | 6.90% | +6.66 pp |
| All losses | 173 | 169 | 11.57 | 37 / 35 / 56 / 41 | 8.51 | 101 / 2.21 | 0.156 | 5.75% | +9.62 pp |
| TURF wins | 0 | 0 | — | 0 / 0 / 0 / 0 | — | 0 / — | — | — | — |
| TURF losses | 8 | 7 | 12.86 | 0 / 1 / 4 / 2 | 6.40 | 1 / 0.13 | 0.129 | 5.49% | +7.30 pp |
| AW wins | 4 | 4 | 3.75 | 1 / 1 / 1 / 1 | 4.19 | 2 / 3.25 | 0.138 | 6.94% | +7.69 pp |
| AW losses | 72 | 70 | 15.43 | 31 / 16 / 16 / 7 | 3.59 | 47 / 4.25 | 0.153 | 5.75% | +8.99 pp |
| HURDLE wins | 4 | 4 | 13.00 | 0 / 1 / 0 / 3 | 8.24 | 2 / 0.50 | 0.042 | 6.35% | +6.29 pp |
| HURDLE losses | 67 | 66 | 8.36 | 6 / 12 / 23 / 25 | 12.71 | 43 / 0.94 | 0.170 | 5.56% | +10.09 pp |
| CHASE wins | 4 | 4 | 12.00 | 0 / 0 / 1 / 3 | 14.71 | 2 / 0.50 | 0.082 | 7.41% | +6.01 pp |
| CHASE losses | 26 | 26 | 9.00 | 0 / 6 / 13 / 7 | 7.66 | 10 / 0.50 | 0.127 | 6.35% | +10.84 pp |

| Outcome | n | Largest positive block vs T3 | Top two lost after omission |
| --- | --- | --- | --- |
| Winners | 12 | Connections 7, Comments 3, Age/weight 1, Generation 1 | Connections 8, Age/weight 4, Comments 4, Experience/recency 3, completed_last3_fraction 1, Generation 1, OR 1, Performance/Today's Rating 1, Speed 1, speed_rank_2_3 1, speed_rank_missing 1 |
| Losers | 173 | Connections 64, Comments 61, Generation 19, Age/weight 13, OR 7, Speed 5, Experience/recency 2, Performance/Today's Rating 2 | Comments 76, Connections 75, Generation 42, Age/weight 25, Speed 19, speed_rank_missing 19, same_or_speed_gap 18, Performance/Today's Rating 12, Experience/recency 10, speed_rank_2_3 8, OR 7, Race conditions/draw 5, AW material 4, completed_last3_fraction 4, latest_pulled_up 2, completion_history_missing 1, recent_non_completion 1 |

### Earlier versions with reproducible scores

The whole-field saved probabilities were also reproduced within `1e-12` for **152 Turf V3, 200 AW V1, 188 AW V2, 200 Chase Jump V1 and 338 Hurdle Jump V1 books**. Against frozen T3, the largest contributor for archived outsiders was connections in **34/68** Turf V3, **42/76** AW V1 and **30/77** AW V2 cases. Comments led **19/68** Turf V3 and **27/77** AW V2 cases. Speed led **14/76** AW V1 cases. Under Jump V1, comments led **18/42** Chase cases versus **14/42** for connections, and Hurdle split **55/131** each for comments and connections. The 210 priced Turf V1/V2 outsiders retain original ranks. Their results were joined from the terminal field. Those earlier Turf archives lack the saved model input vectors needed for exact attribution.

### Winners and losers

The history table above counts usable family-specific Speed figures in the last three eligible **timed** history slots. A run on another code can take up a slot while supplying no usable family figure. A history reconstruction is counted only when its eligible-run count and its Best and Average L3 Speed match the frozen inputs. Four losing selections fail this check and are excluded only from the history columns. Best minus mean is a measure of how far the peak stands above the usable L3 average among horses with at least two figures. It cannot measure the spread for a one-figure history.

Seven of twelve current winners had three usable recent figures, versus 41 of 169 comparable losses. Only three of the twelve winners had zero or one usable figure, versus 72 of 169 losers. The best-minus-mean medians were similar overall. Hurdle and Chase show more three-figure histories among the winners, with only four winners in each family. AW's winning group also includes Xirivella with no usable AW Speed. The winners averaged fewer eligible career runs pooled across the families, so the recent coverage pattern is more specific than career experience. Frozen missingness was less frequent among winners overall, while Chase winners and losers had identical mean flags.

The historical winners had **smaller** median score gaps to the next-ranked horse and less model-to-market disagreement than the losers. This is a result within the 8/1+ group, whose losers were also longer priced on average. Chase and Hurdle losers had the largest average probability gaps, **+10.84 pp** and **+10.09 pp** versus normalized SP. Connections led seven winning attributions. The Generation block led 19 losing attributions but only one winning attribution, Nineteen of those 20 cases were in AW. Across all current outsider ranks, omitting the AW missing-Speed-rank term removed 18 from T1/T2 and omitting its same-OR term removed 17. The omissions overlap. Removing the missing-Speed term also displaced an actual winner. These are diagnostics on the same observed books and the winner counts are small.

## Representative race examples

The following six races supplement Warwick and cover every current family. Two winning selections illustrate observed Speed or strong connections. A third winning selection illustrates the risk of equating missing Speed with weak winning prospects. The three losses expose different mechanisms, with three at 33/1 or greater. The earlier-run entries are listed **newest first**, formatted as date, course, finish or status, and family Speed. A dash means the slot had no usable figure. Each written explanation uses the point-in-time evidence which reconciled to the frozen aggregates. Result and SP are listed separately for evaluation. Full-field omissions use the Warwick method above.

### Leading Times · Southwell 17:30, 2026-11-07

**AW · AW_TISSUE_V3 · T2.** Frozen score 0.717191, probability 10.6965%. Final SP 16/1 (market rank 7), result won.

Race `7efde834-ac5c-42d1-b13c-a492edd9cdd0` and runner `fc56ffbc-85ad-40c9-8eea-f193f5c6bdb5`. 4 eligible prior timed runs. Recent slots were 2026-10-16 Newcastle 6 103.403, 2026-09-24 Southwell 1 90.775, 2025-11-25 Wolverhampton 2 106.088 .

**Why T2.** Three usable AW figures from four eligible horse runs supplied a real base Performance and Today's Rating advantage over South Shore. Comments (+0.235) and age/weight (+0.172) led the margin against T3. The AW generation block as a whole favoured South Shore, who received the missing-rank benefit. Leading Times did receive the individual +0.168 rank-2/3 term. Omitting comments, weight/age, Performance/Today's Rating or the individual rank-2/3 term moved the selection below T2. Without the entire generation block he remained T2 because the two Speed-rank terms offset across rivals. His 16/1 win illustrates how several measured inputs and competing adjustments can coexist.

| Omitted from every runner | Score | Rank | Top two | Model p | Change |
| --- | --- | --- | --- | --- | --- |
| OR | 0.566509 | T2 | Yes | 10.628% | −0.068 pp |
| Performance/Today's Rating | 0.575885 | T3 | No | 10.003% | −0.693 pp |
| Speed | 0.689353 | T2 | Yes | 10.566% | −0.131 pp |
| Connections | 0.545459 | T2 | Yes | 10.193% | −0.503 pp |
| Experience/recency | 0.694789 | T2 | Yes | 10.746% | +0.049 pp |
| Age/weight | 0.617383 | T3 | No | 9.834% | −0.863 pp |
| Race conditions/draw | 0.803429 | T2 | Yes | 11.295% | +0.598 pp |
| AW material | 0.720872 | T2 | Yes | 10.666% | −0.031 pp |
| Comments | 0.558061 | T5 | No | 8.436% | −2.260 pp |
| Generation | 0.682982 | T2 | Yes | 10.704% | +0.007 pp |
| speed_rank_2_3 | 0.580291 | T4 | No | 9.417% | −1.279 pp |
| speed_rank_missing | 0.819882 | T2 | Yes | 12.097% | +1.401 pp |
| same_or_speed_gap | 0.717191 | T2 | Yes | 10.692% | −0.004 pp |

### Getawhisky · Bangor-on-Dee 13:00, 2026-11-11

**CHASE · CHASE_TISSUE_V2 · T2.** Frozen score 0.903003, probability 14.6189%. Final SP 17/2 (market rank 7), result won.

Race `29ebd02a-57a7-45e1-b96e-5660c2198a72` and runner `e6fec6f0-c709-4cbb-849d-11ef60dcaaaa`. 9 eligible prior timed runs. Recent slots were 2026-10-16 Uttoxeter 2 71.275, 2026-03-21 Newbury 5 117.328, 2026-02-17 Market Rasen 4 104.608 .

**Why T2.** Three usable Jump Speed figures provide history, but the aggregate Speed block gave away 0.053 to Merely A Detail. The connections block supplied +0.534 to the comparison, including jockey prior win rate of 27.00% versus 15.86% (+0.233) and substantially larger participant samples. Age/weight and comments worked against the selection relative to T3. She fell to T5 when connections were omitted and stayed T2 without Speed. All Chase generation weights are zero.

| Omitted from every runner | Score | Rank | Top two | Model p | Change |
| --- | --- | --- | --- | --- | --- |
| OR | 0.887018 | T2 | Yes | 14.695% | +0.076 pp |
| Speed | 0.874748 | T2 | Yes | 14.936% | +0.317 pp |
| Connections | 0.157028 | T5 | No | 10.457% | −4.162 pp |
| Experience/recency | 0.891970 | T2 | Yes | 14.012% | −0.607 pp |
| Age/weight | 0.700497 | T2 | Yes | 14.223% | −0.396 pp |
| Race conditions/draw | 0.903003 | T2 | Yes | 14.619% | +0.000 pp |
| Comments | 1.003754 | T1 | Yes | 18.911% | +4.292 pp |
| Generation | 0.903003 | T2 | Yes | 14.619% | +0.000 pp |
| speed_rank_2_3 | 0.903003 | T2 | Yes | 14.619% | +0.000 pp |
| speed_rank_missing | 0.903003 | T2 | Yes | 14.619% | +0.000 pp |
| usable_jump_speed_last3 | 0.903003 | T2 | Yes | 14.619% | +0.000 pp |
| usable_jump_speed_missing | 0.903003 | T2 | Yes | 14.619% | +0.000 pp |

### Hitched · Chelmsford City 16:15, 2026-11-05

**AW · AW_TISSUE_V3 · T2.** Frozen score 0.760423, probability 14.1749%. Final SP 33/1 (market rank 10), result finished 8.

Race `760cb413-2815-416c-9b1b-656c490530da` and runner `f59f9091-fcbe-4d85-b172-c24777f84ec4`. 38 eligible prior timed runs. Recent slots were 2026-10-14 Kempton 8 88.938, 2026-06-18 Yarmouth 6 —, 2026-05-30 Lingfield 6 — .

**Why T2.** Only one of his three recent slots provided usable AW Speed, **88.938**. He shared OR 71 with The Hare Rail, whose Best L3 was **115.612**. The frozen same-OR input was **−2.667387**, so the negative coefficient gave Hitched **+0.888479** score. The same term gave a +0.512 edge over T3 Sea Founder. Connections, weight/age and Speed all worked against him in that comparison. Dropping the term alone sent him to **T9**. This is the example most directly dependent on a single adjustment.

| Omitted from every runner | Score | Rank | Top two | Model p | Change |
| --- | --- | --- | --- | --- | --- |
| OR | 0.646255 | T2 | Yes | 14.299% | +0.124 pp |
| Performance/Today's Rating | 0.739701 | T2 | Yes | 15.001% | +0.826 pp |
| Speed | 0.781455 | T2 | Yes | 14.675% | +0.500 pp |
| Connections | 0.529315 | T1 | Yes | 13.425% | −0.749 pp |
| Experience/recency | 0.725464 | T2 | Yes | 14.105% | −0.070 pp |
| Age/weight | 0.759052 | T1 | Yes | 15.839% | +1.664 pp |
| Race conditions/draw | 0.791029 | T2 | Yes | 14.467% | +0.292 pp |
| AW material | 0.729830 | T2 | Yes | 13.958% | −0.217 pp |
| Comments | 1.135857 | T1 | Yes | 17.555% | +3.380 pp |
| Generation | 0.005847 | T8 | No | 5.861% | −8.314 pp |
| speed_rank_2_3 | 0.791634 | T1 | Yes | 14.740% | +0.565 pp |
| speed_rank_missing | 0.863114 | T2 | Yes | 14.410% | +0.235 pp |
| same_or_speed_gap | -0.128056 | T9 | No | 5.396% | −8.779 pp |

### Circus Of Rome · Doncaster 15:25, 2026-11-07

**TURF · TURF_TISSUE_V4 · T2.** Frozen score 1.617948, probability 9.9084%. Final SP 33/1 (market rank 12), result finished 6.

Race `d0c864df-2ed8-4f6a-ab5e-4b90df335460` and runner `a8dfbabd-2c1d-4fdc-8930-ab7e357d79c9`. 16 eligible prior timed runs. Recent slots were 2026-10-20 Newcastle 3 —, 2026-09-24 Pontefract 2 118.140, 2026-08-22 York 16 94.947 .

**Why T2.** Pontefract's **118.140** and York's **94.947** supported his Turf Speed. His latest timed slot was a Newcastle run with no usable Turf figure. The strong recent Performance and Today's Rating block added +0.222 versus Nobody Knows. His OR-94 comparison group gave him a **+1.447445** gap input and he qualified for the rank-2/3 bonus. Together those generation terms added about +0.341 versus T3, offsetting much of a −0.561 connections deficit. Removing the same-OR term or the full adjustment dropped him to T4. Removing Performance/Today's Rating or the rank-2/3 term dropped him to T3.

| Omitted from every runner | Score | Rank | Top two | Model p | Change |
| --- | --- | --- | --- | --- | --- |
| OR | 1.438072 | T2 | Yes | 9.915% | +0.007 pp |
| Performance/Today's Rating | 1.419141 | T3 | No | 8.744% | −1.165 pp |
| Speed | 1.500811 | T2 | Yes | 9.398% | −0.510 pp |
| Connections | 1.229132 | T1 | Yes | 9.908% | −0.000 pp |
| Experience/recency | 1.554461 | T3 | No | 9.326% | −0.583 pp |
| Age/weight | 1.666719 | T2 | Yes | 9.601% | −0.308 pp |
| Race conditions/draw | 1.637183 | T2 | Yes | 9.871% | −0.037 pp |
| Comments | 1.393984 | T1 | Yes | 9.075% | −0.833 pp |
| Generation | 1.104078 | T4 | No | 6.301% | −3.607 pp |
| speed_rank_2_3 | 1.468911 | T3 | No | 8.435% | −1.473 pp |
| speed_rank_missing | 1.570493 | T2 | Yes | 9.908% | −0.000 pp |
| same_or_speed_gap | 1.300570 | T4 | No | 7.436% | −2.472 pp |

### Avatar Jet · Uttoxeter 12:15, 2026-11-07

**HURDLE · HURDLE_TISSUE_V2 · T2.** Frozen score 0.650772, probability 15.5200%. Final SP 250/1 (market rank 9), result pulled up.

Race `0238e109-7d6a-430c-a029-fed71fca4683` and runner `4da59865-386c-415b-bbb5-12afb8baf193`. 18 eligible prior timed runs. Recent slots were 2026-10-17 Southwell 11 —, 2026-09-26 Southwell 7 —, 2026-09-14 Thirsk 6 — .

**Why T2.** The last three slots were Flat races with zero usable Jump figures. His jockey prior was **40.91% from 22 runs** compared with Lunar Trix's **15.31% from 528**. The rate alone added +0.814 versus T3. The count term took back 0.238 and the trainer-rate term took back another 0.375. The overall connections (+0.245), comment (+0.272) and recency/experience (+0.138) blocks outweighed the Speed deficit (−0.381). Omitting connections or comments made him T3, while omitting the whole generation adjustment left him T2. At 250/1 his normalized final-SP probability was **0.3225%**, versus **15.5200%** in the frozen model.

| Omitted from every runner | Score | Rank | Top two | Model p | Change |
| --- | --- | --- | --- | --- | --- |
| OR | 0.961791 | T1 | Yes | 16.972% | +1.452 pp |
| Speed | 0.877725 | T2 | Yes | 17.899% | +2.379 pp |
| Connections | 0.040673 | T3 | No | 10.742% | −4.778 pp |
| Experience/recency | 0.588553 | T2 | Yes | 14.391% | −1.129 pp |
| Age/weight | 0.614043 | T2 | Yes | 15.934% | +0.414 pp |
| Race conditions/draw | 0.650772 | T2 | Yes | 15.520% | −0.000 pp |
| Comments | 0.223211 | T3 | No | 10.843% | −4.677 pp |
| Generation | 0.598634 | T2 | Yes | 14.945% | −0.575 pp |
| speed_rank_2_3 | 0.653180 | T2 | Yes | 15.540% | +0.020 pp |
| speed_rank_missing | 0.644100 | T2 | Yes | 15.440% | −0.080 pp |
| recent_non_completion | 0.641701 | T2 | Yes | 15.520% | −0.000 pp |
| latest_pulled_up | 0.639730 | T2 | Yes | 15.520% | −0.000 pp |
| completed_last3_fraction | 0.632060 | T2 | Yes | 15.261% | −0.259 pp |
| completion_history_missing | 0.641722 | T2 | Yes | 15.281% | −0.239 pp |

### Xirivella · Dundalk 20:00, 2026-11-13

**AW · AW_TISSUE_V3 · T2.** Frozen score 0.886527, probability 16.0000%. Final SP 9/1 (market rank 5), result won.

Race `48acef2a-141d-4a8a-9ace-ba32cbf59e4f` and runner `0114c147-375b-416f-8203-23fe85524c51`. 6 eligible prior timed runs. Recent slots were 2026-10-05 Killarney 1 —, 2026-10-01 Bellewstown 2 —, 2026-09-15 Punchestown 5 — .

**Why T2.** Six eligible prior timed runs included a Killarney win and a Bellewstown second. None of the three recent slots supplied a usable AW figure. Relative to Unterberg, the largest positive blocks were connections (+0.310), comments (+0.222) and generation (+0.140). Unterberg's observed AW Performance and Today's Rating pushed back by 0.284. Omitting the missing-Speed term alone dropped Xirivella to T4, and connections alone to T5. Omitting the full generation block left him T2 because neighbouring runners lost other terms too. Xirivella's win and Hitched's loss illustrate why individual outcomes cannot validate an adjustment.

| Omitted from every runner | Score | Rank | Top two | Model p | Change |
| --- | --- | --- | --- | --- | --- |
| OR | 0.740409 | T2 | Yes | 16.252% | +0.252 pp |
| Performance/Today's Rating | 0.918088 | T1 | Yes | 18.537% | +2.537 pp |
| Speed | 0.888289 | T2 | Yes | 16.406% | +0.406 pp |
| Connections | 0.490902 | T5 | No | 10.229% | −5.771 pp |
| Experience/recency | 0.869396 | T2 | Yes | 16.067% | +0.067 pp |
| Age/weight | 0.983165 | T1 | Yes | 17.566% | +1.566 pp |
| Race conditions/draw | 0.864940 | T2 | Yes | 15.558% | −0.442 pp |
| AW material | 0.886827 | T2 | Yes | 15.867% | −0.133 pp |
| Comments | 0.624763 | T3 | No | 14.358% | −1.642 pp |
| Generation | 0.711962 | T2 | Yes | 14.388% | −1.612 pp |
| speed_rank_2_3 | 0.917739 | T2 | Yes | 16.879% | +0.879 pp |
| speed_rank_missing | 0.680750 | T4 | No | 13.057% | −2.943 pp |
| same_or_speed_gap | 0.886527 | T2 | Yes | 16.515% | +0.515 pp |

## What the evidence supports

**Preserve usable prior form across finishing positions.** Party Vibes had two independent figures above 102 and three usable figures overall. Her base Speed advantage over Easy To Follow came from timed form in Chases, including a fifth place whose clock rating was stronger than the bare result. Leading Times brought three usable AW figures and a Performance edge. Getawhisky illustrates a separate route through participant history. A blanket price rule would remove these signals together with rankings driven by sparse evidence.

**Investigate the strength of the weakest signals.** AW's missing-rank coefficient grants **+0.308468** relative to a runner with an observed rank. Its negative same-OR coefficient rewarded Hitched's lower observed Speed directly. The jump base can learn disproportionately from a high participant rate on a small denominator, as Avatar Jet shows. The Fontwell comment/result disagreement and Party Vibes' sensitivity to the comment count also show how an upstream text inconsistency can enter a near tie. The current 20/1+ results suggest probability overstatement by the model in this sample. The rank and probability issue is about the evidence supporting extreme claims, and the retrospective bands are insufficient to estimate a reliable cutoff.

**One small isolated adjustment merits further investigation.** A future predeclared AW V3 comparison could zero the missing-Speed-rank coefficient alone while retaining all base missing flags, fitted parameters and other adjustment columns. The existing isolated AW diagnostic already tested that removal on the November books and found mixed rank and probability results across periods. The follow-up worth doing is on fresh prospective books. Assess full-field log loss, calibration by Speed availability and top-two identity changes across the full price range, including horses such as Xirivella. Hitched illustrates a distinct same-OR mechanism whose direction warrants scrutiny, but the existing isolated same-OR results are mixed. The evidence supports leaving the production models as they stand. [Existing isolated AW diagnostic](aw-v3-isolated-adjustment-diagnostic.md)

### Verification

The current model checksums, saved feature schemas and all **4,117** runner scores were checked against the original **413** field books. The reconstructed probabilities agreed to a maximum absolute difference of **1.67 × 10⁻¹⁶**, and all ranks matched. Final SP was joined independently in a read-only database transaction and runner-level results were checked before the monetary calculations. The three targeted production test files passed **27 tests** across generation capture, final-SP reconciliation and canonical settlement. The original input values and comparisons are traceable through the linked model artifacts, repository functions and runner IDs in the inventory. The history checks rely on current source records bounded at the original historical cutoff, since the frozen ledger contains the vectors and does not retain the original raw database snapshot.

## Selection inventory

The rows below are one per frozen primary model/race/runner selection with a verified canonical v3 settlement at final SP of 8/1 or longer. Times are scheduled UTC. A non-numeric result denotes a started non-finisher. Cohort totals can be recovered from these rows using the boundaries above.

<details>
<summary>Current primary books — all priced outsider selections</summary>

| Date | Course / UTC off | Family / model | Horse | Rank | Frozen p | Final SP | SP rank | Result | £1 P/L | Race ID | Runner ID |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-11-05 | Newbury 12:42 | HURDLE / HURDLE_TISSUE_V2 | Cave Bridge | T2 | 11.027% | 11/1 | 4 | 6 | −£1.00 | c0b239d8-724b-48ef-b7c5-c4b3f140f547 | 797c76e2-3895-43f0-9215-305e8fe4530b |
| 2026-11-05 | Newbury 13:17 | HURDLE / HURDLE_TISSUE_V2 | Octo Gane | T2 | 18.089% | 11/1 | 4 | 2 | −£1.00 | c6acb4b7-3b2a-4580-9c35-a7204d8c3498 | 88fd748a-66f3-4c8b-8153-766c00a73fb0 |
| 2026-11-05 | Clonmel 13:25 | HURDLE / HURDLE_TISSUE_V2 | Carleys Lilly | T1 | 19.691% | 22/1 | 6 | 10 | −£1.00 | 346ed8a8-3442-4bd3-bfd5-e74f0c73fa44 | 07a3a304-6d2f-4082-add6-a140bcec4da3 |
| 2026-11-05 | Newcastle 13:34 | HURDLE / HURDLE_TISSUE_V2 | President Scottie | T1 | 16.068% | 11/1 | 7 | 6 | −£1.00 | 5397ac44-cb2f-46ad-981c-be56b782e0dc | b886d9b3-b392-44fe-bc62-292f1edc47a4 |
| 2026-11-05 | Newbury 13:52 | HURDLE / HURDLE_TISSUE_V2 | The Flaggy Shore | T2 | 12.669% | 11/1 | 4 | 2 | −£1.00 | 69ca95d3-727f-4e78-b3b4-3546b05c992e | e0334602-d032-4fe8-a0ce-363ff95c35d8 |
| 2026-11-05 | Chelmsford City 13:57 | AW / AW_TISSUE_V3 | Bennyworth | T2 | 12.123% | 11/1 | 6 | 11 | −£1.00 | b7d2cdb4-2dbe-4767-a39e-5aff835c8e09 | 3725625e-bf9f-4cce-8673-ba15295bd6de |
| 2026-11-05 | Plumpton 14:47 | HURDLE / HURDLE_TISSUE_V2 | Nicolai | T2 | 24.573% | 50/1 | 4 | 4 | −£1.00 | 8a6a2b10-974b-4ede-8a0a-c50737bb42ba | 9d4569c6-9e31-4f59-82d3-6799afa4b9a7 |
| 2026-11-05 | Newbury 14:58 | HURDLE / HURDLE_TISSUE_V2 | Grand Teton | T1 | 16.221% | 8/1 | 4 | 8 | −£1.00 | 9e2f6a4b-c32e-4315-be8f-ef26a854060e | 19f668d3-46af-4a1d-a5aa-09b18955b3e4 |
| 2026-11-05 | Southwell 15:28 | AW / AW_TISSUE_V3 | Ey Up He's A Star | T2 | 11.331% | 8/1 | 4 | 9 | −£1.00 | 5e22cc6b-4786-423a-9aa0-5bec723aadc7 | f66e4ab1-b035-445d-a90d-e6f6675a158f |
| 2026-11-05 | Clonmel 15:45 | CHASE / CHASE_TISSUE_V2 | Courtbrack Boy | T1 | 10.922% | 9/1 | 5 | 1 | +£9.00 | 094598b9-dd6d-49d9-8e3a-a9ad50423748 | ad4a2be5-8d31-4919-8175-4a0eb1bf9b52 |
| 2026-11-05 | Clonmel 15:45 | CHASE / CHASE_TISSUE_V2 | Bruise Hill | T2 | 10.626% | 17/2 | 4 | 13 | −£1.00 | 094598b9-dd6d-49d9-8e3a-a9ad50423748 | 84f38af0-a270-4b7e-9f26-db1aab1c6b57 |
| 2026-11-05 | Chelmsford City 16:15 | AW / AW_TISSUE_V3 | Nakaaha | T1 | 15.829% | 10/1 | 4 | 7 | −£1.00 | 760cb413-2815-416c-9b1b-656c490530da | 7b8cc36c-df44-4e4f-a6d3-a19c96566f59 |
| 2026-11-05 | Chelmsford City 16:15 | AW / AW_TISSUE_V3 | Hitched | T2 | 14.175% | 33/1 | 10 | 8 | −£1.00 | 760cb413-2815-416c-9b1b-656c490530da | f59f9091-fcbe-4d85-b172-c24777f84ec4 |
| 2026-11-05 | Southwell 16:30 | AW / AW_TISSUE_V3 | Forbidden Colours | T1 | 18.545% | 11/1 | 7 | 3 | −£1.00 | a6a85441-2156-4891-807b-6e0b6d63d191 | 78a4efa7-b1df-4152-915d-5ccb5cdc61f3 |
| 2026-11-05 | Southwell 17:00 | AW / AW_TISSUE_V3 | Thai Baht | T1 | 19.374% | 9/1 | 5 | 1 | +£9.00 | f9db519f-2fb9-42e7-b05c-d73e22a00db1 | aa6d9da7-fc0e-4148-868c-2e82f2afe6c4 |
| 2026-11-05 | Southwell 17:00 | AW / AW_TISSUE_V3 | Dream On Kent | T2 | 11.712% | 9/1 | 5 | 11 | −£1.00 | f9db519f-2fb9-42e7-b05c-d73e22a00db1 | 1ce9a3e4-30ef-467e-9635-e50657635140 |
| 2026-11-05 | Chelmsford City 17:15 | AW / AW_TISSUE_V3 | Kigali | T1 | 23.478% | 9/1 | 5 | 4 | −£1.00 | aed35031-a623-4451-bc44-992c91d65d44 | 67c65825-eb4b-4a0b-aa74-61133e7bdbc9 |
| 2026-11-05 | Southwell 18:00 | AW / AW_TISSUE_V3 | Jellystone Park | T2 | 18.626% | 9/1 | 5 | 3 | −£1.00 | 4a5cae48-550f-4fa3-930e-f3ea617ef0e0 | 05756066-a90e-443b-827d-a1585fe13684 |
| 2026-11-05 | Southwell 18:30 | AW / AW_TISSUE_V3 | Stanley Spencer | T1 | 19.078% | 10/1 | 6 | 6 | −£1.00 | 7e34d3ce-5d0f-4e63-8c07-d6f6e281149b | 442e652d-a79f-4204-971d-6b0f1d7cf1bd |
| 2026-11-06 | Hexham 12:25 | CHASE / CHASE_TISSUE_V2 | Ask A Sainte | T2 | 16.372% | 28/1 | 7 | 3 | −£1.00 | 836243d6-c6cf-4a6f-83d0-8b461a8f83b1 | 5f564302-8189-4d9e-b761-156212642262 |
| 2026-11-06 | Fontwell 12:50 | HURDLE / HURDLE_TISSUE_V2 | Max D'airy | T2 | 15.794% | 18/1 | 5 | 2 | −£1.00 | 28e754c5-cec8-4a6e-98a3-4f1dd4430004 | 77e86464-f848-416b-8eab-903a320ddd1e |
| 2026-11-06 | Aintree 13:50 | HURDLE / HURDLE_TISSUE_V2 | Manuelito | T1 | 26.527% | 17/2 | 5 | 4 | −£1.00 | 6e2d0fcc-74f7-4b7c-98a7-c3d5522b2681 | f4f382a8-3d38-418f-9ec8-bd831c8bcf70 |
| 2026-11-06 | Fontwell 14:35 | HURDLE / HURDLE_TISSUE_V2 | Donnie Azoff | T2 | 15.394% | 12/1 | 6 | 7 | −£1.00 | 2c6a8cfa-6af1-43d7-a413-4996127f8c94 | b1b825db-6459-458f-a679-335083ba0a29 |
| 2026-11-06 | Newcastle 14:53 | AW / AW_TISSUE_V3 | Sovereign View | T1 | 19.297% | 14/1 | 9 | 10 | −£1.00 | 1edeec58-bdb8-4aea-bde7-c213be579731 | 6932874a-863d-4987-a74e-2c7e41ebfa8b |
| 2026-11-06 | Aintree 15:00 | CHASE / CHASE_TISSUE_V2 | Stencil | T1 | 25.950% | 17/2 | 5 | 6 | −£1.00 | 787f0481-36eb-400c-99cc-8a7e1f484bc5 | 24e701cd-81a6-408d-983e-a878f5ba218e |
| 2026-11-06 | Fontwell 15:10 | CHASE / CHASE_TISSUE_V2 | My Own Lovely Lee | T2 | 20.839% | 11/1 | 4 | 3 | −£1.00 | 3c5952f5-3501-4fd6-a041-e914025fc203 | 943c99d9-1dca-4557-a3a2-abe48b55f1a9 |
| 2026-11-06 | Fontwell 15:43 | HURDLE / HURDLE_TISSUE_V2 | Mystical Mabel | T2 | 10.867% | 20/1 | 8 | 6 | −£1.00 | fc4da69b-ffbc-41ed-a10f-d490b63f60bc | c52aac75-b471-48af-9aca-170fd3fe2acf |
| 2026-11-06 | Aintree 16:05 | HURDLE / HURDLE_TISSUE_V2 | Mia Sunshine | T2 | 14.765% | 18/1 | 5 | 4 | −£1.00 | 69df1381-beed-4dca-95c0-5e8d7061dc7e | 8e031f0b-9faf-4ef9-a88a-a4070e596375 |
| 2026-11-06 | Newcastle 17:30 | AW / AW_TISSUE_V3 | Go Victor | T1 | 15.782% | 11/1 | 8 | 2 | −£1.00 | db4bb32c-e6e5-42df-bd43-1ac32440241e | 7803fd28-b70f-4d9c-8e8b-fd37f3cac939 |
| 2026-11-06 | Newcastle 17:30 | AW / AW_TISSUE_V3 | North West Gal | T2 | 11.821% | 22/1 | 10 | 14 | −£1.00 | db4bb32c-e6e5-42df-bd43-1ac32440241e | ef0d697f-8502-4f75-92a6-463ded73c7ac |
| 2026-11-06 | Dundalk 17:45 | AW / AW_TISSUE_V3 | Bougie Gals | T2 | 14.120% | 16/1 | 4 | 2 | −£1.00 | 82d562ac-d19e-4e2a-a280-7fec80dfe714 | ab21afba-a7d0-44f9-a2d2-ba5590b14b67 |
| 2026-11-06 | Newcastle 18:00 | AW / AW_TISSUE_V3 | Cloch Nua | T2 | 11.604% | 11/1 | 6 | 4 | −£1.00 | bb43150a-6d54-4991-9c0a-61af9bf0d1fa | 57ca5424-0b90-4e9d-9d77-ebcfa32a0afa |
| 2026-11-06 | Dundalk 18:15 | AW / AW_TISSUE_V3 | Pralognan | T2 | 15.991% | 11/1 | 6 | 7 | −£1.00 | 5e3d2eb2-83d0-43f5-a09e-d4b318fa766c | 9becc6f0-9637-4a1c-8de3-9847dcee4a1a |
| 2026-11-06 | Dundalk 18:45 | AW / AW_TISSUE_V3 | White Sand Beach | T1 | 14.975% | 50/1 | 12 | 13 | −£1.00 | a448034b-c079-467f-9f6a-338c622109e1 | cc7bfa87-aae1-4b28-87da-55b2c15c0ec7 |
| 2026-11-06 | Dundalk 18:45 | AW / AW_TISSUE_V3 | Prevalence | T2 | 13.521% | 10/1 | 5 | 7 | −£1.00 | a448034b-c079-467f-9f6a-338c622109e1 | d562d254-f0dc-4ad7-83c4-d8b44969d29f |
| 2026-11-06 | Newcastle 19:00 | AW / AW_TISSUE_V3 | Battenburg Belle | T1 | 15.409% | 16/1 | 10 | 12 | −£1.00 | 73786bd1-b340-4886-b8b9-bb5aa05fb02e | 33f8fd8d-e995-42e0-95db-e07aa105a5c6 |
| 2026-11-06 | Newcastle 19:00 | AW / AW_TISSUE_V3 | Lord Abama | T2 | 10.512% | 12/1 | 7 | 3 | −£1.00 | 73786bd1-b340-4886-b8b9-bb5aa05fb02e | cecceebd-3dd1-4162-beb5-44b36385e437 |
| 2026-11-06 | Dundalk 19:45 | AW / AW_TISSUE_V3 | Spicy Margarita | T2 | 16.561% | 18/1 | 7 | 4 | −£1.00 | 1a6c1d7f-bd6b-48bf-8a6f-648e1c2666d2 | af39b2d4-0bbf-428d-a985-35f6db447ac0 |
| 2026-11-06 | Dundalk 20:15 | AW / AW_TISSUE_V3 | Sayonara | T2 | 13.718% | 25/1 | 8 | 14 | −£1.00 | 2c40739a-4467-46c6-8b01-baece9041c83 | b1da9619-88d7-4cb8-aa2c-1a3bdf6289e6 |
| 2026-11-07 | Uttoxeter 12:15 | HURDLE / HURDLE_TISSUE_V2 | Avatar Jet | T2 | 15.520% | 250/1 | 9 | pulled_up | −£1.00 | 0238e109-7d6a-430c-a029-fed71fca4683 | 4da59865-386c-415b-bbb5-12afb8baf193 |
| 2026-11-07 | Doncaster 12:25 | TURF / TURF_TISSUE_V4 | Bridget's View | T1 | 16.981% | 14/1 | 8 | 2 | −£1.00 | 51931ebe-92db-4649-bc25-2726fbb8072f | 573ce5d0-9ee4-43c3-b5f1-6a0632e79453 |
| 2026-11-07 | Doncaster 12:25 | TURF / TURF_TISSUE_V4 | Irish Nectar | T2 | 13.681% | 11/1 | 6 | 11 | −£1.00 | 51931ebe-92db-4649-bc25-2726fbb8072f | 1bf32c11-9f82-4c40-950b-995583d86521 |
| 2026-11-07 | Gowran Park 12:45 | CHASE / CHASE_TISSUE_V2 | Eternal Reward | T2 | 15.209% | 11/1 | 6 | 2 | −£1.00 | 214ded3f-ad1e-4d0f-a955-fcae2150c227 | df924839-a1b3-4683-b83b-f3ee99524d1b |
| 2026-11-07 | Doncaster 13:00 | TURF / TURF_TISSUE_V4 | Gattino | T2 | 15.730% | 9/1 | 3 | 3 | −£1.00 | b87111bf-59b3-44a9-bbee-8aade389282d | 975030be-51bc-434b-b292-ad0f366ef812 |
| 2026-11-07 | Aintree 13:15 | CHASE / CHASE_TISSUE_V2 | Cossack Chach | T2 | 10.239% | 28/1 | 8 | 6 | −£1.00 | 7b628285-63fb-44a6-97e5-6ae2d2bc33f7 | e24d980b-fda3-40cd-a060-392f3d283a12 |
| 2026-11-07 | Kelso 13:30 | HURDLE / HURDLE_TISSUE_V2 | Benefit Ben | T1 | 14.092% | 10/1 | 7 | 11 | −£1.00 | c10d6ea6-631b-4206-9738-194846c6946d | be1d8ea1-934a-48f1-888a-3b09fb2d4d3d |
| 2026-11-07 | Southwell 14:05 | AW / AW_TISSUE_V3 | Union Island | T2 | 10.861% | 16/1 | 8 | 4 | −£1.00 | 05391a0b-1b6e-4aa0-ab4a-8294ec8d00fc | 2783b7fb-f2cc-4f6f-aa5c-94778815528f |
| 2026-11-07 | Doncaster 14:10 | TURF / TURF_TISSUE_V4 | Zen Diva | T1 | 11.371% | 12/1 | 7 | 6 | −£1.00 | 7e5a968b-8ed7-4016-8935-220cde0dfee0 | 2186292c-d771-4035-8c8c-5a55d611cf5f |
| 2026-11-07 | Gowran Park 14:20 | HURDLE / HURDLE_TISSUE_V2 | Jack's Sister | T2 | 17.294% | 11/1 | 3 | 4 | −£1.00 | fb2b09dc-b207-453f-bb2a-cead2acbaadb | bfb7db62-7b95-49ab-94cd-d8900a6cd9fa |
| 2026-11-07 | Southwell 14:40 | AW / AW_TISSUE_V3 | Seddeeg | T2 | 9.694% | 11/1 | 5 | 6 | −£1.00 | b0f56dad-fa3c-4f14-8e1a-9293b9496553 | b5a31eef-05a0-4788-b4e3-46124857bcbf |
| 2026-11-07 | Doncaster 14:45 | TURF / TURF_TISSUE_V4 | Moments Of Joy | T1 | 12.667% | 14/1 | 7 | 7 | −£1.00 | a7d3e9f6-f984-47be-a66b-9b4b6ec78495 | 78037ff5-985c-4601-b47c-eb00f0096425 |
| 2026-11-07 | Doncaster 14:45 | TURF / TURF_TISSUE_V4 | Ribbon Of Sea | T2 | 11.654% | 16/1 | 10 | 6 | −£1.00 | a7d3e9f6-f984-47be-a66b-9b4b6ec78495 | b9f7153c-3837-467e-ab8d-2b3f4d7ae892 |
| 2026-11-07 | Aintree 15:00 | HURDLE / HURDLE_TISSUE_V2 | Walden | T2 | 11.337% | 11/1 | 6 | 2 | −£1.00 | 214c5c2d-2d6d-403f-a17d-cbfc77a854f5 | 14979980-0220-4c12-bec1-0135b1ff66f2 |
| 2026-11-07 | Doncaster 15:25 | TURF / TURF_TISSUE_V4 | Solarize | T1 | 10.255% | 11/1 | 5 | 4 | −£1.00 | d0c864df-2ed8-4f6a-ab5e-4b90df335460 | b3fb6b4b-2287-495a-8022-3460c6127532 |
| 2026-11-07 | Doncaster 15:25 | TURF / TURF_TISSUE_V4 | Circus Of Rome | T2 | 9.908% | 33/1 | 12 | 6 | −£1.00 | d0c864df-2ed8-4f6a-ab5e-4b90df335460 | a8dfbabd-2c1d-4fdc-8930-ab7e357d79c9 |
| 2026-11-07 | Gowran Park 15:30 | HURDLE / HURDLE_TISSUE_V2 | Lady Fromentro | T2 | 12.207% | 20/1 | 7 | 10 | −£1.00 | 804f4f7c-d410-46df-a064-fd3a986a3fe8 | 6f86da2c-c32a-46d2-bc25-8fa1ecf72ca5 |
| 2026-11-07 | Kelso 15:45 | HURDLE / HURDLE_TISSUE_V2 | Dream's Ka | T1 | 14.145% | 11/1 | 6 | 4 | −£1.00 | dac5fac8-48e5-4a96-b475-574b735d73e5 | a386783b-baa4-4144-bc9b-8a49385304b0 |
| 2026-11-07 | Gowran Park 16:00 | HURDLE / HURDLE_TISSUE_V2 | Tropical Twist | T1 | 15.249% | 10/1 | 6 | 3 | −£1.00 | 1dee4b55-26c7-4f00-9db9-e1f05db86316 | ae8360ae-8661-41a1-836e-34271feed9b6 |
| 2026-11-07 | Southwell 16:25 | AW / AW_TISSUE_V3 | Up The Anti | T2 | 14.412% | 18/1 | 7 | 2 | −£1.00 | 57181d88-23b6-436c-9322-6d0e8e8bafc5 | 8226d6bd-4ae2-4d98-96c2-40882e60faef |
| 2026-11-07 | Southwell 17:30 | AW / AW_TISSUE_V3 | Leading Times | T2 | 10.697% | 16/1 | 7 | 1 | +£16.00 | 7efde834-ac5c-42d1-b13c-a492edd9cdd0 | fc56ffbc-85ad-40c9-8eea-f193f5c6bdb5 |
| 2026-11-08 | Naas 12:00 | CHASE / CHASE_TISSUE_V2 | Latopix | T1 | 20.074% | 20/1 | 8 | 4 | −£1.00 | 074ab3f6-f6e5-4698-beb7-87a2b8602f15 | 1c91d30d-deda-4089-8635-0ccf7a8571a2 |
| 2026-11-08 | Naas 12:00 | CHASE / CHASE_TISSUE_V2 | Giant Haystacks | T2 | 15.432% | 9/1 | 5 | 6 | −£1.00 | 074ab3f6-f6e5-4698-beb7-87a2b8602f15 | 553a265b-73c1-4afc-8268-5d15abf92f57 |
| 2026-11-08 | Naas 13:00 | HURDLE / HURDLE_TISSUE_V2 | Golden Handshake | T2 | 21.202% | 14/1 | 4 | 3 | −£1.00 | ab3af0c6-bc30-4b0e-981b-e61eb3af1855 | 64f93974-dd83-4091-a5f6-c3e134983af4 |
| 2026-11-08 | Sandown 13:10 | HURDLE / HURDLE_TISSUE_V2 | Triple Edge | T2 | 14.617% | 80/1 | 7 | 6 | −£1.00 | 15456b02-4487-406c-9a42-b510a0bb914b | fd981730-f2a8-4fdd-957e-6dd4fe25504b |
| 2026-11-08 | Naas 13:30 | HURDLE / HURDLE_TISSUE_V2 | Coq Noir | T2 | 15.059% | 8/1 | 3 | 8 | −£1.00 | 6f099d04-9a8b-4ea3-b3c1-15b9a1f678ef | 42bbcf64-54d6-4eb3-8a88-ef959f01855c |
| 2026-11-08 | Sandown 13:40 | HURDLE / HURDLE_TISSUE_V2 | Queen's Theatre | T1 | 21.349% | 16/1 | 6 | 6 | −£1.00 | 06ffab2e-04a3-418d-8c6c-97c8e141e326 | 5251dfa3-3d4f-48cf-b246-f2be584f5ec3 |
| 2026-11-08 | Ffos Las 13:52 | HURDLE / HURDLE_TISSUE_V2 | Sparkling Duke | T1 | 20.577% | 9/1 | 5 | pulled_up | −£1.00 | a882e515-98e3-4785-896d-d06f017ef60a | 27ac97d4-0cb2-4511-abdb-4250a70d5f96 |
| 2026-11-08 | Naas 14:04 | HURDLE / HURDLE_TISSUE_V2 | Riskaway | T2 | 8.290% | 12/1 | 8 | 11 | −£1.00 | 13c1e51f-b58e-465d-be13-08e47c7adc44 | 380cbd8b-3471-44f3-bce1-c6b4752cc154 |
| 2026-11-08 | Naas 15:13 | CHASE / CHASE_TISSUE_V2 | Bertutea | T1 | 19.946% | 22/1 | 5 | fell | −£1.00 | cee9d214-72c7-4559-89c4-827033eb53a4 | 7bb1d3d5-e2bb-4e7d-a681-53717e2c9a7c |
| 2026-11-08 | Naas 15:13 | CHASE / CHASE_TISSUE_V2 | Arcadian Emperor | T2 | 18.735% | 12/1 | 4 | 3 | −£1.00 | cee9d214-72c7-4559-89c4-827033eb53a4 | ad22d3f8-efb4-42d8-8a81-0923bc5f5372 |
| 2026-11-08 | Ffos Las 16:12 | CHASE / CHASE_TISSUE_V2 | Imperial Bede | T2 | 27.363% | 10/1 | 4 | 3 | −£1.00 | 39b61d25-fec9-4370-8b3a-01f5cee1611e | d2d04515-c4ff-4133-bbc1-9463edb33335 |
| 2026-11-09 | Punchestown 12:00 | CHASE / CHASE_TISSUE_V2 | Laska Du Breuil | T1 | 18.388% | 11/1 | 7 | 4 | −£1.00 | c9a23eff-4593-40da-9c3b-d5eb032e40b2 | f480e234-f079-4099-8619-adb4e66689f0 |
| 2026-11-09 | Carlisle 12:20 | HURDLE / HURDLE_TISSUE_V2 | Dilrisk | T2 | 12.947% | 100/1 | 8 | 14 | −£1.00 | e85953fd-3dd5-4909-9cff-f700729eaf5e | deec28b9-7caf-4518-a3cb-49c3cc72e76f |
| 2026-11-09 | Carlisle 14:27 | HURDLE / HURDLE_TISSUE_V2 | Circuit Breaker | T2 | 11.892% | 8/1 | 5 | 8 | −£1.00 | e78c537b-69c5-482e-956f-d44733aad611 | c1f21cf7-61a2-46cf-b0bb-8285b1044c7b |
| 2026-11-09 | Carlisle 15:02 | CHASE / CHASE_TISSUE_V2 | Redeeming Love | T2 | 17.302% | 12/1 | 5 | 6 | −£1.00 | 11481046-ffe9-41a2-9455-877319bc05b1 | 514ee32d-8b90-4920-9a31-d172595b8084 |
| 2026-11-09 | Punchestown 15:13 | HURDLE / HURDLE_TISSUE_V2 | Sapphire Jewel | T2 | 11.667% | 28/1 | 6 | 6 | −£1.00 | 3221957b-c784-493b-bb06-50f41a514fa2 | a2a022af-8872-47ea-b960-e8bb0e91dd2f |
| 2026-11-09 | Punchestown 15:45 | HURDLE / HURDLE_TISSUE_V2 | Westin Pimpernel | T2 | 7.194% | 14/1 | 8 | 1 | +£14.00 | 74625af4-2c8a-4bb0-9ae8-a143de08edd5 | 7af57969-95bb-44cc-8e16-ae7a228bc82e |
| 2026-11-09 | Stratford 15:55 | CHASE / CHASE_TISSUE_V2 | Klassy Pearl | T2 | 17.314% | 9/1 | 6 | 4 | −£1.00 | 53ab56fd-fddc-420f-af7b-13ddc74e4dc6 | dc8c45e0-82a4-4015-ae2a-97b8d8828928 |
| 2026-11-10 | Fairyhouse 13:00 | HURDLE / HURDLE_TISSUE_V2 | Gratitudeforgrace | T2 | 18.322% | 14/1 | 4 | 7 | −£1.00 | 6d7cbd61-c443-480b-b47e-6e488b295d57 | 2f73559b-4ecc-4eb2-8f7d-65610130607d |
| 2026-11-10 | Fairyhouse 13:30 | HURDLE / HURDLE_TISSUE_V2 | Fuusland | T2 | 14.978% | 17/2 | 4 | 3 | −£1.00 | 1f3c243b-b3d4-43e1-9e30-72cd98a175eb | 541da8ac-241b-4b61-aa27-3c72af543b0d |
| 2026-11-10 | Lingfield 13:50 | HURDLE / HURDLE_TISSUE_V2 | Templar Knight | T2 | 23.183% | 25/1 | 3 | 4 | −£1.00 | f322649a-c708-42f6-862c-b698f70842e5 | 52d3c598-b81e-44d5-8c07-c66d3c3c225c |
| 2026-11-10 | Huntingdon 14:40 | CHASE / CHASE_TISSUE_V2 | Eastern Shores | T2 | 20.028% | 8/1 | 4 | 4 | −£1.00 | e8e4ce8e-0de5-4929-9ec6-58d853551dd0 | f44f1d97-9c7e-4d0e-9691-f684f34afd5d |
| 2026-11-10 | Fairyhouse 15:00 | CHASE / CHASE_TISSUE_V2 | Cold Old Fire | T2 | 14.224% | 22/1 | 7 | 8 | −£1.00 | ba0770a5-61a9-48c6-bbae-2f6f48f94660 | 57246b85-8d09-43b2-a99e-bd62099db9a5 |
| 2026-11-10 | Huntingdon 15:10 | HURDLE / HURDLE_TISSUE_V2 | Polemon | T2 | 19.298% | 50/1 | 6 | 5 | −£1.00 | 07d9d0cf-fc44-4b15-8501-4214b537df3a | cefd33bd-8c63-4959-b743-debcf4e476df |
| 2026-11-10 | Fairyhouse 15:30 | HURDLE / HURDLE_TISSUE_V2 | Cahirdown Boy | T1 | 11.410% | 12/1 | 8 | 4 | −£1.00 | 010eb3d1-3767-43bd-a625-56b1a7c62657 | 71cd4695-14ae-49fb-b25e-4f57132a40b3 |
| 2026-11-10 | Fairyhouse 15:30 | HURDLE / HURDLE_TISSUE_V2 | Getaway Charlie | T2 | 9.742% | 10/1 | 6 | 6 | −£1.00 | 010eb3d1-3767-43bd-a625-56b1a7c62657 | 6ab00400-1d0f-4f20-b9b6-52aba014e46b |
| 2026-11-11 | Bangor-on-Dee 13:00 | CHASE / CHASE_TISSUE_V2 | Getawhisky | T2 | 14.619% | 17/2 | 7 | 1 | +£8.50 | 29ebd02a-57a7-45e1-b96e-5660c2198a72 | e6fec6f0-c709-4cbb-849d-11ef60dcaaaa |
| 2026-11-11 | Dundalk 14:30 | AW / AW_TISSUE_V3 | Initial Blue | T1 | 12.386% | 10/1 | 7 | 4 | −£1.00 | 90a2860e-a95c-4d85-8532-8f6b6f1f01e8 | 502a47d9-035e-48f9-bfef-c9771f631ff1 |
| 2026-11-11 | Ayr 14:43 | HURDLE / HURDLE_TISSUE_V2 | Tread Softly Now | T2 | 13.526% | 8/1 | 4 | 3 | −£1.00 | 5222383c-0540-407d-b222-ac32751a9611 | 25891f88-c431-43e7-8c68-bba94807e958 |
| 2026-11-11 | Warwick 15:22 | CHASE / CHASE_TISSUE_V2 | Alba Crus | T2 | 22.097% | 8/1 | 4 | pulled_up | −£1.00 | d2878014-102a-440d-ba9c-497e66011d22 | 827d9573-7e64-4906-8d78-e8b9864b8ffd |
| 2026-11-11 | Dundalk 16:32 | AW / AW_TISSUE_V3 | Farmerspolish | T1 | 11.790% | 14/1 | 8 | 2 | −£1.00 | 152ffcaf-7e18-4ec1-87e4-6027b71af23b | 1461b0d7-24ff-49b4-b6e4-4f6414f0f280 |
| 2026-11-11 | Dundalk 17:32 | AW / AW_TISSUE_V3 | Echinacea | T2 | 11.251% | 8/1 | 4 | 14 | −£1.00 | 6b90b91d-af36-4eae-9262-260ed770ad87 | 91a08797-e705-4f38-9879-eece5d33c145 |
| 2026-11-12 | Hereford 12:30 | HURDLE / HURDLE_TISSUE_V2 | Antiquarian | T2 | 29.287% | 12/1 | 3 | 3 | −£1.00 | b269a5e7-9c0e-4fd7-9786-828d49a9e3ab | e9ccbdde-a9f1-4ad0-821d-22c7b0b9a2e8 |
| 2026-11-12 | Market Rasen 12:41 | HURDLE / HURDLE_TISSUE_V2 | Striking Midnight | T2 | 20.517% | 22/1 | 5 | 5 | −£1.00 | 8da7e44c-c211-47df-a80e-985bd6541233 | ea982f58-ecb8-44df-a5e4-0284c96468c0 |
| 2026-11-12 | Thurles 14:03 | HURDLE / HURDLE_TISSUE_V2 | Bayswater Bloom | T2 | 9.600% | 12/1 | 4 | unseated_rider | −£1.00 | 41c4d538-50b2-460e-b8ce-fd80ca2eccaf | 993b9e16-bf7e-4a3a-83c0-a47e7389cfee |
| 2026-11-12 | Thurles 15:15 | HURDLE / HURDLE_TISSUE_V2 | Daisy Fingall | T1 | 11.916% | 10/1 | 6 | 12 | −£1.00 | dad1328c-8d58-4230-913e-9ee43086962c | 929e6de5-209e-4f47-9210-57088882fe5e |
| 2026-11-12 | Market Rasen 15:36 | HURDLE / HURDLE_TISSUE_V2 | Time In A Bottle | T2 | 20.686% | 11/1 | 4 | 6 | −£1.00 | 4c1387c7-bac9-4831-8e21-e1a859557884 | 863dbe7c-08ca-4cc8-8afd-e7155cc405b9 |
| 2026-11-13 | Dundalk 19:30 | AW / AW_TISSUE_V3 | Winter Adventure | T2 | 17.858% | 16/1 | 5 | 7 | −£1.00 | 831a58d8-515c-4d70-9b13-63b9b259b5aa | 6d05a12b-4f1f-48c3-9b45-a1268170b0bb |
| 2026-11-13 | Dundalk 20:00 | AW / AW_TISSUE_V3 | Xirivella | T2 | 16.000% | 9/1 | 5 | 1 | +£9.00 | 48acef2a-141d-4a8a-9ace-ba32cbf59e4f | 0114c147-375b-416f-8203-23fe85524c51 |
| 2026-11-13 | Dundalk 20:30 | AW / AW_TISSUE_V3 | Phlox | T2 | 21.048% | 8/1 | 4 | 4 | −£1.00 | 8f1e475d-584f-40c0-81bd-9b2a3c2aed32 | 3a924e88-c24b-4a1a-8edf-fe84352674bd |
| 2026-11-14 | Uttoxeter 12:42 | HURDLE / HURDLE_TISSUE_V2 | Rose Warrior | T2 | 14.872% | 18/1 | 4 | 1 | +£18.00 | c2508a16-81c2-4cad-ba0d-d5a990b09262 | 1e92d7db-afd9-40b1-935e-9268e2016df6 |
| 2026-11-14 | Cheltenham 13:10 | HURDLE / HURDLE_TISSUE_V2 | Don Dandy | T1 | 22.178% | 11/1 | 5 | 3 | −£1.00 | 3c10111f-43e8-4d79-81aa-fbdd9cf31e55 | 243029c7-37f5-448a-8555-48610c3b8bdc |
| 2026-11-14 | Uttoxeter 13:15 | HURDLE / HURDLE_TISSUE_V2 | Millady | T1 | 19.791% | 22/1 | 4 | 3 | −£1.00 | 06824508-25f2-4886-b292-e2b26d711148 | 0c51bfdf-57e3-476c-98ec-997199537233 |
| 2026-11-14 | Navan 13:35 | HURDLE / HURDLE_TISSUE_V2 | Fiveandahalf | T1 | 20.306% | 9/1 | 4 | 6 | −£1.00 | 052db933-4783-482f-99f5-415e26d572dc | 991b240d-5d11-4ddd-b43f-4219cc8b34f8 |
| 2026-11-14 | Windsor 14:00 | HURDLE / HURDLE_TISSUE_V2 | Eliza Dolittle | T2 | 14.334% | 12/1 | 6 | 4 | −£1.00 | 91249d03-cbee-4484-9241-1df06cd26f0e | 2178e14b-7685-4982-9fcb-f5ef47a97420 |
| 2026-11-14 | Cheltenham 14:55 | HURDLE / HURDLE_TISSUE_V2 | Sir Galahad | T1 | 10.901% | 10/1 | 6 | 3 | −£1.00 | 40ba1861-523b-48a4-9236-c7d55c63c9a7 | 0edbc1c4-08ff-48c0-98ee-b3c94afd7533 |
| 2026-11-14 | Windsor 15:10 | HURDLE / HURDLE_TISSUE_V2 | Fasol | T2 | 14.314% | 11/1 | 6 | 1 | +£11.00 | 3d943230-4eff-42bb-bfda-641dead8d9be | 393b29a0-5211-42cd-897e-56873fb3f7aa |
| 2026-11-15 | Navan 12:40 | HURDLE / HURDLE_TISSUE_V2 | Tropical Twist | T1 | 13.276% | 10/1 | 4 | 14 | −£1.00 | 29fff195-7626-497d-8d0e-0645e1ce9f48 | b34a5b03-35d9-4e75-bf3b-c40b09ce4d83 |
| 2026-11-15 | Navan 12:40 | HURDLE / HURDLE_TISSUE_V2 | Asthelightdeclines | T2 | 8.811% | 16/1 | 11 | 4 | −£1.00 | 29fff195-7626-497d-8d0e-0645e1ce9f48 | b4013b07-ee9c-4e6d-9ad3-b3b2f053ced1 |
| 2026-11-15 | Cheltenham 12:50 | HURDLE / HURDLE_TISSUE_V2 | Island Getaway | T2 | 16.297% | 125/1 | 9 | 8 | −£1.00 | 17945780-ba69-4805-a090-780ff04270a5 | aad25d9f-c837-4d6d-90a7-96b2c2705f95 |
| 2026-11-15 | Fontwell 13:43 | HURDLE / HURDLE_TISSUE_V2 | Chocks Away | T2 | 12.141% | 22/1 | 4 | 4 | −£1.00 | 6aa3e264-2d5e-4536-a51e-0bfdccb94cbd | 71c14e76-c806-42a8-9997-7991c47c95bb |
| 2026-11-15 | Navan 13:50 | HURDLE / HURDLE_TISSUE_V2 | Sa Fureur | T1 | 10.631% | 12/1 | 6 | 11 | −£1.00 | 453691e2-ba8f-46f8-87b0-3d9b8afb62d9 | 6f18c54f-45fc-474a-9d97-d4f1f923d7d9 |
| 2026-11-15 | Fontwell 14:20 | HURDLE / HURDLE_TISSUE_V2 | Houndswood Willow | T2 | 16.127% | 10/1 | 5 | 3 | −£1.00 | 52fdae8b-e8dc-4acc-b80e-711e9a126e67 | e8b2c057-8ca6-4cd8-869e-6be7a05a6ddd |
| 2026-11-15 | Navan 15:00 | CHASE / CHASE_TISSUE_V2 | Croke Park | T2 | 7.526% | 25/1 | 14 | 12 | −£1.00 | 52fdd45b-2c28-41d0-99f0-37fc77b3af1e | 22345a4b-bdd4-4591-a962-971b622f4234 |
| 2026-11-16 | Plumpton 15:45 | HURDLE / HURDLE_TISSUE_V2 | Sir Edward Lear | T2 | 16.007% | 8/1 | 4 | 2 | −£1.00 | b4633d82-1dd5-4751-b681-2ce07b00a6ef | 16b32c41-9e82-41f7-8958-e2caf572d8e3 |
| 2026-11-16 | Wolverhampton 18:00 | AW / AW_TISSUE_V3 | Adventus Saxonum | T2 | 13.810% | 9/1 | 4 | 8 | −£1.00 | 5dbb4232-25e9-4ea1-8016-f05f800f94cf | 870b8dba-674a-4bf0-b865-3de6a66308c5 |
| 2026-11-16 | Wolverhampton 18:30 | AW / AW_TISSUE_V3 | Fiorella Princess | T1 | 15.622% | 11/1 | 6 | 2 | −£1.00 | 4d1127cc-1245-44de-b664-a7a0d68a052e | 7ea5b3e7-0c12-474b-b0b5-c755916c930f |
| 2026-11-16 | Wolverhampton 19:00 | AW / AW_TISSUE_V3 | Receipt | T1 | 16.973% | 66/1 | 9 | 10 | −£1.00 | f235cdeb-0a7c-4974-b3c1-bba947615226 | 4d547702-132c-4de9-a73b-461093b3cf09 |
| 2026-11-16 | Wolverhampton 19:00 | AW / AW_TISSUE_V3 | Mumayaz | T2 | 15.772% | 25/1 | 8 | 8 | −£1.00 | f235cdeb-0a7c-4974-b3c1-bba947615226 | c3cf7bed-10d3-495d-a90b-ca04e5bf3a62 |
| 2026-11-16 | Wolverhampton 19:30 | AW / AW_TISSUE_V3 | Jojo's Legacy | T2 | 12.412% | 8/1 | 5 | 7 | −£1.00 | 18bb3293-d8c8-4055-ad59-5a4fcc3450b0 | 70b266e1-a269-4dd7-bb73-b78d7e6259f7 |
| 2026-11-16 | Wolverhampton 20:00 | AW / AW_TISSUE_V3 | Oman | T2 | 11.606% | 16/1 | 8 | 10 | −£1.00 | 78e74dd4-63dc-4a03-9058-dd1c9a667c49 | bcde4a18-f6fa-482b-9363-8625741932bd |
| 2026-11-16 | Wolverhampton 20:30 | AW / AW_TISSUE_V3 | Heart Sign | T2 | 14.925% | 11/1 | 5 | 3 | −£1.00 | bb4fef50-f712-44a4-8325-5f528046d635 | e1c41cda-5f6e-43f4-a4cc-f6f1d5bd4c1f |
| 2026-11-17 | Limerick 12:10 | HURDLE / HURDLE_TISSUE_V2 | Awordinyourear | T2 | 10.736% | 50/1 | 11 | pulled_up | −£1.00 | f94f1d51-ea2b-45fa-84a7-963aa8dce2e9 | 573e0fed-9655-4536-8015-518a877dc98f |
| 2026-11-17 | Carlisle 12:20 | CHASE / CHASE_TISSUE_V2 | Kalkbrenner | T2 | 18.400% | 9/1 | 2 | 2 | −£1.00 | 7e384fa2-2194-4e3a-a01d-e2d5fd9cc38b | 4512d2a5-0030-400b-a5e3-82aecaf4eace |
| 2026-11-17 | Carlisle 12:50 | HURDLE / HURDLE_TISSUE_V2 | Linalene | T2 | 19.890% | 14/1 | 4 | 4 | −£1.00 | 2cbcf78c-aa7f-475b-896b-e8c5f9e10760 | ff780002-8aa4-449b-9939-55f5ff7642e9 |
| 2026-11-17 | Carlisle 13:25 | HURDLE / HURDLE_TISSUE_V2 | Pedro The Poet | T2 | 14.300% | 18/1 | 5 | 7 | −£1.00 | 89c015a7-b09e-44da-89ee-4d55bf406811 | 8f387357-cf7e-42d9-8c50-b9b692897f5d |
| 2026-11-17 | Limerick 14:40 | HURDLE / HURDLE_TISSUE_V2 | Mydreamtell | T1 | 10.204% | 16/1 | 6 | 8 | −£1.00 | 7233f202-8abe-4fb4-a81d-6f937afebeab | 6bbf4ec2-063a-4280-8774-4591add41f8d |
| 2026-11-17 | Limerick 14:40 | HURDLE / HURDLE_TISSUE_V2 | Whiskey Serenade | T2 | 9.032% | 20/1 | 7 | 9 | −£1.00 | 7233f202-8abe-4fb4-a81d-6f937afebeab | a0c64181-f7ea-4725-a1b1-ea40c9e3334c |
| 2026-11-17 | Southwell 16:30 | AW / AW_TISSUE_V3 | Jax Edge | T1 | 11.263% | 11/1 | 6 | 2 | −£1.00 | a0af0a7e-ac45-4439-a96d-83f93d9d4f16 | a3170e5b-f761-4ddd-bb5d-d2517457b07f |
| 2026-11-17 | Southwell 16:30 | AW / AW_TISSUE_V3 | Binadham | T2 | 9.511% | 18/1 | 11 | 12 | −£1.00 | a0af0a7e-ac45-4439-a96d-83f93d9d4f16 | 7b2bea54-c783-4981-b95a-40d3b216a3ab |
| 2026-11-17 | Southwell 18:30 | AW / AW_TISSUE_V3 | Silent City | T2 | 13.070% | 11/1 | 7 | 8 | −£1.00 | 7957f099-796c-40e4-adc4-6c9ec02815ba | cc7264f5-1287-4c45-8e8e-3f9bae41f42d |
| 2026-11-17 | Southwell 19:00 | AW / AW_TISSUE_V3 | Bay Breeze | T2 | 15.346% | 16/1 | 6 | 11 | −£1.00 | 58f11974-ced9-415d-be41-5e5315c210bc | f5bc82ee-9013-4b63-8ed2-edfcc509e9f6 |
| 2026-11-17 | Southwell 20:30 | AW / AW_TISSUE_V3 | Courageous Sioux | T1 | 17.566% | 8/1 | 5 | 4 | −£1.00 | 1ac31a73-d4c8-4817-ab48-c7ba9d6211c0 | 5eec7af5-16eb-47e8-935e-20d90a8cbdf6 |
| 2026-11-18 | Hexham 12:33 | HURDLE / HURDLE_TISSUE_V2 | Loopy Mag | T2 | 17.261% | 8/1 | 3 | 3 | −£1.00 | 2be8b46c-5e79-4b96-805b-1c38f54f5052 | 739ac1c3-f4c3-4baf-b4bd-5d278aee3d5a |
| 2026-11-18 | Ffos Las 13:48 | CHASE / CHASE_TISSUE_V2 | Carlenrig | T2 | 23.848% | 18/1 | 3 | 2 | −£1.00 | cb5b8a74-232c-4bd4-a559-68f13a403c36 | 67393e5b-6e16-4dc5-9f52-bd2d9027d368 |
| 2026-11-18 | Hexham 14:08 | HURDLE / HURDLE_TISSUE_V2 | Khaleesi Queen | T2 | 14.554% | 28/1 | 8 | 5 | −£1.00 | 45db79bf-5b54-4538-9c40-70f06b48366e | 5c73af79-f9d6-4421-9189-082580c6e30c |
| 2026-11-18 | Ffos Las 14:48 | HURDLE / HURDLE_TISSUE_V2 | Funny Hunny | T1 | 19.815% | 17/2 | 3 | 4 | −£1.00 | 18bfab76-4137-4e63-8ae1-4f60d8a58fda | a3e3efe4-25c9-4c2a-a565-e2af96d847f5 |
| 2026-11-18 | Hexham 15:08 | CHASE / CHASE_TISSUE_V2 | Colonel Jack | T1 | 11.896% | 16/1 | 8 | pulled_up | −£1.00 | b9e23a39-888e-4476-9673-62ba44148119 | 15a2b527-cd16-431d-894f-faa0533be33e |
| 2026-11-18 | Ffos Las 15:18 | HURDLE / HURDLE_TISSUE_V2 | Wispit Twob | T2 | 16.915% | 14/1 | 5 | 6 | −£1.00 | 940f7edb-3ef0-44fd-b41c-32ea67ab235c | 0b55c1bf-5af3-4848-a300-b3dae1e63e08 |
| 2026-11-18 | Dundalk 15:30 | AW / AW_TISSUE_V3 | Maxims Of Equity | T1 | 15.011% | 18/1 | 7 | 6 | −£1.00 | 730ec8f2-75a6-4674-8edb-ec2486fab03c | 12d426ec-469e-40bc-8d41-295e83cecea6 |
| 2026-11-18 | Ffos Las 15:48 | CHASE / CHASE_TISSUE_V2 | Seasett | T2 | 14.263% | 8/1 | 6 | 8 | −£1.00 | f5163491-b9bc-4396-bb96-a882c1339adc | e98f90ca-dee9-4ca8-ba05-6858ad153a35 |
| 2026-11-18 | Dundalk 16:30 | AW / AW_TISSUE_V3 | Tourin | T2 | 10.305% | 25/1 | 10 | 12 | −£1.00 | c6c3a533-d4ad-4c59-b8f1-eee56f6756a8 | 33c1173c-22b4-4d17-94a6-7974074857df |
| 2026-11-18 | Kempton 17:00 | AW / AW_TISSUE_V3 | Amandari | T1 | 12.450% | 10/1 | 4 | 1 | +£10.00 | 8e278794-bf21-41ac-901a-c595ca454fec | 88f2818a-1072-412c-bb49-64513d64a0a7 |
| 2026-11-18 | Dundalk 17:40 | AW / AW_TISSUE_V3 | Legato | T2 | 9.325% | 33/1 | 10 | 9 | −£1.00 | 268765da-c86e-42a4-a29c-40d6e22e9c8d | 36fe73a7-119d-4ad2-8b38-8eeeb6c5e41d |
| 2026-11-18 | Kempton 18:00 | AW / AW_TISSUE_V3 | You're Sensational | T1 | 28.282% | 8/1 | 4 | 9 | −£1.00 | 2719da3d-0a2c-4962-9749-6bf3dadf864e | 855ca3c9-f27f-46dd-ac10-bc014832fdf9 |
| 2026-11-18 | Kempton 19:30 | AW / AW_TISSUE_V3 | Majestic | T2 | 15.456% | 33/1 | 7 | 6 | −£1.00 | 2549fc5e-bee6-4559-a0e3-5747108875a4 | 8dc1aa21-2bdc-401d-8ed3-b8afddde22fc |
| 2026-11-18 | Kempton 20:30 | AW / AW_TISSUE_V3 | We Ride At Dawn | T2 | 16.720% | 14/1 | 6 | 7 | −£1.00 | 89a54d1b-cbaf-4c24-822e-3cef667d6a85 | fcbf384a-9e00-4e52-865d-6eec55ed1cca |
| 2026-11-19 | Thurles 12:08 | CHASE / CHASE_TISSUE_V2 | Fire Coral | T2 | 17.042% | 50/1 | 7 | 7 | −£1.00 | 22b21f87-1389-40e2-b83e-7e4c495c67f9 | f76367f1-1b62-464c-a089-715a0be8c4ba |
| 2026-11-19 | Lingfield 12:18 | AW / AW_TISSUE_V3 | Anaream | T2 | 14.359% | 12/1 | 6 | 8 | −£1.00 | 71712475-d77d-41fb-b931-722175ec73b1 | 949b177c-9c4e-4d5a-ae70-30ff84e23597 |
| 2026-11-19 | Warwick 12:27 | HURDLE / HURDLE_TISSUE_V2 | Roximan | T2 | 16.517% | 28/1 | 6 | 3 | −£1.00 | 12bfe4bb-876a-4b3c-a2ba-7918082959ed | 3da8909c-b95a-42a5-ad72-16d338e24b8d |
| 2026-11-19 | Thurles 12:40 | CHASE / CHASE_TISSUE_V2 | Labondance | T1 | 13.230% | 33/1 | 12 | 7 | −£1.00 | b2d3dca6-d355-4a5d-9bac-0dbb6ac0d60e | 7cca1dc1-5721-489e-8a0b-435411675df3 |
| 2026-11-19 | Thurles 12:40 | CHASE / CHASE_TISSUE_V2 | Doctor Confusion | T2 | 10.894% | 11/1 | 5 | 1 | +£11.00 | b2d3dca6-d355-4a5d-9bac-0dbb6ac0d60e | c2fd9428-a7c9-45fa-9aba-c88aecfef462 |
| 2026-11-19 | Warwick 13:02 | HURDLE / HURDLE_TISSUE_V2 | Golden Bouquet | T2 | 22.458% | 28/1 | 5 | 5 | −£1.00 | c2b57e2a-af3d-4e13-9f81-6fa2ab1cad9c | e82d72c6-7cb4-4e9f-baff-ea402ac5fd1d |
| 2026-11-19 | Lingfield 13:28 | AW / AW_TISSUE_V3 | Moonlight Mirage | T2 | 14.765% | 33/1 | 5 | 5 | −£1.00 | efc964a5-f2ec-448f-a4dc-0f2faa2ae9fb | da97555a-1b8a-4f24-ab94-4452705bbab2 |
| 2026-11-19 | Warwick 13:37 | CHASE / CHASE_TISSUE_V2 | Sure Touch | T1 | 18.476% | 8/1 | 6 | 6 | −£1.00 | f0a083cb-816b-405f-8dff-ea4bf408e6a1 | 94c29ac3-9e74-42c0-bcb4-f2614af115f0 |
| 2026-11-19 | Warwick 14:12 | HURDLE / HURDLE_TISSUE_V2 | Miss Cynthia | T1 | 17.384% | 9/1 | 7 | 6 | −£1.00 | 09d7fdf7-197a-4abc-9b75-88df57e18212 | df303528-fb52-427b-b1ea-752a6f6cd13b |
| 2026-11-19 | Warwick 14:12 | HURDLE / HURDLE_TISSUE_V2 | Party Vibes | T2 | 14.168% | 8/1 | 6 | 1 | +£8.00 | 09d7fdf7-197a-4abc-9b75-88df57e18212 | 2cde74aa-3b58-42ab-ab4b-a1263dc7107d |
| 2026-11-19 | Thurles 14:25 | HURDLE / HURDLE_TISSUE_V2 | Allo Al Khawaneej | T1 | 14.382% | 17/2 | 4 | 4 | −£1.00 | 5e5191e8-1452-433f-a79d-0b5dc85a6311 | ee90673a-2971-4d78-85af-3d8e17551ea6 |
| 2026-11-19 | Lingfield 14:38 | AW / AW_TISSUE_V3 | American Gal | T1 | 13.542% | 11/1 | 6 | 4 | −£1.00 | c4af5a29-2955-4deb-89c9-7e65071cd701 | 7183c2ce-b364-45db-8121-c61d26a56b43 |
| 2026-11-19 | Lingfield 14:38 | AW / AW_TISSUE_V3 | Queen's Reign | T2 | 10.785% | 80/1 | 11 | 10 | −£1.00 | c4af5a29-2955-4deb-89c9-7e65071cd701 | 9df081f4-c383-4beb-b2b4-62b8b2d99696 |
| 2026-11-19 | Thurles 15:00 | HURDLE / HURDLE_TISSUE_V2 | Beat The Devil | T2 | 10.405% | 25/1 | 10 | 6 | −£1.00 | 20775dab-1482-4917-9f1c-8e52e343e225 | 2b25ef0b-0919-4c8e-ae3f-9d45056dc699 |
| 2026-11-19 | Lingfield 15:08 | AW / AW_TISSUE_V3 | Cooramook | T1 | 12.250% | 17/2 | 4 | 9 | −£1.00 | 7e78ba4b-62d7-45fc-939c-7330cfd867a0 | a5d950ab-5157-4c56-a297-6e5c576f6375 |
| 2026-11-19 | Newcastle 16:40 | AW / AW_TISSUE_V3 | Mollisha | T1 | 15.623% | 12/1 | 7 | 4 | −£1.00 | 74cd3428-c617-4ddc-9009-5af7a0de2891 | 6e5a71b8-a3a5-44a3-a9d7-be47eacfcb2c |
| 2026-11-19 | Newcastle 16:40 | AW / AW_TISSUE_V3 | Kumharas | T2 | 11.092% | 14/1 | 8 | 12 | −£1.00 | 74cd3428-c617-4ddc-9009-5af7a0de2891 | 57c9e284-ea9f-4447-bffa-266105c29764 |
| 2026-11-19 | Newcastle 17:10 | AW / AW_TISSUE_V3 | Bronze Cascade | T2 | 18.342% | 12/1 | 5 | 2 | −£1.00 | 0e7bc377-1839-495f-ab46-9eef5ad3099e | 3554a251-0bcc-4191-9539-488d0986a3a6 |
| 2026-11-19 | Newcastle 17:40 | AW / AW_TISSUE_V3 | Hot Moonstone | T1 | 21.541% | 40/1 | 5 | 2 | −£1.00 | d2d18e2e-83fb-4f82-adbb-ba517c50dab6 | 52bad317-ae41-44a7-a9fd-30cb77234036 |
| 2026-11-19 | Newcastle 18:10 | AW / AW_TISSUE_V3 | Luminare | T1 | 13.226% | 9/1 | 5 | 11 | −£1.00 | 256f26e4-db76-4786-9501-9e53cc60e790 | 93ceb023-bef1-4a6c-8434-901cdcddca66 |
| 2026-11-19 | Newcastle 18:40 | AW / AW_TISSUE_V3 | Yes I'm Mali | T1 | 13.486% | 9/1 | 6 | 13 | −£1.00 | 482e06c2-70ac-4dfc-823b-189c7f6f64cf | e84755dd-1837-4709-8493-24886fe3dfb0 |
| 2026-11-19 | Newcastle 19:40 | AW / AW_TISSUE_V3 | Our Absent Friends | T1 | 9.744% | 28/1 | 11 | 11 | −£1.00 | 99c8f473-8bbf-46f2-b804-769e947f573e | 9d447f18-386f-4e74-9781-6c2658abdb15 |
| 2026-11-20 | Catterick 13:08 | CHASE / CHASE_TISSUE_V2 | Jet Of Dreams | T2 | 17.246% | 12/1 | 6 | 1 | +£12.00 | da57d299-3335-4e99-af00-997bba07a01b | 62f58818-00db-488f-be7f-9ed540c52328 |
| 2026-11-20 | Chepstow 14:07 | CHASE / CHASE_TISSUE_V2 | Jukebox King | T2 | 12.354% | 10/1 | 5 | 4 | −£1.00 | cee20d0c-cc6e-4324-b91f-bbf58b37c4de | f1de59a8-4f7a-488c-9d5b-39f11bdd5c28 |
| 2026-11-20 | Ascot 14:30 | HURDLE / HURDLE_TISSUE_V2 | Gambino | T2 | 12.521% | 40/1 | 8 | 8 | −£1.00 | a903f4a5-158d-41fa-a550-124364b297bb | 160c655f-9428-4f4e-9777-42235d924e4c |
| 2026-11-20 | Wolverhampton 16:30 | AW / AW_TISSUE_V3 | Borderline Madness | T1 | 13.830% | 10/1 | 5 | 2 | −£1.00 | cdf1dc8b-7bf7-4319-bd8d-4af765166e92 | ce9eef02-54b1-418b-bceb-13b46977d8c1 |
| 2026-11-20 | Wolverhampton 16:30 | AW / AW_TISSUE_V3 | Ignition | T2 | 12.562% | 28/1 | 10 | 6 | −£1.00 | cdf1dc8b-7bf7-4319-bd8d-4af765166e92 | 912b439c-722f-451d-93a9-3f34664aa192 |
| 2026-11-20 | Dundalk 16:45 | AW / AW_TISSUE_V3 | Matriarchal | T2 | 16.074% | 8/1 | 4 | 2 | −£1.00 | 8f826b42-10de-401b-ae3b-2a5877ccd314 | 63d31124-e3d8-4d5b-93f9-5d988546d7d3 |
| 2026-11-20 | Wolverhampton 17:00 | AW / AW_TISSUE_V3 | Navona Grey | T1 | 29.355% | 12/1 | 4 | 5 | −£1.00 | 44716074-8adc-45ea-9797-c797ecb76829 | 779513c5-e0d6-41a7-bd25-00522547639a |
| 2026-11-20 | Dundalk 17:15 | AW / AW_TISSUE_V3 | Treasured Royal | T2 | 11.015% | 11/1 | 7 | 2 | −£1.00 | a987f954-8a73-4aca-98bd-81246e380707 | fd07ccdc-ce06-4ddf-947c-8a94ac2730f3 |
| 2026-11-20 | Dundalk 18:15 | AW / AW_TISSUE_V3 | Apache Outlaw | T1 | 22.785% | 25/1 | 9 | 10 | −£1.00 | a41fb862-4506-40d2-8fd6-dcb786f49621 | 62df4bd9-4c1d-4f8d-b82a-c076ac2e80fb |
| 2026-11-20 | Dundalk 18:45 | AW / AW_TISSUE_V3 | Epic Arch | T2 | 12.275% | 14/1 | 7 | 7 | −£1.00 | 0ac265ec-4e15-4b64-a7bc-da88ba7e9638 | 7622542d-d5b2-4366-b69d-ce31bcde22c9 |
| 2026-11-20 | Wolverhampton 19:00 | AW / AW_TISSUE_V3 | Alfey Moon | T2 | 13.296% | 8/1 | 5 | 8 | −£1.00 | a2a8b0cf-47b5-49cd-b63d-63b69b6c1d46 | 0f1ae05c-21e1-4d50-8661-9298dd8f3c70 |
| 2026-11-20 | Wolverhampton 19:30 | AW / AW_TISSUE_V3 | Dandy Style | T2 | 19.714% | 66/1 | 9 | 4 | −£1.00 | 598adb91-3461-430d-a2fb-fb7f75ecf73f | 8c7d5ea5-4017-4779-8258-e249a96c7006 |
| 2026-11-20 | Dundalk 19:45 | AW / AW_TISSUE_V3 | Walhaan | T2 | 10.913% | 11/1 | 7 | 4 | −£1.00 | 4eafbf1d-84c6-49ec-b7fb-c338c68c5e3c | c769aa34-aa7f-4136-9d25-058c1e750d5f |
| 2026-11-20 | Wolverhampton 20:00 | AW / AW_TISSUE_V3 | Love Alive | T1 | 13.751% | 17/2 | 4 | 12 | −£1.00 | 1b25c5f7-24e5-49e6-8ccd-3fc3ea80e403 | abf5c173-b1cd-4ce8-8467-826bc9a0461a |
| 2026-11-20 | Wolverhampton 20:00 | AW / AW_TISSUE_V3 | Tomarlo | T2 | 13.673% | 14/1 | 6 | 11 | −£1.00 | 1b25c5f7-24e5-49e6-8ccd-3fc3ea80e403 | 9b4f04fc-205b-4a3a-971b-0157df486d54 |
| 2026-11-20 | Dundalk 20:15 | AW / AW_TISSUE_V3 | Preparations | T2 | 12.601% | 12/1 | 7 | 4 | −£1.00 | 477561b8-ff63-4644-a8ee-146a37f57f49 | 4efb9906-f7db-4a08-a111-8d236b73a665 |

</details>

<details>
<summary>Archive primary books — all priced outsider selections</summary>

| Date | Course / UTC off | Family / model | Horse | Rank | Frozen p | Final SP | SP rank | Result | £1 P/L | Race ID | Runner ID |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-09-19 | Newbury 12:37 | TURF / independent_tissue_numeric_comments_v1_2025 | Furthur | T1 | 14.329% | 9/1 | 5 | 8 | −£1.00 | e72ff110-1d06-4738-bfe5-529246461fdd | 2f011671-7178-4a45-9df6-6a33d407bef7 |
| 2026-09-19 | Newbury 13:12 | TURF / independent_tissue_numeric_comments_v1_2025 | Revels | T2 | 11.694% | 22/1 | 5 | 4 | −£1.00 | b42920e5-3c3c-4e7b-a688-93a3538f888f | 51a7dede-98e7-4d1a-a152-67711d0f8aeb |
| 2026-09-19 | Newmarket 13:25 | TURF / independent_tissue_numeric_comments_v1_2025 | Raggaas | T2 | 12.935% | 11/1 | 6 | 7 | −£1.00 | a7942633-72c6-464e-abfb-4a7b7b5f3e85 | dfdf2855-70d1-4457-9f03-3b5043382214 |
| 2026-09-19 | Ayr 13:30 | TURF / independent_tissue_numeric_comments_v1_2025 | Goldmoyne | T2 | 7.285% | 22/1 | 11 | 2 | −£1.00 | 9af4d2f9-21cc-489c-9a49-aadc574f6ec4 | 5b0ea522-db41-4c7b-997a-b5907e972c54 |
| 2026-09-19 | Chester 14:10 | TURF / independent_tissue_numeric_comments_v1_2025 | Reds And Wolves | T1 | 13.346% | 11/1 | 5 | 3 | −£1.00 | 829258ba-c8f4-4509-8989-2c2d053633fb | 995ce16b-71fb-42a7-bbcb-e316b7c3bec3 |
| 2026-09-19 | Chester 14:10 | TURF / independent_tissue_numeric_comments_v1_2025 | Spirit Genie | T2 | 10.825% | 14/1 | 7 | 7 | −£1.00 | 829258ba-c8f4-4509-8989-2c2d053633fb | 78521a11-b621-4d18-88e3-e4cb7128900a |
| 2026-09-19 | Gowran Park 14:15 | TURF / independent_tissue_numeric_comments_v1_2025 | Ryano Bhino | T2 | 13.235% | 50/1 | 6 | 6 | −£1.00 | 13a81b03-2cab-4276-a21f-7caf8dfbdc52 | a2ff4fb7-aba4-45a8-85cf-657971972ee9 |
| 2026-09-19 | Chester 14:46 | TURF / independent_tissue_numeric_comments_v1_2025 | Proof | T2 | 10.548% | 25/1 | 10 | 5 | −£1.00 | 997f49ff-e258-4ea6-b586-e82d871d9bc5 | be1f4968-bdb5-46af-9827-1582525ade67 |
| 2026-09-19 | Gowran Park 14:50 | TURF / independent_tissue_numeric_comments_v1_2025 | Classiest | T1 | 19.100% | 80/1 | 9 | 7 | −£1.00 | 3eb4e2eb-af3a-4483-986d-3ab7739780e1 | 26c84be7-bf2e-4ef0-9a58-8c99c9f41afc |
| 2026-09-19 | Gowran Park 14:50 | TURF / independent_tissue_numeric_comments_v1_2025 | Hollys Graces | T2 | 14.852% | 66/1 | 8 | 12 | −£1.00 | 3eb4e2eb-af3a-4483-986d-3ab7739780e1 | 13c1df35-6f72-4e9a-bfb7-3ac1c119f98b |
| 2026-09-19 | Newmarket 16:30 | TURF / independent_tissue_numeric_comments_v1_2025 | Drifts Away | T2 | 11.816% | 16/1 | 9 | 9 | −£1.00 | 50c528f6-b023-4b37-9b49-41716b2e85ca | 8fd66b12-8277-49d4-a512-cc412898fbed |
| 2026-09-25 | Newmarket 12:15 | TURF / tissue_model_v2 | Gilding The Lily | T1 | 22.533% | 18/1 | 8 | 9 | −£1.00 | e06e3373-47d9-4718-a92f-8edf1ff51e11 | 4ec34eeb-4987-43c4-b026-cabaa5bdbf23 |
| 2026-09-25 | Newmarket 12:50 | TURF / tissue_model_v2 | Without Prejudice | T1 | 16.640% | 10/1 | 4 | 8 | −£1.00 | cddef489-a472-4f05-9494-8f4ddbd99071 | fc93497b-fe88-423d-87b9-08b75154ce1d |
| 2026-09-25 | Newmarket 13:25 | TURF / tissue_model_v2 | Redline | T1 | 18.320% | 80/1 | 9 | 9 | −£1.00 | 0ceb7f62-d18f-406e-827b-023ba63d142a | de7b81f7-fdbd-4ca0-9400-31a706bbbca0 |
| 2026-09-25 | Newmarket 13:25 | TURF / tissue_model_v2 | Miss Miniver | T2 | 15.586% | 17/2 | 6 | 4 | −£1.00 | 0ceb7f62-d18f-406e-827b-023ba63d142a | c145aece-9ebc-4a9e-ac36-67a39b9f7f01 |
| 2026-09-25 | Haydock 14:43 | TURF / tissue_model_v2 | Great Oak | T2 | 15.256% | 8/1 | 4 | 6 | −£1.00 | 5b663239-b540-421a-afa8-5e04148e520b | 4b9e1da7-229d-46bb-82ee-ca8bc8438a1b |
| 2026-09-26 | Haydock 12:35 | TURF / tissue_model_v2 | Mister Winston | T2 | 14.021% | 10/1 | 6 | 6 | −£1.00 | 4f90b5b9-13f1-47cf-9d21-0e15d098544b | 854b5b61-afaf-4434-8ba3-d63374a8da5e |
| 2026-09-26 | Curragh 13:00 | TURF / tissue_model_v2 | Chapel Lane | T2 | 17.472% | 8/1 | 5 | 6 | −£1.00 | a029080f-a22a-48d5-89fa-25ced52ee0c2 | cfea54e5-6d16-4f66-bb56-b4a80171a074 |
| 2026-09-26 | Newmarket 13:27 | TURF / tissue_model_v2 | Snowing | T2 | 18.923% | 150/1 | 6 | 6 | −£1.00 | 0467bc34-9268-48e7-b66b-51e8eef1eb70 | 32d44757-e203-4d69-a08b-7a30c042beda |
| 2026-09-26 | Curragh 13:35 | TURF / tissue_model_v2 | Namiid | T1 | 9.612% | 10/1 | 5 | 12 | −£1.00 | df881e39-940c-4b61-8a76-389485a5f627 | 4b1b0a62-866a-43db-8d6b-bad8b0c370e6 |
| 2026-09-26 | Curragh 13:35 | TURF / tissue_model_v2 | Kendall Roy | T2 | 7.176% | 25/1 | 13 | 20 | −£1.00 | df881e39-940c-4b61-8a76-389485a5f627 | d1d685a5-cce7-42bd-b942-71ca342beae3 |
| 2026-09-26 | Ripon 14:28 | TURF / tissue_model_v2 | Indian Run | T2 | 10.508% | 17/2 | 5 | 3 | −£1.00 | c7ea2a89-2428-463d-8976-502ce73642dd | ceaaaa75-1319-407e-8220-c6166ac10c04 |
| 2026-09-26 | Newmarket 14:40 | TURF / tissue_model_v2 | Thunder Run | T2 | 7.828% | 22/1 | 12 | 24 | −£1.00 | c5725030-3e22-4c2e-86bd-fef2c75ca3c2 | 627631c0-fc27-4dad-a1c6-a519eab63c82 |
| 2026-09-26 | Ripon 15:05 | TURF / tissue_model_v2 | Sole Spirit | T1 | 12.766% | 12/1 | 8 | 7 | −£1.00 | e3f0022e-ad23-4e21-b684-219a99478c79 | 2a7d0443-45f4-49e0-aed8-5c05a8a7bd1e |
| 2026-09-26 | Newmarket 15:15 | TURF / tissue_model_v2 | Lady Jemima | T2 | 13.518% | 16/1 | 7 | 2 | −£1.00 | 9c14be53-621c-468e-864a-09b62647aaca | 94c652d1-f9a1-45b4-8c40-1b1b1a66bab9 |
| 2026-09-26 | Curragh 15:20 | TURF / tissue_model_v2 | Carry The Flag | T2 | 9.059% | 17/2 | 4 | 16 | −£1.00 | b6527da6-1e28-4680-8415-ed0ba30e9313 | 60a0cc3a-caa2-4dbf-8f16-54cc13888c03 |
| 2026-09-26 | Curragh 15:55 | TURF / tissue_model_v2 | Plug In Hybrid | T2 | 11.089% | 100/1 | 13 | 16 | −£1.00 | ea3ef338-7e8d-452e-a9b4-700e73a3dbd3 | 4aa31f3e-7975-4e6b-ab7c-6e37b46fc89f |
| 2026-09-26 | Curragh 16:25 | TURF / tissue_model_v2 | Camelot Queen | T1 | 15.169% | 28/1 | 9 | 5 | −£1.00 | d2f35cdd-0cd9-4c3e-97f6-7a8d557c992d | 98456900-7b9a-43ea-9b3a-730b408e9766 |
| 2026-09-27 | Epsom Downs 12:37 | TURF / tissue_model_v2 | Rogue Imperial | T1 | 17.985% | 10/1 | 4 | 1 | +£10.00 | d4044a15-1a28-4132-bdc0-4b2d9f1e1440 | d01dad63-bd19-4d14-9caa-b26890eea5d6 |
| 2026-09-27 | Ffos Las 12:49 | TURF / tissue_model_v2 | Wolf's Gallop | T2 | 15.989% | 10/1 | 6 | 2 | −£1.00 | 2f1822b7-450e-4623-b326-0b69b7273cc5 | 11549d37-1f16-4220-a7e8-60609b7022f7 |
| 2026-09-27 | Epsom Downs 13:47 | TURF / tissue_model_v2 | Seacole | T1 | 28.929% | 8/1 | 4 | 2 | −£1.00 | 80eaf4fa-6098-4b21-96a6-fe96acc5cc6e | 7fa00ea4-2662-4463-9e44-a062fff08219 |
| 2026-09-27 | Epsom Downs 14:22 | TURF / tissue_model_v2 | Nibras Gold | T1 | 16.426% | 10/1 | 7 | 6 | −£1.00 | 62c7fbec-ca34-47c3-9d58-69521e601154 | d2b1483a-98ef-48f0-ba05-7cc49c198381 |
| 2026-09-27 | Epsom Downs 14:22 | TURF / tissue_model_v2 | Marnier | T2 | 11.449% | 8/1 | 5 | 11 | −£1.00 | 62c7fbec-ca34-47c3-9d58-69521e601154 | 2799cb20-2355-4ac2-8561-64f6823c50d8 |
| 2026-09-27 | Curragh 14:45 | TURF / tissue_model_v2 | Film Set | T2 | 20.984% | 11/1 | 4 | 5 | −£1.00 | b234decf-6418-4ec2-b507-f7c4949be3a5 | 98348621-271b-4d9b-acb4-519b37122f8c |
| 2026-09-27 | Ffos Las 15:09 | TURF / tissue_model_v2 | Thestral | T1 | 14.045% | 25/1 | 9 | 9 | −£1.00 | f3f3bf03-3188-4496-b675-9c8953c751cd | e43624eb-d8f0-40c8-913a-f217a02907ba |
| 2026-09-27 | Curragh 15:20 | TURF / tissue_model_v2 | Bunting | T1 | 9.943% | 18/1 | 11 | 7 | −£1.00 | 336e05e6-1435-481a-bb2b-840074c80378 | 6c889863-6ddc-48b1-9e1c-872b6c39f0a0 |
| 2026-09-27 | Curragh 15:20 | TURF / tissue_model_v2 | Port Of Spain | T2 | 9.848% | 10/1 | 3 | 17 | −£1.00 | 336e05e6-1435-481a-bb2b-840074c80378 | c5d4b9aa-e4b7-491c-88ce-c42bf759e334 |
| 2026-09-27 | Ffos Las 15:44 | TURF / tissue_model_v2 | Revich | T1 | 15.322% | 16/1 | 6 | 5 | −£1.00 | 8e640f87-c39b-4ff7-9b4d-8f4c2459919c | 37102f23-412a-45f4-ad15-ac52b395ae15 |
| 2026-09-27 | Curragh 15:55 | TURF / tissue_model_v2 | Two Brigade | T2 | 12.944% | 28/1 | 9 | 9 | −£1.00 | 6d8beed9-6604-436d-928d-e117960bcceb | 539896a1-fa4b-4547-88c6-42d1fe567503 |
| 2026-09-27 | Epsom Downs 16:07 | TURF / tissue_model_v2 | Bridget's View | T1 | 18.448% | 11/1 | 7 | 4 | −£1.00 | 8055ac3c-06b4-408b-85bf-4f7c2f9447e8 | 04e7aa32-65d1-40ba-b1a0-54b9ca5dd9bd |
| 2026-09-27 | Curragh 16:30 | TURF / tissue_model_v2 | No More Porter | T2 | 8.667% | 11/1 | 6 | 7 | −£1.00 | ce0eeb3f-6a90-47fb-9576-b707dfa07206 | c22c9906-91ae-4946-aa35-99ad5634d2be |
| 2026-09-28 | Hamilton 12:44 | TURF / tissue_model_v2 | Thistle Nil | T2 | 23.092% | 9/1 | 5 | 6 | −£1.00 | 1f5567c2-96d5-4b4a-80ef-0972d7db7a6b | 6af64e9e-9dc7-47d8-b133-cf6cf5a6666d |
| 2026-09-28 | Brighton 13:40 | TURF / tissue_model_v2 | Enhancing | T1 | 11.247% | 14/1 | 8 | 7 | −£1.00 | 87d37805-c1e3-4361-ae13-806262f6a67f | f57057d5-7244-435c-b9d2-62baa223c814 |
| 2026-09-28 | Brighton 13:40 | TURF / tissue_model_v2 | Golden Oasis | T2 | 10.762% | 16/1 | 10 | 3 | −£1.00 | 87d37805-c1e3-4361-ae13-806262f6a67f | e4e3df84-4f57-4614-8a5f-fd1c29ad30b8 |
| 2026-09-28 | Hamilton 13:54 | TURF / tissue_model_v2 | Lady Titania | T1 | 23.962% | 14/1 | 7 | 6 | −£1.00 | de8203d0-3011-4aec-b74c-dc216896ba70 | 0cc0020d-f8c5-43a3-9eb6-a6e58423c81b |
| 2026-09-28 | Brighton 14:15 | TURF / tissue_model_v2 | Alterity | T2 | 13.258% | 28/1 | 9 | 10 | −£1.00 | 83dfcd7e-daea-499a-acd9-fe10b61c606a | fafc23eb-bcc3-4128-9f39-5d5d6fd80b13 |
| 2026-09-28 | Hamilton 14:29 | TURF / tissue_model_v2 | Strength of Spirit | T2 | 12.615% | 8/1 | 5 | 2 | −£1.00 | a5c06a3a-bdbd-4bec-947c-548ad6e0fea9 | 566813af-4c41-4bf7-b0e9-35d429cc4610 |
| 2026-09-28 | Down Royal 14:44 | TURF / tissue_model_v2 | Minaun View | T2 | 8.551% | 8/1 | 6 | 1 | +£8.00 | b4119978-0aaf-480b-8bf7-1ddb172b51b9 | 34b38d5f-48f2-4d4a-aa4f-48bc213b2d3d |
| 2026-09-28 | Down Royal 15:19 | TURF / tissue_model_v2 | Aiteall | T1 | 14.632% | 18/1 | 8 | 2 | −£1.00 | 06358941-a9ba-4534-bf61-ac0f218dc421 | 6de5b83a-422b-469b-84ee-809592e5f4e6 |
| 2026-09-28 | Brighton 16:00 | TURF / tissue_model_v2 | Port Hedland | T2 | 15.342% | 8/1 | 4 | 4 | −£1.00 | ac75a7f5-2f38-4be5-a9d8-a1dc10ba34ac | f1298a86-2c82-481d-8606-a7e298341803 |
| 2026-09-28 | Down Royal 16:25 | TURF / tissue_model_v2 | Neptunes Staircase | T2 | 9.386% | 16/1 | 8 | 5 | −£1.00 | 8b67d92f-631f-423c-854a-8e8701774661 | 38eea0e0-87c9-40d7-b2ac-14f38e2e7da7 |
| 2026-09-29 | Cork 13:55 | TURF / tissue_model_v2 | Flash Of Fire | T1 | 19.152% | 9/1 | 6 | 8 | −£1.00 | 14b08d05-f17f-4500-b610-57831b5c4df8 | 7c0bfd8c-0441-4123-8518-ed8e4f87ebbe |
| 2026-09-29 | Cork 13:55 | TURF / tissue_model_v2 | Baiana | T2 | 18.443% | 9/1 | 6 | 6 | −£1.00 | 14b08d05-f17f-4500-b610-57831b5c4df8 | 9ee46b05-60fa-4730-8109-18ce851f372c |
| 2026-09-29 | Ayr 14:08 | TURF / tissue_model_v2 | Mehmas Champion | T1 | 21.414% | 11/1 | 6 | 5 | −£1.00 | 541036bd-94c7-4bec-a810-16787d1ca74d | 171afea8-58f8-44c9-87c8-9f81611c9ae7 |
| 2026-09-29 | Ayr 14:08 | TURF / tissue_model_v2 | Krissy | T2 | 14.584% | 17/2 | 5 | 7 | −£1.00 | 541036bd-94c7-4bec-a810-16787d1ca74d | 139b113c-300d-4d53-88c9-634b2629b14a |
| 2026-09-29 | Cork 14:25 | TURF / tissue_model_v2 | El Fontenaro | T2 | 9.498% | 9/1 | 6 | 5 | −£1.00 | 87bb9d5d-254f-462a-b1ab-8f6ffbc68fca | 7454ff7d-cd80-4d89-b15e-c02e05791d09 |
| 2026-09-29 | Ayr 14:38 | TURF / tissue_model_v2 | Abduction | T2 | 14.167% | 10/1 | 5 | 6 | −£1.00 | 80b7dae7-9d1f-4399-a03b-c6459aeec862 | 45699d20-d565-460c-aa24-a1acb36a92ae |
| 2026-09-29 | Ayr 15:40 | TURF / tissue_model_v2 | Belsito | T1 | 18.507% | 9/1 | 6 | 5 | −£1.00 | b6a26055-f8fc-4a59-befa-126d3a914e2b | 0a60bb2d-82e7-4657-9747-6431cc3b57b8 |
| 2026-09-29 | Bath 16:07 | TURF / tissue_model_v2 | The Thames Boatman | T2 | 16.189% | 10/1 | 8 | 4 | −£1.00 | 66558a84-de8c-44e7-b995-5f43a3d41250 | e984a6e4-3194-44cf-ba42-a4bf7b03997e |
| 2026-09-30 | Musselburgh 13:13 | TURF / tissue_model_v2 | The Stone Power | T1 | 21.266% | 9/1 | 4 | 6 | −£1.00 | 01f5be6d-5d99-4254-9441-bcb65e2b0d8b | 45a07206-db2b-4ae0-9a78-df0780c061f7 |
| 2026-09-30 | Bellewstown 14:15 | TURF / tissue_model_v2 | Moyassr | T1 | 10.094% | 11/1 | 8 | 6 | −£1.00 | 9269e474-89f2-45a2-88b1-b2c1f3b80a0b | 6b7d4ad0-5c81-4a5c-bb31-de58e91acf88 |
| 2026-09-30 | Catterick 14:42 | TURF / tissue_model_v2 | Diamont Katie | T2 | 15.366% | 8/1 | 3 | 1 | +£8.00 | 977b2c38-276d-419b-b966-6b3ef10bfae5 | d25d799b-e16b-4c73-a6b0-50bbfb7a6da5 |
| 2026-09-30 | Bellewstown 14:50 | TURF / tissue_model_v2 | White Smoke | T2 | 20.031% | 12/1 | 4 | 1 | +£12.00 | e07dc101-5741-4071-b796-06defe4942ef | b04f5d91-03b9-4fd3-a6b2-f2a1c1c1f34e |
| 2026-09-30 | Musselburgh 14:58 | TURF / tissue_model_v2 | Thunderstorm Katie | T2 | 11.524% | 10/1 | 5 | 8 | −£1.00 | bd01b8da-72e6-4813-bd35-c2e1ea0ab13e | 8b2b5967-796d-4fd3-8a93-1f579f8e0be6 |
| 2026-09-30 | Catterick 15:15 | TURF / tissue_model_v2 | Imperial Guard | T2 | 16.305% | 10/1 | 5 | 4 | −£1.00 | ab2c011d-efa2-4b6d-92cb-2d9b6dd2a404 | 4ab18d17-83c6-4c6e-b6a7-410452ef4728 |
| 2026-09-30 | Catterick 15:50 | TURF / tissue_model_v2 | Cape Sovereign | T2 | 11.249% | 22/1 | 7 | 8 | −£1.00 | 27759c6d-9dfc-4277-a6ab-bde6c49d89ae | 0d4f2f29-c743-4a19-b31c-c54c77498494 |
| 2026-09-30 | Musselburgh 16:08 | TURF / tissue_model_v2 | Tide Lines | T1 | 20.096% | 12/1 | 5 | 3 | −£1.00 | 51b396da-2034-47b1-9ab8-30cf22a1c58c | 05459a77-4058-4e56-b5a5-63941df88d57 |
| 2026-10-01 | Nottingham 12:23 | TURF / tissue_model_v2 | Crimson Blaze | T1 | 41.262% | 10/1 | 3 | 2 | −£1.00 | 407dafb3-b198-42e4-a5d8-ccf1c9c7d7ec | 06d2715d-b993-4d8a-8a8a-052ee6b6f576 |
| 2026-10-01 | Nottingham 12:58 | TURF / tissue_model_v2 | Farasan | T1 | 20.957% | 20/1 | 7 | 8 | −£1.00 | f3719efc-f2e2-4f81-bfc4-88161e1fa77a | a2d8f6c1-67e8-4a04-9b64-5e0b3b00a777 |
| 2026-10-01 | Salisbury 13:04 | TURF / tissue_model_v2 | Astralite | T2 | 13.119% | 18/1 | 6 | 5 | −£1.00 | 3352b73e-fcce-4165-847e-ffd75bc8348c | afdaa91d-c95b-4bbb-be31-d5efa0c1828e |
| 2026-10-01 | Bellewstown 13:10 | TURF / tissue_model_v2 | Matties Point | T2 | 14.532% | 12/1 | 6 | 4 | −£1.00 | 0918c2c8-0307-46c0-aabf-e2a3928c9327 | d205f5f8-d1a7-468d-ad16-64109c85a871 |
| 2026-10-01 | Nottingham 14:08 | TURF / tissue_model_v2 | Princess Lottie | T2 | 13.012% | 12/1 | 4 | 4 | −£1.00 | 90835c63-3699-4dfa-9875-f0d7754d3a62 | 17f97a32-963f-4ddd-a024-79ffce102ff3 |
| 2026-10-01 | Salisbury 14:49 | TURF / tissue_model_v2 | Jellystone Park | T2 | 9.680% | 14/1 | 9 | 14 | −£1.00 | 61e2e4bd-43c0-4e28-a7aa-81b2feda6a94 | 2d216976-4805-45cc-baf2-c022fbdac4e6 |
| 2026-10-01 | Nottingham 15:18 | TURF / tissue_model_v2 | Crimson Road | T2 | 12.039% | 11/1 | 8 | 4 | −£1.00 | 036ed0d2-6377-45e6-836f-14c30418a65f | e7aeebc2-7a38-4e87-b8ec-a060fb3cb31d |
| 2026-10-01 | Bellewstown 16:05 | TURF / tissue_model_v2 | Grey Fable | T1 | 13.860% | 9/1 | 6 | 6 | −£1.00 | da6c7c4b-8610-4806-97c4-f164289f4b4c | 2d08dda1-8036-4b6a-b1d0-5981fd5a18d5 |
| 2026-10-02 | Ascot 14:00 | TURF / tissue_model_v2 | Hygge | T2 | 14.995% | 10/1 | 4 | 9 | −£1.00 | f6195105-ae2e-438b-aea2-78de2dcc3939 | 682c86a2-92b6-4144-8fa8-4aa114fd9787 |
| 2026-10-02 | Wolverhampton 14:16 | AW / AW_TISSUE_V1 | Hayynah | T1 | 17.508% | 9/1 | 6 | 6 | −£1.00 | cfedf552-1b02-43fb-b279-dad7e4d48fa2 | 86c20032-1a08-4ac6-96a5-bf094a8e5ede |
| 2026-10-02 | Ascot 14:35 | TURF / tissue_model_v2 | Guildmaster | T2 | 20.451% | 20/1 | 4 | 4 | −£1.00 | 7d5060f8-5f74-40a1-9336-06c7f5c1246d | 19fc3e7b-ad5a-4206-8522-63040336fdef |
| 2026-10-02 | Wolverhampton 14:51 | AW / AW_TISSUE_V1 | Queen Sana | T1 | 19.238% | 10/1 | 6 | 10 | −£1.00 | a9763e13-5964-45c6-869f-a9912dfbc6ed | 7c5533f8-77db-4fa5-89ec-180a3215ba88 |
| 2026-10-02 | Newcastle 15:05 | AW / AW_TISSUE_V1 | Distinction | T2 | 14.074% | 9/1 | 4 | 6 | −£1.00 | 926cf672-23c6-493b-89dd-cf114527bdb0 | 6ed73a5e-c84f-49a8-ab2d-5d80599c27f3 |
| 2026-10-02 | Ascot 15:10 | TURF / tissue_model_v2 | Another Abbot | T1 | 12.248% | 18/1 | 11 | 16 | −£1.00 | bfdcf323-b813-466b-90c3-4c603946412c | ab18361b-8599-4a6a-9f71-59de65a57d97 |
| 2026-10-02 | Ascot 15:10 | TURF / tissue_model_v2 | Bolo Neighs | T2 | 11.373% | 11/1 | 7 | 17 | −£1.00 | bfdcf323-b813-466b-90c3-4c603946412c | 1fe9ac44-1bfb-41a0-869d-6ab85d44b76d |
| 2026-10-02 | Wolverhampton 15:55 | AW / AW_TISSUE_V1 | Captain Parma | T1 | 13.603% | 10/1 | 4 | 9 | −£1.00 | 91c1cf18-d6bc-4c5c-bc7e-0f1abe2a91ef | b9cf6938-08d9-471d-9824-fa30ee75c4d2 |
| 2026-10-02 | Newcastle 16:15 | AW / AW_TISSUE_V1 | Soldier's Echo | T2 | 12.443% | 16/1 | 8 | 8 | −£1.00 | 841d0bb7-1a61-449c-b91c-3140cca80477 | c2de8777-62cc-4e5f-a80e-2a8f62582020 |
| 2026-10-02 | Wolverhampton 16:25 | AW / AW_TISSUE_V1 | Darzah | T2 | 20.854% | 20/1 | 4 | 4 | −£1.00 | 6fdef10b-732d-49b1-abd7-ec73dd5b6630 | 1319f819-691d-4ecd-9ff9-6b1255473c12 |
| 2026-10-02 | Newcastle 16:45 | AW / AW_TISSUE_V1 | Star Mirage | T1 | 37.178% | 9/1 | 4 | 3 | −£1.00 | 809c458e-b85c-4fa4-8140-39ef9960b82e | e42358f6-a112-4f2a-bb3d-5b07cb50c529 |
| 2026-10-02 | Wolverhampton 16:55 | AW / AW_TISSUE_V1 | Hvar | T2 | 12.436% | 10/1 | 7 | 6 | −£1.00 | 3f8534a9-a0ee-4013-8b7b-c68d1c304446 | 5ce02224-c130-48cd-bcc8-821865bfc225 |
| 2026-10-02 | Newcastle 17:45 | AW / AW_TISSUE_V1 | Spartan Fighter | T1 | 31.526% | 16/1 | 8 | 2 | −£1.00 | 39102b4c-ac69-418f-953c-e1b12ca7fe46 | 4cea6e65-1784-448d-aafa-5bb470e365e9 |
| 2026-10-02 | Dundalk 18:00 | AW / AW_TISSUE_V1 | Tio Joao | T1 | 16.102% | 10/1 | 6 | 2 | −£1.00 | d4994cd7-5b8d-4cf7-a611-35065db4b1c1 | a1fa2afa-4a24-4541-8fe5-262d5535c5bb |
| 2026-10-02 | Newcastle 18:15 | AW / AW_TISSUE_V1 | Tago Mago | T1 | 13.018% | 28/1 | 11 | 11 | −£1.00 | bc134729-383a-468a-8ee0-54dec254f1cc | 0ae0f583-74a8-4404-b1eb-8f3abcbad3cb |
| 2026-10-02 | Dundalk 19:00 | AW / AW_TISSUE_V1 | Purely | T1 | 18.293% | 8/1 | 5 | 2 | −£1.00 | 3f56f4ea-913b-474f-883a-7cf2e3904920 | dcc527e9-0cbb-4318-a2fb-46042387ee72 |
| 2026-10-03 | Ascot 12:15 | TURF / tissue_model_v2 | Albaydaa | T2 | 12.814% | 10/1 | 5 | 12 | −£1.00 | ec7e0993-7db9-4c47-9c52-32ab8ce45487 | 5b1109a2-6491-4e06-8f36-15685cb4600d |
| 2026-10-03 | Newmarket 13:10 | TURF / tissue_model_v2 | Topteam | T2 | 17.513% | 9/1 | 5 | 7 | −£1.00 | ac7d7399-c1cc-4f8b-92d9-5ab5b876c9e1 | 8efbd9b8-e1da-480f-b09c-d684a4874058 |
| 2026-10-03 | Ascot 14:00 | TURF / tissue_model_v2 | Elmonjed | T2 | 14.638% | 22/1 | 8 | 8 | −£1.00 | bb88ef9e-6a20-4f74-a112-d015e0b5b816 | 2c29862e-b311-4c3e-8d36-99521c2fa5b4 |
| 2026-10-03 | Gowran Park 14:05 | CHASE / JUMP_TISSUE_V1 | Emily Love | T2 | 21.692% | 33/1 | 4 | 3 | −£1.00 | 3ca5e45e-6f2d-4de8-88aa-9f1b63d89377 | 7737d6eb-4f32-483a-80f6-9d53a4ab919f |
| 2026-10-03 | Ascot 14:35 | TURF / tissue_model_v2 | Machadadorp | T2 | 7.747% | 18/1 | 9 | 8 | −£1.00 | e97cf121-ba14-493e-af49-860b3fa27014 | 6af589a5-8b39-498a-bca9-9e6c7cdb84a5 |
| 2026-10-03 | Redcar 14:55 | TURF / tissue_model_v2 | Oolong Poobong | T2 | 20.905% | 14/1 | 7 | 4 | −£1.00 | 24f25536-edb1-437e-b506-d28646f84f83 | aa304686-d5b8-4f0d-bd72-dcf316a0ba90 |
| 2026-10-03 | Ascot 15:10 | TURF / tissue_model_v2 | Adrestia | T2 | 14.511% | 9/1 | 5 | 6 | −£1.00 | e32e8f98-e7b4-4832-ac49-7ef9b2648063 | 6c946d00-b32b-447c-a792-72c98c216873 |
| 2026-10-03 | Gowran Park 15:15 | CHASE / JUMP_TISSUE_V1 | Ma Jacks Hill | T2 | 16.478% | 12/1 | 4 | 3 | −£1.00 | dfbda230-3715-4b69-9f15-ee56eb099e1c | 9eb9ac5c-3a13-4012-b00b-80fe7d76f57e |
| 2026-10-03 | Redcar 15:35 | TURF / tissue_model_v2 | Rajapour | T2 | 12.916% | 12/1 | 7 | 10 | −£1.00 | 2a25150f-8ae5-45da-be99-5eacaecfe157 | 5ca05257-292d-49d7-9a8b-9a9a6427297e |
| 2026-10-03 | Southwell 15:45 | AW / AW_TISSUE_V1 | Kuredu King | T2 | 16.659% | 9/1 | 5 | 5 | −£1.00 | 272a580b-72e9-4e59-88d7-89a0e79d9da4 | af01d8dc-417f-4989-8d3e-9703e0f02919 |
| 2026-10-03 | Fontwell 16:35 | HURDLE / JUMP_TISSUE_V1 | Callero | T1 | 17.737% | 16/1 | 6 | pulled_up | −£1.00 | e6b0cb12-782f-4c3f-8c9c-cae1b88a9aef | 480530cf-d14b-40e3-9743-5dc34bbafbeb |
| 2026-10-03 | Southwell 17:30 | AW / AW_TISSUE_V1 | Pippy Boy | T2 | 13.297% | 33/1 | 7 | 3 | −£1.00 | 237288ad-049f-4c14-b24f-8d36d170e3f1 | e5560964-7325-4017-bad0-1d43d69df654 |
| 2026-10-03 | Southwell 18:00 | AW / AW_TISSUE_V1 | Hozam | T2 | 13.354% | 12/1 | 5 | 4 | −£1.00 | 040c1e5d-13e8-4d19-bf81-eb696d6025d7 | a0d57b5c-68c9-4f00-b513-491ffbb91867 |
| 2026-10-04 | Curragh 12:55 | TURF / tissue_model_v2 | Wo Wo Never | T2 | 9.932% | 18/1 | 6 | 3 | −£1.00 | d0a5affc-1df1-4926-97c6-f71b26d9d255 | 23a17c84-1d75-4896-9ba3-2955be3c2e61 |
| 2026-10-04 | Uttoxeter 13:01 | HURDLE / JUMP_TISSUE_V1 | Mighty Dink | T1 | 20.853% | 66/1 | 7 | 6 | −£1.00 | b4926043-ef8b-446f-8f05-767e1bfb5bf1 | c0625eee-0e40-4691-a568-cd35599f640a |
| 2026-10-04 | Kelso 13:20 | HURDLE / JUMP_TISSUE_V1 | Klitschko | T2 | 15.635% | 9/1 | 6 | 4 | −£1.00 | 50730af9-07d5-41b4-a202-27ec393b0a59 | 631a76cd-06c5-4a48-a35f-a75a8e2c4794 |
| 2026-10-04 | Curragh 13:30 | TURF / tissue_model_v2 | Lewis Carroll | T1 | 18.155% | 40/1 | 9 | 4 | −£1.00 | 4cbe6a59-cb23-4938-892f-46bd93313597 | c08b056c-ca40-467e-b882-556e553ea4f8 |
| 2026-10-04 | Killarney 13:45 | HURDLE / JUMP_TISSUE_V1 | Belladaball | T1 | 16.122% | 8/1 | 4 | 5 | −£1.00 | f7a82bcd-938e-4f01-8889-46e0d015efb7 | f92b3c9a-7570-4f6f-9b69-956492b3e227 |
| 2026-10-04 | Curragh 14:05 | TURF / tissue_model_v2 | Benevento | T1 | 11.291% | 16/1 | 8 | 2 | −£1.00 | 37a1b190-47ef-401f-8876-cf60713c2a37 | 321dcce9-00c3-4462-8a9a-d15b9d131e22 |
| 2026-10-04 | Killarney 14:20 | HURDLE / JUMP_TISSUE_V1 | Prophetess Miriam | T1 | 43.453% | 22/1 | 11 | 8 | −£1.00 | 3631c604-673b-405f-8618-80db15aa1667 | 20b88ca6-0550-4ab9-983c-e5bcbb7634f9 |
| 2026-10-04 | Curragh 14:40 | TURF / tissue_model_v2 | Institute | T1 | 18.817% | 40/1 | 10 | 15 | −£1.00 | a5ac3e1a-d19c-482d-91dd-8b0ae422e243 | 2e18f2c5-a6f0-4f41-991e-c84bd6dfabb6 |
| 2026-10-04 | Curragh 15:15 | TURF / tissue_model_v2 | Therewillbeglory | T2 | 6.673% | 20/1 | 13 | 2 | −£1.00 | 042091a6-21ad-4af9-bfbb-639f791cf679 | a4ee34ea-60b1-4ff7-8129-da06dfc21c8a |
| 2026-10-04 | Curragh 15:50 | TURF / tissue_model_v2 | The Mediator | T2 | 11.829% | 14/1 | 7 | 4 | −£1.00 | b8561694-b13d-4daf-a7d0-e197736bf317 | fe7fa63f-a82a-430f-8270-1d9e356044b9 |
| 2026-10-04 | Uttoxeter 15:56 | CHASE / JUMP_TISSUE_V1 | Izzy's Grey | T2 | 18.003% | 9/1 | 4 | 2 | −£1.00 | cb2e0c55-fbc6-4d3c-af6a-ac1063feb000 | 1c98e93a-5bd0-4e6a-961f-2558a0d74895 |
| 2026-10-05 | Killarney 12:00 | TURF / tissue_model_v2 | Estado De La Luna | T2 | 9.238% | 12/1 | 6 | 4 | −£1.00 | 2c36bf3b-f10f-471f-b33e-0baa3e85c506 | 6de109db-c363-4363-94c7-b6d71175cace |
| 2026-10-05 | Pontefract 12:30 | TURF / tissue_model_v2 | Beloved Country | T2 | 21.073% | 9/1 | 3 | 3 | −£1.00 | ca1c28ca-6233-46e5-b033-8368fe8d518b | dbb11f67-2850-40dd-a5ab-80e6622f5587 |
| 2026-10-05 | Pontefract 13:05 | TURF / tissue_model_v2 | Kigali | T2 | 15.127% | 20/1 | 8 | 2 | −£1.00 | a8323717-159b-498b-ba87-a059cb939dde | 23efd3ea-ce9a-48c3-9cd0-86f8f881451b |
| 2026-10-05 | Killarney 13:10 | TURF / tissue_model_v2 | Closely | T1 | 18.440% | 25/1 | 8 | 5 | −£1.00 | 148c5861-bd34-4bc7-ad2a-16f625af2297 | 300dbd45-a224-47c9-8d4d-0116c710f711 |
| 2026-10-05 | Fairyhouse 13:30 | HURDLE / JUMP_TISSUE_V1 | Grey Fable | T1 | 14.086% | 33/1 | 6 | 5 | −£1.00 | 8c5885d1-0cff-4131-aaed-6a0b69037cb3 | ffc3d16f-e5e4-4032-9bac-f064310a07fb |
| 2026-10-05 | Fairyhouse 13:30 | HURDLE / JUMP_TISSUE_V1 | Crystal Mariner | T2 | 13.425% | 11/1 | 3 | 6 | −£1.00 | 8c5885d1-0cff-4131-aaed-6a0b69037cb3 | 5887f9ad-9072-4466-b763-80efd06f25d8 |
| 2026-10-05 | Fairyhouse 14:05 | HURDLE / JUMP_TISSUE_V1 | Tropical Twist | T1 | 15.710% | 12/1 | 7 | 5 | −£1.00 | 73144041-3e5d-47f9-a4a9-03511657754c | adf36691-2787-4d59-b07f-f02f36540555 |
| 2026-10-05 | Fairyhouse 14:40 | HURDLE / JUMP_TISSUE_V1 | Bigcitydreams | T2 | 14.677% | 66/1 | 10 | 10 | −£1.00 | 35f00ef1-1d6f-4152-8b05-bfe8ea6a8a85 | eecd72e9-833f-4bba-b84d-cb20286cd3ff |
| 2026-10-05 | Pontefract 14:50 | TURF / tissue_model_v2 | Cape Ashizuri | T2 | 11.734% | 11/1 | 7 | 10 | −£1.00 | 89ee676d-2c1d-4a6b-ad12-fca7bbda373a | 6c8f6ea0-5be7-4e1b-8624-b4080087af9d |
| 2026-10-05 | Yarmouth 15:05 | TURF / tissue_model_v2 | Box To Box | T2 | 14.297% | 9/1 | 5 | 5 | −£1.00 | fda26b0d-1e0a-4051-9d9d-1b5112bc6693 | 76621c8e-8884-4b37-9762-217b5aece7b4 |
| 2026-10-05 | Fairyhouse 15:15 | HURDLE / JUMP_TISSUE_V1 | Gunnery Sergeant | T1 | 11.659% | 25/1 | 7 | 3 | −£1.00 | d1d9ab8d-f483-4c82-8d6a-38115cdcae82 | df75dd85-6f4a-4b08-84b4-b4d9dec99bce |
| 2026-10-05 | Pontefract 15:21 | TURF / tissue_model_v2 | On The Inlet | T2 | 11.938% | 11/1 | 7 | 11 | −£1.00 | a775b434-389e-4f36-826b-5f7d7b42cfd8 | 8ad0cea2-3871-4527-86ca-d6310b1ffb82 |
| 2026-10-05 | Yarmouth 15:40 | TURF / tissue_model_v2 | Colonnade | T2 | 14.844% | 10/1 | 6 | 9 | −£1.00 | 4d495e5c-fd76-4581-9002-56cc5e318664 | 36e05e35-859a-416b-b2cf-34e1bd02ea2f |
| 2026-10-05 | Kempton 15:45 | AW / AW_TISSUE_V1 | Magic Box | T2 | 16.136% | 14/1 | 9 | 3 | −£1.00 | fe11bb6b-475c-47fd-85f0-f9bd4863e7e7 | 6e4f1bde-9594-47db-858f-1f160e047005 |
| 2026-10-05 | Wolverhampton 16:00 | AW / AW_TISSUE_V1 | Birkacre Brow | T1 | 15.558% | 25/1 | 8 | 2 | −£1.00 | 156077ee-cd8a-4adc-a883-db4bda423d52 | e89fed3b-5884-48ab-811f-5732e317ea79 |
| 2026-10-05 | Kempton 16:15 | AW / AW_TISSUE_V1 | Allaire | T2 | 14.171% | 17/2 | 3 | 3 | −£1.00 | 8a33167e-733b-4af6-9b07-0c546c273780 | 4379f98c-99fc-48a0-b131-802b7039f752 |
| 2026-10-05 | Fairyhouse 16:25 | HURDLE / JUMP_TISSUE_V1 | Whiskey Serenade | T1 | 13.001% | 22/1 | 11 | 9 | −£1.00 | c9792baf-7749-4279-a11c-1f490a36c0c0 | 340d06fe-df9f-477c-a76b-360b6cb0bfd1 |
| 2026-10-05 | Pontefract 16:33 | TURF / tissue_model_v2 | Beerwah | T1 | 13.192% | 14/1 | 9 | 11 | −£1.00 | 2ac34b97-d1a5-4f67-881f-b8517b66c6b8 | f07f909c-441f-4e2e-bdaa-24d90d14be09 |
| 2026-10-05 | Pontefract 16:33 | TURF / tissue_model_v2 | Under The Radar | T2 | 9.738% | 9/1 | 6 | 12 | −£1.00 | 2ac34b97-d1a5-4f67-881f-b8517b66c6b8 | 62f7c36b-f2b7-44a3-a9a7-0de5e2f275a4 |
| 2026-10-05 | Wolverhampton 17:00 | AW / AW_TISSUE_V1 | Thai Baht | T2 | 12.995% | 25/1 | 7 | 5 | −£1.00 | 8bdacc92-be1a-412a-846d-7e9c0974a446 | 860122bf-bbb6-444b-8ecc-a1a2a6ef7bac |
| 2026-10-05 | Kempton 17:15 | AW / AW_TISSUE_V1 | Pixie Diva | T1 | 13.861% | 12/1 | 5 | 8 | −£1.00 | 1536405f-3759-472a-a94c-bba9343bb50f | 694834f8-2391-4b3e-870d-0362c4185907 |
| 2026-10-05 | Kempton 17:45 | AW / AW_TISSUE_V1 | Wyle Cop | T2 | 14.275% | 33/1 | 9 | 8 | −£1.00 | 9213161b-fe01-456f-ab7f-15341cf3046d | 7e2bb603-2dda-442b-9c16-de173deaebeb |
| 2026-10-05 | Wolverhampton 18:00 | AW / AW_TISSUE_V1 | Little Miss India | T2 | 18.215% | 33/1 | 10 | 7 | −£1.00 | 7b879514-aac6-4ca2-8c0e-85b1f4939b97 | 834f7312-7662-4529-884b-2a9e5398f6f5 |
| 2026-10-05 | Kempton 18:15 | AW / AW_TISSUE_V1 | Camera Shy | T1 | 11.290% | 17/2 | 6 | 5 | −£1.00 | cf576b57-8ed3-4fd2-9d6c-99de27dcc901 | 601c2016-6770-422b-8737-dfaeb12d07da |
| 2026-10-05 | Wolverhampton 18:30 | AW / AW_TISSUE_V1 | Eastern Veil | T2 | 14.924% | 9/1 | 4 | 3 | −£1.00 | 606022da-8eca-4d8f-82b6-f4bb4c841371 | da9f2c1e-20ca-41dd-a14b-e2baa779f750 |
| 2026-10-05 | Wolverhampton 19:30 | AW / AW_TISSUE_V1 | Dublin Bay | T2 | 11.325% | 10/1 | 6 | 11 | −£1.00 | fb1c80ed-7b90-41fc-8d37-b2d5efbbecb5 | 56dbe1e0-d5a9-4114-ae36-c7874d5ff4b3 |
| 2026-10-06 | Leicester 12:31 | TURF / tissue_model_v2 | Moostar | T1 | 15.891% | 12/1 | 9 | 1 | +£12.00 | f4563604-6918-44ac-a726-211c5f059f65 | 448c4b02-a990-46b8-985a-8ef9cebecf9e |
| 2026-10-06 | Galway 13:20 | HURDLE / JUMP_TISSUE_V1 | Just For One | T1 | 16.484% | 14/1 | 6 | 7 | −£1.00 | 4fc6938d-5034-4315-bcf5-bad8d8f97c7c | 7b8acb6b-47df-473f-aec3-235168b5e046 |
| 2026-10-06 | Galway 13:20 | HURDLE / JUMP_TISSUE_V1 | Grandy Lane | T2 | 12.075% | 22/1 | 8 | 11 | −£1.00 | 4fc6938d-5034-4315-bcf5-bad8d8f97c7c | ded820a8-9496-4ef3-9d23-a2cd7e20d912 |
| 2026-10-06 | Leicester 13:41 | TURF / tissue_model_v2 | Lady Of Hay | T1 | 10.595% | 22/1 | 11 | 1 | +£22.00 | d0535f84-3a46-4f9b-98a1-badd9bf80a24 | 321c2323-8c69-4884-a245-d6431e9de7af |
| 2026-10-06 | Leicester 13:41 | TURF / tissue_model_v2 | Dream On Kent | T2 | 10.435% | 10/1 | 5 | 5 | −£1.00 | d0535f84-3a46-4f9b-98a1-badd9bf80a24 | ae88583f-1b86-4cb9-b90a-5562fffa30c7 |
| 2026-10-06 | Galway 13:55 | HURDLE / JUMP_TISSUE_V1 | Western Shores | T1 | 23.713% | 17/2 | 5 | 7 | −£1.00 | 67e5841d-03c3-45e8-9396-4f51a3b9efa2 | 3a65c082-dfd2-4716-bb21-7c8b9d25d3e0 |
| 2026-10-06 | Southwell 15:55 | AW / AW_TISSUE_V1 | The Pug | T2 | 11.470% | 8/1 | 4 | 5 | −£1.00 | 6f53714e-55bd-4456-93a9-5df398ce3938 | c4894345-40e8-4030-9706-3cb4094c910e |
| 2026-10-06 | Southwell 16:30 | AW / AW_TISSUE_V1 | Price Tag | T2 | 10.635% | 80/1 | 8 | 8 | −£1.00 | 94b79d92-3a7a-4168-b9c9-11d7da324b50 | 1c892f76-7360-4fe5-81b5-4c418fca610f |
| 2026-10-06 | Southwell 18:00 | AW / AW_TISSUE_V1 | Remi Mae | T1 | 14.352% | 16/1 | 7 | 7 | −£1.00 | 3c8747f0-5102-4487-bd7f-d3b7c2d960d2 | 1a5a5431-dfab-4325-91be-1046d0f28c1d |
| 2026-10-06 | Southwell 18:30 | AW / AW_TISSUE_V1 | Hellcat | T2 | 11.166% | 14/1 | 5 | 8 | −£1.00 | ebca025c-4acf-4324-b60c-50015e248a97 | b9508ddc-12cd-443d-9f1f-2823a8fd717f |
| 2026-10-07 | Navan 13:15 | TURF / tissue_model_v2 | Metallic | T2 | 18.423% | 66/1 | 7 | 10 | −£1.00 | d97de4d2-df27-4dd1-991f-b1c780ff66cc | 8c64c9d9-10bd-433c-a98c-b53ef1dfc6c7 |
| 2026-10-07 | Navan 13:45 | TURF / tissue_model_v2 | Celestial Crown | T2 | 14.933% | 10/1 | 5 | 1 | +£10.00 | 152ca263-ad3e-4af5-8088-afb9048d2672 | 4a73929c-d922-4167-a73d-37e975ddc488 |
| 2026-10-07 | Sedgefield 13:50 | CHASE / JUMP_TISSUE_V1 | Neigh Botha | T1 | 32.341% | 11/1 | 4 | 3 | −£1.00 | 82fbbc89-fada-4b17-9b9b-baced566b6f1 | 07c0697d-4e21-4519-8e6d-9276fab4ccfb |
| 2026-10-07 | Nottingham 13:59 | TURF / tissue_model_v2 | Kanzi | T2 | 23.525% | 14/1 | 5 | 5 | −£1.00 | 82d59ecc-4350-4e8a-a94d-b7acdadff3e0 | 40f5a34a-cb75-43c8-a714-36e577b61c56 |
| 2026-10-07 | Navan 14:15 | TURF / tissue_model_v2 | Treasured Royal | T1 | 8.749% | 50/1 | 17 | 16 | −£1.00 | daed07ba-1911-4d2b-981c-6db67b208e3b | b9b9db7c-3e5a-4ec2-bc7c-681a29fccb11 |
| 2026-10-07 | Navan 14:45 | TURF / tissue_model_v2 | Magna Cum Laude | T1 | 14.776% | 40/1 | 5 | 5 | −£1.00 | 9dd05c48-6765-4bdd-9023-0d2b83085bd8 | d06aeaa4-fffe-499c-8c7b-da5e538b5ecb |
| 2026-10-07 | Nottingham 14:59 | TURF / tissue_model_v2 | Orchard | T1 | 16.304% | 28/1 | 11 | 5 | −£1.00 | 5fc972ac-db63-4ce2-bf48-b7ed74e19bd8 | 211ca885-2c18-47b0-8cc8-2e88e94ef26a |
| 2026-10-07 | Worcester 15:05 | HURDLE / JUMP_TISSUE_V1 | Calibos | T1 | 16.888% | 11/1 | 6 | 3 | −£1.00 | 6be2179e-4f87-4d00-a24d-5c8cb984d5b9 | f71bb896-5d4e-416e-9894-6f6546cd3cc9 |
| 2026-10-07 | Worcester 15:05 | HURDLE / JUMP_TISSUE_V1 | Famous Shoes | T2 | 16.618% | 18/1 | 8 | pulled_up | −£1.00 | 6be2179e-4f87-4d00-a24d-5c8cb984d5b9 | 2ba09d4f-0710-4c6d-bc95-1eb39dfa4c91 |
| 2026-10-07 | Navan 15:15 | TURF / tissue_model_v2 | Sanctijude | T2 | 13.989% | 9/1 | 6 | 3 | −£1.00 | 5ce85353-9dac-46f0-9c3f-a00c6bcc5e6b | b41ab745-e4b0-4b45-bd6a-d4ba8b4f2fe4 |
| 2026-10-07 | Navan 15:48 | TURF / tissue_model_v2 | Matties Point | T2 | 9.833% | 17/2 | 6 | 14 | −£1.00 | 7e46c6be-429c-43e0-9559-ed533806fdfe | af1d4c6a-ef97-48ab-b069-ac1ffbf02448 |
| 2026-10-07 | Kempton 16:00 | AW / AW_TISSUE_V1 | Receipt | T1 | 16.408% | 20/1 | 7 | 8 | −£1.00 | cc461d78-0523-4d12-a2ca-8fc8568a29e8 | 082a765b-0660-4ea6-bcfd-01bcf3f44221 |
| 2026-10-07 | Navan 16:18 | TURF / tissue_model_v2 | Dark Summit | T1 | 9.543% | 17/2 | 6 | 3 | −£1.00 | dcfb5351-64fd-4f2d-b785-697880e922e1 | 3aacb536-b007-4695-bbe9-e1980901d591 |
| 2026-10-07 | Kempton 18:00 | AW / AW_TISSUE_V1 | Because We Can | T2 | 8.741% | 8/1 | 3 | 3 | −£1.00 | 260106f4-4a2e-4f63-ba2c-d7c9ed8afef3 | 9fee7d5b-02f8-46ba-9596-da5ddfc65cf5 |
| 2026-10-07 | Kempton 19:00 | AW / AW_TISSUE_V1 | Benvoy | T2 | 14.711% | 17/2 | 6 | 1 | +£8.50 | 4137c360-7cc3-440e-8dd5-3b4a78482d21 | 8c6b2f39-5b48-484b-88eb-d9e325166bf2 |
| 2026-10-07 | Kempton 19:30 | AW / AW_TISSUE_V1 | Blue Samuna | T1 | 15.378% | 16/1 | 8 | 10 | −£1.00 | d38ba962-829a-49d5-a8ee-2e93a06b48c3 | 91e59672-fd9a-45d7-9525-e15da3219673 |
| 2026-10-07 | Kempton 19:30 | AW / AW_TISSUE_V1 | Makes Me Wonder | T2 | 10.716% | 12/1 | 6 | 6 | −£1.00 | d38ba962-829a-49d5-a8ee-2e93a06b48c3 | c12b6466-0c61-45de-8c5a-2fdc3bc9e495 |
| 2026-10-08 | Thurles 12:16 | TURF / tissue_model_v2 | Ophelia | T2 | 16.271% | 25/1 | 5 | 4 | −£1.00 | 1579b58d-e646-47fe-ac43-31a9f4da2246 | 02f0455b-c4b3-40b8-8804-7eab0d2b3ffa |
| 2026-10-08 | Ayr 12:45 | TURF / tissue_model_v2 | Royal Blaze | T2 | 12.154% | 28/1 | 10 | 8 | −£1.00 | 22169a97-df5d-4eab-811b-b95af89886a5 | a2e283ab-732b-4983-8b83-53558d6f9e9c |
| 2026-10-08 | Thurles 12:51 | TURF / tissue_model_v2 | Battle Ready | T1 | 12.807% | 20/1 | 5 | 3 | −£1.00 | 76c80765-a703-4ff1-b2e8-b805cfe87ab5 | 8390e043-5602-4c43-a838-3d33ebaa0f50 |
| 2026-10-08 | Bath 13:40 | TURF / tissue_model_v2 | Recon Mission | T2 | 11.215% | 25/1 | 11 | 14 | −£1.00 | e986a825-39e0-4ab2-a16b-5210ada7e3ab | 1f69fd07-a639-42e1-ad38-e4efd389adb8 |
| 2026-10-08 | Tramore 13:45 | HURDLE / JUMP_TISSUE_V1 | Million Dollar Man | T2 | 14.050% | 20/1 | 7 | 7 | −£1.00 | ad6502e8-f047-4aee-b718-ce4bcd5b9471 | 22fbca94-618f-4cb2-8ed0-93c1152acb1a |
| 2026-10-08 | Bath 14:15 | TURF / tissue_model_v2 | Venetia | T2 | 13.876% | 17/2 | 4 | 11 | −£1.00 | f43b1975-bf39-44fc-8573-8f4a155668c7 | 7a42b20e-907d-4a7c-b34c-e21fb0ba95a4 |
| 2026-10-08 | Ayr 14:30 | TURF / tissue_model_v2 | Dandy Magic | T2 | 11.678% | 10/1 | 4 | 5 | −£1.00 | b49992ec-ee37-4165-b0d8-156df9cfa61e | 22553efb-2ba5-4412-afa7-6f00fc1556d9 |
| 2026-10-08 | Bath 14:50 | TURF / tissue_model_v2 | Grapple | T1 | 16.316% | 14/1 | 5 | 7 | −£1.00 | e02de427-ee6d-429c-8c70-5422deaf50f6 | 121e63bc-b894-4153-992d-481842506512 |
| 2026-10-08 | Ayr 15:05 | TURF / tissue_model_v2 | Valentine Catcher | T2 | 13.023% | 8/1 | 5 | 10 | −£1.00 | 232aa0ec-e17d-4386-83ba-3c9edc06b206 | ed937f1f-2569-459e-944f-53763788cd13 |
| 2026-10-08 | Thurles 15:11 | TURF / tissue_model_v2 | Vantage Code | T2 | 24.145% | 12/1 | 5 | 5 | −£1.00 | 6ad34afb-1b49-408d-a7b4-4886d01514f6 | 804f5685-63e0-4f94-804d-cd630e5aaa0f |
| 2026-10-08 | Market Rasen 15:16 | HURDLE / JUMP_TISSUE_V1 | Leave Her To Me | T1 | 18.262% | 12/1 | 7 | 7 | −£1.00 | 9435864a-e9d5-4d46-97d0-4fa2e034a8da | b797193b-cf37-4106-a914-2a70951ec83d |
| 2026-10-08 | Ayr 15:38 | TURF / tissue_model_v2 | Hear The Drums | T1 | 11.254% | 16/1 | 8 | 8 | −£1.00 | 24ea5826-b31d-4415-abdf-add875bb7c53 | 61bd4cce-09d6-48d7-8db8-6ee216079a85 |
| 2026-10-08 | Ayr 15:38 | TURF / tissue_model_v2 | Ravishing Beauty | T2 | 9.599% | 16/1 | 8 | 4 | −£1.00 | 24ea5826-b31d-4415-abdf-add875bb7c53 | ffb7dd2d-f65c-40f0-af7f-56fae0066026 |
| 2026-10-08 | Thurles 15:43 | TURF / tissue_model_v2 | Purple Bandit | T1 | 20.249% | 14/1 | 5 | 5 | −£1.00 | 66da29c4-5c10-4322-aa90-7468ebda7921 | afa3925c-31c6-4116-8eb7-d2ed815e14c4 |
| 2026-10-08 | Southwell 16:00 | AW / AW_TISSUE_V1 | State Express | T2 | 12.869% | 9/1 | 6 | 1 | +£9.00 | 5ea83f21-ca43-4d07-af9d-33ff29ac7a92 | dcc5ba7c-0bf7-410d-8eb7-130ed8e1a446 |
| 2026-10-08 | Tramore 16:05 | CHASE / JUMP_TISSUE_V1 | Laska Du Breuil | T2 | 16.512% | 80/1 | 8 | 5 | −£1.00 | 150cde10-5f88-4aa7-a47c-38736d0cf150 | 93059c3d-2a6b-4070-bdd0-48b2364c4e16 |
| 2026-10-08 | Ayr 16:13 | TURF / tissue_model_v2 | Wootton's Gal | T2 | 21.486% | 10/1 | 4 | 4 | −£1.00 | de851c41-0b20-42b6-8124-3f937bff42c5 | 2a2ad661-d6f2-4ddf-b08f-7d2814f0c429 |
| 2026-10-08 | Thurles 16:20 | TURF / tissue_model_v2 | Granville Street | T2 | 9.988% | 10/1 | 5 | 3 | −£1.00 | 93ff3e6e-a5ae-4589-8083-a24d40c5a3f0 | dda7bd18-e8a8-47a5-8d81-878a54385e94 |
| 2026-10-08 | Southwell 17:00 | AW / AW_TISSUE_V1 | Strong Performance | T2 | 12.262% | 8/1 | 4 | 7 | −£1.00 | d6611f1a-d1e3-4ad1-a6b8-151895d54724 | 7b8bbee1-5944-4c43-8dc3-4bc71daec32e |
| 2026-10-08 | Southwell 17:30 | AW / AW_TISSUE_V1 | Astral Calling | T2 | 12.917% | 10/1 | 4 | 8 | −£1.00 | 85b1ddee-6015-4ff7-8588-1024b8cbe207 | 667f7750-0f01-48cc-bb79-cc5bb4610c8a |
| 2026-10-08 | Southwell 18:30 | AW / AW_TISSUE_V1 | Volto Di Medusa | T2 | 12.024% | 18/1 | 8 | 10 | −£1.00 | a53f12ef-437c-4015-b2bb-ad6e01ebfef5 | 06e5f369-d211-4c0a-84ed-c9ab9e061bbe |
| 2026-10-08 | Southwell 19:00 | AW / AW_TISSUE_V1 | Cool King | T2 | 11.909% | 11/1 | 3 | 1 | +£11.00 | 31d76439-b73b-4d7f-aad5-625798316292 | 7ea42ab9-7a6a-4c94-89af-841ed2c68406 |
| 2026-10-09 | York 12:30 | TURF / tissue_model_v2 | Power Fizz | T2 | 14.664% | 12/1 | 7 | 6 | −£1.00 | 621e6884-8a70-4b85-9af3-7ba794a51038 | 97eaa0ce-a846-47f2-9c5c-63c9e6c2956c |
| 2026-10-09 | Newmarket 12:50 | TURF / tissue_model_v2 | Golden Ring | T1 | 11.339% | 9/1 | 7 | 7 | −£1.00 | 3744ee3f-1301-4a1a-b1bb-7d1db6231412 | 8be25217-be7d-41d1-b786-bbc3f0125347 |
| 2026-10-09 | Newmarket 12:50 | TURF / tissue_model_v2 | Forest Berry | T2 | 8.645% | 150/1 | 13 | 14 | −£1.00 | 3744ee3f-1301-4a1a-b1bb-7d1db6231412 | ddae4bf3-9e90-4497-94c1-c46739da5faf |
| 2026-10-09 | Chepstow 12:57 | HURDLE / JUMP_TISSUE_V1 | Cheap Sandwiches | T2 | 13.322% | 12/1 | 4 | 5 | −£1.00 | b8abeaa9-9d2c-4e14-beaf-3059677aa5fd | 3cefa2f5-c129-46d5-af2a-bc2e4282a954 |
| 2026-10-09 | Newmarket 13:57 | TURF / tissue_model_v2 | Haven | T2 | 17.960% | 28/1 | 6 | 2 | −£1.00 | 0a489017-d240-4605-a366-2cc5b9a9d132 | bdae0701-4c53-4896-9fd0-20e91c96c88c |
| 2026-10-09 | Chepstow 14:12 | HURDLE / JUMP_TISSUE_V1 | Serious Challenge | T2 | 9.325% | 22/1 | 11 | 16 | −£1.00 | 4d880b11-7db6-4b6e-8062-062bc60d960d | 2fe1e129-ecba-4c2e-b9ed-648aae303717 |
| 2026-10-09 | York 14:18 | TURF / tissue_model_v2 | Mugheer | T1 | 43.568% | 50/1 | 4 | 3 | −£1.00 | 3c78d0f9-c584-4a03-aee9-7984613669ae | 2c115c0a-592d-4947-903a-2083a726a273 |
| 2026-10-09 | Newmarket 14:30 | TURF / tissue_model_v2 | Study Of Words | T1 | 22.588% | 10/1 | 5 | 1 | +£10.00 | 0ae685f3-5326-49c1-a974-c560fe0cec3c | dfb76f24-8b45-481b-b113-c8ccb3799a01 |
| 2026-10-09 | Kempton 15:05 | AW / AW_TISSUE_V1 | Halliwell Stream | T2 | 15.255% | 16/1 | 5 | 7 | −£1.00 | b92a8027-c7e9-4764-b81d-399cd589044a | 3bea0bab-eca9-417d-aead-d783ae568094 |
| 2026-10-09 | Chepstow 15:17 | HURDLE / JUMP_TISSUE_V1 | Opening Bid | T2 | 10.362% | 28/1 | 12 | 4 | −£1.00 | ca5a0385-53b2-4425-9fcd-d5bec983cf84 | 146091d9-08ea-4536-a5ab-5fa46f2fc1f7 |
| 2026-10-09 | Downpatrick 15:30 | HURDLE / JUMP_TISSUE_V1 | Ersudaly | T1 | 14.996% | 12/1 | 8 | 2 | −£1.00 | 168fd8a4-b27d-452a-952d-b22ab085e176 | 7f1fe4cc-951a-4f00-b759-e840683f761a |
| 2026-10-09 | Downpatrick 15:30 | HURDLE / JUMP_TISSUE_V1 | King Of Westeros | T2 | 9.230% | 12/1 | 8 | 7 | −£1.00 | 168fd8a4-b27d-452a-952d-b22ab085e176 | e9bbc1a1-4777-445c-9861-9c8030ad1681 |
| 2026-10-09 | Dundalk 15:50 | AW / AW_TISSUE_V1 | Ippy | T2 | 10.215% | 10/1 | 3 | 7 | −£1.00 | f0cd9455-ad1e-4524-a3e3-98da92ca48b8 | b65cdcf4-dedb-47c8-9a68-271fdea73814 |
| 2026-10-09 | Chepstow 15:55 | HURDLE / JUMP_TISSUE_V1 | Mostly Sunny | T1 | 11.366% | 22/1 | 9 | 13 | −£1.00 | 59da6192-063d-4e36-b768-69ac5700d718 | 5c49cd35-4949-4dba-98b6-0a17173a951b |
| 2026-10-09 | Chepstow 15:55 | HURDLE / JUMP_TISSUE_V1 | Codetalker | T2 | 10.892% | 9/1 | 6 | 1 | +£9.00 | 59da6192-063d-4e36-b768-69ac5700d718 | 337024b4-519a-45a5-b58f-9710c1723f9d |
| 2026-10-09 | York 16:00 | TURF / tissue_model_v2 | Obelix | T1 | 7.551% | 14/1 | 10 | 20 | −£1.00 | 9a6d5fa4-c909-4adb-a740-0347b830341b | 49c4f451-a14d-4e80-a30c-903256b3c2fa |
| 2026-10-09 | York 16:00 | TURF / tissue_model_v2 | The Childe Of Hale | T2 | 7.214% | 16/1 | 12 | 9 | −£1.00 | 9a6d5fa4-c909-4adb-a740-0347b830341b | 49d0bf37-5bf1-4d93-a127-72751eb47acb |
| 2026-10-09 | Kempton 16:15 | AW / AW_TISSUE_V1 | Grey Sands | T1 | 11.614% | 25/1 | 10 | 5 | −£1.00 | a5289c78-2650-417b-b319-1a0f594a80fa | 092278e2-1c7c-41dc-992b-8e563d9420f2 |
| 2026-10-09 | Dundalk 16:25 | AW / AW_TISSUE_V1 | The Pipeman | T1 | 13.229% | 8/1 | 5 | 1 | +£8.00 | 619ffd46-cbb7-499d-9881-5fc81b18ff25 | 1b2205ed-0d8e-410d-bf00-72ac7128c332 |
| 2026-10-09 | Dundalk 16:25 | AW / AW_TISSUE_V1 | Tio Joao | T2 | 12.231% | 14/1 | 9 | 6 | −£1.00 | 619ffd46-cbb7-499d-9881-5fc81b18ff25 | 358fd685-3bf2-4a01-ae34-a344118f2a21 |
| 2026-10-09 | Downpatrick 16:37 | CHASE / JUMP_TISSUE_V1 | Custers Mistake | T1 | 16.131% | 33/1 | 12 | pulled_up | −£1.00 | 3fe6b7cc-865c-4034-b67a-2a4eef267331 | 0933d5f0-b816-4868-8622-87a8400b2ad6 |
| 2026-10-09 | Dundalk 17:00 | AW / AW_TISSUE_V1 | Lahore Da King | T1 | 12.182% | 10/1 | 6 | 8 | −£1.00 | c6346305-bea1-42ac-9546-78cdc35df980 | 28b5b778-ec17-449c-b1e4-62c25c33888d |
| 2026-10-10 | Chepstow 12:35 | HURDLE / JUMP_TISSUE_V1 | Pass The Buck | T1 | 15.753% | 11/1 | 6 | 2 | −£1.00 | 32527768-d81c-49a5-818e-0a75b2a71ae2 | 1a793492-2839-4ee7-b7e1-a63d435b385f |
| 2026-10-10 | Chepstow 12:35 | HURDLE / JUMP_TISSUE_V1 | Houndswood Willow | T2 | 13.440% | 12/1 | 7 | 5 | −£1.00 | 32527768-d81c-49a5-818e-0a75b2a71ae2 | 3c3f6972-b9bb-4f10-86f0-90eee1b551c4 |
| 2026-10-10 | Naas 12:40 | TURF / tissue_model_v2 | All Talk | T2 | 9.415% | 33/1 | 10 | 9 | −£1.00 | 4b89542a-2d73-4a03-b202-0aee22ea02a4 | e664063d-1575-417d-8161-1c98400c0373 |
| 2026-10-10 | Hexham 12:43 | HURDLE / JUMP_TISSUE_V1 | Presentandcorrect | T1 | 39.566% | 17/2 | 3 | 2 | −£1.00 | 5aca3628-7b12-4b94-80d3-6b5221fbb474 | 5e8a1eec-1240-4c84-a955-747beee987d4 |
| 2026-10-10 | Fairyhouse 12:58 | CHASE / JUMP_TISSUE_V1 | Tatateo | T2 | 12.991% | 12/1 | 3 | 6 | −£1.00 | a6550190-5d49-4787-bdd5-71a9ac9d14e7 | ea75d0d0-96bb-4cf3-8e2c-b83a85a45f1f |
| 2026-10-10 | York 13:05 | TURF / tissue_model_v2 | Yabher | T1 | 12.705% | 18/1 | 9 | 8 | −£1.00 | d2c8d894-f9aa-463a-b30a-58674dea124e | 08d9f695-b5df-43d6-a57d-a775957f679a |
| 2026-10-10 | Chepstow 13:10 | HURDLE / JUMP_TISSUE_V1 | Edelak | T2 | 13.874% | 22/1 | 11 | 6 | −£1.00 | c9ef7a88-724b-4cf9-a889-468c55b540c5 | 5e4df724-afbf-4d9c-9c4d-695513317982 |
| 2026-10-10 | Chepstow 13:45 | HURDLE / JUMP_TISSUE_V1 | Hitintheheadlines | T1 | 23.047% | 14/1 | 5 | 1 | +£14.00 | d6d7c64e-3310-4c4e-8780-ecd6348d75dc | 6ef19c5e-02ef-4d6e-927e-373e22dfec5a |
| 2026-10-10 | Chepstow 13:45 | HURDLE / JUMP_TISSUE_V1 | Herbygoesbananas | T2 | 11.840% | 25/1 | 7 | 9 | −£1.00 | d6d7c64e-3310-4c4e-8780-ecd6348d75dc | 6ebafa6b-9cc1-40d5-a4f2-31098c43f175 |
| 2026-10-10 | Naas 13:50 | TURF / tissue_model_v2 | La Tache | T1 | 21.075% | 11/1 | 5 | 4 | −£1.00 | 3eab23d5-83af-4809-bd4f-dc1de423458a | 7ebc41b0-d47c-474b-8e2e-397f4d94046e |
| 2026-10-10 | Naas 13:50 | TURF / tissue_model_v2 | New Yorker | T2 | 17.105% | 14/1 | 6 | 7 | −£1.00 | 3eab23d5-83af-4809-bd4f-dc1de423458a | 65a6a1bd-961b-4121-816a-e8c4f4f08ae1 |
| 2026-10-10 | York 14:17 | TURF / tissue_model_v2 | Old Is Gold | T1 | 10.565% | 17/2 | 4 | 5 | −£1.00 | 34d09c70-b842-4035-8c14-cd43efd785d2 | a384816a-77d8-4c6a-b3f1-3f1ef9077728 |
| 2026-10-10 | Naas 14:28 | TURF / tissue_model_v2 | Luna Mia | T2 | 14.207% | 150/1 | 9 | 6 | −£1.00 | afcc5600-fdf3-4da7-9d80-1828511c0e3e | ccfbd633-ddb8-4603-a470-7bd8a2dbc0b2 |
| 2026-10-10 | Newmarket 14:40 | TURF / tissue_model_v2 | Valedictory | T1 | 9.586% | 11/1 | 6 | 21 | −£1.00 | fac493d8-ac61-4623-a58c-57691ce5c4a2 | e24f9267-b6fd-41d3-b5a0-e1ff133b8f2a |
| 2026-10-10 | Newmarket 14:40 | TURF / tissue_model_v2 | High Fibre | T2 | 6.544% | 12/1 | 7 | 4 | −£1.00 | fac493d8-ac61-4623-a58c-57691ce5c4a2 | 71ad72ce-6243-4614-877d-22f0dbf91295 |
| 2026-10-10 | Chepstow 15:02 | HURDLE / JUMP_TISSUE_V1 | Our Guide | T2 | 9.214% | 10/1 | 5 | 3 | −£1.00 | ed94780f-7b4d-4b62-b89f-1c8b862b89ff | fc120fa4-94e3-4b0a-8480-c5a7870ab5c1 |
| 2026-10-10 | Naas 15:08 | TURF / tissue_model_v2 | Allsortz | T1 | 12.753% | 10/1 | 7 | 10 | −£1.00 | 906317ac-b778-480a-b093-edd1e22e539e | d7939a83-a86f-4ccd-95f4-80cf39251edb |
| 2026-10-10 | Southwell 15:10 | AW / AW_TISSUE_V1 | El Fox | T2 | 10.024% | 10/1 | 7 | 1 | +£10.00 | b474095e-b4b1-413c-9dc9-29b5527f8672 | 7bf6fe13-0f9c-406d-880e-dd6c31c5cd06 |
| 2026-10-10 | Chepstow 15:35 | HURDLE / JUMP_TISSUE_V1 | Jager Time | T1 | 13.851% | 16/1 | 10 | 9 | −£1.00 | fa2c6124-7338-4d8b-9e03-29faf564803e | 02d3f23d-f160-4a3d-89e3-fab14f75bb57 |
| 2026-10-10 | Chepstow 15:35 | HURDLE / JUMP_TISSUE_V1 | Jupiter Allen | T2 | 10.221% | 20/1 | 11 | 12 | −£1.00 | fa2c6124-7338-4d8b-9e03-29faf564803e | d2e1ead7-ac42-4b01-a8e5-dd7b14a28f71 |
| 2026-10-10 | Southwell 15:45 | AW / AW_TISSUE_V1 | No Knee Never | T1 | 12.968% | 14/1 | 6 | 5 | −£1.00 | 32ac42fb-94cf-46e7-817f-630b08e488d1 | c13fff7b-7337-4551-acdc-03b41c0b93ce |
| 2026-10-10 | Hexham 15:55 | CHASE / JUMP_TISSUE_V1 | Wal Buck's | T2 | 16.586% | 18/1 | 9 | 2 | −£1.00 | a1978c46-d877-447f-b27c-2873dbc21653 | c3bca2bf-eebe-4f80-9475-493a03ce0ac9 |
| 2026-10-10 | Fairyhouse 16:00 | HURDLE / JUMP_TISSUE_V1 | Jurality | T2 | 8.086% | 11/1 | 6 | 6 | −£1.00 | 06941a1b-79f0-45f0-beaf-aa2f5e0f6298 | fb1bc7b0-d923-44c0-aa0f-71b9eba18410 |
| 2026-10-10 | York 16:07 | TURF / tissue_model_v2 | Applesandpears | T1 | 9.983% | 28/1 | 14 | 16 | −£1.00 | 2bdb09ed-31bb-4a00-855d-eff18c7ca5e3 | c7499ac4-a58c-4c6e-9237-bfecf70d3ec8 |
| 2026-10-10 | York 16:07 | TURF / tissue_model_v2 | Pol Roger | T2 | 9.596% | 20/1 | 10 | 18 | −£1.00 | 2bdb09ed-31bb-4a00-855d-eff18c7ca5e3 | 3e337314-fb22-4b0a-b453-a262177a4863 |
| 2026-10-10 | Southwell 16:20 | AW / AW_TISSUE_V1 | Cranberry Breeze | T1 | 17.615% | 50/1 | 8 | 7 | −£1.00 | ca90d75a-4286-4bde-8ba3-91d515d475f4 | 16ec92ab-77fe-437b-a379-b583b2dd17e6 |
| 2026-10-11 | Naas 12:20 | TURF / tissue_model_v2 | Fly Smartly | T2 | 9.791% | 40/1 | 8 | 12 | −£1.00 | a2d8145e-fad0-457d-a80a-6eb051609904 | cd42e43a-dab2-4c7b-b85a-7d50895706ee |
| 2026-10-11 | Cork 12:37 | HURDLE / JUMP_TISSUE_V1 | Divine Believer | T1 | 22.352% | 8/1 | 5 | 3 | −£1.00 | d52c2de3-5514-424b-84d9-d9f6052430af | 1d36fe6f-a7a1-45be-b041-16355a39097b |
| 2026-10-11 | Goodwood 12:47 | TURF / tissue_model_v2 | Solar Pass | T2 | 14.100% | 9/1 | 5 | 11 | −£1.00 | fea82124-abb1-45ae-9598-3b6bda91c732 | 54d1e355-4b1e-41f3-9f31-90d30d53b983 |
| 2026-10-11 | Chepstow 13:02 | HURDLE / JUMP_TISSUE_V1 | Midnight Pass | T2 | 10.436% | 16/1 | 6 | 3 | −£1.00 | dba3545d-7a83-4076-ac1b-176d82f5475d | 08508002-083e-47f0-8019-b54323e0f524 |
| 2026-10-11 | Naas 13:30 | TURF / tissue_model_v2 | Eighteenth Smiles | T1 | 14.949% | 22/1 | 9 | 7 | −£1.00 | 2f65e4ef-d39a-49c8-87df-0bfb4d34b1ce | bd3b518e-cca5-4108-833a-2e3ad4150d39 |
| 2026-10-11 | Cork 13:47 | HURDLE / JUMP_TISSUE_V1 | Our Sara | T2 | 17.034% | 10/1 | 4 | pulled_up | −£1.00 | 52276d77-13b3-46ca-8e48-51911fff33e3 | c6a1cff8-2a4a-4283-abd2-499e8aab06bd |
| 2026-10-11 | Naas 14:05 | TURF / tissue_model_v2 | Drop Dead Gorgeous | T1 | 17.885% | 9/1 | 5 | 8 | −£1.00 | efd9db0f-b63c-418e-8adc-20479a75f8c4 | 8ef8bff9-0588-4167-bfda-ad63d3dfb381 |
| 2026-10-11 | Chepstow 14:12 | HURDLE / JUMP_TISSUE_V1 | West Orchard | T1 | 22.482% | 16/1 | 7 | 10 | −£1.00 | e7784272-d7d9-48e2-8334-1f7acb1916d0 | 9c80bce4-1195-4135-b86b-b03789efb08c |
| 2026-10-11 | Naas 14:40 | TURF / tissue_model_v2 | Moments Of Joy | T1 | 16.905% | 28/1 | 11 | 6 | −£1.00 | d789c539-9c9d-44c8-a8fd-60b1b288fdf6 | 78e881b8-3d9b-4e67-adc5-339d58d1077b |
| 2026-10-11 | Naas 14:40 | TURF / tissue_model_v2 | Deressa | T2 | 14.495% | 10/1 | 5 | 4 | −£1.00 | d789c539-9c9d-44c8-a8fd-60b1b288fdf6 | a08615d1-8d47-4cfa-9fa2-b67dad969923 |
| 2026-10-11 | Naas 15:15 | TURF / tissue_model_v2 | Abbotsford | T1 | 13.629% | 14/1 | 10 | 1 | +£14.00 | e041f9f1-ba65-49ef-864f-c99137983bd2 | 1feba102-5ad5-4467-b77d-9592be32fc46 |
| 2026-10-11 | Goodwood 15:42 | TURF / tissue_model_v2 | Sword Maker | T1 | 19.146% | 17/2 | 4 | 5 | −£1.00 | 0397aa8c-6230-4f47-b8de-b2126a551bad | 982e03d4-cb1b-447f-b3d7-744076799dab |
| 2026-10-11 | Naas 15:50 | TURF / tissue_model_v2 | Northern Ruler | T1 | 14.578% | 25/1 | 11 | 8 | −£1.00 | 61345c4f-77e4-4e7a-916a-05a2b7812d07 | 9ecf7ded-5e78-45cb-ab10-35d0b9af5b53 |
| 2026-10-12 | Musselburgh 12:47 | TURF / tissue_model_v2 | Star Start | T1 | 17.159% | 10/1 | 4 | 4 | −£1.00 | 55f81921-b571-4f5d-ad62-f5bebd596009 | bf193499-6e9d-4ec8-b323-c3d23d11425d |
| 2026-10-12 | Roscommon 13:00 | TURF / tissue_model_v2 | Gypsy Queen | T2 | 9.241% | 18/1 | 10 | 6 | −£1.00 | 0a6e6f1c-6e91-4798-9aa2-8137498587ad | c9465aed-a669-47ee-844f-6af1a2d44fc7 |
| 2026-10-12 | Roscommon 13:30 | TURF / tissue_model_v2 | Alex Belardo | T2 | 9.505% | 9/1 | 5 | 10 | −£1.00 | 71389838-d062-4acd-989c-d0f438e0a288 | 3704531d-85a0-4160-b3b5-20c3acf79181 |
| 2026-10-12 | Worcester 13:37 | CHASE / JUMP_TISSUE_V1 | L'empire Vert | T1 | 16.866% | 16/1 | 6 | 4 | −£1.00 | df147f6c-a48a-419d-bee0-9f6bae239db5 | 9ec9efbf-8ed2-450e-bf32-6d74131aaa23 |
| 2026-10-12 | Worcester 13:37 | CHASE / JUMP_TISSUE_V1 | Double Indemnity | T2 | 14.977% | 12/1 | 5 | 5 | −£1.00 | df147f6c-a48a-419d-bee0-9f6bae239db5 | e91ecd25-26ac-4cd3-8621-2760131dd33b |
| 2026-10-12 | Musselburgh 14:17 | TURF / tissue_model_v2 | Albegone | T1 | 14.241% | 12/1 | 10 | 4 | −£1.00 | 5e2a9775-01d6-4410-b18e-e5e452c30131 | 4b24bc40-d864-45dc-8ddb-00fcf9b3fa47 |
| 2026-10-12 | Musselburgh 14:17 | TURF / tissue_model_v2 | Invincible Crown | T2 | 13.097% | 10/1 | 8 | 2 | −£1.00 | 5e2a9775-01d6-4410-b18e-e5e452c30131 | 9bd43d7b-7a08-49ab-8e05-65f2f090fd65 |
| 2026-10-12 | Kempton 15:12 | AW / AW_TISSUE_V1 | Al Alami | T2 | 13.096% | 11/1 | 5 | 5 | −£1.00 | 80f41ba9-d83a-43a5-9572-9a97de30e35c | ff92729c-5459-4946-b7c0-647edaaad4fc |
| 2026-10-12 | Yarmouth 15:24 | TURF / tissue_model_v2 | So Sassy | T1 | 14.220% | 12/1 | 10 | 2 | −£1.00 | 69b93ffd-c383-44f6-b50b-194bf8a6e3a8 | b89fe62d-395a-4c10-91ea-66f00de6878d |
| 2026-10-12 | Yarmouth 15:55 | TURF / tissue_model_v2 | Abu Royal | T1 | 13.394% | 8/1 | 5 | 7 | −£1.00 | 24e99353-08c0-42f4-8b34-568dc66a50d9 | c2aac66e-8a83-4385-807e-6bd00fe7ef82 |
| 2026-10-12 | Yarmouth 15:55 | TURF / tissue_model_v2 | Diamond Ali | T2 | 12.126% | 11/1 | 7 | 10 | −£1.00 | 24e99353-08c0-42f4-8b34-568dc66a50d9 | d8d9399d-fac4-4ab7-ab6c-5cf3e9f968e5 |
| 2026-10-12 | Roscommon 16:07 | TURF / tissue_model_v2 | Vervain | T2 | 12.299% | 14/1 | 8 | 16 | −£1.00 | 68f36e81-e6ef-4add-bcfc-86764696f4f4 | b761d672-7663-42ac-b6c8-3c87daa4ec92 |
| 2026-10-13 | Punchestown 13:10 | HURDLE / JUMP_TISSUE_V1 | Beyond Forgiveness | T1 | 13.750% | 22/1 | 10 | 7 | −£1.00 | 1d1b7303-f42d-4696-a1c3-4d98edb3712b | b25f267f-add7-4e03-845e-058cf449ef83 |
| 2026-10-13 | Leicester 14:04 | TURF / tissue_model_v2 | Catonahottinroof | T2 | 19.280% | 9/1 | 4 | 3 | −£1.00 | bf4def3a-bd78-48ee-9b27-746718100b23 | 3463ad10-0cfd-4e55-a22e-9726dc7e650e |
| 2026-10-13 | Punchestown 14:20 | HURDLE / JUMP_TISSUE_V1 | Latopix | T1 | 13.328% | 18/1 | 11 | pulled_up | −£1.00 | 9ca17e0b-0144-47cc-8f15-94f3b301c3de | 0655fa61-a375-41c9-b355-a3fc3873d4a2 |
| 2026-10-13 | Punchestown 14:20 | HURDLE / JUMP_TISSUE_V1 | Labondance | T2 | 9.802% | 20/1 | 14 | 12 | −£1.00 | 9ca17e0b-0144-47cc-8f15-94f3b301c3de | eff9637e-78e6-4710-a3f1-4a415d868aee |
| 2026-10-13 | Leicester 14:39 | TURF / tissue_model_v2 | Hk Fourteen | T1 | 9.144% | 16/1 | 9 | 14 | −£1.00 | 624e0ab9-7ff0-40b5-9042-1c81816cfdc7 | a932c555-b2d0-4f5c-bfb8-d16073b084e7 |
| 2026-10-13 | Leicester 14:39 | TURF / tissue_model_v2 | Sargent Dennis | T2 | 8.772% | 18/1 | 11 | 9 | −£1.00 | 624e0ab9-7ff0-40b5-9042-1c81816cfdc7 | 86aa4687-1957-4112-995d-4b63f7e61385 |
| 2026-10-13 | Leicester 15:14 | TURF / tissue_model_v2 | Cypriot Diaspora | T2 | 14.888% | 16/1 | 7 | 7 | −£1.00 | 39fff6e7-f8e9-4590-8f5f-c209662be88f | e86da13e-8677-4b48-abfd-4feb612601c8 |
| 2026-10-13 | Southwell 15:52 | HURDLE / JUMP_TISSUE_V1 | Anxious Moments | T2 | 11.275% | 18/1 | 7 | 1 | +£18.00 | b3d8be53-7de8-453a-9d6a-f1e1ad0c0480 | b830c73c-e177-4687-985b-526926ca93b7 |
| 2026-10-13 | Punchestown 16:07 | HURDLE / JUMP_TISSUE_V1 | You Done Well | T1 | 8.727% | 16/1 | 9 | pulled_up | −£1.00 | 38e85ed7-d34e-4e89-86d2-1106f95eb416 | c9b02f33-95bf-4c74-9d38-33984945fae0 |
| 2026-10-13 | Wolverhampton 19:30 | AW / AW_TISSUE_V1 | Pipily | T1 | 18.138% | 10/1 | 4 | 6 | −£1.00 | 117d7eac-a025-4147-a733-be07b559bf84 | 8b9d3b20-7646-4abb-8982-8bc957a77cd8 |
| 2026-10-14 | Wetherby 13:00 | HURDLE / JUMP_TISSUE_V1 | Watcha Snoop | T2 | 18.165% | 11/1 | 3 | 4 | −£1.00 | be235a2a-2d55-4ce1-a396-6bb433a12b0b | bb4cc796-8f82-43b6-b822-cb9eedbbb387 |
| 2026-10-14 | Nottingham 14:04 | TURF / tissue_model_v2 | Port Of London | T1 | 29.910% | 11/1 | 5 | 2 | −£1.00 | 6f50af39-809a-4a5a-bf83-c528f7f5b7cd | c13e05ee-979a-415b-a0f3-613ceb41f66b |
| 2026-10-14 | Punchestown 14:20 | HURDLE / JUMP_TISSUE_V1 | Boo Radley | T2 | 8.170% | 14/1 | 6 | 8 | −£1.00 | f4cf7884-df23-42f8-87a3-27b514b3ac87 | e3ea1b7a-45cc-4f31-b0d6-cec4ec643ed2 |
| 2026-10-14 | Nottingham 15:14 | TURF / tissue_model_v2 | Magic Box | T1 | 20.646% | 14/1 | 6 | 2 | −£1.00 | 2f8c7f18-9a87-472d-bcaa-6b556afbe000 | e40e7970-bc40-4051-8e3b-b2f802bea1c7 |
| 2026-10-14 | Nottingham 15:14 | TURF / tissue_model_v2 | Mr Tony | T2 | 17.382% | 9/1 | 4 | 7 | −£1.00 | 2f8c7f18-9a87-472d-bcaa-6b556afbe000 | 79c5151d-3941-436a-aabe-e567e17b97dc |
| 2026-10-14 | Nottingham 15:47 | TURF / tissue_model_v2 | Napolian | T1 | 20.133% | 12/1 | 6 | 5 | −£1.00 | caa766d9-61fc-4738-94a0-6af5a8d81ead | ed575b4d-c25c-49fc-899c-d2e250319240 |
| 2026-10-14 | Punchestown 16:07 | CHASE / JUMP_TISSUE_V1 | My Cullen | T1 | 31.426% | 9/1 | 4 | 2 | −£1.00 | cec4ad5e-a24c-48cc-8126-c8f17d4cfa38 | 82a79c54-15c1-45cf-b583-50440dc5d917 |
| 2026-10-14 | Kempton 16:30 | AW / AW_TISSUE_V1 | Knowledge | T2 | 13.797% | 9/1 | 5 | 2 | −£1.00 | f8058c11-e0c3-4ee0-9c54-25a4dd850605 | d79b019b-554c-4179-9bb4-cc929c6d2462 |
| 2026-10-14 | Kempton 17:00 | AW / AW_TISSUE_V1 | Chale Chalo | T2 | 13.125% | 25/1 | 7 | 6 | −£1.00 | 5c14d0f9-8baf-46b6-a293-f1efcab109df | a6932561-5932-4011-b7c5-9aec275f27b2 |
| 2026-10-14 | Kempton 18:30 | AW / AW_TISSUE_V1 | Art Lover | T1 | 16.990% | 9/1 | 4 | 5 | −£1.00 | 79541f4a-bc5d-446b-ba1d-551c505f5350 | cd7494b9-b0ec-4ca7-bba0-04a46e489c75 |
| 2026-10-14 | Kempton 19:00 | AW / AW_TISSUE_V1 | Wonder | T2 | 14.287% | 10/1 | 7 | 6 | −£1.00 | bb7c821c-b210-4a13-8f2d-9c03ce74f772 | bab281ae-5be1-4d5f-b636-caa65634cda0 |
| 2026-10-15 | Curragh 12:02 | TURF / tissue_model_v2 | Captain James Cook | T1 | 41.588% | 11/1 | 4 | 5 | −£1.00 | 6769a6dc-aa02-42f7-9612-aa86f05e0cd9 | e47cb921-4cfa-45bc-bab3-7f7fba2cf1f9 |
| 2026-10-15 | Curragh 12:02 | TURF / tissue_model_v2 | Alfredo Delgado | T2 | 8.827% | 12/1 | 5 | 9 | −£1.00 | 6769a6dc-aa02-42f7-9612-aa86f05e0cd9 | b407f755-078b-44a4-8f93-1abd450a281b |
| 2026-10-15 | Curragh 12:37 | TURF / tissue_model_v2 | Amiata | T1 | 19.634% | 14/1 | 9 | 4 | −£1.00 | ebd46ff9-a9f4-40be-8ccb-d68d05da70eb | 5654e416-391b-40d6-8cd5-63851e158e60 |
| 2026-10-15 | Curragh 12:37 | TURF / tissue_model_v2 | The Highway Rat | T2 | 12.003% | 25/1 | 13 | 10 | −£1.00 | ebd46ff9-a9f4-40be-8ccb-d68d05da70eb | d7223025-ab0b-49a2-bd61-8c66ea2fb757 |
| 2026-10-15 | Fontwell 12:44 | HURDLE / JUMP_TISSUE_V1 | Goodwin | T1 | 33.482% | 10/1 | 4 | 5 | −£1.00 | cc38e8e9-64ab-4b2a-b757-e2903e858c7e | fbf386c0-19a2-48c1-8b22-2adc86980acb |
| 2026-10-16 | Redcar 12:20 | TURF / tissue_model_v2 | So Farhh | T2 | 8.930% | 11/1 | 3 | 3 | −£1.00 | 49a6a951-4f51-4a9c-9c2b-64f10d09f9e8 | ccb20225-6147-4b77-b212-9a2782bf9162 |
| 2026-10-16 | Uttoxeter 12:27 | HURDLE / JUMP_TISSUE_V1 | Equi Libre | T2 | 13.984% | 100/1 | 7 | other | −£1.00 | 4df755f5-055d-444b-abf3-e58ea884b8ba | c1778638-d8f9-47f1-a932-c9b56486885f |
| 2026-10-16 | Uttoxeter 13:02 | CHASE / JUMP_TISSUE_V1 | Post Chaise | T2 | 15.326% | 11/1 | 5 | pulled_up | −£1.00 | c6855963-f4b7-4b8c-b24b-4c636dcac93c | bf549732-6778-476c-b027-ccc628496105 |
| 2026-10-16 | Haydock 13:52 | TURF / tissue_model_v2 | Return To Unit | T1 | 17.236% | 9/1 | 4 | 2 | −£1.00 | 312a9e67-4708-4480-a2c7-822ea5e962d4 | 9097828d-d698-4599-998d-90dc89626402 |
| 2026-10-16 | Uttoxeter 15:22 | HURDLE / JUMP_TISSUE_V1 | Zenato | T2 | 12.514% | 14/1 | 7 | pulled_up | −£1.00 | 2afa6c08-2b0a-4c6a-96d2-ee0dc0fd42e1 | 7e111cf3-b020-4e60-8d49-08fa220cc5c9 |
| 2026-10-16 | Haydock 15:37 | TURF / tissue_model_v2 | Wheels Of Fire | T2 | 9.084% | 22/1 | 10 | 4 | −£1.00 | 1c848bc5-036f-426b-8bf6-3245f210ca44 | ddeed2f6-ee52-4d04-9c5c-384d1df3d0d6 |
| 2026-10-16 | Newcastle 15:43 | AW / AW_TISSUE_V1 | Model Yuko | T1 | 19.533% | 10/1 | 7 | 6 | −£1.00 | 833657ff-54b1-44e1-849c-da5e32d33761 | 6c2b7af1-91ed-4c63-8bf4-e7b4e096aa1e |
| 2026-10-16 | Dundalk 16:00 | AW / AW_TISSUE_V1 | Trishuli River | T2 | 11.083% | 9/1 | 6 | 11 | −£1.00 | 72b90db9-3709-4608-93fe-6a68cbda8d2e | 44c1aa1a-b564-419f-8081-be7040280ec7 |
| 2026-10-16 | Haydock 16:07 | TURF / tissue_model_v2 | Our Absent Friends | T2 | 11.455% | 28/1 | 11 | 14 | −£1.00 | 87b172d8-254b-46fd-961a-6765c9646c73 | ce0a94fc-c27b-421a-a39c-9c696f8e97b8 |
| 2026-10-16 | Newcastle 16:15 | AW / AW_TISSUE_V1 | Celtic Arrow | T1 | 23.691% | 11/1 | 5 | 4 | −£1.00 | 4b145561-fa33-4101-9917-528834080c5c | 544cd708-c66d-4183-ae53-67e57e5afb73 |
| 2026-10-16 | Redcar 16:23 | TURF / tissue_model_v2 | Electric Arc | T1 | 17.368% | 12/1 | 7 | 2 | −£1.00 | 446c1efe-d758-4388-b19b-229206e5c0f3 | ffb40474-6bd5-49c0-9680-aa199fd870eb |
| 2026-10-16 | Redcar 16:23 | TURF / tissue_model_v2 | Alazwar | T2 | 11.403% | 20/1 | 8 | 4 | −£1.00 | 446c1efe-d758-4388-b19b-229206e5c0f3 | d6896399-df7a-4133-9961-ea122be95513 |
| 2026-10-16 | Newcastle 16:45 | AW / AW_TISSUE_V1 | Candonomore | T2 | 23.259% | 14/1 | 5 | 5 | −£1.00 | c64beeac-32c6-42e5-8e16-f5d2a86bc847 | a99796e7-72d2-48f9-8505-eb4c5bfa42f7 |
| 2026-10-16 | Newcastle 17:15 | AW / AW_TISSUE_V1 | Matter Of Britain | T2 | 11.828% | 16/1 | 6 | 9 | −£1.00 | a9f71a50-8f43-4d7b-974d-e3a7040c9bcf | b980ede0-9885-4e3d-8354-01fdeee30d3e |
| 2026-10-16 | Dundalk 17:30 | AW / AW_TISSUE_V1 | Hooves Your Daddy | T2 | 9.203% | 11/1 | 5 | 4 | −£1.00 | ab1d46f5-3042-41b3-81a1-d0b4e1b047c0 | 70aef4f7-e6c7-4f43-af44-7f9a27221488 |
| 2026-10-16 | Newcastle 17:45 | AW / AW_TISSUE_V1 | Little Mi Mi | T2 | 11.640% | 8/1 | 7 | 11 | −£1.00 | c151d7cf-ef74-47ff-8018-0801cad7acf7 | 089f8b4b-4345-4f1d-afe2-d52998b496dd |
| 2026-10-16 | Dundalk 18:30 | AW / AW_TISSUE_V1 | Valiant Force | T1 | 17.309% | 17/2 | 6 | 2 | −£1.00 | 624c3777-e7ed-4f15-b67a-81b754bd50d4 | 7bbcd142-67d8-4a6b-adad-fc16ae503d72 |
| 2026-10-16 | Newcastle 18:45 | AW / AW_TISSUE_V1 | Sprinting Speed | T2 | 14.759% | 8/1 | 5 | 4 | −£1.00 | 9cd53e21-21dc-4b5d-a823-fab65921eaf4 | 3b3f6547-29bb-4042-bae0-f88eb2c1e6ea |
| 2026-10-17 | Ascot 11:55 | TURF / tissue_model_v2 | Confucius | T2 | 18.166% | 20/1 | 6 | 4 | −£1.00 | 92208c0f-4c20-4f66-9b69-d15248b913c3 | 5221cbf0-a160-448c-b856-d5cd3127fecb |
| 2026-10-17 | Ascot 12:30 | TURF / tissue_model_v2 | Queenstown | T1 | 20.993% | 14/1 | 5 | 2 | −£1.00 | dedf053f-001f-4440-96ec-f9d3d4ba8198 | 0cef1ad6-0ddb-4610-8c71-f98736d3cf9d |
| 2026-10-17 | Catterick 12:35 | TURF / tissue_model_v2 | Royale Union | T1 | 23.778% | 8/1 | 3 | 2 | −£1.00 | f43ee0f9-86c4-4f86-bbee-e1ef53c9562c | 51e9ace4-6c9d-465e-b3cd-e1d86a5a7a3c |
| 2026-10-17 | Newton Abbot 12:42 | HURDLE / JUMP_TISSUE_V1 | Arbitration | T2 | 21.222% | 18/1 | 6 | 6 | −£1.00 | 42cf6e9a-1392-45f5-9a6c-1f85f9d64a08 | f858f0f1-4f38-42a9-aaec-cb7f48dec48e |
| 2026-10-17 | Limerick 12:45 | HURDLE / JUMP_TISSUE_V1 | Lyrical Park | T2 | 8.112% | 9/1 | 6 | 8 | −£1.00 | d1d07e96-74eb-403b-8e12-7f487e5abf47 | b0e25af7-b22c-459a-8b06-c5663ea2e956 |
| 2026-10-17 | Ascot 13:05 | TURF / tissue_model_v2 | Division | T2 | 10.902% | 17/2 | 2 | 3 | −£1.00 | 05852cf7-f32e-40ef-af7a-cc732353a720 | bf1abe30-aa07-4222-acb0-bd885b89452a |
| 2026-10-17 | Ascot 13:40 | TURF / tissue_model_v2 | Symbol Of Majesty | T2 | 12.831% | 40/1 | 10 | 6 | −£1.00 | 8723c063-8676-4f01-8e78-db17283410fd | eac1f6a9-a5c9-4795-9992-800c1cc7379f |
| 2026-10-17 | Catterick 13:45 | TURF / tissue_model_v2 | Rosenpur | T1 | 22.906% | 10/1 | 4 | 6 | −£1.00 | 3fd82800-4624-45e7-b0fa-912e2fef7104 | d02557a8-33e4-4f99-aa4e-efd5bb8f54c8 |
| 2026-10-17 | Limerick 15:05 | HURDLE / JUMP_TISSUE_V1 | Tasmanian Girl | T1 | 9.312% | 11/1 | 8 | 2 | −£1.00 | 9f0473af-27c0-4f3a-9bb2-3ea86482e5c3 | 4bbff6ff-f960-4030-9c94-ec8aae7a4bcc |
| 2026-10-17 | Catterick 15:10 | TURF / tissue_model_v2 | Classy Clarets | T2 | 18.048% | 10/1 | 6 | 3 | −£1.00 | f9023883-7404-414b-8a5d-379257982b9b | 5c695b44-d7a0-4df8-9f09-f57053d9ebeb |
| 2026-10-17 | Stratford 15:18 | HURDLE / JUMP_TISSUE_V1 | Seraphic | T2 | 16.345% | 17/2 | 4 | 1 | +£8.50 | b2284495-7159-407c-bc29-a2c7b5a9cc9b | d4ae9262-94f4-4c1d-ac56-a64fae23cbf3 |
| 2026-10-17 | Market Rasen 15:25 | CHASE / JUMP_TISSUE_V1 | Forcetoreckonwith | T2 | 22.085% | 8/1 | 5 | 4 | −£1.00 | 1bc958dd-6b68-48ae-8c02-6a947da1dad6 | e86e4c03-9fd0-40ab-8720-8aa2c3a2973a |
| 2026-10-17 | Ascot 15:35 | TURF / tissue_model_v2 | Fifth Column | T1 | 9.764% | 22/1 | 11 | 1 | +£22.00 | 1a478366-ed7f-4cb0-ac6c-443f2aabe143 | acd28602-a08a-4aeb-988e-96a8e64ad39d |
| 2026-10-17 | Ascot 15:35 | TURF / tissue_model_v2 | Valvano | T2 | 8.179% | 28/1 | 14 | 12 | −£1.00 | 1a478366-ed7f-4cb0-ac6c-443f2aabe143 | d1a36016-619b-4fc0-8a7e-41b9baf279d7 |
| 2026-10-17 | Limerick 15:40 | HURDLE / JUMP_TISSUE_V1 | Lincall | T1 | 8.278% | 20/1 | 10 | 8 | −£1.00 | 3a9d2bd4-3deb-41ae-bd9b-a7fb8c890396 | 52b2aa48-e579-4594-9a56-848143ddc1a3 |
| 2026-10-17 | Limerick 15:40 | HURDLE / JUMP_TISSUE_V1 | Cahirdown Boy | T2 | 8.115% | 18/1 | 9 | 5 | −£1.00 | 3a9d2bd4-3deb-41ae-bd9b-a7fb8c890396 | 651d3289-4a2b-430f-84e3-1e1d26bc72ac |
| 2026-10-17 | Catterick 16:15 | TURF / tissue_model_v2 | Promethean | T2 | 16.813% | 16/1 | 6 | 4 | −£1.00 | 55e41b13-b2d3-4b71-8062-f1ec07629c72 | 7c52f2ad-aee0-446a-b15b-b0901fc5ffbc |
| 2026-10-17 | Stratford 16:25 | HURDLE / JUMP_TISSUE_V1 | Made All | T2 | 15.426% | 8/1 | 4 | 3 | −£1.00 | f5f3dddb-1a0e-4b29-b976-08bedcbd8856 | 3eb04667-ffed-4656-b61f-baed322e1e3b |
| 2026-10-17 | Southwell 18:00 | AW / AW_TISSUE_V1 | Mayflyer | T2 | 9.994% | 14/1 | 7 | 6 | −£1.00 | b78d4a72-7574-4d7d-9a3a-d9207d5e5d93 | 0f6dcf9a-0c2d-42f7-b3ab-c40e7cf9e699 |
| 2026-10-17 | Southwell 18:30 | AW / AW_TISSUE_V1 | Sayidah Dubawi | T2 | 12.066% | 9/1 | 3 | 9 | −£1.00 | 6b8d11b0-e28b-4af5-be99-8ec70eac64ce | 33dc7e68-f469-4697-96d5-580479eb85d4 |
| 2026-10-18 | Sedgefield 13:20 | CHASE / JUMP_TISSUE_V1 | Fortunate Fella | T2 | 16.399% | 50/1 | 7 | pulled_up | −£1.00 | 27203544-6c0d-4ce5-82cb-9b811c2f4c49 | 7a80ff81-4f31-4e20-bcc6-46f744d1a389 |
| 2026-10-18 | Leopardstown 14:12 | TURF / tissue_model_v2 | Morehampton | T1 | 9.857% | 8/1 | 4 | 10 | −£1.00 | 21e23589-d78e-44ba-a308-12aca2852494 | e6d116b8-432b-4d69-84f9-805f2b38d90b |
| 2026-10-18 | Leopardstown 14:12 | TURF / tissue_model_v2 | Dragon Of Malta | T2 | 9.789% | 28/1 | 12 | 7 | −£1.00 | 21e23589-d78e-44ba-a308-12aca2852494 | 9a9ceb56-034c-44f1-ad95-58f3ab8f4df0 |
| 2026-10-18 | Leopardstown 14:42 | TURF / tissue_model_v2 | Diego El Queso | T1 | 13.405% | 17/2 | 4 | 2 | −£1.00 | 32008336-d97f-44ec-9486-9f8749c6c95a | 6f6283ac-bf1a-4d45-9cb8-4a470715b051 |
| 2026-10-18 | Sedgefield 15:20 | HURDLE / JUMP_TISSUE_V1 | Max Of Stars | T2 | 9.307% | 14/1 | 7 | 4 | −£1.00 | f3167ba3-cb5e-4b5c-b495-443ca0ca285b | d1093415-0a50-41e6-b30e-f03c77d4b850 |
| 2026-10-18 | Leopardstown 15:42 | TURF / tissue_model_v2 | Too Bossy For Us | T1 | 17.387% | 22/1 | 10 | 9 | −£1.00 | 51e92a95-0c75-42bd-a95d-fbb2cd208167 | f1ed5ea7-965c-493b-a4aa-b0d7b3cfd34e |
| 2026-10-18 | Leopardstown 15:42 | TURF / tissue_model_v2 | Night Moon | T2 | 15.087% | 11/1 | 6 | 11 | −£1.00 | 51e92a95-0c75-42bd-a95d-fbb2cd208167 | 646c55cb-9e8d-4b9f-851e-4f62b86152d5 |
| 2026-10-18 | Limerick 16:00 | CHASE / JUMP_TISSUE_V1 | Straight Home | T2 | 17.184% | 18/1 | 4 | 4 | −£1.00 | 77610855-07e5-4196-b7b6-e6f515fcf364 | 359e098c-daab-41fa-972f-44935adf7d58 |
| 2026-10-18 | Leopardstown 16:12 | TURF / tissue_model_v2 | Purely | T1 | 18.996% | 10/1 | 5 | 4 | −£1.00 | 420f4c16-281c-4feb-a44b-bbe4526f41f4 | 213d9f58-657a-4462-89c0-3924e55e1cc2 |
| 2026-10-18 | Leopardstown 16:12 | TURF / tissue_model_v2 | Bundle Of Interest | T2 | 9.180% | 12/1 | 9 | 10 | −£1.00 | 420f4c16-281c-4feb-a44b-bbe4526f41f4 | fc02f55f-a39c-461f-a1c8-59ad8058d528 |
| 2026-10-19 | Gowran Park 12:40 | TURF / tissue_model_v2 | Winnie's Wish | T2 | 13.373% | 8/1 | 4 | 5 | −£1.00 | 0e4dcf5e-47fc-47be-953a-6e81ee72680c | 53923ead-4679-447a-8e92-95ab55bf87fb |
| 2026-10-19 | Plumpton 13:00 | HURDLE / JUMP_TISSUE_V1 | Bankatary | T1 | 28.639% | 14/1 | 3 | 4 | −£1.00 | 90ba6a25-6b48-4ec0-b625-b7eaba98e9c7 | a4f8783f-777b-46a8-ba7d-8ae071cd78df |
| 2026-10-19 | Gowran Park 13:40 | TURF / tissue_model_v2 | System Reset | T2 | 14.108% | 12/1 | 7 | 13 | −£1.00 | c91dac02-e5ea-40ab-9696-e5af690f3159 | 3f44c61b-cbce-40e3-a8ab-048325fe22c9 |
| 2026-10-19 | Gowran Park 14:10 | TURF / tissue_model_v2 | Katiraya | T2 | 12.708% | 9/1 | 5 | 10 | −£1.00 | 371b3756-6578-41e6-930b-4579ea43a1e8 | 27242ec4-499d-4ffb-b494-a923dc3250ab |
| 2026-10-19 | Bath 14:17 | TURF / tissue_model_v2 | Wowaditaka | T2 | 9.250% | 250/1 | 10 | 10 | −£1.00 | 7017a530-e76f-46da-836a-ea9b4c48085b | 9cf970ac-cffa-40c5-aa27-bbc6db649a1d |
| 2026-10-19 | Pontefract 14:23 | TURF / tissue_model_v2 | Mubasimah | T2 | 12.400% | 16/1 | 8 | 8 | −£1.00 | 3a187c1d-009d-422d-9aac-12beb4049f74 | 4f1830b9-8872-4ebf-bcad-fe4ff00f303d |
| 2026-10-19 | Gowran Park 14:40 | TURF / tissue_model_v2 | Spanish Princess | T1 | 10.073% | 14/1 | 8 | 11 | −£1.00 | 2e144729-6bdc-4661-9769-0b55a4ca338d | 4705b94b-0389-4be5-88e0-3093424ef8c5 |
| 2026-10-19 | Gowran Park 14:40 | TURF / tissue_model_v2 | Kingcharles | T2 | 7.675% | 12/1 | 5 | 4 | −£1.00 | 2e144729-6bdc-4661-9769-0b55a4ca338d | 23030fc0-eab5-4efc-a3a5-41c639fadaa3 |
| 2026-10-19 | Pontefract 15:25 | TURF / tissue_model_v2 | Walsingham | T2 | 17.246% | 17/2 | 7 | 8 | −£1.00 | 68567ad8-1e9e-4eab-8fad-c45b8c39f364 | 222aec15-8720-4d4a-996d-55a97db00a91 |
| 2026-10-19 | Southwell 16:00 | AW / AW_TISSUE_V1 | Von Krolock | T2 | 15.274% | 20/1 | 9 | 8 | −£1.00 | 1ed13674-d7b6-4b01-9724-781552f12bb1 | 6d9eb4e7-42f3-4502-b160-c76c6bd6aa68 |
| 2026-10-19 | Bath 16:22 | TURF / tissue_model_v2 | Guinness Lad | T1 | 12.491% | 12/1 | 7 | 6 | −£1.00 | 8e9e440c-f7a3-4779-a177-dc21b8744c52 | 4a265992-dad2-49d8-9c31-e99245f03a1b |
| 2026-10-19 | Bath 16:22 | TURF / tissue_model_v2 | Letsbeatsepsis | T2 | 11.427% | 8/1 | 3 | 13 | −£1.00 | 8e9e440c-f7a3-4779-a177-dc21b8744c52 | 45d110d8-6f05-4ea6-9b54-1759f6a6717e |
| 2026-10-19 | Southwell 17:00 | AW / AW_TISSUE_V1 | Taaklam | T2 | 13.388% | 14/1 | 6 | 5 | −£1.00 | b03e189d-ecbc-429c-a0fb-6ef8b7727cd9 | 9b2a5fae-93f9-4c01-b546-b91c43921210 |
| 2026-10-19 | Southwell 18:00 | AW / AW_TISSUE_V1 | Wesam | T1 | 16.397% | 11/1 | 6 | 9 | −£1.00 | 4fecdaa0-c252-4730-96f8-a2f3d40d010c | e2973b5f-f426-4aba-b812-1693f413dbcb |
| 2026-10-19 | Wolverhampton 18:15 | AW / AW_TISSUE_V1 | Little Miss India | T1 | 17.552% | 18/1 | 9 | 8 | −£1.00 | 16c4911f-f5c4-4903-a502-e848df891256 | 9396deba-8c99-4661-8083-f87ec6ee8b06 |
| 2026-10-19 | Southwell 18:30 | AW / AW_TISSUE_V1 | Buckland Belle | T2 | 11.132% | 17/2 | 5 | 5 | −£1.00 | a2d4bc76-c0a5-4fc8-be54-210c1ce8ab00 | fc7b3b35-a996-40da-9745-6ab1d2269c9b |
| 2026-10-19 | Wolverhampton 18:45 | AW / AW_TISSUE_V1 | Alkuwarrior | T2 | 15.822% | 14/1 | 7 | 3 | −£1.00 | be796def-b8c6-42f1-ba24-dec6c2037e8a | e96140cf-424c-4338-ae06-5bfadc1153f9 |
| 2026-10-19 | Southwell 19:30 | AW / AW_TISSUE_V1 | Symphony's Song | T1 | 18.036% | 17/2 | 4 | 4 | −£1.00 | 471d4a0b-8fb1-4c88-b9e3-0a083c620588 | 4bb50d46-e8ff-43df-b4f1-8010f4b326e3 |
| 2026-10-20 | Yarmouth 12:20 | TURF / tissue_model_v3 | Passing Thought | T2 | 19.067% | 14/1 | 8 | 6 | −£1.00 | a2a93158-d42a-4e56-ab82-f241afc5f811 | bf735e84-362e-42e8-8a71-94b79d39dbf0 |
| 2026-10-20 | Curragh 12:55 | TURF / tissue_model_v3 | Gypsy Queen | T1 | 9.365% | 16/1 | 11 | 4 | −£1.00 | 3ec57e70-a97f-455e-b37d-e3db12f91f6a | d44feb11-abc6-4ac2-99ad-bfd610a947b7 |
| 2026-10-20 | Curragh 13:25 | TURF / tissue_model_v3 | I Hope You Dance | T2 | 20.014% | 16/1 | 4 | 6 | −£1.00 | b25feeb8-042f-4b88-8756-e6f4164f404f | c0102f8d-0a7f-46d3-836e-110b6ba93ca6 |
| 2026-10-20 | Hexham 13:32 | HURDLE / JUMP_TISSUE_V1 | Tracker Issue | T2 | 13.783% | 12/1 | 5 | 10 | −£1.00 | fa2d6548-d804-4dbb-b1e3-6e02648b6c9b | bad01022-cffe-4dfe-9fcb-addadf0727f1 |
| 2026-10-20 | Yarmouth 14:28 | TURF / tissue_model_v3 | Mmmbop | T2 | 9.083% | 22/1 | 11 | 12 | −£1.00 | e132d302-f4f3-4c1e-9ca4-931b6829d03d | d5d6856b-6a73-4838-ad80-084a6a1215e0 |
| 2026-10-20 | Curragh 15:10 | TURF / tissue_model_v3 | Kodi Brown | T2 | 6.121% | 10/1 | 7 | 1 | +£10.00 | 36df320d-fae1-49b3-832d-6694afa542b6 | 1aca1b28-7340-401a-aed5-9ab62911495f |
| 2026-10-20 | Curragh 15:45 | TURF / tissue_model_v3 | Chipsrdown | T1 | 8.352% | 10/1 | 4 | 18 | −£1.00 | 12919931-6b14-416d-897b-8cd161356bdf | a4073c8b-0f32-437f-9b2c-ff5eb17f5a9b |
| 2026-10-20 | Hexham 15:50 | CHASE / JUMP_TISSUE_V1 | Defence Witness | T2 | 19.030% | 17/2 | 4 | 7 | −£1.00 | 2d6ca95b-f190-491c-99c5-736af713d998 | 75d8e4f8-2ea3-4491-b52e-d32be451623e |
| 2026-10-20 | Yarmouth 16:08 | TURF / tissue_model_v3 | Tactical Plan | T2 | 13.493% | 8/1 | 5 | 5 | −£1.00 | ce579bcf-3bf7-4b97-8cc4-850112b4ceb1 | a6c4c277-b542-4b1e-a4bd-80f9452ae075 |
| 2026-10-20 | Newcastle 16:30 | AW / AW_TISSUE_V2 | Sole Spirit | T1 | 12.366% | 8/1 | 6 | 9 | −£1.00 | bcbcc681-f6a3-42ee-9506-c9b1d18a1feb | 7ba20dab-eef6-4f3e-81ed-ba6a596c81ce |
| 2026-10-20 | Newcastle 16:30 | AW / AW_TISSUE_V1 | Jesmond Dawn | T2 | 9.500% | 12/1 | 8 | 11 | −£1.00 | bcbcc681-f6a3-42ee-9506-c9b1d18a1feb | 859a9f65-392d-4962-b733-4d438f34a466 |
| 2026-10-20 | Newcastle 17:00 | AW / AW_TISSUE_V2 | Dalamara | T2 | 15.005% | 8/1 | 8 | 3 | −£1.00 | e5125bb1-b800-4747-845f-822ebcf7d717 | f2c8c24b-7b61-4343-8110-0e7b0f1b84ca |
| 2026-10-20 | Newcastle 17:30 | AW / AW_TISSUE_V2 | Shes Got The Blues | T1 | 11.635% | 12/1 | 8 | 3 | −£1.00 | f01a4928-46ee-43b6-9807-75aa36cdb506 | 82386f62-3581-43c7-81c9-b1e99a611c9d |
| 2026-10-20 | Newcastle 17:30 | AW / AW_TISSUE_V2 | Sea Legend | T2 | 11.121% | 14/1 | 9 | 5 | −£1.00 | f01a4928-46ee-43b6-9807-75aa36cdb506 | ca1f3de3-2db1-4b65-a3ff-5b4c1e703a37 |
| 2026-10-20 | Newcastle 18:30 | AW / AW_TISSUE_V1 | Herakles | T1 | 11.534% | 16/1 | 9 | 13 | −£1.00 | d771cda5-f9c9-462d-b92e-4fca88a5b361 | bdd30f21-dca2-461e-8826-1be3af8d7f42 |
| 2026-10-20 | Newcastle 18:30 | AW / AW_TISSUE_V2 | Golden Havana | T1 | 11.995% | 40/1 | 13 | 5 | −£1.00 | d771cda5-f9c9-462d-b92e-4fca88a5b361 | 8abbcf19-c0b8-4ac8-a8ae-480d0470a1e2 |
| 2026-10-20 | Newcastle 19:00 | AW / AW_TISSUE_V2 | Aleppo Pepper | T1 | 14.706% | 11/1 | 7 | 4 | −£1.00 | 89ce22a1-2a74-44aa-8b94-90b582ba6561 | 6639d74a-3039-4943-bde1-99420fd97ab9 |
| 2026-10-20 | Newcastle 19:30 | AW / AW_TISSUE_V1 | Rye | T1 | 17.595% | 11/1 | 8 | 2 | −£1.00 | 74bfd5b0-3882-4df9-9e42-86e39e2817a5 | c00767de-817a-4944-8305-702868638115 |
| 2026-10-20 | Newcastle 19:30 | AW / AW_TISSUE_V2 | Rye | T1 | 18.143% | 11/1 | 8 | 2 | −£1.00 | 74bfd5b0-3882-4df9-9e42-86e39e2817a5 | c00767de-817a-4944-8305-702868638115 |
| 2026-10-20 | Newcastle 19:30 | AW / AW_TISSUE_V1 | Speeding Bullet | T2 | 9.310% | 17/2 | 6 | 5 | −£1.00 | 74bfd5b0-3882-4df9-9e42-86e39e2817a5 | e9479286-26ec-4758-bb2d-677c042a4291 |
| 2026-10-20 | Newcastle 19:30 | AW / AW_TISSUE_V2 | Speeding Bullet | T2 | 11.605% | 17/2 | 6 | 5 | −£1.00 | 74bfd5b0-3882-4df9-9e42-86e39e2817a5 | e9479286-26ec-4758-bb2d-677c042a4291 |
| 2026-10-21 | Navan 12:32 | TURF / tissue_model_v3 | El Fontenaro | T2 | 9.354% | 9/1 | 6 | 13 | −£1.00 | 4cce6512-5ec4-4983-a182-9d4948e6ed15 | 403aab74-919c-4536-9084-0921ad25dcde |
| 2026-10-21 | Newmarket 12:50 | TURF / tissue_model_v3 | Cinematically | T2 | 17.005% | 10/1 | 4 | 1 | +£10.00 | 9aa4d09d-f6bd-4995-8a2d-36eeac8cacf6 | 88749f94-b9a4-4686-a226-7a92d47c98a4 |
| 2026-10-21 | Fontwell 13:32 | CHASE / JUMP_TISSUE_V1 | Belle Montrose | T2 | 17.346% | 11/1 | 5 | 2 | −£1.00 | f3d38673-43f7-4e4b-b350-0b58df58dcca | 522d6adb-02ab-47ac-99b0-d63ff36fbe4d |
| 2026-10-21 | Fontwell 14:42 | HURDLE / JUMP_TISSUE_V1 | Fouroneohfever | T1 | 37.443% | 14/1 | 5 | 4 | −£1.00 | ce4d79df-3ef8-4dad-878e-4b3df4ce8b81 | 914425d3-bf4c-4235-bbe2-f00da3059d73 |
| 2026-10-21 | Fontwell 15:17 | CHASE / JUMP_TISSUE_V1 | Saint Arion | T1 | 17.726% | 40/1 | 8 | pulled_up | −£1.00 | 21c38bab-4a48-475b-a261-ecde5e6d8b2f | f94ded15-0fd4-40ac-b322-6595f1acf9ee |
| 2026-10-21 | Navan 15:27 | TURF / tissue_model_v3 | First Ascent | T1 | 21.833% | 16/1 | 4 | 5 | −£1.00 | 04a7adcf-85de-47bc-b365-17b5cc21f4f2 | 22c695d4-3254-476a-8d7e-1bf75d747113 |
| 2026-10-21 | Kempton 16:30 | AW / AW_TISSUE_V2 | Alanah Bananah | T1 | 23.843% | 14/1 | 5 | 6 | −£1.00 | 00c7dcb9-200e-4718-b0c9-479b23af0db8 | 09792c10-1606-4cc6-9234-732012b67e03 |
| 2026-10-21 | Kempton 16:30 | AW / AW_TISSUE_V2 | Intangible Truth | T2 | 15.200% | 11/1 | 4 | 4 | −£1.00 | 00c7dcb9-200e-4718-b0c9-479b23af0db8 | d4bdb055-ff8c-47fc-b298-ae84ac858542 |
| 2026-10-21 | Kempton 17:30 | AW / AW_TISSUE_V2 | Somers Isles | T2 | 10.312% | 14/1 | 10 | 7 | −£1.00 | fe195cdf-a206-4ff9-8606-fcc1562ca6f1 | 1da434b9-d76d-4681-be8f-4942aa982a3b |
| 2026-10-21 | Kempton 18:00 | AW / AW_TISSUE_V2 | Synergism | T1 | 15.580% | 10/1 | 5 | 5 | −£1.00 | 33b47489-2b88-499e-8ddd-9c31e553b1c7 | 60fc2451-da05-42af-84e0-2edf10a92df9 |
| 2026-10-21 | Kempton 19:00 | AW / AW_TISSUE_V2 | Leonie | T1 | 19.641% | 16/1 | 8 | 8 | −£1.00 | 6ffbabee-25e5-42e4-afe5-a324e579bdaf | db8915a2-00cb-4b42-beae-6fd0eab1356f |
| 2026-10-22 | Ffos Las 11:51 | HURDLE / JUMP_TISSUE_V1 | Funny Hunny | T2 | 20.394% | 10/1 | 4 | 4 | −£1.00 | 21fc330a-0828-4ec2-92f6-fa71399f57ab | a4509e81-190b-47cb-85a8-897173ebc35b |
| 2026-10-22 | Clonmel 13:10 | HURDLE / JUMP_TISSUE_V1 | Crypto Crash | T2 | 9.941% | 12/1 | 7 | 6 | −£1.00 | 1add4c26-2902-49ed-af88-e87fcee04493 | a6bf694d-bd63-4b86-aa6a-b8880117ff92 |
| 2026-10-22 | Newmarket 13:20 | TURF / tissue_model_v3 | Silent City | T1 | 9.491% | 17/2 | 5 | 8 | −£1.00 | 8bdb7941-24ea-405a-ae44-67fcc97d00b1 | 32713165-4c6b-4ed4-94ca-50460832b592 |
| 2026-10-22 | Newmarket 13:20 | TURF / tissue_model_v3 | Hamda's Joy | T2 | 9.338% | 16/1 | 9 | 12 | −£1.00 | 8bdb7941-24ea-405a-ae44-67fcc97d00b1 | 200025d5-67ee-431d-bae3-309999cc5c37 |
| 2026-10-22 | Ffos Las 13:36 | HURDLE / JUMP_TISSUE_V1 | Idefix De Ciergues | T1 | 23.353% | 8/1 | 5 | 4 | −£1.00 | dcb45eed-878a-48a2-b800-4cf2ee8ae3d1 | 6f7bbc06-bd93-4f09-87e3-4f479354fccb |
| 2026-10-22 | Ffos Las 13:36 | HURDLE / JUMP_TISSUE_V1 | Moonset | T2 | 16.772% | 16/1 | 6 | pulled_up | −£1.00 | dcb45eed-878a-48a2-b800-4cf2ee8ae3d1 | 10f9345e-3005-4a2b-9336-ba853a79e615 |
| 2026-10-22 | Clonmel 13:46 | HURDLE / JUMP_TISSUE_V1 | Katie Can't Count | T1 | 27.518% | 17/2 | 3 | 3 | −£1.00 | 596627e0-add6-461d-8ab0-5d7a6ef2e99f | 8eeeca2a-8166-4dad-a544-7f03cba0b120 |
| 2026-10-22 | Clonmel 13:46 | HURDLE / JUMP_TISSUE_V1 | Run For Power | T2 | 12.197% | 14/1 | 5 | pulled_up | −£1.00 | 596627e0-add6-461d-8ab0-5d7a6ef2e99f | f26698d3-9750-4668-b13c-6b6c4a4896d5 |
| 2026-10-22 | Newmarket 13:55 | TURF / tissue_model_v3 | Beach Point | T2 | 15.890% | 10/1 | 6 | 3 | −£1.00 | d650d27e-36c8-48c1-bf1b-ae9e1042cd04 | 8991605f-a1d5-4471-a54d-e8b7759208f1 |
| 2026-10-22 | Carlisle 14:02 | HURDLE / JUMP_TISSUE_V1 | Final Straw | T1 | 17.461% | 22/1 | 9 | 10 | −£1.00 | 0c1b22c9-df42-4783-ba1b-66c7ab8a04a6 | 75d16a63-6b55-42d4-b16f-7a9c93a2441a |
| 2026-10-22 | Clonmel 14:21 | HURDLE / JUMP_TISSUE_V1 | Nirisque | T1 | 12.156% | 22/1 | 11 | pulled_up | −£1.00 | 8a88a956-3886-42a9-ab5b-e1bd5f5afd1e | a2f16fb3-b00b-4fe9-be98-af8e519d5be9 |
| 2026-10-22 | Clonmel 14:21 | HURDLE / JUMP_TISSUE_V1 | Beyond Forgiveness | T2 | 11.750% | 18/1 | 9 | 2 | −£1.00 | 8a88a956-3886-42a9-ab5b-e1bd5f5afd1e | 46344b39-51ce-4913-9cc4-5b8408a621ae |
| 2026-10-22 | Newmarket 14:30 | TURF / tissue_model_v3 | Artanis | T2 | 10.908% | 20/1 | 9 | 9 | −£1.00 | 2d49b6bd-12fa-4d23-95ed-faec151bf169 | c8a87755-89a9-4ba5-8f7c-3ceaee7da6a4 |
| 2026-10-22 | Carlisle 14:37 | HURDLE / JUMP_TISSUE_V1 | Vanilla Dancer | T2 | 9.538% | 22/1 | 12 | 1 | +£22.00 | d1a32cb8-b183-4882-8cff-7c3c11a3db99 | ac948679-e7a4-46f2-ab0b-6222ade3d6be |
| 2026-10-22 | Newmarket 15:05 | TURF / tissue_model_v3 | Sierra Sands | T1 | 12.796% | 10/1 | 6 | 12 | −£1.00 | c01f285f-257d-4de7-a547-dec28c848908 | 655f5127-3d4f-48ce-a3e1-d295bda81fac |
| 2026-10-22 | Southwell 16:00 | AW / AW_TISSUE_V2 | Five Moons | T1 | 41.137% | 22/1 | 10 | 6 | −£1.00 | ffdc4af2-c207-445a-8c4a-ded559cea25b | 470aa7ba-f5a0-49df-8fe0-302e37377152 |
| 2026-10-22 | Clonmel 16:05 | CHASE / JUMP_TISSUE_V1 | Roccabaker | T2 | 8.530% | 10/1 | 6 | 5 | −£1.00 | 855d39d3-e6f9-4a22-bef9-9a1bcca1e0b9 | d245b271-15ba-4129-82b1-c6cf8f1844ba |
| 2026-10-22 | Southwell 16:30 | AW / AW_TISSUE_V2 | Mao Shang Wong | T1 | 24.045% | 9/1 | 6 | 4 | −£1.00 | 473c9368-9a1b-44fb-9eb1-6a56b44c0f16 | 407fc978-3551-4ba1-97cd-10a9d5f383f6 |
| 2026-10-22 | Southwell 17:00 | AW / AW_TISSUE_V2 | Alterity | T2 | 16.108% | 40/1 | 7 | 3 | −£1.00 | 5625b030-bafd-4924-b634-39406f0e10f1 | dc1de9e4-d730-423e-b77a-397ec349bf74 |
| 2026-10-22 | Southwell 18:00 | AW / AW_TISSUE_V2 | Lady Jemima | T1 | 33.490% | 20/1 | 6 | 8 | −£1.00 | 0dee5455-be86-4ba0-8d85-5a2706112bb9 | 1bb361ce-60f1-46b2-a311-566f89d6c959 |
| 2026-10-23 | Sligo 12:25 | HURDLE / JUMP_TISSUE_V1 | Crystabel | T2 | 20.070% | 16/1 | 5 | 5 | −£1.00 | 35102c1a-90fe-4164-922f-1a23a28e44b5 | a0ae5988-f1ea-44d6-9eab-2ffab2337101 |
| 2026-10-23 | Doncaster 13:10 | TURF / tissue_model_v3 | Goldmoyne | T2 | 9.946% | 22/1 | 12 | 3 | −£1.00 | eee1d52c-2083-455a-8903-8593831b7453 | f0eeb5c1-918a-4253-825d-6a36babc2744 |
| 2026-10-23 | Cheltenham 13:25 | HURDLE / JUMP_TISSUE_V1 | Loriko | T1 | 17.854% | 18/1 | 8 | 6 | −£1.00 | d3ce50b8-1b8b-45f3-90c3-6ec76579ae2b | 04653933-63b6-4cb3-a94d-d4d39b9f3349 |
| 2026-10-23 | Doncaster 13:45 | TURF / tissue_model_v3 | Ellusive Butterfly | T1 | 20.500% | 40/1 | 8 | 7 | −£1.00 | 062e1e66-e468-49a0-b7d2-bf872413eace | bf73911d-6f10-4f25-8c9f-49fd6a3790f1 |
| 2026-10-23 | Cheltenham 14:00 | HURDLE / JUMP_TISSUE_V1 | Sixpack | T2 | 17.618% | 22/1 | 9 | 8 | −£1.00 | 10f2588e-56e8-4ae5-aae1-ad72eabdf8bd | 7f2ad6d4-2cf9-4cbd-b878-0fe5a9393bee |
| 2026-10-23 | Cheltenham 14:35 | CHASE / JUMP_TISSUE_V1 | Palacio | T1 | 18.232% | 11/1 | 6 | 6 | −£1.00 | 5edd49fe-5bee-4a50-bd77-7402b229ae70 | 68833ef8-5e29-40c2-a219-f51eea15e5f0 |
| 2026-10-23 | Doncaster 14:55 | TURF / tissue_model_v3 | Zajal | T1 | 23.002% | 10/1 | 4 | 2 | −£1.00 | 6920cca1-1ca4-4c33-ab1e-cb77588aaf04 | c1f70680-0553-48ce-954d-be2e61f35241 |
| 2026-10-23 | Wolverhampton 15:25 | AW / AW_TISSUE_V2 | Yehudi | T1 | 19.182% | 12/1 | 5 | 1 | +£12.00 | 57ebdb3d-f153-4fa0-ba67-97205c2546c8 | da4f66b8-e0d2-459d-a4c1-c561cec0a203 |
| 2026-10-23 | Wolverhampton 15:25 | AW / AW_TISSUE_V2 | Palliser | T2 | 14.699% | 14/1 | 6 | 2 | −£1.00 | 57ebdb3d-f153-4fa0-ba67-97205c2546c8 | 00013674-09f6-44bc-8ba7-cdd8027d381a |
| 2026-10-23 | Doncaster 15:30 | TURF / tissue_model_v3 | Art Lover | T1 | 19.207% | 12/1 | 7 | 9 | −£1.00 | d50ecd33-76e0-4c7a-92a4-f1c4d9ab5be1 | 62c98b49-aca9-46af-a007-5046f9759837 |
| 2026-10-23 | Cheltenham 15:45 | CHASE / JUMP_TISSUE_V1 | My Gift To You | T2 | 14.622% | 25/1 | 10 | 6 | −£1.00 | 23550eda-8811-4c02-936d-91076b878100 | 14dd8b19-9b6e-469b-acb5-8d589d6a0060 |
| 2026-10-23 | Doncaster 16:05 | TURF / tissue_model_v3 | Never Just A Dream | T2 | 11.377% | 17/2 | 4 | 4 | −£1.00 | 84d8f4ed-58bd-41e1-b649-b88999a3cde9 | 9943f7f5-9c12-4616-ad76-88d8eec57165 |
| 2026-10-23 | Dundalk 16:45 | AW / AW_TISSUE_V2 | Saga Lucia | T1 | 12.316% | 12/1 | 7 | 12 | −£1.00 | 4f8ebed4-85e5-4234-9d56-c977418e7ec8 | b59e0319-0fa1-48ed-95b8-c37350fa25aa |
| 2026-10-23 | Wolverhampton 17:00 | AW / AW_TISSUE_V2 | Last Dandelion | T2 | 20.342% | 9/1 | 3 | 4 | −£1.00 | 534a9835-5126-4062-85c8-fa6eaa812f50 | 00252602-6753-4517-9c81-1548adaa61e1 |
| 2026-10-23 | Dundalk 18:15 | AW / AW_TISSUE_V2 | Institute | T1 | 16.109% | 50/1 | 12 | 6 | −£1.00 | bac1e15f-d683-4035-b8be-fd2f77543a2b | 5589e70a-ca5d-402b-b0a8-e502ec4983c2 |
| 2026-10-23 | Dundalk 18:15 | AW / AW_TISSUE_V2 | Valiant Force | T2 | 11.845% | 10/1 | 5 | 8 | −£1.00 | bac1e15f-d683-4035-b8be-fd2f77543a2b | 66e76502-6582-4632-93d0-96669fc1120d |
| 2026-10-23 | Wolverhampton 18:30 | AW / AW_TISSUE_V2 | Vincenzo Peruggia | T1 | 15.817% | 10/1 | 6 | 12 | −£1.00 | 7c28027b-612d-472c-9ea6-1401d41f743c | 13d9b76b-3a16-42d8-bd08-a766a9aac676 |
| 2026-10-23 | Dundalk 18:45 | AW / AW_TISSUE_V2 | Battle Ready | T2 | 11.962% | 12/1 | 5 | 7 | −£1.00 | 7a388117-5816-416e-bcba-908308a4e23c | f57b35dd-5d42-4a63-adf3-6d04c0995d72 |
| 2026-10-24 | Kelso 12:37 | HURDLE / JUMP_TISSUE_V1 | Treshnish Point | T2 | 19.560% | 66/1 | 6 | 6 | −£1.00 | b7535c38-0e68-4090-aa6f-450f4693f12d | 2d9637a4-8f26-4757-87c9-5763edb07c06 |
| 2026-10-24 | Cheltenham 13:20 | HURDLE / JUMP_TISSUE_V1 | No More Bolero | T2 | 12.380% | 25/1 | 13 | 18 | −£1.00 | 4a9ca342-abc2-4eaf-ad0c-5d4ecf0f39d9 | 3c84283c-99bf-437c-a2fb-60e3180ecfc8 |
| 2026-10-24 | Doncaster 13:40 | TURF / tissue_model_v3 | Rock Steady Beat | T2 | 8.842% | 8/1 | 3 | 3 | −£1.00 | 83c31706-a6b4-4d45-b053-c387e18f70f7 | b5a1be65-ffd7-4bcc-8f29-42174d84faa3 |
| 2026-10-24 | Doncaster 14:55 | TURF / tissue_model_v3 | A Major Payne | T2 | 11.649% | 16/1 | 8 | 12 | −£1.00 | 4bc7b712-78eb-4746-a045-b26764830b80 | 6e540b0c-222a-4d13-8ce6-dea95604a44b |
| 2026-10-24 | Cheltenham 15:05 | CHASE / JUMP_TISSUE_V1 | Follow Your Luck | T2 | 22.844% | 18/1 | 6 | 2 | −£1.00 | f5adbf19-73e0-4df5-8bec-a1ab895388ed | bd0427a9-b24d-48fa-8bd5-6af0a254c592 |
| 2026-10-24 | Southwell 16:00 | AW / AW_TISSUE_V2 | Almaty Star | T2 | 14.977% | 11/1 | 8 | 4 | −£1.00 | 0616c0d7-3eed-4892-99fc-afc4e5408ed3 | 18951052-4fd0-4719-b414-bc913b51a6c7 |
| 2026-10-24 | Doncaster 16:05 | TURF / tissue_model_v3 | Feel The Need | T2 | 9.839% | 10/1 | 6 | 2 | −£1.00 | a4531d1e-4bd9-4fac-93e3-b18c69224c7a | aefbc7cf-fcb1-4a15-bf2e-c424416a1898 |
| 2026-10-24 | Southwell 17:00 | AW / AW_TISSUE_V2 | Quite Simple | T1 | 15.024% | 18/1 | 7 | 5 | −£1.00 | 2c0cff40-7bcd-4c91-8f00-5c7a0bb13da3 | d83f031e-3b21-4c56-bd50-54196a09d3b4 |
| 2026-10-25 | Wexford 12:50 | CHASE / JUMP_TISSUE_V1 | Maverick Mack | T2 | 9.216% | 22/1 | 9 | pulled_up | −£1.00 | ead4b833-0182-4ce7-a567-e143d60f86a3 | 03bd47f0-62b3-4efb-b15a-9b91c04d0ffd |
| 2026-10-25 | Market Rasen 13:00 | HURDLE / JUMP_TISSUE_V1 | Military Cross | T2 | 17.377% | 8/1 | 4 | 2 | −£1.00 | 151bbf0e-6f7e-4b51-abba-d9bd95d2d4d7 | 066f3e0e-ec2b-47ed-9ca0-018661db3566 |
| 2026-10-25 | Galway 13:42 | CHASE / JUMP_TISSUE_V1 | Harty Cup | T1 | 19.341% | 10/1 | 4 | pulled_up | −£1.00 | 9ae9da93-e2b3-46aa-96a5-9d64fa4207ec | db5ccd0f-5e27-4030-970a-6cadade71d06 |
| 2026-10-25 | Galway 14:50 | HURDLE / JUMP_TISSUE_V1 | Blue Train | T2 | 17.092% | 14/1 | 6 | 4 | −£1.00 | 72eaf818-5f16-4e13-9a66-0ed29aed91aa | 173041ce-15cd-4d44-8bbc-4073eeafa9b4 |
| 2026-10-26 | Redcar 12:25 | TURF / tissue_model_v3 | Olympiacos | T2 | 15.865% | 9/1 | 3 | 2 | −£1.00 | b60882c1-09b8-4996-9bc9-a0d5fa8b452f | 47596975-32e1-4183-bc7e-70e9f787f842 |
| 2026-10-26 | Hereford 12:48 | HURDLE / JUMP_TISSUE_V1 | Lunar Orbit | T1 | 32.472% | 9/1 | 4 | 2 | −£1.00 | 6516ad8f-073d-4735-b14b-81dad929c997 | 3009975b-7af7-4bce-9e17-8b52d3439b6a |
| 2026-10-26 | Galway 13:12 | CHASE / JUMP_TISSUE_V1 | County Final | T1 | 19.468% | 10/1 | 5 | 5 | −£1.00 | 1cb30643-93a5-4bee-89d2-0f7246da658c | abc968f5-9796-425e-89a9-23e2fcecb53b |
| 2026-10-26 | Redcar 13:25 | TURF / tissue_model_v3 | Eagles Dream | T2 | 10.251% | 20/1 | 8 | 6 | −£1.00 | f2d34b10-0712-4e1f-8acf-135acff55a61 | 6629de12-0786-4376-9a92-8c227fdb46fb |
| 2026-10-26 | Hereford 14:18 | HURDLE / JUMP_TISSUE_V1 | Aukus | T2 | 12.295% | 8/1 | 4 | 2 | −£1.00 | 9667ca4e-7343-4ccc-bdf5-493904034884 | 5b0e09a0-d40c-4587-9d7e-ff0ad2a5ef3e |
| 2026-10-26 | Leicester 14:39 | TURF / tissue_model_v3 | Revich | T1 | 10.843% | 20/1 | 10 | 11 | −£1.00 | 42688370-b27c-4fe2-9c27-8081eb8780ff | f43bf54b-07fb-4fc4-bbf6-e7d2103ea56c |
| 2026-10-26 | Leicester 14:39 | TURF / tissue_model_v3 | Elora Prince | T2 | 10.813% | 16/1 | 8 | 1 | +£16.00 | 42688370-b27c-4fe2-9c27-8081eb8780ff | 25819d08-e2af-4378-8ea0-0d587cc87b46 |
| 2026-10-26 | Galway 14:45 | HURDLE / JUMP_TISSUE_V1 | This Songisforyou | T2 | 11.776% | 9/1 | 5 | 10 | −£1.00 | af6f4a32-27bd-4b25-b07d-ff7887322e2e | 32bba127-42fb-46e9-a0c1-b3c17a5e8b17 |
| 2026-10-26 | Redcar 15:00 | TURF / tissue_model_v3 | Mayberry Moon | T2 | 10.510% | 40/1 | 12 | 11 | −£1.00 | 430343fb-8d22-4b9b-81fc-0c3d61e64bcb | 6a87faff-0b79-42fa-bcb6-b2c6bbf29664 |
| 2026-10-26 | Leicester 15:14 | TURF / tissue_model_v3 | Magic Box | T1 | 14.691% | 11/1 | 8 | 8 | −£1.00 | 168560b4-8eaf-4f53-9931-84acb40aca3c | bbeb20df-a1f6-4d04-845e-d7baf2f3e8ff |
| 2026-10-26 | Hereford 15:27 | HURDLE / JUMP_TISSUE_V1 | Nuptown Girl | T2 | 13.780% | 40/1 | 6 | pulled_up | −£1.00 | e37034e4-d52f-4bb5-b79f-93c931fcd156 | f1118720-1d21-419b-9253-34de9a2f1432 |
| 2026-10-26 | Redcar 15:35 | TURF / tissue_model_v3 | Taaklam | T1 | 10.334% | 11/1 | 6 | 11 | −£1.00 | 66d63e31-27bf-4a69-a32b-2dc9ea7cc05e | 750974aa-810f-45aa-82ac-7b948c3624ee |
| 2026-10-26 | Leicester 15:49 | TURF / tissue_model_v3 | Woolisle | T1 | 18.504% | 16/1 | 6 | 7 | −£1.00 | 55e0d739-a873-4901-806c-0e79b61bfa28 | fd87bf20-6f70-4c6d-8848-e6ab86ff3807 |
| 2026-10-26 | Galway 15:55 | HURDLE / JUMP_TISSUE_V1 | Boola Times | T1 | 10.018% | 14/1 | 9 | pulled_up | −£1.00 | 3ed3d426-3157-4aa1-a8b9-066f74439dc9 | 7e4aa434-5472-4211-bae2-b96f767ea20b |
| 2026-10-26 | Galway 15:55 | HURDLE / JUMP_TISSUE_V1 | Diamond Dollar | T2 | 9.397% | 12/1 | 7 | pulled_up | −£1.00 | 3ed3d426-3157-4aa1-a8b9-066f74439dc9 | a806cc91-c87a-4ca2-8e34-339215cc6964 |
| 2026-10-26 | Redcar 16:05 | TURF / tissue_model_v3 | Taygar | T1 | 14.161% | 10/1 | 6 | 4 | −£1.00 | 882f45d9-87f9-4b25-b46c-318c26fc45ab | e29457ee-915e-4d17-9679-a22fd6e5b475 |
| 2026-10-26 | Southwell 19:00 | AW / AW_TISSUE_V2 | Court Alert | T2 | 15.111% | 10/1 | 4 | 3 | −£1.00 | e5bac6eb-18c7-4c71-b083-d18c21ec96e9 | b6d74041-06a0-4a6a-8a18-c2a34aaf3022 |
| 2026-10-26 | Kempton 19:15 | AW / AW_TISSUE_V2 | Heart Sign | T2 | 12.334% | 18/1 | 7 | 5 | −£1.00 | 3c54fa2a-f808-4bef-87f7-595fd9073c57 | 77e95de6-0888-44ec-bffa-c57572645144 |
| 2026-10-27 | Bangor-on-Dee 13:46 | HURDLE / JUMP_TISSUE_V1 | Court Cian | T1 | 20.491% | 12/1 | 7 | 7 | −£1.00 | 10c8e612-4ca7-4b8d-acc5-a38a47e67f5b | 7fda2a35-4c57-46a1-bbb7-cd5da07db2f9 |
| 2026-10-27 | Newcastle 14:01 | HURDLE / JUMP_TISSUE_V1 | Bodygroove | T1 | 16.169% | 8/1 | 5 | 6 | −£1.00 | ecc5ad2f-d828-407d-93bc-d8edce7b0f0b | e53be213-c874-44dc-aec2-c723c0887488 |
| 2026-10-27 | Bangor-on-Dee 14:16 | HURDLE / JUMP_TISSUE_V1 | Legend D'airy | T2 | 16.034% | 10/1 | 4 | 6 | −£1.00 | c2fd59a0-99d6-4f62-9870-6f9ba2c74a29 | d873add0-a5cc-4d17-a07b-5b9a15cf06c2 |
| 2026-10-27 | Bangor-on-Dee 14:46 | HURDLE / JUMP_TISSUE_V1 | Hornica | T2 | 18.532% | 9/1 | 5 | 2 | −£1.00 | b77217df-96f3-4a68-84a8-2fcdb03954d1 | 3febc342-fdb6-424f-8f60-f643afe8f680 |
| 2026-10-27 | Newcastle 15:01 | HURDLE / JUMP_TISSUE_V1 | Max Of Stars | T1 | 24.644% | 9/1 | 4 | 5 | −£1.00 | 81a909b6-782b-478c-a15e-8cc8e7c92ba1 | c52852f3-90d5-4848-a6ef-ccd67b4c9815 |
| 2026-10-27 | Catterick 15:10 | TURF / tissue_model_v3 | Mister Sox | T1 | 9.936% | 8/1 | 5 | 12 | −£1.00 | 58e5b600-1770-408a-abe3-f2b3511b15c6 | 42bdfc38-ad05-49f7-8a2b-235fae468b4a |
| 2026-10-27 | Catterick 15:10 | TURF / tissue_model_v3 | Swift Salian | T2 | 9.346% | 12/1 | 6 | 11 | −£1.00 | 58e5b600-1770-408a-abe3-f2b3511b15c6 | 5e499e70-f96d-45a2-9019-530028499131 |
| 2026-10-27 | Newcastle 15:31 | CHASE / JUMP_TISSUE_V1 | Balking | T2 | 18.985% | 10/1 | 5 | 3 | −£1.00 | 16d4b1a4-162d-4da6-aa35-e4b38d9fe5e0 | a6039639-a3f9-413d-a54c-2fd9b78c2bd3 |
| 2026-10-27 | Bangor-on-Dee 15:46 | CHASE / JUMP_TISSUE_V1 | Riviera Walk | T1 | 23.519% | 12/1 | 8 | pulled_up | −£1.00 | ee4a75b3-531d-4f2f-929c-5531cc607af4 | ff72d9d1-2fba-42b6-a236-430e9b915eca |
| 2026-10-27 | Wolverhampton 16:30 | AW / AW_TISSUE_V2 | Boy Named Sioux | T1 | 17.701% | 11/1 | 6 | 3 | −£1.00 | bbe4c5cc-224f-47fd-b4c7-1a140cc5145f | f634b5e1-ba39-4575-809d-dee495ecfa33 |
| 2026-10-27 | Wolverhampton 17:00 | AW / AW_TISSUE_V2 | Constella | T2 | 10.485% | 11/1 | 4 | 5 | −£1.00 | de64542d-b194-4d90-8cb0-5d0c6b450c27 | 9c5f0370-f34e-4301-bdf2-0e46dc159df4 |
| 2026-10-27 | Wolverhampton 18:00 | AW / AW_TISSUE_V2 | Cooramook | T2 | 11.228% | 14/1 | 5 | 4 | −£1.00 | 4fb0d9a4-c48b-4916-8f14-5ad466ddaab0 | 8c287f82-e161-4830-9c7e-5b2b28ea3898 |
| 2026-10-27 | Wolverhampton 19:30 | AW / AW_TISSUE_V2 | Made All | T2 | 15.312% | 18/1 | 9 | 9 | −£1.00 | c012a01a-3ebb-478c-9b49-8a01caa30b82 | ddfe685d-2f25-43d6-b63d-383c40f509c9 |
| 2026-10-27 | Wolverhampton 20:30 | AW / AW_TISSUE_V2 | La Belle Forest | T2 | 12.171% | 14/1 | 6 | 3 | −£1.00 | 214bc891-a00e-416e-9deb-99a820c7c010 | ff3f164c-195c-41d2-9b41-8335982d3362 |
| 2026-10-28 | Nottingham 13:16 | TURF / tissue_model_v3 | Campenaerts | T1 | 17.046% | 22/1 | 7 | 2 | −£1.00 | 5eb2d10d-fab0-4bf6-8765-748d540d81be | d6401b27-415f-4bab-a138-be1ec7fa5a60 |
| 2026-10-28 | Newton Abbot 13:51 | HURDLE / JUMP_TISSUE_V1 | Lallygag | T2 | 18.462% | 16/1 | 7 | 6 | −£1.00 | cb454d36-4dd5-4a8c-bcbc-57bdbabecd14 | e0466e6d-fcfc-4acf-88e8-e0daffd0d0a7 |
| 2026-10-28 | Huntingdon 14:36 | HURDLE / JUMP_TISSUE_V1 | Zafaan | T1 | 29.260% | 9/1 | 6 | pulled_up | −£1.00 | f53e677e-efd0-43b2-ac01-10e47ec5eb52 | b8f02eb8-9a03-4974-9dd8-b4139763d647 |
| 2026-10-28 | Newton Abbot 14:51 | HURDLE / JUMP_TISSUE_V1 | Paddockwood | T2 | 19.381% | 8/1 | 5 | 1 | +£8.00 | 88785c83-239b-492a-b3a5-53c022ef9ebb | 95aa1048-e189-40c4-8127-72b57ae77e78 |
| 2026-10-28 | Dundalk 15:00 | AW / AW_TISSUE_V2 | Slightly | T2 | 9.428% | 16/1 | 5 | 7 | −£1.00 | 79577e5b-56eb-4cba-9fc4-30555d187bd0 | cc4195be-9119-4386-938c-fbbc201dcc00 |
| 2026-10-28 | Huntingdon 15:06 | HURDLE / JUMP_TISSUE_V1 | Calibos | T1 | 23.993% | 8/1 | 4 | 8 | −£1.00 | 6ffbf193-3b35-407a-8b8f-d9e7ed79cb22 | 2fa5bd72-d5b3-47e7-9657-26ca1dbe1135 |
| 2026-10-28 | Dundalk 15:30 | AW / AW_TISSUE_V2 | Golden Idol | T1 | 15.004% | 10/1 | 5 | 2 | −£1.00 | 250bfbf2-0293-4644-b087-578205457add | 373284d6-dc5b-4e4d-addb-7474111bb326 |
| 2026-10-28 | Nottingham 15:46 | TURF / tissue_model_v3 | Star Start | T2 | 10.178% | 20/1 | 12 | 3 | −£1.00 | 3941cc95-ffcc-404d-a70c-7173e7c3892d | 3ab4be70-c6a6-493c-aee8-96afc58ad86e |
| 2026-10-28 | Dundalk 16:30 | AW / AW_TISSUE_V2 | Pattyandselma | T2 | 11.105% | 40/1 | 12 | 13 | −£1.00 | eb47786d-64a4-461b-ad07-dad5ba4e535c | 105925ce-317c-48c2-97c2-2dbe409ffff4 |
| 2026-10-28 | Kempton 16:45 | AW / AW_TISSUE_V2 | Seapearl | T1 | 17.004% | 9/1 | 4 | 9 | −£1.00 | 3f8c0559-a388-408e-9a3c-47f46d9383d1 | e996ba84-2b27-4059-9e60-6c8ff55e37cc |
| 2026-10-28 | Kempton 17:45 | AW / AW_TISSUE_V2 | Howluckyweare | T2 | 14.581% | 11/1 | 6 | 6 | −£1.00 | 5db2e80b-ce29-45d2-a813-1e09d4726519 | 1d938f3d-dbd3-4119-9c34-3cef04525996 |
| 2026-10-28 | Kempton 20:15 | AW / AW_TISSUE_V2 | Herculeus | T2 | 13.515% | 10/1 | 7 | 10 | −£1.00 | e3ba14a8-400c-498f-aa29-9847a66d79e5 | e7cb6661-79ef-4024-88cf-395a8c96bdbe |
| 2026-10-29 | Bath 12:42 | TURF / tissue_model_v3 | Silent Wisdom | T2 | 14.662% | 11/1 | 4 | 6 | −£1.00 | fa01e656-a9d8-4961-9e81-05f81cd78b42 | 60429368-eaee-43f9-b672-4d3af2bd4075 |
| 2026-10-29 | Ffos Las 14:00 | HURDLE / JUMP_TISSUE_V1 | Tottie's Moon | T1 | 16.542% | 125/1 | 8 | 8 | −£1.00 | 52a9f25c-d316-4946-b828-b98d595e8441 | 20a278ab-1d98-4e42-9ff6-fe12c1bcaf19 |
| 2026-10-29 | Ffos Las 14:00 | HURDLE / JUMP_TISSUE_V1 | Akrramm | T2 | 15.847% | 100/1 | 7 | 5 | −£1.00 | 52a9f25c-d316-4946-b828-b98d595e8441 | 45288d76-4f72-4ddf-88a2-047a68c238e5 |
| 2026-10-29 | Stratford 14:20 | HURDLE / JUMP_TISSUE_V1 | Cheap Sandwiches | T2 | 11.207% | 28/1 | 5 | 6 | −£1.00 | 02928b70-2729-45b4-8fd0-112745fb5c7e | 530db49c-9a24-491f-a250-42c8a4566db1 |
| 2026-10-29 | Stratford 14:50 | HURDLE / JUMP_TISSUE_V1 | Wind Your Neck In | T1 | 20.926% | 12/1 | 8 | 6 | −£1.00 | e41f0a6f-4be3-4c23-a641-0dc91652ce92 | 25a31aa7-9ae5-49b5-8c67-e85f82ee7f2f |
| 2026-10-29 | Bath 15:12 | TURF / tissue_model_v3 | Over Spiced | T1 | 13.798% | 9/1 | 4 | 6 | −£1.00 | 186aa750-c87e-4b6e-83c6-b61c6967457f | d5c8532a-da09-417f-8925-bcd094b067ff |
| 2026-10-29 | Bath 15:12 | TURF / tissue_model_v3 | Nogo's Dream | T2 | 13.259% | 22/1 | 9 | 5 | −£1.00 | 186aa750-c87e-4b6e-83c6-b61c6967457f | b4f3e0d4-e54e-441c-af04-cf8deca26ca8 |
| 2026-10-29 | Stratford 15:20 | CHASE / JUMP_TISSUE_V1 | Go West | T1 | 20.786% | 9/1 | 7 | 2 | −£1.00 | 9fa0af53-feb5-4049-b228-53dbc1936954 | aa6acae5-a832-4f4b-aa60-5f2409e296a3 |
| 2026-10-29 | Stratford 15:20 | CHASE / JUMP_TISSUE_V1 | Mr Hope Street | T2 | 20.230% | 17/2 | 5 | 3 | −£1.00 | 9fa0af53-feb5-4049-b228-53dbc1936954 | b8953b6c-e4c8-4105-9cfd-4c45d28a0e8a |
| 2026-10-29 | Bath 15:42 | TURF / tissue_model_v3 | Just King High | T2 | 8.832% | 8/1 | 4 | 14 | −£1.00 | 0b0ba255-e5d4-42ae-b71e-e7d1731862c7 | 0db4192e-178d-41ff-8ff6-bac8cf603ec0 |
| 2026-10-29 | Bath 16:12 | TURF / tissue_model_v3 | Iconic Dawn | T1 | 12.819% | 14/1 | 8 | 3 | −£1.00 | 0c04ce7d-4a3b-494b-9954-ca7ae2e2e87e | 8c4c0d9c-3d20-4715-8175-f5cd2b953e44 |
| 2026-10-29 | Southwell 17:30 | AW / AW_TISSUE_V2 | Passerine | T1 | 17.459% | 14/1 | 10 | 10 | −£1.00 | f31049b2-ebe8-431e-b2b3-6d47c9a7c763 | 2426ffb6-90bb-441f-a0c7-d656f4996b2c |
| 2026-10-29 | Southwell 17:30 | AW / AW_TISSUE_V2 | Wintour | T2 | 10.052% | 12/1 | 7 | 12 | −£1.00 | f31049b2-ebe8-431e-b2b3-6d47c9a7c763 | cede4b56-d130-41ba-99b0-84db14326ecd |
| 2026-10-29 | Southwell 19:30 | AW / AW_TISSUE_V2 | Fleur De Mer | T1 | 14.820% | 8/1 | 4 | 2 | −£1.00 | 1dbcd623-ccf8-4e36-8d9a-9c7a63b5e8ee | e3f2aced-c49f-4c97-9cb9-218692e8c1e2 |
| 2026-10-30 | Newmarket 12:05 | TURF / tissue_model_v3 | Hierax | T1 | 19.296% | 8/1 | 4 | 4 | −£1.00 | c2c4ceed-7a82-4c92-9ac7-2e33f44d5ba6 | 8d6b8541-58f9-44c7-b1f1-ce4de59a846a |
| 2026-10-30 | Newmarket 13:15 | TURF / tissue_model_v3 | Good Earth | T2 | 11.070% | 12/1 | 7 | 5 | −£1.00 | 8a32cc4a-3d2f-4f72-9ecb-a591c509f7da | deabf3a0-3d1f-444a-9736-d30dea5f419b |
| 2026-10-30 | Down Royal 13:30 | HURDLE / JUMP_TISSUE_V1 | Sneddy Eddie | T1 | 13.511% | 8/1 | 5 | 16 | −£1.00 | 48e12e65-fc77-4c5a-a021-edc32168d3ec | abdfc16d-abb8-4f75-b532-fb6c27acbb22 |
| 2026-10-30 | Down Royal 13:30 | HURDLE / JUMP_TISSUE_V1 | Juke Box Rock | T2 | 11.241% | 11/1 | 8 | 2 | −£1.00 | 48e12e65-fc77-4c5a-a021-edc32168d3ec | 65a09352-16ec-4d01-b08c-1d53625cfaa7 |
| 2026-10-30 | Uttoxeter 13:37 | HURDLE / JUMP_TISSUE_V1 | Golden Sanjida | T2 | 8.540% | 50/1 | 11 | 6 | −£1.00 | d16e0d56-cc59-40c0-b511-bd0a45926359 | 4fb0da9d-7e0c-42a8-8919-57fb504736dc |
| 2026-10-30 | Down Royal 14:00 | HURDLE / JUMP_TISSUE_V1 | Alliteration | T1 | 15.050% | 16/1 | 6 | 7 | −£1.00 | 00912b43-bfed-46f2-a62f-73d83f795a60 | dae458b1-c096-4881-89be-5d469b490abc |
| 2026-10-30 | Newmarket 14:20 | TURF / tissue_model_v3 | Al Aasy | T2 | 13.440% | 17/2 | 4 | 6 | −£1.00 | 516da43f-ccd6-4bdf-b928-bf87de15c45d | b5092f88-9650-44d3-9a3f-897872604016 |
| 2026-10-30 | Newmarket 14:55 | TURF / tissue_model_v3 | Ensor Mews | T1 | 12.926% | 12/1 | 8 | 7 | −£1.00 | d7b4e02f-d05f-4313-9035-c385a2779d65 | 9b4f152a-e9f0-497b-be60-e18b0253c2b5 |
| 2026-10-30 | Wetherby 15:00 | HURDLE / JUMP_TISSUE_V1 | Timely Salute | T2 | 15.052% | 12/1 | 5 | 7 | −£1.00 | 6d005f58-83c2-4876-a9d9-dd570df28720 | 3e5051b3-e034-475d-a620-410a61d061bf |
| 2026-10-30 | Dundalk 18:00 | AW / AW_TISSUE_V2 | Treasured Royal | T1 | 14.024% | 18/1 | 8 | 5 | −£1.00 | c8850aa7-101d-4604-a8e2-29bebfe1459f | 53bf980d-d98a-4ac8-b9ac-58f93cb09d4d |
| 2026-10-30 | Newcastle 18:15 | AW / AW_TISSUE_V2 | Tatterstall | T2 | 12.178% | 9/1 | 4 | 9 | −£1.00 | 97ed5a8f-feca-41f3-8377-ea3b0abc2d19 | c53505e8-683f-439b-a5cf-4b13b5bd6352 |
| 2026-10-30 | Dundalk 18:30 | AW / AW_TISSUE_V2 | Thunderbear | T2 | 15.056% | 12/1 | 7 | 6 | −£1.00 | f3e9befb-f6da-4a37-9020-7f01c2839ae1 | 9b7c4a6b-18b2-46b3-afb0-97cbd48745fc |
| 2026-10-30 | Dundalk 19:30 | AW / AW_TISSUE_V2 | Lady In Gold | T2 | 10.367% | 14/1 | 9 | 8 | −£1.00 | 889c4ea6-7445-4d3d-8027-0b219577fee6 | daff0db5-e139-47ac-8150-4b8638c3c1f7 |
| 2026-10-30 | Newcastle 19:45 | AW / AW_TISSUE_V2 | Viviana | T2 | 13.348% | 18/1 | 8 | 9 | −£1.00 | cfd64771-7112-4738-a3f2-f81aafa53243 | ea580a34-2e25-4580-9f7f-298d1f651651 |
| 2026-10-30 | Dundalk 20:00 | AW / AW_TISSUE_V2 | Battle Borne | T2 | 11.202% | 14/1 | 8 | 7 | −£1.00 | 6d49d9f6-f3e7-45b2-92f5-29f56f611b06 | a8f080a4-58a2-47ba-b007-21c0c35ba04b |
| 2026-10-30 | Dundalk 20:30 | AW / AW_TISSUE_V2 | Palmezzano | T1 | 20.054% | 33/1 | 9 | 9 | −£1.00 | adfcbfc5-f6e2-44cf-93b9-4f2017eaea48 | b295e50a-7d79-43f9-a43b-273a506fb427 |
| 2026-10-30 | Dundalk 20:30 | AW / AW_TISSUE_V2 | Not Just Any Eagle | T2 | 14.785% | 8/1 | 4 | 1 | +£8.00 | adfcbfc5-f6e2-44cf-93b9-4f2017eaea48 | 1e964ebc-f3e9-4542-9752-fb080ddd2181 |
| 2026-10-31 | Newmarket 11:50 | TURF / tissue_model_v3 | Harry's Halo | T2 | 11.545% | 16/1 | 8 | 5 | −£1.00 | 89a9b144-d72c-49bd-9ac9-b679499d8c64 | 8fe3ce2c-c8c8-4d42-ab1e-c5949892abb2 |
| 2026-10-31 | Ayr 13:18 | CHASE / JUMP_TISSUE_V1 | Nights In Venice | T2 | 12.687% | 10/1 | 6 | 9 | −£1.00 | 1d4f97f4-5698-4e12-8ba2-5da034a3b7d7 | 58cfcdd9-36dd-4d11-8526-44f44f120058 |
| 2026-10-31 | Down Royal 13:30 | HURDLE / JUMP_TISSUE_V1 | Abando | T2 | 9.386% | 9/1 | 3 | 2 | −£1.00 | 9b69d821-3c61-473d-b8ab-b2491b1c664e | 2cb62971-bdc5-4609-8d44-7c78c088ee17 |
| 2026-10-31 | Newmarket 13:40 | TURF / tissue_model_v3 | Jassas | T1 | 18.534% | 11/1 | 5 | 6 | −£1.00 | 6cd91573-243d-4451-a2e5-ba723a939095 | 61897b90-59d3-42ab-8646-2f221ac5b298 |
| 2026-10-31 | Ayr 13:53 | HURDLE / JUMP_TISSUE_V1 | Loch Cuan | T2 | 19.288% | 14/1 | 6 | 6 | −£1.00 | e771e9ed-668b-4909-9295-46090201ff91 | f4549e90-28ea-46ef-8ca0-c325c618574a |
| 2026-10-31 | Ascot 14:00 | CHASE / JUMP_TISSUE_V1 | Gore Point | T1 | 21.688% | 14/1 | 9 | 9 | −£1.00 | ca1b0cf4-b52d-48f7-8ee2-c1507d289d98 | 1373e542-8cfd-4ce6-b5c3-3e09236b2e25 |
| 2026-10-31 | Ascot 14:00 | CHASE / JUMP_TISSUE_V1 | Teddy Blue | T2 | 10.926% | 10/1 | 4 | 8 | −£1.00 | ca1b0cf4-b52d-48f7-8ee2-c1507d289d98 | d48058b1-62f5-48c1-a12e-cca4fdcf6e0a |
| 2026-10-31 | Newmarket 14:10 | TURF / tissue_model_v3 | Speckles | T1 | 19.391% | 12/1 | 5 | 6 | −£1.00 | 2a01e1b0-bdf3-4dd6-95c8-f72792aa6d96 | daee30e2-13e2-42bf-bb8d-20db0a658f19 |
| 2026-10-31 | Ascot 15:10 | HURDLE / JUMP_TISSUE_V1 | Masterius | T1 | 31.184% | 11/1 | 4 | 4 | −£1.00 | bcf58fa8-0ee7-4617-afdc-7f29db245042 | e6db7743-d851-4e5a-a6e4-60f9e51aebf1 |
| 2026-10-31 | Ascot 15:43 | HURDLE / JUMP_TISSUE_V1 | Nap Hand | T1 | 12.317% | 11/1 | 5 | 11 | −£1.00 | 7ca71480-97c2-48fe-a7a0-7c642749943d | d3f02ed7-e052-44c5-a7e1-13e9d491fabe |
| 2026-10-31 | Down Royal 15:50 | CHASE / JUMP_TISSUE_V1 | Herja | T1 | 61.746% | 8/1 | 3 | 3 | −£1.00 | cc6348b4-d5d7-422d-9fed-a9df001097bc | 204712aa-7b65-4cf7-bef1-4096db86de3f |
| 2026-10-31 | Newmarket 15:58 | TURF / tissue_model_v3 | Tex | T2 | 7.989% | 9/1 | 4 | 3 | −£1.00 | e19fb759-12bc-4cd3-84f5-de192f7dcfbf | 5eeacce2-5cc9-44ea-a12c-7348c3b64544 |
| 2026-10-31 | Southwell 16:00 | AW / AW_TISSUE_V2 | Launceston | T1 | 14.073% | 9/1 | 6 | 11 | −£1.00 | b67265f0-1f46-459a-907a-fe6b073af534 | 773449fe-7e4a-49cc-ba09-5e43e85caa5b |
| 2026-10-31 | Ayr 16:10 | HURDLE / JUMP_TISSUE_V1 | Secret Secret | T2 | 12.164% | 14/1 | 8 | 8 | −£1.00 | e4394493-e4bf-4a04-90fa-ab6f1e8af8f8 | 7c44e46e-2922-4b09-8e3d-479c6d3ce60f |
| 2026-11-01 | Worcester 12:10 | CHASE / JUMP_TISSUE_V1 | Mossy Fen Coolio | T2 | 10.772% | 9/1 | 4 | 2 | −£1.00 | ce1d19b0-90c8-4c06-8402-9e33dc7625cc | af6b1ffe-d9e6-4deb-810a-e53d75740ac5 |
| 2026-11-01 | Curragh 12:17 | TURF / tissue_model_v3 | System Reset | T2 | 8.117% | 150/1 | 15 | 13 | −£1.00 | 016a38ab-1025-48c4-a9f6-9920e9fde939 | d36ad133-34af-409a-b341-005782680d8b |
| 2026-11-01 | Cork 12:30 | HURDLE / JUMP_TISSUE_V1 | Pinkarizon | T1 | 20.353% | 25/1 | 5 | pulled_up | −£1.00 | d49eeea8-16e2-4137-be31-0ab3160c67b2 | 0bd4852e-0abd-40d1-ba2d-21d1809525e1 |
| 2026-11-01 | Curragh 12:52 | TURF / tissue_model_v3 | The Highway Rat | T1 | 17.611% | 8/1 | 4 | 10 | −£1.00 | 10a4c5c6-51c0-4f2a-8c4e-44eaa23495d9 | 18157989-6fac-4fb4-ad03-5db776fd7700 |
| 2026-11-01 | Cork 13:05 | HURDLE / JUMP_TISSUE_V1 | Cosmic Front | T1 | 22.838% | 25/1 | 5 | 9 | −£1.00 | 45c60d39-15b2-429a-9bac-98ce65e42863 | feec218c-6b35-4238-81a2-b277808382be |
| 2026-11-01 | Worcester 13:20 | CHASE / JUMP_TISSUE_V1 | Dalston Lad | T2 | 23.294% | 9/1 | 4 | 3 | −£1.00 | caa87235-5806-4307-b427-c60cb4f03b75 | eb1fbb5f-3c51-4346-9835-20d6f66c2702 |
| 2026-11-01 | Curragh 13:27 | TURF / tissue_model_v3 | Valentino Eclipse | T1 | 13.537% | 9/1 | 5 | 3 | −£1.00 | dc29f844-707a-416e-bd35-cf87e775e632 | f06dccf3-f9d3-46f1-a943-e7f65397ee7d |
| 2026-11-01 | Curragh 13:27 | TURF / tissue_model_v3 | Storm Ready | T2 | 13.122% | 12/1 | 7 | 6 | −£1.00 | dc29f844-707a-416e-bd35-cf87e775e632 | 0ec7f685-2c2d-4518-984c-3c29d01d60e6 |
| 2026-11-01 | Cork 13:40 | HURDLE / JUMP_TISSUE_V1 | Take The Free | T1 | 18.032% | 16/1 | 7 | 5 | −£1.00 | ee4dce1c-3e70-47ff-82fc-de9734d257da | d58cfe10-7269-469f-8e39-c3435abc39f3 |
| 2026-11-01 | Worcester 13:55 | CHASE / JUMP_TISSUE_V1 | Beauty In The Park | T2 | 13.493% | 11/1 | 5 | 7 | −£1.00 | a622cadd-c200-4708-95a3-31173d82a5b6 | fdfde02c-3617-4c72-b0ef-dd7199a7a99a |
| 2026-11-01 | Curragh 14:02 | TURF / tissue_model_v3 | Great Mover | T1 | 9.080% | 22/1 | 11 | 12 | −£1.00 | dbdabdd1-1a25-4f80-bc90-2020c1868af5 | 7211ed17-da0b-49b7-a087-f85e9a8ccd32 |
| 2026-11-01 | Cork 14:15 | HURDLE / JUMP_TISSUE_V1 | Siege Of Carthage | T2 | 8.398% | 20/1 | 5 | 4 | −£1.00 | ad2a88c6-9f2e-4c76-926c-cc7bd0b75f81 | b68fbf22-cedd-430c-9174-a97af7ffb492 |
| 2026-11-01 | Carlisle 14:23 | HURDLE / JUMP_TISSUE_V1 | Knickerbockerglory | T2 | 10.694% | 16/1 | 7 | 7 | −£1.00 | d1c2f34b-ec6d-4db5-a5f3-c3a1c3b30961 | ea5c6d33-c0f7-442f-987e-29a39f5773c6 |
| 2026-11-01 | Worcester 14:30 | HURDLE / JUMP_TISSUE_V1 | Guildhall Graduate | T2 | 15.861% | 10/1 | 3 | 3 | −£1.00 | eba8826c-fd2b-431b-9c76-05a68e83c690 | a2865b6d-5279-4055-969e-7fb98e50c494 |
| 2026-11-01 | Curragh 14:37 | TURF / tissue_model_v3 | Absurde | T1 | 18.377% | 22/1 | 7 | 11 | −£1.00 | c17ad6c0-dc00-4a31-a5ab-0219d425cf7e | e5aeadc7-8260-469b-932e-7161a9e05ffe |
| 2026-11-01 | Curragh 14:37 | TURF / tissue_model_v3 | Endless Victory | T2 | 14.365% | 22/1 | 7 | 10 | −£1.00 | c17ad6c0-dc00-4a31-a5ab-0219d425cf7e | 6cb300ba-ba02-4cdf-b35c-24a3b414648f |
| 2026-11-01 | Huntingdon 14:42 | CHASE / JUMP_TISSUE_V1 | Irish Chorus | T1 | 23.374% | 12/1 | 7 | 6 | −£1.00 | 73fe40db-47ee-44ff-a3d1-93544ba26b0a | bc5fbda3-4ffc-4746-8122-214126a9461a |
| 2026-11-01 | Worcester 15:05 | HURDLE / JUMP_TISSUE_V1 | Beau Speed | T1 | 11.819% | 8/1 | 3 | 2 | −£1.00 | 63c85cb4-a361-4ba1-b861-0dbf79c75e8e | 3c1d6914-4479-470b-8651-575a05dd9868 |
| 2026-11-01 | Curragh 15:12 | TURF / tissue_model_v3 | Diego El Queso | T1 | 10.325% | 11/1 | 8 | 9 | −£1.00 | ba06dd1b-a97a-4a2d-90d0-7b8cb2009167 | 28e1cca0-9943-4dc5-99e0-14fb82b84007 |
| 2026-11-01 | Curragh 15:47 | TURF / tissue_model_v3 | Navy Guitar | T2 | 10.712% | 33/1 | 7 | 10 | −£1.00 | fc7f0434-f9b2-49a6-9ec0-f819d27c8f78 | 0550abc3-6e04-48f6-964e-9f8318ec9c9d |
| 2026-11-01 | Curragh 16:20 | TURF / tissue_model_v3 | Miss Romagna | T2 | 11.169% | 33/1 | 10 | 11 | −£1.00 | 9020303b-8025-4907-b992-2af86d7336dd | 5c3e04b6-f71c-4c86-9b13-454f4165edba |
| 2026-11-02 | Plumpton 14:30 | HURDLE / JUMP_TISSUE_V1 | Sixty Plus | T1 | 12.580% | 10/1 | 5 | 10 | −£1.00 | 4c1442d1-9fff-4f39-9d95-4f4ad3d148e7 | 9595ca50-0ca0-4349-abc1-f6b07d066b56 |
| 2026-11-02 | Southwell 14:45 | HURDLE / JUMP_TISSUE_V1 | Westbrooke Boy | T1 | 10.779% | 12/1 | 4 | 7 | −£1.00 | 45171572-8d44-4903-b4cf-c09709a6ca7f | 4266c396-4897-4337-a071-7fefe8cb1fc6 |
| 2026-11-02 | Southwell 15:45 | HURDLE / JUMP_TISSUE_V1 | Woodview Lad | T2 | 14.447% | 20/1 | 6 | pulled_up | −£1.00 | a3b1b2af-96e8-46ba-a295-f2b0798a8681 | 8881d934-b6cf-4950-8282-548e59c49c0f |
| 2026-11-02 | Plumpton 16:00 | HURDLE / JUMP_TISSUE_V1 | Coastal Command | T1 | 25.259% | 17/2 | 5 | pulled_up | −£1.00 | 93086322-87ec-4fe6-913c-ee4fb7c3fa50 | a171b7fb-ca99-405a-9a48-8341b1c09161 |
| 2026-11-02 | Wolverhampton 16:30 | AW / AW_TISSUE_V2 | Show Biz Kid | T2 | 12.116% | 18/1 | 7 | 6 | −£1.00 | 26572269-213c-46f8-b9fe-0cac7f9c5fa2 | 17f72096-f384-4650-9bd0-7fdd522a9860 |
| 2026-11-02 | Chelmsford City 16:45 | AW / AW_TISSUE_V2 | London Is Blue | T2 | 18.743% | 11/1 | 6 | 6 | −£1.00 | 7693365b-e543-4cb9-92e0-9dfadc354321 | 01e21b69-0315-48fa-b23b-36387da904bb |
| 2026-11-02 | Wolverhampton 17:00 | AW / AW_TISSUE_V2 | The Dragon King | T1 | 21.039% | 25/1 | 7 | 7 | −£1.00 | a98796b0-18f6-4511-9ddd-79519dbbdd47 | 0c898884-d1ec-489f-8f52-818ad81e1baa |
| 2026-11-02 | Chelmsford City 17:45 | AW / AW_TISSUE_V2 | Reichenbach Falls | T1 | 19.390% | 12/1 | 5 | 5 | −£1.00 | c644bdce-eba1-45a4-b0e9-9bc7a191241b | 02222301-488c-4077-ab84-f6f82b858e0c |
| 2026-11-02 | Chelmsford City 17:45 | AW / AW_TISSUE_V2 | Reece's Call | T2 | 12.855% | 8/1 | 3 | 6 | −£1.00 | c644bdce-eba1-45a4-b0e9-9bc7a191241b | 655f02b7-97a4-4f68-9065-e5d4bedc87f4 |
| 2026-11-02 | Chelmsford City 18:15 | AW / AW_TISSUE_V2 | Last Dandelion | T2 | 12.966% | 11/1 | 4 | 4 | −£1.00 | 5b7a3b37-9680-4159-91d9-66c41903a24a | 42928e30-c497-48b4-889a-bdf6f8566ee5 |
| 2026-11-02 | Wolverhampton 18:30 | AW / AW_TISSUE_V2 | Raider | T2 | 17.463% | 18/1 | 4 | 8 | −£1.00 | ad8ba6af-447b-45c5-9783-accc2d199d69 | c6fd762b-107a-4787-b9d5-f5065f264609 |
| 2026-11-02 | Wolverhampton 19:00 | AW / AW_TISSUE_V2 | Sea Of Charm | T2 | 17.472% | 14/1 | 6 | 7 | −£1.00 | 75aba6df-5157-4849-b178-1c1f74854409 | 72d4f409-9486-4556-b679-3f5e65085f18 |
| 2026-11-03 | Fairyhouse 12:35 | CHASE / JUMP_TISSUE_V1 | Andyourbirdcansing | T2 | 13.934% | 16/1 | 7 | 7 | −£1.00 | 4901cc40-5966-46a6-afc4-086c8348c001 | 0cf6270b-0bfd-4ccd-ba89-33edb33e269e |
| 2026-11-03 | Warwick 12:53 | HURDLE / JUMP_TISSUE_V1 | Thisonesforyou | T2 | 21.900% | 14/1 | 4 | 1 | +£14.00 | 66595cd3-0a1e-464c-8bf7-0c8e48b02e73 | 109e1d8c-ce07-4bc9-9e9a-5fc3d406f2bf |
| 2026-11-03 | Lingfield 13:37 | HURDLE / JUMP_TISSUE_V1 | Raulin | T1 | 16.346% | 22/1 | 7 | 2 | −£1.00 | 5b000372-7773-4bd8-b11d-85e98c454849 | 16821864-3d99-4db1-bf74-8170e24f54b4 |
| 2026-11-03 | Lingfield 14:12 | HURDLE / JUMP_TISSUE_V1 | Poets Pearl | T1 | 17.747% | 33/1 | 7 | 6 | −£1.00 | 1b50f16d-e767-404b-968f-567aea30ac29 | c0714aed-74e8-4cef-9bc6-0c02a206ee4d |
| 2026-11-03 | Fairyhouse 14:20 | HURDLE / JUMP_TISSUE_V1 | Mojoe | T1 | 22.533% | 17/2 | 5 | 5 | −£1.00 | 61515877-3a6f-4eee-a3ac-a5f42f1df034 | e4c2c2fb-5bc4-46cd-a359-76077bf86737 |
| 2026-11-03 | Sedgefield 15:04 | HURDLE / JUMP_TISSUE_V1 | Grand Scheme | T1 | 16.517% | 25/1 | 9 | 7 | −£1.00 | d9aee12a-7c01-45dd-946c-7b02caa83227 | f9c89fdf-8317-400c-83ec-0e9838d2679d |
| 2026-11-03 | Fairyhouse 15:30 | HURDLE / JUMP_TISSUE_V1 | Wolfhill | T2 | 8.522% | 18/1 | 8 | 7 | −£1.00 | 079c9945-b910-4a75-8edc-d4673f751a8f | ee6e7bb5-16ae-4a9a-8534-3ddbde2b906c |
| 2026-11-03 | Wolverhampton 18:30 | AW / AW_TISSUE_V2 | Jungle Dance | T2 | 13.647% | 16/1 | 6 | 9 | −£1.00 | 92c63008-f1cb-49c2-9244-c7511365c534 | 51d29318-7244-4b16-9bef-8e40a941881c |
| 2026-11-03 | Wolverhampton 19:30 | AW / AW_TISSUE_V2 | The Thames Boatman | T2 | 10.724% | 28/1 | 10 | 7 | −£1.00 | 81c6102b-03a7-4238-8fa1-3060783e1d91 | 1aafffd7-9183-485b-aa4f-303efd48f066 |
| 2026-11-03 | Wolverhampton 20:00 | AW / AW_TISSUE_V2 | Tropical Talent | T2 | 14.932% | 33/1 | 10 | 8 | −£1.00 | 3ee6fb32-9322-4685-9eed-817f692fedf4 | 1c8139d4-c5bc-491f-a45b-e4094927f4a6 |
| 2026-11-04 | Musselburgh 12:05 | TURF / tissue_model_v3 | Thunderstorm Katie | T1 | 14.585% | 11/1 | 5 | 8 | −£1.00 | f533a402-c545-434d-8cfa-89eb83de05ba | 34530a09-e5a7-4a87-9196-a4d8ffc8fe04 |
| 2026-11-04 | Musselburgh 12:05 | TURF / tissue_model_v3 | Albegone | T2 | 13.047% | 10/1 | 3 | 2 | −£1.00 | f533a402-c545-434d-8cfa-89eb83de05ba | 84182371-49c7-4b5a-b24d-5ceb7fa27b6b |
| 2026-11-04 | Chepstow 12:20 | CHASE / JUMP_TISSUE_V1 | Ballynaheer | T1 | 25.888% | 9/1 | 4 | pulled_up | −£1.00 | 5123315f-2641-475c-a8f9-c7819d3a103b | a6fc9060-000c-4503-86cb-10e2e1519511 |
| 2026-11-04 | Nottingham 12:45 | TURF / tissue_model_v3 | Sonic Si | T1 | 19.792% | 14/1 | 8 | 10 | −£1.00 | 18ba4d49-dd36-4d59-a2df-3867e21b1406 | 5b53ce2f-2797-4214-bcce-098921aa368b |
| 2026-11-04 | Musselburgh 13:42 | TURF / tissue_model_v3 | Watcha Snoop | T2 | 12.192% | 33/1 | 10 | 4 | −£1.00 | 4be8d375-8c98-441e-be86-87119fc431e1 | d24ead36-3f6d-4f4a-bd24-026255c4dcad |
| 2026-11-04 | Nottingham 13:50 | TURF / tissue_model_v3 | Marquetry | T2 | 17.658% | 14/1 | 5 | 6 | −£1.00 | f2111a7d-4e75-41b4-896a-11029f3f24bb | 8eab7fc8-5e63-4a04-a3a9-6f23684577f1 |
| 2026-11-04 | Chepstow 13:58 | HURDLE / JUMP_TISSUE_V1 | Champ Kabai | T2 | 11.117% | 11/1 | 4 | 10 | −£1.00 | c6a63cee-67ca-460e-b836-51a2c549819a | c2970dcc-f192-48d9-829c-c3e35e182e25 |
| 2026-11-04 | Musselburgh 14:45 | TURF / tissue_model_v3 | Ablon | T1 | 19.829% | 14/1 | 7 | 9 | −£1.00 | 1f8039e2-07d1-4bae-936b-1c1e91313309 | d456e37a-eed1-4e4c-90cc-c5426defd137 |
| 2026-11-04 | Musselburgh 15:17 | TURF / tissue_model_v3 | Witch Hunter | T2 | 11.432% | 17/2 | 6 | 4 | −£1.00 | e89eaeef-b0a1-4e33-aa98-b07ed1c8c3f2 | 381e2eb4-f57c-4d62-9aef-e87cbdf9f146 |
| 2026-11-04 | Nottingham 15:23 | TURF / tissue_model_v3 | Al Jolson | T2 | 12.410% | 10/1 | 5 | 4 | −£1.00 | dbac89f4-c417-41e8-a272-90500dd60ae3 | 27e89bd5-9af7-47e0-87bd-abb993efd011 |
| 2026-11-04 | Nottingham 15:55 | TURF / tissue_model_v3 | Condotti | T2 | 10.619% | 11/1 | 7 | 2 | −£1.00 | 2152e110-916a-497b-a546-a4069ee159bf | 779b1a0d-4b56-4ccf-aac2-b354e575f1f6 |
| 2026-11-04 | Kempton 16:00 | AW / AW_TISSUE_V2 | You're Sensational | T2 | 13.521% | 11/1 | 4 | 3 | −£1.00 | 5e7d05ff-a178-4024-bb24-0c15c3846d92 | 383c69a6-c098-40d3-9eec-98a78bea2c0c |
| 2026-11-04 | Kempton 17:00 | AW / AW_TISSUE_V2 | Heathcliff | T2 | 17.352% | 11/1 | 4 | 3 | −£1.00 | 124f8411-f3dd-4066-888c-f034cfc4d8cf | a7c5b8da-d3b7-4f79-9001-e92574afbbc3 |
| 2026-11-04 | Dundalk 17:15 | AW / AW_TISSUE_V2 | Coincidental Glory | T2 | 14.659% | 12/1 | 6 | 4 | −£1.00 | 32f39cb5-3a3a-42fa-bfa6-194a0c3ceb73 | 236a5570-cf58-4030-bc6a-f968598cfa6d |
| 2026-11-04 | Kempton 18:00 | AW / AW_TISSUE_V2 | Invincible Speed | T1 | 17.175% | 9/1 | 4 | 5 | −£1.00 | 5f9959bd-92db-4796-bb74-b8bf5a213f1e | 6faed8e4-c2d3-4e97-bfbc-c92a41ec5256 |
| 2026-11-04 | Kempton 18:30 | AW / AW_TISSUE_V2 | Little Miss India | T2 | 14.511% | 20/1 | 8 | 5 | −£1.00 | 6991caa5-012a-497c-864d-f04e8e3920da | 0008d25b-179b-4446-bcd0-8a1091581aff |
| 2026-11-04 | Dundalk 19:15 | AW / AW_TISSUE_V2 | Thompson Gunner | T2 | 9.946% | 8/1 | 5 | 14 | −£1.00 | 40c16a74-f470-4691-9632-7c168ac59e40 | 0b21615e-ba37-487f-87a6-71840a65469c |
| 2026-11-05 | Newbury 12:42 | HURDLE / JUMP_TISSUE_V1 | Cave Bridge | T2 | 10.763% | 11/1 | 4 | 6 | −£1.00 | c0b239d8-724b-48ef-b7c5-c4b3f140f547 | 797c76e2-3895-43f0-9215-305e8fe4530b |
| 2026-11-05 | Newbury 13:17 | HURDLE / JUMP_TISSUE_V1 | Octo Gane | T2 | 17.687% | 11/1 | 4 | 2 | −£1.00 | c6acb4b7-3b2a-4580-9c35-a7204d8c3498 | 88fd748a-66f3-4c8b-8153-766c00a73fb0 |
| 2026-11-05 | Clonmel 13:25 | HURDLE / JUMP_TISSUE_V1 | Carleys Lilly | T1 | 18.222% | 22/1 | 6 | 10 | −£1.00 | 346ed8a8-3442-4bd3-bfd5-e74f0c73fa44 | 07a3a304-6d2f-4082-add6-a140bcec4da3 |
| 2026-11-05 | Newcastle 13:34 | HURDLE / JUMP_TISSUE_V1 | President Scottie | T1 | 16.067% | 11/1 | 7 | 6 | −£1.00 | 5397ac44-cb2f-46ad-981c-be56b782e0dc | b886d9b3-b392-44fe-bc62-292f1edc47a4 |
| 2026-11-05 | Newbury 13:52 | HURDLE / JUMP_TISSUE_V1 | The Flaggy Shore | T2 | 12.352% | 11/1 | 4 | 2 | −£1.00 | 69ca95d3-727f-4e78-b3b4-3546b05c992e | e0334602-d032-4fe8-a0ce-363ff95c35d8 |
| 2026-11-05 | Chelmsford City 13:57 | AW / AW_TISSUE_V2 | Bennyworth | T2 | 12.721% | 11/1 | 6 | 11 | −£1.00 | b7d2cdb4-2dbe-4767-a39e-5aff835c8e09 | 3725625e-bf9f-4cce-8673-ba15295bd6de |
| 2026-11-05 | Plumpton 14:47 | HURDLE / JUMP_TISSUE_V1 | Nicolai | T2 | 24.969% | 50/1 | 4 | 4 | −£1.00 | 8a6a2b10-974b-4ede-8a0a-c50737bb42ba | 9d4569c6-9e31-4f59-82d3-6799afa4b9a7 |
| 2026-11-05 | Newbury 14:58 | HURDLE / JUMP_TISSUE_V1 | Grand Teton | T2 | 15.370% | 8/1 | 4 | 8 | −£1.00 | 9e2f6a4b-c32e-4315-be8f-ef26a854060e | 19f668d3-46af-4a1d-a5aa-09b18955b3e4 |
| 2026-11-05 | Clonmel 15:10 | CHASE / JUMP_TISSUE_V1 | Herja | T2 | 22.239% | 11/1 | 3 | 2 | −£1.00 | 454a5678-0701-4043-9826-ffbcba035bfa | f03f73aa-edfc-458e-85f0-be3ef51508c0 |
| 2026-11-05 | Clonmel 15:45 | CHASE / JUMP_TISSUE_V1 | Courtbrack Boy | T1 | 15.814% | 9/1 | 5 | 1 | +£9.00 | 094598b9-dd6d-49d9-8e3a-a9ad50423748 | ad4a2be5-8d31-4919-8175-4a0eb1bf9b52 |
| 2026-11-05 | Clonmel 15:45 | CHASE / JUMP_TISSUE_V1 | Bruise Hill | T2 | 8.006% | 17/2 | 4 | 13 | −£1.00 | 094598b9-dd6d-49d9-8e3a-a9ad50423748 | 84f38af0-a270-4b7e-9f26-db1aab1c6b57 |
| 2026-11-05 | Chelmsford City 16:15 | AW / AW_TISSUE_V2 | Nakaaha | T1 | 19.600% | 10/1 | 4 | 7 | −£1.00 | 760cb413-2815-416c-9b1b-656c490530da | 7b8cc36c-df44-4e4f-a6d3-a19c96566f59 |
| 2026-11-05 | Southwell 16:30 | AW / AW_TISSUE_V2 | Forbidden Colours | T2 | 15.190% | 11/1 | 7 | 3 | −£1.00 | a6a85441-2156-4891-807b-6e0b6d63d191 | 78a4efa7-b1df-4152-915d-5ccb5cdc61f3 |
| 2026-11-05 | Southwell 17:00 | AW / AW_TISSUE_V2 | Quiet Soul | T1 | 14.112% | 12/1 | 7 | 7 | −£1.00 | f9db519f-2fb9-42e7-b05c-d73e22a00db1 | 60119ffd-2617-4b94-94a9-3559b394a583 |
| 2026-11-05 | Southwell 17:00 | AW / AW_TISSUE_V2 | Thai Baht | T2 | 12.888% | 9/1 | 5 | 1 | +£9.00 | f9db519f-2fb9-42e7-b05c-d73e22a00db1 | aa6d9da7-fc0e-4148-868c-2e82f2afe6c4 |
| 2026-11-05 | Chelmsford City 17:15 | AW / AW_TISSUE_V2 | Kigali | T1 | 18.271% | 9/1 | 5 | 4 | −£1.00 | aed35031-a623-4451-bc44-992c91d65d44 | 67c65825-eb4b-4a0b-aa74-61133e7bdbc9 |
| 2026-11-05 | Southwell 18:00 | AW / AW_TISSUE_V2 | Project Wallace | T2 | 18.156% | 8/1 | 4 | 7 | −£1.00 | 4a5cae48-550f-4fa3-930e-f3ea617ef0e0 | 73c1b89d-72b9-425f-ab11-33700d0fac8b |
| 2026-11-05 | Southwell 18:30 | AW / AW_TISSUE_V2 | Stanley Spencer | T1 | 21.246% | 10/1 | 6 | 6 | −£1.00 | 7e34d3ce-5d0f-4e63-8c07-d6f6e281149b | 442e652d-a79f-4204-971d-6b0f1d7cf1bd |

</details>

