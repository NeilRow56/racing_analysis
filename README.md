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

## Hurdle Tissue Challenger Shadow

This prospective research shadow compares the frozen Jump Tissue V1 CONTROL with
the Hurdle Excuse-Half CHALLENGER. It is not a production model. Production tissue
probabilities, Chase behavior and VALUE thresholds are unchanged.

```bash
bun run hurdle-pair:sync
bun run hurdle-pair:today
bun run hurdle-pair:summary
bun run hurdle-pair:results
bun run hurdle-pair:results YYYY-MM-DD
```

The fresh `HURDLE_TISSUE_EXCUSE_HALF_SHADOW_V1` epoch starts at
`2026-10-12T18:44:47.000Z`. The dedicated paired tracker is
`data/research/hurdle-tissue-challenger-forward-v1.json`. Capture accepts only
today's genuine Hurdles before off, with complete model inputs and no results.
There is no backfill, reconstruction from other trackers, retraining or refitting.
Both full-field books, ranks, identities and the frozen source model checksum are
retained at first capture. Only the historical experiment's 30 adverse/excuse
standardized feature contributions are halved before softmax.

Each leader's first valid bookmaker median price is retained permanently, together
with quote provenance and implied probability. If unavailable at model capture,
it may be added by a later current-day pre-race sync. VALUE uses the existing
positive probability edge against a valid bookmaker snapshot, with no price filter;
forecast odds cannot qualify. Once captured, neither this price nor the VALUE flag
is rewritten. Missing prices stay missing in settlement and incomplete ROI is
reported as unavailable. Summary P/L covers all priced rank-1 selections and also
reports VALUE-only P/L separately. Voids have zero P/L and no stake in ROI.

`research:morning` captures after racecards and Jump model data are available.
`research:live` and `research:after` settle only existing paired captures using
canonical Jump settlement. Started non-finishers remain losses. Changed fields are
retained but excluded from clean paired metrics. Reports show disagreement wins,
void pairs and separate captured-price and final-SP <=14/1 / >14/1 segments;
missing price contexts are omitted from those segments. The secondary section on
`/racing/research/forward-value` shows current-day pairs, including settled outcomes.

No automatic promotion. Reconsider only after a meaningful prospective sample,
comparing calibration, rank-1 strike, disagreements, long-price behavior and priced
P/L. The historical improvement was modest and did not solve long-price calibration.

## Hurdle VALUE Maximum Qualifying Price

From `2026-10-12T18:59:58.000Z`, `HURDLE_VALUE_MAX_PRICE_V1` limits main Hurdle
Tissue VALUE to a qualifying bookmaker decimal price of **15.0 or less** (14/1).
Exactly 15.0 is allowed; 15.01 and higher are retained as **HURDLE LONG-PRICE
SHADOW**, excluded from main VALUE selections, returns, ROI and Today totals.
The rule follows replicated historical underperformance of long-priced Hurdle
rank-1 selections. Chase qualification remains uncapped.

New prospective Hurdle records in `data/research/jump-tissue-forward-v1.json`
store the rule version, epoch, model version, capture time, normal VALUE flag,
price-cap flag and first qualifying bookmaker snapshot. Qualification still needs
the existing rank-1 and positive-edge criteria. The first snapshot that passes
those criteria is frozen for both allowed and shadow selections; later stage
snapshots and latest prices are context only. Missing bookmaker prices remain
unavailable. Forecast odds, final SP and later prices cannot substitute for that
qualifying snapshot. Canonical settlement supplies qualifying-price returns.

No backfill or old record edits: earlier Hurdle captures remain PRE-CAP history,
reported separately from the new POST-CAP Hurdle VALUE cohort. The existing Excuse-Half paired challenger keeps its own
uncapped research semantics.

`value:today`, `value:results`, `value:summary` and the morning summary report
main VALUE separately from the long-price shadow. The research monitor displays
the shadow's cumulative and current-day selections, settlement, winners, P/L and
ROI beneath the main Tissue VALUE section.

## AW and Flat Turf VALUE Maximum Qualifying Price

From `2026-10-13T00:47:53.000Z`, `TISSUE_VALUE_FAMILY_PRICE_CAP_V1` applies
prospectively to new AW and Flat Turf observations. Current actionable caps:

| Family | Maximum qualifying price |
| --- | --- |
| Hurdle | 14/1, decimal <=15.0 (existing rule) |
| All Weather | 20/1, decimal <=21.0 |
| Flat Turf | 20/1, decimal <=21.0 |
| Chase | No cap; existing VALUE logic unchanged |

Exactly 21.0 is allowed for AW/Turf. Prices above 21.0 remain in separate
AW and Turf long-price shadows for ongoing research, with canonical settlement
and stored qualifying-price £1 P/L. They are excluded from main VALUE cards,
Today totals, settled selections, P/L and ROI. Reports `value:today`,
`value:results`, `value:summary` and the morning workflow distinguish MAIN VALUE
from LONG-PRICE SHADOW and report shadow counts and returns separately.

The rule stores family, version, model version, capture time, original VALUE
status, cap exclusion and the first qualifying bookmaker snapshot. That first
qualification and classification remain frozen across reruns and later prices.
Missing bookmaker prices remain unavailable, with no forecast, SP or latest-price
fallback. Earlier AW/Turf observations remain pre-cap history; no backfill or
historical data rewrite is performed. Tissue probabilities, rank-1 selection,
positive-edge criteria and settlement semantics are unchanged.
