import { mkdir, readFile, writeFile } from "node:fs/promises";
import postgres from "postgres";
import {
  calculateFigures,
  calibrateScales,
  deadHeatCheck,
  goingBand,
  isNhFlatOrBumperStyle,
  isPotentialFlatTurfSurface,
  isSupportedFlatTurf,
  type Figure,
  type RaceRow,
  type RunnerRow,
} from "./analyze-flat-turf-speed-rating-research";
import {
  classifyRaceCategory,
  distanceYardsToFurlongs,
  equivalentFinishingTimeSeconds,
  mean,
  median,
  reconstructCumulativeBeatenLengths,
  sanityCheckWinningTime,
  standardDeviation,
} from "@/lib/racing/speed-research";

const OUTPUT_DIR = "data/research";
const REPORT_PATH = `${OUTPUT_DIR}/flat-turf-production-readiness-diagnostic.txt`;
const COURSE_GROUP_CSV_PATH = `${OUTPUT_DIR}/flat-turf-production-readiness-course-distance-groups.csv`;
const CALIBRATION = { label: "2025", startDate: "2025-01-01", endDate: "2025-12-31" };
const HOLDOUT = { label: "2026_holdout", startDate: "2026-01-01", endDate: "2026-08-31" };
const PREFERRED_THRESHOLD = { minPeers: 3, maxStdevPerF: 0.3 };
const IRISH_COURSES = [
  "Curragh",
  "Leopardstown",
  "Galway",
  "Naas",
  "Cork",
  "Fairyhouse",
  "Gowran Park",
  "Roscommon",
  "Killarney",
  "Tipperary",
] as const;
const MAJOR_COURSES = [
  "Ascot",
  "Newmarket",
  "York",
  "Doncaster",
  "Goodwood",
  "Newbury",
  "Haydock",
  "Sandown",
  "Chester",
  "Epsom Downs",
  "Lingfield",
  ...IRISH_COURSES,
] as const;

type DbRaceRow = {
  race_source_id: string;
  race_date: string;
  course_source_id: string | null;
  course: string;
  country: string | null;
  race_name: string | null;
  race_type: string | null;
  race_type_code: string | null;
  race_class: string | null;
  distance: string | null;
  distance_yards: number | null;
  going: string | null;
  winning_time: string | null;
  surface: string | null;
};

type DbRunnerRow = {
  race_source_id: string;
  runner_source_id: string;
  horse: string;
  finish_position: number | null;
  result_status: string | null;
  beaten_distance: string | null;
  official_rating: number | null;
};

type DiagnosticRace = RaceRow & {
  race_type_code: string;
  country: string | null;
  course_source_id: string | null;
  parsed_winning_seconds: number | null;
  timing_sanity_reason: string;
};

type DiagnosticRunner = RunnerRow & {
  country: string | null;
  result_status: string | null;
  cumulative_beaten_lengths: number | null;
};

type StandardGroup = {
  key: string;
  course: string;
  country: string | null;
  distance: string;
  distanceYards: number | null;
  surface: string;
  races: DiagnosticRace[];
  times: number[];
};

async function main() {
  const client = createClient();
  try {
    const dbRaces = await loadDbRaces(client);
    const dbRunners = await loadDbRunners(client);
    const races = dbRaces.map(toDiagnosticRace);
    const runners = toDiagnosticRunners(races, dbRunners);
    const previousFlatTurfRaces = races.filter((race) => isPotentialFlatTurfSurface(race));
    const previousFlatTurfRaceIds = new Set(previousFlatTurfRaces.map((race) => race.race_source_id));
    const previousFlatTurfRunners = runners.filter((runner) => previousFlatTurfRaceIds.has(runner.race_source_id));
    const flatTurfRaces = races.filter((race) => isSupportedFlatTurf(race));
    const flatTurfRaceIds = new Set(flatTurfRaces.map((race) => race.race_source_id));
    const flatTurfRunners = runners.filter((runner) => isSupportedFlatTurf(runner));
    const excludedBumperRaces = previousFlatTurfRaces.filter((race) => !flatTurfRaceIds.has(race.race_source_id));
    const calibrationRaces = flatTurfRaces.filter(inRange(CALIBRATION));
    const holdoutRaces = flatTurfRaces.filter(inRange(HOLDOUT));
    const calibrationRunners = flatTurfRunners.filter(inRange(CALIBRATION));
    const holdoutRunners = flatTurfRunners.filter(inRange(HOLDOUT));
    const scaleCalibration = calibrateScales(calibrationRaces, calibrationRunners);
    const figures2025 = calculateFigures({
      range: CALIBRATION.label,
      races: calibrationRaces,
      runners: calibrationRunners,
      calibrationRaces,
      scaleCalibration,
      threshold: PREFERRED_THRESHOLD,
      leaveOneOut: true,
    });
    const figures2026 = calculateFigures({
      range: HOLDOUT.label,
      races: holdoutRaces,
      runners: holdoutRunners,
      calibrationRaces,
      scaleCalibration,
      threshold: PREFERRED_THRESHOLD,
      leaveOneOut: false,
    });
    const groups = standardGroups([...calibrationRaces, ...holdoutRaces]);
    const exportIrishCounts = await existingExportIrishCounts();

    const lines = [
      "# Flat Turf Production-Readiness Diagnostic",
      "",
      "research_only=true",
      "production_logic_changed=false",
      "schema_changed=false",
      "imports_changed=false",
      "ratings_persisted=false",
      `calibration=${CALIBRATION.startDate}..${CALIBRATION.endDate}`,
      `holdout=${HOLDOUT.startDate}..${HOLDOUT.endDate}`,
      "method=sec_per_f + hierarchical same-day median seconds-per-furlong allowance fallback",
      `same_day_rule=peers>=${PREFERRED_THRESHOLD.minPeers} and stdev_per_f<=${PREFERRED_THRESHOLD.maxStdevPerF}`,
      "",
      "## Task 1 - Irish Flat Turf Data Availability",
      `existing_research_export_irish_flat_turf_rows=${exportIrishCounts.flatTurfRows}`,
      `existing_research_export_irish_course_rows=${exportIrishCounts.anyRows}`,
      "root_cause=A research export excluded Ireland / was generated from a UK-only export scope; live DB has Irish Turf races with TURF surface classification, timing and distance fields.",
      "flat_turf_classifier=segment == turf_flat AND surface == TURF AND NOT nh_flat_or_bumper_title_or_type_marker",
      "nh_flat_or_bumper_markers=I.N.H./INH, bumper, National Hunt Flat, Point-To-Point Flat Race, (Pro/Am) Flat Race, (Ladies Pro/Am) Flat Race, Flat Race",
      ...irishAvailabilityLines(flatTurfRaces, flatTurfRunners),
      "",
      "## Task 2 - NH Flat/Bumper Exclusion Audit",
      ...exclusionAuditLines(previousFlatTurfRaces, previousFlatTurfRunners, excludedBumperRaces),
      "",
      "## Task 3 - Corrected Research Results",
      "calibration_note=uses the same frozen 2025 method and thresholds; no OR tuning or Ireland-specific recalibration.",
      `2025_all_ordinary_flat_turf=${summaryLine(preferredRows(figures2025))}`,
      `2026_all_ordinary_flat_turf_holdout=${summaryLine(preferredRows(figures2026))}`,
      `2025_irish_ordinary_flat_turf=${summaryLine(preferredIrish(figures2025))}`,
      `2026_irish_ordinary_flat_turf_holdout=${summaryLine(preferredIrish(figures2026))}`,
      `remaining_nh_flat_contamination_rated_rows=${[...preferredRows(figures2025), ...preferredRows(figures2026)].filter((row) => isNhFlatOrBumperStyle(row.race)).length}`,
      "",
      "## Task 4 - Course Caveats",
      ...courseCaveatLines([...figures2025, ...figures2026], groups),
      "",
      "## Task 5 - Tail Review",
      ...tailReviewLines(figures2025, "2025"),
      ...tailReviewLines(figures2026, "2026_holdout"),
      "",
      "## Task 6 - Production Recommendation",
      ...productionRecommendationLines(figures2025, figures2026, groups),
    ];

    await mkdir(OUTPUT_DIR, { recursive: true });
    await writeFile(REPORT_PATH, `${lines.join("\n")}\n`);
    await writeFile(COURSE_GROUP_CSV_PATH, courseGroupCsv(groups));
    console.log(lines.join("\n"));
    console.log(`\nfull_report=${REPORT_PATH}`);
    console.log(`course_distance_groups=${COURSE_GROUP_CSV_PATH}`);
  } finally {
    await client.end();
  }
}

function createClient() {
  const url = process.env.DATABASE_URL;
  return url ? postgres(url) : postgres({ host: "/tmp", database: "racing_analysis" });
}

async function loadDbRaces(client: postgres.Sql): Promise<DbRaceRow[]> {
  return client<DbRaceRow[]>`
    select
      r.source_id as race_source_id,
      r.race_date::text as race_date,
      c.source_id as course_source_id,
      c.display_name as course,
      c.country,
      r.race_name,
      r.race_type,
      r.race_type_code,
      r.race_class,
      r.distance,
      r.distance_yards,
      r.going,
      r.winning_time,
      si.payload #>> '{props,pageProps,race,race_summary,course_surface,surface}' as surface
    from races r
    join courses c on c.id = r.course_id
    join source_imports si
      on si.source = r.source
     and si.source_id = r.source_id
     and si.source_type = 'full-result-next-data'
    where r.source = 'sporting_life'
      and r.race_date between ${CALIBRATION.startDate} and ${HOLDOUT.endDate}
    order by r.race_date, c.display_name, r.scheduled_time, r.source_id
  `;
}

async function loadDbRunners(client: postgres.Sql): Promise<DbRunnerRow[]> {
  return client<DbRunnerRow[]>`
    select
      r.source_id as race_source_id,
      rr.source_id as runner_source_id,
      h.display_name as horse,
      rr.finishing_position as finish_position,
      rr.result_status,
      rr.beaten_distance,
      rr.official_rating
    from race_runners rr
    join races r on r.id = rr.race_id
    join horses h on h.id = rr.horse_id
    where r.source = 'sporting_life'
      and rr.source = 'sporting_life'
      and r.race_date between ${CALIBRATION.startDate} and ${HOLDOUT.endDate}
    order by r.race_date, r.source_id, rr.finishing_position nulls last, rr.source_id
  `;
}

function toDiagnosticRace(row: DbRaceRow): DiagnosticRace {
  const timing = sanityCheckWinningTime({
    winningTime: row.winning_time,
    distanceYards: row.distance_yards,
  });
  const category = classifyRaceCategory({
    distanceYards: row.distance_yards,
    raceName: row.race_name,
    raceType: row.race_type,
    surface: row.surface,
  });
  return {
    race_source_id: row.race_source_id,
    race_date: row.race_date,
    course: row.course,
    race_name: row.race_name ?? "",
    race_type: row.race_type ?? "",
    race_type_code: row.race_type_code ?? "",
    race_class: row.race_class ?? "",
    distance: row.distance ?? "",
    distance_yards: row.distance_yards,
    segment: category === "flat" ? "turf_flat" : category,
    surface: row.surface ?? "",
    going: row.going ?? "",
    actual: timing.usableSeconds,
    country: row.country,
    course_source_id: row.course_source_id,
    parsed_winning_seconds: timing.parsedSeconds,
    timing_sanity_reason: timing.reason,
  };
}

function toDiagnosticRunners(
  races: DiagnosticRace[],
  rows: DbRunnerRow[],
): DiagnosticRunner[] {
  const raceById = new Map(races.map((race) => [race.race_source_id, race]));
  const byRace = groupBy(rows, (row) => row.race_source_id);
  const output: DiagnosticRunner[] = [];
  for (const [raceSourceId, raceRows] of byRace.entries()) {
    const race = raceById.get(raceSourceId);
    if (!race) {
      continue;
    }
    const cumulative = reconstructCumulativeBeatenLengths(
      raceRows.map((row) => ({
        id: row.runner_source_id,
        finishingPosition: row.finish_position,
        resultStatus: row.result_status,
        beatenDistance: row.beaten_distance,
      })),
    );
    const cumulativeById = new Map(cumulative.map((row) => [row.id, row]));
    for (const row of raceRows) {
      const margin = cumulativeById.get(row.runner_source_id);
      const equivalent = equivalentFinishingTimeSeconds(
        race.actual,
        margin?.cumulativeBeatenLengths ?? null,
        "speed_based",
        {
          distanceYards: race.distance_yards,
          winnerTimeSeconds: race.actual,
          raceCategory: "flat",
        },
      );
      output.push({
        race_source_id: race.race_source_id,
        race_date: race.race_date,
        course: race.course,
        race_name: race.race_name,
        race_type: race.race_type,
        race_class: race.race_class,
        distance: race.distance,
        distance_yards: race.distance_yards,
        segment: race.segment,
        surface: race.surface,
        going: race.going,
        actual_winning_time: race.actual,
        equivalent_time_seconds: equivalent,
        runner_source_id: row.runner_source_id,
        horse: row.horse,
        finish_position: row.finish_position,
        official_rating: row.official_rating,
        country: race.country,
        result_status: row.result_status,
        cumulative_beaten_lengths: margin?.cumulativeBeatenLengths ?? null,
      });
    }
  }
  return output;
}

function inRange(range: typeof CALIBRATION) {
  return (row: { race_date: string }) =>
    row.race_date >= range.startDate && row.race_date <= range.endDate;
}

function standardGroups(races: DiagnosticRace[]): StandardGroup[] {
  return [...groupBy(races, standardKey).entries()]
    .map(([key, rows]) => ({
      key,
      course: rows[0]?.course ?? "",
      country: rows[0]?.country ?? null,
      distance: rows[0]?.distance ?? "",
      distanceYards: rows[0]?.distance_yards ?? null,
      surface: rows[0]?.surface ?? "",
      races: rows,
      times: rows.flatMap((race) => race.actual === null ? [] : [race.actual]),
    }))
    .sort((a, b) => a.course.localeCompare(b.course) || (a.distanceYards ?? 0) - (b.distanceYards ?? 0));
}

function standardKey(race: Pick<DiagnosticRace, "course" | "distance_yards" | "surface">): string {
  return `${race.course}|${race.distance_yards ?? "unknown"}|${race.surface}`;
}

function irishAvailabilityLines(
  races: DiagnosticRace[],
  runners: DiagnosticRunner[],
): string[] {
  const lines: string[] = [];
  for (const range of [CALIBRATION, HOLDOUT]) {
    lines.push(`${range.label}_irish_courses=`);
    for (const course of IRISH_COURSES) {
      const courseRaces = races.filter(inRange(range)).filter((race) => race.course === course);
      const raceIds = new Set(courseRaces.map((race) => race.race_source_id));
      const courseRunners = runners.filter(inRange(range)).filter((runner) => raceIds.has(runner.race_source_id));
      const completed = courseRunners.filter((runner) => isCompletedRunner(runner));
      const courseGroups = standardGroups(courseRaces);
      lines.push([
        `course=${course}`,
        `races=${courseRaces.length}`,
        `completed_runners=${completed.length}`,
        `winning_time_coverage=${courseRaces.filter((race) => race.actual !== null).length}/${courseRaces.length}`,
        `distance_yards_coverage=${courseRaces.filter((race) => race.distance_yards !== null).length}/${courseRaces.length}`,
        `groups=${courseGroups.length}`,
        `sample_bins=${sampleBins(courseGroups)}`,
        `largest=${courseGroups
          .sort((a, b) => b.times.length - a.times.length)
          .slice(0, 5)
          .map(formatGroup)
          .join(" ; ") || "none"}`,
      ].join(" "));
    }
  }
  return lines;
}

function preferredIrish(figures: Figure[]): Figure[] {
  return preferredRows(figures).filter((figure) => countryOf(figure) === "Eire");
}

function preferredRows(figures: Figure[]): Figure[] {
  return figures.filter((figure) => figure.scale === "sec_per_f" && figure.variantMode === "hierarchical");
}

function exclusionAuditLines(
  previousRaces: DiagnosticRace[],
  previousRunners: DiagnosticRunner[],
  excludedRaces: DiagnosticRace[],
): string[] {
  const lines: string[] = [];
  for (const range of [CALIBRATION, HOLDOUT]) {
    const previousInRange = previousRaces.filter(inRange(range));
    const excludedInRange = excludedRaces.filter(inRange(range));
    const excludedIds = new Set(excludedInRange.map((race) => race.race_source_id));
    const affectedCompleted = previousRunners
      .filter(inRange(range))
      .filter((runner) => excludedIds.has(runner.race_source_id))
      .filter((runner) => isCompletedRunner(runner));
    lines.push([
      `${range.label}_audit`,
      `previous_flat_turf_races=${previousInRange.length}`,
      `now_excluded_nh_flat_bumper_races=${excludedInRange.length}`,
      `completed_runners_affected=${affectedCompleted.length}`,
      `excluded_by_country=${countsMapLine(countMap(excludedInRange.map((race) => race.country ?? "<null>"))) || "none"}`,
      `affected_completed_runners_by_country=${countsMapLine(countMap(affectedCompleted.map((runner) => runner.country ?? "<null>"))) || "none"}`,
    ].join(" "));
    for (const race of excludedInRange.slice(0, 12)) {
      lines.push([
        `${range.label}_excluded_example`,
        `date=${race.race_date}`,
        `course=${race.course}`,
        `country=${race.country ?? "-"}`,
        `source_id=${race.race_source_id}`,
        `race_type=${quote(race.race_type || "-")}`,
        `race_type_code=${quote(race.race_type_code || "-")}`,
        `race=${quote(race.race_name)}`,
      ].join(" "));
    }
  }
  const suspiciousAccepted = previousRaces
    .filter((race) => isSupportedFlatTurf(race))
    .filter((race) => isNhFlatOrBumperStyle(race));
  lines.push(`accepted_nh_flat_bumper_marker_races_after_classifier=${suspiciousAccepted.length}`);
  return lines;
}

function summaryLine(rows: Figure[]): string {
  if (rows.length === 0) {
    return "eligible_runners=0";
  }
  const values = rows.map((row) => row.rating);
  const orRows = rows.filter((row) => row.runner.official_rating !== null);
  const deadHeats = deadHeatCheck(rows);
  const sameDayEligible = rows.filter(isSameDayEligible).length;
  return [
    `eligible_runners=${rows.length}`,
    `median=${fmt(median(values))}`,
    `p10=${fmt(percentile(values, 0.1))}`,
    `p90=${fmt(percentile(values, 0.9))}`,
    `min=${fmt(Math.min(...values))}`,
    `max=${fmt(Math.max(...values))}`,
    `outside_0_200=${values.filter((value) => value < 0 || value > 200).length}`,
    `extreme_rate=${fmtPct(values.filter((value) => value < 0 || value > 200).length / values.length)}`,
    `or_pairs=${orRows.length}`,
    `median_abs_or_diff=${fmt(median(orRows.map((row) => Math.abs(row.rating - (row.runner.official_rating ?? 0)))))}`,
    `mean_abs_or_diff=${fmt(mean(orRows.map((row) => Math.abs(row.rating - (row.runner.official_rating ?? 0)))))}`,
    `or_correlation=${fmt(correlation(orRows.map((row) => row.rating), orRows.map((row) => row.runner.official_rating ?? 0)))}`,
    `dead_heats_examined=${deadHeats.examined}`,
    `dead_heat_mismatches=${deadHeats.mismatches}`,
    `same_day_eligibility_rate=${fmtPct(sameDayEligible / rows.length)}`,
  ].join(" ");
}

function courseCaveatLines(figures: Figure[], groups: StandardGroup[]): string[] {
  const rows = preferredRows(figures);
  const lines: string[] = [];
  for (const course of MAJOR_COURSES) {
    const courseRows = rows.filter((row) => row.race.course === course);
    const courseGroups = groups.filter((group) => group.course === course);
    if (courseRows.length === 0 && courseGroups.length === 0) {
      lines.push(`course=${course} status=no_flat_turf_rows`);
      continue;
    }
    const weakGroups = courseGroups.filter((group) => group.times.length > 0 && group.times.length < 5);
    const highSpreadGroups = courseGroups.filter((group) => {
      const furlongs = distanceYardsToFurlongs(group.distanceYards);
      const spread = standardDeviation(group.times);
      return furlongs !== null && spread !== null && spread / furlongs > 0.75;
    });
    const sameDayRate = courseRows.length
      ? courseRows.filter(isSameDayEligible).length / courseRows.length
      : null;
    const recommendation = courseRecommendation({
      rows: courseRows,
      groups: courseGroups,
      weakGroups,
      highSpreadGroups,
      sameDayRate,
    });
    lines.push([
      `course=${course}`,
      `eligible_runners=${courseRows.length}`,
      `groups=${courseGroups.length}`,
      `weak_groups_n_lt_5=${weakGroups.length}`,
      `high_spread_groups=${highSpreadGroups.length}`,
      `same_day_eligibility_rate=${fmtPct(sameDayRate)}`,
      `outside_0_200=${courseRows.filter((row) => row.rating < 0 || row.rating > 200).length}`,
      `recommendation=${recommendation}`,
      `largest=${courseGroups.sort((a, b) => b.times.length - a.times.length).slice(0, 3).map(formatGroup).join(" ; ") || "none"}`,
    ].join(" "));
  }
  return lines;
}

function courseRecommendation(input: {
  rows: Figure[];
  groups: StandardGroup[];
  weakGroups: StandardGroup[];
  highSpreadGroups: StandardGroup[];
  sameDayRate: number | null;
}): string {
  if (input.groups.length === 0 || input.rows.length < 50) {
    return "lower_confidence_due_to_sparse_supported_rows";
  }
  if (input.weakGroups.length / input.groups.length > 0.5) {
    return "lower_confidence_for_weak_course_distance_samples";
  }
  if (input.highSpreadGroups.length >= Math.max(3, Math.ceil(input.groups.length * 0.2))) {
    return "lower_confidence_for_high_timing_spread";
  }
  if (input.sameDayRate !== null && input.sameDayRate < 0.1) {
    return "base_fallback_often_expected_due_to_low_same_day_eligibility";
  }
  return "no_initial_exclusion_evidence";
}

function tailReviewLines(figures: Figure[], label: string): string[] {
  const tails = preferredRows(figures)
    .filter((row) => row.rating < 0 || row.rating > 200)
    .sort((a, b) => a.rating - b.rating);
  const counts = countMap(tails.map(tailCause));
  const lines = [
    `${label}_tails_outside_0_200=${tails.length}`,
    `${label}_tail_causes=${countsMapLine(counts) || "none"}`,
  ];
  for (const row of tails) {
    lines.push([
      `tail`,
      `range=${label}`,
      `rating=${fmt(row.rating)}`,
      `date=${row.race.race_date}`,
      `course=${row.race.course}`,
      `country=${countryOf(row) ?? "-"}`,
      `race=${quote(row.race.race_name)}`,
      `distance_yards=${row.race.distance_yards ?? "-"}`,
      `going=${quote(row.race.going)}`,
      `horse=${quote(row.runner.horse)}`,
      `pos=${row.runner.finish_position ?? "-"}`,
      `or=${row.runner.official_rating ?? "-"}`,
      `beaten_lengths=${fmt(row.cumulativeBeatenLengths)}`,
      `standard_sample=${row.standardSample}`,
      `same_day_peers=${row.sameDayPeerCount}`,
      `same_day_stdev=${fmt(row.sameDayStdevPerF)}`,
      `cause=${tailCause(row)}`,
    ].join(" "));
  }
  return lines;
}

function tailCause(row: Figure): string {
  if (row.cumulativeBeatenLengths > 75) {
    return "large_beaten_distance";
  }
  if (row.standardSample < 5) {
    return "weak_standard";
  }
  if (
    row.sameDayPeerCount >= PREFERRED_THRESHOLD.minPeers &&
    row.sameDayStdevPerF !== null &&
    row.sameDayStdevPerF > PREFERRED_THRESHOLD.maxStdevPerF
  ) {
    return "same_day_instability";
  }
  const band = goingBand(row.race.going);
  if (band === "Heavy" || band === "Soft") {
    return "extreme_going";
  }
  if (row.race.actual !== null && row.race.distance_yards !== null) {
    const speed = row.race.distance_yards / row.race.actual;
    if (speed < 8 || speed > 22) {
      return "source_timing_issue";
    }
  }
  return "unusual_pace_or_no_single_cause";
}

function productionRecommendationLines(
  figures2025: Figure[],
  figures2026: Figure[],
  groups: StandardGroup[],
): string[] {
  const rows2025 = preferredRows(figures2025);
  const rows2026 = preferredRows(figures2026);
  const irishRows = [...preferredIrish(figures2025), ...preferredIrish(figures2026)];
  const tailCount = [...rows2025, ...rows2026].filter((row) => row.rating < 0 || row.rating > 200).length;
  const sparseIrishGroups = groups.filter((group) => group.country === "Eire" && group.times.length > 0 && group.times.length < 5).length;
  const verdict = tailCount > 0 || sparseIrishGroups > 0
    ? "B ready with minor confidence/withholding policy"
    : "A ready for production design unchanged";
  return [
    `verdict=${verdict}`,
    "production_flat_turf_predicate=segment == turf_flat AND surface == TURF AND NOT nh_flat_or_bumper_title_or_type_marker",
    "production_formula=100 + 37.76 * ((standard_seconds - equivalent_time_seconds) / distance_furlongs)",
    "standard_grouping=course + exact distance_yards + TURF surface",
    "same_day_rule=median same-day winner deviation seconds-per-furlong, same course/date, excluding target race; eligible only when peers>=3 and stdev_per_f<=0.3",
    "fallback_rule=use same-day adjusted standard when eligible, otherwise base course/distance Turf standard",
    "confidence_rule=high/provisional for standards with >=5 samples and same-day eligible where available; lower confidence for standard sample <5, sparse course groups, high spread groups, or base fallback on low-coverage courses",
    "withholding_rule=do not copy Jump >75L automatically; use confidence-only for ordinary large-margin/pace tails, but withhold when required timing inputs/margin reconstruction/standard sample are unavailable or when rating falls outside 0..200 due to a source timing sanity issue",
    `uk_ireland_shared_methodology=${irishRows.length > 0 ? "yes; live Irish validation supports using the same method with confidence caveats" : "not_confirmed_no_irish_eligible_rows"}`,
  ];
}

async function existingExportIrishCounts(): Promise<{ anyRows: number; flatTurfRows: number }> {
  let anyRows = 0;
  let flatTurfRows = 0;
  for (const range of [CALIBRATION, HOLDOUT]) {
    try {
      const text = await readFile(`${OUTPUT_DIR}/going-adjustment-races-${range.startDate}-${range.endDate}.csv`, "utf8");
      const rows = parseCsv(text);
      anyRows += rows.filter((row) => IRISH_COURSES.includes((row.course ?? "") as typeof IRISH_COURSES[number])).length;
      flatTurfRows += rows.filter((row) =>
        IRISH_COURSES.includes((row.course ?? "") as typeof IRISH_COURSES[number]) &&
        row.segment === "turf_flat" &&
        row.surface === "TURF"
      ).length;
    } catch {
      // Missing old exports should not block the live DB diagnostic.
    }
  }
  return { anyRows, flatTurfRows };
}

function courseGroupCsv(groups: StandardGroup[]): string {
  const header = [
    "course",
    "country",
    "distance",
    "distance_yards",
    "surface",
    "races",
    "valid_times",
    "median_seconds",
    "stdev_seconds",
    "stdev_per_furlong",
  ];
  const rows = groups.map((group) => {
    const furlongs = distanceYardsToFurlongs(group.distanceYards);
    const stdev = standardDeviation(group.times);
    return [
      group.course,
      group.country ?? "",
      group.distance,
      group.distanceYards ?? "",
      group.surface,
      group.races.length,
      group.times.length,
      fmt(median(group.times)),
      fmt(stdev),
      fmt(furlongs === null || stdev === null ? null : stdev / furlongs),
    ].map(csvEscape).join(",");
  });
  return `${header.join(",")}\n${rows.join("\n")}\n`;
}

function isCompletedRunner(runner: { result_status?: string | null; finish_position: number | null }): boolean {
  return runner.result_status !== "non_runner" &&
    (runner.finish_position !== null || runner.result_status === "finished");
}

function isSameDayEligible(row: Figure): boolean {
  return row.sameDayAdjustmentPerF !== null &&
    row.sameDayStdevPerF !== null &&
    row.sameDayPeerCount >= PREFERRED_THRESHOLD.minPeers &&
    row.sameDayStdevPerF <= PREFERRED_THRESHOLD.maxStdevPerF;
}

function countryOf(row: Figure): string | null {
  return "country" in row.race ? (row.race.country as string | null) : null;
}

function sampleBins(groups: StandardGroup[]): string {
  const counts = countMap(groups.map((group) => sampleBin(group.times.length)));
  return countsMapLine(counts) || "none";
}

function sampleBin(sample: number): string {
  if (sample === 0) return "0";
  if (sample === 1) return "1";
  if (sample <= 4) return "2-4";
  if (sample <= 9) return "5-9";
  if (sample <= 19) return "10-19";
  if (sample <= 39) return "20-39";
  if (sample <= 79) return "40-79";
  return "80+";
}

function formatGroup(group: StandardGroup): string {
  const furlongs = distanceYardsToFurlongs(group.distanceYards);
  const stdev = standardDeviation(group.times);
  const stdevPerF = furlongs === null || stdev === null ? null : stdev / furlongs;
  return `${group.course} ${group.distanceYards ?? "-"}y n=${group.times.length} median=${fmt(median(group.times))} sd_f=${fmt(stdevPerF)}`;
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return sorted[index] ?? null;
}

function correlation(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 2) return null;
  const xMean = mean(xs);
  const yMean = mean(ys);
  if (xMean === null || yMean === null) return null;
  const numerator = xs.reduce((total, x, index) => total + (x - xMean) * ((ys[index] ?? 0) - yMean), 0);
  const xVar = xs.reduce((total, x) => total + (x - xMean) ** 2, 0);
  const yVar = ys.reduce((total, y) => total + (y - yMean) ** 2, 0);
  return xVar > 0 && yVar > 0 ? numerator / Math.sqrt(xVar * yVar) : null;
}

function groupBy<T>(values: T[], key: (value: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const value of values) {
    const existing = grouped.get(key(value)) ?? [];
    existing.push(value);
    grouped.set(key(value), existing);
  }
  return grouped;
}

function countMap(values: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function countsMapLine(counts: Map<string, number>): string {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key, count]) => `${key}:${count}`)
    .join(", ");
}

function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === "\"" && inQuotes && next === "\"") {
      field += "\"";
      index += 1;
    } else if (char === "\"") {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
    } else if (char === "\n" && !inQuotes) {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header = [], ...body] = rows;
  return body
    .filter((values) => values.length === header.length)
    .map((values) => Object.fromEntries(header.map((name, index) => [name, values[index] ?? ""])));
}

function csvEscape(value: unknown): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}

function quote(value: string): string {
  return `"${value.replaceAll("\"", "'")}"`;
}

function fmt(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value) ? "-" : value.toFixed(3);
}

function fmtPct(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value) ? "-" : `${(value * 100).toFixed(1)}%`;
}

if (process.argv[1]?.endsWith("diagnose-flat-turf-production-readiness.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
