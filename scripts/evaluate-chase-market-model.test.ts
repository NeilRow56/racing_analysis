import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chronologicalSplit, eligibleFields, predict, predictionInputs,
} from "./evaluate-chase-market-model";

function book(raceId = "race", day = "2026-11-05") {
  const off = `${day}T14:00:00.000Z`;
  return {
    raceId, raceDate: day, capturedAt: `${day}T11:00:00.000Z`, featureCutoffAt: `${day}T10:00:00.000Z`,
    scheduledOff: off, marketSource: "sporting_life_median_bookmaker_at_capture_v1" as const,
    featureNames: ["official_rating", "best_l3_jump_speed", "official_rating_missing", "best_l3_jump_speed_missing"],
    runners: [
      { runnerId: "a", modelInputs: [120, 110, 0, 0], capturedPrice: 2, probability: .6 },
      { runnerId: "b", modelInputs: [80, 110, 0, 0], capturedPrice: 3, probability: .3 },
      { runnerId: "c", modelInputs: [0, 0, 1, 1], capturedPrice: 9, probability: .1 },
    ].map((runner, i) => ({
      ...runner, outcome: {
        status: "settled" as const, winner: i === 0, finishPosition: i + 1, deadHeatDivisor: 1,
        grossReturn: i === 0 ? 2 : 0, profitLoss: i === 0 ? 1 : -1, resultStatus: "finished", settledAt: `${day}T16:00:00.000Z`,
      },
    })),
  };
}

test("prediction inputs use only pre-off fields, correctly encode ties and missing values, and normalize the market", () => {
  const race = book();
  const inputs = predictionInputs(race);
  assert(inputs);
  assert.deepEqual(inputs.x, [[.5, 0], [-.5, 0], [0, 0]]);
  assert.equal(inputs.market.reduce((sum, p) => sum + p, 0), 1);
  const changedResults = { ...race, runners: race.runners.map(runner => ({ ...runner, outcome: null, probability: .25, finalSp: 99 })) };
  assert.deepEqual(predictionInputs(changedResults), inputs);
  assert.equal(predictionInputs({ ...race, capturedAt: race.scheduledOff }), null);
  assert.equal(predictionInputs({ ...race, featureCutoffAt: race.scheduledOff }), null);
  const partial = structuredClone(race);
  partial.runners.pop();
  partial.runners[0].capturedPrice = 0;
  assert.equal(predictionInputs(partial), null);
  const probabilities = predict(inputs, [0, 0], "marketOffset");
  assert(probabilities.every((p, i) => Math.abs(p - inputs.market[i]) < 1e-12));
  assert.equal(predict(inputs, [0, 0], "standalone").reduce((sum, p) => sum + p, 0), 1);
});

test("split rejects overlapping and duplicate races, excludes unavailable results and preserves dead-heat mass", () => {
  const training = book("train", "2026-11-04"), validation = book("validate");
  assert.equal(chronologicalSplit([training], [validation]).train.length, 1);
  assert.equal(chronologicalSplit([training], [validation]).validate.length, 1);
  assert.throws(() => chronologicalSplit([training], [{ ...validation, raceId: training.raceId }]), /distinct IDs/);
  assert.throws(() => chronologicalSplit([training], [training]), /precede validation/);
  assert.throws(() => eligibleFields([validation, validation], "2026-11-19T00:00:00.000Z"), /Duplicate race/);
  assert.equal(eligibleFields([validation], "2026-11-05T15:00:00.000Z").length, 0);
  const second = validation.runners[1];
  assert.equal(eligibleFields([{ ...validation, runners: [validation.runners[0], { ...second, runnerId: "a" }] }], "2026-11-19T00:00:00.000Z").length, 0);
  validation.runners[0].outcome.deadHeatDivisor = 2;
  second.outcome.winner = true;
  second.outcome.deadHeatDivisor = 2;
  assert.deepEqual(eligibleFields([validation], "2026-11-19T00:00:00.000Z")[0].labels, [.5, .5, 0]);
});
