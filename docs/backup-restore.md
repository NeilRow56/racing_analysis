# Weekly backup and restore

From the repository root, run:

```sh
bun run backup:weekly --dry-run
bun run backup:weekly
```

Bun loads `.env.local`; `DATABASE_URL` supplies the database connection, including
libpq URI options. Install compatible PostgreSQL client tools (`pg_dump` and
`pg_restore`) and `tar` on PATH. Git must be available with a commit checked out.
The dry run validates prerequisites, required JSON files and checksums without
creating directories, dumps or archives. It does not connect to PostgreSQL.

Weekly archives default to the existing repository `backups/` directory, excluded
from Git. Override with `RACING_BACKUP_DIR=/absolute/path` in your shell or
`.env.local`. For example, `~/Documents/Racing Analysis Backups` is supported.
The command prints the resolved destination. Names use UTC:
`racing-analysis-weekly-YYYY-MM-DD_HHMMSS.tar.gz`.
Existing backups are never overwritten or automatically deleted. Same-second
collisions fail; retry in a later second. Incomplete files from this run are
removed on ordinary failures. An interrupted/killed process may leave a hidden
`.weekly-incomplete-*` directory; inspect it before manually removing it.

Each archive contains one timestamped directory with `postgres.dump`,
`manifest.json`, and `research/<original tracker filenames>`. The manifest records
Git commit/branch, runtime/client versions, database name, dump verification,
file sizes and SHA-256 hashes, tracker version identifiers, count and archive
name. It contains no database credentials. No `.env` files are archived.

The required inventory is in `scripts/backup-tracker-inventory.ts`, alongside each
writer's source file. All 17 current monitors plus the still-runnable Turf Tissue
v1 ledger are included (18 files). Models, frozen diagnostics, calibration exports,
and the superseded `aw-tissue-paired-forward-v1.json` are excluded. Keep the
inventory updated whenever a prospective writer is added or retired. Retain the
Git repository separately for code, models and frozen analysis artifacts. The
legacy `backup:daily`, `backup:verify`, and explicit `backup:cleanup` commands
retain their older single-tracker directory format; use `backup:weekly` for full
tracker coverage. Do not run cleanup as part of weekly backup.

Database dumping is read only. No research workflow is invoked. The dump must
pass `pg_restore --list`. Trackers must exist and parse as JSON objects. Their
copied bytes must match the hashes captured during preflight; concurrent changes
cause failure. The archive must list successfully and its extracted files must
match all manifest hashes before publication. The summary prints the archive's
SHA-256 for checking a transferred copy. These integrity checks detect corruption,
not malicious replacement. Backups contain private data; store them appropriately.

The database snapshot and tracker files are captured at separate times. Pause
capture/settlement jobs when a coordinated snapshot is needed. Files and
prospective timestamps are never rewritten by the backup script.

## Optional Google Drive copy

No Google Drive mount was detected in the standard Mac locations during the
rebuild. There is no assumed Drive path or automatic upload. To enable a copy,
create/select a real existing synced folder, then set:

```sh
export RACING_BACKUP_OFFSITE_DIR='/verified/synced/path/Racing Analysis Backups'
bun run backup:weekly
```

The folder must already exist. The command copies the completed archive, checks
SHA-256 and publishes it without overwriting an existing file. `COPIED` confirms
a verified local copy into that folder; check Google Drive separately to confirm
cloud synchronization. Unavailable/unconfigured offsite storage leaves the local
backup complete and prints:

> Backup complete locally; copy/upload this archive to Google Drive.

An offsite failure is reported as `FAILED` but does not make a valid local backup
fail. Do not mistake local-only success for off-device protection.

## A. Inspect an archive

Use only a trusted backup. Substitute the actual archive path:

```sh
ARCHIVE='/absolute/path/racing-analysis-weekly-YYYY-MM-DD_HHMMSS.tar.gz'
tar -tzf "$ARCHIVE"
shasum -a 256 "$ARCHIVE"
```

Compare the archive hash with the backup summary or your separately retained
copy. Inspect the listing for the expected single root directory and filenames.

## B. Extract into a fresh directory

```sh
RESTORE_DIR="$(mktemp -d /tmp/racing-restore.XXXXXX)"
tar -xzf "$ARCHIVE" -C "$RESTORE_DIR"
# Replace the timestamp with the actual root directory shown by tar:
BACKUP="$RESTORE_DIR/racing-analysis-weekly-YYYY-MM-DD_HHMMSS"
cat "$BACKUP/manifest.json"
```

Verify the manifest and every stored file before using them:

```sh
bun -e 'import { readFile } from "node:fs/promises"; import { verifyExtracted } from "./scripts/backup-weekly"; const directory = process.argv[1]; await verifyExtracted(directory, JSON.parse(await readFile(`${directory}/manifest.json`, "utf8"))); console.log("Checksums PASS");' "$BACKUP"
```

## C. Verify the PostgreSQL dump

```sh
pg_restore --list "$BACKUP/postgres.dump"
```

This checks that the dump can be listed, not that a complete restore will succeed.

## D. Restore to a NEW test database

Choose a **new, unused** database name. Commands below connect to the local server;
set PGHOST/PGPORT/PGUSER as required. They do not read the app's `.env.local`.
Stop if `createdb` fails; never point these commands at `racing_analysis`.

```sh
createdb -p 5432 racing_analysis_restore_test
# Run only after createdb succeeds:
pg_restore -p 5432 --exit-on-error --no-owner --no-privileges \
  --dbname=racing_analysis_restore_test "$BACKUP/postgres.dump"
psql -p 5432 --dbname=racing_analysis_restore_test -c '\dt'
```

Check expected tables, row counts, recent results, and application queries against
this separate database. Missing original roles can be handled with the shown
`--no-owner --no-privileges` options. This workflow never runs a restore for you.

## E. Restore tracker JSON into an isolated checkout

Copy the extracted `research/*.json` files to `data/research/` in a separate test
checkout matching the manifest's Git commit. For example, after creating that
checkout and reviewing its path:

```sh
TEST_CHECKOUT='/absolute/path/to/isolated-test-checkout'
mkdir -p "$TEST_CHECKOUT/data/research"
cp -i "$BACKUP"/research/*.json "$TEST_CHECKOUT/data/research/"
```

Use the test database in that checkout. Inspect tracker counts, first-capture
timestamps, prices and settlement state. Do not sync or settle restored trackers
until you have verified them.

## F. Live replacement requires manual verification

Only consider replacing live data after verifying the separate database and
tracker copies, making another current backup, and stopping all writers. Plan
that replacement explicitly; no destructive live restore command is provided.
Do not reconstruct or modify original prospective timestamps to fill gaps.
