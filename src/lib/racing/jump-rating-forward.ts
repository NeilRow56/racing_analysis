import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { isVoidBetResultStatus, settleSelection } from "./backtest";
import { parseGoingTerms } from "./going-form";
import {
  JUMP_RATING_A_VERSION,
  JUMP_RATING_B_VERSION,
  calculateJumpRaceRatings,
  jumpRatingInputForTodayRunner,
  type JumpRatingComponentRanks,
} from "./jump-performance-rating";
import {
  calculateJumpRaceA0Ratings,
  JUMP_RATING_A0_IMPLEMENTATION_EPOCH,
  JUMP_RATING_A0_VERSION,
  type JumpRatingA0Source,
} from "./jump-performance-rating-a0";
import { classifyJumpRaceSubtype, isJumpRace, type JumpRaceSubtype } from "./jump-speed-rating";
import {
  calculateRatingCoverage,
  JPR_A_RATING_COVERAGE_GUARD_IMPLEMENTED_AT,
  JPR_A_RATING_COVERAGE_GUARD_VERSION,
  RATING_COVERAGE_EXCLUSION_REASON,
  type RatingCoverageStatus,
} from "./rating-coverage";
import type { TodayMeeting, TodayRace } from "./todays-racing";

export const JUMP_RATING_FORWARD_VERSION = "jump_rating_forward_v1" as const;
export const JUMP_RATING_FORWARD_PATH = "data/research/jump-rating-forward-v1.json";
export const JUMP_RATING_FORWARD_START_AT = "2026-09-26T11:03:43.000Z";

export type JumpRatingForwardSettlement = {
  stake: number;
  grossReturn: number;
  profitLoss: number;
  settlementOddsDecimal: number;
};

export type JumpRatingForwardRunner = {
  runnerId: string;
  horseId: string;
  horseName: string;
  components: JumpRatingComponentRanks;
  jprAScore: number | null;
  jprARank: number | null;
  jprA0Score?: number | null;
  jprA0Rank?: number | null;
  jprA0RatingSource?: JumpRatingA0Source | null;
  jprBScore: number | null;
  jprBRank: number | null;
  goingFormMatch: boolean | null;
  finishingPosition: number | null;
  resultStatus: string | null;
  finalSp: number | null;
  settlement: JumpRatingForwardSettlement | null;
  priorRuns?: number | null;
  zeroHistory?: boolean | null;
};

export type JumpRatingForwardRace = {
  raceDate: string;
  raceDateTime: string;
  course: string;
  raceTime: string;
  raceId: string;
  sourceId: string | null;
  raceName: string | null;
  subtype: JumpRaceSubtype;
  activeRunnerCount?: number;
  ratedRunnerCount?: number;
  ratingCoverage?: number;
  ratingCoverageStatus?: RatingCoverageStatus;
  ratingCoverageGuardVersion?: typeof JPR_A_RATING_COVERAGE_GUARD_VERSION;
  ratingCoverageGuardImplementedAt?: typeof JPR_A_RATING_COVERAGE_GUARD_IMPLEMENTED_AT;
  ratingCoverageExclusionReason?: typeof RATING_COVERAGE_EXCLUSION_REASON | null;
  jprARankEligible?: boolean;
  jprAVersion: typeof JUMP_RATING_A_VERSION;
  jprA0Version?: typeof JUMP_RATING_A0_VERSION;
  jprA0ImplementationEpoch?: typeof JUMP_RATING_A0_IMPLEMENTATION_EPOCH;
  jprA0FallbackRunnerCount?: number;
  jprA0Rank1FallbackDerived?: boolean | null;
  jprBVersion: typeof JUMP_RATING_B_VERSION;
  recordedAt: string;
  recordedPreRace: boolean;
  runners: JumpRatingForwardRunner[];
  winnerRunnerIds: string[];
  settledAt: string | null;
};

export type JumpRatingForwardData = {
  version: typeof JUMP_RATING_FORWARD_VERSION;
  forwardStartAt: string;
  jprAVersion: typeof JUMP_RATING_A_VERSION;
  jprA0Version?: typeof JUMP_RATING_A0_VERSION;
  jprA0ImplementationEpoch?: typeof JUMP_RATING_A0_IMPLEMENTATION_EPOCH;
  jprBVersion: typeof JUMP_RATING_B_VERSION;
  races: JumpRatingForwardRace[];
};

export type JumpRatingForwardSummary = {
  cleanRaces: number;
  pending: number;
  settled: number;
  jprA: ReturnType<typeof rankSummary>;
  jprB: ReturnType<typeof rankSummary>;
  orAgreement: { eligible: number; agreements: number };
  insufficientCoverage: number;
  subtypes: Array<{
    subtype: JumpRaceSubtype;
    races: number;
    pending: number;
    settled: number;
    jprARank1Strike: number | null;
    jprATop3Capture: number | null;
  }>;
  jprA0: JumpRatingA0ForwardSummary;
};

export type JumpRatingA0ComparisonSummary = {
  cleanRaces: number;
  pending: number;
  settled: number;
  jprA: ReturnType<typeof rankSummary>;
  jprA0: ReturnType<typeof rankSummary>;
  rank1Agreement: { eligible: number; agreements: number };
  racesContainingFallbackRunners: number;
};

export type JumpRatingA0ForwardSummary = JumpRatingA0ComparisonSummary & {
  implementationEpoch: typeof JUMP_RATING_A0_IMPLEMENTATION_EPOCH;
  subtypes: Array<{ subtype: JumpRaceSubtype } & JumpRatingA0ComparisonSummary>;
  fallback: {
    races: number;
    fallbackRunners: number;
    fallbackDerivedRank1Selections: number;
    fallbackDerivedRank1Winners: number;
    zeroHistoryWinners: number;
    zeroHistoryWinnersCapturedTop3: number;
    zeroHistoryWinnerRanks: Record<string, number>;
  };
};

export function emptyJumpRatingForwardData(): JumpRatingForwardData {
  return {
    version: JUMP_RATING_FORWARD_VERSION,
    forwardStartAt: JUMP_RATING_FORWARD_START_AT,
    jprAVersion: JUMP_RATING_A_VERSION,
    jprA0Version: JUMP_RATING_A0_VERSION,
    jprA0ImplementationEpoch: JUMP_RATING_A0_IMPLEMENTATION_EPOCH,
    jprBVersion: JUMP_RATING_B_VERSION,
    races: [],
  };
}

export function buildJumpRatingForwardRace(input: {
  raceDate: string;
  course: string;
  race: TodayRace;
  recordedAt?: Date;
}): JumpRatingForwardRace | null {
  const recordedAt = input.recordedAt ?? new Date();
  const raceDateTime = input.race.raceDateTime;
  if (
    !raceDateTime ||
    !input.race.scheduledTime ||
    !isJumpRace(input.race) ||
    raceDateTime < new Date(JUMP_RATING_FORWARD_START_AT) ||
    recordedAt >= raceDateTime
  ) {
    return null;
  }
  const active = input.race.runners.filter((runner) => runner.resultStatus !== "non_runner");
  if (active.length < 2) return null;
  const ratings = calculateJumpRaceRatings(active.map(jumpRatingInputForTodayRunner));
  const coverage = calculateRatingCoverage(
    active,
    (runner) => ratings.get(runner.runnerId)?.jprA !== null,
    JPR_A_RATING_COVERAGE_GUARD_VERSION,
    JPR_A_RATING_COVERAGE_GUARD_IMPLEMENTED_AT,
  );
  const jprARankEligible = coverage.ratingCoverageStatus === "eligible";
  const captureA0 = recordedAt >= new Date(JUMP_RATING_A0_IMPLEMENTATION_EPOCH) &&
    raceDateTime >= new Date(JUMP_RATING_A0_IMPLEMENTATION_EPOCH);
  const a0Ratings = captureA0
    ? calculateJumpRaceA0Ratings(active.map(jumpRatingInputForTodayRunner))
    : null;
  const fallbackRunnerCount = a0Ratings
    ? [...a0Ratings.values()].filter((rating) => rating?.ratingSource === "trainer_fallback").length
    : 0;
  return {
    raceDate: input.raceDate,
    raceDateTime: raceDateTime.toISOString(),
    course: input.course,
    raceTime: input.race.scheduledTime.slice(0, 5),
    raceId: input.race.raceId,
    sourceId: input.race.sourceId,
    raceName: input.race.raceName,
    subtype: classifyJumpRaceSubtype(input.race),
    activeRunnerCount: coverage.activeRunnerCount,
    ratedRunnerCount: coverage.ratedRunnerCount,
    ratingCoverage: coverage.ratingCoverage,
    ratingCoverageStatus: coverage.ratingCoverageStatus,
    ratingCoverageGuardVersion: JPR_A_RATING_COVERAGE_GUARD_VERSION,
    ratingCoverageGuardImplementedAt: JPR_A_RATING_COVERAGE_GUARD_IMPLEMENTED_AT,
    ratingCoverageExclusionReason: jprARankEligible ? null : RATING_COVERAGE_EXCLUSION_REASON,
    jprARankEligible,
    jprAVersion: JUMP_RATING_A_VERSION,
    ...(captureA0 ? {
      jprA0Version: JUMP_RATING_A0_VERSION,
      jprA0ImplementationEpoch: JUMP_RATING_A0_IMPLEMENTATION_EPOCH,
      jprA0FallbackRunnerCount: fallbackRunnerCount,
      jprA0Rank1FallbackDerived: [...a0Ratings!.values()].some((rating) =>
        rating?.rank === 1 && rating.ratingSource === "trainer_fallback"
      ),
    } : {}),
    jprBVersion: JUMP_RATING_B_VERSION,
    recordedAt: recordedAt.toISOString(),
    recordedPreRace: true,
    runners: active.map((runner) => {
      const rating = ratings.get(runner.runnerId)!;
      const a0 = a0Ratings?.get(runner.runnerId) ?? null;
      return {
        runnerId: runner.runnerId,
        horseId: runner.horseId,
        horseName: runner.horseName,
        components: rating.components,
        jprAScore: rating.jprA?.score ?? null,
        jprARank: rating.jprA?.rank ?? null,
        ...(captureA0 ? {
          jprA0Score: a0?.score ?? null,
          jprA0Rank: a0?.rank ?? null,
          jprA0RatingSource: a0?.ratingSource ?? null,
          priorRuns: runner.metrics?.priorRuns ?? null,
          zeroHistory: runner.metrics ? runner.metrics.priorRuns === 0 : null,
        } : {}),
        jprBScore: rating.jprB?.score ?? null,
        jprBRank: rating.jprB?.rank ?? null,
        goingFormMatch: rating.jprA?.rank === 1
          ? goingFormMatchesRace(runner.goingForm, input.race.going)
          : null,
        finishingPosition: null,
        resultStatus: null,
        finalSp: null,
        settlement: null,
      };
    }),
    winnerRunnerIds: [],
    settledAt: null,
  };
}

export function upsertJumpRatingForwardRaces(
  data: JumpRatingForwardData,
  races: JumpRatingForwardRace[],
): JumpRatingForwardData {
  const existing = new Set(data.races.map((race) => race.raceId));
  const additions = races.filter((race) => {
    if (existing.has(race.raceId)) return false;
    existing.add(race.raceId);
    return true;
  });
  if (additions.length === 0) return data;
  const includesA0 = additions.some((race) => race.jprA0Version === JUMP_RATING_A0_VERSION);
  return {
    ...data,
    ...(includesA0 ? {
      jprA0Version: JUMP_RATING_A0_VERSION,
      jprA0ImplementationEpoch: JUMP_RATING_A0_IMPLEMENTATION_EPOCH,
    } : {}),
    races: [...data.races, ...additions],
  };
}

export function pendingJumpRatingRaceIds(data: JumpRatingForwardData): string[] {
  return data.races
    .filter((race) => race.recordedPreRace && race.winnerRunnerIds.length === 0 && isJprAForwardRaceRankEligible(race))
    .map((race) => race.raceId);
}

export function settlePendingJumpRatingRaces(
  data: JumpRatingForwardData,
  racesById: Map<string, TodayRace>,
  settledAt = new Date(),
): { data: JumpRatingForwardData; settled: number } {
  let settled = 0;
  const races = data.races.map((record) => {
    if (!record.recordedPreRace || record.winnerRunnerIds.length > 0) return record;
    const result = racesById.get(record.raceId);
    if (!result) return record;
    const enriched = enrichJumpRatingForwardRace(record, result, settledAt);
    if (enriched !== record) settled += 1;
    return enriched;
  });
  return settled === 0 ? { data, settled } : { data: { ...data, races }, settled };
}

export function enrichJumpRatingForwardRace(
  record: JumpRatingForwardRace,
  race: TodayRace,
  settledAt = new Date(),
): JumpRatingForwardRace {
  const winners = race.runners.filter((runner) => runner.finishingPosition === 1);
  if (winners.length === 0) return record;
  const byId = new Map(race.runners.map((runner) => [runner.runnerId, runner]));
  const deadHeatDivisor = winners.length;
  const runners = record.runners.map((snapshot) => {
    const result = byId.get(snapshot.runnerId);
    if (!result) return snapshot;
    const finalSp = decimal(result.oddsDecimal);
    const settlement = settleSelection({
      targetRaceId: record.raceId,
      targetRunnerId: snapshot.runnerId,
      finishingPosition: result.finishingPosition,
      resultStatus: result.resultStatus,
      won: result.finishingPosition === 1,
      placed: result.finishingPosition !== null && result.finishingPosition <= 3,
      startingPrice: result.odds,
      startingPriceDecimal: result.oddsDecimal,
      deadHeatDivisor,
    });
    return {
      ...snapshot,
      finishingPosition: result.finishingPosition,
      resultStatus: result.resultStatus,
      finalSp,
      settlement: settlement && {
        stake: settlement.stake,
        grossReturn: settlement.grossReturn,
        profitLoss: settlement.profitLoss,
        settlementOddsDecimal: settlement.settlementOddsDecimal,
      },
    };
  });
  return {
    ...record,
    runners,
    winnerRunnerIds: winners.map((winner) => winner.runnerId),
    settledAt: record.settledAt ?? settledAt.toISOString(),
  };
}

export function summarizeJumpRatingForward(
  data: JumpRatingForwardData,
): JumpRatingForwardSummary {
  const clean = data.races.filter((race) => race.recordedPreRace);
  const analytical = clean.filter(isJprAForwardRaceRankEligible);
  const settled = analytical.filter((race) => race.winnerRunnerIds.length > 0);
  const pending = analytical.length - settled.length;
  const orEligible = settled.filter((race) =>
    race.runners.some((runner) => runner.jprARank === 1) &&
    race.runners.some((runner) => runner.components.officialRating === 1)
  );
  const subtypeGroups = groupBy(analytical, (race) => race.subtype);
  return {
    cleanRaces: clean.length,
    pending,
    settled: settled.length,
    jprA: rankSummary(settled, (runner) => runner.jprARank),
    jprB: rankSummary(clean.filter((race) => race.winnerRunnerIds.length > 0), (runner) => runner.jprBRank),
    orAgreement: {
      eligible: orEligible.length,
      agreements: orEligible.filter((race) => race.runners.some((runner) =>
        runner.jprARank === 1 && runner.components.officialRating === 1
      )).length,
    },
    insufficientCoverage: clean.filter((race) => !isJprAForwardRaceRankEligible(race)).length,
    subtypes: [...subtypeGroups].map(([subtype, races]) => {
      const subtypeSettled = races.filter((race) => race.winnerRunnerIds.length > 0);
      const summary = rankSummary(subtypeSettled, (runner) => runner.jprARank);
      return {
        subtype,
        races: races.length,
        pending: races.length - subtypeSettled.length,
        settled: subtypeSettled.length,
        jprARank1Strike: summary.rank1Strike,
        jprATop3Capture: summary.top3Capture,
      };
    }),
    jprA0: summarizeJprA0(clean),
  };
}

export function renderJumpRatingToday(
  meetings: TodayMeeting[],
  raceDate: string,
): string {
  const lines = [`Jump Rating Today - ${raceDate}`, ""];
  const races = meetings.flatMap((meeting) => meeting.races
    .filter((race) => isJumpRace(race))
    .map((race) => ({ course: meeting.courseName, race })));
  if (races.length === 0) return `${lines.join("\n")}No Jump races available.`;
  for (const { course, race } of races) {
    const active = race.runners.filter((runner) => runner.resultStatus !== "non_runner");
    const a0 = calculateJumpRaceA0Ratings(active.map(jumpRatingInputForTodayRunner));
    const coverage = race.jumpRatingCoverage?.jprA;
    const aRank1 = coverage?.ratingCoverageStatus === "insufficient_coverage"
      ? []
      : active.filter((runner) => runner.jumpRating?.jprA?.rank === 1);
    const a0Rank1 = active.filter((runner) => a0.get(runner.runnerId)?.rank === 1);
    const fallbackCount = [...a0.values()].filter((rating) => rating?.ratingSource === "trainer_fallback").length;
    lines.push(`${race.scheduledTime?.slice(0, 5) ?? "--:--"} ${course}${race.raceName ? ` - ${race.raceName}` : ""}`);
    const jprALeaders = coverage?.ratingCoverageStatus === "insufficient_coverage"
      ? `insufficient race coverage (Rated: ${coverage.ratedRunnerCount}/${coverage.activeRunnerCount})`
      : leaders(race, (runner) => runner.jumpRating?.jprA?.rank ?? null, 3);
    lines.push(`  JPR-A top 3: ${jprALeaders}`);
    lines.push(`  JPR-A0 rank 1: ${a0Rank1.length ? a0Rank1.map((runner) => runner.horseName).join(" / ") : "unrated"} | agrees ${sameIds(aRank1.map((runner) => runner.runnerId), a0Rank1.map((runner) => runner.runnerId)) ? "yes" : "no"} | fallback runners ${fallbackCount}`);
    lines.push(`  JPR-B rank 1: ${leaders(race, (runner) => runner.jumpRating?.jprB?.rank ?? null, 1)}`);
    lines.push(`  OR leader: ${leaders(race, (runner) => runner.jumpRating?.components.officialRating ?? null, 1)}`);
    lines.push(`  Trainer-SR leader: ${leaders(race, (runner) => runner.jumpRating?.components.trainerPriorStrikeRate ?? null, 1)}`, "");
  }
  return lines.join("\n").trimEnd();
}

function summarizeJprA0(clean: JumpRatingForwardRace[]): JumpRatingA0ForwardSummary {
  const cohort = clean.filter((race) =>
    race.jprA0Version === JUMP_RATING_A0_VERSION &&
    race.jprA0ImplementationEpoch === JUMP_RATING_A0_IMPLEMENTATION_EPOCH &&
    race.recordedAt >= JUMP_RATING_A0_IMPLEMENTATION_EPOCH
  );
  const fallbackRaces = cohort.filter((race) => (race.jprA0FallbackRunnerCount ?? 0) > 0);
  const settledFallback = fallbackRaces.filter((race) => race.winnerRunnerIds.length > 0);
  const fallbackRank1 = fallbackRaces.flatMap((race) => race.runners.filter((runner) =>
    runner.jprA0Rank === 1 && runner.jprA0RatingSource === "trainer_fallback"
  ).map((runner) => ({ race, runner })));
  const zeroHistoryWinners = settledFallback.flatMap((race) => race.runners.filter((runner) =>
    runner.zeroHistory === true && race.winnerRunnerIds.includes(runner.runnerId)
  ));
  const zeroHistoryWinnerRanks: Record<string, number> = {};
  for (const runner of zeroHistoryWinners) {
    const rank = runner.jprA0Rank === null || runner.jprA0Rank === undefined ? "unrated" : String(runner.jprA0Rank);
    zeroHistoryWinnerRanks[rank] = (zeroHistoryWinnerRanks[rank] ?? 0) + 1;
  }
  return {
    implementationEpoch: JUMP_RATING_A0_IMPLEMENTATION_EPOCH,
    ...a0ComparisonSummary(cohort),
    subtypes: (["hurdle", "chase"] as JumpRaceSubtype[]).map((subtype) => ({
      subtype,
      ...a0ComparisonSummary(cohort.filter((race) => race.subtype === subtype)),
    })),
    fallback: {
      races: fallbackRaces.length,
      fallbackRunners: fallbackRaces.reduce((total, race) => total + (race.jprA0FallbackRunnerCount ?? 0), 0),
      fallbackDerivedRank1Selections: fallbackRank1.length,
      fallbackDerivedRank1Winners: fallbackRank1.filter(({ race, runner }) =>
        race.winnerRunnerIds.includes(runner.runnerId)
      ).length,
      zeroHistoryWinners: zeroHistoryWinners.length,
      zeroHistoryWinnersCapturedTop3: zeroHistoryWinners.filter((runner) => (runner.jprA0Rank ?? Infinity) <= 3).length,
      zeroHistoryWinnerRanks,
    },
  };
}

function a0ComparisonSummary(races: JumpRatingForwardRace[]): JumpRatingA0ComparisonSummary {
  const settled = races.filter((race) => race.winnerRunnerIds.length > 0);
  const agreementEligible = races.filter((race) =>
    race.runners.some((runner) => runner.jprARank === 1) &&
    race.runners.some((runner) => runner.jprA0Rank === 1)
  );
  return {
    cleanRaces: races.length,
    pending: races.length - settled.length,
    settled: settled.length,
    jprA: rankSummary(settled, (runner) => runner.jprARank),
    jprA0: rankSummary(settled, (runner) => runner.jprA0Rank ?? null),
    rank1Agreement: {
      eligible: agreementEligible.length,
      agreements: agreementEligible.filter((race) => sameIds(
        rank1Ids(race, (runner) => runner.jprARank),
        rank1Ids(race, (runner) => runner.jprA0Rank ?? null),
      )).length,
    },
    racesContainingFallbackRunners: races.filter((race) => (race.jprA0FallbackRunnerCount ?? 0) > 0).length,
  };
}

function rank1Ids(
  race: JumpRatingForwardRace,
  rankFor: (runner: JumpRatingForwardRunner) => number | null,
) {
  return race.runners.filter((runner) => rankFor(runner) === 1).map((runner) => runner.runnerId);
}

function sameIds(left: string[], right: string[]) {
  const sortedRight = [...right].sort();
  return left.length === right.length && [...left].sort().every((value, index) => value === sortedRight[index]);
}

export async function loadJumpRatingForward(
  path = JUMP_RATING_FORWARD_PATH,
): Promise<JumpRatingForwardData> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as JumpRatingForwardData;
    if (
      parsed.version !== JUMP_RATING_FORWARD_VERSION ||
      parsed.jprAVersion !== JUMP_RATING_A_VERSION ||
      parsed.jprBVersion !== JUMP_RATING_B_VERSION ||
      (parsed.jprA0Version !== undefined && parsed.jprA0Version !== JUMP_RATING_A0_VERSION) ||
      (parsed.jprA0ImplementationEpoch !== undefined && parsed.jprA0ImplementationEpoch !== JUMP_RATING_A0_IMPLEMENTATION_EPOCH)
    ) {
      throw new Error(`Unsupported Jump Rating forward data at ${path}`);
    }
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyJumpRatingForwardData();
    throw error;
  }
}

export async function saveJumpRatingForward(
  data: JumpRatingForwardData,
  path = JUMP_RATING_FORWARD_PATH,
) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}

function rankSummary(
  settled: JumpRatingForwardRace[],
  rankFor: (runner: JumpRatingForwardRunner) => number | null,
) {
  const rawRank1 = settled.flatMap((race) => race.runners
    .filter((runner) => rankFor(runner) === 1)
    .map((runner) => ({ race, runner })));
  const rank1 = rawRank1.filter(({ runner }) => !isVoidBetResultStatus(runner.resultStatus));
  const rank1Winners = rank1.filter(({ race, runner }) =>
    race.winnerRunnerIds.includes(runner.runnerId)
  ).length;
  const covered = settled.filter((race) => race.runners.some((runner) => rankFor(runner) !== null));
  return {
    rank1Selections: rank1.length,
    rank1Winners,
    rank1Strike: divide(rank1Winners, rank1.length),
    top3Capture: divide(
      covered.filter((race) => race.runners.some((runner) =>
        (rankFor(runner) ?? Infinity) <= 3 && race.winnerRunnerIds.includes(runner.runnerId)
      )).length,
      covered.length,
    ),
    coveredRaces: covered.length,
    voidRank1Selections: rawRank1.length - rank1.length,
    rank1TiedRaces: settled.filter((race) =>
      race.runners.filter((runner) =>
        rankFor(runner) === 1 && !isVoidBetResultStatus(runner.resultStatus)
      ).length > 1
    ).length,
  };
}

function isJprAForwardRaceRankEligible(race: JumpRatingForwardRace): boolean {
  if (race.jprARankEligible !== undefined) return race.jprARankEligible;
  return race.ratingCoverageStatus !== "insufficient_coverage";
}

function goingFormMatchesRace(
  goingForm: TodayRace["runners"][number]["goingForm"],
  going: string | null,
): boolean | null {
  const terms = parseGoingTerms(going);
  if (!goingForm || terms.length === 0) return null;
  return terms.some((term) => goingForm[term]);
}

function leaders(
  race: TodayRace,
  rankFor: (runner: TodayRace["runners"][number]) => number | null,
  maximum: number,
) {
  const values = race.runners
    .filter((runner) => runner.resultStatus !== "non_runner")
    .filter((runner) => (rankFor(runner) ?? Infinity) <= maximum)
    .sort((left, right) =>
      (rankFor(left) ?? Infinity) - (rankFor(right) ?? Infinity) ||
      left.horseName.localeCompare(right.horseName)
    )
    .map((runner) => `${rankFor(runner)} ${runner.horseName}`);
  return values.length > 0 ? values.join(", ") : "unrated";
}

function decimal(value: string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 1 ? parsed : null;
}

function divide(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : null;
}

function groupBy<T, K>(values: T[], keyFor: (value: T) => K) {
  const groups = new Map<K, T[]>();
  for (const value of values) {
    const key = keyFor(value);
    groups.set(key, [...(groups.get(key) ?? []), value]);
  }
  return groups;
}
