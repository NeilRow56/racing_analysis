import { writeFile } from "node:fs/promises";
import { settleSelection, type BacktestSettlement } from "@/lib/racing/backtest";
import { loadLatestBacktestFeatureCacheForYear } from "@/lib/racing/backtest-cache";
import { rankRows, type RankedResearchRow } from "@/lib/racing/research-rule";
import { TURF_PERFORMANCE_RATING_VERSION } from "@/lib/racing/turf-performance-rating";

type Year = "2025" | "2026";
type Source = "exact lead x field cell" | "lead fallback" | "global fallback";

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

type Band = {
  key: string;
  label: string;
  order: number;
};

type CalibrationStats = {
  selections: number;
  winners: number;
  probability: number | null;
  fairDecimal: number | null;
};

type Model = {
  global: CalibrationStats;
  lead: Map<string, CalibrationStats>;
  cell: Map<string, CalibrationStats>;
};

type PricedEntry = SettledEntry & {
  leadBand: Band | null;
  fieldBand: Band | null;
  predictedProbability: number;
  fairDecimal: number;
  source: Source;
  modelKey: string;
  valueRatio: number;
  modelEdge: number;
};

type GroupMetrics = {
  selections: number;
  winners: number;
  predictedWins: number;
  observedWins: number;
  strike: number | null;
  predictedWinRate: number | null;
  calibrationError: number | null;
  averageSp: number | null;
  roi: number | null;
  ae: number | null;
  averageModelEdge: number | null;
  brier: number | null;
};

type ValueBand = {
  key: string;
  label: string;
  minInclusive: number | null;
  maxExclusive: number | null;
};

const OUTPUT_PATH = "/tmp/tpr-fair-price-v1.md";
const YEARS: Year[] = ["2025", "2026"];
const ADEQUATE_SAMPLE = 100;
const LIMITED_SAMPLE = 30;

const LEAD_BANDS: Band[] = [
  { key: "lead_lt_2", label: "<2", order: 0 },
  { key: "lead_2_599", label: "2-5.99", order: 1 },
  { key: "lead_6_999", label: "6-9.99", order: 2 },
  { key: "lead_gte_10", label: "10+", order: 3 },
];

const FIELD_BANDS: Band[] = [
  { key: "field_2_5", label: "2-5", order: 0 },
  { key: "field_6_8", label: "6-8", order: 1 },
  { key: "field_9_12", label: "9-12", order: 2 },
  { key: "field_gte_13", label: "13+", order: 3 },
];

const VALUE_BANDS: ValueBand[] = [
  { key: "lt_090", label: "<0.90", minInclusive: null, maxExclusive: 0.9 },
  { key: "090_099", label: "0.90-0.99", minInclusive: 0.9, maxExclusive: 1 },
  { key: "100_109", label: "1.00-1.09", minInclusive: 1, maxExclusive: 1.1 },
  { key: "110_124", label: "1.10-1.24", minInclusive: 1.1, maxExclusive: 1.25 },
  { key: "125_149", label: "1.25-1.49", minInclusive: 1.25, maxExclusive: 1.5 },
  { key: "gte_150", label: "1.50+", minInclusive: 1.5, maxExclusive: null },
];

const MAIN_VALUE_GROUPS: ValueBand[] = [
  { key: "shorter", label: "market shorter than fair (<1.0)", minInclusive: null, maxExclusive: 1 },
  { key: "roughly_fair", label: "roughly fair (1.0 to <1.10)", minInclusive: 1, maxExclusive: 1.1 },
  { key: "modest_value", label: "modest value (1.10 to <1.25)", minInclusive: 1.1, maxExclusive: 1.25 },
  { key: "clear_value", label: "clear value (>=1.25)", minInclusive: 1.25, maxExclusive: null },
];

const FAIR_PRICE_BANDS: ValueBand[] = [
  { key: "lt_3", label: "<3.0", minInclusive: null, maxExclusive: 3 },
  { key: "3_399", label: "3.0-3.99", minInclusive: 3, maxExclusive: 4 },
  { key: "4_499", label: "4.0-4.99", minInclusive: 4, maxExclusive: 5 },
  { key: "5_699", label: "5.0-6.99", minInclusive: 5, maxExclusive: 7 },
  { key: "7_999", label: "7.0-9.99", minInclusive: 7, maxExclusive: 10 },
  { key: "gte_10", label: "10.0+", minInclusive: 10, maxExclusive: null },
];

async function main() {
  const contexts = await Promise.all(YEARS.map(loadContext));
  const development = contextFor(contexts, "2025");
  const model = buildModel(development.entries);
  const priced = new Map<Year, PricedEntry[]>(
    contexts.map((context) => [context.year, priceEntries(context.entries, model)]),
  );
  const lines: string[] = [];

  writeReport(lines, contexts, model, priced);
  await writeFile(OUTPUT_PATH, `${lines.join("\n")}\n`, "utf8");

  const holdout = groupMetrics(priced.get("2026") ?? []);
  console.log(`Wrote ${OUTPUT_PATH}`);
  console.log(
    `2026: mean predicted ${pct(probabilityPct(holdout.predictedWinRate))}, ` +
      `observed ${pct(probabilityPct(holdout.strike))}, error ${pp(probabilityPct(holdout.calibrationError))}, ` +
      `ROI ${pct(holdout.roi)}`,
  );
}

async function loadContext(year: Year): Promise<Context> {
  const cache = await loadLatestBacktestFeatureCacheForYear({ family: "turf_flat", year }) ??
    await loadLatestBacktestFeatureCacheForYear({ family: "all", year });
  if (!cache) throw new Error(`Missing compatible v4 Turf cache for ${year}.`);
  const rows = rankRows(cache.rows.filter((row) => row.features.raceCode === "turf"));
  const entries = settledEntries(rows).filter((entry) =>
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

function writeReport(lines: string[], contexts: Context[], model: Model, priced: Map<Year, PricedEntry[]>) {
  lines.push("# TPR Fair-Price V1 Diagnostic");
  lines.push("");
  lines.push("Diagnostic only. No production Research behavior, Today behavior, cache logic, importers, schema, filters, or TPR formula were changed.");
  lines.push("");
  lines.push("Model inputs: `TPR_S2_V1` rank-1 status, TPR lead band, and field-size band only. Final SP is used only after frozen fair prices are assigned.");
  lines.push("");

  writeCoverage(lines, contexts);
  writeCalibrationTable(lines, model);
  writeFallbackLogic(lines, model);
  writeFrozenModelDefinition(lines, model);
  writeHoldoutCalibration(lines, priced.get("2026") ?? []);
  writeCalibrationDiagnostics(lines, priced.get("2026") ?? []);
  writeFairPriceBands(lines, priced.get("2026") ?? []);
  writeValueBands(lines, "Value-Ratio Bands: 2026 Holdout", priced.get("2026") ?? []);
  writeMainValueTest(lines, priced.get("2026") ?? []);
  writeValueBands(lines, "In-Sample 2025 Reference", priced.get("2025") ?? []);
  writeOutlierStress(lines, priced.get("2026") ?? []);
  writeConclusion(lines, model, priced);
}

function writeCoverage(lines: string[], contexts: Context[]) {
  lines.push("## Coverage");
  lines.push("");
  table(lines, contexts.map((context) => ({
    year: yearLabel(context),
    "cache window": `${context.cacheFrom} to ${context.cacheTo}`,
    "actual coverage": `${context.actualFrom} to ${context.actualTo}`,
    "settled TPR rank-1 selections": context.entries.length,
    winners: context.entries.filter((entry) => entry.row.outcome.won).length,
  })));
  lines.push("");
}

function writeCalibrationTable(lines: string[], model: Model) {
  lines.push("## 2025 Calibration Table");
  lines.push("");
  lines.push(`Sample quality: adequate >=${ADEQUATE_SAMPLE}; limited ${LIMITED_SAMPLE}-${ADEQUATE_SAMPLE - 1}; sparse <${LIMITED_SAMPLE}.`);
  lines.push("");
  table(lines, LEAD_BANDS.flatMap((leadBand) =>
    FIELD_BANDS.map((fieldBand) => {
      const stats = model.cell.get(cellKey(leadBand, fieldBand)) ?? emptyStats();
      return {
        "lead band": leadBand.label,
        "field band": fieldBand.label,
        selections: stats.selections,
        winners: stats.winners,
        "observed win probability": pct(probabilityPct(stats.probability)),
        "fair decimal odds": number(stats.fairDecimal),
        sample: sampleLabel(stats.selections),
      };
    })
  ));
  lines.push("");
}

function writeFallbackLogic(lines: string[], model: Model) {
  lines.push("## Fallback Logic");
  lines.push("");
  lines.push("For every runner, the frozen model uses the first available source in this order:");
  numbered(lines, [
    `lead x field cell if the 2025 cell has adequate sample, meaning >=${ADEQUATE_SAMPLE} selections`,
    "2025 lead-band probability if the exact cell is limited/sparse",
    "overall 2025 TPR-rank-1 probability as the global fallback",
  ]);
  lines.push("");
  table(lines, LEAD_BANDS.map((leadBand) => {
    const stats = model.lead.get(leadBand.key) ?? emptyStats();
    return {
      "lead fallback": leadBand.label,
      selections: stats.selections,
      winners: stats.winners,
      probability: pct(probabilityPct(stats.probability)),
      "fair decimal": number(stats.fairDecimal),
      sample: sampleLabel(stats.selections),
    };
  }));
  lines.push("");
  lines.push(`Global fallback: ${pct(probabilityPct(model.global.probability))}, fair decimal ${number(model.global.fairDecimal)} from ${model.global.selections} selections.`);
  lines.push("");
}

function writeFrozenModelDefinition(lines: string[], model: Model) {
  lines.push("## Frozen Model Definition");
  lines.push("");
  table(lines, LEAD_BANDS.flatMap((leadBand) =>
    FIELD_BANDS.map((fieldBand) => {
      const cellStats = model.cell.get(cellKey(leadBand, fieldBand)) ?? emptyStats();
      const assigned = assignmentForBands(leadBand, fieldBand, model);
      return {
        "lead band": leadBand.label,
        "field band": fieldBand.label,
        "cell sample": cellStats.selections,
        "cell probability": pct(probabilityPct(cellStats.probability)),
        "assigned source": assigned.source,
        "assigned probability": pct(probabilityPct(assigned.probability)),
        "assigned fair decimal": number(assigned.fairDecimal),
      };
    })
  ));
  lines.push("");
}

function writeHoldoutCalibration(lines: string[], entries: PricedEntry[]) {
  lines.push("## 2026 Calibration");
  lines.push("");
  const overall = groupMetrics(entries);
  table(lines, [{
    selections: overall.selections,
    "mean predicted probability": pct(probabilityPct(overall.predictedWinRate)),
    "observed strike": pct(probabilityPct(overall.strike)),
    "calibration error": pp(probabilityPct(overall.calibrationError)),
    "predicted wins": number(overall.predictedWins),
    "observed wins": overall.observedWins,
    "Brier score": brierNumber(overall.brier),
  }]);
  lines.push("");
  table(lines, groupBy(entries, (entry) => entry.modelKey).map(([key, group]) => {
    const metrics = groupMetrics(group);
    const example = group[0];
    return {
      "model bucket/fallback source": key,
      source: example?.source ?? "n/a",
      selections: metrics.selections,
      "predicted win probability": pct(probabilityPct(metrics.predictedWinRate)),
      "observed win probability": pct(probabilityPct(metrics.strike)),
      "calibration error": pp(probabilityPct(metrics.calibrationError)),
      "fair decimal": number(example?.fairDecimal ?? null),
      sample: sampleLabel(metrics.selections),
    };
  }));
  lines.push("");
  table(lines, groupBy(entries, (entry) => entry.source).map(([source, group]) => {
    const metrics = groupMetrics(group);
    return {
      source,
      selections: metrics.selections,
      "usage share": pct(metrics.selections === 0 ? null : (metrics.selections / entries.length) * 100),
      "predicted win rate": pct(probabilityPct(metrics.predictedWinRate)),
      "observed win rate": pct(probabilityPct(metrics.strike)),
      "calibration error": pp(probabilityPct(metrics.calibrationError)),
    };
  }));
  lines.push("");
}

function writeCalibrationDiagnostics(lines: string[], entries: PricedEntry[]) {
  lines.push("## Calibration Diagnostics");
  lines.push("");
  table(lines, LEAD_BANDS.map((band) => calibrationDiagnosticRow(
    `lead ${band.label}`,
    entries.filter((entry) => entry.leadBand?.key === band.key),
  )));
  lines.push("");
  table(lines, FIELD_BANDS.map((band) => calibrationDiagnosticRow(
    `field ${band.label}`,
    entries.filter((entry) => entry.fieldBand?.key === band.key),
  )));
  lines.push("");
}

function writeFairPriceBands(lines: string[], entries: PricedEntry[]) {
  lines.push("## Fair-Price Bands: 2026 Holdout");
  lines.push("");
  table(lines, FAIR_PRICE_BANDS.map((band) => {
    const group = entries.filter((entry) => matchesBand(entry.fairDecimal, band));
    const metrics = groupMetrics(group);
    return {
      "fair odds band": band.label,
      selections: metrics.selections,
      "predicted win rate": pct(probabilityPct(metrics.predictedWinRate)),
      "observed win rate": pct(probabilityPct(metrics.strike)),
      "calibration error": pp(probabilityPct(metrics.calibrationError)),
      sample: sampleLabel(metrics.selections),
    };
  }));
  lines.push("");
}

function writeValueBands(lines: string[], title: string, entries: PricedEntry[]) {
  lines.push(`## ${title}`);
  lines.push("");
  table(lines, VALUE_BANDS.map((band) => {
    const group = entries.filter((entry) => matchesBand(entry.valueRatio, band));
    const metrics = groupMetrics(group);
    return {
      "value ratio band": band.label,
      selections: metrics.selections,
      winners: metrics.winners,
      strike: pct(probabilityPct(metrics.strike)),
      "predicted win rate": pct(probabilityPct(metrics.predictedWinRate)),
      "avg SP": number(metrics.averageSp),
      ROI: pct(metrics.roi),
      "A/E": number(metrics.ae),
      "avg model edge": number(metrics.averageModelEdge),
      sample: sampleLabel(metrics.selections),
    };
  }));
  lines.push("");
}

function writeMainValueTest(lines: string[], entries: PricedEntry[]) {
  lines.push("## Main Value Test: 2026 Holdout");
  lines.push("");
  table(lines, MAIN_VALUE_GROUPS.map((band) => {
    const group = entries.filter((entry) => matchesBand(entry.valueRatio, band));
    const metrics = groupMetrics(group);
    return {
      group: band.label,
      selections: metrics.selections,
      winners: metrics.winners,
      "predicted wins": number(metrics.predictedWins),
      "observed wins": metrics.observedWins,
      strike: pct(probabilityPct(metrics.strike)),
      ROI: pct(metrics.roi),
      "A/E": number(metrics.ae),
      "calibration error": pp(probabilityPct(metrics.calibrationError)),
    };
  }));
  lines.push("");
}

function writeOutlierStress(lines: string[], entries: PricedEntry[]) {
  lines.push("## Outlier Stress");
  lines.push("");
  const triggered = VALUE_BANDS
    .map((band) => ({ band, group: entries.filter((entry) => matchesBand(entry.valueRatio, band)) }))
    .filter(({ group }) => {
      const metrics = groupMetrics(group);
      return (metrics.roi ?? -Infinity) > 0 || (metrics.ae ?? -Infinity) > 1;
    });
  if (triggered.length === 0) {
    lines.push("_No 2026 value-ratio band had positive ROI or A/E >1.0._");
    lines.push("");
    return;
  }
  table(lines, triggered.map(({ band, group }) => {
    const metrics = groupMetrics(group);
    const biggest = biggestPricedWinner(group);
    const stressed = biggest
      ? group.filter((entry) => entry.row.features.targetRunnerId !== biggest.row.features.targetRunnerId)
      : group;
    const stressedMetrics = groupMetrics(stressed);
    return {
      "value ratio band": band.label,
      selections: metrics.selections,
      ROI: pct(metrics.roi),
      "A/E": number(metrics.ae),
      "biggest winner": biggest?.row.features.horseName ?? "n/a",
      "biggest winner SP": number(biggest?.settlement.settlementOddsDecimal ?? null),
      "largest winner P/L contribution": contribution(biggest?.settlement.profitLoss ?? 0, metrics),
      "stressed ROI": pct(stressedMetrics.roi),
      "stressed A/E": number(stressedMetrics.ae),
    };
  }));
  lines.push("");
}

function writeConclusion(lines: string[], model: Model, priced: Map<Year, PricedEntry[]>) {
  lines.push("## Conclusion");
  lines.push("");
  const holdout = priced.get("2026") ?? [];
  const inSample = priced.get("2025") ?? [];
  const overall2026 = groupMetrics(holdout);
  const globalModel = model.global.probability ?? 0;
  const globalBrier = holdout.length === 0
    ? null
    : holdout.reduce((total, entry) => total + ((won(entry) ? 1 : 0) - globalModel) ** 2, 0) / holdout.length;
  const sourceRows = groupBy(holdout, (entry) => entry.source);
  const exactUsage = sourceRows.find(([source]) => source === "exact lead x field cell")?.[1].length ?? 0;
  const leadUsage = sourceRows.find(([source]) => source === "lead fallback")?.[1].length ?? 0;
  const globalUsage = sourceRows.find(([source]) => source === "global fallback")?.[1].length ?? 0;
  const aboveFair = groupMetrics(holdout.filter((entry) => entry.valueRatio >= 1));
  const belowFair = groupMetrics(holdout.filter((entry) => entry.valueRatio < 1));
  const value110 = groupMetrics(holdout.filter((entry) => entry.valueRatio >= 1.1));
  const value125 = groupMetrics(holdout.filter((entry) => entry.valueRatio >= 1.25));
  const mono = monotonicValueRelationship(holdout);
  const stressSurvivors = stressSurvivingBands(holdout);
  const brierDelta = globalBrier !== null && overall2026.brier !== null ? globalBrier - overall2026.brier : null;
  const modelBrierBetter = brierDelta !== null && brierDelta > 0.001;
  const trainerNext = modelBrierBetter && (value110.ae ?? 0) >= 0.9;

  numbered(lines, [
    `The frozen 2025 fair-price model is ${calibrationSummary(overall2026)} in 2026: mean predicted ${pct(probabilityPct(overall2026.predictedWinRate))}, observed ${pct(probabilityPct(overall2026.strike))}, error ${pp(probabilityPct(overall2026.calibrationError))}, Brier ${brierNumber(overall2026.brier)}.`,
    `Lead x field size ${modelBrierBetter ? "materially improves" : "does not materially improve"} on the global 2025 fallback by Brier score: model ${brierNumber(overall2026.brier)} versus global ${brierNumber(globalBrier)}; delta ${brierNumber(brierDelta)}.`,
    `Exact cells were used for ${exactUsage}/${holdout.length}; lead fallback for ${leadUsage}/${holdout.length}; global fallback for ${globalUsage}/${holdout.length}.`,
    `Above-fair runners versus below-fair runners: above fair ROI ${pct(aboveFair.roi)} / A/E ${number(aboveFair.ae)}, below fair ROI ${pct(belowFair.roi)} / A/E ${number(belowFair.ae)}.`,
    `Value-ratio monotonicity across fixed bands: ${mono}.`,
    `The >=1.10 value region: ${value110.selections} selections, ROI ${pct(value110.roi)}, A/E ${number(value110.ae)}, calibration error ${pp(probabilityPct(value110.calibrationError))}.`,
    `The >=1.25 value region: ${value125.selections} selections, ROI ${pct(value125.roi)}, A/E ${number(value125.ae)}, calibration error ${pp(probabilityPct(value125.calibrationError))}.`,
    `Positive-looking value bands after biggest-winner removal: ${stressSurvivors.length === 0 ? "none" : stressSurvivors.join("; ")}.`,
    `Second fair-price iteration: ${modelBrierBetter && stressSurvivors.length > 0 ? "justified cautiously" : "not fully validated yet"}; the in-sample 2025 value profile is context only, with overall ROI ${pct(groupMetrics(inSample).roi)}.`,
    `Trainer strength as next dimension: ${trainerNext ? "reasonable to test next, because previous calibration showed trainer monotonicity and this model has some holdout structure" : "defer until this first model has stronger holdout value validation"}.`,
    `${modelBrierBetter && stressSurvivors.length > 0 ? "The first model has enough signal for another diagnostic iteration, not production use." : "The first fair-price model is not validated for production and should remain diagnostic."}`,
  ]);
}

function buildModel(entries: SettledEntry[]): Model {
  const global = calibrationStats(entries);
  const lead = new Map(LEAD_BANDS.map((band) => [
    band.key,
    calibrationStats(entries.filter((entry) => leadBandFor(entry)?.key === band.key)),
  ]));
  const cell = new Map<string, CalibrationStats>();
  for (const leadBand of LEAD_BANDS) {
    for (const fieldBand of FIELD_BANDS) {
      cell.set(
        cellKey(leadBand, fieldBand),
        calibrationStats(entries.filter((entry) =>
          leadBandFor(entry)?.key === leadBand.key && fieldBandFor(entry)?.key === fieldBand.key
        )),
      );
    }
  }
  return { global, lead, cell };
}

function priceEntries(entries: SettledEntry[], model: Model): PricedEntry[] {
  return entries.map((entry) => {
    const leadBand = leadBandFor(entry);
    const fieldBand = fieldBandFor(entry);
    const assigned = assignmentForBands(leadBand, fieldBand, model);
    const fairDecimal = assigned.fairDecimal ?? 1 / (model.global.probability ?? 1);
    const predictedProbability = assigned.probability ?? model.global.probability ?? 0;
    const valueRatio = entry.settlement.settlementOddsDecimal / fairDecimal;
    return {
      ...entry,
      leadBand,
      fieldBand,
      predictedProbability,
      fairDecimal,
      source: assigned.source,
      modelKey: assigned.key,
      valueRatio,
      modelEdge: (predictedProbability * entry.settlement.settlementOddsDecimal) - 1,
    };
  });
}

function assignmentForBands(leadBand: Band | null, fieldBand: Band | null, model: Model): {
  key: string;
  source: Source;
  probability: number | null;
  fairDecimal: number | null;
} {
  if (leadBand && fieldBand) {
    const key = cellKey(leadBand, fieldBand);
    const cellStats = model.cell.get(key) ?? emptyStats();
    if (cellStats.selections >= ADEQUATE_SAMPLE && cellStats.probability !== null) {
      return {
        key: `${leadBand.label} x ${fieldBand.label}`,
        source: "exact lead x field cell",
        probability: cellStats.probability,
        fairDecimal: cellStats.fairDecimal,
      };
    }
  }
  if (leadBand) {
    const leadStats = model.lead.get(leadBand.key) ?? emptyStats();
    if (leadStats.probability !== null) {
      return {
        key: `lead fallback ${leadBand.label}`,
        source: "lead fallback",
        probability: leadStats.probability,
        fairDecimal: leadStats.fairDecimal,
      };
    }
  }
  return {
    key: "global fallback",
    source: "global fallback",
    probability: model.global.probability,
    fairDecimal: model.global.fairDecimal,
  };
}

function calibrationStats(entries: SettledEntry[]): CalibrationStats {
  const winners = entries.filter(won).length;
  const probability = entries.length === 0 ? null : winners / entries.length;
  return {
    selections: entries.length,
    winners,
    probability,
    fairDecimal: probability && probability > 0 ? 1 / probability : null,
  };
}

function groupMetrics(entries: PricedEntry[]): GroupMetrics {
  const winners = entries.filter(won).length;
  const predictedWins = entries.reduce((total, entry) => total + entry.predictedProbability, 0);
  const observedWins = winners;
  const stakes = entries.length;
  const profitLoss = entries.reduce((total, entry) => total + entry.settlement.profitLoss, 0);
  const expectedWins = entries.reduce((total, entry) => total + (1 / entry.settlement.settlementOddsDecimal), 0);
  const strike = stakes === 0 ? null : winners / stakes;
  const predictedWinRate = stakes === 0 ? null : predictedWins / stakes;
  return {
    selections: stakes,
    winners,
    predictedWins,
    observedWins,
    strike,
    predictedWinRate,
    calibrationError: diff(strike, predictedWinRate),
    averageSp: average(entries.map((entry) => entry.settlement.settlementOddsDecimal)),
    roi: stakes === 0 ? null : (profitLoss / stakes) * 100,
    ae: expectedWins === 0 ? null : winners / expectedWins,
    averageModelEdge: average(entries.map((entry) => entry.modelEdge)),
    brier: stakes === 0 ? null : entries.reduce(
      (total, entry) => total + ((won(entry) ? 1 : 0) - entry.predictedProbability) ** 2,
      0,
    ) / stakes,
  };
}

function calibrationDiagnosticRow(label: string, entries: PricedEntry[]) {
  const metrics = groupMetrics(entries);
  return {
    bucket: label,
    selections: metrics.selections,
    "predicted win rate": pct(probabilityPct(metrics.predictedWinRate)),
    "observed win rate": pct(probabilityPct(metrics.strike)),
    "calibration error": pp(probabilityPct(metrics.calibrationError)),
    "Brier score": brierNumber(metrics.brier),
    sample: sampleLabel(metrics.selections),
  };
}

function biggestPricedWinner(entries: PricedEntry[]): PricedEntry | null {
  return entries
    .filter(won)
    .sort((left, right) => right.settlement.settlementOddsDecimal - left.settlement.settlementOddsDecimal)[0] ?? null;
}

function contribution(profit: number, metrics: GroupMetrics): string {
  if (metrics.roi === null || metrics.selections === 0) return "n/a";
  const totalProfit = (metrics.roi / 100) * metrics.selections;
  if (totalProfit === 0) return "n/a";
  return pct((profit / totalProfit) * 100);
}

function monotonicValueRelationship(entries: PricedEntry[]): string {
  const metrics = VALUE_BANDS.map((band) => groupMetrics(entries.filter((entry) => matchesBand(entry.valueRatio, band))))
    .filter((metrics) => metrics.selections >= LIMITED_SAMPLE);
  const roiValues = metrics.map((metrics) => metrics.roi ?? -Infinity);
  const aeValues = metrics.map((metrics) => metrics.ae ?? -Infinity);
  const roiMono = roiValues.every((value, index) => index === 0 || value >= roiValues[index - 1]!);
  const aeMono = aeValues.every((value, index) => index === 0 || value >= aeValues[index - 1]!);
  if (roiMono && aeMono) return "monotonic on both ROI and A/E";
  if (roiMono) return "monotonic on ROI only";
  if (aeMono) return "monotonic on A/E only";
  return "not monotonic";
}

function stressSurvivingBands(entries: PricedEntry[]): string[] {
  return VALUE_BANDS.flatMap((band) => {
    const group = entries.filter((entry) => matchesBand(entry.valueRatio, band));
    const metrics = groupMetrics(group);
    if ((metrics.roi ?? -Infinity) <= 0 && (metrics.ae ?? -Infinity) <= 1) return [];
    const biggest = biggestPricedWinner(group);
    const stressed = biggest
      ? group.filter((entry) => entry.row.features.targetRunnerId !== biggest.row.features.targetRunnerId)
      : group;
    const stressedMetrics = groupMetrics(stressed);
    return (stressedMetrics.roi ?? -Infinity) > 0 || (stressedMetrics.ae ?? -Infinity) > 1
      ? [band.label]
      : [];
  });
}

function calibrationSummary(metrics: GroupMetrics): string {
  const error = Math.abs(probabilityPct(metrics.calibrationError) ?? Infinity);
  if (error <= 2) return "reasonably calibrated";
  if (error <= 5) return "mildly miscalibrated";
  return "poorly calibrated";
}

function settledEntries(rows: RankedResearchRow[]): SettledEntry[] {
  return rows
    .map((row) => {
      const settlement = settleSelection(row.outcome);
      return settlement ? { row, settlement } : null;
    })
    .filter((entry): entry is SettledEntry => entry !== null);
}

function leadBandFor(entry: SettledEntry): Band | null {
  const lead = entry.row.turfPerformance?.gap ?? null;
  if (lead === null || !Number.isFinite(lead)) return null;
  if (lead < 2) return LEAD_BANDS[0]!;
  if (lead < 6) return LEAD_BANDS[1]!;
  if (lead < 10) return LEAD_BANDS[2]!;
  return LEAD_BANDS[3]!;
}

function fieldBandFor(entry: SettledEntry): Band | null {
  const fieldSize = entry.row.features.actualRunnerCount ?? entry.row.features.declaredRunnerCount;
  if (fieldSize === null || !Number.isFinite(fieldSize)) return null;
  if (fieldSize >= 2 && fieldSize <= 5) return FIELD_BANDS[0]!;
  if (fieldSize <= 8) return FIELD_BANDS[1]!;
  if (fieldSize <= 12) return FIELD_BANDS[2]!;
  return FIELD_BANDS[3]!;
}

function cellKey(leadBand: Band, fieldBand: Band): string {
  return `${leadBand.key}__${fieldBand.key}`;
}

function emptyStats(): CalibrationStats {
  return { selections: 0, winners: 0, probability: null, fairDecimal: null };
}

function matchesBand(value: number, band: ValueBand): boolean {
  if (band.minInclusive !== null && value < band.minInclusive) return false;
  return band.maxExclusive === null || value < band.maxExclusive;
}

function won(entry: SettledEntry): boolean {
  return entry.row.outcome.won === true;
}

function groupBy<T>(values: T[], keyFor: (value: T) => string): Array<[string, T[]]> {
  const groups = new Map<string, T[]>();
  for (const value of values) {
    const key = keyFor(value);
    groups.set(key, [...(groups.get(key) ?? []), value]);
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
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
  if (selections >= ADEQUATE_SAMPLE) return "adequate";
  if (selections >= LIMITED_SAMPLE) return "limited";
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

function brierNumber(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "n/a" : value.toFixed(4);
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
