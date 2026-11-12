import assert from "node:assert/strict";
import { test } from "node:test";
import { adjustedProfit as turfProfit } from "./diagnose-turf-tpr-candidate-robustness";
import { adjustedProfit as jumpProfit } from "./diagnose-jump-turf-candidate-robustness";
import { marketMetrics, positiveEdgeMetrics } from "./diagnose-turf-tissue-aw-transfer";
import type { HistoricalPostRaceOutcome } from "@/lib/racing/historical-target-metrics";

const outcome = (extra: Partial<HistoricalPostRaceOutcome> = {}): HistoricalPostRaceOutcome => ({
  targetRaceId: "race", targetRunnerId: "runner", finishingPosition: 1, resultStatus: "finished",
  won: true, placed: true, startingPrice: "4/1", startingPriceDecimal: "5", ...extra,
});
function rows() {
  return [outcome({ deadHeatDivisor: 2 }), outcome({ finishingPosition: 2, won: false }),
    outcome({ resultStatus: "non_runner" }), outcome({ raceStage: "RACEVOID" }),
    outcome({ raceStage: "OFF" }), outcome({ startingPriceDecimal: "301" })];
}
test("both robustness diagnostics use V3 dead heats, settled stakes and uncapped winners", () => {
  for (const profit of [turfProfit, jumpProfit]) {
    // These calculations inspect outcome alone; unrelated feature/rank fields are unused.
    const selections = rows().map(outcome => ({ outcome })) as Parameters<typeof profit>[0];
    assert.deepEqual(profit(selections, 0), { profitLoss: 300.5, roiPercentage: 300.5 / 3 * 100 });
    assert.equal(profit(selections.slice(0, 1), .1).profitLoss, 1.25);
    assert.equal(profit(selections.slice(2, 5), 0).roiPercentage, null);
  }
});
test("transfer monetary diagnostics exclude NR/void/pending and divide full SP", () => {
  const selections = rows().map(outcome => ({ row: { outcome }, probability: .9 })) as Parameters<typeof marketMetrics>[0];
  const before = JSON.stringify(selections);
  const market = marketMetrics(selections);
  assert.equal(market.selections, 3); assert.equal(market.profitLoss, 300.5); assert.equal(market.roi, 300.5 / 3);
  assert.equal(positiveEdgeMetrics(selections).roi, 300.5 / 3);
  assert.equal(marketMetrics(selections.slice(0, 1)).profitLoss, 1.5);
  assert.equal(JSON.stringify(selections), before);
});
