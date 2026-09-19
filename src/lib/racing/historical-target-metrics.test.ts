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
    trainerId: "trainer-1",
    trainerName: "A Trainer",
    jockeyId: "jockey-1",
    jockeyName: "A Jockey",
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
    trainerId: "trainer-1",
    jockeyId: "jockey-1",
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
    assert.equal(row.features.trainerId, "trainer-1");
    assert.equal(row.features.trainerName, "A Trainer");
    assert.equal(row.features.jockeyId, "jockey-1");
    assert.equal(row.features.jockeyName, "A Jockey");
    assert.equal(row.features.jockeyPriorRuns, 0);
    assert.equal(row.features.jockeyPriorWins, 0);
    assert.equal(row.features.jockeyPriorWinRate, null);
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

  test("calculates jockey prior metrics as of the target race time", () => {
    const [row] = buildHistoricalTargetRunnerMetricRows({
      targets: [target()],
      candidateRuns: [
        run({
          runnerId: "prior-win",
          raceDate: "2026-08-15",
          raceDateTime: new Date("2026-08-15T14:00:00.000Z"),
          jockeyId: "jockey-1",
          finishingPosition: 1,
        }),
        run({
          runnerId: "prior-loss",
          raceDate: "2026-08-20",
          raceDateTime: new Date("2026-08-20T14:00:00.000Z"),
          jockeyId: "jockey-1",
          finishingPosition: 3,
        }),
        run({
          runnerId: "target-time",
          raceDate: "2026-09-10",
          raceDateTime: targetTime,
          jockeyId: "jockey-1",
          finishingPosition: 1,
        }),
        run({
          runnerId: "future",
          raceDate: "2026-09-11",
          raceDateTime: new Date("2026-09-11T14:00:00.000Z"),
          jockeyId: "jockey-1",
          finishingPosition: 1,
        }),
        run({
          runnerId: "other-jockey",
          raceDate: "2026-08-20",
          raceDateTime: new Date("2026-08-20T14:00:00.000Z"),
          jockeyId: "jockey-2",
          finishingPosition: 1,
        }),
      ],
    });

    assert.equal(row.features.jockeyPriorRuns, 2);
    assert.equal(row.features.jockeyPriorWins, 1);
    assert.equal(row.features.jockeyPriorWinRate, 50);
  });

  test("2026 targets can use legitimate December 2025 horse history", () => {
    const [row] = buildHistoricalTargetRunnerMetricRows({
      targets: [
        target({
          raceDate: "2026-01-10",
          raceDateTime: new Date("2026-01-10T14:00:00.000Z"),
        }),
      ],
      candidateRuns: [
        run({
          runnerId: "december-prior",
          raceDate: "2025-12-20",
          raceDateTime: new Date("2025-12-20T14:00:00.000Z"),
          officialRating: 125,
          finishingPosition: 1,
          jumpSpeedRating: jumpRating(131),
        }),
      ],
    });

    assert.equal(row.features.priorRuns, 1);
    assert.equal(row.features.priorWins, 1);
    assert.equal(row.features.latestRunDate, "2025-12-20");
    assert.equal(row.features.latestOr, 125);
    assert.equal(row.features.latestSpeedRating, 131);
  });

  test("counts career prior runs before each target as zero, one or multiple without future leakage", () => {
    const [debutant, secondRun, experienced] = buildHistoricalTargetRunnerMetricRows({
      targets: [
        target({
          targetRunnerId: "debutant-target",
          horseId: "horse-debutant",
          raceDateTime: new Date("2026-09-10T14:00:00.000Z"),
        }),
        target({
          targetRunnerId: "second-run-target",
          horseId: "horse-second-run",
          raceDateTime: new Date("2026-09-10T14:00:00.000Z"),
        }),
        target({
          targetRunnerId: "experienced-target",
          horseId: "horse-experienced",
          raceDateTime: new Date("2026-09-10T14:00:00.000Z"),
        }),
      ],
      candidateRuns: [
        run({
          horseId: "horse-second-run",
          runnerId: "second-run-prior",
          raceDate: "2026-08-15",
          raceDateTime: new Date("2026-08-15T14:00:00.000Z"),
          finishingPosition: 2,
        }),
        run({
          horseId: "horse-second-run",
          runnerId: "second-run-future",
          raceDate: "2026-09-11",
          raceDateTime: new Date("2026-09-11T14:00:00.000Z"),
          finishingPosition: 1,
        }),
        run({
          horseId: "horse-experienced",
          runnerId: "experienced-prior-1",
          raceDate: "2026-07-01",
          raceDateTime: new Date("2026-07-01T14:00:00.000Z"),
          finishingPosition: 1,
        }),
        run({
          horseId: "horse-experienced",
          runnerId: "experienced-prior-2",
          raceDate: "2026-08-01",
          raceDateTime: new Date("2026-08-01T14:00:00.000Z"),
          finishingPosition: 3,
        }),
      ],
    });

    assert.equal(debutant.features.priorRuns, 0);
    assert.equal(secondRun.features.priorRuns, 1);
    assert.equal(experienced.features.priorRuns, 2);
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
            calculationVersion: "turf_speed_v2",
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

  test("classifies confirmed missing-type Irish Gold Cup examples as jump, not turf", () => {
    const rows = buildHistoricalTargetRunnerMetricRows({
      targets: [
        target({
          targetRaceId: "irish-gold-cup",
          targetRunnerId: "irish-gold-cup-runner",
          courseName: "Leopardstown",
          raceName: "Paddy Power Irish Gold Cup (Grade 1)",
          raceType: null,
          raceTypeCode: null,
          surface: "TURF",
          distanceYards: 5380,
        }),
        target({
          targetRaceId: "punchestown-gold-cup",
          targetRunnerId: "punchestown-gold-cup-runner",
          courseName: "Punchestown",
          raceName: "Ladbrokes Punchestown Gold Cup (Grade 1)",
          raceType: null,
          raceTypeCode: null,
          surface: "TURF",
          distanceYards: 5493,
        }),
      ],
      candidateRuns: [],
    });

    assert.deepEqual(rows.map((row) => row.features.raceCode), ["jump", "jump"]);
  });

  test("preserves ordinary flat turf classification for Group, Listed, maiden and handicap races", () => {
    const rows = buildHistoricalTargetRunnerMetricRows({
      targets: [
        target({
          targetRaceId: "royal-ascot-gold-cup",
          targetRunnerId: "royal-ascot-gold-cup-runner",
          courseName: "Ascot",
          raceName: "Gold Cup (Group 1)",
          raceType: null,
          raceTypeCode: null,
          surface: "TURF",
          distanceYards: 4390,
        }),
        target({
          targetRaceId: "listed-stakes",
          targetRunnerId: "listed-stakes-runner",
          raceName: "Fillies' Listed Stakes",
          raceType: "Listed",
          raceTypeCode: null,
          surface: "TURF",
          distanceYards: 1540,
        }),
        target({
          targetRaceId: "flat-handicap",
          targetRunnerId: "flat-handicap-runner",
          raceName: "Summer Handicap",
          raceType: "handicap",
          raceTypeCode: null,
          surface: "TURF",
          distanceYards: 1760,
        }),
        target({
          targetRaceId: "flat-maiden",
          targetRunnerId: "flat-maiden-runner",
          raceName: "Irish European Breeders Fund Maiden",
          raceType: "maiden",
          raceTypeCode: null,
          surface: "TURF",
          distanceYards: 1100,
        }),
      ],
      candidateRuns: [],
    });

    assert.deepEqual(rows.map((row) => row.features.raceCode), ["turf", "turf", "turf", "turf"]);
  });

  test("derives run number after 90-day break from prior completed runs only", () => {
    const [runOne] = buildHistoricalTargetRunnerMetricRows({
      targets: [target({ raceDateTime: new Date("2026-04-30T14:00:00.000Z") })],
      candidateRuns: [
        run({
          runnerId: "old",
          raceDate: "2025-12-01",
          raceDateTime: new Date("2025-12-01T14:00:00.000Z"),
        }),
      ],
    });
    assert.equal(runOne.features.breakLengthDays, 150);
    assert.equal(runOne.features.runAfterBreakNumber, 1);

    const [runThree] = buildHistoricalTargetRunnerMetricRows({
      targets: [target({ raceDateTime: new Date("2026-05-25T14:00:00.000Z") })],
      candidateRuns: [
        run({
          runnerId: "old",
          raceDate: "2025-12-01",
          raceDateTime: new Date("2025-12-01T14:00:00.000Z"),
        }),
        run({
          runnerId: "run1",
          raceDate: "2026-04-01",
          raceDateTime: new Date("2026-04-01T14:00:00.000Z"),
        }),
        run({
          runnerId: "non-runner",
          raceDate: "2026-04-10",
          raceDateTime: new Date("2026-04-10T14:00:00.000Z"),
          resultStatus: "non_runner",
          finishingPosition: null,
        }),
        run({
          runnerId: "run2",
          raceDate: "2026-04-21",
          raceDateTime: new Date("2026-04-21T14:00:00.000Z"),
        }),
        run({
          runnerId: "future",
          raceDate: "2026-05-26",
          raceDateTime: new Date("2026-05-26T14:00:00.000Z"),
        }),
      ],
    });
    assert.equal(runThree.features.breakLengthDays, 121);
    assert.equal(runThree.features.runAfterBreakNumber, 3);

    const [reset] = buildHistoricalTargetRunnerMetricRows({
      targets: [target({ raceDateTime: new Date("2026-09-10T14:00:00.000Z") })],
      candidateRuns: [
        run({
          runnerId: "pre-break",
          raceDate: "2026-04-01",
          raceDateTime: new Date("2026-04-01T14:00:00.000Z"),
        }),
        run({
          runnerId: "last",
          raceDate: "2026-05-23",
          raceDateTime: new Date("2026-05-23T14:00:00.000Z"),
        }),
      ],
    });
    assert.equal(reset.features.breakLengthDays, 110);
    assert.equal(reset.features.runAfterBreakNumber, 1);
  });

  test("keeps first career run separate from run after break", () => {
    const [row] = buildHistoricalTargetRunnerMetricRows({
      targets: [target()],
      candidateRuns: [],
    });

    assert.equal(row.features.daysSinceLastRun, null);
    assert.equal(row.features.breakLengthDays, null);
    assert.equal(row.features.runAfterBreakNumber, null);
  });
});
