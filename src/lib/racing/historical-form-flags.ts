import { and, eq, inArray, lt } from "drizzle-orm";
import type { createDbConnection } from "@/db";
import { courses, raceRunners, races } from "@/db/schema";
import { classifyCurrentRaceFamily, type CurrentRaceClassificationInput } from "./current-race-classification";
import { classifyJumpRaceSubtype } from "./jump-speed-rating";
import { isVoidBetResultStatus } from "./backtest";

type Db = ReturnType<typeof createDbConnection>["db"];
type OrCode = "flat" | "hurdle" | "chase" | null;

export type HistoricalFormTarget = CurrentRaceClassificationInput & {
  targetRunnerId: string;
  targetRaceId: string;
  horseId: string;
  courseId: string;
  raceDateTime: Date;
  officialRating: number | null;
};

export type HistoricalFormRun = CurrentRaceClassificationInput & {
  raceId: string;
  horseId: string;
  courseId: string;
  courseName: string | null;
  courseSourceId: string | null;
  raceDateTime: Date;
  officialRating: number | null;
  finishingPosition: number | null;
  resultStatus: string | null;
};

export type HistoricalFormFlags = {
  lastWinWithin3lbOr: boolean;
  lastWinningOr: number | null;
  winningOrDifference: number | null;
  courseFirstOrSecond: boolean;
  courseWins: number;
  courseSeconds: number;
  latestCourseFinish: { position: 1 | 2; raceDateTime: string } | null;
};

// Flat ORs can cross surfaces; hurdle and chase marks are not assumed interchangeable.
function officialRatingCode(race: CurrentRaceClassificationInput): OrCode {
  const subtype = classifyJumpRaceSubtype(race);
  if (subtype === "hurdle" || subtype === "chase") return subtype;
  const family = classifyCurrentRaceFamily(race);
  return family === "turf_flat" || family === "all_weather_flat" ? "flat" : null;
}

function validOr(value: number | null): value is number {
  return value !== null && Number.isInteger(value) && value > 0;
}

export function calculateHistoricalFormFlags(
  targets: HistoricalFormTarget[],
  runs: HistoricalFormRun[],
): Map<string, HistoricalFormFlags> {
  const byHorse = Map.groupBy(runs, (run) => run.horseId);
  return new Map(targets.map((target) => {
    const flags: HistoricalFormFlags = {
      lastWinWithin3lbOr: false, lastWinningOr: null, winningOrDifference: null,
      courseFirstOrSecond: false, courseWins: 0, courseSeconds: 0, latestCourseFinish: null,
    };
    const code = officialRatingCode(target);
    let lastWin: HistoricalFormRun | undefined;
    const seenRaces = new Set<string>();
    const priorRuns = (byHorse.get(target.horseId) ?? [])
      .filter((run) => Number.isFinite(run.raceDateTime.getTime()))
      .toSorted((a, b) => b.raceDateTime.getTime() - a.raceDateTime.getTime());
    for (const run of priorRuns) {
      const position = run.finishingPosition;
      if (run.raceId === target.targetRaceId ||
          !Number.isFinite(run.raceDateTime.getTime()) ||
          !(run.raceDateTime < target.raceDateTime) ||
          isVoidBetResultStatus(run.resultStatus) ||
          (position !== 1 && position !== 2) || seenRaces.has(run.raceId)) continue;
      seenRaces.add(run.raceId);

      if (target.courseId && run.courseId === target.courseId) {
        flags.courseFirstOrSecond = true;
        if (position === 1) flags.courseWins++;
        else flags.courseSeconds++;
        const date = run.raceDateTime.toISOString();
        if (!flags.latestCourseFinish || date > flags.latestCourseFinish.raceDateTime) {
          flags.latestCourseFinish = { position, raceDateTime: date };
        }
      }
      // Select the last win before checking its mark or code; never fall back to an older win.
      if (position === 1 && !lastWin) lastWin = run;
    }
    if (lastWin && code && officialRatingCode(lastWin) === code &&
        validOr(target.officialRating) && validOr(lastWin.officialRating)) {
      flags.lastWinningOr = lastWin.officialRating;
      flags.winningOrDifference = Math.abs(target.officialRating - lastWin.officialRating);
      flags.lastWinWithin3lbOr = flags.winningOrDifference <= 3;
    }
    return [target.targetRunnerId, flags];
  }));
}

export async function getHistoricalFormFlagsForTargets(
  db: Db,
  targets: HistoricalFormTarget[],
  source: string,
): Promise<Map<string, HistoricalFormFlags>> {
  if (targets.length === 0) return new Map();
  const latest = targets.reduce((date, target) => target.raceDateTime > date ? target.raceDateTime : date, targets[0]!.raceDateTime);
  // One narrow query for the whole card, not one history lookup per runner.
  const rows = await db.select({
    raceId: races.id, horseId: raceRunners.horseId, courseId: races.courseId,
    courseName: courses.displayName, courseSourceId: courses.sourceId,
    raceDateTime: races.raceDatetime, officialRating: raceRunners.officialRating,
    finishingPosition: raceRunners.finishingPosition, resultStatus: raceRunners.resultStatus,
    raceName: races.raceName, raceType: races.raceType, raceTypeCode: races.raceTypeCode,
    going: races.going,
  }).from(raceRunners)
    .innerJoin(races, eq(raceRunners.raceId, races.id))
    .innerJoin(courses, eq(races.courseId, courses.id))
    .where(and(
    eq(raceRunners.source, source), eq(races.source, source),
    inArray(raceRunners.horseId, [...new Set(targets.map((target) => target.horseId))]),
    inArray(raceRunners.finishingPosition, [1, 2]), lt(races.raceDatetime, latest),
  ));
  return calculateHistoricalFormFlags(targets, rows.filter(
    (row): row is typeof row & { raceDateTime: Date } => row.raceDateTime !== null,
  ));
}
