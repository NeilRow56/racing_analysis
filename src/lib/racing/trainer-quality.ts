import { and, asc, eq, inArray, isNotNull, isNull, lt, ne, or, type SQL } from "drizzle-orm";
import { createDbConnection } from "@/db";
import { raceRunners, races } from "@/db/schema";

type Db = ReturnType<typeof createDbConnection>["db"];

const QUERY_CHUNK_SIZE = 5_000;

export type TrainerPriorMetrics = {
  trainerPriorRuns: number;
  trainerPriorWins: number;
  trainerPriorWinRate: number | null;
};

export type TrainerMetricTarget = {
  targetRunnerId: string;
  trainerId: string | null;
  raceDateTime: Date;
};

export type TrainerPriorRun = {
  trainerId: string | null;
  raceDateTime: Date;
  finishingPosition: number | null;
  resultStatus: string | null;
};

export async function getTrainerPriorMetricsForTargets(
  db: Db,
  targets: TrainerMetricTarget[],
  source: string,
): Promise<Map<string, TrainerPriorMetrics>> {
  const trainerRuns = await loadTrainerPriorRuns(db, targets, source);
  return calculateTrainerPriorMetricsForTargets(targets, trainerRuns);
}

export function calculateTrainerPriorMetricsForTargets(
  targets: TrainerMetricTarget[],
  runs: TrainerPriorRun[],
): Map<string, TrainerPriorMetrics> {
  const runsByTrainer = new Map<string, TrainerPriorRun[]>();
  for (const run of runs) {
    if (!run.trainerId || !isSettledTrainerRun(run)) {
      continue;
    }
    const trainerRuns = runsByTrainer.get(run.trainerId) ?? [];
    trainerRuns.push(run);
    runsByTrainer.set(run.trainerId, trainerRuns);
  }
  for (const trainerRuns of runsByTrainer.values()) {
    trainerRuns.sort((left, right) => left.raceDateTime.getTime() - right.raceDateTime.getTime());
  }

  const groupedTargets = new Map<string, TrainerMetricTarget[]>();
  for (const target of targets) {
    if (!target.trainerId) {
      continue;
    }
    const trainerTargets = groupedTargets.get(target.trainerId) ?? [];
    trainerTargets.push(target);
    groupedTargets.set(target.trainerId, trainerTargets);
  }

  const metrics = new Map<string, TrainerPriorMetrics>();
  for (const target of targets) {
    metrics.set(target.targetRunnerId, emptyTrainerPriorMetrics());
  }

  for (const [trainerId, trainerTargets] of groupedTargets) {
    const sortedTargets = [...trainerTargets].sort(
      (left, right) => left.raceDateTime.getTime() - right.raceDateTime.getTime(),
    );
    const trainerRuns = runsByTrainer.get(trainerId) ?? [];
    let index = 0;
    let priorRuns = 0;
    let priorWins = 0;
    for (const target of sortedTargets) {
      while (index < trainerRuns.length && trainerRuns[index]!.raceDateTime < target.raceDateTime) {
        const run = trainerRuns[index]!;
        priorRuns += 1;
        if (run.finishingPosition === 1) {
          priorWins += 1;
        }
        index += 1;
      }
      metrics.set(target.targetRunnerId, trainerPriorMetrics(priorRuns, priorWins));
    }
  }

  return metrics;
}

export function emptyTrainerPriorMetrics(): TrainerPriorMetrics {
  return {
    trainerPriorRuns: 0,
    trainerPriorWins: 0,
    trainerPriorWinRate: null,
  };
}

function trainerPriorMetrics(priorRuns: number, priorWins: number): TrainerPriorMetrics {
  return {
    trainerPriorRuns: priorRuns,
    trainerPriorWins: priorWins,
    trainerPriorWinRate: priorRuns === 0 ? null : (priorWins / priorRuns) * 100,
  };
}

async function loadTrainerPriorRuns(
  db: Db,
  targets: TrainerMetricTarget[],
  source: string,
): Promise<TrainerPriorRun[]> {
  const trainerIds = [...new Set(
    targets.map((target) => target.trainerId).filter((trainerId): trainerId is string => trainerId !== null),
  )];
  if (trainerIds.length === 0 || targets.length === 0) {
    return [];
  }
  const latestTargetDateTime = targets.reduce(
    (latest, target) => target.raceDateTime > latest ? target.raceDateTime : latest,
    targets[0]!.raceDateTime,
  );

  return (
    await Promise.all(
      chunks(trainerIds, QUERY_CHUNK_SIZE).map((trainerIdChunk) =>
        db
          .select({
            trainerId: raceRunners.trainerId,
            raceDateTime: races.raceDatetime,
            finishingPosition: raceRunners.finishingPosition,
            resultStatus: raceRunners.resultStatus,
          })
          .from(raceRunners)
          .innerJoin(races, eq(raceRunners.raceId, races.id))
          .where(
            and(
              inArray(raceRunners.trainerId, trainerIdChunk),
              eq(raceRunners.source, source),
              eq(races.source, source),
              isSettledTrainerRunSql(),
              lt(races.raceDatetime, latestTargetDateTime),
            ),
          )
          .orderBy(asc(races.raceDatetime), asc(raceRunners.id)),
      ),
    )
  ).flat().filter(hasRaceDateTime);
}

function isSettledTrainerRun(run: TrainerPriorRun): boolean {
  return run.resultStatus !== "non_runner" && run.finishingPosition !== null;
}

function isSettledTrainerRunSql(): SQL {
  return and(
    or(
      isNull(raceRunners.resultStatus),
      ne(raceRunners.resultStatus, "non_runner"),
    ),
    isNotNull(raceRunners.finishingPosition),
  )!;
}

function hasRaceDateTime<T extends { raceDateTime: Date | null }>(
  run: T,
): run is T & { raceDateTime: Date } {
  return run.raceDateTime !== null;
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}
