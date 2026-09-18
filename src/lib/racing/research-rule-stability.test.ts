import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  defaultResearchRule,
  evaluateResearchRule,
  type ResearchRuleV1,
} from "./research-rule";
import {
  evaluateResearchRuleStability,
  researchRuleStabilityVariants,
} from "./research-rule-stability";
import { researchRuleKey } from "./research-rule-identity";
import type {
  HistoricalPostRaceOutcome,
  HistoricalPreRaceFeatureRow,
  HistoricalTargetRunnerMetricsRow,
} from "./historical-target-metrics";

describe("research rule stability variants", () => {
  test("includes the current rule and generates one-at-a-time perturbations only", () => {
    const rule: ResearchRuleV1 = {
      ...defaultResearchRule("jump"),
      race: { fieldSize: { min: 6, max: 10 } },
      runner: {
        trainerPriorRuns: { min: 100 },
        trainerPriorWinRate: { min: 18 },
        priorRuns: { min: 2 },
        daysSinceRun: { max: 45 },
        officialRating: { min: 120 },
      },
      ratings: [{ metric: "latestSpeedRating", range: { min: 100 } }],
      relatives: [{ metric: "latestSpeedMinusOR", range: { min: 7 } }],
      ranks: [{ metric: "latestSpeedRating", range: { max: 5 } }],
    };

    const variants = researchRuleStabilityVariants(rule);
    const labels = variants.map((variant) => variant.label);

    assert.equal(labels[0], "Current");
    assert.ok(labels.includes("Trainer strike rate min 17%"));
    assert.ok(labels.includes("Trainer strike rate min 19%"));
    assert.ok(labels.includes("Trainer prior runners min 75"));
    assert.ok(labels.includes("Trainer prior runners min 125"));
    assert.ok(labels.includes("Career prior runs min 1"));
    assert.ok(labels.includes("Career prior runs min 3"));
    assert.ok(labels.includes("Rank max 4"));
    assert.ok(labels.includes("Rank max 6"));
    assert.ok(labels.includes("Latest Speed min 95"));
    assert.ok(labels.includes("Latest Speed minus OR min 2"));

    for (const variant of variants.slice(1)) {
      assert.equal(numberOfChangedRuleSections(rule, variant.rule), 1);
    }
  });

  test("skips invalid negative thresholds and removes duplicate-equivalent variants", () => {
    const rule: ResearchRuleV1 = {
      ...defaultResearchRule("jump"),
      runner: {
        priorRuns: { min: 0 },
      },
      ranks: [{ metric: "latestSpeedRating", range: { max: 1 } }],
    };

    const variants = researchRuleStabilityVariants(rule);
    const labels = variants.map((variant) => variant.label);
    const keys = variants.map((variant) => researchRuleKey(variant.rule));

    assert.deepEqual(labels, ["Current", "Career prior runs min 1", "Rank max 2"]);
    assert.equal(new Set(keys).size, keys.length);
  });

  test("real variants get different canonical identities without mutating the current rule", () => {
    const rule: ResearchRuleV1 = {
      ...defaultResearchRule("jump"),
      runner: { trainerPriorRuns: { min: 100 } },
    };
    const before = JSON.stringify(rule);
    const variants = researchRuleStabilityVariants(rule);

    assert.equal(JSON.stringify(rule), before);
    assert.equal(variants[0]!.rule, rule);
    for (const variant of variants.slice(1)) {
      assert.notEqual(researchRuleKey(variant.rule), researchRuleKey(rule));
    }
  });
});

describe("research rule stability evaluation", () => {
  test("evaluates variants with normal 2025 Research semantics", () => {
    const rows = [
      row({ targetRunnerId: "winner", latestSpeedRating: 98 }, { finishingPosition: 1, won: true, placed: true, startingPriceDecimal: "6.000" }),
      row({ targetRunnerId: "loser", latestSpeedRating: 101 }, { finishingPosition: 4, won: false, placed: false, startingPriceDecimal: "4.000" }),
      row({ targetRunnerId: "future-ignored", raceDate: "2026-01-01", latestSpeedRating: 200 }, { finishingPosition: 1, won: true, placed: true, startingPriceDecimal: "100.000" }),
    ];
    const rule: ResearchRuleV1 = {
      ...defaultResearchRule("jump"),
      ratings: [{ metric: "latestSpeedRating", range: { min: 100 } }],
    };
    const current = evaluateResearchRule({ rows, rule });
    const stability = evaluateResearchRuleStability({ rows, result: current });
    const softened = stability.rows.find((item) => item.label === "Latest Speed min 95");
    assert.ok(softened);

    const expected = evaluateResearchRule({ rows, rule: softened.rule });
    assert.equal(softened.eligibleRunners, expected.baselineRows);
    assert.deepEqual(softened.summary, expected.summary);
    assert.equal(softened.summary.selections, 2);
    assert.equal(softened.summary.wins, 1);
    assert.equal(softened.summary.profitLoss, 4);
    assert.equal(softened.summary.roiPercentage, 200);
    assert.equal(softened.summary.maxConsecutiveLosers, 1);
  });

  test("applies the active development settlement mode to variant summaries", () => {
    const rows = [
      row({ targetRunnerId: "big-winner", latestSpeedRating: 100 }, {
        finishingPosition: 1,
        won: true,
        placed: true,
        startingPriceDecimal: "41.000",
      }),
      row({ targetRunnerId: "loser", latestSpeedRating: 100 }, {
        finishingPosition: 5,
        won: false,
        placed: false,
        startingPriceDecimal: "5.000",
      }),
    ];
    const rule: ResearchRuleV1 = {
      ...defaultResearchRule("jump"),
      ratings: [{ metric: "latestSpeedRating", range: { min: 100 } }],
    };
    const result = evaluateResearchRule({ rows, rule });
    const stability = evaluateResearchRuleStability({
      rows,
      result,
      settlementMode: "cap_20_1",
    });
    const current = stability.rows.find((item) => item.isCurrent)!;

    assert.equal(stability.settlementMode, "cap_20_1");
    assert.equal(stability.settlementModeLabel, "Winner returns capped at 20/1");
    assert.equal(result.summary.profitLoss, 39);
    assert.equal(current.summary.profitLoss, 19);
    assert.equal(current.summary.roiPercentage, 950);
    assert.equal(current.summary.selections, result.summary.selections);
    assert.equal(current.summary.wins, result.summary.wins);
    assert.equal(current.summary.maxConsecutiveLosers, result.summary.maxConsecutiveLosers);
  });
});

function numberOfChangedRuleSections(left: ResearchRuleV1, right: ResearchRuleV1): number {
  const sections = [
    ["race.fieldSize", left.race.fieldSize, right.race.fieldSize],
    ["runner.officialRating", left.runner.officialRating, right.runner.officialRating],
    ["runner.draw", left.runner.draw, right.runner.draw],
    ["runner.daysSinceRun", left.runner.daysSinceRun, right.runner.daysSinceRun],
    ["runner.priorRuns", left.runner.priorRuns, right.runner.priorRuns],
    ["runner.trainerPriorRuns", left.runner.trainerPriorRuns, right.runner.trainerPriorRuns],
    ["runner.trainerPriorWinRate", left.runner.trainerPriorWinRate, right.runner.trainerPriorWinRate],
    ["ratings", left.ratings, right.ratings],
    ["relatives", left.relatives, right.relatives],
    ["ranks", left.ranks, right.ranks],
  ] as const;
  return sections.filter(([, before, after]) => JSON.stringify(before) !== JSON.stringify(after)).length;
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
      startingPrice: "3/1",
      startingPriceDecimal: "4.000",
      ...outcomeOverrides,
    },
  };
}

function feature(
  overrides: Partial<HistoricalPreRaceFeatureRow> = {},
): HistoricalPreRaceFeatureRow {
  return {
    targetRaceId: "race-1",
    targetRunnerId: "runner-1",
    source: "sporting_life",
    horseId: "horse-1",
    horseName: "Example",
    trainerId: "trainer-1",
    trainerName: "A Trainer",
    trainerPriorRuns: 100,
    trainerPriorWins: 18,
    trainerPriorWinRate: 18,
    raceDateTime: new Date("2025-06-01T13:00:00.000Z"),
    raceDate: "2025-06-01",
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
