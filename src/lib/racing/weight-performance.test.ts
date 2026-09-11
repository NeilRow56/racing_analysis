import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  calculateWeightAdjustedPerformance,
  DEFAULT_PERFORMANCE_REFERENCE_WEIGHT_LB,
  WEIGHT_PERFORMANCE_CALCULATION_VERSION,
} from "./weight-performance";

describe("calculateWeightAdjustedPerformance", () => {
  test("rates the heavier same-speed runner higher pound-for-pound", () => {
    const horseA = calculateWeightAdjustedPerformance({
      rawSpeedRating: 110,
      weightCarriedLb: 168,
    });
    const horseB = calculateWeightAdjustedPerformance({
      rawSpeedRating: 110,
      weightCarriedLb: 154,
    });

    assert.equal(horseA?.performanceRating, 110);
    assert.equal(horseB?.performanceRating, 96);
    assert.equal(
      (horseA?.performanceRating ?? 0) - (horseB?.performanceRating ?? 0),
      14,
    );
  });

  test("rates the lower-weight runner higher when it carried 14 lb more", () => {
    const horseA = calculateWeightAdjustedPerformance({
      rawSpeedRating: 110,
      weightCarriedLb: 154,
    });
    const horseB = calculateWeightAdjustedPerformance({
      rawSpeedRating: 110,
      weightCarriedLb: 168,
    });

    assert.equal(
      (horseB?.performanceRating ?? 0) - (horseA?.performanceRating ?? 0),
      14,
    );
  });

  test("identical weights preserve raw speed ordering", () => {
    const horseA = calculateWeightAdjustedPerformance({
      rawSpeedRating: 112,
      weightCarriedLb: 168,
    });
    const horseB = calculateWeightAdjustedPerformance({
      rawSpeedRating: 110,
      weightCarriedLb: 168,
    });

    assert.equal(
      (horseA?.performanceRating ?? 0) - (horseB?.performanceRating ?? 0),
      2,
    );
  });

  test("returns missing when raw speed or historical carried weight is missing", () => {
    assert.equal(
      calculateWeightAdjustedPerformance({
        rawSpeedRating: null,
        weightCarriedLb: 168,
      }),
      null,
    );
    assert.equal(
      calculateWeightAdjustedPerformance({
        rawSpeedRating: 110,
        weightCarriedLb: null,
      }),
      null,
    );
    assert.equal(
      calculateWeightAdjustedPerformance({
        rawSpeedRating: 110,
        weightCarriedLb: 0,
      }),
      null,
    );
  });

  test("exposes reference weight and calculation version", () => {
    const performance = calculateWeightAdjustedPerformance({
      rawSpeedRating: 110,
      weightCarriedLb: 175,
    });

    assert.equal(performance?.referenceWeightLb, DEFAULT_PERFORMANCE_REFERENCE_WEIGHT_LB);
    assert.equal(performance?.weightAdjustment, 7);
    assert.equal(performance?.calculationVersion, WEIGHT_PERFORMANCE_CALCULATION_VERSION);
  });
});
