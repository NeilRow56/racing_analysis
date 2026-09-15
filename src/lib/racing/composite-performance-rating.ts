import type {
  HistoricalPreRaceFeatureRow,
  HistoricalTargetRunnerMetricsRow,
} from "./historical-target-metrics";

export const COMPOSITE_PERFORMANCE_RATING_VERSION = "composite_performance_v1";
export const COMPOSITE_PERFORMANCE_RATING_V2_VERSION = "composite_performance_v2";

export const COMPOSITE_PERFORMANCE_WEIGHTS = {
  latestSpeed: 30,
  bestL3Speed: 25,
  latestPerformance: 25,
  orRelative: 10,
  recency: 5,
  experience: 5,
} as const;

export const COMPOSITE_PERFORMANCE_V2_WEIGHTS = {
  latestSpeed: 30,
  bestL3Speed: 45,
  latestPerformance: 20,
  orRelative: 5,
  recency: 0,
  experience: 0,
} as const;

export type CompositePerformanceComponentKey = keyof typeof COMPOSITE_PERFORMANCE_WEIGHTS;
export type CompositePerformanceMissingStrategy = "neutral_50" | "reweight_available";
export type CompositePerformanceVersion =
  | typeof COMPOSITE_PERFORMANCE_RATING_VERSION
  | typeof COMPOSITE_PERFORMANCE_RATING_V2_VERSION;

export type CompositePerformanceFormula = {
  version: CompositePerformanceVersion;
  weights: Record<CompositePerformanceComponentKey, number>;
  missingStrategy: CompositePerformanceMissingStrategy;
};

export const COMPOSITE_PERFORMANCE_V1_FORMULA: CompositePerformanceFormula = {
  version: COMPOSITE_PERFORMANCE_RATING_VERSION,
  weights: COMPOSITE_PERFORMANCE_WEIGHTS,
  missingStrategy: "neutral_50",
};

export const COMPOSITE_PERFORMANCE_V2_FORMULA: CompositePerformanceFormula = {
  version: COMPOSITE_PERFORMANCE_RATING_V2_VERSION,
  weights: COMPOSITE_PERFORMANCE_V2_WEIGHTS,
  missingStrategy: "reweight_available",
};

export const COMPOSITE_PERFORMANCE_COMPONENTS = [
  "latestSpeed",
  "bestL3Speed",
  "latestPerformance",
  "orRelative",
  "recency",
  "experience",
] as const satisfies CompositePerformanceComponentKey[];

export const COMPOSITE_PERFORMANCE_CORE_COMPONENTS = [
  "latestSpeed",
  "bestL3Speed",
  "latestPerformance",
  "orRelative",
] as const satisfies CompositePerformanceComponentKey[];

export type CompositePerformanceRating = {
  version: CompositePerformanceVersion;
  targetRunnerId: string;
  targetRaceId: string;
  rating: number | null;
  rank: number | null;
  components: Record<CompositePerformanceComponentKey, number | null>;
  contributions: Record<CompositePerformanceComponentKey, number>;
  missing: CompositePerformanceComponentKey[];
  coreAvailableCount: number;
  status: "full" | "partial" | "unrated";
};

type MutableCompositePerformanceRating = Omit<CompositePerformanceRating, "rank"> & {
  rank: number | null;
};

export function rateCompositePerformanceRows(
  rows: HistoricalTargetRunnerMetricsRow[],
  formula: CompositePerformanceFormula = COMPOSITE_PERFORMANCE_V1_FORMULA,
): Map<string, CompositePerformanceRating> {
  const ratings = new Map<string, MutableCompositePerformanceRating>();
  const rowsByRace = new Map<string, HistoricalTargetRunnerMetricsRow[]>();
  for (const row of rows) {
    rowsByRace.set(row.features.targetRaceId, [
      ...(rowsByRace.get(row.features.targetRaceId) ?? []),
      row,
    ]);
  }

  for (const raceRows of rowsByRace.values()) {
    const componentScores = {
      latestSpeed: percentileScores(raceRows, (row) => row.features.latestSpeedRating),
      bestL3Speed: percentileScores(raceRows, (row) => row.features.bestSpeedLast3),
      latestPerformance: percentileScores(raceRows, (row) => row.features.latestPerformanceRating),
      orRelative: percentileScores(raceRows, (row) => orRelativeValue(row.features)),
    };

    for (const row of raceRows) {
      const components: Record<CompositePerformanceComponentKey, number | null> = {
        latestSpeed: componentScores.latestSpeed.get(row.features.targetRunnerId) ?? null,
        bestL3Speed: componentScores.bestL3Speed.get(row.features.targetRunnerId) ?? null,
        latestPerformance: componentScores.latestPerformance.get(row.features.targetRunnerId) ?? null,
        orRelative: componentScores.orRelative.get(row.features.targetRunnerId) ?? null,
        recency: recencyScore(row.features.daysSinceLastRun),
        experience: experienceScore(row.features.priorRuns),
      };
      const missing = componentKeys().filter((key) => formula.weights[key] > 0 && components[key] === null);
      const coreAvailableCount = COMPOSITE_PERFORMANCE_CORE_COMPONENTS
        .filter((key) => formula.weights[key] > 0 && components[key] !== null).length;
      const rating = coreAvailableCount === 0
        ? null
        : compositeScore(components, formula);

      ratings.set(row.features.targetRunnerId, {
        version: formula.version,
        targetRunnerId: row.features.targetRunnerId,
        targetRaceId: row.features.targetRaceId,
        rating: rating === null ? null : round1(rating),
        rank: null,
        components,
        contributions: componentKeys().reduce((result, key) => {
          result[key] = componentContribution(key, components, formula);
          return result;
        }, {} as Record<CompositePerformanceComponentKey, number>),
        missing,
        coreAvailableCount,
        status: rating === null ? "unrated" : missing.length === 0 ? "full" : "partial",
      });
    }

    rankRaceRatings(raceRows, ratings);
  }

  return ratings;
}

export function compositeComponentScores(
  rows: HistoricalTargetRunnerMetricsRow[],
): Map<string, Record<CompositePerformanceComponentKey, number | null>> {
  const result = new Map<string, Record<CompositePerformanceComponentKey, number | null>>();
  const rowsByRace = new Map<string, HistoricalTargetRunnerMetricsRow[]>();
  for (const row of rows) {
    rowsByRace.set(row.features.targetRaceId, [
      ...(rowsByRace.get(row.features.targetRaceId) ?? []),
      row,
    ]);
  }

  for (const raceRows of rowsByRace.values()) {
    const componentScores = {
      latestSpeed: percentileScores(raceRows, (row) => row.features.latestSpeedRating),
      bestL3Speed: percentileScores(raceRows, (row) => row.features.bestSpeedLast3),
      latestPerformance: percentileScores(raceRows, (row) => row.features.latestPerformanceRating),
      orRelative: percentileScores(raceRows, (row) => orRelativeValue(row.features)),
    };
    for (const row of raceRows) {
      result.set(row.features.targetRunnerId, {
        latestSpeed: componentScores.latestSpeed.get(row.features.targetRunnerId) ?? null,
        bestL3Speed: componentScores.bestL3Speed.get(row.features.targetRunnerId) ?? null,
        latestPerformance: componentScores.latestPerformance.get(row.features.targetRunnerId) ?? null,
        orRelative: componentScores.orRelative.get(row.features.targetRunnerId) ?? null,
        recency: recencyScore(row.features.daysSinceLastRun),
        experience: experienceScore(row.features.priorRuns),
      });
    }
  }
  return result;
}

export function orRelativeValue(features: HistoricalPreRaceFeatureRow): number | null {
  if (features.bestSpeedLast3 === null || features.officialRating === null) {
    return null;
  }
  return features.bestSpeedLast3 - features.officialRating;
}

export function recencyScore(daysSinceLastRun: number | null): number | null {
  if (daysSinceLastRun === null) return null;
  if (daysSinceLastRun <= 7) return 70;
  if (daysSinceLastRun <= 13) return 90;
  if (daysSinceLastRun <= 60) return 100;
  if (daysSinceLastRun <= 120) return 80;
  if (daysSinceLastRun <= 240) return 50;
  return 25;
}

export function experienceScore(priorRuns: number | null): number | null {
  if (priorRuns === null) return null;
  if (priorRuns === 0) return 50;
  if (priorRuns <= 2) return 70;
  if (priorRuns <= 10) return 100;
  if (priorRuns <= 20) return 90;
  return 80;
}

function percentileScores(
  rows: HistoricalTargetRunnerMetricsRow[],
  valueFor: (row: HistoricalTargetRunnerMetricsRow) => number | null,
): Map<string, number> {
  const scored = rows
    .filter((row) => row.outcome.resultStatus !== "non_runner")
    .map((row) => ({ runnerId: row.features.targetRunnerId, value: valueFor(row) }))
    .filter((row): row is { runnerId: string; value: number } => row.value !== null)
    .sort((left, right) => left.value - right.value || left.runnerId.localeCompare(right.runnerId));
  const result = new Map<string, number>();
  if (scored.length === 0) return result;
  if (scored.length === 1) {
    result.set(scored[0]!.runnerId, 100);
    return result;
  }

  let index = 0;
  while (index < scored.length) {
    let end = index;
    while (end + 1 < scored.length && scored[end + 1]!.value === scored[index]!.value) {
      end += 1;
    }
    const averageIndex = (index + end) / 2;
    const percentile = round1((averageIndex / (scored.length - 1)) * 100);
    for (let cursor = index; cursor <= end; cursor += 1) {
      result.set(scored[cursor]!.runnerId, percentile);
    }
    index = end + 1;
  }
  return result;
}

function rankRaceRatings(
  rows: HistoricalTargetRunnerMetricsRow[],
  ratings: Map<string, MutableCompositePerformanceRating>,
) {
  const rankable = rows
    .filter((row) => row.outcome.resultStatus !== "non_runner")
    .map((row) => ratings.get(row.features.targetRunnerId))
    .filter((rating): rating is MutableCompositePerformanceRating =>
      rating !== undefined && rating.rating !== null,
    )
    .sort((left, right) =>
      (right.rating ?? -Infinity) - (left.rating ?? -Infinity) ||
      left.targetRunnerId.localeCompare(right.targetRunnerId),
    );
  let previousRating: number | null = null;
  let previousRank = 0;
  rankable.forEach((rating, index) => {
    const rank = rating.rating === previousRating ? previousRank : index + 1;
    rating.rank = rank;
    previousRating = rating.rating;
    previousRank = rank;
  });
}

function compositeScore(
  components: Record<CompositePerformanceComponentKey, number | null>,
  formula: CompositePerformanceFormula,
) {
  if (formula.missingStrategy === "neutral_50") {
    return componentKeys().reduce((total, key) => total + componentContribution(key, components, formula), 0);
  }
  const availableWeight = componentKeys().reduce(
    (total, key) => total + (components[key] === null ? 0 : formula.weights[key]),
    0,
  );
  if (availableWeight <= 0) return null;
  const score = componentKeys().reduce((total, key) => {
    const value = components[key];
    return value === null ? total : total + value * formula.weights[key];
  }, 0);
  return score / availableWeight;
}

function componentContribution(
  key: CompositePerformanceComponentKey,
  components: Record<CompositePerformanceComponentKey, number | null>,
  formula: CompositePerformanceFormula,
) {
  const weight = formula.weights[key];
  if (weight === 0) return 0;
  if (formula.missingStrategy === "neutral_50") {
    return ((components[key] ?? 50) * weight) / 100;
  }
  const availableWeight = componentKeys().reduce(
    (total, candidate) => total + (components[candidate] === null ? 0 : formula.weights[candidate]),
    0,
  );
  if (availableWeight <= 0 || components[key] === null) return 0;
  return (components[key] * weight) / availableWeight;
}

function componentKeys(): CompositePerformanceComponentKey[] {
  return [...COMPOSITE_PERFORMANCE_COMPONENTS];
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}
