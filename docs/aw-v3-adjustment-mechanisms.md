# AW V3 — what the missing-Speed and same-OR adjustments do

Both coefficients came from a **joint fit over the frozen AW V2 base**. The missing-Speed term raises a runner's score relative to an otherwise equivalent horse with a measured rank. The signed same-OR term rewards the slower measured runner relative to its equal-OR peers. Neither price nor return selected those directions.

On the fixed November sample, removing the missing-Speed term displaced **eight original T2 winners from that rank**. Five moved up to T1. Three fell out of the top two, including **Xirivella at 9/1**. The same omission brought in **Tempted Angel at 14/1**. Removing the signed same-OR term changed many outsider identities while preserving all four original 8/1+ winners in the matched books. The evidence supports keeping the two questions separate in any fresh prospective research.

## 1. What the original development established

The November development aimed to add a small number of racing-context inputs while preserving the 95 existing AW V2 coefficients. It drew on earlier Speed-rank and non-red T1 work and same-OR comparison research. Speed-rank availability was encoded explicitly alongside the rank-2/3 indicator. The documentation explains why to expose rank context and compare Speed at the same OR. It provides no separate original case for rewarding an absent rank or assigning the same-OR gap a negative sign. The earlier same-OR display highlighted **positive** edges, used a different next-highest comparison for its badge, and did not change scoring. [Generation specification](tissue-generation-2026-11.md) · [Development audit](tissue-development-audit-2026-11-12.md#november-additions-turf-v3--v4-aw-v2--v3-jump--hurdle-v2) · [OR and Speed research display](today-or-speed-display.md)

The developers chose the three input definitions. The fitter then estimated their weights jointly, starting at zero and minimizing regularised race log loss with frozen AW V2 logits as offsets. The AW development sample was **79 races and 781 runners** from complete pre-off Value books with a single winner and all captured runners starting. The first **55** races fitted the candidates and the later **24** chose between L2 of 0.2 and 2. The L2 0.2 candidate reduced later-block log loss from **2.200180 to 2.171600**. It was refitted on all 79 races before freezing. Later-block Top1 and Top2 captures went from **2 to 1** and **9 to 6** during that selection comparison. The gate retained the **whole three-term block**, so it established a limited development case for the block under the chosen loss metric. It did not establish a separate role for each coefficient or a benefit at final SP. The later block informed model selection. [Development implementation](../scripts/develop-tissue-generation.ts) · [Frozen manifest](../data/research/tissue-generation-2026-11-manifest.json)

## 2. Exact production arithmetic

AW V3 adds three standardised contributions to the frozen AW V2 logit, then applies race softmax over the original active field. Each contribution is `weight × (input − mean) / scale`. The runner order is descending probability, with ascending runner ID for exact ties. The inherited column `best_l3_turf_speed` contains **AW Speed** here. It is observed only when finite and its companion missing flag is zero. The two rank inputs use competition ranks on the observed figures. [AW live feature mapping](../src/lib/racing/aw-tissue-v2.ts) · [Generation features](../src/lib/racing/tissue-generation-features.ts) · [Scorer](../src/lib/racing/tissue-generation-model.ts)

| Input | Trigger or raw value | Fitted mean | Fitted scale | Fitted weight | Effective slope |
| --- | --- | ---: | ---: | ---: | ---: |
| Speed rank 2–3 | 1 for observed rank 2 or 3, else 0 | 0.1856594110115237 | 0.38883157551101727 | +0.06536723816051147 | +0.168112 |
| Missing Speed rank | 1 when no usable Best L3 rank exists, else 0 | 0.33290653008962867 | 0.4712534056251637 | +0.14536653750881404 | +0.308468 |
| Signed same-OR gap | `(own Best L3 − mean usable Best L3 of equal-OR peers) / 10`, otherwise 0 | 1.2793863279931382e−18 | 0.5228380954857 | −0.17415188659050265 | −0.333090 |

A missing rank has a centred contribution of **+0.205777** and a measured rank has **−0.102691**. The difference is **+0.308468 logit units**, or about **1.36×** the missing horse's probability ratio to a measured rival with everything else held fixed. Removing the term subtracts 0.205777 from the missing horse and adds 0.102691 to the measured horse's displayed score. Only their relative change affects the odds ratio or ordering. All-missing and all-measured fields have a common offset from this term. AW V2's zero-filled numeric fields and individual missing flags remain in the base, and Rank 2–3 is a distinct adjustment. [Frozen AW V3 parameters](../data/research/tissue-generation-2026-11-aw.json)

The same-OR peer set consists of **other** captured active runners with exactly the same observed racecard official rating and usable Best L3 Speed. One usable peer suffices. Missing own Speed, missing OR, or an empty peer set gives a zero raw gap and an effectively zero centred term. A missing-Speed runner therefore receives neither a direct same-OR boost nor the rank-2/3 bonus. None of the context inputs uses the final price, finishing position or a later withdrawal from the original field. The scorer scales linearly, with no gap clipping, peer-count shrinkage or adjustment cap. [Feature code](../src/lib/racing/tissue-generation-features.ts) · [Softmax and weighted score](../scripts/diagnose-independent-tissue-feasibility.ts)

| Variant in this report | Missing-rank term | Signed same-OR term | Rank 2–3 term and base |
| --- | --- | --- | --- |
| A · Original | Retained | Retained | Retained |
| B · Remove missing-Speed term | Zero | Retained | Retained |
| C · Remove same-OR term | Retained | Zero | Retained |
| D · Remove both | Zero | Zero | Retained |

These labels follow the earlier four-way experiment. C here means **removal**. The later sign-reversal report used its own three-way labels. [Four-way experiment](aw-v3-isolated-adjustment-diagnostic.md) · [Sign-reversal experiment](aw-v3-reversed-speed-adjustment.md)

## 3. Missing versus measured Best L3 Speed

The inventory covers **all 123 original AW V3 books from 5–20 November**, with one original T1 and T2 per book. It includes 94 missing-rank selections. All 94 had validated final SP. The first table includes every original starter that settled. The fixed comparison keeps the exact **120 races** where T1 and T2 for all four variants started. It has 92 missing-rank selections and is used for all subgroup and ablation comparisons below. The same original capture set supplies the measured controls. Races are matched across variants. Within a rank the missing and measured subgroups still select different horses in different races, and assignment is by the original model.

Money uses the original fractional final SP and canonical settlement v3 at £1 win stakes. Non-runners contribute no stake. SP expected wins sum full starter-field-normalized reciprocals of decimal SP, and market A/E uses dead-heat-adjusted winner credit. There were no dead heats in the matched books. Mean SP is decimal and includes returned stake. The prior-run count in the tables inverts `log1p(priorRuns)` from the frozen vector. It covers observed, eligible, timed prior runs across codes, with non-runners excluded. It is not lifetime starts or AW-only starts. Comments are a separate eligible pre-capture stream. Material starts are timed runs on the target material within the preceding 365 days, with an observed zero distinct from a missing value. [Frozen November ledger](../data/research/tissue-generation-forward-2026-11.json) · [AW historical input loader](../src/lib/racing/aw-tissue-v2-sync.ts) · [Horse metrics](../src/lib/racing/horse-metrics.ts) · [Settlement v3](settlement-v3.md)

### All original November books

| Rank | Best L3 | Captured | Settled | Wins | Strike | Mean final SP (dec.) | SP E | Market A/E | £1 P/L | ROI | Prior runs mean / median | Zero prior |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | Missing | 44 | 44 | 7 | 15.9% | 7.75 | 10.58 | 0.66 | −£27.11 | -61.6% | 8.0 / 3.0 | 5 |
| T1 | Measured | 79 | 77 | 14 | 18.2% | 6.73 | 15.31 | 0.91 | −£13.21 | -17.2% | 13.4 / 11.0 | 0 |
| T2 | Missing | 50 | 50 | 10 | 20.0% | 11.08 | 7.57 | 1.32 | −£10.78 | -21.6% | 7.3 / 3.0 | 6 |
| T2 | Measured | 73 | 73 | 19 | 26.0% | 9.34 | 12.13 | 1.57 | +£15.27 | 20.9% | 13.6 / 12.0 | 0 |

### Fixed comparison sample

| Rank | Best L3 | Captured | Settled | Wins | Strike | Mean final SP (dec.) | SP E | Market A/E | £1 P/L | ROI | Prior runs mean / median | Zero prior |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | Missing | 44 | 44 | 7 | 15.9% | 7.75 | 10.58 | 0.66 | −£27.11 | -61.6% | 8.0 / 3.0 | 5 |
| T1 | Measured | 76 | 76 | 14 | 18.4% | 6.74 | 15.14 | 0.92 | −£12.21 | -16.1% | 13.3 / 11.0 | 0 |
| T2 | Missing | 48 | 48 | 9 | 18.8% | 11.41 | 6.74 | 1.34 | −£10.11 | -21.1% | 7.5 / 3.0 | 6 |
| T2 | Measured | 72 | 72 | 18 | 25.0% | 9.41 | 11.93 | 1.51 | +£12.27 | 17.0% | 13.6 / 12.0 | 0 |

### Frozen alternative form on the matched rows

| Rank | Best L3 | n | Prior runs 0 / 1 / 2 / 3+ | Older usable AW Speed if L3 missing / latest Speed observed if measured | Latest Performance | Latest Today's Rating | OR available | Comment coverage / has a flag | Same-material starts >0 / usable observed delta | Trainer rate / jockey rate |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | Missing | 44 | 5 / 8 / 8 / 23 | 14 | 14 | 14 | 28 | 39 / 35 | 12 / 12 | 44 / 44 |
| T1 | Measured | 76 | 0 / 1 / 5 / 70 | 76 | 76 | 76 | 72 | 76 / 72 | 68 / 66 | 76 / 76 |
| T2 | Missing | 48 | 6 / 6 / 9 / 27 | 15 | 15 | 15 | 30 | 42 / 40 | 12 / 11 | 48 / 48 |
| T2 | Measured | 72 | 0 / 6 / 3 / 63 | 72 | 72 | 72 | 65 | 72 / 69 | 57 / 57 | 72 / 72 |

### Full-field comparison on the same races

| Best L3 | Matched-field starters | Original T1 picks | Original T2 picks | Starter wins | Strike | SP E | SP A/E | Mean SP (dec.) | Mean prior runs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Missing | 485 | 44 | 48 | 40 | 8.2% | 41.50 | 0.96 | 31.94 | 9.6 |
| Measured | 828 | 76 | 72 | 80 | 9.7% | 78.50 | 1.02 | 27.82 | 14.6 |

| Best L3 | Mixed fields | Equal-race mean actual per runner | Equal-race mean SP probability | Equal-race mean actual minus SP |
| --- | --- | --- | --- | --- |
| Missing | 114 | 8.36% | 9.32% | −0.96 pp |
| Measured | 114 | 10.08% | 10.33% | −0.25 pp |

### Missing versus measured within final-SP bands

| Rank | Final SP | Best L3 | Selections | Wins | Strike | Mean SP (dec.) | SP E | Market A/E | £1 P/L | ROI | Mean prior runs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | Under 8/1 | Missing | 34 | 7 | 20.6% | 3.67 | 10.08 | 0.69 | −£17.11 | -50.3% | 5.8 |
| T1 | Under 8/1 | Measured | 57 | 12 | 21.1% | 4.04 | 13.84 | 0.87 | −£14.21 | -24.9% | 12.5 |
| T1 | 8/1 to under 12/1 | Missing | 4 | 0 | 0.0% | 11.00 | 0.29 | 0.00 | −£4.00 | -100.0% | 16.8 |
| T1 | 8/1 to under 12/1 | Measured | 14 | 2 | 14.3% | 10.57 | 1.08 | 1.86 | +£7.00 | 50.0% | 15.6 |
| T1 | 12/1 to under 20/1 | Missing | 3 | 0 | 0.0% | 17.00 | 0.14 | 0.00 | −£3.00 | -100.0% | 6.7 |
| T1 | 12/1 to under 20/1 | Measured | 3 | 0 | 0.0% | 13.67 | 0.19 | 0.00 | −£3.00 | -100.0% | 6.3 |
| T1 | 20/1 and greater | Missing | 3 | 0 | 0.0% | 40.33 | 0.06 | 0.00 | −£3.00 | -100.0% | 22.7 |
| T1 | 20/1 and greater | Measured | 2 | 0 | 0.0% | 46.50 | 0.04 | 0.00 | −£2.00 | -100.0% | 28.5 |
| T2 | Under 8/1 | Missing | 24 | 8 | 33.3% | 4.44 | 5.41 | 1.48 | +£3.89 | 16.2% | 4.1 |
| T2 | Under 8/1 | Measured | 49 | 17 | 34.7% | 4.75 | 10.64 | 1.60 | +£18.27 | 37.3% | 11.8 |
| T2 | 8/1 to under 12/1 | Missing | 8 | 1 | 12.5% | 10.38 | 0.64 | 1.57 | +£2.00 | 25.0% | 5.5 |
| T2 | 8/1 to under 12/1 | Measured | 11 | 0 | 0.0% | 10.73 | 0.83 | 0.00 | −£11.00 | -100.0% | 14.7 |
| T2 | 12/1 to under 20/1 | Missing | 10 | 0 | 0.0% | 15.60 | 0.53 | 0.00 | −£10.00 | -100.0% | 12.7 |
| T2 | 12/1 to under 20/1 | Measured | 7 | 1 | 14.3% | 16.43 | 0.34 | 2.90 | +£10.00 | 142.9% | 20.9 |
| T2 | 20/1 and greater | Missing | 6 | 0 | 0.0% | 33.67 | 0.16 | 0.00 | −£6.00 | -100.0% | 15.0 |
| T2 | 20/1 and greater | Measured | 5 | 0 | 0.0% | 42.40 | 0.11 | 0.00 | −£5.00 | -100.0% | 19.0 |

The missing group carries materially less recent and career evidence. Median eligible prior runs were **three at both ranks**, versus **11 and 12** with measured Best L3. But missing L3 can coexist with an older usable AW figure. The recent window takes the last three eligible horse runs **before** filtering for usable family Speed. A different code or an unusable rating can take a slot. The latest usable AW Speed column can look further back. In the matched selections, **14 missing T1s and 15 missing T2s** still had an older AW Speed figure and a latest Performance and Today's Rating. Other missing-rank horses retained OR, connections, mapped material experience or usable comments. The report's inventory shows the specific attributes for each original selection. The original capture stores the feature values and flags, rather than an exhaustive list of the raw runs and reasons a Speed figure is absent. [History-window implementation](../src/lib/racing/horse-metrics.ts) · [AW surface feature code](../src/lib/racing/aw-tissue-v2-features.ts)

The matched missing-rank T1s underperformed their own SP expectation (**A/E 0.66**) more than measured T1s (**0.92**). Missing-rank T2s exceeded SP expectation (**1.34**) while losing **21.1%** at final SP. Measured T2s did better on both measures in this period. In the under-8/1 band, missing and measured T2 strike rates were much closer (**33.3% vs 34.7%**). The 8/1–<12/1 missing T2 bucket had one winner from eight, and the measured bucket had none from 11. Those counts are too small to establish that availability has a stable effect at those prices.

The full-field view controls the choice of races. Across all actual starters in the 120 matched fields, missing and measured market A/E were **0.96 and 1.02**. On the 114 races containing both groups, the equal-race average shortfall versus individual SP was **0.96 pp** for missing and **0.25 pp** for measured. This gap is much less dramatic than the selected T1 ROI contrast. Conditioning on T1/T2 selects on the bonus, other inputs and the competing field. Conditioning on a final-SP band adds a retrospective price filter. These descriptions are associations. For the direct scoring effect, use the fixed-field omission and winner changes below.

## 4. Which longer-priced selections were promoted?

The first table counts only the original 8/1+ T1/T2 picks. It distinguishes movement out of a rank slot from movement out of the top two altogether. “Slower bonus” means the horse was below its usable equal-OR peer mean. “Faster penalty” means it was above. A zero-gap horse can lose its place when an adjusted rival rises. The subsequent tables compare each variant's own selections, including new entrants. The comparison changes only the named terms and uses the same original pre-off fields and settled outcomes.

| Original rank | SP band | n | Missing rank / signed gap ≠ 0 | Signed slower bonus / faster penalty | B changed slot / left top two / winners out | C changed slot / left top two / winners out | D changed slot / left top two / winners out |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | 8/1 to under 12/1 | 18 | 4 / 10 | 8 / 2 | 2 / 1 / 0 | 6 / 3 / 0 | 7 / 4 / 0 |
| T1 | 12/1 to under 20/1 | 6 | 3 / 2 | 2 / 0 | 1 / 0 / 0 | 1 / 1 / 0 | 3 / 1 / 0 |
| T1 | 20/1 and greater | 5 | 3 / 2 | 2 / 0 | 1 / 1 / 0 | 1 / 1 / 0 | 2 / 2 / 0 |
| T2 | 8/1 to under 12/1 | 19 | 8 / 4 | 3 / 1 | 6 / 6 / 1 | 6 / 6 / 0 | 12 / 12 / 1 |
| T2 | 12/1 to under 20/1 | 17 | 10 / 2 | 2 / 0 | 5 / 5 / 0 | 3 / 3 / 0 | 7 / 7 / 0 |
| T2 | 20/1 and greater | 11 | 6 / 3 | 2 / 1 | 6 / 5 / 0 | 4 / 3 / 0 | 8 / 7 / 0 |

| Variant | Rank | 8/1–<12/1 picks / wins | 12/1–<20/1 picks / wins | 20/1+ picks / wins | All 8/1+ picks / wins | 8/1+ SP P/L / ROI |
| --- | --- | --- | --- | --- | --- | --- |
| A | T1 | 18 / 2 | 6 / 0 | 5 / 0 | 29 / 2 | −£8.00 / -27.6% |
| A | T2 | 19 / 1 | 17 / 1 | 11 / 0 | 47 / 2 | −£20.00 / -42.6% |
| B | T1 | 16 / 2 | 6 / 0 | 5 / 0 | 27 / 2 | −£6.00 / -22.2% |
| B | T2 | 18 / 0 | 16 / 2 | 9 / 0 | 43 / 2 | −£11.00 / -25.6% |
| C | T1 | 12 / 2 | 5 / 0 | 5 / 0 | 22 / 2 | −£1.00 / -4.5% |
| C | T2 | 19 / 1 | 16 / 1 | 8 / 0 | 43 / 2 | −£16.00 / -37.2% |
| D | T1 | 12 / 2 | 4 / 0 | 4 / 0 | 20 / 2 | +£1.00 / 5.0% |
| D | T2 | 17 / 1 | 17 / 2 | 7 / 0 | 41 / 3 | +£3.00 / 7.3% |

| Variant | Original T1 / T2 8/1+ out of top two | New T1 / T2 8/1+ from outside top two | Winning 8/1+ race selections entering top two | Winning 8/1+ race selections leaving top two |
| --- | --- | --- | --- | --- |
| B | 2 / 16 | 1 / 11 | Tempted Angel 14/1 (T2) | Xirivella 9/1 (T2) |
| C | 5 / 12 | 0 / 6 | — | — |
| D | 7 / 26 | 2 / 16 | Law Of Average 11/1 (T2), Tempted Angel 14/1 (T2) | Xirivella 9/1 (T2) |

- **Missing-Speed was decisive for a subset of outsiders.** Removing it pushed 18 original 8/1+ choices out of the top two, all missing-rank runners, including 16 original T2s. The matched 8/1+ T2 count fell from 47 to 43. One outsider winner left and one entered. Same-OR removal pushed 17 original 8/1+ picks out, ten with a direct slower-peer bonus and seven with a neutral own gap. It neither added nor dropped an 8/1+ winner from the top two. Joint removal cut total 8/1+ picks from 76 to 61 and increased winner hits from four to five. No selection at 20/1 or longer won under any variant.
- **Xirivella, Dundalk 20:00 on 13 November, 9/1 winner.** Six eligible prior runs, OR 78, no usable AW Speed or latest AW Performance, zero same-material starts and three usable comments. The earlier frozen-feature reconstruction matched a Killarney win and a Bellewstown second among the recent runs. Comment flags included `led` and `switched`. In the frozen comparison with Unterberg on the T2 boundary, connections and comments were positive contributors even before the missing-rank effects. Removing the missing term moved Xirivella from **T2 to T4** at score **0.68075**, down from **0.88653**. Same-OR removal alone left Xirivella T2. [Prior worked example and frozen inputs](tissue-long-priced-selection-explanations.md#xirivella--dundalk-2000-2026-11-13)
- **Legato and Tempted Angel, Dundalk 17:40 on 18 November.** Legato (33/1, ninth) had three prior runs, OR 49 and no measured AW Speed or material starts. Its original T2 score was **−0.00278**. Removing the missing term dropped it to **T6 at −0.20856**. Tempted Angel (14/1, winner) already had Best L3 Speed **62.94**, six eligible prior runs and four starts on the same material. Its score rose from **−0.17777 to −0.07508**, and rank from **T4 to T2**. Both own same-OR inputs were zero. This exchange brought in a different outsider rather than removing outsiders as a class.
- **Hitched, Chelmsford City 16:15 on 5 November, 33/1 and eighth.** Hitched had 38 eligible prior runs, OR 71, and AW Best L3 Speed **88.94**. Equal-OR The Hare Rail had **115.61**. Hitched gained **+0.88848** from the signed term. C removed it and moved Hitched **T2 → T8** at **−0.12806**. The Hare Rail entered at T2, and Havana Touch won. The case isolates how one weaker relative Speed figure can drive an outsider's ranking. [Prior case and history](tissue-long-priced-selection-explanations.md#hitched--chelmsford-city-1615-2026-11-05)
- **Thai Baht, Southwell 17:00 on 5 November, 9/1 winner.** At OR 62, Thai Baht's **95.70** trailed Quiet Soul's **105.34**, earning **+0.32101**. The original score was **1.14008** and removing the term brought it to **0.81907**. Thai Baht stayed T1 in all four variants. **Leading Times**, a 16/1 winner at Southwell on 7 November, had measured Best L3 **106.09** and no usable equal-OR comparison. It stayed T2 under all four. Both examples show why being a long-priced winner does not establish that either adjustment caused selection.

- **White Sand Beach, Dundalk 18:45 on 6 November, 50/1 and thirteenth.** Eleven eligible prior runs and OR 85 were available. The frozen model had no usable AW Speed or same-material starts and three usable comments, two with a led flag. The trainer and jockey prior win rates were 22.55% and 15.67%. Removing the missing term lowered the score from **1.78476 to 1.57899** and left the runner T1. The selection illustrates how other frozen inputs can give a missing-rank horse a durable lead.

## 5. Winner moves under B, C and D

The matched tables list every rank-slot gain or loss of a winning selection. Scores are shown for both original and replacement horses under A and under the named omission. The listed signed term is its **original** contribution. A winner moving from T2 to T1 is a T2 loss and a T1 gain on the same race, with no change in whether the model captured the winner in its top two. Three more rank-slot changes are listed separately for the three races excluded from the primary comparison.

### B's eight original T2 winners

Five measured-Speed winners **moved to T1**. They were Fenaroli, Hayate, Arthur Carrot, Classic Bellini and Kinetic Force. The other three had missing Best L3, no latest usable AW Speed and no timed starts mapped to the target material. All left the top two.

| Winner | Final SP | Eligible prior runs | Other frozen evidence | Original → B rank |
| --- | --- | ---: | --- | --- |
| Celestial Fire | 7/4 | 1 | No OR. One usable comment that flagged `led` and equipment. | T2 → T3 |
| Xirivella | 9/1 | 6 | OR 78, recent comment flags and observed trainer/jockey rates. | T2 → T4 |
| Oliaku | 2/1 | 2 | No OR. Two usable comments, including prominent, held-up and weakened flags. | T2 → T4 |

Of the nine original missing-rank T2 winners in the matched population, **six retained T2 under B**. The three new B T2 winner hits were Polanco (7/2, originally T3), Tempted Angel (14/1, originally T4) and Prince Of Peppard (11/4, originally T1). Two of those were new top-two winner captures. Removing the term also lost missing-rank T1 winner Highland Ranger from both slots. Across both ranks, B brought in three race winners and lost four. The T1 win count increased while overall top-two winner capture fell by one.

| Variant | T1 gains / losses | T2 gains / losses | Winners into / out of top two | T1 wins / ROI | T2 wins / ROI | Log loss | Brier |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A | 0 / 0 | 0 / 0 | 0 / 0 | 21 / -32.8% | 27 / 1.8% | 2.21133 | 0.86743 |
| B | 6 / 2 | 3 / 8 | 3 / 4 | 25 / -19.4% | 22 / -5.1% | 2.20200 | 0.86480 |
| C | 3 / 2 | 4 / 3 | 4 / 2 | 22 / -36.2% | 28 / 11.3% | 2.20363 | 0.86498 |
| D | 9 / 4 | 9 / 11 | 9 / 6 | 26 / -22.8% | 25 / 17.7% | 2.19402 | 0.86205 |

### Matched rank-by-rank changes

### Variant B · T1

| Race (UTC) | Effect at T1 | Original horse (SP)<br>OR / L3 Speed / signed term<br>A → B score | Replacement (SP)<br>OR / L3 Speed / signed term<br>A → B score | Race winner · SP · A → B rank |
| --- | --- | --- | --- | --- |
| 2026-11-05 Southwell 16:00 | Gain | Bombora (3/1)<br>— / — / +0.0000<br>0.95896 → 0.75318 | Fenaroli (1/3)<br>— / 96.35 / +0.0000<br>0.82488 → 0.92757 | Fenaroli 1/3 · T2 → T1 |
| 2026-11-06 Dundalk 18:15 | Gain | Baila Conmigo (10/3)<br>68 / — / +0.0000<br>0.43148 → 0.22571 | Justenzia (11/2)<br>69 / 105.56 / +0.0000<br>0.20437 → 0.30706 | Justenzia 11/2 · T3 → T1 |
| 2026-11-07 Southwell 14:40 | Loss | Highland Ranger (6/4)<br>— / — / +0.0000<br>0.69622 → 0.49044 | Quite Simple (12/1)<br>— / 87.00 / +0.0000<br>0.64115 → 0.74384 | Highland Ranger 6/4 · T1 → T3 |
| 2026-11-17 Southwell 20:00 | Gain | Miss Deeds (6/1)<br>— / — / +0.0000<br>1.09542 → 0.88964 | Hayate (1/4)<br>90 / 103.22 / +0.0000<br>0.98864 → 1.09133 | Hayate 1/4 · T2 → T1 |
| 2026-11-19 Lingfield 11:48 | Gain | Rogue Imperial (15/8)<br>82 / — / +0.0000<br>1.70710 → 1.50132 | Arthur Carrot (10/3)<br>75 / 100.69 / +0.0000<br>1.56271 → 1.66540 | Arthur Carrot 10/3 · T2 → T1 |
| 2026-11-19 Lingfield 12:53 | Gain | Grasshopper (5/1)<br>— / — / +0.0000<br>0.24078 → 0.03500 | Classic Bellini (11/8)<br>64 / 92.56 / +0.0000<br>0.23778 → 0.34047 | Classic Bellini 11/8 · T2 → T1 |
| 2026-11-19 Newcastle 19:40 | Gain | Our Absent Friends (28/1)<br>73 / — / +0.0000<br>0.63234 → 0.42656 | Kinetic Force (11/2)<br>80 / 105.95 / +0.0000<br>0.61513 → 0.71782 | Kinetic Force 11/2 · T2 → T1 |
| 2026-11-20 Dundalk 17:45 | Loss | Prince Of Peppard (11/4)<br>80 / — / +0.0000<br>1.03336 → 0.82759 | Marcescence (11/2)<br>75 / 96.30 / +0.0000<br>0.89543 → 0.99812 | Prince Of Peppard 11/4 · T1 → T2 |

### Variant B · T2

| Race (UTC) | Effect at T2 | Original horse (SP)<br>OR / L3 Speed / signed term<br>A → B score | Replacement (SP)<br>OR / L3 Speed / signed term<br>A → B score | Race winner · SP · A → B rank |
| --- | --- | --- | --- | --- |
| 2026-11-05 Southwell 16:00 | Loss | Fenaroli (1/3)<br>— / 96.35 / +0.0000<br>0.82488 → 0.92757 | Bombora (3/1)<br>— / — / +0.0000<br>0.95896 → 0.75318 | Fenaroli 1/3 · T2 → T1 |
| 2026-11-05 Southwell 17:30 | Loss | Celestial Fire (7/4)<br>— / — / +0.0000<br>0.40812 → 0.20234 | Classic Bellini (6/1)<br>64 / 92.56 / +0.0000<br>0.12842 → 0.23111 | Celestial Fire 7/4 · T2 → T3 |
| 2026-11-06 Dundalk 20:15 | Gain | Sayonara (25/1)<br>56 / — / +0.0000<br>0.72124 → 0.51547 | Polanco (7/2)<br>52 / 113.77 / +0.0000<br>0.44586 → 0.54855 | Polanco 7/2 · T3 → T2 |
| 2026-11-13 Dundalk 20:00 | Loss | Xirivella (9/1)<br>78 / — / +0.0000<br>0.88653 → 0.68075 | Unterberg (17/2)<br>83 / 110.13 / +0.0000<br>0.70603 → 0.80872 | Xirivella 9/1 · T2 → T4 |
| 2026-11-17 Southwell 20:00 | Loss | Hayate (1/4)<br>90 / 103.22 / +0.0000<br>0.98864 → 1.09133 | Miss Deeds (6/1)<br>— / — / +0.0000<br>1.09542 → 0.88964 | Hayate 1/4 · T2 → T1 |
| 2026-11-18 Dundalk 17:40 | Gain | Legato (33/1)<br>49 / — / +0.0000<br>-0.00278 → -0.20856 | Tempted Angel (14/1)<br>50 / 62.94 / +0.0000<br>-0.17777 → -0.07508 | Tempted Angel 14/1 · T4 → T2 |
| 2026-11-19 Lingfield 11:48 | Loss | Arthur Carrot (10/3)<br>75 / 100.69 / +0.0000<br>1.56271 → 1.66540 | Show Me Glory (5/1)<br>80 / 104.92 / +0.0000<br>1.49641 → 1.59910 | Arthur Carrot 10/3 · T2 → T1 |
| 2026-11-19 Lingfield 12:53 | Loss | Classic Bellini (11/8)<br>64 / 92.56 / +0.0000<br>0.23778 → 0.34047 | Grasshopper (5/1)<br>— / — / +0.0000<br>0.24078 → 0.03500 | Classic Bellini 11/8 · T2 → T1 |
| 2026-11-19 Newcastle 19:40 | Loss | Kinetic Force (11/2)<br>80 / 105.95 / +0.0000<br>0.61513 → 0.71782 | Changeofmind (7/1)<br>76 / 101.07 / +0.2182<br>0.60164 → 0.70433 | Kinetic Force 11/2 · T2 → T1 |
| 2026-11-20 Wolverhampton 17:00 | Loss | Oliaku (2/1)<br>— / — / +0.0000<br>0.24039 → 0.03461 | Butterfly Beach (9/2)<br>69 / 96.86 / +0.0000<br>0.00964 → 0.11233 | Oliaku 2/1 · T2 → T4 |
| 2026-11-20 Dundalk 17:45 | Gain | Marcescence (11/2)<br>75 / 96.30 / +0.0000<br>0.89543 → 0.99812 | Prince Of Peppard (11/4)<br>80 / — / +0.0000<br>1.03336 → 0.82759 | Prince Of Peppard 11/4 · T1 → T2 |

### Variant C · T1

| Race (UTC) | Effect at T1 | Original horse (SP)<br>OR / L3 Speed / signed term<br>A → C score | Replacement (SP)<br>OR / L3 Speed / signed term<br>A → C score | Race winner · SP · A → C rank |
| --- | --- | --- | --- | --- |
| 2026-11-05 Southwell 16:30 | Gain | Forbidden Colours (11/1)<br>67 / 94.48 / +0.2755<br>0.98870 → 0.71317 | Lady Mariko (7/2)<br>69 / 93.46 / −0.0032<br>0.83266 → 0.83586 | Lady Mariko 7/2 · T2 → T1 |
| 2026-11-06 Newcastle 18:30 | Loss | Wise Crack (6/1)<br>63 / 93.91 / +0.6513<br>0.70190 → 0.05057 | Educating Rita (10/3)<br>64 / 115.52 / +0.0000<br>0.42823 → 0.42823 | Wise Crack 6/1 · T1 → T6 |
| 2026-11-16 Wolverhampton 20:30 | Loss | It's A Love Thing (7/1)<br>56 / 107.53 / +0.0000<br>0.81188 → 0.81188 | Saxophonic (11/10)<br>59 / 105.83 / −0.3692<br>0.49663 → 0.86584 | It's A Love Thing 7/1 · T1 → T2 |
| 2026-11-19 Newcastle 18:10 | Gain | Luminare (9/1)<br>76 / 100.45 / +0.0724<br>1.10710 → 1.03472 | Frankies Dream (5/2)<br>78 / 112.81 / −0.2196<br>0.92635 → 1.14597 | Frankies Dream 5/2 · T2 → T1 |
| 2026-11-20 Wolverhampton 19:00 | Gain | Beechwood Glory (9/4)<br>64 / 82.28 / +0.8291<br>1.41203 → 0.58295 | Printing Money (15/8)<br>64 / 107.17 / −0.8291<br>0.28451 → 1.11359 | Printing Money 15/8 · T6 → T1 |

### Variant C · T2

| Race (UTC) | Effect at T2 | Original horse (SP)<br>OR / L3 Speed / signed term<br>A → C score | Replacement (SP)<br>OR / L3 Speed / signed term<br>A → C score | Race winner · SP · A → C rank |
| --- | --- | --- | --- | --- |
| 2026-11-05 Southwell 15:28 | Gain | Ey Up He's A Star (8/1)<br>64 / 109.17 / +0.0000<br>0.59214 → 0.59214 | Benacre (7/1)<br>68 / 103.63 / −0.4648<br>0.33892 → 0.80369 | Benacre 7/1 · T6 → T2 |
| 2026-11-05 Southwell 16:30 | Loss | Lady Mariko (7/2)<br>69 / 93.46 / −0.0032<br>0.83266 → 0.83586 | Forbidden Colours (11/1)<br>67 / 94.48 / +0.2755<br>0.98870 → 0.71317 | Lady Mariko 7/2 · T2 → T1 |
| 2026-11-05 Chelmsford City 17:15 | Loss | National Pride (6/4)<br>73 / 91.61 / +0.3384<br>1.06903 → 0.73058 | Roosike (4/1)<br>73 / 101.77 / −0.3384<br>0.72537 → 1.06382 | National Pride 6/4 · T2 → T4 |
| 2026-11-16 Wolverhampton 20:30 | Gain | Heart Sign (11/1)<br>59 / 87.05 / +0.5690<br>0.60671 → 0.03767 | It's A Love Thing (7/1)<br>56 / 107.53 / +0.0000<br>0.81188 → 0.81188 | It's A Love Thing 7/1 · T1 → T2 |
| 2026-11-19 Lingfield 15:08 | Gain | Orange Emperor (9/2)<br>60 / 104.50 / −0.0162<br>0.63698 → 0.65319 | Credit Forgedd It (2/1)<br>59 / 108.69 / −0.1860<br>0.42427 → 0.61023 | Credit Forgedd It 2/1 · T3 → T2 |
| 2026-11-19 Newcastle 18:10 | Loss | Frankies Dream (5/2)<br>78 / 112.81 / −0.2196<br>0.92635 → 1.14597 | Luminare (9/1)<br>76 / 100.45 / +0.0724<br>1.10710 → 1.03472 | Frankies Dream 5/2 · T2 → T1 |
| 2026-11-20 Wolverhampton 20:00 | Gain | Tomarlo (14/1)<br>55 / 95.16 / +0.3375<br>0.83853 → 0.50101 | Our Planet (15/8)<br>54 / 99.22 / −0.0747<br>0.56768 → 0.64240 | Our Planet 15/8 · T3 → T2 |

### Variant D · T1

| Race (UTC) | Effect at T1 | Original horse (SP)<br>OR / L3 Speed / signed term<br>A → D score | Replacement (SP)<br>OR / L3 Speed / signed term<br>A → D score | Race winner · SP · A → D rank |
| --- | --- | --- | --- | --- |
| 2026-11-05 Southwell 16:00 | Gain | Bombora (3/1)<br>— / — / +0.0000<br>0.95896 → 0.75318 | Fenaroli (1/3)<br>— / 96.35 / +0.0000<br>0.82488 → 0.92757 | Fenaroli 1/3 · T2 → T1 |
| 2026-11-05 Southwell 16:30 | Gain | Forbidden Colours (11/1)<br>67 / 94.48 / +0.2755<br>0.98870 → 0.81586 | Lady Mariko (7/2)<br>69 / 93.46 / −0.0032<br>0.83266 → 0.93855 | Lady Mariko 7/2 · T2 → T1 |
| 2026-11-06 Newcastle 18:30 | Loss | Wise Crack (6/1)<br>63 / 93.91 / +0.6513<br>0.70190 → 0.15326 | Educating Rita (10/3)<br>64 / 115.52 / +0.0000<br>0.42823 → 0.53092 | Wise Crack 6/1 · T1 → T5 |
| 2026-11-06 Dundalk 18:15 | Gain | Baila Conmigo (10/3)<br>68 / — / +0.0000<br>0.43148 → 0.22571 | Justenzia (11/2)<br>69 / 105.56 / +0.0000<br>0.20437 → 0.30706 | Justenzia 11/2 · T3 → T1 |
| 2026-11-07 Southwell 14:40 | Loss | Highland Ranger (6/4)<br>— / — / +0.0000<br>0.69622 → 0.49044 | Quite Simple (12/1)<br>— / 87.00 / +0.0000<br>0.64115 → 0.74384 | Highland Ranger 6/4 · T1 → T3 |
| 2026-11-16 Wolverhampton 20:30 | Loss | It's A Love Thing (7/1)<br>56 / 107.53 / +0.0000<br>0.81188 → 0.91457 | Saxophonic (11/10)<br>59 / 105.83 / −0.3692<br>0.49663 → 0.96853 | It's A Love Thing 7/1 · T1 → T2 |
| 2026-11-17 Southwell 20:00 | Gain | Miss Deeds (6/1)<br>— / — / +0.0000<br>1.09542 → 0.88964 | Hayate (1/4)<br>90 / 103.22 / +0.0000<br>0.98864 → 1.09133 | Hayate 1/4 · T2 → T1 |
| 2026-11-19 Lingfield 11:48 | Gain | Rogue Imperial (15/8)<br>82 / — / +0.0000<br>1.70710 → 1.50132 | Arthur Carrot (10/3)<br>75 / 100.69 / +0.0000<br>1.56271 → 1.66540 | Arthur Carrot 10/3 · T2 → T1 |
| 2026-11-19 Lingfield 12:53 | Gain | Grasshopper (5/1)<br>— / — / +0.0000<br>0.24078 → 0.03500 | Classic Bellini (11/8)<br>64 / 92.56 / +0.0000<br>0.23778 → 0.34047 | Classic Bellini 11/8 · T2 → T1 |
| 2026-11-19 Newcastle 18:10 | Gain | Luminare (9/1)<br>76 / 100.45 / +0.0724<br>1.10710 → 1.13741 | Frankies Dream (5/2)<br>78 / 112.81 / −0.2196<br>0.92635 → 1.24867 | Frankies Dream 5/2 · T2 → T1 |
| 2026-11-19 Newcastle 19:40 | Gain | Our Absent Friends (28/1)<br>73 / — / +0.0000<br>0.63234 → 0.42656 | Kinetic Force (11/2)<br>80 / 105.95 / +0.0000<br>0.61513 → 0.71782 | Kinetic Force 11/2 · T2 → T1 |
| 2026-11-20 Wolverhampton 19:00 | Gain | Beechwood Glory (9/4)<br>64 / 82.28 / +0.8291<br>1.41203 → 0.68564 | Printing Money (15/8)<br>64 / 107.17 / −0.8291<br>0.28451 → 1.21628 | Printing Money 15/8 · T6 → T1 |
| 2026-11-20 Dundalk 17:45 | Loss | Prince Of Peppard (11/4)<br>80 / — / +0.0000<br>1.03336 → 0.82759 | Marcescence (11/2)<br>75 / 96.30 / +0.0000<br>0.89543 → 0.99812 | Prince Of Peppard 11/4 · T1 → T2 |

### Variant D · T2

| Race (UTC) | Effect at T2 | Original horse (SP)<br>OR / L3 Speed / signed term<br>A → D score | Replacement (SP)<br>OR / L3 Speed / signed term<br>A → D score | Race winner · SP · A → D rank |
| --- | --- | --- | --- | --- |
| 2026-11-05 Southwell 15:28 | Gain | Ey Up He's A Star (8/1)<br>64 / 109.17 / +0.0000<br>0.59214 → 0.69483 | Benacre (7/1)<br>68 / 103.63 / −0.4648<br>0.33892 → 0.90638 | Benacre 7/1 · T6 → T2 |
| 2026-11-05 Southwell 16:00 | Loss | Fenaroli (1/3)<br>— / 96.35 / +0.0000<br>0.82488 → 0.92757 | Bombora (3/1)<br>— / — / +0.0000<br>0.95896 → 0.75318 | Fenaroli 1/3 · T2 → T1 |
| 2026-11-05 Southwell 16:30 | Loss | Lady Mariko (7/2)<br>69 / 93.46 / −0.0032<br>0.83266 → 0.93855 | Forbidden Colours (11/1)<br>67 / 94.48 / +0.2755<br>0.98870 → 0.81586 | Lady Mariko 7/2 · T2 → T1 |
| 2026-11-05 Southwell 17:30 | Loss | Celestial Fire (7/4)<br>— / — / +0.0000<br>0.40812 → 0.20234 | Classic Bellini (6/1)<br>64 / 92.56 / +0.0000<br>0.12842 → 0.23111 | Celestial Fire 7/4 · T2 → T3 |
| 2026-11-05 Chelmsford City 17:15 | Loss | National Pride (6/4)<br>73 / 91.61 / +0.3384<br>1.06903 → 0.83327 | Roosike (4/1)<br>73 / 101.77 / −0.3384<br>0.72537 → 1.16651 | National Pride 6/4 · T2 → T3 |
| 2026-11-06 Dundalk 20:15 | Gain | Sayonara (25/1)<br>56 / — / +0.0000<br>0.72124 → 0.51547 | Polanco (7/2)<br>52 / 113.77 / +0.0000<br>0.44586 → 0.54855 | Polanco 7/2 · T3 → T2 |
| 2026-11-13 Dundalk 20:00 | Loss | Xirivella (9/1)<br>78 / — / +0.0000<br>0.88653 → 0.68075 | Unterberg (17/2)<br>83 / 110.13 / +0.0000<br>0.70603 → 0.80872 | Xirivella 9/1 · T2 → T3 |
| 2026-11-16 Wolverhampton 18:30 | Gain | Rhythm N Hooves (4/1)<br>89 / 99.93 / +0.3222<br>0.64744 → 0.42789 | Law Of Average (11/1)<br>89 / 109.60 / −0.3222<br>0.09325 → 0.51819 | Law Of Average 11/1 · T7 → T2 |
| 2026-11-16 Wolverhampton 20:30 | Gain | Heart Sign (11/1)<br>59 / 87.05 / +0.5690<br>0.60671 → 0.14036 | It's A Love Thing (7/1)<br>56 / 107.53 / +0.0000<br>0.81188 → 0.91457 | It's A Love Thing 7/1 · T1 → T2 |
| 2026-11-17 Southwell 20:00 | Loss | Hayate (1/4)<br>90 / 103.22 / +0.0000<br>0.98864 → 1.09133 | Miss Deeds (6/1)<br>— / — / +0.0000<br>1.09542 → 0.88964 | Hayate 1/4 · T2 → T1 |
| 2026-11-18 Dundalk 15:00 | Gain | She's On The Ball (7/1)<br>50 / — / +0.0000<br>0.49925 → 0.29348 | Jazzit (3/1)<br>58 / 106.72 / −0.0500<br>0.18662 → 0.33928 | Jazzit 3/1 · T3 → T2 |
| 2026-11-18 Dundalk 17:40 | Gain | Legato (33/1)<br>49 / — / +0.0000<br>-0.00278 → -0.20856 | Tempted Angel (14/1)<br>50 / 62.94 / +0.0000<br>-0.17777 → -0.07508 | Tempted Angel 14/1 · T4 → T2 |
| 2026-11-19 Lingfield 11:48 | Loss | Arthur Carrot (10/3)<br>75 / 100.69 / +0.0000<br>1.56271 → 1.66540 | Show Me Glory (5/1)<br>80 / 104.92 / +0.0000<br>1.49641 → 1.59910 | Arthur Carrot 10/3 · T2 → T1 |
| 2026-11-19 Lingfield 12:53 | Loss | Classic Bellini (11/8)<br>64 / 92.56 / +0.0000<br>0.23778 → 0.34047 | Grasshopper (5/1)<br>— / — / +0.0000<br>0.24078 → 0.03500 | Classic Bellini 11/8 · T2 → T1 |
| 2026-11-19 Lingfield 15:08 | Gain | Orange Emperor (9/2)<br>60 / 104.50 / −0.0162<br>0.63698 → 0.75588 | Credit Forgedd It (2/1)<br>59 / 108.69 / −0.1860<br>0.42427 → 0.71293 | Credit Forgedd It 2/1 · T3 → T2 |
| 2026-11-19 Newcastle 18:10 | Loss | Frankies Dream (5/2)<br>78 / 112.81 / −0.2196<br>0.92635 → 1.24867 | Luminare (9/1)<br>76 / 100.45 / +0.0724<br>1.10710 → 1.13741 | Frankies Dream 5/2 · T2 → T1 |
| 2026-11-19 Newcastle 19:40 | Loss | Kinetic Force (11/2)<br>80 / 105.95 / +0.0000<br>0.61513 → 0.71782 | Come On Over (10/1)<br>76 / 110.22 / −0.2390<br>0.32638 → 0.66807 | Kinetic Force 11/2 · T2 → T1 |
| 2026-11-20 Wolverhampton 17:00 | Loss | Oliaku (2/1)<br>— / — / +0.0000<br>0.24039 → 0.03461 | Butterfly Beach (9/2)<br>69 / 96.86 / +0.0000<br>0.00964 → 0.11233 | Oliaku 2/1 · T2 → T3 |
| 2026-11-20 Wolverhampton 20:00 | Gain | Tomarlo (14/1)<br>55 / 95.16 / +0.3375<br>0.83853 → 0.60370 | Our Planet (15/8)<br>54 / 99.22 / −0.0747<br>0.56768 → 0.74509 | Our Planet 15/8 · T3 → T2 |
| 2026-11-20 Dundalk 17:45 | Gain | Marcescence (11/2)<br>75 / 96.30 / +0.0000<br>0.89543 → 0.99812 | Prince Of Peppard (11/4)<br>80 / — / +0.0000<br>1.03336 → 0.82759 | Prince Of Peppard 11/4 · T1 → T2 |

### Winner identity changes in the three excluded November books

| Race (UTC) | Variant / rank | Effect | Original (SP)<br>OR / Speed / term<br>Score | Replacement (SP)<br>OR / Speed / term<br>Score | Winner · SP · rank move |
| --- | --- | --- | --- | --- | --- |
| 2026-11-06 Dundalk 17:15 | B / T2 | Loss | Grande Cuvee (1/3)<br>71 / — / +0.0000<br>0.28393 → 0.07815 | Otsana (NR)<br>69 / 105.86 / +0.0000<br>0.25951 → 0.36220 | Grande Cuvee 1/3 · T2 → T3 |
| 2026-11-06 Dundalk 17:15 | D / T2 | Loss | Grande Cuvee (1/3)<br>71 / — / +0.0000<br>0.28393 → 0.07815 | Otsana (NR)<br>69 / 105.86 / +0.0000<br>0.25951 → 0.36220 | Grande Cuvee 1/3 · T2 → T3 |
| 2026-11-16 Wolverhampton 16:30 | D / T2 | Gain | Go Go Girl (4/1)<br>73 / — / +0.0000<br>0.78283 → 0.57706 | Lord Ragnar (5/2)<br>75 / 106.20 / −0.1477<br>0.51281 → 0.76315 | Lord Ragnar 5/2 · T5 → T2 |

## 6. What the same-OR term means

A **10-point Speed lead** over the peer mean reduces the score by about **0.33309**. A **10-point deficit** adds the same amount. For two exact-OR peers, the two gaps are equal and opposite. A 10-point difference between them therefore gives the slower runner a **0.66618** relative advantage from this term alone. The base and the other two adjustments still contribute to the final ordering.

For a group of `n > 1` measured runners at the same OR, own minus the leave-one-out mean equals `n / (n − 1) × (own Speed − group mean)`. The term is a negative multiple of that deviation. This confirms that it pushes scores against within-OR Speed differences. It does not revise the Speed estimate, pool it with prior runs, or estimate observation reliability. Calling it statistical **regression to the mean** overstates the implementation. It can offset an existing positive Speed contribution and can also overturn it. The coefficient does not get more conservative in a group with just two usable runners.

**Double-counting is a plausible interpretation, with no documented verification.** The AW V2 base already scores latest, Best L3 and average Speed as well as derived Performance and Today's Rating. A jointly fitted negative conditional coefficient could counter correlated base information. The original fit contains no decomposition designed to test that story, and the same signed feature fitted with a positive coefficient in Turf. The code verifies a weaker-relative-Speed reward and a stronger-relative-Speed penalty **when there is measured evidence on both sides**. The term itself gives no direct reward for missing Speed. It uses the same slope whether an observed figure represents one usable run or several. The separate missing-Speed coefficient handles absence of rank and can matter in the same race. [Development code](../scripts/develop-tissue-generation.ts) · [Cross-family fitted slopes](tissue-development-audit-2026-11-12.md#november-additions-turf-v3--v4-aw-v2--v3-jump--hurdle-v2)

Across the November matched selections, C moved **16 of 36** original T1/T2s directly rewarded for being slower than their equal-OR peers out of the top two. No original pick directly penalised for being faster left the top two under C. Eight original neutral-gap picks left when a rival's rank changed. Slower-relative T2s averaged decimal **16.62** and their two winners produced SP A/E **1.51**. That small selected subset is evidence that a weaker measured figure can coexist with a useful selection. It does not identify what the signed term adds independently of the base. The signed-group table uses all matched original T1/T2 picks.

| Signed gap status | T1 n | Wins | Mean SP (dec.) | Market A/E | C leaves top two |
| --- | --- | --- | --- | --- | --- |
| Faster vs same OR | 9 | 1 | 5.04 | 0.55 | 0 |
| Slower vs same OR | 23 | 3 | 10.98 | 0.94 | 7 |
| Measured with zero gap | 44 | 10 | 4.88 | 0.99 | 0 |
| Missing Best L3 | 44 | 7 | 7.75 | 0.66 | 0 |

| Signed gap status | T2 n | Wins | Mean SP (dec.) | Market A/E | C leaves top two |
| --- | --- | --- | --- | --- | --- |
| Faster vs same OR | 8 | 3 | 8.20 | 2.26 | 0 |
| Slower vs same OR | 13 | 2 | 16.62 | 1.51 | 9 |
| Measured with zero gap | 51 | 13 | 7.77 | 1.40 | 6 |
| Missing Best L3 | 48 | 9 | 11.41 | 1.34 | 2 |

## 7. Case for separate prospective research

**Same-OR removal has the stronger case for an isolated fresh shadow.** Removal retained all four original November outsider winners in the top two and improved full-field probability scores. The subsequent read-only sign comparison found that removal had the lowest log loss and Brier on the matched November, October, audited 2025 and early-2026 samples. T1 and final-SP returns varied across periods. The current AW 75% context shadow changes both rank-2/3 and same-OR weights together while preserving the missing-rank term. It cannot isolate same-OR. [Reversal and historical checks](aw-v3-reversed-speed-adjustment.md) · [Existing context-weight shadow](context-weight-shadow.md)

**Missing-rank removal also warrants a separate challenger if the question is evidence reliability.** It moved 19 November T1 ranks from missing to measured in the matched races and added four T1 winners. The November paired T1 interval from the earlier study spans a loss as well as a gain. In the 144 earlier matched October repeats, B added one T1 winner and lost two T2 winners, with worse log loss and Brier. Together with the loss of Xirivella and gain of Tempted Angel, this argues for measuring what happens to missing-rank T2 and outsider coverage as well as any improvement at T1. [Earlier four-way comparison and paired intervals](aw-v3-isolated-adjustment-diagnostic.md)

Use fixed original and single-term-omission definitions on new pre-off fields, with log loss and Brier predeclared alongside rank-specific winner capture and the full SP returns. Report availability, history depth and fixed price-band breakdowns as descriptive evaluation. Keep the original ranks and model as the comparator. A winner from an ablation, an outsider loss, or a retrospective ROI difference does not settle which coefficient should be used live.

### Verification and coverage limits

The replay used the checksum-validated production scorer and reproduced **all 1,410 November frozen runner probabilities and ranks**, as well as the published A–D T1/T2 identities. The terminal export covered **1,339 starters**. Final fractional SP, frozen position, winner status and v3 monetary settlement were verified against the previous diagnostic. Only the matched 120 races feed the headline counterfactual statistics. The four targeted AW, generation and settlement test files passed 39 tests. Earlier periods are cited as prior historical evidence. No underlying prior-race features were filled from the target outcome. The inventory below contains each original missing-rank selection at T1 or T2, with later variant ranks supplied as diagnostics. “Prior runs” means the frozen eligible count. “Recent flags” shows flags across the last three usable comments, with a count suffix where repeated.

## November missing-Speed selection inventory

<details>
<summary>Original T1 missing-Speed selections · 44 frozen rows</summary>

| Race (UTC) | Horse | Final SP / result | Eligible prior runs | OR / latest AW Speed / latest Performance | Same-material starts / Performance delta | Comments / recent flags | Prior trainer % / runs · jockey % / runs | A / B / C / D rank |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-11-05 Southwell 14:53 | Prince Of Calypso | 4/1 / 3 | 8 | 83 / 90.6 / 52.6 | 2 / 0.0 | 3 / led, heldUpRear | 16.5 / 1124 · 13.6 / 877 | 1 / 3 / 1 / 3 |
| 2026-11-05 Southwell 16:00 | Bombora | 3/1 / 5 | 2 | — / — / — | 0 / — | 2 / heldUpRear, stayedOn, neverDangerous | 17.8 / 2279 · 14.6 / 1762 | 1 / 2 / 1 / 2 |
| 2026-11-05 Chelmsford City 16:45 | Tough Decision | 1/1 / 3 | 1 | — / — / — | 0 / — | 1 / prominent, led, strongFinish | 14.6 / 692 · 12.4 / 1824 | 1 / 1 / 1 / 1 |
| 2026-11-05 Chelmsford City 17:15 | Kigali | 9/1 / 4 | 6 | 68 / 72.4 / 37.4 | 1 / 0.0 | 3 / prominent, led×2, racedWide, weakened | 12.8 / 943 · 17.6 / 2212 | 1 / 1 / 1 / 1 |
| 2026-11-05 Southwell 17:30 | Hoya Bella | 10/3 / 3 | 2 | 69 / — / — | 0 / — | 2 / slowlyAway, prominent, heldUpRear, switched, stayedOn, strongFinish, equipment×2 | 18.3 / 2765 · 12.2 / 2277 | 1 / 1 / 1 / 1 |
| 2026-11-06 Newcastle 15:28 | Endless Quest | 1/10 / W | 1 | — / — / — | 0 / — | 1 / slowlyAway, heldUpRear | 22.1 / 1711 · 13.4 / 1655 | 1 / 1 / 1 / 1 |
| 2026-11-06 Newcastle 16:30 | Beauty For Love | 9/4 / 3 | 6 | 72 / — / — | 0 / — | 3 / led×2, weakened | 11.8 / 2911 · 12.1 / 1301 | 1 / 2 / 1 / 2 |
| 2026-11-06 Newcastle 17:00 | Royal Message | 7/2 / W | 3 | 71 / — / — | 0 / — | 3 / prominent, heldUpRear, switched, weakened×2 | 15.0 / 1629 · 13.9 / 2024 | 1 / 1 / 1 / 1 |
| 2026-11-06 Newcastle 17:30 | Go Victor | 11/1 / 2 | 17 | 66 / 85.6 / 46.6 | 1 / 0.0 | 3 / led×2, heldUpRear, switched, racedWide, strongFinish, eased | 11.8 / 102 · 9.2 / 1293 | 1 / 1 / 1 / 1 |
| 2026-11-06 Dundalk 18:15 | Baila Conmigo | 10/3 / 6 | 22 | 68 / 103.7 / 72.7 | 8 / 0.0 | 3 / led×2 | 7.1 / 721 · 4.8 / 166 | 1 / 2 / 1 / 2 |
| 2026-11-06 Dundalk 18:45 | White Sand Beach | 50/1 / 13 | 11 | 85 / — / — | 0 / — | 3 / led×2 | 22.5 / 1876 · 15.7 / 1142 | 1 / 1 / 1 / 1 |
| 2026-11-06 Newcastle 19:00 | Battenburg Belle | 16/1 / 12 | 17 | 57 / 84.6 / 38.6 | 3 / 0.0 | 3 / led×2 | 9.8 / 1456 · 12.5 / 2950 | 1 / 1 / 1 / 2 |
| 2026-11-06 Dundalk 19:15 | Drive On There | 6/4 / 5 | 1 | — / — / — | 0 / — | 1 / heldUpRear | 24.1 / 402 · 15.5 / 1547 | 1 / 1 / 1 / 1 |
| 2026-11-06 Dundalk 20:15 | Wegotogether | 11/2 / 6 | 13 | 60 / 94.1 / 57.1 | 1 / 0.0 | 3 / heldUpRear | 11.0 / 2561 · 9.5 / 1336 | 1 / 1 / 1 / 1 |
| 2026-11-07 Southwell 14:40 | Highland Ranger | 6/4 / W | 0 | — / — / — | 0 / — | 0 / — | 22.1 / 1713 · 13.4 / 1658 | 1 / 3 / 1 / 3 |
| 2026-11-11 Dundalk 16:02 | Resurgence | 1/1 / 2 | 5 | 80 / — / — | 0 / — | 3 / prominent×2, led, hampered | 9.7 / 1706 · 15.9 / 2151 | 1 / 1 / 1 / 1 |
| 2026-11-11 Dundalk 16:32 | Farmerspolish | 14/1 / 2 | 0 | — / — / — | 0 / — | 0 / — | 15.1 / 2066 · 15.6 / 1552 | 1 / 1 / 1 / 1 |
| 2026-11-13 Dundalk 19:30 | Sangreal | 1/2 / 3 | 5 | 81 / — / — | 0 / — | 3 / — | 14.9 / 3050 · 8.4 / 1297 | 1 / 1 / 1 / 1 |
| 2026-11-13 Dundalk 20:30 | Love Orchid | 5/2 / 2 | 12 | 66 / 105.1 / 63.1 | 0 / — | 3 / heldUpRear, stayedOn | 9.2 / 1038 · 15.9 / 2156 | 1 / 1 / 1 / 1 |
| 2026-11-16 Wolverhampton 17:00 | Desert Romance | 11/8 / W | 2 | 80 / — / — | 0 / — | 2 / switched, equipment | 30.8 / 992 · 11.1 / 171 | 1 / 1 / 1 / 1 |
| 2026-11-16 Wolverhampton 17:30 | Leading Role | 2/9 / W | 1 | — / — / — | 0 / — | 1 / led | 30.8 / 992 · 11.1 / 171 | 1 / 1 / 1 / 1 |
| 2026-11-16 Wolverhampton 18:00 | Al Lahbab | 8/13 / 4 | 1 | — / — / — | 0 / — | 1 / — | 30.8 / 992 · 8.5 / 568 | 1 / 1 / 1 / 1 |
| 2026-11-17 Southwell 17:00 | Bladey Lady | 7/2 / 5 | 9 | 76 / 95.1 / 55.1 | 1 / 0.0 | 3 / led×3, racedFreely | 9.4 / 4152 · 7.2 / 832 | 1 / 3 / 1 / 3 |
| 2026-11-17 Southwell 20:00 | Miss Deeds | 6/1 / 2 | 1 | — / — / — | 0 / — | 1 / led, stayedOn | 20.5 / 2310 · 6.6 / 409 | 1 / 2 / 1 / 2 |
| 2026-11-18 Dundalk 15:30 | Maxims Of Equity | 18/1 / 6 | 3 | 55 / — / — | 0 / — | 3 / slowlyAway, heldUpRear | 11.9 / 570 · 5.8 / 702 | 1 / 2 / 1 / 2 |
| 2026-11-18 Kempton 16:25 | Brave Country | 1/1 / 4 | 2 | 75 / — / — | 0 / — | 2 / heldUpRear×2, racedFreely, switched | 15.0 / 1637 · 7.3 / 493 | 1 / 2 / 1 / 2 |
| 2026-11-18 Dundalk 17:07 | Rhapsodic | 4/9 / W | 1 | — / — / — | 0 / — | 1 / heldUpRear | 11.5 / 720 · 15.9 / 2162 | 1 / 1 / 1 / 1 |
| 2026-11-18 Kempton 17:30 | Lady Blanche | 5/1 / 3 | 3 | 80 / — / — | 0 / — | 3 / led | 17.7 / 2287 · 3.8 / 720 | 1 / 2 / 1 / 2 |
| 2026-11-18 Kempton 18:30 | Sterling Cooper | 11/8 / 5 | 2 | — / — / — | 0 / — | 2 / led, weakened | 17.3 / 3353 · 6.6 / 594 | 1 / 1 / 1 / 1 |
| 2026-11-19 Lingfield 11:48 | Rogue Imperial | 15/8 / 4 | 6 | 82 / — / — | 0 / — | 3 / led×3, racedFreely | 12.0 / 1713 · 16.3 / 3338 | 1 / 3 / 1 / 3 |
| 2026-11-19 Lingfield 12:18 | Valley Rising | 6/5 / 5 | 0 | — / — / — | 0 / — | 0 / — | 18.9 / 475 · 17.7 / 1428 | 1 / 1 / 1 / 1 |
| 2026-11-19 Lingfield 12:53 | Grasshopper | 5/1 / 5 | 0 | — / — / — | 0 / — | 0 / — | 16.2 / 1111 · 12.0 / 2105 | 1 / 2 / 1 / 2 |
| 2026-11-19 Lingfield 14:38 | American Gal | 11/1 / 4 | 11 | 100 / 106.5 / 66.5 | 1 / 0.0 | 3 / heldUpRear, strongFinish | 18.2 / 2024 · 16.3 / 3338 | 1 / 4 / 2 / 3 |
| 2026-11-19 Newcastle 17:10 | Tabkir | 7/2 / 3 | 0 | — / — / — | 0 / — | 0 / — | 22.1 / 1725 · 13.4 / 1662 | 1 / 2 / 1 / 2 |
| 2026-11-19 Newcastle 17:40 | Hot Moonstone | 40/1 / 2 | 1 | — / — / — | 0 / — | 1 / slowlyAway, heldUpRear, racedFreely, shortRoom | 16.2 / 1183 · 12.5 / 2961 | 1 / 1 / 1 / 1 |
| 2026-11-19 Newcastle 18:40 | Yes I'm Mali | 9/1 / 13 | 33 | 85 / 110.2 / 78.2 | 0 / — | 3 / prominent, led | 11.7 / 2753 · 14.3 / 265 | 1 / 2 / 1 / 2 |
| 2026-11-19 Newcastle 19:10 | Real Jack | 9/2 / 8 | 11 | 59 / 94.7 / 60.7 | 3 / 0.0 | 3 / led | 9.3 / 1683 · 9.4 / 1337 | 1 / 1 / 1 / 1 |
| 2026-11-19 Newcastle 19:40 | Our Absent Friends | 28/1 / 11 | 56 | 73 / 106.8 / 63.8 | 7 / 0.0 | 3 / prominent, led | 13.8 / 501 · 10.1 / 1640 | 1 / 6 / 1 / 8 |
| 2026-11-20 Wolverhampton 17:30 | Lady Phillips | 11/4 / 6 | 2 | 79 / — / — | 0 / — | 2 / heldUpRear×2 | 18.2 / 2028 · 9.5 / 989 | 1 / 2 / 1 / 2 |
| 2026-11-20 Dundalk 17:45 | Prince Of Peppard | 11/4 / W | 7 | 80 / — / — | 0 / — | 3 / — | 11.2 / 1377 · 10.4 / 1743 | 1 / 2 / 1 / 2 |
| 2026-11-20 Wolverhampton 18:00 | Zhuri | 8/11 / 2 | 2 | 75 / — / — | 0 / — | 2 / slowlyAway, heldUpRear, switched | 22.1 / 1731 · 13.4 / 1665 | 1 / 1 / 1 / 1 |
| 2026-11-20 Wolverhampton 18:30 | Great Blasket | 3/1 / 2 | 39 | 75 / 107.4 / 79.4 | 1 / 1.9 | 3 / prominent, led | 18.2 / 2799 · 16.4 / 1993 | 1 / 1 / 1 / 1 |
| 2026-11-20 Dundalk 19:15 | Carafinn | 13/2 / 5 | 2 | — / — / — | 0 / — | 2 / — | 15.2 / 2093 · 15.6 / 1151 | 1 / 2 / 1 / 2 |
| 2026-11-20 Dundalk 20:15 | Grey Fable | 13/2 / 6 | 25 | 58 / 97.8 / 67.8 | 3 / 0.0 | 3 / led×2, weakened | 9.8 / 183 · 10.4 / 1743 | 1 / 1 / 1 / 1 |

</details>

<details>
<summary>Original T2 missing-Speed selections · 50 frozen rows</summary>

| Race (UTC) | Horse | Final SP / result | Eligible prior runs | OR / latest AW Speed / latest Performance | Same-material starts / Performance delta | Comments / recent flags | Prior trainer % / runs · jockey % / runs | A / B / C / D rank |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-11-05 Chelmsford City 14:30 | Wellwhatshappenin | 7/2 / 2 | 16 | 54 / 99.1 / 63.1 | 4 / 0.0 | 3 / prominent, led | 8.6 / 105 · 16.3 / 3328 | 2 / 4 / 2 / 3 |
| 2026-11-05 Chelmsford City 16:45 | Galimix | 11/4 / 5 | 2 | 76 / — / — | 0 / — | 2 / prominent, heldUpRear | 11.2 / 1475 · 8.8 / 1680 | 2 / 2 / 2 / 2 |
| 2026-11-05 Southwell 17:30 | Celestial Fire | 7/4 / W | 1 | — / — / — | 0 / — | 1 / led, equipment | 12.0 / 1710 · 12.6 / 2446 | 2 / 3 / 2 / 3 |
| 2026-11-05 Southwell 18:00 | Jellystone Park | 9/1 / 3 | 5 | 75 / 95.7 / 56.7 | 0 / — | 3 / led×2, heldUpRear | 14.7 / 968 · 10.4 / 606 | 2 / 3 / 2 / 3 |
| 2026-11-06 Newcastle 14:53 | Twisting Physics | 13/2 / 4 | 9 | 90 / 95.3 / 60.3 | 0 / — | 3 / prominent×2, led, stayedOn | 10.6 / 226 · 13.9 / 2024 | 2 / 3 / 2 / 4 |
| 2026-11-06 Newcastle 17:00 | Capricious Star | 9/4 / 3 | 1 | — / — / — | 0 / — | 1 / prominent | 17.8 / 2280 · 12.4 / 842 | 2 / 2 / 2 / 2 |
| 2026-11-06 Dundalk 17:15 | Grande Cuvee | 1/3 / W | 6 | 71 / 99.8 / 60.8 | 1 / 0.0 | 3 / heldUpRear | 11.4 / 361 · 5.9 / 1158 | 2 / 3 / 2 / 3 |
| 2026-11-06 Newcastle 17:30 | North West Gal | 22/1 / 14 | 8 | 67 / 98.2 / 58.2 | 2 / 0.0 | 3 / heldUpRear, racedFreely, hampered | 10.6 / 1120 · 12.5 / 2950 | 2 / 3 / 2 / 3 |
| 2026-11-06 Dundalk 17:45 | Bougie Gals | 16/1 / 2 | 2 | — / — / — | 0 / — | 2 / prominent | 11.9 / 564 · 15.9 / 2146 | 2 / 2 / 2 / 2 |
| 2026-11-06 Dundalk 18:15 | Pralognan | 11/1 / 7 | 19 | 71 / 107.7 / 100.7 | 1 / 0.0 | 3 / heldUpRear×2 | 7.0 / 458 · 10.7 / 495 | 2 / 3 / 2 / 3 |
| 2026-11-06 Dundalk 18:45 | Prevalence | 10/1 / 7 | 7 | 95 / 104.8 / 64.8 | 1 / 0.0 | 3 / led×2, heldUpRear, stayedOn | 17.2 / 931 · 15.9 / 2146 | 2 / 3 / 2 / 3 |
| 2026-11-06 Dundalk 19:15 | Naval Gazer | 5/1 / 2 | 1 | — / — / — | 0 / — | 1 / — | 17.2 / 931 · 15.9 / 2146 | 2 / 2 / 2 / 2 |
| 2026-11-06 Dundalk 20:15 | Sayonara | 25/1 / 14 | 12 | 56 / 88.0 / 47.0 | 4 / 0.0 | 3 / prominent, led×2 | 10.9 / 1487 · 5.9 / 1158 | 2 / 3 / 2 / 3 |
| 2026-11-07 Southwell 14:40 | Seddeeg | 11/1 / 6 | 0 | — / — / — | 0 / — | 0 / — | 16.4 / 1129 · 16.9 / 3693 | 2 / 4 / 2 / 4 |
| 2026-11-07 Southwell 16:25 | Up The Anti | 18/1 / 2 | 26 | 57 / 99.5 / 48.5 | 1 / — | 3 / heldUpRear×3, eased | 11.9 / 3131 · 7.9 / 1259 | 2 / 3 / 2 / 3 |
| 2026-11-07 Southwell 17:00 | Go On My Son | 4/6 / W | 2 | — / — / — | 0 / — | 2 / led, weakened | 14.7 / 1138 · 16.9 / 3693 | 2 / 2 / 2 / 2 |
| 2026-11-11 Dundalk 15:00 | Professor Finnegan | 9/2 / W | 3 | 64 / — / — | 0 / — | 3 / slowlyAway, heldUpRear | 11.2 / 1367 · 10.3 / 1726 | 2 / 2 / 2 / 2 |
| 2026-11-11 Dundalk 16:32 | Marcescence | 4/1 / 4 | 2 | — / — / — | 0 / — | 2 / led, stayedOn | 11.0 / 2572 · 9.0 / 699 | 2 / 2 / 2 / 2 |
| 2026-11-13 Dundalk 19:30 | Winter Adventure | 16/1 / 7 | 1 | — / — / — | 0 / — | 1 / heldUpRear | 9.2 / 1038 · 15.9 / 2156 | 2 / 2 / 2 / 2 |
| 2026-11-13 Dundalk 20:00 | Xirivella | 9/1 / W | 6 | 78 / — / — | 0 / — | 3 / led, bumped, switched, weakened | 9.2 / 1038 · 15.9 / 2156 | 2 / 4 / 2 / 3 |
| 2026-11-13 Dundalk 20:30 | Phlox | 8/1 / 4 | 3 | 69 / — / — | 0 / — | 3 / — | 11.2 / 1370 · 10.4 / 1729 | 2 / 2 / 2 / 2 |
| 2026-11-16 Wolverhampton 16:30 | Go Go Girl | 4/1 / 5 | 2 | 73 / — / — | 0 / — | 2 / — | 14.7 / 1142 · 8.8 / 547 | 2 / 4 / 1 / 4 |
| 2026-11-16 Wolverhampton 17:30 | Afif | 11/2 / 4 | 2 | — / — / — | 0 / — | 2 / slowlyAway, heldUpRear×2 | 22.2 / 1715 · 10.1 / 336 | 2 / 3 / 2 / 3 |
| 2026-11-16 Wolverhampton 18:00 | Adventus Saxonum | 9/1 / 8 | 0 | — / — / — | 0 / — | 0 / — | 22.2 / 1715 · 10.1 / 336 | 2 / 2 / 2 / 2 |
| 2026-11-16 Wolverhampton 19:00 | Mumayaz | 25/1 / 8 | 59 | 69 / 91.4 / 54.4 | 7 / 0.9 | 3 / led, heldUpRear×3, stayedOn, eased | 11.9 / 3143 · 8.5 / 365 | 2 / 3 / 2 / 4 |
| 2026-11-16 Wolverhampton 20:00 | Oman | 16/1 / 10 | 30 | 71 / 90.0 / 61.0 | 4 / 1.9 | 3 / led×2 | 11.9 / 3143 · 16.4 / 146 | 2 / 3 / 3 / 4 |
| 2026-11-17 Southwell 19:00 | Bay Breeze | 16/1 / 11 | 34 | 68 / — / — | 0 / — | 3 / slowlyAway, prominent, led×2, strongFinish, weakened | 9.4 / 4152 · 7.2 / 832 | 2 / 3 / 2 / 3 |
| 2026-11-18 Dundalk 14:00 | Miss Cashman Hooke | 11/4 / 2 | 2 | — / — / — | 0 / — | 2 / slowlyAway×2, heldUpRear, switched | 9.6 / 356 · 15.5 / 1558 | 2 / 2 / 2 / 2 |
| 2026-11-18 Dundalk 15:00 | She's On The Ball | 7/1 / 11 | 9 | 50 / 85.8 / 46.8 | 1 / 0.0 | 3 / led, heldUpRear, strongFinish | 10.8 / 102 · 15.7 / 1148 | 2 / 2 / 2 / 3 |
| 2026-11-18 Dundalk 16:00 | Stooked | 7/4 / 2 | 3 | 73 / — / — | 0 / — | 3 / led, racedFreely, weakened | 17.1 / 936 · 15.9 / 2162 | 2 / 3 / 2 / 3 |
| 2026-11-18 Dundalk 16:30 | Tourin | 25/1 / 12 | 3 | 63 / — / — | 0 / — | 3 / heldUpRear, stayedOn | 11.6 / 363 · 6.0 / 1161 | 2 / 4 / 3 / 4 |
| 2026-11-18 Kempton 17:00 | King's Flight | 3/1 / 5 | 0 | — / — / — | 0 / — | 0 / — | 13.9 / 1436 · 9.7 / 247 | 2 / 2 / 2 / 2 |
| 2026-11-18 Dundalk 17:07 | Serendipia | 4/1 / 4 | 8 | 72 / — / — | 0 / — | 3 / heldUpRear, weakened | 8.8 / 770 · 15.5 / 1558 | 2 / 2 / 2 / 2 |
| 2026-11-18 Dundalk 17:40 | Legato | 33/1 / 9 | 3 | 49 / — / — | 0 / — | 3 / heldUpRear | 7.4 / 658 · 8.6 / 1022 | 2 / 6 / 2 / 6 |
| 2026-11-18 Kempton 18:00 | Divine Rhythm | 6/4 / W | 2 | 73 / — / — | 0 / — | 2 / heldUpRear, stayedOn | 20.5 / 2311 · 7.6 / 536 | 2 / 2 / 2 / 2 |
| 2026-11-18 Kempton 19:00 | Princling | 15/8 / W | 7 | 90 / 101.1 / 63.1 | 0 / — | 3 / heldUpRear, racedFreely×2, bumped, stayedOn, strongFinish | 20.5 / 2311 · 6.7 / 416 | 2 / 2 / 2 / 2 |
| 2026-11-18 Kempton 20:30 | We Ride At Dawn | 14/1 / 7 | 8 | 70 / 97.2 / 61.2 | 1 / 0.0 | 3 / prominent, led×2, racedFreely, stayedOn, weakened | 20.0 / 20 · 9.6 / 983 | 2 / 2 / 2 / 2 |
| 2026-11-19 Lingfield 11:18 | Silk Braid | 2/1 / 2 | 2 | 92 / — / — | 0 / — | 2 / heldUpRear, racedFreely, hampered | 10.5 / 722 · 11.5 / 1136 | 2 / 2 / 2 / 2 |
| 2026-11-19 Lingfield 12:18 | Anaream | 12/1 / 8 | 0 | — / — / — | 0 / — | 0 / — | 11.7 / 809 · 17.0 / 3703 | 2 / 2 / 2 / 2 |
| 2026-11-19 Lingfield 15:40 | Solar Invincible | 5/1 / 2 | 16 | 67 / 103.9 / 63.9 | 4 / 0.0 | 3 / prominent, racedFreely, weakened | 9.4 / 693 · 17.0 / 3703 | 2 / 2 / 2 / 2 |
| 2026-11-19 Newcastle 16:10 | El Ra'ady | 6/5 / 6 | 0 | — / — / — | 0 / — | 0 / — | 20.5 / 2314 · 11.8 / 1522 | 2 / 2 / 2 / 2 |
| 2026-11-19 Newcastle 16:40 | Kumharas | 14/1 / 12 | 3 | 58 / — / — | 0 / — | 3 / led, heldUpRear, weakened, equipment | 9.1 / 3096 · 8.9 / 727 | 2 / 6 / 2 / 6 |
| 2026-11-19 Newcastle 17:10 | Bronze Cascade | 12/1 / 2 | 0 | — / — / — | 0 / — | 0 / — | 17.7 / 2288 · 14.5 / 1770 | 2 / 4 / 2 / 4 |
| 2026-11-19 Newcastle 17:40 | Shimmering Shadow | 11/10 / W | 1 | — / — / — | 0 / — | 1 / prominent | 17.4 / 1198 · 11.8 / 1522 | 2 / 2 / 2 / 2 |
| 2026-11-20 Wolverhampton 17:00 | Oliaku | 2/1 / W | 2 | — / — / — | 0 / — | 2 / prominent, heldUpRear, weakened | 13.4 / 1134 · 17.0 / 3711 | 2 / 4 / 2 / 3 |
| 2026-11-20 Dundalk 18:15 | Celtic Motif | 13/2 / W | 6 | 88 / — / — | 0 / — | 3 / slowlyAway, led, heldUpRear | 14.8 / 3066 · 9.6 / 1267 | 2 / 2 / 2 / 2 |
| 2026-11-20 Wolverhampton 19:00 | Alfey Moon | 8/1 / 8 | 4 | 63 / — / — | 0 / — | 3 / racedFreely, stayedOn, equipment | 10.0 / 1251 · 12.7 / 2459 | 2 / 4 / 2 / 6 |
| 2026-11-20 Dundalk 19:15 | Kathy M | 13/2 / 2 | 1 | — / — / — | 0 / — | 1 / racedFreely | 14.8 / 3066 · 9.6 / 1267 | 2 / 3 / 2 / 3 |
| 2026-11-20 Wolverhampton 19:30 | Dandy Style | 66/1 / 4 | 5 | 101 / — / — | 0 / — | 3 / led, heldUpRear×2, switched, stayedOn×2, weakened | 10.7 / 2257 · 14.5 / 1774 | 2 / 2 / 2 / 2 |
| 2026-11-20 Dundalk 20:15 | Preparations | 12/1 / 4 | 23 | 60 / 87.3 / 51.3 | 3 / 0.0 | 3 / heldUpRear | 10.8 / 1503 · 10.8 / 499 | 2 / 2 / 2 / 2 |

</details>
