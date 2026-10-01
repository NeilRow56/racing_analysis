import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { getTprConfidenceContext } from "@/lib/racing/tpr-confidence-context";
import { TurfPerformanceRatingCell } from "./tpr-display";

const rating = { rating: 108.093, rawRating: 0.887, rank: 1, gap: 1.596, historyDepth: 1 as const, version: "TPR_S2_V1" as const };
const cutoff = new Date("2026-10-01T16:55:00Z");
function context(count: number, days: number) {
  return getTprConfidenceContext(Array.from({ length: count }, (_, i) => ({ runnerId: String(i), raceDateTime: new Date(cutoff.getTime() - (days + i) * 86400000), resultStatus: "finished", finishingPosition: 4, weightCarriedLbs: 135, turfSpeedRating: { rating: 100.853 } })), cutoff);
}
describe("Today TPR confidence display", () => {
  test("Exactly Right keeps its score/rank/lead and shows both warnings", () => {
    const html = renderToStaticMarkup(<TurfPerformanceRatingCell runner={{ turfPerformanceRating: rating, tprConfidence: context(1, 545) }} />);
    for (const text of ["TPR 108", "Rank 1", "TPR lead", "+1.6", "1-run basis", "Limited history", "Stale Turf evidence", "545 days"]) assert.ok(html.includes(text), text);
  });
  test("actual two-run provenance overrides the old reconstructed one-run label", () => {
    const html = renderToStaticMarkup(<TurfPerformanceRatingCell runner={{ turfPerformanceRating: rating, tprConfidence: context(2, 22) }} />);
    assert.match(html, /2-run basis/);
    assert.doesNotMatch(html, /1-run basis|Limited history|Stale Turf evidence/);
    assert.match(html, /TPR 108/);
    assert.match(html, /Rank 1/);
  });
  test("shows 3+ basis and stale context independently of limited history", () => {
    const html = renderToStaticMarkup(<TurfPerformanceRatingCell runner={{ turfPerformanceRating: rating, tprConfidence: context(4, 181) }} />);
    assert.match(html, /3\+ run basis/);
    assert.match(html, /Stale Turf evidence/);
    assert.doesNotMatch(html, /Limited history/);
  });
  test("does not invent provenance from a legacy reconstructed depth", () => {
    const html = renderToStaticMarkup(<TurfPerformanceRatingCell runner={{ turfPerformanceRating: rating }} />);
    assert.doesNotMatch(html, /1-run basis|Limited history|Stale Turf evidence/);
  });
});
