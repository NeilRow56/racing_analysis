import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  calculateRatingCoverage,
  JPR_A_RATING_COVERAGE_GUARD_IMPLEMENTED_AT,
  JPR_A_RATING_COVERAGE_GUARD_VERSION,
  TPR_RATING_COVERAGE_GUARD_IMPLEMENTED_AT,
  TPR_RATING_COVERAGE_GUARD_VERSION,
} from "./rating-coverage";

describe("minimum race-rating coverage", () => {
  for (const [label, version, epoch] of [
    ["TPR", TPR_RATING_COVERAGE_GUARD_VERSION, TPR_RATING_COVERAGE_GUARD_IMPLEMENTED_AT],
    ["JPR-A", JPR_A_RATING_COVERAGE_GUARD_VERSION, JPR_A_RATING_COVERAGE_GUARD_IMPLEMENTED_AT],
  ] as const) {
    test(`${label} classifies fixed coverage edge cases`, () => {
      assert.equal(coverage(11, 1, version, epoch).ratingCoverageStatus, "insufficient_coverage");
      assert.equal(coverage(11, 2, version, epoch).ratingCoverageStatus, "insufficient_coverage");
      assert.equal(coverage(11, 3, version, epoch).ratingCoverageStatus, "eligible");
      assert.equal(coverage(5, 2, version, epoch).ratingCoverageStatus, "eligible");
      const withNonRunner = calculateRatingCoverage(
        [...runners(5, 2), { id: "nr", resultStatus: "non_runner", rated: false }],
        (runner) => runner.rated,
        version,
        epoch,
      );
      assert.equal(withNonRunner.activeRunnerCount, 5);
      assert.equal(withNonRunner.ratedRunnerCount, 2);
      assert.equal(withNonRunner.ratingCoverageStatus, "eligible");
    });
  }
});

function coverage(activeRunnerCount: number, ratedRunnerCount: number, version: string, epoch: string) {
  return calculateRatingCoverage(runners(activeRunnerCount, ratedRunnerCount), (runner) => runner.rated, version, epoch);
}

function runners(activeRunnerCount: number, ratedRunnerCount: number) {
  return Array.from({ length: activeRunnerCount }, (_, index) => ({
    id: String(index + 1),
    resultStatus: null,
    rated: index < ratedRunnerCount,
  }));
}
