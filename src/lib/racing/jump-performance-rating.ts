import type { TodayRace, TodayRunner } from "./todays-racing";
import { isJumpRace } from "./jump-speed-rating";
import {
  calculateRatingCoverage,
  JPR_A_RATING_COVERAGE_GUARD_IMPLEMENTED_AT,
  JPR_A_RATING_COVERAGE_GUARD_VERSION,
} from "./rating-coverage";

export const JUMP_RATING_A_VERSION = "JPR_A_V1" as const;
export const JUMP_RATING_B_VERSION = "JPR_B_V1" as const;

export type JumpRatingVersion =
  | typeof JUMP_RATING_A_VERSION
  | typeof JUMP_RATING_B_VERSION;

export type JumpRatingComponentRanks = {
  averageJumpSpeedLast3: number | null;
  trainerPriorStrikeRate: number | null;
  officialRating: number | null;
};

export type RankedJumpRating = {
  version: JumpRatingVersion;
  score: number;
  rank: number;
};

export type JumpRatingRunner = {
  components: JumpRatingComponentRanks;
  jprA: RankedJumpRating | null;
  jprB: RankedJumpRating | null;
};

export type JumpRatingInput = {
  runnerId: string;
  resultStatus: string | null;
  averageJumpSpeedLast3: number | null;
  trainerPriorStrikeRate: number | null;
  officialRating: number | null;
};

export function calculateJumpRaceRatings(
  inputs: JumpRatingInput[],
): Map<string, JumpRatingRunner> {
  const active = inputs.filter((input) => input.resultStatus !== "non_runner");
  const speedRanks = descendingCompetitionRanks(
    active,
    (input) => input.averageJumpSpeedLast3,
  );
  const trainerRanks = descendingCompetitionRanks(
    active,
    (input) => input.trainerPriorStrikeRate,
  );
  const officialRatingRanks = descendingCompetitionRanks(
    active,
    (input) => input.officialRating,
  );
  const jprAScores = completeCaseAverageRanks(active, [speedRanks, trainerRanks]);
  const jprBScores = completeCaseAverageRanks(active, [speedRanks, officialRatingRanks]);
  const jprARanks = ascendingCompetitionRanks(jprAScores);
  const jprBRanks = ascendingCompetitionRanks(jprBScores);

  return new Map(inputs.map((input) => {
    const jprAScore = jprAScores.get(input.runnerId);
    const jprBScore = jprBScores.get(input.runnerId);
    return [input.runnerId, {
      components: {
        averageJumpSpeedLast3: speedRanks.get(input.runnerId) ?? null,
        trainerPriorStrikeRate: trainerRanks.get(input.runnerId) ?? null,
        officialRating: officialRatingRanks.get(input.runnerId) ?? null,
      },
      jprA: jprAScore === undefined
        ? null
        : {
            version: JUMP_RATING_A_VERSION,
            score: jprAScore,
            rank: jprARanks.get(input.runnerId)!,
          },
      jprB: jprBScore === undefined
        ? null
        : {
            version: JUMP_RATING_B_VERSION,
            score: jprBScore,
            rank: jprBRanks.get(input.runnerId)!,
          },
    }];
  }));
}

export function attachJumpRaceRatings(race: TodayRace): TodayRace {
  if (!isJumpRace(race)) return race;
  const ratings = calculateJumpRaceRatings(race.runners.map(jumpRatingInputForTodayRunner));
  const jprARatingCoverage = calculateRatingCoverage(
    race.runners,
    (runner) => ratings.get(runner.runnerId)?.jprA !== null,
    JPR_A_RATING_COVERAGE_GUARD_VERSION,
    JPR_A_RATING_COVERAGE_GUARD_IMPLEMENTED_AT,
  );
  return {
    ...race,
    jumpRatingCoverage: { jprA: jprARatingCoverage },
    runners: race.runners.map((runner) => ({
      ...runner,
      jumpRating: ratings.get(runner.runnerId),
    })),
  };
}

export function jumpRatingInputForTodayRunner(
  runner: TodayRunner,
): JumpRatingInput {
  return {
    runnerId: runner.runnerId,
    resultStatus: runner.resultStatus,
    averageJumpSpeedLast3: runner.metrics?.averageJumpSpeedLast3 ?? null,
    trainerPriorStrikeRate: runner.trainerMetrics?.trainerPriorWinRate ?? null,
    officialRating: runner.officialRating,
  };
}

function descendingCompetitionRanks(
  inputs: JumpRatingInput[],
  valueFor: (input: JumpRatingInput) => number | null,
): Map<string, number> {
  const ranked = inputs
    .map((input) => ({ input, value: valueFor(input) }))
    .filter((entry): entry is { input: JumpRatingInput; value: number } =>
      entry.value !== null && Number.isFinite(entry.value)
    )
    .sort((left, right) =>
      right.value - left.value || left.input.runnerId.localeCompare(right.input.runnerId)
    );
  return competitionRanks(ranked, (entry) => entry.value, (entry) => entry.input.runnerId);
}

function completeCaseAverageRanks(
  inputs: JumpRatingInput[],
  componentRanks: Array<Map<string, number>>,
): Map<string, number> {
  const scores = new Map<string, number>();
  for (const input of inputs) {
    const ranks = componentRanks.map((component) => component.get(input.runnerId));
    const completeRanks = ranks.filter((rank): rank is number => rank !== undefined);
    if (completeRanks.length !== componentRanks.length) continue;
    scores.set(
      input.runnerId,
      completeRanks.reduce((total, rank) => total + rank, 0) / completeRanks.length,
    );
  }
  return scores;
}

function ascendingCompetitionRanks(
  scores: Map<string, number>,
): Map<string, number> {
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
