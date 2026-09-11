import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  lt,
  lte,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { createDbConnection } from "@/db";
import { courses, horses, raceRunners, races } from "@/db/schema";
import { getAwSpeedRatingsForRunners } from "./aw-speed-ratings";
import { type AwSpeedRating } from "./aw-speed-rating";
import { getJumpSpeedRatingsForRunners } from "./jump-speed-ratings";
import { isJumpRace, type JumpSpeedRating } from "./jump-speed-rating";
import { getTurfSpeedRatingsForRunners } from "./turf-speed-ratings";
import { type TurfSpeedRating } from "./turf-speed-rating";
import { calculateTodaysRating } from "./todays-rating";
import { calculateWeightAdjustedPerformance } from "./weight-performance";

type Db = ReturnType<typeof createDbConnection>["db"];

export type HistoricalRunInput = {
  source?: string | null;
  runnerId?: string;
  horseId: string;
  raceDateTime: Date;
  raceDate: string;
  raceName?: string | null;
  raceType?: string | null;
  courseId: string;
  courseName?: string;
  distanceYards: number | null;
  going: string | null;
  finishingPosition: number | null;
  resultStatus: string | null;
  racingPostRating: number | null;
  topspeedRating: number | null;
  officialRating: number | null;
  weightCarriedLbs?: number | null;
  jumpSpeedRating?: JumpSpeedRating | null;
  awSpeedRating?: AwSpeedRating | null;
  turfSpeedRating?: TurfSpeedRating | null;
};

export type HorseMetricsContext = {
  targetCourseId?: string | null;
  targetDistanceYards?: number | null;
  targetGoing?: string | null;
  targetWeightCarriedLbs?: number | null;
};

export type HorseMetricsAsOf = {
  priorRuns: number;
  priorWins: number;
  priorPlaces: number;
  winPercentage: number | null;
  placePercentage: number | null;
  latestRpr: number | null;
  previousRpr: number | null;
  bestRprLast3: number | null;
  bestRprLast5: number | null;
  averageRprLast3: number | null;
  averageRprLast5: number | null;
  latestTs: number | null;
  previousTs: number | null;
  bestTsLast3: number | null;
  bestTsLast5: number | null;
  averageTsLast3: number | null;
  averageTsLast5: number | null;
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
  latestPerformanceRating: number | null;
  previousPerformanceRating: number | null;
  bestPerformanceLast3: number | null;
  bestPerformanceLast5: number | null;
  averagePerformanceLast3: number | null;
  averagePerformanceLast5: number | null;
  latestTodaysRating: number | null;
  previousTodaysRating: number | null;
  bestTodaysRatingLast3: number | null;
  bestTodaysRatingLast5: number | null;
  averageTodaysRatingLast3: number | null;
  averageTodaysRatingLast5: number | null;
  todaysRatingCalculationVersion: string | null;
  latestJumpTodaysRating: number | null;
  latestAwTodaysRating: number | null;
  latestTurfTodaysRating: number | null;
  latestOr: number | null;
  latestRprMinusPreviousRpr: number | null;
  latestTsMinusPreviousTs: number | null;
  latestRprMinusLatestOr: number | null;
  latestRunDate: string | null;
  daysSinceLastRun: number | null;
  runsAtCourse: number | null;
  winsAtCourse: number | null;
  placesAtCourse: number | null;
  runsAtExactDistance: number | null;
  winsAtExactDistance: number | null;
  placesAtExactDistance: number | null;
  runsOnGoing: number | null;
  winsOnGoing: number | null;
  placesOnGoing: number | null;
};

export type TargetRunnerMetrics = {
  target: {
    source?: string | null;
    runnerId: string;
    horseId: string;
    horseName: string;
    raceDateTime: Date;
    raceDate: string;
    scheduledTime: string | null;
    courseId: string;
  courseName: string;
  raceName: string | null;
  raceType: string | null;
  distanceYards: number | null;
  going: string | null;
  weightCarriedLbs: number | null;
  };
  metrics: HorseMetricsAsOf;
};

export async function getHorseMetricsAsOf({
  db,
  horseId,
  beforeDateTime,
  targetCourseId,
  targetDistanceYards,
  targetGoing,
  targetWeightCarriedLbs,
}: {
  db: Db;
  horseId: string;
  beforeDateTime: Date;
} & HorseMetricsContext): Promise<HorseMetricsAsOf> {
  const priorRuns = await db
    .select({
      horseId: raceRunners.horseId,
      runnerId: raceRunners.id,
      raceDateTime: races.raceDatetime,
      raceDate: races.raceDate,
      raceName: races.raceName,
      raceType: races.raceType,
      courseId: races.courseId,
      courseName: courses.displayName,
      distanceYards: races.distanceYards,
      going: races.going,
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
    .where(and(eq(raceRunners.horseId, horseId), lt(races.raceDatetime, beforeDateTime)))
    .orderBy(desc(races.raceDatetime));

  const timedPriorRuns = priorRuns.filter(hasRaceDateTime);
  const jumpSpeedRatings = await getJumpSpeedRatingsForRunners(
    db,
    timedPriorRuns.map((run) => run.runnerId),
    { calculationCutoffDateTime: beforeDateTime },
  );
  const awSpeedRatings = await getAwSpeedRatingsForRunners(
    db,
    timedPriorRuns.map((run) => run.runnerId),
    { calculationCutoffDateTime: beforeDateTime },
  );
  const turfSpeedRatings = await getTurfSpeedRatingsForRunners(
    db,
    timedPriorRuns.map((run) => run.runnerId),
    { calculationCutoffDateTime: beforeDateTime },
  );

  return calculateHorseMetricsAsOf({
    runs: timedPriorRuns.map((run) => ({
      ...run,
      jumpSpeedRating: jumpSpeedRatings.get(run.runnerId) ?? null,
      awSpeedRating: awSpeedRatings.get(run.runnerId) ?? null,
      turfSpeedRating: turfSpeedRatings.get(run.runnerId) ?? null,
    })),
    beforeDateTime,
    targetCourseId,
    targetDistanceYards,
    targetGoing,
    targetWeightCarriedLbs,
  });
}

export async function getTargetRunnerMetricsForDate(
  db: Db,
  targetDate: string,
  source = "racing-post",
  options: {
    includeNonRunnerTargets?: boolean;
    completedPriorRunsOnly?: boolean;
  } = {},
): Promise<TargetRunnerMetrics[]> {
  const targetConditions = [
    eq(races.source, source),
    eq(raceRunners.source, source),
    eq(races.raceDate, targetDate),
  ];
  if (!options.includeNonRunnerTargets) {
    targetConditions.push(isRunnableResultStatus());
  }

  const targets = await db
    .select({
      source: raceRunners.source,
      runnerId: raceRunners.id,
      horseId: raceRunners.horseId,
      horseName: horses.displayName,
      raceDateTime: races.raceDatetime,
      raceDate: races.raceDate,
      scheduledTime: races.scheduledTime,
      courseId: races.courseId,
      courseName: courses.displayName,
      raceName: races.raceName,
      raceType: races.raceType,
      distanceYards: races.distanceYards,
      going: races.going,
      weightCarriedLbs: raceRunners.weightCarriedLbs,
    })
    .from(raceRunners)
    .innerJoin(races, eq(raceRunners.raceId, races.id))
    .innerJoin(courses, eq(races.courseId, courses.id))
    .innerJoin(horses, eq(raceRunners.horseId, horses.id))
    .where(
      and(...targetConditions),
    )
    .orderBy(asc(races.scheduledTime), asc(courses.displayName), asc(horses.displayName));

  const horseIds = [...new Set(targets.map((target) => target.horseId))];
  if (horseIds.length === 0) {
    return [];
  }

  const timedTargets = targets.filter(hasTargetRaceDateTime);
  if (timedTargets.length === 0) {
    return [];
  }

  const latestTargetDateTime = timedTargets.reduce(
    (latest, target) =>
      target.raceDateTime > latest ? target.raceDateTime : latest,
    timedTargets[0].raceDateTime,
  );

  const candidateConditions = [
    inArray(raceRunners.horseId, horseIds),
    eq(races.source, source),
    eq(raceRunners.source, source),
    isRunnableResultStatus(),
    lte(races.raceDatetime, latestTargetDateTime),
  ];
  if (options.completedPriorRunsOnly) {
    candidateConditions.push(sql`${races.winningTime} is not null and btrim(${races.winningTime}) <> ''`);
  }

  const candidateRuns = await db
    .select({
      source: raceRunners.source,
      runnerId: raceRunners.id,
      horseId: raceRunners.horseId,
      raceDateTime: races.raceDatetime,
      raceDate: races.raceDate,
      raceName: races.raceName,
      raceType: races.raceType,
      courseId: races.courseId,
      courseName: courses.displayName,
      distanceYards: races.distanceYards,
      going: races.going,
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
    .where(
      and(...candidateConditions),
    )
    .orderBy(desc(races.raceDatetime));

  const timedCandidateRuns = candidateRuns.filter(hasRaceDateTime);
  const timedJumpCandidateRuns = timedCandidateRuns.filter(isJumpRace);
  const jumpSpeedRatings = await getJumpSpeedRatingsForRunners(
    db,
    timedJumpCandidateRuns.map((run) => run.runnerId),
    { source, calculationCutoffDateTime: latestTargetDateTime },
  );
  const awSpeedRatings = await getAwSpeedRatingsForRunners(
    db,
    timedCandidateRuns.map((run) => run.runnerId),
    { source, calculationCutoffDateTime: latestTargetDateTime },
  );
  const turfSpeedRatings = await getTurfSpeedRatingsForRunners(
    db,
    timedCandidateRuns.map((run) => run.runnerId),
    { source, calculationCutoffDateTime: latestTargetDateTime },
  );

  return calculateTargetRunnerMetrics({
    candidateRuns: timedCandidateRuns.map((run) => ({
      ...run,
      jumpSpeedRating: jumpSpeedRatings.get(run.runnerId) ?? null,
      awSpeedRating: awSpeedRatings.get(run.runnerId) ?? null,
      turfSpeedRating: turfSpeedRatings.get(run.runnerId) ?? null,
    })),
    targets: timedTargets,
  });
}

export function calculateTargetRunnerMetrics({
  candidateRuns,
  targets,
}: {
  candidateRuns: HistoricalRunInput[];
  targets: TargetRunnerMetrics["target"][];
}): TargetRunnerMetrics[] {
  const runsByHorse = new Map<string, HistoricalRunInput[]>();
  for (const run of candidateRuns) {
    const runs = runsByHorse.get(run.horseId) ?? [];
    runs.push(run);
    runsByHorse.set(run.horseId, runs);
  }

  return targets.map((target) => ({
    target,
    metrics: calculateHorseMetricsAsOf({
      runs: runsByHorse
        .get(target.horseId)
        ?.filter((run) => run.source === undefined || run.source === target.source) ?? [],
      beforeDateTime: target.raceDateTime,
      targetCourseId: target.courseId,
      targetDistanceYards: target.distanceYards,
      targetGoing: target.going,
      targetWeightCarriedLbs: target.weightCarriedLbs,
    }),
  }));
}

export function calculateHorseMetricsAsOf({
  runs,
  beforeDateTime,
  targetCourseId,
  targetDistanceYards,
  targetGoing,
  targetWeightCarriedLbs,
}: {
  runs: HistoricalRunInput[];
  beforeDateTime: Date;
} & HorseMetricsContext): HorseMetricsAsOf {
  const priorRuns = runs
    .filter(
      (run) =>
        run.resultStatus !== "non_runner" &&
        (run.resultStatus !== null || run.finishingPosition !== null) &&
        run.raceDateTime < beforeDateTime,
    )
    .sort((a, b) => b.raceDateTime.getTime() - a.raceDateTime.getTime());
  const rprValues = priorRuns
    .map((run) => run.racingPostRating)
    .filter((rating): rating is number => rating !== null);
  const tsValues = priorRuns
    .map((run) => run.topspeedRating)
    .filter((rating): rating is number => rating !== null);
  const rprValuesLast3 = ratingValues(
    priorRuns.slice(0, 3),
    "racingPostRating",
  );
  const rprValuesLast5 = ratingValues(
    priorRuns.slice(0, 5),
    "racingPostRating",
  );
  const tsValuesLast3 = ratingValues(priorRuns.slice(0, 3), "topspeedRating");
  const tsValuesLast5 = ratingValues(priorRuns.slice(0, 5), "topspeedRating");
  const jumpSpeedValues = jumpSpeedRatingValues(priorRuns);
  const jumpSpeedValuesLast3 = jumpSpeedRatingValues(priorRuns.slice(0, 3));
  const jumpSpeedValuesLast5 = jumpSpeedRatingValues(priorRuns.slice(0, 5));
  const awSpeedValues = awSpeedRatingValues(priorRuns);
  const awSpeedValuesLast3 = awSpeedRatingValues(priorRuns.slice(0, 3));
  const awSpeedValuesLast5 = awSpeedRatingValues(priorRuns.slice(0, 5));
  const turfSpeedValues = turfSpeedRatingValues(priorRuns);
  const turfSpeedValuesLast3 = turfSpeedRatingValues(priorRuns.slice(0, 3));
  const turfSpeedValuesLast5 = turfSpeedRatingValues(priorRuns.slice(0, 5));
  const latestRpr = rprValues[0] ?? null;
  const previousRpr = rprValues[1] ?? null;
  const latestTs = tsValues[0] ?? null;
  const previousTs = tsValues[1] ?? null;
  const latestJumpSpeedRating = jumpSpeedValues[0] ?? null;
  const previousJumpSpeedRating = jumpSpeedValues[1] ?? null;
  const latestAwSpeedRating = awSpeedValues[0] ?? null;
  const previousAwSpeedRating = awSpeedValues[1] ?? null;
  const latestTurfSpeedRating = turfSpeedValues[0] ?? null;
  const previousTurfSpeedRating = turfSpeedValues[1] ?? null;
  const performanceValues = performanceRatingValues(priorRuns);
  const performanceValuesLast3 = performanceRatingValues(priorRuns.slice(0, 3));
  const performanceValuesLast5 = performanceRatingValues(priorRuns.slice(0, 5));
  const todaysRatingValues = todaysRatingValuesFor(priorRuns, targetWeightCarriedLbs);
  const todaysRatingValuesLast3 = todaysRatingValuesFor(priorRuns.slice(0, 3), targetWeightCarriedLbs);
  const todaysRatingValuesLast5 = todaysRatingValuesFor(priorRuns.slice(0, 5), targetWeightCarriedLbs);
  const jumpTodaysRatingValues = todaysRatingValuesFor(
    priorRuns,
    targetWeightCarriedLbs,
    "jump",
  );
  const awTodaysRatingValues = todaysRatingValuesFor(
    priorRuns,
    targetWeightCarriedLbs,
    "aw",
  );
  const turfTodaysRatingValues = todaysRatingValuesFor(
    priorRuns,
    targetWeightCarriedLbs,
    "turf",
  );
  const latestPerformanceRating = performanceValues[0] ?? null;
  const previousPerformanceRating = performanceValues[1] ?? null;
  const latestTodaysRating = todaysRatingValues[0] ?? null;
  const previousTodaysRating = todaysRatingValues[1] ?? null;
  const latestOr =
    priorRuns.find((run) => run.officialRating !== null)?.officialRating ??
    null;
  const latestRun = priorRuns[0] ?? null;

  return {
    priorRuns: priorRuns.length,
    priorWins: countWins(priorRuns),
    priorPlaces: countPlaces(priorRuns),
    winPercentage: percentage(countWins(priorRuns), priorRuns.length),
    placePercentage: percentage(countPlaces(priorRuns), priorRuns.length),
    latestRpr,
    previousRpr,
    bestRprLast3: maxRating(rprValuesLast3),
    bestRprLast5: maxRating(rprValuesLast5),
    averageRprLast3: averageRating(rprValuesLast3),
    averageRprLast5: averageRating(rprValuesLast5),
    latestTs,
    previousTs,
    bestTsLast3: maxRating(tsValuesLast3),
    bestTsLast5: maxRating(tsValuesLast5),
    averageTsLast3: averageRating(tsValuesLast3),
    averageTsLast5: averageRating(tsValuesLast5),
    latestJumpSpeedRating,
    previousJumpSpeedRating,
    bestJumpSpeedLast3: maxRating(jumpSpeedValuesLast3),
    bestJumpSpeedLast5: maxRating(jumpSpeedValuesLast5),
    averageJumpSpeedLast3: averageRating(jumpSpeedValuesLast3),
    averageJumpSpeedLast5: averageRating(jumpSpeedValuesLast5),
    latestAwSpeedRating,
    previousAwSpeedRating,
    bestAwSpeedLast3: maxRating(awSpeedValuesLast3),
    bestAwSpeedLast5: maxRating(awSpeedValuesLast5),
    averageAwSpeedLast3: averageRating(awSpeedValuesLast3),
    averageAwSpeedLast5: averageRating(awSpeedValuesLast5),
    latestTurfSpeedRating,
    previousTurfSpeedRating,
    bestTurfSpeedLast3: maxRating(turfSpeedValuesLast3),
    bestTurfSpeedLast5: maxRating(turfSpeedValuesLast5),
    averageTurfSpeedLast3: averageRating(turfSpeedValuesLast3),
    averageTurfSpeedLast5: averageRating(turfSpeedValuesLast5),
    latestPerformanceRating,
    previousPerformanceRating,
    bestPerformanceLast3: maxRating(performanceValuesLast3),
    bestPerformanceLast5: maxRating(performanceValuesLast5),
    averagePerformanceLast3: averageRating(performanceValuesLast3),
    averagePerformanceLast5: averageRating(performanceValuesLast5),
    latestTodaysRating,
    previousTodaysRating,
    bestTodaysRatingLast3: maxRating(todaysRatingValuesLast3),
    bestTodaysRatingLast5: maxRating(todaysRatingValuesLast5),
    averageTodaysRatingLast3: averageRating(todaysRatingValuesLast3),
    averageTodaysRatingLast5: averageRating(todaysRatingValuesLast5),
    todaysRatingCalculationVersion:
      latestTodaysRating === null ? null : "todays_rating_v1",
    latestJumpTodaysRating: jumpTodaysRatingValues[0] ?? null,
    latestAwTodaysRating: awTodaysRatingValues[0] ?? null,
    latestTurfTodaysRating: turfTodaysRatingValues[0] ?? null,
    latestOr,
    latestRprMinusPreviousRpr: difference(latestRpr, previousRpr),
    latestTsMinusPreviousTs: difference(latestTs, previousTs),
    latestRprMinusLatestOr: difference(latestRpr, latestOr),
    latestRunDate: latestRun?.raceDate ?? null,
    daysSinceLastRun: latestRun
      ? Math.floor(
          (beforeDateTime.getTime() - latestRun.raceDateTime.getTime()) /
            86_400_000,
        )
      : null,
    ...courseRecord(priorRuns, targetCourseId),
    ...exactDistanceRecord(priorRuns, targetDistanceYards),
    ...goingRecord(priorRuns, targetGoing),
  };
}

function countWins(runs: HistoricalRunInput[]): number {
  return runs.filter((run) => run.finishingPosition === 1).length;
}

function countPlaces(runs: HistoricalRunInput[]): number {
  return runs.filter(
    (run) =>
      run.finishingPosition !== null &&
      run.finishingPosition >= 1 &&
      run.finishingPosition <= 3,
  ).length;
}

function ratingValues(
  runs: HistoricalRunInput[],
  field: "racingPostRating" | "topspeedRating",
): number[] {
  return runs
    .map((run) => run[field])
    .filter((rating): rating is number => rating !== null);
}

function jumpSpeedRatingValues(runs: HistoricalRunInput[]): number[] {
  return runs
    .map((run) => run.jumpSpeedRating?.rating ?? null)
    .filter((rating): rating is number => rating !== null);
}

function awSpeedRatingValues(runs: HistoricalRunInput[]): number[] {
  return runs
    .map((run) => run.awSpeedRating?.rating ?? null)
    .filter((rating): rating is number => rating !== null);
}

function turfSpeedRatingValues(runs: HistoricalRunInput[]): number[] {
  return runs
    .map((run) => run.turfSpeedRating?.rating ?? null)
    .filter((rating): rating is number => rating !== null);
}

function rawSpeedRatingForRun(run: HistoricalRunInput): number | null {
  return run.jumpSpeedRating?.rating ??
    run.awSpeedRating?.rating ??
    run.turfSpeedRating?.rating ??
    null;
}

function rawSpeedRatingForFamily(
  run: HistoricalRunInput,
  family: "jump" | "aw" | "turf" | undefined,
): number | null {
  if (family === "jump") {
    return run.jumpSpeedRating?.rating ?? null;
  }
  if (family === "aw") {
    return run.awSpeedRating?.rating ?? null;
  }
  if (family === "turf") {
    return run.turfSpeedRating?.rating ?? null;
  }
  return rawSpeedRatingForRun(run);
}

function performanceRatingForRun(
  run: HistoricalRunInput,
  family?: "jump" | "aw" | "turf",
): number | null {
  return calculateWeightAdjustedPerformance({
    rawSpeedRating: rawSpeedRatingForFamily(run, family),
    weightCarriedLb: run.weightCarriedLbs ?? null,
  })?.performanceRating ?? null;
}

function performanceRatingValues(runs: HistoricalRunInput[]): number[] {
  return runs
    .map((run) => performanceRatingForRun(run))
    .filter((rating): rating is number => rating !== null);
}

function todaysRatingValuesFor(
  runs: HistoricalRunInput[],
  targetWeightCarriedLbs: number | null | undefined,
  family?: "jump" | "aw" | "turf",
): number[] {
  return runs
    .map((run) =>
      calculateTodaysRating({
        historicalPerformanceRating: performanceRatingForRun(run, family),
        currentWeightCarriedLb: targetWeightCarriedLbs ?? null,
      })?.todaysRating ?? null,
    )
    .filter((rating): rating is number => rating !== null);
}

function percentage(count: number, total: number): number | null {
  return total === 0 ? null : (count / total) * 100;
}

function maxRating(values: number[]): number | null {
  return values.length ? Math.max(...values) : null;
}

function averageRating(values: number[]): number | null {
  if (!values.length) {
    return null;
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function difference(
  latest: number | null,
  comparison: number | null,
): number | null {
  if (latest === null || comparison === null) {
    return null;
  }
  return latest - comparison;
}

function courseRecord(
  priorRuns: HistoricalRunInput[],
  targetCourseId: string | null | undefined,
): Pick<HorseMetricsAsOf, "runsAtCourse" | "winsAtCourse" | "placesAtCourse"> {
  if (!targetCourseId) {
    return { runsAtCourse: null, winsAtCourse: null, placesAtCourse: null };
  }
  const matchingRuns = priorRuns.filter((run) => run.courseId === targetCourseId);
  return {
    runsAtCourse: matchingRuns.length,
    winsAtCourse: countWins(matchingRuns),
    placesAtCourse: countPlaces(matchingRuns),
  };
}

function exactDistanceRecord(
  priorRuns: HistoricalRunInput[],
  targetDistanceYards: number | null | undefined,
): Pick<
  HorseMetricsAsOf,
  "runsAtExactDistance" | "winsAtExactDistance" | "placesAtExactDistance"
> {
  if (targetDistanceYards === null || targetDistanceYards === undefined) {
    return {
      runsAtExactDistance: null,
      winsAtExactDistance: null,
      placesAtExactDistance: null,
    };
  }
  const matchingRuns = priorRuns.filter(
    (run) => run.distanceYards === targetDistanceYards,
  );
  return {
    runsAtExactDistance: matchingRuns.length,
    winsAtExactDistance: countWins(matchingRuns),
    placesAtExactDistance: countPlaces(matchingRuns),
  };
}

function goingRecord(
  priorRuns: HistoricalRunInput[],
  targetGoing: string | null | undefined,
): Pick<HorseMetricsAsOf, "runsOnGoing" | "winsOnGoing" | "placesOnGoing"> {
  if (!targetGoing) {
    return { runsOnGoing: null, winsOnGoing: null, placesOnGoing: null };
  }
  const matchingRuns = priorRuns.filter((run) => run.going === targetGoing);
  return {
    runsOnGoing: matchingRuns.length,
    winsOnGoing: countWins(matchingRuns),
    placesOnGoing: countPlaces(matchingRuns),
  };
}

function hasRaceDateTime<T extends { raceDateTime: Date | null }>(
  run: T,
): run is T & { raceDateTime: Date } {
  return run.raceDateTime !== null;
}

function hasTargetRaceDateTime<T extends { raceDateTime: Date | null }>(
  target: T,
): target is T & { raceDateTime: Date } {
  return target.raceDateTime !== null;
}

export function isRunnableResultStatus(): SQL {
  return or(
    isNull(raceRunners.resultStatus),
    ne(raceRunners.resultStatus, "non_runner"),
  )!;
}
