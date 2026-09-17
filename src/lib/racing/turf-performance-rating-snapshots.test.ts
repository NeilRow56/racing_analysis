import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { TURF_PERFORMANCE_RATING_VERSION } from "./turf-performance-rating";
import {
  turfPerformanceRatingShadowSnapshotRows,
  turfPerformanceRatingSnapshotRows,
} from "./turf-performance-rating-snapshots";
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
      ratingBasis: "turf",
      isCrossSurfaceFallback: false,
      fallbackSourceSurface: null,
    }]);
  });

  test("builds W50 shadow snapshot rows with agreement and basis metadata", () => {
    const rows = turfPerformanceRatingShadowSnapshotRows([meeting()], "2026-09-16");

    assert.deepEqual(rows, [{
      raceId: "race-1",
      runnerId: "runner-1",
      horseId: "horse-1",
      raceDate: "2026-09-16",
      raceDatetime: new Date("2026-09-16T13:00:00.000Z"),
      formulaVersion: "TPR_S2_V1_W50_SHADOW",
      ratingBasis: "turf",
      isCrossSurfaceFallback: false,
      fallbackSourceSurface: null,
      w100Rating: "108.123",
      w100RawRating: "0.889100",
      w100Rank: 1,
      w50Rating: "107.000",
      w50RawRating: "0.750000",
      w50Rank: 1,
      isW100Rank1: true,
      isW50Rank1: true,
      shadowAgreement: true,
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
      turfPerformanceShadow: {
        checked: true,
        agreement: true,
        w100RunnerId: "runner-1",
        w100HorseName: "Rated",
        w50RunnerId: "runner-1",
        w50HorseName: "Rated",
      },
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
            basis: "turf",
            isCrossSurfaceFallback: false,
            fallbackSourceSurface: null,
          },
          turfPerformanceShadowRating: {
            rating: 107,
            rawRating: 0.75,
            rank: 1,
            gap: null,
            historyDepth: 2,
            version: TURF_PERFORMANCE_RATING_VERSION,
            basis: "turf",
            isCrossSurfaceFallback: false,
            fallbackSourceSurface: null,
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
