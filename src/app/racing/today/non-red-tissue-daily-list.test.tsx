import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { buildNonRedTissueDailyList, formatNonRedTissueDailyList, isTissueDailyWatchCandidate } from "@/lib/racing/non-red-tissue-daily-list";
import type { TodayMeeting, TodayRunner } from "@/lib/racing/todays-racing";
import { NonRedTissueDailyList } from "./non-red-tissue-daily-list";

function runner(tissueRank: number, bestL3SpeedRank?: number | null, valueRank = 99, family = "TURF"): TodayRunner {
  return { runnerId: `runner-${tissueRank}`, horseName: `Horse ${tissueRank}`,
    tissueValue: { family, tissueRank, bestL3SpeedRank, valueRank, probability: .321, marketPrice: tissueRank === 1 ? 4.5 : 8 },
  } as TodayRunner;
}

function meeting(courseName = "Cheltenham", time = "13:50", runners = [runner(1), runner(2)]): TodayMeeting {
  return { courseName, races: [{ raceId: `${courseName}-${time}`, scheduledTime: time,
    raceDateTime: null, courseCountry: "ENG", runners }] } as TodayMeeting;
}

test("Tissue 1 and 2 qualify independently of Value rank; both remain in the same race", () => {
  for (const valueRank of [1, 2, 99]) {
    const rows = buildNonRedTissueDailyList([meeting("Cheltenham", "13:50", [runner(1, 1, valueRank), runner(2, 4, valueRank)])]);
    assert.deepEqual(rows.map(row => row.horseName), ["Horse 1", "Horse 2"]);
    assert.equal(new Set(rows.map(row => row.raceId)).size, 1);
  }
});

test("all families exclude watched Tissue top two and include other Speed ranks", () => {
  for (const family of ["TURF", "AW", "HURDLE", "CHASE"]) for (const rank of [1, 2]) {
    for (const speed of [1, 2, 3, 4, null, undefined]) {
      const rows = buildNonRedTissueDailyList([meeting("Test", "14:00", [runner(rank, speed, 99, family)])]);
      assert.equal(rows.length, speed === 2 || speed === 3 ? 0 : 1, `${family}: Tissue ${rank}, Speed ${speed}`);
    }
  }
});

test("rank 3+ never qualifies even with Value rank 1; absent canonical ranks have no fallback", () => {
  for (const rank of [3, 4, 20]) for (const speed of [1, 2, 3, 4, null]) {
    assert.deepEqual(buildNonRedTissueDailyList([meeting("Test", "14:00", [runner(rank, speed, 1)])]), []);
  }
  const missing = runner(1);
  delete missing.tissueValue;
  assert.deepEqual(buildNonRedTissueDailyList([meeting("Test", "14:00", [missing])]), []);
});

test("sorts by displayed race time then course while retaining stable runner order and input", () => {
  const meetings = [meeting("Kempton", "18:30"), meeting("Newbury", "13:50"), meeting("Cheltenham", "13:50")];
  const before = JSON.stringify(meetings);
  const rows = buildNonRedTissueDailyList(meetings);
  assert.deepEqual(rows.map(row => `${row.course} ${row.time} ${row.horseName}`), [
    "Cheltenham 13:50 Horse 1", "Cheltenham 13:50 Horse 2",
    "Newbury 13:50 Horse 1", "Newbury 13:50 Horse 2",
    "Kempton 18:30 Horse 1", "Kempton 18:30 Horse 2",
  ]);
  assert.equal(JSON.stringify(meetings), before);
});

test("uses the same BST-aware race time as the Today heading", () => {
  const card = meeting();
  card.races[0].raceDateTime = new Date("2026-10-24T12:50:00Z");
  card.races[0].scheduledTime = "12:50";
  assert.equal(buildNonRedTissueDailyList([card])[0].time, "13:50");
});

test("copy text contains only qualifying course, time, horse and Tissue rank; UI shows date and counts", () => {
  const rows = buildNonRedTissueDailyList([meeting("Cheltenham", "13:50", [runner(1), runner(2), runner(3), runner(1, 2)])]);
  const clipboardText = formatNonRedTissueDailyList(rows);
  assert.equal(clipboardText, "Cheltenham 13:50 Horse 1 — T1\nCheltenham 13:50 Horse 2 — T2");
  const html = renderToStaticMarkup(<NonRedTissueDailyList date="24 October 2026" rows={rows} clipboardText={clipboardText} />);
  assert.match(html, /Tissue Watch List — 24 October 2026/);
  assert.match(html, /Research watch list/);
  assert.match(html, /T1 3.00–&lt;6.00 · T2 6.00–&lt;11.00 · excludes pale-red Speed watch/);
  assert.doesNotMatch(html, /Horse 3/);
  const component = readFileSync(new URL("./non-red-tissue-daily-list.tsx", import.meta.url), "utf8");
  assert.match(component, /navigator.clipboard.writeText\(clipboardText\)/);
  assert.match(component, /onClick=\{copyList\}/);
  assert.match(html, /2 selections · 1 race/);
  assert.match(html, /Copy daily list/);
  assert.match(html, /Cheltenham 13:50 Horse 1/);
  assert.doesNotMatch(html, /0\.321|32\.1|12\.5|Value|probability/);
});

test("empty input and all-watch cards show the requested empty state and disable copying", () => {
  for (const meetings of [[], [meeting("Test", "14:00", [runner(1, 2), runner(2, 3)])]]) {
    const rows = buildNonRedTissueDailyList(meetings);
    assert.equal(formatNonRedTissueDailyList(rows), "");
    const html = renderToStaticMarkup(<NonRedTissueDailyList date="24 October 2026" rows={rows} clipboardText="" />);
    assert.match(html, /No Tissue Watch List selections for today\./);
    assert.match(html, /0 selections · 0 races/);
    assert.match(html, /disabled=""/);
  }
});

test("Today summary consumes final attached racecard data and the shared watch helper", () => {
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  assert.ok(page.indexOf("const dailyList =") > page.indexOf("attachFrozenValueToMeetings(attachJump"));
  assert.match(page, /buildNonRedTissueDailyList\(displayData.status === "ok" \? displayData.meetings : \[\]\)/);
  const helper = readFileSync(new URL("../../../lib/racing/non-red-tissue-daily-list.ts", import.meta.url), "utf8");
  assert.match(helper, /isTissueTop2SpeedRankWatch\(candidate\)/);
  assert.match(helper, /capturedPrice: tissueValue\?\.marketPrice/);
  assert.match(page, /clipboardText=\{formatNonRedTissueDailyList\(dailyList\)\}/);
  assert.doesNotMatch(helper, /valueRank|bestL3SpeedRank\s*===/);
});

test("input reliability never changes the daily research shortlist", () => {
  const card = meeting("Test", "14:00", [runner(1, 1), runner(2, 4)]);
  const before = buildNonRedTissueDailyList([card]);
  for (const level of ["GOOD", "CAUTION", "UNKNOWN"] as const) {
    for (const runner of card.races[0].runners) runner.tissueValue!.inputReliability = { level, reasons: [] };
    assert.deepEqual(buildNonRedTissueDailyList([card]), before);
  }
});

test("live odds, forecast, final SP and Betfair SP never replace a missing or frozen captured price", () => {
  for (const marketPrice of [4.5, 8, null, undefined]) {
    const candidate = { ...runner(1), oddsDecimal: "4.5", forecastDecimalOdds: 4.5,
      startingPriceDecimal: "4.5", betfairSp: 4.5, bookmakerQuotes: [{ decimalOdds: 4.5 }],
      tissueValue: { ...runner(1).tissueValue!, marketPrice } } as unknown as TodayRunner;
    const input = meeting("Test", "14:00", [candidate]);
    const before = buildNonRedTissueDailyList([input]);
    assert.equal(before.length, marketPrice === 4.5 ? 1 : 0);
    for (const price of [2, 6, 11, 23]) {
      Object.assign(candidate, { oddsDecimal: String(price), forecastDecimalOdds: price,
        startingPriceDecimal: String(price), betfairSp: price, bookmakerQuotes: [{ decimalOdds: price }] });
      assert.deepEqual(buildNonRedTissueDailyList([input]), before);
    }
  }
});

for (const [tissueRank, capturedPrice, bestL3SpeedRank, expected] of [
  [1, 3, 1, true], [1, 5.99, 4, true], [1, 6, 1, false], [1, 2.99, 1, false],
  [1, 4, 2, false], [1, 4, 3, false],
  [2, 6, 1, true], [2, 10.99, 4, true], [2, 11, 1, false], [2, 5.99, 1, false],
  [2, 8, 2, false], [2, 8, 3, false], [3, 8, 1, false],
  [1, null, 1, false], [2, undefined, 1, false], [1, NaN, 1, false], [2, Infinity, 1, false],
  [1, 4, null, true], [2, 8, undefined, true], [null, 4, 1, false], [undefined, 8, 1, false],
] as const) test(`daily watch Tissue ${tissueRank}, price ${capturedPrice}, Speed ${bestL3SpeedRank}: ${expected}`, () => {
  assert.equal(isTissueDailyWatchCandidate({ tissueRank, capturedPrice, bestL3SpeedRank }), expected);
  const candidate = runner(tissueRank ?? 0, bestL3SpeedRank);
  Object.assign(candidate.tissueValue!, { tissueRank, marketPrice: capturedPrice });
  assert.equal(buildNonRedTissueDailyList([meeting("Test", "14:00", [candidate])]).length, expected ? 1 : 0);
});

test("all qualifying runners are shown without a Best-10 cap", () => {
  const meetings = Array.from({ length: 12 }, (_, index) => meeting(`Course ${index}`));
  const rows = buildNonRedTissueDailyList(meetings);
  assert.equal(rows.length, 24);
  assert.equal(new Set(rows.map(row => row.raceId)).size, 12);
  assert.equal(formatNonRedTissueDailyList(rows).split("\n").length, 24);
});

test("out-of-range non-red runners show the empty state without the old broad fallback", () => {
  const candidates = [runner(1), runner(2)];
  candidates[0].tissueValue!.marketPrice = 6;
  candidates[1].tissueValue!.marketPrice = 11;
  const rows = buildNonRedTissueDailyList([meeting("Test", "14:00", candidates)]);
  assert.deepEqual(rows, []);
  const html = renderToStaticMarkup(<NonRedTissueDailyList date="1 November 2026" rows={rows} clipboardText={formatNonRedTissueDailyList(rows)} />);
  assert.match(html, /No Tissue Watch List selections for today\./);
  assert.doesNotMatch(html, /Horse 1|Horse 2/);
});
