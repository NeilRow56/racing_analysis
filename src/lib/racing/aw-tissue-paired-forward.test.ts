import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  AW_TISSUE_PAIRED_FORWARD_EPOCH,
  buildAwTissuePairedRace,
  captureAwTissuePairedRaces,
  emptyAwTissuePairedForward,
  enrichAwTissuePairedPrices,
  renderAwTissuePairedSummary,
  settleAwTissuePairedRace,
  structuralAwFeatureVector,
  summarizeAwTissuePairedForward,
  updateAwTissuePairedForward,
  type AwTissuePairedRace,
} from "./aw-tissue-paired-forward";
import {
  AW_TISSUE_IMPLEMENTED_AT,
  AW_TISSUE_SCHEMA,
  AW_TISSUE_VERSION,
  AW_TISSUE_VECTOR_NAMES,
  type AwTissueModel,
} from "./aw-tissue-model";
import { COMMENT_FEATURE_NAMES, NUMERIC_FEATURES, type HistoricalComment } from "../../../scripts/diagnose-independent-tissue-feasibility";
import { TISSUE_V2_CONFIG, type FrozenTissueModel } from "./tissue-forward";
import type { HorseMetricsAsOf } from "./horse-metrics";
import type { TodayRace, TodayRunner } from "./todays-racing";
import { buildAwTurfChallengerReport, renderAwTurfChallengerToday } from "./aw-turf-challenger-report";
import { currentDayProspectiveCapture, withoutStaleBookmakerQuotes } from "./current-day-sync";

const recordedAt = new Date("2026-10-10T08:00:00.000Z");
const off = new Date("2026-10-10T14:00:00.000Z");
const starts = new Map([["a", 1], ["b", 1], ["c", 1]]);
const comments = new Map<string, HistoricalComment[]>();

const awModel: AwTissueModel = {
  version: AW_TISSUE_VERSION,
  featureSchemaVersion: AW_TISSUE_SCHEMA,
  implementedAt: AW_TISSUE_IMPLEMENTED_AT,
  stage1ArtifactHash: "test",
  checksum: "aw-test",
  candidate: "AW-T0",
  trainingPeriod: { from: "2025-01-01", to: "2025-12-31", races: 1 },
  dependencies: { awSpeed: "test", performance: "test", settlement: "canonical_settlement_v2" },
  model: {
    names: [...AW_TISSUE_VECTOR_NAMES],
    means: Array(AW_TISSUE_VECTOR_NAMES.length).fill(0),
    scales: Array(AW_TISSUE_VECTOR_NAMES.length).fill(1),
    weights: AW_TISSUE_VECTOR_NAMES.map((name) => name === "avg_l3_aw_speed" ? 1 : 0),
  },
};

const turfModel: FrozenTissueModel = {
  version: TISSUE_V2_CONFIG.modelVersion,
  trainedAt: "2026-09-19T17:35:53.410Z",
  trainingWindow: { from: "2025-01-01", to: "2025-12-31" },
  checksum: "turf-test",
  model: {
    names: [...NUMERIC_FEATURES.map(([name]) => name), ...NUMERIC_FEATURES.map(([name]) => `${name}_missing`), ...COMMENT_FEATURE_NAMES],
    means: Array(NUMERIC_FEATURES.length * 2 + COMMENT_FEATURE_NAMES.length).fill(0),
    scales: Array(NUMERIC_FEATURES.length * 2 + COMMENT_FEATURE_NAMES.length).fill(1),
    weights: [...NUMERIC_FEATURES.map(([name]) => name === "latest_turf_speed" ? 0.02 : 0), ...Array(NUMERIC_FEATURES.length + COMMENT_FEATURE_NAMES.length).fill(0)],
  },
};

describe("AW Tissue paired prospective tracker", () => {
  test("morning existing-card fallback preserves prices without fabricating a later snapshot", () => {
    const previous = process.env.RESEARCH_EXISTING_CARDS_DATE;
    const date = "2026-10-10";
    const race = sampleRace("disagree");
    const record = enrichAwTissuePairedPrices(build("disagree")!, race, new Date("2026-10-10T11:00:00.000Z"));
    const before = JSON.stringify(race);
    try {
      process.env.RESEARCH_EXISTING_CARDS_DATE = date;
      const capture = currentDayProspectiveCapture({ status: "ok", raceDate: date, displayDate: date, refreshedAt: recordedAt, sportingLifeCurrentCardVersion: "reconciled_v1", meetings: [{ courseId: "course", courseSourceId: "course", courseName: "Wolverhampton", country: "GB", order: 0, races: [race] }] });
      assert.equal(capture.skipped, false);
      const storedRace = capture.meetings[0]!.races[0]!;
      assert.deepEqual(storedRace.runners.map((runner) => runner.metrics), race.runners.map((runner) => runner.metrics));
      assert.ok(storedRace.runners.every((runner) => !runner.bookmakerQuotes?.length && runner.oddsDecimal === null));
      const noRefresh = enrichAwTissuePairedPrices(record, storedRace, new Date("2026-10-10T13:15:00.000Z"));
      assert.strictEqual(noRefresh, record);
      assert.equal(record.prices.finalPreRace.turfArch, null);
      assert.equal(JSON.stringify(race), before);
      const pendingRunner = withoutStaleBookmakerQuotes({ ...race.runners[0]!, raceDate: date });
      assert.deepEqual(pendingRunner.bookmakerQuotes, []);
      assert.equal(pendingRunner.oddsDecimal, race.runners[0]!.oddsDecimal);
      const completed = finishedRace("b");
      const safeResult = { ...completed, runners: completed.runners.map((runner) => withoutStaleBookmakerQuotes({ ...runner, raceDate: date })) };
      assert.deepEqual(settleAwTissuePairedRace(record, safeResult, new Date("2026-10-10T15:00:00.000Z")), settleAwTissuePairedRace(record, completed, new Date("2026-10-10T15:00:00.000Z")));
    } finally {
      if (previous === undefined) delete process.env.RESEARCH_EXISTING_CARDS_DATE;
      else process.env.RESEARCH_EXISTING_CARDS_DATE = previous;
    }
  });

  test("challenger reports only eligible daily captures, frozen prices and independent VALUE flags", () => {
    const record = enrichAwTissuePairedPrices(build("disagree")!, sampleRace("disagree", { aPrice: 5, bPrice: 5 }), new Date("2026-10-10T11:00:00.000Z"));
    const data = { ...emptyAwTissuePairedForward(), races: [
      record,
      { ...build("agree")!, raceId: "agree" },
      { ...record, raceId: "excluded", excludedReason: "field_changed_after_capture" },
      { ...record, raceId: "other-day", raceDate: "2026-10-11" },
    ] };
    const before = JSON.stringify(data);
    const report = buildAwTurfChallengerReport(data, "2026-10-10", [{ raceId: record.raceId, runnerId: "b", marketPrice: "7/1", marketDecimalOdds: 8, bookmakerQuoteCount: 1, forecastPrice: null, forecastDecimalOdds: null, displayRaceTime: "15:00" }]);
    assert.deepEqual(report.summary, { tracked: 2, agree: 1, disagree: 1, value: 1, settled: 0, winners: 0 });
    const challenger = report.rows.find((row) => row.raceId === record.raceId)!;
    const agreeing = report.rows.find((row) => row.raceId === "agree")!;
    assert.equal(challenger.horse, "B");
    assert.equal(challenger.awProbability, record.awTissue.rank1Probability);
    assert.equal(challenger.marketProbability, .2);
    assert.equal(challenger.capturedPrice, 5);
    assert.equal(challenger.latestPrice, 8);
    assert.equal(agreeing.capturedPrice, null);
    assert.equal(agreeing.value, false);
    assert.equal(JSON.stringify(data), before);
    const text = renderAwTurfChallengerToday(data, "2026-10-10");
    assert.match(text, /AW TURF-ARCHITECTURE CHALLENGER/);
    assert.match(text, /time \| course \| challenger \| challenger p \| AW Tissue #1 \| AW p \| agree\/disagree/);
    assert.match(text, /15:00 \| Wolverhampton \| B \| [\d.]+% \| A \| [\d.]+% \| DISAGREE/);
    assert.match(text, /15:00 \| Wolverhampton \| A \| [\d.]+% \| AGREE/);
    assert.doesNotMatch(text, /15:00 \| Wolverhampton \| A \| [\d.]+% \| A \| [\d.]+% \| AGREE/);
    assert.equal(text.split("\n").length, 5);
    assert.match(renderAwTurfChallengerToday(data, "2026-10-12"), /No challenger selections/);
  });

  test("challenger reporting reflects live settlement without creating captures or changing prices", () => {
    const record = enrichAwTissuePairedPrices(build("disagree")!, sampleRace("disagree", { bPrice: 5 }), new Date("2026-10-10T11:00:00.000Z"));
    const original = { ...emptyAwTissuePairedForward(), races: [record] };
    const results = new Map([[record.raceId, finishedRace("b")], ["untracked", { ...finishedRace("a"), raceId: "untracked" }]]);
    const live = updateAwTissuePairedForward(original, results, new Date("2026-10-10T15:00:00.000Z"));
    const after = updateAwTissuePairedForward(live, results, new Date("2026-10-11T08:00:00.000Z"));
    assert.equal(after.races.length, 1);
    assert.deepEqual(after.races[0]!.prices.firstAvailable, record.prices.firstAvailable);
    assert.deepEqual(after, live);
    const report = buildAwTurfChallengerReport(after, "2026-10-10");
    assert.equal(report.rows[0]!.result, "Winner");
    assert.equal(report.summary.settled, 1);
    assert.equal(report.summary.winners, 1);
    assert.match(renderAwTurfChallengerToday(after, "2026-10-10"), /Settled: 1 \| Winners: 1/);
    const lost = buildAwTurfChallengerReport({ ...original, races: [settleWithPrice(record, "a", 5, 5)] }, "2026-10-10");
    assert.match(lost.rows[0]!.result, /Finished/);
    assert.equal(lost.summary.winners, 0);
  });

  test("starts from a fresh empty epoch and rejects historical backfill", () => {
    const empty = emptyAwTissuePairedForward();
    assert.equal(empty.version, "AW_TISSUE_PAIRED_FORWARD_V1");
    assert.equal(empty.epoch, AW_TISSUE_PAIRED_FORWARD_EPOCH);
    assert.deepEqual(empty.races, []);
    assert.equal(build("disagree", new Date("2026-10-09T23:59:59.999Z")), null);
    assert.equal(build("disagree", off), null);
    const result = finishedRace("a");
    assert.equal(buildAwTissuePairedRace({ raceDate: "2026-10-10", course: "Wolverhampton", race: result, awModel, turfModel, priorAwStarts: starts, commentsByHorse: comments, recordedAt }), null);
  });

  test("scores both frozen models on the same AW race and preserves structural AW speed mapping", () => {
    const race = sampleRace("disagree");
    const vector = structuralAwFeatureVector(race, race.runners[1]!);
    assert.equal(vector[NUMERIC_FEATURES.findIndex(([name]) => name === "latest_turf_speed")], 90);
    assert.equal(vector[NUMERIC_FEATURES.findIndex(([name]) => name === "best_l3_turf_speed")], 90);
    assert.equal(vector[NUMERIC_FEATURES.findIndex(([name]) => name === "avg_l3_turf_speed")], 50);
    const record = buildAwTissuePairedRace({ raceDate: "2026-10-10", course: "Wolverhampton", race, awModel, turfModel, priorAwStarts: starts, commentsByHorse: comments, recordedAt })!;
    assert.equal(record.runners.length, 3);
    assert.equal(record.awTissue.rank1RunnerId, "a");
    assert.equal(record.turfArch.rank1RunnerId, "b");
    assert.ok(Math.abs(record.awTissue.probabilities.reduce((sum, runner) => sum + runner.probability, 0) - 1) < 1e-12);
    assert.ok(Math.abs(record.turfArch.probabilities.reduce((sum, runner) => sum + runner.probability, 0) - 1) < 1e-12);
  });

  test("classifies rank agreement and disagreement", () => {
    assert.equal(build("agree")!.classification, "AGREE");
    assert.equal(build("agree")!.rank1Agreement, true);
    assert.equal(build("disagree")!.classification, "DISAGREE");
    assert.equal(build("disagree")!.rank1Agreement, false);
  });

  test("duplicate capture is safe and first-capture model values are frozen", () => {
    const first = build("disagree")!;
    const changed = build("agree")!;
    changed.raceId = first.raceId;
    let data = captureAwTissuePairedRaces(emptyAwTissuePairedForward(), [first]);
    data = captureAwTissuePairedRaces(data, [changed]);
    assert.equal(data.races.length, 1);
    assert.equal(data.races[0]!.classification, "DISAGREE");
    assert.equal(data.races[0]!.turfArch.rank1RunnerId, "b");
  });

  test("applies independent value flags without changing production value behavior", () => {
    const record = build("disagree")!;
    const priced = enrichAwTissuePairedPrices(record, sampleRace("disagree", { aPrice: 5, bPrice: 1.1 }), new Date("2026-10-10T11:00:00.000Z"));
    assert.equal(priced.awTissue.valueQualified, true);
    assert.equal(priced.turfArch.valueQualified, false);
    assert.equal(priced.valueBucket, "AW_ONLY_VALUE");
    assert.equal(priced.prices.firstAvailable.awTissue?.medianDecimalPrice, 5);
  });

  test("canonical settlement records winners, P/L and duplicate sync idempotence", () => {
    const record = enrichAwTissuePairedPrices(build("disagree")!, sampleRace("disagree", { aPrice: 5, bPrice: 2 }), new Date("2026-10-10T11:00:00.000Z"));
    const settled = settleAwTissuePairedRace(record, finishedRace("a"), new Date("2026-10-10T15:00:00.000Z"));
    assert.deepEqual(settled.winners, ["a"]);
    assert.equal(settled.awTissue.probabilities.find((runner) => runner.runnerId === "a")!.outcome?.won, true);
    assert.equal(settled.turfArch.probabilities.find((runner) => runner.runnerId === "b")!.outcome?.won, false);
    assert.equal(settled.awTissue.selectedPriceProfitLoss, 4);
    const second = updateAwTissuePairedForward({ ...emptyAwTissuePairedForward(), races: [settled] }, new Map([[settled.raceId, finishedRace("a")]]), new Date("2026-10-10T16:00:00.000Z"));
    assert.equal(JSON.stringify(second.races[0]), JSON.stringify(settled));
  });

  test("summary comparisons include disagreement and value performance", () => {
    const awWin = settleWithPrice(build("disagree")!, "a", 5, 1.1);
    const turfWin = settleWithPrice({ ...build("disagree")!, raceId: "race-two" }, "b", 5, 5);
    const data = { ...emptyAwTissuePairedForward(), races: [awWin, turfWin] };
    const summary = summarizeAwTissuePairedForward(data);
    assert.equal(summary.tracked, 2);
    assert.equal(summary.settled, 2);
    assert.equal(summary.disagreementPerformance.awWins, 1);
    assert.equal(summary.disagreementPerformance.turfArchWins, 1);
    assert.equal(summary.value.awOnly, 1);
    assert.equal(summary.value.both, 1);
    assert.ok(Number.isFinite(summary.probability.awTissue.logLoss!));
    assert.match(renderAwTissuePairedSummary(data), /AW Tissue Paired Forward Summary/);
  });
});

function build(shape: "agree" | "disagree", at = recordedAt) {
  return buildAwTissuePairedRace({ raceDate: "2026-10-10", course: "Wolverhampton", race: sampleRace(shape), awModel, turfModel, priorAwStarts: starts, commentsByHorse: comments, recordedAt: at });
}

function settleWithPrice(record: AwTissuePairedRace, winner: string, aPrice: number, bPrice: number) {
  const priced = enrichAwTissuePairedPrices(record, sampleRace("disagree", { aPrice, bPrice }), new Date("2026-10-10T11:00:00.000Z"));
  return settleAwTissuePairedRace(priced, finishedRace(winner), new Date("2026-10-10T15:00:00.000Z"));
}

function sampleRace(shape: "agree" | "disagree", prices: { aPrice?: number; bPrice?: number } = {}): TodayRace {
  const values = shape === "agree"
    ? [["a", 100, 100, prices.aPrice ?? 5], ["b", 50, 50, prices.bPrice ?? 5], ["c", 20, 20, 9]] as const
    : [["a", 100, 10, prices.aPrice ?? 5], ["b", 50, 90, prices.bPrice ?? 2], ["c", 20, 20, 9]] as const;
  return {
    raceId: "race-one",
    sourceId: "source-race-one",
    scheduledTime: "14:00",
    raceDateTime: off,
    courseCountry: "GB",
    raceName: "AW Handicap",
    raceClass: "Class 5",
    raceType: "Handicap",
    raceTypeCode: null,
    distance: "1m",
    distanceYards: 1760,
    going: "Standard",
    surface: "ALLWEATHER",
    declaredRunnerCount: 3,
    actualRunnerCount: 3,
    winningTime: null,
    runners: values.map(([runnerId, averageSpeed, latestSpeed, price]) => runner(runnerId, averageSpeed, latestSpeed, price)),
  };
}

function finishedRace(winner: string): TodayRace {
  const race = sampleRace("disagree");
  race.runners.forEach((runner, index) => {
    runner.resultStatus = "finished";
    runner.finishingPosition = runner.runnerId === winner ? 1 : index + 2;
    runner.oddsDecimal = runner.runnerId === "a" ? "5" : runner.runnerId === "b" ? "2" : "9";
  });
  return race;
}

function runner(runnerId: string, averageAwSpeedLast3: number, latestAwSpeedRating: number, price: number): TodayRunner {
  return {
    runnerId,
    runnerSourceId: runnerId,
    horseId: runnerId,
    horseName: runnerId.toUpperCase(),
    saddleclothNumber: null,
    horseAge: 4,
    horseSex: null,
    weight: null,
    weightCarriedLbs: 133,
    draw: runnerId === "a" ? 1 : runnerId === "b" ? 2 : 3,
    jockeyName: "Jockey",
    trainerId: null,
    trainerName: "Trainer",
    officialRating: 70,
    odds: `${price - 1}/1`,
    oddsDecimal: String(price),
    forecastOdds: null,
    forecastDecimalOdds: null,
    resultStatus: null,
    finishingPosition: null,
    trainerMetrics: { trainerPriorWinRate: 10, trainerPriorRuns: 100, trainerPriorWins: 10 },
    jockeyMetrics: { jockeyPriorWinRate: 10, jockeyPriorRuns: 100, jockeyPriorWins: 10 },
    metrics: {
      averageAwSpeedLast3,
      latestAwSpeedRating,
      bestAwSpeedLast3: latestAwSpeedRating,
      averageAwPerformanceLast3: averageAwSpeedLast3,
      latestAwPerformanceRating: latestAwSpeedRating,
      daysSinceLastRun: 14,
      priorRuns: 5,
    } as HorseMetricsAsOf,
    bookmakerQuotes: [{ bookmakerId: 1, bookmakerName: "Book", fractionalOdds: `${price - 1}/1`, decimalOdds: price }],
  };
}
