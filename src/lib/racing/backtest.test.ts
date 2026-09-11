import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  deriveBacktestFeatureValues,
  evaluateBacktestRows,
  matchesDefinition,
  oddsBandFor,
  settleSelection,
  summarizeSelections,
  type BacktestDefinition,
  type BacktestSelection,
} from "./backtest";
import type {
  HistoricalPostRaceOutcome,
  HistoricalPreRaceFeatureRow,
  HistoricalTargetRunnerMetricsRow,
} from "./historical-target-metrics";

function feature(
  overrides: Partial<HistoricalPreRaceFeatureRow> = {},
): HistoricalPreRaceFeatureRow {
  return {
    targetRaceId: "race-1",
    targetRunnerId: "runner-1",
    source: "sporting_life",
    horseId: "horse-1",
    horseName: "Example",
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
    actualRunnerCount: 7,
    surface: null,
    raceCode: "jump",
    horseAge: 7,
    officialRating: 100,
    weight: "11-2",
    weightCarriedLbs: 156,
    draw: null,
    odds: null,
    oddsDecimal: null,
    priorRuns: 5,
    priorWins: 1,
    priorPlaces: 2,
    winPercentage: 20,
    placePercentage: 40,
    latestRunDate: "2025-05-01",
    daysSinceLastRun: 31,
    latestOr: 98,
    previousOr: 96,
    latestSpeedRating: 108,
    previousSpeedRating: 102,
    bestSpeedLast3: 110,
    bestSpeedLast5: 112,
    averageSpeedLast3: 104,
    averageSpeedLast5: 101,
    latestPerformanceRating: 50,
    previousPerformanceRating: 48,
    bestPerformanceLast3: 52,
    bestPerformanceLast5: 54,
    averagePerformanceLast3: 49,
    averagePerformanceLast5: 47,
    latestPerformanceCalculationVersion: "weight_performance_v1",
    currentWeightCarriedLb: 160,
    latestTodaysRating: 58,
    previousTodaysRating: 56,
    bestTodaysRatingLast3: 60,
    bestTodaysRatingLast5: 62,
    averageTodaysRatingLast3: 57,
    averageTodaysRatingLast5: 55,
    todaysRatingCalculationVersion: "todays_rating_v1",
    latestJumpSpeedRating: 108,
    previousJumpSpeedRating: 102,
    bestJumpSpeedLast3: 110,
    bestJumpSpeedLast5: 112,
    averageJumpSpeedLast3: 104,
    averageJumpSpeedLast5: 101,
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

describe("backtest filters", () => {
  test("derives relative speed values without inventing missing values as zero", () => {
    assert.deepEqual(deriveBacktestFeatureValues(feature()), {
      latestSpeedMinusOR: 8,
      bestL3SpeedMinusOR: 10,
    latestMinusPreviousSpeed: 6,
    latestMinusBestL3: -2,
    latestPerformanceMinusOR: -50,
    bestPerformanceL3MinusOR: -48,
    latestPerformanceMinusPreviousPerformance: 2,
    latestTodaysRatingMinusOR: -42,
    bestTodaysRatingL3MinusOR: -40,
    latestTodaysMinusPreviousTodays: 2,
    preRaceOddsDecimal: null,
    fieldSize: 7,
  });

    assert.equal(
      deriveBacktestFeatureValues(
        feature({ latestSpeedRating: null, officialRating: 100 }),
      ).latestSpeedMinusOR,
      null,
    );
  });

  test("applies deterministic race, runner, speed and relative-speed predicates", () => {
    const definition: BacktestDefinition = {
      id: "test",
      name: "Test",
      race: {
        segments: ["jump"],
        courseNames: ["Worcester"],
        raceClasses: ["Class 3"],
        distanceYards: { min: 4000, max: 5000 },
        fieldSize: { min: 7, max: 12 },
      },
      runner: {
        age: { min: 6, max: 9 },
        officialRating: { min: 90 },
        weightCarriedLbs: { max: 165 },
        daysSinceRun: { max: 45 },
        priorRuns: { min: 3 },
      },
      speed: { latestSpeedRating: { min: 100 } },
      relativeSpeed: { latestSpeedMinusOR: { min: 5 } },
    };

    assert.equal(matchesDefinition(feature(), definition), true);
    assert.equal(
      matchesDefinition(feature({ raceCode: "aw" }), definition),
      false,
    );
    assert.equal(
      matchesDefinition(feature({ latestSpeedRating: null }), definition),
      false,
    );
  });

  test("applies weight-adjusted performance filters independently of raw speed", () => {
    assert.equal(
      matchesDefinition(
        feature({
          latestSpeedRating: 90,
          latestPerformanceRating: 105,
          officialRating: 100,
        }),
        {
          id: "performance",
          name: "Performance",
          relativeSpeed: { latestPerformanceMinusOR: { min: 5 } },
        },
      ),
      true,
    );
    assert.equal(
      matchesDefinition(
        feature({
          latestSpeedRating: 110,
          latestPerformanceRating: null,
          officialRating: 100,
        }),
        {
          id: "performance",
          name: "Performance",
          relativeSpeed: { latestPerformanceMinusOR: { min: 5 } },
        },
      ),
      false,
    );
  });

  test("applies today's rating filters independently of raw speed and historical performance", () => {
    assert.equal(
      matchesDefinition(
        feature({
          latestSpeedRating: 90,
          latestPerformanceRating: 95,
          latestTodaysRating: 108,
          officialRating: 100,
        }),
        {
          id: "todays",
          name: "Todays",
          relativeSpeed: { latestTodaysRatingMinusOR: { min: 5 } },
        },
      ),
      true,
    );
    assert.equal(
      matchesDefinition(
        feature({
          latestTodaysRating: null,
          officialRating: 100,
        }),
        {
          id: "todays",
          name: "Todays",
          relativeSpeed: { latestTodaysRatingMinusOR: { min: 5 } },
        },
      ),
      false,
    );
  });

  test("result SP cannot satisfy pre-race odds filters", () => {
    const result = evaluateBacktestRows({
      startDate: "2025-01-01",
      endDate: "2025-12-31",
      definition: {
        id: "odds",
        name: "Odds",
        odds: { preRaceDecimal: { min: 2, max: 10 } },
      },
      rows: [row({}, { startingPriceDecimal: "6.000" })],
    });

    assert.equal(result.selectedRunners.length, 0);
    assert.equal(result.missingData.noUsableOdds, 1);
  });

  test("Jump, AW and Turf segment filters remain isolated", () => {
    const rows = [
      row({ targetRunnerId: "jump", raceCode: "jump" }),
      row({
        targetRunnerId: "aw",
        raceCode: "aw",
        latestAwSpeedRating: 108,
        latestJumpSpeedRating: null,
      }),
      row({
        targetRunnerId: "turf",
        raceCode: "turf",
        surface: "TURF",
        latestTurfSpeedRating: 108,
        latestJumpSpeedRating: null,
      }),
    ];
    const result = evaluateBacktestRows({
      startDate: "2025-01-01",
      endDate: "2025-12-31",
      definition: {
        id: "jump-only",
        name: "Jump only",
        race: { segments: ["jump"] },
      },
      rows,
    });

    assert.deepEqual(
      result.selectedRunners.map((selection) => selection.id),
      ["jump"],
    );
  });

  test("date cutoff excludes rows outside the requested range", () => {
    const result = evaluateBacktestRows({
      startDate: "2025-01-01",
      endDate: "2025-12-31",
      definition: { id: "all", name: "All" },
      rows: [
        row({ targetRunnerId: "inside", raceDate: "2025-06-01" }),
        row({ targetRunnerId: "outside", raceDate: "2026-01-01" }),
      ],
    });

    assert.deepEqual(
      result.selectedRunners.map((selection) => selection.id),
      ["inside"],
    );
  });
});

describe("backtest scoring", () => {
  test("settles £1 win stakes from post-race settlement SP only", () => {
    assert.deepEqual(settleSelection(outcome()), {
      settled: true,
      settlementOddsDecimal: 6,
      stake: 1,
      grossReturn: 6,
      profitLoss: 5,
    });
    assert.equal(
      settleSelection(outcome({ finishingPosition: 2, won: false }))?.profitLoss,
      -1,
    );
  });

  test("excludes non-runners and missing settlement prices from settled selections", () => {
    assert.equal(settleSelection(outcome({ resultStatus: "non_runner" })), null);
    assert.equal(settleSelection(outcome({ startingPriceDecimal: null })), null);
  });

  test("calculates max consecutive losers in chronological order", () => {
    const selections: BacktestSelection[] = [
      selection("a", "2025-01-01", false, -1),
      selection("b", "2025-01-02", false, -1),
      selection("c", "2025-01-03", true, 3),
      selection("d", "2025-01-04", false, -1),
    ];

    assert.equal(summarizeSelections(selections).maxConsecutiveLosers, 2);
  });

  test("assigns fixed odds bands", () => {
    assert.equal(oddsBandFor(1.8), "<2.0");
    assert.equal(oddsBandFor(2.5), "2.0-2.99");
    assert.equal(oddsBandFor(4), "3.0-4.99");
    assert.equal(oddsBandFor(6), "5.0-7.99");
    assert.equal(oddsBandFor(10), "8.0-11.99");
    assert.equal(oddsBandFor(15), "12.0+");
    assert.equal(oddsBandFor(null), "missing");
  });
});

describe("backtest leakage separation", () => {
  test("changing outcomes does not change selected runner IDs", () => {
    const definition = {
      id: "speed",
      name: "Speed",
      relativeSpeed: { latestSpeedMinusOR: { min: 5 } },
    };
    const baseRows = [
      row({ targetRunnerId: "selected", latestSpeedRating: 108, officialRating: 100 }),
      row({ targetRunnerId: "rejected", latestSpeedRating: 101, officialRating: 100 }),
    ];
    const changedOutcomeRows = baseRows.map((entry) => ({
      features: entry.features,
      outcome: {
        ...entry.outcome,
        finishingPosition: entry.outcome.finishingPosition === 1 ? 8 : 1,
        won: !entry.outcome.won,
      },
    }));

    const first = evaluateBacktestRows({
      startDate: "2025-01-01",
      endDate: "2025-12-31",
      definition,
      rows: baseRows,
    });
    const second = evaluateBacktestRows({
      startDate: "2025-01-01",
      endDate: "2025-12-31",
      definition,
      rows: changedOutcomeRows,
    });

    assert.deepEqual(
      first.selectedRunners.map((selection) => selection.id),
      second.selectedRunners.map((selection) => selection.id),
    );
  });

  test("future OR and form are absent unless present in precomputed features", () => {
    const result = evaluateBacktestRows({
      startDate: "2025-01-01",
      endDate: "2025-12-31",
      definition: {
        id: "future-proof",
        name: "Future proof",
        relativeSpeed: { latestSpeedMinusOR: { min: 5 } },
      },
      rows: [
        row({
          targetRunnerId: "selected",
          officialRating: 100,
          latestSpeedRating: 108,
          latestOr: 95,
          previousOr: 90,
        }),
      ],
    });

    assert.deepEqual(
      result.selectedRunners.map((selection) => selection.id),
      ["selected"],
    );
  });

  test("repeated evaluation is reproducible for selection IDs and summary", () => {
    const rows = [
      row({ targetRunnerId: "b", raceDateTime: new Date("2025-01-02T12:00:00Z") }),
      row({ targetRunnerId: "a", raceDateTime: new Date("2025-01-01T12:00:00Z") }),
    ];
    const definition = { id: "all", name: "All" };
    const first = evaluateBacktestRows({
      startDate: "2025-01-01",
      endDate: "2025-12-31",
      definition,
      rows,
    });
    const second = evaluateBacktestRows({
      startDate: "2025-01-01",
      endDate: "2025-12-31",
      definition,
      rows,
    });

    assert.deepEqual(
      first.selectedRunners.map((selection) => selection.id),
      second.selectedRunners.map((selection) => selection.id),
    );
    assert.deepEqual(first.summary, second.summary);
  });
});

function selection(
  id: string,
  date: string,
  won: boolean,
  profitLoss: number,
): BacktestSelection {
  const features = feature({
    targetRunnerId: id,
    raceDate: date,
    raceDateTime: new Date(`${date}T12:00:00.000Z`),
  });
  return {
    id,
    definitionId: "test",
    selectedReason: "test",
    features,
    derived: deriveBacktestFeatureValues(features),
    outcome: outcome({
      targetRunnerId: id,
      finishingPosition: won ? 1 : 2,
      won,
      placed: won,
    }),
    settlement: {
      settled: true,
      settlementOddsDecimal: won ? profitLoss + 1 : 2,
      stake: 1,
      grossReturn: won ? profitLoss + 1 : 0,
      profitLoss,
    },
  };
}
