import { and, eq, inArray, lt, ne, or, isNull } from "drizzle-orm";
import { createDbConnection } from "@/db";
import { courses, raceRunners, races } from "@/db/schema";
import {
  classifyCurrentRaceFamily,
  type CurrentRaceFamily,
} from "./current-race-classification";

type Db = ReturnType<typeof createDbConnection>["db"];

export const GOING_FORM_TERMS = [
  "firm",
  "good",
  "soft",
  "yielding",
  "heavy",
] as const;

export type GoingFormTerm = (typeof GOING_FORM_TERMS)[number];

export type GoingForm = Record<GoingFormTerm, boolean> & {
  firmCount: number;
  goodCount: number;
  softCount: number;
  yieldingCount: number;
  heavyCount: number;
};

export type GoingFormTarget = {
  targetRunnerId: string;
  targetRaceId: string;
  horseId: string;
  raceDateTime: Date;
  raceFamily: CurrentRaceFamily;
};

export type GoingFormHistoricalRun = {
  raceId: string;
  horseId: string;
  raceDateTime: Date;
  finishingPosition: number | null;
  resultStatus: string | null;
  going: string | null;
  raceName: string | null;
  raceType: string | null;
  raceTypeCode: string | null;
  courseName: string | null;
  courseSourceId: string | null;
};

const GOING_TERM_PATTERN = /\b(firm|good|soft|yielding|heavy)\b/gi;

export function parseGoingTerms(going: string | null | undefined): GoingFormTerm[] {
  if (!going) return [];

  return [...new Set(
    [...going.matchAll(GOING_TERM_PATTERN)].map(
      (match) => match[1]!.toLowerCase() as GoingFormTerm,
    ),
  )];
}

export function calculateGoingFormForTargets(
  targets: GoingFormTarget[],
  runs: GoingFormHistoricalRun[],
): Map<string, GoingForm> {
  const runsByHorseId = Map.groupBy(runs, (run) => run.horseId);

  return new Map(targets.map((target) => {
    const counts = emptyGoingFormCounts();

    if (target.raceFamily === "turf_flat" || target.raceFamily === "jump") {
      for (const run of runsByHorseId.get(target.horseId) ?? []) {
        if (
          run.raceId === target.targetRaceId ||
          run.raceDateTime >= target.raceDateTime ||
          run.resultStatus === "non_runner" ||
          (run.finishingPosition !== 1 && run.finishingPosition !== 2) ||
          historicalRaceFamily(run) !== target.raceFamily
        ) {
          continue;
        }

        for (const term of parseGoingTerms(run.going)) {
          counts[`${term}Count`] += 1;
        }
      }
    }

    return [target.targetRunnerId, goingFormFromCounts(counts)];
  }));
}

export async function getGoingFormForTargets(
  db: Db,
  targets: GoingFormTarget[],
  source: string,
): Promise<Map<string, GoingForm>> {
  const eligibleTargets = targets.filter(
    (target) => target.raceFamily === "turf_flat" || target.raceFamily === "jump",
  );
  const horseIds = [...new Set(eligibleTargets.map((target) => target.horseId))];
  if (horseIds.length === 0) return new Map();

  const latestTargetDateTime = eligibleTargets.reduce(
    (latest, target) => target.raceDateTime > latest ? target.raceDateTime : latest,
    eligibleTargets[0]!.raceDateTime,
  );
  const rows = await db
    .select({
      raceId: races.id,
      horseId: raceRunners.horseId,
      raceDateTime: races.raceDatetime,
      finishingPosition: raceRunners.finishingPosition,
      resultStatus: raceRunners.resultStatus,
      going: races.going,
      raceName: races.raceName,
      raceType: races.raceType,
      raceTypeCode: races.raceTypeCode,
      courseName: courses.displayName,
      courseSourceId: courses.sourceId,
    })
    .from(raceRunners)
    .innerJoin(races, eq(raceRunners.raceId, races.id))
    .innerJoin(courses, eq(races.courseId, courses.id))
    .where(and(
      inArray(raceRunners.horseId, horseIds),
      eq(raceRunners.source, source),
      eq(races.source, source),
      inArray(raceRunners.finishingPosition, [1, 2]),
      or(isNull(raceRunners.resultStatus), ne(raceRunners.resultStatus, "non_runner")),
      lt(races.raceDatetime, latestTargetDateTime),
    ));

  const historicalRuns = rows.filter(
    (row): row is typeof row & { raceDateTime: Date } => row.raceDateTime !== null,
  );
  return calculateGoingFormForTargets(eligibleTargets, historicalRuns);
}

function historicalRaceFamily(run: GoingFormHistoricalRun): CurrentRaceFamily {
  return classifyCurrentRaceFamily({
    raceName: run.raceName,
    raceType: run.raceType,
    raceTypeCode: run.raceTypeCode,
    courseName: run.courseName,
    courseSourceId: run.courseSourceId,
    going: run.going,
  });
}

function emptyGoingFormCounts() {
  return {
    firmCount: 0,
    goodCount: 0,
    softCount: 0,
    yieldingCount: 0,
    heavyCount: 0,
  };
}

function goingFormFromCounts(counts: ReturnType<typeof emptyGoingFormCounts>): GoingForm {
  return {
    firm: counts.firmCount > 0,
    good: counts.goodCount > 0,
    soft: counts.softCount > 0,
    yielding: counts.yieldingCount > 0,
    heavy: counts.heavyCount > 0,
    ...counts,
  };
}
