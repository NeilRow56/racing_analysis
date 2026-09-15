import { createDbConnection } from "@/db";
import {
  deriveBacktestFeatureValues,
  settleSelection,
  summarizeSelections,
  type BacktestSelection,
  type BacktestSummary,
} from "@/lib/racing/backtest";
import {
  loadLatestBacktestFeatureCacheForYear,
  type LoadedBacktestFeatureCache,
} from "@/lib/racing/backtest-cache";
import type {
  HistoricalPreRaceFeatureRow,
  HistoricalTargetRunnerMetricsRow,
} from "@/lib/racing/historical-target-metrics";
import {
  classifyHandicapStatus,
  defaultResearchRule,
  evaluateResearchRule,
  parseResearchRule,
} from "@/lib/racing/research-rule";
import { raceClassNumber } from "@/lib/racing/research-rule-classes";
import {
  listSavedResearchRulesWithDb,
  type SavedResearchRule,
} from "@/lib/racing/saved-research-rules";
import { getTrainerCohortForRule } from "@/lib/racing/trainer-cohorts";

const FAMILY = "turf_flat" as const;
const PERIODS = [
  { year: "2025", from: "2025-02-02", to: "2025-09-12" },
  { year: "2026", from: "2026-02-02", to: "2026-09-12" },
] as const;

type Period = typeof PERIODS[number];
type PeriodRows = {
  period: Period;
  cache: LoadedBacktestFeatureCache;
  rows: HistoricalTargetRunnerMetricsRow[];
};

type RulePeriodResult = {
  period: PeriodRows;
  result: ReturnType<typeof evaluateResearchRule>;
};

type EntityStats = {
  id: string;
  name: string;
  selections: BacktestSelection[];
  summary: BacktestSummary;
};

type EntityComparison = {
  id: string;
  name: string;
  left: EntityStats;
  right: EntityStats;
  deltaSelections: number;
  deltaStrikeRate: number | null;
  deltaProfitLoss: number;
  deltaRoi: number | null;
};

type NumericField = keyof Pick<
  HistoricalPreRaceFeatureRow,
  | "officialRating"
  | "latestSpeedRating"
  | "latestPerformanceRating"
  | "bestSpeedLast3"
  | "averageSpeedLast3"
  | "trainerPriorRuns"
  | "trainerPriorWins"
  | "trainerPriorWinRate"
  | "daysSinceLastRun"
>;

async function main() {
  const frozenTurfSprintRule = await loadFrozenTurfSprintRule();
  const periods = await Promise.all(PERIODS.map(loadPeriodRows));

  console.log("# Matched-Period Turf Diagnostic");
  console.log("");
  console.log(`Family: ${FAMILY}`);
  console.log(`Periods: ${PERIODS.map((period) => `${period.from} to ${period.to}`).join(" vs ")}`);
  console.log("Caches: existing latest compatible full-year Turf feature caches");
  console.log("");

  console.log("## Unfiltered Turf Baseline");
  printTable(periods.map((period) => baselineRow(period)));
  console.log("");

  console.log("## Winner SP Distribution");
  for (const period of periods) {
    console.log(`### ${period.period.year}`);
    printTable(winnerSpDistribution(period.rows));
    console.log("");
  }

  console.log("## Favourite Behaviour");
  printTable(periods.map(favouriteCompletenessRow));
  console.log("Feature-cache pre-race odds are required for favourite diagnostics; rows with missing odds are skipped.");
  console.log("");

  console.log("## Field Size Mix");
  for (const period of periods) {
    console.log(`### ${period.period.year}`);
    printTable(fieldSizeSummary(period.rows));
    console.log("");
  }

  console.log("## Race-Type Mix");
  for (const period of periods) {
    console.log(`### ${period.period.year}`);
    printTable(groupRows(period.rows, (row) => classifyHandicapStatus(row.features)).map(summaryGroup));
    console.log("");
  }

  console.log("## Class Mix");
  for (const period of periods) {
    console.log(`### ${period.period.year}`);
    printTable(groupRows(period.rows, (row) => classBucket(row.features)).map(summaryGroup));
    console.log("");
  }

  console.log("## Distance Mix");
  console.log("Distance buckets used here: sprint <=7f, mile >7f-9f, middle >9f-13f, staying >13f.");
  for (const period of periods) {
    console.log(`### ${period.period.year}`);
    printTable(groupRows(period.rows, (row) => distanceBucket(row.features.distanceYards)).map(summaryGroup));
    console.log("");
  }

  console.log("## Feature Completeness");
  for (const period of periods) {
    console.log(`### ${period.period.year}`);
    printTable(featureCompleteness(period.rows));
    console.log("");
  }

  console.log("## Trainer Population");
  for (const period of periods) {
    console.log(`### ${period.period.year}`);
    const trainer = trainerPopulation(period.rows);
    printTable([trainer.summary]);
    console.log("");
    printTable(trainer.top20);
    console.log("");
  }

  console.log("## Country / Jurisdiction");
  printTable(periods.map(countryAvailabilityRow));
  console.log("Country/jurisdiction is not part of the Turf feature-cache row shape, so jurisdiction mix is not reliable from this cache alone.");
  console.log("");

  await frozenTurfSprintRuleDiagnostic(periods, frozenTurfSprintRule);
}

async function loadPeriodRows(period: Period): Promise<PeriodRows> {
  const cache = await loadLatestBacktestFeatureCacheForYear({ year: period.year, family: FAMILY });
  if (!cache) {
    throw new Error(`No compatible ${FAMILY} cache found for ${period.year}`);
  }
  const rows = cache.rows
    .filter((row) => row.features.raceDate >= period.from)
    .filter((row) => row.features.raceDate <= period.to)
    .filter((row) => row.features.raceCode === "turf")
    .sort(compareRows);
  return { period, cache, rows };
}

function baselineRow(period: PeriodRows) {
  const rule = {
    ...defaultResearchRule(FAMILY),
    dateRange: { from: period.period.from, to: period.period.to },
  };
  const result = evaluateResearchRule({ rows: period.cache.rows, rule });
  return {
    year: period.period.year,
    races: distinct(period.rows.map((row) => row.features.targetRaceId)),
    runners: period.rows.length,
    settled: result.summary.settledSelections,
    winners: result.summary.wins,
    "strike rate": pct(result.summary.winStrikeRate),
    "£1 P/L": money(result.summary.profitLoss),
    ROI: pct(result.summary.roiPercentage),
    "max losing run": result.summary.maxConsecutiveLosers,
  };
}

function winnerSpDistribution(rows: HistoricalTargetRunnerMetricsRow[]) {
  const winners = rows
    .map((row) => ({ row, settlement: settleSelection(row.outcome) }))
    .filter((entry) => entry.settlement && entry.row.outcome.won)
    .map((entry) => entry.settlement!.settlementOddsDecimal - 1)
    .sort((left, right) => left - right);
  const totalWinnerProfit = winners.reduce((total, sp) => total + sp, 0);
  const bands = [
    { label: "<=2/1", test: (sp: number) => sp <= 2 },
    { label: ">2 to 5/1", test: (sp: number) => sp > 2 && sp <= 5 },
    { label: ">5 to 10/1", test: (sp: number) => sp > 5 && sp <= 10 },
    { label: ">10 to 20/1", test: (sp: number) => sp > 10 && sp <= 20 },
    { label: ">20 to 33/1", test: (sp: number) => sp > 20 && sp <= 33 },
    { label: ">33/1", test: (sp: number) => sp > 33 },
  ];
  const rowsByBand = bands.map((band) => {
    const values = winners.filter(band.test);
    const profit = values.reduce((total, sp) => total + sp, 0);
    return {
      band: band.label,
      winners: values.length,
      "% winners": pct(percent(values.length, winners.length)),
      "winner profit": money(profit),
      "% winner profit": pct(percent(profit, totalWinnerProfit)),
    };
  });
  return [
    {
      band: "all winners",
      winners: winners.length,
      "% winners": "100.0%",
      "winner profit": money(totalWinnerProfit),
      "% winner profit": "100.0%",
      "avg SP": odds(average(winners)),
      "median SP": odds(median(winners)),
      "largest SP": odds(winners.at(-1) ?? null),
    },
    ...rowsByBand,
    {
      band: ">20/1 total",
      winners: winners.filter((sp) => sp > 20).length,
      "% winners": pct(percent(winners.filter((sp) => sp > 20).length, winners.length)),
      "winner profit": money(winners.filter((sp) => sp > 20).reduce((total, sp) => total + sp, 0)),
      "% winner profit": pct(percent(winners.filter((sp) => sp > 20).reduce((total, sp) => total + sp, 0), totalWinnerProfit)),
      "avg SP": "",
      "median SP": "",
      "largest SP": "",
    },
    {
      band: ">33/1 total",
      winners: winners.filter((sp) => sp > 33).length,
      "% winners": pct(percent(winners.filter((sp) => sp > 33).length, winners.length)),
      "winner profit": money(winners.filter((sp) => sp > 33).reduce((total, sp) => total + sp, 0)),
      "% winner profit": pct(percent(winners.filter((sp) => sp > 33).reduce((total, sp) => total + sp, 0), totalWinnerProfit)),
      "avg SP": "",
      "median SP": "",
      "largest SP": "",
    },
  ];
}

function favouriteCompletenessRow(period: PeriodRows) {
  const rowsWithOdds = period.rows.filter((row) => row.features.oddsDecimal !== null);
  return {
    year: period.period.year,
    runners: period.rows.length,
    "rows with pre-race odds": rowsWithOdds.length,
    completeness: pct(percent(rowsWithOdds.length, period.rows.length)),
    diagnostic: rowsWithOdds.length === 0 ? "skipped: odds unavailable in feature cache" : "available",
  };
}

function fieldSizeSummary(rows: HistoricalTargetRunnerMetricsRow[]) {
  const races = firstRowsByRace(rows);
  const sizes = races
    .map((row) => fieldSize(row.features))
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right);
  const bands: Array<{ label: string; test: (value: number | null) => boolean }> = [
    { label: "<=5", test: (value) => value !== null && value <= 5 },
    { label: "6-8", test: (value) => value !== null && value >= 6 && value <= 8 },
    { label: "9-12", test: (value) => value !== null && value >= 9 && value <= 12 },
    { label: "13+", test: (value) => value !== null && value >= 13 },
    { label: "missing", test: (value: number | null) => value === null },
  ];
  return [
    {
      band: "all races",
      races: races.length,
      runners: rows.length,
      "avg field": number(average(sizes)),
      "median field": number(median(sizes)),
    },
    ...bands.map((band) => {
      const raceRows = races.filter((row) => band.test(fieldSize(row.features)));
      const raceIds = new Set(raceRows.map((row) => row.features.targetRaceId));
      return {
        band: band.label,
        races: raceRows.length,
        runners: rows.filter((row) => raceIds.has(row.features.targetRaceId)).length,
        "avg field": "",
        "median field": "",
      };
    }),
  ];
}

function featureCompleteness(rows: HistoricalTargetRunnerMetricsRow[]) {
  const fields: Array<{ label: string; get: (row: HistoricalTargetRunnerMetricsRow) => unknown }> = [
    { label: "officialRating", get: (row) => value(row.features, "officialRating") },
    { label: "latestSpeedRating", get: (row) => value(row.features, "latestSpeedRating") },
    { label: "latestPerformanceRating", get: (row) => value(row.features, "latestPerformanceRating") },
    { label: "bestSpeedLast3", get: (row) => value(row.features, "bestSpeedLast3") },
    { label: "averageSpeedLast3", get: (row) => value(row.features, "averageSpeedLast3") },
    { label: "trainerPriorRuns", get: (row) => value(row.features, "trainerPriorRuns") },
    { label: "trainerPriorWins", get: (row) => value(row.features, "trainerPriorWins") },
    { label: "trainerPriorWinRate", get: (row) => value(row.features, "trainerPriorWinRate") },
    { label: "daysSinceLastRun", get: (row) => value(row.features, "daysSinceLastRun") },
    { label: "result SP", get: (row) => row.outcome.startingPriceDecimal },
  ];
  return fields.map((field) => {
    const missing = rows.filter((row) => isMissing(field.get(row))).length;
    return {
      field: field.label,
      rows: rows.length,
      missing,
      "missing %": pct(percent(missing, rows.length)),
    };
  });
}

function trainerPopulation(rows: HistoricalTargetRunnerMetricsRow[]) {
  const counts = new Map<string, { trainerId: string; trainerName: string; runners: number }>();
  for (const row of rows) {
    const trainerId = row.features.trainerId;
    if (!trainerId) continue;
    const current = counts.get(trainerId) ?? {
      trainerId,
      trainerName: row.features.trainerName ?? "(missing name)",
      runners: 0,
    };
    current.runners += 1;
    counts.set(trainerId, current);
  }
  const ranked = [...counts.values()].sort((left, right) =>
    right.runners - left.runners ||
    left.trainerName.localeCompare(right.trainerName) ||
    left.trainerId.localeCompare(right.trainerId),
  );
  const top10Runners = ranked.slice(0, 10).reduce((total, trainer) => total + trainer.runners, 0);
  return {
    summary: {
      "distinct trainerIds": ranked.length,
      "trainers >=50 runners": ranked.filter((trainer) => trainer.runners >= 50).length,
      "top 10 runner share": pct(percent(top10Runners, rows.length)),
    },
    top20: ranked.slice(0, 20).map((trainer, index) => ({
      rank: index + 1,
      trainer: trainer.trainerName,
      trainerId: trainer.trainerId,
      runners: trainer.runners,
      "runner share": pct(percent(trainer.runners, rows.length)),
    })),
  };
}

function countryAvailabilityRow(period: PeriodRows) {
  const rowsWithCountry = period.rows.filter((row) => {
    const feature = row.features as unknown as Record<string, unknown>;
    return !isMissing(feature.country) || !isMissing(feature.jurisdiction);
  }).length;
  return {
    year: period.period.year,
    runners: period.rows.length,
    "rows with country/jurisdiction field": rowsWithCountry,
    completeness: pct(percent(rowsWithCountry, period.rows.length)),
  };
}

async function loadFrozenTurfSprintRule() {
  const { client, db } = createDbConnection();
  try {
    const savedRules = await listSavedResearchRulesWithDb(db);
    return selectFrozenTurfSprintRule(savedRules);
  } finally {
    await client.end();
  }
}

async function frozenTurfSprintRuleDiagnostic(periods: PeriodRows[], selected: SavedResearchRule | null) {
  let cohortConnection: ReturnType<typeof createDbConnection> | null = null;
  try {
    console.log("## Frozen Turf Sprint Rule");
    if (!selected) {
      console.log("No frozen Turf rule with sprint wording was found; skipping frozen-rule diagnostic.");
      return;
    }
    const parsed = parseResearchRule(JSON.stringify(selected.canonicalRule));
    if (!parsed) {
      console.log(`Could not parse frozen rule ${selected.id}; skipping frozen-rule diagnostic.`);
      return;
    }
    cohortConnection = parsed.runner.trainerCohort ? createDbConnection() : null;
    console.log(`Rule: ${selected.name} (${selected.id})`);
    console.log(`Saved rule status: ${selected.status}; family: ${selected.family}`);
    console.log("");

    const results: RulePeriodResult[] = [];
    for (const period of periods) {
      const rule = { ...parsed, dateRange: { from: period.period.from, to: period.period.to } };
      const trainerCohort = rule.runner.trainerCohort
        ? await getTrainerCohortForRule(cohortConnection!.db, rule, Number(period.period.year))
        : null;
      const result = evaluateResearchRule({
        rows: period.cache.rows,
        rule,
        trainerCohort,
      });
      results.push({ period, result });
    }

    console.log("### Overall");
    printTable(results.map(({ period, result }) => summaryTableRow(period.period.year, result.summary)));
    console.log("");

    for (const { period, result } of results) {
      console.log(`### ${period.period.year} Monthly`);
      printTable(groupSelections(result.selectedRunners, (selection) => selection.features.raceDate.slice(0, 7)).map(summarySelectionGroup));
      console.log("");
      console.log(`### ${period.period.year} Result SP Band`);
      printTable(groupSelections(result.selectedRunners, (selection) => spBand(selection.settlement?.settlementOddsDecimal ?? null)).map(summarySelectionGroup));
      console.log("");
      console.log(`### ${period.period.year} Handicap`);
      printTable(groupSelections(result.selectedRunners, (selection) => classifyHandicapStatus(selection.features)).map(summarySelectionGroup));
      console.log("");
      console.log(`### ${period.period.year} Class`);
      printTable(groupSelections(result.selectedRunners, (selection) => classBucket(selection.features)).map(summarySelectionGroup));
      console.log("");
      console.log(`### ${period.period.year} Distance`);
      printTable(groupSelections(result.selectedRunners, (selection) => distanceBucket(selection.features.distanceYards)).map(summarySelectionGroup));
      console.log("");
    }

    frozenRuleDivergenceDiagnostic(results, periods);
  } finally {
    await cohortConnection?.client.end();
  }
}

function frozenRuleDivergenceDiagnostic(results: RulePeriodResult[], periods: PeriodRows[]) {
  const [left, right] = results;
  if (!left || !right) {
    return;
  }
  const totalSwing = right.result.summary.profitLoss - left.result.summary.profitLoss;
  console.log("## Frozen Turf Sprint Divergence Attribution");
  printTable([{
    "2025 P/L": money(left.result.summary.profitLoss),
    "2026 P/L": money(right.result.summary.profitLoss),
    "P/L swing": money(totalSwing),
    "deterioration magnitude": money(Math.abs(totalSwing)),
  }]);
  console.log("");

  const trainerComparisons = compareEntities(
    left.result.selectedRunners,
    right.result.selectedRunners,
    (selection) => selection.features.trainerId ?? "missing-trainer",
    (selection) => selection.features.trainerName ?? "(missing trainer)",
  );
  const courseComparisons = compareEntities(
    left.result.selectedRunners,
    right.result.selectedRunners,
    (selection) => selection.features.courseId,
    (selection) => selection.features.courseName,
  );

  console.log("### Trainer-by-Trainer Comparison");
  printTable(trainerComparisons.map(entityComparisonRow));
  console.log("");
  console.log("### Top 10 Trainer Deterioration Contributors");
  printTable(worstContributors(trainerComparisons).map(entitySwingRow));
  console.log("");
  console.log("### Top 10 Trainer 2026 Positive Contributors");
  printTable(bestCurrentContributors(trainerComparisons).map(entityCurrentRow));
  console.log("");
  printTable([shareRow("trainers", trainerComparisons, totalSwing)]);
  console.log("");

  console.log("### Course-by-Course Comparison");
  printTable(courseComparisons.map(entityComparisonRow));
  console.log("");
  console.log("### Top 10 Course Deterioration Contributors");
  printTable(worstContributors(courseComparisons).map(entitySwingRow));
  console.log("");
  console.log("### Top 10 Course 2026 Positive Contributors");
  printTable(bestCurrentContributors(courseComparisons).map(entityCurrentRow));
  console.log("");
  printTable([shareRow("courses", courseComparisons, totalSwing)]);
  console.log("");

  console.log("### Selection Growth");
  const leftRate = percent(left.result.summary.selections, periods[0]!.rows.length);
  const rightRate = percent(right.result.summary.selections, periods[1]!.rows.length);
  printTable([{
    "2025 selections": left.result.summary.selections,
    "2025 all Turf runners": periods[0]!.rows.length,
    "2025 selection rate": pct(leftRate),
    "2026 selections": right.result.summary.selections,
    "2026 all Turf runners": periods[1]!.rows.length,
    "2026 selection rate": pct(rightRate),
    "selection rate change": pp(deltaNullable(rightRate, leftRate)),
  }]);
  console.log("");
  console.log("#### Largest Trainer Selection Increases");
  printTable(largestSelectionIncreases(trainerComparisons).map(entitySelectionGrowthRow));
  console.log("");
  console.log("#### Largest Course Selection Increases");
  printTable(largestSelectionIncreases(courseComparisons).map(entitySelectionGrowthRow));
  console.log("");
  console.log("#### Trainer Selection-Growth Buckets");
  printTable(selectionGrowthBuckets(trainerComparisons, "trainer"));
  console.log("");
  console.log("#### Course Selection-Growth Buckets");
  printTable(selectionGrowthBuckets(courseComparisons, "course"));
  console.log("");

  console.log("### Shared vs New Population");
  console.log("#### Trainers");
  printTable(sharedPopulationRows(left.result.selectedRunners, right.result.selectedRunners, trainerComparisons));
  console.log("");
  console.log("#### Courses");
  printTable(sharedPopulationRows(left.result.selectedRunners, right.result.selectedRunners, courseComparisons));
  console.log("");

  console.log("### Stable-Core Diagnostic");
  console.log("Diagnostic only: entities with at least 25 settled selections in both years.");
  printTable([
    stableCoreRow("trainers", left.result.selectedRunners, right.result.selectedRunners, trainerComparisons),
    stableCoreRow("courses", left.result.selectedRunners, right.result.selectedRunners, courseComparisons),
  ]);
  console.log("");

  console.log("### Price-Band Attribution: Worst Trainer Swings");
  for (const comparison of worstContributors(trainerComparisons).slice(0, 5)) {
    console.log(`#### ${comparison.name} (${comparison.id})`);
    printTable(priceBandComparisonRows(comparison.left.selections, comparison.right.selections));
    console.log("");
  }

  console.log("### Price-Band Attribution: Worst Course Swings");
  for (const comparison of worstContributors(courseComparisons).slice(0, 5)) {
    console.log(`#### ${comparison.name} (${comparison.id})`);
    printTable(priceBandComparisonRows(comparison.left.selections, comparison.right.selections));
    console.log("");
  }

  console.log("### Monthly Attribution Side-by-Side");
  const monthly = compareSelectionGroups(
    left.result.selectedRunners,
    right.result.selectedRunners,
    (selection) => selection.features.raceDate.slice(5, 7),
  );
  printTable(monthly.map((comparison) => ({
    month: monthLabel(comparison.id),
    ...entityComparisonSummaryFields(comparison),
  })));
  console.log("");
  console.log("#### Worst Monthly Divergence");
  printTable(worstContributors(monthly).map(entitySwingRow));
  console.log("");

  console.log("### Concentration Diagnostics");
  printTable([
    concentrationRow("2025 trainers", left.result.selectedRunners, (selection) => selection.features.trainerId ?? "missing-trainer"),
    concentrationRow("2026 trainers", right.result.selectedRunners, (selection) => selection.features.trainerId ?? "missing-trainer"),
    concentrationRow("2025 courses", left.result.selectedRunners, (selection) => selection.features.courseId),
    concentrationRow("2026 courses", right.result.selectedRunners, (selection) => selection.features.courseId),
  ]);
  console.log("");

  console.log("### Interpretation");
  for (const line of interpretationLines({
    trainerComparisons,
    courseComparisons,
    monthly,
    totalSwing,
  })) {
    console.log(`- ${line}`);
  }
  console.log("");
}

function compareEntities(
  left: BacktestSelection[],
  right: BacktestSelection[],
  idFor: (selection: BacktestSelection) => string,
  nameFor: (selection: BacktestSelection) => string,
) {
  return compareEntityStatMaps(entityStats(left, idFor, nameFor), entityStats(right, idFor, nameFor));
}

function compareSelectionGroups(
  left: BacktestSelection[],
  right: BacktestSelection[],
  idFor: (selection: BacktestSelection) => string,
) {
  return compareEntityStatMaps(
    entityStats(left, idFor, idFor),
    entityStats(right, idFor, idFor),
  );
}

function compareEntityStatMaps(left: Map<string, EntityStats>, right: Map<string, EntityStats>) {
  return [...new Set([...left.keys(), ...right.keys()])]
    .map((id): EntityComparison => {
      const leftStats = left.get(id) ?? emptyEntityStats(id, right.get(id)?.name ?? id);
      const rightStats = right.get(id) ?? emptyEntityStats(id, left.get(id)?.name ?? id);
      const deltaStrikeRate = deltaNullable(rightStats.summary.winStrikeRate, leftStats.summary.winStrikeRate);
      const deltaRoi = deltaNullable(rightStats.summary.roiPercentage, leftStats.summary.roiPercentage);
      return {
        id,
        name: rightStats.name !== id ? rightStats.name : leftStats.name,
        left: leftStats,
        right: rightStats,
        deltaSelections: rightStats.summary.selections - leftStats.summary.selections,
        deltaStrikeRate,
        deltaProfitLoss: rightStats.summary.profitLoss - leftStats.summary.profitLoss,
        deltaRoi,
      };
    })
    .sort((leftComparison, rightComparison) =>
      Math.abs(rightComparison.deltaProfitLoss) - Math.abs(leftComparison.deltaProfitLoss) ||
      leftComparison.name.localeCompare(rightComparison.name) ||
      leftComparison.id.localeCompare(rightComparison.id),
    );
}

function entityStats(
  selections: BacktestSelection[],
  idFor: (selection: BacktestSelection) => string,
  nameFor: (selection: BacktestSelection) => string,
) {
  const groups = new Map<string, { name: string; selections: BacktestSelection[] }>();
  for (const selection of selections) {
    const id = idFor(selection);
    const current = groups.get(id) ?? { name: nameFor(selection), selections: [] };
    current.selections.push(selection);
    groups.set(id, current);
  }
  return new Map([...groups.entries()].map(([id, group]) => [
    id,
    {
      id,
      name: group.name,
      selections: group.selections,
      summary: summarizeSelections(group.selections),
    },
  ]));
}

function emptyEntityStats(id: string, name: string): EntityStats {
  return {
    id,
    name,
    selections: [],
    summary: summarizeSelections([]),
  };
}

function entityComparisonRow(comparison: EntityComparison) {
  return {
    id: comparison.id,
    name: comparison.name,
    "2025 selections": comparison.left.summary.selections,
    "2025 settled": comparison.left.summary.settledSelections,
    "2025 winners": comparison.left.summary.wins,
    "2025 strike": pct(comparison.left.summary.winStrikeRate),
    "2025 P/L": money(comparison.left.summary.profitLoss),
    "2025 ROI": pct(comparison.left.summary.roiPercentage),
    "2025 sample": sampleFlag(comparison.left.summary.settledSelections),
    "2026 selections": comparison.right.summary.selections,
    "2026 settled": comparison.right.summary.settledSelections,
    "2026 winners": comparison.right.summary.wins,
    "2026 strike": pct(comparison.right.summary.winStrikeRate),
    "2026 P/L": money(comparison.right.summary.profitLoss),
    "2026 ROI": pct(comparison.right.summary.roiPercentage),
    "2026 sample": sampleFlag(comparison.right.summary.settledSelections),
    "selection change": signedInteger(comparison.deltaSelections),
    "strike change": pp(comparison.deltaStrikeRate),
    "P/L change": money(comparison.deltaProfitLoss),
    "ROI change": pp(comparison.deltaRoi),
  };
}

function entityComparisonSummaryFields(comparison: EntityComparison) {
  return {
    "2025 selections": comparison.left.summary.selections,
    "2025 settled": comparison.left.summary.settledSelections,
    "2025 winners": comparison.left.summary.wins,
    "2025 strike": pct(comparison.left.summary.winStrikeRate),
    "2025 P/L": money(comparison.left.summary.profitLoss),
    "2025 ROI": pct(comparison.left.summary.roiPercentage),
    "2026 selections": comparison.right.summary.selections,
    "2026 settled": comparison.right.summary.settledSelections,
    "2026 winners": comparison.right.summary.wins,
    "2026 strike": pct(comparison.right.summary.winStrikeRate),
    "2026 P/L": money(comparison.right.summary.profitLoss),
    "2026 ROI": pct(comparison.right.summary.roiPercentage),
    "selection change": signedInteger(comparison.deltaSelections),
    "strike change": pp(comparison.deltaStrikeRate),
    "P/L change": money(comparison.deltaProfitLoss),
    "ROI change": pp(comparison.deltaRoi),
  };
}

function worstContributors(comparisons: EntityComparison[]) {
  return [...comparisons]
    .filter((comparison) => comparison.deltaProfitLoss < 0)
    .sort((left, right) => left.deltaProfitLoss - right.deltaProfitLoss)
    .slice(0, 10);
}

function bestCurrentContributors(comparisons: EntityComparison[]) {
  return [...comparisons]
    .sort((left, right) => right.right.summary.profitLoss - left.right.summary.profitLoss)
    .slice(0, 10);
}

function largestSelectionIncreases(comparisons: EntityComparison[]) {
  return [...comparisons]
    .filter((comparison) => comparison.deltaSelections > 0)
    .sort((left, right) => right.deltaSelections - left.deltaSelections || left.name.localeCompare(right.name))
    .slice(0, 15);
}

function entitySwingRow(comparison: EntityComparison) {
  return {
    id: comparison.id,
    name: comparison.name,
    "2025 P/L": money(comparison.left.summary.profitLoss),
    "2026 P/L": money(comparison.right.summary.profitLoss),
    "P/L swing": money(comparison.deltaProfitLoss),
    "2025 settled": comparison.left.summary.settledSelections,
    "2026 settled": comparison.right.summary.settledSelections,
    "sample": combinedSampleFlag(comparison),
  };
}

function entityCurrentRow(comparison: EntityComparison) {
  return {
    id: comparison.id,
    name: comparison.name,
    "2026 selections": comparison.right.summary.selections,
    "2026 settled": comparison.right.summary.settledSelections,
    "2026 winners": comparison.right.summary.wins,
    "2026 strike": pct(comparison.right.summary.winStrikeRate),
    "2026 P/L": money(comparison.right.summary.profitLoss),
    "2026 ROI": pct(comparison.right.summary.roiPercentage),
    "sample": sampleFlag(comparison.right.summary.settledSelections),
  };
}

function entitySelectionGrowthRow(comparison: EntityComparison) {
  return {
    id: comparison.id,
    name: comparison.name,
    "2025 selections": comparison.left.summary.selections,
    "2026 selections": comparison.right.summary.selections,
    increase: signedInteger(comparison.deltaSelections),
    "2025 P/L": money(comparison.left.summary.profitLoss),
    "2026 P/L": money(comparison.right.summary.profitLoss),
    "P/L swing": money(comparison.deltaProfitLoss),
    "sample": combinedSampleFlag(comparison),
  };
}

function shareRow(label: string, comparisons: EntityComparison[], totalSwing: number) {
  const worst = worstContributors(comparisons);
  const deteriorationMagnitude = Math.abs(totalSwing);
  const worst5 = -worst.slice(0, 5).reduce((total, comparison) => total + comparison.deltaProfitLoss, 0);
  const worst10 = -worst.slice(0, 10).reduce((total, comparison) => total + comparison.deltaProfitLoss, 0);
  return {
    entity: label,
    "overall swing": money(totalSwing),
    "worst 5 deterioration": money(worst5),
    "worst 5 share": pct(percent(worst5, deteriorationMagnitude)),
    "worst 10 deterioration": money(worst10),
    "worst 10 share": pct(percent(worst10, deteriorationMagnitude)),
  };
}

function selectionGrowthBuckets(comparisons: EntityComparison[], entity: string) {
  const buckets = [
    { label: `existing high-volume ${entity}s (25+ 2025 selections)`, test: (comparison: EntityComparison) => comparison.left.summary.selections >= 25 },
    { label: `existing medium ${entity}s (10-24 2025 selections)`, test: (comparison: EntityComparison) => comparison.left.summary.selections >= 10 && comparison.left.summary.selections < 25 },
    { label: `few/no 2025 ${entity}s (<10 selections)`, test: (comparison: EntityComparison) => comparison.left.summary.selections < 10 },
  ];
  const increases = comparisons.filter((comparison) => comparison.deltaSelections > 0);
  const totalIncrease = increases.reduce((total, comparison) => total + comparison.deltaSelections, 0);
  return buckets.map((bucket) => {
    const rows = increases.filter(bucket.test);
    const increase = rows.reduce((total, comparison) => total + comparison.deltaSelections, 0);
    return {
      bucket: bucket.label,
      entities: rows.length,
      "selection increase": increase,
      "share of increase": pct(percent(increase, totalIncrease)),
      "2026 P/L": money(rows.reduce((total, comparison) => total + comparison.right.summary.profitLoss, 0)),
    };
  });
}

function sharedPopulationRows(
  left: BacktestSelection[],
  right: BacktestSelection[],
  comparisons: EntityComparison[],
) {
  const both = new Set(comparisons
    .filter((comparison) => comparison.left.summary.selections > 0 && comparison.right.summary.selections > 0)
    .map((comparison) => comparison.id));
  const leftOnly = new Set(comparisons
    .filter((comparison) => comparison.left.summary.selections > 0 && comparison.right.summary.selections === 0)
    .map((comparison) => comparison.id));
  const rightOnly = new Set(comparisons
    .filter((comparison) => comparison.left.summary.selections === 0 && comparison.right.summary.selections > 0)
    .map((comparison) => comparison.id));
  const idFor = entityIdForComparison(comparisons);
  return [
    sharedPopulationRow("represented in both years", left, right, both, idFor),
    sharedPopulationRow("only represented in 2025", left, right, leftOnly, idFor),
    sharedPopulationRow("only represented in 2026", left, right, rightOnly, idFor),
  ];
}

function sharedPopulationRow(
  group: string,
  left: BacktestSelection[],
  right: BacktestSelection[],
  ids: Set<string>,
  idFor: (selection: BacktestSelection) => string,
) {
  const leftSummary = summarizeSelections(left.filter((selection) => ids.has(idFor(selection))));
  const rightSummary = summarizeSelections(right.filter((selection) => ids.has(idFor(selection))));
  return {
    group,
    entities: ids.size,
    "2025 selections": leftSummary.selections,
    "2025 P/L": money(leftSummary.profitLoss),
    "2025 ROI": pct(leftSummary.roiPercentage),
    "2026 selections": rightSummary.selections,
    "2026 P/L": money(rightSummary.profitLoss),
    "2026 ROI": pct(rightSummary.roiPercentage),
    "P/L swing": money(rightSummary.profitLoss - leftSummary.profitLoss),
  };
}

function stableCoreRow(
  label: string,
  left: BacktestSelection[],
  right: BacktestSelection[],
  comparisons: EntityComparison[],
) {
  const ids = new Set(comparisons
    .filter((comparison) => comparison.left.summary.settledSelections >= 25 && comparison.right.summary.settledSelections >= 25)
    .map((comparison) => comparison.id));
  const idFor = entityIdForComparison(comparisons);
  const leftSummary = summarizeSelections(left.filter((selection) => ids.has(idFor(selection))));
  const rightSummary = summarizeSelections(right.filter((selection) => ids.has(idFor(selection))));
  return {
    core: label,
    entities: ids.size,
    "2025 selections": leftSummary.selections,
    "2025 settled": leftSummary.settledSelections,
    "2025 winners": leftSummary.wins,
    "2025 strike": pct(leftSummary.winStrikeRate),
    "2025 P/L": money(leftSummary.profitLoss),
    "2025 ROI": pct(leftSummary.roiPercentage),
    "2026 selections": rightSummary.selections,
    "2026 settled": rightSummary.settledSelections,
    "2026 winners": rightSummary.wins,
    "2026 strike": pct(rightSummary.winStrikeRate),
    "2026 P/L": money(rightSummary.profitLoss),
    "2026 ROI": pct(rightSummary.roiPercentage),
    "P/L swing": money(rightSummary.profitLoss - leftSummary.profitLoss),
  };
}

function entityIdForComparison(comparisons: EntityComparison[]) {
  const ids = new Set(comparisons.map((comparison) => comparison.id));
  return (selection: BacktestSelection) => {
    const trainerId = selection.features.trainerId ?? "missing-trainer";
    if (ids.has(trainerId)) return trainerId;
    return selection.features.courseId;
  };
}

function priceBandComparisonRows(left: BacktestSelection[], right: BacktestSelection[]) {
  const comparisons = compareSelectionGroups(left, right, (selection) => spBand(selection.settlement?.settlementOddsDecimal ?? null));
  const order = ["<=2/1", ">2 to 5/1", ">5 to 10/1", ">10 to 20/1", ">20/1", "missing"];
  return comparisons
    .map((comparison) => ({
      ...comparison,
      id: comparison.id === ">20 to 33/1" || comparison.id === ">33/1" ? ">20/1" : comparison.id,
    }))
    .reduce((map, comparison) => {
      const existing = map.get(comparison.id);
      if (!existing) {
        map.set(comparison.id, comparison);
        return map;
      }
      map.set(comparison.id, mergeComparisons(existing, comparison));
      return map;
    }, new Map<string, EntityComparison>())
    .values()
    .toArray()
    .sort((leftBand, rightBand) => order.indexOf(leftBand.id) - order.indexOf(rightBand.id))
    .map((comparison) => ({
      band: comparison.id,
      ...entityComparisonSummaryFields(comparison),
    }));
}

function mergeComparisons(left: EntityComparison, right: EntityComparison): EntityComparison {
  const leftSelections = [...left.left.selections, ...right.left.selections];
  const rightSelections = [...left.right.selections, ...right.right.selections];
  const leftStats = {
    id: left.id,
    name: left.name,
    selections: leftSelections,
    summary: summarizeSelections(leftSelections),
  };
  const rightStats = {
    id: left.id,
    name: left.name,
    selections: rightSelections,
    summary: summarizeSelections(rightSelections),
  };
  return {
    id: left.id,
    name: left.name,
    left: leftStats,
    right: rightStats,
    deltaSelections: rightStats.summary.selections - leftStats.summary.selections,
    deltaStrikeRate: deltaNullable(rightStats.summary.winStrikeRate, leftStats.summary.winStrikeRate),
    deltaProfitLoss: rightStats.summary.profitLoss - leftStats.summary.profitLoss,
    deltaRoi: deltaNullable(rightStats.summary.roiPercentage, leftStats.summary.roiPercentage),
  };
}

function concentrationRow(
  label: string,
  selections: BacktestSelection[],
  idFor: (selection: BacktestSelection) => string,
) {
  const stats = [...entityStats(selections, idFor, idFor).values()];
  const byVolume = [...stats].sort((left, right) => right.summary.selections - left.summary.selections);
  const byAbsoluteProfit = [...stats].sort((left, right) =>
    Math.abs(right.summary.profitLoss) - Math.abs(left.summary.profitLoss),
  );
  const totalProfitLoss = summarizeSelections(selections).profitLoss;
  const top5AbsProfit = byAbsoluteProfit.slice(0, 5).reduce((total, stat) => total + stat.summary.profitLoss, 0);
  return {
    group: label,
    selections: selections.length,
    "top 5 selection share": pct(percent(byVolume.slice(0, 5).reduce((total, stat) => total + stat.summary.selections, 0), selections.length)),
    "top 10 selection share": pct(percent(byVolume.slice(0, 10).reduce((total, stat) => total + stat.summary.selections, 0), selections.length)),
    "top 5 abs P/L": money(top5AbsProfit),
    "top 5 abs P/L share": pct(percent(Math.abs(top5AbsProfit), Math.abs(totalProfitLoss))),
  };
}

function interpretationLines(input: {
  trainerComparisons: EntityComparison[];
  courseComparisons: EntityComparison[];
  monthly: EntityComparison[];
  totalSwing: number;
}) {
  const trainerShare = shareRow("trainers", input.trainerComparisons, input.totalSwing);
  const courseShare = shareRow("courses", input.courseComparisons, input.totalSwing);
  const sharedTrainers = input.trainerComparisons
    .filter((comparison) => comparison.left.summary.selections > 0 && comparison.right.summary.selections > 0)
    .reduce((total, comparison) => total + comparison.deltaProfitLoss, 0);
  const newTrainerPnl = input.trainerComparisons
    .filter((comparison) => comparison.left.summary.selections === 0 && comparison.right.summary.selections > 0)
    .reduce((total, comparison) => total + comparison.right.summary.profitLoss, 0);
  const worstMonths = worstContributors(input.monthly).slice(0, 3).map((comparison) => monthLabel(comparison.id)).join(", ");
  return [
    `Same-trainer deterioration was ${money(sharedTrainers)} of the ${money(input.totalSwing)} total P/L swing.`,
    `Trainer growth/new-trainer contribution in 2026 was ${money(newTrainerPnl)}; compare this with same-trainer swing before inferring rule drift.`,
    `Worst 5 trainers explain ${trainerShare["worst 5 share"]} of the deterioration before offsets from improving trainers; worst 10 explain ${trainerShare["worst 10 share"]}.`,
    `Worst 5 courses explain ${courseShare["worst 5 share"]} of the deterioration before offsets from improving courses; worst 10 explain ${courseShare["worst 10 share"]}.`,
    `The most adverse months by P/L swing were ${worstMonths || "n/a"}.`,
    "Rows with <10 or 10-24 settled selections are flagged; treat their ROI as descriptive noise rather than stable evidence.",
  ];
}

function selectFrozenTurfSprintRule(rules: SavedResearchRule[]) {
  const frozenTurf = rules.filter((rule) => rule.status === "frozen" && rule.family === FAMILY);
  return frozenTurf.find((rule) => `${rule.name} ${rule.notes ?? ""}`.toLowerCase().includes("sprint")) ??
    frozenTurf[0] ??
    null;
}

function groupRows(
  rows: HistoricalTargetRunnerMetricsRow[],
  keyFor: (row: HistoricalTargetRunnerMetricsRow) => string,
) {
  const groups = new Map<string, HistoricalTargetRunnerMetricsRow[]>();
  for (const row of rows) {
    const key = keyFor(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, groupedRows]) => ({ key, rows: groupedRows }));
}

function groupSelections(
  selections: BacktestSelection[],
  keyFor: (selection: BacktestSelection) => string,
) {
  const groups = new Map<string, BacktestSelection[]>();
  for (const selection of selections) {
    const key = keyFor(selection);
    groups.set(key, [...(groups.get(key) ?? []), selection]);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, groupedSelections]) => ({ key, selections: groupedSelections }));
}

function summaryGroup(group: { key: string; rows: HistoricalTargetRunnerMetricsRow[] }) {
  return {
    group: group.key,
    races: distinct(group.rows.map((row) => row.features.targetRaceId)),
    runners: group.rows.length,
    ...summaryFields(summarizeRows(group.rows)),
  };
}

function summarySelectionGroup(group: { key: string; selections: BacktestSelection[] }) {
  return {
    group: group.key,
    ...summaryFields(summarizeSelections(group.selections)),
  };
}

function summaryTableRow(year: string, summary: BacktestSummary) {
  return {
    year,
    ...summaryFields(summary),
  };
}

function summaryFields(summary: BacktestSummary) {
  return {
    selections: summary.selections,
    settled: summary.settledSelections,
    winners: summary.wins,
    "strike rate": pct(summary.winStrikeRate),
    "£1 P/L": money(summary.profitLoss),
    ROI: pct(summary.roiPercentage),
    "max losing run": summary.maxConsecutiveLosers,
  };
}

function summarizeRows(rows: HistoricalTargetRunnerMetricsRow[]) {
  return summarizeSelections(rows.map(rowToSelection).sort(compareSelections));
}

function rowToSelection(row: HistoricalTargetRunnerMetricsRow): BacktestSelection {
  return {
    id: row.features.targetRunnerId,
    definitionId: "turf-matched-period-diagnostic",
    selectedReason: "diagnostic",
    features: row.features,
    derived: deriveBacktestFeatureValues(row.features),
    outcome: row.outcome,
    settlement: settleSelection(row.outcome),
  };
}

function compareRows(left: HistoricalTargetRunnerMetricsRow, right: HistoricalTargetRunnerMetricsRow) {
  return compareFeatures(left.features, right.features);
}

function compareSelections(left: BacktestSelection, right: BacktestSelection) {
  return compareFeatures(left.features, right.features);
}

function compareFeatures(left: HistoricalPreRaceFeatureRow, right: HistoricalPreRaceFeatureRow) {
  return left.raceDateTime.getTime() - right.raceDateTime.getTime() ||
    left.courseName.localeCompare(right.courseName) ||
    left.targetRaceId.localeCompare(right.targetRaceId) ||
    left.targetRunnerId.localeCompare(right.targetRunnerId);
}

function firstRowsByRace(rows: HistoricalTargetRunnerMetricsRow[]) {
  return [...new Map(rows.map((row) => [row.features.targetRaceId, row])).values()];
}

function fieldSize(features: HistoricalPreRaceFeatureRow) {
  return features.actualRunnerCount ?? features.declaredRunnerCount;
}

function classBucket(features: HistoricalPreRaceFeatureRow) {
  const parsed = raceClassNumber(features.raceClass);
  return parsed && parsed >= 1 && parsed <= 6 ? `class ${parsed}` : "missing/other";
}

function distanceBucket(distanceYards: number | null) {
  if (distanceYards === null) return "missing";
  if (distanceYards <= 7 * 220) return "sprint";
  if (distanceYards <= 9 * 220) return "mile";
  if (distanceYards <= 13 * 220) return "middle";
  return "staying";
}

function spBand(decimalOdds: number | null) {
  if (decimalOdds === null) return "missing";
  const fractional = decimalOdds - 1;
  if (fractional <= 2) return "<=2/1";
  if (fractional <= 5) return ">2 to 5/1";
  if (fractional <= 10) return ">5 to 10/1";
  if (fractional <= 20) return ">10 to 20/1";
  if (fractional <= 33) return ">20 to 33/1";
  return ">33/1";
}

function value(features: HistoricalPreRaceFeatureRow, field: NumericField) {
  return features[field];
}

function isMissing(value: unknown) {
  return value === null || value === undefined || value === "";
}

function distinct(values: string[]) {
  return new Set(values).size;
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 0
    ? (values[middle - 1]! + values[middle]!) / 2
    : values[middle]!;
}

function percent(numerator: number, denominator: number) {
  if (denominator === 0) return null;
  return (numerator / denominator) * 100;
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

function odds(value: number | null) {
  return value === null || !Number.isFinite(value) ? "n/a" : `${value.toFixed(2)}/1`;
}

function pp(value: number | null) {
  return value === null || !Number.isFinite(value) ? "n/a" : `${value >= 0 ? "+" : ""}${value.toFixed(1)} pp`;
}

function deltaNullable(right: number | null, left: number | null) {
  return right === null || left === null ? null : right - left;
}

function signedInteger(value: number) {
  return value >= 0 ? `+${value}` : String(value);
}

function sampleFlag(settled: number) {
  if (settled < 10) return "<10 settled";
  if (settled < 25) return "10-24 settled";
  return ">=25 settled";
}

function combinedSampleFlag(comparison: EntityComparison) {
  return `2025 ${sampleFlag(comparison.left.summary.settledSelections)}; 2026 ${
    sampleFlag(comparison.right.summary.settledSelections)
  }`;
}

function monthLabel(month: string) {
  const labels: Record<string, string> = {
    "02": "Feb",
    "03": "Mar",
    "04": "Apr",
    "05": "May",
    "06": "Jun",
    "07": "Jul",
    "08": "Aug",
    "09": "Sep",
  };
  return labels[month] ?? month;
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
