import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { FrozenValueDisplay } from "@/lib/racing/tissue-value-view";
import type { TodayRunner } from "@/lib/racing/todays-racing";
import { FrozenValueRankCell } from "./tissue-cells";
import { tissueMarketBadge } from "./tissue-market-badge";

const frozen = (overrides: Partial<FrozenValueDisplay> = {}): FrozenValueDisplay => ({
  family: "HURDLE", modelVersion: "HURDLE_TISSUE_V2", capturedAt: "2026-11-10T08:00:00Z",
  valueTrackerVersion: "fixture", probability: .32, marketProbability: .4, marketPrice: 2,
  tissueRank: 1, marketRank: 1, valueRank: 4, modelMarketRatio: .8, ...overrides,
});
const render = (runner: Parameters<typeof FrozenValueRankCell>[0]["runner"], kind: "tissueRank" | "valueRank" | "marketRank" = "tissueRank") =>
  renderToStaticMarkup(<FrozenValueRankCell runner={runner} kind={kind} />);

for (const [probability, marketProbability, state, edge] of [
  [.35, .3, "positive", "+5.0"], [.32, .4, "negative", "-8.0"],
  [.3, .3, "neutral", "0.0"], [.304, .3, "neutral", "+0.4"], [.296, .3, "neutral", "-0.4"],
  [.305, .3, "positive", "+0.5"], [.295, .3, "negative", "-0.5"],
] as const) test(`frozen Tissue ${probability} vs market ${marketProbability}: ${state}`, () => {
  for (const tissueRank of [1, 2, 3, 12]) {
    const tissueValue = frozen({ probability, marketProbability, tissueRank, valueRank: undefined });
    const before = structuredClone(tissueValue), html = render({ tissueValue });
    assert.ok(html.includes(`data-tissue-market-state="${state}"`));
    assert.ok(html.includes(`Edge ${edge} pp`));
    assert.ok(html.includes(`Tissue ${(probability * 100).toFixed(1)}%`));
    assert.ok(html.includes(`Market ${(marketProbability * 100).toFixed(1)}%`));
    assert.ok(html.includes('tabindex="0"'));
    assert.ok(html.includes("group-hover:block group-focus:block"));
    assert.ok(html.includes("this is not Value rank"));
    assert.match(html, new RegExp(`font-semibold">${tissueRank}</span>`));
    assert.ok(html.includes(state === "negative" ? "border-amber-300 bg-amber-50" : state === "neutral" ? "border-slate-300 bg-slate-100" : tissueRank === 1 ? "bg-slate-900 text-white" : tissueRank === 2 ? "bg-blue-800 text-white" : "bg-slate-50"));
    assert.deepEqual(tissueValue, before);
  }
});

test("missing/invalid probabilities retain the original badge and never infer market from price", () => {
  for (const marketProbability of [undefined, null, NaN, Infinity, 0, -1, 1.1]) {
    assert.equal(tissueMarketBadge(.32, marketProbability), null);
    const html = render({ tissueValue: frozen({ marketProbability: marketProbability ?? undefined }) });
    assert.ok(!html.includes("data-tissue-market-state"));
    assert.ok(html.includes("bg-slate-900 text-white"));
  }
  for (const probability of [undefined, null, NaN, Infinity, -1, 1.1]) {
    assert.equal(tissueMarketBadge(probability, .4), null);
    assert.ok(!render({ tissueValue: frozen({ probability: probability ?? undefined }) }).includes("data-tissue-market-state"));
  }
});

test("NR takes precedence and keeps frozen audit information", () => {
  for (const probability of [.32, .4, .5]) {
    const html = render({ resultStatus: "non_runner", tissueValue: frozen({ probability }) });
    assert.ok(html.includes("Frozen Tissue 1"));
    assert.ok(html.includes(`${(probability * 100).toFixed(2)}% frozen`));
    assert.ok(!html.includes("data-tissue-market-state"));
    assert.ok(!html.includes("bg-amber"));
    assert.ok(!html.includes('tabindex="0"'));
  }
});

test("production Hurdle V2 uses only its matching frozen market, never V3 shadow or live odds", () => {
  const tissueValue = frozen();
  const activeTissue = { rank: 1, probability: .32, family: "HURDLE", modelVersion: tissueValue.modelVersion, capturedAt: tissueValue.capturedAt };
  const runner = { tissueValue, activeTissue, tissueGenerationActive: true, odds: "1/10",
    hurdleV3Shadow: { probability: .8, rank: 2, modelVersion: "HURDLE_TISSUE_V3_SHADOW" } };
  const html = render(runner);
  assert.ok(html.includes('data-tissue-market-state="negative"'));
  assert.ok(html.includes("Tissue 32.0% · Market 40.0% · Edge -8.0 pp"));
  const changedLiveAndShadow = { ...runner, odds: "100/1", hurdleV3Shadow: { ...runner.hurdleV3Shadow, probability: .1 } };
  assert.equal(render(changedLiveAndShadow), html);
  for (const mismatch of [{ capturedAt: "2026-11-10T09:00:00Z" }, { modelVersion: "HURDLE_TISSUE_V3_SHADOW" }, { probability: .8 }, { family: "CHASE" }]) {
    assert.ok(!render({ ...runner, activeTissue: { ...activeTissue, ...mismatch } }).includes("data-tissue-market-state"));
  }
  assert.ok(!render({ activeTissue, tissueGenerationActive: true }).includes("data-tissue-market-state"));
  assert.ok(!render({ tissueValue, tissueGenerationActive: true }).includes("data-tissue-market-state"));
});

test("comparison leaves Value and market rank cells identical and preserves Speed watch information", () => {
  for (const kind of ["valueRank", "marketRank"] as const) {
    assert.equal(render({ tissueValue: frozen({ probability: .5 }) }, kind), render({ tissueValue: frozen({ probability: .32 }) }, kind));
  }
  const runner: Partial<TodayRunner> = { tissueValue: frozen({ bestL3SpeedRank: 2 }) };
  const html = render(runner);
  assert.ok(html.includes('data-tissue-market-state="negative"'));
  assert.ok(html.includes("bg-amber-50"));
  assert.ok(html.includes("decoration-red-300"));
  assert.ok(html.includes("no exclusion rule is applied"));
});


test("active same-capture market renders independently of legacy Value and V3; incomplete and NR take precedence", () => {
  for (const [probability, marketProbability, expected] of [[.35, .3, "positive"], [.303, .3, "neutral"], [.25, .3, "negative"]] as const) {
    const activeTissue = { rank: 1, probability, family: "HURDLE", modelVersion: "HURDLE_TISSUE_V2",
      capturedAt: "2026-11-10T08:00:00Z", completeMarket: true, marketProbability, capturedPrice: 3,
      bookIdentity: "race|2026-11-10T08:00:00Z", marketSource: "sporting_life_median_bookmaker_at_capture_v1" };
    const runner = { activeTissue, tissueGenerationActive: true, odds: "1/10",
      hurdleV3Shadow: { probability: .99, rank: 2 }, tissueValue: frozen({ probability: .9, marketProbability: .01, capturedAt: "2026-11-10T09:00:00Z" }) };
    const before = structuredClone(runner), html = render(runner);
    assert.ok(html.includes(`data-tissue-market-state="${expected}"`));
    assert.ok(html.includes("Market 30.0%"));
    assert.ok(html.includes("complete market yes")); assert.ok(html.includes(activeTissue.bookIdentity));
    assert.ok(render({ activeTissue, tissueGenerationActive: true }).includes(`data-tissue-market-state="${expected}"`));
    const changedLiveAndShadow = { ...runner, odds: "100/1", hurdleV3Shadow: { probability: .01, rank: 1 } };
    assert.equal(render(changedLiveAndShadow), html);
    const incomplete = render({ ...runner, activeTissue: { ...activeTissue, completeMarket: false } });
    assert.ok(!incomplete.includes("data-tissue-market-state"));
    const nr = render({ ...runner, resultStatus: "non_runner" });
    assert.ok(!nr.includes("data-tissue-market-state")); assert.ok(nr.includes("Frozen Tissue 1"));
    assert.ok(nr.includes(`${(probability * 100).toFixed(2)}% frozen`));
    for (const kind of ["valueRank", "marketRank"] as const) assert.equal(render(runner, kind), render({ ...runner, activeTissue: { ...activeTissue, marketProbability: .9 } }, kind));
    assert.deepEqual(runner, before);
  }
});
