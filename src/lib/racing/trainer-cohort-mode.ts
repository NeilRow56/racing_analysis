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
