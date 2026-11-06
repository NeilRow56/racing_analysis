# Active Research review · 5 November 2026

## Read-only reconciliation before changes

TODAY PAGE CURRENT V1 (Value rank 1): 38 markers: 34 frozen `VALUE_RANK_V1`, four active `VALUE_RANK_V2`. Membership was read through `getTodaysRacingData` and projected through the same `attachFrozenValueToMeetings` used by Today. No Today page render or sync was invoked.

VALUE V2 RESEARCH RECORD: six post-epoch race captures, all frozen at `2026-11-05T09:15:56.991Z`; four retained and two rejected leaders. Epoch: `2026-11-05T06:37:02.000Z`.

POSTGRES RESULT: every retained leader has the same finishing position and result status as the frozen tracker outcome. Today and Research use the same race/runner identity, capture timestamp and frozen price. The two rejected leaders have no active Today marker.

Every post-epoch race is listed below, with its original Value rank-1 leader. Tissue rank is from that original frozen Value book; the daily UI follows Today’s current frozen Tissue generation (Jaipaletemps is now Tissue 4, compared with original Tissue 3).

| Time | Course | Horse | Family | Frozen price | Original Value rank | Prior career runs | V2 decision | Rejection reason | Active V2 | Frozen Tissue rank | Research result | Settled | £1 P/L | PostgreSQL result | Today active Value 1 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 14:07 | Newcastle | Final Straw | HURDLE | 29.00 | 1 | 7 | Retained | — | Yes | 6 | 5 | Yes | -1.00 | 5 / finished | Yes |
| 14:47 | Plumpton | Nicolai | HURDLE | 101.00 | 1 | 8 | Retained | — | Yes | 2 | 4 | Yes | -1.00 | 4 / finished | Yes |
| 15:22 | Plumpton | Jaipaletemps | CHASE | 8.00 | 1 | 17 | Retained | — | Yes | 3 | 3 | Yes | -1.00 | 3 / finished | Yes |
| 15:28 | Southwell | Rusheen Boy | AW | 26.00 | 1 | 32 | Rejected | PRIOR_RUNS_10_PLUS | No | 7 | 8 | Yes | -1.00 | 8 / finished | No |
| 15:55 | Plumpton | Stroll On By | HURDLE | 5.00 | 1 | 11 | Retained | — | Yes | 2 | 4 | Yes | -1.00 | 4 / finished | Yes |
| 17:00 | Southwell | Adelaides Turn | AW | 34.00 | 1 | 3 | Rejected | PRIOR_RUNS_0_4 | No | 10 | Pending | No | — | Unresolved / other | No |

## Winning Today markers and cause

| Horse | Policy | Frozen capture | Frozen price | Today / PostgreSQL finish |
| --- | --- | --- | --- | --- |
| Bond Broker | VALUE_RANK_V1 | 2026-11-05T05:36:42.033Z | 2.88 | 1 |
| Diplomatic Ash | VALUE_RANK_V1 | 2026-11-05T05:36:42.033Z | 6.50 | 1 |
| Without Compromise | VALUE_RANK_V1 | 2026-11-05T05:36:42.033Z | 23.00 | 1 |

A. Winner missing from V2 tracker: no. All four active V2 Today keys match the tracker.

B. Captured active V2 winner awaiting settlement: no. All four retained leaders are settled losers. Adelaides Turn is rejected and unresolved in both sources, not an uncounted active winner.

C. Pre-epoch capture: yes. Bond Broker, Diplomatic Ash and Without Compromise were captured at 05:36:42.033Z, before 06:37:02.000Z, and correctly remain V1 history.

D. Incorrect association with earlier/later capture: no. The retained Today markers match the tracker capture timestamps and prices exactly.

E. Another settlement bug: no outcome discrepancy found. A separate workflow coverage gap was found: standalone `research:settle` omitted the family Value JSON books; `research:live` and `research:after` already called `tissue-value:results`. The generic settlement entrypoint now includes those ledgers and calls the existing `settleValueForward` function. This does not explain the screenshot’s zero winners and requires no historical data correction.

## Resulting Research page

- Removed the active “Today’s Tissue captures” race-by-race section and its unused page imports. Underlying capture components, selection helpers and historical data remain.
- Retained the TISSUE_GENERATION_2026_11 aggregate monitor with T1, T2 and Top2 summaries, plus archived generations and frozen capture tables.
- Added prior runs to the active V2 daily table, daily selections/settled/winners/strike/P&L, and ROI only once a selection settles.
- Added separate compact rejected-leader details with frozen price, prior runs and rejection reason; no Value 2 promotion.
- Retained cumulative V2, Legacy V1 shadow, rejected V1, family breakdowns and the 21.00–<51.00 retained/rejected comparison.

## Requested report

TODAY ACTIVE V2 SELECTIONS: Final Straw; Nicolai; Jaipaletemps; Stroll On By.

TODAY ACTIVE V2 WINNERS: none.

SCREENSHOT SHOWED 0 WINNERS BECAUSE: all genuine V2 selections lost; the three winning Today Value 1 markers were frozen V1 captures.

VALUE V2 TRACKER CORRECT: YES, for the reconciled stored observations and results.

FIX REQUIRED: no historical data or selection fix. Display simplification and standalone result-settlement coverage were implemented.

TODAY V2 SUMMARY: 4 selections; 4 settled; 0 winners; 0% strike; −£4; −100% ROI.

CUMULATIVE V2: 4 selections; 4 settled; 0 winners; 0% strike; −£4; −100% ROI. Legacy V1 shadow: 6 selections, 5 settled, 0 winners, −£5, −100% ROI. Rejected V1: 2 selections, 1 settled, 0 winners, −£1, −100% ROI. Active and shadow overlap.

TODAY/RESEARCH MEMBERSHIP AGREES: YES.

TODAY TISSUE CAPTURE TABLES REMOVED: YES.

TISSUE DATA DELETED: NO.

VALUE RULE CHANGED: NO.

HISTORICAL DATA CHANGED: NO. Production settlement workflows were inspected but not executed. No capture, backfill, schema or model changes.

## Files changed in this follow-up

- `src/app/racing/research/forward-value/forward-value-page.tsx`
- `src/app/racing/research/forward-value/active-value-performance.tsx`
- `src/app/racing/research/forward-value/research-page-layout.test.tsx`
- `src/lib/racing/active-value-performance.ts`
- `src/lib/racing/active-value-performance.test.tsx`
- `src/lib/racing/tissue-value-forward.ts`
- `src/lib/racing/value-rank-v2.test.tsx`
- `scripts/settle-research-results.ts`
- `docs/research-active-page-review-2026-11-05.md`

## Validation

- 53 tests passed across Value V2 settlement, daily/cumulative performance, active Research layout and workflow protocol suites.
- `bun run typecheck`: passed.
- PostgreSQL read-only comparison: four retained selections agree; no outcome, capture or membership mismatch.
- 30 additional tests passed across Tissue generation and all-family Value capture/settlement suites (83 targeted tests total).
- Targeted ESLint and `git diff --check`: passed.
- SHA-256 comparison of all 47 `data/research/*.json` files before and after this task: identical; no research data files were changed.
- `bun run build --webpack`: passed, including TypeScript, page generation and build traces.
