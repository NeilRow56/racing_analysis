import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  AW_RATING_FORWARD_START_AT,
  buildAwRatingForwardRace,
  emptyAwRatingForwardData,
  enrichAwRatingForwardRace,
  pendingAwRatingRaceIds,
  settlePendingAwRatingRaces,
  summarizeAwRatingForward,
  upsertAwRatingForwardRaces,
} from "./aw-rating-forward";
import type { TodayRace, TodayRunner } from "./todays-racing";

describe("AW Rating forward tracker", () => {
  test("captures a clean pre-race snapshot and rejects pre-epoch backfill", () => {
    const captured = buildAwRatingForwardRace({
      raceDate: "2026-09-27",
      course: "Test",
      race: awRace(),
      recordedAt: new Date("2026-09-27T10:30:00.000Z"),
    });

    assert.ok(captured);
    assert.equal(captured.recordedPreRace, true);
    assert.equal(captured.runners[0]?.awDRank, 1);
    assert.equal(captured.runners[0]?.awARank, 1);
    assert.equal(captured.runners[0]?.components.jockeyPriorStrikeRate, 1);
    assert.equal(captured.zeroHistoryRunnerCount, 1);
    assert.equal(captured.runners[1]?.zeroHistory, true);
    assert.equal(captured.runners[1]?.awDRank, null);
    assert.equal(captured.ratingCoverageStatus, "insufficient_coverage");
    assert.equal(captured.ratingCoverageExclusionReason, "insufficient_rating_coverage");
    assert.equal(captured.awDRankEligible, false);
    assert.equal(
      buildAwRatingForwardRace({
        raceDate: "2026-09-26",
        course: "Test",
        race: awRace({ raceDateTime: new Date("2026-09-26T22:00:00.000Z") }),
        recordedAt: new Date("2026-09-26T21:00:00.000Z"),
      }),
      null,
    );
    assert.equal(
      buildAwRatingForwardRace({
        raceDate: "2026-09-27",
        course: "Test",
        race: awRace(),
        recordedAt: new Date("2026-09-27T12:00:00.000Z"),
      }),
      null,
    );
    assert.ok(new Date(AW_RATING_FORWARD_START_AT).getTime() > 0);
  });

  test("does not treat insufficient AW-D coverage as a rank-1 analytical selection", () => {
    const record = requiredRecord(awRace({
      declaredRunnerCount: 11,
      runners: Array.from({ length: 11 }, (_, index) => runner(String(index + 1), {
        averageAwSpeedLast3: index === 0 ? 100 : null,
        trainerRate: index === 0 ? 20 : 10,
        jockeyRate: index === 0 ? 20 : 10,
      })),
    }));
    const summary = summarizeAwRatingForward({
      ...emptyAwRatingForwardData(),
      races: [record],
    });

    assert.equal(record.activeRunnerCount, 11);
    assert.equal(record.ratedRunnerCount, 1);
    assert.equal(Math.round((record.ratingCoverage ?? 0) * 10000) / 100, 9.09);
    assert.equal(record.ratingCoverageStatus, "insufficient_coverage");
    assert.equal(record.runners[0]?.awDScore, 1);
    assert.equal(record.runners[0]?.awDRank, 1);
    assert.equal(record.rank1Agreement, null);
    assert.equal(summary.awD.rank1Selections, 0);
    assert.equal(summary.pending, 0);
    assert.equal(summary.insufficientCoverage, 1);
    assert.deepEqual(pendingAwRatingRaceIds({
      ...emptyAwRatingForwardData(),
      races: [record],
    }), []);
  });

  test("records AW-D/A disagreement without changing either ranking", () => {
    const record = requiredRecord(awRace({
      runners: [
        runner("a", { averageAwSpeedLast3: 100, trainerRate: 30, jockeyRate: 30 }),
        runner("b", { averageAwSpeedLast3: 120, trainerRate: 20, jockeyRate: 10 }),
        runner("c", { averageAwSpeedLast3: 110, trainerRate: 10, jockeyRate: 20 }),
      ],
    }));

    assert.equal(record.rank1Agreement, false);
    assert.equal(record.runners.find((runner) => runner.runnerId === "a")?.awDRank, 1);
    assert.equal(record.runners.find((runner) => runner.runnerId === "b")?.awARank, 1);
  });

  test("voids a non-runner and settles a started non-finisher as a loss", () => {
    const record = requiredRecord();
    const frozen = structuredClone(record.runners.map(frozenRating));
    const result = awRace({
      runners: [
        runner("a", { finishingPosition: null, resultStatus: "fell", oddsDecimal: "3" }),
        runner("b", { finishingPosition: 1, resultStatus: "finished", oddsDecimal: "4", priorAwStarts: 0 }),
      ],
    });
    const enriched = enrichAwRatingForwardRace(record, result);

    assert.deepEqual(enriched.runners.map(frozenRating), frozen);
    assert.equal(enriched.runners[0]?.settlement?.profitLoss, -1);
    assert.equal(summarizeAwRatingForward({
      ...emptyAwRatingForwardData(),
      races: [enriched],
    }).zeroHistory.settledWinners, 1);

    const nonRunner = enrichAwRatingForwardRace(record, awRace({
      runners: [
        runner("a", { resultStatus: "non_runner", oddsDecimal: null }),
        runner("b", { finishingPosition: 1, resultStatus: "finished", oddsDecimal: "4", priorAwStarts: 0 }),
      ],
    }));
    assert.equal(nonRunner.runners[0]?.settlement, null);
    assert.equal(summarizeAwRatingForward({
      ...emptyAwRatingForwardData(),
      races: [nonRunner],
    }).awD.rank1Selections, 0);
  });

  test("upsert and repeated settlement are idempotent", () => {
    const record = requiredRecord();
    const initial = upsertAwRatingForwardRaces(emptyAwRatingForwardData(), [record, record]);
    const result = awRace({
      runners: [
        runner("a", { finishingPosition: 1, resultStatus: "finished", oddsDecimal: "3" }),
        runner("b", { finishingPosition: 2, resultStatus: "finished", oddsDecimal: "4", priorAwStarts: 0 }),
      ],
    });
    const first = settlePendingAwRatingRaces(initial, new Map([[record.raceId, result]]));
    const second = settlePendingAwRatingRaces(first.data, new Map([[record.raceId, result]]));

    assert.equal(initial.races.length, 1);
    assert.equal(first.settled, 1);
    assert.equal(second.settled, 0);
    assert.strictEqual(second.data, first.data);
  });
});

function requiredRecord(race = eligibleAwRace()) {
  const record = buildAwRatingForwardRace({
    raceDate: "2026-09-27",
    course: "Test",
    race,
    recordedAt: new Date("2026-09-27T10:30:00.000Z"),
  });
  assert.ok(record);
  return record;
}

function eligibleAwRace(overrides: Partial<TodayRace> = {}): TodayRace {
  return awRace({
    runners: [
      runner("a", { averageAwSpeedLast3: 120, trainerRate: 20, jockeyRate: 20 }),
      runner("b", { averageAwSpeedLast3: 110, trainerRate: 10, jockeyRate: 10, priorAwStarts: 0 }),
    ],
    ...overrides,
  });
}

function frozenRating(runner: ReturnType<typeof requiredRecord>["runners"][number]) {
  return {
    components: runner.components,
    awDScore: runner.awDScore,
    awDRank: runner.awDRank,
    awAScore: runner.awAScore,
    awARank: runner.awARank,
  };
}

function awRace(overrides: Partial<TodayRace> = {}): TodayRace {
  return {
    raceId: "race-1",
    sourceId: "source-race-1",
    scheduledTime: "13:00:00",
    raceDateTime: new Date("2026-09-27T12:00:00.000Z"),
    courseCountry: "GB",
    raceName: "Test Handicap",
    raceClass: "4",
    raceType: "Flat",
    raceTypeCode: "FLAT",
    distance: "1m",
    distanceYards: 1760,
    going: "Standard",
    surface: "ALLWEATHER",
    declaredRunnerCount: 2,
    actualRunnerCount: null,
    winningTime: null,
    runners: [
      runner("a", { averageAwSpeedLast3: 120, trainerRate: 20, jockeyRate: 20 }),
      runner("b", { averageAwSpeedLast3: null, trainerRate: 10, jockeyRate: 10, priorAwStarts: 0 }),
    ],
    ...overrides,
  };
}

function runner(
  id: string,
  overrides: Partial<TodayRunner> & {
    averageAwSpeedLast3?: number | null;
    trainerRate?: number | null;
    jockeyRate?: number | null;
    priorAwStarts?: number;
  } = {},
): TodayRunner {
  const {
    averageAwSpeedLast3 = 100,
    trainerRate = 10,
    jockeyRate = 10,
    priorAwStarts = 2,
    ...runnerOverrides
  } = overrides;
  return {
    runnerId: id,
    runnerSourceId: id,
    horseId: `horse-${id}`,
    horseName: `Horse ${id.toUpperCase()}`,
    saddleclothNumber: 1,
    horseAge: 4,
    horseSex: null,
    weight: "9-0",
    weightCarriedLbs: 126,
    draw: 1,
    jockeyName: `Jockey ${id}`,
    trainerId: `trainer-${id}`,
    trainerName: `Trainer ${id}`,
    officialRating: 80,
    odds: null,
    oddsDecimal: null,
    resultStatus: null,
    finishingPosition: null,
    metrics: { averageAwSpeedLast3, priorAwStarts } as TodayRunner["metrics"],
    trainerMetrics: {
      trainerPriorRuns: 100,
      trainerPriorWins: trainerRate ?? 0,
      trainerPriorWinRate: trainerRate,
    },
    jockeyMetrics: {
      jockeyPriorRuns: 100,
      jockeyPriorWins: jockeyRate ?? 0,
      jockeyPriorWinRate: jockeyRate,
    },
    ...runnerOverrides,
  };
}
