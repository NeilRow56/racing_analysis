import assert from "node:assert/strict";
import { test } from "node:test";
import { settleContextWeightShadow, emptyContextWeightShadow } from "./context-weight-shadow-forward";
import { summarizeContextWeightShadow } from "./context-weight-shadow-report";
import { liveShadowData, shadowResult } from "./context-weight-shadow.fixtures";
import { emptyTissueGeneration } from "./tissue-generation-forward";

test("new phase is zero, insufficient, and has no retrospective or automatic promotion path", () => {
  const result = summarizeContextWeightShadow(emptyContextWeightShadow());
  assert.match(result.header, /Prospective evidence only/); assert.equal(result.automaticPromotion, false);
  for (const row of result.candidates) {
    assert.equal(row.races, 0); assert.equal(row.firstObservation, null); assert.equal(row.status, "INSUFFICIENT PROSPECTIVE SAMPLE");
    assert.equal(row.production.logLoss, null); assert.equal(row.shadow.brier, null); assert.equal(row.delta.calibrationError, null);
  }
});
test("paired exact scoring, Brier, bins, ranking and canonical frozen-price results", () => {
  const data = liveShadowData("AW", true), book = data.observations[0], after = new Date(Date.parse(book.scheduledOff) + 1000);
  const settled = settleContextWeightShadow(data, new Map([[book.raceId, shadowResult(book.production)]]), after);
  const report = summarizeContextWeightShadow(settled).candidates[0], winner = book.production.runners[0], prediction = book.runners.find(r => r.runnerId === winner.runnerId)!;
  assert.equal(report.cleanPairedRaces, 1); assert.equal(report.cleanPairedRunners, book.runners.length);
  assert.ok(Math.abs(report.production.logLoss! + Math.log(winner.probability)) < 1e-12);
  assert.ok(Math.abs(report.shadow.logLoss! + Math.log(prediction.probability)) < 1e-12);
  const brier = book.production.runners.reduce((s, r) => s + (r.probability - Number(r.runnerId === winner.runnerId)) ** 2, 0);
  assert.ok(Math.abs(report.production.brier! - brier) < 1e-12);
  assert.equal(report.production.bands.reduce((n, b) => n + b.runners, 0), book.runners.length);
  assert.equal(report.shadow.bands.reduce((n, b) => n + b.actual, 0), 1);
  assert.equal(report.delta.logLoss, report.shadow.logLoss! - report.production.logLoss!);
  assert.equal(report.production.capturedPriceRank1.races, 1); assert.equal(report.shadow.capturedPriceRank1.races, 1);
  assert.equal(report.status, "INSUFFICIENT PROSPECTIVE SAMPLE");
});
test("NR/void fields excluded from paired proper scores; pending observations not reconstructed", () => {
  for (const status of ["non_runner", "void"] as const) {
    const data = liveShadowData(), book = data.observations[0], race = shadowResult(book.production);
    race.runners[0].resultStatus = status; race.runners[0].finishingPosition = null; race.runners[1].finishingPosition = 1; race.actualRunnerCount = race.runners.length - 1;
    const settled = settleContextWeightShadow(data, new Map([[book.raceId, race]]), new Date(Date.parse(book.scheduledOff) + 1000));
    const row = summarizeContextWeightShadow(settled).candidates[0];
    assert.equal(row.cleanPairedRaces, 0); assert.equal(row.production.logLoss, null);
    assert.equal(status === "non_runner" ? row.nonRunnerRaces : row.voidRaces, 1);
  }
  const pending = summarizeContextWeightShadow(liveShadowData()).candidates[0];
  assert.equal(pending.pendingRaces, 1); assert.equal(pending.cleanPairedRaces, 0); assert.equal(pending.shadow.logLoss, null);
});
test("started non-finishers are canonical losses; missing frozen prices never gain an SP fallback", () => {
  const data = liveShadowData(), book = data.observations[0], race = shadowResult(book.production);
  race.runners[0].resultStatus = "pulled_up"; race.runners[0].finishingPosition = null; race.runners[1].finishingPosition = 1;
  const result = settleContextWeightShadow(data, new Map([[book.raceId, race]]), new Date(Date.parse(book.scheduledOff) + 1000));
  const loser = result.observations[0].production.runners[0].outcome!;
  assert.equal(loser.status, "settled"); assert.equal(loser.winner, false); assert.equal(loser.profitLoss, null);
  const row = summarizeContextWeightShadow(result).candidates[0];
  assert.equal(row.cleanPairedRaces, 1); assert.equal(row.production.capturedPriceRank1.races, 0); assert.equal(row.shadow.capturedPriceRank1.roi, null);
});
test("missing prospective captures are flagged against production coverage, never regenerated", () => {
  const data = liveShadowData(), source = { ...emptyTissueGeneration(), races: [data.observations[0].production] };
  const missing = summarizeContextWeightShadow(emptyContextWeightShadow(), source).candidates[0];
  assert.equal(missing.coverage.expectedProductionCaptures, 1); assert.equal(missing.coverage.unpairedProductionCaptures, 1);
  assert.equal(missing.coverage.missingLatestProductionRaces, 1); assert.equal(missing.races, 0); assert.equal(missing.shadow.logLoss, null);
  assert.equal(summarizeContextWeightShadow(data, source).candidates[0].coverage.unpairedProductionCaptures, 0);
});
test("dead-heat target splits, version separation and duplicate captures never inflate races", () => {
  const data = liveShadowData(), book = data.observations[0], race = shadowResult(book.production);
  race.runners[1].finishingPosition = 1;
  const settled = settleContextWeightShadow(data, new Map([[book.raceId, race]]), new Date(Date.parse(book.scheduledOff) + 1000));
  const row = summarizeContextWeightShadow(settled).candidates[0];
  assert.ok(Math.abs(row.production.logLoss! + (Math.log(book.production.runners[0].probability) + Math.log(book.production.runners[1].probability)) / 2) < 1e-12);
  const old = structuredClone(book); old.candidateVersion = "aw_context_future_v2";
  const mixed = summarizeContextWeightShadow({ ...settled, observations: [...settled.observations, old] });
  assert.equal(mixed.candidates[0].invalidOrVersionMismatch, 1); assert.equal(mixed.candidates[0].cleanPairedRaces, 1);
  assert.equal(mixed.candidates[1].candidateVersion, "turf_context_25_shadow_v1"); assert.equal(mixed.candidates[1].races, 0);
});
