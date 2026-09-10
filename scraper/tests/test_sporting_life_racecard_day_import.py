from __future__ import annotations

import json
import sys
import tempfile
from contextlib import redirect_stdout
from datetime import date
from io import StringIO
from pathlib import Path
from typing import Any
import unittest
from unittest.mock import patch


REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scraper"))
sys.path.insert(0, str(REPO_ROOT / "scraper" / "scripts"))

import import_sporting_life_racecards as racecard_importer  # noqa: E402
from sporting_life.extract import BASE_URL  # noqa: E402
from sporting_life.client import SportingLifeRequestError  # noqa: E402
from sporting_life.importing import (  # noqa: E402
    FULL_RESULT_SOURCE_TYPE,
    RACECARD_SOURCE_TYPE,
)


class SportingLifeRacecardDayImportTest(unittest.TestCase):
    def test_existing_racecard_is_refreshed_by_default(self) -> None:
        client = FakeSportingLifeClient(
            {
                f"{BASE_URL}/racing/racecards/2026-09-09": next_data_html(index_payload()),
                f"{BASE_URL}/racing/racecards/2026-09-09/carlisle/racecard/937435/carlisle-novice": next_data_html(
                    racecard_payload(),
                ),
            },
        )
        fake_connection = FakeConnection(existing_racecard_ids={"937435"})

        with tempfile.TemporaryDirectory() as tmp_dir:
            with patch.object(racecard_importer, "RAW_OUTPUT_DIR", Path(tmp_dir)):
                with patch.object(racecard_importer.psycopg, "connect", return_value=fake_connection):
                    result = racecard_importer.import_sporting_life_racecards(
                        race_date=date(2026, 9, 9),
                        database_url="postgresql://example.test/db",
                        request_delay_seconds=0,
                        client=client,
                    )

        self.assertEqual([link.race_id for link in result.imported_links], ["937435"])
        self.assertEqual(result.skipped_existing, 0)
        self.assertEqual(client.racecard_urls, [f"{BASE_URL}/racing/racecards/2026-09-09/carlisle/racecard/937435/carlisle-novice"])
        self.assertEqual(fake_connection.racecard_lookup_ids, [])

    def test_skip_existing_flag_preserves_resume_mode(self) -> None:
        client = FakeSportingLifeClient(
            {
                f"{BASE_URL}/racing/racecards/2026-09-09": next_data_html(index_payload()),
            },
        )
        fake_connection = FakeConnection(existing_racecard_ids={"937435"})

        with tempfile.TemporaryDirectory() as tmp_dir:
            with patch.object(racecard_importer, "RAW_OUTPUT_DIR", Path(tmp_dir)):
                with patch.object(racecard_importer.psycopg, "connect", return_value=fake_connection):
                    result = racecard_importer.import_sporting_life_racecards(
                        race_date=date(2026, 9, 9),
                        database_url="postgresql://example.test/db",
                        request_delay_seconds=0,
                        skip_existing_racecards=True,
                        client=client,
                    )

        self.assertEqual(result.imported_links, [])
        self.assertEqual(result.skipped_existing, 1)
        self.assertEqual(client.racecard_urls, [])
        self.assertEqual(fake_connection.racecard_lookup_ids, ["937435"])

    def test_completed_full_result_skips_racecard_fetch(self) -> None:
        client = FakeSportingLifeClient(
            {
                f"{BASE_URL}/racing/racecards/2026-09-09": next_data_html(index_payload()),
            },
        )
        fake_connection = FakeConnection(existing_full_result_ids={"937435"})

        with tempfile.TemporaryDirectory() as tmp_dir:
            with patch.object(racecard_importer, "RAW_OUTPUT_DIR", Path(tmp_dir)):
                with patch.object(racecard_importer.psycopg, "connect", return_value=fake_connection):
                    result = racecard_importer.import_sporting_life_racecards(
                        race_date=date(2026, 9, 9),
                        database_url="postgresql://example.test/db",
                        request_delay_seconds=0,
                        client=client,
                    )

        self.assertEqual(result.imported_links, [])
        self.assertEqual(result.skipped_completed_results, 1)
        self.assertEqual(client.racecard_urls, [])
        self.assertEqual(fake_connection.full_result_lookup_ids, ["937435"])

    def test_access_control_status_stops_without_retry(self) -> None:
        attempts = 0

        def fetch() -> object:
            nonlocal attempts
            attempts += 1
            raise SportingLifeRequestError("blocked", status_code=429)

        with self.assertRaises(SportingLifeRequestError):
            racecard_importer.fetch_with_conservative_retries(
                fetch,
                url="https://www.sportinglife.com/racing/racecards/2026-09-09",
            )

        self.assertEqual(attempts, 1)

    def test_captcha_page_without_next_data_stops_as_access_control(self) -> None:
        client = FakeSportingLifeClient(
            {
                f"{BASE_URL}/racing/racecards/2026-09-09": (
                    "<html><title>Access denied</title>"
                    "<body>Captcha: verify you are human</body></html>"
                ),
            },
        )
        output = StringIO()

        with self.assertRaises(SportingLifeRequestError):
            with redirect_stdout(output):
                racecard_importer.import_sporting_life_racecards(
                    race_date=date(2026, 9, 9),
                    database_url="postgresql://example.test/db",
                    request_delay_seconds=0,
                    client=client,
                )

        self.assertIn("ACCESS_CONTROL_SIGNAL status=200 action=stop", output.getvalue())

    def test_legacy_refresh_parameter_still_forces_refresh(self) -> None:
        client = FakeSportingLifeClient(
            {
                f"{BASE_URL}/racing/racecards/2026-09-09": next_data_html(index_payload()),
                f"{BASE_URL}/racing/racecards/2026-09-09/carlisle/racecard/937435/carlisle-novice": next_data_html(
                    racecard_payload(),
                ),
            },
        )
        fake_connection = FakeConnection(existing_racecard_ids={"937435"})

        with tempfile.TemporaryDirectory() as tmp_dir:
            with patch.object(racecard_importer, "RAW_OUTPUT_DIR", Path(tmp_dir)):
                with patch.object(racecard_importer.psycopg, "connect", return_value=fake_connection):
                    result = racecard_importer.import_sporting_life_racecards(
                        race_date=date(2026, 9, 9),
                        database_url="postgresql://example.test/db",
                        request_delay_seconds=0,
                        skip_existing_racecards=True,
                        refresh_existing_racecards=True,
                        client=client,
                    )

        self.assertEqual([link.race_id for link in result.imported_links], ["937435"])
        self.assertEqual(result.skipped_existing, 0)

    def test_legacy_refresh_parameter_false_does_not_enable_skip_mode(self) -> None:
        client = FakeSportingLifeClient(
            {
                f"{BASE_URL}/racing/racecards/2026-09-09": next_data_html(index_payload()),
                f"{BASE_URL}/racing/racecards/2026-09-09/carlisle/racecard/937435/carlisle-novice": next_data_html(
                    racecard_payload(),
                ),
            },
        )
        fake_connection = FakeConnection(existing_racecard_ids={"937435"})

        with tempfile.TemporaryDirectory() as tmp_dir:
            with patch.object(racecard_importer, "RAW_OUTPUT_DIR", Path(tmp_dir)):
                with patch.object(racecard_importer.psycopg, "connect", return_value=fake_connection):
                    result = racecard_importer.import_sporting_life_racecards(
                        race_date=date(2026, 9, 9),
                        database_url="postgresql://example.test/db",
                        request_delay_seconds=0,
                        refresh_existing_racecards=False,
                        client=client,
                    )

        self.assertEqual([link.race_id for link in result.imported_links], ["937435"])
        self.assertEqual(result.skipped_existing, 0)


class FakeSportingLifeClient:
    def __init__(self, responses: dict[str, str]) -> None:
        self.responses = responses
        self.racecard_urls: list[str] = []

    def get_text(self, url: str) -> str:
        if "/racing/racecards/2026-09-09/" in url:
            self.racecard_urls.append(url)
        return self.responses[url]


class FakeConnection:
    def __init__(
        self,
        *,
        existing_racecard_ids: set[str] | None = None,
        existing_full_result_ids: set[str] | None = None,
    ) -> None:
        self.existing_racecard_ids = existing_racecard_ids or set()
        self.existing_full_result_ids = existing_full_result_ids or set()
        self.racecard_lookup_ids: list[str] = []
        self.full_result_lookup_ids: list[str] = []
        self.row_count = 0

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

    def __enter__(self) -> "FakeCursor":
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def execute(self, query: str, params: tuple[Any, ...]) -> None:
        if "from source_imports" in query and "limit 1" in query:
            source_type = params[1]
            source_id = str(params[2])
            if source_type == RACECARD_SOURCE_TYPE:
                self.connection.racecard_lookup_ids.append(source_id)
                self.next_row = ["existing"] if source_id in self.connection.existing_racecard_ids else None
                return
            if source_type == FULL_RESULT_SOURCE_TYPE:
                self.connection.full_result_lookup_ids.append(source_id)
                self.next_row = ["existing"] if source_id in self.connection.existing_full_result_ids else None
                return
        if "returning id" in query:
            self.connection.row_count += 1
            self.next_row = [f"row-{self.connection.row_count}"]
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


def index_payload() -> dict[str, Any]:
    return {
        "props": {
            "pageProps": {
                "meetings": [
                    {
                        "meeting_summary": {
                            "meeting_reference": {"id": 121270},
                            "course": {
                                "course_reference": {"id": 302},
                                "name": "Carlisle",
                                "country": {"short_name": "ENG", "long_name": "England"},
                            },
                        },
                        "races": [
                            {
                                "race_summary_reference": {"id": 937435},
                                "name": "Carlisle Novice",
                                "date": "2026-09-09",
                                "time": "13:12",
                                "race_stage": "DORMANT",
                            },
                        ],
                    },
                ],
            },
        },
    }


def racecard_payload() -> dict[str, Any]:
    return {
        "props": {
            "pageProps": {
                "meeting": [
                    {
                        "meeting_summary": {
                            "meeting_reference": {"id": 121270},
                            "course": {
                                "course_reference": {"id": 302},
                                "name": "Carlisle",
                                "country": {"short_name": "ENG", "long_name": "England"},
                            },
                        },
                    },
                ],
                "race": {
                    "race_summary": {
                        "race_summary_reference": {"id": 937435},
                        "name": "Carlisle Novice",
                        "course_name": "Carlisle",
                        "race_class": "4",
                        "distance": "5f 182y",
                        "date": "2026-09-09",
                        "time": "13:12",
                        "ride_count": 1,
                        "race_stage": "DORMANT",
                        "going": "Good",
                    },
                    "rides": [
                        {
                            "ride_reference": {"id": 253213767},
                            "cloth_number": 1,
                            "draw_number": 6,
                            "finish_position": 0,
                            "ride_status": "RUNNER",
                            "handicap": "9-2",
                            "jockey_claim": 3,
                            "headgear": [],
                            "official_rating": 82,
                            "horse": {
                                "horse_reference": {"id": 1232987},
                                "name": "Funky Dory",
                                "age": 2,
                                "sex": {"type": "f"},
                            },
                            "trainer": {"business_reference": {"id": 5487}, "name": "A Trainer"},
                            "jockey": {"person_reference": {"id": 9981}, "name": "A Jockey"},
                            "betting": {"current_odds": "6/1", "favourite": {}},
                        },
                    ],
                },
            },
        },
    }


if __name__ == "__main__":
    unittest.main()
