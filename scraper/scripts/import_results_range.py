#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import sys
import time
from collections import Counter
from datetime import date, timedelta
from pathlib import Path

from dotenv import load_dotenv


REPO_ROOT = Path(__file__).resolve().parents[2]

sys.path.insert(0, str(REPO_ROOT / "scraper"))
sys.path.insert(0, str(REPO_ROOT / "scraper" / "scripts"))

from import_results_day import import_results_day  # noqa: E402
from racing_post.client import RacingPostClient  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Import historical UK Racing Post results for an inclusive date range.",
    )
    parser.add_argument("start_date", type=date.fromisoformat)
    parser.add_argument("end_date", type=date.fromisoformat)
    parser.add_argument(
        "--request-delay-seconds",
        type=float,
        default=None,
        help="Delay between Racing Post HTTP requests. Defaults to RP_REQUEST_DELAY_SECONDS or 0.75.",
    )
    parser.add_argument(
        "--refetch-existing-full-results",
        action="store_true",
        help="Fetch and upsert full-result payloads even when source_imports already has them.",
    )
    args = parser.parse_args()

    if args.end_date < args.start_date:
        raise SystemExit("end_date must be on or after start_date.")

    load_dotenv(REPO_ROOT / ".env.local")
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise SystemExit("DATABASE_URL is required.")

    started_at = time.monotonic()
    client = RacingPostClient(request_delay_seconds=args.request_delay_seconds)
    totals: Counter[str] = Counter()
    successful_dates: list[date] = []
    failed_dates: list[tuple[date, str]] = []

    print(f"RANGE_START={args.start_date.isoformat()}", flush=True)
    print(f"RANGE_END={args.end_date.isoformat()}", flush=True)
    print(
        f"SKIP_EXISTING_FULL_RESULTS={not args.refetch_existing_full_results}",
        flush=True,
    )

    for current_date in dates_between(args.start_date, args.end_date):
        try:
            result = import_results_day(
                race_date=current_date,
                database_url=database_url,
                request_delay_seconds=args.request_delay_seconds,
                skip_existing_full_results=not args.refetch_existing_full_results,
                client=client,
            )
        except Exception as error:
            message = f"{type(error).__name__}: {error}"
            failed_dates.append((current_date, message))
            print(
                f"DATE_FAILED date={current_date.isoformat()} error={message}",
                flush=True,
            )
            break

        successful_dates.append(current_date)
        totals.update(result.totals)
        print(
            "DATE_IMPORTED "
            f"date={current_date.isoformat()} meetings={result.uk_meetings} "
            f"races={result.full_results} skipped_full_results={result.skipped_full_results} "
            f"upserted_runners={result.totals['runners']}",
            flush=True,
        )

    elapsed_seconds = time.monotonic() - started_at
    print("RANGE_SUMMARY", flush=True)
    print(f"SUCCESSFUL_DATES={len(successful_dates)}", flush=True)
    if successful_dates:
        print(
            "SUCCESSFUL_DATE_LIST="
            + ",".join(day.isoformat() for day in successful_dates),
            flush=True,
        )
    print(f"FAILED_DATES={len(failed_dates)}", flush=True)
    for failed_date, message in failed_dates:
        print(f"FAILED_DATE date={failed_date.isoformat()} error={message}", flush=True)
    print(
        "UPSERT_ATTEMPTS "
        f"courses={totals['courses']} races={totals['races']} horses={totals['horses']} "
        f"trainers={totals['trainers']} jockeys={totals['jockeys']} runners={totals['runners']}",
        flush=True,
    )
    print(f"ELAPSED_SECONDS={elapsed_seconds:.1f}", flush=True)

    if failed_dates:
        raise SystemExit(1)


def dates_between(start_date: date, end_date: date):
    current = start_date
    while current <= end_date:
        yield current
        current += timedelta(days=1)


if __name__ == "__main__":
    main()
