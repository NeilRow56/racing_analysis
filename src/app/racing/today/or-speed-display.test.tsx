import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { TodayRunner } from "@/lib/racing/todays-racing";
import { OrSpeedCell, sameOrSpeedEdges, sameOrAwSpeedEdges, officialRatingRanks } from "./or-speed-display";
import { TurfPerformanceRatingCell } from "./tpr-display";

function runner(id: string, or: number | null = 86, speed: number | null = 36) {
  return {
    runnerId: id, officialRating: or,
    metrics: { bestTurfSpeedLast3: speed } as TodayRunner["metrics"],
  };
}

function render(runners: ReturnType<typeof runner>[], isTurf = true) {
  const edges = sameOrSpeedEdges(runners, isTurf);
  const ranks = officialRatingRanks(runners);
  return runners.map((runner) => renderToStaticMarkup(
    <OrSpeedCell runner={runner} speedEdge={edges.get(runner.runnerId)} orRank={ranks.get(runner.runnerId)} />,
  ));
}

describe("Today's Racing OR + Speed", () => {
  test("competition OR ranks keep ties, skip missing OR and include missing Speed", () => {
    const runners = [runner("a", 86, null), runner("b", 84), runner("c", 84), runner("d", 82),
      runner("missing", null), runner("nan", NaN), runner("infinite", Infinity)];
    assert.deepEqual([...officialRatingRanks(runners)], [["a", 1], ["b", 2], ["c", 2], ["d", 4]]);
    assert.deepEqual([...officialRatingRanks([...runners].reverse())].reverse(), [...officialRatingRanks(runners)]);
    assert.deepEqual(runners.map((r) => r.officialRating), [86, 84, 84, 82, null, NaN, Infinity]);
    assert.equal(officialRatingRanks([]).size, 0);
    assert.equal(officialRatingRanks([runner("separate", 40)]).get("separate"), 1);
  });

  for (const family of ["turf", "all_weather"] as const) {
    for (const higher of [0, 1, 2, 3, 7]) {
      for (const gap of [5, 10, 12]) {
        test(`${family}: OR rank ${higher + 1}, edge ${gap} uses OR context for emphasis`, () => {
          const runners = [runner("leader", 73, 99.16), runner("lower", 73, 99.16 - gap),
            // Higher-OR horses still count when they lack Speed.
            ...Array.from({ length: higher }, (_, i) => runner(`higher-${i}`, 80 + i, null))]
            .map((r) => ({ ...r, metrics: { ...r.metrics, bestAwSpeedLast3: r.metrics!.bestTurfSpeedLast3 } as TodayRunner["metrics"] }));
          const edges = family === "turf" ? sameOrSpeedEdges(runners, true) : sameOrAwSpeedEdges(runners, true);
          const ranks = officialRatingRanks(runners);
          const html = renderToStaticMarkup(<OrSpeedCell runner={runners[0]} speedEdge={edges.get("leader")} orRank={ranks.get("leader")} family={family} />);
          assert.equal(ranks.get("leader"), higher + 1);
          assert.match(html, /OR 73 · Best L3 99.16/);
          assert.match(html, new RegExp(`Speed edge \\+${gap}`));
          assert.equal(html.includes("bg-emerald-50"), higher < 3);
          assert.equal(html.includes("top three by Official Rating"), higher < 3);
          if (higher >= 3) assert.match(html, /border-slate-200/);
          if (higher === 0) assert.match(html, /shares the highest OR/);
          assert.doesNotMatch(html, /at least 10|winning|betting/);
        });
      }
    }

    test(`${family}: top OR ties share rank 1 and missing figures cannot gain emphasis`, () => {
      const make = (id: string, or: number | null, speed: number | null) => ({
        ...runner(id, or, speed), metrics: { bestTurfSpeedLast3: speed, bestAwSpeedLast3: speed } as TodayRunner["metrics"],
      });
      const runners = [make("top", 86, 100), make("tied-or", 86, 85), make("lower-or", 84, 120)];
      assert.deepEqual([...officialRatingRanks(runners)], [["top", 1], ["tied-or", 1], ["lower-or", 3]]);
      const edges = family === "turf" ? sameOrSpeedEdges(runners, true) : sameOrAwSpeedEdges(runners, true);
      assert.deepEqual([...edges], [["top", 15]]);
      for (const r of [make("missing-or", null, 100), make("missing-speed", 86, null)]) {
        const html = renderToStaticMarkup(<OrSpeedCell runner={r} speedEdge={12} orRank={1} family={family} />);
        assert.doesNotMatch(html, /Speed edge|bg-emerald-50|top three/);
      }
      for (const orRank of [undefined, NaN, Infinity, 0, -1, 1.5]) {
        const html = renderToStaticMarkup(<OrSpeedCell runner={runners[0]} speedEdge={15} orRank={orRank} family={family} />);
        assert.match(html, /Speed edge \+15/);
        assert.doesNotMatch(html, /bg-emerald-50|top three/);
      }
    });
  }

  test("shows independent Turf OR and Best L3, with no Today's Rating", () => {
    const [html] = render([runner("a")]);
    assert.match(html, /OR 86 · Best L3 36/);
    assert.match(html, /last three eligible Turf runs/);
    assert.doesNotMatch(html, /Today.*Rating|Speed edge/);
    const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(page, /Today(?:&apos;|’|')s Rating|todaysRatingValue|latest.*TodaysRating/);
    assert.match(page, /OR \+ Speed/);
    assert.match(page, /sameOrSpeedEdges\(runners, isTurfRace\)/);
    assert.match(page, /isTurfRace \|\| isAllWeatherRace \? officialRatingRanks\(runners\)/);
    assert.match(page, /orRank=\{orRanks.get\(runner.runnerId\)\}/);
    assert.match(page, /isTurfRace \? <OrSpeedCell runner=\{runner\} speedEdge=\{speedEdge\}/);
    assert.match(page, /<TurfPerformanceRatingCell coverage=\{tprCoverage\} runner=\{runner\}/);
  });

  test("same-OR pair awards +12 only to the leader and emphasizes top OR", () => {
    const [leader, lower] = render([runner("a"), runner("b", 86, 24)]);
    assert.match(leader, /Speed edge \+12/);
    assert.match(leader, /bg-emerald-50/);
    assert.match(leader, /next-highest Speed runner in this race/);
    assert.match(leader, /top three by Official Rating/);
    assert.doesNotMatch(lower, /Speed edge/);
  });

  test("three same-OR runners compare with next-highest, retaining top-OR context", () => {
    const [leader, second, third] = render([runner("a"), runner("b", 86, 31), runner("c", 86, 24)]);
    assert.match(leader, /Speed edge \+5/);
    assert.match(leader, /bg-emerald-50/);
    assert.doesNotMatch(leader, /Speed edge \+12/);
    assert.doesNotMatch(second + third, /Speed edge/);
  });

  test("gap size does not control prominence for top-OR horses", () => {
    for (const gap of [9, 9.99, 10]) {
      const [html] = render([runner("a"), runner("b", 86, 36 - gap)]);
      assert.equal(html.includes("bg-emerald-50"), true);
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
    assert.match(render([runner("a", 86, 0.001), runner("b", 86, 0)])[0], /Speed edge \+0.00/);
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

for (const family of ["turf", "all_weather"] as const) {
  test(`${family}: badge and tooltip share exactly two decimal places`, () => {
    for (const [edge, expected] of [[5.02536010898659, "5.03"], [5, "5.00"], [0.001, "0.00"]] as const) {
      const html = renderToStaticMarkup(<OrSpeedCell runner={{ officialRating: 80, metrics: { bestTurfSpeedLast3: 90, bestAwSpeedLast3: 90 } as TodayRunner["metrics"] }} family={family} speedEdge={edge} />);
      assert.ok(html.includes(`Speed edge +${expected}`));
      assert.ok(html.includes(`same Official Rating: ${expected} points.`));
      assert.ok(!html.includes("5.02536010898659"));
    }
  });
}
