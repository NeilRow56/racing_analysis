#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import sys
import time
from collections import Counter
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

import psycopg
from dotenv import load_dotenv


REPO_ROOT = Path(__file__).resolve().parents[2]
RAW_OUTPUT_DIR = REPO_ROOT / "data" / "raw" / "sporting-life"

sys.path.insert(0, str(REPO_ROOT / "scraper"))

from sporting_life.client import SportingLifeClient  # noqa: E402
from sporting_life.extract import (  # noqa: E402
    RacecardLink,
    discover_uk_ire_racecard_links,
    fetch_racecard,
    fetch_racecards_index,
)
from sporting_life.importing import (  # noqa: E402
    RACECARD_SOURCE_TYPE,
    SOURCE,
    import_racecard,
    import_racecards_index,
    write_raw_payload,
)


@dataclass
class RacecardImportResult:
    race_date: date
    discovered_links: list[RacecardLink]
    imported_links: list[RacecardLink]
    skipped_existing: int
    raw_files: int
    totals: Counter[str]
    elapsed_seconds: float


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Import one current/future UK & Ireland Sporting Life racecard day.",
    )
    parser.add_argument("race_date", type=date.fromisoformat, help="Race date as YYYY-MM-DD.")
    parser.add_argument(
        "--request-delay-seconds",
        type=float,
        default=None,
        help="Delay between Sporting Life HTTP requests. Defaults to SL_REQUEST_DELAY_SECONDS or 2.0.",
    )
    parser.add_argument(
        "--refresh-existing-racecards",
        action="store_true",
        help="Refetch racecard pages already recorded in source_imports.",
    )
    args = parser.parse_args()

    load_dotenv(REPO_ROOT / ".env.local")
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise SystemExit("DATABASE_URL is required.")

    result = import_sporting_life_racecards(
        race_date=args.race_date,
        database_url=database_url,
        request_delay_seconds=args.request_delay_seconds,
        refresh_existing_racecards=args.refresh_existing_racecards,
    )
    print_import_result(result)


def import_sporting_life_racecards(
    *,
    race_date: date,
    database_url: str,
    request_delay_seconds: float | None = None,
    refresh_existing_racecards: bool = False,
    client: SportingLifeClient | None = None,
) -> RacecardImportResult:
    started_at = time.monotonic()
    delay = request_delay_seconds if request_delay_seconds is not None else 2.0
    client = client or SportingLifeClient(request_delay_seconds=delay)
    index = fetch_racecards_index(race_date, client)
    links = discover_uk_ire_racecard_links(index)

    write_raw_payload(
        raw_dir=RAW_OUTPUT_DIR,
        race_date=race_date.isoformat(),
        course_name="racecards-index",
        race_id=race_date.isoformat(),
        payload_type="racecard-index-next-data",
        payload=index.payload,
    )

    totals: Counter[str] = Counter()
    imported_links: list[RacecardLink] = []
    skipped_existing = 0
    raw_files = 1

    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cursor:
            import_racecards_index(
                cursor,
                race_date=race_date.isoformat(),
                payload=index.payload,
            )
        connection.commit()

        if not links:
            print(f"NO_UK_IRE_RACECARDS date={race_date.isoformat()}", flush=True)
            return RacecardImportResult(
                race_date=race_date,
                discovered_links=links,
                imported_links=imported_links,
                skipped_existing=skipped_existing,
                raw_files=raw_files,
                totals=totals,
                elapsed_seconds=time.monotonic() - started_at,
            )

        for link in links:
            with connection.cursor() as cursor:
                if not refresh_existing_racecards and racecard_source_import_exists(
                    cursor,
                    link.race_id,
                ):
                    skipped_existing += 1
                    print(
                        "RACECARD_SKIPPED_EXISTING "
                        f"course={link.course_name!r} time={link.race_time} race_id={link.race_id}",
                        flush=True,
                    )
                    continue

            try:
                racecard = fetch_racecard(link.url, client)
            except Exception:
                print(f"REQUEST_FAILED url={link.url}", flush=True)
                raise

            race = racecard.race_payload
            if race is None:
                print(
                    "RACECARD_SKIPPED "
                    f"reason=no_race_payload course={link.course_name!r} "
                    f"time={link.race_time} race_id={link.race_id} url={link.url}",
                    flush=True,
                )
                continue

            race_summary = race["race_summary"]
            write_raw_payload(
                raw_dir=RAW_OUTPUT_DIR,
                race_date=race_summary["date"],
                course_name=race_summary["course_name"],
                race_id=str(race_summary["race_summary_reference"]["id"]),
                payload_type="racecard-next-data",
                payload=racecard.payload,
            )
            raw_files += 1

            with connection.cursor() as cursor:
                counts = import_racecard(cursor, payload=racecard.payload)
            connection.commit()
            imported_links.append(link)
            for key in ("courses", "races", "horses", "trainers", "jockeys", "runners"):
                totals[key] += int(counts[key])
            print(
                "RACECARD_IMPORTED "
                f"course={link.course_name!r} time={link.race_time} "
                f"race_id={link.race_id} runners={len(race.get('rides', []))}",
                flush=True,
            )

    return RacecardImportResult(
        race_date=race_date,
        discovered_links=links,
        imported_links=imported_links,
        skipped_existing=skipped_existing,
        raw_files=raw_files,
        totals=totals,
        elapsed_seconds=time.monotonic() - started_at,
    )


def racecard_source_import_exists(cursor: psycopg.Cursor, race_id: str) -> bool:
    cursor.execute(
        """
        select 1
        from source_imports
        where source = %s
          and source_type = %s
          and source_id = %s
        limit 1
        """,
        (SOURCE, RACECARD_SOURCE_TYPE, race_id),
    )
    return cursor.fetchone() is not None


def print_import_result(result: RacecardImportResult) -> None:
    print(f"DATE={result.race_date.isoformat()}")
    print(
        "DISCOVERED_MEETINGS="
        + ", ".join(
            f"{link.course_name}({link.meeting_id}/{link.course_id})"
            for link in distinct_meeting_links(result.discovered_links)
        ),
    )
    print(f"DISCOVERED_RACES={len(result.discovered_links)}")
    print(f"IMPORTED_RACECARDS={len(result.imported_links)}")
    print(f"SKIPPED_EXISTING_RACECARDS={result.skipped_existing}")
    print(f"RAW_FILES={result.raw_files}")
    print(
        "UPSERT_ATTEMPTS "
        f"courses={result.totals['courses']} races={result.totals['races']} "
        f"horses={result.totals['horses']} trainers={result.totals['trainers']} "
        f"jockeys={result.totals['jockeys']} runners={result.totals['runners']}"
    )
    print(f"ELAPSED_SECONDS={result.elapsed_seconds:.1f}")


def distinct_meeting_links(links: list[RacecardLink]) -> list[RacecardLink]:
    seen: set[str] = set()
    distinct: list[RacecardLink] = []
    for link in links:
        if link.meeting_id in seen:
            continue
        seen.add(link.meeting_id)
        distinct.append(link)
    return distinct


if __name__ == "__main__":
    main()
