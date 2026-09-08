import { mkdir, readFile, writeFile } from "node:fs/promises";
import { mean, median, standardDeviation } from "@/lib/racing/speed-research";

const YEAR = process.argv[2] ?? "2025";
const START_DATE = `${YEAR}-01-01`;
const END_DATE = `${YEAR}-12-31`;
const INPUT_CSV = `data/research/going-adjustment-runners-${START_DATE}-${END_DATE}.csv`;
const OUTPUT_DIR = "data/research";
const REPORT_PATH = `${OUTPUT_DIR}/going-adjustment-rating-validation-${YEAR}.txt`;
const SUMMARY_CSV_PATH = `${OUTPUT_DIR}/going-adjustment-rating-validation-summary-${YEAR}.csv`;

type RatingMethod =
  | "base"
  | "same_day"
  | "conservative_same_day"
  | "historical_fallback"
  | "conservative_hierarchy";

type RunnerRow = {
  race_source_id: string;
  race_date: string;
  course: string;
  distance: string;
  distance_yards: number | null;
  segment: string;
  surface: string;
  going: string;
  runner_source_id: string;
  horse: string;
  finish_position: number | null;
  official_rating: number | null;
  same_day_peer_count: number;
  same_day_stdev_per_f: number | null;
  historical_fallback_sample_size: number;
  base_rating: number | null;
  same_day_rating: number | null;
  conservative_same_day_rating: number | null;
  historical_fallback_rating: number | null;
  conservative_hierarchy_rating: number | null;
  conservative_hierarchy_method: string;
};

type RatingStats = {
  method: RatingMethod;
  rows: RunnerRow[];
  runnerCount: number;
  orCount: number;
  pearson: number | null;
  spearman: number | null;
  meanRating: number | null;
  medianRating: number | null;
  stdev: number | null;
  p01: number | null;
  p99: number | null;
  belowZero: number;
  aboveTwoHundred: number;
  outside0To200: number;
  medianAbsDiffOr: number | null;
  meanAbsDiffOr: number | null;
};

async function main() {
  const rows = parseRows(await readFile(INPUT_CSV, "utf8"));
  const lines: string[] = [];
  lines.push(`# Going Adjustment Rating Validation ${YEAR}`);
  lines.push("");
  lines.push("## Overall And Segment Rating Quality");
  lines.push(...ratingQualityLines(rows));
  lines.push("");
  lines.push("## Winner Placed Unplaced Sanity");
  lines.push(...finishBucketLines(rows));
  lines.push("");
  lines.push("## Within-Race Ordering");
  lines.push(...withinRaceOrderingLines(rows));
  lines.push("");
  lines.push("## Extreme Rating Review");
  lines.push(...extremeRatingLines(rows));
  lines.push("");
  lines.push("## Conclusion");
  lines.push(...conclusionLines(rows));

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(REPORT_PATH, `${lines.join("\n")}\n`);
  await writeFile(SUMMARY_CSV_PATH, summaryCsv(rows));

  console.log(lines.slice(0, 90).join("\n"));
  console.log("");
  console.log(`full_report=${REPORT_PATH}`);
  console.log(`summary_csv=${SUMMARY_CSV_PATH}`);
}

function ratingQualityLines(rows: RunnerRow[]): string[] {
  const groups: Array<[string, RunnerRow[]]> = [
    ["overall", rows],
    ...sortedEntries(groupBy(rows, (row) => row.segment)),
  ];
  return groups.flatMap(([group, groupRows]) =>
    methods().map((method) => formatRatingStats(group, ratingStats(method, groupRows))),
  );
}

function ratingStats(method: RatingMethod, sourceRows: RunnerRow[]): RatingStats {
  const rows = sourceRows.filter((row) => ratingFor(row, method) !== null);
  const values = rows.map((row) => ratingFor(row, method) ?? 0).sort((a, b) => a - b);
  const paired = rows
    .filter((row) => row.official_rating !== null)
    .map((row) => [ratingFor(row, method) ?? 0, row.official_rating ?? 0] as const);
  const absDiffs = paired.map(([rating, officialRating]) => Math.abs(rating - officialRating)).sort((a, b) => a - b);
  return {
    method,
    rows,
    runnerCount: rows.length,
    orCount: paired.length,
    pearson: correlation(paired),
    spearman: spearmanCorrelation(paired),
    meanRating: mean(values),
    medianRating: median(values),
    stdev: standardDeviation(values),
    p01: percentile(values, 0.01),
    p99: percentile(values, 0.99),
    belowZero: values.filter((value) => value < 0).length,
    aboveTwoHundred: values.filter((value) => value > 200).length,
    outside0To200: values.filter((value) => value < 0 || value > 200).length,
    medianAbsDiffOr: median(absDiffs),
    meanAbsDiffOr: mean(absDiffs),
  };
}

function formatRatingStats(group: string, stats: RatingStats): string {
  return [
    "rating_quality",
    `group=${group}`,
    `method=${stats.method}`,
    `runners=${stats.runnerCount}`,
    `or_count=${stats.orCount}`,
    `pearson_or=${fmt(stats.pearson)}`,
    `spearman_or=${fmt(stats.spearman)}`,
    `mean=${fmt(stats.meanRating)}`,
    `median=${fmt(stats.medianRating)}`,
    `stdev=${fmt(stats.stdev)}`,
    `p01=${fmt(stats.p01)}`,
    `p99=${fmt(stats.p99)}`,
    `below_0=${stats.belowZero}`,
    `above_200=${stats.aboveTwoHundred}`,
    `outside_0_200=${stats.outside0To200}`,
    `median_abs_diff_or=${fmt(stats.medianAbsDiffOr)}`,
    `mean_abs_diff_or=${fmt(stats.meanAbsDiffOr)}`,
  ].join(" | ");
}

function finishBucketLines(rows: RunnerRow[]): string[] {
  return methods().flatMap((method) =>
    sortedEntries(groupBy(rows.filter((row) => ratingFor(row, method) !== null), finishBucket)).map(([bucket, bucketRows]) => {
      const values = bucketRows.map((row) => ratingFor(row, method) ?? 0).sort((a, b) => a - b);
      return [
        "finish_bucket",
        `method=${method}`,
        `bucket=${bucket}`,
        `runners=${bucketRows.length}`,
        `median=${fmt(median(values))}`,
        `mean=${fmt(mean(values))}`,
        `p25=${fmt(percentile(values, 0.25))}`,
        `p75=${fmt(percentile(values, 0.75))}`,
      ].join(" | ");
    }),
  );
}

function withinRaceOrderingLines(rows: RunnerRow[]): string[] {
  return methods().map((method) => {
    const pairs = sortedEntries(groupBy(rows.filter((row) => ratingFor(row, method) !== null && row.finish_position !== null), (row) => row.race_source_id))
      .flatMap(([, raceRows]) => {
        if (raceRows.length < 2) {
          return [];
        }
        return raceRows.map((row) => [row.finish_position ?? 0, -(ratingFor(row, method) ?? 0)] as const);
      });
    return [
      "within_race_ordering",
      `method=${method}`,
      `runner_pairs=${pairs.length}`,
      `spearman_finish_vs_negative_rating=${fmt(spearmanCorrelation(pairs))}`,
    ].join(" | ");
  });
}

function extremeRatingLines(rows: RunnerRow[]): string[] {
  return methods().flatMap((method) => {
    const eligible = rows.filter((row) => ratingFor(row, method) !== null);
    const extremes = [...eligible]
      .sort((a, b) => Math.abs((ratingFor(b, method) ?? 100) - 100) - Math.abs((ratingFor(a, method) ?? 100) - 100))
      .slice(0, 8);
    return extremes.map((row) =>
      [
        "extreme_rating",
        `method=${method}`,
        `rating=${fmt(ratingFor(row, method))}`,
        `race=${row.race_source_id}`,
        `date=${row.race_date}`,
        `course=${row.course}`,
        `distance="${row.distance}"`,
        `going="${row.going}"`,
        `runner="${row.horse}"`,
        `finish=${row.finish_position ?? "-"}`,
        `OR=${row.official_rating ?? "-"}`,
        `base_rating=${fmt(row.base_rating)}`,
        `same_day_rating=${fmt(row.same_day_rating)}`,
        `conservative_hierarchy_rating=${fmt(row.conservative_hierarchy_rating)}`,
        `same_day_peers=${row.same_day_peer_count}`,
        `same_day_stdev=${fmt(row.same_day_stdev_per_f)}`,
        `historical_sample=${row.historical_fallback_sample_size}`,
      ].join(" | "),
    );
  });
}

function conclusionLines(rows: RunnerRow[]): string[] {
  const base = ratingStats("base", rows);
  const sameDay = ratingStats("same_day", rows);
  const conservative = ratingStats("conservative_hierarchy", rows);
  const awBase = ratingStats("base", rows.filter((row) => row.segment === "all_weather_flat"));
  const awHierarchy = ratingStats("conservative_hierarchy", rows.filter((row) => row.segment === "all_weather_flat"));
  return [
    `same_day_or_delta=${fmt((sameDay.pearson ?? 0) - (base.pearson ?? 0))} median_abs_diff_or_delta=${fmt((sameDay.medianAbsDiffOr ?? 0) - (base.medianAbsDiffOr ?? 0))}`,
    `conservative_hierarchy_or_delta=${fmt((conservative.pearson ?? 0) - (base.pearson ?? 0))} median_abs_diff_or_delta=${fmt((conservative.medianAbsDiffOr ?? 0) - (base.medianAbsDiffOr ?? 0))}`,
    `aw_hierarchy_or_delta=${fmt((awHierarchy.pearson ?? 0) - (awBase.pearson ?? 0))}`,
    "interpretation=judge timing stability and rating quality together; better timing residuals alone are not enough for production",
  ];
}

function summaryCsv(rows: RunnerRow[]): string {
  const output = [
    ["group", "method", "runners", "or_count", "pearson_or", "spearman_or", "mean", "median", "stdev", "p01", "p99", "below_0", "above_200", "outside_0_200", "median_abs_diff_or", "mean_abs_diff_or"],
  ];
  for (const [group, groupRows] of [["overall", rows] as const, ...sortedEntries(groupBy(rows, (row) => row.segment))]) {
    for (const method of methods()) {
      const stats = ratingStats(method, groupRows);
      output.push([
        group,
        method,
        String(stats.runnerCount),
        String(stats.orCount),
        fmt(stats.pearson),
        fmt(stats.spearman),
        fmt(stats.meanRating),
        fmt(stats.medianRating),
        fmt(stats.stdev),
        fmt(stats.p01),
        fmt(stats.p99),
        String(stats.belowZero),
        String(stats.aboveTwoHundred),
        String(stats.outside0To200),
        fmt(stats.medianAbsDiffOr),
        fmt(stats.meanAbsDiffOr),
      ]);
    }
  }
  return `${output.map((row) => csv(row)).join("\n")}\n`;
}

function methods(): RatingMethod[] {
  return ["base", "same_day", "conservative_same_day", "historical_fallback", "conservative_hierarchy"];
}

function ratingFor(row: RunnerRow, method: RatingMethod): number | null {
  if (method === "base") {
    return row.base_rating;
  }
  if (method === "same_day") {
    return row.same_day_rating;
  }
  if (method === "conservative_same_day") {
    return row.conservative_same_day_rating;
  }
  if (method === "historical_fallback") {
    return row.historical_fallback_rating;
  }
  return row.conservative_hierarchy_rating;
}

function finishBucket(row: RunnerRow): string {
  if (row.finish_position === 1) {
    return "winner";
  }
  if (row.finish_position !== null && row.finish_position <= 3) {
    return "placed";
  }
  return "unplaced";
}

function parseRows(text: string): RunnerRow[] {
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
      runner_source_id: row.runner_source_id,
      horse: row.horse,
      finish_position: numberOrNull(row.finish_position),
      official_rating: numberOrNull(row.official_rating),
      same_day_peer_count: Number(row.same_day_peer_count),
      same_day_stdev_per_f: numberOrNull(row.same_day_stdev_per_f),
      historical_fallback_sample_size: Number(row.historical_fallback_sample_size),
      base_rating: numberOrNull(row.base_rating),
      same_day_rating: numberOrNull(row.same_day_rating),
      conservative_same_day_rating: numberOrNull(row.conservative_same_day_rating),
      historical_fallback_rating: numberOrNull(row.historical_fallback_rating),
      conservative_hierarchy_rating: numberOrNull(row.conservative_hierarchy_rating),
      conservative_hierarchy_method: row.conservative_hierarchy_method,
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

function spearmanCorrelation(pairs: readonly (readonly [number, number])[]): number | null {
  if (pairs.length < 2) {
    return null;
  }
  return correlation(rankPairs(pairs));
}

function rankPairs(pairs: readonly (readonly [number, number])[]): Array<readonly [number, number]> {
  const xRanks = ranks(pairs.map(([x]) => x));
  const yRanks = ranks(pairs.map(([, y]) => y));
  return xRanks.map((xRank, index) => [xRank, yRanks[index]] as const);
}

function ranks(values: number[]): number[] {
  const sorted = values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value);
  const output = Array<number>(values.length);
  let index = 0;
  while (index < sorted.length) {
    let end = index + 1;
    while (end < sorted.length && sorted[end].value === sorted[index].value) {
      end += 1;
    }
    const rank = (index + 1 + end) / 2;
    for (let cursor = index; cursor < end; cursor += 1) {
      output[sorted[cursor].index] = rank;
    }
    index = end;
  }
  return output;
}

function correlation(pairs: readonly (readonly [number, number])[]): number | null {
  if (pairs.length < 2) {
    return null;
  }
  const xs = pairs.map(([x]) => x);
  const ys = pairs.map(([, y]) => y);
  const xMean = mean(xs);
  const yMean = mean(ys);
  if (xMean === null || yMean === null) {
    return null;
  }
  let numerator = 0;
  let xTotal = 0;
  let yTotal = 0;
  for (const [x, y] of pairs) {
    numerator += (x - xMean) * (y - yMean);
    xTotal += (x - xMean) ** 2;
    yTotal += (y - yMean) ** 2;
  }
  if (xTotal === 0 || yTotal === 0) {
    return null;
  }
  return numerator / Math.sqrt(xTotal * yTotal);
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

function fmt(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "-" : value.toFixed(2);
}

function csv(values: string[]): string {
  return values
    .map((value) => (/[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value))
    .join(",");
}

await main();
