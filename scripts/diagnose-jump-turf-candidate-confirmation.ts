import {
  deriveBacktestFeatureValues,
  settleSelection,
  summarizeSelections,
  type BacktestSelection,
  type BacktestSummary,
} from "@/lib/racing/backtest";
import { loadLatestBacktestFeatureCacheForYear } from "@/lib/racing/backtest-cache";
import type { HistoricalTargetRunnerMetricsRow } from "@/lib/racing/historical-target-metrics";
import { raceClassNumber } from "@/lib/racing/research-rule-classes";
import { rankRows, type RankedResearchRow } from "@/lib/racing/research-rule";

type Family = "jump" | "turf_flat";
type Year = "2025" | "2026";
type PriceBand = "<2.0" | "2.0-2.99" | "3.0-4.99" | "5.0-7.99" | "8.0+";
type CandidateName = "Jump OR-third+" | "Turf field-size-5";

type Context = {
  family: Family;
  year: Year;
  rows: RankedResearchRow[];
  baseline: RankedResearchRow[];
  candidate: RankedResearchRow[];
  officialRatingRankByRunnerId: Map<string, number>;
};

type AeStats = {
  wins: number;
  expectedWins: number;
  ae: number | null;
};

const YEARS: Year[] = ["2025", "2026"];
const PRICE_BANDS: PriceBand[] = ["<2.0", "2.0-2.99", "3.0-4.99", "5.0-7.99", "8.0+"];
const SPARSE_FLOOR = 50;
const VERY_SPARSE_FLOOR = 25;

async function main() {
  console.log("# Jump/Turf Candidate Confirmation");
  console.log("");
  console.log("Diagnostic only. Fixed candidates are pre-specified; no Research, saved/frozen rule identity, cache schema/generation, or holdout behavior is changed.");
  console.log("");
  console.log("Jump candidate: trainer prior strike >=15%, field size <=5, Best L3 rank >=3, official-rating position third+. Turf candidate: trainer prior strike >=15%, Best L3 rank >=3, exact field size 5.");
  console.log("");

  const contexts = await loadContexts();
  printCoreConfirmation(contexts);
  printPriceBandConfirmation(contexts);
  printMonthlyDistribution(contexts);
  printRaceClassCheck(contexts);
  printJumpSpecific(contexts);
  printTurfSpecific(contexts);
  printConclusions(contexts);
  printGuardrails();
}

async function loadContexts(): Promise<Context[]> {
  const contexts: Context[] = [];
  for (const family of ["jump", "turf_flat"] as const) {
    for (const year of YEARS) {
      const cache = await loadLatestBacktestFeatureCacheForYear({ family, year });
      const rows = cache
        ? rankRows(cache.rows
          .filter((row) => row.features.raceCode === raceCodeForFamily(family))
          .sort(compareRowsChronologically))
        : [];
      const officialRatingRankByRunnerId = rankByRace(rows, (row) => row.features.officialRating, true);
      const baseline = family === "jump"
        ? jumpBaselineRows(rows)
        : turfBaselineRows(rows);
      const context: Context = {
        family,
        year,
        rows,
        baseline,
        candidate: [],
        officialRatingRankByRunnerId,
      };
      context.candidate = family === "jump"
        ? baseline.filter((row) => officialRatingCategory(context, row) === "third+")
        : baseline.filter((row) => fieldSizeForRow(row) === 5);
      contexts.push(context);
    }
  }
  return contexts;
}

function printCoreConfirmation(contexts: Context[]) {
  console.log("## Core Confirmation");
  printTable(contexts.flatMap((context) => {
    const baseline = summarizeRows(context.baseline);
    const candidate = summarizeRows(context.candidate);
    const baselineOdds = settledDecimalSps(context.baseline);
    const candidateOdds = settledDecimalSps(context.candidate);
    const baselineAe = aeStats(context.baseline);
    const candidateAe = aeStats(context.candidate);
    return [
      {
        period: label(context),
        system: "preceding baseline",
        ...fullMetricColumns(context.baseline),
        "settled change": "",
        "strike change": "",
        "ROI change": "",
        "A/E change": "",
        "avg SP change": "",
        retention: "100.0%",
      },
      {
        period: label(context),
        system: candidateName(context.family),
        ...fullMetricColumns(context.candidate),
        "settled change": candidate.settledSelections - baseline.settledSelections,
        "strike change": pp((candidate.winStrikeRate ?? 0) - (baseline.winStrikeRate ?? 0)),
        "ROI change": pp((candidate.roiPercentage ?? 0) - (baseline.roiPercentage ?? 0)),
        "A/E change": number(candidateAe.ae === null || baselineAe.ae === null ? null : candidateAe.ae - baselineAe.ae),
        "avg SP change": number((average(candidateOdds) ?? 0) - (average(baselineOdds) ?? 0)),
        retention: pct(retention(candidate.settledSelections, baseline.settledSelections)),
      },
    ];
  }));
  console.log("");
}

function printPriceBandConfirmation(contexts: Context[]) {
  console.log("## Price-Band Confirmation");
  console.log("Uses fixed final decimal-SP bands. Missing/unusable SP rows are excluded from this section.");
  console.log("");
  for (const context of contexts) {
    console.log(`### ${label(context)} ${candidateName(context.family)}`);
    printTable(PRICE_BANDS.map((band) => ({
      band,
      ...compactMetricColumns(context.candidate.filter((row) => priceBandForRow(row) === band)),
    })));
    console.log("");
  }
}

function printMonthlyDistribution(contexts: Context[]) {
  console.log("## Time Distribution / Concentration Check");
  for (const context of contexts) {
    console.log(`### ${label(context)} ${candidateName(context.family)}`);
    printTable(monthRows(context.candidate));
    console.log("");
  }
  console.log("### Stability Summary");
  printTable(contexts.map((context) => monthlyStabilityRow(context)));
  console.log("");
}

function printRaceClassCheck(contexts: Context[]) {
  console.log("## Race-Class Check");
  for (const context of contexts) {
    console.log(`### ${label(context)} ${candidateName(context.family)}`);
    const classes = [...new Set(context.candidate.map((row) => raceClassBucket(row.features.raceClass)))]
      .sort(compareRaceClassBuckets);
    printTable(classes.map((raceClass) => ({
      "race class": raceClass,
      ...compactMetricColumns(context.candidate.filter((row) => raceClassBucket(row.features.raceClass) === raceClass)),
    })));
    console.log("");
  }
}

function printJumpSpecific(contexts: Context[]) {
  console.log("## Jump OR-Position Check");
  for (const year of YEARS) {
    const context = contextFor(contexts, "jump", year);
    console.log(`### Jump ${year} preceding baseline`);
    printTable(["top-rated", "second", "third+"].map((category) => {
      const rows = context.baseline.filter((row) => officialRatingCategory(context, row) === category);
      return {
        category,
        ...compactMetricColumns(rows),
        "avg SP": number(average(settledDecimalSps(rows))),
      };
    }));
    console.log("");
  }
}

function printTurfSpecific(contexts: Context[]) {
  console.log("## Turf Exact-Field-Size Check");
  for (const year of YEARS) {
    const context = contextFor(contexts, "turf_flat", year);
    console.log(`### Turf ${year} preceding baseline`);
    printTable([2, 3, 4, 5].map((fieldSize) => {
      const rows = context.baseline.filter((row) => fieldSizeForRow(row) === fieldSize);
      return {
        "field size": fieldSize,
        ...compactMetricColumns(rows),
        "avg SP": number(average(settledDecimalSps(rows))),
      };
    }));
    console.log("");
  }
}

function printConclusions(contexts: Context[]) {
  console.log("## Jump Conclusion");
  printTable([
    { question: "1. Stronger than baseline in both 2025 and 2026?", answer: candidateVsBaselineAnswer(contexts, "jump") },
    { question: "2. A/E favourable after price-band control?", answer: priceBandAnswer(contexts, "jump") },
    { question: "3. Profitability distributed through year?", answer: monthDistributionAnswer(contexts, "jump") },
    { question: "4. OR-third+ broad or concentrated?", answer: jumpConcentrationAnswer(contexts) },
    { question: "5. Sample size adequate?", answer: sampleAnswer(contexts, "jump") },
    { question: "6. Preserve as named research candidate?", answer: preserveAnswer(contexts, "jump") },
  ]);
  console.log("");

  console.log("## Turf Conclusion");
  printTable([
    { question: "1. Field size 5 stronger than baseline both years?", answer: candidateVsBaselineAnswer(contexts, "turf_flat") },
    { question: "2. Improvement survives price-band control?", answer: priceBandAnswer(contexts, "turf_flat") },
    { question: "3. Field size 5 stronger than field size 4?", answer: turfFieldSizeAnswer(contexts) },
    { question: "4. Profitability distributed through year?", answer: monthDistributionAnswer(contexts, "turf_flat") },
    { question: "5. Sample size adequate?", answer: sampleAnswer(contexts, "turf_flat") },
    { question: "6. Preserve as named research candidate?", answer: preserveAnswer(contexts, "turf_flat") },
  ]);
  console.log("");
}

function printGuardrails() {
  console.log("## Guardrails");
  printTable([
    { item: "Production Research filters changed", result: "No" },
    { item: "Saved/frozen rule identity changed", result: "No" },
    { item: "Cache schema/generation changed", result: "No" },
    { item: "Holdout behavior changed", result: "No" },
    { item: "Threshold optimisation performed", result: "No" },
  ]);
}

function jumpBaselineRows(rows: RankedResearchRow[]) {
  return commonBaselineRows(rows)
    .filter((row) => {
      const fieldSize = fieldSizeForRow(row);
      return fieldSize !== null && fieldSize <= 5;
    });
}

function turfBaselineRows(rows: RankedResearchRow[]) {
  return commonBaselineRows(rows);
}

function commonBaselineRows(rows: RankedResearchRow[]) {
  return rows
    .filter((row) => row.features.trainerPriorWinRate !== null && row.features.trainerPriorWinRate >= 15)
    .filter((row) => {
      const rank = row.ranks.bestSpeedLast3;
      return rank !== null && rank !== undefined && rank >= 3;
    });
}

function fullMetricColumns(rows: HistoricalTargetRunnerMetricsRow[]) {
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

function monthRows(rows: RankedResearchRow[]) {
  const months = [...new Set(rows.map((row) => row.features.raceDate.slice(0, 7)))].sort();
  return months.map((month) => {
    const monthRowsForCandidate = rows.filter((row) => row.features.raceDate.startsWith(month));
    const summary = summarizeRows(monthRowsForCandidate);
    return {
      month,
      settled: summary.settledSelections,
      wins: summary.wins,
      ROI: pct(summary.roiPercentage),
      "A/E": number(aeStats(monthRowsForCandidate).ae),
      "£1 P/L": money(summary.profitLoss),
      sample: sampleWarning(summary.settledSelections),
    };
  });
}

function monthlyStabilityRow(context: Context) {
  const rows = monthRows(context.candidate);
  const profits = rows.map((row) => Number(String(row["£1 P/L"]).replace(/[£]/g, ""))).filter(Number.isFinite);
  const totalProfit = summarizeRows(context.candidate).profitLoss;
  const largest = profits.length === 0 ? 0 : Math.max(...profits.map((value) => Math.abs(value)));
  return {
    period: label(context),
    candidate: candidateName(context.family),
    "profitable months": profits.filter((value) => value > 0).length,
    "loss-making months": profits.filter((value) => value < 0).length,
    "largest month contribution": totalProfit === 0 ? "n/a" : pct((largest / Math.abs(totalProfit)) * 100),
    dominated: totalProfit !== 0 && largest / Math.abs(totalProfit) >= 0.5 ? "yes" : "no",
  };
}

function candidateVsBaselineAnswer(contexts: Context[], family: Family) {
  return YEARS.map((year) => {
    const context = contextFor(contexts, family, year);
    const baseline = summarizeRows(context.baseline);
    const candidate = summarizeRows(context.candidate);
    const baselineAe = aeStats(context.baseline).ae;
    const candidateAe = aeStats(context.candidate).ae;
    const stronger = (candidateAe ?? -Infinity) > (baselineAe ?? -Infinity) &&
      (candidate.roiPercentage ?? -Infinity) > (baseline.roiPercentage ?? -Infinity);
    return `${year}: ${stronger ? "yes" : "no"} (ROI ${pct(candidate.roiPercentage)} vs ${pct(baseline.roiPercentage)}, A/E ${number(candidateAe)} vs ${number(baselineAe)})`;
  }).join("; ");
}

function priceBandAnswer(contexts: Context[], family: Family) {
  return YEARS.map((year) => {
    const context = contextFor(contexts, family, year);
    const adequate = PRICE_BANDS.map((band) => {
      const rows = context.candidate.filter((row) => priceBandForRow(row) === band);
      const summary = summarizeRows(rows);
      if (summary.settledSelections < VERY_SPARSE_FLOOR) return null;
      return `${band} A/E ${number(aeStats(rows).ae)} (${summary.settledSelections})`;
    }).filter((value): value is string => value !== null);
    return `${year}: ${adequate.length ? adequate.join(", ") : "too sparse by band"}`;
  }).join("; ");
}

function monthDistributionAnswer(contexts: Context[], family: Family) {
  return YEARS.map((year) => {
    const context = contextFor(contexts, family, year);
    const row = monthlyStabilityRow(context);
    return `${year}: ${row["profitable months"]} profitable, ${row["loss-making months"]} losing, largest contribution ${row["largest month contribution"]}, dominated ${row.dominated}`;
  }).join("; ");
}

function jumpConcentrationAnswer(contexts: Context[]) {
  return YEARS.map((year) => {
    const context = contextFor(contexts, "jump", year);
    const categories = ["top-rated", "second", "third+"].map((category) => {
      const rows = context.baseline.filter((row) => officialRatingCategory(context, row) === category);
      return `${category} A/E ${number(aeStats(rows).ae)}, ROI ${pct(summarizeRows(rows).roiPercentage)}, n=${summarizeRows(rows).settledSelections}`;
    });
    return `${year}: ${categories.join("; ")}`;
  }).join(" | ");
}

function turfFieldSizeAnswer(contexts: Context[]) {
  return YEARS.map((year) => {
    const context = contextFor(contexts, "turf_flat", year);
    return [4, 5].map((fieldSize) => {
      const rows = context.baseline.filter((row) => fieldSizeForRow(row) === fieldSize);
      return `field ${fieldSize}: A/E ${number(aeStats(rows).ae)}, ROI ${pct(summarizeRows(rows).roiPercentage)}, n=${summarizeRows(rows).settledSelections}`;
    }).join("; ");
  }).join(" | ");
}

function sampleAnswer(contexts: Context[], family: Family) {
  return YEARS.map((year) => {
    const summary = summarizeRows(contextFor(contexts, family, year).candidate);
    return `${year}: ${summary.settledSelections} settled (${sampleWarning(summary.settledSelections)})`;
  }).join("; ");
}

function preserveAnswer(contexts: Context[], family: Family) {
  const adequateBoth = YEARS.every((year) => summarizeRows(contextFor(contexts, family, year).candidate).settledSelections >= SPARSE_FLOOR);
  const aeBoth = YEARS.every((year) => (aeStats(contextFor(contexts, family, year).candidate).ae ?? 0) >= 1);
  return adequateBoth && aeBoth
    ? "Yes, as a named diagnostic research candidate only; do not expose as production filter yet."
    : "Not yet; keep diagnostic.";
}

function officialRatingCategory(context: Context, row: RankedResearchRow) {
  const rank = context.officialRatingRankByRunnerId.get(row.features.targetRunnerId) ?? null;
  if (rank === null) return "missing";
  if (rank === 1) return "top-rated";
  if (rank === 2) return "second";
  return "third+";
}

function priceBandForRow(row: RankedResearchRow): PriceBand | null {
  const sp = settleSelection(row.outcome)?.settlementOddsDecimal ?? null;
  if (sp === null || sp <= 0) return null;
  if (sp < 2) return "<2.0";
  if (sp < 3) return "2.0-2.99";
  if (sp < 5) return "3.0-4.99";
  if (sp < 8) return "5.0-7.99";
  return "8.0+";
}

function raceClassBucket(value: string | null) {
  const raceClass = raceClassNumber(value);
  return raceClass === null ? "unknown" : `Class ${raceClass}`;
}

function compareRaceClassBuckets(left: string, right: string) {
  if (left === "unknown") return 1;
  if (right === "unknown") return -1;
  return Number(left.replace("Class ", "")) - Number(right.replace("Class ", ""));
}

function fieldSizeForRow(row: HistoricalTargetRunnerMetricsRow) {
  return row.features.actualRunnerCount ?? row.features.declaredRunnerCount;
}

function summarizeRows(rows: HistoricalTargetRunnerMetricsRow[]): BacktestSummary {
  return summarizeSelections(rows.map(rowToSelection));
}

function rowToSelection(row: HistoricalTargetRunnerMetricsRow): BacktestSelection {
  return {
    id: row.features.targetRunnerId,
    definitionId: "jump-turf-candidate-confirmation",
    selectedReason: "Jump/Turf candidate confirmation",
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
    .map((row) => settleSelection(row.outcome)?.settlementOddsDecimal ?? null)
    .filter(isNumber)
    .filter((value) => value > 0);
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

function contextFor(contexts: Context[], family: Family, year: Year) {
  const context = contexts.find((item) => item.family === family && item.year === year);
  if (!context) throw new Error(`Missing context for ${family} ${year}`);
  return context;
}

function candidateName(family: Family): CandidateName {
  return family === "jump" ? "Jump OR-third+" : "Turf field-size-5";
}

function raceCodeForFamily(family: Family) {
  return family === "jump" ? "jump" : "turf";
}

function familyLabel(family: Family) {
  return family === "jump" ? "Jump" : "Turf";
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
  if (settled < VERY_SPARSE_FLOOR) return "very sparse";
  if (settled < SPARSE_FLOOR) return "sparse";
  return "adequate";
}

function retention(settled: number, baselineSettled: number) {
  return baselineSettled === 0 ? 0 : (settled / baselineSettled) * 100;
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
