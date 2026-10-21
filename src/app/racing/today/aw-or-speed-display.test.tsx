import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  isAllWeatherRaceForDisplay,
  isOrdinaryFlatTurfRaceForDisplay,
  type TodayRunner,
} from "@/lib/racing/todays-racing";
import { OrSpeedCell, sameOrAwSpeedEdges, sameOrSpeedEdges } from "./or-speed-display";

function runner(id: string, or: number | null = 78, speed: number | null = 104.6) {
  return {
    runnerId: id, officialRating: or,
    // Deliberately conflicting non-AW figures detect accidental fallback.
    metrics: { bestAwSpeedLast3: speed, bestTurfSpeedLast3: 999, bestPerformanceLast3: 888 } as TodayRunner["metrics"],
  };
}

function render(runners: ReturnType<typeof runner>[]) {
  const edges = sameOrAwSpeedEdges(runners, true);
  return runners.map((runner) => renderToStaticMarkup(
    <OrSpeedCell runner={runner} speedEdge={edges.get(runner.runnerId)} family="all_weather" />,
  ));
}

describe("Today's Racing AW OR + Speed", () => {
  test("displays independent OR and authoritative AW Best L3 with AW help", () => {
    const [html] = render([runner("a")]);
    assert.match(html, /OR 78 · Best L3 104.6/);
    assert.match(html, /last three eligible All-Weather runs/);
    assert.doesNotMatch(html, /999|888|Speed edge|Today.*Rating/);
  });

  test("same-OR leader alone receives a prominent positive edge", () => {
    const [leader, lower] = render([runner("a"), runner("b", 78, 93.9)]);
    assert.match(leader, /Speed edge \+10.7/);
    assert.match(leader, /bg-emerald-50/);
    assert.match(leader, /next-highest comparable runner in this race carrying the same Official Rating/);
    assert.match(leader, /Prospective research observation/);
    assert.match(lower, /OR 78 · Best L3 93.9/);
    assert.doesNotMatch(lower, /Speed edge/);
  });

  test("three same-OR runners compare top with next-highest, not lowest", () => {
    const [leader, second, third] = render([
      runner("a"), runner("b", 78, 100.3), runner("c", 78, 87.2),
    ]);
    assert.match(leader, /Speed edge \+4.3/);
    assert.match(leader, /border-slate-200/);
    assert.doesNotMatch(leader, /bg-emerald-50|Speed edge \+17.4/);
    assert.doesNotMatch(second + third, /Speed edge/);
    assert.match(render([runner("a"), runner("b", 78, 93.9), runner("c", 78, 87.2)])[0], /Speed edge \+10.7/);
  });

  test("prominence uses the unrounded gap with an inclusive >=10 boundary", () => {
    for (const [speed, large] of [[90.01, false], [90.001, false], [90, true], [89.99, true]] as const) {
      assert.equal(render([runner("a", 78, 100), runner("b", 78, speed)])[0].includes("bg-emerald-50"), large);
    }
  });

  test("no same-OR rival, tied leaders and missing/nonfinite inputs produce no edge", () => {
    for (const runners of [
      [runner("a")],
      [runner("a"), runner("b", 77, 90)],
      [runner("a"), runner("b"), runner("c", 78, 80)],
      [runner("a", null), runner("b", null, 90)],
      [runner("a"), runner("b", 78, null)],
      [runner("a", 78, null), runner("b", 78, null)],
      [runner("a", NaN), runner("b", NaN, 90)],
      [runner("a"), runner("b", 78, Infinity)],
    ]) {
      assert.equal(sameOrAwSpeedEdges(runners, true).size, 0);
      assert.doesNotMatch(render(runners).join(""), /Speed edge/);
    }
  });

  test("missing values use em dashes with no Turf or TPR fallback", () => {
    for (const [or, speed, expected] of [
      [null, 104.6, "OR — · Best L3 104.6"],
      [78, null, "OR 78 · Best L3 —"],
      [null, null, "OR — · Best L3 —"],
    ] as const) {
      const html = renderToStaticMarkup(<OrSpeedCell runner={runner("a", or, speed)} family="all_weather" speedEdge={12} />);
      assert.ok(html.includes(expected));
      assert.doesNotMatch(html, /Speed edge|999|888/);
    }
    const missing = { runnerId: "missing", officialRating: 78, metrics: null };
    assert.equal(sameOrAwSpeedEdges([runner("a"), missing], true).size, 0);
    assert.match(renderToStaticMarkup(<OrSpeedCell runner={missing} family="all_weather" />), /OR 78 · Best L3 —/);
  });

  test("comparison is race-local and order-independent; finite zero/negative speeds are valid", () => {
    const runners = [runner("lower", 78, -12), runner("top", 78, 0), runner("other", 79, 500)];
    assert.deepEqual([...sameOrAwSpeedEdges(runners, true)], [["top", 12]]);
    assert.deepEqual(runners.map((r) => r.runnerId), ["lower", "top", "other"]);
    assert.equal(sameOrAwSpeedEdges([runner("separate-race")], true).size, 0);
    assert.match(render(runners)[1], /Speed edge \+12/);
  });

  test("Hurdles and Chases cannot receive AW or Turf edges, even with AW surface and history", () => {
    for (const raceType of ["Hurdle", "Chase"]) {
      const race = { raceName: null, raceType, courseName: "Kempton", going: "Standard", surface: "ALLWEATHER" };
      assert.equal(isAllWeatherRaceForDisplay(race), false);
      assert.equal(isOrdinaryFlatTurfRaceForDisplay(race), false);
      const runners = [runner("a"), runner("b", 78, 90)];
      assert.equal(sameOrAwSpeedEdges(runners, isAllWeatherRaceForDisplay(race)).size, 0);
      assert.equal(sameOrSpeedEdges(runners, isOrdinaryFlatTurfRaceForDisplay(race)).size, 0);
    }
  });

  test("page wires AW cells and matching columns, retaining Turf, TPR and Jump Speed", () => {
    const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    assert.match(page, /isAllWeatherRace\s*\? sameOrAwSpeedEdges\(runners, isAllWeatherRace\)\s*: sameOrSpeedEdges\(runners, isTurfRace\)/);
    assert.match(page, /\(isTurfRace \|\| isAllWeatherRace\) \? \(/);
    assert.match(page, /title=\{isAllWeatherRace \? BEST_L3_AW_HELP : BEST_L3_TURF_HELP\}/);
    assert.match(page, /isAllWeatherRace \? <OrSpeedCell runner=\{runner\} speedEdge=\{speedEdge\} family="all_weather"/);
    assert.match(page, /!isTurfRace && !isAllWeatherRace \? <th[^>]*>Speed<\/th>/);
    assert.match(page, /!isTurfRace && !isAllWeatherRace \? \(\s*<td[^>]*><SpeedDisplayValue/);
    assert.match(page, /<TurfPerformanceRatingCell coverage=\{tprCoverage\} runner=\{runner\}/);
    assert.doesNotMatch(page, /Today(?:&apos;|’|')s Rating|todaysRatingValue|latest.*TodaysRating/);
  });
});
