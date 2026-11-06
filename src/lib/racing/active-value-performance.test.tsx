import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { loadAllTissueValue } from "./tissue-value-readers";
import { activeValuePerformance } from "./active-value-performance";
import { frozenValueIndex } from "./tissue-value-view";
import { loadTissueGeneration } from "./tissue-generation-forward";
import { ActiveValuePerformance } from "../../app/racing/research/forward-value/active-value-performance";

test("every latest-book Today marker reconciles, without promoting pre-epoch winners into V2", async () => {
  const datasets = (await loadAllTissueValue()).map(c => c.data);
  const before = JSON.stringify(datasets);
  const summary = activeValuePerformance(datasets);
  const index = frozenValueIndex(datasets);
  assert.deepEqual(summary.leaders.filter(r => r.active).map(r => `${r.raceId}|${r.runnerId}`).sort(),
    [...index].filter(([, r]) => r.valueRank === 1 && r.activeValue1).map(([key]) => key).sort());
  for (const horse of ["Bond Broker", "Diplomatic Ash", "Without Compromise"]) {
    const row = summary.leaders.find(r => r.date === "2026-11-05" && r.horse === horse)!;
    assert.equal(row.active, true);
    assert.equal(row.v2, false);
    assert.equal(row.includedInResearch, false);
    assert.equal(row.runner.outcome?.winner, true);
  }
  const html = renderToStaticMarkup(<ActiveValuePerformance datasets={datasets} generation={await loadTissueGeneration()} date="2026-11-05" />);
  assert.ok(html.includes("All active Value 1 V2 selections"));
  assert.ok(html.includes("Without Compromise"));
  assert.ok(html.includes("Excluded: pre-epoch capture"));
  assert.equal(JSON.stringify(datasets), before);
});

test("latest whole book replaces older leaders and shares frozen settlement and prices", async () => {
  const datasets = (await loadAllTissueValue()).map(c => c.data);
  const source = datasets.flatMap(d => d.races).find(r => r.valueRankPolicy?.legacyRankOne.some(d => d.retained))!;
  const earlier = structuredClone(source);
  earlier.capturedAt = new Date(Date.parse(source.capturedAt) - 1000).toISOString();
  // Simulate a changed declaration: an earlier leader absent from the new whole book must not leak.
  earlier.runners[0].runnerId = "superseded-runner";
  earlier.runners[0].valueRank = 1;
  const data = { ...datasets.find(d => d.version === source.version)!, races: [earlier, source] };
  const result = activeValuePerformance([data]);
  assert.equal(result.leaders.some(r => r.runnerId === "superseded-runner"), false);
  for (const r of result.active) {
    assert.equal(r.runner.marketPrice, source.runners.find(x => x.runnerId === r.runnerId)!.marketPrice);
    assert.deepEqual(r.runner.outcome, source.runners.find(x => x.runnerId === r.runnerId)!.outcome);
  }
  const all = result.families.find(r => r.family === "ALL")!;
  assert.equal(all.tracked, result.active.length);
  assert.equal(all.profitLoss, all.runners > 0 ? result.active.reduce((sum, r) => sum + (r.runner.outcome?.profitLoss ?? 0), 0) : null);
});

test("daily V2 table shows frozen prior runs and totals, with no ROI before settlement", async () => {
  const datasets = (await loadAllTissueValue()).map(c => c.data);
  const generation = await loadTissueGeneration();
  const html = renderToStaticMarkup(<ActiveValuePerformance datasets={datasets} generation={generation} date="2026-11-05" />);
  assert.match(html, /Prior runs/);
  assert.match(html, /4 selections · 4 settled · 0 winners/);
  assert.match(html, /NO V2 — legacy V1 rejected/);
  const pending = structuredClone(datasets);
  for (const d of pending) for (const r of d.races) for (const x of r.runners) x.outcome = null;
  const unsettled = renderToStaticMarkup(<ActiveValuePerformance datasets={pending} generation={generation} date="2026-11-05" />);
  const dailyTotals = unsettled.match(/aria-label="Today V2 totals"[^>]*>(.*?)<\/p>/)![1];
  assert.match(dailyTotals, /4 selections · 0 settled · 0 winners/);
  assert.doesNotMatch(dailyTotals, /ROI/);
});
