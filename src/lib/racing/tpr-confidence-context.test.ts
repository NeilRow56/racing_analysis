import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { getTprConfidenceContext, type UsableTurfHistoryRun } from "./tpr-confidence-context";
import { calculateTurfPerformanceRating, rankTurfPerformanceRatings } from "./turf-performance-rating";

const cutoff = new Date("2026-10-01T16:55:00Z");
function run(days: number, overrides: Partial<UsableTurfHistoryRun> = {}): UsableTurfHistoryRun {
  return { runnerId: `run-${days}`, raceDateTime: new Date(cutoff.getTime() - days * 86400000), resultStatus: "finished", finishingPosition: 4, weightCarriedLbs: 135, turfSpeedRating: { rating: 100.853 }, ...overrides };
}
const input = {
  latestPerformanceRating: 67.853, previousPerformanceRating: null, averagePerformanceLast3: null,
  latestSpeedRating: 100.853, previousSpeedRating: null, averageSpeedLast3: null,
  raceClass: "Class 4", weightCarriedLbs: 137, raceMedianWeightCarriedLbs: 133,
};
describe("TPR confidence context", () => {
  test("counts a true one-run history", () => {
    const context = getTprConfidenceContext([run(22)], cutoff);
    assert.equal(context.usableTurfHistoryCount, 1);
    assert.equal(context.historyDepthLabel, "1-run basis");
    assert.equal(context.limitedHistory, true);
    assert.equal(context.staleTurfEvidence, false);
  });
  test("counts actual two-run history even when reconstructed rating depth is one", () => {
    assert.equal(calculateTurfPerformanceRating(input)?.historyDepth, 1);
    const context = getTprConfidenceContext([run(22), run(200)], cutoff);
    assert.equal(context.usableTurfHistoryCount, 2);
    assert.equal(context.historyDepthLabel, "2-run basis");
    assert.equal(context.limitedHistory, false);
  });
  test("does not cap actual history at three", () => {
    const context = getTprConfidenceContext([run(10), run(30), run(60), run(90)], cutoff);
    assert.equal(context.usableTurfHistoryCount, 4);
    assert.equal(context.historyDepthLabel, "3+ run basis");
    assert.equal(context.limitedHistory, false);
  });
  test("stale means strictly more than 180 days", () => {
    assert.equal(getTprConfidenceContext([run(180)], cutoff).staleTurfEvidence, false);
    assert.equal(getTprConfidenceContext([run(181)], cutoff).staleTurfEvidence, true);
  });
  test("recent non-Turf and unusable Turf runs do not reset the evidence date", () => {
    const context = getTprConfidenceContext([run(545), run(10, { turfSpeedRating: null }), run(5, { weightCarriedLbs: null })], cutoff);
    assert.equal(context.daysSinceUsableTurfRun, 545);
    assert.equal(context.latestUsableTurfRunDateTime, run(545).raceDateTime.toISOString());
    assert.equal(context.staleTurfEvidence, true);
    assert.equal(context.limitedHistory, true);
  });
  test("excludes non-runners, unknown results, cutoff/future runs, invalid values and duplicates", () => {
    const context = getTprConfidenceContext([
      run(22), run(22), run(10, { resultStatus: "non_runner" }),
      run(11, { resultStatus: null, finishingPosition: null }), run(0), run(-1),
      run(12, { turfSpeedRating: { rating: NaN } }), run(13, { weightCarriedLbs: 0 }),
      run(14, { raceDateTime: new Date(NaN) }),
    ], cutoff);
    assert.equal(context.usableTurfHistoryCount, 1);
    const empty = getTprConfidenceContext([], cutoff);
    assert.equal(empty.daysSinceUsableTurfRun, null);
    assert.equal(empty.limitedHistory, false);
    assert.equal(empty.staleTurfEvidence, false);
  });
  test("metadata does not change any frozen rating or rank field", () => {
    const baseline = calculateTurfPerformanceRating(input)!;
    const context = getTprConfidenceContext([run(545)], cutoff);
    const withContext = calculateTurfPerformanceRating({ ...input, ...context })!;
    assert.deepEqual(withContext, baseline);
    assert.deepEqual(rankTurfPerformanceRatings([{ id: "exactly-right", rating: baseline }]), rankTurfPerformanceRatings([{ id: "exactly-right", rating: withContext }]));
  });
});
