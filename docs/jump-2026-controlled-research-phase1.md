# Jump 2026 controlled exploratory access — phase 1

Reconstructed exploratory evidence — historical publication-time provenance incomplete.

Implemented on 11 November 2026. The isolated candidate remains inactive. Research Filters readers, results, rules and source registration are unchanged. This layer opens no database connection and writes no candidate, historical source, frozen research, model, prospective artifact or cache. It provides explicit read-only analysis through `readIsolatedJumpCandidate()`; no application page imports it.

## Files added and use

- `src/lib/racing/jump-candidate-eligibility.ts`: feature eligibility, field integrity, ranks, canonical V3 settlement and reusable coverage.
- `src/lib/racing/jump-candidate-reader.ts`: isolated reader, immutable results, pinned audit evidence, identity checks and independent full-result roster validation.
- `src/lib/racing/jump-candidate-eligibility.test.ts`: synthetic regression tests for eligibility, history, ranks, field counts, market completeness and settlement.
- `src/lib/racing/jump-candidate-reader.test.ts`: real candidate reconciliation, report parity and byte preservation tests.
- `scripts/report-jump-candidate-eligibility.ts`: explicit read-only reporting command.
- `docs/jump-2026-controlled-research-coverage.json`: full machine-readable coverage, overlapping exclusions, history depths, SP-band winners and evidence hashes.
- This report.

Run `bun run scripts/report-jump-candidate-eligibility.ts` to print the report. To inspect observations, call `const candidate = await readIsolatedJumpCandidate(); const result = candidate.analyze("bestSpeedLast3");`. Compute any selection from `result.races` **after** this full-population analysis. Read `rank.wholeFieldRank` only for verified rank criteria. `rank.diagnosticRank` is explicitly partial and must not satisfy a race-leading criterion. `normalizedSPProbability` is null on every runner in an invalid market field. No market A/E is supplied for such fields. No strategy selections, returns comparison, fitting or optimisation were run.

## Evidence and eligibility definitions

The original candidate report, exclusion summary, validator, provenance, sidecar, Research Filters rank/cache logic and Settlement V3 were reviewed. No separate file explicitly labelled “Option C” was present. The supplied brief's feature-specific rules were applied, and its 13,737 broad-context-only exclusions reproduce exactly. No sidecar flag or original evidence was rewritten.

The reader pins SHA-256 identities for the original provenance, prebuild, validation and exclusion records, the sidecar, database identity snapshots, and all three candidate cache files. It rejects modified/missing/incompatible candidate evidence, duplicate or mismatched identities, outcome discrepancies and published coverage mismatches. It deliberately bypasses the general cache loader's database-backed evidence resolver. Raw full-result payloads are checked anew and hashed on each read. Their digest is retained in the coverage report; per-race proof paths and hashes are exposed by the reader. Missing, conflicting or unverifiable field evidence withholds ranks/benchmarks rather than supplying inferred competitors.

Four dimensions stay separate:

1. **Historical outcome/SP analysis:** a source-backed canonical V3 settled outcome with valid decimal SP. This population does not require rating fields. Final SP is labelled retrospective settlement evidence and is never exposed as a selection feature.
2. **Strict rating observation:** exactly the original sidecar's `strictExploratoryUsable` definition: V3 settlement, all three finite Best L3 fields and the conservative dependency screen. This remains 10,661 observations.
3. **Feature-specific eligibility:** the requested finite audited value and its required evidence. Speed, Performance and Today's Rating support latest, previous, Best L3, Average L3 and Best L5. They retain **all** definite untimed, uncertain, hidden L3, L3-context and wider-context exclusions. A recorded rating history is required. They do not require either of the other rating families or a finite Best L3 when evaluating latest/previous/L5. This does not reclassify those additional observations as strictly screened Best L3 observations.
4. **Excluded/unverified:** a missing requested value, missing source evidence or any applicable dependency reason prevents feature use. Original sidecar IDs/counts remain visible alongside explicit derived exclusion reasons. Outcome/SP eligibility can survive a rating exclusion.

Official Rating uses the recorded target value and source evidence, without importing unrelated rating-history dependencies. Recorded prior-run counts and days since last run retain definite, uncertain and hidden-history exclusions; rating-context exclusions do not apply to these non-rating metrics. A missing current-race winning time alone does not invalidate an earlier feature or a valid canonical result.

Eligibility is independent of settlement, so eligible raw observations can include non-runners/void records. Use `eligibleSettledObservations` for historical return analysis. All ranks exclude genuine NRs, voids and unresolved outcomes. Unsupported fields/model/tissue features throw rather than acquire inferred eligibility. No extra subclassification or original-declaration filter is certified.

## Reconciliation and coverage

The reader asserts all of these published audit totals: **32,901 runners, 3,353 races, 29,856 V3 settlements, 25,251 reference-eligible observations, 10,661 strict observations, 14,590 reference dependency exclusions, and 13,737 excluded solely by the broad context screen**. All 13,737 remain excluded for rating features because per-feature historical dependencies have not been verified. The original 3,036 genuine NRs and nine void observations remain excluded from settlement; there are no unresolved candidate outcomes.

Coverage below is per feature. Each grouped rating row applies separately to Speed, Performance and Today's Rating, which have identical counts in this candidate. “Eligible raw” includes observations without settlement; “eligible settled” is the usable historical return population for that feature. Whole-field coverage counts **all** independently verified starters with eligible comparison values, computed before selection filtering.

| Feature (each rating family separately) | Eligible raw | Eligible settled | Complete comparison races | Partial diagnostic races | Verified rank observations |
| --- | ---: | ---: | ---: | ---: | ---: |
| Latest rating | 12,765 | 11,401 | 231 | 1,929 | 2,127 |
| Previous rating | 10,208 | 9,110 | 115 | 1,806 | 965 |
| Best L3 rating | 11,922 | 10,661 | 114 | 2,024 | 856 |
| Average L3 rating | 11,922 | 10,661 | 114 | 2,024 | 856 |
| Best L5 rating | 12,533 | 11,194 | 195 | 1,956 | 1,718 |
| Official Rating | 24,500 | 22,174 | 2,283 | 788 | 20,010 |
| Recorded prior runs | 31,911 | 28,959 | 2,623 | 729 | 23,323 |
| Days since last run | 30,101 | 27,313 | 2,035 | 1,311 | 17,292 |

For Best L3, 1,215 races have no available rank; 114 complete + 2,024 partial + 1,215 unavailable = 3,353. Partial diagnostic rank one never fills `wholeFieldRank`. Competition ties are unchanged: equal values rank 1,1,3, with runner ID providing deterministic ordering. Missing competitors' values or classifications are never fabricated.

The sidecar records builder last-three depths of **0: 1,810; 1: 1,859; 2: 1,987; 3: 27,245**. The JSON report also includes the full recorded prior-run depth distribution and all feature exclusion counts. These are recorded builder depths, not certification of complete real-world histories or three independently valid ratings. Short histories stay explicit; no missing run is replaced by an older one. Per-feature contributing-rating depth beyond the saved sidecar is not certified.

## Starter counts, markets and settlement

A stored roster count and observed outcome classifications are reported independently of the cached `actualRunnerCount`. A verified starter count additionally requires an identity-matching final full-result payload, exact full roster, individually classified starters/NRs and an independent `race_summary.ride_count` matching the starters. Cached actual counts do not participate in that proof. Original declared counts remain null in **all 3,353 races** because pre-race declaration provenance is missing.

The original prebuild record identifies eleven full results saved under racecard filenames. Only those exact hash-verified recovered bytes can supply the corresponding field proof; arbitrary racecard files cannot.

**3,351 races / 29,841 starter observations** qualify for normalized SP market benchmarks. Probabilities use all verified starters' inverse decimal SP, normalized by their whole-field sum before any feature or selection filtering. A rating-ineligible starter still participates in a valid market benchmark. Any absent/invalid starter SP or incomplete independent field invalidates the entire benchmark. The layer supplies no market A/E for an incomplete field.

Two races are withheld from field verification:

- Uttoxeter 929549, 24 July: `RACEVOID`; nine void records have no settlement stake or starter benchmark.
- Worcester 933814, 19 August: the raw source lists 15 canonical starter outcomes, including a runner with `WITHDRAWN` status but `RefusedToRace` casualty evidence, whereas its summary `ride_count` is 14. Casualty evidence retains the canonical refusal loss; it is not silently converted to a genuine NR to make the count match. All 15 settled observations remain available for outcome/SP analysis, while whole-field ranks and market probabilities are withheld.

Settlement calls the unchanged `settleSelection` with **no price cap**. Genuine wins/losses, 4,784 non-finisher losses, six dead-heat winner records, genuine NRs and voids retain V3 semantics. Gross dead-heat return is decimal SP divided by the recorded divisor. All **118 settled winners above SP 21** remain in the outcome/SP population, including Crokes Cross at SP 301 with gross return £301 per £1. The strict Best L3 subset retains 36 of those 118; 82 remain explicitly excluded from that rating subset.

| Decimal SP band | All records | Settled observations | Settled winners | Strict Best L3 retained winners | Excluded winners from strict Best L3 |
| --- | ---: | ---: | ---: | ---: | ---: |
| (1,3] | 2,779 | 2,630 | 1,094 | 316 | 778 |
| (3,6] | 6,928 | 6,401 | 1,256 | 370 | 886 |
| (6,11] | 7,201 | 6,486 | 612 | 218 | 394 |
| (11,21] | 6,420 | 5,634 | 275 | 121 | 154 |
| >21 | 9,518 | 8,705 | 118 | 36 | 82 |
| Unknown/invalid | 55 | 0 | 0 | 0 | 0 |

The JSON report contains retained/excluded winners for every supported requested feature. Winner counts are winner records, including dead heats.

## Validation and recommendation

Validation covers feature-specific requirements, missing/uncertain histories, hidden untimed priors, retained broad context exclusions, complete versus partial ranks, false rank-one promotion, genuine NRs and refusal classification, independent starter counts, complete market normalization, V3 settlement, dead heats and uncapped long-priced winners. Candidate integration checks reproduce published counts and SP bands, assert every valid market sums to one, prevent whole-field ranks on partial races, compare every feature against the report, and hash all existing default cache files plus the pinned candidate/audit inputs before and after access. Every used raw field-proof payload is rehashed after analysis.

Final validation: **133 tests passed, zero failed**, across seven suites (56.08 seconds). The suites were `jump-candidate-eligibility`, `jump-candidate-reader`, `settlement-v3`, `research-rule`, `research-holdout`, `backtest-cache` and `research-or-relative-metrics`, run with `bun test --timeout 120000` and their explicit paths. Full-project `bun run typecheck` passed. Targeted `bun run lint` passed for both new modules, both test files and the report script. `git diff --check` and whitespace checks on the seven new files passed. No Python file was changed. No production build was needed for this isolated library/CLI change; no application integration or live page was changed.

**Recommendation: ready for separately authorised, qualified exploratory Research Filters integration through this layer.** The raw cache must not be activated directly. Integration must retain the warning, feature-specific exclusions, settlement-only SP distinction, field validation and separate diagnostic ranks. Original publication-time lineage and unseen historical completeness remain unverified; the reconstructed candidate receives no holdout certification. The broad-context rating exclusions cannot be released without additional dependency evidence. Original-declaration filters remain unavailable, and two fields lack complete starter verification. No Research Filters integration or activation has been performed.
