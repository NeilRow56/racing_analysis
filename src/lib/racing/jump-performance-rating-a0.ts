import {
  calculateJumpRaceRatings,
  type JumpRatingInput,
} from "./jump-performance-rating";

export const JUMP_RATING_A0_VERSION = "JPR_A0_V1" as const;
export const JUMP_RATING_A0_IMPLEMENTATION_EPOCH = "2026-09-27T06:06:49.000Z";

export type JumpRatingA0Source = "normal_jpr_a" | "trainer_fallback";

export type RankedJumpRatingA0 = {
  version: typeof JUMP_RATING_A0_VERSION;
  score: number;
  rank: number;
  ratingSource: JumpRatingA0Source;
};

export function calculateJumpRaceA0Ratings(
  inputs: JumpRatingInput[],
): Map<string, RankedJumpRatingA0 | null> {
  const baseRatings = calculateJumpRaceRatings(inputs);
  const scores = new Map<string, { score: number; ratingSource: JumpRatingA0Source }>();

  for (const input of inputs) {
    if (input.resultStatus === "non_runner") continue;
    const base = baseRatings.get(input.runnerId)!;
    if (base.jprA) {
      scores.set(input.runnerId, { score: base.jprA.score, ratingSource: "normal_jpr_a" });
      continue;
    }
    const speedAvailable = input.averageJumpSpeedLast3 !== null && Number.isFinite(input.averageJumpSpeedLast3);
    const trainerRank = base.components.trainerPriorStrikeRate;
    if (!speedAvailable && trainerRank !== null) {
      scores.set(input.runnerId, { score: trainerRank, ratingSource: "trainer_fallback" });
    }
  }

  const ranks = ascendingCompetitionRanks(scores);
  return new Map(inputs.map((input) => {
    const value = scores.get(input.runnerId);
    return [input.runnerId, value ? {
      version: JUMP_RATING_A0_VERSION,
      score: value.score,
      rank: ranks.get(input.runnerId)!,
      ratingSource: value.ratingSource,
    } : null];
  }));
}

function ascendingCompetitionRanks(
  scores: Map<string, { score: number }>,
): Map<string, number> {
  const sorted = [...scores].sort((left, right) =>
    left[1].score - right[1].score || left[0].localeCompare(right[0])
  );
  const ranks = new Map<string, number>();
  let previousScore: number | null = null;
  let previousRank = 0;
  sorted.forEach(([runnerId, value], index) => {
    const rank = value.score === previousScore ? previousRank : index + 1;
    ranks.set(runnerId, rank);
    previousScore = value.score;
    previousRank = rank;
  });
  return ranks;
}
