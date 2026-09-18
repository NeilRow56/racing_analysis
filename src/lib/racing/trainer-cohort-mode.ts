export const TRAINER_COHORT_MIN_SETTLED_RUNNERS = 50;
export const TRAINER_COHORT_RANKING_METRIC = "wins";
export const TRAINER_COHORT_PERIOD = "prior_calendar_year";
export const TRAINER_COHORT_TOP_OPTIONS = [10, 20, 30] as const;

export type TrainerCohortFamily = "jump" | "all_weather_flat" | "turf_flat";
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
  family: TrainerCohortFamily;
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
  family: TrainerCohortFamily;
  qualifiedTrainerCount?: number;
  members: TrainerCohortMember[];
  trainerIds: Set<string>;
};

export function trainerCohortRule(top: TrainerCohortTop): TrainerCohortRule {
  return {
    top,
    period: TRAINER_COHORT_PERIOD,
    rankingMetric: TRAINER_COHORT_RANKING_METRIC,
  };
}

/**
 * Trainer cohorts are anchored to the evaluated range's from-date year.
 * A nonstandard range such as 2026-03-01 to 2026-12-31 still uses only 2025 results.
 */
export function trainerCohortYearFromDate(date: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid trainer cohort date: ${date}`);
  }
  const year = Number(date.slice(0, 4));
  if (!Number.isInteger(year)) {
    throw new Error(`Invalid trainer cohort date: ${date}`);
  }
  return year;
}

export function trainerCohortReferenceYearFromDate(date: string): number {
  return trainerCohortYearFromDate(date) - 1;
}

export function isTrainerCohortTop(value: unknown): value is TrainerCohortTop {
  return TRAINER_COHORT_TOP_OPTIONS.includes(value as TrainerCohortTop);
}

export function parseTrainerCohortTop(value: string | null | undefined): TrainerCohortTop | undefined {
  const parsed = Number(value);
  return isTrainerCohortTop(parsed) ? parsed : undefined;
}

export function trainerCohortLabel(input: {
  top: TrainerCohortTop;
  referenceYear: number;
  family: TrainerCohortFamily;
}) {
  return `Top ${input.top} by ${input.referenceYear} ${familyLabel(input.family)} wins`;
}

function familyLabel(family: TrainerCohortFamily) {
  if (family === "all_weather_flat") return "All Weather";
  if (family === "turf_flat") return "Turf";
  return "Jump";
}
