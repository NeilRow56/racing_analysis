import assert from "node:assert/strict";
import { test } from "node:test";
import { chaseT3Research, recordedStake, stakeSensitivity } from "./chase-t3-research";
import { CANONICAL_SETTLEMENT_VERSION } from "./research-settlement-version";
import { emptyTissueGeneration, type GenerationRace } from "./tissue-generation-forward";
import { GENERATION_MODEL_HASHES } from "./tissue-generation-config";

function book(raceId: string, raceDate: string, hour = "11"): GenerationRace {
  return {
    raceId, raceDate, family: "CHASE", course: "Test", modelVersion: "CHASE_TISSUE_V2", modelHash: GENERATION_MODEL_HASHES.CHASE,
    capturedAt: `${raceDate}T${hour}:00:00.000Z`, featureCutoffAt: `${raceDate}T10:00:00.000Z`, scheduledOff: `${raceDate}T14:00:00.000Z`,
    completeMarket: true, marketSource: "sporting_life_median_bookmaker_at_capture_v1", featureNames: [], adjustmentFeatureNames: [],
    runners: [2, 3, 8].map((price, i) => ({
      runnerId: String(i), horseId: String(i), horseName: String(i), rank: i + 1, probability: [.5, .3, .2][i], modelInputs: [], adjustmentInputs: [],
      capturedPrice: price, quotes: [], outcome: {
        settlementVersion: CANONICAL_SETTLEMENT_VERSION, status: "settled", winner: i === 2, finishPosition: i === 2 ? 1 : i + 2,
        resultStatus: "finished", deadHeatDivisor: 1, grossReturn: i === 2 ? 8 : 0, profitLoss: i === 2 ? 7 : -1, settledAt: `${raceDate}T15:00:00.000Z`,
      },
    })),
  };
}

test("T3 review keeps whole historical and first future books separate, with result availability at the cutoff", () => {
  const historical = book("older", "2026-11-18");
  const tooLate = book("late", "2026-11-18");
  tooLate.runners[2].outcome!.settledAt = "2026-11-18T17:00:00.000Z";
  const future = book("new", "2026-11-19");
  future.runners[2].outcome = null;
  const refresh = book("new", "2026-11-19", "12");
  const historicalIdRecapture = book("older", "2026-11-19");
  const afterOff = book("after-off", "2026-11-19", "15");
  const data = { ...emptyTissueGeneration(), races: [historical, tooLate, refresh, future, historicalIdRecapture, afterOff] };
  const before = structuredClone(data);
  const report = chaseT3Research(data);
  assert.deepEqual([report.historical.headline.captured, report.historical.headline.settled, report.historical.headline.profit], [2, 1, 7]);
  assert.deepEqual([report.prospective.headline.captured, report.prospective.headline.settled, report.prospective.headline.profit], [1, 0, null]);
  assert.deepEqual(data, before);
});

test("money is limited to valid captured corrected settlements and removal drops each winning stake", () => {
  const { runners } = book("race", "2026-11-19");
  const winner = runners[2];
  assert.equal(recordedStake({ ...winner, capturedPrice: null }), null);
  assert.equal(recordedStake({ ...winner, capturedPrice: 1 }), null);
  assert.equal(recordedStake({ ...winner, outcome: { ...winner.outcome!, settlementVersion: undefined } }), null);
  assert.equal(recordedStake({ ...winner, outcome: { ...winner.outcome!, status: "NR" } }), null);
  const largest = recordedStake(winner)!;
  const losing = recordedStake(runners[0])!;
  const stakes = stakeSensitivity([largest, losing, { gross: 5, profit: 4, winner: true }]);
  assert.deepEqual(stakes.afterOne, { n: 2, profit: 3, roi: 1.5 });
  assert.deepEqual(stakes.afterTwo, { n: 1, profit: -1, roi: -1 });
});
