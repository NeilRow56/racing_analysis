import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { buildNonRedTissueDailyList, formatNonRedTissueDailyList } from "@/lib/racing/non-red-tissue-daily-list";
import type { TodayMeeting, TodayRunner } from "@/lib/racing/todays-racing";
import { NonRedTissueDailyList } from "./non-red-tissue-daily-list";

function runner(tissueRank: number, bestL3SpeedRank?: number | null, valueRank = 99, family = "TURF"): TodayRunner {
  return { runnerId: `runner-${tissueRank}`, horseName: `Horse ${tissueRank}`,
    tissueValue: { family, tissueRank, bestL3SpeedRank, valueRank, probability: .321, marketPrice: 12.5 },
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

test("copy text contains only course, time and horse; UI shows date and counts", () => {
  const rows = buildNonRedTissueDailyList([meeting()]);
  const clipboardText = formatNonRedTissueDailyList(rows);
  assert.equal(clipboardText, "Cheltenham 13:50 Horse 1\nCheltenham 13:50 Horse 2");
  const html = renderToStaticMarkup(<NonRedTissueDailyList date="24 October 2026" rows={rows} clipboardText={clipboardText} />);
  assert.match(html, /24 October 2026/);
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
    assert.match(html, /No non-red Tissue 1\/2 selections today\./);
    assert.match(html, /0 selections · 0 races/);
    assert.match(html, /disabled=""/);
  }
});

test("Today summary consumes final attached racecard data and the shared watch helper", () => {
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  assert.ok(page.indexOf("const dailyList =") > page.indexOf("attachFrozenValueToMeetings(attachJump"));
  assert.match(page, /buildNonRedTissueDailyList\(displayData.status === "ok" \? displayData.meetings : \[\]\)/);
  const helper = readFileSync(new URL("../../../lib/racing/non-red-tissue-daily-list.ts", import.meta.url), "utf8");
  assert.match(helper, /!isTissueTop2SpeedRankWatch\(tissueValue\)/);
  assert.doesNotMatch(helper, /valueRank|bestL3SpeedRank\s*===/);
});

test("input reliability never changes the existing non-red daily shortlist", () => {
  const card = meeting("Test", "14:00", [runner(1, 1), runner(2, 4)]);
  const before = buildNonRedTissueDailyList([card]);
  for (const level of ["GOOD", "CAUTION", "UNKNOWN"] as const) {
    for (const runner of card.races[0].runners) runner.tissueValue!.inputReliability = { level, reasons: [] };
    assert.deepEqual(buildNonRedTissueDailyList([card]), before);
  }
});

test("longer-price identification adds or removes no daily list runners", () => {
  for (const family of ["TURF", "AW", "HURDLE", "CHASE"]) for (const bestL3SpeedRank of [1, 2, 3, 4]) {
    const input = meeting("Test", "14:00", [runner(1, bestL3SpeedRank, 99, family), runner(2, bestL3SpeedRank, 1, family)]);
    const before = buildNonRedTissueDailyList([input]);
    for (const price of [5.5, 6, 7, 11, 23]) {
      for (const row of input.races[0].runners) row.tissueValue!.marketPrice = price;
      assert.deepEqual(buildNonRedTissueDailyList([input]), before);
    }
  }
});
