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
import type { HistoricalPreRaceFeatureRow, HistoricalTargetRunnerMetricsRow } from "@/lib/racing/historical-target-metrics";
import { raceClassNumber } from "@/lib/racing/research-rule-classes";
import { classifyHandicapStatus } from "@/lib/racing/research-rule";

type Family = Exclude<BacktestCacheFamily, "all">;
type Year = "2025" | "2026";

type RankedRunner = {
  row: HistoricalTargetRunnerMetricsRow;
  rank: number;
  value: number;
};

type RaceCase = {
  family: Family;
  year: Year;
  raceId: string;
  raceDateTime: Date;
  raceRows: HistoricalTargetRunnerMetricsRow[];
  rankableRows: RankedRunner[];
  topSpeed: HistoricalTargetRunnerMetricsRow;
  winner: HistoricalTargetRunnerMetricsRow;
  winnerRank: number | null;
  rank1Won: boolean;
  topGapToRank2: number | null;
};

type FeatureDefinition = {
  label: string;
  get: (features: HistoricalPreRaceFeatureRow) => number | null;
  better: "higher" | "lower" | "closerTo35" | "none";
};

const FAMILIES: Family[] = ["jump", "turf_flat", "all_weather_flat"];
const YEARS: Year[] = ["2025", "2026"];

const FEATURE_DEFINITIONS: FeatureDefinition[] = [
  { label: "Latest Speed", get: (features) => features.latestSpeedRating, better: "higher" },
  { label: "Best L3 Speed", get: (features) => features.bestSpeedLast3, better: "higher" },
  { label: "Latest Performance", get: (features) => features.latestPerformanceRating, better: "higher" },
  { label: "Official Rating", get: (features) => features.officialRating, better: "higher" },
  { label: "Best L3 Speed - OR", get: (features) => deriveBacktestFeatureValues(features).bestL3SpeedMinusOR, better: "higher" },
  { label: "Days since run", get: (features) => features.daysSinceLastRun, better: "closerTo35" },
  { label: "Career prior runs", get: (features) => features.priorRuns, better: "higher" },
  { label: "Trainer prior runs", get: (features) => features.trainerPriorRuns, better: "higher" },
  { label: "Trainer prior wins", get: (features) => features.trainerPriorWins, better: "higher" },
  { label: "Trainer prior strike rate", get: (features) => features.trainerPriorWinRate, better: "higher" },
  { label: "Weight carried lbs", get: (features) => features.weightCarriedLbs, better: "lower" },
  { label: "Average recent speed L3", get: (features) => features.averageSpeedLast3, better: "higher" },
];

async function main() {
  console.log("# Best L3 Speed Error Diagnostic");
  console.log("");
  console.log("Diagnostic only: reads existing compatible 2025/2026 caches, ranks `bestSpeedLast3` within each race, and uses outcomes only after ranking for settlement/error analysis.");
  console.log("");
  console.log("Unavailable requested fields: class movement and distance suitability/history are not represented as explicit as-of-safe feature fields in the current cache, so they are not invented here.");
  console.log("");

  const contexts: RaceContext[] = [];
  for (const family of FAMILIES) {
    for (const year of YEARS) {
      const cache = await loadLatestBacktestFeatureCacheForYear({ family, year });
      if (!cache) {
        console.log(`## ${familyLabel(family)} ${year}`);
        console.log("_No compatible cache found; skipped without rebuild._");
        console.log("");
        continue;
      }
      const rows = cache.rows
        .filter((row) => row.features.raceCode === raceCodeForFamily(family))
        .sort(compareRowsChronologically);
      contexts.push({
        family,
        year,
        rows,
        cases: buildRaceCases(rows, family, year),
      });
    }
  }

  printFeatureAvailability(contexts);
  printRaceLevelSummary(contexts);
  printWinnerRankWhenTopLoses(contexts);
  printWinnerVsTopSpeedDifferences(contexts);
  printSpeedGapBuckets(contexts);
  printStaleOutlierDiagnostics(contexts);
  printOrRelativeAnalysis(contexts);
  printTrainerContext(contexts);
  printRaceContext(contexts);
  printCandidateTrustSignals(contexts);
  printGuardrailSummary();
}

type RaceContext = {
  family: Family;
  year: Year;
  rows: HistoricalTargetRunnerMetricsRow[];
  cases: RaceCase[];
};

function buildRaceCases(
  rows: HistoricalTargetRunnerMetricsRow[],
  family: Family,
  year: Year,
): RaceCase[] {
  const rowsByRace = groupBy(rows, (row) => row.features.targetRaceId);
  const cases: RaceCase[] = [];
  for (const [raceId, raceRows] of rowsByRace) {
    const ranked = rankRaceRows(raceRows, (row) => row.features.bestSpeedLast3);
    if (ranked.length === 0) continue;
    const winners = raceRows
      .filter((row) => settleSelection(row.outcome) !== null && row.outcome.won === true)
      .sort(compareRowsChronologically);
    if (winners.length === 0) continue;
    const topSpeed = ranked.find((rankedRow) => rankedRow.rank === 1)?.row;
    if (!topSpeed) continue;
    const winner = winners[0]!;
    const rankByRunner = new Map(ranked.map((rankedRow) => [rankedRow.row.features.targetRunnerId, rankedRow.rank]));
    const rank1Won = winners.some((winningRow) => rankByRunner.get(winningRow.features.targetRunnerId) === 1);
    cases.push({
      family,
      year,
      raceId,
      raceDateTime: topSpeed.features.raceDateTime,
      raceRows,
      rankableRows: ranked,
      topSpeed,
      winner,
      winnerRank: rankByRunner.get(winner.features.targetRunnerId) ?? null,
      rank1Won,
      topGapToRank2: topGapToRank2(ranked),
    });
  }
  return cases.sort((left, right) => left.raceDateTime.getTime() - right.raceDateTime.getTime() || left.raceId.localeCompare(right.raceId));
}

function rankRaceRows(
  rows: HistoricalTargetRunnerMetricsRow[],
  valueFor: (row: HistoricalTargetRunnerMetricsRow) => number | null,
): RankedRunner[] {
  const rankable = rows
    .filter((row) => row.outcome.resultStatus !== "non_runner")
    .map((row) => ({ row, value: valueFor(row) }))
    .filter((entry): entry is { row: HistoricalTargetRunnerMetricsRow; value: number } => entry.value !== null && Number.isFinite(entry.value))
    .sort((left, right) =>
      right.value - left.value ||
      left.row.features.targetRunnerId.localeCompare(right.row.features.targetRunnerId),
    );
  let previousValue: number | null = null;
  let previousRank = 0;
  return rankable.map((entry, index) => {
    const rank = entry.value === previousValue ? previousRank : index + 1;
    previousValue = entry.value;
    previousRank = rank;
    return { row: entry.row, value: entry.value, rank };
  });
}

function topGapToRank2(ranked: RankedRunner[]) {
  const top = ranked.find((entry) => entry.rank === 1)?.value ?? null;
  const rank2 = ranked.find((entry) => entry.rank > 1)?.value ?? null;
  return top === null || rank2 === null ? null : top - rank2;
}

function printFeatureAvailability(contexts: RaceContext[]) {
  console.log("## Feature Availability");
  for (const context of contexts) {
    console.log(`### ${label(context)}`);
    printTable(FEATURE_DEFINITIONS.map((feature) => {
      const available = context.rows.filter((row) => feature.get(row.features) !== null).length;
      return {
        feature: feature.label,
        rows: context.rows.length,
        available,
        "availability %": pct(percent(available, context.rows.length)),
      };
    }));
    console.log("");
  }
}

function printRaceLevelSummary(contexts: RaceContext[]) {
  console.log("## Best L3 Rank-1 Strike");
  printTable(contexts.map((context) => {
    const wins = context.cases.filter((raceCase) => raceCase.rank1Won).length;
    const losers = context.cases.length - wins;
    return {
      period: label(context),
      "races analysed": context.cases.length,
      "rank-1 winners": wins,
      "rank-1 losers": losers,
      "rank-1 strike": pct(percent(wins, context.cases.length)),
      "rank-1 ROI": pct(summarizeCases(context.cases).roiPercentage),
    };
  }));
  console.log("");
}

function printWinnerRankWhenTopLoses(contexts: RaceContext[]) {
  console.log("## Actual Winner Rank When Best L3 Rank 1 Loses");
  printTable(contexts.map((context) => {
    const losing = losingCases(context);
    const rank2 = losing.filter((raceCase) => raceCase.winnerRank === 2).length;
    const rank3 = losing.filter((raceCase) => raceCase.winnerRank === 3).length;
    const rank4Plus = losing.filter((raceCase) => raceCase.winnerRank !== null && raceCase.winnerRank >= 4).length;
    const missing = losing.filter((raceCase) => raceCase.winnerRank === null).length;
    return {
      period: label(context),
      "losing races": losing.length,
      "rank 2": pct(percent(rank2, losing.length)),
      "rank 3": pct(percent(rank3, losing.length)),
      "rank 4+": pct(percent(rank4Plus, losing.length)),
      "missing Best L3": pct(percent(missing, losing.length)),
    };
  }));
  console.log("");
}

function printWinnerVsTopSpeedDifferences(contexts: RaceContext[]) {
  console.log("## Winner Minus Top-Speed Loser Differences");
  for (const context of contexts) {
    const losing = losingCases(context);
    console.log(`### ${label(context)}`);
    printTable(FEATURE_DEFINITIONS.map((feature) => featureDifferenceRow(feature, losing)));
    console.log("");
  }
}

function featureDifferenceRow(feature: FeatureDefinition, cases: RaceCase[]) {
  const comparisons = cases
    .map((raceCase) => {
      const winner = feature.get(raceCase.winner.features);
      const top = feature.get(raceCase.topSpeed.features);
      if (winner === null || top === null) return null;
      return { winner, top, diff: winner - top };
    })
    .filter((comparison): comparison is { winner: number; top: number; diff: number } => comparison !== null);
  return {
    feature: feature.label,
    "median diff": number(median(comparisons.map((comparison) => comparison.diff))),
    "mean diff": number(average(comparisons.map((comparison) => comparison.diff))),
    "winner better %": pct(percent(comparisons.filter((comparison) => winnerIsBetter(feature.better, comparison.winner, comparison.top)).length, comparisons.length)),
    sample: comparisons.length,
  };
}

function winnerIsBetter(
  better: FeatureDefinition["better"],
  winner: number,
  top: number,
) {
  if (better === "higher") return winner > top;
  if (better === "lower") return winner < top;
  if (better === "closerTo35") return Math.abs(winner - 35) < Math.abs(top - 35);
  return false;
}

function printSpeedGapBuckets(contexts: RaceContext[]) {
  console.log("## Speed-Gap Buckets");
  for (const context of contexts) {
    const casesWithGap = context.cases.filter((raceCase) => raceCase.topGapToRank2 !== null);
    const boundaries = quartileBoundaries(casesWithGap.map((raceCase) => raceCase.topGapToRank2!));
    console.log(`### ${label(context)} boundaries`);
    printTable([{ q1: number(boundaries[0]), q2: number(boundaries[1]), q3: number(boundaries[2]) }]);
    console.log("");
    printTable(bucketRows(casesWithGap, (raceCase) => gapBucket(raceCase.topGapToRank2!, boundaries)));
    console.log("");
  }
}

function printStaleOutlierDiagnostics(contexts: RaceContext[]) {
  console.log("## Stale / Outlier Diagnostics For Rank-1 Best L3 Horses");
  for (const context of contexts) {
    console.log(`### ${label(context)} winners vs losers`);
    printTable([
      staleSummaryRow("rank-1 winners", context.cases.filter((raceCase) => raceCase.rank1Won)),
      staleSummaryRow("rank-1 losers", losingCases(context)),
    ]);
    console.log("");
    console.log(`### ${label(context)} latest-vs-best gap bands`);
    printTable(bucketRows(context.cases, latestGapBucket));
    console.log("");
  }
}

function staleSummaryRow(labelText: string, cases: RaceCase[]) {
  const latestMinusBest = cases
    .map((raceCase) => deriveBacktestFeatureValues(raceCase.topSpeed.features).latestMinusBestL3)
    .filter(isNumber);
  const absoluteGap = latestMinusBest.map((value) => Math.abs(value));
  const latestPerformance = cases
    .map((raceCase) => raceCase.topSpeed.features.latestPerformanceRating)
    .filter(isNumber);
  const days = cases
    .map((raceCase) => raceCase.topSpeed.features.daysSinceLastRun)
    .filter(isNumber);
  const averageL3 = cases
    .map((raceCase) => raceCase.topSpeed.features.averageSpeedLast3)
    .filter(isNumber);
  return {
    group: labelText,
    races: cases.length,
    "median latest-best": number(median(latestMinusBest)),
    "mean latest-best": number(average(latestMinusBest)),
    "median abs gap": number(median(absoluteGap)),
    "mean latest perf": number(average(latestPerformance)),
    "median days off": number(median(days)),
    "mean avg L3 speed": number(average(averageL3)),
  };
}

function printOrRelativeAnalysis(contexts: RaceContext[]) {
  console.log("## OR-Relative Analysis For Rank-1 Best L3 Horses");
  for (const context of contexts) {
    const winnerValues = context.cases
      .filter((raceCase) => raceCase.rank1Won)
      .map((raceCase) => deriveBacktestFeatureValues(raceCase.topSpeed.features).bestL3SpeedMinusOR)
      .filter(isNumber);
    const loserValues = losingCases(context)
      .map((raceCase) => deriveBacktestFeatureValues(raceCase.topSpeed.features).bestL3SpeedMinusOR)
      .filter(isNumber);
    console.log(`### ${label(context)} winners vs losers`);
    printTable([
      {
        group: "rank-1 winners",
        sample: winnerValues.length,
        median: number(median(winnerValues)),
        mean: number(average(winnerValues)),
      },
      {
        group: "rank-1 losers",
        sample: loserValues.length,
        median: number(median(loserValues)),
        mean: number(average(loserValues)),
      },
    ]);
    console.log("");
    console.log(`### ${label(context)} OR-relative bands`);
    printTable(bucketRows(context.cases, orRelativeBucket));
    console.log("");
  }
}

function printTrainerContext(contexts: RaceContext[]) {
  console.log("## Trainer Context For Rank-1 Best L3 Horses");
  for (const context of contexts) {
    console.log(`### ${label(context)} trainer prior strike bands`);
    printTable(bucketRows(context.cases, trainerStrikeBucket));
    console.log("");
    console.log(`### ${label(context)} trainer prior runner bands`);
    printTable(bucketRows(context.cases, trainerRunsBucket));
    console.log("");
  }
}

function printRaceContext(contexts: RaceContext[]) {
  console.log("## Race Context For Rank-1 Best L3 Horses");
  for (const context of contexts) {
    console.log(`### ${label(context)} handicap status`);
    printTable(bucketRows(context.cases, (raceCase) => classifyHandicapStatus(raceCase.topSpeed.features)));
    console.log("");
    console.log(`### ${label(context)} class`);
    printTable(bucketRows(context.cases, (raceCase) => classBucket(raceCase.topSpeed.features)));
    console.log("");
    console.log(`### ${label(context)} distance`);
    printTable(bucketRows(context.cases, (raceCase) => distanceBucket(raceCase.topSpeed.features.distanceYards)));
    console.log("");
    console.log(`### ${label(context)} field size`);
    printTable(bucketRows(context.cases, (raceCase) => fieldSizeBucket(raceCase.topSpeed.features.actualRunnerCount ?? raceCase.topSpeed.features.declaredRunnerCount)));
    console.log("");
  }
}

function printCandidateTrustSignals(contexts: RaceContext[]) {
  const signalRows = [
    signalRow("large top-speed gap", contexts, (raceCase, context) => {
      const gaps = context.cases.map((item) => item.topGapToRank2).filter(isNumber);
      const q3 = quartileBoundaries(gaps)[2];
      return q3 !== null && raceCase.topGapToRank2 !== null && raceCase.topGapToRank2 >= q3;
    }),
    signalRow("latest speed within 5lb of best L3", contexts, (raceCase) => {
      const latestMinusBest = deriveBacktestFeatureValues(raceCase.topSpeed.features).latestMinusBestL3;
      return latestMinusBest !== null && Math.abs(latestMinusBest) <= 5;
    }),
    signalRow("trainer prior strike >= 15%", contexts, (raceCase) => {
      const strike = raceCase.topSpeed.features.trainerPriorWinRate;
      return strike !== null && strike >= 15;
    }),
    signalRow("Best L3 at least 10lb above OR", contexts, (raceCase) => {
      const orRelative = deriveBacktestFeatureValues(raceCase.topSpeed.features).bestL3SpeedMinusOR;
      return orRelative !== null && orRelative >= 10;
    }),
  ];
  console.log("## Candidate Trust Signals");
  printTable(signalRows);
  console.log("");
  console.log("Only the strongest directionally consistent candidates should be considered for a later modelling task; no thresholds are selected for production here.");
  console.log("");
}

function signalRow(
  signal: string,
  contexts: RaceContext[],
  predicate: (raceCase: RaceCase, context: RaceContext) => boolean,
) {
  const row: Record<string, unknown> = { signal };
  for (const context of contexts) {
    const baselineStrike = percent(context.cases.filter((raceCase) => raceCase.rank1Won).length, context.cases.length);
    const matched = context.cases.filter((raceCase) => predicate(raceCase, context));
    const summary = summarizeCases(matched);
    const matchedStrike = percent(matched.filter((raceCase) => raceCase.rank1Won).length, matched.length);
    row[label(context)] = `${matched.length} races, ${pct(matchedStrike)} strike (${deltaPct(matchedStrike, baselineStrike)} vs base), ROI ${pct(summary.roiPercentage)}`;
  }
  return row;
}

function printGuardrailSummary() {
  console.log("## Guardrail Summary");
  printTable([
    { item: "Production logic changed", result: "No" },
    { item: "Research/Today/saved/frozen rules changed", result: "No" },
    { item: "Cache rebuild performed", result: "No" },
    { item: "2026 usage", result: "Out-of-sample comparison only; no threshold fitting" },
    { item: "Ranking", result: "Within-race Best L3 ranking, excluding non-runners and rows missing Best L3" },
    { item: "Settlement", result: "Existing `settleSelection` actual-SP settlement; non-runners/unsettled skipped" },
  ]);
}

function bucketRows(cases: RaceCase[], bucketFor: (raceCase: RaceCase) => string) {
  const rows = [...groupBy(cases, bucketFor).entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([bucket, bucketCases]) => {
      const summary = summarizeCases(bucketCases);
      const winners = bucketCases.filter((raceCase) => raceCase.rank1Won).length;
      return {
        bucket,
        races: bucketCases.length,
        winners,
        "strike rate": pct(percent(winners, bucketCases.length)),
        "£1 P/L": money(summary.profitLoss),
        ROI: pct(summary.roiPercentage),
      };
    });
  return rows.length > 0 ? rows : [{ bucket: "none", races: 0, winners: 0, "strike rate": "n/a", "£1 P/L": "n/a", ROI: "n/a" }];
}

function summarizeCases(cases: RaceCase[]): BacktestSummary {
  return summarizeSelections(cases.map((raceCase) => rowToSelection(raceCase.topSpeed)));
}

function rowToSelection(row: HistoricalTargetRunnerMetricsRow): BacktestSelection {
  return {
    id: row.features.targetRunnerId,
    definitionId: "best-l3-speed-error-diagnostic",
    selectedReason: "Best L3 rank 1",
    features: row.features,
    derived: deriveBacktestFeatureValues(row.features),
    outcome: row.outcome,
    settlement: settleSelection(row.outcome),
  };
}

function losingCases(context: RaceContext) {
  return context.cases.filter((raceCase) => !raceCase.rank1Won);
}

function gapBucket(value: number, boundaries: [number | null, number | null, number | null]) {
  const [q1, q2, q3] = boundaries;
  if (q1 === null || q2 === null || q3 === null) return "unknown";
  if (value <= q1) return `very small (<=${number(q1)})`;
  if (value <= q2) return `small (${number(q1)}-${number(q2)})`;
  if (value <= q3) return `medium (${number(q2)}-${number(q3)})`;
  return `large (>${number(q3)})`;
}

function latestGapBucket(raceCase: RaceCase) {
  const latestMinusBest = deriveBacktestFeatureValues(raceCase.topSpeed.features).latestMinusBestL3;
  if (latestMinusBest === null) return "missing";
  const absolute = Math.abs(latestMinusBest);
  if (absolute <= 5) return "abs latest-best <=5";
  if (absolute <= 10) return "abs latest-best 6-10";
  if (absolute <= 20) return "abs latest-best 11-20";
  return "abs latest-best >20";
}

function orRelativeBucket(raceCase: RaceCase) {
  const value = deriveBacktestFeatureValues(raceCase.topSpeed.features).bestL3SpeedMinusOR;
  if (value === null) return "missing";
  if (value < 0) return "<0";
  if (value < 10) return "0-9";
  if (value < 20) return "10-19";
  return "20+";
}

function trainerStrikeBucket(raceCase: RaceCase) {
  const value = raceCase.topSpeed.features.trainerPriorWinRate;
  if (value === null) return "missing";
  if (value === 0) return "0%";
  if (value < 5) return ">0-<5%";
  if (value < 10) return "5-<10%";
  if (value < 15) return "10-<15%";
  return "15%+";
}

function trainerRunsBucket(raceCase: RaceCase) {
  const value = raceCase.topSpeed.features.trainerPriorRuns;
  if (value === 0) return "0";
  if (value < 25) return "1-24";
  if (value < 100) return "25-99";
  return "100+";
}

function classBucket(features: HistoricalPreRaceFeatureRow) {
  const raceClass = raceClassNumber(features.raceClass);
  if (raceClass === null) return "unknown";
  if (raceClass <= 2) return "Class 1-2";
  if (raceClass <= 4) return "Class 3-4";
  return "Class 5+";
}

function distanceBucket(distanceYards: number | null) {
  if (distanceYards === null) return "unknown";
  if (distanceYards < 1540) return "sprint";
  if (distanceYards < 2200) return "mile";
  if (distanceYards < 3080) return "middle";
  if (distanceYards < 3520) return "staying";
  return "extended";
}

function fieldSizeBucket(fieldSize: number | null) {
  if (fieldSize === null) return "unknown";
  if (fieldSize <= 5) return "1-5";
  if (fieldSize <= 8) return "6-8";
  if (fieldSize <= 12) return "9-12";
  return "13+";
}

function compareRowsChronologically(
  left: HistoricalTargetRunnerMetricsRow,
  right: HistoricalTargetRunnerMetricsRow,
) {
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

function quartileBoundaries(values: number[]): [number | null, number | null, number | null] {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  return [
    percentileValue(sorted, 0.25),
    percentileValue(sorted, 0.5),
    percentileValue(sorted, 0.75),
  ];
}

function percentileValue(sortedValues: number[], percentile: number) {
  if (sortedValues.length === 0) return null;
  const index = (sortedValues.length - 1) * percentile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower]!;
  const weight = index - lower;
  return sortedValues[lower]! * (1 - weight) + sortedValues[upper]! * weight;
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}

function percent(numerator: number, denominator: number) {
  if (denominator === 0) return null;
  return (numerator / denominator) * 100;
}

function raceCodeForFamily(family: Family) {
  if (family === "jump") return "jump";
  if (family === "all_weather_flat") return "aw";
  return "turf";
}

function familyLabel(family: Family) {
  if (family === "all_weather_flat") return "All Weather";
  if (family === "turf_flat") return "Turf";
  return "Jump";
}

function label(context: Pick<RaceContext, "family" | "year">) {
  return `${familyLabel(context.family)} ${context.year}`;
}

function isNumber(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

function deltaPct(value: number | null, baseline: number | null) {
  if (value === null || baseline === null) return "n/a";
  const delta = value - baseline;
  return `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}pp`;
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
