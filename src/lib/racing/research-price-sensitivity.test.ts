import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  defaultResearchRule,
  evaluateResearchRule,
} from "./research-rule";
import { researchRuleKey } from "./research-rule-identity";
import { evaluateResearchPriceSensitivity } from "./research-price-sensitivity";
import type {
  HistoricalPostRaceOutcome,
  HistoricalPreRaceFeatureRow,
  HistoricalTargetRunnerMetricsRow,
} from "./historical-target-metrics";

describe("research result price sensitivity", () => {
  test("recalculates scenarios from the executed 2025 result without changing the rule", () => {
    const rule = defaultResearchRule("jump");
    const rows = [
      winner("winner-5", "2025-02-01", "6.000"),
      winner("winner-33", "2025-03-01", "34.000"),
      winner("winner-40", "2025-04-01", "41.000"),
      loser("loser", "2025-05-01"),
      row(
        { targetRunnerId: "non-runner", raceDate: "2025-06-01" },
        {
          finishingPosition: null,
          resultStatus: "non_runner",
          won: null,
          placed: null,
          startingPriceDecimal: "8.000",
        },
      ),
      row(
        { targetRunnerId: "unsettled", raceDate: "2025-07-01" },
        {
          finishingPosition: null,
          won: null,
          placed: null,
          startingPriceDecimal: null,
        },
      ),
      winner("future-ignored", "2026-02-01", "101.000"),
    ];
    const result = evaluateResearchRule({ rows, rule });
    const ruleKeyBefore = researchRuleKey(result.rule);
    const sensitivity = evaluateResearchPriceSensitivity(result);

    assert.equal(researchRuleKey(result.rule), ruleKeyBefore);
    assert.deepEqual(scenario(sensitivity, "actual").summary, result.summary);
    assert.equal(result.summary.selections, 6);
    assert.equal(result.summary.settledSelections, 4);
    assert.equal(result.summary.profitLoss, 77);

    assert.equal(scenario(sensitivity, "exclude_gt_20_1").summary.selections, 4);
    assert.equal(scenario(sensitivity, "exclude_gt_20_1").summary.settledSelections, 2);
    assert.equal(scenario(sensitivity, "exclude_gt_20_1").summary.profitLoss, 4);

    assert.equal(scenario(sensitivity, "exclude_gt_33_1").summary.selections, 5);
    assert.equal(scenario(sensitivity, "exclude_gt_33_1").summary.settledSelections, 3);
    assert.equal(scenario(sensitivity, "exclude_gt_33_1").summary.wins, 2);
    assert.equal(scenario(sensitivity, "exclude_gt_33_1").summary.profitLoss, 37);

    assert.equal(scenario(sensitivity, "exclude_gt_50_1").summary.profitLoss, 77);
    assert.equal(scenario(sensitivity, "cap_20_1").summary.profitLoss, 44);
    assert.equal(scenario(sensitivity, "cap_33_1").summary.profitLoss, 70);
    assert.equal(scenario(sensitivity, "cap_20_1").summary.maxConsecutiveLosers, 1);

    assert.equal(sensitivity.diagnostics.largestWinningDecimalSp, 41);
    assert.equal(sensitivity.diagnostics.largestWinnerProfit, 40);
    assert.equal(sensitivity.diagnostics.top1WinnerProfitShare, 40 / 78 * 100);
    assert.equal(sensitivity.diagnostics.top3WinnerProfitShare, 100);
    assert.equal(sensitivity.diagnostics.top5WinnerProfitShare, 100);
    assert.equal(
      sensitivity.summaryLabel,
      "Profit is materially dependent on large-priced winners",
    );
  });

  test("handles zero winners safely", () => {
    const rows = [
      loser("loss-1", "2025-02-01"),
      row(
        { targetRunnerId: "unsettled", raceDate: "2025-03-01" },
        { finishingPosition: null, won: null, placed: null, startingPriceDecimal: null },
      ),
    ];
    const result = evaluateResearchRule({ rows, rule: defaultResearchRule("jump") });
    const sensitivity = evaluateResearchPriceSensitivity(result);

    assert.equal(sensitivity.diagnostics.largestWinningDecimalSp, null);
    assert.equal(sensitivity.diagnostics.largestWinnerProfit, null);
    assert.equal(sensitivity.diagnostics.top1WinnerProfitShare, null);
    assert.equal(
      sensitivity.summaryLabel,
      "No winning selections available for price sensitivity",
    );
    assert.equal(scenario(sensitivity, "cap_20_1").summary.profitLoss, -1);
  });
});

function scenario(
  sensitivity: ReturnType<typeof evaluateResearchPriceSensitivity>,
  id: string,
) {
  const found = sensitivity.scenarios.find((item) => item.id === id);
  assert.ok(found, `Expected scenario ${id}`);
  return found;
}

function winner(id: string, raceDate: string, odds: string) {
  return row({ targetRunnerId: id, raceDate }, {
    finishingPosition: 1,
    won: true,
    placed: true,
    startingPriceDecimal: odds,
  });
}

function loser(id: string, raceDate: string) {
  return row({ targetRunnerId: id, raceDate }, {
    finishingPosition: 5,
    won: false,
    placed: false,
    startingPriceDecimal: "5.000",
  });
}

function row(
  featureOverrides: Partial<HistoricalPreRaceFeatureRow> = {},
  outcomeOverrides: Partial<HistoricalPostRaceOutcome> = {},
): HistoricalTargetRunnerMetricsRow {
  const features = feature(featureOverrides);
  return {
    features,
    outcome: {
      targetRaceId: features.targetRaceId,
      targetRunnerId: features.targetRunnerId,
      finishingPosition: 4,
      resultStatus: "finished",
      won: false,
      placed: false,
      startingPrice: "4/1",
      startingPriceDecimal: "5.000",
      ...outcomeOverrides,
    },
  };
}

function feature(
  overrides: Partial<HistoricalPreRaceFeatureRow> = {},
): HistoricalPreRaceFeatureRow {
  const id = overrides.targetRunnerId ?? "runner-1";
  const raceDate = overrides.raceDate ?? "2025-06-01";
  return {
    targetRaceId: `race-${id}`,
    targetRunnerId: id,
    source: "sporting_life",
    horseId: `horse-${id}`,
    horseName: `Horse ${id}`,
    trainerId: "trainer-1",
    trainerName: "A Trainer",
    trainerPriorRuns: 100,
    trainerPriorWins: 18,
    trainerPriorWinRate: 18,
    raceDateTime: new Date(`${raceDate}T13:00:00.000Z`),
    raceDate,
    courseId: "course-1",
    courseName: "Worcester",
    raceName: "Handicap Chase",
    raceClass: "Class 3",
    raceType: "Chase",
    raceTypeCode: null,
    distanceYards: 4400,
    going: "Good",
    declaredRunnerCount: 8,
    actualRunnerCount: 8,
    surface: null,
    raceCode: "jump",
    horseAge: 7,
    officialRating: 100,
    weight: "11-2",
    weightCarriedLbs: 156,
    draw: null,
    odds: null,
    oddsDecimal: null,
    priorRuns: 3,
    priorWins: 1,
    priorPlaces: 2,
    winPercentage: 33.333,
    placePercentage: 66.667,
    latestRunDate: "2025-05-01",
    daysSinceLastRun: 31,
    breakLengthDays: null,
    runAfterBreakNumber: null,
    latestOr: 98,
    previousOr: 97,
    latestSpeedRating: 100,
    previousSpeedRating: 95,
    bestSpeedLast3: 100,
    bestSpeedLast5: 100,
    averageSpeedLast3: 98,
    averageSpeedLast5: 98,
    latestPerformanceRating: 100,
    previousPerformanceRating: 99,
    bestPerformanceLast3: 100,
    bestPerformanceLast5: 100,
    averagePerformanceLast3: 99,
    averagePerformanceLast5: 99,
    latestPerformanceCalculationVersion: "weight_performance_v1",
    currentWeightCarriedLb: 156,
    latestTodaysRating: 110,
    previousTodaysRating: 108,
    bestTodaysRatingLast3: 110,
    bestTodaysRatingLast5: 110,
    averageTodaysRatingLast3: 109,
    averageTodaysRatingLast5: 109,
    todaysRatingCalculationVersion: "todays_rating_v1",
    latestJumpSpeedRating: 100,
    previousJumpSpeedRating: 95,
    bestJumpSpeedLast3: 100,
    bestJumpSpeedLast5: 100,
    averageJumpSpeedLast3: 98,
    averageJumpSpeedLast5: 98,
    latestAwSpeedRating: null,
    previousAwSpeedRating: null,
    bestAwSpeedLast3: null,
    bestAwSpeedLast5: null,
    averageAwSpeedLast3: null,
    averageAwSpeedLast5: null,
    latestTurfSpeedRating: null,
    previousTurfSpeedRating: null,
    bestTurfSpeedLast3: null,
    bestTurfSpeedLast5: null,
    averageTurfSpeedLast3: null,
    averageTurfSpeedLast5: null,
    latestSpeedMethod: "base",
    latestSpeedConfidence: "medium",
    speedCalculationVersion: "jump_speed_v1",
    ...overrides,
  };
}
