from __future__ import annotations

import json
import unittest
from typing import Any

from sporting_life.extract import (
    RacecardPayload,
    RacecardsIndexPayload,
    discover_uk_ire_racecard_links,
    fetch_page_next_data,
    looks_like_access_control_page,
)
from sporting_life.client import SportingLifeRequestError
from sporting_life.importing import import_full_result, import_racecard, racecard_result_status


class RacecardExtractionTest(unittest.TestCase):
    def test_racecard_page_exposes_race_payload(self) -> None:
        payload = sample_racecard_payload()

        result = RacecardPayload(page_url="https://example.test/racecard", payload=payload)

        self.assertEqual(result.race_payload, payload["props"]["pageProps"]["race"])
        self.assertEqual(result.race["race_summary"]["race_summary_reference"]["id"], 937435)

    def test_uk_and_eire_racecards_are_discovered(self) -> None:
        payload = {
            "props": {
                "pageProps": {
                    "meetings": [
                        sample_index_meeting("121270", "302", "Carlisle", "ENG", "England", "937435"),
                        sample_index_meeting("121266", "344", "Cork", "Eire", "Eire", "937407"),
                        sample_index_meeting("121350", "101", "Compiegne", "FR", "France", "937500"),
                    ],
                },
            },
        }

        links = discover_uk_ire_racecard_links(
            RacecardsIndexPayload(page_url="https://example.test/racecards", payload=payload),
        )

        self.assertEqual([link.course_name for link in links], ["Carlisle", "Cork"])
        self.assertEqual([link.race_id for link in links], ["937435", "937407"])
        self.assertEqual(links[1].meeting_id, "121266")
        self.assertEqual(links[1].course_id, "344")
        self.assertEqual(
            links[1].url,
            "https://www.sportinglife.com/racing/racecards/2026-09-09/cork/racecard/937407/irish-ebf-auction-series-race",
        )

    def test_hidden_and_abandoned_racecards_are_not_discovered(self) -> None:
        meeting = sample_index_meeting("121270", "302", "Carlisle", "ENG", "England", "937435")
        meeting["races"].append(
            {
                "race_summary_reference": {"id": 937436},
                "name": "Hidden Race",
                "date": "2026-09-09",
                "time": "13:45",
                "hidden": True,
            },
        )
        meeting["races"].append(
            {
                "race_summary_reference": {"id": 937437},
                "name": "Abandoned Race",
                "date": "2026-09-09",
                "time": "14:15",
                "race_stage": "ABANDONED",
            },
        )
        payload = {"props": {"pageProps": {"meetings": [meeting]}}}

        links = discover_uk_ire_racecard_links(
            RacecardsIndexPayload(page_url="https://example.test/racecards", payload=payload),
        )

        self.assertEqual([link.race_id for link in links], ["937435"])

    def test_fetch_page_next_data_classifies_200_bot_check_as_access_control(self) -> None:
        client = FakeClient(
            "<html><title>Security check</title><body>Bot check: verify you are human</body></html>",
        )

        with self.assertRaises(SportingLifeRequestError) as context:
            fetch_page_next_data("https://example.test/racecard", client)

        self.assertEqual(context.exception.status_code, 200)
        self.assertTrue(context.exception.access_control_signal)

    def test_fetch_page_next_data_keeps_ordinary_malformed_page_generic(self) -> None:
        client = FakeClient("<html><body>Racecard temporarily unavailable</body></html>")

        with self.assertRaises(RuntimeError) as context:
            fetch_page_next_data("https://example.test/racecard", client)

        self.assertIn("No __NEXT_DATA__", str(context.exception))

    def test_fetch_page_next_data_normal_page_still_succeeds(self) -> None:
        payload = {"props": {"pageProps": {"race": {"race_summary": {"name": "Test"}}}}}
        client = FakeClient(next_data_html(payload))

        self.assertEqual(fetch_page_next_data("https://example.test/racecard", client), payload)

    def test_access_control_markers_are_case_insensitive_and_conservative(self) -> None:
        self.assertTrue(looks_like_access_control_page("VERIFY YOU ARE HUMAN"))
        self.assertTrue(looks_like_access_control_page("Security Check"))
        self.assertFalse(looks_like_access_control_page("Racecard temporarily unavailable"))


class RacecardImportTest(unittest.TestCase):
    def test_import_racecard_uses_stable_ids_and_does_not_fabricate_result_values(self) -> None:
        cursor = FakeCursor()

        counts = import_racecard(cursor, payload=sample_racecard_payload())

        self.assertEqual(counts["races"], 1)
        self.assertEqual(counts["runners"], 2)
        race_insert = cursor.first_query_containing("insert into races")
        race_params = race_insert[1]
        self.assertEqual(race_params[1], "937435")
        self.assertIsNone(race_params[5])
        self.assertIsNone(race_params[16])
        self.assertIsNone(race_params[17])

        runner_inserts = cursor.queries_containing("insert into race_runners")
        first_runner_params = runner_inserts[0][1]
        self.assertEqual(first_runner_params[1], "253213767")
        self.assertEqual(first_runner_params[6], 1)
        self.assertIsNone(first_runner_params[7])
        self.assertIsNone(first_runner_params[8])
        self.assertIsNone(first_runner_params[9])
        self.assertIsNone(first_runner_params[10])
        self.assertIsNone(first_runner_params[11])
        self.assertIsNone(first_runner_params[13])
        self.assertIsNone(first_runner_params[14])
        self.assertEqual(first_runner_params[16], 128)
        self.assertEqual(first_runner_params[17], 3)
        self.assertEqual(first_runner_params[19], 82)
        self.assertEqual(first_runner_params[22], "6/1")
        self.assertEqual(first_runner_params[23], "7.000")

    def test_import_racecard_records_non_runner_state_without_finish_position(self) -> None:
        cursor = FakeCursor()

        import_racecard(cursor, payload=sample_racecard_payload())

        second_runner_params = cursor.queries_containing("insert into race_runners")[1][1]
        self.assertEqual(second_runner_params[1], "253213768")
        self.assertEqual(second_runner_params[9], "non_runner")
        self.assertIsNone(second_runner_params[7])
        self.assertIsNone(second_runner_params[10])

    def test_racecard_refresh_sql_preserves_completed_result_fields(self) -> None:
        cursor = FakeCursor()

        import_racecard(cursor, payload=sample_racecard_payload())

        race_sql = cursor.first_query_containing("insert into races")[0]
        runner_sql = cursor.first_query_containing("insert into race_runners")[0]
        self.assertIn("off_time = races.off_time", race_sql)
        self.assertIn("actual_runner_count = races.actual_runner_count", race_sql)
        self.assertIn("winning_time = races.winning_time", race_sql)
        self.assertIn("completed.winning_time is not null", runner_sql)
        self.assertIn("then race_runners.starting_price", runner_sql)

    def test_racecard_result_status_only_marks_genuine_non_runners(self) -> None:
        self.assertIsNone(racecard_result_status({"ride_status": "RUNNER"}))
        self.assertEqual(racecard_result_status({"ride_status": "NONRUNNER"}), "non_runner")

    def test_racecard_to_full_result_lifecycle_uses_same_rows(self) -> None:
        cursor = FakeCursor()
        racecard_payload = sample_racecard_payload()
        result_payload = sample_full_result_payload()

        import_racecard(cursor, payload=racecard_payload)
        import_full_result(cursor, payload=result_payload)

        race_inserts = cursor.queries_containing("insert into races")
        self.assertEqual(race_inserts[0][1][1], "937435")
        self.assertEqual(race_inserts[1][1][1], "937435")
        self.assertIsNone(race_inserts[0][1][17])
        self.assertEqual(race_inserts[1][1][17], "1m 13.42s")

        runner_inserts = cursor.queries_containing("insert into race_runners")
        self.assertEqual(runner_inserts[0][1][1], "253213767")
        self.assertEqual(runner_inserts[2][1][1], "253213767")
        self.assertIsNone(runner_inserts[0][1][7])
        self.assertEqual(runner_inserts[2][1][7], 1)
        self.assertEqual(runner_inserts[2][1][9], "finished")


class FakeCursor:
    def __init__(self) -> None:
        self.executions: list[tuple[str, tuple[Any, ...]]] = []
        self.fetch_count = 0

    def execute(self, query: str, params: tuple[Any, ...]) -> None:
        self.executions.append((query, params))

    def fetchone(self) -> list[str]:
        self.fetch_count += 1
        return [f"row-{self.fetch_count}"]

    def first_query_containing(self, pattern: str) -> tuple[str, tuple[Any, ...]]:
        return self.queries_containing(pattern)[0]

    def queries_containing(self, pattern: str) -> list[tuple[str, tuple[Any, ...]]]:
        return [(query, params) for query, params in self.executions if pattern in query]


class FakeClient:
    def __init__(self, page_text: str) -> None:
        self.page_text = page_text

    def get_text(self, _url: str) -> str:
        return self.page_text


def next_data_html(payload: dict[str, Any]) -> str:
    return (
        '<html><body><script id="__NEXT_DATA__" type="application/json">'
        + json.dumps(payload)
        + "</script></body></html>"
    )


def sample_index_meeting(
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
                "name": "Irish EBF Auction Series Race"
                if course_name == "Cork"
                else "Quooker Tap 100 Degrees EBF Fillies Restricted Novice Stakes",
                "date": "2026-09-09",
                "time": "13:12",
                "race_stage": "DORMANT",
            },
        ],
    }


def sample_racecard_payload() -> dict[str, Any]:
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
                        "name": "Quooker Tap 100 Degrees EBF Fillies Restricted Novice Stakes",
                        "course_name": "Carlisle",
                        "course_surface": {"surface": "TURF"},
                        "race_class": "4",
                        "distance": "5f 182y",
                        "date": "2026-09-09",
                        "time": "13:12",
                        "ride_count": 2,
                        "race_stage": "DORMANT",
                        "going": "Good",
                        "winning_time": None,
                        "off_time": None,
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
                        {
                            "ride_reference": {"id": 253213768},
                            "cloth_number": 2,
                            "draw_number": 1,
                            "finish_position": 0,
                            "ride_status": "NONRUNNER",
                            "handicap": "9-0",
                            "jockey_claim": None,
                            "headgear": ["h"],
                            "official_rating": None,
                            "horse": {
                                "horse_reference": {"id": 1232988},
                                "name": "Absent Friend",
                                "age": 2,
                                "sex": {"type": "g"},
                            },
                            "trainer": {"business_reference": {"id": 5488}, "name": "B Trainer"},
                            "jockey": {"person_reference": {"id": 9982}, "name": "B Jockey"},
                            "betting": {"current_odds": "16/1", "favourite": {}},
                        },
                    ],
                },
            },
        },
    }


def sample_full_result_payload() -> dict[str, Any]:
    payload = sample_racecard_payload()
    race_summary = payload["props"]["pageProps"]["race"]["race_summary"]
    race_summary["race_stage"] = "RESULT"
    race_summary["off_time"] = "13:13:00"
    race_summary["winning_time"] = "1m 13.42s"
    first_ride = payload["props"]["pageProps"]["race"]["rides"][0]
    first_ride["finish_position"] = 1
    first_ride["ride_description"] = "Made all, won readily"
    return payload


if __name__ == "__main__":
    unittest.main()
