# 2027 early-season Turf monitor

Version: `TURF_2027_EARLY_SEASON_V1`. Monitoring only. Armed ledger:
`data/research/turf-2027-early-season-v1.json`.

## Historical rationale

The March–July 2024–2026 diagnostic covered 8,483 races and 79,266 runners.
Its classification was **F. MIXED — CREATE A SEPARATE 2027 EARLY-SEASON MONITOR**.
There were no verified historical pre-off market books. Historical SP comparisons
were descriptive and are neither prospective observations nor proof of pre-off
market superiority. No historical research files or observations are changed.

Exact rules were recovered from `/private/tmp/early-season-turf-diagnostic.md`
and verified against `/private/tmp/early-turf-analyse.mjs`. This document and the
sealed implementation preserve them without depending on temporary files.

## Window and frozen form-depth rule

Capture eligible ordinary Flat Turf races dated **1 March–31 July 2027 inclusive**,
using Europe/London racing dates. January/February 2027 runs can supply evidence.
A season is a calendar year; prior season means all years before 2027.

For each runner count canonical, resolved Turf starts strictly before the
production capture's feature cutoff, excluding the target, future, NR, void and
unresolved rows. An observed non-completion is a start, but a completed start
requires a positive finishing position. Partition current/prior histories first.
Latest Speed is the latest available rated run in that partition. Best/average
L3 use the last three starts in that partition, retaining unrateable starts in
the window. Use canonical as-of-source-run Turf Speed ratings, matching the
historical diagnostic. Historical OR availability requires a known OR on a prior
run in the partition; target OR alone does not satisfy this flag. Surface history
requires at least one completed Turf start in the partition.

An established-evidence runner has **at least two completed current-year Turf
starts AND non-null current-year Best L3 Speed**. Classify the whole frozen field
by its share of established-evidence runners:

| Share | Classification |
| --- | --- |
| less than 25% | VERY LOW CURRENT-SEASON FORM |
| at least 25%, less than 50% | LIMITED CURRENT-SEASON FORM |
| at least 50%, less than 75% | MIXED CURRENT-SEASON FORM |
| at least 75% | ESTABLISHED CURRENT-SEASON FORM |

Short names are used in the ledger and displays. The primary research cohort is
**VERY LOW + LIMITED**; all four groups remain fully active in production. Titles,
results and later evidence never reclassify a frozen race.

## Arming, epoch and immutable capture

`bun run turf-early-season:init` exclusively creates the armed ledger. It does
not capture races. `epoch` stays null/PENDING until the first eligible genuine
pre-off observation of any form-depth group is frozen. It then equals that
observation's **exact capturedAt**, never the arming or freeze time.

Normal `syncTissueGeneration` supplies only production books newly accepted by
that invocation, with independently loaded as-of-cutoff history. The monitor
never scans stored books to reconstruct missed captures. Capture rechecks real
wall time under the atomic file lock: same racing date, within 60 seconds of
capture, capture after arming, strictly before scheduled off, no outcomes, no
chronological replay and no duplicate race. Refreshes cannot replace the first
monitor capture. Missing diagnostic history causes capture failure, never a
fabricated zero-history classification. Errors are logged while production
continues unchanged. Outside the 2027 window the adapter performs no database reads.

The observation references the **existing TURF_TISSUE_V4** production record by
race ID, capture timestamp and SHA-256 of its full immutable capture, excluding
only outcomes. That record retains the complete probability vector and native
Tissue ranks, input vectors, source quotes, model version/hash and timestamps.
T1/T2 IDs and version/hash are also frozen in the monitor. No second prediction
or softmax is generated. Missing/mismatched references are visibly excluded from
metrics. Production retains responsibility for canonical settlement.

Atomic locked writes reject edits/removals of observations, methodology metadata
and established epochs. The method, input adapter, capture/store and metric source
hashes are sealed on arming; changed source refuses future captures. V4 artifact
identity is also checked against its existing frozen hash. Any later methodology
change requires a new versioned monitor. No threshold changes, retrospective
recategorisation, price replacement, V4 coefficient changes or historical backfill.

## Genuine pre-off market

Use the same production capture's
`sporting_life_median_bookmaker_at_capture_v1` bookmaker median decimal price for
**every frozen runner**, finite and greater than 1. Normalize once:
`p_i = (1 / price_i) / sum(1 / price)` across the complete field. Freeze prices,
probabilities, ordinal ranks, favourite, second favourite, complete-market flag,
source and capture timestamp. Price ties break by runner ID.

Incomplete books freeze **MARKET INCOMPLETE / UNAVAILABLE**, without partial
normalized probabilities or market picks. Keep V4 observations separately.
Never substitute SP, forecast odds, later prices or a replacement book. The
underlying bookmaker source does not expose independently verified per-quote
publication timestamps: capturedAt is the time this application froze its
received pre-off bookmaker snapshot, not a claim of exchange-level quote freshness.

## Seasonal evidence, dependence and contribution split

Freeze evidence for every runner, including V4 T1/T2 and any eventual winner:
current/prior starts and completions; latest, Best L3 and average L3 Speed;
historical OR availability; same-OR context availability; completed Turf surface
history. Seasonal same-OR availability requires known target OR, seasonal Best
L3 Speed and another captured runner with the same OR and seasonal Best L3 Speed.
Source run identities, dates and observed rating values are frozen for audit.

The eight current-year flags are: any starts, any completions, latest Speed,
Best L3 Speed, average L3 Speed, historical OR, same-OR context and surface history.
Apply the historical availability boundaries to each runner: **HIGH CURRENT-SEASON
EVIDENCE >=75%**, **MEDIUM >=40% and <75%**, otherwise **LOW**. The historical
report applied these boundaries to mean field availability; here the requested
T1/T2 labels use individual availability with the same eight flags and boundaries.
These are diagnostic availability labels, not validated predictive confidence.

Contributions use `weight * (frozen input - mean) / scale` for the existing
base and adjustment vectors. No new V4 probabilities are calculated. Trainer and
jockey include rate and log-start terms; their signed contributions and combined
sum are retained. Their share is the sum of positive participant feature
contributions divided by all positive feature contributions, null if none.

Current/prior allocation follows historical source conventions: latest/best
rating terms use their source year; averages divide the standardized contribution
by usable-source counts in the canonical all-surface timed last-three window.
Speed and performance/today's-rating contributions are separately retained.
Production-source Speed is read with the existing capture-cutoff rating API;
seasonal descriptive evidence uses the historical as-of-source-run API. These
values are intentionally retained separately. Source-count allocation is
descriptive attribution, not an identifiable causal decomposition.

Same-OR, Speed-rank, missingness, comments, target OR, declarations, trainer/jockey
and other unassignable terms remain in **residual context / generic priors**.
Residual is broader than trainer/jockey alone. Current + prior + residual signed
contributions reconcile to the frozen logit. Prior carryover flags prior positive
contribution above 50% of all positive contribution. Source-history gaps remain
observed missing evidence, never reconstructed lifetime history.

Freeze raw same-OR, its unchanged contribution, and
`(sameOR_T1 - sameOR_T2) / (score_T1 - score_T2)`. This signed diagnostic gap share
may be negative or exceed one; it is null for tied/ambiguous/missing native T1/T2
or a negligible gap. No coefficient changes. Freeze missing-indicator count,
summed missingness contribution, all eight current flags/missing count and prior
availability; missingness treatment stays unchanged.

## Canonical settlement and metrics

Join results to the hash-matched original production observation. The existing
normal generation/results settlement paths therefore settle V4 and market
against exactly the same canonical result, without new settlement logic or
another mutable result store. Pending/incomplete races remain pending; all-void
races are void. Non-runners and void runners never count as losing selections,
and never receive replacement picks. Probability metrics exclude them and
renormalize over starters. Dead heats use equal fractional winner targets.
Frozen ranks, classification, prices and probabilities are never overwritten.

Report each cohort and VERY LOW + LIMITED overall and separately for March,
April, May, June and July 2027, including zero-capture months. Metrics: captured,
settled, pending, void, race-mean log loss, multiclass Brier (sum over runners),
ten fixed probability-width calibration bins/ECE, Top1/Top2 winners and eligible
race denominators, fractional winner credit, expected credit, mean winner rank.
V4 retains its native competition ranks, including ties; Top2 is native rank <=2.
Market ordinal ranks break ties by ID. Mean winner rank averages dead-heat winner
ranks within each race before averaging races.

Headline V4/market comparisons use identical complete-market races; all-capture
V4 metrics remain available. Monthly tables include paired log losses, V4 minus
market difference, Top1/Top2 and market coverage. Coverage is complete captures /
all captures, with missing-market and missing-source counts exposed separately.

For every settled paired race, retain winner ranks, each model's race loss,
market-only and V4-only Top2 hits. Lower log loss determines **V4 BETTER** or
**MARKET BETTER**; differences within 1e-12 are **SAME / INCONCLUSIVE**. No
significance or betting profitability claim is implied by a race verdict.

## Display, commands and validation

Today displays secondary `EARLY TURF — VERY LOW / LIMITED / MIXED / ESTABLISHED`
only for eligible, identity-matched frozen observations, near the existing Tissue
comparison. Research adds **2027 EARLY-SEASON TURF — V4 VS MARKET**, cohort and
monthly paired tables, all-capture V4 metrics and settled head-to-head detail.
No production selection, Value, watch list or ranking changes.

`bun run turf-early-season:summary` prints status and full metrics/calibration.
Reads never capture, backfill, update market prices or settle races.

Validation: `bun test src/lib/racing/turf-early-season.test.tsx
src/lib/racing/tissue-generation.test.tsx src/lib/racing/hurdle-low-form.test.tsx`,
`bun run typecheck`, and ESLint on changed TypeScript/TSX files. No Python changes
and no full production build are required.
