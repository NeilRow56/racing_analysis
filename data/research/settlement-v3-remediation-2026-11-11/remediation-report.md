# Settlement V3 integration remediation — 11 November 2026

**Full integration sign-off: withheld.** The safe feature-adapter compatibility fixes, CLI reporting fixes, diagnostic corrections and regression validation are complete. Two semantic dependency mismatches remain deliberately unapproved. Market Edge collection also depends on the blocked Shadow collector. Early Turf's original 2027 collection window is ready at the source-guard level. No live operational readiness is inferred from offline tests.

## Source-pin investigation and disposition

All five distinct mismatched source files were recovered from Git commit `77167d7287dc8280df6a8411aa3845e85369d348`. Every recovered file's SHA-256 exactly matches the original ledger pin. Originals are retained under `original-sources/` as review-only `.txt` evidence. The changes are Settlement V3 integration edits, not generated artifacts or unverified unrelated source revisions. The original ledger pins have not been changed.

| Monitor | Cause | Collection after remediation | Settlement after remediation |
| --- | --- | --- | --- |
| Hurdle V3 Shadow (12 pins; 49 captures) | Feature adapter renames the original starter classifiers; Backtest also changes settlement arithmetic, exclusions, evidence classification and versioning. | **Blocked:** Backtest is a semantic change, outside the non-semantic exception. Original capture pin verification still rejects it. | **Not source-pin blocked.** `mutateHurdleV3Shadow` enforces immutable capture/existing outcome guards but does not call the capture pin assertion. Its results-only path remains available. Verified on a temporary copy; no operational settlement performed. |
| Hurdle Market Edge (9 pins; 10 captures) | Only the Hurdle feature adapter's legacy-classifier identifier substitution originally differed. | Own source guard now accepts only the exact verified non-semantic substitution. **Fresh collection remains blocked upstream** because production supplies only fresh accepted Shadow pairs. No historical pairing/backfill added. | Reads outcomes from the identity-matched Shadow production capture. Existing settlements remain visible; fresh results depend on the separate Shadow settlement path. |
| Tissue Positive/Neutral (12 pins; 25 captures) | Tissue Generation adds outcome settlement version, V3 result projection and V3 settlement dispatch. Capture builders are unchanged, but the pinned dependency has semantic settlement changes. | **Blocked:** dependency cannot qualify as solely non-semantic. Original mutation guard remains unchanged. | Reads outcomes from the identity-matched Tissue Generation book. The badge ledger has no independent settlement mutation, so this pin failure does not block source settlement. |
| Armed 2027 Early Turf (4 pins; zero captures) | Only the input adapter's legacy-classifier identifier substitution differed. | **Guard repaired / armed:** unchanged March 1–July 31, 2027 eligibility. Not eligible for collection on today's date. | Reads matched Tissue Generation outcomes; no separate settlement writer and no captures yet. |

The exact blocking files for separate review are `src/lib/racing/backtest.ts` (Shadow) and `src/lib/racing/tissue-generation-forward.ts` (Positive/Neutral). Their originals are verified; it is their semantic change that is not authorised through the narrowly scoped exception. No frozen model/input semantics were altered to address either blocker. Separate approval and a version/preservation design are needed to admit those changes for collection.

### Exact original and current hashes at investigation

**data/research/hurdle-v3-prospective-shadow-v1.json**

- `src/lib/racing/hurdle-v3-challenger-features.ts`
  - Original pin / verified Git original: `acfc91b8ccab7991868ef1fa3128c5fbd5320b04936c34bd65ddc039ab46b86f`
  - Current source: `d8285c3f117813b41b191ba06e08f10dfabe99ccffc66884c5a46d074814a858`
- `src/lib/racing/backtest.ts`
  - Original pin / verified Git original: `706244d81205ca3d87aa31619c2e7b5f44ff97a32780f8fbc9543524115bbef4`
  - Current source: `b078ee2c1473903facb2fc9ed6c81424c0bfbc56742091d7f1e25d1c968839f8`

**data/research/hurdle-v3-market-edge-prospective-v1.json**

- `src/lib/racing/hurdle-v3-challenger-features.ts`
  - Original pin / verified Git original: `acfc91b8ccab7991868ef1fa3128c5fbd5320b04936c34bd65ddc039ab46b86f`
  - Current source: `d8285c3f117813b41b191ba06e08f10dfabe99ccffc66884c5a46d074814a858`

**data/research/tissue-positive-neutral-prospective-v1.json**

- `src/lib/racing/tissue-generation-forward.ts`
  - Original pin / verified Git original: `aaa05107464bb76c6bc8b275005917792b411db15bf80d722aef428a8c087c36`
  - Current source: `a3848acc043e85d2cea8af10e9c64e927720fae0634d91692ea34f7578aa3782`

**data/research/turf-2027-early-season-v1.json**

- `src/lib/racing/turf-early-season-inputs.ts`
  - Original pin / verified Git original: `8084678fd3b79d000f4ef16bb5c0f5ef692e8cc7861b5e35ea1e15f8c008daff`
  - Current source: `0f87d766700d6175a25727b30fef651292f3f5e6eca47b04ef6884f617b0117a`

### Narrow compatibility correction

`capture-pin-compatibility.ts` is version-aware through exact original/current source-hash pairs. Only the two feature-adapter substitutions and the respective guard-wiring changes are admitted. The complete key set is checked. The current Backtest hash is additionally required as the legacy classifier dependency; further edits fail closed. The new compatibility table contains **no** Backtest or Tissue Generation settlement substitution. It neither fabricates an exact hash match nor rewrites ledger provenance.

Tests prove the adapter files are otherwise byte-identical to their pinned originals and compare legacy classifications across null/blank/finished/void/NR/non-finisher/unknown statuses and null/zero/negative/positive positions. They exercise both repaired mutation guards on temporary ledger copies, reject unknown drift and altered pin sets, verify the two remaining capture blockers, and verify the separate Shadow mutation path. `source-pins-after.json` retains raw current hashes, including the deliberately different guard files; a raw audit will still see these differences. Effective validation uses the explicit compatibility verifier.

## CLI reporting

- Added common recorded-version grouping and labels. Explicit V2, unversioned and V3 records remain distinct; unknown versions receive an unknown-version label rather than V3 attribution.
- AW comparison summaries reject mixed settled versions unless separated. The CLI renders separate recorded-version tables, preserving capped/uncapped historical money.
- AW and Jump Rating CLI summaries partition their cohorts by recorded version and disclose the settlement basis.
- All three TPR/Timewise report entrypoints split mixed ledgers into version-specific reports. Their legacy-versus-V3 monetary dispatch is retained; the prior unqualified canonical-settlement claim is corrected.
- Forward Value summary/results/today paths disclose prospective versions separately from the frozen calibration version. Retained captured-price P/L and ROI and family tables are version-specific. Existing combined recorded views are explicitly identified and warn that they are not pure V3 performance. Jump/AW Tissue disclosures inspect runner outcomes, where their versions actually live; detail artifacts carry those disclosures too.
- No historical figures were recalculated, persisted or relabelled. Reports distinguish fresh recorded V3 outcomes from corrected historical recalculations, which require separate artifacts.

## Three standalone diagnostics

- `diagnose-turf-tissue-aw-transfer.ts`: replaced both duplicated `(SP - 1) / divisor` expressions with canonical `settleSelection`. The priced and positive-edge monetary populations now exclude NR, void and unresolved outcomes through that same helper. Other research/model/calibration calculations were retained.
- `diagnose-turf-tpr-candidate-robustness.ts` and `diagnose-jump-turf-candidate-robustness.ts`: slippage uses canonical gross return times `(1 - slippage)`, minus effective settled stake. It retains dead-heat division, exclusions and uncapped long-priced returns. The existing adverse-gross-return slippage convention is unchanged.
- Standalone mains are import-guarded so regression tests do not execute diagnostics. Corrected file outputs use separate `-settlement-v3` paths and explicit labels. The Jump/Turf stdout report is also explicitly V3. Historical reports were preserved; none of these diagnostics was operationally rerun.

## Preservation

The starting manifest records **358 pre-existing research files**. The first strict all-bytes check correctly failed when three mutable live ledgers changed during the session. The failure was not suppressed by replacing its baseline. `preservation-after.json` records all three initial/current digests.

The changes add outcomes at approximately 16:15 UTC: 30 Context Weight Shadow outcomes, 51 Hurdle V3 Shadow outcomes and 79 Tissue Generation outcomes. For each ledger, removing only these newly appended outcomes **in memory** reconstructs the exact original bytes and matches the untouched starting SHA-256. Those independently hash-verified original bytes are retained as `.original.txt` evidence. No live ledger was restored, edited or rewritten by this remediation.

The preservation regression now requires unchanged bytes for the other 355 files. For those three live ledgers it verifies original evidence against the starting digest, compares every capture/input/price/probability/identity/epoch/key/array length exactly, and permits new outcomes only where the original was null. Previously recorded outcomes must remain exact. Thus original captured prices, probabilities, model inputs and frozen evidence remain intact despite concurrent result appends. The process that performed the external updates was not identified; no collection/settlement/backfill command was invoked by this work.

This proves preservation relative to this task's starting state. It does not erase the earlier audit's historical-baseline discrepancies or establish unavailable pre-task lineage. No database connection, modification, operational settlement/backfill, cache regeneration, Jump rebuild, model fit or strategy change was performed. Python files were not changed.

## Validation

- **467 tests passed, 0 failed, across 33 files** (`tests.log`). The suite covers the frozen monitors, new compatibility/reporting/diagnostic regressions, core Backtest/Research Rules, prospective Value/Tissue families, Rating, TPR/Timewise and the two reviewed UI assertions.
- **Strict TypeScript check passed:** `bun run typecheck` (`typecheck.log`).
- **Targeted ESLint passed** for all 17 changed TypeScript/TSX files (`lint.log`).
- **`git diff --check` passed.**
- The initial reporting fixture failure (missing required winner-OR input) was corrected. The later whole-bytes preservation failure exposed the concurrent outcome appends documented above; its original digests remain recorded. The final preservation regression verifies unchanged frozen values and existing settlements against hash-verified original evidence.
- No Python edits; no Pyright run required. No production build or database-backed workflow was run.

The two obsolete UI assertions now match the intentionally changed interface: the Value section is labelled “Complete-market Value research cohort”, and the route retains its cohort monitor without duplicate `ActiveTissueRaceTables`. Current layout tests verify that interface.

Regression coverage includes all four pin scenarios and frozen evidence, mixed-version monetary reports, SP 5 two-way dead heat (£2.50 gross / £1.50 net), NR/void/pending exclusions, correct effective stake denominators, SP 301 uncapped winners, and slippage on the canonical return. Both repaired guards were exercised on temporary copies; real source pins were never resealed.

## Files changed by this remediation

- `scripts/diagnose-turf-tissue-aw-transfer.ts`
- `scripts/diagnose-turf-tpr-candidate-robustness.ts`
- `scripts/diagnose-jump-turf-candidate-robustness.ts`
- `scripts/diagnose-tpr-vs-timewise-forward.ts`
- `scripts/report-forward-value.ts`
- `scripts/track-aw-rating-forward.ts`
- `scripts/track-jump-rating-forward.ts`
- `scripts/settlement-diagnostics.test.ts`
- `src/lib/racing/capture-pin-compatibility.ts`
- `src/lib/racing/capture-pin-compatibility.test.ts`
- `src/lib/racing/settlement-reporting.ts`
- `src/lib/racing/settlement-reporting.test.ts`
- `src/lib/racing/aw-forward-comparisons.ts`
- `src/lib/racing/hurdle-v3-market-edge.ts`
- `src/lib/racing/turf-early-season.ts`
- `src/lib/racing/turf-value-forward.test.tsx`
- `src/app/racing/research/forward-value/active-tissue-captures.test.tsx`
- `docs/settlement-v3.md`

Additional files under this report directory contain original source evidence, verified original ledger evidence, manifests, hash comparisons, validation logs and this report. Pre-existing unrelated working-tree changes were retained.

**Sign-off decision:** arithmetic/reporting corrections pass targeted validation; full Settlement V3 integration sign-off remains withheld until Shadow and Positive/Neutral collection dependencies receive a separate approved version/preservation resolution and the resulting Market Edge collection dependency is cleared. No Jump 2026 rebuild is authorised.
