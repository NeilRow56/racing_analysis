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

export type JockeyPriorMetrics = {
  jockeyPriorRuns: number;
  jockeyPriorWins: number;
  jockeyPriorWinRate: number | null;
};

export type TrainerMetricTarget = {
  targetRunnerId: string;
  trainerId: string | null;
  raceDateTime: Date;
};

export type JockeyMetricTarget = {
  targetRunnerId: string;
  jockeyId?: string | null;
  raceDateTime: Date;
};

export type TrainerPriorRun = {
  trainerId: string | null;
  raceDateTime: Date;
  finishingPosition: number | null;
  resultStatus: string | null;
};

export type JockeyPriorRun = {
  jockeyId?: string | null;
  raceDateTime: Date;
  finishingPosition: number | null;
  resultStatus: string | null;
};

type ParticipantMetricTarget = {
  targetRunnerId: string;
  participantId?: string | null;
  raceDateTime: Date;
};

type ParticipantPriorRun = {
  participantId?: string | null;
  raceDateTime: Date;
  finishingPosition: number | null;
  resultStatus: string | null;
};

type ParticipantPriorMetrics = {
  priorRuns: number;
  priorWins: number;
  priorWinRate: number | null;
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
  const participantMetrics = calculateParticipantPriorMetricsForTargets(
    targets.map((target) => ({
      targetRunnerId: target.targetRunnerId,
      participantId: target.trainerId,
      raceDateTime: target.raceDateTime,
    })),
    runs.map((run) => ({
      participantId: run.trainerId,
      raceDateTime: run.raceDateTime,
      finishingPosition: run.finishingPosition,
      resultStatus: run.resultStatus,
    })),
  );
  return mapParticipantMetrics(participantMetrics, trainerPriorMetrics);
}

export async function getJockeyPriorMetricsForTargets(
  db: Db,
  targets: JockeyMetricTarget[],
  source: string,
): Promise<Map<string, JockeyPriorMetrics>> {
  const jockeyRuns = await loadJockeyPriorRuns(db, targets, source);
  return calculateJockeyPriorMetricsForTargets(targets, jockeyRuns);
}

export function calculateJockeyPriorMetricsForTargets(
  targets: JockeyMetricTarget[],
  runs: JockeyPriorRun[],
): Map<string, JockeyPriorMetrics> {
  const participantMetrics = calculateParticipantPriorMetricsForTargets(
    targets.map((target) => ({
      targetRunnerId: target.targetRunnerId,
      participantId: target.jockeyId,
      raceDateTime: target.raceDateTime,
    })),
    runs.map((run) => ({
      participantId: run.jockeyId,
      raceDateTime: run.raceDateTime,
      finishingPosition: run.finishingPosition,
      resultStatus: run.resultStatus,
    })),
  );
  return mapParticipantMetrics(participantMetrics, jockeyPriorMetrics);
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

export function emptyJockeyPriorMetrics(): JockeyPriorMetrics {
  return {
    jockeyPriorRuns: 0,
    jockeyPriorWins: 0,
    jockeyPriorWinRate: null,
  };
}

function jockeyPriorMetrics(priorRuns: number, priorWins: number): JockeyPriorMetrics {
  return {
    jockeyPriorRuns: priorRuns,
    jockeyPriorWins: priorWins,
    jockeyPriorWinRate: priorRuns === 0 ? null : (priorWins / priorRuns) * 100,
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

async function loadJockeyPriorRuns(
  db: Db,
  targets: JockeyMetricTarget[],
  source: string,
): Promise<JockeyPriorRun[]> {
  const jockeyIds = [...new Set(
    targets.map((target) => target.jockeyId).filter((jockeyId): jockeyId is string => typeof jockeyId === "string"),
  )];
  if (jockeyIds.length === 0 || targets.length === 0) {
    return [];
  }
  const latestTargetDateTime = targets.reduce(
    (latest, target) => target.raceDateTime > latest ? target.raceDateTime : latest,
    targets[0]!.raceDateTime,
  );

  return (
    await Promise.all(
      chunks(jockeyIds, QUERY_CHUNK_SIZE).map((jockeyIdChunk) =>
        db
          .select({
            jockeyId: raceRunners.jockeyId,
            raceDateTime: races.raceDatetime,
            finishingPosition: raceRunners.finishingPosition,
            resultStatus: raceRunners.resultStatus,
          })
          .from(raceRunners)
          .innerJoin(races, eq(raceRunners.raceId, races.id))
          .where(
            and(
              inArray(raceRunners.jockeyId, jockeyIdChunk),
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

function calculateParticipantPriorMetricsForTargets(
  targets: ParticipantMetricTarget[],
  runs: ParticipantPriorRun[],
): Map<string, ParticipantPriorMetrics> {
  const runsByParticipant = new Map<string, ParticipantPriorRun[]>();
  for (const run of runs) {
    if (!run.participantId || !isSettledParticipantRun(run)) {
      continue;
    }
    const participantRuns = runsByParticipant.get(run.participantId) ?? [];
    participantRuns.push(run);
    runsByParticipant.set(run.participantId, participantRuns);
  }
  for (const participantRuns of runsByParticipant.values()) {
    participantRuns.sort((left, right) => left.raceDateTime.getTime() - right.raceDateTime.getTime());
  }

  const groupedTargets = new Map<string, ParticipantMetricTarget[]>();
  for (const target of targets) {
    if (!target.participantId) {
      continue;
    }
    const participantTargets = groupedTargets.get(target.participantId) ?? [];
    participantTargets.push(target);
    groupedTargets.set(target.participantId, participantTargets);
  }

  const metrics = new Map<string, ParticipantPriorMetrics>();
  for (const target of targets) {
    metrics.set(target.targetRunnerId, participantPriorMetrics(0, 0));
  }

  for (const [participantId, participantTargets] of groupedTargets) {
    const sortedTargets = [...participantTargets].sort(
      (left, right) => left.raceDateTime.getTime() - right.raceDateTime.getTime(),
    );
    const participantRuns = runsByParticipant.get(participantId) ?? [];
    let index = 0;
    let priorRuns = 0;
    let priorWins = 0;
    for (const target of sortedTargets) {
      while (index < participantRuns.length && participantRuns[index]!.raceDateTime < target.raceDateTime) {
        const run = participantRuns[index]!;
        priorRuns += 1;
        if (run.finishingPosition === 1) {
          priorWins += 1;
        }
        index += 1;
      }
      metrics.set(target.targetRunnerId, participantPriorMetrics(priorRuns, priorWins));
    }
  }

  return metrics;
}

function participantPriorMetrics(priorRuns: number, priorWins: number): ParticipantPriorMetrics {
  return {
    priorRuns,
    priorWins,
    priorWinRate: priorRuns === 0 ? null : (priorWins / priorRuns) * 100,
  };
}

function mapParticipantMetrics<T>(
  metrics: Map<string, ParticipantPriorMetrics>,
  mapper: (priorRuns: number, priorWins: number) => T,
): Map<string, T> {
  return new Map(
    [...metrics.entries()].map(([runnerId, value]) => [
      runnerId,
      mapper(value.priorRuns, value.priorWins),
    ]),
  );
}

function isSettledParticipantRun(run: ParticipantPriorRun): boolean {
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
