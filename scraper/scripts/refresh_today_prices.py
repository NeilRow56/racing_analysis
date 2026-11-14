#!/usr/bin/env python3
"""Prices-only overlay; never import cards, capture research, or settle results."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import sys
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Callable
from zoneinfo import ZoneInfo

import psycopg
from psycopg.types.json import Jsonb
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT / "scraper"), str(ROOT / "scraper/scripts")]
from sporting_life.client import SportingLifeClient, TextClient  # noqa: E402
from sporting_life.extract import fetch_racecard, fetch_racecards_index, discover_uk_ire_racecard_links  # noqa: E402
from sporting_life.importing import parse_race_datetime  # noqa: E402
from import_sporting_life_racecards import PRE_RACE_STAGES  # noqa: E402

MAX_AGE_SECONDS = 300
LOCK_KEY = 726129451


def validate_prices(race: dict[str, Any], original: dict[str, Any], source_id: str,
                    race_date: date, off: datetime, retrieved: datetime, now: datetime) -> dict[str, Any]:
    if race_date != now.astimezone(ZoneInfo("Europe/London")).date():
        raise ValueError("not today in Europe/London")
    if not 0 <= (now - retrieved).total_seconds() <= MAX_AGE_SECONDS:
        raise ValueError("stale or future retrieval")
    for card in (race, original):
        summary = card["race_summary"]
        if str(summary["race_summary_reference"]["id"]) != source_id or summary["date"] != race_date.isoformat():
            raise ValueError("race identity/date mismatch")
        if summary.get("race_stage") not in PRE_RACE_STAGES:
            raise ValueError("unknown or started race status")
        if parse_race_datetime(summary["date"], summary.get("time")) != off or off <= now:
            raise ValueError("inconsistent or past scheduled off-time")

    def identities(card: dict[str, Any]) -> dict[str, str]:
        rides = card["rides"]
        result = {str(r["ride_reference"]["id"]): str(r["horse"]["horse_reference"]["id"]) for r in rides}
        if not result or len(result) != len(rides) or len(set(result.values())) != len(result) or any(x in {"", "None"} for pair in result.items() for x in pair):
            raise ValueError("incomplete or duplicate runner identities")
        return result

    ids = identities(race)
    if ids != identities(original):
        raise ValueError("runner identity mismatch")
    original_statuses = {str(r["ride_reference"]["id"]): runner_status(r) for r in original["rides"]}
    runners = []
    for ride in race["rides"]:
        if ride.get("ride_status") not in {"RUNNER", "NONRUNNER", "NON_RUNNER"}:
            raise ValueError("unknown runner status")
        if runner_status(ride) != original_statuses[str(ride["ride_reference"]["id"])]:
            raise ValueError("runner status changed; prices-only refresh cannot reconcile declarations")
        quotes = ride["bookmakerOdds"]  # Absent array is an incomplete response, not an unpriced runner.
        if not isinstance(quotes, list):
            raise ValueError("incomplete bookmaker arrays")
        seen: set[str] = set()
        for quote in quotes:
            price = float(quote.get("decimalOdds", quote.get("decimalOddsString", "nan")))
            book = str(quote.get("bookmakerId") or quote.get("bookmakerName") or "")
            if not book or book in seen or not math.isfinite(price) or price <= 1:
                raise ValueError("invalid or duplicate bookmaker quote")
            seen.add(book)
        runner_id = str(ride["ride_reference"]["id"])
        runners.append({"runnerSourceId": runner_id, "horseSourceId": ids[runner_id],
                        "runnerStatus": runner_status(ride), "bookmakerOdds": quotes, "available": bool(quotes)})
    return {"raceSourceId": source_id, "raceDate": race_date.isoformat(), "off": off.isoformat(),
            "raceStage": race["race_summary"]["race_stage"], "runners": runners}


def runner_status(ride: dict[str, Any]) -> str | None:
    raw = ride.get("ride_status")
    if raw not in {"RUNNER", "NONRUNNER", "NON_RUNNER"}:
        raise ValueError("unknown runner status")
    return None if raw == "RUNNER" else "non_runner"


# The same read is repeated under row locks before each overlay write. No canonical UPDATE exists here.
def read_card(cursor: psycopg.Cursor[Any], source_id: str, race_date: date, *, lock: bool = False) -> Any:
    query = """
        select r.id, r.race_datetime, si.id, si.fetched_at, md5(si.payload::text),
               si.payload #> '{props,pageProps,race}', r.off_time, r.winning_time
        from races r join source_imports si on si.source = r.source and si.source_id = r.source_id
          and si.source_type = 'racecard-next-data'
        where r.source = 'sporting_life' and r.source_id = %s and r.race_date = %s
          and not exists (select 1 from source_imports result where result.source = r.source
             and result.source_id = r.source_id and result.source_type = 'full-result-next-data')
    """
    cursor.execute(query + (" for update of r, si" if lock else ""), (source_id, race_date))
    row = cursor.fetchone()
    if row is None or row[6] is not None or row[7]:
        raise ValueError("missing original card or race already started/completed")
    cursor.execute("""select rr.source_id, h.source_id, rr.finishing_position, rr.result_status
        from race_runners rr join horses h on h.id = rr.horse_id
        where rr.race_id = %s and rr.source = 'sporting_life' and h.source = 'sporting_life'
        """ + (" for update of rr, h" if lock else ""), (row[0],))
    runners = cursor.fetchall()
    original_ids = {str(r["ride_reference"]["id"]): str(r["horse"]["horse_reference"]["id"]) for r in row[5]["rides"]}
    if len(runners) != len(original_ids) or {str(r[0]): str(r[1]) for r in runners} != original_ids:
        raise ValueError("stored runner identities mismatch")
    original_statuses = {str(r["ride_reference"]["id"]): runner_status(r) for r in row[5]["rides"]}
    if any(r[3] != original_statuses[str(r[0])] for r in runners):
        raise ValueError("stored runner status differs from original card")
    if any(r[2] is not None or r[3] not in (None, "non_runner") for r in runners):
        raise ValueError("stored runner has result")
    return row


def refresh_prices(*, database_url: str, race_date: date, dry_run: bool = False,
                   client: TextClient | None = None,
                   now: Callable[[], datetime] = lambda: datetime.now(timezone.utc)) -> None:
    if race_date != now().astimezone(ZoneInfo("Europe/London")).date():
        raise ValueError("prices refresh requires today in Europe/London")
    client = client or SportingLifeClient(request_delay_seconds=2)
    with psycopg.connect(database_url, autocommit=True) as connection:
        with connection.cursor() as cursor:
            if dry_run:
                cursor.execute("set default_transaction_read_only = on")
            cursor.execute("select pg_try_advisory_lock(%s)", (LOCK_KEY,))
            locked = cursor.fetchone()
            if not locked or not locked[0]:
                raise RuntimeError("another prices refresh is running")
            cursor.execute("select source_id from races where source = 'sporting_life' and race_date = %s", (race_date,))
            known = {str(r[0]) for r in cursor.fetchall()}
            if not known:
                print("PRICES_SUMMARY eligible=0 quotes=0 updated=0 skipped=0")
                return
            links = discover_uk_ire_racecard_links(fetch_racecards_index(race_date, client))
            counts = dict(eligible=0, quotes=0, updated=0, skipped=0)
            for source_id in sorted(known):
                try:
                    matches = [link for link in links if link.race_id == source_id]
                    if len(matches) != 1:
                        raise ValueError("missing/duplicate race in source index")
                    link = matches[0]
                    row = read_card(cursor, source_id, race_date)
                    off = row[1]
                    if link.race_date != race_date.isoformat() or link.race_stage not in PRE_RACE_STAGES or parse_race_datetime(link.race_date, link.race_time) != off or off <= now():
                        raise ValueError("index status/date/off-time ineligible")
                    card = fetch_racecard(link.url, client).race_payload
                    retrieved = now()  # Actual completed retrieval, never the import timestamp.
                    if card is None:
                        raise ValueError("incomplete source response")
                    if row[3] > retrieved:
                        raise ValueError("original import timestamp is in the future")
                    payload = validate_prices(card, row[5], source_id, race_date, off, retrieved, now())
                    quotes = sum(len(r["bookmakerOdds"]) for r in payload["runners"])
                    counts["eligible"] += 1
                    counts["quotes"] += quotes
                    print(f"PRICES_ELIGIBLE race={source_id} quotes={quotes} retrieved_at={retrieved.isoformat()} dry_run={dry_run}")
                    if dry_run:
                        continue
                    with connection.transaction():
                        current = read_card(cursor, source_id, race_date, lock=True)
                        if tuple(current[:5]) != tuple(row[:5]):
                            raise ValueError("original card changed during retrieval")
                        payload = validate_prices(card, current[5], source_id, race_date, current[1], retrieved, now())
                        digest = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
                        cursor.execute("""
                            insert into race_current_prices (race_id, source, source_id, original_import_id,
                                original_fetched_at, original_payload_hash, retrieved_at, scheduled_off, payload, price_hash)
                            select %s, 'sporting_life', %s, %s, %s, %s, %s, %s, %s, %s
                            where %s > clock_timestamp() and %s <= clock_timestamp()
                              and %s >= clock_timestamp() - interval '5 minutes'
                              and %s = (clock_timestamp() at time zone 'Europe/London')::date
                            on conflict (race_id) do update set retrieved_at = excluded.retrieved_at,
                                scheduled_off = excluded.scheduled_off, payload = excluded.payload, price_hash = excluded.price_hash,
                                original_import_id = excluded.original_import_id, original_fetched_at = excluded.original_fetched_at,
                                original_payload_hash = excluded.original_payload_hash
                            where race_current_prices.retrieved_at < excluded.retrieved_at
                              and (race_current_prices.price_hash <> excluded.price_hash
                                or race_current_prices.original_payload_hash <> excluded.original_payload_hash
                                or race_current_prices.retrieved_at < clock_timestamp() - interval '5 minutes')
                            returning retrieved_at
                        """, (row[0], source_id, row[2], row[3], row[4], retrieved, off, Jsonb(payload), digest,
                              off, retrieved, retrieved, race_date))
                        written = cursor.fetchone()
                        if written:
                            counts["updated"] += 1
                            print(f"PRICES_UPDATED race={source_id} retrieved_at={written[0].isoformat()}")
                        else:
                            counts["skipped"] += 1
                            print(f"PRICES_SKIPPED race={source_id} reason=duplicate_or_no_longer_eligible")
                except (ValueError, KeyError, TypeError, OverflowError) as error:
                    counts["skipped"] += 1
                    print(f"PRICES_SKIPPED race={source_id} reason={error}")
            print("PRICES_SUMMARY " + " ".join(f"{key}={value}" for key, value in counts.items()))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Read-only database session; retrieves source prices without storing them")
    args = parser.parse_args()
    load_dotenv(ROOT / ".env.local")
    database_url = os.environ["DATABASE_URL"]
    refresh_prices(database_url=database_url, race_date=datetime.now(ZoneInfo("Europe/London")).date(), dry_run=args.dry_run)


if __name__ == "__main__":
    from operational_lock import guard_cli

    guard_cli("python:refresh_today_prices")
    main()
