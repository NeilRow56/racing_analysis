#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

import psycopg
from dotenv import load_dotenv


REPO_ROOT = Path(__file__).resolve().parents[2]
RAW_OUTPUT_DIR = REPO_ROOT / "data" / "raw" / "sporting-life"

sys.path.insert(0, str(REPO_ROOT / "scraper"))

from sporting_life.extract import fetch_full_result  # noqa: E402
from sporting_life.importing import (  # noqa: E402
    decimal_odds,
    finishing_position,
    import_full_result,
    result_status,
    starting_price,
    write_raw_payload,
)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Refresh one Sporting Life race result when the completed payload is available.",
    )
    parser.add_argument("--url", required=True)
    parser.add_argument("--race-id", required=True)
    args = parser.parse_args()

    load_dotenv(REPO_ROOT / ".env.local")
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise SystemExit("DATABASE_URL is required.")

    try:
        full_result = fetch_full_result(args.url)
        race = full_result.race_payload
        if race is None:
            print_result("not_ready", "source payload does not contain a race")
            return

        race_summary = race.get("race_summary") or {}
        source_id = str((race_summary.get("race_summary_reference") or {}).get("id") or "")
        if source_id != str(args.race_id):
            print_result("failed", f"source race id mismatch: expected {args.race_id}, got {source_id}")
            return

        completeness = result_completeness(race)
        if completeness is not None:
            print_result("not_ready", completeness)
            return

        write_raw_payload(
            raw_dir=RAW_OUTPUT_DIR,
            race_date=str(race_summary["date"]),
            course_name=str(race_summary["course_name"]),
            race_id=source_id,
            payload_type="full-result-next-data",
            payload=full_result.payload,
        )
        with psycopg.connect(database_url) as connection:
            with connection.cursor() as cursor:
                counts = import_full_result(cursor, payload=full_result.payload)
            connection.commit()

        print_result("imported", f"runners={counts['runners']}")
    except Exception as error:
        print_result("failed", str(error))


def result_completeness(race: dict[str, Any]) -> str | None:
    race_summary = race.get("race_summary") or {}
    if not non_blank(race_summary.get("winning_time")):
        return "winning time is not available yet"

    rides = race.get("rides")
    if not isinstance(rides, list) or not rides:
        return "runner results are not available yet"

    statuses = [result_status(ride) for ride in rides if isinstance(ride, dict)]
    if len(statuses) != len(rides) or any(status is None for status in statuses):
        return "one or more runner outcomes are unavailable"

    if not any(isinstance(ride, dict) and finishing_position(ride) == 1 for ride in rides):
        return "winner is not available yet"

    for ride in rides:
        if not isinstance(ride, dict):
            return "malformed runner result"
        if result_status(ride) == "non_runner":
            continue
        if decimal_odds(starting_price(ride)) is None:
            return "one or more runner SP values are unavailable"

    return None


def print_result(status: str, message: str | None) -> None:
    print(f"REFRESH_RESULT {json.dumps({'status': status, 'message': message})}", flush=True)


def non_blank(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


if __name__ == "__main__":
    main()
