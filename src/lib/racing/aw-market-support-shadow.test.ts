import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { awProfitResult } from "./aw-profit-shadow";
import {
  captureAwMarketSupport, decideAwMarketSupport, initAwMarketSupport, loadAwMarketSupport,
  loadAwMarketSupportCaptureBooks, pendingAwMarketSupport, settleAwMarketSupport, summarizeAwMarketSupport,
} from "./aw-market-support-shadow";
import { emptyTissueGeneration, loadTissueGeneration } from "./tissue-generation-forward";
import { type TodayRace, type TodayRunner } from "./todays-racing";

const originalBook = loadTissueGeneration().then(data => {
  const book = data.races.find(r => r.raceId === "666725d0-2524-4c04-90f5-73d5fe90bf54");
  assert.ok(book);
  return book;
});

const armedAt = new Date("2026-11-22T07:59:00.000Z");
const capturedAt = new Date("2026-11-22T08:06:01.447Z");
const off = new Date("2026-11-22T14:20:00.000Z");
const decisionTime = new Date("2026-11-22T08:07:00.000Z");
const finalTime = new Date("2026-11-22T14:30:00.000Z");

async function fixture() {
  const book = { ...structuredClone(await originalBook), raceDate: "2026-11-22", capturedAt: capturedAt.toISOString(),
    featureCutoffAt: capturedAt.toISOString(), scheduledOff: off.toISOString() };
  for (const runner of book.runners) runner.outcome = null;
  const race: TodayRace = {
    raceId: book.raceId, sourceId: "949648", raceStage: "DORMANT", raceDateTime: off, scheduledTime: "14:20",
    raceName: "Handicap", raceClass: null, courseCountry: "ENG", raceType: "handicap", raceTypeCode: null,
    distance: null, distanceYards: null, going: null, surface: "AW", declaredRunnerCount: book.runners.length,
    actualRunnerCount: null, winningTime: null,
    runners: book.runners.map((r, i): TodayRunner => ({
      runnerId: r.runnerId, horseId: r.horseId, horseName: r.horseName, runnerSourceId: String(i + 1),
      saddleclothNumber: null, horseAge: null, horseSex: null, weight: null, weightCarriedLbs: null, draw: null,
      jockeyName: null, trainerId: null, trainerName: null, officialRating: null,
      odds: "1/100", oddsDecimal: "1.01", resultStatus: null, finishingPosition: null, metrics: null,
    })),
  };
  const dir = await mkdtemp(join(tmpdir(), "aw-market-support-"));
  const path = join(dir, "ledger.json");
  const capture = (source = book, card = race, since = armedAt, clock = () => decisionTime) =>
    captureAwMarketSupport([source], new Map([[book.raceId, card]]), since, path, clock);
  return { path, book, race, capture, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

test("retains only the original T1 or T2 with a verified top-three competition rank", async () => {
  const book = structuredClone(await originalBook);
  const [t1, t2] = decideAwMarketSupport(book);
  assert.equal(book.runners.find(r => r.runnerId === t1.runnerId)?.horseName, "Midnight Call");
  assert.equal(book.runners.find(r => r.runnerId === t2.runnerId)?.horseName, "Giorgio M");
  assert.deepEqual([t1.marketRank, t1.decision, t2.marketRank, t2.decision], [11, "no-bet", 1, "retain"]);

  const outsider = book.runners.find(r => r.runnerId === t1.runnerId)!;
  for (const r of book.runners) delete r.marketProbability;
  outsider.capturedPrice = 6;
  for (const q of outsider.quotes) q.decimalOdds = 6;
  assert.deepEqual(decideAwMarketSupport(book).map(d => [d.marketRank, d.decision]), [[3, "retain"], [1, "retain"]]);
  outsider.capturedPrice = 7;
  for (const q of outsider.quotes) q.decimalOdds = 7;
  assert.equal(decideAwMarketSupport(book)[0].decision, "no-bet");
});

test("freezes no bets for incomplete or unverified boards", async () => {
  const f = await fixture();
  try {
    await initAwMarketSupport(f.path, () => armedAt);
    const source = join(dirname(f.path), "source.json");
    f.book.runners[0].capturedPrice = 77; // saved median does not match its original quotes
    const bytes = JSON.stringify({ ...emptyTissueGeneration(), races: [f.book] });
    await writeFile(source, bytes);
    const [unverified] = await loadAwMarketSupportCaptureBooks(source);
    assert.deepEqual(decideAwMarketSupport(unverified).map(d => [d.marketRank, d.reason]),
      [[null, "market-unverified"], [null, "market-unverified"]]);
    const data = await f.capture(unverified);
    assert.ok(data);
    assert.deepEqual(data.observations[0].decisions.map(d => d.decision), ["no-bet", "no-bet"]);
    assert.deepEqual(pendingAwMarketSupport(data), [f.book.raceId]); // original results are still tracked
    assert.equal(await readFile(source, "utf8"), bytes);

    f.book.completeMarket = false;
    for (const r of f.book.runners) { r.capturedPrice = null; r.marketProbability = null; }
    f.book.runners[0].quotes = [];
    assert.deepEqual(decideAwMarketSupport(f.book).map(d => d.decision), ["no-bet", "no-bet"]);
  } finally { await f.cleanup(); }
});

test("rejects unarmed, old, post-off and mismatched captures and preserves the first decision", async () => {
  const f = await fixture();
  try {
    await assert.rejects(f.capture(), /unarmed/);
    assert.equal(await loadAwMarketSupport(f.path), null);
    await initAwMarketSupport(f.path, () => armedAt);
    assert.equal((await f.capture(f.book, f.race, new Date(capturedAt.getTime() + 1)))?.observations.length, 0);
    assert.equal((await f.capture(f.book, f.race, armedAt, () => off))?.observations.length, 0);
    const old = { ...f.book, capturedAt: "2026-11-22T07:58:00.000Z", featureCutoffAt: "2026-11-22T07:58:00.000Z" };
    assert.equal((await f.capture(old, f.race, new Date(old.capturedAt)))?.observations.length, 0);
    const mismatch = structuredClone(f.race);
    mismatch.runners[0].horseId = "wrong-horse";
    assert.equal((await f.capture(f.book, mismatch))?.observations.length, 0);
    assert.equal((await f.capture(f.book, { ...f.race, raceStage: "WEIGHEDIN" }))?.observations.length, 0);
    assert.equal((await f.capture({ ...f.book, runners: (await originalBook).runners }))?.observations.length, 0);

    const data = await f.capture();
    assert.ok(data);
    assert.deepEqual(data.observations[0].decisions, decideAwMarketSupport(await originalBook));
    const frozen = await readFile(f.path, "utf8");
    await initAwMarketSupport(f.path, () => finalTime);
    await f.capture();
    assert.equal(await readFile(f.path, "utf8"), frozen);
  } finally { await f.cleanup(); }
});

test("records official final SP on retained and excluded races without changing the decision", async () => {
  const f = await fixture();
  try {
    await initAwMarketSupport(f.path, () => armedAt);
    const captured = await f.capture();
    assert.ok(captured);
    const decisions = captured.observations[0].decisions;
    const official: TodayRace = { ...f.race, raceStage: "WEIGHEDIN", actualRunnerCount: f.race.runners.length,
      runners: f.race.runners.map(r => ({ ...r, resultStatus: "finished", oddsDecimal: "201.000",
        finishingPosition: decisions.some(d => d.runnerId === r.runnerId) ? 1 : 3 })) };
    const raw = { race_summary: { race_stage: "WEIGHEDIN" }, rides: official.runners.map(r => ({
      ride_reference: { id: r.runnerSourceId }, finish_position: r.finishingPosition, betting: { current_odds: "200/1" },
    })) };
    function settle(card = official, now = finalTime) {
      return settleAwMarketSupport(new Map([[f.book.raceId, awProfitResult(card, raw)]]), f.path, now);
    }
    assert.deepEqual(await settle(official, decisionTime), captured);
    assert.deepEqual(await settle({ ...official, sourceId: "wrong-source" }), captured);
    raw.rides[0].betting.current_odds = "100/1";
    const partial = await settle();
    assert.ok(partial);
    assert.deepEqual(pendingAwMarketSupport(partial), [f.book.raceId]);
    raw.rides[0].betting.current_odds = "200/1";
    const final = await settle();
    assert.ok(final);
    assert.deepEqual(pendingAwMarketSupport(final), []);
    const observation = final.observations[0];
    assert.deepEqual(observation.decisions, decisions);
    assert.deepEqual(observation.outcomes[decisions[0].runnerId], {
      status: "settled", settlementVersion: "canonical_settlement_v3", settledAt: finalTime.toISOString(),
      finishPosition: 1, resultStatus: "finished", startingPrice: "200/1", decimalSP: 201,
      won: true, deadHeatDivisor: 2, grossReturn: 100.5, profitLoss: 99.5,
    });
    assert.deepEqual(summarizeAwMarketSupport(final).map(r => [r.bets, r.abstentions, r.profitLoss]),
      [[1, 0, 99.5], [0, 1, 0], [1, 0, 99.5], [1, 0, 99.5]]);
    assert.deepEqual(await settle({ ...official, raceStage: "ABANDONED" }), final);
  } finally { await f.cleanup(); }
});

test("settles a non-runner and an abandoned race without a replacement ticket", async () => {
  const f = await fixture();
  try {
    await initAwMarketSupport(f.path, () => armedAt);
    const saved = await f.capture();
    assert.ok(saved);
    const [t1, t2] = saved.observations[0].decisions;
    const race = { ...f.race, raceStage: "ABANDONED", runners: f.race.runners.map(r =>
      r.runnerId === t2.runnerId ? { ...r, resultStatus: "non_runner" } : r) };
    const after = await settleAwMarketSupport(new Map([[race.raceId, awProfitResult(race, null)]]), f.path, finalTime);
    assert.ok(after);
    assert.equal(after.observations[0].outcomes[t1.runnerId].status, "void");
    assert.equal(after.observations[0].outcomes[t2.runnerId].status, "NR");
    assert.deepEqual(after.observations[0].decisions, [t1, t2]);
    assert.ok(summarizeAwMarketSupport(after).every(row => row.profitLoss === 0 && row.bets === 0));
  } finally { await f.cleanup(); }
});
