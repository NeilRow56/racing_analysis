import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  summarizeTprForward,
  TRACKER_VERSION,
  type TrackerData,
} from "../../../scripts/diagnose-tpr-vs-timewise-forward";
import {
  buildTprForwardRace,
  pendingTprForwardRaceIds,
  renderTprToday,
  settlePendingTprForwardRaces,
  upsertTprForwardRaces,
} from "./tpr-forward-workflow";
import type { TodayRace, TodayRunner } from "./todays-racing";
import { TURF_PERFORMANCE_RATING_VERSION } from "./turf-performance-rating";

describe("TPR forward workflow", () => {
  test("captures pre-race W100, W50, OR and the current snapshot", () => {
    const record = capture();
    assert.equal(record.raceId, "race-1");
    assert.equal(record.raceDateTime, "2026-09-27T13:00:00.000Z");
    assert.equal(record.recordedPreRace, true);
    assert.equal(record.timewiseRecordedPreRace, true);
    assert.equal(record.tprRank1, "Alpha");
    assert.equal(record.tprRank2, "Bravo");
    assert.equal(record.w50Rank1, "Bravo");
    assert.equal(record.orRank1, "Alpha");
    assert.equal(record.tprInputSnapshot?.version, "tpr_forward_snapshot_v1");
    assert.equal(record.winners.length, 0);
  });

  test("is idempotent and does not duplicate a legacy race without a race ID", () => {
    const record = capture();
    const empty = tracker();
    const once = upsertTprForwardRaces(empty, [record]);
    assert.equal(upsertTprForwardRaces(once, [record]), once);
    const legacy = { ...record, raceId: undefined };
    assert.equal(upsertTprForwardRaces({ ...empty, races: [legacy] }, [record]).races.length, 1);
  });

  test("does not create a clean record at or after canonical start time", () => {
    const result = buildTprForwardRace({
      raceDate: "2026-09-27",
      course: "Ascot",
      race: race(),
      recordedAt: new Date("2026-09-27T13:00:00.000Z"),
    });
    assert.equal(result, null);
  });

  test("settles after racing while preserving frozen selections and OR", () => {
    const pending = capture();
    const result = race({ runners: [
      runner("a", "Alpha", 2, 1, 100, { finishingPosition: 2, oddsDecimal: "2.5" }),
      runner("b", "Bravo", 1, 2, 90, { finishingPosition: 1, oddsDecimal: "6" }),
    ] });
    const settled = settlePendingTprForwardRaces(
      { ...tracker(), races: [pending] },
      new Map([[result.raceId, result]]),
    );
    const record = settled.data.races[0]!;
    assert.equal(settled.settled, 1);
    assert.equal(record.winner, "Bravo");
    assert.equal(record.tprRank1, "Alpha");
    assert.equal(record.w50Rank1, "Bravo");
    assert.equal(record.orRank1, "Alpha");
    assert.equal(record.tprInputSnapshot, pending.tprInputSnapshot);
    assert.deepEqual(pendingTprForwardRaceIds(settled.data), []);
  });

  test("voids a genuine non-runner but keeps a started non-finisher as a loser", () => {
    const pending = capture();
    const result = race({ runners: [
      runner("a", "Alpha", 1, 2, 100, { resultStatus: "non_runner" }),
      runner("b", "Bravo", 2, 1, 90, { resultStatus: "pulled_up" }),
      runner("c", "Charlie", 3, 3, 80, { finishingPosition: 1, resultStatus: "finished", oddsDecimal: "4" }),
    ] });
    const settled = settlePendingTprForwardRaces(
      { ...tracker(), races: [pending] },
      new Map([[result.raceId, result]]),
    ).data.races[0]!;
    assert.equal(settled.tprRank1NonRunner, true);
    assert.equal(settled.w50Rank1NonRunner, false);
    const summary = summarizeTprForward([settled]);
    assert.equal(summary.w100.runnableSelections, 0);
    assert.equal(summary.w50.runnableSelections, 1);
    assert.equal(summary.w50.winners, 0);
  });

  test("leaves incomplete results pending", () => {
    const pending = capture();
    const incomplete = race({ runners: [runner("a", "Alpha", 1, 2, 100)] });
    const result = settlePendingTprForwardRaces(
      { ...tracker(), races: [pending] },
      new Map([[incomplete.raceId, incomplete]]),
    );
    assert.equal(result.settled, 0);
    assert.deepEqual(pendingTprForwardRaceIds(result.data), ["race-1"]);
  });

  test("renders today's clean records without changing summary semantics", () => {
    const pending = capture();
    const data = { ...tracker(), races: [pending] };
    const before = summarizeTprForward(data.races);
    const output = renderTprToday(data, "2026-09-27");
    const after = summarizeTprForward(data.races);
    assert.match(output, /14:00 Ascot - Example Stakes/);
    assert.match(output, /W100: Alpha \| W50: Bravo \| agree: no/);
    assert.match(output, /OR: Alpha \| W100=OR: yes \| W50=OR: no \| pending/);
    assert.deepEqual(after, before);
    assert.equal(before.tracking.cleanSample, 1);
  });

  test("retains sparse TPR races diagnostically without a false rank-1 selection", () => {
    const record = buildTprForwardRace({
      raceDate: "2026-09-27",
      course: "Ascot",
      race: sparseTprRace(11, 1),
      recordedAt: new Date("2026-09-27T12:00:00.000Z"),
    });
    assert.ok(record);
    assert.equal(record.activeRunnerCount, 11);
    assert.equal(record.ratedRunnerCount, 1);
    assert.equal(record.ratingCoverageStatus, "insufficient_coverage");
    assert.equal(record.ratingCoverageExclusionReason, "insufficient_rating_coverage");
    assert.equal(record.tprRankEligible, false);
    assert.equal(record.tprRank1, null);
    assert.deepEqual(pendingTprForwardRaceIds({ ...tracker(), races: [record] }), []);
    assert.match(renderTprToday({ ...tracker(), races: [record] }, "2026-09-27"), /insufficient race coverage \(Rated: 1\/11\)/);
  });
});

function capture() {
  const record = buildTprForwardRace({
    raceDate: "2026-09-27",
    course: "Ascot",
    race: race(),
    recordedAt: new Date("2026-09-27T12:00:00.000Z"),
  });
  assert.ok(record);
  return record;
}

function tracker(): TrackerData {
  return { version: TRACKER_VERSION, races: [] };
}

function race(overrides: Partial<TodayRace> = {}): TodayRace {
  return {
    raceId: "race-1",
    sourceId: "source-1",
    scheduledTime: "14:00:00",
    raceDateTime: new Date("2026-09-27T13:00:00.000Z"),
    courseCountry: "ENG",
    raceName: "Example Stakes",
    raceClass: "4",
    raceType: "Flat",
    raceTypeCode: "FLAT",
    distance: "1m",
    distanceYards: 1760,
    going: "Good",
    surface: "TURF",
    declaredRunnerCount: 2,
    actualRunnerCount: null,
    winningTime: null,
    runners: [runner("a", "Alpha", 1, 2, 100), runner("b", "Bravo", 2, 1, 90)],
    ...overrides,
  };
}

function sparseTprRace(activeRunnerCount: number, ratedRunnerCount: number): TodayRace {
  return race({
    declaredRunnerCount: activeRunnerCount,
    tprRatingCoverage: {
      activeRunnerCount,
      ratedRunnerCount,
      ratingCoverage: ratedRunnerCount / activeRunnerCount,
      ratingCoverageStatus: "insufficient_coverage",
      guardVersion: "tpr_rating_coverage_guard_v1",
      guardImplementedAt: "2026-09-30T00:00:00.000Z",
    },
    runners: Array.from({ length: activeRunnerCount }, (_, index) => runner(
      String(index + 1),
      index === 0 ? "Sparse Rated" : `Unrated ${index + 1}`,
      index + 1,
      index + 1,
      100 - index,
      index < ratedRunnerCount
        ? {}
        : { turfPerformanceRating: undefined, turfPerformanceShadowRating: undefined, turfPerformanceInput: undefined },
    )),
  });
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
    runnerId,
    runnerSourceId: runnerId,
    horseId: `horse-${runnerId}`,
    horseName,
    saddleclothNumber: null,
    horseAge: null,
    horseSex: null,
    weight: null,
    weightCarriedLbs: null,
    draw: null,
    jockeyName: null,
    trainerId: null,
    trainerName: null,
    officialRating,
    odds: null,
    oddsDecimal: null,
    resultStatus: null,
    finishingPosition: null,
    metrics: null,
    turfPerformanceRating: {
      rating: 100 - w100Rank,
      rawRating: 0,
      rank: w100Rank,
      gap: null,
      historyDepth: 3,
      version: TURF_PERFORMANCE_RATING_VERSION,
      isCrossSurfaceFallback: false,
    },
    turfPerformanceShadowRating: {
      rating: 100 - w50Rank,
      rawRating: 0,
      rank: w50Rank,
      gap: null,
      historyDepth: 3,
      version: TURF_PERFORMANCE_RATING_VERSION,
      isCrossSurfaceFallback: false,
    },
    ...overrides,
  };
}
