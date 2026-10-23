import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DEFAULT_SPEED_DISPLAY_METRIC,
  SpeedDisplayValue,
  speedValueForMetric,
  TodaySpeedDisplay,
  JumpSpeedReliabilityIndicator,
} from "./speed-display";
import { assessJumpSpeedReliability } from "@/lib/racing/jump-speed-reliability";

const values = {
  bestLast3: 112.4,
  latest: 101.2,
  previous: 98.8,
};

describe("Today Speed display", () => {
  test("shows restrained L3 confidence on Hurdle and Chase, preserving the exact number", () => {
    const reliability = { ...assessJumpSpeedReliability(), level: "MEDIUM" as const,
      relevantJumpRuns: 2, nonJumpRuns: 1, reason: "Two relevant Jump runs. Recent window includes a non-Jump run." };
    for (const jumpSubtype of ["hurdle", "chase"] as const) {
      const html = renderToStaticMarkup(<SpeedDisplayValue values={{ ...values, bestLast3: 75.84646128484849 }}
        jumpSubtype={jumpSubtype} reliability={reliability} />);
      assert.match(html, /^76<span/);
      assert.match(html, /aria-label="Speed confidence: Medium"/);
      assert.match(html, /title="[^"]*Two relevant Jump runs.*non-Jump run/);
      assert.match(html, />Med<\/span>/);
    }
  });

  test("does not show confidence for Turf/AW, NH Flat, or the Latest/Previous selector", () => {
    for (const jumpSubtype of [undefined, "nh_flat", "unknown_other"] as const) {
      assert.equal(renderToStaticMarkup(<SpeedDisplayValue values={values} jumpSubtype={jumpSubtype} />), "112");
    }
    for (const metric of ["latest", "previous"] as const) {
      assert.equal(renderToStaticMarkup(<JumpSpeedReliabilityIndicator metric={metric} jumpSubtype="chase" />), "");
    }
  });

  test("missing Jump history stays a missing number with a Low indicator", () => {
    const html = renderToStaticMarkup(<SpeedDisplayValue values={{ ...values, bestLast3: null }} jumpSubtype="hurdle" />);
    assert.match(html, /^-<span/);
    assert.match(html, /Speed confidence: Low/);
    assert.match(html, /Insufficient recent relevant Jump history/);
    assert.match(html, /border-amber-300/);
  });

  test("complete evidence has only a subtle High indicator", () => {
    const html = renderToStaticMarkup(<SpeedDisplayValue values={values} jumpSubtype="chase"
      reliability={{ ...assessJumpSpeedReliability(), level: "HIGH", relevantJumpRuns: 3, windowRuns: 3,
        reason: "Based on three recent relevant Jump performances." }} />);
    assert.match(html, /^112<span/);
    assert.match(html, /Speed confidence: High/);
    assert.match(html, /border-transparent/);
  });
  test("defaults to Best L3 and exposes one accessible page-level selector", () => {
    const html = renderToStaticMarkup(<TodaySpeedDisplay><div>Racecards</div></TodaySpeedDisplay>);

    assert.equal(DEFAULT_SPEED_DISPLAY_METRIC, "bestLast3");
    assert.match(html, /aria-label="Speed metric"/);
    assert.match(html, /<option value="bestLast3" selected="">Best L3<\/option>/);
    assert.match(html, /<option value="latest">Latest<\/option>/);
    assert.match(html, /<option value="previous">Previous<\/option>/);
    assert.equal((html.match(/<select/g) ?? []).length, 1);
  });

  test("selects the existing Best L3, Latest and Previous values", () => {
    assert.equal(speedValueForMetric(values, "bestLast3"), 112.4);
    assert.equal(speedValueForMetric(values, "latest"), 101.2);
    assert.equal(speedValueForMetric(values, "previous"), 98.8);
  });

  test("preserves missing speed values", () => {
    assert.equal(speedValueForMetric({ ...values, previous: null }, "previous"), null);
    assert.equal(speedValueForMetric({ ...values, latest: undefined }, "latest"), undefined);
    assert.equal(
      renderToStaticMarkup(<SpeedDisplayValue values={{ ...values, bestLast3: null }} />),
      "-",
    );
  });

  test("selection is local display state and the table keeps rating, TPR and market odds output", () => {
    const selectorSource = readFileSync(new URL("./speed-display.tsx", import.meta.url), "utf8");
    const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

    assert.match(selectorSource, /onChange=\{\(event\) => setMetric/);
    assert.doesNotMatch(selectorSource, /server|action|tracker|turfPerformanceRating/i);
    assert.equal((pageSource.match(/<SpeedDisplayValue\b/g) ?? []).length, 1);
    assert.match(pageSource, /<TurfPerformanceRatingCell coverage=\{tprCoverage\} runner=\{runner\}/);
    assert.match(pageSource, /<TodayMarketOdds runner=\{runner\}/);
    assert.match(pageSource, /jumpSubtype=\{classifyJumpRaceSubtype\(race\)\}/);
    assert.match(pageSource, /reliability=\{runner.metrics\?\.jumpSpeedReliability\}/);
  });
});
