# Jump 2026 recovery blocker diagnosis

11 November 2026. Diagnostic only. No imports, corrections, downloads, restarts or cache regeneration.

**The racing PostgreSQL server is running. Eleven affected races have complete results locally; fourteen lack complete result payloads in the searched sources.** The earlier connection failure does not establish that PostgreSQL stopped.

## Connectivity

The configured connection reaches `racing_analysis` at `127.0.0.1:5432`. The active server is **Postgres.app PostgreSQL 17.11, PID 504**, started **5 November 2026 at 17:17:25 GMT**. SQL, TCP listeners and `postmaster.pid` agree. Its log contains no 11 November shutdown, crash or restart, and the postmaster start time remained unchanged across successful checks. No evidence shows a local process stopping this server.

Sandboxed executions intermittently returned immediate `ECONNREFUSED` while the listener remained present. Host-access read-only checks succeeded moments later. Both Bun stdin and eval modes also failed within one sandboxed invocation: this is **not established as a Bun stdin bug**. The likely cause is execution-context access restrictions; the precise mechanism is unproven. The previous recommendation to restore database service is therefore superseded.

A separate **Homebrew PostgreSQL 15 LaunchAgent**, `sh.brew.postgresql@15`, is repeatedly failing to start. It has `KeepAlive=true`; observed state was `spawn scheduled`, 20,224 runs, last exit 1. Its log reports both IPv4/IPv6 addresses already in use, then failure to create TCP/IP sockets. Postgres.app already owns port 5432. These are failed starts of a redundant cluster, not crashes of the racing server.

Evidence logs:

- `/Users/neilrowland/Library/Application Support/Postgres/var-17/postgresql.log`
- `/usr/local/var/log/postgresql@15.log`

**Safest action:** retain the working server and configured connection, and use the verified host-access execution context for subsequent authorised database work. No racing-server restart is indicated. Separately review the redundant v15 service; disable its automatic launch only after confirming it is unused and obtaining separate authorisation. Nothing was stopped here. All audit SQL connections explicitly enabled read-only transactions.

## Source classification and cause

All **25 race identities and 209 ride/horse identities** match the retained files and database mappings. Every local payload matches its stored database racecard JSON. No identity mismatch explains the omission.

| Class | Races | Rows | Evidence |
| --- | ---: | ---: | --- |
| A: full results locally available | 11 | 111 | Weighed-in results, winning times, one winner and outcomes for every starter |
| B: partial results locally available | 13 | 94 | Pre-race snapshots plus retrospective horse-history snippets; no complete race payload |
| C: no retrospective result found | 1 | 4 | Perth 943578 has only a dormant pre-race snapshot |

Class A contains **106 starters: 91 finishers and 15 non-finishers**, plus five genuine non-runners: Adba, Dalcassian Girl and Siorai (942545), Surviving Murmansk (942764), and Parkgarve (942767). Each is explicitly marked `NONRUNNER`; their status was not inferred from an absent finish position. The remaining 204 rows comprise 106 completed starters and 98 unresolved pre-race entries. The old cache has null result status on all 209; current database/source records identify the five non-runners.

**Specific omission:** all 25 payloads were ingested through the racecard path as `racecard-next-data`. The 11 completed payloads already contain winning times inside database JSON. However, `import_racecard` deliberately leaves winning time and finish position unset and maps only non-runner status. No corresponding `full-result-next-data` import exists. This is an importer-path/provenance gap, not failed identity matching. Full-result ingestion would need separate authorisation; changing a label alone would not repair the structured records.

The whole retained `data/raw/sporting-life` tree was searched for exact numeric IDs; matches in 313 files were structurally inspected. There are only 25 matching top-level race payloads. Later horse histories provide partial outcomes for 13 unresolved races, but do not establish complete fields, all margins, race winning times or full settlement provenance. Compressed database backups were not restored or exhaustively searched for embedded historical payloads. “Absent” is bounded to the searched raw tree and matching current database source imports. No external sources were accessed.

| Date (2026) | Sporting Life race ID | Course | Rows | Class |
| --- | --- | --- | ---: | --- |
| 9 October | 942540 | Chepstow | 7 | A |
| 9 October | 942545 | Chepstow | 11 | A |
| 9 October | 942765 | Downpatrick | 6 | A |
| 9 October | 943053 | Chepstow | 10 | A |
| 9 October | 942539 | Chepstow | 10 | A |
| 9 October | 942762 | Downpatrick | 9 | A |
| 9 October | 942544 | Chepstow | 15 | A |
| 9 October | 942542 | Chepstow | 11 | A |
| 9 October | 942768 | Downpatrick | 14 | A |
| 9 October | 942767 | Downpatrick | 9 | A |
| 9 October | 942764 | Downpatrick | 9 | A |
| 15 October | 943578 | Perth | 4 | C |
| 15 October | 943575 | Perth | 9 | B |
| 15 October | 944162 | Perth | 8 | B |
| 15 October | 943572 | Perth | 4 | B |
| 15 October | 943577 | Perth | 9 | B |
| 15 October | 943573 | Perth | 10 | B |
| 15 October | 943570 | Fontwell | 9 | B |
| 15 October | 943571 | Fontwell | 6 | B |
| 15 October | 943569 | Fontwell | 7 | B |
| 15 October | 943574 | Perth | 6 | B |
| 15 October | 943568 | Fontwell | 6 | B |
| 15 October | 943567 | Fontwell | 7 | B |
| 15 October | 943576 | Perth | 9 | B |
| 15 October | 943566 | Fontwell | 4 | B |

[affected-records.csv](affected-records.csv) identifies all 209 database runner UUIDs, ride IDs, horse identities, database/source statuses, prices and file paths. [diagnostic.json](diagnostic.json) contains full race names, file hashes, import metadata and downstream identities. [partial-history-evidence.json](partial-history-evidence.json) records retrospective evidence, without using it to reconstruct results.

## Later feature impact

The issue affects **later calculations as well as the original races**. The existing loader excludes untimed prior runs. Omitting a genuine run changes history windows, latest/previous and Best L3/L5 inputs, prior statistics, Speed, weight-adjusted Performance and consequently Today's Rating. Missing timed races can also alter standard times, guard peers and meeting variants used to rate other horses. Trainer/jockey research inputs may also be affected.

Within the old cache through 15 October, six later rows share a horse with a missing run; one is already inside the affected 25 races. The **five additional rows** are Pahlavi (10 October), Pralognan (11 October), Marine Tycoon, Fr Gilligansvoyge and Subset (14 October). A deliberately broad course-context screen identifies **four additional potentially exposed rows**: Glen To Glen, Hob's Angel, Soldier Saint and Time To Bite. This screen includes all distances to cover standard/guard/meeting-variant pathways conservatively; it identifies potential exposure, not proven numerical changes.

Through 11 November, **106 completed, timed later Jump runner rows across 91 races** have direct same-horse exposure. **39** relate to the fourteen unresolved races. These are structural dependency counts, not recalculated features. An extended recovery cannot safely just delete the original missing-result rows.

## Partial-cache estimates

These estimates concern the **old matched 33,004-row population**, not rebuilt guard-v2 ratings or the expanded current database. “Finite features” means existing Best L3 Speed, Performance and Today's Rating together, including rows that may not be settled starters.

| Hypothetical scope | Retained rows | Three finite old features |
| --- | ---: | ---: |
| Exclude all 25 races and nine additional direct/context exposures | 32,786 | 27,699 |
| After local A recovery, exclude fourteen unresolved races | 32,906 | 27,800 |
| After local A recovery, use a clear cutoff of 14 October | 32,901 | 27,795 |

For the first scope, **25,173** also satisfy the existing known-outcome/valid-price settlement predicates. Other finite-feature counts must not be called settled eligible runners. Guard v2 may further reduce availability, and new source values may change features. No exact candidate coverage is established without the separately authorised rebuild and validation.

The fourteen unresolved 15 October races have **no detected direct or broad timed-context exposure outside their own races within the old date range**. A cutoff on 14 October avoids these unresolved runs entering subsequent target histories. Class A recovery first would preserve legitimate 9 October results, including the 16/1 West Hill Verde winner. No price-based exclusion, cap or return change was made; the conservative retained population still contains the old 301-decimal-SP winner.

## Smallest safe next action

1. Keep the working Postgres.app server and configured connection unchanged; use verified host access.
2. Seek separate authorisation to validate and ingest **only the eleven existing completed payloads through the existing full-result importer**, preserving original files and provenance and retaining authoritative corrections and the current guard. No download is needed for these eleven races.
3. Do not reconstruct the remaining fourteen complete results or winning times from partial horse histories. They cannot presently be recovered completely from the searched local evidence.
4. If full recovery remains unavailable, a **documented exploratory partial candidate ending 14 October**, after class A recovery and renewed source-integrity checks, is defensible in principle. It needs explicit scope approval, guard-v2 rebuilding, normal validation and separate acceptance before activation. It is not full-2026 coverage or untouched validation evidence.

Only diagnostic reports were created. Existing cache hashes still match the previous audit. No application/source files, database records, services, compatibility rules, frozen research, prospective monitors or models were changed.
