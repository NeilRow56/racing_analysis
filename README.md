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

After importing fresh Sporting Life racecards, run the normal family syncs early in the day to create the prospective observations:

```bash
bun run tpr:sync
bun run jump-rating:sync
bun run aw-rating:sync
```

Run the same commands again when races are 210-150 minutes from their canonical scheduled off to capture T-180 prices, and again at 90-30 minutes before off to capture T-60 prices. Repeat syncs enrich the existing observation; they do not replace the frozen rating or early price and do not create duplicate observations. A missed window remains missing and is never reconstructed retrospectively.

After racing, import canonical results first, then run each forward tracker sync so those trackers consume the imported results and settle their own records:

```bash
bun run sl:import-day YYYY-MM-DD --request-delay-seconds 2
bun run tpr:sync
bun run tissue:sync
bun run jump-rating:sync
bun run aw-rating:sync
bun run aw-tissue:sync
bun run jump-tissue:sync
```

Result import and tracker settlement are separate operations. `bun run sl:import-day YYYY-MM-DD --request-delay-seconds 2` writes the canonical Sporting Life results into the database; it does not automatically settle every forward tracker. Forward Value reads settlement from the family trackers, so a row can show as pending until the relevant sync has run.

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
