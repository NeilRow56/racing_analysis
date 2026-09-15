import {
  deriveBacktestFeatureValues,
  settleSelection,
  summarizeSelections,
  type BacktestSelection,
  type BacktestSummary,
} from "@/lib/racing/backtest";
import {
  loadLatestBacktestFeatureCacheForYear,
  type BacktestCacheFamily,
} from "@/lib/racing/backtest-cache";
import {
  COMPOSITE_PERFORMANCE_RATING_VERSION,
  COMPOSITE_PERFORMANCE_RATING_V2_VERSION,
  COMPOSITE_PERFORMANCE_V1_FORMULA,
  COMPOSITE_PERFORMANCE_V2_FORMULA,
  COMPOSITE_PERFORMANCE_WEIGHTS,
  COMPOSITE_PERFORMANCE_V2_WEIGHTS,
  compositeComponentScores,
  rateCompositePerformanceRows,
  type CompositePerformanceComponentKey,
  type CompositePerformanceFormula,
  type CompositePerformanceRating,
} from "@/lib/racing/composite-performance-rating";
import type { HistoricalTargetRunnerMetricsRow } from "@/lib/racing/historical-target-metrics";

const FAMILIES: Exclude<BacktestCacheFamily, "all">[] = ["jump", "turf_flat", "all_weather_flat"];
const YEARS = ["2024", "2025", "2026"] as const;

type RatedContext = {
  family: Exclude<BacktestCacheFamily, "all">;
  year: string;
  rows: HistoricalTargetRunnerMetricsRow[];
  ratings: Map<string, CompositePerformanceRating>;
  v2Ratings: Map<string, CompositePerformanceRating>;
  componentScores: Map<string, Record<CompositePerformanceComponentKey, number | null>>;
};

type MetricRank = {
  targetRunnerId: string;
  rank: number;
};

async function main() {
  printFormula();

  for (const family of FAMILIES) {
    for (const year of YEARS) {
      const cache = await loadLatestBacktestFeatureCacheForYear({ year, family });
      console.log(`## ${familyLabel(family)} ${year}`);
      if (!cache) {
        console.log("_No compatible cache available; skipped without rebuild._");
        console.log("");
        continue;
      }
      const rows = cache.rows.filter((row) => row.features.raceCode === raceCodeForFamily(family));
      const context: RatedContext = {
        family,
        year,
        rows,
        ratings: rateCompositePerformanceRows(rows, COMPOSITE_PERFORMANCE_V1_FORMULA),
        v2Ratings: rateCompositePerformanceRows(rows, COMPOSITE_PERFORMANCE_V2_FORMULA),
        componentScores: compositeComponentScores(rows),
      };
      printFamilyYear(context);
    }
  }

  printLeakageAudit();
}

function printFormula() {
  console.log("# Composite Performance Rating V1/V2 Diagnostic");
  console.log("");
  console.log(`Version: ${COMPOSITE_PERFORMANCE_RATING_VERSION}`);
  console.log(`V2 version: ${COMPOSITE_PERFORMANCE_RATING_V2_VERSION}`);
  console.log("");
  console.log("## Rating Formula And Weights");
  printTable(Object.entries(COMPOSITE_PERFORMANCE_WEIGHTS).map(([component, weight]) => ({
    component,
    "V1 weight": `${weight}%`,
    "V2 weight": `${COMPOSITE_PERFORMANCE_V2_WEIGHTS[component as CompositePerformanceComponentKey]}%`,
  })));
  console.log("");
  console.log("V1: weighted 0-100 score with missing components neutral at 50. V2: Best-L3-heavy fixed formula with available components reweighted when missing. Rows with no core speed/performance evidence are unrated.");
  console.log("");
  console.log("## Component Normalisation");
  printTable([
    { component: "latestSpeed", input: "latestSpeedRating", normalisation: "within-race percentile, higher is better" },
    { component: "bestL3Speed", input: "bestSpeedLast3", normalisation: "within-race percentile, higher is better" },
    { component: "latestPerformance", input: "latestPerformanceRating", normalisation: "within-race percentile, higher is better" },
    { component: "orRelative", input: "bestSpeedLast3 - officialRating", normalisation: "within-race percentile, higher surplus over OR is better" },
    { component: "recency", input: "daysSinceLastRun", normalisation: "broad fixed bands; 14-60 days scores highest" },
    { component: "experience", input: "career priorRuns", normalisation: "broad fixed bands; 3-10 prior runs scores highest" },
  ]);
  console.log("");
  console.log("## Missing-Value Handling");
  printTable([
    { case: "all core evidence missing", handling: "unrated and excluded from composite rank" },
    { case: "one or more components missing", handling: "component is neutral 50, status=partial, rating retained" },
    { case: "non-runner", handling: "excluded from within-race percentile/rank diagnostics" },
    { case: "single rankable value in race", handling: "component percentile is 100 for that value" },
  ]);
  console.log("");
}

function printFamilyYear(context: RatedContext) {
  if (context.year === "2025") {
    console.log("### 2025 Component Predictive Strength");
    printTable(componentPredictiveRows(context));
    console.log("");

    console.log("### 2025 Component Redundancy");
    printTable(componentCorrelationRows(context));
    console.log("");

    console.log("### 2025 Leave-One-Component-Out");
    printTable(leaveOneOutRows(context));
    console.log("");

    console.log("### 2025 Missing-Value Strategy Comparison");
    printTable(missingStrategyRows(context));
    console.log("");
  }

  console.log("### Rank Cut Results");
  printTable([
    resultRow("all runners", summarizeRows(context.rows)),
    resultRow("V1 rank 1", summarizeRows(rowsForRanks(context, context.ratings, (rank) => rank === 1))),
    resultRow("V1 rank 1-2", summarizeRows(rowsForRanks(context, context.ratings, (rank) => rank <= 2))),
    resultRow("V1 rank 1-3", summarizeRows(rowsForRanks(context, context.ratings, (rank) => rank <= 3))),
    resultRow("V1 top half", summarizeRows(rowsForTopHalf(context, context.ratings))),
    resultRow("V2 rank 1", summarizeRows(rowsForRanks(context, context.v2Ratings, (rank) => rank === 1))),
    resultRow("V2 rank 1-2", summarizeRows(rowsForRanks(context, context.v2Ratings, (rank) => rank <= 2))),
    resultRow("V2 rank 1-3", summarizeRows(rowsForRanks(context, context.v2Ratings, (rank) => rank <= 3))),
    resultRow("V2 top half", summarizeRows(rowsForTopHalf(context, context.v2Ratings))),
  ]);
  console.log("");

  console.log("### Winner-Ranking Diagnostics");
  printTable([
    { rating: "V1", ...winnerRankingRow(context, context.ratings) },
    { rating: "V2", ...winnerRankingRow(context, context.v2Ratings) },
  ]);
  console.log("");

  console.log("### Score-Band Calibration");
  printTable(scoreBandRows(context, context.v2Ratings));
  console.log("");

  console.log("### Missing-Feature Diagnostics");
  printTable([missingFeatureRow(context)]);
  console.log("");

  console.log("### Individual Component Comparison");
  printTable(individualComponentRows(context));
  console.log("");
}

function rowsForRanks(
  context: RatedContext,
  ratings: Map<string, CompositePerformanceRating>,
  includeRank: (rank: number) => boolean,
) {
  return context.rows.filter((row) => {
    const rank = ratings.get(row.features.targetRunnerId)?.rank;
    return rank !== null && rank !== undefined && includeRank(rank);
  });
}

function rowsForTopHalf(context: RatedContext, ratings: Map<string, CompositePerformanceRating>) {
  const fieldSizes = rankableFieldSizes(ratings);
  return context.rows.filter((row) => {
    const rating = ratings.get(row.features.targetRunnerId);
    if (!rating?.rank) return false;
    const fieldSize = fieldSizes.get(row.features.targetRaceId) ?? 0;
    return rating.rank <= Math.ceil(fieldSize / 2);
  });
}

function rankableFieldSizes(ratings: Map<string, CompositePerformanceRating>) {
  const counts = new Map<string, number>();
  for (const rating of ratings.values()) {
    if (rating.rank === null) continue;
    counts.set(rating.targetRaceId, (counts.get(rating.targetRaceId) ?? 0) + 1);
  }
  return counts;
}

function winnerRankingRow(context: RatedContext, ratings: Map<string, CompositePerformanceRating>) {
  const settled = context.rows
    .map((row) => ({ row, settlement: settleSelection(row.outcome), rating: ratings.get(row.features.targetRunnerId) }))
    .filter((entry) => entry.settlement !== null && entry.rating?.rating !== null);
  const winners = settled.filter((entry) => entry.row.outcome.won);
  const losers = settled.filter((entry) => !entry.row.outcome.won);
  const winnerRanks = winners
    .map((entry) => entry.rating?.rank ?? null)
    .filter((rank): rank is number => rank !== null)
    .sort((left, right) => left - right);
  return {
    winners: winners.length,
    "% winners rank 1": pct(percent(winnerRanks.filter((rank) => rank === 1).length, winnerRanks.length)),
    "% winners top 2": pct(percent(winnerRanks.filter((rank) => rank <= 2).length, winnerRanks.length)),
    "% winners top 3": pct(percent(winnerRanks.filter((rank) => rank <= 3).length, winnerRanks.length)),
    "median winner rank": number(median(winnerRanks)),
    "avg winner rating": number(average(winners.map((entry) => entry.rating?.rating ?? null).filter(isNumber))),
    "avg loser rating": number(average(losers.map((entry) => entry.rating?.rating ?? null).filter(isNumber))),
  };
}

function scoreBandRows(context: RatedContext, ratings: Map<string, CompositePerformanceRating>) {
  const bands = [
    { label: "90-100", test: (rating: number) => rating >= 90 },
    { label: "80-89", test: (rating: number) => rating >= 80 && rating < 90 },
    { label: "70-79", test: (rating: number) => rating >= 70 && rating < 80 },
    { label: "60-69", test: (rating: number) => rating >= 60 && rating < 70 },
    { label: "50-59", test: (rating: number) => rating >= 50 && rating < 60 },
    { label: "below 50", test: (rating: number) => rating < 50 },
  ];
  return bands.map((band) => {
    const rows = context.rows.filter((row) => {
      const rating = ratings.get(row.features.targetRunnerId)?.rating;
      return rating !== null && rating !== undefined && band.test(rating);
    });
    return resultRow(band.label, summarizeRows(rows));
  });
}

function missingFeatureRow(context: RatedContext) {
  const ratings = [...context.ratings.values()];
  return {
    rows: context.rows.length,
    "missing latest speed": context.rows.filter((row) => row.features.latestSpeedRating === null).length,
    "missing best L3 speed": context.rows.filter((row) => row.features.bestSpeedLast3 === null).length,
    "missing latest performance": context.rows.filter((row) => row.features.latestPerformanceRating === null).length,
    "missing OR": context.rows.filter((row) => row.features.officialRating === null).length,
    "full-score rows": ratings.filter((rating) => rating.status === "full").length,
    "partial-score rows": ratings.filter((rating) => rating.status === "partial").length,
    "unrated rows": ratings.filter((rating) => rating.status === "unrated").length,
  };
}

function individualComponentRows(context: RatedContext) {
  const comparisons = [
    { label: "Latest Speed", ranks: componentRanks(context.rows, (row) => row.features.latestSpeedRating) },
    { label: "Best L3 Speed", ranks: componentRanks(context.rows, (row) => row.features.bestSpeedLast3) },
    { label: "Latest Performance", ranks: componentRanks(context.rows, (row) => row.features.latestPerformanceRating) },
    { label: "V1 Composite", ranks: [...context.ratings.values()].filter((rating) => rating.rank !== null).map((rating) => ({ targetRunnerId: rating.targetRunnerId, rank: rating.rank! })) },
    { label: "V2 Composite", ranks: [...context.v2Ratings.values()].filter((rating) => rating.rank !== null).map((rating) => ({ targetRunnerId: rating.targetRunnerId, rank: rating.rank! })) },
  ];
  return comparisons.flatMap((comparison) => {
    const rankByRunner = new Map(comparison.ranks.map((rank) => [rank.targetRunnerId, rank.rank]));
    return [
      resultRow(`${comparison.label} rank 1`, summarizeRows(context.rows.filter((row) => rankByRunner.get(row.features.targetRunnerId) === 1))),
      resultRow(`${comparison.label} top 3`, summarizeRows(context.rows.filter((row) => {
        const rank = rankByRunner.get(row.features.targetRunnerId);
        return rank !== undefined && rank <= 3;
      }))),
    ];
  });
}

function componentPredictiveRows(context: RatedContext) {
  return componentDefinitions().map((definition) => {
    const ranks = componentRanks(context.rows, definition.valueFor);
    const rankByRunner = new Map(ranks.map((rank) => [rank.targetRunnerId, rank.rank]));
    const rank1 = summarizeRows(context.rows.filter((row) => rankByRunner.get(row.features.targetRunnerId) === 1));
    const top3Rows = context.rows.filter((row) => {
      const rank = rankByRunner.get(row.features.targetRunnerId);
      return rank !== undefined && rank <= 3;
    });
    const top3 = summarizeRows(top3Rows);
    const settled = context.rows
      .map((row) => ({ row, settlement: settleSelection(row.outcome), score: context.componentScores.get(row.features.targetRunnerId)?.[definition.key] ?? null }))
      .filter((entry) => entry.settlement !== null);
    const winners = settled.filter((entry) => entry.row.outcome.won);
    const losers = settled.filter((entry) => !entry.row.outcome.won);
    const winnerTop3 = winners.filter((entry) => {
      const rank = rankByRunner.get(entry.row.features.targetRunnerId);
      return rank !== undefined && rank <= 3;
    }).length;
    const winnerAverage = average(winners.map((entry) => entry.score).filter(isNumber));
    const loserAverage = average(losers.map((entry) => entry.score).filter(isNumber));
    const missing = context.rows.filter((row) => definition.valueFor(row) === null).length;
    return {
      component: definition.label,
      "rank-1 strike": pct(rank1.winStrikeRate),
      "top-3 strike": pct(top3.winStrikeRate),
      "winner top-3 capture": pct(percent(winnerTop3, winners.length)),
      "avg winner pct": number(winnerAverage),
      "avg loser pct": number(loserAverage),
      separation: number(deltaNullable(winnerAverage, loserAverage)),
      "missing rate": pct(percent(missing, context.rows.length)),
    };
  });
}

function componentCorrelationRows(context: RatedContext) {
  const pairs: Array<[CompositePerformanceComponentKey, CompositePerformanceComponentKey]> = [
    ["latestSpeed", "bestL3Speed"],
    ["latestSpeed", "latestPerformance"],
    ["bestL3Speed", "latestPerformance"],
    ["latestSpeed", "orRelative"],
    ["bestL3Speed", "orRelative"],
    ["latestPerformance", "orRelative"],
  ];
  return pairs.map(([left, right]) => {
    const values = context.rows
      .map((row) => {
        const scores = context.componentScores.get(row.features.targetRunnerId);
        return scores ? [scores[left], scores[right]] as const : [null, null] as const;
      })
      .filter((pair): pair is readonly [number, number] => pair[0] !== null && pair[1] !== null);
    return {
      pair: `${componentLabel(left)} vs ${componentLabel(right)}`,
      rows: values.length,
      correlation: number(correlation(values.map(([leftValue]) => leftValue), values.map(([, rightValue]) => rightValue))),
    };
  });
}

function leaveOneOutRows(context: RatedContext) {
  return componentDefinitions().map((definition) => {
    const formula = withoutComponent(COMPOSITE_PERFORMANCE_V1_FORMULA, definition.key, "neutral_50");
    const ratings = rateCompositePerformanceRows(context.rows, formula);
    const rank1 = summarizeRows(rowsForRanks(context, ratings, (rank) => rank === 1));
    const winners = winnerRankingRow(context, ratings);
    return {
      removed: definition.label,
      "rank-1 strike": pct(rank1.winStrikeRate),
      "winner top-3 capture": winners["% winners top 3"],
      "median winner rank": winners["median winner rank"],
      "rank-1 ROI": pct(rank1.roiPercentage),
    };
  });
}

function missingStrategyRows(context: RatedContext) {
  const neutral = rateCompositePerformanceRows(context.rows, COMPOSITE_PERFORMANCE_V1_FORMULA);
  const reweighted = rateCompositePerformanceRows(context.rows, {
    ...COMPOSITE_PERFORMANCE_V1_FORMULA,
    missingStrategy: "reweight_available",
  });
  return [
    missingStrategyRow("V1 neutral 50", context, neutral),
    missingStrategyRow("V1 reweight available", context, reweighted),
    missingStrategyRow("V2 chosen", context, context.v2Ratings),
  ];
}

function missingStrategyRow(
  label: string,
  context: RatedContext,
  ratings: Map<string, CompositePerformanceRating>,
) {
  const rank1 = summarizeRows(rowsForRanks(context, ratings, (rank) => rank === 1));
  const top3 = summarizeRows(rowsForRanks(context, ratings, (rank) => rank <= 3));
  const winners = winnerRankingRow(context, ratings);
  return {
    method: label,
    "rank-1 strike": pct(rank1.winStrikeRate),
    "top-3 strike": pct(top3.winStrikeRate),
    "winner top-3 capture": winners["% winners top 3"],
    "median winner rank": winners["median winner rank"],
    "rank-1 ROI": pct(rank1.roiPercentage),
  };
}

function componentDefinitions(): Array<{
  key: CompositePerformanceComponentKey;
  label: string;
  valueFor: (row: HistoricalTargetRunnerMetricsRow) => number | null;
}> {
  return [
    { key: "latestSpeed", label: "Latest Speed", valueFor: (row) => row.features.latestSpeedRating },
    { key: "bestL3Speed", label: "Best L3 Speed", valueFor: (row) => row.features.bestSpeedLast3 },
    { key: "latestPerformance", label: "Latest Performance", valueFor: (row) => row.features.latestPerformanceRating },
    { key: "orRelative", label: "Best L3 Speed - OR", valueFor: (row) => {
      if (row.features.bestSpeedLast3 === null || row.features.officialRating === null) return null;
      return row.features.bestSpeedLast3 - row.features.officialRating;
    } },
    { key: "recency", label: "Days Since Run", valueFor: (row) => row.features.daysSinceLastRun === null ? null : -Math.abs(row.features.daysSinceLastRun - 35) },
    { key: "experience", label: "Prior Runs", valueFor: (row) => row.features.priorRuns },
  ];
}

function withoutComponent(
  formula: CompositePerformanceFormula,
  component: CompositePerformanceComponentKey,
  missingStrategy: CompositePerformanceFormula["missingStrategy"],
): CompositePerformanceFormula {
  const weights = { ...formula.weights, [component]: 0 };
  const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  const normalized = Object.fromEntries(
    Object.entries(weights).map(([key, weight]) => [key, total === 0 ? 0 : (weight / total) * 100]),
  ) as Record<CompositePerformanceComponentKey, number>;
  return {
    version: formula.version,
    weights: normalized,
    missingStrategy,
  };
}

function componentLabel(component: CompositePerformanceComponentKey) {
  return componentDefinitions().find((definition) => definition.key === component)?.label ?? component;
}

function componentRanks(
  rows: HistoricalTargetRunnerMetricsRow[],
  valueFor: (row: HistoricalTargetRunnerMetricsRow) => number | null,
): MetricRank[] {
  const rowsByRace = new Map<string, HistoricalTargetRunnerMetricsRow[]>();
  for (const row of rows) {
    rowsByRace.set(row.features.targetRaceId, [...(rowsByRace.get(row.features.targetRaceId) ?? []), row]);
  }
  const ranks: MetricRank[] = [];
  for (const raceRows of rowsByRace.values()) {
    const rankable = raceRows
      .filter((row) => row.outcome.resultStatus !== "non_runner")
      .filter((row) => valueFor(row) !== null)
      .sort((left, right) =>
        (valueFor(right) ?? -Infinity) - (valueFor(left) ?? -Infinity) ||
        left.features.targetRunnerId.localeCompare(right.features.targetRunnerId),
      );
    let previousValue: number | null = null;
    let previousRank = 0;
    rankable.forEach((row, index) => {
      const value = valueFor(row);
      const rank = value === previousValue ? previousRank : index + 1;
      ranks.push({ targetRunnerId: row.features.targetRunnerId, rank });
      previousValue = value;
      previousRank = rank;
    });
  }
  return ranks;
}

function resultRow(label: string, summary: BacktestSummary) {
  return {
    group: label,
    selections: summary.selections,
    settled: summary.settledSelections,
    winners: summary.wins,
    "strike rate": pct(summary.winStrikeRate),
    "£1 P/L": money(summary.profitLoss),
    ROI: pct(summary.roiPercentage),
  };
}

function summarizeRows(rows: HistoricalTargetRunnerMetricsRow[]) {
  return summarizeSelections(rows.map(rowToSelection));
}

function rowToSelection(row: HistoricalTargetRunnerMetricsRow): BacktestSelection {
  return {
    id: row.features.targetRunnerId,
    definitionId: "composite-performance-diagnostic",
    selectedReason: "diagnostic",
    features: row.features,
    derived: deriveBacktestFeatureValues(row.features),
    outcome: row.outcome,
    settlement: settleSelection(row.outcome),
  };
}

function printLeakageAudit() {
  console.log("## Leakage Audit");
  printTable([
    { check: "inputs", result: "uses only existing pre-race feature row fields: speed, performance, OR, daysSinceLastRun, priorRuns" },
    { check: "excluded", result: "trainer, course, going, draw, class movement, jockey, price, result SP, finishing position and won flag are not rating inputs" },
    { check: "weights", result: "fixed before evaluation; no optimisation loop and no 2026 fitting" },
    { check: "ranking", result: "within-race only; no future races are referenced" },
    { check: "outcomes", result: "used only after rating/ranking for settlement diagnostics" },
  ]);
  console.log("");
}

function raceCodeForFamily(family: Exclude<BacktestCacheFamily, "all">) {
  if (family === "jump") return "jump";
  if (family === "all_weather_flat") return "aw";
  return "turf";
}

function familyLabel(family: Exclude<BacktestCacheFamily, "all">) {
  if (family === "all_weather_flat") return "All Weather";
  if (family === "turf_flat") return "Turf";
  return "Jump";
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 0 ? (values[middle - 1]! + values[middle]!) / 2 : values[middle]!;
}

function percent(numerator: number, denominator: number) {
  if (denominator === 0) return null;
  return (numerator / denominator) * 100;
}

function deltaNullable(right: number | null, left: number | null) {
  return right === null || left === null ? null : right - left;
}

function correlation(left: number[], right: number[]) {
  if (left.length !== right.length || left.length < 2) return null;
  const leftAverage = average(left);
  const rightAverage = average(right);
  if (leftAverage === null || rightAverage === null) return null;
  let covariance = 0;
  let leftVariance = 0;
  let rightVariance = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftDiff = left[index]! - leftAverage;
    const rightDiff = right[index]! - rightAverage;
    covariance += leftDiff * rightDiff;
    leftVariance += leftDiff ** 2;
    rightVariance += rightDiff ** 2;
  }
  if (leftVariance === 0 || rightVariance === 0) return null;
  return covariance / Math.sqrt(leftVariance * rightVariance);
}

function isNumber(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

function pct(value: number | null) {
  return value === null || !Number.isFinite(value) ? "n/a" : `${value.toFixed(1)}%`;
}

function money(value: number | null) {
  return value === null || !Number.isFinite(value) ? "n/a" : `£${value.toFixed(2)}`;
}

function number(value: number | null) {
  return value === null || !Number.isFinite(value) ? "n/a" : value.toFixed(1);
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
