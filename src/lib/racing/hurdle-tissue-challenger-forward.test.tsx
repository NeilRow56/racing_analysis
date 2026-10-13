import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { HurdleTissueChallengerSection } from "@/app/racing/research/forward-value/hurdle-tissue-challenger";
import { loadJumpTissueModel, predictJumpTissue, type JumpTissueModel } from "./jump-tissue-model";
import { buildHurdlePair, captureHurdlePairs, emptyHurdlePair, HURDLE_EXCUSE_FEATURES, HURDLE_PAIR_EPOCH,
  hurdlePairLeader, loadHurdlePair, mutateHurdlePair, renderHurdlePairSummary, summarizeHurdlePairs, updateHurdlePairs } from "./hurdle-tissue-challenger-forward";
import { frozenTissueRankOneEdge } from "./tissue-rank-one-edge";
import { raceSoftmax, score, type HistoricalComment } from "../../../scripts/diagnose-independent-tissue-feasibility";
import { workflowSteps } from "../../../scripts/run-research-workflow";
import type { TodayRace, TodayRunner } from "./todays-racing";

const date = "2026-10-13";
const now = new Date(`${date}T08:00:00Z`);
const comments: Map<string, HistoricalComment[]> = new Map([["horse-a", [{ raceId: "prior", raceDate: "2026-09-01", raceDateTime: new Date("2026-09-01T12:00:00Z"), comment: "Hampered" }]]]);
const frozen = await loadJumpTissueModel();
function model(excuse = false): JumpTissueModel {
  const copy = structuredClone(frozen);
  copy.model.means.fill(0);
  copy.model.scales.fill(1);
  copy.model.weights = copy.model.names.map((name) => name === "official_rating" ? 0.01 : excuse && name === "last_hampered" ? 1 : 0);
  return copy;
}
function runner(id: string, rating: number, overrides: Partial<TodayRunner> = {}): TodayRunner {
  return { runnerId: id, runnerSourceId: id, horseId: `horse-${id}`, horseName: id === "a" ? "Alpha" : "Beta",
    saddleclothNumber: id === "a" ? 1 : 2, horseAge: 6, horseSex: null, weight: "11-0", weightCarriedLbs: 154, draw: null,
    jockeyName: "Jockey", trainerId: "trainer", trainerName: "Trainer", officialRating: rating, odds: null, oddsDecimal: null,
    resultStatus: null, finishingPosition: null,
    metrics: { priorRuns: 3, latestJumpSpeedRating: 100, bestJumpSpeedLast3: 102, averageJumpSpeedLast3: 101, daysSinceLastRun: 30 } as TodayRunner["metrics"],
    trainerMetrics: { trainerPriorRuns: 20, trainerPriorWins: 4, trainerPriorWinRate: 0.2 },
    jockeyMetrics: { jockeyPriorRuns: 20, jockeyPriorWins: 3, jockeyPriorWinRate: 0.15 },
    bookmakerQuotes: [{ bookmakerId: 1, bookmakerName: "Book", fractionalOdds: "19/1", decimalOdds: 20 }], ...overrides };
}
function race(overrides: Partial<TodayRace> = {}): TodayRace {
  return { raceId: "race", sourceId: "source-race", scheduledTime: "14:00", raceDateTime: new Date(`${date}T13:00:00Z`),
    courseCountry: "GB", raceName: "Test Hurdle", raceClass: "Class 4", raceType: "Hurdle", raceTypeCode: null,
    distance: "2m", distanceYards: 3520, going: "Soft", surface: "Turf", declaredRunnerCount: 2, actualRunnerCount: null,
    winningTime: null, runners: [runner("a", 100), runner("b", 175)], ...overrides };
}
function capture(excuse = false, card = race()) {
  return buildHurdlePair({ raceDate: date, course: "Teston", race: card, model: model(excuse), commentsByHorse: comments, recordedAt: now })!;
}
function settle(winner: "a" | "b" = "b") {
  return race({ actualRunnerCount: 2, runners: [runner("a", 100, winner === "a" ? { finishingPosition: 1, oddsDecimal: "21" } : { resultStatus: "pulled_up", oddsDecimal: "21" }),
    runner("b", 175, winner === "b" ? { finishingPosition: 1, oddsDecimal: "5" } : { finishingPosition: 2, oddsDecimal: "5" })] });
}

test("fresh Hurdle freezes both full-field books, versions, identities and positive-edge VALUE", () => {
  const card = race(), source = model(true), before = structuredClone(source);
  const control = predictJumpTissue(card, comments, source);
  const pair = buildHurdlePair({ raceDate: date, course: "Teston", race: card, model: source, commentsByHorse: comments, recordedAt: now })!;
  assert.equal(pair.control.modelVersion, "JUMP_TISSUE_V1");
  assert.equal(pair.challengerVersion, "HURDLE_TISSUE_EXCUSE_HALF_SHADOW_V1");
  assert.equal(pair.control.modelHash, source.checksum);
  assert.deepEqual(pair.control.runners.map(({ runnerId, probability, rank }) => ({ runnerId, probability, rank })), control.runners.map(({ runnerId, probability, rank }) => ({ runnerId, probability, rank })));
  assert.deepEqual(source, before);
  assert.deepEqual(predictJumpTissue(card, comments, source), control);
  for (const book of [pair.control, pair.challenger]) {
    assert.ok(Math.abs(book.runners.reduce((sum, runner) => sum + runner.probability!, 0) - 1) < 1e-12);
    assert.equal(book.runners.length, 2);
    assert.equal(book.valueQualified, frozenTissueRankOneEdge(hurdlePairLeader(book).probability, book.raceId, book.top1!, book.prices, null)!.edge > 0);
    assert.equal(book.prices.early!.decimalPrice, 20);
  }
});

test("excuse adjustment exactly halves only standardized family contributions before softmax", () => {
  const source = structuredClone(frozen);
  const pair = buildHurdlePair({ raceDate: date, course: "Teston", race: race(), model: source, commentsByHorse: comments, recordedAt: now })!;
  const scores = pair.control.runners.map((runner) => {
    const inputs = runner.modelInputs!;
    const excuseContribution = source.model.names.reduce((sum, name, i) => sum + (HURDLE_EXCUSE_FEATURES.includes(name) ? source.model.weights[i]! * (inputs[i]! - source.model.means[i]!) / source.model.scales[i]! : 0), 0);
    return score(source.model, inputs) - 0.5 * excuseContribution;
  });
  const expected = raceSoftmax(scores);
  pair.challenger.runners.forEach((runner, i) => assert.ok(Math.abs(runner.probability! - expected[i]!) < 1e-12));
  assert.equal(HURDLE_EXCUSE_FEATURES.length, 30);
  assert.ok(!HURDLE_EXCUSE_FEATURES.includes("last_stayedOn"));
});

test("Chase, NH Flat, unknown jumps and non-jumps are ignored; production Chase remains available", () => {
  for (const type of ["Chase", "NH Flat", "Jump", "Flat"]) {
    const card = race({ raceType: type, raceName: `Test ${type}` });
    assert.equal(capture(true, card), null);
  }
  const chase = race({ raceType: "Chase", raceName: "Test Chase" });
  assert.equal(predictJumpTissue(chase, comments, frozen).predictedRunnerCount, 2);
});

test("agreement and disagreement retain both leaders", () => {
  const agree = capture(), disagree = capture(true);
  assert.equal(agree.classification, "AGREE");
  assert.equal(agree.control.top1, agree.challenger.top1);
  assert.equal(disagree.classification, "DISAGREE");
  assert.equal(disagree.control.top1, "a");
  assert.equal(disagree.challenger.top1, "b");
});

test("rerun freezes inputs, probabilities, ranks, leader price and VALUE despite changed card", () => {
  const pair = capture(true), data = captureHurdlePairs(emptyHurdlePair(), [pair]);
  assert.equal(captureHurdlePairs(data, [capture()]), data);
  const changed = race({ runners: [runner("a", 400, { bookmakerQuotes: [{ bookmakerId: 1, bookmakerName: "Book", fractionalOdds: "1/10", decimalOdds: 1.1 }] }), runner("b", 20)] });
  assert.equal(updateHurdlePairs(data, new Map([["race", changed]]), new Date(`${date}T11:00:00Z`)), data);
});

test("missing first price can be captured later once; forecasts and settlement-only runs cannot qualify", () => {
  const card = race({ runners: [runner("a", 100, { bookmakerQuotes: [], forecastDecimalOdds: 101, forecastOdds: "100/1" }), runner("b", 175, { bookmakerQuotes: [] })] });
  const data = captureHurdlePairs(emptyHurdlePair(), [capture(true, card)]);
  assert.equal(data.races[0]!.control.valueQualified, null);
  assert.equal(updateHurdlePairs(data, new Map([["race", race()]]), new Date(`${date}T09:00:00Z`), true), data);
  const priced = updateHurdlePairs(data, new Map([["race", race()]]), new Date(`${date}T09:00:00Z`));
  assert.equal(priced.races[0]!.control.prices.early!.capturedAt, `${date}T09:00:00.000Z`);
  assert.equal(priced.races[0]!.control.valueQualified, true);
  assert.equal(updateHurdlePairs(priced, new Map([["race", race()]]), new Date(`${date}T10:00:00Z`)), priced);
  const settled = updateHurdlePairs(data, new Map([["race", settle()]]), new Date(`${date}T14:00:00Z`), true);
  assert.equal(settled.races[0]!.control.prices.early, null);
  assert.equal(summarizeHurdlePairs(settled).control.roi, null);
});

test("no past dates or pre-epoch observations can be captured", () => {
  const input = { raceDate: date, course: "Teston", race: race(), model: model(), commentsByHorse: comments, recordedAt: now };
  assert.equal(buildHurdlePair({ ...input, raceDate: "2026-10-12" }), null);
  assert.equal(buildHurdlePair({ ...input, recordedAt: new Date(new Date(HURDLE_PAIR_EPOCH).getTime() - 1) }), null);
});

test("post-off, stale card dates, partial inputs and existing results are rejected", () => {
  assert.equal(buildHurdlePair({ raceDate: date, course: "Teston", race: race(), model: model(), commentsByHorse: comments, recordedAt: new Date(`${date}T14:00:00Z`) }), null);
  assert.equal(capture(false, race({ raceDateTime: new Date("2026-10-12T23:30:00Z") })), null);
  assert.equal(capture(false, race({ raceDateTime: new Date("2026-10-12T12:00:00Z") })), null);
  assert.equal(capture(false, race({ runners: [runner("a", 100, { metrics: null }), runner("b", 175)] })), null);
  assert.equal(capture(false, settle()), null);
  const pair = capture();
  assert.equal(captureHurdlePairs(emptyHurdlePair(), [{ ...pair, firstCapturedAt: "2026-10-11T08:00:00Z" }]).races.length, 0);
});

test("canonical settlement includes non-finisher losses, frozen-price returns and repeat safety", () => {
  const data = captureHurdlePairs(emptyHurdlePair(), [capture(true)]);
  const settled = updateHurdlePairs(data, new Map([["race", settle()]]), new Date(`${date}T14:00:00Z`), true);
  const pair = settled.races[0]!;
  assert.equal(hurdlePairLeader(pair.control).outcome!.won, false);
  assert.equal(hurdlePairLeader(pair.challenger).outcome!.won, true);
  assert.equal(pair.control.selectedPriceProfitLoss.early, -1);
  assert.equal(pair.challenger.selectedPriceProfitLoss.early, 19);
  assert.equal(updateHurdlePairs(settled, new Map([["race", settle("a")]])), settled);
  const summary = summarizeHurdlePairs(settled);
  assert.equal(summary.settled, 1);
  assert.equal(summary.disagreement.challengerWins, 1);
  assert.equal(summary.control.valueProfitLoss, -1);
  assert.equal(summary.challenger.valueRoi, 19);
  assert.equal(summary.longPrice.find((band) => band.model === "challenger" && band.context === "captured" && band.band === ">14/1")!.winners, 1);
  assert.equal(summary.longPrice.find((band) => band.model === "challenger" && band.context === "finalSp" && band.band === "<=14/1")!.winners, 1);
  assert.match(renderHurdlePairSummary(settled), /No automatic promotion/);
});

test("canonical void and dead heat outcomes remain paired and separate", () => {
  const data = captureHurdlePairs(emptyHurdlePair(), [capture(true)]);
  const voidCard = race({ actualRunnerCount: 1, runners: [runner("a", 100, { resultStatus: "non_runner" }), runner("b", 175, { finishingPosition: 1, oddsDecimal: "5" })] });
  const voided = updateHurdlePairs(data, new Map([["race", voidCard]]), new Date(`${date}T14:00:00Z`), true);
  assert.equal(voided.races[0]!.control.selectedPriceProfitLoss.early, 0);
  assert.equal(hurdlePairLeader(voided.races[0]!.control).outcome!.won, null);
  assert.equal(summarizeHurdlePairs(voided).disagreement.voidPairs, 1);
  const deadHeat = race({ actualRunnerCount: 2, runners: [runner("a", 100, { finishingPosition: 1, oddsDecimal: "21" }), runner("b", 175, { finishingPosition: 1, oddsDecimal: "5" })] });
  const tied = updateHurdlePairs(data, new Map([["race", deadHeat]]), new Date(`${date}T14:00:00Z`), true);
  assert.equal(summarizeHurdlePairs(tied).disagreement.bothWin, 1);
  assert.equal(tied.races[0]!.challenger.selectedPriceProfitLoss.early, 9.5);
  const abandoned = race({ runners: [runner("a", 100, { resultStatus: "abandoned" }), runner("b", 175, { resultStatus: "abandoned" })] });
  const cancelled = updateHurdlePairs(data, new Map([["race", abandoned]]), new Date(`${date}T14:00:00Z`), true);
  assert.ok(cancelled.races[0]!.settledAt);
  assert.equal(cancelled.races[0]!.control.selectedPriceProfitLoss.early, 0);
  assert.equal(cancelled.races[0]!.challenger.selectedPriceProfitLoss.early, 0);
  assert.equal(summarizeHurdlePairs(cancelled).control.selections, 0);
});

test("atomic persisted reruns preserve first capture and version, and historical tracker is not a source", async () => {
  const dir = await mkdtemp(join(tmpdir(), "hurdle-pair-"));
  const path = join(dir, "tracker.json");
  try {
    await mutateHurdlePair((data) => captureHurdlePairs(data, [capture(true)]), path);
    const first = await readFile(path, "utf8");
    await mutateHurdlePair((data) => captureHurdlePairs(data, [capture()]), path);
    assert.equal(await readFile(path, "utf8"), first);
    assert.equal((await loadHurdlePair(path)).races.length, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("field changes preserve the captured books but are excluded from paired performance", () => {
  const data = captureHurdlePairs(emptyHurdlePair(), [capture(true)]);
  const changed = race({ actualRunnerCount: 3, runners: [...settle().runners, runner("c", 120, { finishingPosition: 3, oddsDecimal: "10" })] });
  const settled = updateHurdlePairs(data, new Map([["race", changed]]), new Date(`${date}T14:00:00Z`), true);
  assert.equal(settled.races[0]!.control.runners.length, 2);
  assert.equal(settled.races[0]!.control.excludedReason, "field_changed_after_capture");
  const summary = summarizeHurdlePairs(settled);
  assert.equal(summary.settled, 1);
  assert.equal(summary.cleanSettled, 0);
  assert.equal(summary.excluded, 1);
  assert.equal(summary.challenger.selections, 0);
});

test("14/1 boundary is reporting context only, with no VALUE or capture filter", () => {
  for (const price of [15, 16]) {
    const card = race({ runners: race().runners.map((runner) => ({ ...runner, bookmakerQuotes: [{ bookmakerId: 1, bookmakerName: "Book", fractionalOdds: `${price - 1}/1`, decimalOdds: price }] })) });
    const pair = capture(false, card);
    assert.equal(pair.control.valueQualified, true);
    const settled = updateHurdlePairs(captureHurdlePairs(emptyHurdlePair(), [pair]), new Map([["race", settle()]]), new Date(`${date}T14:00:00Z`), true);
    const summary = summarizeHurdlePairs(settled);
    assert.equal(summary.longPrice.find((row) => row.context === "captured" && row.model === "control" && row.band === (price === 15 ? "<=14/1" : ">14/1"))!.selections, 1);
  }
});

test("morning captures after Jump sync; live and after only report or settle", () => {
  const morning = workflowSteps("morning", date).map((step) => step.script);
  assert.ok(morning.indexOf("hurdle-pair:sync") > morning.indexOf("jump-tissue:sync"));
  for (const mode of ["live", "after", "late", "night"] as const) assert.ok(!workflowSteps(mode, date).some((step) => step.script === "hurdle-pair:sync"));
});

test("secondary UI renders agreement compactly, disagreement horses and settled results", () => {
  const agree = capture(), disagree = { ...capture(true), raceId: "other" };
  const data = captureHurdlePairs(emptyHurdlePair(), [agree, disagree]);
  const html = renderToStaticMarkup(<HurdleTissueChallengerSection data={data} date={date} />);
  for (const label of ["HURDLE TISSUE CHALLENGER", "Prospective shadow only", "Jump Tissue V1", "Excuse Half", "Same horse", "Alpha", "Beta", "DISAGREE", "Captured price"]) assert.ok(html.includes(label));
  const settled = updateHurdlePairs(captureHurdlePairs(emptyHurdlePair(), [capture(true)]), new Map([["race", settle()]]), new Date(`${date}T14:00:00Z`), true);
  const resultHtml = renderToStaticMarkup(<HurdleTissueChallengerSection data={settled} date={date} />);
  for (const label of ["C Loss", "H Winner", "£-1.00", "£19.00"]) assert.ok(resultHtml.includes(label));
});
