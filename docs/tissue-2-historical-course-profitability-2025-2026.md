# Historical Tissue 2 profitability by racecourse

**2025 and 2026 through 26 November · £1 win bets at verified final SP**

Tissue 2 lost money overall in all three families in both years. **All seven AW courses lost in both years.** Among courses with at least 20 stakes in each year, five Hurdle courses and six Chase courses were profitable in both. **Musselburgh** had the best qualifying Hurdle ROI and **Kelso** led the qualifying Chase courses. **Wolverhampton, Punchestown and Newcastle** had the largest combined cash losses in their respective families.

## Coverage, parity and returns

The local Sporting Life inventory contained **14,373 distinct races** across the three families. **13,715** had a usable T2 selection and **13,658** yielded a verified SP stake. The **658 excluded races** carry a reason in the audit. Selected races that were pending or refunded remain visible as zero stakes.

| Family and period | Source races | Selected | Excluded | £1 bets | Winners | SP P/L | ROI |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| AW 2025 | 3,106 | 3,028 | 78 | 3,028 | 514 | −£642.32 | −21.21% |
| AW earlier 2026 replay | 2,464 | 2,112 | 352 | 2,106 | 353 | −£432.88 | −20.55% |
| AW November frozen | 226 | 222 | 4 | 208 | 42 | +£3.87 | +1.86% |
| **AW full 2026** | **2,690** | **2,334** | **356** | **2,314** | **395** | **−£429.01** | **−18.54%** |
| **AW combined** | **5,796** | **5,362** | **434** | **5,342** | **909** | **−£1,071.32** | **−20.05%** |
| Hurdle 2025 | 2,911 | 2,905 | 6 | 2,905 | 532 | −£608.27 | −20.94% |
| Hurdle earlier 2026 replay | 2,244 | 2,125 | 119 | 2,125 | 406 | −£306.44 | −14.42% |
| Hurdle November frozen | 268 | 255 | 13 | 235 | 53 | −£11.18 | −4.76% |
| **Hurdle full 2026** | **2,512** | **2,380** | **132** | **2,360** | **459** | **−£317.62** | **−13.46%** |
| **Hurdle combined** | **5,423** | **5,285** | **138** | **5,265** | **991** | **−£925.89** | **−17.59%** |
| Chase 2025 | 1,707 | 1,698 | 9 | 1,698 | 338 | −£135.65 | −7.99% |
| Chase earlier 2026 replay | 1,287 | 1,220 | 67 | 1,220 | 233 | −£191.99 | −15.74% |
| Chase November frozen | 160 | 150 | 10 | 133 | 29 | −£5.83 | −4.38% |
| **Chase full 2026** | **1,447** | **1,370** | **77** | **1,353** | **262** | **−£197.82** | **−14.62%** |
| **Chase combined** | **3,154** | **3,068** | **86** | **3,051** | **600** | **−£333.47** | **−10.93%** |

The combined columns add the two years at SP. Full 2026 includes the November cohort exactly once. Earlier 2026 is a pre-epoch replay and has a different cutoff and coverage by family. The November population begins **5 November 2026**. The source denominator is the local inventory through 26 November, which includes incomplete results and races without Tissue books. Known provider and import gaps limit it as a census of racing. [Source coverage audit](racing-2025-2026-data-market-trainer-audit.md)

### What can be reproduced faithfully

| Family | Exact frozen pre-off T2 books | Approximate historical selections | No usable selection |
| --- | ---: | ---: | ---: |
| AW Tissue V3 | 222 / 5,796 (3.83%) | 5,140 (88.68%) | 434 |
| Hurdle Tissue V2 | 255 / 5,423 (4.70%) | 5,030 (92.75%) | 138 |
| Chase Tissue V2 | 150 / 3,154 (4.76%) | 2,918 (92.52%) | 86 |
| **Total** | **627 / 14,373 (4.36%)** | **13,088 (91.06%)** | **658** |

Strict parity means an original pre-off generation book with the pinned version and checksum. It was available for **627 of 13,715 ranked races (4.57%)**, or 627 of 654 in the November inventory. No older selection met that standard. **Scoring parity is stronger than input parity.** The reconstructions use the unchanged base and context coefficients, standardization, missingness indicators, race softmax and probability ordering. The older Chase promotion predictions are equivalent to the pinned Chase V2 score because its context weights are zero. They remain retrospective evidence.

- **AW V3:** Reused 3,028 2025 and 1,947 early-2026 starter-field replays. The prior-run feature audit regenerated the saved numeric-vector checksum. It uses dated AW Speed and material history and the frozen OR and missing-value treatment. Another 165 pre-epoch frozen AW V2 input books were retrospectively rescored with V3 context. The original V3 book and feature-publication time are unavailable for these older races.
- **Hurdle V2:** Reused the 2025 v4 jump cache, the isolated 2026 cache through 14 October and 94 earlier frozen Jump V1 input books through 4 November. The replay uses OR, Jump Speed, prior comments and completion history with prior-day cutoffs for archived histories. Missing OR and Best Last 3 Speed were retained as missing on **8,809 and 5,913** reconstructed runner vectors in 2025, and **5,654 and 3,264** in the 2026 cache reconstruction.
- **Chase V2:** Reused 1,698 reconstructed 2025 fields and 1,220 stored Shadow promotion fields through 29 October 2026. Missing OR and Best Last 3 Speed occurred on **1,191 and 1,595** 2025 runner vectors. The promotion file supplies pinned probabilities rather than a complete timestamped feature history.

Prior-run histories were filtered to their documented pre-target cutoff. Target finish and SP are joined for settlement. **The older starter-field replays still condition on the eventual starter roster**, which can affect field-relative inputs and ranking. Historical OR, card metadata and prior ratings can also reflect later publication or revision. The audit can verify rank and settlement and distinguish these limitations, but cannot certify the older selections as leakage-free live counterfactuals. The 2025 AW and Chase samples overlap base development. Late Hurdle and earlier 2026 Chase data informed context or model selection. [Original generation and scoring lineage](tissue-generation-2026-11.md) · [Phase 3 reconstruction method](tissue-profitability-phase-3-tables-2026-11-26.md) · [AW replay methods](aw-v3-same-or-component-research.md)

| Exclusion reason | AW | Hurdle | Chase | Total |
| --- | ---: | ---: | ---: | ---: |
| Historical final field could not be proved | 45 | 22 | 24 | 91 |
| Proved historical result, insufficient ranked inputs or reference | 385 | 103 | 52 | 540 |
| November source race without an original frozen generation book | 4 | 13 | 10 | 27 |
| **Total** | **434** | **138** | **86** | **658** |

## Course comparisons

The one-row-per-course CSVs are sorted by combined SP P/L. They include eligibility, exclusions, bets, winners, ROI, largest winner, a supplementary largest-winner sensitivity and parity coverage in separate annual, combined and 2026 cohort columns. The consistency table uses 20 or more SP stakes in **each full year**. The threshold is descriptive.

| Family | Courses | Profit in both years | Loss in both years | Reversal | Low sample |
| --- | ---: | ---: | ---: | ---: | ---: |
| AW | 7 | 0 | 7 | 0 | 0 |
| Hurdle | 64 | 5 | 28 | 21 | 10 |
| Chase | 64 | 6 | 13 | 13 | 32 |

**AW.** Chelmsford City lost least, **−£48.63 on 377 (−12.90%)**. Wolverhampton lost the most, **−£268.50 on 1,179 (−22.77%)**, and Southwell had the weakest combined ROI, **−23.65% on 939 (−£222.03)**. Wolverhampton's historical deficit was close to its peer expectation after matching Tapeta, distance and handicap status. T2 still trailed T1 in both replay years there. Lingfield's November **+£19.21 from 35** reduced its full-2026 loss to **−£37.88 on 364**. The 2025 loss was **−£98.87 on 326**. The November gain therefore remained a cohort reversal within a losing year. [Matched rank and race-mix comparisons](tissue-2-course-profitability-2026-11-26.md#all-weather)

**Hurdles.** Chepstow led combined cash, **+£34.59 on 124**, after reversing from **−£21.53 on 63** to **+£56.12 on 61**. Its biggest winner contributed **£18**. Musselburgh led ROI, **+47.80% on 58 bets (+£27.72)**, with a £14 largest winner. Punchestown lost most cash, **−£70.07 on 179**, and Cheltenham had the worst qualifying ROI, **−64.81% on 78**. Punchestown remained weak against matched historical peers after accounting for handicap, distance, going, class and field size. The historical mix included **−£68.94 on 98** selections in fields of 11 or more. Plumpton and Wetherby were positive in both earlier replay years and moved into reversal once November was added. [Hurdle conditions and rank comparisons](tissue-2-course-profitability-2026-11-26.md#hurdles)

**Chases.** Kelso led cash and ROI among qualifying courses, **+£32.17 on 59 (+54.52%)**. Its historical advantage over comparable other courses survived the handicap and distance checks, with much of its positive P/L in intermediate races. Exeter returned **+£28.58 on 57**, and is the clearest two-year Chase course whose P/L remained positive in each year after removing that year's largest winner. Newcastle lost **£42.50 on 53 (−80.19%)** including November. On the matched historical subset of 51 races its T2 lost **£40.50** while T3 made **£41.29**. Its deficits persisted across the historical race-mix adjustments. Wexford's 2025 **+£36.41 on 29** reversed to **−£8.00 on 38** in 2026, and its single £33 net winner exceeded its two-year profit. [Chase conditions and earlier matched results](tissue-2-course-profitability-2026-11-26.md#chases) · [Full Phase 3 course tables](tissue-profitability-phase-3-courses-2026-11-26.md)

### Courses profitable in both full years

Annual cells show **bets / winners / ROI**. In the final column each year omits its own largest winning ticket and stake. Every winner remains in the primary results.

| Family and course | 2025 | 2026 | Combined P/L | Largest net winner | 2025 / 2026 P/L without largest |
| --- | ---: | ---: | ---: | ---: | ---: |
| Hurdle Musselburgh | 35 / 8 / +55.28% | 23 / 5 / +36.41% | +£27.72 | £14.00 | +£5.35 / −£3.63 |
| Hurdle Limerick | 65 / 12 / +33.45% | 42 / 7 / +5.85% | +£24.20 | £28.00 | −£6.26 / −£22.54 |
| Hurdle Clonmel | 55 / 13 / +28.19% | 48 / 13 / +4.26% | +£17.54 | £25.00 | −£9.50 / −£9.96 |
| Hurdle Ffos Las | 55 / 13 / +17.10% | 53 / 8 / +13.92% | +£16.78 | £22.00 | −£12.60 / −£6.63 |
| Hurdle Newton Abbot | 66 / 21 / +0.09% | 62 / 19 / +3.77% | +£2.40 | £7.50 | −£7.44 / −£5.16 |
| Chase Kelso | 31 / 6 / +26.61% | 28 / 10 / +85.42% | +£32.17 | £10.00 | −£0.25 / +£13.92 |
| Chase Exeter | 37 / 13 / +63.85% | 20 / 7 / +24.79% | +£28.58 | £14.00 | +£9.63 / +£0.46 |
| Chase Warwick | 44 / 12 / +13.35% | 37 / 11 / +16.22% | +£11.88 | £7.00 | −£1.12 / £0.00 |
| Chase Southwell | 37 / 9 / +21.38% | 25 / 9 / +14.73% | +£11.59 | £12.00 | −£4.09 / +£0.35 |
| Chase Tramore | 26 / 5 / +8.97% | 26 / 6 / +5.77% | +£3.83 | £10.00 | −£7.67 / −£6.50 |
| Chase Cartmel | 28 / 6 / +1.19% | 26 / 8 / +9.94% | +£2.92 | £11.00 | −£7.67 / −£8.42 |

Tramore's earlier 2026 replay was negative and two November T2 stakes moved the full-year result positive. Exeter's 2026 result includes 18 replay and two November bets. Ffos Las had a much stronger historical handicap and intermediate-distance profile than its course-wide November result, which lost all eight stakes. These coverage and concentration differences matter when comparing years. The audit and course CSVs also report sensitivity for profitable courses below the sample threshold and those profitable in only one year.

## Race audit and settlement

The race audit records every local inventory race. It identifies the runner, probability, model checksum, ranking provenance, recorded race context, exact fractional and decimal SP, outcome, dead-heat divisor, stake, P/L or exclusion. Historical proof comes from the pinned full-history export through 20 November plus a read-only inventory query for 21–26 November. November rank identity and probability were checked against the original book, and results were reconciled to the archived full result. Current course, going and race-class labels in the historical inventory are descriptive. They are not fresh ranking inputs.

Verified the model version and rank order, unique race IDs, disjoint replay and frozen cohorts, family and course joins, exact SP conversion and every staked return. A £1 loss returns −£1. A winner returns gross decimal SP divided by the dead-heat divisor, less £1. Non-runners, voids, pending races and exclusions have no stake. No ranked settled starter lacked verified SP. November captured prices are separate in the audit and CSVs. There are no captured-price substitutions for historical SP. Course stakes, winners and P/L reconcile to the audit and annual totals. The 25 focused generation and settlement tests passed. The November ranking source is pinned by ledger SHA-256 `5e4bed49ec67d34eed6206cd7393f8c9c30224acb89abd7d5a6730a819a49e58`.

[AW course CSV](tissue-2-historical-course-aw-2025-2026.csv) · [Hurdle course CSV](tissue-2-historical-course-hurdle-2025-2026.csv) · [Chase course CSV](tissue-2-historical-course-chase-2025-2026.csv) · [Race audit CSV](tissue-2-historical-race-audit-2025-2026.csv)
