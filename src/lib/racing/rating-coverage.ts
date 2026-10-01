export const MIN_RACE_RATED_RUNNERS = 2;
export const MIN_RACE_RATING_COVERAGE = 0.2;

export const TPR_RATING_COVERAGE_GUARD_VERSION = "tpr_rating_coverage_guard_v1" as const;
export const TPR_RATING_COVERAGE_GUARD_IMPLEMENTED_AT = "2026-09-30T00:00:00.000Z" as const;
export const JPR_A_RATING_COVERAGE_GUARD_VERSION = "jpr_a_rating_coverage_guard_v1" as const;
export const JPR_A_RATING_COVERAGE_GUARD_IMPLEMENTED_AT = "2026-09-30T00:00:00.000Z" as const;
export const RATING_COVERAGE_EXCLUSION_REASON = "insufficient_rating_coverage" as const;

export type RatingCoverageStatus = "eligible" | "insufficient_coverage";

export type RatingCoverage = {
  activeRunnerCount: number;
  ratedRunnerCount: number;
  ratingCoverage: number;
  ratingCoverageStatus: RatingCoverageStatus;
  guardVersion: string;
  guardImplementedAt: string;
};

export function calculateRatingCoverage<T extends { resultStatus: string | null }>(
  runners: T[],
  isRated: (runner: T) => boolean,
  guardVersion: string,
  guardImplementedAt: string,
): RatingCoverage {
  const active = runners.filter((runner) => runner.resultStatus !== "non_runner");
  const ratedRunnerCount = active.filter(isRated).length;
  const ratingCoverage = active.length === 0 ? 0 : ratedRunnerCount / active.length;
  return {
    activeRunnerCount: active.length,
    ratedRunnerCount,
    ratingCoverage,
    ratingCoverageStatus: isRatingCoverageEligible({ ratedRunnerCount, ratingCoverage })
      ? "eligible"
      : "insufficient_coverage",
    guardVersion,
    guardImplementedAt,
  };
}

export function isRatingCoverageEligible(
  coverage: Pick<RatingCoverage, "ratedRunnerCount" | "ratingCoverage">,
): boolean {
  return coverage.ratedRunnerCount >= MIN_RACE_RATED_RUNNERS &&
    coverage.ratingCoverage >= MIN_RACE_RATING_COVERAGE;
}
