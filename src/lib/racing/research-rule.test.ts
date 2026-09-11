import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  defaultResearchRule,
  evaluateResearchRule,
  parseResearchRule,
  rankRows,
  serializeResearchRule,
  type ResearchRuleV1,
} from "./research-rule";
import type {
  HistoricalPostRaceOutcome,
  HistoricalPreRaceFeatureRow,
  HistoricalTargetRunnerMetricsRow,
} from "./historical-target-metrics";

describe("research rule ranking", () => {
  test("assigns clear ranks, preserves ties and resets per race", () => {
    const ranked = rankRows([
      row({ targetRaceId: "race-a", targetRunnerId: "a1", latestSpeedRating: 100 }),
      row({ targetRaceId: "race-a", targetRunnerId: "a2", latestSpeedRating: 90 }),
      row({ targetRaceId: "race-a", targetRunnerId: "a3", latestSpeedRating: 90 }),
      row({ targetRaceId: "race-b", targetRunnerId: "b1", latestSpeedRating: 80 }),
    ]);
    const ranks = new Map(ranked.map((entry) => [entry.features.targetRunnerId, entry.ranks.latestSpeedRating]));

    assert.equal(ranks.get("a1"), 1);
    assert.equal(ranks.get("a2"), 2);
    assert.equal(ranks.get("a3"), 2);
    assert.equal(ranks.get("b1"), 1);
  });

  test("excludes missing ratings and non-runners from ranking", () => {
    const ranked = rankRows([
      row({ targetRunnerId: "valid", latestSpeedRating: 100 }),
      row({ targetRunnerId: "missing", latestSpeedRating: null }),
      row({ targetRunnerId: "nr", latestSpeedRating: 110 }, { resultStatus: "non_runner" }),
    ]);
    const ranks = new Map(ranked.map((entry) => [entry.features.targetRunnerId, entry.ranks.latestSpeedRating]));

    assert.equal(ranks.get("valid"), 1);
    assert.equal(ranks.get("missing"), undefined);
    assert.equal(ranks.get("nr"), undefined);
  });
});

describe("research rule evaluation", () => {
  test("blank filters do not filter and missing values are not treated as zero", () => {
    const result = evaluateResearchRule({
      rows: [
        row({ targetRunnerId: "with-or", officialRating: 100 }),
        row({ targetRunnerId: "missing-or", officialRating: null }),
      ],
      rule: defaultResearchRule("jump"),
    });

    assert.equal(result.baselineRows, 2);
    assert.equal(result.selectedRunners.length, 2);

    const filtered = evaluateResearchRule({
      rows: [
        row({ targetRunnerId: "with-or", officialRating: 100 }),
        row({ targetRunnerId: "missing-or", officialRating: null }),
      ],
      rule: {
        ...defaultResearchRule("jump"),
        runner: { officialRating: { min: 1 } },
      },
    });
    assert.deepEqual(filtered.selectedRunners.map((selection) => selection.id), ["with-or"]);
  });

  test("applies OR-relative, rank and combined conditions", () => {
    const rule: ResearchRuleV1 = {
      ...defaultResearchRule("jump"),
      relatives: [{ metric: "latestTodaysRatingMinusOR", range: { min: 5 } }],
      ranks: [{ metric: "latestTodaysRating", range: { max: 1 } }],
    };
    const result = evaluateResearchRule({
      rows: [
        row({ targetRunnerId: "selected", latestTodaysRating: 110, officialRating: 100 }),
        row({ targetRunnerId: "ranked-second", latestTodaysRating: 108, officialRating: 100 }),
        row({ targetRunnerId: "below-or", latestTodaysRating: 104, officialRating: 100 }),
      ],
      rule,
    });

    assert.deepEqual(result.selectedRunners.map((selection) => selection.id), ["selected"]);
  });

  test("keeps Jump, AW and Turf isolated", () => {
    const result = evaluateResearchRule({
      rows: [
        row({ targetRunnerId: "jump", raceCode: "jump" }),
        row({ targetRunnerId: "aw", raceCode: "aw" }),
        row({ targetRunnerId: "turf", raceCode: "turf" }),
      ],
      rule: defaultResearchRule("all_weather_flat"),
    });

    assert.deepEqual(result.selectedRunners.map((selection) => selection.id), ["aw"]);
  });

  test("outcome changes do not alter ranks or selected runner IDs", () => {
    const features = [
      row({ targetRunnerId: "selected", latestSpeedRating: 100 }),
      row({ targetRunnerId: "rejected", latestSpeedRating: 90 }),
    ];
    const changedOutcomes = features.map((entry) => ({
      features: entry.features,
      outcome: {
        ...entry.outcome,
        finishingPosition: entry.outcome.finishingPosition === 1 ? 7 : 1,
        won: !entry.outcome.won,
      },
    }));
    const rule: ResearchRuleV1 = {
      ...defaultResearchRule("jump"),
      ranks: [{ metric: "latestSpeedRating", range: { max: 1 } }],
    };

    assert.deepEqual(
      evaluateResearchRule({ rows: features, rule }).selectedRunners.map((selection) => selection.id),
      evaluateResearchRule({ rows: changedOutcomes, rule }).selectedRunners.map((selection) => selection.id),
    );
  });

  test("serializes and parses ResearchRuleV1", () => {
    const rule: ResearchRuleV1 = {
      ...defaultResearchRule("turf_flat"),
      race: { distanceYards: { min: 1760, max: 2200 } },
      ranks: [{ metric: "bestPerformanceLast3", range: { max: 2 } }],
    };

    assert.deepEqual(parseResearchRule(serializeResearchRule(rule)), rule);
  });
});

function row(
  featureOverrides: Partial<HistoricalPreRaceFeatureRow> = {},
  outcomeOverrides: Partial<HistoricalPostRaceOutcome> = {},
): HistoricalTargetRunnerMetricsRow {
  const features = feature(featureOverrides);
  return {
    features,
    outcome: outcome({
      targetRaceId: features.targetRaceId,
      targetRunnerId: features.targetRunnerId,
      ...outcomeOverrides,
    }),
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
    raceDateTime: new Date("2025-01-01T12:00:00.000Z"),
    raceDate: "2025-01-01",
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
    latestRunDate: "2024-12-01",
    daysSinceLastRun: 31,
    latestOr: 98,
    previousOr: 97,
    latestSpeedRating: 105,
    previousSpeedRating: 101,
    bestSpeedLast3: 106,
    bestSpeedLast5: 106,
    averageSpeedLast3: 102,
    averageSpeedLast5: 102,
    latestPerformanceRating: 100,
    previousPerformanceRating: 99,
    bestPerformanceLast3: 103,
    bestPerformanceLast5: 103,
    averagePerformanceLast3: 100,
    averagePerformanceLast5: 100,
    latestPerformanceCalculationVersion: "weight_performance_v1",
    currentWeightCarriedLb: 156,
    latestTodaysRating: 112,
    previousTodaysRating: 111,
    bestTodaysRatingLast3: 115,
    bestTodaysRatingLast5: 115,
    averageTodaysRatingLast3: 112,
    averageTodaysRatingLast5: 112,
    todaysRatingCalculationVersion: "todays_rating_v1",
    latestJumpSpeedRating: 105,
    previousJumpSpeedRating: 101,
    bestJumpSpeedLast3: 106,
    bestJumpSpeedLast5: 106,
    averageJumpSpeedLast3: 102,
    averageJumpSpeedLast5: 102,
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

function outcome(
  overrides: Partial<HistoricalPostRaceOutcome> = {},
): HistoricalPostRaceOutcome {
  return {
    targetRaceId: "race-1",
    targetRunnerId: "runner-1",
    finishingPosition: 1,
    resultStatus: "finished",
    won: true,
    placed: true,
    startingPrice: "5/1",
    startingPriceDecimal: "6.000",
    ...overrides,
  };
}
