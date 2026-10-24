import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { FROZEN_RANK_TOOLTIPS, FrozenRacecardRanks, FrozenValueRankCell } from "./tissue-cells";
import type { FrozenValueDisplay } from "@/lib/racing/tissue-value-view";

function frozen(overrides: Partial<FrozenValueDisplay> = {}): FrozenValueDisplay {
  return { family: "TURF", modelVersion: "tissue_model_v3", valueTrackerVersion: "TURF_TISSUE_V3_VALUE_FORWARD_V1", capturedAt: "2026-10-21T08:00:00.000Z",
    probability: .104, tissueRank: 1, valueRank: 1, marketRank: 12, marketPrice: 21, marketProbability: .0325, modelMarketRatio: 3.2, ...overrides };
}
const text = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const render = (row?: Partial<FrozenValueDisplay>) => renderToStaticMarkup(<FrozenRacecardRanks runner={{ tissueValue: row }} />);

test("Turf v3 displays its saved Tissue, Value and distinct captured market ranks", () => {
  const html = render(frozen()), shown = text(html);
  assert.match(shown, /Tissue 1/); assert.match(shown, /Value 1/); assert.match(shown, /Mkt 12/);
  assert.ok(html.includes("tissue_model_v3")); assert.ok(html.includes("10.40% frozen"));
  for (const kind of ["tissueRank", "valueRank", "marketRank"]) assert.ok(html.includes(`data-rank-kind="${kind}"`));
});
test("AW v2 uses saved ranks, keeping model, value and market orderings distinct", () => {
  const html = render(frozen({ family: "AW", modelVersion: "AW_TISSUE_V2", valueTrackerVersion: "AW_TISSUE_V2_VALUE_FORWARD_V1", tissueRank: 2, valueRank: 4, marketRank: 1 }));
  assert.match(text(html), /Tissue 2.*Value 4.*Mkt 1/); assert.ok(html.includes("AW_TISSUE_V2"));
});
test("all three tooltips explain their own source, and Value says research only", () => {
  const html = render(frozen());
  for (const tooltip of Object.values(FROZEN_RANK_TOOLTIPS)) assert.ok(html.includes(tooltip));
  assert.ok(html.includes("captured 2026-10-21T08:00:00.000Z")); assert.ok(html.includes("captured price 21.00"));
});
test("existing compatible Hurdle and Chase snapshots display without new calculations", () => {
  for (const family of ["HURDLE", "CHASE"] as const) {
    const html = render(frozen({ family, modelVersion: "JUMP_TISSUE_V1", valueTrackerVersion: `${family}_JUMP_TISSUE_V1_VALUE_FORWARD_V1` }));
    assert.match(text(html), /Tissue 1.*Value 1.*Mkt 12/); assert.ok(html.includes("JUMP_TISSUE_V1"));
  }
});
test("no observation shows three clearly labelled dashes", () => {
  const html = render(); assert.match(text(html), /Tissue —.*Value —.*Mkt —/);
  assert.ok(html.includes("No frozen Tissue score/rank available")); assert.ok(html.includes("No captured bookmaker market available"));
  assert.ok(!html.includes("10.40%")); assert.ok(!html.includes("Large model/market disagreement"));
});
test("no frozen Tissue score is distinct from a missing value or market rank", () => {
  const row: Partial<FrozenValueDisplay> = frozen(); delete row.probability;
  const html = render(row); assert.match(text(html), /Tissue —.*Value 1.*Mkt 12/);
  assert.ok(html.includes("No frozen Tissue score/rank available"));
});
test("an absent bookmaker capture never borrows a market from a saved score", () => {
  const row: Partial<FrozenValueDisplay> = frozen(); delete row.marketPrice;
  const html = render(row); assert.match(text(html), /Tissue 1.*Value —.*Mkt —/);
  assert.ok(html.includes("No captured bookmaker market available"));
});
test("a missing Value rank retains the independent Tissue and market ranks", () => {
  const row: Partial<FrozenValueDisplay> = frozen(); delete row.valueRank;
  const html = render(row); assert.match(text(html), /Tissue 1.*Value —.*Mkt 12/);
  assert.ok(html.includes("No frozen Value rank available"));
});
test("a missing market rank is never inferred from available value metrics", () => {
  const row: Partial<FrozenValueDisplay> = frozen(); delete row.marketRank;
  const html = render(row); assert.match(text(html), /Tissue 1.*Value 1.*Mkt —/);
  assert.ok(html.includes("No captured market rank available"));
});
test("invalid individual ranks are shown as missing instead of misleading numbers", () => {
  for (const value of [0, -1, NaN, Infinity, 1.5]) {
    const html = render(frozen({ valueRank: value })); assert.match(text(html), /Value —/);
  }
});
test("large disagreement is a neutral cue at the existing fixed 1.50 boundary", () => {
  for (const ratio of [1.5, 2, 3.2]) {
    const html = render(frozen({ modelMarketRatio: ratio }));
    assert.ok(html.includes('aria-label="Large model/market disagreement"'));
    assert.ok(!/Best bet|Strong value|Recommended|\bBet\b/.test(text(html)));
  }
  for (const ratio of [1.4999, NaN, Infinity]) assert.ok(!render(frozen({ modelMarketRatio: ratio })).includes('aria-label="Large model/market disagreement"'));
});
test("later odds, SP, forecast and legacy model ranks never replace the frozen indicators", () => {
  const runner = { tissueValue: frozen(), oddsDecimal: "2", forecastDecimalOdds: 1.1,
    awTissue: { modelVersion: "AW_TISSUE_V1", rank: 3, probability: .9 }, jumpTissue: { rank: 4, probability: .8 } };
  const before = renderToStaticMarkup(<FrozenRacecardRanks runner={runner} />);
  runner.oddsDecimal = "999"; runner.forecastDecimalOdds = 50; runner.awTissue.rank = 99;
  assert.equal(renderToStaticMarkup(<FrozenRacecardRanks runner={runner} />), before);
  const missing = renderToStaticMarkup(<FrozenRacecardRanks runner={{ ...runner, tissueValue: undefined }} />);
  assert.match(text(missing), /Tissue —.*Value —.*Mkt —/); assert.ok(!missing.includes("AW_TISSUE_V1"));
});
test("Value rank is a direct stored field, independent of what a later price would imply", () => {
  const row = frozen({ tissueRank: 3, valueRank: 8, marketRank: 2, modelMarketRatio: 2.8 });
  const html = renderToStaticMarkup(<FrozenValueRankCell runner={{ tissueValue: row }} kind="valueRank" />);
  assert.match(text(html), /Value 8/); assert.equal(row.valueRank, 8);
});
test("default racecard order is unchanged and the rank group does not sort runners", () => {
  const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  assert.ok(source.includes("runners={race.runners}")); assert.ok(source.includes("{runners.map((runner) => ("));
  assert.ok(!source.includes(".sort("));
  const rows = [frozen({ valueRank: 3 }), frozen({ valueRank: 1 }), frozen({ valueRank: 2 })];
  const html = renderToStaticMarkup(<div>{rows.map((row, i) => <FrozenRacecardRanks key={i} runner={{ tissueValue: row }} />)}</div>);
  assert.ok(text(html).indexOf("Value 3") < text(html).indexOf("Value 1")); assert.ok(text(html).indexOf("Value 1") < text(html).indexOf("Value 2"));
});
test("rank plumbing stays request-batched without database or file access in row rendering", () => {
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  const cells = readFileSync(new URL("./tissue-cells.tsx", import.meta.url), "utf8");
  const reader = readFileSync(new URL("../../../lib/racing/tissue-value-readers.ts", import.meta.url), "utf8");
  assert.equal((page.match(/loadAllTissueValue\(\)/g) ?? []).length, 1);
  assert.ok(reader.includes("cache(async")); assert.ok(reader.includes("Promise.all(")); assert.ok(reader.includes("VALUE_COHORTS.map"));
  const rankCode = cells.slice(cells.indexOf("export const FROZEN_RANK_TOOLTIPS"));
  assert.ok(!/await |readFile|createDbConnection|loadAll|calculateValue|sort\(/.test(rankCode));
});

test("only watched Tissue top-2 badges gain pale red tint and the research tooltip", () => {
  for (const family of ["TURF", "AW", "HURDLE", "CHASE"] as const) for (const tissueRank of [1, 2]) {
    for (const bestL3SpeedRank of [2, 3]) {
      const row = frozen({ family, tissueRank, bestL3SpeedRank });
      const html = renderToStaticMarkup(<FrozenValueRankCell runner={{ tissueValue: row }} kind="tissueRank" />);
      assert.ok(html.includes("border-red-200 bg-red-50"));
      assert.ok(html.includes("Research watch: Tissue top-2 runner with Best L3 Speed rank 2–3."));
      assert.ok(html.includes("no exclusion rule is applied.")); assert.match(text(html), new RegExp(`Tissue ${tissueRank}`));
      assert.ok(!html.includes("0.518"));
      for (const kind of ["valueRank", "marketRank"] as const) {
        const normal = renderToStaticMarkup(<FrozenValueRankCell runner={{ tissueValue: { ...row, bestL3SpeedRank: null } }} kind={kind} />);
        assert.equal(renderToStaticMarkup(<FrozenValueRankCell runner={{ tissueValue: row }} kind={kind} />), normal);
      }
    }
  }
});
test("normal Tissue badge markup stays identical for other or unavailable Speed ranks", () => {
  for (const tissueRank of [1, 2, 3]) for (const bestL3SpeedRank of [1, 4, null, undefined]) {
    assert.equal(render(frozen({ tissueRank, bestL3SpeedRank })), render(frozen({ tissueRank })));
    assert.ok(!render(frozen({ tissueRank, bestL3SpeedRank })).includes("bg-red-50"));
  }
  assert.ok(!render(frozen({ tissueRank: 3, bestL3SpeedRank: 2 })).includes("bg-red-50"));
  const noScore = frozen({ bestL3SpeedRank: 2 }); delete (noScore as Partial<FrozenValueDisplay>).probability;
  assert.ok(!render(noScore).includes("bg-red-50"));
});
