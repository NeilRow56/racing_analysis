import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  defaultResearchRule,
  evaluateResearchRule,
  type ResearchRuleV1,
} from "./research-rule";
import {
  evaluateResearchTimeSliceStability,
  researchTimeSlices,
} from "./research-time-slice-stability";
import type {
  HistoricalPostRaceOutcome,
  HistoricalPreRaceFeatureRow,
  HistoricalTargetRunnerMetricsRow,
} from "./historical-target-metrics";

describe("research time-slice stability slices", () => {
  test("full 2025 produces four quarter slices plus the full period", () => {
    const slices = researchTimeSlices(defaultResearchRule("jump"));

    assert.deepEqual(
      slices.map((slice) => [slice.label, slice.from, slice.to, slice.isFullPeriod]),
      [
        ["Jan-Mar", "2025-01-01", "2025-03-31", false],
        ["Apr-Jun", "2025-04-01", "2025-06-30", false],
        ["Jul-Sep", "2025-07-01", "2025-09-30", false],
        ["Oct-Dec", "2025-10-01", "2025-12-31", false],
        ["Full period", "2025-01-01", "2025-12-31", true],
      ],
    );
  });

  test("narrower development ranges intersect quarters and omit empty slices", () => {
    const slices = researchTimeSlices({
      ...defaultResearchRule("jump"),
      dateRange: { from: "2025-02-15", to: "2025-08-10" },
    });

    assert.deepEqual(
      slices.map((slice) => [slice.label, slice.from, slice.to]),
      [
        ["Jan-Mar", "2025-02-15", "2025-03-31"],
        ["Apr-Jun", "2025-04-01", "2025-06-30"],
        ["Jul-Sep", "2025-07-01", "2025-08-10"],
        ["Full period", "2025-02-15", "2025-08-10"],
      ],
    );
  });
});

describe("research time-slice stability evaluation", () => {
  test("uses normal Research semantics for each slice without mutating the executed rule", () => {
    const rule: ResearchRuleV1 = {
      ...defaultResearchRule("jump"),
      ratings: [{ metric: "latestSpeedRating", range: { min: 100 } }],
    };
    const before = JSON.stringify(rule);
    const rows = [
      row({ targetRunnerId: "q1-winner", raceDate: "2025-02-01", latestSpeedRating: 100 }, {
        finishingPosition: 1,
        won: true,
        placed: true,
        startingPriceDecimal: "6.000",
      }),
      row({ targetRunnerId: "q2-loser", raceDate: "2025-05-01", latestSpeedRating: 100 }, {
        finishingPosition: 4,
        won: false,
        placed: false,
        startingPriceDecimal: "4.000",
      }),
      row({ targetRunnerId: "q4-loser", raceDate: "2025-11-01", latestSpeedRating: 100 }, {
        finishingPosition: 5,
        won: false,
        placed: false,
        startingPriceDecimal: "3.000",
      }),
      row({ targetRunnerId: "holdout-row", raceDate: "2026-02-01", latestSpeedRating: 100 }, {
        finishingPosition: 1,
        won: true,
        placed: true,
        startingPriceDecimal: "100.000",
      }),
    ];
    const result = evaluateResearchRule({ rows, rule });
    const timeSlice = evaluateResearchTimeSliceStability({ rows, result });

    assert.equal(JSON.stringify(rule), before);
    assert.deepEqual(
      timeSlice.rows.map((slice) => slice.label),
      ["Jan-Mar", "Apr-Jun", "Jul-Sep", "Oct-Dec", "Full period"],
    );

    const q1 = timeSlice.rows.find((slice) => slice.label === "Jan-Mar")!;
    const expectedQ1 = evaluateResearchRule({
      rows,
      rule: { ...rule, dateRange: { from: "2025-01-01", to: "2025-03-31" } },
    });
    assert.deepEqual(q1.summary, expectedQ1.summary);
    assert.equal(q1.summary.profitLoss, 5);
    assert.equal(q1.summary.roiPercentage, 500);
    assert.equal(q1.summary.winStrikeRate, 100);
    assert.equal(q1.summary.maxConsecutiveLosers, 0);
    assert.equal(q1.smallSample, true);

    const full = timeSlice.rows.find((slice) => slice.isFullPeriod)!;
    assert.deepEqual(full.summary, result.summary);
    assert.equal(full.summary.selections, 3);
    assert.equal(full.summary.profitLoss, 3);
    assert.equal(full.summary.maxConsecutiveLosers, 2);
    assert.equal(timeSlice.summaryLabel, "No settled selections in some periods");

    for (const slice of timeSlice.rows.filter((item) => !item.isFullPeriod)) {
      assert.deepEqual(withoutDateRange(slice.rule), withoutDateRange(rule));
    }
  });

  test("summarizes profitable periods and profit concentration safely", () => {
    const rule = defaultResearchRule("jump");
    const rows = [
      profitableRow("q1", "2025-02-01", "2.000"),
      profitableRow("q2", "2025-05-01", "2.000"),
      profitableRow("q3", "2025-08-01", "2.000"),
      profitableRow("q4", "2025-11-01", "2.000"),
    ];
    const result = evaluateResearchRule({ rows, rule });
    const timeSlice = evaluateResearchTimeSliceStability({ rows, result });

    assert.equal(timeSlice.summaryLabel, "Profitable in 4 of 4 periods");
    assert.equal(timeSlice.concentrationLabel, "Development profit is spread across profitable periods.");
  });

  test("reports concentrated profit and handles zero positive profit", () => {
    const rule = defaultResearchRule("jump");
    const concentratedRows = [
      profitableRow("big", "2025-02-01", "11.000"),
      profitableRow("small", "2025-05-01", "2.000"),
      losingRow("loss-1", "2025-08-01"),
      losingRow("loss-2", "2025-11-01"),
    ];
    const concentrated = evaluateResearchTimeSliceStability({
      rows: concentratedRows,
      result: evaluateResearchRule({ rows: concentratedRows, rule }),
    });

    assert.equal(concentrated.summaryLabel, "Profit concentrated in one period");
    assert.equal(concentrated.concentrationLabel, "Development profit is concentrated in one period.");

    const losingRows = [
      losingRow("loss-1", "2025-02-01"),
      losingRow("loss-2", "2025-05-01"),
      losingRow("loss-3", "2025-08-01"),
      losingRow("loss-4", "2025-11-01"),
    ];
    const losing = evaluateResearchTimeSliceStability({
      rows: losingRows,
      result: evaluateResearchRule({ rows: losingRows, rule }),
    });

    assert.equal(losing.summaryLabel, "Mixed results across periods");
    assert.equal(losing.concentrationLabel, null);
  });

  test("applies the active development settlement mode to every time slice", () => {
    const rule = defaultResearchRule("jump");
    const rows = [
      profitableRow("q1-big", "2025-02-01", "41.000"),
      losingRow("q1-loss", "2025-02-02"),
      profitableRow("q2-big", "2025-05-01", "41.000"),
    ];
    const result = evaluateResearchRule({ rows, rule });
    const timeSlice = evaluateResearchTimeSliceStability({
      rows,
      result,
      settlementMode: "cap_20_1",
    });
    const q1 = timeSlice.rows.find((slice) => slice.label === "Jan-Mar")!;
    const full = timeSlice.rows.find((slice) => slice.isFullPeriod)!;

    assert.equal(timeSlice.settlementMode, "cap_20_1");
    assert.equal(timeSlice.settlementModeLabel, "Winner returns capped at 20/1");
    assert.equal(result.summary.profitLoss, 79);
    assert.equal(q1.summary.profitLoss, 19);
    assert.equal(full.summary.profitLoss, 39);
    assert.equal(full.summary.selections, result.summary.selections);
    assert.equal(full.summary.wins, result.summary.wins);
    assert.equal(full.summary.maxConsecutiveLosers, result.summary.maxConsecutiveLosers);
  });
});

function profitableRow(id: string, raceDate: string, odds: string) {
  return row({ targetRunnerId: id, raceDate }, {
    finishingPosition: 1,
    won: true,
    placed: true,
    startingPriceDecimal: odds,
  });
}

function losingRow(id: string, raceDate: string) {
  return row({ targetRunnerId: id, raceDate }, {
    finishingPosition: 4,
    won: false,
    placed: false,
    startingPriceDecimal: "4.000",
  });
}

function withoutDateRange(rule: ResearchRuleV1): Omit<ResearchRuleV1, "dateRange"> {
  const { dateRange: _dateRange, ...rest } = rule;
  void _dateRange;
  return rest;
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
  const raceDate = overrides.raceDate ?? "2025-06-01";
  return {
    targetRaceId: `race-${overrides.targetRunnerId ?? "runner-1"}`,
    targetRunnerId: "runner-1",
    source: "sporting_life",
    horseId: "horse-1",
    horseName: "Example",
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
