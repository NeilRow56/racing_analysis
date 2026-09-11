import { and, desc, eq, inArray, lt, sql, type SQL } from "drizzle-orm";
import { createDbConnection } from "@/db";
import { courses, horses, raceRunners, races, sourceImports } from "@/db/schema";
import {
  getAwSpeedRatingsAsOfRuns,
} from "./aw-speed-ratings";
import { isSupportedAllWeatherRace, type AwSpeedRating } from "./aw-speed-rating";
import {
  calculateHorseMetricsAsOf,
  isRunnableResultStatus,
  type HistoricalRunInput,
  type HorseMetricsAsOf,
} from "./horse-metrics";
import {
  getJumpSpeedRatingsAsOfRuns,
} from "./jump-speed-ratings";
import { isJumpRace, type JumpSpeedRating } from "./jump-speed-rating";
import {
  getTurfSpeedRatingsAsOfRuns,
} from "./turf-speed-ratings";
import { isOrdinaryFlatTurfRace, type TurfSpeedRating } from "./turf-speed-rating";
import { calculateTodaysRating } from "./todays-rating";
import {
  calculateWeightAdjustedPerformance,
  type WeightAdjustedPerformance,
} from "./weight-performance";

type Db = ReturnType<typeof createDbConnection>["db"];

const QUERY_CHUNK_SIZE = 5_000;
const RESULT_SOURCE_TYPE = "full-result-next-data";

export const BACKTEST_FEATURE_SOURCE_VERSION = "historical_target_metrics_v1";

export type HistoricalRaceCode = "jump" | "aw" | "turf" | "unsupported";

export type HistoricalSpeedRatingMeta = {
  method: string | null;
  confidence: string | null;
  calculationVersion: string | null;
};

export type HistoricalPreRaceFeatureRow = {
  targetRaceId: string;
  targetRunnerId: string;
  source: string | null;
  horseId: string;
  horseName: string;
  raceDateTime: Date;
  raceDate: string;
  courseId: string;
  courseName: string;
  raceName: string | null;
  raceClass: string | null;
  raceType: string | null;
  raceTypeCode: string | null;
  distanceYards: number | null;
  going: string | null;
  declaredRunnerCount: number | null;
  actualRunnerCount: number | null;
  surface: string | null;
  raceCode: HistoricalRaceCode;
  horseAge: number | null;
  officialRating: number | null;
  weight: string | null;
  weightCarriedLbs: number | null;
  draw: number | null;
  odds: null;
  oddsDecimal: null;
  priorRuns: number;
  priorWins: number;
  priorPlaces: number;
  winPercentage: number | null;
  placePercentage: number | null;
  latestRunDate: string | null;
  daysSinceLastRun: number | null;
  latestOr: number | null;
  previousOr: number | null;
  latestSpeedRating: number | null;
  previousSpeedRating: number | null;
  bestSpeedLast3: number | null;
  bestSpeedLast5: number | null;
  averageSpeedLast3: number | null;
  averageSpeedLast5: number | null;
  latestPerformanceRating: number | null;
  previousPerformanceRating: number | null;
  bestPerformanceLast3: number | null;
  bestPerformanceLast5: number | null;
  averagePerformanceLast3: number | null;
  averagePerformanceLast5: number | null;
  latestPerformanceCalculationVersion: string | null;
  currentWeightCarriedLb: number | null;
  latestTodaysRating: number | null;
  previousTodaysRating: number | null;
  bestTodaysRatingLast3: number | null;
  bestTodaysRatingLast5: number | null;
  averageTodaysRatingLast3: number | null;
  averageTodaysRatingLast5: number | null;
  todaysRatingCalculationVersion: string | null;
  latestJumpSpeedRating: number | null;
  previousJumpSpeedRating: number | null;
  bestJumpSpeedLast3: number | null;
  bestJumpSpeedLast5: number | null;
  averageJumpSpeedLast3: number | null;
  averageJumpSpeedLast5: number | null;
  latestAwSpeedRating: number | null;
  previousAwSpeedRating: number | null;
  bestAwSpeedLast3: number | null;
  bestAwSpeedLast5: number | null;
  averageAwSpeedLast3: number | null;
  averageAwSpeedLast5: number | null;
  latestTurfSpeedRating: number | null;
  previousTurfSpeedRating: number | null;
  bestTurfSpeedLast3: number | null;
  bestTurfSpeedLast5: number | null;
  averageTurfSpeedLast3: number | null;
  averageTurfSpeedLast5: number | null;
  latestSpeedMethod: string | null;
  latestSpeedConfidence: string | null;
  speedCalculationVersion: string | null;
};

export type HistoricalPostRaceOutcome = {
  targetRaceId: string;
  targetRunnerId: string;
  finishingPosition: number | null;
  resultStatus: string | null;
  won: boolean | null;
  placed: boolean | null;
  startingPrice: string | null;
  startingPriceDecimal: string | null;
};

export type HistoricalTargetRunnerMetricsRow = {
  features: HistoricalPreRaceFeatureRow;
  outcome: HistoricalPostRaceOutcome;
};

export type HistoricalTargetRow = {
  targetRaceId: string;
  targetRunnerId: string;
  source: string | null;
  horseId: string;
  horseName: string;
  raceDateTime: Date;
  raceDate: string;
  courseId: string;
  courseName: string;
  raceName: string | null;
  raceClass: string | null;
  raceType: string | null;
  raceTypeCode: string | null;
  distanceYards: number | null;
  going: string | null;
  declaredRunnerCount: number | null;
  actualRunnerCount: number | null;
  surface: string | null;
  horseAge: number | null;
  officialRating: number | null;
  weight: string | null;
  weightCarriedLbs: number | null;
  draw: number | null;
  finishingPosition: number | null;
  resultStatus: string | null;
  startingPrice: string | null;
  startingPriceDecimal: string | null;
};

export type HistoricalCandidateRun = HistoricalRunInput & {
  runnerId: string;
  raceTypeCode?: string | null;
  surface?: string | null;
  weightCarriedLbs?: number | null;
};

export async function getHistoricalTargetRunnerMetrics(
  db: Db,
  input: {
    source?: string;
    targetRunnerIds?: string[];
    targetRaceIds?: string[];
    ratingFamily?: HistoricalRaceCode | "all";
  },
): Promise<HistoricalTargetRunnerMetricsRow[]> {
  const source = input.source ?? "sporting_life";
  const targets = await loadTargets(db, {
    source,
    targetRunnerIds: input.targetRunnerIds ?? [],
    targetRaceIds: input.targetRaceIds ?? [],
  });
  if (targets.length === 0) {
    return [];
  }

  const candidateRuns = await loadCandidateRuns(db, source, targets);
  const runnerIds = candidateRuns.map((run) => run.runnerId);
  const ratingFamily = input.ratingFamily ?? "all";
  const [jumpRatings, awRatings, turfRatings] = await Promise.all([
    ratingFamily === "all" || ratingFamily === "jump"
      ? getJumpSpeedRatingsAsOfRuns(db, runnerIds, { source })
      : Promise.resolve(new Map<string, JumpSpeedRating>()),
    ratingFamily === "all" || ratingFamily === "aw"
      ? getAwSpeedRatingsAsOfRuns(db, runnerIds, { source })
      : Promise.resolve(new Map<string, AwSpeedRating>()),
    ratingFamily === "all" || ratingFamily === "turf"
      ? getTurfSpeedRatingsAsOfRuns(db, runnerIds, { source })
      : Promise.resolve(new Map<string, TurfSpeedRating>()),
  ]);

  return buildHistoricalTargetRunnerMetricRows({
    targets,
    candidateRuns: candidateRuns.map((run) => ({
      ...run,
      jumpSpeedRating: jumpRatings.get(run.runnerId) ?? null,
      awSpeedRating: awRatings.get(run.runnerId) ?? null,
      turfSpeedRating: turfRatings.get(run.runnerId) ?? null,
    })),
  });
}

export function buildHistoricalTargetRunnerMetricRows({
  targets,
  candidateRuns,
}: {
  targets: HistoricalTargetRow[];
  candidateRuns: HistoricalCandidateRun[];
}): HistoricalTargetRunnerMetricsRow[] {
  const runsByHorse = new Map<string, HistoricalCandidateRun[]>();
  for (const run of candidateRuns) {
    const runs = runsByHorse.get(run.horseId) ?? [];
    runs.push(run);
    runsByHorse.set(run.horseId, runs);
  }

  return targets.map((target) => {
    const raceCode = classifyHistoricalRaceCode(target);
    const priorRuns =
      runsByHorse
        .get(target.horseId)
        ?.filter(
          (run) =>
            (run.source === undefined || run.source === target.source) &&
            run.raceDateTime < target.raceDateTime,
        ) ?? [];
    const metrics = calculateHorseMetricsAsOf({
      runs: priorRuns,
      beforeDateTime: target.raceDateTime,
      targetCourseId: target.courseId,
      targetDistanceYards: target.distanceYards,
      targetGoing: target.going,
    });
    const speed = speedFieldsForRaceCode(raceCode, metrics);
    const performance = performanceFieldsForRaceCode(raceCode, priorRuns);
    const todays = todaysRatingFieldsForRaceCode(
      raceCode,
      priorRuns,
      target.weightCarriedLbs,
    );
    const latestSpeedMeta = latestSpeedMetaForRaceCode(raceCode, priorRuns);

    return {
      features: {
        targetRaceId: target.targetRaceId,
        targetRunnerId: target.targetRunnerId,
        source: target.source,
        horseId: target.horseId,
        horseName: target.horseName,
        raceDateTime: target.raceDateTime,
        raceDate: target.raceDate,
        courseId: target.courseId,
        courseName: target.courseName,
        raceName: target.raceName,
        raceClass: target.raceClass,
        raceType: target.raceType,
        raceTypeCode: target.raceTypeCode,
        distanceYards: target.distanceYards,
        going: target.going,
        declaredRunnerCount: target.declaredRunnerCount,
        actualRunnerCount: target.actualRunnerCount,
        surface: target.surface,
        raceCode,
        horseAge: target.horseAge,
        officialRating: target.officialRating,
        weight: target.weight,
        weightCarriedLbs: target.weightCarriedLbs,
        draw: target.draw,
        odds: null,
        oddsDecimal: null,
        priorRuns: metrics.priorRuns,
        priorWins: metrics.priorWins,
        priorPlaces: metrics.priorPlaces,
        winPercentage: metrics.winPercentage,
        placePercentage: metrics.placePercentage,
        latestRunDate: metrics.latestRunDate,
        daysSinceLastRun: metrics.daysSinceLastRun,
        latestOr: metrics.latestOr,
        previousOr: previousOfficialRating(priorRuns, target.raceDateTime),
        latestSpeedRating: speed.latest,
        previousSpeedRating: speed.previous,
        bestSpeedLast3: speed.bestLast3,
        bestSpeedLast5: speed.bestLast5,
        averageSpeedLast3: speed.averageLast3,
        averageSpeedLast5: speed.averageLast5,
        latestPerformanceRating: performance.latest,
        previousPerformanceRating: performance.previous,
        bestPerformanceLast3: performance.bestLast3,
        bestPerformanceLast5: performance.bestLast5,
        averagePerformanceLast3: performance.averageLast3,
        averagePerformanceLast5: performance.averageLast5,
        latestPerformanceCalculationVersion: performance.calculationVersion,
        currentWeightCarriedLb: target.weightCarriedLbs,
        latestTodaysRating: todays.latest,
        previousTodaysRating: todays.previous,
        bestTodaysRatingLast3: todays.bestLast3,
        bestTodaysRatingLast5: todays.bestLast5,
        averageTodaysRatingLast3: todays.averageLast3,
        averageTodaysRatingLast5: todays.averageLast5,
        todaysRatingCalculationVersion: todays.calculationVersion,
        latestJumpSpeedRating: metrics.latestJumpSpeedRating,
        previousJumpSpeedRating: metrics.previousJumpSpeedRating,
        bestJumpSpeedLast3: metrics.bestJumpSpeedLast3,
        bestJumpSpeedLast5: metrics.bestJumpSpeedLast5,
        averageJumpSpeedLast3: metrics.averageJumpSpeedLast3,
        averageJumpSpeedLast5: metrics.averageJumpSpeedLast5,
        latestAwSpeedRating: metrics.latestAwSpeedRating,
        previousAwSpeedRating: metrics.previousAwSpeedRating,
        bestAwSpeedLast3: metrics.bestAwSpeedLast3,
        bestAwSpeedLast5: metrics.bestAwSpeedLast5,
        averageAwSpeedLast3: metrics.averageAwSpeedLast3,
        averageAwSpeedLast5: metrics.averageAwSpeedLast5,
        latestTurfSpeedRating: metrics.latestTurfSpeedRating,
        previousTurfSpeedRating: metrics.previousTurfSpeedRating,
        bestTurfSpeedLast3: metrics.bestTurfSpeedLast3,
        bestTurfSpeedLast5: metrics.bestTurfSpeedLast5,
        averageTurfSpeedLast3: metrics.averageTurfSpeedLast3,
        averageTurfSpeedLast5: metrics.averageTurfSpeedLast5,
        latestSpeedMethod: latestSpeedMeta.method,
        latestSpeedConfidence: latestSpeedMeta.confidence,
        speedCalculationVersion: latestSpeedMeta.calculationVersion,
      },
      outcome: {
        targetRaceId: target.targetRaceId,
        targetRunnerId: target.targetRunnerId,
        finishingPosition: target.finishingPosition,
        resultStatus: target.resultStatus,
        won: target.finishingPosition === null ? null : target.finishingPosition === 1,
        placed:
          target.finishingPosition === null
            ? null
            : target.finishingPosition >= 1 && target.finishingPosition <= 3,
        startingPrice: target.startingPrice,
        startingPriceDecimal: target.startingPriceDecimal,
      },
    };
  });
}

async function loadTargets(
  db: Db,
  input: {
    source: string;
    targetRunnerIds: string[];
    targetRaceIds: string[];
  },
): Promise<HistoricalTargetRow[]> {
  const conditions: SQL[] = [
    eq(races.source, input.source),
    eq(raceRunners.source, input.source),
  ];
  if (input.targetRunnerIds.length > 0) {
    conditions.push(inArray(raceRunners.id, input.targetRunnerIds));
  }
  if (input.targetRaceIds.length > 0) {
    conditions.push(inArray(races.id, input.targetRaceIds));
  }
  if (input.targetRunnerIds.length === 0 && input.targetRaceIds.length === 0) {
    return [];
  }

  return (
    await db
      .select({
        targetRaceId: races.id,
        targetRunnerId: raceRunners.id,
        source: raceRunners.source,
        horseId: raceRunners.horseId,
        horseName: horses.displayName,
        raceDateTime: races.raceDatetime,
        raceDate: races.raceDate,
        courseId: races.courseId,
        courseName: courses.displayName,
        raceName: races.raceName,
        raceClass: races.raceClass,
        raceType: races.raceType,
        raceTypeCode: races.raceTypeCode,
        distanceYards: races.distanceYards,
        going: races.going,
        declaredRunnerCount: races.declaredRunnerCount,
        actualRunnerCount: races.actualRunnerCount,
        surface: surfaceSql(),
        horseAge: raceRunners.horseAge,
        officialRating: raceRunners.officialRating,
        weight: raceRunners.weight,
        weightCarriedLbs: raceRunners.weightCarriedLbs,
        draw: raceRunners.draw,
        finishingPosition: raceRunners.finishingPosition,
        resultStatus: raceRunners.resultStatus,
        startingPrice: raceRunners.startingPrice,
        startingPriceDecimal: sql<string | null>`${raceRunners.startingPriceDecimal}::text`,
      })
      .from(raceRunners)
      .innerJoin(races, eq(raceRunners.raceId, races.id))
      .innerJoin(courses, eq(races.courseId, courses.id))
      .innerJoin(horses, eq(raceRunners.horseId, horses.id))
      .leftJoin(sourceImports, sourceImportJoinCondition(input.source))
      .where(and(...conditions))
      .orderBy(desc(races.raceDatetime))
  ).filter(hasRaceDateTime);
}

async function loadCandidateRuns(
  db: Db,
  source: string,
  targets: HistoricalTargetRow[],
): Promise<HistoricalCandidateRun[]> {
  const horseIds = [...new Set(targets.map((target) => target.horseId))];
  const latestTargetDateTime = targets.reduce(
    (latest, target) =>
      target.raceDateTime > latest ? target.raceDateTime : latest,
    targets[0].raceDateTime,
  );
  const rows = (
    await Promise.all(
      chunks(horseIds, QUERY_CHUNK_SIZE).map((horseIdChunk) =>
        db
          .select({
            source: raceRunners.source,
            runnerId: raceRunners.id,
            horseId: raceRunners.horseId,
            raceDateTime: races.raceDatetime,
            raceDate: races.raceDate,
            raceName: races.raceName,
            raceType: races.raceType,
            raceTypeCode: races.raceTypeCode,
            courseId: races.courseId,
            courseName: courses.displayName,
            distanceYards: races.distanceYards,
            going: races.going,
            surface: surfaceSql(),
            finishingPosition: raceRunners.finishingPosition,
            resultStatus: raceRunners.resultStatus,
            racingPostRating: raceRunners.racingPostRating,
            topspeedRating: raceRunners.topspeedRating,
            officialRating: raceRunners.officialRating,
            weightCarriedLbs: raceRunners.weightCarriedLbs,
          })
          .from(raceRunners)
          .innerJoin(races, eq(raceRunners.raceId, races.id))
          .innerJoin(courses, eq(races.courseId, courses.id))
          .leftJoin(sourceImports, sourceImportJoinCondition(source))
          .where(
            and(
              inArray(raceRunners.horseId, horseIdChunk),
              eq(raceRunners.source, source),
              eq(races.source, source),
              isRunnableResultStatus(),
              lt(races.raceDatetime, latestTargetDateTime),
              sql`${races.winningTime} is not null and btrim(${races.winningTime}) <> ''`,
            ),
          )
          .orderBy(desc(races.raceDatetime)),
      ),
    )
  ).flat();

  return rows.filter(hasRaceDateTime);
}

function classifyHistoricalRaceCode(input: {
  raceName?: string | null;
  raceType?: string | null;
  raceTypeCode?: string | null;
  courseName?: string | null;
  going?: string | null;
  surface?: string | null;
}): HistoricalRaceCode {
  if (isJumpRace(input)) {
    return "jump";
  }
  if (isSupportedAllWeatherRace(input)) {
    return "aw";
  }
  if (isOrdinaryFlatTurfRace(input)) {
    return "turf";
  }
  return "unsupported";
}

function speedFieldsForRaceCode(
  raceCode: HistoricalRaceCode,
  metrics: HorseMetricsAsOf,
): {
  latest: number | null;
  previous: number | null;
  bestLast3: number | null;
  bestLast5: number | null;
  averageLast3: number | null;
  averageLast5: number | null;
} {
  if (raceCode === "jump") {
    return {
      latest: metrics.latestJumpSpeedRating,
      previous: metrics.previousJumpSpeedRating,
      bestLast3: metrics.bestJumpSpeedLast3,
      bestLast5: metrics.bestJumpSpeedLast5,
      averageLast3: metrics.averageJumpSpeedLast3,
      averageLast5: metrics.averageJumpSpeedLast5,
    };
  }
  if (raceCode === "aw") {
    return {
      latest: metrics.latestAwSpeedRating,
      previous: metrics.previousAwSpeedRating,
      bestLast3: metrics.bestAwSpeedLast3,
      bestLast5: metrics.bestAwSpeedLast5,
      averageLast3: metrics.averageAwSpeedLast3,
      averageLast5: metrics.averageAwSpeedLast5,
    };
  }
  if (raceCode === "turf") {
    return {
      latest: metrics.latestTurfSpeedRating,
      previous: metrics.previousTurfSpeedRating,
      bestLast3: metrics.bestTurfSpeedLast3,
      bestLast5: metrics.bestTurfSpeedLast5,
      averageLast3: metrics.averageTurfSpeedLast3,
      averageLast5: metrics.averageTurfSpeedLast5,
    };
  }
  return {
    latest: null,
    previous: null,
    bestLast3: null,
    bestLast5: null,
    averageLast3: null,
    averageLast5: null,
  };
}

function latestSpeedMetaForRaceCode(
  raceCode: HistoricalRaceCode,
  priorRuns: HistoricalCandidateRun[],
): HistoricalSpeedRatingMeta {
  const sortedRuns = priorRuns
    .filter(
      (run) =>
        run.resultStatus !== "non_runner" &&
        (run.resultStatus !== null || run.finishingPosition !== null),
    )
    .sort((a, b) => b.raceDateTime.getTime() - a.raceDateTime.getTime());
  for (const run of sortedRuns) {
    const rating = speedRatingForRaceCode(raceCode, run);
    if (rating?.rating !== null && rating?.rating !== undefined) {
      return {
        method: rating.method,
        confidence: rating.confidence,
        calculationVersion: rating.calculationVersion,
      };
    }
  }
  return { method: null, confidence: null, calculationVersion: null };
}

function speedRatingForRaceCode(
  raceCode: HistoricalRaceCode,
  run: HistoricalCandidateRun,
): JumpSpeedRating | AwSpeedRating | TurfSpeedRating | null | undefined {
  if (raceCode === "jump") {
    return run.jumpSpeedRating;
  }
  if (raceCode === "aw") {
    return run.awSpeedRating;
  }
  if (raceCode === "turf") {
    return run.turfSpeedRating;
  }
  return null;
}

function performanceFieldsForRaceCode(
  raceCode: HistoricalRaceCode,
  priorRuns: HistoricalCandidateRun[],
): {
  latest: number | null;
  previous: number | null;
  bestLast3: number | null;
  bestLast5: number | null;
  averageLast3: number | null;
  averageLast5: number | null;
  calculationVersion: string | null;
} {
  const sortedRuns = priorRuns
    .filter(
      (run) =>
        run.resultStatus !== "non_runner" &&
        (run.resultStatus !== null || run.finishingPosition !== null),
    )
    .sort((a, b) => b.raceDateTime.getTime() - a.raceDateTime.getTime());
  const performances = sortedRuns.map((run) =>
    calculatePerformanceForRun(raceCode, run),
  );
  const ratings = performances
    .map((performance) => performance?.performanceRating ?? null)
    .filter((rating): rating is number => rating !== null);
  const last3 = performances
    .slice(0, 3)
    .map((performance) => performance?.performanceRating ?? null)
    .filter((rating): rating is number => rating !== null);
  const last5 = performances
    .slice(0, 5)
    .map((performance) => performance?.performanceRating ?? null)
    .filter((rating): rating is number => rating !== null);

  return {
    latest: ratings[0] ?? null,
    previous: ratings[1] ?? null,
    bestLast3: max(last3),
    bestLast5: max(last5),
    averageLast3: average(last3),
    averageLast5: average(last5),
    calculationVersion:
      performances.find((performance) => performance !== null)
        ?.calculationVersion ?? null,
  };
}

function calculatePerformanceForRun(
  raceCode: HistoricalRaceCode,
  run: HistoricalCandidateRun,
): WeightAdjustedPerformance | null {
  return calculateWeightAdjustedPerformance({
    rawSpeedRating: speedRatingForRaceCode(raceCode, run)?.rating ?? null,
    weightCarriedLb: run.weightCarriedLbs ?? null,
  });
}

function todaysRatingFieldsForRaceCode(
  raceCode: HistoricalRaceCode,
  priorRuns: HistoricalCandidateRun[],
  currentWeightCarriedLb: number | null,
): {
  latest: number | null;
  previous: number | null;
  bestLast3: number | null;
  bestLast5: number | null;
  averageLast3: number | null;
  averageLast5: number | null;
  calculationVersion: string | null;
} {
  const sortedRuns = priorRuns
    .filter(
      (run) =>
        run.resultStatus !== "non_runner" &&
        (run.resultStatus !== null || run.finishingPosition !== null),
    )
    .sort((a, b) => b.raceDateTime.getTime() - a.raceDateTime.getTime());
  const ratings = sortedRuns.map((run) =>
    calculateTodaysRating({
      historicalPerformanceRating:
        calculatePerformanceForRun(raceCode, run)?.performanceRating ?? null,
      currentWeightCarriedLb,
    }),
  );
  const values = ratings
    .map((rating) => rating?.todaysRating ?? null)
    .filter((rating): rating is number => rating !== null);
  const last3 = ratings
    .slice(0, 3)
    .map((rating) => rating?.todaysRating ?? null)
    .filter((rating): rating is number => rating !== null);
  const last5 = ratings
    .slice(0, 5)
    .map((rating) => rating?.todaysRating ?? null)
    .filter((rating): rating is number => rating !== null);

  return {
    latest: values[0] ?? null,
    previous: values[1] ?? null,
    bestLast3: max(last3),
    bestLast5: max(last5),
    averageLast3: average(last3),
    averageLast5: average(last5),
    calculationVersion:
      ratings.find((rating) => rating !== null)?.calculationVersion ?? null,
  };
}

function max(values: number[]): number | null {
  return values.length ? Math.max(...values) : null;
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function previousOfficialRating(
  priorRuns: HistoricalCandidateRun[],
  beforeDateTime: Date,
): number | null {
  const values = priorRuns
    .filter(
      (run) =>
        run.resultStatus !== "non_runner" &&
        (run.resultStatus !== null || run.finishingPosition !== null) &&
        run.raceDateTime < beforeDateTime,
    )
    .sort((a, b) => b.raceDateTime.getTime() - a.raceDateTime.getTime())
    .map((run) => run.officialRating)
    .filter((value): value is number => value !== null);
  return values[1] ?? null;
}

function surfaceSql() {
  return sql<string | null>`${sourceImports.payload} #>> '{props,pageProps,race,race_summary,course_surface,surface}'`;
}

function sourceImportJoinCondition(source: string) {
  return and(
    eq(sourceImports.source, source),
    eq(sourceImports.sourceId, races.sourceId),
    eq(sourceImports.sourceType, RESULT_SOURCE_TYPE),
  )!;
}

function hasRaceDateTime<T extends { raceDateTime: Date | null }>(
  row: T,
): row is T & { raceDateTime: Date } {
  return row.raceDateTime !== null;
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}
