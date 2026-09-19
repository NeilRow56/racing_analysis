import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readFile } from "node:fs/promises";
import { COMMENT_FEATURE_NAMES, EPOCHS, L2, NUMERIC_FEATURES } from "./diagnose-independent-tissue-feasibility";

describe("tissue model v2 artifact", () => {
  test("freezes the Stage-2 specification against corrected dependency versions", async () => {
    const [v1, v2] = await Promise.all([
      readFile("data/research/tissue-model-v1.json", "utf8").then(JSON.parse),
      readFile("data/research/tissue-model-v2.json", "utf8").then(JSON.parse),
    ]);
    assert.equal(v2.version, "tissue_model_v2");
    assert.deepEqual(v2.dependencies, {
      backtestFeatureSchemaVersion: "backtest_features_v4",
      sourceFeatureVersion: "historical_target_metrics_v4",
      turfSpeedVersion: "turf_speed_v2",
    });
    assert.deepEqual(v2.specification, v1.specification);
    assert.deepEqual(v2.specification.numericFeatures, NUMERIC_FEATURES.map(([name]) => name));
    assert.deepEqual(v2.specification.commentFeatures, COMMENT_FEATURE_NAMES);
    assert.equal(v2.specification.epochs, EPOCHS);
    assert.equal(v2.specification.l2, L2);
    assert.equal(v2.model.names.length, NUMERIC_FEATURES.length * 2 + COMMENT_FEATURE_NAMES.length);
    assert.equal(v2.trainingWindow.from, "2025-01-01");
    assert.equal(v2.trainingWindow.to, "2025-12-31");
  });
});
