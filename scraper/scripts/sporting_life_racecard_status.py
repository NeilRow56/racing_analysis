#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import sys
from collections import Counter
from datetime import date
from pathlib import Path

import psycopg
from dotenv import load_dotenv


REPO_ROOT = Path(__file__).resolve().parents[2]

sys.path.insert(0, str(REPO_ROOT / "scraper"))

from sporting_life.extract import is_uk_or_ireland_country_alias  # noqa: E402
from sporting_life.importing import (  # noqa: E402
    RACECARD_INDEX_SOURCE_TYPE,
    RACECARD_SOURCE_TYPE,
    SOURCE,
)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Summarize locally imported Sporting Life racecards without making external requests.",
    )
    parser.add_argument("race_date", type=date.fromisoformat, help="Race date as YYYY-MM-DD.")
    args = parser.parse_args()

    load_dotenv(REPO_ROOT / ".env.local")
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise SystemExit("DATABASE_URL is required.")

    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cursor:
            for line in build_report(cursor, args.race_date):
                print(line)


def build_report(cursor: psycopg.Cursor, race_date: date) -> list[str]:
    cursor.execute(
        """
        with racecard_races as (
            select r.*, c.display_name as course_name, c.country
            from races r
            join courses c on c.id = r.course_id
            join source_imports si
              on si.source = r.source
             and si.source_type = %s
             and si.source_id = r.source_id
            where r.source = %s
              and r.race_date = %s
        ),
        racecard_runners as (
            select rr.*
            from race_runners rr
            join racecard_races r on r.id = rr.race_id
        )
        select
            count(distinct r.id),
            count(distinct r.course_id),
            count(rr.id),
            sum((rr.official_rating is not null)::int),
            sum((rr.weight_carried_lbs is not null)::int),
            sum((rr.draw is not null)::int),
            sum((rr.starting_price is not null and btrim(rr.starting_price) <> '')::int),
            sum((rr.result_status = 'non_runner')::int),
            count(distinct case
                when r.winning_time is not null and btrim(r.winning_time) <> ''
                then r.id
            end)
        from racecard_races r
        left join racecard_runners rr on rr.race_id = r.id
        """,
        (RACECARD_SOURCE_TYPE, SOURCE, race_date),
    )
    (
        races,
        meetings,
        runners,
        official_ratings,
        weights,
        draws,
        odds,
        non_runners,
        completed_race_rows,
    ) = cursor.fetchone()

    cursor.execute(
        """
        select count(*)
        from source_imports
        where source = %s
          and source_type = %s
          and source_id = %s
        """,
        (SOURCE, RACECARD_INDEX_SOURCE_TYPE, race_date.isoformat()),
    )
    index_imports = cursor.fetchone()[0]

    cursor.execute(
        """
        select c.display_name, c.country, count(distinct r.id), count(rr.id)
        from races r
        join courses c on c.id = r.course_id
        join source_imports si
          on si.source = r.source
         and si.source_type = %s
         and si.source_id = r.source_id
        left join race_runners rr on rr.race_id = r.id
        where r.source = %s
          and r.race_date = %s
        group by c.display_name, c.country
        order by c.display_name
        """,
        (RACECARD_SOURCE_TYPE, SOURCE, race_date),
    )
    course_rows = cursor.fetchall()

    cursor.execute(
        """
        select count(*)
        from races r
        where r.source = %s
          and r.race_date = %s
          and not exists (
              select 1
              from source_imports si
              where si.source = r.source
                and si.source_type = %s
                and si.source_id = r.source_id
          )
        """,
        (SOURCE, race_date, RACECARD_SOURCE_TYPE),
    )
    missing_racecard_payloads = cursor.fetchone()[0]

    uk_ire_course_rows = [
        row for row in course_rows if is_uk_or_ireland_country_alias(row[1])
    ]
    country_counts: Counter[str] = Counter()
    for _, country, count, _ in course_rows:
        country_counts[country or "missing"] += count

    label = race_date.isoformat()
    return [
        f"SPORTING_LIFE_RACECARD_STATUS {label}",
        f"racecard_index_source_imports={index_imports}",
        f"meetings={meetings or 0} races={races or 0} runners={runners or 0}",
        f"uk_ire_meetings={len(uk_ire_course_rows)} countries={dict(country_counts)}",
        "coverage "
        f"OR={coverage(official_ratings, runners)} "
        f"weight={coverage(weights, runners)} "
        f"draw={coverage(draws, runners)} "
        f"odds={coverage(odds, runners)} "
        f"non_runners={non_runners or 0}",
        f"completed_result_rows={completed_race_rows or 0}",
        f"missing_racecard_payloads={missing_racecard_payloads or 0}",
        "courses="
        + ", ".join(
            f"{course}({country or '-'}) races={race_count} runners={runner_count}"
            for course, country, race_count, runner_count in course_rows
        ),
    ]


def coverage(count: int | None, total: int | None) -> str:
    numerator = count or 0
    denominator = total or 0
    if denominator == 0:
        return "0/0 (-)"
    return f"{numerator}/{denominator} ({(numerator / denominator) * 100:.1f}%)"


if __name__ == "__main__":
    main()
