import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createRecord } from "../../../scripts/diagnose-tpr-vs-timewise-forward";
import type { TodayRace, TodayRunner } from "./todays-racing";
import { TURF_PERFORMANCE_RATING_VERSION } from "./turf-performance-rating";
import {
  buildTodayForwardInput,
  isTimewiseEligibleRace,
  timewiseTimingForSave,
  trackerRaceTime,
} from "./tpr-timewise-forward-context";

describe("Today Timewise forward context", () => {
  test("accepts Turf and excludes AW and Jump races", () => {
    assert.equal(isTimewiseEligibleRace(race()), true);
    assert.equal(isTimewiseEligibleRace(race({ surface: "AW" })), false);
    assert.equal(isTimewiseEligibleRace(race({ raceType: "Chase", raceTypeCode: "CHASE" })), false);
  });

  test("captures W100, W50, OR and settled winner context", () => {
    const input = buildTodayForwardInput({
      course: "Sandown",
      race: race({ runners: [
        runner("runner-a", "Alpha", 1, 2, 101, { finishingPosition: 2 }),
        runner("runner-b", "Bravo", 2, 1, 99, { finishingPosition: 1, oddsDecimal: "6.5" }),
        runner("runner-c", "Charlie", 3, 3, 99),
      ] }),
      raceDate: "2026-09-17",
      timewiseRank1: "Bravo",
      timewiseRank2: "Alpha",
    });
    assert.deepEqual(input, {
      raceDate: "2026-09-17", course: "Sandown", raceTime: "14:20",
      winner: "Bravo", winnerSp: 6.5, tprRank1: "Alpha", tprRank2: "Bravo",
      timewiseRank1: "Bravo", timewiseRank1NonRunner: false,
      timewiseRank2: "Alpha", timewiseRank2NonRunner: false, w50Rank1: "Bravo",
      orRank1: "Alpha", winnerOrRank: 2,
    });
  });

  test("keeps result fields empty before settlement", () => {
    const input = buildTodayForwardInput({
      course: "Sandown",
      race: race({ runners: [runner("a", "Alpha", 1, 1, null), runner("b", "Bravo", 2, 2, null)] }),
      raceDate: "2026-09-17",
      timewiseRank1: "Alpha",
      timewiseRank2: "Bravo",
    });
    assert.equal(input.winner, null);
    assert.equal(input.winnerSp, null);
    assert.equal(input.orRank1, null);
    assert.equal(input.winnerOrRank, null);
  });

  test("normalizes Today race times for tracker identity", () => {
    assert.equal(trackerRaceTime("14:20:00"), "14:20");
  });

  test("classifies first saves and preserves the original timing on edits", () => {
    const before = new Date("2026-09-17T13:00:00Z");
    const scheduled = new Date("2026-09-17T13:20:00Z");
    assert.deepEqual(timewiseTimingForSave(undefined, scheduled, before), {
      timewiseRecordedAt: before.toISOString(),
      timewiseRecordedPreRace: true,
      timewiseUpdatedAt: null,
    });
    const existing = createRecord({
      ...buildTodayForwardInput({
        course: "Sandown",
        race: race({ runners: [runner("a", "Alpha", 1, 1, null), runner("b", "Bravo", 2, 2, null)] }),
        raceDate: "2026-09-17",
        timewiseRank1: "Alpha",
        timewiseRank2: "Bravo",
      }),
      timewiseRecordedAt: before.toISOString(),
      timewiseRecordedPreRace: true,
      timewiseUpdatedAt: null,
    });
    const after = new Date("2026-09-17T14:00:00Z");
    const editTiming = timewiseTimingForSave(existing, scheduled, after);
    assert.deepEqual(editTiming, {
      timewiseRecordedAt: before.toISOString(),
      timewiseRecordedPreRace: true,
      timewiseUpdatedAt: after.toISOString(),
    });
    const changedToNonRunner = createRecord({
      ...existing,
      timewiseRank1: null,
      timewiseRank1NonRunner: true,
      ...editTiming,
    });
    assert.equal(changedToNonRunner.timewiseRecordedAt, before.toISOString());
    assert.equal(changedToNonRunner.timewiseRecordedPreRace, true);
    assert.equal(changedToNonRunner.timewiseUpdatedAt, after.toISOString());
  });
});

function race(overrides: Partial<TodayRace> = {}): TodayRace {
  return {
    raceId: "race-1", sourceId: "source-1", scheduledTime: "14:20:00",
    raceDateTime: new Date("2026-09-17T13:20:00Z"), courseCountry: "ENG",
    raceName: "Novice Stakes", raceClass: "4", raceType: "Flat", raceTypeCode: "FLAT",
    distance: "1m", distanceYards: 1760, going: "Good", surface: "TURF",
    declaredRunnerCount: 2, actualRunnerCount: null, winningTime: null, runners: [],
    ...overrides,
  };
}

function runner(
  runnerId: string,
  horseName: string,
  w100Rank: number,
  w50Rank: number,
  officialRating: number | null,
  overrides: Partial<TodayRunner> = {},
): TodayRunner {
  return {
    runnerId, runnerSourceId: runnerId, horseId: `horse-${runnerId}`, horseName,
    saddleclothNumber: null, horseAge: null, horseSex: null, weight: null,
    weightCarriedLbs: null, draw: null, jockeyName: null, trainerId: null,
    trainerName: null, officialRating, odds: null, oddsDecimal: null,
    resultStatus: null, finishingPosition: null, metrics: null,
    turfPerformanceRating: { rating: 100 - w100Rank, rawRating: 0, rank: w100Rank, gap: null, historyDepth: 3, version: TURF_PERFORMANCE_RATING_VERSION, isCrossSurfaceFallback: false },
    turfPerformanceShadowRating: { rating: 100 - w50Rank, rawRating: 0, rank: w50Rank, gap: null, historyDepth: 3, version: TURF_PERFORMANCE_RATING_VERSION, isCrossSurfaceFallback: false },
    ...overrides,
  };
}
