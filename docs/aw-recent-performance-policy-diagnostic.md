# Recent AW performance policy diagnostic

**Policy C improved on both Tissue ranks in the early 2026 reconstruction, yet still lost £110.34 at £1 SP stakes.** It lost £455.70 in 2025, when its switches away from T1 cost £181.94. The November replay on original AW V3 captures made £20.41, including £28.00 from Berkshire Dream. The better-paying 2026 switches justify a further test of the fixed rule. The available results give no evidence of repeatable absolute profitability.

## What Policy C does

Rank every horse with a measured latest AW performance in the original AW V3 scoring field, highest figure first. Equal figures share a competition rank. Inspect original Tissue T1, T2 and T3 in order and take the first with a performance rank of 1, 2 or 3. With fewer than three measured horses, every measured horse is eligible on performance rank. If no Tissue top-three horse qualifies, abstain. A later non-runner voids the ticket without promoting another horse.

“Latest” means the most recent usable prior AW performance, calculated from that run's AW Speed plus the weight it carried in pounds minus 168. Prior runs without the inputs for a usable AW figure are skipped. The selector reads the saved figure, has no explicit lookback limit, and uses no price, Official Rating or minimum absolute performance threshold. Those factors can still be associated with the original Tissue rank or eventual returns. Final SP is used for settlement. [Policy and scorer replay](../scripts/aw-profit-first-tissue.ts) · [Prior form calculation](../src/lib/racing/horse-metrics.ts) · [Weight adjustment](../src/lib/racing/weight-performance.ts)

## Confirmed returns and matched selections

| Population | Races | Bets | Winners | £1 SP P/L | ROI |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2025 reconstructed, January–December | 3,028 | 2,544 | 558 | −£455.70 | −17.91% |
| 2026 reconstructed, 1 January–21 September | 1,947 | 1,650 | 422 | −£110.34 | −6.69% |
| Replayed on original AW V3 captures, 5–20 November 2026 | 123 | 98 | 25 | +£20.41 | +20.83% |

All returns use the existing uncapped SP settlement, including dead-heat deductions and all genuine winners. The matched table uses one priced starter from each side on the same race. The 2026 data had been explored previously. [Stage 1 report and source audit](aw-profit-first-tissue-development-v1.md)

| Population | Reference | Same horse | Different horse | C wins | Reference wins | Reference £1 SP P/L | C advantage |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 2025 reconstructed | T1 | 1,430 | 1,114 | 558 | 623 | −£273.76 | −£181.94 |
| 2025 reconstructed | T2 | 739 | 1,805 | 558 | 453 | −£449.63 | −£6.07 |
| 2026 reconstructed | T1 | 970 | 680 | 422 | 424 | −£226.54 | +£116.20 |
| 2026 reconstructed | T2 | 462 | 1,188 | 422 | 284 | −£323.43 | +£213.09 |
| Original AW V3 captures | T1 | 45 | 53 | 25 | 18 | −£26.77 | +£47.18 |
| Original AW V3 captures | T2 | 33 | 65 | 25 | 23 | +£5.77 | +£14.64 |

The [race-by-race switch register](aw-recent-performance-selection-differences.json) identifies the horses, dates, original and performance ranks, final prices and realised returns. It includes the two void choices on V3 captures. Where C differs from T1, it has fallen through to T2 or T3. It can differ from a qualifying T2 whenever T1 qualifies first.

### Where the £116.20 came from

| 2026 reconstructed, changed picks vs T1 | Races | Outcome for the comparison | P/L difference |
| --- | ---: | --- | ---: |
| C won, T1 lost | 135 | C's winning profits plus £1 per avoided T1 loss | +£598.94 |
| T1 won, C lost | 137 | T1's winning profits forgone plus £1 per C loss | −£482.74 |
| Both lost | 408 | Both lost £1 on each race | £0.00 |
| **Total from changed picks** | **680** | | **+£116.20** |

The 970 identical picks cancel. Across all 1,650 pairs, winning tickets contributed **£118.20 more** under C, and losing stakes cost **£2.00 more**. The switches gained £69.62 when T1 had a measured rating outside the field top three (521 races) and £46.58 when T1 had no figure (159). Both switch groups lost against T1 in 2025. In 2026 the paired T1 advantage was positive in six of nine months. Wild Berries at 28/1 was the largest favourable switch (+£29.00 versus Aiteall, which lost). Removing that pair as a sensitivity leaves +£87.20 against T1.

Against T2, C won on 328 changed picks that T2 lost, and T2 won on 190 that C lost. The other 670 switches lost on both sides. The £213.09 gain comprises £75.09 from better aggregate winning-ticket P/L and £138.00 from fewer losing stakes. For comparison, the 2025 rule found 105 more winners than matched T2 and still returned £6.07 less.

## Why 2025 was poor and early 2026 improved

2025 lost money in **every final-SP band, at every latest-performance rank and at every original Tissue rank**. Its 186 switches that found a winner gained £791.66 against T1, while the 251 that lost a T1 winner cost £973.60. Early 2026 found more winners per stake than 2025 (25.58% vs 21.93%) with a slightly lower average winning SP (2.65/1 vs 2.74/1). The improvement was more winners at several prices rather than a general increase in the prices of winners. Comparing the same calendar window through 21 September narrows the ROI improvement from **11.23 to 5.83 percentage points**. The equivalent 2025 window lost £205.23 from 1,639 bets (−12.52% ROI) and trailed matched T1 by £121.66.

| Factor | What changed from 2025 to the early 2026 replay |
| --- | --- |
| **Final SP** | The median shortened from 7/2 to 10/3 and the 20/1+ share was similar (3.4% and 3.5%). Under 2/1 improved from −5.15% to +3.63% ROI, 5–under 8/1 from −18.54% to +5.42%, and 12–under 20/1 from −18.90% to +8.91%. The 20/1+ group lost in both. |
| **Latest AW performance** | The mean fell slightly (66.78 to 65.97). Field rank 2 improved from −14.25% to +8.53%, while field rank 1 stayed around −20%. On the absolute rating scale, 50–under 65 improved from −21.35% to +1.06%. |
| **Official Rating** | Median among rated picks fell from 67 to 65. OR 60 and below improved from −31.92% to −3.04%, while 76+ slipped from −2.37% to −4.67%. |
| **Class and distance** | Class 6 improved from −31.73% to −4.54%, while Class 4 worsened. Nine to under 12 furlongs improved from −39.10% to −8.60%. Under seven furlongs remained near −9%. |
| **Field size** | Fields of 11+ improved from −25.32% to +12.59%. They were less common among bets in 2026 (23.2% vs 26.7%). |
| **Missing information** | Among bets, missing Best Last 3 AW Speed fell from 8.2% to 7.5% and missing OR from 11.2% to 9.6%. Picks missing Best Last 3 Speed went from −22.99% to +8.09%, while picks with measured Speed improved from −17.46% to −7.88%. All picks had a latest AW performance and a recorded days-since-run input. |

Weighting each group's change in bet share by its average ROI across the two years, the difference in mix accounts for only **+0.20 percentage points for final SP** and at most **0.31 percentage points in absolute terms** for any listed pre-race factor. Most of the 11.23-point full-cohort change came from better realised ROI within groups. The factors overlap and this comparison is descriptive.

## Why the 98 pre-off bets were different

| Coverage | 2025 reconstructed | 2026 reconstructed | Original V3 captures |
| --- | ---: | ---: | ---: |
| Races with eligible scoring and settlement evidence | 3,028 | 1,947 | 123 |
| No qualifying choice | 484 | 297 | 23 |
| Later voids among choices | 0 | 0 | 2 |
| Settled bets as share of eligible races | 84.0% | 84.7% | 79.7% |
| Scored runners with measured latest AW performance | 83.4% | 86.2% | 76.2% |
| Mean scoring field size on bet races | 9.00 | 8.72 | 11.31 |
| Complete verified pre-off quote boards | 0 | 41 | 118 |

The archive has 142 original V3 captures. Nineteen were on 21 November, beyond the saved settlement cutoff. On the 123 reconciled fields, race-day capture preceded the scheduled off by a median 9h 55m. C was applied retrospectively to those live-captured inputs. Earlier historical fields used reconstructed actual-starter rosters with unverified publication timing, including 41 races with a separately verified quote board. With fewer measured figures and larger scoring fields in the V3 sample, the rule kept T1 on 45.9% of its settled bets versus 58.8% in the 2026 reconstruction. The larger-field contrast is substantial. Fields of 11+ accounted for 62 of 98 V3 bets (63.3%), versus 383 of 1,650 early-2026 bets (23.2%).

**Berkshire Dream, Chelmsford City 16:45 on 5 November**, was original T3 and had the second-highest latest AW performance (51.48) among the five measured runners in the 12-horse captured field. T1 Tough Decision and T2 Galimix both lacked a usable figure. Berkshire Dream was eighth in the captured market at decimal 34.0 and won at **28/1 SP**. His ticket contributed **+£28.00**, or **137.2%** of the net £20.41. The switch was worth **+£29.00** against either losing reference. As a sensitivity, the other 97 bets returned **−£7.59** and removing that race from both sides leaves a £18.18 advantage over T1 and a £14.36 deficit to T2. The 25 V3 winners averaged 3.74/1, or 2.73/1 among the other 24. The broad 2026 and V3 strike rates were nearly identical.

The other timestamped sources give mixed evidence. Reconstructed pre-off cards produced **+£2.38 from 98 bets**, underperforming matched T1 by £23.13. Captured AW V2 inputs replayed through V3 produced **−£17.45 from 117 bets**, despite improving on matched T1 by £19.70. These remain separate populations.

## Is further development justified?

The form gate showed useful **relative** selection information in 2026. Its improvement against T1 survived removing the biggest favourable switch and was visible across several months. It went the other way in 2025 on both measured and missing-T1 switches, and neither broad historical sample made money. The short V3 profit was concentrated in one valid outsider. A further evaluation of the unchanged policy on independent pre-off records is justified. These results give no basis for changing the thresholds or staking on the rule.
