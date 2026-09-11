import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { and, eq, inArray, lte } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { raceRunners, races } from "@/db/schema";
import {
  calculateHorseMetricsAsOf,
  calculateTargetRunnerMetrics,
  isRunnableResultStatus,
  type HistoricalRunInput,
  type TargetRunnerMetrics,
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
    assert.equal(metrics.latestJumpSpeedRating, null);
    assert.equal(metrics.bestJumpSpeedLast3, null);
    assert.equal(metrics.averageJumpSpeedLast3, null);
    assert.equal(metrics.latestAwSpeedRating, null);
    assert.equal(metrics.bestAwSpeedLast3, null);
    assert.equal(metrics.averageAwSpeedLast3, null);
    assert.equal(metrics.latestTurfSpeedRating, null);
    assert.equal(metrics.bestTurfSpeedLast3, null);
    assert.equal(metrics.averageTurfSpeedLast3, null);
  });

  test("does not count non-runners as prior runs", () => {
    const metrics = calculateHorseMetricsAsOf({
      beforeDateTime: cutoff,
      runs: [
        run({
          raceDateTime: new Date("2020-09-30T15:00:00.000Z"),
          raceDate: "2020-09-30",
          resultStatus: "non_runner",
        }),
      ],
    });

    assert.equal(metrics.priorRuns, 0);
    assert.equal(metrics.latestRunDate, null);
  });

  test("does not count imported racecard rows without a result as prior runs", () => {
    const metrics = calculateHorseMetricsAsOf({
      beforeDateTime: cutoff,
      runs: [
        run({
          raceDateTime: new Date("2020-09-30T15:00:00.000Z"),
          raceDate: "2020-09-30",
          finishingPosition: null,
          resultStatus: null,
        }),
      ],
    });

    assert.equal(metrics.priorRuns, 0);
    assert.equal(metrics.latestRunDate, null);
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

  test("uses only available jump speed ratings and does not treat missing as zero", () => {
    const metrics = calculateHorseMetricsAsOf({
      beforeDateTime: cutoff,
      runs: [
        run({
          raceDateTime: new Date("2020-09-30T15:00:00.000Z"),
          raceDate: "2020-09-30",
          jumpSpeedRating: {
            rating: null,
            method: "withheld",
            confidence: "low",
            baseRating: 50,
            sameDayAdjustedRating: null,
            cumulativeBeatenLengths: 80,
            standardSampleSize: 12,
            sameDaySampleSize: null,
            withheldReason: "beaten_distance_gt_75_lengths",
            calculationVersion: "jump_speed_v1",
          },
        }),
        run({
          raceDateTime: new Date("2020-09-20T15:00:00.000Z"),
          raceDate: "2020-09-20",
          jumpSpeedRating: {
            rating: 92,
            method: "base",
            confidence: "medium",
            baseRating: 92,
            sameDayAdjustedRating: null,
            cumulativeBeatenLengths: 10,
            standardSampleSize: 8,
            sameDaySampleSize: null,
            withheldReason: null,
            calculationVersion: "jump_speed_v1",
          },
        }),
      ],
    });

    assert.equal(metrics.latestJumpSpeedRating, 92);
    assert.equal(metrics.previousJumpSpeedRating, null);
    assert.equal(metrics.bestJumpSpeedLast3, 92);
    assert.equal(metrics.averageJumpSpeedLast3, 92);
  });

  test("calculates latest, previous, best and average jump speed ratings", () => {
    const metrics = calculateHorseMetricsAsOf({
      beforeDateTime: cutoff,
      runs: [
        run({
          raceDateTime: new Date("2020-09-30T15:00:00.000Z"),
          raceDate: "2020-09-30",
          jumpSpeedRating: jumpRating(91),
        }),
        run({
          raceDateTime: new Date("2020-09-20T15:00:00.000Z"),
          raceDate: "2020-09-20",
          jumpSpeedRating: jumpRating(105),
        }),
        run({
          raceDateTime: new Date("2020-09-10T15:00:00.000Z"),
          raceDate: "2020-09-10",
          jumpSpeedRating: jumpRating(87),
        }),
        run({
          raceDateTime: new Date("2020-09-01T15:00:00.000Z"),
          raceDate: "2020-09-01",
          jumpSpeedRating: jumpRating(99),
        }),
      ],
    });

    assert.equal(metrics.latestJumpSpeedRating, 91);
    assert.equal(metrics.previousJumpSpeedRating, 105);
    assert.equal(metrics.bestJumpSpeedLast3, 105);
    assert.equal(metrics.bestJumpSpeedLast5, 105);
    assert.equal(metrics.averageJumpSpeedLast3, 94.33333333333333);
    assert.equal(metrics.averageJumpSpeedLast5, 95.5);
  });

  test("translates historical performance to the target race weight", () => {
    const metrics = calculateHorseMetricsAsOf({
      beforeDateTime: cutoff,
      targetWeightCarriedLbs: 154,
      runs: [
        run({
          raceDateTime: new Date("2020-09-30T15:00:00.000Z"),
          raceDate: "2020-09-30",
          weightCarriedLbs: 168,
          jumpSpeedRating: jumpRating(110),
        }),
        run({
          raceDateTime: new Date("2020-09-20T15:00:00.000Z"),
          raceDate: "2020-09-20",
          weightCarriedLbs: 154,
          jumpSpeedRating: jumpRating(110),
        }),
      ],
    });

    assert.equal(metrics.latestJumpSpeedRating, 110);
    assert.equal(metrics.latestPerformanceRating, 110);
    assert.equal(metrics.previousPerformanceRating, 96);
    assert.equal(metrics.latestTodaysRating, 124);
    assert.equal(metrics.previousTodaysRating, 110);
    assert.equal(metrics.bestTodaysRatingLast3, 124);
    assert.equal(metrics.averageTodaysRatingLast3, 117);
    assert.equal(metrics.todaysRatingCalculationVersion, "todays_rating_v1");
  });

  test("calculates latest, previous, best and average AW speed ratings separately", () => {
    const metrics = calculateHorseMetricsAsOf({
      beforeDateTime: cutoff,
      runs: [
        run({
          raceDateTime: new Date("2020-09-30T15:00:00.000Z"),
          raceDate: "2020-09-30",
          awSpeedRating: awRating(91),
          jumpSpeedRating: jumpRating(120),
        }),
        run({
          raceDateTime: new Date("2020-09-20T15:00:00.000Z"),
          raceDate: "2020-09-20",
          awSpeedRating: awRating(105),
        }),
        run({
          raceDateTime: new Date("2020-09-10T15:00:00.000Z"),
          raceDate: "2020-09-10",
          awSpeedRating: awRating(87),
        }),
        run({
          raceDateTime: new Date("2020-09-01T15:00:00.000Z"),
          raceDate: "2020-09-01",
          awSpeedRating: awRating(99),
        }),
      ],
    });

    assert.equal(metrics.latestAwSpeedRating, 91);
    assert.equal(metrics.previousAwSpeedRating, 105);
    assert.equal(metrics.bestAwSpeedLast3, 105);
    assert.equal(metrics.bestAwSpeedLast5, 105);
    assert.equal(metrics.averageAwSpeedLast3, 94.33333333333333);
    assert.equal(metrics.averageAwSpeedLast5, 95.5);
    assert.equal(metrics.latestJumpSpeedRating, 120);
  });

  test("calculates latest, previous, best and average Turf speed ratings separately", () => {
    const metrics = calculateHorseMetricsAsOf({
      beforeDateTime: cutoff,
      runs: [
        run({
          raceDateTime: new Date("2020-09-30T15:00:00.000Z"),
          raceDate: "2020-09-30",
          turfSpeedRating: turfRating(91),
          awSpeedRating: awRating(120),
        }),
        run({
          raceDateTime: new Date("2020-09-20T15:00:00.000Z"),
          raceDate: "2020-09-20",
          turfSpeedRating: turfRating(105),
        }),
        run({
          raceDateTime: new Date("2020-09-10T15:00:00.000Z"),
          raceDate: "2020-09-10",
          turfSpeedRating: turfRating(87),
        }),
        run({
          raceDateTime: new Date("2020-09-01T15:00:00.000Z"),
          raceDate: "2020-09-01",
          turfSpeedRating: turfRating(99),
        }),
      ],
    });

    assert.equal(metrics.latestTurfSpeedRating, 91);
    assert.equal(metrics.previousTurfSpeedRating, 105);
    assert.equal(metrics.bestTurfSpeedLast3, 105);
    assert.equal(metrics.bestTurfSpeedLast5, 105);
    assert.equal(metrics.averageTurfSpeedLast3, 94.33333333333333);
    assert.equal(metrics.averageTurfSpeedLast5, 95.5);
    assert.equal(metrics.latestAwSpeedRating, 120);
  });
});

function jumpRating(rating: number): HistoricalRunInput["jumpSpeedRating"] {
  return {
    rating,
    method: "same_day",
    confidence: "high",
    baseRating: rating - 2,
    sameDayAdjustedRating: rating,
    cumulativeBeatenLengths: 5,
    standardSampleSize: 12,
    sameDaySampleSize: 4,
    withheldReason: null,
    calculationVersion: "jump_speed_v1",
  };
}

function awRating(rating: number): HistoricalRunInput["awSpeedRating"] {
  return {
    rating,
    method: "same_day",
    confidence: "high",
    baseRating: rating - 2,
    sameDayAdjustedRating: rating,
    cumulativeBeatenLengths: 5,
    standardSampleSize: 40,
    sameDaySampleSize: 3,
    unavailableReason: null,
    withheldReason: null,
    standardSeconds: 100,
    equivalentTimeSeconds: 99,
    secondsPerLength: 0.15,
    calculationVersion: "aw_speed_v1",
  };
}

function turfRating(rating: number): HistoricalRunInput["turfSpeedRating"] {
  return {
    rating,
    method: "same_day",
    confidence: "high",
    baseRating: rating - 2,
    sameDayAdjustedRating: rating,
    cumulativeBeatenLengths: 5,
    standardSampleSize: 8,
    sameDaySampleSize: 3,
    unavailableReason: null,
    withheldReason: null,
    standardSeconds: 100,
    equivalentTimeSeconds: 99,
    calculationVersion: "turf_speed_v1",
  };
}

function target(
  overrides: Partial<TargetRunnerMetrics["target"]> & {
    runnerId: string;
    horseId: string;
    raceDateTime: Date;
  },
): TargetRunnerMetrics["target"] {
  const { horseId, raceDateTime, runnerId, ...rest } = overrides;
  return {
    source: "sporting_life",
    runnerId,
    horseId,
    horseName: "Target",
    raceDateTime,
    raceDate: "2020-09-13",
    scheduledTime: "12:00:00",
    courseId: targetCourseId,
    courseName: "Bath",
    raceName: "Target race",
    raceType: "handicap",
    distanceYards: targetDistanceYards,
    going: targetGoing,
    weightCarriedLbs: 126,
    ...rest,
  };
}

describe("calculateTargetRunnerMetrics", () => {
  const targetTime = new Date("2020-09-13T12:00:00.000Z");

  test("returns zero prior runs when a target horse has no earlier run", () => {
    const [result] = calculateTargetRunnerMetrics({
      targets: [
        target({
          runnerId: "runner-target",
          horseId: "horse-no-history",
          raceDateTime: targetTime,
        }),
      ],
      candidateRuns: [
        run({
          horseId: "another-horse",
          source: "sporting_life",
          raceDateTime: new Date("2020-09-12T12:00:00.000Z"),
          raceDate: "2020-09-12",
        }),
      ],
    });

    assert.equal(result.metrics.priorRuns, 0);
  });

  test("counts one genuine earlier run for the same horse and source", () => {
    const [result] = calculateTargetRunnerMetrics({
      targets: [
        target({
          runnerId: "runner-target",
          horseId,
          raceDateTime: targetTime,
        }),
      ],
      candidateRuns: [
        run({
          horseId,
          source: "sporting_life",
          raceDateTime: new Date("2020-09-12T12:00:00.000Z"),
          raceDate: "2020-09-12",
          finishingPosition: 2,
        }),
      ],
    });

    assert.equal(result.metrics.priorRuns, 1);
    assert.equal(result.metrics.priorPlaces, 1);
  });

  test("does not let another horse's run leak into target history", () => {
    const [result] = calculateTargetRunnerMetrics({
      targets: [
        target({
          runnerId: "runner-target",
          horseId,
          raceDateTime: targetTime,
        }),
      ],
      candidateRuns: [
        run({
          horseId: "another-horse",
          source: "sporting_life",
          raceDateTime: new Date("2020-09-12T12:00:00.000Z"),
          raceDate: "2020-09-12",
          finishingPosition: 1,
        }),
      ],
    });

    assert.equal(result.metrics.priorRuns, 0);
    assert.equal(result.metrics.priorWins, 0);
  });

  test("excludes the target race itself and later races", () => {
    const [result] = calculateTargetRunnerMetrics({
      targets: [
        target({
          runnerId: "runner-target",
          horseId,
          raceDateTime: targetTime,
        }),
      ],
      candidateRuns: [
        run({
          horseId,
          source: "sporting_life",
          raceDateTime: targetTime,
          raceDate: "2020-09-13",
          finishingPosition: 1,
        }),
        run({
          horseId,
          source: "sporting_life",
          raceDateTime: new Date("2020-09-14T12:00:00.000Z"),
          raceDate: "2020-09-14",
          finishingPosition: 1,
        }),
      ],
    });

    assert.equal(result.metrics.priorRuns, 0);
  });

  test("does not let Racing Post rows leak into Sporting Life history", () => {
    const [result] = calculateTargetRunnerMetrics({
      targets: [
        target({
          runnerId: "runner-target",
          horseId,
          raceDateTime: targetTime,
        }),
      ],
      candidateRuns: [
        run({
          horseId,
          source: "racing-post",
          raceDateTime: new Date("2020-09-12T12:00:00.000Z"),
          raceDate: "2020-09-12",
          finishingPosition: 1,
        }),
      ],
    });

    assert.equal(result.metrics.priorRuns, 0);
  });

  test("bulk metrics match the single-horse calculation for sampled horses", () => {
    const candidateRuns = [
      run({
        horseId,
        source: "sporting_life",
        raceDateTime: new Date("2020-09-12T12:00:00.000Z"),
        raceDate: "2020-09-12",
        finishingPosition: 1,
      }),
      run({
        horseId: "another-horse",
        source: "sporting_life",
        raceDateTime: new Date("2020-09-11T12:00:00.000Z"),
        raceDate: "2020-09-11",
        finishingPosition: 2,
      }),
      run({
        horseId,
        source: "sporting_life",
        raceDateTime: targetTime,
        raceDate: "2020-09-13",
        finishingPosition: 4,
      }),
    ];
    const [bulkResult] = calculateTargetRunnerMetrics({
      targets: [
        target({
          runnerId: "runner-target",
          horseId,
          raceDateTime: targetTime,
        }),
      ],
      candidateRuns,
    });
    const singleHorseMetrics = calculateHorseMetricsAsOf({
      beforeDateTime: targetTime,
      targetCourseId,
      targetDistanceYards,
      targetGoing,
      runs: candidateRuns.filter(
        (candidateRun) =>
          candidateRun.source === "sporting_life" &&
          candidateRun.horseId === horseId,
      ),
    });

    assert.deepEqual(bulkResult.metrics, singleHorseMetrics);
  });

  test("bulk metrics exclude withheld speed ratings deterministically", () => {
    const [result] = calculateTargetRunnerMetrics({
      targets: [
        target({
          runnerId: "runner-target",
          horseId,
          raceDateTime: targetTime,
        }),
      ],
      candidateRuns: [
        run({
          horseId,
          source: "sporting_life",
          raceDateTime: new Date("2020-09-12T12:00:00.000Z"),
          raceDate: "2020-09-12",
          jumpSpeedRating: {
            rating: null,
            method: "withheld",
            confidence: "low",
            baseRating: 40,
            sameDayAdjustedRating: null,
            cumulativeBeatenLengths: 80,
            standardSampleSize: 12,
            sameDaySampleSize: null,
            withheldReason: "beaten_distance_gt_75_lengths",
            calculationVersion: "jump_speed_v1",
          },
        }),
        run({
          horseId,
          source: "sporting_life",
          raceDateTime: new Date("2020-09-10T12:00:00.000Z"),
          raceDate: "2020-09-10",
          jumpSpeedRating: jumpRating(88),
        }),
      ],
    });

    assert.equal(result.metrics.latestJumpSpeedRating, 88);
    assert.equal(result.metrics.previousJumpSpeedRating, null);
  });
});

describe("isRunnableResultStatus", () => {
  test("keeps runnable status OR grouped inside candidate AND conditions", () => {
    const dialect = new PgDialect();
    const latestTargetDateTime = new Date("2026-09-10T18:20:00.000Z");
    const query = dialect.sqlToQuery(
      and(
        inArray(raceRunners.horseId, ["horse-1", "horse-2"]),
        eq(races.source, "sporting_life"),
        eq(raceRunners.source, "sporting_life"),
        isRunnableResultStatus(),
        lte(races.raceDatetime, latestTargetDateTime),
      )!,
    );

    assert.match(
      query.sql,
      /and \("race_runners"\."result_status" is null or "race_runners"\."result_status" <> \$\d+\) and/,
    );
    assert.doesNotMatch(
      query.sql,
      /and "race_runners"\."result_status" is null or "race_runners"\."result_status" <>/,
    );
    assert.deepEqual(query.params.slice(0, 4), [
      "horse-1",
      "horse-2",
      "sporting_life",
      "sporting_life",
    ]);
    assert.equal(query.params.includes("non_runner"), true);
  });
});
