# Settlement V3 integration audit — 11 November 2026

**Readiness: withhold full integration sign-off and unqualified 2026 Jump rebuild approval.** Core V3 arithmetic and the six fixed audited recalculations pass. Four frozen prospective monitors have source-pin mismatches; standalone diagnostic arithmetic and unlabelled mixed-version reporting remain. No application code, database, frozen rules, model, cache or historical observation was changed by this audit. Only diagnostic artifacts were created. No operational settlement, collection, backfill, model fit or strategy research was run.

## Consumer coverage

Read the implementation report, inventory, preservation/reader evidence and `docs/settlement-v3.md`. Traced the current working tree, which already contained substantial unrelated and settlement changes. `direct-consumers.txt` records 81 files with direct settlement-helper references found in application and TypeScript research scripts, excluding tests. The prior implementation inventory contains 66 paths, including tests/documentation; the initial “40 files” is not the current complete inventory.

| Consumer group | Integration assessment |
| --- | --- |
| Historical outcome/evidence readers and cache readers | Identity-bound evidence annotation; SP, positions, features and manifests are not refreshed. Database errors surface. Compatibility/missing-minute guards retained. |
| Backtests, Research Filters, holdout, rule evaluation and development price modes | Fresh calculations call V3; result/snapshot writers carry settlement version. Explicit pre-existing diagnostic caps retained. |
| Research model comparisons | V3 money; complete valid SP fields; actual fractional dead-heat credit and expected market wins use the same matched subset. |
| Saved development/holdout snapshots | Version badges and legacy warnings; original V2/unversioned data are not silently relabelled. Development/holdout settlement bases are exposed. |
| Forward Value, all-family/Turf Value and capped Value | Fresh outcomes V3; recorded money retained; eligibility, captured price and cap epochs remain frozen. |
| AW/Jump Rating, AW forward comparisons, AW/Jump Tissue | Fresh settlement helpers V3; already settled records are retained. |
| AW paired/shadow, Jump/Hurdle paired/challenger and Chase shadow | Delegate to versioned settlement or recorded-version adapters; preserved historical money. |
| Rank One, Hurdle Recency, Jump G4, model disagreement, OR/Speed and Today’s Rating Weight | Settlement-only projections; original captures/features remain separate. OR/Speed is primarily result/rank monitoring. |
| Tissue Generation, prospective Tissue summaries, Hurdle V3 shadow/market edge, Positive/Neutral | Fresh outcomes delegate to V3; monetary summaries consume persisted money. Capture continuity is blocked for the three pinned monitors below. |
| Early Turf and Low Form | Frozen feature classification retained explicitly. Early Turf source pin mismatch; Low Form pins match. |
| Today rule matches, research monitor and TPR/Timewise | Fresh V3 calculations and original-versus-corrected dispatch; existing outcomes preserved. CLI version disclosure is incomplete. |
| Standalone research diagnostics | Many inherit V3 through shared helpers; this does not establish every secondary metric as V3. Confirmed exceptions below. |

## Findings requiring follow-up

1. **Frozen capture guards reject the modified implementation.** Read-only hash comparison against the actual ledgers found:
   - Hurdle V3 Shadow: `hurdle-v3-challenger-features.ts` and `backtest.ts` mismatch (12 pins checked).
   - Hurdle V3 Market Edge: `hurdle-v3-challenger-features.ts` mismatch (9 pins).
   - Tissue Positive/Neutral: `tissue-generation-forward.ts` mismatch (12 pins).
   - Armed 2027 Early Turf: `turf-early-season-inputs.ts` mismatch (4 pins).
   - Low Form: all 3 pins match.

   The actual read-only `assertHurdleV3ShadowPins` call throws “Hurdle V3 shadow implementation changed; create a new version, no refit or feature changes in this epoch”. Corresponding market-edge, badge and Early Turf mutation guards also compare these hashes before accepting updates. Thus unchanged frozen feature semantics do not ensure functioning collectors. No pins were resealed or bypassed. Any resolution needs a separately reviewed version/preservation decision.

2. **Silent V2/V3 mixing remains possible outside the dashboard.** The Forward Value page explicitly warns that totals combine recorded versions. Research Filters labels original snapshots. However, `summarizeAwForward` aggregates retained and fresh returns without version grouping, and `renderAwForwardReport` emits no settlement-version warning. AW/Jump Rating CLI summaries likewise lack settlement-basis disclosure. `report-forward-value.ts` prints the frozen calibration’s V2 settlement version while prospective returns can be V3. TPR/Timewise dispatches money correctly, but its text reports canonical settlement without a mixed-version breakdown. Preservation is correct; a global claim that summaries cannot silently mix versions is false.

3. **Standalone research consumers retain incorrect dead-heat arithmetic.** These scripts were inspected, not executed:
   - `scripts/diagnose-turf-tissue-aw-transfer.ts:420` and `:446`: `(SP - 1) / divisor` profit, instead of `SP / divisor - 1`; the priced population also bypasses canonical settlement exclusions.
   - `scripts/diagnose-turf-tpr-candidate-robustness.ts:567` and `scripts/diagnose-jump-turf-candidate-robustness.ts:527`: slippage returns reconstruct full SP rather than dividing by the dead-heat divisor, even though their base metrics call V3.

   For SP 5 and a two-way dead heat, V3 profit is £1.50. The transfer diagnostic reports £2.00; either robustness calculation at zero slippage reports £4.00. These findings prevent whole-repository arithmetic sign-off. Frozen outputs must remain original evidence; corrected reruns would be separate artifacts.

## Regression and preservation results

All eight representative classes pass: SP 5 winner returns £5/profit £4; loser and explicit started non-finisher lose £1; void/NR have no effective stake; SP 5 two-way dead heat returns £2.50/profit £1.50; unknown/non-final outcomes remain unresolved; uncapped SP 301 winner returns £301/profit £300. Refunds/pending outcomes are excluded from ROI stakes; core market A/E excludes unmatched outcomes from both sides and uses fractional dead-heat winning credit. Frozen prospective metric definitions have not been redesigned.

Offline replay checks all 80 void rows, 68 dead-heat winners and 189 non-final rows, and reproduces all six fixed audited counterfactuals. This is in-memory regression over archival evidence, not an operational settlement run or application-compatible cache build.

| Jump - handicap 2 | Effective £1 stakes | Gross return | P/L | ROI |
| --- | ---: | ---: | ---: | ---: |
| 2025 development | 1,380 | £1,319.458 | −£60.542 | −4.387101% |
| Recorded 2026 holdout | 1,141 | £986.476 | −£154.524 | −13.542857% |

The replay uses reconstructed audited trainer cohorts: aggregate reproduction does not prove original contemporaneous selection lineage or new out-of-sample validity.

All 142 protected-file checks passed, including a final recheck after tests. Two mutable ledgers differ from the earlier audit baseline: Hurdle V3 Shadow and Tissue Generation. Their bytes were preserved during this audit; absent earlier bytes, those differences cannot establish that every historical capture has always remained unchanged. Original model inputs/classifier definitions are retained, including the explicit legacy feature adapters. Existing stored AW dead-heat overpayments remain original money, not pure V3 performance.

The earlier database preservation artifact records four frozen rules and six original snapshots unchanged in a read-only transaction. This audit did not independently reconnect to the live database; current database preservation and live-loader behavior are therefore supported by prior evidence, not a fresh database verification.

## Validation

- 597 tests passed and 2 failed across 35 relevant files, run in separate groups.
- TypeScript strict typecheck passed (`bun run typecheck`).
- Targeted ESLint passed for all TypeScript/TSX paths in the implementation inventory.
- No Python files were edited; no Python validation required.
- No production build or database-dependent application workflow was run.

The two failures are consequences of intentional UI changes and obsolete assertions, not settlement integration defects:

- `turf-value-forward.test.tsx:205` expects “Tissue Value Monitoring”; the component now renders “Complete-market Value research cohort”.
- `active-tissue-captures.test.tsx:95` expects literal `ActiveTissueRaceTables` source wiring. The current layout intentionally removes duplicate Today Tissue tables; `research-page-layout.test.tsx` explicitly asserts their absence and passes.

The 70 frozen-monitor/model tests pass with fixtures; they do not verify that the actual deployed ledger pins match the working-tree implementation. The read-only live-ledger hash checks reveal that gap.

## Rebuild recommendation

The core settlement repair is adequate for the audited Jump arithmetic, but the requested whole-application integration gate is not clear. Resolve or explicitly scope the four pin failures, diagnostic arithmetic exceptions and mixed-version reporting before full sign-off. Do not overwrite frozen ledgers to make checks pass.

An unqualified full-2026 Jump rebuild remains unsupported independently: prior recovery evidence retains 98 unresolved rows across 14 races on 15 October, and the missing-minute guard remains enforced. A separately authorised isolated exploratory candidate through 14 October could be considered after renewed prebuild checks and explicit exclusions; it would not establish research readiness or fresh holdout evidence. No rebuild was performed or authorised by this audit.

Evidence: `validation.json` contains the replay and 142 hashes; `integration-checks.json` contains actual ledger pin mismatches and final preservation checks; `direct-consumers.txt` contains the direct-helper inventory.
