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
import type { HorseMetricsAsOf } from "./horse-metrics";
import type { TodayRace, TodayRunner } from "./todays-racing";
import { buildAwTurfChallengerReport, renderAwTurfChallengerToday } from "./aw-turf-challenger-report";
import { currentDayProspectiveCapture, withoutStaleBookmakerQuotes } from "./current-day-sync";

const recordedAt = new Date("2026-10-13T08:00:00.000Z");
const off = new Date("2026-10-13T14:00:00.000Z");
const starts = new Map([["a", 1], ["b", 1], ["c", 1]]);

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
    weights: AW_TISSUE_VECTOR_NAMES.map((name) => name === "avg_l3_aw_speed" ? 0.02 : name === "trainer_prior_rate" || name === "jockey_prior_rate" ? 1 : 0),
  },
};

describe("AW Tissue paired prospective tracker", () => {
  test("morning existing-card fallback preserves prices without fabricating a later snapshot", () => {
    const previous = process.env.RESEARCH_EXISTING_CARDS_DATE;
    const date = "2026-10-13";
    const race = sampleRace("disagree");
    const record = enrichAwTissuePairedPrices(build("disagree")!, race, new Date("2026-10-13T11:00:00.000Z"));
    const before = JSON.stringify(race);
    try {
      process.env.RESEARCH_EXISTING_CARDS_DATE = date;
      const capture = currentDayProspectiveCapture({ status: "ok", raceDate: date, displayDate: date, refreshedAt: recordedAt, sportingLifeCurrentCardVersion: "reconciled_v1", meetings: [{ courseId: "course", courseSourceId: "course", courseName: "Wolverhampton", country: "GB", order: 0, races: [race] }] });
      assert.equal(capture.skipped, false);
      const storedRace = capture.meetings[0]!.races[0]!;
      assert.deepEqual(storedRace.runners.map((runner) => runner.metrics), race.runners.map((runner) => runner.metrics));
      assert.ok(storedRace.runners.every((runner) => !runner.bookmakerQuotes?.length && runner.oddsDecimal === null));
      const noRefresh = enrichAwTissuePairedPrices(record, storedRace, new Date("2026-10-13T13:15:00.000Z"));
      assert.strictEqual(noRefresh, record);
      assert.equal(record.prices.finalPreRace.longshotTjZero, null);
      assert.equal(JSON.stringify(race), before);
      const pendingRunner = withoutStaleBookmakerQuotes({ ...race.runners[0]!, raceDate: date });
      assert.deepEqual(pendingRunner.bookmakerQuotes, []);
      assert.equal(pendingRunner.oddsDecimal, race.runners[0]!.oddsDecimal);
      const completed = finishedRace("b");
      const safeResult = { ...completed, runners: completed.runners.map((runner) => withoutStaleBookmakerQuotes({ ...runner, raceDate: date })) };
      assert.deepEqual(settleAwTissuePairedRace(record, safeResult, new Date("2026-10-13T15:00:00.000Z")), settleAwTissuePairedRace(record, completed, new Date("2026-10-13T15:00:00.000Z")));
    } finally {
      if (previous === undefined) delete process.env.RESEARCH_EXISTING_CARDS_DATE;
      else process.env.RESEARCH_EXISTING_CARDS_DATE = previous;
    }
  });

  test("challenger reports only eligible daily captures, frozen prices and independent VALUE flags", () => {
    const record = enrichAwTissuePairedPrices(build("disagree")!, sampleRace("disagree", { aPrice: 25, bPrice: 5 }), new Date("2026-10-13T11:00:00.000Z"));
    const data = { ...emptyAwTissuePairedForward(), races: [
      record,
      { ...build("agree")!, raceId: "agree" },
      { ...record, raceId: "excluded", excludedReason: "field_changed_after_capture" },
      { ...record, raceId: "other-day", raceDate: "2026-10-14" },
    ] };
    const before = JSON.stringify(data);
    const report = buildAwTurfChallengerReport(data, "2026-10-13", [{ raceId: record.raceId, runnerId: "b", marketPrice: "7/1", marketDecimalOdds: 8, bookmakerQuoteCount: 1, forecastPrice: null, forecastDecimalOdds: null, displayRaceTime: "15:00" }]);
    assert.deepEqual(report.summary, { tracked: 2, agree: 1, disagree: 1, value: 1, settled: 0, winners: 0, suppressed: 1 });
    const challenger = report.rows.find((row) => row.raceId === record.raceId)!;
    const agreeing = report.rows.find((row) => row.raceId === "agree")!;
    assert.equal(challenger.horse, "B");
    assert.equal(challenger.awProbability, record.awTissue.rank1Probability);
    assert.equal(challenger.marketProbability, .2);
    assert.equal(challenger.capturedPrice, 5);
    assert.ok(challenger.capturedPrice <= 21);
    assert.equal(challenger.latestPrice, 8);
    assert.deepEqual(challenger.suppressed.map((runner) => ({ horseName: runner.horseName, price: runner.firstCapturedPriceDecimal })), [{ horseName: "A", price: 25 }]);
    assert.equal(agreeing.capturedPrice, null);
    assert.equal(agreeing.value, false);
    assert.equal(JSON.stringify(data), before);
    const text = renderAwTurfChallengerToday(data, "2026-10-13");
    assert.match(text, /AW LONGSHOT TRAINER\/JOCKEY CHALLENGER/);
    assert.match(text, /runners above 20\/1 at first capture have trainer\/jockey influence removed/);
    assert.match(text, />20\/1 runners adjusted: 1/);
    assert.match(text, /time \| course \| LONGSHOT_TJ_ZERO \| challenger p \| CONTROL #1 \| control p \| >20\/1 runners adjusted \| adjusted runners \| agree\/disagree/);
    assert.match(text, /15:00 \| Wolverhampton \| B \| [\d.]+% \| A \| [\d.]+% \| 1 \| A 25\.00 \| DISAGREE/);
    assert.match(text, /15:00 \| Wolverhampton \| A \| [\d.]+% \| 0 \| - \| AGREE/);
    assert.doesNotMatch(text, /15:00 \| Wolverhampton \| A \| [\d.]+% \| A \| [\d.]+% \| 0 \| - \| AGREE/);
    assert.equal(text.split("\n").length, 6);
    assert.match(renderAwTurfChallengerToday(data, "2026-10-15"), /No challenger selections/);
  });

  test("challenger reporting reflects live settlement without creating captures or changing prices", () => {
    const record = enrichAwTissuePairedPrices(build("disagree")!, sampleRace("disagree", { bPrice: 5 }), new Date("2026-10-13T11:00:00.000Z"));
    const original = { ...emptyAwTissuePairedForward(), races: [record] };
    const results = new Map([[record.raceId, finishedRace("b")], ["untracked", { ...finishedRace("a"), raceId: "untracked" }]]);
    const live = updateAwTissuePairedForward(original, results, new Date("2026-10-13T15:00:00.000Z"));
    const after = updateAwTissuePairedForward(live, results, new Date("2026-10-14T08:00:00.000Z"));
    assert.equal(after.races.length, 1);
    assert.deepEqual(after.races[0]!.prices.firstAvailable, record.prices.firstAvailable);
    assert.deepEqual(after, live);
    const report = buildAwTurfChallengerReport(after, "2026-10-13");
    assert.equal(report.rows[0]!.result, "Winner");
    assert.equal(report.summary.settled, 1);
    assert.equal(report.summary.winners, 1);
    assert.match(renderAwTurfChallengerToday(after, "2026-10-13"), /Settled: 1 \| Winners: 1/);
    const lost = buildAwTurfChallengerReport({ ...original, races: [settleWithPrice(record, "a", 5, 5)] }, "2026-10-13");
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
    assert.equal(buildAwTissuePairedRace({ raceDate: "2026-10-13", course: "Wolverhampton", race: result, awModel, priorAwStarts: starts, recordedAt }), null);
  });

  test("scores control and longshot challenger on the same AW race and preserves ordinary runner scores", () => {
    const race = sampleRace("disagree");
    const record = buildAwTissuePairedRace({ raceDate: "2026-10-13", course: "Wolverhampton", race, awModel, priorAwStarts: starts, recordedAt })!;
    assert.equal(record.runners.length, 3);
    assert.equal(record.awTissue.rank1RunnerId, "a");
    assert.equal(record.longshotTjZero.rank1RunnerId, "b");
    assert.ok(Math.abs(record.awTissue.probabilities.reduce((sum, runner) => sum + runner.probability, 0) - 1) < 1e-12);
    assert.ok(Math.abs(record.longshotTjZero.probabilities.reduce((sum, runner) => sum + runner.probability, 0) - 1) < 1e-12);
    const ordinaryControl = record.awTissue.probabilities.find((runner) => runner.runnerId === "b")!;
    const ordinaryChallenger = record.longshotTjZero.probabilities.find((runner) => runner.runnerId === "b")!;
    assert.equal(ordinaryChallenger.firstCapturedPriceDecimal, 5);
    assert.equal(ordinaryChallenger.longshotTrainerJockeyAdjusted, false);
    assert.notEqual(ordinaryControl.probability, ordinaryChallenger.probability);
    const allOrdinary = buildAwTissuePairedRace({ raceDate: "2026-10-13", course: "Wolverhampton", race: sampleRace("agree", { aPrice: 21, bPrice: 5 }), awModel, priorAwStarts: starts, recordedAt })!;
    for (const control of allOrdinary.awTissue.probabilities) {
      const challenger = allOrdinary.longshotTjZero.probabilities.find((runner) => runner.runnerId === control.runnerId)!;
      assert.equal(challenger.longshotTrainerJockeyAdjusted, false);
      assert.equal(challenger.probability, control.probability);
      assert.equal(challenger.rank, control.rank);
    }
  });

  test("price boundary is strict: 21.0 is normal and 21.01 is adjusted", () => {
    const boundary = buildAwTissuePairedRace({ raceDate: "2026-10-13", course: "Wolverhampton", race: sampleRace("agree", { aPrice: 21 }), awModel, priorAwStarts: starts, recordedAt })!;
    assert.equal(boundary.longshotTjZero.probabilities.find((runner) => runner.runnerId === "a")!.longshotTrainerJockeyAdjusted, false);
    assert.equal(boundary.classification, "AGREE");
    const over = buildAwTissuePairedRace({ raceDate: "2026-10-13", course: "Wolverhampton", race: sampleRace("disagree", { aPrice: 21.01 }), awModel, priorAwStarts: starts, recordedAt })!;
    assert.equal(over.longshotTjZero.probabilities.find((runner) => runner.runnerId === "a")!.longshotTrainerJockeyAdjusted, true);
    assert.equal(over.classification, "DISAGREE");
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
    assert.equal(data.races[0]!.longshotTjZero.rank1RunnerId, "b");
  });

  test("applies independent value flags without changing production value behavior", () => {
    const record = build("disagree")!;
    const priced = enrichAwTissuePairedPrices(record, sampleRace("disagree", { aPrice: 5, bPrice: 1.1 }), new Date("2026-10-13T11:00:00.000Z"));
    assert.equal(priced.awTissue.valueQualified, true);
    assert.equal(priced.longshotTjZero.valueQualified, false);
    assert.equal(priced.valueBucket, "AW_ONLY_VALUE");
    assert.equal(priced.prices.firstAvailable.awTissue?.medianDecimalPrice, 5);
  });

  test("canonical settlement records winners, P/L and duplicate sync idempotence", () => {
    const record = enrichAwTissuePairedPrices(build("disagree")!, sampleRace("disagree", { aPrice: 5, bPrice: 2 }), new Date("2026-10-13T11:00:00.000Z"));
    const settled = settleAwTissuePairedRace(record, finishedRace("a"), new Date("2026-10-13T15:00:00.000Z"));
    assert.deepEqual(settled.winners, ["a"]);
    assert.equal(settled.awTissue.probabilities.find((runner) => runner.runnerId === "a")!.outcome?.won, true);
    assert.equal(settled.longshotTjZero.probabilities.find((runner) => runner.runnerId === "b")!.outcome?.won, false);
    assert.equal(settled.awTissue.selectedPriceProfitLoss, 4);
    const second = updateAwTissuePairedForward({ ...emptyAwTissuePairedForward(), races: [settled] }, new Map([[settled.raceId, finishedRace("a")]]), new Date("2026-10-13T16:00:00.000Z"));
    assert.equal(JSON.stringify(second.races[0]), JSON.stringify(settled));
  });

  test("summary comparisons include disagreement and value performance", () => {
    const awWin = settleWithPrice(build("disagree")!, "a", 5, 1.1);
    const challengerWin = settleWithPrice({ ...build("disagree")!, raceId: "race-two" }, "b", 25, 5);
    const data = { ...emptyAwTissuePairedForward(), races: [awWin, challengerWin] };
    const summary = summarizeAwTissuePairedForward(data);
    assert.equal(summary.tracked, 2);
    assert.equal(summary.settled, 2);
    assert.equal(summary.disagreementPerformance.awWins, 1);
    assert.equal(summary.disagreementPerformance.longshotTjZeroWins, 1);
    assert.equal(summary.value.awOnly, 1);
    assert.equal(summary.value.both, 1);
    assert.ok(Number.isFinite(summary.probability.awTissue.logLoss!));
    assert.match(renderAwTissuePairedSummary(data), /AW Tissue Paired Forward Summary/);
  });
});

function build(shape: "agree" | "disagree", at = recordedAt) {
  return buildAwTissuePairedRace({ raceDate: "2026-10-13", course: "Wolverhampton", race: sampleRace(shape), awModel, priorAwStarts: starts, recordedAt: at });
}

function settleWithPrice(record: AwTissuePairedRace, winner: string, aPrice: number, bPrice: number) {
  const priced = enrichAwTissuePairedPrices(record, sampleRace("disagree", { aPrice, bPrice }), new Date("2026-10-13T11:00:00.000Z"));
  return settleAwTissuePairedRace(priced, finishedRace(winner), new Date("2026-10-13T15:00:00.000Z"));
}

function sampleRace(shape: "agree" | "disagree", prices: { aPrice?: number; bPrice?: number } = {}): TodayRace {
  const values = shape === "agree"
    ? [["a", 100, 100, prices.aPrice ?? 5, 1], ["b", 80, 80, prices.bPrice ?? 5, 0], ["c", 20, 20, 9, 0]] as const
    : [["a", 100, 10, prices.aPrice ?? 25, 1], ["b", 180, 90, prices.bPrice ?? 5, 0], ["c", 20, 20, 9, 0]] as const;
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
    runners: values.map(([runnerId, averageSpeed, latestSpeed, price, tjRate]) => runner(runnerId, averageSpeed, latestSpeed, price, tjRate)),
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

function runner(runnerId: string, averageAwSpeedLast3: number, latestAwSpeedRating: number, price: number, tjRate: number): TodayRunner {
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
    trainerMetrics: { trainerPriorWinRate: tjRate, trainerPriorRuns: 100, trainerPriorWins: 10 },
    jockeyMetrics: { jockeyPriorWinRate: tjRate, jockeyPriorRuns: 100, jockeyPriorWins: 10 },
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
