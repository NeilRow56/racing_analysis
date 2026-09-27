import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { isVoidBetResultStatus, settleSelection } from "./backtest";
import {
  AW_RATING_A_VERSION,
  AW_RATING_D_VERSION,
  awRatingInputForTodayRunner,
  calculateAwRaceRatings,
  type AwRatingComponentRanks,
} from "./aw-performance-rating";
import { isCurrentAllWeatherRace } from "./current-race-classification";
import { classifyHandicapStatus, type HandicapStatus } from "./research-rule";
import type { TodayMeeting, TodayRace } from "./todays-racing";

export const AW_RATING_FORWARD_VERSION = "aw_rating_forward_v1" as const;
export const AW_RATING_FORWARD_PATH = "data/research/aw-rating-forward-v1.json";
export const AW_RATING_FORWARD_START_AT = "2026-09-26T23:41:45.000Z";

export type AwDistanceGroup = "sprint" | "intermediate" | "staying" | "unknown";

export type AwRatingForwardSettlement = {
  stake: number;
  grossReturn: number;
  profitLoss: number;
  settlementOddsDecimal: number;
};

export type AwRatingForwardRunner = {
  runnerId: string;
  horseId: string;
  horseName: string;
  priorAwStarts: number | null;
  zeroHistory: boolean;
  components: AwRatingComponentRanks;
  awDScore: number | null;
  awDRank: number | null;
  awAScore: number | null;
  awARank: number | null;
  finishingPosition: number | null;
  resultStatus: string | null;
  finalSp: number | null;
  settlement: AwRatingForwardSettlement | null;
};

export type AwRatingForwardRace = {
  raceDate: string;
  raceDateTime: string;
  course: string;
  raceTime: string;
  raceId: string;
  sourceId: string | null;
  raceName: string | null;
  distanceGroup: AwDistanceGroup;
  handicapStatus: HandicapStatus;
  fieldSize: number;
  awDVersion: typeof AW_RATING_D_VERSION;
  awAVersion: typeof AW_RATING_A_VERSION;
  recordedAt: string;
  recordedPreRace: boolean;
  rank1Agreement: boolean | null;
  zeroHistoryRunnerCount: number;
  runners: AwRatingForwardRunner[];
  winnerRunnerIds: string[];
  settledAt: string | null;
};

export type AwRatingForwardData = {
  version: typeof AW_RATING_FORWARD_VERSION;
  forwardStartAt: string;
  awDVersion: typeof AW_RATING_D_VERSION;
  awAVersion: typeof AW_RATING_A_VERSION;
  races: AwRatingForwardRace[];
};

export type AwRatingForwardSummary = {
  cleanRaces: number;
  pending: number;
  settled: number;
  awD: ReturnType<typeof rankSummary>;
  awA: ReturnType<typeof rankSummary>;
  rank1Agreement: { eligible: number; agreements: number };
  zeroHistory: {
    runners: number;
    races: number;
    settledWinners: number;
    unratedByAwD: number;
    unratedByAwA: number;
  };
  handicap: ContextSummary<HandicapStatus>[];
  distance: ContextSummary<AwDistanceGroup>[];
};

type ContextSummary<T> = {
  context: T;
  races: number;
  pending: number;
  settled: number;
  awDRank1Strike: number | null;
  awDTop3Capture: number | null;
  awARank1Strike: number | null;
  awATop3Capture: number | null;
};

export function emptyAwRatingForwardData(): AwRatingForwardData {
  return {
    version: AW_RATING_FORWARD_VERSION,
    forwardStartAt: AW_RATING_FORWARD_START_AT,
    awDVersion: AW_RATING_D_VERSION,
    awAVersion: AW_RATING_A_VERSION,
    races: [],
  };
}

export function buildAwRatingForwardRace(input: {
  raceDate: string;
  course: string;
  race: TodayRace;
  recordedAt?: Date;
}): AwRatingForwardRace | null {
  const recordedAt = input.recordedAt ?? new Date();
  const raceDateTime = input.race.raceDateTime;
  if (
    !raceDateTime ||
    !input.race.scheduledTime ||
    !isCurrentAllWeatherRace(input.race) ||
    raceDateTime < new Date(AW_RATING_FORWARD_START_AT) ||
    recordedAt >= raceDateTime
  ) {
    return null;
  }
  const active = input.race.runners.filter((runner) => runner.resultStatus !== "non_runner");
  if (active.length < 2) return null;
  const ratings = calculateAwRaceRatings(active.map(awRatingInputForTodayRunner));
  const runners = active.map((runner): AwRatingForwardRunner => {
    const rating = ratings.get(runner.runnerId)!;
    const priorAwStarts = runner.metrics?.priorAwStarts ?? null;
    return {
      runnerId: runner.runnerId,
      horseId: runner.horseId,
      horseName: runner.horseName,
      priorAwStarts,
      zeroHistory: priorAwStarts === 0,
      components: rating.components,
      awDScore: rating.awD?.score ?? null,
      awDRank: rating.awD?.rank ?? null,
      awAScore: rating.awA?.score ?? null,
      awARank: rating.awA?.rank ?? null,
      finishingPosition: null,
      resultStatus: null,
      finalSp: null,
      settlement: null,
    };
  });
  return {
    raceDate: input.raceDate,
    raceDateTime: raceDateTime.toISOString(),
    course: input.course,
    raceTime: input.race.scheduledTime.slice(0, 5),
    raceId: input.race.raceId,
    sourceId: input.race.sourceId,
    raceName: input.race.raceName,
    distanceGroup: classifyAwDistanceGroup(input.race.distanceYards),
    handicapStatus: classifyHandicapStatus(input.race),
    fieldSize: active.length,
    awDVersion: AW_RATING_D_VERSION,
    awAVersion: AW_RATING_A_VERSION,
    recordedAt: recordedAt.toISOString(),
    recordedPreRace: true,
    rank1Agreement: sameIds(
      runners.filter((runner) => runner.awDRank === 1).map((runner) => runner.runnerId),
      runners.filter((runner) => runner.awARank === 1).map((runner) => runner.runnerId),
    ),
    zeroHistoryRunnerCount: runners.filter((runner) => runner.zeroHistory).length,
    runners,
    winnerRunnerIds: [],
    settledAt: null,
  };
}

export function upsertAwRatingForwardRaces(
  data: AwRatingForwardData,
  races: AwRatingForwardRace[],
): AwRatingForwardData {
  const existing = new Set(data.races.map((race) => race.raceId));
  const additions = races.filter((race) => {
    if (existing.has(race.raceId)) return false;
    existing.add(race.raceId);
    return true;
  });
  return additions.length === 0 ? data : { ...data, races: [...data.races, ...additions] };
}

export function pendingAwRatingRaceIds(data: AwRatingForwardData): string[] {
  return data.races
    .filter((race) => race.recordedPreRace && race.winnerRunnerIds.length === 0)
    .map((race) => race.raceId);
}

export function settlePendingAwRatingRaces(
  data: AwRatingForwardData,
  racesById: Map<string, TodayRace>,
  settledAt = new Date(),
): { data: AwRatingForwardData; settled: number } {
  let settled = 0;
  const races = data.races.map((record) => {
    if (!record.recordedPreRace || record.winnerRunnerIds.length > 0) return record;
    const result = racesById.get(record.raceId);
    if (!result) return record;
    const enriched = enrichAwRatingForwardRace(record, result, settledAt);
    if (enriched !== record) settled += 1;
    return enriched;
  });
  return settled === 0 ? { data, settled } : { data: { ...data, races }, settled };
}

export function enrichAwRatingForwardRace(
  record: AwRatingForwardRace,
  race: TodayRace,
  settledAt = new Date(),
): AwRatingForwardRace {
  const winners = race.runners.filter((runner) => runner.finishingPosition === 1);
  if (winners.length === 0) return record;
  const byId = new Map(race.runners.map((runner) => [runner.runnerId, runner]));
  const deadHeatDivisor = winners.length;
  const runners = record.runners.map((snapshot) => {
    const result = byId.get(snapshot.runnerId);
    if (!result) return snapshot;
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
      finalSp: decimal(result.oddsDecimal),
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

export function summarizeAwRatingForward(data: AwRatingForwardData): AwRatingForwardSummary {
  const clean = data.races.filter((race) => race.recordedPreRace);
  const settled = clean.filter((race) => race.winnerRunnerIds.length > 0);
  const agreementEligible = clean.filter((race) => race.rank1Agreement !== null);
  const zeroHistoryRunners = clean.flatMap((race) => race.runners.filter((runner) => runner.zeroHistory));
  return {
    cleanRaces: clean.length,
    pending: clean.length - settled.length,
    settled: settled.length,
    awD: rankSummary(settled, (runner) => runner.awDRank),
    awA: rankSummary(settled, (runner) => runner.awARank),
    rank1Agreement: {
      eligible: agreementEligible.length,
      agreements: agreementEligible.filter((race) => race.rank1Agreement).length,
    },
    zeroHistory: {
      runners: zeroHistoryRunners.length,
      races: clean.filter((race) => race.zeroHistoryRunnerCount > 0).length,
      settledWinners: settled.flatMap((race) => race.runners.filter((runner) =>
        runner.zeroHistory && race.winnerRunnerIds.includes(runner.runnerId)
      )).length,
      unratedByAwD: zeroHistoryRunners.filter((runner) => runner.awDRank === null).length,
      unratedByAwA: zeroHistoryRunners.filter((runner) => runner.awARank === null).length,
    },
    handicap: contextSummaries(clean, (race) => race.handicapStatus),
    distance: contextSummaries(clean, (race) => race.distanceGroup),
  };
}

export function renderAwRatingToday(meetings: TodayMeeting[], raceDate: string): string {
  const lines = [`AW Rating Today - ${raceDate}`, ""];
  const races = meetings.flatMap((meeting) => meeting.races
    .filter((race) => isCurrentAllWeatherRace(race))
    .map((race) => ({ course: meeting.courseName, race })));
  if (races.length === 0) return `${lines.join("\n")}No All Weather races available.`;
  for (const { course, race } of races) {
    lines.push(`${race.scheduledTime?.slice(0, 5) ?? "--:--"} ${course}${race.raceName ? ` - ${race.raceName}` : ""}`);
    lines.push(`  AW-D top 3: ${leaders(race, (runner) => runner.awRating?.awD?.rank ?? null, 3)}`);
    lines.push(`  AW-A rank 1: ${leaders(race, (runner) => runner.awRating?.awA?.rank ?? null, 1)}`);
    lines.push(`  Avg-L3 Speed leader: ${leaders(race, (runner) => runner.awRating?.components.averageAwSpeedLast3 ?? null, 1)}`);
    lines.push(`  Trainer-SR leader: ${leaders(race, (runner) => runner.awRating?.components.trainerPriorStrikeRate ?? null, 1)}`);
    lines.push(`  Jockey-SR leader: ${leaders(race, (runner) => runner.awRating?.components.jockeyPriorStrikeRate ?? null, 1)}`, "");
  }
  return lines.join("\n").trimEnd();
}

export async function loadAwRatingForward(
  path = AW_RATING_FORWARD_PATH,
): Promise<AwRatingForwardData> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as AwRatingForwardData;
    if (
      parsed.version !== AW_RATING_FORWARD_VERSION ||
      parsed.awDVersion !== AW_RATING_D_VERSION ||
      parsed.awAVersion !== AW_RATING_A_VERSION
    ) {
      throw new Error(`Unsupported AW Rating forward data at ${path}`);
    }
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyAwRatingForwardData();
    throw error;
  }
}

export async function saveAwRatingForward(
  data: AwRatingForwardData,
  path = AW_RATING_FORWARD_PATH,
) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}

export function classifyAwDistanceGroup(distanceYards: number | null): AwDistanceGroup {
  if (distanceYards === null) return "unknown";
  if (distanceYards <= 1_320) return "sprint";
  if (distanceYards <= 2_640) return "intermediate";
  return "staying";
}

function rankSummary(
  settled: AwRatingForwardRace[],
  rankFor: (runner: AwRatingForwardRunner) => number | null,
) {
  const rank1 = settled.flatMap((race) => race.runners
    .filter((runner) => rankFor(runner) === 1)
    .map((runner) => ({ race, runner })))
    .filter(({ runner }) => !isVoidBetResultStatus(runner.resultStatus));
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
  };
}

function contextSummaries<T>(
  races: AwRatingForwardRace[],
  contextFor: (race: AwRatingForwardRace) => T,
): ContextSummary<T>[] {
  return [...groupBy(races, contextFor)].map(([context, contextRaces]) => {
    const settled = contextRaces.filter((race) => race.winnerRunnerIds.length > 0);
    const awD = rankSummary(settled, (runner) => runner.awDRank);
    const awA = rankSummary(settled, (runner) => runner.awARank);
    return {
      context,
      races: contextRaces.length,
      pending: contextRaces.length - settled.length,
      settled: settled.length,
      awDRank1Strike: awD.rank1Strike,
      awDTop3Capture: awD.top3Capture,
      awARank1Strike: awA.rank1Strike,
      awATop3Capture: awA.top3Capture,
    };
  });
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

function sameIds(left: string[], right: string[]): boolean | null {
  if (left.length === 0 || right.length === 0) return null;
  const a = [...left].sort();
  const b = [...right].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
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
    const group = groups.get(key) ?? [];
    group.push(value);
    groups.set(key, group);
  }
  return groups;
}
