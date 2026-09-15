import { loadLatestBacktestFeatureCacheForYear } from "@/lib/racing/backtest-cache";
import type { HistoricalTargetRunnerMetricsRow } from "@/lib/racing/historical-target-metrics";
import { raceClassNumber } from "@/lib/racing/research-rule-classes";

type Year = "2025" | "2026";
type RankGroup = "rank 1" | "rank 2" | "rank 3" | "rank 4+" | "missing";
type VariantKey = "b1" | "b2" | "b3";
type ScoreKind = "raw" | "relative" | "classNormalised";

type Variant = {
  key: VariantKey;
  label: string;
  weights: [number, number, number];
};

type TargetScore = {
  targetRunnerId: string;
  rprValidRuns: number;
  speedValidRuns: number;
  rprLevel: number | null;
  speedLevel: number | null;
  rawScore: number | null;
};

type Context = {
  year: Year;
  settledRows: HistoricalTargetRunnerMetricsRow[];
  scoresByVariant: Map<VariantKey, Map<string, TargetScore>>;
};

type Benchmark = {
  year: Year;
  label: string;
  key: string;
  kind: ScoreKind;
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

type ClassStats = {
  mean: number;
  stdev: number;
};

const YEARS: Year[] = ["2025", "2026"];
const VARIANTS: Variant[] = [
  { key: "b1", label: "B1 equal weighting", weights: [1 / 3, 1 / 3, 1 / 3] },
  { key: "b2", label: "B2 mild recency weighting", weights: [0.5, 0.3, 0.2] },
  { key: "b3", label: "B3 moderate recency weighting", weights: [0.6, 0.25, 0.15] },
];

async function main() {
  console.log("# Turf Rating Third-Stage Diagnostic");
  console.log("");
  console.log("Diagnostic only. Candidate B foundation only: cached Average RPR/performance last 3 plus cached Average Topspeed/speed last 3. 2025 is development; 2026 is holdout validation. No Research, Today, saved/frozen rules, UI, cache schemas, cache generation, or holdout behavior changed.");
  console.log("");
  console.log("No betting ROI, market price, SP, trainer form, course suitability, going suitability, draw, jockey, trainer, or field-size filtering was used.");
  console.log("");

  const contexts = await loadContexts();
  const benchmarks = buildBenchmarks(contexts);
  const strongest = strongestVariant(benchmarks);
  const classNormalised = buildClassNormalisedBenchmarks(contexts, strongest);
  const allBenchmarks = [...benchmarks, ...classNormalised];

  printRecap();
  printMissingCoverage(contexts);
  printRawVsRelative(benchmarks);
  printAbsoluteCalibration(benchmarks);
  printContextPortability(benchmarks);
  printClassNormalisedDiagnostic(allBenchmarks, strongest);
  printCarriedWeightDiagnostic(benchmarks, strongest);
  printBenchmarkSummary(benchmarks);
  printTodaysRatingComparison(allBenchmarks, strongest);
  printScaleProposal(benchmarks, strongest);
  printConclusion(allBenchmarks, strongest);
  printGuardrails();
}

async function loadContexts(): Promise<Context[]> {
  const rowsByYear = new Map<Year, HistoricalTargetRunnerMetricsRow[]>();
  for (const year of YEARS) {
    const cache = await loadLatestBacktestFeatureCacheForYear({ family: "turf_flat", year });
    rowsByYear.set(
      year,
      (cache?.rows ?? [])
        .filter((row) => row.features.raceCode === "turf")
        .filter(isSettledRunner)
        .sort(compareRowsChronologically),
    );
  }

  const allRows = YEARS.flatMap((year) => rowsByYear.get(year) ?? []);
  rowCacheByRace.clear();
  for (const [raceId, raceRows] of groupBy(allRows, (row) => row.features.targetRaceId)) {
    rowCacheByRace.set(raceId, raceRows);
  }
  const contexts: Context[] = [];
  for (const year of YEARS) {
    const settledRows = rowsByYear.get(year) ?? [];
    contexts.push({
      year,
      settledRows,
      scoresByVariant: scoresForRows(settledRows),
    });
  }
  return contexts;
}

function scoresForRows(rows: HistoricalTargetRunnerMetricsRow[]) {
  const scoresByVariant = new Map<VariantKey, Map<string, TargetScore>>(VARIANTS.map((variant) => [variant.key, new Map()]));
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
    for (const variant of VARIANTS) {
      const rprLevel = weightedRecentLevel(rprValues, variant.weights);
      const speedLevel = weightedRecentLevel(speedValues, variant.weights);
      scoresByVariant.get(variant.key)!.set(row.features.targetRunnerId, {
        targetRunnerId: row.features.targetRunnerId,
        rprValidRuns: rprValues.filter(isNumber).length,
        speedValidRuns: speedValues.filter(isNumber).length,
        rprLevel,
        speedLevel,
        rawScore: rprLevel === null || speedLevel === null ? null : (rprLevel + speedLevel) / 2,
      });
    }
  }
  return scoresByVariant;
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

function buildBenchmarks(contexts: Context[]) {
  return contexts.flatMap((context) => VARIANTS.flatMap((variant) => {
    const rawValues = rawValuesFor(context, variant.key);
    const relativeValues = relativeValuesFor(context.settledRows, rawValues);
    return [
      benchmarkFor(context.year, `${variant.label} raw`, `${variant.key}:raw`, "raw", context.settledRows, rawValues),
      benchmarkFor(context.year, `${variant.label} within-race relative`, `${variant.key}:relative`, "relative", context.settledRows, relativeValues),
    ];
  }));
}

function buildClassNormalisedBenchmarks(contexts: Context[], strongest: Variant) {
  const development = contexts.find((context) => context.year === "2025")!;
  const classStats = classStatsFor(development, strongest.key);
  return contexts.map((context) => {
    const rawValues = rawValuesFor(context, strongest.key);
    const normalised = new Map<string, number>();
    for (const row of context.settledRows) {
      const value = rawValues.get(row.features.targetRunnerId);
      const stats = classStats.get(raceClassBucket(row.features.raceClass));
      if (value !== undefined && stats && stats.stdev > 0) {
        normalised.set(row.features.targetRunnerId, (value - stats.mean) / stats.stdev);
      }
    }
    return benchmarkFor(
      context.year,
      `${strongest.label} class-normalised`,
      `${strongest.key}:classNormalised`,
      "classNormalised",
      context.settledRows,
      normalised,
    );
  });
}

function rawValuesFor(context: Context, variantKey: VariantKey) {
  const values = new Map<string, number>();
  const scores = context.scoresByVariant.get(variantKey) ?? new Map<string, TargetScore>();
  for (const [runnerId, score] of scores) {
    if (score.rawScore !== null && Number.isFinite(score.rawScore)) {
      values.set(runnerId, score.rawScore);
    }
  }
  return values;
}

function relativeValuesFor(rows: HistoricalTargetRunnerMetricsRow[], rawValues: Map<string, number>) {
  return percentileScoresByRace(rows, (row) => rawValues.get(row.features.targetRunnerId) ?? null);
}

function benchmarkFor(
  year: Year,
  label: string,
  key: string,
  kind: ScoreKind,
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
    label,
    key,
    kind,
    values,
    ranks,
    rankGroups,
    settledRows,
    rowsWithValue: settledRows.filter((row) => values.has(row.features.targetRunnerId)),
  };
}

function printRecap() {
  console.log("## Candidate B Recap And Recency Variants");
  printTable(VARIANTS.map((variant) => ({
    version: variant.label,
    "most recent": pct(variant.weights[0] * 100),
    "second most recent": pct(variant.weights[1] * 100),
    "third most recent": pct(variant.weights[2] * 100),
    components: "Cached RPR/performance recent level and cached Topspeed/speed recent level, equal blended",
  })));
  console.log("");
  console.log("Missing-run handling: each underlying metric is reconstructed from cached latest, previous and average-last-3 fields. When latest and previous are present with an average-last-3 value, the third value is inferred as `average * 3 - latest - previous`. If only one or two cached values are available, the available recency weights are renormalised. If no valid value exists for either side, the combined raw score is missing.");
  console.log("");
  console.log("Raw score: numeric blend of the recency-weighted cached RPR/performance level and recency-weighted cached Topspeed/speed level. Within-race relative score: the raw score converted to the existing within-race rank percentile convention, with higher values better, rank 1 = 1.0 and lowest ranked available = 0.0.");
  console.log("");
}

function printMissingCoverage(contexts: Context[]) {
  console.log("## Missing-Data Coverage");
  printTable(contexts.flatMap((context) => VARIANTS.map((variant) => {
    const scores = context.scoresByVariant.get(variant.key)!;
    const rated = [...scores.values()].filter((score) => score.rawScore !== null);
    return {
      year: context.year,
      version: variant.label,
      "settled runners": context.settledRows.length,
      "runners rated": rated.length,
      coverage: pct(context.settledRows.length === 0 ? null : (rated.length / context.settledRows.length) * 100),
      "both metrics 3 valid": rated.filter((score) => score.rprValidRuns >= 3 && score.speedValidRuns >= 3).length,
      "both metrics 2 valid": rated.filter((score) => score.rprValidRuns === 2 && score.speedValidRuns === 2).length,
      "both metrics 1 valid": rated.filter((score) => score.rprValidRuns === 1 && score.speedValidRuns === 1).length,
      "missing raw score": context.settledRows.length - rated.length,
    };
  })));
  console.log("");
}

function printRawVsRelative(benchmarks: Benchmark[]) {
  console.log("## Raw Vs Within-Race Scores");
  printTable(VARIANTS.flatMap((variant) => YEARS.flatMap((year) => {
    const raw = benchmarkByKey(benchmarks, year, `${variant.key}:raw`);
    const relative = benchmarkByKey(benchmarks, year, `${variant.key}:relative`);
    return [raw, relative].map((benchmark) => rankingSummaryRow(benchmark, variant.label));
  })));
  console.log("");
}

function printAbsoluteCalibration(benchmarks: Benchmark[]) {
  console.log("## Absolute-Score Calibration");
  console.log("Bands are fixed from each version's 2025 raw-score distribution: bottom 20%, 20-40%, 40-60%, 60-80%, top 20%. The same cut points are then applied to 2026.");
  console.log("");
  for (const variant of VARIANTS) {
    const development = benchmarkByKey(benchmarks, "2025", `${variant.key}:raw`);
    const bands = quantileBands([...development.values.values()], ["bottom 20%", "20-40%", "40-60%", "60-80%", "top 20%"]);
    console.log(`### ${variant.label}`);
    printTable(YEARS.flatMap((year) => {
      const benchmark = benchmarkByKey(benchmarks, year, `${variant.key}:raw`);
      return bands.map((band) => {
        const rows = benchmark.rowsWithValue.filter((row) => inBand(benchmark.values.get(row.features.targetRunnerId) ?? NaN, band));
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
    printTable(YEARS.map((year) => ({
      year,
      version: variant.label,
      "absolute-band monotonicity": absoluteBandMonotonicity(benchmarkByKey(benchmarks, year, `${variant.key}:raw`), bands),
    })));
    console.log("");
  }
}

function printContextPortability(benchmarks: Benchmark[]) {
  console.log("## Context Portability");
  console.log("Raw score diagnostics by fixed class, distance and field-size categories. Mean/median raw score differences indicate whether the raw scale shifts by context.");
  console.log("");
  for (const variant of VARIANTS) {
    console.log(`### ${variant.label}`);
    printTable(YEARS.flatMap((year) => {
      const benchmark = benchmarkByKey(benchmarks, year, `${variant.key}:raw`);
      return [
        ...contextRows(benchmark, "race class", (row) => raceClassBucket(row.features.raceClass), raceClassOrder),
        ...contextRows(benchmark, "distance", (row) => distanceBand(row.features.distanceYards), distanceOrder),
        ...contextRows(benchmark, "field size", (row) => fieldSizeBand(fieldSizeForRow(row)), fieldSizeOrder),
      ];
    }));
    console.log("");
  }
}

function printClassNormalisedDiagnostic(benchmarks: Benchmark[], strongest: Variant) {
  console.log("## Class-Normalised Diagnostic");
  console.log(`Applied only to ${strongest.label}. Development-year class means/stdevs are derived from raw scores using pre-race race class only, then frozen and applied to 2026.`);
  console.log("");
  printTable(YEARS.flatMap((year) => {
    const raw = benchmarkByKey(benchmarks, year, `${strongest.key}:raw`);
    const adjusted = benchmarkByKey(benchmarks, year, `${strongest.key}:classNormalised`);
    return [raw, adjusted].map((benchmark) => {
      const bands = quantileBands([...benchmarkByKey(benchmarks, "2025", benchmark.key).values.values()], ["bottom 20%", "20-40%", "40-60%", "60-80%", "top 20%"]);
      return {
        year,
        variant: benchmark.label,
        coverage: pct(coverage(benchmark)),
        "rank-1 strike": pct(winRate(rowsForRankGroup(benchmark, "rank 1"))),
        "top-3 capture": pct(winnerCapture(benchmark, new Set(["rank 1", "rank 2", "rank 3"]))),
        association: number(spearmanAssociation(benchmark)),
        monotonicity: monotonicityLabel(benchmark, winRate),
        "absolute bands": absoluteBandMonotonicity(benchmark, bands),
      };
    });
  }));
  console.log("");
}

function printCarriedWeightDiagnostic(benchmarks: Benchmark[], strongest: Variant) {
  console.log("## Carried-Weight Diagnostic");
  console.log(`Residual proxy for ${strongest.label}: actual finishing position minus expected finishing position from raw-score quintile using 2025 development averages. Negative residual means the runner finished better than its score band's average.`);
  console.log("");
  const development = benchmarkByKey(benchmarks, "2025", `${strongest.key}:raw`);
  const bands = quantileBands([...development.values.values()], ["bottom 20%", "20-40%", "40-60%", "60-80%", "top 20%"]);
  const expectedFinishByBand = new Map(bands.map((band) => {
    const rows = development.rowsWithValue.filter((row) => inBand(development.values.get(row.features.targetRunnerId) ?? NaN, band));
    return [band.label, averageFinish(rows)];
  }));

  printTable(YEARS.flatMap((year) => {
    const benchmark = benchmarkByKey(benchmarks, year, `${strongest.key}:raw`);
    return [
      ...weightRows(benchmark, bands, expectedFinishByBand, "carried weight", (row) => carriedWeightBand(row.features.weightCarriedLbs)),
      ...weightRows(benchmark, bands, expectedFinishByBand, "relative to median", (row) => relativeWeightBand(row, "median")),
      ...weightRows(benchmark, bands, expectedFinishByBand, "relative to top weight", (row) => relativeWeightBand(row, "top")),
    ];
  }));
  console.log("");
}

function printBenchmarkSummary(benchmarks: Benchmark[]) {
  console.log("## Recency-Version Benchmark");
  printTable(VARIANTS.flatMap((variant) => YEARS.map((year) => {
    const benchmark = benchmarkByKey(benchmarks, year, `${variant.key}:raw`);
    const development = benchmarkByKey(benchmarks, "2025", `${variant.key}:raw`);
    const scoreBands = quantileBands([...development.values.values()], ["bottom 20%", "20-40%", "40-60%", "60-80%", "top 20%"]);
    const gapBands = quantileBands(topTwoGaps(benchmarkByKey(benchmarks, "2025", `${variant.key}:relative`)).map((item) => item.gap), ["smallest 25%", "25-50%", "50-75%", "largest 25%"]);
    const relative = benchmarkByKey(benchmarks, year, `${variant.key}:relative`);
    return {
      year,
      version: variant.label,
      coverage: pct(coverage(benchmark)),
      "rank-1 strike": pct(winRate(rowsForRankGroup(benchmark, "rank 1"))),
      "top-2 capture": pct(winnerCapture(benchmark, new Set(["rank 1", "rank 2"]))),
      "top-3 capture": pct(winnerCapture(benchmark, new Set(["rank 1", "rank 2", "rank 3"]))),
      association: number(spearmanAssociation(benchmark)),
      monotonicity: monotonicityLabel(benchmark, winRate),
      "gap calibration": gapCalibrationLabel(relative, gapBands),
      "absolute bands": absoluteBandMonotonicity(benchmark, scoreBands),
    };
  })));
  console.log("");
}

function printTodaysRatingComparison(benchmarks: Benchmark[], strongest: Variant) {
  console.log("## Today's Rating Comparison");
  const todayBenchmarks = YEARS.map((year) => {
    const raw = benchmarkByKey(benchmarks, year, `${strongest.key}:raw`);
    const values = new Map<string, number>();
    for (const row of raw.settledRows) {
      const value = row.features.latestTodaysRating;
      if (value !== null && Number.isFinite(value)) {
        values.set(row.features.targetRunnerId, value);
      }
    }
    return benchmarkFor(year, "Today's Rating", "todaysRating", "raw", raw.settledRows, values);
  });
  const comparisonBenchmarks = [...benchmarks, ...todayBenchmarks];
  printTable(YEARS.flatMap((year) => {
    const candidate = benchmarkByKey(comparisonBenchmarks, year, `${strongest.key}:raw`);
    const today = benchmarkByKey(comparisonBenchmarks, year, "todaysRating");
    return [candidate, today].map((benchmark) => {
      const scoreBands = quantileBands([...benchmarkByKey(comparisonBenchmarks, "2025", benchmark.key).values.values()], ["bottom 20%", "20-40%", "40-60%", "60-80%", "top 20%"]);
      const gapBands = quantileBands(topTwoGaps(benchmarkByKey(comparisonBenchmarks, "2025", benchmark.key)).map((item) => item.gap), ["smallest 25%", "25-50%", "50-75%", "largest 25%"]);
      return {
        year,
        measure: benchmark.label,
        coverage: pct(coverage(benchmark)),
        "rank-1 strike": pct(winRate(rowsForRankGroup(benchmark, "rank 1"))),
        "top-3 capture": pct(winnerCapture(benchmark, new Set(["rank 1", "rank 2", "rank 3"]))),
        association: number(spearmanAssociation(benchmark)),
        "gap calibration": gapCalibrationLabel(benchmark, gapBands),
        "absolute bands": absoluteBandMonotonicity(benchmark, scoreBands),
      };
    });
  }));
  console.log("");
}

function printScaleProposal(benchmarks: Benchmark[], strongest: Variant) {
  console.log("## Candidate Scale Proposal");
  const development = benchmarkByKey(benchmarks, "2025", `${strongest.key}:raw`);
  const holdout = benchmarkByKey(benchmarks, "2026", `${strongest.key}:raw`);
  const bands = quantileBands([...development.values.values()], ["bottom 20%", "20-40%", "40-60%", "60-80%", "top 20%"]);
  const stableEnough =
    absoluteBandMonotonicity(development, bands) === "monotonic increasing" &&
    absoluteBandMonotonicity(holdout, bands) === "monotonic increasing" &&
    (coverage(development) ?? 0) >= 65 &&
    (coverage(holdout) ?? 0) >= 65;
  if (!stableEnough) {
    console.log("No diagnostic absolute points scale proposed. The raw score does not clear the stability standard strongly enough across 2025 and 2026.");
    console.log("");
    return;
  }
  const mean = average([...development.values.values()]);
  const stdev = standardDeviation([...development.values.values()]);
  printTable([
    {
      scale: "Turf Performance Rating - diagnostic scale",
      mapping: "100 + 10 * ((rawScore - developmentMean) / developmentStdev)",
      "development mean": number(mean),
      "development stdev": number(stdev),
      note: "Monotonic transform only; not production logic and not equivalent to Racing Post RPR.",
    },
  ]);
  console.log("");
}

function printConclusion(benchmarks: Benchmark[], strongest: Variant) {
  const rawKey = `${strongest.key}:raw`;
  const adjustedKey = `${strongest.key}:classNormalised`;
  const raw2025 = benchmarkByKey(benchmarks, "2025", rawKey);
  const raw2026 = benchmarkByKey(benchmarks, "2026", rawKey);
  const bands = quantileBands([...raw2025.values.values()], ["bottom 20%", "20-40%", "40-60%", "60-80%", "top 20%"]);
  console.log("## Conclusion");
  printTable([
    { question: "1. Does recency weighting improve Candidate B?", answer: recencyAnswer(benchmarks) },
    { question: "2. Which of B1/B2/B3 is strongest across both years?", answer: strongest.label },
    { question: "3. Does the raw score have meaningful cross-race predictive ordering?", answer: `${absoluteBandMonotonicity(raw2025, bands)} in 2025 and ${absoluteBandMonotonicity(raw2026, bands)} in 2026.` },
    { question: "4. Is the score portable across class, distance and field size?", answer: "Partially. Context tables show useful ordering in most buckets, but raw-score levels shift by class/distance/field-size mix." },
    { question: "5. Does simple class normalisation improve portability?", answer: classNormalisationAnswer(benchmarks, rawKey, adjustedKey) },
    { question: "6. Does carried weight appear to be an important missing adjustment?", answer: "Possibly, but this diagnostic is descriptive only; inspect residual groups before adding any weight adjustment." },
    { question: "7. Is there enough evidence to create a diagnostic absolute Turf Performance Rating scale?", answer: scaleAnswer(raw2025, raw2026, bands) },
    { question: "8. Is the new candidate clearly better than Today's Rating?", answer: todaysAnswer(benchmarks, rawKey) },
    { question: "9. Most important limitation preventing an RPR-style production rating?", answer: "Cross-race portability remains the central limitation: within-race ranking is clean, but absolute raw-score meaning still shifts with race context and missing-history coverage." },
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
    { item: "Trainer/jockey/course/going/draw used", result: "No" },
    { item: "Field-size filtering used", result: "No" },
    { item: "Weight-adjusted future rating built", result: "No" },
  ]);
}

function rankingSummaryRow(benchmark: Benchmark, version: string) {
  return {
    year: benchmark.year,
    version,
    score: benchmark.kind,
    coverage: pct(coverage(benchmark)),
    "rank-1 strike": pct(winRate(rowsForRankGroup(benchmark, "rank 1"))),
    "rank-1 top-3": pct(top3Rate(rowsForRankGroup(benchmark, "rank 1"))),
    "top-2 capture": pct(winnerCapture(benchmark, new Set(["rank 1", "rank 2"]))),
    "top-3 capture": pct(winnerCapture(benchmark, new Set(["rank 1", "rank 2", "rank 3"]))),
    association: number(spearmanAssociation(benchmark)),
    monotonicity: monotonicityLabel(benchmark, winRate),
  };
}

function contextRows(
  benchmark: Benchmark,
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
      const rank1Rows = rows.filter((row) => benchmark.rankGroups.get(row.features.targetRunnerId) === "rank 1");
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
        "mean raw score": number(average(ratedRows.map((row) => benchmark.values.get(row.features.targetRunnerId)).filter(isNumber))),
        "median raw score": number(median(ratedRows.map((row) => benchmark.values.get(row.features.targetRunnerId)).filter(isNumber))),
        "rank-1 strike": pct(winRate(rank1Rows)),
        "top-3 capture": pct(winnersInContext.length === 0 ? null : (top3Winners.length / winnersInContext.length) * 100),
        association: number(spearmanAssociationForRows(benchmark, rows)),
      };
    });
}

function weightRows(
  benchmark: Benchmark,
  bands: Band[],
  expectedFinishByBand: Map<string, number | null>,
  context: string,
  keyFor: (row: HistoricalTargetRunnerMetricsRow) => string,
) {
  const groups = groupBy(benchmark.rowsWithValue, keyFor);
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([bucket, rows]) => {
    const residuals = rows.map((row) => {
      const value = benchmark.values.get(row.features.targetRunnerId);
      const band = bands.find((item) => inBand(value ?? NaN, item));
      const expected = band ? expectedFinishByBand.get(band.label) : null;
      return expected === null || expected === undefined || row.outcome.finishingPosition === null
        ? null
        : row.outcome.finishingPosition - expected;
    }).filter(isNumber);
    return {
      year: benchmark.year,
      context,
      bucket,
      runners: rows.length,
      "mean carried lb": number(average(rows.map((row) => row.features.weightCarriedLbs).filter(isNumber))),
      "mean residual": number(average(residuals)),
      "median residual": number(median(residuals)),
      "rank-1 strike": pct(winRate(rows.filter((row) => benchmark.rankGroups.get(row.features.targetRunnerId) === "rank 1"))),
    };
  });
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

function classStatsFor(context: Context, variantKey: VariantKey) {
  const values = rawValuesFor(context, variantKey);
  const rowsByClass = groupBy(context.settledRows.filter((row) => values.has(row.features.targetRunnerId)), (row) => raceClassBucket(row.features.raceClass));
  const stats = new Map<string, ClassStats>();
  for (const [raceClass, rows] of rowsByClass) {
    const classValues = rows.map((row) => values.get(row.features.targetRunnerId)).filter(isNumber);
    const mean = average(classValues);
    const stdev = standardDeviation(classValues);
    if (mean !== null && stdev !== null && stdev > 0) {
      stats.set(raceClass, { mean, stdev });
    }
  }
  return stats;
}

function strongestVariant(benchmarks: Benchmark[]) {
  return VARIANTS
    .map((variant) => ({
      variant,
      score: YEARS.reduce((total, year) => total + benchmarkScore(benchmarkByKey(benchmarks, year, `${variant.key}:raw`)), 0),
    }))
    .sort((left, right) => right.score - left.score)[0]!.variant;
}

function benchmarkScore(benchmark: Benchmark) {
  return ((spearmanAssociation(benchmark) ?? 0) * 2) +
    ((winnerCapture(benchmark, new Set(["rank 1", "rank 2", "rank 3"])) ?? 0) / 100) +
    ((winRate(rowsForRankGroup(benchmark, "rank 1")) ?? 0) / 100);
}

function absoluteBandMonotonicity(benchmark: Benchmark, bands: Band[]) {
  const rates = bands.map((band) => {
    const rows = benchmark.rowsWithValue.filter((row) => inBand(benchmark.values.get(row.features.targetRunnerId) ?? NaN, band));
    return winRate(rows);
  });
  return trendLabel(rates);
}

function gapCalibrationLabel(benchmark: Benchmark, bands: Band[]) {
  const gaps = topTwoGaps(benchmark);
  const rates = bands.map((band) => {
    const rows = gaps.filter((item) => inBand(item.gap, band)).map((item) => item.topRow);
    return winRate(rows);
  });
  return trendLabel(rates);
}

function monotonicityLabel(benchmark: Benchmark, rateFor: (rows: HistoricalTargetRunnerMetricsRow[]) => number | null) {
  return trendLabel((["rank 1", "rank 2", "rank 3", "rank 4+"] satisfies RankGroup[]).map((group) => rateFor(rowsForRankGroup(benchmark, group))));
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

function quantileBands(values: number[], labels: string[]) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
  if (sorted.length === 0) return [{ label: labels[0] ?? "all", min: -Infinity, max: Infinity }];
  const bands: Band[] = [];
  for (let index = 0; index < labels.length; index += 1) {
    bands.push({
      label: labels[index]!,
      min: index === 0 ? -Infinity : quantile(sorted, index / labels.length),
      max: index === labels.length - 1 ? Infinity : quantile(sorted, (index + 1) / labels.length),
    });
  }
  return bands;
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

function bandRange(band: Band) {
  const min = band.min === -Infinity ? "-inf" : band.min.toFixed(3);
  const max = band.max === Infinity ? "inf" : band.max.toFixed(3);
  return `${min} to ${max}`;
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

function percentileScoresByRace(
  rows: HistoricalTargetRunnerMetricsRow[],
  valueFor: (row: HistoricalTargetRunnerMetricsRow) => number | null,
) {
  const result = new Map<string, number>();
  const ranks = rankRowsByMeasure(rows, valueFor);
  const rowsByRace = groupBy(rows, (row) => row.features.targetRaceId);
  for (const raceRows of rowsByRace.values()) {
    const raceRunnerIds = new Set(raceRows.map((row) => row.features.targetRunnerId));
    const rankedCount = [...ranks.keys()].filter((runnerId) => raceRunnerIds.has(runnerId)).length;
    for (const row of raceRows) {
      const rank = ranks.get(row.features.targetRunnerId);
      if (rank !== undefined) {
        result.set(row.features.targetRunnerId, rankedCount <= 1 ? 1 : (rankedCount - rank) / (rankedCount - 1));
      }
    }
  }
  return result;
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

function benchmarkByKey(benchmarks: Benchmark[], year: Year, key: string) {
  const benchmark = benchmarks.find((item) => item.year === year && item.key === key);
  if (!benchmark) throw new Error(`Missing benchmark ${key} ${year}`);
  return benchmark;
}

function recencyAnswer(benchmarks: Benchmark[]) {
  return YEARS.map((year) => {
    const rows = VARIANTS.map((variant) => ({
      variant,
      association: spearmanAssociation(benchmarkByKey(benchmarks, year, `${variant.key}:raw`)) ?? -Infinity,
    })).sort((left, right) => right.association - left.association);
    return `${year}: ${rows[0]!.variant.label} has the highest association (${number(rows[0]!.association)})`;
  }).join("; ");
}

function classNormalisationAnswer(benchmarks: Benchmark[], rawKey: string, adjustedKey: string) {
  return YEARS.map((year) => {
    const raw = benchmarkByKey(benchmarks, year, rawKey);
    const adjusted = benchmarkByKey(benchmarks, year, adjustedKey);
    return `${year}: association ${number(spearmanAssociation(raw))} raw vs ${number(spearmanAssociation(adjusted))} class-normalised`;
  }).join("; ");
}

function scaleAnswer(raw2025: Benchmark, raw2026: Benchmark, bands: Band[]) {
  const passes = absoluteBandMonotonicity(raw2025, bands) === "monotonic increasing" &&
    absoluteBandMonotonicity(raw2026, bands) === "monotonic increasing" &&
    (coverage(raw2025) ?? 0) >= 65 &&
    (coverage(raw2026) ?? 0) >= 65;
  return passes
    ? "Yes, enough for a diagnostic-only monotonic points-scale experiment, not production."
    : "No, not yet; cross-year absolute calibration is not strong enough.";
}

function todaysAnswer(benchmarks: Benchmark[], rawKey: string) {
  return YEARS.map((year) => {
    const candidate = benchmarkByKey(benchmarks, year, rawKey);
    const values = new Map<string, number>();
    for (const row of candidate.settledRows) {
      if (row.features.latestTodaysRating !== null) {
        values.set(row.features.targetRunnerId, row.features.latestTodaysRating);
      }
    }
    const today = benchmarkFor(year, "Today's Rating", "todaysRating", "raw", candidate.settledRows, values);
    return `${year}: association ${number(spearmanAssociation(candidate))} vs Today's ${number(spearmanAssociation(today))}; top-3 capture ${pct(winnerCapture(candidate, new Set(["rank 1", "rank 2", "rank 3"])))} vs ${pct(winnerCapture(today, new Set(["rank 1", "rank 2", "rank 3"])))}`;
  }).join("; ");
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

function carriedWeightBand(value: number | null) {
  if (value === null) return "unknown";
  if (value <= 126) return "<=9st0";
  if (value <= 133) return "9st1-9st7";
  if (value <= 140) return "9st8-10st0";
  return ">10st0";
}

function relativeWeightBand(row: HistoricalTargetRunnerMetricsRow, reference: "median" | "top") {
  const raceWeights = rowCacheByRace.get(row.features.targetRaceId)
    ?.map((raceRow) => raceRow.features.weightCarriedLbs)
    .filter(isNumber) ?? [];
  if (row.features.weightCarriedLbs === null || raceWeights.length === 0) return "unknown";
  const baseline = reference === "median" ? median(raceWeights) : Math.max(...raceWeights);
  if (baseline === null) return "unknown";
  const diff = row.features.weightCarriedLbs - baseline;
  if (diff <= -7) return "<= -7lb";
  if (diff <= -1) return "-6 to -1lb";
  if (diff === 0) return "level";
  if (diff <= 6) return "+1 to +6lb";
  return ">= +7lb";
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
