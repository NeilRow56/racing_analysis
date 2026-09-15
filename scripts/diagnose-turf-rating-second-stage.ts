import { loadLatestBacktestFeatureCacheForYear } from "@/lib/racing/backtest-cache";
import type { HistoricalTargetRunnerMetricsRow } from "@/lib/racing/historical-target-metrics";
import { raceClassNumber } from "@/lib/racing/research-rule-classes";

type Year = "2025" | "2026";
type RankGroup = "rank 1" | "rank 2" | "rank 3" | "rank 4+" | "missing";
type CandidateKey = "candidateA" | "candidateB" | "candidateC" | "candidateD";

type Component = {
  key: string;
  label: string;
  valueFor: (row: HistoricalTargetRunnerMetricsRow) => number | null;
};

type Measure = {
  key: string;
  label: string;
  components?: Component[];
  valueFor?: (row: HistoricalTargetRunnerMetricsRow) => number | null;
};

type Context = {
  year: Year;
  settledRows: HistoricalTargetRunnerMetricsRow[];
  candidateValues: Map<string, Map<string, number>>;
};

type Benchmark = {
  year: Year;
  measure: Measure;
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

const YEARS: Year[] = ["2025", "2026"];
const RANK_GROUPS: RankGroup[] = ["rank 1", "rank 2", "rank 3", "rank 4+", "missing"];
const CANDIDATE_KEYS: CandidateKey[] = ["candidateA", "candidateB", "candidateC", "candidateD"];

const COMPONENTS = {
  bestRprL3: { key: "bestRprL3", label: "Best RPR last 3", valueFor: (row) => row.features.bestPerformanceLast3 },
  bestSpeedL3: { key: "bestSpeedL3", label: "Best Topspeed last 3", valueFor: (row) => row.features.bestSpeedLast3 },
  averageRprL3: { key: "averageRprL3", label: "Average RPR last 3", valueFor: (row) => row.features.averagePerformanceLast3 },
  averageSpeedL3: { key: "averageSpeedL3", label: "Average Topspeed last 3", valueFor: (row) => row.features.averageSpeedLast3 },
  latestRpr: { key: "latestRpr", label: "Latest RPR", valueFor: (row) => row.features.latestPerformanceRating },
  latestSpeed: { key: "latestSpeed", label: "Latest Topspeed", valueFor: (row) => row.features.latestSpeedRating },
  officialRating: { key: "officialRating", label: "Official Rating", valueFor: (row) => row.features.officialRating },
} satisfies Record<string, Component>;

const CANDIDATES: Measure[] = [
  {
    key: "candidateA",
    label: "Candidate A - recent peak",
    components: [COMPONENTS.bestRprL3, COMPONENTS.bestSpeedL3],
  },
  {
    key: "candidateB",
    label: "Candidate B - recent level",
    components: [COMPONENTS.averageRprL3, COMPONENTS.averageSpeedL3],
  },
  {
    key: "candidateC",
    label: "Candidate C - recent level + latest",
    components: [COMPONENTS.averageRprL3, COMPONENTS.averageSpeedL3, COMPONENTS.latestRpr, COMPONENTS.latestSpeed],
  },
  {
    key: "candidateD",
    label: "Candidate D - peak + official ability",
    components: [COMPONENTS.bestRprL3, COMPONENTS.bestSpeedL3, COMPONENTS.officialRating],
  },
];

const COMPARISON_MEASURES: Measure[] = [
  { key: "latestTodaysRating", label: "Today's Rating", valueFor: (row) => row.features.latestTodaysRating },
  { key: "averageSpeedLast3", label: "Average Topspeed last 3", valueFor: (row) => row.features.averageSpeedLast3 },
  { key: "averagePerformanceLast3", label: "Average RPR last 3", valueFor: (row) => row.features.averagePerformanceLast3 },
  { key: "bestPerformanceLast3", label: "Best RPR last 3", valueFor: (row) => row.features.bestPerformanceLast3 },
  { key: "bestSpeedLast3", label: "Best Topspeed last 3", valueFor: (row) => row.features.bestSpeedLast3 },
  { key: "officialRating", label: "Official Rating", valueFor: (row) => row.features.officialRating },
];

async function main() {
  console.log("# Turf Rating Second-Stage Diagnostic");
  console.log("");
  console.log("Diagnostic only. Scope is Flat Turf, 2025 development and 2026 holdout. No Research, Today, saved/frozen rules, UI, cache schemas, cache generation, or holdout behavior changed.");
  console.log("");
  console.log("No market price, SP, trainer form, field-size filtering, or betting ROI was used as an input or optimisation target.");
  console.log("");

  const contexts = await loadContexts();
  const benchmarks = contexts.flatMap((context) => [...CANDIDATES, ...COMPARISON_MEASURES].map((measure) => benchmarkFor(context, measure)));
  const strongestCandidates = strongestCandidateKeys(benchmarks);

  printDefinitions();
  printCoverage(benchmarks);
  printCoreRanking(benchmarks.filter((benchmark) => isCandidate(benchmark.measure.key)));
  printMonotonicity(benchmarks.filter((benchmark) => isCandidate(benchmark.measure.key)));
  printGapCalibration(benchmarks.filter((benchmark) => isCandidate(benchmark.measure.key)));
  printNumericCalibration(benchmarks.filter((benchmark) => isCandidate(benchmark.measure.key)));
  printContextStability(benchmarks, strongestCandidates);
  printComparison(benchmarks, strongestCandidates);
  printMissingDataAnalysis(contexts);
  printValidationSummary(benchmarks);
  printConclusion(benchmarks, strongestCandidates);
  printGuardrails();
}

async function loadContexts(): Promise<Context[]> {
  const contexts: Context[] = [];
  for (const year of YEARS) {
    const cache = await loadLatestBacktestFeatureCacheForYear({ family: "turf_flat", year });
    const settledRows = (cache?.rows ?? [])
      .filter((row) => row.features.raceCode === "turf")
      .filter(isSettledRunner)
      .sort(compareRowsChronologically);
    contexts.push({
      year,
      settledRows,
      candidateValues: candidateValuesFor(settledRows),
    });
  }
  return contexts;
}

function printDefinitions() {
  console.log("## Candidate Definitions");
  printTable(CANDIDATES.map((candidate) => ({
    candidate: candidate.label,
    components: candidate.components?.map((component) => component.label).join("; ") ?? "",
    normalisation: "Within-race rank percentile per component",
    blend: "Equal-weight average; all components required",
  })));
  console.log("");
  console.log("Normalisation formula: each component is ranked within the race with higher values better. Rank 1 receives 1.0; the lowest available ranked runner receives 0.0; intermediate scores use `(rankedCount - rank) / (rankedCount - 1)`. If only one runner has that component, the score is 1.0.");
  console.log("");
  console.log("Tie handling: equal values share the same competition rank, so ranks can skip after ties. Missing component values do not receive a component percentile. A candidate score is only assigned when every required component is available.");
  console.log("");
  console.log("Association convention: Spearman-style rank association is positive when higher pre-race ratings correspond to better finishing positions. It is calculated from global ranks of rating value and negative finishing position across runners with both values.");
  console.log("");
}

function printCoverage(benchmarks: Benchmark[]) {
  console.log("## Coverage");
  printTable(benchmarks.filter((benchmark) => isCandidate(benchmark.measure.key)).map((benchmark) => ({
    year: benchmark.year,
    candidate: benchmark.measure.label,
    "eligible races": distinctCount(benchmark.settledRows.map((row) => row.features.targetRaceId)),
    "settled runners": benchmark.settledRows.length,
    "runners rated": benchmark.rowsWithValue.length,
    coverage: pct(coverage(benchmark)),
    "races with no rated runner": racesWithNoRatedRunner(benchmark),
    "races partly rated": partlyRatedRaces(benchmark),
  })));
  console.log("");
}

function printCoreRanking(benchmarks: Benchmark[]) {
  console.log("## Core Ranking Benchmark");
  printTable(benchmarks.map((benchmark) => ({
    year: benchmark.year,
    candidate: benchmark.measure.label,
    "eligible races": distinctCount(benchmark.settledRows.map((row) => row.features.targetRaceId)),
    "runners rated": benchmark.rowsWithValue.length,
    coverage: pct(coverage(benchmark)),
    "rank-1 runners": rowsForRankGroup(benchmark, "rank 1").length,
    "rank-1 winners": winners(rowsForRankGroup(benchmark, "rank 1")),
    "rank-1 strike": pct(winRate(rowsForRankGroup(benchmark, "rank 1"))),
    "rank-1 top-3": pct(top3Rate(rowsForRankGroup(benchmark, "rank 1"))),
    "rank-2 win": pct(winRate(rowsForRankGroup(benchmark, "rank 2"))),
    "rank-3 win": pct(winRate(rowsForRankGroup(benchmark, "rank 3"))),
    "rank-4+ win": pct(winRate(rowsForRankGroup(benchmark, "rank 4+"))),
    "top-2 winner capture": pct(winnerCapture(benchmark, new Set(["rank 1", "rank 2"]))),
    "top-3 winner capture": pct(winnerCapture(benchmark, new Set(["rank 1", "rank 2", "rank 3"]))),
    "winner rank 1": pct(winnerRankShare(benchmark, "rank 1")),
    "winner rank 2": pct(winnerRankShare(benchmark, "rank 2")),
    "winner rank 3": pct(winnerRankShare(benchmark, "rank 3")),
    "winner rank 4+": pct(winnerRankShare(benchmark, "rank 4+")),
    "winner missing": pct(winnerRankShare(benchmark, "missing")),
    association: number(spearmanAssociation(benchmark)),
  })));
  console.log("");
}

function printMonotonicity(benchmarks: Benchmark[]) {
  console.log("## Monotonicity");
  printTable(benchmarks.flatMap((benchmark) => RANK_GROUPS.map((group) => {
    const rows = rowsForRankGroup(benchmark, group);
    return {
      year: benchmark.year,
      candidate: benchmark.measure.label,
      group,
      runners: rows.length,
      wins: winners(rows),
      "strike rate": pct(winRate(rows)),
      "top-3 rate": pct(top3Rate(rows)),
      "average finish": number(averageFinish(rows)),
    };
  })));
  console.log("");
  console.log("### Monotonicity Flags");
  printTable(benchmarks.map((benchmark) => ({
    year: benchmark.year,
    candidate: benchmark.measure.label,
    "win-rate shape": monotonicityLabel(benchmark, winRate),
    "top-3 shape": monotonicityLabel(benchmark, top3Rate),
    note: monotonicityNote(benchmark),
  })));
  console.log("");
}

function printGapCalibration(benchmarks: Benchmark[]) {
  console.log("## Rating-Gap Calibration");
  console.log("Gap definition: within each race, top candidate score minus second candidate score on the normalised 0-1 candidate scale. Cut points are derived once from the 2025 gap distribution for each candidate and reused unchanged for 2026.");
  console.log("");
  for (const candidate of CANDIDATES) {
    const development = benchmarkByKey(benchmarks, "2025", candidate.key);
    const bands = quantileBands(topTwoGaps(development).map((item) => item.gap));
    console.log(`### ${candidate.label}`);
    printTable(YEARS.flatMap((year) => {
      const benchmark = benchmarkByKey(benchmarks, year, candidate.key);
      const gaps = topTwoGaps(benchmark);
      return bands.map((band) => {
        const bandGaps = gaps.filter((item) => inBand(item.gap, band));
        const rows = bandGaps.map((item) => item.topRow);
        return {
          year,
          band: band.label,
          range: bandRange(band),
          races: bandGaps.length,
          "rank-1 runners": rows.length,
          wins: winners(rows),
          "rank-1 strike": pct(winRate(rows)),
          "top-3 rate": pct(top3Rate(rows)),
          "average finish": number(averageFinish(rows)),
        };
      });
    }));
    console.log("");
    printTable(YEARS.map((year) => ({
      year,
      candidate: candidate.label,
      "gap relationship": gapCalibrationLabel(benchmarkByKey(benchmarks, year, candidate.key), bands),
    })));
    console.log("");
  }
}

function printNumericCalibration(benchmarks: Benchmark[]) {
  console.log("## Numeric-Score Calibration");
  console.log("The candidate score is race-relative, so absolute 0-1 values are not a true cross-race ability scale. This section is exploratory only: runner-level score bands are cut from 2025 candidate scores and reused unchanged for 2026.");
  console.log("");
  for (const candidate of CANDIDATES) {
    const development = benchmarkByKey(benchmarks, "2025", candidate.key);
    const bands = quantileBands([...development.values.values()]);
    console.log(`### ${candidate.label}`);
    printTable(YEARS.flatMap((year) => {
      const benchmark = benchmarkByKey(benchmarks, year, candidate.key);
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
        };
      });
    }));
    console.log("");
  }
}

function printContextStability(benchmarks: Benchmark[], strongestCandidateKeys: string[]) {
  console.log("## Context Stability");
  console.log("Profiled for the two strongest candidates by combined 2025/2026 diagnostic score. Categories match the first-stage benchmark.");
  console.log("");
  for (const key of strongestCandidateKeys) {
    const measure = CANDIDATES.find((candidate) => candidate.key === key)!;
    console.log(`### ${measure.label}`);
    printTable(YEARS.flatMap((year) => {
      const benchmark = benchmarkByKey(benchmarks, year, key);
      return [
        ...contextRows(benchmark, "race class", (row) => raceClassBucket(row.features.raceClass), raceClassOrder),
        ...contextRows(benchmark, "distance", (row) => distanceBand(row.features.distanceYards), distanceOrder),
        ...contextRows(benchmark, "field size", (row) => fieldSizeBand(fieldSizeForRow(row)), fieldSizeOrder),
      ];
    }));
    console.log("");
  }
}

function printComparison(benchmarks: Benchmark[], strongestCandidateKeys: string[]) {
  console.log("## Direct Comparison With Existing Measures");
  for (const key of strongestCandidateKeys) {
    const candidate = CANDIDATES.find((item) => item.key === key)!;
    console.log(`### ${candidate.label}`);
    printTable(YEARS.flatMap((year) => {
      const rows = [benchmarkByKey(benchmarks, year, key), ...COMPARISON_MEASURES.map((measure) => benchmarkByKey(benchmarks, year, measure.key))];
      return rows.map((benchmark) => ({
        year,
        measure: benchmark.measure.label,
        coverage: pct(coverage(benchmark)),
        "rank-1 strike": pct(winRate(rowsForRankGroup(benchmark, "rank 1"))),
        "top-3 winner capture": pct(winnerCapture(benchmark, new Set(["rank 1", "rank 2", "rank 3"]))),
        association: number(spearmanAssociation(benchmark)),
        monotonicity: monotonicityLabel(benchmark, winRate),
        "gap calibration": isCandidate(benchmark.measure.key) ? gapCalibrationLabel(benchmark, quantileBands(topTwoGaps(benchmarkByKey(benchmarks, "2025", benchmark.measure.key)).map((item) => item.gap))) : "n/a",
      }));
    }));
    console.log("");
  }
}

function printMissingDataAnalysis(contexts: Context[]) {
  console.log("## Missing-Data Analysis");
  printTable(contexts.flatMap((context) => CANDIDATES.map((candidate) => {
    const missing = missingBreakdown(context.settledRows, candidate.components ?? []);
    const candidateValues = context.candidateValues.get(candidate.key) ?? new Map<string, number>();
    const benchmarkLike = {
      year: context.year,
      measure: candidate,
      values: candidateValues,
      ranks: new Map<string, number>(),
      rankGroups: new Map<string, RankGroup>(),
      settledRows: context.settledRows,
      rowsWithValue: context.settledRows.filter((row) => candidateValues.has(row.features.targetRunnerId)),
    };
    return {
      year: context.year,
      candidate: candidate.label,
      "unrated runners": context.settledRows.length - candidateValues.size,
      "unrated %": pct(context.settledRows.length === 0 ? null : ((context.settledRows.length - candidateValues.size) / context.settledRows.length) * 100),
      "races no rated runner": racesWithNoRatedRunner(benchmarkLike),
      "races partly rated": partlyRatedRaces(benchmarkLike),
      "missing RPR": missing.rpr,
      "missing Topspeed": missing.topspeed,
      "missing latest": missing.latest,
      "missing OR": missing.officialRating,
      "missing multiple": missing.multiple,
    };
  })));
  console.log("");
}

function printValidationSummary(benchmarks: Benchmark[]) {
  console.log("## 2025 Vs 2026 Validation");
  printTable(CANDIDATES.map((candidate) => {
    const b2025 = benchmarkByKey(benchmarks, "2025", candidate.key);
    const b2026 = benchmarkByKey(benchmarks, "2026", candidate.key);
    const best2025 = bestComparisonBenchmark(benchmarks, "2025");
    const best2026 = bestComparisonBenchmark(benchmarks, "2026");
    return {
      candidate: candidate.label,
      "2025 coverage": pct(coverage(b2025)),
      "2025 rank-1 strike": pct(winRate(rowsForRankGroup(b2025, "rank 1"))),
      "2025 top-3 capture": pct(winnerCapture(b2025, new Set(["rank 1", "rank 2", "rank 3"]))),
      "2025 association": number(spearmanAssociation(b2025)),
      "2025 vs best individual": comparisonLabel(b2025, best2025),
      "2026 coverage": pct(coverage(b2026)),
      "2026 rank-1 strike": pct(winRate(rowsForRankGroup(b2026, "rank 1"))),
      "2026 top-3 capture": pct(winnerCapture(b2026, new Set(["rank 1", "rank 2", "rank 3"]))),
      "2026 association": number(spearmanAssociation(b2026)),
      "2026 vs best individual": comparisonLabel(b2026, best2026),
    };
  }));
  console.log("");
}

function printConclusion(benchmarks: Benchmark[], strongestCandidateKeys: string[]) {
  const strongest = strongestCandidateKeys[0] ? CANDIDATES.find((candidate) => candidate.key === strongestCandidateKeys[0])! : null;
  console.log("## Conclusion");
  printTable([
    { question: "1. Does recent level outperform recent peak?", answer: recentLevelAnswer(benchmarks) },
    { question: "2. Does adding latest-run information improve the average-based rating?", answer: latestAdditionAnswer(benchmarks) },
    { question: "3. Which candidate is strongest in both 2025 and 2026?", answer: strongest ? strongest.label : "No clear candidate" },
    { question: "4. Is rank behaviour monotonic?", answer: rankBehaviourAnswer(benchmarks, strongest?.key ?? null) },
    { question: "5. Do larger rank-1 vs rank-2 gaps correspond to higher win rates?", answer: gapAnswer(benchmarks, "2025", strongest?.key ?? null) },
    { question: "6. Does that gap relationship replicate in 2026?", answer: gapAnswer(benchmarks, "2026", strongest?.key ?? null) },
    { question: "7. Is the candidate stable across race class, distance and field size?", answer: "See context tables; no context-specific variants were optimised." },
    { question: "8. Is coverage good enough for a general Turf rating?", answer: coverageAnswer(benchmarks, strongest?.key ?? null) },
    { question: "9. Does the candidate clearly improve on Today's Rating?", answer: todaysImprovementAnswer(benchmarks, strongest?.key ?? null) },
    { question: "10. Is one candidate strong enough to progress toward an RPR-style production rating?", answer: progressionAnswer(benchmarks, strongest?.key ?? null) },
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
    { item: "Trainer form used", result: "No" },
    { item: "Field-size filtering used as a rating input", result: "No" },
    { item: "Composite weight search", result: "No" },
  ]);
}

function benchmarkFor(context: Context, measure: Measure): Benchmark {
  const values = measure.components
    ? context.candidateValues.get(measure.key) ?? new Map<string, number>()
    : valuesFor(context.settledRows, measure.valueFor ?? (() => null));
  const ranks = rankRowsByMeasure(context.settledRows, (row) => values.get(row.features.targetRunnerId) ?? null);
  const rankGroups = new Map<string, RankGroup>();
  for (const row of context.settledRows) {
    rankGroups.set(row.features.targetRunnerId, rankGroup(ranks.get(row.features.targetRunnerId) ?? null));
  }
  return {
    year: context.year,
    measure,
    values,
    ranks,
    rankGroups,
    settledRows: context.settledRows,
    rowsWithValue: context.settledRows.filter((row) => values.has(row.features.targetRunnerId)),
  };
}

function candidateValuesFor(rows: HistoricalTargetRunnerMetricsRow[]) {
  const values = new Map<string, Map<string, number>>();
  for (const candidate of CANDIDATES) {
    const componentScores = (candidate.components ?? []).map((component) => percentileScoresByRace(rows, component.valueFor));
    const candidateValues = new Map<string, number>();
    for (const row of rows) {
      const scores = componentScores.map((score) => score.get(row.features.targetRunnerId));
      if (scores.every((score): score is number => score !== undefined)) {
        candidateValues.set(row.features.targetRunnerId, average(scores) ?? 0);
      }
    }
    values.set(candidate.key, candidateValues);
  }
  return values;
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

function topTwoGaps(benchmark: Benchmark) {
  const gaps: Array<{ raceId: string; gap: number; topRow: HistoricalTargetRunnerMetricsRow }> = [];
  const rowsByRace = groupBy(benchmark.rowsWithValue, (row) => row.features.targetRaceId);
  for (const [raceId, raceRows] of rowsByRace) {
    const ranked = raceRows
      .map((row) => ({ row, value: benchmark.values.get(row.features.targetRunnerId) }))
      .filter((entry): entry is { row: HistoricalTargetRunnerMetricsRow; value: number } => entry.value !== undefined)
      .sort((left, right) =>
        right.value - left.value ||
        left.row.features.targetRunnerId.localeCompare(right.row.features.targetRunnerId)
      );
    if (ranked.length >= 2) {
      gaps.push({ raceId, gap: ranked[0]!.value - ranked[1]!.value, topRow: ranked[0]!.row });
    }
  }
  return gaps;
}

function quantileBands(values: number[]): Band[] {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
  if (sorted.length === 0) {
    return [
      { label: "smallest 25%", min: -Infinity, max: Infinity },
    ];
  }
  const q25 = quantile(sorted, 0.25);
  const q50 = quantile(sorted, 0.5);
  const q75 = quantile(sorted, 0.75);
  return [
    { label: "smallest 25%", min: -Infinity, max: q25 },
    { label: "25-50%", min: q25, max: q50 },
    { label: "50-75%", min: q50, max: q75 },
    { label: "largest 25%", min: q75, max: Infinity },
  ];
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

function gapCalibrationLabel(benchmark: Benchmark, bands: Band[]) {
  const rates = bands.map((band) => {
    const rows = topTwoGaps(benchmark)
      .filter((item) => inBand(item.gap, band))
      .map((item) => item.topRow);
    return winRate(rows);
  });
  return trendLabel(rates);
}

function monotonicityLabel(benchmark: Benchmark, rateFor: (rows: HistoricalTargetRunnerMetricsRow[]) => number | null) {
  const rates = ["rank 1", "rank 2", "rank 3", "rank 4+"] satisfies RankGroup[];
  return trendLabel(rates.map((group) => rateFor(rowsForRankGroup(benchmark, group))));
}

function monotonicityNote(benchmark: Benchmark) {
  const rank1 = winRate(rowsForRankGroup(benchmark, "rank 1"));
  const rank4 = winRate(rowsForRankGroup(benchmark, "rank 4+"));
  if (rank1 !== null && rank4 !== null && rank1 <= rank4) return "rank 1 not above rank 4+";
  return "review group table";
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
        context: contextType,
        bucket: key,
        "settled runners": rows.length,
        coverage: pct(rows.length === 0 ? null : (rows.filter((row) => benchmark.values.has(row.features.targetRunnerId)).length / rows.length) * 100),
        "rank-1 strike": pct(winRate(rank1Rows)),
        "top-3 winner capture": pct(winnersInContext.length === 0 ? null : (top3Winners.length / winnersInContext.length) * 100),
        association: number(spearmanAssociationForRows(benchmark, rows)),
      };
    });
}

function missingBreakdown(rows: HistoricalTargetRunnerMetricsRow[], components: Component[]) {
  let rpr = 0;
  let topspeed = 0;
  let latest = 0;
  let officialRating = 0;
  let multiple = 0;
  for (const row of rows) {
    const missing = components.filter((component) => component.valueFor(row) === null || !Number.isFinite(component.valueFor(row)));
    if (missing.length > 1) multiple += 1;
    if (missing.some((component) => component.key.toLowerCase().includes("rpr"))) rpr += 1;
    if (missing.some((component) => component.key.toLowerCase().includes("speed"))) topspeed += 1;
    if (missing.some((component) => component.key.toLowerCase().includes("latest"))) latest += 1;
    if (missing.some((component) => component.key === "officialRating")) officialRating += 1;
  }
  return { rpr, topspeed, latest, officialRating, multiple };
}

function strongestCandidateKeys(benchmarks: Benchmark[]) {
  return CANDIDATES
    .map((candidate) => ({
      key: candidate.key,
      score: YEARS.reduce((total, year) => total + benchmarkScore(benchmarkByKey(benchmarks, year, candidate.key)), 0),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 2)
    .map((item) => item.key);
}

function bestComparisonBenchmark(benchmarks: Benchmark[], year: Year) {
  return COMPARISON_MEASURES.map((measure) => benchmarkByKey(benchmarks, year, measure.key)).sort(compareBenchmarkQuality)[0]!;
}

function compareBenchmarkQuality(left: Benchmark, right: Benchmark) {
  return benchmarkScore(right) - benchmarkScore(left);
}

function benchmarkScore(benchmark: Benchmark) {
  return ((spearmanAssociation(benchmark) ?? 0) * 2) +
    ((winnerCapture(benchmark, new Set(["rank 1", "rank 2", "rank 3"])) ?? 0) / 100) +
    ((winRate(rowsForRankGroup(benchmark, "rank 1")) ?? 0) / 100);
}

function comparisonLabel(candidate: Benchmark, comparator: Benchmark) {
  const candidateScore = benchmarkScore(candidate);
  const comparatorScore = benchmarkScore(comparator);
  if (candidateScore > comparatorScore * 1.03) return `better than ${comparator.measure.label}`;
  if (candidateScore >= comparatorScore * 0.97) return `similar to ${comparator.measure.label}`;
  return `weaker than ${comparator.measure.label}`;
}

function recentLevelAnswer(benchmarks: Benchmark[]) {
  return YEARS.map((year) => {
    const peak = benchmarkByKey(benchmarks, year, "candidateA");
    const level = benchmarkByKey(benchmarks, year, "candidateB");
    return `${year}: ${comparisonLabel(level, peak)} (association ${number(spearmanAssociation(level))} vs ${number(spearmanAssociation(peak))})`;
  }).join("; ");
}

function latestAdditionAnswer(benchmarks: Benchmark[]) {
  return YEARS.map((year) => {
    const level = benchmarkByKey(benchmarks, year, "candidateB");
    const latest = benchmarkByKey(benchmarks, year, "candidateC");
    return `${year}: ${comparisonLabel(latest, level)} (association ${number(spearmanAssociation(latest))} vs ${number(spearmanAssociation(level))})`;
  }).join("; ");
}

function rankBehaviourAnswer(benchmarks: Benchmark[], key: string | null) {
  if (!key) return "No candidate selected.";
  return YEARS.map((year) => {
    const benchmark = benchmarkByKey(benchmarks, year, key);
    return `${year}: win-rate ${monotonicityLabel(benchmark, winRate)}, top-3 ${monotonicityLabel(benchmark, top3Rate)}`;
  }).join("; ");
}

function gapAnswer(benchmarks: Benchmark[], year: Year, key: string | null) {
  if (!key) return "No candidate selected.";
  const bands = quantileBands(topTwoGaps(benchmarkByKey(benchmarks, "2025", key)).map((item) => item.gap));
  return gapCalibrationLabel(benchmarkByKey(benchmarks, year, key), bands);
}

function coverageAnswer(benchmarks: Benchmark[], key: string | null) {
  if (!key) return "No candidate selected.";
  return YEARS.map((year) => `${year}: ${pct(coverage(benchmarkByKey(benchmarks, year, key)))}`).join("; ");
}

function todaysImprovementAnswer(benchmarks: Benchmark[], key: string | null) {
  if (!key) return "No candidate selected.";
  return YEARS.map((year) => {
    const candidate = benchmarkByKey(benchmarks, year, key);
    const today = benchmarkByKey(benchmarks, year, "latestTodaysRating");
    return `${year}: ${comparisonLabel(candidate, today)} (association ${number(spearmanAssociation(candidate))} vs ${number(spearmanAssociation(today))})`;
  }).join("; ");
}

function progressionAnswer(benchmarks: Benchmark[], key: string | null) {
  if (!key) return "No candidate should progress.";
  const candidate = CANDIDATES.find((item) => item.key === key)!;
  const passes = YEARS.every((year) => {
    const benchmark = benchmarkByKey(benchmarks, year, key);
    const best = bestComparisonBenchmark(benchmarks, year);
    return benchmarkScore(benchmark) >= benchmarkScore(best) * 0.97 &&
      monotonicityLabel(benchmark, winRate) !== "non-monotonic" &&
      gapCalibrationLabel(benchmark, quantileBands(topTwoGaps(benchmarkByKey(benchmarks, "2025", key)).map((item) => item.gap))) !== "non-monotonic" &&
      (coverage(benchmark) ?? 0) >= 65;
  });
  return passes
    ? `${candidate.label} is strong enough for a third-stage diagnostic, but not yet an RPR-style production rating.`
    : `No. ${candidate.label} is the strongest candidate by this diagnostic score, but it does not clear every progression standard in both years.`;
}

function racesWithNoRatedRunner(benchmark: Pick<Benchmark, "settledRows" | "values">) {
  const rowsByRace = groupBy(benchmark.settledRows, (row) => row.features.targetRaceId);
  let count = 0;
  for (const rows of rowsByRace.values()) {
    if (rows.every((row) => !benchmark.values.has(row.features.targetRunnerId))) count += 1;
  }
  return count;
}

function partlyRatedRaces(benchmark: Pick<Benchmark, "settledRows" | "values">) {
  const rowsByRace = groupBy(benchmark.settledRows, (row) => row.features.targetRaceId);
  let count = 0;
  for (const rows of rowsByRace.values()) {
    const rated = rows.filter((row) => benchmark.values.has(row.features.targetRunnerId)).length;
    if (rated > 0 && rated < rows.length) count += 1;
  }
  return count;
}

function isCandidate(key: string): key is CandidateKey {
  return CANDIDATE_KEYS.includes(key as CandidateKey);
}

function benchmarkByKey(benchmarks: Benchmark[], year: Year, key: string) {
  const benchmark = benchmarks.find((item) => item.year === year && item.measure.key === key);
  if (!benchmark) throw new Error(`Missing benchmark ${key} ${year}`);
  return benchmark;
}

function rowsForRankGroup(benchmark: Benchmark, group: RankGroup) {
  return benchmark.settledRows.filter((row) => benchmark.rankGroups.get(row.features.targetRunnerId) === group);
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

function compareRowsChronologically(left: HistoricalTargetRunnerMetricsRow, right: HistoricalTargetRunnerMetricsRow) {
  return left.features.raceDateTime.getTime() - right.features.raceDateTime.getTime() ||
    left.features.targetRaceId.localeCompare(right.features.targetRaceId) ||
    left.features.targetRunnerId.localeCompare(right.features.targetRunnerId);
}

function distinctCount(values: string[]) {
  return new Set(values).size;
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
