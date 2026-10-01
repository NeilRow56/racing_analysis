import { isCurrentAllWeatherRace } from "./current-race-classification";
import type { TodayRace, TodayRunner } from "./todays-racing";

export const AW_RATING_D_VERSION = "AW_D_V1" as const;
export const AW_RATING_A_VERSION = "AW_A_V1" as const;
export const AW_D_RATING_COVERAGE_GUARD_VERSION = "aw_d_rating_coverage_guard_v1" as const;
export const AW_D_RATING_COVERAGE_GUARD_IMPLEMENTED_AT = "2026-09-30T00:00:00.000Z" as const;
export const AW_D_MIN_RATED_RUNNERS = 2;
export const AW_D_MIN_RATING_COVERAGE = 0.2;

export type RatingCoverageStatus = "eligible" | "insufficient_coverage";

export type AwRatingComponentRanks = {
  averageAwSpeedLast3: number | null;
  trainerPriorStrikeRate: number | null;
  jockeyPriorStrikeRate: number | null;
};

export type RankedAwRating = {
  score: number;
  rank: number;
};

export type AwRatingRunner = {
  components: AwRatingComponentRanks;
  awD: (RankedAwRating & { version: typeof AW_RATING_D_VERSION }) | null;
  awA: (RankedAwRating & { version: typeof AW_RATING_A_VERSION }) | null;
};

export type AwRatingCoverage = {
  activeRunnerCount: number;
  ratedRunnerCount: number;
  ratingCoverage: number;
  ratingCoverageStatus: RatingCoverageStatus;
  guardVersion: typeof AW_D_RATING_COVERAGE_GUARD_VERSION;
  guardImplementedAt: typeof AW_D_RATING_COVERAGE_GUARD_IMPLEMENTED_AT;
};

export type AwRatingInput = {
  runnerId: string;
  resultStatus: string | null;
  averageAwSpeedLast3: number | null;
  trainerPriorStrikeRate: number | null;
  jockeyPriorStrikeRate: number | null;
};

export function calculateAwRaceRatings(
  inputs: AwRatingInput[],
): Map<string, AwRatingRunner> {
  const active = inputs.filter((input) => input.resultStatus !== "non_runner");
  const speedRanks = descendingCompetitionRanks(
    active,
    (input) => input.averageAwSpeedLast3,
  );
  const trainerRanks = descendingCompetitionRanks(
    active,
    (input) => input.trainerPriorStrikeRate,
  );
  const jockeyRanks = descendingCompetitionRanks(
    active,
    (input) => input.jockeyPriorStrikeRate,
  );
  const awDScores = completeCaseAverageRanks(active, [
    speedRanks,
    trainerRanks,
    jockeyRanks,
  ]);
  const awAScores = completeCaseAverageRanks(active, [speedRanks, trainerRanks]);
  const awDRanks = ascendingCompetitionRanks(awDScores);
  const awARanks = ascendingCompetitionRanks(awAScores);

  return new Map(inputs.map((input) => {
    const awDScore = awDScores.get(input.runnerId);
    const awAScore = awAScores.get(input.runnerId);
    return [input.runnerId, {
      components: {
        averageAwSpeedLast3: speedRanks.get(input.runnerId) ?? null,
        trainerPriorStrikeRate: trainerRanks.get(input.runnerId) ?? null,
        jockeyPriorStrikeRate: jockeyRanks.get(input.runnerId) ?? null,
      },
      awD: awDScore === undefined
        ? null
        : {
            version: AW_RATING_D_VERSION,
            score: awDScore,
            rank: awDRanks.get(input.runnerId)!,
          },
      awA: awAScore === undefined
        ? null
        : {
            version: AW_RATING_A_VERSION,
            score: awAScore,
            rank: awARanks.get(input.runnerId)!,
          },
    }];
  }));
}

export function attachAwRaceRatings(race: TodayRace): TodayRace {
  if (!isCurrentAllWeatherRace(race)) return race;
  const ratings = calculateAwRaceRatings(race.runners.map(awRatingInputForTodayRunner));
  const awDRatingCoverage = calculateAwDRatingCoverage(race.runners, ratings);
  return {
    ...race,
    awRatingCoverage: { awD: awDRatingCoverage },
    runners: race.runners.map((runner) => ({
      ...runner,
      awRating: ratings.get(runner.runnerId),
    })),
  };
}

export function calculateAwDRatingCoverage(
  runners: Array<{ runnerId: string; resultStatus: string | null }>,
  ratings: ReadonlyMap<string, AwRatingRunner>,
): AwRatingCoverage {
  const active = runners.filter((runner) => runner.resultStatus !== "non_runner");
  const ratedRunnerCount = active.filter((runner) => ratings.get(runner.runnerId)?.awD !== null).length;
  const ratingCoverage = active.length === 0 ? 0 : ratedRunnerCount / active.length;
  return {
    activeRunnerCount: active.length,
    ratedRunnerCount,
    ratingCoverage,
    ratingCoverageStatus: ratedRunnerCount >= AW_D_MIN_RATED_RUNNERS && ratingCoverage >= AW_D_MIN_RATING_COVERAGE
      ? "eligible"
      : "insufficient_coverage",
    guardVersion: AW_D_RATING_COVERAGE_GUARD_VERSION,
    guardImplementedAt: AW_D_RATING_COVERAGE_GUARD_IMPLEMENTED_AT,
  };
}

export function isAwDRatingRankEligible(coverage: Pick<AwRatingCoverage, "ratedRunnerCount" | "ratingCoverage">): boolean {
  return coverage.ratedRunnerCount >= AW_D_MIN_RATED_RUNNERS && coverage.ratingCoverage >= AW_D_MIN_RATING_COVERAGE;
}

export function awRatingInputForTodayRunner(runner: TodayRunner): AwRatingInput {
  return {
    runnerId: runner.runnerId,
    resultStatus: runner.resultStatus,
    averageAwSpeedLast3: runner.metrics?.averageAwSpeedLast3 ?? null,
    trainerPriorStrikeRate: runner.trainerMetrics?.trainerPriorWinRate ?? null,
    jockeyPriorStrikeRate: runner.jockeyMetrics?.jockeyPriorWinRate ?? null,
  };
}

function descendingCompetitionRanks(
  inputs: AwRatingInput[],
  valueFor: (input: AwRatingInput) => number | null,
): Map<string, number> {
  const ranked = inputs
    .map((input) => ({ input, value: valueFor(input) }))
    .filter((entry): entry is { input: AwRatingInput; value: number } =>
      entry.value !== null && Number.isFinite(entry.value)
    )
    .sort((left, right) =>
      right.value - left.value || left.input.runnerId.localeCompare(right.input.runnerId)
    );
  return competitionRanks(ranked, (entry) => entry.value, (entry) => entry.input.runnerId);
}

function completeCaseAverageRanks(
  inputs: AwRatingInput[],
  componentRanks: Array<Map<string, number>>,
): Map<string, number> {
  const scores = new Map<string, number>();
  for (const input of inputs) {
    const ranks = componentRanks.map((component) => component.get(input.runnerId));
    if (ranks.some((rank) => rank === undefined)) continue;
    scores.set(
      input.runnerId,
      ranks.reduce<number>((total, rank) => total + rank!, 0) / ranks.length,
    );
  }
  return scores;
}

function ascendingCompetitionRanks(scores: Map<string, number>): Map<string, number> {
  const ranked = [...scores].sort((left, right) =>
    left[1] - right[1] || left[0].localeCompare(right[0])
  );
  return competitionRanks(ranked, (entry) => entry[1], (entry) => entry[0]);
}

function competitionRanks<T>(
  sorted: T[],
  valueFor: (entry: T) => number,
  idFor: (entry: T) => string,
): Map<string, number> {
  const ranks = new Map<string, number>();
  let previousValue: number | null = null;
  let previousRank = 0;
  sorted.forEach((entry, index) => {
    const value = valueFor(entry);
    const rank = value === previousValue ? previousRank : index + 1;
    ranks.set(idFor(entry), rank);
    previousValue = value;
    previousRank = rank;
  });
  return ranks;
}
