import {
  deriveBacktestFeatureValues,
} from "@/lib/racing/backtest";
import { loadLatestBacktestFeatureCacheForYear } from "@/lib/racing/backtest-cache";
import type { HistoricalTargetRunnerMetricsRow } from "@/lib/racing/historical-target-metrics";
import { raceClassNumber } from "@/lib/racing/research-rule-classes";

type Year = "2025" | "2026";
type RankGroup = "rank 1" | "rank 2" | "rank 3" | "rank 4+" | "missing";
type MeasureKind = "individual" | "composite";

type Measure = {
  key: string;
  label: string;
  kind: MeasureKind;
  valueFor: (row: HistoricalTargetRunnerMetricsRow, scores?: CompositeScores) => number | null;
};

type Context = {
  year: Year;
  rows: HistoricalTargetRunnerMetricsRow[];
  settledRows: HistoricalTargetRunnerMetricsRow[];
  compositeScores: CompositeScores;
};

type CompositeScores = Map<string, Map<string, number>>;

type Benchmark = {
  year: Year;
  measure: Measure;
  ranks: Map<string, number>;
  rankGroups: Map<string, RankGroup>;
  values: Map<string, number>;
  rowsWithValue: HistoricalTargetRunnerMetricsRow[];
  settledRows: HistoricalTargetRunnerMetricsRow[];
};

type RankGroupSummary = {
  group: RankGroup;
  rows: HistoricalTargetRunnerMetricsRow[];
};

const YEARS: Year[] = ["2025", "2026"];
const RANK_GROUPS: RankGroup[] = ["rank 1", "rank 2", "rank 3", "rank 4+", "missing"];

const INDIVIDUAL_MEASURES: Measure[] = [
  { key: "latestTodaysRating", label: "Today's Rating", kind: "individual", valueFor: (row) => row.features.latestTodaysRating },
  { key: "latestPerformanceRating", label: "Latest RPR / performance", kind: "individual", valueFor: (row) => row.features.latestPerformanceRating },
  { key: "latestSpeedRating", label: "Latest Topspeed / speed", kind: "individual", valueFor: (row) => row.features.latestSpeedRating },
  { key: "bestPerformanceLast3", label: "Best RPR last 3", kind: "individual", valueFor: (row) => row.features.bestPerformanceLast3 },
  { key: "averagePerformanceLast3", label: "Average RPR last 3", kind: "individual", valueFor: (row) => row.features.averagePerformanceLast3 },
  { key: "bestSpeedLast3", label: "Best Topspeed last 3", kind: "individual", valueFor: (row) => row.features.bestSpeedLast3 },
  { key: "averageSpeedLast3", label: "Average Topspeed last 3", kind: "individual", valueFor: (row) => row.features.averageSpeedLast3 },
  { key: "officialRating", label: "Official rating", kind: "individual", valueFor: (row) => row.features.officialRating },
  { key: "latestPerformanceMinusOR", label: "Latest RPR minus OR", kind: "individual", valueFor: (row) => deriveBacktestFeatureValues(row.features).latestPerformanceMinusOR },
  { key: "bestPerformanceL3MinusOR", label: "Best L3 RPR minus OR", kind: "individual", valueFor: (row) => deriveBacktestFeatureValues(row.features).bestPerformanceL3MinusOR },
  { key: "latestTodaysRatingMinusOR", label: "Today's Rating minus OR", kind: "individual", valueFor: (row) => deriveBacktestFeatureValues(row.features).latestTodaysRatingMinusOR },
];

const COMPOSITES: Measure[] = [
  { key: "compositeA", label: "Composite A - recent peak", kind: "composite", valueFor: (_row, scores) => scores?.get("compositeA")?.get(_row.features.targetRunnerId) ?? null },
  { key: "compositeB", label: "Composite B - recent level", kind: "composite", valueFor: (_row, scores) => scores?.get("compositeB")?.get(_row.features.targetRunnerId) ?? null },
  { key: "compositeC", label: "Composite C - peak + official ability", kind: "composite", valueFor: (_row, scores) => scores?.get("compositeC")?.get(_row.features.targetRunnerId) ?? null },
  { key: "compositeD", label: "Composite D - current + peak", kind: "composite", valueFor: (_row, scores) => scores?.get("compositeD")?.get(_row.features.targetRunnerId) ?? null },
];

async function main() {
  console.log("# Turf Rating Benchmark");
  console.log("");
  console.log("Diagnostic only. Flat Turf 2025 development and 2026 holdout. No Research, Today, saved/frozen rules, UI, cache schema/generation, or holdout behavior changed.");
  console.log("");
  console.log("Tie convention: within each race, higher values rank better. Equal values share a competition rank, so ranks can skip after ties. Missing values are kept in a separate missing group.");
  console.log("");
  console.log("Composite normalisation: each component is converted within-race to rank percentile, where rank 1 = 1.0 and the lowest ranked available runner = 0.0. Composite score is the equal-weight average of required component percentiles; all required components must be available.");
  console.log("");
  console.log("Association convention: Spearman-style rank association is positive when higher pre-race ratings correspond to better finishing positions. It is calculated from global ranks of rating value and negative finishing position across runners with both values.");
  console.log("");

  const contexts = await loadContexts();
  const measures = [...INDIVIDUAL_MEASURES, ...COMPOSITES];
  const benchmarks = contexts.flatMap((context) =>
    measures.map((measure) => benchmarkFor(context, measure))
  );

  printDatasetCoverage(contexts);
  printIndividualBenchmarks(benchmarks);
  printRankSeparation(benchmarks);
  printRankAssociation(benchmarks);
  printTodaysRatingComparison(benchmarks);
  printStabilityContexts(contexts, benchmarks);
  printCompositeBenchmarks(benchmarks);
  printValidationSummary(benchmarks);
  printConclusion(benchmarks);
  printGuardrails();
}

async function loadContexts(): Promise<Context[]> {
  const contexts: Context[] = [];
  for (const year of YEARS) {
    const cache = await loadLatestBacktestFeatureCacheForYear({ family: "turf_flat", year });
    const rows = cache
      ? cache.rows
        .filter((row) => row.features.raceCode === "turf")
        .sort(compareRowsChronologically)
      : [];
    const settledRows = rows.filter(isSettledRunner);
    contexts.push({
      year,
      rows,
      settledRows,
      compositeScores: compositeScoresFor(settledRows),
    });
  }
  return contexts;
}

function printDatasetCoverage(contexts: Context[]) {
  console.log("## Dataset And Coverage");
  printTable(contexts.map((context) => ({
    year: context.year,
    "settled races": distinctCount(context.settledRows.map((row) => row.features.targetRaceId)),
    "settled runners": context.settledRows.length,
    "winners": context.settledRows.filter((row) => row.outcome.won === true).length,
    "classification": "Existing cache family turf_flat and row raceCode=turf",
  })));
  console.log("");
}

function printIndividualBenchmarks(benchmarks: Benchmark[]) {
  console.log("## Individual Measure Benchmark");
  printTable(benchmarks
    .filter((benchmark) => benchmark.measure.kind === "individual")
    .map(coreBenchmarkRow));
  console.log("");
}

function printRankSeparation(benchmarks: Benchmark[]) {
  console.log("## Rank Separation");
  printTable(benchmarks.map((benchmark) => {
    const groups = groupSummaries(benchmark);
    const rank1 = summaryForGroup(groups, "rank 1");
    const rank2 = summaryForGroup(groups, "rank 2");
    const rank3Plus = groups
      .filter((group) => group.group === "rank 3" || group.group === "rank 4+")
      .flatMap((group) => group.rows);
    const rank1Win = winRate(rank1.rows);
    const rank2Win = winRate(rank2.rows);
    const rank3PlusWin = winRate(rank3Plus);
    return {
      year: benchmark.year,
      measure: benchmark.measure.label,
      "rank1 - rank2 win": pp(diff(rank1Win, rank2Win)),
      "rank1 - rank3+ win": pp(diff(rank1Win, rank3PlusWin)),
      "top-2 winner capture": pct(winnerCapture(benchmark, new Set(["rank 1", "rank 2"]))),
      "top-3 winner capture": pct(winnerCapture(benchmark, new Set(["rank 1", "rank 2", "rank 3"]))),
      "rank 1 avg finish": number(averageFinish(rank1.rows)),
      "rank 2 avg finish": number(averageFinish(rank2.rows)),
      "rank 3 avg finish": number(averageFinish(summaryForGroup(groups, "rank 3").rows)),
      "rank 4+ avg finish": number(averageFinish(summaryForGroup(groups, "rank 4+").rows)),
    };
  }));
  console.log("");
}

function printRankAssociation(benchmarks: Benchmark[]) {
  console.log("## Rank Correlation / Association");
  printTable(benchmarks.map((benchmark) => ({
    year: benchmark.year,
    measure: benchmark.measure.label,
    "available runners": benchmark.rowsWithValue.length,
    "Spearman-style association": number(spearmanAssociation(benchmark)),
    convention: "positive = higher rating associated with better finishing position",
  })));
  console.log("");
}

function printTodaysRatingComparison(benchmarks: Benchmark[]) {
  console.log("## Today's Rating Comparison");
  for (const year of YEARS) {
    console.log(`### ${year}`);
    const target = benchmarkByKey(benchmarks, year, "latestTodaysRating");
    const comparators = ["bestPerformanceLast3", "bestSpeedLast3", "officialRating"].map((key) => benchmarkByKey(benchmarks, year, key));
    printTable([target, ...comparators].map((benchmark) => ({
      measure: benchmark.measure.label,
      coverage: pct(coverage(benchmark)),
      "rank-1 strike": pct(winRate(rowsForRankGroup(benchmark, "rank 1"))),
      "top-2 capture": pct(winnerCapture(benchmark, new Set(["rank 1", "rank 2"]))),
      "top-3 capture": pct(winnerCapture(benchmark, new Set(["rank 1", "rank 2", "rank 3"]))),
      "winner rank 1": pct(winnerRankShare(benchmark, "rank 1")),
      "winner rank 2": pct(winnerRankShare(benchmark, "rank 2")),
      "winner rank 3": pct(winnerRankShare(benchmark, "rank 3")),
      "winner rank 4+": pct(winnerRankShare(benchmark, "rank 4+")),
      "winner missing": pct(winnerRankShare(benchmark, "missing")),
      "rank1-rank2": pp(diff(winRate(rowsForRankGroup(benchmark, "rank 1")), winRate(rowsForRankGroup(benchmark, "rank 2")))),
      association: number(spearmanAssociation(benchmark)),
      verdict: benchmark.measure.key === target.measure.key ? "reference" : todaysVerdict(target, benchmark),
    })));
    console.log("");
  }
}

function printStabilityContexts(contexts: Context[], benchmarks: Benchmark[]) {
  console.log("## Class / Distance / Field-Size Stability");
  const strongKeys = strongestMeasureKeys(benchmarks);
  for (const key of strongKeys) {
    const measure = [...INDIVIDUAL_MEASURES, ...COMPOSITES].find((item) => item.key === key)!;
    console.log(`### ${measure.label}`);
    printTable(contexts.flatMap((context) => {
      const benchmark = benchmarkByKey(benchmarks, context.year, key);
      return [
        ...contextRows(benchmark, "race class", (row) => raceClassBucket(row.features.raceClass), raceClassOrder),
        ...contextRows(benchmark, "distance", (row) => distanceBand(row.features.distanceYards), distanceOrder),
        ...contextRows(benchmark, "field size", (row) => fieldSizeBand(fieldSizeForRow(row)), fieldSizeOrder),
      ];
    }));
    console.log("");
  }
}

function printCompositeBenchmarks(benchmarks: Benchmark[]) {
  console.log("## Candidate Composites");
  printTable(benchmarks
    .filter((benchmark) => benchmark.measure.kind === "composite")
    .map(coreBenchmarkRow));
  console.log("");

  console.log("### Composite Vs Best Individual");
  printTable(YEARS.flatMap((year) => {
    const bestIndividual = bestIndividualBenchmark(benchmarks, year);
    return COMPOSITES.map((composite) => {
      const benchmark = benchmarkByKey(benchmarks, year, composite.key);
      return {
        year,
        composite: benchmark.measure.label,
        "best individual": bestIndividual.measure.label,
        "composite rank-1 strike": pct(winRate(rowsForRankGroup(benchmark, "rank 1"))),
        "best rank-1 strike": pct(winRate(rowsForRankGroup(bestIndividual, "rank 1"))),
        "composite top-3 capture": pct(winnerCapture(benchmark, new Set(["rank 1", "rank 2", "rank 3"]))),
        "best top-3 capture": pct(winnerCapture(bestIndividual, new Set(["rank 1", "rank 2", "rank 3"]))),
        "composite association": number(spearmanAssociation(benchmark)),
        "best association": number(spearmanAssociation(bestIndividual)),
      };
    });
  }));
  console.log("");
}

function printValidationSummary(benchmarks: Benchmark[]) {
  console.log("## 2025 Vs 2026 Validation");
  printTable([...INDIVIDUAL_MEASURES, ...COMPOSITES].map((measure) => {
    const b2025 = benchmarkByKey(benchmarks, "2025", measure.key);
    const b2026 = benchmarkByKey(benchmarks, "2026", measure.key);
    return {
      measure: measure.label,
      kind: measure.kind,
      "2025 coverage": pct(coverage(b2025)),
      "2025 rank-1 strike": pct(winRate(rowsForRankGroup(b2025, "rank 1"))),
      "2025 top-3 capture": pct(winnerCapture(b2025, new Set(["rank 1", "rank 2", "rank 3"]))),
      "2025 association": number(spearmanAssociation(b2025)),
      "2026 coverage": pct(coverage(b2026)),
      "2026 rank-1 strike": pct(winRate(rowsForRankGroup(b2026, "rank 1"))),
      "2026 top-3 capture": pct(winnerCapture(b2026, new Set(["rank 1", "rank 2", "rank 3"]))),
      "2026 association": number(spearmanAssociation(b2026)),
      stability: stabilityLabel(b2025, b2026),
    };
  }));
  console.log("");
}

function printConclusion(benchmarks: Benchmark[]) {
  console.log("## Conclusion");
  printTable([
    { question: "1. Which existing Turf measure best predicts future race performance?", answer: bestExistingAnswer(benchmarks) },
    { question: "2. How does Today's Rating compare with RPR, Topspeed and official rating?", answer: todaysComparisonAnswer(benchmarks) },
    { question: "3. Does Best L3 outperform latest-run measures?", answer: bestL3Answer(benchmarks) },
    { question: "4. Are averages more stable than peak measures?", answer: averagesAnswer(benchmarks) },
    { question: "5. Does any simple composite outperform the best individual measure in both years?", answer: compositeAnswer(benchmarks) },
    { question: "6. Is improvement broad across classes/distances/field sizes?", answer: broadnessAnswer(benchmarks) },
    { question: "7. One composite worth second-stage development?", answer: secondStageAnswer(benchmarks) },
    { question: "8. Main limitation if no clear winner?", answer: "Coverage and missing-history effects remain material; several measures identify similar horses, so simple equal-weight composites do not create a large independent gain." },
  ]);
  console.log("");
}

function printGuardrails() {
  console.log("## Guardrails");
  printTable([
    { item: "Production Research/Today/saved rules changed", result: "No" },
    { item: "Cache schema/generation changed", result: "No" },
    { item: "ROI or market-price optimisation", result: "No" },
    { item: "Trainer/field-size/days-since-run included in rating", result: "No" },
    { item: "Composite weight search", result: "No" },
  ]);
}

function benchmarkFor(context: Context, measure: Measure): Benchmark {
  const values = new Map<string, number>();
  for (const row of context.settledRows) {
    const value = measure.valueFor(row, context.compositeScores);
    if (value !== null && Number.isFinite(value)) {
      values.set(row.features.targetRunnerId, value);
    }
  }
  const ranks = rankRowsByMeasure(context.settledRows, (row) => values.get(row.features.targetRunnerId) ?? null);
  const rankGroups = new Map<string, RankGroup>();
  for (const row of context.settledRows) {
    rankGroups.set(row.features.targetRunnerId, rankGroup(ranks.get(row.features.targetRunnerId) ?? null));
  }
  return {
    year: context.year,
    measure,
    ranks,
    rankGroups,
    values,
    rowsWithValue: context.settledRows.filter((row) => values.has(row.features.targetRunnerId)),
    settledRows: context.settledRows,
  };
}

function compositeScoresFor(rows: HistoricalTargetRunnerMetricsRow[]): CompositeScores {
  const scores: CompositeScores = new Map(COMPOSITES.map((composite) => [composite.key, new Map<string, number>()]));
  addComposite(scores, "compositeA", rows, [
    (row) => row.features.bestPerformanceLast3,
    (row) => row.features.bestSpeedLast3,
  ]);
  addComposite(scores, "compositeB", rows, [
    (row) => row.features.averagePerformanceLast3,
    (row) => row.features.averageSpeedLast3,
  ]);
  addComposite(scores, "compositeC", rows, [
    (row) => row.features.bestPerformanceLast3,
    (row) => row.features.bestSpeedLast3,
    (row) => row.features.officialRating,
  ]);
  addComposite(scores, "compositeD", rows, [
    (row) => row.features.latestTodaysRating,
    (row) => row.features.bestPerformanceLast3,
    (row) => row.features.bestSpeedLast3,
  ]);
  return scores;
}

function addComposite(
  scores: CompositeScores,
  key: string,
  rows: HistoricalTargetRunnerMetricsRow[],
  components: Array<(row: HistoricalTargetRunnerMetricsRow) => number | null>,
) {
  const componentScores = components.map((component) => percentileScoresByRace(rows, component));
  const target = scores.get(key)!;
  for (const row of rows) {
    const values = componentScores.map((score) => score.get(row.features.targetRunnerId));
    if (values.every((value): value is number => value !== undefined)) {
      target.set(row.features.targetRunnerId, average(values as number[]) ?? 0);
    }
  }
}

function percentileScoresByRace(
  rows: HistoricalTargetRunnerMetricsRow[],
  valueFor: (row: HistoricalTargetRunnerMetricsRow) => number | null,
) {
  const result = new Map<string, number>();
  const rowsByRace = groupBy(rows, (row) => row.features.targetRaceId);
  for (const raceRows of rowsByRace.values()) {
    const ranks = rankRowsByMeasure(raceRows, valueFor);
    const rankedCount = ranks.size;
    for (const [runnerId, rank] of ranks) {
      result.set(runnerId, rankedCount <= 1 ? 1 : (rankedCount - rank) / (rankedCount - 1));
    }
  }
  return result;
}

function rankRowsByMeasure(
  rows: HistoricalTargetRunnerMetricsRow[],
  valueFor: (row: HistoricalTargetRunnerMetricsRow) => number | null,
) {
  const rowsByRace = groupBy(rows, (row) => row.features.targetRaceId);
  const ranks = new Map<string, number>();
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

function coreBenchmarkRow(benchmark: Benchmark) {
  return {
    year: benchmark.year,
    measure: benchmark.measure.label,
    "eligible races": distinctCount(benchmark.settledRows.map((row) => row.features.targetRaceId)),
    "available runners": benchmark.rowsWithValue.length,
    coverage: pct(coverage(benchmark)),
    "rank-1 runners": rowsForRankGroup(benchmark, "rank 1").length,
    "rank-1 winners": winners(rowsForRankGroup(benchmark, "rank 1")),
    "rank-1 win": pct(winRate(rowsForRankGroup(benchmark, "rank 1"))),
    "rank-1 top-3": pct(top3Rate(rowsForRankGroup(benchmark, "rank 1"))),
    "rank-2 win": pct(winRate(rowsForRankGroup(benchmark, "rank 2"))),
    "rank-3 win": pct(winRate(rowsForRankGroup(benchmark, "rank 3"))),
    "rank-4+ win": pct(winRate(rowsForRankGroup(benchmark, "rank 4+"))),
    "winners rank 1": pct(winnerRankShare(benchmark, "rank 1")),
    "winners rank 2": pct(winnerRankShare(benchmark, "rank 2")),
    "winners rank 3": pct(winnerRankShare(benchmark, "rank 3")),
    "winners rank 4+": pct(winnerRankShare(benchmark, "rank 4+")),
    "winners missing": pct(winnerRankShare(benchmark, "missing")),
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
      const rank1Rows = rows.filter((row) => benchmark.rankGroups.get(row.features.targetRunnerId) === "rank 1");
      const winnersInContext = rows.filter((row) => row.outcome.won === true);
      const top3Winners = winnersInContext.filter((row) => {
        const group = benchmark.rankGroups.get(row.features.targetRunnerId);
        return group === "rank 1" || group === "rank 2" || group === "rank 3";
      });
      return {
        year: benchmark.year,
        measure: benchmark.measure.label,
        context: contextType,
        bucket: key,
        "settled runners": rows.length,
        "rank-1 runners": rank1Rows.length,
        "rank-1 strike": pct(winRate(rank1Rows)),
        "top-3 capture": pct(winnersInContext.length === 0 ? null : (top3Winners.length / winnersInContext.length) * 100),
      };
    });
}

function groupSummaries(benchmark: Benchmark): RankGroupSummary[] {
  return RANK_GROUPS.map((group) => ({
    group,
    rows: rowsForRankGroup(benchmark, group),
  }));
}

function summaryForGroup(groups: RankGroupSummary[], group: RankGroup) {
  return groups.find((item) => item.group === group) ?? { group, rows: [] };
}

function rowsForRankGroup(benchmark: Benchmark, group: RankGroup) {
  return benchmark.settledRows.filter((row) => benchmark.rankGroups.get(row.features.targetRunnerId) === group);
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

function winnerRankShare(benchmark: Benchmark, group: RankGroup) {
  const winnersInBenchmark = benchmark.settledRows.filter((row) => row.outcome.won === true);
  if (winnersInBenchmark.length === 0) return null;
  return (winnersInBenchmark.filter((row) => benchmark.rankGroups.get(row.features.targetRunnerId) === group).length / winnersInBenchmark.length) * 100;
}

function winnerCapture(benchmark: Benchmark, groups: Set<RankGroup>) {
  const winnersInBenchmark = benchmark.settledRows.filter((row) => row.outcome.won === true);
  if (winnersInBenchmark.length === 0) return null;
  return (winnersInBenchmark.filter((row) => groups.has(benchmark.rankGroups.get(row.features.targetRunnerId) ?? "missing")).length / winnersInBenchmark.length) * 100;
}

function coverage(benchmark: Benchmark) {
  return benchmark.settledRows.length === 0 ? null : (benchmark.rowsWithValue.length / benchmark.settledRows.length) * 100;
}

function averageFinish(rows: HistoricalTargetRunnerMetricsRow[]) {
  return average(rows.map((row) => row.outcome.finishingPosition).filter(isNumber));
}

function spearmanAssociation(benchmark: Benchmark) {
  const entries = benchmark.rowsWithValue
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
  const benchmark = benchmarks.find((item) => item.year === year && item.measure.key === key);
  if (!benchmark) throw new Error(`Missing benchmark ${key} ${year}`);
  return benchmark;
}

function bestIndividualBenchmark(benchmarks: Benchmark[], year: Year) {
  return benchmarks
    .filter((benchmark) => benchmark.year === year && benchmark.measure.kind === "individual")
    .sort(compareBenchmarkQuality)[0]!;
}

function compareBenchmarkQuality(left: Benchmark, right: Benchmark) {
  return (spearmanAssociation(right) ?? -Infinity) - (spearmanAssociation(left) ?? -Infinity) ||
    (winnerCapture(right, new Set(["rank 1", "rank 2", "rank 3"])) ?? -Infinity) -
      (winnerCapture(left, new Set(["rank 1", "rank 2", "rank 3"])) ?? -Infinity) ||
    (winRate(rowsForRankGroup(right, "rank 1")) ?? -Infinity) -
      (winRate(rowsForRankGroup(left, "rank 1")) ?? -Infinity);
}

function todaysVerdict(today: Benchmark, comparator: Benchmark) {
  const todayScore = benchmarkScore(today);
  const comparatorScore = benchmarkScore(comparator);
  if (todayScore > comparatorScore + 0.03) return "Today's stronger";
  if (todayScore < comparatorScore - 0.03) return "Today's weaker";
  return "roughly equivalent";
}

function benchmarkScore(benchmark: Benchmark) {
  return ((spearmanAssociation(benchmark) ?? 0) * 2) +
    ((winnerCapture(benchmark, new Set(["rank 1", "rank 2", "rank 3"])) ?? 0) / 100) +
    ((winRate(rowsForRankGroup(benchmark, "rank 1")) ?? 0) / 100);
}

function strongestMeasureKeys(benchmarks: Benchmark[]) {
  const keys = new Set<string>();
  for (const year of YEARS) {
    keys.add(bestIndividualBenchmark(benchmarks, year).measure.key);
  }
  keys.add("latestTodaysRating");
  keys.add("bestPerformanceLast3");
  keys.add("bestSpeedLast3");
  return [...keys];
}

function stabilityLabel(left: Benchmark, right: Benchmark) {
  const leftAssociation = spearmanAssociation(left) ?? -Infinity;
  const rightAssociation = spearmanAssociation(right) ?? -Infinity;
  const leftCapture = winnerCapture(left, new Set(["rank 1", "rank 2", "rank 3"])) ?? -Infinity;
  const rightCapture = winnerCapture(right, new Set(["rank 1", "rank 2", "rank 3"])) ?? -Infinity;
  if (leftAssociation > 0.15 && rightAssociation > 0.15 && leftCapture > 45 && rightCapture > 45) return "stable";
  if (leftAssociation > 0.1 && rightAssociation > 0.1) return "partial";
  return "weak/mixed";
}

function bestExistingAnswer(benchmarks: Benchmark[]) {
  return YEARS.map((year) => {
    const best = bestIndividualBenchmark(benchmarks, year);
    return `${year}: ${best.measure.label} (association ${number(spearmanAssociation(best))}, top-3 capture ${pct(winnerCapture(best, new Set(["rank 1", "rank 2", "rank 3"])))})`;
  }).join("; ");
}

function todaysComparisonAnswer(benchmarks: Benchmark[]) {
  return YEARS.map((year) => {
    const today = benchmarkByKey(benchmarks, year, "latestTodaysRating");
    const parts = ["bestPerformanceLast3", "bestSpeedLast3", "officialRating"].map((key) => {
      const comparator = benchmarkByKey(benchmarks, year, key);
      return `${comparator.measure.label}: ${todaysVerdict(today, comparator)}`;
    });
    return `${year}: ${parts.join(", ")}`;
  }).join("; ");
}

function bestL3Answer(benchmarks: Benchmark[]) {
  return YEARS.map((year) => {
    const latestRpr = benchmarkByKey(benchmarks, year, "latestPerformanceRating");
    const bestRpr = benchmarkByKey(benchmarks, year, "bestPerformanceLast3");
    const latestSpeed = benchmarkByKey(benchmarks, year, "latestSpeedRating");
    const bestSpeed = benchmarkByKey(benchmarks, year, "bestSpeedLast3");
    return `${year}: RPR L3 ${number(spearmanAssociation(bestRpr))} vs latest ${number(spearmanAssociation(latestRpr))}; Topspeed L3 ${number(spearmanAssociation(bestSpeed))} vs latest ${number(spearmanAssociation(latestSpeed))}`;
  }).join("; ");
}

function averagesAnswer(benchmarks: Benchmark[]) {
  return YEARS.map((year) => {
    const avgRpr = benchmarkByKey(benchmarks, year, "averagePerformanceLast3");
    const bestRpr = benchmarkByKey(benchmarks, year, "bestPerformanceLast3");
    const avgSpeed = benchmarkByKey(benchmarks, year, "averageSpeedLast3");
    const bestSpeed = benchmarkByKey(benchmarks, year, "bestSpeedLast3");
    return `${year}: avg RPR ${number(spearmanAssociation(avgRpr))} vs best RPR ${number(spearmanAssociation(bestRpr))}; avg speed ${number(spearmanAssociation(avgSpeed))} vs best speed ${number(spearmanAssociation(bestSpeed))}`;
  }).join("; ");
}

function compositeAnswer(benchmarks: Benchmark[]) {
  const candidates = COMPOSITES.filter((composite) => YEARS.every((year) => {
    const benchmark = benchmarkByKey(benchmarks, year, composite.key);
    const best = bestIndividualBenchmark(benchmarks, year);
    return benchmarkScore(benchmark) >= benchmarkScore(best) * 0.95;
  }));
  return candidates.length
    ? `${candidates.map((candidate) => candidate.label).join("; ")} broadly matches the best individual benchmarks in both years.`
    : "No simple composite clearly outperforms or robustly matches the best individual measure in both years.";
}

function broadnessAnswer(benchmarks: Benchmark[]) {
  const candidate = COMPOSITES.find((composite) => YEARS.every((year) => {
    const benchmark = benchmarkByKey(benchmarks, year, composite.key);
    const best = bestIndividualBenchmark(benchmarks, year);
    return benchmarkScore(benchmark) >= benchmarkScore(best) * 0.95;
  }));
  return candidate
    ? `${candidate.label} is the broadest composite candidate, but review context tables before promoting because coverage and field-size/class mix still matter.`
    : "No composite improvement is strong enough to assess as broad; individual measures remain the anchor.";
}

function secondStageAnswer(benchmarks: Benchmark[]) {
  const composites = COMPOSITES.map((composite) => ({
    composite,
    score: YEARS.reduce((total, year) => total + benchmarkScore(benchmarkByKey(benchmarks, year, composite.key)), 0),
  })).sort((left, right) => right.score - left.score);
  const best = composites[0]!;
  const qualifies = YEARS.every((year) => {
    const benchmark = benchmarkByKey(benchmarks, year, best.composite.key);
    const bestIndividual = bestIndividualBenchmark(benchmarks, year);
    return benchmarkScore(benchmark) >= benchmarkScore(bestIndividual) * 0.95;
  });
  return qualifies
    ? `${best.composite.label} is worth a second-stage diagnostic, but not production exposure.`
    : "No. The simple composites do not beat the strongest existing measures robustly enough.";
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

function diff(left: number | null, right: number | null) {
  return left === null || right === null ? null : left - right;
}

function distinctCount(values: string[]) {
  return new Set(values).size;
}

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

function isNumber(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
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
