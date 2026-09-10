import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  calculateFigures,
  calibrateScales,
  deadHeatCheck,
  isSupportedAw,
  sameDayForRace,
  standardForRace,
  type Figure,
  type RaceRow,
  type RunnerRow,
} from "./analyze-aw-speed-rating-research";

describe("AW speed-rating research helpers", () => {
  test("uses a positive supported all-weather predicate", () => {
    assert.equal(isSupportedAw({ segment: "all_weather_flat", surface: "ALLWEATHER" }), true);
    assert.equal(isSupportedAw({ segment: "all_weather_flat", surface: "POLYTRACK" }), true);
    assert.equal(isSupportedAw({ segment: "all_weather_flat", surface: "TURF" }), false);
    assert.equal(isSupportedAw({ segment: "all_weather_flat", surface: "" }), false);
    assert.equal(isSupportedAw({ segment: "all_weather_flat", surface: null }), false);
    assert.equal(isSupportedAw({ segment: "all_weather_flat", surface: "DIRT" }), false);
  });

  test("keeps mixed Lingfield turf and all-weather rows isolated", () => {
    assert.equal(
      isSupportedAw({ segment: "flat", surface: "TURF" }),
      false,
    );
    assert.equal(
      isSupportedAw({ segment: "all_weather_flat", surface: "POLYTRACK" }),
      true,
    );
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
    race_name: "AW Handicap",
    race_type: "handicap",
    race_class: "5",
    distance: "6f",
    distance_yards: 1320,
    segment: "all_weather_flat",
    surface: "POLYTRACK",
    going: "Standard",
    actual: 70,
    ...overrides,
  };
}

function runner(overrides: Partial<RunnerRow> = {}): RunnerRow {
  return {
    race_source_id: "race",
    race_date: "2025-01-01",
    course: "Lingfield",
    race_name: "AW Handicap",
    race_type: "handicap",
    race_class: "5",
    distance: "6f",
    distance_yards: 1320,
    segment: "all_weather_flat",
    surface: "POLYTRACK",
    going: "Standard",
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
