# Chase comment-balance audit — 6 November 2026

WERE COMMENT WEIGHTS MATERIALLY CHANGED: **YES**

WAS THAT CHANGE INTENTIONAL AND DOCUMENTED: **YES**

DO COMMENTS EXPLAIN THE PROBLEMATIC CHASE SWAPS: **PARTLY**

IS THERE A SATISFACTORY MODEL-QUALITY JUSTIFICATION: **YES**

FINAL CHASE RECOMMENDATION: **KEEP CHASE_TISSUE_V2**

This is a judgement under the supplied decision rule, not proof that the new
model will perform better prospectively. The frozen protocol explicitly calls
for a Chase-only refit, and the recorded broader comparison supplies a clear
probability-quality reason for it. Consequently the evidence does **not** meet
the rule's definition of an UNJUSTIFIED MODEL-BALANCE CHANGE. Recent results
and comment-driven demotions are adverse evidence and are reported below.

No revert was implemented. No Turf, AW, Hurdle, model parameters, capture files,
settlements, or application logic were changed by this audit.

## What actually changed

The old and new models use the same 79 named inputs in the same order: 36
numeric/missingness inputs and 43 comment inputs. The latter include comment
count, latest-comment phrase flags and last-three phrase counts. Preserving
these inputs did **not** preserve their coefficients, means or scales.

Production CHASE_TISSUE_V2 embeds exactly the frozen CHASE_SHADOW_V1 model.
Its four additional adjustment weights are zero. Production loaders validated
the old Jump artifact, pinned Shadow file/model hashes and active generation
checksums. Thus these differences originate in the earlier Chase-only fit,
not an extra November comment adjustment.

The effective coefficient per unit of raw input is `weight / scale`. Comparing
standardised weights alone would miss scale changes. Of the 43 comment inputs,
42 have changed effective coefficients and 11 switch sign. The one unchanged
effective coefficient is `last_deniedRoom`, zero in both models.

Selected examples, in logits per raw input unit:

| Feature | JUMP_TISSUE_V1 | Shadow / Chase V2 |
| --- | ---: | ---: |
| last_led | 0.2134 | 0.0671 |
| last_stayedOn | 0.1411 | 0.2592 |
| last_faded | -0.2849 | 0.0754 |
| last_eased | 0.0744 | -0.2641 |
| last3_awkwardStart_count | 0.1101 | -1.1554 |
| last3_strongFinish_count | 0.1222 | -0.2136 |

These are conditional fitted coefficients, not standalone causal claims about
phrases. Latest and last-three features overlap. The accompanying JSON contains
all 43 effective coefficient pairs.

On the 19 current frozen Chase fields, mean within-race standard deviation of
comment logits falls from 0.2402 to 0.1991 (17.1%). Numeric logit dispersion falls
from 0.4343 to 0.2763 (36.4%). Comments therefore retain more influence relative
to numeric inputs, despite lower absolute dispersion. These dispersions are
descriptive; correlated groups do not permit interpreting their ratio as a
percentage share of explained variance.

## Attribution on identical frozen fields

The audit scores each frozen input vector under four fixed combinations:
old numeric + old comments; new numeric + new comments; new numeric + old
comments; old numeric + new comments. Each block uses its own model's means,
scales and weights, followed by full-field softmax. Nothing is fitted.

For each old-T1 → new-T2 demotion, the runner-pair logit margin change is split
exactly into numeric and comment coefficient changes. Restoring old comments
tests whether the old T1 returns to first place against the **whole field**.
This is a coefficient counterfactual, not a proposed production hybrid.

| Frozen cohort | Fields | Changed T1 | Old T1 → new T2 | Comment change favours new T1 | Comments largest margin-change block | Restore old comments restores old T1 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Eligible old Jump Chase archive | 201 | 61 | 37 | 33/37 | 23/37 | 26/37 |
| November generation development | 61 | 24 | 12 | 12/12 | 9/12 | 9/12 |
| Current post-epoch Chase captures | 19 | 7 | 7 | 5/7 | 2/7 | 5/7 |

These populations overlap; they must not be added together. The archive uses
pre-race, full-coverage Chase books without an exclusion reason. Development
uses the preserved generation development dataset. Current means the audited
snapshot of the generation ledger, containing 5–6 November captures.

In current captures, changing comments alone demotes the old T1 in only 1/7
cases; changing numeric coefficients alone does so in 2/7. Combined effects
cross the ranking boundary in the other cases. “Restoring comments fixes 5/7”
does not mean comments alone caused five swaps or account for 71% of model loss.

| Date / course | Old T1 → new T1 | Comment margin delta | Numeric margin delta | Restore old comments restores old T1 | Recorded result |
| --- | --- | ---: | ---: | --- | --- |
| 5 Nov / Plumpton | Bond Broker → Crest Of Stars | +0.40055 | +0.33886 | Yes | Old T1 won |
| 5 Nov / Plumpton | Marlacoo → Klic Boum | +0.23122 | +0.45346 | Yes | Old T1 won |
| 5 Nov / Plumpton | Ferret Jeeter → Melton Mossy | +0.20983 | +0.45730 | Yes | Neither won |
| 6 Nov / Aintree | Off The Jury → Barnpark | +0.20061 | +0.16213 | Yes | Unsettled in snapshot |
| 6 Nov / Aintree | Royal Infantry → Intosomethinggood | -0.15966 | +0.32485 | No | Old T1 won |
| 6 Nov / Aintree | Mirabad → Stencil | +0.15057 | +0.44556 | Yes | Neither won |
| 6 Nov / Hexham | Walk Tall → C'mon So | -0.14113 | +0.51457 | No | Unsettled in snapshot |

Positive deltas favour the new leader relative to the old leader. Comments
oppose two demotions. Among the three settled swaps where the old T1 won,
restoring comments corrects two. Royal Infantry's demotion is numeric-driven.
This supports **PARTLY**, rather than attributing every problematic swap to
comments. No dated-source comment reconstruction or comment-age assumption
is needed for this coefficient attribution.

## Was it intentional and documented?

**Yes, as a modelling procedure.** The frozen Shadow protocol defines candidate
A as “Unchanged Jump numeric and prior comment inputs; Chase-only fit”. It
specifies selection on 2025 validation race log loss, a calibration/Top2/feature
count tie-break, then refitting the selected representation on all eligible 2025
Chases before reading the 2026 holdout. The implementation's `fit` function
re-estimates means, scales and **all** weights; it never freezes comment weights.
Both research source-file hashes still match those recorded in the artifact.

The original report generator explicitly describes a Chase-only fit of the
existing 79 inputs, rejection of more specialised representations, and a
comparison against the original shared Jump model. The November generation
document explicitly promotes the exact frozen Shadow coefficients.

This does **not** establish that the user separately approved or was clearly
informed of each comment-coefficient change. There is no phrase-by-phrase
modelling explanation and no recorded comment-block ablation establishing that
each changed coefficient improves quality. The documented intention is a joint
Chase-specific refit, not a deliberate manual increase in comment weighting.
The user's recollection is compatible with that distinction.

## Is the quality justification satisfactory?

**Yes for the joint refit's modelling rationale under this decision rule; not
as proof that the comment block independently improves future T1 hit rate.**

The preserved broader comparison contains 1,220 identical historical Chase
fields / 9,083 runners:

| Metric | Old Jump | Shadow / Chase V2 |
| --- | ---: | ---: |
| Race log loss | 1.85827 | 1.82507 |
| Fixed-band calibration error | 1.579% | 0.756% |
| T1 winners | 303 | 321 |
| Top2 winner coverage | 547 | 554 |

Log loss improves in all four calendar quarters. Across the 371 changed T1
identities, the old leader wins 69 and the new leader wins 87. This is a clear,
documented quality rationale independent of ROI. The current demotions cannot
erase that evidence, and changed weights alone do not establish an unjustified
change. The original comparison was held out from the 2025 fit, but it later
informed promotion and is therefore development/reference evidence for the
November generation, not untouched prospective validation of that decision.

There is contrary recent evidence:

| Same-field settled cohort | Races | Old T1 wins | New T1 wins | Old Top2 coverage | New Top2 coverage | Old log loss | New log loss |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Old archive eligible for this audit's settlement comparison | 108 | 34 | 28 | 53 | 51 | 1.68499 | 1.68600 |
| Generation development | 61 | 18 | 18 | 32 | 30 | 1.73790 | 1.72975 |
| Current generation captures | 13 | 5 | 2 | 7 | 6 | 1.58208 | 1.63800 |

Current 19 fields include only 13 complete, single-winner, all-settled starter
fields eligible for the quality table. Unsettled/NR/void/incomplete outcome
fields are excluded as whole fields; they remain valid for frozen ranking
attribution. Archive quality coverage is likewise smaller than ranking coverage.

Keeping new numeric coefficients but restoring old comments yields current
T1 winners 4/13 and log loss 1.59961. On the 61 development races that hybrid
has T1 winners 17 and log loss 1.73432, worse than the complete new model's
18 and 1.72975. Thus even these descriptive block comparisons are mixed.
No hybrid is recommended or activated.

The original prospective protocol also required separate review for better
prospective log loss, calibration, stability, coverage and sensitive subgroups
before replacement. The broader retrospective evidence does not certify that
every prospective promotion criterion was fulfilled. This audit does not claim
that it does. The current 13 eligible races are too few to establish durable
inferiority, and no uncertainty-adjusted superiority claim is made either way.
Neither proof of explicit user approval nor a fresh comment-specific validation
can be reconstructed from the available documents. Those limitations do not
amount to absence of a documented model-quality reason for the joint refit.

On the supplied conditional rule, retain Chase V2. The comment balance changed
materially and contributes to the observed problem, but the change was part of
an explicit Chase-only refit supported by broader quality evidence. Continued
poor prospective performance could justify a different decision; this audit
has not assumed that future outcome.

## Evidence and validation

- `data/research/chase-shadow-v1-frozen.json`: frozen protocol and parameters.
- `scripts/evaluate-chase-shadow-v1.ts`: candidate fit and selection procedure.
- `scripts/report-chase-shadow-v1.py`: original modelling explanation and limits.
- `docs/chase-shadow-prospective.md`: prospective replacement review criteria.
- `docs/tissue-generation-2026-11.md`: promotion rationale and known trade-offs.
- `data/research/chase-comment-balance-audit-2026-11-06.json`: source hashes,
  all comment coefficient pairs, full cohort counts, hybrid metrics and demotions.
- `scripts/audit-chase-comment-balance.py`: standard-library, read-only replay.

Reproduce with `python3 scripts/audit-chase-comment-balance.py`. Maximum stored
probability replay errors are 7.8e-16 in the archive, 2.3e-16 in development and
1.7e-16 in current captures. Production artifact loaders passed integrity checks.
No database connection, scrape, sync, result refresh or coefficient fitting ran.
All pre-existing working-tree changes were preserved. No application build was
needed for this report and isolated audit script.
