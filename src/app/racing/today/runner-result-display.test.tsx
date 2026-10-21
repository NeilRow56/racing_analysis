import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { todayRaceHasConclusiveResult } from "@/lib/racing/today-race-status";
import type { TodayRace, TodayRunner } from "@/lib/racing/todays-racing";
import { RunnerResultRow, RunnerWinnerBadge } from "./runner-result-display";
import { FrozenRacecardRanks } from "./tissue-cells";

function runner(overrides: Partial<TodayRunner> = {}): TodayRunner {
  return {
    runnerId: "runner-1", runnerSourceId: null, horseId: "horse-1", horseName: "Example Horse",
    saddleclothNumber: 1, horseAge: 4, horseSex: null, weight: "9-2", weightCarriedLbs: 128,
    draw: 4, jockeyName: "Jockey", trainerId: null, trainerName: "Trainer", officialRating: 92,
    odds: "5/1", oddsDecimal: "6", resultStatus: "finished", finishingPosition: 1, metrics: null,
    tissueValue: {
      family: "TURF", modelVersion: "tissue_model_v3", valueTrackerVersion: "TURF_TISSUE_V3_VALUE_FORWARD_V1",
      capturedAt: "2026-10-20T08:00:00Z", probability: 0.2, tissueRank: 3, valueRank: 5,
      marketRank: 2, marketPrice: 6, marketProbability: 0.16, modelMarketRatio: 1.2,
    },
    ...overrides,
  };
}

function race(runners: TodayRunner[], overrides: Partial<TodayRace> = {}): TodayRace {
  return {
    raceId: "race-1", sourceId: "source-1", scheduledTime: "15:00:00", raceDateTime: new Date("2026-10-20T14:00:00Z"),
    courseCountry: "ENG", raceName: "Example race", raceClass: "3", raceType: "Flat", raceTypeCode: null,
    distance: "6f", distanceYards: 1320, going: "Good", surface: "TURF", declaredRunnerCount: runners.length,
    actualRunnerCount: runners.length, winningTime: "1m 12s", runners, ...overrides,
  };
}

function render(race: TodayRace): string {
  const hasConclusiveResult = todayRaceHasConclusiveResult(race);
  return renderToStaticMarkup(<table><tbody>{race.runners.map((runner) => (
    <RunnerResultRow key={runner.runnerId} runner={runner} hasConclusiveResult={hasConclusiveResult}>
      <td>{runner.horseName}<RunnerWinnerBadge runner={runner} hasConclusiveResult={hasConclusiveResult} /></td>
      <td><FrozenRacecardRanks runner={runner} /></td>
    </RunnerResultRow>
  ))}</tbody></table>);
}

test("settled winner receives the whole-row winner background", () => {
  assert.match(render(race([runner()])), /<tr class="align-top bg-emerald-50">/);
});

test("settled winner displays a compact WINNER badge beside the horse name", () => {
  assert.match(render(race([runner()])), /Example Horse<span[^>]*text-emerald-800[^>]*>WINNER<\/span>/);
});

for (const [label, overrides] of [
  ["losing runner", { finishingPosition: 5 }],
  ["second-place runner", { finishingPosition: 2 }],
  ["third-place runner", { finishingPosition: 3 }],
  ["non-finisher", { finishingPosition: null, resultStatus: "pulled_up" }],
] as const) {
  test(`${label} has no winner presentation even with top model ranks`, () => {
    const loser = runner({ ...overrides, runnerId: "loser", tissueValue: { ...runner().tissueValue!, tissueRank: 1, valueRank: 1, marketRank: 1 } });
    const html = render(race([runner(), loser]));
    const rows = html.match(/<tr\b[\s\S]*?<\/tr>/g)!;
    assert.match(rows[1]!, /<tr class="align-top">/);
    assert.doesNotMatch(rows[1]!, /WINNER|bg-emerald-50/);
  });
}

test("non-runner styling stays unchanged and overrides even a conflicting first position", () => {
  for (const finishingPosition of [null, 1]) {
    const html = render(race([runner({ resultStatus: "non_runner", finishingPosition })]));
    assert.match(html, /<tr class="bg-slate-100 text-slate-500 line-through">/);
    assert.doesNotMatch(html, /WINNER|bg-emerald-50/);
  }
});

test("pending and partial results have no winner styling or badge", () => {
  for (const pending of [
    race([runner({ resultStatus: null, finishingPosition: null })], { winningTime: null }),
    race([runner()], { winningTime: null }),
    race([runner(), runner({ runnerId: "pending", resultStatus: null, finishingPosition: null })]),
  ]) {
    const html = render(pending);
    assert.doesNotMatch(html, /WINNER|bg-emerald-50/);
    assert.match(html, /<tr class="align-top">/);
  }
});

test("every dead-heat winner is highlighted without changing runner order", () => {
  const html = render(race([
    runner({ runnerId: "a", horseName: "First winner" }),
    runner({ runnerId: "b", horseName: "Runner up", finishingPosition: 3 }),
    runner({ runnerId: "c", horseName: "Second winner" }),
  ]));
  assert.equal((html.match(/<tr class="align-top bg-emerald-50">/g) ?? []).length, 2);
  assert.equal((html.match(/>WINNER<\/span>/g) ?? []).length, 2);
  assert.ok(html.indexOf("First winner") < html.indexOf("Runner up"));
  assert.ok(html.indexOf("Runner up") < html.indexOf("Second winner"));
});

test("Tissue, Value and Market ranks render identically before and after settlement", () => {
  const settled = render(race([runner()]));
  const pending = render(race([runner()], { winningTime: null }));
  const rankCell = (html: string) => html.match(/<td><div class="flex flex-wrap items-start gap-1"[\s\S]*?<\/td>/)![0];
  assert.equal(rankCell(settled), rankCell(pending));
  const text = settled.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
  assert.match(text, /Tissue 3.*Value 5.*Mkt 2/);
});

test("Today table wires the existing race result gate into both row and badge", () => {
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  assert.match(page, /hasConclusiveResult=\{todayRaceHasConclusiveResult\(race\)\}/);
  assert.match(page, /<RunnerRow\s+hasConclusiveResult=\{hasConclusiveResult\}/);
  assert.match(page, /<RunnerResultRow runner=\{runner\} hasConclusiveResult=\{hasConclusiveResult\}>/);
  assert.match(page, /<RunnerWinnerBadge runner=\{runner\} hasConclusiveResult=\{hasConclusiveResult\} \/>/);
  assert.match(page, /<FrozenRacecardRanks runner=\{runner\} \/>/);
  assert.match(page, /nonRunner \? \([\s\S]*?NR/);
});
