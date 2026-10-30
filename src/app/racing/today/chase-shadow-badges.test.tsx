import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { emptyChaseShadow, loadChaseShadow, type ChaseShadowRace } from "@/lib/racing/chase-shadow-forward";
import type { TodayRace } from "@/lib/racing/todays-racing";
import type { FrozenValueDisplay } from "@/lib/racing/tissue-value-view";
import { chaseShadowBadgeRanks } from "./chase-shadow-badges";
import { FrozenRacecardRanks } from "./tissue-cells";

// Only fields consumed by this presentation projection are needed; no model is run.
const race = {
  raceId: "race", raceType: "Chase", raceName: "Handicap Chase", raceTypeCode: null, surface: "Turf",
  runners: ["a", "b", "c"].map(runnerId => ({ runnerId, horseId: `horse-${runnerId}` })),
} as TodayRace;
const book = {
  raceId: "race", coverage: "complete", current: { subtype: "Chase", recordedPreRace: true },
  runners: [1, 2, 3].map((rank, i) => ({ runnerId: ["a", "b", "c"][i], horseId: `horse-${["a", "b", "c"][i]}`, rank })),
} as ChaseShadowRace;
const frozen = (overrides: Partial<FrozenValueDisplay> = {}): Partial<FrozenValueDisplay> => ({
  family: "CHASE", tissueRank: 1, valueRank: 2, marketRank: 3, probability: .4,
  marketPrice: 5, bestL3SpeedRank: 1, ...overrides,
});
function render(card = race, observation: ChaseShadowRace | undefined = book, rows = [frozen(), frozen({ tissueRank: 2 }), frozen({ tissueRank: 3 })]) {
  const ranks = chaseShadowBadgeRanks(card, observation);
  return card.runners.map((runner, i) => renderToStaticMarkup(
    <FrozenRacecardRanks runner={{ tissueValue: rows[i] }} shadowRank={ranks.get(runner.runnerId)} />));
}
const text = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

test("agreement retains separate Tissue 1 and Shadow 1 badges; rank 2 displays independently", () => {
  const html = render();
  assert.match(text(html[0]!), /Tissue 1.*Shadow 1/);
  assert.match(text(html[1]!), /Tissue 2.*Shadow 2/);
  for (const rank of [1, 2]) assert.ok(html[rank - 1]!.includes(`CHASE_SHADOW_V1 research rank ${rank}. Shadow model only; not used for the current Tissue ranking.`));
  assert.ok(html[0]!.includes("border-violet-300"));
  assert.ok(!html[0]!.includes("bg-violet"));
  assert.ok(!html[2]!.includes("Shadow"));
});
test("disagreement retains Tissue badges and all legitimate cross-rank combinations", () => {
  const changed = structuredClone(book);
  changed.runners[0]!.rank = 2; changed.runners[1]!.rank = 1;
  const html = render(race, changed);
  assert.match(text(html[0]!), /Tissue 1.*Shadow 2/);
  assert.match(text(html[1]!), /Tissue 2.*Shadow 1/);
});
test("missing observation, unmatched identities, unavailable coverage and ranks 3+ display nothing", () => {
  assert.equal(chaseShadowBadgeRanks(race).size, 0);
  for (const rank of [null, 3, 4, 0, -1, 1.5, NaN]) {
    const changed = structuredClone(book); changed.runners.forEach(r => { r.rank = rank; });
    assert.ok(render(race, changed).every(html => !html.includes("Shadow")));
  }
  for (const changed of [
    { ...book, raceId: "other" }, { ...book, coverage: "unavailable" as const },
    { ...book, current: { ...book.current, recordedPreRace: false } },
    { ...book, runners: book.runners.map(r => ({ ...r, horseId: "other" })) },
    { ...book, runners: book.runners.map(r => ({ ...r, runnerId: "other" })) },
  ]) assert.equal(chaseShadowBadgeRanks(race, changed).size, 0);
});
test("Turf, AW and Hurdle never show Shadow badges even if a ledger ID matches", () => {
  for (const [raceType, surface] of [["Flat", "Turf"], ["Flat", "Polytrack"], ["Hurdle", "Turf"]]) {
    const card = { ...race, raceType, surface, raceName: `${raceType} race` };
    assert.ok(render(card).every(html => !html.includes("Shadow")));
  }
});
test("red watch, blue longer-price and amber caution coexist with Shadow", () => {
  const cases: Array<[Partial<FrozenValueDisplay>, string, number]> = [
    [{ bestL3SpeedRank: 2 }, "border-red-200 bg-red-50", 0],
    [{ marketPrice: 7 }, "border-blue-200 bg-blue-50", 0],
    [{ tissueRank: 2, inputReliability: { level: "CAUTION", reasons: ["Sparse inputs"] } }, 'aria-label="Tissue input data caution"', 1],
  ];
  for (const [overrides, marker, index] of cases) {
    const html = render(race, book, [frozen(overrides), frozen(overrides), frozen()])[index]!;
    assert.ok(html.includes(marker)); assert.ok(html.includes(`Shadow ${index + 1}`));
  }
  const html = render(race, book, [frozen({ bestL3SpeedRank: 2, marketPrice: 7,
    inputReliability: { level: "CAUTION", reasons: [] } }), frozen(), frozen()])[0]!;
  for (const marker of ["bg-red-50", "bg-blue-50", "border-amber-300", "Shadow 1"]) assert.ok(html.includes(marker));
});
test("projection preserves runner order, Tissue fields and existing badge markup", () => {
  const rows = [frozen({ tissueRank: 3 }), frozen({ tissueRank: 1 }), frozen({ tissueRank: 2 })];
  const before = structuredClone({ race, book, rows });
  const html = render(race, book, rows);
  const noShadow = render(race, { ...book, runners: [] }, rows);
  html.forEach((row, i) => assert.equal(row.replace(/<span class="inline-flex items-center rounded-sm border border-violet-300[^>]*>Shadow [12]<\/span>/g, ""), noShadow[i]));
  assert.deepEqual({ race, book, rows }, before);
  assert.deepEqual(html.map(row => text(row).match(/Tissue (\d)/)?.[1]), ["3", "1", "2"]);
});
test("canonical reader fails safely to an empty ledger when file is missing", async () => {
  assert.deepEqual(await loadChaseShadow("/private/tmp/no-chase-shadow-badge-ledger.json"), emptyChaseShadow());
});
test("Today reads once after existing capture and only passes Shadow to display", async () => {
  const page = await readFile("src/app/racing/today/page.tsx", "utf8");
  assert.equal((page.match(/loadChaseShadow\(\)/g) ?? []).length, 1);
  assert.ok(page.indexOf("loadChaseShadow().catch") > page.indexOf("syncJumpTissueMeetings(connection"));
  assert.match(page, /shadowRanks=\{chaseShadowBadgeRanks\(race, chaseShadow\)\}/);
  assert.match(page, /shadowRank=\{shadowRanks.get\(runner.runnerId\)\}/);
  assert.match(page, /FrozenRacecardRanks runner=\{runner\} shadowRank=\{shadowRank\}/);
  assert.doesNotMatch(page, /buildChaseShadow|score\(|raceSoftmax|\.sort\(/);
});
