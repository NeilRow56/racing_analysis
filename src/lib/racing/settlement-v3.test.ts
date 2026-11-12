import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { settleSelection, settleRecordedSelection, settledWinValue } from "./backtest";
import type { HistoricalPostRaceOutcome } from "./historical-target-metrics";
import { raceForSettlement, settlementOutcomeState } from "./settlement-outcome";
import { CANONICAL_SETTLEMENT_VERSION, LEGACY_SETTLEMENT_VERSION, settlementVersionLabel } from "./research-settlement-version";

const outcome = (extra: Partial<HistoricalPostRaceOutcome> = {}): HistoricalPostRaceOutcome => ({
  targetRaceId: "race", targetRunnerId: "runner", finishingPosition: 1, resultStatus: "finished",
  won: true, placed: true, startingPrice: "4/1", startingPriceDecimal: "5", ...extra,
});

describe("corrected settlement v3", () => {
  test("void and abandoned source stages override provisional winners without a losing stake", () => {
    for (const raceStage of ["RACEVOID", "race_void", "ABANDONED", "cancelled", "no_race"]) {
      const o = outcome({ raceStage });
      assert.equal(settlementOutcomeState(o), "void");
      assert.equal(settleSelection(o), null);
      assert.equal(settledWinValue(o), null);
    }
  });

  test("genuine non-runners are distinct from non-finishers, including in a void race", () => {
    assert.equal(settlementOutcomeState(outcome({ raceStage: "RACEVOID", resultStatus: "non_runner" })), "NR");
    assert.equal(settleSelection(outcome({ resultStatus: "NON-RUNNER" })), null);
    for (const resultStatus of ["pulled_up", "fell", "unseated_rider", "brought_down", "ran_out", "refused_to_race"]) {
      const o = outcome({ raceStage: "WEIGHEDIN", finishingPosition: null, won: null, resultStatus });
      assert.equal(settlementOutcomeState(o), "loss");
      assert.equal(settleSelection(o)?.profitLoss, -1);
    }
  });

  test("explicit legacy non-finisher codes settle; a generic other/zero status does not", () => {
    const o = outcome({ finishingPosition: null, resultStatus: "other", won: null });
    for (const outcomeCode of ["BroughtDown", "CarriedOut", "Refused", "RefusedToRace", "SlippedUp"]) {
      assert.equal(settleSelection({ ...o, raceStage: "WEIGHEDIN", outcomeCode })?.profitLoss, -1);
    }
    assert.equal(settleSelection({ ...o, outcomeCode: "0" }), null);
    assert.equal(settleSelection({ ...o, resultStatus: null }), null);
  });

  test("non-final and unknown source stages remain unresolved even with a price or stale position", () => {
    for (const raceStage of ["DORMANT", "PARADING", "OFF", "FINISHED", "RESULT", "unknown-new-stage"]) {
      assert.equal(settlementOutcomeState(outcome({ raceStage })), "unresolved");
      assert.equal(settleSelection(outcome({ raceStage })), null);
    }
    for (const startingPriceDecimal of [null, "", "0", "1", "NaN", "Infinity"]) assert.equal(settleSelection(outcome({ startingPriceDecimal })), null);
  });

  test("SP includes stake: ordinary uncapped SP 301 winner returns £301 on £1", () => {
    assert.deepEqual(settleSelection(outcome({ startingPriceDecimal: "301" })), {
      settlementVersion: CANONICAL_SETTLEMENT_VERSION, settled: true, settlementOddsDecimal: 301,
      stake: 1, grossReturn: 301, profitLoss: 300,
    });
    assert.equal(settleSelection(outcome({ finishingPosition: 2, won: false }))?.profitLoss, -1);
  });

  test("dead heats split stake rather than profit; a winning selection can have negative net return", () => {
    assert.equal(settleSelection(outcome({ deadHeatDivisor: 2 }))?.grossReturn, 2.5);
    assert.equal(settleSelection(outcome({ startingPriceDecimal: "7", deadHeatDivisor: 3 }))?.grossReturn, 7 / 3);
    const short = outcome({ startingPriceDecimal: "1.5", deadHeatDivisor: 2 });
    assert.equal(settleSelection(short)?.profitLoss, -0.25);
    assert.equal(settledWinValue(short), true);
  });

  test("an explicit original-v2 view preserves previous arithmetic without relabelling it", () => {
    const o = outcome({ deadHeatDivisor: 2 });
    const bytes = JSON.stringify(o);
    assert.equal(settleRecordedSelection(o, LEGACY_SETTLEMENT_VERSION)?.grossReturn, 3);
    assert.equal(settleRecordedSelection(o)?.settlementVersion, LEGACY_SETTLEMENT_VERSION);
    assert.equal(settleRecordedSelection(o, CANONICAL_SETTLEMENT_VERSION)?.grossReturn, 2.5);
    assert.equal(settlementVersionLabel({ settlementVersion: LEGACY_SETTLEMENT_VERSION }), "Original v2 (superseded)");
    assert.equal(JSON.stringify(o), bytes);
  });

  test("settlement-only projection preserves captured race and runner fields", () => {
    const race = { raceStage: "RACEVOID", runners: [{ resultStatus: "finished", finishingPosition: 1, price: 301, probability: 0.1 }] };
    const before = structuredClone(race);
    const projected = raceForSettlement(race);
    assert.deepEqual(race, before);
    assert.equal(projected.runners[0].resultStatus, "void_race");
    assert.equal(projected.runners[0].finishingPosition, null);
    assert.equal(projected.runners[0].price, 301);
    assert.equal(projected.runners[0].probability, 0.1);
  });
});
