import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { classMovement, latestSpeedMovement } from "./top3-speed-class-drop-diagnostic";

describe("top3 speed class drop diagnostic helpers", () => {
  test("orders canonical race classes with larger numbers as a class drop", () => {
    assert.equal(classMovement(4, 3), "drop");
    assert.equal(classMovement(3, 4), "rise");
    assert.equal(classMovement(3, 3), "same");
    assert.equal(classMovement(null, 3), "unknown");
    assert.equal(classMovement(3, null), "unknown");
  });

  test("uses a strict latest speed improvement without threshold optimisation", () => {
    assert.equal(speedMovement(82, 81), "improved");
    assert.equal(speedMovement(82, 82), "flat");
    assert.equal(speedMovement(81, 82), "declined");
    assert.equal(speedMovement(null, 82), "unavailable");
    assert.equal(speedMovement(82, null), "unavailable");
  });
});

function speedMovement(latestSpeedRating: number | null, previousSpeedRating: number | null) {
  return latestSpeedMovement({
    features: {
      latestSpeedRating,
      previousSpeedRating,
    },
  } as Parameters<typeof latestSpeedMovement>[0]);
}
