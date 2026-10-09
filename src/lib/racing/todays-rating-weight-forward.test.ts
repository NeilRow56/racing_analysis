import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { settleSelection } from "./backtest";
import type { HorseMetricsAsOf } from "./horse-metrics";
import { appendTodaysRatingWeightObservations, buildTodaysRatingWeightObservations, emptyTodaysRatingWeightForward,
  lighterWeightBand, loadTodaysRatingWeightForward, mutateTodaysRatingWeightForward, refreshTodaysRatingWeightMarkets,
  renderTodaysRatingWeightSummary, summarizeTodaysRatingWeight, TODAYS_RATING_WEIGHT_FORWARD_EPOCH,
  updateTodaysRatingWeightSettlements, type PriorTurfPerformance } from "./todays-rating-weight-forward";
import type { TodayMeeting, TodayRace, TodayRunner } from "./todays-racing";

const date = "2026-10-10";
const now = new Date(`${date}T10:00:00Z`);
const prior: PriorTurfPerformance = { runnerId: "prior", raceDateTime: "2026-09-01T12:00:00Z", weightCarriedLbs: 133, speed: 94.4 };

function runner(id: string, change = -8, speed = 94.4, price: number | null = 8): TodayRunner {
  return { runnerId: id, runnerSourceId: id, horseId: `horse-${id}`, horseName: id, saddleclothNumber: null,
    horseAge: null, horseSex: null, weight: null, weightCarriedLbs: 133 + change, draw: null, jockeyName: null,
    trainerId: null, trainerName: null, officialRating: null, odds: null, oddsDecimal: null,
    bookmakerQuotes: price === null ? [] : [{ bookmakerId: 1, bookmakerName: "Book", fractionalOdds: null, decimalOdds: price }],
    resultStatus: null, finishingPosition: null, metrics: { latestTurfTodaysRating: speed - change,
      latestTurfSpeedRating: speed, bestTurfSpeedLast3: speed + 3, averageTurfSpeedLast3: speed - 2 } as HorseMetricsAsOf };
}

function race(runners = [runner("target"), runner("peer", 0, 99)]): TodayRace {
  return { raceId: "race", sourceId: "source", scheduledTime: "15:00", raceDateTime: new Date(`${date}T14:00:00Z`),
    courseCountry: "GB", raceName: "Handicap", raceClass: "Class 4", raceType: "flat", raceTypeCode: "FLAT",
    distance: "7f", distanceYards: 1540, going: "Good", surface: "TURF", declaredRunnerCount: runners.length,
    actualRunnerCount: null, winningTime: null, runners };
}

function capture(current = race(), recordedAt = now, raceDate = date, priorByRunner = new Map([["target", prior]])) {
  const meetings = [{ courseName: "York", races: [current] }] as TodayMeeting[];
  return buildTodaysRatingWeightObservations({ meetings, raceDate, priorByRunner, recordedAt });
}

function tracked(current = race()) { return appendTodaysRatingWeightObservations(emptyTodaysRatingWeightForward(), capture(current)); }
function completed(current = race(), winner = "target"): TodayRace {
  return { ...current, actualRunnerCount: current.runners.length, winningTime: "1m 25s",
    runners: current.runners.map((row) => ({ ...row, finishingPosition: row.runnerId === winner ? 1 : 2,
      resultStatus: "finished", oddsDecimal: "4" })) };
}

test("fresh epoch is explicit and capture cannot backfill, precede epoch or happen after off", () => {
  assert.equal(emptyTodaysRatingWeightForward().epoch, TODAYS_RATING_WEIGHT_FORWARD_EPOCH);
  assert.equal(emptyTodaysRatingWeightForward().observations.length, 0);
  assert.equal(capture(race(), new Date("2026-10-09T10:00:00Z"), "2026-10-09").length, 0);
  assert.equal(capture(race(), now, "2025-10-10").length, 0);
  assert.equal(capture(race(), new Date(`${date}T14:00:00Z`)).length, 0);
  assert.equal(capture(completed()).length, 0);
  const candidate = capture()[0]!;
  assert.equal(appendTodaysRatingWeightObservations(emptyTodaysRatingWeightForward(), [{ ...candidate, recordedAt: "2026-10-08T10:00:00Z" }]).observations.length, 0);
});

test("only the exact fixed lighter bands and Today's Rating rank 1 qualify", () => {
  for (const [change, qualifies, band] of [[-9, true, "8+ lb lighter"], [-8, true, "8+ lb lighter"], [-7, true, "4-7 lb lighter"],
    [-4, true, "4-7 lb lighter"], [-3, false, null], [0, false, null], [6, false, null]] as const) {
    const observations = capture(race([runner("target", change), runner("peer", 0, 80)]));
    assert.equal(observations.length, qualifies ? 1 : 0);
    assert.equal(lighterWeightBand(change), band);
    if (qualifies) assert.equal(observations[0]!.signedWeightChange, change);
  }
  assert.equal(capture(race([runner("target"), runner("peer", 0, 110)])).length, 0);
  assert.equal(capture(race([runner("target"), runner("peer", 0, 102.4)])).length, 1); // Competition-rank tie.
  assert.equal(capture({ ...race(), surface: "POLYTRACK", raceTypeCode: "ALLWEATHER" }).length, 0);
});

test("missing or inconsistent prior performance and invalid carried weights cannot qualify", () => {
  assert.equal(capture(race(), now, date, new Map()).length, 0);
  assert.equal(capture(race(), now, date, new Map([["target", { ...prior, weightCarriedLbs: 0 }]])).length, 0);
  assert.equal(capture(race(), now, date, new Map([["target", { ...prior, speed: 10 }]])).length, 0);
  assert.equal(capture(race(), now, date, new Map([["target", { ...prior, raceDateTime: `${date}T11:00:00Z` }]])).length, 0);
  const current = race(); current.runners[0]!.weightCarriedLbs = null;
  assert.equal(capture(current).length, 0);
});

test("duplicate sync and later card updates preserve every qualifying value and price", () => {
  const first = tracked();
  const frozen = structuredClone(first.observations[0]!);
  const updatedCard = race([runner("target", -8, 94.4, 6), runner("peer", 0, 99)]);
  const recaptured = appendTodaysRatingWeightObservations(first, capture(updatedCard, new Date(`${date}T11:00:00Z`)));
  assert.equal(recaptured.observations.length, 1);
  assert.deepEqual(recaptured.observations[0], frozen);
  const refreshed = refreshTodaysRatingWeightMarkets(recaptured, new Map([["race", updatedCard]]), new Date(`${date}T11:00:00Z`));
  assert.equal(refreshed.observations[0]!.market.qualifying.medianDecimal, 8);
  assert.equal(refreshed.observations[0]!.market.qualifying.impliedProbability, .125);
  assert.equal(refreshed.observations[0]!.market.finalStoredPreRace!.medianDecimal, 6);
  assert.deepEqual({ ...refreshed.observations[0], market: frozen.market }, frozen);
  assert.equal(refreshTodaysRatingWeightMarkets(refreshed, new Map([["race", updatedCard]]), new Date(`${date}T11:00:00Z`)), refreshed);
  assert.equal(refreshTodaysRatingWeightMarkets(refreshed, new Map([["race", updatedCard]]), new Date(`${date}T14:00:00Z`)), refreshed);
});

test("canonical non-runner and abandoned statuses void without requiring a winner", () => {
  for (const status of ["non_runner", "abandoned", "void_race"]) {
    const result = race(); result.runners[0]!.resultStatus = status;
    const update = updateTodaysRatingWeightSettlements(tracked(), new Map([["race", result]]), now);
    assert.equal(update.settled, 1);
    assert.equal(update.data.observations[0]!.outcome!.status, "void");
    assert.equal(update.data.observations[0]!.outcome!.qualifyingPriceProfitLoss, 0);
    const summary = summarizeTodaysRatingWeight(update.data.observations);
    assert.equal(summary.voided, 1); assert.equal(summary.settled, 0); assert.equal(summary.ae, null);
  }
});

test("canonical started non-finisher is a loser and incomplete results remain pending", () => {
  const result = completed(race(), "peer");
  result.runners[0]!.finishingPosition = null; result.runners[0]!.resultStatus = "pulled_up";
  const update = updateTodaysRatingWeightSettlements(tracked(), new Map([["race", result]]));
  assert.equal(update.data.observations[0]!.outcome!.won, false);
  assert.equal(update.data.observations[0]!.outcome!.qualifyingPriceProfitLoss, -1);
  assert.equal(summarizeTodaysRatingWeight(update.data.observations).latestDisagreementWinners, 1);
  result.runners[0]!.resultStatus = null;
  assert.equal(updateTodaysRatingWeightSettlements(tracked(), new Map([["race", result]])).settled, 0);
});

test("winner and dead-heat returns reuse canonical settlement at the frozen qualifying price", () => {
  const result = completed(); result.runners[1]!.finishingPosition = 1;
  const update = updateTodaysRatingWeightSettlements(tracked(), new Map([["race", result]]));
  const outcome = update.data.observations[0]!.outcome!;
  const expected = settleSelection({ targetRaceId: "race", targetRunnerId: "target", finishingPosition: 1, resultStatus: "finished",
    won: true, placed: null, startingPrice: null, startingPriceDecimal: "8", deadHeatDivisor: 2 });
  assert.equal(outcome.deadHeatDivisor, 2);
  assert.equal(outcome.finalSp, 4);
  assert.equal(outcome.qualifyingPriceProfitLoss, expected!.profitLoss);
  assert.equal(updateTodaysRatingWeightSettlements(update.data, new Map([["race", result]])).settled, 0);
});

test("missing qualifying prices stay missing even after later quotes and final SP", () => {
  const current = race([runner("target", -8, 94.4, null), runner("peer", 0, 99)]);
  const first = tracked(current);
  const refreshed = refreshTodaysRatingWeightMarkets(first, new Map([["race", race()]]), new Date(`${date}T11:00:00Z`));
  const result = updateTodaysRatingWeightSettlements(refreshed, new Map([["race", completed()]]));
  const summary = summarizeTodaysRatingWeight(result.data.observations);
  assert.equal(summary.settled, 1); assert.equal(summary.winners, 1); assert.equal(summary.pricedSettled, 0);
  assert.equal(summary.expectedWinners, null); assert.equal(summary.ae, null); assert.equal(summary.roi, null);
  assert.equal(result.data.observations[0]!.market.qualifying.medianDecimal, null);
  assert.equal(result.data.observations[0]!.outcome!.finalSp, 4);
});

test("summary separates both bands and uses qualifying-price expected wins and returns", () => {
  const result = updateTodaysRatingWeightSettlements(tracked(), new Map([["race", completed()]]));
  const summary = summarizeTodaysRatingWeight(result.data.observations);
  assert.equal(summary.expectedWinners, .125); assert.equal(summary.ae, 8); assert.equal(summary.profitLoss, 7);
  assert.equal(summary.averageQualifyingPrice, 8); assert.equal(summary.disagreement, 1); assert.equal(summary.agreement, 0);
  assert.equal(summary.todaysDisagreementWinners, 1); assert.equal(summary.latestDisagreementWinners, 0);
  assert.match(renderTodaysRatingWeightSummary(result.data), /8\+ lb lighter/);
  assert.match(renderTodaysRatingWeightSummary(result.data), /4-7 lb lighter/);
  assert.match(renderTodaysRatingWeightSummary(result.data), /combined/);
});

test("atomic concurrent sync preserves first capture and never duplicates a race-runner", async () => {
  const dir = await mkdtemp(join(tmpdir(), "todays-rating-weight-test-"));
  const path = join(dir, "tracker.json");
  try {
    assert.equal((await loadTodaysRatingWeightForward(path)).observations.length, 0);
    const candidates = capture();
    await Promise.all([mutateTodaysRatingWeightForward((data) => appendTodaysRatingWeightObservations(data, candidates), path),
      mutateTodaysRatingWeightForward((data) => appendTodaysRatingWeightObservations(data, candidates), path)]);
    assert.equal((await loadTodaysRatingWeightForward(path)).observations.length, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
