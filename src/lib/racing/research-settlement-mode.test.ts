import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { BacktestSelection } from "./backtest";
import type {
  HistoricalPostRaceOutcome,
  HistoricalPreRaceFeatureRow,
} from "./historical-target-metrics";
import { defaultResearchRule } from "./research-rule";
import { researchRuleKey } from "./research-rule-identity";
import {
  parseDevelopmentSettlementMode,
  summarizeSelectionsForDevelopmentSettlementMode,
} from "./research-settlement-mode";

describe("development settlement mode", () => {
  test("caps winning result SP for development analysis without changing outcome counts", () => {
    const selections = [
      winner("five-to-one", 6),
      winner("twenty-to-one", 21),
      winner("thirty-three-to-one", 34),
      winner("two-hundred-to-one", 201),
      loser("loser"),
      unsettled("unsettled"),
      nonRunner("non-runner"),
    ];

    const actual = summarizeSelectionsForDevelopmentSettlementMode(selections, "actual");
    const cap20 = summarizeSelectionsForDevelopmentSettlementMode(selections, "cap_20_1");
    const cap33 = summarizeSelectionsForDevelopmentSettlementMode(selections, "cap_33_1");

    assert.equal(actual.profitLoss, 257);
    assert.equal(cap20.profitLoss, 64);
    assert.equal(cap33.profitLoss, 90);
    assert.equal(cap20.settledSelections, actual.settledSelections);
    assert.equal(cap20.wins, actual.wins);
    assert.equal(cap20.winStrikeRate, actual.winStrikeRate);
    assert.equal(cap20.places, actual.places);
    assert.equal(cap20.placeStrikeRate, actual.placeStrikeRate);
    assert.equal(cap20.maxConsecutiveLosers, actual.maxConsecutiveLosers);
    assert.equal(cap20.roiPercentage, 64 / 5 * 100);
    assert.equal(cap33.roiPercentage, 90 / 5 * 100);
  });

  test("settlement mode parsing is separate from canonical rule identity", () => {
    const rule = defaultResearchRule("jump");
    const identity = researchRuleKey(rule);

    assert.equal(parseDevelopmentSettlementMode("cap_20_1"), "cap_20_1");
    assert.equal(parseDevelopmentSettlementMode("cap_33_1"), "cap_33_1");
    assert.equal(parseDevelopmentSettlementMode("unexpected"), "actual");
    assert.equal(researchRuleKey(rule), identity);
  });
});

function winner(id: string, decimalOdds: number): BacktestSelection {
  return selection(id, {
    finishingPosition: 1,
    won: true,
    placed: true,
    startingPriceDecimal: decimalOdds.toFixed(3),
  });
}

function loser(id: string): BacktestSelection {
  return selection(id, {
    finishingPosition: 5,
    won: false,
    placed: false,
    startingPriceDecimal: "5.000",
  });
}

function unsettled(id: string): BacktestSelection {
  return selection(id, {
    finishingPosition: null,
    won: null,
    placed: null,
    startingPriceDecimal: null,
  });
}

function nonRunner(id: string): BacktestSelection {
  return selection(id, {
    finishingPosition: null,
    resultStatus: "non_runner",
    won: null,
    placed: null,
    startingPriceDecimal: "5.000",
  });
}

function selection(
  id: string,
  outcome: Partial<HistoricalPostRaceOutcome>,
): BacktestSelection {
  const features = feature(id);
  const won = outcome.won === true;
  const decimalOdds = outcome.startingPriceDecimal ? Number(outcome.startingPriceDecimal) : null;
  const settled = outcome.resultStatus !== "non_runner" &&
    outcome.finishingPosition !== null &&
    outcome.won !== null &&
    decimalOdds !== null;
  return {
    id,
    definitionId: "test",
    selectedReason: "test",
    features,
    derived: {
      latestSpeedMinusOR: null,
      bestL3SpeedMinusOR: null,
      latestMinusPreviousSpeed: null,
      latestMinusBestL3: null,
      latestPerformanceMinusOR: null,
      bestPerformanceL3MinusOR: null,
      latestPerformanceMinusPreviousPerformance: null,
      latestTodaysRatingMinusOR: null,
      bestTodaysRatingL3MinusOR: null,
      latestTodaysMinusPreviousTodays: null,
      preRaceOddsDecimal: null,
      fieldSize: null,
    },
    outcome: {
      targetRaceId: features.targetRaceId,
      targetRunnerId: features.targetRunnerId,
      finishingPosition: 5,
      resultStatus: "finished",
      won: false,
      placed: false,
      startingPrice: null,
      startingPriceDecimal: "5.000",
      ...outcome,
    },
    settlement: settled
      ? {
        settled: true,
        settlementOddsDecimal: decimalOdds,
        stake: 1,
        grossReturn: won ? decimalOdds : 0,
        profitLoss: (won ? decimalOdds : 0) - 1,
      }
      : null,
  };
}

function feature(id: string): HistoricalPreRaceFeatureRow {
  return {
    targetRaceId: `race-${id}`,
    targetRunnerId: id,
    raceDateTime: new Date("2025-06-01T13:00:00.000Z"),
    raceDate: "2025-06-01",
    courseName: "Worcester",
  } as HistoricalPreRaceFeatureRow;
}
