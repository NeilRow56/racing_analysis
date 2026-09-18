import { writeFile } from "node:fs/promises";
import { settleSelection, type BacktestSettlement } from "@/lib/racing/backtest";
import { loadLatestBacktestFeatureCacheForYear } from "@/lib/racing/backtest-cache";
import { rankRows, type RankedResearchRow } from "@/lib/racing/research-rule";

type Year = "2025" | "2026";
type SettlementMode = "actual" | "cap_20_1";

type Context = {
  year: Year;
  cacheFrom: string;
  cacheTo: string;
  actualFrom: string;
  actualTo: string;
  rows: RankedResearchRow[];
};

type SettledEntry = {
  row: RankedResearchRow;
  actual: BacktestSettlement;
  capped20: BacktestSettlement;
};

type Metrics = {
  runners: number;
  settled: number;
  winners: number;
  strike: number | null;
  profitLoss: number;
  roi: number | null;
  expectedWins: number;
  ae: number | null;
  averageSp: number | null;
  medianSp: number | null;
  averageWinningSp: number | null;
  medianWinningSp: number | null;
  largestWinningSp: number | null;
};

type SpBand = {
  label: string;
  minInclusive: number | null;
  maxExclusive: number | null;
};

type Population = {
  key: string;
  title: string;
  predicate: (row: RankedResearchRow) => boolean;
};

const OUTPUT_PATH = "/tmp/turf-settlement-baseline.md";
const YEARS: Year[] = ["2025", "2026"];
const WINNER_CAP_20_DECIMAL = 21;

const SP_BANDS: SpBand[] = [
  { label: "odds-on (<1/1, decimal <2.0)", minInclusive: null, maxExclusive: 2 },
  { label: "1/1 to <2/1 (2.0 to <3.0)", minInclusive: 2, maxExclusive: 3 },
  { label: "2/1 to <4/1 (3.0 to <5.0)", minInclusive: 3, maxExclusive: 5 },
  { label: "4/1 to <8/1 (5.0 to <9.0)", minInclusive: 5, maxExclusive: 9 },
  { label: "8/1 to <12/1 (9.0 to <13.0)", minInclusive: 9, maxExclusive: 13 },
  { label: "12/1 to <20/1 (13.0 to <21.0)", minInclusive: 13, maxExclusive: 21 },
  { label: "20/1+ (21.0+)", minInclusive: 21, maxExclusive: null },
];

async function main() {
  const contexts = await Promise.all(YEARS.map(loadContext));
  const populations = populationDefinitions();
  const lines: string[] = [];

  writeReport(lines, contexts, populations);
  await writeFile(OUTPUT_PATH, `${lines.join("\n")}\n`, "utf8");

  console.log(`Wrote ${OUTPUT_PATH}`);
  for (const context of contexts) {
    const uncapped = metricsFor(context.rows, "actual");
    const capped = metricsFor(context.rows, "cap_20_1");
    console.log(
      `${context.year}: all Turf settled ${uncapped.settled}, uncapped ROI ${pct(uncapped.roi)}, capped ROI ${pct(capped.roi)}`,
    );
  }
}

async function loadContext(year: Year): Promise<Context> {
  const cache = await loadLatestBacktestFeatureCacheForYear({ family: "turf_flat", year }) ??
    await loadLatestBacktestFeatureCacheForYear({ family: "all", year });
  if (!cache) {
    throw new Error(`Missing compatible Turf cache for ${year}. Rebuild the v4 Turf cache before running this diagnostic.`);
  }
  return {
    year,
    cacheFrom: cache.manifest.from,
    cacheTo: cache.manifest.to,
    actualFrom: cache.actualCoverage?.actualFrom ?? cache.manifest.from,
    actualTo: cache.actualCoverage?.actualTo ?? cache.manifest.to,
    rows: rankRows(cache.rows.filter((row) => row.features.raceCode === "turf")),
  };
}

function writeReport(lines: string[], contexts: Context[], populations: Population[]) {
  lines.push("# Turf Settlement Baseline Diagnostic");
  lines.push("");
  lines.push("Diagnostic only. Research UI, Today, settlement defaults, saved/frozen rules, importers, schema, cache version, cache build logic, and TPR formula were not changed.");
  lines.push("");
  lines.push("Scope: full Flat Turf cache populations for 2025 and 2026. ROI/P&L use settled runners only. A/E uses actual final decimal SP and is unchanged by winner-return capping.");
  lines.push("");

  writePopulationReconciliation(lines, contexts);
  writeCappedBaseline(lines, contexts);
  writeUncappedBaseline(lines, contexts);
  writeCappedVsUncapped(lines, contexts);
  writeSpBandProfile(lines, contexts);
  writeLongshotContribution(lines, contexts);
  writeRaceOverround(lines, contexts);
  writePreviouslyTestedPopulations(lines, contexts, populations);
  writeConclusion(lines, contexts, populations);
}

function writePopulationReconciliation(lines: string[], contexts: Context[]) {
  lines.push("## Population Reconciliation");
  lines.push("");
  table(lines, contexts.map((context) => {
    const settled = settledEntries(context.rows);
    return {
      year: context.year,
      "cache window": `${context.cacheFrom} to ${context.cacheTo}`,
      "actual coverage": `${context.actualFrom} to ${context.actualTo}`,
      runners: context.rows.length,
      settled: settled.length,
      "missing/unusable settlement": context.rows.length - settled.length,
      winners: settled.filter((entry) => entry.row.outcome.won).length,
    };
  }));
  lines.push("");
}

function writeCappedBaseline(lines: string[], contexts: Context[]) {
  lines.push("## Capped Baseline");
  lines.push("");
  lines.push("Settlement: existing development convention, winner returns capped at 20/1.");
  lines.push("");
  table(lines, contexts.map((context) => ({
    year: context.year,
    ...baselineColumns(metricsFor(context.rows, "cap_20_1")),
  })));
  lines.push("");
}

function writeUncappedBaseline(lines: string[], contexts: Context[]) {
  lines.push("## Uncapped Baseline");
  lines.push("");
  lines.push("Settlement: actual final SP with no winner cap.");
  lines.push("");
  table(lines, contexts.map((context) => ({
    year: context.year,
    ...baselineColumns(metricsFor(context.rows, "actual")),
  })));
  lines.push("");
}

function writeCappedVsUncapped(lines: string[], contexts: Context[]) {
  lines.push("## Capped Vs Uncapped");
  lines.push("");
  table(lines, contexts.map((context) => cappedComparisonRow(context.year, context.rows)));
  lines.push("");
}

function writeSpBandProfile(lines: string[], contexts: Context[]) {
  lines.push("## SP-Band Profile");
  lines.push("");
  lines.push("Uses uncapped actual final SP. Rows without usable final SP are excluded from this section because they cannot be assigned to a price band.");
  lines.push("");
  for (const context of contexts) {
    lines.push(`### ${context.year}`);
    table(lines, SP_BANDS.map((band) => {
      const rows = rowsInBand(context.rows, band);
      const metrics = metricsFor(rows, "actual");
      return {
        band: band.label,
        runners: metrics.settled,
        settled: metrics.settled,
        winners: metrics.winners,
        strike: pct(metrics.strike),
        "P/L": money(metrics.profitLoss),
        ROI: pct(metrics.roi),
        "A/E": number(metrics.ae),
        "avg SP": number(metrics.averageSp),
      };
    }));
    lines.push("");
  }
}

function writeLongshotContribution(lines: string[], contexts: Context[]) {
  lines.push("## Longshot Contribution");
  lines.push("");
  table(lines, contexts.flatMap((context) =>
    [21, 31, 51].map((threshold) => longshotRow(context.year, context.rows, threshold))
  ));
  lines.push("");
}

function writeRaceOverround(lines: string[], contexts: Context[]) {
  lines.push("## Optional Race Overround");
  lines.push("");
  const rows = contexts.map((context) => raceOverroundRow(context));
  const suitable = rows.some((row) => row["complete races used"] > 0);
  if (!suitable) {
    lines.push("Omitted: no races had complete enough usable final-SP coverage to calculate race overround reliably.");
    lines.push("");
    return;
  }
  table(lines, rows);
  lines.push("");
}

function writePreviouslyTestedPopulations(lines: string[], contexts: Context[], populations: Population[]) {
  lines.push("## Previously Tested Populations");
  lines.push("");
  table(lines, contexts.flatMap((context) =>
    populations.map((population) => {
      const rows = context.rows.filter(population.predicate);
      return {
        year: context.year,
        population: population.title,
        settled: metricsFor(rows, "actual").settled,
        "capped ROI": pct(metricsFor(rows, "cap_20_1").roi),
        "uncapped ROI": pct(metricsFor(rows, "actual").roi),
        "uncapped A/E": number(metricsFor(rows, "actual").ae),
      };
    })
  ));
  lines.push("");
}

function writeConclusion(lines: string[], contexts: Context[], populations: Population[]) {
  lines.push("## Conclusion Questions");
  lines.push("");
  const context2025 = contextFor(contexts, "2025");
  const context2026 = contextFor(contexts, "2026");
  const uncapped2025 = metricsFor(context2025.rows, "actual");
  const uncapped2026 = metricsFor(context2026.rows, "actual");
  const comparison2025 = capComparison(context2025.rows);
  const comparison2026 = capComparison(context2026.rows);
  numbered(lines, [
    `What is the true uncapped all-Turf ROI in 2025? ${pct(uncapped2025.roi)}.`,
    `What is the true uncapped all-Turf ROI in 2026? ${pct(uncapped2026.roi)}.`,
    `How many ROI points does the 20/1 cap remove? 2025 ${pp(comparison2025.roiDifference)}, 2026 ${pp(comparison2026.roiDifference)}.`,
    `How much return is removed solely because of the cap? 2025 ${money(comparison2025.returnRemoved)}, 2026 ${money(comparison2026.returnRemoved)}.`,
    `Do uncapped figures move materially closer to a normal market-loss baseline? Compare the uncapped ROI rows above with the capped baseline; this script does not change production settlement.`,
    `Which SP ranges account for most losses? See the SP-band profile; no filters are derived from it here.`,
    `How important are 20/1+ winners? See longshot contribution for winner count, return share, and P/L contribution.`,
    `Does the cap materially distort comparison of Turf filters? See the capped/uncapped rows for ${populations.map((population) => population.title).join(" and ")}.`,
    "Should uncapped SP become the preferred diagnostic settlement, with capped settlement retained as a robustness view? This report prepares the evidence only; it makes no production behavior change.",
  ]);
}

function populationDefinitions(): Population[] {
  return [
    {
      key: "field5_trainer15",
      title: "Population A: field size <=5 + trainer prior strike rate >=15%",
      predicate: (row) => hasField5(row) && hasTrainer15(row),
    },
    {
      key: "tpr_rank1_field5_trainer15",
      title: "Population B: TPR rank =1 + field size <=5 + trainer prior strike rate >=15%",
      predicate: (row) => hasTprRank1(row) && hasField5(row) && hasTrainer15(row),
    },
  ];
}

function metricsFor(rows: RankedResearchRow[], mode: SettlementMode): Metrics {
  const settled = settledEntries(rows);
  const settlementFor = mode === "actual"
    ? (entry: SettledEntry) => entry.actual
    : (entry: SettledEntry) => entry.capped20;
  const winners = settled.filter((entry) => entry.row.outcome.won);
  const profitLoss = settled.reduce((total, entry) => total + settlementFor(entry).profitLoss, 0);
  const expectedWins = settled.reduce((total, entry) => total + (1 / entry.actual.settlementOddsDecimal), 0);
  const sps = settled.map((entry) => entry.actual.settlementOddsDecimal);
  const winningSps = winners.map((entry) => entry.actual.settlementOddsDecimal);
  return {
    runners: rows.length,
    settled: settled.length,
    winners: winners.length,
    strike: settled.length === 0 ? null : (winners.length / settled.length) * 100,
    profitLoss,
    roi: settled.length === 0 ? null : (profitLoss / settled.length) * 100,
    expectedWins,
    ae: expectedWins === 0 ? null : winners.length / expectedWins,
    averageSp: average(sps),
    medianSp: median(sps),
    averageWinningSp: average(winningSps),
    medianWinningSp: median(winningSps),
    largestWinningSp: winningSps.length === 0 ? null : Math.max(...winningSps),
  };
}

function settledEntries(rows: RankedResearchRow[]): SettledEntry[] {
  return [...rows]
    .sort(compareRowsChronologically)
    .map((row) => {
      const actual = settleSelection(row.outcome);
      return actual && actual.settlementOddsDecimal > 0
        ? { row, actual, capped20: capWinnerAt20(row, actual) }
        : null;
    })
    .filter((entry): entry is SettledEntry => entry !== null);
}

function capWinnerAt20(row: RankedResearchRow, settlement: BacktestSettlement): BacktestSettlement {
  if (!row.outcome.won || settlement.settlementOddsDecimal <= WINNER_CAP_20_DECIMAL) {
    return settlement;
  }
  return settleSelection(row.outcome, { maxFractionalOdds: WINNER_CAP_20_DECIMAL - 1 })!;
}

function baselineColumns(metrics: Metrics) {
  return {
    runners: metrics.runners,
    settled: metrics.settled,
    winners: metrics.winners,
    strike: pct(metrics.strike),
    "P/L": money(metrics.profitLoss),
    ROI: pct(metrics.roi),
    "A/E": number(metrics.ae),
    "avg winning SP": number(metrics.averageWinningSp),
    "median winning SP": number(metrics.medianWinningSp),
    "largest winning SP": number(metrics.largestWinningSp),
  };
}

function cappedComparisonRow(year: Year, rows: RankedResearchRow[]) {
  const comparison = capComparison(rows);
  return {
    year,
    "capped ROI": pct(comparison.capped.roi),
    "uncapped ROI": pct(comparison.uncapped.roi),
    "ROI pp difference": pp(comparison.roiDifference),
    "capped P/L": money(comparison.capped.profitLoss),
    "uncapped P/L": money(comparison.uncapped.profitLoss),
    "P/L difference": money(comparison.profitDifference),
    "winners affected": comparison.winnersAffected,
    "total return removed": money(comparison.returnRemoved),
    "% uncapped winning returns removed": pct(comparison.winningReturnRemovedPct),
    "A/E note": "same A/E; cap changes P/L/ROI only",
  };
}

function capComparison(rows: RankedResearchRow[]) {
  const entries = settledEntries(rows);
  const capped = metricsFor(rows, "cap_20_1");
  const uncapped = metricsFor(rows, "actual");
  const affected = entries.filter((entry) =>
    entry.row.outcome.won && entry.actual.settlementOddsDecimal > WINNER_CAP_20_DECIMAL
  );
  const returnRemoved = affected.reduce(
    (total, entry) => total + (entry.actual.grossReturn - entry.capped20.grossReturn),
    0,
  );
  const uncappedWinningReturns = entries
    .filter((entry) => entry.row.outcome.won)
    .reduce((total, entry) => total + entry.actual.grossReturn, 0);
  return {
    capped,
    uncapped,
    roiDifference: uncapped.roi === null || capped.roi === null ? null : uncapped.roi - capped.roi,
    profitDifference: uncapped.profitLoss - capped.profitLoss,
    winnersAffected: affected.length,
    returnRemoved,
    winningReturnRemovedPct: uncappedWinningReturns === 0 ? null : (returnRemoved / uncappedWinningReturns) * 100,
  };
}

function rowsInBand(rows: RankedResearchRow[], band: SpBand): RankedResearchRow[] {
  return rows.filter((row) => {
    const sp = settleSelection(row.outcome)?.settlementOddsDecimal ?? null;
    if (sp === null || sp <= 0) return false;
    if (band.minInclusive !== null && sp < band.minInclusive) return false;
    return band.maxExclusive === null || sp < band.maxExclusive;
  });
}

function longshotRow(year: Year, rows: RankedResearchRow[], thresholdDecimal: number) {
  const entries = settledEntries(rows);
  const winners = entries.filter((entry) =>
    entry.row.outcome.won && entry.actual.settlementOddsDecimal >= thresholdDecimal
  );
  const totalWinningReturn = entries
    .filter((entry) => entry.row.outcome.won)
    .reduce((total, entry) => total + entry.actual.grossReturn, 0);
  const totalProfitLoss = entries.reduce((total, entry) => total + entry.actual.profitLoss, 0);
  const uncappedReturn = winners.reduce((total, entry) => total + entry.actual.grossReturn, 0);
  const profitLossContribution = winners.reduce((total, entry) => total + entry.actual.profitLoss, 0);
  return {
    year,
    threshold: `${thresholdDecimal - 1}/1+`,
    winners: winners.length,
    "total uncapped return": money(uncappedReturn),
    "% total winning return": pct(totalWinningReturn === 0 ? null : (uncappedReturn / totalWinningReturn) * 100),
    "P/L contribution": money(profitLossContribution),
    "% total P/L": pct(totalProfitLoss === 0 ? null : (profitLossContribution / totalProfitLoss) * 100),
  };
}

function raceOverroundRow(context: Context) {
  const byRace = new Map<string, RankedResearchRow[]>();
  for (const row of context.rows) {
    const rows = byRace.get(row.features.targetRaceId) ?? [];
    rows.push(row);
    byRace.set(row.features.targetRaceId, rows);
  }
  const overrounds: number[] = [];
  for (const rows of byRace.values()) {
    const expectedRunnerCount = rows[0]?.features.actualRunnerCount ?? rows[0]?.features.declaredRunnerCount ?? null;
    const settled = settledEntries(rows);
    if (expectedRunnerCount === null || expectedRunnerCount <= 0 || settled.length !== expectedRunnerCount) {
      continue;
    }
    overrounds.push(settled.reduce((total, entry) => total + (1 / entry.actual.settlementOddsDecimal), 0) * 100);
  }
  const quartiles = quantiles(overrounds);
  return {
    year: context.year,
    "complete races used": overrounds.length,
    "mean overround": pct(average(overrounds)),
    "median overround": pct(median(overrounds)),
    "q1 overround": pct(quartiles.q1),
    "q3 overround": pct(quartiles.q3),
  };
}

function hasTrainer15(row: RankedResearchRow): boolean {
  return (row.features.trainerPriorWinRate ?? -Infinity) >= 15;
}

function hasField5(row: RankedResearchRow): boolean {
  const value = row.features.actualRunnerCount ?? row.features.declaredRunnerCount;
  return value !== null && value <= 5;
}

function hasTprRank1(row: RankedResearchRow): boolean {
  return row.turfPerformance?.rank === 1;
}

function contextFor(contexts: Context[], year: Year): Context {
  const context = contexts.find((item) => item.year === year);
  if (!context) throw new Error(`Missing context ${year}`);
  return context;
}

function compareRowsChronologically(left: RankedResearchRow, right: RankedResearchRow): number {
  return left.features.raceDateTime.getTime() - right.features.raceDateTime.getTime() ||
    left.features.targetRaceId.localeCompare(right.features.targetRaceId) ||
    left.features.targetRunnerId.localeCompare(right.features.targetRunnerId);
}

function average(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((total, value) => total + value, 0) / values.length;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}

function quantiles(values: number[]): { q1: number | null; q3: number | null } {
  if (values.length === 0) return { q1: null, q3: null };
  const sorted = [...values].sort((left, right) => left - right);
  return {
    q1: percentile(sorted, 0.25),
    q3: percentile(sorted, 0.75),
  };
}

function percentile(sortedValues: number[], p: number): number | null {
  if (sortedValues.length === 0) return null;
  const index = (sortedValues.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower]!;
  const weight = index - lower;
  return sortedValues[lower]! * (1 - weight) + sortedValues[upper]! * weight;
}

function pct(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "n/a" : `${value.toFixed(1)}%`;
}

function pp(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "n/a" : `${value.toFixed(1)}pp`;
}

function money(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "n/a";
  return value < 0 ? `-${Math.abs(value).toFixed(2)}` : value.toFixed(2);
}

function number(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "n/a" : value.toFixed(2);
}

function table(lines: string[], rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) {
    lines.push("_No rows_");
    return;
  }
  const columns = Object.keys(rows[0]!);
  lines.push(`| ${columns.join(" | ")} |`);
  lines.push(`| ${columns.map(() => "---").join(" | ")} |`);
  for (const row of rows) {
    lines.push(`| ${columns.map((column) => printable(row[column])).join(" | ")} |`);
  }
}

function numbered(lines: string[], items: string[]) {
  items.forEach((item, index) => {
    lines.push(`${index + 1}. ${item}`);
  });
}

function printable(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\|/g, "\\|");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
