# Hurdle V3 prospective market-edge monitor

Version: `HURDLE_V3_MARKET_EDGE_PROSPECTIVE_V1`.
Ledger: `data/research/hurdle-v3-market-edge-prospective-v1.json`.

Armed on **10 November 2026 at 15:09:46.483 Europe/London**
(`2026-11-10T15:09:46.483Z`). At initialization the prospective epoch is pending
and the ledger contains zero observations. Getaway Charlie was not backfilled.

The Speed-sign diagnostic classified large model-versus-market disagreements as
needing separate monitoring. Winners had higher raw Best-L3 Speed, but frozen
coefficient corrections failed the 2025/2026 proper-score decision rule. Large
positive edges underperformed against final SP at both Speed depths. Pre-off
evidence was insufficient. This monitor gathers new pre-off evidence without
altering either model, Value, watch lists, Today rankings or settlement logic.

## Arming and prospective capture

Initialize once with `bun run hurdle-v3-market-edge:init`. Exclusive creation
refuses to overwrite an existing ledger. `armedAt` records initialization;
`epoch` remains null until the first genuine accepted capture, including an
incomplete-market context observation. Initialization and page reads capture
nothing. Read status with `bun run hurdle-v3-market-edge:summary`.

The normal `syncTissueGeneration` workflow passes only newly accepted V3 shadow
pairs from that production invocation, with exact race ID and capture timestamp.
The monitor runs independently of the existing low-form hook. Both diagnostic
hooks fail open for production and for one another. No extra scheduler or DB
connection is needed. The existing shadow results workflow supplies canonical
settlements, including when its results-only command is used.

Capture requires a current local racing date, a feature cutoff and capture after
arming, no target outcomes, no future timestamp, before scheduled off, and no more
than 60 seconds since capture. The atomic ledger writer rechecks the real clock
after acquiring its lock. The first observation per race is frozen. There is no
historical date, replay, refresh or backfill command. A race already in the V3
shadow when this monitor is armed cannot enter later, even if its market is
subsequently refreshed. Consequently the Fairyhouse Getaway Charlie capture from
10 November 2026 at 05:29 is excluded when arming later that day.

## Frozen market and edge bands

For each runner:

`market_probability_i = (1 / captured_decimal_price_i) / sum_j(1 / captured_decimal_price_j)`

`EDGE_PP = 100 × (official_frozen_V3_probability − market_probability)`.

Require the complete bookmaker-median book embedded in the **same** production
capture as V3. Race, field runner IDs, feature cutoff, scheduled off and capture
timestamps must match exactly. The market capture timestamp and source are
frozen. No later/live odds, SP, Value rank or approximate matching is accepted.

| Band | Edge in percentage points |
| --- | --- |
| NEGATIVE | <0 |
| SMALL POSITIVE | 0 to <5 |
| MEDIUM POSITIVE | 5 to <10 |
| LARGE POSITIVE | >=10 |

The primary headline is **V3 T1 EDGE >=10 PP**. T1 5–<10 pp is secondary;
other bands provide context. T2 uses separate tables and denominators, never
combined T1/T2 headline counts. Bands refer to each original frozen selection.

Incomplete/invalid full books retain a context observation with
`completeMarket: false` and null market prices/probabilities/ranks/edges/bands.
They are counted separately and do not enter edge cohorts. They are never later
filled with replacement prices.

Market rank is competition rank: one plus the number of strictly shorter prices.
Equal prices share a rank. The frozen favourite and second favourite use
probability descending, then runner ID ascending to break ties deterministically.
Market-rank bands are **1–2, 3–5, 6–8, 9+**.

## Frozen Speed and form evidence

Count finite Speed ratings in the **actual last three canonical prior Hurdle
starts**, strictly before cutoff and excluding the target. Unrated/DNF starts
occupy their slots. No backfill, non-Hurdle transfer or calendar-age filter is
introduced. The existing frozen Hurdle history builder supplies the window.

| Count | Frozen category |
| --- | --- |
| 0 | NO USABLE RECENT SPEED |
| 1 | ONE USABLE RECENT SPEED |
| 2 | TWO USABLE RECENT SPEEDS |
| 3 | THREE+ / ESTABLISHED SPEED |

The large-edge headline splits into **LOW SPEED EVIDENCE (0–1)** and
**ESTABLISHED SPEED EVIDENCE (2–3)**. The fixed three-start window cannot supply
more than three ratings. Evidence depth does not measure career experience.

The existing `classifyHurdleForm` function also freezes the race/field classification
VERY LOW FORM, LIMITED FORM, MIXED FORM or ESTABLISHED FORM. It is reused unchanged;
it is not a new runner classification or a change to the low-form monitor.

## Frozen context and attribution

Every runner stores V3 probability, logit and rank; V2 rank; normalized market
probability, decimal price and competition rank; edge PP and band; Speed count,
category and binary evidence; and grouped frozen V3 contributions. Each observation
stores V2 T1/T2, V3 T1/T2 and market favourite/second favourite identities.

The twelve contribution groups are OR, Speed, Speed context, trainer, jockey,
age, recency, Hurdle experience, completion, comments, missingness and other.
Missing flags take precedence over their parent group. Contributions sum to the
unchanged official V3 logit. Absent model groups contribute zero. The three largest
strictly positive groups and individual features are stored, with deterministic
name tie-breaking and fewer than three entries when fewer are positive. This
records attribution only and does not create a second prediction.

The capture digest binds the exact underlying shadow and market snapshot while
excluding only outcomes. Source mismatches are explicitly unavailable rather than
silently joined to another capture.

## Canonical settlement and metric denominators

The new ledger contains **no independent result store or settlement writer**.
Results are read from the matching canonical V2/V3 shadow observation using the
immutable digest. Existing settlement logic remains unchanged. PU/fall/unseated
are canonical losses; NR/void runners are not losses. Pending results remain pending.

For each T1/T2 band and each large-edge Speed, market-rank and form split report:
captured, eligible settled selections, winners, strike rate, model expected
winners, fractional Actual/Model, V3 log loss, Brier, calibration ECE, average
market rank, market log loss and market Top1 winner rate. Pending, void races,
NR/void selections and unavailable exact sources are separately exposed.

Frozen T1/T2 are never replaced after withdrawals. A settled race enters that
selection cohort's quality/expectation metrics only if its original selected
horse is an actual starter. This keeps the headline settled denominator aligned
with its winners and expectation. Full-race V3 and market probabilities are
independently renormalized over actual starters in these same races, without
changing the stored capture values or edge-band assignment.

Log loss is mean race multiclass cross-entropy; Brier is mean race sum of squared
runner errors. Dead heats allocate target credit `1 / number_of_winners` for
proper scores and Actual/Model. Winners/strike count race hits. Expected winners
sum the selected horse's starter-renormalized V3 probability over eligible settled
races. Calibration is runner-weighted ECE in ten fixed `[0,.1), …, [.9,1]` bins.
Average market rank covers captured selections in the displayed cohort. Market
Top1 uses its frozen deterministic favourite with its own eligible denominator
when that horse is withdrawn; it receives no replacement. No ROI headline is used.

For each large-edge race, the Research details and summary record V2's rank of
the V3 T1, both models' original T1/T2 identities, and whether each original Top2
contains an eventual winner. V2 is reference only.

## Immutability and Research display

The ledger pins source hashes for monitor capture/method/metrics, the reused form
classification, Hurdle feature construction/scoring and shared metric helpers.
The V3 checksum is fixed to the sealed challenger. Methodology metadata, arming
time, an established epoch and prior observations cannot be rewritten. Definition
or coefficient changes require a new versioned monitor, never an in-epoch repair
or reclassification of old observations. Pins are checked inside the write lock.

The forward-value Research page contains the compact section
**HURDLE V3 — PROSPECTIVE MARKET-EDGE MONITOR**, with the large-edge headline,
T1 bands and large-edge Speed/market-rank splits. T2, form and V2 reference details
are expandable. Today receives no additional label or ranking change.

Validation uses temporary ledgers and synthetic canonical fixtures only:

```sh
bun test src/lib/racing/hurdle-v3-market-edge.test.tsx src/lib/racing/hurdle-v3-shadow.test.tsx src/lib/racing/hurdle-low-form.test.tsx src/lib/racing/tissue-generation.test.tsx
bun run typecheck
bun run lint -- src/lib/racing/hurdle-v3-market-edge*.ts src/lib/racing/hurdle-v3-market-edge.test.tsx scripts/track-hurdle-v3-market-edge.ts src/app/racing/research/forward-value/hurdle-v3-market-edge-monitor.tsx src/lib/racing/tissue-generation-sync.ts src/app/racing/research/forward-value/forward-value-page.tsx
```

No Python is changed and no production build is required for this monitor.
Setup validation passed: **53 targeted tests**, strict TypeScript typecheck and
targeted ESLint. Existing shadow source pins remained valid. Initialization
changed no existing research ledger.
