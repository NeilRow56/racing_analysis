#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import sys
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path
from typing import Any

import psycopg
from dotenv import load_dotenv


REPO_ROOT = Path(__file__).resolve().parents[2]
RAW_OUTPUT_DIR = REPO_ROOT / "data" / "raw" / "racing-post"
DEFAULT_DATE = date(2020, 10, 1)

sys.path.insert(0, str(REPO_ROOT / "scraper"))

from racing_post.client import RacingPostClient  # noqa: E402
from racing_post.extract import discover_uk_result_links, fetch_full_result, fetch_results_index  # noqa: E402
from racing_post.importing import (  # noqa: E402
    decimal_odds,
    import_full_result,
    import_results_index,
    odds_suffix,
    result_status,
    runner_comment,
    write_raw_payload,
)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Import one historical UK Racing Post results day.",
    )
    parser.add_argument(
        "race_date",
        nargs="?",
        type=date.fromisoformat,
        default=DEFAULT_DATE,
        help="Historical date to import, formatted YYYY-MM-DD.",
    )
    args = parser.parse_args()

    load_dotenv(REPO_ROOT / ".env.local")
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise SystemExit("DATABASE_URL is required.")

    client = RacingPostClient()
    index = fetch_results_index(args.race_date, client)
    links = discover_uk_result_links(index)
    if not links:
        raise SystemExit(f"No UK full-result links found for {args.race_date}")

    index_file = write_raw_payload(
        raw_dir=RAW_OUTPUT_DIR,
        race_date=args.race_date.isoformat(),
        course_name="results-index",
        race_id=args.race_date.isoformat(),
        payload_type="next-data-route",
        payload=index.payload,
    )

    raw_files: list[Path] = [index_file]
    observations = ObservationCollector()
    totals = Counter()

    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cursor:
            index_import_id = import_results_index(
                cursor,
                race_date=args.race_date.isoformat(),
                payload=index.payload,
            )

            for link in links:
                full_result = fetch_full_result(link.url, client)
                race = full_result.race_result
                raw_files.append(
                    write_raw_payload(
                        raw_dir=RAW_OUTPUT_DIR,
                        race_date=args.race_date.isoformat(),
                        course_name=race["courseName"],
                        race_id=str(race["raceId"]),
                        payload_type="full-result-next-data-route",
                        payload=full_result.payload,
                    ),
                )

                observations.add_race(race)
                counts = import_full_result(cursor, payload=full_result.payload)
                for key in ("courses", "races", "horses", "trainers", "jockeys", "runners"):
                    totals[key] += int(counts[key])

        connection.commit()

    print(f"DATE={args.race_date.isoformat()}")
    print(f"RESULTS_INDEX_IMPORT_ID={index_import_id}")
    print(f"UK_MEETINGS={len({link.course_id for link in links})}")
    print(f"FULL_RESULTS={len(links)}")
    print(f"RAW_FILES={len(raw_files)}")
    print(
        "UPSERT_ATTEMPTS "
        f"courses={totals['courses']} races={totals['races']} horses={totals['horses']} "
        f"trainers={totals['trainers']} jockeys={totals['jockeys']} runners={totals['runners']}"
    )
    print(observations.format_report())


class ObservationCollector:
    def __init__(self) -> None:
        self.meetings: set[str] = set()
        self.race_types: Counter[str] = Counter()
        self.race_classes: Counter[str] = Counter()
        self.going: Counter[str] = Counter()
        self.distances: dict[str, set[int | None]] = defaultdict(set)
        self.weights: dict[str, set[int | None]] = defaultdict(set)
        self.claims: Counter[int | None] = Counter()
        self.odds: Counter[str | None] = Counter()
        self.outcomes: Counter[str | None] = Counter()
        self.result_statuses: Counter[str | None] = Counter()
        self.unknown_outcomes: Counter[str | None] = Counter()
        self.headgear: Counter[str | None] = Counter()
        self.odds_decimal_count = 0
        self.favourite_suffixes: Counter[str] = Counter()
        self.runner_comment_count = 0
        self.non_runner_keys: Counter[str] = Counter()
        self.runner_count = 0
        self.official_rating_count = 0
        self.rpr_count = 0
        self.topspeed_count = 0

    def add_race(self, race: dict[str, Any]) -> None:
        header = race["header"]
        self.meetings.add(race["courseName"])
        self.race_types[header.get("raceTypeCode")] += 1
        self.race_classes[header.get("raceClass")] += 1
        self.going[header.get("going")] += 1
        self.distances[header.get("distanceShort")].add(header.get("distanceYard"))

        for key, value in race.items():
            if "non" in key.lower() and value:
                self.non_runner_keys[key] += len(value) if isinstance(value, list) else 1

        for runner in race["runners"]:
            self.runner_count += 1
            weight = display_weight(runner)
            self.weights[weight].add(runner.get("weightCarriedLbs"))
            self.claims[runner.get("jockeyWeightAllowance")] += 1
            self.odds[runner.get("odds")] += 1
            self.outcomes[runner.get("outcomeCode")] += 1
            status = result_status(runner.get("outcomeCode"))
            self.result_statuses[status] += 1
            if status == "other":
                self.unknown_outcomes[runner.get("outcomeCode")] += 1
            self.headgear[runner.get("headgear")] += 1
            if decimal_odds(runner.get("odds")) is not None:
                self.odds_decimal_count += 1
            suffix = odds_suffix(runner.get("odds"))
            if suffix:
                self.favourite_suffixes[suffix] += 1
            if runner_comment(runner.get("comment")):
                self.runner_comment_count += 1
            if is_present_rating(runner.get("officialRating")):
                self.official_rating_count += 1
            if is_present_rating(runner.get("rpRating")):
                self.rpr_count += 1
            if is_present_rating(runner.get("topspeed")):
                self.topspeed_count += 1

    def format_report(self) -> str:
        lines = ["FIELD_OBSERVATIONS"]
        lines.append(f"meetings={sorted(self.meetings)}")
        lines.append(f"race_types={dict(sorted(self.race_types.items(), key=lambda item: str(item[0])))}")
        lines.append(f"race_classes={dict(sorted(self.race_classes.items(), key=lambda item: str(item[0])))}")
        lines.append(f"going={dict(self.going)}")
        lines.append(
            "distances="
            + str({key: sorted(values, key=lambda value: -1 if value is None else value) for key, values in self.distances.items()})
        )
        lines.append(
            "weights="
            + str({key: sorted(values, key=lambda value: -1 if value is None else value) for key, values in self.weights.items()})
        )
        lines.append(f"claims={dict(sorted(self.claims.items(), key=lambda item: -1 if item[0] is None else item[0]))}")
        lines.append(f"odds_examples={dict(self.odds.most_common(30))}")
        lines.append(f"odds_decimal_coverage={self.odds_decimal_count}/{self.runner_count}")
        lines.append(f"favourite_suffix_variants={dict(sorted(self.favourite_suffixes.items()))}")
        lines.append(f"outcomes={dict(sorted(self.outcomes.items(), key=lambda item: str(item[0])))}")
        lines.append(f"normalized_result_statuses={dict(sorted(self.result_statuses.items(), key=lambda item: str(item[0])))}")
        lines.append(f"unknown_outcome_codes={dict(sorted(self.unknown_outcomes.items(), key=lambda item: str(item[0])))}")
        lines.append(f"runner_comments={self.runner_comment_count}/{self.runner_count}")
        lines.append(f"headgear={dict(sorted(self.headgear.items(), key=lambda item: str(item[0])))}")
        lines.append(f"non_runner_keys={dict(self.non_runner_keys)}")
        lines.append(
            "ratings="
            f"OR {self.official_rating_count}/{self.runner_count}; "
            f"RPR {self.rpr_count}/{self.runner_count}; "
            f"TS {self.topspeed_count}/{self.runner_count}"
        )
        return "\n".join(lines)


def display_weight(runner: dict[str, Any]) -> str | None:
    stones = runner.get("weightStones")
    pounds = runner.get("weightPounds")
    if stones is None or pounds is None:
        return None
    return f"{stones}-{pounds}"


def is_present_rating(value: Any) -> bool:
    if isinstance(value, int):
        return True
    return isinstance(value, str) and value.isdigit()


if __name__ == "__main__":
    main()
