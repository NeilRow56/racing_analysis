import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { createDbConnection } from "@/db";
import { courses, raceRunners, races } from "@/db/schema";
import {
  calculateJumpSpeedRating,
  isJumpRace,
  type JumpSpeedRating,
} from "./jump-speed-rating";
import {
  deviationPerFurlong,
  median,
  reconstructCumulativeBeatenLengths,
  sanityCheckWinningTime,
  standardDeviation,
} from "./speed-research";

type Db = ReturnType<typeof createDbConnection>["db"];

type RaceContextRow = {
  raceId: string;
  source: string | null;
  sourceId: string | null;
  raceDate: string;
  raceDateTime: Date | null;
  courseId: string;
  distanceYards: number | null;
  winningTime: string | null;
  raceName: string | null;
  raceType: string | null;
};

type RunnerMarginRow = {
  id: string;
  raceId: string;
  finishingPosition: number | null;
  resultStatus: string | null;
  beatenDistance: string | null;
};

type RaceDeviation = RaceContextRow & {
  winningTimeSeconds: number;
  baseStandardSeconds: number;
  standardSampleSize: number;
  deviationSecondsPerFurlong: number;
};

export async function getJumpSpeedRatingsForRunners(
  db: Db,
  runnerIds: string[],
  options: {
    source?: string;
    calculationCutoffDateTime?: Date | null;
  } = {},
): Promise<Map<string, JumpSpeedRating>> {
  const uniqueRunnerIds = [...new Set(runnerIds)];
  if (uniqueRunnerIds.length === 0) {
    return new Map();
  }

  const source = options.source ?? "sporting_life";
  const targets = await db
    .select({
      runnerId: raceRunners.id,
      raceId: races.id,
      source: raceRunners.source,
      raceDate: races.raceDate,
      raceDateTime: races.raceDatetime,
      courseId: races.courseId,
      distanceYards: races.distanceYards,
      winningTime: races.winningTime,
      raceName: races.raceName,
      raceType: races.raceType,
    })
    .from(raceRunners)
    .innerJoin(races, eq(raceRunners.raceId, races.id))
    .where(
      and(
        inArray(raceRunners.id, uniqueRunnerIds),
        eq(raceRunners.source, source),
        eq(races.source, source),
      ),
    );

  if (targets.length === 0) {
    return new Map();
  }

  const contextRaces = await loadRaceContext(db, source, options.calculationCutoffDateTime);
  const deviations = raceDeviations(contextRaces);
  const deviationByRaceId = new Map(deviations.map((row) => [row.raceId, row]));
  const marginsByRaceId = await loadRunnerMargins(db, targets.map((target) => target.raceId), source);
  const cumulativeByRunnerId = cumulativeMargins(marginsByRaceId);
  const sameDayGroups = groupBy(deviations, sameDayKey);
  const ratings = new Map<string, JumpSpeedRating>();

  for (const target of targets) {
    const deviation = deviationByRaceId.get(target.raceId);
    const sameDay = deviation ? sameDayAdjustmentFor(deviation, sameDayGroups) : null;
    ratings.set(
      target.runnerId,
      calculateJumpSpeedRating({
        raceName: target.raceName,
        raceType: target.raceType,
        distanceYards: target.distanceYards,
        winningTime: target.winningTime,
        baseStandardSeconds: deviation?.baseStandardSeconds ?? null,
        standardSampleSize: deviation?.standardSampleSize ?? null,
        cumulativeBeatenLengths:
          cumulativeByRunnerId.get(target.runnerId)?.cumulativeBeatenLengths ?? null,
        sameDayAdjustmentSecondsPerFurlong: sameDay?.adjustmentSecondsPerFurlong ?? null,
        sameDayPeerCount: sameDay?.peerCount ?? null,
        sameDayStdevSecondsPerFurlong: sameDay?.stdevSecondsPerFurlong ?? null,
      }),
    );
  }

  return ratings;
}

async function loadRaceContext(
  db: Db,
  source: string,
  calculationCutoffDateTime: Date | null | undefined,
): Promise<RaceContextRow[]> {
  const conditions = [eq(races.source, source)];
  if (calculationCutoffDateTime) {
    conditions.push(lte(races.raceDatetime, calculationCutoffDateTime));
  }

  return db
    .select({
      raceId: races.id,
      source: races.source,
      sourceId: races.sourceId,
      raceDate: races.raceDate,
      raceDateTime: races.raceDatetime,
      courseId: races.courseId,
      distanceYards: races.distanceYards,
      winningTime: races.winningTime,
      raceName: races.raceName,
      raceType: races.raceType,
    })
    .from(races)
    .innerJoin(courses, eq(races.courseId, courses.id))
    .where(and(...conditions))
    .orderBy(races.raceDate, races.scheduledTime, sql`coalesce(${races.sourceId}, '')`);
}

async function loadRunnerMargins(
  db: Db,
  raceIds: string[],
  source: string,
): Promise<Map<string, RunnerMarginRow[]>> {
  const uniqueRaceIds = [...new Set(raceIds)];
  if (uniqueRaceIds.length === 0) {
    return new Map();
  }
  const rows = await db
    .select({
      id: raceRunners.id,
      raceId: raceRunners.raceId,
      finishingPosition: raceRunners.finishingPosition,
      resultStatus: raceRunners.resultStatus,
      beatenDistance: raceRunners.beatenDistance,
    })
    .from(raceRunners)
    .where(and(inArray(raceRunners.raceId, uniqueRaceIds), eq(raceRunners.source, source)))
    .orderBy(raceRunners.raceId, raceRunners.finishingPosition, raceRunners.sourceId);

  return groupBy(rows, (row) => row.raceId);
}

function raceDeviations(raceRows: RaceContextRow[]): RaceDeviation[] {
  const jumpRaces = raceRows.filter(isJumpRace);
  const timesByStandardKey = groupBy(jumpRaces, standardKey);
  const rows: RaceDeviation[] = [];

  for (const race of jumpRaces) {
    const winningTimeSeconds = sanityCheckWinningTime({
      winningTime: race.winningTime,
      distanceYards: race.distanceYards,
    }).usableSeconds;
    if (winningTimeSeconds === null) {
      continue;
    }
    const comparisonTimes = (timesByStandardKey.get(standardKey(race)) ?? [])
      .filter((comparison) => comparison.raceId !== race.raceId)
      .flatMap((comparison) => {
        const seconds = sanityCheckWinningTime({
          winningTime: comparison.winningTime,
          distanceYards: comparison.distanceYards,
        }).usableSeconds;
        return seconds === null ? [] : [seconds];
      });
    const baseStandardSeconds =
      comparisonTimes.length >= 2 ? median(comparisonTimes) : null;
    const deviationSecondsPerFurlong = deviationPerFurlong({
      actualTimeSeconds: winningTimeSeconds,
      standardSeconds: baseStandardSeconds,
      distanceYards: race.distanceYards,
    });
    if (baseStandardSeconds === null || deviationSecondsPerFurlong === null) {
      continue;
    }
    rows.push({
      ...race,
      winningTimeSeconds,
      baseStandardSeconds,
      standardSampleSize: comparisonTimes.length,
      deviationSecondsPerFurlong,
    });
  }

  return rows;
}

function sameDayAdjustmentFor(
  target: RaceDeviation,
  sameDayGroups: Map<string, RaceDeviation[]>,
): {
  adjustmentSecondsPerFurlong: number;
  peerCount: number;
  stdevSecondsPerFurlong: number | null;
} | null {
  const sameDayRaces = sameDayGroups.get(sameDayKey(target)) ?? [];
  const peers = sameDayRaces.filter(
    (race) => race.raceId !== target.raceId,
  );
  const peerValues = peers.map((race) => race.deviationSecondsPerFurlong);
  if (peerValues.length < 2) {
    return null;
  }
  const adjustmentSecondsPerFurlong = median(peerValues);
  if (adjustmentSecondsPerFurlong === null) {
    return null;
  }
  return {
    adjustmentSecondsPerFurlong,
    peerCount: peerValues.length,
    stdevSecondsPerFurlong: standardDeviation(
      sameDayRaces.map((race) => race.deviationSecondsPerFurlong),
    ),
  };
}

function cumulativeMargins(
  marginsByRaceId: Map<string, RunnerMarginRow[]>,
): Map<string, { cumulativeBeatenLengths: number | null }> {
  const byRunnerId = new Map<string, { cumulativeBeatenLengths: number | null }>();
  for (const runners of marginsByRaceId.values()) {
    for (const row of reconstructCumulativeBeatenLengths(
      runners.map((runner) => ({
        id: runner.id,
        finishingPosition: runner.finishingPosition,
        resultStatus: runner.resultStatus,
        beatenDistance: runner.beatenDistance,
      })),
    )) {
      byRunnerId.set(row.id, {
        cumulativeBeatenLengths: row.cumulativeBeatenLengths,
      });
    }
  }
  return byRunnerId;
}

function standardKey(race: {
  courseId: string;
  distanceYards: number | null;
}): string {
  return `${race.courseId}:${race.distanceYards ?? "unknown"}`;
}

function sameDayKey(race: {
  raceDate: string;
  courseId: string;
}): string {
  return `${race.raceDate}:${race.courseId}`;
}

function groupBy<T>(
  rows: T[],
  keyForRow: (row: T) => string,
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyForRow(row);
    const values = grouped.get(key) ?? [];
    values.push(row);
    grouped.set(key, values);
  }
  return grouped;
}
