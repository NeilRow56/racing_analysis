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

type Family = Exclude<BacktestCacheFamily, "all">;
type Year = "2025" | "2026";

type Context = {
  family: Family;
  year: Year;
  rows: HistoricalTargetRunnerMetricsRow[];
};

type RowSelection = {
  row: HistoricalTargetRunnerMetricsRow;
};

type GridCell = {
  trainerThreshold: number;
  fieldLimit: number;
  rows: RowSelection[];
  summary: BacktestSummary;
  ae: AeStats;
  averageSp: number | null;
  medianSp: number | null;
};

type AeStats = {
  runners: number;
  wins: number;
  expectedWins: number;
  ae: number | null;
};

const FAMILIES: Family[] = ["jump", "turf_flat", "all_weather_flat"];
const YEARS: Year[] = ["2025", "2026"];
const TRAINER_THRESHOLDS = [10, 12.5, 15, 17.5, 20] as const;
const FIELD_LIMITS = [4, 5, 6, 7] as const;
const MIN_TRAINER_RUNS = [null, 10, 20, 30, 50] as const;
const LOCAL_CELLS = [
  { trainerThreshold: 12.5, fieldLimit: 5 },
  { trainerThreshold: 15, fieldLimit: 4 },
  { trainerThreshold: 15, fieldLimit: 5 },
  { trainerThreshold: 15, fieldLimit: 6 },
  { trainerThreshold: 17.5, fieldLimit: 5 },
] as const;

async function main() {
  console.log("# Trainer + Small Field Robustness Diagnostic");
  console.log("");
  console.log("Diagnostic only: uses existing compatible caches, trainer prior strike/runs, field size, and existing settlement/SP conventions. No Research, Today, cache, holdout, UI, or production filter logic is changed.");
  console.log("");

  const contexts: Context[] = [];
  for (const family of FAMILIES) {
    for (const year of YEARS) {
      const cache = await loadLatestBacktestFeatureCacheForYear({ family, year });
      contexts.push({
        family,
        year,
        rows: cache
          ? cache.rows
            .filter((row) => row.features.raceCode === raceCodeForFamily(family))
            .sort(compareRowsChronologically)
          : [],
      });
    }
  }

  printThresholdGrids(contexts);
  printTrainerHistorySensitivity(contexts);
  printLocalThresholdStability(contexts);
  printPriceConcentration(contexts);
  printYearToYearObservations(contexts);
  printConclusion(contexts);
  printGuardrails();
}

function printThresholdGrids(contexts: Context[]) {
  console.log("## Threshold Grids");
  for (const context of contexts) {
    const cells = thresholdGrid(context);
    console.log(`### ${label(context)}`);
    printGrid("Settled runners", cells, (cell) => String(cell.summary.settledSelections));
    printGrid("Wins", cells, (cell) => String(cell.summary.wins));
    printGrid("Strike rate", cells, (cell) => pct(cell.summary.winStrikeRate));
    printGrid("£1 P/L", cells, (cell) => money(cell.summary.profitLoss));
    printGrid("ROI", cells, (cell) => pct(cell.summary.roiPercentage));
    printGrid("A/E", cells, (cell) => number(cell.ae.ae));
    printGrid("Average decimal SP", cells, (cell) => number(cell.averageSp));
  }
}

function printTrainerHistorySensitivity(contexts: Context[]) {
  console.log("## Trainer-History Sensitivity");
  for (const context of contexts) {
    console.log(`### ${label(context)}`);
    printTable(MIN_TRAINER_RUNS.map((minRuns) => {
      const rows = trainerSmallFieldRows(context.rows, {
        trainerThreshold: 15,
        fieldLimit: 5,
        minTrainerPriorRuns: minRuns,
      });
      const summary = summarizeRows(rows);
      const odds = settledDecimalSps(rows);
      const ae = aeStats(rows);
      return {
        "min trainer prior runs": minRuns === null ? "none" : `>=${minRuns}`,
        settled: summary.settledSelections,
        wins: summary.wins,
        "strike rate": pct(summary.winStrikeRate),
        "£1 P/L": money(summary.profitLoss),
        ROI: pct(summary.roiPercentage),
        "A/E": number(ae.ae),
        "avg decimal SP": number(average(odds)),
        sample: sampleWarning(summary.settledSelections),
      };
    }));
    console.log("");
  }
}

function printLocalThresholdStability(contexts: Context[]) {
  console.log("## Local-Threshold Stability");
  printTable(FAMILIES.map((family) => {
    const context2025 = contexts.find((context) => context.family === family && context.year === "2025");
    const context2026 = contexts.find((context) => context.family === family && context.year === "2026");
    const comparisons = LOCAL_CELLS.map((cell) => {
      const left = context2025 ? cellStats(context2025, cell.trainerThreshold, cell.fieldLimit) : null;
      const right = context2026 ? cellStats(context2026, cell.trainerThreshold, cell.fieldLimit) : null;
      return { cell, left, right };
    });
    const strikeDiffs = comparisons
      .map((comparison) => absoluteDelta(comparison.left?.summary.winStrikeRate ?? null, comparison.right?.summary.winStrikeRate ?? null))
      .filter(isNumber);
    const aeDiffs = comparisons
      .map((comparison) => absoluteDelta(comparison.left?.ae.ae ?? null, comparison.right?.ae.ae ?? null))
      .filter(isNumber);
    const roiConsistent = comparisons.filter((comparison) =>
      comparison.left !== null &&
      comparison.right !== null &&
      roiSign(comparison.left.summary.roiPercentage) === roiSign(comparison.right.summary.roiPercentage)
    ).length;
    const adequate = comparisons.filter((comparison) =>
      (comparison.left?.summary.settledSelections ?? 0) >= 100 &&
      (comparison.right?.summary.settledSelections ?? 0) >= 100
    ).length;
    return {
      family: familyLabel(family),
      "avg abs strike diff": `${number(average(strikeDiffs))}pp`,
      "avg abs A/E diff": number(average(aeDiffs)),
      "ROI sign consistent cells": `${roiConsistent}/${LOCAL_CELLS.length}`,
      "adequate sample cells": `${adequate}/${LOCAL_CELLS.length}`,
      assessment: localStabilityAssessment(comparisons),
    };
  }));
  console.log("");
}

function printPriceConcentration(contexts: Context[]) {
  console.log("## Price Concentration");
  for (const context of contexts) {
    console.log(`### ${label(context)}`);
    const relevant = [
      { label: ">=12.5% / <=5", trainerThreshold: 12.5, fieldLimit: 5 },
      { label: ">=15% / <=4", trainerThreshold: 15, fieldLimit: 4 },
      { label: ">=15% / <=5", trainerThreshold: 15, fieldLimit: 5 },
      { label: ">=15% / <=6", trainerThreshold: 15, fieldLimit: 6 },
      { label: ">=17.5% / <=5", trainerThreshold: 17.5, fieldLimit: 5 },
      { label: ">=20% / <=5", trainerThreshold: 20, fieldLimit: 5 },
    ];
    printTable(relevant.map((item) => {
      const rows = trainerSmallFieldRows(context.rows, item);
      const summary = summarizeRows(rows);
      const odds = settledDecimalSps(rows);
      return {
        threshold: item.label,
        settled: summary.settledSelections,
        "strike rate": pct(summary.winStrikeRate),
        ROI: pct(summary.roiPercentage),
        "avg decimal SP": number(average(odds)),
        "median decimal SP": number(median(odds)),
      };
    }));
    console.log("");
  }
}

function printYearToYearObservations(contexts: Context[]) {
  console.log("## 2025 Vs 2026 Observations");
  printTable(FAMILIES.flatMap((family) => [
    familyObservationRow(contexts, family, "trainer >=15% / field <=5", 15, 5),
    familyObservationRow(contexts, family, "trainer >=12.5% / field <=5", 12.5, 5),
    familyObservationRow(contexts, family, "trainer >=17.5% / field <=5", 17.5, 5),
    familyObservationRow(contexts, family, "trainer >=15% / field <=4", 15, 4),
    familyObservationRow(contexts, family, "trainer >=15% / field <=6", 15, 6),
  ]));
  console.log("");
}

function printConclusion(contexts: Context[]) {
  console.log("## Conclusion");
  printTable([
    { question: "1. Is >=15% / <=5 part of a broad stable region?", answer: broadStableRegionAnswer(contexts) },
    { question: "2. Does it survive nearby threshold changes in both years?", answer: nearbySurvivalAnswer(contexts) },
    { question: "3. Driven mainly by small fields, trainers, or both?", answer: driverAnswer(contexts) },
    { question: "4. Does more trainer history improve reliability?", answer: trainerHistoryAnswer(contexts) },
    { question: "5. Evidence of threshold area rather than exact cutoff?", answer: thresholdAreaAnswer(contexts) },
    { question: "6. Are ROI and A/E stable enough for production exposure?", answer: roiAeProductionAnswer(contexts) },
    { question: "7. Should this remain diagnostic?", answer: "Yes. Strike-rate robustness is encouraging, but ROI and A/E are not stable enough across families/years to justify production exposure yet." },
  ]);
  console.log("");
}

function printGuardrails() {
  console.log("## Guardrail Summary");
  printTable([
    { item: "Production logic changed", result: "No" },
    { item: "Research/Today/saved/frozen rules changed", result: "No" },
    { item: "Cache rebuild performed", result: "No" },
    { item: "Data source", result: "Existing compatible feature caches only" },
    { item: "Inputs", result: "trainerPriorWinRate, trainerPriorRuns, actual/declared field size, existing settlement decimal SP" },
  ]);
}

function thresholdGrid(context: Context): GridCell[] {
  return TRAINER_THRESHOLDS.flatMap((trainerThreshold) =>
    FIELD_LIMITS.map((fieldLimit) => cellStats(context, trainerThreshold, fieldLimit))
  );
}

function cellStats(context: Context, trainerThreshold: number, fieldLimit: number): GridCell {
  const rows = trainerSmallFieldRows(context.rows, { trainerThreshold, fieldLimit });
  const summary = summarizeRows(rows);
  const odds = settledDecimalSps(rows);
  return {
    trainerThreshold,
    fieldLimit,
    rows,
    summary,
    ae: aeStats(rows),
    averageSp: average(odds),
    medianSp: median(odds),
  };
}

function trainerSmallFieldRows(
  rows: HistoricalTargetRunnerMetricsRow[],
  input: {
    trainerThreshold: number;
    fieldLimit: number;
    minTrainerPriorRuns?: number | null;
  },
): RowSelection[] {
  return rows
    .filter((row) => row.features.trainerPriorWinRate !== null && row.features.trainerPriorWinRate >= input.trainerThreshold)
    .filter((row) => {
      const fieldSize = fieldSizeForRow(row);
      return fieldSize !== null && fieldSize <= input.fieldLimit;
    })
    .filter((row) => input.minTrainerPriorRuns === undefined || input.minTrainerPriorRuns === null || row.features.trainerPriorRuns >= input.minTrainerPriorRuns)
    .map((row) => ({ row }));
}

function printGrid(
  title: string,
  cells: GridCell[],
  valueFor: (cell: GridCell) => string,
) {
  console.log(`#### ${title}`);
  printTable(TRAINER_THRESHOLDS.map((trainerThreshold) => {
    const row: Record<string, unknown> = { "Trainer SR": `>=${trainerThreshold}%` };
    for (const fieldLimit of FIELD_LIMITS) {
      const cell = cells.find((candidate) => candidate.trainerThreshold === trainerThreshold && candidate.fieldLimit === fieldLimit);
      row[`<=${fieldLimit}`] = cell ? valueFor(cell) : "n/a";
    }
    return row;
  }));
  console.log("");
}

function familyObservationRow(
  contexts: Context[],
  family: Family,
  threshold: string,
  trainerThreshold: number,
  fieldLimit: number,
) {
  const context2025 = contexts.find((context) => context.family === family && context.year === "2025");
  const context2026 = contexts.find((context) => context.family === family && context.year === "2026");
  const left = context2025 ? cellStats(context2025, trainerThreshold, fieldLimit) : null;
  const right = context2026 ? cellStats(context2026, trainerThreshold, fieldLimit) : null;
  return {
    family: familyLabel(family),
    threshold,
    "2025 settled": left?.summary.settledSelections ?? 0,
    "2025 strike": pct(left?.summary.winStrikeRate ?? null),
    "2025 ROI": pct(left?.summary.roiPercentage ?? null),
    "2025 A/E": number(left?.ae.ae ?? null),
    "2026 settled": right?.summary.settledSelections ?? 0,
    "2026 strike": pct(right?.summary.winStrikeRate ?? null),
    "2026 ROI": pct(right?.summary.roiPercentage ?? null),
    "2026 A/E": number(right?.ae.ae ?? null),
    observation: thresholdObservation(left, right),
  };
}

function thresholdObservation(left: GridCell | null, right: GridCell | null) {
  if (!left || !right || left.summary.settledSelections < 100 || right.summary.settledSelections < 100) return "sample limited";
  const strikeDelta = absoluteDelta(left.summary.winStrikeRate, right.summary.winStrikeRate);
  const aeDelta = absoluteDelta(left.ae.ae, right.ae.ae);
  if (strikeDelta === null || aeDelta === null) return "sample limited";
  if (strikeDelta <= 5 && aeDelta <= 0.1) return "stable";
  if (strikeDelta <= 10 && aeDelta <= 0.2) return "moderately stable";
  return "unstable";
}

function localStabilityAssessment(comparisons: Array<{
  cell: typeof LOCAL_CELLS[number];
  left: GridCell | null;
  right: GridCell | null;
}>) {
  const adequate = comparisons.filter((comparison) =>
    (comparison.left?.summary.settledSelections ?? 0) >= 100 &&
    (comparison.right?.summary.settledSelections ?? 0) >= 100
  ).length;
  const stable = comparisons.filter((comparison) => thresholdObservation(comparison.left, comparison.right) === "stable").length;
  if (adequate < 3) return "samples are thin around the neighbourhood";
  if (stable >= 4) return "broad local region looks stable";
  if (stable >= 2) return "some local robustness, not uniform";
  return "local region is unstable";
}

function broadStableRegionAnswer(contexts: Context[]) {
  return FAMILIES.map((family) => {
    const context2025 = contexts.find((context) => context.family === family && context.year === "2025");
    const context2026 = contexts.find((context) => context.family === family && context.year === "2026");
    const local = LOCAL_CELLS.map((cell) => ({
      left: context2025 ? cellStats(context2025, cell.trainerThreshold, cell.fieldLimit) : null,
      right: context2026 ? cellStats(context2026, cell.trainerThreshold, cell.fieldLimit) : null,
    }));
    const strongBothYears = local.filter((entry) =>
      (entry.left?.summary.winStrikeRate ?? 0) >= 25 &&
      (entry.right?.summary.winStrikeRate ?? 0) >= 25 &&
      (entry.left?.summary.settledSelections ?? 0) >= 100 &&
      (entry.right?.summary.settledSelections ?? 0) >= 100
    ).length;
    return `${familyLabel(family)} ${strongBothYears}/${LOCAL_CELLS.length} nearby cells >=25% strike in both years with >=100 settled`;
  }).join("; ");
}

function nearbySurvivalAnswer(contexts: Context[]) {
  return FAMILIES.map((family) => {
    const context2025 = contexts.find((context) => context.family === family && context.year === "2025")!;
    const context2026 = contexts.find((context) => context.family === family && context.year === "2026")!;
    const current2025 = cellStats(context2025, 15, 5);
    const current2026 = cellStats(context2026, 15, 5);
    const loose2025 = cellStats(context2025, 12.5, 5);
    const loose2026 = cellStats(context2026, 12.5, 5);
    const strict2025 = cellStats(context2025, 17.5, 5);
    const strict2026 = cellStats(context2026, 17.5, 5);
    return `${familyLabel(family)} current ${pct(current2025.summary.winStrikeRate)}/${pct(current2026.summary.winStrikeRate)}, loose trainer ${pct(loose2025.summary.winStrikeRate)}/${pct(loose2026.summary.winStrikeRate)}, stricter trainer ${pct(strict2025.summary.winStrikeRate)}/${pct(strict2026.summary.winStrikeRate)}`;
  }).join("; ");
}

function driverAnswer(contexts: Context[]) {
  return FAMILIES.map((family) => {
    const context2025 = contexts.find((context) => context.family === family && context.year === "2025")!;
    const context2026 = contexts.find((context) => context.family === family && context.year === "2026")!;
    const field4 = average([cellStats(context2025, 15, 4).summary.winStrikeRate, cellStats(context2026, 15, 4).summary.winStrikeRate].filter(isNumber));
    const field7 = average([cellStats(context2025, 15, 7).summary.winStrikeRate, cellStats(context2026, 15, 7).summary.winStrikeRate].filter(isNumber));
    const trainer10 = average([cellStats(context2025, 10, 5).summary.winStrikeRate, cellStats(context2026, 10, 5).summary.winStrikeRate].filter(isNumber));
    const trainer20 = average([cellStats(context2025, 20, 5).summary.winStrikeRate, cellStats(context2026, 20, 5).summary.winStrikeRate].filter(isNumber));
    return `${familyLabel(family)} field <=4 vs <=7 at 15%: ${pct(field4)} vs ${pct(field7)}; trainer >=10 vs >=20 at <=5: ${pct(trainer10)} vs ${pct(trainer20)}`;
  }).join("; ");
}

function trainerHistoryAnswer(contexts: Context[]) {
  return FAMILIES.map((family) => {
    const pieces = YEARS.map((year) => {
      const context = contexts.find((candidate) => candidate.family === family && candidate.year === year)!;
      const noMin = summarizeRows(trainerSmallFieldRows(context.rows, { trainerThreshold: 15, fieldLimit: 5 })).winStrikeRate;
      const min50 = summarizeRows(trainerSmallFieldRows(context.rows, { trainerThreshold: 15, fieldLimit: 5, minTrainerPriorRuns: 50 })).winStrikeRate;
      return `${year} ${pct(noMin)} -> ${pct(min50)}`;
    });
    return `${familyLabel(family)} ${pieces.join(", ")}`;
  }).join("; ");
}

function thresholdAreaAnswer(contexts: Context[]) {
  return FAMILIES.map((family) => {
    const context2025 = contexts.find((context) => context.family === family && context.year === "2025")!;
    const context2026 = contexts.find((context) => context.family === family && context.year === "2026")!;
    const cells = LOCAL_CELLS.map((cell) => [cellStats(context2025, cell.trainerThreshold, cell.fieldLimit), cellStats(context2026, cell.trainerThreshold, cell.fieldLimit)] as const);
    const positiveAe = cells.filter(([left, right]) => (left.ae.ae ?? 0) >= 0.95 && (right.ae.ae ?? 0) >= 0.95).length;
    return `${familyLabel(family)} ${positiveAe}/${LOCAL_CELLS.length} nearby cells have A/E >=0.95 in both years`;
  }).join("; ");
}

function roiAeProductionAnswer(contexts: Context[]) {
  return FAMILIES.map((family) => {
    const context2025 = contexts.find((context) => context.family === family && context.year === "2025")!;
    const context2026 = contexts.find((context) => context.family === family && context.year === "2026")!;
    const current2025 = cellStats(context2025, 15, 5);
    const current2026 = cellStats(context2026, 15, 5);
    return `${familyLabel(family)} ROI ${pct(current2025.summary.roiPercentage)}/${pct(current2026.summary.roiPercentage)}, A/E ${number(current2025.ae.ae)}/${number(current2026.ae.ae)}`;
  }).join("; ");
}

function summarizeRows(selections: RowSelection[]) {
  return summarizeSelections(selections.map((selection) => rowToSelection(selection.row)));
}

function rowToSelection(row: HistoricalTargetRunnerMetricsRow): BacktestSelection {
  return {
    id: row.features.targetRunnerId,
    definitionId: "trainer-small-field-diagnostic",
    selectedReason: "Trainer small-field diagnostic",
    features: row.features,
    derived: deriveBacktestFeatureValues(row.features),
    outcome: row.outcome,
    settlement: settleSelection(row.outcome),
  };
}

function aeStats(selections: RowSelection[]): AeStats {
  const settled = selections
    .map((selection) => ({
      selection,
      settlement: settleSelection(selection.row.outcome),
    }))
    .filter((entry) => entry.settlement !== null && entry.settlement.settlementOddsDecimal > 0);
  const expectedWins = settled.reduce(
    (total, entry) => total + (1 / entry.settlement!.settlementOddsDecimal),
    0,
  );
  const wins = settled.filter((entry) => entry.selection.row.outcome.won).length;
  return {
    runners: settled.length,
    wins,
    expectedWins,
    ae: expectedWins === 0 ? null : wins / expectedWins,
  };
}

function settledDecimalSps(selections: RowSelection[]) {
  return selections
    .map((selection) => settleSelection(selection.row.outcome)?.settlementOddsDecimal ?? null)
    .filter(isNumber)
    .filter((value) => value > 0);
}

function fieldSizeForRow(row: HistoricalTargetRunnerMetricsRow) {
  return row.features.actualRunnerCount ?? row.features.declaredRunnerCount;
}

function roiSign(value: number | null) {
  if (value === null) return "missing";
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "zero";
}

function sampleWarning(settled: number) {
  if (settled < 25) return "<25 settled";
  if (settled < 100) return "25-99 settled";
  return ">=100 settled";
}

function compareRowsChronologically(
  left: HistoricalTargetRunnerMetricsRow,
  right: HistoricalTargetRunnerMetricsRow,
) {
  return left.features.raceDateTime.getTime() - right.features.raceDateTime.getTime() ||
    left.features.targetRaceId.localeCompare(right.features.targetRaceId) ||
    left.features.targetRunnerId.localeCompare(right.features.targetRunnerId);
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

function absoluteDelta(left: number | null, right: number | null) {
  return left === null || right === null ? null : Math.abs(right - left);
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
