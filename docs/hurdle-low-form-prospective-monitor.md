# Low-form Hurdle prospective monitor V1

Version: `HURDLE_LOW_FORM_PROSPECTIVE_V1`. Monitoring only. The primary
comparison is frozen V3 SHADOW versus normalized pre-off market. Production
`HURDLE_TISSUE_V2` is a secondary comparator. No coefficients, V3 scoring,
Value rules or watch-list rules change.

## Historical rationale

The completed early-season descriptive audit covered 357 low-form races and
2,962 runners: 124 very low, 179 limited and 54 mixed. Its 55 complete pre-off
market books gave market/V3 log loss 1.404/1.802, Top1 hits 28/24 and Top2 hits
35/34. Market probability quality was better in October and November; no
complete December/January market books existed. No reliable V3 advantage
subgroup emerged. Its conclusion was **MIXED — NEED A SEPARATE LOW-FORM
FRAMEWORK**. These are development/descriptive findings, never observations
in this prospective cohort.

The exact classification was recovered from the completed local audit,
`/private/tmp/early-season-low-form-hurdle-diagnostic.md`, and checked against
its `early-season-low-form-hurdle-work/analyze.ts`. This document preserves the
rules so that future operation does not depend on temporary audit files.
The evidence definition comes from `hurdle-v3-low-form-work/analyze.ts`.

## Frozen classification

Use the entire field in the accepted pre-off V3 shadow, with canonical
Hurdle-only history strictly before its original feature cutoff. Exclude
NR/void/unresolved prior runs and the target race using the existing canonical
history adapter. Count prior PU/fall/unseated starters as starts.

A runner is:

- **No Hurdle form:** zero prior canonical Hurdle starts.
- **Established:** at least three prior Hurdle starts, at least two completed
  prior Hurdles (non-null finishing position), and observed best-L3 Hurdle Speed.
- **Limited:** every other runner with prior Hurdle starts.

Apply these race rules in this exact priority order:

1. **ESTABLISHED FORM:** at least 50% of the frozen field is established.
2. **VERY LOW FORM:** otherwise, at least 50% has zero prior Hurdle starts.
3. **LIMITED FORM:** otherwise, fewer than 25% is established.
4. **MIXED FORM:** otherwise (25% to under 50% established, under 50% debutants).

The established rule wins exact 50/50 ties. The headline low-form cohort is
**VERY LOW + LIMITED**. Mixed is separately visible; established is recorded
for classification coverage and excluded from headline metrics. All Hurdle
races remain eligible for normal V2/V3 capture. Prospective monitoring operates
all year; October–January are explicitly broken out, including empty months.
No race-title or result-based reclassification occurs after capture.

## Prospective epoch and capture

The ledger is `data/research/hurdle-low-form-prospective-v1.json`.
`armedAt` is written once by exclusive initialization. `epoch` remains null
until the first genuinely new very-low, limited or mixed pre-off observation
is accepted. Its exact timestamp is then frozen in the ledger and displayed
on Research and in the terminal summary. Established-only captures do not
start the low-form epoch.

Normal `syncTissueGeneration` invokes the monitor after the existing shadow
writer. Only observations absent before that invocation and tied to freshly
accepted production books are passed to it. Capture rechecks actual wall time
under the atomic ledger lock: same racing date, capture after arming, no more
than 60 seconds old, strictly before scheduled off, no outcomes, no duplicate
race and no chronological replay. Failure is logged without changing production.
If an observation cannot be recorded in that window, it is never reconstructed.

Each observation freezes its classification, date, capture/freeze timestamps,
market book and runner diagnostic evidence. It references the **existing** V3
shadow by race ID, capture timestamp and SHA-256 of the complete immutable
shadow capture, excluding only settlement outcomes. That referenced record
contains frozen V3 T1/T2, full probabilities, inputs/history, and production
V2 T1/T2 and full probabilities. The monitor does not score V3 again and does
not create a competing score or duplicate a settlement store. Missing or
mismatched references are explicitly excluded from metrics, with a visible count.

## Market capture and missing prices

Use the exact production capture's
`sporting_life_median_bookmaker_at_capture_v1` prices: valid decimal bookmaker
median for **every** frozen runner, each greater than 1, all captured before off.
The source quotes remain in the referenced frozen production book. Normalize
`(1 / price) / sum(1 / price)` once across the entire frozen field. Freeze runner
IDs, prices, probabilities, ordinal ranks, favourite, second favourite, source
and capture timestamp. Resolve equal prices by runner ID; exactly one favourite
and two Top2 selections are used in headline comparisons.

An incomplete book freezes `MARKET UNAVAILABLE / INCOMPLETE`, with no normalized
partial market and no favourite selections. Keep its V3/V2 observations and
metrics. Never substitute SP, a forecast, later quotes or a replacement book.
The headline table compares V3 and market on identical complete-market races;
all-capture V3 and secondary V2 metrics are available separately with coverage.

## Trainer/jockey dependence and Hurdle evidence

Freeze diagnostics for every runner, including V3 T1/T2 and any later winner.
Attribution uses the sealed model's standardized contribution
`weight * ((raw ?? trainingMean) - trainingMean) / scale` on the frozen raw
vector, without generating predictions. Trainer and jockey groups include their
rate and log-starter terms; missingness flags remain in the missingness group.
Record trainer, jockey, combined logit contribution, and their summed **positive
feature contributions** divided by all positive feature contributions. The
share is null if there are none. Participant ability remains generic across
codes, matching sealed V3.

Reuse the diagnostic's seven substantive evidence flags: observed OR, latest
Hurdle Speed, best-L3 Speed, average-L3 Speed, history for completion, history
for experience, and eligible prior comment (within 180 days). **HIGH** requires
established runner form and at least six flags; **MEDIUM** requires at least one
prior Hurdle start and three flags; otherwise **LOW**. These are evidence labels,
not a new production confidence or selection rule. Winner evidence is obtained
by joining canonical winner IDs to these frozen records.

## Settlement and metrics

Read outcomes directly from the referenced canonical V2/V3 shadow settlement.
Existing normal generation sync, `research:settle`, and V3 `results` therefore
settle all three comparators consistently, without a separate low-form results
command. Pending/incomplete results remain pending. PU, falls and unseated
starters can settle as losses; NR/void selections never count as losses and
never receive replacement picks. Exclude NR/void runners and renormalize all
three probability books over starters for probability metrics. Dead heats use
equal fractional winner targets. Frozen classification, ranks and prices remain
unchanged.

Report very-low, limited, mixed and very-low + limited, both overall and by
calendar year-month. Show October, November, December and January of the armed
season even with no captures; January belongs to the season beginning the
previous calendar year. Further captured months/years are reported separately.

For V3 and complete market report races captured, settled, pending/void,
race-mean log loss, multiclass Brier (sum of squared runner errors), ten fixed
probability-width calibration bins/ECE, Top1 and Top2 race hits and eligible
selection denominators. V2 provides the same secondary measures, including
log loss because production always stores a probability vector. Top2 hit means
at least one frozen active Top2 selection wins, counted once per race; dead-heat
actual/expected credit is fractional. No ROI or Value changes.

For every settled priced race retain winner ranks for all dead-heat winners,
V3 and market log-loss contribution, separate rank and loss verdicts, and
market-only/V3-only Top2 hits. Overall verdict is **V3 BETTER**, **MARKET BETTER**
or **SAME**, using lower race log loss first and lower summed winner rank as a
tie-break when loss differs by no more than 1e-12. Both criteria remain visible,
so conflicting rank/probability judgements can be inspected.

## Immutable operation and display

Observation objects are append-only with atomic locked writes. Existing
classification, diagnostics, references and market prices cannot be edited or
removed. Epoch and arming metadata cannot be restarted. Classification,
attribution, capture and metric implementation hashes are sealed on arming;
changed code refuses further captures. The existing V3 implementation and
artifact pins remain untouched. Any methodology/threshold/coefficient change
requires a new versioned cohort; no retrospective relabel, replacement prices
or backfill from the 357 historical races is permitted.

Today adds secondary `LOW FORM — VERY LOW`, `LOW FORM — LIMITED` or
`LOW FORM — MIXED` text beside the existing V3 comparison, only for matching
prospective records. Frozen Market T1/T2 are explicitly comparison-only.
Research includes a compact paired table, monthly breakdown, all-capture V3
and secondary V2 metrics, missing-source coverage and settled race head-to-head.

Initialize once with `bun run hurdle-low-form:init`. Read the summary with
`bun run hurdle-low-form:summary`. Routine production/V3 capture automatically
feeds the monitor from the next accepted new race. No live capture or historical
backfill is performed merely by initialization, summary, or page reads.

Validation: `bun test src/lib/racing/hurdle-low-form.test.tsx
src/lib/racing/hurdle-v3-shadow.test.tsx
src/app/racing/today/hurdle-model-comparison.test.tsx`, `bun run typecheck`, and
targeted ESLint on changed TypeScript/TSX files. No production build is needed.
