import { mkdir, readFile, writeFile } from "node:fs/promises";
import { mean, median, standardDeviation } from "@/lib/racing/speed-research";

const YEAR = process.argv[2] ?? "2025";
const START_DATE = `${YEAR}-01-01`;
const END_DATE = `${YEAR}-12-31`;
const INPUT_CSV = `data/research/going-adjustment-races-${START_DATE}-${END_DATE}.csv`;
const OUTPUT_DIR = "data/research";
const REPORT_PATH = `${OUTPUT_DIR}/going-adjustment-validation-${YEAR}.txt`;
const SUMMARY_CSV_PATH = `${OUTPUT_DIR}/going-adjustment-validation-summary-${YEAR}.csv`;
const GROUP_CSV_PATH = `${OUTPUT_DIR}/going-adjustment-validation-groups-${YEAR}.csv`;

type RaceRow = {
  race_source_id: string;
  race_date: string;
  course: string;
  distance: string;
  distance_yards: number | null;
  segment: string;
  surface: string;
  going: string;
  actual: number;
  base_standard: number;
  base_sample: number;
  deviation_seconds: number;
  deviation_per_f: number;
  same_day_adj_per_f: number | null;
  historical_adj_per_f: number | null;
  base_abs_error: number;
  same_day_abs_error: number | null;
  fallback_abs_error: number | null;
};

type Method = "base" | "same_day" | "historical_fallback";

type MethodStats = {
  method: Method;
  rows: RaceRow[];
  count: number;
  medianAbsError: number | null;
  meanAbsError: number | null;
  residualStdev: number | null;
  p25AbsError: number | null;
  p75AbsError: number | null;
  p90AbsError: number | null;
  improvedPct: number | null;
  worsenedPct: number | null;
  unchangedPct: number | null;
};

async function main() {
  const rows = parseRows(await readFile(INPUT_CSV, "utf8"));
  const sameDayGroups = sameDayGroupStats(rows);
  const fallbackSamples = historicalPriorSampleSizes(rows);
  const lines: string[] = [];

  lines.push(`# Going Adjustment Validation ${YEAR}`);
  lines.push("");
  lines.push("## Coverage");
  lines.push(...coverageLines(rows));
  lines.push("");
  lines.push("## Segment Performance");
  lines.push(...segmentPerformanceLines(rows));
  lines.push("");
  lines.push("## Rating Quality");
  lines.push("rating_quality=not_available_from_generated_race_csv");
  lines.push("reason=the generated CSV is race-level only and does not contain runner-level experimental ratings or official ratings");
  lines.push("");
  lines.push("## Same-Day Peer Count");
  lines.push(...sameDayPeerBucketLines(rows, sameDayGroups));
  lines.push("");
  lines.push("## Same-Day Spread Bands");
  lines.push(...sameDaySpreadBandLines(rows, sameDayGroups));
  lines.push("");
  lines.push("## Historical Fallback Prior Samples");
  lines.push(...fallbackSampleBucketLines(rows, fallbackSamples));
  lines.push("");
  lines.push("## Historical Fallback Going Outliers");
  lines.push(...historicalGoingOutlierLines(rows, fallbackSamples));
  lines.push("");
  lines.push("## Course Examples");
  lines.push(...courseExampleLines(rows));
  lines.push("");
  lines.push("## Conservative Production Rule");
  lines.push(...productionRuleLines(rows, sameDayGroups, fallbackSamples));
  lines.push("");
  lines.push("## Conclusion");
  lines.push(...conclusionLines(rows));

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(REPORT_PATH, `${lines.join("\n")}\n`);
  await writeFile(SUMMARY_CSV_PATH, summaryCsv(rows, sameDayGroups, fallbackSamples));
  await writeFile(GROUP_CSV_PATH, groupCsv(rows, fallbackSamples));

  console.log(lines.slice(0, 90).join("\n"));
  console.log("");
  console.log(`full_report=${REPORT_PATH}`);
  console.log(`summary_csv=${SUMMARY_CSV_PATH}`);
  console.log(`group_csv=${GROUP_CSV_PATH}`);
}

function coverageLines(rows: RaceRow[]): string[] {
  const lines = [coverageLine("overall", rows)];
  for (const [segment, segmentRows] of sortedEntries(groupBy(rows, (row) => row.segment))) {
    lines.push(coverageLine(segment, segmentRows));
  }
  return lines;
}

function coverageLine(label: string, rows: RaceRow[]): string {
  const sameDay = rows.filter((row) => row.same_day_abs_error !== null).length;
  const needsFallback = rows.filter(
    (row) => row.same_day_abs_error === null && row.fallback_abs_error !== null,
  ).length;
  const neither = rows.filter(
    (row) => row.same_day_abs_error === null && row.fallback_abs_error === null,
  ).length;
  return [
    "coverage",
    `segment=${label}`,
    `base_eligible=${rows.length}`,
    `same_day=${sameDay}`,
    `same_day_pct=${pct(sameDay, rows.length)}`,
    `requires_historical_fallback=${needsFallback}`,
    `requires_historical_fallback_pct=${pct(needsFallback, rows.length)}`,
    `neither=${neither}`,
    `neither_pct=${pct(neither, rows.length)}`,
  ].join(" | ");
}

function segmentPerformanceLines(rows: RaceRow[]): string[] {
  const lines: string[] = [];
  for (const [segment, segmentRows] of sortedEntries(groupBy(rows, (row) => row.segment))) {
    for (const method of ["base", "same_day", "historical_fallback"] as const) {
      lines.push(formatMethodStats(segment, methodStats(method, segmentRows)));
    }
  }
  return lines;
}

function methodStats(method: Method, rows: RaceRow[]): MethodStats {
  const eligible = rows.filter((row) => methodAbsError(row, method) !== null);
  const absErrors = eligible.map((row) => methodAbsError(row, method) ?? 0).sort((a, b) => a - b);
  const residuals = eligible.map((row) => methodResidual(row, method));
  const comparisons = eligible.map((row) => ({
    base: row.base_abs_error,
    adjusted: methodAbsError(row, method) ?? row.base_abs_error,
  }));
  const improved = comparisons.filter(({ adjusted, base }) => adjusted < base - 0.000_001).length;
  const worsened = comparisons.filter(({ adjusted, base }) => adjusted > base + 0.000_001).length;
  const unchanged = comparisons.length - improved - worsened;
  return {
    method,
    rows: eligible,
    count: eligible.length,
    medianAbsError: median(absErrors),
    meanAbsError: mean(absErrors),
    residualStdev: standardDeviation(residuals),
    p25AbsError: percentile(absErrors, 0.25),
    p75AbsError: percentile(absErrors, 0.75),
    p90AbsError: percentile(absErrors, 0.9),
    improvedPct: comparisons.length ? (improved / comparisons.length) * 100 : null,
    worsenedPct: comparisons.length ? (worsened / comparisons.length) * 100 : null,
    unchangedPct: comparisons.length ? (unchanged / comparisons.length) * 100 : null,
  };
}

function formatMethodStats(label: string, stats: MethodStats): string {
  return [
    "performance",
    `segment=${label}`,
    `method=${stats.method}`,
    `races=${stats.count}`,
    `median_abs_error=${fmt(stats.medianAbsError)}`,
    `mean_abs_error=${fmt(stats.meanAbsError)}`,
    `residual_stdev=${fmt(stats.residualStdev)}`,
    `p25_abs_error=${fmt(stats.p25AbsError)}`,
    `p75_abs_error=${fmt(stats.p75AbsError)}`,
    `p90_abs_error=${fmt(stats.p90AbsError)}`,
    `improved=${fmtPct(stats.improvedPct)}`,
    `worsened=${fmtPct(stats.worsenedPct)}`,
    `unchanged=${fmtPct(stats.unchangedPct)}`,
  ].join(" | ");
}

function sameDayGroupStats(rows: RaceRow[]): Map<string, { count: number; stdev: number | null }> {
  return new Map(
    sortedEntries(groupBy(rows, (row) => sameDayKey(row))).map(([key, group]) => [
      key,
      {
        count: group.length,
        stdev: standardDeviation(group.map((row) => row.deviation_per_f)),
      },
    ]),
  );
}

function sameDayPeerBucketLines(
  rows: RaceRow[],
  sameDayGroups: Map<string, { count: number; stdev: number | null }>,
): string[] {
  const eligible = rows.filter((row) => row.same_day_abs_error !== null);
  const grouped = groupBy(eligible, (row) => peerBucket((sameDayGroups.get(sameDayKey(row))?.count ?? 1) - 1));
  return sortedBucketEntries(grouped, ["1 peer", "2 peers", "3 peers", "4+ peers"]).map(([bucket, bucketRows]) =>
    bucketPerformanceLine("same_day_peer_bucket", bucket, bucketRows, "same_day"),
  );
}

function sameDaySpreadBandLines(
  rows: RaceRow[],
  sameDayGroups: Map<string, { count: number; stdev: number | null }>,
): string[] {
  const eligible = rows.filter((row) => row.same_day_abs_error !== null);
  const grouped = groupBy(eligible, (row) => spreadBand(sameDayGroups.get(sameDayKey(row))?.stdev ?? null));
  return sortedBucketEntries(grouped, ["low", "medium", "high", "unknown"]).map(([bucket, bucketRows]) =>
    bucketPerformanceLine("same_day_spread_band", bucket, bucketRows, "same_day"),
  );
}

function fallbackSampleBucketLines(
  rows: RaceRow[],
  fallbackSamples: Map<string, number>,
): string[] {
  const eligible = rows.filter((row) => row.fallback_abs_error !== null);
  const grouped = groupBy(eligible, (row) => historicalSampleBucket(fallbackSamples.get(row.race_source_id) ?? 0));
  return sortedBucketEntries(grouped, ["2-4", "5-9", "10-19", "20-49", "50+"]).map(([bucket, bucketRows]) =>
    bucketPerformanceLine("historical_prior_bucket", bucket, bucketRows, "historical_fallback"),
  );
}

function bucketPerformanceLine(
  prefix: string,
  bucket: string,
  rows: RaceRow[],
  method: Method,
): string {
  const stats = methodStats(method, rows);
  const baseStats = methodStats("base", rows);
  return [
    prefix,
    `bucket=${bucket}`,
    `races=${rows.length}`,
    `adjusted_median_abs_error=${fmt(stats.medianAbsError)}`,
    `base_median_abs_error=${fmt(baseStats.medianAbsError)}`,
    `improved=${fmtPct(stats.improvedPct)}`,
    `worsened=${fmtPct(stats.worsenedPct)}`,
    `unchanged=${fmtPct(stats.unchangedPct)}`,
  ].join(" | ");
}

function historicalGoingOutlierLines(
  rows: RaceRow[],
  fallbackSamples: Map<string, number>,
): string[] {
  const eligible = rows.filter((row) => row.fallback_abs_error !== null);
  return sortedEntries(groupBy(eligible, historicalGroupKey))
    .map(([key, group]) => {
      const fallback = methodStats("historical_fallback", group);
      const base = methodStats("base", group);
      const delta = (fallback.medianAbsError ?? 0) - (base.medianAbsError ?? 0);
      return { key, group, fallback, base, delta };
    })
    .filter((row) => row.group.length >= 10)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 12)
    .map(({ key, group, fallback, base, delta }) => {
      const [segment, surface, going] = key.split(" | ");
      const sampleSizes = group.map((row) => fallbackSamples.get(row.race_source_id) ?? 0);
      return [
        "historical_outlier",
        `segment=${segment}`,
        `surface=${surface}`,
        `going="${going}"`,
        `races=${group.length}`,
        `median_prior_sample=${fmt(median(sampleSizes))}`,
        `median_adj_per_f=${fmt(median(group.flatMap((row) => row.historical_adj_per_f === null ? [] : [row.historical_adj_per_f])))}`,
        `median_base_error=${fmt(base.medianAbsError)}`,
        `median_adjusted_error=${fmt(fallback.medianAbsError)}`,
        `delta=${fmt(delta)}`,
        `result=${delta <= 0 ? "better" : "worse"}`,
      ].join(" | ");
    });
}

function courseExampleLines(rows: RaceRow[]): string[] {
  const wanted = ["Wolverhampton", "Newcastle", "Kempton", "Newmarket", "Worcester", "Uttoxeter", "Market Rasen"];
  return wanted.map((course) => {
    const courseRows = rows.filter((row) => row.course === course);
    if (courseRows.length === 0) {
      return `course_example course=${course} status=no_base_eligible_races`;
    }
    const noSameDay = courseRows.filter((row) => row.same_day_abs_error === null);
    const sameDayStats = methodStats("same_day", courseRows);
    const fallbackWhenNeeded = methodStats("historical_fallback", noSameDay);
    const baseSameDayComparable = methodStats("base", sameDayStats.rows);
    const baseFallbackComparable = methodStats("base", fallbackWhenNeeded.rows);
    return [
      "course_example",
      `course=${course}`,
      `base_eligible=${courseRows.length}`,
      `same_day_available=${sameDayStats.count}`,
      `same_day_pct=${pct(sameDayStats.count, courseRows.length)}`,
      `same_day_median=${fmt(sameDayStats.medianAbsError)}`,
      `same_day_base_median=${fmt(baseSameDayComparable.medianAbsError)}`,
      `fallback_without_same_day=${fallbackWhenNeeded.count}`,
      `fallback_median=${fmt(fallbackWhenNeeded.medianAbsError)}`,
      `fallback_base_median=${fmt(baseFallbackComparable.medianAbsError)}`,
      `anomaly=${courseAnomaly(courseRows)}`,
    ].join(" | ");
  });
}

function productionRuleLines(
  rows: RaceRow[],
  sameDayGroups: Map<string, { count: number; stdev: number | null }>,
  fallbackSamples: Map<string, number>,
): string[] {
  const sameDayBuckets = new Map(
    sameDayPeerBucketLines(rows, sameDayGroups).map((line) => [line.split("bucket=")[1]?.split(" | ")[0], line]),
  );
  const lowSpreadRows = rows.filter(
    (row) => row.same_day_abs_error !== null && spreadBand(sameDayGroups.get(sameDayKey(row))?.stdev ?? null) === "low",
  );
  const fallback50Rows = rows.filter(
    (row) => row.fallback_abs_error !== null && (fallbackSamples.get(row.race_source_id) ?? 0) >= 50,
  );
  return [
    "suggested_min_same_day_peer_count=4",
    "suggested_same_day_spread_limit=stdev <= 0.30 seconds_per_furlong",
    "suggested_historical_fallback_min_prior_observations=50",
    `evidence_same_day_4plus=${sameDayBuckets.get("4+ peers") ?? "missing"}`,
    `evidence_low_spread=${bucketPerformanceLine("same_day_spread_band", "low", lowSpreadRows, "same_day")}`,
    `evidence_fallback_50plus=${bucketPerformanceLine("historical_prior_bucket", "50+", fallback50Rows, "historical_fallback")}`,
    "segment_exception=jumps require extra caution; high residual dispersion remains even when median error improves",
  ];
}

function conclusionLines(rows: RaceRow[]): string[] {
  const base = methodStats("base", rows);
  const sameDay = methodStats("same_day", rows);
  const fallback = methodStats("historical_fallback", rows);
  return [
    `same_day=${comparisonConclusion(base, sameDay)}`,
    `historical_fallback=${comparisonConclusion(base, fallback)}`,
    "production_direction=move toward a gated research implementation, not a default replacement",
  ];
}

function historicalPriorSampleSizes(rows: RaceRow[]): Map<string, number> {
  const history = new Map<string, number>();
  const samples = new Map<string, number>();
  for (const row of [...rows].sort(compareChronology)) {
    const key = historicalGroupKey(row);
    const prior = history.get(key) ?? 0;
    samples.set(row.race_source_id, prior);
    history.set(key, prior + 1);
  }
  return samples;
}

function summaryCsv(
  rows: RaceRow[],
  sameDayGroups: Map<string, { count: number; stdev: number | null }>,
  fallbackSamples: Map<string, number>,
): string {
  const output = [
    ["section", "bucket", "method", "races", "median_abs_error", "mean_abs_error", "residual_stdev", "p25", "p75", "p90", "improved_pct", "worsened_pct", "unchanged_pct"],
  ];
  for (const [segment, segmentRows] of [["overall", rows] as const, ...sortedEntries(groupBy(rows, (row) => row.segment))]) {
    for (const method of ["base", "same_day", "historical_fallback"] as const) {
      output.push(statsCsvRow("segment", segment, methodStats(method, segmentRows)));
    }
  }
  for (const [bucket, bucketRows] of sortedBucketEntries(
    groupBy(rows.filter((row) => row.same_day_abs_error !== null), (row) => peerBucket((sameDayGroups.get(sameDayKey(row))?.count ?? 1) - 1)),
    ["1 peer", "2 peers", "3 peers", "4+ peers"],
  )) {
    output.push(statsCsvRow("same_day_peer_bucket", bucket, methodStats("same_day", bucketRows)));
  }
  for (const [bucket, bucketRows] of sortedBucketEntries(
    groupBy(rows.filter((row) => row.fallback_abs_error !== null), (row) => historicalSampleBucket(fallbackSamples.get(row.race_source_id) ?? 0)),
    ["2-4", "5-9", "10-19", "20-49", "50+"],
  )) {
    output.push(statsCsvRow("historical_prior_bucket", bucket, methodStats("historical_fallback", bucketRows)));
  }
  return `${output.map((row) => csv(row)).join("\n")}\n`;
}

function groupCsv(rows: RaceRow[], fallbackSamples: Map<string, number>): string {
  const output = [
    ["segment", "surface", "going", "races", "median_prior_sample", "median_adjustment_per_f", "base_median_error", "fallback_median_error", "delta"],
  ];
  for (const [key, group] of sortedEntries(groupBy(rows.filter((row) => row.fallback_abs_error !== null), historicalGroupKey))) {
    const [segment, surface, going] = key.split(" | ");
    output.push([
      segment,
      surface,
      going,
      String(group.length),
      fmt(median(group.map((row) => fallbackSamples.get(row.race_source_id) ?? 0))),
      fmt(median(group.flatMap((row) => row.historical_adj_per_f === null ? [] : [row.historical_adj_per_f]))),
      fmt(methodStats("base", group).medianAbsError),
      fmt(methodStats("historical_fallback", group).medianAbsError),
      fmt((methodStats("historical_fallback", group).medianAbsError ?? 0) - (methodStats("base", group).medianAbsError ?? 0)),
    ]);
  }
  return `${output.map((row) => csv(row)).join("\n")}\n`;
}

function statsCsvRow(section: string, bucket: string, stats: MethodStats): string[] {
  return [
    section,
    bucket,
    stats.method,
    String(stats.count),
    fmt(stats.medianAbsError),
    fmt(stats.meanAbsError),
    fmt(stats.residualStdev),
    fmt(stats.p25AbsError),
    fmt(stats.p75AbsError),
    fmt(stats.p90AbsError),
    fmt(stats.improvedPct),
    fmt(stats.worsenedPct),
    fmt(stats.unchangedPct),
  ];
}

function methodAbsError(row: RaceRow, method: Method): number | null {
  if (method === "base") {
    return row.base_abs_error;
  }
  if (method === "same_day") {
    return row.same_day_abs_error;
  }
  return row.fallback_abs_error;
}

function methodResidual(row: RaceRow, method: Method): number {
  if (method === "base") {
    return row.deviation_seconds;
  }
  const adjustment =
    method === "same_day" ? row.same_day_adj_per_f : row.historical_adj_per_f;
  if (adjustment === null || row.distance_yards === null) {
    return row.deviation_seconds;
  }
  return row.deviation_seconds - adjustment * (row.distance_yards / 220);
}

function peerBucket(peerCount: number): string {
  if (peerCount <= 1) {
    return "1 peer";
  }
  if (peerCount === 2) {
    return "2 peers";
  }
  if (peerCount === 3) {
    return "3 peers";
  }
  return "4+ peers";
}

function spreadBand(stdev: number | null): string {
  if (stdev === null) {
    return "unknown";
  }
  if (stdev <= 0.3) {
    return "low";
  }
  if (stdev <= 0.6) {
    return "medium";
  }
  return "high";
}

function historicalSampleBucket(sample: number): string {
  if (sample < 5) {
    return "2-4";
  }
  if (sample < 10) {
    return "5-9";
  }
  if (sample < 20) {
    return "10-19";
  }
  if (sample < 50) {
    return "20-49";
  }
  return "50+";
}

function courseAnomaly(rows: RaceRow[]): string {
  const highSpreadCards = new Set(
    rows
      .filter((row) => row.same_day_abs_error !== null)
      .map((row) => sameDayKey(row)),
  ).size;
  const mixedSurfaces = new Set(rows.map((row) => row.surface)).size > 1;
  if (mixedSurfaces) {
    return "mixed_surface_labels";
  }
  if (highSpreadCards === 0) {
    return "limited_same_day_evidence";
  }
  return "none_obvious_from_summary";
}

function comparisonConclusion(base: MethodStats, adjusted: MethodStats): string {
  if (base.medianAbsError === null || adjusted.medianAbsError === null) {
    return "insufficient";
  }
  const delta = adjusted.medianAbsError - base.medianAbsError;
  return `${delta < 0 ? "improves" : "does_not_improve"} median_abs_error_delta=${fmt(delta)} races=${adjusted.count}`;
}

function parseRows(text: string): RaceRow[] {
  const [headerLine, ...lines] = text.trim().split(/\r?\n/);
  const headers = parseCsvLine(headerLine);
  return lines.map((line) => {
    const values = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    return {
      race_source_id: row.race_source_id,
      race_date: row.race_date,
      course: row.course,
      distance: row.distance,
      distance_yards: numberOrNull(row.distance_yards),
      segment: row.segment,
      surface: row.surface,
      going: row.going,
      actual: Number(row.actual),
      base_standard: Number(row.base_standard),
      base_sample: Number(row.base_sample),
      deviation_seconds: Number(row.deviation_seconds),
      deviation_per_f: Number(row.deviation_per_f),
      same_day_adj_per_f: numberOrNull(row.same_day_adj_per_f),
      historical_adj_per_f: numberOrNull(row.historical_adj_per_f),
      base_abs_error: Number(row.base_abs_error),
      same_day_abs_error: numberOrNull(row.same_day_abs_error),
      fallback_abs_error: numberOrNull(row.fallback_abs_error),
    };
  });
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function numberOrNull(value: string): number | null {
  return value === "" ? null : Number(value);
}

function sameDayKey(row: RaceRow): string {
  return `${row.race_date}:${row.course}`;
}

function historicalGroupKey(row: RaceRow): string {
  return [row.segment, row.surface || "missing", row.going || "missing"].join(" | ");
}

function compareChronology(a: RaceRow, b: RaceRow): number {
  return a.race_date.localeCompare(b.race_date) || a.race_source_id.localeCompare(b.race_source_id);
}

function groupBy<T>(rows: T[], keyForRow: (row: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyForRow(row);
    const values = grouped.get(key) ?? [];
    values.push(row);
    grouped.set(key, values);
  }
  return grouped;
}

function sortedEntries<T>(map: Map<string, T>): Array<[string, T]> {
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function sortedBucketEntries<T>(map: Map<string, T[]>, buckets: string[]): Array<[string, T[]]> {
  return buckets.flatMap((bucket) => {
    const rows = map.get(bucket);
    return rows ? [[bucket, rows] as [string, T[]]] : [];
  });
}

function percentile(sortedValues: number[], fraction: number): number | null {
  if (sortedValues.length === 0) {
    return null;
  }
  const index = (sortedValues.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) {
    return sortedValues[lower];
  }
  const weight = index - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

function pct(numerator: number, denominator: number): string {
  return denominator === 0 ? "-" : `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function fmt(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "-" : value.toFixed(2);
}

function fmtPct(value: number | null): string {
  return value === null ? "-" : `${value.toFixed(1)}%`;
}

function csv(values: Array<string | number>): string {
  return values
    .map((value) => {
      const text = String(value);
      return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
    })
    .join(",");
}

await main();
