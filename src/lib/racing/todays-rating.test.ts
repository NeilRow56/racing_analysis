import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  calculateTodaysRating,
  TODAYS_RATING_CALCULATION_VERSION,
} from "./todays-rating";

describe("calculateTodaysRating", () => {
  test("lighter current weight increases rating", () => {
    const rating = calculateTodaysRating({
      historicalPerformanceRating: 110,
      currentWeightCarriedLb: 154,
    });

    assert.equal(rating?.currentWeightAdjustment, -14);
    assert.equal(rating?.todaysRating, 124);
  });

  test("heavier current weight decreases rating", () => {
    const rating = calculateTodaysRating({
      historicalPerformanceRating: 96,
      currentWeightCarriedLb: 175,
    });

    assert.equal(rating?.currentWeightAdjustment, 7);
    assert.equal(rating?.todaysRating, 89);
  });

  test("dead-heat sanity example translates both to the same current weight", () => {
    const horseA = calculateTodaysRating({
      historicalPerformanceRating: 110,
      currentWeightCarriedLb: 154,
    });
    const horseB = calculateTodaysRating({
      historicalPerformanceRating: 96,
      currentWeightCarriedLb: 154,
    });

    assert.equal(horseA?.todaysRating, 124);
    assert.equal(horseB?.todaysRating, 110);
  });

  test("identical performance and current weight stays identical", () => {
    const horseA = calculateTodaysRating({
      historicalPerformanceRating: 105,
      currentWeightCarriedLb: 160,
    });
    const horseB = calculateTodaysRating({
      historicalPerformanceRating: 105,
      currentWeightCarriedLb: 160,
    });

    assert.equal(horseA?.todaysRating, horseB?.todaysRating);
  });

  test("missing or invalid current weight returns null", () => {
    assert.equal(
      calculateTodaysRating({
        historicalPerformanceRating: 105,
        currentWeightCarriedLb: null,
      }),
      null,
    );
    assert.equal(
      calculateTodaysRating({
        historicalPerformanceRating: 105,
        currentWeightCarriedLb: 0,
      }),
      null,
    );
  });

  test("exposes calculation version", () => {
    assert.equal(
      calculateTodaysRating({
        historicalPerformanceRating: 105,
        currentWeightCarriedLb: 168,
      })?.calculationVersion,
      TODAYS_RATING_CALCULATION_VERSION,
    );
  });
});
