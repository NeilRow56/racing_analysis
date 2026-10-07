import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { currentDayProspectiveCapture, noCurrentDayRacecardsMessage } from "./current-day-sync";
import type { TodayMeeting, TodaysRacingData } from "./todays-racing";

describe("current-day prospective sync guard", () => {
  test("treats absent current-day racecards as a successful capture skip", () => {
    const data: TodaysRacingData = {
      status: "empty",
      raceDate: "2026-10-07",
      displayDate: "7 October 2026",
      refreshedAt: null,
      sportingLifeCurrentCardVersion: "reconciled_v1",
      message: "No racecard data has been imported for today.",
    };

    const capture = currentDayProspectiveCapture(data);

    assert.equal(capture.skipped, true);
    assert.deepEqual(capture.meetings, []);
    assert.equal(capture.message, "No racecards imported for 2026-10-07; prospective capture skipped.");
  });

  test("passes existing current-day meetings through unchanged for normal capture", () => {
    const meetings: TodayMeeting[] = [{
      courseId: "course",
      courseSourceId: "source-course",
      courseName: "Test",
      country: "GB",
      order: 0,
      races: [],
    }];
    const data: TodaysRacingData = {
      status: "ok",
      raceDate: "2026-10-07",
      displayDate: "7 October 2026",
      refreshedAt: null,
      sportingLifeCurrentCardVersion: "reconciled_v1",
      meetings,
    };

    const capture = currentDayProspectiveCapture(data);

    assert.equal(capture.skipped, false);
    assert.strictEqual(capture.meetings, meetings);
  });

  test("uses one concise informational message for all sync commands", () => {
    assert.equal(
      noCurrentDayRacecardsMessage("2026-10-07"),
      "No racecards imported for 2026-10-07; prospective capture skipped.",
    );
  });
});
