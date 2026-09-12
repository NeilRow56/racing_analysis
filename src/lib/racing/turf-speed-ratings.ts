import { and, eq, inArray, lte, or, sql } from "drizzle-orm";
import { createDbConnection } from "@/db";
import { raceRunners, races, sourceImports } from "@/db/schema";
import {
  calculateTurfSpeedRating,
  isOrdinaryFlatTurfRace,
  ratingForStandard,
  type TurfSpeedRating,
} from "./turf-speed-rating";
import {
  deviationPerFurlong,
  distanceYardsToFurlongs,
  median,
  reconstructCumulativeBeatenLengths,
  sanityCheckWinningTime,
  standardDeviation,
} from "./speed-research";

type Db = ReturnType<typeof createDbConnection>["db"];

type RaceContextRow = {
  runnerId?: string;
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
  raceTypeCode: string | null;
  surface: string | null;
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
  standardTimingSpreadSecondsPerFurlong: number | null;
  deviationSecondsPerFurlong: number;
};

type RaceContextData = {
  standardContexts: RaceContextRow[];
  deviationRaceIds: Set<string>;
};

const QUERY_CHUNK_SIZE = 5_000;
const CONTEXT_KEY_CHUNK_SIZE = 200;
const RESULT_SOURCE_TYPE = "full-result-next-data";
const TURF_CONTEXT_CACHE_VERSION = "turf_speed_v1_context_v1";
const TURF_CONTEXT_CACHE_MAX_ENTRIES = 24;

type TurfContextCacheKind = "standard" | "same-day";
type TurfContextCacheValue = Promise<RaceContextRow[]>;

const turfContextCache = new Map<string, TurfContextCacheValue>();

export async function getTurfSpeedRatingsForRunners(
  db: Db,
  runnerIds: string[],
  options: {
    source?: string;
    calculationCutoffDateTime?: Date | null;
  } = {},
): Promise<Map<string, TurfSpeedRating>> {
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
            raceTypeCode: races.raceTypeCode,
            surface: surfaceSql(),
          })
          .from(raceRunners)
          .innerJoin(races, eq(raceRunners.raceId, races.id))
          .innerJoin(sourceImports, sourceImportJoinCondition(source))
          .where(
            and(
              inArray(raceRunners.id, runnerIdChunk),
              eq(raceRunners.source, source),
              eq(races.source, source),
            ),
          ),
      ),
    )
  ).flat().filter(isOrdinaryFlatTurfRace);

  if (targets.length === 0) {
    return new Map();
  }

  const context = await loadRaceContextForTargets(
    db,
    source,
    targets,
    options.calculationCutoffDateTime,
  );
  const deviations = raceDeviations(context.standardContexts, context.deviationRaceIds);
  const deviationByRaceId = new Map(deviations.map((row) => [row.raceId, row]));
  const sameDayGroups = groupBy(deviations, sameDayKey);
  const marginsByRaceId = await loadRunnerMargins(
    db,
    targets.map((target) => target.raceId),
    source,
  );
  const cumulativeByRunnerId = cumulativeMargins(marginsByRaceId);
  const sourceTimingIssueByRaceId = sourceTimingIssues(deviations, sameDayGroups);
  const ratings = new Map<string, TurfSpeedRating>();

  for (const target of targets) {
    const deviation = deviationByRaceId.get(target.raceId);
    const sameDay = deviation ? sameDayAdjustmentFor(deviation, sameDayGroups) : null;
    ratings.set(
      target.runnerId ?? "",
      calculateTurfSpeedRating({
        raceName: target.raceName,
        raceType: target.raceType,
        raceTypeCode: target.raceTypeCode,
        surface: target.surface,
        distanceYards: target.distanceYards,
        winningTime: target.winningTime,
        baseStandardSeconds: deviation?.baseStandardSeconds ?? null,
        standardSampleSize: deviation?.standardSampleSize ?? null,
        standardTimingSpreadSecondsPerFurlong: deviation?.standardTimingSpreadSecondsPerFurlong ?? null,
        cumulativeBeatenLengths:
          cumulativeByRunnerId.get(target.runnerId ?? "")?.cumulativeBeatenLengths ?? null,
        sameDayAdjustmentSecondsPerFurlong: sameDay?.adjustmentSecondsPerFurlong ?? null,
        sameDayPeerCount: sameDay?.peerCount ?? null,
        sameDayStdevSecondsPerFurlong: sameDay?.stdevSecondsPerFurlong ?? null,
        sourceTimingIssue: sourceTimingIssueByRaceId.has(target.raceId),
      }),
    );
  }

  return ratings;
}

export async function getTurfSpeedRatingsAsOfRuns(
  db: Db,
  runnerIds: string[],
  options: {
    source?: string;
  } = {},
): Promise<Map<string, TurfSpeedRating>> {
  const source = options.source ?? "sporting_life";
  const runnerCutoffs = await loadRunnerRaceDateTimes(
    db,
    [...new Set(runnerIds)],
    source,
  );
  const groups = groupBy(
    runnerCutoffs.filter(hasRaceDateTime),
    (row) => String(row.raceDateTime.getTime()),
  );
  const ratings = new Map<string, TurfSpeedRating>();

  for (const group of groups.values()) {
    const cutoff = group[0]?.raceDateTime;
    if (!cutoff) {
      continue;
    }
    const groupRatings = await getTurfSpeedRatingsForRunners(
      db,
      group.map((row) => row.runnerId),
      { source, calculationCutoffDateTime: cutoff },
    );
    for (const [runnerId, rating] of groupRatings) {
      ratings.set(runnerId, rating);
    }
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
  const loaded = uniqueRaceContexts([...targets, ...standardContexts, ...sameDayContexts]);
  const loadedStandardKeys = standardKeysFor(loaded);
  const peerStandardKeys = withoutExistingStandardKeys(
    standardKeysFor(sameDayContexts),
    loadedStandardKeys,
  );

  if (peerStandardKeys.length === 0) {
    return {
      standardContexts: loaded,
      deviationRaceIds: new Set([...targets, ...sameDayContexts].map((row) => row.raceId)),
    };
  }

  return {
    standardContexts: uniqueRaceContexts([
      ...loaded,
      ...(await loadRaceContextsForStandardKeys(db, source, peerStandardKeys, cutoff)),
    ]),
    deviationRaceIds: new Set([...targets, ...sameDayContexts].map((row) => row.raceId)),
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
  return cachedTurfContextRows(
    turfContextCacheKey({
      kind: "standard",
      source,
      cutoff: calculationCutoffDateTime,
      keys: keys.map(standardContextKey),
    }),
    async () => {
      const rows = await Promise.all(
        chunks(keys, CONTEXT_KEY_CHUNK_SIZE).map((keyChunk) =>
          db
            .select(raceContextSelection)
            .from(races)
            .innerJoin(sourceImports, sourceImportJoinCondition(source))
            .where(
              and(
                eq(races.source, source),
                completedTimingCondition(),
                turfRaceCondition(),
                cutoffCondition(calculationCutoffDateTime),
                or(...keyChunk.map(standardKeyCondition)),
              ),
            )
            .orderBy(races.raceDate, races.scheduledTime, sql`coalesce(${races.sourceId}, '')`),
        ),
      );
      return rows.flat().filter(isOrdinaryFlatTurfRace);
    },
  );
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
  return cachedTurfContextRows(
    turfContextCacheKey({
      kind: "same-day",
      source,
      cutoff: calculationCutoffDateTime,
      keys: keys.map(sameDayContextKey),
    }),
    async () => {
      const rows = await Promise.all(
        chunks(keys, CONTEXT_KEY_CHUNK_SIZE).map((keyChunk) =>
          db
            .select(raceContextSelection)
            .from(races)
            .innerJoin(sourceImports, sourceImportJoinCondition(source))
            .where(
              and(
                eq(races.source, source),
                completedTimingCondition(),
                turfRaceCondition(),
                cutoffCondition(calculationCutoffDateTime),
                or(...keyChunk.map(sameDayKeyCondition)),
              ),
            )
            .orderBy(races.raceDate, races.scheduledTime, sql`coalesce(${races.sourceId}, '')`),
        ),
      );
      return rows.flat().filter(isOrdinaryFlatTurfRace);
    },
  );
}

async function cachedTurfContextRows(
  cacheKey: string,
  loadRows: () => Promise<RaceContextRow[]>,
): Promise<RaceContextRow[]> {
  const cached = turfContextCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const promise = loadRows()
    .catch((error) => {
      turfContextCache.delete(cacheKey);
      throw error;
    });
  turfContextCache.set(cacheKey, promise);
  evictOldestTurfContextCacheEntry();
  return promise;
}

function turfContextCacheKey(input: {
  kind: TurfContextCacheKind;
  source: string;
  cutoff: Date | null;
  keys: string[];
}): string {
  return JSON.stringify({
    version: TURF_CONTEXT_CACHE_VERSION,
    kind: input.kind,
    source: input.source,
    cutoff: input.cutoff?.toISOString() ?? null,
    keys: [...new Set(input.keys)].sort(),
  });
}

function evictOldestTurfContextCacheEntry() {
  if (turfContextCache.size <= TURF_CONTEXT_CACHE_MAX_ENTRIES) {
    return;
  }
  const oldestKey = turfContextCache.keys().next().value;
  if (oldestKey) {
    turfContextCache.delete(oldestKey);
  }
}

export function turfContextCacheKeyForTest(input: {
  kind: TurfContextCacheKind;
  source: string;
  cutoff: Date | null;
  keys: string[];
}): string {
  return turfContextCacheKey(input);
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
  raceTypeCode: races.raceTypeCode,
  surface: surfaceSql(),
};

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

function turfRaceCondition() {
  const surface = sql`upper(coalesce(${sourceImports.payload} #>> '{props,pageProps,race,race_summary,course_surface,surface}', ''))`;
  const text = raceTextSql();
  return and(
    sql`${surface} = 'TURF'`,
    sql`${text} not like '%hurdle%'`,
    sql`${text} not like '%chase%'`,
    sql`${text} not like '%steeplechase%'`,
    sql`${text} not like '%national hunt%'`,
    sql`${text} not like '%nh flat%'`,
    sql`${text} not like '%n.h. flat%'`,
    sql`${text} not like '%i.n.h.%'`,
    sql`${text} not like '%bumper%'`,
    sql`${text} not like '%point-to-point flat race%'`,
    sql`${text} not like '%(pro/am) flat race%'`,
    sql`${text} not like '%(ladies pro/am) flat race%'`,
    sql`${text} not like 'flat race%'`,
    sql`${text} not like '% flat race%'`,
  );
}

function raceTextSql() {
  return sql`lower(coalesce(${races.raceName}, '') || ' ' || coalesce(${races.raceType}, '') || ' ' || coalesce(${races.raceTypeCode}, ''))`;
}

function completedTimingCondition() {
  return sql`${races.winningTime} is not null and btrim(${races.winningTime}) <> ''`;
}

function cutoffCondition(calculationCutoffDateTime: Date | null) {
  return calculationCutoffDateTime
    ? lte(races.raceDatetime, calculationCutoffDateTime)
    : undefined;
}

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

function latestRaceDateTime(rows: RaceContextRow[]): Date | null {
  const values = rows.map((row) => row.raceDateTime).filter((value): value is Date => value !== null);
  return values.length ? values.reduce((latest, value) => (value > latest ? value : latest)) : null;
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
    rows.filter(isOrdinaryFlatTurfRace).map((row) => ({
      courseId: row.courseId,
      distanceYards: row.distanceYards,
    })),
    standardContextKey,
  );
}

function sameDayKeysFor(rows: RaceContextRow[]): SameDayContextKey[] {
  return uniqueBy(
    rows.filter(isOrdinaryFlatTurfRace).map((row) => ({
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
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(value);
    }
  }
  return unique;
}

function standardContextKey(key: StandardContextKey): string {
  return `${key.courseId}:${key.distanceYards ?? "unknown"}:TURF`;
}

function sameDayContextKey(key: SameDayContextKey): string {
  return `${key.raceDate}:${key.courseId}:TURF`;
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
          .where(and(inArray(raceRunners.raceId, raceIdChunk), eq(raceRunners.source, source)))
          .orderBy(raceRunners.raceId, raceRunners.finishingPosition, raceRunners.sourceId),
      ),
    )
  ).flat();
  return groupBy(rows, (row) => row.raceId);
}

function raceDeviations(
  raceRows: RaceContextRow[],
  deviationRaceIds: Set<string>,
): RaceDeviation[] {
  const turfRaces = raceRows.filter(isOrdinaryFlatTurfRace);
  const standardTimesByKey = standardTimesFor(turfRaces);
  const rows: RaceDeviation[] = [];

  for (const race of turfRaces) {
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
    const values = standardTimesByKey.get(standardKey(race)) ?? [];
    const standard = medianStandardExcludingRace(values, race.raceId);
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
      standardTimingSpreadSecondsPerFurlong: standardSpreadPerFurlong(values, race.raceId, race.distanceYards),
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
  const sample = values.filter((value) => value.raceId !== excludedRaceId).map((value) => value.seconds);
  return { medianSeconds: median(sample), sampleSize: sample.length };
}

function standardSpreadPerFurlong(
  values: StandardTime[],
  excludedRaceId: string,
  distanceYards: number | null,
): number | null {
  const furlongs = distanceYardsToFurlongs(distanceYards);
  if (furlongs === null) {
    return null;
  }
  const sample = values.filter((value) => value.raceId !== excludedRaceId).map((value) => value.seconds);
  const spread = standardDeviation(sample);
  return spread === null ? null : spread / furlongs;
}

function sameDayAdjustmentFor(
  target: RaceDeviation,
  sameDayGroups: Map<string, RaceDeviation[]>,
): {
  adjustmentSecondsPerFurlong: number;
  peerCount: number;
  stdevSecondsPerFurlong: number | null;
} | null {
  const peers = (sameDayGroups.get(sameDayKey(target)) ?? [])
    .filter((race) => race.raceId !== target.raceId);
  const peerValues = peers.map((race) => race.deviationSecondsPerFurlong);
  const adjustmentSecondsPerFurlong = median(peerValues);
  if (adjustmentSecondsPerFurlong === null) {
    return null;
  }
  return {
    adjustmentSecondsPerFurlong,
    peerCount: peerValues.length,
    stdevSecondsPerFurlong: standardDeviation(peerValues),
  };
}

function sourceTimingIssues(
  deviations: RaceDeviation[],
  sameDayGroups: Map<string, RaceDeviation[]>,
): Set<string> {
  const issues = new Set<string>();
  for (const deviation of deviations) {
    const sameDay = sameDayAdjustmentFor(deviation, sameDayGroups);
    const sameDayEligible =
      sameDay?.adjustmentSecondsPerFurlong !== null &&
      sameDay?.peerCount !== undefined &&
      sameDay.peerCount >= 3 &&
      sameDay.stdevSecondsPerFurlong !== null &&
      sameDay.stdevSecondsPerFurlong <= 0.3;
    const finalStandard = sameDayEligible
      ? deviation.baseStandardSeconds + (sameDay?.adjustmentSecondsPerFurlong ?? 0) *
          (distanceYardsToFurlongs(deviation.distanceYards) ?? 0)
      : deviation.baseStandardSeconds;
    const winnerRating = ratingForStandard({
      standardSeconds: finalStandard,
      winningTimeSeconds: deviation.winningTimeSeconds,
      cumulativeBeatenLengths: 0,
      distanceYards: deviation.distanceYards,
    }).rating;
    if (winnerRating !== null && (winnerRating < 0 || winnerRating > 200)) {
      issues.add(deviation.raceId);
    }
  }
  return issues;
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

function standardKey(race: { courseId: string; distanceYards: number | null }): string {
  return `${race.courseId}:${race.distanceYards ?? "unknown"}:TURF`;
}

function sameDayKey(race: { raceDate: string; courseId: string }): string {
  return `${race.raceDate}:${race.courseId}:TURF`;
}

function groupBy<T>(rows: T[], keyForRow: (row: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyForRow(row);
    const values = grouped.get(key) ?? [];
    values.push(row);
    grouped.set(key, values);
  }
  return grouped;
}

async function loadRunnerRaceDateTimes(
  db: Db,
  runnerIds: string[],
  source: string,
): Promise<Array<{ runnerId: string; raceDateTime: Date | null }>> {
  if (runnerIds.length === 0) {
    return [];
  }

  return (
    await Promise.all(
      chunks(runnerIds, QUERY_CHUNK_SIZE).map((runnerIdChunk) =>
        db
          .select({
            runnerId: raceRunners.id,
            raceDateTime: races.raceDatetime,
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
