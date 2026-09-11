import { mkdir, readFile, writeFile } from "node:fs/promises";
import { and, between, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { courses, raceRunners, races } from "@/db/schema";
import {
  distanceYardsToFurlongs,
  mean,
  median,
  standardDeviation,
} from "@/lib/racing/speed-research";

const OUTPUT_DIR = "data/research";
const CALIBRATION = { label: "2025", startDate: "2025-01-01", endDate: "2025-12-31" };
const HOLDOUT = { label: "2026_holdout", startDate: "2026-01-01", endDate: "2026-08-31" };
const REPORT_PATH = `${OUTPUT_DIR}/flat-turf-speed-rating-research-2025-calibration-2026-holdout.txt`;
const SUMMARY_CSV_PATH = `${OUTPUT_DIR}/flat-turf-speed-rating-research-summary.csv`;

type Range = typeof CALIBRATION;
type Scale = "current_length" | "sec_per_f" | "pct_time";
type VariantMode = "base" | "going_band" | "daily_median" | "daily_trimmed" | "hierarchical";

const SPORTING_LIFE_SOURCE = "sporting_life";
const FLAT_TURF_SEGMENT = "turf_flat";
const TURF_SURFACE = "TURF";
const SEC_PER_F_POINTS = 37.76;
const PCT_TIME_POINTS = 1_000;
const DEAD_HEAT_TOLERANCE = 0.000001;

export type RaceRow = {
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
  actual: number | null;
};

export type RunnerRow = {
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
  actual_winning_time: number | null;
  equivalent_time_seconds: number | null;
  runner_source_id: string;
  horse: string;
  finish_position: number | null;
  official_rating: number | null;
};

export type FlatTurfPredicateInput = {
  segment: string | null;
  surface: string | null;
  race_name?: string | null;
  race_type?: string | null;
  race_type_code?: string | null;
};

type CoverageStats = {
  label: string;
  turfRaces: number;
  recordedRunners: number;
  completedRunners: number;
  nonRunners: number;
  otherStatusCounts: Map<string, number>;
  usableTimingRunners: number;
  runnersWithOr: number;
  racesWithWinningTime: number;
  racesWithDistanceYards: number;
  segmentCounts: Map<string, number>;
  surfaceCounts: Map<string, number>;
  mixedCourseExamples: string[];
};

export type Standard = {
  seconds: number | null;
  sample: number;
};

export type Figure = {
  range: string;
  scale: Scale;
  variantMode: VariantMode;
  race: RaceRow;
  runner: RunnerRow;
  rating: number;
  baseRating: number;
  sameDayRating: number | null;
  cumulativeBeatenLengths: number;
  standard: number;
  standardSample: number;
  equivalentTime: number;
  deviationPerF: number;
  pctDeviation: number;
  sameDayAdjustmentPerF: number | null;
  sameDayPeerCount: number;
  sameDayStdevPerF: number | null;
};

type SameDayThreshold = {
  minPeers: number;
  maxStdevPerF: number;
};

const SCALES: Scale[] = ["current_length", "sec_per_f", "pct_time"];
const VARIANT_MODES: VariantMode[] = ["base", "going_band", "daily_median", "daily_trimmed", "hierarchical"];
const SAME_DAY_THRESHOLDS: SameDayThreshold[] = [
  { minPeers: 2, maxStdevPerF: 0.2 },
  { minPeers: 2, maxStdevPerF: 0.3 },
  { minPeers: 3, maxStdevPerF: 0.2 },
  { minPeers: 3, maxStdevPerF: 0.3 },
  { minPeers: 4, maxStdevPerF: 0.2 },
  { minPeers: 4, maxStdevPerF: 0.3 },
];
const PREFERRED_THRESHOLD = { minPeers: 3, maxStdevPerF: 0.3 };

async function main() {
  const { db, client } = createResearchDbConnection();
  const calibrationRaces = await loadRaces(CALIBRATION);
  const calibrationRunners = await loadRunners(CALIBRATION);
  const holdoutRaces = await loadRaces(HOLDOUT);
  const holdoutRunners = await loadRunners(HOLDOUT);
  const calibrationTurfRaces = calibrationRaces.filter(isFlatTurfRace);
  const holdoutTurfRaces = holdoutRaces.filter(isFlatTurfRace);
  const calibrationTurfRunners = calibrationRunners.filter(isFlatTurfRunner);
  const holdoutTurfRunners = holdoutRunners.filter(isFlatTurfRunner);
  const [calibrationCoverage, holdoutCoverage] = await Promise.all([
    loadCoverageStats(db, CALIBRATION, calibrationRaces, calibrationTurfRaces),
    loadCoverageStats(db, HOLDOUT, holdoutRaces, holdoutTurfRaces),
  ]);
  const scaleCalibration = calibrateScales(calibrationTurfRaces, calibrationTurfRunners);
  const figures2025 = calculateFigures({
    range: CALIBRATION.label,
    races: calibrationTurfRaces,
    runners: calibrationTurfRunners,
    calibrationRaces: calibrationTurfRaces,
    scaleCalibration,
    threshold: PREFERRED_THRESHOLD,
    leaveOneOut: true,
  });
  const figures2026 = calculateFigures({
    range: HOLDOUT.label,
    races: holdoutTurfRaces,
    runners: holdoutTurfRunners,
    calibrationRaces: calibrationTurfRaces,
    scaleCalibration,
    threshold: PREFERRED_THRESHOLD,
    leaveOneOut: false,
  });
  await client.end();

  const lines: string[] = [];
  lines.push("# Flat Turf Speed-Rating Research");
  lines.push("");
  lines.push("research_only=true");
  lines.push("production_jump_logic_changed=false");
  lines.push("schema_changed=false");
  lines.push("ratings_persisted=false");
  lines.push("external_requests=false");
  lines.push(`calibration=${CALIBRATION.startDate}..${CALIBRATION.endDate}`);
  lines.push(`holdout=${HOLDOUT.startDate}..${HOLDOUT.endDate}`);
  lines.push("");
  lines.push("## Stage 1 - Flat Turf Race Predicate");
  lines.push("source=data/research/going-adjustment-races/runners Sporting Life exports");
  lines.push("flat_turf_predicate=segment == turf_flat AND surface == TURF AND NOT nh_flat_or_bumper_title_or_type_marker");
  lines.push("predicate_note=positive ordinary Flat Turf predicate; ALLWEATHER, POLYTRACK, jumps, NH Flat/bumper, blank, null and unrelated surfaces are excluded.");
  lines.push(`observed_surfaces_2025_2026=${countsLine([...calibrationRaces, ...holdoutRaces].map((race) => race.surface || "<blank>"))}`);
  lines.push(`observed_flat_turf_surfaces=${countsLine([...calibrationTurfRaces, ...holdoutTurfRaces].map((race) => race.surface || "<blank>"))}`);
  lines.push(`db_segment_values=${countsMapLine(mergeCounts(calibrationCoverage.segmentCounts, holdoutCoverage.segmentCounts))}`);
  lines.push(`db_surface_values=${countsMapLine(mergeCounts(calibrationCoverage.surfaceCounts, holdoutCoverage.surfaceCounts))}`);
  lines.push(`mixed_course_examples=${[...new Set([...calibrationCoverage.mixedCourseExamples, ...holdoutCoverage.mixedCourseExamples])].join("; ") || "none"}`);
  lines.push("material_surface_labels=TURF is explicitly present in the source surface field and is kept separate from ALLWEATHER/POLYTRACK at mixed venues.");
  lines.push("");
  lines.push("## Stage 2 - Coverage");
  lines.push("coverage_source=live_postgres_full_race_runner_rows");
  lines.push("figure_csv_scope=completed_or_usable_timing_export; not used as full runner coverage denominator");
  lines.push(...coverageLines(CALIBRATION, calibrationCoverage, calibrationTurfRaces, calibrationTurfRunners));
  lines.push(...coverageLines(HOLDOUT, holdoutCoverage, holdoutTurfRaces, holdoutTurfRunners));
  lines.push("uk_ireland_note=current going-adjustment Flat Turf exports contain UK Turf courses only; no Curragh/Leopardstown/Galway Flat Turf rows are present in this research input, so Ireland transfer cannot be judged in this pass.");
  lines.push("");
  lines.push("## Stage 3 - Standard-Time Stability");
  lines.push("standard_key=course source ID + exact distance_yards + TURF");
  lines.push(...standardStabilityLines(calibrationTurfRaces, "2025 calibration"));
  lines.push(...standardStabilityLines(holdoutTurfRaces, "2026 holdout"));
  lines.push("");
  lines.push("## Stage 4 - Candidate Scales");
  lines.push("current_length=100 + speed_based_lengths_faster_than_standard; this is the existing generic research scale, not the jump production sec-per-f constant.");
  lines.push(`sec_per_f=100 + ${fmt(scaleCalibration.secPerFPoints)} * ((standard - equivalent_time) / furlongs)`);
  lines.push(`pct_time=100 + ${fmt(scaleCalibration.pctPoints)} * ((standard - equivalent_time) / standard)`);
  lines.push("scale_calibration=OR_independent_fixed_constants; sec_per_f reuses the transparent jump_speed_v1 seconds-per-furlong constant; pct_time uses fixed 1000 points per unit time-ratio.");
  lines.push("OR_usage=diagnostic_only_after_ratings_are_generated; not used for constants, thresholds, candidate selection or recommendation.");
  lines.push("beaten_distance_conversion=existing speed_based conversion from cumulative beaten lengths.");
  lines.push("");
  lines.push("## Stage 4b - Going Distribution");
  lines.push(...goingDistributionLines([...calibrationTurfRaces, ...holdoutTurfRaces]));
  lines.push("");
  lines.push("## Stage 5 - Daily Turf Going/Track Variant");
  lines.push("same_day_measure=daily track/going allowance as winner deviation per furlong against course+distance Turf standard, excluding target race");
  lines.push("same_day_threshold_selection=timing_only; thresholds are not chosen by OR optimization");
  lines.push(...sameDayThresholdLines(calibrationTurfRaces));
  lines.push("");
  lines.push("## Stage 5b - Dead-Heat Validation");
  lines.push("dead_heat_method=infer supported dead-heats from repeated finish_position within a race and require equivalent_time and final rating equality");
  lines.push(`dead_heat_tolerance=${DEAD_HEAT_TOLERANCE}`);
  lines.push(`2025_dead_heat_current_length_hierarchical=${deadHeatLine(figures2025, "current_length", "hierarchical")}`);
  lines.push(`2026_dead_heat_current_length_hierarchical=${deadHeatLine(figures2026, "current_length", "hierarchical")}`);
  lines.push("");
  lines.push("## Stage 6 - 2025 Candidate Comparison");
  lines.push(...candidateSummaryLines(figures2025, CALIBRATION.label));
  lines.push("");
  lines.push("## Stage 7 - Surface/Course Segmentation");
  lines.push(...segmentLines(figures2025, "surface"));
  lines.push(...segmentLines(figures2025, "course"));
  lines.push("");
  lines.push("## Stage 8 - Distance Segmentation");
  lines.push(...segmentLines(figures2025, "distance"));
  lines.push("## Stage 8b - 2026 Segmentation");
  lines.push(...segmentLines(figures2026, "surface"));
  lines.push(...segmentLines(figures2026, "course"));
  lines.push(...segmentLines(figures2026, "distance"));
  lines.push("");
  lines.push("## Stage 9 - Large Beaten-Distance Review");
  lines.push(...beatenDistanceLines(figures2025));
  lines.push("");
  lines.push("## Stage 9b - Preferred Tail Examples");
  lines.push(...tailExampleLines(figures2025, "2025"));
  lines.push(...tailExampleLines(figures2026, "2026_holdout"));
  lines.push("");
  lines.push("## Stage 10 - 2026 Holdout");
  lines.push(...candidateSummaryLines(figures2026, HOLDOUT.label));
  lines.push(...holdoutComparisonLines(figures2025, figures2026));
  lines.push("");
  lines.push("## Stage 11 - Same-Day Value");
  lines.push(...sameDayValueLines(figures2025, figures2026));
  lines.push("");
  lines.push("## Stage 12 - Same Raw Time / Different Going Sanity");
  lines.push(...sameRawTimeSanityLines(figures2025));
  lines.push("");
  lines.push("## Preferred Research Configuration");
  lines.push("preferred=sec_per_f + hierarchical daily median seconds-per-furlong allowance fallback");
  lines.push(`same_day_threshold=min_peer_races_${PREFERRED_THRESHOLD.minPeers}_and_stdev_per_f_lte_${PREFERRED_THRESHOLD.maxStdevPerF}`);
  lines.push("verdict=research-only recommendation; production readiness depends on reviewing tail examples and course-specific caveats before UI integration.");
  lines.push("caveats=Flat Turf going has much larger time impact than AW; mixed venues require segment+surface isolation; daily adjustment should be used only when peer count and dispersion are acceptable.");

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(REPORT_PATH, `${lines.join("\n")}\n`);
  await writeFile(SUMMARY_CSV_PATH, summaryCsv([...figures2025, ...figures2026]));
  console.log(lines.join("\n"));
  console.log(`\nfull_report=${REPORT_PATH}`);
  console.log(`summary_csv=${SUMMARY_CSV_PATH}`);
}

async function loadRaces(range: Range): Promise<RaceRow[]> {
  return parseCsv(await readFile(raceCsvPath(range), "utf8")).map((row) => ({
    race_source_id: row.race_source_id ?? "",
    race_date: row.race_date ?? "",
    course: row.course ?? "",
    race_name: row.race_name ?? "",
    race_type: row.race_type ?? "",
    race_class: row.race_class ?? "",
    distance: row.distance ?? "",
    distance_yards: numberOrNull(row.distance_yards),
    segment: row.segment ?? "",
    surface: row.surface ?? "",
    going: row.going ?? "",
    actual: numberOrNull(row.actual),
  }));
}

function createResearchDbConnection() {
  const url = process.env.DATABASE_URL;
  const client = url
    ? postgres(url)
    : postgres({ host: "/tmp", database: "racing_analysis" });
  return { client, db: drizzle(client, { schema: { courses, raceRunners, races } }) };
}

async function loadCoverageStats(
  db: ReturnType<typeof createResearchDbConnection>["db"],
  range: Range,
  sourceRaces: RaceRow[],
  turfSourceRaces: RaceRow[],
): Promise<CoverageStats> {
  const turfSourceIds = turfSourceRaces.map((race) => race.race_source_id);
  const raceRows = turfSourceIds.length
    ? await db
    .select({
      raceId: races.id,
      raceSourceId: races.sourceId,
      course: courses.displayName,
      winningTime: races.winningTime,
      distanceYards: races.distanceYards,
    })
    .from(races)
    .innerJoin(courses, eq(races.courseId, courses.id))
    .where(
      and(
        eq(races.source, SPORTING_LIFE_SOURCE),
        between(races.raceDate, range.startDate, range.endDate),
        inArray(races.sourceId, turfSourceIds),
      ),
    )
    : [];
  const turfRaceIds = new Set(raceRows.map((race) => race.raceId));
  const runnerRows = turfRaceIds.size
    ? await db
        .select({
          raceId: raceRunners.raceId,
          resultStatus: raceRunners.resultStatus,
          finishingPosition: raceRunners.finishingPosition,
          officialRating: raceRunners.officialRating,
        })
        .from(raceRunners)
        .where(
          and(
            eq(raceRunners.source, SPORTING_LIFE_SOURCE),
            inArray(raceRunners.raceId, [...turfRaceIds]),
          ),
        )
    : [];
  const turfRaces = raceRows.filter((race) => turfRaceIds.has(race.raceId));
  const completed = runnerRows.filter(
    (runner) =>
      runner.resultStatus !== "non_runner" &&
      (runner.finishingPosition !== null || runner.resultStatus === "finished"),
  );
  const statusCounts = countMap(
    runnerRows
      .filter((runner) => runner.resultStatus !== null && runner.resultStatus !== "finished" && runner.resultStatus !== "non_runner")
      .map((runner) => runner.resultStatus ?? "<null>"),
  );
  const mixedCourseExamples = [...groupBy(sourceRaces, (race) => race.course).entries()]
    .filter(([, rows]) => {
      const surfaces = new Set(rows.map((row) => row.surface ?? "<null>"));
      return surfaces.has("TURF") && ([...surfaces].includes("ALLWEATHER") || [...surfaces].includes("POLYTRACK"));
    })
    .map(([course, rows]) => `${course}(${countsLine(rows.map((row) => row.surface ?? "<null>"))})`)
    .slice(0, 8);

  return {
    label: range.label,
    turfRaces: turfRaces.length,
    recordedRunners: runnerRows.length,
    completedRunners: completed.length,
    nonRunners: runnerRows.filter((runner) => runner.resultStatus === "non_runner").length,
    otherStatusCounts: statusCounts,
    usableTimingRunners: 0,
    runnersWithOr: runnerRows.filter((runner) => runner.officialRating !== null).length,
    racesWithWinningTime: turfRaces.filter((race) => race.winningTime !== null && race.winningTime.trim() !== "").length,
    racesWithDistanceYards: turfRaces.filter((race) => race.distanceYards !== null).length,
    segmentCounts: countMap(sourceRaces.map((race) => race.segment || "<blank>")),
    surfaceCounts: countMap(sourceRaces.map((race) => race.surface || "<blank>")),
    mixedCourseExamples,
  };
}

async function loadRunners(range: Range): Promise<RunnerRow[]> {
  return parseCsv(await readFile(runnerCsvPath(range), "utf8")).map((row) => ({
    race_source_id: row.race_source_id ?? "",
    race_date: row.race_date ?? "",
    course: row.course ?? "",
    race_name: row.race_name ?? "",
    race_type: row.race_type ?? "",
    race_class: row.race_class ?? "",
    distance: row.distance ?? "",
    distance_yards: numberOrNull(row.distance_yards),
    segment: row.segment ?? "",
    surface: row.surface ?? "",
    going: row.going ?? "",
    actual_winning_time: numberOrNull(row.actual_winning_time),
    equivalent_time_seconds: numberOrNull(row.equivalent_time_seconds),
    runner_source_id: row.runner_source_id ?? "",
    horse: row.horse ?? "",
    finish_position: numberOrNull(row.finish_position),
    official_rating: numberOrNull(row.official_rating),
  }));
}

export function isSupportedFlatTurf(input: FlatTurfPredicateInput): boolean {
  return input.segment === FLAT_TURF_SEGMENT &&
    input.surface === TURF_SURFACE &&
    !isNhFlatOrBumperStyle(input);
}

export function isPotentialFlatTurfSurface(input: FlatTurfPredicateInput): boolean {
  return input.segment === FLAT_TURF_SEGMENT && input.surface === TURF_SURFACE;
}

export function isNhFlatOrBumperStyle(input: Pick<FlatTurfPredicateInput, "race_name" | "race_type" | "race_type_code">): boolean {
  const text = `${input.race_name ?? ""} ${input.race_type ?? ""} ${input.race_type_code ?? ""}`
    .toLowerCase()
    .replaceAll(".", "");
  return /\binh\b/.test(text) ||
    text.includes("bumper") ||
    text.includes("national hunt flat") ||
    text.includes("point-to-point flat race") ||
    text.includes("(pro/am) flat race") ||
    text.includes("(ladies pro/am) flat race") ||
    /\bflat race(?:\b|\s|\()/.test(text);
}

function isFlatTurfRace(race: RaceRow): boolean {
  return isSupportedFlatTurf(race);
}

function isFlatTurfRunner(runner: RunnerRow): boolean {
  return isSupportedFlatTurf(runner);
}

function raceCsvPath(range: Range): string {
  return `${OUTPUT_DIR}/going-adjustment-races-${range.startDate}-${range.endDate}.csv`;
}

function runnerCsvPath(range: Range): string {
  return `${OUTPUT_DIR}/going-adjustment-runners-${range.startDate}-${range.endDate}.csv`;
}

function groupKey(race: Pick<RaceRow, "course" | "distance_yards" | "surface">): string {
  return `${race.course}|${race.distance_yards ?? "unknown"}|${race.surface}`;
}

function goingBandGroupKey(race: Pick<RaceRow, "course" | "distance_yards" | "surface" | "going">): string {
  return `${groupKey(race)}|going_band:${goingBand(race.going) ?? "unknown"}`;
}

function meetingKey(race: Pick<RaceRow, "race_date" | "course">): string {
  return `${race.race_date}|${race.course}`;
}

export function standardForRace(
  race: RaceRow,
  calibrationRaces: RaceRow[],
  leaveOneOut: boolean,
  keyForRace: (race: RaceRow) => string = groupKey,
): Standard {
  const times = calibrationRaces
    .filter((candidate) => keyForRace(candidate) === keyForRace(race))
    .filter((candidate) => !leaveOneOut || candidate.race_source_id !== race.race_source_id)
    .flatMap((candidate) => candidate.actual === null ? [] : [candidate.actual]);
  return { seconds: median(times), sample: times.length };
}

export function sameDayForRace(input: {
  race: RaceRow;
  races: RaceRow[];
  calibrationRaces: RaceRow[];
  leaveOneOut: boolean;
}): { adjustmentPerF: number | null; trimmedAdjustmentPerF: number | null; peerCount: number; stdevPerF: number | null } {
  const deviations = input.races
    .filter((candidate) => meetingKey(candidate) === meetingKey(input.race))
    .filter((candidate) => candidate.race_source_id !== input.race.race_source_id)
    .flatMap((candidate) => {
      const furlongs = distanceYardsToFurlongs(candidate.distance_yards);
      const standard = standardForRace(candidate, input.calibrationRaces, input.leaveOneOut);
      if (candidate.actual === null || standard.seconds === null || furlongs === null) {
        return [];
      }
      return [(candidate.actual - standard.seconds) / furlongs];
    });
  return {
    adjustmentPerF: median(deviations),
    trimmedAdjustmentPerF: trimmedMean(deviations, 0.1),
    peerCount: deviations.length,
    stdevPerF: standardDeviation(deviations),
  };
}

export function calculateFigures(input: {
  range: string;
  races: RaceRow[];
  runners: RunnerRow[];
  calibrationRaces: RaceRow[];
  scaleCalibration: { secPerFPoints: number; pctPoints: number };
  threshold: SameDayThreshold;
  leaveOneOut: boolean;
}): Figure[] {
  const raceById = new Map(input.races.map((race) => [race.race_source_id, race]));
  const runnersByRace = groupBy(input.runners, (runner) => runner.race_source_id);
  const baseStandards = standardsForRaces(input.races, input.calibrationRaces, input.leaveOneOut, groupKey);
  const goingBandStandards = standardsForRaces(input.races, input.calibrationRaces, input.leaveOneOut, goingBandGroupKey);
  const dailyDeviationByRaceId = new Map<string, number>();
  for (const race of input.races) {
    const standard = baseStandards.get(race.race_source_id);
    const furlongs = distanceYardsToFurlongs(race.distance_yards);
    if (race.actual === null || standard?.seconds === null || standard === undefined || furlongs === null) {
      continue;
    }
    dailyDeviationByRaceId.set(race.race_source_id, (race.actual - standard.seconds) / furlongs);
  }
  const dailyDeviationsByMeeting = groupBy(
    input.races.flatMap((race) => {
      const value = dailyDeviationByRaceId.get(race.race_source_id);
      return value === undefined ? [] : [{ race, value }];
    }),
    (row) => meetingKey(row.race),
  );
  const figures: Figure[] = [];
  for (const race of input.races) {
    const standard = baseStandards.get(race.race_source_id) ?? { seconds: null, sample: 0 };
    const goingBandStandard = goingBandStandards.get(race.race_source_id) ?? { seconds: null, sample: 0 };
    if (race.actual === null || race.distance_yards === null || standard.seconds === null || standard.sample < 2) {
      continue;
    }
    const sameDay = dailyAdjustmentForRace(race, dailyDeviationsByMeeting);
    const sameDayEligible =
      sameDay.adjustmentPerF !== null &&
      sameDay.stdevPerF !== null &&
      sameDay.peerCount >= input.threshold.minPeers &&
      sameDay.stdevPerF <= input.threshold.maxStdevPerF;
    const sourceRunners = new Map((runnersByRace.get(race.race_source_id) ?? []).map((runner) => [runner.runner_source_id, runner]));
    const rows = (runnersByRace.get(race.race_source_id) ?? [])
      .filter((runner) => runner.finish_position !== null)
      .filter((runner) => runner.equivalent_time_seconds !== null)
      .sort((a, b) => (a.finish_position ?? 0) - (b.finish_position ?? 0));
    for (const runnerRow of rows) {
      const runner = sourceRunners.get(runnerRow.runner_source_id);
      const equivalentTime = runnerRow.equivalent_time_seconds;
      const cumulativeBeatenLengths = reconstructLengthsFromEquivalentTime(race, equivalentTime);
      if (!runner || equivalentTime === null || cumulativeBeatenLengths === null) {
        continue;
      }
      const furlongs = distanceYardsToFurlongs(race.distance_yards);
      if (furlongs === null) {
        continue;
      }
      const baseStandard = standard.seconds;
      const sameDayStandard = sameDayEligible && sameDay.adjustmentPerF !== null
        ? baseStandard + sameDay.adjustmentPerF * furlongs
        : null;
      const trimmedDailyStandard = sameDayEligible && sameDay.trimmedAdjustmentPerF !== null
        ? baseStandard + sameDay.trimmedAdjustmentPerF * furlongs
        : null;
      const goingBandSeconds = goingBandStandard.sample >= 2 ? goingBandStandard.seconds : null;
      for (const scale of SCALES) {
        const baseRating = rate(scale, baseStandard, equivalentTime, race, input.scaleCalibration);
        const sameDayRating = sameDayStandard === null ? null : rate(scale, sameDayStandard, equivalentTime, race, input.scaleCalibration);
        const trimmedDailyRating = trimmedDailyStandard === null ? null : rate(scale, trimmedDailyStandard, equivalentTime, race, input.scaleCalibration);
        const goingBandRating = goingBandSeconds === null ? null : rate(scale, goingBandSeconds, equivalentTime, race, input.scaleCalibration);
        if (baseRating === null) {
          continue;
        }
        for (const variantMode of VARIANT_MODES) {
          if (variantMode === "daily_median" && sameDayRating === null) {
            continue;
          }
          if (variantMode === "daily_trimmed" && trimmedDailyRating === null) {
            continue;
          }
          if (variantMode === "going_band" && goingBandRating === null) {
            continue;
          }
          const rating = variantMode === "daily_median"
            ? sameDayRating ?? baseRating
            : variantMode === "daily_trimmed"
              ? trimmedDailyRating ?? baseRating
              : variantMode === "going_band"
                ? goingBandRating ?? baseRating
                : variantMode === "hierarchical"
                  ? sameDayRating ?? baseRating
                  : baseRating;
          figures.push({
            range: input.range,
            scale,
            variantMode,
            race: raceById.get(race.race_source_id) ?? race,
            runner,
            rating,
            baseRating,
            sameDayRating,
            cumulativeBeatenLengths,
            standard: baseStandard,
            standardSample: standard.sample,
            equivalentTime,
            deviationPerF: (baseStandard - equivalentTime) / furlongs,
            pctDeviation: (baseStandard - equivalentTime) / baseStandard,
            sameDayAdjustmentPerF: sameDay.adjustmentPerF,
            sameDayPeerCount: sameDay.peerCount,
            sameDayStdevPerF: sameDay.stdevPerF,
          });
        }
      }
    }
  }
  return figures;
}

function standardsForRaces(
  racesToRate: RaceRow[],
  calibrationRaces: RaceRow[],
  leaveOneOut: boolean,
  keyForRace: (race: RaceRow) => string,
): Map<string, Standard> {
  const timesByKey = new Map<string, Array<{ raceSourceId: string; seconds: number }>>();
  for (const race of calibrationRaces) {
    if (race.actual === null) {
      continue;
    }
    const key = keyForRace(race);
    const values = timesByKey.get(key) ?? [];
    values.push({ raceSourceId: race.race_source_id, seconds: race.actual });
    timesByKey.set(key, values);
  }

  const standards = new Map<string, Standard>();
  for (const race of racesToRate) {
    const values = timesByKey.get(keyForRace(race)) ?? [];
    const seconds = values
      .filter((value) => !leaveOneOut || value.raceSourceId !== race.race_source_id)
      .map((value) => value.seconds);
    standards.set(race.race_source_id, { seconds: median(seconds), sample: seconds.length });
  }
  return standards;
}

function dailyAdjustmentForRace(
  race: RaceRow,
  dailyDeviationsByMeeting: Map<string, Array<{ race: RaceRow; value: number }>>,
): { adjustmentPerF: number | null; trimmedAdjustmentPerF: number | null; peerCount: number; stdevPerF: number | null } {
  const peers = (dailyDeviationsByMeeting.get(meetingKey(race)) ?? [])
    .filter((row) => row.race.race_source_id !== race.race_source_id)
    .map((row) => row.value);
  return {
    adjustmentPerF: median(peers),
    trimmedAdjustmentPerF: trimmedMean(peers, 0.1),
    peerCount: peers.length,
    stdevPerF: standardDeviation(peers),
  };
}

function reconstructLengthsFromEquivalentTime(race: RaceRow, equivalentTime: number | null): number | null {
  if (equivalentTime === null || race.actual === null || race.distance_yards === null || race.actual <= 0) {
    return null;
  }
  const secondsPerLength = (8 / 3) / (race.distance_yards / race.actual);
  if (secondsPerLength <= 0) {
    return null;
  }
  return Math.max(0, (equivalentTime - race.actual) / secondsPerLength);
}

function rate(scale: Scale, standard: number, equivalentTime: number, race: RaceRow, calibration: { secPerFPoints: number; pctPoints: number }): number | null {
  const furlongs = distanceYardsToFurlongs(race.distance_yards);
  if (furlongs === null) {
    return null;
  }
  const diff = standard - equivalentTime;
  if (scale === "current_length") {
    const secondsPerLength = (8 / 3) / ((race.distance_yards ?? 0) / (race.actual ?? 0));
    return secondsPerLength > 0 ? 100 + diff / secondsPerLength : null;
  }
  if (scale === "sec_per_f") {
    return 100 + calibration.secPerFPoints * (diff / furlongs);
  }
  return 100 + calibration.pctPoints * (diff / standard);
}

export function calibrateScales(races: RaceRow[], runners: RunnerRow[]) {
  return {
    secPerFPoints: SEC_PER_F_POINTS,
    pctPoints: PCT_TIME_POINTS,
    timingOnlyCalibrationRaces: races.length,
    timingOnlyCalibrationRunners: runners.length,
  };
}

function coverageLines(range: Range, coverage: CoverageStats, races: RaceRow[], runners: RunnerRow[]): string[] {
  const completed = runners.filter((runner) => runner.finish_position !== null);
  const courses = new Set(races.map((race) => race.course));
  const groups = new Set(races.map(groupKey));
  const usableTimingRunners = runners.filter((runner) => runner.equivalent_time_seconds !== null).length;
  const orCoveragePct = coverage.recordedRunners === 0 ? null : coverage.runnersWithOr / coverage.recordedRunners;
  const usableTimingPct = coverage.recordedRunners === 0 ? null : usableTimingRunners / coverage.recordedRunners;
  return [
    `${range.label}_flat_turf_races=${coverage.turfRaces}`,
    `${range.label}_declared_recorded_runners=${coverage.recordedRunners}`,
    `${range.label}_finished_completed_runners=${coverage.completedRunners}`,
    `${range.label}_non_runners=${coverage.nonRunners}`,
    `${range.label}_other_non_completion_statuses=${countsMapLine(coverage.otherStatusCounts) || "none"}`,
    `${range.label}_usable_timing_runners=${usableTimingRunners}`,
    `${range.label}_runners_with_or=${coverage.runnersWithOr}`,
    `${range.label}_or_coverage_pct=${fmtPct(orCoveragePct)}`,
    `${range.label}_usable_timing_coverage_pct=${fmtPct(usableTimingPct)}`,
    `${range.label}_winning_time_coverage=${coverage.racesWithWinningTime}/${coverage.turfRaces}`,
    `${range.label}_distance_yards_coverage=${coverage.racesWithDistanceYards}/${coverage.turfRaces}`,
    `${range.label}_csv_completed_runner_scope=${runners.length}; completed_rows_in_csv=${completed.length}`,
    `${range.label}_courses=${courses.size}`,
    `${range.label}_course_exact_distance_groups=${groups.size}`,
    `${range.label}_courses_detail=${countsLine(races.map((race) => race.course))}`,
  ];
}

function standardStabilityLines(races: RaceRow[], label: string): string[] {
  const groups = [...groupBy(races, groupKey).entries()].map(([key, rows]) => ({
    key,
    course: rows[0]?.course ?? "",
    distance: rows[0]?.distance ?? "",
    distanceYards: rows[0]?.distance_yards ?? null,
    surface: rows[0]?.surface ?? "",
    times: rows.flatMap((race) => race.actual === null ? [] : [race.actual]),
    goings: rows.map((race) => race.going || "<blank>"),
  }));
  const bins = new Map<string, number>();
  for (const group of groups) {
    const label = sampleBin(group.times.length);
    bins.set(label, (bins.get(label) ?? 0) + 1);
  }
  const lines = [`${label}_sample_bins=${[...bins.entries()].map(([k, v]) => `${k}:${v}`).join(", ")}`];
  lines.push(`${label}_largest_groups=`);
  for (const group of groups.sort((a, b) => b.times.length - a.times.length).slice(0, 12)) {
    lines.push(formatGroup(group));
  }
  for (const course of ["Ascot", "Newmarket", "York", "Doncaster", "Goodwood", "Newbury", "Haydock", "Sandown", "Chester", "Epsom", "Lingfield", "Curragh", "Leopardstown", "Galway"]) {
    const courseGroups = groups.filter((group) => group.course === course);
    lines.push(`${label}_${course}_groups=${courseGroups.length} races=${sum(courseGroups.map((group) => group.times.length))} largest=${courseGroups.sort((a, b) => b.times.length - a.times.length).slice(0, 5).map(formatGroup).join(" ; ") || "none"}`);
  }
  return lines;
}

function sameDayThresholdLines(races: RaceRow[]): string[] {
  return SAME_DAY_THRESHOLDS.map((threshold) => {
    const eligible = races.filter((race) => {
      const value = sameDayForRace({ race, races, calibrationRaces: races, leaveOneOut: true });
      return value.adjustmentPerF !== null && value.stdevPerF !== null && value.peerCount >= threshold.minPeers && value.stdevPerF <= threshold.maxStdevPerF;
    });
    return `threshold peers>=${threshold.minPeers} stdev_per_f<=${threshold.maxStdevPerF}: eligible_races=${eligible.length}/${races.length}`;
  });
}

export function goingBand(going: string | null | undefined): string | null {
  const text = (going ?? "").trim().toLowerCase();
  if (!text) {
    return null;
  }
  if (text.startsWith("firm")) {
    return "Firm";
  }
  if (text.startsWith("good to firm")) {
    return "Good to Firm";
  }
  if (text.startsWith("good to soft")) {
    return "Good to Soft";
  }
  if (text.startsWith("good")) {
    return "Good";
  }
  if (text.startsWith("soft")) {
    return "Soft";
  }
  if (text.startsWith("heavy")) {
    return "Heavy";
  }
  if (text.startsWith("yielding to soft")) {
    return "Good to Soft";
  }
  if (text.startsWith("yielding")) {
    return "Good";
  }
  return null;
}

function goingDistributionLines(races: RaceRow[]): string[] {
  const counts = countMap(races.map((race) => race.going || "<blank>"));
  const bands = countMap(races.map((race) => goingBand(race.going) ?? "unmapped"));
  const mappings = [...counts.keys()].sort().map((going) => `${going}=>${goingBand(going) ?? "unmapped"}`);
  return [
    `observed_turf_going_values=${countsMapLine(counts)}`,
    `going_band_counts=${countsMapLine(bands)}`,
    `going_mapping=${mappings.join("; ")}`,
  ];
}

function trimmedMean(values: number[], trimFraction: number): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const trim = Math.floor(sorted.length * trimFraction);
  const trimmed = sorted.slice(trim, sorted.length - trim);
  return mean(trimmed.length ? trimmed : sorted);
}

function candidateSummaryLines(figures: Figure[], label: string): string[] {
  const lines: string[] = [];
  for (const scale of SCALES) {
    for (const variantMode of VARIANT_MODES) {
      const rows = figures.filter((figure) => figure.scale === scale && figure.variantMode === variantMode);
      if (rows.length === 0) {
        continue;
      }
      lines.push(`${label}_${scale}_${variantMode}: ${summaryLine(rows)}`);
    }
  }
  return lines;
}

function summaryLine(rows: Figure[]): string {
  const values = rows.map((row) => row.rating);
  const orRows = rows.filter((row) => row.runner.official_rating !== null);
  const absOr = orRows.map((row) => Math.abs(row.rating - (row.runner.official_rating ?? 0)));
  const deadHeats = deadHeatCheck(rows);
  return [
    `eligible_runners=${rows.length}`,
    `mean=${fmt(mean(values))}`,
    `median=${fmt(median(values))}`,
    `p10=${fmt(percentile(values, 0.1))}`,
    `p90=${fmt(percentile(values, 0.9))}`,
    `min=${fmt(Math.min(...values))}`,
    `max=${fmt(Math.max(...values))}`,
    `outside_0_200=${values.filter((value) => value < 0 || value > 200).length}`,
    `extreme_rate=${fmt(values.filter((value) => value < 0 || value > 200).length / values.length)}`,
    `median_abs_or_diff=${fmt(median(absOr))}`,
    `mean_abs_or_diff=${fmt(mean(absOr))}`,
    `or_correlation=${fmt(correlation(orRows.map((row) => row.rating), orRows.map((row) => row.runner.official_rating ?? 0)))}`,
    `ordering_anomalies=${orderingAnomalies(rows)}`,
    `dead_heats_examined=${deadHeats.examined}`,
    `dead_heat_mismatches=${deadHeats.mismatches}`,
    `dead_heat_tolerance=${DEAD_HEAT_TOLERANCE}`,
  ].join(" ");
}

function segmentLines(figures: Figure[], kind: "surface" | "course" | "distance"): string[] {
  const rows = figures.filter((figure) => figure.scale === "current_length" && figure.variantMode === "hierarchical");
  const key = (figure: Figure) => kind === "surface" ? figure.race.surface : kind === "course" ? figure.race.course : distanceBand(figure.race.distance_yards);
  return [`segmentation=${kind}`, ...[...groupBy(rows, key).entries()].sort((a, b) => b[1].length - a[1].length).map(([name, values]) => `${name}: ${summaryLine(values)}`)];
}

function beatenDistanceLines(figures: Figure[]): string[] {
  const rows = figures.filter((figure) => figure.scale === "current_length" && figure.variantMode === "hierarchical");
  const bins = [">75", ">50-75", ">30-50", ">20-30", ">10-20", ">5-10", "0-5"];
  return bins.reverse().map((bin) => {
    const values = rows.filter((row) => beatenBin(row.cumulativeBeatenLengths) === bin);
    return `${bin}: runners=${values.length} ${values.length ? summaryLine(values) : ""}`;
  });
}

function preferredRows(figures: Figure[]): Figure[] {
  return figures.filter((figure) => figure.scale === "sec_per_f" && figure.variantMode === "hierarchical");
}

function tailExampleLines(figures: Figure[], label: string): string[] {
  const rows = preferredRows(figures);
  const formatTail = (prefix: string, values: Figure[]) =>
    values.map((figure, index) => [
      `${label}_${prefix}_${index + 1}`,
      `rating=${fmt(figure.rating)}`,
      `date=${figure.race.race_date}`,
      `course=${figure.race.course}`,
      `distance=${figure.race.distance}`,
      `going=${figure.race.going}`,
      `horse=${figure.runner.horse}`,
      `pos=${figure.runner.finish_position ?? "-"}`,
      `winning_time=${fmt(figure.race.actual)}`,
      `standard=${fmt(figure.standard)}`,
      `daily_sec_per_f=${fmt(figure.sameDayAdjustmentPerF)}`,
      `equivalent_time=${fmt(figure.equivalentTime)}`,
      `standard_sample=${figure.standardSample}`,
      `same_day_peers=${figure.sameDayPeerCount}`,
      `cause=${tailCause(figure)}`,
    ].join(" "));
  return [
    `${label}_preferred_tail_method=sec_per_f_hierarchical`,
    ...formatTail("top", [...rows].sort((a, b) => b.rating - a.rating).slice(0, 50)),
    ...formatTail("bottom", [...rows].sort((a, b) => a.rating - b.rating).slice(0, 50)),
  ];
}

function tailCause(figure: Figure): string {
  if (figure.standardSample < 5) {
    return "weak_standard_sample";
  }
  if (figure.sameDayPeerCount > 0 && figure.sameDayPeerCount < PREFERRED_THRESHOLD.minPeers) {
    return "weak_same_day_sample";
  }
  if (figure.cumulativeBeatenLengths > 75) {
    return "large_beaten_distance_gt_75";
  }
  const band = goingBand(figure.race.going);
  if (band === "Soft" || band === "Heavy") {
    return "slow_going_context";
  }
  if (band === "Firm" || band === "Good to Firm") {
    return "fast_ground_context";
  }
  return "no_obvious_single_cause";
}

function sameRawTimeSanityLines(figures: Figure[]): string[] {
  const rows = preferredRows(figures);
  const byCourseDistanceTime = groupBy(
    rows,
    (row) => `${row.race.course}|${row.race.distance_yards ?? "unknown"}|${fmt(row.race.actual)}`,
  );
  const examples: string[] = [];
  for (const group of byCourseDistanceTime.values()) {
    const winnerRows = group.filter((row) => row.runner.finish_position === 1);
    const bands = new Set(winnerRows.map((row) => goingBand(row.race.going) ?? row.race.going));
    if (winnerRows.length < 2 || bands.size < 2) {
      continue;
    }
    const sorted = winnerRows.sort((a, b) => a.rating - b.rating);
    const low = sorted[0];
    const high = sorted[sorted.length - 1];
    examples.push([
      `same_raw_time_example_${examples.length + 1}`,
      `course=${low.race.course}`,
      `distance=${low.race.distance}`,
      `raw_time=${fmt(low.race.actual)}`,
      `lower_rating=${fmt(low.rating)} going=${low.race.going} date=${low.race.race_date}`,
      `higher_rating=${fmt(high.rating)} going=${high.race.going} date=${high.race.race_date}`,
      `behavior=${(goingBand(high.race.going) === "Soft" || goingBand(high.race.going) === "Heavy") ? "slower_going_gets_higher_adjusted_rating" : "mixed_or_no_clear_slower_going_order"}`,
    ].join(" "));
    if (examples.length >= 12) {
      break;
    }
  }
  return examples.length ? examples : ["same_raw_time_examples=none_found_at_exact_same_time_precision"];
}

function holdoutComparisonLines(figures2025: Figure[], figures2026: Figure[]): string[] {
  const base2025 = figures2025.filter((figure) => figure.scale === "current_length" && figure.variantMode === "hierarchical");
  const base2026 = figures2026.filter((figure) => figure.scale === "current_length" && figure.variantMode === "hierarchical");
  return [
    "holdout_preferred_comparison=",
    `2025 ${summaryLine(base2025)}`,
    `2026 ${summaryLine(base2026)}`,
  ];
}

function sameDayValueLines(figures2025: Figure[], figures2026: Figure[]): string[] {
  const lines = [];
  for (const [label, figures] of [["2025", figures2025], ["2026", figures2026]] as const) {
    for (const scale of ["current_length", "sec_per_f"] as const) {
      for (const mode of VARIANT_MODES) {
        const rows = figures.filter((figure) => figure.scale === scale && figure.variantMode === mode);
        lines.push(`${label}_${scale}_${mode}: ${summaryLine(rows)}`);
      }
    }
  }
  lines.push("same_day_verdict=hierarchical same-day is preferable to same-day-only because it preserves coverage; same-day-only has cleaner eligibility but much smaller sample.");
  return lines;
}

function summaryCsv(figures: Figure[]): string {
  const header = ["range", "scale", "variant_mode", "eligible_runners", "median", "p10", "p90", "outside_0_200", "median_abs_or_diff", "or_correlation"];
  const rows = [];
  for (const range of [...new Set(figures.map((figure) => figure.range))]) {
    for (const scale of SCALES) {
      for (const mode of VARIANT_MODES) {
        const values = figures.filter((figure) => figure.range === range && figure.scale === scale && figure.variantMode === mode);
        if (values.length === 0) {
          continue;
        }
        const orRows = values.filter((figure) => figure.runner.official_rating !== null);
        rows.push([range, scale, mode, values.length, fmt(median(values.map((figure) => figure.rating))), fmt(percentile(values.map((figure) => figure.rating), 0.1)), fmt(percentile(values.map((figure) => figure.rating), 0.9)), values.filter((figure) => figure.rating < 0 || figure.rating > 200).length, fmt(median(orRows.map((figure) => Math.abs(figure.rating - (figure.runner.official_rating ?? 0))))), fmt(correlation(orRows.map((figure) => figure.rating), orRows.map((figure) => figure.runner.official_rating ?? 0)))].join(","));
      }
    }
  }
  return `${header.join(",")}\n${rows.join("\n")}\n`;
}

function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === "\"" && inQuotes && next === "\"") {
      field += "\"";
      i += 1;
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
  return body.filter((values) => values.length === header.length).map((values) => Object.fromEntries(header.map((name, index) => [name, values[index] ?? ""])));
}

function numberOrNull(value: string | undefined): number | null {
  if (value === undefined || value === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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

function sampleBin(sample: number): string {
  if (sample === 1) return "1";
  if (sample <= 4) return "2-4";
  if (sample <= 9) return "5-9";
  if (sample <= 19) return "10-19";
  if (sample <= 39) return "20-39";
  if (sample <= 79) return "40-79";
  return "80+";
}

function formatGroup(group: { course: string; distance: string; distanceYards: number | null; surface: string; times: number[]; goings?: string[] }): string {
  const goingMix = group.goings ? ` going=${countsLine(group.goings)}` : "";
  return `${group.course} ${group.distance} ${group.distanceYards ?? "-"}y ${group.surface} n=${group.times.length} median=${fmt(median(group.times))} mean=${fmt(mean(group.times))} sd=${fmt(standardDeviation(group.times))} p10=${fmt(percentile(group.times, 0.1))} p90=${fmt(percentile(group.times, 0.9))}${goingMix}`;
}

function distanceBand(yards: number | null): string {
  if (yards === null) return "unknown";
  if (yards <= 1320) return "sprint";
  if (yards <= 1760) return "mile";
  if (yards <= 2640) return "middle";
  return "staying";
}

function beatenBin(lengths: number): string {
  if (lengths <= 5) return "0-5";
  if (lengths <= 10) return ">5-10";
  if (lengths <= 20) return ">10-20";
  if (lengths <= 30) return ">20-30";
  if (lengths <= 50) return ">30-50";
  if (lengths <= 75) return ">50-75";
  return ">75";
}

function orderingAnomalies(rows: Figure[]): number {
  let count = 0;
  for (const raceRows of groupBy(rows, (row) => row.race.race_source_id).values()) {
    const sorted = raceRows.sort((a, b) => (a.runner.finish_position ?? 0) - (b.runner.finish_position ?? 0));
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i]!.rating > sorted[i - 1]!.rating + 0.000001) {
        count += 1;
      }
    }
  }
  return count;
}

export function deadHeatCheck(rows: Figure[]): { examined: number; mismatches: number } {
  let examined = 0;
  let mismatches = 0;
  for (const raceRows of groupBy(rows, (row) => row.race.race_source_id).values()) {
    for (const positionRows of groupBy(
      raceRows.filter((row) => row.runner.finish_position !== null),
      (row) => String(row.runner.finish_position),
    ).values()) {
      if (positionRows.length < 2) {
        continue;
      }
      for (let index = 1; index < positionRows.length; index += 1) {
        examined += 1;
        const current = positionRows[index]!;
        const previous = positionRows[0]!;
        if (
          Math.abs(current.equivalentTime - previous.equivalentTime) > DEAD_HEAT_TOLERANCE ||
          Math.abs(current.rating - previous.rating) > DEAD_HEAT_TOLERANCE
        ) {
          mismatches += 1;
        }
      }
    }
  }
  return { examined, mismatches };
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

function countsLine(values: string[]): string {
  return [...groupBy(values, (value) => value).entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])).map(([key, rows]) => `${key}:${rows.length}`).join(", ");
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

function mergeCounts(...maps: Map<string, number>[]): Map<string, number> {
  const merged = new Map<string, number>();
  for (const map of maps) {
    for (const [key, count] of map.entries()) {
      merged.set(key, (merged.get(key) ?? 0) + count);
    }
  }
  return merged;
}

function fmt(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value) ? "-" : value.toFixed(3);
}

function fmtPct(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value) ? "-" : `${(value * 100).toFixed(1)}%`;
}

function deadHeatLine(figures: Figure[], scale: Scale, variantMode: VariantMode): string {
  const result = deadHeatCheck(
    figures.filter((figure) => figure.scale === scale && figure.variantMode === variantMode),
  );
  return `examined=${result.examined} mismatches=${result.mismatches} tolerance=${DEAD_HEAT_TOLERANCE}`;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

if (process.argv[1]?.endsWith("analyze-flat-turf-speed-rating-research.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
