from __future__ import annotations

import unittest
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scraper"))

from sporting_life.importing import parse_local_race_datetime, parse_race_datetime


class SportingLifeImportingTimeZoneTest(unittest.TestCase):
    def test_race_datetime_converts_bst_local_time_to_utc(self) -> None:
        parsed = parse_local_race_datetime("2026-09-12", "16:00")

        self.assertIsNotNone(parsed)
        self.assertEqual(parsed.isoformat(), "2026-09-12T15:00:00+00:00")

    def test_race_datetime_keeps_gmt_local_time_at_same_utc_clock_time(self) -> None:
        parsed = parse_local_race_datetime("2026-12-05", "16:00")

        self.assertIsNotNone(parsed)
        self.assertEqual(parsed.isoformat(), "2026-12-05T16:00:00+00:00")

    def test_published_1400_round_trips_across_dst_boundaries(self) -> None:
        from zoneinfo import ZoneInfo

        for day, utc_hour in [("2026-03-28", 14), ("2026-03-29", 13),
                              ("2026-03-30", 13), ("2026-10-24", 13),
                              ("2026-10-25", 14), ("2026-10-26", 14)]:
            with self.subTest(day=day):
                local = parse_local_race_datetime(day, "14:00")
                self.assertEqual(local.hour, utc_hour)
                source = parse_race_datetime(day, f"{utc_hour}:00")
                self.assertEqual(source, local)
                for zone in ("Europe/London", "Europe/Dublin"):
                    self.assertEqual(source.astimezone(ZoneInfo(zone)).strftime("%H:%M"), "14:00")

    def test_source_utc_clock_is_not_converted_as_a_local_clock(self) -> None:
        # Archived payload: 14:12; published Chepstow page: 15:12.
        self.assertEqual(parse_race_datetime("2026-10-11", "14:12").isoformat(),
                         "2026-10-11T14:12:00+00:00")
        self.assertIsNone(parse_race_datetime("2026-10-11", None))
        self.assertIsNone(parse_race_datetime("2026-10-11", "invalid"))


if __name__ == "__main__":
    unittest.main()
