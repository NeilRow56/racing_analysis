import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { raceSoftmax, score } from "../../../scripts/diagnose-independent-tissue-feasibility";
import switches from "../../../scripts/fixtures/aw-same-or-outsider-v1.json";
import { awProfitResult } from "./aw-profit-shadow";
import { AW_SAME_OR_POLICY, decideAwSameOr, scoreWithoutSameOr, selectAwSameOr } from "./aw-same-or-policy";
import {
  captureAwSameOrShadow, initAwSameOrShadow, loadAwSameOrShadow, pendingAwSameOrShadow,
  settleAwSameOrShadow, summarizeAwSameOrShadow,
} from "./aw-same-or-shadow";
import { loadTissueGeneration } from "./tissue-generation-forward";
import { loadTissueGenerationModels } from "./tissue-generation-model";
import { type TodayRace, type TodayRunner } from "./todays-racing";

const models = loadTissueGenerationModels();
const originalBook = loadTissueGeneration().then(data => {
  const book = data.races.find(r => r.raceId === "666725d0-2524-4c04-90f5-73d5fe90bf54");
  assert.ok(book);
  return book;
});

test("reproduces all 31 saved switches from frozen base scores, adjustments and verified pre-off medians", async () => {
  const { AW } = await models;
  assert.equal(switches.policy, AW_SAME_OR_POLICY);
  assert.equal(switches.modelChecksum, AW.checksum);
  assert.equal(new Set(switches.fixtures.map(r => r.raceId)).size, 31);
  for (const row of switches.fixtures) {
    const full = raceSoftmax(row.runners.map(r => r.base + score(AW.adjustment, r.adjustments)));
    const [t1] = row.runners.map((r, i) => ({ ...r, probability: full[i] }))
      .sort((a, b) => b.probability - a.probability || a.runnerId.localeCompare(b.runnerId));
    assert.equal(t1.runnerId, row.originalT1, row.sourceId);
    const decision = selectAwSameOr(t1.runnerId, row.runners.map(r => ({
      ...r, remainingScore: scoreWithoutSameOr(r.base, AW, r.adjustments),
    })));
    assert.deepEqual(decision, {
      originalT1: row.originalT1, selection: row.replacement, leaderWithoutSameOr: row.replacement,
      originalMarketRank: row.originalMarketRank, triggered: true,
    }, row.sourceId);
  }
});

test("uses competition market ranks and the frozen stable runner-ID tie-break", () => {
  const field = [3, 4, 6, 6].map((capturedPrice, i) => ({ runnerId: String(i), capturedPrice, remainingScore: 1 }));
  assert.deepEqual(selectAwSameOr("3", field), {
    originalT1: "3", originalMarketRank: 3, leaderWithoutSameOr: "0", selection: "3", triggered: false,
  });
  field[3].capturedPrice = 7;
  assert.equal(selectAwSameOr("3", field).selection, "0");
  field[3].remainingScore = 2;
  assert.equal(selectAwSameOr("3", field).triggered, false);
  assert.equal(selectAwSameOr("3", [{ ...field[0], capturedPrice: null }, ...field.slice(1)]).selection, null);
  assert.throws(() => selectAwSameOr("3", [...field, field[0]]), /scoring field/);
});

const armedAt = new Date("2026-11-22T07:59:00.000Z");
const capturedAt = new Date("2026-11-22T08:06:01.447Z");
const off = new Date("2026-11-22T14:20:00.000Z");
const decisionTime = new Date("2026-11-22T08:07:00.000Z");
const finalTime = new Date("2026-11-22T14:30:00.000Z");

async function fixture() {
  const { AW } = await models;
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
  const dir = await mkdtemp(join(tmpdir(), "aw-same-or-shadow-"));
  const path = join(dir, "ledger.json");
  const capture = (source = book, card = race, since = armedAt, clock = () => decisionTime) =>
    captureAwSameOrShadow(AW, [source], new Map([[book.raceId, card]]), since, path, clock);
  return { path, book, race, capture, AW, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

test("captures only new, open, identity-matched books and freezes the first observation", async () => {
  const f = await fixture();
  try {
    assert.equal(await loadAwSameOrShadow(f.path), null);
    await assert.rejects(f.capture(), /unarmed/);
    assert.equal(await loadAwSameOrShadow(f.path), null);
    await initAwSameOrShadow(f.path, () => armedAt);
    const runAfterCapture = new Date(capturedAt.getTime() + 1);
    const wrongHorse = structuredClone(f.race);
    wrongHorse.runners[0].horseId = "wrong-horse";
    assert.equal((await f.capture(f.book, wrongHorse))?.observations.length, 0);
    assert.equal((await f.capture(f.book, { ...f.race, raceId: "other-race" }))?.observations.length, 0);
    assert.equal((await f.capture(f.book, { ...f.race, raceStage: "OFF" }))?.observations.length, 0);
    assert.equal((await f.capture(f.book, f.race, runAfterCapture))?.observations.length, 0);
    let checks = 0;
    assert.equal((await f.capture(f.book, f.race, armedAt, () => checks++ === 0 ? decisionTime : off))?.observations.length, 0);
    const old = await originalBook;
    const oldCard = { ...f.race, raceDateTime: new Date(old.scheduledOff) };
    assert.equal((await f.capture(old, oldCard, new Date(old.capturedAt), () => new Date(Date.parse(old.capturedAt) + 1000)))?.observations.length, 0);
    assert.equal((await f.capture({ ...f.book, runners: old.runners }))?.observations.length, 0);
    const data = await f.capture();
    assert.ok(data);
    const observation = data.observations[0];
    assert.equal(observation.decidedAt, decisionTime.toISOString());
    assert.equal(observation.book.runners.find(r => r.runnerId === observation.decision.originalT1)?.horseName, "Midnight Call");
    assert.equal(observation.book.runners.find(r => r.runnerId === observation.decision.selection)?.horseName, "Giorgio M");
    assert.equal(observation.decision.originalMarketRank, 11);
    assert.ok(observation.decision.triggered);
    assert.deepEqual(decideAwSameOr(f.AW, old), observation.decision);
    const frozen = await readFile(f.path, "utf8");
    await f.capture();
    await initAwSameOrShadow(f.path, () => off);
    assert.equal(await readFile(f.path, "utf8"), frozen);
  } finally { await f.cleanup(); }
});

test("records incomplete market abstention on the shared race universe", async () => {
  const f = await fixture();
  try {
    await initAwSameOrShadow(f.path, () => armedAt);
    f.book.completeMarket = false;
    for (const runner of f.book.runners) {
      runner.capturedPrice = null;
      runner.marketProbability = null;
    }
    f.book.runners[0].quotes = [];
    const data = await f.capture();
    assert.ok(data);
    assert.equal(data.observations[0].decision.selection, null);
    assert.equal(data.observations[0].decision.originalMarketRank, null);
    assert.deepEqual(pendingAwSameOrShadow(data), []);
    assert.deepEqual(summarizeAwSameOrShadow(data).map(a => [a.bets, a.abstentions]), [[0, 1], [0, 1]]);
  } finally { await f.cleanup(); }
});

test("settles official exact SP, dead heats and non-runners without changing either frozen decision", async () => {
  const f = await fixture();
  try {
    await initAwSameOrShadow(f.path, () => armedAt);
    const captured = await f.capture();
    assert.ok(captured);
    const { originalT1, selection } = captured.observations[0].decision;
    assert.ok(selection);
    const otherWinner = f.race.runners.find(r => r.runnerId !== originalT1 && r.runnerId !== selection)!.runnerId;
    const official: TodayRace = { ...f.race, raceStage: "WEIGHEDIN", actualRunnerCount: f.race.runners.length - 1,
      runners: f.race.runners.map(r => r.runnerId === originalT1 ? { ...r, resultStatus: "non_runner" } : {
        ...r, resultStatus: "finished", finishingPosition: [selection, otherWinner].includes(r.runnerId) ? 1 : 3, oddsDecimal: "201.000",
      }) };
    const raw = { race_summary: { race_stage: "WEIGHEDIN" }, rides: official.runners.map(r => ({
      ride_reference: { id: r.runnerSourceId }, finish_position: r.finishingPosition,
      betting: { current_odds: r.runnerId === selection ? "100/1" : null },
    })) };
    function settle(card = official, at = finalTime) {
      return settleAwSameOrShadow(new Map([[f.book.raceId, awProfitResult(card, raw)]]), f.path, at);
    }
    assert.deepEqual(await settle(official, decisionTime), captured);
    assert.deepEqual(await settle({ ...official, sourceId: "wrong-source" }), captured);
    const partial = await settle();
    assert.ok(partial);
    assert.deepEqual(pendingAwSameOrShadow(partial), [f.book.raceId]);
    assert.equal(partial.observations[0].outcomes[originalT1].status, "NR");
    raw.rides.find(r => r.ride_reference.id === official.runners.find(r => r.runnerId === selection)?.runnerSourceId)!
      .betting.current_odds = "200/1";
    const final = await settle();
    assert.ok(final);
    assert.deepEqual(final.observations[0].decision, captured.observations[0].decision);
    assert.deepEqual(final.observations[0].outcomes[selection], {
      status: "settled", settlementVersion: "canonical_settlement_v3", settledAt: finalTime.toISOString(),
      startingPrice: "200/1", decimalSP: 201, won: true, deadHeatDivisor: 2, grossReturn: 100.5, profitLoss: 99.5,
    });
    assert.deepEqual(await settle({ ...official, raceStage: "ABANDONED" }), final);
  } finally { await f.cleanup(); }
});

test("race abandonment voids both frozen tickets", async () => {
  const f = await fixture();
  try {
    await initAwSameOrShadow(f.path, () => armedAt);
    const captured = await f.capture();
    const abandoned = { ...f.race, raceStage: "ABANDONED" };
    const data = await settleAwSameOrShadow(new Map([[f.book.raceId, awProfitResult(abandoned, null)]]), f.path, finalTime);
    assert.ok(data);
    assert.deepEqual(data.observations[0].decision, captured?.observations[0].decision);
    assert.deepEqual(summarizeAwSameOrShadow(data).map(a => [a.voids, a.bets, a.profitLoss]), [[1, 0, 0], [1, 0, 0]]);
  } finally { await f.cleanup(); }
});
