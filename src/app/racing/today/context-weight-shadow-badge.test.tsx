import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { readFile } from "node:fs/promises";
import { ContextWeightShadowBadge } from "./context-weight-shadow-badge";
import { FrozenRacecardRanks } from "./tissue-cells";
import { contextWeightShadowViews, type ContextShadowView } from "@/lib/racing/context-weight-shadow-view";
import { liveShadowData, shadowMeetings } from "@/lib/racing/context-weight-shadow.fixtures";

for (const family of ["AW", "TURF"] as const) test(`${family} shows a neutral badge only for an exact matching frozen production capture`, () => {
  const data = liveShadowData(family), meetings = shadowMeetings(data.observations[0].production), before = structuredClone(meetings);
  const views = contextWeightShadowViews(meetings, data); assert.equal(views.size, data.observations[0].runners.length);
  const view = [...views.values()][0], html = renderToStaticMarkup(<ContextWeightShadowBadge observation={view} />);
  assert.ok(html.includes(family === "AW" ? "AW SHADOW 75%" : "TURF SHADOW 25%"));
  assert.ok(html.includes("Observation only")); assert.ok(html.includes("does not affect the live production selection"));
  assert.ok(html.includes(view.candidateVersion)); assert.ok(html.includes("Probability difference"));
  for (const selectionStyle of ["bg-emerald", "bg-blue", "bg-amber", "bg-red", "Trust Score"]) assert.ok(!html.includes(selectionStyle));
  assert.deepEqual(meetings, before);
  meetings[0].races[0].runners[0].activeTissue!.capturedAt = "2026-11-01T00:00:00.000Z";
  assert.equal(contextWeightShadowViews(meetings, data).size, views.size - 1);
});
test("Jump, non-runners and missing observations receive no context badge", () => {
  const data = liveShadowData(), meetings = shadowMeetings(data.observations[0].production);
  meetings[0].races[0].raceType = "Hurdle"; meetings[0].races[0].raceName = "Fixture Hurdle";
  assert.equal(contextWeightShadowViews(meetings, data).size, 0);
  assert.equal(renderToStaticMarkup(<ContextWeightShadowBadge />), "");
  const flat = shadowMeetings(data.observations[0].production); flat[0].races[0].runners[0].resultStatus = "non_runner";
  assert.equal(contextWeightShadowViews(flat, data).size, data.observations[0].runners.length - 1);
});
test("rank movement is explicit without a made-up probability threshold; production styling is byte-identical", () => {
  const production = { activeTissue: { rank: 4, probability: .12, family: "AW", modelVersion: "AW_TISSUE_V3", capturedAt: "2026-11-08T12:00:00.000Z" }, tissueGenerationActive: true };
  const view: ContextShadowView = { family: "AW", candidateVersion: "aw_context_75_shadow_v1", capturedAt: "2026-11-08T12:00:00.000Z",
    productionProbability: .12, shadowProbability: .13, productionRank: 4, shadowRank: 2 };
  const before = structuredClone(production), baseline = renderToStaticMarkup(<FrozenRacecardRanks runner={production} />);
  const full = renderToStaticMarkup(<><FrozenRacecardRanks runner={production} /><ContextWeightShadowBadge observation={view} /></>);
  assert.ok(full.startsWith(baseline)); assert.ok(full.includes("Shadow: 4 → 2")); assert.deepEqual(production, before);
  assert.ok(!renderToStaticMarkup(<ContextWeightShadowBadge observation={{ ...view, shadowRank: 4 }} />).includes("Shadow: 4"));
});
test("Daily projection reads the persisted ledger after capture and keeps the production rank component intact", async () => {
  const page = await readFile("src/app/racing/today/page.tsx", "utf8");
  assert.equal((page.match(/profileCall\("loadContextWeightShadow", loadContextWeightShadow\)/g) ?? []).length, 1);
  assert.ok(page.indexOf("const contextShadows =") > page.indexOf('profileCall("syncTissueGeneration", syncTissueGeneration, connection!'));
  assert.ok(page.includes('profileCall("loadContextWeightShadow", loadContextWeightShadow).then(data => contextWeightShadowViews'));
  assert.ok(page.includes("FrozenRacecardRanks runner={runner} shadowRank={shadowRank}"));
  assert.ok(page.includes("ContextWeightShadowBadge observation={contextShadow}"));
});
