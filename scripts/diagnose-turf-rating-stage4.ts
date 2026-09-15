import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { createDbConnection } from "@/db";
import { raceRunners, races } from "@/db/schema";
import { loadLatestBacktestFeatureCacheForYear } from "@/lib/racing/backtest-cache";
import type { HistoricalTargetRunnerMetricsRow } from "@/lib/racing/historical-target-metrics";
import { raceClassNumber } from "@/lib/racing/research-rule-classes";

type Year = "2025" | "2026";
type RankGroup = "rank 1" | "rank 2" | "rank 3" | "rank 4+" | "missing";
type VariantKey = "unadjusted" | "classAdjusted" | "weightAdjusted" | "classWeightAdjusted";

type Context = {
  year: Year;
  settledRows: HistoricalTargetRunnerMetricsRow[];
  baseScores: Map<string, BaseScore>;
};

type BaseScore = {
  targetRunnerId: string;
  rprValues: Array<number | null>;
  speedValues: Array<number | null>;
  rawScore: number | null;
};

type DirectScore = {
  targetRunnerId: string;
  rawScore: number | null;
  rprValidRuns: number;
  speedValidRuns: number;
};

type DirectPriorRun = {
  runnerId: string;
  horseId: string;
  raceDateTime: Date;
  racingPostRating: number | null;
  topspeedRating: number | null;
};

type DirectHistoryDiagnostic = {
  year: Year;
  settledRunners: number;
  directRated: number;
  reconstructedRated: number;
  directThreeAndThree: number;
  reconstructedThreeAndThree: number;
};

type VariantDefinition = {
  key: VariantKey;
  label: string;
  valuesFor: (context: Context) => Map<string, number>;
};

type Benchmark = {
  year: Year;
  key: string;
  label: string;
  values: Map<string, number>;
  ranks: Map<string, number>;
  rankGroups: Map<string, RankGroup>;
  settledRows: HistoricalTargetRunnerMetricsRow[];
  rowsWithValue: HistoricalTargetRunnerMetricsRow[];
};

type Band = {
  label: string;
  min: number;
  max: number;
};

type ClassAdjustment = {
  globalMean: number;
  byClass: Map<string, { mean: number; count: number; offset: number }>;
};

type WeightAdjustment = {
  coefficientRawPointsPerLb: number;
  residualPerformancePerLb: number;
  performancePerRawPoint: number;
  sampleSize: number;
  direction: string;
  strength: string;
};

const YEARS: Year[] = ["2025", "2026"];
const B3_WEIGHTS: [number, number, number] = [0.6, 0.25, 0.15];
const QUERY_CHUNK_SIZE = 3_000;

async function main() {
  console.log("# Turf Rating Stage 4 Diagnostic");
  console.log("");
  console.log("Diagnostic only. Base candidate is fixed B3: 60/25/15 recency weighting for cached RPR/performance and cached Topspeed/speed, combined equally. 2025 is development; 2026 is holdout validation.");
  console.log("");
  console.log("No Research, Today, saved/frozen rules, UI, cache schemas, cache generation, or holdout behavior changed. No ROI, SP, market rank, trainer, jockey, draw, going, course, or future runs used as rating inputs.");
  console.log("");

  const contexts = await loadContexts();
  const directDiagnostics = await directHistoryDiagnostics(contexts);
  const development = contextFor(contexts, "2025");
  const classAdjustment = buildClassAdjustment(development);
  const weightAdjustment = buildWeightAdjustment(development);
  const variants = variantDefinitions(classAdjustment, weightAdjustment);
  const benchmarks = contexts.flatMap((context) => variants.map((variant) =>
    benchmarkFor(context.year, variant.key, variant.label, context.settledRows, variant.valuesFor(context)),
  ));
  const strongest = strongestVariant(benchmarks);

  printInputIntegrity(directDiagnostics);
  printBaseline(benchmarks);
  printClassAdjustment(classAdjustment, benchmarks);
  printWeightAdjustment(weightAdjustment, benchmarks);
  printAbsoluteCalibration(benchmarks);
  printContextPortability(benchmarks);
  printDistanceResidualDiagnostic(benchmarks, strongest);
  printComparison(contexts, benchmarks, strongest);
  printScaleProposal(benchmarks, strongest);
  printConclusion(benchmarks, strongest, classAdjustment, weightAdjustment);
  printGuardrails();
}

async function loadContexts(): Promise<Context[]> {
  const contexts: Context[] = [];
  rowCacheByRace.clear();
  for (const year of YEARS) {
    const cache = await loadLatestBacktestFeatureCacheForYear({ family: "turf_flat", year });
    const settledRows = (cache?.rows ?? [])
      .filter((row) => row.features.raceCode === "turf")
      .filter(isSettledRunner)
      .sort(compareRowsChronologically);
    contexts.push({ year, settledRows, baseScores: baseScoresForRows(settledRows) });
    for (const [raceId, raceRows] of groupBy(settledRows, (row) => row.features.targetRaceId)) {
      rowCacheByRace.set(raceId, raceRows);
    }
  }
  return contexts;
}

function baseScoresForRows(rows: HistoricalTargetRunnerMetricsRow[]) {
  const scores = new Map<string, BaseScore>();
  for (const row of rows) {
    const rprValues = cachedLast3Values(
      row.features.latestPerformanceRating,
      row.features.previousPerformanceRating,
      row.features.averagePerformanceLast3,
    );
    const speedValues = cachedLast3Values(
      row.features.latestSpeedRating,
      row.features.previousSpeedRating,
      row.features.averageSpeedLast3,
    );
    const rprLevel = weightedRecentLevel(rprValues, B3_WEIGHTS);
    const speedLevel = weightedRecentLevel(speedValues, B3_WEIGHTS);
    scores.set(row.features.targetRunnerId, {
      targetRunnerId: row.features.targetRunnerId,
      rprValues,
      speedValues,
      rawScore: rprLevel === null || speedLevel === null ? null : (rprLevel + speedLevel) / 2,
    });
  }
  return scores;
}

async function directHistoryDiagnostics(contexts: Context[]): Promise<DirectHistoryDiagnostic[]> {
  const allRows = contexts.flatMap((context) => context.settledRows);
  const directRunsByHorse = await loadDirectPriorRuns(allRows);
  return contexts.map((context) => {
    const directScores = directScoresForRows(context.settledRows, directRunsByHorse);
    const reconstructed = [...context.baseScores.values()];
    return {
      year: context.year,
      settledRunners: context.settledRows.length,
      directRated: [...directScores.values()].filter((score) => score.rawScore !== null).length,
      reconstructedRated: reconstructed.filter((score) => score.rawScore !== null).length,
      directThreeAndThree: [...directScores.values()].filter((score) => score.rprValidRuns >= 3 && score.speedValidRuns >= 3).length,
      reconstructedThreeAndThree: reconstructed.filter((score) =>
        score.rprValues.filter(isNumber).length >= 3 && score.speedValues.filter(isNumber).length >= 3
      ).length,
    };
  });
}

async function loadDirectPriorRuns(rows: HistoricalTargetRunnerMetricsRow[]) {
  const { db, client } = createDbConnection();
  try {
    const horseIds = [...new Set(rows.map((row) => row.features.horseId))];
    const latestTargetDateTime = rows.reduce(
      (latest, row) => row.features.raceDateTime > latest ? row.features.raceDateTime : latest,
      rows[0]?.features.raceDateTime ?? new Date(0),
    );
    const loaded: DirectPriorRun[] = [];
    for (const horseIdChunk of chunks(horseIds, QUERY_CHUNK_SIZE)) {
      const chunkRows = await db
        .select({
          runnerId: raceRunners.id,
          horseId: raceRunners.horseId,
          raceDateTime: races.raceDatetime,
          racingPostRating: raceRunners.racingPostRating,
          topspeedRating: raceRunners.topspeedRating,
        })
        .from(raceRunners)
        .innerJoin(races, eq(raceRunners.raceId, races.id))
        .where(and(
          inArray(raceRunners.horseId, horseIdChunk),
          eq(raceRunners.source, "sporting_life"),
          eq(races.source, "sporting_life"),
          sql`(${raceRunners.resultStatus} is distinct from 'non_runner' and (${raceRunners.resultStatus} is not null or ${raceRunners.finishingPosition} is not null))`,
          lt(races.raceDatetime, latestTargetDateTime),
        ))
        .orderBy(desc(races.raceDatetime));
      loaded.push(...chunkRows.filter(hasRaceDateTime));
    }
    const byHorse = groupBy(loaded, (row) => row.horseId);
    for (const horseRuns of byHorse.values()) {
      horseRuns.sort((left, right) =>
        right.raceDateTime.getTime() - left.raceDateTime.getTime() ||
        left.runnerId.localeCompare(right.runnerId)
      );
    }
    return byHorse;
  } finally {
    await client.end();
  }
}

function directScoresForRows(
  rows: HistoricalTargetRunnerMetricsRow[],
  directRunsByHorse: Map<string, DirectPriorRun[]>,
) {
  const scores = new Map<string, DirectScore>();
  for (const row of rows) {
    const priorRuns = (directRunsByHorse.get(row.features.horseId) ?? [])
      .filter((run) => run.raceDateTime < row.features.raceDateTime)
      .slice(0, 3);
    const rprValues = priorRuns.map((run) => run.racingPostRating);
    const speedValues = priorRuns.map((run) => run.topspeedRating);
    const rprLevel = weightedRecentLevel(rprValues, B3_WEIGHTS);
    const speedLevel = weightedRecentLevel(speedValues, B3_WEIGHTS);
    scores.set(row.features.targetRunnerId, {
      targetRunnerId: row.features.targetRunnerId,
      rawScore: rprLevel === null || speedLevel === null ? null : (rprLevel + speedLevel) / 2,
      rprValidRuns: rprValues.filter(isNumber).length,
      speedValidRuns: speedValues.filter(isNumber).length,
    });
  }
  return scores;
}

function cachedLast3Values(
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

function weightedRecentLevel(values: Array<number | null>, weights: [number, number, number]) {
  const available = values
    .slice(0, 3)
    .map((value, index) => ({ value, weight: weights[index]! }))
    .filter((entry): entry is { value: number; weight: number } => entry.value !== null && Number.isFinite(entry.value));
  if (available.length === 0) return null;
  const weightTotal = available.reduce((total, entry) => total + entry.weight, 0);
  return available.reduce((total, entry) => total + entry.value * (entry.weight / weightTotal), 0);
}

function variantDefinitions(classAdjustment: ClassAdjustment, weightAdjustment: WeightAdjustment): VariantDefinition[] {
  return [
    {
      key: "unadjusted",
      label: "Variant 0 - unadjusted B3",
      valuesFor: (context) => unadjustedValues(context),
    },
    {
      key: "classAdjusted",
      label: "Variant 1 - class-adjusted B3",
      valuesFor: (context) => classAdjustedValues(context, classAdjustment),
    },
    {
      key: "weightAdjusted",
      label: "Variant 2 - weight-adjusted B3",
      valuesFor: (context) => weightAdjustedValues(context, weightAdjustment),
    },
    {
      key: "classWeightAdjusted",
      label: "Variant 3 - class + weight adjusted B3",
      valuesFor: (context) => {
        const classValues = classAdjustedValues(context, classAdjustment);
        return addWeightAdjustment(context, classValues, weightAdjustment);
      },
    },
  ];
}

function unadjustedValues(context: Context) {
  const values = new Map<string, number>();
  for (const [runnerId, score] of context.baseScores) {
    if (score.rawScore !== null && Number.isFinite(score.rawScore)) {
      values.set(runnerId, score.rawScore);
    }
  }
  return values;
}

function buildClassAdjustment(context: Context): ClassAdjustment {
  const rawValues = unadjustedValues(context);
  const globalMean = average([...rawValues.values()]) ?? 0;
  const byClass = new Map<string, { mean: number; count: number; offset: number }>();
  const rowsByClass = groupBy(
    context.settledRows.filter((row) => rawValues.has(row.features.targetRunnerId)),
    (row) => raceClassBucket(row.features.raceClass),
  );
  for (const [raceClass, rows] of rowsByClass) {
    const values = rows.map((row) => rawValues.get(row.features.targetRunnerId)).filter(isNumber);
    const mean = average(values);
    if (mean !== null) {
      byClass.set(raceClass, { mean, count: values.length, offset: mean - globalMean });
    }
  }
  return { globalMean, byClass };
}

function classAdjustedValues(context: Context, adjustment: ClassAdjustment) {
  const values = unadjustedValues(context);
  const adjusted = new Map<string, number>();
  for (const row of context.settledRows) {
    const value = values.get(row.features.targetRunnerId);
    const classOffset = adjustment.byClass.get(raceClassBucket(row.features.raceClass))?.offset ?? 0;
    if (value !== undefined) {
      adjusted.set(row.features.targetRunnerId, value - classOffset);
    }
  }
  return adjusted;
}

function buildWeightAdjustment(context: Context): WeightAdjustment {
  const rawBenchmark = benchmarkFor(context.year, "unadjusted", "unadjusted", context.settledRows, unadjustedValues(context));
  const bands = quantileBands([...rawBenchmark.values.values()], ["bottom 20%", "20-40%", "40-60%", "60-80%", "top 20%"]);
  const expectedFinishByBand = new Map(bands.map((band) => {
    const rows = rawBenchmark.rowsWithValue.filter((row) => inBand(rawBenchmark.values.get(row.features.targetRunnerId) ?? NaN, band));
    return [band.label, averageFinish(rows)];
  }));
  const samples = rawBenchmark.rowsWithValue.flatMap((row) => {
    const value = rawBenchmark.values.get(row.features.targetRunnerId);
    const band = bands.find((item) => inBand(value ?? NaN, item));
    const expected = band ? expectedFinishByBand.get(band.label) : null;
    const actual = row.outcome.finishingPosition;
    const weightDiff = weightDiffFromRaceMedian(row);
    if (value === undefined || expected === null || expected === undefined || actual === null || weightDiff === null) return [];
    return [{
      rawScore: value,
      weightDiff,
      residualPerformance: expected - actual,
      performance: -actual,
    }];
  });
  const residualPerformancePerLb = slope(samples.map((sample) => sample.weightDiff), samples.map((sample) => sample.residualPerformance)) ?? 0;
  const performancePerRawPoint = slope(samples.map((sample) => sample.rawScore), samples.map((sample) => sample.performance)) ?? 0;
  const coefficientRawPointsPerLb =
    performancePerRawPoint === 0 ? 0 : residualPerformancePerLb / performancePerRawPoint;
  const abs = Math.abs(residualPerformancePerLb);
  return {
    coefficientRawPointsPerLb,
    residualPerformancePerLb,
    performancePerRawPoint,
    sampleSize: samples.length,
    direction: residualPerformancePerLb > 0 ? "higher carried weight outperformed raw-score expectation" : "higher carried weight underperformed raw-score expectation",
    strength: abs >= 0.04 ? "moderate" : abs >= 0.015 ? "weak/moderate" : "weak",
  };
}

function weightAdjustedValues(context: Context, adjustment: WeightAdjustment) {
  return addWeightAdjustment(context, unadjustedValues(context), adjustment);
}

function addWeightAdjustment(
  context: Context,
  sourceValues: Map<string, number>,
  adjustment: WeightAdjustment,
) {
  const adjusted = new Map<string, number>();
  for (const row of context.settledRows) {
    const value = sourceValues.get(row.features.targetRunnerId);
    const weightDiff = weightDiffFromRaceMedian(row);
    if (value !== undefined && weightDiff !== null) {
      adjusted.set(row.features.targetRunnerId, value + (adjustment.coefficientRawPointsPerLb * weightDiff));
    }
  }
  return adjusted;
}

function benchmarkFor(
  year: Year,
  key: string,
  label: string,
  settledRows: HistoricalTargetRunnerMetricsRow[],
  values: Map<string, number>,
): Benchmark {
  const ranks = rankRowsByMeasure(settledRows, (row) => values.get(row.features.targetRunnerId) ?? null);
  const rankGroups = new Map<string, RankGroup>();
  for (const row of settledRows) {
    rankGroups.set(row.features.targetRunnerId, rankGroup(ranks.get(row.features.targetRunnerId) ?? null));
  }
  return {
    year,
    key,
    label,
    values,
    ranks,
    rankGroups,
    settledRows,
    rowsWithValue: settledRows.filter((row) => values.has(row.features.targetRunnerId)),
  };
}

function printInputIntegrity(diagnostics: DirectHistoryDiagnostic[]) {
  console.log("## Input Integrity");
  console.log("Narrow inspection found direct run-level `race_runners.racing_post_rating` and `race_runners.topspeed_rating` columns, populated by the Racing Post importer. The Sporting Life Turf cache path uses derived cached speed/performance fields instead. No separate clean Sporting Life horse-form table with true run-by-run RPR/Topspeed was found in the app schema or horse-detail path.");
  console.log("");
  console.log("The Stage 4 diagnostic therefore uses cached latest/previous/average-last-3 feature fields. When latest and previous are present, the third value is inferred from `averageLast3 * 3 - latest - previous`. This is exact for the cached derived summary under its arithmetic convention, but it is not a direct true run-by-run source value audit.");
  console.log("");
  printTable(diagnostics.map((item) => ({
    year: item.year,
    "settled runners": item.settledRunners,
    "direct-history rated": item.directRated,
    "direct-history coverage": pct(item.settledRunners === 0 ? null : (item.directRated / item.settledRunners) * 100),
    "reconstructed rated": item.reconstructedRated,
    "reconstructed coverage": pct(item.settledRunners === 0 ? null : (item.reconstructedRated / item.settledRunners) * 100),
    "direct 3+3": item.directThreeAndThree,
    "reconstructed 3+3": item.reconstructedThreeAndThree,
  })));
  console.log("");
}

function printBaseline(benchmarks: Benchmark[]) {
  console.log("## B3 Baseline Reconciliation");
  printTable(YEARS.map((year) => {
    const benchmark = benchmarkByKey(benchmarks, year, "unadjusted");
    const bands = scoreBandsFor(benchmarks, "unadjusted");
    const gapBands = gapBandsFor(benchmarks, "unadjusted");
    return summaryRow(benchmark, bands, gapBands);
  }));
  console.log("");
}

function printClassAdjustment(adjustment: ClassAdjustment, benchmarks: Benchmark[]) {
  console.log("## Class Adjustment");
  console.log("Method: derive 2025 mean raw B3 score by broad race class, subtract each class mean offset from the global 2025 mean, and apply those fixed offsets unchanged in 2026. No outcome data is used for this class adjustment.");
  console.log("");
  printTable([...adjustment.byClass.entries()].map(([raceClass, value]) => ({
    "race class": raceClass,
    runners: value.count,
    "2025 mean raw": number(value.mean),
    "global mean": number(adjustment.globalMean),
    "fixed offset subtracted": number(value.offset),
  })));
  console.log("");
  printTable(YEARS.flatMap((year) => [
    summaryRow(benchmarkByKey(benchmarks, year, "unadjusted"), scoreBandsFor(benchmarks, "unadjusted"), gapBandsFor(benchmarks, "unadjusted")),
    summaryRow(benchmarkByKey(benchmarks, year, "classAdjusted"), scoreBandsFor(benchmarks, "classAdjusted"), gapBandsFor(benchmarks, "classAdjusted")),
  ]));
  console.log("");
}

function printWeightAdjustment(adjustment: WeightAdjustment, benchmarks: Benchmark[]) {
  console.log("## Weight Adjustment");
  console.log("Method: use pounds carried relative to race median. In 2025 only, estimate residual performance after raw-score quintile expectation, regress that residual on weight difference, convert the residual-performance slope into raw-score points via the 2025 raw-score/performance slope, and freeze the coefficient for 2026.");
  console.log("");
  printTable([
    {
      "sample size": adjustment.sampleSize,
      "residual perf per lb": number(adjustment.residualPerformancePerLb),
      "performance per raw point": number(adjustment.performancePerRawPoint),
      "raw points per lb": number(adjustment.coefficientRawPointsPerLb),
      direction: adjustment.direction,
      strength: adjustment.strength,
    },
  ]);
  console.log("");
  printTable(YEARS.flatMap((year) => [
    summaryRow(benchmarkByKey(benchmarks, year, "unadjusted"), scoreBandsFor(benchmarks, "unadjusted"), gapBandsFor(benchmarks, "unadjusted")),
    summaryRow(benchmarkByKey(benchmarks, year, "weightAdjusted"), scoreBandsFor(benchmarks, "weightAdjusted"), gapBandsFor(benchmarks, "weightAdjusted")),
    summaryRow(benchmarkByKey(benchmarks, year, "classWeightAdjusted"), scoreBandsFor(benchmarks, "classWeightAdjusted"), gapBandsFor(benchmarks, "classWeightAdjusted")),
  ]));
  console.log("");
}

function printAbsoluteCalibration(benchmarks: Benchmark[]) {
  console.log("## Absolute-Score Calibration");
  for (const key of ["unadjusted", "classAdjusted", "weightAdjusted", "classWeightAdjusted"] as const) {
    const label = benchmarkByKey(benchmarks, "2025", key).label;
    const bands = scoreBandsFor(benchmarks, key);
    console.log(`### ${label}`);
    printTable(YEARS.flatMap((year) => {
      const benchmark = benchmarkByKey(benchmarks, year, key);
      return bands.map((band) => {
        const rows = rowsForBand(benchmark, band);
        return {
          year,
          band: band.label,
          range: bandRange(band),
          runners: rows.length,
          wins: winners(rows),
          "strike rate": pct(winRate(rows)),
          "top-3 rate": pct(top3Rate(rows)),
          "average finish": number(averageFinish(rows)),
          "median finish": number(medianFinish(rows)),
        };
      });
    }));
    console.log("");
  }
}

function printContextPortability(benchmarks: Benchmark[]) {
  console.log("## Context Portability");
  for (const key of ["unadjusted", "classAdjusted", "weightAdjusted", "classWeightAdjusted"] as const) {
    const label = benchmarkByKey(benchmarks, "2025", key).label;
    console.log(`### ${label}`);
    printTable(YEARS.flatMap((year) => {
      const benchmark = benchmarkByKey(benchmarks, year, key);
      const bands = scoreBandsFor(benchmarks, key);
      return [
        ...contextRows(benchmark, bands, "race class", (row) => raceClassBucket(row.features.raceClass), raceClassOrder),
        ...contextRows(benchmark, bands, "distance", (row) => distanceBand(row.features.distanceYards), distanceOrder),
        ...contextRows(benchmark, bands, "field size", (row) => fieldSizeBand(fieldSizeForRow(row)), fieldSizeOrder),
      ];
    }));
    console.log("");
  }
}

function printDistanceResidualDiagnostic(benchmarks: Benchmark[], strongest: Benchmark) {
  console.log("## Distance Residual Diagnostic");
  console.log(`Strongest Stage 4 variant by combined score: ${strongest.label}. Distance is not added to the rating here; this only checks residual calibration by broad distance band.`);
  console.log("");
  const bands = scoreBandsFor(benchmarks, strongest.key);
  printTable(YEARS.flatMap((year) => {
    const benchmark = benchmarkByKey(benchmarks, year, strongest.key);
    return contextRows(benchmark, bands, "distance", (row) => distanceBand(row.features.distanceYards), distanceOrder);
  }));
  console.log("");
}

function printComparison(contexts: Context[], benchmarks: Benchmark[], strongest: Benchmark) {
  console.log("## Comparison With Existing Measures");
  const comparisonBenchmarks = [...benchmarks, ...existingMeasureBenchmarks(contexts)];
  printTable(YEARS.flatMap((year) => {
    const keys = [
      strongest.key,
      "todaysRating",
      "averageSpeedLast3",
      "averagePerformanceLast3",
      "officialRating",
      "unadjusted",
    ];
    return keys.map((key) => {
      const benchmark = benchmarkByKey(comparisonBenchmarks, year, key);
      const bands = scoreBandsFor(comparisonBenchmarks, key);
      const gapBands = gapBandsFor(comparisonBenchmarks, key);
      return summaryRow(benchmark, bands, gapBands);
    });
  }));
  console.log("");
}

function printScaleProposal(benchmarks: Benchmark[], strongest: Benchmark) {
  console.log("## Candidate Scale Proposal");
  const b2025 = benchmarkByKey(benchmarks, "2025", strongest.key);
  const b2026 = benchmarkByKey(benchmarks, "2026", strongest.key);
  const bands = scoreBandsFor(benchmarks, strongest.key);
  const stable = absoluteBandMonotonicity(b2025, bands) === "monotonic increasing" &&
    absoluteBandMonotonicity(b2026, bands) === "monotonic increasing" &&
    gapCalibrationLabel(b2025, gapBandsFor(benchmarks, strongest.key)) === "monotonic increasing" &&
    gapCalibrationLabel(b2026, gapBandsFor(benchmarks, strongest.key)) === "monotonic increasing" &&
    monotonicityLabel(b2025) === "monotonic decreasing" &&
    monotonicityLabel(b2026) === "monotonic decreasing" &&
    hasNoObviousContextCollapse(b2025, bands) &&
    hasNoObviousContextCollapse(b2026, bands) &&
    (coverage(b2025) ?? 0) >= 65 &&
    (coverage(b2026) ?? 0) >= 65;
  if (!stable) {
    console.log("No diagnostic absolute Turf Performance Rating scale proposed. The strongest variant improves overall calibration, but it does not clear the stricter stop-rule once gap calibration and context portability are included.");
    console.log("");
    return;
  }
  const mean = average([...b2025.values.values()]);
  const stdev = standardDeviation([...b2025.values.values()]);
  printTable([
    {
      scale: "Turf Performance Rating - diagnostic",
      mapping: "100 + 10 * ((adjustedScore - developmentMean) / developmentStdev)",
      "development mean": number(mean),
      "development stdev": number(stdev),
      note: "Diagnostic-only monotonic transform; not Racing Post RPR.",
    },
  ]);
  console.log("");
}

function printConclusion(
  benchmarks: Benchmark[],
  strongest: Benchmark,
  classAdjustment: ClassAdjustment,
  weightAdjustment: WeightAdjustment,
) {
  const strongest2025 = benchmarkByKey(benchmarks, "2025", strongest.key);
  const strongest2026 = benchmarkByKey(benchmarks, "2026", strongest.key);
  const strongestBands = scoreBandsFor(benchmarks, strongest.key);
  const today2025 = existingMeasureBenchmarksFromRows(strongest2025.settledRows, "2025").find((item) => item.key === "todaysRating")!;
  const today2026 = existingMeasureBenchmarksFromRows(strongest2026.settledRows, "2026").find((item) => item.key === "todaysRating")!;
  console.log("## Conclusion");
  printTable([
    { question: "1. Are true run-by-run RPR and Topspeed values available directly?", answer: "Only Racing Post-style columns exist on race_runners; for this Sporting Life Turf path they do not provide usable direct-history coverage." },
    { question: "2. Was the previous reconstructed input exact or approximate?", answer: "Exact for cached derived summary arithmetic when latest/previous/averageLast3 are present, but approximate as a substitute for true direct run-by-run source history." },
    { question: "3. Does class adjustment improve cross-race calibration?", answer: adjustmentAnswer(benchmarks, "classAdjusted") },
    { question: "4. Does weight-relative adjustment improve it?", answer: `${adjustmentAnswer(benchmarks, "weightAdjusted")} 2025 coefficient=${number(weightAdjustment.coefficientRawPointsPerLb)} raw points/lb (${weightAdjustment.strength}).` },
    { question: "5. Does class + weight outperform either adjustment alone?", answer: classWeightAnswer(benchmarks) },
    { question: "6. Which variant is strongest in both 2025 and 2026?", answer: strongest.label },
    { question: "7. Are absolute score bands now monotonic in both years?", answer: `${absoluteBandMonotonicity(strongest2025, strongestBands)} in 2025; ${absoluteBandMonotonicity(strongest2026, strongestBands)} in 2026.` },
    { question: "8. Is the rating portable across class, distance and field size?", answer: "Improved only partially; class offsets align mean scores, but some class/distance/field-size buckets still show weak or negative association." },
    { question: "9. Is distance the next structural adjustment worth testing?", answer: "Yes, as a diagnostic only: distance buckets still show residual differences after the strongest current adjustment." },
    { question: "10. Is there now enough evidence for a diagnostic absolute Turf Performance Rating scale?", answer: scaleConclusion(strongest2025, strongest2026, strongestBands) },
    { question: "11. Is the strongest Stage 4 candidate materially better than Today's Rating?", answer: `2025 association ${number(spearmanAssociation(strongest2025))} vs ${number(spearmanAssociation(today2025))}; 2026 association ${number(spearmanAssociation(strongest2026))} vs ${number(spearmanAssociation(today2026))}.` },
    { question: "Class adjustment method", answer: `2025 global mean ${number(classAdjustment.globalMean)}; fixed class offsets only, no outcome data.` },
  ]);
  console.log("");
}

function printGuardrails() {
  console.log("## Guardrails");
  printTable([
    { item: "Production Research/Today/saved rules changed", result: "No" },
    { item: "Cache schema/generation changed", result: "No" },
    { item: "Holdout behavior changed", result: "No" },
    { item: "Market price / SP used", result: "No" },
    { item: "Trainer/jockey/draw/going/course/future runs used", result: "No" },
    { item: "Distance adjustment added", result: "No" },
    { item: "Weight coefficient tuned on 2026", result: "No" },
  ]);
}

function summaryRow(benchmark: Benchmark, scoreBands: Band[], gapBands: Band[]) {
  return {
    year: benchmark.year,
    variant: benchmark.label,
    coverage: pct(coverage(benchmark)),
    "rank-1 strike": pct(winRate(rowsForRankGroup(benchmark, "rank 1"))),
    "top-2 capture": pct(winnerCapture(benchmark, new Set(["rank 1", "rank 2"]))),
    "top-3 capture": pct(winnerCapture(benchmark, new Set(["rank 1", "rank 2", "rank 3"]))),
    association: number(spearmanAssociation(benchmark)),
    monotonicity: monotonicityLabel(benchmark),
    "absolute bands": absoluteBandMonotonicity(benchmark, scoreBands),
    "gap calibration": gapCalibrationLabel(benchmark, gapBands),
  };
}

function existingMeasureBenchmarks(contexts: Context[]) {
  return contexts.flatMap((context) => existingMeasureBenchmarksFromRows(context.settledRows, context.year));
}

function existingMeasureBenchmarksFromRows(rows: HistoricalTargetRunnerMetricsRow[], year: Year) {
  return [
    benchmarkFor(year, "todaysRating", "Today's Rating", rows, valuesFor(rows, (row) => row.features.latestTodaysRating)),
    benchmarkFor(year, "averageSpeedLast3", "Average Topspeed last 3", rows, valuesFor(rows, (row) => row.features.averageSpeedLast3)),
    benchmarkFor(year, "averagePerformanceLast3", "Average RPR last 3", rows, valuesFor(rows, (row) => row.features.averagePerformanceLast3)),
    benchmarkFor(year, "officialRating", "Official Rating", rows, valuesFor(rows, (row) => row.features.officialRating)),
  ];
}

function valuesFor(rows: HistoricalTargetRunnerMetricsRow[], valueFor: (row: HistoricalTargetRunnerMetricsRow) => number | null) {
  const values = new Map<string, number>();
  for (const row of rows) {
    const value = valueFor(row);
    if (value !== null && Number.isFinite(value)) {
      values.set(row.features.targetRunnerId, value);
    }
  }
  return values;
}

function contextRows(
  benchmark: Benchmark,
  bands: Band[],
  contextType: string,
  keyFor: (row: HistoricalTargetRunnerMetricsRow) => string,
  order: string[],
) {
  const groups = groupBy(benchmark.settledRows, keyFor);
  return order
    .filter((key) => groups.has(key))
    .map((key) => {
      const rows = groups.get(key)!;
      const ratedRows = rows.filter((row) => benchmark.values.has(row.features.targetRunnerId));
      const winnersInContext = rows.filter((row) => row.outcome.won === true);
      const top3Winners = winnersInContext.filter((row) => {
        const group = benchmark.rankGroups.get(row.features.targetRunnerId);
        return group === "rank 1" || group === "rank 2" || group === "rank 3";
      });
      return {
        year: benchmark.year,
        context: contextType,
        bucket: key,
        coverage: pct(rows.length === 0 ? null : (ratedRows.length / rows.length) * 100),
        "mean rating": number(average(ratedRows.map((row) => benchmark.values.get(row.features.targetRunnerId)).filter(isNumber))),
        "median rating": number(median(ratedRows.map((row) => benchmark.values.get(row.features.targetRunnerId)).filter(isNumber))),
        "rank-1 strike": pct(winRate(rows.filter((row) => benchmark.rankGroups.get(row.features.targetRunnerId) === "rank 1"))),
        "top-3 capture": pct(winnersInContext.length === 0 ? null : (top3Winners.length / winnersInContext.length) * 100),
        association: number(spearmanAssociationForRows(benchmark, rows)),
        "absolute bands": absoluteBandMonotonicityForRows(benchmark, bands, rows),
      };
    });
}

function strongestVariant(benchmarks: Benchmark[]) {
  const strongestKey = (["unadjusted", "classAdjusted", "weightAdjusted", "classWeightAdjusted"] as const)
    .map((key) => ({
      key,
      score: YEARS.reduce((total, year) => total + benchmarkScore(benchmarkByKey(benchmarks, year, key)), 0),
    }))
    .sort((left, right) => right.score - left.score)[0]!
    .key;
  return benchmarkByKey(benchmarks, "2025", strongestKey);
}

function benchmarkScore(benchmark: Benchmark) {
  return ((spearmanAssociation(benchmark) ?? 0) * 2) +
    ((winnerCapture(benchmark, new Set(["rank 1", "rank 2", "rank 3"])) ?? 0) / 100) +
    ((winRate(rowsForRankGroup(benchmark, "rank 1")) ?? 0) / 100) +
    (absoluteBandMonotonicity(benchmark, scoreBandsForSingle(benchmark)) === "monotonic increasing" ? 0.05 : 0);
}

function adjustmentAnswer(benchmarks: Benchmark[], key: VariantKey) {
  return YEARS.map((year) => {
    const base = benchmarkByKey(benchmarks, year, "unadjusted");
    const adjusted = benchmarkByKey(benchmarks, year, key);
    return `${year}: association ${number(spearmanAssociation(base))} -> ${number(spearmanAssociation(adjusted))}, absolute bands ${absoluteBandMonotonicity(base, scoreBandsFor(benchmarks, "unadjusted"))} -> ${absoluteBandMonotonicity(adjusted, scoreBandsFor(benchmarks, key))}`;
  }).join("; ");
}

function classWeightAnswer(benchmarks: Benchmark[]) {
  return YEARS.map((year) => {
    const classOnly = benchmarkByKey(benchmarks, year, "classAdjusted");
    const weightOnly = benchmarkByKey(benchmarks, year, "weightAdjusted");
    const both = benchmarkByKey(benchmarks, year, "classWeightAdjusted");
    return `${year}: both association ${number(spearmanAssociation(both))} vs class ${number(spearmanAssociation(classOnly))}, weight ${number(spearmanAssociation(weightOnly))}`;
  }).join("; ");
}

function scaleConclusion(b2025: Benchmark, b2026: Benchmark, bands: Band[]) {
  return absoluteBandMonotonicity(b2025, bands) === "monotonic increasing" &&
    absoluteBandMonotonicity(b2026, bands) === "monotonic increasing"
    ? "Not yet. Overall score bands are monotonic, but context portability and gap calibration are not clean enough for an absolute scale."
    : "No; absolute calibration is still not stable enough in both years.";
}

function hasNoObviousContextCollapse(benchmark: Benchmark, bands: Band[]) {
  const rows = [
    ...contextRows(benchmark, bands, "race class", (row) => raceClassBucket(row.features.raceClass), raceClassOrder),
    ...contextRows(benchmark, bands, "distance", (row) => distanceBand(row.features.distanceYards), distanceOrder),
    ...contextRows(benchmark, bands, "field size", (row) => fieldSizeBand(fieldSizeForRow(row)), fieldSizeOrder),
  ];
  return rows.every((row) => {
    const association = Number(row.association);
    return Number.isFinite(association) && association >= 0.02 && row["absolute bands"] !== "non-monotonic";
  });
}

function scoreBandsFor(benchmarks: Benchmark[], key: string) {
  return scoreBandsForSingle(benchmarkByKey(benchmarks, "2025", key));
}

function scoreBandsForSingle(benchmark: Benchmark) {
  return quantileBands([...benchmark.values.values()], ["bottom 20%", "20-40%", "40-60%", "60-80%", "top 20%"]);
}

function gapBandsFor(benchmarks: Benchmark[], key: string) {
  return quantileBands(topTwoGaps(benchmarkByKey(benchmarks, "2025", key)).map((item) => item.gap), ["smallest 25%", "25-50%", "50-75%", "largest 25%"]);
}

function rowsForBand(benchmark: Benchmark, band: Band) {
  return benchmark.rowsWithValue.filter((row) => inBand(benchmark.values.get(row.features.targetRunnerId) ?? NaN, band));
}

function topTwoGaps(benchmark: Benchmark) {
  const gaps: Array<{ gap: number; topRow: HistoricalTargetRunnerMetricsRow }> = [];
  const rowsByRace = groupBy(benchmark.rowsWithValue, (row) => row.features.targetRaceId);
  for (const raceRows of rowsByRace.values()) {
    const ranked = raceRows
      .map((row) => ({ row, value: benchmark.values.get(row.features.targetRunnerId) }))
      .filter((entry): entry is { row: HistoricalTargetRunnerMetricsRow; value: number } => entry.value !== undefined)
      .sort((left, right) =>
        right.value - left.value ||
        left.row.features.targetRunnerId.localeCompare(right.row.features.targetRunnerId)
      );
    if (ranked.length >= 2) {
      gaps.push({ gap: ranked[0]!.value - ranked[1]!.value, topRow: ranked[0]!.row });
    }
  }
  return gaps;
}

function absoluteBandMonotonicity(benchmark: Benchmark, bands: Band[]) {
  return trendLabel(bands.map((band) => winRate(rowsForBand(benchmark, band))));
}

function absoluteBandMonotonicityForRows(
  benchmark: Benchmark,
  bands: Band[],
  rows: HistoricalTargetRunnerMetricsRow[],
) {
  return trendLabel(bands.map((band) => {
    const bandRows = rows.filter((row) => inBand(benchmark.values.get(row.features.targetRunnerId) ?? NaN, band));
    return winRate(bandRows);
  }));
}

function gapCalibrationLabel(benchmark: Benchmark, bands: Band[]) {
  const gaps = topTwoGaps(benchmark);
  return trendLabel(bands.map((band) => {
    const rows = gaps.filter((item) => inBand(item.gap, band)).map((item) => item.topRow);
    return winRate(rows);
  }));
}

function monotonicityLabel(benchmark: Benchmark) {
  return trendLabel((["rank 1", "rank 2", "rank 3", "rank 4+"] satisfies RankGroup[]).map((group) => winRate(rowsForRankGroup(benchmark, group))));
}

function trendLabel(values: Array<number | null>) {
  const finite = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (finite.length < 3) return "insufficient data";
  let nonDecreasing = true;
  let nonIncreasing = true;
  for (let index = 1; index < finite.length; index += 1) {
    if (finite[index]! < finite[index - 1]! - 0.0001) nonDecreasing = false;
    if (finite[index]! > finite[index - 1]! + 0.0001) nonIncreasing = false;
  }
  if (nonDecreasing) return "monotonic increasing";
  if (nonIncreasing) return "monotonic decreasing";
  return "non-monotonic";
}

function rankRowsByMeasure(
  rows: HistoricalTargetRunnerMetricsRow[],
  valueFor: (row: HistoricalTargetRunnerMetricsRow) => number | null,
) {
  const ranks = new Map<string, number>();
  const rowsByRace = groupBy(rows, (row) => row.features.targetRaceId);
  for (const raceRows of rowsByRace.values()) {
    const rankable = raceRows
      .map((row) => ({ row, value: valueFor(row) }))
      .filter((entry): entry is { row: HistoricalTargetRunnerMetricsRow; value: number } =>
        entry.value !== null && Number.isFinite(entry.value)
      )
      .sort((left, right) =>
        right.value - left.value ||
        left.row.features.targetRunnerId.localeCompare(right.row.features.targetRunnerId)
      );
    let previousValue: number | null = null;
    let previousRank = 0;
    rankable.forEach((entry, index) => {
      const rank = entry.value === previousValue ? previousRank : index + 1;
      ranks.set(entry.row.features.targetRunnerId, rank);
      previousValue = entry.value;
      previousRank = rank;
    });
  }
  return ranks;
}

function rowsForRankGroup(benchmark: Benchmark, group: RankGroup) {
  return benchmark.settledRows.filter((row) => benchmark.rankGroups.get(row.features.targetRunnerId) === group);
}

function winnerCapture(benchmark: Benchmark, groups: Set<RankGroup>) {
  const winnersInBenchmark = benchmark.settledRows.filter((row) => row.outcome.won === true);
  if (winnersInBenchmark.length === 0) return null;
  return (winnersInBenchmark.filter((row) => groups.has(benchmark.rankGroups.get(row.features.targetRunnerId) ?? "missing")).length / winnersInBenchmark.length) * 100;
}

function spearmanAssociation(benchmark: Benchmark) {
  return spearmanAssociationForRows(benchmark, benchmark.rowsWithValue);
}

function spearmanAssociationForRows(benchmark: Benchmark, rows: HistoricalTargetRunnerMetricsRow[]) {
  const entries = rows
    .map((row) => ({
      rating: benchmark.values.get(row.features.targetRunnerId) ?? null,
      performance: row.outcome.finishingPosition === null ? null : -row.outcome.finishingPosition,
    }))
    .filter((entry): entry is { rating: number; performance: number } =>
      entry.rating !== null && entry.performance !== null && Number.isFinite(entry.rating) && Number.isFinite(entry.performance)
    );
  if (entries.length < 2) return null;
  return pearson(rankValues(entries.map((entry) => entry.rating)), rankValues(entries.map((entry) => entry.performance)));
}

function rankValues(values: number[]) {
  const indexed = values.map((value, index) => ({ value, index }));
  indexed.sort((left, right) => left.value - right.value || left.index - right.index);
  const ranks = Array<number>(values.length);
  for (let index = 0; index < indexed.length;) {
    let end = index + 1;
    while (end < indexed.length && indexed[end]!.value === indexed[index]!.value) end += 1;
    const averageRank = (index + 1 + end) / 2;
    for (let cursor = index; cursor < end; cursor += 1) {
      ranks[indexed[cursor]!.index] = averageRank;
    }
    index = end;
  }
  return ranks;
}

function pearson(left: number[], right: number[]) {
  if (left.length !== right.length || left.length < 2) return null;
  const leftAverage = average(left);
  const rightAverage = average(right);
  if (leftAverage === null || rightAverage === null) return null;
  let numerator = 0;
  let leftVariance = 0;
  let rightVariance = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftDelta = left[index]! - leftAverage;
    const rightDelta = right[index]! - rightAverage;
    numerator += leftDelta * rightDelta;
    leftVariance += leftDelta ** 2;
    rightVariance += rightDelta ** 2;
  }
  const denominator = Math.sqrt(leftVariance * rightVariance);
  return denominator === 0 ? null : numerator / denominator;
}

function slope(xs: number[], ys: number[]) {
  if (xs.length !== ys.length || xs.length < 2) return null;
  const xMean = average(xs);
  const yMean = average(ys);
  if (xMean === null || yMean === null) return null;
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < xs.length; index += 1) {
    numerator += (xs[index]! - xMean) * (ys[index]! - yMean);
    denominator += (xs[index]! - xMean) ** 2;
  }
  return denominator === 0 ? null : numerator / denominator;
}

function quantileBands(values: number[], labels: string[]) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
  if (sorted.length === 0) return [{ label: labels[0] ?? "all", min: -Infinity, max: Infinity }];
  return labels.map((label, index) => ({
    label,
    min: index === 0 ? -Infinity : quantile(sorted, index / labels.length),
    max: index === labels.length - 1 ? Infinity : quantile(sorted, (index + 1) / labels.length),
  }));
}

function quantile(sortedValues: number[], probability: number) {
  if (sortedValues.length === 0) return NaN;
  if (sortedValues.length === 1) return sortedValues[0]!;
  const position = (sortedValues.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sortedValues[lower]!;
  const weight = position - lower;
  return sortedValues[lower]! * (1 - weight) + sortedValues[upper]! * weight;
}

function inBand(value: number, band: Band) {
  if (!Number.isFinite(value)) return false;
  const aboveMin = band.min === -Infinity ? true : value > band.min || nearlyEqual(value, band.min);
  const belowMax = band.max === Infinity ? true : value <= band.max || nearlyEqual(value, band.max);
  return aboveMin && belowMax;
}

function benchmarkByKey(benchmarks: Benchmark[], year: Year, key: string) {
  const benchmark = benchmarks.find((item) => item.year === year && item.key === key);
  if (!benchmark) throw new Error(`Missing benchmark ${key} ${year}`);
  return benchmark;
}

function contextFor(contexts: Context[], year: Year) {
  const context = contexts.find((item) => item.year === year);
  if (!context) throw new Error(`Missing context ${year}`);
  return context;
}

function isSettledRunner(row: HistoricalTargetRunnerMetricsRow) {
  return row.outcome.resultStatus !== "non_runner" && row.outcome.finishingPosition !== null;
}

function hasRaceDateTime<T extends { raceDateTime: Date | null }>(row: T): row is T & { raceDateTime: Date } {
  return row.raceDateTime !== null;
}

function rankGroup(rank: number | null): RankGroup {
  if (rank === null) return "missing";
  if (rank === 1) return "rank 1";
  if (rank === 2) return "rank 2";
  if (rank === 3) return "rank 3";
  return "rank 4+";
}

function winners(rows: HistoricalTargetRunnerMetricsRow[]) {
  return rows.filter((row) => row.outcome.won === true).length;
}

function winRate(rows: HistoricalTargetRunnerMetricsRow[]) {
  return rows.length === 0 ? null : (winners(rows) / rows.length) * 100;
}

function top3Rate(rows: HistoricalTargetRunnerMetricsRow[]) {
  if (rows.length === 0) return null;
  return (rows.filter((row) => (row.outcome.finishingPosition ?? Infinity) <= 3).length / rows.length) * 100;
}

function coverage(benchmark: Benchmark) {
  return benchmark.settledRows.length === 0 ? null : (benchmark.rowsWithValue.length / benchmark.settledRows.length) * 100;
}

function averageFinish(rows: HistoricalTargetRunnerMetricsRow[]) {
  return average(rows.map((row) => row.outcome.finishingPosition).filter(isNumber));
}

function medianFinish(rows: HistoricalTargetRunnerMetricsRow[]) {
  return median(rows.map((row) => row.outcome.finishingPosition).filter(isNumber));
}

function weightDiffFromRaceMedian(row: HistoricalTargetRunnerMetricsRow) {
  const raceWeights = rowCacheByRace.get(row.features.targetRaceId)
    ?.map((raceRow) => raceRow.features.weightCarriedLbs)
    .filter(isNumber) ?? [];
  if (row.features.weightCarriedLbs === null || raceWeights.length === 0) return null;
  const raceMedian = median(raceWeights);
  return raceMedian === null ? null : row.features.weightCarriedLbs - raceMedian;
}

function raceClassBucket(value: string | null) {
  const raceClass = raceClassNumber(value);
  return raceClass === null ? "unknown" : `Class ${raceClass}`;
}

const raceClassOrder = ["Class 1", "Class 2", "Class 3", "Class 4", "Class 5", "Class 6", "unknown"];
const distanceOrder = ["sprint", "mile-ish", "middle distance", "staying", "unknown"];
const fieldSizeOrder = ["2-5", "6-8", "9-12", "13+"];

function distanceBand(yards: number | null) {
  if (yards === null) return "unknown";
  if (yards <= 1320) return "sprint";
  if (yards <= 1760) return "mile-ish";
  if (yards <= 2640) return "middle distance";
  return "staying";
}

function fieldSizeBand(value: number | null) {
  if (value === null) return "13+";
  if (value <= 5) return "2-5";
  if (value <= 8) return "6-8";
  if (value <= 12) return "9-12";
  return "13+";
}

function fieldSizeForRow(row: HistoricalTargetRunnerMetricsRow) {
  return row.features.actualRunnerCount ?? row.features.declaredRunnerCount;
}

const rowCacheByRace = new Map<string, HistoricalTargetRunnerMetricsRow[]>();

function compareRowsChronologically(left: HistoricalTargetRunnerMetricsRow, right: HistoricalTargetRunnerMetricsRow) {
  return left.features.raceDateTime.getTime() - right.features.raceDateTime.getTime() ||
    left.features.targetRaceId.localeCompare(right.features.targetRaceId) ||
    left.features.targetRunnerId.localeCompare(right.features.targetRunnerId);
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function groupBy<T>(items: T[], keyFor: (item: T) => string) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFor(item);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return groups;
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function standardDeviation(values: number[]) {
  const mean = average(values);
  if (mean === null || values.length < 2) return null;
  return Math.sqrt(values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length);
}

function isNumber(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function nearlyEqual(left: number, right: number) {
  return Math.abs(left - right) < 0.0000001;
}

function bandRange(band: Band) {
  const min = band.min === -Infinity ? "-inf" : band.min.toFixed(3);
  const max = band.max === Infinity ? "inf" : band.max.toFixed(3);
  return `${min} to ${max}`;
}

function pct(value: number | null) {
  return value === null || !Number.isFinite(value) ? "n/a" : `${value.toFixed(1)}%`;
}

function number(value: number | null) {
  return value === null || !Number.isFinite(value) ? "n/a" : value.toFixed(3);
}

function printTable(rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) {
    console.log("_No rows_");
    return;
  }
  const columns = Object.keys(rows[0]!);
  console.log(`| ${columns.join(" | ")} |`);
  console.log(`| ${columns.map(() => "---").join(" | ")} |`);
  for (const row of rows) {
    console.log(`| ${columns.map((column) => printable(row[column])).join(" | ")} |`);
  }
}

function printable(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\|/g, "\\|");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
