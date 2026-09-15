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
import type { HistoricalTargetRunnerMetricsRow } from "@/lib/racing/historical-target-metrics";
import { raceClassNumber } from "@/lib/racing/research-rule-classes";
import { rankRows, type RankedResearchRow } from "@/lib/racing/research-rule";

type Family = Exclude<BacktestCacheFamily, "all">;
type Year = "2025" | "2026";

type Context = {
  family: Family;
  year: Year;
  rows: RankedResearchRow[];
  baseline: RankedResearchRow[];
  orRankByRunnerId: Map<string, number>;
  spRankByRunnerId: Map<string, number>;
};

type AeStats = {
  runners: number;
  wins: number;
  expectedWins: number;
  ae: number | null;
};

type FeatureProfile = {
  key: string;
  label: string;
  omitted?: string;
  categoryFor: (row: RankedResearchRow, context: Context) => string;
  categoryOrder: string[];
};

const FAMILIES: Family[] = ["jump", "turf_flat", "all_weather_flat"];
const YEARS: Year[] = ["2025", "2026"];
const SAMPLE_FLOOR = 25;

const FEATURES: FeatureProfile[] = [
  {
    key: "best_l3_rank",
    label: "Best L3 rank",
    categoryFor: (row) => rankCategory(row.ranks.bestSpeedLast3),
    categoryOrder: ["rank 1", "rank 2", "rank 3+", "missing"],
  },
  {
    key: "latest_speed_rank",
    label: "Latest speed rank",
    categoryFor: (row) => rankCategory(row.ranks.latestSpeedRating),
    categoryOrder: ["rank 1", "rank 2", "rank 3+", "missing"],
  },
  {
    key: "official_rating_position",
    label: "Official Rating position",
    categoryFor: (row, context) => orPositionCategory(context.orRankByRunnerId.get(row.features.targetRunnerId) ?? null),
    categoryOrder: ["top-rated", "second", "third+", "missing"],
  },
  {
    key: "days_since_run",
    label: "Days since run",
    categoryFor: (row) => daysSinceRunBucket(row.features.daysSinceLastRun),
    categoryOrder: ["0-14", "15-30", "31-60", "61-120", "121+", "missing"],
  },
  {
    key: "run_after_break",
    label: "Run after break",
    categoryFor: (row) => runAfterBreakBucket(row.features.runAfterBreakNumber),
    categoryOrder: ["first run after break", "second run after break", "third+", "missing"],
  },
  {
    key: "trainer_prior_runs",
    label: "Trainer prior runs",
    categoryFor: (row) => trainerPriorRunsBucket(row.features.trainerPriorRuns),
    categoryOrder: ["<20", "20-49", "50-99", "100+"],
  },
  {
    key: "market_rank",
    label: "Market rank",
    categoryFor: (row, context) => marketRankCategory(context.spRankByRunnerId.get(row.features.targetRunnerId) ?? null),
    categoryOrder: ["favourite", "second favourite", "third+", "missing"],
  },
  {
    key: "race_class",
    label: "Race class",
    categoryFor: (row) => raceClassBucket(row.features.raceClass),
    categoryOrder: ["Class 1-2", "Class 3", "Class 4", "Class 5", "Class 6", "unknown"],
  },
  {
    key: "exact_field_size",
    label: "Exact field size",
    categoryFor: (row) => exactFieldSizeBucket(fieldSizeForRow(row)),
    categoryOrder: ["2", "3", "4", "5", "other/missing"],
  },
];

async function main() {
  console.log("# Trainer + Small Field Feature Profile");
  console.log("");
  console.log("Diagnostic only: single-feature profiling inside trainer prior strike >=15% and field size <=5. Uses existing compatible caches and existing settlement/SP conventions.");
  console.log("");
  console.log("Market rank is derived from final decimal SP, so it is market-price profiling rather than an independent pre-race feature. Official Rating position is used for the requested OR-relative section because no separate OR-relative rank is stored in the cache.");
  console.log("");

  const contexts: Context[] = [];
  for (const family of FAMILIES) {
    for (const year of YEARS) {
      const cache = await loadLatestBacktestFeatureCacheForYear({ family, year });
      const rows = cache
        ? rankRows(cache.rows
          .filter((row) => row.features.raceCode === raceCodeForFamily(family))
          .sort(compareRowsChronologically))
        : [];
      contexts.push({
        family,
        year,
        rows,
        baseline: baselineRows(rows),
        orRankByRunnerId: rankByRace(rows, (row) => row.features.officialRating, true),
        spRankByRunnerId: rankByRace(rows, (row) => spForRow(row), false),
      });
    }
  }

  printBaselinePopulation(contexts);
  for (const feature of FEATURES) {
    printFeatureProfile(contexts, feature);
  }
  printYearReplication(contexts);
  printCrossFamilyConsistency(contexts);
  printFeatureDiscrimination(contexts);
  printConclusion(contexts);
  printGuardrails();
}

function printBaselinePopulation(contexts: Context[]) {
  console.log("## Baseline Population");
  printTable(contexts.map((context) => resultRow(label(context), context.baseline)));
  console.log("");
}

function printFeatureProfile(contexts: Context[], feature: FeatureProfile) {
  console.log(`## ${feature.label}`);
  if (feature.omitted) {
    console.log(feature.omitted);
    console.log("");
    return;
  }
  for (const context of contexts) {
    console.log(`### ${label(context)}`);
    printTable(categoryRows(context, feature));
    console.log("");
  }
}

function printYearReplication(contexts: Context[]) {
  console.log("## 2025 Vs 2026 Replication");
  for (const feature of FEATURES) {
    console.log(`### ${feature.label}`);
    printTable(FAMILIES.flatMap((family) =>
      feature.categoryOrder.map((category) => replicationRow(contexts, feature, family, category))
    ));
    console.log("");
  }
}

function printCrossFamilyConsistency(contexts: Context[]) {
  console.log("## Cross-Family Consistency");
  printTable(FEATURES.flatMap((feature) =>
    feature.categoryOrder.map((category) => {
      const favourableFamilies = FAMILIES.filter((family) => categoryFavourableInFamily(contexts, feature, family, category));
      return {
        feature: feature.label,
        category,
        "favourable families": favourableFamilies.map(familyLabel).join(", ") || "none",
        consistency: crossFamilyLabel(favourableFamilies.length),
      };
    })
  ));
  console.log("");
}

function printFeatureDiscrimination(contexts: Context[]) {
  console.log("## Feature Discrimination Summary");
  printTable(FEATURES.flatMap((feature) =>
    contexts.map((context) => discriminationRow(context, feature))
  ));
  console.log("");
}

function printConclusion(contexts: Context[]) {
  console.log("## Conclusion");
  printTable([
    { question: "1. Largest repeatable A/E differences?", answer: largestRepeatableAeDifferences(contexts) },
    { question: "2. Categories with A/E >1.0 in both years?", answer: categoriesAboveAeInBothYears(contexts) },
    { question: "3. Findings across multiple families?", answer: multiFamilyFindings(contexts) },
    { question: "4. Mostly explained by shorter SP?", answer: shorterPriceSignals(contexts) },
    { question: "5. Does Best L3 rank add useful value?", answer: bestL3Answer(contexts) },
    { question: "6. Speed rank or OR position more promising?", answer: speedOrAnswer(contexts) },
    { question: "7. Layoff/run-after-break informative?", answer: layoffAnswer(contexts) },
    { question: "8. Exact field size matter?", answer: fieldSizeAnswer(contexts) },
    { question: "9. Dedicated follow-up diagnostic?", answer: followUpAnswer(contexts) },
    { question: "10. Remain diagnostic?", answer: "Yes. These are single-feature profiles inside an already selected baseline; no production exposure is justified from one favourable cell." },
  ]);
  console.log("");
}

function printGuardrails() {
  console.log("## Guardrail Summary");
  printTable([
    { item: "Production logic changed", result: "No" },
    { item: "Research/Today/saved/frozen rules changed", result: "No" },
    { item: "Cache rebuild performed", result: "No" },
    { item: "Feature combinations tested", result: "No; single-feature profiles only" },
    { item: "Market rank caveat", result: "Derived from final SP, not an independent pre-race input" },
  ]);
}

function baselineRows(rows: RankedResearchRow[]) {
  return rows
    .filter((row) => row.features.trainerPriorWinRate !== null && row.features.trainerPriorWinRate >= 15)
    .filter((row) => {
      const fieldSize = fieldSizeForRow(row);
      return fieldSize !== null && fieldSize <= 5;
    });
}

function categoryRows(context: Context, feature: FeatureProfile) {
  return feature.categoryOrder.map((category) => {
    const rows = context.baseline.filter((row) => feature.categoryFor(row, context) === category);
    return resultRow(category, rows);
  });
}

function resultRow(group: string, rows: HistoricalTargetRunnerMetricsRow[]) {
  const summary = summarizeRows(rows);
  const odds = settledDecimalSps(rows);
  const ae = aeStats(rows);
  return {
    group,
    settled: summary.settledSelections,
    wins: summary.wins,
    "strike rate": pct(summary.winStrikeRate),
    "£1 P/L": money(summary.profitLoss),
    ROI: pct(summary.roiPercentage),
    "A/E": number(ae.ae),
    "avg decimal SP": number(average(odds)),
    "median decimal SP": number(median(odds)),
    sample: sampleWarning(summary.settledSelections),
  };
}

function replicationRow(
  contexts: Context[],
  feature: FeatureProfile,
  family: Family,
  category: string,
) {
  const context2025 = contexts.find((context) => context.family === family && context.year === "2025");
  const context2026 = contexts.find((context) => context.family === family && context.year === "2026");
  const left = context2025 ? rowsForCategory(context2025, feature, category) : [];
  const right = context2026 ? rowsForCategory(context2026, feature, category) : [];
  const leftSummary = summarizeRows(left);
  const rightSummary = summarizeRows(right);
  const leftAe = aeStats(left);
  const rightAe = aeStats(right);
  const baseLeft = context2025 ? summarizeRows(context2025.baseline) : null;
  const baseRight = context2026 ? summarizeRows(context2026.baseline) : null;
  return {
    family: familyLabel(family),
    category,
    "2025 settled": leftSummary.settledSelections,
    "2025 A/E": number(leftAe.ae),
    "2025 ROI": pct(leftSummary.roiPercentage),
    "2025 strike": pct(leftSummary.winStrikeRate),
    "2026 settled": rightSummary.settledSelections,
    "2026 A/E": number(rightAe.ae),
    "2026 ROI": pct(rightSummary.roiPercentage),
    "2026 strike": pct(rightSummary.winStrikeRate),
    replication: replicationLabel(leftSummary, rightSummary, leftAe, rightAe, baseLeft, baseRight),
  };
}

function rowsForCategory(context: Context, feature: FeatureProfile, category: string) {
  return context.baseline.filter((row) => feature.categoryFor(row, context) === category);
}

function categoryFavourableInFamily(
  contexts: Context[],
  feature: FeatureProfile,
  family: Family,
  category: string,
) {
  const context2025 = contexts.find((context) => context.family === family && context.year === "2025");
  const context2026 = contexts.find((context) => context.family === family && context.year === "2026");
  if (!context2025 || !context2026) return false;
  const left = rowsForCategory(context2025, feature, category);
  const right = rowsForCategory(context2026, feature, category);
  const leftSummary = summarizeRows(left);
  const rightSummary = summarizeRows(right);
  const leftAe = aeStats(left);
  const rightAe = aeStats(right);
  return leftSummary.settledSelections >= SAMPLE_FLOOR &&
    rightSummary.settledSelections >= SAMPLE_FLOOR &&
    (leftAe.ae ?? 0) > 1 &&
    (rightAe.ae ?? 0) > 1;
}

function discriminationRow(context: Context, feature: FeatureProfile) {
  const rows = feature.categoryOrder
    .map((category) => {
      const categoryRows = rowsForCategory(context, feature, category);
      const summary = summarizeRows(categoryRows);
      return {
        category,
        summary,
        ae: aeStats(categoryRows),
      };
    })
    .filter((row) => row.summary.settledSelections >= SAMPLE_FLOOR && row.ae.ae !== null);
  const byAe = [...rows].sort((left, right) => (right.ae.ae ?? -Infinity) - (left.ae.ae ?? -Infinity));
  const byStrike = [...rows].sort((left, right) => (right.summary.winStrikeRate ?? -Infinity) - (left.summary.winStrikeRate ?? -Infinity));
  const topAe = byAe[0] ?? null;
  const bottomAe = byAe[byAe.length - 1] ?? null;
  const topStrike = byStrike[0] ?? null;
  const bottomStrike = byStrike[byStrike.length - 1] ?? null;
  return {
    period: label(context),
    feature: feature.label,
    "highest A/E": topAe ? `${topAe.category} ${number(topAe.ae.ae)} (${topAe.summary.settledSelections})` : "n/a",
    "lowest A/E": bottomAe ? `${bottomAe.category} ${number(bottomAe.ae.ae)} (${bottomAe.summary.settledSelections})` : "n/a",
    "A/E spread": number(topAe && bottomAe ? (topAe.ae.ae ?? 0) - (bottomAe.ae.ae ?? 0) : null),
    "highest strike": topStrike ? `${topStrike.category} ${pct(topStrike.summary.winStrikeRate)} (${topStrike.summary.settledSelections})` : "n/a",
    "lowest strike": bottomStrike ? `${bottomStrike.category} ${pct(bottomStrike.summary.winStrikeRate)} (${bottomStrike.summary.settledSelections})` : "n/a",
    "strike spread": topStrike && bottomStrike ? `${number((topStrike.summary.winStrikeRate ?? 0) - (bottomStrike.summary.winStrikeRate ?? 0))}pp` : "n/a",
  };
}

function rankByRace(
  rows: RankedResearchRow[],
  valueFor: (row: RankedResearchRow) => number | null,
  higherIsBetter: boolean,
) {
  const rowsByRace = groupBy(rows, (row) => row.features.targetRaceId);
  const ranks = new Map<string, number>();
  for (const raceRows of rowsByRace.values()) {
    const rankable = raceRows
      .filter((row) => row.outcome.resultStatus !== "non_runner")
      .map((row) => ({ row, value: valueFor(row) }))
      .filter((entry): entry is { row: RankedResearchRow; value: number } => entry.value !== null && Number.isFinite(entry.value))
      .sort((left, right) =>
        (higherIsBetter ? right.value - left.value : left.value - right.value) ||
        left.row.features.targetRunnerId.localeCompare(right.row.features.targetRunnerId),
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

function summarizeRows(rows: HistoricalTargetRunnerMetricsRow[]): BacktestSummary {
  return summarizeSelections(rows.map(rowToSelection));
}

function rowToSelection(row: HistoricalTargetRunnerMetricsRow): BacktestSelection {
  return {
    id: row.features.targetRunnerId,
    definitionId: "trainer-small-field-feature-profile",
    selectedReason: "Trainer small-field feature profile",
    features: row.features,
    derived: deriveBacktestFeatureValues(row.features),
    outcome: row.outcome,
    settlement: settleSelection(row.outcome),
  };
}

function aeStats(rows: HistoricalTargetRunnerMetricsRow[]): AeStats {
  const settled = rows
    .map((row) => ({ row, settlement: settleSelection(row.outcome) }))
    .filter((entry) => entry.settlement !== null && entry.settlement.settlementOddsDecimal > 0);
  const expectedWins = settled.reduce((total, entry) => total + (1 / entry.settlement!.settlementOddsDecimal), 0);
  const wins = settled.filter((entry) => entry.row.outcome.won).length;
  return {
    runners: settled.length,
    wins,
    expectedWins,
    ae: expectedWins === 0 ? null : wins / expectedWins,
  };
}

function settledDecimalSps(rows: HistoricalTargetRunnerMetricsRow[]) {
  return rows
    .map((row) => settleSelection(row.outcome)?.settlementOddsDecimal ?? null)
    .filter(isNumber)
    .filter((value) => value > 0);
}

function replicationLabel(
  leftSummary: BacktestSummary,
  rightSummary: BacktestSummary,
  leftAe: AeStats,
  rightAe: AeStats,
  baseLeft: BacktestSummary | null,
  baseRight: BacktestSummary | null,
) {
  if (leftSummary.settledSelections < SAMPLE_FLOOR || rightSummary.settledSelections < SAMPLE_FLOOR) return "too small";
  const leftAeGood = (leftAe.ae ?? 0) > 1;
  const rightAeGood = (rightAe.ae ?? 0) > 1;
  const leftRoiGood = (leftSummary.roiPercentage ?? -Infinity) > 0;
  const rightRoiGood = (rightSummary.roiPercentage ?? -Infinity) > 0;
  const leftStrikeGood = baseLeft?.winStrikeRate !== null && baseLeft?.winStrikeRate !== undefined && (leftSummary.winStrikeRate ?? 0) > baseLeft.winStrikeRate;
  const rightStrikeGood = baseRight?.winStrikeRate !== null && baseRight?.winStrikeRate !== undefined && (rightSummary.winStrikeRate ?? 0) > baseRight.winStrikeRate;
  if (leftAeGood && rightAeGood && leftRoiGood && rightRoiGood) return "A/E and ROI positive both years";
  if (leftAeGood && rightAeGood) return "A/E >1 both years";
  if (leftRoiGood && rightRoiGood) return "ROI positive both years";
  if (leftStrikeGood && rightStrikeGood) return "higher strike both years";
  if ((leftAeGood || leftRoiGood) && !(rightAeGood || rightRoiGood)) return "2025 advantage disappears/reverses";
  return "inconsistent";
}

function largestRepeatableAeDifferences(contexts: Context[]) {
  return FEATURES.map((feature) => {
    const spreads = contexts.map((context) => {
      const row = discriminationRow(context, feature);
      const spread = Number.parseFloat(String(row["A/E spread"]));
      return Number.isFinite(spread) ? spread : null;
    }).filter(isNumber);
    return { feature: feature.label, spread: average(spreads) };
  })
    .sort((left, right) => (right.spread ?? -Infinity) - (left.spread ?? -Infinity))
    .slice(0, 3)
    .map((entry) => `${entry.feature} avg A/E spread ${number(entry.spread)}`)
    .join("; ");
}

function categoriesAboveAeInBothYears(contexts: Context[]) {
  const items = FEATURES.flatMap((feature) =>
    FAMILIES.flatMap((family) =>
      feature.categoryOrder
        .filter((category) => categoryFavourableInFamily(contexts, feature, family, category))
        .map((category) => `${familyLabel(family)} ${feature.label}: ${category}`)
    )
  );
  return items.length > 0 ? items.join("; ") : "No adequately sampled category has A/E >1.0 in both years.";
}

function multiFamilyFindings(contexts: Context[]) {
  const items = FEATURES.flatMap((feature) =>
    feature.categoryOrder.map((category) => {
      const families = FAMILIES.filter((family) => categoryFavourableInFamily(contexts, feature, family, category));
      return families.length >= 2 ? `${feature.label}: ${category} (${families.map(familyLabel).join(", ")})` : null;
    })
  ).filter((value): value is string => value !== null);
  return items.length > 0 ? items.join("; ") : "No A/E-positive category repeats across two or more families with adequate samples.";
}

function shorterPriceSignals(contexts: Context[]) {
  const candidates = [
    { feature: "Market rank", category: "favourite" },
    { feature: "Exact field size", category: "2" },
    { feature: "Best L3 rank", category: "rank 1" },
  ];
  return candidates.map((candidate) => {
    const feature = FEATURES.find((item) => item.label === candidate.feature)!;
    const odds = contexts.flatMap((context) => settledDecimalSps(rowsForCategory(context, feature, candidate.category)));
    const baselineOdds = contexts.flatMap((context) => settledDecimalSps(context.baseline));
    return `${candidate.feature} ${candidate.category}: avg SP ${number(average(odds))} vs baseline ${number(average(baselineOdds))}`;
  }).join("; ");
}

function bestL3Answer(contexts: Context[]) {
  return familyCategorySummary(contexts, "Best L3 rank", "rank 1");
}

function speedOrAnswer(contexts: Context[]) {
  return `${familyCategorySummary(contexts, "Latest speed rank", "rank 1")} | ${familyCategorySummary(contexts, "Official Rating position", "top-rated")}`;
}

function layoffAnswer(contexts: Context[]) {
  return `${familyCategorySummary(contexts, "Days since run", "15-30")} | ${familyCategorySummary(contexts, "Run after break", "first run after break")}`;
}

function fieldSizeAnswer(contexts: Context[]) {
  return ["2", "3", "4", "5"].map((category) =>
    familyCategorySummary(contexts, "Exact field size", category)
  ).join(" | ");
}

function followUpAnswer(contexts: Context[]) {
  const multiFamily = FEATURES.flatMap((feature) =>
    feature.categoryOrder.filter((category) =>
      FAMILIES.filter((family) => categoryFavourableInFamily(contexts, feature, family, category)).length >= 2
    ).map((category) => `${feature.label}: ${category}`)
  );
  return multiFamily.length > 0
    ? `Possible follow-up candidates: ${multiFamily.join("; ")}. Keep it pre-specified and avoid combinations in this pass.`
    : "No single feature is strong enough across families for a follow-up beyond continued diagnostics.";
}

function familyCategorySummary(contexts: Context[], featureLabel: string, category: string) {
  const feature = FEATURES.find((item) => item.label === featureLabel)!;
  return FAMILIES.map((family) => {
    const parts = YEARS.map((year) => {
      const context = contexts.find((item) => item.family === family && item.year === year)!;
      const rows = rowsForCategory(context, feature, category);
      return `${year} A/E ${number(aeStats(rows).ae)}, ROI ${pct(summarizeRows(rows).roiPercentage)}, n=${summarizeRows(rows).settledSelections}`;
    });
    return `${familyLabel(family)} ${featureLabel} ${category}: ${parts.join(" / ")}`;
  }).join("; ");
}

function rankCategory(rank: number | null | undefined) {
  if (rank === null || rank === undefined) return "missing";
  if (rank === 1) return "rank 1";
  if (rank === 2) return "rank 2";
  return "rank 3+";
}

function orPositionCategory(rank: number | null) {
  if (rank === null) return "missing";
  if (rank === 1) return "top-rated";
  if (rank === 2) return "second";
  return "third+";
}

function daysSinceRunBucket(days: number | null) {
  if (days === null) return "missing";
  if (days <= 14) return "0-14";
  if (days <= 30) return "15-30";
  if (days <= 60) return "31-60";
  if (days <= 120) return "61-120";
  return "121+";
}

function runAfterBreakBucket(value: number | null) {
  if (value === null) return "missing";
  if (value === 1) return "first run after break";
  if (value === 2) return "second run after break";
  return "third+";
}

function trainerPriorRunsBucket(value: number) {
  if (value < 20) return "<20";
  if (value < 50) return "20-49";
  if (value < 100) return "50-99";
  return "100+";
}

function marketRankCategory(rank: number | null) {
  if (rank === null) return "missing";
  if (rank === 1) return "favourite";
  if (rank === 2) return "second favourite";
  return "third+";
}

function raceClassBucket(value: string | null) {
  const raceClass = raceClassNumber(value);
  if (raceClass === null) return "unknown";
  if (raceClass <= 2) return "Class 1-2";
  if (raceClass === 3) return "Class 3";
  if (raceClass === 4) return "Class 4";
  if (raceClass === 5) return "Class 5";
  return "Class 6";
}

function exactFieldSizeBucket(value: number | null) {
  if (value === 2) return "2";
  if (value === 3) return "3";
  if (value === 4) return "4";
  if (value === 5) return "5";
  return "other/missing";
}

function fieldSizeForRow(row: HistoricalTargetRunnerMetricsRow) {
  return row.features.actualRunnerCount ?? row.features.declaredRunnerCount;
}

function spForRow(row: HistoricalTargetRunnerMetricsRow) {
  return settleSelection(row.outcome)?.settlementOddsDecimal ?? null;
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

function label(context: Pick<Context, "family" | "year">) {
  return `${familyLabel(context.family)} ${context.year}`;
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

function crossFamilyLabel(count: number) {
  if (count === 3) return "favourable across all 3";
  if (count === 2) return "favourable across 2 families";
  if (count === 1) return "favourable in one family only";
  return "inconsistent";
}

function sampleWarning(settled: number) {
  if (settled < SAMPLE_FLOOR) return "<25 settled";
  if (settled < 100) return "25-99 settled";
  return ">=100 settled";
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
