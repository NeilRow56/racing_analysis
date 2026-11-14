"""Offline policy tests and opt-in PostgreSQL tests restricted to a disposable Unix socket."""
from __future__ import annotations

import copy
import io
import os
import sys
import unittest
from contextlib import redirect_stdout
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, LiteralString, cast
from unittest.mock import patch
from zoneinfo import ZoneInfo

import psycopg
from psycopg.types.json import Jsonb
from psycopg import sql

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT / "scraper"), str(ROOT / "scraper/scripts")]
import refresh_today_prices as refresh
from sporting_life.extract import RacecardLink, RacecardPayload

NOW = datetime(2026, 11, 12, 9, tzinfo=timezone.utc)
OFF = NOW.replace(hour=18)


def card(now: datetime = NOW, off: datetime = OFF) -> dict[str, Any]:
    return {"race_summary": {"race_summary_reference": {"id": "race"}, "date": now.date().isoformat(),
                             "time": off.strftime("%H:%M:%S"), "race_stage": "PRE_RACE"},
            "rides": [{"ride_reference": {"id": "ride"}, "horse": {"horse_reference": {"id": "horse"}},
                       "ride_status": "RUNNER", "bookmakerOdds": [{"bookmakerId": 1, "decimalOdds": 4.5}]}]}


class PolicyTests(unittest.TestCase):
    def validate(self, current: dict[str, Any], *, retrieved: datetime = NOW, now: datetime = NOW):
        return refresh.validate_prices(current, card(), "race", NOW.date(), OFF, retrieved, now)

    def test_valid_and_unpriced(self):
        self.assertTrue(self.validate(card())["runners"][0]["available"])
        current = card()
        current["rides"][0]["bookmakerOdds"] = []
        self.assertFalse(self.validate(current)["runners"][0]["available"])

    def test_rejected_responses(self):
        changes = [
            lambda r: r["race_summary"].update(race_stage="OFF"),
            lambda r: r["race_summary"].update(race_stage="UNKNOWN"),
            lambda r: r["race_summary"].update(time="08:00"),
            lambda r: r["race_summary"].update(race_summary_reference={"id": "wrong"}),
            lambda r: r["rides"][0].update(ride_reference={"id": "wrong"}),
            lambda r: r["rides"][0]["horse"].update(horse_reference={"id": "wrong"}),
            lambda r: r.update(rides=[]),
            lambda r: r["rides"].append(copy.deepcopy(r["rides"][0])),
            lambda r: r["rides"][0].pop("bookmakerOdds"),
            lambda r: r["rides"][0].update(bookmakerOdds=[{"bookmakerId": 1, "decimalOdds": "NaN"}]),
            lambda r: r["rides"][0].update(bookmakerOdds=[{"bookmakerId": 1, "decimalOdds": 1}]),
            lambda r: r["rides"][0].update(ride_status="UNKNOWN"),
            lambda r: r["rides"][0].update(ride_status="NONRUNNER"),
        ]
        for change in changes:
            with self.subTest(change=changes.index(change)):
                current = card()
                change(current)
                with self.assertRaises((ValueError, KeyError)):
                    self.validate(current)

    def test_concurrent_attempt_stops_before_source_retrieval_or_writes(self):
        with patch.object(refresh.psycopg, "connect") as connect, patch.object(refresh, "fetch_racecards_index") as fetch:
            cursor = connect.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value
            cursor.fetchone.return_value = (False,)
            with self.assertRaisesRegex(RuntimeError, "another prices refresh"):
                refresh.refresh_prices(database_url="unused-offline-test", race_date=NOW.date(), now=lambda: NOW)
            fetch.assert_not_called()
            cursor.execute.assert_called_once_with("select pg_try_advisory_lock(%s)", (refresh.LOCK_KEY,))

    def test_stale_future_started_and_london_rollover(self):
        for retrieved, now in [(NOW - timedelta(seconds=301), NOW), (NOW + timedelta(seconds=1), NOW),
                               (OFF, OFF), (NOW, NOW + timedelta(days=1))]:
            with self.assertRaises(ValueError):
                self.validate(card(), retrieved=retrieved, now=now)
        # UTC June 12 23:30 is already June 13 in London.
        summer = datetime(2026, 6, 12, 23, 30, tzinfo=timezone.utc)
        with self.assertRaises(ValueError):
            refresh.validate_prices(card(summer, summer + timedelta(minutes=15)), card(summer, summer + timedelta(minutes=15)),
                                    "race", summer.date(), summer + timedelta(minutes=15), summer, summer)


@unittest.skipUnless(os.getenv("PRICES_TEST_POSTGRES") == "1", "opt-in disposable PostgreSQL only")
class PostgresTests(unittest.TestCase):
    def setUp(self):
        # Hard coded isolated socket/port. Never use DATABASE_URL or .env files in tests.
        self.url = "host=/tmp/racing-price-test-pg port=55439 dbname=postgres user=neilrowland options='-c client_encoding=UTF8'"
        self.db = psycopg.connect(self.url, autocommit=True)
        self.db.execute("drop schema public cascade; create schema public")
        self.db.execute("""
            create table races(id uuid primary key, source text, source_id text, race_date date,
              race_datetime timestamptz, off_time time, winning_time text);
            create table source_imports(id uuid primary key, source text, source_id text, source_type text,
              fetched_at timestamptz, payload jsonb);
            create table horses(id uuid primary key, source text, source_id text);
            create table race_runners(id uuid primary key, race_id uuid, horse_id uuid, source text,
              source_id text, finishing_position int, result_status text);
            create table frozen_evidence(name text, payload jsonb);
        """)
        self.db.execute(sql.SQL(cast(LiteralString, (ROOT / "drizzle/0009_mixed_morbius.sql").read_text())))
        self.now = datetime.now(timezone.utc).replace(microsecond=0)
        self.off = self.now + timedelta(minutes=10)
        self.day = self.now.astimezone(ZoneInfo("Europe/London")).date()
        if self.off.date() != self.now.date() or self.day != self.now.date():
            self.skipTest("UTC/London midnight boundary; policy tests cover rollover")
        self.original = card(self.now, self.off)
        self.original["rides"][0]["bookmakerOdds"] = []
        self.race = "00000000-0000-0000-0000-000000000001"
        self.imp = "00000000-0000-0000-0000-000000000002"
        self.horse = "00000000-0000-0000-0000-000000000003"
        self.db.execute("insert into races values (%s,'sporting_life','race',%s,%s,null,null)", (self.race, self.day, self.off))
        self.db.execute("insert into source_imports values (%s,'sporting_life','race','racecard-next-data',%s,%s)",
                        (self.imp, self.now - timedelta(hours=1), Jsonb({"props": {"pageProps": {"race": self.original}}})))
        self.db.execute("insert into horses values (%s,'sporting_life','horse')", (self.horse,))
        self.db.execute("insert into race_runners values (%s,%s,%s,'sporting_life','ride',null,null)", (self.horse, self.race, self.horse))
        for name in ["Hurdle V2", "Chase V2", "Hurdle V3 Shadow", "Positive/Neutral", "Market Edge", "model checksums", "source pins"]:
            self.db.execute("insert into frozen_evidence values (%s,%s)", (name, Jsonb({"prediction": .25, "rank": 1, "market": None})))
        self.before = self.snapshot()

    def tearDown(self):
        self.db.close()

    def snapshot(self):
        return {t: self.db.execute(sql.SQL('select row_to_json(t)::text from {} t order by 1').format(sql.Identifier(t))).fetchall()
                for t in ["races", "race_runners", "horses", "source_imports", "frozen_evidence"]}

    def run_refresh(self, dry: bool = False, detail: dict[str, Any] | None = None, fetch_effect: Any = None):
        link = RacecardLink("meeting", "course", "Course", "race", self.day.isoformat(), self.off.strftime("%H:%M:%S"), "Race", "https://example.invalid", "PRE_RACE")
        payload = RacecardPayload(link.url, {"props": {"pageProps": {"race": detail or card(self.now, self.off)}}})
        with patch.object(refresh, "fetch_racecards_index"), patch.object(refresh, "discover_uk_ire_racecard_links", return_value=[link]), \
             patch.object(refresh, "fetch_racecard", side_effect=fetch_effect, return_value=payload), redirect_stdout(io.StringIO()) as output:
            refresh.refresh_prices(database_url=self.url, race_date=self.day, dry_run=dry, now=lambda: self.now)
        return output.getvalue()

    def test_write_duplicate_and_preservation(self):
        self.assertIn("updated=1", self.run_refresh())
        self.assertEqual(self.snapshot(), self.before)
        overlay = self.db.execute("select payload, retrieved_at, original_import_id from race_current_prices").fetchone()
        assert overlay is not None
        self.assertTrue(overlay[0]["runners"][0]["available"])
        self.assertEqual(str(overlay[2]), self.imp)
        self.assertIn("duplicate_or_no_longer_eligible", self.run_refresh())
        self.assertEqual(self.snapshot(), self.before)

    def test_dry_run_is_read_only(self):
        self.assertIn("dry_run=True", self.run_refresh(dry=True))
        self.assertEqual(self.db.execute("select count(*) from race_current_prices").fetchone(), (0,))
        self.assertEqual(self.snapshot(), self.before)

    def test_concurrent_refresh_rejected(self):
        self.db.execute("select pg_advisory_lock(%s)", (refresh.LOCK_KEY,))
        with self.assertRaisesRegex(RuntimeError, "another prices refresh"):
            self.run_refresh()
        self.db.execute("select pg_advisory_unlock(%s)", (refresh.LOCK_KEY,))

    def test_recheck_rejects_changed_import_before_write(self):
        def fetch(*_):
            self.db.execute("update source_imports set fetched_at = fetched_at + interval '1 second'")
            return RacecardPayload("test", {"props": {"pageProps": {"race": card(self.now, self.off)}}})
        self.assertIn("original card changed", self.run_refresh(fetch_effect=fetch))
        self.assertEqual(self.db.execute("select count(*) from race_current_prices").fetchone(), (0,))

    def test_stored_results_and_identities_rejected(self):
        for statement in ["update races set off_time = '09:00'", "update race_runners set finishing_position = 1",
                    "update horses set source_id = 'wrong'"]:
            with self.subTest(sql=statement):
                self.db.execute(sql.SQL(cast(LiteralString, statement)))
                self.assertIn("skipped=1", self.run_refresh())
                self.assertEqual(self.db.execute("select count(*) from race_current_prices").fetchone(), (0,))
                self.db.execute("update races set off_time = null; update race_runners set finishing_position = null; update horses set source_id = 'horse'")


if __name__ == "__main__":
    unittest.main()
