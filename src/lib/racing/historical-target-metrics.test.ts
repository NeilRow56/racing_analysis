import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  buildHistoricalTargetRunnerMetricRows,
  type HistoricalCandidateRun,
  type HistoricalTargetRow,
} from "./historical-target-metrics";

const targetTime = new Date("2026-09-10T14:00:00.000Z");

function target(overrides: Partial<HistoricalTargetRow> = {}): HistoricalTargetRow {
  return {
    targetRaceId: "race-target",
    targetRunnerId: "runner-target",
    source: "sporting_life",
    horseId: "horse-1",
    horseName: "Example Horse",
    raceDateTime: targetTime,
    raceDate: "2026-09-10",
    courseId: "course-worcester",
    courseName: "Worcester",
    raceName: "Novices' Handicap Chase",
    raceClass: "Class 3",
    raceType: "Chase",
    raceTypeCode: null,
    distanceYards: 4400,
    going: "Good",
    declaredRunnerCount: 8,
    actualRunnerCount: 7,
    surface: null,
    horseAge: 7,
    officialRating: 132,
    weight: "11-12",
    weightCarriedLbs: 166,
    draw: null,
    finishingPosition: 1,
    resultStatus: "finished",
    startingPrice: "6/4",
    startingPriceDecimal: "2.500",
    ...overrides,
  };
}

function run(
  overrides: Partial<HistoricalCandidateRun> & {
    runnerId: string;
    raceDateTime: Date;
    raceDate: string;
  },
): HistoricalCandidateRun {
  return {
    source: "sporting_life",
    horseId: "horse-1",
    courseId: "course-perth",
    courseName: "Perth",
    raceName: "Handicap Chase",
    raceType: "Chase",
    raceTypeCode: null,
    distanceYards: 4400,
    going: "Good",
    surface: null,
    finishingPosition: 2,
    resultStatus: "finished",
    racingPostRating: null,
    topspeedRating: null,
    officialRating: null,
    weightCarriedLbs: 168,
    ...overrides,
  };
}

function jumpRating(rating: number): HistoricalCandidateRun["jumpSpeedRating"] {
  return {
    rating,
    method: "base",
    confidence: "medium",
    baseRating: rating,
    sameDayAdjustedRating: null,
    cumulativeBeatenLengths: 3,
    standardSampleSize: 8,
    sameDaySampleSize: null,
    withheldReason: null,
    calculationVersion: "jump_speed_v1",
  };
}

describe("buildHistoricalTargetRunnerMetricRows", () => {
  test("keeps target outcome and starting price out of pre-race features", () => {
    const [row] = buildHistoricalTargetRunnerMetricRows({
      targets: [target()],
      candidateRuns: [],
    });

    assert.equal(row.features.priorWins, 0);
    assert.equal(row.features.odds, null);
    assert.equal(row.features.oddsDecimal, null);
    assert.equal(row.outcome.won, true);
    assert.equal(row.outcome.startingPrice, "6/4");
    assert.equal(row.outcome.startingPriceDecimal, "2.500");
  });

  test("uses only same-horse same-source completed prior history before the target", () => {
    const [row] = buildHistoricalTargetRunnerMetricRows({
      targets: [target()],
      candidateRuns: [
        run({
          runnerId: "prior-good",
          raceDate: "2026-08-15",
          raceDateTime: new Date("2026-08-15T14:00:00.000Z"),
          officialRating: 128,
          finishingPosition: 1,
          jumpSpeedRating: jumpRating(133),
        }),
        run({
          runnerId: "target-race-leak",
          raceDate: "2026-09-10",
          raceDateTime: targetTime,
          finishingPosition: 1,
          jumpSpeedRating: jumpRating(180),
        }),
        run({
          runnerId: "future-leak",
          raceDate: "2026-09-11",
          raceDateTime: new Date("2026-09-11T14:00:00.000Z"),
          finishingPosition: 1,
          jumpSpeedRating: jumpRating(190),
        }),
        run({
          runnerId: "other-source",
          source: "racing-post",
          raceDate: "2026-08-20",
          raceDateTime: new Date("2026-08-20T14:00:00.000Z"),
          finishingPosition: 1,
          jumpSpeedRating: jumpRating(170),
        }),
      ],
    });

    assert.equal(row.features.priorRuns, 1);
    assert.equal(row.features.priorWins, 1);
    assert.equal(row.features.latestOr, 128);
    assert.equal(row.features.previousOr, null);
    assert.equal(row.features.latestSpeedRating, 133);
    assert.equal(row.features.latestJumpSpeedRating, 133);
    assert.equal(row.features.latestSpeedMethod, "base");
    assert.equal(row.features.latestSpeedConfidence, "medium");
    assert.equal(row.features.speedCalculationVersion, "jump_speed_v1");
  });

  test("derives performance from the historical run weight, not target weight", () => {
    const [result] = buildHistoricalTargetRunnerMetricRows({
      targets: [
        target({
          weightCarriedLbs: 140,
        }),
      ],
      candidateRuns: [
        run({
          runnerId: "prior-heavy",
          raceDate: "2026-08-15",
          raceDateTime: new Date("2026-08-15T14:00:00.000Z"),
          weightCarriedLbs: 168,
          jumpSpeedRating: jumpRating(110),
        }),
      ],
    });

    assert.equal(result.features.latestSpeedRating, 110);
    assert.equal(result.features.latestPerformanceRating, 110);
    assert.equal(
      result.features.latestPerformanceCalculationVersion,
      "weight_performance_v1",
    );
  });

  test("keeps performance missing when the historical run weight is missing", () => {
    const [result] = buildHistoricalTargetRunnerMetricRows({
      targets: [target()],
      candidateRuns: [
        run({
          runnerId: "prior-no-weight",
          raceDate: "2026-08-15",
          raceDateTime: new Date("2026-08-15T14:00:00.000Z"),
          weightCarriedLbs: null,
          jumpSpeedRating: jumpRating(110),
        }),
      ],
    });

    assert.equal(result.features.latestSpeedRating, 110);
    assert.equal(result.features.latestPerformanceRating, null);
  });

  test("derives today's rating from prior performance and target race weight only", () => {
    const candidateRuns = [
      run({
        runnerId: "prior",
        raceDate: "2026-08-15",
        raceDateTime: new Date("2026-08-15T14:00:00.000Z"),
        weightCarriedLbs: 168,
        jumpSpeedRating: jumpRating(110),
      }),
    ];
    const [winnerTarget] = buildHistoricalTargetRunnerMetricRows({
      targets: [
        target({
          finishingPosition: 1,
          weightCarriedLbs: 154,
        }),
      ],
      candidateRuns,
    });
    const [beatenTarget] = buildHistoricalTargetRunnerMetricRows({
      targets: [
        target({
          finishingPosition: 8,
          weightCarriedLbs: 154,
        }),
      ],
      candidateRuns,
    });

    assert.equal(winnerTarget.features.latestTodaysRating, 124);
    assert.equal(beatenTarget.features.latestTodaysRating, 124);
    assert.equal(
      winnerTarget.features.todaysRatingCalculationVersion,
      "todays_rating_v1",
    );
  });

  test("excludes non-runners, unfinished rows, and withheld speed ratings", () => {
    const [row] = buildHistoricalTargetRunnerMetricRows({
      targets: [target()],
      candidateRuns: [
        run({
          runnerId: "non-runner",
          raceDate: "2026-08-01",
          raceDateTime: new Date("2026-08-01T14:00:00.000Z"),
          resultStatus: "non_runner",
          finishingPosition: null,
          jumpSpeedRating: jumpRating(160),
        }),
        run({
          runnerId: "unfinished",
          raceDate: "2026-08-02",
          raceDateTime: new Date("2026-08-02T14:00:00.000Z"),
          resultStatus: null,
          finishingPosition: null,
          jumpSpeedRating: jumpRating(150),
        }),
        run({
          runnerId: "withheld",
          raceDate: "2026-08-03",
          raceDateTime: new Date("2026-08-03T14:00:00.000Z"),
          finishingPosition: 6,
          jumpSpeedRating: {
            rating: null,
            method: "withheld",
            confidence: "low",
            baseRating: 40,
            sameDayAdjustedRating: null,
            cumulativeBeatenLengths: 85,
            standardSampleSize: 6,
            sameDaySampleSize: null,
            withheldReason: "beaten_distance_gt_75_lengths",
            calculationVersion: "jump_speed_v1",
          },
        }),
        run({
          runnerId: "rated",
          raceDate: "2026-07-01",
          raceDateTime: new Date("2026-07-01T14:00:00.000Z"),
          finishingPosition: 3,
          jumpSpeedRating: jumpRating(99),
        }),
      ],
    });

    assert.equal(row.features.priorRuns, 2);
    assert.equal(row.features.latestSpeedRating, 99);
    assert.equal(row.features.previousSpeedRating, null);
    assert.equal(row.features.bestSpeedLast3, 99);
  });

  test("uses race-family-specific generic speed fields", () => {
    const [row] = buildHistoricalTargetRunnerMetricRows({
      targets: [
        target({
          raceName: "Flat Handicap",
          raceType: "Flat",
          raceTypeCode: null,
          courseName: "Bath",
          surface: "TURF",
          distanceYards: 1760,
        }),
      ],
      candidateRuns: [
        run({
          runnerId: "turf-prior",
          raceName: "Flat Handicap",
          raceType: "Flat",
          surface: "TURF",
          raceDate: "2026-07-01",
          raceDateTime: new Date("2026-07-01T14:00:00.000Z"),
          turfSpeedRating: {
            rating: 104,
            method: "same_day",
            confidence: "high",
            baseRating: 101,
            sameDayAdjustedRating: 104,
            standardSampleSize: 9,
            sameDaySampleSize: 4,
            cumulativeBeatenLengths: 1,
            unavailableReason: null,
            withheldReason: null,
            standardSeconds: 100,
            equivalentTimeSeconds: 99,
            calculationVersion: "turf_speed_v1",
          },
        }),
      ],
    });

    assert.equal(row.features.raceCode, "turf");
    assert.equal(row.features.latestSpeedRating, 104);
    assert.equal(row.features.latestTurfSpeedRating, 104);
    assert.equal(row.features.latestJumpSpeedRating, null);
    assert.equal(row.features.latestSpeedMethod, "same_day");
  });
});
