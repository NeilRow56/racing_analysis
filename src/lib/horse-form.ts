import { and, desc, eq, sql } from "drizzle-orm";
import { createDbConnection } from "@/db";
import {
  courses,
  horses,
  jockeys,
  raceRunners,
  races,
  trainers,
} from "@/db/schema";

type Db = ReturnType<typeof createDbConnection>["db"];

export type HorseFormRun = {
  runnerId: string;
  raceDate: string;
  scheduledTime: string | null;
  courseName: string;
  raceTitle: string | null;
  raceTypeCode: string | null;
  raceClass: string | null;
  distance: string | null;
  going: string | null;
  finishingPosition: number | null;
  resultStatus: string | null;
  outcomeCode: string | null;
  runnerCount: number | null;
  carriedWeight: string | null;
  draw: number | null;
  startingPrice: string | null;
  officialRating: number | null;
  racingPostRating: number | null;
  topspeedRating: number | null;
  runnerComment: string | null;
  jockeyName: string | null;
  trainerName: string | null;
};

export type HorseForm = {
  horse: {
    id: string;
    displayName: string;
    source: string | null;
    sourceId: string | null;
  };
  runs: HorseFormRun[];
};

export async function getHorseForm(
  db: Db,
  horseId: string,
): Promise<HorseForm | null> {
  const [horse] = await db
    .select({
      id: horses.id,
      displayName: horses.displayName,
      source: horses.source,
      sourceId: horses.sourceId,
    })
    .from(horses)
    .where(eq(horses.id, horseId))
    .limit(1);

  if (!horse) {
    return null;
  }

  const runs = await db
    .select({
      runnerId: raceRunners.id,
      raceDate: races.raceDate,
      scheduledTime: races.scheduledTime,
      courseName: courses.displayName,
      raceTitle: races.raceName,
      raceTypeCode: races.raceTypeCode,
      raceClass: races.raceClass,
      distance: races.distance,
      going: races.going,
      finishingPosition: raceRunners.finishingPosition,
      resultStatus: raceRunners.resultStatus,
      outcomeCode: raceRunners.outcomeCode,
      runnerCount: races.actualRunnerCount,
      carriedWeight: raceRunners.weight,
      draw: raceRunners.draw,
      startingPrice: raceRunners.startingPrice,
      officialRating: raceRunners.officialRating,
      racingPostRating: raceRunners.racingPostRating,
      topspeedRating: raceRunners.topspeedRating,
      runnerComment: raceRunners.runnerComment,
      jockeyName: jockeys.displayName,
      trainerName: trainers.displayName,
    })
    .from(raceRunners)
    .innerJoin(races, eq(raceRunners.raceId, races.id))
    .innerJoin(courses, eq(races.courseId, courses.id))
    .leftJoin(jockeys, eq(raceRunners.jockeyId, jockeys.id))
    .leftJoin(trainers, eq(raceRunners.trainerId, trainers.id))
    .where(and(eq(raceRunners.horseId, horse.id)))
    .orderBy(
      desc(races.raceDate),
      desc(races.scheduledTime),
      desc(sql<string>`coalesce(${races.sourceId}, '')`),
    );

  return { horse, runs };
}

export type HorseFormSummary = {
  runs: number;
  wins: number;
  places: number;
  winPercent: number | null;
  latestRpr: number | null;
  previousRpr: number | null;
  bestRpr: number | null;
  averageRpr: number | null;
  latestTs: number | null;
  previousTs: number | null;
  bestTs: number | null;
  averageTs: number | null;
  latestOr: number | null;
};

export function summarizeHorseForm(runs: HorseFormRun[]): HorseFormSummary {
  const rprValues = runs
    .map((run) => run.racingPostRating)
    .filter((rating): rating is number => rating !== null);
  const tsValues = runs
    .map((run) => run.topspeedRating)
    .filter((rating): rating is number => rating !== null);

  return {
    runs: runs.length,
    wins: runs.filter((run) => run.finishingPosition === 1).length,
    places: runs.filter(
      (run) =>
        run.finishingPosition !== null &&
        run.finishingPosition >= 1 &&
        run.finishingPosition <= 3,
    ).length,
    winPercent: runs.length
      ? (runs.filter((run) => run.finishingPosition === 1).length /
          runs.length) *
        100
      : null,
    latestRpr: latestRating(runs, "racingPostRating"),
    previousRpr: previousRating(runs, "racingPostRating"),
    bestRpr: maxRating(rprValues),
    averageRpr: averageRating(rprValues),
    latestTs: latestRating(runs, "topspeedRating"),
    previousTs: previousRating(runs, "topspeedRating"),
    bestTs: maxRating(tsValues),
    averageTs: averageRating(tsValues),
    latestOr: latestRating(runs, "officialRating"),
  };
}

function latestRating(
  runs: HorseFormRun[],
  field: "officialRating" | "racingPostRating" | "topspeedRating",
): number | null {
  return runs.find((run) => run[field] !== null)?.[field] ?? null;
}

function previousRating(
  runs: HorseFormRun[],
  field: "racingPostRating" | "topspeedRating",
): number | null {
  const ratings = runs
    .map((run) => run[field])
    .filter((rating): rating is number => rating !== null);
  return ratings[1] ?? null;
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
