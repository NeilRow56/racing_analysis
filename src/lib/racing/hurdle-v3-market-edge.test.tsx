import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { renderToStaticMarkup } from "react-dom/server";
import { loadHurdleV3Challenger } from "./hurdle-v3-challenger-model";
import { buildHurdleV3Shadow, initializeHurdleV3Shadow, settleHurdleV3Shadows } from "./hurdle-v3-shadow";
import { hurdleV3ParticipantPrior, type HurdleV3ShadowInput } from "./hurdle-v3-shadow-inputs";
import { getLocalRacingDate } from "./todays-racing";
import { GENERATION_FEATURES } from "./tissue-generation-features";
import type { GenerationRace } from "./tissue-generation-forward";
import { loadTissueGenerationModels } from "./tissue-generation-model";
import { shadowResult } from "./context-weight-shadow.fixtures";
import { contextShadowAfterProduction } from "./context-weight-shadow-sync";
import { appendHurdleMarketEdges, buildHurdleMarketEdge, initializeHurdleMarketEdge, loadHurdleMarketEdge, matchingMarketEdgeShadow, mutateHurdleMarketEdge } from "./hurdle-v3-market-edge";
import { CONTRIBUTION_GROUPS, exactHurdleEdgeMarket, hurdleEdgeBand, hurdleMarketRankBand, hurdleSpeedDepth } from "./hurdle-v3-market-edge-method";
import { summarizeHurdleMarketEdge } from "./hurdle-v3-market-edge-metrics";
import { HurdleV3MarketEdgeMonitor } from "../../app/racing/research/forward-value/hurdle-v3-market-edge-monitor";
import { main } from "../../../scripts/track-hurdle-v3-market-edge";

const now = new Date(), capturedAt = now.toISOString(), off = new Date(now.getTime() + 3600000).toISOString();
const model = await loadHurdleV3Challenger();
async function fixture(depth = 0) {
  const dir = await mkdtemp(join(tmpdir(), "hurdle-market-edge-test-")), path = join(dir, "edge.json");
  const production = (await loadTissueGenerationModels()).HURDLE;
  const book: GenerationRace = { family: "HURDLE", modelVersion: production.version, modelHash: production.checksum, raceId: "edge-fixture", raceDate: getLocalRacingDate(now), course: "Fixture",
    scheduledOff: off, capturedAt, featureCutoffAt: capturedAt, featureNames: production.baseModel.names, adjustmentFeatureNames: GENERATION_FEATURES.HURDLE,
    completeMarket: true, marketSource: "sporting_life_median_bookmaker_at_capture_v1",
    runners: ["a", "b", "c", "d"].map((id, i) => ({ runnerId: id, horseId: id, horseName: `Horse ${id}`, probability: [.4, .3, .2, .1][i], rank: i + 1,
      modelInputs: [...production.baseModel.means], adjustmentInputs: [...production.adjustment.means], capturedPrice: [20, 2, 3, 4][i],
      quotes: [{ bookmakerId: 1, bookmakerName: "Fixture", fractionalOdds: null, decimalOdds: [20, 2, 3, 4][i] }], outcome: null })) };
  const prior = hurdleV3ParticipantPrior([], capturedAt);
  const inputs = new Map<string, HurdleV3ShadowInput>(book.runners.map(r => [r.runnerId, {
    target: { runnerId: r.runnerId, raceId: book.raceId, cutoff: capturedAt, scheduledOff: off, officialRating: 100, age: 5, weightLbs: 150, trainer: prior.prior, jockey: prior.prior },
    history: Array.from({ length: depth }, (_, i) => ({ runnerId: r.runnerId + "-prior-" + i, raceId: "prior-" + i, family: "HURDLE", at: new Date(now.getTime() - (i + 1) * 86400000).toISOString(), speed: 90, comment: "kept on", finishingPosition: 2, resultStatus: "finished" })),
    participantAudit: { trainer: prior.audit, jockey: prior.audit },
  }]));
  const shadow = await buildHurdleV3Shadow(book, inputs, now); assert.ok(shadow);
  const template = await initializeHurdleV3Shadow(join(dir, "shadow.json"), new Date(now.getTime() - 1000));
  const data = await initializeHurdleMarketEdge(path, new Date(now.getTime() - 1000));
  return { dir, path, shadow, template, data };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function withFixture(task: (f: Fixture) => Promise<void>, depth = 0) { const f = await fixture(depth); try { await task(f); } finally { await rm(f.dir, { recursive: true, force: true }); } }

test("fixed edge bands and market-rank boundaries include exact endpoints", () => {
  for (const [value, expected] of [[-1, "NEGATIVE"], [-1e-10, "NEGATIVE"], [0, "SMALL POSITIVE"], [4.99999, "SMALL POSITIVE"], [5, "MEDIUM POSITIVE"], [9.99999, "MEDIUM POSITIVE"], [10, "LARGE POSITIVE"], [40, "LARGE POSITIVE"]] as const) assert.equal(hurdleEdgeBand(value), expected);
  assert.throws(() => hurdleEdgeBand(NaN));
  assert.deepEqual([1, 2, 3, 5, 6, 8, 9, 20].map(hurdleMarketRankBand), ["1-2", "1-2", "3-5", "3-5", "6-8", "6-8", "9+", "9+"]);
});
test("only exact same-capture full-field market is used; probabilities and PP reconcile", async () => withFixture(async ({ shadow }) => {
  const before = JSON.stringify(shadow), o = buildHurdleMarketEdge(shadow, model, now), a = o.runners.find(r => r.v3Rank === 1)!;
  assert.equal(o.marketCapturedAt, shadow.capturedAt); assert.equal(o.completeMarket, true);
  assert.ok(Math.abs(a.marketProbability! - (1 / 20) / (1 / 20 + 1 / 2 + 1 / 3 + 1 / 4)) < 1e-12);
  assert.equal(a.edgePP, 100 * (a.v3Probability - a.marketProbability!)); assert.equal(a.edgeBand, "LARGE POSITIVE");
  assert.equal(o.marketFavourite, "b"); assert.equal(o.marketSecondFavourite, "c"); assert.equal(a.marketRank, 4);
  assert.equal(JSON.stringify(shadow), before);
  const mismatch = structuredClone(shadow); mismatch.production.capturedAt = new Date(now.getTime() + 1).toISOString();
  assert.throws(() => buildHurdleMarketEdge(mismatch, model, now), /same-capture/);
  const wrongField = structuredClone(shadow); wrongField.production.runners.pop(); assert.throws(() => exactHurdleEdgeMarket(wrongField), /same-capture/);
  const wrongCutoff = structuredClone(shadow); wrongCutoff.runners[0].target.cutoff = new Date(now.getTime() - 1).toISOString(); assert.throws(() => exactHurdleEdgeMarket(wrongCutoff), /same-capture/);
  const tied = structuredClone(shadow); tied.production.runners.forEach(r => { r.capturedPrice = 4; });
  const market = exactHurdleEdgeMarket(tied)!; assert.ok(market.rows.every(r => r.rank === 1)); assert.equal(market.favourite, "a"); assert.equal(market.secondFavourite, "b");
}));
test("incomplete market retains context without a fabricated edge or headline membership", async () => withFixture(async ({ shadow, data, template }) => {
  shadow.production.runners[0].capturedPrice = null;
  const next = appendHurdleMarketEdges(data, [shadow], model, now), o = next.observations[0];
  assert.equal(next.epoch, capturedAt); assert.equal(o.completeMarket, false); assert.ok(o.runners.every(r => r.marketProbability === null && r.edgePP === null && r.edgeBand === null));
  const s = summarizeHurdleMarketEdge(next, { ...template, observations: [shadow] });
  assert.equal(s.captured, 1); assert.equal(s.marketUnavailable, 1); assert.equal(s.t1.reduce((s, r) => s + r.captured, 0), 0); assert.equal(s.headline.captured, 0);
}));
test("Speed depth counts actual canonical last three starts, without backfill or code transfer", async () => withFixture(async ({ shadow }) => {
  const r = shadow.runners[0];
  r.history = Array.from({ length: 4 }, (_, i) => ({ runnerId: "prior" + i, raceId: "old" + i, family: "HURDLE", at: new Date(now.getTime() - (i + 1) * 86400000).toISOString(), finishingPosition: 2, resultStatus: "finished", speed: i === 0 ? null : 100, comment: null }));
  assert.equal(hurdleSpeedDepth(r).count, 2); assert.equal(hurdleSpeedDepth(r).evidence, "ESTABLISHED SPEED EVIDENCE");
  Object.assign(r.history[1], { family: "CHASE" }); assert.equal(hurdleSpeedDepth(r).count, 2);
  r.history[2].speed = null; assert.equal(hurdleSpeedDepth(r).count, 1); assert.equal(hurdleSpeedDepth(r).evidence, "LOW SPEED EVIDENCE");
  r.history[3].speed = null; assert.equal(hurdleSpeedDepth(r).category, "NO USABLE RECENT SPEED");
}));
test("all twelve contribution groups and top positives preserve frozen V3 logits", async () => withFixture(async ({ shadow }) => {
  for (const r of buildHurdleMarketEdge(shadow, model, now).runners) {
    assert.deepEqual(r.groups.map(g => g.name), [...CONTRIBUTION_GROUPS]);
    assert.ok(Math.abs(r.groups.reduce((s, g) => s + g.contribution, 0) - r.v3Logit) < 1e-12);
    assert.ok(r.topPositiveGroups.every(g => g.contribution > 0));
    assert.deepEqual(r.topPositiveGroups, r.groups.filter(g => g.contribution > 0).sort((a, b) => b.contribution - a.contribution || a.name.localeCompare(b.name)).slice(0, 3));
  }
}));
test("no replay, historical backfill, future capture, duplicate, post-off or replacement quotes", async () => withFixture(async ({ shadow, data }) => {
  const first = appendHurdleMarketEdges(data, [shadow], model, now); assert.equal(first.epoch, capturedAt); assert.equal(first.observations.length, 1);
  const replacement = structuredClone(shadow); replacement.production.runners[0].capturedPrice = 100;
  assert.deepEqual(appendHurdleMarketEdges(first, [replacement], model, now), first);
  assert.equal(matchingMarketEdgeShadow(first.observations[0], [replacement]), undefined);
  for (const clock of [new Date(now.getTime() + 61000), new Date(off), new Date(now.getTime() - 1)]) assert.equal(appendHurdleMarketEdges(data, [shadow], model, clock).observations.length, 0);
  assert.equal(appendHurdleMarketEdges({ ...data, armedAt: new Date(now.getTime() + 1).toISOString() }, [shadow], model, now).observations.length, 0);
}));
test("canonical settlement, dead heats, proper scores, V2 reference and T2 separation", async () => withFixture(async ({ shadow, data, template }) => {
  const monitor = appendHurdleMarketEdges(data, [shadow], model, now), result = shadowResult(shadow.production); result.runners[1].finishingPosition = 1;
  const settled = settleHurdleV3Shadows({ ...template, observations: [shadow] }, new Map([[shadow.raceId, result]]), new Date(off));
  const s = summarizeHurdleMarketEdge(monitor, settled), r = s.headline;
  assert.equal(r.captured, 1); assert.equal(r.settled, 1); assert.equal(r.winners, 1); assert.equal(r.actualCredit, .5); assert.equal(r.expected, .25); assert.equal(r.actualModel, 2);
  assert.ok(Math.abs(r.logLoss! + Math.log(.25)) < 1e-12); assert.ok(Math.abs(r.brier! - .25) < 1e-12);
  const q = monitor.observations[0].runners;
  assert.ok(Math.abs(r.marketLogLoss! + (Math.log(q[0].marketProbability!) + Math.log(q[1].marketProbability!)) / 2) < 1e-12);
  assert.equal(s.t2.reduce((s, r) => s + r.captured, 0), 1); assert.equal(s.t1.reduce((s, r) => s + r.captured, 0), 1);
  assert.equal(s.speed[0].settled, 1); assert.equal(s.marketRank.find(r => r.label === "3-5")!.winners, 1);
  assert.equal(s.references[0].v2Top2Winner, true); assert.equal(s.references[0].v3Top2Winner, true); assert.equal(s.references[0].v2RankOfV3T1, 1);
  assert.ok(matchingMarketEdgeShadow(monitor.observations[0], settled.observations));
  const html = renderToStaticMarkup(<HurdleV3MarketEdgeMonitor data={monitor} shadows={settled} />);
  assert.match(html, /PROSPECTIVE MARKET-EDGE MONITOR/); assert.match(html, /V3 T1 EDGE &gt;=10 PP/); assert.match(html, /V3 T2 only/); assert.match(html, /0.2500/);
}));
test("NR selected horses are never losses or replaced; other-book probabilities renormalize", async () => withFixture(async ({ shadow, data, template }) => {
  const monitor = appendHurdleMarketEdges(data, [shadow], model, now), result = shadowResult(shadow.production);
  result.runners[0].finishingPosition = null; result.runners[0].resultStatus = "non_runner"; result.actualRunnerCount = 3; result.runners[1].finishingPosition = 1;
  result.runners[2].finishingPosition = 2; result.runners[3].finishingPosition = 3;
  const settled = settleHurdleV3Shadows({ ...template, observations: [shadow] }, new Map([[shadow.raceId, result]]), new Date(off));
  const s = summarizeHurdleMarketEdge(monitor, settled);
  assert.equal(s.headline.nonRunnerSelections, 1); assert.equal(s.headline.settled, 0); assert.equal(s.headline.winners, 0); assert.equal(s.headline.expected, 0); assert.equal(s.headline.logLoss, null);
  const t2 = s.t2.find(r => r.captured === 1)!; assert.equal(t2.settled, 1); assert.ok(Math.abs(t2.expected - 1 / 3) < 1e-12); assert.ok(Math.abs(t2.logLoss! - Math.log(3)) < 1e-12);
}));
test("void race and nonfinishers use existing settlement, and source mismatch stays unavailable", async () => withFixture(async ({ shadow, data, template }) => {
  const monitor = appendHurdleMarketEdges(data, [shadow], model, now), result = shadowResult(shadow.production);
  result.runners.forEach(r => { r.finishingPosition = null; r.resultStatus = "void"; });
  const voided = settleHurdleV3Shadows({ ...template, observations: [shadow] }, new Map([[shadow.raceId, result]]), new Date(off));
  assert.equal(summarizeHurdleMarketEdge(monitor, voided).headline.voidRaces, 1);
  for (const status of ["pulled_up", "fell", "unseated_rider"]) {
    const r = shadowResult(shadow.production); r.runners[1].finishingPosition = null; r.runners[1].resultStatus = status;
    const settled = settleHurdleV3Shadows({ ...template, observations: [shadow] }, new Map([[shadow.raceId, r]]), new Date(off));
    assert.equal(summarizeHurdleMarketEdge(monitor, settled).headline.settled, 1);
  }
  const wrong = structuredClone(shadow); wrong.production.runners[0].capturedPrice = 90;
  const missing = summarizeHurdleMarketEdge(monitor, { ...template, observations: [wrong] }); assert.equal(missing.sourceUnavailable.length, 1); assert.equal(missing.headline.settled, 0);
}));
test("established depth split and pending empty Research summary remain distinct", async () => withFixture(async ({ shadow, data, template }) => {
  const monitor = appendHurdleMarketEdges(data, [shadow], model, now), s = summarizeHurdleMarketEdge(monitor, { ...template, observations: [shadow] });
  assert.equal(s.speed[0].captured, 0); assert.equal(s.speed[1].captured, 1); assert.equal(s.headline.pending, 1);
  const html = renderToStaticMarkup(<HurdleV3MarketEdgeMonitor data={data} shadows={template} />);
  assert.match(html, /pending first genuine capture/); assert.equal(data.epoch, null); assert.equal(data.observations.length, 0);
}, 3));
test("exclusive initialization, metadata/epoch/observation immutability and persisted corruption rejection", async () => withFixture(async ({ shadow, path }) => {
  assert.equal((await loadHurdleMarketEdge(path))!.epoch, null); await assert.rejects(initializeHurdleMarketEdge(path), /EEXIST/);
  await mutateHurdleMarketEdge(d => appendHurdleMarketEdges(d, [shadow], model, now), path);
  const before = await readFile(path, "utf8"), loaded = (await loadHurdleMarketEdge(path))!; assert.equal(loaded.epoch, capturedAt);
  for (const change of [(d: Fixture["data"]) => { d.epoch = null; }, (d: Fixture["data"]) => { d.observations[0].runners[0].price = 99; }, (d: Fixture["data"]) => { d.rules.lowSpeedMaximum = 2 as 1; }]) await assert.rejects(mutateHurdleMarketEdge(d => { change(d); return d; }, path));
  assert.equal(await readFile(path, "utf8"), before);
  await mutateHurdleMarketEdge(d => appendHurdleMarketEdges(d, [shadow], model, now), path); assert.equal(await readFile(path, "utf8"), before);
  loaded.observations[0].runners[0].edgePP = 99; await writeFile(path, JSON.stringify(loaded)); await assert.rejects(loadHurdleMarketEdge(path), /Invalid frozen market-edge book/);
  const drifted = JSON.parse(before) as Fixture["data"];
  drifted.sourceHashes[Object.keys(drifted.sourceHashes)[0]] = "0".repeat(64);
  await writeFile(path, JSON.stringify(drifted)); await assert.rejects(mutateHurdleMarketEdge(d => d, path), /methodology changed/);
}));
test("CLI cannot replay/refresh/capture, and diagnostic failure leaves production reference untouched", async () => {
  for (const args of [["backfill"], ["sync"], ["init", "2026-01-01"], ["summary", "--force-refresh"]]) await assert.rejects(main(args), /no replay, backfill or refresh/);
  const production = { original: true }; assert.equal(await contextShadowAfterProduction(production, async () => { throw new Error("monitor failure"); }, () => {}), production);
  const source = await readFile("src/lib/racing/tissue-generation-sync.ts", "utf8");
  assert.match(source, /collectEpochShadow\(accepted, hurdleV3Inputs\)/);
  const epochs = await readFile("src/lib/racing/prospective-epoch-collection.ts", "utf8");
  assert.match(epochs, /after.observations.slice\(data.observations.length\)/);
  assert.match(epochs, /appendHurdleMarketEdges\(data, fresh, model\)/);
});
