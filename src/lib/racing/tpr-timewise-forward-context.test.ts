import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  createRecord,
  renderSummary,
  summarize,
} from "../../../scripts/diagnose-tpr-vs-timewise-forward";
import type { TodayRace, TodayRunner } from "./todays-racing";
import {
  buildCanonicalTurfPerformanceRatingInput,
  TURF_PERFORMANCE_RATING_VERSION,
} from "./turf-performance-rating";
import {
  buildTodayForwardInput,
  enrichForwardRecordResult,
  isTimewiseEligibleRace,
  orderedTprRunners,
  timewiseTimingForSave,
  trackerRaceTime,
} from "./tpr-timewise-forward-context";

describe("Today Timewise forward context", () => {
  test("keeps Timewise tracker eligibility for Turf and AW but not Jump races", () => {
    assert.equal(isTimewiseEligibleRace(race()), true);
    assert.equal(isTimewiseEligibleRace(race({ going: "Standard", surface: "ALLWEATHER" })), true);
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
      family: "turf", raceDate: "2026-09-17", course: "Sandown", raceTime: "14:20",
      winner: "Bravo", winnerSp: 6.5, winners: [{ horseName: "Bravo", decimalOdds: 6.5 }],
      tprRank1: "Alpha", tprRank2: "Bravo",
      tprRank1NonRunner: false, tprRank2NonRunner: false,
      timewiseRank1: "Bravo", timewiseRank1NonRunner: false,
      timewiseRank2: "Alpha", timewiseRank2NonRunner: false, w50Rank1: "Bravo",
      w50Rank1NonRunner: false,
      tprInputSnapshot: { version: "tpr_forward_snapshot_v1", runners: [] },
      awBestL3SpeedRank1: null, awBestL3PerformanceRank1: null,
      orRank1: "Alpha", winnerOrRank: 2,
    });
  });

  test("captures an observational AW record without Turf selections", () => {
    const input = buildTodayForwardInput({
      course: "Wolverhampton",
      race: race({
        going: "Standard",
        surface: "ALLWEATHER",
        runners: [
          runner("a", "Alpha", 1, 1, 90, { metrics: { bestAwSpeedLast3: 95, bestPerformanceLast3: 88 } as TodayRunner["metrics"] }),
          runner("b", "Bravo", 2, 2, 85, { metrics: { bestAwSpeedLast3: 90, bestPerformanceLast3: 92 } as TodayRunner["metrics"] }),
        ],
      }),
      raceDate: "2026-09-18",
      timewiseRank1: "Bravo",
      timewiseRank2: "Alpha",
    });
    assert.equal(input.family, "all_weather");
    assert.equal(input.tprRank1, null);
    assert.equal(input.tprRank2, null);
    assert.equal(input.w50Rank1, null);
    assert.equal(input.awBestL3SpeedRank1, "Alpha");
    assert.equal(input.awBestL3PerformanceRank1, "Bravo");
    assert.equal(input.orRank1, "Alpha");
    assert.equal(timewiseTimingForSave(undefined, new Date("2026-09-18T13:20:00Z"), new Date("2026-09-18T13:21:00Z")).timewiseRecordedPreRace, false);
  });

  test("derives W100 top two by score for normal competition ranks", () => {
    const runners = [runner("a", "Alpha", 1, 1, 90), runner("b", "Bravo", 2, 2, 89)];
    assert.deepEqual(orderedTprRunners(runners).map((value) => value.horseName), ["Alpha", "Bravo"]);
  });

  test("keeps two tied rank-1 runners as the W100 top two when rank 2 is skipped", () => {
    const alpha = runner("a", "Alpha", 1, 1, 90);
    const bravo = runner("b", "Bravo", 1, 2, 89);
    const charlie = runner("c", "Charlie", 3, 3, 88);
    alpha.turfPerformanceRating!.rating = 101;
    bravo.turfPerformanceRating!.rating = 101;
    charlie.turfPerformanceRating!.rating = 99;
    const input = forwardInput([charlie, bravo, alpha]);
    assert.equal(input.tprRank1, "Alpha");
    assert.equal(input.tprRank2, "Bravo");
  });

  test("allows one valid W100 runner and leaves second choice unavailable", () => {
    const input = forwardInput([
      runner("a", "Alpha", 1, 1, 90),
      runner("b", "Bravo", 2, 2, 89, { turfPerformanceRating: undefined }),
    ]);
    assert.equal(input.tprRank1, "Alpha");
    assert.equal(input.tprRank2, null);
  });

  test("allows Timewise entry with no valid W100 runners", () => {
    const input = forwardInput([
      runner("a", "Alpha", 1, 1, 90, { turfPerformanceRating: undefined }),
      runner("b", "Bravo", 2, 2, 89, { turfPerformanceRating: undefined }),
    ]);
    assert.equal(input.tprRank1, null);
    assert.equal(input.tprRank2, null);
  });

  test("uses the second-highest score when no literal competition rank 2 exists", () => {
    const alpha = runner("a", "Alpha", 1, 1, 90);
    const bravo = runner("b", "Bravo", 3, 2, 89);
    alpha.turfPerformanceRating!.rating = 101;
    bravo.turfPerformanceRating!.rating = 99;
    const input = forwardInput([bravo, alpha]);
    assert.equal(input.tprRank1, "Alpha");
    assert.equal(input.tprRank2, "Bravo");
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

  test("enriches a pending pre-race record without changing selections or audit metadata", () => {
    const pending = createRecord({
      ...forwardInput([runner("a", "Alpha", 1, 1, 100), runner("b", "Bravo", 2, 2, 90)]),
      timewiseRank1: "Bravo",
      timewiseRank2: null,
      timewiseRank1NonRunner: false,
      timewiseRank2NonRunner: true,
      timewiseRecordedAt: "2026-09-17T12:00:00.000Z",
      timewiseRecordedPreRace: true,
      timewiseUpdatedAt: null,
    });
    const settledRace = race({ runners: [
      runner("a", "Alpha", 1, 1, 100, { finishingPosition: 2, oddsDecimal: "2.5" }),
      runner("b", "Bravo", 2, 2, 90, { finishingPosition: 1, oddsDecimal: "6.5" }),
    ] });
    const settled = enrichForwardRecordResult(pending, settledRace);
    assert.equal(settled.winner, "Bravo");
    assert.equal(settled.winnerSp, 6.5);
    assert.equal(settled.winnerOrRank, 2);
    assert.equal(settled.timewiseRank1, "Bravo");
    assert.equal(settled.timewiseRank2NonRunner, true);
    assert.equal(settled.tprRank1, pending.tprRank1);
    assert.equal(settled.w50Rank1, pending.w50Rank1);
    assert.equal(settled.orRank1, pending.orRank1);
    assert.equal(settled.timewiseRecordedAt, pending.timewiseRecordedAt);
    assert.equal(settled.timewiseRecordedPreRace, true);
    assert.equal(settled.timewiseUpdatedAt, null);
    assert.equal(summarize([pending]).timewiseRank1Strike, null);
    assert.equal(summarize([settled]).timewiseRank1Strike, 1);
    assert.equal(summarize([settled]).timewiseTop2Capture, 1);
    assert.equal(enrichForwardRecordResult(settled, settledRace), settled);
  });

  test("records every dead-heat winner and adjusts the selected return", () => {
    const input = buildTodayForwardInput({
      course: "Sandown",
      race: race({ runners: [
        runner("a", "Alpha", 1, 1, 100, { finishingPosition: 1, oddsDecimal: "5" }),
        runner("b", "Bravo", 2, 2, 90, { finishingPosition: 1, oddsDecimal: "7" }),
      ] }),
      raceDate: "2026-09-17",
      timewiseRank1: "Bravo",
      timewiseRank2: null,
    });
    const record = createRecord(input);
    assert.deepEqual(record.winners, [
      { horseName: "Alpha", decimalOdds: 5 },
      { horseName: "Bravo", decimalOdds: 7 },
    ]);
    assert.equal(summarize([record]).tprLevelStakeReturn, 2);
    assert.equal(summarize([record]).timewiseLevelStakeReturn, 3);
  });

  test("settles an AW record idempotently without changing selections or timing", () => {
    const awRace = race({ going: "Standard", surface: "ALLWEATHER", runners: [
      runner("a", "Alpha", 1, 1, 90), runner("b", "Bravo", 2, 2, 85),
    ] });
    const pending = createRecord({
      ...buildTodayForwardInput({ course: "Wolverhampton", race: awRace, raceDate: "2026-09-18", timewiseRank1: "Bravo", timewiseRank2: "Alpha" }),
      timewiseRecordedAt: "2026-09-18T12:00:00.000Z",
      timewiseRecordedPreRace: true,
    });
    const settledRace = race({ going: "Standard", surface: "ALLWEATHER", runners: [
      runner("a", "Alpha", 1, 1, 90, { finishingPosition: 2, oddsDecimal: "3" }),
      runner("b", "Bravo", 2, 2, 85, { finishingPosition: 1, oddsDecimal: "6" }),
    ] });
    const settled = enrichForwardRecordResult(pending, settledRace);
    assert.equal(settled.family, "all_weather");
    assert.equal(settled.timewiseRank1, "Bravo");
    assert.equal(settled.timewiseRecordedAt, pending.timewiseRecordedAt);
    assert.equal(settled.timewiseRecordedPreRace, true);
    assert.equal(settled.winnerWasTimewiseRank1, true);
    assert.equal(enrichForwardRecordResult(settled, settledRace), settled);
  });

  test("voids later W100, W50 and Timewise non-runners without changing recorded selections", () => {
    const pending = createRecord(forwardInput([
      runner("a", "Alpha", 1, 1, 100),
      runner("b", "Bravo", 2, 2, 90),
    ]));
    const settledRace = race({ runners: [
      runner("a", "Alpha", 1, 1, 100, { resultStatus: "non_runner" }),
      runner("b", "Bravo", 2, 2, 90, { finishingPosition: 1, oddsDecimal: "3" }),
    ] });
    const settled = enrichForwardRecordResult(pending, settledRace);
    assert.equal(settled.tprRank1, "Alpha");
    assert.equal(settled.w50Rank1, "Alpha");
    assert.equal(settled.timewiseRank1, "Alpha");
    assert.equal(settled.tprRank1NonRunner, true);
    assert.equal(settled.w50Rank1NonRunner, true);
    assert.equal(settled.timewiseRank1NonRunner, true);
    assert.equal(summarize([settled]).tprRank1Races, 0);
    assert.match(renderSummary({ version: "tpr_timewise_forward_v4", races: [settled] }), /TPR non-runners: W100 R1 1 .* W50 R1 1/);
    assert.equal(enrichForwardRecordResult(settled, settledRace), settled);
  });

  test("stores versioned canonical inputs only on newly built Turf records", () => {
    const canonical = buildCanonicalTurfPerformanceRatingInput({
      latestPerformanceRating: 80,
      previousPerformanceRating: 75,
      averagePerformanceLast3: 76,
      latestSpeedRating: 100,
      previousSpeedRating: 96,
      averageSpeedLast3: 97,
      raceClass: "Class 4",
      weightCarriedLbs: 132,
      raceMedianWeightCarriedLbs: 130,
    });
    const input = forwardInput([
      runner("a", "Alpha", 1, 1, 100, { weightCarriedLbs: 132, turfPerformanceInput: canonical }),
    ]);
    assert.equal(input.tprInputSnapshot?.version, "tpr_forward_snapshot_v1");
    assert.equal(input.tprInputSnapshot?.runners[0]?.input.version, "tpr_turf_input_v1");
    assert.equal(input.tprInputSnapshot?.runners[0]?.w100Rank, 1);
    assert.equal(typeof input.tprInputSnapshot?.runners[0]?.w100RelativeWeightContribution, "number");
  });
});

function forwardInput(runners: TodayRunner[]) {
  return buildTodayForwardInput({
    course: "Sandown",
    race: race({ runners }),
    raceDate: "2026-09-17",
    timewiseRank1: runners[0]?.horseName ?? "Alpha",
    timewiseRank2: runners[1]?.horseName ?? "Bravo",
  });
}

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
