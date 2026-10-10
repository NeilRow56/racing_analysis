import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { TprConfidenceContext } from "./tpr-confidence-context";
import { createDbConnection } from "@/db";
import { withoutStaleBookmakerQuotes } from "./current-day-sync";
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
  attachJumpRaceRatings,
  type JumpRatingRunner,
} from "./jump-performance-rating";
import {
  attachAwRaceRatings,
  type AwRatingCoverage,
  type AwRatingRunner,
} from "./aw-performance-rating";
import {
  buildCanonicalTurfPerformanceRatingInput,
  calculateTurfPerformanceRating,
  rankTurfPerformanceRatings,
  type RankedTurfPerformanceRating,
  type CanonicalTurfPerformanceRatingInput,
  TURF_PERFORMANCE_RATING_W50_WEIGHT_MULTIPLIER,
} from "./turf-performance-rating";
import {
  calculateRatingCoverage,
  TPR_RATING_COVERAGE_GUARD_IMPLEMENTED_AT,
  TPR_RATING_COVERAGE_GUARD_VERSION,
  type RatingCoverage,
} from "./rating-coverage";

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
export const SPORTING_LIFE_CURRENT_CARD_VERSION = "reconciled_v1" as const;

export type TodayRunner = {
  tprConfidence?: TprConfidenceContext;
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
  forecastOdds?: string | null;
  forecastDecimalOdds?: number | null;
  bookmakerQuotes?: SportingLifeBookmakerQuote[];
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
  jumpRating?: JumpRatingRunner;
  jumpTissue?: import("./jump-tissue-model").JumpTissuePrediction;
  awRating?: AwRatingRunner;
  awTissue?: import("./aw-tissue-model").AwTissuePrediction;
};

export type SportingLifeBookmakerQuote = {
  bookmakerId: number | null;
  bookmakerName: string | null;
  fractionalOdds: string | null;
  decimalOdds: number;
};

export type TodayMarketPrice = {
  medianDecimalOdds: number | null;
  medianFractionalOdds: string | null;
  bestDecimalOdds: number | null;
  bestFractionalOdds: string | null;
  bestBookmakerNames: string[];
  quoteCount: number;
  quotes: SportingLifeBookmakerQuote[];
  forecastOdds: string | null;
  forecastDecimalOdds: number | null;
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
  tprRatingCoverage?: RatingCoverage;
  jumpRatingCoverage?: {
    jprA: RatingCoverage;
  };
  jumpTissueCoverage?: {
    activeRunnerCount: number;
    predictedRunnerCount: number;
    predictionCoverage: number;
  };
  awRatingCoverage?: {
    awD: AwRatingCoverage;
  };
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
      sportingLifeCurrentCardVersion: typeof SPORTING_LIFE_CURRENT_CARD_VERSION;
      meetings: TodayMeeting[];
    }
  | {
      status: "empty";
      raceDate: string;
      displayDate: string;
      refreshedAt: Date | null;
      sportingLifeCurrentCardVersion: typeof SPORTING_LIFE_CURRENT_CARD_VERSION;
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
  forecastOdds?: string | null;
  bookmakerQuotes?: unknown;
  resultStatus: string | null;
  finishingPosition: number | null;
};

export type SportingLifeCurrentPrice = {
  raceId: string;
  runnerId: string;
  marketPrice: string | null;
  marketDecimalOdds: number | null;
  bookmakerQuoteCount: number;
  forecastPrice: string | null;
  forecastDecimalOdds: number | null;
  displayRaceTime: string;
};

export type SportingLifeCurrentCardDiagnostic = {
  version: typeof SPORTING_LIFE_CURRENT_CARD_VERSION;
  status: "replacement" | "ambiguous";
  meetingId: string;
  course: string;
  currentSourceRaceId: string | null;
  staleSourceRaceId: string | null;
  currentTime: string | null;
  staleTime: string | null;
  evidence: string[];
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

// Sporting Life payload clocks are UTC, unlike the local clocks on its pages.
export function formatSportingLifeRaceTime(raceDate: string, sourceTime: string | null, courseCountry?: string | null): string {
  const clock = sourceTime?.slice(0, 8);
  const instant = clock && /^\d{2}:\d{2}(:\d{2})?$/.test(clock)
    ? new Date(`${raceDate}T${clock.length === 5 ? `${clock}:00` : clock}Z`)
    : null;
  return formatRaceTimeForDisplay({
    raceDateTime: instant && Number.isFinite(instant.getTime()) ? instant : null,
    scheduledTime: sourceTime,
    courseCountry,
  });
}

export function formatTodayTprRankGap(rank: number, gap: number | null): string {
  if (gap === null) return `Rank ${rank}`;
  const absolute = Math.abs(gap).toFixed(1);
  const signed = Math.abs(gap) < 0.05 ? "0.0" : gap > 0 ? `+${absolute}` : `-${absolute}`;
  return `Rank ${rank} · ${rank === 1 ? "TPR lead" : "TPR deficit"} ${signed}`;
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
    onCurrentCardDiagnostic?: (diagnostic: SportingLifeCurrentCardDiagnostic) => void;
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
      sportingLifeCurrentCardVersion: SPORTING_LIFE_CURRENT_CARD_VERSION,
      message: "No racecard data has been imported for today.",
    };
  }

  const meetingOrder = meetingOrderFromIndexPayload(indexImport?.payload);
  const currentRows = measureSync(
    "today_current_card_reconciliation",
    () => reconcileSportingLifeCurrentCardRows(
      rows,
      indexImport?.payload,
      options.onCurrentCardDiagnostic ?? logCurrentCardDiagnostic,
    ),
    options.onTiming,
  );
  const targetRows = measureSync(
    "today_race_filter",
    () => options.raceFilter
      ? filterRacecardRows(currentRows, meetingOrder, options.raceFilter)
      : currentRows,
    options.onTiming,
  );
  const metricRows = await measure("today_target_metrics_load", () => getTargetRunnerMetricsForDate(db, raceDate, SPORTING_LIFE_SOURCE, {
    includeNonRunnerTargets: true,
    completedPriorRunsOnly: true,
    targetRunnerIds: targetRows.map((row) => row.runnerId),
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
    sportingLifeCurrentCardVersion: SPORTING_LIFE_CURRENT_CARD_VERSION,
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

export async function getSportingLifeCurrentPricesForDate(
  db: Db,
  raceDate: string,
): Promise<SportingLifeCurrentPrice[]> {
  const [indexImport, rows] = await Promise.all([
    getLatestRacecardIndexImport(db, raceDate),
    getRacecardRows(db, raceDate),
  ]);
  const currentRows = reconcileSportingLifeCurrentCardRows(
    rows,
    indexImport?.payload,
    logCurrentCardDiagnostic,
  );
  return currentRows.map((row) => sportingLifeCurrentPriceFromRacecard({
    raceId: row.raceId,
    runnerId: row.runnerId,
    forecastPrice: row.forecastOdds ?? row.odds,
    forecastDecimalOdds: decimalPrice(row.oddsDecimal),
    bookmakerQuotes: parseSportingLifeBookmakerQuotes(row.bookmakerQuotes),
    scheduledTime: row.scheduledTime,
    raceDateTime: row.raceDateTime,
    courseCountry: row.country,
  }));
}

export function sportingLifeCurrentPriceFromRacecard(input: {
  raceId: string;
  runnerId: string;
  forecastPrice: string | null;
  forecastDecimalOdds: number | null;
  bookmakerQuotes: SportingLifeBookmakerQuote[];
  scheduledTime: string | null;
  raceDateTime: Date | null;
  courseCountry: string | null;
}): SportingLifeCurrentPrice {
  const market = summarizeTodayMarketPrice({
    bookmakerQuotes: input.bookmakerQuotes,
    forecastOdds: input.forecastPrice,
    forecastDecimalOdds: input.forecastDecimalOdds,
  });
  return {
    raceId: input.raceId,
    runnerId: input.runnerId,
    marketPrice: market.medianFractionalOdds ?? market.medianDecimalOdds?.toFixed(2) ?? null,
    marketDecimalOdds: market.medianDecimalOdds,
    bookmakerQuoteCount: market.quoteCount,
    forecastPrice: market.forecastOdds,
    forecastDecimalOdds: market.forecastDecimalOdds,
    displayRaceTime: formatRaceTimeForDisplay(input),
  };
}

export async function getRacecardRowsForRaceIds(
  db: Db,
  raceIds: string[],
): Promise<TodayRacecardRow[]> {
  const uniqueRaceIds = [...new Set(raceIds)];
  if (uniqueRaceIds.length === 0) return [];
  return (await getRacecardRowsWhere(db, inArray(races.id, uniqueRaceIds))).map(withoutStaleBookmakerQuotes);
}

export type SportingLifeCurrentCardRaceStatuses = Omit<
  SportingLifeCurrentCardReconciliation<SportingLifeCurrentCardRaceRow>,
  "rows"
> & {
  version: typeof SPORTING_LIFE_CURRENT_CARD_VERSION;
};

export async function getSportingLifeCurrentCardRaceStatuses(
  db: Db,
  raceIds: string[],
): Promise<SportingLifeCurrentCardRaceStatuses> {
  const uniqueRaceIds = [...new Set(raceIds)];
  if (uniqueRaceIds.length === 0) {
    return emptyCurrentCardRaceStatuses();
  }
  const dateRows = await db
    .selectDistinct({ raceDate: races.raceDate })
    .from(races)
    .where(and(eq(races.source, SPORTING_LIFE_SOURCE), inArray(races.id, uniqueRaceIds)));
  const dates = dateRows.map((row) => row.raceDate);
  const reconciliations = await Promise.all(dates.map(async (raceDate) => {
    const [indexImport, rows] = await Promise.all([
      getLatestRacecardIndexImport(db, raceDate),
      getRacecardRows(db, raceDate),
    ]);
    return sportingLifeCurrentCardReconciliation(rows, indexImport?.payload);
  }));
  return {
    version: SPORTING_LIFE_CURRENT_CARD_VERSION,
    currentReplacementRaceIds: new Set(
      reconciliations.flatMap((result) => [...result.currentReplacementRaceIds]),
    ),
    supersededRaceIds: new Set(
      reconciliations.flatMap((result) => [...result.supersededRaceIds]),
    ),
    diagnostics: reconciliations.flatMap((result) => result.diagnostics),
  };
}

function emptyCurrentCardRaceStatuses(): SportingLifeCurrentCardRaceStatuses {
  return {
    version: SPORTING_LIFE_CURRENT_CARD_VERSION,
    currentReplacementRaceIds: new Set(),
    supersededRaceIds: new Set(),
    diagnostics: [],
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
      forecastOdds: row.forecastOdds ?? row.odds,
      forecastDecimalOdds: decimalPrice(row.oddsDecimal),
      bookmakerQuotes: parseSportingLifeBookmakerQuotes(row.bookmakerQuotes),
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
          const raceWithJumpRatings = attachJumpRaceRatings(raceWithTpr);
          const raceWithRatings = attachAwRaceRatings(raceWithJumpRatings);
          return {
            ...raceWithRatings,
            runners: raceWithRatings.runners.sort(compareRunners),
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
  const tprRatingCoverage = calculateRatingCoverage(
    race.runners,
    (runner) => ratings.has(runner.runnerId),
    TPR_RATING_COVERAGE_GUARD_VERSION,
    TPR_RATING_COVERAGE_GUARD_IMPLEMENTED_AT,
  );

  return {
    ...race,
    turfPerformanceShadow: shadow,
    tprRatingCoverage,
    runners: race.runners.map((runner) => ({
      ...runner,
      turfPerformanceRating: ratings.get(runner.runnerId),
      tprConfidence: ratings.has(runner.runnerId) ? runner.metrics?.tprConfidence : undefined,
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

type SportingLifeIndexRace = {
  sourceId: string;
  meetingId: string;
  course: string;
  meetingIndex: number;
  raceIndex: number;
};

type CurrentCardRace = {
  sourceId: string;
  raceId: string;
  raceDate: string;
  course: string;
  raceName: string | null;
  scheduledTime: string | null;
  distanceYards: number | null;
  horseIds: Set<string>;
  horseNames: Set<string>;
  index: SportingLifeIndexRace;
};

export type SportingLifeCurrentCardRaceRow = Pick<
  TodayRacecardRow,
  | "raceId"
  | "raceSourceId"
  | "raceDate"
  | "scheduledTime"
  | "raceName"
  | "distanceYards"
  | "courseName"
  | "horseId"
  | "horseName"
>;

export type SportingLifeCurrentCardReconciliation<T> = {
  rows: T[];
  currentReplacementRaceIds: Set<string>;
  supersededRaceIds: Set<string>;
  diagnostics: SportingLifeCurrentCardDiagnostic[];
};

export function sportingLifeCurrentCardReconciliation<
  T extends SportingLifeCurrentCardRaceRow,
>(
  rows: T[],
  indexPayload: unknown,
  onDiagnostic?: (diagnostic: SportingLifeCurrentCardDiagnostic) => void,
): SportingLifeCurrentCardReconciliation<T> {
  const indexRaces = sportingLifeIndexRaces(indexPayload);
  if (indexRaces.size === 0 || rows.length === 0) {
    return {
      rows,
      currentReplacementRaceIds: new Set(),
      supersededRaceIds: new Set(),
      diagnostics: [],
    };
  }

  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    if (!row.raceSourceId || !indexRaces.has(row.raceSourceId)) continue;
    const group = grouped.get(row.raceSourceId) ?? [];
    group.push(row);
    grouped.set(row.raceSourceId, group);
  }
  const candidates = [...grouped.entries()].flatMap(([sourceId, raceRows]) => {
    const first = raceRows[0];
    const index = indexRaces.get(sourceId);
    if (!first || !index) return [];
    return [{
      sourceId,
      raceId: first.raceId,
      raceDate: first.raceDate,
      course: first.courseName,
      raceName: first.raceName,
      scheduledTime: first.scheduledTime,
      distanceYards: first.distanceYards,
      horseIds: new Set(raceRows.map((row) => row.horseId)),
      horseNames: new Set(raceRows.map((row) => normalizeRaceIdentityText(row.horseName))),
      index,
    } satisfies CurrentCardRace];
  }).sort((left, right) =>
    left.index.meetingIndex - right.index.meetingIndex ||
    left.index.raceIndex - right.index.raceIndex
  );

  const staleSourceIds = new Set<string>();
  const currentReplacementRaceIds = new Set<string>();
  const supersededRaceIds = new Set<string>();
  const diagnostics: SportingLifeCurrentCardDiagnostic[] = [];
  const processedSourceIds = new Set<string>();
  for (let index = 0; index < candidates.length; index += 1) {
    const current = candidates[index]!;
    if (processedSourceIds.has(current.sourceId)) continue;
    const matches = candidates.filter((candidate) =>
      candidate.sourceId !== current.sourceId &&
      !processedSourceIds.has(candidate.sourceId) &&
      replacementMatchEvidence(current, candidate) !== null
    );
    if (matches.length === 0) continue;
    if (matches.length > 1) {
      const diagnostic = currentCardDiagnostic("ambiguous", current, null, [
        `matched ${matches.length} possible alternate versions`,
        `candidate source IDs ${matches.map((match) => match.sourceId).join(", ")}`,
      ]);
      diagnostics.push(diagnostic);
      onDiagnostic?.(diagnostic);
      processedSourceIds.add(current.sourceId);
      continue;
    }
    const alternate = matches[0]!;
    const evidence = replacementMatchEvidence(current, alternate)!;
    processedSourceIds.add(current.sourceId);
    processedSourceIds.add(alternate.sourceId);
    if (!isGuardedCurrentVersion(current, alternate)) {
      const diagnostic = currentCardDiagnostic("ambiguous", current, alternate, evidence);
      diagnostics.push(diagnostic);
      onDiagnostic?.(diagnostic);
      continue;
    }
    staleSourceIds.add(alternate.sourceId);
    currentReplacementRaceIds.add(current.raceId);
    supersededRaceIds.add(alternate.raceId);
    const diagnostic = currentCardDiagnostic("replacement", current, alternate, evidence);
    diagnostics.push(diagnostic);
    onDiagnostic?.(diagnostic);
  }

  return {
    rows: staleSourceIds.size === 0
      ? rows
      : rows.filter((row) => !row.raceSourceId || !staleSourceIds.has(row.raceSourceId)),
    currentReplacementRaceIds,
    supersededRaceIds,
    diagnostics,
  };
}

export function reconcileSportingLifeCurrentCardRows<
  T extends SportingLifeCurrentCardRaceRow,
>(
  rows: T[],
  indexPayload: unknown,
  onDiagnostic?: (diagnostic: SportingLifeCurrentCardDiagnostic) => void,
): T[] {
  return sportingLifeCurrentCardReconciliation(rows, indexPayload, onDiagnostic).rows;
}

function sportingLifeIndexRaces(payload: unknown): Map<string, SportingLifeIndexRace> {
  const meetings = (payload as RacecardIndexPayload | undefined)?.props?.pageProps?.meetings;
  const result = new Map<string, SportingLifeIndexRace>();
  if (!Array.isArray(meetings)) return result;
  meetings.forEach((meeting, meetingIndex) => {
    if (!isRecord(meeting) || !isRecord(meeting.meeting_summary)) return;
    const summary = meeting.meeting_summary;
    const meetingReference = summary.meeting_reference;
    const course = summary.course;
    const races = meeting.races;
    if (!isRecord(meetingReference) || !isRecord(course) || !Array.isArray(races)) return;
    const meetingId = scalarString(meetingReference.id);
    const courseName = typeof course.name === "string" ? course.name : "";
    if (!meetingId || !courseName) return;
    races.forEach((race, raceIndex) => {
      if (!isRecord(race) || !isRecord(race.race_summary_reference)) return;
      const sourceId = scalarString(race.race_summary_reference.id);
      if (!sourceId) return;
      result.set(sourceId, { sourceId, meetingId, course: courseName, meetingIndex, raceIndex });
    });
  });
  return result;
}

function replacementMatchEvidence(
  current: CurrentCardRace,
  alternate: CurrentCardRace,
): string[] | null {
  if (current.index.meetingId !== alternate.index.meetingId) return null;
  if (normalizeRaceIdentityText(current.course) !== normalizeRaceIdentityText(alternate.course)) return null;
  if (current.raceDate !== alternate.raceDate) return null;
  const title = normalizeRaceIdentityText(current.raceName);
  if (!title || title !== normalizeRaceIdentityText(alternate.raceName)) return null;
  if (current.distanceYards === null || current.distanceYards !== alternate.distanceYards) return null;
  const timeDifference = raceTimeDifferenceMinutes(current.scheduledTime, alternate.scheduledTime);
  if (timeDifference === null || timeDifference > 10) return null;
  if (current.index.meetingIndex !== alternate.index.meetingIndex) return null;
  if (Math.abs(current.index.raceIndex - alternate.index.raceIndex) !== 1) return null;
  if (current.horseIds.size < 2 || alternate.horseIds.size < 2) return null;
  const overlap = [...current.horseIds].filter((horseId) => alternate.horseIds.has(horseId));
  const smaller = Math.min(current.horseIds.size, alternate.horseIds.size);
  const nameOverlap = [...current.horseNames].filter((horseName) => alternate.horseNames.has(horseName));
  const smallerNameSet = Math.min(current.horseNames.size, alternate.horseNames.size);
  if (nameOverlap.length !== smallerNameSet || overlap.length / smaller < 0.9) return null;
  return [
    `same meeting ${current.index.meetingId}, course, date, normalized title and distance`,
    `adjacent current-index positions ${current.index.raceIndex}/${alternate.index.raceIndex}`,
    `scheduled times within ${timeDifference} minutes`,
    `runner overlap ${nameOverlap.length}/${smallerNameSet} names and ${overlap.length}/${smaller} stable horse IDs`,
  ];
}

function isGuardedCurrentVersion(current: CurrentCardRace, alternate: CurrentCardRace): boolean {
  const currentSourceId = Number(current.sourceId);
  const alternateSourceId = Number(alternate.sourceId);
  return current.index.raceIndex < alternate.index.raceIndex &&
    Number.isInteger(currentSourceId) &&
    Number.isInteger(alternateSourceId) &&
    currentSourceId > alternateSourceId &&
    current.horseIds.size <= alternate.horseIds.size &&
    [...current.horseNames].every((horseName) => alternate.horseNames.has(horseName)) &&
    [...current.horseIds].filter((horseId) => alternate.horseIds.has(horseId)).length /
      current.horseIds.size >= 0.9;
}

function currentCardDiagnostic(
  status: SportingLifeCurrentCardDiagnostic["status"],
  current: CurrentCardRace,
  alternate: CurrentCardRace | null,
  evidence: string[],
): SportingLifeCurrentCardDiagnostic {
  return {
    version: SPORTING_LIFE_CURRENT_CARD_VERSION,
    status,
    meetingId: current.index.meetingId,
    course: current.course,
    currentSourceRaceId: status === "replacement" ? current.sourceId : null,
    staleSourceRaceId: status === "replacement" ? alternate?.sourceId ?? null : null,
    currentTime: current.scheduledTime?.slice(0, 5) ?? null,
    staleTime: alternate?.scheduledTime?.slice(0, 5) ?? null,
    evidence,
  };
}

function logCurrentCardDiagnostic(diagnostic: SportingLifeCurrentCardDiagnostic): void {
  const ids = diagnostic.status === "replacement"
    ? `stale=${diagnostic.staleSourceRaceId} current=${diagnostic.currentSourceRaceId}`
    : "current=ambiguous";
  console.info(
    `SPORTING_LIFE_CURRENT_CARD version=${diagnostic.version} status=${diagnostic.status} ` +
    `meeting=${diagnostic.meetingId} course=${JSON.stringify(diagnostic.course)} ${ids} ` +
    `times=${diagnostic.staleTime ?? "-"}->${diagnostic.currentTime ?? "-"} ` +
    `evidence=${JSON.stringify(diagnostic.evidence.join("; "))}`,
  );
}

function normalizeRaceIdentityText(value: string | null): string {
  return (value ?? "")
    .normalize("NFKD")
    .toLocaleLowerCase("en-GB")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function raceTimeDifferenceMinutes(left: string | null, right: string | null): number | null {
  const minutes = (value: string | null) => {
    const match = value?.match(/^(\d{1,2}):(\d{2})/);
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
  };
  const leftMinutes = minutes(left);
  const rightMinutes = minutes(right);
  return leftMinutes === null || rightMinutes === null ? null : Math.abs(leftMinutes - rightMinutes);
}

function scalarString(value: unknown): string | null {
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
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

function oddsSortValue(runner: Pick<TodayRunner, "bookmakerQuotes">): number | null {
  return summarizeTodayMarketPrice(runner).medianDecimalOdds;
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
  return getRacecardRowsWhere(db, eq(races.raceDate, raceDate));
}

function getRacecardRowsWhere(
  db: Db,
  racePredicate: ReturnType<typeof eq> | ReturnType<typeof inArray>,
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
      forecastOdds: sql<string | null>`(
        select ride #>> '{betting,current_odds}'
        from ${sourceImports}, lateral jsonb_array_elements(
          coalesce(${sourceImports.payload} #> '{props,pageProps,race,rides}', '[]'::jsonb)
        ) as ride
        where ${sourceImports.source} = ${SPORTING_LIFE_SOURCE}
          and ${sourceImports.sourceType} = ${RACECARD_SOURCE_TYPE}
          and ${sourceImports.sourceId} = ${races.sourceId}
          and ride #>> '{ride_reference,id}' = ${raceRunners.sourceId}
        limit 1
      )`,
      bookmakerQuotes: sql<unknown>`(
        select coalesce(ride -> 'bookmakerOdds', '[]'::jsonb)
        from ${sourceImports}, lateral jsonb_array_elements(
          coalesce(${sourceImports.payload} #> '{props,pageProps,race,rides}', '[]'::jsonb)
        ) as ride
        where ${sourceImports.source} = ${SPORTING_LIFE_SOURCE}
          and ${sourceImports.sourceType} = ${RACECARD_SOURCE_TYPE}
          and ${sourceImports.sourceId} = ${races.sourceId}
          and ride #>> '{ride_reference,id}' = ${raceRunners.sourceId}
        limit 1
      )`,
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
        racePredicate,
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

export function parseSportingLifeBookmakerQuotes(value: unknown): SportingLifeBookmakerQuote[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const decimalOdds = Number(entry.decimalOdds ?? entry.decimalOddsString);
    if (!Number.isFinite(decimalOdds) || decimalOdds <= 1) return [];
    const bookmakerId = Number(entry.bookmakerId);
    return [{
      bookmakerId: Number.isFinite(bookmakerId) ? bookmakerId : null,
      bookmakerName: typeof entry.bookmakerName === "string" ? entry.bookmakerName : null,
      fractionalOdds: typeof entry.fractionalOdds === "string" ? entry.fractionalOdds : null,
      decimalOdds,
    }];
  });
}

export function summarizeTodayMarketPrice(
  runner: {
    bookmakerQuotes?: SportingLifeBookmakerQuote[];
    forecastOdds?: string | null;
    forecastDecimalOdds?: number | null;
    odds?: string | null;
    oddsDecimal?: string | null;
  },
): TodayMarketPrice {
  const quotes = (runner.bookmakerQuotes ?? [])
    .filter((quote) => Number.isFinite(quote.decimalOdds) && quote.decimalOdds > 1)
    .map((quote) => ({ ...quote }))
    .sort((left, right) => left.decimalOdds - right.decimalOdds ||
      (left.bookmakerName ?? "").localeCompare(right.bookmakerName ?? ""));
  if (quotes.length === 0) {
    return {
      medianDecimalOdds: null,
      medianFractionalOdds: null,
      bestDecimalOdds: null,
      bestFractionalOdds: null,
      bestBookmakerNames: [],
      quoteCount: 0,
      quotes: [],
      forecastOdds: runner.forecastOdds ?? runner.odds ?? null,
      forecastDecimalOdds: runner.forecastDecimalOdds ?? decimalPrice(runner.oddsDecimal ?? null),
    };
  }
  const middle = Math.floor(quotes.length / 2);
  const medianDecimalOdds = quotes.length % 2 === 1
    ? quotes[middle]!.decimalOdds
    : (quotes[middle - 1]!.decimalOdds + quotes[middle]!.decimalOdds) / 2;
  const matchingMedian = quotes.find((quote) => quote.decimalOdds === medianDecimalOdds);
  const bestDecimalOdds = quotes.at(-1)!.decimalOdds;
  const bestQuotes = quotes.filter((quote) => quote.decimalOdds === bestDecimalOdds);
  return {
    medianDecimalOdds,
    medianFractionalOdds: matchingMedian?.fractionalOdds ?? decimalToFractionalOdds(medianDecimalOdds),
    bestDecimalOdds,
    bestFractionalOdds: bestQuotes[0]?.fractionalOdds ?? decimalToFractionalOdds(bestDecimalOdds),
    bestBookmakerNames: [...new Set(bestQuotes.flatMap((quote) => quote.bookmakerName ? [quote.bookmakerName] : []))],
    quoteCount: quotes.length,
    quotes,
    forecastOdds: runner.forecastOdds ?? runner.odds ?? null,
    forecastDecimalOdds: runner.forecastDecimalOdds ?? decimalPrice(runner.oddsDecimal ?? null),
  };
}

function decimalToFractionalOdds(decimalOdds: number): string | null {
  const fractional = decimalOdds - 1;
  for (const denominator of [1, 2, 4, 5, 8, 10, 16, 20, 25, 50, 100]) {
    const numerator = Math.round(fractional * denominator);
    if (Math.abs(numerator / denominator - fractional) < 1e-9) {
      const divisor = greatestCommonDivisor(numerator, denominator);
      return `${numerator / divisor}/${denominator / divisor}`;
    }
  }
  return null;
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) [a, b] = [b, a % b];
  return a || 1;
}

function decimalPrice(value: string | null): number | null {
  if (value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 1 ? parsed : null;
}
