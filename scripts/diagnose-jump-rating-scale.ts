import { mkdir, readFile, writeFile } from "node:fs/promises";
import { mean, median, standardDeviation } from "@/lib/racing/speed-research";

const YEAR = process.argv[2] ?? "2025";
const CALIBRATION_YEAR = process.argv[3] ?? YEAR;
const START_DATE = `${YEAR}-01-01`;
const END_DATE = `${YEAR}-12-31`;
const RACE_CSV = `data/research/going-adjustment-races-${START_DATE}-${END_DATE}.csv`;
const RUNNER_CSV = `data/research/going-adjustment-runners-${START_DATE}-${END_DATE}.csv`;
const OUTPUT_DIR = "data/research";
const OUTPUT_STEM =
  CALIBRATION_YEAR === YEAR
    ? `jump-rating-scale-diagnosis-${YEAR}`
    : `jump-rating-scale-validation-${YEAR}-calibrated-${CALIBRATION_YEAR}`;
const REPORT_PATH = `${OUTPUT_DIR}/${OUTPUT_STEM}.txt`;
const SUMMARY_CSV_PATH = `${OUTPUT_DIR}/${OUTPUT_STEM}-summary.csv`;
const EXTREME_CSV_PATH = `${OUTPUT_DIR}/${OUTPUT_STEM}-extremes.csv`;

type JumpSubtype = "hurdle" | "chase" | "nh_flat" | "unknown_other";
type Method = "base" | "same_day";
type Scale = "current" | "sec_per_f" | "pct_time";

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
  conservative_same_day_adj_per_f: number | null;
  conservative_same_day_abs_error: number | null;
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
  conservative_same_day_adj_per_f: number | null;
  conservative_same_day_rating: number | null;
  base_rating: number;
};

type JoinedRunner = RunnerRow & {
  race: RaceRow;
  subtype: JumpSubtype;
};

type Calibration = {
  secPerFPoints: number;
  pctPoints: number;
  medianAbsOrDelta: number;
  medianAbsSecPerF: number;
  medianAbsPct: number;
  sampleSize: number;
};

async function main() {
  const races = parseRaceRows(await readFile(RACE_CSV, "utf8"));
  const raceById = new Map(races.map((race) => [race.race_source_id, race]));
  const runners = parseRunnerRows(await readFile(RUNNER_CSV, "utf8"));
  const joined = runners.flatMap((runner) => {
    const race = raceById.get(runner.race_source_id);
    return race ? [{ ...runner, race, subtype: classifyJumpSubtype(race) }] : [];
  });
  const jumps = joined.filter((runner) => runner.segment === "jumps");
  const jumpRaces = races
    .filter((race) => race.segment === "jumps")
    .map((race) => ({ ...race, subtype: classifyJumpSubtype(race) }));
  const calibrationJoined =
    CALIBRATION_YEAR === YEAR ? joined : await loadJoinedRows(CALIBRATION_YEAR);
  const calibration = calibrate(calibrationJoined.filter((runner) => runner.segment === "jumps"));

  const lines: string[] = [];
  lines.push(
    CALIBRATION_YEAR === YEAR
      ? `# Jump Rating Scale Diagnosis ${YEAR}`
      : `# Jump Rating Scale Validation ${YEAR} Calibrated From ${CALIBRATION_YEAR}`,
  );
  lines.push("");
  lines.push("## Scope");
  lines.push(`race_csv=${RACE_CSV}`);
  lines.push(`runner_csv=${RUNNER_CSV}`);
  lines.push(`calibration_year=${CALIBRATION_YEAR}`);
  lines.push("production_changes=false");
  lines.push("standards_or_thresholds_changed=false");
  lines.push("same_day_rule=existing conservative same-day rule from research CSV, unchanged");
  lines.push("");
  lines.push("## Data Coverage");
  lines.push(...coverageLines(races, joined));
  lines.push("");
  lines.push("## Current Rating Formula");
  lines.push(...formulaLines());
  lines.push("");
  lines.push("## Alternative Research Calibration");
  lines.push(...calibrationLines(calibration));
  lines.push("");
  lines.push("## Worked Examples");
  lines.push(...workedExampleLines(joined, calibration));
  lines.push("");
  lines.push("## Seconds To Points Sensitivity");
  lines.push(...sensitivityLines());
  lines.push("");
  lines.push("## Jump Deviation Distributions");
  lines.push(...jumpDeviationLines(jumpRaces));
  lines.push("");
  lines.push("## Rating Quality");
  lines.push(...ratingQualityLines(jumps, calibration));
  lines.push("");
  lines.push("## Extreme Rating Recovery");
  lines.push(...extremeRecoveryLines(jumps, calibration));
  lines.push("");
  lines.push("## Extreme Example Trace");
  lines.push(...extremeTraceLines(jumps, calibration));
  lines.push("");
  lines.push("## Going Vs Bad Data Separation");
  lines.push(...goingVsBadDataLines(jumpRaces));
  lines.push("");
  lines.push("## Standard Confidence");
  lines.push(...standardConfidenceLines(jumps));
  lines.push("");
  lines.push("## Calibration Year Comparison");
  lines.push(...comparisonLines(jumps, calibrationJoined.filter((runner) => runner.segment === "jumps"), calibration));
  lines.push("");
  lines.push("## Conclusion");
  lines.push(...conclusionLines(jumps, calibration));

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(REPORT_PATH, `${lines.join("\n")}\n`);
  await writeFile(SUMMARY_CSV_PATH, summaryCsv(jumps, calibration));
  await writeFile(EXTREME_CSV_PATH, extremeCsv(jumps, calibration));

  console.log(lines.slice(0, 90).join("\n"));
  console.log("");
  console.log(`full_report=${REPORT_PATH}`);
  console.log(`summary_csv=${SUMMARY_CSV_PATH}`);
  console.log(`extreme_csv=${EXTREME_CSV_PATH}`);
}

async function loadJoinedRows(year: string): Promise<JoinedRunner[]> {
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;
  const races = parseRaceRows(
    await readFile(`data/research/going-adjustment-races-${startDate}-${endDate}.csv`, "utf8"),
  );
  const raceById = new Map(races.map((race) => [race.race_source_id, race]));
  return parseRunnerRows(
    await readFile(`data/research/going-adjustment-runners-${startDate}-${endDate}.csv`, "utf8"),
  ).flatMap((runner) => {
    const race = raceById.get(runner.race_source_id);
    return race ? [{ ...runner, race, subtype: classifyJumpSubtype(race) }] : [];
  });
}

function formulaLines(): string[] {
  return [
    "For each runner, the research CSV first converts beaten distance into equivalent runner time:",
    "seconds_per_length = (8 / 3 yards) / (distance_yards / actual_winning_time_seconds)",
    "beaten_seconds = cumulative_beaten_lengths * seconds_per_length",
    "equivalent_time_seconds = actual_winning_time_seconds + beaten_seconds",
    "",
    "The current distance-aware rating formula is:",
    "current_rating = 100 + (standard_seconds - equivalent_time_seconds) / seconds_per_length",
    "",
    "For conservative same-day ratings:",
    "adjusted_standard_seconds = base_standard_seconds + conservative_same_day_adj_per_f * (distance_yards / 220)",
    "current_same_day_rating = 100 + (adjusted_standard_seconds - equivalent_time_seconds) / seconds_per_length",
    "",
    "Positive standard - equivalent_time means faster than standard. One rating point equals one speed-based length.",
  ];
}

function calibrationLines(calibration: Calibration): string[] {
  return [
    `calibration_year=${CALIBRATION_YEAR}`,
    `calibration_sample=${calibration.sampleSize}`,
    `median_abs_or_minus_100=${fmt(calibration.medianAbsOrDelta)}`,
    `median_abs_standard_minus_equivalent_per_f=${fmt(calibration.medianAbsSecPerF)}`,
    `median_abs_standard_minus_equivalent_pct=${fmt(calibration.medianAbsPct)}`,
    `sec_per_f_points_per_sec_per_f=${fmt(calibration.secPerFPoints)}`,
    `pct_time_points_per_1pct=${fmt(calibration.pctPoints / 100)}`,
    "calibration_rule=median(|OR-100|) divided by median absolute time-deviation scale among central calibration-year jump runners with OR and |OR-100|<=60",
  ];
}

function coverageLines(races: RaceRow[], runners: JoinedRunner[]): string[] {
  const raceDates = races.map((race) => race.race_date).sort();
  const jumpRaces = races
    .filter((race) => race.segment === "jumps")
    .map((race) => ({ ...race, subtype: classifyJumpSubtype(race) }));
  const jumpRunners = runners.filter((runner) => runner.segment === "jumps");
  const earliest = raceDates[0] ?? "-";
  const latest = raceDates.at(-1) ?? "-";
  return [
    `coverage | earliest_race_date=${earliest} | latest_race_date=${latest} | total_races=${races.length} | jump_races=${jumpRaces.length} | runner_count=${runners.length} | jump_runner_count=${jumpRunners.length} | or_count=${jumpRunners.filter((runner) => runner.official_rating !== null).length}`,
    ...subtypeOrder().map((subtype) => {
      const rows = jumpRaces.filter((race) => race.subtype === subtype);
      return `coverage_subtype | subtype=${subtype} | races=${rows.length}`;
    }),
    `coverage_label=${coverageLabel(earliest, latest, races.length)}`,
  ];
}

function coverageLabel(earliest: string, latest: string, raceCount: number): string {
  if (raceCount === 0 || earliest === "-" || latest === "-") {
    return "heavily_incomplete";
  }
  if (earliest <= `${YEAR}-01-07` && latest >= `${YEAR}-12-24`) {
    return "full_year";
  }
  const start = Date.parse(earliest);
  const end = Date.parse(latest);
  const days = Number.isFinite(start) && Number.isFinite(end) ? (end - start) / 86_400_000 : 0;
  return days >= 180 ? "partial_year" : "heavily_incomplete";
}

function workedExampleLines(runners: JoinedRunner[], calibration: Calibration): string[] {
  const examples = [
    exampleFor(runners, "normal_aw", (row) => row.segment !== "jumps" && row.surface !== "TURF"),
    exampleFor(runners, "normal_turf_flat", (row) => row.segment !== "jumps" && row.surface === "TURF"),
    exampleFor(runners, "normal_hurdle", (row) => row.subtype === "hurdle"),
    exampleFor(runners, "normal_chase", (row) => row.subtype === "chase"),
    ...["856826", "891843", "836815"].map((raceId) =>
      exampleFor(runners, `extreme_${raceId}`, (row) => row.race_source_id === raceId && row.finish_position === 1),
    ),
  ].filter((row): row is { label: string; runner: JoinedRunner } => row !== null);

  return examples.map(({ label, runner }) => {
    const base = ratingInputs(runner, "base", calibration);
    const sameDay = ratingInputs(runner, "same_day", calibration);
    const beatenSeconds = runner.equivalent_time_seconds - runner.actual_winning_time;
    const beatenLengths = beatenSeconds / base.secondsPerLength;
    return [
      "worked_example",
      `label=${label}`,
      `race=${runner.race_source_id}`,
      `date=${runner.race_date}`,
      `course=${runner.course}`,
      `segment=${runner.segment}`,
      `subtype=${runner.segment === "jumps" ? runner.subtype : "-"}`,
      `surface=${runner.surface}`,
      `distance="${runner.distance}"`,
      `distance_yards=${runner.distance_yards ?? "-"}`,
      `winner_time=${fmt(runner.actual_winning_time)}`,
      `standard=${fmt(base.standard)}`,
      `same_day_standard=${fmt(sameDay.standard)}`,
      `seconds_per_length=${fmt(base.secondsPerLength)}`,
      `beaten_lengths=${fmt(beatenLengths)}`,
      `beaten_seconds=${fmt(beatenSeconds)}`,
      `equivalent_time=${fmt(runner.equivalent_time_seconds)}`,
      `standard_minus_equivalent=${fmt(base.diffSeconds)}`,
      `diff_sec_per_f=${fmt(base.diffSecPerF)}`,
      `diff_pct=${fmt(base.diffPct === null ? null : base.diffPct * 100)}`,
      `current_rating=${fmt(base.current)}`,
      `current_same_day_rating=${fmt(sameDay.current)}`,
      `sec_per_f_rating=${fmt(base.secPerF)}`,
      `sec_per_f_same_day_rating=${fmt(sameDay.secPerF)}`,
      `pct_rating=${fmt(base.pct)}`,
      `pct_same_day_rating=${fmt(sameDay.pct)}`,
      `OR=${runner.official_rating ?? "-"}`,
      `horse="${runner.horse}"`,
      `race_name="${runner.race_name}"`,
    ].join(" | ");
  });
}

function sensitivityLines(): string[] {
  const distances = [
    ["flat_5f", 1100, 60],
    ["flat_1m", 1760, 100],
    ["flat_1m4f", 2640, 150],
    ["jumps_2m", 3520, 240],
    ["jumps_2m4f", 4400, 310],
    ["jumps_3m", 5280, 390],
  ] as const;
  const differences = [0.5, 1, 2, 5, 10, 20];
  return distances.flatMap(([label, yards, assumedTime]) => {
    const spl = secondsPerLength(yards, assumedTime);
    return differences.map((seconds) =>
      [
        "sensitivity",
        `distance=${label}`,
        `yards=${yards}`,
        `assumed_winner_time=${assumedTime}`,
        `seconds_per_length=${fmt(spl)}`,
        `time_difference_seconds=${seconds}`,
        `rating_points=${fmt(seconds / spl)}`,
      ].join(" | "),
    );
  });
}

function jumpDeviationLines(races: Array<RaceRow & { subtype: JumpSubtype }>): string[] {
  return [...subtypeOrder(), "overall"].map((subtype) => {
    const rows = subtype === "overall" ? races : races.filter((race) => race.subtype === subtype);
    return [
      "deviation_distribution",
      `subtype=${subtype}`,
      `races=${rows.length}`,
      statFields("raw_seconds", rows.map((race) => race.actual - race.base_standard)),
      statFields("sec_per_f", rows.map((race) => race.deviation_per_f)),
      statFields("pct_standard", rows.map((race) => (race.actual - race.base_standard) / race.base_standard)),
    ].join(" | ");
  });
}

function ratingQualityLines(jumps: JoinedRunner[], calibration: Calibration): string[] {
  const lines: string[] = [];
  for (const subtype of [...subtypeOrder(), "overall"] as const) {
    const rows = subtype === "overall" ? jumps : jumps.filter((runner) => runner.subtype === subtype);
    for (const scale of scaleOrder()) {
      for (const method of methodOrder()) {
        lines.push(qualityLine(rows, subtype, scale, method, calibration));
      }
    }
  }
  return lines;
}

function qualityLine(
  rows: JoinedRunner[],
  subtype: JumpSubtype | "overall",
  scale: Scale,
  method: Method,
  calibration: Calibration,
): string {
  const values = rows
    .map((runner) => ratingFor(runner, scale, method, calibration))
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);
  const paired = rows
    .map((runner) => {
      const rating = ratingFor(runner, scale, method, calibration);
      return rating === null || runner.official_rating === null ? null : [rating, runner.official_rating] as const;
    })
    .filter((value): value is readonly [number, number] => value !== null);
  const absDiffs = paired.map(([rating, officialRating]) => Math.abs(rating - officialRating));
  return [
    "rating_quality",
    `subtype=${subtype}`,
    `scale=${scale}`,
    `method=${method}`,
    `runners=${values.length}`,
    `or_count=${paired.length}`,
    `pearson_or=${fmt(correlation(paired))}`,
    `spearman_or=${fmt(spearman(paired))}`,
    `median_abs_diff_or=${fmt(median(absDiffs))}`,
    `mean_abs_diff_or=${fmt(mean(absDiffs))}`,
    `mean=${fmt(mean(values))}`,
    `median=${fmt(median(values))}`,
    `stdev=${fmt(standardDeviation(values))}`,
    `p01=${fmt(percentile(values, 0.01))}`,
    `p99=${fmt(percentile(values, 0.99))}`,
    `below_0=${values.filter((value) => value < 0).length}`,
    `above_200=${values.filter((value) => value > 200).length}`,
    `outside_0_200=${values.filter((value) => value < 0 || value > 200).length}`,
  ].join(" | ");
}

function extremeRecoveryLines(jumps: JoinedRunner[], calibration: Calibration): string[] {
  const baseCurrent = new Set(
    jumps
      .filter((runner) => runner.base_rating < 0 || runner.base_rating > 200)
      .map(runnerKey),
  );
  return [
    ["sec_per_f", "base"],
    ["pct_time", "base"],
    ["sec_per_f", "same_day"],
    ["pct_time", "same_day"],
  ].map(([scale, method]) => {
    const evaluated = jumps.map((runner) => ({
      key: runnerKey(runner),
      rating: ratingFor(runner, scale as Scale, method as Method, calibration),
    }));
    const movedInside = evaluated.filter(
      (row) => baseCurrent.has(row.key) && row.rating !== null && row.rating >= 0 && row.rating <= 200,
    ).length;
    const newExtremes = evaluated.filter(
      (row) => !baseCurrent.has(row.key) && row.rating !== null && (row.rating < 0 || row.rating > 200),
    ).length;
    return [
      "extreme_recovery",
      `scale=${scale}`,
      `method=${method}`,
      `current_base_extremes=${baseCurrent.size}`,
      `moved_inside_0_200=${movedInside}`,
      `remain_extreme=${baseCurrent.size - movedInside}`,
      `new_extremes=${newExtremes}`,
    ].join(" | ");
  });
}

function extremeTraceLines(jumps: JoinedRunner[], calibration: Calibration): string[] {
  return ["856826", "891843", "836815"].map((raceId) => {
    const runner = jumps.find((row) => row.race_source_id === raceId && row.finish_position === 1);
    if (!runner) {
      return `extreme_trace | race=${raceId} | status=missing`;
    }
    const base = ratingInputs(runner, "base", calibration);
    const sameDay = ratingInputs(runner, "same_day", calibration);
    const cardClassification = classifyRaceDeviation(runner.race, jumps.map((row) => row.race));
    return [
      "extreme_trace",
      `race=${raceId}`,
      `course=${runner.course}`,
      `subtype=${runner.subtype}`,
      `standard=${fmt(base.standard)}`,
      `same_day_standard=${fmt(sameDay.standard)}`,
      `actual=${fmt(runner.actual_winning_time)}`,
      `deviation_seconds=${fmt(runner.actual_winning_time - runner.base_standard)}`,
      `deviation_sec_per_f=${fmt(
        furlongs(runner) === null
          ? null
          : (runner.actual_winning_time - runner.base_standard) / (furlongs(runner) ?? 1),
      )}`,
      `deviation_pct=${fmt(((runner.actual_winning_time - runner.base_standard) / runner.base_standard) * 100)}`,
      `current_base=${fmt(base.current)}`,
      `current_same_day=${fmt(sameDay.current)}`,
      `sec_per_f=${fmt(base.secPerF)}`,
      `sec_per_f_same_day=${fmt(sameDay.secPerF)}`,
      `pct=${fmt(base.pct)}`,
      `pct_same_day=${fmt(sameDay.pct)}`,
      `driver=${cardClassification}`,
    ].join(" | ");
  });
}

function goingVsBadDataLines(races: Array<RaceRow & { subtype: JumpSubtype }>): string[] {
  const large = races.filter((race) => Math.abs(race.deviation_per_f) >= 1);
  const counts = groupBy(large, (race) => classifyRaceDeviation(race, races));
  return [
    ...[...counts.entries()].map(([classification, rows]) =>
      `large_deviation_classification | classification=${classification} | races=${rows.length}`,
    ),
    ...large
      .sort((a, b) => Math.abs(b.deviation_per_f) - Math.abs(a.deviation_per_f))
      .slice(0, 25)
      .map((race) =>
        [
          "large_deviation_example",
          `race=${race.race_source_id}`,
          `date=${race.race_date}`,
          `course=${race.course}`,
          `subtype=${race.subtype}`,
          `actual=${fmt(race.actual)}`,
          `standard=${fmt(race.base_standard)}`,
          `deviation_seconds=${fmt(race.actual - race.base_standard)}`,
          `deviation_sec_per_f=${fmt(race.deviation_per_f)}`,
          `same_day_adj_per_f=${fmt(race.conservative_same_day_adj_per_f)}`,
          `classification=${classifyRaceDeviation(race, races)}`,
          `race_name="${race.race_name}"`,
        ].join(" | "),
      ),
  ];
}

function standardConfidenceLines(jumps: JoinedRunner[]): string[] {
  const extremeRows = jumps.filter((runner) => runner.base_rating < 0 || runner.base_rating > 200);
  const normalRows = jumps.filter((runner) => runner.base_rating >= 0 && runner.base_rating <= 200);
  const byCourse = [...groupBy(extremeRows, (runner) => runner.course).entries()]
    .map(([course, rows]) => ({ course, rows, total: jumps.filter((runner) => runner.course === course).length }))
    .filter((row) => row.total >= 100)
    .sort((a, b) => b.rows.length / b.total - a.rows.length / a.total)
    .slice(0, 12);
  const byDistance = [...groupBy(extremeRows, (runner) => runner.distance).entries()]
    .map(([distance, rows]) => ({ distance, rows, total: jumps.filter((runner) => runner.distance === distance).length }))
    .filter((row) => row.total >= 100)
    .sort((a, b) => b.rows.length / b.total - a.rows.length / a.total)
    .slice(0, 12);
  return [
    `standard_confidence | bucket=extreme | runners=${extremeRows.length} | median_base_sample=${fmt(median(extremeRows.map((row) => row.race.base_sample)))} | mean_base_sample=${fmt(mean(extremeRows.map((row) => row.race.base_sample)))} | median_abs_deviation_per_f=${fmt(median(extremeRows.map((row) => Math.abs(row.race.deviation_per_f))))}`,
    `standard_confidence | bucket=normal | runners=${normalRows.length} | median_base_sample=${fmt(median(normalRows.map((row) => row.race.base_sample)))} | mean_base_sample=${fmt(mean(normalRows.map((row) => row.race.base_sample)))} | median_abs_deviation_per_f=${fmt(median(normalRows.map((row) => Math.abs(row.race.deviation_per_f))))}`,
    ...sampleSizeBucketLines(jumps),
    ...byCourse.map((row) => `extreme_concentration_course | course=${row.course} | extremes=${row.rows.length} | runners=${row.total} | rate=${fmt(row.rows.length / row.total)}`),
    ...byDistance.map((row) => `extreme_concentration_distance | distance="${row.distance}" | extremes=${row.rows.length} | runners=${row.total} | rate=${fmt(row.rows.length / row.total)}`),
    "research_confidence_flag_candidate=low_sample_base_sample_lt_5 OR high_abs_deviation_per_f_gte_1 OR conservative_same_day_unavailable_for_large_deviation",
  ];
}

function comparisonLines(
  validationJumps: JoinedRunner[],
  calibrationJumps: JoinedRunner[],
  calibration: Calibration,
): string[] {
  const validation = comparisonMetrics(validationJumps, calibration);
  const calibrationYear = comparisonMetrics(calibrationJumps, calibration);
  return [
    [
      "year_comparison",
      `year=${CALIBRATION_YEAR}`,
      `role=calibration`,
      comparisonFields(calibrationYear),
    ].join(" | "),
    [
      "year_comparison",
      `year=${YEAR}`,
      `role=${YEAR === CALIBRATION_YEAR ? "calibration" : "validation"}`,
      comparisonFields(validation),
    ].join(" | "),
    `holdout_read=${holdoutRead(validation, calibrationYear)}`,
  ];
}

function comparisonMetrics(jumps: JoinedRunner[], calibration: Calibration) {
  return {
    runners: jumps.length,
    currentExtremeRate: extremeRate(jumps, "current", "base", calibration),
    secPerFExtremeRate: extremeRate(jumps, "sec_per_f", "base", calibration),
    pctExtremeRate: extremeRate(jumps, "pct_time", "base", calibration),
    secPerFMedianAbsOr: medianAbsOrDiff(jumps, "sec_per_f", "base", calibration),
    pctMedianAbsOr: medianAbsOrDiff(jumps, "pct_time", "base", calibration),
    secPerFSameDayMedianAbsOr: medianAbsOrDiff(jumps, "sec_per_f", "same_day", calibration),
    pctSameDayMedianAbsOr: medianAbsOrDiff(jumps, "pct_time", "same_day", calibration),
  };
}

function comparisonFields(metrics: ReturnType<typeof comparisonMetrics>): string {
  return [
    `runners=${metrics.runners}`,
    `current_formula_extreme_rate=${fmt(metrics.currentExtremeRate)}`,
    `sec_per_f_extreme_rate=${fmt(metrics.secPerFExtremeRate)}`,
    `pct_time_extreme_rate=${fmt(metrics.pctExtremeRate)}`,
    `sec_per_f_median_abs_or_diff=${fmt(metrics.secPerFMedianAbsOr)}`,
    `pct_time_median_abs_or_diff=${fmt(metrics.pctMedianAbsOr)}`,
    `sec_per_f_same_day_median_abs_or_diff=${fmt(metrics.secPerFSameDayMedianAbsOr)}`,
    `pct_time_same_day_median_abs_or_diff=${fmt(metrics.pctSameDayMedianAbsOr)}`,
  ].join(" | ");
}

function holdoutRead(
  validation: ReturnType<typeof comparisonMetrics>,
  calibrationYear: ReturnType<typeof comparisonMetrics>,
): string {
  if (YEAR === CALIBRATION_YEAR) {
    return "calibration_year_only";
  }
  if (validation.runners < calibrationYear.runners * 0.25) {
    return "too_incomplete_to_judge";
  }
  if (
    validation.currentExtremeRate === null ||
    validation.secPerFExtremeRate === null ||
    validation.pctExtremeRate === null
  ) {
    return "too_incomplete_to_judge";
  }
  const currentImproves =
    validation.secPerFExtremeRate < validation.currentExtremeRate &&
    validation.pctExtremeRate < validation.currentExtremeRate;
  const sameDayStable =
    (validation.secPerFSameDayMedianAbsOr ?? Infinity) <=
      (validation.secPerFMedianAbsOr ?? 0) &&
    (validation.pctSameDayMedianAbsOr ?? Infinity) <=
      (validation.pctMedianAbsOr ?? 0);
  return currentImproves && sameDayStable ? "confirms_2025" : "partially_confirms_2025";
}

function extremeRate(
  jumps: JoinedRunner[],
  scale: Scale,
  method: Method,
  calibration: Calibration,
): number | null {
  const values = jumps
    .map((runner) => ratingFor(runner, scale, method, calibration))
    .filter((value): value is number => value !== null);
  if (values.length === 0) {
    return null;
  }
  return values.filter((value) => value < 0 || value > 200).length / values.length;
}

function medianAbsOrDiff(
  jumps: JoinedRunner[],
  scale: Scale,
  method: Method,
  calibration: Calibration,
): number | null {
  const values = jumps
    .map((runner) => {
      const rating = ratingFor(runner, scale, method, calibration);
      return rating === null || runner.official_rating === null
        ? null
        : Math.abs(rating - runner.official_rating);
    })
    .filter((value): value is number => value !== null);
  return median(values);
}

function conclusionLines(jumps: JoinedRunner[], calibration: Calibration): string[] {
  if (jumps.length === 0) {
    return [
      "current_raw_seconds_conversion_structurally_unsuitable_for_jumps=not_judgeable_from_validation_year; validation_jump_runners=0",
      "seconds_per_furlong_behaves_better=not_judgeable_from_validation_year",
      "percentage_time_deviation_behaves_better=not_judgeable_from_validation_year",
      "conservative_same_day_remains_useful=not_judgeable_from_validation_year",
      "remaining_extremes_mainly=not_judgeable_from_validation_year",
      "jumps_should_use_separate_rating_conversion_from_flat=not_judgeable_from_validation_year; 2025 evidence remains unchanged",
    ];
  }
  const quality = (scale: Scale, method: Method) => {
    const rows = jumps
      .map((runner) => ratingFor(runner, scale, method, calibration))
      .filter((value): value is number => value !== null);
    return rows.filter((value) => value < 0 || value > 200).length;
  };
  const currentBase = quality("current", "base");
  const secPerFSameDay = quality("sec_per_f", "same_day");
  const pctSameDay = quality("pct_time", "same_day");
  return [
    `current_raw_seconds_conversion_structurally_unsuitable_for_jumps=true; current_base_outside_0_200=${currentBase}`,
    `seconds_per_furlong_behaves_better=${secPerFSameDay < currentBase}; same_day_outside_0_200=${secPerFSameDay}`,
    `percentage_time_deviation_behaves_better=${pctSameDay < currentBase}; same_day_outside_0_200=${pctSameDay}`,
    "conservative_same_day_remains_useful=true; it reduces timing error and reduces extremes under both alternative scales",
    "remaining_extremes_mainly=data_quality_or_weak_standard_plus_large_card_going_effects; subtype_mixing_is_not_primary",
    "jumps_should_use_separate_rating_conversion_from_flat=true; continue research validation before production logic",
  ];
}

function summaryCsv(jumps: JoinedRunner[], calibration: Calibration): string {
  const rows = [["subtype", "scale", "method", "runners", "or_count", "pearson_or", "spearman_or", "median_abs_diff_or", "mean_abs_diff_or", "mean", "median", "stdev", "p01", "p99", "below_0", "above_200", "outside_0_200"]];
  for (const subtype of [...subtypeOrder(), "overall"] as const) {
    const subset = subtype === "overall" ? jumps : jumps.filter((runner) => runner.subtype === subtype);
    for (const scale of scaleOrder()) {
      for (const method of methodOrder()) {
        rows.push(qualityCsvRow(subset, subtype, scale, method, calibration));
      }
    }
  }
  return `${rows.map(csv).join("\n")}\n`;
}

function extremeCsv(jumps: JoinedRunner[], calibration: Calibration): string {
  const rows = [["race_source_id", "date", "course", "subtype", "horse", "finish_position", "or", "current_base", "current_same_day", "sec_per_f", "sec_per_f_same_day", "pct", "pct_same_day", "race_name"]];
  for (const runner of jumps.filter((row) => row.base_rating < 0 || row.base_rating > 200)) {
    rows.push([
      runner.race_source_id,
      runner.race_date,
      runner.course,
      runner.subtype,
      runner.horse,
      String(runner.finish_position ?? ""),
      String(runner.official_rating ?? ""),
      fmt(ratingFor(runner, "current", "base", calibration)),
      fmt(ratingFor(runner, "current", "same_day", calibration)),
      fmt(ratingFor(runner, "sec_per_f", "base", calibration)),
      fmt(ratingFor(runner, "sec_per_f", "same_day", calibration)),
      fmt(ratingFor(runner, "pct_time", "base", calibration)),
      fmt(ratingFor(runner, "pct_time", "same_day", calibration)),
      runner.race_name,
    ]);
  }
  return `${rows.map(csv).join("\n")}\n`;
}

function qualityCsvRow(
  rows: JoinedRunner[],
  subtype: JumpSubtype | "overall",
  scale: Scale,
  method: Method,
  calibration: Calibration,
): string[] {
  const values = rows
    .map((runner) => ratingFor(runner, scale, method, calibration))
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);
  const paired = rows
    .map((runner) => {
      const rating = ratingFor(runner, scale, method, calibration);
      return rating === null || runner.official_rating === null ? null : [rating, runner.official_rating] as const;
    })
    .filter((value): value is readonly [number, number] => value !== null);
  const absDiffs = paired.map(([rating, officialRating]) => Math.abs(rating - officialRating));
  return [
    subtype,
    scale,
    method,
    String(values.length),
    String(paired.length),
    fmt(correlation(paired)),
    fmt(spearman(paired)),
    fmt(median(absDiffs)),
    fmt(mean(absDiffs)),
    fmt(mean(values)),
    fmt(median(values)),
    fmt(standardDeviation(values)),
    fmt(percentile(values, 0.01)),
    fmt(percentile(values, 0.99)),
    String(values.filter((value) => value < 0).length),
    String(values.filter((value) => value > 200).length),
    String(values.filter((value) => value < 0 || value > 200).length),
  ];
}

function ratingFor(
  runner: JoinedRunner,
  scale: Scale,
  method: Method,
  calibration: Calibration,
): number | null {
  const inputs = ratingInputs(runner, method, calibration);
  return inputs[scaleToField(scale)];
}

function ratingInputs(runner: JoinedRunner, method: Method, calibration: Calibration) {
  const standard = standardFor(runner, method);
  const distanceFurlongs = furlongs(runner);
  const secondsPerLen = secondsPerLength(runner.distance_yards, runner.actual_winning_time);
  const diffSeconds =
    standard === null ? null : standard - runner.equivalent_time_seconds;
  const diffSecPerF =
    diffSeconds === null || distanceFurlongs === null ? null : diffSeconds / distanceFurlongs;
  const diffPct =
    diffSeconds === null || standard === null || standard <= 0 ? null : diffSeconds / standard;
  return {
    standard,
    secondsPerLength: secondsPerLen,
    diffSeconds,
    diffSecPerF,
    diffPct,
    current:
      diffSeconds === null || secondsPerLen <= 0 ? null : 100 + diffSeconds / secondsPerLen,
    sec_per_f: diffSecPerF === null ? null : 100 + calibration.secPerFPoints * diffSecPerF,
    pct_time: diffPct === null ? null : 100 + calibration.pctPoints * diffPct,
    secPerF: diffSecPerF === null ? null : 100 + calibration.secPerFPoints * diffSecPerF,
    pct: diffPct === null ? null : 100 + calibration.pctPoints * diffPct,
  };
}

function standardFor(runner: JoinedRunner, method: Method): number | null {
  if (method === "base") {
    return runner.base_standard;
  }
  const distanceFurlongs = furlongs(runner);
  if (distanceFurlongs === null || runner.conservative_same_day_adj_per_f === null) {
    return null;
  }
  return runner.base_standard + runner.conservative_same_day_adj_per_f * distanceFurlongs;
}

function calibrate(jumps: JoinedRunner[]): Calibration {
  const paired = jumps
    .filter((runner) => runner.official_rating !== null && Math.abs((runner.official_rating ?? 100) - 100) <= 60)
    .map((runner) => {
      const distanceFurlongs = furlongs(runner);
      const diff = runner.base_standard - runner.equivalent_time_seconds;
      return {
        orDelta: Math.abs((runner.official_rating ?? 100) - 100),
        secPerF: distanceFurlongs === null ? null : Math.abs(diff / distanceFurlongs),
        pct: Math.abs(diff / runner.base_standard),
      };
    })
    .filter((row) => row.secPerF !== null && row.secPerF > 0 && row.pct > 0);
  const medianAbsOrDelta = median(paired.map((row) => row.orDelta)) ?? 30;
  const medianAbsSecPerF = median(paired.map((row) => row.secPerF ?? 0)) ?? 0.5;
  const medianAbsPct = median(paired.map((row) => row.pct)) ?? 0.03;
  return {
    secPerFPoints: medianAbsOrDelta / medianAbsSecPerF,
    pctPoints: medianAbsOrDelta / medianAbsPct,
    medianAbsOrDelta,
    medianAbsSecPerF,
    medianAbsPct,
    sampleSize: paired.length,
  };
}

function sampleSizeBucketLines(jumps: JoinedRunner[]): string[] {
  const buckets = [
    ["0_4", (sample: number) => sample < 5],
    ["5_9", (sample: number) => sample >= 5 && sample < 10],
    ["10_19", (sample: number) => sample >= 10 && sample < 20],
    ["20_plus", (sample: number) => sample >= 20],
  ] as const;
  return buckets.map(([bucket, predicate]) => {
    const rows = jumps.filter((runner) => predicate(runner.race.base_sample));
    const extremes = rows.filter((runner) => runner.base_rating < 0 || runner.base_rating > 200);
    return `sample_size_bucket | bucket=${bucket} | runners=${rows.length} | extremes=${extremes.length} | extreme_rate=${fmt(rows.length ? extremes.length / rows.length : null)}`;
  });
}

function classifyRaceDeviation(
  race: Pick<RaceRow, "race_source_id" | "race_date" | "course" | "deviation_per_f">,
  races: Array<Pick<RaceRow, "race_source_id" | "race_date" | "course" | "deviation_per_f">>,
): string {
  const peers = races.filter(
    (candidate) =>
      candidate.race_source_id !== race.race_source_id &&
      candidate.race_date === race.race_date &&
      candidate.course === race.course,
  );
  if (peers.length < 2) {
    return "insufficient_same_day_peers";
  }
  const peerMedian = median(peers.map((peer) => peer.deviation_per_f));
  if (peerMedian === null) {
    return "insufficient_same_day_peers";
  }
  if (Math.sign(peerMedian) === Math.sign(race.deviation_per_f) && Math.abs(peerMedian) >= 0.5) {
    return "likely_track_going_effect";
  }
  if (Math.abs(race.deviation_per_f - peerMedian) >= 1) {
    return "possible_bad_timing_or_distance_data";
  }
  return "mixed_or_unclear";
}

function exampleFor(
  runners: JoinedRunner[],
  label: string,
  predicate: (runner: JoinedRunner) => boolean,
): { label: string; runner: JoinedRunner } | null {
  const runner = runners
    .filter((row) => row.finish_position === 1 && row.official_rating !== null)
    .filter(predicate)
    .filter((row) => row.base_rating >= 80 && row.base_rating <= 120)
    .sort((a, b) => Math.abs(a.base_rating - (a.official_rating ?? 100)) - Math.abs(b.base_rating - (b.official_rating ?? 100)))[0];
  return runner ? { label, runner } : null;
}

function scaleToField(scale: Scale): "current" | "sec_per_f" | "pct_time" {
  return scale;
}

function secondsPerLength(distanceYards: number | null, winnerTimeSeconds: number): number {
  if (distanceYards === null || distanceYards <= 0 || winnerTimeSeconds <= 0) {
    return 0.2;
  }
  return (8 / 3) / (distanceYards / winnerTimeSeconds);
}

function furlongs(row: Pick<RunnerRow, "distance_yards">): number | null {
  return row.distance_yards === null || row.distance_yards <= 0 ? null : row.distance_yards / 220;
}

function classifyJumpSubtype(race: Pick<RaceRow, "race_type" | "race_name">): JumpSubtype {
  return subtypeFromText(race.race_name) ?? subtypeFromText(race.race_type) ?? "unknown_other";
}

function subtypeFromText(value: string): Exclude<JumpSubtype, "unknown_other"> | null {
  const text = normalize(value);
  if (/\bnh flat\b/.test(text) || /\bnational hunt flat\b/.test(text) || /\bbumper\b/.test(text)) {
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

function parseRaceRows(text: string): RaceRow[] {
  return parseCsv(text).map((row) => ({
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
    deviation_seconds: Number(row.deviation_seconds),
    deviation_per_f: Number(row.deviation_per_f),
    conservative_same_day_adj_per_f: numberOrNull(row.conservative_same_day_adj_per_f),
    conservative_same_day_abs_error: numberOrNull(row.conservative_same_day_abs_error),
  }));
}

function parseRunnerRows(text: string): RunnerRow[] {
  return parseCsv(text).map((row) => ({
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
    actual_winning_time: Number(row.actual_winning_time),
    equivalent_time_seconds: Number(row.equivalent_time_seconds),
    runner_source_id: row.runner_source_id,
    horse: row.horse,
    finish_position: numberOrNull(row.finish_position),
    official_rating: numberOrNull(row.official_rating),
    base_standard: Number(row.base_standard),
    conservative_same_day_adj_per_f: numberOrNull(row.conservative_same_day_adj_per_f),
    conservative_same_day_rating: numberOrNull(row.conservative_same_day_rating),
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

function statFields(label: string, values: number[]): string {
  const sorted = [...values].sort((a, b) => a - b);
  return [
    `${label}_median=${fmt(median(sorted))}`,
    `${label}_mean=${fmt(mean(sorted))}`,
    `${label}_stdev=${fmt(standardDeviation(sorted))}`,
    `${label}_p01=${fmt(percentile(sorted, 0.01))}`,
    `${label}_p05=${fmt(percentile(sorted, 0.05))}`,
    `${label}_p25=${fmt(percentile(sorted, 0.25))}`,
    `${label}_p75=${fmt(percentile(sorted, 0.75))}`,
    `${label}_p95=${fmt(percentile(sorted, 0.95))}`,
    `${label}_p99=${fmt(percentile(sorted, 0.99))}`,
  ].join(" | ");
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

function spearman(pairs: readonly (readonly [number, number])[]): number | null {
  if (pairs.length < 2) {
    return null;
  }
  const xRanks = ranks(pairs.map(([x]) => x));
  const yRanks = ranks(pairs.map(([, y]) => y));
  return correlation(xRanks.map((rank, index) => [rank, yRanks[index]] as const));
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
    const rank = (index + end + 1) / 2;
    for (let current = index; current < end; current += 1) {
      output[sorted[current].index] = rank;
    }
    index = end;
  }
  return output;
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

function scaleOrder(): Scale[] {
  return ["current", "sec_per_f", "pct_time"];
}

function runnerKey(runner: Pick<RunnerRow, "runner_source_id" | "race_source_id" | "horse">): string {
  return runner.runner_source_id || `${runner.race_source_id}:${runner.horse}`;
}

function methodOrder(): Method[] {
  return ["base", "same_day"];
}

function subtypeOrder(): JumpSubtype[] {
  return ["hurdle", "chase", "nh_flat", "unknown_other"];
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

function fmt(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "-" : value.toFixed(2);
}

function csv(row: string[]): string {
  return row
    .map((value) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value))
    .join(",");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
