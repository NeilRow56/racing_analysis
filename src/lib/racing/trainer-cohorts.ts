import { and, eq, gte, lte, sql } from "drizzle-orm";
import { createDbConnection } from "@/db";
import { courses, raceRunners, races, sourceImports, trainers } from "@/db/schema";
import { targetFamilyCondition, type BacktestCacheFamily } from "./backtest-cache";
import type { ResearchRuleV1 } from "./research-rule";

type Db = ReturnType<typeof createDbConnection>["db"];

export const TRAINER_COHORT_MIN_SETTLED_RUNNERS = 50;
export const TRAINER_COHORT_RANKING_METRIC = "wins";
export const TRAINER_COHORT_PERIOD = "prior_calendar_year";
export const TRAINER_COHORT_TOP_OPTIONS = [10, 20, 30] as const;

export type TrainerCohortTop = typeof TRAINER_COHORT_TOP_OPTIONS[number];
export type TrainerCohortRankingMetric = typeof TRAINER_COHORT_RANKING_METRIC;
export type TrainerCohortPeriod = typeof TRAINER_COHORT_PERIOD;

export type TrainerCohortRule = {
  top: TrainerCohortTop;
  period: TrainerCohortPeriod;
  rankingMetric: TrainerCohortRankingMetric;
};

export type TrainerCohortMember = {
  cohortYear: number;
  referenceYear: number;
  family: Exclude<BacktestCacheFamily, "all">;
  rank: number;
  trainerId: string;
  trainerName: string;
  priorYearRuns: number;
  priorYearWins: number;
  priorYearWinRate: number;
};

export type ResolvedTrainerCohort = {
  definition: TrainerCohortRule;
  cohortYear: number;
  referenceYear: number;
  family: Exclude<BacktestCacheFamily, "all">;
  members: TrainerCohortMember[];
  trainerIds: Set<string>;
};

export type TrainerCohortStandingInput = {
  trainerId: string | null;
  trainerName: string | null;
  family: Exclude<BacktestCacheFamily, "all">;
  raceDate: string;
  finishingPosition: number | null;
  resultStatus: string | null;
};

export function trainerCohortRule(top: TrainerCohortTop): TrainerCohortRule {
  return {
    top,
    period: TRAINER_COHORT_PERIOD,
    rankingMetric: TRAINER_COHORT_RANKING_METRIC,
  };
}

export function isTrainerCohortTop(value: unknown): value is TrainerCohortTop {
  return TRAINER_COHORT_TOP_OPTIONS.includes(value as TrainerCohortTop);
}

export function parseTrainerCohortTop(value: string | null | undefined): TrainerCohortTop | undefined {
  const parsed = Number(value);
  return isTrainerCohortTop(parsed) ? parsed : undefined;
}

export function resolveTrainerCohortFromStandings(input: {
  rows: TrainerCohortStandingInput[];
  definition: TrainerCohortRule;
  family: Exclude<BacktestCacheFamily, "all">;
  cohortYear: number;
  minimumSettledRuns?: number;
}): ResolvedTrainerCohort {
  const referenceYear = input.cohortYear - 1;
  const from = `${referenceYear}-01-01`;
  const to = `${referenceYear}-12-31`;
  const standings = new Map<string, {
    trainerId: string;
    trainerName: string;
    runs: number;
    wins: number;
  }>();

  for (const row of input.rows) {
    if (
      row.family !== input.family ||
      row.raceDate < from ||
      row.raceDate > to ||
      !row.trainerId ||
      !row.trainerName ||
      !isSettledRunner(row)
    ) {
      continue;
    }
    const standing = standings.get(row.trainerId) ?? {
      trainerId: row.trainerId,
      trainerName: row.trainerName,
      runs: 0,
      wins: 0,
    };
    standing.runs += 1;
    if (row.finishingPosition === 1) {
      standing.wins += 1;
    }
    standings.set(row.trainerId, standing);
  }

  const members = [...standings.values()]
    .filter((standing) => standing.runs >= (input.minimumSettledRuns ?? TRAINER_COHORT_MIN_SETTLED_RUNNERS))
    .sort((left, right) =>
      right.wins - left.wins ||
      right.runs - left.runs ||
      left.trainerName.localeCompare(right.trainerName) ||
      left.trainerId.localeCompare(right.trainerId),
    )
    .slice(0, input.definition.top)
    .map((standing, index): TrainerCohortMember => ({
      cohortYear: input.cohortYear,
      referenceYear,
      family: input.family,
      rank: index + 1,
      trainerId: standing.trainerId,
      trainerName: standing.trainerName,
      priorYearRuns: standing.runs,
      priorYearWins: standing.wins,
      priorYearWinRate: (standing.wins / standing.runs) * 100,
    }));

  return {
    definition: input.definition,
    cohortYear: input.cohortYear,
    referenceYear,
    family: input.family,
    members,
    trainerIds: new Set(members.map((member) => member.trainerId)),
  };
}

export async function getTrainerCohortForRule(
  db: Db,
  rule: ResearchRuleV1,
  cohortYear: number,
): Promise<ResolvedTrainerCohort | null> {
  const definition = rule.runner.trainerCohort;
  if (!definition) {
    return null;
  }
  const referenceYear = cohortYear - 1;
  const familyCondition = targetFamilyCondition(rule.family);
  const settledCondition = and(
    sql`${raceRunners.finishingPosition} is not null`,
    sql`coalesce(${raceRunners.resultStatus}, '') <> 'non_runner'`,
  );
  const rows = await db
    .select({
      trainerId: raceRunners.trainerId,
      trainerName: trainers.displayName,
      priorYearRuns: sql<number>`count(*)::int`,
      priorYearWins: sql<number>`sum(case when ${raceRunners.finishingPosition} = 1 then 1 else 0 end)::int`,
    })
    .from(raceRunners)
    .innerJoin(races, eq(raceRunners.raceId, races.id))
    .innerJoin(courses, eq(races.courseId, courses.id))
    .leftJoin(trainers, eq(raceRunners.trainerId, trainers.id))
    .leftJoin(
      sourceImports,
      and(
        eq(sourceImports.source, "sporting_life"),
        eq(sourceImports.sourceId, races.sourceId),
        eq(sourceImports.sourceType, "full-result-next-data"),
      ),
    )
    .where(and(
      eq(raceRunners.source, "sporting_life"),
      eq(races.source, "sporting_life"),
      gte(races.raceDate, `${referenceYear}-01-01`),
      lte(races.raceDate, `${referenceYear}-12-31`),
      settledCondition,
      sql`${raceRunners.trainerId} is not null`,
      familyCondition,
    ))
    .groupBy(raceRunners.trainerId, trainers.displayName);

  const members = rows
    .filter((row) => row.trainerId !== null && row.trainerName !== null)
    .filter((row) => row.priorYearRuns >= TRAINER_COHORT_MIN_SETTLED_RUNNERS)
    .sort((left, right) =>
      right.priorYearWins - left.priorYearWins ||
      right.priorYearRuns - left.priorYearRuns ||
      (left.trainerName ?? "").localeCompare(right.trainerName ?? "") ||
      (left.trainerId ?? "").localeCompare(right.trainerId ?? ""),
    )
    .slice(0, definition.top)
    .map((row, index): TrainerCohortMember => ({
      cohortYear,
      referenceYear,
      family: rule.family,
      rank: index + 1,
      trainerId: row.trainerId!,
      trainerName: row.trainerName!,
      priorYearRuns: row.priorYearRuns,
      priorYearWins: row.priorYearWins,
      priorYearWinRate: (row.priorYearWins / row.priorYearRuns) * 100,
    }));

  return {
    definition,
    cohortYear,
    referenceYear,
    family: rule.family,
    members,
    trainerIds: new Set(members.map((member) => member.trainerId)),
  };
}

export function trainerCohortLabel(input: {
  top: TrainerCohortTop;
  referenceYear: number;
  family: Exclude<BacktestCacheFamily, "all">;
}) {
  return `Top ${input.top} by ${input.referenceYear} ${familyLabel(input.family)} wins`;
}

function isSettledRunner(row: TrainerCohortStandingInput) {
  return row.finishingPosition !== null && row.resultStatus !== "non_runner";
}

function familyLabel(family: Exclude<BacktestCacheFamily, "all">) {
  if (family === "all_weather_flat") return "All Weather";
  if (family === "turf_flat") return "Turf";
  return "Jump";
}
