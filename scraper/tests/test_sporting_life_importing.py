from __future__ import annotations

import unittest
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scraper"))

from sporting_life.importing import parse_race_datetime


class SportingLifeImportingTimeZoneTest(unittest.TestCase):
    def test_race_datetime_converts_bst_local_time_to_utc(self) -> None:
        parsed = parse_race_datetime("2026-09-12", "16:00")

        self.assertIsNotNone(parsed)
        self.assertEqual(parsed.isoformat(), "2026-09-12T15:00:00+00:00")

    def test_race_datetime_keeps_gmt_local_time_at_same_utc_clock_time(self) -> None:
        parsed = parse_race_datetime("2026-12-05", "16:00")

        self.assertIsNotNone(parsed)
        self.assertEqual(parsed.isoformat(), "2026-12-05T16:00:00+00:00")


if __name__ == "__main__":
    unittest.main()
