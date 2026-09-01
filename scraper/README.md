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
