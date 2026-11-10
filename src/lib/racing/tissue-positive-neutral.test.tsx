import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTissueGenerationModels } from "./tissue-generation-model";
import { GENERATION_FEATURES } from "./tissue-generation-features";
import { emptyTissueGeneration, settleTissueGeneration, validGenerationCapture, type GenerationRace } from "./tissue-generation-forward";
import { normalizeCompleteMarket, TISSUE_VALUE_FAMILIES, type TissueValueFamily } from "./tissue-value-metrics";
import { getLocalRacingDate } from "./todays-racing";
import { shadowResult } from "./context-weight-shadow.fixtures";
import { contextShadowAfterProduction } from "./context-weight-shadow-sync";
import { tissueMarketBadge } from "../../app/racing/today/tissue-market-badge";
import { TissuePositiveNeutralMonitor } from "../../app/racing/research/forward-value/tissue-positive-neutral-monitor";
import { BADGE_PRICE_BANDS, POSITIVE_EDGE_BANDS, positiveNeutralCapture, tissueBadgePriceBand, tissueBadgeSelection, tissuePositiveEdgeBand } from "./tissue-positive-neutral-method";
import { appendPositiveNeutral, initializePositiveNeutral, loadPositiveNeutral, matchingPositiveNeutralCapture, mutatePositiveNeutral, type PositiveNeutralData } from "./tissue-positive-neutral";
import { summarizePositiveNeutral } from "./tissue-positive-neutral-metrics";
import { main } from "../../../scripts/track-tissue-positive-neutral";

const now = new Date(), at = now.toISOString(), off = new Date(now.getTime() + 3600000).toISOString(), models = await loadTissueGenerationModels();
function book(family: TissueValueFamily = "HURDLE", qs = [.35, .3, .35], suffix = "") : GenerationRace {
  const m = models[family];
  const r: GenerationRace = { family, raceId: family + suffix, raceDate: getLocalRacingDate(now), course: "Fixture", scheduledOff: off, capturedAt: at, featureCutoffAt: at,
    modelVersion: m.version, modelHash: m.checksum, featureNames: m.baseModel.names, adjustmentFeatureNames: GENERATION_FEATURES[family], completeMarket: true,
    marketSource: "sporting_life_median_bookmaker_at_capture_v1", runners: ["a", "b", "c"].map((id, i) => ({ runnerId: family + suffix + id, horseId: id, horseName: "Horse " + id,
      probability: [.5, .3, .2][i], rank: i + 1, modelInputs: [...m.baseModel.means], adjustmentInputs: [...m.adjustment.means], capturedPrice: 2 / qs[i], marketProbability: null,
      quotes: [{ bookmakerId: 1, bookmakerName: "Fixture", decimalOdds: 2 / qs[i], fractionalOdds: null }], outcome: null })) };
  const normalized = normalizeCompleteMarket(r.runners.map(r => r.capturedPrice))!; r.runners.forEach((r, i) => { r.marketProbability = normalized.probabilities[i]; });
  assert.ok(validGenerationCapture(r)); return r;
}
async function withLedger(task: (data: PositiveNeutralData, path: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "tissue-positive-neutral-test-")), path = join(dir, "ledger.json");
  try { await task(await initializePositiveNeutral(path, new Date(now.getTime() - 1000)), path); } finally { await rm(dir, { recursive: true, force: true }); }
}
function settled(b: GenerationRace, winnerIndex = 0) {
  const r = shadowResult(b); r.runners.forEach((p, i) => { p.finishingPosition = i === winnerIndex ? 1 : i + 2; });
  r.runners.filter((_, i) => i !== winnerIndex).forEach((p, i) => { p.finishingPosition = i + 2; });
  return settleTissueGeneration({ ...emptyTissueGeneration(), races: [b] }, new Map([[b.raceId, r]]), new Date(off));
}
test("T1/T2 Positive and Neutral inclusion uses the exact Today badge function", async () => withLedger(async data => {
  const bs = [book("HURDLE"), book("AW", [.5, .2, .3])], monitor = appendPositiveNeutral(data, bs, now);
  assert.deepEqual(monitor.observations.flatMap(o => o.selections.map(r => [r.tissueRank, r.badgeState, r.included])), [[1, "POSITIVE", true], [2, "NEUTRAL", true], [1, "NEUTRAL", true], [2, "POSITIVE", true]]);
  for (const o of monitor.observations) for (const r of o.selections) assert.equal(r.badgeState.toLowerCase(), tissueMarketBadge(r.probability, r.marketProbability)!.state);
  const s = summarizePositiveNeutral(monitor, { ...emptyTissueGeneration(), races: bs });
  assert.equal(s.headline[0].t1.captured, 2); assert.equal(s.headline[0].t2.captured, 2); assert.equal(s.top2[0].captured, 4);
  assert.equal(monitor.observations[0].modelVersion, "HURDLE_TISSUE_V2");
}));
test("badge half-pp boundaries and fixed price/edge bands are stable", () => {
  for (const [p, q, state] of [[.3, .295, "POSITIVE"], [.3, .305, "NEGATIVE"], [.3, .3001, "NEUTRAL"], [.3, .296, "NEUTRAL"]] as const) assert.equal(tissueBadgeSelection(p, q).badgeState, state);
  assert.deepEqual([.5, 1.999, 2, 4.999, 5, 9.999, 10, 20].map(tissuePositiveEdgeBand), [POSITIVE_EDGE_BANDS[0], POSITIVE_EDGE_BANDS[0], POSITIVE_EDGE_BANDS[1], POSITIVE_EDGE_BANDS[1], POSITIVE_EDGE_BANDS[2], POSITIVE_EDGE_BANDS[2], POSITIVE_EDGE_BANDS[3], POSITIVE_EDGE_BANDS[3]]);
  assert.deepEqual([2, 2.999, 3, 4.999, 5, 10.999, 11, 100].map(tissueBadgePriceBand), [BADGE_PRICE_BANDS[0], BADGE_PRICE_BANDS[0], BADGE_PRICE_BANDS[1], BADGE_PRICE_BANDS[1], BADGE_PRICE_BANDS[2], BADGE_PRICE_BANDS[2], BADGE_PRICE_BANDS[3], BADGE_PRICE_BANDS[3]]);
  assert.throws(() => tissuePositiveEdgeBand(.4)); assert.throws(() => tissueBadgePriceBand(1));
});
test("negative and fallback are excluded from headlines but retained as clearly separate references", async () => withLedger(async data => {
  const negative = book("AW", [.6, .35, .05]), fallback = book("CHASE");
  fallback.completeMarket = false; fallback.runners[0].quotes = []; fallback.runners.forEach(r => { r.capturedPrice = null; r.marketProbability = null; });
  const monitor = appendPositiveNeutral(data, [negative, fallback], now), generation = { ...emptyTissueGeneration(), races: [...settled(negative).races, ...settled(fallback).races] };
  const s = summarizePositiveNeutral(monitor, generation);
  assert.equal(s.includedSelections, 0); assert.equal(s.headline[0].t1.captured, 0); assert.equal(s.negative.find(r => r.family === "AW" && r.rank === 1)!.settled, 1);
  assert.equal(s.fallbackSelections, 2); assert.equal(s.comparisons.find(r => r.family === "CHASE" && r.rank === 1)!.all.settled, 1);
  assert.equal(s.comparisons.find(r => r.family === "CHASE" && r.rank === 1)!.all.priceObservations, 0);
  assert.ok(monitor.observations[1].selections.every(r => r.badgeState === "FALLBACK" && r.marketProbability === null && !r.included));
}));
test("same-capture market identity, full-book normalization and immutable reference join", async () => withLedger(async data => {
  const b = book(), original = JSON.stringify(b), monitor = appendPositiveNeutral(data, [b], now), o = monitor.observations[0];
  assert.equal(o.bookIdentity, `${b.raceId}|${b.capturedAt}`); assert.equal(o.marketCapturedAt, b.capturedAt); assert.equal(o.selections[0].marketProbability, b.runners[0].marketProbability!);
  assert.equal(JSON.stringify(b), original); assert.ok(matchingPositiveNeutralCapture(o, settled(b).races));
  const changed = structuredClone(b); changed.capturedAt = new Date(now.getTime() + 1).toISOString(); assert.equal(matchingPositiveNeutralCapture(o, [changed]), undefined);
  const wrongMarket = structuredClone(b); wrongMarket.runners[0].marketProbability = .99; assert.throws(() => positiveNeutralCapture(wrongMarket), /Invalid exact/);
  const wrongPrice = structuredClone(b); wrongPrice.runners[0].capturedPrice = 99; assert.throws(() => positiveNeutralCapture(wrongPrice));
  const s = summarizePositiveNeutral(monitor, { ...emptyTissueGeneration(), races: [wrongMarket] }); assert.equal(s.unavailableRaces.length, 1); assert.equal(s.headline[0].t1.settled, 0);
}));
test("family splits, combined selections and production Hurdle V2 never mix with V3 shadow", async () => withLedger(async data => {
  const bs = TISSUE_VALUE_FAMILIES.map(f => book(f)), monitor = appendPositiveNeutral(data, bs, now);
  const generation = { ...emptyTissueGeneration(), races: bs.flatMap(b => settled(b).races) }, s = summarizePositiveNeutral(monitor, generation);
  assert.equal(s.headline[0].t1.settled, 4); assert.equal(s.headline[0].t2.settled, 4); assert.equal(s.top2[0].settled, 8);
  for (const f of TISSUE_VALUE_FAMILIES) assert.equal(s.headline.find(r => r.family === f)!.t1.settled, 1);
  assert.equal(s.headline.find(r => r.family === "HURDLE")!.t1.expected, .5);
  const shadow = book("HURDLE", [.3, .3, .4], "-shadow"); shadow.modelVersion = "HURDLE_TISSUE_V3_CHALLENGER"; assert.throws(() => appendPositiveNeutral(data, [shadow], now), /Invalid exact/);
}));
test("canonical winner/loss results, £1 P/L and selection proper scores", async () => withLedger(async data => {
  const b = book(), monitor = appendPositiveNeutral(data, [b], now), generation = settled(b), s = summarizePositiveNeutral(monitor, generation);
  const t1 = s.headline[0].t1, t2 = s.headline[0].t2;
  assert.equal(t1.winners, 1); assert.equal(t1.actualModel, 2); assert.equal(t1.priceObservations, 1); assert.equal(t1.profitLoss, b.runners[0].capturedPrice! - 1); assert.equal(t1.roi, t1.profitLoss);
  assert.equal(t2.winners, 0); assert.equal(t2.profitLoss, -1); assert.ok(Math.abs(t1.logLoss! + Math.log(.5)) < 1e-12); assert.equal(t1.brier, .25);
  assert.ok(Math.abs(t2.logLoss! + Math.log(.7)) < 1e-12); assert.equal(t2.brier, .09);
  assert.equal(s.price.filter(r => r.family === "ALL" && r.rank === 1).reduce((s, r) => s + r.captured, 0), 1);
  assert.equal(s.edge.filter(r => r.family === "ALL" && r.rank === 1).reduce((s, r) => s + r.captured, 0), 1);
  const html = renderToStaticMarkup(<TissuePositiveNeutralMonitor data={monitor} generation={generation} />);
  assert.match(html, /POSITIVE \/ NEUTRAL MARKET BADGES/); assert.match(html, /Negative reference only/); assert.match(html, /Filtered minus all Tissue/); assert.match(html, /TOP2 POSITIVE/);
}));
test("dead heats split Actual/Model and canonical price returns without counting NR/void as losses", async () => withLedger(async data => {
  const b = book(), monitor = appendPositiveNeutral(data, [b], now), result = shadowResult(b); result.runners[1].finishingPosition = 1;
  const dh = settleTissueGeneration({ ...emptyTissueGeneration(), races: [b] }, new Map([[b.raceId, result]]), new Date(off));
  const s = summarizePositiveNeutral(monitor, dh); assert.equal(s.headline[0].t1.winners, 1); assert.equal(s.headline[0].t1.actualCredit, .5); assert.equal(s.headline[0].t1.actualModel, 1);
  assert.equal(s.headline[0].t1.profitLoss, dh.races[0].runners[0].outcome!.profitLoss); assert.equal(s.headline[0].t1.brier, 0);
  const nr = shadowResult(b); nr.runners[0].finishingPosition = null; nr.runners[0].resultStatus = "non_runner"; nr.runners[1].finishingPosition = 1; nr.runners[2].finishingPosition = 2; nr.actualRunnerCount = 2;
  const ns = summarizePositiveNeutral(monitor, settleTissueGeneration({ ...emptyTissueGeneration(), races: [b] }, new Map([[b.raceId, nr]]), new Date(off)));
  assert.equal(ns.headline[0].t1.nonRunners, 1); assert.equal(ns.headline[0].t1.settled, 0); assert.equal(ns.headline[0].t1.priceObservations, 0); assert.equal(ns.headline[0].t1.profitLoss, null);
  assert.equal(ns.headline[0].t2.expected, .3); assert.equal(ns.headline[0].t2.winners, 1); // Frozen probability, no NR rerank or rescore.
  const voided = shadowResult(b); voided.runners.forEach(r => { r.finishingPosition = null; r.resultStatus = "void"; });
  const vs = summarizePositiveNeutral(monitor, settleTissueGeneration({ ...emptyTissueGeneration(), races: [b] }, new Map([[b.raceId, voided]]), new Date(off)));
  assert.equal(vs.headline[0].t1.void, 1); assert.equal(vs.headline[0].t1.settled, 0);
}));
test("all-Tissue comparison uses the same prospective race period and reports signed differences", async () => withLedger(async data => {
  const positive = book("AW"), negative = book("AW", [.6, .35, .05], "-negative"), monitor = appendPositiveNeutral(data, [positive, negative], now);
  const s = summarizePositiveNeutral(monitor, { ...emptyTissueGeneration(), races: [...settled(positive).races, ...settled(negative, 1).races] });
  const c = s.comparisons.find(r => r.family === "AW" && r.rank === 1)!;
  assert.equal(c.all.settled, 2); assert.equal(c.filtered.settled, 1); assert.equal(c.difference.strikeRate, .5); assert.equal(c.difference.actualModel, 1); assert.equal(c.difference.logLoss, 0);
  assert.ok(c.difference.roi! > 0); assert.equal(s.negative.find(r => r.family === "AW" && r.rank === 1)!.winners, 0);
}));
test("Turf competition-rank ties are preserved without inventing a T2", async () => withLedger(async data => {
  const b = book("TURF"); b.runners.forEach((r, i) => { r.probability = [.4, .4, .2][i]; r.rank = [1, 1, 3][i]; }); assert.ok(validGenerationCapture(b));
  const monitor = appendPositiveNeutral(data, [b], now), s = summarizePositiveNeutral(monitor, { ...emptyTissueGeneration(), races: [b] });
  assert.equal(s.comparisons.find(r => r.family === "TURF" && r.rank === 1)!.all.captured, 2); assert.equal(s.headline.find(r => r.family === "TURF")!.t2.captured, 0);
}));
test("no backfill, late/future/settled capture, duplicate or later quote replacement", async () => withLedger(async data => {
  const b = book(), first = appendPositiveNeutral(data, [b], now); assert.equal(first.epoch, at);
  for (const clock of [new Date(now.getTime() - 1), new Date(now.getTime() + 61000), new Date(off)]) assert.equal(appendPositiveNeutral(data, [b], clock).observations.length, 0);
  assert.equal(appendPositiveNeutral({ ...data, armedAt: new Date(now.getTime() + 1).toISOString() }, [b], now).observations.length, 0);
  assert.equal(appendPositiveNeutral(data, settled(b).races, now).observations.length, 0);
  assert.deepEqual(appendPositiveNeutral(first, [book("HURDLE", [.6, .35, .05])], now), first);
}));
test("exclusive arming, immutable captures/epoch/rules and source-pin drift detection", async () => withLedger(async (data, path) => {
  assert.equal((await loadPositiveNeutral(path))!.epoch, null); await assert.rejects(initializePositiveNeutral(path), /EEXIST/);
  await mutatePositiveNeutral(d => appendPositiveNeutral(d, [book()], now), path); const original = await readFile(path, "utf8");
  for (const change of [(d: PositiveNeutralData) => { d.epoch = null; }, (d: PositiveNeutralData) => { d.observations[0].selections[0].price = 99; }, (d: PositiveNeutralData) => { d.rules.tolerancePP = 1 as .5; }]) await assert.rejects(mutatePositiveNeutral(d => { change(d); return d; }, path));
  assert.equal(await readFile(path, "utf8"), original); await mutatePositiveNeutral(d => appendPositiveNeutral(d, [book()], now), path); assert.equal(await readFile(path, "utf8"), original);
  const corrupt = JSON.parse(original) as PositiveNeutralData; corrupt.observations[0].selections[0].badgeState = "NEGATIVE"; await writeFile(path, JSON.stringify(corrupt)); await assert.rejects(loadPositiveNeutral(path), /Invalid frozen/);
  const drift = JSON.parse(original) as PositiveNeutralData; drift.sourceHashes[Object.keys(drift.sourceHashes)[0]] = "0".repeat(64); await writeFile(path, JSON.stringify(drift)); await assert.rejects(mutatePositiveNeutral(d => d, path), /methodology changed/);
  const empty = renderToStaticMarkup(<TissuePositiveNeutralMonitor data={data} generation={emptyTissueGeneration()} />); assert.match(empty, /pending first genuine capture/);
}));
test("no operational backfill commands and fail-open fresh-capture integration", async () => {
  for (const args of [["sync"], ["backfill"], ["init", "2025-01-01"], ["summary", "--refresh"]]) await assert.rejects(main(args), /no replay, backfill or refresh/);
  const value = { production: true }; assert.equal(await contextShadowAfterProduction(value, async () => { throw Error("diagnostic failure"); }, () => {}), value);
  const source = await readFile("src/lib/racing/tissue-generation-sync.ts", "utf8"); assert.match(source, /syncPositiveNeutral\(accepted\)/); assert.ok(source.indexOf("syncPositiveNeutral(accepted)") > source.indexOf("const production = await mutateTissueGeneration"));
});
