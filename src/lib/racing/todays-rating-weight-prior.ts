import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import type { createDbConnection } from "@/db";
import { courses, raceRunners, races, sourceImports } from "@/db/schema";
import { isVoidBetResultStatus } from "./backtest";
import { isOrdinaryFlatTurfRace } from "./turf-speed-rating";
import { getTurfSpeedRatingsAsOfRuns } from "./turf-speed-ratings";
import { calculateWeightAdjustedPerformance } from "./weight-performance";
import type { PriorTurfPerformance } from "./todays-rating-weight-forward";
import type { TodayMeeting } from "./todays-racing";

export async function loadTodaysRatingWeightPriors(db: ReturnType<typeof createDbConnection>["db"], meetings: TodayMeeting[], now = new Date()) {
  const targets = meetings.flatMap((meeting) => meeting.races.flatMap((race) => race.raceDateTime && race.raceDateTime > now
    ? race.runners.filter((runner) => !isVoidBetResultStatus(runner.resultStatus)).map((runner) => ({ runnerId: runner.runnerId, horseId: runner.horseId, off: race.raceDateTime! })) : []));
  const horseIds = [...new Set(targets.map((target) => target.horseId))];
  const result = new Map<string, PriorTurfPerformance>();
  if (!horseIds.length) return result;
  const rows = await db.select({ runnerId: raceRunners.id, horseId: raceRunners.horseId, raceDateTime: races.raceDatetime,
    weightCarriedLbs: raceRunners.weightCarriedLbs, finishingPosition: raceRunners.finishingPosition, resultStatus: raceRunners.resultStatus,
    raceName: races.raceName, raceType: races.raceType, raceTypeCode: races.raceTypeCode, courseName: courses.displayName,
    going: races.going, surface: sql<string | null>`${sourceImports.payload} #>> '{props,pageProps,race,race_summary,course_surface,surface}'` })
    .from(raceRunners).innerJoin(races, eq(raceRunners.raceId, races.id)).innerJoin(courses, eq(races.courseId, courses.id))
    .leftJoin(sourceImports, and(eq(sourceImports.source, "sporting_life"), eq(sourceImports.sourceId, races.sourceId), eq(sourceImports.sourceType, "full-result-next-data")))
    .where(and(eq(races.source, "sporting_life"), eq(raceRunners.source, "sporting_life"), inArray(raceRunners.horseId, horseIds),
      lt(races.raceDatetime, now), sql`${races.winningTime} is not null and btrim(${races.winningTime}) <> ''`))
    .orderBy(desc(races.raceDatetime));
  const usableCandidates = rows.filter((run) => run.raceDateTime && run.weightCarriedLbs !== null && run.weightCarriedLbs > 0 &&
    !isVoidBetResultStatus(run.resultStatus) && (run.finishingPosition !== null || run.resultStatus !== null) && isOrdinaryFlatTurfRace(run));
  const ratings = await getTurfSpeedRatingsAsOfRuns(db, usableCandidates.map((run) => run.runnerId));
  for (const target of targets) {
    const prior = usableCandidates.find((run) => run.horseId === target.horseId && run.raceDateTime! < target.off &&
      calculateWeightAdjustedPerformance({ rawSpeedRating: ratings.get(run.runnerId)?.rating ?? null, weightCarriedLb: run.weightCarriedLbs }) !== null);
    if (prior) result.set(target.runnerId, { runnerId: prior.runnerId, raceDateTime: prior.raceDateTime!.toISOString(),
      weightCarriedLbs: prior.weightCarriedLbs!, speed: ratings.get(prior.runnerId)!.rating! });
  }
  return result;
}
