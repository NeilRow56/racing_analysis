#!/usr/bin/env python3
from __future__ import annotations

import os
import sys
from pathlib import Path

import psycopg
from dotenv import load_dotenv


REPO_ROOT = Path(__file__).resolve().parents[2]
RAW_OUTPUT_DIR = REPO_ROOT / "data" / "raw" / "racing-post"
PAGE_URL = "https://www.racingpost.com/results/1083/chelmsford-aw/2020-10-01/766341"

sys.path.insert(0, str(REPO_ROOT / "scraper"))

from racing_post.extract import fetch_full_result  # noqa: E402
from racing_post.importing import import_full_result, write_raw_payload  # noqa: E402


def main() -> None:
    load_dotenv(REPO_ROOT / ".env.local")
    database_url = os.getenv("DATABASE_URL")

    if not database_url:
        raise SystemExit("DATABASE_URL is required.")

    full_result = fetch_full_result(PAGE_URL)
    race = full_result.race_result

    raw_file = write_raw_payload(
        raw_dir=RAW_OUTPUT_DIR,
        race_date="2020-10-01",
        course_name=race["courseName"],
        race_id=str(race["raceId"]),
        payload_type="full-result-next-data-route-import",
        payload=full_result.payload,
    )

    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cursor:
            counts = import_full_result(cursor, payload=full_result.payload)

        connection.commit()

    print(f"RAW_PAYLOAD={raw_file}")
    print(f"SOURCE_IMPORT_ID={counts['source_import_id']}")
    print(
        "IMPORTED "
        f"courses=1 races=1 horses={counts['horses']} trainers={counts['trainers']} "
        f"jockeys={counts['jockeys']} runners={counts['runners']}"
    )


if __name__ == "__main__":
    main()
