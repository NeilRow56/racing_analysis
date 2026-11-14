# Today's prices-only refresh

Implementation and isolated validation only. No live migration, refresh, collection, settlement or backfill has been run. Obtain separate authorisation before applying the migration or executing either command against live data.

```sh
bun run scripts/refresh-today-prices.ts --dry-run
bun run scripts/refresh-today-prices.ts
```

The standalone Bun entry point invokes the existing Python prices-only script. It deliberately has no package.json script alias: package.json is pinned by the prospective collection manifest.

Both commands target the current Europe/London racing date; there is deliberately no historical date argument. Dry-run retrieves Sporting Life data with a read-only database session and reports eligibility, quote counts, skips/reasons and actual retrieval timestamps without storing anything. Normal mode also reports successful updates and duplicate skips. No normal import, `today:refresh`, research morning/late/live/after, capture or settlement workflow is invoked.

The isolated table declaration is in `src/db/current-prices-schema.ts`; the unpinned `drizzle.config.ts` includes both this file and the unchanged base schema. Display-only runner/meeting extension types live in `current-price-overlay.ts`; the pinned `todays-racing.ts` stays byte-exact. The runtime database module and its collection schema imports are unchanged.

The additive migration `drizzle/0009_mixed_morbius.sql` creates `race_current_prices`. It has not been applied to the live database. The Today page falls back to its original behaviour if this table has not yet been deployed.

Each race has one replaceable current-price overlay, with Sporting Life source/race identity, original import UUID, original fetched timestamp and payload fingerprint, actual retrieval timestamp, scheduled off-time, and price fingerprint. The isolated JSON payload contains the race date/status and every ride ID, horse ID, complete bookmaker array and availability flag. Original `source_imports` rows, their complete payloads and `fetched_at`, race/runner records, models and research ledgers are never updated by this operation. The current overlay is not an immutable price-history ledger.

Eligibility requires a stored card, exactly one matching source index race, matching race/date/off-time across index, detail and stored card, recognised pre-race status (`DORMANT`, `PRE_RACE`, `GOINGDOWN`, `GOINGBEHIND`, `ATTHEPOST`), future scheduled UTC off-time and today's London date. Complete ride and horse identity sets must match both the original card and canonical database records. Unknown runner status, missing arrays, invalid odds/providers, duplicate runners/providers, source results, stored results or actual off-time reject the race. Empty arrays are valid explicit unavailability; missing arrays are incomplete responses.

A session advisory lock rejects concurrent refresh commands before retrieval. Before each write, race, import, runner and horse rows are locked and re-read. Changed source import, identities, results, status or schedule reject the write. The final INSERT additionally checks the database clock for today's London date, a future off-time and retrieval age of at most five minutes. The race primary key, retrieval ordering and content fingerprint prevent duplicate writes while an identical overlay remains fresh. Identical prices can be retrieved again after expiry. Database errors abort the command; per-race validation failures are reported as skips.

The Today page reads overlays only after existing frozen capture/prediction work finishes. It validates original import identity/timestamp/fingerprint, full stored runner/horse identities, status, date, results, off-time and five-minute freshness. The overlay is attached as `currentBookmakerPrices`; original `bookmakerQuotes` and the shared market summariser remain unchanged. Only `TodayMarketOdds` selects the current array, reusing the existing Sporting Life quote parser and median/best-price calculation. The display adds “Current” and the London retrieval time, with a tooltip explaining this is display-only and not frozen morning evidence. Missing, stale or inapplicable overlays retain the original fallback behaviour. Explicitly unpriced overlays show no current quote.

Frozen Tissue probabilities/ranks, Value/Market captures and missing-market indicators never use this field. An unpriced morning capture remains unpriced even when the current display has odds. Hurdle V2, Chase V2, V3 Shadow, Positive/Neutral and Market Edge code and observations are unchanged.

Validation covers valid/unpriced cards; started, past-off, unknown status, date/race/ride/horse mismatch, duplicate/incomplete and invalid price data; stale/future retrieval and London midnight/DST date boundaries. Disposable PostgreSQL tests execute the actual migration and write SQL, confirm dry-run preservation, concurrent lock rejection, duplicate suppression and import-change rejection immediately before write, and compare canonical/import/frozen fixture data before and after. Reader integration tests verify valid display and rejection after import, horse identity and off-time changes. Rendering tests confirm current prices cannot populate missing frozen Value/Market ranks.

The original implementation was validated with 317 targeted Bun tests, eight Python policy/PostgreSQL tests and the separately opted-in SQL reader test. Its claim that unchanged pin values implied valid source integrity was incorrect: the three changed pinned files invalidated their recorded hashes. The compatibility repair and current checks are documented below. No source pins were amended.

Limitations: quotes expire after five minutes and the page reflects that on its next server render; already-open pages do not poll. Freshness records the completed HTTP retrieval, because bookmaker arrays do not provide a trustworthy independent provider observation time; it cannot detect an upstream stale cache. Runner identity or non-runner differences are rejected rather than reconciled. A separate status or import operation is required for those changes. No live result or price endpoint was contacted in validation. This has not been validated against live November 12 cards, and does not assert their current quote counts.

Feature files: `scripts/refresh-today-prices.ts`; `src/db/current-prices-schema.ts`; `drizzle.config.ts`; migration `0009_mixed_morbius.sql` and its Drizzle snapshot/journal; `scraper/scripts/refresh_today_prices.py`; `scraper/tests/test_today_prices.py`; `src/lib/racing/current-price-overlay.ts`; `src/lib/racing/current-price-overlay.test.tsx`; `src/app/racing/today/page.tsx`; `src/app/racing/today/tissue-cells.tsx`; this report. `package.json`, `src/db/schema.ts` and `src/lib/racing/todays-racing.ts` have been restored exactly to their existing pinned contents. Pre-existing research ledger changes were preserved.

To repeat integration validation, initialize a disposable PostgreSQL cluster at `/tmp/racing-price-test-pg`, UTF-8, listening only on its Unix socket at port 55439. The opt-in tests deliberately use this fixed disposable socket, not `DATABASE_URL`. The Python tests recreate its public schema; never point a production server at this socket.

```sh
PRICES_TEST_POSTGRES=1 scraper/.venv/bin/python -m unittest scraper/tests/test_today_prices.py -v
PRICES_TEST_POSTGRES=1 bun test src/lib/racing/current-price-overlay.test.tsx
```

Run these sequentially: the reader integration uses the fixture left by the Python suite. The database tests skip around the UTC/London midnight boundary; fixed-clock policy tests cover the boundary independently.


## Source-pin compatibility repair — 12 November 2026

A. Exact causes and recovery

- `package.json`: one added `today:prices-refresh` script. This changed no dependency versions or model calculations, but the complete file is pinned.
- `src/db/schema.ts`: an appended 14-line overlay table declaration. This extended schema exports consumed by the collection database module; existing table definitions and calculations were unchanged, but the complete module is pinned.
- `src/lib/racing/todays-racing.ts`: one optional `currentBookmakerPrices` type member. It changed no runtime model logic, but the complete module is pinned and used widely by collection.

For each file, `git show HEAD:<path>` was verified against its existing activation-manifest SHA-256 before restoring those exact bytes. All three now have no Git diff. Neither the existing 141-pin manifest nor its dependency graph, roots, models, epoch identity or original-evidence hashes were edited.

B. Repair files

The standalone CLI replaces the package alias without invoking any other workflow. The isolated schema module holds the same table definition, and the unpinned Drizzle config includes it so future schema generation retains the table. The isolated reader owns its optional display extension types, used only by the odds cell. The reader still runs after existing frozen capture/prediction work and does not replace the original bookmaker arrays. Tests now assert the actual existing 141 pins, exact reconstructed collection graph and all frozen model identities. An offline Python concurrency regression confirms a denied lock stops before source retrieval or writes. No duplicated collection logic, runtime patching, dynamic replacement or provenance bypass was introduced.

Changed during this repair: the three pinned files restored above; `drizzle.config.ts`; new `src/db/current-prices-schema.ts`; new `scripts/refresh-today-prices.ts`; `src/lib/racing/current-price-overlay.ts`; `src/app/racing/today/tissue-cells.tsx`; `src/lib/racing/current-price-overlay.test.tsx`; `scraper/tests/test_today_prices.py`; this report. The previously added page integration and reviewed migration are unchanged during repair.

C. Pin/model verification

All 141 existing source hashes PASS. Rebuilding provenance from the existing production roots yields exactly the same source hashes and dependency graph. All eight frozen model versions/checksums match the activation manifest: four production family models, Hurdle V3 challenger, AW base, Jump base and Turf base. The new CLI, schema module and price reader remain outside that collection graph.

D. Functionality and regression checks

- 366 Today/source-loader/frozen-research regression tests PASS across 25 files.
- Four overlay tests PASS, including original fallback, missing frozen Value/Market protection, invalid/stale/post-off rejection, and the 141-pin/graph/model test. The opt-in PostgreSQL reader test was skipped during this repair; no database was contacted.
- Four existing prospective-epoch regression tests PASS when selected separately: graph completeness/drift rejection, legacy classification, isolated fixture activation/collection/concurrency and current frozen-score behaviour. Their fixture files stay in temporary directories; no production epoch/collection/settlement is run.
- Four offline Python policy tests PASS, including concurrent-run rejection before retrieval. PostgreSQL integration tests were not rerun because no migration or live connectivity is authorised in this task. Actual SQL preservation, duplicate/concurrency and reader integration results from the earlier isolated implementation validation remain applicable; writer SQL and reader SQL were not changed in this repair.
- Strict TypeScript, targeted ESLint, targeted Pyright (zero errors/warnings), and `git diff --check` PASS.
- Read-only schema metadata comparison confirms the isolated table declaration still matches the pending migration snapshot: 10 columns, one primary key, two foreign keys. The SQL contains only CREATE TABLE and two foreign keys for `race_current_prices`; no unrelated changes, ALTER of existing tables or evidence DML. No migration was generated or applied during repair.

E. Preservation and existing regression discrepancy

All 65 research JSON files in this repair's starting baseline remain byte-identical, including the activation manifest, current prospective ledgers, models and pre-existing working-tree changes. The activation manifest's five original-evidence hashes also all match. No original source import payload/timestamp can have been changed by this task: it never connected to a database, invoked an operational refresh or rendered the live Today page.

The full existing `prospective-epochs.test.ts` run has one known failing test: “all original research files remain byte-exact against this task's starting state”. It compares against the older repository `preservation-before.json`, not this repair's starting state. Twelve forward ledgers already differed before repair: aw-rating-forward-v1, chase-jump-tissue-v1-value-forward-v1, hurdle-jump-tissue-v1-value-forward-v1, jump-g4-forward-v1, context-weight-shadow-v1, jump-rating-forward-v1, model-disagreement-forward-v1, aw-tissue-v2-value-forward-v1, forward-value-v1, tissue-generation-forward-2026-11, or-best-l3-speed-forward-v1 and jump-tissue-forward-v1 (all under data/research, .json). This task verified they remain unchanged; it did not rewrite the older baseline or claim that whole suite passed. Review this existing discrepancy before activation approval. Bun 1.3.5 also produced a nested-test registration error in the following test file after this failing test; the overlay suite passes when run independently. No dependency upgrade or existing-test modification was used to hide either result.

F. Latest verified weekly backup

`backups/racing-analysis-weekly-2026-11-10_181920.tar.gz`, created 10 November 2026 at 18:19:20 UTC/London, 1,186,268,345 bytes.

Archive SHA-256: `7581343d3bee64b91398f7a758166b1b7d25ebfc554c9bd518ef967edb51930f`.

The archive extracted successfully into a separate `/tmp` inspection directory. The existing `verifyExtracted` verifier passed all manifest sizes/hashes and v3 dependency checks: 153 trackers, 18 artifacts, 69 recovery source files, and the database dump. Required `postgres.dump`: 1,177,588,272 bytes; SHA-256 `60d4b35f4ad8168629686728fb4884f86d06c633f76c73bf9712ecb58e546446`. `pg_restore --list` passed with 80 TOC entries, including races, race_runners and source_imports data; dump and server versions recorded as PostgreSQL 17.11. No restore was performed. The archive's manifest is the authority for its inventory.

Recovery procedure is documented in `docs/backup-restore.md`: verify hashes, restore only into a newly created isolated database, inspect counts/queries, and place tracker files in a separate matching checkout. No live overwrite is authorised. The backup predates the 11 November collection activation; a fresh verified pre-activation backup is still required to protect the current prospective state.

G. Remaining activation blockers

Live database connectivity remains unverified until explicitly tested outside the restricted sandbox. Live schema/migration-journal status and database preservation baselines remain unverified. Review the older preservation-baseline discrepancy and obtain a fresh verified backup covering current prospective ledgers before proceeding. Confirm current-day eligibility by a separately authorised dry-run; this task performed no operational dry-run or live refresh. Current prices still expire after five minutes and do not poll an already-open page.

H. Authorisation readiness

The source-pin compatibility blocker is resolved without weakening provenance. A controlled activation can be requested separately with those preflight gates; execution is not yet cleared. Only after connectivity, exact pending schema state, current backup, evidence checks and the dry-run pass should the reviewed overlay migration and one eligible prices-only refresh proceed. This repair authorises and performs none of those live actions. No commits, pushes, deployments, model/rule/dependency updates, source-pin changes, backfills or production collection/settlement occurred.
