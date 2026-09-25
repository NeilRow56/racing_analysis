import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DEFAULT_SPEED_DISPLAY_METRIC,
  SpeedDisplayValue,
  speedValueForMetric,
  TodaySpeedDisplay,
} from "./speed-display";

const values = {
  bestLast3: 112.4,
  latest: 101.2,
  previous: 98.8,
};

describe("Today Speed display", () => {
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

  test("selection is local display state and the table keeps rating, TPR and odds output", () => {
    const selectorSource = readFileSync(new URL("./speed-display.tsx", import.meta.url), "utf8");
    const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

    assert.match(selectorSource, /onChange=\{\(event\) => setMetric/);
    assert.doesNotMatch(selectorSource, /server|action|tracker|turfPerformanceRating/i);
    assert.equal((pageSource.match(/<SpeedDisplayValue\b/g) ?? []).length, 1);
    assert.match(pageSource, /<TurfPerformanceRatingCell runner=\{runner\}/);
    assert.match(pageSource, /\{runner\.odds \?\? "-"\}/);
  });
});
