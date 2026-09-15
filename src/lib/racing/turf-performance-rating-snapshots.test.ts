import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { TURF_PERFORMANCE_RATING_VERSION } from "./turf-performance-rating";
import { turfPerformanceRatingSnapshotRows } from "./turf-performance-rating-snapshots";
import type { TodayMeeting } from "./todays-racing";

describe("Turf Performance Rating snapshots", () => {
  test("builds immutable pre-race snapshot rows for rated Turf runners only", () => {
    const rows = turfPerformanceRatingSnapshotRows([meeting()], "2026-09-16");

    assert.deepEqual(rows, [{
      raceId: "race-1",
      runnerId: "runner-1",
      horseId: "horse-1",
      raceDate: "2026-09-16",
      rating: "108.123",
      rawRating: "0.889100",
      rank: 1,
      gap: "6.432",
      historyDepth: 2,
      formulaVersion: TURF_PERFORMANCE_RATING_VERSION,
    }]);
  });
});

function meeting(): TodayMeeting {
  return {
    courseId: "course-1",
    courseSourceId: "301",
    courseName: "Ascot",
    country: "ENG",
    order: 1,
    races: [{
      raceId: "race-1",
      sourceId: "900001",
      scheduledTime: "14:00:00",
      raceDateTime: new Date("2026-09-16T13:00:00.000Z"),
      courseCountry: "ENG",
      raceName: "Turf Handicap",
      raceClass: "4",
      raceType: "handicap",
      raceTypeCode: null,
      distance: "1m",
      distanceYards: 1760,
      going: "Good",
      surface: "TURF",
      declaredRunnerCount: 2,
      actualRunnerCount: null,
      winningTime: null,
      runners: [
        {
          runnerId: "runner-1",
          runnerSourceId: "ride-1",
          horseId: "horse-1",
          horseName: "Rated",
          saddleclothNumber: 1,
          horseAge: 4,
          horseSex: "g",
          weight: "9-0",
          weightCarriedLbs: 126,
          draw: 1,
          jockeyName: "J Jockey",
          trainerId: "trainer-1",
          trainerName: "T Trainer",
          officialRating: 90,
          odds: null,
          oddsDecimal: null,
          resultStatus: null,
          finishingPosition: null,
          metrics: null,
          turfPerformanceRating: {
            rating: 108.1234,
            rawRating: 0.8891,
            rank: 1,
            gap: 6.4321,
            historyDepth: 2,
            version: TURF_PERFORMANCE_RATING_VERSION,
          },
        },
        {
          runnerId: "runner-2",
          runnerSourceId: "ride-2",
          horseId: "horse-2",
          horseName: "Unrated",
          saddleclothNumber: 2,
          horseAge: 5,
          horseSex: "m",
          weight: "9-0",
          weightCarriedLbs: 126,
          draw: 2,
          jockeyName: "K Jockey",
          trainerId: "trainer-2",
          trainerName: "U Trainer",
          officialRating: 80,
          odds: null,
          oddsDecimal: null,
          resultStatus: null,
          finishingPosition: null,
          metrics: null,
        },
      ],
    }],
  };
}
