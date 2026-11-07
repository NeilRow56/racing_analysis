# AW 75% / Turf 25% prospective context shadows

Prospective evidence only — candidates selected from the prior retrospective diagnostic.
No automatic promotion. The production artifacts, predictors, selection logic, Trust Scores,
Value tracker and Today filters are unchanged.

## Frozen definitions

Phase epoch: **2026-11-07T12:10:00.000Z**. Candidate definitions and pinned production
hashes are in `src/lib/racing/context-weight-shadow-config.ts`; each observation also
stores their SHA-256 definition hash.

| Candidate | Multiplier | Mutable production adjustments |
|---|---:|---|
| `aw_context_75_shadow_v1` | 0.75 | `speed_rank_2_3`, `same_or_speed_gap` |
| `turf_context_25_shadow_v1` | 0.25 | `same_or_speed_gap` |

AW `speed_rank_missing` stays at 100%, as do every base weight, all other missingness,
all other context terms, frozen feature values, feature standardisation and markets.
This matches the final controlled diagnostic, rather than its earlier three-term AW ablation.

For each runner:

```
production_logit = base_score + full_current_adjustment_score
selected_context = sum(current_weight * (frozen_value - current_mean) / current_scale)
shadow_logit = production_logit + (multiplier - 1) * selected_context
shadow_probability = softmax(full_field_shadow_logits)
```

The final probability is never multiplied by the context multiplier. Turf preserves
the existing competition-rank tie convention; AW preserves UUID tie breaking.
Fixed historical vectors and independent diagnostic predictions are committed as
test fixtures only, never as prospective observations.

## Capture and freeze

`syncTissueGeneration` completes its normal production write first. Only newly accepted
production books are offered to the shadow hook; the hook never backfills existing books.
Capture must be in this phase, on the current local racing date, before scheduled off,
within 60 seconds of the new source capture and without any known outcome. The append
checks the clock again after calculation and acquiring the storage lock.

`data/research/context-weight-shadow-v1.json` starts empty. Its immutable records include
the entire frozen production book (race/runner identities, inputs, production probability,
rank, original market quotes and captured price), shadow probability/rank/logits,
candidate ID/hash, capture time, freeze time and scheduled off. No market-price fallback
is introduced. Missing prices do not exclude probability evidence, but exclude value evidence.

The existing generation JSON lock/atomic-rename implementation is shared through
`frozen-json-store.ts`. Updating predictions, sources, prices, timestamps, candidate IDs or
already settled outcomes is rejected. Settlements call the existing `settleTissueGeneration`
function on the embedded production snapshot; canonical NR/void/non-finisher/dead-heat
semantics and captured-price settlement are not reimplemented.

Normal Daily/new-generation sync and research morning/live/late/result workflows drive
the hook. Pending shadow races are included in normal result reads, even if production
already settled earlier. Capture, read and settlement failures are logged and isolated;
they cannot reject or replace a completed production result. No production refresh or
historical recapture is performed to manufacture a shadow sample.

## Daily card

Only an exact matching frozen production capture receives a badge: **AW SHADOW 75%**
or **TURF SHADOW 25%**. A later production refresh without a matching shadow displays
no stale badge. Missing observations and Jump runners receive neither.

Rank movement displays neutrally as `Shadow: 4 → 2`; no probability-change threshold
is invented. The native expandable details show both probabilities/ranks, probability
difference in percentage points, candidate version and frozen timestamp. The help text
explicitly says observation only and that live production selection is unaffected.
These display projections are separate maps, not fields used by production selection.

## Monitoring

```
bun run report-context-weight-shadow
# Optional read-only inspection of another ledger:
bun run report-context-weight-shadow /tmp/context-shadow-copy.json
```

The command writes no ledger, fits nothing and cannot promote a candidate. It reports
AW and Turf separately by candidate/version, first observation, captured/pending/clean
races/runners, paired production/shadow log loss, summed race Brier, ten-bin ECE and
actual/expected probability bands. Rank-1/top-3 strike rates, rank movement and changed
rank-1/winning-status counts are included. Rank-1 uses a unique probability/UUID leader. Top-3 membership and mean winner rank
retain canonical stored ranks, including Turf competition ties. Dead-heat targets split equally for proper scores.

Each race uses its latest whole valid pre-off capture. Proper scores use identical,
complete all-starter settled fields; NR/void races are flagged/excluded rather than
renormalising their old predictions or silently treating a withdrawal as a losing starter.
Started non-finishers remain canonical settled losers. Missing/unsettled observations
are reported, never reconstructed. Frozen-price rank-1 ROI/P&L and market A/E reuse
canonical settlement and require complete valid captured prices; there is no SP fallback.
Raw market A/E is not a calibration metric. Comparisons of those selections use the
same eligible races, though the two models can pick different horses.

The existing prospective Tissue convention requires 300 settled rank-1 observations
(here, 300 clean paired races per candidate) for the `MEANINGFUL` sample band. Until then
the report says **INSUFFICIENT PROSPECTIVE SAMPLE**. Even after that threshold it stays
descriptive and cannot change production. There are no retrospective results in this ledger.
New future candidate definitions require a new version/phase; unknown versions/hashes
cannot be mixed into this phase's clean comparisons.

The initial ledger contains zero observations. Coverage starts with the next genuinely
new or normally refreshed production capture; earlier books are deliberately not filled in.

The read-only report also compares ledger coverage with eligible post-epoch production
captures, flagging unpaired captures and missing latest-race observations. This is a
coverage count only: it never calculates a missing shadow or substitutes production
results as shadow evidence. An unavailable production coverage source is reported as
null, while already frozen paired evidence remains usable.
