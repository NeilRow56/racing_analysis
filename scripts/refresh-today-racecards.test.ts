import assert from "node:assert/strict";
import { test } from "node:test";
import { refreshTodayRacecards, type RefreshRunner } from "./refresh-today-racecards";
const date = "2026-11-05", now = new Date(`${date}T09:00:00.000Z`);
test("manual refresh re-fetches then force-syncs only successfully refreshed source cards", async () => {
  const calls: Array<Parameters<RefreshRunner>> = [];
  const summary = await refreshTodayRacecards(date, async (...args) => {
    calls.push(args);
    return args[0] === "sl:import-racecards" ? "RACECARD_IMPORTED course='A B' time=14:00 race_id=123 runners=8\nALREADY_OFF_RACES_PRESERVED=2\n" : "";
  }, now);
  assert.deepEqual(summary, { refreshed: 1, preservedOff: 2 });
  assert.deepEqual(calls, [
    ["sl:import-racecards", [date, "--force-refresh"]],
    ["tissue-value:sync", [date, "--force-refresh"], { RESEARCH_REFRESH_SOURCE_IDS: "123" }],
    ["tissue-generation:sync", [date, "--force-refresh"], { RESEARCH_REFRESH_SOURCE_IDS: "123" }],
  ]);
});
test("failed refresh never captures stale prices, and off-only refresh never recaptures", async () => {
  let calls = 0;
  await assert.rejects(refreshTodayRacecards(date, async () => { calls++; throw new Error("fetch failed"); }, now), /fetch failed/);
  assert.equal(calls, 1);
  calls = 0;
  await refreshTodayRacecards(date, async () => { calls++; return "ALREADY_OFF_RACES_PRESERVED=3\n"; }, now);
  assert.equal(calls, 1);
  await assert.rejects(refreshTodayRacecards("2026-11-04", async () => { throw new Error("must not run"); }, now), /TODAY/);
});
