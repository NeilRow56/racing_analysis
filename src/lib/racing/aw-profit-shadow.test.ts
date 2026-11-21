import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  awProfitResult, captureAwProfitShadow, initAwProfitShadow, loadAwProfitShadow,
  pendingAwProfitShadow, settleAwProfitShadow, summarizeAwProfitShadow,
} from "./aw-profit-shadow";
import { GENERATION_MODEL_HASHES } from "./tissue-generation-config";
import type { GenerationRace } from "./tissue-generation-forward";
import { getLocalRacingDate, type TodayRace, type TodayRunner } from "./todays-racing";

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "aw-profit-shadow-"));
  const path = join(dir, "shadow.json");
  const data = await initAwProfitShadow(path);
  assert.ok(data);
  const armedAt = new Date(data.armedAt);
  const date = new Date(armedAt.getTime() + 86_400_000).toISOString().slice(0, 10);
  const capture = new Date(date + "T09:00:00.000Z");
  const decision = new Date(date + "T09:01:00.000Z");
  const off = new Date(date + "T15:00:00.000Z");
  const terminal = new Date(date + "T16:00:00.000Z");
  const book: GenerationRace = {
    family: "AW", raceId: "aw-race", raceDate: getLocalRacingDate(capture), course: "Chelmsford City",
    modelVersion: "AW_TISSUE_V3", modelHash: GENERATION_MODEL_HASHES.AW, scheduledOff: off.toISOString(),
    capturedAt: capture.toISOString(), featureCutoffAt: capture.toISOString(),
    featureNames: ["latest_performance", "latest_performance_missing", "best_l3_turf_speed", "best_l3_turf_speed_missing"],
    adjustmentFeatureNames: [], completeMarket: false, marketSource: "sporting_life_median_bookmaker_at_capture_v1",
    runners: [1, 2, 3].map((n) => ({
      runnerId: "r" + n, horseId: "h" + n, horseName: "Horse " + n, rank: n, probability: (4 - n) / 6,
      modelInputs: n === 3 ? [51.48, 0, 86.48, 0] : [0, 1, 0, 1], adjustmentInputs: [], capturedPrice: null,
      quotes: n === 3 ? [{ bookmakerId: 1, bookmakerName: "Book", fractionalOdds: "33/1", decimalOdds: 34 }] : [],
      outcome: null,
    })),
  };
  const race: TodayRace = {
    raceId: book.raceId, sourceId: "123", raceStage: "DORMANT", raceDateTime: off, scheduledTime: "15:00",
    raceName: "Handicap Stakes", raceClass: "2", courseCountry: "ENG", raceType: "handicap",
    raceTypeCode: null, distance: null, distanceYards: null, going: null, surface: "AW",
    declaredRunnerCount: 3, actualRunnerCount: null, winningTime: null,
    runners: book.runners.map((r): TodayRunner => ({
      runnerId: r.runnerId, runnerSourceId: r.runnerId, horseId: r.horseId, horseName: r.horseName,
      saddleclothNumber: null, horseAge: null, horseSex: null, weight: null, weightCarriedLbs: null, draw: null,
      jockeyName: null, trainerId: null, trainerName: null, officialRating: null, odds: null, oddsDecimal: null,
      resultStatus: null, finishingPosition: null, metrics: null,
    })),
  };
  const captureBooks = (books = [book], card = race, at = decision, since = capture) =>
    captureAwProfitShadow(books, new Map([[race.raceId, card]]), since, path, () => at);
  return { path, book, race, capture, decision, off, terminal, captureBooks,
    cleanup: () => rm(dir, { recursive: true, force: true }) };
}

test("freezes original ranks and exact policy choices, with available quotes from incomplete books", async () => {
  const f = await fixture();
  try {
    f.book.runners.reverse();
    const first = await f.captureBooks();
    assert.ok(first);
    const frozen = first.races[0];
    assert.deepEqual(frozen.picks, { AW_TISSUE_V3: "r1", AW_PROFIT_V1: "r3", AW_PROFIT_V3: "r3" });
    assert.deepEqual(frozen.runners.map(r => [r.rank, r.bestL3Speed, r.performanceRank, r.medianBookmakerDecimal]),
      [[1, null, null, null], [2, null, null, null], [3, 86.48, 1, 34]]);
    assert.equal(frozen.sourceCapturedAt, f.capture.toISOString());
    assert.equal(frozen.decidedAt, f.decision.toISOString());
    const bytes = await readFile(f.path, "utf8");
    f.book.runners[1].modelInputs = [0, 1, 91, 0];
    await f.captureBooks();
    assert.equal(await readFile(f.path, "utf8"), bytes);
  } finally { await f.cleanup(); }
});

test("keeps the Speed-gate fallback when Policy C selects and abstains when Policy C abstains", async () => {
  const f = await fixture();
  const a = await fixture();
  try {
    f.book.runners[1].modelInputs = [0, 1, 91, 0];
    const fallback = await f.captureBooks();
    assert.deepEqual(fallback?.races[0].picks, { AW_TISSUE_V3: "r1", AW_PROFIT_V1: "r3", AW_PROFIT_V3: "r1" });
    a.book.runners[2].modelInputs = [0, 1, 86.48, 0];
    const abstained = await a.captureBooks();
    assert.deepEqual(abstained?.races[0].picks, { AW_TISSUE_V3: "r1", AW_PROFIT_V1: null, AW_PROFIT_V3: null });
  } finally { await Promise.all([f.cleanup(), a.cleanup()]); }
});

test("rejects earlier books, races at off or with result evidence, and roster changes", async () => {
  const f = await fixture();
  try {
    await f.captureBooks([f.book], f.race, f.decision, f.decision);
    await f.captureBooks([f.book], f.race, f.off);
    await f.captureBooks([f.book], { ...f.race, raceStage: "OFF" });
    await f.captureBooks([f.book], { ...f.race, raceStage: "WEIGHEDIN" });
    await f.captureBooks([f.book], { ...f.race, runners: f.race.runners.slice(0, 2) });
    await f.captureBooks([{ ...f.book, capturedAt: f.decision.toISOString() }], f.race, f.capture);
    const frozen = await loadAwProfitShadow(f.path);
    assert.deepEqual(frozen?.races, []);
  } finally { await f.cleanup(); }
});

test("settles exact uncapped final SP and dead heats, leaves missing prices pending and records non-runners", async () => {
  const f = await fixture();
  try {
    const before = await f.captureBooks();
    const official: TodayRace = { ...f.race, raceStage: "WEIGHEDIN", actualRunnerCount: 2,
      runners: f.race.runners.map((r, i) => i === 0 ? { ...r, resultStatus: "non_runner" } :
        { ...r, finishingPosition: 1, resultStatus: "finished", oddsDecimal: i === 2 ? "201.000" : "1.333" }) };
    const raw = { race_summary: { race_stage: "WEIGHEDIN" }, rides: official.runners.map((r, i) =>
      ({ ride_reference: { id: r.runnerSourceId }, finish_position: r.finishingPosition, betting: { current_odds: i === 1 ? "1/3" : null } })) };
    const settle = (race: TodayRace, rawRace: unknown, now = f.terminal) =>
      settleAwProfitShadow(new Map([[race.raceId, awProfitResult(race, rawRace)]]), f.path, now);
    const early = await settle(official, raw, f.decision);
    assert.deepEqual(early, before);
    const partial = await settle(official, raw);
    assert.equal(partial?.races[0].outcomes.r1.status, "NR");
    assert.equal(partial?.races[0].outcomes.r3, undefined);
    assert.deepEqual(pendingAwProfitShadow(partial!), [official.raceId]);
    raw.rides[2].betting.current_odds = "100/1";
    assert.equal((await settle(official, raw))?.races[0].outcomes.r3, undefined);
    raw.rides[2].betting.current_odds = "200/1";
    const final = await settle(official, raw);
    assert.ok(final);
    assert.deepEqual(final.races[0].outcomes.r3, {
      status: "settled", settlementVersion: "canonical_settlement_v3", settledAt: f.terminal.toISOString(),
      startingPrice: "200/1", decimalSP: 201, won: true, deadHeatDivisor: 2,
      stake: 1, grossReturn: 100.5, profitLoss: 99.5,
    });
    const [t1, v1, v3] = summarizeAwProfitShadow(final);
    assert.equal(t1.voids, 1);
    assert.deepEqual([v1.bets, v1.wins, v1.roiPercent, v3.profitLoss], [1, 1, 9950, 99.5]);
    assert.deepEqual(pendingAwProfitShadow(final), []);
    assert.deepEqual(await settle({ ...official, raceStage: "ABANDONED" }, undefined), final);
  } finally { await f.cleanup(); }
});

test("terminal abandonment voids every selected stake and leaves frozen picks intact", async () => {
  const f = await fixture();
  try {
    const captured = await f.captureBooks();
    const race = { ...f.race, raceStage: "ABANDONED" };
    const settled = await settleAwProfitShadow(new Map([[race.raceId, awProfitResult(race, undefined)]]), f.path, f.terminal);
    assert.deepEqual(settled?.races[0].picks, captured?.races[0].picks);
    assert.deepEqual(summarizeAwProfitShadow(settled!).map(p => [p.voids, p.bets, p.roiPercent]),
      [[1, 0, null], [1, 0, null], [1, 0, null]]);
  } finally { await f.cleanup(); }
});
