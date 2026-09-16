import { writeFile } from "node:fs/promises";
import { settleSelection } from "@/lib/racing/backtest";
import { loadLatestBacktestFeatureCacheForYear } from "@/lib/racing/backtest-cache";
import { rankRows, type RankedResearchRow } from "@/lib/racing/research-rule";

type Year = "2025" | "2026";
type Replication = "replicated" | "partially replicated" | "failed" | "too sparse";
type SpBand = "<3.0" | "3.0-5.99" | "6.0-9.99" | "10.0+";

type Context = {
  year: Year;
  cacheFrom: string;
  cacheTo: string;
  actualFrom: string;
  actualTo: string;
  rows: RankedResearchRow[];
};

type Metrics = {
  selections: number;
  settled: number;
  winners: number;
  strike: number | null;
  averageSp: number | null;
  medianSp: number | null;
  profitLoss: number;
  roi: number | null;
  expectedWins: number;
  ae: number | null;
  maxLosingRun: number;
};

type Population = {
  key: string;
  title: string;
  kind: "component" | "pairwise" | "rank1";
  componentKeys: string[];
  predicate: (row: RankedResearchRow) => boolean;
};

const OUTPUT_PATH = "/tmp/turf-two-factor-interactions.md";
const YEARS: Year[] = ["2025", "2026"];
const SAMPLE_FLOOR = 50;
const SP_BANDS: SpBand[] = ["<3.0", "3.0-5.99", "6.0-9.99", "10.0+"];

async function main() {
  const contexts = await Promise.all(YEARS.map(loadContext));
  const populations = populationDefinitions();
  const lines: string[] = [];
  writeReport(lines, contexts, populations);
  await writeFile(OUTPUT_PATH, `${lines.join("\n")}\n`, "utf8");

  console.log(`Wrote ${OUTPUT_PATH}`);
  for (const context of contexts) {
    const metrics = metricsFor(context.rows);
    console.log(`${context.year}: all Turf settled ${metrics.settled}, ROI ${pct(metrics.roi)}, A/E ${number(metrics.ae)}`);
  }
}

async function loadContext(year: Year): Promise<Context> {
  const cache = await loadLatestBacktestFeatureCacheForYear({ family: "turf_flat", year });
  if (!cache) throw new Error(`Missing compatible Turf cache for ${year}`);
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
  lines.push("# Turf Two-Factor Interaction Diagnostic");
  lines.push("");
  lines.push("Diagnostic only. TPR, Research, Today, saved/frozen rules, caches, importers, and holdout behavior were not changed.");
  lines.push("");
  lines.push("Scope: Flat Turf only; 2025 development and 2026 holdout kept separate. A/E is primary, ROI secondary, strike rate descriptive.");
  lines.push("");

  writeBaseline(lines, contexts);
  writeDefinitions(lines);
  writePopulationTable(lines, contexts, populations.filter((population) => population.kind === "pairwise"), "3. Pairwise Combinations");
  writePopulationTable(lines, contexts, populations.filter((population) => population.kind === "rank1"), "4. TPR-Rank-1 Variants");
  writeComponentComparisons(lines, contexts, populations);
  writeReplication(lines, contexts, populations);
  writeOutlierStress(lines, contexts, populations);
  writeConcentration(lines, contexts, populations);
  writeConclusion(lines, contexts, populations);
}

function writeBaseline(lines: string[], contexts: Context[]) {
  lines.push("## 1. Baseline");
  lines.push("");
  table(lines, contexts.map((context) => ({
    year: context.year,
    "cache window": `${context.cacheFrom} to ${context.cacheTo}`,
    "actual coverage": `${context.actualFrom} to ${context.actualTo}`,
    ...metricColumns(metricsFor(context.rows)),
  })));
  lines.push("");
}

function writeDefinitions(lines: string[]) {
  lines.push("## 2. Fixed Definitions");
  lines.push("");
  table(lines, [
    { component: "TPR strength", definition: "TPR_S2_V1 rating >=110" },
    { component: "Trainer strength", definition: "trainer prior strike rate >=15%" },
    { component: "Small field", definition: "field size <=5" },
    { component: "TPR rank 1 variant", definition: "TPR_S2_V1 rank = 1, no TPR lead filter" },
  ]);
  lines.push("");
}

function writePopulationTable(lines: string[], contexts: Context[], populations: Population[], title: string) {
  lines.push(`## ${title}`);
  for (const context of contexts) {
    lines.push("");
    lines.push(`### ${context.year}`);
    table(lines, populations.map((population) => ({
      combination: population.title,
      ...metricColumns(metricsFor(rowsFor(context, population))),
    })));
  }
  lines.push("");
}

function writeComponentComparisons(lines: string[], contexts: Context[], populations: Population[]) {
  lines.push("## 5. Component Comparisons");
  lines.push("");
  const components = populations.filter((population) => population.kind === "component");
  const combos = populations.filter((population) => population.kind !== "component");
  table(lines, contexts.flatMap((context) =>
    combos.flatMap((combo) => {
      const comboRows = rowsFor(context, combo);
      const comboMetrics = metricsFor(comboRows);
      return combo.componentKeys.map((componentKey) => {
        const component = components.find((item) => item.key === componentKey);
        if (!component) throw new Error(`Missing component ${componentKey}`);
        const componentRows = rowsFor(context, component);
        const componentMetrics = metricsFor(componentRows);
        return {
          year: context.year,
          combination: combo.title,
          component: component.title,
          "combo settled": comboMetrics.settled,
          "component settled": componentMetrics.settled,
          "sample retention": pct(componentMetrics.settled === 0 ? null : (comboMetrics.settled / componentMetrics.settled) * 100),
          "strike delta": pp(diff(comboMetrics.strike, componentMetrics.strike)),
          "ROI delta": pp(diff(comboMetrics.roi, componentMetrics.roi)),
          "A/E delta": number(diff(comboMetrics.ae, componentMetrics.ae)),
          "combo A/E": number(comboMetrics.ae),
          "component A/E": number(componentMetrics.ae),
        };
      });
    })
  ));
  lines.push("");
}

function writeReplication(lines: string[], contexts: Context[], populations: Population[]) {
  lines.push("## 6. 2025 Vs 2026 Replication");
  lines.push("");
  table(lines, populations.filter((population) => population.kind !== "component").map((population) => {
    const rows2025 = rowsFor(contextFor(contexts, "2025"), population);
    const rows2026 = rowsFor(contextFor(contexts, "2026"), population);
    const metrics2025 = metricsFor(rows2025);
    const metrics2026 = metricsFor(rows2026);
    return {
      combination: population.title,
      "2025 settled": metrics2025.settled,
      "2025 ROI": pct(metrics2025.roi),
      "2025 A/E": number(metrics2025.ae),
      "2026 settled": metrics2026.settled,
      "2026 ROI": pct(metrics2026.roi),
      "2026 A/E": number(metrics2026.ae),
      classification: replication(metrics2025, metrics2026),
    };
  }));
  lines.push("");
}

function writeOutlierStress(lines: string[], contexts: Context[], populations: Population[]) {
  lines.push("## 7. Outlier Stress");
  lines.push("");
  const candidates = stressCandidates(contexts, populations);
  if (candidates.length === 0) {
    lines.push("No combination had A/E >1.0 in both years or positive ROI in both years with adequate sample.");
    lines.push("");
    return;
  }
  table(lines, candidates.map((candidate) => {
    const original = metricsFor(candidate.rows);
    const stressedRows = removeBiggestPricedWinner(candidate.rows);
    const stressed = metricsFor(stressedRows);
    const concentration = winnerConcentration(candidate.rows);
    return {
      combination: candidate.population.title,
      year: candidate.context.year,
      settled: original.settled,
      "original ROI": pct(original.roi),
      "original A/E": number(original.ae),
      "ROI without biggest winner": pct(stressed.roi),
      "A/E without biggest winner": number(stressed.ae),
      "largest winner SP": number(concentration.largestSp),
      "largest winner P/L share": pct(concentration.largestShare),
      "top 3 winners P/L share": pct(concentration.top3Share),
    };
  }));
  lines.push("");
}

function writeConcentration(lines: string[], contexts: Context[], populations: Population[]) {
  lines.push("## 8. Concentration Checks");
  lines.push("");
  const favourable = favourablePopulations(contexts, populations);
  if (favourable.length === 0) {
    lines.push("No combination looked favourable in both years, so race-class and SP-band concentration checks were not run.");
    lines.push("");
    return;
  }
  for (const population of favourable) {
    lines.push(`### ${population.title}`);
    table(lines, contexts.flatMap((context) =>
      raceClassBuckets().map((bucket) => {
        const rows = rowsFor(context, population).filter((row) => raceClassBucket(row) === bucket);
        return { year: context.year, type: "race class", bucket, ...compactMetricColumns(metricsFor(rows)) };
      })
    ));
    lines.push("");
    table(lines, contexts.flatMap((context) =>
      SP_BANDS.map((bucket) => {
        const rows = rowsFor(context, population).filter((row) => spBand(row) === bucket);
        return { year: context.year, type: "SP band", bucket, ...compactMetricColumns(metricsFor(rows)) };
      })
    ));
    lines.push("");
  }
}

function writeConclusion(lines: string[], contexts: Context[], populations: Population[]) {
  lines.push("## 9. Conclusion");
  lines.push("");
  numbered(lines, [
    `Does any two-factor combination achieve A/E >1.0 in both years? ${aeBothConclusion(contexts, populations)}`,
    `Does any combination achieve positive ROI in both years? ${roiBothConclusion(contexts, populations)}`,
    `Which interaction, if any, improves A/E relative to both component features? ${componentImprovementConclusion(contexts, populations)}`,
    `Which results survive biggest-winner stress? ${stressConclusion(contexts, populations)}`,
    `Does adding TPR rank 1 materially improve or worsen the pairwise combinations? ${rankOneConclusion(contexts, populations)}`,
    `Is there one interaction worth a separately pre-specified confirmation test? ${confirmationConclusion(contexts, populations)}`,
    `If none replicate, should the Turf betting-system search stop with the current feature set? ${stopConclusion(contexts, populations)}`,
  ]);
}

function populationDefinitions(): Population[] {
  const tpr110: Population = {
    key: "tpr110",
    title: "TPR >=110",
    kind: "component",
    componentKeys: [],
    predicate: hasTpr110,
  };
  const trainer15: Population = {
    key: "trainer15",
    title: "Trainer SR >=15%",
    kind: "component",
    componentKeys: [],
    predicate: hasTrainer15,
  };
  const field5: Population = {
    key: "field5",
    title: "Field size <=5",
    kind: "component",
    componentKeys: [],
    predicate: hasField5,
  };
  return [
    tpr110,
    trainer15,
    field5,
    {
      key: "a",
      title: "A: TPR >=110 + field <=5",
      kind: "pairwise",
      componentKeys: ["tpr110", "field5"],
      predicate: (row) => hasTpr110(row) && hasField5(row),
    },
    {
      key: "b",
      title: "B: TPR >=110 + trainer SR >=15%",
      kind: "pairwise",
      componentKeys: ["tpr110", "trainer15"],
      predicate: (row) => hasTpr110(row) && hasTrainer15(row),
    },
    {
      key: "c",
      title: "C: field <=5 + trainer SR >=15%",
      kind: "pairwise",
      componentKeys: ["field5", "trainer15"],
      predicate: (row) => hasField5(row) && hasTrainer15(row),
    },
    {
      key: "a1",
      title: "A1: TPR rank 1 + TPR >=110 + field <=5",
      kind: "rank1",
      componentKeys: ["tpr110", "field5"],
      predicate: (row) => hasTprRank1(row) && hasTpr110(row) && hasField5(row),
    },
    {
      key: "b1",
      title: "B1: TPR rank 1 + TPR >=110 + trainer SR >=15%",
      kind: "rank1",
      componentKeys: ["tpr110", "trainer15"],
      predicate: (row) => hasTprRank1(row) && hasTpr110(row) && hasTrainer15(row),
    },
    {
      key: "c1",
      title: "C1: TPR rank 1 + field <=5 + trainer SR >=15%",
      kind: "rank1",
      componentKeys: ["field5", "trainer15"],
      predicate: (row) => hasTprRank1(row) && hasField5(row) && hasTrainer15(row),
    },
  ];
}

function rowsFor(context: Context, population: Population): RankedResearchRow[] {
  return context.rows.filter(population.predicate);
}

function hasTpr110(row: RankedResearchRow): boolean {
  return (row.turfPerformance?.rating ?? -Infinity) >= 110;
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

function metricsFor(rows: RankedResearchRow[]): Metrics {
  const settled = [...rows]
    .sort(compareRowsChronologically)
    .map((row) => ({ row, settlement: settleSelection(row.outcome) }))
    .filter((entry): entry is { row: RankedResearchRow; settlement: NonNullable<ReturnType<typeof settleSelection>> } =>
      entry.settlement !== null && entry.settlement.settlementOddsDecimal > 0
    );
  const winners = settled.filter((entry) => entry.row.outcome.won).length;
  const profitLoss = settled.reduce((total, entry) => total + entry.settlement.profitLoss, 0);
  const expectedWins = settled.reduce((total, entry) => total + (1 / entry.settlement.settlementOddsDecimal), 0);
  const sps = settled.map((entry) => entry.settlement.settlementOddsDecimal);
  return {
    selections: rows.length,
    settled: settled.length,
    winners,
    strike: settled.length === 0 ? null : (winners / settled.length) * 100,
    averageSp: average(sps),
    medianSp: median(sps),
    profitLoss,
    roi: settled.length === 0 ? null : (profitLoss / settled.length) * 100,
    expectedWins,
    ae: expectedWins === 0 ? null : winners / expectedWins,
    maxLosingRun: maxLosingRun(settled),
  };
}

function metricColumns(metrics: Metrics) {
  return {
    selections: metrics.selections,
    settled: metrics.settled,
    winners: metrics.winners,
    strike: pct(metrics.strike),
    "avg SP": number(metrics.averageSp),
    "median SP": number(metrics.medianSp),
    "P/L": money(metrics.profitLoss),
    ROI: pct(metrics.roi),
    "A/E": number(metrics.ae),
    "max losing run": metrics.maxLosingRun,
  };
}

function compactMetricColumns(metrics: Metrics) {
  return {
    settled: metrics.settled,
    winners: metrics.winners,
    strike: pct(metrics.strike),
    ROI: pct(metrics.roi),
    "A/E": number(metrics.ae),
  };
}

function replication(left: Metrics, right: Metrics): Replication {
  if (left.settled < SAMPLE_FLOOR || right.settled < SAMPLE_FLOOR) return "too sparse";
  const leftAe = left.ae ?? -Infinity;
  const rightAe = right.ae ?? -Infinity;
  const leftRoi = left.roi ?? -Infinity;
  const rightRoi = right.roi ?? -Infinity;
  if (leftAe > 1 && rightAe > 1 && leftRoi > 0 && rightRoi > 0) return "replicated";
  if (leftAe > 1 && rightAe > 1) return "partially replicated";
  return "failed";
}

function stressCandidates(contexts: Context[], populations: Population[]) {
  return populations
    .filter((population) => population.kind !== "component")
    .flatMap((population) => {
      const entries = contexts.map((context) => ({ context, population, rows: rowsFor(context, population) }));
      const adequate = entries.every((entry) => metricsFor(entry.rows).settled >= SAMPLE_FLOOR);
      const aeBoth = entries.every((entry) => (metricsFor(entry.rows).ae ?? -Infinity) > 1);
      const roiBoth = entries.every((entry) => (metricsFor(entry.rows).roi ?? -Infinity) > 0);
      return adequate && (aeBoth || roiBoth) ? entries : [];
    });
}

function favourablePopulations(contexts: Context[], populations: Population[]): Population[] {
  return populations
    .filter((population) => population.kind !== "component")
    .filter((population) =>
      contexts.every((context) => {
        const metrics = metricsFor(rowsFor(context, population));
        return metrics.settled >= SAMPLE_FLOOR && ((metrics.ae ?? -Infinity) > 1 || (metrics.roi ?? -Infinity) > 0);
      })
    );
}

function removeBiggestPricedWinner(rows: RankedResearchRow[]): RankedResearchRow[] {
  const winner = rows
    .filter((row) => row.outcome.won)
    .filter((row) => settleSelection(row.outcome) !== null)
    .sort((left, right) =>
      (settleSelection(right.outcome)?.settlementOddsDecimal ?? 0) -
        (settleSelection(left.outcome)?.settlementOddsDecimal ?? 0) ||
      compareRowsChronologically(left, right)
    )[0] ?? null;
  return winner ? rows.filter((row) => row.features.targetRunnerId !== winner.features.targetRunnerId) : rows;
}

function winnerConcentration(rows: RankedResearchRow[]) {
  const metrics = metricsFor(rows);
  const winners = rows
    .filter((row) => row.outcome.won)
    .map((row) => ({ row, settlement: settleSelection(row.outcome) }))
    .filter((entry): entry is { row: RankedResearchRow; settlement: NonNullable<ReturnType<typeof settleSelection>> } =>
      entry.settlement !== null
    )
    .sort((left, right) =>
      right.settlement.settlementOddsDecimal - left.settlement.settlementOddsDecimal ||
      compareRowsChronologically(left.row, right.row)
    );
  const largest = winners[0] ?? null;
  const top3Profit = winners.slice(0, 3).reduce((total, entry) => total + entry.settlement.profitLoss, 0);
  return {
    largestSp: largest?.settlement.settlementOddsDecimal ?? null,
    largestShare: metrics.profitLoss === 0 ? null : ((largest?.settlement.profitLoss ?? 0) / metrics.profitLoss) * 100,
    top3Share: metrics.profitLoss === 0 ? null : (top3Profit / metrics.profitLoss) * 100,
  };
}

function maxLosingRun(
  settled: Array<{ row: RankedResearchRow; settlement: NonNullable<ReturnType<typeof settleSelection>> }>,
): number {
  let current = 0;
  let max = 0;
  for (const entry of settled) {
    if (entry.row.outcome.won) {
      current = 0;
    } else {
      current += 1;
      max = Math.max(max, current);
    }
  }
  return max;
}

function aeBothConclusion(contexts: Context[], populations: Population[]): string {
  const matches = populations
    .filter((population) => population.kind !== "component")
    .filter((population) => contexts.every((context) => (metricsFor(rowsFor(context, population)).ae ?? -Infinity) > 1))
    .map((population) => population.title);
  return matches.length === 0 ? "No." : matches.join("; ");
}

function roiBothConclusion(contexts: Context[], populations: Population[]): string {
  const matches = populations
    .filter((population) => population.kind !== "component")
    .filter((population) => contexts.every((context) => (metricsFor(rowsFor(context, population)).roi ?? -Infinity) > 0))
    .map((population) => population.title);
  return matches.length === 0 ? "No." : matches.join("; ");
}

function componentImprovementConclusion(contexts: Context[], populations: Population[]): string {
  const components = populations.filter((population) => population.kind === "component");
  const matches = populations
    .filter((population) => population.kind !== "component")
    .filter((population) => contexts.every((context) => {
      const comboAe = metricsFor(rowsFor(context, population)).ae ?? -Infinity;
      return population.componentKeys.every((key) => {
        const component = components.find((item) => item.key === key);
        return component && comboAe > (metricsFor(rowsFor(context, component)).ae ?? -Infinity);
      });
    }))
    .map((population) => population.title);
  return matches.length === 0 ? "None improved A/E versus both components in both years." : matches.join("; ");
}

function stressConclusion(contexts: Context[], populations: Population[]): string {
  const candidates = stressCandidates(contexts, populations);
  if (candidates.length === 0) return "None qualified for stress testing.";
  const survivors = candidates.filter((candidate) => (metricsFor(removeBiggestPricedWinner(candidate.rows)).roi ?? -Infinity) > 0);
  return `${survivors.length}/${candidates.length} year-combination stress rows retained positive ROI.`;
}

function rankOneConclusion(contexts: Context[], populations: Population[]): string {
  const pairs = [["a", "a1"], ["b", "b1"], ["c", "c1"]] as const;
  return pairs.map(([baseKey, rankKey]) => {
    const base = populationByKey(populations, baseKey);
    const rank = populationByKey(populations, rankKey);
    const parts = contexts.map((context) => {
      const baseMetrics = metricsFor(rowsFor(context, base));
      const rankMetrics = metricsFor(rowsFor(context, rank));
      return `${context.year} A/E ${number(baseMetrics.ae)} -> ${number(rankMetrics.ae)}, ROI ${pct(baseMetrics.roi)} -> ${pct(rankMetrics.roi)}`;
    });
    return `${rank.title}: ${parts.join(" / ")}`;
  }).join("; ");
}

function confirmationConclusion(contexts: Context[], populations: Population[]): string {
  const replicated = populations
    .filter((population) => population.kind !== "component")
    .filter((population) => {
      const left = metricsFor(rowsFor(contextFor(contexts, "2025"), population));
      const right = metricsFor(rowsFor(contextFor(contexts, "2026"), population));
      return replication(left, right) === "replicated";
    });
  return replicated.length === 0
    ? "No. None clears repeat A/E >1.0 plus positive ROI in both years."
    : replicated.map((population) => population.title).join("; ");
}

function stopConclusion(contexts: Context[], populations: Population[]): string {
  return confirmationConclusion(contexts, populations).startsWith("No.")
    ? "Yes for this current feature set; further work should require a new pre-specified diagnostic idea, not threshold tweaking."
    : "No, but any next step should remain a pre-specified confirmation test rather than production exposure.";
}

function populationByKey(populations: Population[], key: string): Population {
  const population = populations.find((item) => item.key === key);
  if (!population) throw new Error(`Missing population ${key}`);
  return population;
}

function contextFor(contexts: Context[], year: Year): Context {
  const context = contexts.find((item) => item.year === year);
  if (!context) throw new Error(`Missing context ${year}`);
  return context;
}

function raceClassBuckets(): string[] {
  return ["Class 1", "Class 2", "Class 3", "Class 4", "Class 5", "Class 6", "unknown"];
}

function raceClassBucket(row: RankedResearchRow): string {
  const value = row.features.raceClass;
  if (value === "1" || value === "2" || value === "3" || value === "4" || value === "5" || value === "6") {
    return `Class ${value}`;
  }
  if (value?.startsWith("Class ")) return value;
  return "unknown";
}

function spBand(row: RankedResearchRow): SpBand | null {
  const sp = settleSelection(row.outcome)?.settlementOddsDecimal ?? null;
  if (sp === null || sp <= 0) return null;
  if (sp < 3) return "<3.0";
  if (sp < 6) return "3.0-5.99";
  if (sp < 10) return "6.0-9.99";
  return "10.0+";
}

function compareRowsChronologically(left: RankedResearchRow, right: RankedResearchRow): number {
  return left.features.raceDateTime.getTime() - right.features.raceDateTime.getTime() ||
    left.features.targetRaceId.localeCompare(right.features.targetRaceId) ||
    left.features.targetRunnerId.localeCompare(right.features.targetRunnerId);
}

function diff(left: number | null, right: number | null): number | null {
  return left === null || right === null ? null : left - right;
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
