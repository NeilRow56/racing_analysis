# Tissue 2 profitability challenge

**Phase 2 · 26 November 2026**

**Advance only the existing AW Profit V1 rule for future prospective comparison against unchanged Tissue 2 on AW.** It has a credible chance of outperforming T2 and is already recorded before the off. Across 71 matched settled opportunities from its live shadow ledger, V1 returned **+£14.87 captured and +£29.63 at final SP**, versus **−£5.50 and +£1.63** for T2. Four settled race dates and material day concentration make this a case for continued shadow validation. The review identifies no Hurdle, Chase or cross-family challenger.

## Benchmark and common opportunities

Phase 2 starts from the same 635-race frozen snapshot and reuses the Phase 1 archive reconciliation and £1 win settlement. The policy comparison covers **528 completed races with complete pre-off markets**, comprising 200 AW, 205 Hurdle and 123 Chase. The same races support both price bases. Phase 2 evaluates the whole opportunity, including races where either policy abstains or its intended horse is later withdrawn. This gives a different denominator from Phase 1's T1/T2 starter pairs. Later withdrawals are refunded without replacement. Coverage is settled bets divided by eligible races. Captured returns are nominal frozen median quotes, with no bookmaker-specific deduction or execution adjustment. SP only settles the choices made from pre-off data.

| Family | Eligible | T2 bets / wins | Strike | Coverage | Captured £ / ROI | SP £ / ROI | Winning decimal odds captured / SP |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| AW, Hurdle and Chase | 528 | 505 / 111 | 22.0% | 95.6% | +0.25 / +0.0% | +4.91 / +1.0% | 4.55 / 4.59 |
| AW | 200 | 196 / 41 | 20.9% | 98.0% | −2.92 / −1.5% | +14.54 / +7.4% | 4.71 / 5.14 |
| Hurdle | 205 | 196 / 45 | 23.0% | 95.6% | +2.83 / +1.4% | −2.18 / −1.1% | 4.42 / 4.31 |
| Chase | 123 | 113 / 25 | 22.1% | 91.9% | +0.34 / +0.3% | −7.45 / −6.6% | 4.53 / 4.22 |
| Turf, separate | 7 | 7 / 1 | 14.3% | 100% | −4.12 / −58.9% | −4.38 / −62.5% | 2.88 / 2.63 |

T2 has zero abstentions. In the wider SP audit including incomplete boards, T2 returned **−£14.76 from 559 bets and 120 winners over 584 AW, Hurdle and Chase opportunities**. The 56 incomplete markets account for the difference in opportunity coverage. Turf has eight settled races including one incomplete board and is too sparse for a challenger decision. [Phase 1 settlement and price audit](tissue-profitability-phase-1-2026-11-26.md)

## Methods A and B

The fixed rules use the captured field and prices. An incomplete board is outside the common price-rule evaluation, with no later bookmaker price imputation.

| Rule | Pre-off decision |
| --- | --- |
| A1 · Break-even | Bet T2 only when frozen probability × captured decimal odds exceeds 1. This asks whether the model clears the actual quote's break-even probability. |
| A2 · Market top three | Bet T2 only when at most two runners have strictly shorter captured odds. This tests whether market support filters out weak selections. |
| B · T3 speed and price | Switch to frozen T3 only if both recent Speed and Best Last 3 Speed are measured for both horses, T3 is strictly higher on both, and T3's quote is at least T2's. Use the stored family speed inputs and their missingness flags. Otherwise keep T2. |

| AW, Hurdle and Chase | Abstain | Bets / wins | Coverage | Captured £ / ROI | SP £ / ROI |
| --- | ---: | ---: | ---: | ---: | ---: |
| T2 | 0 | 505 / 111 | 95.6% | +0.25 / +0.0% | +4.91 / +1.0% |
| A1 · Break-even | 301 | 214 / 20 | 40.5% | −36.71 / −17.2% | −57.80 / −27.0% |
| A2 · Market top three | 202 | 314 / 93 | 59.5% | +14.75 / +4.7% | +3.41 / +1.1% |
| B · T3 speed and price | 0 | 503 / 94 | 95.3% | −50.85 / −10.1% | −30.74 / −6.1% |

A1 missed **91 T2 winners** among 291 omitted stakes. A2 missed **18 winners** and omitted 173 losing stakes. The omitted bets lost £14.50 captured and made £1.50 at SP, so A2's slight SP ROI gain came from lower stake exposure while total SP profit fell. AW supplied all its captured-price improvement. Hurdle trailed T2 on both bases, and Chase trailed at capture with a £0.50 SP cash improvement on fewer bets. The pooled rule lost money in the early November block and made money in the later one. Its whole-sample return after removing its largest winner was +£6.75 captured and −£3.09 at SP.

B switched 69 races. On each basis, eight outcomes improved, 23 worsened and 38 tied in £1 P/L. Its 63 settled replacements included three winners. The switches themselves returned **−£23.00 captured and −£17.00 at SP**, reducing the original T2 policy's P/L by £51.10 and £35.65 respectively. Masaccio won at 29.00 captured and 34.00 SP. The same switch policy also backed 21 losing outsiders at captured decimal odds of 11.00 or more and 29 at SP. All were counted.

## Method C · AW Profit V1

**Selection rule.** In an eligible pre-off AW Tissue V3 field, rank measured `latest_performance` across the full frozen field in descending order. Ties share competition rank. Choose the best original Tissue rank among T1–T3 whose recent performance rank is also 1–3. Missing performances cannot qualify. Abstain if no runner qualifies. A post-decision NR or void refunds the stake without promotion. The selection rule itself requires no market price. Captured evaluation requires the original complete board, and all-settled SP can include incomplete boards. Hurdle and Chase are outside the rule's scope. [Existing selection implementation](../src/lib/racing/aw-profit-policy.ts)

The principle is agreement between a broad Tissue shortlist and a specific recent AW performance signal. It introduces no extra model, coefficient or price threshold. Recent performance is already a Tissue input, so agreement is a second check using existing information. It does not establish an independent predictor. The existing development review compared recent performance with measured Speed, same-OR Speed, trainer form and surface history. Those comparisons do not establish that a second filter improves V1. The separate historical AW-D leader had negative full-sample SP ROI in 2025 and earlier 2026, −14.7% and −11.4%, with different source cohorts. That is context for keeping this test to one form rule. [AW policy development](aw-profit-first-tissue-development-v1.md) · [Historical AW-D audit](racing-2025-2026-data-market-trainer-audit.md)

| AW opportunities | Policy | Abstain | Bets / wins | Coverage | Captured £ / ROI | SP £ / ROI |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| All 200 complete boards | T2 | 0 | 196 / 41 | 98.0% | −2.92 / −1.5% | +14.54 / +7.4% |
| All 200 complete boards | V1 | 44 | 153 / 41 | 76.5% | +40.39 / +26.4% | +53.91 / +35.2% |
| Recorded shadow, 71 complete boards | T2 | 0 | 67 / 10 | 94.4% | −5.50 / −8.2% | +1.63 / +2.4% |
| Recorded shadow, 71 complete boards | V1 | 20 | 50 / 13 | 70.4% | +14.87 / +29.7% | +29.63 / +59.3% |

The recorded shadow was armed on **21 November**. All 80 observations matched their exact pre-off generation books by race ID, capture and cutoff timestamps, model hash, runner identities, ranks, probabilities and quotes. Seventy-one were settled and nine pending. All 51 V1 decisions in the settled races had stored outcomes, including one refund. Where the shadow also stored SP for a selected runner, it agreed with Phase 1's archive settlement within source rounding. T2 is the original rank from that same book. The 71 recorded decisions are included in the 200-race replay and therefore cannot serve as a second sample. [AW Profit V1 shadow ledger](../data/research/aw-profit-shadow-v1.json)

**Where the gains came from.** In the 71 recorded opportunities, V1 accepted T1 in 23 races, contributing **+£12.30 captured and +£19.00 SP relative to T2** on those races. Moving to T3 in eight added **+£4.57 captured and +£3.00 SP** relative to T2. Twenty abstentions avoided **£3.50 captured and £6.00 SP** in T2 losses. It retained T2 in the other 20. Against original T1, V1 gained £42.76 captured and £54.25 at SP before rounding, from a combination of skipping weak races and switching to qualifying T2/T3. On the 45 complete-board races where all three policies had settled bets, V1's captured advantage over T2 was only **£0.87**, and its SP advantage was **£3.00**. The all-opportunity lead includes differences in exposure and refunds.

**Concentration and time.** On all 200 complete boards, the largest V1 captured winner was Berkshire Dream at 34.00. V1 still made **+£7.39 captured** when that winning ticket was omitted. Its SP return after omitting its largest SP winning ticket was **+£25.91**. The early replay block fell behind T2 at SP and lost money at either basis when its largest winning ticket was removed. The later block beat T2 on both bases. On the four recorded shadow dates, V1 beat T2 on two dates on both bases. Omitting 24 November leaves V1 at **−£6.63 captured**, £1.13 behind T2, and **+£10.00 SP**, £8.88 ahead. The shadow sample supports testing the rule but leaves the size and stability of its advantage uncertain.

## Historical robustness and decision

All figures below are prior **final-SP** evidence for the same AW recent-performance method, recorded as Policy C in the development report. Matched difference is on races where both policies actually placed a settled stake. Full-policy results include the economic effect of abstention.

| Period and evidence | V1 bets / wins | V1 P/L / ROI | Same-race bets with T2 | V1 less T2 on common bets |
| --- | ---: | ---: | ---: | ---: |
| 2025 historical starter-field replay | 2,544 / 558 | −£455.70 / −17.91% | 2,544 | −£6.07 |
| Jan–Sep 2026 historical starter-field replay | 1,650 / 422 | −£110.34 / −6.69% | 1,650 | +£213.09 |
| 28 Sep–19 Oct 2026 archived declarations | 98 / 25 | +£2.38 / +2.43% | 98 | +£14.06 |
| 20 Oct–4 Nov 2026 original AW V2 inputs replayed with AW V3 | 117 / 26 | −£17.45 / −14.91% | 114 | +£14.66 |
| 5–20 Nov 2026 frozen AW V3 book replay | 98 / 25 | +£20.41 / +20.83% | 98 | +£14.64 |

The 2025 replay overlaps earlier AW base-model development. Historical starter fields incorporate later knowledge of the eventual roster, and form publication and revision timing are unverified. Earlier 2026 was explored in previous research. The late October and early November Value books include inputs used in generation development. Phase 1 identified 305 development books drawn from older Value ledgers and 567 current-generation race IDs also in those ledgers. The prior November policy replay falls within this review's November window. Treat these figures as historical context and overlapping research. The broader 2026 gain against T2 still left V1 deeply negative. Archived genuine quote coverage is too limited historically to make an equivalent captured-price comparison. No suitable apples-to-apples historical populations were established for A1, A2 or B, or for transferring AW V1 to jumps. [Prior AW cohort definitions and comparisons](aw-profit-first-tissue-development-v1.md) · [Phase 1 overlap audit](tissue-profitability-phase-1-2026-11-26.md)

**Decision.** Use the existing AW Profit V1 shadow observations on genuinely new race IDs for the next comparison. Fix the rule as implemented and pair with T2 on the same opportunities. Treat captured and final-SP P/L as separate endpoints, and report ROI, profit per eligible race, coverage, abstentions, refunds and date and largest-winner sensitivity. The 5–15 and 16–25 November splits are descriptive checks, with no tuning or independent validation claim. A1 and B failed economically, and A2's gain was limited to one price basis overall. V1 is the sole AW challenger warranted by this review.

[Supporting comparison tables](tissue-profitability-phase-2-tables-2026-11-26.md)
