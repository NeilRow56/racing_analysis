import { mkdir, readFile, writeFile } from "node:fs/promises";
import { mean, median, standardDeviation } from "@/lib/racing/speed-research";

const YEAR = process.argv[2] ?? "2025";
const START_DATE = `${YEAR}-01-01`;
const END_DATE = `${YEAR}-12-31`;
const RACE_CSV = `data/research/going-adjustment-races-${START_DATE}-${END_DATE}.csv`;
const RUNNER_CSV = `data/research/going-adjustment-runners-${START_DATE}-${END_DATE}.csv`;
const OUTPUT_DIR = "data/research";
const REPORT_PATH = `${OUTPUT_DIR}/jump-subtype-standard-diagnosis-${YEAR}.txt`;
const CSV_PATH = `${OUTPUT_DIR}/jump-subtype-standard-diagnosis-${YEAR}.csv`;

const MINIMUM_STANDARD_SAMPLE_SIZE = 2;
const MINIMUM_GROUP_REVIEW_SAMPLE_SIZE = 5;
const EXTREME_RACE_IDS = new Set(["856826", "891843", "836815"]);

type JumpSubtype = "hurdle" | "chase" | "nh_flat" | "unknown_other";

type RaceRow = {
  race_source_id: string;
  race_date: string;
  course: string;
  race_name: string;
  race_type: string;
  race_class: string;
  distance: string;
  distance_yards: number | null;
  segment: string;
  surface: string;
  going: string;
  actual: number;
  base_standard: number;
  base_sample: number;
  same_day_peer_count: number;
  same_day_stdev_per_f: number | null;
  conservative_same_day_adj_per_f: number | null;
  historical_adj_per_f: number | null;
  historical_fallback_sample_size: number;
};

type RunnerRow = {
  race_source_id: string;
  horse: string;
  finish_position: number | null;
  official_rating: number | null;
  equivalent_time_seconds: number;
  base_rating: number;
};

type SubtypeRace = RaceRow & {
  subtype: JumpSubtype;
  subtypeStandard: number | null;
  subtypeSampleSize: number;
  subtypeBaseError: number | null;
  subtypeSameDayError: number | null;
};

type RatingRow = RunnerRow & {
  race: SubtypeRace;
  subtypeRating: number | null;
  subtypeSameDayRating: number | null;
  subtypeHistoricalRating: number | null;
};

async function main() {
  const raceRecords = parseCsv(await readFile(RACE_CSV, "utf8"));
  const runnerRecords = parseCsv(await readFile(RUNNER_CSV, "utf8"));
  ensureEnrichedCsv(raceRecords, runnerRecords);

  const races = parseRaceRows(raceRecords)
    .filter((race) => race.segment === "jumps")
    .map((race) => ({
      ...race,
      subtype: classifyJumpSubtype(race),
      subtypeStandard: null,
      subtypeSampleSize: 0,
      subtypeBaseError: null,
      subtypeSameDayError: null,
    }));
  const subtypeRaces = attachSubtypeStandards(races);
  const raceById = new Map(subtypeRaces.map((race) => [race.race_source_id, race]));
  const ratings = parseRunnerRows(runnerRecords)
    .flatMap((runner) => {
      const race = raceById.get(runner.race_source_id);
      return race ? [{ ...runner, race, ...subtypeRatings(runner, race) }] : [];
    });

  const lines: string[] = [];
  lines.push(`# Jump Subtype Standard Diagnosis ${YEAR}`);
  lines.push("");
  lines.push("## Scope");
  lines.push(`race_csv=${RACE_CSV}`);
  lines.push(`runner_csv=${RUNNER_CSV}`);
  lines.push("production_changes=false");
  lines.push("subtype_standard=course + exact distance_yards + jump subtype, leave-one-out median");
  lines.push("same_day_rule=existing conservative same-day adjustment only, unchanged thresholds");
  lines.push("");
  lines.push("## Subtype Counts");
  lines.push(...subtypeCountLines(subtypeRaces));
  lines.push("");
  lines.push("## Standard Dispersion Summary");
  lines.push(...dispersionSummaryLines(subtypeRaces));
  lines.push("");
  lines.push("## Standard Dispersion Comparison");
  lines.push(...dispersionComparisonLines(subtypeRaces));
  lines.push("");
  lines.push("## Extreme Rating Recheck");
  lines.push(...extremeRecheckLines(ratings));
  lines.push("");
  lines.push("## Extreme Example Trace");
  lines.push(...extremeExampleLines(ratings, subtypeRaces));
  lines.push("");
  lines.push("## Same-Day Interaction");
  lines.push(...sameDayInteractionLines(subtypeRaces));
  lines.push("");
  lines.push("## Historical Fallback Safety");
  lines.push(...historicalFallbackLines(ratings));
  lines.push("");
  lines.push("## Rating Scale By Subtype");
  lines.push(...ratingDistributionLines(ratings));
  lines.push("");
  lines.push("## Conclusion");
  lines.push(...conclusionLines(ratings, subtypeRaces));

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(REPORT_PATH, `${lines.join("\n")}\n`);
  await writeFile(CSV_PATH, investigatedCsv(ratings));

  console.log(lines.slice(0, 90).join("\n"));
  console.log("");
  console.log(`full_report=${REPORT_PATH}`);
  console.log(`csv=${CSV_PATH}`);
}

function ensureEnrichedCsv(
  raceRecords: Array<Record<string, string>>,
  runnerRecords: Array<Record<string, string>>,
) {
  const race = raceRecords[0];
  const runner = runnerRecords[0];
  const neededRaceColumns = ["race_name", "race_type", "race_class"];
  const missing = neededRaceColumns.filter(
    (column) => !(column in race) || !(column in runner),
  );
  if (missing.length) {
    throw new Error(
      `Regenerate 2025 research data first; missing enriched columns: ${missing.join(
        ", ",
      )}`,
    );
  }
}

function attachSubtypeStandards(races: Array<RaceRow & { subtype: JumpSubtype }>): SubtypeRace[] {
  return races.map((race) => {
    const sample = races
      .filter((candidate) => candidate.race_source_id !== race.race_source_id)
      .filter((candidate) => standardKey(candidate) === standardKey(race))
      .map((candidate) => candidate.actual);
    const subtypeStandard =
      sample.length >= MINIMUM_STANDARD_SAMPLE_SIZE ? median(sample) : null;
    const subtypeSameDayExpected =
      subtypeStandard === null || race.conservative_same_day_adj_per_f === null || race.distance_yards === null
        ? null
        : subtypeStandard + race.conservative_same_day_adj_per_f * (race.distance_yards / 220);
    return {
      ...race,
      subtypeStandard,
      subtypeSampleSize: sample.length,
      subtypeBaseError: subtypeStandard === null ? null : Math.abs(race.actual - subtypeStandard),
      subtypeSameDayError:
        subtypeSameDayExpected === null ? null : Math.abs(race.actual - subtypeSameDayExpected),
    };
  });
}

function subtypeRatings(runner: RunnerRow, race: SubtypeRace) {
  return {
    subtypeRating: ratingForStandard(runner, race, race.subtypeStandard),
    subtypeSameDayRating: ratingForStandard(
      runner,
      race,
      adjustedStandard(race, race.subtypeStandard, race.conservative_same_day_adj_per_f),
    ),
    subtypeHistoricalRating: ratingForStandard(
      runner,
      race,
      adjustedStandard(race, race.subtypeStandard, race.historical_adj_per_f),
    ),
  };
}

function classifyJumpSubtype(race: Pick<RaceRow, "race_type" | "race_name">): JumpSubtype {
  return subtypeFromText(race.race_name) ?? subtypeFromText(race.race_type) ?? "unknown_other";
}

function subtypeFromText(value: string): Exclude<JumpSubtype, "unknown_other"> | null {
  const text = normalize(value);
  if (!text) {
    return null;
  }
  if (
    /\bnh flat\b/.test(text) ||
    /\bnational hunt flat\b/.test(text) ||
    /\bbumper\b/.test(text)
  ) {
    return "nh_flat";
  }
  if (/\bhurdles?\b/.test(text)) {
    return "hurdle";
  }
  if (/\bchase\b/.test(text) || /\bsteeplechase\b/.test(text)) {
    return "chase";
  }
  return null;
}

function subtypeCountLines(races: SubtypeRace[]): string[] {
  const grouped = groupBy(races, (race) => race.subtype);
  return subtypeOrder().map((subtype) => {
    const rows = grouped.get(subtype) ?? [];
    return `subtype_count | subtype=${subtype} | races=${rows.length}`;
  });
}

function dispersionSummaryLines(races: SubtypeRace[]): string[] {
  const comparable = [...groupBy(races, pooledKey).entries()]
    .filter(([, rows]) => rows.length >= MINIMUM_GROUP_REVIEW_SAMPLE_SIZE)
    .map(([, rows]) => {
      const pooledStdev = standardDeviation(rows.map((race) => race.actual));
      const subtypeStdev = weightedSubtypeStdev(rows);
      const subtypes = new Set(rows.map((race) => race.subtype));
      return {
        pooledStdev,
        subtypeStdev,
        subtypeCount: subtypes.size,
        reduction: pooledStdev === null || subtypeStdev === null ? null : pooledStdev - subtypeStdev,
      };
    })
    .filter((row) => row.reduction !== null);
  const mixed = comparable.filter((row) => row.subtypeCount > 1);
  return [
    [
      "dispersion_summary",
      "scope=all_repeated_jump_course_distance_groups",
      `groups=${comparable.length}`,
      `mixed_subtype_groups=${mixed.length}`,
      `median_stdev_reduction=${fmt(median(comparable.map((row) => row.reduction ?? 0)))}`,
      `mean_stdev_reduction=${fmt(mean(comparable.map((row) => row.reduction ?? 0)))}`,
      `improved_groups=${comparable.filter((row) => (row.reduction ?? 0) > 0).length}`,
      `worsened_groups=${comparable.filter((row) => (row.reduction ?? 0) < 0).length}`,
    ].join(" | "),
    [
      "dispersion_summary",
      "scope=mixed_subtype_repeated_jump_course_distance_groups",
      `groups=${mixed.length}`,
      `median_stdev_reduction=${fmt(median(mixed.map((row) => row.reduction ?? 0)))}`,
      `mean_stdev_reduction=${fmt(mean(mixed.map((row) => row.reduction ?? 0)))}`,
      `improved_groups=${mixed.filter((row) => (row.reduction ?? 0) > 0).length}`,
      `worsened_groups=${mixed.filter((row) => (row.reduction ?? 0) < 0).length}`,
    ].join(" | "),
  ];
}

function dispersionComparisonLines(races: SubtypeRace[]): string[] {
  const grouped = groupBy(races, pooledKey);
  return [...grouped.entries()]
    .filter(([, rows]) => rows.length >= MINIMUM_GROUP_REVIEW_SAMPLE_SIZE)
    .map(([key, rows]) => {
      const pooled = timingStats(rows.map((race) => race.actual));
      const subtypeWeightedStdev = weightedSubtypeStdev(rows);
      return {
        key,
        rows,
        pooled,
        subtypeWeightedStdev,
        reduction: pooled.stdev === null || subtypeWeightedStdev === null
          ? null
          : pooled.stdev - subtypeWeightedStdev,
      };
    })
    .sort((a, b) => (b.reduction ?? -Infinity) - (a.reduction ?? -Infinity))
    .slice(0, 40)
    .flatMap(({ key, rows, pooled, subtypeWeightedStdev, reduction }) => {
      const lines = [
        [
          "dispersion",
          `group="${key}"`,
          `pooled_count=${rows.length}`,
          `pooled_median=${fmt(pooled.median)}`,
          `pooled_mean=${fmt(pooled.mean)}`,
          `pooled_stdev=${fmt(pooled.stdev)}`,
          `pooled_iqr=${fmt(pooled.iqr)}`,
          `pooled_min=${fmt(pooled.min)}`,
          `pooled_max=${fmt(pooled.max)}`,
          `weighted_subtype_stdev=${fmt(subtypeWeightedStdev)}`,
          `stdev_reduction=${fmt(reduction)}`,
        ].join(" | "),
      ];
      for (const [subtype, subtypeRows] of sortedEntries(groupBy(rows, (race) => race.subtype))) {
        const stats = timingStats(subtypeRows.map((race) => race.actual));
        lines.push(
          [
            "subtype_group",
            `group="${key}"`,
            `subtype=${subtype}`,
            `races=${subtypeRows.length}`,
            `median=${fmt(stats.median)}`,
            `mean=${fmt(stats.mean)}`,
            `stdev=${fmt(stats.stdev)}`,
            `iqr=${fmt(stats.iqr)}`,
            `min=${fmt(stats.min)}`,
            `max=${fmt(stats.max)}`,
          ].join(" | "),
        );
      }
      return lines;
    });
}

function extremeRecheckLines(ratings: RatingRow[]): string[] {
  const extremes = ratings.filter((row) => row.base_rating < 0 || row.base_rating > 200);
  const comparable = extremes.filter((row) => row.subtypeRating !== null);
  const movedInside = comparable.filter(
    (row) => row.subtypeRating !== null && row.subtypeRating >= 0 && row.subtypeRating <= 200,
  ).length;
  const remainExtreme = comparable.length - movedInside;
  const changes = comparable.map((row) => Math.abs((row.subtypeRating ?? row.base_rating) - row.base_rating));
  const improved = comparable.filter((row) => distanceFromNormal(row.subtypeRating ?? row.base_rating) < distanceFromNormal(row.base_rating)).length;
  const worsened = comparable.filter((row) => distanceFromNormal(row.subtypeRating ?? row.base_rating) > distanceFromNormal(row.base_rating)).length;
  return [
    `base_jump_extreme_ratings=${extremes.length}`,
    `comparable_with_subtype_standard=${comparable.length}`,
    `moved_inside_0_200=${movedInside}`,
    `remain_extreme=${remainExtreme}`,
    `median_abs_rating_change=${fmt(median(changes))}`,
    `improved=${improved}`,
    `worsened=${worsened}`,
    `no_subtype_standard=${extremes.length - comparable.length}`,
  ];
}

function extremeExampleLines(ratings: RatingRow[], races: SubtypeRace[]): string[] {
  const raceById = new Map(races.map((race) => [race.race_source_id, race]));
  return [...EXTREME_RACE_IDS].map((raceId) => {
    const race = raceById.get(raceId);
    const winner = ratings.find((row) => row.race_source_id === raceId && row.finish_position === 1);
    if (!race || !winner) {
      return `example_trace | race=${raceId} | status=missing`;
    }
    return [
      "example_trace",
      `race=${raceId}`,
      `subtype=${race.subtype}`,
      `pooled_standard=${fmt(race.base_standard)}`,
      `subtype_standard=${fmt(race.subtypeStandard)}`,
      `pooled_sample=${race.base_sample}`,
      `subtype_sample=${race.subtypeSampleSize}`,
      `actual=${fmt(race.actual)}`,
      `pooled_deviation=${fmt(race.actual - race.base_standard)}`,
      `subtype_deviation=${fmt(race.subtypeStandard === null ? null : race.actual - race.subtypeStandard)}`,
      `pooled_winner_rating=${fmt(winner.base_rating)}`,
      `subtype_winner_rating=${fmt(winner.subtypeRating)}`,
    ].join(" | ");
  });
}

function sameDayInteractionLines(races: SubtypeRace[]): string[] {
  return subtypeOrder().map((subtype) => {
    const rows = races.filter((race) => race.subtype === subtype && race.subtypeBaseError !== null);
    const sameDayRows = rows.filter((race) => race.subtypeSameDayError !== null);
    return [
      "same_day_interaction",
      `subtype=${subtype}`,
      `base_races=${rows.length}`,
      `same_day_races=${sameDayRows.length}`,
      `subtype_base_median_abs_error=${fmt(median(rows.map((race) => race.subtypeBaseError ?? 0)))}`,
      `subtype_same_day_median_abs_error=${fmt(median(sameDayRows.map((race) => race.subtypeSameDayError ?? 0)))}`,
    ].join(" | ");
  });
}

function historicalFallbackLines(ratings: RatingRow[]): string[] {
  return subtypeOrder().map((subtype) => {
    const rows = ratings.filter((row) => row.race.subtype === subtype && row.subtypeHistoricalRating !== null);
    const outside = rows.filter(
      (row) => (row.subtypeHistoricalRating ?? 100) < 0 || (row.subtypeHistoricalRating ?? 100) > 200,
    ).length;
    return [
      "historical_fallback_safety",
      `subtype=${subtype}`,
      `runners=${rows.length}`,
      `outside_0_200=${outside}`,
      `median_abs_change_from_subtype=${fmt(median(rows.map((row) => Math.abs((row.subtypeHistoricalRating ?? 0) - (row.subtypeRating ?? 0)))))}`,
      `max_abs_change_from_subtype=${fmt(maxOrNull(rows.map((row) => Math.abs((row.subtypeHistoricalRating ?? 0) - (row.subtypeRating ?? 0)))))}`,
    ].join(" | ");
  });
}

function ratingDistributionLines(ratings: RatingRow[]): string[] {
  return subtypeOrder().map((subtype) => {
    const rows = ratings.filter((row) => row.race.subtype === subtype && row.subtypeRating !== null);
    const values = rows.map((row) => row.subtypeRating ?? 0).sort((a, b) => a - b);
    const paired = rows
      .filter((row) => row.official_rating !== null)
      .map((row) => [row.subtypeRating ?? 0, row.official_rating ?? 0] as const);
    return [
      "rating_distribution",
      `subtype=${subtype}`,
      `runners=${rows.length}`,
      `or_count=${paired.length}`,
      `or_correlation=${fmt(correlation(paired))}`,
      `mean=${fmt(mean(values))}`,
      `median=${fmt(median(values))}`,
      `stdev=${fmt(standardDeviation(values))}`,
      `p01=${fmt(percentile(values, 0.01))}`,
      `p99=${fmt(percentile(values, 0.99))}`,
      `below_0=${values.filter((value) => value < 0).length}`,
      `above_200=${values.filter((value) => value > 200).length}`,
      `outside_0_200=${values.filter((value) => value < 0 || value > 200).length}`,
    ].join(" | ");
  });
}

function conclusionLines(ratings: RatingRow[], races: SubtypeRace[]): string[] {
  const extremes = ratings.filter((row) => row.base_rating < 0 || row.base_rating > 200);
  const comparable = extremes.filter((row) => row.subtypeRating !== null);
  const movedInside = comparable.filter(
    (row) => row.subtypeRating !== null && row.subtypeRating >= 0 && row.subtypeRating <= 200,
  ).length;
  const baseRows = races.filter((race) => race.subtypeBaseError !== null);
  const sameDayRows = races.filter((race) => race.subtypeSameDayError !== null);
  return [
    `subtype_standard_coverage=${comparable.length}/${extremes.length} base_extreme_runner_ratings`,
    `extreme_reduction=${movedInside} moved inside 0..200`,
    `same_day_after_subtype_base=${fmt(median(baseRows.map((race) => race.subtypeBaseError ?? 0)))} same_day=${fmt(median(sameDayRows.map((race) => race.subtypeSameDayError ?? 0)))}`,
    "production_readiness=do not promote jumps yet; confirm subtype classification quality and residual extremes first",
    "rating_scale_note=if subtype standards do not remove most extremes, jump seconds-to-rating scaling still needs review",
  ];
}

function investigatedCsv(ratings: RatingRow[]): string {
  const rows = [
    [
      "race_source_id",
      "date",
      "course",
      "race_type",
      "subtype",
      "distance",
      "distance_yards",
      "horse",
      "finish_position",
      "or",
      "pooled_rating",
      "subtype_rating",
      "subtype_same_day_rating",
      "subtype_historical_rating",
      "pooled_standard",
      "subtype_standard",
      "pooled_sample",
      "subtype_sample",
    ],
  ];
  for (const row of ratings
    .filter((rating) => rating.base_rating < 0 || rating.base_rating > 200)
    .sort((a, b) => distanceFromNormal(b.base_rating) - distanceFromNormal(a.base_rating))
    .slice(0, 500)) {
    rows.push([
      row.race_source_id,
      row.race.race_date,
      row.race.course,
      row.race.race_type,
      row.race.subtype,
      row.race.distance,
      String(row.race.distance_yards ?? ""),
      row.horse,
      String(row.finish_position ?? ""),
      String(row.official_rating ?? ""),
      fmt(row.base_rating),
      fmt(row.subtypeRating),
      fmt(row.subtypeSameDayRating),
      fmt(row.subtypeHistoricalRating),
      fmt(row.race.base_standard),
      fmt(row.race.subtypeStandard),
      String(row.race.base_sample),
      String(row.race.subtypeSampleSize),
    ]);
  }
  return `${rows.map((row) => csv(row)).join("\n")}\n`;
}

function ratingForStandard(
  runner: RunnerRow,
  race: SubtypeRace,
  standardSeconds: number | null,
): number | null {
  if (standardSeconds === null || race.distance_yards === null || race.actual <= 0) {
    return null;
  }
  const secondsPerLength = (8 / 3) / (race.distance_yards / race.actual);
  return 100 + (standardSeconds - runner.equivalent_time_seconds) / secondsPerLength;
}

function adjustedStandard(
  race: SubtypeRace,
  standard: number | null,
  adjustmentPerFurlong: number | null,
): number | null {
  if (standard === null || adjustmentPerFurlong === null || race.distance_yards === null) {
    return null;
  }
  return standard + adjustmentPerFurlong * (race.distance_yards / 220);
}

function weightedSubtypeStdev(rows: SubtypeRace[]): number | null {
  let numerator = 0;
  let denominator = 0;
  for (const subtypeRows of groupBy(rows, (race) => race.subtype).values()) {
    const stdev = standardDeviation(subtypeRows.map((race) => race.actual));
    if (stdev === null) {
      continue;
    }
    numerator += stdev * subtypeRows.length;
    denominator += subtypeRows.length;
  }
  return denominator === 0 ? null : numerator / denominator;
}

function timingStats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const p25 = percentile(sorted, 0.25);
  const p75 = percentile(sorted, 0.75);
  return {
    median: median(sorted),
    mean: mean(sorted),
    stdev: standardDeviation(sorted),
    iqr: p25 === null || p75 === null ? null : p75 - p25,
    min: sorted[0] ?? null,
    max: sorted.at(-1) ?? null,
  };
}

function standardKey(race: Pick<RaceRow, "course" | "distance_yards"> & { subtype: JumpSubtype }): string {
  return `${pooledKey(race)}:${race.subtype}`;
}

function pooledKey(race: Pick<RaceRow, "course" | "distance_yards">): string {
  return `${race.course}:${race.distance_yards ?? "unknown"}`;
}

function distanceFromNormal(value: number): number {
  if (value < 0) {
    return Math.abs(value);
  }
  if (value > 200) {
    return value - 200;
  }
  return 0;
}

function subtypeOrder(): JumpSubtype[] {
  return ["hurdle", "chase", "nh_flat", "unknown_other"];
}

function parseRaceRows(records: Array<Record<string, string>>): RaceRow[] {
  return records.map((row) => ({
    race_source_id: row.race_source_id,
    race_date: row.race_date,
    course: row.course,
    race_name: row.race_name,
    race_type: row.race_type,
    race_class: row.race_class,
    distance: row.distance,
    distance_yards: numberOrNull(row.distance_yards),
    segment: row.segment,
    surface: row.surface,
    going: row.going,
    actual: Number(row.actual),
    base_standard: Number(row.base_standard),
    base_sample: Number(row.base_sample),
    same_day_peer_count: Number(row.same_day_peer_count),
    same_day_stdev_per_f: numberOrNull(row.same_day_stdev_per_f),
    conservative_same_day_adj_per_f: numberOrNull(row.conservative_same_day_adj_per_f),
    historical_adj_per_f: numberOrNull(row.historical_adj_per_f),
    historical_fallback_sample_size: Number(row.historical_fallback_sample_size),
  }));
}

function parseRunnerRows(records: Array<Record<string, string>>): RunnerRow[] {
  return records.map((row) => ({
    race_source_id: row.race_source_id,
    horse: row.horse,
    finish_position: numberOrNull(row.finish_position),
    official_rating: numberOrNull(row.official_rating),
    equivalent_time_seconds: Number(row.equivalent_time_seconds),
    base_rating: Number(row.base_rating),
  }));
}

function parseCsv(text: string): Array<Record<string, string>> {
  const [headerLine, ...lines] = text.trim().split(/\r?\n/);
  const headers = parseCsvLine(headerLine);
  return lines.map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
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

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ");
}

function numberOrNull(value: string): number | null {
  return value === "" ? null : Number(value);
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

function maxOrNull(values: number[]): number | null {
  return values.length ? Math.max(...values) : null;
}

function fmt(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "-" : value.toFixed(2);
}

function csv(values: string[]): string {
  return values
    .map((value) => (/[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value))
    .join(",");
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
