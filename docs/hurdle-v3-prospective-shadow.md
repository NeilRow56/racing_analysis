# Hurdle V2 vs V3 prospective shadow

V2 (`HURDLE_TISSUE_V2`) remains **LIVE PRODUCTION**. Its model, input pipeline,
rankings, probabilities and Today selections are unchanged. V3
(`HURDLE_TISSUE_V3_CHALLENGER`) is **PROSPECTIVE SHADOW**, with its sealed model and
features unchanged. Neither LED nor PU is added to official V3 scoring.

The isolated ledger is `data/research/hurdle-v3-prospective-shadow-v1.json`, version
`HURDLE_V2_V3_PROSPECTIVE_SHADOW_V1`. `armedAt` records setup completion. `epoch`
is initially null and becomes the exact common `capturedAt` of the first accepted
genuine pre-off pair. It is then immutable. A pending epoch means zero prospective
observations, not missing historical evidence. See the ledger or run
`bun run hurdle-v3-shadow:summary` for the exact current timestamps and counts.

Setup completed and the ledger was armed at **2026-11-08T09:35:06.976Z**
(09:35:06.976 Europe/London). The initial current-day sync found no Hurdle
racecards for 8 November, leaving the epoch pending with zero observations.
The first genuine capture subsequently set the epoch to
**2026-11-08T09:58:39.727Z**. The ledger contained **14** genuine observations
when inspected for the Today loader repair on 8 November. Arming never supplies
an observation timestamp; an armed empty ledger must keep `epoch: null`.

Frozen model content checksums:

| Model | SHA256 content checksum |
| --- | --- |
| V2 production | `53defc50d717aba63c80c9f3c01c4df4360b709f6f4a21509a514179e23cce90` |
| V3 shadow | `50f6e1842ca1cb0c4ed4c068a91adbc934755b7018c07f4e6f77e3b56fa80bf4` |

The ledger additionally pins exact artifact file hashes and source hashes for
V3 feature construction, input loading, canonical settlement, Speed, scoring and
shadow tags. Hash drift blocks new shadow captures without changing production.
Original artifacts are not edited, including their original development status.

### 8 November loader repair

The current ledger's epoch and captures were consistent. The loader failed in
Next.js's Node runtime because it compared recomputed raw features with exact
numeric equality. Bun's JavaScriptCore and Node's V8 produced final-bit differences
in `log1p` and exponential decay (34 raw values, differences around `1e-16`).
The same ledger passed the original Bun validator and failed the Node validator.

Validation now allows only `2 * Number.EPSILON * max(1, |a|, |b|)` rounding for
the seven derived logarithmic/comment-decay features. Direct inputs, flags,
nulls, provenance, tags, ranks, timestamps, epoch and immutability checks remain
exact. Probability consistency retains its existing tolerance. Chronological
order is also enforced across all observations and new appends.

Only the validator source pin was updated, under the ledger lock:

- Previous `src/lib/racing/hurdle-v3-shadow.ts` SHA256:
  `7c81bd60fe2c54da6519bb3fdca6f9368d5f450c292e7904a432e7990be4052b`
- Repaired SHA256:
  `123392a2c9c78e7a35ff90eab93ffcd72c528698043f5d237af2024ff681cadc`

No model, scoring, feature construction, captured values or epoch were changed.
Normal concurrent result settlement was preserved. Regression tests exercise
armed empty loading, invalid invented epochs, first capture persistence, repeated
loads, duplicate rejection, out-of-order rejection and Bun-to-Node validation.

## Capture and immutable pairing

The existing `syncTissueGeneration` hook prepares V3 inputs before the common
capture timestamp. It reads horse and participant histories strictly before the
same production feature cutoff. Only V2 books newly accepted by that invocation's
production writer may be paired. Existing production books are never replayed.

Both models use the same active field. The pair stores complete V2 and V3 rankings
and probabilities, horse identities/names, model versions and hashes, feature
cutoff, scheduled off, capture and shadow freeze times, V3 raw features and Hurdle
source evidence. T1/T2 are the immutable rank-1/rank-2 entries in each book.

The first pair for each race is retained; later V2 refreshes cannot replace it or
create extra headline race observations. Capture must occur on the current local
racing date, before scheduled off, after arming, without target outcomes, and
within 60 seconds of production capture. The real clock is checked again inside
the atomic writer after acquiring its lock. Crossing off means the shadow is
missed permanently, not reconstructed. Concurrent writers cannot reset the epoch
or duplicate a race. Shadow errors fail open for production and are logged.

Normal Today/refresh, morning and late production captures automatically use this
hook. The normal live/after research settlement workflow settles pending shadows.
No new scheduler, credentials, dependencies or Today selection column is needed.

## Horse-history and denominator safety

Horse history, Speed, completion and comments are Hurdle-only. Prior sources are
classified with the canonical race-subtype classifier, then restricted to valid
settled starters before cutoff, excluding the target race, NR/void and unresolved
records. The frozen V3 feature builder is reused unchanged. Speed is loaded only
for the actual last three canonical Hurdle start IDs, through the same canonical
as-of-prior-run rating API as training. Flat/AW/Chase/bumper comments cannot enter.
Blank and DNF starts occupy their proper slots in the fixed window.

Trainer/jockey ability remains generic across codes, as specified by sealed V3.
Its denominator includes every valid settled prior starter, including PU, falls,
unseated and other canonical non-finishers. NR/void/unresolved records are excluded.
Each capture freezes starts, wins, latest source time, source/excluded counts,
non-finisher counts and a digest of included starter IDs. No current career totals
are used. Missing priors retain V3's original imputation and absence gates.

## Frozen observation tags

LED uses exactly the diagnostic definition:

- Literal word-boundary regex `led|made all|made virtually all`, case insensitive.
- Actual latest three canonical Hurdle **starts**, without backfilling blank comments.
- Record raw latest flag, any-last-three flag and last-three count.
- Each matching comment contributes `2^(-ageDays/90)` up to and including 180 days,
  and zero thereafter. The primary signal is the maximum of those three values.
- The separately frozen counterfactual adds
  `0.3512845775499634 × primarySignal` logits (display rounding `+0.351285`) and
  re-normalizes across the same field. Its full probabilities/ranks are stored
  separately from official V3. Raw flags and decayed contributions remain distinct.

PU records latest-Hurdle PU, PU in the last two Hurdle starts, latest Hurdle age
and days since most recent prior Hurdle PU. `recentPU` means actual latest Hurdle
start was `pulled_up` within 30 days. No PU coefficient is scored anywhere. The
diagnostic `-0.44950262613334757` (`-0.449503` rounded) remains observation context
only. No LED/PU combination is scored.

LED reporting can identify V3-missed Top2 winners bearing the active tag, and
whether the frozen counterfactual would change T1, T2 or Top2 and recover them.
There is no coefficient selection or tuning after arming.

## Settlement and metrics

Each pair has one shared canonical outcome vector, using the existing generation
settlement function for both models. Results require a complete consistent starter
field. PU/fall/unseated are losses, genuine non-runners and voids are not. Outcomes
are settled once and cannot be rewritten. Incomplete results stay pending.

The research monitoring page at `/racing/research/forward-value` shows:

- Captured, settled, pending and void races, separately from historical development.
- V2/V3 T1, T2 and Top2 race hits, strike rates, eligible denominators, model expected
  winners and Actual/Model.
- Mean race-level multiclass log loss, sum-of-runner-error Brier and runner-weighted
  ECE in ten fixed `[0,.1), …, [.9,1]` bins.
- All ranking disagreements, V2/V3 T1/T2, actual winner(s), original winner ranks,
  Top2-set differences and cumulative V2-better/V3-better/same counts.
- Exclusive V2/V3 Top2 hits and LED observation/counterfactual counts.

Quality metrics use the same complete settled races and renormalize each model's
frozen probabilities over actual starters after removing NR/void runners. Stored
books remain untouched. Original T1/T2 selections are never replaced: a void T1
is excluded from that model's T1 denominator, and Top2 remains eligible when at
least one original selection started. Consequently selection denominators can
differ between models while the probability-quality race cohort stays identical.

Dead heats have equal `1 / numberOfWinners` target credit in loss, Brier,
calibration and Actual/Model. Headline strike rates count race hits; Actual/Model
uses fractional winning credit divided by expected probability mass. The
head-to-head winner-rank comparison uses the mean original rank across dead-heat
winners. "Same" includes races with identical winner rank even if other ranks
differ. ROI is not used or shown for this experiment.

These are prospective observations only. The prior 2025/2026 LED/PU diagnostics
and Avatar reconstruction never enter this ledger or its metrics. Small early
samples do not determine promotion. Further development requires another
separately versioned challenger and epoch, without rewriting this one.

## Operations

```sh
# Exclusive initialization, once. Never resets an existing ledger.
bun run hurdle-v3-shadow:init
# Normal current-day production capture; pairs only newly accepted books.
bun run hurdle-v3-shadow:sync
# Settle already captured shadow races, without capturing or backfill.
bun run hurdle-v3-shadow:results
# Read-only status and cumulative metrics.
bun run hurdle-v3-shadow:summary
```

The usual production capture/settlement commands already invoke these hooks.
There are no date arguments, historical importer or force-refresh option on the
shadow CLI. Tests create synthetic books only in temporary directories, never
in the research ledger. Model and feature changes are prohibited within the epoch.

## Setup validation

TypeScript strict typecheck and targeted ESLint passed. The new shadow tests cover
official-score parity, fixed tags and recency boundaries, canonical participant
denominators, epoch/replay guards, immutability, dead heats, non-finishers, NR/void,
pending results, reporting and production fail-open behavior. Existing V3,
production-generation, context-shadow and workflow suites also passed.

`bun run build --webpack` completed successfully. Default Turbopack compilation
was prevented by the execution sandbox's local-port restriction. A read-only
adapter test against one stored Hurdle race verified 14 runner histories and
canonical non-finisher participant denominators; it wrote zero observations.
That diagnostic is not part of the prospective cohort.
