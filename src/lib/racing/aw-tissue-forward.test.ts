import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AW_TISSUE_ARTIFACT_HASH, AW_TISSUE_IMPLEMENTED_AT, awTissueModelInputs, awTissueProbabilities, awTissueRawInputs, loadAwTissueModel, predictAwTissue } from "./aw-tissue-model";
import {
  awTissueValueAgreement, buildAwTissueRace, captureAwTissueRaces, emptyAwTissueForward,
  currentPositiveAwTissueRankOneEdges, enrichAwTissuePrices, loadAwTissueForward, mutateAwTissueForward, renderAwTissueSummary,
  renderAwTissueToday,
  settleAwTissueRace, summarizeAwTissueForward, updateAwTissueForward,
} from "./aw-tissue-forward";
import { featureValues, predict as stage1Predict, type Example } from "../../../scripts/diagnose-aw-tissue-stage1";
import { FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION, type ForwardValuePriceSnapshot, type ForwardValueRecord } from "./forward-value";
import type { HistoricalTargetRunnerMetricsRow } from "./historical-target-metrics";
import type { HorseMetricsAsOf } from "./horse-metrics";
import type { SportingLifeCurrentPrice, TodayRace, TodayRunner } from "./todays-racing";

const model = await loadAwTissueModel();
const now = new Date(AW_TISSUE_IMPLEMENTED_AT);
const off = new Date(now.getTime() + 240 * 60_000);
const starts = new Map([["a", 2], ["b", 0], ["c", 3]]);

function runner(runnerId: string, speed: number | null): TodayRunner {
  return {
    runnerId, runnerSourceId: runnerId, horseId: runnerId, horseName: runnerId.toUpperCase(), saddleclothNumber: null,
    horseAge: 4, horseSex: null, weight: null, weightCarriedLbs: 133, draw: 2,
    jockeyName: "Jockey", trainerId: null, trainerName: "Trainer", officialRating: 70,
    odds: "1/100", oddsDecimal: "1.01", forecastOdds: "6/1", forecastDecimalOdds: 7,
    resultStatus: null, finishingPosition: null,
    trainerMetrics: { trainerPriorWinRate: 12, trainerPriorRuns: 100, trainerPriorWins: 12 },
    jockeyMetrics: { jockeyPriorWinRate: 11, jockeyPriorRuns: 100, jockeyPriorWins: 11 },
    metrics: {
      averageAwSpeedLast3: speed, latestAwSpeedRating: speed, bestAwSpeedLast3: speed,
      averageAwPerformanceLast3: speed === null ? null : speed - 40, latestAwPerformanceRating: speed === null ? null : speed - 40,
      daysSinceLastRun: 14, priorAwStarts: 999,
    } as HorseMetricsAsOf,
    bookmakerQuotes: [3, 5, 9].map((decimalOdds, i) => ({ bookmakerId: i, bookmakerName: `Book ${i}`, fractionalOdds: `${decimalOdds - 1}/1`, decimalOdds })),
  };
}
function race(): TodayRace {
  return {
    raceId: "race", sourceId: "source-race", scheduledTime: "10:16", raceDateTime: off, courseCountry: "GB",
    raceName: "Handicap", raceClass: "Class 5", raceType: "Handicap", raceTypeCode: null,
    distance: "1m", distanceYards: 1760, going: "Standard", surface: "ALLWEATHER", declaredRunnerCount: 3,
    actualRunnerCount: 3, winningTime: null, runners: [runner("a", 105), runner("b", null), runner("c", 80)],
  };
}
function captured() { return buildAwTissueRace(race(), "Wolverhampton", AW_TISSUE_IMPLEMENTED_AT.slice(0, 10), starts, model, now)!; }
function finished(): TodayRace {
  const result = race();
  result.runners.forEach((r, i) => { r.resultStatus = "finished"; r.finishingPosition = i + 1; r.oddsDecimal = "5"; });
  return result;
}

describe("frozen AW Tissue and prospective tracking", () => {
  test("loads the exact frozen Stage 1 artifact and reproduces its feature vector and probabilities", () => {
    assert.equal(model.checksum, AW_TISSUE_ARTIFACT_HASH);
    assert.equal(model.model.weights[0], 0.08256197548687447);
    const r = race();
    const examples = r.runners.map((runner): Example => ({
      raceId: r.raceId, won: runner.runnerId === "a", priorAwStarts: starts.get(runner.runnerId)!, priorComments: [], probabilities: {},
      row: { features: {
        targetRunnerId: runner.runnerId, averageAwSpeedLast3: runner.metrics!.averageAwSpeedLast3,
        trainerPriorWinRate: runner.trainerMetrics!.trainerPriorWinRate, jockeyPriorWinRate: runner.jockeyMetrics!.jockeyPriorWinRate,
        declaredRunnerCount: r.declaredRunnerCount, raceClass: r.raceClass, raceName: r.raceName, raceType: r.raceType, raceTypeCode: r.raceTypeCode,
        distanceYards: r.distanceYards, latestAwSpeedRating: runner.metrics!.latestAwSpeedRating, bestAwSpeedLast3: runner.metrics!.bestAwSpeedLast3,
        averagePerformanceLast3: runner.metrics!.averageAwPerformanceLast3, latestPerformanceRating: runner.metrics!.latestAwPerformanceRating,
        officialRating: runner.officialRating, horseAge: runner.horseAge, draw: runner.draw, daysSinceLastRun: runner.metrics!.daysSinceLastRun,
      }, outcome: {} } as HistoricalTargetRunnerMetricsRow,
    }));
    const live = predictAwTissue(r, starts, model);
    examples.forEach((e, i) => {
      const numeric = featureValues(e, "AW-T0");
      assert.deepEqual(numeric.slice(0, 16), live.runners[i]!.rawInputs);
      assert.deepEqual(numeric.slice(16), live.runners[i]!.modelInputs!.slice(16));
    });
    stage1Predict(examples, "AW-T0", model.model);
    examples.forEach((e, i) => assert.equal(e.probabilities["AW-T0"], live.runners[i]!.probability));
  });

  test("is deterministic, independent of prices and ranks an exact tied field by UUID", () => {
    const r = race();
    const first = predictAwTissue(r, starts, model);
    r.runners.forEach((runner) => { runner.oddsDecimal = "1001"; runner.officialRating ??= 0; runner.bookmakerQuotes = []; });
    assert.deepEqual(predictAwTissue(r, starts, model), first);
    assert.ok(Math.abs(first.runners.reduce((sum, runner) => sum + runner.probability!, 0) - 1) < 1e-12);
    const same = runner("a", 90);
    r.runners = ["c", "a", "b"].map((runnerId) => ({ ...same, runnerId }));
    const tied = predictAwTissue(r, new Map([["a", 2], ["b", 2], ["c", 2]]), model);
    assert.deepEqual(tied.runners.map((r) => [r.runnerId, r.rank]), [["c", 3], ["a", 1], ["b", 2]]);
    assert.deepEqual(tied.runners.map((r) => r.probability), [1 / 3, 1 / 3, 1 / 3]);
  });

  test("zero history uses recorded nulls and the frozen imputation; unknown counts do not become zero", () => {
    const r = race(), book = predictAwTissue(r, starts, model), zero = book.runners.find((p) => p.runnerId === "b")!;
    assert.equal(zero.zeroHistoryRunner, true);
    assert.equal(zero.rawInputs[0], null);
    assert.equal(zero.modelInputs![0], model.model.means[0]);
    assert.equal(zero.modelInputs![16], 1);
    assert.equal(zero.predictionAvailable, true);
    const unavailable = predictAwTissue(r, new Map([["a", 2], ["c", 3]]), model);
    assert.equal(unavailable.predictionCoverage, 0);
    assert.equal(unavailable.runners.find((p) => p.runnerId === "b")!.zeroHistoryRunner, null);
    assert.equal(unavailable.runners.find((p) => p.runnerId === "b")!.unavailableReason, "prior_aw_starts_unavailable");
  });

  test("AW-D coverage failure does not block the Tissue field", () => {
    const r = race(); r.runners[2]!.metrics!.averageAwSpeedLast3 = null;
    const record = buildAwTissueRace(r, "Wolverhampton", now.toISOString().slice(0, 10), starts, model, now)!;
    assert.equal(record.awDCoverage.ratingCoverageStatus, "insufficient_coverage");
    assert.equal(record.awDLeader, null);
    assert.equal(record.predictedRunnerCount, 3);
    assert.equal(record.predictionCoverage, 1);
  });

  test("captures only after epoch and strictly before off; historical/result cards cannot be backfilled", () => {
    assert.ok(captured());
    assert.equal(buildAwTissueRace(race(), "Wolverhampton", "2026-10-02", starts, model, new Date(now.getTime() - 1)), null);
    assert.equal(buildAwTissueRace(race(), "Wolverhampton", "2026-10-02", starts, model, off), null);
    assert.equal(buildAwTissueRace(finished(), "Wolverhampton", "2026-10-02", starts, model, now), null);
    const record = captured();
    let data = captureAwTissueRaces(emptyAwTissueForward(), [record, record]);
    assert.equal(data.races.length, 1);
    data = captureAwTissueRaces(data, [{ ...record, recordedAt: off.toISOString(), runners: [] }]);
    assert.equal(data.races[0], record);
    assert.equal(captureAwTissueRaces(emptyAwTissueForward(), [{ ...record, recordedPreRace: false }]).races.length, 0);
  });

  test("median bookmaker snapshots keep forecast/best separate and cannot fill retrospectively", () => {
    const record = captured(), r = race();
    const priced = enrichAwTissuePrices(record, r, now);
    assert.equal(priced.prices.early!.decimalPrice, 5);
    assert.equal(priced.prices.early!.bestBookmakerPriceDecimal, 9);
    assert.equal(priced.prices.early!.forecastDecimalPrice, 7);
    assert.equal(priced.prices.early!.bookmakerQuoteCount, 3);
    const leader = record.runners.find((p) => p.runnerId === record.top1)!;
    assert.equal(priced.prices.early!.ratingEdgePercentagePoints, (leader.probability! - .2) * 100);
    const t180 = enrichAwTissuePrices(priced, r, new Date(off.getTime() - 180 * 60_000));
    const t60 = enrichAwTissuePrices(t180, r, new Date(off.getTime() - 60 * 60_000));
    assert.ok(t180.prices.t180); assert.ok(t60.prices.t60);
    assert.deepEqual(t60.runners, record.runners);
    assert.equal(enrichAwTissuePrices(t60, r, off), t60);
    r.runners.forEach((runner) => { runner.bookmakerQuotes = []; });
    assert.equal(enrichAwTissuePrices(record, r, now), record);
  });

  test("today shortlist includes positive AW Tissue rank-1 edge with correct pp calculation", () => {
    const record = withFrozenPrice(withRankOneProbability(captured(), 0.263), 5);
    const output = renderAwTissueToday({ ...emptyAwTissueForward(), races: [record] }, record.raceDate, [
      currentPrice(record, "4/1", 5),
    ]);

    assert.match(output, /Current positive-edge AW Tissue rank-1 horses/);
    assert.match(output, /10:16 Wolverhampton \| [A-Z]/);
    assert.match(output, /Tissue 26\.3% \| Qualified 5\.00 \(EARLY\) \| Implied 20\.0% \| Edge \+6\.3pp \| Quotes 3/);
    assert.match(output, /Positive-edge rank-1 horses: 1 \/ comparable races 1/);
  });

  test("today shortlist displays bookmaker quote count from the median market row", () => {
    const record = withFrozenPrice(withRankOneProbability(captured(), 0.263), 5, { bookmakerQuoteCount: 7 });
    const output = renderAwTissueToday({ ...emptyAwTissueForward(), races: [record] }, record.raceDate, [
      currentPrice(record, "4/1", 5, { bookmakerQuoteCount: 7 }),
    ]);

    assert.match(output, /Tissue 26\.3% \| Qualified 5\.00 \(EARLY\) \| Implied 20\.0% \| Edge \+6\.3pp \| Quotes 7/);
  });

  test("today shortlist flags large positive edges at ten percentage points", () => {
    const record = withFrozenPrice(withRankOneProbability(captured(), 0.3), 5);
    const output = renderAwTissueToday({ ...emptyAwTissueForward(), races: [record] }, record.raceDate, [
      currentPrice(record, "4/1", 5),
    ]);

    assert.match(output, /Tissue 30\.0% \| Qualified 5\.00 \(EARLY\) \| Implied 20\.0% \| Edge \+10\.0pp \| Quotes 3 \| LARGE/);
  });

  test("today shortlist does not flag positive edges below ten percentage points", () => {
    const record = withFrozenPrice(withRankOneProbability(captured(), 0.299), 5);
    const output = renderAwTissueToday({ ...emptyAwTissueForward(), races: [record] }, record.raceDate, [
      currentPrice(record, "4/1", 5),
    ]);

    assert.match(output, /Tissue 29\.9% \| Qualified 5\.00 \(EARLY\) \| Implied 20\.0% \| Edge \+9\.9pp \| Quotes 3/);
    assert.doesNotMatch(output, /\| LARGE/);
  });

  test("today shortlist excludes zero and negative AW Tissue rank-1 edges", () => {
    const zero = withFrozenPrice(withRankOneProbability({ ...captured(), raceId: "zero" }, 0.2), 5);
    const negative = withFrozenPrice(withRankOneProbability({ ...captured(), raceId: "negative", currentOffAt: new Date(off.getTime() + 60_000).toISOString() }, 0.19), 5);
    const result = currentPositiveAwTissueRankOneEdges([zero, negative], [
      currentPrice(zero, "4/1", 5),
      currentPrice(negative, "4/1", 5),
    ]);

    assert.equal(result.comparableRaces, 2);
    assert.equal(result.selections.length, 0);
  });

  test("today shortlist excludes missing bookmaker median and never uses forecast price", () => {
    const record = withRankOneProbability(captured(), 0.25);
    const output = renderAwTissueToday({ ...emptyAwTissueForward(), races: [record] }, record.raceDate, [
      currentPrice(record, null, null, { forecastPrice: "33/1", forecastDecimalOdds: 34, bookmakerQuoteCount: 0 }),
    ]);

    assert.match(output, /Current positive-edge AW Tissue rank-1 horses\nNone/);
    assert.match(output, /Positive-edge rank-1 horses: 0 \/ comparable races 0/);
    assert.doesNotMatch(output, /\+22\.1pp|33\/1/);
  });

  test("today shortlist uses frozen median bookmaker price rather than forecast or later current price", () => {
    const record = withFrozenPrice(withRankOneProbability(captured(), 0.25), 5, { forecastPrice: "33/1", forecastDecimalPrice: 34 });
    const output = renderAwTissueToday({ ...emptyAwTissueForward(), races: [record] }, record.raceDate, [
      currentPrice(record, "50/1", 51, { forecastPrice: "33/1", forecastDecimalOdds: 34 }),
    ]);

    assert.match(output, /Tissue 25\.0% \| Qualified 5\.00 \(EARLY\) \| Implied 20\.0% \| Edge \+5\.0pp \| Quotes 3 \| Latest 51\.00/);
    assert.doesNotMatch(output, /\+22\.1pp|33\/1/);
  });

  test("incomplete result fields remain pending; non-finishers lose and non-runners void", () => {
    const record = captured(), result = finished();
    result.runners[2]!.finishingPosition = null;
    assert.equal(settleAwTissueRace(record, result), record);
    result.runners[2]!.resultStatus = "pulled_up";
    result.runners[1]!.finishingPosition = null; result.runners[1]!.resultStatus = "non_runner";
    const settled = settleAwTissueRace(record, result, new Date(off.getTime() + 60000));
    assert.ok(settled.settledAt);
    assert.equal(settled.runners[0]!.outcome!.finalSpProfitLoss, 4);
    assert.equal(settled.runners[1]!.outcome!.won, null);
    assert.equal(settled.runners[1]!.outcome!.finalSpProfitLoss, null);
    assert.equal(settled.runners[2]!.outcome!.won, false);
    assert.equal(settled.runners[2]!.outcome!.finalSpProfitLoss, -1);
    assert.deepEqual(settled.runners.map((p) => [p.probability, p.rank, p.rawInputs]), record.runners.map((p) => [p.probability, p.rank, p.rawInputs]));
    assert.equal(settleAwTissueRace(settled, result), settled);
  });

  test("canonical dead heats settle both winners with the canonical divisor", () => {
    const result = finished(); result.runners[1]!.finishingPosition = 1;
    const settled = settleAwTissueRace(captured(), result);
    assert.deepEqual(settled.winners, ["a", "b"]);
    assert.equal(settled.runners[0]!.outcome!.deadHeatDivisor, 2);
    assert.equal(settled.runners[0]!.outcome!.finalSpProfitLoss, 2);
    const summary = summarizeAwTissueForward({ ...emptyAwTissueForward(), races: [settled] });
    assert.ok(Number.isFinite(summary.logLoss)); assert.ok(Number.isFinite(summary.brier));
    const priced = enrichAwTissuePrices(captured(), race(), now);
    const pricedSettled = settleAwTissueRace(priced, result);
    const leader = pricedSettled.runners.find((r) => r.runnerId === pricedSettled.top1)!;
    assert.equal(pricedSettled.selectedPriceProfitLoss.early, leader.outcome!.won ? 2 : -1);
    assert.equal(pricedSettled.selectedPriceProfitLoss.bestEarly, leader.outcome!.won ? 4 : -1);
  });

  test("summary and AW-D comparison use only common clean settled races", () => {
    const record = captured();
    const result = finished();
    const settled = settleAwTissueRace({ ...record, awDLeader: record.top1 === "c" ? "a" : "c" }, result);
    const summary = summarizeAwTissueForward({ ...emptyAwTissueForward(), races: [settled, { ...settled, raceId: "post", recordedPreRace: false }] });
    assert.equal(summary.commonRaces, 1); assert.equal(summary.excluded, 1);
    assert.equal(summary.comparison[1]!.races, 1);
    assert.equal(summary.calibration.reduce((n, band) => n + band.runners, 0), 3);
    assert.match(renderAwTissueSummary(emptyAwTissueForward()), /Log loss: -/);
    const leader = record.runners.find((r) => r.runnerId === record.top1)!;
    const raw = awTissueRawInputs(race(), race().runners[0]!, 2);
    assert.ok(awTissueProbabilities([awTissueModelInputs(raw, model), leader.modelInputs!], model).every(Number.isFinite));
  });

  test("Forward Value agreement cannot attach legacy observations or mix forecast rows", () => {
    const record = enrichAwTissuePrices(captured(), race(), now);
    const rating: ForwardValueRecord = { family: "aw", raceId: record.raceId, recordedAt: record.recordedAt, recordedPreRace: true, raceDateTime: record.scheduledOffAt, settledAt: null,
      captureMode: "live_sync", phase2ExclusionReason: null, calibratedProbability: .3, capturedDecimalOdds: 5, capturedMarketProbability: .2, priceCapturedAt: record.recordedAt,
      marketPriceBasisVersion: FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION, leaderRunnerId: record.top1!, earlyPriceSnapshot: record.prices.early,
      raceDate: record.raceDate, raceTime: record.scheduledTime, course: record.course, raceName: record.raceName,
      ratingVersion: "AW_D_V1", calibrationVersion: "test", leaderHorseName: "Leader", leaderRank: 1, leaderScore: 1,
      leaderGap: 1, capturedPrice: null, edgePercentagePoints: 10, edgeBand: ">5-10pp", marketFavouriteRunnerIds: [],
      marketFavouriteHorseNames: [], agreesWithMarketFavourite: null, tissueRunnerId: null, tissueHorseName: null,
      tissueProbability: null, tissueAgreesWithTpr: null, winnerRunnerIds: [], leaderResultStatus: null, leaderFinishingPosition: null,
      leaderWon: null, finalSp: null, grossReturn: null, profitLoss: null,
    };
    const data = { ...emptyAwTissueForward(), races: [record] };
    assert.equal(awTissueValueAgreement(data, [rating]).comparable, 1);
    assert.equal(awTissueValueAgreement(data, [{ ...rating, recordedAt: "2026-09-30T10:00:00Z" }]).comparable, 0);
    assert.equal(awTissueValueAgreement(data, [{ ...rating, marketPriceBasisVersion: undefined }]).comparable, 0);
  });

  test("repeated sync is idempotent and concurrent mutations preserve captured races", async () => {
    const dir = await mkdtemp(join(tmpdir(), "aw-tissue-test-")), path = join(dir, "tracker.json");
    try {
      const one = captured(), two = { ...captured(), raceId: "other" };
      await Promise.all([mutateAwTissueForward((data) => captureAwTissueRaces(data, [one]), path), mutateAwTissueForward((data) => captureAwTissueRaces(data, [two]), path)]);
      assert.equal((await loadAwTissueForward(path)).races.length, 2);
      const before = await readFile(path, "utf8");
      await mutateAwTissueForward((data) => captureAwTissueRaces(updateAwTissueForward(data, new Map(), now), [one]), path);
      assert.equal(await readFile(path, "utf8"), before);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});

function withRankOneProbability(record: ReturnType<typeof captured>, probability: number): ReturnType<typeof captured> {
  return {
    ...record,
    runners: record.runners.map((runner) => runner.runnerId === record.top1 ? { ...runner, probability } : runner),
  };
}

function withFrozenPrice(
  record: ReturnType<typeof captured>,
  decimalPrice: number,
  overrides: Partial<ForwardValuePriceSnapshot> = {},
): ReturnType<typeof captured> {
  const leader = record.runners.find((runner) => runner.runnerId === record.top1)!;
  const snapshot: ForwardValuePriceSnapshot = {
    price: null,
    decimalPrice,
    impliedProbability: 1 / decimalPrice,
    capturedAt: now.toISOString(),
    minutesBeforeScheduledOff: (off.getTime() - now.getTime()) / 60_000,
    ratingProbability: leader.probability!,
    ratingEdgePercentagePoints: (leader.probability! - 1 / decimalPrice) * 100,
    marketPriceBasisVersion: FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION,
    bookmakerQuoteCount: 3,
    bookmakerQuotes: [],
    medianBookmakerPriceDecimal: decimalPrice,
    medianBookmakerImpliedProbability: 1 / decimalPrice,
    bestBookmakerPriceDecimal: decimalPrice,
    bestBookmakerPriceFractional: null,
    bestBookmakerName: null,
    forecastPrice: null,
    forecastDecimalPrice: null,
    ...overrides,
  };
  return { ...record, prices: { ...record.prices, early: snapshot } };
}

function currentPrice(
  record: ReturnType<typeof captured>,
  marketPrice: string | null,
  marketDecimalOdds: number | null,
  overrides: Partial<SportingLifeCurrentPrice> = {},
): SportingLifeCurrentPrice {
  return {
    raceId: record.raceId,
    runnerId: record.top1!,
    marketPrice,
    marketDecimalOdds,
    bookmakerQuoteCount: marketDecimalOdds === null ? 0 : 3,
    forecastPrice: null,
    forecastDecimalOdds: null,
    displayRaceTime: "10:16",
    ...overrides,
  };
}
