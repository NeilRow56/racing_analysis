import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { raceSoftmax, score } from "../../../scripts/diagnose-independent-tissue-feasibility";
import { CONTEXT_SHADOW_CANDIDATES, CONTEXT_SHADOW_EPOCH } from "./context-weight-shadow-config";
import { contextShadowDefinition, contextShadowHash, predictContextWeightShadow } from "./context-weight-shadow-model";
import { appendContextWeightShadow, buildContextWeightShadow, emptyContextWeightShadow, loadContextWeightShadow, mutateContextWeightShadow,
  settleContextWeightShadow, validContextWeightShadow } from "./context-weight-shadow-forward";
import { contextShadowAfterProduction, pendingContextWeightShadowRaceIds } from "./context-weight-shadow-sync";
import { appendTissueGeneration, mutateTissueGeneration, validGenerationCapture } from "./tissue-generation-forward";
import { predictTissueGeneration } from "./tissue-generation-model";
import { historicalShadowCases, liveShadowBook, liveShadowData, shadowModels, shadowNow, shadowResult } from "./context-weight-shadow.fixtures";

for (const fixed of historicalShadowCases) test(`${fixed.family} fixed historical diagnostic regression, exact selected layer`, () => {
  const before = JSON.stringify(fixed.book), modelBefore = JSON.stringify(shadowModels[fixed.family]);
  const actual = predictContextWeightShadow(fixed.book, shadowModels[fixed.family]);
  actual.forEach((r, i) => { const expected = fixed.expected[i]; assert.equal(r.runnerId, expected.runnerId); assert.equal(r.rank, expected.rank);
    for (const k of ["probability", "productionLogit", "contextContribution", "shadowLogit"] as const) assert.ok(Math.abs(r[k] - expected[k]) < 1e-12, `${k}: ${r[k]} != ${expected[k]}`); });
  assert.equal(JSON.stringify(fixed.book), before); assert.equal(JSON.stringify(shadowModels[fixed.family]), modelBefore);
});

test("AW scales exactly two additions at 75%, Turf only same-OR at 25%; all missingness/base weights stay fixed", () => {
  for (const family of ["AW", "TURF"] as const) {
    const book = liveShadowBook(family), model = shadowModels[family], candidate = CONTEXT_SHADOW_CANDIDATES[family];
    const adjusted = structuredClone(model.adjustment);
    adjusted.names.forEach((n, i) => { if (candidate.features.some(f => f === n)) adjusted.weights[i] *= candidate.multiplier; });
    const expected = raceSoftmax(book.runners.map(r => score(model.baseModel, r.modelInputs) + score(adjusted, r.adjustmentInputs)));
    predictContextWeightShadow(book, model).forEach((r, i) => assert.ok(Math.abs(r.probability - expected[i]) < 1e-12));
    for (const [i, name] of model.adjustment.names.entries()) if (name.endsWith("_missing")) assert.equal(adjusted.weights[i], model.adjustment.weights[i]);
    assert.ok(!candidate.features.some(n => n.endsWith("_missing")));
  }
  assert.equal(CONTEXT_SHADOW_CANDIDATES.AW.multiplier, .75); assert.equal(CONTEXT_SHADOW_CANDIDATES.TURF.multiplier, .25);
});
test("production input/parity failures fail open, including logger failure", async () => {
  const production = liveShadowBook(), bytes = JSON.stringify(production);
  const result = await contextShadowAfterProduction(production, async () => { throw new Error("shadow storage failed"); }, () => { throw new Error("logger failed"); });
  assert.strictEqual(result, production); assert.equal(JSON.stringify(result), bytes);
  const corrupt = structuredClone(production); corrupt.runners[0].probability += .01;
  assert.throws(() => predictContextWeightShadow(corrupt, shadowModels.AW), /parity/);
  assert.equal(JSON.stringify(production), bytes);
  const changed = structuredClone(shadowModels.AW); changed.adjustment.weights[0] += .01;
  assert.throws(() => predictContextWeightShadow(production, changed), /checksum/);
});
test("enabling shadows leaves the canonical production probability/rank output identical", () => {
  for (const family of ["AW", "TURF"] as const) {
    const book = liveShadowBook(family), model = shadowModels[family];
    const input = { family, raceId: book.raceId, capturedAt: book.capturedAt, featureNames: book.featureNames, runners: book.runners };
    const before = predictTissueGeneration(model, input);
    buildContextWeightShadow(book, model, shadowNow);
    assert.deepEqual(predictTissueGeneration(model, input), before);
  }
});
test("Turf exact ties keep the production competition-rank convention", () => {
  const book = liveShadowBook("TURF");
  book.runners.forEach(r => { r.modelInputs = [...book.runners[0].modelInputs]; r.adjustmentInputs = [...book.runners[0].adjustmentInputs];
    r.probability = 1 / book.runners.length; r.rank = 1; });
  assert.ok(predictContextWeightShadow(book, shadowModels.TURF).every(r => r.rank === 1));
});
test("frozen versions and timestamp; no pre-epoch, post-off, stale, future or reconstructed observation", () => {
  const book = liveShadowBook(); assert.ok(validGenerationCapture(book));
  const record = buildContextWeightShadow(book, shadowModels.AW, shadowNow)!;
  assert.ok(validContextWeightShadow(record)); assert.equal(record.candidateVersion, "aw_context_75_shadow_v1");
  assert.equal(record.frozenAt, shadowNow.toISOString()); assert.equal(record.candidateHash, contextShadowHash("AW"));
  assert.equal(contextShadowDefinition("AW").rankMissing, "unchanged");
  const data = appendContextWeightShadow(emptyContextWeightShadow(), [record], shadowNow); assert.equal(data.observations.length, 1);
  for (const now of [new Date(book.scheduledOff), new Date(shadowNow.getTime() + 60001), new Date(shadowNow.getTime() - 1)]) {
    assert.equal(buildContextWeightShadow(book, shadowModels.AW, now), null);
    assert.equal(appendContextWeightShadow(emptyContextWeightShadow(), [record], now).observations.length, 0);
  }
  const old = structuredClone(book); old.capturedAt = new Date(Date.parse(CONTEXT_SHADOW_EPOCH) - 1).toISOString(); old.featureCutoffAt = old.capturedAt;
  old.raceDate = old.capturedAt.slice(0, 10); old.scheduledOff = new Date(Date.parse(CONTEXT_SHADOW_EPOCH) + 3600_000).toISOString();
  assert.ok(validGenerationCapture(old));
  assert.equal(buildContextWeightShadow(old, shadowModels.AW, new Date(old.capturedAt)), null);
  const reconstructed = { ...record, captureMode: "reconstructed" };
  assert.equal(validContextWeightShadow(reconstructed as typeof record), false);
  assert.equal(appendContextWeightShadow(data, [record], shadowNow).observations.length, 1);
});
test("atomic paired ledger freezes predictions/price/source and settled outcomes; production bytes never change", async () => {
  const dir = await mkdtemp(join(tmpdir(), "context-weight-")), path = join(dir, "shadow.json"), productionPath = join(dir, "production.json");
  try {
    const data = liveShadowData("AW", true), observation = data.observations[0];
    await mutateTissueGeneration(d => appendTissueGeneration(d, [observation.production], shadowNow), productionPath);
    const productionBytes = await readFile(productionPath, "utf8");
    await mutateContextWeightShadow(d => appendContextWeightShadow(d, data.observations, shadowNow), path);
    const stored = await loadContextWeightShadow(path); assert.deepEqual(stored, data);
    for (const change of [
      (r: typeof observation) => { r.runners[0].probability += .01; },
      (r: typeof observation) => { r.production.runners[0].capturedPrice = 100; },
      (r: typeof observation) => { r.candidateVersion = "future_v2"; },
      (r: typeof observation) => { r.frozenAt = r.scheduledOff; },
    ]) await assert.rejects(mutateContextWeightShadow(d => { change(d.observations[0]); return d; }, path), /Cannot rewrite/);
    const after = new Date(Date.parse(observation.scheduledOff) + 1000), results = new Map([[observation.raceId, shadowResult(observation.production)]]);
    await mutateContextWeightShadow(d => settleContextWeightShadow(d, results, after), path);
    const settled = await loadContextWeightShadow(path); assert.ok(settled.observations[0].production.runners.every(r => r.outcome));
    assert.deepEqual(settleContextWeightShadow(settled, results, after), settled);
    await assert.rejects(mutateContextWeightShadow(d => { d.observations[0].production.runners[0].outcome!.winner = false; return d; }, path), /Cannot rewrite/);
    assert.equal(await readFile(productionPath, "utf8"), productionBytes);
    assert.deepEqual(await loadContextWeightShadow(join(dir, "missing.json")), emptyContextWeightShadow());
    await writeFile(join(dir, "broken.json"), "broken"); assert.deepEqual(await pendingContextWeightShadowRaceIds(join(dir, "broken.json")), []);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
