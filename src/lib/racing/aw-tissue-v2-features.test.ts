import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { AW_SURFACE_REGISTRY, resolveAwMaterial } from "./aw-surface-material";
import { AW_V2_NAMES, AW_SURFACE_FEATURE_POLICY, awV2NumericVector, buildAwSurfaceFeatures, type SurfacePrior } from "./aw-tissue-v2-features";
import { NUMERIC_FEATURES, COMMENT_FEATURE_NAMES, numericVector, raceSoftmax, fitModel, EPOCHS, L2, score } from "../../../scripts/diagnose-independent-tissue-feasibility";
import type { HistoricalPreRaceFeatureRow } from "./historical-target-metrics";

const at = new Date("2025-06-01T16:00:00Z");
function prior(id: string, course = "Newcastle", day = 1, speed: number | null = 100): SurfacePrior {
  return { runnerId: id, raceId: id, raceDateTime: new Date(at.getTime() - day * 86400000), course, surface: ["Newcastle", "Southwell", "Wolverhampton"].includes(course) ? "ALLWEATHER" : "POLYTRACK", aw: true, completedTimed: true, speed, weightLbs: 140 };
}
function features(priors: SurfacePrior[] = [], overrides: Partial<Parameters<typeof buildAwSurfaceFeatures>[0]> = {}) {
  return buildAwSurfaceFeatures({ targetRaceId: "target", targetAt: at, historyCutoff: at, course: "Newcastle", surface: "ALLWEATHER", historyLoaded: true, priors, ...overrides });
}
test("surface registry is effective-dated, provenance-bearing and non-overlapping", () => {
  for (const row of AW_SURFACE_REGISTRY) { assert(row.validFrom); assert(row.provenance); }
  for (const a of AW_SURFACE_REGISTRY) for (const b of AW_SURFACE_REGISTRY) if (a !== b && a.course === b.course) assert(a.validTo && a.validTo <= b.validFrom || b.validTo && b.validTo <= a.validFrom);
});
test("Southwell historical conversion leaves unverified intervals unknown", () => {
  const resolve = (date: string, surface = "ALLWEATHER") => resolveAwMaterial({ course: "Southwell", raceDate: date, surface, aw: true });
  assert.equal(resolve("2020-08-31").material, "FIBRESAND");
  assert.equal(resolve("2021-12-06").material, "UNKNOWN");
  assert.equal(resolve("2021-12-07").material, "TAPETA");
  assert.equal(resolve("2025-01-01", "FIBRESAND").reason, "raw_registry_conflict");
});
test("Wolverhampton conflict is unknown, not silently overwritten", () => {
  assert.equal(resolveAwMaterial({ course: "Wolverhampton", raceDate: "2026-04-17", surface: "POLYTRACK", aw: true }).reason, "raw_registry_conflict");
  assert.equal(resolveAwMaterial({ course: "Wolverhampton", raceDate: "2013-04-17", surface: "ALLWEATHER", aw: true }).material, "UNKNOWN");
});
test("mixed-course Turf, unknown venue, and raw Standard do not invent material", () => {
  for (const args of [{ course: "Newcastle", surface: "TURF", aw: false }, { course: "TRP Extras", surface: "ALLWEATHER", aw: true }, { course: "Newcastle", surface: "Standard / Slow", aw: true }]) {
    assert.equal(resolveAwMaterial({ ...args, raceDate: "2025-01-01" }).material, "UNKNOWN");
  }
});
test("exposure distinguishes observed no-history zero from unknown/load failure", () => {
  assert.equal(features().exposure, 0);
  assert.equal(features().performanceReason, "no_same_material_history");
  assert.equal(features([], { historyLoaded: false }).exposure, null);
  assert.equal(features([], { course: "TRP Extras" }).exposure, null);
  assert.equal(features([prior("a"), prior("b", "Kempton")]).exposure, Math.log1p(1));
});
test("prior history without a usable rating has available exposure and missing performance", () => {
  const f = features([prior("a", "Newcastle", 1, null)]);
  assert.equal(f.exposure, Math.log1p(1)); assert.equal(f.relativePerformance, null);
  assert.equal(f.performanceReason, "no_usable_recent_same_material_rating");
});
test("relative performance contrasts recent material with the same fixed AW baseline", () => {
  const f = features([prior("a", "Newcastle", 1, 108), prior("b", "Southwell", 2, 118), prior("c", "Kempton", 3, 98)]);
  // At 140 lb performance values are 80,90,70: S=85,A=80,m=2.
  assert.equal(f.relativePerformance, 2 / 7 * 5);
  assert.equal(f.usableMatchingRatings, 2); assert.equal(f.usableAwRatings, 3);
});
test("real zero contrast stays available, missing historical weight removes only its rating", () => {
  assert.equal(features([prior("a"), prior("b")]).relativePerformance, 0);
  const f = features([{ ...prior("a"), weightLbs: null }]);
  assert.equal(f.matchingStarts, 1); assert.equal(f.relativePerformance, null);
});
test("recent slots are sliced before missing ratings/material filtering, never replenished", () => {
  const f = features([...Array.from({ length: 5 }, (_, i) => prior(`p${i}`, "Kempton", i + 1)), prior("older", "Newcastle", 6, 999)]);
  assert.equal(f.matchingStarts, 1); assert.equal(f.relativePerformance, null);
  assert(!f.selectedPriorRunnerIds.includes("older"));
});
test("target/future/post-capture/out-of-window/non-timed and non-AW rows cannot enter", () => {
  const original = features([prior("good", "Newcastle", 3)], { historyCutoff: new Date(at.getTime() - 2 * 86400000) });
  const extra = [prior("future", "Newcastle", -1), prior("same_time", "Newcastle", 0), prior("after_capture", "Newcastle", 1), prior("old", "Newcastle", 366), { ...prior("target"), raceId: "target" }, { ...prior("not_timed"), completedTimed: false }, { ...prior("turf"), aw: false }];
  assert.deepEqual(features([prior("good", "Newcastle", 3), ...extra], { historyCutoff: new Date(at.getTime() - 2 * 86400000) }), original);
  assert.equal(features([], { historyCutoff: new Date(at.getTime() + 1) }).exposure, null);
});
test("unresolved prior material and duplicate history are refused, not converted to zero", () => {
  assert.equal(features([{ ...prior("conflict", "Wolverhampton"), surface: "POLYTRACK" }]).exposureReason, "unknown_prior_material");
  assert.equal(features([prior("same"), prior("same")]).exposureReason, "duplicate_history");
});
test("95-column schema changes exactly the four approved names in fixed positions", () => {
  const turf = [...NUMERIC_FEATURES.map(([n]) => n), ...NUMERIC_FEATURES.map(([n]) => `${n}_missing`), ...COMMENT_FEATURE_NAMES];
  assert.equal(AW_V2_NAMES.length, 95); assert.equal(new Set(AW_V2_NAMES).size, 95);
  assert.deepEqual(AW_V2_NAMES.map((n, i) => n !== turf[i] ? i : -1).filter(i => i >= 0), [24, 25, 50, 51]);
  assert.equal(AW_V2_NAMES[24], "log_surface_runs_365d"); assert.equal(AW_V2_NAMES[25], "surface_recent_performance_delta");
  assert.equal(AW_SURFACE_FEATURE_POLICY.shrinkageDepth, 5);
});
test("core transforms, declaration counts and flags reuse canonical zero imputation", () => {
  const raw = { officialRating: null, latestPerformanceRating: 72, bestPerformanceLast3: 72, averagePerformanceLast3: 72, latestAwSpeedRating: 100, bestAwSpeedLast3: 100, averageAwSpeedLast3: 100, latestTurfSpeedRating: 1, bestTurfSpeedLast3: 1, averageTurfSpeedLast3: 1, latestTodaysRating: null, bestTodaysRatingLast3: null, averageTodaysRatingLast3: null, trainerPriorWinRate: null, trainerPriorRuns: 0, jockeyPriorWinRate: null, jockeyPriorRuns: 0, daysSinceLastRun: 2, priorRuns: 2, horseAge: 4, weightCarriedLbs: 140, raceClass: "Class 4", distanceYards: 1760, actualRunnerCount: 2, declaredRunnerCount: 8, draw: 2, raceName: "Handicap", raceType: "flat", going: "Soft" } as HistoricalPreRaceFeatureRow;
  const v = awV2NumericVector(raw, features());
  const expected = numericVector({ ...raw, actualRunnerCount: null, latestTurfSpeedRating: 100, bestTurfSpeedLast3: 100, averageTurfSpeedLast3: 100 });
  expected.forEach((value, i) => { if (![24,25,50,51].includes(i)) assert.equal(v[i], value); });
  assert.equal(v[20], 8); assert.equal(v[22], .25); assert.equal(v[26], 1);
  assert.equal(v[24], 0); assert.equal(v[50], 0); assert.equal(v[51], 1);
});
test("canonical fitting/scaling/score/normalization is reused without AW tuning", () => {
  assert.equal(EPOCHS, 90); assert.equal(L2, .02); assert.equal(typeof fitModel, "function");
  const model = { names: ["x"], weights: [2], means: [3], scales: [4] };
  assert.equal(score(model, [7]), 2);
  assert.deepEqual(raceSoftmax([2, 2]), [.5, .5]);
});
test("legacy AW artifact and canonical Turf v3 are unchanged", async () => {
  const turf = JSON.parse(await readFile("data/research/tissue-model-v3.json", "utf8"));
  assert.equal(turf.checksum, "2c1e6d071f00396d92e9e80f351b1ba273b8b3316b5a6b2e483818cd60002db4");
  assert.equal(createHash("sha256").update(JSON.stringify({ specification: turf.specification, model: turf.model })).digest("hex"), turf.checksum);
  const aw = JSON.parse(await readFile("data/research/aw-tissue-model-v1.json", "utf8"));
  const { checksum, ...contents } = aw;
  assert.equal(checksum, "52376e5361e41da6b991aebfbb7f202cebb1f437b1259d55711824f55eead8a8");
  assert.equal(createHash("sha256").update(JSON.stringify(contents)).digest("hex"), checksum);
});
