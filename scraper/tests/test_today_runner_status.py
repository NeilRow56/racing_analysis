"""Offline regression tests: execute reconciliation SQL against an isolated database."""
from __future__ import annotations

import copy
import json
import sqlite3
import sys
import tempfile
import unittest
from contextlib import chdir
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, LiteralString
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT / "scraper"), str(ROOT / "scraper/scripts")]
import refresh_today_runner_status as refresh
from sporting_life.extract import RacecardsIndexPayload, RacecardPayload, RacecardLink
from sporting_life.importing import racecard_result_status

DAY = date(2026, 11, 7)
NOW = datetime(2026, 11, 7, 9, tzinfo=timezone.utc)
NAMES = ["Wal Buck's", "Cavalry Call", "Bethpage Theatre", "They're Chancers", "Baron Du Brizais", "Off The Jury"]


class Cursor:
    """Use the actual SQL predicates; SQLite has no PostgreSQL FOR UPDATE clause."""
    def __init__(self, db: sqlite3.Connection):
        self.cursor = db.cursor()

    def execute(self, query: LiteralString, params: tuple[Any, ...], /) -> object:
        converted = tuple(x.isoformat(sep=" ") if isinstance(x, datetime) else
                          x.isoformat() if isinstance(x, date) else x for x in params)
        return self.cursor.execute(query.replace("%s", "?").replace("for update", ""), converted)

    def fetchone(self):
        return self.cursor.fetchone()

    def fetchall(self):
        return self.cursor.fetchall()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.cursor.close()


class Connection:
    def __init__(self, db: sqlite3.Connection):
        self.db = db

    def cursor(self):
        return Cursor(self.db)

    def commit(self):
        self.db.commit()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, *_):
        if exc_type:
            self.db.rollback()


def race(status: str | None = "NONRUNNER") -> dict[str, Any]:
    return {"race_summary": {"race_summary_reference": {"id": "race"}, "date": DAY.isoformat(),
                             "time": "18:00", "race_stage": "PRE_RACE"},
            "rides": [{"ride_reference": {"id": str(i)}, "ride_status": status,
                       "horse": {"name": name}} for i, name in enumerate(NAMES)]}


class RunnerStatusTest(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.executescript("""
            create table races(id text, source text, source_id text, race_date text,
                race_datetime text, off_time text, winning_time text);
            create table race_runners(id text, source text, source_id text, race_id text,
                result_status text, finishing_position int, identity_data text);
            create table source_imports(source text, source_id text, source_type text);
            insert into races values('local', 'sporting_life', 'race', '2026-11-07',
                '2026-11-07 18:00:00+00:00', null, null);
        """)
        self.db.executemany("insert into race_runners values(?, 'sporting_life', ?, 'local', ?, null, ?)",
                            [(str(i), str(i), None if i < 3 else "non_runner", name) for i, name in enumerate(NAMES)])
        self.db.commit()
        self.cursor = Cursor(self.db)

    def tearDown(self):
        self.db.close()

    def reconcile(self, payload=None, now=NOW):
        return refresh.reconcile_race_statuses(self.cursor, payload or race(), DAY, now)

    def test_six_audit_examples_only_change_live_status_and_are_idempotent(self):
        before = self.db.execute("select * from race_runners order by id").fetchall()
        payload = race(); original = copy.deepcopy(payload)
        self.assertEqual(self.reconcile(payload), 3)
        after = self.db.execute("select * from race_runners order by id").fetchall()
        self.assertEqual(after, [(*row[:4], "non_runner", *row[5:]) for row in before])
        self.assertEqual(self.reconcile(payload), 0)
        self.assertEqual(payload, original)

    def test_explicit_runner_can_restore_prerace_nr_but_unknown_and_absent_do_nothing(self):
        self.assertEqual(self.reconcile(race("RUNNER")), 3)
        self.reconcile()
        for status in [None, "UNKNOWN", "", "FINISHED"]:
            self.assertEqual(self.reconcile(race(status)), 0)
        empty = race(); empty["rides"] = []
        self.assertEqual(self.reconcile(empty), 0)
        self.assertTrue(all(row[0] == "non_runner" for row in self.db.execute("select result_status from race_runners")))

    def test_nr_aliases_use_the_existing_importer_mapping(self):
        for raw in ["NONRUNNER", "NON_RUNNER", "NON-RUNNER", "WITHDRAWN", "NR"]:
            self.assertEqual(racecard_result_status({"ride_status": raw}), "non_runner")
            self.reconcile(race("RUNNER"))
            self.assertEqual(self.reconcile(race(raw)), 6)

    def test_no_new_runners_or_cross_race_updates(self):
        self.db.execute("update race_runners set race_id='different' where id='0'")
        payload = race(); payload["rides"].append({"ride_reference": {"id": "new"}, "ride_status": "NONRUNNER"})
        self.assertEqual(self.reconcile(payload), 2)
        self.assertEqual(self.db.execute("select count(*) from race_runners").fetchone()[0], 6)
        self.assertIsNone(self.db.execute("select result_status from race_runners where id='0'").fetchone()[0])

    def test_completed_status_position_and_full_result_source_are_preserved(self):
        for status in ["finished", "pulled_up", "fell", "unseated_rider"]:
            self.db.execute("update race_runners set result_status=?", (status,))
            self.assertEqual(self.reconcile(), 0)
        self.db.execute("update race_runners set result_status=null, finishing_position=1")
        self.assertEqual(self.reconcile(), 0)
        self.db.execute("update race_runners set finishing_position=null")
        self.db.execute("insert into source_imports values('sporting_life', 'race', 'full-result-next-data')")
        self.assertEqual(self.reconcile(), 0)

    def test_elapsed_unknown_started_stages_and_completed_races_defer_to_results(self):
        for stage in ["OFF", "RESULT", "WEIGHEDIN", None, "UNKNOWN"]:
            payload = race(); payload["race_summary"]["race_stage"] = stage
            self.assertEqual(self.reconcile(payload), 0)
        self.assertEqual(self.reconcile(now=datetime(2026, 11, 7, 18, tzinfo=timezone.utc)), 0)
        self.db.execute("update races set winning_time='4m 10s'")
        self.assertEqual(self.reconcile(), 0)
        self.db.execute("update races set winning_time=null, off_time='17:59'")
        self.assertEqual(self.reconcile(), 0)

    def test_invalid_date_and_duplicate_payload_fail_before_updates(self):
        payload = race(); payload["race_summary"]["date"] = "2026-11-06"
        with self.assertRaisesRegex(ValueError, "date mismatch"):
            self.reconcile(payload)
        payload = race(); payload["rides"].append(payload["rides"][0])
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            self.reconcile(payload)
        self.assertIsNone(self.db.execute("select result_status from race_runners where id='0'").fetchone()[0])

    def test_manual_command_has_no_file_or_ledger_writes(self):
        summary = {**race()["race_summary"], "name": "Test"}
        index = RacecardsIndexPayload("test-index", {"props": {"pageProps": {"meetings": [{
            "meeting_summary": {"meeting_reference": {"id": "meeting"}, "course": {
                "course_reference": {"id": "course"}, "name": "Test", "country": {"short_name": "ENG"}}},
            "races": [summary],
        }]}}})
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary); ledgers = root / "data/research"; ledgers.mkdir(parents=True)
            frozen = {"probability": .3, "rank": 2, "valueRank": 1, "capturedPrice": 8,
                      "modelInputs": [1, 2], "adjustmentInputs": [3], "outcome": None}
            for name in ["tissue-generation-forward-2026-11.json", "chase-jump-tissue-v1-value-forward-v1.json"]:
                (ledgers / name).write_text(json.dumps({"races": [{"runners": [frozen]}]}))
            before = {p.relative_to(root): p.read_bytes() for p in root.rglob("*") if p.is_file()}
            with chdir(root), patch.object(refresh, "REPO_ROOT", root), \
                 patch.object(refresh.psycopg, "connect", return_value=Connection(self.db)), \
                 patch.object(refresh, "fetch_racecards_index", return_value=index), \
                 patch.object(refresh, "fetch_racecard", return_value=RacecardPayload("test-card", {"props": {"pageProps": {"race": race()}}})):
                self.assertEqual(refresh.refresh_today_statuses(race_date=DAY, database_url="unused", now=lambda: NOW), 3)
            self.assertEqual({p.relative_to(root): p.read_bytes() for p in root.rglob("*") if p.is_file()}, before)

    def test_no_historical_backfill_or_writes_on_source_failure(self):
        with self.assertRaisesRegex(ValueError, "TODAY"):
            refresh.refresh_today_statuses(race_date=date(2026, 11, 6), database_url="unused", now=lambda: NOW)
        with patch.object(refresh.psycopg, "connect", return_value=Connection(self.db)), \
             patch.object(refresh, "fetch_racecards_index", side_effect=ValueError("bad source")):
            with self.assertRaisesRegex(ValueError, "bad source"):
                refresh.refresh_today_statuses(race_date=DAY, database_url="unused", now=lambda: NOW)
        self.assertIsNone(self.db.execute("select result_status from race_runners where id='0'").fetchone()[0])

    def test_refresh_revalidates_identity_date_stage_and_off_time_after_fetch(self):
        link = RacecardLink(meeting_id="meeting", course_id="course", course_name="Test", race_id="race",
                            race_date=DAY.isoformat(), race_time="18:00", race_title="Test", url="test-card", race_stage="PRE_RACE")
        for change in ["identity", "date", "started", "deadline"]:
            payload = race()
            if change == "identity":
                payload["race_summary"]["race_summary_reference"]["id"] = "wrong"
            if change == "date":
                payload["race_summary"]["date"] = "2026-11-06"
            if change == "started":
                payload["race_summary"]["race_stage"] = "OFF"
            clock = iter([NOW, NOW, datetime(2026, 11, 7, 18, tzinfo=timezone.utc) if change == "deadline" else NOW])
            with patch.object(refresh.psycopg, "connect", return_value=Connection(self.db)), \
                 patch.object(refresh, "fetch_racecards_index"), \
                 patch.object(refresh, "discover_uk_ire_racecard_links", return_value=[link]), \
                 patch.object(refresh, "fetch_racecard", return_value=RacecardPayload("test-card", {"props": {"pageProps": {"race": payload}}})):
                if change in {"identity", "date"}:
                    with self.assertRaises(ValueError):
                        refresh.refresh_today_statuses(race_date=DAY, database_url="unused", now=lambda: next(clock))
                else:
                    self.assertEqual(refresh.refresh_today_statuses(race_date=DAY, database_url="unused", now=lambda: next(clock)), 0)
            self.assertIsNone(self.db.execute("select result_status from race_runners where id='0'").fetchone()[0])

    def test_started_index_defers_without_requesting_a_detail_card(self):
        link = RacecardLink(meeting_id="meeting", course_id="course", course_name="Test", race_id="race",
                            race_date=DAY.isoformat(), race_time="18:00", race_title="Test", url="test-card", race_stage="WEIGHEDIN")
        with patch.object(refresh.psycopg, "connect", return_value=Connection(self.db)), \
             patch.object(refresh, "fetch_racecards_index"), \
             patch.object(refresh, "discover_uk_ire_racecard_links", return_value=[link]), \
             patch.object(refresh, "fetch_racecard") as fetch:
            self.assertEqual(refresh.refresh_today_statuses(race_date=DAY, database_url="unused", now=lambda: NOW), 0)
            fetch.assert_not_called()


if __name__ == "__main__":
    unittest.main()
