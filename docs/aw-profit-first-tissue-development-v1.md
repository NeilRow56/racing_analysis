# AW V3 profit-first Tissue development

**Policy C, recent AW performance, gave the largest improvement over frozen T1 on matched races in the broad 2026 replay. It saved £116.20 across 1,650 bets and still lost £110.34 (−6.69% ROI).** It lost £455.70 in 2025. When replayed on genuine pre-off AW V3 captures, it made £20.41 from 98 bets. The broad losses and the variation across periods give no basis for live stakes.

## Populations and original AW V3

| Cohort | Scoring evidence | Dates | Races | Verified quote boards |
| --- | --- | --- | --- | --- |
| H25 | Historical starter-field reconstruction | Jan–Dec 2025 | 3,028 | 0 |
| H26 | Historical starter-field reconstruction | 1 Jan–21 Sep 2026 | 1,947 | 41 |
| Card | Archived pre-off declarations, AW V3 reconstructed with prior-day form cutoff | 28 Sep–19 Oct 2026 | 134 | 134 |
| V2 | Original pre-off AW V2 vectors replayed with frozen AW V3 | 20 Oct–4 Nov 2026 | 165 | 146 |
| V3 | Original pre-off AW V3 captures and ranks | 5–20 Nov 2026 | 123 | 118 |

H25 and H26 use saved AW V2 base probabilities and the unchanged AW V3 adjustments. Final starter rosters can differ from the declarations available before racing. The model inputs' publication timing is unverified, including on the 41 H26 races with independently verified quotes. H25 overlaps the AW V2 fit. Card declarations are timestamped, while timing of publication and revisions to older form remains unverified. The V3 baseline ranks are genuine frozen prospective AW V3 selections. All candidates are historical policy evaluations. Prior studies explored the 2026 period, including races used to develop the original AW V3 adjustments.

Of 3,106 AW races in 2025 and 2,591 in 2026, 4 and 41 respectively lacked a reconciled complete final-SP field, and a further 74 and 181 lacked eligible scoring inputs. Original T1/T2 identities, SP, wins and P/L reproduced on all 5,378 saved comparison races. This report also includes 19 timestamped races previously excluded for a later withdrawal among the old comparator picks. A withdrawn pick is void with no stake or promotion. T3 is absent in four two-runner historical fields. [Prior reconstruction and inventory](aw-v3-same-or-component-research.md) · [Source and settlement audit](full-history-profitability-model-research.md#1-database-and-source-coverage)

| Cohort | Rank | Races with rank | Bets | Void | Wins | Strike | Actual P/L | ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| H25 | T1 | 3,028 | 3,028 | 0 | 743 | 24.54% | −£321.45 | -10.62% |
| H25 | T2 | 3,028 | 3,028 | 0 | 514 | 16.97% | −£642.32 | -21.21% |
| H25 | T3 | 3,026 | 3,026 | 0 | 407 | 13.45% | −£692.44 | -22.88% |
| H26 | T1 | 1,947 | 1,947 | 0 | 497 | 25.53% | −£272.31 | -13.99% |
| H26 | T2 | 1,947 | 1,947 | 0 | 325 | 16.69% | −£392.16 | -20.14% |
| H26 | T3 | 1,945 | 1,945 | 0 | 281 | 14.45% | −£305.11 | -15.69% |
| Card | T1 | 134 | 132 | 2 | 34 | 25.76% | +£18.90 | 14.32% |
| Card | T2 | 134 | 134 | 0 | 25 | 18.66% | −£20.85 | -15.56% |
| Card | T3 | 134 | 133 | 1 | 14 | 10.53% | −£70.94 | -53.34% |
| V2 | T1 | 165 | 156 | 9 | 30 | 19.23% | −£54.50 | -34.94% |
| V2 | T2 | 165 | 159 | 6 | 28 | 17.61% | −£40.72 | -25.61% |
| V2 | T3 | 165 | 161 | 4 | 29 | 18.01% | +£27.95 | 17.36% |
| V3 | T1 | 123 | 121 | 2 | 21 | 17.36% | −£40.32 | -33.32% |
| V3 | T2 | 123 | 123 | 0 | 29 | 23.58% | +£4.49 | 3.65% |
| V3 | T3 | 123 | 121 | 2 | 10 | 8.26% | −£49.13 | -40.60% |

All realised figures use £1 per priced win selection at uncapped final SP, with dead-heat deductions. Wins count winning tickets, including dead heats. ROI divides P/L by the amount staked. Average winning fractional SP is the mean of the quoted profit multiples before dead-heat deductions.

## Six fixed policies

Each rule takes the highest original AW V3 rank that qualifies among T1–T3, or abstains. Field ranks use competition ranking across available values. All 98 AW V3 components and scores are retained.

| Policy | Qualification |
| --- | --- |
| A · Measured Speed | A measured Best Last 3 AW Speed figure. |
| B · Speed relative to OR | Positive Best Last 3 AW Speed gap to the mean of the other runners with measured Speed at the same Official Rating. Uses the frozen component input and requires at least one such peer. |
| C · Recent AW performance | Latest AW performance ranks in the field's top three. |
| D · Market rank | Sole or joint favourite on a complete verified pre-off median bookmaker quote board. Original Tissue rank breaks ties among qualifying favourites. |
| E · Form and trainer | Latest AW performance ranks in the field's top three and the frozen trainer prior win rate is at least 15%. |
| F · Two-component interaction | Best Last 3 AW Speed ranks second or third and the frozen same-surface starts input records at least one run in the previous 365 days. |

The six definitions came from the inventory and existing diagnostics. They were run on 2025 for development and replayed unchanged on 2026. The five form rules cleared 100 bets in both broad historical periods, the minimum used to consider broad-sample evidence. D had no verified 2025 board and is exploratory in 2026. It abstains without a verified board. Final SP, the target finish and the winner identity enter settlement only. [Original T2 signal diagnostic](aw-v3-t2-selection-diagnostic.md) · [98-component inventory](aw-v3-same-or-component-research.md#1-component-inventory)

## Development and unchanged replay

No-signal and no-quote counts together give all races where the rule made no selection. D's eligible denominator counts only verified boards. Voided selections are separate.

| Cohort | Policy | Eligible | No signal | No quote | Void | Bets | Wins | Strike | Actual P/L | ROI | Avg winning SP |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| H25 | A | 3,028 | 234 | 0 | 0 | 2,794 | 640 | 22.91% | −£291.65 | -10.44% | 2.91/1 |
| H25 | B | 3,028 | 2,164 | 0 | 0 | 864 | 167 | 19.33% | −£94.04 | -10.88% | 3.61/1 |
| H25 | C | 3,028 | 484 | 0 | 0 | 2,544 | 558 | 21.93% | −£455.70 | -17.91% | 2.74/1 |
| H25 | D | 0 | 0 | 3,028 | 0 | 0 | 0 | — | — | — | — |
| H25 | E | 3,028 | 2,106 | 0 | 0 | 922 | 230 | 24.95% | −£109.42 | -11.87% | 2.53/1 |
| H25 | F | 3,028 | 1,213 | 0 | 0 | 1,815 | 356 | 19.61% | −£315.53 | -17.38% | 3.21/1 |
| H26 | A | 1,947 | 137 | 0 | 0 | 1,810 | 432 | 23.87% | −£228.87 | -12.64% | 2.66/1 |
| H26 | B | 1,947 | 1,367 | 0 | 0 | 580 | 123 | 21.21% | −£86.64 | -14.94% | 3.01/1 |
| H26 | C | 1,947 | 297 | 0 | 0 | 1,650 | 422 | 25.58% | −£110.34 | -6.69% | 2.65/1 |
| H26 | D | 41 | 7 | 1,906 | 0 | 34 | 13 | 38.24% | −£1.13 | -3.34% | 1.53/1 |
| H26 | E | 1,947 | 1,380 | 0 | 0 | 567 | 152 | 26.81% | −£76.35 | -13.46% | 2.23/1 |
| H26 | F | 1,947 | 721 | 0 | 0 | 1,226 | 242 | 19.74% | −£205.00 | -16.72% | 3.22/1 |
| Card | A | 134 | 22 | 0 | 0 | 112 | 26 | 23.21% | +£8.99 | 8.02% | 3.65/1 |
| Card | B | 134 | 112 | 0 | 0 | 22 | 6 | 27.27% | −£6.00 | -27.25% | 1.67/1 |
| Card | C | 134 | 35 | 0 | 1 | 98 | 25 | 25.51% | +£2.38 | 2.43% | 3.02/1 |
| Card | D | 134 | 43 | 0 | 0 | 91 | 33 | 36.26% | −£6.03 | -6.62% | 1.57/1 |
| Card | E | 134 | 103 | 0 | 0 | 31 | 8 | 25.81% | −£3.61 | -11.64% | 2.42/1 |
| Card | F | 134 | 69 | 0 | 0 | 65 | 18 | 27.69% | +£14.71 | 22.63% | 3.43/1 |
| V2 | A | 165 | 19 | 0 | 6 | 140 | 22 | 15.71% | −£61.24 | -43.74% | 2.58/1 |
| V2 | B | 165 | 123 | 0 | 1 | 41 | 9 | 21.95% | −£12.36 | -30.16% | 2.18/1 |
| V2 | C | 165 | 44 | 0 | 4 | 117 | 26 | 22.22% | −£17.45 | -14.91% | 2.83/1 |
| V2 | D | 146 | 36 | 19 | 8 | 102 | 36 | 35.29% | −£9.73 | -9.54% | 1.56/1 |
| V2 | E | 165 | 122 | 0 | 1 | 42 | 16 | 38.10% | +£6.45 | 15.37% | 2.03/1 |
| V2 | F | 165 | 88 | 0 | 1 | 76 | 11 | 14.47% | −£16.86 | -22.18% | 4.38/1 |
| V3 | A | 123 | 9 | 0 | 3 | 111 | 27 | 24.32% | +£28.33 | 25.52% | 4.16/1 |
| V3 | B | 123 | 99 | 0 | 1 | 23 | 5 | 21.74% | −£6.28 | -27.28% | 2.34/1 |
| V3 | C | 123 | 23 | 0 | 2 | 98 | 25 | 25.51% | +£20.41 | 20.83% | 3.74/1 |
| V3 | D | 118 | 34 | 5 | 0 | 84 | 33 | 39.29% | +£3.78 | 4.50% | 1.66/1 |
| V3 | E | 123 | 90 | 0 | 1 | 32 | 14 | 43.75% | +£46.08 | 143.99% | 4.58/1 |
| V3 | F | 123 | 56 | 0 | 1 | 66 | 8 | 12.12% | −£24.82 | -37.60% | 4.15/1 |

### Comparison on identical races

Each matched cell gives **common bets / candidate P/L / frozen rank P/L / difference**. Both sides placed a stake on every common race. Comparisons omit any pair with a void pick and use the same scoring book for both runners. T1 is the primary reference and T2 is the secondary reference. The full eligible columns give **bets / wins / P/L** for the reference throughout the policy's eligible population, including races where it abstains. The table above gives each candidate's complete population.

| Cohort | Policy | Matched with T1 | Matched with T2 | Full eligible T1 | Full eligible T2 |
| --- | --- | --- | --- | --- | --- |
| H25 | A | 2,794 / −£291.65 / −£315.34 / +£23.70 | 2,794 / −£291.65 / −£548.95 / +£257.30 | 3,028 / 743 / −£321.45 | 3,028 / 514 / −£642.32 |
| H25 | B | 864 / −£94.04 / −£62.02 / −£32.02 | 864 / −£94.04 / −£198.47 / +£104.44 | 3,028 / 743 / −£321.45 | 3,028 / 514 / −£642.32 |
| H25 | C | 2,544 / −£455.70 / −£273.76 / −£181.94 | 2,544 / −£455.70 / −£449.63 / −£6.07 | 3,028 / 743 / −£321.45 | 3,028 / 514 / −£642.32 |
| H25 | E | 922 / −£109.42 / −£23.50 / −£85.92 | 922 / −£109.42 / −£238.63 / +£129.21 | 3,028 / 743 / −£321.45 | 3,028 / 514 / −£642.32 |
| H25 | F | 1,815 / −£315.53 / −£164.72 / −£150.80 | 1,815 / −£315.53 / −£329.57 / +£14.05 | 3,028 / 743 / −£321.45 | 3,028 / 514 / −£642.32 |
| H26 | A | 1,810 / −£228.87 / −£261.75 / +£32.89 | 1,810 / −£228.87 / −£379.52 / +£150.65 | 1,947 / 497 / −£272.31 | 1,947 / 325 / −£392.16 |
| H26 | B | 580 / −£86.64 / −£118.76 / +£32.12 | 580 / −£86.64 / −£43.55 / −£43.09 | 1,947 / 497 / −£272.31 | 1,947 / 325 / −£392.16 |
| H26 | C | 1,650 / −£110.34 / −£226.54 / +£116.20 | 1,650 / −£110.34 / −£323.43 / +£213.09 | 1,947 / 497 / −£272.31 | 1,947 / 325 / −£392.16 |
| H26 | D | 34 / −£1.13 / +£0.49 / −£1.63 | 34 / −£1.13 / −£10.75 / +£9.62 | 41 / 14 / +£2.99 | 41 / 6 / −£17.75 |
| H26 | E | 567 / −£76.35 / −£28.56 / −£47.78 | 567 / −£76.35 / −£118.72 / +£42.37 | 1,947 / 497 / −£272.31 | 1,947 / 325 / −£392.16 |
| H26 | F | 1,226 / −£205.00 / −£141.89 / −£63.11 | 1,226 / −£205.00 / −£224.00 / +£19.00 | 1,947 / 497 / −£272.31 | 1,947 / 325 / −£392.16 |
| Card | A | 110 / +£10.99 / +£25.50 / −£14.52 | 112 / +£8.99 / −£12.44 / +£21.42 | 132 / 34 / +£18.90 | 134 / 25 / −£20.85 |
| Card | B | 21 / −£5.00 / −£5.02 / +£0.02 | 22 / −£6.00 / −£13.43 / +£7.43 | 132 / 34 / +£18.90 | 134 / 25 / −£20.85 |
| Card | C | 98 / +£2.38 / +£25.50 / −£23.13 | 98 / +£2.38 / −£11.69 / +£14.06 | 132 / 34 / +£18.90 | 134 / 25 / −£20.85 |
| Card | D | 90 / −£5.03 / +£7.18 / −£12.21 | 91 / −£6.03 / −£19.69 / +£13.66 | 132 / 34 / +£18.90 | 134 / 25 / −£20.85 |
| Card | E | 31 / −£3.61 / −£14.21 / +£10.60 | 31 / −£3.61 / −£4.63 / +£1.02 | 132 / 34 / +£18.90 | 134 / 25 / −£20.85 |
| Card | F | 64 / +£15.71 / +£31.90 / −£16.19 | 65 / +£14.71 / −£11.72 / +£26.43 | 132 / 34 / +£18.90 | 134 / 25 / −£20.85 |
| V2 | A | 137 / −£58.24 / −£59.74 / +£1.50 | 137 / −£59.64 / −£25.25 / −£34.39 | 156 / 30 / −£54.50 | 159 / 28 / −£40.72 |
| V2 | B | 38 / −£11.74 / −£25.09 / +£13.35 | 39 / −£10.36 / −£25.40 / +£15.04 | 156 / 30 / −£54.50 | 159 / 28 / −£40.72 |
| V2 | C | 113 / −£13.45 / −£33.15 / +£19.70 | 114 / −£15.85 / −£30.50 / +£14.66 | 156 / 30 / −£54.50 | 159 / 28 / −£40.72 |
| V2 | D | 99 / −£10.48 / −£25.74 / +£15.26 | 100 / −£11.51 / −£35.05 / +£23.55 | 138 / 28 / −£42.86 | 140 / 27 / −£26.22 |
| V2 | E | 41 / +£7.45 / +£5.85 / +£1.60 | 40 / +£7.05 / −£5.55 / +£12.60 | 156 / 30 / −£54.50 | 159 / 28 / −£40.72 |
| V2 | F | 72 / −£12.86 / −£37.73 / +£24.88 | 74 / −£16.26 / −£16.88 / +£0.63 | 156 / 30 / −£54.50 | 159 / 28 / −£40.72 |
| V3 | A | 111 / +£28.33 / −£36.27 / +£64.59 | 111 / +£28.33 / +£7.64 / +£20.68 | 121 / 21 / −£40.32 | 123 / 29 / +£4.49 |
| V3 | B | 23 / −£6.28 / −£2.90 / −£3.38 | 23 / −£6.28 / −£12.38 / +£6.10 | 121 / 21 / −£40.32 | 123 / 29 / +£4.49 |
| V3 | C | 98 / +£20.41 / −£26.77 / +£47.18 | 98 / +£20.41 / +£5.77 / +£14.64 | 121 / 21 / −£40.32 | 123 / 29 / +£4.49 |
| V3 | D | 84 / +£3.78 / −£26.82 / +£30.60 | 84 / +£3.78 / −£6.34 / +£10.12 | 116 / 21 / −£35.32 | 118 / 28 / +£8.16 |
| V3 | E | 32 / +£46.08 / −£1.12 / +£47.19 | 32 / +£46.08 / +£2.21 / +£43.87 | 121 / 21 / −£40.32 | 123 / 29 / +£4.49 |
| V3 | F | 66 / −£24.82 / −£18.03 / −£6.79 | 66 / −£24.82 / +£7.02 / −£31.84 | 121 / 21 / −£40.32 | 123 / 29 / +£4.49 |

## Verdict

1. **C · Recent AW performance.** The £116.20 matched gain against T1 in H26 was the largest broad-sample improvement and persisted at +£49.52 on races with no recorded withdrawals. C also improved on T1 in the V2 and V3 replays. H25 was £181.94 worse than matched T1 and only one of twelve development months was profitable. In H26, three of nine months were profitable and every selection rank lost overall.
2. **A · Measured Speed.** The only rule to beat matched T1 in both broad years, by £23.70 and £32.89. It lost at least £228 in each broad year and £61.24 in the V2 replay. H26's paired improvement reversed to −£12.77 in the no-recorded-withdrawal slice. Original T1 with measured versus missing Speed returned −7.16% versus −21.35% in H25 and −13.55% versus −15.50% in H26.
3. **B · Speed relative to OR.** Improved on matched T1 by £32.12 on 580 H26 bets, with four profitable months. It trailed matched T1 in H25, lost money in every 2026 source and had only 22–41 bets in each timestamped source.
4. **E · Form and trainer.** Made £46.08 from 32 bets on frozen V3 inputs and £6.45 from 42 on V2 inputs. Its V3 profit fell to £8.08 when the two largest winners were removed. It trailed matched T1 in both broad years. Adding the trainer gate reduced H26's loss relative to C, but produced a worse ROI on its smaller betting population.
5. **F · Speed and surface history.** Trailed matched T1 in both broad years. The archived-card profit reversed across both frozen-input archives. The four T1 subgroups below show no repeatable positive interaction between the two components.
6. **D · Market favourite.** No 2025 development population. It made £3.78 from 84 bets on V3 inputs and lost in the three other 2026 sources. A verified board makes the rule usable before the off, but sparse evidence limits the comparison.

C merits further controlled research because it materially improved on matched T1 in the largest 2026 cohort and uses a simple pre-race input. The 2025 loss, the historical 2026 loss and the short V3 capture period leave prospective profitability unproven.

### Outsiders and winner concentration

C selected 86 runners at 20/1 or longer in H25 (3.4% of bets, no winners) and 58 in H26 (3.5%, one winner, −£29.00 in that band). Wild Berries won at 28/1 in H26 from original T3, with the field's third-ranked latest AW performance and second-ranked Best Last 3 AW Speed. Berkshire Dream won at 28/1 in V3 from T3 and was eighth in the verified market and second on latest AW performance. That form evidence explains both selections. C had four V3 bets at 20/1 or longer and returned £25.00 in the band. Excluding Berkshire Dream moves C's V3 total from +£20.41 to −£7.59. The winner is included in the primary return.

<details>
<summary>Largest winning tickets and concentration by policy and baseline</summary>

Winning P/L share divides the two largest net winning contributions by the total net contribution of winning tickets. Net P/L share uses the overall net profit and is shown for profitable rows. Sensitivities remove the whole winning ticket and its stake.

| Cohort | Rule | Actual P/L | Largest winner | Second largest | Less largest | Less both | Top two share of winning P/L | Top two share of net P/L |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| H25 | T1 | −£321.45 | Little Bittern (25/1, +£25.00) | Golden Mind (22/1, +£22.00) | −£346.45 | −£368.45 | 2.39% | — |
| H25 | T2 | −£642.32 | Up The Anti (50/1, +£50.00) | Return To Dubai (33/1, +£33.00) | −£692.32 | −£725.32 | 4.43% | — |
| H25 | T3 | −£692.44 | Valentine Boy (28/1, +£28.00) | Arranmore (25/1, +£25.00) | −£720.44 | −£745.44 | 2.75% | — |
| H25 | A | −£291.65 | Return To Dubai (33/1, +£33.00) | Little Bittern (25/1, +£25.00) | −£324.65 | −£349.65 | 3.11% | — |
| H25 | B | −£94.04 | Magdalayna (22/1, +£22.00) | Emaculate Soldier (16/1, +£16.00) | −£116.04 | −£132.04 | 6.30% | — |
| H25 | C | −£455.70 | Azure Angel (18/1, +£18.00) | Emaculate Soldier (16/1, +£16.00) | −£473.70 | −£489.70 | 2.22% | — |
| H25 | E | −£109.42 | Azure Angel (18/1, +£18.00) | Topwarrior (14/1, +£14.00) | −£127.42 | −£141.42 | 5.49% | — |
| H25 | F | −£315.53 | Magdalayna (22/1, +£22.00) | Exquisite Acclaim (20/1, +£20.00) | −£337.53 | −£357.53 | 3.67% | — |
| H26 | T1 | −£272.31 | Grey Fable (22/1, +£22.00) | Glistening (14/1, +£14.00) | −£294.31 | −£308.31 | 3.06% | — |
| H26 | T2 | −£392.16 | Thaloria (40/1, +£40.00) | Hundred Caps (25/1, +£25.00) | −£432.16 | −£457.16 | 5.29% | — |
| H26 | T3 | −£305.11 | Under The Sun (80/1, +£80.00) | Manhattan Chute (50/1, +£50.00) | −£385.11 | −£435.11 | 9.57% | — |
| H26 | A | −£228.87 | Wild Berries (28/1, +£28.00) | Grey Fable (22/1, +£22.00) | −£256.87 | −£278.87 | 4.35% | — |
| H26 | B | −£86.64 | Alfa Duplicate (16/1, +£16.00) | Addarella (12/1, +£12.00) | −£102.64 | −£114.64 | 7.56% | — |
| H26 | C | −£110.34 | Wild Berries (28/1, +£28.00) | Londoner (14/1, +£14.00) | −£138.34 | −£152.34 | 3.76% | — |
| H26 | D | −£1.13 | Iconic Dawn (4.5/1, +£4.50) | Little Jaybee (2.75/1, +£2.75) | −£5.63 | −£8.38 | 36.49% | — |
| H26 | E | −£76.35 | Tenadaay (12/1, +£12.00) | Prince Quattro (12/1, +£12.00) | −£88.35 | −£100.35 | 7.09% | — |
| H26 | F | −£205.00 | Wild Berries (28/1, +£28.00) | Glistening (14/1, +£14.00) | −£233.00 | −£247.00 | 5.39% | — |
| Card | T1 | +£18.90 | Ice Show (12/1, +£12.00) | Variety Act (11/1, +£11.00) | +£6.90 | −£4.10 | 19.67% | 121.68% |
| Card | T2 | −£20.85 | Kerdos (11/1, +£11.00) | Marhaba Ya Tayib (7.5/1, +£7.50) | −£31.85 | −£39.35 | 20.99% | — |
| Card | T3 | −£70.94 | Benvoy (8.5/1, +£8.50) | Asmen Warrior (8.5/1, +£8.50) | −£79.44 | −£87.94 | 35.37% | — |
| Card | A | +£8.99 | Ice Show (12/1, +£12.00) | Variety Act (11/1, +£11.00) | −£3.01 | −£14.01 | 24.21% | 255.95% |
| Card | B | −£6.00 | Riley Rocks (2.75/1, +£2.75) | Hove Ranger (2.5/1, +£2.50) | −£8.75 | −£11.25 | 52.48% | — |
| Card | C | +£2.38 | Cool King (11/1, +£11.00) | Benvoy (8.5/1, +£8.50) | −£8.62 | −£17.12 | 25.87% | 820.09% |
| Card | D | −£6.03 | Arctic Tsar (4.5/1, +£4.50) | Far Too Fizzy (3.5/1, +£3.50) | −£10.53 | −£14.03 | 15.39% | — |
| Card | E | −£3.61 | Yankee Dude (5.5/1, +£5.50) | He's Our Cracker (5/1, +£5.00) | −£9.11 | −£14.11 | 54.15% | — |
| Card | F | +£14.71 | Variety Act (11/1, +£11.00) | Cool King (11/1, +£11.00) | +£3.71 | −£7.29 | 35.65% | 149.58% |
| V2 | T1 | −£54.50 | Paradise Walk (6/1, +£6.00) | Carrigans Grove (5.5/1, +£5.50) | −£60.50 | −£66.00 | 16.08% | — |
| V2 | T2 | −£40.72 | Yehudi (12/1, +£12.00) | Wannabe Perfect (9/1, +£9.00) | −£52.72 | −£61.72 | 23.26% | — |
| V2 | T3 | +£27.95 | Watch The King (28/1, +£28.00) | Treasurer (20/1, +£20.00) | −£0.05 | −£20.05 | 30.01% | 171.72% |
| V2 | A | −£61.24 | Poor Relation (8.5/1, +£8.50) | Paradise Walk (6/1, +£6.00) | −£69.74 | −£75.74 | 25.55% | — |
| V2 | B | −£12.36 | Deep Sleep (5/1, +£5.00) | Lili Marleen (4/1, +£4.00) | −£17.36 | −£21.36 | 45.83% | — |
| V2 | C | −£17.45 | Society Kiss (20/1, +£20.00) | Carrigans Grove (5.5/1, +£5.50) | −£37.45 | −£42.95 | 34.67% | — |
| V2 | D | −£9.73 | Carrigans Grove (5.5/1, +£5.50) | Asuka (3.5/1, +£3.50) | −£15.23 | −£18.73 | 15.99% | — |
| V2 | E | +£6.45 | Deep Sleep (5/1, +£5.00) | Electric Gambler (4/1, +£4.00) | +£1.45 | −£2.55 | 27.73% | 139.45% |
| V2 | F | −£16.86 | Society Kiss (20/1, +£20.00) | Poor Relation (8.5/1, +£8.50) | −£36.86 | −£45.36 | 59.20% | — |
| V3 | T1 | −£40.32 | Amandari (10/1, +£10.00) | Thai Baht (9/1, +£9.00) | −£50.32 | −£59.32 | 31.84% | — |
| V3 | T2 | +£4.49 | Leading Times (16/1, +£16.00) | Xirivella (9/1, +£9.00) | −£11.51 | −£20.51 | 25.38% | 556.30% |
| V3 | T3 | −£49.13 | Berkshire Dream (28/1, +£28.00) | My Amanah (8/1, +£8.00) | −£77.13 | −£85.13 | 58.18% | — |
| V3 | A | +£28.33 | Berkshire Dream (28/1, +£28.00) | Amandari (10/1, +£10.00) | +£0.33 | −£9.67 | 33.83% | 134.14% |
| V3 | B | −£6.28 | Lady Mariko (3.5/1, +£3.50) | Jazzit (3/1, +£3.00) | −£9.78 | −£12.78 | 55.44% | — |
| V3 | C | +£20.41 | Berkshire Dream (28/1, +£28.00) | Amandari (10/1, +£10.00) | −£7.59 | −£17.59 | 40.68% | 186.17% |
| V3 | D | +£3.78 | Whiskey Galore (4.5/1, +£4.50) | Lady Mariko (3.5/1, +£3.50) | −£0.72 | −£4.22 | 14.60% | 211.76% |
| V3 | E | +£46.08 | Berkshire Dream (28/1, +£28.00) | Amandari (10/1, +£10.00) | +£18.08 | +£8.08 | 59.30% | 82.47% |
| V3 | F | −£24.82 | Thai Baht (9/1, +£9.00) | It's A Love Thing (7/1, +£7.00) | −£33.82 | −£40.82 | 48.22% | — |

</details>

<details>
<summary>Final-SP bands by policy and baseline</summary>

Cells show **bets / wins / £1 P/L**. Final-SP bands describe settlement.

| Cohort | Rule | <2/1 | 2–<5/1 | 5–<8/1 | 8–<12/1 | 12–<20/1 | 20/1+ |
| --- | --- | --- | --- | --- | --- | --- | --- |
| H25 | T1 | 776 / 379 / −£14.47 | 1,172 / 270 / −£78.47 | 490 / 59 / −£76.50 | 250 / 24 / −£10.00 | 202 / 7 / −£97.00 | 138 / 4 / −£45.00 |
| H25 | T2 | 395 / 178 / −£8.33 | 1,105 / 229 / −£163.48 | 599 / 64 / −£149.00 | 384 / 25 / −£129.50 | 291 / 13 / −£88.00 | 254 / 5 / −£104.00 |
| H25 | T3 | 213 / 92 / −£5.32 | 930 / 186 / −£145.12 | 642 / 65 / −£178.00 | 487 / 28 / −£203.00 | 392 / 28 / +£16.00 | 362 / 8 / −£177.00 |
| H25 | A | 635 / 294 / −£17.16 | 1,118 / 258 / −£69.48 | 464 / 54 / −£82.00 | 233 / 21 / −£24.00 | 190 / 9 / −£49.00 | 154 / 4 / −£50.00 |
| H25 | B | 125 / 52 / −£3.08 | 383 / 86 / −£23.46 | 184 / 13 / −£93.50 | 84 / 10 / +£20.00 | 71 / 5 / £0.00 | 17 / 1 / +£6.00 |
| H25 | C | 587 / 269 / −£30.24 | 1,047 / 214 / −£168.97 | 445 / 51 / −£82.50 | 215 / 15 / −£57.00 | 164 / 9 / −£31.00 | 86 / 0 / −£86.00 |
| H25 | E | 255 / 116 / −£32.24 | 398 / 85 / −£58.68 | 142 / 21 / +£7.50 | 53 / 5 / +£1.00 | 46 / 3 / +£1.00 | 28 / 0 / −£28.00 |
| H25 | F | 317 / 139 / −£16.31 | 748 / 158 / −£105.72 | 339 / 36 / −£81.00 | 191 / 13 / −£62.50 | 145 / 6 / −£61.00 | 75 / 4 / +£11.00 |
| H26 | T1 | 539 / 264 / −£6.33 | 795 / 185 / −£54.47 | 271 / 34 / −£37.00 | 147 / 9 / −£58.50 | 111 / 4 / −£55.00 | 84 / 1 / −£61.00 |
| H26 | T2 | 299 / 123 / −£17.27 | 703 / 120 / −£215.38 | 377 / 47 / −£55.50 | 230 / 18 / −£44.00 | 185 / 15 / +£26.00 | 153 / 2 / −£86.00 |
| H26 | T3 | 183 / 78 / −£9.09 | 612 / 121 / −£102.02 | 379 / 43 / −£83.50 | 301 / 20 / −£93.50 | 224 / 12 / −£44.00 | 246 / 7 / +£27.00 |
| H26 | A | 449 / 217 / +£2.93 | 759 / 164 / −£97.80 | 261 / 33 / −£30.50 | 151 / 10 / −£49.50 | 110 / 6 / −£26.00 | 80 / 2 / −£28.00 |
| H26 | B | 114 / 51 / +£3.75 | 256 / 52 / −£43.89 | 114 / 15 / −£11.50 | 51 / 3 / −£20.00 | 29 / 2 / +£1.00 | 16 / 0 / −£16.00 |
| H26 | C | 435 / 216 / +£15.80 | 674 / 148 / −£84.63 | 249 / 39 / +£13.50 | 133 / 10 / −£35.00 | 101 / 8 / +£9.00 | 58 / 1 / −£29.00 |
| H26 | D | 17 / 9 / +£0.62 | 15 / 4 / +£0.25 | 2 / 0 / −£2.00 | — | — | — |
| H26 | E | 187 / 89 / −£19.67 | 207 / 47 / −£19.17 | 79 / 10 / −£11.00 | 37 / 3 / −£8.50 | 32 / 3 / +£7.00 | 25 / 0 / −£25.00 |
| H26 | F | 230 / 96 / −£9.66 | 535 / 107 / −£91.84 | 201 / 24 / −£43.00 | 133 / 7 / −£57.50 | 69 / 7 / +£26.00 | 58 / 1 / −£29.00 |
| Card | T1 | 33 / 17 / +£4.90 | 46 / 6 / −£22.50 | 27 / 8 / +£25.50 | 16 / 2 / +£8.00 | 7 / 1 / +£6.00 | 3 / 0 / −£3.00 |
| Card | T2 | 14 / 5 / −£3.14 | 56 / 13 / −£5.71 | 22 / 6 / +£18.00 | 18 / 1 / −£6.00 | 9 / 0 / −£9.00 | 15 / 0 / −£15.00 |
| Card | T3 | 11 / 6 / +£0.56 | 37 / 4 / −£19.50 | 34 / 2 / −£20.00 | 15 / 2 / +£4.00 | 13 / 0 / −£13.00 | 23 / 0 / −£23.00 |
| Card | A | 23 / 12 / +£4.15 | 37 / 6 / −£15.17 | 21 / 5 / +£14.00 | 17 / 2 / +£7.00 | 8 / 1 / +£5.00 | 6 / 0 / −£6.00 |
| Card | B | 4 / 3 / +£1.50 | 9 / 3 / +£1.50 | 3 / 0 / −£3.00 | 3 / 0 / −£3.00 | 2 / 0 / −£2.00 | 1 / 0 / −£1.00 |
| Card | C | 26 / 13 / +£2.63 | 38 / 6 / −£15.25 | 15 / 4 / +£12.50 | 13 / 2 / +£8.50 | 6 / 0 / −£6.00 | — |
| Card | D | 48 / 23 / +£0.22 | 43 / 10 / −£6.25 | — | — | — | — |
| Card | E | 9 / 4 / −£2.23 | 10 / 2 / −£1.88 | 4 / 2 / +£8.50 | 5 / 0 / −£5.00 | 1 / 0 / −£1.00 | 2 / 0 / −£2.00 |
| Card | F | 10 / 7 / +£6.21 | 25 / 6 / −£4.50 | 10 / 3 / +£9.00 | 11 / 2 / +£13.00 | 4 / 0 / −£4.00 | 5 / 0 / −£5.00 |
| V2 | T1 | 36 / 15 / −£5.75 | 60 / 11 / −£14.75 | 25 / 4 / +£1.00 | 16 / 0 / −£16.00 | 12 / 0 / −£12.00 | 7 / 0 / −£7.00 |
| V2 | T2 | 21 / 11 / +£2.15 | 55 / 12 / −£5.87 | 29 / 2 / −£15.00 | 19 / 2 / £0.00 | 22 / 1 / −£9.00 | 13 / 0 / −£13.00 |
| V2 | T3 | 16 / 9 / +£5.20 | 49 / 12 / +£4.25 | 26 / 3 / −£3.00 | 21 / 2 / −£0.50 | 23 / 0 / −£23.00 | 26 / 3 / +£45.00 |
| V2 | A | 30 / 12 / −£4.24 | 55 / 6 / −£30.50 | 23 / 3 / −£4.00 | 16 / 1 / −£6.50 | 6 / 0 / −£6.00 | 10 / 0 / −£10.00 |
| V2 | B | 9 / 6 / +£4.64 | 14 / 2 / −£5.00 | 8 / 1 / −£2.00 | 6 / 0 / −£6.00 | 2 / 0 / −£2.00 | 2 / 0 / −£2.00 |
| V2 | C | 33 / 16 / +£2.55 | 39 / 7 / −£8.50 | 20 / 2 / −£7.50 | 10 / 0 / −£10.00 | 7 / 0 / −£7.00 | 8 / 1 / +£13.00 |
| V2 | D | 52 / 27 / +£4.02 | 45 / 8 / −£15.25 | 3 / 1 / +£3.50 | 2 / 0 / −£2.00 | — | — |
| V2 | E | 15 / 10 / +£6.45 | 16 / 5 / +£5.00 | 5 / 1 / +£1.00 | 3 / 0 / −£3.00 | 1 / 0 / −£1.00 | 2 / 0 / −£2.00 |
| V2 | F | 9 / 4 / −£0.94 | 31 / 5 / −£10.42 | 12 / 0 / −£12.00 | 10 / 1 / −£0.50 | 7 / 0 / −£7.00 | 7 / 1 / +£14.00 |
| V3 | T1 | 32 / 11 / −£11.07 | 44 / 6 / −£20.25 | 16 / 2 / −£1.00 | 18 / 2 / +£3.00 | 6 / 0 / −£6.00 | 5 / 0 / −£5.00 |
| V3 | T2 | 19 / 13 / +£8.66 | 38 / 10 / +£6.33 | 19 / 4 / +£9.50 | 19 / 1 / −£9.00 | 17 / 1 / £0.00 | 11 / 0 / −£11.00 |
| V3 | T3 | 6 / 1 / −£3.13 | 30 / 6 / −£5.50 | 21 / 1 / −£14.50 | 26 / 1 / −£17.00 | 14 / 0 / −£14.00 | 24 / 1 / +£5.00 |
| V3 | A | 27 / 12 / −£2.01 | 41 / 7 / −£11.67 | 18 / 5 / +£17.00 | 15 / 2 / +£6.00 | 5 / 0 / −£5.00 | 5 / 1 / +£24.00 |
| V3 | B | 4 / 2 / +£0.73 | 10 / 3 / +£2.00 | 3 / 0 / −£3.00 | 3 / 0 / −£3.00 | 1 / 0 / −£1.00 | 2 / 0 / −£2.00 |
| V3 | C | 22 / 11 / −£0.92 | 41 / 10 / +£2.83 | 15 / 2 / −£1.50 | 10 / 1 / +£1.00 | 6 / 0 / −£6.00 | 4 / 1 / +£25.00 |
| V3 | D | 47 / 22 / −£1.47 | 37 / 11 / +£5.25 | — | — | — | — |
| V3 | E | 11 / 6 / +£0.74 | 12 / 5 / +£7.33 | 3 / 1 / +£4.00 | 2 / 1 / +£9.00 | 1 / 0 / −£1.00 | 3 / 1 / +£26.00 |
| V3 | F | 8 / 2 / −£3.65 | 31 / 4 / −£12.17 | 9 / 1 / −£1.00 | 11 / 1 / −£1.00 | 6 / 0 / −£6.00 | 1 / 0 / −£1.00 |

</details>

<details>
<summary>Monthly P/L by policy and baseline</summary>

| Cohort | Month | T1 | T2 | T3 | A | B | C | D | E | F |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| H25 | 2025-01 | +£14.68 | −£121.36 | −£119.94 | +£6.13 | −£8.90 | −£14.05 | — | −£45.52 | −£39.12 |
| H25 | 2025-02 | −£30.43 | −£42.09 | −£123.60 | −£20.55 | −£30.42 | −£63.37 | — | −£31.01 | −£18.95 |
| H25 | 2025-03 | −£36.86 | −£62.91 | −£97.56 | −£56.09 | −£31.02 | −£25.54 | — | +£1.57 | −£56.38 |
| H25 | 2025-04 | +£19.34 | −£78.91 | −£55.49 | +£36.95 | −£9.83 | −£60.20 | — | −£7.60 | −£15.58 |
| H25 | 2025-05 | +£3.90 | +£11.44 | −£26.01 | −£9.59 | +£19.99 | −£21.31 | — | −£2.30 | +£7.83 |
| H25 | 2025-06 | −£27.28 | −£13.24 | −£14.89 | −£52.92 | +£10.73 | −£11.62 | — | −£6.88 | −£34.35 |
| H25 | 2025-07 | −£32.18 | −£14.98 | −£30.50 | −£13.18 | −£6.00 | −£17.55 | — | −£3.05 | −£11.38 |
| H25 | 2025-08 | −£10.70 | +£5.64 | −£34.61 | +£10.85 | +£1.33 | +£12.64 | — | −£6.74 | +£8.25 |
| H25 | 2025-09 | −£40.21 | −£99.71 | −£36.66 | −£23.81 | −£20.10 | −£18.07 | — | +£22.70 | −£13.89 |
| H25 | 2025-10 | −£60.34 | −£93.61 | −£40.66 | −£92.63 | −£11.04 | −£98.37 | — | −£12.06 | −£58.45 |
| H25 | 2025-11 | −£89.22 | −£92.49 | +£75.84 | −£55.52 | +£26.96 | −£38.51 | — | +£4.49 | +£11.62 |
| H25 | 2025-12 | −£32.15 | −£40.10 | −£188.36 | −£21.29 | −£35.74 | −£99.74 | — | −£23.02 | −£95.11 |
| H26 | 2026-01 | −£11.68 | −£102.80 | −£29.22 | −£19.05 | −£18.62 | +£5.21 | — | +£11.02 | −£69.01 |
| H26 | 2026-02 | −£101.21 | −£55.91 | +£91.36 | −£96.30 | +£8.94 | −£15.39 | — | −£16.37 | +£0.58 |
| H26 | 2026-03 | −£24.68 | −£62.29 | −£72.42 | −£13.97 | −£42.28 | −£40.45 | — | −£13.30 | −£58.90 |
| H26 | 2026-04 | −£41.41 | −£57.30 | −£91.30 | −£45.85 | −£22.84 | −£30.10 | — | +£0.52 | −£48.40 |
| H26 | 2026-05 | −£6.94 | −£33.32 | −£44.79 | −£7.83 | −£6.77 | −£29.61 | — | −£19.06 | −£27.01 |
| H26 | 2026-06 | −£19.29 | −£34.74 | −£23.00 | −£12.90 | +£0.75 | +£9.50 | — | −£20.00 | +£7.50 |
| H26 | 2026-07 | −£59.18 | −£11.18 | −£52.63 | −£29.66 | +£5.46 | −£18.33 | — | −£22.83 | −£4.94 |
| H26 | 2026-08 | −£3.85 | +£9.64 | −£39.99 | −£7.30 | +£4.50 | −£12.14 | — | +£0.26 | −£30.29 |
| H26 | 2026-09 | −£4.07 | −£44.26 | −£43.12 | +£4.00 | −£15.77 | +£20.98 | −£1.13 | +£3.42 | +£25.47 |
| Card | 2026-09 | +£14.20 | +£0.96 | −£15.13 | +£12.35 | −£0.40 | +£11.45 | +£3.10 | +£0.23 | +£15.48 |
| Card | 2026-10 | +£4.70 | −£21.81 | −£55.81 | −£3.36 | −£5.60 | −£9.07 | −£9.13 | −£3.83 | −£0.77 |
| V2 | 2026-10 | −£53.01 | −£9.32 | −£16.38 | −£34.64 | −£12.84 | −£33.30 | −£5.71 | +£4.45 | −£25.76 |
| V2 | 2026-11 | −£1.49 | −£31.40 | +£44.33 | −£26.60 | +£0.48 | +£15.85 | −£4.02 | +£2.00 | +£8.90 |
| V3 | 2026-11 | −£40.32 | +£4.49 | −£49.13 | +£28.33 | −£6.28 | +£20.41 | +£3.78 | +£46.08 | −£24.82 |

</details>

<details>
<summary>Results by original Tissue rank</summary>

Cells show **bets / wins / £1 P/L**.

| Cohort | Policy | T1 | T2 | T3 |
| --- | --- | --- | --- | --- |
| H25 | A | 2,290 / 551 / −£163.90 | 366 / 69 / −£70.76 | 138 / 20 / −£56.99 |
| H25 | B | 286 / 72 / −£10.56 | 306 / 52 / −£41.77 | 272 / 43 / −£41.71 |
| H25 | C | 1,430 / 372 / −£133.36 | 739 / 136 / −£180.58 | 375 / 50 / −£141.76 |
| H25 | E | 526 / 160 / +£13.76 | 266 / 50 / −£92.76 | 130 / 20 / −£30.42 |
| H25 | F | 809 / 203 / −£47.10 | 586 / 98 / −£145.36 | 420 / 55 / −£123.06 |
| H26 | A | 1,514 / 374 / −£205.19 | 221 / 44 / −£27.68 | 75 / 14 / +£4.00 |
| H26 | B | 165 / 38 / −£31.90 | 220 / 49 / −£10.56 | 195 / 36 / −£44.18 |
| H26 | C | 970 / 287 / −£29.28 | 462 / 94 / −£55.43 | 218 / 41 / −£25.63 |
| H26 | D | 18 / 8 / −£2.51 | 11 / 4 / +£3.38 | 5 / 1 / −£2.00 |
| H26 | E | 337 / 112 / −£12.08 | 145 / 28 / −£33.10 | 85 / 12 / −£31.17 |
| H26 | F | 558 / 134 / −£64.05 | 400 / 70 / −£80.47 | 268 / 38 / −£60.47 |
| Card | A | 81 / 20 / +£9.40 | 23 / 6 / +£7.58 | 8 / 0 / −£8.00 |
| Card | B | 7 / 2 / −£3.07 | 5 / 3 / +£3.57 | 10 / 1 / −£6.50 |
| Card | C | 56 / 18 / +£5.88 | 23 / 5 / +£2.50 | 19 / 2 / −£6.00 |
| Card | D | 47 / 18 / −£0.82 | 28 / 9 / −£1.89 | 16 / 6 / −£3.31 |
| Card | E | 13 / 4 / −£1.46 | 11 / 3 / +£3.63 | 7 / 1 / −£5.78 |
| Card | F | 27 / 11 / +£22.71 | 25 / 7 / +£5.00 | 13 / 0 / −£13.00 |
| V2 | A | 104 / 16 / −£55.99 | 28 / 4 / −£10.75 | 8 / 2 / +£5.50 |
| V2 | B | 15 / 3 / −£2.09 | 8 / 1 / −£6.00 | 18 / 5 / −£4.27 |
| V2 | C | 58 / 15 / −£11.77 | 35 / 5 / −£19.65 | 24 / 6 / +£13.97 |
| V2 | D | 49 / 19 / +£2.51 | 34 / 12 / −£6.60 | 19 / 5 / −£5.65 |
| V2 | E | 22 / 11 / +£9.60 | 11 / 3 / −£0.38 | 9 / 2 / −£2.77 |
| V2 | F | 25 / 4 / −£13.94 | 28 / 3 / −£17.92 | 23 / 4 / +£15.00 |
| V3 | A | 77 / 14 / −£13.21 | 24 / 10 / +£11.54 | 10 / 3 / +£30.00 |
| V3 | B | 9 / 1 / −£6.90 | 6 / 3 / +£4.63 | 8 / 1 / −£4.00 |
| V3 | C | 45 / 9 / −£12.34 | 33 / 14 / +£19.25 | 20 / 2 / +£13.50 |
| V3 | D | 48 / 14 / −£16.82 | 22 / 14 / +£17.23 | 14 / 5 / +£3.38 |
| V3 | E | 17 / 7 / +£8.49 | 9 / 6 / +£14.58 | 6 / 1 / +£23.00 |
| V3 | F | 35 / 4 / −£12.65 | 21 / 3 / −£6.17 | 10 / 1 / −£6.00 |

</details>

<details>
<summary>Two-component subgroups and recorded-withdrawal sensitivity</summary>

Original T1 grouped by the two features in F. Cells show **bets / wins / £1 P/L**. The positive no-same-surface subgroup in each broad year had 102 and 75 bets respectively. The corresponding pre-off groups each had seven bets or fewer. This is a descriptive subgroup result.

| Existing T1 subgroup | H25 | H26 | Card | V2 | V3 |
| --- | --- | --- | --- | --- | --- |
| No recorded same-surface run, other or missing Speed rank | 732 / 203 / −£126.07 | 414 / 121 / −£67.14 | 45 / 11 / −£3.18 | 44 / 13 / +£5.11 | 37 / 9 / −£6.91 |
| No recorded same-surface run, Speed rank 2–3 | 102 / 35 / +£54.46 | 75 / 29 / +£26.99 | 5 / 3 / +£2.63 | 7 / 2 / −£2.58 | 3 / 0 / −£3.00 |
| Recorded same-surface run, other or missing Speed rank | 1,385 / 302 / −£202.73 | 900 / 213 / −£168.10 | 55 / 9 / −£3.25 | 80 / 11 / −£43.10 | 46 / 8 / −£17.76 |
| Recorded same-surface run, Speed rank 2–3 | 809 / 203 / −£47.10 | 558 / 134 / −£64.05 | 27 / 11 / +£22.71 | 25 / 4 / −£13.94 | 35 / 4 / −£12.65 |

The historical sensitivity retains fields with no withdrawals recorded in the terminal snapshot. Their publication timing remains unverified.

| Year | Races | Rule | Bets / wins / P/L | Difference vs paired T1 |
| --- | --- | --- | --- | --- |
| 2025 | 1,712 | A | 1,590 / 383 / −£106.26 | +£30.39 |
| 2025 | 1,712 | B | 467 / 95 / −£28.34 | −£0.24 |
| 2025 | 1,712 | C | 1,466 / 342 / −£224.94 | −£87.46 |
| 2025 | 1,712 | E | 558 / 154 / −£18.24 | −£51.06 |
| 2025 | 1,712 | F | 1,033 / 210 / −£182.45 | −£97.53 |
| 2026 | 1,175 | A | 1,098 / 257 / −£146.54 | −£12.77 |
| 2026 | 1,175 | B | 347 / 76 / −£29.81 | +£51.82 |
| 2026 | 1,175 | C | 991 / 254 / −£52.87 | +£49.52 |
| 2026 | 1,175 | D | 32 / 12 / −£2.88 | −£5.37 |
| 2026 | 1,175 | E | 372 / 98 / −£35.56 | −£31.73 |
| 2026 | 1,175 | F | 754 / 142 / −£150.43 | −£77.06 |

</details>

## Reproduction

The [local Bun script](../scripts/aw-profit-first-tissue.ts) reads SHA-256-pinned archives and emits results for one year. It verifies original T1/T2 identities and settlement against the saved study and checks AW V3 ranks against the original captures. A rerun requires the two existing temporary archive directories and terminal snapshot below.

```sh
bun scripts/aw-profit-first-tissue.ts 2025 /private/tmp/aw-controlled-v1 /private/tmp/racing-audit.1mgsVE data/research/backtest-cache/full-history-profitability-v1/source.ndjson
bun scripts/aw-profit-first-tissue.ts 2026 /private/tmp/aw-controlled-v1 /private/tmp/racing-audit.1mgsVE data/research/backtest-cache/full-history-profitability-v1/source.ndjson
```
