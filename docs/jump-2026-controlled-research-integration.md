# Jump 2026 controlled exploratory Research Filters integration

Implemented on 11 November 2026 at `/racing/research`.

**Reconstructed exploratory evidence. Historical publication-time provenance is incomplete. Results are not an independent holdout.**

## Source selection and isolation

The model-performance workspace now offers **Jump 2026 — Reconstructed Exploratory** alongside **Existing historical caches**. Existing historical caches remain selected by default. Only the exact query parameter `cmpSource=jump-2026-reconstructed` opts into the controlled source. Family/year parameters, stored rules, default 2026 periods and unknown source identifiers cannot activate it. The source control submits a GET request and persists only in the URL.

Direct route: `/racing/research?cmpSource=jump-2026-reconstructed`.

Candidate mode branches before the standard model-source reader. It calls only the Phase 1 controlled candidate reader for 2026; it does not read or relax the incompatible legacy Jump 2026 cache. The existing compatibility guard and default historical source loader are unchanged. Candidate verification failures show an unavailable-source message with no fallback results.

The page also skips the existing advanced-rule evaluator and saved-rule loader in candidate mode. Advanced Filters and save/freeze/holdout actions are absent. Candidate controls use separate `jump*` parameters; they are never serialized into a saved rule. All saved-rule creation is disabled in candidate mode, including rank-based creation from incomplete fields. Returning the source selector to existing historical caches restores the existing workspace and its original actions. No saved rule is activated, migrated or changed.

The controlled reader now exposes the source identifier and pinned manifest build date (`2026-11-11T16:56:04.829Z`). Phase 1 observations also expose the audited date, course and horse name for scoped analysis and the results table. These additions do not change eligibility, ranking, settlement, evidence pins or coverage. The original Phase 1 report and coverage JSON remain unchanged.

## Supported analysis and controls

- Historical outcome/SP analysis: source-backed canonical V3 settlement and valid final decimal SP, without a rating requirement. This is the candidate source's initial analysis; there is no default rank threshold.
- Latest and previous Speed, Performance and Today's Rating.
- Best L3, Average L3 and Best L5 for all three rating families.
- The Phase 1 Official Rating, recorded prior-run count and days-since-last-run metrics.
- Dates within 1 January–14 October 2026, finite feature minimum/maximum, maximum verified whole-race rank, minimum verified lead over the best other starter, independently verified minimum/maximum actual starters, and retrospective final-SP diagnostic bands.

Each selected analysis displays its applicable eligibility definition. The Phase 1 feature-specific checks remain intact: missing requested ratings are excluded, unrelated rating families are not required, and all applicable definite untimed, uncertain, hidden-run and broad context restrictions remain. Missing values never become zero. Original sidecar reasons and evidence remain unchanged.

Invalid or incompatible parameters withhold results and explain the error. Outcome/SP analysis rejects rating/rank/lead criteria; users must clear those controls when changing analysis. Existing advanced-rule conditions are explicitly not applied to the controlled source.

Original declared field filters are disabled for every race. Starter controls use only Phase 1 independently verified starter counts; stored `actualRunnerCount` is never used. No handicap/subtype, tissue, calibrated probability, bookmaker-price or advanced-rule eligibility is inferred.

## Coverage and result reporting

Candidate coverage remains **32,901 stored runners / 3,353 races**, with **29,856 historical SP settlements**, **3,036 genuine NRs**, nine void records, and **10,661 original strict rating observations**. The 13,737 observations excluded solely by the broad context precaution remain excluded for rating analysis.

| Requested feature (each of Speed, Performance and Today's Rating separately) | Eligible settled observations | Complete eligible comparison races | Partial diagnostic races |
| --- | ---: | ---: | ---: |
| Latest | 11,401 | 231 | 1,929 |
| Previous | 9,110 | 115 | 1,806 |
| Best L3 | 10,661 | 114 | 2,024 |
| Average L3 | 10,661 | 114 | 2,024 |
| Best L5 | 11,194 | 195 | 1,956 |

Official Rating has 22,174 eligible settled observations; recorded prior-run count has 28,959, and days since last run has 27,313. These populations remain distinct from the original strict Best L3 screen.

Every result reports stored runner/race coverage for the selected dates, valid settlements and settlement exclusions, usable observations before criteria, feature exclusions, unavailable rank/lead and starter-count exclusions, remaining criteria exclusions, and selected runner/race coverage. Expandable sections show overlapping feature and settlement exclusion reasons. The selected observation table shows up to 100 runners with feature values, separately labelled verified/diagnostic ranks, verified leads, retrospective SP, gross return and normalized SP benchmark availability.

## Ranking and market integrity

All full-race ranks and market probabilities come from Phase 1 before any date-scoped runner selection, feature threshold, rank condition, starter condition or SP-band diagnostic. The adapter never calls the legacy rank/model observation builder for candidate rows and never re-ranks a selection subset.

Whole-race rank and lead conditions require a validated complete eligible comparison field. Competition ties remain 1,1,3. Excluded or missing competitors never promote remaining runners into verified race-leading selections. Partial rank values are displayed only in the **Partial diagnostic rank** column; the verified column says unavailable. Leads use the best other starter's eligible value from the complete field, before criteria filtering. One-starter fields cannot supply a lead over another starter.

**3,351 complete starter fields / 29,841 observations** have valid SP benchmarks. Rating-ineligible starters still participate in full-market normalization. The void Uttoxeter race and the Worcester starter-count discrepancy described in Phase 1 remain withheld. Worcester's 15 canonical settled outcomes remain in outcome/SP analysis, without rank or market certification.

Summary A/E is explicitly labelled as a **valid-market subset** metric. Both expected wins and actual dead-heat winner shares use exactly the selected runners with independently verified complete starter markets. An incomplete field supplies no probabilities or A/E contributions; missing benchmark observations are counted. With no valid market coverage, expected wins and A/E display **Unavailable**.

Settlement uses the existing Phase 1 canonical V3 settlements: genuine losses, 4,784 non-finisher losses, six dead-heat winner records and uncapped legitimate winner returns are retained. Outcome/SP analysis retains all 118 winners above SP 21, including the £301 gross return at decimal SP 301. Final SP is labelled retrospective settlement/diagnostic evidence throughout; no captured bookmaker quote is inferred and no pre-race price rule is created.

## Compatible 2025 comparison

An explicit optional checkbox enables a side-by-side comparison with 2025 Jump development evidence. It is available only for outcome/SP analysis, with no rating, rank, lead or starter-count constraints. The comparison uses the same calendar date window, retrospective SP band and uncapped V3 settlement definition. Rating comparisons are withheld because no matching 2025 dependency-eligibility sidecar exists. Starter filters are incompatible because equivalent independent field proof is absent.

Only the existing compatible **2025** Jump cache reader is called. 2025 outcomes additionally require explicit terminal source-stage evidence; absent/non-terminal evidence stays excluded. The table reports stored runners/races, usable settlements, source/settlement exclusions, SP-band exclusions, selected runners/races, wins and returns for each year. Population differences are stated explicitly. 2025 normalized market comparisons remain unavailable.

The local HTTP check for 1 January–14 October, all valid SP, showed:

| Evidence | Stored runners / races | Usable settled observations | Source/settlement exclusions |
| --- | ---: | ---: | ---: |
| 2025 Jump development | 33,529 / 3,399 | 30,133 | 3,396 |
| 2026 reconstructed exploratory | 32,901 / 3,353 | 29,856 | 3,045 |

These are descriptive source populations, not matched runners or independent validation samples. The 2025 read identified 135 records without verified terminal source evidence; they are excluded. Existing 2025 cache bytes and frozen reports are not rewritten.

## Files changed

Modified existing workspace/reader files:

- `src/app/racing/research/page.tsx`: explicit candidate-mode isolation from advanced/saved-rule reads and actions.
- `src/app/racing/research/model-performance-workspace.tsx`: optional source selector and early controlled-source branch.
- `src/lib/racing/jump-candidate-reader.ts`: pinned source identifier/build metadata.
- `src/lib/racing/jump-candidate-eligibility.ts`: observation date/course/horse metadata only.

Added:

- `src/app/racing/research/research-source-select.tsx`.
- `src/app/racing/research/jump-exploratory-workspace.tsx`.
- `src/app/racing/research/jump-exploratory-workspace.test.tsx`.
- `src/lib/racing/jump-exploratory-research.ts`.
- `src/lib/racing/jump-exploratory-research.test.ts`.
- `src/lib/racing/jump-exploratory-integration.test.ts`.
- This report.

The working tree already contained extensive unrelated work before this integration. Those changes were retained. No database, historical/raw source, research cache, saved/frozen evidence, model, prospective collection, live selection or monitor file was written by this task. No dependency or Python change was required.

## Validation and remaining limitations

**218 tests passed, zero failed**, across 12 suites in 78 seconds. Tests cover explicit opt-in/default preservation, frozen-rule identity, feature eligibility, provenance rendering, missing inputs, complete versus partial ranks and verified leads, false rank-one promotion, independent starter counts, full-market normalization, missing benchmarks, V3 settlement, uncapped SP-301 winners, compatible/incompatible 2025 definitions and real candidate coverage. The Phase 1 preservation regression hashes all existing default cache files and pinned candidate/audit inputs before and after analysis, and rechecks every used raw field-proof payload; it passed.

Full-project strict TypeScript and targeted ESLint passed. Diff/whitespace checks passed. Local Next.js HTTP checks returned 200 and verified rendered output for outcome/SP mode, Best L3 mode, incompatible 2025 rating comparison, compatible 2025 outcome/SP comparison, and default historical-source preservation. Browser preview was unavailable in this environment, so no visual screenshot QA was performed. No production build was run against the user's active local development server.

Original publication-time provenance and unseen historical completeness remain unverified. The broader context rating restrictions remain in force. Original declarations and the two unverified starter fields remain unavailable. 2025 comparisons are limited to compatible retrospective outcome/SP definitions. This integration provides controlled exploratory access only; it grants no holdout status and makes no claim of a repeatable profitable strategy.
