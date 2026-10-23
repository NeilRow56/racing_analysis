import { isJumpRace } from "./jump-speed-rating";
import type { HistoricalRunInput } from "./horse-metrics";

export type JumpSpeedReliability = {
  level: "HIGH" | "MEDIUM" | "LOW";
  relevantJumpRuns: number;
  windowRuns: number;
  nonJumpRuns: number;
  reason: string;
};

type RecentRun = Pick<HistoricalRunInput, "raceName" | "raceType" | "jumpSpeedRating">;

/**
 * Receives the same already eligible, newest-first all-code window as Best L3.
 * Do not reselect the last three usable Jump runs: Flat/AW and unavailable
 * figures still occupy slots. The existing Jump domain pools Hurdle, Chase
 * and NH Flat; switching between them is not contamination of this rating.
 * Only availability is inspected, never the rating's magnitude or the result.
 */
export function assessJumpSpeedReliability(
  recentRuns: readonly RecentRun[] = [],
): JumpSpeedReliability {
  const window = recentRuns.slice(0, 3);
  const nonJumpRuns = window.filter((run) => !isJumpRace(run)).length;
  const relevantJumpRuns = window.filter((run) =>
    isJumpRace(run) && typeof run.jumpSpeedRating?.rating === "number" &&
    Number.isFinite(run.jumpSpeedRating.rating),
  ).length;
  const level = relevantJumpRuns === 3 ? "HIGH" : relevantJumpRuns === 2 ? "MEDIUM" : "LOW";
  const basis = relevantJumpRuns === 3
    ? "Based on three recent relevant Jump performances."
    : relevantJumpRuns === 2
      ? "Two relevant Jump runs with usable Speed figures in the recent window."
      : relevantJumpRuns === 1
        ? "Only one relevant Jump run with a usable Speed figure in the recent window; the figure may be less representative."
        : "Insufficient recent relevant Jump history with usable Speed figures.";
  const context = nonJumpRuns > 0
    ? ` Recent window includes ${nonJumpRuns === 1 ? "a non-Jump run" : `${nonJumpRuns} non-Jump runs`}, leaving fewer Jump performances represented.`
    : window.length > relevantJumpRuns
      ? " Some recent Jump runs have no usable Speed figure."
      : "";
  return { level, relevantJumpRuns, windowRuns: window.length, nonJumpRuns, reason: basis + context };
}
