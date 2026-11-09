import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { buildHurdleV3Shadow, initializeHurdleV3Shadow, settleHurdleV3Shadows, type HurdleV3ShadowObservation } from "./hurdle-v3-shadow";
import { loadHurdleV3Challenger } from "./hurdle-v3-challenger-model";
import { hurdleV3ParticipantPrior } from "./hurdle-v3-shadow-inputs";
import { classifyHurdleForm, captureHurdleMarket, hurdleConnectionDependence, hurdleFormEvidence, hurdleMonitoringMonth } from "./hurdle-low-form-method";
import { appendLowForm, initializeLowForm, loadLowForm, matchingLowFormShadow, mutateLowForm } from "./hurdle-low-form";
import { summarizeLowForm } from "./hurdle-low-form-metrics";
import { shadowResult } from "./context-weight-shadow.fixtures";
import { loadTissueGenerationModels } from "./tissue-generation-model";
import { GENERATION_FEATURES } from "./tissue-generation-features";
import type { GenerationRace } from "./tissue-generation-forward";
import { getLocalRacingDate } from "./todays-racing";
import { LowFormHurdleMonitor } from "../../app/racing/research/forward-value/hurdle-low-form-monitor";
import { HurdleLowFormLabel, LowFormLabel } from "../../app/racing/today/hurdle-low-form-label";

const now = new Date(), capturedAt = now.toISOString(), off = new Date(now.getTime() + 3600000).toISOString();
const model = await loadHurdleV3Challenger();
async function fixture() {
  const production = (await loadTissueGenerationModels()).HURDLE;
  const book: GenerationRace = { family: "HURDLE", modelVersion: production.version, modelHash: production.checksum, raceId: "low-form-fixture", raceDate: getLocalRacingDate(now), course: "Fixture", scheduledOff: off,
    capturedAt, featureCutoffAt: capturedAt, featureNames: production.baseModel.names, adjustmentFeatureNames: GENERATION_FEATURES.HURDLE,
    completeMarket: true, marketSource: "sporting_life_median_bookmaker_at_capture_v1",
    runners: ["a", "b", "c", "d"].map((id, i) => ({ runnerId: id, horseId: id, horseName: `Horse ${id}`, probability: [.4, .3, .2, .1][i], rank: i + 1,
      modelInputs: [...production.baseModel.means], adjustmentInputs: [...production.adjustment.means], capturedPrice: 3 + i,
      quotes: [{ bookmakerId: 1, bookmakerName: "Fixture", fractionalOdds: null, decimalOdds: 3 + i }], outcome: null })) };
  book.capturedAt = capturedAt; book.featureCutoffAt = capturedAt; book.scheduledOff = off; book.raceDate = getLocalRacingDate(now);
  const prior = hurdleV3ParticipantPrior([], capturedAt);
  const inputs = new Map(book.runners.map(r => [r.runnerId, { target: { runnerId: r.runnerId, raceId: book.raceId, cutoff: capturedAt, scheduledOff: off,
    officialRating: null, age: 5, weightLbs: 150, trainer: prior.prior, jockey: prior.prior }, history: [], participantAudit: { trainer: prior.audit, jockey: prior.audit } }]));
  const shadow = await buildHurdleV3Shadow(book, inputs, now); assert.ok(shadow);
  const dir = await mkdtemp(join(tmpdir(), "low-form-test-"));
  const template = await initializeHurdleV3Shadow(join(dir, "shadow.json"), new Date(now.getTime() - 1000));
  const data = await initializeLowForm(join(dir, "low.json"), new Date(now.getTime() - 1000));
  await rm(dir, { recursive: true, force: true });
  return { shadow, template, data };
}
type Runner = HurdleV3ShadowObservation["runners"][number];
function formRunner(base: Runner, starts: number, completed = starts, speed: number | null = 100): Runner {
  const r = structuredClone(base);
  r.history = Array.from({ length: starts }, (_, i) => ({ runnerId: `prior-${i}`, raceId: `prior-race-${i}`, family: "HURDLE", at: new Date(now.getTime() - (i + 1) * 86400000).toISOString(),
    finishingPosition: i < completed ? 2 : null, resultStatus: i < completed ? "finished" : "pulled_up", speed, comment: "kept on" }));
  r.raw.best_l3_hurdle_speed = speed; r.raw.latest_hurdle_speed = speed; r.raw.average_l3_hurdle_speed = speed;
  return r;
}
test("historical classification boundaries and priority are frozen", async () => {
  const { shadow } = await fixture(), b = shadow.runners[0];
  const debut = formRunner(b, 0, 0, null), limited = formRunner(b, 2), established = formRunner(b, 3, 2);
  assert.equal(classifyHurdleForm([established, debut]), "ESTABLISHED FORM");
  assert.equal(classifyHurdleForm([debut, debut, limited, established]), "VERY LOW FORM");
  assert.equal(classifyHurdleForm([limited, limited, limited, limited, established]), "LIMITED FORM");
  assert.equal(classifyHurdleForm([limited, limited, limited, established]), "MIXED FORM");
  assert.equal(classifyHurdleForm([limited, limited, established, established, established]), "ESTABLISHED FORM");
  assert.equal(hurdleFormEvidence(formRunner(b, 3, 1)).established, false);
  assert.equal(hurdleFormEvidence(formRunner(b, 3, 3, null)).established, false);
  assert.equal(hurdleFormEvidence(debut).evidence, "LOW");
  assert.equal(hurdleFormEvidence(limited).evidence, "MEDIUM");
  assert.equal(hurdleFormEvidence(established).evidence, "HIGH");
});
test("complete market is normalized once with deterministic ties; incomplete/post-off books refused", async () => {
  const { shadow } = await fixture();
  shadow.production.runners.forEach(r => { r.capturedPrice = 4; });
  const market = captureHurdleMarket(shadow);
  assert.equal(market.status, "COMPLETE");
  assert.ok(Math.abs(market.runners.reduce((s, r) => s + r.probability, 0) - 1) < 1e-12);
  assert.equal(market.favourite, shadow.production.runners.map(r => r.runnerId).sort()[0]);
  assert.equal(market.secondFavourite, shadow.production.runners.map(r => r.runnerId).sort()[1]);
  assert.equal(market.capturedAt, capturedAt);
  shadow.production.runners[0].capturedPrice = null;
  assert.deepEqual(captureHurdleMarket(shadow).runners, []);
  shadow.production.runners[0].capturedPrice = 4; shadow.production.completeMarket = false;
  assert.equal(captureHurdleMarket(shadow).status, "MARKET UNAVAILABLE / INCOMPLETE");
  shadow.production.completeMarket = true; shadow.production.scheduledOff = capturedAt;
  assert.equal(captureHurdleMarket(shadow).status, "MARKET UNAVAILABLE / INCOMPLETE");
});
test("attribution uses frozen raw contributions without producing another V3 score", async () => {
  const { shadow } = await fixture(), r = shadow.runners[0], before = JSON.stringify(shadow);
  const result = hurdleConnectionDependence(r, model);
  const m = model.model;
  const contributions = m.names.map((name, i) => ({ name, value: m.weights[i] * ((r.raw[name] ?? m.means[i]) - m.means[i]) / m.scales[i] }));
  assert.ok(Math.abs(contributions.reduce((s, c) => s + c.value, 0) - r.official.logit) < 1e-12);
  assert.equal(result.combined, result.trainer + result.jockey);
  assert.ok(result.positiveShare === null || result.positiveShare >= 0 && result.positiveShare <= 1);
  assert.equal(JSON.stringify(shadow), before);
});
test("no historical replay, post-off additions, replacement prices, or repeated captures", async () => {
  const { shadow, data } = await fixture();
  const first = appendLowForm(data, [shadow], model, now);
  assert.equal(first.epoch, capturedAt); assert.equal(first.observations.length, 1);
  assert.ok(matchingLowFormShadow(first.observations[0], [shadow]));
  const replacement = structuredClone(shadow); replacement.production.runners[0].capturedPrice = 200;
  assert.deepEqual(appendLowForm(first, [replacement], model, now), first);
  assert.equal(matchingLowFormShadow(first.observations[0], [replacement]), undefined);
  assert.equal(appendLowForm(data, [shadow], model, new Date(now.getTime() + 61000)).observations.length, 0);
  assert.equal(appendLowForm(data, [shadow], model, new Date(off)).observations.length, 0);
  assert.equal(appendLowForm({ ...data, armedAt: new Date(now.getTime() + 1).toISOString() }, [shadow], model, now).observations.length, 0);
});
test("same canonical settlement for V2/V3/market includes PU, falls, unseated, and dead heats", async () => {
  for (const status of ["pulled_up", "fell", "unseated_rider"]) {
    const { shadow, data, template } = await fixture();
    const low = appendLowForm(data, [shadow], model, now), result = shadowResult(shadow.production);
    result.runners[1].finishingPosition = null; result.runners[1].resultStatus = status;
    const settled = settleHurdleV3Shadows({ ...template, observations: [shadow] }, new Map([[shadow.raceId, result]]), new Date(off));
    const summary = summarizeLowForm(low, settled).rows[0];
    assert.equal(summary.settled, 1); assert.equal(summary.market.racesSettled, 1); assert.equal(summary.v2.racesSettled, 1);
    assert.equal(summary.headToHead.length, 1); assert.ok(Number.isFinite(summary.market.logLoss));
  }
  const { shadow, data, template } = await fixture(), low = appendLowForm(data, [shadow], model, now), result = shadowResult(shadow.production);
  result.runners[1].finishingPosition = 1;
  const settled = settleHurdleV3Shadows({ ...template, observations: [shadow] }, new Map([[shadow.raceId, result]]), new Date(off));
  const summary = summarizeLowForm(low, settled).rows[0];
  const probabilities = low.observations[0].market.runners;
  const expected = -result.runners.slice(0, 2).reduce((s, r) => s + Math.log(probabilities.find(p => p.runnerId === r.runnerId)!.probability) / 2, 0);
  assert.ok(Math.abs(summary.market.logLoss! - expected) < 1e-12);
  assert.equal(summary.headToHead[0].v3WinnerRanks.length, 2);
});
test("non-runners never become losing picks; remaining probabilities renormalize", async () => {
  const { shadow, data, template } = await fixture(), low = appendLowForm(data, [shadow], model, now), result = shadowResult(shadow.production);
  const nrId = low.observations[0].market.favourite!;
  result.runners.forEach(r => { r.resultStatus = r.runnerId === nrId ? "non_runner" : "finished"; r.finishingPosition = null; });
  result.runners.find(r => r.runnerId !== nrId)!.finishingPosition = 1;
  result.runners.filter(r => r.runnerId !== nrId && r.finishingPosition === null).forEach((r, i) => { r.finishingPosition = i + 2; });
  result.actualRunnerCount = result.runners.length - 1;
  const settled = settleHurdleV3Shadows({ ...template, observations: [shadow] }, new Map([[shadow.raceId, result]]), new Date(off));
  const summary = summarizeLowForm(low, settled).rows[0];
  assert.equal(summary.market.selections[0].eligible, 0); assert.equal(summary.market.selections[0].winners, 0);
  assert.equal(summary.settled, 1); assert.ok(Number.isFinite(summary.market.logLoss));
});
test("incomplete market retains V3 metrics and monthly cohort coverage", async () => {
  const { shadow, data, template } = await fixture(); shadow.production.completeMarket = false;
  const low = appendLowForm(data, [shadow], model, now);
  const result = shadowResult(shadow.production);
  const settled = settleHurdleV3Shadows({ ...template, observations: [shadow] }, new Map([[shadow.raceId, result]]), new Date(off));
  const summary = summarizeLowForm(low, settled), row = summary.rows[0];
  assert.equal(row.v3.racesSettled, 1); assert.equal(row.market.racesSettled, 0); assert.equal(row.market.logLoss, null);
  assert.equal(row.pairedV3.racesCaptured, 0); assert.equal(row.marketUnavailable, 1);
  assert.equal(summary.rows[3].races, 1); assert.equal(summary.rows[2].races, 0);
  assert.equal(summary.monthly.find(r => r.month === capturedAt.slice(0, 7) && r.cohort === "VERY LOW FORM")!.races, 1);
  for (const month of ["2026-10", "2026-11", "2026-12", "2027-01"]) assert.equal(hurdleMonitoringMonth(`${month}-15`), month);
  const html = renderToStaticMarkup(<LowFormHurdleMonitor data={low} shadows={settled} />);
  assert.match(html, /LOW-FORM HURDLE/); assert.match(html, /VERY LOW \+ LIMITED/); assert.match(html, /Monthly breakdown/);
  assert.match(html, /market unavailable\/incomplete 1/);
});
test("frozen observation fields, epoch and methodology cannot be rewritten", async () => {
  const dir = await mkdtemp(join(tmpdir(), "low-form-immutable-")), path = join(dir, "ledger.json");
  try {
    const { shadow } = await fixture(); await initializeLowForm(path, new Date(now.getTime() - 1000));
    await mutateLowForm(d => appendLowForm(d, [shadow], model, now), path);
    const bytes = await readFile(path, "utf8");
    for (const field of ["classification", "market", "evidence", "shadowHash"] as const) {
      await assert.rejects(mutateLowForm(d => { const other = structuredClone(d); const o = other.observations[0];
        if (field === "classification") o.classification = "MIXED FORM";
        if (field === "market") o.market.runners[0].price = 99;
        if (field === "evidence") o.evidence[0].trainer += 1;
        if (field === "shadowHash") o.shadowHash = "0".repeat(64);
        return other; }, path), /Cannot rewrite/);
    }
    await assert.rejects(mutateLowForm(d => ({ ...d, observations: [] }), path), /Cannot rewrite/);
    await assert.rejects(mutateLowForm(d => ({ ...d, epoch: null }), path), /Cannot rewrite/);
    await assert.rejects(mutateLowForm(d => ({ ...d, sourceHashes: {} }), path), /Cannot rewrite/);
    assert.equal(await readFile(path, "utf8"), bytes);
    assert.equal((await loadLowForm(path))!.observations.length, 1);
    await assert.rejects(initializeLowForm(path), /EEXIST/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test("empty monitor shows no historic observations; Today does not label old/unmatched shadows", async () => {
  const { shadow, data, template } = await fixture();
  assert.equal(summarizeLowForm(data, { ...template, observations: [shadow] }).rows[0].races, 0);
  assert.equal(await HurdleLowFormLabel({ race: shadowResult(shadow.production) }), null);
  assert.equal(await HurdleLowFormLabel({ race: { ...shadowResult(shadow.production), raceId: "other" }, shadow }), null);
  const html = renderToStaticMarkup(<LowFormHurdleMonitor data={data} shadows={template} />);
  assert.match(html, /pending first genuine/);
});
test("monthly summaries keep October, November, December and January separate", async () => {
  const { shadow, data, template } = await fixture();
  let low = { ...data, armedAt: "2026-10-01T00:00:00.000Z" };
  const settledBooks: HurdleV3ShadowObservation[] = [];
  for (const month of ["2026-10", "2026-11", "2026-12", "2027-01"]) {
    const s = structuredClone(shadow), capture = `${month}-15T12:00:00.000Z`;
    s.raceId = month; s.production.raceId = month; s.production.raceDate = `${month}-15`;
    s.capturedAt = capture; s.frozenAt = capture; s.production.capturedAt = capture;
    s.production.scheduledOff = `${month}-15T13:00:00.000Z`;
    low = appendLowForm(low, [s], model, new Date(capture));
    const result = shadowResult(s.production);
    settledBooks.push(settleHurdleV3Shadows({ ...template, observations: [s] }, new Map([[s.raceId, result]]), new Date(s.production.scheduledOff)).observations[0]);
  }
  const summary = summarizeLowForm(low, { ...template, observations: settledBooks });
  assert.equal(summary.rows[3].settled, 4);
  assert.deepEqual(summary.monthly.filter(r => r.cohort === "VERY LOW + LIMITED").map(r => [r.month, r.races, r.settled]),
    [["2026-10", 1, 1], ["2026-11", 1, 1], ["2026-12", 1, 1], ["2027-01", 1, 1]]);
});
test("head-to-head records both criteria and exclusive Top2 hits", async () => {
  for (const winner of ["a", "d"]) {
    const { shadow, data, template } = await fixture();
    shadow.runners.forEach((r, i) => { r.official.probability = [.1, .1, .4, .4][i]; r.official.rank = [3, 4, 1, 2][i]; });
    const low = appendLowForm(data, [shadow], model, now), result = shadowResult(shadow.production);
    result.runners.forEach((r, i) => { r.finishingPosition = r.runnerId === winner ? 1 : i + 2; });
    result.runners.filter(r => r.runnerId !== winner).forEach((r, i) => { r.finishingPosition = i + 2; });
    const settled = settleHurdleV3Shadows({ ...template, observations: [shadow] }, new Map([[shadow.raceId, result]]), new Date(off));
    const h = summarizeLowForm(low, settled).rows[0].headToHead[0];
    assert.equal(h.verdict, winner === "a" ? "MARKET BETTER" : "V3 BETTER");
    assert.equal(h.winnerRankVerdict, h.verdict); assert.equal(h.logLossVerdict, h.verdict);
    assert.equal(h.marketOnlyTop2, winner === "a"); assert.equal(h.v3OnlyTop2, winner === "d");
  }
});
test("established captures stay outside low-form epoch; missing frozen source is explicit", async () => {
  const { shadow, data, template } = await fixture();
  shadow.runners = shadow.runners.map(r => formRunner(r, 3));
  const established = appendLowForm(data, [shadow], model, now);
  assert.equal(established.epoch, null); assert.equal(established.observations[0].classification, "ESTABLISHED FORM");
  assert.equal(summarizeLowForm(established, { ...template, observations: [shadow] }).established, 1);
  assert.equal(summarizeLowForm(established, template).unavailable.length, 1);
  assert.ok(summarizeLowForm(established, template).rows.every(r => r.races === 0));
});

test("Today secondary labels and market selections use only frozen matching observations", async () => {
  const { shadow, data } = await fixture(), low = appendLowForm(data, [shadow], model, now), race = shadowResult(shadow.production);
  const observation = low.observations[0];
  for (const [classification, label] of [["VERY LOW FORM", "VERY LOW"], ["LIMITED FORM", "LIMITED"], ["MIXED FORM", "MIXED"]] as const) {
    const html = renderToStaticMarkup(<LowFormLabel race={race} shadow={shadow} observation={{ ...observation, classification }} />);
    assert.ok(html.includes(`LOW FORM — ${label}`)); assert.match(html, /Market T1 Horse a/); assert.match(html, /frozen comparison only/);
  }
  assert.equal(renderToStaticMarkup(<LowFormLabel race={race} shadow={shadow} observation={{ ...observation, classification: "ESTABLISHED FORM" }} />), "");
  const missing = structuredClone(observation); missing.market = { ...missing.market, status: "MARKET UNAVAILABLE / INCOMPLETE", runners: [], favourite: null, secondFavourite: null };
  assert.match(renderToStaticMarkup(<LowFormLabel race={race} shadow={shadow} observation={missing} />), /MARKET UNAVAILABLE/);
});
