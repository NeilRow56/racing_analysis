import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { isVoidBetResultStatus, settledWinValue } from "./backtest";
import { hasCompleteProspectiveField } from "./current-day-sync";
import { classifyHandicapStatus } from "./research-rule";
import { CANONICAL_SETTLEMENT_VERSION } from "./research-settlement-version";
import { AW_SPEED_RATING_CALCULATION_VERSION } from "./aw-speed-rating";
import { TURF_SPEED_RATING_CALCULATION_VERSION } from "./turf-speed-rating";
import { finite, formatSpeedEdge, officialRatingRanks, sameOrAwSpeedEdges, sameOrSpeedEdges } from "./or-speed-comparison";
import { getLocalRacingDate, isAllWeatherRaceForDisplay, isOrdinaryFlatTurfRaceForDisplay, type TodayMeeting, type TodayRace } from "./todays-racing";

export const OR_SPEED_VERSION = "OR_BEST_L3_SPEED_FORWARD_V1" as const;
export const OR_SPEED_EPOCH = "2026-10-21T08:39:44.000Z" as const;
export const OR_SPEED_PATH = "data/research/or-best-l3-speed-forward-v1.json";
export type OrSpeedObservation = {
  raceId: string; runnerId: string; horseId: string; horseName: string;
  raceDate: string; scheduledOff: string; course: string; raceName: string | null;
  family: "TURF" | "AW"; firstCapturedAt: string; capturedFieldRunnerIds: string[];
  declaredFieldSize: number | null; starterFieldSize: number | null;
  handicap: ReturnType<typeof classifyHandicapStatus>; raceClass: string | null;
  officialRating: number; orRank: number; top3Or: boolean; sharesTopOr: boolean;
  bestL3Speed: number; speedVersion: string; speedMetric: "bestTurfSpeedLast3" | "bestAwSpeedLast3";
  sameOrGroupSize: number; nextHighestBestL3: number; speedEdge: number; displayedSpeedEdge: string;
  edgeAtLeast10: boolean; displayTier: "restrained" | "OR-relevant / Top-3";
  outcome: null | {
    status: "settled" | "NR" | "void"; starter: boolean | null;
    finishPosition: number | null; resultStatus: string | null; finishRank: number | null;
    winner: boolean | null; winnerCredit: number | null; deadHeatDivisor: number | null;
    normalizedFinish: number | null; top3: boolean | null; settledFieldSize: number | null;
    settledAt: string; settlementVersion: typeof CANONICAL_SETTLEMENT_VERSION;
  };
};
export type OrSpeedData = { version: typeof OR_SPEED_VERSION; epoch: typeof OR_SPEED_EPOCH; observations: OrSpeedObservation[] };
export function emptyOrSpeed(): OrSpeedData { return { version: OR_SPEED_VERSION, epoch: OR_SPEED_EPOCH, observations: [] }; }

export function buildOrSpeedObservations(input: { meetings: TodayMeeting[]; raceDate: string; capturedAt: Date }): OrSpeedObservation[] {
  const { capturedAt: now, raceDate } = input;
  if (!Number.isFinite(now.getTime()) || now.toISOString() < OR_SPEED_EPOCH || raceDate !== getLocalRacingDate(now)) return [];
  return input.meetings.flatMap(meeting => meeting.races.flatMap(race => {
    const family = isAllWeatherRaceForDisplay(race) ? "AW" : isOrdinaryFlatTurfRaceForDisplay(race) ? "TURF" : null;
    if (!family || !race.raceDateTime || !Number.isFinite(race.raceDateTime.getTime()) || now >= race.raceDateTime ||
      getLocalRacingDate(race.raceDateTime) !== raceDate || race.winningTime ||
      race.runners.some(r => r.finishingPosition !== null || (r.resultStatus !== null && r.resultStatus !== "non_runner")) ||
      !hasCompleteProspectiveField({ ...race, actualRunnerCount: null })) return [];
    // Match Today's Racing exactly, including any displayed non-runner in the comparison and OR ranks.
    const metric = family === "AW" ? "bestAwSpeedLast3" : "bestTurfSpeedLast3";
    const edges = family === "AW" ? sameOrAwSpeedEdges(race.runners, true) : sameOrSpeedEdges(race.runners, true);
    const ranks = officialRatingRanks(race.runners);
    return race.runners.flatMap(runner => {
      const edge = edges.get(runner.runnerId);
      if (edge === undefined) return [];
      const group = race.runners.filter(r => r.officialRating === runner.officialRating && finite(r.metrics?.[metric]));
      const next = Math.max(...group.filter(r => r.runnerId !== runner.runnerId).map(r => r.metrics![metric]!));
      const orRank = ranks.get(runner.runnerId)!;
      return [{ raceId: race.raceId, runnerId: runner.runnerId, horseId: runner.horseId, horseName: runner.horseName,
        raceDate, scheduledOff: race.raceDateTime!.toISOString(), course: meeting.courseName, raceName: race.raceName,
        family, firstCapturedAt: now.toISOString(), capturedFieldRunnerIds: race.runners.map(r => r.runnerId),
        declaredFieldSize: race.declaredRunnerCount, starterFieldSize: race.actualRunnerCount,
        handicap: classifyHandicapStatus(race), raceClass: race.raceClass,
        officialRating: runner.officialRating!, orRank, top3Or: orRank <= 3, sharesTopOr: orRank === 1,
        bestL3Speed: runner.metrics![metric]!, speedMetric: metric,
        speedVersion: family === "AW" ? AW_SPEED_RATING_CALCULATION_VERSION : TURF_SPEED_RATING_CALCULATION_VERSION,
        sameOrGroupSize: group.length, nextHighestBestL3: next, speedEdge: edge, displayedSpeedEdge: formatSpeedEdge(edge),
        edgeAtLeast10: edge >= 10, displayTier: orRank <= 3 ? "OR-relevant / Top-3" : "restrained", outcome: null } satisfies OrSpeedObservation];
    });
  }));
}

export function appendOrSpeed(data: OrSpeedData, rows: OrSpeedObservation[]): OrSpeedData {
  const key = (r: OrSpeedObservation) => JSON.stringify([r.raceId, r.runnerId]);
  const known = new Set(data.observations.map(key));
  const additions = rows.filter(row => {
    if (known.has(key(row)) || row.firstCapturedAt < data.epoch || row.firstCapturedAt >= row.scheduledOff ||
      row.raceDate !== getLocalRacingDate(new Date(row.firstCapturedAt)) || row.outcome) return false;
    known.add(key(row)); return true;
  });
  return additions.length ? { ...data, observations: [...data.observations, ...additions] } : data;
}
export function pendingOrSpeedRaceIds(data: OrSpeedData): string[] {
  return [...new Set(data.observations.filter(r => !r.outcome).map(r => r.raceId))];
}
export function settleOrSpeed(data: OrSpeedData, races: ReadonlyMap<string, TodayRace>, now = new Date()): OrSpeedData {
  const observations = data.observations.map(row => {
    if (row.outcome) return row;
    const race = races.get(row.raceId), runner = race?.runners.find(r => r.runnerId === row.runnerId);
    if (!race || !runner) return row;
    const base = { finishPosition: runner.finishingPosition, resultStatus: runner.resultStatus,
      settledAt: now.toISOString(), settlementVersion: CANONICAL_SETTLEMENT_VERSION };
    if (isVoidBetResultStatus(runner.resultStatus)) return { ...row, outcome: { ...base,
      status: runner.resultStatus?.trim().toLowerCase() === "non_runner" ? "NR" : "void",
      starter: runner.resultStatus?.trim().toLowerCase() === "non_runner" ? false : null,
      finishRank: null, winner: null, winnerCredit: null, deadHeatDivisor: null, normalizedFinish: null,
      top3: null, settledFieldSize: null } satisfies OrSpeedObservation["outcome"] };
    if (now < new Date(row.scheduledOff) || !row.capturedFieldRunnerIds.every(id => race.runners.some(r => r.runnerId === id))) return row;
    const starters = race.runners.filter(r => !isVoidBetResultStatus(r.resultStatus)), n = starters.length;
    const winners = starters.filter(r => r.finishingPosition === 1);
    if (!winners.length || new Set(race.runners.map(r => r.runnerId)).size !== race.runners.length ||
      (race.actualRunnerCount !== n && race.actualRunnerCount !== race.runners.length) ||
      starters.some(r => (r.finishingPosition !== null && (!Number.isInteger(r.finishingPosition) || r.finishingPosition < 1 || r.finishingPosition > n)) ||
        settledWinValue({ ...r, won: null }) === null)) return row;
    // Same finishing semantics as the recency tracker: started non-finishers rank last.
    const finishRank = runner.finishingPosition ?? n, winner = runner.finishingPosition === 1;
    return { ...row, outcome: { ...base, status: "settled", starter: true, finishRank, winner,
      winnerCredit: winner ? 1 / winners.length : 0, deadHeatDivisor: winner ? winners.length : 1,
      normalizedFinish: n > 1 ? (finishRank - 1) / (n - 1) : 0,
      top3: runner.finishingPosition !== null && runner.finishingPosition <= 3, settledFieldSize: n } satisfies OrSpeedObservation["outcome"] };
  });
  return observations.every((r, i) => r === data.observations[i]) ? data : { ...data, observations };
}

export function summarizeOrSpeed(data: OrSpeedData) {
  const cohorts: [string, (r: OrSpeedObservation) => boolean][] = [
    ["ALL SPEED EDGES", () => true], ["TOP-3 OR SPEED EDGES", r => r.top3Or],
    ["OR RANK 4+ SPEED EDGES", r => !r.top3Or], ["EDGE >=10", r => r.edgeAtLeast10],
    ["TOP-3 OR + EDGE >=10", r => r.top3Or && r.edgeAtLeast10],
  ];
  return (["TURF", "AW"] as const).flatMap(family => cohorts.map(([cohort, matches]) => {
    const rows = data.observations.filter(r => r.family === family && matches(r));
    const outcomes = rows.flatMap(r => r.outcome?.status === "settled" ? [r.outcome] : []), n = outcomes.length;
    const winners = outcomes.filter(r => r.winner).length;
    return { family, cohort, observations: rows.length, settled: n, winners,
      winPercent: n ? 100 * winners / n : null,
      top3Percent: n ? 100 * outcomes.filter(r => r.top3).length / n : null,
      meanNormalizedFinish: n ? outcomes.reduce((sum, r) => sum + r.normalizedFinish!, 0) / n : null,
      sample: n < 50 ? "TOO EARLY" : n < 150 ? "EARLY" : n < 300 ? "DEVELOPING" : "MEANINGFUL" };
  }));
}
export async function loadOrSpeed(path = OR_SPEED_PATH): Promise<OrSpeedData> {
  try {
    const data = JSON.parse(await readFile(path, "utf8")) as OrSpeedData;
    if (data.version !== OR_SPEED_VERSION || data.epoch !== OR_SPEED_EPOCH || !Array.isArray(data.observations))
      throw new Error("Unsupported OR + Speed version/epoch");
    return data;
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return emptyOrSpeed();
    throw error;
  }
}
export async function mutateOrSpeed(mutate: (data: OrSpeedData) => Promise<OrSpeedData> | OrSpeedData, path = OR_SPEED_PATH) {
  const lock = `${resolve(path)}.lock`;
  await mkdir(dirname(lock), { recursive: true });
  const deadline = Date.now() + 30000;
  while (true) {
    try {
      await mkdir(lock);
      break;
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST" || Date.now() >= deadline)
        throw error;
      await new Promise(r => setTimeout(r, 10));
    }
  }
  try {
    const before = await loadOrSpeed(path);
    const after = await mutate(before);
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
      await writeFile(temporary, JSON.stringify(after, null, 2) + "\n");
      await rename(temporary, path);
    }
    return after;
  }
  finally {
    await rm(lock, { recursive: true, force: true });
  }
}
