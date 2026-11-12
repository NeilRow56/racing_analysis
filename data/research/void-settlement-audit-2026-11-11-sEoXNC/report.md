# Void-race settlement audit

11 November 2026. **Diagnostic only. Keep the Jump 2026 candidate rebuild blocked pending an approved settlement correction and regression checks.** The 11-race recovery remains verified; it did not resolve settlement correctness.

The read-only audit covered the imported Sporting Life 2025/2026 population: **24,145 races**, current compatible research sources, retained historical caches, original research JSON artifacts and four frozen rules with six saved summaries. It does not establish complete calendar coverage or inspect every compressed historical backup. Only new audit reports were written.

## Confirmed void issue

Source JSON has `race_summary.race_stage = RACEVOID`, but there is no normalized race-outcome field in `races`, historical outcomes or `TodayRace`. The importer derives runner status independently of race stage. A source runner with position zero becomes database `finishing_position = NULL`, `result_status = other`, `outcome_code = 0`.

`settledWinValue` treats any nonblank, unrecognized status as a loss. With a stored price, `settleSelection` therefore assigns stake £1, return £0 and P/L −£1. The existing void-status exclusion works **when supplied a recognized void status**; the source-stage information never reaches it. Raw `RACEVOID` also needs normalization: lowercase `racevoid` is not currently an accepted alias.

Evidence: [importer](../../../scraper/sporting_life/importing.py), [settlement](../../../src/lib/racing/backtest.ts), [historical outcomes](../../../src/lib/racing/historical-target-metrics.ts), [model comparisons](../../../src/lib/racing/research-model-comparison.ts). The original recovery example is Uttoxeter **929549**, 24 July 2026.

| Date | Race ID | Course / family | Records | False £1 losses if selected | Already excluded NR |
| --- | --- | --- | ---: | ---: | ---: |
| 2025-02-10 | 842876 | Wolverhampton / AW | 12 | 11 | 1 |
| 2025-03-28 | 850035 | Lingfield / AW | 10 | 10 | 0 |
| 2025-04-25 | 854299 | Fontwell / Jump | 14 | 12 | 2 |
| 2025-08-18 | 874166 | Windsor / Turf | 7 | 7 | 0 |
| 2026-07-17 | 928280 | Wolverhampton / AW | 8 | 8 | 0 |
| 2026-07-24 | 929549 | Uttoxeter / Jump | 9 | 9 | 0 |
| 2026-09-12 | 938099 | Bath / Turf | 12 | 11 | 1 |
| 2026-11-10 | 947824 | Huntingdon / Jump | 8 | 7 | 1 |
| **Total** | **8 races** | **All three families** | **80** | **75** | **5** |

All eight original local full-result files were checked against source identities and database winners. None has a winning runner. **The £75 is a hypothetical all-affected-rows exposure, not evidence that 75 bets were placed.** Any selected subset of K affected rows has K false losses. Correct treatment improves its P/L by £K and removes K effective stakes; placed stakes are refunded. Five genuine NRs are already excluded correctly.

Exact UUIDs, prices and current/correct accounting are in [void-runner-records.csv](void-runner-records.csv). [void-races.csv](void-races.csv) contains race identifiers and family totals.

**Further unresolved-result exposure:** 19 other AW races contain **189 priced runner rows** that the same helper can treat as losses despite non-final source stages: `DORMANT` or `PARADING`, with no winner. They fall on 12 and 31 October 2026, outside the current AW cache's 21 September endpoint. They are **unresolved, not confirmed voids**; neither losses nor refunds can be assumed. See [nonfinal-loss-records.csv](nonfinal-loss-records.csv). The separate 98 unresolved Jump rows across 14 races remain untouched.

## Research returns and denominators

For a population with current P/L P and S settled stakes, removing K false void losses gives **P + K**, **S − K**, and **ROI = 100 × (P + K)/(S − K)**. Winner counts do not change in these eight races. Settled runner/race, strike-rate and losing-run denominators are affected. Raw records and captured selection counts should remain available, with void/refund coverage shown separately.

The following reproduces the existing Research Filters defaults: **Latest Speed versus Latest Today's Rating, matched population, rank ≤1, no advanced filters or edge threshold**. These are fixed diagnostic views, not a strategy search. Results below isolate the **void correction only**, leaving the separate dead-heat issue unchanged.

| Family/year | Latest Speed false losses | Current P/L → void-only P/L | Current ROI → void-only ROI |
| --- | ---: | --- | --- |
| Jump 2025 | 1 | −£893.860 → −£892.860 | −18.5333% → −18.5164% |
| AW 2025 | 2 | −£628.677 → −£626.677 | −20.5115% → −20.4596% |
| AW 2026 | 1 | −£402.791 → −£401.791 | −20.3945% → −20.3542% |
| Turf 2025 | 1 | −£922.507 → −£921.507 | −19.5986% → −19.5815% |
| Turf 2026 | 1 | −£585.956 → −£584.956 | −14.5471% → −14.5259% |

Latest Today's Rating has the same affected counts in those default views; its exact P/L/ROI is in [research-filter-impact.csv](research-filter-impact.csv), along with all six existing rating views and native populations. These model columns overlap and must not be added together.

**2026 Jump remains rejected by the current compatibility guard.** Its unchanged archival cache nevertheless contains nine Uttoxeter rows that the generic helper would settle as losses. The November Huntingdon race is outside that cache and the proposed 14 October cutoff.

**Market A/E:** `normalizedSpMarkets` can accept a complete priced field with zero winners because it accepts the helper's false loss classifications. Void rows then add expected wins without actual wins. After removing their expected mass e, A/E becomes A/(E−e), using the same valid covered subset. In the default AW-2025 Latest Speed view, A/E changes **0.971276 → 0.972238**; Turf-2025 changes **1.040378 → 1.040832**. Jump-2025 and Turf-2026 A/E do not change in these views because their void fields already fail the separate complete-book count check. That incidental exclusion does not protect P/L. Exact expected masses and A/E are recorded in the CSV.

## Two additional settlement findings

**Dead heats:** [win-settlement.ts](../../../src/lib/racing/win-settlement.ts) returns `1 + (decimalOdds − 1)/divisor`. Standard fixed-odds single-bet settlement divides the stake first, so gross return is **decimalOdds/divisor**, and P/L is that amount minus the original £1 stake. Void/NR singles instead return the stake; an abandoned race is not a losing bet. These conventions are supported by the published [Paddy Power horse-racing rules](https://helpcenter.paddypower.com/app/answers/detail/horse-racing-rules/). These are ordinary day-of-race SP singles, not ante-post, enhanced-return products or accumulators.

All **34 observed dead-heat races / 68 winning runner records** are two-way ties, verified against original local result files. The shared helper overstates each affected £1 winner by **£0.50**: £34 across the hypothetical population betting every such winning record. By year/family, the excess is AW-2025 £11, Turf-2025 £9, AW-2026 £6, Jump-2026 £3, Turf-2026 £5; Jump-2025 has none. This does not change losing selections or stakes. The comparison workspace already uses fractional dead-heat winning credit for A/E, so correcting the financial formula alone does not change its A/E. See [dead-heat-winning-records.csv](dead-heat-winning-records.csv).

Current tests explicitly assert the profit-only division; passing them would not establish bookmaker-correct arithmetic. A correct formula already exists in the legacy fallback `capturedPriceProfitLoss` in [forward-value.ts](../../../src/lib/racing/forward-value.ts), but persisted values take precedence there. Reuse its arithmetic, not its entire workflow.

**Legacy frozen summaries:** all six saved definitions were checked against their exact retained cache versions, using read-only selection predicates and reconstructed prior-year trainer cohorts. **Zero confirmed-void runners are selected in all six.** Three current baselines reproduce stored results directly; the other three reproduce exactly when started non-finishers are omitted. Their selected non-finishers have explicit pulled-up, fell, unseated, brought-down, ran-out, carried-out or refusal evidence, not the ambiguous zero-status void records.

| Saved rule / snapshot | Omitted non-finishers | Stored P/L | Diagnostic P/L with losses and correct dead heats | Diagnostic ROI |
| --- | ---: | ---: | ---: | ---: |
| Trainer 30 1-50 days / 2025 | 3 | +£133.660 | +£130.160 | 25.274% |
| Jump - handicap 2 / 2025 | 190 | +£129.458 | −£60.542 | −4.387% |
| Jump - handicap 2 / 2026 | 192 | +£37.476 | −£154.524 | −13.543% |

The Turf difference includes a further £0.50 dead-heat correction. The other three saved summaries show no monetary change from these identified issues. These are audit counterfactuals, **not replacements for frozen evidence**. Original selection IDs and historical cohort snapshots were not stored; cohort reconstruction and exact aggregate reproduction are evidence, not independent contemporaneous selection lineage. Details and identities are in [frozen-snapshot-audit.json](frozen-snapshot-audit.json) and [legacy-nonfinisher-records.csv](legacy-nonfinisher-records.csv).

## Correct semantics and prospective implications

- **Confirmed void/abandoned race:** terminal refund; no win or loss, P/L £0, no effective settled stake or A/E contribution. Race-level void overrides provisional runner positions.
- **Genuine NR:** refund/exclude from effective stakes; retain its distinct NR identity and captured record.
- **Completed-race starter that fails to finish:** £1 loss, included in settled denominators. A refusal under starter's orders is also a loss, unlike a withdrawal before orders; see [Betfair's rules](https://support.betfair.com/app/answers/detail/horse-racing-rules/).
- **Dead heat:** full original stake remains at risk; use gross decimal odds divided by the winner divisor. Do not cap legitimate long-priced winners.
- **Missing/non-final information:** pending/unresolved; no invented loss or refund. Missing winning time alone does not establish a void race.

`isVoidBetResultStatus`, the existing NR/void outcome categories, normalized-market machinery and fractional A/E credit can be reused. The conclusive-result predicates provide useful protection for normal completion but cannot identify a void without race-stage provenance.

For Huntingdon 947824, retained modern prospective records are **pending rather than falsely settled losses**. The Hurdle Value book contains seven pending runner outcomes and one correctly marked NR. Forward Value, Jump G4, Jump Rating and related monitors retain the void race without terminal resolution. Their winner/completeness gates prevent the observed false-loss calculation but leave a refund-classification gap.

The dead-heat issue is already persisted prospectively: race **941778, 5 October 2026**, contains Grow Old With Me (SP 9) at **+£4 instead of +£3.50**, and Charlie's Cannon (SP 23) at **+£11 instead of +£10.50**, in both AW Rating and AW Tissue V1 files. These are the **same two runners duplicated in two ledgers**, not four independent bets. AW Tissue's selected leader and Forward Value's leader lost that race, so their stored leader P/L remains −£1. Other summaries selecting those winners require review. Historical-comment references in other artifacts are not financial exposure. See [prospective evidence](prospective-evidence.json) and [persisted dead-heat money](prospective-dead-heat-money.json).

## Smallest safe correction and release gate

Recommend a separately authorised, versioned settlement repair:

1. Carry authoritative race-stage status through the canonical result boundary; normalize terminal void aliases. Preserve raw payloads and genuine NR classifications. Scope any existing-data correction to verified identities; never turn every `other` into void.
2. Require known completed outcomes or explicit started non-finisher evidence before assigning a loss. Non-final/unknown records must remain unresolved.
3. Correct the shared dead-heat arithmetic. Preserve actual SP and all existing frozen selection rules; do not introduce price caps.
4. Version corrected settlement/source semantics and invalidate incompatible derived caches. Preserve original frozen snapshots and publish separately labelled recalculations with before/after evidence. Do not silently rewrite persisted prospective P/L.

Required regressions: all eight real void fixtures across all families/years; void with provisional winner positions; alias normalization; genuine NR versus refusal after orders; completed pulled-up/fell/unseated and other explicit non-finishers; missing/non-final results; completed races with missing times; two- and three-way dead heats with independently calculated gross returns; ordinary winners including SP 301; void-free market books and A/E denominators; legacy snapshot non-finisher cases; terminal void handling in Value/forward workflows without recapture or duplicate refunds; unchanged frozen inputs and guard-v2 enforcement.

**Recalculation is required for affected summaries**, including Research Filters views, persisted dead-heat returns and the three legacy snapshots above, under a new clearly labelled policy. Do not reinterpret the profitable legacy Jump snapshots as valid profitability evidence in the meantime.

**Keep both the candidate rebuild and acceptance blocked** until the settlement correction, versioning and regressions are approved and verified. A 14 October cutoff alone still contains the July void and all three observed 2026 Jump dead heats. The 14 unresolved races remain a separate scope/provenance constraint. All recovered 2026 research remains exploratory.

[final-verification.json](final-verification.json) confirms inspected cache manifests/outcomes, source files, original snapshot files and saved database rules stayed unchanged. No code/database edits, settlement workflow, backfill, cache generation, rule change, model change or prospective collection change was performed.
