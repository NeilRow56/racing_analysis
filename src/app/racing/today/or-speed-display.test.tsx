import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { TodayRunner } from "@/lib/racing/todays-racing";
import { OrSpeedCell, sameOrSpeedEdges } from "./or-speed-display";
import { TurfPerformanceRatingCell } from "./tpr-display";

function runner(id: string, or: number | null = 86, speed: number | null = 36) {
  return {
    runnerId: id, officialRating: or,
    metrics: { bestTurfSpeedLast3: speed } as TodayRunner["metrics"],
  };
}

function render(runners: ReturnType<typeof runner>[], isTurf = true) {
  const edges = sameOrSpeedEdges(runners, isTurf);
  return runners.map((runner) => renderToStaticMarkup(
    <OrSpeedCell runner={runner} speedEdge={edges.get(runner.runnerId)} />,
  ));
}

describe("Today's Racing OR + Speed", () => {
  test("shows independent Turf OR and Best L3, with no Today's Rating", () => {
    const [html] = render([runner("a")]);
    assert.match(html, /OR 86 · Best L3 36/);
    assert.match(html, /last three eligible Turf runs/);
    assert.doesNotMatch(html, /Today.*Rating|Speed edge/);
    const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(page, /Today(?:&apos;|’|')s Rating|todaysRatingValue|latest.*TodaysRating/);
    assert.match(page, /OR \+ Speed/);
    assert.match(page, /sameOrSpeedEdges\(runners, isTurfRace\)/);
    assert.match(page, /isTurfRace \? <OrSpeedCell runner=\{runner\} speedEdge=\{speedEdge\}/);
    assert.match(page, /<TurfPerformanceRatingCell coverage=\{tprCoverage\} runner=\{runner\}/);
  });

  test("same-OR pair awards +12 only to the leader and emphasizes >=10", () => {
    const [leader, lower] = render([runner("a"), runner("b", 86, 24)]);
    assert.match(leader, /Speed edge \+12/);
    assert.match(leader, /bg-emerald-50/);
    assert.match(leader, /next-highest comparable runner in this race/);
    assert.match(leader, /Prospective research observation/);
    assert.doesNotMatch(lower, /Speed edge/);
  });

  test("three same-OR runners compare with next-highest, without large-edge emphasis", () => {
    const [leader, second, third] = render([runner("a"), runner("b", 86, 31), runner("c", 86, 24)]);
    assert.match(leader, /Speed edge \+5/);
    assert.doesNotMatch(leader, /bg-emerald-50|Speed edge \+12/);
    assert.doesNotMatch(second + third, /Speed edge/);
  });

  test("large-edge boundary is inclusive", () => {
    for (const [gap, large] of [[9, false], [9.99, false], [10, true]] as const) {
      const [html] = render([runner("a"), runner("b", 86, 36 - gap)]);
      assert.equal(html.includes("bg-emerald-50"), large);
    }
  });

  test("no same-OR rival, tied leaders, and missing figures never fabricate an edge", () => {
    const cases = [
      [runner("a")],
      [runner("a"), runner("b", 85, 24)],
      [runner("a"), runner("b"), runner("c", 86, 24)],
      [runner("a", null), runner("b", null, 24)],
      [runner("a"), runner("b", 86, null)],
      [runner("a", 86, null), runner("b", 86, null)],
      [runner("a", NaN), runner("b", NaN, 24)],
      [runner("a"), runner("b", 86, Infinity)],
    ];
    for (const runners of cases) {
      assert.equal(sameOrSpeedEdges(runners, true).size, 0);
      assert.doesNotMatch(render(runners).join(""), /Speed edge/);
    }
  });

  test("missing values use em dashes; zero and negative speeds remain valid", () => {
    for (const [or, speed, text] of [
      [null, 36, "OR — · Best L3 36"],
      [86, null, "OR 86 · Best L3 —"],
      [null, null, "OR — · Best L3 —"],
    ] as const) assert.ok(render([runner("a", or, speed)])[0].includes(text));
    assert.match(render([runner("a", 86, 0), runner("b", 86, -12)])[0], /Speed edge \+12/);
    const missingMetrics = { runnerId: "missing", officialRating: 86, metrics: null };
    assert.equal(sameOrSpeedEdges([runner("a"), missingMetrics], true).size, 0);
    assert.match(renderToStaticMarkup(<OrSpeedCell runner={missingMetrics} />), /OR 86 · Best L3 —/);
  });

  test("fractional figures stay compact without changing the comparison", () => {
    const runners = [runner("a", 86, 36.12345), runner("b", 86, 24.12345)];
    assert.match(render(runners)[0], /OR 86 · Best L3 36.12/);
    assert.match(render(runners)[0], /Speed edge \+12/);
    assert.match(render([runner("a", 86, 0.001), runner("b", 86, 0)])[0], /Speed edge \+0.001/);
  });

  test("comparison is race-local, input order independent, and does not mutate runners", () => {
    const runners = [runner("lower", 86, 24), runner("leader"), runner("other-or", 90, 100)];
    assert.deepEqual([...sameOrSpeedEdges(runners, true)], [["leader", 12]]);
    assert.deepEqual(runners.map((r) => r.runnerId), ["lower", "leader", "other-or"]);
    assert.equal(sameOrSpeedEdges([runner("separate-race")], true).size, 0);
  });

  test("non-Turf race cannot receive Turf edges even with populated Turf history", () => {
    assert.equal(sameOrSpeedEdges([runner("a"), runner("b", 86, 24)], false).size, 0);
  });

  test("TPR stays visible with secondary styling and unchanged value/rank", () => {
    const html = renderToStaticMarkup(<TurfPerformanceRatingCell runner={{
      turfPerformanceRating: { rating: 108.093, rawRating: 0.887, rank: 1, gap: 1.596, historyDepth: 1, version: "TPR_S2_V1" },
    }} />);
    assert.match(html, /font-normal text-slate-600">TPR 108/);
    assert.match(html, /Rank 1/);
  });
});
