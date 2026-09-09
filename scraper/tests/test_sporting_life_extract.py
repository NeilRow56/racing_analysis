from __future__ import annotations

import json
from pathlib import Path
import unittest

from sporting_life.extract import (
    FullResultPayload,
    ResultsIndexPayload,
    discover_uk_ire_result_links,
    is_uk_or_ireland,
)


REPO_ROOT = Path(__file__).resolve().parents[2]


class FullResultPayloadTest(unittest.TestCase):
    def test_normal_result_page_exposes_race_payload(self) -> None:
        payload = {
            "props": {
                "pageProps": {
                    "race": {
                        "race_summary": {
                            "race_summary_reference": {"id": 838523},
                        },
                        "rides": [],
                    },
                    "meeting": [],
                },
            },
        }

        result = FullResultPayload(page_url="https://example.test/race", payload=payload)

        self.assertEqual(result.race_payload, payload["props"]["pageProps"]["race"])
        self.assertEqual(result.race["race_summary"]["race_summary_reference"]["id"], 838523)

    def test_page_without_race_payload_is_detected_explicitly(self) -> None:
        payload = {
            "props": {
                "pageProps": {
                    "hasError": True,
                    "meeting": [],
                    "meetings": [],
                },
            },
        }

        result = FullResultPayload(page_url="https://example.test/race", payload=payload)

        self.assertIsNone(result.race_payload)
        with self.assertRaisesRegex(KeyError, "race"):
            _ = result.race


class CountryFilterTest(unittest.TestCase):
    def test_england_is_accepted(self) -> None:
        self.assertTrue(is_uk_or_ireland({"long_name": "England"}, []))

    def test_scotland_is_accepted(self) -> None:
        self.assertTrue(is_uk_or_ireland({"long_name": "Scotland"}, []))

    def test_wales_is_accepted(self) -> None:
        self.assertTrue(is_uk_or_ireland({"long_name": "Wales"}, []))

    def test_ire_short_name_is_accepted(self) -> None:
        self.assertTrue(is_uk_or_ireland({"short_name": "IRE"}, []))

    def test_ireland_long_name_is_accepted(self) -> None:
        self.assertTrue(is_uk_or_ireland({"long_name": "Ireland"}, []))

    def test_eire_long_name_is_accepted(self) -> None:
        self.assertTrue(is_uk_or_ireland({"long_name": "Eire"}, []))

    def test_eire_race_country_short_name_is_accepted(self) -> None:
        self.assertTrue(is_uk_or_ireland({}, [{"country_short_name": "Eire"}]))

    def test_unrelated_foreign_country_is_rejected(self) -> None:
        self.assertFalse(is_uk_or_ireland({"long_name": "France"}, []))


class ResultDiscoveryTest(unittest.TestCase):
    def test_galway_2026_09_08_fixture_is_discovered(self) -> None:
        fixture = (
            REPO_ROOT
            / "data"
            / "raw"
            / "sporting-life"
            / "2026-09-08-results-index-2026-09-08-next-data.json"
        )
        payload = json.loads(fixture.read_text(encoding="utf-8"))

        links = discover_uk_ire_result_links(
            ResultsIndexPayload(page_url="file://2026-09-08", payload=payload),
        )
        galway_links = [link for link in links if link.course_name == "Galway"]

        self.assertEqual(len(galway_links), 8)
        self.assertEqual(galway_links[0].meeting_id, "121265")
        self.assertEqual(galway_links[0].course_id, "334")
        self.assertEqual(
            [link.race_id for link in galway_links],
            ["937399", "937400", "937401", "937402", "937403", "937404", "937405", "937406"],
        )

    def test_existing_uk_discovery_remains_unchanged_for_2026_09_08(self) -> None:
        fixture = (
            REPO_ROOT
            / "data"
            / "raw"
            / "sporting-life"
            / "2026-09-08-results-index-2026-09-08-next-data.json"
        )
        payload = json.loads(fixture.read_text(encoding="utf-8"))

        links = discover_uk_ire_result_links(
            ResultsIndexPayload(page_url="file://2026-09-08", payload=payload),
        )
        by_course = {}
        for link in links:
            by_course[link.course_name] = by_course.get(link.course_name, 0) + 1

        self.assertEqual(by_course["Goodwood"], 7)
        self.assertEqual(by_course["Leicester"], 8)
        self.assertEqual(by_course["Catterick"], 8)
        self.assertEqual(by_course["Bangor-on-Dee"], 6)


if __name__ == "__main__":
    unittest.main()
