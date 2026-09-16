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
  entries: PricedEntry[];
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

type Group = {
  key: string;
  label: string;
  minInclusive: number | null;
  maxExclusive: number | null;
};

type CalibrationStats = {
  selections: number;
  winners: number;
  probability: number | null;
};

type V1Model = {
  global: CalibrationStats;
  lead: Map<string, CalibrationStats>;
  cell: Map<string, CalibrationStats>;
};

type TrainerAdjustment = {
  selections: number;
  delta: number;
};

type PricedEntry = SettledEntry & {
  leadBand: Band | null;
  fieldBand: Band | null;
  trainerBand: Band;
  probability: number;
  fairDecimal: number;
  source: Source;
  valueRatio: number;
  modelEdge: number;
  disagreementGroup: Group;
};

type Metrics = {
  selections: number;
  winners: number;
  strike: number | null;
  predictedWinRate: number | null;
  calibrationError: number | null;
  averageFair: number | null;
  averageSp: number | null;
  roi: number | null;
  ae: number | null;
};

type FeatureFamily = {
  key: string;
  title: string;
  buckets: Band[];
  bucketFor: (entry: PricedEntry) => Band;
  available: boolean;
  unavailableReason?: string;
};

const OUTPUT_PATH = "/tmp/tpr-fair-price-disagreement.md";
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

const DISAGREEMENT_GROUPS: Group[] = [
  { key: "much_shorter", label: "market much shorter than fair (<0.75)", minInclusive: null, maxExclusive: 0.75 },
  { key: "moderately_shorter", label: "market moderately shorter (0.75-0.99)", minInclusive: 0.75, maxExclusive: 1 },
  { key: "roughly_fair", label: "roughly fair (1.00-1.24)", minInclusive: 1, maxExclusive: 1.25 },
  { key: "moderately_bigger", label: "market moderately bigger (1.25-1.49)", minInclusive: 1.25, maxExclusive: 1.5 },
  { key: "much_bigger", label: "market much bigger (1.50+)", minInclusive: 1.5, maxExclusive: null },
];

const FOCUS_GROUP_KEYS = new Set(["much_shorter", "roughly_fair", "much_bigger"]);

async function main() {
  const rawContexts = await Promise.all(YEARS.map(loadRawContext));
  const development = rawContexts.find((context) => context.year === "2025");
  if (!development) throw new Error("Missing 2025 development context");
  const v1 = buildV1Model(development.entries);
  const adjustments = buildTrainerAdjustments(priceV1Entries(development.entries, v1));
  const contexts = rawContexts.map((context) => ({
    ...context,
    entries: priceEntries(context.entries, v1, adjustments),
  }));
  const families = featureFamilies();
  const lines: string[] = [];

  writeReport(lines, contexts, families);
  await writeFile(OUTPUT_PATH, `${lines.join("\n")}\n`, "utf8");

  console.log(`Wrote ${OUTPUT_PATH}`);
  const holdout = contexts.find((context) => context.year === "2026")!;
  for (const key of ["much_shorter", "much_bigger"]) {
    const group = DISAGREEMENT_GROUPS.find((item) => item.key === key)!;
    const metrics = metricsFor(holdout.entries.filter((entry) => entry.disagreementGroup.key === key));
    console.log(`${group.label}: selections ${metrics.selections}, strike ${pct(probabilityPct(metrics.strike))}, ROI ${pct(metrics.roi)}, A/E ${number(metrics.ae)}`);
  }
}

async function loadRawContext(year: Year): Promise<Omit<Context, "entries"> & { entries: SettledEntry[] }> {
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

function writeReport(lines: string[], contexts: Context[], families: FeatureFamily[]) {
  lines.push("# TPR Fair-Price V2 Market Disagreement Diagnostic");
  lines.push("");
  lines.push("Diagnostic only. V2 probabilities are reused unchanged: lead x field base probability plus frozen 2025 trainer-band calibration delta. No model fitting, threshold tuning, production Research, Today, cache, importer, schema, or TPR changes.");
  lines.push("");

  writeCoverage(lines, contexts);
  writeDisagreementSummary(lines, contexts);
  for (const family of families) {
    writeFeatureFamily(lines, contexts, family);
  }
  writeUnavailable(lines, families);
  writeSeparationSummary(lines, contexts, families);
  writeReplication(lines, contexts, families);
  writeCalibrationHotspots(lines, contexts, families);
  writeConclusion(lines, contexts, families);
}

function writeCoverage(lines: string[], contexts: Context[]) {
  lines.push("## Coverage");
  lines.push("");
  table(lines, contexts.map((context) => ({
    year: yearLabel(context),
    "cache window": `${context.cacheFrom} to ${context.cacheTo}`,
    "actual coverage": `${context.actualFrom} to ${context.actualTo}`,
    selections: context.entries.length,
    winners: context.entries.filter(won).length,
  })));
  lines.push("");
}

function writeDisagreementSummary(lines: string[], contexts: Context[]) {
  lines.push("## Disagreement-Group Summary");
  lines.push("");
  table(lines, contexts.flatMap((context) =>
    DISAGREEMENT_GROUPS.map((group) => {
      const entries = context.entries.filter((entry) => entry.disagreementGroup.key === group.key);
      const metrics = metricsFor(entries);
      return {
        year: yearLabel(context),
        group: group.label,
        selections: metrics.selections,
        winners: metrics.winners,
        strike: pct(probabilityPct(metrics.strike)),
        "V2 predicted win rate": pct(probabilityPct(metrics.predictedWinRate)),
        "calibration error": pp(probabilityPct(metrics.calibrationError)),
        "avg fair odds": number(metrics.averageFair),
        "avg SP": number(metrics.averageSp),
        ROI: pct(metrics.roi),
        "A/E": number(metrics.ae),
      };
    })
  ));
  lines.push("");
}

function writeFeatureFamily(lines: string[], contexts: Context[], family: FeatureFamily) {
  lines.push(`## ${family.title}`);
  lines.push("");
  if (!family.available) {
    lines.push(`Unavailable in current v4 feature cache: ${family.unavailableReason ?? "field not present"}.`);
    lines.push("");
    return;
  }
  table(lines, contexts.flatMap((context) =>
    DISAGREEMENT_GROUPS
      .filter((group) => FOCUS_GROUP_KEYS.has(group.key))
      .flatMap((group) => {
        const groupEntries = context.entries.filter((entry) => entry.disagreementGroup.key === group.key);
        return family.buckets.map((bucket) => {
          const entries = groupEntries.filter((entry) => family.bucketFor(entry).key === bucket.key);
          const metrics = metricsFor(entries);
          return {
            year: yearLabel(context),
            group: group.label,
            bucket: bucket.label,
            selections: metrics.selections,
            share: pct(groupEntries.length === 0 ? null : (entries.length / groupEntries.length) * 100),
            strike: pct(probabilityPct(metrics.strike)),
            "A/E": number(metrics.ae),
            ROI: pct(metrics.roi),
          };
        });
      })
  ));
  lines.push("");
}

function writeUnavailable(lines: string[], families: FeatureFamily[]) {
  const unavailable = families.filter((family) => !family.available);
  if (unavailable.length === 0) return;
  lines.push("## Unavailable Requested Families");
  lines.push("");
  table(lines, unavailable.map((family) => ({
    family: family.title,
    reason: family.unavailableReason ?? "not exposed by current cached feature rows",
  })));
  lines.push("");
}

function writeSeparationSummary(lines: string[], contexts: Context[], families: FeatureFamily[]) {
  lines.push("## Feature Separation Summary");
  lines.push("");
  table(lines, families
    .filter((family) => family.available)
    .flatMap((family) => contexts.map((context) => strongestDifferenceRow(context, family)))
    .filter((row) => row !== null));
  lines.push("");
}

function writeReplication(lines: string[], contexts: Context[], families: FeatureFamily[]) {
  lines.push("## 2025 Vs 2026 Replication");
  lines.push("");
  table(lines, families
    .filter((family) => family.available)
    .map((family) => replicationRow(contexts, family)));
  lines.push("");
}

function writeCalibrationHotspots(lines: string[], contexts: Context[], families: FeatureFamily[]) {
  lines.push("## Calibration Hot Spots");
  lines.push("");
  lines.push("Rows are buckets materially over-represented in the 2026 `1.50+` market-bigger group, plus the corresponding `<0.75` market-shorter calibration where useful.");
  lines.push("");
  const context2026 = contextFor(contexts, "2026");
  const hotFamilies = families.filter((family) => family.available);
  const rows = hotFamilies.flatMap((family) => {
    const differences = bucketDifferences(context2026, family)
      .filter((item) => item.diffPp >= 8 && item.biggerShare >= 10)
      .sort((left, right) => right.diffPp - left.diffPp)
      .slice(0, 3);
    return differences.flatMap((item) => ["much_bigger", "much_shorter"].map((groupKey) => {
      const group = DISAGREEMENT_GROUPS.find((candidate) => candidate.key === groupKey)!;
      const entries = context2026.entries
        .filter((entry) => entry.disagreementGroup.key === groupKey)
        .filter((entry) => family.bucketFor(entry).key === item.bucket.key);
      const metrics = metricsFor(entries);
      return {
        family: family.title,
        bucket: item.bucket.label,
        group: group.label,
        selections: metrics.selections,
        "V2 predicted win rate": pct(probabilityPct(metrics.predictedWinRate)),
        "observed win rate": pct(probabilityPct(metrics.strike)),
        "calibration error": pp(probabilityPct(metrics.calibrationError)),
        "A/E": number(metrics.ae),
        ROI: pct(metrics.roi),
      };
    }));
  });
  table(lines, rows);
  lines.push("");
}

function writeConclusion(lines: string[], contexts: Context[], families: FeatureFamily[]) {
  lines.push("## Conclusion");
  lines.push("");
  const context2026 = contextFor(contexts, "2026");
  const context2025 = contextFor(contexts, "2025");
  const top2026 = topDifferences(context2026, families).slice(0, 5);
  const topStable = top2026.filter((item) => replicationFor(context2025, context2026, item.family, item.bucket).startsWith("repeats"));
  const muchShorter = metricsFor(context2026.entries.filter((entry) => entry.disagreementGroup.key === "much_shorter"));
  const muchBigger = metricsFor(context2026.entries.filter((entry) => entry.disagreementGroup.key === "much_bigger"));
  const limitedHistory = familyByKey(families, "history_depth");
  const orMovement = familyByKey(families, "or_movement");
  const rankFamilies = ["latest_speed_rank", "best_l3_speed_rank", "latest_perf_rank", "best_l3_perf_rank"].map((key) => familyByKey(families, key));
  const jockey = familyByKey(families, "jockey_win_rate");
  const courseAvailable = families.some((family) => family.key === "course_form" && family.available);
  const candidate = topStable[0] ?? top2026[0] ?? null;

  numbered(lines, [
    `Market much-shorter runners in 2026: ${muchShorter.selections} selections, strike ${pct(probabilityPct(muchShorter.strike))}, predicted ${pct(probabilityPct(muchShorter.predictedWinRate))}, A/E ${number(muchShorter.ae)}, ROI ${pct(muchShorter.roi)}.`,
    `Market much-bigger runners in 2026: ${muchBigger.selections} selections, strike ${pct(probabilityPct(muchBigger.strike))}, predicted ${pct(probabilityPct(muchBigger.predictedWinRate))}, A/E ${number(muchBigger.ae)}, ROI ${pct(muchBigger.roi)}.`,
    `Largest 2026 distribution differences: ${top2026.map((item) => `${item.family.title}=${item.bucket.label} (${pp(item.diffPp)})`).join("; ") || "none"}.`,
    `Stable repeating differences: ${topStable.map((item) => `${item.family.title}=${item.bucket.label}`).join("; ") || "none of the largest differences repeat strongly"}.`,
    `Sparse/limited-history concentration: ${limitedHistory ? summaryForFamily(contexts, limitedHistory) : "not available"}.`,
    `OR movement: ${orMovement ? summaryForFamily(contexts, orMovement) : "not available"}.`,
    `Recent speed/performance ranks: ${rankFamilies.filter(Boolean).map((family) => summaryForFamily(contexts, family!)).join(" ") || "not available"}.`,
    `Jockey strength: ${jockey ? summaryForFamily(contexts, jockey) : "not available"}.`,
    `Course/C&D form: ${courseAvailable ? "available" : "not available in current cached feature rows, so not assessed"}.`,
    `Most plausible explanation for V2's 1.50+ calibration failure: ${candidate ? `${candidate.family.title}, especially ${candidate.bucket.label}` : "no single stable family dominates; market disagreement may be multi-factor or price/noise driven"}.`,
    `Best controlled V3 diagnostic candidate: ${candidate ? candidate.family.title : "none clear from this profile"}.`,
  ]);
}

function featureFamilies(): FeatureFamily[] {
  const missing = (title: string, reason: string): FeatureFamily => ({
    key: title.toLowerCase().replaceAll(/\W+/g, "_"),
    title,
    buckets: [],
    available: false,
    unavailableReason: reason,
    bucketFor: () => ({ key: "missing", label: "missing", order: 0 }),
  });
  return [
    family("official_rating_presence", "Official Rating Presence", ["present", "missing"], (entry) => entry.row.features.officialRating === null ? "missing" : "present"),
    family("official_rating_rank", "Official Rating Rank", ["rank 1", "rank 2", "rank 3", "rank 4+", "missing"], (entry) => rankBucket(entry.row.ranks.officialRating ?? null)),
    family("or_movement", "OR Movement: Today OR Minus Latest OR", ["down 5+", "down 2-4", "within +/-1", "up 2-4", "up 5+", "missing"], orMovementBucket),
    missing("Class Movement", "current cache exposes current race class only, not previous-run class"),
    family("latest_speed_rank", "Latest Speed Rank", ["rank 1", "rank 2", "rank 3", "rank 4+", "missing"], (entry) => rankBucket(entry.row.ranks.latestSpeedRating ?? null)),
    family("best_l3_speed_rank", "Best L3 Speed Rank", ["rank 1", "rank 2", "rank 3", "rank 4+", "missing"], (entry) => rankBucket(entry.row.ranks.bestSpeedLast3 ?? null)),
    family("latest_perf_rank", "Latest Performance Rank", ["rank 1", "rank 2", "rank 3", "rank 4+", "missing"], (entry) => rankBucket(entry.row.ranks.latestPerformanceRating ?? null)),
    family("best_l3_perf_rank", "Best L3 Performance Rank", ["rank 1", "rank 2", "rank 3", "rank 4+", "missing"], (entry) => rankBucket(entry.row.ranks.bestPerformanceLast3 ?? null)),
    familyFromBands("tpr_lead", "TPR Lead Band", LEAD_BANDS, (entry) => entry.leadBand?.key ?? "missing"),
    familyFromBands("field_size", "Field-Size Band", FIELD_BANDS, (entry) => entry.fieldBand?.key ?? "missing"),
    family("fair_price_band", "V2 Fair-Price Band", ["<3.0", "3.0-3.99", "4.0-4.99", "5.0-6.99", "7.0-9.99", "10.0+"], fairBandBucket),
    family("history_depth", "TPR History Depth", ["1-run basis", "2-run basis", "3-run basis", "missing"], (entry) => {
      const depth = entry.row.turfPerformance?.historyDepth;
      return depth === 1 ? "1-run basis" : depth === 2 ? "2-run basis" : depth === 3 ? "3-run basis" : "missing";
    }),
    family("days_since_run", "Days Since Run", ["0-14", "15-30", "31-60", "61-120", "121+", "missing"], daysSinceBucket),
    missing("Course Form", "prior course-run/win record is not exposed by current cached feature rows"),
    missing("Course And Distance Form", "prior C&D-run/win record is not exposed by current cached feature rows"),
    missing("Distance History", "prior distance-band record is not exposed by current cached feature rows"),
    missing("Going History", "prior going-group record is not exposed by current cached feature rows"),
    family("age", "Age", ["2yo", "3yo", "4yo", "5yo+", "missing"], ageBucket),
    missing("Weight Movement", "previous-run carried weight is not exposed by current cached feature rows"),
    missing("Headgear", "headgear state is not exposed by current cached feature rows"),
    family("draw", "Relative Draw", ["low third", "middle third", "high third", "missing"], drawBucket),
    family("jockey_prior_runs", "Jockey Prior Runs", ["<20", "20-49", "50-99", "100+", "missing"], jockeyRunsBucket),
    family("jockey_win_rate", "Jockey Prior Win Rate", ["<5%", "5-9.9%", "10-14.9%", "15-19.9%", "20%+", "missing"], jockeyWinRateBucket),
    familyFromBands("trainer_win_rate", "Trainer Prior Win Rate", TRAINER_BANDS, (entry) => entry.trainerBand.key),
    family("trainer_prior_runs", "Trainer Prior Runs", ["<50", "50-199", "200-499", "500+", "missing"], trainerRunsBucket),
  ];
}

function family(key: string, title: string, labels: string[], bucketForLabel: (entry: PricedEntry) => string): FeatureFamily {
  const buckets = labels.map((label, order) => ({ key: label, label, order }));
  return {
    key,
    title,
    buckets,
    available: true,
    bucketFor: (entry) => buckets.find((bucket) => bucket.label === bucketForLabel(entry) || bucket.key === bucketForLabel(entry)) ?? buckets.at(-1)!,
  };
}

function familyFromBands(key: string, title: string, bands: Band[], keyFor: (entry: PricedEntry) => string): FeatureFamily {
  return {
    key,
    title,
    buckets: bands,
    available: true,
    bucketFor: (entry) => bands.find((band) => band.key === keyFor(entry)) ?? { key: "missing", label: "missing", order: bands.length },
  };
}

function metricsFor(entries: PricedEntry[]): Metrics {
  const winners = entries.filter(won).length;
  const predictedWins = entries.reduce((total, entry) => total + entry.probability, 0);
  const expectedWins = entries.reduce((total, entry) => total + (1 / entry.settlement.settlementOddsDecimal), 0);
  const profitLoss = entries.reduce((total, entry) => total + entry.settlement.profitLoss, 0);
  return {
    selections: entries.length,
    winners,
    strike: entries.length === 0 ? null : winners / entries.length,
    predictedWinRate: entries.length === 0 ? null : predictedWins / entries.length,
    calibrationError: entries.length === 0 ? null : (winners / entries.length) - (predictedWins / entries.length),
    averageFair: average(entries.map((entry) => entry.fairDecimal)),
    averageSp: average(entries.map((entry) => entry.settlement.settlementOddsDecimal)),
    roi: entries.length === 0 ? null : (profitLoss / entries.length) * 100,
    ae: expectedWins === 0 ? null : winners / expectedWins,
  };
}

function strongestDifferenceRow(context: Context, family: FeatureFamily): Record<string, unknown> | null {
  const top = bucketDifferences(context, family).sort((left, right) => Math.abs(right.diffPp) - Math.abs(left.diffPp))[0];
  if (!top) return null;
  return {
    year: yearLabel(context),
    family: family.title,
    bucket: top.bucket.label,
    "<0.75 share": pct(top.shorterShare),
    "1.50+ share": pct(top.biggerShare),
    "diff bigger-shorter": pp(top.diffPp),
    "prevalence ratio": number(top.ratio),
  };
}

function bucketDifferences(context: Context, family: FeatureFamily) {
  const shorter = context.entries.filter((entry) => entry.disagreementGroup.key === "much_shorter");
  const bigger = context.entries.filter((entry) => entry.disagreementGroup.key === "much_bigger");
  return family.buckets.map((bucket) => {
    const shorterCount = shorter.filter((entry) => family.bucketFor(entry).key === bucket.key).length;
    const biggerCount = bigger.filter((entry) => family.bucketFor(entry).key === bucket.key).length;
    const shorterShare = shorter.length === 0 ? 0 : (shorterCount / shorter.length) * 100;
    const biggerShare = bigger.length === 0 ? 0 : (biggerCount / bigger.length) * 100;
    return {
      bucket,
      shorterShare,
      biggerShare,
      diffPp: biggerShare - shorterShare,
      ratio: shorterShare === 0 ? null : biggerShare / shorterShare,
    };
  });
}

function replicationRow(contexts: Context[], family: FeatureFamily) {
  const context2025 = contextFor(contexts, "2025");
  const context2026 = contextFor(contexts, "2026");
  const top2026 = bucketDifferences(context2026, family).sort((left, right) => Math.abs(right.diffPp) - Math.abs(left.diffPp))[0];
  if (!top2026) {
    return { family: family.title, "2026 leading bucket": "n/a", "2026 diff": "n/a", "2025 same-bucket diff": "n/a", classification: "too sparse" };
  }
  const same2025 = bucketDifferences(context2025, family).find((item) => item.bucket.key === top2026.bucket.key);
  const classification = same2025 ? classifyReplication(top2026.diffPp, same2025.diffPp) : "too sparse";
  return {
    family: family.title,
    "2026 leading bucket": top2026.bucket.label,
    "2026 diff": pp(top2026.diffPp),
    "2025 same-bucket diff": pp(same2025?.diffPp ?? null),
    classification,
  };
}

function topDifferences(context: Context, families: FeatureFamily[]) {
  return families
    .filter((family) => family.available)
    .flatMap((family) => bucketDifferences(context, family).map((item) => ({ ...item, family })))
    .filter((item) => Number.isFinite(item.diffPp))
    .sort((left, right) => Math.abs(right.diffPp) - Math.abs(left.diffPp));
}

function replicationFor(context2025: Context, context2026: Context, family: FeatureFamily, bucket: Band): string {
  const d2026 = bucketDifferences(context2026, family).find((item) => item.bucket.key === bucket.key)?.diffPp ?? 0;
  const d2025 = bucketDifferences(context2025, family).find((item) => item.bucket.key === bucket.key)?.diffPp ?? 0;
  return classifyReplication(d2026, d2025);
}

function classifyReplication(diff2026: number, diff2025: number): string {
  if (Math.abs(diff2026) < 5 || Math.abs(diff2025) < 5) return "repeats weakly";
  if (Math.sign(diff2026) === Math.sign(diff2025)) {
    return Math.abs(diff2026) >= 10 && Math.abs(diff2025) >= 10 ? "repeats strongly" : "repeats weakly";
  }
  return "reversed";
}

function summaryForFamily(contexts: Context[], family: FeatureFamily): string {
  const row = replicationRow(contexts, family);
  return `${row.family}: ${row["2026 leading bucket"]} (${row["2026 diff"]}, ${row.classification}).`;
}

function familyByKey(families: FeatureFamily[], key: string): FeatureFamily | null {
  return families.find((family) => family.key === key) ?? null;
}

function buildV1Model(entries: SettledEntry[]): V1Model {
  const global = calibrationStats(entries);
  const lead = new Map(LEAD_BANDS.map((band) => [band.key, calibrationStats(entries.filter((entry) => leadBandFor(entry)?.key === band.key))]));
  const cell = new Map<string, CalibrationStats>();
  for (const leadBand of LEAD_BANDS) {
    for (const fieldBand of FIELD_BANDS) {
      cell.set(cellKey(leadBand, fieldBand), calibrationStats(entries.filter((entry) =>
        leadBandFor(entry)?.key === leadBand.key && fieldBandFor(entry)?.key === fieldBand.key
      )));
    }
  }
  return { global, lead, cell };
}

function priceV1Entries(entries: SettledEntry[], v1: V1Model) {
  return entries.map((entry) => {
    const leadBand = leadBandFor(entry);
    const fieldBand = fieldBandFor(entry);
    const assigned = v1Assignment(leadBand, fieldBand, v1);
    const probability = assigned.probability ?? v1.global.probability ?? 0;
    return { ...entry, leadBand, fieldBand, trainerBand: trainerBandFor(entry), v1Probability: probability };
  });
}

function buildTrainerAdjustments(entries: ReturnType<typeof priceV1Entries>): Map<string, TrainerAdjustment> {
  return new Map(TRAINER_BANDS.map((band) => {
    const group = entries.filter((entry) => entry.trainerBand.key === band.key);
    const stats = calibrationStats(group);
    const mean = average(group.map((entry) => entry.v1Probability));
    const delta = group.length >= LIMITED_SAMPLE ? (diff(stats.probability, mean) ?? 0) : 0;
    return [band.key, { selections: group.length, delta }];
  }));
}

function priceEntries(entries: SettledEntry[], v1: V1Model, adjustments: Map<string, TrainerAdjustment>): PricedEntry[] {
  return entries.map((entry) => {
    const leadBand = leadBandFor(entry);
    const fieldBand = fieldBandFor(entry);
    const trainerBand = trainerBandFor(entry);
    const assigned = v1Assignment(leadBand, fieldBand, v1);
    const v1Probability = assigned.probability ?? v1.global.probability ?? 0;
    const probability = clamp(v1Probability + (adjustments.get(trainerBand.key)?.delta ?? 0), MIN_PROBABILITY, MAX_PROBABILITY);
    const fairDecimal = 1 / probability;
    const valueRatio = entry.settlement.settlementOddsDecimal / fairDecimal;
    return {
      ...entry,
      leadBand,
      fieldBand,
      trainerBand,
      probability,
      fairDecimal,
      source: assigned.source,
      valueRatio,
      modelEdge: (probability * entry.settlement.settlementOddsDecimal) - 1,
      disagreementGroup: groupForValueRatio(valueRatio),
    };
  });
}

function v1Assignment(leadBand: Band | null, fieldBand: Band | null, v1: V1Model): { source: Source; probability: number | null } {
  if (leadBand && fieldBand) {
    const cell = v1.cell.get(cellKey(leadBand, fieldBand)) ?? emptyStats();
    if (cell.selections >= ADEQUATE_SAMPLE && cell.probability !== null) {
      return { source: "exact lead x field cell", probability: cell.probability };
    }
  }
  if (leadBand) {
    const lead = v1.lead.get(leadBand.key) ?? emptyStats();
    if (lead.probability !== null) return { source: "lead fallback", probability: lead.probability };
  }
  return { source: "global fallback", probability: v1.global.probability };
}

function calibrationStats(entries: SettledEntry[]): CalibrationStats {
  const winners = entries.filter(won).length;
  return {
    selections: entries.length,
    winners,
    probability: entries.length === 0 ? null : winners / entries.length,
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

function groupForValueRatio(value: number): Group {
  return DISAGREEMENT_GROUPS.find((group) => matchesGroup(value, group)) ?? DISAGREEMENT_GROUPS.at(-1)!;
}

function matchesGroup(value: number, group: Group): boolean {
  if (group.minInclusive !== null && value < group.minInclusive) return false;
  return group.maxExclusive === null || value < group.maxExclusive;
}

function rankBucket(rank: number | null): string {
  if (rank === null) return "missing";
  if (rank === 1) return "rank 1";
  if (rank === 2) return "rank 2";
  if (rank === 3) return "rank 3";
  return "rank 4+";
}

function orMovementBucket(entry: PricedEntry): string {
  const current = entry.row.features.officialRating;
  const latest = entry.row.features.latestOr;
  if (current === null || latest === null) return "missing";
  const diffValue = current - latest;
  if (diffValue <= -5) return "down 5+";
  if (diffValue <= -2) return "down 2-4";
  if (diffValue <= 1 && diffValue >= -1) return "within +/-1";
  if (diffValue <= 4) return "up 2-4";
  return "up 5+";
}

function fairBandBucket(entry: PricedEntry): string {
  const fair = entry.fairDecimal;
  if (fair < 3) return "<3.0";
  if (fair < 4) return "3.0-3.99";
  if (fair < 5) return "4.0-4.99";
  if (fair < 7) return "5.0-6.99";
  if (fair < 10) return "7.0-9.99";
  return "10.0+";
}

function daysSinceBucket(entry: PricedEntry): string {
  const value = entry.row.features.daysSinceLastRun;
  if (value === null) return "missing";
  if (value <= 14) return "0-14";
  if (value <= 30) return "15-30";
  if (value <= 60) return "31-60";
  if (value <= 120) return "61-120";
  return "121+";
}

function ageBucket(entry: PricedEntry): string {
  const value = entry.row.features.horseAge;
  if (value === null) return "missing";
  if (value === 2) return "2yo";
  if (value === 3) return "3yo";
  if (value === 4) return "4yo";
  return "5yo+";
}

function drawBucket(entry: PricedEntry): string {
  const draw = entry.row.features.draw;
  const fieldSize = entry.row.features.actualRunnerCount ?? entry.row.features.declaredRunnerCount;
  if (draw === null || fieldSize === null || fieldSize <= 0) return "missing";
  const third = Math.ceil(fieldSize / 3);
  if (draw <= third) return "low third";
  if (draw <= third * 2) return "middle third";
  return "high third";
}

function jockeyRunsBucket(entry: PricedEntry): string {
  const value = entry.row.features.jockeyPriorRuns;
  if (value === undefined || value === null) return "missing";
  if (value < 20) return "<20";
  if (value < 50) return "20-49";
  if (value < 100) return "50-99";
  return "100+";
}

function jockeyWinRateBucket(entry: PricedEntry): string {
  const value = entry.row.features.jockeyPriorWinRate;
  if (value === undefined || value === null) return "missing";
  if (value < 5) return "<5%";
  if (value < 10) return "5-9.9%";
  if (value < 15) return "10-14.9%";
  if (value < 20) return "15-19.9%";
  return "20%+";
}

function trainerRunsBucket(entry: PricedEntry): string {
  const value = entry.row.features.trainerPriorRuns;
  if (value === null || !Number.isFinite(value)) return "missing";
  if (value < 50) return "<50";
  if (value < 200) return "50-199";
  if (value < 500) return "200-499";
  return "500+";
}

function won(entry: SettledEntry): boolean {
  return entry.row.outcome.won === true;
}

function cellKey(leadBand: Band, fieldBand: Band): string {
  return `${leadBand.key}__${fieldBand.key}`;
}

function emptyStats(): CalibrationStats {
  return { selections: 0, winners: 0, probability: null };
}

function contextFor(contexts: Context[], year: Year): Context {
  const context = contexts.find((item) => item.year === year);
  if (!context) throw new Error(`Missing context ${year}`);
  return context;
}

function yearLabel(context: Context): string {
  return context.year === "2026" ? `2026 YTD (${context.actualFrom} to ${context.actualTo})` : context.year;
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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

function table(lines: string[], rows: Array<Record<string, unknown> | null>) {
  const actualRows = rows.filter((row): row is Record<string, unknown> => row !== null);
  if (actualRows.length === 0) {
    lines.push("_No rows_");
    return;
  }
  const columns = Object.keys(actualRows[0]!);
  lines.push(`| ${columns.join(" | ")} |`);
  lines.push(`| ${columns.map(() => "---").join(" | ")} |`);
  for (const row of actualRows) {
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
