import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  isAllWeatherRaceForDisplay,
  isOrdinaryFlatTurfRaceForDisplay,
  type TodayRunner,
} from "@/lib/racing/todays-racing";
import { OrSpeedCell, OrSpeedColumnHelp, sameOrAwSpeedEdges, sameOrSpeedEdges, officialRatingRanks } from "./or-speed-display";

function runner(id: string, or: number | null = 78, speed: number | null = 104.6) {
  return {
    runnerId: id, officialRating: or,
    // Deliberately conflicting non-AW figures detect accidental fallback.
    metrics: { bestAwSpeedLast3: speed, bestTurfSpeedLast3: 999, bestPerformanceLast3: 888 } as TodayRunner["metrics"],
  };
}

function render(runners: ReturnType<typeof runner>[]) {
  const edges = sameOrAwSpeedEdges(runners, true);
  const ranks = officialRatingRanks(runners);
  return runners.map((runner) => renderToStaticMarkup(
    <OrSpeedCell runner={runner} speedEdge={edges.get(runner.runnerId)} orRank={ranks.get(runner.runnerId)} family="all_weather" />,
  ));
}

describe("Today's Racing AW OR + Speed", () => {
  test("displays independent OR and authoritative AW Best L3 with AW help", () => {
    const [html] = render([runner("a")]);
    assert.match(html, /OR 78 · Best L3 104.6/);
    assert.match(html, /highest All-Weather Speed figure available/);
    assert.doesNotMatch(html, /999|888|Speed vs same OR|Today.*Rating/);
  });

  test("same-OR leader alone receives a prominent positive edge", () => {
    const [leader, lower] = render([runner("a"), runner("b", 78, 93.9)]);
    assert.match(leader, /Speed vs same OR <span[^>]*>\+10.7/);
    assert.match(leader, /bg-emerald-50/);
    assert.match(leader, /Next-fastest at OR 78/);
    assert.match(leader, /top three by Official Rating/);
    assert.match(lower, /OR 78 · Best L3 93.9/);
    assert.doesNotMatch(lower, /Speed vs same OR/);
  });

  test("three same-OR runners compare top with next-highest, not lowest", () => {
    const [leader, second, third] = render([
      runner("a"), runner("b", 78, 100.3), runner("c", 78, 87.2),
    ]);
    assert.match(leader, /Speed vs same OR <span[^>]*>\+4.3/);
    assert.match(leader, /bg-emerald-50/);
    assert.doesNotMatch(leader, /Speed vs same OR <span[^>]*>\+17.4/);
    assert.doesNotMatch(second + third, /Speed vs same OR/);
    assert.match(render([runner("a"), runner("b", 78, 93.9), runner("c", 78, 87.2)])[0], /Speed vs same OR <span[^>]*>\+10.7/);
  });

  test("top-OR prominence is independent of the gap magnitude", () => {
    for (const speed of [90.01, 90.001, 90, 89.99]) {
      assert.equal(render([runner("a", 78, 100), runner("b", 78, speed)])[0].includes("bg-emerald-50"), true);
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
      assert.doesNotMatch(render(runners).join(""), /Speed vs same OR/);
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
      assert.doesNotMatch(html, /Speed vs same OR|999|888/);
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
    assert.match(render(runners)[1], /Speed vs same OR <span[^>]*>\+12/);
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

  test("help distinguishes the visible single-peer lead from the signed AW Tissue V3 average", () => {
    const aw = renderToStaticMarkup(<OrSpeedColumnHelp family="all_weather" />);
    const turf = renderToStaticMarkup(<OrSpeedColumnHelp family="turf" />);
    assert.match(aw, /<details><summary[^>]*focus-visible:outline-2/);
    assert.match(aw, /How the same-OR comparison works/);
    assert.match(aw, /last three eligible prior runs, across surfaces/);
    assert.match(aw, /next-fastest measured horse at that exact rating/);
    assert.match(aw, /Minus would mean lower/);
    assert.match(aw, /fewer than two usable figures leave it blank/);
    assert.match(aw, /one plus the number of horses with a higher Official Rating/);
    assert.match(aw, /average of the measured same-OR peers in its frozen field/);
    assert.match(aw, /negative same-OR Speed coefficient/);
    assert.doesNotMatch(turf, /AW Tissue V3|negative same-OR Speed coefficient/);

    const [leader, lower] = render([runner("leader", 78, 106.81), runner("lower", 78, 88.58)]);
    assert.match(leader, /<summary[^>]*focus-visible:outline-2/);
    assert.match(leader, /Show comparison details/);
    assert.match(leader, /Horse Best L3<\/dt><dd[^>]*>106.81<\/dd>/);
    assert.match(leader, /Next-fastest at OR 78<\/dt><dd[^>]*>88.58<\/dd>/);
    assert.match(leader, /Difference<\/dt><dd[^>]*>\+18.23 points<\/dd>/);
    assert.doesNotMatch(lower, /Show comparison details|−18.23/);
  });

  test("the displayed comparison can keep a withdrawn peer and OR still counts withdrawals", () => {
    const withdrawnPeer = { ...runner("withdrawn", 78, 88.58), resultStatus: "non_runner" };
    const higherWithdrawn = { ...runner("higher-or", 85, null), resultStatus: "non_runner" };
    const field = [runner("leader", 78, 106.81), withdrawnPeer, higherWithdrawn];
    const edges = sameOrAwSpeedEdges(field, true);
    assert.equal(edges.get("leader")?.toFixed(2), "18.23");
    assert.equal(officialRatingRanks(field).get("leader"), 2);
    assert.equal(sameOrAwSpeedEdges([field[0]], true).size, 0);
    assert.match(render(field)[0], /OR rank 2 in this field/);
    assert.match(renderToStaticMarkup(<OrSpeedColumnHelp family="all_weather" />),
      /Withdrawn horses still on the displayed card can count/);
  });

  test("page wires AW cells and matching columns, retaining Turf, TPR and Jump Speed", () => {
    const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    assert.match(page, /runners=\{race.runners\}/);
    assert.match(page, /isAllWeatherRace\s*\? sameOrAwSpeedEdges\(runners, isAllWeatherRace\)\s*: sameOrSpeedEdges\(runners, isTurfRace\)/);
    assert.match(page, /\(isTurfRace \|\| isAllWeatherRace\) \? \(/);
    assert.match(page, /<OrSpeedColumnHelp family=\{isAllWeatherRace \? "all_weather" : "turf"\}/);
    assert.match(page, /isAllWeatherRace \? <OrSpeedCell runner=\{runner\} speedEdge=\{speedEdge\} orRank=\{orRank\} family="all_weather"/);
    assert.match(page, /!isTurfRace && !isAllWeatherRace \? <th[^>]*>Speed<\/th>/);
    assert.match(page, /!isTurfRace && !isAllWeatherRace \? \(\s*<td[^>]*><SpeedDisplayValue/);
    assert.match(page, /<TurfPerformanceRatingCell coverage=\{tprCoverage\} runner=\{runner\}/);
    assert.doesNotMatch(page, /Today(?:&apos;|’|')s Rating|todaysRatingValue|latest.*TodaysRating/);
  });
});
