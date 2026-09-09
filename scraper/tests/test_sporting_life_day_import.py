from __future__ import annotations

import json
import sys
import tempfile
from datetime import date
from pathlib import Path
from typing import Any
import unittest
from unittest.mock import patch


REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scraper" / "scripts"))

import import_sporting_life_day as day_importer  # noqa: E402
from sporting_life.extract import BASE_URL  # noqa: E402
from sporting_life.importing import FULL_RESULT_SOURCE_TYPE  # noqa: E402


class SportingLifeDayImportResumeTest(unittest.TestCase):
    def test_completed_uk_race_skips_while_new_eire_race_imports(self) -> None:
        client = FakeSportingLifeClient(
            {
                f"{BASE_URL}/racing/results/2026-09-08": next_data_html(
                    index_payload(
                        [
                            index_meeting("121246", "323", "Goodwood", "ENG", "England", "937225"),
                            index_meeting("121265", "334", "Galway", "Eire", "Eire", "937399"),
                        ],
                    ),
                ),
                f"{BASE_URL}/racing/results/2026-09-08/galway/937399/galway-maiden": next_data_html(
                    full_result_payload("121265", "334", "Galway", "Eire", "937399"),
                ),
            },
        )
        fake_connection = FakeConnection(existing_full_result_ids={"937225"})

        with tempfile.TemporaryDirectory() as tmp_dir:
            with patch.object(day_importer, "RAW_OUTPUT_DIR", Path(tmp_dir)):
                with patch.object(day_importer.psycopg, "connect", return_value=fake_connection):
                    result = day_importer.import_sporting_life_day(
                        race_date=date(2026, 9, 8),
                        database_url="postgresql://example.test/db",
                        request_delay_seconds=0,
                        skip_existing_full_results=True,
                        client=client,
                    )

        self.assertEqual([link.course_name for link in result.discovered_links], ["Goodwood", "Galway"])
        self.assertEqual([link.race_id for link in result.discovered_links], ["937225", "937399"])
        self.assertEqual([link.race_id for link in result.imported_links], ["937399"])
        self.assertEqual(result.skipped_full_results, 1)
        self.assertEqual(result.totals["races"], 1)
        self.assertEqual(result.totals["runners"], 1)
        self.assertEqual(client.full_result_urls, [f"{BASE_URL}/racing/results/2026-09-08/galway/937399/galway-maiden"])
        self.assertEqual(fake_connection.full_result_lookup_ids, ["937225", "937399"])


class FakeSportingLifeClient:
    def __init__(self, responses: dict[str, str]) -> None:
        self.responses = responses
        self.full_result_urls: list[str] = []

    def get_text(self, url: str) -> str:
        if "/racing/results/2026-09-08/" in url:
            self.full_result_urls.append(url)
        return self.responses[url]


class FakeConnection:
    def __init__(self, *, existing_full_result_ids: set[str]) -> None:
        self.existing_full_result_ids = existing_full_result_ids
        self.full_result_lookup_ids: list[str] = []

    def __enter__(self) -> "FakeConnection":
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def cursor(self) -> "FakeCursor":
        return FakeCursor(self)

    def commit(self) -> None:
        return None


class FakeCursor:
    def __init__(self, connection: FakeConnection) -> None:
        self.connection = connection
        self.next_row: list[str] | None = None
        self.row_count = 0

    def __enter__(self) -> "FakeCursor":
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def execute(self, query: str, params: tuple[Any, ...]) -> None:
        if "from source_imports" in query and "limit 1" in query:
            source_type = params[1]
            source_id = params[2]
            if source_type == FULL_RESULT_SOURCE_TYPE:
                self.connection.full_result_lookup_ids.append(str(source_id))
                self.next_row = ["existing"] if source_id in self.connection.existing_full_result_ids else None
                return
        if "returning id" in query:
            self.row_count += 1
            self.next_row = [f"row-{self.row_count}"]
        else:
            self.next_row = None

    def fetchone(self) -> list[str] | None:
        return self.next_row


def next_data_html(payload: dict[str, Any]) -> str:
    return (
        '<html><body><script id="__NEXT_DATA__" type="application/json">'
        + json.dumps(payload)
        + "</script></body></html>"
    )


def index_payload(meetings: list[dict[str, Any]]) -> dict[str, Any]:
    return {"props": {"pageProps": {"meetings": meetings}}}


def index_meeting(
    meeting_id: str,
    course_id: str,
    course_name: str,
    short_name: str,
    long_name: str,
    race_id: str,
) -> dict[str, Any]:
    return {
        "meeting_summary": {
            "meeting_reference": {"id": int(meeting_id)},
            "course": {
                "course_reference": {"id": int(course_id)},
                "name": course_name,
                "country": {"short_name": short_name, "long_name": long_name},
            },
        },
        "races": [
            {
                "race_summary_reference": {"id": int(race_id)},
                "name": f"{course_name} Maiden",
                "date": "2026-09-08",
                "time": "14:43",
                "race_stage": "RESULT",
            },
        ],
    }


def full_result_payload(
    meeting_id: str,
    course_id: str,
    course_name: str,
    country: str,
    race_id: str,
) -> dict[str, Any]:
    return {
        "props": {
            "pageProps": {
                "meeting": [
                    {
                        "meeting_summary": {
                            "meeting_reference": {"id": int(meeting_id)},
                            "course": {
                                "course_reference": {"id": int(course_id)},
                                "name": course_name,
                                "country": {"short_name": country, "long_name": country},
                            },
                        },
                    },
                ],
                "race": {
                    "race_summary": {
                        "race_summary_reference": {"id": int(race_id)},
                        "name": f"{course_name} Maiden",
                        "course_name": course_name,
                        "course_surface": {"surface": "TURF"},
                        "race_class": "",
                        "distance": "1m",
                        "date": "2026-09-08",
                        "time": "14:43",
                        "off_time": "14:44:00",
                        "ride_count": 1,
                        "going": "Soft",
                        "winning_time": "1m 40.00s",
                    },
                    "rides": [
                        {
                            "ride_reference": {"id": int(f"{race_id}1")},
                            "cloth_number": 1,
                            "draw_number": 1,
                            "finish_position": 1,
                            "ride_status": "RUNNER",
                            "finish_distance": None,
                            "handicap": "9-7",
                            "official_rating": 80,
                            "ride_description": "Won",
                            "headgear": [],
                            "horse": {
                                "horse_reference": {"id": int(f"{race_id}2")},
                                "name": "Irish Proof",
                                "age": 3,
                                "sex": {"type": "g"},
                            },
                            "trainer": {"business_reference": {"id": 3001}, "name": "Proof Trainer"},
                            "jockey": {"person_reference": {"id": 4001}, "name": "Proof Jockey"},
                            "betting": {"current_odds": "4/1", "favourite": {}},
                        },
                    ],
                },
            },
        },
    }


if __name__ == "__main__":
    unittest.main()
