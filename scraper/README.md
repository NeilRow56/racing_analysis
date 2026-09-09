# Scraper

This directory is reserved for the future Python scraping and ingestion layer.

Keep scraping code separate from the Next.js application in `src/`.

## Local Environment

The Python environment is intentionally local-only and ignored by git:

```bash
python3 -m venv scraper/.venv
source scraper/.venv/bin/activate
python -m pip install -r scraper/requirements-rpscrape.txt
```

Third-party scraper code should stay isolated under `scraper/vendor/`. Our own capture, normalization, and import code should live directly under `scraper/` or a clearly named subdirectory.

## rpscrape Investigation

The current practical test target is the maintained `rpscrape-updated` fork:

```bash
git clone https://github.com/stejackson94/rpscrape-updated.git scraper/vendor/rpscrape
```

The original upstream documented in the project README is `joenano/rpscrape`, but direct clone/archive access returned not found during this investigation.

To capture the tiny historical-results sample used for compatibility analysis:

```bash
source scraper/.venv/bin/activate
python scraper/capture_rpscrape_sample.py
```

The wrapper copies tracked sample settings into the ignored vendor checkout, runs one GB course/date request, and copies the raw CSV into `data/raw/rpscrape/`.

To import the single proven Racing Post full-result sample into PostgreSQL:

```bash
source scraper/.venv/bin/activate
DATABASE_URL=postgresql://localhost:5432/racing_analysis python scraper/scripts/import_one_result.py
```

This fetches race `766341`, preserves the raw `/_next/data` payload, and upserts only that one race and its runners.

To import the deliberately small one-day UK results sample:

```bash
source scraper/.venv/bin/activate
DATABASE_URL=postgresql://localhost:5432/racing_analysis python scraper/scripts/import_results_day.py 2020-10-01
```

The day importer fetches the Racing Post results index for the date, filters to UK meetings, fetches each full-result structured payload, preserves raw JSON files, stores raw JSONB in `source_imports`, and upserts the normalized records idempotently.

## Manual Sporting Life Historical Import Workflow

Sporting Life imports are intended to be run manually from a normal terminal for controlled historical ranges. The importer processes dates sequentially, filters to UK and Ireland meetings, preserves raw `NEXT_DATA` payloads under `data/raw/sporting-life/`, stores provenance in `source_imports`, and skips already-imported full-result payloads by default.

Recommended command pattern:

```bash
bun run sl:import-range YYYY-MM-DD YYYY-MM-DD --request-delay-seconds 2
```

Use a conservative `2` second delay for month-by-month imports. This is slower than necessary in some runs, but kinder to the source and easier to resume safely if a transient error appears.

2025 month commands:

```bash
bun run sl:import-range 2025-01-01 2025-01-31 --request-delay-seconds 2
bun run sl:import-range 2025-02-01 2025-02-28 --request-delay-seconds 2
bun run sl:import-range 2025-03-01 2025-03-31 --request-delay-seconds 2
bun run sl:import-range 2025-04-01 2025-04-30 --request-delay-seconds 2
bun run sl:import-range 2025-05-01 2025-05-31 --request-delay-seconds 2
bun run sl:import-range 2025-06-01 2025-06-30 --request-delay-seconds 2
bun run sl:import-range 2025-07-01 2025-07-31 --request-delay-seconds 2
bun run sl:import-range 2025-08-01 2025-08-31 --request-delay-seconds 2
bun run sl:import-range 2025-09-01 2025-09-30 --request-delay-seconds 2
bun run sl:import-range 2025-10-01 2025-10-31 --request-delay-seconds 2
bun run sl:import-range 2025-11-01 2025-11-30 --request-delay-seconds 2
bun run sl:import-range 2025-12-01 2025-12-31 --request-delay-seconds 2
```

Check a completed month locally without making external requests:

```bash
bun run sl:import-status 2025-01-01 2025-01-31
```

The status command reports represented dates, races, runners, source imports, coverage, result statuses, duplicate source IDs, duplicate race/horse rows, and missing source IDs. Run it after each month before moving on.

If an import stops part-way through a month:

1. Note the `DATE_FAILED`, `REQUEST_FAILED`, URL, HTTP status, and body prefix from the terminal output.
2. Do not repeatedly retry if the status is `403`, `406`, `429`, or the page suggests CAPTCHA/access restriction.
3. For a single transient `5xx` or maintenance response, wait and rerun the same month command later.
4. Let the importer skip already-completed full-result `source_imports`.
5. Confirm the month afterwards with `bun run sl:import-status START_DATE END_DATE`.

Rerunning a completed month is safe: races, runners, entities, and `source_imports` are keyed by Sporting Life source IDs and upserted idempotently. By default, already-imported full-result payloads are skipped, so a resume does not refetch every completed race.

Codex does not need to supervise these long imports. The command runs as a normal local process in the terminal. If you later want Codex to review a month or diagnose a failure, keep the terminal output from the failed run plus the matching `sl:import-status` output. Never use proxies, IP rotation, CAPTCHA bypass, or other access-control avoidance.

## Manual Sporting Life Racecard Import Workflow

Current and future racecards use a separate ingestion path from historical results. The importer reads the public dated racecards page, filters to UK and Ireland meetings with the same country helper as results, then fetches individual racecard pages for full runner data.

```bash
bun run sl:import-racecards YYYY-MM-DD --request-delay-seconds 2
bun run sl:racecard-status YYYY-MM-DD
```

Racecard provenance is stored in `source_imports` as `racecard-index-next-data` and `racecard-next-data`. Existing racecard payloads are skipped by default on rerun; use `--refresh-existing-racecards` only when you intentionally want to refresh declarations, weights, jockeys, non-runner state, or live odds.

Racecard imports create or update the same normalized course, race, horse, trainer, jockey, and runner rows keyed by Sporting Life source IDs. They do not set result-only fields such as winning time, off time, finishing position, beaten distance, result comments, Racing Post ratings, or Topspeed ratings. If full results have already completed a race, an older racecard refresh preserves those completed result fields and final result odds.
