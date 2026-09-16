import { writeFile } from "node:fs/promises";
import { settleSelection } from "@/lib/racing/backtest";
import { loadLatestBacktestFeatureCacheForYear } from "@/lib/racing/backtest-cache";
import { rankRows, type RankedResearchRow } from "@/lib/racing/research-rule";

type Year = "2025" | "2026";
type BucketStatus = "favourable both years" | "favourable 2025 only" | "favourable 2026 only" | "reversed" | "neutral" | "too sparse";

type Metrics = {
  runners: number;
  settled: number;
  winners: number;
  strikeRate: number | null;
  averageSp: number | null;
  medianSp: number | null;
  profitLoss: number;
  roi: number | null;
  expectedWins: number;
  ae: number | null;
};

type Context = {
  year: Year;
  cacheFrom: string;
  cacheTo: string;
  actualFrom: string;
  actualTo: string;
  rows: RankedResearchRow[];
};

type FeatureDefinition = {
  key: string;
  title: string;
  buckets: string[];
  bucketFor: (row: RankedResearchRow) => string | null;
};

const OUTPUT_PATH = "/tmp/turf-value-factors.md";
const YEARS: Year[] = ["2025", "2026"];
const SAMPLE_FLOOR = 50;

async function main() {
  const contexts = await Promise.all(YEARS.map(loadContext));
  const features = featureDefinitions();
  const lines: string[] = [];
  writeReport(lines, contexts, features);
  await writeFile(OUTPUT_PATH, `${lines.join("\n")}\n`, "utf8");

  console.log(`Wrote ${OUTPUT_PATH}`);
  for (const context of contexts) {
    const metrics = metricsFor(context.rows);
    console.log(`${context.year}: runners ${metrics.runners}, settled ${metrics.settled}, ROI ${pct(metrics.roi)}, A/E ${number(metrics.ae)}`);
  }
}

async function loadContext(year: Year): Promise<Context> {
  const cache = await loadLatestBacktestFeatureCacheForYear({ family: "turf_flat", year });
  if (!cache) {
    throw new Error(`Missing compatible Turf cache for ${year}`);
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

function writeReport(lines: string[], contexts: Context[], features: FeatureDefinition[]) {
  lines.push("# Turf Betting-Value Single-Feature Diagnostic");
  lines.push("");
  lines.push("Diagnostic only. TPR, Research, Today, saved/frozen rules, caches, importers, and holdout behavior were not changed.");
  lines.push("");
  lines.push("Scope: Flat Turf only; 2025 development and 2026 holdout are kept separate. A/E is primary, ROI secondary, strike rate descriptive.");
  lines.push("");

  writeBaseline(lines, contexts);
  writeFeatureTables(lines, contexts, features);
  writeReplication(lines, contexts, features);
  writeDiscrimination(lines, contexts, features);
  writeOutlierStress(lines, contexts, features);
  writeConclusion(lines, contexts, features);
}

function writeBaseline(lines: string[], contexts: Context[]) {
  lines.push("## 1. Baseline");
  lines.push("");
  table(lines, contexts.map((context) => ({
    year: context.year,
    "cache window": `${context.cacheFrom} to ${context.cacheTo}`,
    "actual coverage": `${context.actualFrom} to ${context.actualTo}`,
    ...metricColumns(context.rows),
  })));
  lines.push("");
}

function writeFeatureTables(lines: string[], contexts: Context[], features: FeatureDefinition[]) {
  let section = 2;
  for (const feature of features) {
    lines.push(`## ${section}. ${feature.title}`);
    if (feature.key === "trainer-strike") {
      lines.push("");
      table(lines, contexts.map((context) => {
        const withRuns = context.rows.filter((row) => row.features.trainerPriorRuns > 0);
        const withStrike = context.rows.filter((row) => row.features.trainerPriorWinRate !== null);
        return {
          year: context.year,
          runners: context.rows.length,
          "trainer prior runs >0": withRuns.length,
          "trainer strike available": withStrike.length,
          "coverage": pct((withStrike.length / context.rows.length) * 100),
        };
      }));
    }
    for (const context of contexts) {
      lines.push("");
      lines.push(`### ${context.year}`);
      table(lines, feature.buckets.map((bucket) => {
        const rows = rowsForBucket(context, feature, bucket);
        return {
          bucket,
          ...metricColumns(rows),
        };
      }));
    }
    lines.push("");
    section += 1;
  }
}

function writeReplication(lines: string[], contexts: Context[], features: FeatureDefinition[]) {
  lines.push(`## ${features.length + 2}. Replication Summary`);
  lines.push("");
  lines.push(`Adequate sample requires at least ${SAMPLE_FLOOR} settled runners in both years. A/E >1.0 is the primary favourable criterion.`);
  lines.push("");
  table(lines, features.flatMap((feature) =>
    feature.buckets.map((bucket) => {
      const rows2025 = rowsForBucket(contextFor(contexts, "2025"), feature, bucket);
      const rows2026 = rowsForBucket(contextFor(contexts, "2026"), feature, bucket);
      const metrics2025 = metricsFor(rows2025);
      const metrics2026 = metricsFor(rows2026);
      return {
        feature: feature.title,
        bucket,
        "2025 settled": metrics2025.settled,
        "2025 ROI": pct(metrics2025.roi),
        "2025 A/E": number(metrics2025.ae),
        "2026 settled": metrics2026.settled,
        "2026 ROI": pct(metrics2026.roi),
        "2026 A/E": number(metrics2026.ae),
        classification: replicationStatus(metrics2025, metrics2026),
      };
    })
  ));
  lines.push("");
}

function writeDiscrimination(lines: string[], contexts: Context[], features: FeatureDefinition[]) {
  lines.push(`## ${features.length + 3}. Feature Discrimination`);
  lines.push("");
  table(lines, features.map((feature) => {
    const stats = contexts.map((context) => discriminationFor(context, feature));
    return {
      feature: feature.title,
      "2025 highest A/E bucket": stats[0]!.bucket,
      "2025 A/E": number(stats[0]!.ae),
      "2025 settled": stats[0]!.settled,
      "2026 highest A/E bucket": stats[1]!.bucket,
      "2026 A/E": number(stats[1]!.ae),
      "2026 settled": stats[1]!.settled,
      "same bucket/region repeats": repeatRegion(stats[0]!.bucket, stats[1]!.bucket),
      "2025 A/E spread": number(stats[0]!.spread),
      "2026 A/E spread": number(stats[1]!.spread),
    };
  }));
  lines.push("");
}

function writeOutlierStress(lines: string[], contexts: Context[], features: FeatureDefinition[]) {
  lines.push(`## ${features.length + 4}. Outlier Stress`);
  lines.push("");
  const candidates = stressCandidates(contexts, features);
  if (candidates.length === 0) {
    lines.push("No bucket had A/E >1.0 in both years or positive ROI in both years with adequate sample.");
    lines.push("");
    return;
  }
  table(lines, candidates.map((candidate) => {
    const original = metricsFor(candidate.rows);
    const stressedRows = removeBiggestPricedWinner(candidate.rows);
    const stressed = metricsFor(stressedRows);
    const contribution = largestWinnerContribution(candidate.rows);
    return {
      feature: candidate.feature,
      bucket: candidate.bucket,
      year: candidate.year,
      settled: original.settled,
      "original ROI": pct(original.roi),
      "original A/E": number(original.ae),
      "ROI without biggest winner": pct(stressed.roi),
      "A/E without biggest winner": number(stressed.ae),
      "largest winner SP": number(contribution.sp),
      "largest winner P/L contribution": pct(contribution.share),
    };
  }));
  lines.push("");
}

function writeConclusion(lines: string[], contexts: Context[], features: FeatureDefinition[]) {
  lines.push(`## ${features.length + 5}. Conclusion`);
  lines.push("");
  numbered(lines, [
    `Which single features show the strongest A/E separation? ${strongestSeparation(features, contexts)}`,
    `Which buckets have A/E >1.0 in both 2025 and 2026? ${favourableBoth(features, contexts)}`,
    `Which signals repeat with adequate sample? ${repeatSignals(features, contexts)}`,
    `Which apparent signals collapse after removing one big winner? ${collapseSignals(features, contexts)}`,
    `Does trainer strength show any value signal on Turf? ${featureConclusion(contexts, featureByKey(features, "trainer-strike"))}`,
    `Does field size show any value signal? ${featureConclusion(contexts, featureByKey(features, "field-size"))}`,
    `Does OR rank show any value signal? ${featureConclusion(contexts, featureByKey(features, "or-rank"))}`,
    `Do speed ranks show any value signal? Latest speed: ${featureConclusion(contexts, featureByKey(features, "latest-speed-rank"))} Best L3 speed: ${featureConclusion(contexts, featureByKey(features, "best-l3-speed-rank"))}`,
    `Does TPR add any value signal as a standalone feature? Rank: ${featureConclusion(contexts, featureByKey(features, "tpr-rank"))} Absolute bands: ${featureConclusion(contexts, featureByKey(features, "tpr-absolute"))}`,
    `Is there one or two single features worth a separately pre-specified combination test next? ${nextTestConclusion(features, contexts)}`,
  ]);
}

function featureDefinitions(): FeatureDefinition[] {
  return [
    {
      key: "trainer-strike",
      title: "Trainer Prior Strike Rate",
      buckets: ["<5%", "5-9.9%", "10-14.9%", "15-19.9%", "20%+", "missing"],
      bucketFor: (row) => {
        const value = row.features.trainerPriorWinRate;
        if (value === null) return "missing";
        if (value < 5) return "<5%";
        if (value < 10) return "5-9.9%";
        if (value < 15) return "10-14.9%";
        if (value < 20) return "15-19.9%";
        return "20%+";
      },
    },
    {
      key: "field-size",
      title: "Field Size",
      buckets: ["2-5", "6-8", "9-12", "13+", "missing"],
      bucketFor: (row) => {
        const value = fieldSize(row);
        if (value === null) return "missing";
        if (value <= 5) return "2-5";
        if (value <= 8) return "6-8";
        if (value <= 12) return "9-12";
        return "13+";
      },
    },
    {
      key: "or-rank",
      title: "Official Rating Rank",
      buckets: ["rank 1", "rank 2", "rank 3", "rank 4+", "missing"],
      bucketFor: (row) => rankBucket(row.ranks.officialRating ?? null),
    },
    {
      key: "days-since-run",
      title: "Days Since Run",
      buckets: ["0-14", "15-30", "31-60", "61-120", "121+", "missing"],
      bucketFor: (row) => {
        const value = row.features.daysSinceLastRun;
        if (value === null) return "missing";
        if (value <= 14) return "0-14";
        if (value <= 30) return "15-30";
        if (value <= 60) return "31-60";
        if (value <= 120) return "61-120";
        return "121+";
      },
    },
    {
      key: "race-class",
      title: "Race Class",
      buckets: ["Class 1", "Class 2", "Class 3", "Class 4", "Class 5", "Class 6", "unknown"],
      bucketFor: (row) => normalizedRaceClass(row.features.raceClass),
    },
    {
      key: "latest-speed-rank",
      title: "Latest Speed Rank",
      buckets: ["rank 1", "rank 2", "rank 3", "rank 4+", "missing"],
      bucketFor: (row) => rankBucket(row.ranks.latestSpeedRating ?? null),
    },
    {
      key: "best-l3-speed-rank",
      title: "Best L3 Speed Rank",
      buckets: ["rank 1", "rank 2", "rank 3", "rank 4+", "missing"],
      bucketFor: (row) => rankBucket(row.ranks.bestSpeedLast3 ?? null),
    },
    {
      key: "tpr-rank",
      title: "TPR Rank",
      buckets: ["rank 1", "rank 2", "rank 3", "rank 4+", "missing"],
      bucketFor: (row) => rankBucket(row.turfPerformance?.rank ?? null),
    },
    {
      key: "tpr-absolute",
      title: "TPR Absolute Bands",
      buckets: ["<90", "90-99.9", "100-109.9", "110-119.9", "120+", "missing"],
      bucketFor: (row) => {
        const value = row.turfPerformance?.rating ?? null;
        if (value === null) return "missing";
        if (value < 90) return "<90";
        if (value < 100) return "90-99.9";
        if (value < 110) return "100-109.9";
        if (value < 120) return "110-119.9";
        return "120+";
      },
    },
    {
      key: "career-prior-runs",
      title: "Career Prior Runs",
      buckets: ["0", "1", "2-3", "4-7", "8+"],
      bucketFor: (row) => {
        const value = row.features.priorRuns;
        if (value === 0) return "0";
        if (value === 1) return "1";
        if (value <= 3) return "2-3";
        if (value <= 7) return "4-7";
        return "8+";
      },
    },
  ];
}

function rowsForBucket(context: Context, feature: FeatureDefinition, bucket: string): RankedResearchRow[] {
  return context.rows.filter((row) => feature.bucketFor(row) === bucket);
}

function metricsFor(rows: RankedResearchRow[]): Metrics {
  const settled = rows
    .map((row) => ({ row, settlement: settleSelection(row.outcome) }))
    .filter((entry): entry is { row: RankedResearchRow; settlement: NonNullable<ReturnType<typeof settleSelection>> } =>
      entry.settlement !== null && entry.settlement.settlementOddsDecimal > 0
    );
  const winners = settled.filter((entry) => entry.row.outcome.won).length;
  const profitLoss = settled.reduce((total, entry) => total + entry.settlement.profitLoss, 0);
  const expectedWins = settled.reduce((total, entry) => total + (1 / entry.settlement.settlementOddsDecimal), 0);
  const sps = settled.map((entry) => entry.settlement.settlementOddsDecimal);
  return {
    runners: rows.length,
    settled: settled.length,
    winners,
    strikeRate: settled.length === 0 ? null : (winners / settled.length) * 100,
    averageSp: average(sps),
    medianSp: median(sps),
    profitLoss,
    roi: settled.length === 0 ? null : (profitLoss / settled.length) * 100,
    expectedWins,
    ae: expectedWins === 0 ? null : winners / expectedWins,
  };
}

function metricColumns(rows: RankedResearchRow[]) {
  const metrics = metricsFor(rows);
  return {
    runners: metrics.runners,
    settled: metrics.settled,
    winners: metrics.winners,
    strike: pct(metrics.strikeRate),
    "avg SP": number(metrics.averageSp),
    "median SP": number(metrics.medianSp),
    "P/L": money(metrics.profitLoss),
    ROI: pct(metrics.roi),
    "A/E": number(metrics.ae),
  };
}

function replicationStatus(metrics2025: Metrics, metrics2026: Metrics): BucketStatus {
  if (metrics2025.settled < SAMPLE_FLOOR || metrics2026.settled < SAMPLE_FLOOR) return "too sparse";
  const good2025 = (metrics2025.ae ?? -Infinity) > 1;
  const good2026 = (metrics2026.ae ?? -Infinity) > 1;
  if (good2025 && good2026) return "favourable both years";
  if (good2025) return "favourable 2025 only";
  if (good2026) return "favourable 2026 only";
  if ((metrics2025.ae ?? 0) < 0.95 && (metrics2026.ae ?? 0) < 0.95) return "reversed";
  return "neutral";
}

function discriminationFor(context: Context, feature: FeatureDefinition) {
  const bucketStats = feature.buckets
    .map((bucket) => ({ bucket, metrics: metricsFor(rowsForBucket(context, feature, bucket)) }))
    .filter((entry) => entry.metrics.settled >= SAMPLE_FLOOR && entry.metrics.ae !== null)
    .sort((left, right) => (right.metrics.ae ?? -Infinity) - (left.metrics.ae ?? -Infinity));
  const aes = bucketStats.map((entry) => entry.metrics.ae).filter(isNumber);
  const top = bucketStats[0];
  return {
    bucket: top?.bucket ?? "too sparse",
    ae: top?.metrics.ae ?? null,
    settled: top?.metrics.settled ?? 0,
    spread: aes.length === 0 ? null : Math.max(...aes) - Math.min(...aes),
  };
}

function stressCandidates(contexts: Context[], features: FeatureDefinition[]) {
  return features.flatMap((feature) =>
    feature.buckets.flatMap((bucket) => {
      const rowsByYear = YEARS.map((year) => {
        const context = contextFor(contexts, year);
        return { year, rows: rowsForBucket(context, feature, bucket), metrics: metricsFor(rowsForBucket(context, feature, bucket)) };
      });
      const adequate = rowsByYear.every((entry) => entry.metrics.settled >= SAMPLE_FLOOR);
      const aeBoth = rowsByYear.every((entry) => (entry.metrics.ae ?? -Infinity) > 1);
      const roiBoth = rowsByYear.every((entry) => (entry.metrics.roi ?? -Infinity) > 0);
      if (!adequate || (!aeBoth && !roiBoth)) return [];
      return rowsByYear.map((entry) => ({
        feature: feature.title,
        bucket,
        year: entry.year,
        rows: entry.rows,
      }));
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
      left.features.raceDateTime.getTime() - right.features.raceDateTime.getTime() ||
      left.features.targetRunnerId.localeCompare(right.features.targetRunnerId)
    )[0] ?? null;
  return winner ? rows.filter((row) => row.features.targetRunnerId !== winner.features.targetRunnerId) : rows;
}

function largestWinnerContribution(rows: RankedResearchRow[]) {
  const metrics = metricsFor(rows);
  const winner = rows
    .filter((row) => row.outcome.won)
    .map((row) => ({ row, settlement: settleSelection(row.outcome) }))
    .filter((entry): entry is { row: RankedResearchRow; settlement: NonNullable<ReturnType<typeof settleSelection>> } =>
      entry.settlement !== null
    )
    .sort((left, right) =>
      right.settlement.settlementOddsDecimal - left.settlement.settlementOddsDecimal ||
      left.row.features.raceDateTime.getTime() - right.row.features.raceDateTime.getTime()
    )[0] ?? null;
  return {
    sp: winner?.settlement.settlementOddsDecimal ?? null,
    share: metrics.profitLoss === 0 ? null : ((winner?.settlement.profitLoss ?? 0) / metrics.profitLoss) * 100,
  };
}

function strongestSeparation(features: FeatureDefinition[], contexts: Context[]): string {
  return features
    .map((feature) => {
      const spreads = contexts.map((context) => discriminationFor(context, feature).spread).filter(isNumber);
      return { feature, spread: average(spreads) ?? -Infinity };
    })
    .sort((left, right) => right.spread - left.spread)
    .slice(0, 3)
    .map((entry) => `${entry.feature.title} avg A/E spread ${number(entry.spread)}`)
    .join("; ");
}

function favourableBoth(features: FeatureDefinition[], contexts: Context[]): string {
  const buckets = repeatedBuckets(features, contexts, (metrics) => (metrics.ae ?? -Infinity) > 1);
  return buckets.length === 0 ? "None." : buckets.join("; ");
}

function repeatSignals(features: FeatureDefinition[], contexts: Context[]): string {
  const buckets = repeatedBuckets(features, contexts, (metrics) => (metrics.ae ?? -Infinity) > 1 && metrics.settled >= SAMPLE_FLOOR);
  return buckets.length === 0 ? "None with A/E >1.0 in both years and adequate sample." : buckets.join("; ");
}

function collapseSignals(features: FeatureDefinition[], contexts: Context[]): string {
  const collapsed = stressCandidates(contexts, features)
    .filter((candidate) => (metricsFor(removeBiggestPricedWinner(candidate.rows)).roi ?? -Infinity) <= 0)
    .map((candidate) => `${candidate.feature} ${candidate.bucket} ${candidate.year}`);
  return collapsed.length === 0 ? "No stressed repeat-positive bucket collapsed, or none qualified." : collapsed.join("; ");
}

function featureConclusion(contexts: Context[], feature: FeatureDefinition): string {
  const repeated = feature.buckets.filter((bucket) =>
    contexts.every((context) => {
      const metrics = metricsFor(rowsForBucket(context, feature, bucket));
      return metrics.settled >= SAMPLE_FLOOR && (metrics.ae ?? -Infinity) > 1;
    })
  );
  if (repeated.length > 0) return `Yes: ${repeated.join(", ")}.`;
  const best = contexts.map((context) => {
    const stat = discriminationFor(context, feature);
    return `${context.year} best ${stat.bucket} A/E ${number(stat.ae)}`;
  }).join("; ");
  return `No repeat A/E >1.0 bucket. ${best}.`;
}

function nextTestConclusion(features: FeatureDefinition[], contexts: Context[]): string {
  const repeated = repeatedBuckets(features, contexts, (metrics) => (metrics.ae ?? -Infinity) > 1 && metrics.settled >= SAMPLE_FLOOR);
  if (repeated.length === 0) {
    return "No. Continue diagnostic work before pre-specifying combinations.";
  }
  return `Possibly, but only as pre-specified combinations built around: ${repeated.slice(0, 2).join("; ")}.`;
}

function repeatedBuckets(
  features: FeatureDefinition[],
  contexts: Context[],
  predicate: (metrics: Metrics) => boolean,
): string[] {
  return features.flatMap((feature) =>
    feature.buckets
      .filter((bucket) => contexts.every((context) => predicate(metricsFor(rowsForBucket(context, feature, bucket)))))
      .map((bucket) => `${feature.title}: ${bucket}`)
  );
}

function featureByKey(features: FeatureDefinition[], key: string): FeatureDefinition {
  const feature = features.find((entry) => entry.key === key);
  if (!feature) throw new Error(`Missing feature ${key}`);
  return feature;
}

function contextFor(contexts: Context[], year: Year): Context {
  const context = contexts.find((entry) => entry.year === year);
  if (!context) throw new Error(`Missing context ${year}`);
  return context;
}

function fieldSize(row: RankedResearchRow): number | null {
  return row.features.actualRunnerCount ?? row.features.declaredRunnerCount;
}

function rankBucket(rank: number | null): string {
  if (rank === null) return "missing";
  if (rank === 1) return "rank 1";
  if (rank === 2) return "rank 2";
  if (rank === 3) return "rank 3";
  return "rank 4+";
}

function normalizedRaceClass(value: string | null): string {
  if (value === "Class 1" || value === "Class 2" || value === "Class 3" || value === "Class 4" || value === "Class 5" || value === "Class 6") {
    return value;
  }
  if (value === "1" || value === "2" || value === "3" || value === "4" || value === "5" || value === "6") {
    return `Class ${value}`;
  }
  return "unknown";
}

function repeatRegion(left: string, right: string): string {
  if (left === right) return "same bucket";
  if (left === "too sparse" || right === "too sparse") return "too sparse";
  return "no";
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

function isNumber(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

function pct(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "n/a" : `${value.toFixed(1)}%`;
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
