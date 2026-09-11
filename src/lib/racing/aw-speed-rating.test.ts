import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  AW_SPEED_RATING_CALCULATION_VERSION,
  calculateAwSpeedRating,
  currentLengthRatingForStandard,
  isSupportedAllWeatherRace,
  supportedAwSurface,
} from "./aw-speed-rating";

const baseInput = {
  raceName: "BetMGM Handicap",
  raceType: "handicap",
  courseName: "Kempton",
  going: "Standard / Slow",
  distanceYards: 1760,
  winningTime: "1m 40.00s",
  baseStandardSeconds: 100,
  standardSampleSize: 40,
  cumulativeBeatenLengths: 0,
};

describe("all-weather race predicate", () => {
  test("accepts supported ALLWEATHER and POLYTRACK surfaces", () => {
    assert.equal(
      isSupportedAllWeatherRace({ ...baseInput, surface: "ALLWEATHER" }),
      true,
    );
    assert.equal(
      isSupportedAllWeatherRace({ ...baseInput, surface: "POLYTRACK" }),
      true,
    );
  });

  test("rejects turf and blank surfaces", () => {
    assert.equal(
      isSupportedAllWeatherRace({ ...baseInput, surface: "TURF" }),
      false,
    );
    assert.equal(
      isSupportedAllWeatherRace({
        ...baseInput,
        courseName: "Ascot",
        going: "Good",
        surface: null,
      }),
      false,
    );
  });

  test("infers stored production surfaces from AW course and standard going", () => {
    assert.equal(
      supportedAwSurface({ courseName: "Kempton", going: "Standard / Slow" }),
      "POLYTRACK",
    );
    assert.equal(
      supportedAwSurface({ courseName: "Wolverhampton", going: "Standard" }),
      "ALLWEATHER",
    );
    assert.equal(
      supportedAwSurface({ courseName: "Lingfield", going: "Good to Firm" }),
      null,
    );
  });

  test("rejects jump races at mixed venues", () => {
    assert.equal(
      isSupportedAllWeatherRace({
        ...baseInput,
        raceName: "Novices' Hurdle",
        raceType: "hurdle",
      }),
      false,
    );
  });
});

describe("calculateAwSpeedRating", () => {
  test("pins current_length as 100 plus speed-based lengths faster than standard", () => {
    const rating = currentLengthRatingForStandard({
      standardSeconds: 100,
      winningTimeSeconds: 100,
      cumulativeBeatenLengths: 3,
      distanceYards: 1760,
    });

    assert.ok(rating.rating !== null && Math.abs(rating.rating - 97) < 1e-9);
    assert.equal(rating.equivalentTimeSeconds, 100.45454545454545);
    assert.ok(
      rating.secondsPerLength !== null &&
        Math.abs(rating.secondsPerLength - 0.15151515151515152) < 1e-12,
    );
  });

  test("uses same-day path only when AW research threshold is met", () => {
    const rating = calculateAwSpeedRating({
      ...baseInput,
      sameDayAdjustmentSecondsPerFurlong: 0.2,
      sameDayPeerCount: 3,
      sameDayStdevSecondsPerFurlong: 0.3,
    });

    assert.equal(rating.method, "same_day");
    assert.equal(rating.rating, rating.sameDayAdjustedRating);
    assert.notEqual(rating.rating, rating.baseRating);
  });

  test("falls back to base when same-day threshold is not met", () => {
    const rating = calculateAwSpeedRating({
      ...baseInput,
      sameDayAdjustmentSecondsPerFurlong: 0.2,
      sameDayPeerCount: 2,
      sameDayStdevSecondsPerFurlong: 0.3,
    });

    assert.equal(rating.method, "base");
    assert.equal(rating.rating, rating.baseRating);
    assert.equal(rating.sameDayAdjustedRating, null);
  });

  test("does not apply the jump beaten-distance withholding rule", () => {
    const rating = calculateAwSpeedRating({
      ...baseInput,
      cumulativeBeatenLengths: 80,
    });

    assert.equal(rating.method, "base");
    assert.notEqual(rating.rating, null);
    assert.equal(rating.withheldReason, null);
    assert.equal(rating.confidence, "low");
  });

  test("returns unavailable for insufficient standards and exposes version", () => {
    const rating = calculateAwSpeedRating({
      ...baseInput,
      standardSampleSize: 1,
    });

    assert.equal(rating.method, "unavailable");
    assert.equal(rating.rating, null);
    assert.equal(rating.unavailableReason, "insufficient_timing_or_standard");
    assert.equal(rating.calculationVersion, AW_SPEED_RATING_CALCULATION_VERSION);
  });
});
