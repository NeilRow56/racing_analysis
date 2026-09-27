import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  JUMP_RATING_FORWARD_START_AT,
  buildJumpRatingForwardRace,
  emptyJumpRatingForwardData,
  enrichJumpRatingForwardRace,
  settlePendingJumpRatingRaces,
  summarizeJumpRatingForward,
  upsertJumpRatingForwardRaces,
} from "./jump-rating-forward";
import type { TodayRace, TodayRunner } from "./todays-racing";

describe("Jump Rating forward tracker", () => {
  test("captures only clean pre-race Jump snapshots after the forward epoch", () => {
    const race = jumpRace();
    const captured = buildJumpRatingForwardRace({
      raceDate: "2026-09-26",
      course: "Test",
      race,
      recordedAt: new Date("2026-09-26T11:30:00.000Z"),
    });

    assert.ok(captured);
    assert.equal(captured.recordedPreRace, true);
    assert.equal(captured.runners[0]?.jprARank, 1);
    assert.equal(captured.runners[0]?.jprBRank, 1);
    assert.equal(captured.runners[0]?.components.averageJumpSpeedLast3, 1);
    assert.equal(
      buildJumpRatingForwardRace({
        raceDate: "2026-09-26",
        course: "Test",
        race,
        recordedAt: new Date("2026-09-26T12:30:00.000Z"),
      }),
      null,
    );
    assert.equal(
      buildJumpRatingForwardRace({
        raceDate: "2026-09-26",
        course: "Test",
        race: jumpRace({ raceDateTime: new Date(JUMP_RATING_FORWARD_START_AT) }),
        recordedAt: new Date("2026-09-26T10:00:00.000Z"),
      })?.recordedPreRace,
      true,
    );
  });

  test("settles a started non-finisher as a losing rank-1 runner", () => {
    const record = requiredRecord();
    const frozen = structuredClone(record.runners);
    const result = jumpRace({
      runners: [
        runner("a", { finishingPosition: null, resultStatus: "fell", oddsDecimal: "3" }),
        runner("b", { finishingPosition: 1, resultStatus: "finished", oddsDecimal: "4" }),
      ],
    });

    const enriched = enrichJumpRatingForwardRace(record, result);
    assert.deepEqual(
      enriched.runners.map(({ components, jprAScore, jprARank, jprBScore, jprBRank }) =>
        ({ components, jprAScore, jprARank, jprBScore, jprBRank })),
      frozen.map(({ components, jprAScore, jprARank, jprBScore, jprBRank }) =>
        ({ components, jprAScore, jprARank, jprBScore, jprBRank })),
    );
    assert.equal(enriched.runners[0]?.settlement?.profitLoss, -1);
    const summary = summarizeJumpRatingForward({
      ...emptyJumpRatingForwardData(),
      races: [enriched],
    });
    assert.equal(summary.jprA.rank1Selections, 1);
    assert.equal(summary.jprA.rank1Strike, 0);
    assert.equal(summary.jprA.top3Capture, 1);
  });

  test("voids a non-runner and preserves canonical dead-heat returns", () => {
    const record = requiredRecord();
    const nonRunnerResult = jumpRace({
      runners: [
        runner("a", { resultStatus: "non_runner", oddsDecimal: null }),
        runner("b", { finishingPosition: 1, resultStatus: "finished", oddsDecimal: "4" }),
      ],
    });
    const nonRunner = enrichJumpRatingForwardRace(record, nonRunnerResult);
    assert.equal(nonRunner.runners[0]?.settlement, null);
    assert.equal(summarizeJumpRatingForward({
      ...emptyJumpRatingForwardData(),
      races: [nonRunner],
    }).jprA.rank1Selections, 0);

    const deadHeatResult = jumpRace({
      runners: [
        runner("a", { finishingPosition: 1, resultStatus: "finished", oddsDecimal: "3" }),
        runner("b", { finishingPosition: 1, resultStatus: "finished", oddsDecimal: "5" }),
      ],
    });
    const deadHeat = enrichJumpRatingForwardRace(record, deadHeatResult);
    assert.equal(deadHeat.runners[0]?.settlement?.grossReturn, 2);
    assert.equal(deadHeat.runners[1]?.settlement?.grossReturn, 3);
  });

  test("reports rank-1 denominator diagnostics for voided and tied selections", () => {
    const voided = enrichJumpRatingForwardRace(requiredRecord(), jumpRace({
      runners: [
        runner("a", { resultStatus: "non_runner", oddsDecimal: null }),
        runner("b", { finishingPosition: 1, resultStatus: "finished", oddsDecimal: "4" }),
      ],
    }));
    const baseTiedRecord = requiredRecord();
    const tiedRecord = {
      ...baseTiedRecord,
      raceId: "race-2",
      runners: baseTiedRecord.runners.map((item) => ({ ...item, jprARank: 1 })),
    };
    const tied = enrichJumpRatingForwardRace(tiedRecord, jumpRace({
      raceId: "race-2",
      runners: [
        runner("a", { finishingPosition: 2, resultStatus: "finished", oddsDecimal: "3" }),
        runner("b", { finishingPosition: 1, resultStatus: "finished", oddsDecimal: "4" }),
      ],
    }));

    const summary = summarizeJumpRatingForward({
      ...emptyJumpRatingForwardData(),
      races: [voided, tied],
    });

    assert.equal(summary.jprA.rank1Selections, 2);
    assert.equal(summary.jprA.rank1Winners, 1);
    assert.equal(summary.jprA.voidRank1Selections, 1);
    assert.equal(summary.jprA.rank1TiedRaces, 1);
  });

  test("upsert and repeated settlement are idempotent", () => {
    const record = requiredRecord();
    const initial = upsertJumpRatingForwardRaces(emptyJumpRatingForwardData(), [record, record]);
    assert.equal(initial.races.length, 1);
    const result = jumpRace({
      runners: [
        runner("a", { finishingPosition: 1, resultStatus: "finished", oddsDecimal: "3" }),
        runner("b", { finishingPosition: 2, resultStatus: "finished", oddsDecimal: "4" }),
      ],
    });
    const first = settlePendingJumpRatingRaces(initial, new Map([[record.raceId, result]]));
    const second = settlePendingJumpRatingRaces(first.data, new Map([[record.raceId, result]]));
    assert.equal(first.settled, 1);
    assert.equal(second.settled, 0);
    assert.strictEqual(second.data, first.data);
  });
});

function requiredRecord() {
  const record = buildJumpRatingForwardRace({
    raceDate: "2026-09-26",
    course: "Test",
    race: jumpRace(),
    recordedAt: new Date("2026-09-26T11:30:00.000Z"),
  });
  assert.ok(record);
  return record;
}

function jumpRace(overrides: Partial<TodayRace> = {}): TodayRace {
  return {
    raceId: "race-1",
    sourceId: "source-race-1",
    scheduledTime: "13:00:00",
    raceDateTime: new Date("2026-09-26T12:00:00.000Z"),
    courseCountry: "GB",
    raceName: "Test Handicap Hurdle",
    raceClass: "3",
    raceType: "Hurdle",
    raceTypeCode: "HUR",
    distance: "2m",
    distanceYards: 3520,
    going: "Good",
    surface: null,
    declaredRunnerCount: 2,
    actualRunnerCount: null,
    winningTime: null,
    runners: [
      runner("a", { averageJumpSpeedLast3: 120, trainerPriorWinRate: 20, officialRating: 140 }),
      runner("b", { averageJumpSpeedLast3: 100, trainerPriorWinRate: 10, officialRating: 120 }),
    ],
    ...overrides,
  };
}

function runner(
  id: string,
  overrides: Partial<TodayRunner> & {
    averageJumpSpeedLast3?: number | null;
    trainerPriorWinRate?: number | null;
  } = {},
): TodayRunner {
  const {
    averageJumpSpeedLast3 = 100,
    trainerPriorWinRate = 10,
    ...runnerOverrides
  } = overrides;
  return {
    runnerId: id,
    runnerSourceId: id,
    horseId: `horse-${id}`,
    horseName: `Horse ${id.toUpperCase()}`,
    saddleclothNumber: 1,
    horseAge: 7,
    horseSex: null,
    weight: "11-0",
    weightCarriedLbs: 154,
    draw: null,
    jockeyName: null,
    trainerId: `trainer-${id}`,
    trainerName: `Trainer ${id}`,
    officialRating: 100,
    odds: null,
    oddsDecimal: null,
    resultStatus: null,
    finishingPosition: null,
    metrics: {
      averageJumpSpeedLast3,
    } as TodayRunner["metrics"],
    trainerMetrics: {
      trainerPriorRuns: 100,
      trainerPriorWins: trainerPriorWinRate ?? 0,
      trainerPriorWinRate,
    },
    ...runnerOverrides,
  };
}
