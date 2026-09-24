import {
  createRecord,
  type ForwardRaceInput,
  type ForwardRaceRecord,
} from "../../../scripts/diagnose-tpr-vs-timewise-forward";
import {
  isAllWeatherRaceForDisplay,
  isOrdinaryFlatTurfRaceForDisplay,
  type TodayRace,
  type TodayRunner,
} from "./todays-racing";
import {
  buildCanonicalTurfPerformanceRatingInput,
  turfPerformanceRelativeWeightContribution,
} from "./turf-performance-rating";

export const TIMEWISE_NON_RUNNER_VALUE = "__timewise_non_runner__";

export function isTimewiseEligibleRace(race: TodayRace) {
  return timewiseRaceFamily(race) !== null;
}

export function timewiseRaceFamily(race: TodayRace): "turf" | "all_weather" | null {
  if (isOrdinaryFlatTurfRaceForDisplay(race)) return "turf";
  if (isAllWeatherRaceForDisplay(race)) return "all_weather";
  return null;
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
  if (!raceTime) throw new Error("This race does not have a valid scheduled time.");
  const family = timewiseRaceFamily(race);
  if (!family) throw new Error("Timewise tracking is available for Turf and All Weather races only.");
  const [tprRank1, tprRank2] = family === "turf" ? orderedTprRunners(race.runners) : [];

  const winners = race.runners.filter((runner) => runner.finishingPosition === 1);
  const winner = winners[0] ?? null;
  const orRanks = competitionRanks(race.runners, (runner) => runner.officialRating);
  const awSpeedRanks = competitionRanks(race.runners, (runner) => runner.metrics?.bestAwSpeedLast3 ?? null);
  const awPerformanceRanks = competitionRanks(race.runners, (runner) => runner.metrics?.bestPerformanceLast3 ?? null);
  const awBestL3SpeedRank1 = family === "all_weather"
    ? rankedRunner(race.runners, (runner) => awSpeedRanks.get(runner.runnerId), 1)?.horseName ?? null
    : null;
  const awBestL3PerformanceRank1 = family === "all_weather"
    ? rankedRunner(race.runners, (runner) => awPerformanceRanks.get(runner.runnerId), 1)?.horseName ?? null
    : null;
  return {
    family,
    raceDate,
    course,
    raceTime,
    winner: winner?.horseName ?? null,
    winnerSp: parseDecimalOdds(winner?.oddsDecimal ?? null),
    winners: winners.map((runner) => ({ horseName: runner.horseName, decimalOdds: parseDecimalOdds(runner.oddsDecimal) })),
    tprRank1: tprRank1?.horseName ?? null,
    tprRank2: tprRank2?.horseName ?? null,
    tprRank1NonRunner: false,
    tprRank2NonRunner: false,
    timewiseRank1,
    timewiseRank2,
    timewiseRank1NonRunner,
    timewiseRank2NonRunner,
    w50Rank1: family === "turf"
      ? rankedRunner(race.runners, (runner) => runner.turfPerformanceShadowRating?.rank, 1)?.horseName
        ?? race.turfPerformanceShadow?.w50HorseName
        ?? null
      : null,
    w50Rank1NonRunner: false,
    tprInputSnapshot: family === "turf" ? buildTprInputSnapshot(race.runners) : null,
    awBestL3SpeedRank1,
    awBestL3PerformanceRank1,
    orRank1: rankedRunner(race.runners, (runner) => orRanks.get(runner.runnerId), 1)?.horseName ?? null,
    winnerOrRank: winner ? orRanks.get(winner.runnerId) ?? null : null,
  };
}

export function orderedTprRunners(runners: TodayRunner[]) {
  return runners
    .filter((runner) => runner.resultStatus !== "non_runner" && runner.turfPerformanceRating !== undefined)
    .sort((left, right) =>
      right.turfPerformanceRating!.rating - left.turfPerformanceRating!.rating ||
      left.runnerId.localeCompare(right.runnerId)
    )
    .slice(0, 2);
}

export function enrichForwardRecordResult(
  record: ForwardRaceRecord,
  race: TodayRace,
): ForwardRaceRecord {
  const tprRank1NonRunner = selectionIsNonRunner(record.tprRank1, race.runners);
  const tprRank2NonRunner = selectionIsNonRunner(record.tprRank2, race.runners);
  const w50Rank1NonRunner = selectionIsNonRunner(record.w50Rank1, race.runners);
  const timewiseRank1NonRunner = record.timewiseRank1NonRunner || selectionIsNonRunner(record.timewiseRank1, race.runners);
  const timewiseRank2NonRunner = record.timewiseRank2NonRunner || selectionIsNonRunner(record.timewiseRank2, race.runners);
  const winners = race.runners.filter((runner) => runner.finishingPosition === 1);
  const winner = winners[0];
  if (!winner) {
    if (Boolean(record.tprRank1NonRunner) === tprRank1NonRunner &&
      Boolean(record.tprRank2NonRunner) === tprRank2NonRunner &&
      Boolean(record.w50Rank1NonRunner) === w50Rank1NonRunner &&
      Boolean(record.timewiseRank1NonRunner) === timewiseRank1NonRunner &&
      Boolean(record.timewiseRank2NonRunner) === timewiseRank2NonRunner) return record;
    return createRecord({ ...record, tprRank1NonRunner, tprRank2NonRunner, w50Rank1NonRunner, timewiseRank1NonRunner, timewiseRank2NonRunner });
  }
  const orRanks = competitionRanks(race.runners, (runner) => runner.officialRating);
  const winnerSp = parseDecimalOdds(winner.oddsDecimal);
  const winnerOrRank = orRanks.get(winner.runnerId) ?? null;
  const winnerEntries = winners.map((runner) => ({ horseName: runner.horseName, decimalOdds: parseDecimalOdds(runner.oddsDecimal) }));
  if (record.winner === winner.horseName && record.winnerSp === winnerSp && record.winnerOrRank === winnerOrRank && JSON.stringify(record.winners) === JSON.stringify(winnerEntries) && Boolean(record.tprRank1NonRunner) === tprRank1NonRunner && Boolean(record.tprRank2NonRunner) === tprRank2NonRunner && Boolean(record.w50Rank1NonRunner) === w50Rank1NonRunner && Boolean(record.timewiseRank1NonRunner) === timewiseRank1NonRunner && Boolean(record.timewiseRank2NonRunner) === timewiseRank2NonRunner) {
    return record;
  }
  return createRecord({
    ...record,
    winner: winner.horseName,
    winnerSp,
    winners: winnerEntries,
    winnerOrRank,
    tprRank1NonRunner,
    tprRank2NonRunner,
    w50Rank1NonRunner,
    timewiseRank1NonRunner,
    timewiseRank2NonRunner,
  });
}

function buildTprInputSnapshot(runners: TodayRunner[]) {
  const snapshotRunners = runners.flatMap((runner) => {
    const input = runner.turfPerformanceInput;
    if (!input || runner.resultStatus === "non_runner") return [];
    const w50Input = buildCanonicalTurfPerformanceRatingInput({
      latestPerformanceRating: input.latestPerformanceRating,
      previousPerformanceRating: input.previousPerformanceRating,
      averagePerformanceLast3: input.averagePerformanceLast3,
      latestSpeedRating: input.latestSpeedRating,
      previousSpeedRating: input.previousSpeedRating,
      averageSpeedLast3: input.averageSpeedLast3,
      raceClass: input.raceClass,
      weightCarriedLbs: input.weightCarriedLbs,
      raceMedianWeightCarriedLbs: input.raceMedianWeightCarriedLbs,
      weightCoefficientMultiplier: 0.5,
    });
    return [{
      runnerId: runner.runnerId,
      horseName: runner.horseName,
      input,
      w100Rating: runner.turfPerformanceRating?.rating ?? null,
      w100RawRating: runner.turfPerformanceRating?.rawRating ?? null,
      w100Rank: runner.turfPerformanceRating?.rank ?? null,
      w100RelativeWeightContribution: turfPerformanceRelativeWeightContribution(input),
      w50Rating: runner.turfPerformanceShadowRating?.rating ?? null,
      w50RawRating: runner.turfPerformanceShadowRating?.rawRating ?? null,
      w50Rank: runner.turfPerformanceShadowRating?.rank ?? null,
      w50RelativeWeightContribution: turfPerformanceRelativeWeightContribution(w50Input),
    }];
  });
  return { version: "tpr_forward_snapshot_v1" as const, runners: snapshotRunners };
}

function selectionIsNonRunner(horseName: string | null, runners: TodayRunner[]) {
  if (horseName === null) return false;
  const normalized = normalizeHorseName(horseName);
  return runners.some((runner) =>
    normalizeHorseName(runner.horseName) === normalized && runner.resultStatus === "non_runner"
  );
}

function normalizeHorseName(value: string) {
  return value.trim().toLocaleLowerCase("en-GB").replace(/\s+/g, " ");
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
