import { writeFile } from "node:fs/promises";
import { settleSelection, type BacktestSettlement } from "@/lib/racing/backtest";
import { loadLatestBacktestFeatureCacheForYear } from "@/lib/racing/backtest-cache";
import { rankRows, type RankedResearchRow } from "@/lib/racing/research-rule";
import { TURF_PERFORMANCE_RATING_VERSION } from "@/lib/racing/turf-performance-rating";

type Year = "2025" | "2026";
type ModelName = "V2" | "V3";
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

type ValueBand = {
  key: string;
  label: string;
  minInclusive: number | null;
  maxExclusive: number | null;
};

type CalibrationStats = {
  selections: number;
  winners: number;
  probability: number | null;
  fairDecimal: number | null;
};

type V1Model = {
  global: CalibrationStats;
  lead: Map<string, CalibrationStats>;
  cell: Map<string, CalibrationStats>;
};

type TrainerAdjustment = {
  trainerBand: Band;
  selections: number;
  v1MeanPredicted: number | null;
  observedProbability: number | null;
  delta: number;
  applied: boolean;
};

type BestL3SpeedAdjustment = {
  rankBand: Band;
  selections: number;
  v2MeanPredicted: number | null;
  observedProbability: number | null;
  delta: number;
  applied: boolean;
};

type PricedEntry = SettledEntry & {
  leadBand: Band | null;
  fieldBand: Band | null;
  trainerBand: Band;
  bestL3SpeedRankBand: Band;
  v1Probability: number;
  v1FairDecimal: number;
  v1Source: Source;
  v1ModelKey: string;
  v1ValueRatio: number;
  v1ModelEdge: number;
  v2Probability: number;
  v2FairDecimal: number;
  v2TrainerDelta: number;
  v2ValueRatio: number;
  v2ModelEdge: number;
  v3Probability: number;
  v3FairDecimal: number;
  v3BestL3Delta: number;
  v3ValueRatio: number;
  v3ModelEdge: number;
};

type GroupMetrics = {
  selections: number;
  winners: number;
  predictedWins: number;
  observedWins: number;
  predictedWinRate: number | null;
  strike: number | null;
  calibrationError: number | null;
  roi: number | null;
  ae: number | null;
  averageSp: number | null;
  averageModelEdge: number | null;
  brier: number | null;
};

const OUTPUT_PATH = "/tmp/tpr-fair-price-v3.md";
const YEARS: Year[] = ["2025", "2026"];
const ADEQUATE_SAMPLE = 100;
const LIMITED_SAMPLE = 30;
const MIN_PROBABILITY = 0.02;
const MAX_PROBABILITY = 0.60;

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

const TRAINER_BANDS: Band[] = [
  { key: "trainer_lt_10", label: "<10%", order: 0 },
  { key: "trainer_10_149", label: "10-14.9%", order: 1 },
  { key: "trainer_15_199", label: "15-19.9%", order: 2 },
  { key: "trainer_gte_20", label: "20%+", order: 3 },
  { key: "trainer_missing", label: "missing/insufficient", order: 4 },
];

const BEST_L3_SPEED_RANK_BANDS: Band[] = [
  { key: "rank_1", label: "rank 1", order: 0 },
  { key: "rank_2", label: "rank 2", order: 1 },
  { key: "rank_3", label: "rank 3", order: 2 },
  { key: "rank_4_plus", label: "rank 4+", order: 3 },
  { key: "missing", label: "missing", order: 4 },
];

const VALUE_BANDS: ValueBand[] = [
  { key: "lt_090", label: "<0.90", minInclusive: null, maxExclusive: 0.9 },
  { key: "090_099", label: "0.90-0.99", minInclusive: 0.9, maxExclusive: 1 },
  { key: "100_109", label: "1.00-1.09", minInclusive: 1, maxExclusive: 1.1 },
  { key: "110_124", label: "1.10-1.24", minInclusive: 1.1, maxExclusive: 1.25 },
  { key: "125_149", label: "1.25-1.49", minInclusive: 1.25, maxExclusive: 1.5 },
  { key: "gte_150", label: "1.50+", minInclusive: 1.5, maxExclusive: null },
];

const CRITICAL_GROUPS: ValueBand[] = [
  { key: "lt_100", label: "<1.00", minInclusive: null, maxExclusive: 1 },
  { key: "gte_110", label: ">=1.10", minInclusive: 1.1, maxExclusive: null },
  { key: "gte_125", label: ">=1.25", minInclusive: 1.25, maxExclusive: null },
  { key: "gte_150", label: ">=1.50", minInclusive: 1.5, maxExclusive: null },
];

async function main() {
  const contexts = await Promise.all(YEARS.map(loadContext));
  const development = contextFor(contexts, "2025");
  const v1 = buildV1Model(development.entries);
  const v1DevelopmentEntries = priceV1Entries(development.entries, v1);
  const trainerAdjustments = buildTrainerAdjustments(v1DevelopmentEntries);
  const v2DevelopmentEntries = priceV2Entries(development.entries, v1, trainerAdjustments);
  const bestL3Adjustments = buildBestL3SpeedAdjustments(v2DevelopmentEntries);
  const priced = new Map<Year, PricedEntry[]>(
    contexts.map((context) => [context.year, priceV3Entries(context.entries, v1, trainerAdjustments, bestL3Adjustments)]),
  );
  const lines: string[] = [];

  writeReport(lines, contexts, v1, bestL3Adjustments, priced);
  await writeFile(OUTPUT_PATH, `${lines.join("\n")}\n`, "utf8");

  const holdout = priced.get("2026") ?? [];
  const v2Metrics = groupMetrics(holdout, "V2");
  const v3Metrics = groupMetrics(holdout, "V3");
  console.log(`Wrote ${OUTPUT_PATH}`);
  console.log(
    `2026 V2 error ${pp(probabilityPct(v2Metrics.calibrationError))}, Brier ${brierNumber(v2Metrics.brier)}; ` +
      `V3 error ${pp(probabilityPct(v3Metrics.calibrationError))}, Brier ${brierNumber(v3Metrics.brier)}`,
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

function writeReport(
  lines: string[],
  contexts: Context[],
  v1: V1Model,
  bestL3Adjustments: Map<string, BestL3SpeedAdjustment>,
  priced: Map<Year, PricedEntry[]>,
) {
  lines.push("# TPR Fair-Price V3 Diagnostic");
  lines.push("");
  lines.push("Diagnostic only. No production Research behavior, Today behavior, cache logic, importers, schema, filters, or TPR formula were changed.");
  lines.push("");
  lines.push("V2 uses frozen 2025 TPR lead x field-size probabilities plus the frozen trainer-band calibration delta. V3 adds only a frozen 2025 Best L3 speed-rank calibration delta to V2 probability.");
  lines.push("");

  writeV1Reconciliation(lines, contexts, v1);
  writeBestL3Deltas(lines, bestL3Adjustments);
  writeFrozenV3Definition(lines);
  writeOverallComparison(lines, contexts, priced);
  writeBestL3RankCalibration(lines, priced.get("2026") ?? []);
  writeValueRatioComparison(lines, priced);
  writeCriticalValueComparison(lines, priced.get("2026") ?? []);
  writeMarketShorterComparison(lines, priced.get("2026") ?? []);
  writeHotspot150(lines, priced.get("2026") ?? []);
  writeOutlierStress(lines, priced.get("2026") ?? []);
  writeCompactSummary(lines, priced.get("2026") ?? []);
  writeConclusion(lines, priced);
}

function writeV1Reconciliation(lines: string[], contexts: Context[], v1: V1Model) {
  lines.push("## V2 Reconciliation");
  lines.push("");
  table(lines, contexts.map((context) => ({
    year: yearLabel(context),
    "cache window": `${context.cacheFrom} to ${context.cacheTo}`,
    "actual coverage": `${context.actualFrom} to ${context.actualTo}`,
    "settled TPR rank-1 selections": context.entries.length,
    winners: context.entries.filter(won).length,
  })));
  lines.push("");
  lines.push(`Underlying V1 global 2025 fallback used inside V2: ${pct(probabilityPct(v1.global.probability))}, fair decimal ${number(v1.global.fairDecimal)} from ${v1.global.selections} selections.`);
  lines.push("");
}

function writeBestL3Deltas(lines: string[], adjustments: Map<string, BestL3SpeedAdjustment>) {
  lines.push("## 2025 Best-L3 Speed-Rank Calibration Deltas");
  lines.push("");
  lines.push(`Adjustment rule: V3 probability = clamp(V2 probability + Best-L3 speed-rank delta, ${MIN_PROBABILITY} to ${MAX_PROBABILITY}). Sparse rank groups below ${LIMITED_SAMPLE} selections receive zero adjustment.`);
  lines.push("");
  table(lines, BEST_L3_SPEED_RANK_BANDS.map((band) => {
    const adjustment = adjustments.get(band.key);
    if (!adjustment) throw new Error(`Missing Best L3 speed adjustment ${band.key}`);
    return {
      "Best L3 speed rank": band.label,
      selections: adjustment.selections,
      "V2 mean predicted": pct(probabilityPct(adjustment.v2MeanPredicted)),
      "observed win probability": pct(probabilityPct(adjustment.observedProbability)),
      "calibration delta": pp(probabilityPct(adjustment.delta)),
      applied: adjustment.applied ? "yes" : "no",
      sample: sampleLabel(adjustment.selections),
    };
  }));
  lines.push("");
}

function writeFrozenV3Definition(lines: string[]) {
  lines.push("## Frozen V3 Definition");
  lines.push("");
  numbered(lines, [
    "Assign V2 probability from the frozen lead x field-size model plus frozen trainer-band calibration delta.",
    "Assign Best L3 speed-rank group: rank 1, rank 2, rank 3, rank 4+, or missing.",
    "Add the frozen 2025 Best-L3 speed-rank calibration delta when the group is not sparse.",
    `Clamp final probability to ${MIN_PROBABILITY} through ${MAX_PROBABILITY}.`,
    "Convert the frozen probability to fair decimal odds as 1 / probability.",
  ]);
  lines.push("");
}

function writeOverallComparison(lines: string[], contexts: Context[], priced: Map<Year, PricedEntry[]>) {
  lines.push("## Overall V2 Vs V3");
  lines.push("");
  table(lines, contexts.flatMap((context) => {
    const entries = priced.get(context.year) ?? [];
    return (["V2", "V3"] as ModelName[]).map((model) => {
      const metrics = groupMetrics(entries, model);
      return {
        year: yearLabel(context),
        model,
        selections: metrics.selections,
        "mean predicted probability": pct(probabilityPct(metrics.predictedWinRate)),
        "observed strike": pct(probabilityPct(metrics.strike)),
        "calibration error": pp(probabilityPct(metrics.calibrationError)),
        "Brier score": brierNumber(metrics.brier),
        "predicted wins": number(metrics.predictedWins),
        "observed wins": metrics.observedWins,
      };
    });
  }));
  lines.push("");
}

function writeBestL3RankCalibration(lines: string[], entries: PricedEntry[]) {
  lines.push("## Best-L3 Speed-Rank Calibration: 2026 Holdout");
  lines.push("");
  table(lines, BEST_L3_SPEED_RANK_BANDS.map((band) => {
    const group = entries.filter((entry) => entry.bestL3SpeedRankBand.key === band.key);
    const v2Metrics = groupMetrics(group, "V2");
    const v3Metrics = groupMetrics(group, "V3");
    return {
      "Best L3 speed rank": band.label,
      selections: group.length,
      "V2 predicted probability": pct(probabilityPct(v2Metrics.predictedWinRate)),
      "V3 predicted probability": pct(probabilityPct(v3Metrics.predictedWinRate)),
      "observed probability": pct(probabilityPct(v3Metrics.strike)),
      "V2 calibration error": pp(probabilityPct(v2Metrics.calibrationError)),
      "V3 calibration error": pp(probabilityPct(v3Metrics.calibrationError)),
      "V2 Brier": brierNumber(v2Metrics.brier),
      "V3 Brier": brierNumber(v3Metrics.brier),
      sample: sampleLabel(group.length),
    };
  }));
  lines.push("");
}

function writeValueRatioComparison(lines: string[], priced: Map<Year, PricedEntry[]>) {
  for (const year of YEARS) {
    lines.push(`## Value-Ratio Bands: ${year === "2025" ? "2025 In-Sample Reference" : "2026 Holdout"}`);
    lines.push("");
    table(lines, (["V2", "V3"] as ModelName[]).flatMap((model) =>
      VALUE_BANDS.map((band) => {
        const group = entriesInValueBand(priced.get(year) ?? [], model, band);
        const metrics = groupMetrics(group, model);
        return {
          model,
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
      })
    ));
    lines.push("");
  }
}

function writeCriticalValueComparison(lines: string[], entries: PricedEntry[]) {
  lines.push("## Critical Apparent-Value Test: 2026 Holdout");
  lines.push("");
  table(lines, CRITICAL_GROUPS.flatMap((band) =>
    (["V2", "V3"] as ModelName[]).map((model) => {
      const group = entriesInValueBand(entries, model, band);
      const metrics = groupMetrics(group, model);
      return {
        group: band.label,
        model,
        selections: metrics.selections,
        "predicted win rate": pct(probabilityPct(metrics.predictedWinRate)),
        "observed win rate": pct(probabilityPct(metrics.strike)),
        "calibration error": pp(probabilityPct(metrics.calibrationError)),
        ROI: pct(metrics.roi),
        "A/E": number(metrics.ae),
        "avg model edge": number(metrics.averageModelEdge),
      };
    })
  ));
  lines.push("");
}

function writeMarketShorterComparison(lines: string[], entries: PricedEntry[]) {
  lines.push("## Market-Shorter-Than-Fair Comparison: 2026 Holdout");
  lines.push("");
  const shorter = CRITICAL_GROUPS[0]!;
  table(lines, (["V2", "V3"] as ModelName[]).map((model) => {
    const metrics = groupMetrics(entriesInValueBand(entries, model, shorter), model);
    return {
      model,
      selections: metrics.selections,
      "predicted win rate": pct(probabilityPct(metrics.predictedWinRate)),
      "observed win rate": pct(probabilityPct(metrics.strike)),
      "calibration error": pp(probabilityPct(metrics.calibrationError)),
      ROI: pct(metrics.roi),
      "A/E": number(metrics.ae),
    };
  }));
  lines.push("");
}

function writeOutlierStress(lines: string[], entries: PricedEntry[]) {
  lines.push("## Apparent-Value Stress: V3 2026");
  lines.push("");
  const triggered = VALUE_BANDS
    .map((band) => ({ band, group: entriesInValueBand(entries, "V3", band) }))
    .filter(({ group }) => {
      const metrics = groupMetrics(group, "V3");
      return (metrics.roi ?? -Infinity) > 0 || (metrics.ae ?? -Infinity) > 1;
    });
  if (triggered.length === 0) {
    lines.push("_No V3 2026 value-ratio band had positive ROI or A/E >1.0._");
    lines.push("");
    return;
  }
  table(lines, triggered.map(({ band, group }) => {
    const metrics = groupMetrics(group, "V3");
    const biggest = biggestPricedWinner(group);
    const stressed = biggest
      ? group.filter((entry) => entry.row.features.targetRunnerId !== biggest.row.features.targetRunnerId)
      : group;
    const stressedMetrics = groupMetrics(stressed, "V3");
    return {
      "value ratio band": band.label,
      selections: metrics.selections,
      ROI: pct(metrics.roi),
      "A/E": number(metrics.ae),
      "calibration error": pp(probabilityPct(metrics.calibrationError)),
      "biggest winner": biggest?.row.features.horseName ?? "n/a",
      "biggest winner SP": number(biggest?.settlement.settlementOddsDecimal ?? null),
      "largest winner P/L contribution": contribution(biggest?.settlement.profitLoss ?? 0, metrics),
      "stressed ROI": pct(stressedMetrics.roi),
      "stressed A/E": number(stressedMetrics.ae),
      "stressed calibration error": pp(probabilityPct(stressedMetrics.calibrationError)),
    };
  }));
  lines.push("");
}

function writeCompactSummary(lines: string[], entries: PricedEntry[]) {
  lines.push("## Compact 2026 Summary");
  lines.push("");
  const rows = [
    ["Overall calibration error", metric(entries, "V2", null, "calibration"), metric(entries, "V3", null, "calibration")],
    ["Brier score", metric(entries, "V2", null, "brier"), metric(entries, "V3", null, "brier")],
    ["<1.0 calibration error", metric(entries, "V2", CRITICAL_GROUPS[0]!, "calibration"), metric(entries, "V3", CRITICAL_GROUPS[0]!, "calibration")],
    [">=1.10 calibration error", metric(entries, "V2", CRITICAL_GROUPS[1]!, "calibration"), metric(entries, "V3", CRITICAL_GROUPS[1]!, "calibration")],
    [">=1.25 calibration error", metric(entries, "V2", CRITICAL_GROUPS[2]!, "calibration"), metric(entries, "V3", CRITICAL_GROUPS[2]!, "calibration")],
    [">=1.50 calibration error", metric(entries, "V2", CRITICAL_GROUPS[3]!, "calibration"), metric(entries, "V3", CRITICAL_GROUPS[3]!, "calibration")],
    [">=1.10 ROI", metric(entries, "V2", CRITICAL_GROUPS[1]!, "roi"), metric(entries, "V3", CRITICAL_GROUPS[1]!, "roi")],
    [">=1.25 ROI", metric(entries, "V2", CRITICAL_GROUPS[2]!, "roi"), metric(entries, "V3", CRITICAL_GROUPS[2]!, "roi")],
    [">=1.50 ROI", metric(entries, "V2", CRITICAL_GROUPS[3]!, "roi"), metric(entries, "V3", CRITICAL_GROUPS[3]!, "roi")],
    [">=1.10 A/E", metric(entries, "V2", CRITICAL_GROUPS[1]!, "ae"), metric(entries, "V3", CRITICAL_GROUPS[1]!, "ae")],
    [">=1.25 A/E", metric(entries, "V2", CRITICAL_GROUPS[2]!, "ae"), metric(entries, "V3", CRITICAL_GROUPS[2]!, "ae")],
    [">=1.50 A/E", metric(entries, "V2", CRITICAL_GROUPS[3]!, "ae"), metric(entries, "V3", CRITICAL_GROUPS[3]!, "ae")],
  ];
  table(lines, rows.map(([name, v2, v3]) => ({ metric: name, V2: v2, V3: v3 })));
  lines.push("");
}

function writeHotspot150(lines: string[], entries: PricedEntry[]) {
  lines.push("## V3 1.50+ Hot Spots By Best-L3 Speed Rank");
  lines.push("");
  const group150 = entriesInValueBand(entries, "V3", CRITICAL_GROUPS[3]!);
  table(lines, BEST_L3_SPEED_RANK_BANDS.map((band) => {
    const group = group150.filter((entry) => entry.bestL3SpeedRankBand.key === band.key);
    const metrics = groupMetrics(group, "V3");
    return {
      "Best L3 speed rank": band.label,
      selections: metrics.selections,
      "predicted win rate": pct(probabilityPct(metrics.predictedWinRate)),
      "observed win rate": pct(probabilityPct(metrics.strike)),
      "calibration error": pp(probabilityPct(metrics.calibrationError)),
      ROI: pct(metrics.roi),
      "A/E": number(metrics.ae),
    };
  }));
  lines.push("");
}

function writeConclusion(lines: string[], priced: Map<Year, PricedEntry[]>) {
  lines.push("## Conclusion");
  lines.push("");
  const holdout = priced.get("2026") ?? [];
  const v2Overall = groupMetrics(holdout, "V2");
  const v3Overall = groupMetrics(holdout, "V3");
  const v2Short = groupMetrics(entriesInValueBand(holdout, "V2", CRITICAL_GROUPS[0]!), "V2");
  const v3Short = groupMetrics(entriesInValueBand(holdout, "V3", CRITICAL_GROUPS[0]!), "V3");
  const v2Gte110 = groupMetrics(entriesInValueBand(holdout, "V2", CRITICAL_GROUPS[1]!), "V2");
  const v3Gte110 = groupMetrics(entriesInValueBand(holdout, "V3", CRITICAL_GROUPS[1]!), "V3");
  const v2Gte125 = groupMetrics(entriesInValueBand(holdout, "V2", CRITICAL_GROUPS[2]!), "V2");
  const v3Gte125 = groupMetrics(entriesInValueBand(holdout, "V3", CRITICAL_GROUPS[2]!), "V3");
  const v2Gte150 = groupMetrics(entriesInValueBand(holdout, "V2", CRITICAL_GROUPS[3]!), "V2");
  const v3Gte150 = groupMetrics(entriesInValueBand(holdout, "V3", CRITICAL_GROUPS[3]!), "V3");
  const v2Mono = monotonicValueRelationship(holdout, "V2");
  const v3Mono = monotonicValueRelationship(holdout, "V3");
  const stressSurvivors = stressSurvivingBands(holdout);
  const brierDelta = diff(v2Overall.brier, v3Overall.brier);
  const overallErrorImproved = abs(v3Overall.calibrationError) < abs(v2Overall.calibrationError);
  const brierImproved = brierDelta !== null && brierDelta > 0;
  const valueOverconfidenceImproved =
    abs(v3Gte110.calibrationError) < abs(v2Gte110.calibrationError) &&
    abs(v3Gte125.calibrationError) < abs(v2Gte125.calibrationError);
  const shortUnderestimationImproved = abs(v3Short.calibrationError) < abs(v2Short.calibrationError);
  const decision = classifyV3({
    overallErrorImproved,
    brierDelta,
    valueOverconfidenceImproved,
    shortUnderestimationImproved,
    stressSurvivors,
  });

  numbered(lines, [
    `Best L3 speed rank ${overallErrorImproved ? "improves" : "does not improve"} overall 2026 calibration: V2 ${pp(probabilityPct(v2Overall.calibrationError))}, V3 ${pp(probabilityPct(v3Overall.calibrationError))}.`,
    `Brier score ${brierImproved ? "improves" : "does not improve"}: V2 ${brierNumber(v2Overall.brier)}, V3 ${brierNumber(v3Overall.brier)}, delta ${brierNumber(brierDelta)}.`,
    `Apparent-value overconfidence: >=1.10 error V2 ${pp(probabilityPct(v2Gte110.calibrationError))} vs V3 ${pp(probabilityPct(v3Gte110.calibrationError))}; >=1.25 error V2 ${pp(probabilityPct(v2Gte125.calibrationError))} vs V3 ${pp(probabilityPct(v3Gte125.calibrationError))}; >=1.50 error V2 ${pp(probabilityPct(v2Gte150.calibrationError))} vs V3 ${pp(probabilityPct(v3Gte150.calibrationError))}.`,
    `Market-shorter-than-fair underestimation: V2 ${pp(probabilityPct(v2Short.calibrationError))}, V3 ${pp(probabilityPct(v3Short.calibrationError))}.`,
    `Value-ratio monotonicity: V2 ${v2Mono}; V3 ${v3Mono}.`,
    `Stress survival: ${stressSurvivors.length === 0 ? "no V3 value band remains credible after biggest-winner stress" : stressSurvivors.join("; ")}.`,
    `Decision: ${decision}.`,
    decision === "materially better than V2"
      ? "Next step: OR rank / OR movement remains the next plausible controlled feature, but still not production use."
      : "Next step: Best L3 speed rank does not help enough here; OR rank / OR movement remains plausible, but avoid more dimensions until the value structure is stronger.",
  ]);
}

function buildV1Model(entries: SettledEntry[]): V1Model {
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

function priceV1Entries(entries: SettledEntry[], v1: V1Model): Array<SettledEntry & {
  leadBand: Band | null;
  fieldBand: Band | null;
  trainerBand: Band;
  v1Probability: number;
  v1FairDecimal: number;
  v1Source: Source;
  v1ModelKey: string;
}> {
  return entries.map((entry) => {
    const leadBand = leadBandFor(entry);
    const fieldBand = fieldBandFor(entry);
    const trainerBand = trainerBandFor(entry);
    const assigned = v1AssignmentForBands(leadBand, fieldBand, v1);
    const probability = assigned.probability ?? v1.global.probability ?? 0;
    return {
      ...entry,
      leadBand,
      fieldBand,
      trainerBand,
      v1Probability: probability,
      v1FairDecimal: 1 / probability,
      v1Source: assigned.source,
      v1ModelKey: assigned.key,
    };
  });
}

function buildTrainerAdjustments(
  entries: ReturnType<typeof priceV1Entries>,
): Map<string, TrainerAdjustment> {
  return new Map(TRAINER_BANDS.map((band) => {
    const group = entries.filter((entry) => entry.trainerBand.key === band.key);
    const stats = calibrationStats(group);
    const v1MeanPredicted = average(group.map((entry) => entry.v1Probability));
    const rawDelta = diff(stats.probability, v1MeanPredicted) ?? 0;
    const applied = group.length >= LIMITED_SAMPLE;
    return [band.key, {
      trainerBand: band,
      selections: group.length,
      v1MeanPredicted,
      observedProbability: stats.probability,
      delta: applied ? rawDelta : 0,
      applied,
    }];
  }));
}

function priceV2Entries(
  entries: SettledEntry[],
  v1: V1Model,
  adjustments: Map<string, TrainerAdjustment>,
): Array<ReturnType<typeof priceV1Entries>[number] & {
  bestL3SpeedRankBand: Band;
  v1ValueRatio: number;
  v1ModelEdge: number;
  v2Probability: number;
  v2FairDecimal: number;
  v2TrainerDelta: number;
  v2ValueRatio: number;
  v2ModelEdge: number;
}> {
  return priceV1Entries(entries, v1).map((entry) => {
    const adjustment = adjustments.get(entry.trainerBand.key);
    const delta = adjustment?.delta ?? 0;
    const v2Probability = clamp(entry.v1Probability + delta, MIN_PROBABILITY, MAX_PROBABILITY);
    const v2FairDecimal = 1 / v2Probability;
    return {
      ...entry,
      v1ValueRatio: entry.settlement.settlementOddsDecimal / entry.v1FairDecimal,
      v1ModelEdge: (entry.v1Probability * entry.settlement.settlementOddsDecimal) - 1,
      bestL3SpeedRankBand: bestL3SpeedRankBandFor(entry),
      v2Probability,
      v2FairDecimal,
      v2TrainerDelta: delta,
      v2ValueRatio: entry.settlement.settlementOddsDecimal / v2FairDecimal,
      v2ModelEdge: (v2Probability * entry.settlement.settlementOddsDecimal) - 1,
    };
  });
}

function buildBestL3SpeedAdjustments(
  entries: ReturnType<typeof priceV2Entries>,
): Map<string, BestL3SpeedAdjustment> {
  return new Map(BEST_L3_SPEED_RANK_BANDS.map((band) => {
    const group = entries.filter((entry) => entry.bestL3SpeedRankBand.key === band.key);
    const stats = calibrationStats(group);
    const v2MeanPredicted = average(group.map((entry) => entry.v2Probability));
    const rawDelta = diff(stats.probability, v2MeanPredicted) ?? 0;
    const applied = group.length >= LIMITED_SAMPLE;
    return [band.key, {
      rankBand: band,
      selections: group.length,
      v2MeanPredicted,
      observedProbability: stats.probability,
      delta: applied ? rawDelta : 0,
      applied,
    }];
  }));
}

function priceV3Entries(
  entries: SettledEntry[],
  v1: V1Model,
  trainerAdjustments: Map<string, TrainerAdjustment>,
  bestL3Adjustments: Map<string, BestL3SpeedAdjustment>,
): PricedEntry[] {
  return priceV2Entries(entries, v1, trainerAdjustments).map((entry) => {
    const adjustment = bestL3Adjustments.get(entry.bestL3SpeedRankBand.key);
    const delta = adjustment?.delta ?? 0;
    const v3Probability = clamp(entry.v2Probability + delta, MIN_PROBABILITY, MAX_PROBABILITY);
    const v3FairDecimal = 1 / v3Probability;
    return {
      ...entry,
      v3Probability,
      v3FairDecimal,
      v3BestL3Delta: delta,
      v3ValueRatio: entry.settlement.settlementOddsDecimal / v3FairDecimal,
      v3ModelEdge: (v3Probability * entry.settlement.settlementOddsDecimal) - 1,
    };
  });
}

function v1AssignmentForBands(leadBand: Band | null, fieldBand: Band | null, v1: V1Model): {
  key: string;
  source: Source;
  probability: number | null;
} {
  if (leadBand && fieldBand) {
    const key = cellKey(leadBand, fieldBand);
    const cellStats = v1.cell.get(key) ?? emptyStats();
    if (cellStats.selections >= ADEQUATE_SAMPLE && cellStats.probability !== null) {
      return {
        key: `${leadBand.label} x ${fieldBand.label}`,
        source: "exact lead x field cell",
        probability: cellStats.probability,
      };
    }
  }
  if (leadBand) {
    const leadStats = v1.lead.get(leadBand.key) ?? emptyStats();
    if (leadStats.probability !== null) {
      return {
        key: `lead fallback ${leadBand.label}`,
        source: "lead fallback",
        probability: leadStats.probability,
      };
    }
  }
  return { key: "global fallback", source: "global fallback", probability: v1.global.probability };
}

function groupMetrics(entries: PricedEntry[], model: ModelName): GroupMetrics {
  const winners = entries.filter(won).length;
  const predictedWins = entries.reduce((total, entry) => total + probabilityFor(entry, model), 0);
  const stakes = entries.length;
  const profitLoss = entries.reduce((total, entry) => total + entry.settlement.profitLoss, 0);
  const expectedWins = entries.reduce((total, entry) => total + (1 / entry.settlement.settlementOddsDecimal), 0);
  const strike = stakes === 0 ? null : winners / stakes;
  const predictedWinRate = stakes === 0 ? null : predictedWins / stakes;
  return {
    selections: stakes,
    winners,
    predictedWins,
    observedWins: winners,
    predictedWinRate,
    strike,
    calibrationError: diff(strike, predictedWinRate),
    roi: stakes === 0 ? null : (profitLoss / stakes) * 100,
    ae: expectedWins === 0 ? null : winners / expectedWins,
    averageSp: average(entries.map((entry) => entry.settlement.settlementOddsDecimal)),
    averageModelEdge: average(entries.map((entry) => modelEdgeFor(entry, model))),
    brier: stakes === 0 ? null : entries.reduce(
      (total, entry) => total + ((won(entry) ? 1 : 0) - probabilityFor(entry, model)) ** 2,
      0,
    ) / stakes,
  };
}

function metric(
  entries: PricedEntry[],
  model: ModelName,
  band: ValueBand | null,
  type: "calibration" | "brier" | "roi" | "ae",
): string {
  const metrics = groupMetrics(band ? entriesInValueBand(entries, model, band) : entries, model);
  if (type === "calibration") return pp(probabilityPct(metrics.calibrationError));
  if (type === "brier") return brierNumber(metrics.brier);
  if (type === "roi") return pct(metrics.roi);
  return number(metrics.ae);
}

function entriesInValueBand(entries: PricedEntry[], model: ModelName, band: ValueBand): PricedEntry[] {
  return entries.filter((entry) => matchesBand(valueRatioFor(entry, model), band));
}

function biggestPricedWinner(entries: PricedEntry[]): PricedEntry | null {
  return entries
    .filter(won)
    .sort((left, right) => right.settlement.settlementOddsDecimal - left.settlement.settlementOddsDecimal)[0] ?? null;
}

function stressSurvivingBands(entries: PricedEntry[]): string[] {
  return VALUE_BANDS.flatMap((band) => {
    const group = entriesInValueBand(entries, "V3", band);
    const metrics = groupMetrics(group, "V3");
    if ((metrics.roi ?? -Infinity) <= 0 && (metrics.ae ?? -Infinity) <= 1) return [];
    const biggest = biggestPricedWinner(group);
    const stressed = biggest
      ? group.filter((entry) => entry.row.features.targetRunnerId !== biggest.row.features.targetRunnerId)
      : group;
    const stressedMetrics = groupMetrics(stressed, "V3");
    return (stressedMetrics.roi ?? -Infinity) > 0 || (stressedMetrics.ae ?? -Infinity) > 1
      ? [band.label]
      : [];
  });
}

function monotonicValueRelationship(entries: PricedEntry[], model: ModelName): string {
  const metrics = VALUE_BANDS.map((band) => groupMetrics(entriesInValueBand(entries, model, band), model))
    .filter((item) => item.selections >= LIMITED_SAMPLE);
  const roiValues = metrics.map((item) => item.roi ?? -Infinity);
  const aeValues = metrics.map((item) => item.ae ?? -Infinity);
  const roiMono = roiValues.every((value, index) => index === 0 || value >= roiValues[index - 1]!);
  const aeMono = aeValues.every((value, index) => index === 0 || value >= aeValues[index - 1]!);
  if (roiMono && aeMono) return "monotonic on both ROI and A/E";
  if (roiMono) return "monotonic on ROI only";
  if (aeMono) return "monotonic on A/E only";
  return "not monotonic";
}

function classifyV3(input: {
  overallErrorImproved: boolean;
  brierDelta: number | null;
  valueOverconfidenceImproved: boolean;
  shortUnderestimationImproved: boolean;
  stressSurvivors: string[];
}): string {
  const materialBrier = input.brierDelta !== null && input.brierDelta > 0.001;
  if (input.overallErrorImproved && materialBrier && input.valueOverconfidenceImproved && input.shortUnderestimationImproved) {
    return input.stressSurvivors.length > 0 ? "materially better than V2" : "slightly better but not enough";
  }
  if (input.overallErrorImproved || materialBrier || input.valueOverconfidenceImproved || input.shortUnderestimationImproved) {
    return "slightly better but not enough";
  }
  if (input.brierDelta !== null && input.brierDelta < -0.001) return "worse / unstable";
  return "no meaningful improvement";
}

function contribution(profit: number, metrics: GroupMetrics): string {
  if (metrics.roi === null || metrics.selections === 0) return "n/a";
  const totalProfit = (metrics.roi / 100) * metrics.selections;
  if (totalProfit === 0) return "n/a";
  return pct((profit / totalProfit) * 100);
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

function trainerBandFor(entry: SettledEntry): Band {
  const value = entry.row.features.trainerPriorWinRate;
  if (value === null || !Number.isFinite(value)) return TRAINER_BANDS[4]!;
  if (value < 10) return TRAINER_BANDS[0]!;
  if (value < 15) return TRAINER_BANDS[1]!;
  if (value < 20) return TRAINER_BANDS[2]!;
  return TRAINER_BANDS[3]!;
}

function bestL3SpeedRankBandFor(entry: SettledEntry): Band {
  const rank = entry.row.ranks.bestSpeedLast3 ?? null;
  if (rank === null) return BEST_L3_SPEED_RANK_BANDS[4]!;
  if (rank === 1) return BEST_L3_SPEED_RANK_BANDS[0]!;
  if (rank === 2) return BEST_L3_SPEED_RANK_BANDS[1]!;
  if (rank === 3) return BEST_L3_SPEED_RANK_BANDS[2]!;
  return BEST_L3_SPEED_RANK_BANDS[3]!;
}

function probabilityFor(entry: PricedEntry, model: ModelName): number {
  return model === "V2" ? entry.v2Probability : entry.v3Probability;
}

function valueRatioFor(entry: PricedEntry, model: ModelName): number {
  return model === "V2" ? entry.v2ValueRatio : entry.v3ValueRatio;
}

function modelEdgeFor(entry: PricedEntry, model: ModelName): number {
  return model === "V2" ? entry.v2ModelEdge : entry.v3ModelEdge;
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

function abs(value: number | null): number {
  return value === null || !Number.isFinite(value) ? Infinity : Math.abs(value);
}

function diff(left: number | null, right: number | null): number | null {
  return left === null || right === null ? null : left - right;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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
