import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  calculateJumpSpeedRating,
  isJumpRace,
  JUMP_SPEED_RATING_CALCULATION_VERSION,
} from "./jump-speed-rating";

const baseInput = {
  raceName: "Novices' Hurdle",
  raceType: "Hurdle",
  distanceYards: 3520,
  winningTime: "4m 0.00s",
  baseStandardSeconds: 240,
  standardSampleSize: 12,
  cumulativeBeatenLengths: 0,
};

describe("calculateJumpSpeedRating", () => {
  test("uses the conservative same-day path when eligible", () => {
    const rating = calculateJumpSpeedRating({
      ...baseInput,
      sameDayAdjustmentSecondsPerFurlong: 0.2,
      sameDayPeerCount: 4,
      sameDayStdevSecondsPerFurlong: 0.2,
    });

    assert.equal(rating.method, "same_day");
    assert.equal(rating.confidence, "high");
    assert.equal(rating.rating, rating.sameDayAdjustedRating);
    assert.notEqual(rating.rating, rating.baseRating);
  });

  test("falls back to base when same-day is not conservatively eligible", () => {
    const rating = calculateJumpSpeedRating({
      ...baseInput,
      sameDayAdjustmentSecondsPerFurlong: 0.2,
      sameDayPeerCount: 3,
      sameDayStdevSecondsPerFurlong: 0.2,
    });

    assert.equal(rating.method, "base");
    assert.equal(rating.rating, rating.baseRating);
    assert.equal(rating.sameDayAdjustedRating, null);
  });

  test("withholds ratings above 75 cumulative beaten lengths", () => {
    const rating = calculateJumpSpeedRating({
      ...baseInput,
      cumulativeBeatenLengths: 75.01,
    });

    assert.equal(rating.rating, null);
    assert.equal(rating.method, "withheld");
    assert.equal(rating.confidence, "low");
    assert.equal(rating.withheldReason, "beaten_distance_gt_75_lengths");
    assert.notEqual(rating.baseRating, null);
  });

  test("keeps exactly 75 lengths eligible", () => {
    const rating = calculateJumpSpeedRating({
      ...baseInput,
      cumulativeBeatenLengths: 75,
    });

    assert.equal(rating.method, "base");
    assert.notEqual(rating.rating, null);
  });

  test("assigns medium confidence for valid base fallback with moderate sample", () => {
    const rating = calculateJumpSpeedRating({
      ...baseInput,
      standardSampleSize: 5,
      cumulativeBeatenLengths: 40,
    });

    assert.equal(rating.method, "base");
    assert.equal(rating.confidence, "medium");
  });

  test("assigns low confidence for weak samples", () => {
    const rating = calculateJumpSpeedRating({
      ...baseInput,
      standardSampleSize: 3,
    });

    assert.equal(rating.confidence, "low");
  });

  test("returns unavailable for missing timing", () => {
    const rating = calculateJumpSpeedRating({
      ...baseInput,
      winningTime: null,
    });

    assert.equal(rating.rating, null);
    assert.equal(rating.method, "unavailable");
    assert.equal(rating.confidence, "unavailable");
    assert.equal(rating.withheldReason, "insufficient_timing_or_standard");
  });

  test("exposes the centralized calculation version", () => {
    const rating = calculateJumpSpeedRating(baseInput);

    assert.equal(rating.calculationVersion, JUMP_SPEED_RATING_CALCULATION_VERSION);
  });

  test("does not rate non-jump races", () => {
    const rating = calculateJumpSpeedRating({
      ...baseInput,
      raceName: "Flat Handicap",
      raceType: "Flat",
    });

    assert.equal(rating.method, "unavailable");
    assert.equal(rating.rating, null);
    assert.equal(rating.withheldReason, "not_jump_race");
  });
});

describe("isJumpRace", () => {
  test("recognizes obvious jump titles when source type metadata is missing", () => {
    assert.equal(isJumpRace({ raceName: "Novices' Chase", raceType: null, raceTypeCode: null }), true);
    assert.equal(isJumpRace({ raceName: "Mares' Hurdle", raceType: null, raceTypeCode: null }), true);
    assert.equal(isJumpRace({ raceName: "National Hunt Flat Race", raceType: null, raceTypeCode: null }), true);
  });

  test("keeps confirmed Irish Grade 1 chase titles out of turf-flat when metadata is missing", () => {
    assert.equal(isJumpRace({ raceName: "Paddy Power Irish Gold Cup (Grade 1)", raceType: null, raceTypeCode: null }), true);
    assert.equal(isJumpRace({ raceName: "WillowWarm Gold Cup (Grade 1)", raceType: null, raceTypeCode: null }), true);
    assert.equal(isJumpRace({ raceName: "Ladbrokes Punchestown Gold Cup (Grade 1)", raceType: null, raceTypeCode: null }), true);
  });

  test("does not treat ordinary flat Group, Listed or handicap races as jumps", () => {
    assert.equal(isJumpRace({ raceName: "Tattersalls Gold Cup (Group 1)", raceType: null, raceTypeCode: null }), false);
    assert.equal(isJumpRace({ raceName: "Royal Ascot Gold Cup (Group 1)", raceType: null, raceTypeCode: null }), false);
    assert.equal(isJumpRace({ raceName: "Fillies' Listed Stakes", raceType: "Listed", raceTypeCode: null }), false);
    assert.equal(isJumpRace({ raceName: "William Hill NRMB On The Grand National Handicap", raceType: "handicap", raceTypeCode: null }), false);
  });

  test("explicit flat metadata prevents known-title fallback", () => {
    assert.equal(isJumpRace({ raceName: "Irish Gold Cup (Group 1)", raceType: "Flat", raceTypeCode: null }), false);
  });
});
