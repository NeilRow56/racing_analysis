import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { isTissue1Value1Agreement, TISSUE_VALUE_AGREEMENT_TOOLTIP } from "@/lib/racing/tissue-value-agreement";
import { buildNonRedTissueDailyList, formatNonRedTissueDailyList } from "@/lib/racing/non-red-tissue-daily-list";
import type { FrozenValueDisplay } from "@/lib/racing/tissue-value-view";
import type { TodayMeeting, TodayRunner } from "@/lib/racing/todays-racing";
import { FrozenRacecardRanks, FrozenValueRankCell } from "./tissue-cells";
import { NonRedTissueDailyList } from "./non-red-tissue-daily-list";

const marker = 'aria-label="Tissue 1 and Value 1 agreement"';
function frozen(overrides: Partial<FrozenValueDisplay> = {}): FrozenValueDisplay {
  return { family: "TURF", modelVersion: "tissue_model_v3", valueTrackerVersion: "TURF_TISSUE_V3_VALUE_FORWARD_V1",
    capturedAt: "2026-11-03T08:00:00.000Z", probability: .3, tissueRank: 1, valueRank: 1,
    marketRank: 3, marketPrice: 4.5, marketProbability: .2, modelMarketRatio: 1.5, bestL3SpeedRank: 1, ...overrides };
}
const runner = (id: string, observation?: FrozenValueDisplay): TodayRunner => ({
  runnerId: id, horseName: id, tissueValue: observation,
}) as TodayRunner;
const meeting = (runners: TodayRunner[]): TodayMeeting => ({ courseName: "Worcester", races: [{
  raceId: "race", scheduledTime: "14:30", raceDateTime: null, courseCountry: "ENG", runners,
}] }) as TodayMeeting;
const card = (row?: Partial<FrozenValueDisplay>) => renderToStaticMarkup(<FrozenRacecardRanks runner={{ tissueValue: row }} />);

test("agreement requires exact rank 1 on the same frozen runner; missing and invalid ranks fail safely", () => {
  assert.equal(isTissue1Value1Agreement({ tissueRank: 1, valueRank: 1 }), true);
  for (const row of [undefined, null, {}, { tissueRank: 1 }, { valueRank: 1 },
    ...[2, 3, 0, -1, 1.5, NaN, Infinity, null, undefined].flatMap(rank => [
      { tissueRank: rank, valueRank: 1 }, { tissueRank: 1, valueRank: rank },
    ]),
  ]) assert.equal(isTissue1Value1Agreement(row), false);
});

test("all families identify agreement once beside the unchanged Tissue badge, without changing Value/market cells", () => {
  for (const family of ["TURF", "AW", "HURDLE", "CHASE"] as const) {
    const row = frozen({ family }), before = structuredClone(row), html = card(row);
    assert.equal(html.split(marker).length - 1, 1);
    assert.match(html, /border-green-700 bg-green-100/);
    assert.match(html, />T1=V1<\/span>/);
    assert.ok(html.includes(TISSUE_VALUE_AGREEMENT_TOOLTIP));
    assert.match(html, /bg-slate-900 text-white/);
    assert.match(html, /Tissue<\/span><span class="font-semibold">1/);
    for (const kind of ["valueRank", "marketRank"] as const) {
      const render = (value: FrozenValueDisplay) => renderToStaticMarkup(<FrozenValueRankCell runner={{ tissueValue: value }} kind={kind} />);
      assert.equal(render(row), render({ ...row, tissueRank: 2 }));
      assert.ok(!render(row).includes(marker));
    }
    assert.deepEqual(row, before);
  }
});

test("different T1/V1 horses in the same race get no marker or special inclusion", () => {
  const t1 = frozen({ valueRank: 2, marketPrice: 8 }), v1 = frozen({ tissueRank: 2, marketPrice: 4.5 });
  for (const row of [t1, v1]) assert.ok(!card(row).includes(marker));
  assert.deepEqual(buildNonRedTissueDailyList([meeting([runner("Tissue leader", t1), runner("Value leader", v1)])]), []);
});

test("agreement includes 2.50, 4.50 and 8.00 in every family, once even when normal T1 also qualifies", () => {
  for (const family of ["TURF", "AW", "HURDLE", "CHASE"] as const) for (const marketPrice of [2.5, 4.5, 8]) {
    const input = [meeting([runner("Horse Name", frozen({ family, marketPrice }))])], before = JSON.stringify(input);
    const rows = buildNonRedTissueDailyList(input);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].agreement, true);
    assert.equal(formatNonRedTissueDailyList(rows), "Worcester 14:30 Horse Name — T1 — T1=V1");
    const html = renderToStaticMarkup(<NonRedTissueDailyList date="3 November 2026" rows={rows} clipboardText={formatNonRedTissueDailyList(rows)} />);
    assert.equal(html.split(marker).length - 1, 1);
    assert.match(html, /1 selection · 1 race/);
    assert.equal(JSON.stringify(input), before);
  }
});

test("pale-red agreement is included while red, Price, Data and Shadow meanings remain separate", () => {
  for (const bestL3SpeedRank of [2, 3]) for (const shadowRank of [1, 2] as const) {
    const row = frozen({ family: "CHASE", marketPrice: 8, bestL3SpeedRank,
      inputReliability: { level: "CAUTION", reasons: ["Sparse frozen inputs."] } });
    const input = [meeting([runner("Red agreement", row)])], before = JSON.stringify(input);
    const rows = buildNonRedTissueDailyList(input);
    assert.equal(rows.length, 1); assert.equal(rows[0].speedWatch, true);
    const html = renderToStaticMarkup(<FrozenRacecardRanks runner={{ tissueValue: row }} shadowRank={shadowRank} />);
    for (const expected of [marker, "border-red-200 bg-red-50", "border-blue-300 bg-blue-50", ">Price</span>",
      'aria-label="Tissue input data caution"', ">Data</span>", "border-violet-300", `>Shadow ${shadowRank}</span>`]) assert.ok(html.includes(expected), expected);
    assert.ok(!html.includes("bg-slate-900"));
    const list = renderToStaticMarkup(<NonRedTissueDailyList date="3 November 2026" rows={rows} clipboardText={formatNonRedTissueDailyList(rows)} />);
    assert.ok(list.includes(marker)); assert.match(list, /border-red-200 bg-red-50/);
    assert.match(list, /aria-label="Pale-red Speed watch"/);
    const copied = formatNonRedTissueDailyList(rows);
    assert.equal(copied, "Worcester 14:30 Red agreement — T1 — T1=V1 — pale-red Speed watch");
    assert.equal(copied.split("T1=V1").length - 1, 1);
    assert.equal(copied.split("\n").length, 1);
    assert.equal(JSON.stringify(input), before);
  }
});

test("missing frozen Value ranks preserve normal T1/T2 rules without agreement or live-rank fallback", () => {
  for (const tissueRank of [1, 2]) {
    const row = frozen({ tissueRank, marketPrice: tissueRank === 1 ? 4.5 : 8 });
    delete (row as Partial<FrozenValueDisplay>).valueRank;
    assert.ok(!card(row).includes(marker));
    const rows = buildNonRedTissueDailyList([meeting([runner("Normal watch", row)])]);
    assert.equal(rows.length, 1); assert.equal(rows[0].agreement, false);
  }
  for (const row of [undefined, { tissueRank: 1, valueRank: 1 }, { ...frozen(), probability: undefined }, { ...frozen(), marketPrice: undefined }]) {
    assert.ok(!card(row).includes(marker));
  }
  const live = runner("Live only");
  Object.assign(live, { awTissue: { rank: 1 }, jumpTissue: { rank: 1 }, valueRank: 1, oddsDecimal: "4.5" });
  assert.deepEqual(buildNonRedTissueDailyList([meeting([live])]), []);
  assert.ok(!card().includes(marker));
});

test("later prices and other model ranks cannot change frozen agreement inclusion or identification", () => {
  const input = [meeting([runner("Frozen agreement", frozen({ marketPrice: 8 }))])];
  const beforeRows = buildNonRedTissueDailyList(input), beforeHtml = card(input[0].races[0].runners[0].tissueValue);
  for (const oddsDecimal of ["2", "5", "99"]) {
    Object.assign(input[0].races[0].runners[0], { oddsDecimal, forecastDecimalOdds: Number(oddsDecimal),
      startingPriceDecimal: oddsDecimal, bookmakerQuotes: [{ decimalOdds: Number(oddsDecimal) }],
      awTissue: { rank: 3 }, jumpTissue: { rank: 4 } });
    assert.deepEqual(buildNonRedTissueDailyList(input), beforeRows);
    assert.equal(card(input[0].races[0].runners[0].tissueValue), beforeHtml);
  }
});
