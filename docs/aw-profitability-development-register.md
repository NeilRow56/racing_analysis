# AW profitability development register

Develop one All Weather selection system on the frozen AW V3 scoring foundation. The objective is sustainable **£1 level-stakes final-SP profit**. Evaluate total P/L alongside ROI, bet volume and consistency across periods. Winner count, probability scores and ranking accuracy are supporting diagnostics. A version can lose money and still reveal which decisions improved returns.

## Frozen development baseline

Use original **AW V3 T1** as the primary reference. Record **T2 and T3** as separate reference series and retain every original rank, runner identity and settled outcome. Each reference backs its original ranked horse for £1 where available. A later withdrawal voids that ticket without promoting another runner. Use uncapped final SP with canonical dead-heat settlement and keep every genuine winner in primary P/L. The frozen scorer is the 95-input AW V2 base plus three contextual inputs, pinned by the AW V3 artifact checksum. Policy versions change how the original rankings are used. [Frozen model](../data/research/tissue-generation-2026-11-aw.json) · [Scoring inventory](aw-v3-same-or-component-research.md#1-component-inventory)

Each rank cell shows **bets / wins / £1 SP P/L / ROI**. These are the saved profit-first baseline populations.

| Population | Races | T1 | T2 | T3 |
| --- | ---: | --- | --- | --- |
| **H25** · 2025 reconstructed starter fields | 3,028 | 3,028 / 743 / −£321.45 / −10.62% | 3,028 / 514 / −£642.32 / −21.21% | 3,026 / 407 / −£692.44 / −22.88% |
| **H26** · reconstructed through 21 September 2026 | 1,947 | 1,947 / 497 / −£272.31 / −13.99% | 1,947 / 325 / −£392.16 / −20.14% | 1,945 / 281 / −£305.11 / −15.69% |
| Archived pre-off cards · 28 September–19 October | 134 | 132 / 34 / +£18.90 / +14.32% | 134 / 25 / −£20.85 / −15.56% | 133 / 14 / −£70.94 / −53.34% |
| Verified AW V2 inputs replayed through V3 · 20 October–4 November | 165 | 156 / 30 / −£54.50 / −34.94% | 159 / 28 / −£40.72 / −25.61% | 161 / 29 / +£27.95 / +17.36% |
| Original AW V3 pre-off captures · 5–20 November | 123 | 121 / 21 / −£40.32 / −33.32% | 123 / 29 / +£4.49 / +3.65% | 121 / 10 / −£49.13 / −40.60% |

H25 overlaps the AW V2 base fit. H25 and H26 use final starter rosters with unverified publication timing. The 41 H26 races with independently verified quote boards remain reconstructed model fields. Archived-card and V2 results apply AW V3 retrospectively to timestamped evidence. Only the last row represents original prospective V3 rankings. The 2026 data were previously explored and include AW V3 development exposure. The older same-OR and T2 studies used stricter common-stake filters and retained 403 pre-off-anchored races, including 121 original V3 fields. Use each study's denominators for its comparisons. [Baseline coverage and settlement](aw-profit-first-tissue-development-v1.md#populations-and-original-aw-v3) · [Older matched populations](aw-v3-same-or-component-research.md#2-frozen-reproduction-and-matched-coverage)

## Component research register

Historical rows below refer to H25 and H26 unless another population is named. A matched gain measures improvement over the reference on common races. Absolute P/L and the underlying population still determine economic usefulness.

| Component and role | 2025 evidence | 2026 reconstructed evidence | Pre-off evidence | What to carry forward |
| --- | --- | --- | --- | --- |
| **Same-OR Speed gap.** The signed V3 adjustment subtracts about 0.333 score units per 10 Best Last 3 AW Speed points above the mean of measured peers at the same OR. It rewards the opposite gap and is neutral without a usable peer comparison. | Zeroing it improved matched T1 by £45.57 and worsened T2 by £116.09. | Removal improved matched T1 by £7.15 and worsened T2 by £140.80. Selecting positive same-OR gaps as a policy improved T1 by £32.12 on 580 matched bets and still lost £86.64. | On the controlled study's 121 V3 fields, removal worsened T1 by £4.13 and improved T2 by £11.38. The T2 shadow diagnostic's separate 120-race result flipped negative without its biggest win. | **Keep as a rank-specific diagnostic.** OR, measured Speed and peer availability jointly determine the effect. Reversing the sign also produced inconsistent rank and price results across years. [Controlled removal](aw-v3-same-or-component-research.md#3-final-sp-results) · [T2 shadow](aw-v3-no-same-or-t2.md) · [Sign reversal](aw-v3-reversed-speed-adjustment.md#consistency-and-prospective-case) |
| **Missing Best Last 3 AW Speed.** AW V2 encodes numeric missingness and the V3 context adds a +0.3085 relative score bonus for missing Speed rank. The same-OR gap cannot activate without observed Speed. | Missing-Speed T2 returned −29.29% ROI. The measured-Speed policy improved matched T1 by £23.70 but lost £291.65. | Missing-Speed T2 returned −29.62%. The measured-Speed policy improved matched T1 by £32.89, still lost £228.87, and trailed T1 in the no-recorded-withdrawal slice. | Missing-Speed T2 returned −28.70% pooled. Removing the bonus improved T1 by £16.04 on 120 matched November fields, with all 19 T1 switches moving to measured Speed. The earlier archived V2 T1 uplift disappeared in the largest-winner sensitivity. | **Investigate jointly with recent performance.** Coverage and horse type influence missingness. Missing-Speed selections still won and sometimes performed well under Policy C, so absence by itself is weak grounds for overriding an individual pick. [T2 group results](aw-v3-t2-selection-diagnostic.md#fixed-feature-groups-and-positive-return-sensitivity) · [Isolated adjustment](aw-v3-isolated-adjustment-diagnostic.md) · [Measured-Speed policy](aw-profit-first-tissue-development-v1.md#verdict) |
| **Measured Speed and field rank 2–3.** The base uses AW Speed figures. V3 adds +0.1681 for a measured competition rank of 2 or 3. | Original T2 Speed leaders won more frequently than ranks 4+, yet returned −16.80%. T2 Speed ranks 2–3 returned −24.23%. | T2 leaders returned −15.05% and ranks 2–3 returned −19.50%. | T2 leaders made £5.26 from 48 and ranks 2–3 made £3.54 from 96 on the older pre-off-anchored sample. Both turned negative after removing their two largest winners. | **Keep measured Speed as corroboration.** Rank has more useful context than the raw figure alone. Surface exposure failed to make the rank-2–3 gate transfer. [T2 diagnostic](aw-v3-t2-selection-diagnostic.md#most-informative-features) · [Surface interaction](aw-profit-first-tissue-development-v1.md#verdict) |
| **Latest AW performance.** The frozen base includes the weight-adjusted figure and its missing flag. Policy C independently uses the field rank as a gate within original T1–T3. | Original T2 with top-three performance lost £215.65. Policy C lost £455.70 and trailed matched T1 by £181.94. | Original T2 with top-three performance lost £141.73. Policy C lost £110.34, but improved on matched T1 by £116.20 and T2 by £213.09. | Original T2 with top-three performance made £8.15 from 141 pooled bets, then −£10.85 without the two biggest winners. Policy C made £20.41 on 98 original V3 captures, including Berkshire Dream's £28.00 contribution. | **Highest priority for focused follow-up.** Relative form can identify better-paying replacements. Both 2025 switch groups lost to T1, and the two broad years remained negative. Test where the higher-ranked runners have weaker measured evidence. [T2 groups](aw-v3-t2-selection-diagnostic.md#fixed-feature-groups-and-positive-return-sensitivity) · [Policy C diagnostic](aw-recent-performance-policy-diagnostic.md) |
| **Official Rating, surface history and race conditions.** OR and recent same-surface exposure enter the base. OR also defines the signed Speed peer group. Stored class, trip and field size describe the race, and field size affects runner-specific draw fraction. | Every T2 OR rank or missingness group lost. The surface plus Speed-rank gate lost £315.53. | Every T2 OR group lost. The surface gate lost £205.00. Policy C improvement in large fields, low OR and Class 6 was mostly within groups. | The surface gate made £14.71 on archived cards and lost on both V2 and V3 capture replays. T2 Speed trend, trip and layoff findings varied. | **Keep for diagnosis and matching.** Avoid adding rules based on isolated cells. The positive T1 Speed-rank-2–3 subgroup with no recorded same-surface start had only 102 and 75 historical bets and at most seven bets per pre-off source. [Policy and subgroup results](aw-profit-first-tissue-development-v1.md#verdict) · [Policy C population comparison](aw-recent-performance-policy-diagnostic.md#why-2025-was-poor-and-early-2026-improved) |
| **Trainer prior rate.** The base combines trainer win rate and prior starts alongside other connection evidence. Policy E added the existing 15% trainer-rate gate to recent form. | Policy E lost £109.42 and trailed matched T1 by £85.92. | It lost £76.35 and trailed matched T1 by £47.78. It had fewer bets and a worse ROI than Policy C. | E made £46.08 on 32 original V3 bets and £6.45 on 42 V2 replay bets. V3 P/L fell to £8.08 without its two largest winners. | **Record as a secondary interaction.** Small and concentrated pre-off gains warrant retaining the observation, while broad matched losses make it a lower priority. [Policy E results](aw-profit-first-tissue-development-v1.md#development-and-unchanged-replay) |
| **Verified market rank.** A timestamped comparison signal outside the frozen scorer. Policy D takes the highest Tissue-ranked favourite within T1–T3 on a complete verified board. | Zero qualifying boards. | Only 41 verified boards. D lost £1.13 from 34 bets. | D made £3.78 from 84 original V3 bets and lost on the earlier card and V2 populations. In the older T2 study, favourite T2s pooled across pre-off sources made £21.67 from 89, or £13.17 without the top two wins, while the V2-archive subgroup lost. | **Keep as an independent comparator when verified coverage permits.** Policy D and the fixed T2 subgroup have different eligibility. Final SP bands describe settlement and any rule using final SP to choose a horse is hindsight-only. [Market rank diagnostic](aw-v3-t2-selection-diagnostic.md#most-informative-features) · [Policy D comparison](aw-profit-first-tissue-development-v1.md#comparison-on-identical-races) |

Earlier AW-wide results also show the limits of picking winners. In the separate historical profitability audit, both independent top-rank AW policies lost in 2025 and 2026 despite different win counts. The earlier AW V3 long-price audit found losses at both T1 and T2 in its captured 8/1+ slice, while individual outsiders made material contributions in newer comparisons. These are separate study populations. The broader lesson is to measure the return of the switches and their price concentration alongside the selection count. [Historical AW results](full-history-profitability-model-research.md) · [Long-priced AW selections](tissue-long-priced-selection-explanations.md)

## Versioned development

Use `AW_PROFIT_V1`, `AW_PROFIT_V2`, `AW_PROFIT_V3` and successive integers for **selection policies**. `AW_TISSUE_V3` is the frozen scoring reference. Register the exact rule before evaluation, link its predecessor and preserve its completed record. A material rule change gets a new version. If a branch fails, keep its observed effects, subgroup evidence and weaknesses in this register, and carry forward only the findings that support the next hypothesis.

For each version record:

1. **Identity and hypothesis.** Version, previous version, status, source/model pins, component or interaction under study, expected profit mechanism and relevant prior evidence.
2. **Exact rule.** Inputs and as-of timing, eligible field, rank and tie handling, missing-data branches, abstentions, voids and reference comparators.
3. **Development and replay.** 2025 development and 2026 unchanged replay reported separately, with dates, source, eligible races, bets, wins, voids, abstentions, £1 SP P/L and ROI. Partition reconstructed, timestamped-input and original V3 capture results.
4. **Matched effects.** Compare with the predecessor and original T1/T2 on identical eligible races. Show both all-eligible policy returns and common-settled-pair returns. Report switch counts, winning-profit and losing-stake changes, and P/L by period.
5. **Concentration and learning.** Keep all genuine wins in headline P/L. Report the largest winning contributions, their share and separate ticket-removal and paired-race sensitivity. Record what transferred, what failed and what remains worth investigating.

### AW_PROFIT_V1 · Policy C, completed research predecessor

The original frozen ranks are the reference. V1 takes the first of original T1–T3 whose measured latest AW performance ranks in the top three of the full original field, using competition ties. It abstains if none qualifies. This is a register name for the existing completed Policy C.

| Population | Bets / wins | £1 SP P/L / ROI | Matched change vs T1 / T2 |
| --- | --- | --- | --- |
| H25 development | 2,544 / 558 | −£455.70 / −17.91% | −£181.94 / −£6.07 |
| H26 unchanged replay | 1,650 / 422 | −£110.34 / −6.69% | +£116.20 / +£213.09 |
| Archived cards | 98 / 25 | +£2.38 / +2.43% | −£23.13 / +£14.06 |
| AW V2 inputs replayed through V3 | 117 / 26 | −£17.45 / −14.91% | +£19.70 / +£14.66 |
| Original V3 captures | 98 / 25 | +£20.41 / +20.83% | +£47.18 / +£14.64 |

The largest and second-largest winning tickets contributed £18 and £16 in H25, £28 and £14 in H26, and £28 and £10 on original V3 captures. The V3 replay loses £7.59 without Berkshire Dream alone. H26's T1 advantage survives removing the Wild Berries race from both sides (+£87.20), while H25 and H26 both lost money overall. Keep the 2026 evidence that better-paying replacements can improve on frozen T1 with fewer winners. Identify when the replacement condition holds up beyond the existing samples. [Matched switch and winner analysis](aw-recent-performance-policy-diagnostic.md) · [Full concentration tables](aw-profit-first-tissue-development-v1.md#outsiders-and-winner-concentration)

### AW_PROFIT_V2 · Original proposal (pre-test record)

**Predecessor:** `AW_PROFIT_V1`. **Single change:** require measured Speed corroboration for a Policy C switch away from T1.

Calculate the existing V1 pick. Keep its T1 pick or abstention unchanged. If V1 selects T2 or T3, keep that switch only when the selected runner has measured Best Last 3 AW Speed **and every higher original Tissue-ranked runner it skipped lacks that Speed figure**. Otherwise use original T1. The existing performance gate already requires the skipped horses to have no usable latest performance or to rank outside the performance top three. Use the frozen missing flag and full original field. A later withdrawal voids the choice without substitution.

The hypothesis is that replacing a higher-ranked horse makes more financial sense when its recent-performance evidence fails the existing gate **and** its Best Last 3 Speed is missing, while the replacement has both measures. This may preserve useful T1 selections with measured Speed and still permit switches such as Berkshire Dream. There is also a real cost to test. V1's H26 switches away from T1 with a measured performance outside the top three gained £69.62, and the proposed gate could give back some of that gain. The published £46.58 improvement when T1 lacked latest performance is a separate diagnostic and does not establish the result of this joint rule. [Policy C switch breakdown](aw-recent-performance-policy-diagnostic.md#where-the-11620-came-from) · [Frozen missing-Speed evidence](aw-v3-isolated-adjustment-diagnostic.md)

When authorised, evaluate this exact rule once using the existing saved fields and settlement results. Record H25 development and unchanged H26 replay, then the three pre-off-evidence sources separately. Compare V2 with V1 and frozen T1/T2 on common settled races. Show the full-policy results and the races where V2 restored T1 so the incremental P/L is auditable. Report volume, temporal spread and winner concentration before judging whether the change earns a place in the next version. `AW_PROFIT_V3` is reserved for a subsequently authorised change informed by the V2 evidence.

### AW_PROFIT_V2 · Completed experiment

**Predecessor:** `AW_PROFIT_V1` (Policy C). **Tested rule:** start with frozen T1 and compute Policy C exactly as in V1. Accept a T2 or T3 replacement only if it has a measured Best Last 3 AW Speed and every higher original Tissue runner bypassed has that figure marked missing. Otherwise back T1. The authorised definition therefore adds T1 bets on V1 abstention races. The original proposal above would have kept those abstentions. The tables isolate the effect of that difference. Selection uses original rank order and the saved pre-race field. Later withdrawals void the ticket without reranking or substitution. The rule was fixed before running either year's comparison.

#### Actual £1 final-SP returns

All three policies received the same eligible scoring fields within each cohort. Bets exclude voids and abstentions. A switch is a selection of a different horse from original T1, including a switched pick that later voids. Winning switches and switch P/L use the settled switched tickets. The incremental value against T1 is shown separately below.

| Cohort | Policy | Races | Bets | Wins | Void / no bet | Actual P/L | ROI | Switches / settled | Winning switches | Switch-ticket P/L |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| H25 | Frozen T1 | 3,028 | 3,028 | 743 | 0 / 0 | −£321.45 | −10.62% | 0 / 0 | 0 | £0.00 |
| H25 | V1 | 3,028 | 2,544 | 558 | 0 / 484 | −£455.70 | −17.91% | 1,114 / 1,114 | 186 | −£322.34 |
| H25 | V2 | 3,028 | 3,028 | 710 | 0 / 0 | −£362.62 | −11.98% | 297 / 297 | 54 | −£99.90 |
| H26 | Frozen T1 | 1,947 | 1,947 | 497 | 0 / 0 | −£272.31 | −13.99% | 0 / 0 | 0 | £0.00 |
| H26 | V1 | 1,947 | 1,650 | 422 | 0 / 297 | −£110.34 | −6.69% | 680 / 680 | 135 | −£81.06 |
| H26 | V2 | 1,947 | 1,947 | 496 | 0 / 0 | −£219.12 | −11.25% | 177 / 177 | 39 | −£10.51 |
| Card | Frozen T1 | 134 | 132 | 34 | 2 / 0 | +£18.90 | 14.32% | 0 / 0 | 0 | £0.00 |
| Card | V1 | 134 | 98 | 25 | 1 / 35 | +£2.38 | 2.43% | 42 / 42 | 7 | −£3.50 |
| Card | V2 | 134 | 132 | 35 | 2 / 0 | +£21.65 | 16.40% | 11 / 11 | 3 | +£4.25 |
| V2 archive | Frozen T1 | 165 | 156 | 30 | 9 / 0 | −£54.50 | −34.94% | 0 / 0 | 0 | £0.00 |
| V2 archive | V1 | 165 | 117 | 26 | 4 / 44 | −£17.45 | −14.91% | 61 / 59 | 11 | −£5.68 |
| V2 archive | V2 | 165 | 156 | 27 | 9 / 0 | −£64.00 | −41.03% | 22 / 20 | 2 | −£12.25 |
| V3 | Frozen T1 | 123 | 121 | 21 | 2 / 0 | −£40.32 | −33.32% | 0 / 0 | 0 | £0.00 |
| V3 | V1 | 123 | 98 | 25 | 2 / 23 | +£20.41 | 20.83% | 54 / 53 | 16 | +£32.75 |
| V3 | V2 | 123 | 120 | 27 | 3 / 0 | +£16.15 | 13.46% | 29 / 28 | 11 | +£38.42 |

#### Same-race comparisons and switch attribution

On the common settled set, all three policies staked £1 on every listed race. The separate V2 versus T1 column also includes paired, settled races where V1 abstained.

| Cohort | All-three common bets | T1 wins / P/L / ROI | V1 wins / P/L / ROI | V2 wins / P/L / ROI | V2 minus V1 on common bets | V2 vs T1 on all settled pairs |
| --- | --- | --- | --- | --- | --- | --- |
| H25 | 2,544 | 623 / −£273.76 / −10.76% | 558 / −£455.70 / −17.91% | 590 / −£314.94 / −12.38% | +£140.77 | 3,028 / −£41.18 |
| H26 | 1,650 | 424 / −£226.54 / −13.73% | 422 / −£110.34 / −6.69% | 423 / −£173.36 / −10.51% | −£63.02 | 1,947 / +£53.18 |
| Card | 98 | 26 / +£25.50 / 26.02% | 25 / +£2.38 / 2.43% | 27 / +£28.25 / 28.83% | +£25.88 | 132 / +£2.75 |
| V2 archive | 113 | 23 / −£33.15 / −29.33% | 26 / −£13.45 / −11.90% | 21 / −£39.65 / −35.09% | −£26.20 | 154 / −£6.50 |
| V3 | 98 | 18 / −£26.77 / −27.31% | 25 / +£20.41 / 20.83% | 24 / +£28.70 / 29.29% | +£8.29 | 120 / +£55.47 |

The table below attributes the V2 switch effect on races where both V2 and T1 settled. Each exclusive-winner cell shows **races / paired P/L difference**, including the other horse's losing £1 stake. Neither side won on the remaining changed pairs and no changed pair had two dead-heat winners.

| Cohort | Common settled switches | Replacement alone won | T1 alone won | Both lost | Net paired switch P/L |
| --- | --- | --- | --- | --- | --- |
| H25 | 297 | 54 / +£197.10 | 87 / −£238.27 | 156 | −£41.18 |
| H26 | 177 | 39 / +£166.49 | 40 / −£113.31 | 98 | +£53.18 |
| Card | 11 | 3 / +£15.25 | 2 / −£12.50 | 6 | +£2.75 |
| V2 archive | 18 | 2 / +£7.75 | 4 / −£14.25 | 12 | −£6.50 |
| V3 | 28 | 11 / +£66.42 | 5 / −£10.95 | 12 | +£55.47 |

Restoring T1 on V1 switch races helped in H25, the archived-card cohort and the original V3 capture cohort. It hurt in H26 and in the V2 archive. The separate fallback on V1 abstentions lost money in each cohort.

| Cohort | V1 switches reverted to T1 | Both picks settled | P/L change on those pairs | P/L change incl. voids | Added T1 bets on V1 abstentions | P/L on added bets | Full V2 minus V1 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| H25 | 817 | 817 | +£140.77 | +£140.77 | 484 | −£47.68 | +£93.08 |
| H26 | 503 | 503 | −£63.02 | −£63.02 | 297 | −£45.77 | −£108.78 |
| Card | 31 | 31 | +£25.88 | +£25.88 | 34 | −£6.60 | +£19.28 |
| V2 archive | 39 | 37 | −£26.20 | −£24.20 | 41 | −£22.35 | −£46.55 |
| V3 | 25 | 25 | +£8.29 | +£8.29 | 22 | −£12.56 | −£4.26 |

In H25, the largest favourable permitted switch was to Beach Partee (9/1), worth £10.00 versus Go Lockers Go. The largest adverse switch was away from Persian Spirit (9/1) to Shallow, costing £10.00. Restoring Little Bittern (25/1) instead of V1's A Fine Claret gained £26.00.

In H26, Wild Berries gained £29.00 versus Aiteall and Star Marian at 12/1 gained £13.00 versus Overbudget. Replacing 8/1 winner Melting Snow with Khepri cost £9.00. Among rejected V1 moves, restoring Glistening gained £15.00, while passing over Londoner and Landlordtothestars cost £15.00 apiece.

Across the timestamped sources, Marhaba Ya Tayib contributed the largest favourable archived-card switch (+£8.50). Electric Gambler gained £5.00 in the archived V2 replay, while passing over V1's Society Kiss cost £21.00. On original V3 captures, after Berkshire Dream, Ala Et Prece was the biggest favourable permitted switch (+£7.00). Leaving Prince Of Peppard for Marcescence was the biggest adverse permitted switch (−£3.75). On a rejected switch, restoring Thai Baht instead of V1's Quiet Soul gained £10.00.

#### Largest-winner sensitivity

All genuine winners are in the actual results, including Berkshire Dream and Wild Berries at 28/1. Removing one or two tickets here also removes their stakes. The share column uses total net contributions from winning tickets as its denominator.

<details>
<summary>Winner concentration by cohort and policy</summary>

| Cohort | Policy | Largest winner | Second largest | P/L less largest | P/L less both | Top two share of winning P/L |
| --- | --- | --- | --- | --- | --- | --- |
| H25 | Frozen T1 | Little Bittern (+£25.00) | Golden Mind (+£22.00) | −£346.45 | −£368.45 | 2.39% |
| H25 | V1 | Azure Angel (+£18.00) | Emaculate Soldier (+£16.00) | −£473.70 | −£489.70 | 2.22% |
| H25 | V2 | Little Bittern (+£25.00) | Golden Mind (+£22.00) | −£387.62 | −£409.62 | 2.40% |
| H26 | Frozen T1 | Grey Fable (+£22.00) | Glistening (+£14.00) | −£294.31 | −£308.31 | 3.06% |
| H26 | V1 | Wild Berries (+£28.00) | Londoner (+£14.00) | −£138.34 | −£152.34 | 3.76% |
| H26 | V2 | Wild Berries (+£28.00) | Grey Fable (+£22.00) | −£247.12 | −£269.12 | 4.06% |
| Card | Frozen T1 | Ice Show (+£12.00) | Variety Act (+£11.00) | +£6.90 | −£4.10 | 19.67% |
| Card | V1 | Cool King (+£11.00) | Benvoy (+£8.50) | −£8.62 | −£17.12 | 25.87% |
| Card | V2 | Ice Show (+£12.00) | Variety Act (+£11.00) | +£9.65 | −£1.35 | 19.38% |
| V2 archive | Frozen T1 | Paradise Walk (+£6.00) | Carrigans Grove (+£5.50) | −£60.50 | −£66.00 | 16.08% |
| V2 archive | V1 | Society Kiss (+£20.00) | Carrigans Grove (+£5.50) | −£37.45 | −£42.95 | 34.67% |
| V2 archive | V2 | Paradise Walk (+£6.00) | Carrigans Grove (+£5.50) | −£70.00 | −£75.50 | 17.69% |
| V3 | Frozen T1 | Amandari (+£10.00) | Thai Baht (+£9.00) | −£50.32 | −£59.32 | 31.84% |
| V3 | V1 | Berkshire Dream (+£28.00) | Amandari (+£10.00) | −£7.59 | −£17.59 | 40.68% |
| V3 | V2 | Berkshire Dream (+£28.00) | Amandari (+£10.00) | −£11.85 | −£21.85 | 34.82% |

</details>

#### Validation and decision

- **Berkshire Dream qualified.** On 5 November at Chelmsford City, original T3 Berkshire Dream had the second-ranked latest AW performance (51.48) and measured Best Last 3 AW Speed of 86.48. T1 Tough Decision and T2 Galimix both lacked the Speed figure. The 28/1 win contributed £28.00 to V2 and gained £29.00 versus losing T1. The V3 matched gain over T1 was still £26.47 after removing that pair, while V2's absolute return fell to −£11.85 after removing the ticket.
- **Rank, timing and settlement.** Original T1/T2 IDs matched the saved controlled replay, including the previously excluded withdrawal rows. Original V3 selections also matched the captured Tissue ranks. Recomputed Speed and performance ranks from the saved books matched the selection rows, and Speed availability agreed with the frozen missing flags. The selector used original ranks and pre-race form inputs only. Timestamped sources passed feature-cutoff and pre-off capture checks. Historical feature rows contained strictly prior run dates where available and no market price inputs. Reconstructed starter fields still carry the publication and withdrawal-timing limitations above. Reconciled final SP and dead-heat-adjusted settlement matched every priced ticket. V2 had 2, 9 and 3 voids across the three timestamped sources respectively. In the original V3 cohort the extra void was Celtic Comet, a permitted switch away from losing T1 Drive On There. This explains the £1 difference between the full-cohort P/L gap and the settled-pair gap.
- **Hypothesis supported in limited settings.** The permitted switches improved on T1 by £53.18 in H26 and £55.47 on the original V3 captures. H26 improved in five of nine calendar months, but its matched gain fell to £0.41 across 1,175 races with no recorded withdrawals. The gate cost £41.18 against T1 in H25 and £6.50 on settled pairs in the V2 archive. On identical H26 bets it gave back £63.02 against V1. The original V3 sample favoured the gate by £8.29 on the three-way matched set, and its absolute profit depended on Berkshire Dream. The corroboration requirement has some value against T1, with insufficient evidence of reliable improvement over V1 or repeatable absolute profitability. The 2026 replay periods were previously explored.

**Next hypothesis for separate authorisation:** On independent pre-off books, test whether allowing Policy C to abstain improves £1 SP returns when the conditional switch policy finds no C candidate. Keep every other V2 decision fixed. The existing fallback lost money in all five cohorts, including £45.77 on 297 H26 bets and £12.56 on 22 settled original V3 bets. The next comparison should isolate this single fallback decision on new evidence. [Baseline research and source definitions](aw-profit-first-tissue-development-v1.md) · [Policy C audit](aw-recent-performance-policy-diagnostic.md)

### AW_PROFIT_V3 · Completed abstention experiment

**Predecessor:** `AW_PROFIT_V2`. **Single change:** When Policy C returns no candidate, abstain. When Policy C returns a candidate, copy the V2 decision, including its measured-Speed requirement, any T1 fallback and any subsequent void. The frozen scorer, Policy C criteria and V2 switch gate are the same throughout.

#### Actual P/L on the same eligible race universe

Each P/L difference is the row's actual return minus the named reference's actual return across the full cohort. Each policy's ROI uses its own settled £1 stakes. H25 is the 2025 reconstruction, H26 is the reconstruction through 21 September 2026, and November captures are the original AW V3 pre-off books dated 5–20 November 2026.

| Cohort | Policy | Eligible | Bets | Abstentions | Voids | Wins | Actual P/L | ROI | Δ vs V2 | Δ vs V1 | Δ vs T1 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| H25 | Frozen T1 | 3,028 | 3,028 | 0 | 0 | 743 | −£321.45 | −10.62% | +£41.18 | +£134.26 | £0.00 |
| H25 | V1 | 3,028 | 2,544 | 484 | 0 | 558 | −£455.70 | −17.91% | −£93.08 | £0.00 | −£134.26 |
| H25 | V2 | 3,028 | 3,028 | 0 | 0 | 710 | −£362.62 | −11.98% | £0.00 | +£93.08 | −£41.18 |
| H25 | V3 | 3,028 | 2,544 | 484 | 0 | 590 | −£314.94 | −12.38% | +£47.68 | +£140.77 | +£6.51 |
| H26 | Frozen T1 | 1,947 | 1,947 | 0 | 0 | 497 | −£272.31 | −13.99% | −£53.18 | −£161.97 | £0.00 |
| H26 | V1 | 1,947 | 1,650 | 297 | 0 | 422 | −£110.34 | −6.69% | +£108.78 | £0.00 | +£161.97 |
| H26 | V2 | 1,947 | 1,947 | 0 | 0 | 496 | −£219.12 | −11.25% | £0.00 | −£108.78 | +£53.18 |
| H26 | V3 | 1,947 | 1,650 | 297 | 0 | 423 | −£173.36 | −10.51% | +£45.77 | −£63.02 | +£98.95 |
| November captures | Frozen T1 | 123 | 121 | 0 | 2 | 21 | −£40.32 | −33.32% | −£56.47 | −£60.73 | £0.00 |
| November captures | V1 | 123 | 98 | 23 | 2 | 25 | +£20.41 | 20.83% | +£4.26 | £0.00 | +£60.73 |
| November captures | V2 | 123 | 120 | 0 | 3 | 27 | +£16.15 | 13.46% | £0.00 | −£4.26 | +£56.47 |
| November captures | V3 | 123 | 98 | 23 | 2 | 24 | +£28.70 | 29.29% | +£12.56 | +£8.29 | +£69.03 |

#### Matched settled bets

A matched comparison uses only races where both policies staked a settled £1. The common V3 set was identical for all three pairings within each cohort. The number of different horses is measured against the reference in that row.

| Cohort | Reference | Common bets | Different horses | V3 wins / P/L / ROI | Reference wins / P/L / ROI | V3 P/L difference |
| --- | --- | --- | --- | --- | --- | --- |
| H25 | Frozen T1 | 2,544 | 297 | 590 / −£314.94 / −12.38% | 623 / −£273.76 / −10.76% | −£41.18 |
| H25 | V1 | 2,544 | 817 | 590 / −£314.94 / −12.38% | 558 / −£455.70 / −17.91% | +£140.77 |
| H25 | V2 | 2,544 | 0 | 590 / −£314.94 / −12.38% | 590 / −£314.94 / −12.38% | £0.00 |
| H26 | Frozen T1 | 1,650 | 177 | 423 / −£173.36 / −10.51% | 424 / −£226.54 / −13.73% | +£53.18 |
| H26 | V1 | 1,650 | 503 | 423 / −£173.36 / −10.51% | 422 / −£110.34 / −6.69% | −£63.02 |
| H26 | V2 | 1,650 | 0 | 423 / −£173.36 / −10.51% | 423 / −£173.36 / −10.51% | £0.00 |
| November captures | Frozen T1 | 98 | 28 | 24 / +£28.70 / 29.29% | 18 / −£26.77 / −27.31% | +£55.47 |
| November captures | V1 | 98 | 25 | 24 / +£28.70 / 29.29% | 25 / +£20.41 / 20.83% | +£8.29 |
| November captures | V2 | 98 | 0 | 24 / +£28.70 / 29.29% | 24 / +£28.70 / 29.29% | £0.00 |

#### What removing the forced T1 bets saved

| Cohort | Races now skipped | Former V2 bets | Former V2 voids | Winning bets / P/L | Losing bets / P/L | Former V2 ROI | V3 profit saved |
| --- | --- | --- | --- | --- | --- | --- | --- |
| H25 | 484 | 484 | 0 | 120 / +£316.32 | 364 / −£364.00 | −9.85% | +£47.68 |
| H26 | 297 | 297 | 0 | 73 / +£178.23 | 224 / −£224.00 | −15.41% | +£45.77 |
| November captures | 23 | 22 | 1 | 3 / +£6.44 | 19 / −£19.00 | −57.07% | +£12.56 |

V3's gain over V2 is entirely the net loss avoided on the removed group. It avoided losing stakes and also gave up real winning returns. There was no change to the horse on any shared bet. The V1 comparison isolates the existing V2 switch decisions because V1 and V3 placed the same number of settled bets on the same races. V3's matched improvement over frozen T1 in H26 and November comes from those inherited switches.

#### Winner concentration

All genuine winning selections are included in the primary returns. The two sensitivities below remove the winning ticket and its stake. The concentration share uses net contributions from all winning tickets as the denominator.

| Cohort | Largest V3 winner | Second largest | Actual V3 P/L | P/L less largest | P/L less both | Top two share of winning P/L |
| --- | --- | --- | --- | --- | --- | --- |
| H25 | Little Bittern (+£25.00) | Cardinal Point (+£22.00) | −£314.94 | −£339.94 | −£361.94 | 2.87% |
| H26 | Wild Berries (+£28.00) | Glistening (+£14.00) | −£173.36 | −£201.36 | −£215.36 | 3.99% |
| November captures | Berkshire Dream (+£28.00) | Amandari (+£10.00) | +£28.70 | +£0.70 | −£9.30 | 37.00% |

#### Validation and interpretation

- **Decision and settlement parity.** The saved V2 race rows were checksum-verified and the T1, V1 and V2 totals reconciled to the previous experiment. Every V3 decision either retained the exact V2 pick and its saved settlement or abstained when V1 recorded no candidate. The rule reads only that pre-race decision and the saved V2 pick. It uses no result, final price or later withdrawal to decide. In November, Celtic Comet and Roosike retained their void status. Super Hit moved from a void V2 fallback to a V3 abstention, which changed neither stakes nor P/L.
- **Berkshire Dream stayed eligible.** The retained T3 had measured Best Last 3 AW Speed, while both bypassed runners lacked it. Its 28/1 win contributed £28.00. Wild Berries' 28/1 win also remained in the H26 result. November's observed profit falls to £0.70 without Berkshire Dream and to a £9.30 loss without the two biggest winners.
- **Abstention improved total P/L against V2 in both broad years.** H25 saved £47.68 even as ROI moved from −11.98% to −12.38%. Its omitted bets lost money at a lower rate than the remaining bets. H26 saved £45.77 and improved ROI from −11.25% to −10.51%. The removed group lost money in eight of twelve H25 months and seven of nine H26 months. November saved £12.56.
- **The remaining bets have mixed economic value.** V3 beat V1 by £140.77 in H25 and £8.29 in November, but trailed it by £63.02 in H26 on identical stakes. It improved total P/L over original T1 in all three cohorts. On common settled races it trailed T1 in H25 by £41.18 and beat it in H26 and November. Both broad V3 samples still lost money. The useful finding is that the forced fallback reduced total P/L across these saved populations. The inherited switch gate remains inconsistent against V1, and the November profit is concentrated.

The abstention hypothesis is supported in the saved development populations. The 2025 and 2026 results have been repeatedly examined. In November the **AW V3 inputs** were captured before the off and the **AW_PROFIT_V3 selections** were replayed later. A prospective evaluation requires the unchanged policy's choices and abstentions to be frozen before future race outcomes are known. [Frozen input and settlement context](aw-profit-first-tissue-development-v1.md) · [Policy C audit](aw-recent-performance-policy-diagnostic.md)

### AW_PROFIT_V3 · Prospective shadow

**Status:** ARMED on 21 November 2026 at **13:12:53.086 GMT** (`2026-11-21T13:12:53.086Z`). The initial ledger contained zero observations, bets or settlements. The three recorded series are frozen `AW_TISSUE_V3` T1, `AW_PROFIT_V1` and `AW_PROFIT_V3`. The completed historical experiment above remains the development record. [Versioned selector](../src/lib/racing/aw-profit-policy.ts) · [Shadow ledger and settlement](../src/lib/racing/aw-profit-shadow.ts)

**First eligible scheduled collection:** Sunday **22 November 2026**, starting at **08:00 GMT**, subject to a successful morning run and eligible pre-off books. Lingfield has an All-Weather fixture that day. The existing loaded local collection and settlement agents use the research wrapper, which detects the armed ledger and runs the shadow after their existing workflows. The scheduled collection for 21 November had already completed. [Lingfield fixture](https://www.lingfieldpark.co.uk/whats-on/sunday-afternoon-november-all-weather-racing-2026) · [Automation wrapper](../scripts/local-automation.ts)

- **Capture.** Record the first eligible AW book once per race. The scheduled wrapper uses newly saved original AW V3 books from its current collection run, after the shadow was armed. At decision time the scheduled off must still be ahead, the current race stage must be pre-off, and the active runner and horse IDs must agree with the saved book. Expired or unverified books are skipped. The scheduled wrapper does not retry earlier runs.
- **Frozen evidence.** The separate ledger records race and runner IDs, original ranks and probabilities, the exact policy versions and choices (including abstentions), latest AW performance and its field rank, measured Best Last 3 AW Speed or its missing state, available bookmaker quotes and their median, source capture time, feature cutoff and research decision time. Quotes are retained even on incomplete boards and play no part in selection. Atomic writes preserve the first decision and any existing settlement.
- **Settlement.** Check terminal result evidence against recorded runner identities. Reconcile the final fractional SP from the full-result ride to the stored result before applying canonical £1 settlement with dead-heat deductions. Missing or conflicting evidence remains pending. Voids and non-runners carry no stake. The summary reports abstentions, pending selections, settled bets, wins, £1 SP P/L and ROI with no price cap.
- **Activation verification.** Five shadow tests and three targeted scheduler tests passed. The frozen AW model and existing epoch source pins matched. Activation created only the empty shadow ledger at `data/research/aw-profit-shadow-v1.json`. The existing scheduler configuration, collectors and prior records remained unchanged. Historical captures were excluded. `bun run scripts/track-aw-profit-shadow.ts summary` reads the shadow's status and returns.
- **Weekly backup.** Version 5 archives the shadow ledger byte for byte with the observations and settlements present at backup time. It also preserves the selector, ledger implementation, collector and scheduler wrapper. [Weekly backup and restore](backup-restore.md)

### Controlled comparison of V1 and V3

Use only common settled races where V1 and V3 selected different horses, from the same saved H25 and H26 fields. V3 restored original T1 on every such race. In both years V1 and V3 had identical bet coverage, so these differences account for their entire P/L gap. Final SP describes settlement. All winners are included.

| Population | Different races | V1 wins / £1 P/L / ROI | V3 wins / £1 P/L / ROI | V3 alone won / paired gain | V1 alone won / paired loss | Neither won | Net V3 minus V1 |
| --- | ---: | --- | --- | --- | --- | ---: | ---: |
| H25 | 817 | 132 / −£222.44 / −27.23% | 164 / −£81.67 / −10.00% | 164 / +£735.33 | 132 / −£594.56 | 521 | +£140.77 |
| H26 | 503 | 96 / −£70.55 / −14.03% | 97 / −£133.57 / −26.55% | 97 / +£369.43 | 96 / −£432.45 | 310 | −£63.02 |

No differing pair contained two winners. In H25, V3 gained £108.77 on winning tickets and saved £32.00 in losing stakes. In H26, V3 saved £1.00 in losing stakes and gave up £64.02 on winning tickets. The largest favourable H25 reversion, Little Bittern versus A Fine Claret, was worth £26.00 of the gain. Removing that race from both sides leaves +£114.77. In H26, keeping Londoner or Landlordtothestars would each have recovered £15.00. Removing one of these pairs from both sides still leaves V3 £48.02 behind.

| Population | Selection | Measured Best Last 3 AW Speed | Median measured Speed | Measured latest AW performance | Median measured performance / field rank | Median SP | Mean winning SP |
| --- | --- | ---: | ---: | ---: | --- | ---: | ---: |
| H25 | V1 replacement | 722 / 817 (88.4%) | 103.68 | 817 / 817 | 67.79 / 2 | 4.50/1 | 3.50/1 |
| H25 | V3 restored T1 | 735 / 817 (90.0%) | 99.59 | 771 / 817 | 56.73 / 6 | 4.50/1 | 3.48/1 |
| H26 | V1 replacement | 445 / 503 (88.5%) | 103.05 | 503 / 503 | 67.11 / 2 | 4.50/1 | 3.50/1 |
| H26 | V3 restored T1 | 452 / 503 (89.9%) | 99.02 | 476 / 503 | 55.42 / 5 | 3.60/1 | 2.81/1 |

| Final SP band | H25 V1 bets / P/L | H25 V3 bets / P/L | H26 V1 bets / P/L | H26 V3 bets / P/L |
| --- | --- | --- | --- | --- |
| Under 2/1 | 87 / +£5.74 | 115 / +£0.34 | 71 / +£5.37 | 78 / −£3.65 |
| 2/1 to under 5/1 | 332 / −£52.67 | 316 / +£28.99 | 202 / −£39.42 | 235 / −£6.92 |
| 5/1 to under 8/1 | 186 / −£95.00 | 166 / −£52.50 | 91 / +£8.00 | 71 / −£28.00 |
| 8/1 to under 20/1 | 181 / −£49.50 | 159 / −£67.50 | 110 / −£15.50 | 90 / −£66.00 |
| 20/1 and longer | 31 / −£31.00 | 61 / +£9.00 | 29 / −£29.00 | 29 / −£29.00 |

The replacement horses had stronger measured recent performance and higher median Speed in both years. Restoring T1 increased measured Speed coverage only slightly. In 2025 the restored horses won more often at a similar average winning SP. In early 2026 they won almost as often as the alternatives, but paid less, with the biggest deterioration across the 5/1 to under 20/1 bands. These are realised associations. The historical comparison cannot establish that measured Speed caused the change.

The largest source of the reversal was the gate's veto when both the replacement and T1 had measured Speed. Restoring T1 on those races added **£150.08 across 681 pairs in H25** and cost **£54.27 across 429 pairs in H26**. The other veto reasons were much smaller. Missing replacement Speed accounted for +£6.14 on 95 H25 races and −£9.05 on 58 H26 races. When T1 lacked a figure and a bypassed T2 had one, the effects were −£15.46 on 41 H25 races and +£0.30 on 16 H26 races. Those groups assign the missing-replacement reason first if both conditions apply.

**One AW_PROFIT_V4 hypothesis for separate testing:** When V3 would reject Policy C because T1 has measured Speed, test whether to retain the original C choice if both horses have measured Best Last 3 AW Speed and C's figure is higher. Keep the existing form gate, abstentions and all other V3 branches. In the saved early-2026 differences, restoring T1 cost £64.23 over 311 such pairs, while it gained £9.96 on the 118 pairs where C's Speed was equal or lower. The proposed exception would also have given up an £82.64 historical restoration gain on 486 such H25 pairs. That disagreement is the reason to test this one contrast on fresh pre-off evidence with decisions frozen before results. V4 remains a hypothesis.

### Same-OR Speed outsider substitution · Historical experiment

**Status** · Completed historical experiment, 21 November 2026. Frozen AW Tissue V3 T1 is the comparator. The substitution was evaluated retrospectively, including on books whose original model picks were collected prospectively. This policy has zero prospectively frozen decisions.

**Prospective candidate** · `AW_SAME_OR_OUTSIDER_V1`, **ARMED** on 21 November 2026 at **17:22:19.930 GMT** (`2026-11-21T17:22:19.930Z`) with zero observations. This independent identifier preserves the fixed rule below. The implementation reproduced all 31 saved substitutions and matched the saved comparison across all 450 eligible races. That comparison returned −£55.50 for original T1 and −£35.00 for the candidate, a £20.50 improvement in the historical sample. [Versioned selector](../src/lib/racing/aw-same-or-policy.ts) · [Switch fixtures](../scripts/fixtures/aw-same-or-outsider-v1.json)

The candidate has a separate ledger at `data/research/aw-same-or-shadow-v1.json`. The collector uses the first original AW V3 book from the current run that matches the open race's identity and active field. Capture requires a book generated at or after candidate activation, and a decision before the scheduled off. It saves the entire pre-off book, including quoted prices and runner identities, the policy decision and any substitution. An incomplete market records a shared abstention for the matched comparison and retains the original T1 identity for audit. Later non-runners and abandonment void the applicable frozen ticket, while exact official SP settles starters through canonical settlement v3. [Shadow ledger](../src/lib/racing/aw-same-or-shadow.ts) · [Collector](../scripts/track-aw-same-or-shadow.ts)

The first eligible scheduled collection is **Sunday 22 November 2026 at 08:00 GMT**, subject to the normal workflow completing with eligible AW books. The local wrapper runs this candidate after existing morning collection and AW_PROFIT_V3, and after existing settlement work. A candidate failure is recorded separately while the original workflow result stays intact. Weekly backup format v6 includes the candidate ledger and its recovery sources. The read-only command is `bun run scripts/track-aw-same-or-shadow.ts summary`. [Local automation wrapper](../scripts/local-automation.ts) · [Weekly backup and restore](backup-restore.md)

#### Fixed rule

1. Use one AW scoring field and a complete, timestamped, verified pre-off median bookmaker board on that same field. Market rank is one plus the count of runners with a shorter median decimal price. Equal prices share a rank.
2. Compute frozen AW V3 T1. On the same field, sum the frozen base and the two retained V3 contributions for Speed rank 2–3 and missing Speed rank. Omit the signed same-OR Speed contribution from this comparison sum. Use descending softmax probability and ascending runner ID to break ties in both calculations.
3. Substitute the leader of the remaining score only when original T1 has captured market rank 4 or worse and the leader changes. Retain original T1 in every other eligible race. The rule can select another outsider. Decisions use the original pre-off field, prices and frozen scoring inputs.
4. Settle both choices on the same race universe at £1 uncapped final SP using canonical settlement v3. Apply dead-heat deductions to gross return. A later non-runner has zero stake and P/L. The other arm keeps its original choice. Both arms require a verified pre-off board.

#### Coverage and returns

The existing matched archive supplied 3,028 AW reconstructions in 2025 and 2,369 races with reconciled results in 2026 through 20 November, including races with a later non-runner. There were **no eligible 2025 boards**. In early 2026, 41 of 1,947 reconstructions supplied a verified board, all dated 9–21 September. The quotes and their match to the scoring field were verified. The reconstructed model inputs use saved starter fields whose original publication timing is unverified. The archived-card fields supplied 134 of 134 verified boards. The AW V2 archive supplied 146 of 165. Those two cohorts replay AW V3 after the event on timestamped evidence.

The original AW V3 ledger supplied 118 of 123 complete boards through 20 November and 11 of 19 on 21 November. The later eleven had matching saved official full results. Genuine original T1 picks were frozen before the off in all 129 qualifying AW V3 fields. The substitution was evaluated after the event even there. Eight later incomplete boards and five earlier incomplete books were outside the V3 comparison. [Existing source coverage and settlement](aw-profit-first-tissue-development-v1.md#populations-and-original-aw-v3) · [Scoring-source provenance](aw-v3-same-or-component-research.md#2-frozen-reproduction-and-matched-coverage)

Each full-policy cell gives **bets / winners / £1 SP P/L / ROI**. Eligible races include later non-runners. ROI uses actual stakes in each arm.

| Source and dates | Eligible races | Substitutions | Frozen T1 | Conditional policy | Policy − T1 |
| --- | ---: | ---: | --- | --- | ---: |
| 2025 reconstructed | 0 | 0 | — | — | — |
| 9–21 Sep 2026 · reconstructed | 41 | 2 | 41 / 14 / +£2.99 / +7.29% | 41 / 15 / +£5.24 / +12.78% | +£2.25 |
| 28 Sep–19 Oct · archived cards | 134 | 11 | 132 / 34 / +£18.90 / +14.32% | 132 / 37 / +£32.65 / +24.74% | +£13.75 |
| 20 Oct–4 Nov · AW V2 archive | 146 | 7 | 138 / 28 / −£42.86 / −31.06% | 139 / 28 / −£45.11 / −32.46% | −£2.25 |
| 5–21 Nov · original AW V3 | 129 | 11 | 127 / 25 / −£34.53 / −27.19% | 127 / 28 / −£27.78 / −21.87% | +£6.75 |
| **2026 total** | 450 | 31 | 438 / 101 / −£55.50 / −12.67% | 439 / 108 / −£35.00 / −7.97% | +£20.50 |

The triggered races account for the full difference in P/L.

| Source | Original T1 P/L | Replacement P/L | Difference | Winners gained / lost |
| --- | ---: | ---: | ---: | ---: |
| 2025 reconstructed | — | — | — | — |
| 9–21 Sep 2026 · reconstructed | −£2.00 | +£0.25 | +£2.25 | 1 / 0 |
| 28 Sep–19 Oct · archived cards | −£11.00 | +£2.75 | +£13.75 | 3 / 0 |
| 20 Oct–4 Nov · AW V2 archive | −£1.00 | −£3.25 | −£2.25 | 1 / 1 |
| 5–21 Nov · original AW V3 | −£4.00 | +£2.75 | +£6.75 | 4 / 1 |
| **2026 total** | −£18.00 | +£2.50 | +£20.50 | 9 / 2 |

Sprinting Speed was the only original T1 voided on a triggered race. Territorial Star provided a genuine £2.75 winning contribution on that field. On the 30 triggered races where both tickets were staked, original T1 lost £18.00 and the replacements lost £0.25, a £17.75 improvement. The 419 untriggered races returned the same −£37.50 from 408 bets in both arms.

#### Triggered price distribution

Cells count selections in the existing fractional price bands, ordered **under 2/1 / 2–under 5/1 / 5–under 8/1 / 8–under 12/1 / 12–under 20/1 / 20/1+**. Capture counts include the later non-runner. Final-SP counts cover staked tickets.

| Source | T1 captured price | Replacement captured price | T1 final SP | Replacement final SP |
| --- | --- | --- | --- | --- |
| 9–21 Sep 2026 · reconstructed | 0 / 0 / 2 / 0 / 0 / 0 | 1 / 0 / 1 / 0 / 0 / 0 | 0 / 0 / 1 / 0 / 1 / 0 | 1 / 0 / 1 / 0 / 0 / 0 |
| 28 Sep–19 Oct · archived cards | 0 / 0 / 4 / 2 / 4 / 1 | 0 / 7 / 3 / 1 / 0 / 0 | 0 / 0 / 2 / 3 / 3 / 3 | 0 / 6 / 4 / 0 / 1 / 0 |
| 20 Oct–4 Nov · AW V2 archive | 0 / 0 / 4 / 2 / 0 / 1 | 0 / 3 / 3 / 0 / 0 / 1 | 0 / 1 / 1 / 2 / 1 / 1 | 0 / 3 / 2 / 1 / 0 / 1 |
| 5–21 Nov · original AW V3 | 0 / 0 / 4 / 3 / 2 / 2 | 2 / 7 / 1 / 1 / 0 / 0 | 0 / 0 / 1 / 6 / 2 / 2 | 2 / 8 / 0 / 0 / 0 / 1 |
| **2026 total** | 0 / 0 / 14 / 7 / 6 / 4 | 3 / 17 / 8 / 2 / 0 / 1 | 0 / 1 / 5 / 11 / 7 / 6 | 3 / 17 / 7 / 1 / 1 / 2 |

The replacement was in the captured market top three in 25 of 31 switches and ranked fourth or worse in six. It ranged from 2.00 to 23.00 in captured decimal odds. The baseline outsider ranged from 6.00 to 67.00. The primary totals include every genuine winning ticket, including the shared wins by Ice Show at 12/1 and Amandari at 10/1.

#### Every substitution

<details>
<summary>31 matched decisions and their monetary contributions</summary>

All dates are in 2026. The race identifier is Sporting Life’s race ID. Each pick shows its captured market rank, captured decimal price and final fractional SP. Bold ticket P/L identifies a winner.

| Date · course · scheduled off · race ID | Original T1 · rank / price / SP | Replacement · rank / price / SP | T1 P/L | Replacement P/L | Difference |
| --- | --- | --- | ---: | ---: | ---: |
| 9 Sep · Kempton 18:00 · 937429 | Happy Banner · 6 / 8.50 / 6/1 | Asteverdi · 5 / 8.00 / 7/1 | −£1.00 | −£1.00 | £0.00 |
| 10 Sep · Lingfield 19:05 · 937634 | Meritocratic · 4 / 7.50 / 16/1 | Thisonesforyou · 1 / 2.88 / 5/4 | −£1.00 | **+£1.25** | +£2.25 |
| 29 Sep · Wolverhampton 18:30 · 940743 | Billy Bathgate · 4 / 7.50 / 15/2 | D Day Major Winter · 2 / 3.25 / 3/1 | −£1.00 | −£1.00 | £0.00 |
| 30 Sep · Kempton 17:30 · 940947 | Melodical · 6 / 15.00 / 20/1 | Hove Ranger · 1 / 3.25 / 5/2 | −£1.00 | **+£2.50** | +£3.50 |
| 2 Oct · Wolverhampton 15:55 · 941341 | Captain Parma · 4 / 8.50 / 10/1 | Star Of Mali · 1 / 3.00 / 11/4 | −£1.00 | **+£2.75** | +£3.75 |
| 2 Oct · Newcastle 17:45 · 941328 | Surprised · 10 / 19.00 / 25/1 | Luminous Warrior · 5 / 8.00 / 15/2 | −£1.00 | −£1.00 | £0.00 |
| 7 Oct · Kempton 19:00 · 942185 | Vilaine Verlaine · 8 / 21.00 / 25/1 | Luan · 3 / 6.50 / 11/2 | −£1.00 | −£1.00 | £0.00 |
| 8 Oct · Southwell 18:30 · 942401 | Man Of Desert · 5 / 9.00 / 14/1 | Volto Di Medusa · 7 / 10.00 / 18/1 | −£1.00 | −£1.00 | £0.00 |
| 10 Oct · Southwell 19:30 · 942806 | Flightofthephoenix · 5 / 7.00 / 15/2 | Lilly Lux · 3 / 5.50 / 4/1 | −£1.00 | −£1.00 | £0.00 |
| 14 Oct · Kempton 17:30 · 943410 | Knowledge · 5 / 9.50 / 9/1 | Warning Symbol · 2 / 5.50 / 9/2 | −£1.00 | −£1.00 | £0.00 |
| 14 Oct · Kempton 19:00 · 943413 | Do Bronxs · 8 / 19.00 / 14/1 | Marengo Storm · 1 / 4.33 / 9/2 | −£1.00 | −£1.00 | £0.00 |
| 16 Oct · Newcastle 19:45 · 943774 | Sprinting Speed · 5 / 7.50 / 8/1 | Territorial Star · 3 / 5.00 / 5/1 | −£1.00 | −£1.00 | £0.00 |
| 19 Oct · Southwell 19:00 · 944213 | Shimmy Jimmy · 10 / 15.00 / 14/1 | Yankee Dude · 2 / 6.00 / 11/2 | −£1.00 | **+£5.50** | +£6.50 |
| 21 Oct · Kempton 18:30 · 944584 | Somers Isles · 4 / 7.50 / 14/1 | Farasan · 3 / 6.50 / 6/1 | −£1.00 | −£1.00 | £0.00 |
| 24 Oct · Southwell 19:00 · 945177 | Lili Marleen · 4 / 6.00 / 4/1 | Kev · 2 / 5.50 / 7/2 | **+£4.00** | −£1.00 | −£5.00 |
| 27 Oct · Wolverhampton 19:00 · 945576 | Sprinting Speed · 5 / 8.00 / void | Territorial Star · 1 / 4.33 / 11/4 | void | **+£2.75** | +£2.75 |
| 29 Oct · Southwell 19:30 · 945964 | Revelio · 6 / 10.00 / 9/1 | Fleur De Mer · 3 / 5.50 / 8/1 | −£1.00 | −£1.00 | £0.00 |
| 30 Oct · Newcastle 18:45 · 946130 | Regal Desire · 11 / 21.00 / 20/1 | Project Geofin · 3 / 7.50 / 6/1 | −£1.00 | −£1.00 | £0.00 |
| 30 Oct · Newcastle 19:45 · 946132 | Jamaican Storm · 6 / 6.50 / 5/1 | Educating Rita · 4 / 6.00 / 7/2 | −£1.00 | −£1.00 | £0.00 |
| 2 Nov · Chelmsford City 20:15 · 946575 | Hamdania · 5 / 10.00 / 10/1 | Mr Nugget · 7 / 23.00 / 28/1 | −£1.00 | −£1.00 | £0.00 |
| 5 Nov · Southwell 16:30 · 947101 | Forbidden Colours · 6 / 8.00 / 11/1 | Lady Mariko · 1 / 4.00 / 7/2 | −£1.00 | **+£3.50** | +£4.50 |
| 6 Nov · Newcastle 18:30 · 947301 | Wise Crack · 4 / 8.00 / 6/1 | Educating Rita · 1 / 4.50 / 10/3 | **+£6.00** | −£1.00 | −£7.00 |
| 16 Nov · Wolverhampton 19:00 · 948707 | Receipt · 9 / 67.00 / 66/1 | Valentine Boy · 3 / 5.00 / 4/1 | −£1.00 | −£1.00 | £0.00 |
| 17 Nov · Southwell 16:30 · 949447 | Jax Edge · 9 / 15.00 / 11/1 | Managing Director · 1 / 4.50 / 3/1 | −£1.00 | −£1.00 | £0.00 |
| 19 Nov · Lingfield 14:38 · 949238 | American Gal · 5 / 13.00 / 11/1 | Enchanted Queen · 1 / 3.25 / 5/2 | −£1.00 | −£1.00 | £0.00 |
| 19 Nov · Newcastle 18:10 · 949246 | Luminare · 4 / 8.00 / 9/1 | Frankies Dream · 1 / 3.75 / 5/2 | −£1.00 | **+£2.50** | +£3.50 |
| 20 Nov · Wolverhampton 16:30 · 949971 | Borderline Madness · 6 / 10.00 / 10/1 | Ignition · 6 / 10.00 / 28/1 | −£1.00 | −£1.00 | £0.00 |
| 20 Nov · Wolverhampton 17:00 · 949406 | Navona Grey · 4 / 12.00 / 12/1 | Frantic · 1 / 2.00 / 11/10 | −£1.00 | −£1.00 | £0.00 |
| 21 Nov · Lingfield 14:20 · 949648 | Midnight Call · 11 / 23.00 / 33/1 | Giorgio M · 1 / 3.50 / 2/1 | −£1.00 | **+£2.00** | +£3.00 |
| 21 Nov · Newcastle 14:49 · 950179 | Naval Command · 6 / 12.00 / 16/1 | Dream Harder · 3 / 8.00 / 4/1 | −£1.00 | −£1.00 | £0.00 |
| 21 Nov · Lingfield 15:05 · 949649 | Musical Soldier · 4 / 8.50 / 9/1 | The Anthony Gover · 1 / 2.63 / 7/4 | −£1.00 | **+£1.75** | +£2.75 |

</details>

#### Winner concentration and decision

Each sensitivity removes the selected whole race from both arms. The first two sensitivity columns remove the largest one or two winning contributions per arm on switched races, using all available when fewer exist. The last column drops the two switches with the largest positive contributions to the policy difference, or the only such switch when applicable.

| Source | Full result, policy − T1 | Without largest win in each arm | Without two largest wins in each arm | Without two most favourable switches |
| --- | ---: | ---: | ---: | ---: |
| 9–21 Sep 2026 · reconstructed | +£2.25 | £0.00 | £0.00 | £0.00 |
| 28 Sep–19 Oct · archived cards | +£13.75 | +£7.25 | +£3.50 | +£3.50 |
| 20 Oct–4 Nov · AW V2 archive | −£2.25 | £0.00 | £0.00 | −£5.00 |
| 5–21 Nov · original AW V3 | +£6.75 | +£9.25 | +£5.75 | −£1.25 |
| **2026 total** | +£20.50 | +£21.00 | +£21.50 | +£9.50 |

On the pooled sample, removing the largest winner in each arm on triggered races left T1 at −£60.50 and the policy at −£39.50. These were Wise Crack (6/1, original T1) and Yankee Dude (11/2, replacement). Dropping the two most favourable switches, Yankee Dude and Lady Mariko, left T1 at −£53.50 and the policy at −£44.00. The biggest full-policy winner, Ice Show (+£12.00), was shared. Removing that race alone gives −£67.50 and −£47.00, with the difference still +£20.50.

**Economic interpretation.** The conditional rule reduced the pooled loss by £20.50, from −12.67% to −7.97% ROI. Gains were strongest on archived cards. The AW V2 archive moved against the hypothesis, and the 2025 comparison has zero verified coverage. Among original AW V3 books the gain was £6.75, of which £5.75 came on 21 November. Midnight Call → Giorgio M contributed £3.00. The 5–20 November comparison contributed £1.00 across eight switches. On all 129 original AW V3 books, dropping the two most favourable switches turned the gain into a £1.25 disadvantage.

**Decision** · The hypothesis warrants a narrow prospective comparison of the same fixed rule, with switch P/L as the primary outcome. The pooled policy still lost money and returns varied by source. This is evidence for a prospective comparison and leaves future profitability unproven.

**Reproducibility.** The replay reused the pinned source reader and terminal reconciliation from [the prior AW policy audit](../scripts/aw-profit-first-tissue.ts) and [the canonical result matcher](../scripts/build-full-history-profitability.ts). On every eligible earlier field both calculated leaders matched the saved controlled leader identities, and the eligible November AW V3 books reproduced their original probabilities and ranks. The model byte SHA-256 was d9c44881e2ea13ee1ed637122e2eb49028866aba8668086718d757c0e94a7f8c. The original AW V3 ledger snapshot SHA-256 was 70aca50a3726558146b3e3114570e32b7463b1c5808dbce0cd68323b09163750, and the through-20-November terminal export SHA-256 was f94b8dce3d2d92f2732f802d5e6e0f21ce43d330841c7f630905898e5f835160. The 21 November joins used saved provider race IDs and matched course, date, off time, horse, and terminal position against the frozen ledger before using final SP.

### AW_NO_HOPER_V1 · Research-only abstention experiment

**Fixed pre-race rule.** On a complete, verified pre-off median bookmaker board, inspect original frozen AW Tissue V3 T1 and T2 separately. Flag a selection when its competition market rank is fourth or worse, the signed same-OR Speed term increases its score, and removing only that contribution makes it fall below its original Tissue rank. Use the original softmax ordering and runner-ID tie-break. Retain the flagged selection when its measured latest AW performance is in the field's top three, with ties sharing rank. Otherwise record **NO BET**. There is no replacement. Latest AW performance is a separate weight-adjusted form check and shares underlying Speed information with the scorer. The policy uses no final SP, finish or later withdrawal to make a decision. [Rule implementation](../src/lib/racing/aw-no-hoper-policy.ts) · [Existing latest AW performance definition](aw-recent-performance-policy-diagnostic.md#what-policy-c-does)

**Evidence.** The replay used the same 450 race IDs as the preceding same-OR experiment. It verified the original T1 and T2 identities against saved comparison rows or the original AW V3 books. Earlier scoring fields were reconstructed or replayed from saved books. Only the November original AW V3 ranks were prospectively frozen, and the filter itself was assessed retrospectively in all cohorts. None of the 3,028 matched 2025 reconstructed races had a qualifying verified pre-off market. Missing boards remained outside the comparison. All arms settle a £1 win stake at uncapped final SP with canonical dead-heat deductions. A later non-runner has zero stake and P/L. The market-only comparator abstains on every pre-off market-rank-4-or-worse selection on the same fields.

| 2026 evidence period | Rank | Eligible races | Flagged | Excluded bets | Excluded P/L | Original P/L | Retained P/L | P/L change | Market-only P/L |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 9–21 Sep · reconstructed | T1 | 41 | 0 | 0 | £0.00 | +£2.99 | +£2.99 | £0.00 | +£9.99 |
| 9–21 Sep · reconstructed | T2 | 41 | 3 | 3 | −£3.00 | −£17.75 | −£14.75 | +£3.00 | −£5.75 |
| 28 Sep–19 Oct · archived cards | T1 | 134 | 10 | 8 | −£8.00 | +£18.90 | +£26.90 | +£8.00 | +£9.90 |
| 28 Sep–19 Oct · archived cards | T2 | 134 | 3 | 3 | −£3.00 | −£20.85 | −£17.85 | +£3.00 | −£0.48 |
| 20 Oct–4 Nov · AW V2 archive | T1 | 146 | 5 | 4 | −£4.00 | −£42.86 | −£38.86 | +£4.00 | −£29.86 |
| 20 Oct–4 Nov · AW V2 archive | T2 | 146 | 4 | 3 | −£3.00 | −£26.22 | −£23.22 | +£3.00 | −£17.05 |
| 5–21 Nov · original AW V3 | T1 | 129 | 9 | 7 | £0.00 | −£34.53 | −£34.53 | £0.00 | −£17.03 |
| 5–21 Nov · original AW V3 | T2 | 129 | 5 | 4 | −£4.00 | +£12.91 | +£16.91 | +£4.00 | +£26.41 |
| **All eligible 2026** | **T1** | **450** | **24** | **19** | **−£12.00** | **−£55.50** | **−£43.50** | **+£12.00** | **−£27.00** |
| **All eligible 2026** | **T2** | **450** | **15** | **13** | **−£13.00** | **−£51.91** | **−£38.91** | **+£13.00** | **+£3.13** |

T1 retained **100 winners from 419 bets**, compared with **101 from 438** originally. One additional excluded selection, Sprinting Speed, was a non-runner. The only excluded winner was **Wise Crack at 6/1 SP** (6 November 2026, Newcastle, Sporting Life race 947301). The lost £6.00 winning contribution is included in T1's excluded P/L. T2 retained **all 89 winners from 431 bets**, compared with 444 bets originally. All genuine long-priced winners count in the comparison.

**Economic conclusion.** The narrow filter saved £12.00 on T1 and £13.00 on T2 against unchanged Tissue. The blanket market-only exclusion saved £28.50 and £55.04 respectively, leaving the narrow filter £16.50 behind on T1 and £42.04 behind on T2. The narrow rule kept nine more T1 winners and twelve more T2 winners than the blanket rule. It added value on the archived-card T1 cohort, but the pooled final-SP result gives no evidence that the added scoring and form criteria improve profitability over the market-only exclusion. The motivating Lingfield outsider Midnight Call was flagged and retained because latest AW performance ranked second in the captured field. This is one retrospective experiment. The filter remains research-only.

### AW_MARKET_SUPPORT_V1 · Top-three market support shadow

**Status** · Implemented for research and **unarmed**. The candidate has a separate ledger path, `data/research/aw-market-support-shadow-v1.json`. No ledger or activation timestamp has been created. The candidate is unscheduled. [Policy and ledger](../src/lib/racing/aw-market-support-shadow.ts) · [Local collector](../scripts/track-aw-market-support-shadow.ts)

**Fixed rule.** Keep the original frozen AW V3 T1 and T2 identities. Assess each independently against the same complete verified pre-off bookmaker board from its frozen book. Market rank is one plus the number of horses with a shorter median decimal quote. Equal prices share a rank. Retain ranks 1–3. Record **NO BET** at market rank 4 or worse or when the market is incomplete or unverified. The frozen model ranks and market cut are used as saved. Final SP is reserved for settlement.

The collector saves the first eligible current-run book after its own activation time and checks the open race, scheduled off, and runner and horse IDs before freezing both decisions. Each observation retains the source book and its prices, capture and decision times, original runner identities, market ranks and reasons. Later official results are recorded for both original picks, including excluded picks for the unchanged comparator. Summary returns are split by T1 and T2. Canonical settlement uses verified fractional final SP, uncapped £1 stakes, dead-heat deductions and zero stake for non-runners or void races. Settlements append to the frozen decisions. The read-only command is `bun run scripts/track-aw-market-support-shadow.ts summary`.

**Historical reference.** This is the existing market-only arm from the 450-race comparison above. Counts and sums were checked against its saved race rows. A stake is counted only for a settled starter. The 129 original AW V3 pre-off books are part of that sample. The earlier books use timestamped markets matched to reconstructed or replayed scoring fields. The 2025 archive supplied no eligible verified boards. The matched historical comparison covers complete verified markets, while the prospective rule explicitly abstains on incomplete or unverified markets.

| Evidence | Rank | Original bets / wins | Original £1 SP P/L | Retained bets / wins | Retained £1 SP P/L | Change |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 450 matched 2026 races | T1 | 438 / 101 | −£55.50 | 331 / 91 | −£27.00 | +£28.50 |
| 450 matched 2026 races | T2 | 444 / 89 | −£51.91 | 283 / 77 | +£3.13 | +£55.04 |
| 129 original AW V3 books | T1 | 127 / 25 | −£34.53 | 88 / 22 | −£17.03 | +£17.50 |
| 129 original AW V3 books | T2 | 129 / 31 | +£12.91 | 71 / 27 | +£26.41 | +£13.50 |

On all 450 races, T1 ROI moved from −12.67% to −8.16%. T2 moved from −11.69% to +1.11%. The filter excluded 107 settled T1 bets and 161 settled T2 bets, including 10 and 12 winners respectively. The unchanged returns include every genuine long-priced winner. The small T2 profit in this historical sample leaves long-term profitability unproven.
