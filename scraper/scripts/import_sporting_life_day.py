#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import sys
import time
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

import psycopg
from dotenv import load_dotenv


REPO_ROOT = Path(__file__).resolve().parents[2]
RAW_OUTPUT_DIR = REPO_ROOT / "data" / "raw" / "sporting-life"
DEFAULT_DATE = date(2020, 9, 13)

sys.path.insert(0, str(REPO_ROOT / "scraper"))

from sporting_life.client import SportingLifeClient  # noqa: E402
from sporting_life.extract import (  # noqa: E402
    ResultLink,
    discover_uk_ire_result_links,
    fetch_full_result,
    fetch_results_index,
)
from sporting_life.importing import (  # noqa: E402
    FULL_RESULT_SOURCE_TYPE,
    SOURCE,
    decimal_odds,
    distance_yards,
    import_full_result,
    import_results_index,
    result_status,
    starting_price,
    weight_lbs,
    write_raw_payload,
)


@dataclass
class ImportDayResult:
    race_date: date
    discovered_links: list[ResultLink]
    imported_links: list[ResultLink]
    skipped_full_results: int
    raw_files: int
    totals: Counter[str]
    observations: "ObservationCollector"
    elapsed_seconds: float


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Import one historical UK & Ireland Sporting Life results day.",
    )
    parser.add_argument(
        "race_date",
        nargs="?",
        type=date.fromisoformat,
        default=DEFAULT_DATE,
        help="Historical date to import, formatted YYYY-MM-DD.",
    )
    parser.add_argument(
        "--request-delay-seconds",
        type=float,
        default=None,
        help="Delay between Sporting Life HTTP requests. Defaults to SL_REQUEST_DELAY_SECONDS or 1.0.",
    )
    parser.add_argument(
        "--skip-existing-full-results",
        action="store_true",
        help="Skip full-result payloads already recorded in source_imports.",
    )
    args = parser.parse_args()

    load_dotenv(REPO_ROOT / ".env.local")
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise SystemExit("DATABASE_URL is required.")

    result = import_sporting_life_day(
        race_date=args.race_date,
        database_url=database_url,
        request_delay_seconds=args.request_delay_seconds,
        skip_existing_full_results=args.skip_existing_full_results,
    )
    print_import_day_result(result)


def import_sporting_life_day(
    *,
    race_date: date,
    database_url: str,
    request_delay_seconds: float | None = None,
    skip_existing_full_results: bool = False,
    client: SportingLifeClient | None = None,
) -> ImportDayResult:
    started_at = time.monotonic()
    client = client or SportingLifeClient(request_delay_seconds=request_delay_seconds)
    index = fetch_results_index(race_date, client)
    links = discover_uk_ire_result_links(index)

    index_file = write_raw_payload(
        raw_dir=RAW_OUTPUT_DIR,
        race_date=race_date.isoformat(),
        course_name="results-index",
        race_id=race_date.isoformat(),
        payload_type="next-data",
        payload=index.payload,
    )

    observations = ObservationCollector()
    observations.add_index(index.payload, links)
    totals: Counter[str] = Counter()
    raw_files = 1
    imported_links: list[ResultLink] = []
    skipped_full_results = 0

    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cursor:
            import_results_index(
                cursor,
                race_date=race_date.isoformat(),
                payload=index.payload,
            )
        connection.commit()

        if not links:
            print(f"NO_UK_IRE_RESULTS date={race_date.isoformat()}", flush=True)
            return ImportDayResult(
                race_date=race_date,
                discovered_links=links,
                imported_links=imported_links,
                skipped_full_results=skipped_full_results,
                raw_files=raw_files,
                totals=totals,
                observations=observations,
                elapsed_seconds=time.monotonic() - started_at,
            )

        for link in links:
            with connection.cursor() as cursor:
                if skip_existing_full_results and full_result_source_import_exists(
                    cursor,
                    link.race_id,
                ):
                    skipped_full_results += 1
                    print(
                        "RACE_SKIPPED_EXISTING "
                        f"course={link.course_name!r} time={link.race_time} race_id={link.race_id}",
                        flush=True,
                    )
                    continue

            try:
                full_result = fetch_full_result(link.url, client)
            except Exception:
                print(f"REQUEST_FAILED url={link.url}", flush=True)
                raise

            race = full_result.race
            race_summary = race["race_summary"]
            write_raw_payload(
                raw_dir=RAW_OUTPUT_DIR,
                race_date=race_summary["date"],
                course_name=race_summary["course_name"],
                race_id=str(race_summary["race_summary_reference"]["id"]),
                payload_type="full-result-next-data",
                payload=full_result.payload,
            )
            raw_files += 1

            observations.add_race(race, full_result.page_props)
            with connection.cursor() as cursor:
                counts = import_full_result(cursor, payload=full_result.payload)
            connection.commit()
            imported_links.append(link)
            for key in ("courses", "races", "horses", "trainers", "jockeys", "runners"):
                totals[key] += int(counts[key])
            print(
                "RACE_IMPORTED "
                f"course={link.course_name!r} time={link.race_time} "
                f"race_id={link.race_id} runners={len(race.get('rides', []))}",
                flush=True,
            )

    return ImportDayResult(
        race_date=race_date,
        discovered_links=links,
        imported_links=imported_links,
        skipped_full_results=skipped_full_results,
        raw_files=raw_files,
        totals=totals,
        observations=observations,
        elapsed_seconds=time.monotonic() - started_at,
    )


class ObservationCollector:
    def __init__(self) -> None:
        self.meetings: dict[str, dict[str, str]] = {}
        self.course_ids: Counter[str] = Counter()
        self.meeting_ids: Counter[str] = Counter()
        self.race_ids: list[str] = []
        self.race_classes: Counter[str | None] = Counter()
        self.race_types: Counter[str | None] = Counter()
        self.race_names: list[str] = []
        self.distances: Counter[str | None] = Counter()
        self.going: Counter[str | None] = Counter()
        self.runner_counts: Counter[int | None] = Counter()
        self.off_times: Counter[str | None] = Counter()
        self.winning_times: Counter[str | None] = Counter()
        self.horse_ids: set[str] = set()
        self.trainer_ids: set[str] = set()
        self.jockey_ids: set[str] = set()
        self.finish_positions: Counter[int | None] = Counter()
        self.ride_statuses: Counter[str | None] = Counter()
        self.casualties: Counter[str | None] = Counter()
        self.beaten_distances: Counter[str | None] = Counter()
        self.draws: Counter[int | None] = Counter()
        self.weights: dict[str | None, set[int | None]] = defaultdict(set)
        self.jockey_claims: Counter[Any] = Counter()
        self.official_ratings = 0
        self.starting_prices = 0
        self.decimal_starting_prices = 0
        self.comments = 0
        self.favourites: Counter[str | None] = Counter()
        self.result_statuses: Counter[str | None] = Counter()
        self.unusual_statuses: Counter[str | None] = Counter()
        self.missing_ids: Counter[str] = Counter()
        self.missing_or = 0
        self.missing_sp = 0
        self.missing_comments = 0
        self.unusual_weight_formats: Counter[str | None] = Counter()
        self.unusual_distance_formats: Counter[str | None] = Counter()
        self.runner_count = 0
        self.rail_or_timing_keys: Counter[str] = Counter()

    def add_index(self, payload: dict[str, Any], links: list[ResultLink]) -> None:
        for link in links:
            self.meetings[link.meeting_id] = {
                "course": link.course_name,
                "course_id": link.course_id,
                "country": "",
            }
        for meeting in payload["props"]["pageProps"]["meetings"]:
            meeting_summary = meeting["meeting_summary"]
            course = meeting_summary["course"]
            country = course.get("country", {})
            if meeting_id := str(meeting_summary["meeting_reference"]["id"]):
                if meeting_id not in self.meetings:
                    continue
                meeting_id = str(meeting_summary["meeting_reference"]["id"])
                course_id = str(course["course_reference"]["id"])
                self.meetings[meeting_id] = {
                    "course": course["name"],
                    "course_id": course_id,
                    "country": country.get("short_name") or country.get("long_name") or "",
                }
        for link in links:
            self.course_ids[link.course_id] += 1
            self.meeting_ids[link.meeting_id] += 1

    def add_race(self, race: dict[str, Any], page_props: dict[str, Any]) -> None:
        race_summary = race["race_summary"]
        race_id = str(race_summary["race_summary_reference"]["id"])
        self.race_ids.append(race_id)
        self.race_classes[race_summary.get("race_class")] += 1
        self.race_types[race_summary.get("course_surface", {}).get("surface")] += 1
        self.race_names.append(race_summary.get("name") or "")
        self.distances[race_summary.get("distance")] += 1
        self.going[race_summary.get("going")] += 1
        self.runner_counts[race_summary.get("ride_count")] += 1
        self.off_times[race_summary.get("off_time")] += 1
        self.winning_times[race_summary.get("winning_time")] += 1
        if distance_yards(race_summary.get("distance")) is None:
            self.unusual_distance_formats[race_summary.get("distance")] += 1

        for key in collect_matching_keys(page_props, {"rail", "movement", "timing", "amend"}):
            self.rail_or_timing_keys[key] += 1

        for ride in race.get("rides", []):
            self.runner_count += 1
            self._add_required_id(ride.get("ride_reference", {}).get("id"), "ride")
            horse = ride.get("horse") or {}
            trainer = ride.get("trainer") or {}
            jockey = ride.get("jockey") or {}
            self._add_required_id(horse.get("horse_reference", {}).get("id"), "horse")
            self._add_required_id(trainer.get("business_reference", {}).get("id"), "trainer")
            self._add_required_id(jockey.get("person_reference", {}).get("id"), "jockey")
            if horse.get("horse_reference", {}).get("id") is not None:
                self.horse_ids.add(str(horse["horse_reference"]["id"]))
            if trainer.get("business_reference", {}).get("id") is not None:
                self.trainer_ids.add(str(trainer["business_reference"]["id"]))
            if jockey.get("person_reference", {}).get("id") is not None:
                self.jockey_ids.add(str(jockey["person_reference"]["id"]))

            self.finish_positions[ride.get("finish_position")] += 1
            self.ride_statuses[ride.get("ride_status")] += 1
            casualty_value = casualty_label(ride.get("casualty"))
            self.casualties[casualty_value] += 1
            self.beaten_distances[ride.get("finish_distance")] += 1
            self.draws[ride.get("draw_number")] += 1
            self.weights[ride.get("handicap")].add(weight_lbs(ride.get("handicap")))
            if ride.get("handicap") and weight_lbs(ride.get("handicap")) is None:
                self.unusual_weight_formats[ride.get("handicap")] += 1
            self.jockey_claims[ride.get("jockey_claim")] += 1
            if ride.get("official_rating") is None:
                self.missing_or += 1
            else:
                self.official_ratings += 1
            sp = starting_price(ride)
            if sp:
                self.starting_prices += 1
            else:
                self.missing_sp += 1
            if decimal_odds(sp) is not None:
                self.decimal_starting_prices += 1
            comment = ride.get("ride_description")
            if comment:
                self.comments += 1
            else:
                self.missing_comments += 1
            favourite_marker = ((ride.get("betting") or {}).get("favourite") or {}).get(
                "betting_favourite",
            )
            self.favourites[favourite_marker] += 1
            status = result_status(ride)
            self.result_statuses[status] += 1
            if status not in {"finished", "non_runner"}:
                self.unusual_statuses[status] += 1

    def _add_required_id(self, value: Any, name: str) -> None:
        if value is None:
            self.missing_ids[name] += 1

    def format_report(self) -> str:
        return "\n".join(
            [
                "FIELD_OBSERVATIONS",
                f"meetings={self.meetings}",
                f"course_ids={dict(sorted(self.course_ids.items()))}",
                f"meeting_ids={dict(sorted(self.meeting_ids.items()))}",
                f"race_ids={self.race_ids}",
                f"race_classes={dict(sorted(self.race_classes.items(), key=lambda item: str(item[0])))}",
                f"race_surfaces={dict(sorted(self.race_types.items(), key=lambda item: str(item[0])))}",
                f"race_names={self.race_names}",
                f"distance_displays={dict(self.distances)}",
                f"going={dict(self.going)}",
                f"runner_counts={dict(sorted(self.runner_counts.items(), key=lambda item: -1 if item[0] is None else item[0]))}",
                f"off_times={dict(self.off_times)}",
                f"winning_times={dict(self.winning_times)}",
                f"unique_ids=horses {len(self.horse_ids)}; trainers {len(self.trainer_ids)}; jockeys {len(self.jockey_ids)}",
                f"finish_positions={dict(sorted(self.finish_positions.items(), key=lambda item: -1 if item[0] is None else item[0]))}",
                f"ride_statuses={dict(sorted(self.ride_statuses.items(), key=lambda item: str(item[0])))}",
                f"casualties={dict(sorted(self.casualties.items(), key=lambda item: str(item[0])))}",
                f"beaten_distances_examples={dict(self.beaten_distances.most_common(30))}",
                f"draws={dict(sorted(self.draws.items(), key=lambda item: -1 if item[0] is None else item[0]))}",
                "weights="
                + str({key: sorted(values, key=lambda value: -1 if value is None else value) for key, values in self.weights.items()}),
                f"jockey_claims={dict(sorted(self.jockey_claims.items(), key=lambda item: str(item[0])))}",
                f"coverage=OR {self.official_ratings}/{self.runner_count}; SP {self.starting_prices}/{self.runner_count}; decimal_SP {self.decimal_starting_prices}/{self.runner_count}; comments {self.comments}/{self.runner_count}",
                f"favourite_markers={dict(sorted(self.favourites.items(), key=lambda item: str(item[0])))}",
                f"result_statuses={dict(sorted(self.result_statuses.items(), key=lambda item: str(item[0])))}",
                f"unusual_result_statuses={dict(sorted(self.unusual_statuses.items(), key=lambda item: str(item[0])))}",
                f"missing_ids={dict(sorted(self.missing_ids.items()))}",
                f"missing=OR {self.missing_or}; SP {self.missing_sp}; comments {self.missing_comments}",
                f"unusual_weight_formats={dict(self.unusual_weight_formats)}",
                f"unusual_distance_formats={dict(self.unusual_distance_formats)}",
                f"rail_or_timing_metadata_keys={dict(sorted(self.rail_or_timing_keys.items()))}",
            ],
        )


def full_result_source_import_exists(cursor: psycopg.Cursor, race_id: str) -> bool:
    cursor.execute(
        """
        select 1
        from source_imports
        where source = %s
          and source_type = %s
          and source_id = %s
        limit 1
        """,
        (SOURCE, FULL_RESULT_SOURCE_TYPE, race_id),
    )
    return cursor.fetchone() is not None


def casualty_label(value: Any) -> str | None:
    if not value:
        return None
    if isinstance(value, dict):
        return (
            value.get("type")
            or value.get("short_name")
            or value.get("name")
            or value.get("reason")
            or str(value)
        )
    return str(value)


def collect_matching_keys(value: Any, patterns: set[str]) -> set[str]:
    found: set[str] = set()
    if isinstance(value, dict):
        for key, item in value.items():
            if any(pattern in key.lower() for pattern in patterns):
                found.add(key)
            found.update(collect_matching_keys(item, patterns))
    elif isinstance(value, list):
        for item in value:
            found.update(collect_matching_keys(item, patterns))
    return found


def print_import_day_result(result: ImportDayResult) -> None:
    print(f"DATE={result.race_date.isoformat()}")
    print(
        "DISCOVERED_MEETINGS="
        + ", ".join(
            f"{link.course_name}({link.meeting_id}/{link.course_id})"
            for link in distinct_meeting_links(result.discovered_links)
        ),
    )
    print(f"DISCOVERED_RACES={len(result.discovered_links)}")
    print(f"IMPORTED_RACES={len(result.imported_links)}")
    print(f"SKIPPED_FULL_RESULTS={result.skipped_full_results}")
    print(f"RAW_FILES={result.raw_files}")
    print(
        "UPSERT_ATTEMPTS "
        f"courses={result.totals['courses']} races={result.totals['races']} "
        f"horses={result.totals['horses']} trainers={result.totals['trainers']} "
        f"jockeys={result.totals['jockeys']} runners={result.totals['runners']}"
    )
    print(f"ELAPSED_SECONDS={result.elapsed_seconds:.1f}")
    print(result.observations.format_report())


def distinct_meeting_links(links: list[ResultLink]) -> list[ResultLink]:
    seen: set[str] = set()
    distinct: list[ResultLink] = []
    for link in links:
        if link.meeting_id in seen:
            continue
        seen.add(link.meeting_id)
        distinct.append(link)
    return distinct


if __name__ == "__main__":
    main()
