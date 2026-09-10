import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  formatRaceTimeForDisplay,
  formatRacingDate,
  getLocalRacingDate,
  groupTodaysRacingRows,
  isJumpRaceForDisplay,
  meetingOrderFromIndexPayload,
  racingPageTitle,
  resolveRacingDate,
  type TodayRacecardRow,
} from "./todays-racing";
import type { HorseMetricsAsOf } from "./horse-metrics";

describe("Today racing grouping", () => {
  test("groups UK and Ireland meetings in racecard index order", () => {
    const grouped = groupTodaysRacingRows(
      [
        row({
          courseId: "course-redcar",
          courseSourceId: "320",
          courseName: "Redcar",
          country: "ENG",
          raceId: "race-redcar",
          raceSourceId: "937442",
        }),
        row({
          courseId: "course-cork",
          courseSourceId: "344",
          courseName: "Cork",
          country: "Eire",
          raceId: "race-cork",
          raceSourceId: "937407",
        }),
        row({
          courseId: "course-carlisle",
          courseSourceId: "302",
          courseName: "Carlisle",
          country: "ENG",
          raceId: "race-carlisle",
          raceSourceId: "937435",
        }),
      ],
      meetingOrderFromIndexPayload(indexPayload(["302", "320", "344"])),
    );

    assert.deepEqual(
      grouped.map((meeting) => [meeting.courseName, meeting.country]),
      [
        ["Carlisle", "ENG"],
        ["Redcar", "ENG"],
        ["Cork", "Eire"],
      ],
    );
  });

  test("orders races by scheduled time within a meeting", () => {
    const grouped = groupTodaysRacingRows([
      row({
        raceId: "race-late",
        raceSourceId: "2",
        scheduledTime: "14:15:00",
      }),
      row({
        raceId: "race-early",
        raceSourceId: "1",
        scheduledTime: "13:40:00",
      }),
    ]);

    assert.deepEqual(
      grouped[0].races.map((race) => race.scheduledTime),
      ["13:40:00", "14:15:00"],
    );
  });

  test("orders runners by numeric fractional odds and keeps displayed odds unchanged", () => {
    const grouped = groupTodaysRacingRows([
      row({
        runnerId: "runner-5-2",
        saddleclothNumber: 3,
        horseName: "Five To Two",
        odds: "5/2",
      }),
      row({
        runnerId: "runner-6-4",
        saddleclothNumber: 1,
        horseName: "Six To Four",
        odds: "6/4",
      }),
      row({
        runnerId: "runner-10-1",
        saddleclothNumber: 5,
        horseName: "Ten To One",
        odds: "10/1",
      }),
      row({
        runnerId: "runner-4-1",
        saddleclothNumber: 4,
        horseName: "Four To One",
        odds: "4/1",
      }),
      row({
        runnerId: "runner-15-8",
        saddleclothNumber: 2,
        horseName: "Fifteen To Eight",
        odds: "15/8",
      }),
    ]);

    assert.deepEqual(
      grouped[0].races[0].runners.map((runner) => runner.odds),
      ["6/4", "15/8", "5/2", "4/1", "10/1"],
    );
  });

  test("uses decimal odds for sorting without changing displayed odds", () => {
    const grouped = groupTodaysRacingRows([
      row({
        runnerId: "runner-longer",
        saddleclothNumber: 1,
        horseName: "Longer",
        odds: "6/4",
        oddsDecimal: "3.25",
      }),
      row({
        runnerId: "runner-shorter",
        saddleclothNumber: 2,
        horseName: "Shorter",
        odds: "15/8",
        oddsDecimal: "2.10",
      }),
    ]);

    assert.deepEqual(
      grouped[0].races[0].runners.map((runner) => runner.odds),
      ["15/8", "6/4"],
    );
  });

  test("uses saddlecloth order as the stable order for equal prices", () => {
    const grouped = groupTodaysRacingRows([
      row({
        runnerId: "runner-3",
        runnerSourceId: "ride-3",
        saddleclothNumber: 3,
        horseName: "Third",
        odds: "5/1",
      }),
      row({
        runnerId: "runner-1",
        runnerSourceId: "ride-1",
        saddleclothNumber: 1,
        horseName: "First",
        odds: "5/1",
      }),
    ]);

    assert.deepEqual(
      grouped[0].races[0].runners.map((runner) => runner.horseName),
      ["First", "Third"],
    );
  });

  test("sorts missing or unparseable odds after valid odds", () => {
    const grouped = groupTodaysRacingRows([
      row({
        runnerId: "runner-missing",
        saddleclothNumber: 1,
        horseName: "Missing",
        odds: null,
      }),
      row({
        runnerId: "runner-unparseable",
        saddleclothNumber: 2,
        horseName: "Unparseable",
        odds: "SP",
      }),
      row({
        runnerId: "runner-valid",
        saddleclothNumber: 3,
        horseName: "Valid",
        odds: "10/1",
      }),
    ]);

    assert.deepEqual(
      grouped[0].races[0].runners.map((runner) => runner.horseName),
      ["Valid", "Missing", "Unparseable"],
    );
  });

  test("orders non-runners after active runners while keeping them visible", () => {
    const grouped = groupTodaysRacingRows([
      row({
        runnerId: "runner-non-runner",
        runnerSourceId: "ride-1",
        saddleclothNumber: 1,
        horseName: "Non Runner",
        odds: "1/2",
        resultStatus: "non_runner",
      }),
      row({
        runnerId: "runner-active",
        runnerSourceId: "ride-2",
        saddleclothNumber: 2,
        horseName: "Active",
        odds: "10/1",
      }),
    ]);

    assert.deepEqual(
      grouped[0].races[0].runners.map((runner) => runner.horseName),
      ["Active", "Non Runner"],
    );
    assert.equal(grouped[0].races[0].runners[1].resultStatus, "non_runner");
  });

  test("attaches pre-race metrics to the matching runner only", () => {
    const metrics = metric({ latestJumpSpeedRating: 91 });
    const grouped = groupTodaysRacingRows(
      [
        row({ runnerId: "runner-with-metrics" }),
        row({ runnerId: "runner-without-metrics", saddleclothNumber: 2 }),
      ],
      new Map(),
      new Map([["runner-with-metrics", metrics]]),
    );

    assert.equal(
      grouped[0].races[0].runners[0].metrics?.latestJumpSpeedRating,
      91,
    );
    assert.equal(grouped[0].races[0].runners[1].metrics, null);
  });
});

describe("Today racing display helpers", () => {
  test("uses the Europe/London current date when no override is supplied", () => {
    assert.equal(
      resolveRacingDate({
        now: new Date("2026-09-09T23:30:00.000Z"),
      }).raceDate,
      "2026-09-10",
    );
  });

  test("explicit date override works", () => {
    assert.deepEqual(
      resolveRacingDate({
        dateParam: "2026-09-09",
        now: new Date("2026-09-10T12:00:00.000Z"),
      }),
      {
        raceDate: "2026-09-09",
        dateOverride: true,
        invalidDateParam: null,
      },
    );
  });

  test("invalid date override falls back to the Europe/London current date", () => {
    assert.deepEqual(
      resolveRacingDate({
        dateParam: "not-a-date",
        now: new Date("2026-09-10T12:00:00.000Z"),
      }),
      {
        raceDate: "2026-09-10",
        dateOverride: false,
        invalidDateParam: "not-a-date",
      },
    );
  });

  test("new racing day resolution does not reuse the prior day", () => {
    assert.equal(
      getLocalRacingDate(new Date("2026-09-10T00:30:00.000+01:00")),
      "2026-09-10",
    );
  });

  test("historical overrides are not labelled as today's racing", () => {
    assert.equal(
      racingPageTitle({
        raceDate: "2026-09-09",
        now: new Date("2026-09-10T12:00:00.000Z"),
      }),
      "Racing",
    );
  });

  test("current date is labelled as today's racing", () => {
    assert.equal(
      racingPageTitle({
        raceDate: "2026-09-10",
        now: new Date("2026-09-10T12:00:00.000Z"),
      }),
      "Today's Racing",
    );
  });

  test("identifies jump races and leaves flat races out of speed display", () => {
    assert.equal(
      isJumpRaceForDisplay({
        raceName: "Weatherbys Novices' Hurdle",
        raceType: null,
      }),
      true,
    );
    assert.equal(
      isJumpRaceForDisplay({
        raceName: "EBF Fillies' Restricted Novice Stakes",
        raceType: "stakes",
      }),
      false,
    );
  });

  test("formats the racing date without substituting another date", () => {
    assert.equal(formatRacingDate("2026-09-09"), "Wednesday 9 September 2026");
  });

  test("formats UK race times in BST from UTC race datetimes", () => {
    assert.equal(
      formatRaceTimeForDisplay({
        raceDateTime: new Date("2026-09-10T13:00:00.000Z"),
        scheduledTime: "13:00:00",
      }),
      "14:00",
    );
  });

  test("keeps UK winter race times on GMT", () => {
    assert.equal(
      formatRaceTimeForDisplay({
        raceDateTime: new Date("2026-12-05T14:00:00.000Z"),
        scheduledTime: "14:00:00",
      }),
      "14:00",
    );
  });

  test("formats Irish race times with the same local daylight offset", () => {
    assert.equal(
      formatRaceTimeForDisplay({
        raceDateTime: new Date("2026-09-10T15:30:00.000Z"),
        scheduledTime: "15:30:00",
      }),
      "16:30",
    );
  });

  test("falls back to stored scheduled time when no race datetime exists", () => {
    assert.equal(
      formatRaceTimeForDisplay({
        raceDateTime: null,
        scheduledTime: "14:05:00",
      }),
      "14:05",
    );
  });
});

function row(overrides: Partial<TodayRacecardRow> = {}): TodayRacecardRow {
  return {
    raceId: "race-1",
    raceSourceId: "937435",
    raceDate: "2026-09-09",
    raceDateTime: new Date("2026-09-09T12:40:00.000Z"),
    scheduledTime: "13:40:00",
    raceName: "Carlisle Novice",
    raceClass: "4",
    raceType: "novice",
    raceTypeCode: null,
    distance: "5f 182y",
    distanceYards: 1282,
    going: "Good",
    declaredRunnerCount: 2,
    actualRunnerCount: null,
    winningTime: null,
    courseId: "course-carlisle",
    courseSourceId: "302",
    courseName: "Carlisle",
    country: "ENG",
    runnerId: "runner-1",
    runnerSourceId: "ride-1",
    horseId: "horse-1",
    horseName: "First",
    saddleclothNumber: 1,
    horseAge: 2,
    horseSex: "f",
    weight: "9-2",
    draw: 6,
    jockeyName: "A Jockey",
    trainerName: "A Trainer",
    officialRating: 82,
    odds: "6/1",
    oddsDecimal: null,
    resultStatus: null,
    finishingPosition: null,
    ...overrides,
  };
}

function metric(
  overrides: Partial<HorseMetricsAsOf> = {},
): HorseMetricsAsOf {
  return {
    priorRuns: 1,
    priorWins: 0,
    priorPlaces: 1,
    winPercentage: 0,
    placePercentage: 100,
    latestRpr: null,
    previousRpr: null,
    bestRprLast3: null,
    bestRprLast5: null,
    averageRprLast3: null,
    averageRprLast5: null,
    latestTs: null,
    previousTs: null,
    bestTsLast3: null,
    bestTsLast5: null,
    averageTsLast3: null,
    averageTsLast5: null,
    latestJumpSpeedRating: null,
    previousJumpSpeedRating: null,
    bestJumpSpeedLast3: null,
    bestJumpSpeedLast5: null,
    averageJumpSpeedLast3: null,
    averageJumpSpeedLast5: null,
    latestOr: null,
    latestRprMinusPreviousRpr: null,
    latestTsMinusPreviousTs: null,
    latestRprMinusLatestOr: null,
    latestRunDate: "2026-09-01",
    daysSinceLastRun: 8,
    runsAtCourse: 0,
    winsAtCourse: 0,
    placesAtCourse: 0,
    runsAtExactDistance: 0,
    winsAtExactDistance: 0,
    placesAtExactDistance: 0,
    runsOnGoing: 0,
    winsOnGoing: 0,
    placesOnGoing: 0,
    ...overrides,
  };
}

function indexPayload(courseIds: string[]) {
  return {
    props: {
      pageProps: {
        meetings: courseIds.map((courseId) => ({
          meeting_summary: {
            course: {
              course_reference: {
                id: courseId,
              },
            },
          },
        })),
      },
    },
  };
}
