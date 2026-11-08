import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { HurdleV3ShadowMonitor } from "../../app/racing/research/forward-value/hurdle-v3-shadow-monitor";
import { buildHurdleV3Field, type HurdleV3Prior, type HurdleV3Target } from "./hurdle-v3-challenger-features";
import { loadHurdleV3Challenger, scoreHurdleV3Field } from "./hurdle-v3-challenger-model";
import { hurdleV3ParticipantPrior, type HurdleParticipantSource, type HurdleV3ShadowInput } from "./hurdle-v3-shadow-inputs";
import { hurdleV3ShadowTags, HURDLE_V3_LED_SHADOW_LOGIT } from "./hurdle-v3-shadow-tags";
import { initializeHurdleV3Shadow, loadHurdleV3Shadow, buildHurdleV3Shadow, appendHurdleV3Shadows, validHurdleV3Shadow,
  settleHurdleV3Shadows, mutateHurdleV3Shadow, assertHurdleV3ShadowPins, type HurdleV3ShadowData } from "./hurdle-v3-shadow";
import { summarizeHurdleV3Shadow, hurdleShadowComparison } from "./hurdle-v3-shadow-metrics";
import { loadTissueGenerationModels } from "./tissue-generation-model";
import { GENERATION_FEATURES } from "./tissue-generation-features";
import type { GenerationRace } from "./tissue-generation-forward";
import { validGenerationCapture } from "./tissue-generation-forward";
import { contextShadowAfterProduction } from "./context-weight-shadow-sync";
import { getLocalRacingDate } from "./todays-racing";
import { shadowResult } from "./context-weight-shadow.fixtures";
import { main as shadowCommand } from "../../../scripts/track-hurdle-v3-shadow";

const now = new Date(), cutoff = now.toISOString(), off = new Date(now.getTime() + 3600000).toISOString();
const emptyParticipant = hurdleV3ParticipantPrior([], cutoff);
const target: HurdleV3Target = { runnerId: "a", raceId: "hurdle-test", cutoff, scheduledOff: off, officialRating: 100, age: 5, weightLbs: 150,
  trainer: emptyParticipant.prior, jockey: emptyParticipant.prior };
const run = (days: number, change: Partial<HurdleV3Prior> = {}): HurdleV3Prior => ({ runnerId: `prior-${days}`, raceId: `prior-race-${days}`, family: "HURDLE",
  at: new Date(now.getTime() - days * 86400000).toISOString(), finishingPosition: 2, resultStatus: "finished", speed: 90, comment: "led, kept on", ...change });
test("shadow CLI refuses historical dates and refresh/backfill commands before opening a connection", async () => {
  for (const args of [["sync", "2026-01-01"], ["sync", "--force-refresh"], ["backfill"], ["refit"]]) await assert.rejects(shadowCommand(args), /current day only; no backfill/);
});
async function fixture() {
  const model = (await loadTissueGenerationModels()).HURDLE;
  const book: GenerationRace = { family: "HURDLE", modelVersion: model.version, modelHash: model.checksum, raceId: target.raceId,
    raceDate: getLocalRacingDate(now), course: "Fixture", scheduledOff: off, capturedAt: cutoff, featureCutoffAt: cutoff,
    featureNames: model.baseModel.names, adjustmentFeatureNames: GENERATION_FEATURES.HURDLE, completeMarket: false, marketSource: "sporting_life_median_bookmaker_at_capture_v1",
    runners: ["a", "b", "c"].map((id, i) => ({ runnerId: id, horseId: id, horseName: `Horse ${id}`, probability: [.5, .3, .2][i], rank: i + 1,
      modelInputs: [...model.baseModel.means], adjustmentInputs: [...model.adjustment.means], capturedPrice: null, quotes: [], outcome: null })) };
  assert.ok(validGenerationCapture(book));
  const inputs = new Map<string, HurdleV3ShadowInput>(book.runners.map((r, i) => [r.runnerId, { target: { ...target, runnerId: r.runnerId, officialRating: 100 - i * 5 },
    history: i === 2 ? [run(20, { finishingPosition: null, resultStatus: "pulled_up", comment: "led, pulled up" })] : [],
    participantAudit: { trainer: emptyParticipant.audit, jockey: emptyParticipant.audit } }]));
  return { book, inputs };
}
async function withLedger(task: (data: HurdleV3ShadowData, path: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "hurdle-v3-shadow-test-")), path = join(dir, "ledger.json");
  try { await task(await initializeHurdleV3Shadow(path, new Date(now.getTime() - 1000)), path); }
  finally { await rm(dir, { recursive: true, force: true }); }
}

test("frozen LED definition is Hurdle-only, fixed L3 starts, age-decayed, expiry-bounded and observation only", () => {
  assert.equal(HURDLE_V3_LED_SHADOW_LOGIT, .3512845775499634);
  const old = [run(1, { comment: "" }), run(2, { comment: null }), run(3, { comment: "held up" }), run(4)];
  assert.equal(hurdleV3ShadowTags(target, old).anyLast3Led, false);
  assert.equal(hurdleV3ShadowTags(target, [run(90)]).ledDecay, .5);
  assert.equal(hurdleV3ShadowTags(target, [run(180)]).ledDecay, .25);
  const stale = hurdleV3ShadowTags(target, [run(181)]); assert.equal(stale.anyLast3Led, true); assert.equal(stale.ledDecay, 0);
  for (const family of ["TURF", "AW", "CHASE", "NH FLAT"]) assert.equal(hurdleV3ShadowTags(target, [run(1, { family })]).ledDecay, 0);
  assert.equal(hurdleV3ShadowTags(target, [run(30, { resultStatus: "pulled_up", finishingPosition: null })]).recentPU, true);
  assert.equal(hurdleV3ShadowTags(target, [run(31, { resultStatus: "pulled_up", finishingPosition: null })]).recentPU, false);
});
test("participant denominators include PU/fall/unseated and exclude NR/void/unresolved, future and same-time", () => {
  const rows: HurdleParticipantSource[] = ["pulled_up", "fell", "unseated_rider", "non_runner", "void", "finished", null].map((status, i) => ({ id: String(i), at: run(1).at, status, finish: null }));
  rows.push({ id: "winner", at: run(1).at, status: "finished", finish: 1 });
  rows.push({ id: "future", at: cutoff, status: "finished", finish: 1 });
  const p = hurdleV3ParticipantPrior(rows, cutoff); assert.equal(p.prior.starts, 4); assert.equal(p.prior.wins, 1); assert.equal(p.audit.nonFinisherStarters, 3); assert.equal(p.audit.excluded, 4);
});
test("prospective pair keeps production bytes and official V3 predictions unchanged; LED remains separate", async () => withLedger(async data => {
  const { book, inputs } = await fixture(), bytes = JSON.stringify(book), source = JSON.stringify([...inputs]);
  const o = (await buildHurdleV3Shadow(book, inputs, now))!; assert.ok(validHurdleV3Shadow(o, data));
  const expected = scoreHurdleV3Field(await loadHurdleV3Challenger(), buildHurdleV3Field([...inputs.values()]));
  o.runners.forEach((r, i) => { assert.equal(r.official.probability, expected[i].probability); assert.equal(r.official.logit, expected[i].logit); });
  assert.equal(o.runners[0].tags.ledAddedLogit, 0); assert.equal(o.runners[0].tags.recentPU, false);
  assert.ok(o.runners[2].tags.ledAddedLogit > 0); assert.ok(o.runners[2].tags.recentPU);
  assert.equal(o.runners[2].ledCounterfactual.logit, o.runners[2].official.logit + o.runners[2].tags.ledAddedLogit);
  assert.equal(JSON.stringify(book), bytes); assert.equal(JSON.stringify([...inputs]), source);
}));
test("epoch starts only on first accepted pre-off pair, no duplicates, backfill, future or post-off capture", async () => withLedger(async data => {
  assert.equal(data.epoch, null); const { book, inputs } = await fixture(), o = (await buildHurdleV3Shadow(book, inputs, now))!;
  const first = appendHurdleV3Shadows(data, [o], now); assert.equal(first.epoch, cutoff); assert.equal(first.observations.length, 1);
  assert.equal(appendHurdleV3Shadows(first, [o], now).observations.length, 1);
  for (const clock of [new Date(off), new Date(now.getTime() - 1), new Date(now.getTime() + 60001)]) assert.equal(appendHurdleV3Shadows(data, [o], clock).observations.length, 0);
  const preEpoch = { ...data, armedAt: new Date(now.getTime() + 1).toISOString() }; assert.equal(appendHurdleV3Shadows(preEpoch, [o], now).observations.length, 0);
  const bad = structuredClone(o); bad.runners[0].history.push(run(-1) as typeof bad.runners[0]["history"][number]); assert.equal(validHurdleV3Shadow(bad, data), false);
  const mode = { ...o, captureMode: "reconstructed" }; assert.equal(validHurdleV3Shadow(mode as typeof o, data), false);
  const missing = new Map(inputs); missing.delete("a"); assert.equal(await buildHurdleV3Shadow(book, missing, now), null);
}));
test("canonical shared settlement supports dead heats, PU/fall/unseated, genuine NR and pending results", async () => withLedger(async data => {
  const { book, inputs } = await fixture(), o = (await buildHurdleV3Shadow(book, inputs, now))!, first = appendHurdleV3Shadows(data, [o], now), after = new Date(Date.parse(off) + 1);
  for (const status of ["pulled_up", "fell", "unseated_rider"]) {
    const race = shadowResult(book); race.runners[1].finishingPosition = null; race.runners[1].resultStatus = status;
    const settled = settleHurdleV3Shadows(first, new Map([[book.raceId, race]]), after); assert.equal(settled.observations[0].production.runners[1].outcome?.winner, false); assert.equal(summarizeHurdleV3Shadow(settled).racesSettled, 1);
  }
  const dead = shadowResult(book); dead.runners[1].finishingPosition = 1;
  const settled = settleHurdleV3Shadows(first, new Map([[book.raceId, dead]]), after); assert.equal(settled.observations[0].production.runners[0].outcome!.deadHeatDivisor, 2);
  const metrics = summarizeHurdleV3Shadow(settled); assert.equal(metrics.rows[0].selections[0].actualCredit, .5); assert.equal(metrics.rows[0].selections[2].winners, 1);
  const nr = shadowResult(book); nr.runners[0].finishingPosition = null; nr.runners[0].resultStatus = "non_runner"; nr.runners[1].finishingPosition = 1; nr.runners[2].finishingPosition = 2; nr.actualRunnerCount = 2;
  const result = settleHurdleV3Shadows(first, new Map([[book.raceId, nr]]), after), v2 = summarizeHurdleV3Shadow(result).rows[0];
  assert.equal(v2.selections[0].eligible, 0); assert.equal(v2.selections[0].strikeRate, null); assert.equal(v2.selections[2].winners, 1); assert.ok(Math.abs(v2.logLoss! + Math.log(.3 / .5)) < 1e-12);
  assert.deepEqual(settleHurdleV3Shadows(result, new Map([[book.raceId, nr]]), after), result);
  const pending = shadowResult(book); pending.runners[2].resultStatus = null; pending.runners[2].finishingPosition = null;
  assert.equal(summarizeHurdleV3Shadow(settleHurdleV3Shadows(first, new Map([[book.raceId, pending]]), after)).racesSettled, 0);
  const voidRace = shadowResult(book); voidRace.runners.forEach(r => { r.resultStatus = "abandoned"; r.finishingPosition = null; });
  const voidMetrics = summarizeHurdleV3Shadow(settleHurdleV3Shadows(first, new Map([[book.raceId, voidRace]]), after)); assert.equal(voidMetrics.voidRaces, 1); assert.equal(voidMetrics.racesSettled, 0);
}));
test("ledger atomically freezes epoch, features, predictions and outcomes; initialization cannot restart it", async () => withLedger(async (data, path) => {
  const { book, inputs } = await fixture(), o = (await buildHurdleV3Shadow(book, inputs, now))!;
  await mutateHurdleV3Shadow(d => appendHurdleV3Shadows(d, [o], now), path);
  const stored = (await loadHurdleV3Shadow(path))!; assert.equal(stored.epoch, cutoff);
  await assert.rejects(initializeHurdleV3Shadow(path), /EEXIST/);
  for (const change of [(d: HurdleV3ShadowData) => { d.epoch = null; }, (d: HurdleV3ShadowData) => { d.observations[0].runners[0].official.logit += .1; },
    (d: HurdleV3ShadowData) => { d.sourceHashes["src/lib/racing/hurdle-v3-shadow-tags.ts"] = "0".repeat(64); }]) await assert.rejects(mutateHurdleV3Shadow(d => { change(d); return d; }, path));
  await assertHurdleV3ShadowPins(data); const changed = structuredClone(data); changed.sourceHashes["src/lib/racing/hurdle-v3-shadow-tags.ts"] = "0".repeat(64); await assert.rejects(assertHurdleV3ShadowPins(changed), /changed/);
  const after = new Date(Date.parse(off) + 1), race = shadowResult(book);
  await mutateHurdleV3Shadow(d => settleHurdleV3Shadows(d, new Map([[book.raceId, race]]), after), path);
  const bytes = await readFile(path, "utf8");
  await assert.rejects(mutateHurdleV3Shadow(d => { d.observations[0].production.runners[0].outcome!.winner = false; return d; }, path)); assert.equal(await readFile(path, "utf8"), bytes);
}));
test("shadow errors fail open and research display is labelled, separate and empty-safe", async () => {
  const { book } = await fixture(), bytes = JSON.stringify(book);
  assert.strictEqual(await contextShadowAfterProduction(book, async () => { throw new Error("shadow failed"); }, () => {}), book); assert.equal(JSON.stringify(book), bytes);
  const html = renderToStaticMarkup(<HurdleV3ShadowMonitor data={null} />); assert.match(html, /V3 SHADOW/); assert.match(html, /pending first genuine pre-off capture/); assert.match(html, /No historical backfill/);
  assert.equal(summarizeHurdleV3Shadow(null).rows[0].logLoss, null);
  const sync = await readFile(new URL("./tissue-generation-sync.ts", import.meta.url), "utf8"); assert.ok(sync.indexOf("prepareHurdleV3Shadow(connection") < sync.indexOf("additions = buildTissueGenerationRaces")); assert.ok(sync.indexOf("syncHurdleV3Shadow(accepted") > sync.indexOf("const production = await mutateTissueGeneration"));
});
test("head-to-head uses shared winner ranks and exposes LED counterfactual without changing official order", async () => withLedger(async data => {
  const { book, inputs } = await fixture(), o = (await buildHurdleV3Shadow(book, inputs, now))!, first = appendHurdleV3Shadows(data, [o], now);
  const race = shadowResult(book); const result = settleHurdleV3Shadows(first, new Map([[book.raceId, race]]), new Date(Date.parse(off) + 1));
  const c = hurdleShadowComparison(result.observations[0]); assert.equal(c.v2WinnerRanks[0], 1); assert.equal(c.winnerIds[0], "a"); assert.equal(c.v3.length, 3); assert.equal(c.led.length, 3);
  const summary = summarizeHurdleV3Shadow(result); assert.equal(summary.headToHead.v2Better + summary.headToHead.v3Better + summary.headToHead.same, 1);
}));
