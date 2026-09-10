import { and, eq, inArray, lte, or, sql } from "drizzle-orm";
import { createDbConnection } from "@/db";
import { raceRunners, races } from "@/db/schema";
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

type RaceContextData = {
  standardContexts: RaceContextRow[];
  deviationRaceIds: Set<string>;
};

const QUERY_CHUNK_SIZE = 5_000;
const CONTEXT_KEY_CHUNK_SIZE = 200;

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
  const targets = (
    await Promise.all(
      chunks(uniqueRunnerIds, QUERY_CHUNK_SIZE).map((runnerIdChunk) =>
        db
          .select({
            runnerId: raceRunners.id,
            raceId: races.id,
            source: raceRunners.source,
            sourceId: races.sourceId,
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
              inArray(raceRunners.id, runnerIdChunk),
              eq(raceRunners.source, source),
              eq(races.source, source),
            ),
          ),
      ),
    )
  ).flat();

  if (targets.length === 0) {
    return new Map();
  }

  const context = await loadRaceContextForTargets(
    db,
    source,
    targets,
    options.calculationCutoffDateTime,
  );
  const deviations = raceDeviations(
    context.standardContexts,
    context.deviationRaceIds,
  );
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

async function loadRaceContextForTargets(
  db: Db,
  source: string,
  targets: RaceContextRow[],
  calculationCutoffDateTime: Date | null | undefined,
): Promise<RaceContextData> {
  const cutoff = calculationCutoffDateTime ?? latestRaceDateTime(targets);
  const targetStandardKeys = standardKeysFor(targets);
  const targetSameDayKeys = sameDayKeysFor(targets);
  const [standardContexts, sameDayContexts] = await Promise.all([
    loadRaceContextsForStandardKeys(db, source, targetStandardKeys, cutoff),
    loadRaceContextsForSameDayKeys(db, source, targetSameDayKeys, cutoff),
  ]);
  const loaded = uniqueRaceContexts([
    ...targets,
    ...standardContexts,
    ...sameDayContexts,
  ]);
  const loadedStandardKeys = standardKeysFor(loaded);
  const peerStandardKeys = withoutExistingStandardKeys(
    standardKeysFor(sameDayContexts),
    loadedStandardKeys,
  );

  if (peerStandardKeys.length === 0) {
    return {
      standardContexts: loaded,
      deviationRaceIds: new Set(
        [...targets, ...sameDayContexts].map((row) => row.raceId),
      ),
    };
  }

  return {
    standardContexts: uniqueRaceContexts([
      ...loaded,
      ...(await loadRaceContextsForStandardKeys(
        db,
        source,
        peerStandardKeys,
        cutoff,
      )),
    ]),
    deviationRaceIds: new Set(
      [...targets, ...sameDayContexts].map((row) => row.raceId),
    ),
  };
}

async function loadRaceContextsForStandardKeys(
  db: Db,
  source: string,
  keys: StandardContextKey[],
  calculationCutoffDateTime: Date | null,
): Promise<RaceContextRow[]> {
  if (keys.length === 0) {
    return [];
  }

  const rows = await Promise.all(
    chunks(keys, CONTEXT_KEY_CHUNK_SIZE).map((keyChunk) =>
      db
        .select(raceContextSelection)
        .from(races)
        .where(
          and(
            eq(races.source, source),
            completedTimingCondition(),
            jumpRaceCondition(),
            cutoffCondition(calculationCutoffDateTime),
            or(...keyChunk.map(standardKeyCondition)),
          ),
        )
        .orderBy(
          races.raceDate,
          races.scheduledTime,
          sql`coalesce(${races.sourceId}, '')`,
        ),
    ),
  );

  return rows.flat();
}

async function loadRaceContextsForSameDayKeys(
  db: Db,
  source: string,
  keys: SameDayContextKey[],
  calculationCutoffDateTime: Date | null,
): Promise<RaceContextRow[]> {
  if (keys.length === 0) {
    return [];
  }

  const rows = await Promise.all(
    chunks(keys, CONTEXT_KEY_CHUNK_SIZE).map((keyChunk) =>
      db
        .select(raceContextSelection)
        .from(races)
        .where(
          and(
            eq(races.source, source),
            completedTimingCondition(),
            jumpRaceCondition(),
            cutoffCondition(calculationCutoffDateTime),
            or(...keyChunk.map(sameDayKeyCondition)),
          ),
        )
        .orderBy(
          races.raceDate,
          races.scheduledTime,
          sql`coalesce(${races.sourceId}, '')`,
        ),
    ),
  );

  return rows.flat();
}

const raceContextSelection = {
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
};

function standardKeyCondition(key: StandardContextKey) {
  return and(
    eq(races.courseId, key.courseId),
    key.distanceYards === null
      ? sql`${races.distanceYards} is null`
      : eq(races.distanceYards, key.distanceYards),
  );
}

function sameDayKeyCondition(key: SameDayContextKey) {
  return and(eq(races.raceDate, key.raceDate), eq(races.courseId, key.courseId));
}

function completedTimingCondition() {
  return sql`${races.winningTime} is not null and btrim(${races.winningTime}) <> ''`;
}

function cutoffCondition(calculationCutoffDateTime: Date | null) {
  return calculationCutoffDateTime
    ? lte(races.raceDatetime, calculationCutoffDateTime)
    : undefined;
}

function jumpRaceCondition() {
  const text = sql`lower(coalesce(${races.raceName}, '') || ' ' || coalesce(${races.raceType}, ''))`;
  return or(
    sql`${text} like '%hurdle%'`,
    sql`${text} like '%chase%'`,
    sql`${text} like '%national hunt%'`,
    sql`${text} like '%nh flat%'`,
    sql`${text} like '%bumper%'`,
  );
}

function latestRaceDateTime(rows: RaceContextRow[]): Date | null {
  const raceDateTimes = rows
    .map((row) => row.raceDateTime)
    .filter((value): value is Date => value !== null);
  if (raceDateTimes.length === 0) {
    return null;
  }
  return raceDateTimes.reduce((latest, value) => (value > latest ? value : latest));
}

type StandardContextKey = {
  courseId: string;
  distanceYards: number | null;
};

type SameDayContextKey = {
  raceDate: string;
  courseId: string;
};

function standardKeysFor(rows: RaceContextRow[]): StandardContextKey[] {
  return uniqueBy(
    rows
      .filter(isJumpRace)
      .map((row) => ({
        courseId: row.courseId,
        distanceYards: row.distanceYards,
      })),
    standardContextKey,
  );
}

function sameDayKeysFor(rows: RaceContextRow[]): SameDayContextKey[] {
  return uniqueBy(
    rows
      .filter(isJumpRace)
      .map((row) => ({
        raceDate: row.raceDate,
        courseId: row.courseId,
      })),
    sameDayContextKey,
  );
}

function withoutExistingStandardKeys(
  keys: StandardContextKey[],
  existing: StandardContextKey[],
): StandardContextKey[] {
  const existingKeys = new Set(existing.map(standardContextKey));
  return keys.filter((key) => !existingKeys.has(standardContextKey(key)));
}

function uniqueRaceContexts(rows: RaceContextRow[]): RaceContextRow[] {
  return uniqueBy(rows, (row) => row.raceId);
}

function uniqueBy<T>(values: T[], keyForValue: (value: T) => string): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const value of values) {
    const key = keyForValue(value);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(value);
  }
  return unique;
}

function standardContextKey(key: StandardContextKey): string {
  return `${key.courseId}:${key.distanceYards ?? "unknown"}`;
}

function sameDayContextKey(key: SameDayContextKey): string {
  return `${key.raceDate}:${key.courseId}`;
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
  const rows = (
    await Promise.all(
      chunks(uniqueRaceIds, QUERY_CHUNK_SIZE).map((raceIdChunk) =>
        db
          .select({
            id: raceRunners.id,
            raceId: raceRunners.raceId,
            finishingPosition: raceRunners.finishingPosition,
            resultStatus: raceRunners.resultStatus,
            beatenDistance: raceRunners.beatenDistance,
          })
          .from(raceRunners)
          .where(
            and(
              inArray(raceRunners.raceId, raceIdChunk),
              eq(raceRunners.source, source),
            ),
          )
          .orderBy(
            raceRunners.raceId,
            raceRunners.finishingPosition,
            raceRunners.sourceId,
          ),
      ),
    )
  ).flat();

  return groupBy(rows, (row) => row.raceId);
}

function raceDeviations(
  raceRows: RaceContextRow[],
  deviationRaceIds: Set<string>,
): RaceDeviation[] {
  const jumpRaces = raceRows.filter(isJumpRace);
  const standardTimesByKey = standardTimesFor(jumpRaces);
  const rows: RaceDeviation[] = [];

  for (const race of jumpRaces) {
    if (!deviationRaceIds.has(race.raceId)) {
      continue;
    }
    const winningTimeSeconds = sanityCheckWinningTime({
      winningTime: race.winningTime,
      distanceYards: race.distanceYards,
    }).usableSeconds;
    if (winningTimeSeconds === null) {
      continue;
    }
    const standard = medianStandardExcludingRace(
      standardTimesByKey.get(standardKey(race)) ?? [],
      race.raceId,
    );
    const baseStandardSeconds =
      standard.sampleSize >= 2 ? standard.medianSeconds : null;
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
      standardSampleSize: standard.sampleSize,
      deviationSecondsPerFurlong,
    });
  }

  return rows;
}

type StandardTime = {
  raceId: string;
  seconds: number;
};

function standardTimesFor(races: RaceContextRow[]): Map<string, StandardTime[]> {
  const grouped = new Map<string, StandardTime[]>();
  for (const race of races) {
    const seconds = sanityCheckWinningTime({
      winningTime: race.winningTime,
      distanceYards: race.distanceYards,
    }).usableSeconds;
    if (seconds === null) {
      continue;
    }
    const key = standardKey(race);
    const values = grouped.get(key) ?? [];
    values.push({ raceId: race.raceId, seconds });
    grouped.set(key, values);
  }
  for (const values of grouped.values()) {
    values.sort((left, right) => left.seconds - right.seconds);
  }
  return grouped;
}

function medianStandardExcludingRace(
  values: StandardTime[],
  excludedRaceId: string,
): { medianSeconds: number | null; sampleSize: number } {
  const excludedIndex = values.findIndex((value) => value.raceId === excludedRaceId);
  const sampleSize = values.length - (excludedIndex === -1 ? 0 : 1);
  if (sampleSize <= 0) {
    return { medianSeconds: null, sampleSize };
  }

  if (sampleSize % 2 === 1) {
    return {
      medianSeconds: standardValueAt(values, Math.floor(sampleSize / 2), excludedIndex),
      sampleSize,
    };
  }

  const upperIndex = sampleSize / 2;
  const lower = standardValueAt(values, upperIndex - 1, excludedIndex);
  const upper = standardValueAt(values, upperIndex, excludedIndex);
  return { medianSeconds: (lower + upper) / 2, sampleSize };
}

function standardValueAt(
  values: StandardTime[],
  index: number,
  excludedIndex: number,
): number {
  const sourceIndex =
    excludedIndex !== -1 && index >= excludedIndex ? index + 1 : index;
  return values[sourceIndex].seconds;
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

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}
