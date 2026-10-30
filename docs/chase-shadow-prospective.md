# CHASE_SHADOW_V1 prospective monitoring

SHADOW ONLY. NOT USED FOR TODAY RANKINGS.

The `CHASE_SHADOW_V1_PROSPECTIVE` epoch was declared at 2026-10-30T06:41:15.000Z.
The ledger is `data/research/chase-shadow-prospective-v1.json`. It begins empty;
2026 holdout and any previously captured primary books remain diagnostic only.
No historical prospective backfill is supported.

## Frozen identity

`data/research/chase-shadow-v1-frozen.json` is an exact byte copy of the completed
report's `/tmp/chase-shadow-v1/frozen.json`, including feature names, means, scales,
coefficients, development protocol, code hashes and original timestamp.

- Model checksum: `ae956fa262be218f0574816c7607ef958b4221e6ae414432c1793744bea8a602`
- File SHA256: `5555629b517413a2caed8e15be46619309d88d527e888a1720d3de6a12ea8dd4`
- Selected representation: A, unchanged Jump numeric and prior-comment inputs.
- Feature schema: `jump_tissue_stage1_numeric_prior_comments_v1` (assigned to the
  unchanged A representation, without modifying the report artifact).
- Development train: 2025-01-01 through 2025-09-30.
- Validation: 2025-10-01 through 2025-12-31.
- Frozen final training: 2025-01-01 through 2025-12-31.
- Settlement: `canonical_settlement_v2`.

Loading validates both pinned hashes and the exact schema. Missing or changed
artifacts fail clearly. No coefficient fitting, calibration fitting, or model
fallback occurs. Report development scripts are unchanged.

## Capture and settlement

The existing `syncJumpTissueMeetings` path used by Today and `jump-tissue:sync`
captures a separate sidecar when accepting each new Chase primary book. Shadow
scores the same frozen full-field `modelInputs` with its own coefficients and
softmax. Current probabilities, ranks, model hash and feature vectors remain
intact. No shadow output is attached to Today runners, Value or selection logic.

Capture must be after declaration, before off, with no results present and within
60 seconds of primary capture. First capture wins under a ledger lock with atomic
rename; retrying cannot overwrite predictions. Incomplete fields are retained as
unavailable coverage, not silently scored. Missing numeric flags remain visible.

At capture, the existing genuine bookmaker quotes yield a median price per runner,
with capture timestamp, quote provenance and basis. Forecast odds and SP cannot
substitute. Prices never enter the scoring function. Later prices do not revise
the frozen price. Research annotations read prior Sporting Life results strictly
before capture: Chase-start count and latest completed/non-completion status.
Unavailable classifications stay unavailable. Existing Speed Reliability is copied
unchanged from runner metrics; MEDIUM/LOW is the union, not a new classification.

Both normal Jump sync and `research:settle` settle pending sidecars through
`settleJumpTissueRace` and `settleSelection`. Started non-finishers lose; NR/void
runners have no settled selection or stake; dead-heat returns use the canonical
divisor. Fields with added runners are excluded from paired evaluation. The
primary history is never rewritten by this tracker.

## Reporting

`/racing/research/winter-2026` shows Current versus Shadow on identical complete
primary books. Incomplete/changed-field counts and coverage are explicit. The
price population is a smaller subset of these same books, not a separate Value
rank population. `bun run chase-shadow:summary` prints the complete JSON report.
Capture runs through normal Jump sync only; there is no historical capture CLI.

Rank 1, Rank 2 and Top 2 metrics count selections. Strike is winning selections /
settled runners. Top 2 race strike is separately labelled. Expected winners sum
original probabilities, excluding NR/void rows; probabilities are not refitted or
renormalized after field changes. A/M counts winning runners, including dead heats.
P/L and ROI use £1 stakes at genuine frozen median bookmaker prices, with price n.

Overall/checkpoint log loss averages race winner negative log probability (each
dead-heat winner contributes 1/divisor). Group and selection log loss is binary
runner log loss. Fixed-band calibration error is sum of absolute actual-minus-
expected winners per band divided by settled runners. Bands are <10%, 10–<15%,
15–<20%, 20–<30%, 30%+. Empty statistics display unavailable, not zero performance.

Reports include agreement/disagreement, prior Chase starts 0 / 1–2 / 3+,
completed/non-completion/unavailable, unchanged Speed Reliability, handicap,
monthly chronology and >6.00 captured-price Rank1/2 context. Groups use all paired
runners; unknown groups are explicit. Longer-price context is descriptive and does
not affect the blue Today marker.

Checkpoints at 50, 100 and 200 settled paired races freeze their member race IDs
when first reached, ordered by settlement time, off time and race ID. Later late
results cannot change a reached checkpoint's population. They are descriptive,
with no automatic decision or promotion.

## Separate future review required

Any replacement must be separately reviewed for better prospective log loss,
better or comparable calibration, stable improvement through time, no material
coverage regression, and acceptable behaviour for new chasers and recent
non-completers. ROI alone is insufficient. No automatic promotion exists.

Storage adds two research JSON files and no SQL schema or migrations. The initial
ledger contains zero captures. Existing pre-declaration books are never imported.

## Implementation completion report

FILES CHANGED:

- `data/research/chase-shadow-v1-frozen.json` — exact frozen report artifact.
- `data/research/chase-shadow-prospective-v1.json` — declared, initially empty epoch.
- `src/lib/racing/chase-shadow-model.ts` — exact identity loader.
- `src/lib/racing/chase-shadow-forward.ts` — locked capture, canonical settlement, checkpoint membership.
- `src/lib/racing/chase-shadow-context.ts` — pre-capture research annotations.
- `src/lib/racing/chase-shadow-summary.ts` — paired metrics and fixed monitoring groups.
- `src/lib/racing/chase-shadow.test.tsx` — 14 focused tests.
- `src/lib/racing/jump-tissue-sync.ts` — normal capture/settlement integration.
- `scripts/settle-research-results.ts` — pending shadow settlement integration.
- `scripts/track-chase-shadow.ts` — read-only summary CLI.
- `package.json` — summary command.
- `src/app/racing/research/winter-2026/page.tsx` — load shadow report.
- `src/app/racing/research/winter-2026/dashboard.tsx` — embed research panel.
- `src/app/racing/research/winter-2026/chase-shadow.tsx` — monitoring views.
- `docs/chase-shadow-prospective.md` — protocol and completion report.

SHADOW MODEL: CHASE_SHADOW_V1, selected A; no refit.

PROSPECTIVE EPOCH: CHASE_SHADOW_V1_PROSPECTIVE, 2026-10-30T06:41:15.000Z.

BACKFILL: NO.

CURRENT MODEL REPLACED: NO.

TODAY RANKING CHANGED: NO.

VALUE LOGIC CHANGED: NO.

TRACKER: SHADOW ONLY. No automatic promotion.

DATABASE: No SQL schema or database data changes. Two new research JSON files;
one stores the frozen artifact and one stores the epoch, paired observations and
checkpoint membership. Existing tracker structures and historical records unchanged.

INITIAL PROSPECTIVE CAPTURES: 0. Capture is wired into the next normal accepted
pre-race Chase book; no existing captures were imported and no live sync was forced.

TESTS: 76 passing tests across 10 files, including 14 focused shadow tests, existing
Jump/Chase research, canonical settlement, winter research, Today shortlist and
longer-price marker tests. Standalone typecheck, targeted lint and `git diff --check`
passed. Read-only replay of all 1,220 holdout races reproduced every frozen report
probability exactly (maximum difference 0); this wrote no prospective observations.
Main Today files, Current model and Value configuration were verified byte-unchanged
from the start of this implementation. Pre-existing working-tree changes preserved.

BUILD: `bun run build --webpack` passed, including production TypeScript and the
`/racing/research/winter-2026` route.
