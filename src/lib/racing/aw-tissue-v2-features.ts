import { COMMENT_FEATURE_NAMES, NUMERIC_FEATURES, commentVector, numericVector, type HistoricalComment } from "../../../scripts/diagnose-independent-tissue-feasibility";
import type { HistoricalPreRaceFeatureRow } from "./historical-target-metrics";
import { calculateWeightAdjustedPerformance } from "./weight-performance";
import { resolveAwMaterial, type AwMaterial } from "./aw-surface-material";

export const AW_TISSUE_V2_SCHEMA = "aw_tissue_v2_turf_v3_core_surface_history_v1";
export const AW_SURFACE_FEATURE_POLICY = { lookbackDays: 365, recentSlots: 5, shrinkageDepth: 5, history: "completed_timed_aw_starts", selection: "slice_before_material_or_rating_filter" } as const;
export const AW_V2_NUMERIC_NAMES = NUMERIC_FEATURES.map(([name], i) => i === 24 ? "log_surface_runs_365d" : i === 25 ? "surface_recent_performance_delta" : name);
export const AW_V2_NAMES = [...AW_V2_NUMERIC_NAMES, ...AW_V2_NUMERIC_NAMES.map(n => `${n}_missing`), ...COMMENT_FEATURE_NAMES];
export type SurfacePrior = {
  raceId: string; runnerId: string; raceDateTime: Date; course: string; surface: string | null;
  aw: boolean; completedTimed: boolean; speed: number | null; weightLbs: number | null;
};
export type AwSurfaceFeatures = {
  material: AwMaterial; exposure: number | null; relativePerformance: number | null;
  exposureReason: string | null; performanceReason: string | null;
  matchingStarts: number | null; usableMatchingRatings: number; usableAwRatings: number;
  selectedPriorRunnerIds: string[];
};

export function buildAwSurfaceFeatures(input: {
  targetRaceId: string; targetAt: Date; historyCutoff: Date; course: string; surface: string | null;
  historyLoaded: boolean; priors: readonly SurfacePrior[];
}): AwSurfaceFeatures {
  const resolved = resolveAwMaterial({ course: input.course, raceDate: Number.isFinite(input.targetAt.getTime()) ? input.targetAt.toISOString().slice(0, 10) : "", surface: input.surface, aw: true });
  const empty = (reason: string): AwSurfaceFeatures => ({ material: resolved.material, exposure: null, relativePerformance: null, exposureReason: reason, performanceReason: reason, matchingStarts: null, usableMatchingRatings: 0, usableAwRatings: 0, selectedPriorRunnerIds: [] });
  if (!input.historyLoaded || !Number.isFinite(input.targetAt.getTime()) || !Number.isFinite(input.historyCutoff.getTime()) || input.historyCutoff > input.targetAt) return empty("history_cutoff_unavailable");
  if (resolved.material === "UNKNOWN") return empty(resolved.reason ?? "unknown_target_material");
  const low = input.targetAt.getTime() - AW_SURFACE_FEATURE_POLICY.lookbackDays * 86400000;
  const priors = input.priors.filter(p => p.raceId !== input.targetRaceId && p.aw && p.completedTimed && p.raceDateTime.getTime() >= low && p.raceDateTime < input.historyCutoff && p.raceDateTime < input.targetAt)
    .sort((a, b) => b.raceDateTime.getTime() - a.raceDateTime.getTime() || a.runnerId.localeCompare(b.runnerId));
  if (new Set(priors.map(p => p.runnerId)).size !== priors.length || new Set(priors.map(p => p.raceId)).size !== priors.length) return empty("duplicate_history");
  const materials = priors.map(p => resolveAwMaterial({ course: p.course, raceDate: p.raceDateTime.toISOString().slice(0, 10), surface: p.surface, aw: p.aw }).material);
  if (materials.includes("UNKNOWN")) return empty("unknown_prior_material");
  const matchingStarts = materials.filter(m => m === resolved.material).length;
  const recent = priors.slice(0, AW_SURFACE_FEATURE_POLICY.recentSlots);
  const rated = recent.flatMap((p, i) => {
    const performance = calculateWeightAdjustedPerformance({ rawSpeedRating: p.speed, weightCarriedLb: p.weightLbs });
    return performance ? [{ value: performance.performanceRating, material: materials[i]! }] : [];
  });
  const matching = rated.filter(r => r.material === resolved.material);
  const mean = (vs: number[]) => vs.reduce((s, v) => s + v, 0) / vs.length;
  const relativePerformance = matching.length ? matching.length / (matching.length + AW_SURFACE_FEATURE_POLICY.shrinkageDepth) * (mean(matching.map(r => r.value)) - mean(rated.map(r => r.value))) : null;
  return { material: resolved.material, exposure: Math.log1p(matchingStarts), relativePerformance, exposureReason: null,
    performanceReason: matchingStarts === 0 ? "no_same_material_history" : matching.length === 0 ? "no_usable_recent_same_material_rating" : null,
    matchingStarts, usableMatchingRatings: matching.length, usableAwRatings: rated.length, selectedPriorRunnerIds: recent.map(p => p.runnerId) };
}

/** Historical cache performance/Today columns are already target-family selected.
 * Only the three speed-source slots need remapping; all other core transforms
 * are the canonical routine, with declarations replacing result counts.
 */
export function awV2NumericVector(features: HistoricalPreRaceFeatureRow, surface: AwSurfaceFeatures): number[] {
  const values = numericVector({ ...features, actualRunnerCount: null,
    latestTurfSpeedRating: features.latestAwSpeedRating, bestTurfSpeedLast3: features.bestAwSpeedLast3, averageTurfSpeedLast3: features.averageAwSpeedLast3 });
  [surface.exposure, surface.relativePerformance].forEach((v, i) => { values[24 + i] = v ?? 0; values[50 + i] = v === null || !Number.isFinite(v) ? 1 : 0; });
  return values;
}
export function awV2Vector(features: HistoricalPreRaceFeatureRow, surface: AwSurfaceFeatures, priorComments: HistoricalComment[]): number[] {
  return [...awV2NumericVector(features, surface), ...commentVector(priorComments)];
}
