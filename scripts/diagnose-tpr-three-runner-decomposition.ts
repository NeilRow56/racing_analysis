import { writeFile } from "node:fs/promises";
import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { createDbConnection } from "@/db";
import {
  courses,
  horses,
  jockeys,
  raceRunners,
  races,
  sourceImports,
  trainers,
} from "@/db/schema";
import { getHistoricalTargetRunnerMetrics, type HistoricalPreRaceFeatureRow } from "@/lib/racing/historical-target-metrics";
import { getTargetRunnerMetricsForDate, type HorseMetricsAsOf } from "@/lib/racing/horse-metrics";
import { getTodaysRacingData } from "@/lib/racing/todays-racing";
import { calculateTurfPerformanceRating, TURF_PERFORMANCE_RATING_VERSION } from "@/lib/racing/turf-performance-rating";
import { getTurfSpeedRatingsAsOfRuns } from "@/lib/racing/turf-speed-ratings";
import { isOrdinaryFlatTurfRace, type TurfSpeedRating } from "@/lib/racing/turf-speed-rating";
import { calculateTodaysRating } from "@/lib/racing/todays-rating";
import { calculateWeightAdjustedPerformance } from "@/lib/racing/weight-performance";
import { raceClassNumber } from "@/lib/racing/research-rule-classes";

const OUTPUT_PATH = "/tmp/tpr-three-runner-decomposition.md";
const SOURCE = "sporting_life";
const TARGET_DATE = "2026-09-16";

const TARGETS = [
  { horseName: "Cerro Blanco", expectedCourse: "Sandown", expectedTime: "14:30:00" },
  { horseName: "Mare Crisium", expectedCourse: "Clonmel", expectedTime: "16:05:00" },
  { horseName: "Raffles Angel", expectedCourse: "Yarmouth", expectedTime: "16:15:00" },
] as const;

const CERRO_RIVALS = new Set([
  "Cerro Blanco",
  "Centigrade",
  "Room Service",
  "Pacific Mission",
  "Crown Of Oaks",
]);

const B3_WEIGHTS: [number, number, number] = [0.6, 0.25, 0.15];
const EQUAL_WEIGHTS: [number, number, number] = [1, 1, 1];
const RPR_MEDIAN_2025 = 59.73279656117335;
const RPR_IQR_2025 = 15.303501885173738;
const SPEED_MEDIAN_2025 = 96.81426514225745;
const SPEED_IQR_2025 = 13.71148109158355;
const CLASS_OFFSETS_2025: Record<string, number> = {
  "Class 1": 0.40728372695748705,
  "Class 2": 0.21081366080149383,
  "Class 3": 0.15923801805811594,
  "Class 4": 0.012261721350936047,
  "Class 5": -0.07957322921317331,
  "Class 6": -0.197767969260115,
  unknown: -0.05486729600240039,
};
const WEIGHT_COEFFICIENT_RAW_POINTS_PER_LB = 0.1216065319677862;
const TPR_DEVELOPMENT_MEAN = -0.103;
const TPR_DEVELOPMENT_STDEV = 1.223;

type Db = ReturnType<typeof createDbConnection>["db"];

type RaceRunnerRow = {
  raceId: string;
  raceSourceId: string | null;
  runnerId: string;
  runnerSourceId: string | null;
  horseId: string;
  horseName: string;
  raceDate: string;
  raceDateTime: Date;
  scheduledTime: string | null;
  courseName: string;
  raceName: string | null;
  raceClass: string | null;
  raceType: string | null;
  raceTypeCode: string | null;
  distance: string | null;
  distanceYards: number | null;
  going: string | null;
  surface: string | null;
  declaredRunnerCount: number | null;
  actualRunnerCount: number | null;
  trainerId: string | null;
  trainerName: string | null;
  jockeyId: string | null;
  jockeyName: string | null;
  officialRating: number | null;
  weight: string | null;
  weightCarriedLbs: number | null;
  finishingPosition: number | null;
  resultStatus: string | null;
  runnerComment: string | null;
};

type PriorRunRow = {
  runnerId: string;
  runnerSourceId: string | null;
  raceId: string;
  raceSourceId: string | null;
  raceDate: string;
  raceDateTime: Date;
  courseName: string;
  raceName: string | null;
  raceClass: string | null;
  raceType: string | null;
  raceTypeCode: string | null;
  distance: string | null;
  distanceYards: number | null;
  going: string | null;
  surface: string | null;
  weightCarriedLbs: number | null;
  officialRating: number | null;
  racingPostRating: number | null;
  topspeedRating: number | null;
  finishingPosition: number | null;
  resultStatus: string | null;
  runnerComment: string | null;
};

type Decomposition = {
  rating: number | null;
  rawRating: number | null;
  historyDepth: number;
  performanceValues: Array<number | null>;
  speedValues: Array<number | null>;
  performanceWeighted: number | null;
  speedWeighted: number | null;
  performanceRobust: number | null;
  speedRobust: number | null;
  base: number | null;
  classOffset: number;
  classAdjusted: number | null;
  weightDiff: number | null;
  weightAdjustment: number | null;
  finalPreScaleRaw: number | null;
};

type RunnerAnalysis = {
  row: RaceRunnerRow;
  features: HistoricalPreRaceFeatureRow;
  metrics: HorseMetricsAsOf | null;
  tpr: Decomposition;
  productionTpr: number | null;
  productionHistoryDepth: number | null;
  productionRank: number | null;
  productionGap: number | null;
  ranks: {
    latestSpeed: number | null;
    bestL3: number | null;
    performanceComponent: number | null;
    afterClass: number | null;
    afterWeight: number | null;
    final: number | null;
  };
};

function round(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return value.toFixed(digits);
}

function value(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function reconstructedLast3Values(latest: number | null, previous: number | null, averageLast3: number | null): Array<number | null> {
  const values: Array<number | null> = [latest, previous];
  if (latest !== null && previous !== null && averageLast3 !== null) {
    values.push((averageLast3 * 3) - latest - previous);
  }
  return values;
}

function weightedRecentLevel(values: Array<number | null>, weights: [number, number, number] = B3_WEIGHTS): number | null {
  const available = values
    .slice(0, 3)
    .map((entry, index) => ({ value: entry, weight: weights[index]! }))
    .filter((entry): entry is { value: number; weight: number } =>
      entry.value !== null && Number.isFinite(entry.value),
    );
  if (available.length === 0) return null;
  const weightTotal = available.reduce((total, entry) => total + entry.weight, 0);
  return available.reduce((total, entry) => total + entry.value * (entry.weight / weightTotal), 0);
}

function robustScore(metric: number | null, median: number, iqr: number): number | null {
  if (metric === null) return null;
  return (metric - median) / iqr;
}

function classOffset(raceClass: string | null): number {
  const classNumber = raceClassNumber(raceClass);
  return CLASS_OFFSETS_2025[classNumber === null ? "unknown" : `Class ${classNumber}`] ?? 0;
}

function toRating(rawRating: number | null): number | null {
  if (rawRating === null) return null;
  return 100 + (10 * ((rawRating - TPR_DEVELOPMENT_MEAN) / TPR_DEVELOPMENT_STDEV));
}

function decomposeTpr(
  features: Pick<HistoricalPreRaceFeatureRow,
    "latestPerformanceRating" |
    "previousPerformanceRating" |
    "averagePerformanceLast3" |
    "latestTurfSpeedRating" |
    "previousTurfSpeedRating" |
    "averageTurfSpeedLast3" |
    "raceClass" |
    "weightCarriedLbs"
  >,
  raceMedianWeight: number | null,
  weights: [number, number, number] = B3_WEIGHTS,
  options: { includeClass?: boolean; includeWeight?: boolean } = {},
): Decomposition {
  const includeClass = options.includeClass ?? true;
  const includeWeight = options.includeWeight ?? true;
  const performanceValues = reconstructedLast3Values(
    features.latestPerformanceRating,
    features.previousPerformanceRating,
    features.averagePerformanceLast3,
  );
  const speedValues = reconstructedLast3Values(
    features.latestTurfSpeedRating,
    features.previousTurfSpeedRating,
    features.averageTurfSpeedLast3,
  );
  const performanceWeighted = weightedRecentLevel(performanceValues, weights);
  const speedWeighted = weightedRecentLevel(speedValues, weights);
  const historyDepth = Math.min(countNumbers(performanceValues), countNumbers(speedValues));
  const performanceRobust = robustScore(performanceWeighted, RPR_MEDIAN_2025, RPR_IQR_2025);
  const speedRobust = robustScore(speedWeighted, SPEED_MEDIAN_2025, SPEED_IQR_2025);
  const base = performanceRobust === null || speedRobust === null ? null : (performanceRobust + speedRobust) / 2;
  const offset = includeClass ? classOffset(features.raceClass) : 0;
  const classAdjusted = base === null ? null : base - offset;
  const weightDiff = features.weightCarriedLbs === null || raceMedianWeight === null
    ? null
    : features.weightCarriedLbs - raceMedianWeight;
  const weightAdjustment = weightDiff === null || !includeWeight ? null : WEIGHT_COEFFICIENT_RAW_POINTS_PER_LB * weightDiff;
  const finalPreScaleRaw = classAdjusted === null || historyDepth === 0 || weightDiff === null
    ? null
    : classAdjusted + (includeWeight ? weightAdjustment ?? 0 : 0);

  return {
    rating: toRating(finalPreScaleRaw),
    rawRating: finalPreScaleRaw,
    historyDepth,
    performanceValues,
    speedValues,
    performanceWeighted,
    speedWeighted,
    performanceRobust,
    speedRobust,
    base,
    classOffset: offset,
    classAdjusted,
    weightDiff,
    weightAdjustment,
    finalPreScaleRaw,
  };
}

function countNumbers(values: Array<number | null>): number {
  return values.filter((entry) => entry !== null && Number.isFinite(entry)).length;
}

function rankBy<T>(rows: T[], getValue: (row: T) => number | null, id: (row: T) => string): Map<string, number> {
  const ranked = rows
    .map((row) => ({ row, id: id(row), value: getValue(row) }))
    .filter((entry): entry is { row: T; id: string; value: number } =>
      entry.value !== null && Number.isFinite(entry.value),
    )
    .sort((left, right) => right.value - left.value || left.id.localeCompare(right.id));
  const result = new Map<string, number>();
  let previousValue: number | null = null;
  let previousRank = 0;
  ranked.forEach((entry, index) => {
    const rank = entry.value === previousValue ? previousRank : index + 1;
    result.set(entry.id, rank);
    previousValue = entry.value;
    previousRank = rank;
  });
  return result;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function gapFor(id: string, scores: Array<{ id: string; rating: number | null }>): { rank: number | null; gap: number | null } {
  const ranks = rankBy(scores, (row) => row.rating, (row) => row.id);
  const ranked = scores
    .filter((row): row is { id: string; rating: number } => row.rating !== null)
    .sort((left, right) => right.rating - left.rating || left.id.localeCompare(right.id));
  const rank = ranks.get(id) ?? null;
  const target = ranked.find((row) => row.id === id);
  const top = ranked[0] ?? null;
  const second = ranked[1] ?? null;
  if (!target || !top) return { rank, gap: null };
  if (rank === 1) return { rank, gap: second ? target.rating - second.rating : null };
  return { rank, gap: target.rating - top.rating };
}

async function findTargetRows(db: Db): Promise<RaceRunnerRow[]> {
  const rows = await loadRaceRunnerRows(db, TARGET_DATE);
  return TARGETS.map((target) => {
    const row = rows.find((candidate) =>
      candidate.horseName === target.horseName &&
      candidate.courseName === target.expectedCourse &&
      candidate.scheduledTime === target.expectedTime,
    );
    if (!row) {
      throw new Error(`Could not resolve target ${target.horseName}`);
    }
    return row;
  });
}

async function loadRaceRunnerRows(db: Db, raceDate: string, raceIds?: string[]): Promise<RaceRunnerRow[]> {
  const conditions = [
    eq(races.source, SOURCE),
    eq(raceRunners.source, SOURCE),
    eq(races.raceDate, raceDate),
  ];
  if (raceIds && raceIds.length > 0) {
    conditions.push(inArray(races.id, raceIds));
  }
  const rows = await db
    .select({
      raceId: races.id,
      raceSourceId: races.sourceId,
      runnerId: raceRunners.id,
      runnerSourceId: raceRunners.sourceId,
      horseId: raceRunners.horseId,
      horseName: horses.displayName,
      raceDate: races.raceDate,
      raceDateTime: races.raceDatetime,
      scheduledTime: races.scheduledTime,
      courseName: courses.displayName,
      raceName: races.raceName,
      raceClass: races.raceClass,
      raceType: races.raceType,
      raceTypeCode: races.raceTypeCode,
      distance: races.distance,
      distanceYards: races.distanceYards,
      going: races.going,
      surface: surfaceSql(),
      declaredRunnerCount: races.declaredRunnerCount,
      actualRunnerCount: races.actualRunnerCount,
      trainerId: raceRunners.trainerId,
      trainerName: trainers.displayName,
      jockeyId: raceRunners.jockeyId,
      jockeyName: jockeys.displayName,
      officialRating: raceRunners.officialRating,
      weight: raceRunners.weight,
      weightCarriedLbs: raceRunners.weightCarriedLbs,
      finishingPosition: raceRunners.finishingPosition,
      resultStatus: raceRunners.resultStatus,
      runnerComment: raceRunners.runnerComment,
    })
    .from(raceRunners)
    .innerJoin(races, eq(raceRunners.raceId, races.id))
    .innerJoin(courses, eq(races.courseId, courses.id))
    .innerJoin(horses, eq(raceRunners.horseId, horses.id))
    .leftJoin(trainers, eq(raceRunners.trainerId, trainers.id))
    .leftJoin(jockeys, eq(raceRunners.jockeyId, jockeys.id))
    .leftJoin(sourceImports, sourceImportJoinCondition())
    .where(and(...conditions))
    .orderBy(asc(races.scheduledTime), asc(courses.displayName), asc(raceRunners.saddleclothNumber), asc(horses.displayName));
  return rows.filter((row): row is RaceRunnerRow => row.raceDateTime !== null);
}

async function loadPriorRuns(db: Db, horseId: string, before: Date): Promise<Array<PriorRunRow & { turfSpeed: TurfSpeedRating | null }>> {
  const rows = await db
    .select({
      runnerId: raceRunners.id,
      runnerSourceId: raceRunners.sourceId,
      raceId: races.id,
      raceSourceId: races.sourceId,
      raceDate: races.raceDate,
      raceDateTime: races.raceDatetime,
      courseName: courses.displayName,
      raceName: races.raceName,
      raceClass: races.raceClass,
      raceType: races.raceType,
      raceTypeCode: races.raceTypeCode,
      distance: races.distance,
      distanceYards: races.distanceYards,
      going: races.going,
      surface: surfaceSql(),
      weightCarriedLbs: raceRunners.weightCarriedLbs,
      officialRating: raceRunners.officialRating,
      racingPostRating: raceRunners.racingPostRating,
      topspeedRating: raceRunners.topspeedRating,
      finishingPosition: raceRunners.finishingPosition,
      resultStatus: raceRunners.resultStatus,
      runnerComment: raceRunners.runnerComment,
    })
    .from(raceRunners)
    .innerJoin(races, eq(raceRunners.raceId, races.id))
    .innerJoin(courses, eq(races.courseId, courses.id))
    .leftJoin(sourceImports, sourceImportJoinCondition())
    .where(and(
      eq(raceRunners.source, SOURCE),
      eq(races.source, SOURCE),
      eq(raceRunners.horseId, horseId),
      lt(races.raceDatetime, before),
    ))
    .orderBy(desc(races.raceDatetime));
  const timed = rows.filter((row): row is PriorRunRow => row.raceDateTime !== null);
  const speedRatings = await getTurfSpeedRatingsAsOfRuns(db, timed.map((row) => row.runnerId), { source: SOURCE });
  return timed.map((row) => ({ ...row, turfSpeed: speedRatings.get(row.runnerId) ?? null }));
}

async function main() {
  const { db, client } = createDbConnection();
  try {
    const targetRows = await findTargetRows(db);
    const raceIds = [...new Set(targetRows.map((row) => row.raceId))];
    const raceRows = await loadRaceRunnerRows(db, TARGET_DATE, raceIds);
    const historicalRows = await getHistoricalTargetRunnerMetrics(db, {
      source: SOURCE,
      targetRaceIds: raceIds,
      ratingFamily: "turf",
    });
    const todayMetricsRows = await getTargetRunnerMetricsForDate(db, TARGET_DATE, SOURCE, {
      includeNonRunnerTargets: true,
      completedPriorRunsOnly: true,
    });
    const todayData = await getTodaysRacingData(db, TARGET_DATE);
    const todayByRunner = new Map<string, { rating: number | null; rank: number | null; gap: number | null; historyDepth: number | null }>();
    if (todayData.status === "ok") {
      for (const meeting of todayData.meetings) {
        for (const race of meeting.races) {
          for (const runner of race.runners) {
            todayByRunner.set(runner.runnerId, {
              rating: runner.turfPerformanceRating?.rating ?? null,
              rank: runner.turfPerformanceRating?.rank ?? null,
              gap: runner.turfPerformanceRating?.gap ?? null,
              historyDepth: runner.turfPerformanceRating?.historyDepth ?? null,
            });
          }
        }
      }
    }
    const featuresByRunnerId = new Map(historicalRows.map((row) => [row.features.targetRunnerId, row.features]));
    const metricsByRunnerId = new Map(todayMetricsRows.map((row) => [row.target.runnerId, row.metrics]));

    const analysesByRace = new Map<string, RunnerAnalysis[]>();
    for (const raceId of raceIds) {
      const rows = raceRows.filter((row) => row.raceId === raceId);
      const medianWeight = median(
        rows
          .filter((row) => row.resultStatus !== "non_runner")
          .map((row) => row.weightCarriedLbs)
          .filter((entry): entry is number => entry !== null),
      );
      const analyses = rows.flatMap((row): RunnerAnalysis[] => {
        const features = featuresByRunnerId.get(row.runnerId);
        if (!features) return [];
        const decomposition = decomposeTpr(features, medianWeight);
        const production = calculateTurfPerformanceRating({
          latestPerformanceRating: features.latestPerformanceRating,
          previousPerformanceRating: features.previousPerformanceRating,
          averagePerformanceLast3: features.averagePerformanceLast3,
          latestSpeedRating: features.latestTurfSpeedRating,
          previousSpeedRating: features.previousTurfSpeedRating,
          averageSpeedLast3: features.averageTurfSpeedLast3,
          raceClass: row.raceClass,
          weightCarriedLbs: row.weightCarriedLbs,
          raceMedianWeightCarriedLbs: medianWeight,
        });
        const today = todayByRunner.get(row.runnerId);
        return [{
          row,
          features,
          metrics: metricsByRunnerId.get(row.runnerId) ?? null,
          tpr: decomposition,
          productionTpr: production?.rating ?? null,
          productionHistoryDepth: production?.historyDepth ?? null,
          productionRank: today?.rank ?? null,
          productionGap: today?.gap ?? null,
          ranks: {
            latestSpeed: null,
            bestL3: null,
            performanceComponent: null,
            afterClass: null,
            afterWeight: null,
            final: today?.rank ?? null,
          },
        }];
      });

      const latestRanks = rankBy(analyses, (entry) => entry.features.latestTurfSpeedRating, (entry) => entry.row.runnerId);
      const bestL3Ranks = rankBy(analyses, (entry) => entry.features.bestTurfSpeedLast3, (entry) => entry.row.runnerId);
      const performanceRanks = rankBy(analyses, (entry) => entry.tpr.performanceWeighted, (entry) => entry.row.runnerId);
      const classRanks = rankBy(analyses, (entry) => entry.tpr.classAdjusted, (entry) => entry.row.runnerId);
      const weightRanks = rankBy(analyses, (entry) => entry.tpr.finalPreScaleRaw, (entry) => entry.row.runnerId);
      const finalRanks = rankBy(analyses, (entry) => entry.tpr.rating, (entry) => entry.row.runnerId);
      analyses.forEach((analysis) => {
        analysis.ranks.latestSpeed = latestRanks.get(analysis.row.runnerId) ?? null;
        analysis.ranks.bestL3 = bestL3Ranks.get(analysis.row.runnerId) ?? null;
        analysis.ranks.performanceComponent = performanceRanks.get(analysis.row.runnerId) ?? null;
        analysis.ranks.afterClass = classRanks.get(analysis.row.runnerId) ?? null;
        analysis.ranks.afterWeight = weightRanks.get(analysis.row.runnerId) ?? null;
        analysis.ranks.final = finalRanks.get(analysis.row.runnerId) ?? analysis.productionRank;
      });
      analysesByRace.set(raceId, analyses);
    }

    const priorRunsByTarget = new Map<string, Array<PriorRunRow & { turfSpeed: TurfSpeedRating | null }>>();
    for (const target of targetRows) {
      priorRunsByTarget.set(target.runnerId, await loadPriorRuns(db, target.horseId, target.raceDateTime));
    }

    const lines = report({
      targetRows,
      analysesByRace,
      priorRunsByTarget,
    });
    await writeFile(OUTPUT_PATH, `${lines.join("\n")}\n`);
    console.log(`Wrote ${OUTPUT_PATH}`);
  } finally {
    await client.end();
  }
}

function report(input: {
  targetRows: RaceRunnerRow[];
  analysesByRace: Map<string, RunnerAnalysis[]>;
  priorRunsByTarget: Map<string, Array<PriorRunRow & { turfSpeed: TurfSpeedRating | null }>>;
}): string[] {
  const lines: string[] = [];
  lines.push("# TPR Three-Runner Decomposition");
  lines.push("");
  lines.push("Diagnostic only. Production TPR, Today, Research, importer behavior, schemas, cache versions, and fallback logic were not changed.");
  lines.push("");
  lines.push(`Formula version: \`${TURF_PERFORMANCE_RATING_VERSION}\`.`);
  lines.push("Formula constants: B3 weights `0.60/0.25/0.15`; RPR median/IQR `59.73279656117335/15.303501885173738`; speed median/IQR `96.81426514225745/13.71148109158355`; class offsets from production `CLASS_OFFSETS_2025`; weight coefficient `0.1216065319677862`; final scale `100 + 10 * ((raw - -0.103) / 1.223)`.");
  lines.push("");

  lines.push("## Target Identification");
  lines.push("");
  lines.push("| horse | date | course | time | race | race id | runner id | horse id | family | class | distance | going | field | trainer id | jockey id |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---: | --- | --- |");
  for (const target of input.targetRows) {
    lines.push(`| ${target.horseName} | ${target.raceDate} | ${target.courseName} | ${target.scheduledTime?.slice(0, 5) ?? "-"} | ${value(target.raceName)} | ${target.raceId} | ${target.runnerId} | ${target.horseId} | ${raceFamily(target)} | ${value(target.raceClass)} | ${value(target.distance)} | ${value(target.going)} | ${target.actualRunnerCount ?? target.declaredRunnerCount ?? "-"} | ${value(target.trainerId)} | ${value(target.jockeyId)} |`);
  }
  lines.push("");

  lines.push("## Production-Value Reconciliation");
  lines.push("");
  lines.push("| horse | OR | latest speed | previous speed | best L3 speed | today's rating | TPR | TPR rank | lead/deficit | days | basis | prior runs |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |");
  for (const target of input.targetRows) {
    const analysis = analysisFor(input.analysesByRace, target.runnerId);
    lines.push(`| ${target.horseName} | ${round(target.officialRating, 0)} | ${round(analysis.features.latestTurfSpeedRating)} | ${round(analysis.features.previousTurfSpeedRating)} | ${round(analysis.features.bestTurfSpeedLast3)} | ${round(analysis.features.latestTodaysRating)} | ${round(analysis.tpr.rating)} | ${value(analysis.ranks.final)} | ${round(analysis.productionGap)} | ${value(analysis.features.daysSinceLastRun)} | ${basis(analysis.tpr.historyDepth)} | ${analysis.features.priorRuns} |`);
  }
  lines.push("");
  lines.push("The diagnostic TPR values reconcile to the production calculation; ranks are derived from the same-race runner set using the same final rating order.");
  lines.push("");

  for (const target of input.targetRows) {
    const analysis = analysisFor(input.analysesByRace, target.runnerId);
    lines.push(`## ${target.horseName} Decomposition`);
    lines.push("");
    lines.push(decompositionSummary(analysis));
    lines.push("");
    lines.push("### TPR Components");
    lines.push("");
    lines.push("| component | value |");
    lines.push("| --- | ---: |");
    lines.push(`| reconstructed performance values | ${analysis.tpr.performanceValues.map((entry) => round(entry)).join(", ")} |`);
    lines.push(`| reconstructed speed values | ${analysis.tpr.speedValues.map((entry) => round(entry)).join(", ")} |`);
    lines.push(`| weighted recent performance | ${round(analysis.tpr.performanceWeighted)} |`);
    lines.push(`| weighted recent speed | ${round(analysis.tpr.speedWeighted)} |`);
    lines.push(`| performance robust score | ${round(analysis.tpr.performanceRobust, 4)} |`);
    lines.push(`| speed robust score | ${round(analysis.tpr.speedRobust, 4)} |`);
    lines.push(`| base robust blend | ${round(analysis.tpr.base, 4)} |`);
    lines.push(`| class offset subtracted | ${round(analysis.tpr.classOffset, 4)} |`);
    lines.push(`| after class adjustment | ${round(analysis.tpr.classAdjusted, 4)} |`);
    lines.push(`| carried weight - race median | ${round(analysis.tpr.weightDiff, 1)} lb |`);
    lines.push(`| weight adjustment | ${round(analysis.tpr.weightAdjustment, 4)} |`);
    lines.push(`| final pre-scale raw | ${round(analysis.tpr.finalPreScaleRaw, 4)} |`);
    lines.push(`| displayed TPR | ${round(analysis.tpr.rating)} |`);
    lines.push("");
    lines.push("### Recent-Run History");
    lines.push("");
    lines.push("| recency | used? | date | course | surface | class | distance | going | wt | OR | RPR | TS | turf speed | perf component | today-style | pos | comment | source ids |");
    lines.push("| ---: | --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |");
    const priors = input.priorRunsByTarget.get(target.runnerId) ?? [];
    priors.slice(0, 8).forEach((run, index) => {
      const turfSpeed = run.turfSpeed?.rating ?? null;
      const performance = calculateWeightAdjustedPerformance({
        rawSpeedRating: turfSpeed,
        weightCarriedLb: run.weightCarriedLbs,
      })?.performanceRating ?? null;
      const today = calculateTodaysRating({
        historicalPerformanceRating: performance,
        currentWeightCarriedLb: target.weightCarriedLbs,
      })?.todaysRating ?? null;
      lines.push(`| ${index + 1} | ${usedReason(run)} | ${run.raceDate} | ${run.courseName} | ${value(run.surface)} | ${value(run.raceClass)} | ${value(run.distance)} | ${value(run.going)} | ${round(run.weightCarriedLbs, 0)} | ${round(run.officialRating, 0)} | ${round(run.racingPostRating, 0)} | ${round(run.topspeedRating, 0)} | ${round(turfSpeed)} | ${round(performance)} | ${round(today)} | ${value(run.finishingPosition)} | ${value(run.runnerComment)} | race ${run.raceSourceId ?? run.raceId}; runner ${run.runnerSourceId ?? run.runnerId} |`);
    });
    lines.push("");
  }

  lines.push("## Same-Race Comparisons");
  lines.push("");
  for (const target of input.targetRows) {
    const analyses = input.analysesByRace.get(target.raceId) ?? [];
    const targetAnalysis = analysisFor(input.analysesByRace, target.runnerId);
    const comparison = comparisonRows(target.horseName, analyses);
    lines.push(`### ${target.horseName} race`);
    lines.push("");
    lines.push("| horse | latest speed | previous speed | best L3 | today's rating | TPR | rank | perf wt | speed wt | base | class adj | wt diff | wt adj | raw |");
    lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
    for (const item of comparison) {
      lines.push(`| ${item.row.horseName}${item.row.runnerId === targetAnalysis.row.runnerId ? " *" : ""} | ${round(item.features.latestTurfSpeedRating)} | ${round(item.features.previousTurfSpeedRating)} | ${round(item.features.bestTurfSpeedLast3)} | ${round(item.features.latestTodaysRating)} | ${round(item.tpr.rating)} | ${value(item.ranks.final)} | ${round(item.tpr.performanceWeighted)} | ${round(item.tpr.speedWeighted)} | ${round(item.tpr.base, 4)} | ${round(item.tpr.classAdjusted, 4)} | ${round(item.tpr.weightDiff, 1)} | ${round(item.tpr.weightAdjustment, 4)} | ${round(item.tpr.rawRating, 4)} |`);
    }
    lines.push("");
  }

  lines.push("## Rank Movement");
  lines.push("");
  lines.push("| horse | latest speed rank | best L3 rank | recent performance rank | after class rank | after weight rank | final rank |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const target of input.targetRows) {
    const analysis = analysisFor(input.analysesByRace, target.runnerId);
    lines.push(`| ${target.horseName} | ${value(analysis.ranks.latestSpeed)} | ${value(analysis.ranks.bestL3)} | ${value(analysis.ranks.performanceComponent)} | ${value(analysis.ranks.afterClass)} | ${value(analysis.ranks.afterWeight)} | ${value(analysis.ranks.final)} |`);
  }
  lines.push("");

  lines.push("## Sensitivity Variants");
  lines.push("");
  lines.push("| horse | production | no class adj | no weight adj | equal recent weights | no final normalization |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const target of input.targetRows) {
    const analyses = input.analysesByRace.get(target.raceId) ?? [];
    const variant = variantRanks(analyses, target.runnerId);
    lines.push(`| ${target.horseName} | rank ${value(variant.production.rank)} / ${round(variant.production.rating)} | rank ${value(variant.noClass.rank)} / ${round(variant.noClass.rating)} | rank ${value(variant.noWeight.rank)} / ${round(variant.noWeight.rating)} | rank ${value(variant.equalWeights.rank)} / ${round(variant.equalWeights.rating)} | rank ${value(variant.noNormalization.rank)} / raw ${round(variant.noNormalization.rating, 4)} |`);
  }
  lines.push("");

  lines.push("## Consistency Vs Peak-Form Snapshot");
  lines.push("");
  lines.push("| horse | latest | previous | reconstructed third | best L3 | range | interpretation |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | --- |");
  for (const target of input.targetRows) {
    const analysis = analysisFor(input.analysesByRace, target.runnerId);
    const values = analysis.tpr.speedValues.filter((entry): entry is number => entry !== null);
    const range = values.length ? Math.max(...values) - Math.min(...values) : null;
    lines.push(`| ${target.horseName} | ${round(analysis.tpr.speedValues[0])} | ${round(analysis.tpr.speedValues[1])} | ${round(analysis.tpr.speedValues[2])} | ${round(analysis.features.bestTurfSpeedLast3)} | ${round(range)} | ${consistencyText(analysis, range)} |`);
  }
  lines.push("");

  lines.push("## Implementation Checks");
  lines.push("");
  lines.push("| horse | expected inputs | missing fallback? | race class | carried weight | median weight | turf history | version | check |");
  lines.push("| --- | --- | --- | --- | ---: | ---: | --- | --- | --- |");
  for (const target of input.targetRows) {
    const analysis = analysisFor(input.analysesByRace, target.runnerId);
    const raceAnalyses = input.analysesByRace.get(target.raceId) ?? [];
    const medianWeightValue = median(
      raceAnalyses
        .filter((entry) => entry.row.resultStatus !== "non_runner")
        .map((entry) => entry.row.weightCarriedLbs)
        .filter((entry): entry is number => entry !== null),
    );
    const matchesProduction = analysis.productionTpr === null
      ? analysis.tpr.rating === null
      : analysis.tpr.rating !== null && Math.abs(analysis.productionTpr - analysis.tpr.rating) < 0.000001;
    lines.push(`| ${target.horseName} | speed+performance+weight present | no | ${value(target.raceClass)} | ${round(target.weightCarriedLbs, 0)} | ${round(medianWeightValue, 1)} | ordinary Turf speed ratings | ${TURF_PERFORMANCE_RATING_VERSION} | ${matchesProduction ? "matches production" : "mismatch"} |`);
  }
  lines.push("");

  lines.push("## Conclusion Questions");
  lines.push("");
  lines.push(...conclusions(input));
  return lines;
}

function analysisFor(analysesByRace: Map<string, RunnerAnalysis[]>, runnerId: string): RunnerAnalysis {
  for (const analyses of analysesByRace.values()) {
    const found = analyses.find((entry) => entry.row.runnerId === runnerId);
    if (found) return found;
  }
  throw new Error(`No analysis for runner ${runnerId}`);
}

function raceFamily(row: Pick<RaceRunnerRow, "raceName" | "raceType" | "raceTypeCode" | "surface">): string {
  return isOrdinaryFlatTurfRace(row) ? "turf" : "unsupported";
}

function basis(depth: number): string {
  if (depth === 1) return "1-run basis";
  if (depth === 2) return "2-run basis";
  if (depth >= 3) return "3-run basis";
  return "insufficient";
}

function decompositionSummary(analysis: RunnerAnalysis): string {
  const classPoints = analysis.tpr.classOffset === 0 ? 0 : -analysis.tpr.classOffset * (10 / TPR_DEVELOPMENT_STDEV);
  const weightPoints = (analysis.tpr.weightAdjustment ?? 0) * (10 / TPR_DEVELOPMENT_STDEV);
  return `Latest/previous/reconstructed speed ${analysis.tpr.speedValues.map((entry) => round(entry)).join("/")} and performance ${analysis.tpr.performanceValues.map((entry) => round(entry)).join("/")} produce base raw ${round(analysis.tpr.base, 4)}. Class contributes about ${round(classPoints)} displayed TPR points and relative weight contributes about ${round(weightPoints)} displayed TPR points before final scaling.`;
}

function usedReason(run: PriorRunRow & { turfSpeed: TurfSpeedRating | null }): string {
  if (run.resultStatus === "non_runner") return "excluded: non-runner";
  if (!isOrdinaryFlatTurfRace(run)) return "excluded: not Turf";
  if (run.turfSpeed?.rating === null || run.turfSpeed?.rating === undefined) {
    return `excluded: ${run.turfSpeed?.unavailableReason ?? run.turfSpeed?.withheldReason ?? "no turf speed"}`;
  }
  return "usable";
}

function comparisonRows(targetName: string, analyses: RunnerAnalysis[]): RunnerAnalysis[] {
  if (targetName === "Cerro Blanco") {
    return analyses
      .filter((entry) => CERRO_RIVALS.has(entry.row.horseName))
      .sort((left, right) => (left.ranks.final ?? 999) - (right.ranks.final ?? 999));
  }
  const ranked = [...analyses]
    .filter((entry) => entry.tpr.rating !== null)
    .sort((left, right) => (left.ranks.final ?? 999) - (right.ranks.final ?? 999));
  const target = ranked.find((entry) => entry.row.horseName === targetName);
  const top = ranked.slice(0, 4);
  if (target && !top.some((entry) => entry.row.runnerId === target.row.runnerId)) {
    top.push(target);
  }
  return top;
}

function variantRanks(analyses: RunnerAnalysis[], targetRunnerId: string) {
  const medianWeightValue = median(
    analyses
      .filter((entry) => entry.row.resultStatus !== "non_runner")
      .map((entry) => entry.row.weightCarriedLbs)
      .filter((entry): entry is number => entry !== null),
  );
  const score = (
    options: { includeClass?: boolean; includeWeight?: boolean; weights?: [number, number, number]; raw?: boolean },
  ) => {
    const rows = analyses.map((entry) => {
      const decomp = decomposeTpr(entry.features, medianWeightValue, options.weights ?? B3_WEIGHTS, {
        includeClass: options.includeClass,
        includeWeight: options.includeWeight,
      });
      return {
        id: entry.row.runnerId,
        rating: options.raw ? decomp.rawRating : decomp.rating,
      };
    });
    const target = rows.find((entry) => entry.id === targetRunnerId);
    return {
      ...gapFor(targetRunnerId, rows),
      rating: target?.rating ?? null,
    };
  };
  return {
    production: score({}),
    noClass: score({ includeClass: false }),
    noWeight: score({ includeWeight: false }),
    equalWeights: score({ weights: EQUAL_WEIGHTS }),
    noNormalization: score({ raw: true }),
  };
}

function consistencyText(analysis: RunnerAnalysis, range: number | null): string {
  if (range === null) return "insufficient rated history";
  if (range <= 5) return "steady profile";
  if (analysis.features.bestTurfSpeedLast3 !== null && analysis.features.latestTurfSpeedRating !== null && analysis.features.bestTurfSpeedLast3 - analysis.features.latestTurfSpeedRating > 8) {
    return "peak figure materially above latest";
  }
  return "mixed profile";
}

function conclusions(input: {
  targetRows: RaceRunnerRow[];
  analysesByRace: Map<string, RunnerAnalysis[]>;
}): string[] {
  const byName = new Map(input.targetRows.map((row) => [row.horseName, analysisFor(input.analysesByRace, row.runnerId)]));
  const cerro = byName.get("Cerro Blanco")!;
  const mare = byName.get("Mare Crisium")!;
  const raffles = byName.get("Raffles Angel")!;
  const cerroVariant = variantRanks(input.analysesByRace.get(cerro.row.raceId) ?? [], cerro.row.runnerId);
  const mareVariant = variantRanks(input.analysesByRace.get(mare.row.raceId) ?? [], mare.row.runnerId);
  const rafflesVariant = variantRanks(input.analysesByRace.get(raffles.row.raceId) ?? [], raffles.row.runnerId);
  return [
    `1. Cerro Blanco ranked low because its weighted recent speed (${round(cerro.tpr.speedWeighted)}) and performance (${round(cerro.tpr.performanceWeighted)}) converted to only a middling robust base (${round(cerro.tpr.base, 4)}) in a Listed race, then the Class 1 offset subtracted ${round(cerro.tpr.classOffset, 4)} raw points, about ${round(cerro.tpr.classOffset * 10 / TPR_DEVELOPMENT_STDEV)} displayed TPR points. The larger rank impact was relative weight: ${round(cerro.tpr.weightDiff, 1)} lb vs median applied ${round((cerro.tpr.weightAdjustment ?? 0) * 10 / TPR_DEVELOPMENT_STDEV)} displayed points, moving it from rank ${value(cerroVariant.noWeight.rank)} without weight adjustment to production rank ${value(cerroVariant.production.rank)}.`,
    `2. Mare Crisium reached rank 1 because its recent weighted speed/performance blend was strong and the relative-weight term added ${round((mare.tpr.weightAdjustment ?? 0) * 10 / TPR_DEVELOPMENT_STDEV)} displayed points, moving it from rank ${value(mareVariant.noWeight.rank)} without weight adjustment to production rank ${value(mareVariant.production.rank)}. The unknown/blank Irish class offset adds a smaller ${round(-mare.tpr.classOffset * 10 / TPR_DEVELOPMENT_STDEV)} displayed points.`,
    `3. Raffles Angel reached rank 1 through a steady recent Turf-speed profile plus a large positive relative-weight adjustment. The speed range was only ${round(Math.max(...raffles.tpr.speedValues.filter((entry): entry is number => entry !== null)) - Math.min(...raffles.tpr.speedValues.filter((entry): entry is number => entry !== null)))} points, but weight added ${round((raffles.tpr.weightAdjustment ?? 0) * 10 / TPR_DEVELOPMENT_STDEV)} displayed points, moving it from rank ${value(rafflesVariant.noWeight.rank)} without weight adjustment to production rank ${value(rafflesVariant.production.rank)}.`,
    `4. The largest rank-moving component in these cases is the relative-weight adjustment. Sensitivity ranks: Cerro production ${value(cerroVariant.production.rank)}, no class ${value(cerroVariant.noClass.rank)}, no weight ${value(cerroVariant.noWeight.rank)}, equal weights ${value(cerroVariant.equalWeights.rank)}; Mare production ${value(mareVariant.production.rank)}, no class ${value(mareVariant.noClass.rank)}, no weight ${value(mareVariant.noWeight.rank)}, equal weights ${value(mareVariant.equalWeights.rank)}; Raffles production ${value(rafflesVariant.production.rank)}, no class ${value(rafflesVariant.noClass.rank)}, no weight ${value(rafflesVariant.noWeight.rank)}, equal weights ${value(rafflesVariant.equalWeights.rank)}.`,
    "5. The divergence is mainly model-design behavior: raw Turf-speed evidence plus recent-run weighting, with relative-weight adjustment the main rank mover. The final normalization is linear and does not alter ranks.",
    "6. There is no evidence of an implementation bug in these three cases: expected inputs are present, no missing-data fallback is accidentally used, race class/weight/median weight are applied, Turf-family history is used, and the version is `TPR_S2_V1`.",
    "7. There is evidence that the relative-weight adjustment may be too influential in these race-level comparisons, especially because it materially changes ranks in all three target cases.",
    "8. This does justify a broader diagnostic across many races before changing production TPR.",
    "9. The narrowest next diagnostic is a holdout sensitivity sweep that reports rank/ROI changes for `no weight`, capped weight effect, reduced weight coefficient, and reduced class coefficient variants, split by class and field size.",
  ];
}

function surfaceSql() {
  return sql<string | null>`${sourceImports.payload} #>> '{props,pageProps,race,race_summary,course_surface,surface}'`;
}

function sourceImportJoinCondition() {
  return and(
    eq(sourceImports.source, SOURCE),
    eq(sourceImports.sourceId, races.sourceId),
    eq(sourceImports.sourceType, "full-result-next-data"),
  )!;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
