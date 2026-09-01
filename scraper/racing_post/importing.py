from __future__ import annotations

import json
import re
from datetime import datetime, time
from pathlib import Path
from typing import Any

import psycopg
from psycopg.types.json import Jsonb


SOURCE = "racing-post"
FULL_RESULT_SOURCE_TYPE = "full-result-next-data"
RESULTS_INDEX_SOURCE_TYPE = "results-index-next-data"


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


def import_full_result(
    cursor: psycopg.Cursor,
    *,
    payload: dict[str, Any],
) -> dict[str, int | str]:
    race = payload["pageProps"]["initialState"]["raceResult"]["data"]
    source_id = str(race["raceId"])

    import_id = upsert_source_import(
        cursor=cursor,
        source_id=source_id,
        source_type=FULL_RESULT_SOURCE_TYPE,
        payload=payload,
    )
    course_id = upsert_course(cursor, race)
    race_row_id = upsert_race(cursor, race, course_id)
    counts = upsert_runners(cursor, race, race_row_id)

    return {
        "source_import_id": import_id,
        "courses": 1,
        "races": 1,
        **counts,
    }


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


def upsert_course(cursor: psycopg.Cursor, race: dict[str, Any]) -> str:
    source_id = str(race["courseUid"])
    display_name = race["courseName"]

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
        (SOURCE, source_id, display_name, normalize_name(display_name), race.get("countryCode")),
    )
    return str(cursor.fetchone()[0])


def upsert_race(cursor: psycopg.Cursor, race: dict[str, Any], course_id: str) -> str:
    header = race["header"]
    details = race["details"]
    race_datetime = parse_datetime(race["raceDatetime"])
    local_race_datetime = parse_datetime(race["localRaceDatetime"])
    scheduled_time = race_datetime.timetz().replace(tzinfo=None)

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
            str(race["raceId"]),
            race_datetime.date(),
            course_id,
            scheduled_time,
            parse_off_time(details.get("offTime"), scheduled_time),
            race_datetime,
            local_race_datetime,
            header.get("raceTitle"),
            header.get("raceTypeCode"),
            header.get("raceTypeCode"),
            header.get("raceClass"),
            header.get("distanceShort"),
            header.get("distanceYard"),
            header.get("going"),
            details.get("numberOfRunners"),
            len(race.get("runners", [])),
            details.get("winningTime"),
        ),
    )
    return str(cursor.fetchone()[0])


def upsert_runners(cursor: psycopg.Cursor, race: dict[str, Any], race_id: str) -> dict[str, int]:
    counts = {"horses": 0, "trainers": 0, "jockeys": 0, "runners": 0}

    for runner in race["runners"]:
        horse_uid = runner.get("horseUid")
        if horse_uid is None:
            raise ValueError(f"Runner is missing horseUid in race {race['raceId']}")

        horse_id = upsert_named_entity(
            cursor,
            table="horses",
            source_id=str(horse_uid),
            display_name=horse_display_name(runner),
        )
        trainer_id = upsert_named_entity(
            cursor,
            table="trainers",
            source_id=profile_id(runner.get("trainerUrl"), "trainer"),
            display_name=runner["trainerName"],
        )
        jockey_id = upsert_named_entity(
            cursor,
            table="jockeys",
            source_id=profile_id(runner.get("jockeyUrl"), "jockey"),
            display_name=runner["jockeyName"],
        )

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
                f"{race['raceId']}:{horse_uid}",
                race_id,
                horse_id,
                trainer_id,
                jockey_id,
                runner.get("saddleClothNo"),
                finishing_position(runner.get("outcomeCode")),
                runner.get("outcomeCode"),
                result_status(runner.get("outcomeCode")),
                runner.get("outcomeCode"),
                runner_comment(runner.get("comment")),
                draw_value(runner.get("drawLabel")),
                runner.get("beatenDistance"),
                runner.get("beatenDistanceToWinner"),
                display_weight(runner),
                runner.get("weightCarriedLbs"),
                runner.get("jockeyWeightAllowance"),
                runner.get("headgear"),
                rating_value(runner.get("officialRating")),
                rating_value(runner.get("rpRating")),
                rating_value(runner.get("topspeed")),
                runner.get("odds"),
                decimal_odds(runner.get("odds")),
                is_favourite(runner.get("odds")),
                runner.get("age"),
                horse_sex(runner),
            ),
        )
        counts["horses"] += 1
        counts["trainers"] += 1
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


def parse_datetime(value: str) -> datetime:
    return datetime.fromisoformat(value)


def parse_off_time(value: str | None, scheduled_time: time) -> time | None:
    if value is None:
        return None

    parsed = datetime.strptime(value, "%I:%M:%S").time()
    if scheduled_time.hour >= 12 and parsed.hour < 12:
        return parsed.replace(hour=parsed.hour + 12)
    return parsed


def normalize_name(value: str) -> str:
    return " ".join(value.lower().split())


def horse_display_name(runner: dict[str, Any]) -> str:
    suffix = runner.get("horseSuffix")
    return f"{runner['horseName']} {suffix}" if suffix else runner["horseName"]


def profile_id(url: str | None, profile_type: str) -> str:
    if not url:
        raise ValueError(f"Missing {profile_type} profile URL")

    match = re.search(rf"/profile/{profile_type}/(\d+)/", url)
    if not match:
        raise ValueError(f"Could not parse {profile_type} ID from {url}")
    return match.group(1)


def finishing_position(outcome_code: str | None) -> int | None:
    return int(outcome_code) if outcome_code and outcome_code.isdigit() else None


def result_status(outcome_code: str | None) -> str | None:
    if not outcome_code:
        return None
    code = outcome_code.upper()
    if code.isdigit():
        return "finished"
    return {
        "F": "fell",
        "PU": "pulled_up",
        "UR": "unseated_rider",
        "BD": "brought_down",
        "DSQ": "disqualified",
        "DQ": "disqualified",
        "NR": "non_runner",
    }.get(code, "other")


def draw_value(draw_label: str | None) -> int | None:
    if not draw_label:
        return None
    match = re.search(r"\d+", draw_label)
    return int(match.group(0)) if match else None


def display_weight(runner: dict[str, Any]) -> str | None:
    stones = runner.get("weightStones")
    pounds = runner.get("weightPounds")
    if stones is None or pounds is None:
        return None
    return f"{stones}-{pounds}"


def rating_value(value: Any) -> int | None:
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.isdigit():
        return int(value)
    return None


def decimal_odds(odds: str | None) -> str | None:
    cleaned = normalized_odds_core(odds)
    if not cleaned:
        return None
    if cleaned.upper() in {"EVENS", "EVS"}:
        return "2.000"

    match = re.fullmatch(r"(\d+)/(\d+)", cleaned)
    if not match:
        return None

    numerator = int(match.group(1))
    denominator = int(match.group(2))
    if denominator == 0:
        return None

    return f"{(numerator / denominator) + 1:.3f}"


def is_favourite(odds: str | None) -> bool | None:
    suffix = odds_suffix(odds)
    if suffix is None:
        return None
    return suffix in {"F", "JF", "CF", "C"}


def odds_suffix(odds: str | None) -> str | None:
    if not odds:
        return None
    value = odds.strip().upper()
    if value.startswith("EVENS"):
        return value[5:] or ""
    if value.startswith("EVS"):
        return value[3:] or ""
    match = re.search(r"([A-Za-z]+)$", value)
    if not match:
        return ""
    return match.group(1)


def normalized_odds_core(odds: str | None) -> str | None:
    if not odds:
        return None
    value = odds.strip()
    upper_value = value.upper()
    if upper_value.startswith("EVENS"):
        return value[:5]
    if upper_value.startswith("EVS"):
        return value[:3]
    suffix = odds_suffix(value)
    if suffix:
        value = value[: -len(suffix)].strip()
    return value or None


def runner_comment(value: Any) -> str | None:
    if isinstance(value, dict):
        value = value.get("comment")
    if not isinstance(value, str):
        return None
    stripped = value.strip()
    return stripped or None


def horse_sex(runner: dict[str, Any]) -> str | None:
    colour_sex = runner.get("pedigree", {}).get("colourSex")
    if not colour_sex:
        return None
    return colour_sex.split()[-1].upper()


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "unknown"
