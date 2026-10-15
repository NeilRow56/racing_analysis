import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { calculateJumpSpeedRating } from "./jump-speed-rating";
import { reviewJumpWinningTime, validateNewcastleCorrection } from "./jump-winning-time-integrity";

describe("winning-time integrity", () => {
  const peers = [300, 304, 309, 312, 314, 315, 316, 317, 320, 323, 327, 331];
  test("flags the Newcastle error, accepts the correction and an ordinary fast race", () => {
    assert.equal(reviewJumpWinningTime(253.53, peers).status, "REVIEW");
    assert.equal(reviewJumpWinningTime(314.41, peers).status, "PASS");
    assert.equal(reviewJumpWinningTime(295, peers).status, "PASS");
  });
  test("sparse standards require review; legitimate slow going is not an automatic source error", () => {
    assert.equal(reviewJumpWinningTime(314, [310, 315]).reason, "sparse_standard");
    assert.equal(reviewJumpWinningTime(375, peers).status, "PASS");
    assert.equal(reviewJumpWinningTime(253, [250, 260, 270, 280, 300, 310, 330, 360, 370, 380, 390, 400]).status, "PASS");
  });
  test("correction validation leaves raw provenance and prospective input intact", () => {
    const state = { source: "sporting_life", source_id: "904023", race_date: "2026-02-21", winning_time: "4m 13.53s", payload: { winning_time: "4m 13.53s" }, frozen: { probability: 0.9, selection: true } };
    const saved = structuredClone(state);
    assert.equal(validateNewcastleCorrection(state), "5m 14.41s");
    assert.deepEqual(state, saved);
    assert.throws(() => validateNewcastleCorrection({ ...state, source_id: "other" }));
    assert.throws(() => validateNewcastleCorrection({ ...state, winning_time: "5m 14.41s" }));
  });
  test("authoritative corrected time is used in the real rating formula", () => {
    const input = { raceName: "Handicap Chase", distanceYards: 4419, winningTime: "4m 13.53s", baseStandardSeconds: 315.11, standardSampleSize: 20, cumulativeBeatenLengths: 2 };
    const before = calculateJumpSpeedRating(input);
    const after = calculateJumpSpeedRating({ ...input, winningTime: "5m 14.41s" });
    assert.ok(Math.abs(before.rating! - 215.1879) < 0.001);
    assert.ok(Math.abs(after.rating! - 100.6026) < 0.001);
  });
});
