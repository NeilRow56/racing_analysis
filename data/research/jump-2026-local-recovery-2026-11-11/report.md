# Eleven local Jump results recovered

11 November 2026. Recovery committed to `racing_analysis` at `127.0.0.1:5432` using host access. Transaction **52216**, started **13:47:41 GMT**. No PostgreSQL configuration or service changes.

**Recovered missing result fields for exactly 11 races and 111 existing runner records:** 91 finishers, 15 non-finishers and five confirmed non-runners. All 11 winners and winning times independently match the original local payloads. No cache was regenerated or activated.

## Safety and method

The latest available backup, `backups/racing-analysis-weekly-2026-11-10_181920.tar.gz`, was verified before any database modification. Its `racing_analysis` dump matches the manifest's SHA-256 and byte count; `pg_restore --list` passed. No restore was performed. See [backup verification](backup-verification.json).

[before-state.json](before-state.json) captures every column of the 11 races, 111 runners and their original source records, plus identity mappings, authoritative-correction checks and unrelated-record checksums. It was collected in a read-only, repeatable-read transaction before recovery.

The general full-result importer would overwrite pre-race fields. This operation instead reused its existing finishing-position, outcome/status, comment, margin, time and authoritative-correction helpers in a narrowly scoped, missing-only transaction. Actual starter counts came directly from the source `ride_count`, independently reconciled to starters, excluding non-runners. No rating calculation was introduced or run.

A rehearsal verified the changes, rolled back and confirmed exact restoration of the baseline. Its first attempt also rolled back safely after the independent verifier needed to recognise raw `finish_position: 0` as no finishing position, consistent with the existing parser. The successful rehearsal and committed recovery used the same update plan. Concurrent writes were blocked during transaction verification; any pre-commit mismatch would have rolled back the entire operation.

Eleven **new** `full-result-next-data` provenance records were added with exact copies of the verified completed payloads. Original racecard records were neither overwritten nor relabelled. New provenance preserves the original retrieval timestamps; it does not imply a fresh download. [source-provenance.csv](source-provenance.csv) lists each original local filename, SHA-256, retrieval timestamp and new database source-record UUID.

All ten existing registered authoritative winning-time corrections still match the database. None concerns these 11 races, so their published local times required no correction. Missing minutes were not inferred. Guard v2 remains unchanged.

## Recovered races

All races are dated **9 October 2026**. Record counts include non-runners; starter counts do not.

| Sporting Life ID | Course | Runner records | Starters | Winning time |
| --- | --- | ---: | ---: | --- |
| 942539 | Chepstow | 10 | 10 | 4m 3.51s |
| 942540 | Chepstow | 7 | 7 | 6m 9.08s |
| 942542 | Chepstow | 11 | 11 | 4m 55.54s |
| 942544 | Chepstow | 15 | 15 | 5m 5.53s |
| 942545 | Chepstow | 11 | 8 | 4m 15.68s |
| 942762 | Downpatrick | 9 | 9 | 4m 17.80s |
| 942764 | Downpatrick | 9 | 8 | 4m 16.80s |
| 942765 | Downpatrick | 6 | 6 | 5m 56.40s |
| 942767 | Downpatrick | 9 | 8 | 4m 50.40s |
| 942768 | Downpatrick | 14 | 14 | 6m 11.70s |
| 943053 | Chepstow | 10 | 10 | 4m 5.76s |

[race-results.json](race-results.json) includes complete race names, winners, original winner prices, off-times and finisher/non-finisher counts.

## Exact changes and verification

Only missing fields were filled. Existing correct non-null results were preserved.

| Field | Records updated |
| --- | ---: |
| Race `winning_time` | 11 |
| Race `off_time` | 11 |
| Race `actual_runner_count` | 11 |
| Runner `finishing_position` | 91 |
| Runner `finishing_status` | 111 |
| Runner `result_status` | 106 |
| Runner `outcome_code` | 111 |
| Runner `runner_comment` | 97 |
| Runner `beaten_distance` | 80 |
| Runner `beaten_distance_to_winner` | 80 |

This is **709 result-field changes**, plus `updated_at` metadata on the 122 modified race/runner records. The five correct non-runner `result_status` values were preserved. Margin fields use the existing importer mapping; this operation did not create a new cumulative-margin calculation.

[changes.csv](changes.csv) identifies every changed database record, field and before/after value, including metadata. [after-state.json](after-state.json) contains the complete committed rows and comparison; [commit-receipt.json](commit-receipt.json) records transaction scope.

Verification passed inside the transaction, through a fresh read-only Python connection after commit, and through a separate Bun/Postgres implementation reading the original payloads. There were **zero identity, position, winner, status, winning-time or provenance mismatches**. Whole-row checksums for every unrelated race and runner, and all horses/courses/trainers/jockeys, match the before-state. Original source records and all captured prices, official ratings, weights, race datetimes and identities are unchanged. No unrelated record was updated by this recovery. See [independent verification](independent-verification.json) and [unrelated-record checks](unrelated-record-verification.json).

All 25 diagnostic local-source hashes and the original 2026 Jump cache hashes still match. Original SPs remain uncapped, including the recovered 16/1 winner West Hill Verde. No original research snapshot or frozen input was overwritten.

Validation: seven existing Python ingestion/correction tests and nine existing production-guard/missing-minute tests passed. The temporary operational Python script passes the required targeted Pyright check with zero errors or warnings. No application code changed.

## Remaining gaps and rebuild assessment

For the original 33,004 target rows, missing full-result provenance fell from **209 rows / 25 races to 98 rows / 14 races**, all dated 15 October. Those 98 rows remain unresolved and untouched:

- **13 races / 94 rows:** IDs 943566–943577 and 944162 have partial retrospective horse-history evidence, but no complete result payload in the previously searched local sources. Partial evidence is not sufficient to fabricate complete fields, margins, SP settlement or winning times.
- **One race / four rows:** Perth 943578 has only the retained pre-race snapshot; no retrospective outcome evidence was found in that search.

All corresponding local files remain unchanged. This does not prove the results are irrecoverable globally: compressed historical database backups were not restored or exhaustively searched, and no external retrieval was authorised. They are unavailable as complete results in the verified current sources.

Earlier timed-input availability for the original target horses increased to **102,901 raw runner records across 20,148 races**, with zero missing full-result payloads or inconsistent source namespaces. These raw counts include non-runners; they are not a claim of usable rating coverage.

There are also **22 pre-existing untimed rows across three other races**, already present before this operation: Warwick 913485 (11 records), Hereford 916506 (two records), and Uttoxeter 929549 (nine records). Their retained full-result payloads themselves have no winning time. In particular, **929549 is explicitly `RACEVOID` in source, while its nine database runner statuses are `other`**. The existing generic settlement helper can treat `other` as a losing outcome. This is a separate research-settlement issue; no correction or exclusion was implemented outside the authorised 11 races. The other two races have source finishing positions but no published time in their retained payloads; no time was guessed.

**Assessment:** an isolated exploratory candidate restricted to a documented partial period, such as **1 January–14 October**, is now technically defensible to build using the existing builder and current guard, following renewed prebuild checks. It is **not yet established as research-ready**: the void-race settlement issue and untimed observations need an explicit scoped treatment before profitability results can be trusted. An unqualified full-2026 candidate remains unsupported because of the 14 unresolved races and downstream histories. No scope reduction, void correction, cache build, activation, strategy evaluation or model/rule change was performed. Separate authorisation is needed for the next operation.
