from __future__ import annotations

import json
import re
from datetime import datetime, time, timezone
from pathlib import Path
from typing import Any

import psycopg
from psycopg.types.json import Jsonb


SOURCE = "sporting_life"
FULL_RESULT_SOURCE_TYPE = "full-result-next-data"
RESULTS_INDEX_SOURCE_TYPE = "results-index-next-data"
NO_RACE_PAYLOAD_SOURCE_TYPE = "full-result-no-race-payload"


def write_raw_payload(
    *,
    raw_dir: Path,
    race_date: str,
    course_name: str,
    race_id: str,
    payload_type: str,
    payload: dict[str, Any],
) -> Path:
    raw_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{race_date}-{slugify(course_name)}-{race_id}-{payload_type}.json"
    path = raw_dir / filename
    path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    return path


def import_full_result(
    cursor: psycopg.Cursor,
    *,
    payload: dict[str, Any],
) -> dict[str, int | str]:
    page_props = payload["props"]["pageProps"]
    race = page_props["race"]
    race_summary = race["race_summary"]
    source_id = str(race_summary["race_summary_reference"]["id"])

    import_id = upsert_source_import(
        cursor=cursor,
        source_id=source_id,
        source_type=FULL_RESULT_SOURCE_TYPE,
        payload=payload,
    )
    course_id = upsert_course(cursor, page_props)
    race_row_id = upsert_race(cursor, race, page_props, course_id)
    counts = upsert_runners(cursor, race, race_row_id)

    return {
        "source_import_id": import_id,
        "courses": 1,
        "races": 1,
        **counts,
    }


def import_results_index(
    cursor: psycopg.Cursor,
    *,
    race_date: str,
    payload: dict[str, Any],
) -> str:
    return upsert_source_import(
        cursor=cursor,
        source_id=race_date,
        source_type=RESULTS_INDEX_SOURCE_TYPE,
        payload=payload,
    )


def import_no_race_payload(
    cursor: psycopg.Cursor,
    *,
    race_id: str,
    payload: dict[str, Any],
) -> str:
    return upsert_source_import(
        cursor=cursor,
        source_id=race_id,
        source_type=NO_RACE_PAYLOAD_SOURCE_TYPE,
        payload=payload,
    )


def upsert_source_import(
    *,
    cursor: psycopg.Cursor,
    source_id: str,
    source_type: str,
    payload: dict[str, Any],
) -> str:
    cursor.execute(
        """
        insert into source_imports (source, source_id, source_type, payload)
        values (%s, %s, %s, %s)
        on conflict (source, source_type, source_id)
        do update set payload = excluded.payload, fetched_at = now(), updated_at = now()
        returning id
        """,
        (SOURCE, source_id, source_type, Jsonb(payload)),
    )
    return str(cursor.fetchone()[0])


def upsert_course(cursor: psycopg.Cursor, page_props: dict[str, Any]) -> str:
    meeting_summary = page_props["meeting"][0]["meeting_summary"]
    course = meeting_summary["course"]
    source_id = str(course["course_reference"]["id"])
    display_name = course["name"]
    country = course.get("country", {}).get("short_name")

    cursor.execute(
        """
        insert into courses (source, source_id, display_name, normalized_name, country)
        values (%s, %s, %s, %s, %s)
        on conflict (source, source_id)
        do update set
            display_name = excluded.display_name,
            normalized_name = excluded.normalized_name,
            country = excluded.country,
            updated_at = now()
        returning id
        """,
        (SOURCE, source_id, display_name, normalize_name(display_name), country),
    )
    return str(cursor.fetchone()[0])


def upsert_race(
    cursor: psycopg.Cursor,
    race: dict[str, Any],
    page_props: dict[str, Any],
    course_id: str,
) -> str:
    race_summary = race["race_summary"]
    scheduled_time = parse_time(race_summary.get("time"))
    race_datetime = parse_race_datetime(race_summary["date"], race_summary.get("time"))
    local_race_datetime = parse_race_datetime(race_summary["date"], race_summary.get("time"))

    cursor.execute(
        """
        insert into races (
            source, source_id, race_date, course_id, scheduled_time, off_time,
            race_datetime, local_race_datetime, race_name, race_type, race_type_code,
            race_class, distance, distance_yards, going, declared_runner_count,
            actual_runner_count, winning_time
        )
        values (
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
        )
        on conflict (source, source_id)
        do update set
            race_date = excluded.race_date,
            course_id = excluded.course_id,
            scheduled_time = excluded.scheduled_time,
            off_time = excluded.off_time,
            race_datetime = excluded.race_datetime,
            local_race_datetime = excluded.local_race_datetime,
            race_name = excluded.race_name,
            race_type = excluded.race_type,
            race_type_code = excluded.race_type_code,
            race_class = excluded.race_class,
            distance = excluded.distance,
            distance_yards = excluded.distance_yards,
            going = excluded.going,
            declared_runner_count = excluded.declared_runner_count,
            actual_runner_count = excluded.actual_runner_count,
            winning_time = excluded.winning_time,
            updated_at = now()
        returning id
        """,
        (
            SOURCE,
            str(race_summary["race_summary_reference"]["id"]),
            race_summary["date"],
            course_id,
            scheduled_time,
            parse_time(race_summary.get("off_time")),
            race_datetime,
            local_race_datetime,
            race_summary.get("name"),
            race_type_from_summary(race_summary),
            None,
            race_summary.get("race_class"),
            race_summary.get("distance"),
            distance_yards(race_summary.get("distance")),
            race_summary.get("going"),
            race_summary.get("ride_count"),
            len(race.get("rides", [])),
            race_summary.get("winning_time"),
        ),
    )
    return str(cursor.fetchone()[0])


def upsert_runners(cursor: psycopg.Cursor, race: dict[str, Any], race_id: str) -> dict[str, int]:
    counts = {"horses": 0, "trainers": 0, "jockeys": 0, "runners": 0}
    race_source_id = str(race["race_summary"]["race_summary_reference"]["id"])

    for ride in race["rides"]:
        horse = ride["horse"]
        trainer = ride.get("trainer")
        jockey = ride.get("jockey")

        horse_id = upsert_named_entity(
            cursor,
            table="horses",
            source_id=str(horse["horse_reference"]["id"]),
            display_name=horse["name"],
        )
        trainer_id = (
            upsert_named_entity(
                cursor,
                table="trainers",
                source_id=str(trainer["business_reference"]["id"]),
                display_name=trainer["name"],
            )
            if trainer_reference_id(trainer) and trainer.get("name")
            else None
        )
        jockey_id = (
            upsert_named_entity(
                cursor,
                table="jockeys",
                source_id=str(jockey["person_reference"]["id"]),
                display_name=jockey["name"],
            )
            if jockey_reference_id(jockey) and jockey.get("name")
            else None
        )

        finishing_pos = finishing_position(ride)
        raw_status = raw_outcome_code(ride)

        cursor.execute(
            """
            insert into race_runners (
                source, source_id, race_id, horse_id, trainer_id, jockey_id,
                saddlecloth_number, finishing_position, finishing_status, result_status,
                outcome_code, runner_comment, draw, beaten_distance, beaten_distance_to_winner, weight,
                weight_carried_lbs, jockey_claim_lbs, headgear, official_rating,
                racing_post_rating, topspeed_rating, starting_price, starting_price_decimal,
                is_favourite, horse_age, horse_sex
            )
            values (
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
            )
            on conflict (source, source_id)
            do update set
                race_id = excluded.race_id,
                horse_id = excluded.horse_id,
                trainer_id = excluded.trainer_id,
                jockey_id = excluded.jockey_id,
                saddlecloth_number = excluded.saddlecloth_number,
                finishing_position = excluded.finishing_position,
                finishing_status = excluded.finishing_status,
                result_status = excluded.result_status,
                outcome_code = excluded.outcome_code,
                runner_comment = excluded.runner_comment,
                draw = excluded.draw,
                beaten_distance = excluded.beaten_distance,
                beaten_distance_to_winner = excluded.beaten_distance_to_winner,
                weight = excluded.weight,
                weight_carried_lbs = excluded.weight_carried_lbs,
                jockey_claim_lbs = excluded.jockey_claim_lbs,
                headgear = excluded.headgear,
                official_rating = excluded.official_rating,
                racing_post_rating = excluded.racing_post_rating,
                topspeed_rating = excluded.topspeed_rating,
                starting_price = excluded.starting_price,
                starting_price_decimal = excluded.starting_price_decimal,
                is_favourite = excluded.is_favourite,
                horse_age = excluded.horse_age,
                horse_sex = excluded.horse_sex,
                updated_at = now()
            """,
            (
                SOURCE,
                str(ride["ride_reference"]["id"]),
                race_id,
                horse_id,
                trainer_id,
                jockey_id,
                int_or_none(ride.get("cloth_number")),
                finishing_pos,
                raw_status,
                result_status(ride),
                raw_status,
                stripped(ride.get("ride_description")),
                int_or_none(ride.get("draw_number")),
                str_or_none(ride.get("finish_distance")),
                str_or_none(ride.get("finish_distance")),
                ride.get("handicap"),
                weight_lbs(ride.get("handicap")),
                None,
                format_headgear(ride.get("headgear")),
                int_or_none(ride.get("official_rating")),
                None,
                None,
                starting_price(ride),
                decimal_odds(starting_price(ride)),
                is_favourite(ride),
                int_or_none(horse.get("age")),
                horse.get("sex", {}).get("type"),
            ),
        )
        counts["horses"] += 1
        if trainer_id is not None:
            counts["trainers"] += 1
        if jockey_id is not None:
            counts["jockeys"] += 1
        counts["runners"] += 1

    return counts


def upsert_named_entity(
    cursor: psycopg.Cursor,
    *,
    table: str,
    source_id: str,
    display_name: str,
) -> str:
    if table not in {"horses", "trainers", "jockeys"}:
        raise ValueError(f"Unexpected entity table: {table}")

    cursor.execute(
        f"""
        insert into {table} (source, source_id, display_name, normalized_name)
        values (%s, %s, %s, %s)
        on conflict (source, source_id)
        do update set
            display_name = excluded.display_name,
            normalized_name = excluded.normalized_name,
            updated_at = now()
        returning id
        """,
        (SOURCE, source_id, display_name, normalize_name(display_name)),
    )
    return str(cursor.fetchone()[0])


def trainer_reference_id(trainer: dict[str, Any]) -> Any:
    return (trainer.get("business_reference") or {}).get("id")


def jockey_reference_id(jockey: dict[str, Any]) -> Any:
    return (jockey.get("person_reference") or {}).get("id")


def parse_race_datetime(race_date: str, race_time: str | None) -> datetime | None:
    parsed_time = parse_time(race_time)
    if parsed_time is None:
        return None
    return datetime.fromisoformat(f"{race_date}T{parsed_time.isoformat()}").replace(
        tzinfo=timezone.utc,
    )


def parse_time(value: str | None) -> time | None:
    if not value:
        return None
    for format_string in ("%H:%M:%S", "%H:%M"):
        try:
            return datetime.strptime(value, format_string).time()
        except ValueError:
            continue
    return None


def normalize_name(value: str) -> str:
    return " ".join(value.lower().split())


def race_type_from_summary(race_summary: dict[str, Any]) -> str | None:
    name = race_summary.get("name")
    if not isinstance(name, str):
        return None
    lowered = name.lower()
    for race_type in ("handicap", "novice", "maiden", "stakes", "hurdle", "chase"):
        if race_type in lowered:
            return race_type
    return None


def distance_yards(value: str | None) -> int | None:
    if not value:
        return None
    matches = re.findall(r"(\d+)\s*([mfy])", value.lower())
    if not matches:
        return None
    total = 0
    consumed = "".join(f"{number}{unit}" for number, unit in matches)
    compact = re.sub(r"\s+", "", value.lower())
    if consumed != compact:
        return None
    for number, unit in matches:
        amount = int(number)
        if unit == "m":
            total += amount * 1760
        elif unit == "f":
            total += amount * 220
        elif unit == "y":
            total += amount
    return total


def weight_lbs(value: str | None) -> int | None:
    if not value:
        return None
    match = re.fullmatch(r"(\d+)-(\d+)", value.strip())
    if not match:
        return None
    stones = int(match.group(1))
    pounds = int(match.group(2))
    if pounds >= 14:
        return None
    return stones * 14 + pounds


def finishing_position(ride: dict[str, Any]) -> int | None:
    value = ride.get("finish_position")
    return int(value) if isinstance(value, int) and value > 0 else None


def raw_outcome_code(ride: dict[str, Any]) -> str | None:
    casualty = ride.get("casualty") or {}
    if isinstance(casualty, dict):
        casualty_type = (
            casualty.get("type")
            or casualty.get("short_name")
            or casualty.get("name")
            or casualty.get("reason")
        )
        if casualty_type:
            return str(casualty_type)
    status = ride.get("ride_status")
    position = ride.get("finish_position")
    if status == "RUNNER" and isinstance(position, int):
        return str(position)
    return str(status) if status else None


def result_status(ride: dict[str, Any]) -> str | None:
    raw_status = (raw_outcome_code(ride) or "").upper()
    if raw_status in {"NONRUNNER", "NON_RUNNER", "NON-RUNNER", "WITHDRAWN", "NR"}:
        return "non_runner"
    if raw_status in {"UNSEATEDRIDER", "UNSEATED_RIDER", "UR"}:
        return "unseated_rider"
    if finishing_position(ride) is not None:
        return "finished"
    if raw_status in {"F", "FELL"}:
        return "fell"
    if raw_status in {"PU", "PULLEDUP", "PULLED_UP", "PULLED-UP"}:
        return "pulled_up"
    if raw_status in {"BD", "BROUGHT_DOWN"}:
        return "brought_down"
    if raw_status in {"DSQ", "DQ", "DISQUALIFIED"}:
        return "disqualified"
    if raw_status:
        return "other"
    return None


def starting_price(ride: dict[str, Any]) -> str | None:
    return (ride.get("betting") or {}).get("current_odds")


def decimal_odds(odds: str | None) -> str | None:
    if not odds:
        return None
    value = odds.strip()
    if value.upper() in {"EVENS", "EVS"}:
        return "2.000"
    match = re.fullmatch(r"(\d+)/(\d+)", value)
    if not match:
        return None
    numerator = int(match.group(1))
    denominator = int(match.group(2))
    if denominator == 0:
        return None
    return f"{(numerator / denominator) + 1:.3f}"


def is_favourite(ride: dict[str, Any]) -> bool | None:
    favourite = (ride.get("betting") or {}).get("favourite") or {}
    marker = favourite.get("betting_favourite")
    if marker is None:
        return False
    return str(marker).lower() in {"f", "j", "jf", "cf", "c"}


def int_or_none(value: Any) -> int | None:
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.isdigit():
        return int(value)
    return None


def str_or_none(value: Any) -> str | None:
    if value is None:
        return None
    return str(value)


def stripped(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    value = value.strip()
    return value or None


def format_headgear(value: Any) -> str | None:
    if not value:
        return None
    if isinstance(value, list):
        return ",".join(str(item) for item in value) or None
    return str(value)


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "unknown"
