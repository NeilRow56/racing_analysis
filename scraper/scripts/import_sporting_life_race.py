#!/usr/bin/env python3
from __future__ import annotations

import os
import sys
from collections import Counter
from pathlib import Path
from typing import Any

import psycopg
from dotenv import load_dotenv


REPO_ROOT = Path(__file__).resolve().parents[2]
RAW_OUTPUT_DIR = REPO_ROOT / "data" / "raw" / "sporting-life"
PAGE_URL = "https://www.sportinglife.com/racing/results/2020-09-13/wolverhampton/588622/visit-attheraces-com-handicap-div-1"

sys.path.insert(0, str(REPO_ROOT / "scraper"))

from sporting_life.extract import fetch_full_result  # noqa: E402
from sporting_life.importing import (  # noqa: E402
    distance_yards,
    import_full_result,
    result_status,
    weight_lbs,
    write_raw_payload,
)


def main() -> None:
    load_dotenv(REPO_ROOT / ".env.local")
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise SystemExit("DATABASE_URL is required.")

    full_result = fetch_full_result(PAGE_URL)
    race = full_result.race
    race_summary = race["race_summary"]

    raw_file = write_raw_payload(
        raw_dir=RAW_OUTPUT_DIR,
        race_date=race_summary["date"],
        course_name=race_summary["course_name"],
        race_id=str(race_summary["race_summary_reference"]["id"]),
        payload_type="full-result-next-data",
        payload=full_result.payload,
    )

    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cursor:
            counts = import_full_result(cursor, payload=full_result.payload)
        connection.commit()

    observations = observe_race(race)
    print(f"RAW_PAYLOAD={raw_file}")
    print(f"SOURCE_IMPORT_ID={counts['source_import_id']}")
    print(
        "IMPORTED "
        f"courses=1 races=1 horses={counts['horses']} trainers={counts['trainers']} "
        f"jockeys={counts['jockeys']} runners={counts['runners']}"
    )
    print(f"DISTANCE={race_summary.get('distance')} DISTANCE_YARDS={distance_yards(race_summary.get('distance'))}")
    print(observations)


def observe_race(race: dict[str, Any]) -> str:
    rides = race.get("rides", [])
    statuses = Counter(result_status(ride) for ride in rides)
    raw_statuses = Counter(
        (ride.get("casualty") or {}).get("type")
        or (str(ride.get("finish_position")) if isinstance(ride.get("finish_position"), int) else ride.get("ride_status"))
        for ride in rides
    )
    favourites = Counter(
        ((ride.get("betting") or {}).get("favourite") or {}).get("betting_favourite")
        for ride in rides
        if ((ride.get("betting") or {}).get("favourite") or {}).get("betting_favourite")
    )
    weights = {ride.get("handicap"): weight_lbs(ride.get("handicap")) for ride in rides}
    or_count = sum(1 for ride in rides if ride.get("official_rating") is not None)
    sp_count = sum(1 for ride in rides if (ride.get("betting") or {}).get("current_odds"))
    comment_count = sum(1 for ride in rides if ride.get("ride_description"))
    unmapped = Counter(
        raw_status
        for ride in rides
        for raw_status in [result_status(ride)]
        if raw_status == "other"
    )
    return "\n".join(
        [
            "FIELD_OBSERVATIONS",
            f"result_statuses={dict(statuses)}",
            f"raw_outcomes={dict(raw_statuses)}",
            f"unmapped_result_statuses={dict(unmapped)}",
            f"favourite_markers={dict(favourites)}",
            f"weights={weights}",
            f"coverage=OR {or_count}/{len(rides)}; SP {sp_count}/{len(rides)}; comments {comment_count}/{len(rides)}",
        ],
    )


if __name__ == "__main__":
    main()
