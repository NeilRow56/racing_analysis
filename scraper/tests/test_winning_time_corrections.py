import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sporting_life.winning_time_corrections import authoritative_winning_time, corrections


class WinningTimeCorrectionsTest(unittest.TestCase):
    def test_every_audited_correction_without_raw_payload_mutation(self):
        self.assertEqual(len(corrections()), 10)
        for c in corrections():
            payload = {"winning_time": c["original"]}
            before = copy.deepcopy(payload)
            self.assertEqual(authoritative_winning_time(c["sourceId"], c["raceDate"], payload["winning_time"]), c["corrected"])
            self.assertEqual(authoritative_winning_time(c["sourceId"], c["raceDate"], c["corrected"]), c["corrected"])
            self.assertEqual(payload, before)
            with self.assertRaises(ValueError):
                authoritative_winning_time(c["sourceId"], c["raceDate"], "9m 59.00s")

    def test_unconfirmed_time_is_unchanged(self):
        self.assertEqual(authoritative_winning_time("858143", "2025-05-17", "4m 2.40s"), "4m 2.40s")

    def test_full_result_upsert_uses_correction_without_mutating_payload(self):
        from sporting_life.importing import upsert_race

        class Cursor:
            def execute(self, sql, params):
                self.params = params

            def fetchone(self):
                return ("race-id",)

        for c in corrections():
            race = {"race_summary": {"race_summary_reference": {"id": c["sourceId"]},
                                      "date": c["raceDate"], "winning_time": c["original"]}, "rides": []}
            before = copy.deepcopy(race)
            cursor = Cursor()
            self.assertEqual(upsert_race(cursor, race, {}, "course-id"), "race-id")
            self.assertEqual(cursor.params[-1], c["corrected"])
            self.assertEqual(race, before)
