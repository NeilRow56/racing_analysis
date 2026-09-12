import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { and, asc, eq, gte, lte, or, sql, type SQL } from "drizzle-orm";
import { createDbConnection } from "@/db";
import { courses, raceRunners, races, sourceImports } from "@/db/schema";
import {
  AW_SPEED_RATING_CALCULATION_VERSION,
} from "./aw-speed-rating";
import {
  BACKTEST_FEATURE_SOURCE_VERSION,
  getHistoricalTargetRunnerMetrics,
  type HistoricalPostRaceOutcome,
  type HistoricalPreRaceFeatureRow,
  type HistoricalRaceCode,
  type HistoricalTargetRunnerMetricsRow,
} from "./historical-target-metrics";
import { JUMP_SPEED_RATING_CALCULATION_VERSION } from "./jump-speed-rating";
import { TURF_SPEED_RATING_CALCULATION_VERSION } from "./turf-speed-rating";
import { TODAYS_RATING_CALCULATION_VERSION } from "./todays-rating";
import { WEIGHT_PERFORMANCE_CALCULATION_VERSION } from "./weight-performance";
import type { BacktestRaceSegment } from "./backtest";

type Db = ReturnType<typeof createDbConnection>["db"];

export const BACKTEST_FEATURE_CACHE_VERSION = "backtest_features_v3";
export const DEFAULT_BACKTEST_CACHE_DIR = "data/research/backtest-cache";
export const DEFAULT_CACHE_BUILD_BATCH_SIZE = 5_000;

export type BacktestCacheFamily = BacktestRaceSegment | "all";

export type BacktestFeatureCacheManifest = {
  featureSchemaVersion: typeof BACKTEST_FEATURE_CACHE_VERSION;
  sourceFeatureVersion: typeof BACKTEST_FEATURE_SOURCE_VERSION;
  source: string;
  from: string;
  to: string;
  family: BacktestCacheFamily;
  generatedAt: string;
  rowCount: number;
  featuresFile: string;
  outcomesFile: string;
  calculationVersions: {
    jumpSpeed: typeof JUMP_SPEED_RATING_CALCULATION_VERSION;
    awSpeed: typeof AW_SPEED_RATING_CALCULATION_VERSION;
    turfSpeed: typeof TURF_SPEED_RATING_CALCULATION_VERSION;
    weightPerformance: typeof WEIGHT_PERFORMANCE_CALCULATION_VERSION;
    todaysRating: typeof TODAYS_RATING_CALCULATION_VERSION;
  };
};

export type BuildBacktestFeatureCacheResult = {
  manifest: BacktestFeatureCacheManifest;
  directory: string;
  elapsedMs: number;
  sizeBytes: number;
  timings: BacktestCacheBuildTimings;
  counts: BacktestCacheBuildCounts;
  heapUsedMb: number | null;
};

export type BacktestCacheBuildTimings = {
  loadTargetRunnerIdsMs: number;
  buildFeatureRowsMs: number;
  sortAndFilterRowsMs: number;
  writeCacheMs: number;
};

export type BacktestCacheBuildCounts = {
  targetRunnerIds: number;
  featureRows: number;
  featureBatches: number;
};

export type LoadedBacktestFeatureCache = {
  manifest: BacktestFeatureCacheManifest;
  rows: HistoricalTargetRunnerMetricsRow[];
  directory: string;
  actualCoverage: BacktestFeatureCacheActualCoverage | null;
};

export type BacktestFeatureCacheActualCoverage = {
  actualFrom: string;
  actualTo: string;
};

const DEFAULT_SOURCE = "sporting_life";
const FEATURES_FILE = "features.ndjson";
const OUTCOMES_FILE = "outcomes.ndjson";
const MANIFEST_FILE = "manifest.json";

export async function buildBacktestFeatureCache(input: {
  db: Db;
  from: string;
  to: string;
  family: BacktestCacheFamily;
  source?: string;
  outputDir?: string;
  batchSize?: number;
  onProgress?: (message: string) => void;
}): Promise<BuildBacktestFeatureCacheResult> {
  const startedAt = performance.now();
  const timings: BacktestCacheBuildTimings = {
    loadTargetRunnerIdsMs: 0,
    buildFeatureRowsMs: 0,
    sortAndFilterRowsMs: 0,
    writeCacheMs: 0,
  };
  const source = input.source ?? DEFAULT_SOURCE;
  const targetStart = performance.now();
  input.onProgress?.("loading target runners");
  const targetRunnerIds = await loadTargetRunnerIds(input.db, {
    source,
    from: input.from,
    to: input.to,
    family: input.family,
  });
  timings.loadTargetRunnerIdsMs = performance.now() - targetStart;
  input.onProgress?.(`loaded ${targetRunnerIds.length} target runners`);

  const featureStart = performance.now();
  input.onProgress?.("building backtest-safe feature rows");
  const allRows: HistoricalTargetRunnerMetricsRow[] = [];
  const featureBatches = featureTargetBatches(
    targetRunnerIds,
    input.batchSize ?? DEFAULT_CACHE_BUILD_BATCH_SIZE,
  );
  let processedTargets = 0;
  for (const [batchIndex, chunk] of featureBatches.entries()) {
    allRows.push(
      ...(await getHistoricalTargetRunnerMetrics(input.db, {
        source,
        targetRunnerIds: chunk,
        ratingFamily: ratingFamilyForCacheFamily(input.family),
      })),
    );
    processedTargets += chunk.length;
    if (featureBatches.length > 1) {
      input.onProgress?.(
        `built features for ${processedTargets}/${targetRunnerIds.length} targets ` +
          `(${batchIndex + 1}/${featureBatches.length} batches)`,
      );
    }
  }
  timings.buildFeatureRowsMs = performance.now() - featureStart;

  const sortStart = performance.now();
  const rows = sortRows(filterRowsForFamily(allRows, input.family));
  timings.sortAndFilterRowsMs = performance.now() - sortStart;

  const directory = cacheDirectory({
    outputDir: input.outputDir,
    from: input.from,
    to: input.to,
    family: input.family,
    source,
  });
  const tempDirectory = `${directory}.tmp-${process.pid}-${Date.now()}`;
  const writeStart = performance.now();
  input.onProgress?.(`writing ${rows.length} feature rows`);
  await mkdir(tempDirectory, { recursive: true });
  await writeFile(
    join(tempDirectory, FEATURES_FILE),
    rows.map((row) => `${JSON.stringify(serializeFeature(row.features))}\n`).join(""),
    "utf8",
  );
  await writeFile(
    join(tempDirectory, OUTCOMES_FILE),
    rows.map((row) => `${JSON.stringify(row.outcome)}\n`).join(""),
    "utf8",
  );

  const manifest: BacktestFeatureCacheManifest = {
    featureSchemaVersion: BACKTEST_FEATURE_CACHE_VERSION,
    sourceFeatureVersion: BACKTEST_FEATURE_SOURCE_VERSION,
    source,
    from: input.from,
    to: input.to,
    family: input.family,
    generatedAt: new Date().toISOString(),
    rowCount: rows.length,
    featuresFile: FEATURES_FILE,
    outcomesFile: OUTCOMES_FILE,
    calculationVersions: calculationVersions(),
  };
  await writeFile(join(tempDirectory, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await replaceDirectory(tempDirectory, directory);
  timings.writeCacheMs = performance.now() - writeStart;
  const sizeBytes = await directorySize(directory);
  input.onProgress?.("cache write complete");
  return {
    manifest,
    directory,
    elapsedMs: performance.now() - startedAt,
    sizeBytes,
    timings,
    counts: {
      targetRunnerIds: targetRunnerIds.length,
      featureRows: rows.length,
      featureBatches: featureBatches.length,
    },
    heapUsedMb: heapUsedMb(),
  };
}

export async function loadBacktestFeatureCache(input: {
  from: string;
  to: string;
  family: BacktestCacheFamily;
  source?: string;
  outputDir?: string;
}): Promise<LoadedBacktestFeatureCache | null> {
  const source = input.source ?? DEFAULT_SOURCE;
  const directory = cacheDirectory({ ...input, source });
  const manifest = await readManifest(directory);
  if (!manifest || !isCompatibleManifest(manifest, input)) {
    return null;
  }

  const [featuresText, outcomesText] = await Promise.all([
    readFile(join(directory, manifest.featuresFile), "utf8"),
    readFile(join(directory, manifest.outcomesFile), "utf8"),
  ]);
  const features = parseNdjson<SerializedHistoricalPreRaceFeatureRow>(featuresText)
    .map(deserializeFeature);
  const outcomes = parseNdjson<HistoricalPostRaceOutcome>(outcomesText);
  if (features.length !== outcomes.length || features.length !== manifest.rowCount) {
    return null;
  }

  const rows = features.map((feature, index) => ({
    features: feature,
    outcome: outcomes[index]!,
  }));

  return {
    manifest,
    rows,
    directory,
    actualCoverage: actualCoverageForRows(rows),
  };
}

export async function loadLatestBacktestFeatureCacheForYear(input: {
  year: string;
  family: BacktestCacheFamily;
  source?: string;
  outputDir?: string;
}): Promise<LoadedBacktestFeatureCache | null> {
  const source = input.source ?? DEFAULT_SOURCE;
  const root = input.outputDir ?? DEFAULT_BACKTEST_CACHE_DIR;
  const from = `${input.year}-01-01`;
  const toLimit = `${input.year}-12-31`;
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    return null;
  }

  const manifests = await Promise.all(
    entries.map(async (entry) => {
      const manifest = await readManifest(join(root, entry));
      if (!manifest) return null;
      if (manifest.from !== from || manifest.to > toLimit) return null;
      if (!isCompatibleManifest(manifest, {
        from: manifest.from,
        to: manifest.to,
        family: input.family,
        source,
      })) {
        return null;
      }
      return manifest;
    }),
  );
  const latest = manifests
    .filter((manifest): manifest is BacktestFeatureCacheManifest => manifest !== null)
    .sort((left, right) => right.to.localeCompare(left.to))[0];
  if (!latest) {
    return null;
  }

  return loadBacktestFeatureCache({
    from: latest.from,
    to: latest.to,
    family: input.family,
    source,
    outputDir: input.outputDir,
  });
}

export function isCompatibleManifest(
  manifest: BacktestFeatureCacheManifest,
  input: {
    from: string;
    to: string;
    family: BacktestCacheFamily;
    source?: string;
  },
): boolean {
  return manifest.featureSchemaVersion === BACKTEST_FEATURE_CACHE_VERSION &&
    manifest.sourceFeatureVersion === BACKTEST_FEATURE_SOURCE_VERSION &&
    manifest.from === input.from &&
    manifest.to === input.to &&
    manifest.family === input.family &&
    manifest.source === (input.source ?? DEFAULT_SOURCE) &&
    JSON.stringify(manifest.calculationVersions) === JSON.stringify(calculationVersions());
}

export function cacheDirectory(input: {
  outputDir?: string;
  from: string;
  to: string;
  family: BacktestCacheFamily;
  source: string;
}): string {
  const root = input.outputDir ?? DEFAULT_BACKTEST_CACHE_DIR;
  return join(
    root,
    `${BACKTEST_FEATURE_CACHE_VERSION}-${input.source}-${input.family}-${input.from}-${input.to}`,
  );
}

export function rowsFromCachedParts(input: {
  features: HistoricalPreRaceFeatureRow[];
  outcomes: HistoricalPostRaceOutcome[];
}): HistoricalTargetRunnerMetricsRow[] {
  return input.features.map((features, index) => ({
    features,
    outcome: input.outcomes[index]!,
  }));
}

export function featureTargetBatches<T>(
  targetRunnerIds: T[],
  batchSize = DEFAULT_CACHE_BUILD_BATCH_SIZE,
): T[][] {
  return chunks(targetRunnerIds, Math.max(1, batchSize));
}

export function actualCoverageForRows(
  rows: HistoricalTargetRunnerMetricsRow[],
): BacktestFeatureCacheActualCoverage | null {
  const dates = rows
    .map((row) => row.features.raceDate)
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort();
  const actualFrom = dates[0];
  const actualTo = dates.at(-1);
  return actualFrom && actualTo ? { actualFrom, actualTo } : null;
}

type SerializedHistoricalPreRaceFeatureRow =
  Omit<HistoricalPreRaceFeatureRow, "raceDateTime"> & { raceDateTime: string };

function serializeFeature(
  feature: HistoricalPreRaceFeatureRow,
): SerializedHistoricalPreRaceFeatureRow {
  return {
    ...feature,
    raceDateTime: feature.raceDateTime.toISOString(),
  };
}

function deserializeFeature(
  feature: SerializedHistoricalPreRaceFeatureRow,
): HistoricalPreRaceFeatureRow {
  return {
    ...feature,
    raceDateTime: new Date(feature.raceDateTime),
  };
}

function filterRowsForFamily(
  rows: HistoricalTargetRunnerMetricsRow[],
  family: BacktestCacheFamily,
): HistoricalTargetRunnerMetricsRow[] {
  if (family === "all") {
    return rows;
  }
  const raceCode = family === "all_weather_flat" ? "aw" : family === "turf_flat" ? "turf" : "jump";
  return rows.filter((row) => row.features.raceCode === raceCode);
}

function sortRows(rows: HistoricalTargetRunnerMetricsRow[]): HistoricalTargetRunnerMetricsRow[] {
  return [...rows].sort(
    (left, right) =>
      left.features.raceDateTime.getTime() - right.features.raceDateTime.getTime() ||
      left.features.targetRaceId.localeCompare(right.features.targetRaceId) ||
      left.features.targetRunnerId.localeCompare(right.features.targetRunnerId),
  );
}

function parseNdjson<T>(text: string): T[] {
  return text
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T);
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function ratingFamilyForCacheFamily(family: BacktestCacheFamily): HistoricalRaceCode | "all" {
  if (family === "jump") {
    return "jump";
  }
  if (family === "all_weather_flat") {
    return "aw";
  }
  if (family === "turf_flat") {
    return "turf";
  }
  return "all";
}

async function replaceDirectory(tempDirectory: string, directory: string): Promise<void> {
  const previousDirectory = `${directory}.previous-${process.pid}-${Date.now()}`;
  let movedExisting = false;
  try {
    await rename(directory, previousDirectory);
    movedExisting = true;
  } catch {
    // No existing complete cache to preserve.
  }

  try {
    await rename(tempDirectory, directory);
  } catch (error) {
    if (movedExisting) {
      await rename(previousDirectory, directory);
    }
    throw error;
  }

  if (movedExisting) {
    await rm(previousDirectory, { recursive: true, force: true });
  }
}

async function readManifest(directory: string): Promise<BacktestFeatureCacheManifest | null> {
  try {
    return JSON.parse(await readFile(join(directory, MANIFEST_FILE), "utf8")) as BacktestFeatureCacheManifest;
  } catch {
    return null;
  }
}

async function directorySize(directory: string): Promise<number> {
  const files = [MANIFEST_FILE, FEATURES_FILE, OUTCOMES_FILE];
  const stats = await Promise.all(files.map((file) => stat(join(directory, file))));
  return stats.reduce((total, item) => total + item.size, 0);
}

function calculationVersions(): BacktestFeatureCacheManifest["calculationVersions"] {
  return {
    jumpSpeed: JUMP_SPEED_RATING_CALCULATION_VERSION,
    awSpeed: AW_SPEED_RATING_CALCULATION_VERSION,
    turfSpeed: TURF_SPEED_RATING_CALCULATION_VERSION,
    weightPerformance: WEIGHT_PERFORMANCE_CALCULATION_VERSION,
    todaysRating: TODAYS_RATING_CALCULATION_VERSION,
  };
}

function heapUsedMb(): number | null {
  if (typeof process.memoryUsage !== "function") {
    return null;
  }
  return Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 10) / 10;
}

async function loadTargetRunnerIds(
  db: Db,
  input: {
    source: string;
    from: string;
    to: string;
    family: BacktestCacheFamily;
  },
): Promise<string[]> {
  const familyCondition = targetFamilyCondition(input.family);
  const rows = await db
    .select({ runnerId: raceRunners.id })
    .from(raceRunners)
    .innerJoin(races, eq(raceRunners.raceId, races.id))
    .innerJoin(courses, eq(races.courseId, courses.id))
    .leftJoin(
      sourceImports,
      and(
        eq(sourceImports.source, input.source),
        eq(sourceImports.sourceId, races.sourceId),
        eq(sourceImports.sourceType, "full-result-next-data"),
      ),
    )
    .where(
      and(
        eq(raceRunners.source, input.source),
        eq(races.source, input.source),
        gte(races.raceDate, input.from),
        lte(races.raceDate, input.to),
        familyCondition,
      ),
    )
    .orderBy(asc(races.raceDate), asc(races.scheduledTime), asc(raceRunners.id));
  return rows.map((row) => row.runnerId);
}

function targetFamilyCondition(family: BacktestCacheFamily): SQL | undefined {
  if (family === "all") {
    return undefined;
  }
  const courseName = sql`lower(${courses.displayName})`;
  const going = sql`lower(coalesce(${races.going}, ''))`;
  const raceText = sql`lower(coalesce(${races.raceName}, '') || ' ' || coalesce(${races.raceType}, '') || ' ' || coalesce(${races.raceTypeCode}, ''))`;
  const jumpText = or(
    sql`${raceText} like '%hurdle%'`,
    sql`${raceText} like '%chase%'`,
    sql`${raceText} like '%national hunt%'`,
    sql`${raceText} like '%nh flat%'`,
    sql`${raceText} like '%bumper%'`,
  )!;

  if (family === "jump") {
    return jumpText;
  }

  if (family === "all_weather_flat") {
    return and(
      sql`${going} like 'standard%'`,
      or(
        sql`${courseName} in ('chelmsford city', 'dundalk', 'kempton', 'lingfield')`,
        sql`${courseName} in ('newcastle', 'southwell', 'wolverhampton')`,
      ),
      sql`not (${jumpText})`,
    )!;
  }

  const surface = sql`upper(coalesce(${sourceImports.payload} #>> '{props,pageProps,race,race_summary,course_surface,surface}', ''))`;
  return and(
    sql`${surface} = 'TURF'`,
    sql`not (${jumpText})`,
    sql`${raceText} not like '% i.n.h.%'`,
    sql`${raceText} not like '% inh %'`,
    sql`${raceText} not like '%flat race%'`,
  )!;
}
