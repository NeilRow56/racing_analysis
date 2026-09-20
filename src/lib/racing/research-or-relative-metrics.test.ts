import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

import {
  CREATABLE_RELATIVE_METRIC_OPTIONS,
  RELATIVE_METRIC_OPTIONS,
  isLegacySpeedRelativeMetric,
} from "./research-or-relative-metrics";

describe("browser-safe OR-relative metric definitions", () => {
  test("keeps legacy definitions while excluding Speed from new use", () => {
    assert.equal(RELATIVE_METRIC_OPTIONS.length, 6);
    assert.deepEqual(CREATABLE_RELATIVE_METRIC_OPTIONS.map((option) => option.value), [
      "latestPerformanceMinusOR",
      "bestPerformanceL3MinusOR",
      "latestTodaysRatingMinusOR",
      "bestTodaysRatingL3MinusOR",
    ]);
    assert.equal(isLegacySpeedRelativeMetric("latestSpeedMinusOR"), true);
    assert.equal(isLegacySpeedRelativeMetric("bestL3SpeedMinusOR"), true);
  });

  test("does not import server-only modules", async () => {
    const source = await readFile(new URL("./research-or-relative-metrics.ts", import.meta.url), "utf8");

    assert.doesNotMatch(source, /^import\s/m);
    assert.doesNotMatch(source, /node:|backtest-cache|saved-research-rules|historical-/);
  });
});
