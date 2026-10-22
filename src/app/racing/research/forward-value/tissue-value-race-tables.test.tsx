import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TISSUE_VALUE_FAMILIES, type TissueValueFamily } from "@/lib/racing/tissue-value-metrics";
import type { DisplayValueRace } from "@/lib/racing/tissue-value-view";
import { TissueValueRaceTables } from "./tissue-value-race-tables";

const date = "2026-10-21";
function fixture(family: TissueValueFamily = "TURF"): DisplayValueRace {
  return {
    version: "test", family, raceId: family, sourceId: null, raceDate: date,
    course: "Test course", raceName: "Test race", scheduledOff: `${date}T14:00:00Z`,
    capturedAt: `${date}T08:00:00Z`, modelVersion: "test-model", modelChecksum: "a".repeat(64),
    scorerVersion: "test", featureSchemaVersion: "test", featureCutoffAt: `${date}T08:00:00Z`,
    marketSource: "sporting_life_median_bookmaker_at_capture_v1", marketBookSum: 1, declaredRunnerCount: 4,
    runners: [1, 2, 3, 10].map((tissueRank, index) => ({
      runnerId: `runner-${tissueRank}`, horseId: `horse-${tissueRank}`, horseName: `Horse ${tissueRank}`,
      tissueRank, valueRank: [4, 2, 1, 2][index], probability: .25, marketPrice: 4,
      rawMarketProbability: .25, marketProbability: .25, marketRank: index + 1,
      fairOdds: 4, probabilityEdge: 0, modelMarketRatio: [2, 1, 1.5, 1.49][index],
      expectedReturn: 0, probabilityEdgeRank: 1, modelMarketRatioRank: index + 1, outcome: null,
    })),
  };
}
function render(race = fixture()) {
  const html = renderToStaticMarkup(<TissueValueRaceTables races={[race]} date={date} />);
  const rows = [...html.matchAll(/<tbody>([\s\S]*?)<\/tbody>/g)]
    .flatMap(body => [...body[1].matchAll(/<tr class="([^"]*)">([\s\S]*?)<\/tr>/g)])
    .map(row => ({
      className: row[1], html: row[2],
      horse: row[2].match(/<th scope="row"[^>]*>(Horse \d+)/)![1],
      cells: [...row[2].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(cell => cell[1]),
    }));
  return { html, rows };
}
function tissueCell(rank: number, family: TissueValueFamily = "TURF") {
  return render(fixture(family)).rows.find(row => row.horse === `Horse ${rank}`)!.cells[4];
}

test("Tissue rank 1 receives the primary badge with a border and semibold weight", () => {
  const cell = tissueCell(1);
  assert.match(cell, />Tissue 1<\/span>/);
  for (const style of ["rounded-sm", "border-slate-400", "bg-slate-200", "font-semibold", "text-slate-900"])
    assert.ok(cell.includes(style), style);
});

test("Tissue rank 2 receives the lighter secondary badge and medium weight", () => {
  const cell = tissueCell(2);
  assert.match(cell, />Tissue 2<\/span>/);
  for (const style of ["rounded-sm", "border-slate-300", "bg-slate-50", "font-medium", "text-slate-700"])
    assert.ok(cell.includes(style), style);
  assert.ok(!cell.includes("font-semibold"));
});

for (const rank of [3, 10]) test(`Tissue rank ${rank} retains the plain numeric cell`, () => {
  assert.equal(tissueCell(rank), String(rank));
});

test("default rendered order remains ascending Value rank with runner-ID tie breaking and no input mutation", () => {
  const race = fixture(), before = structuredClone(race);
  const { html, rows } = render(race);
  assert.match(html, /<option value="valueRank" selected="">Value rank<\/option>/);
  assert.deepEqual(rows.map(row => row.horse), ["Horse 3", "Horse 10", "Horse 2", "Horse 1"]);
  assert.deepEqual(rows.map(row => row.cells[13]), ["1", "2", "2", "4"]);
  assert.deepEqual(race, before);
});

test("both disagreement backgrounds and labels remain intact, including a primary Tissue badge", () => {
  const { rows } = render();
  const primary = rows.find(row => row.horse === "Horse 1")!;
  assert.equal(primary.className, "bg-amber-100/70");
  assert.match(primary.html, /Large model\/market disagreement · 2.00\+/);
  assert.match(primary.cells[4], /bg-slate-200.*>Tissue 1<\/span>/);
  const moderate = rows.find(row => row.horse === "Horse 3")!;
  assert.equal(moderate.className, "bg-amber-50");
  assert.match(moderate.html, /Large model\/market disagreement · 1.50–&lt;2.00/);
});

test("secondary Tissue badge works within a normal row without adding disagreement styling", () => {
  const { rows } = render();
  const secondary = rows.find(row => row.horse === "Horse 2")!;
  assert.equal(secondary.className, "");
  assert.ok(!secondary.html.includes("Large model/market disagreement"));
  assert.match(secondary.cells[4], /bg-slate-50.*>Tissue 2<\/span>/);
  assert.equal(rows.find(row => row.horse === "Horse 10")!.className, "");
});

test("all four families use identical Tissue highlight semantics", () => {
  for (const family of TISSUE_VALUE_FAMILIES) {
    for (const rank of [1, 2, 3, 10]) assert.equal(tissueCell(rank, family), tissueCell(rank), `${family} Tissue ${rank}`);
  }
});
