import { raceClassNumber } from "./research-rule-classes";

export const TURF_PERFORMANCE_RATING_VERSION = "TPR_S2_V1";
export const TURF_PERFORMANCE_RATING_W50_SHADOW_VERSION = `${TURF_PERFORMANCE_RATING_VERSION}_W50_SHADOW`;
export const TURF_PERFORMANCE_RATING_W50_WEIGHT_MULTIPLIER = 0.5;

const B3_WEIGHTS: [number, number, number] = [0.6, 0.25, 0.15];

const RPR_MEDIAN_2025 = 59.73279656117335;
const RPR_IQR_2025 = 15.303501885173738;
const SPEED_MEDIAN_2025 = 96.81426514225745;
const SPEED_IQR_2025 = 13.71148109158355;

const CLASS_OFFSETS_2025: Record<string, number> = {
  "Class 1": 0.40728372695748705,
  "Class 2": 0.21081366080149383,
  "Class 3": 0.15923801805811594,
  "Class 4": 0.012261721350936047,
  "Class 5": -0.07957322921317331,
  "Class 6": -0.197767969260115,
  unknown: -0.05486729600240039,
};

export const TURF_PERFORMANCE_RATING_WEIGHT_COEFFICIENT_RAW_POINTS_PER_LB = 0.1216065319677862;
const TPR_DEVELOPMENT_MEAN = -0.103;
const TPR_DEVELOPMENT_STDEV = 1.223;

export type TurfPerformanceRatingBasis = "turf" | "aw_fallback";

export type TurfPerformanceRatingInput = {
  latestPerformanceRating: number | null;
  previousPerformanceRating: number | null;
  averagePerformanceLast3: number | null;
  latestSpeedRating: number | null;
  previousSpeedRating: number | null;
  averageSpeedLast3: number | null;
  raceClass: string | null;
  weightCarriedLbs: number | null;
  raceMedianWeightCarriedLbs: number | null;
  weightCoefficientMultiplier?: number;
  basis?: TurfPerformanceRatingBasis;
  fallbackSourceSurface?: "all_weather" | null;
};

export type TurfPerformanceRating = {
  rating: number;
  rawRating: number;
  historyDepth: 1 | 2 | 3;
  version: typeof TURF_PERFORMANCE_RATING_VERSION;
  basis?: TurfPerformanceRatingBasis;
  isCrossSurfaceFallback?: boolean;
  fallbackSourceSurface?: "all_weather" | null;
};

export type RankedTurfPerformanceRating = TurfPerformanceRating & {
  rank: number;
  gap: number | null;
};

export function calculateTurfPerformanceRating(
  input: TurfPerformanceRatingInput,
): TurfPerformanceRating | null {
  const performanceValues = reconstructedLast3Values(
    input.latestPerformanceRating,
    input.previousPerformanceRating,
    input.averagePerformanceLast3,
  );
  const speedValues = reconstructedLast3Values(
    input.latestSpeedRating,
    input.previousSpeedRating,
    input.averageSpeedLast3,
  );
  const performance = weightedRecentLevel(performanceValues);
  const speed = weightedRecentLevel(speedValues);
  const historyDepth = Math.min(countNumbers(performanceValues), countNumbers(speedValues));
  const weightDiff = weightDifference(input.weightCarriedLbs, input.raceMedianWeightCarriedLbs);

  if (performance === null || speed === null || historyDepth === 0 || weightDiff === null) {
    return null;
  }

  const base = (
    robustScore(performance, RPR_MEDIAN_2025, RPR_IQR_2025) +
    robustScore(speed, SPEED_MEDIAN_2025, SPEED_IQR_2025)
  ) / 2;
  const classAdjusted = base - classOffset(input.raceClass);
  const weightMultiplier = input.weightCoefficientMultiplier ?? 1;
  const rawRating = classAdjusted + (
    TURF_PERFORMANCE_RATING_WEIGHT_COEFFICIENT_RAW_POINTS_PER_LB *
    weightMultiplier *
    weightDiff
  );
  return {
    rating: 100 + (10 * ((rawRating - TPR_DEVELOPMENT_MEAN) / TPR_DEVELOPMENT_STDEV)),
    rawRating,
    historyDepth: historyDepth as 1 | 2 | 3,
    version: TURF_PERFORMANCE_RATING_VERSION,
    basis: input.basis ?? "turf",
    isCrossSurfaceFallback: input.basis === "aw_fallback",
    fallbackSourceSurface: input.fallbackSourceSurface ?? null,
  };
}

export function calculateCrossSurfaceTurfFallbackTpr(
  input: {
    latestAwSpeedRating: number | null;
    previousAwSpeedRating: number | null;
    averageAwSpeedLast3: number | null;
    raceClass: string | null;
    weightCarriedLbs: number | null;
    raceMedianWeightCarriedLbs: number | null;
    weightCoefficientMultiplier?: number;
  },
): TurfPerformanceRating | null {
  return calculateTurfPerformanceRating({
    latestPerformanceRating: input.latestAwSpeedRating,
    previousPerformanceRating: input.previousAwSpeedRating,
    averagePerformanceLast3: input.averageAwSpeedLast3,
    latestSpeedRating: input.latestAwSpeedRating,
    previousSpeedRating: input.previousAwSpeedRating,
    averageSpeedLast3: input.averageAwSpeedLast3,
    raceClass: input.raceClass,
    weightCarriedLbs: input.weightCarriedLbs,
    raceMedianWeightCarriedLbs: input.raceMedianWeightCarriedLbs,
    weightCoefficientMultiplier: input.weightCoefficientMultiplier,
    basis: "aw_fallback",
    fallbackSourceSurface: "all_weather",
  });
}

export function rankTurfPerformanceRatings<T extends { id: string; rating: TurfPerformanceRating | null }>(
  runners: T[],
): Map<string, RankedTurfPerformanceRating> {
  const ranked = runners
    .filter((runner): runner is T & { rating: TurfPerformanceRating } => runner.rating !== null)
    .sort((left, right) =>
      right.rating.rating - left.rating.rating ||
      left.id.localeCompare(right.id)
    );
  const topRating = ranked[0]?.rating.rating ?? null;
  const secondRating = ranked[1]?.rating.rating ?? null;
  const values = new Map<string, RankedTurfPerformanceRating>();
  let previousValue: number | null = null;
  let previousRank = 0;

  ranked.forEach((runner, index) => {
    const rank = runner.rating.rating === previousValue ? previousRank : index + 1;
    const gap = topRating === null
      ? null
      : rank === 1
        ? secondRating === null ? null : runner.rating.rating - secondRating
        : runner.rating.rating - topRating;
    values.set(runner.id, {
      ...runner.rating,
      rank,
      gap,
    });
    previousValue = runner.rating.rating;
    previousRank = rank;
  });

  return values;
}

export function turfPerformanceHistoryDepthLabel(
  depth: number | null | undefined,
): string {
  if (depth === 3) return "3-run basis";
  if (depth === 2) return "2-run basis";
  if (depth === 1) return "1-run basis";
  return "Insufficient history";
}

function reconstructedLast3Values(
  latest: number | null,
  previous: number | null,
  averageLast3: number | null,
) {
  const values: Array<number | null> = [latest, previous];
  if (latest !== null && previous !== null && averageLast3 !== null) {
    values.push((averageLast3 * 3) - latest - previous);
  }
  return values;
}

function weightedRecentLevel(values: Array<number | null>) {
  const available = values
    .slice(0, 3)
    .map((value, index) => ({ value, weight: B3_WEIGHTS[index]! }))
    .filter((entry): entry is { value: number; weight: number } =>
      entry.value !== null && Number.isFinite(entry.value)
    );
  if (available.length === 0) return null;
  const weightTotal = available.reduce((total, entry) => total + entry.weight, 0);
  return available.reduce((total, entry) => total + entry.value * (entry.weight / weightTotal), 0);
}

function countNumbers(values: Array<number | null>) {
  return values.filter((value) => value !== null && Number.isFinite(value)).length;
}

function robustScore(value: number, median: number, iqr: number) {
  return (value - median) / iqr;
}

function classOffset(value: string | null) {
  const raceClass = raceClassNumber(value);
  return CLASS_OFFSETS_2025[raceClass === null ? "unknown" : `Class ${raceClass}`] ?? 0;
}

function weightDifference(
  weightCarriedLbs: number | null,
  raceMedianWeightCarriedLbs: number | null,
) {
  if (weightCarriedLbs === null || raceMedianWeightCarriedLbs === null) return null;
  return weightCarriedLbs - raceMedianWeightCarriedLbs;
}
