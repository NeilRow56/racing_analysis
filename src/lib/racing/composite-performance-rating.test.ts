import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  COMPOSITE_PERFORMANCE_V2_FORMULA,
  experienceScore,
  orRelativeValue,
  rateCompositePerformanceRows,
  recencyScore,
} from "./composite-performance-rating";
import type {
  HistoricalPostRaceOutcome,
  HistoricalPreRaceFeatureRow,
  HistoricalTargetRunnerMetricsRow,
} from "./historical-target-metrics";

describe("composite performance rating v1", () => {
  test("ranks higher composite ratings first within each race", () => {
    const ratings = rateCompositePerformanceRows([
      row({ targetRunnerId: "strong", latestSpeedRating: 100, bestSpeedLast3: 98, latestPerformanceRating: 97, officialRating: 80 }),
      row({ targetRunnerId: "middle", latestSpeedRating: 90, bestSpeedLast3: 89, latestPerformanceRating: 88, officialRating: 82 }),
      row({ targetRunnerId: "weak", latestSpeedRating: 70, bestSpeedLast3: 71, latestPerformanceRating: 72, officialRating: 85 }),
    ]);

    assert.equal(ratings.get("strong")?.rank, 1);
    assert.equal(ratings.get("middle")?.rank, 2);
    assert.equal(ratings.get("weak")?.rank, 3);
    assert.ok((ratings.get("strong")?.rating ?? 0) > (ratings.get("middle")?.rating ?? 0));
  });

  test("uses standard competition ranking for ties", () => {
    const ratings = rateCompositePerformanceRows([
      row({ targetRunnerId: "a", latestSpeedRating: 100, bestSpeedLast3: 100, latestPerformanceRating: 100, officialRating: 80 }),
      row({ targetRunnerId: "b", latestSpeedRating: 100, bestSpeedLast3: 100, latestPerformanceRating: 100, officialRating: 80 }),
      row({ targetRunnerId: "c", latestSpeedRating: 80, bestSpeedLast3: 80, latestPerformanceRating: 80, officialRating: 80 }),
    ]);

    assert.equal(ratings.get("a")?.rank, 1);
    assert.equal(ratings.get("b")?.rank, 1);
    assert.equal(ratings.get("c")?.rank, 3);
  });

  test("treats missing components as neutral but reports partial status", () => {
    const ratings = rateCompositePerformanceRows([
      row({ targetRunnerId: "partial", latestSpeedRating: 100, bestSpeedLast3: null, latestPerformanceRating: null, officialRating: null }),
      row({ targetRunnerId: "peer", latestSpeedRating: 80, bestSpeedLast3: 80, latestPerformanceRating: 80, officialRating: 75 }),
    ]);
    const partial = ratings.get("partial");

    assert.equal(partial?.status, "partial");
    assert.equal(partial?.components.bestL3Speed, null);
    assert.equal(partial?.contributions.bestL3Speed, 12.5);
    assert.equal(partial?.coreAvailableCount, 1);
    assert.notEqual(partial?.rating, null);
  });

  test("leaves rows unrated when all core evidence is missing", () => {
    const ratings = rateCompositePerformanceRows([
      row({ targetRunnerId: "unrated", latestSpeedRating: null, bestSpeedLast3: null, latestPerformanceRating: null, officialRating: null }),
      row({ targetRunnerId: "rated", latestSpeedRating: 80, bestSpeedLast3: null, latestPerformanceRating: null, officialRating: null }),
    ]);

    assert.equal(ratings.get("unrated")?.status, "unrated");
    assert.equal(ratings.get("unrated")?.rating, null);
    assert.equal(ratings.get("unrated")?.rank, null);
  });

  test("excludes non-runners from component percentile ranking", () => {
    const ratings = rateCompositePerformanceRows([
      row({ targetRunnerId: "rated", latestSpeedRating: 80 }),
      row({ targetRunnerId: "non-runner", latestSpeedRating: 120 }, { resultStatus: "non_runner" }),
    ]);

    assert.equal(ratings.get("rated")?.components.latestSpeed, 100);
    assert.equal(ratings.get("non-runner")?.rank, null);
  });

  test("uses Best L3 Speed minus official rating for OR-relative direction", () => {
    assert.equal(orRelativeValue(feature({ bestSpeedLast3: 95, officialRating: 80 })), 15);
    assert.equal(orRelativeValue(feature({ bestSpeedLast3: 75, officialRating: 80 })), -5);
    assert.equal(orRelativeValue(feature({ bestSpeedLast3: null, officialRating: 80 })), null);
  });

  test("scores recency and experience with broad non-optimized bands", () => {
    assert.equal(recencyScore(5), 70);
    assert.equal(recencyScore(30), 100);
    assert.equal(recencyScore(200), 50);
    assert.equal(experienceScore(0), 50);
    assert.equal(experienceScore(2), 70);
    assert.equal(experienceScore(8), 100);
    assert.equal(experienceScore(25), 80);
  });

  test("supports V2 formula with reweighted available components", () => {
    const ratings = rateCompositePerformanceRows([
      row({ targetRunnerId: "partial", latestSpeedRating: 100, bestSpeedLast3: null, latestPerformanceRating: null, officialRating: null }),
      row({ targetRunnerId: "peer", latestSpeedRating: 80, bestSpeedLast3: 80, latestPerformanceRating: 80, officialRating: 75 }),
    ], COMPOSITE_PERFORMANCE_V2_FORMULA);
    const partial = ratings.get("partial");

    assert.equal(partial?.version, "composite_performance_v2");
    assert.equal(partial?.status, "partial");
    assert.equal(partial?.contributions.latestSpeed, 100);
    assert.equal(partial?.contributions.bestL3Speed, 0);
    assert.equal(partial?.rating, 100);
  });
});

function row(
  features: Partial<HistoricalPreRaceFeatureRow>,
  outcome: Partial<HistoricalPostRaceOutcome> = {},
): HistoricalTargetRunnerMetricsRow {
  const fullFeatures = feature(features);
  return {
    features: fullFeatures,
    outcome: {
      targetRaceId: fullFeatures.targetRaceId,
      targetRunnerId: fullFeatures.targetRunnerId,
      finishingPosition: 2,
      resultStatus: null,
      won: false,
      placed: false,
      startingPrice: "4/1",
      startingPriceDecimal: "5.000",
      ...outcome,
    },
  };
}

function feature(input: Partial<HistoricalPreRaceFeatureRow> = {}): HistoricalPreRaceFeatureRow {
  return {
    targetRaceId: "race-1",
    targetRunnerId: "runner-1",
    source: "sporting_life",
    horseId: "horse-1",
    horseName: "Horse",
    trainerId: "trainer-1",
    trainerName: "Trainer",
    trainerPriorRuns: 10,
    trainerPriorWins: 1,
    trainerPriorWinRate: 10,
    raceDateTime: new Date("2025-06-01T14:00:00Z"),
    raceDate: "2025-06-01",
    courseId: "course-1",
    courseName: "Course",
    raceName: "Race",
    raceClass: "4",
    raceType: "Flat",
    raceTypeCode: "flat",
    distanceYards: 1320,
    going: "Good",
    declaredRunnerCount: 10,
    actualRunnerCount: 10,
    surface: null,
    raceCode: "turf",
    horseAge: 4,
    officialRating: 80,
    weight: "9-0",
    weightCarriedLbs: 126,
    draw: 1,
    odds: null,
    oddsDecimal: null,
    priorRuns: 5,
    priorWins: 1,
    priorPlaces: 2,
    winPercentage: 20,
    placePercentage: 40,
    latestRunDate: "2025-05-01",
    daysSinceLastRun: 31,
    breakLengthDays: 31,
    runAfterBreakNumber: null,
    latestOr: 80,
    previousOr: 78,
    latestSpeedRating: 90,
    previousSpeedRating: 88,
    bestSpeedLast3: 92,
    bestSpeedLast5: 92,
    averageSpeedLast3: 88,
    averageSpeedLast5: 86,
    latestPerformanceRating: 89,
    previousPerformanceRating: 87,
    bestPerformanceLast3: 91,
    bestPerformanceLast5: 91,
    averagePerformanceLast3: 87,
    averagePerformanceLast5: 85,
    latestPerformanceCalculationVersion: "performance_v1",
    currentWeightCarriedLb: 126,
    latestTodaysRating: 89,
    previousTodaysRating: 87,
    bestTodaysRatingLast3: 91,
    bestTodaysRatingLast5: 91,
    averageTodaysRatingLast3: 87,
    averageTodaysRatingLast5: 85,
    todaysRatingCalculationVersion: "todays_rating_v1",
    latestJumpSpeedRating: null,
    previousJumpSpeedRating: null,
    bestJumpSpeedLast3: null,
    bestJumpSpeedLast5: null,
    averageJumpSpeedLast3: null,
    averageJumpSpeedLast5: null,
    latestAwSpeedRating: null,
    previousAwSpeedRating: null,
    bestAwSpeedLast3: null,
    bestAwSpeedLast5: null,
    averageAwSpeedLast3: null,
    averageAwSpeedLast5: null,
    latestTurfSpeedRating: 90,
    previousTurfSpeedRating: 88,
    bestTurfSpeedLast3: 92,
    bestTurfSpeedLast5: 92,
    averageTurfSpeedLast3: 88,
    averageTurfSpeedLast5: 86,
    latestSpeedMethod: "base",
    latestSpeedConfidence: "high",
    speedCalculationVersion: "speed_v1",
    ...input,
  };
}
