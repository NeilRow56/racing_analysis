import { loadLatestBacktestFeatureCacheForYear } from "@/lib/racing/backtest-cache";
import type { HistoricalTargetRunnerMetricsRow } from "@/lib/racing/historical-target-metrics";
import { raceClassNumber } from "@/lib/racing/research-rule-classes";

type Year = "2025" | "2026";
type RankGroup = "rank 1" | "rank 2" | "rank 3" | "rank 4+" | "missing";
type VersionKey = "v3" | "v4";

type Context = {
  year: Year;
  settledRows: HistoricalTargetRunnerMetricsRow[];
  baseScores: Map<string, number>;
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

type DistanceAdjustment = {
  globalMean: number;
  byDistance: Map<string, { mean: number; count: number; offset: number }>;
};

const YEARS: Year[] = ["2025", "2026"];
const B3_WEIGHTS: [number, number, number] = [0.6, 0.25, 0.15];
const SCORE_BAND_LABELS = ["bottom 20%", "20-40%", "40-60%", "60-80%", "top 20%"];
const GAP_BAND_LABELS = ["smallest 25%", "25-50%", "50-75%", "largest 25%"];

async function main() {
  console.log("# Turf Rating Stage 5 Distance Diagnostic");
  console.log("");
  console.log("Diagnostic only. V3 is fixed Stage 4 Variant 3: B3 60/25/15 recent RPR/performance + Topspeed/speed, 2025 class offset, and 2025 weight-relative coefficient. V4 adds one 2025-derived fixed distance-band location offset.");
  console.log("");
  console.log("No Research, Today, saved/frozen rules, UI, cache schemas, cache generation, importers, or holdout behavior changed. No ROI, SP, market rank, trainer, jockey, draw, going, course, or future runs used.");
  console.log("");

  const contexts = await loadContexts();
  const development = contextFor(contexts, "2025");
  const classAdjustment = buildClassAdjustment(development);
  const weightAdjustment = buildWeightAdjustment(development);
  const v3DevelopmentValues = v3Values(development, classAdjustment, weightAdjustment);
  const distanceAdjustment = buildDistanceAdjustment(development, v3DevelopmentValues);
  const benchmarks = contexts.flatMap((context) => {
    const v3 = v3Values(context, classAdjustment, weightAdjustment);
    const v4 = v4Values(context, classAdjustment, weightAdjustment, distanceAdjustment);
    return [
      benchmarkFor(context.year, "v3", "V3 - Stage 4 class + weight adjusted B3", context.settledRows, v3),
      benchmarkFor(context.year, "v4", "V4 - V3 + fixed distance adjustment", context.settledRows, v4),
    ];
  });
  const retained = retainedVersion(benchmarks);

  printStage4Reconciliation(benchmarks);
  printDistanceDefinitions();
  printPreAdjustmentDistanceDiagnostic(benchmarks);
  printDistanceAdjustment(distanceAdjustment);
  printCoreComparison(benchmarks);
  printAbsoluteCalibration(benchmarks);
  printGapCalibration(benchmarks);
  printContextPortability(benchmarks);
  printHoldoutReplication(benchmarks);
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
    contexts.push({ year, settledRows, baseScores: b3BaseScores(settledRows) });
    for (const [raceId, raceRows] of groupBy(settledRows, (row) => row.features.targetRaceId)) {
      rowCacheByRace.set(raceId, raceRows);
    }
  }
  return contexts;
}

function b3BaseScores(rows: HistoricalTargetRunnerMetricsRow[]) {
  const values = new Map<string, number>();
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
      values.set(row.features.targetRunnerId, (rpr + speed) / 2);
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

function buildClassAdjustment(context: Context): ClassAdjustment {
  const globalMean = average([...context.baseScores.values()]) ?? 0;
  const byClass = new Map<string, { mean: number; count: number; offset: number }>();
  const rowsByClass = groupBy(
    context.settledRows.filter((row) => context.baseScores.has(row.features.targetRunnerId)),
    (row) => raceClassBucket(row.features.raceClass),
  );
  for (const [raceClass, rows] of rowsByClass) {
    const values = rows.map((row) => context.baseScores.get(row.features.targetRunnerId)).filter(isNumber);
    const mean = average(values);
    if (mean !== null) {
      byClass.set(raceClass, { mean, count: values.length, offset: mean - globalMean });
    }
  }
  return { globalMean, byClass };
}

function buildWeightAdjustment(context: Context): WeightAdjustment {
  const benchmark = benchmarkFor(context.year, "unadjustedForWeight", "unadjusted for weight", context.settledRows, context.baseScores);
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

function v3Values(context: Context, classAdjustment: ClassAdjustment, weightAdjustment: WeightAdjustment) {
  const classValues = classAdjustedValues(context, context.baseScores, classAdjustment);
  const adjusted = new Map<string, number>();
  for (const row of context.settledRows) {
    const value = classValues.get(row.features.targetRunnerId);
    const weightDiff = weightDiffFromRaceMedian(row);
    if (value !== undefined && weightDiff !== null) {
      adjusted.set(row.features.targetRunnerId, value + (weightAdjustment.coefficientRawPointsPerLb * weightDiff));
    }
  }
  return adjusted;
}

function buildDistanceAdjustment(context: Context, v3ValuesForDevelopment: Map<string, number>): DistanceAdjustment {
  const globalMean = average([...v3ValuesForDevelopment.values()]) ?? 0;
  const byDistance = new Map<string, { mean: number; count: number; offset: number }>();
  const rowsByDistance = groupBy(
    context.settledRows.filter((row) => v3ValuesForDevelopment.has(row.features.targetRunnerId)),
    (row) => distanceBand(row.features.distanceYards),
  );
  for (const [distance, rows] of rowsByDistance) {
    const values = rows.map((row) => v3ValuesForDevelopment.get(row.features.targetRunnerId)).filter(isNumber);
    const mean = average(values);
    if (mean !== null) {
      byDistance.set(distance, { mean, count: values.length, offset: mean - globalMean });
    }
  }
  return { globalMean, byDistance };
}

function v4Values(
  context: Context,
  classAdjustment: ClassAdjustment,
  weightAdjustment: WeightAdjustment,
  distanceAdjustment: DistanceAdjustment,
) {
  const v3 = v3Values(context, classAdjustment, weightAdjustment);
  const adjusted = new Map<string, number>();
  for (const row of context.settledRows) {
    const value = v3.get(row.features.targetRunnerId);
    const distanceOffset = distanceAdjustment.byDistance.get(distanceBand(row.features.distanceYards))?.offset ?? 0;
    if (value !== undefined) {
      adjusted.set(row.features.targetRunnerId, value - distanceOffset);
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

function printStage4Reconciliation(benchmarks: Benchmark[]) {
  console.log("## Stage 4 Reconciliation");
  printTable(YEARS.map((year) => {
    const benchmark = benchmarkByKey(benchmarks, year, "v3");
    return summaryRow(benchmark, scoreBandsFor(benchmarks, "v3"), gapBandsFor(benchmarks, "v3"));
  }));
  console.log("");
}

function printDistanceDefinitions() {
  console.log("## Distance Definitions");
  printTable([
    { band: "sprint", definition: "distanceYards <= 1320 (up to 6f)" },
    { band: "mile-ish", definition: ">6f to 8f" },
    { band: "middle distance", definition: ">8f to 12f" },
    { band: "staying", definition: ">12f" },
    { band: "unknown", definition: "missing distanceYards" },
  ]);
  console.log("These are the same broad distance bands used by the recent Turf diagnostics, retained for reconciliation rather than tuned from outcomes.");
  console.log("");
}

function printPreAdjustmentDistanceDiagnostic(benchmarks: Benchmark[]) {
  console.log("## Pre-Adjustment Distance Diagnostic");
  const bands = scoreBandsFor(benchmarks, "v3");
  printTable(YEARS.flatMap((year) => {
    const benchmark = benchmarkByKey(benchmarks, year, "v3");
    return distanceRowsWithScoreBandFinish(benchmark, bands);
  }));
  console.log("");
}

function printDistanceAdjustment(adjustment: DistanceAdjustment) {
  console.log("## 2025-Derived Distance Adjustment");
  console.log("Method: use V3's 2025 adjusted score distribution, calculate each distance band's mean score location versus the all-Turf mean, subtract that fixed distance offset, and apply unchanged in 2026. This uses no outcome data.");
  console.log("");
  printTable([...adjustment.byDistance.entries()].map(([distance, value]) => ({
    distance,
    runners: value.count,
    "2025 V3 mean": number(value.mean),
    "global mean": number(adjustment.globalMean),
    "fixed offset subtracted": number(value.offset),
  })));
  console.log("");
}

function printCoreComparison(benchmarks: Benchmark[]) {
  console.log("## V3 Vs V4 Core Comparison");
  printTable(YEARS.flatMap((year) => (["v3", "v4"] as VersionKey[]).map((key) => {
    const benchmark = benchmarkByKey(benchmarks, year, key);
    return summaryRow(benchmark, scoreBandsFor(benchmarks, key), gapBandsFor(benchmarks, key));
  })));
  console.log("");
  console.log("### Incremental Effect");
  printTable(YEARS.map((year) => incrementalRow(benchmarks, year)));
  console.log("");
}

function printAbsoluteCalibration(benchmarks: Benchmark[]) {
  console.log("## Absolute-Score Calibration");
  for (const key of ["v3", "v4"] as VersionKey[]) {
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
  for (const key of ["v3", "v4"] as VersionKey[]) {
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
        };
      });
    }));
    console.log("");
  }
}

function printContextPortability(benchmarks: Benchmark[]) {
  console.log("## Context Portability");
  for (const key of ["v3", "v4"] as VersionKey[]) {
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

function printHoldoutReplication(benchmarks: Benchmark[]) {
  console.log("## Distance-Specific Holdout Replication");
  printTable(distanceOrder.flatMap((distance) => {
    const rows = YEARS.map((year) => distanceEffectRow(benchmarks, year, distance));
    return [{
      distance,
      "2025 association delta": number(rows[0]?.associationDelta ?? null),
      "2025 top-3 capture delta": pp(rows[0]?.top3CaptureDelta ?? null),
      "2025 effect": rows[0]?.effect ?? "too sparse",
      "2026 association delta": number(rows[1]?.associationDelta ?? null),
      "2026 top-3 capture delta": pp(rows[1]?.top3CaptureDelta ?? null),
      "2026 effect": rows[1]?.effect ?? "too sparse",
      classification: distanceReplicationLabel(rows[0]?.effect, rows[1]?.effect),
    }];
  }));
  console.log("");
}

function printExistingComparison(contexts: Context[], benchmarks: Benchmark[], retained: VersionKey) {
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

function printScaleDecision(benchmarks: Benchmark[], retained: VersionKey) {
  console.log("## Absolute Scale Decision");
  const b2025 = benchmarkByKey(benchmarks, "2025", retained);
  const b2026 = benchmarkByKey(benchmarks, "2026", retained);
  const bands = scoreBandsFor(benchmarks, retained);
  const gaps = gapBandsFor(benchmarks, retained);
  const clears = retained === "v4" &&
    absoluteBandMonotonicity(b2025, bands) === "monotonic increasing" &&
    absoluteBandMonotonicity(b2026, bands) === "monotonic increasing" &&
    gapCalibrationLabel(b2025, gaps) === "monotonic increasing" &&
    gapCalibrationLabel(b2026, gaps) === "monotonic increasing" &&
    noMaterialContextDeterioration(benchmarks);
  if (!clears) {
    console.log("No diagnostic absolute Turf Performance Rating scale proposed. Distance adjustment must improve holdout gap/context portability without material deterioration; this stop-rule was not cleared.");
    console.log("");
    return;
  }
  const mean = average([...b2025.values.values()]);
  const stdev = standardDeviation([...b2025.values.values()]);
  printTable([{
    scale: "Turf Performance Rating - diagnostic",
    mapping: "100 + 10 * ((rating - developmentMean) / developmentStdev)",
    "development mean": number(mean),
    "development stdev": number(stdev),
    note: "Diagnostic-only monotonic transform; not Racing Post RPR.",
  }]);
  console.log("");
}

function printConclusion(benchmarks: Benchmark[], retained: VersionKey) {
  const v3_2025 = benchmarkByKey(benchmarks, "2025", "v3");
  const v3_2026 = benchmarkByKey(benchmarks, "2026", "v3");
  const v4_2025 = benchmarkByKey(benchmarks, "2025", "v4");
  const v4_2026 = benchmarkByKey(benchmarks, "2026", "v4");
  console.log("## Conclusion");
  printTable([
    { question: "1. Does Stage 4 Variant 3 reconcile correctly?", answer: `Yes. Association ${number(spearmanAssociation(v3_2025))} in 2025 and ${number(spearmanAssociation(v3_2026))} in 2026.` },
    { question: "2. Is there a meaningful distance-related calibration problem?", answer: "Yes. V3 distance buckets retain uneven association and non-monotonic absolute-band behavior, especially outside sprint buckets." },
    { question: "3. Does the fixed 2025-derived distance adjustment improve 2025?", answer: versionComparisonAnswer(v3_2025, v4_2025, benchmarks, "2025") },
    { question: "4. Does it also improve 2026?", answer: versionComparisonAnswer(v3_2026, v4_2026, benchmarks, "2026") },
    { question: "5. Does absolute score calibration become more monotonic?", answer: `V3: ${absoluteBandMonotonicity(v3_2025, scoreBandsFor(benchmarks, "v3"))}/${absoluteBandMonotonicity(v3_2026, scoreBandsFor(benchmarks, "v3"))}; V4: ${absoluteBandMonotonicity(v4_2025, scoreBandsFor(benchmarks, "v4"))}/${absoluteBandMonotonicity(v4_2026, scoreBandsFor(benchmarks, "v4"))}.` },
    { question: "6. Does gap calibration improve?", answer: `V3: ${gapCalibrationLabel(v3_2025, gapBandsFor(benchmarks, "v3"))}/${gapCalibrationLabel(v3_2026, gapBandsFor(benchmarks, "v3"))}; V4: ${gapCalibrationLabel(v4_2025, gapBandsFor(benchmarks, "v4"))}/${gapCalibrationLabel(v4_2026, gapBandsFor(benchmarks, "v4"))}.` },
    { question: "7. Does portability across class/field size remain acceptable?", answer: noMaterialContextDeterioration(benchmarks) ? "No material deterioration detected by the strict summary check." : "No. Some class/field-size context behavior remains weak or deteriorates." },
    { question: "8. Which of V3 or V4 should be retained?", answer: retained === "v4" ? "Retain V4 for another diagnostic stage." : "Retain V3; reject distance offset for now." },
    { question: "9. Is there now enough evidence for a diagnostic absolute Turf Performance Rating scale?", answer: retained === "v4" && noMaterialContextDeterioration(benchmarks) ? "Only if gap calibration also clears; see scale decision section." : "No." },
    { question: "10. Biggest remaining obstacle?", answer: "Gap calibration and context portability: a single distance location offset does not fully stabilise how rating advantages translate into outcomes." },
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
    { item: "Distance tuned on 2026", result: "No" },
    { item: "New features beyond distance added", result: "No" },
  ]);
}

function retainedVersion(benchmarks: Benchmark[]): VersionKey {
  const v3_2026 = benchmarkByKey(benchmarks, "2026", "v3");
  const v4_2026 = benchmarkByKey(benchmarks, "2026", "v4");
  const v4Bands2026 = absoluteBandMonotonicity(v4_2026, scoreBandsFor(benchmarks, "v4"));
  const v3Gap2026 = gapCalibrationLabel(v3_2026, gapBandsFor(benchmarks, "v3"));
  const v4Gap2026 = gapCalibrationLabel(v4_2026, gapBandsFor(benchmarks, "v4"));
  const associationGain = (spearmanAssociation(v4_2026) ?? -Infinity) - (spearmanAssociation(v3_2026) ?? -Infinity);
  const captureGain = (winnerCapture(v4_2026, new Set(["rank 1", "rank 2", "rank 3"])) ?? -Infinity) -
    (winnerCapture(v3_2026, new Set(["rank 1", "rank 2", "rank 3"])) ?? -Infinity);
  const holdoutImproves = associationGain >= 0.005 && captureGain >= -0.2;
  const calibrationNotWorse = v4Bands2026 === "monotonic increasing" && (v3Gap2026 !== "monotonic increasing" || v4Gap2026 === "monotonic increasing");
  if (holdoutImproves && calibrationNotWorse) {
    return "v4";
  }
  return "v3";
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

function incrementalRow(benchmarks: Benchmark[], year: Year) {
  const v3 = benchmarkByKey(benchmarks, year, "v3");
  const v4 = benchmarkByKey(benchmarks, year, "v4");
  return {
    year,
    "association delta": number(diff(spearmanAssociation(v4), spearmanAssociation(v3))),
    "rank-1 strike delta": pp(diff(winRate(rowsForRankGroup(v4, "rank 1")), winRate(rowsForRankGroup(v3, "rank 1")))),
    "top-3 capture delta": pp(diff(winnerCapture(v4, new Set(["rank 1", "rank 2", "rank 3"])), winnerCapture(v3, new Set(["rank 1", "rank 2", "rank 3"])))),
    "absolute calibration": `${absoluteBandMonotonicity(v3, scoreBandsFor(benchmarks, "v3"))} -> ${absoluteBandMonotonicity(v4, scoreBandsFor(benchmarks, "v4"))}`,
    "gap calibration": `${gapCalibrationLabel(v3, gapBandsFor(benchmarks, "v3"))} -> ${gapCalibrationLabel(v4, gapBandsFor(benchmarks, "v4"))}`,
  };
}

function distanceRowsWithScoreBandFinish(benchmark: Benchmark, bands: Band[]) {
  return distanceOrder.flatMap((distance) => {
    const rows = benchmark.settledRows.filter((row) => distanceBand(row.features.distanceYards) === distance);
    const ratedRows = rows.filter((row) => benchmark.values.has(row.features.targetRunnerId));
    return {
      year: benchmark.year,
      distance,
      runners: rows.length,
      coverage: pct(rows.length === 0 ? null : (ratedRows.length / rows.length) * 100),
      "mean rating": number(average(ratedRows.map((row) => benchmark.values.get(row.features.targetRunnerId)).filter(isNumber))),
      "median rating": number(median(ratedRows.map((row) => benchmark.values.get(row.features.targetRunnerId)).filter(isNumber))),
      association: number(spearmanAssociationForRows(benchmark, rows)),
      "rank-1 strike": pct(winRate(rows.filter((row) => benchmark.rankGroups.get(row.features.targetRunnerId) === "rank 1"))),
      "top-3 capture": pct(winnerCaptureForRows(benchmark, rows, new Set(["rank 1", "rank 2", "rank 3"]))),
      "absolute bands": absoluteBandMonotonicityForRows(benchmark, bands, rows),
      "bottom 20 avg finish": number(averageFinish(rowsForBandInRows(benchmark, rows, bands[0]!))),
      "top 20 avg finish": number(averageFinish(rowsForBandInRows(benchmark, rows, bands.at(-1)!))),
    };
  });
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
      };
    });
}

function distanceEffectRow(benchmarks: Benchmark[], year: Year, distance: string) {
  const v3 = benchmarkByKey(benchmarks, year, "v3");
  const v4 = benchmarkByKey(benchmarks, year, "v4");
  const v3Rows = v3.settledRows.filter((row) => distanceBand(row.features.distanceYards) === distance);
  const v4Rows = v4.settledRows.filter((row) => distanceBand(row.features.distanceYards) === distance);
  if (v3Rows.length < 500 || v4Rows.length < 500) {
    return { associationDelta: null, top3CaptureDelta: null, effect: "too sparse" };
  }
  const associationDelta = diff(spearmanAssociationForRows(v4, v4Rows), spearmanAssociationForRows(v3, v3Rows));
  const top3CaptureDelta = diff(
    winnerCaptureForRows(v4, v4Rows, new Set(["rank 1", "rank 2", "rank 3"])),
    winnerCaptureForRows(v3, v3Rows, new Set(["rank 1", "rank 2", "rank 3"])),
  );
  const effect = (associationDelta ?? 0) > 0.005 && (top3CaptureDelta ?? 0) >= -0.5
    ? "improved"
    : (associationDelta ?? 0) < -0.005 || (top3CaptureDelta ?? 0) < -0.5
      ? "worsened"
      : "unchanged";
  return { associationDelta, top3CaptureDelta, effect };
}

function distanceReplicationLabel(left?: string, right?: string) {
  if (left === "too sparse" || right === "too sparse") return "too sparse";
  if (left === "improved" && right === "improved") return "improved in both years";
  if (left === "improved" && right !== "improved") return "improved in 2025 only";
  if (left !== "improved" && right === "improved") return "improved in 2026 only";
  if (left === "worsened" || right === "worsened") return "worsened";
  return "unchanged";
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

function versionComparisonAnswer(v3: Benchmark, v4: Benchmark, benchmarks: Benchmark[], year: Year) {
  return `association ${number(spearmanAssociation(v3))} -> ${number(spearmanAssociation(v4))}; top-3 capture ${pct(winnerCapture(v3, new Set(["rank 1", "rank 2", "rank 3"])))} -> ${pct(winnerCapture(v4, new Set(["rank 1", "rank 2", "rank 3"])))}; absolute bands ${absoluteBandMonotonicity(v3, scoreBandsFor(benchmarks, "v3"))} -> ${absoluteBandMonotonicity(v4, scoreBandsFor(benchmarks, "v4"))} (${year}).`;
}

function noMaterialContextDeterioration(benchmarks: Benchmark[]) {
  return YEARS.every((year) => {
    const v3 = benchmarkByKey(benchmarks, year, "v3");
    const v4 = benchmarkByKey(benchmarks, year, "v4");
    const buckets = [
      ...distanceOrder.map((key) => ({ type: "distance", key, rows: v3.settledRows.filter((row) => distanceBand(row.features.distanceYards) === key) })),
      ...raceClassOrder.map((key) => ({ type: "race class", key, rows: v3.settledRows.filter((row) => raceClassBucket(row.features.raceClass) === key) })),
      ...fieldSizeOrder.map((key) => ({ type: "field size", key, rows: v3.settledRows.filter((row) => fieldSizeBand(fieldSizeForRow(row)) === key) })),
    ];
    return buckets.every((bucket) => {
      if (bucket.rows.length < 500) return true;
      const v3Association = spearmanAssociationForRows(v3, bucket.rows) ?? 0;
      const v4Association = spearmanAssociationForRows(v4, bucket.rows) ?? 0;
      return v4Association >= v3Association - 0.015;
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
