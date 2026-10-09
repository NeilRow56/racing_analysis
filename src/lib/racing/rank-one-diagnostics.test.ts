import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  auditRankOneSelections,
  confidenceBand,
  type RankOneDiagnosticSelection,
} from "./rank-one-diagnostics";

const base: RankOneDiagnosticSelection = {
  family: "Turf",
  model: "TEST",
  raceId: "race",
  raceDate: "2026-10-01",
  course: "Test",
  raceTime: "12:00",
  horseName: "Leader",
  runnerId: "runner",
  won: false,
  finalSp: 2,
  marketImpliedProbability: 0.5,
  modelProbability: 0.25,
  probabilityGap: 0.02,
  ratingGap: null,
  independentAgreements: 0,
};

describe("rank-one diagnostics", () => {
  test("classifies pre-specified confidence bands without price", () => {
    assert.equal(confidenceBand({ ...base, finalSp: 1.5, modelProbability: 0.39, probabilityGap: 0.01 }), "high");
    assert.equal(confidenceBand({ ...base, finalSp: 10, modelProbability: 0.22, probabilityGap: 0.01 }), "medium");
    assert.equal(confidenceBand({ ...base, finalSp: 2.25, modelProbability: 0.12, probabilityGap: 0.01 }), "low");
    assert.equal(confidenceBand({ ...base, finalSp: 2.25, modelProbability: null, probabilityGap: null, ratingGap: 11 }), "high");
  });

  test("summarizes fixed SP bands and actual-minus-expectation counts", () => {
    const audits = auditRankOneSelections([
      { ...base, raceId: "odds-on", won: true, finalSp: 1.8, marketImpliedProbability: 1 / 1.8, modelProbability: 0.6 },
      { ...base, raceId: "evens", won: false, finalSp: 2, marketImpliedProbability: 0.5, modelProbability: 0.3 },
      { ...base, raceId: "two", won: true, finalSp: 3, marketImpliedProbability: 1 / 3, modelProbability: 0.25 },
      { ...base, raceId: "four", won: false, finalSp: 5, marketImpliedProbability: 0.2, modelProbability: 0.2 },
      { ...base, raceId: "eight", won: false, finalSp: 9, marketImpliedProbability: 1 / 9, modelProbability: 0.1 },
    ]);
    assert.equal(audits.length, 1);
    assert.deepEqual(audits[0]!.priceBands.map((band) => band.selections), [1, 1, 1, 1, 1]);
    assert.ok(Math.abs(audits[0]!.priceBands[0]!.actualMinusMarketExpectation! - (1 - 1 / 1.8)) < 1e-12);
    assert.ok(Math.abs(audits[0]!.priceBands[1]!.actualMinusModelExpectation! - -0.3) < 1e-12);
  });
});
