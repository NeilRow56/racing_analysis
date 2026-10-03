import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { JUMP_SPEED_RATING_CALCULATION_VERSION } from "./jump-speed-rating";
import {
  JUMP_TISSUE_FEATURE_NAMES,
  JUMP_TISSUE_IMPLEMENTED_AT,
  JUMP_TISSUE_SCHEMA,
  JUMP_TISSUE_STAGE1_PREDICTIONS_PATH,
  JUMP_TISSUE_TRAINING_FROM,
  JUMP_TISSUE_TRAINING_TO,
  JUMP_TISSUE_VERSION,
  predictJumpTissue,
  type JumpTissueModel,
} from "./jump-tissue-model";
import {
  buildJumpTissueRace,
  captureJumpTissueRaces,
  currentPositiveJumpTissueRankOneEdges,
  settleJumpTissueRace,
} from "./jump-tissue-forward";
import type { TodayRace, TodayRunner } from "./todays-racing";

describe("Jump Tissue forward tracking", () => {
  test("produces deterministic full-field probabilities and ranks", () => {
    const race = sampleRace();
    const first = predictJumpTissue(race, new Map(), model());
    const second = predictJumpTissue(race, new Map(), model());
    assert.deepEqual(first, second);
    assert.equal(first.activeRunnerCount, 3);
    assert.equal(first.predictedRunnerCount, 3);
    assert.equal(first.predictionCoverage, 1);
    assert.equal(Number(first.runners.reduce((sum, runner) => sum + (runner.probability ?? 0), 0).toFixed(12)), 1);
    assert.deepEqual(first.runners.map((runner) => runner.historyBucket), ["zero", "one", "three_plus"]);
  });

  test("stores chronology-safe comment provenance only from prior comments", () => {
    const race = sampleRace();
    const comments = new Map([["horse-1", [
      { horseId: "horse-1", raceId: "prior", raceDate: "2026-09-01", raceDateTime: new Date("2026-09-01T12:00:00Z"), comment: "Prominent, stayed on" },
      { horseId: "horse-1", raceId: "target", raceDate: "2026-10-02", raceDateTime: new Date("2026-10-02T14:00:00Z"), comment: "Target result comment" },
    ].map(({ horseId: _horseId, ...row }) => row)]]);
    const prediction = predictJumpTissue(race, comments, model()).runners[0]!;
    assert.equal(prediction.commentProvenance.priorCommentCount, 1);
    assert.equal(prediction.commentProvenance.chronologySafe, true);
    assert.equal(prediction.commentProvenance.targetRacePostResultCommentExcluded, true);
    assert.deepEqual(prediction.commentProvenance.activeCommentFeatures.sort(), ["prominent", "stayedOn"]);
  });

  test("captures Hurdle Chase and NH Flat subtypes before race time only", () => {
    for (const [raceType, expected, nhFlat] of [["Hurdle", "Hurdle", false], ["Chase", "Chase", false], ["NH Flat", "NH Flat", true]] as const) {
      const race = sampleRace({ raceType, raceName: `Test ${raceType}` });
      const record = buildJumpTissueRace({ raceDate: "2026-10-02", course: "Test", race, commentsByHorse: new Map(), model: model(), recordedAt: new Date(JUMP_TISSUE_IMPLEMENTED_AT) })!;
      assert.equal(record.subtype, expected);
      assert.equal(record.nhFlat, nhFlat);
    }
    const afterOff = buildJumpTissueRace({ raceDate: "2026-10-02", course: "Test", race: sampleRace(), commentsByHorse: new Map(), model: model(), recordedAt: new Date("2026-10-02T14:01:00Z") });
    assert.equal(afterOff, null);
  });

  test("idempotent capture prevents post-race backfill", () => {
    const record = buildJumpTissueRace({ raceDate: "2026-10-02", course: "Test", race: sampleRace(), commentsByHorse: new Map(), model: model(), recordedAt: new Date(JUMP_TISSUE_IMPLEMENTED_AT) })!;
    const first = captureJumpTissueRaces({ version: "jump_tissue_forward_v1", modelVersion: JUMP_TISSUE_VERSION, featureSchemaVersion: JUMP_TISSUE_SCHEMA, implementedAt: JUMP_TISSUE_IMPLEMENTED_AT, races: [] }, [record]);
    const second = captureJumpTissueRaces(first, [record]);
    assert.equal(first.races.length, 1);
    assert.equal(second.races.length, 1);
  });

  test("settles started non-finishers as losses, non-runners as void, and dead heats with divisor", () => {
    const record = buildJumpTissueRace({ raceDate: "2026-10-02", course: "Test", race: sampleRace(), commentsByHorse: new Map(), model: model(), recordedAt: new Date(JUMP_TISSUE_IMPLEMENTED_AT) })!;
    const settled = settleJumpTissueRace(record, sampleRace({
      runners: [
        runner("runner-1", "Alpha", 0, { finishingPosition: 1, oddsDecimal: "5" }),
        runner("runner-2", "Beta", 1, { finishingPosition: null, resultStatus: "pulled_up", oddsDecimal: "7" }),
        runner("runner-3", "Gamma", 4, { finishingPosition: null, resultStatus: "non_runner" }),
      ],
      actualRunnerCount: 2,
    }));
    assert.equal(settled.settledAt !== null, true);
    assert.equal(settled.runners.find((candidate) => candidate.runnerId === "runner-2")!.outcome!.won, false);
    assert.equal(settled.runners.find((candidate) => candidate.runnerId === "runner-3")!.outcome!.won, null);

    const deadHeat = settleJumpTissueRace(record, sampleRace({
      runners: [
        runner("runner-1", "Alpha", 0, { finishingPosition: 1, oddsDecimal: "5" }),
        runner("runner-2", "Beta", 1, { finishingPosition: 1, oddsDecimal: "7" }),
        runner("runner-3", "Gamma", 4, { finishingPosition: 3, oddsDecimal: "9" }),
      ],
      actualRunnerCount: 3,
    }));
    assert.equal(deadHeat.runners.find((candidate) => candidate.runnerId === "runner-1")!.outcome!.deadHeatDivisor, 2);
  });

  test("positive-edge shortlist uses median bookmaker price and LARGE threshold", () => {
    const record = buildJumpTissueRace({ raceDate: "2026-10-02", course: "Test", race: sampleRace(), commentsByHorse: new Map(), model: model(), recordedAt: new Date(JUMP_TISSUE_IMPLEMENTED_AT) })!;
    const leader = record.runners.find((runner) => runner.runnerId === record.top1)!;
    leader.probability = 0.4;
    const result = currentPositiveJumpTissueRankOneEdges([record], [{ raceId: record.raceId, runnerId: leader.runnerId, marketPrice: "7/2", marketDecimalOdds: 3, bookmakerQuoteCount: 3, forecastPrice: "5/2", forecastDecimalOdds: 3.5, displayRaceTime: "14:00" }]);
    assert.equal(result.comparableRaces, 1);
    assert.equal(result.selections.length, 1);
    assert.equal(Math.round(result.selections[0]!.edge * 1000), 67);
  });
});

function model(): JumpTissueModel {
  const names = [...JUMP_TISSUE_FEATURE_NAMES];
  return {
    version: JUMP_TISSUE_VERSION,
    featureSchemaVersion: JUMP_TISSUE_SCHEMA,
    implementedAt: JUMP_TISSUE_IMPLEMENTED_AT,
    candidate: "J-T1",
    trainingPeriod: { from: JUMP_TISSUE_TRAINING_FROM, to: JUMP_TISSUE_TRAINING_TO, races: 1, runners: 3 },
    dependencies: { jumpSpeed: JUMP_SPEED_RATING_CALCULATION_VERSION, settlement: "canonical_settlement_v2" },
    stage1DiagnosticPredictionsPath: JUMP_TISSUE_STAGE1_PREDICTIONS_PATH,
    stage1DiagnosticPredictionsHash: null,
    checksum: "test",
    model: { names, means: names.map(() => 0), scales: names.map(() => 1), weights: names.map((_, index) => index === 0 ? 0.01 : 0) },
  };
}

function sampleRace(overrides: Partial<TodayRace> = {}): TodayRace {
  return {
    raceId: "race-1",
    sourceId: "source-race-1",
    scheduledTime: "14:00",
    raceDateTime: new Date("2026-10-02T14:00:00Z"),
    courseCountry: "GB",
    raceName: "Test Hurdle",
    raceClass: "Class 4",
    raceType: "Hurdle",
    raceTypeCode: null,
    distance: "2m",
    distanceYards: 3520,
    going: "Soft",
    surface: "Turf",
    declaredRunnerCount: 3,
    actualRunnerCount: null,
    winningTime: null,
    runners: [runner("runner-1", "Alpha", 0), runner("runner-2", "Beta", 1), runner("runner-3", "Gamma", 4)],
    ...overrides,
  };
}

function runner(runnerId: string, horseName: string, priorRuns: number, overrides: Partial<TodayRunner> = {}): TodayRunner {
  return {
    runnerId,
    runnerSourceId: runnerId,
    horseId: runnerId.replace("runner", "horse"),
    horseName,
    saddleclothNumber: Number(runnerId.at(-1)),
    horseAge: 6,
    horseSex: null,
    weight: "11-0",
    weightCarriedLbs: 154,
    draw: null,
    jockeyName: "Jockey",
    trainerId: "trainer",
    trainerName: "Trainer",
    officialRating: 100 + priorRuns,
    odds: null,
    oddsDecimal: null,
    resultStatus: null,
    finishingPosition: null,
    metrics: {
      priorRuns,
      latestJumpSpeedRating: 100 + priorRuns,
      bestJumpSpeedLast3: 102 + priorRuns,
      averageJumpSpeedLast3: 101 + priorRuns,
      daysSinceLastRun: 30,
    } as TodayRunner["metrics"],
    trainerMetrics: { trainerPriorRuns: 20, trainerPriorWins: 4, trainerPriorWinRate: 0.2 },
    jockeyMetrics: { jockeyPriorRuns: 20, jockeyPriorWins: 3, jockeyPriorWinRate: 0.15 },
    bookmakerQuotes: [],
    ...overrides,
  };
}
