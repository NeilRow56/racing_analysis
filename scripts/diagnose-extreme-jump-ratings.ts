import { mkdir, readFile, writeFile } from "node:fs/promises";
import { mean, median, standardDeviation } from "@/lib/racing/speed-research";

const YEAR = process.argv[2] ?? "2025";
const START_DATE = `${YEAR}-01-01`;
const END_DATE = `${YEAR}-12-31`;
const RACE_CSV = `data/research/going-adjustment-races-${START_DATE}-${END_DATE}.csv`;
const RUNNER_CSV = `data/research/going-adjustment-runners-${START_DATE}-${END_DATE}.csv`;
const OUTPUT_DIR = "data/research";
const REPORT_PATH = `${OUTPUT_DIR}/extreme-jump-rating-diagnosis-${YEAR}.txt`;
const EXTREME_CSV_PATH = `${OUTPUT_DIR}/extreme-jump-rating-diagnosis-${YEAR}.csv`;

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
  deviation_seconds: number;
  deviation_per_f: number;
  same_day_adj_per_f: number | null;
  same_day_peer_count: number;
  same_day_stdev_per_f: number | null;
  historical_adj_per_f: number | null;
  historical_fallback_sample_size: number;
};

type RunnerRow = {
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
  actual_winning_time: number;
  equivalent_time_seconds: number;
  runner_source_id: string;
  horse: string;
  finish_position: number | null;
  official_rating: number | null;
  base_standard: number;
  same_day_adj_per_f: number | null;
  same_day_peer_count: number;
  same_day_stdev_per_f: number | null;
  historical_adj_per_f: number | null;
  historical_fallback_sample_size: number;
  base_rating: number;
  same_day_rating: number | null;
  historical_fallback_rating: number | null;
  conservative_hierarchy_rating: number;
};

type StandardSample = {
  races: RaceRow[];
  median: number | null;
  mean: number | null;
  stdev: number | null;
  min: number | null;
  max: number | null;
  iqr: number | null;
};

const LISTED_RACE_IDS = new Set(["856826", "891843", "836815"]);

async function main() {
  const races = parseRaceRows(await readFile(RACE_CSV, "utf8"));
  const runners = parseRunnerRows(await readFile(RUNNER_CSV, "utf8"));
  const raceById = new Map(races.map((race) => [race.race_source_id, race]));
  const runnersByRace = groupBy(runners, (runner) => runner.race_source_id);
  const jumpExtremeRunners = runners.filter(
    (runner) =>
      runner.segment === "jumps" &&
      (runner.base_rating < 0 || runner.base_rating > 200),
  );
  const investigatedRaceIds = investigatedRaces(jumpExtremeRunners);
  const investigatedRows = investigatedRaceIds.flatMap((raceId) => {
    const race = raceById.get(raceId);
    if (!race) {
      return [];
    }
    return traceRace(race, runnersByRace.get(raceId) ?? [], races);
  });

  const lines: string[] = [];
  lines.push(`# Extreme Jump Rating Diagnosis ${YEAR}`);
  lines.push("");
  lines.push("## Scope");
  lines.push(`race_csv=${RACE_CSV}`);
  lines.push(`runner_csv=${RUNNER_CSV}`);
  lines.push("production_changes=false");
  lines.push("rating_formula=100 + (standard_seconds - equivalent_runner_time_seconds) / speed_based_seconds_per_length");
  lines.push("speed_based_seconds_per_length=(8/3 yards) / (distance_yards / actual_winning_time_seconds)");
  lines.push("standard_sample_scope=selected-year race CSV, same course + exact distance_yards, excluding target race");
  lines.push("race_type_and_class=used_when_present; unavailable in the current pre-enrichment 2025 CSV");
  lines.push("");
  lines.push("## Extreme Base Rating Cause Counts");
  lines.push(...causeCountLines(jumpExtremeRunners, raceById, races));
  lines.push("");
  lines.push("## Traced Extreme Races");
  lines.push(...investigatedRows);
  lines.push("");
  lines.push("## Course-Distance Standard Samples");
  lines.push(...standardSampleLines(investigatedRaceIds, raceById, races));
  lines.push("");
  lines.push("## Jump Subtype Split");
  lines.push("subtype_split_status=not_available_from_current_2025_csv");
  lines.push("reason=current generated CSV predates race_type/race_name/race_class columns; the research script now emits them on rerun");
  lines.push("");
  lines.push("## Rating Scale Worked Examples");
  lines.push(...workedExampleLines(runners, raceById));
  lines.push("");
  lines.push("## Doncaster Historical Fallback Safety");
  lines.push(...doncasterFallbackLines(runners, raceById));
  lines.push("");
  lines.push("## Segment-Specific Recommendations");
  lines.push(...segmentRecommendationLines());

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(REPORT_PATH, `${lines.join("\n")}\n`);
  await writeFile(EXTREME_CSV_PATH, investigatedCsv(jumpExtremeRunners, raceById, races));

  console.log(lines.slice(0, 90).join("\n"));
  console.log("");
  console.log(`full_report=${REPORT_PATH}`);
  console.log(`extreme_csv=${EXTREME_CSV_PATH}`);
}

function investigatedRaces(extremeRunners: RunnerRow[]): string[] {
  const topRaceIds = [...groupBy(extremeRunners, (runner) => runner.race_source_id).entries()]
    .map(([raceId, rows]) => ({
      raceId,
      worstAbs: Math.max(...rows.map((row) => Math.abs(row.base_rating - 100))),
      count: rows.length,
    }))
    .sort((a, b) => b.worstAbs - a.worstAbs || b.count - a.count)
    .slice(0, 8)
    .map((row) => row.raceId);
  return [...new Set([...LISTED_RACE_IDS, ...topRaceIds])];
}

function traceRace(
  race: RaceRow,
  runners: RunnerRow[],
  allRaces: RaceRow[],
): string[] {
  const sample = standardSample(race, allRaces);
  const winner = runners.find((runner) => runner.finish_position === 1);
  const furlongs = race.distance_yards === null ? null : race.distance_yards / 220;
  const spl = speedBasedSecondsPerLength(race);
  const lines = [
    [
      "race_trace",
      `race=${race.race_source_id}`,
      `date=${race.race_date}`,
      `course=${race.course}`,
      `distance="${race.distance}"`,
      `distance_yards=${race.distance_yards ?? "-"}`,
      `furlongs=${fmt(furlongs)}`,
      `segment=${race.segment}`,
      `race_name="${race.race_name || "unavailable"}"`,
      `race_type=${race.race_type || "unavailable"}`,
      `class=${race.race_class || "unavailable"}`,
      `surface=${race.surface}`,
      `going="${race.going}"`,
      `winning_time=${fmt(race.actual)}`,
      `base_standard=${fmt(race.base_standard)}`,
      `base_sample=${race.base_sample}`,
      `sample_median=${fmt(sample.median)}`,
      `sample_mean=${fmt(sample.mean)}`,
      `sample_fastest=${fmt(sample.min)}`,
      `sample_slowest=${fmt(sample.max)}`,
      `sample_stdev=${fmt(sample.stdev)}`,
      `actual_minus_standard=${fmt(race.deviation_seconds)}`,
      `deviation_per_f=${fmt(race.deviation_per_f)}`,
      `speed_based_spl=${fmt(spl)}`,
      `winner_base_rating=${fmt(winner?.base_rating ?? null)}`,
    ].join(" | "),
  ];

  for (const runner of [...runners].sort((a, b) => Math.abs(b.base_rating - 100) - Math.abs(a.base_rating - 100)).slice(0, 8)) {
    lines.push(
      [
        "runner_trace",
        `race=${race.race_source_id}`,
        `runner="${runner.horse}"`,
        `finish=${runner.finish_position ?? "-"}`,
        `OR=${runner.official_rating ?? "-"}`,
        `equivalent_time=${fmt(runner.equivalent_time_seconds)}`,
        `winner_time=${fmt(runner.actual_winning_time)}`,
        `beaten_seconds=${fmt(runner.equivalent_time_seconds - runner.actual_winning_time)}`,
        `beaten_rating_points=${fmt((winner?.base_rating ?? runner.base_rating) - runner.base_rating)}`,
        `base_rating=${fmt(runner.base_rating)}`,
        `same_day_rating=${fmt(runner.same_day_rating)}`,
        `historical_fallback_rating=${fmt(runner.historical_fallback_rating)}`,
        `same_day_peers=${runner.same_day_peer_count}`,
        `same_day_stdev=${fmt(runner.same_day_stdev_per_f)}`,
        `historical_sample=${runner.historical_fallback_sample_size}`,
      ].join(" | "),
    );
  }
  return lines;
}

function standardSampleLines(
  raceIds: string[],
  raceById: Map<string, RaceRow>,
  allRaces: RaceRow[],
): string[] {
  return raceIds.flatMap((raceId) => {
    const race = raceById.get(raceId);
    if (!race) {
      return [`standard_sample race=${raceId} status=missing_from_race_csv`];
    }
    const sample = standardSample(race, allRaces);
    const obviousOutliers = sample.races.filter(
      (candidate) =>
        sample.median !== null &&
        sample.stdev !== null &&
        Math.abs(candidate.actual - sample.median) > Math.max(20, sample.stdev * 2),
    );
    const lines = [
      [
        "standard_sample_summary",
        `race=${raceId}`,
        `course=${race.course}`,
        `distance_yards=${race.distance_yards ?? "-"}`,
        `contributing=${sample.races.length}`,
        `dates=${unique(sample.races.map((row) => row.race_date)).slice(0, 12).join(";")}`,
        `distance_labels=${unique(sample.races.map((row) => row.distance)).join(";")}`,
        `surfaces=${counter(sample.races.map((row) => row.surface))}`,
        `goings=${counter(sample.races.map((row) => row.going))}`,
        `median=${fmt(sample.median)}`,
        `stdev=${fmt(sample.stdev)}`,
        `iqr=${fmt(sample.iqr)}`,
        `min=${fmt(sample.min)}`,
        `max=${fmt(sample.max)}`,
        `obvious_outliers=${obviousOutliers.length}`,
        `subtype_mixing=unknown_from_current_csv`,
      ].join(" | "),
    ];
    for (const candidate of [...sample.races].sort((a, b) => Math.abs((b.actual - (sample.median ?? b.actual))) - Math.abs((a.actual - (sample.median ?? a.actual)))).slice(0, 12)) {
      lines.push(
        [
          "standard_sample_race",
          `target=${raceId}`,
          `sample_race=${candidate.race_source_id}`,
          `date=${candidate.race_date}`,
          `surface=${candidate.surface}`,
          `going="${candidate.going}"`,
          `distance="${candidate.distance}"`,
          `winning_time=${fmt(candidate.actual)}`,
          `delta_from_sample_median=${fmt(sample.median === null ? null : candidate.actual - sample.median)}`,
        ].join(" | "),
      );
    }
    return lines;
  });
}

function causeCountLines(
  extremeRunners: RunnerRow[],
  raceById: Map<string, RaceRow>,
  allRaces: RaceRow[],
): string[] {
  const counts: Record<string, number> = {};
  for (const runner of extremeRunners) {
    const race = raceById.get(runner.race_source_id);
    if (!race) {
      increment(counts, "unknown");
      continue;
    }
    const sample = standardSample(race, allRaces);
    const winner = allRaceWinner(runner.race_source_id, extremeRunners);
    const cause = classifyCause(runner, race, sample, winner);
    increment(counts, cause);
  }
  return Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .map(([cause, count]) => `cause_count | cause=${cause} | runner_extremes=${count}`);
}

function classifyCause(
  runner: RunnerRow,
  race: RaceRow,
  sample: StandardSample,
  winner: RunnerRow | null,
): string {
  if (race.base_sample < 5) {
    return "weak_course_distance_sample";
  }
  if (sample.stdev !== null && sample.stdev > 20) {
    return "high_dispersion_standard";
  }
  if (Math.abs(race.deviation_per_f) > 1.5) {
    return "bad_or_implausible_winning_time_or_configuration";
  }
  if (Math.abs(race.deviation_per_f) > 0.75) {
    return "unusually_slow_or_fast_going";
  }
  if (
    winner &&
    winner.base_rating >= 0 &&
    winner.base_rating <= 200 &&
    (runner.base_rating < 0 || runner.base_rating > 200)
  ) {
    return "runner_beaten_distance_amplification";
  }
  if (unique(sample.races.map((row) => row.distance)).length > 1) {
    return "distance_configuration_mismatch";
  }
  return "unknown_or_subtype_mixing_possible";
}

function workedExampleLines(
  runners: RunnerRow[],
  raceById: Map<string, RaceRow>,
): string[] {
  const examples = [
    ["normal_aw", normalWinner(runners, "all_weather_flat")],
    ["normal_turf_flat", normalWinner(runners, "turf_flat")],
    ["normal_jump", normalWinner(runners, "jumps")],
    ["plumpton_extreme", winnerForRace(runners, "856826")],
    ["doncaster_extreme", winnerForRace(runners, "891843")],
  ] as const;
  return examples.map(([label, runner]) => {
    if (!runner) {
      return `worked_example label=${label} status=missing`;
    }
    const race = raceById.get(runner.race_source_id);
    if (!race) {
      return `worked_example label=${label} race=${runner.race_source_id} status=race_missing`;
    }
    const spl = speedBasedSecondsPerLength(race);
    return [
      "worked_example",
      `label=${label}`,
      `race=${runner.race_source_id}`,
      `course=${runner.course}`,
      `distance="${runner.distance}"`,
      `going="${runner.going}"`,
      `actual=${fmt(race.actual)}`,
      `standard=${fmt(race.base_standard)}`,
      `equivalent_time=${fmt(runner.equivalent_time_seconds)}`,
      `speed_based_spl=${fmt(spl)}`,
      `time_diff=${fmt(race.base_standard - runner.equivalent_time_seconds)}`,
      `rating=100 + time_diff / spl = ${fmt(runner.base_rating)}`,
    ].join(" | ");
  });
}

function doncasterFallbackLines(
  runners: RunnerRow[],
  raceById: Map<string, RaceRow>,
): string[] {
  const race = raceById.get("891843");
  const winner = winnerForRace(runners, "891843");
  if (!race || !winner || race.distance_yards === null) {
    return ["doncaster_fallback status=missing"];
  }
  const furlongs = race.distance_yards / 220;
  const adjustedStandard =
    race.historical_adj_per_f === null
      ? null
      : race.base_standard + race.historical_adj_per_f * furlongs;
  return [
    [
      "doncaster_fallback",
      `race=891843`,
      `historical_adjustment_per_f=${fmt(race.historical_adj_per_f)}`,
      `historical_sample=${race.historical_fallback_sample_size}`,
      `base_deviation_per_f=${fmt(race.deviation_per_f)}`,
      `base_standard=${fmt(race.base_standard)}`,
      `adjusted_standard=${fmt(adjustedStandard)}`,
      `actual=${fmt(race.actual)}`,
      `winner_base_rating=${fmt(winner.base_rating)}`,
      `winner_historical_fallback_rating=${fmt(winner.historical_fallback_rating)}`,
      `safety_note=large historical sample does not help when the target race base deviation is itself extreme and same-day card dispersion is high`,
    ].join(" | "),
    "possible_safety_controls=absolute_adjustment_cap, historical_adjustment_percentile_cap, base_rating_sanity_guard, high_same_day_dispersion_rejection",
  ];
}

function segmentRecommendationLines(): string[] {
  return [
    "AW=retain base-only for now; prior validation showed adjusted OR relationship weaker despite small timing-error gain",
    "turf_flat=conservative same-day remains plausible; inspect remaining outliers but no jump-specific scaling issue apparent from current evidence",
    "hurdles=not separately diagnosable from current CSV; add race_type/race_name to research outputs before production design",
    "chases=not separately diagnosable from current CSV; subtype separation is a leading hypothesis because jump standard dispersion remains large",
    "nh_flat=not separately diagnosable from current CSV; should not be pooled blindly with hurdles/chases until measured",
    "jumps=do not use current seconds-to-rating conversion unchanged in production; extreme ratings show standard/deviation errors convert directly into huge point swings",
  ];
}

function investigatedCsv(
  extremeRunners: RunnerRow[],
  raceById: Map<string, RaceRow>,
  allRaces: RaceRow[],
): string {
  const rows = [
    [
      "race_source_id",
      "date",
      "course",
      "distance",
      "distance_yards",
      "going",
      "runner",
      "finish_position",
      "or",
      "base_rating",
      "same_day_rating",
      "historical_fallback_rating",
      "base_standard",
      "actual",
      "deviation_seconds",
      "deviation_per_f",
      "standard_sample_size",
      "standard_sample_stdev",
      "same_day_peers",
      "same_day_stdev",
      "historical_sample",
      "likely_cause",
    ],
  ];
  for (const runner of [...extremeRunners].sort((a, b) => Math.abs(b.base_rating - 100) - Math.abs(a.base_rating - 100)).slice(0, 250)) {
    const race = raceById.get(runner.race_source_id);
    const sample = race ? standardSample(race, allRaces) : null;
    rows.push([
      runner.race_source_id,
      runner.race_date,
      runner.course,
      runner.distance,
      String(runner.distance_yards ?? ""),
      runner.going,
      runner.horse,
      String(runner.finish_position ?? ""),
      String(runner.official_rating ?? ""),
      fmt(runner.base_rating),
      fmt(runner.same_day_rating),
      fmt(runner.historical_fallback_rating),
      fmt(race?.base_standard ?? null),
      fmt(race?.actual ?? null),
      fmt(race?.deviation_seconds ?? null),
      fmt(race?.deviation_per_f ?? null),
      String(race?.base_sample ?? ""),
      fmt(sample?.stdev ?? null),
      String(runner.same_day_peer_count),
      fmt(runner.same_day_stdev_per_f),
      String(runner.historical_fallback_sample_size),
      race && sample
        ? classifyCause(runner, race, sample, allRaceWinner(runner.race_source_id, extremeRunners))
        : "unknown",
    ]);
  }
  return `${rows.map((row) => csv(row)).join("\n")}\n`;
}

function standardSample(target: RaceRow, allRaces: RaceRow[]): StandardSample {
  const races = allRaces.filter(
    (race) =>
      race.race_source_id !== target.race_source_id &&
      race.course === target.course &&
      race.distance_yards === target.distance_yards,
  );
  const times = races.map((race) => race.actual).sort((a, b) => a - b);
  return {
    races,
    median: median(times),
    mean: mean(times),
    stdev: standardDeviation(times),
    min: times[0] ?? null,
    max: times.at(-1) ?? null,
    iqr:
      percentile(times, 0.75) === null || percentile(times, 0.25) === null
        ? null
        : (percentile(times, 0.75) ?? 0) - (percentile(times, 0.25) ?? 0),
  };
}

function normalWinner(runners: RunnerRow[], segment: string): RunnerRow | null {
  return (
    runners
      .filter((runner) => runner.segment === segment && runner.finish_position === 1)
      .sort((a, b) => Math.abs(a.base_rating - 100) - Math.abs(b.base_rating - 100))[0] ??
    null
  );
}

function winnerForRace(runners: RunnerRow[], raceId: string): RunnerRow | null {
  return runners.find((runner) => runner.race_source_id === raceId && runner.finish_position === 1) ?? null;
}

function allRaceWinner(raceId: string, runners: RunnerRow[]): RunnerRow | null {
  return runners.find((runner) => runner.race_source_id === raceId && runner.finish_position === 1) ?? null;
}

function speedBasedSecondsPerLength(race: RaceRow): number | null {
  if (race.distance_yards === null || race.distance_yards <= 0 || race.actual <= 0) {
    return null;
  }
  return (8 / 3) / (race.distance_yards / race.actual);
}

function parseRaceRows(text: string): RaceRow[] {
  return parseCsv(text).map((row) => ({
    race_source_id: row.race_source_id,
    race_date: row.race_date,
    course: row.course,
    race_name: row.race_name ?? "",
    race_type: row.race_type ?? "",
    race_class: row.race_class ?? "",
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
    same_day_peer_count: Number(row.same_day_peer_count),
    same_day_stdev_per_f: numberOrNull(row.same_day_stdev_per_f),
    historical_adj_per_f: numberOrNull(row.historical_adj_per_f),
    historical_fallback_sample_size: Number(row.historical_fallback_sample_size),
  }));
}

function parseRunnerRows(text: string): RunnerRow[] {
  return parseCsv(text).map((row) => ({
    race_source_id: row.race_source_id,
    race_date: row.race_date,
    course: row.course,
    race_name: row.race_name ?? "",
    race_type: row.race_type ?? "",
    race_class: row.race_class ?? "",
    distance: row.distance,
    distance_yards: numberOrNull(row.distance_yards),
    segment: row.segment,
    surface: row.surface,
    going: row.going,
    actual_winning_time: Number(row.actual_winning_time),
    equivalent_time_seconds: Number(row.equivalent_time_seconds),
    runner_source_id: row.runner_source_id,
    horse: row.horse,
    finish_position: numberOrNull(row.finish_position),
    official_rating: numberOrNull(row.official_rating),
    base_standard: Number(row.base_standard),
    same_day_adj_per_f: numberOrNull(row.same_day_adj_per_f),
    same_day_peer_count: Number(row.same_day_peer_count),
    same_day_stdev_per_f: numberOrNull(row.same_day_stdev_per_f),
    historical_adj_per_f: numberOrNull(row.historical_adj_per_f),
    historical_fallback_sample_size: Number(row.historical_fallback_sample_size),
    base_rating: Number(row.base_rating),
    same_day_rating: numberOrNull(row.same_day_rating),
    historical_fallback_rating: numberOrNull(row.historical_fallback_rating),
    conservative_hierarchy_rating: Number(row.conservative_hierarchy_rating),
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

function counter(values: string[]): string {
  const counts: Record<string, number> = {};
  for (const value of values) {
    increment(counts, value || "missing");
  }
  return JSON.stringify(counts);
}

function increment(counts: Record<string, number>, key: string) {
  counts[key] = (counts[key] ?? 0) + 1;
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function fmt(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "-"
    : value.toFixed(2);
}

function csv(values: string[]): string {
  return values
    .map((value) => (/[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value))
    .join(",");
}

await main();
