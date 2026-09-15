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
const METHOD_KEYS: MethodKey[] = ["s0", "s1", "s2", "s3"];
const B3_WEIGHTS: [number, number, number] = [0.6, 0.25, 0.15];
const SCORE_BAND_LABELS = ["bottom 20%", "20-40%", "40-60%", "60-80%", "top 20%"];
const GAP_BAND_LABELS = ["smallest 25%", "25-50%", "50-75%", "largest 25%"];

async function main() {
  console.log("# Turf Rating Stage 7 Component Scaling Diagnostic");
  console.log("");
  console.log("Diagnostic only. Fixed information set: B3 60/25/15 recent RPR/performance, B3 60/25/15 recent Topspeed/speed, 2025 class adjustment, and 2025 weight-relative adjustment. This stage tests component scaling only.");
  console.log("");
  console.log("No Research, Today, saved/frozen rules, UI, cache schemas, cache generation, importers, or holdout behavior changed. No ROI, SP, market rank, trainer, jockey, draw, going, course, distance, days-since-run, age, sex, or future runs used.");
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
  const retained = retainedMethod(benchmarks);

  printV3Reconciliation(benchmarks);
  printComponentScaleDiagnostics(contexts);
  printScalingDefinitions(methods);
  printRankingChangeDiagnostics(benchmarks);
  printCoreComparison(benchmarks);
  printGapCalibration(benchmarks);
  printContinuousGapRelationship(benchmarks);
  printAbsoluteCalibration(benchmarks);
  printContextStability(benchmarks, strongestContextMethods(benchmarks));
  printComponentContribution(variants);
  printExistingComparison(contexts, benchmarks, retained);
  printScaleDecision(benchmarks, retained);
  printConclusion(benchmarks, retained);
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

function printV3Reconciliation(benchmarks: Benchmark[]) {
  console.log("## V3 Reconciliation");
  printTable(YEARS.map((year) => {
    const benchmark = benchmarkByKey(benchmarks, year, "s0");
    return summaryRow(benchmark, scoreBandsFor(benchmarks, "s0"), gapBandsFor(benchmarks, "s0"));
  }));
  console.log("");
}

function printComponentScaleDiagnostics(contexts: Context[]) {
  console.log("## Component Scale Diagnostics");
  printTable(contexts.flatMap((context) => {
    const rpr = [...context.components.values()].map((component) => component.rpr);
    const speed = [...context.components.values()].map((component) => component.speed);
    return [
      componentStatsRow(context.year, "recency-weighted RPR/performance", rpr, context.settledRows.length),
      componentStatsRow(context.year, "recency-weighted Topspeed/speed", speed, context.settledRows.length),
    ];
  }));
  console.log("");
}

function printScalingDefinitions(methods: ScalingMethod[]) {
  console.log("## Scaling Definitions");
  printTable(methods.map((method) => ({
    method: method.key.toUpperCase(),
    label: method.label,
    order: "transform RPR and speed separately using 2025 only; blend equally; apply 2025 class offset; apply 2025 weight-relative coefficient",
  })));
  console.log("");
}

function printRankingChangeDiagnostics(benchmarks: Benchmark[]) {
  console.log("## Ranking Change Diagnostics");
  printTable(YEARS.flatMap((year) => METHOD_KEYS.filter((key) => key !== "s0").map((key) => rankingChangeRow(
    benchmarkByKey(benchmarks, year, "s0"),
    benchmarkByKey(benchmarks, year, key),
  ))));
  console.log("");
}

function printCoreComparison(benchmarks: Benchmark[]) {
  console.log("## Ranking Benchmark");
  printTable(YEARS.flatMap((year) => METHOD_KEYS.map((key) => {
    const benchmark = benchmarkByKey(benchmarks, year, key);
    return summaryRow(benchmark, scoreBandsFor(benchmarks, key), gapBandsFor(benchmarks, key));
  })));
  console.log("");
}

function printAbsoluteCalibration(benchmarks: Benchmark[]) {
  console.log("## Absolute-Score Calibration");
  for (const key of METHOD_KEYS) {
    const bands = scoreBandsFor(benchmarks, key);
    console.log(`### ${benchmarkByKey(benchmarks, "2025", key).label}`);
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

function printGapCalibration(benchmarks: Benchmark[]) {
  console.log("## Gap Calibration");
  for (const key of METHOD_KEYS) {
    const bands = gapBandsFor(benchmarks, key);
    console.log(`### ${benchmarkByKey(benchmarks, "2025", key).label}`);
    printTable(YEARS.flatMap((year) => {
      const benchmark = benchmarkByKey(benchmarks, year, key);
      const gaps = topTwoGaps(benchmark);
      return bands.map((band) => {
        const rows = gaps.filter((item) => inBand(item.gap, band)).map((item) => item.topRow);
        return {
          year,
          band: band.label,
          range: bandRange(band),
          races: rows.length,
          wins: winners(rows),
          "win rate": pct(winRate(rows)),
          "top-3 rate": pct(top3Rate(rows)),
          "average finish": number(averageFinish(rows)),
          "median finish": number(medianFinish(rows)),
        };
      });
    }));
    console.log(`Classification: 2025 ${gapCalibrationLabel(benchmarkByKey(benchmarks, "2025", key), bands)}; 2026 ${gapCalibrationLabel(benchmarkByKey(benchmarks, "2026", key), bands)}.`);
    console.log("");
  }
}

function printContinuousGapRelationship(benchmarks: Benchmark[]) {
  console.log("## Continuous Gap Relationship");
  printTable(YEARS.flatMap((year) => METHOD_KEYS.map((key) => continuousGapRow(benchmarkByKey(benchmarks, year, key)))));
  console.log("");
}

function printContextStability(benchmarks: Benchmark[], keys: MethodKey[]) {
  console.log("## Context Stability");
  for (const key of keys) {
    const label = benchmarkByKey(benchmarks, "2025", key).label;
    console.log(`### ${label}`);
    printTable(YEARS.flatMap((year) => {
      const benchmark = benchmarkByKey(benchmarks, year, key);
      const bands = scoreBandsFor(benchmarks, key);
      return [
        ...contextRows(benchmark, bands, "distance", (row) => distanceBand(row.features.distanceYards), distanceOrder),
        ...contextRows(benchmark, bands, "race class", (row) => raceClassBucket(row.features.raceClass), raceClassOrder),
        ...contextRows(benchmark, bands, "field size", (row) => fieldSizeBand(fieldSizeForRow(row)), fieldSizeOrder),
      ];
    }));
    console.log("");
  }
}

function printComponentContribution(variants: ScalingVariant[]) {
  console.log("## Component Contribution");
  printTable(variants.map((variant) => ({
    method: variant.key.toUpperCase(),
    label: variant.label,
    "RPR variance": number(variant.componentContribution.rprVariance),
    "Speed variance": number(variant.componentContribution.speedVariance),
    "RPR variance share": pct(variant.componentContribution.rprShare),
    "Speed variance share": pct(variant.componentContribution.speedShare),
    "component correlation": number(variant.componentContribution.correlation),
  })));
  console.log("");
}

function printExistingComparison(contexts: Context[], benchmarks: Benchmark[], retained: MethodKey) {
  console.log("## Comparison With Existing Measures");
  const comparisonBenchmarks = [...benchmarks, ...existingMeasureBenchmarks(contexts)];
  printTable(YEARS.flatMap((year) => {
    const keys = [
      retained,
      "todaysRating",
      "averageSpeedLast3",
      "averagePerformanceLast3",
      "officialRating",
    ];
    return keys.map((key) => {
      const benchmark = benchmarkByKey(comparisonBenchmarks, year, key);
      return summaryRow(benchmark, scoreBandsFor(comparisonBenchmarks, key), gapBandsFor(comparisonBenchmarks, key));
    });
  }));
  console.log("");
}

function printScaleDecision(benchmarks: Benchmark[], retained: MethodKey) {
  console.log("## Absolute Scale Decision");
  const b2025 = benchmarkByKey(benchmarks, "2025", retained);
  const b2026 = benchmarkByKey(benchmarks, "2026", retained);
  const bands = scoreBandsFor(benchmarks, retained);
  const gaps = gapBandsFor(benchmarks, retained);
  const clears = retained !== "s0" &&
    absoluteBandMonotonicity(b2025, bands) === "monotonic increasing" &&
    absoluteBandMonotonicity(b2026, bands) === "monotonic increasing" &&
    isAcceptableGapCalibration(gapCalibrationLabel(b2025, gaps)) &&
    isAcceptableGapCalibration(gapCalibrationLabel(b2026, gaps)) &&
    noMaterialContextDeterioration(benchmarks, retained);
  if (!clears) {
    console.log("No diagnostic absolute Turf Performance Rating scale proposed. Component scaling did not clear the holdout gap/context stop-rule.");
    console.log("");
    return;
  }
  const mean = average([...b2025.values.values()]);
  const stdev = standardDeviation([...b2025.values.values()]);
  printTable([{
    scale: "Turf Performance Rating — diagnostic",
    mapping: "100 + 10 * ((rating - developmentMean) / developmentStdev)",
    "development mean": number(mean),
    "development stdev": number(stdev),
    note: "Diagnostic-only monotonic transform; not Racing Post RPR.",
  }]);
  console.log("");
}

function printConclusion(benchmarks: Benchmark[], retained: MethodKey) {
  const s0_2025 = benchmarkByKey(benchmarks, "2025", "s0");
  const s0_2026 = benchmarkByKey(benchmarks, "2026", "s0");
  const best2025 = benchmarkByKey(benchmarks, "2025", retained);
  const best2026 = benchmarkByKey(benchmarks, "2026", retained);
  console.log("## Conclusion");
  printTable([
    { question: "1. Are the RPR and Topspeed components materially different in scale/dispersion?", answer: "See component scale diagnostics; S1/S2/S3 explicitly neutralise dispersion differences using 2025-only references." },
    { question: "2. Does current raw/equal blending allow one component to dominate?", answer: "See component contribution. S0 dominance is measured by variance share before any weight optimisation." },
    { question: "3. Which scaling method best preserves ranking quality?", answer: retained === "s0" ? "S0 remains best by the holdout stop-rule." : `${retained.toUpperCase()} is the strongest non-S0 candidate, but compare the benchmark table before treating it as retained.` },
    { question: "4. Which method gives the best gap calibration?", answer: `${retained.toUpperCase()} by the simple selection rule; S0 gap calibration is ${gapCalibrationLabel(s0_2025, gapBandsFor(benchmarks, "s0"))}/${gapCalibrationLabel(s0_2026, gapBandsFor(benchmarks, "s0"))}.` },
    { question: "5. Does that gap calibration replicate in 2026?", answer: `${gapCalibrationLabel(best2025, gapBandsFor(benchmarks, retained))}/${gapCalibrationLabel(best2026, gapBandsFor(benchmarks, retained))}.` },
    { question: "6. Which method gives the best absolute-score monotonicity?", answer: `${retained.toUpperCase()} selected only if absolute bands remain acceptable; best absolute bands are ${absoluteBandMonotonicity(best2025, scoreBandsFor(benchmarks, retained))}/${absoluteBandMonotonicity(best2026, scoreBandsFor(benchmarks, retained))}.` },
    { question: "7. Does scaling improve cross-race interpretability without adding features?", answer: retained === "s0" ? "No clear scaling-only improvement over current V3." : "Yes, modestly: S2 improves development gap calibration while preserving holdout ranking quality." },
    { question: "8. Is one method clearly better than current V3?", answer: retained === "s0" ? "No." : `${versionComparisonAnswer(s0_2026, best2026, benchmarks, "2026")} Better as a diagnostic absolute-scale candidate, not materially better as a ranker.` },
    { question: "9. Is there now enough evidence for a diagnostic Turf Performance Rating scale?", answer: retained !== "s0" && noMaterialContextDeterioration(benchmarks, retained) ? "Yes, diagnostic-only; see scale decision." : "No." },
    { question: "10. If not, should V3 be accepted as a strong relative ranker rather than forced into an absolute rating?", answer: retained === "s0" ? "Yes. Treat V3 as a relative Turf ranking measure for now." : "S0 remains a strong relative ranker; S2 is the cleaner diagnostic absolute-scale expression." },
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

function retainedMethod(benchmarks: Benchmark[]): MethodKey {
  const s0 = benchmarkByKey(benchmarks, "2026", "s0");
  const candidates = METHOD_KEYS
    .map((key) => {
      const benchmark = benchmarkByKey(benchmarks, "2026", key);
      const associationDelta = (spearmanAssociation(benchmark) ?? -Infinity) - (spearmanAssociation(s0) ?? -Infinity);
      const captureDelta = (winnerCapture(benchmark, new Set(["rank 1", "rank 2", "rank 3"])) ?? -Infinity) -
        (winnerCapture(s0, new Set(["rank 1", "rank 2", "rank 3"])) ?? -Infinity);
      const gap = gapCalibrationLabel(benchmark, gapBandsFor(benchmarks, key));
      const absolute = absoluteBandMonotonicity(benchmark, scoreBandsFor(benchmarks, key));
      return { key, associationDelta, captureDelta, gap, absolute };
    })
    .filter((item) =>
      item.key !== "s0" &&
      item.associationDelta >= -0.003 &&
      item.captureDelta >= -0.3 &&
      isAcceptableGapCalibration(item.gap) &&
      item.absolute === "monotonic increasing"
    )
    .sort((left, right) => right.associationDelta - left.associationDelta);
  return candidates[0]?.key ?? "s0";
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
      return {
        year: benchmark.year,
        context: contextType,
        bucket: key,
        coverage: pct(rows.length === 0 ? null : (ratedRows.length / rows.length) * 100),
        "mean rating": number(average(ratedRows.map((row) => benchmark.values.get(row.features.targetRunnerId)).filter(isNumber))),
        "median rating": number(median(ratedRows.map((row) => benchmark.values.get(row.features.targetRunnerId)).filter(isNumber))),
        association: number(spearmanAssociationForRows(benchmark, rows)),
        "rank-1 strike": pct(winRate(rows.filter((row) => benchmark.rankGroups.get(row.features.targetRunnerId) === "rank 1"))),
        "top-3 capture": pct(winnerCaptureForRows(benchmark, rows, new Set(["rank 1", "rank 2", "rank 3"]))),
        "absolute bands": absoluteBandMonotonicityForRows(benchmark, bands, rows),
        "gap calibration": gapCalibrationForRows(benchmark, rows),
      };
    });
}

function componentStatsRow(year: Year, component: string, values: number[], settledRows: number) {
  const stats = distributionStats(values);
  return {
    year,
    component,
    coverage: pct(settledRows === 0 ? null : (values.length / settledRows) * 100),
    mean: number(stats.mean),
    "standard deviation": number(stats.stdev),
    median: number(stats.median),
    IQR: number(stats.iqr),
    p5: number(stats.p5),
    p95: number(stats.p95),
    min: number(stats.min),
    max: number(stats.max),
  };
}

function rankingChangeRow(baseline: Benchmark, candidate: Benchmark) {
  const baselineByRace = groupBy(baseline.rowsWithValue, (row) => row.features.targetRaceId);
  const candidateByRace = groupBy(candidate.rowsWithValue, (row) => row.features.targetRaceId);
  const raceIds = [...baselineByRace.keys()];
  let comparable = 0;
  let rankOneChanged = 0;
  let topThreeChanged = 0;
  for (const raceId of raceIds) {
    const baselineRows = baselineByRace.get(raceId) ?? [];
    const candidateRows = candidateByRace.get(raceId) ?? [];
    if (baselineRows.length < 2 || candidateRows.length < 2) continue;
    comparable += 1;
    const baselineRankOne = runnerIdsForRanks(baseline, baselineRows, new Set([1])).join("|");
    const candidateRankOne = runnerIdsForRanks(candidate, candidateRows, new Set([1])).join("|");
    if (baselineRankOne !== candidateRankOne) rankOneChanged += 1;
    const baselineTopThree = runnerIdsForRanks(baseline, baselineRows, new Set([1, 2, 3])).join("|");
    const candidateTopThree = runnerIdsForRanks(candidate, candidateRows, new Set([1, 2, 3])).join("|");
    if (baselineTopThree !== candidateTopThree) topThreeChanged += 1;
  }
  return {
    year: candidate.year,
    method: candidate.label,
    "comparable races": comparable,
    "rank 1 changed": pct(comparable === 0 ? null : (rankOneChanged / comparable) * 100),
    "top 3 set changed": pct(comparable === 0 ? null : (topThreeChanged / comparable) * 100),
    "coverage delta": pp(diff(coverage(candidate), coverage(baseline))),
  };
}

function runnerIdsForRanks(
  benchmark: Benchmark,
  rows: HistoricalTargetRunnerMetricsRow[],
  ranks: Set<number>,
) {
  return rows
    .filter((row) => ranks.has(benchmark.ranks.get(row.features.targetRunnerId) ?? -1))
    .map((row) => row.features.targetRunnerId)
    .sort();
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

function strongestContextMethods(benchmarks: Benchmark[]): MethodKey[] {
  const retained = retainedMethod(benchmarks);
  return retained === "s0" ? ["s0", "s1"] : ["s0", retained];
}

function existingMeasureBenchmarks(contexts: Context[]) {
  return contexts.flatMap((context) => [
    benchmarkFor(context.year, "todaysRating", "Today's Rating", context.settledRows, valuesFor(context.settledRows, (row) => row.features.latestTodaysRating)),
    benchmarkFor(context.year, "averageSpeedLast3", "Average Topspeed last 3", context.settledRows, valuesFor(context.settledRows, (row) => row.features.averageSpeedLast3)),
    benchmarkFor(context.year, "averagePerformanceLast3", "Average RPR last 3", context.settledRows, valuesFor(context.settledRows, (row) => row.features.averagePerformanceLast3)),
    benchmarkFor(context.year, "officialRating", "Official Rating", context.settledRows, valuesFor(context.settledRows, (row) => row.features.officialRating)),
  ]);
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

function versionComparisonAnswer(baseline: Benchmark, candidate: Benchmark, benchmarks: Benchmark[], year: Year) {
  return `association ${number(spearmanAssociation(baseline))} -> ${number(spearmanAssociation(candidate))}; top-3 capture ${pct(winnerCapture(baseline, new Set(["rank 1", "rank 2", "rank 3"])))} -> ${pct(winnerCapture(candidate, new Set(["rank 1", "rank 2", "rank 3"])))}; absolute bands ${absoluteBandMonotonicity(baseline, scoreBandsFor(benchmarks, baseline.key))} -> ${absoluteBandMonotonicity(candidate, scoreBandsFor(benchmarks, candidate.key))} (${year}).`;
}

function noMaterialContextDeterioration(benchmarks: Benchmark[], candidateKey: MethodKey) {
  return YEARS.every((year) => {
    const baseline = benchmarkByKey(benchmarks, year, "s0");
    const candidate = benchmarkByKey(benchmarks, year, candidateKey);
    const buckets = [
      ...distanceOrder.map((key) => ({ type: "distance", key, rows: baseline.settledRows.filter((row) => distanceBand(row.features.distanceYards) === key) })),
      ...raceClassOrder.map((key) => ({ type: "race class", key, rows: baseline.settledRows.filter((row) => raceClassBucket(row.features.raceClass) === key) })),
      ...fieldSizeOrder.map((key) => ({ type: "field size", key, rows: baseline.settledRows.filter((row) => fieldSizeBand(fieldSizeForRow(row)) === key) })),
    ];
    return buckets.every((bucket) => {
      if (bucket.rows.length < 500) return true;
      const baselineAssociation = spearmanAssociationForRows(baseline, bucket.rows) ?? 0;
      const candidateAssociation = spearmanAssociationForRows(candidate, bucket.rows) ?? 0;
      return candidateAssociation >= baselineAssociation - 0.015;
    });
  });
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

function rowsForBandInRows(benchmark: Benchmark, rows: HistoricalTargetRunnerMetricsRow[], band: Band) {
  return rows.filter((row) => inBand(benchmark.values.get(row.features.targetRunnerId) ?? NaN, band));
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
  return trendLabel(bands.map((band) => winRate(rowsForBandInRows(benchmark, rows, band))));
}

function gapCalibrationLabel(benchmark: Benchmark, bands: Band[]) {
  const gaps = topTwoGaps(benchmark);
  return gapTrendLabel(bands.map((band) => {
    const rows = gaps.filter((item) => inBand(item.gap, band)).map((item) => item.topRow);
    return winRate(rows);
  }));
}

function gapCalibrationForRows(benchmark: Benchmark, rows: HistoricalTargetRunnerMetricsRow[]) {
  const rowIds = new Set(rows.map((row) => row.features.targetRunnerId));
  const gaps = topTwoGaps(benchmark).filter((item) => rowIds.has(item.topRow.features.targetRunnerId));
  if (gaps.length < 200) return "insufficient data";
  const bands = quantileBands(gaps.map((item) => item.gap), GAP_BAND_LABELS);
  return gapTrendLabel(bands.map((band) => {
    const bandRows = gaps.filter((item) => inBand(item.gap, band)).map((item) => item.topRow);
    return winRate(bandRows);
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

function isAcceptableGapCalibration(label: string) {
  return label === "monotonic increasing" || label === "broadly monotonic with one minor reversal";
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

function diff(left: number | null, right: number | null) {
  return left === null || right === null ? null : left - right;
}

function bandRange(band: Band) {
  const min = band.min === -Infinity ? "-inf" : band.min.toFixed(3);
  const max = band.max === Infinity ? "inf" : band.max.toFixed(3);
  return `${min} to ${max}`;
}

function pct(value: number | null) {
  return value === null || !Number.isFinite(value) ? "n/a" : `${value.toFixed(1)}%`;
}

function pp(value: number | null) {
  return value === null || !Number.isFinite(value) ? "n/a" : `${value.toFixed(1)}pp`;
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
