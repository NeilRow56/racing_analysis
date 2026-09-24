import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { createDbConnection } from "@/db";
import {
  courses,
  horses,
  jockeys,
  raceRunners,
  races,
  sourceImports,
  trainers,
} from "@/db/schema";
import {
  getTargetRunnerMetricsForDate,
  type HorseMetricsAsOf,
} from "./horse-metrics";
import {
  classifyCurrentRaceFamily,
  isCurrentAllWeatherRace,
  isCurrentOrdinaryFlatTurfRace,
} from "./current-race-classification";
import {
  getGoingFormForTargets,
  type GoingForm,
} from "./going-form";
import {
  getJockeyPriorMetricsForTargets,
  getTrainerPriorMetricsForTargets,
  type JockeyPriorMetrics,
  type TrainerPriorMetrics,
} from "./trainer-quality";
import {
  buildCanonicalTurfPerformanceRatingInput,
  calculateTurfPerformanceRating,
  rankTurfPerformanceRatings,
  type RankedTurfPerformanceRating,
  type CanonicalTurfPerformanceRatingInput,
  TURF_PERFORMANCE_RATING_W50_WEIGHT_MULTIPLIER,
} from "./turf-performance-rating";

type Db = ReturnType<typeof createDbConnection>["db"];

const SPORTING_LIFE_SOURCE = "sporting_life";
const RACECARD_INDEX_SOURCE_TYPE = "racecard-index-next-data";
const RACECARD_SOURCE_TYPE = "racecard-next-data";
const FULL_RESULT_SOURCE_TYPE = "full-result-next-data";
export const TODAY_RACE_SOURCE_TYPES = [
  RACECARD_SOURCE_TYPE,
  FULL_RESULT_SOURCE_TYPE,
] as const;
const DEFAULT_RACING_DISPLAY_TIME_ZONE = "Europe/London";

export type TodayRunner = {
  runnerId: string;
  runnerSourceId: string | null;
  horseId: string;
  horseName: string;
  saddleclothNumber: number | null;
  horseAge: number | null;
  horseSex: string | null;
  weight: string | null;
  weightCarriedLbs: number | null;
  draw: number | null;
  jockeyId?: string | null;
  jockeyName: string | null;
  trainerId: string | null;
  trainerName: string | null;
  officialRating: number | null;
  odds: string | null;
  oddsDecimal: string | null;
  resultStatus: string | null;
  finishingPosition: number | null;
  metrics: HorseMetricsAsOf | null;
  turfPerformanceRating?: RankedTurfPerformanceRating;
  turfPerformanceShadowRating?: RankedTurfPerformanceRating;
  turfPerformanceInput?: CanonicalTurfPerformanceRatingInput;
  trainerMetrics?: TrainerPriorMetrics;
  jockeyMetrics?: JockeyPriorMetrics;
  savedRuleMatches?: TodaySavedRuleMatch[];
  goingForm?: GoingForm;
};

export type TodaySavedRuleMatch = {
  ruleId: string;
  ruleName: string;
  development: {
    selections: number;
    winners: number;
    strikeRate: number | null;
    roiPercentage: number | null;
    profitLoss: number;
    maxConsecutiveLosers: number;
  };
};

export type TodayRace = {
  raceId: string;
  sourceId: string | null;
  scheduledTime: string | null;
  raceDateTime: Date | null;
  courseCountry: string | null;
  raceName: string | null;
  raceClass: string | null;
  raceType: string | null;
  raceTypeCode: string | null;
  distance: string | null;
  distanceYards: number | null;
  going: string | null;
  surface: string | null;
  declaredRunnerCount: number | null;
  actualRunnerCount: number | null;
  winningTime: string | null;
  turfPerformanceShadow?: TodayTurfPerformanceShadow;
  runners: TodayRunner[];
};

export type TodayTurfPerformanceShadow = {
  checked: boolean;
  agreement: boolean | null;
  w100RunnerId: string | null;
  w100HorseName: string | null;
  w50RunnerId: string | null;
  w50HorseName: string | null;
};

export type TodayMeeting = {
  courseId: string;
  courseSourceId: string | null;
  courseName: string;
  country: string | null;
  order: number;
  races: TodayRace[];
};

export type TodaysRacingData =
  | {
      status: "ok";
      raceDate: string;
      displayDate: string;
      refreshedAt: Date | null;
      meetings: TodayMeeting[];
    }
  | {
      status: "empty";
      raceDate: string;
      displayDate: string;
      refreshedAt: Date | null;
      message: string;
    };

type RacecardIndexPayload = {
  props?: {
    pageProps?: {
      meetings?: unknown[];
    };
  };
};

export type TodayRacecardRow = {
  raceId: string;
  raceSourceId: string | null;
  raceDate: string;
  raceDateTime: Date | null;
  scheduledTime: string | null;
  raceName: string | null;
  raceClass: string | null;
  raceType: string | null;
  raceTypeCode: string | null;
  distance: string | null;
  distanceYards: number | null;
  going: string | null;
  surface: string | null;
  declaredRunnerCount: number | null;
  actualRunnerCount: number | null;
  winningTime: string | null;
  courseId: string;
  courseSourceId: string | null;
  courseName: string;
  country: string | null;
  runnerId: string;
  runnerSourceId: string | null;
  horseId: string;
  horseName: string;
  saddleclothNumber: number | null;
  horseAge: number | null;
  horseSex: string | null;
  weight: string | null;
  weightCarriedLbs: number | null;
  draw: number | null;
  jockeyId?: string | null;
  jockeyName: string | null;
  trainerId: string | null;
  trainerName: string | null;
  officialRating: number | null;
  odds: string | null;
  oddsDecimal: string | null;
  resultStatus: string | null;
  finishingPosition: number | null;
};

export function getLocalRacingDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function isValidRacingDate(value: string | undefined): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function resolveRacingDate(input: {
  dateParam?: string;
  now?: Date;
} = {}): {
  raceDate: string;
  dateOverride: boolean;
  invalidDateParam: string | null;
} {
  if (isValidRacingDate(input.dateParam)) {
    return {
      raceDate: input.dateParam,
      dateOverride: true,
      invalidDateParam: null,
    };
  }

  return {
    raceDate: getLocalRacingDate(input.now),
    dateOverride: false,
    invalidDateParam: input.dateParam ?? null,
  };
}

export function racingPageTitle(input: {
  raceDate: string;
  now?: Date;
}): string {
  return input.raceDate === getLocalRacingDate(input.now)
    ? "Today's Racing"
    : "Racing";
}

export function formatRacingDate(raceDate: string): string {
  const [year, month, day] = raceDate.split("-").map(Number);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).formatToParts(new Date(Date.UTC(year, month - 1, day, 12)));
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("weekday")} ${value("day")} ${value("month")} ${value("year")}`;
}

export function formatRaceTimeForDisplay(input: {
  raceDateTime: Date | null;
  scheduledTime: string | null;
  courseCountry?: string | null;
}): string {
  if (!input.raceDateTime) return input.scheduledTime?.slice(0, 5) ?? "--:--";

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: raceDisplayTimeZone(input.courseCountry),
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(input.raceDateTime);
}

function raceDisplayTimeZone(country: string | null | undefined): string {
  const normalized = country?.trim().toLowerCase();
  if (
    normalized === "eire" ||
    normalized === "ire" ||
    normalized === "ireland"
  ) {
    return "Europe/Dublin";
  }
  return DEFAULT_RACING_DISPLAY_TIME_ZONE;
}

export async function getTodaysRacingData(
  db: Db,
  raceDate = getLocalRacingDate(),
  options: {
    raceFilter?: (race: TodayRace) => boolean;
    onTiming?: (name: string, elapsedMs: number) => void;
  } = {},
): Promise<TodaysRacingData> {
  const measure = <T>(name: string, operation: () => Promise<T>) =>
    measureTodayLoad(name, operation, options.onTiming);
  const [indexImport, rows, freshnessRows] = await Promise.all([
    measure("today_index_load", () => getLatestRacecardIndexImport(db, raceDate)),
    measure("today_racecard_rows_load", () => getRacecardRows(db, raceDate)),
    measure("today_freshness_load", () => getFreshnessRows(db, raceDate)),
  ]);
  const displayDate = formatRacingDate(raceDate);
  const refreshedAt = latestDate(freshnessRows.map((row) => row.fetchedAt));

  if (rows.length === 0) {
    return {
      status: "empty",
      raceDate,
      displayDate,
      refreshedAt,
      message: "No racecard data has been imported for today.",
    };
  }

  const meetingOrder = meetingOrderFromIndexPayload(indexImport?.payload);
  const targetRows = measureSync(
    "today_race_filter",
    () => options.raceFilter
      ? filterRacecardRows(rows, meetingOrder, options.raceFilter)
      : rows,
    options.onTiming,
  );
  const metricRows = await measure("today_target_metrics_load", () => getTargetRunnerMetricsForDate(db, raceDate, SPORTING_LIFE_SOURCE, {
    includeNonRunnerTargets: true,
    completedPriorRunsOnly: true,
    targetRunnerIds: options.raceFilter ? targetRows.map((row) => row.runnerId) : undefined,
  }));
  const metricsByRunnerId = new Map(
    metricRows.map((row) => [row.target.runnerId, row.metrics]),
  );
  const targetsWithRaceDateTime = targetRows
    .filter((row): row is TodayRacecardRow & { raceDateTime: Date } => row.raceDateTime !== null);
  const goingFormTargets = targetsWithRaceDateTime.map((row) => ({
    targetRunnerId: row.runnerId,
    targetRaceId: row.raceId,
    horseId: row.horseId,
    raceDateTime: row.raceDateTime,
    raceFamily: classifyCurrentRaceFamily({
      raceName: row.raceName,
      raceType: row.raceType,
      raceTypeCode: row.raceTypeCode,
      courseName: row.courseName,
      courseSourceId: row.courseSourceId,
      going: row.going,
      surface: row.surface,
    }),
  }));
  const [trainerMetricsByRunnerId, jockeyMetricsByRunnerId, goingFormByRunnerId] = await Promise.all([
    measure("today_trainer_metrics_load", () => getTrainerPriorMetricsForTargets(
      db,
      targetsWithRaceDateTime.map((row) => ({
        targetRunnerId: row.runnerId,
        trainerId: row.trainerId,
        raceDateTime: row.raceDateTime,
      })),
      SPORTING_LIFE_SOURCE,
    )),
    measure("today_jockey_metrics_load", () => getJockeyPriorMetricsForTargets(
      db,
      targetsWithRaceDateTime.map((row) => ({
        targetRunnerId: row.runnerId,
        jockeyId: row.jockeyId,
        raceDateTime: row.raceDateTime,
      })),
      SPORTING_LIFE_SOURCE,
    )),
    measure("today_going_form_load", () => getGoingFormForTargets(
      db,
      goingFormTargets,
      SPORTING_LIFE_SOURCE,
    )),
  ]);

  return {
    status: "ok",
    raceDate,
    displayDate,
    refreshedAt,
    meetings: groupTodaysRacingRows(
      targetRows,
      meetingOrder,
      metricsByRunnerId,
      trainerMetricsByRunnerId,
      jockeyMetricsByRunnerId,
      goingFormByRunnerId,
    ),
  };
}

function filterRacecardRows(
  rows: TodayRacecardRow[],
  meetingOrder: Map<string, number>,
  raceFilter: (race: TodayRace) => boolean,
) {
  const meetings = groupTodaysRacingRows(rows, meetingOrder);
  const raceIds = new Set(
    meetings.flatMap((meeting) => meeting.races)
      .filter(raceFilter)
      .map((race) => race.raceId),
  );
  return rows.filter((row) => raceIds.has(row.raceId));
}

async function measureTodayLoad<T>(
  name: string,
  operation: () => Promise<T>,
  onTiming: ((name: string, elapsedMs: number) => void) | undefined,
) {
  const startedAt = performance.now();
  const result = await operation();
  onTiming?.(name, performance.now() - startedAt);
  return result;
}

function measureSync<T>(
  name: string,
  operation: () => T,
  onTiming: ((name: string, elapsedMs: number) => void) | undefined,
) {
  const startedAt = performance.now();
  const result = operation();
  onTiming?.(name, performance.now() - startedAt);
  return result;
}

export function groupTodaysRacingRows(
  rows: TodayRacecardRow[],
  meetingOrder: Map<string, number> = new Map(),
  metricsByRunnerId: Map<string, HorseMetricsAsOf> = new Map(),
  trainerMetricsByRunnerId: Map<string, TrainerPriorMetrics> = new Map(),
  jockeyMetricsByRunnerId: Map<string, JockeyPriorMetrics> = new Map(),
  goingFormByRunnerId: Map<string, GoingForm> = new Map(),
): TodayMeeting[] {
  const meetingsByCourseId = new Map<string, TodayMeeting>();
  const racesById = new Map<string, TodayRace>();

  for (const row of rows) {
    const order = meetingOrder.get(row.courseSourceId ?? "") ?? 10_000;
    let meeting = meetingsByCourseId.get(row.courseId);
    if (!meeting) {
      meeting = {
        courseId: row.courseId,
        courseSourceId: row.courseSourceId,
        courseName: row.courseName,
        country: row.country,
        order,
        races: [],
      };
      meetingsByCourseId.set(row.courseId, meeting);
    }

    let race = racesById.get(row.raceId);
    if (!race) {
      race = {
        raceId: row.raceId,
        sourceId: row.raceSourceId,
        scheduledTime: row.scheduledTime,
        raceDateTime: row.raceDateTime,
        courseCountry: row.country,
        raceName: row.raceName,
        raceClass: row.raceClass,
        raceType: row.raceType,
        raceTypeCode: row.raceTypeCode,
        distance: row.distance,
        distanceYards: row.distanceYards,
        going: row.going,
        surface: row.surface,
        declaredRunnerCount: row.declaredRunnerCount,
        actualRunnerCount: row.actualRunnerCount,
        winningTime: row.winningTime,
        runners: [],
      };
      racesById.set(row.raceId, race);
      meeting.races.push(race);
    }

    race.runners.push({
      runnerId: row.runnerId,
      runnerSourceId: row.runnerSourceId,
      horseId: row.horseId,
      horseName: row.horseName,
      saddleclothNumber: row.saddleclothNumber,
      horseAge: row.horseAge,
      horseSex: row.horseSex,
      weight: row.weight,
      weightCarriedLbs: row.weightCarriedLbs,
      draw: row.draw,
      jockeyId: row.jockeyId,
      jockeyName: row.jockeyName,
      trainerId: row.trainerId,
      trainerName: row.trainerName,
      officialRating: row.officialRating,
      odds: row.odds,
      oddsDecimal: row.oddsDecimal,
      resultStatus: row.resultStatus,
      finishingPosition: row.finishingPosition,
      metrics: metricsByRunnerId.get(row.runnerId) ?? null,
      trainerMetrics: trainerMetricsByRunnerId.get(row.runnerId),
      jockeyMetrics: jockeyMetricsByRunnerId.get(row.runnerId),
      goingForm: goingFormByRunnerId.get(row.runnerId),
    });
  }

  return [...meetingsByCourseId.values()]
    .map((meeting) => ({
      ...meeting,
      races: meeting.races
        .map((race) => {
          const raceWithTpr = attachTurfPerformanceRatings(race);
          return {
            ...raceWithTpr,
            runners: raceWithTpr.runners.sort(compareRunners),
          };
        })
        .sort(compareRaces),
    }))
    .sort(compareMeetings);
}

export function attachTurfPerformanceRatings(race: TodayRace): TodayRace {
  if (!isOrdinaryFlatTurfRaceForDisplay(race)) {
    return race;
  }

  const medianWeight = median(
    race.runners
      .filter((runner) => runner.resultStatus !== "non_runner")
      .map((runner) => runner.weightCarriedLbs)
      .filter(isNumber),
  );
  const canonicalInputs = new Map(race.runners.map((runner) => [
    runner.runnerId,
    runner.resultStatus === "non_runner" ? null : turfPerformanceInputForRunner({
      runner,
      raceClass: race.raceClass,
      medianWeight,
      weightCoefficientMultiplier: 1,
    }),
  ]));
  const productionInputs = race.runners.map((runner) => ({
    id: runner.runnerId,
    rating: canonicalInputs.get(runner.runnerId) === null
      ? null
      : calculateTurfPerformanceRating(canonicalInputs.get(runner.runnerId)!),
  }));
  const shadowInputs = race.runners.map((runner) => ({
    id: runner.runnerId,
    rating: runner.resultStatus === "non_runner" ? null : turfPerformanceRatingForRunner({
      runner,
      raceClass: race.raceClass,
      medianWeight,
      weightCoefficientMultiplier: TURF_PERFORMANCE_RATING_W50_WEIGHT_MULTIPLIER,
    }),
  }));
  const ratings = rankTurfPerformanceRatings(productionInputs);
  const shadowRatings = rankTurfPerformanceRatings(shadowInputs);
  const shadow = turfPerformanceShadowForRace(race.runners, ratings, shadowRatings);

  return {
    ...race,
    turfPerformanceShadow: shadow,
    runners: race.runners.map((runner) => ({
      ...runner,
      turfPerformanceRating: ratings.get(runner.runnerId),
      turfPerformanceShadowRating: shadowRatings.get(runner.runnerId),
      turfPerformanceInput: canonicalInputs.get(runner.runnerId) ?? undefined,
    })),
  };
}

function turfPerformanceInputForRunner(input: {
  runner: TodayRunner;
  raceClass: string | null;
  medianWeight: number | null;
  weightCoefficientMultiplier: number;
}): CanonicalTurfPerformanceRatingInput | null {
  const metrics = input.runner.metrics;
  if (metrics === null) {
    return null;
  }
  return buildCanonicalTurfPerformanceRatingInput({
    latestPerformanceRating: metrics.latestTurfPerformanceRating,
    previousPerformanceRating: metrics.previousTurfPerformanceRating,
    averagePerformanceLast3: metrics.averageTurfPerformanceLast3,
    latestSpeedRating: metrics.latestTurfSpeedRating,
    previousSpeedRating: metrics.previousTurfSpeedRating,
    averageSpeedLast3: metrics.averageTurfSpeedLast3,
    raceClass: input.raceClass,
    weightCarriedLbs: input.runner.weightCarriedLbs,
    raceMedianWeightCarriedLbs: input.medianWeight,
    weightCoefficientMultiplier: input.weightCoefficientMultiplier,
  });
}

function turfPerformanceRatingForRunner(input: Parameters<typeof turfPerformanceInputForRunner>[0]) {
  const canonical = turfPerformanceInputForRunner(input);
  return canonical === null ? null : calculateTurfPerformanceRating(canonical);
}

function turfPerformanceShadowForRace(
  runners: TodayRunner[],
  productionRatings: Map<string, RankedTurfPerformanceRating>,
  shadowRatings: Map<string, RankedTurfPerformanceRating>,
): TodayTurfPerformanceShadow {
  const productionTop = topRatedRunner(runners, productionRatings);
  const shadowTop = topRatedRunner(runners, shadowRatings);
  return {
    checked: productionRatings.size > 0 || shadowRatings.size > 0,
    agreement: productionTop === null || shadowTop === null
      ? null
      : productionTop.runner.runnerId === shadowTop.runner.runnerId,
    w100RunnerId: productionTop?.runner.runnerId ?? null,
    w100HorseName: productionTop?.runner.horseName ?? null,
    w50RunnerId: shadowTop?.runner.runnerId ?? null,
    w50HorseName: shadowTop?.runner.horseName ?? null,
  };
}

function topRatedRunner(
  runners: TodayRunner[],
  ratings: Map<string, RankedTurfPerformanceRating>,
) {
  const ranked = runners
    .map((runner) => ({ runner, rating: ratings.get(runner.runnerId) }))
    .filter((entry): entry is { runner: TodayRunner; rating: RankedTurfPerformanceRating } =>
      entry.rating !== undefined && entry.rating.rank === 1,
    )
    .sort((left, right) => left.runner.runnerId.localeCompare(right.runner.runnerId));
  return ranked[0] ?? null;
}

export function meetingOrderFromIndexPayload(
  payload: unknown,
): Map<string, number> {
  const meetings = (payload as RacecardIndexPayload | undefined)?.props
    ?.pageProps?.meetings;
  const order = new Map<string, number>();
  if (!Array.isArray(meetings)) {
    return order;
  }

  meetings.forEach((meeting, index) => {
    if (!isRecord(meeting)) {
      return;
    }
    const summary = meeting.meeting_summary;
    if (!isRecord(summary)) {
      return;
    }
    const course = summary.course;
    if (!isRecord(course)) {
      return;
    }
    const reference = course.course_reference;
    if (!isRecord(reference)) {
      return;
    }
    const id = reference.id;
    if (id !== null && id !== undefined) {
      order.set(String(id), index);
    }
  });

  return order;
}

export function isJumpRaceForDisplay(race: {
  raceName: string | null;
  raceType: string | null;
}): boolean {
  const text = `${race.raceName ?? ""} ${race.raceType ?? ""}`.toLowerCase();
  return (
    text.includes("hurdle") ||
    text.includes("chase") ||
    text.includes("national hunt") ||
    text.includes("nh flat") ||
    text.includes("bumper")
  );
}

export function isAllWeatherRaceForDisplay(race: {
  raceName: string | null;
  raceType: string | null;
  courseName?: string | null;
  courseSourceId?: string | null;
  going: string | null;
  surface?: string | null;
}): boolean {
  return isCurrentAllWeatherRace(race);
}

export function isOrdinaryFlatTurfRaceForDisplay(race: {
  raceName: string | null;
  raceType: string | null;
  raceTypeCode?: string | null;
  courseName?: string | null;
  courseSourceId?: string | null;
  going: string | null;
  surface?: string | null;
}): boolean {
  return isCurrentOrdinaryFlatTurfRace(race);
}

function compareMeetings(left: TodayMeeting, right: TodayMeeting): number {
  return (
    left.order - right.order ||
    firstRaceTime(left).localeCompare(firstRaceTime(right)) ||
    left.courseName.localeCompare(right.courseName)
  );
}

function compareRaces(left: TodayRace, right: TodayRace): number {
  return (
    (left.scheduledTime ?? "99:99").localeCompare(
      right.scheduledTime ?? "99:99",
    ) || (left.sourceId ?? "").localeCompare(right.sourceId ?? "")
  );
}

function compareRunners(left: TodayRunner, right: TodayRunner): number {
  const leftActive = left.resultStatus === "non_runner" ? 1 : 0;
  const rightActive = right.resultStatus === "non_runner" ? 1 : 0;
  const leftOdds = oddsSortValue(left);
  const rightOdds = oddsSortValue(right);

  return (
    leftActive - rightActive ||
    oddsMissingSortValue(leftOdds) - oddsMissingSortValue(rightOdds) ||
    (leftOdds ?? 0) - (rightOdds ?? 0) ||
    (left.saddleclothNumber ?? 10_000) - (right.saddleclothNumber ?? 10_000) ||
    (left.runnerSourceId ?? "").localeCompare(right.runnerSourceId ?? "")
  );
}

function oddsMissingSortValue(value: number | null): number {
  return value === null ? 1 : 0;
}

function oddsSortValue(runner: Pick<TodayRunner, "odds" | "oddsDecimal">): number | null {
  const decimalOdds = parseDecimalOdds(runner.oddsDecimal);
  if (decimalOdds !== null) {
    return decimalOdds;
  }

  return parseFractionalOdds(runner.odds);
}

function parseDecimalOdds(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseFractionalOdds(value: string | null): number | null {
  const match = value?.trim().match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
  if (!match) {
    return null;
  }

  const numerator = Number(match[1]);
  const denominator = Number(match[2]);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return null;
  }

  return numerator / denominator + 1;
}

function firstRaceTime(meeting: TodayMeeting): string {
  return meeting.races[0]?.scheduledTime ?? "99:99";
}

async function getLatestRacecardIndexImport(db: Db, raceDate: string) {
  const rows = await db
    .select({
      payload: sourceImports.payload,
    })
    .from(sourceImports)
    .where(
      and(
        eq(sourceImports.source, SPORTING_LIFE_SOURCE),
        eq(sourceImports.sourceType, RACECARD_INDEX_SOURCE_TYPE),
        eq(sourceImports.sourceId, raceDate),
      ),
    )
    .orderBy(desc(sourceImports.fetchedAt))
    .limit(1);
  return rows[0] ?? null;
}

async function getRacecardRows(
  db: Db,
  raceDate: string,
): Promise<TodayRacecardRow[]> {
  return db
    .select({
      raceId: races.id,
      raceSourceId: races.sourceId,
      raceDate: races.raceDate,
      raceDateTime: sql<Date | null>`
        case
          when races.scheduled_time is null then races.race_datetime
          else ((races.race_date + races.scheduled_time) at time zone 'UTC')
        end
      `.mapWith(races.raceDatetime),
      scheduledTime: races.scheduledTime,
      raceName: races.raceName,
      raceClass: races.raceClass,
      raceType: races.raceType,
      raceTypeCode: races.raceTypeCode,
      distance: races.distance,
      distanceYards: races.distanceYards,
      going: races.going,
      surface: sql<string | null>`(
        select ${sourceImports.payload} #>> '{props,pageProps,race,race_summary,course_surface,surface}'
        from ${sourceImports}
        where ${sourceImports.source} = ${SPORTING_LIFE_SOURCE}
          and ${sourceImports.sourceType} in (${sql.join(
            TODAY_RACE_SOURCE_TYPES.map((sourceType) => sql`${sourceType}`),
            sql`, `,
          )})
          and ${sourceImports.sourceId} = ${races.sourceId}
        order by case
          when ${sourceImports.sourceType} = ${RACECARD_SOURCE_TYPE} then 0
          else 1
        end
        limit 1
      )`,
      declaredRunnerCount: races.declaredRunnerCount,
      actualRunnerCount: races.actualRunnerCount,
      winningTime: races.winningTime,
      courseId: courses.id,
      courseSourceId: courses.sourceId,
      courseName: courses.displayName,
      country: courses.country,
      runnerId: raceRunners.id,
      runnerSourceId: raceRunners.sourceId,
      horseId: horses.id,
      horseName: horses.displayName,
      saddleclothNumber: raceRunners.saddleclothNumber,
      horseAge: raceRunners.horseAge,
      horseSex: raceRunners.horseSex,
      weight: raceRunners.weight,
      weightCarriedLbs: raceRunners.weightCarriedLbs,
      draw: raceRunners.draw,
      jockeyId: jockeys.id,
      jockeyName: jockeys.displayName,
      trainerId: trainers.id,
      trainerName: trainers.displayName,
      officialRating: raceRunners.officialRating,
      odds: raceRunners.startingPrice,
      oddsDecimal: raceRunners.startingPriceDecimal,
      resultStatus: raceRunners.resultStatus,
      finishingPosition: raceRunners.finishingPosition,
    })
    .from(races)
    .innerJoin(courses, eq(races.courseId, courses.id))
    .innerJoin(raceRunners, eq(raceRunners.raceId, races.id))
    .innerJoin(horses, eq(raceRunners.horseId, horses.id))
    .leftJoin(jockeys, eq(raceRunners.jockeyId, jockeys.id))
    .leftJoin(trainers, eq(raceRunners.trainerId, trainers.id))
    .where(
      and(
        eq(races.source, SPORTING_LIFE_SOURCE),
        eq(raceRunners.source, SPORTING_LIFE_SOURCE),
        eq(races.raceDate, raceDate),
        sql`exists (
          select 1
          from ${sourceImports}
          where ${sourceImports.source} = ${SPORTING_LIFE_SOURCE}
            and ${sourceImports.sourceType} in (${sql.join(
              TODAY_RACE_SOURCE_TYPES.map((sourceType) => sql`${sourceType}`),
              sql`, `,
            )})
            and ${sourceImports.sourceId} = ${races.sourceId}
        )`,
      ),
    )
    .orderBy(
      asc(courses.displayName),
      asc(races.scheduledTime),
      asc(races.sourceId),
      asc(raceRunners.saddleclothNumber),
      asc(raceRunners.sourceId),
    );
}

async function getFreshnessRows(db: Db, raceDate: string) {
  const raceSourceRows = await db
    .select({
      sourceId: races.sourceId,
    })
    .from(races)
    .where(
      and(
        eq(races.source, SPORTING_LIFE_SOURCE),
        eq(races.raceDate, raceDate),
      ),
    );
  const sourceIds = raceSourceRows
    .map((row) => row.sourceId)
    .filter((sourceId): sourceId is string => sourceId !== null);

  const sourceImportIds = [raceDate, ...sourceIds];
  if (sourceImportIds.length === 0) {
    return [];
  }

  return db
    .select({
      fetchedAt: sourceImports.fetchedAt,
    })
    .from(sourceImports)
    .where(
      and(
        eq(sourceImports.source, SPORTING_LIFE_SOURCE),
        inArray(sourceImports.sourceType, [
          RACECARD_INDEX_SOURCE_TYPE,
          RACECARD_SOURCE_TYPE,
        ]),
        inArray(sourceImports.sourceId, sourceImportIds),
      ),
    );
}

function latestDate(values: Date[]): Date | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((latest, value) => (value > latest ? value : latest));
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function isNumber(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
