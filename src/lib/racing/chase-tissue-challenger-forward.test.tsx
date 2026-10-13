import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ChaseTissueChallengerSection } from "@/app/racing/research/forward-value/chase-tissue-challenger";
import { loadJumpTissueModel, predictJumpTissue, type JumpTissueModel } from "./jump-tissue-model";
import {
  buildChasePair,
  captureChasePairs,
  CHASE_MISMATCH_ZERO_FEATURES,
  emptyChasePair,
  chasePairLeader,
  summarizeChasePairs,
  updateChasePairs,
} from "./chase-tissue-challenger-forward";
import { raceSoftmax, score, type HistoricalComment } from "../../../scripts/diagnose-independent-tissue-feasibility";
import { workflowSteps } from "../../../scripts/run-research-workflow";
import type { TodayRace, TodayRunner } from "./todays-racing";

const date = "2026-10-13";
const now = new Date(`${date}T08:00:00Z`);
const comments: Map<string, HistoricalComment[]> = new Map([["horse-a", [{ raceId: "prior", raceDate: "2026-09-01", raceDateTime: new Date("2026-09-01T12:00:00Z"), comment: "Checked for room" }]]]);
const frozen = await loadJumpTissueModel();

function model(): JumpTissueModel {
  const copy = structuredClone(frozen);
  copy.model.means.fill(0);
  copy.model.scales.fill(1);
  copy.model.weights = copy.model.names.map((name) => name === "official_rating" ? 0.01 : name === "last_checked" ? 2 : 0);
  return copy;
}

function runner(id: string, rating: number, overrides: Partial<TodayRunner> = {}): TodayRunner {
  return {
    runnerId: id,
    runnerSourceId: id,
    horseId: `horse-${id}`,
    horseName: id === "a" ? "Alpha" : "Beta",
    saddleclothNumber: id === "a" ? 1 : 2,
    horseAge: 7,
    horseSex: null,
    weight: "11-0",
    weightCarriedLbs: 154,
    draw: null,
    jockeyName: "Jockey",
    trainerId: "trainer",
    trainerName: "Trainer",
    officialRating: rating,
    odds: null,
    oddsDecimal: null,
    resultStatus: null,
    finishingPosition: null,
    metrics: { priorRuns: 3, latestJumpSpeedRating: 100, bestJumpSpeedLast3: 102, averageJumpSpeedLast3: 101, daysSinceLastRun: 30 } as TodayRunner["metrics"],
    trainerMetrics: { trainerPriorRuns: 20, trainerPriorWins: 4, trainerPriorWinRate: 0.2 },
    jockeyMetrics: { jockeyPriorRuns: 20, jockeyPriorWins: 3, jockeyPriorWinRate: 0.15 },
    bookmakerQuotes: [{ bookmakerId: 1, bookmakerName: "Book", fractionalOdds: "4/1", decimalOdds: 5 }],
    ...overrides,
  };
}

function race(overrides: Partial<TodayRace> = {}): TodayRace {
  return {
    raceId: "race",
    sourceId: "source-race",
    scheduledTime: "14:00",
    raceDateTime: new Date(`${date}T13:00:00Z`),
    courseCountry: "GB",
    raceName: "Test Chase",
    raceClass: "Class 4",
    raceType: "Chase",
    raceTypeCode: null,
    distance: "2m",
    distanceYards: 3520,
    going: "Soft",
    surface: "Turf",
    declaredRunnerCount: 2,
    actualRunnerCount: null,
    winningTime: null,
    runners: [runner("a", 100), runner("b", 175)],
    ...overrides,
  };
}

function capture(card = race()) {
  return buildChasePair({ raceDate: date, course: "Teston", race: card, model: model(), commentsByHorse: comments, recordedAt: now })!;
}

function settle(winner: "a" | "b" = "b") {
  return race({
    actualRunnerCount: 2,
    runners: [
      runner("a", 100, winner === "a" ? { finishingPosition: 1, oddsDecimal: "5" } : { finishingPosition: 2, oddsDecimal: "5" }),
      runner("b", 175, winner === "b" ? { finishingPosition: 1, oddsDecimal: "5" } : { finishingPosition: 2, oddsDecimal: "5" }),
    ],
  });
}

test("Chase mismatch-zero shadow freezes control and zeroes exactly the eight mismatch comment features", () => {
  const source = model();
  const pair = buildChasePair({ raceDate: date, course: "Teston", race: race(), model: source, commentsByHorse: comments, recordedAt: now })!;
  const control = predictJumpTissue(race(), comments, source);
  assert.equal(pair.challengerVersion, "CHASE_TISSUE_MISMATCH_ZERO_SHADOW_V1");
  assert.deepEqual(CHASE_MISMATCH_ZERO_FEATURES, [
    "last_checked",
    "last3_checked_count",
    "last_deniedRoom",
    "last3_deniedRoom_count",
    "last_shortRoom",
    "last3_shortRoom_count",
    "last_slowlyAway",
    "last3_slowlyAway_count",
  ]);
  assert.deepEqual(pair.control.runners.map(({ runnerId, probability, rank }) => ({ runnerId, probability, rank })), control.runners.map(({ runnerId, probability, rank }) => ({ runnerId, probability, rank })));
  const indexes = CHASE_MISMATCH_ZERO_FEATURES.map((name) => source.model.names.indexOf(name));
  const expected = raceSoftmax(pair.control.runners.map((runner) => {
    const values = [...runner.modelInputs!];
    indexes.forEach((index) => { values[index] = 0; });
    return score(source.model, values);
  }));
  pair.challenger.runners.forEach((runner, index) => assert.ok(Math.abs(runner.probability! - expected[index]!) < 1e-12));
  assert.equal(pair.classification, "DISAGREE");
  assert.equal(pair.control.top1, "a");
  assert.equal(pair.challenger.top1, "b");
});

test("only Chase races are captured; Hurdles, NH Flat and non-jumps are ignored", () => {
  assert.ok(capture());
  for (const raceType of ["Hurdle", "NH Flat", "Flat"]) {
    assert.equal(buildChasePair({ raceDate: date, course: "Teston", race: race({ raceType, raceName: `Test ${raceType}` }), model: model(), commentsByHorse: comments, recordedAt: now }), null);
  }
});

test("canonical settlement, summary disagreement and compact UI use the Chase challenger labels", () => {
  const settled = updateChasePairs(captureChasePairs(emptyChasePair(), [capture()]), new Map([["race", settle()]]), new Date(`${date}T14:00:00Z`), true);
  const summary = summarizeChasePairs(settled);
  assert.equal(chasePairLeader(settled.races[0]!.control).outcome!.won, false);
  assert.equal(chasePairLeader(settled.races[0]!.challenger).outcome!.won, true);
  assert.equal(summary.disagreement.challengerWins, 1);
  const html = renderToStaticMarkup(<ChaseTissueChallengerSection data={settled} date={date} />);
  for (const label of ["CHASE TISSUE CHALLENGER", "Jump Tissue V1", "Mismatch Zero", "Alpha", "Beta", "DISAGREE", "MZ Winner"]) assert.ok(html.includes(label));
});

test("morning captures Chase pairs after Jump sync; live and after only report or settle", () => {
  const morning = workflowSteps("morning", date).map((step) => step.script);
  assert.ok(morning.indexOf("chase-pair:sync") > morning.indexOf("jump-tissue:sync"));
  assert.ok(!workflowSteps("live", date).some((step) => step.script === "chase-pair:sync"));
  assert.ok(!workflowSteps("after", date).some((step) => step.script === "chase-pair:sync"));
  assert.ok(workflowSteps("live", date).some((step) => step.script === "chase-pair:today"));
  assert.ok(workflowSteps("after", date).some((step) => step.script === "chase-pair:results"));
});
