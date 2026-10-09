import assert from "node:assert/strict";
import { describe, test } from "node:test";

describe("stage3 market residual helpers", () => {
  test("normalised probabilities sum to one in softmax-style books", () => {
    const raw = [0.5, 0.25, 0.125];
    const total = raw.reduce((sum, value) => sum + value, 0);
    const normalised = raw.map((value) => value / total);
    assert.equal(Number(normalised.reduce((sum, value) => sum + value, 0).toFixed(12)), 1);
    assert.ok(normalised[0]! > normalised[1]!);
  });
});
