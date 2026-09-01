import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  calculateHorseMetricsAsOf,
  type HistoricalRunInput,
} from "./horse-metrics";

const horseId = "horse-1";
const targetCourseId = "course-a";
const targetDistanceYards = 1760;
const targetGoing = "Good";
const cutoff = new Date("2020-10-01T15:00:00.000Z");

function run(
  overrides: Partial<HistoricalRunInput> & {
    raceDateTime: Date;
    raceDate: string;
  },
): HistoricalRunInput {
  return {
    horseId,
    courseId: "course-b",
    distanceYards: 1320,
    going: "Soft",
    finishingPosition: 4,
    resultStatus: "finished",
    racingPostRating: null,
    topspeedRating: null,
    officialRating: null,
    ...overrides,
  };
}

describe("calculateHorseMetricsAsOf", () => {
  test("excludes a run at the cutoff time and later runs", () => {
    const metrics = calculateHorseMetricsAsOf({
      beforeDateTime: cutoff,
      targetCourseId,
      targetDistanceYards,
      targetGoing,
      runs: [
        run({
          raceDateTime: new Date("2020-10-01T15:00:00.000Z"),
          raceDate: "2020-10-01",
          finishingPosition: 1,
          racingPostRating: 100,
          topspeedRating: 90,
        }),
        run({
          raceDateTime: new Date("2020-10-02T15:00:00.000Z"),
          raceDate: "2020-10-02",
          finishingPosition: 1,
          racingPostRating: 110,
          topspeedRating: 95,
        }),
        run({
          raceDateTime: new Date("2020-09-30T15:00:00.000Z"),
          raceDate: "2020-09-30",
          finishingPosition: 2,
          racingPostRating: 80,
          topspeedRating: 70,
        }),
      ],
    });

    assert.equal(metrics.priorRuns, 1);
    assert.equal(metrics.priorWins, 0);
    assert.equal(metrics.priorPlaces, 1);
    assert.equal(metrics.latestRpr, 80);
    assert.equal(metrics.latestTs, 70);
    assert.equal(metrics.latestRunDate, "2020-09-30");
  });

  test("uses only earlier runs for latest, previous, best, and average ratings", () => {
    const metrics = calculateHorseMetricsAsOf({
      beforeDateTime: cutoff,
      runs: [
        run({
          raceDateTime: new Date("2020-09-30T15:00:00.000Z"),
          raceDate: "2020-09-30",
          racingPostRating: 80,
          topspeedRating: 70,
          officialRating: 75,
        }),
        run({
          raceDateTime: new Date("2020-09-20T15:00:00.000Z"),
          raceDate: "2020-09-20",
          racingPostRating: 90,
          topspeedRating: 60,
          officialRating: 72,
        }),
        run({
          raceDateTime: new Date("2020-09-10T15:00:00.000Z"),
          raceDate: "2020-09-10",
          racingPostRating: null,
          topspeedRating: 65,
          officialRating: null,
        }),
        run({
          raceDateTime: new Date("2020-09-01T15:00:00.000Z"),
          raceDate: "2020-09-01",
          racingPostRating: 70,
          topspeedRating: null,
        }),
      ],
    });

    assert.equal(metrics.latestRpr, 80);
    assert.equal(metrics.previousRpr, 90);
    assert.equal(metrics.bestRprLast3, 90);
    assert.equal(metrics.bestRprLast5, 90);
    assert.equal(metrics.averageRprLast3, 85);
    assert.equal(metrics.averageRprLast5, 80);
    assert.equal(metrics.latestTs, 70);
    assert.equal(metrics.previousTs, 60);
    assert.equal(metrics.bestTsLast3, 70);
    assert.equal(metrics.averageTsLast3, 65);
    assert.equal(metrics.latestOr, 75);
    assert.equal(metrics.latestRprMinusPreviousRpr, -10);
    assert.equal(metrics.latestTsMinusPreviousTs, 10);
    assert.equal(metrics.latestRprMinusLatestOr, 5);
  });

  test("calculates course, exact-distance, and going records from prior runs only", () => {
    const metrics = calculateHorseMetricsAsOf({
      beforeDateTime: cutoff,
      targetCourseId,
      targetDistanceYards,
      targetGoing,
      runs: [
        run({
          raceDateTime: new Date("2020-09-30T15:00:00.000Z"),
          raceDate: "2020-09-30",
          courseId: targetCourseId,
          distanceYards: targetDistanceYards,
          going: targetGoing,
          finishingPosition: 1,
        }),
        run({
          raceDateTime: new Date("2020-09-20T15:00:00.000Z"),
          raceDate: "2020-09-20",
          courseId: targetCourseId,
          distanceYards: 1320,
          going: "Soft",
          finishingPosition: 3,
        }),
        run({
          raceDateTime: new Date("2020-09-10T15:00:00.000Z"),
          raceDate: "2020-09-10",
          courseId: "course-b",
          distanceYards: targetDistanceYards,
          going: targetGoing,
          finishingPosition: 2,
        }),
        run({
          raceDateTime: cutoff,
          raceDate: "2020-10-01",
          courseId: targetCourseId,
          distanceYards: targetDistanceYards,
          going: targetGoing,
          finishingPosition: 1,
        }),
      ],
    });

    assert.equal(metrics.runsAtCourse, 2);
    assert.equal(metrics.winsAtCourse, 1);
    assert.equal(metrics.placesAtCourse, 2);
    assert.equal(metrics.runsAtExactDistance, 2);
    assert.equal(metrics.winsAtExactDistance, 1);
    assert.equal(metrics.placesAtExactDistance, 2);
    assert.equal(metrics.runsOnGoing, 2);
    assert.equal(metrics.winsOnGoing, 1);
    assert.equal(metrics.placesOnGoing, 2);
  });

  test("returns null for rating metrics when ratings are missing", () => {
    const metrics = calculateHorseMetricsAsOf({
      beforeDateTime: cutoff,
      runs: [
        run({
          raceDateTime: new Date("2020-09-30T15:00:00.000Z"),
          raceDate: "2020-09-30",
        }),
      ],
    });

    assert.equal(metrics.priorRuns, 1);
    assert.equal(metrics.latestRpr, null);
    assert.equal(metrics.bestRprLast3, null);
    assert.equal(metrics.averageRprLast3, null);
    assert.equal(metrics.latestTs, null);
    assert.equal(metrics.bestTsLast3, null);
    assert.equal(metrics.averageTsLast3, null);
    assert.equal(metrics.latestOr, null);
    assert.equal(metrics.latestRprMinusLatestOr, null);
  });

  test("calculates recency relative to the target cutoff", () => {
    const metrics = calculateHorseMetricsAsOf({
      beforeDateTime: cutoff,
      runs: [
        run({
          raceDateTime: new Date("2020-09-28T16:00:00.000Z"),
          raceDate: "2020-09-28",
        }),
      ],
    });

    assert.equal(metrics.latestRunDate, "2020-09-28");
    assert.equal(metrics.daysSinceLastRun, 2);
  });
});
