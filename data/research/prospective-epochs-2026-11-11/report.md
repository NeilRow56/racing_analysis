# Prospective collection restored — Option B only

All three new collection epochs are **active** from **2026-11-11T16:39:41.798Z** (UTC; also London time on 11 November). Activation created three empty, separate ledgers. Each has zero observations and a null first-capture timestamp. **Zero historical backfill.** No production capture, settlement, ingestion, database operation, model fitting or cache rebuild was run by this task.

| New collection epoch | Activation boundary | Ledger |
| --- | --- | --- |
| `TISSUE_POSITIVE_NEUTRAL_COLLECTION_V2_2026_11_11` | `2026-11-11T16:39:41.798Z` | `data/research/prospective-epochs-2026-11-11/positive-neutral-v2.json` |
| `HURDLE_V3_SHADOW_COLLECTION_V2_2026_11_11` | `2026-11-11T16:39:41.798Z` | `data/research/prospective-epochs-2026-11-11/hurdle-v3-shadow-v2.json` |
| `HURDLE_V3_MARKET_EDGE_COLLECTION_V2_2026_11_11` | `2026-11-11T16:39:41.798Z` | `data/research/prospective-epochs-2026-11-11/hurdle-v3-market-edge-v2.json` |

`activation.json` is the shared immutable activation manifest. It records each epoch ID/path, the aligned Shadow reference for Market Edge, model identities/checksums, fixed rules, activation boundary, original evidence hashes and complete dependency edges with **141 source/artifact hashes**. `activation-receipt.json` records activation; `activation-report.json` records the post-activation source check and separated results.

Collection semantics are `production_capture_dependencies_2026_11_11_v2`. Settlement is separately recorded as `canonical_settlement_v3`. The existing V1 payload schemas describe the preserved research methodology; the explicit V2 **collection epoch IDs and separate paths** distinguish the new collection provenance. The ledger's `epoch` field continues to mean first accepted capture time, not the activation boundary or a model promotion.

## Active and retained monitors

- **Positive/Neutral V2 collection: active.** The four frozen production models, T1/T2 eligibility, badge tolerance, edge/price bands, complete-market normalization and first eligible capture behavior are unchanged. Only fresh books accepted by the same production invocation are supplied.
- **Hurdle V3 Shadow V2 collection: active.** The V3 challenger, production Hurdle V2, official/LED calculations and comparison rules are unchanged. No live selection or tissue strategy was changed.
- **Market Edge V2 collection: active**, paired exclusively to the aligned new Shadow epoch. Fresh observations are taken from the records appended inside that invocation's Shadow lock. Concurrent invocations cannot claim each other's additions. There is no replay path, independent capture command or retrospective repair of a missed pair.
- **Original V1 collection epochs: closed in the production workflow.** Their original pins are intentionally retained, including the original Positive/Neutral and Shadow mismatches. They were not resealed or reinterpreted as new captures.
- **Original outcomes remain routed as before.** Original Positive/Neutral uses identity-matched Tissue Generation records. Original Market Edge and Low Form use their original Shadow ledger. Shadow results-only/pending lookups now include both Shadow ledgers independently; collection source drift does not disable outcome-only settlement. An unreadable new ledger does not suppress the original lookup/settlement route.
- **Low Form fresh collection remains suspended.** No Low Form epoch was authorized here, so new Shadow records are not sent into the original Low Form ledger. Existing Low Form settlement lookups remain available.
- Early Turf's existing 2027 window and unrelated monitors were not changed.

Activation is fail-closed: frozen artifacts are checked, old ledgers are parsed, all source hashes and dependency edges are verified, empty ledgers are exclusively created, original evidence digests are rechecked, and only then is the activation manifest exclusively published. Partial preparation without that manifest cannot collect. Re-running activation refuses to reseal or overwrite an existing epoch.

## Dependencies and input semantics

The provenance graph follows local TypeScript imports transitively from the production workflow, collection and settlement entrypoints, collector wrappers and report. It includes Hurdle completion/status classifiers, the Hurdle V3 legacy starter adapter, AW history loaders, horse/participant metrics, rating helpers, generation features, model/scoring code, frozen model artifacts, package manifest, Bun lockfile and TypeScript configuration. Mutable database inputs are bounded and frozen into the existing capture structures; mutable outcome ledgers are not treated as source-code pins. Python ingestion was not changed or run.

The current dependency semantics are explicitly admitted only in these new epochs. A synthetic NR-status fixture demonstrates why old and new evidence must stay separate: production Hurdle completion changes from `[1,0,0.5,0]` to `[0,0,1,0]`; with the unchanged frozen weights its paired probabilities change from approximately `[0.412755,0.587245]` to `[0.5,0.5]`, with a ranking effect. The equivalent AW history fixture drops the NR row, and unchanged AW base scoring changes approximately `[0.506288,0.493712]` to `[0.5,0.5]`. These are controlled fixture effects, not historical recalculations or estimates of real-world performance. The Hurdle V3 feature adapter still uses its original legacy starter classification.

Source and activation checks run again under the ledger locks. The existing freshness, pre-off cutoff, current racing date, first-capture, duplicate and immutable-record guards remain in effect. Every future dependency drift blocks collection; it cannot update the pins automatically.

## Frozen model verification

All original frozen production, challenger and base model checksums verified without changes:

| Identity | Version | Frozen checksum |
| --- | --- | --- |
| TURF | `TURF_TISSUE_V4` | `e106fadd07263b1fcc4ece821a4bfcad645faeae873db026433a4902eabbe3fe` |
| AW | `AW_TISSUE_V3` | `c8f75faa0aeacc88ba76f100e7d154a872bc9b2ee31a5a42d18e611e3e64f9a5` |
| HURDLE | `HURDLE_TISSUE_V2` | `53defc50d717aba63c80c9f3c01c4df4360b709f6f4a21509a514179e23cce90` |
| CHASE | `CHASE_TISSUE_V2` | `be65702490403f6a287d11ecb19307a67b58ca975ee7bd9ece71b4e0d759aa81` |
| challenger | `HURDLE_TISSUE_V3_CHALLENGER` | `50f6e1842ca1cb0c4ed4c068a91adbc934755b7018c07f4e6f77e3b56fa80bf4` |
| awBase | `AW_TISSUE_V2` | `ba7d2ea42a87d4ce432288d57a02cee8528217fafa04efa37723446924bdab82` |
| jumpBase | `JUMP_TISSUE_V1` | `863b966423f05773083c3c208dd11cd49680df7a7414b855d613ee5c8ad9ebe4` |
| turfBase | `tissue_model_v3` | `2c1e6d071f00396d92e9e80f351b1ba273b8b3316b5a6b2e483818cd60002db4` |

## Reporting

The Research Value workspace now includes a collection-epoch table. It separates original and new records by epoch, programme, racing family, model version, T1/T2/research cohort and **recorded outcome settlement version**. Pending/unavailable, unversioned, V2 and V3 outcomes remain distinct. Shadow official, production-reference and LED comparisons are labelled separately. No combined old/new profitability total is emitted. Existing original monitor panels retain their original ledgers.

Run `bun run research:epochs:summary` for the same separated JSON report. `bun run research:epochs:activate` is exclusive initialization, not a replay or sync command; it now refuses because this activation already exists.

## Validation and preservation

- **157 tests passed, zero failed, across 15 files**: `final-tests.log`.
- Strict TypeScript passed: `typecheck.log`.
- Targeted ESLint passed on all 14 edited/new TypeScript/TSX files: `lint.log`.
- `git diff --check` passed: `diff-check.log`.
- All **57 pre-existing top-level research JSON files** remain byte-exact against this task's starting snapshot: `preservation-before.json` and `preservation-after.json`. This includes original ledgers, outcomes, model artifacts, manifests and pins. Existing prior remediation evidence was retained.
- Isolated tests activated and exercised the actual new collectors in a temporary workspace, leaving repository evidence unchanged. They cover exclusive activation, zero initial observations, current source graph completeness, tampered/missing pins, new boundaries, stale/post-off rejection, concurrent duplicate prevention, first capture, no retrospective Market Edge pairing, old/new routing, canonical V3 dead heat, immutable models and separately rendered epoch/version reports. Existing suites cover badge boundaries, all-family generation, Hurdle challenger Avatar probabilities, AW vectors/ranks, Low Form, source compatibility and production workflow behavior.
- Initial failures were obsolete workflow source-name assertions, a fixture property-order mismatch in the exact capture hash, a graph-test timeout and a JSX try/catch lint error. Those were corrected before activation; final logs above are clean.
- No Python files were edited; no Pyright check was required. No production build or database-backed workflow was run. Live operational captures are left to subsequent normal production invocations.

## Files changed by this task

- `package.json`: exclusive epoch activation and separated summary commands.
- `scripts/activate-prospective-epochs.ts`: dependency graph, frozen-model verification and exclusive fail-closed activation.
- `scripts/report-prospective-epochs.ts`: separated JSON report entrypoint.
- `src/lib/racing/prospective-epoch-config.ts`: explicit IDs, semantics and ledger paths.
- `src/lib/racing/prospective-epoch-integrity.ts`: strict activation manifest and complete source-pin validation.
- `src/lib/racing/prospective-epoch-collection.ts`: fresh collection, invocation-local Shadow pairing and separate new settlement route.
- `src/lib/racing/prospective-epoch-report.ts`: epoch/family/model/cohort/settlement grouping.
- `src/lib/racing/prospective-epochs.test.ts`: graph, preservation, input-effects and isolated end-to-end regressions.
- `src/lib/racing/tissue-generation-sync.ts`: production hook routing to the new epochs and retained Shadow results paths.
- `src/lib/racing/hurdle-v3-shadow-sync.ts`: independent old/new Shadow results and pending lookup routing.
- `src/lib/racing/tissue-positive-neutral.test.tsx`, `src/lib/racing/hurdle-v3-shadow.test.tsx`, `src/lib/racing/hurdle-v3-market-edge.test.tsx`: update workflow assertions for the new collection hooks and locked pairing.
- `src/app/racing/research/forward-value/prospective-epoch-monitor.tsx`: separate epoch status and results display.
- `src/app/racing/research/forward-value/forward-value-page.tsx`: render that monitor in the active research section.
- Files in this directory: new ledgers, activation/provenance, preservation evidence, verification logs and this report.

Pre-existing unrelated working-tree changes were preserved. No old record, pin, frozen rule, model or research outcome was rewritten by this task.

## Remaining Settlement V3 limitations

Option B resolves the prospective collection blockers for these three new epochs. It does not approve retroactive source-pin substitution, rewrite original outcomes, establish missing historical lineage, or provide a global Settlement V3 sign-off for unrelated research. The original recovery/remediation reports remain applicable to historical evidence. The previously documented Jump 2026 unresolved/missing-minute issues remain outside scope; no Jump cache rebuild or historical backfill was performed.
