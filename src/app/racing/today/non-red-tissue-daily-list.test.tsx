import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { buildNonRedTissueDailyList, formatNonRedTissueDailyList, isTissueDailyWatchCandidate } from "@/lib/racing/non-red-tissue-daily-list";
import type { TodayMeeting, TodayRunner } from "@/lib/racing/todays-racing";
import { resultStatusLabel } from "@/lib/racing/today-rule-matches";
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
  assert.match(html, /non-red T1 3.00–&lt;6.00 · non-red T2 6.00–&lt;11.00 · T1=V1 at any captured price, including pale-red/);
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
  assert.match(helper, /isTissue1Value1Agreement\(candidate\)/);
  assert.match(helper, /valueRank: tissueValue\?\.valueRank/);
  assert.doesNotMatch(helper, /bestL3SpeedRank\s*===/);
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

function resultCard(position: number | null, status: string | null = "finished") {
  const selection = { ...runner(1), finishingPosition: position, resultStatus: status, oddsDecimal: "4.5" };
  const winner = { ...runner(3), runnerId: "unqualified-winner", finishingPosition: 1, resultStatus: "finished", oddsDecimal: "2" };
  const card = meeting("Worcester", "12:10", [selection, winner]);
  card.races[0].winningTime = "4m 10s";
  return card;
}

function renderList(card: TodayMeeting) {
  const rows = buildNonRedTissueDailyList([card]);
  const text = formatNonRedTissueDailyList(rows);
  const html = renderToStaticMarkup(<NonRedTissueDailyList date="3 November 2026" rows={rows} clipboardText={text} />);
  return { rows, text, html };
}

for (const [position, status, label] of [
  [1, "finished", "WIN"], [2, "finished", "2nd"], [3, "finished", "3rd"], [4, "finished", "4th"],
  [11, "finished", "11th"], [12, "finished", "12th"], [13, "finished", "13th"], [21, "finished", "21st"],
  [null, "non_runner", "NR"], [null, "pulled_up", "PU"], [null, "fell", "F"],
  [null, "unseated_rider", "UR"], [null, "brought_down", resultStatusLabel("brought_down")],
] as const) test(`watch list renders and copies canonical result ${label}`, () => {
  const { rows, text, html } = renderList(resultCard(position, status));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].result?.label, label);
  assert.equal(text, `Worcester 12:10 Horse 1 — T1 — ${label}`);
  assert.ok(html.includes(`aria-label="Result: ${label}"`));
  assert.equal(html.includes("bg-emerald-700"), position === 1);
  assert.equal(rows[0].result?.settled, status !== "non_runner");
});

test("pending and partial results remain undecorated until Today's conclusive result gate passes", () => {
  for (const card of [resultCard(null, null), resultCard(1)]) {
    card.races[0].winningTime = null;
    const { rows, text, html } = renderList(card);
    assert.equal(rows[0].result, null);
    assert.equal(text, "Worcester 12:10 Horse 1 — T1");
    assert.doesNotMatch(html, /Result:|bg-emerald-700|\d winners?/);
  }
  const partial = resultCard(null, null);
  assert.equal(renderList(partial).rows[0].result, null);
});

test("NR is visible before race completion, overrides a conflicting position and never counts as a settled loser", () => {
  const card = resultCard(1, "non_runner");
  card.races[0].winningTime = null;
  const { rows, html } = renderList(card);
  assert.deepEqual(rows[0].result, { label: "NR", winner: false, settled: false });
  assert.doesNotMatch(html, /\d winners?|bg-emerald-700/);
});

test("agreement winners retain both markers with distinct research and result styling", () => {
  const card = resultCard(1);
  Object.assign(card.races[0].runners[0].tissueValue!, { valueRank: 1, bestL3SpeedRank: 2, marketPrice: 23 });
  const { text, html } = renderList(card);
  assert.equal(text, "Worcester 12:10 Horse 1 — T1 — T1=V1 — pale-red Speed watch — WIN");
  assert.match(html, /aria-label="Tissue 1 and Value 1 agreement"/);
  assert.match(html, /border-green-700 bg-green-100/);
  assert.match(html, /bg-emerald-700[^\"]*text-white/);
  assert.match(html, /Speed watch/);
  assert.match(html, /1 selection · 1 race · 1 winner/);
});

test("settled non-winners show zero winners; every dead-heat winner is counted", () => {
  assert.match(renderList(resultCard(2)).html, /1 selection · 1 race · 0 winners/);
  const card = resultCard(1);
  Object.assign(card.races[0].runners[1].tissueValue!, { tissueRank: 2, marketPrice: 8 });
  const { rows, html } = renderList(card);
  assert.equal(rows.filter(row => row.result?.winner).length, 2);
  assert.match(html, /2 selections · 1 race · 2 winners/);
});

test("settlement decorates the identical frozen cohort without result-driven inclusion, exclusion or mutation", () => {
  const candidates = [runner(1), runner(2), runner(1, 2), runner(3), runner(1, 3, 1)];
  candidates.forEach((r, index) => { r.runnerId = `candidate-${index}`; r.resultStatus = null; r.finishingPosition = null; });
  const card = meeting("Test", "14:00", candidates);
  const cohort = () => buildNonRedTissueDailyList([card]).map(({ result, ...frozen }) => { void result; return frozen; });
  const before = cohort();
  const frozenValues = JSON.stringify(candidates.map(r => r.tissueValue));
  for (const [position, status] of [[1, "finished"], [2, "finished"], [null, "pulled_up"], [null, "non_runner"]] as const) {
    candidates.forEach(r => Object.assign(r, { finishingPosition: position, resultStatus: status, oddsDecimal: "50" }));
    // An excluded runner wins; this must never cause entry into the list.
    Object.assign(candidates[3], { finishingPosition: 1, resultStatus: "finished" });
    card.races[0].winningTime = "4m";
    const input = JSON.stringify(card);
    assert.deepEqual(cohort(), before);
    assert.equal(JSON.stringify(card), input);
    assert.equal(JSON.stringify(candidates.map(r => r.tissueValue)), frozenValues);
  }
});
