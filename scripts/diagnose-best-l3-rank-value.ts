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
import { rankRows, type RankedResearchRow } from "@/lib/racing/research-rule";

type Family = Exclude<BacktestCacheFamily, "all">;
type Year = "2025" | "2026";
type BestL3Group = "rank 1" | "rank 2" | "rank 3+" | "missing";
type HeadlineGroup = "rank 1-2" | "rank 3+";
type PriceBand = "<2.0" | "2.0-2.99" | "3.0-4.99" | "5.0-7.99" | "8.0+";
type MarketGroup = "favourite" | "second favourite" | "third+";

type Context = {
  family: Family;
  year: Year;
  rows: RankedResearchRow[];
  baseline: RankedResearchRow[];
  spRankByRunnerId: Map<string, number>;
};

type AeStats = {
  wins: number;
  expectedWins: number;
  ae: number | null;
};

type Comparison = {
  context: Context;
  obvious: RankedResearchRow[];
  notObvious: RankedResearchRow[];
};

const FAMILIES: Family[] = ["jump", "turf_flat", "all_weather_flat"];
const YEARS: Year[] = ["2025", "2026"];
const BEST_L3_GROUPS: BestL3Group[] = ["rank 1", "rank 2", "rank 3+", "missing"];
const PRICE_BANDS: PriceBand[] = ["<2.0", "2.0-2.99", "3.0-4.99", "5.0-7.99", "8.0+"];
const MARKET_GROUPS: MarketGroup[] = ["favourite", "second favourite", "third+"];
const SAMPLE_FLOOR = 25;

async function main() {
  console.log("# Best L3 Rank Value Diagnostic");
  console.log("");
  console.log("Diagnostic only. Fixed baseline: trainer prior strike rate >=15% and field size <=5. No Research, Today, saved/frozen rule, cache, or holdout behavior is changed.");
  console.log("");
  console.log("Best L3 rank is calculated race-by-race from existing cached `bestSpeedLast3` values via the Research rank helper. Settlement and SP use existing backtest settlement helpers. Market rank is derived from final decimal SP, so it is descriptive market-price profiling rather than an independent pre-race signal.");
  console.log("");

  const contexts = await loadContexts();
  printBaseline(contexts);
  printBestL3Groups(contexts);
  printHeadlineComparison(contexts);
  printPriceBandControl(contexts);
  printMarketRankInteraction(contexts);
  printReplication(contexts);
  printCrossFamilySummary(contexts);
  printConclusion(contexts);
  printGuardrails();
}

async function loadContexts(): Promise<Context[]> {
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
        spRankByRunnerId: rankByRace(rows, (row) => spForRow(row), false),
      });
    }
  }
  return contexts;
}

function printBaseline(contexts: Context[]) {
  console.log("## Baseline");
  printTable(contexts.map((context) => {
    const missingSp = context.baseline.filter((row) => row.outcome.resultStatus !== "non_runner" && spForRow(row) === null).length;
    return {
      period: label(context),
      "cache rows": context.rows.length,
      "baseline runners": context.baseline.length,
      ...metricColumns(context.baseline),
      "settled rows excluded from SP controls": missingSp,
    };
  }));
  console.log("");
}

function printBestL3Groups(contexts: Context[]) {
  console.log("## Best L3 Rank Groups");
  for (const context of contexts) {
    console.log(`### ${label(context)}`);
    printTable(BEST_L3_GROUPS.map((group) => ({
      group,
      ...metricColumns(rowsForBestL3Group(context, group)),
      sample: sampleWarning(summarizeRows(rowsForBestL3Group(context, group)).settledSelections),
    })));
    console.log("");
  }
}

function printHeadlineComparison(contexts: Context[]) {
  console.log("## Rank 1-2 Vs Rank 3+");
  printTable(contexts.flatMap((context) => {
    const comparison = comparisonFor(context);
    const obvious = headlineMetricColumns(comparison.obvious);
    const notObvious = headlineMetricColumns(comparison.notObvious);
    const diff = differenceColumns(comparison);
    return [
      {
        period: label(context),
        group: "rank 1-2",
        ...obvious,
        "strike diff": "",
        "ROI diff": "",
        "A/E diff": "",
        "avg SP diff": "",
      },
      {
        period: label(context),
        group: "rank 3+",
        ...notObvious,
        "strike diff": "",
        "ROI diff": "",
        "A/E diff": "",
        "avg SP diff": "",
      },
      {
        period: label(context),
        group: "rank 3+ minus rank 1-2",
        settled: "",
        wins: "",
        "strike rate": "",
        ROI: "",
        "A/E": "",
        "avg SP": "",
        "median SP": "",
        ...diff,
      },
    ];
  }));
  console.log("");
}

function printPriceBandControl(contexts: Context[]) {
  console.log("## SP-Band Control");
  console.log("Rows with missing/unusable final SP are excluded from this section.");
  console.log("");
  for (const context of contexts) {
    console.log(`### ${label(context)}`);
    printTable(PRICE_BANDS.flatMap((band) => {
      const obvious = context.baseline.filter((row) => headlineGroup(row) === "rank 1-2" && priceBandForRow(row) === band);
      const notObvious = context.baseline.filter((row) => headlineGroup(row) === "rank 3+" && priceBandForRow(row) === band);
      return [
        {
          band,
          group: "rank 1-2",
          ...compactMetricColumns(obvious),
        },
        {
          band,
          group: "rank 3+",
          ...compactMetricColumns(notObvious),
        },
      ];
    }));
    console.log("");
  }
}

function printMarketRankInteraction(contexts: Context[]) {
  console.log("## Market-Rank Interaction");
  console.log("Market rank is derived from final decimal SP within each race. This section is descriptive and not independent pre-race evidence.");
  console.log("");
  for (const context of contexts) {
    console.log(`### ${label(context)}`);
    printTable(MARKET_GROUPS.flatMap((marketGroup) => {
      const obvious = context.baseline.filter((row) => headlineGroup(row) === "rank 1-2" && marketGroupForRow(context, row) === marketGroup);
      const notObvious = context.baseline.filter((row) => headlineGroup(row) === "rank 3+" && marketGroupForRow(context, row) === marketGroup);
      return [
        {
          "market rank": marketGroup,
          group: "rank 1-2",
          ...compactMetricColumns(obvious),
        },
        {
          "market rank": marketGroup,
          group: "rank 3+",
          ...compactMetricColumns(notObvious),
        },
      ];
    }));
    console.log("");
  }
}

function printReplication(contexts: Context[]) {
  console.log("## 2025 Vs 2026 Replication");
  printTable(FAMILIES.map((family) => {
    const context2025 = contextFor(contexts, family, "2025");
    const context2026 = contextFor(contexts, family, "2026");
    const comparison2025 = comparisonFor(context2025);
    const comparison2026 = comparisonFor(context2026);
    return {
      family: familyLabel(family),
      "2025 rank 3+ A/E": number(aeStats(comparison2025.notObvious).ae),
      "2025 rank 1-2 A/E": number(aeStats(comparison2025.obvious).ae),
      "2025 A/E diff": number(aeDifference(comparison2025)),
      "2025 rank 3+ ROI": pct(summarizeRows(comparison2025.notObvious).roiPercentage),
      "2026 rank 3+ A/E": number(aeStats(comparison2026.notObvious).ae),
      "2026 rank 1-2 A/E": number(aeStats(comparison2026.obvious).ae),
      "2026 A/E diff": number(aeDifference(comparison2026)),
      "2026 rank 3+ ROI": pct(summarizeRows(comparison2026.notObvious).roiPercentage),
      assessment: replicationAssessment(comparison2025, comparison2026),
    };
  }));
  console.log("");
}

function printCrossFamilySummary(contexts: Context[]) {
  console.log("## Cross-Family Summary");
  printTable(FAMILIES.map((family) => {
    const comparisons = YEARS.map((year) => comparisonFor(contextFor(contexts, family, year)));
    return {
      family: familyLabel(family),
      "higher A/E than rank 1-2 both years": yesNo(comparisons.every((comparison) => (aeDifference(comparison) ?? -Infinity) > 0)),
      "positive rank 3+ ROI both years": yesNo(comparisons.every((comparison) => (summarizeRows(comparison.notObvious).roiPercentage ?? -Infinity) > 0)),
      "survives SP-band control": spBandAssessment(comparisons),
      "adequate rank 3+ sample": yesNo(comparisons.every((comparison) => summarizeRows(comparison.notObvious).settledSelections >= SAMPLE_FLOOR)),
    };
  }));
  console.log("");
}

function printConclusion(contexts: Context[]) {
  console.log("## Conclusion");
  printTable([
    { question: "1. Higher A/E than rank 1-2 in both 2025 and 2026?", answer: higherAeConclusion(contexts) },
    { question: "2. Repeats across Jump, Turf, and AW?", answer: repeatsAcrossFamiliesConclusion(contexts) },
    { question: "3. Survives approximate SP-band control?", answer: spBandConclusion(contexts) },
    { question: "4. Simply benefiting from longer average prices?", answer: longerPriceConclusion(contexts) },
    { question: "5. Does final-SP market rank help explain it?", answer: marketRankConclusion(contexts) },
    { question: "6. Sample sizes large enough?", answer: sampleSizeConclusion(contexts) },
    { question: "7. Enough evidence for another targeted diagnostic?", answer: followUpConclusion(contexts) },
    { question: "8. Remain diagnostic rather than production logic?", answer: "Yes. This is controlled profiling inside a pre-selected baseline and uses final-SP controls; it should not be production logic." },
  ]);
  console.log("");
}

function printGuardrails() {
  console.log("## Guardrails");
  printTable([
    { item: "Production logic changed", result: "No" },
    { item: "Research/Today/saved/frozen rules changed", result: "No" },
    { item: "Cache schema/generation changed", result: "No" },
    { item: "Baseline thresholds altered", result: "No" },
    { item: "Other feature combinations tested", result: "No" },
  ]);
}

function baselineRows(rows: RankedResearchRow[]) {
  return rows
    .filter((row) => row.features.trainerPriorWinRate !== null && row.features.trainerPriorWinRate >= 15)
    .filter((row) => {
      const fieldSize = row.features.actualRunnerCount ?? row.features.declaredRunnerCount;
      return fieldSize !== null && fieldSize <= 5;
    });
}

function rowsForBestL3Group(context: Context, group: BestL3Group) {
  return context.baseline.filter((row) => bestL3Group(row) === group);
}

function comparisonFor(context: Context): Comparison {
  return {
    context,
    obvious: context.baseline.filter((row) => headlineGroup(row) === "rank 1-2"),
    notObvious: context.baseline.filter((row) => headlineGroup(row) === "rank 3+"),
  };
}

function bestL3Group(row: RankedResearchRow): BestL3Group {
  const rank = row.ranks.bestSpeedLast3;
  if (rank === null || rank === undefined) return "missing";
  if (rank === 1) return "rank 1";
  if (rank === 2) return "rank 2";
  return "rank 3+";
}

function headlineGroup(row: RankedResearchRow): HeadlineGroup | null {
  const group = bestL3Group(row);
  if (group === "rank 1" || group === "rank 2") return "rank 1-2";
  if (group === "rank 3+") return "rank 3+";
  return null;
}

function priceBandForRow(row: RankedResearchRow): PriceBand | null {
  const sp = spForRow(row);
  if (sp === null || sp <= 0) return null;
  if (sp < 2) return "<2.0";
  if (sp < 3) return "2.0-2.99";
  if (sp < 5) return "3.0-4.99";
  if (sp < 8) return "5.0-7.99";
  return "8.0+";
}

function marketGroupForRow(context: Context, row: RankedResearchRow): MarketGroup | null {
  const rank = context.spRankByRunnerId.get(row.features.targetRunnerId) ?? null;
  if (rank === null) return null;
  if (rank === 1) return "favourite";
  if (rank === 2) return "second favourite";
  return "third+";
}

function metricColumns(rows: HistoricalTargetRunnerMetricsRow[]) {
  const summary = summarizeRows(rows);
  const ae = aeStats(rows);
  const odds = settledDecimalSps(rows);
  return {
    settled: summary.settledSelections,
    wins: summary.wins,
    "strike rate": pct(summary.winStrikeRate),
    "£1 P/L": money(summary.profitLoss),
    ROI: pct(summary.roiPercentage),
    "A/E": number(ae.ae),
    "avg decimal SP": number(average(odds)),
    "median decimal SP": number(median(odds)),
  };
}

function headlineMetricColumns(rows: HistoricalTargetRunnerMetricsRow[]) {
  const summary = summarizeRows(rows);
  const ae = aeStats(rows);
  const odds = settledDecimalSps(rows);
  return {
    settled: summary.settledSelections,
    wins: summary.wins,
    "strike rate": pct(summary.winStrikeRate),
    ROI: pct(summary.roiPercentage),
    "A/E": number(ae.ae),
    "avg SP": number(average(odds)),
    "median SP": number(median(odds)),
  };
}

function compactMetricColumns(rows: HistoricalTargetRunnerMetricsRow[]) {
  const summary = summarizeRows(rows);
  const ae = aeStats(rows);
  return {
    settled: summary.settledSelections,
    wins: summary.wins,
    "strike rate": pct(summary.winStrikeRate),
    ROI: pct(summary.roiPercentage),
    "A/E": number(ae.ae),
    sample: sampleWarning(summary.settledSelections),
  };
}

function differenceColumns(comparison: Comparison) {
  const obviousSummary = summarizeRows(comparison.obvious);
  const notObviousSummary = summarizeRows(comparison.notObvious);
  const obviousOdds = settledDecimalSps(comparison.obvious);
  const notObviousOdds = settledDecimalSps(comparison.notObvious);
  return {
    "strike diff": pp((notObviousSummary.winStrikeRate ?? 0) - (obviousSummary.winStrikeRate ?? 0)),
    "ROI diff": pp((notObviousSummary.roiPercentage ?? 0) - (obviousSummary.roiPercentage ?? 0)),
    "A/E diff": number(aeDifference(comparison)),
    "avg SP diff": number((average(notObviousOdds) ?? 0) - (average(obviousOdds) ?? 0)),
  };
}

function aeDifference(comparison: Comparison) {
  const obviousAe = aeStats(comparison.obvious).ae;
  const notObviousAe = aeStats(comparison.notObvious).ae;
  return obviousAe === null || notObviousAe === null ? null : notObviousAe - obviousAe;
}

function summarizeRows(rows: HistoricalTargetRunnerMetricsRow[]): BacktestSummary {
  return summarizeSelections(rows.map(rowToSelection));
}

function rowToSelection(row: HistoricalTargetRunnerMetricsRow): BacktestSelection {
  return {
    id: row.features.targetRunnerId,
    definitionId: "best-l3-rank-value-diagnostic",
    selectedReason: "Best L3 rank value diagnostic",
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
    wins,
    expectedWins,
    ae: expectedWins === 0 ? null : wins / expectedWins,
  };
}

function settledDecimalSps(rows: HistoricalTargetRunnerMetricsRow[]) {
  return rows
    .map((row) => spForRow(row))
    .filter(isNumber)
    .filter((value) => value > 0);
}

function spForRow(row: HistoricalTargetRunnerMetricsRow) {
  return settleSelection(row.outcome)?.settlementOddsDecimal ?? null;
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

function replicationAssessment(left: Comparison, right: Comparison) {
  const leftSummary = summarizeRows(left.notObvious);
  const rightSummary = summarizeRows(right.notObvious);
  if (leftSummary.settledSelections < SAMPLE_FLOOR || rightSummary.settledSelections < SAMPLE_FLOOR) return "too sparse to assess";
  const leftAeDiff = aeDifference(left);
  const rightAeDiff = aeDifference(right);
  if ((leftAeDiff ?? -Infinity) > 0 && (rightAeDiff ?? -Infinity) > 0) return "appears in both years";
  if ((leftAeDiff ?? -Infinity) > 0 && (rightAeDiff ?? -Infinity) <= 0) return "weakens/reverses in 2026";
  if ((leftAeDiff ?? -Infinity) <= 0 && (rightAeDiff ?? -Infinity) > 0) return "appears only in 2026";
  return "no A/E advantage";
}

function spBandAssessment(comparisons: Comparison[]) {
  const assessed = comparisons.flatMap((comparison) =>
    PRICE_BANDS.map((band) => {
      const obvious = comparison.context.baseline.filter((row) => headlineGroup(row) === "rank 1-2" && priceBandForRow(row) === band);
      const notObvious = comparison.context.baseline.filter((row) => headlineGroup(row) === "rank 3+" && priceBandForRow(row) === band);
      const obviousSummary = summarizeRows(obvious);
      const notObviousSummary = summarizeRows(notObvious);
      if (obviousSummary.settledSelections < SAMPLE_FLOOR || notObviousSummary.settledSelections < SAMPLE_FLOOR) return null;
      const obviousAe = aeStats(obvious).ae;
      const notObviousAe = aeStats(notObvious).ae;
      if (obviousAe === null || notObviousAe === null) return null;
      return notObviousAe > obviousAe;
    })
  ).filter((value): value is boolean => value !== null);
  if (assessed.length === 0) return "too sparse";
  const wins = assessed.filter(Boolean).length;
  return `${wins}/${assessed.length} comparable bands favour rank 3+`;
}

function higherAeConclusion(contexts: Context[]) {
  return FAMILIES.map((family) => {
    const assessments = YEARS.map((year) => {
      const comparison = comparisonFor(contextFor(contexts, family, year));
      return `${year}: ${number(aeDifference(comparison))}`;
    }).join(", ");
    const both = YEARS.every((year) => (aeDifference(comparisonFor(contextFor(contexts, family, year))) ?? -Infinity) > 0);
    return `${familyLabel(family)} ${both ? "yes" : "no"} (${assessments})`;
  }).join("; ");
}

function repeatsAcrossFamiliesConclusion(contexts: Context[]) {
  const repeatFamilies = FAMILIES.filter((family) =>
    YEARS.every((year) => (aeDifference(comparisonFor(contextFor(contexts, family, year))) ?? -Infinity) > 0)
  );
  return repeatFamilies.length === 0
    ? "No. No family has a rank 3+ A/E advantage over rank 1-2 in both years."
    : `Only ${repeatFamilies.map(familyLabel).join(", ")} meet that test.`;
}

function spBandConclusion(contexts: Context[]) {
  return FAMILIES.map((family) => {
    const comparisons = YEARS.map((year) => comparisonFor(contextFor(contexts, family, year)));
    return `${familyLabel(family)}: ${spBandAssessment(comparisons)}`;
  }).join("; ");
}

function longerPriceConclusion(contexts: Context[]) {
  return FAMILIES.map((family) => {
    const parts = YEARS.map((year) => {
      const comparison = comparisonFor(contextFor(contexts, family, year));
      const obviousAvg = average(settledDecimalSps(comparison.obvious));
      const notObviousAvg = average(settledDecimalSps(comparison.notObvious));
      return `${year} rank 3+ avg SP ${number(notObviousAvg)} vs rank 1-2 ${number(obviousAvg)}`;
    });
    return `${familyLabel(family)} ${parts.join(" / ")}`;
  }).join("; ");
}

function marketRankConclusion(contexts: Context[]) {
  return FAMILIES.map((family) => {
    const parts = YEARS.map((year) => {
      const context = contextFor(contexts, family, year);
      const favRank3 = context.baseline.filter((row) => headlineGroup(row) === "rank 3+" && marketGroupForRow(context, row) === "favourite");
      const marketRank3 = context.baseline.filter((row) => headlineGroup(row) === "rank 3+");
      return `${year} rank 3+ favourites ${summarizeRows(favRank3).settledSelections}/${summarizeRows(marketRank3).settledSelections}, fav A/E ${number(aeStats(favRank3).ae)}`;
    });
    return `${familyLabel(family)} ${parts.join(" / ")}`;
  }).join("; ");
}

function sampleSizeConclusion(contexts: Context[]) {
  return FAMILIES.map((family) => {
    const parts = YEARS.map((year) => {
      const comparison = comparisonFor(contextFor(contexts, family, year));
      return `${year} rank 3+ n=${summarizeRows(comparison.notObvious).settledSelections}`;
    });
    return `${familyLabel(family)} ${parts.join(", ")}`;
  }).join("; ");
}

function followUpConclusion(contexts: Context[]) {
  const repeatFamilies = FAMILIES.filter((family) =>
    YEARS.every((year) => (aeDifference(comparisonFor(contextFor(contexts, family, year))) ?? -Infinity) > 0)
  );
  if (repeatFamilies.length === 0) {
    return "No obvious next diagnostic from rank 3+ alone; the apparent edge is not stable enough.";
  }
  return `Possibly, but only as another pre-specified diagnostic for ${repeatFamilies.map(familyLabel).join(", ")} and still not as production exposure.`;
}

function contextFor(contexts: Context[], family: Family, year: Year) {
  const context = contexts.find((item) => item.family === family && item.year === year);
  if (!context) throw new Error(`Missing context for ${family} ${year}`);
  return context;
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

function pp(value: number | null) {
  return value === null || !Number.isFinite(value) ? "n/a" : `${value.toFixed(1)}pp`;
}

function money(value: number | null) {
  return value === null || !Number.isFinite(value) ? "n/a" : `£${value.toFixed(2)}`;
}

function number(value: number | null) {
  return value === null || !Number.isFinite(value) ? "n/a" : value.toFixed(1);
}

function yesNo(value: boolean) {
  return value ? "yes" : "no";
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
