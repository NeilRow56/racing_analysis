# Historical recovery: profitability research feasibility

As of 11 November 2026. Additional research objective and feasibility criteria. No strategy search, rule optimisation, model fitting or new backtest was performed for this review.

The ultimate objective is to discover betting strategies with positive net returns across a meaningful number of selections. Strike rate is descriptive, not the primary objective. Retain short-priced, medium-priced and longer-priced selections, including outsiders; do not discard a price category simply because it wins less often.

## What the existing evidence supports

Historical result data with reliable SP, settlement and prior-only selection inputs can support profitability research across all three price categories. Existing local evidence demonstrates representation across the price spectrum, but does not prove that a future historical recovery will have comparable coverage or that a profitable strategy exists.

The preserved [AW historical investigation](../data/research/or-speed-historical-investigation-2026-11-11.md) and its [breakdown CSV](../data/research/or-speed-historical-investigation-2026-11-11-breakdowns.csv) report the following counts for the matched OR-and-Speed population in verified complete starter fields. These are existing descriptive counts, not new strategies. Decimal odds include the returned stake.

| Historical decimal SP | 2025 runners / winners | 2026 runners / winners |
| --- | ---: | ---: |
| Greater than 1, up to 3 | 725 / 302 | 568 / 228 |
| Greater than 3, up to 6 | 2,635 / 509 | 1,908 / 353 |
| Greater than 6, up to 11 | 2,719 / 254 | 1,940 / 191 |
| Greater than 11, up to 21 | 2,238 / 121 | 1,549 / 87 |
| Greater than 21 | 2,358 / 41 | 1,688 / 32 |

These existing reporting bands cover short prices through outsiders without requiring an arbitrary new boundary between the three broad categories. The 2026 evidence ends on 21 September. The sample is AW only, feature-matched and subject to substantial field and feature exclusions; it cannot establish coverage for Turf, Hurdle, Chase, older years or the entire recoverable population. Every listed band lost at actual SP in each year in this matched population. That is a baseline observation, not a reason to exclude a price range from future research.

There are thousands of outsider runners but relatively few outsider winners. Subdividing those winners by rule, course or historical period will reduce evidence quickly. A meaningful sample must therefore consider winners, independent races, period coverage and uncertainty as well as the number of selections; no universal selection-count threshold establishes reliability.

The [preserved Racing Post source investigation](../scraper/docs/racing-post-full-result-investigation.md) found full runner records, result outcomes and odds in inspected historical payloads, including losing and non-finishing runners. That supports the technical possibility of recovery across price categories. It is a bounded historical source investigation, not verification of current access, bulk completeness, SP completeness by price range or continuous historical coverage. Date-summary records containing only placed runners are unsuitable for return or full-market research.

## Recovery acceptance criteria

Before declaring recovered data research-ready, audit the recovered population without searching selection rules:

- Preserve all starters and results, including losing outsiders and non-finishers, with stable race/horse identities, source provenance and raw odds. Reconcile starter counts and distinguish non-runners, voids, dead heats and disqualifications.
- Report races, starters, valid SP, missing/invalid SP, winners and usable prior-input coverage by historical period, race family and the existing price bands. Keep unknown-price rows visible as a separate coverage category; their true price category cannot be inferred from missing SP. Check whether recovery or feature exclusions disproportionately remove outsiders or inexperienced runners.
- Preserve actual uncapped SP. Validate unusual odds formats and extreme prices against source evidence rather than silently clipping them. Audit dead-heat settlement separately; a winning result alone does not establish the correct return.
- Build market benchmarks from verified complete starter books with valid prices for every starter. Report return coverage and benchmark coverage separately; incomplete books must not silently supply full-market A/E.
- Reconstruct each selection input using only information available before the target race. Current-race finishing data, in-running comments, race-earned ratings and final SP are outcome information. Prior-run ratings and comments require a credible availability cutoff; an earlier race date alone does not prove the stored value was available then or unchanged later.

Until those checks are completed on the recovered data, feasibility is conditional. This addendum has not performed a new recovery or a population-wide audit.

## Eventual strategy assessment

Assess pre-specified selections at a fixed unit stake using:

- **Net level-stakes profit and ROI:** total settled returns minus stakes, with ROI equal to net profit divided by settled stakes. Use consistent non-runner, void and dead-heat treatment. State any commission, deductions or other costs; SP returns alone do not establish achievable returns at an earlier quoted price.
- **Winning frequency:** selections, settled stakes, winning runners and strike rate alongside profit. A higher strike rate does not by itself indicate a better strategy.
- **Market A/E:** for consistency with the existing investigation, expected wins are the sum of inverse decimal SP normalized within each verified complete starter book. Compare fractional dead-heat wins with expected wins on the same covered selections. State the convention and coverage. A/E above 1 can coexist with negative net ROI because normalization removes the SP overround.
- **Price-range performance:** show counts, winners, profit, ROI and A/E across the existing bands, with an unknown-price coverage report. Retain the uncapped aggregate as the primary result. Do not select a favourable band retrospectively and present it as an independently validated rule.
- **Historical stability:** show separate years and fixed calendar periods, coverage changes and uncertainty accounting for within-race dependence. Keep development evidence separate from untouched chronological validation; already inspected periods are not fresh holdouts.
- **Exceptional-winner dependence:** report the largest winning price, top-one/top-three/top-five return contributions and profit/ROI sensitivity to removal of those winners, with the stake-denominator convention stated. These are robustness diagnostics, not executable selection filters or automatic grounds to reject outsider strategies. Sparse long-price wins require broader independent evidence, not an assumed short-price preference.

Historical final SP may settle bets and define retrospective diagnostic bands and market benchmarks. It must not enter pre-race selection inputs, eligibility rules, ranks or value decisions as though known at selection time. A future executable price-based rule needs a timestamped price actually available at that decision time, evaluated separately from final SP.

**Feasibility conclusion:** retain all three price categories. Existing AW evidence supports descriptive research across them, with thinner winning evidence among outsiders. Broader recovered-data suitability remains unverified until the coverage, settlement, market-book and pre-race-availability checks above pass. No profitable strategy is established by this review.
