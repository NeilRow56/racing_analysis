# Hurdle and Chase profitability development

**Phase 3 · 26 November 2026**

**Test one idea next: abstain from T2 in confirmed non-handicap Hurdles shorter than 18 furlongs.** This group lost **£228.56 from 703 bets in 2025** and **£134.98 from 488 in earlier 2026** at final SP. In November's frozen books, the improvement shrank to **£6.42 at SP and £1.52 at captured prices** when evaluated across every settled opportunity, including withdrawals. The historical consistency makes the rule worth testing. The smaller November gains make a live change premature.

Chase T3 in handicaps ranked second among the research ideas. It improved on T2 at SP in both historical years and in November, but lagged on the earlier verified-quote subset. Chase T1 in staying handicaps ranked third after its historical lead reversed in November. T2 remains the benchmark for both families.

## Coverage and baseline

The historical inventory comes from the local Sporting Life source snapshot through **20 November 2026**. A proved field reconciles the final stage, starter count, runner identities and outcomes. A full SP book supplies valid final SP for every proved starter. The two market columns distinguish audited archived quote books in the source inventory from all quote books actually usable with the reconstructed or stored predictions.

| Family / year | Source races | Handicap / non-handicap | Proved, full SP | Archive quote books | Ranked / matched T1–T3 SP | Ranked with pre-off quotes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Hurdle 2025 | 2,911 | 1,649 / 1,262 | 2,905 | 0 | 2,905 / 2,900 | 0 |
| Hurdle 2026 | 2,435 | 1,415 / 1,020 | 2,418 | 310 | 2,125 / 2,120 | 192 |
| Chase 2025 | 1,707 | 1,334 / 373 | 1,698 | 0 | 1,698 / 1,677 | 0 |
| Chase 2026 | 1,401 | 1,101 / 300 | 1,382 | 200 | 1,220 / 1,211 | 105 |

The inventory excluded 6, 17, 9 and 19 races respectively from proved settlement. No proved starter lacked SP. Ten short Hurdle fields and 30 short Chase fields across the historical replays lacked T3. Source going was missing in 3, 15, 5 and 16 races respectively. Ranked historical fields had distance, handicap and a going string, with ambiguous going retained separately. The 2026 Hurdle inventory has 293 proved fields without usable ranking evidence in the chosen caches or archived input books. The 2026 Chase inventory has 162 outside the stored promotion reference. Local historical coverage has known earlier result and timing gaps, including the superseded default 2026 Jump cache and missing Down Royal and Downpatrick database races. [Earlier coverage audit](racing-2025-2026-data-market-trainer-audit.md) · [Isolated 2026 cache evidence](../src/lib/racing/jump-candidate-reader.ts)

**Historical rankings.** The current Hurdle and Chase models first became available in their frozen form on 5 November. Hurdle 2025 and 2,031 Hurdle fields through 14 October 2026 are local frozen-coefficient replays using archived cache numerics and dated prior history. Another 94 Hurdles from 20 October–4 November reuse frozen Jump V1 inputs and quotes and replay the Hurdle context. All 94 race IDs overlap the Hurdle V2 context development set. The 2025 Chase reconstruction uses the same frozen Chase base on its development year. Earlier 2026 Chase uses the 1,220 stored Shadow probabilities through 29 October. The live Chase V2 adjustment is zero and the promotion reference informed model choice. These are analyses of historical starter fields and differ from forecasts issued over the original declarations. The 2025 and 2026 comparisons are retrospective, including the same-calendar sensitivity through 14 October. [Generation development and model lineage](tissue-generation-2026-11.md) · [Earlier Chase replay](chase-tissue-all-ranks-earlier-2026.md)

**November rankings.** The 5 November epoch supplies 255 Hurdle books and 150 Chase books. The 26 November snapshot, before the 14:02 UTC settlement batch, includes 238 and 140 settled races respectively, one void Hurdle and 16 Hurdle / 10 Chase pending. Complete captured books numbered 226 and 133 overall, of which 209 and 125 were settled. Original selection and price are frozen. Final SP was reconciled from the full result archive. These are genuine pre-off selections with exploratory policy analysis applied afterwards. [Phase 1 methods](tissue-profitability-phase-1-2026-11-26.md) · [Phase 2 benchmark](tissue-profitability-phase-2-2026-11-26.md)

| Family / cohort | Matched races and bets per rank | T1 £ / ROI | T2 £ / ROI | T3 £ / ROI |
| --- | ---: | ---: | ---: | ---: |
| Hurdle 2025 SP | 2,900 | −460.52 / −15.9% | −606.27 / −20.9% | −575.92 / −19.9% |
| Hurdle earlier 2026 SP | 2,120 | −403.17 / −19.0% | −316.69 / −14.9% | −437.64 / −20.6% |
| Hurdle historical combined SP | 5,020 | −863.70 / −17.2% | −922.96 / −18.4% | −1,013.56 / −20.2% |
| Hurdle November SP | 211 | −62.28 / −29.5% | −16.19 / −7.7% | −109.35 / −51.8% |
| Hurdle November captured | 184 | −53.57 / −29.1% | −9.02 / −4.9% | −104.72 / −56.9% |
| Chase 2025 SP | 1,677 | −146.01 / −8.7% | −129.73 / −7.7% | −15.40 / −0.9% |
| Chase earlier 2026 SP | 1,211 | −152.01 / −12.6% | −192.29 / −15.9% | −176.01 / −14.5% |
| Chase historical combined SP | 2,888 | −298.02 / −10.3% | −322.02 / −11.2% | −191.40 / −6.6% |
| Chase November SP | 114 | −9.69 / −8.5% | −8.88 / −7.8% | −4.48 / −3.9% |
| Chase November captured | 103 | −11.53 / −11.2% | +5.89 / +5.7% | −6.23 / −6.0% |

Matched rows require settled, priced T1–T3 on identical races within a price basis. The appendix gives bets, winners, strike, average and median winning prices, and A/E. Stakes are £1 win, using uncapped prices and fractional dead-heat credit for A/E. Captured P/L uses nominal archived quotes before bookmaker-specific deductions. SP has no role in reconstructing a missing quote. Historical quoted cohorts are selected by archive availability and should be compared with SP on those same boards. [Supporting comparisons](tissue-profitability-phase-3-tables-2026-11-26.md)

## Handicap, distance and going

**Hurdle.** T2 handicap SP ROI was **−16.3% in 2025 and −6.1% in earlier 2026**, compared with **−26.9% and −27.6% in non-handicaps**. On matched November SP it was **+8.7% versus −21.1%**. Historical T2 winners paid a median 4.00 and 4.33 in handicaps, compared with 2.63 and 2.75 in non-handicaps. The weaker non-handicap return is particularly consistent under 18 furlongs. Intermediate handicap T2 was strongly positive in earlier 2026 and November, while the 2025 group lost money and trailed T3. This supports testing a targeted exclusion before assuming intermediate races alone supply a permanent edge.

**Chase.** T2's handicap/non-handicap SP ROI flipped from **−4.9% / −18.5%** in 2025 to **−19.5% / −1.9%** in earlier 2026. T3 beat T2 in handicaps in both historical years and in November, with the more recent historical SP gain concentrated in staying handicaps. T1 also had a large advantage in staying handicaps in both historical years. November favoured T3 there and T1 fell behind. During both earlier years, intermediate trips were T2's least loss-making distance group. No universal Chase handicap exclusion follows.

The distance bands use recorded yards and round racing boundaries. Short is **under 3,960 yards (18f)**. Intermediate is 3,960 to under 4,840 yards for Hurdle and 3,960 to under 5,280 for Chase. Staying starts at **22f for Hurdle and 24f for Chase**. The same cutoffs apply across years. Going uses the primary recorded description, dropping a trailing parenthetical “in places” qualifier, and groups Good or faster, Good to Soft or Yielding, Soft, and Heavy. The table discloses the adjacent Irish descriptors and keeps ambiguous strings separate. Historical and November going observations use reported result metadata and serve as diagnostics. An exact going-based pre-off rule requires a timestamped exact going record.

Hurdle T2 beat T1 and T3 on Good to Soft / Yielding in both historical years, while T3 beat T2 on Heavy in both. The Heavy T3 profit in 2025 turned to loss in 2026, and November supplied six matched Heavy races. Chase's best relative ranks on Soft and Heavy changed across years. Handicap × going and distance × market tables show material pockets with small or inconsistent replication. Further subdividing them would make the estimates less reliable.

## Racecourse and market disagreement

**Courses.** At Ffos Las, Hurdle T2 made **£9.40 on 55 stakes and £15.38 on 45** across the two historical years. The returns after omitting its largest winners were **−£12.60 and +£1.38**. Huntingdon Hurdle T2 lost **£42.84 on 68 and £23.25 on 47**, and remained below comparable races at other courses after handicap and distance adjustment. In Chase, Kelso T2 made **£9.25 on 30 and £22.42 on 26**, while Newcastle lost **£19.50 on 30 and £21.00 on 21**, with zero Newcastle T2 winners in the second period. These differences retained their signs after the handicap × distance adjustment. The small samples and unadjusted going, field-strength and season differences make them diagnostic. Course × handicap tables require at least 20 matched races in each historical year within the same stratum. [Course comparisons](tissue-profitability-phase-3-courses-2026-11-26.md)

**Market disagreement.** T2 classified 7+ by final SP lost heavily in both historical years, including **−£195.00 across 307 Hurdles in 2025** and **−£74.00 across 254 in 2026**. The Hurdle group recorded **7 and 11 winners** against model expectations of **38.6 and 32.0**. Normalized market expectations were closer at 12.1 and 10.2. November captured prices tell a different story in the tiny outsider group: Hurdle T2 was **+£13.00 across 15**, from two winners, and fell to **−£3.00** without its largest. The Phase 2 market-top-three filter similarly failed to improve the overall SP cash result. These findings justify recording market disagreement prospectively as a covariate. Terminal SP rank is a retrospective proxy and cannot drive a pre-off policy.

Historical Hurdle handicap T1 averaged **4.3 percentage points above the normalized SP market** and delivered 569.5 fractional wins versus 563.0 market-expected on 2,893 bets, so the model was more bullish than the market and the market was close to realised wins. For Hurdle non-handicap T1, normalized market probability exceeded the model by 1.1 points on average. Chase handicap T1 also ran about 1.8 points above the market historically, with 558 wins against 530.1 market-expected and aggregate model A/E close to one. The direction depends on family and race type. There is no evidence here that the market systematically overvalues T1.

## Three ranked development ideas

Each rule retains frozen T2 outside its trigger, including unknown handicap or distance where relevant. For a switch, keep T2 if the target rank is absent at capture. Later withdrawals refund the original decision without reranking. All relative results below compare the full rule with T2 on the same eligible historic fields. Alternative largest-winner sensitivities remove the same race from both arms.

| Rank and exact trigger | 2025 SP affected / gain vs T2 | Earlier 2026 SP affected / gain | November matched SP affected / gain | November matched captured affected / gain |
| --- | ---: | ---: | ---: | ---: |
| **1 · Abstain on confirmed non-handicap Hurdles under 18f** | 703 / +£228.56 | 488 / +£134.98 | 48 / +£21.15 | 42 / +£22.02 |
| **2 · Switch to T3 on confirmed handicap Chases** | 1,322 / +£24.65 | 960 / +£49.99 | 85 / +£19.13 | 77 / +£6.25 |
| **3 · Switch to T1 on confirmed handicap Chases at 24f or longer** | 348 / +£75.21 | 242 / +£88.29 | 26 / −£10.75 | 24 / −£11.42 |

1. **Short non-handicap Hurdle abstention.** Combined historical policy P/L improved from **−£922.96 to −£559.41**, with 3,829 retained stakes and 236 T2 winners missed. Benefits persisted across the Jan–14 Oct calendar comparison in both years and were +£18.04 in the 192 earlier-2026 captured-quote opportunities. The margin is much smaller when evaluated on every settled November opportunity. At SP the candidate made **+£2.24 from 174 bets** versus −£4.18 from 228 for T2. At capture it made **+£12.85 from 152** versus +£11.33 from 200. The main risks are discovery on these same cohorts and selection on the matched three-starter population. Test the abstention on all new Hurdle opportunities with verifiable pre-off race metadata and retain the omitted T2 winners in the benchmark.
2. **Chase handicap T3.** The 2,282 affected historical T3 bets made **−£177.00** against −£251.64 for T2, and the full policy made **−£247.38** from 2,888 bets. On all November opportunities it gained **£11.92 SP and £16.05 captured**, while placing 130 SP bets and 119 captured bets. The largest T3 win reversed the 2025 matched SP gain when removed, and removing the biggest captured T3 win changes the November strict matched gain to −£1.75. Earlier verified quotes also show a **−£19.21** matched deficit. Fresh handicap Chase books paired at both prices, including withdrawals, are needed before advancing this idea.
3. **Staying handicap Chase T1.** In affected historical races T1 made **+£43.15 from 348** in 2025 and **+£1.56 from 242** in earlier 2026, against T2 losses of £32.06 and £86.72. Removing the largest T1 winner leaves a positive relative gap in each historical year, although the 2026 T1 bets themselves become loss-making. Both November bases and the earlier quote subset reversed the historical advantage. Treat this as a season and price hypothesis. Test it only if enough new staying handicap books cover multiple courses and a broader seasonal window, with both ranks priced pre-off.

## Next experiment and additional evidence

**Carry idea 1 into a fixed, read-only prospective comparison against unchanged T2.** Use new race IDs and predefine the next review before results, with a practical checkpoint of 150 qualifying abstention decisions across at least 30 distinct race dates. Score every eligible Hurdle with both policies, including unknown classifications, missing quotes, NR and void. Report captured and final-SP P/L separately, cash gain per opportunity, ROI per actual stake, opportunities forgone, winning T2 bets skipped and date concentration. The checkpoint is an operational target. The review should retain the original trigger while adding evidence across seasons.

The essential record is a verified **pre-off handicap flag, distance in yards, field and runner IDs, decision timestamp, frozen T2 and its quote or explicit missing reason**, followed by final SP and settlement status. The flags and distance must be linked to the exact race book. Credible captured-price analysis of the two Chase ideas additionally needs timestamped bookmaker quotes for the alternative rank from the same field and withdrawal/deduction evidence if estimating executable returns. A future going rule needs exact timestamped going with “in places” qualifiers and revisions. Extending the historical replay requires a compatible dated Jump feature cache after 14 October for Hurdles outside the archived-input subset, and historical Chase probability books outside the promotion reference. Pre-off roster and feature-publication provenance would be needed for genuinely as-of historical validation.

Phase 3 used existing read-only artifacts and frozen coefficients. Only the research deliverables were written to the repository.

[Supporting comparisons and replay provenance](tissue-profitability-phase-3-tables-2026-11-26.md) · [Course and course × handicap tables](tissue-profitability-phase-3-courses-2026-11-26.md)
