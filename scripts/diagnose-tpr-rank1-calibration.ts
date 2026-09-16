import { writeFile } from "node:fs/promises";
import { settleSelection, type BacktestSettlement } from "@/lib/racing/backtest";
import { loadLatestBacktestFeatureCacheForYear } from "@/lib/racing/backtest-cache";
import { rankRows, type RankedResearchRow } from "@/lib/racing/research-rule";
import { TURF_PERFORMANCE_RATING_VERSION } from "@/lib/racing/turf-performance-rating";

type Year = "2025" | "2026";

type Context = {
  year: Year;
  cacheFrom: string;
  cacheTo: string;
  actualFrom: string;
  actualTo: string;
  entries: SettledEntry[];
};

type SettledEntry = {
  row: RankedResearchRow;
  settlement: BacktestSettlement;
};

type Bucket = {
  key: string;
  label: string;
  order: number;
  predicate: (entry: SettledEntry) => boolean;
};

type Family = {
  key: string;
  title: string;
  buckets: Bucket[];
  ordered: boolean;
};

type Metrics = {
  selections: number;
  winners: number;
  strike: number | null;
  fairDecimal: number | null;
  averageSp: number | null;
  ae: number | null;
  roi: number | null;
};

type CalibrationRow = {
  family: Family;
  bucket: Bucket;
  metrics2025: Metrics;
  metrics2026: Metrics;
  predictedProbability: number | null;
  observed2026: number | null;
  error: number | null;
  ratio: number | null;
  label: string;
};

const OUTPUT_PATH = "/tmp/tpr-rank1-calibration.md";
const YEARS: Year[] = ["2025", "2026"];
const MIN_ADEQUATE = 100;
const MIN_LIMITED = 30;

async function main() {
  const contexts = await Promise.all(YEARS.map(loadContext));
  const families = featureFamilies();
  const matrixFamily = scoreFieldMatrix();
  const optionalTrainerMatrix = scoreTrainerMatrix();
  const optionalTrainerMatrixRows = matrixIsAdequate(contexts, optionalTrainerMatrix)
    ? calibrationRows(contexts, optionalTrainerMatrix)
    : null;
  const lines: string[] = [];

  writeReport(lines, contexts, families, matrixFamily, optionalTrainerMatrix, optionalTrainerMatrixRows);
  await writeFile(OUTPUT_PATH, `${lines.join("\n")}\n`, "utf8");

  console.log(`Wrote ${OUTPUT_PATH}`);
  for (const context of contexts) {
    const metrics = metricsFor(context.entries);
    console.log(
      `${context.year}: TPR rank 1 settled ${metrics.selections}, winners ${metrics.winners}, ` +
        `strike ${pct(probabilityPct(metrics.strike))}, fair ${number(metrics.fairDecimal)}, ROI ${pct(metrics.roi)}`,
    );
  }
}

async function loadContext(year: Year): Promise<Context> {
  const cache = await loadLatestBacktestFeatureCacheForYear({ family: "turf_flat", year }) ??
    await loadLatestBacktestFeatureCacheForYear({ family: "all", year });
  if (!cache) {
    throw new Error(`Missing compatible v4 Turf cache for ${year}.`);
  }
  const rankedRows = rankRows(cache.rows.filter((row) => row.features.raceCode === "turf"));
  const entries = settledEntries(rankedRows).filter((entry) =>
    entry.row.turfPerformance?.version === TURF_PERFORMANCE_RATING_VERSION &&
    entry.row.turfPerformance.rank === 1
  );
  return {
    year,
    cacheFrom: cache.manifest.from,
    cacheTo: cache.manifest.to,
    actualFrom: cache.actualCoverage?.actualFrom ?? cache.manifest.from,
    actualTo: cache.actualCoverage?.actualTo ?? cache.manifest.to,
    entries,
  };
}

function writeReport(
  lines: string[],
  contexts: Context[],
  families: Family[],
  matrixFamily: Family,
  optionalTrainerMatrix: Family,
  optionalTrainerMatrixRows: CalibrationRow[] | null,
) {
  lines.push("# TPR Rank-1 Probability Calibration Diagnostic");
  lines.push("");
  lines.push("Diagnostic only. No production Research behavior, Today behavior, cache logic, importers, schema, filters, or TPR formula were changed.");
  lines.push("");
  lines.push("Population: Flat Turf, `TPR_S2_V1`, TPR rank 1, settled runners only. Final SP is not used as a model input; it appears only for descriptive comparison.");
  lines.push("");

  writeCoverage(lines, contexts);
  writeOverallCalibration(lines, contexts);
  for (const family of families) {
    writeFamilySection(lines, contexts, family);
  }
  writeFrozenCalibration(lines, contexts, families);
  writeMatrixSection(lines, contexts, matrixFamily, "TPR-Score × Field-Size Matrix");
  writeOptionalTrainerMatrix(lines, contexts, optionalTrainerMatrix, optionalTrainerMatrixRows);
  writeMarketComparison(lines, contexts, [...families, matrixFamily], optionalTrainerMatrixRows ? optionalTrainerMatrix : null);
  writeConclusion(lines, contexts, families, matrixFamily, optionalTrainerMatrixRows);
}

function writeCoverage(lines: string[], contexts: Context[]) {
  lines.push("## Coverage");
  lines.push("");
  table(lines, contexts.map((context) => ({
    year: yearLabel(context),
    "cache window": `${context.cacheFrom} to ${context.cacheTo}`,
    "actual coverage": `${context.actualFrom} to ${context.actualTo}`,
    "settled TPR rank-1 selections": context.entries.length,
    winners: metricsFor(context.entries).winners,
  })));
  lines.push("");
}

function writeOverallCalibration(lines: string[], contexts: Context[]) {
  lines.push("## Overall Rank-1 Calibration");
  lines.push("");
  table(lines, contexts.map((context) => {
    const metrics = metricsFor(context.entries);
    return {
      year: yearLabel(context),
      selections: metrics.selections,
      winners: metrics.winners,
      strike: pct(probabilityPct(metrics.strike)),
      "fair decimal": number(metrics.fairDecimal),
      "fair fractional approx": fractionalApprox(metrics.fairDecimal),
      "avg SP": number(metrics.averageSp),
      "A/E": number(metrics.ae),
      ROI: pct(metrics.roi),
      sample: sampleLabel(metrics.selections),
    };
  }));
  lines.push("");
}

function writeFamilySection(lines: string[], contexts: Context[], family: Family) {
  lines.push(`## ${family.title}`);
  lines.push("");
  table(lines, contexts.flatMap((context) =>
    family.buckets.map((bucket) => {
      const metrics = metricsFor(context.entries.filter(bucket.predicate));
      return {
        year: yearLabel(context),
        bucket: bucket.label,
        selections: metrics.selections,
        winners: metrics.winners,
        strike: pct(probabilityPct(metrics.strike)),
        "fair decimal": number(metrics.fairDecimal),
        "avg SP": number(metrics.averageSp),
        "A/E": number(metrics.ae),
        ROI: pct(metrics.roi),
        sample: sampleLabel(metrics.selections),
      };
    })
  ));
  lines.push("");
  if (family.ordered) {
    table(lines, contexts.map((context) => ({
      year: yearLabel(context),
      family: family.title,
      monotonicity: monotonicityLabel(family, context),
    })));
    lines.push("");
  }
}

function writeFrozenCalibration(lines: string[], contexts: Context[], families: Family[]) {
  lines.push("## Frozen 2025 Calibration Vs 2026");
  lines.push("");
  lines.push("Each bucket's 2025 observed win rate is treated as the frozen predicted probability, then compared with the 2026 observed win rate.");
  lines.push("");
  table(lines, families.flatMap((family) =>
    calibrationRows(contexts, family).map((row) => ({
      family: family.title,
      bucket: row.bucket.label,
      "2025 selections": row.metrics2025.selections,
      "2025 predicted prob": pct(probabilityPct(row.predictedProbability)),
      "2025 fair decimal": number(row.metrics2025.fairDecimal),
      "2026 selections": row.metrics2026.selections,
      "2026 observed prob": pct(probabilityPct(row.observed2026)),
      "error obs-pred": pp(probabilityPct(row.error)),
      "calibration ratio": number(row.ratio),
      assessment: row.label,
    }))
  ));
  lines.push("");
  table(lines, families.map((family) => ({
    family: family.title,
    "2025 monotonicity": monotonicityLabel(family, contextFor(contexts, "2025")),
    "2026 monotonicity": monotonicityLabel(family, contextFor(contexts, "2026")),
    "family calibration": familyCalibrationLabel(calibrationRows(contexts, family)),
  })));
  lines.push("");
}

function writeMatrixSection(lines: string[], contexts: Context[], family: Family, title: string) {
  lines.push(`## ${title}`);
  lines.push("");
  writeFamilySection(lines, contexts, family);
  lines.push("### Frozen 2025 Matrix Probabilities Vs 2026");
  table(lines, calibrationRows(contexts, family).map((row) => ({
    cell: row.bucket.label,
    "2025 selections": row.metrics2025.selections,
    "2025 predicted prob": pct(probabilityPct(row.predictedProbability)),
    "2025 fair decimal": number(row.metrics2025.fairDecimal),
    "2026 selections": row.metrics2026.selections,
    "2026 observed prob": pct(probabilityPct(row.observed2026)),
    "error obs-pred": pp(probabilityPct(row.error)),
    "calibration ratio": number(row.ratio),
    assessment: row.label,
  })));
  lines.push("");
}

function writeOptionalTrainerMatrix(
  lines: string[],
  contexts: Context[],
  family: Family,
  rows: CalibrationRow[] | null,
) {
  lines.push("## Optional TPR-Score × Trainer-Strength Matrix");
  lines.push("");
  if (!rows) {
    lines.push("Omitted: at least one four-cell matrix bucket was too sparse under the settled rank-1 population.");
    lines.push("");
    return;
  }
  writeFamilySection(lines, contexts, family);
  lines.push("### Frozen 2025 Matrix Probabilities Vs 2026");
  table(lines, rows.map((row) => ({
    cell: row.bucket.label,
    "2025 selections": row.metrics2025.selections,
    "2025 predicted prob": pct(probabilityPct(row.predictedProbability)),
    "2025 fair decimal": number(row.metrics2025.fairDecimal),
    "2026 selections": row.metrics2026.selections,
    "2026 observed prob": pct(probabilityPct(row.observed2026)),
    "error obs-pred": pp(probabilityPct(row.error)),
    "calibration ratio": number(row.ratio),
    assessment: row.label,
  })));
  lines.push("");
}

function writeMarketComparison(
  lines: string[],
  contexts: Context[],
  families: Family[],
  optionalFamily: Family | null,
) {
  lines.push("## Market Comparison");
  lines.push("");
  lines.push("Model fair odds are from 2025 bucket win rates only. Average final SP and A/E are descriptive holdout comparisons, not model inputs.");
  lines.push("");
  const allFamilies = optionalFamily ? [...families, optionalFamily] : families;
  table(lines, allFamilies.flatMap((family) =>
    calibrationRows(contexts, family).map((row) => ({
      family: family.title,
      bucket: row.bucket.label,
      "2025 model fair decimal": number(row.metrics2025.fairDecimal),
      "2026 avg final SP": number(row.metrics2026.averageSp),
      "2026 observed A/E": number(row.metrics2026.ae),
      "2026 ROI": pct(row.metrics2026.roi),
      "market note": marketNote(row),
    }))
  ));
  lines.push("");
}

function writeConclusion(
  lines: string[],
  contexts: Context[],
  families: Family[],
  matrixFamily: Family,
  optionalTrainerRows: CalibrationRow[] | null,
) {
  lines.push("## Conclusion");
  lines.push("");
  const overall2025 = metricsFor(contextFor(contexts, "2025").entries);
  const overall2026 = metricsFor(contextFor(contexts, "2026").entries);
  const familyLabels = new Map(families.map((family) => [
    family.key,
    familyCalibrationLabel(calibrationRows(contexts, family)),
  ]));
  const monoBoth = families
    .filter((family) =>
      monotonicityLabel(family, contextFor(contexts, "2025")).startsWith("monotonic") &&
      monotonicityLabel(family, contextFor(contexts, "2026")).startsWith("monotonic")
    )
    .map((family) => family.title);
  const matrixLabel = familyCalibrationLabel(calibrationRows(contexts, matrixFamily));
  const optionalTrainerLabel = optionalTrainerRows ? familyCalibrationLabel(optionalTrainerRows) : "not tested";

  numbered(lines, [
    `TPR rank 1 itself is ${overallCalibrationLabel(overall2025, overall2026)} from 2025 to 2026: ${pct(probabilityPct(overall2025.strike))} / fair ${number(overall2025.fairDecimal)} in 2025 versus ${pct(probabilityPct(overall2026.strike))} / fair ${number(overall2026.fairDecimal)} in 2026.`,
    `Absolute TPR score bands: ${familyLabels.get("score")}; 2025 relationship ${monotonicityLabel(families[0]!, contextFor(contexts, "2025"))}, 2026 relationship ${monotonicityLabel(families[0]!, contextFor(contexts, "2026"))}.`,
    `TPR lead bands: ${familyLabels.get("lead")}; 2025 relationship ${monotonicityLabel(families[1]!, contextFor(contexts, "2025"))}, 2026 relationship ${monotonicityLabel(families[1]!, contextFor(contexts, "2026"))}.`,
    `Field-size bands: ${familyLabels.get("field_size")}; 2025 relationship ${monotonicityLabel(families[2]!, contextFor(contexts, "2025"))}, 2026 relationship ${monotonicityLabel(families[2]!, contextFor(contexts, "2026"))}.`,
    `Trainer prior strike-rate bands: ${familyLabels.get("trainer_sr")}; 2025 relationship ${monotonicityLabel(families[3]!, contextFor(contexts, "2025"))}, 2026 relationship ${monotonicityLabel(families[3]!, contextFor(contexts, "2026"))}.`,
    `Relationships monotonic in both years: ${monoBoth.length === 0 ? "none" : monoBoth.join("; ")}.`,
    `TPR-score x field-size matrix: ${matrixLabel}; use this as calibration evidence only if the cell errors are acceptable in the table above.`,
    `TPR-score x trainer-strength matrix: ${optionalTrainerLabel}.`,
    `A coarse fair price for all TPR rank-1 horses is ${overall2025.fairDecimal ? `approximately ${number(overall2025.fairDecimal)} decimal from 2025` : "not available"}, but bucket-level fair prices should be treated cautiously where 2026 errors are unstable.`,
    `Simplest defensible first fair-price structure: ${simplestStructure(families, matrixFamily, optionalTrainerRows, contexts)}.`,
    "If this is not accepted as stable enough, TPR should remain a ranking tool rather than a standalone probability model.",
  ]);
}

function featureFamilies(): Family[] {
  return [
    {
      key: "score",
      title: "TPR Score Bands",
      ordered: true,
      buckets: [
        { key: "lt_100", label: "<100", order: 0, predicate: (entry) => tpr(entry) < 100 },
        { key: "100_109", label: "100-109.9", order: 1, predicate: (entry) => tpr(entry) >= 100 && tpr(entry) < 110 },
        { key: "110_119", label: "110-119.9", order: 2, predicate: (entry) => tpr(entry) >= 110 && tpr(entry) < 120 },
        { key: "gte_120", label: "120+", order: 3, predicate: (entry) => tpr(entry) >= 120 },
      ],
    },
    {
      key: "lead",
      title: "TPR Lead Bands",
      ordered: true,
      buckets: [
        { key: "lt_2", label: "<2", order: 0, predicate: (entry) => lead(entry) !== null && lead(entry)! < 2 },
        { key: "2_599", label: "2-5.99", order: 1, predicate: (entry) => lead(entry) !== null && lead(entry)! >= 2 && lead(entry)! < 6 },
        { key: "6_999", label: "6-9.99", order: 2, predicate: (entry) => lead(entry) !== null && lead(entry)! >= 6 && lead(entry)! < 10 },
        { key: "gte_10", label: "10+", order: 3, predicate: (entry) => lead(entry) !== null && lead(entry)! >= 10 },
      ],
    },
    {
      key: "field_size",
      title: "Field-Size Bands",
      ordered: true,
      buckets: [
        { key: "2_5", label: "2-5", order: 0, predicate: (entry) => fieldSize(entry) !== null && fieldSize(entry)! >= 2 && fieldSize(entry)! <= 5 },
        { key: "6_8", label: "6-8", order: 1, predicate: (entry) => fieldSize(entry) !== null && fieldSize(entry)! >= 6 && fieldSize(entry)! <= 8 },
        { key: "9_12", label: "9-12", order: 2, predicate: (entry) => fieldSize(entry) !== null && fieldSize(entry)! >= 9 && fieldSize(entry)! <= 12 },
        { key: "gte_13", label: "13+", order: 3, predicate: (entry) => fieldSize(entry) !== null && fieldSize(entry)! >= 13 },
      ],
    },
    {
      key: "trainer_sr",
      title: "Trainer-Strength Bands",
      ordered: true,
      buckets: [
        { key: "lt_5", label: "<5%", order: 0, predicate: (entry) => trainerSr(entry) !== null && trainerSr(entry)! < 5 },
        { key: "5_99", label: "5-9.9%", order: 1, predicate: (entry) => trainerSr(entry) !== null && trainerSr(entry)! >= 5 && trainerSr(entry)! < 10 },
        { key: "10_149", label: "10-14.9%", order: 2, predicate: (entry) => trainerSr(entry) !== null && trainerSr(entry)! >= 10 && trainerSr(entry)! < 15 },
        { key: "15_199", label: "15-19.9%", order: 3, predicate: (entry) => trainerSr(entry) !== null && trainerSr(entry)! >= 15 && trainerSr(entry)! < 20 },
        { key: "gte_20", label: "20%+", order: 4, predicate: (entry) => trainerSr(entry) !== null && trainerSr(entry)! >= 20 },
        { key: "missing", label: "missing/insufficient", order: 5, predicate: (entry) => trainerSr(entry) === null },
      ],
    },
  ];
}

function scoreFieldMatrix(): Family {
  return {
    key: "score_field_matrix",
    title: "TPR Score x Field Size",
    ordered: false,
    buckets: [
      { key: "lt_110_field_5", label: "TPR <110 x field <=5", order: 0, predicate: (entry) => tpr(entry) < 110 && fieldSize(entry) !== null && fieldSize(entry)! <= 5 },
      { key: "lt_110_field_6", label: "TPR <110 x field 6+", order: 1, predicate: (entry) => tpr(entry) < 110 && fieldSize(entry) !== null && fieldSize(entry)! >= 6 },
      { key: "gte_110_field_5", label: "TPR 110+ x field <=5", order: 2, predicate: (entry) => tpr(entry) >= 110 && fieldSize(entry) !== null && fieldSize(entry)! <= 5 },
      { key: "gte_110_field_6", label: "TPR 110+ x field 6+", order: 3, predicate: (entry) => tpr(entry) >= 110 && fieldSize(entry) !== null && fieldSize(entry)! >= 6 },
    ],
  };
}

function scoreTrainerMatrix(): Family {
  return {
    key: "score_trainer_matrix",
    title: "TPR Score x Trainer Strength",
    ordered: false,
    buckets: [
      { key: "lt_110_trainer_lt_15", label: "TPR <110 x trainer <15%", order: 0, predicate: (entry) => tpr(entry) < 110 && trainerSr(entry) !== null && trainerSr(entry)! < 15 },
      { key: "lt_110_trainer_gte_15", label: "TPR <110 x trainer >=15%", order: 1, predicate: (entry) => tpr(entry) < 110 && trainerSr(entry) !== null && trainerSr(entry)! >= 15 },
      { key: "gte_110_trainer_lt_15", label: "TPR 110+ x trainer <15%", order: 2, predicate: (entry) => tpr(entry) >= 110 && trainerSr(entry) !== null && trainerSr(entry)! < 15 },
      { key: "gte_110_trainer_gte_15", label: "TPR 110+ x trainer >=15%", order: 3, predicate: (entry) => tpr(entry) >= 110 && trainerSr(entry) !== null && trainerSr(entry)! >= 15 },
    ],
  };
}

function settledEntries(rows: RankedResearchRow[]): SettledEntry[] {
  return rows
    .map((row) => {
      const settlement = settleSelection(row.outcome);
      return settlement ? { row, settlement } : null;
    })
    .filter((entry): entry is SettledEntry => entry !== null);
}

function metricsFor(entries: SettledEntry[]): Metrics {
  const winners = entries.filter((entry) => entry.row.outcome.won).length;
  const expectedWins = entries.reduce((total, entry) => total + (1 / entry.settlement.settlementOddsDecimal), 0);
  const profitLoss = entries.reduce((total, entry) => total + entry.settlement.profitLoss, 0);
  const strike = entries.length === 0 ? null : winners / entries.length;
  return {
    selections: entries.length,
    winners,
    strike,
    fairDecimal: strike && strike > 0 ? 1 / strike : null,
    averageSp: average(entries.map((entry) => entry.settlement.settlementOddsDecimal)),
    ae: expectedWins === 0 ? null : winners / expectedWins,
    roi: entries.length === 0 ? null : (profitLoss / entries.length) * 100,
  };
}

function calibrationRows(contexts: Context[], family: Family): CalibrationRow[] {
  const context2025 = contextFor(contexts, "2025");
  const context2026 = contextFor(contexts, "2026");
  return family.buckets.map((bucket) => {
    const metrics2025 = metricsFor(context2025.entries.filter(bucket.predicate));
    const metrics2026 = metricsFor(context2026.entries.filter(bucket.predicate));
    const predictedProbability = metrics2025.strike;
    const observed2026 = metrics2026.strike;
    const error = diff(observed2026, predictedProbability);
    const ratio = predictedProbability && observed2026 !== null ? observed2026 / predictedProbability : null;
    return {
      family,
      bucket,
      metrics2025,
      metrics2026,
      predictedProbability,
      observed2026,
      error,
      ratio,
      label: calibrationLabel(metrics2025, metrics2026, error),
    };
  });
}

function matrixIsAdequate(contexts: Context[], family: Family): boolean {
  return calibrationRows(contexts, family).every((row) =>
    row.metrics2025.selections >= MIN_LIMITED && row.metrics2026.selections >= MIN_LIMITED
  );
}

function calibrationLabel(metrics2025: Metrics, metrics2026: Metrics, error: number | null): string {
  if (metrics2025.selections < MIN_LIMITED || metrics2026.selections < MIN_LIMITED) return "too sparse";
  if (metrics2025.selections < MIN_ADEQUATE || metrics2026.selections < MIN_ADEQUATE) return "unstable / limited";
  if (error === null) return "too sparse";
  const errorPp = error * 100;
  if (Math.abs(errorPp) <= 2) return "well calibrated";
  if (Math.abs(errorPp) <= 5) return errorPp > 0 ? "mildly underestimated" : "mildly overestimated";
  return "unstable";
}

function familyCalibrationLabel(rows: CalibrationRow[]): string {
  const usable = rows.filter((row) => row.label !== "too sparse");
  if (usable.length < Math.max(2, rows.length / 2)) return "too sparse";
  const unstable = usable.filter((row) => row.label.includes("unstable")).length;
  const well = usable.filter((row) => row.label === "well calibrated").length;
  const over = usable.filter((row) => row.label === "mildly overestimated").length;
  const under = usable.filter((row) => row.label === "mildly underestimated").length;
  if (unstable > 0) return "unstable";
  if (well >= usable.length - 1) return "well calibrated";
  if (over > under) return "mildly overestimated";
  if (under > over) return "mildly underestimated";
  return "mixed but usable";
}

function overallCalibrationLabel(metrics2025: Metrics, metrics2026: Metrics): string {
  const error = diff(metrics2026.strike, metrics2025.strike);
  const label = calibrationLabel(metrics2025, metrics2026, error);
  return label === "well calibrated" ? "reasonably stable" : label;
}

function monotonicityLabel(family: Family, context: Context): string {
  if (!family.ordered) return "not ordered";
  const values = family.buckets
    .filter((bucket) => bucket.key !== "missing")
    .map((bucket) => metricsFor(context.entries.filter(bucket.predicate)))
    .filter((metrics) => metrics.selections >= MIN_LIMITED && metrics.strike !== null)
    .map((metrics) => metrics.strike!);
  if (values.length < 3) return "too sparse";
  const nonDecreasing = values.every((value, index) => index === 0 || value >= values[index - 1]!);
  const nonIncreasing = values.every((value, index) => index === 0 || value <= values[index - 1]!);
  if (nonDecreasing) return "monotonic increasing";
  if (nonIncreasing) return "monotonic decreasing";
  return "not monotonic";
}

function marketNote(row: CalibrationRow): string {
  if (row.metrics2025.fairDecimal === null || row.metrics2026.averageSp === null) return "n/a";
  if (row.metrics2026.averageSp > row.metrics2025.fairDecimal && (row.metrics2026.ae ?? 0) >= 1) {
    return "2026 market looked generous vs 2025 fair";
  }
  if (row.metrics2026.averageSp < row.metrics2025.fairDecimal && (row.metrics2026.ae ?? 0) < 1) {
    return "2026 market shorter than 2025 fair and underperformed";
  }
  return "mixed descriptive comparison";
}

function simplestStructure(
  families: Family[],
  matrixFamily: Family,
  optionalTrainerRows: CalibrationRow[] | null,
  contexts: Context[],
): string {
  const ranked = [
    ...families.map((family) => ({ title: family.title, label: familyCalibrationLabel(calibrationRows(contexts, family)) })),
    { title: matrixFamily.title, label: familyCalibrationLabel(calibrationRows(contexts, matrixFamily)) },
    ...(optionalTrainerRows ? [{ title: "TPR Score x Trainer Strength", label: familyCalibrationLabel(optionalTrainerRows) }] : []),
  ];
  const usable = ranked.filter((item) => item.label === "well calibrated" || item.label === "mixed but usable" || item.label.startsWith("mildly"));
  if (usable.length === 0) {
    return "use one global TPR-rank-1 probability only, or keep TPR as a ranking tool until more holdout data accrues";
  }
  const best = usable[0]!;
  return `${best.title} is the simplest candidate, with a global TPR-rank-1 fallback for sparse buckets`;
}

function tpr(entry: SettledEntry): number {
  return entry.row.turfPerformance?.rating ?? Number.NaN;
}

function lead(entry: SettledEntry): number | null {
  return entry.row.turfPerformance?.gap ?? null;
}

function fieldSize(entry: SettledEntry): number | null {
  return entry.row.features.actualRunnerCount ?? entry.row.features.declaredRunnerCount;
}

function trainerSr(entry: SettledEntry): number | null {
  const value = entry.row.features.trainerPriorWinRate;
  return value === null || !Number.isFinite(value) ? null : value;
}

function contextFor(contexts: Context[], year: Year): Context {
  const context = contexts.find((item) => item.year === year);
  if (!context) throw new Error(`Missing context ${year}`);
  return context;
}

function yearLabel(context: Context): string {
  return context.year === "2026" ? `2026 YTD (${context.actualFrom} to ${context.actualTo})` : context.year;
}

function sampleLabel(selections: number): string {
  if (selections >= MIN_ADEQUATE) return "adequate";
  if (selections >= MIN_LIMITED) return "limited";
  return "sparse";
}

function probabilityPct(value: number | null): number | null {
  return value === null ? null : value * 100;
}

function diff(left: number | null, right: number | null): number | null {
  return left === null || right === null ? null : left - right;
}

function average(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((total, value) => total + value, 0) / values.length;
}

function pct(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "n/a" : `${value.toFixed(1)}%`;
}

function pp(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "n/a" : `${value >= 0 ? "+" : ""}${value.toFixed(1)}pp`;
}

function number(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "n/a" : value.toFixed(2);
}

function fractionalApprox(decimal: number | null): string {
  if (decimal === null || !Number.isFinite(decimal) || decimal <= 1) return "n/a";
  const fractional = decimal - 1;
  const denominators = [1, 2, 3, 4, 5, 8, 10, 16, 20];
  const best = denominators
    .map((denominator) => ({
      denominator,
      numerator: Math.max(1, Math.round(fractional * denominator)),
    }))
    .sort((left, right) =>
      Math.abs((left.numerator / left.denominator) - fractional) -
      Math.abs((right.numerator / right.denominator) - fractional)
    )[0]!;
  return `${best.numerator}/${best.denominator}`;
}

function printable(value: unknown): string {
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2);
  return String(value).replaceAll("|", "\\|");
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

function numbered(lines: string[], values: string[]) {
  for (const [index, value] of values.entries()) {
    lines.push(`${index + 1}. ${value}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
