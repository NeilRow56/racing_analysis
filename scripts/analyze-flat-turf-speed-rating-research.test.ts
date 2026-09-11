import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  calculateFigures,
  calibrateScales,
  deadHeatCheck,
  goingBand,
  isNhFlatOrBumperStyle,
  isSupportedFlatTurf,
  sameDayForRace,
  standardForRace,
  type Figure,
  type RaceRow,
  type RunnerRow,
} from "./analyze-flat-turf-speed-rating-research";

describe("Turf speed-rating research helpers", () => {
  test("uses a positive supported flat turf predicate", () => {
    assert.equal(isSupportedFlatTurf({ segment: "turf_flat", surface: "TURF", race_name: "Fillies' Handicap" }), true);
    assert.equal(isSupportedFlatTurf({ segment: "all_weather_flat", surface: "ALLWEATHER", race_name: "Handicap" }), false);
    assert.equal(isSupportedFlatTurf({ segment: "all_weather_flat", surface: "POLYTRACK", race_name: "Handicap" }), false);
    assert.equal(isSupportedFlatTurf({ segment: "jumps", surface: "TURF", race_name: "Handicap Hurdle" }), false);
    assert.equal(isSupportedFlatTurf({ segment: "turf_flat", surface: "", race_name: "Handicap" }), false);
    assert.equal(isSupportedFlatTurf({ segment: "turf_flat", surface: null, race_name: "Handicap" }), false);
  });

  test("keeps mixed Lingfield turf and all-weather rows isolated", () => {
    assert.equal(
      isSupportedFlatTurf({ segment: "turf_flat", surface: "TURF", race_name: "Fillies' Handicap" }),
      true,
    );
    assert.equal(
      isSupportedFlatTurf({ segment: "all_weather_flat", surface: "POLYTRACK", race_name: "Handicap" }),
      false,
    );
  });

  test("accepts ordinary UK and Irish Flat Turf races", () => {
    assert.equal(
      isSupportedFlatTurf({
        segment: "turf_flat",
        surface: "TURF",
        race_name: "Nua Healthcare Handicap",
        race_type: "handicap",
      }),
      true,
    );
    assert.equal(
      isSupportedFlatTurf({
        segment: "turf_flat",
        surface: "TURF",
        race_name: "TRM - Supplements You Can Trust Race",
        race_type: "",
      }),
      true,
    );
  });

  test("rejects NH Flat and bumper-style races stored as turf", () => {
    assert.equal(
      isSupportedFlatTurf({
        segment: "turf_flat",
        surface: "TURF",
        race_name: "BetVictor's 60 Euro New Customer Offer (Pro/Am) Flat Race",
        race_type: "",
      }),
      false,
    );
    assert.equal(
      isSupportedFlatTurf({
        segment: "turf_flat",
        surface: "TURF",
        race_name: "Tattersalls Ireland George Mernagh Memorial Sales Bumper",
      }),
      false,
    );
    assert.equal(
      isSupportedFlatTurf({
        segment: "turf_flat",
        surface: "TURF",
        race_name: "Coolmore N.H. Sires Luxembourg Irish EBF Mares I.N.H. Flat Race",
      }),
      false,
    );
    assert.equal(
      isSupportedFlatTurf({
        segment: "turf_flat",
        surface: "TURF",
        race_name: "British EBF Junior National Hunt Flat Race",
      }),
      false,
    );
  });

  test("exposes the NH Flat and bumper title marker check directly", () => {
    assert.equal(isNhFlatOrBumperStyle({ race_name: "Overlander Flat Race" }), true);
    assert.equal(isNhFlatOrBumperStyle({ race_name: "Paddy Power Play Card I.N.H. Flat Race" }), true);
    assert.equal(isNhFlatOrBumperStyle({ race_name: "Irish Lincolnshire Premier Handicap" }), false);
  });

  test("maps observed turf going values into explicit research bands", () => {
    assert.equal(goingBand("Firm"), "Firm");
    assert.equal(goingBand("Good to Firm (Good in places)"), "Good to Firm");
    assert.equal(goingBand("Good"), "Good");
    assert.equal(goingBand("Good to Soft (Soft in places)"), "Good to Soft");
    assert.equal(goingBand("Soft (Heavy in places)"), "Soft");
    assert.equal(goingBand("Heavy"), "Heavy");
    assert.equal(goingBand("Standard"), null);
  });

  test("calibrates scale constants independently of official ratings", () => {
    const races = [race({ race_source_id: "race-1" })];
    const lowOr = [runner({ race_source_id: "race-1", official_rating: 40 })];
    const highOr = [runner({ race_source_id: "race-1", official_rating: 140 })];

    assert.deepEqual(calibrateScales(races, lowOr), calibrateScales(races, highOr));
    assert.equal(calibrateScales(races, lowOr).secPerFPoints, 37.76);
    assert.equal(calibrateScales(races, lowOr).pctPoints, 1000);
  });

  test("standard calculation supports leave-one-out behavior", () => {
    const target = race({ race_source_id: "target", actual: 70 });
    const rows = [
      target,
      race({ race_source_id: "peer-1", actual: 60 }),
      race({ race_source_id: "peer-2", actual: 80 }),
    ];

    assert.deepEqual(standardForRace(target, rows, true), {
      seconds: 70,
      sample: 2,
    });
    assert.deepEqual(standardForRace(target, rows, false), {
      seconds: 70,
      sample: 3,
    });
  });

  test("same-day peers are isolated to the same course and date and exclude target race", () => {
    const target = race({ race_source_id: "target", actual: 70 });
    const sameCourseSameDay = race({ race_source_id: "peer", actual: 72 });
    const sameCourseOtherDay = race({
      race_source_id: "other-day",
      race_date: "2025-01-02",
      actual: 72,
    });
    const otherCourseSameDay = race({
      race_source_id: "other-course",
      course: "Newcastle",
      actual: 72,
    });
    const calibrationRaces = [
      target,
      sameCourseSameDay,
      sameCourseOtherDay,
      otherCourseSameDay,
      race({ race_source_id: "standard-1", actual: 68 }),
      race({ race_source_id: "standard-2", actual: 74 }),
    ];

    const sameDay = sameDayForRace({
      race: target,
      races: [target, sameCourseSameDay, sameCourseOtherDay, otherCourseSameDay],
      calibrationRaces,
      leaveOneOut: true,
    });

    assert.equal(sameDay.peerCount, 1);
  });

  test("holdout figures use frozen calibration races and do not learn standards from holdout", () => {
    const holdoutRace = race({ race_source_id: "holdout", race_date: "2026-01-01", actual: 70 });
    const holdoutRunner = runner({
      race_source_id: "holdout",
      equivalent_time_seconds: 70,
    });

    const withoutCalibration = calculateFigures({
      range: "2026_holdout",
      races: [holdoutRace],
      runners: [holdoutRunner],
      calibrationRaces: [],
      scaleCalibration: calibrateScales([], []),
      threshold: { minPeers: 3, maxStdevPerF: 0.3 },
      leaveOneOut: false,
    });
    const withCalibration = calculateFigures({
      range: "2026_holdout",
      races: [holdoutRace],
      runners: [holdoutRunner],
      calibrationRaces: [
        race({ race_source_id: "cal-1", actual: 69 }),
        race({ race_source_id: "cal-2", actual: 71 }),
      ],
      scaleCalibration: calibrateScales([], []),
      threshold: { minPeers: 3, maxStdevPerF: 0.3 },
      leaveOneOut: false,
    });

    assert.equal(withoutCalibration.length, 0);
    assert.ok(withCalibration.length > 0);
  });

  test("dead-heat validation reports real mismatches", () => {
    const base = figure({
      runner: runner({ runner_source_id: "a", finish_position: 2 }),
      rating: 88,
      equivalentTime: 71,
    });
    const matchingDeadHeat = figure({
      runner: runner({ runner_source_id: "b", finish_position: 2 }),
      rating: 88,
      equivalentTime: 71,
    });
    const mismatchingDeadHeat = figure({
      runner: runner({ runner_source_id: "c", finish_position: 2 }),
      rating: 87.9,
      equivalentTime: 71,
    });

    assert.deepEqual(deadHeatCheck([base, matchingDeadHeat, mismatchingDeadHeat]), {
      examined: 2,
      mismatches: 1,
    });
  });
});

function race(overrides: Partial<RaceRow> = {}): RaceRow {
  return {
    race_source_id: "race",
    race_date: "2025-01-01",
    course: "Lingfield",
    race_name: "Turf Handicap",
    race_type: "handicap",
    race_class: "5",
    distance: "6f",
    distance_yards: 1320,
    segment: "turf_flat",
    surface: "TURF",
    going: "Good",
    actual: 70,
    ...overrides,
  };
}

function runner(overrides: Partial<RunnerRow> = {}): RunnerRow {
  return {
    race_source_id: "race",
    race_date: "2025-01-01",
    course: "Lingfield",
    race_name: "Turf Handicap",
    race_type: "handicap",
    race_class: "5",
    distance: "6f",
    distance_yards: 1320,
    segment: "turf_flat",
    surface: "TURF",
    going: "Good",
    actual_winning_time: 70,
    equivalent_time_seconds: 70,
    runner_source_id: "runner",
    horse: "Horse",
    finish_position: 1,
    official_rating: 80,
    ...overrides,
  };
}

function figure(overrides: Partial<Figure> = {}): Figure {
  return {
    range: "2025",
    scale: "current_length",
    variantMode: "base",
    race: race(),
    runner: runner(),
    rating: 88,
    baseRating: 88,
    sameDayRating: null,
    cumulativeBeatenLengths: 0,
    standard: 70,
    standardSample: 2,
    equivalentTime: 70,
    deviationPerF: 0,
    pctDeviation: 0,
    sameDayAdjustmentPerF: null,
    sameDayPeerCount: 0,
    sameDayStdevPerF: null,
    ...overrides,
  };
}
