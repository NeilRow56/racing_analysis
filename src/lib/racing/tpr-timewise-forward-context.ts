import type {
  ForwardRaceInput,
  ForwardRaceRecord,
} from "../../../scripts/diagnose-tpr-vs-timewise-forward";
import {
  isOrdinaryFlatTurfRaceForDisplay,
  type TodayRace,
  type TodayRunner,
} from "./todays-racing";

export const TIMEWISE_NON_RUNNER_VALUE = "__timewise_non_runner__";

export function isTimewiseEligibleRace(race: TodayRace) {
  return isOrdinaryFlatTurfRaceForDisplay(race);
}

export function trackerRaceTime(scheduledTime: string | null): string | null {
  const match = scheduledTime?.match(/^(\d{1,2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : null;
}

export function timewiseTimingForSave(
  existing: ForwardRaceRecord | undefined,
  scheduledAt: Date | null,
  recordedAt = new Date(),
) {
  if (existing) {
    return {
      timewiseRecordedAt: existing.timewiseRecordedAt ?? null,
      timewiseRecordedPreRace: existing.timewiseRecordedPreRace ?? null,
      timewiseUpdatedAt: recordedAt.toISOString(),
    };
  }
  return {
    timewiseRecordedAt: recordedAt.toISOString(),
    timewiseRecordedPreRace: scheduledAt === null ? null : recordedAt < scheduledAt,
    timewiseUpdatedAt: null,
  };
}

export function buildTodayForwardInput({
  course,
  race,
  raceDate,
  timewiseRank1,
  timewiseRank1NonRunner = false,
  timewiseRank2,
  timewiseRank2NonRunner = false,
}: {
  course: string;
  race: TodayRace;
  raceDate: string;
  timewiseRank1: string | null;
  timewiseRank1NonRunner?: boolean;
  timewiseRank2: string | null;
  timewiseRank2NonRunner?: boolean;
}): ForwardRaceInput {
  const raceTime = trackerRaceTime(race.scheduledTime);
  const tprRank1 = rankedRunner(race.runners, (runner) => runner.turfPerformanceRating?.rank, 1);
  const tprRank2 = rankedRunner(race.runners, (runner) => runner.turfPerformanceRating?.rank, 2);
  if (!raceTime || !tprRank1 || !tprRank2) {
    throw new Error("This race does not have a complete W100 TPR top two.");
  }

  const winner = race.runners.find((runner) => runner.finishingPosition === 1) ?? null;
  const orRanks = competitionRanks(race.runners, (runner) => runner.officialRating);
  return {
    raceDate,
    course,
    raceTime,
    winner: winner?.horseName ?? null,
    winnerSp: parseDecimalOdds(winner?.oddsDecimal ?? null),
    tprRank1: tprRank1.horseName,
    tprRank2: tprRank2.horseName,
    timewiseRank1,
    timewiseRank2,
    timewiseRank1NonRunner,
    timewiseRank2NonRunner,
    w50Rank1: rankedRunner(race.runners, (runner) => runner.turfPerformanceShadowRating?.rank, 1)?.horseName
      ?? race.turfPerformanceShadow?.w50HorseName
      ?? null,
    orRank1: rankedRunner(race.runners, (runner) => orRanks.get(runner.runnerId), 1)?.horseName ?? null,
    winnerOrRank: winner ? orRanks.get(winner.runnerId) ?? null : null,
  };
}

function rankedRunner(
  runners: TodayRunner[],
  rank: (runner: TodayRunner) => number | null | undefined,
  targetRank: number,
) {
  return runners.find((runner) => runner.resultStatus !== "non_runner" && rank(runner) === targetRank) ?? null;
}

function competitionRanks(
  runners: TodayRunner[],
  value: (runner: TodayRunner) => number | null,
) {
  const values = [...new Set(runners
    .filter((runner) => runner.resultStatus !== "non_runner")
    .map(value)
    .filter((rating): rating is number => rating !== null))]
    .sort((left, right) => right - left);
  return new Map(runners.map((runner) => {
    const rating = value(runner);
    return [runner.runnerId, rating === null ? null : values.indexOf(rating) + 1] as const;
  }));
}

function parseDecimalOdds(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 1 ? parsed : null;
}
