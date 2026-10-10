import assert from "node:assert/strict";
import { test } from "node:test";
import { isRacecardAcquisitionFailure, validateStoredRacecards, type StoredRacecard } from "./research-racecard-fallback";

const date = "2026-10-10";
const cards: StoredRacecard[] = ["101", "102", "103"].map((id) => ({ date, sourceId: id, payloadId: id, payloadDate: date, meetingId: "meeting", scheduledTime: "14:00:00", runners: 8, payloadRunners: 8 }));

test("requires multiple complete exact-date Sporting Life cards with matching payload identities", () => {
  assert.deepEqual(validateStoredRacecards(date, cards), { date, races: 3, meetings: 1, runners: 24, usable: true });
  for (const invalid of [[], cards.slice(0, 1), [cards[0]!, cards[0]!], cards.map((card) => ({ ...card, date: "2026-10-09" })), cards.map((card) => ({ ...card, payloadDate: "2026-10-09" })), cards.map((card) => ({ ...card, payloadId: "wrong" })), cards.map((card) => ({ ...card, runners: 1 })), cards.map((card) => ({ ...card, runners: 7 })), cards.map((card) => ({ ...card, scheduledTime: null })), cards.map((card) => ({ ...card, meetingId: "" }))]) {
    assert.equal(validateStoredRacecards(date, invalid).usable, false);
  }
});

test("recognizes terminal acquisition errors, never retries, integrity errors or access control", () => {
  const failed = "REQUEST_FAILED url=https://www.sportinglife.com/racing/racecards\n";
  for (const error of ["TimeoutError: timed out", "ConnectionResetError: [Errno 54] Connection reset by peer", "OSError: [Errno 60] Operation timed out", "http.client.RemoteDisconnected: Remote end closed connection without response", "urllib.error.URLError: <urlopen error [Errno 8] Temporary failure in name resolution>", "sporting_life.client.SportingLifeRequestError: Sporting Life returned HTTP 503 for https://www.sportinglife.com/racing/racecards; body_prefix='down'"]) {
    assert.equal(isRacecardAcquisitionFailure(failed + error), true, error);
  }
  for (const error of ["JSONDecodeError: bad JSON", "KeyError: race_summary", "RuntimeError: parser failed", "ValueError: invalid date", "RuntimeError: different date", "SportingLifeRequestError: Sporting Life returned HTTP 404", "SportingLifeRequestError: Sporting Life returned HTTP 403"]) {
    assert.equal(isRacecardAcquisitionFailure(failed + error), false, error);
  }
  assert.equal(isRacecardAcquisitionFailure("TimeoutError: a database timeout"), false);
  assert.equal(isRacecardAcquisitionFailure(failed + "RACECARD_DETAIL_DATE_MISMATCH target_date=2026-10-10\nTimeoutError: timed out"), false);
  assert.equal(isRacecardAcquisitionFailure(failed + "ACCESS_CONTROL_SIGNAL status=200 action=stop\nTimeoutError: timed out"), false);
});
