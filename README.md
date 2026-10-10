# Racing Analysis

Personal horse-racing analysis application for importing and studying UK racing data.

The project is intentionally small at this stage. It establishes the application foundation only: Next.js, TypeScript, Tailwind CSS, PostgreSQL schema scaffolding, Drizzle configuration, and a placeholder for the future Python ingestion layer.

## Architecture

- `src/app` contains the Next.js App Router UI.
- `src/components` is reserved for reusable React components.
- `src/db` contains Drizzle schema and database access code.
- `src/lib` contains shared TypeScript utilities.
- `drizzle` is the Drizzle migrations output directory.
- `scraper` is reserved for the separate Python scraping and ingestion layer.
- `scripts` is reserved for project scripts.
- `data` is reserved for local data files that may be useful during import experiments.

## Next.js and Bun

Use Bun for JavaScript and TypeScript package management and scripts.

```bash
bun install
bun dev
```

Run validation with:

```bash
bun run typecheck
bun run lint
bun run build
```

## Forward Value Daily Workflow

The concise operator workflow is:

```bash
bun run research:night
bun run research:morning
bun run research:live
bun run research:late
bun run research:after [YYYY-MM-DD]
```

`research:night` captures first next-day cards. `research:morning` imports current cards, runs the normal Tissue VALUE and shadow syncs, and includes AW paired research sync automatically after its inputs are ready. `research:live` imports available results and settles existing prospective observations only; it does not create missed selections or rewrite qualifying prices. `research:late` is an optional late price refresh. `research:after` defaults to yesterday when no date is supplied, imports complete results, settles existing rows, and prints the result summary.

If the morning racecard refresh fails with a network/request error, the workflow can use existing local Sporting Life cards for the exact target date. It requires at least two races with matching card identities/dates and complete runner sets, reports race/meeting/runner counts, and flags the final summary with `USING EXISTING LOCAL CARDS`. Stored quotes are withheld from new price capture; existing qualifying prices and first captures stay frozen. Missing or invalid cards, date/parser failures, and failed acquisitions in other workflow modes still stop the workflow.

Result import and tracker settlement are separate operations inside the wrappers. `bun run sl:import-day YYYY-MM-DD --request-delay-seconds 2` writes canonical Sporting Life results into the database; `bun run research:settle YYYY-MM-DD` settles previously captured prospective tracker rows without creating new captures. A row can show as pending until result import and settlement have both run.

For diagnostic AW shadow forward validation, run `bun run sync:aw-shadow` immediately after the normal AW V1 sync, before racing, and repeat after price-window and settlement syncs. This independent wrapper does not run or change production trackers. It warns about missing prospective captures, changed candidate leaders without frozen prices, and price snapshots predating prediction. See [AW shadow collection](docs/aw-tissue-shadow.md).

The reporting commands are read-only:

```bash
bun run value:today
bun run value:summary
bun run tpr:summary
bun run tissue:summary
bun run jump-rating:summary
bun run aw-rating:summary
bun run aw-tissue:summary
bun run jump-tissue:summary
```

## JPR-A0 Prospective Shadow

`JPR_A0_V1` is captured only from `2026-09-27T06:06:49.000Z`. It does not replace `JPR_A_V1` in Today or Forward Value.

- With Average Jump Speed L3, its score is the unchanged JPR-A average of the runner's within-race speed rank and trainer prior strike-rate rank.
- Without Average Jump Speed L3, its score is the trainer prior strike-rate rank alone. Without that trainer rank, the runner is unrated.
- Normal and fallback scores are compared directly because both are expressed in the same unit: ordinal positions within the same active-runner field. Normal scores average two such positions; fallback scores retain the one available position. No scaling, offset, penalty, OR, or market-price input is applied.
- The combined scores receive ascending competition ranks, preserving ties.

The existing `bun run jump-rating:sync`, `bun run jump-rating:today`, and `bun run jump-rating:summary` commands capture and report the shadow evidence through the existing Jump tracker.

## PostgreSQL and Drizzle

Database configuration expects a PostgreSQL connection string:

```bash
DATABASE_URL=postgres://USER:PASSWORD@HOST:PORT/DATABASE
```

Copy `.env.example` to `.env.local` when a real local or hosted database has been chosen. Do not commit credentials.

Useful database commands:

```bash
bun run db:generate
bun run db:migrate
bun run db:push
bun run db:studio
```

### Local backups

Create a timestamped PostgreSQL and forward-tracker backup with:

```bash
bun run backup:daily
```

Completed backups are written under `backups/YYYY-MM-DD_HHMMSS/` and are excluded from Git. Verify the newest backup without restoring it using `bun run backup:verify`. Cleanup is deliberately separate from backup creation; `bun run backup:cleanup` keeps the newest 30 completed backups.

Create a fresh, verified weekly archive for manual upload to Google Drive with:

```bash
bun run backup:weekly
```

The command writes `racing-analysis-weekly-YYYY-MM-DD_HHMMSS.tar.gz` to the current user's `Documents` directory. It contains only the PostgreSQL custom-format dump, forward tracker JSON, and backup manifest.

To test a restore, create an empty test database and restore the custom-format dump into it:

```bash
createdb racing_analysis_restore_test
pg_restore --dbname=racing_analysis_restore_test backups/YYYY-MM-DD_HHMMSS/postgres.dump
```

Verify expected tables and row counts in that test database first. Restoring over a working database should only be done deliberately, with an additional current backup and explicit `pg_restore` options appropriate to the target database.

The initial schema covers courses, horses, trainers, jockeys, races, and race runners/results. Imported entity tables include optional `source` and `source_id` fields because historical racing data may contain repeated or inconsistently formatted names. Display names alone should not be treated as permanent identifiers.

## Future Python Ingestion

The scraping and ingestion layer will be Python-based and kept separate from the Next.js application. The open-source `rpscrape` project may be investigated later, but it has not been installed or integrated yet.

Before implementing ingestion, inspect real source output and decide how raw imported records should map into the normalized PostgreSQL tables.
