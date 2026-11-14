#!/usr/bin/env python3
"""Refresh explicit live statuses only. Never import cards or touch research ledgers."""
from __future__ import annotations

import argparse
import os
import sys
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Callable
from zoneinfo import ZoneInfo

import psycopg
from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scraper"))

from db_typing import ImportCursor  # noqa: E402
from sporting_life.client import SportingLifeClient, TextClient  # noqa: E402
from sporting_life.extract import discover_uk_ire_racecard_links, fetch_racecard, fetch_racecards_index  # noqa: E402
from sporting_life.importing import FULL_RESULT_SOURCE_TYPE, SOURCE, racecard_result_status  # noqa: E402
from import_sporting_life_racecards import fetch_with_conservative_retries, refreshable_prerace_summary  # noqa: E402


def reconcile_race_statuses(cursor: ImportCursor, race: dict[str, Any], race_date: date, now: datetime) -> int:
    summary = race["race_summary"]
    if summary["date"] != race_date.isoformat():
        raise ValueError("Racecard status date mismatch")
    if not refreshable_prerace_summary(summary, now):
        return 0  # Already-off/unknown stages belong to the normal results importer.
    source_id = str(summary["race_summary_reference"]["id"])
    # Validate the entire explicit update set before touching canonical status.
    updates: list[tuple[str, str | None]] = []
    seen: set[str] = set()
    for ride in race["rides"]:
        ride_id = str(ride["ride_reference"]["id"])
        if ride_id in seen:
            raise ValueError("Duplicate ride in racecard status payload")
        seen.add(ride_id)
        raw = str(ride.get("ride_status") or "").upper()
        status = racecard_result_status(ride)
        if raw == "RUNNER" or status == "non_runner":
            updates.append((ride_id, status))
    # Serialize with race/result upserts; never clear a legitimate result status.
    cursor.execute(
        """
        select r.id from races r
        where r.source = %s and r.source_id = %s and r.race_date = %s
          and r.race_datetime > %s and r.off_time is null
          and nullif(trim(r.winning_time), '') is null
          and not exists (
              select 1 from source_imports si
              where si.source = r.source and si.source_id = r.source_id and si.source_type = %s
          )
        for update
        """,
        (SOURCE, source_id, race_date, now, FULL_RESULT_SOURCE_TYPE),
    )
    locked = cursor.fetchone()
    if locked is None:
        return 0
    changed = 0
    for ride_id, status in updates:
        cursor.execute(
            """
            update race_runners set result_status = %s
            where source = %s and source_id = %s and race_id = %s
              and finishing_position is null
              and (result_status is null or result_status = 'non_runner')
              and result_status is distinct from %s
            returning id
            """,
            (status, SOURCE, ride_id, locked[0], status),
        )
        changed += cursor.fetchone() is not None
    return changed


def refresh_today_statuses(*, race_date: date, database_url: str, client: TextClient | None = None,
                          now: Callable[[], datetime] = lambda: datetime.now(timezone.utc)) -> int:
    if race_date != now().astimezone(ZoneInfo("Europe/London")).date():
        raise ValueError("Status refresh is restricted to TODAY in Europe/London; no backfill")
    client = client or SportingLifeClient(request_delay_seconds=2)
    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute("select source_id from races where source = %s and race_date = %s", (SOURCE, race_date))
            known = {str(row[0]) for row in cursor.fetchall()}
        connection.commit()
        if not known:
            print("STATUS_REFRESH races=0 changed=0 (no local cards)")
            return 0
        index = fetch_with_conservative_retries(lambda: fetch_racecards_index(race_date, client), url="racecards index")
        links = discover_uk_ire_racecard_links(index)
        if any(link.race_date != race_date.isoformat() for link in links):
            raise ValueError("Racecard status index date mismatch")
        changed = fetched = deferred = 0
        for link in links:
            if link.race_id not in known:
                continue
            if not refreshable_prerace_summary({"date": link.race_date, "time": link.race_time,
                                               "race_stage": link.race_stage}, now()):
                deferred += 1
                continue
            card = fetch_with_conservative_retries(lambda: fetch_racecard(link.url, client), url=link.url)
            race = card.race_payload
            if race is None or str(race["race_summary"]["race_summary_reference"]["id"]) != link.race_id:
                raise ValueError("Racecard status detail identity mismatch")
            with connection.cursor() as cursor:
                changed += reconcile_race_statuses(cursor, race, race_date, now())
            connection.commit()
            fetched += 1
        print(f"STATUS_REFRESH races={fetched} changed={changed} deferred_to_results={deferred}")
        return changed


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("race_date", nargs="?", type=date.fromisoformat,
                        default=datetime.now(ZoneInfo("Europe/London")).date())
    args = parser.parse_args()
    load_dotenv(REPO_ROOT / ".env.local")
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise SystemExit("DATABASE_URL is required")
    refresh_today_statuses(race_date=args.race_date, database_url=database_url)


if __name__ == "__main__":
    from operational_lock import guard_cli

    guard_cli("python:refresh_today_runner_status")
    main()
