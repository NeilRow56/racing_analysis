import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  calculateCrossSurfaceTurfFallbackTpr,
  calculateTurfPerformanceRating,
  rankTurfPerformanceRatings,
  type TurfPerformanceRating,
  TURF_PERFORMANCE_RATING_VERSION,
  TURF_PERFORMANCE_RATING_W50_WEIGHT_MULTIPLIER,
  turfPerformanceHistoryDepthLabel,
} from "./turf-performance-rating";

describe("Turf Performance Rating", () => {
  test("uses the frozen Stage 8 constants for a known fixture", () => {
    const rating = calculateTurfPerformanceRating({
      latestPerformanceRating: 70,
      previousPerformanceRating: 64,
      averagePerformanceLast3: 62,
      latestSpeedRating: 105,
      previousSpeedRating: 100,
      averageSpeedLast3: 98,
      raceClass: "4",
      weightCarriedLbs: 130,
      raceMedianWeightCarriedLbs: 128,
    });

    assert.equal(rating?.version, TURF_PERFORMANCE_RATING_VERSION);
    assert.equal(rating?.historyDepth, 3);
    assert.equal(rating?.rating.toFixed(3), "105.704");
    assert.equal(rating?.rawRating.toFixed(6), "0.594580");
  });

  test("does not fabricate a rating when both components are missing", () => {
    const rating = calculateTurfPerformanceRating({
      latestPerformanceRating: null,
      previousPerformanceRating: null,
      averagePerformanceLast3: null,
      latestSpeedRating: null,
      previousSpeedRating: null,
      averageSpeedLast3: null,
      raceClass: "4",
      weightCarriedLbs: 130,
      raceMedianWeightCarriedLbs: 128,
    });

    assert.equal(rating, null);
  });

  test("tracks one, two and three run history depth", () => {
    assert.equal(ratingForDepth(1)?.historyDepth, 1);
    assert.equal(ratingForDepth(2)?.historyDepth, 2);
    assert.equal(ratingForDepth(3)?.historyDepth, 3);
  });

  test("W50 shadow changes only the relative-weight coefficient", () => {
    const production = calculateTurfPerformanceRating({
      latestPerformanceRating: 70,
      previousPerformanceRating: 64,
      averagePerformanceLast3: 62,
      latestSpeedRating: 105,
      previousSpeedRating: 100,
      averageSpeedLast3: 98,
      raceClass: "4",
      weightCarriedLbs: 132,
      raceMedianWeightCarriedLbs: 128,
    });
    const shadow = calculateTurfPerformanceRating({
      latestPerformanceRating: 70,
      previousPerformanceRating: 64,
      averagePerformanceLast3: 62,
      latestSpeedRating: 105,
      previousSpeedRating: 100,
      averageSpeedLast3: 98,
      raceClass: "4",
      weightCarriedLbs: 132,
      raceMedianWeightCarriedLbs: 128,
      weightCoefficientMultiplier: TURF_PERFORMANCE_RATING_W50_WEIGHT_MULTIPLIER,
    });

    assert.equal(production?.historyDepth, shadow?.historyDepth);
    assert.equal(production?.basis, "turf");
    assert.equal(shadow?.basis, "turf");
    assert.notEqual(production?.rating.toFixed(3), shadow?.rating.toFixed(3));
  });

  test("calculates a labelled AW fallback rating from AW evidence", () => {
    const rating = calculateCrossSurfaceTurfFallbackTpr({
      latestAwSpeedRating: 100,
      previousAwSpeedRating: null,
      averageAwSpeedLast3: null,
      raceClass: "4",
      weightCarriedLbs: 130,
      raceMedianWeightCarriedLbs: 128,
    });

    assert.equal(rating?.basis, "aw_fallback");
    assert.equal(rating?.isCrossSurfaceFallback, true);
    assert.equal(rating?.fallbackSourceSurface, "all_weather");
    assert.equal(rating?.historyDepth, 1);
  });

  test("ranks by TPR with existing tie convention and calculates gaps", () => {
    const ranked = rankTurfPerformanceRatings([
      { id: "runner-b", rating: ratingValue(110) },
      { id: "runner-a", rating: ratingValue(110) },
      { id: "runner-c", rating: ratingValue(101.5) },
      { id: "runner-unrated", rating: null },
    ]);

    assert.equal(ranked.get("runner-a")?.rank, 1);
    assert.equal(ranked.get("runner-b")?.rank, 1);
    assert.equal(ranked.get("runner-c")?.rank, 3);
    assert.equal(ranked.get("runner-a")?.gap, 0);
    assert.equal(ranked.get("runner-c")?.gap, -8.5);
    assert.equal(ranked.has("runner-unrated"), false);
  });

  test("formats diagnostic history labels", () => {
    assert.equal(turfPerformanceHistoryDepthLabel(3), "3-run basis");
    assert.equal(turfPerformanceHistoryDepthLabel(2), "2-run basis");
    assert.equal(turfPerformanceHistoryDepthLabel(1), "1-run basis");
    assert.equal(turfPerformanceHistoryDepthLabel(null), "Insufficient history");
  });
});

function ratingForDepth(depth: 1 | 2 | 3) {
  return calculateTurfPerformanceRating({
    latestPerformanceRating: 70,
    previousPerformanceRating: depth >= 2 ? 64 : null,
    averagePerformanceLast3: depth === 3 ? 62 : null,
    latestSpeedRating: 105,
    previousSpeedRating: depth >= 2 ? 100 : null,
    averageSpeedLast3: depth === 3 ? 98 : null,
    raceClass: "4",
    weightCarriedLbs: 130,
    raceMedianWeightCarriedLbs: 128,
  });
}

function ratingValue(value: number): TurfPerformanceRating {
  return {
    rating: value,
    rawRating: value,
    historyDepth: 3 as const,
    version: TURF_PERFORMANCE_RATING_VERSION,
    basis: "turf",
    isCrossSurfaceFallback: false,
    fallbackSourceSurface: null,
  };
}
