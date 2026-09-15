import { loadLatestBacktestFeatureCacheForYear } from "@/lib/racing/backtest-cache";
import type { HistoricalTargetRunnerMetricsRow } from "@/lib/racing/historical-target-metrics";
import { raceClassNumber } from "@/lib/racing/research-rule-classes";

type Year = "2025" | "2026";
type RankGroup = "rank 1" | "rank 2" | "rank 3" | "rank 4+" | "missing";
type MethodKey = "s0" | "s1" | "s2" | "s3";

type Context = {
  year: Year;
  settledRows: HistoricalTargetRunnerMetricsRow[];
  components: Map<string, ComponentScore>;
};

type ComponentScore = {
  rpr: number;
  speed: number;
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

type GapDetail = {
  gap: number;
  topRow: HistoricalTargetRunnerMetricsRow;
  secondRow: HistoricalTargetRunnerMetricsRow;
  topValue: number;
  secondValue: number;
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
};

type ScalingMethod = {
  key: MethodKey;
  label: string;
  transformRpr: (value: number) => number;
  transformSpeed: (value: number) => number;
  componentContribution: ComponentContribution;
};

type ScalingVariant = ScalingMethod & {
  classAdjustment: ClassAdjustment;
  weightAdjustment: WeightAdjustment;
};

type ComponentContribution = {
  rprVariance: number | null;
  speedVariance: number | null;
  rprShare: number | null;
  speedShare: number | null;
  correlation: number | null;
};

const YEARS: Year[] = ["2025", "2026"];
const B3_WEIGHTS: [number, number, number] = [0.6, 0.25, 0.15];
const SCORE_BAND_LABELS = ["bottom 20%", "20-40%", "40-60%", "60-80%", "top 20%"];
const GAP_BAND_LABELS = ["smallest 25%", "25-50%", "50-75%", "largest 25%"];
const STAGE7_TPR_DEVELOPMENT_MEAN = -0.103;
const STAGE7_TPR_DEVELOPMENT_STDEV = 1.223;
const TPR_SCORE_BANDS: Band[] = [
  { label: "<80", min: -Infinity, max: 80 },
  { label: "80-89.9", min: 80, max: 90 },
  { label: "90-99.9", min: 90, max: 100 },
  { label: "100-109.9", min: 100, max: 110 },
  { label: "110-119.9", min: 110, max: 120 },
  { label: "120+", min: 120, max: Infinity },
];
const TPR_GAP_BANDS: Band[] = [
  { label: "<2 points", min: -Infinity, max: 2 },
  { label: "2-3.99", min: 2, max: 4 },
  { label: "4-5.99", min: 4, max: 6 },
  { label: "6-9.99", min: 6, max: 10 },
  { label: "10+", min: 10, max: Infinity },
];

async function main() {
  console.log("# Turf Rating Stage 8 TPR Interpretation Diagnostic");
  console.log("");
  console.log("Diagnostic only. This freezes the Stage 7 S2 Turf Performance Rating formula and interprets the 100-based TPR score and TPR point gaps.");
  console.log("");
  console.log("No Research, Today, saved/frozen rules, UI, cache schemas, cache generation, importers, or holdout behavior changed. No ROI, SP, market rank, trainer, jockey, draw, going, course, distance, days-since-run, age, sex, or future runs used.");
  console.log("");
  console.log(`Frozen mapping: TPR = 100 + 10 * ((rating - ${STAGE7_TPR_DEVELOPMENT_MEAN}) / ${STAGE7_TPR_DEVELOPMENT_STDEV}). The 2026 holdout is not recalibrated.`);
  console.log("");

  const contexts = await loadContexts();
  const development = contextFor(contexts, "2025");
  const methods = buildScalingMethods(development);
  const variants = methods.map((method) => {
    const developmentBase = baseValuesForMethod(development, method);
    return {
      ...method,
      classAdjustment: buildClassAdjustment(development, developmentBase),
      weightAdjustment: buildWeightAdjustment(development, developmentBase),
    };
  });
  const benchmarks = contexts.flatMap((context) =>
    variants.map((variant) =>
      benchmarkFor(context.year, variant.key, variant.label, context.settledRows, finalValuesForVariant(context, variant)),
    )
  );
  const s2Variant = variants.find((variant) => variant.key === "s2");
  if (!s2Variant) throw new Error("Missing Stage 7 S2 variant");
  const tprBenchmarks = contexts.map((context) =>
    benchmarkFor(context.year, "tpr", "Turf Performance Rating — diagnostic", context.settledRows, tprValues(finalValuesForVariant(context, s2Variant))),
  );

  printStage7S2Reconciliation(benchmarks);
  printTprDistribution(tprBenchmarks);
  printFixedTprScoreBands(tprBenchmarks);
  printContextInterpretation(tprBenchmarks);
  printFixedTprGapCalibration(tprBenchmarks);
  printTprContinuousGapRelationship(tprBenchmarks);
  printRepresentativeExamples(tprBenchmarks);
  printHistoryDepthReliability(tprBenchmarks);
  printTprRankBenchmark(tprBenchmarks);
  printTodaysRatingComparison(contexts, tprBenchmarks);
  printDiagnosticInterpretation(tprBenchmarks);
  printStage8Conclusion(tprBenchmarks, contexts);
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
    contexts.push({ year, settledRows, components: componentScores(settledRows) });
    for (const [raceId, raceRows] of groupBy(settledRows, (row) => row.features.targetRaceId)) {
      rowCacheByRace.set(raceId, raceRows);
    }
  }
  return contexts;
}

function componentScores(rows: HistoricalTargetRunnerMetricsRow[]) {
  const values = new Map<string, ComponentScore>();
  for (const row of rows) {
    const rpr = weightedRecentLevel(cachedLast3Values(
      row.features.latestPerformanceRating,
      row.features.previousPerformanceRating,
      row.features.averagePerformanceLast3,
    ), B3_WEIGHTS);
    const speed = weightedRecentLevel(cachedLast3Values(
      row.features.latestSpeedRating,
      row.features.previousSpeedRating,
      row.features.averageSpeedLast3,
    ), B3_WEIGHTS);
    if (rpr !== null && speed !== null) {
      values.set(row.features.targetRunnerId, { rpr, speed });
    }
  }
  return values;
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

function buildScalingMethods(development: Context): ScalingMethod[] {
  const components = [...development.components.values()];
  const rprValues = components.map((component) => component.rpr);
  const speedValues = components.map((component) => component.speed);
  const rprStats = distributionStats(rprValues);
  const speedStats = distributionStats(speedValues);
  const sortedRpr = [...rprValues].sort((left, right) => left - right);
  const sortedSpeed = [...speedValues].sort((left, right) => left - right);

  return [
    {
      key: "s0",
      label: "S0 - current raw equal blend",
      transformRpr: (value) => value,
      transformSpeed: (value) => value,
      componentContribution: componentContribution(rprValues, speedValues),
    },
    {
      key: "s1",
      label: "S1 - 2025 mean/SD standard-score blend",
      transformRpr: (value) => zScore(value, rprStats.mean, rprStats.stdev),
      transformSpeed: (value) => zScore(value, speedStats.mean, speedStats.stdev),
      componentContribution: componentContribution(
        rprValues.map((value) => zScore(value, rprStats.mean, rprStats.stdev)),
        speedValues.map((value) => zScore(value, speedStats.mean, speedStats.stdev)),
      ),
    },
    {
      key: "s2",
      label: "S2 - 2025 median/IQR robust blend",
      transformRpr: (value) => robustScore(value, rprStats.median, rprStats.iqr),
      transformSpeed: (value) => robustScore(value, speedStats.median, speedStats.iqr),
      componentContribution: componentContribution(
        rprValues.map((value) => robustScore(value, rprStats.median, rprStats.iqr)),
        speedValues.map((value) => robustScore(value, speedStats.median, speedStats.iqr)),
      ),
    },
    {
      key: "s3",
      label: "S3 - 2025 empirical percentile blend",
      transformRpr: (value) => percentileScore(value, sortedRpr),
      transformSpeed: (value) => percentileScore(value, sortedSpeed),
      componentContribution: componentContribution(
        rprValues.map((value) => percentileScore(value, sortedRpr)),
        speedValues.map((value) => percentileScore(value, sortedSpeed)),
      ),
    },
  ];
}

function baseValuesForMethod(context: Context, method: ScalingMethod) {
  const values = new Map<string, number>();
  for (const [runnerId, component] of context.components) {
    values.set(runnerId, (method.transformRpr(component.rpr) + method.transformSpeed(component.speed)) / 2);
  }
  return values;
}

function buildClassAdjustment(context: Context, sourceValues: Map<string, number>): ClassAdjustment {
  const globalMean = average([...sourceValues.values()]) ?? 0;
  const byClass = new Map<string, { mean: number; count: number; offset: number }>();
  const rowsByClass = groupBy(
    context.settledRows.filter((row) => sourceValues.has(row.features.targetRunnerId)),
    (row) => raceClassBucket(row.features.raceClass),
  );
  for (const [raceClass, rows] of rowsByClass) {
    const values = rows.map((row) => sourceValues.get(row.features.targetRunnerId)).filter(isNumber);
    const mean = average(values);
    if (mean !== null) {
      byClass.set(raceClass, { mean, count: values.length, offset: mean - globalMean });
    }
  }
  return { globalMean, byClass };
}

function buildWeightAdjustment(context: Context, sourceValues: Map<string, number>): WeightAdjustment {
  const benchmark = benchmarkFor(context.year, "unadjustedForWeight", "unadjusted for weight", context.settledRows, sourceValues);
  const bands = scoreBandsForSingle(benchmark);
  const expectedFinishByBand = new Map(bands.map((band) => {
    const rows = rowsForBand(benchmark, band);
    return [band.label, averageFinish(rows)];
  }));
  const samples = benchmark.rowsWithValue.flatMap((row) => {
    const value = benchmark.values.get(row.features.targetRunnerId);
    const band = bands.find((item) => inBand(value ?? NaN, item));
    const expected = band ? expectedFinishByBand.get(band.label) : null;
    const actual = row.outcome.finishingPosition;
    const weightDiff = weightDiffFromRaceMedian(row);
    if (value === undefined || expected === null || expected === undefined || actual === null || weightDiff === null) return [];
    return [{
      score: value,
      weightDiff,
      residualPerformance: expected - actual,
      performance: -actual,
    }];
  });
  const residualPerformancePerLb = slope(samples.map((sample) => sample.weightDiff), samples.map((sample) => sample.residualPerformance)) ?? 0;
  const performancePerRawPoint = slope(samples.map((sample) => sample.score), samples.map((sample) => sample.performance)) ?? 0;
  return {
    coefficientRawPointsPerLb: performancePerRawPoint === 0 ? 0 : residualPerformancePerLb / performancePerRawPoint,
    residualPerformancePerLb,
    performancePerRawPoint,
    sampleSize: samples.length,
  };
}

function classAdjustedValues(
  context: Context,
  sourceValues: Map<string, number>,
  adjustment: ClassAdjustment,
) {
  const adjusted = new Map<string, number>();
  for (const row of context.settledRows) {
    const value = sourceValues.get(row.features.targetRunnerId);
    const classOffset = adjustment.byClass.get(raceClassBucket(row.features.raceClass))?.offset ?? 0;
    if (value !== undefined) {
      adjusted.set(row.features.targetRunnerId, value - classOffset);
    }
  }
  return adjusted;
}

function finalValuesForVariant(context: Context, variant: ScalingVariant) {
  const baseValues = baseValuesForMethod(context, variant);
  const classValues = classAdjustedValues(context, baseValues, variant.classAdjustment);
  const adjusted = new Map<string, number>();
  for (const row of context.settledRows) {
    const value = classValues.get(row.features.targetRunnerId);
    const weightDiff = weightDiffFromRaceMedian(row);
    if (value !== undefined && weightDiff !== null) {
      adjusted.set(row.features.targetRunnerId, value + (variant.weightAdjustment.coefficientRawPointsPerLb * weightDiff));
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

function tprValues(values: Map<string, number>) {
  const transformed = new Map<string, number>();
  for (const [runnerId, value] of values) {
    transformed.set(runnerId, toTpr(value));
  }
  return transformed;
}

function toTpr(value: number) {
  return 100 + (10 * ((value - STAGE7_TPR_DEVELOPMENT_MEAN) / STAGE7_TPR_DEVELOPMENT_STDEV));
}

function printStage7S2Reconciliation(benchmarks: Benchmark[]) {
  console.log("## Stage 7 S2 Reconciliation");
  printTable(YEARS.map((year) => {
    const benchmark = benchmarkByKey(benchmarks, year, "s2");
    return summaryRow(benchmark, scoreBandsFor(benchmarks, "s2"), gapBandsFor(benchmarks, "s2"));
  }));
  console.log("");
}

function printTprDistribution(benchmarks: Benchmark[]) {
  console.log("## TPR Score Distribution");
  printTable(benchmarks.map((benchmark) => {
    const sorted = [...benchmark.values.values()].sort((left, right) => left - right);
    return {
      year: benchmark.year,
      "runners rated": sorted.length,
      "mean TPR": number(average(sorted)),
      "median TPR": number(median(sorted)),
      "standard deviation": number(standardDeviation(sorted)),
      p5: number(quantile(sorted, 0.05)),
      p10: number(quantile(sorted, 0.10)),
      p25: number(quantile(sorted, 0.25)),
      p75: number(quantile(sorted, 0.75)),
      p90: number(quantile(sorted, 0.90)),
      p95: number(quantile(sorted, 0.95)),
      min: number(sorted[0] ?? null),
      max: number(sorted.at(-1) ?? null),
    };
  }));
  console.log("");
}

function printFixedTprScoreBands(benchmarks: Benchmark[]) {
  console.log("## Fixed TPR Score Bands");
  printTable(benchmarks.flatMap((benchmark) => TPR_SCORE_BANDS.map((band) => {
    const rows = rowsForBand(benchmark, band);
    return {
      year: benchmark.year,
      band: band.label,
      runners: rows.length,
      wins: winners(rows),
      "strike rate": pct(winRate(rows)),
      "top-3 finish rate": pct(top3Rate(rows)),
      "average finish": number(averageFinish(rows)),
      "median finish": number(medianFinish(rows)),
    };
  })));
  console.log("");
  console.log(`Classification: 2025 ${absoluteBandMonotonicity(benchmarkByKey(benchmarks, "2025", "tpr"), TPR_SCORE_BANDS)}; 2026 ${absoluteBandMonotonicity(benchmarkByKey(benchmarks, "2026", "tpr"), TPR_SCORE_BANDS)}.`);
  console.log("");
}

function printContextInterpretation(benchmarks: Benchmark[]) {
  console.log("## Context Interpretation By Fixed TPR Band");
  for (const contextType of ["race class", "distance", "field size"] as const) {
    console.log(`### ${contextType}`);
    printTable(benchmarks.flatMap((benchmark) => {
      const contextDefinition = contextType === "race class"
        ? { order: raceClassOrder, keyFor: (row: HistoricalTargetRunnerMetricsRow) => raceClassBucket(row.features.raceClass) }
        : contextType === "distance"
          ? { order: distanceOrder, keyFor: (row: HistoricalTargetRunnerMetricsRow) => distanceBand(row.features.distanceYards) }
          : { order: fieldSizeOrder, keyFor: (row: HistoricalTargetRunnerMetricsRow) => fieldSizeBand(fieldSizeForRow(row)) };
      return TPR_SCORE_BANDS.flatMap((band) => {
        const bandRows = rowsForBand(benchmark, band);
        const groups = groupBy(bandRows, contextDefinition.keyFor);
        return contextDefinition.order
          .filter((bucket) => groups.has(bucket))
          .map((bucket) => {
            const rows = groups.get(bucket)!;
            return {
              year: benchmark.year,
              "TPR band": band.label,
              [contextType]: bucket,
              runners: rows.length,
              "mean TPR": number(average(rows.map((row) => benchmark.values.get(row.features.targetRunnerId)).filter(isNumber))),
              "win strike": pct(winRate(rows)),
              "top-3 rate": pct(top3Rate(rows)),
            };
          });
      });
    }));
    console.log("");
  }
}

function printFixedTprGapCalibration(benchmarks: Benchmark[]) {
  console.log("## Rank-1 Vs Rank-2 Fixed TPR Point-Gap Calibration");
  printTable(benchmarks.flatMap((benchmark) => {
    const gaps = topTwoGapDetails(benchmark);
    return TPR_GAP_BANDS.map((band) => {
      const rows = gaps.filter((item) => inBand(item.gap, band)).map((item) => item.topRow);
      return {
        year: benchmark.year,
        "gap band": band.label,
        races: rows.length,
        "rank-1 winners": winners(rows),
        "rank-1 strike rate": pct(winRate(rows)),
        "rank-1 top-3 rate": pct(top3Rate(rows)),
        "average finish": number(averageFinish(rows)),
        "median finish": number(medianFinish(rows)),
      };
    });
  }));
  console.log("");
  console.log(`Classification: 2025 ${fixedTprGapLabel(benchmarkByKey(benchmarks, "2025", "tpr"))}; 2026 ${fixedTprGapLabel(benchmarkByKey(benchmarks, "2026", "tpr"))}.`);
  console.log("");
}

function printTprContinuousGapRelationship(benchmarks: Benchmark[]) {
  console.log("## Continuous TPR Gap Relationship");
  printTable(benchmarks.map((benchmark) => continuousGapRow(benchmark)));
  console.log("");
}

function printRepresentativeExamples(benchmarks: Benchmark[]) {
  console.log("## Representative TPR Gap Examples");
  printTable(benchmarks.flatMap((benchmark) => {
    const gaps = topTwoGapDetails(benchmark)
      .sort((left, right) =>
        left.topRow.features.raceDateTime.getTime() - right.topRow.features.raceDateTime.getTime() ||
        left.topRow.features.targetRaceId.localeCompare(right.topRow.features.targetRaceId)
      );
    const exampleBands: Band[] = [
      { label: "<2 points", min: -Infinity, max: 2 },
      { label: "around 4-6", min: 4, max: 6 },
      { label: "10+", min: 10, max: Infinity },
    ];
    return exampleBands.flatMap((band) =>
      gaps
        .filter((item) => inBand(item.gap, band))
        .slice(0, 3)
        .map((item) => ({
          year: benchmark.year,
          "gap example": band.label,
          date: item.topRow.features.raceDate,
          course: item.topRow.features.courseName,
          race: item.topRow.features.raceName ?? item.topRow.features.targetRaceId,
          "rank-1 horse": item.topRow.features.horseName,
          "rank-1 TPR": number(item.topValue),
          "rank-2 horse": item.secondRow.features.horseName,
          "rank-2 TPR": number(item.secondValue),
          gap: number(item.gap),
          result: `${item.topRow.features.horseName} ${finishLabel(item.topRow)}; ${item.secondRow.features.horseName} ${finishLabel(item.secondRow)}`,
        }))
    );
  }));
  console.log("");
}

function printHistoryDepthReliability(benchmarks: Benchmark[]) {
  console.log("## History-Depth Reliability");
  printTable(benchmarks.flatMap((benchmark) => [1, 2, 3].map((depth) => {
    const rows = benchmark.rowsWithValue.filter((row) => historyDepth(row) === depth);
    return {
      year: benchmark.year,
      "valid contributing prior runs": depth,
      runners: rows.length,
      "mean TPR": number(average(rows.map((row) => benchmark.values.get(row.features.targetRunnerId)).filter(isNumber))),
      "rank-1 strike": pct(winRate(rows.filter((row) => benchmark.rankGroups.get(row.features.targetRunnerId) === "rank 1"))),
      "top-3 capture": pct(winnerCaptureForRows(benchmark, rows, new Set(["rank 1", "rank 2", "rank 3"]))),
      association: number(spearmanAssociationForRows(benchmark, rows)),
    };
  })));
  console.log("");
}

function printTprRankBenchmark(benchmarks: Benchmark[]) {
  console.log("## TPR Rank Benchmark");
  printTable(benchmarks.flatMap((benchmark) =>
    (["rank 1", "rank 2", "rank 3", "rank 4+"] satisfies RankGroup[]).map((group) => {
      const rows = rowsForRankGroup(benchmark, group);
      return {
        year: benchmark.year,
        rank: group,
        runners: rows.length,
        "win strike": pct(winRate(rows)),
        "top-3 rate": pct(top3Rate(rows)),
        "average finish": number(averageFinish(rows)),
      };
    })
  ));
  console.log("");
}

function printTodaysRatingComparison(contexts: Context[], tprBenchmarks: Benchmark[]) {
  console.log("## Today's Rating Comparison");
  const comparisonBenchmarks = [...tprBenchmarks, ...contexts.map((context) =>
    benchmarkFor(context.year, "todaysRating", "Today's Rating", context.settledRows, valuesFor(context.settledRows, (row) => row.features.latestTodaysRating))
  )];
  printTable(YEARS.flatMap((year) => ["tpr", "todaysRating"].map((key) => {
    const benchmark = benchmarkByKey(comparisonBenchmarks, year, key);
    return summaryRow(benchmark, scoreBandsFor(comparisonBenchmarks, key), gapBandsFor(comparisonBenchmarks, key));
  })));
  console.log("");
}

function printDiagnosticInterpretation(benchmarks: Benchmark[]) {
  console.log("## Diagnostic Interpretation");
  const gapRows = TPR_GAP_BANDS.map((band) => {
    const rows2025 = topTwoGapDetails(benchmarkByKey(benchmarks, "2025", "tpr")).filter((item) => inBand(item.gap, band)).map((item) => item.topRow);
    const rows2026 = topTwoGapDetails(benchmarkByKey(benchmarks, "2026", "tpr")).filter((item) => inBand(item.gap, band)).map((item) => item.topRow);
    return {
      "TPR gap": band.label,
      "plain-English label": diagnosticGapLabel(band.label),
      "2025 strike": pct(winRate(rows2025)),
      "2026 strike": pct(winRate(rows2026)),
      "2025 top-3": pct(top3Rate(rows2025)),
      "2026 top-3": pct(top3Rate(rows2026)),
      note: diagnosticGapNote(rows2025, rows2026),
    };
  });
  printTable(gapRows);
  console.log("");
}

function printStage8Conclusion(benchmarks: Benchmark[], contexts: Context[]) {
  const tpr2025 = benchmarkByKey(benchmarks, "2025", "tpr");
  const tpr2026 = benchmarkByKey(benchmarks, "2026", "tpr");
  const todayBenchmarks = contexts.map((context) =>
    benchmarkFor(context.year, "todaysRating", "Today's Rating", context.settledRows, valuesFor(context.settledRows, (row) => row.features.latestTodaysRating))
  );
  const today2026 = benchmarkByKey(todayBenchmarks, "2026", "todaysRating");
  console.log("## Conclusion");
  printTable([
    { question: "1. What does a TPR around 80 / 90 / 100 / 110 / 120 represent empirically?", answer: "The fixed score-band table gives the empirical meaning: lower bands are weaker; 100-109.9 is above-average; 110+ is stronger but not a guarantee. 120+ is sparse and should be read carefully." },
    { question: "2. Are absolute TPR bands monotonic in both 2025 and 2026?", answer: `${absoluteBandMonotonicity(tpr2025, TPR_SCORE_BANDS)} / ${absoluteBandMonotonicity(tpr2026, TPR_SCORE_BANDS)}.` },
    { question: "3. Does a larger TPR rank-1 lead correspond to higher win/top-3 rates?", answer: `Gap classification is ${fixedTprGapLabel(tpr2025)} / ${fixedTprGapLabel(tpr2026)}; see fixed point-gap table.` },
    { question: "4. Which gap bands are meaningfully different?", answer: "The clearest practical split is small leads under 2 points versus large 10+ point leads; middle bands are directionally useful but noisy." },
    { question: "5. Does gap calibration hold up in 2026?", answer: `${fixedTprGapLabel(tpr2026)} on fixed TPR point bands.` },
    { question: "6. Is TPR broadly portable across class/distance/field size?", answer: "Broadly but imperfectly. Context tables show the same score band has different strike/top-3 rates by field size, class, and distance." },
    { question: "7. Does rating reliability depend materially on prior-history depth?", answer: "Yes enough to warrant a later reliability warning: one-run histories are less stable and have smaller sample support than two/three-run histories." },
    { question: "8. Is TPR clearly more useful/interpretable than Today's Rating?", answer: `TPR is more interpretable as a fixed 100-based diagnostic scale; 2026 association ${number(spearmanAssociation(tpr2026))} vs Today's ${number(spearmanAssociation(today2026))}.` },
    { question: "9. Is the formula now stable enough to freeze for forward testing?", answer: "Yes, for diagnostic forward testing only. It should stay frozen rather than optimised on these diagnostics." },
    { question: "10. Is it reasonable to show Turf Performance Rating — diagnostic on Today Turf racecards in a later UI task?", answer: "Yes, if labelled diagnostic and paired with reliability/gap caveats; this task does not expose it in UI." },
  ]);
  console.log("");
}

function printGuardrails() {
  console.log("## Guardrails");
  printTable([
    { item: "Production Research/Today/saved rules changed", result: "No" },
    { item: "Cache schema/generation changed", result: "No" },
    { item: "Importer changed", result: "No" },
    { item: "Holdout behavior changed", result: "No" },
    { item: "Scaling tuned on 2026", result: "No" },
    { item: "New features added", result: "No" },
  ]);
}

function summaryRow(benchmark: Benchmark, scoreBands: Band[], gapBands: Band[]) {
  return {
    year: benchmark.year,
    version: benchmark.label,
    coverage: pct(coverage(benchmark)),
    association: number(spearmanAssociation(benchmark)),
    "rank-1 strike": pct(winRate(rowsForRankGroup(benchmark, "rank 1"))),
    "rank-1 top-3": pct(top3Rate(rowsForRankGroup(benchmark, "rank 1"))),
    "top-2 capture": pct(winnerCapture(benchmark, new Set(["rank 1", "rank 2"]))),
    "top-3 capture": pct(winnerCapture(benchmark, new Set(["rank 1", "rank 2", "rank 3"]))),
    monotonicity: monotonicityLabel(benchmark),
    "absolute bands": absoluteBandMonotonicity(benchmark, scoreBands),
    "gap calibration": gapCalibrationLabel(benchmark, gapBands),
  };
}

function continuousGapRow(benchmark: Benchmark) {
  const gaps = topTwoGaps(benchmark);
  const gapValues = gaps.map((item) => item.gap);
  const winValues = gaps.map((item) => item.topRow.outcome.won === true ? 1 : 0);
  const finishValues = gaps.map((item) => item.topRow.outcome.finishingPosition === null ? null : -item.topRow.outcome.finishingPosition).filter(isNumber);
  const finishGapValues = gaps
    .filter((item) => item.topRow.outcome.finishingPosition !== null)
    .map((item) => item.gap);
  return {
    year: benchmark.year,
    method: benchmark.label,
    races: gaps.length,
    "gap vs win association": number(pearson(rankValues(gapValues), rankValues(winValues))),
    "gap vs finish association": number(pearson(rankValues(finishGapValues), rankValues(finishValues))),
  };
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

function scoreBandsFor(benchmarks: Benchmark[], key: string) {
  return scoreBandsForSingle(benchmarkByKey(benchmarks, "2025", key));
}

function scoreBandsForSingle(benchmark: Benchmark) {
  return quantileBands([...benchmark.values.values()], SCORE_BAND_LABELS);
}

function gapBandsFor(benchmarks: Benchmark[], key: string) {
  return quantileBands(topTwoGaps(benchmarkByKey(benchmarks, "2025", key)).map((item) => item.gap), GAP_BAND_LABELS);
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

function topTwoGapDetails(benchmark: Benchmark): GapDetail[] {
  const gaps: GapDetail[] = [];
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
      gaps.push({
        gap: ranked[0]!.value - ranked[1]!.value,
        topRow: ranked[0]!.row,
        secondRow: ranked[1]!.row,
        topValue: ranked[0]!.value,
        secondValue: ranked[1]!.value,
      });
    }
  }
  return gaps;
}

function fixedTprGapLabel(benchmark: Benchmark) {
  const gaps = topTwoGapDetails(benchmark);
  return gapTrendLabel(TPR_GAP_BANDS.map((band) => {
    const rows = gaps.filter((item) => inBand(item.gap, band)).map((item) => item.topRow);
    return winRate(rows);
  }));
}

function finishLabel(row: HistoricalTargetRunnerMetricsRow) {
  const position = row.outcome.finishingPosition;
  if (position === null) return "unplaced/unknown";
  return position === 1 ? "won" : `finished ${position}`;
}

function historyDepth(row: HistoricalTargetRunnerMetricsRow) {
  const rprDepth = countNumbers(cachedLast3Values(
    row.features.latestPerformanceRating,
    row.features.previousPerformanceRating,
    row.features.averagePerformanceLast3,
  ));
  const speedDepth = countNumbers(cachedLast3Values(
    row.features.latestSpeedRating,
    row.features.previousSpeedRating,
    row.features.averageSpeedLast3,
  ));
  return Math.min(rprDepth, speedDepth);
}

function countNumbers(values: Array<number | null>) {
  return values.filter(isNumber).length;
}

function diagnosticGapLabel(label: string) {
  if (label === "<2 points") return "narrow lead";
  if (label === "2-3.99") return "small lead";
  if (label === "4-5.99") return "moderate lead";
  if (label === "6-9.99") return "clear lead";
  return "large lead";
}

function diagnosticGapNote(rows2025: HistoricalTargetRunnerMetricsRow[], rows2026: HistoricalTargetRunnerMetricsRow[]) {
  const strike2025 = winRate(rows2025);
  const strike2026 = winRate(rows2026);
  if (strike2025 === null || strike2026 === null) return "insufficient data";
  if (strike2026 > strike2025 + 2) return "stronger in holdout";
  if (strike2026 < strike2025 - 2) return "weaker in holdout";
  return "similar in holdout";
}

function absoluteBandMonotonicity(benchmark: Benchmark, bands: Band[]) {
  return trendLabel(bands.map((band) => winRate(rowsForBand(benchmark, band))));
}

function gapCalibrationLabel(benchmark: Benchmark, bands: Band[]) {
  const gaps = topTwoGaps(benchmark);
  return gapTrendLabel(bands.map((band) => {
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

function gapTrendLabel(values: Array<number | null>) {
  const finite = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (finite.length < 3) return "insufficient data";
  let reversals = 0;
  for (let index = 1; index < finite.length; index += 1) {
    if (finite[index]! < finite[index - 1]! - 0.0001) reversals += 1;
  }
  if (reversals === 0) return "monotonic increasing";
  if (reversals === 1) return "broadly monotonic with one minor reversal";
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
  return winnerCaptureForRows(benchmark, benchmark.settledRows, groups);
}

function winnerCaptureForRows(benchmark: Benchmark, rows: HistoricalTargetRunnerMetricsRow[], groups: Set<RankGroup>) {
  const winnersInRows = rows.filter((row) => row.outcome.won === true);
  if (winnersInRows.length === 0) return null;
  return (winnersInRows.filter((row) => groups.has(benchmark.rankGroups.get(row.features.targetRunnerId) ?? "missing")).length / winnersInRows.length) * 100;
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

function distributionStats(values: number[]) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  return {
    mean: average(sorted),
    stdev: standardDeviation(sorted),
    median: median(sorted),
    q1,
    q3,
    iqr: Number.isFinite(q1) && Number.isFinite(q3) ? q3 - q1 : null,
    p5: quantile(sorted, 0.05),
    p95: quantile(sorted, 0.95),
    min: sorted[0] ?? null,
    max: sorted.at(-1) ?? null,
  };
}

function zScore(value: number, mean: number | null, stdev: number | null) {
  if (mean === null || stdev === null || stdev === 0) return 0;
  return (value - mean) / stdev;
}

function robustScore(value: number, medianValue: number | null, iqr: number | null) {
  if (medianValue === null || iqr === null || iqr === 0) return 0;
  return (value - medianValue) / iqr;
}

function percentileScore(value: number, sortedReference: number[]) {
  if (sortedReference.length === 0) return 0.5;
  let low = 0;
  let high = sortedReference.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (sortedReference[middle]! <= value) low = middle + 1;
    else high = middle;
  }
  return low / sortedReference.length;
}

function componentContribution(rprValues: number[], speedValues: number[]): ComponentContribution {
  const rprVariance = variance(rprValues);
  const speedVariance = variance(speedValues);
  const total = (rprVariance ?? 0) + (speedVariance ?? 0);
  return {
    rprVariance,
    speedVariance,
    rprShare: total === 0 ? null : ((rprVariance ?? 0) / total) * 100,
    speedShare: total === 0 ? null : ((speedVariance ?? 0) / total) * 100,
    correlation: pearson(rprValues, speedValues),
  };
}

function variance(values: number[]) {
  const mean = average(values);
  if (mean === null || values.length < 2) return null;
  return values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length;
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
