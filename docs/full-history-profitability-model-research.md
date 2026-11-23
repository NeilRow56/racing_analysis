# Full historical database profitability research

**No independent policy earned integration into Today’s Racing.** The fixed 2026 replay covered **11,070 races and 101,663 starters** across Chase, Hurdle, All Weather and Turf. The independent capped-return model lost **£180.59 (−14.20%)** from 1,272 bets. The ability, placement and market-blended value policies each lost money on the **1,322** races with independently verified pre-off bookmaker books. Their positive results on the smaller Tissue 2 price overlap each relied on the same 200/1 winner.

## 1. Database and source coverage

The repeatable-read, read-only PostgreSQL snapshot contained **38,470 Sporting Life race records** from 1 August 2020 through **20 November 2026**, the latest completed racing date in scope. The database also held 420 Racing Post records from 2020 and one smoke-test record. The Sporting Life pipeline has consistent result and price provenance for this study. It supplied all 2024–2026 historical targets. Verified 2020 and 2024 records seeded prior history. Only 2025 trained parameters and only the later 2025 and fixed 2026 slices evaluated chronological transfer. [Read-only export](../scripts/export-full-history-profitability.sql) · [Full inventory and source hashes](full-history-profitability-inventory-v1.json)

Raw database counts include runner declarations. “Source starters” sums terminal provider ride counts and “settled outcomes” counts database runner rows with a canonical win or loss state before full identity reconciliation. “SP” means a stored decimal price on those resolved rows. Verified starters have full field, result and price reconciliation in the modelling dataset. A missing feature does not disqualify a race. The Other row contains unsupported events such as National Hunt Flat.

| Year | Family | Dates | DB races | Source starters | Settled outcomes | Winner rows | Stored SP | Verified races | Verified starters |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2024 | CHASE | 2024-01-01 – 2024-12-31 | 1,683 | 13,321 | 13,321 | 1,679 | 13,321 | 1,676 | 13,319 |
| 2024 | HURDLE | 2024-01-01 – 2024-12-31 | 2,860 | 28,913 | 28,910 | 2,853 | 28,910 | 2,848 | 28,886 |
| 2024 | AW | 2024-01-01 – 2024-12-31 | 3,144 | 29,805 | 29,807 | 3,146 | 29,807 | 3,132 | 29,794 |
| 2024 | TURF | 2024-02-18 – 2024-11-09 | 4,691 | 44,719 | 44,720 | 4,670 | 44,720 | 4,663 | 44,698 |
| 2024 | OTHER | 2024-01-01 – 2024-12-31 | 405 | 3,832 | 3,832 | 399 | 3,832 | 0 | 0 |
| 2025 | CHASE | 2025-01-01 – 2025-12-31 | 1,707 | 13,081 | 13,081 | 1,702 | 13,081 | 1,698 | 13,077 |
| 2025 | HURDLE | 2025-01-01 – 2025-12-31 | 2,911 | 27,822 | 27,823 | 2,907 | 27,823 | 2,905 | 27,802 |
| 2025 | AW | 2025-01-01 – 2025-12-31 | 3,106 | 28,634 | 28,634 | 3,113 | 28,634 | 3,102 | 28,634 |
| 2025 | TURF | 2025-02-03 – 2025-11-08 | 4,740 | 44,562 | 44,561 | 4,747 | 44,561 | 4,737 | 44,554 |
| 2025 | OTHER | 2025-01-01 – 2025-12-31 | 402 | 3,812 | 3,812 | 401 | 3,812 | 0 | 0 |
| 2026 | CHASE | 2026-01-01 – 2026-11-20 | 1,401 | 10,189 | 10,189 | 1,385 | 10,189 | 1,382 | 10,187 |
| 2026 | HURDLE | 2026-01-01 – 2026-11-20 | 2,435 | 23,437 | 23,438 | 2,421 | 23,438 | 2,418 | 23,423 |
| 2026 | AW | 2026-01-01 – 2026-11-20 | 2,591 | 23,556 | 23,556 | 2,556 | 23,556 | 2,550 | 23,556 |
| 2026 | TURF | 2026-02-15 – 2026-11-07 | 4,762 | 44,497 | 44,497 | 4,725 | 44,497 | 4,720 | 44,497 |
| 2026 | OTHER | 2026-01-01 – 2026-11-20 | 339 | 3,092 | 3,092 | 336 | 3,092 | 0 | 0 |

Stored OR, trainer and jockey counts use resolved runner rows. Class, distance, going and handicap counts use race rows. Prior counts use verified starters and strictly earlier reliable results. “Form” requires at least one prior start in the same racing family. The bookmaker book count additionally requires a timestamped pre-off archive, matched identities and a valid price on every active runner. All four families had zero provider Topspeed and zero Racing Post Ratings in the result rows used here.

| Year | Family | Stored OR | Trainer ID | Jockey ID | Class | Distance | Going | Handicap known | Prior run | Same-family form | Prior OR | Quote books |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2024 | CHASE | 12,166 | 13,321 | 13,321 | 1,380 | 1,683 | 1,679 | 1,683 | 10,936 | 9,216 | 8,489 | 0 |
| 2024 | HURDLE | 19,322 | 28,910 | 28,910 | 2,081 | 2,860 | 2,854 | 2,860 | 21,384 | 19,878 | 13,101 | 0 |
| 2024 | AW | 24,481 | 29,807 | 29,807 | 2,818 | 3,144 | 3,134 | 3,144 | 24,030 | 20,439 | 17,390 | 0 |
| 2024 | TURF | 34,622 | 44,720 | 44,720 | 3,802 | 4,691 | 4,664 | 4,691 | 37,546 | 33,411 | 26,070 | 0 |
| 2025 | CHASE | 11,890 | 13,081 | 13,081 | 1,399 | 1,707 | 1,702 | 1,707 | 12,785 | 11,229 | 10,258 | 0 |
| 2025 | HURDLE | 19,013 | 27,823 | 27,823 | 2,122 | 2,911 | 2,908 | 2,911 | 24,703 | 23,715 | 16,083 | 0 |
| 2025 | AW | 23,401 | 28,634 | 28,634 | 2,799 | 3,106 | 3,104 | 3,106 | 26,832 | 23,979 | 19,828 | 0 |
| 2025 | TURF | 34,839 | 44,561 | 44,561 | 3,867 | 4,740 | 4,739 | 4,740 | 40,800 | 39,027 | 30,472 | 0 |
| 2026 | CHASE | 9,424 | 10,189 | 10,189 | 1,122 | 1,401 | 1,385 | 1,401 | 10,081 | 8,870 | 8,238 | 200 |
| 2026 | HURDLE | 16,344 | 23,438 | 23,438 | 1,721 | 2,435 | 2,420 | 2,435 | 21,118 | 20,543 | 14,087 | 310 |
| 2026 | AW | 19,385 | 23,556 | 23,556 | 2,328 | 2,591 | 2,574 | 2,591 | 22,143 | 19,890 | 16,435 | 382 |
| 2026 | TURF | 35,279 | 44,497 | 44,497 | 3,862 | 4,762 | 4,726 | 4,762 | 40,939 | 39,387 | 31,059 | 430 |

The trainer and jockey prior-window counts were **113,440 and 113,189** of 114,067 verified starters in 2025, and **101,159 and 101,038** of 101,663 in 2026. The 2026 archives contained 1,362 exact-field pre-off cards, 9,986 starter OR values on those cards and 1,322 complete bookmaker books. Target OR from later results was withheld. The model uses the OR recorded on the last verified same-family prior race.

| Year | Family | v4 cache race dates | Cache races | Cache rows | Earlier dated history | Earlier Best L3 Speed | Earlier performance rating |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2025 | CHASE | 2025-01-01 – 2025-12-31 | 1,707 | 14,349 | 14,047 | 12,585 | 13,255 |
| 2025 | HURDLE | 2025-01-01 – 2025-12-31 | 2,911 | 30,820 | 28,906 | 24,212 | 25,299 |
| 2025 | AW | 2025-01-01 – 2025-12-31 | 3,106 | 30,664 | 28,763 | 22,902 | 25,614 |
| 2025 | TURF | 2025-02-03 – 2025-11-08 | 4,740 | 48,657 | 44,662 | 39,511 | 42,191 |
| 2026 | CHASE | 2026-01-01 – 2026-09-16 | 1,052 | 8,719 | 8,620 | 8,127 | 8,444 |
| 2026 | HURDLE | 2026-01-01 – 2026-09-16 | 1,816 | 19,498 | 18,666 | 16,331 | 17,023 |
| 2026 | AW | 2026-01-01 – 2026-09-15 | 1,972 | 18,671 | 17,639 | 14,721 | 16,126 |
| 2026 | TURF | 2026-02-15 – 2026-09-16 | 3,953 | 39,660 | 36,454 | 32,103 | 34,781 |

The full-population v4 feature cache covered 128,732 rows in 2025 and 89,442 in 2026. The latter stops on **16 September**, and its Jump timing guard is the superseded version 1. The isolated guard-v2 candidate stops on 14 October. The models used one consistent independent feature pipeline across all years. The provider prior-speed column was zero throughout and fitted zero weight. The observed Speed counts above are from the separately inventoried feature cache.

### Excluded races and 2026 gaps

An exclusion reason appears once per database race. Complete-SP counts are separate from outcome eligibility. All accepted 2024–2026 fields in this snapshot also had exact complete final-SP books.

| Year | Race rows | Verified fields | Excluded | Missing source | Nonterminal | Void | Result mismatch | Identity mismatch | Starter/outcome proof | Unsupported |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2024 | 12,783 | 12,319 | 464 | 0 | 49 | 2 | 3 | 0 | 5 | 405 |
| 2025 | 12,866 | 12,442 | 424 | 0 | 11 | 4 | 1 | 0 | 6 | 402 |
| 2026 | 11,528 | 11,070 | 458 | 73 | 39 | 4 | 1 | 0 | 2 | 339 |

For 2026 the main gaps were the **73** supported records without matching full-result payloads and **39** with nonterminal payloads. Missing full results concentrate on 9 October (10 AW), 15 October (34 across the four families), 25–26 October (12 Jump) and 27 October (eight Turf). The raw UK/Ireland provider results indexes cover **322 of 324** dates through 20 November, with 9 and 15 October absent. Of 11,497 distinct terminal-listed races, **130** lacked a database provider ID, all at Down Royal or Downpatrick. An index listing establishes an event, with insufficient evidence to produce its settled field. The 2025 calendar had 171 such unimported results on 365 available dates. The 2024 calendar had 172 on 366 dates. Exact IDs, daily exclusions and cached source hashes are in the inventory.

All eight repaired **9 October 2026** Flat races appear in the independent price-complete population. They contributed **91 starters** (80 AW and 11 Turf) and also enter later prior histories. The study left missing races outside the eligible set and kept unaffected fixtures on those dates. [Flat repair evidence](racing-2026-10-09-flat-results-repair.md) · [Earlier coverage audit](racing-2025-2026-data-market-trainer-audit.md)

## 2. Fixed model definitions

The study fitted three models and evaluated one fixed market blend. The [versioned parameter artifact](full-history-profitability-parameters-v1.json) contains the full-precision A, B and D coefficient vectors in feature order. The [feature builder and predictor](../src/lib/racing/full-history-profitability.ts) and [fit and evaluation driver](../scripts/full-history-profitability.ts) specify the calculation and abstention rules.

### Shared feature construction

The history builder prepares all races on a date before recording any results from that date. Only reconciled earlier starters contribute horse, trainer and jockey history. A prior completion score is `max(0, 1 − (position − 1)/(starters − 1))`, with zero for a resolved non-finisher. Form scores enter the model as `2 × mean − 1` where centring is specified, with zero for missing values. A field rank is the number of observed runners below the value minus the number above it, divided by the number of other observed runners. It is zero with missing or insufficient data. Clipping below means bounding a value to `[−1, 1]`.

### A · Relative Ability · `INDEPENDENT_RELATIVE_ABILITY_V1`

The 11 inputs, in coefficient order, are latest same-family prior official-rating field rank, mean observed Speed field rank over the last three same-family runs, last-three same-family form field rank, centred latest same-family form, centred distance-matched form, centred going-matched form, class drop, same-family experience, carried-weight field rank, missing same-family form and missing prior Speed. Distance and going matches look back up to eight same-family starts. The distance tolerance is 15% of target distance, and going uses exact normalised text. Class drop is the clipped difference between target and latest same-family class divided by three. Experience is same-family starts capped at 12 and divided by 12.

A linear score is converted to win probabilities by a race softmax. A fitted race-mean cross-entropy against winner credit with L2 penalty 0.025, using 72 gradient steps of size 0.6 from zero. In priced fields its policy takes up to two runners with the highest `probability × captured decimal quote − 1` at an edge of at least 5%. A runner-ID tie-break applies. The broad `A_TOP` result stakes the top forecast once per race as a diagnostic.

### B · Placement · `INDEPENDENT_PLACEMENT_V1`

The ten inputs are the trainer-family, jockey-family and horse-trainer rates over the previous 365 days, layoff suitability, class drop, centred latest same-family form, class drop interacted with known handicap status, missing same-family form, no trainer starts and no jockey starts. The horse-trainer rate uses the pairing across supported families. Each rate is clipped `5 × (prior win credit − 0.10 × starts)/(starts + 12)`. Layoff suitability is clipped `1 − |log(days since last recorded start / 28)|`, with zero for missing history.

B used the same probability fitting procedure and quoted selection rule as A, with its own coefficients. The broad `B_TOP` result stakes its top forecast once per race.

### C · Fixed pre-off market blend

For runner `i`, let `mᵢ` be normalised inverse captured decimal odds and `qᵢ = (pAᵢ + pBᵢ)/2`. C uses the race softmax of `0.5 × log(mᵢ) + 0.5 × log(qᵢ)` and the same 5% edge, two-bet limit and runner-ID tie-break as A and B. C has no separately fitted coefficients. A, B and C abstain from the value policy when a complete eligible quote book is missing.

### D · Capped Return · `INDEPENDENT_CAPPED_RETURN_V1`

The 24 inputs are an intercept, clipped `(field size − 10)/10`, the known-handicap indicator, then the complete A and B feature vectors in order. D uses a linear score and fits the runner-level target `winner credit × min(final decimal SP, 21) − 1` by penalised least squares. It uses 240 gradient steps of size 0.08 from zero and L2 penalty 0.025 on all coefficients except the intercept. Winner credit is one divided by the number of dead-heat winners for a winning runner and zero otherwise. D takes up to two runners with the highest strictly positive scores, with runner ID breaking ties. It uses no target-race quote or final SP as a predictor.

**Optimisation boundary.** D used known results to fit a capped historical return target. A and B fitted winner probabilities, and C used a fixed blend. The thresholds and selection limits were fixed. Actual uncapped realised ROI was never the fitting objective.

## 3. Training, validation and replay populations

| Population | Dates | Races | Starters | Role |
| --- | --- | ---: | ---: | --- |
| 2024 verified | 1 Jan–31 Dec 2024 | 12,319 | 116,697 | Prior-history support |
| 2025 fit | 1 Jan–30 Sep 2025 | 9,351 | 85,310 | A, B and D fit |
| 2025 validation | 1 Oct–31 Dec 2025 | 3,091 | 28,757 | Chronological validation, fixed weights |
| 2025 full year | 1 Jan–31 Dec 2025 | 12,442 | 114,067 | Fit and validation combined |
| 2026 replay | 1 Jan–20 Nov 2026 | 11,070 | 101,663 | Previously explored period, fixed weights |
| 2026 with archived quotes | Sep–Nov 2026 | 1,322 | 12,278 | A/B/C value policies and matched D/SP |
| Frozen T2 overlap | Nov 2026 | 380 | 3,622 | Race and frozen runner match after fit |
| Frozen T2 overlap with archived quotes | Nov 2026 | 245 | 2,293 | Value-policy comparison on common fields |

The broad replay uses the reconciled final starter field as an at-off proxy. The quote regime requires the archived pre-off card to match that field by provider ride and horse ID, and a bookmaker price for every active runner. Final SP was used for settlement and retrospective market comparisons. The market favourite is the shortest final SP with ties broken by runner ID. Every bet is a £1 win stake, with canonical settlement v3 and uncapped final SP. Market expectation uses normalised inverse final SP, and market A/E uses split dead-heat winner credit. Strike rates count winning tickets.

## 4. Broad 2025 and 2026 results

A_TOP and B_TOP are top-probability diagnostics. The D rows are the return model’s actual decisions and allow zero to two bets per race. The SP row stakes the final-SP favourite once per race. The columns excluding wins remove the highest-profit winning tickets in that policy and population. The original odds are decimal in the mean/median columns.

### 2025 full year

| Policy | Races | Starters | £1 bets | No selection races | Wins | Strike | £1 P/L | ROI | Mean / median SP | Market E | A/E | Excl. top win | Excl. top two |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A_TOP | 12,442 | 114,067 | 12,442 | 0 | 2,833 | 22.8% | −£2,220.87 | -17.85% | 6.69 / 4.50 | 2800.37 | 1.01 | −£2,260.87 | −£2,293.87 |
| B_TOP | 12,442 | 114,067 | 12,442 | 0 | 3,131 | 25.2% | −£1,691.70 | -13.60% | 5.60 / 4.20 | 2997.34 | 1.04 | −£1,741.70 | −£1,774.70 |
| D | 12,442 | 114,067 | 1,203 | 11,341 | 369 | 30.7% | −£189.33 | -15.74% | 3.73 / 3.25 | 378.88 | 0.97 | −£198.33 | −£206.33 |
| SP | 12,442 | 114,067 | 12,442 | 0 | 4,332 | 34.8% | −£1,170.64 | -9.41% | 2.99 / 2.88 | 4059.34 | 1.07 | −£1,178.14 | −£1,185.14 |

### 2025 Jan–Sep fit

| Policy | Races | Starters | £1 bets | No selection races | Wins | Strike | £1 P/L | ROI | Mean / median SP | Market E | A/E | Excl. top win | Excl. top two |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A_TOP | 9,351 | 85,310 | 9,351 | 0 | 2,159 | 23.1% | −£1,600.01 | -17.11% | 6.52 / 4.50 | 2128.67 | 1.01 | −£1,633.01 | −£1,666.01 |
| B_TOP | 9,351 | 85,310 | 9,351 | 0 | 2,350 | 25.1% | −£1,285.25 | -13.74% | 5.56 / 4.33 | 2260.14 | 1.04 | −£1,335.25 | −£1,363.25 |
| D | 9,351 | 85,310 | 869 | 8,551 | 272 | 31.3% | −£136.74 | -15.74% | 3.54 / 3.00 | 281.88 | 0.96 | −£145.74 | −£153.74 |
| SP | 9,351 | 85,310 | 9,351 | 0 | 3,246 | 34.7% | −£800.18 | -8.56% | 3.01 / 2.88 | 3039.12 | 1.07 | −£807.68 | −£814.68 |

### 2025 Oct–Dec validation

| Policy | Races | Starters | £1 bets | No selection races | Wins | Strike | £1 P/L | ROI | Mean / median SP | Market E | A/E | Excl. top win | Excl. top two |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A_TOP | 3,091 | 28,757 | 3,091 | 0 | 674 | 21.8% | −£620.86 | -20.09% | 7.22 / 4.50 | 671.70 | 1.00 | −£660.86 | −£693.86 |
| B_TOP | 3,091 | 28,757 | 3,091 | 0 | 781 | 25.3% | −£406.45 | -13.15% | 5.75 / 4.20 | 737.20 | 1.06 | −£439.45 | −£467.45 |
| D | 3,091 | 28,757 | 334 | 2,790 | 97 | 29.0% | −£52.59 | -15.75% | 4.23 / 3.50 | 97.00 | 1.00 | −£60.09 | −£67.09 |
| SP | 3,091 | 28,757 | 3,091 | 0 | 1,086 | 35.1% | −£370.46 | -11.99% | 2.93 / 2.75 | 1020.23 | 1.06 | −£375.96 | −£380.96 |

### 2026 replay through 20 November

| Policy | Races | Starters | £1 bets | No selection races | Wins | Strike | £1 P/L | ROI | Mean / median SP | Market E | A/E | Excl. top win | Excl. top two |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A_TOP | 11,070 | 101,663 | 11,070 | 0 | 2,578 | 23.3% | −£2,054.46 | -18.56% | 6.63 / 4.33 | 2548.57 | 1.01 | −£2,134.46 | −£2,167.46 |
| B_TOP | 11,070 | 101,663 | 11,070 | 0 | 2,735 | 24.7% | −£2,052.75 | -18.54% | 5.68 / 4.00 | 2702.77 | 1.01 | −£2,085.75 | −£2,110.75 |
| D | 11,070 | 101,663 | 1,272 | 9,944 | 384 | 30.2% | −£180.59 | -14.20% | 3.82 / 3.13 | 394.43 | 0.97 | −£191.59 | −£201.59 |
| SP | 11,070 | 101,663 | 11,070 | 0 | 3,874 | 35.0% | −£1,159.45 | -10.47% | 2.95 / 2.88 | 3637.21 | 1.06 | −£1,165.45 | −£1,171.45 |

<details>
<summary>2025 full year family results</summary>

#### CHASE

| Policy | Races | Starters | £1 bets | No selection races | Wins | Strike | £1 P/L | ROI | Mean / median SP | Market E | A/E | Excl. top win | Excl. top two |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A_TOP | 1,698 | 13,077 | 1,698 | 0 | 366 | 21.6% | −£271.14 | -15.97% | 5.99 / 4.33 | 388.61 | 0.94 | −£304.14 | −£332.14 |
| B_TOP | 1,698 | 13,077 | 1,698 | 0 | 416 | 24.5% | −£220.41 | -12.98% | 5.51 / 4.00 | 419.15 | 0.99 | −£248.41 | −£276.41 |
| D | 1,698 | 13,077 | 425 | 1,321 | 121 | 28.5% | −£63.48 | -14.94% | 3.92 / 3.25 | 127.31 | 0.95 | −£71.48 | −£78.98 |
| SP | 1,698 | 13,077 | 1,698 | 0 | 567 | 33.4% | −£202.70 | -11.94% | 2.96 / 2.88 | 567.06 | 1.00 | −£210.20 | −£216.70 |

#### HURDLE

| Policy | Races | Starters | £1 bets | No selection races | Wins | Strike | £1 P/L | ROI | Mean / median SP | Market E | A/E | Excl. top win | Excl. top two |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A_TOP | 2,905 | 27,802 | 2,905 | 0 | 703 | 24.2% | −£544.45 | -18.74% | 6.73 / 4.50 | 684.98 | 1.03 | −£584.45 | −£617.45 |
| B_TOP | 2,905 | 27,802 | 2,905 | 0 | 796 | 27.4% | −£451.03 | -15.53% | 5.44 / 4.00 | 741.61 | 1.07 | −£471.03 | −£489.03 |
| D | 2,905 | 27,802 | 362 | 2,578 | 105 | 29.0% | −£84.03 | -23.21% | 3.89 / 3.23 | 113.64 | 0.92 | −£93.03 | −£100.53 |
| SP | 2,905 | 27,802 | 2,905 | 0 | 1,133 | 39.0% | −£197.87 | -6.81% | 2.81 / 2.63 | 1019.13 | 1.11 | −£204.37 | −£209.37 |

#### AW

| Policy | Races | Starters | £1 bets | No selection races | Wins | Strike | £1 P/L | ROI | Mean / median SP | Market E | A/E | Excl. top win | Excl. top two |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A_TOP | 3,102 | 28,634 | 3,102 | 0 | 705 | 22.7% | −£517.89 | -16.70% | 7.41 / 4.50 | 672.32 | 1.05 | −£550.89 | −£572.89 |
| B_TOP | 3,102 | 28,634 | 3,102 | 0 | 753 | 24.3% | −£413.85 | -13.34% | 5.74 / 4.33 | 716.90 | 1.05 | −£463.85 | −£496.85 |
| D | 3,102 | 28,634 | 148 | 2,960 | 46 | 31.1% | −£21.34 | -14.42% | 3.67 / 3.25 | 45.08 | 1.01 | −£25.34 | −£29.34 |
| SP | 3,102 | 28,634 | 3,102 | 0 | 1,098 | 35.4% | −£194.49 | -6.27% | 3.01 / 2.88 | 987.06 | 1.11 | −£199.49 | −£203.99 |

#### TURF

| Policy | Races | Starters | £1 bets | No selection races | Wins | Strike | £1 P/L | ROI | Mean / median SP | Market E | A/E | Excl. top win | Excl. top two |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A_TOP | 4,737 | 44,554 | 4,737 | 0 | 1,059 | 22.4% | −£887.39 | -18.73% | 6.44 / 4.50 | 1054.46 | 1.00 | −£912.39 | −£937.39 |
| B_TOP | 4,737 | 44,554 | 4,737 | 0 | 1,166 | 24.6% | −£606.41 | -12.80% | 5.65 / 4.33 | 1119.69 | 1.04 | −£631.41 | −£656.41 |
| D | 4,737 | 44,554 | 268 | 4,482 | 97 | 36.2% | −£20.48 | -7.64% | 3.26 / 2.94 | 92.85 | 1.04 | −£25.98 | −£30.98 |
| SP | 4,737 | 44,554 | 4,737 | 0 | 1,534 | 32.4% | −£575.58 | -12.15% | 3.10 / 3.00 | 1486.09 | 1.03 | −£582.58 | −£589.08 |

</details>

<details>
<summary>2026 previously explored family results</summary>

#### CHASE

| Policy | Races | Starters | £1 bets | No selection races | Wins | Strike | £1 P/L | ROI | Mean / median SP | Market E | A/E | Excl. top win | Excl. top two |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A_TOP | 1,382 | 10,187 | 1,382 | 0 | 330 | 23.9% | −£252.14 | -18.24% | 6.04 / 4.00 | 328.42 | 1.00 | −£270.14 | −£284.14 |
| B_TOP | 1,382 | 10,187 | 1,382 | 0 | 356 | 25.8% | −£251.80 | -18.22% | 5.29 / 4.00 | 350.54 | 1.01 | −£261.80 | −£271.80 |
| D | 1,382 | 10,187 | 487 | 970 | 149 | 30.6% | −£50.90 | -10.45% | 3.99 / 3.25 | 143.75 | 1.03 | −£60.90 | −£69.40 |
| SP | 1,382 | 10,187 | 1,382 | 0 | 505 | 36.5% | −£79.71 | -5.77% | 2.90 / 2.75 | 469.92 | 1.07 | −£85.71 | −£90.71 |

#### HURDLE

| Policy | Races | Starters | £1 bets | No selection races | Wins | Strike | £1 P/L | ROI | Mean / median SP | Market E | A/E | Excl. top win | Excl. top two |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A_TOP | 2,418 | 23,423 | 2,418 | 0 | 572 | 23.7% | −£517.51 | -21.40% | 6.67 / 4.33 | 568.27 | 1.01 | −£550.51 | −£575.51 |
| B_TOP | 2,418 | 23,423 | 2,418 | 0 | 595 | 24.6% | −£589.81 | -24.39% | 5.54 / 4.00 | 615.11 | 0.97 | −£607.81 | −£619.81 |
| D | 2,418 | 23,423 | 318 | 2,139 | 90 | 28.3% | −£39.64 | -12.46% | 3.80 / 3.25 | 96.24 | 0.94 | −£48.14 | −£55.14 |
| SP | 2,418 | 23,423 | 2,418 | 0 | 864 | 35.7% | −£333.42 | -13.79% | 2.85 / 2.63 | 826.87 | 1.04 | −£339.42 | −£344.92 |

#### AW

| Policy | Races | Starters | £1 bets | No selection races | Wins | Strike | £1 P/L | ROI | Mean / median SP | Market E | A/E | Excl. top win | Excl. top two |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A_TOP | 2,550 | 23,556 | 2,550 | 0 | 592 | 23.2% | −£445.05 | -17.45% | 7.26 / 4.33 | 567.65 | 1.04 | −£465.05 | −£483.05 |
| B_TOP | 2,550 | 23,556 | 2,550 | 0 | 648 | 25.4% | −£262.66 | -10.30% | 5.84 / 4.00 | 598.09 | 1.08 | −£295.66 | −£311.66 |
| D | 2,550 | 23,556 | 173 | 2,389 | 56 | 32.4% | −£18.60 | -10.75% | 3.64 / 2.75 | 57.08 | 0.98 | −£29.60 | −£36.10 |
| SP | 2,550 | 23,556 | 2,550 | 0 | 893 | 35.0% | −£245.64 | -9.63% | 2.93 / 2.88 | 825.87 | 1.08 | −£250.14 | −£254.64 |

#### TURF

| Policy | Races | Starters | £1 bets | No selection races | Wins | Strike | £1 P/L | ROI | Mean / median SP | Market E | A/E | Excl. top win | Excl. top two |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A_TOP | 4,720 | 44,497 | 4,720 | 0 | 1,084 | 23.0% | −£839.76 | -17.79% | 6.45 / 4.33 | 1084.23 | 1.00 | −£919.76 | −£939.76 |
| B_TOP | 4,720 | 44,497 | 4,720 | 0 | 1,136 | 24.1% | −£948.47 | -20.09% | 5.78 / 4.00 | 1139.03 | 1.00 | −£973.47 | −£998.47 |
| D | 4,720 | 44,497 | 294 | 4,446 | 89 | 30.3% | −£71.46 | -24.31% | 3.68 / 3.00 | 97.34 | 0.91 | −£76.96 | −£81.46 |
| SP | 4,720 | 44,497 | 4,720 | 0 | 1,612 | 34.2% | −£500.68 | -10.61% | 3.04 / 2.88 | 1514.54 | 1.06 | −£506.18 | −£511.68 |

</details>

## 5. Genuine captured bookmaker books

The 1,322 complete books span September to November 2026. Each policy was evaluated on the same fields. A and B used the offered prices for qualification only. C used them both as a forecast prior and for qualification. D’s decisions are identical with or without those quotes. All returns used final SP. There are no complete 2025 pre-off books under these checks.

| Policy | Races | Starters | £1 bets | No selection races | Wins | Strike | £1 P/L | ROI | Mean / median SP | Market E | A/E | Excl. top win | Excl. top two |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | 1,322 | 12,278 | 2,514 | 9 | 110 | 4.4% | −£603.88 | -24.02% | 65.75 / 29.00 | 122.26 | 0.90 | −£803.88 | −£928.88 |
| B | 1,322 | 12,278 | 2,500 | 11 | 105 | 4.2% | −£841.08 | -33.64% | 66.62 / 29.00 | 119.38 | 0.88 | −£1,041.08 | −£1,166.08 |
| C | 1,322 | 12,278 | 2,174 | 103 | 73 | 3.4% | −£766.00 | -35.23% | 73.60 / 34.00 | 89.13 | 0.82 | −£966.00 | −£1,091.00 |
| D | 1,322 | 12,278 | 161 | 1,185 | 40 | 24.8% | −£29.22 | -18.15% | 4.35 / 3.50 | 43.63 | 0.92 | −£39.22 | −£45.22 |
| SP | 1,322 | 12,278 | 1,322 | 0 | 474 | 35.9% | −£124.13 | -9.39% | 2.94 / 2.75 | 434.54 | 1.09 | −£129.63 | −£134.13 |

<details>
<summary>2026 captured bookmaker books by family</summary>

#### CHASE

| Policy | Races | Starters | £1 bets | No selection races | Wins | Strike | £1 P/L | ROI | Mean / median SP | Market E | A/E | Excl. top win | Excl. top two |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | 200 | 1,303 | 342 | 4 | 37 | 10.8% | −£105.92 | -30.97% | 23.72 / 12.00 | 36.15 | 1.02 | −£130.92 | −£144.92 |
| B | 200 | 1,303 | 337 | 6 | 42 | 12.5% | −£92.21 | -27.36% | 22.85 / 12.00 | 35.97 | 1.17 | −£104.21 | −£115.21 |
| C | 200 | 1,303 | 288 | 21 | 29 | 10.1% | −£102.25 | -35.50% | 25.71 / 13.00 | 27.96 | 1.04 | −£116.25 | −£128.25 |
| D | 200 | 1,303 | 82 | 132 | 19 | 23.2% | −£7.93 | -9.67% | 4.37 / 3.50 | 21.81 | 0.87 | −£17.93 | −£23.93 |
| SP | 200 | 1,303 | 200 | 0 | 68 | 34.0% | −£38.23 | -19.11% | 2.78 / 2.63 | 70.45 | 0.97 | −£41.56 | −£44.56 |

#### HURDLE

| Policy | Races | Starters | £1 bets | No selection races | Wins | Strike | £1 P/L | ROI | Mean / median SP | Market E | A/E | Excl. top win | Excl. top two |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | 310 | 2,760 | 584 | 5 | 26 | 4.5% | −£216.47 | -37.07% | 77.99 / 34.00 | 27.32 | 0.95 | −£296.47 | −£336.47 |
| B | 310 | 2,760 | 584 | 2 | 16 | 2.7% | −£353.88 | -60.60% | 78.43 / 34.00 | 27.09 | 0.59 | −£433.88 | −£466.88 |
| C | 310 | 2,760 | 505 | 26 | 11 | 2.2% | −£311.25 | -61.63% | 88.24 / 41.00 | 18.10 | 0.61 | −£391.25 | −£424.25 |
| D | 310 | 2,760 | 40 | 277 | 16 | 40.0% | +£6.23 | 15.57% | 3.99 / 3.50 | 10.48 | 1.53 | +£2.23 | −£0.77 |
| SP | 310 | 2,760 | 310 | 0 | 125 | 40.3% | −£4.31 | -1.39% | 2.74 / 2.63 | 110.09 | 1.14 | −£9.81 | −£13.31 |

#### AW

| Policy | Races | Starters | £1 bets | No selection races | Wins | Strike | £1 P/L | ROI | Mean / median SP | Market E | A/E | Excl. top win | Excl. top two |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | 382 | 3,819 | 757 | 0 | 24 | 3.2% | −£26.00 | -3.43% | 73.01 / 41.00 | 27.37 | 0.88 | −£226.00 | −£351.00 |
| B | 382 | 3,819 | 754 | 0 | 20 | 2.7% | −£175.25 | -23.24% | 75.03 / 41.00 | 25.30 | 0.79 | −£375.25 | −£500.25 |
| C | 382 | 3,819 | 682 | 16 | 15 | 2.2% | −£157.50 | -23.09% | 79.27 / 41.00 | 20.77 | 0.72 | −£357.50 | −£482.50 |
| D | 382 | 3,819 | 18 | 366 | 3 | 16.7% | −£13.58 | -75.47% | 4.91 / 3.44 | 5.58 | 0.54 | −£14.16 | −£14.60 |
| SP | 382 | 3,819 | 382 | 0 | 132 | 34.6% | −£53.45 | -13.99% | 2.95 / 2.88 | 122.23 | 1.08 | −£57.95 | −£61.95 |

#### TURF

| Policy | Races | Starters | £1 bets | No selection races | Wins | Strike | £1 P/L | ROI | Mean / median SP | Market E | A/E | Excl. top win | Excl. top two |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | 430 | 4,396 | 831 | 0 | 23 | 2.8% | −£255.50 | -30.75% | 67.82 / 34.00 | 31.42 | 0.73 | −£355.50 | −£435.50 |
| B | 430 | 4,396 | 825 | 3 | 27 | 3.3% | −£219.75 | -26.64% | 68.45 / 34.00 | 31.02 | 0.87 | −£319.75 | −£399.75 |
| C | 430 | 4,396 | 699 | 40 | 18 | 2.6% | −£195.00 | -27.90% | 77.21 / 41.00 | 22.29 | 0.81 | −£295.00 | −£375.00 |
| D | 430 | 4,396 | 21 | 410 | 2 | 9.5% | −£13.93 | -66.33% | 4.51 / 3.25 | 5.77 | 0.35 | −£18.43 | −£19.00 |
| SP | 430 | 4,396 | 430 | 0 | 149 | 34.7% | −£28.14 | -6.54% | 3.13 / 3.00 | 131.78 | 1.13 | −£32.64 | −£37.14 |

</details>

D’s only positive quoted-family result was Hurdle, **+£6.23** from 40 bets on that coverage subset. Removing its two largest winners leaves **−£0.77**. Its broad 2026 Hurdle result was **−£39.64** across 318 bets. In the fixed replay A, B and C each included Acrackintime at final **200/1** and Splintered at **125/1**. All three still lost overall. [Machine evaluation](full-history-profitability-evaluation-v1.json)

The forecast adjustment in C worsened the archived quote baseline. The table uses dead-heat winner credit, race-average multiclass Brier and race-average cross-entropy. Calibration bins are in the evaluation artifact. D estimates net return and has no probability forecast.

| Population | Policy | Races | Log loss | Brier |
| --- | --- | --- | --- | --- |
| validation | A | 3,091 | 2.0482 | 0.8480 |
| validation | B | 3,091 | 2.0116 | 0.8365 |
| validation | SP | 3,091 | 1.7307 | 0.7582 |
| replay | A | 11,070 | 2.0275 | 0.8437 |
| replay | B | 11,070 | 2.0040 | 0.8366 |
| replay | SP | 11,070 | 1.7447 | 0.7646 |
| captured | A | 1,322 | 2.0678 | 0.8543 |
| captured | B | 1,322 | 2.0293 | 0.8423 |
| captured | C | 1,322 | 1.8717 | 0.8008 |
| captured | QUOTE | 1,322 | 1.8057 | 0.7808 |
| captured | SP | 1,322 | 1.7426 | 0.7611 |

## 6. Matched frozen Tissue 2 comparison

The independent model weights were already fixed when the frozen benchmark was loaded. All **380** original matched races joined by stored race and original runner UUID. The code checked the joined final SP, win credit and canonical £1 return against the unchanged artifact. The broad historical figures above have no reconstructed Tissue 2 picks. [Frozen Tissue 2](tissue-t2-profit-baseline-v1.json)

| Policy | Races | Starters | £1 bets | No selection races | Wins | Strike | £1 P/L | ROI | Mean / median SP | Market E | A/E | Excl. top win | Excl. top two |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A_TOP | 380 | 3,622 | 380 | 0 | 79 | 20.8% | −£91.65 | -24.12% | 7.68 / 4.50 | 79.28 | 1.00 | −£102.65 | −£112.65 |
| B_TOP | 380 | 3,622 | 380 | 0 | 91 | 23.9% | −£101.43 | -26.69% | 5.82 / 4.00 | 91.53 | 0.99 | −£111.43 | −£120.43 |
| D | 380 | 3,622 | 48 | 341 | 10 | 20.8% | −£13.49 | -28.10% | 4.33 / 3.38 | 13.12 | 0.76 | −£21.99 | −£25.49 |
| SP | 380 | 3,622 | 380 | 0 | 133 | 35.0% | −£53.59 | -14.10% | 2.86 / 2.75 | 127.65 | 1.04 | −£59.09 | −£63.09 |
| T2 | 380 | 3,622 | 380 | 0 | 83 | 21.8% | −£16.99 | -4.47% | 10.18 / 5.50 | 68.21 | 1.22 | −£34.99 | −£50.99 |

Only **245** of the 380 had independently usable pre-off quote books under the same timestamp, identity and field checks. The T2 results below use exactly those 245 races. Quote policies may take two tickets per race, while T2 and SP favourite each take one.

| Policy | Races | Starters | £1 bets | No selection races | Wins | Strike | £1 P/L | ROI | Mean / median SP | Market E | A/E | Excl. top win | Excl. top two |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | 245 | 2,293 | 461 | 2 | 19 | 4.1% | +£115.83 | 25.13% | 70.50 / 34.00 | 22.24 | 0.85 | −£84.17 | −£209.17 |
| B | 245 | 2,293 | 464 | 3 | 23 | 5.0% | +£128.08 | 27.60% | 69.97 / 34.00 | 22.34 | 1.03 | −£71.92 | −£196.92 |
| C | 245 | 2,293 | 424 | 13 | 16 | 3.8% | +£117.13 | 27.62% | 74.29 / 34.00 | 17.85 | 0.90 | −£82.88 | −£207.88 |
| D | 245 | 2,293 | 34 | 219 | 7 | 20.6% | −£13.11 | -38.55% | 4.47 / 4.33 | 8.63 | 0.81 | −£16.61 | −£19.61 |
| SP | 245 | 2,293 | 245 | 0 | 79 | 32.2% | −£57.41 | -23.43% | 2.86 / 2.75 | 82.71 | 0.96 | −£62.91 | −£66.24 |
| T2 | 245 | 2,293 | 245 | 0 | 57 | 23.3% | +£0.91 | 0.37% | 9.61 / 6.00 | 43.55 | 1.31 | −£15.09 | −£27.09 |

A, B and C showed **+£115.83, +£128.08 and +£117.13** in the quoted overlap. Removing Acrackintime alone leaves **−£84.17, −£71.92 and −£82.88** respectively. Their selected-race comparisons were also volume-sensitive. No overlap gain transferred to the larger 1,322-race quote set.

| Policy | Races with a bet | Policy bets | Policy P/L | T2 P/L | SP favourite P/L |
| --- | --- | --- | --- | --- | --- |
| A | 243 | 461 | +£115.83 | +£2.91 | −£55.41 |
| B | 242 | 464 | +£128.08 | +£3.91 | −£55.94 |
| C | 232 | 424 | +£117.13 | +£0.41 | −£54.27 |
| D | 39 | 48 | −£13.49 | −£18.59 | −£8.13 |

## 7. Monthly stability and price sensitivity

Cells give **bets / £1 P/L / ROI**. Month contains each common opportunity set, including no-bet races. Family, month and price slices with complete metrics are available in the [machine evaluation](full-history-profitability-evaluation-v1.json).

| Month | Races | A_TOP | B_TOP | D | SP |
| --- | --- | --- | --- | --- | --- |
| 2025-01 | 783 | 783 / −£109.10 / -13.9% | 783 / −£84.73 / -10.8% | 58 / −£11.09 / -19.1% | 783 / +£9.34 / 1.2% |
| 2025-02 | 781 | 781 / −£138.32 / -17.7% | 781 / −£68.19 / -8.7% | 91 / −£46.95 / -51.6% | 781 / −£41.93 / -5.4% |
| 2025-03 | 880 | 880 / −£120.03 / -13.6% | 880 / −£31.24 / -3.5% | 106 / −£28.06 / -26.5% | 880 / −£32.76 / -3.7% |
| 2025-04 | 1,076 | 1,076 / −£86.42 / -8.0% | 1,076 / −£180.22 / -16.7% | 78 / −£10.91 / -14.0% | 1,076 / −£129.63 / -12.0% |
| 2025-05 | 1,292 | 1,292 / −£192.07 / -14.9% | 1,292 / −£244.03 / -18.9% | 129 / −£2.64 / -2.0% | 1,292 / −£207.48 / -16.1% |
| 2025-06 | 1,124 | 1,124 / −£257.67 / -22.9% | 1,124 / −£141.56 / -12.6% | 119 / +£8.50 / 7.1% | 1,124 / −£63.53 / -5.7% |
| 2025-07 | 1,180 | 1,180 / −£259.54 / -22.0% | 1,180 / −£159.43 / -13.5% | 110 / −£18.56 / -16.9% | 1,180 / −£156.80 / -13.3% |
| 2025-08 | 1,142 | 1,142 / −£136.19 / -11.9% | 1,142 / −£168.30 / -14.7% | 78 / −£5.82 / -7.5% | 1,142 / −£70.14 / -6.1% |
| 2025-09 | 1,093 | 1,093 / −£300.67 / -27.5% | 1,093 / −£207.55 / -19.0% | 100 / −£21.22 / -21.2% | 1,093 / −£107.25 / -9.8% |
| 2025-10 | 1,232 | 1,232 / −£397.93 / -32.3% | 1,232 / −£78.33 / -6.4% | 131 / −£37.89 / -28.9% | 1,232 / −£169.15 / -13.7% |
| 2025-11 | 957 | 957 / −£69.87 / -7.3% | 957 / −£153.81 / -16.1% | 103 / −£7.18 / -7.0% | 957 / −£93.70 / -9.8% |
| 2025-12 | 902 | 902 / −£153.07 / -17.0% | 902 / −£174.31 / -19.3% | 100 / −£7.52 / -7.5% | 902 / −£107.61 / -11.9% |
| 2026-01 | 811 | 811 / −£70.17 / -8.7% | 811 / −£95.14 / -11.7% | 92 / −£6.27 / -6.8% | 811 / −£104.01 / -12.8% |
| 2026-02 | 785 | 785 / −£192.33 / -24.5% | 785 / −£197.75 / -25.2% | 116 / −£22.82 / -19.7% | 785 / −£59.23 / -7.5% |
| 2026-03 | 867 | 867 / −£101.44 / -11.7% | 867 / −£123.54 / -14.2% | 119 / −£1.82 / -1.5% | 867 / −£45.59 / -5.3% |
| 2026-04 | 1,056 | 1,056 / −£248.86 / -23.6% | 1,056 / −£270.26 / -25.6% | 119 / −£28.23 / -23.7% | 1,056 / −£113.65 / -10.8% |
| 2026-05 | 1,273 | 1,273 / −£282.30 / -22.2% | 1,273 / −£373.06 / -29.3% | 137 / −£34.71 / -25.3% | 1,273 / −£161.12 / -12.7% |
| 2026-06 | 1,127 | 1,127 / −£169.89 / -15.1% | 1,127 / −£127.58 / -11.3% | 119 / −£11.66 / -9.8% | 1,127 / −£133.46 / -11.8% |
| 2026-07 | 1,210 | 1,210 / −£190.41 / -15.7% | 1,210 / −£160.31 / -13.2% | 148 / −£15.92 / -10.8% | 1,210 / −£85.18 / -7.0% |
| 2026-08 | 1,100 | 1,100 / −£227.41 / -20.7% | 1,100 / −£99.36 / -9.0% | 122 / −£14.52 / -11.9% | 1,100 / −£146.52 / -13.3% |
| 2026-09 | 1,124 | 1,124 / −£362.30 / -32.2% | 1,124 / −£269.73 / -24.0% | 112 / −£20.94 / -18.7% | 1,124 / −£173.26 / -15.4% |
| 2026-10 | 1,138 | 1,138 / −£90.36 / -7.9% | 1,138 / −£205.93 / -18.1% | 117 / −£10.42 / -8.9% | 1,138 / −£62.13 / -5.5% |
| 2026-11 | 579 | 579 / −£118.99 / -20.6% | 579 / −£130.08 / -22.5% | 71 / −£13.30 / -18.7% | 579 / −£75.28 / -13.0% |

<details>
<summary>CHASE monthly broad results</summary>

| Month | Races | A_TOP | B_TOP | D | SP |
| --- | --- | --- | --- | --- | --- |
| 2025-01 | 144 | 144 / −£13.78 / -9.6% | 144 / −£3.52 / -2.4% | 25 / −£9.53 / -38.1% | 144 / +£11.34 / 7.9% |
| 2025-02 | 186 | 186 / −£57.95 / -31.2% | 186 / −£18.69 / -10.1% | 48 / −£36.25 / -75.5% | 186 / −£21.01 / -11.3% |
| 2025-03 | 192 | 192 / −£23.32 / -12.1% | 192 / +£17.83 / 9.3% | 45 / −£13.03 / -28.9% | 192 / −£31.28 / -16.3% |
| 2025-04 | 161 | 161 / +£23.68 / 14.7% | 161 / −£29.64 / -18.4% | 33 / −£13.69 / -41.5% | 161 / −£29.69 / -18.4% |
| 2025-05 | 152 | 152 / −£7.36 / -4.8% | 152 / −£25.62 / -16.9% | 30 / +£8.74 / 29.1% | 152 / −£11.79 / -7.8% |
| 2025-06 | 82 | 82 / −£22.12 / -27.0% | 82 / −£36.98 / -45.1% | 35 / −£5.78 / -16.5% | 82 / −£17.58 / -21.4% |
| 2025-07 | 79 | 79 / −£19.73 / -25.0% | 79 / −£37.44 / -47.4% | 15 / +£4.96 / 33.1% | 79 / −£12.10 / -15.3% |
| 2025-08 | 62 | 62 / −£27.08 / -43.7% | 62 / −£29.38 / -47.4% | 11 / −£3.25 / -29.5% | 62 / −£5.05 / -8.1% |
| 2025-09 | 60 | 60 / −£20.58 / -34.3% | 60 / −£12.08 / -20.1% | 31 / +£1.63 / 5.2% | 60 / −£15.19 / -25.3% |
| 2025-10 | 155 | 155 / −£40.54 / -26.2% | 155 / +£2.81 / 1.8% | 48 / −£14.07 / -29.3% | 155 / +£4.84 / 3.1% |
| 2025-11 | 220 | 220 / −£37.97 / -17.3% | 220 / −£15.91 / -7.2% | 51 / +£2.01 / 3.9% | 220 / −£17.56 / -8.0% |
| 2025-12 | 205 | 205 / −£24.38 / -11.9% | 205 / −£31.79 / -15.5% | 53 / +£14.79 / 27.9% | 205 / −£57.63 / -28.1% |
| 2026-01 | 152 | 152 / −£33.64 / -22.1% | 152 / −£37.31 / -24.5% | 40 / −£0.30 / -0.7% | 152 / −£41.52 / -27.3% |
| 2026-02 | 173 | 173 / −£53.38 / -30.9% | 173 / −£62.68 / -36.2% | 49 / −£11.30 / -23.1% | 173 / −£14.58 / -8.4% |
| 2026-03 | 184 | 184 / −£2.32 / -1.3% | 184 / −£4.80 / -2.6% | 57 / +£0.38 / 0.7% | 184 / +£14.66 / 8.0% |
| 2026-04 | 149 | 149 / −£62.77 / -42.1% | 149 / −£10.82 / -7.3% | 62 / −£14.06 / -22.7% | 149 / −£7.16 / -4.8% |
| 2026-05 | 149 | 149 / −£52.26 / -35.1% | 149 / −£50.51 / -33.9% | 58 / −£19.82 / -34.2% | 149 / −£4.84 / -3.2% |
| 2026-06 | 80 | 80 / −£10.15 / -12.7% | 80 / −£22.82 / -28.5% | 37 / +£2.37 / 6.4% | 80 / −£11.15 / -13.9% |
| 2026-07 | 69 | 69 / −£5.25 / -7.6% | 69 / −£5.13 / -7.4% | 24 / +£2.37 / 9.9% | 69 / +£13.23 / 19.2% |
| 2026-08 | 60 | 60 / +£9.70 / 16.2% | 60 / +£2.43 / 4.0% | 23 / −£1.83 / -8.0% | 60 / +£19.21 / 32.0% |
| 2026-09 | 74 | 74 / −£31.47 / -42.5% | 74 / −£25.35 / -34.3% | 38 / −£11.27 / -29.7% | 74 / −£7.26 / -9.8% |
| 2026-10 | 151 | 151 / −£4.07 / -2.7% | 151 / −£11.21 / -7.4% | 57 / +£4.44 / 7.8% | 151 / −£7.58 / -5.0% |
| 2026-11 | 141 | 141 / −£6.53 / -4.6% | 141 / −£23.59 / -16.7% | 42 / −£1.89 / -4.5% | 141 / −£32.71 / -23.2% |

</details>

<details>
<summary>HURDLE monthly broad results</summary>

| Month | Races | A_TOP | B_TOP | D | SP |
| --- | --- | --- | --- | --- | --- |
| 2025-01 | 237 | 237 / −£65.08 / -27.5% | 237 / −£29.42 / -12.4% | 12 / −£6.74 / -56.2% | 237 / +£17.11 / 7.2% |
| 2025-02 | 272 | 272 / −£55.59 / -20.4% | 272 / −£63.08 / -23.2% | 21 / −£5.45 / -25.9% | 272 / −£36.29 / -13.3% |
| 2025-03 | 300 | 300 / −£45.55 / -15.2% | 300 / −£15.18 / -5.1% | 30 / −£8.28 / -27.6% | 300 / −£21.80 / -7.3% |
| 2025-04 | 285 | 285 / −£79.09 / -27.7% | 285 / −£67.72 / -23.8% | 33 / +£6.01 / 18.2% | 285 / −£87.21 / -30.6% |
| 2025-05 | 253 | 253 / −£38.02 / -15.0% | 253 / −£52.30 / -20.7% | 49 / −£6.83 / -13.9% | 253 / −£33.13 / -13.1% |
| 2025-06 | 148 | 148 / −£22.65 / -15.3% | 148 / −£14.73 / -10.0% | 31 / +£10.00 / 32.3% | 148 / −£1.75 / -1.2% |
| 2025-07 | 166 | 166 / −£51.72 / -31.2% | 166 / −£33.39 / -20.1% | 27 / −£11.68 / -43.3% | 166 / +£11.70 / 7.0% |
| 2025-08 | 128 | 128 / −£34.85 / -27.2% | 128 / +£4.97 / 3.9% | 11 / −£4.00 / -36.4% | 128 / +£15.56 / 12.2% |
| 2025-09 | 131 | 131 / −£28.35 / -21.6% | 131 / −£6.04 / -4.6% | 26 / −£10.59 / -40.7% | 131 / +£14.77 / 11.3% |
| 2025-10 | 280 | 280 / −£95.47 / -34.1% | 280 / −£30.86 / -11.0% | 49 / −£13.83 / -28.2% | 280 / −£27.81 / -9.9% |
| 2025-11 | 371 | 371 / −£9.51 / -2.6% | 371 / −£70.68 / -19.1% | 40 / −£7.19 / -18.0% | 371 / −£4.64 / -1.3% |
| 2025-12 | 334 | 334 / −£18.57 / -5.6% | 334 / −£72.57 / -21.7% | 33 / −£25.46 / -77.1% | 334 / −£44.37 / -13.3% |
| 2026-01 | 241 | 241 / −£11.06 / -4.6% | 241 / −£22.15 / -9.2% | 26 / −£1.57 / -6.0% | 241 / −£17.37 / -7.2% |
| 2026-02 | 279 | 279 / −£48.19 / -17.3% | 279 / −£58.74 / -21.1% | 37 / −£3.47 / -9.4% | 279 / −£23.89 / -8.6% |
| 2026-03 | 286 | 286 / −£59.32 / -20.7% | 286 / −£73.47 / -25.7% | 30 / −£12.05 / -40.2% | 286 / −£38.05 / -13.3% |
| 2026-04 | 261 | 261 / −£32.64 / -12.5% | 261 / −£90.53 / -34.7% | 22 / −£9.62 / -43.7% | 261 / −£31.71 / -12.1% |
| 2026-05 | 257 | 257 / −£104.18 / -40.5% | 257 / −£118.26 / -46.0% | 39 / −£16.45 / -42.2% | 257 / −£52.63 / -20.5% |
| 2026-06 | 134 | 134 / −£32.82 / -24.5% | 134 / −£20.51 / -15.3% | 32 / +£6.51 / 20.4% | 134 / −£36.35 / -27.1% |
| 2026-07 | 161 | 161 / −£17.84 / -11.1% | 161 / −£1.72 / -1.1% | 27 / −£10.09 / -37.4% | 161 / −£40.52 / -25.2% |
| 2026-08 | 128 | 128 / −£48.50 / -37.9% | 128 / −£4.57 / -3.6% | 16 / +£11.78 / 73.6% | 128 / −£23.36 / -18.3% |
| 2026-09 | 149 | 149 / −£74.34 / -49.9% | 149 / −£42.16 / -28.3% | 29 / −£0.65 / -2.2% | 149 / −£53.48 / -35.9% |
| 2026-10 | 285 | 285 / −£16.11 / -5.7% | 285 / −£84.33 / -29.6% | 38 / +£1.82 / 4.8% | 285 / +£3.38 / 1.2% |
| 2026-11 | 237 | 237 / −£72.51 / -30.6% | 237 / −£73.38 / -31.0% | 22 / −£5.85 / -26.6% | 237 / −£19.44 / -8.2% |

</details>

<details>
<summary>AW monthly broad results</summary>

| Month | Races | A_TOP | B_TOP | D | SP |
| --- | --- | --- | --- | --- | --- |
| 2025-01 | 402 | 402 / −£30.23 / -7.5% | 402 / −£51.79 / -12.9% | 21 / +£5.18 / 24.7% | 402 / −£19.12 / -4.8% |
| 2025-02 | 322 | 322 / −£23.78 / -7.4% | 322 / +£14.59 / 4.5% | 22 / −£5.25 / -23.9% | 322 / +£13.86 / 4.3% |
| 2025-03 | 341 | 341 / −£38.47 / -11.3% | 341 / −£21.21 / -6.2% | 31 / −£6.75 / -21.8% | 341 / +£6.30 / 1.8% |
| 2025-04 | 229 | 229 / +£11.20 / 4.9% | 229 / +£17.65 / 7.7% | 8 / −£0.37 / -4.6% | 229 / −£33.37 / -14.6% |
| 2025-05 | 124 | 124 / −£52.74 / -42.5% | 124 / −£51.41 / -41.5% | 8 / +£1.37 / 17.1% | 124 / −£14.86 / -12.0% |
| 2025-06 | 126 | 126 / −£82.37 / -65.4% | 126 / −£46.49 / -36.9% | 4 / +£3.58 / 89.6% | 126 / +£31.45 / 25.0% |
| 2025-07 | 66 | 66 / +£11.92 / 18.1% | 66 / +£8.24 / 12.5% | 1 / +£0.83 / 83.3% | 66 / −£8.28 / -12.5% |
| 2025-08 | 172 | 172 / +£1.56 / 0.9% | 172 / −£41.13 / -23.9% | 3 / −£3.00 / -100.0% | 172 / −£28.70 / -16.7% |
| 2025-09 | 277 | 277 / −£91.93 / -33.2% | 277 / −£66.58 / -24.0% | 11 / −£6.28 / -57.0% | 277 / −£14.38 / -5.2% |
| 2025-10 | 352 | 352 / −£92.58 / -26.3% | 352 / −£35.23 / -10.0% | 15 / −£10.30 / -68.7% | 352 / −£54.59 / -15.5% |
| 2025-11 | 328 | 328 / −£20.34 / -6.2% | 328 / −£70.55 / -21.5% | 10 / −£3.51 / -35.1% | 328 / −£67.18 / -20.5% |
| 2025-12 | 363 | 363 / −£110.12 / -30.3% | 363 / −£69.95 / -19.3% | 14 / +£3.15 / 22.5% | 363 / −£5.61 / -1.5% |
| 2026-01 | 418 | 418 / −£25.48 / -6.1% | 418 / −£35.69 / -8.5% | 26 / −£4.40 / -16.9% | 418 / −£45.12 / -10.8% |
| 2026-02 | 332 | 332 / −£89.76 / -27.0% | 332 / −£77.95 / -23.5% | 30 / −£8.05 / -26.8% | 332 / −£22.38 / -6.7% |
| 2026-03 | 350 | 350 / −£19.42 / -5.5% | 350 / −£20.03 / -5.7% | 32 / +£9.86 / 30.8% | 350 / −£24.76 / -7.1% |
| 2026-04 | 249 | 249 / −£70.15 / -28.2% | 249 / −£22.27 / -8.9% | 19 / +£0.84 / 4.4% | 249 / −£21.20 / -8.5% |
| 2026-05 | 106 | 106 / −£28.51 / -26.9% | 106 / −£24.32 / -22.9% | 9 / −£2.50 / -27.8% | 106 / +£15.04 / 14.2% |
| 2026-06 | 90 | 90 / +£31.70 / 35.2% | 90 / +£3.55 / 3.9% | 3 / −£3.00 / -100.0% | 90 / −£33.96 / -37.7% |
| 2026-07 | 127 | 127 / −£7.06 / -5.6% | 127 / −£38.05 / -30.0% | 4 / −£2.38 / -59.6% | 127 / −£21.39 / -16.8% |
| 2026-08 | 168 | 168 / −£33.65 / -20.0% | 168 / +£16.38 / 9.8% | 11 / +£5.52 / 50.1% | 168 / −£29.68 / -17.7% |
| 2026-09 | 252 | 252 / −£98.97 / -39.3% | 252 / −£23.93 / -9.5% | 21 / −£3.23 / -15.4% | 252 / −£8.29 / -3.3% |
| 2026-10 | 289 | 289 / −£71.27 / -24.7% | 289 / −£17.98 / -6.2% | 11 / −£5.68 / -51.6% | 289 / −£30.87 / -10.7% |
| 2026-11 | 169 | 169 / −£32.48 / -19.2% | 169 / −£22.37 / -13.2% | 7 / −£5.56 / -79.4% | 169 / −£23.02 / -13.6% |

</details>

<details>
<summary>TURF monthly broad results</summary>

| Month | Races | A_TOP | B_TOP | D | SP |
| --- | --- | --- | --- | --- | --- |
| 2025-02 | 1 | 1 / −£1.00 / -100.0% | 1 / −£1.00 / -100.0% | 0 / — / — | 1 / +£1.50 / 150.0% |
| 2025-03 | 47 | 47 / −£12.68 / -27.0% | 47 / −£12.68 / -27.0% | 0 / — / — | 47 / +£14.03 / 29.8% |
| 2025-04 | 401 | 401 / −£42.21 / -10.5% | 401 / −£100.50 / -25.1% | 4 / −£2.86 / -71.4% | 401 / +£20.64 / 5.1% |
| 2025-05 | 763 | 763 / −£93.96 / -12.3% | 763 / −£114.70 / -15.0% | 42 / −£5.91 / -14.1% | 763 / −£147.69 / -19.4% |
| 2025-06 | 768 | 768 / −£130.53 / -17.0% | 768 / −£43.36 / -5.6% | 49 / +£0.70 / 1.4% | 768 / −£75.64 / -9.8% |
| 2025-07 | 869 | 869 / −£200.00 / -23.0% | 869 / −£96.84 / -11.1% | 67 / −£12.67 / -18.9% | 869 / −£148.11 / -17.0% |
| 2025-08 | 780 | 780 / −£75.82 / -9.7% | 780 / −£102.76 / -13.2% | 53 / +£4.43 / 8.4% | 780 / −£51.96 / -6.7% |
| 2025-09 | 625 | 625 / −£159.81 / -25.6% | 625 / −£122.85 / -19.7% | 32 / −£5.99 / -18.7% | 625 / −£92.44 / -14.8% |
| 2025-10 | 445 | 445 / −£169.34 / -38.1% | 445 / −£15.05 / -3.4% | 19 / +£0.32 / 1.7% | 445 / −£91.59 / -20.6% |
| 2025-11 | 38 | 38 / −£2.04 / -5.4% | 38 / +£3.33 / 8.8% | 2 / +£1.50 / 75.0% | 38 / −£4.31 / -11.3% |
| 2026-02 | 1 | 1 / −£1.00 / -100.0% | 1 / +£1.63 / 162.5% | 0 / — / — | 1 / +£1.63 / 162.5% |
| 2026-03 | 47 | 47 / −£20.38 / -43.4% | 47 / −£25.25 / -53.7% | 0 / — / — | 47 / +£2.56 / 5.4% |
| 2026-04 | 397 | 397 / −£83.30 / -21.0% | 397 / −£146.64 / -36.9% | 16 / −£5.40 / -33.8% | 397 / −£53.58 / -13.5% |
| 2026-05 | 761 | 761 / −£97.34 / -12.8% | 761 / −£179.96 / -23.6% | 31 / +£4.06 / 13.1% | 761 / −£118.70 / -15.6% |
| 2026-06 | 823 | 823 / −£158.62 / -19.3% | 823 / −£87.79 / -10.7% | 47 / −£17.55 / -37.3% | 823 / −£52.01 / -6.3% |
| 2026-07 | 853 | 853 / −£160.26 / -18.8% | 853 / −£115.42 / -13.5% | 93 / −£5.82 / -6.3% | 853 / −£36.49 / -4.3% |
| 2026-08 | 744 | 744 / −£154.96 / -20.8% | 744 / −£113.60 / -15.3% | 72 / −£29.98 / -41.6% | 744 / −£112.69 / -15.1% |
| 2026-09 | 649 | 649 / −£157.51 / -24.3% | 649 / −£178.29 / -27.5% | 24 / −£5.78 / -24.1% | 649 / −£104.23 / -16.1% |
| 2026-10 | 413 | 413 / +£1.08 / 0.3% | 413 / −£92.41 / -22.4% | 11 / −£11.00 / -100.0% | 413 / −£27.06 / -6.6% |
| 2026-11 | 32 | 32 / −£7.47 / -23.4% | 32 / −£10.73 / -33.5% | 0 / — / — | 32 / −£0.11 / -0.3% |

</details>

### Actual pre-off books by month

| Month | Races | A | B | C | D | SP |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-09 | 341 | 648 / −£236.75 / -36.5% | 648 / −£262.00 / -40.4% | 537 / −£263.50 / -49.1% | 37 / −£15.75 / -42.6% | 341 / −£50.44 / -14.8% |
| 2026-10 | 642 | 1,227 / −£480.09 / -39.1% | 1,210 / −£661.92 / -54.7% | 1,058 / −£578.38 / -54.7% | 77 / −£4.11 / -5.3% | 642 / −£4.11 / -0.6% |
| 2026-11 | 339 | 639 / +£112.96 / 17.7% | 642 / +£82.83 / 12.9% | 579 / +£75.88 / 13.1% | 47 / −£9.36 / -19.9% | 339 / −£69.57 / -20.5% |

### Final-SP price bands

| Scope | Policy | Below 2/1 | 2/1 to <4/1 | 4/1 to <8/1 | 8/1 to <12/1 | 12/1 to <20/1 | 20/1+ |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2025 broad | A_TOP | 3,098 / −£259.53 / -8.4% | 3,659 / −£520.34 / -14.2% | 3,403 / −£647.50 / -19.0% | 1,066 / −£295.50 / -27.7% | 724 / −£299.00 / -41.3% | 492 / −£199.00 / -40.4% |
| 2025 broad | B_TOP | 3,557 / −£247.54 / -7.0% | 3,829 / −£448.16 / -11.7% | 3,292 / −£552.50 / -16.8% | 867 / −£247.50 / -28.5% | 625 / −£254.00 / -40.6% | 272 / +£58.00 / 21.3% |
| 2025 broad | D | 526 / −£39.90 / -7.6% | 425 / −£107.43 / -25.3% | 210 / −£19.00 / -9.0% | 29 / −£10.00 / -34.5% | 10 / −£10.00 / -100.0% | 3 / −£3.00 / -100.0% |
| 2025 broad | SP | 6,486 / −£545.75 / -8.4% | 5,256 / −£600.89 / -11.4% | 700 / −£24.00 / -3.4% | 0 / — / — | 0 / — / — | 0 / — / — |
| 2026 broad | A_TOP | 2,995 / −£251.54 / -8.4% | 3,310 / −£557.43 / -16.8% | 2,791 / −£570.00 / -20.4% | 920 / −£270.50 / -29.4% | 604 / −£159.00 / -26.3% | 450 / −£246.00 / -54.7% |
| 2026 broad | B_TOP | 3,352 / −£297.83 / -8.9% | 3,349 / −£494.42 / -14.8% | 2,710 / −£650.50 / -24.0% | 848 / −£268.00 / -31.6% | 506 / −£169.00 / -33.4% | 305 / −£173.00 / -56.7% |
| 2026 broad | D | 563 / −£53.90 / -9.6% | 437 / −£83.44 / -19.1% | 203 / −£16.25 / -8.0% | 52 / −£10.00 / -19.2% | 16 / −£16.00 / -100.0% | 1 / −£1.00 / -100.0% |
| 2026 broad | SP | 5,948 / −£462.37 / -7.8% | 4,552 / −£555.58 / -12.2% | 570 / −£141.50 / -24.8% | 0 / — / — | 0 / — / — | 0 / — / — |
| 2026 quotes | A | 24 / +£0.78 / 3.3% | 89 / +£2.83 / 3.2% | 212 / −£54.00 / -25.5% | 218 / −£39.50 / -18.1% | 341 / −£168.00 / -49.3% | 1,630 / −£346.00 / -21.2% |
| 2026 quotes | B | 22 / +£0.75 / 3.4% | 80 / +£1.17 / 1.5% | 221 / −£11.50 / -5.2% | 197 / −£52.50 / -26.6% | 345 / −£157.00 / -45.5% | 1,635 / −£622.00 / -38.0% |
| 2026 quotes | C | 12 / +£0.50 / 4.2% | 50 / +£3.00 / 6.0% | 147 / −£36.00 / -24.5% | 151 / −£25.50 / -16.9% | 278 / −£118.00 / -42.4% | 1,536 / −£590.00 / -38.4% |
| 2026 quotes | D | 54 / −£9.97 / -18.5% | 59 / −£11.75 / -19.9% | 36 / −£6.50 / -18.1% | 11 / £0.00 / 0.0% | 1 / −£1.00 / -100.0% | 0 / — / — |
| 2026 quotes | SP | 722 / −£23.00 / -3.2% | 541 / −£85.62 / -15.8% | 59 / −£15.50 / -26.3% | 0 / — / — | 0 / — / — | 0 / — / — |

## 8. Limitations, verification and decision

- **Population and timing.** The broad replay uses reconciled terminal starter rosters as a proxy for the field available at the off. Timestamped declaration, trainer/jockey and going snapshots are incomplete across the archive. Late changes and publication timing cannot always be reconstructed. Earlier unimported or unresolved races can also leave genuine gaps in prior form and participant histories.
- **Price coverage.** The archived prices are same-card snapshots of each runner’s median bookmaker quote, with no evidence of simultaneous availability at a single bookmaker, stake limits or execution at that price. The 2025 fit has no qualifying archived quote sample. The late-2026 quote regime used final SP only for settlement and retrospective comparisons.
- **Feature coverage.** The provider Speed field was absent from the accepted database history. A has zero fitted weight on measured prior Speed. Separately inventoried Speed caches do not provide a single audited timing and coverage standard across the replay window. The ability results apply to the observed prior-form inputs in this specification.
- **Evidence strength.** The 2026 period has been explored in prior racing research. It is a fixed historical replay. Odds-sensitive results depend heavily on a few winners. D’s smaller cash loss than the all-race favourite reflects far fewer stakes. D lost at final SP in every family over the broad 2026 population.
- **Verification at close-out.** Saved evaluation, parameter and frozen-baseline content digests, snapshot provenance and the 380-race join were checked against the saved artifacts. Focused TypeScript and lint passed for the research files. Ten real-fixture tests passed during the original implementation. This close-out used those existing results and did not rerun the models, fixtures, database export or historical evaluation. The current live generation ledger differs from the earlier checkpoint. The reported comparison is pinned to the unchanged frozen Tissue 2 artifact. Live racecard integration and prospective performance remain unverified.

**Decision.** Keep the existing Today’s Racing selections. A and B produced losses as broad ranking diagnostics and as quote-qualified value policies. C worsened the archived market probability baseline and lost money. D explicitly modelled a historical return target and still returned negative ROI in both chronological validation and the 2026 replay. The quoted T2 overlap gains do not survive removal of their largest winner.
