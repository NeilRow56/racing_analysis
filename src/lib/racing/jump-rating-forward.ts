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
import { classifyJumpRaceSubtype, isJumpRace, type JumpRaceSubtype } from "./jump-speed-rating";
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
  jprBScore: number | null;
  jprBRank: number | null;
  goingFormMatch: boolean | null;
  finishingPosition: number | null;
  resultStatus: string | null;
  finalSp: number | null;
  settlement: JumpRatingForwardSettlement | null;
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
  jprAVersion: typeof JUMP_RATING_A_VERSION;
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
  subtypes: Array<{
    subtype: JumpRaceSubtype;
    races: number;
    pending: number;
    settled: number;
    jprARank1Strike: number | null;
    jprATop3Capture: number | null;
  }>;
};

export function emptyJumpRatingForwardData(): JumpRatingForwardData {
  return {
    version: JUMP_RATING_FORWARD_VERSION,
    forwardStartAt: JUMP_RATING_FORWARD_START_AT,
    jprAVersion: JUMP_RATING_A_VERSION,
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
  return {
    raceDate: input.raceDate,
    raceDateTime: raceDateTime.toISOString(),
    course: input.course,
    raceTime: input.race.scheduledTime.slice(0, 5),
    raceId: input.race.raceId,
    sourceId: input.race.sourceId,
    raceName: input.race.raceName,
    subtype: classifyJumpRaceSubtype(input.race),
    jprAVersion: JUMP_RATING_A_VERSION,
    jprBVersion: JUMP_RATING_B_VERSION,
    recordedAt: recordedAt.toISOString(),
    recordedPreRace: true,
    runners: active.map((runner) => {
      const rating = ratings.get(runner.runnerId)!;
      return {
        runnerId: runner.runnerId,
        horseId: runner.horseId,
        horseName: runner.horseName,
        components: rating.components,
        jprAScore: rating.jprA?.score ?? null,
        jprARank: rating.jprA?.rank ?? null,
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
  return additions.length === 0 ? data : { ...data, races: [...data.races, ...additions] };
}

export function pendingJumpRatingRaceIds(data: JumpRatingForwardData): string[] {
  return data.races
    .filter((race) => race.recordedPreRace && race.winnerRunnerIds.length === 0)
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
  const settled = clean.filter((race) => race.winnerRunnerIds.length > 0);
  const pending = clean.length - settled.length;
  const orEligible = settled.filter((race) =>
    race.runners.some((runner) => runner.jprARank === 1) &&
    race.runners.some((runner) => runner.components.officialRating === 1)
  );
  const subtypeGroups = groupBy(clean, (race) => race.subtype);
  return {
    cleanRaces: clean.length,
    pending,
    settled: settled.length,
    jprA: rankSummary(settled, (runner) => runner.jprARank),
    jprB: rankSummary(settled, (runner) => runner.jprBRank),
    orAgreement: {
      eligible: orEligible.length,
      agreements: orEligible.filter((race) => race.runners.some((runner) =>
        runner.jprARank === 1 && runner.components.officialRating === 1
      )).length,
    },
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
    lines.push(`${race.scheduledTime?.slice(0, 5) ?? "--:--"} ${course}${race.raceName ? ` - ${race.raceName}` : ""}`);
    lines.push(`  JPR-A top 3: ${leaders(race, (runner) => runner.jumpRating?.jprA?.rank ?? null, 3)}`);
    lines.push(`  JPR-B rank 1: ${leaders(race, (runner) => runner.jumpRating?.jprB?.rank ?? null, 1)}`);
    lines.push(`  OR leader: ${leaders(race, (runner) => runner.jumpRating?.components.officialRating ?? null, 1)}`);
    lines.push(`  Trainer-SR leader: ${leaders(race, (runner) => runner.jumpRating?.components.trainerPriorStrikeRate ?? null, 1)}`, "");
  }
  return lines.join("\n").trimEnd();
}

export async function loadJumpRatingForward(
  path = JUMP_RATING_FORWARD_PATH,
): Promise<JumpRatingForwardData> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as JumpRatingForwardData;
    if (
      parsed.version !== JUMP_RATING_FORWARD_VERSION ||
      parsed.jprAVersion !== JUMP_RATING_A_VERSION ||
      parsed.jprBVersion !== JUMP_RATING_B_VERSION
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
