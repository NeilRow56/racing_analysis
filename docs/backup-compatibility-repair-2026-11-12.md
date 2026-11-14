# Backup compatibility repair — 12 November 2026

The weekly backup repair passes isolated archive validation. **No fresh live backup was run. Prices-only activation remains blocked until a fresh live backup completes and verifies.** No database connection, migration, price refresh, collection, settlement, backfill, training, dependency upgrade, commit or push was performed by this task.

## A–B. Failure and original source verification

`/tmp/racing-prices-activation-backup.log` failed on the original Hurdle Shadow ledger's `src/lib/racing/hurdle-v3-challenger-features.ts` dependency:

- Original recorded SHA-256: `acfc91b8ccab7991868ef1fa3128c5fbd5320b04936c34bd65ddc039ab46b86f`.
- Current SHA-256: `d8285c3f117813b41b191ba06e08f10dfabe99ccffc66884c5a46d074814a858`.
- Independently recovered original: Git commit `f6ef593db20e3ff2367c52dbc4626493e3bdddee`, at the original source path. The copy at `77167d7287dc8280df6a8411aa3845e85369d348` and the remediation `original-sources/src/lib/racing/hurdle-v3-challenger-features.ts.txt` also match the recorded hash exactly.

The adapter diff changes only `isVoidBetResultStatus`/`settledWinValue` to their preserved legacy names, `legacyVoidBetResultStatus`/`legacyRecordedWinValue`. The prior remediation and its compatibility tests establish the unchanged legacy classifications. This adapter change is legitimate compatibility evolution, with no feature/weight edit. **The complete dependency evolution is not settlement-only:** Backtest has semantic settlement and starter/history changes; the new production collection epochs explicitly admit the current dependencies. Tissue Generation's forward source changed settlement dispatch/versioning. Shadow sync now routes pending lookups and results separately to both collection epochs. Market Edge and Early Turf also have the previously reviewed compatibility guard/input edits. The exact current bytes are recorded in Git `6f02bea3e1090eb89004b6a4eee50583396dd25e`; no unexplained source edit was admitted.

The old backup treated every ledger pin as a requirement to match today's implementation. That incorrectly applied an active-collection rule to closed historical evidence. Relaxing the hash comparison alone would discard reproducibility. Instead, `scripts/backup-historical-dependencies.ts` admits only eight reviewed owner/path/original/current combinations, covering seven distinct original sources. Every original is recovered from a fixed Git revision and SHA-256 checked against its ledger pin before any dump. Missing originals, altered original pins and unknown current drift fail closed. The catalog never participates in collection permissions.

## C–D. Corrected inventory and integrity design

All paths below are relative to the repository. The exact three omitted active ledgers are:

| Active ledger | Collection identity | Model identity |
| --- | --- | --- |
| `data/research/prospective-epochs-2026-11-11/positive-neutral-v2.json` | `TISSUE_POSITIVE_NEUTRAL_COLLECTION_V2_2026_11_11` | TURF_TISSUE_V4, AW_TISSUE_V3, HURDLE_TISSUE_V2, CHASE_TISSUE_V2 |
| `data/research/prospective-epochs-2026-11-11/hurdle-v3-shadow-v2.json` | `HURDLE_V3_SHADOW_COLLECTION_V2_2026_11_11` | HURDLE_TISSUE_V2 versus HURDLE_TISSUE_V3_CHALLENGER |
| `data/research/prospective-epochs-2026-11-11/hurdle-v3-market-edge-v2.json` | `HURDLE_V3_MARKET_EDGE_COLLECTION_V2_2026_11_11` | HURDLE_TISSUE_V3_CHALLENGER, aligned to the V2 Shadow collection |

They share `data/research/prospective-epochs-2026-11-11/activation.json`, activated at `2026-11-11T16:39:41.798Z`; collection semantics are `production_capture_dependencies_2026_11_11_v2`, settlement `canonical_settlement_v3`. The ledger payload schema's V1 name is retained; the separate path and manifest collection ID identify V2. No records are merged or counted across epochs.

The inventory now has **36 named ledgers**, plus **122 existing Chase speed snapshot JSON files**, and **23 artifacts**. Besides the three V2 ledgers, it adds the previously omitted `chase-shadow-prospective-v1.json` and `or-best-l3-speed-forward-v1.json`. Five added provenance artifacts are the epoch directory's `activation.json`, `activation-receipt.json`, `activation-report.json`, `preservation-before.json` and `preservation-after.json`. Existing V1 ledgers, all 13 frozen model artifacts, calibration/configuration/development artifacts, captured bookmaker quote arrays, and canonical settlement records remain covered. Positive/Neutral reads canonical outcomes from the retained Tissue Generation ledger; Market Edge/Low Form read the matching retained Shadow ledger. Neither is given fabricated independent settlement records.

Archive version 4 separates:

1. **Historical evidence:** ledger pins remain unchanged. Matching current bytes serve as the original dependency where exact; reviewed differences additionally require verified original Git bytes under `historical/<sha256>/<original-source-path>`. Eight references share seven distinct payloads, without duplicate archive paths.
2. **Current collection:** the activation schema, transitive graph completeness, all 141 activation source/artifact hashes, individual V2 ledger pins, activation boundaries and original-evidence hashes are checked. The three additional metrics files pinned by individual ledgers are checked too. Active ledgers use their existing read-only schema/consistency validators, and their pin key sets must remain aligned with their original monitor. No historical substitution applies to an active ledger or activation manifest.

`recovery/` preserves the current source bytes independently. Both sets of bytes are checked again from the extracted archive, without access to Git. All copies retain the existing concurrent-writer checks; a change during copying aborts publication. PostgreSQL custom dump inclusion, `pg_restore --list`, archive membership, extracted payload hashes, atomic publication and offsite handling remain intact. Existing v2/v3 archives retain their original inventories and verification semantics.

Scope limitation retained from the previous backup: historical **model-development artifact** `codeHashes`/input references are informational, rather than collection authorisation. Their original reference hashes and current inventoried artifacts are retained; this does not claim complete reproduction of all past model development inputs. In particular, the development manifest's older Tissue Generation sync reference is not an original Hurdle ledger dependency. The repair does not turn such informational references into an exception for ledger or active collection pins. Full Git/raw training history remains a separate archival responsibility.

## E. Twelve-ledger reconciliation

[Machine-readable reconciliation](backup-ledger-reconciliation-2026-11-12.json) records every original/current hash, counts, new capture times and classification. The older `prospective-epochs-2026-11-11/preservation-before.json` is unchanged. Each original byte stream was recovered from Git, an independently hash-matching preserved original, or by reversing only appended observations/new settlement fields **in memory**. Every resulting byte stream matches that untouched snapshot's SHA-256. No ledger was restored or rewritten.

All names in this table are under `data/research/` and end in `.json`:

| Ledger | Before → current observations/books | New observations | Updates to existing records |
| --- | ---: | ---: | --- |
| aw-rating-forward-v1 | 448 → 448 | 0 | Outcome/result fields in 7 races |
| chase-jump-tissue-v1-value-forward-v1 | 152 → 152 | 0 | 41 new runner outcomes in 8 books |
| hurdle-jump-tissue-v1-value-forward-v1 | 244 → 244 | 0 | 73 new runner outcomes in 10 books |
| jump-g4-forward-v1 | 142 → 144 | 2 | 3 new outcomes and settlement timestamps |
| context-weight-shadow-v1 | 7 → 7 | 0 | 47 new runner outcomes in 3 observations |
| jump-rating-forward-v1 | 769 → 790 | 21 | Outcome/result fields in 30 existing races |
| model-disagreement-forward-v1 | 1,345 → 1,345 | 0 | 498 outcomes, final SPs and settlement timestamps |
| aw-tissue-v2-value-forward-v1 | 200 → 200 | 0 | 91 new runner outcomes in 7 books |
| forward-value-v1 | 1,705 → 1,725 | 20 | 37 previously pending settlements; two NR exclusion reasons |
| tissue-generation-forward-2026-11 | 205 → 225 | 20 | 47 new runner outcomes in 3 books |
| or-best-l3-speed-forward-v1 | 487 → 487 | 0 | 3 new outcomes |
| jump-tissue-forward-v1 | 573 → 573 | 0 | 111 runner outcomes in 11 races, plus result/selected-price P/L fields |

All added observations have pre-off capture timestamps. Existing frozen price quotes, probabilities, features, inputs, identities, capture times, rules and model pins are unchanged. All previously recorded outcomes remain exact. Forward Value's 37 V2-to-V3 settlement-version assignments concern previously pending records; no recorded settlement was relabelled. Its two new exclusions are `non_runner`, consistent with the existing settlement writer.

**Disposition:** the differences fit authorised collection/outcome-update operations as implemented by the existing workflows; no unexpected frozen modification was found. Files alone do not establish the executing process/operator or independently prove external operational authorisation. This audit establishes structural and byte-level preservation, not unavailable execution lineage. Mixed recorded settlement versions remain separate evidence.

## F. Validation and preservation

- `bun test --timeout 60000 scripts/backup-weekly.test.ts`: **50 passed**. Disposable paths only; PostgreSQL commands are injected stubs and real tar creation/extraction is exercised. A full copied-evidence fixture verifies historical sources, all active V2 ledgers, frozen artifact hashes, original quotes/outcomes/manifests and dump inclusion. It tests missing V2 ledgers, missing historical source payloads, corrupted historical bytes, unknown current dependency changes and unavailable Git originals. Existing tests cover missing/corrupt artifacts/dump, source mutation during copying, manifest tampering, missing archive membership and atomic publication.
- `bun run typecheck`: PASS. Targeted ESLint on all five edited/new TypeScript files: PASS. `git diff --check`: PASS. No Python edits; no Python typecheck required. No Next.js application code changed and no production build/database-backed workflow was invoked.
- Existing extracted November 10 v3 archive: PASS with the updated verifier, including its original database dump. This was verification of an already extracted archive, not a fresh backup or restore.
- Existing guard/monitor suites: **42 passed, 1 failed**. The failure is `capture-pin-compatibility.test.ts`'s older whole-research preservation assertion, first reporting `aw-rating-forward-v1.json`; it does not incorporate subsequent operational append/settlement activity.
- Existing prospective epoch suite: **4 passed, 1 failed**. The failure is its old byte-exact preservation assertion against the older snapshot. This audit reconciles the twelve differences; neither test nor original snapshot was altered to hide the failure.
- Every one of **449 pre-existing research files** remained byte-identical to this repair's own starting state. Zero files disappeared; zero new research files were created. The pre-existing unrelated working-tree changes were preserved.

## G–H. Live backup and activation

The compatibility failure is repaired and the current files pass read-only inventory/dependency preflight. A fresh live weekly backup can now be attempted under the existing PostgreSQL/tool/destination prerequisites and while research writers are idle. Original Git objects must remain available until the archive is built. Real database connectivity and a newly created real database dump were deliberately not tested.

**Prices-only activation is still blocked:** the user prohibited a live backup in this task, so no fresh verified live backup exists from this repair. The older preservation tests remain red as disclosed above; their evidence audit is supplied here without changing their contracts. Any activation decision requiring operator-level lineage must also acknowledge that the historical writer identity is unavailable. The previously documented live database/schema/migration-journal checks and separately authorised eligibility dry-run remain outstanding in `today-prices-refresh.md`. No permission to execute those actions is inferred from this repair.
