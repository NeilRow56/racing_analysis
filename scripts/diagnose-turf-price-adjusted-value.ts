import { writeFile } from "node:fs/promises";
import { settleSelection, type BacktestSettlement } from "@/lib/racing/backtest";
import { loadLatestBacktestFeatureCacheForYear } from "@/lib/racing/backtest-cache";
import { rankRows, type RankedResearchRow } from "@/lib/racing/research-rule";

type Year = "2025" | "2026";

type Context = {
  year: Year;
  cacheFrom: string;
  cacheTo: string;
  actualFrom: string;
  actualTo: string;
  rows: RankedResearchRow[];
};

type SpBand = {
  key: string;
  label: string;
  minInclusive: number | null;
  maxExclusive: number | null;
};

type Signal = {
  key: string;
  title: string;
  predicate: (row: RankedResearchRow) => boolean;
};

type SettledEntry = {
  row: RankedResearchRow;
  settlement: BacktestSettlement;
  band: SpBand;
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
};

type BandComparison = {
  year: Year;
  signal: Signal;
  band: SpBand;
  baseline: Metrics;
  signalMetrics: Metrics;
  roiUplift: number | null;
  aeUplift: number | null;
  strikeUplift: number | null;
};

type WeightedComparison = {
  year: Year;
  signal: Signal;
  metrics: Metrics;
  expectedRoi: number | null;
  roiUplift: number | null;
  weightedBaselineAe: number | null;
  aeUplift: number | null;
};

type StressCheck = {
  signal: Signal;
  band: SpBand;
  reason: string;
};

const OUTPUT_PATH = "/tmp/turf-price-adjusted-value.md";
const YEARS: Year[] = ["2025", "2026"];
const MIN_ADEQUATE = 100;
const MIN_LIMITED = 30;
const LARGE_ROI_UPLIFT_PP = 10;

const SP_BANDS: SpBand[] = [
  { key: "lt_2", label: "odds-on (<1/1, decimal <2.0)", minInclusive: null, maxExclusive: 2 },
  { key: "2_to_lt_3", label: "1/1 to <2/1 (2.0 to <3.0)", minInclusive: 2, maxExclusive: 3 },
  { key: "3_to_lt_5", label: "2/1 to <4/1 (3.0 to <5.0)", minInclusive: 3, maxExclusive: 5 },
  { key: "5_to_lt_9", label: "4/1 to <8/1 (5.0 to <9.0)", minInclusive: 5, maxExclusive: 9 },
  { key: "9_to_lt_13", label: "8/1 to <12/1 (9.0 to <13.0)", minInclusive: 9, maxExclusive: 13 },
  { key: "13_to_lt_21", label: "12/1 to <20/1 (13.0 to <21.0)", minInclusive: 13, maxExclusive: 21 },
  { key: "gte_21", label: "20/1+ (21.0+)", minInclusive: 21, maxExclusive: null },
];

async function main() {
  const contexts = await Promise.all(YEARS.map(loadContext));
  const signals = signalDefinitions();
  const bandComparisons = contexts.flatMap((context) =>
    signals.flatMap((signal) =>
      SP_BANDS.map((band) => bandComparison(context, signal, band))
    )
  );
  const weightedComparisons = contexts.flatMap((context) =>
    signals.map((signal) => weightedComparison(context, signal))
  );
  const stressChecks = interestingStressChecks(bandComparisons);
  const lines: string[] = [];

  writeReport(lines, contexts, signals, bandComparisons, weightedComparisons, stressChecks);
  await writeFile(OUTPUT_PATH, `${lines.join("\n")}\n`, "utf8");

  console.log(`Wrote ${OUTPUT_PATH}`);
  for (const comparison of weightedComparisons) {
    console.log(
      `${comparison.year} ${comparison.signal.key}: actual ROI ${pct(comparison.metrics.roi)}, ` +
        `expected ${pct(comparison.expectedRoi)}, uplift ${pp(comparison.roiUplift)}, ` +
        `A/E uplift ${number(comparison.aeUplift)}`,
    );
  }
}

async function loadContext(year: Year): Promise<Context> {
  const cache = await loadLatestBacktestFeatureCacheForYear({ family: "turf_flat", year }) ??
    await loadLatestBacktestFeatureCacheForYear({ family: "all", year });
  if (!cache) {
    throw new Error(`Missing compatible v4 Turf cache for ${year}.`);
  }
  const rows = rankRows(cache.rows.filter((row) => row.features.raceCode === "turf"));
  return {
    year,
    cacheFrom: cache.manifest.from,
    cacheTo: cache.manifest.to,
    actualFrom: cache.actualCoverage?.actualFrom ?? cache.manifest.from,
    actualTo: cache.actualCoverage?.actualTo ?? cache.manifest.to,
    rows,
  };
}

function writeReport(
  lines: string[],
  contexts: Context[],
  signals: Signal[],
  bandComparisons: BandComparison[],
  weightedComparisons: WeightedComparison[],
  stressChecks: StressCheck[],
) {
  lines.push("# Turf Price-Adjusted Value Diagnostic");
  lines.push("");
  lines.push("Diagnostic only. No production Research behavior, defaults, cache logic, importers, schema, Today behavior, or TPR formula were changed.");
  lines.push("");
  lines.push("Settlement: uncapped actual final SP, £1 level stake. Keep 2025 development and 2026 year-to-date holdout separate.");
  lines.push("");

  writeCoverage(lines, contexts);
  writeSpBandBaseline(lines, contexts);
  for (const signal of signals) {
    writeSignalSection(lines, signal, bandComparisons);
  }
  writeWeightedComparison(lines, weightedComparisons);
  writeReplicationSummary(lines, signals, weightedComparisons);
  writeStrongestBands(lines, signals, bandComparisons);
  writeStressChecks(lines, contexts, stressChecks);
  writeConclusion(lines, signals, weightedComparisons);
}

function writeCoverage(lines: string[], contexts: Context[]) {
  lines.push("## Coverage / Reconciliation");
  lines.push("");
  table(lines, contexts.map((context) => {
    const metrics = metricsFor(context.rows);
    return {
      year: yearLabel(context),
      "cache window": `${context.cacheFrom} to ${context.cacheTo}`,
      "actual coverage": `${context.actualFrom} to ${context.actualTo}`,
      runners: context.rows.length,
      settled: metrics.settled,
      winners: metrics.winners,
      "missing/unusable settlement": context.rows.length - metrics.settled,
    };
  }));
  lines.push("");
}

function writeSpBandBaseline(lines: string[], contexts: Context[]) {
  lines.push("## SP-Band Baseline");
  lines.push("");
  lines.push("All Flat Turf runners, grouped by fixed final-SP band. This is the market-price benchmark used below.");
  lines.push("");
  table(lines, contexts.flatMap((context) =>
    SP_BANDS.map((band) => {
      const metrics = metricsFor(rowsInBand(context.rows, band));
      return {
        year: yearLabel(context),
        band: band.label,
        runners: metrics.runners,
        settled: metrics.settled,
        winners: metrics.winners,
        strike: pct(metrics.strike),
        ROI: pct(metrics.roi),
        "A/E": number(metrics.ae),
        "avg SP": number(metrics.averageSp),
        "median SP": number(metrics.medianSp),
      };
    })
  ));
  lines.push("");
}

function writeSignalSection(lines: string[], signal: Signal, comparisons: BandComparison[]) {
  lines.push(`## ${signal.title}`);
  lines.push("");
  table(lines, comparisons
    .filter((comparison) => comparison.signal.key === signal.key)
    .map((comparison) => ({
      year: comparison.year === "2026" ? "2026 YTD" : comparison.year,
      band: comparison.band.label,
      selections: comparison.signalMetrics.settled,
      winners: comparison.signalMetrics.winners,
      strike: pct(comparison.signalMetrics.strike),
      ROI: pct(comparison.signalMetrics.roi),
      "band ROI": pct(comparison.baseline.roi),
      "ROI uplift": pp(comparison.roiUplift),
      "A/E": number(comparison.signalMetrics.ae),
      "band A/E": number(comparison.baseline.ae),
      "A/E uplift": number(comparison.aeUplift),
      "strike uplift": pp(comparison.strikeUplift),
      "avg SP": number(comparison.signalMetrics.averageSp),
      sample: sampleLabel(comparison.signalMetrics.settled),
    })));
  lines.push("");
}

function writeWeightedComparison(lines: string[], comparisons: WeightedComparison[]) {
  lines.push("## Weighted Price-Mix Comparison");
  lines.push("");
  lines.push("Expected ROI is the all-Turf baseline ROI for each selection's SP band, weighted by the signal's actual settled price mix.");
  lines.push("");
  table(lines, comparisons.map((comparison) => ({
    year: comparison.year === "2026" ? "2026 YTD" : comparison.year,
    signal: comparison.signal.title,
    settled: comparison.metrics.settled,
    winners: comparison.metrics.winners,
    "actual ROI": pct(comparison.metrics.roi),
    "expected ROI from price mix": pct(comparison.expectedRoi),
    "ROI vs price-matched expectation": pp(comparison.roiUplift),
    "actual A/E": number(comparison.metrics.ae),
    "weighted band A/E": number(comparison.weightedBaselineAe),
    "A/E uplift": number(comparison.aeUplift),
    sample: sampleLabel(comparison.metrics.settled),
  })));
  lines.push("");
}

function writeReplicationSummary(lines: string[], signals: Signal[], comparisons: WeightedComparison[]) {
  lines.push("## Replication Summary");
  lines.push("");
  table(lines, signals.map((signal) => {
    const byYear = comparisonsForSignal(comparisons, signal);
    return {
      signal: signal.title,
      "ROI uplift 2025": pp(byYear["2025"].roiUplift),
      "ROI uplift 2026": pp(byYear["2026"].roiUplift),
      "A/E uplift 2025": number(byYear["2025"].aeUplift),
      "A/E uplift 2026": number(byYear["2026"].aeUplift),
      classification: classifySignal(byYear["2025"], byYear["2026"]),
    };
  }));
  lines.push("");
}

function writeStrongestBands(lines: string[], signals: Signal[], comparisons: BandComparison[]) {
  lines.push("## Strongest 2025 Bands And 2026 Replication");
  lines.push("");
  lines.push("Bands are selected from 2025 for inspection only; no thresholds are optimised from this table.");
  lines.push("");
  table(lines, signals.flatMap((signal) => {
    const signalComparisons = comparisons.filter((comparison) => comparison.signal.key === signal.key);
    const strongestRoi = strongest2025(signalComparisons, (comparison) => comparison.roiUplift);
    const strongestAe = strongest2025(signalComparisons, (comparison) => comparison.aeUplift);
    return [
      strongestBandRow(signal, "ROI uplift", strongestRoi, signalComparisons),
      strongestBandRow(signal, "A/E uplift", strongestAe, signalComparisons),
    ];
  }));
  lines.push("");
}

function writeStressChecks(lines: string[], contexts: Context[], checks: StressCheck[]) {
  lines.push("## Outlier Checks");
  lines.push("");
  lines.push(`Triggered for replicated cells with positive absolute ROI in both years, A/E >1.0 in both years, or ROI uplift >=${LARGE_ROI_UPLIFT_PP}pp in both years.`);
  lines.push("");
  if (checks.length === 0) {
    lines.push("_No replicated signal/SP-band cells met the stress-test trigger._");
    lines.push("");
    return;
  }
  table(lines, checks.flatMap((check) =>
    contexts.map((context) => stressRow(context, check))
  ));
  lines.push("");
}

function writeConclusion(lines: string[], signals: Signal[], comparisons: WeightedComparison[]) {
  lines.push("## Conclusion");
  lines.push("");
  const rows = signals.map((signal) => {
    const byYear = comparisonsForSignal(comparisons, signal);
    return {
      signal,
      y2025: byYear["2025"],
      y2026: byYear["2026"],
      roiBoth: positive(byYear["2025"].roiUplift) && positive(byYear["2026"].roiUplift),
      aeBoth: positive(byYear["2025"].aeUplift) && positive(byYear["2026"].aeUplift),
    };
  });
  const roiBoth = rows.filter((row) => row.roiBoth).map((row) => row.signal.title);
  const aeBoth = rows.filter((row) => row.aeBoth).map((row) => row.signal.title);
  const rank1 = rowFor(rows, "tpr_rank_1");
  const leader = rowFor(rows, "tpr_rank_1_lead_6");
  const trainer = rowFor(rows, "trainer_15");
  const smallField = rowFor(rows, "field_5");
  const smallTrainer = rowFor(rows, "field_5_trainer_15");
  const tprSmallTrainer = rowFor(rows, "tpr_rank_1_field_5_trainer_15");

  numbered(lines, [
    `Are existing signals beating the normal loss rate for similar prices? ${roiBoth.length > 0 ? `Yes: ${roiBoth.join("; ")} show positive price-adjusted ROI uplift in both years.` : "Not consistently on ROI uplift in both years."}`,
    `Signals with positive ROI uplift in both years: ${roiBoth.length === 0 ? "none" : roiBoth.join("; ")}.`,
    `Signals with positive A/E uplift in both years: ${aeBoth.length === 0 ? "none" : aeBoth.join("; ")}.`,
    `TPR rank 1 after price control: ${interpretPair(rank1.y2025, rank1.y2026)}.`,
    `TPR lead >=6 beyond TPR rank 1: ${compareSignals(leader.y2025, leader.y2026, rank1.y2025, rank1.y2026)}.`,
    `Trainer strength after price adjustment: ${interpretPair(trainer.y2025, trainer.y2026)}.`,
    `Small field after price adjustment: ${interpretPair(smallField.y2025, smallField.y2026)}.`,
    `Field <=5 + trainer SR >=15% after price control: ${interpretPair(smallTrainer.y2025, smallTrainer.y2026)}.`,
    `Adding TPR rank 1 to the small-field trainer population: ${compareSignals(tprSmallTrainer.y2025, tprSmallTrainer.y2026, smallTrainer.y2025, smallTrainer.y2026)}.`,
    `Signals materially better than market-price baseline despite negative absolute ROI: ${materialNegativeOutperformers(rows).join("; ") || "none on the weighted view"}.`,
    `Fair-price/value-model candidate: ${fairPriceCandidate(rows)}.`,
  ]);
}

function signalDefinitions(): Signal[] {
  return [
    {
      key: "tpr_rank_1",
      title: "A. TPR rank 1",
      predicate: (row) => row.turfPerformance?.rank === 1,
    },
    {
      key: "tpr_rank_1_lead_6",
      title: "B. TPR rank 1 + TPR lead >=6",
      predicate: (row) => row.turfPerformance?.rank === 1 && (row.turfPerformance.gap ?? -Infinity) >= 6,
    },
    {
      key: "trainer_15",
      title: "C. Trainer prior strike rate >=15%",
      predicate: (row) => (row.features.trainerPriorWinRate ?? -Infinity) >= 15,
    },
    {
      key: "field_5",
      title: "D. Field size <=5",
      predicate: (row) => fieldSize(row) !== null && fieldSize(row)! <= 5,
    },
    {
      key: "field_5_trainer_15",
      title: "E. Field size <=5 + trainer prior strike rate >=15%",
      predicate: (row) => fieldSize(row) !== null && fieldSize(row)! <= 5 &&
        (row.features.trainerPriorWinRate ?? -Infinity) >= 15,
    },
    {
      key: "tpr_rank_1_field_5_trainer_15",
      title: "F. TPR rank 1 + field size <=5 + trainer prior strike rate >=15%",
      predicate: (row) => row.turfPerformance?.rank === 1 &&
        fieldSize(row) !== null && fieldSize(row)! <= 5 &&
        (row.features.trainerPriorWinRate ?? -Infinity) >= 15,
    },
  ];
}

function bandComparison(context: Context, signal: Signal, band: SpBand): BandComparison {
  const baselineRows = rowsInBand(context.rows, band);
  const signalRows = baselineRows.filter(signal.predicate);
  const baseline = metricsFor(baselineRows);
  const signalMetrics = metricsFor(signalRows);
  return {
    year: context.year,
    signal,
    band,
    baseline,
    signalMetrics,
    roiUplift: diff(signalMetrics.roi, baseline.roi),
    aeUplift: diff(signalMetrics.ae, baseline.ae),
    strikeUplift: diff(signalMetrics.strike, baseline.strike),
  };
}

function weightedComparison(context: Context, signal: Signal): WeightedComparison {
  const baselineByBand = new Map(SP_BANDS.map((band) => [band.key, metricsFor(rowsInBand(context.rows, band))]));
  const signalRows = context.rows.filter(signal.predicate);
  const entries = settledEntries(signalRows);
  const metrics = metricsFor(signalRows);
  const expectedRoi = entries.length === 0
    ? null
    : entries.reduce((total, entry) => total + ((baselineByBand.get(entry.band.key)?.roi ?? 0) / 100), 0) /
      entries.length * 100;
  const weightedBaselineAe = entries.length === 0
    ? null
    : entries.reduce((total, entry) => total + (baselineByBand.get(entry.band.key)?.ae ?? 0), 0) / entries.length;

  return {
    year: context.year,
    signal,
    metrics,
    expectedRoi,
    roiUplift: diff(metrics.roi, expectedRoi),
    weightedBaselineAe,
    aeUplift: diff(metrics.ae, weightedBaselineAe),
  };
}

function metricsFor(rows: RankedResearchRow[]): Metrics {
  const entries = settledEntries(rows);
  const winners = entries.filter((entry) => entry.row.outcome.won);
  const profitLoss = entries.reduce((total, entry) => total + entry.settlement.profitLoss, 0);
  const expectedWins = entries.reduce((total, entry) => total + (1 / entry.settlement.settlementOddsDecimal), 0);
  const sps = entries.map((entry) => entry.settlement.settlementOddsDecimal);
  return {
    runners: rows.length,
    settled: entries.length,
    winners: winners.length,
    strike: entries.length === 0 ? null : (winners.length / entries.length) * 100,
    profitLoss,
    roi: entries.length === 0 ? null : (profitLoss / entries.length) * 100,
    expectedWins,
    ae: expectedWins === 0 ? null : winners.length / expectedWins,
    averageSp: average(sps),
    medianSp: median(sps),
  };
}

function settledEntries(rows: RankedResearchRow[]): SettledEntry[] {
  return rows
    .map((row) => {
      const settlement = settleSelection(row.outcome);
      const band = bandForSp(settlement?.settlementOddsDecimal ?? null);
      return settlement && band
        ? { row, settlement, band }
        : null;
    })
    .filter((entry): entry is SettledEntry => entry !== null);
}

function rowsInBand(rows: RankedResearchRow[], band: SpBand): RankedResearchRow[] {
  return rows.filter((row) => {
    const sp = settleSelection(row.outcome)?.settlementOddsDecimal ?? null;
    return sp !== null && matchesBand(sp, band);
  });
}

function bandForSp(sp: number | null): SpBand | null {
  if (sp === null || sp <= 0) return null;
  return SP_BANDS.find((band) => matchesBand(sp, band)) ?? null;
}

function matchesBand(sp: number, band: SpBand): boolean {
  if (band.minInclusive !== null && sp < band.minInclusive) return false;
  return band.maxExclusive === null || sp < band.maxExclusive;
}

function interestingStressChecks(comparisons: BandComparison[]): StressCheck[] {
  const checks: StressCheck[] = [];
  const signals = uniqueBy(comparisons.map((comparison) => comparison.signal), (signal) => signal.key);
  for (const signal of signals) {
    for (const band of SP_BANDS) {
      const y2025 = comparisons.find((comparison) =>
        comparison.signal.key === signal.key && comparison.band.key === band.key && comparison.year === "2025"
      );
      const y2026 = comparisons.find((comparison) =>
        comparison.signal.key === signal.key && comparison.band.key === band.key && comparison.year === "2026"
      );
      if (!y2025 || !y2026) continue;
      if (Math.min(y2025.signalMetrics.settled, y2026.signalMetrics.settled) < MIN_LIMITED) continue;
      const reasons: string[] = [];
      if (positive(y2025.signalMetrics.roi) && positive(y2026.signalMetrics.roi)) {
        reasons.push("positive ROI both years");
      }
      if ((y2025.roiUplift ?? -Infinity) >= LARGE_ROI_UPLIFT_PP &&
        (y2026.roiUplift ?? -Infinity) >= LARGE_ROI_UPLIFT_PP) {
        reasons.push(`ROI uplift >=${LARGE_ROI_UPLIFT_PP}pp both years`);
      }
      if ((y2025.signalMetrics.ae ?? -Infinity) > 1 && (y2026.signalMetrics.ae ?? -Infinity) > 1) {
        reasons.push("A/E >1 both years");
      }
      if (reasons.length > 0) {
        checks.push({ signal, band, reason: reasons.join("; ") });
      }
    }
  }
  return checks;
}

function stressRow(context: Context, check: StressCheck) {
  const baseline = metricsFor(rowsInBand(context.rows, check.band));
  const rows = rowsInBand(context.rows, check.band).filter(check.signal.predicate);
  const entries = settledEntries(rows);
  const biggestWinner = entries
    .filter((entry) => entry.row.outcome.won)
    .sort((left, right) => right.settlement.settlementOddsDecimal - left.settlement.settlementOddsDecimal)[0] ?? null;
  const stressedRows = biggestWinner
    ? rows.filter((row) => row.features.targetRunnerId !== biggestWinner.row.features.targetRunnerId)
    : rows;
  const original = metricsFor(rows);
  const stressed = metricsFor(stressedRows);
  return {
    year: context.year === "2026" ? "2026 YTD" : context.year,
    signal: check.signal.title,
    band: check.band.label,
    trigger: check.reason,
    "removed winner": biggestWinner?.row.features.horseName ?? "n/a",
    "removed SP": number(biggestWinner?.settlement.settlementOddsDecimal ?? null),
    selections: original.settled,
    "original ROI": pct(original.roi),
    "original A/E": number(original.ae),
    "stressed ROI": pct(stressed.roi),
    "stressed A/E": number(stressed.ae),
    "stressed ROI uplift": pp(diff(stressed.roi, baseline.roi)),
  };
}

function strongest2025(
  comparisons: BandComparison[],
  valueFor: (comparison: BandComparison) => number | null,
): BandComparison | null {
  return comparisons
    .filter((comparison) => comparison.year === "2025" && comparison.signalMetrics.settled >= MIN_LIMITED)
    .sort((left, right) => (valueFor(right) ?? -Infinity) - (valueFor(left) ?? -Infinity))[0] ?? null;
}

function strongestBandRow(
  signal: Signal,
  metric: string,
  strongest: BandComparison | null,
  comparisons: BandComparison[],
) {
  const replication = strongest
    ? comparisons.find((comparison) =>
      comparison.year === "2026" && comparison.signal.key === signal.key && comparison.band.key === strongest.band.key
    ) ?? null
    : null;
  return {
    signal: signal.title,
    metric,
    "2025 strongest band": strongest?.band.label ?? "n/a",
    "2025 settled": strongest?.signalMetrics.settled ?? 0,
    "2025 ROI uplift": pp(strongest?.roiUplift ?? null),
    "2025 A/E uplift": number(strongest?.aeUplift ?? null),
    "2026 same-band settled": replication?.signalMetrics.settled ?? 0,
    "2026 same-band ROI uplift": pp(replication?.roiUplift ?? null),
    "2026 same-band A/E uplift": number(replication?.aeUplift ?? null),
    "2026 same-band sample": sampleLabel(replication?.signalMetrics.settled ?? 0),
  };
}

function comparisonsForSignal(comparisons: WeightedComparison[], signal: Signal): Record<Year, WeightedComparison> {
  const y2025 = comparisons.find((comparison) => comparison.signal.key === signal.key && comparison.year === "2025");
  const y2026 = comparisons.find((comparison) => comparison.signal.key === signal.key && comparison.year === "2026");
  if (!y2025 || !y2026) throw new Error(`Missing weighted comparison for ${signal.key}`);
  return { "2025": y2025, "2026": y2026 };
}

function classifySignal(y2025: WeightedComparison, y2026: WeightedComparison): string {
  if (Math.min(y2025.metrics.settled, y2026.metrics.settled) < MIN_LIMITED) return "too sparse";
  const roi2025 = y2025.roiUplift ?? 0;
  const roi2026 = y2026.roiUplift ?? 0;
  const ae2025 = y2025.aeUplift ?? 0;
  const ae2026 = y2026.aeUplift ?? 0;
  const positiveRoiBoth = roi2025 > 0 && roi2026 > 0;
  const positiveAeBoth = ae2025 > 0 && ae2026 > 0;
  if (Math.abs(roi2025) < 2 && Math.abs(roi2026) < 2 && Math.abs(ae2025) < 0.02 && Math.abs(ae2026) < 0.02) {
    return "negligible";
  }
  if (positiveRoiBoth || positiveAeBoth) return "positive in both years";
  if ((roi2025 > 0 || ae2025 > 0) && roi2026 <= 0 && ae2026 <= 0) return "positive 2025 only";
  if (roi2025 <= 0 && ae2025 <= 0 && (roi2026 > 0 || ae2026 > 0)) return "positive 2026 only";
  return "reversed";
}

function interpretPair(y2025: WeightedComparison, y2026: WeightedComparison): string {
  const classification = classifySignal(y2025, y2026);
  return `${classification}; ROI uplift ${pp(y2025.roiUplift)} in 2025 and ${pp(y2026.roiUplift)} in 2026, ` +
    `with A/E uplift ${number(y2025.aeUplift)} and ${number(y2026.aeUplift)}.`;
}

function compareSignals(
  candidate2025: WeightedComparison,
  candidate2026: WeightedComparison,
  base2025: WeightedComparison,
  base2026: WeightedComparison,
): string {
  const delta2025 = diff(candidate2025.roiUplift, base2025.roiUplift);
  const delta2026 = diff(candidate2026.roiUplift, base2026.roiUplift);
  const aeDelta2025 = diff(candidate2025.aeUplift, base2025.aeUplift);
  const aeDelta2026 = diff(candidate2026.aeUplift, base2026.aeUplift);
  const improvesBoth = positive(delta2025) && positive(delta2026) && positive(aeDelta2025) && positive(aeDelta2026);
  return `${improvesBoth ? "adds consistent incremental price-adjusted value" : "does not add consistent incremental price-adjusted value"}; ` +
    `ROI-uplift delta ${pp(delta2025)} in 2025 and ${pp(delta2026)} in 2026, ` +
    `A/E-uplift delta ${number(aeDelta2025)} and ${number(aeDelta2026)}.`;
}

function materialNegativeOutperformers(
  rows: Array<{ signal: Signal; y2025: WeightedComparison; y2026: WeightedComparison }>,
): string[] {
  return rows
    .filter((row) =>
      (row.y2025.metrics.roi ?? 0) < 0 &&
      (row.y2026.metrics.roi ?? 0) < 0 &&
      (row.y2025.roiUplift ?? 0) >= 5 &&
      (row.y2026.roiUplift ?? 0) >= 5
    )
    .map((row) => row.signal.title);
}

function fairPriceCandidate(
  rows: Array<{ signal: Signal; y2025: WeightedComparison; y2026: WeightedComparison; roiBoth: boolean; aeBoth: boolean }>,
): string {
  const candidates = rows
    .filter((row) => row.roiBoth && row.aeBoth && Math.min(row.y2025.metrics.settled, row.y2026.metrics.settled) >= MIN_LIMITED)
    .sort((left, right) =>
      ((right.y2025.roiUplift ?? 0) + (right.y2026.roiUplift ?? 0)) -
      ((left.y2025.roiUplift ?? 0) + (left.y2026.roiUplift ?? 0))
    );
  const best = candidates[0];
  return best
    ? `${best.signal.title} is the strongest later fair-price/value-model candidate on this diagnostic.`
    : "none is strong enough on both ROI and A/E uplift to justify prioritising a fair-price/value-model investigation from this diagnostic alone.";
}

function rowFor<T extends { signal: Signal }>(rows: T[], key: string): T {
  const row = rows.find((candidate) => candidate.signal.key === key);
  if (!row) throw new Error(`Missing signal row ${key}`);
  return row;
}

function fieldSize(row: RankedResearchRow): number | null {
  return row.features.actualRunnerCount ?? row.features.declaredRunnerCount;
}

function yearLabel(context: Context): string {
  return context.year === "2026" ? `2026 YTD (${context.actualFrom} to ${context.actualTo})` : context.year;
}

function positive(value: number | null): boolean {
  return value !== null && value > 0;
}

function diff(left: number | null, right: number | null): number | null {
  return left === null || right === null ? null : left - right;
}

function uniqueBy<T>(values: T[], keyFor: (value: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const value of values) {
    const key = keyFor(value);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(value);
    }
  }
  return result;
}

function sampleLabel(settled: number): string {
  if (settled >= MIN_ADEQUATE) return "adequate";
  if (settled >= MIN_LIMITED) return "limited";
  return "sparse";
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
  return value === null || !Number.isFinite(value) ? "n/a" : `${value >= 0 ? "+" : ""}${value.toFixed(1)}pp`;
}

function number(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "n/a" : value.toFixed(2);
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
