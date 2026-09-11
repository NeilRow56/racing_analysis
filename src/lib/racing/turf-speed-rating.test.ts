import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  TURF_SPEED_RATING_CALCULATION_VERSION,
  calculateTurfSpeedRating,
  isOrdinaryFlatTurfRace,
  ratingForStandard,
} from "./turf-speed-rating";

const baseInput = {
  raceName: "Nua Healthcare Handicap",
  raceType: "handicap",
  raceTypeCode: null,
  surface: "TURF",
  distanceYards: 1760,
  winningTime: "1m 40.00s",
  baseStandardSeconds: 100,
  standardSampleSize: 8,
  standardTimingSpreadSecondsPerFurlong: 0.25,
  cumulativeBeatenLengths: 0,
};

describe("ordinary Flat Turf classifier", () => {
  test("accepts ordinary UK and Irish Turf", () => {
    assert.equal(
      isOrdinaryFlatTurfRace({
        raceName: "EBF Fillies' Restricted Novice Stakes",
        raceType: "stakes",
        surface: "TURF",
      }),
      true,
    );
    assert.equal(
      isOrdinaryFlatTurfRace({
        raceName: "TRM - Supplements You Can Trust Race",
        raceType: "",
        surface: "TURF",
      }),
      true,
    );
  });

  test("rejects AW, jumps, NH Flat and bumpers", () => {
    assert.equal(isOrdinaryFlatTurfRace({ ...baseInput, surface: "POLYTRACK" }), false);
    assert.equal(isOrdinaryFlatTurfRace({ ...baseInput, surface: null }), false);
    assert.equal(isOrdinaryFlatTurfRace({ ...baseInput, raceName: "Novices' Hurdle" }), false);
    assert.equal(isOrdinaryFlatTurfRace({ ...baseInput, raceName: "Irish Stallion Farms EBF Mares Flat Race" }), false);
    assert.equal(isOrdinaryFlatTurfRace({ ...baseInput, raceName: "Sales Bumper" }), false);
    assert.equal(isOrdinaryFlatTurfRace({ ...baseInput, raceName: "I.N.H. Flat Race" }), false);
  });

  test("preserves mixed Lingfield Turf/AW isolation", () => {
    assert.equal(
      isOrdinaryFlatTurfRace({
        raceName: "Turf Handicap",
        raceType: "handicap",
        surface: "TURF",
      }),
      true,
    );
    assert.equal(
      isOrdinaryFlatTurfRace({
        raceName: "AW Handicap",
        raceType: "handicap",
        surface: "POLYTRACK",
      }),
      false,
    );
  });
});

describe("calculateTurfSpeedRating", () => {
  test("uses the frozen seconds-per-furlong formula", () => {
    const rating = ratingForStandard({
      standardSeconds: 100,
      winningTimeSeconds: 99,
      cumulativeBeatenLengths: 0,
      distanceYards: 1760,
    });

    assert.equal(rating.rating, 104.72);
  });

  test("uses same-day path only when the threshold is met", () => {
    const rating = calculateTurfSpeedRating({
      ...baseInput,
      sameDayAdjustmentSecondsPerFurlong: 0.2,
      sameDayPeerCount: 3,
      sameDayStdevSecondsPerFurlong: 0.3,
    });

    assert.equal(rating.method, "same_day");
    assert.equal(rating.rating, rating.sameDayAdjustedRating);
    assert.equal(rating.calculationVersion, TURF_SPEED_RATING_CALCULATION_VERSION);
  });

  test("falls back to base when same-day threshold is not met", () => {
    const rating = calculateTurfSpeedRating({
      ...baseInput,
      sameDayAdjustmentSecondsPerFurlong: 0.2,
      sameDayPeerCount: 2,
      sameDayStdevSecondsPerFurlong: 0.3,
    });

    assert.equal(rating.method, "base");
    assert.equal(rating.rating, rating.baseRating);
    assert.equal(rating.sameDayAdjustedRating, null);
  });

  test("does not apply jump beaten-distance withholding", () => {
    const rating = calculateTurfSpeedRating({
      ...baseInput,
      cumulativeBeatenLengths: 90,
    });

    assert.equal(rating.method, "base");
    assert.notEqual(rating.rating, null);
    assert.equal(rating.withheldReason, null);
  });

  test("withholds clear source timing outliers without capping", () => {
    const rating = calculateTurfSpeedRating({
      ...baseInput,
      winningTime: "1m 23.00s",
      sourceTimingIssue: true,
    });

    assert.equal(rating.method, "withheld");
    assert.equal(rating.rating, null);
    assert.equal(rating.withheldReason, "source_timing_outlier");
    assert.notEqual(rating.baseRating, null);
  });

  test("returns unavailable for insufficient standards", () => {
    const rating = calculateTurfSpeedRating({
      ...baseInput,
      standardSampleSize: 1,
    });

    assert.equal(rating.method, "unavailable");
    assert.equal(rating.unavailableReason, "insufficient_timing_or_standard");
  });
});
