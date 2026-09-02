#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import sys
from datetime import date
from pathlib import Path
from typing import Any

import psycopg
from dotenv import load_dotenv


REPO_ROOT = Path(__file__).resolve().parents[2]
SOURCE = "sporting_life"
FULL_RESULT_SOURCE_TYPE = "full-result-next-data"
RESULTS_INDEX_SOURCE_TYPE = "results-index-next-data"


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Summarize locally imported Sporting Life results without making external requests.",
    )
    parser.add_argument("start_date", nargs="?", type=date.fromisoformat)
    parser.add_argument("end_date", nargs="?", type=date.fromisoformat)
    args = parser.parse_args()

    if (args.start_date is None) != (args.end_date is None):
        raise SystemExit("Provide both start_date and end_date, or neither.")
    if args.start_date and args.end_date and args.end_date < args.start_date:
        raise SystemExit("end_date must be on or after start_date.")

    load_dotenv(REPO_ROOT / ".env.local")
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise SystemExit("DATABASE_URL is required.")

    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cursor:
            report = build_report(cursor, args.start_date, args.end_date)

    for line in report:
        print(line)


def build_report(
    cursor: psycopg.Cursor,
    start_date: date | None,
    end_date: date | None,
) -> list[str]:
    params: list[Any] = []
    date_filter = ""
    if start_date and end_date:
        date_filter = "and r.race_date between %s and %s"
        params.extend([start_date, end_date])

    cursor.execute(
        f"""
        with scoped_races as (
            select r.id, r.source_id, r.race_date
            from races r
            where r.source = %s
            {date_filter}
        ),
        scoped_runners as (
            select rr.*
            from race_runners rr
            join scoped_races r on r.id = rr.race_id
        )
        select
            count(distinct race_date),
            min(race_date),
            max(race_date),
            count(distinct id),
            (select count(*) from scoped_runners),
            (select count(distinct horse_id) from scoped_runners),
            (select count(distinct trainer_id) from scoped_runners),
            (select count(distinct jockey_id) from scoped_runners)
        from scoped_races
        """,
        [SOURCE, *params],
    )
    (
        represented_dates,
        min_date,
        max_date,
        races,
        runners,
        horses,
        trainers,
        jockeys,
    ) = cursor.fetchone()

    cursor.execute(
        f"""
        with scoped_races as (
            select r.id, r.source_id, r.race_date, r.winning_time, r.distance_yards
            from races r
            where r.source = %s
            {date_filter}
        ),
        scoped_runners as (
            select rr.*
            from race_runners rr
            join scoped_races r on r.id = rr.race_id
        )
        select
            count(*),
            sum((official_rating is not null)::int),
            sum((starting_price is not null and btrim(starting_price) <> '')::int),
            sum((starting_price_decimal is not null)::int),
            sum((runner_comment is not null and btrim(runner_comment) <> '')::int),
            sum((weight_carried_lbs is not null)::int),
            sum((draw is not null)::int)
        from scoped_runners
        """,
        [SOURCE, *params],
    )
    (
        runner_rows,
        official_ratings,
        raw_sps,
        decimal_sps,
        comments,
        weights,
        draws,
    ) = cursor.fetchone()

    cursor.execute(
        f"""
        with scoped_races as (
            select r.id, r.source_id, r.race_date, r.winning_time, r.distance_yards
            from races r
            where r.source = %s
            {date_filter}
        )
        select
            count(*),
            sum((winning_time is not null and btrim(winning_time) <> '')::int),
            sum((distance_yards is not null)::int)
        from scoped_races
        """,
        [SOURCE, *params],
    )
    race_rows, winning_times, distance_yards = cursor.fetchone()

    cursor.execute(
        f"""
        with scoped_races as (
            select r.id, r.source_id, r.race_date
            from races r
            where r.source = %s
            {date_filter}
        )
        select count(*)
        from source_imports si
        where si.source = %s
          and (
            (
              si.source_type = %s
              and exists (
                select 1
                from scoped_races r
                where r.source_id = si.source_id
              )
            )
            or (
              si.source_type = %s
              and exists (
                select 1
                from scoped_races r
                where r.race_date::text = si.source_id
              )
            )
          )
        """,
        [
            SOURCE,
            *params,
            SOURCE,
            FULL_RESULT_SOURCE_TYPE,
            RESULTS_INDEX_SOURCE_TYPE,
        ],
    )
    source_imports = cursor.fetchone()[0]

    duplicate_counts = {
        "race_source_ids": duplicate_count(
            cursor,
            "select source_id from races where source = %s group by source_id having count(*) > 1",
            [SOURCE],
        ),
        "runner_source_ids": duplicate_count(
            cursor,
            "select source_id from race_runners where source = %s group by source_id having count(*) > 1",
            [SOURCE],
        ),
        "race_horse_rows": duplicate_count(
            cursor,
            """
            select rr.race_id, rr.horse_id
            from race_runners rr
            join races r on r.id = rr.race_id
            where rr.source = %s
            group by rr.race_id, rr.horse_id
            having count(*) > 1
            """,
            [SOURCE],
        ),
        "source_imports": duplicate_count(
            cursor,
            """
            select source, source_type, source_id
            from source_imports
            where source = %s
            group by source, source_type, source_id
            having count(*) > 1
            """,
            [SOURCE],
        ),
        "horse_source_ids": duplicate_count(
            cursor,
            "select source_id from horses where source = %s group by source_id having count(*) > 1",
            [SOURCE],
        ),
    }

    missing_source_ids = {
        "courses": scalar_count(cursor, "select count(*) from courses where source = %s and source_id is null", [SOURCE]),
        "races": scalar_count(cursor, "select count(*) from races where source = %s and source_id is null", [SOURCE]),
        "horses": scalar_count(cursor, "select count(*) from horses where source = %s and source_id is null", [SOURCE]),
        "trainers": scalar_count(cursor, "select count(*) from trainers where source = %s and source_id is null", [SOURCE]),
        "jockeys": scalar_count(cursor, "select count(*) from jockeys where source = %s and source_id is null", [SOURCE]),
        "runners": scalar_count(cursor, "select count(*) from race_runners where source = %s and source_id is null", [SOURCE]),
    }

    cursor.execute(
        f"""
        with scoped_races as (
            select r.id
            from races r
            where r.source = %s
            {date_filter}
        )
        select coalesce(result_status, 'missing'), count(*)
        from race_runners rr
        join scoped_races r on r.id = rr.race_id
        group by coalesce(result_status, 'missing')
        order by count(*) desc, coalesce(result_status, 'missing')
        """,
        [SOURCE, *params],
    )
    statuses = dict(cursor.fetchall())

    label = (
        f"{start_date.isoformat()}..{end_date.isoformat()}"
        if start_date and end_date
        else "all imported Sporting Life dates"
    )
    return [
        f"SPORTING_LIFE_IMPORT_STATUS {label}",
        f"dates_represented={represented_dates} min_date={min_date or '-'} max_date={max_date or '-'}",
        f"races={races} runners={runners} horses={horses} trainers={trainers} jockeys={jockeys}",
        f"source_imports={source_imports}",
        "coverage "
        f"winning_time={coverage(winning_times, race_rows)} "
        f"distance_yards={coverage(distance_yards, race_rows)} "
        f"OR={coverage(official_ratings, runner_rows)} "
        f"SP={coverage(raw_sps, runner_rows)} "
        f"decimal_SP={coverage(decimal_sps, runner_rows)} "
        f"comments={coverage(comments, runner_rows)} "
        f"weight={coverage(weights, runner_rows)} "
        f"draw={coverage(draws, runner_rows)}",
        f"result_statuses={statuses}",
        f"duplicates={duplicate_counts}",
        f"missing_source_ids={missing_source_ids}",
    ]


def duplicate_count(cursor: psycopg.Cursor, query: str, params: list[Any]) -> int:
    cursor.execute(f"select count(*) from ({query}) duplicates", params)
    return int(cursor.fetchone()[0])


def scalar_count(cursor: psycopg.Cursor, query: str, params: list[Any]) -> int:
    cursor.execute(query, params)
    return int(cursor.fetchone()[0])


def coverage(count: int | None, total: int | None) -> str:
    numerator = count or 0
    denominator = total or 0
    if denominator == 0:
        return "0/0 (-)"
    return f"{numerator}/{denominator} ({(numerator / denominator) * 100:.1f}%)"


if __name__ == "__main__":
    main()
