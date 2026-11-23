# Hurdle V2 — completion adjustment diagnostic

Disabling completion changed **5 T1s and 16 T2s across 178 frozen November books**. In the **164 races with settled starters at both ranks in both variants**, it gained three T1 winners and lost two T2 winners. Across both ranks, it captured one more winner and returned **£0.33 less** at £1 final-SP stakes. Party Vibes was the only original top-two winner pushed out of both ranks. The earlier development replay improved top-two hit counts when completion was disabled, while its probability scores worsened. Neither sample establishes that removing or retaining the block consistently improves ranking.

## 1. Formula and documented rationale

Hurdle V2 starts with the frozen 79-input Jump V1 base and adds six standardised contributions. The first two are **Best L3 Jump Speed rank 2–3** and **missing Best L3 Jump Speed rank**. The remaining four form the completion block. For each runner, let `R` be recent non-completion, `P` latest pulled up, `F` the completed fraction and `M` missing completion history. The exact calculation is the sum of `weight × ((input − mean) / scale)` over the following columns. [Frozen Hurdle V2 model](../data/research/tissue-generation-2026-11-hurdle.json) · [Feature construction](../src/lib/racing/tissue-generation-features.ts) · [Model scorer](../src/lib/racing/tissue-generation-model.ts)

| Input | Mean | Scale | Weight | Score change per raw unit |
| --- | ---: | ---: | ---: | ---: |
| R · `recent_non_completion` | 0.030952380952380953 | 0.173188715180173 | −0.05075321311070166 | −0.293051501987 |
| P · `latest_pulled_up` | 0.06547619047619048 | 0.24736422327595578 | −0.0417139308264011 | −0.168633645860 |
| F · `completed_last3_fraction` | 0.8428571428571426 | 0.3046843899438158 | +0.03627946980596425 | +0.119072295803 |
| M · `completion_history_missing` | 0.08214285714285714 | 0.27458224298607575 | −0.03025107191415927 | −0.110171260840 |

For comparing two runners, the centring constants cancel. The completion contribution is approximately `−0.071199022448 − 0.293051501987R − 0.168633645860P + 0.119072295803F − 0.110171260840M`. Variant **A** uses all six frozen contributions. **B** drops the four **centred contributions** in the table and retains the base and both Speed-rank terms with their fitted scalers and weights. The two retained relative slopes are **+0.011175936992** and **+0.008278572177**. Setting the raw inputs to zero would leave a constant in everyone's displayed score. This replay omits the fitted terms themselves.

### Trigger conditions and missing data

- The live loader reads timestamped Sporting Life horse histories across **all codes** strictly before the original feature cutoff. The feature also requires a record before capture and excludes the target race, NR/void statuses and records with neither position nor result status. It takes up to three newest eligible records. Timed Speed is a separate history stream. A record can count for completion while supplying no Speed.
- **R** switches on when the observed, inherited `days_since_run` is **30 or fewer** and the newest completion record is classified as a non-completion. The clock comes from the base metric, so it can refer to a different run than the newest completion record. A missing clock leaves R at zero.
- **P** switches on independently when the newest record is classified as pulled up, even after a long break. The classifier gives priority to a finite numeric finishing position. A positionless latest PU can fire both R and P.
- **F** divides the completed count by the actual number of records found, from one to three. One completion from one record gives the same value as three from three. With no eligible records F is zero and **M** is one. This is different from known records with zero completions, where M is zero. The base model's original missingness flags are retained.

The unrounded centred completion contribution is **+0.047873** for known full completion, **−0.181370** for absent history and **−0.071199** for known zero completion with neither latest-failure term. A recent latest PU with two completions from three gives **−0.453503**. Relative to a fully completing rival, this last example changes the score difference by about **−0.501376**, multiplying the runner-to-rival probability ratio by roughly **0.606** with other inputs fixed. Both variants apply the stable softmax `exp(score − maxScore) / sum(exp(score − maxScore))` to the same captured field, with ascending runner ID as the exact-tie rule. A runner's absolute probability can change through rivals even when its relative rank or own completion input stays the same. [Live history loader](../src/lib/racing/tissue-generation-context.ts) · [Completion classifier](../src/lib/racing/hurdle-recency-forward.ts#L143) · [Weighted sum and softmax](../scripts/diagnose-independent-tissue-feasibility.ts)

The development notes cite earlier recency and completion research. They report recent completers at market A/E **1.0866** and recent non-completers at **0.5903**, on separate 665 and 57 settled-runner samples. The developers chose the feature definitions and fitted the six coefficients jointly on top of the fixed Jump base. On the **65/29 chronological split**, the L2=2 block took later-block log loss from **1.822254 to 1.817993**. That whole-block gate chose the context specification before refitting on all **94 races and 840 runners**. Later Top1 stayed at 10 and Top2 fell from 18 to 15 in that comparison. The gate did not test these four completion coefficients alone or optimise returns, and the later split informed specification selection. [Original research and selection gate](tissue-generation-2026-11.md) · [Development code](../scripts/develop-tissue-generation.ts) · [Manifest](../data/research/tissue-generation-2026-11-manifest.json)

## 2. Party Vibes at Warwick

Party Vibes won the **14:12 mares' handicap hurdle on 19 November** at **8/1**, sixth in the final-SP market. The pre-off book was captured at **08:04:54.846 UTC** with feature history bounded at **08:04:35.793 UTC**. Its race ID is `09d7fdf7-197a-4abc-9b75-88df57e18212` and Party Vibes' runner ID is `2cde74aa-3b58-42ab-ab4b-a1263dc7107d`. [Sporting Life result](https://www.sportinglife.com/racing/results/2026-11-19/warwick/949228/omoda-and-jaecoo-race-to-victory-mares-handicap-hurdle) · [Original case study](tissue-long-priced-selection-explanations.md)

| Horse | Frozen completion inputs (R / P / F / M) | Completion contribution | Original score / probability / rank | Disabled score / probability / rank |
| --- | --- | ---: | --- | --- |
| Miss Cynthia | 0 / 0 / 1 / 0 | +0.047873 | 0.974611 / 17.3836% / T1 | 0.926738 / 16.7365% / T1 |
| Party Vibes | 0 / 0 / 1 / 0 | +0.047873 | 0.770080 / **14.1681%** / **T2** | 0.722207 / **13.6407%** / **T3** |
| Easy To Follow | 0 / 0 / 2⁄3 / 0 | +0.008183 | 0.760231 / 14.0293% / T3 | 0.752049 / 14.0539% / T2 |

Party Vibes led Easy To Follow by **0.009849** under A. The completion-fraction difference contributed **+0.039691** to that margin. With the whole completion block disabled, she trails Easy To Follow by **0.029842**. Both runners kept their original Speed-rank inputs. A separate earlier single-column sensitivity removed only the completed fraction. It also dropped her to T3, with a different probability because the rest of the completion block was still active.

The case study reconciled three prior Chase Speed figures for Party Vibes, **106.80, 102.77 and 86.11**, and three historical completions. That is genuine measured evidence supporting the base. Her retained T2 slot was still fragile because it depended on a small score margin. Easy To Follow's earlier Fontwell entry was classified from its structured finishing position even though the provider comment described pulling up. This is a practical example of the block's dependence on result coding. The target race win and SP only evaluate the pre-race selections. [Worked history and comments](tissue-long-priced-selection-explanations.md#the-earlier-runs-behind-the-inputs) · [Fontwell source result](https://www.sportinglife.com/racing/results/2025-12-08/fontwell/893026/southern-cranes-and-access-handicap-chase-gbb-race)

## 3. November ranking, financial and probability performance

The **178 original books** ran from 5–20 November and contain **1,805 frozen runner vectors**. The comparison ranks the same complete captured field twice in every race. **177** had a reconciled complete starter field and final SP book. Huntingdon on 10 November at 15:40 was void. A further 13 races had at least one later non-runner at T1 or T2 in either version, leaving **164 paired races** for money and strike rates across both ranks. No replacement was selected after a withdrawal. All 178 books inform rank changes, and all 177 terminal fields inform supplementary probability scores. [Original generation ledger](../data/research/tissue-generation-forward-2026-11.json) · [Original result evidence](tissue-rank1-vs-rank2-diagnostic-evidence.json)

Final-SP settlement uses the original fractional price and canonical v3 £1 win singles. Started non-finishers count as losses. The SP market probability is the reciprocal of decimal SP normalized over all actual starters. SP expected wins sum these probabilities over the selected runners. Market A/E divides actual win credit by SP expected wins. Frozen model-expected wins retain their original pre-off field probabilities. The benchmark is one SP favourite per matched race, with shortest-price ties broken by ascending runner ID. Log loss and race-summed multiclass Brier use probabilities conditioned on actual starters and split winning credit if needed. The SP book is the parallel full-field forecast benchmark. [Terminal evidence checks](../src/lib/racing/hurdle-final-sp.ts) · [Canonical v3](settlement-v3.md)

| Population | Races | T1 identities changed | T2 identities changed | Any slot changed | Top-two membership changed |
| --- | --- | --- | --- | --- | --- |
| All original input books | 178 | 5 | 16 | 16 | 12 |
| Terminal complete SP fields | 177 | 5 | 16 | 16 | 12 |
| Matched starters across both ranks and variants | 164 | 4 | 15 | 15 | 12 |

| Variant | Rank | Settled selections | Wins | Strike rate | Model expected | SP expected | Market A/E | £1 final-SP P/L | ROI | Mean SP (dec.) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A · Original | T1 | 164 | 37 | 22.6% | 40.93 | 43.69 | 0.85 | −£55.61 | -33.9% | 4.81 |
| A · Original | T2 | 164 | 37 | 22.6% | 28.09 | 31.26 | 1.18 | −£16.24 | -9.9% | 11.65 |
| B · Disabled | T1 | 164 | 40 | 24.4% | 39.97 | 44.24 | 0.90 | −£36.66 | -22.4% | 4.85 |
| B · Disabled | T2 | 164 | 35 | 21.3% | 27.71 | 31.53 | 1.11 | −£35.52 | -21.7% | 11.19 |
| SP favourite | Favourite | 164 | 64 | 39.0% | — | 59.03 | 1.08 | −£13.77 | -8.4% | 2.69 |

| Effect of disabling | T1 | T2 | Top-two membership |
| --- | --- | --- | --- |
| Winner gains / losses | 3 / 0 | 2 / 4 | 2 / 1 |
| £1 SP P/L change (B minus A) | +£18.94 | −£19.28 | −£0.33 |

| Variant | Combined T1/T2 winners | Combined £1 SP P/L | Combined ROI |
| --- | --- | --- | --- |
| A · Original | 74 | −£71.85 | -21.9% |
| B · Disabled | 75 | −£72.18 | -22.0% |

| Probability comparison | Races | Original log loss / Brier | Disabled log loss / Brier | SP book log loss / Brier |
| --- | --- | --- | --- | --- |
| Matched races | 164 | 1.98121 / 0.82893 | 1.98048 / 0.82778 | 1.69718 / 0.74441 |
| All reconciled complete terminal fields | 177 | 1.96829 / 0.82886 | 1.96706 / 0.82768 | 1.69988 / 0.74763 |

Disabling the block promoted **213** runner instances and demoted **310** somewhere in the full-field order. At the top-two boundary it introduced **12** runners and removed **12**, on 12 races. The higher overall counts reflect runners shifting behind a promoted horse. The term varied within **162** of the 178 books.

In the paired sample, all three newly winning T1s were already T2 winners under A. **Westin Pimpernel (14/1), King Horse (6/4) and Velvet Outlaw (4/9)** supplied the full T1 gain. At T2, those promotions and Party Vibes' exit account for four lost winner hits. B newly selected **Molly's Lad (10/3)** and **Prairie Diamond (10/3)** at T2. Across both slots, the £9.00 gross swing from losing Party Vibes nearly exactly offset the two 10/3 gains. Dropping the Party Vibes race from both sides changes the combined P/L difference from **−£0.33 to +£8.67** for B. This illustrates sensitivity to individual races. The market-favourite benchmark won **64** races at **−8.4% ROI**, ahead of either T1 on the matched sample.

The full-field score differences in November were small. The paired intervals below resample the **15 matched racing dates** as whole clusters 10,000 times. They are descriptive, with few changed winners. Both probability-score differences and the combined return difference have intervals spanning zero.

| Paired measure | B minus A | 95% descriptive interval |
| --- | --- | --- |
| T1 strike (pp) | +1.83 | [0.00, +3.55] |
| T2 strike (pp) | −1.22 | [−3.27, +1.33] |
| T1 ROI (pp) | +11.55 | [0.00, +31.25] |
| T2 ROI (pp) | −11.75 | [−29.70, +3.13] |
| Combined ROI (pp) | −0.10 | [−7.36, +5.90] |
| Full-field log loss | −0.00073 | [−0.01760, +0.01374] |
| Full-field Brier | −0.00116 | [−0.00586, +0.00326] |

## 4. Outsiders and reliability

The band table uses original or disabled selections on the same 164 matched races. Each cell gives **selections / wins / P/L** for its own model and rank. “Leaves top two” tracks original runners, and “New to top two” tracks disabled entrants. The runner-level table records every 8/1+ entrant or exit from both slots with a reconciled final price. R, P, F and M are the original frozen completion inputs.

| Rank | SP band | A selections / wins / P/L | B selections / wins / P/L | Original leaves top two (wins) | New to top two (wins) |
| --- | --- | --- | --- | --- | --- |
| T1 | Under 8/1 | 143 / 37 / −£34.61 | 142 / 39 / −£29.66 | 0 (0) | 0 (0) |
| T1 | 8/1 to under 12/1 | 15 / 0 / −£15.00 | 15 / 0 / −£15.00 | 0 (0) | 0 (0) |
| T1 | 12/1 to under 20/1 | 4 / 0 / −£4.00 | 4 / 1 / +£11.00 | 0 (0) | 0 (0) |
| T1 | 20/1 and greater | 2 / 0 / −£2.00 | 3 / 0 / −£3.00 | 0 (0) | 1 (0) |
| T2 | Under 8/1 | 114 / 33 / −£21.24 | 120 / 33 / −£22.52 | 4 (0) | 9 (2) |
| T2 | 8/1 to under 12/1 | 16 / 2 / +£5.00 | 14 / 1 / −£2.00 | 3 (1) | 1 (0) |
| T2 | 12/1 to under 20/1 | 15 / 2 / +£19.00 | 15 / 1 / +£4.00 | 1 (0) | 1 (0) |
| T2 | 20/1 and greater | 19 / 0 / −£19.00 | 15 / 0 / −£15.00 | 4 (0) | 0 (0) |

| Race (UTC) | Paired stakes | Runner | Final SP (market rank) | Finish | Rank A → B | Score A → B | Completion inputs (R / P / F / M) | Best L3 Jump Speed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-11-06 Fontwell 15:43 | Yes | Mystical Mabel | 20/1 (8) | 6 | T2 → T4 | 0.31070 → 0.26283 | 0 / 0 / 1.000 / 0 | 112.89 |
| 2026-11-06 Fontwell 15:43 | Yes | Callero | 14/1 (7) | 4 | T4 → T2 | 0.15979 → 0.32024 | 0 / 1 / 0.667 / 0 | 106.80 |
| 2026-11-07 Gowran Park 14:20 | Yes | Jack's Sister | 11/1 (3) | 4 | T2 → T3 | -0.37151 → -0.41938 | 0 / 0 / 1.000 / 0 | 96.21 |
| 2026-11-10 Lingfield 13:50 | Yes | Templar Knight | 25/1 (3) | 4 | T2 → T3 | -0.10411 → -0.15198 | 0 / 0 / 1.000 / 0 | 164.59 |
| 2026-11-10 Fairyhouse 15:30 | Yes | Getaway Charlie | 10/1 (6) | 6 | T2 → T3 | -0.21499 → -0.26287 | 0 / 0 / 1.000 / 0 | 95.59 |
| 2026-11-12 Hereford 12:30 | Yes | Antiquarian | 12/1 (3) | 3 | T2 → T3 | 0.21409 → 0.16621 | 0 / 0 / 1.000 / 0 | 89.61 |
| 2026-11-14 Windsor 13:25 | Yes | Mount Anglesby | 10/1 (5) | 2 | T4 → T2 | 1.12087 → 1.11269 | 0 / 0 / 0.667 / 0 | 131.16 |
| 2026-11-17 Limerick 14:40 | Yes | Whiskey Serenade | 20/1 (7) | 9 | T2 → T5 | -0.14359 → -0.19146 | 0 / 0 / 1.000 / 0 | 128.57 |
| 2026-11-17 Limerick 14:40 | Yes | Wildhorserider | 20/1 (7) | 10 | T8 → T1 | -0.41651 → 0.03699 | 1 / 1 / 0.667 / 0 | — |
| 2026-11-18 Hexham 14:08 | Yes | Khaleesi Queen | 28/1 (8) | 5 | T2 → T3 | 0.32629 → 0.27841 | 0 / 0 / 1.000 / 0 | 131.52 |
| 2026-11-19 Warwick 14:12 | Yes | Party Vibes | 8/1 (6) | **Won** | T2 → T3 | 0.77008 → 0.72221 | 0 / 0 / 1.000 / 0 | 106.80 |

Across both ranks, disabling reduced 8/1+ selections from **71 to 66**, winners from **4 to 3**, and P/L from **−£16 to −£20**. Market A/E moved from **1.01 to 0.81**. Westin Pimpernel remained a top-two winner, moving from T2 to T1 at 14/1. The other original outsider winners, Rose Warrior and Fasol, stayed in the top two. Party Vibes was the only winning outsider to cross the boundary, and **no new 8/1+ winner** entered it. None of the 21 original or 18 disabled selections at 20/1+ won. The changed outsider set also includes both promotions and demotions among losers.

- **Templar Knight, 25/1 at Lingfield on 10 November, fourth.** The record contains one eligible timed prior run and Best L3 Jump Speed **164.59**, so the captured Speed aggregate rests on one figure. The completion fraction was 1 even with this shallow timed history. Removing completion moved him from **T2 to T3** and brought in Wild Wescht, whose completion history and Best L3 Speed were both missing. The rank change says more about the differential treatment of thin evidence than the strength of either runner's full prior form.
- **Wildhorserider, 20/1 at Limerick on 17 November, tenth.** Four eligible timed runs but no usable Best L3 Jump Speed. The two overlapping latest-failure flags fired, with two completions from three records. Its score rose by **0.453503** and it moved from **T8 to T1** when the block was disabled. Keeping the block contained that fragile promotion. A single outcome cannot validate the magnitude of the penalty.
- **Callero and Mystical Mabel, Fontwell on 6 November.** Callero (14/1, fourth) had measured Best L3 Speed **106.80**, two completions from three and a latest PU with the base clock at **34 days**. With only the latest-PU penalty active of the two binary failure terms, it rose from T4 to T2 under B. Mystical Mabel (20/1, sixth) had measured Best L3 **112.89** and a full completion fraction. It fell from T2 to T4. Neither won.
- **Prairie Diamond, 10/3 at Plumpton on 16 November, winner.** This is a shorter-priced counterexample. With 15 eligible timed runs, Best L3 Speed **109.22**, a 21-day base clock and a recent failure, it started at **T7**. Removing the four terms raised its probability from **6.91% to 9.29%** and rank to **T2**. The block displaced this measured runner even though it protected the Party Vibes winner in another book.

The frozen activation counts below show the flags' reach. F below one includes absent history, so it overlaps M. The other flags can overlap too. These are observed counts, with no implied return threshold.

| Frozen feature | Captured runners | Captured fields | A T1 / T2 among matched | B T1 / T2 among matched |
| --- | --- | --- | --- | --- |
| R · Recent failure | 80 | 62 | 1 / 0 | 2 / 1 |
| P · Latest PU | 122 | 81 | 1 / 4 | 3 / 4 |
| F · Completion fraction below 1 | 535 | 164 | 21 / 30 | 25 / 38 |
| M · History missing | 153 | 61 | 5 / 7 | 6 / 9 |

## 5. Earlier historical comparison

### 20 October–4 November 2026 · original development vectors

The checksummed Hurdle development extract holds the original Jump V1 base vectors, their original probabilities and the saved completion history records for **94 pre-off books and 840 runners**. Their dates precede Hurdle V2 activation. The capture-time formula was applied to the saved context to construct both shadow variants. A means the frozen Hurdle V2 formula replayed on those inputs. This is a development-era sensitivity on the same books that informed the coefficient fit. It is distinct from November's original Hurdle V2 ranks. [Frozen development extract](../data/research/tissue-generation-development-2026-11.json) · [Development provenance and manifest](../data/research/tissue-generation-2026-11-manifest.json)

The rank comparison uses all 94 books. **90** reconcile to the retained terminal Sporting Life result export and have identical settled runner fields for all variants. Four terminal rosters or outcomes differ from the earlier frozen settlements. Those races are Worcester 21 October at 15:35, Cheltenham 23 October at 15:10, Wexford 25 October at 16:10 and Fairyhouse 3 November at 16:04, all UTC. The four are excluded from paired outcome and probability metrics. The historical SP join comes from the read-only terminal export retained by the earlier data audit. [Terminal result audit](racing-2025-2026-data-market-trainer-audit.md)

| Population | Races | T1 identities changed | T2 identities changed | Any slot changed | Top-two membership changed |
| --- | --- | --- | --- | --- | --- |
| All original input books | 94 | 2 | 8 | 8 | 7 |
| Terminal complete SP fields | 90 | 2 | 8 | 8 | 7 |
| Matched starters across both ranks and variants | 90 | 2 | 8 | 8 | 7 |

| Variant | Rank | Settled selections | Wins | Strike rate | Model expected | SP expected | Market A/E | £1 final-SP P/L | ROI | Mean SP (dec.) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A · Original | T1 | 90 | 26 | 28.9% | 24.51 | 22.43 | 1.16 | −£24.96 | -27.7% | 6.19 |
| A · Original | T2 | 90 | 17 | 18.9% | 16.48 | 16.79 | 1.01 | +£0.74 | 0.8% | 8.33 |
| B · Disabled | T1 | 90 | 26 | 28.9% | 24.01 | 23.21 | 1.12 | −£26.89 | -29.9% | 6.05 |
| B · Disabled | T2 | 90 | 20 | 22.2% | 16.25 | 17.31 | 1.16 | +£8.69 | 9.7% | 8.04 |
| SP favourite | Favourite | 90 | 42 | 46.7% | — | 32.63 | 1.29 | +£9.43 | 10.5% | 2.69 |

| Effect of disabling | T1 | T2 | Top-two membership |
| --- | --- | --- | --- |
| Winner gains / losses | 1 / 1 | 3 / 0 | 3 / 0 |
| £1 SP P/L change (B minus A) | −£1.93 | +£7.95 | +£6.02 |

| Variant | Combined T1/T2 winners | Combined £1 SP P/L | Combined ROI |
| --- | --- | --- | --- |
| A · Original | 43 | −£24.22 | -13.5% |
| B · Disabled | 46 | −£18.19 | -10.1% |

| Probability comparison | Races | Original log loss / Brier | Disabled log loss / Brier | SP book log loss / Brier |
| --- | --- | --- | --- | --- |
| Matched races | 90 | 1.94277 / 0.81147 | 1.96024 / 0.81623 | 1.53984 / 0.70400 |
| All reconciled complete terminal fields | 90 | 1.94277 / 0.81147 | 1.96024 / 0.81623 | 1.53984 / 0.70400 |

Earlier disabling changed two T1s and eight T2s. Seven runners entered the top two and seven left. Among the settled picks, **Minella Buoy (5/2)** moved from T1 to T2, **A Sight To Sea (4/7)** came in at T1, and **Roxy Russet (5/4)** and **Chosen Hero (6/5)** came in at T2. Across both ranks, hit counts rose from **43 to 46**, with P/L **£6.02 better** under B. Log loss and Brier moved the other way. The paired intervals here resample **16** matched race dates. Because the completion coefficients were fitted on these fields, the probability advantage for A cannot be read as independent confirmation.

Both variants retained the same two winning outsiders in this earlier sample. Across T1 and T2, original had 44 selections at 8/1 or longer for **−£6** and disabled had 41 for **−£3**. None of the historical outsider boundary changes in the runner table was a winner.

| Paired measure | B minus A | 95% descriptive interval |
| --- | --- | --- |
| T1 strike (pp) | 0.00 | [−3.41, +3.49] |
| T2 strike (pp) | +3.33 | [0.00, +7.84] |
| T1 ROI (pp) | −2.14 | [−12.65, +5.07] |
| T2 ROI (pp) | +8.83 | [0.00, +20.79] |
| Combined ROI (pp) | +3.35 | [0.00, +8.20] |
| Full-field log loss | +0.01747 | [+0.00525, +0.03007] |
| Full-field Brier | +0.00476 | [+0.00138, +0.00863] |

<details>
<summary>Earlier 2026 development outsider bands and boundary changes</summary>

| Rank | SP band | A selections / wins / P/L | B selections / wins / P/L | Original leaves top two (wins) | New to top two (wins) |
| --- | --- | --- | --- | --- | --- |
| T1 | Under 8/1 | 70 / 26 / −£4.96 | 71 / 26 / −£7.89 | 0 (0) | 1 (1) |
| T1 | 8/1 to under 12/1 | 10 / 0 / −£10.00 | 9 / 0 / −£9.00 | 0 (0) | 0 (0) |
| T1 | 12/1 to under 20/1 | 5 / 0 / −£5.00 | 5 / 0 / −£5.00 | 0 (0) | 0 (0) |
| T1 | 20/1 and greater | 5 / 0 / −£5.00 | 5 / 0 / −£5.00 | 0 (0) | 0 (0) |
| T2 | Under 8/1 | 66 / 15 / −£13.26 | 68 / 18 / −£7.31 | 3 (0) | 5 (2) |
| T2 | 8/1 to under 12/1 | 6 / 0 / −£6.00 | 5 / 0 / −£5.00 | 2 (0) | 0 (0) |
| T2 | 12/1 to under 20/1 | 12 / 1 / +£3.00 | 11 / 1 / +£4.00 | 2 (0) | 1 (0) |
| T2 | 20/1 and greater | 6 / 1 / +£17.00 | 6 / 1 / +£17.00 | 0 (0) | 0 (0) |

| Race (UTC) | Paired stakes | Runner | Final SP (market rank) | Finish | Rank A → B | Score A → B | Completion inputs (R / P / F / M) | Best L3 Jump Speed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-10-22 Ffos Las 13:01 | Yes | Navarau | 18/1 (7) | 5 | T2 → T3 | 0.02846 → -0.01941 | 0 / 0 / 1.000 / 0 | 111.25 |
| 2026-10-22 Ffos Las 13:36 | Yes | Moonset | 16/1 (6) | pulled_up | T4 → T2 | 0.51160 → 0.67205 | 0 / 1 / 0.667 / 0 | 117.48 |
| 2026-10-26 Hereford 14:52 | Yes | Silvereen | 12/1 (4) | 6 | T2 → T3 | 0.88645 → 0.83857 | 0 / 0 / 1.000 / 0 | 116.74 |
| 2026-11-03 Sedgefield 13:54 | Yes | Letmeseethecolts | 10/1 (4) | 3 | T2 → T3 | 0.12807 → 0.08020 | 0 / 0 / 1.000 / 0 | 101.62 |
| 2026-11-04 Chepstow 13:58 | Yes | Best Trump | 9/1 (3) | 4 | T2 → T3 | 0.24510 → 0.19723 | 0 / 0 / 1.000 / 0 | 123.48 |

</details>

### Wider 2026 and 2025 coverage

The archived Jump V1 books contain the 79-column base, and the distinct recency monitor supplies some earlier frozen histories at its own capture times. The 31 monitored races before 20 October have no identical capture timestamp with the corresponding Jump V1 books. A later monitor capture can have a different field or later knowledge. The 94 development books supply the directly paired earlier base and completion context used here.

The previous attribution report contains summary results for a **1,169-race 2025** Hurdle V2/V3 reconstruction and a wider **829-race source-matched 2026** reconstruction. Those preserved summaries compare different scopes or model components. I found no auditable row-level frozen 2025 A/B field containing the original base scores or vectors plus the exact four completion inputs, and no saved comparison of this exact joint omission. Historical caches or a Hurdle-only completion proxy cannot establish the frozen mixed-code V2 inputs. Consequently there is **no 2025 estimate for this diagnostic**. [Archived Jump V1 books](../data/research/jump-tissue-forward-v1.json) · [Separate recency capture](../data/research/hurdle-recency-completion-forward-v1.json) · [Prior reconstruction coverage](tissue-component-attribution-2026-11-12.md#hurdle)

## 6. Recommendation

**Retain the current specification as the prospective reference and test a separately frozen completion-disabled shadow if more evidence is wanted.** November shows a T1/T2 trade-off, a negligible combined SP difference and little change in full-field probability quality. Earlier development books show better top-two identification and worse probability quality under removal. That split does not support a production change in either direction.

A fresh paired test should predeclare T1 and T2 winner capture, joint top-two winner capture and full-field log loss and Brier. Track final-SP P/L secondarily, along with the same fixed outsider bands and the four frozen activation patterns. This would show whether overlapping latest-failure flags suppress credible measured runners or mostly protect against fragile rankings. Partitioning final SP retrospectively is useful for evaluation. A horse's price should not decide whether the term applies.

### Verification

The frozen November ranks all reproduced exactly. Maximum absolute probability error was **2.78 × 10⁻¹⁷** over 1,805 runners. The 840 development base probabilities reproduced exactly before applying either completion variant. The replay checked the exact four-term score subtraction, terminal identity and outcome joins, and canonical v3 arithmetic. The report's tables cover both unchanged and moved runners through the stated denominators. Result data entered only the outcome join and evaluation. The four targeted production test files passed all 58 tests.

## 7. Race-by-race top-two changes

Each changed slot lists the original horse above the replacement, their final SP and SP market rank (for example, m3), their A → B scores and their A → B model ranks. **W** marks a verified winner. A dash in a slot means the selection identity stayed the same. A dash beside a horse or winner means terminal evidence was unavailable for that column. “Matched” refers to the four-pick financial sample, so all 178 or 94 input books can contribute to rank changes regardless of later withdrawals.

### November original books

| Race (UTC) | Matched | T1 original → replacement<br>SP, market rank · scores A → B · ranks A → B | T2 original → replacement<br>SP, market rank · scores A → B · ranks A → B | Confirmed winner(s) |
| --- | --- | --- | --- | --- |
| 2026-11-06 Fontwell 15:43 | Yes | — | Mystical Mabel (20/1, m8)<br>0.31070 → 0.26283 · T2 → T4<br>→ Callero (14/1, m7)<br>0.15979 → 0.32024 · T4 → T2 | Pippin's Legend 11/2 · T3 → T3 |
| 2026-11-07 Kelso 12:55 | Yes | Tigress Lilly (5/1, m3)<br>0.45897 → 0.41109 · T1 → T2<br>→ King Horse **W** (6/4, m1)<br>0.44608 → 0.60653 · T2 → T1 | King Horse **W** (6/4, m1)<br>0.44608 → 0.60653 · T2 → T1<br>→ Tigress Lilly (5/1, m3)<br>0.45897 → 0.41109 · T1 → T2 | King Horse 6/4 · T2 → T1 |
| 2026-11-07 Gowran Park 14:20 | Yes | — | Jack's Sister (11/1, m3)<br>-0.37151 → -0.41938 · T2 → T3<br>→ Got The Honours (6/5, m1)<br>-0.51249 → -0.33112 · T3 → T2 | Lyrical Park 20/1 · T4 → T4 |
| 2026-11-09 Carlisle 13:20 | Yes | — | Bo Cruz (4/1, m3)<br>0.46080 → 0.41293 · T2 → T3<br>→ Diamond Jim (7/1, m4)<br>0.42658 → 0.41839 · T3 → T2 | Disguisedlimit 28/1 · T9 → T9 |
| 2026-11-09 Punchestown 14:03 | — | It's Only A Game (NR)<br>0.11092 → 0.06304 · T1 → T2<br>→ Werner (5/6, m1)<br>-0.09785 → 0.08352 · T2 → T1 | Werner (5/6, m1)<br>-0.09785 → 0.08352 · T2 → T1<br>→ It's Only A Game (NR)<br>0.11092 → 0.06304 · T1 → T2 | Bombay Pat 5/1 · T5 → T3 |
| 2026-11-09 Stratford 15:25 | Yes | — | Cotton Socks (4/1, m4)<br>0.55304 → 0.50516 · T2 → T3<br>→ Molly's Lad **W** (10/3, m3)<br>0.54996 → 0.54178 · T3 → T2 | Molly's Lad 10/3 · T3 → T2 |
| 2026-11-09 Punchestown 15:45 | Yes | Head For Home (7/2, m1)<br>0.12947 → 0.08159 · T1 → T2<br>→ Westin Pimpernel **W** (14/1, m8)<br>0.10356 → 0.09538 · T2 → T1 | Westin Pimpernel **W** (14/1, m8)<br>0.10356 → 0.09538 · T2 → T1<br>→ Head For Home (7/2, m1)<br>0.12947 → 0.08159 · T1 → T2 | Westin Pimpernel 14/1 · T2 → T1 |
| 2026-11-10 Lingfield 13:50 | Yes | — | Templar Knight (25/1, m3)<br>-0.10411 → -0.15198 · T2 → T3<br>→ Wild Wescht (9/4, m2)<br>-0.25627 → -0.07490 · T3 → T2 | Unknown Stranger 80/1 · T5 → T4 |
| 2026-11-10 Fairyhouse 15:30 | Yes | — | Getaway Charlie (10/1, m6)<br>-0.21499 → -0.26287 · T2 → T3<br>→ Granville Street (11/2, m4)<br>-0.23010 → -0.23828 · T3 → T2 | Tuckmill 5/1 · T9 → T10 |
| 2026-11-12 Hereford 12:30 | Yes | — | Antiquarian (12/1, m3)<br>0.21409 → 0.16621 · T2 → T3<br>→ Princess Of Habo (2/1, m2)<br>0.17500 → 0.35637 · T3 → T2 | Koala Rose 1/2 · T1 → T1 |
| 2026-11-14 Windsor 13:25 | Yes | — | Doctor On Call (2/1, m1)<br>1.15516 → 1.10729 · T2 → T3<br>→ Mount Anglesby (10/1, m5)<br>1.12087 → 1.11269 · T4 → T2 | Reallyntruthfully 10/1 · T12 → T12 |
| 2026-11-14 Wetherby 13:55 | Yes | Static Charm (9/2, m2)<br>0.12796 → 0.08009 · T1 → T2<br>→ Velvet Outlaw **W** (4/9, m1)<br>0.00366 → 0.18503 · T2 → T1 | Velvet Outlaw **W** (4/9, m1)<br>0.00366 → 0.18503 · T2 → T1<br>→ Static Charm (9/2, m2)<br>0.12796 → 0.08009 · T1 → T2 | Velvet Outlaw 4/9 · T2 → T1 |
| 2026-11-16 Plumpton 13:15 | Yes | — | Cadillac Ranch (5/1, m4)<br>-0.11241 → -0.16028 · T2 → T3<br>→ Prairie Diamond **W** (10/3, m1)<br>-0.29932 → -0.01445 · T7 → T2 | Prairie Diamond 10/3 · T7 → T2 |
| 2026-11-17 Limerick 14:40 | Yes | Mydreamtell (16/1, m6)<br>-0.02160 → -0.06947 · T1 → T2<br>→ Wildhorserider (20/1, m7)<br>-0.41651 → 0.03699 · T8 → T1 | Whiskey Serenade (20/1, m7)<br>-0.14359 → -0.19146 · T2 → T5<br>→ Mydreamtell (16/1, m6)<br>-0.02160 → -0.06947 · T1 → T2 | Lord De Choisel 5/1 · T6 → T8 |
| 2026-11-18 Hexham 14:08 | Yes | — | Khaleesi Queen (28/1, m8)<br>0.32629 → 0.27841 · T2 → T3<br>→ Dante's Inferno (5/1, m3)<br>0.30857 → 0.34008 · T3 → T2 | Ratemenow 3/1 · T1 → T1 |
| 2026-11-19 Warwick 14:12 | Yes | — | Party Vibes **W** (8/1, m6)<br>0.77008 → 0.72221 · T2 → T3<br>→ Easy To Follow (7/1, m4)<br>0.76023 → 0.75205 · T3 → T2 | Party Vibes 8/1 · T2 → T3 |

### Earlier development books

| Race (UTC) | Matched | T1 original → replacement<br>SP, market rank · scores A → B · ranks A → B | T2 original → replacement<br>SP, market rank · scores A → B · ranks A → B | Confirmed winner(s) |
| --- | --- | --- | --- | --- |
| 2026-10-22 Carlisle 12:17 | Yes | — | Dilrisk (7/1, m4)<br>0.20422 → 0.15634 · T2 → T3<br>→ Johnny Moonshine (11/2, m2)<br>0.05415 → 0.21460 · T4 → T2 | Watery Borren 17/2 · T10 → T8 |
| 2026-10-22 Ffos Las 13:01 | Yes | — | Navarau (18/1, m7)<br>0.02846 → -0.01941 · T2 → T3<br>→ Oatsoeasy (11/4, m1)<br>-0.08810 → 0.09327 · T3 → T2 | The Walk 11/4 · T4 → T6 |
| 2026-10-22 Ffos Las 13:36 | Yes | — | One Eye On Vegas (6/1, m4)<br>0.53548 → 0.48761 · T2 → T4<br>→ Moonset (16/1, m6)<br>0.51160 → 0.67205 · T4 → T2 | Kilwaughter 9/4 · T3 → T5 |
| 2026-10-25 Market Rasen 13:35 | Yes | Minella Buoy **W** (5/2, m2)<br>1.09127 → 1.04339 · T1 → T2<br>→ Don Dandy (1/2, m1)<br>0.87440 → 1.05577 · T2 → T1 | Don Dandy (1/2, m1)<br>0.87440 → 1.05577 · T2 → T1<br>→ Minella Buoy **W** (5/2, m2)<br>1.09127 → 1.04339 · T1 → T2 | Minella Buoy 5/2 · T1 → T2 |
| 2026-10-26 Hereford 14:52 | Yes | — | Silvereen (12/1, m4)<br>0.88645 → 0.83857 · T2 → T3<br>→ Hello Sweety (10/3, m3)<br>0.68944 → 1.14295 · T3 → T2 | Lucy The Wire 13/8 · T1 → T1 |
| 2026-11-03 Sedgefield 13:54 | Yes | — | Letmeseethecolts (10/1, m4)<br>0.12807 → 0.08020 · T2 → T3<br>→ Roxy Russet **W** (5/4, m1)<br>0.11926 → 0.11108 · T3 → T2 | Roxy Russet 5/4 · T3 → T2 |
| 2026-11-03 Lingfield 14:12 | Yes | — | Everest (7/1, m4)<br>0.31567 → 0.26779 · T2 → T3<br>→ Chosen Hero **W** (6/5, m1)<br>0.20500 → 0.44483 · T3 → T2 | Chosen Hero 6/5 · T3 → T2 |
| 2026-11-04 Chepstow 13:58 | Yes | Champ Kabai (11/1, m4)<br>0.24973 → 0.20185 · T1 → T2<br>→ A Sight To Sea **W** (4/7, m1)<br>0.24324 → 0.42461 · T3 → T1 | Best Trump (9/1, m3)<br>0.24510 → 0.19723 · T2 → T3<br>→ Champ Kabai (11/1, m4)<br>0.24973 → 0.20185 · T1 → T2 | A Sight To Sea 4/7 · T3 → T1 |
