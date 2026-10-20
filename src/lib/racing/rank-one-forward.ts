import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { isVoidBetResultStatus, settleSelection } from "./backtest";
import { summarizeBookmakerMarket } from "./forward-value";
import { hasCompleteProspectiveField } from "./current-day-sync";
import { classifyJumpRaceSubtype } from "./jump-speed-rating";
import { isAllWeatherRaceForDisplay, isOrdinaryFlatTurfRaceForDisplay, getLocalRacingDate, type TodayMeeting, type TodayRace } from "./todays-racing";
import { buildTissueForwardRace, ACTIVE_TURF_TISSUE_CONFIG, TISSUE_V3_LIVE_SEMANTICS_VERSION, TISSUE_V3_EPOCH, TURF_TISSUE_LIVE_SEMANTICS_VERSION, TURF_TISSUE_LIVE_SEMANTICS_EPOCH, type FrozenTissueModel } from "./tissue-forward";
import { predictJumpTissue, JUMP_TISSUE_VERSION, type JumpTissueModel } from "./jump-tissue-model";
import { predictAwTissue, AW_TISSUE_VERSION, type AwTissueModel } from "./aw-tissue-model";
import type { HistoricalComment } from "../../../scripts/diagnose-independent-tissue-feasibility";
export const RANK_ONE_VERSION = "RANK_ONE_FORWARD_V1" as const;
export const RANK_ONE_EPOCH = "2026-10-16T15:37:02.000Z" as const;
export const RANK_ONE_PATH = "data/research/rank-one-forward-v1.json";
export const RANK_ONE_FAMILIES = ["TURF", "HURDLE", "CHASE", "AW"] as const;
export type RankOneFamily = typeof RANK_ONE_FAMILIES[number];
export const RANK_ONE_SOURCES: Record<RankOneFamily, string> = {
  TURF: `Turf Tissue / ${ACTIVE_TURF_TISSUE_CONFIG.modelVersion} / ${TISSUE_V3_LIVE_SEMANTICS_VERSION} / tissueRank`,
  HURDLE: `Jump Tissue / ${JUMP_TISSUE_VERSION} / rank`,
  CHASE: `Jump Tissue / ${JUMP_TISSUE_VERSION} / rank`,
  AW: `AW Tissue / ${AW_TISSUE_VERSION} / rank`,
};
// Fixed 21.0 / 26.0 SP diagnostic did not establish robust evidence for a live cap.
export const RANK_ONE_CAPS: Record<RankOneFamily, 21 | 26 | null> = { TURF: null, HURDLE: null, CHASE: null, AW: null };
export type RankOneObservation = {
  version: typeof RANK_ONE_VERSION;
  raceId: string;
  runnerId: string;
  horseId: string;
  horseName: string;
  family: RankOneFamily;
  raceDate: string;
  scheduledOff: string;
  course: string;
  raceName: string | null;
  rankSource: string;
  modelHash: string;
  liveSemanticsVersion?: string;
  liveSemanticsEffectiveAt?: string;
  rank: 1;
  firstCapturedAt: string;
  capturedFieldRunnerIds: string[];
  market: {
    source: "sporting_life_median_bookmaker_at_capture_v1";
    medianBookmakerDecimal: number;
    normalizedProbability: number;
    marketRank: number;
    quotes: ReturnType<typeof summarizeBookmakerMarket>["quotes"];
    fieldPrices: {
      runnerId: string;
      decimalPrice: number;
    }[];
  };
  cap: 21 | 26 | null;
  withinCap: boolean;
  outcome: null | {
    status: "settled" | "NR" | "void";
    winner: boolean | null;
    finishPosition: number | null;
    resultStatus: string | null;
    deadHeatDivisor: number;
    grossReturn: number | null;
    profitLoss: number | null;
    roi: number | null;
    settledAt: string;
  };
};
export type RankOneData = {
  version: typeof RANK_ONE_VERSION;
  epoch: typeof RANK_ONE_EPOCH;
  observations: RankOneObservation[];
};
export function emptyRankOne(): RankOneData { return { version: RANK_ONE_VERSION, epoch: RANK_ONE_EPOCH, observations: [] }; }
export async function loadRankOne(path = RANK_ONE_PATH): Promise<RankOneData> {
  try {
    const data = JSON.parse(await readFile(path, "utf8")) as RankOneData;
    if (data.version !== RANK_ONE_VERSION || data.epoch !== RANK_ONE_EPOCH || !Array.isArray(data.observations))
      throw new Error("Unsupported rank-one version/epoch");
    return data;
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return emptyRankOne();
    throw error;
  }
}
export async function mutateRankOne(mutate: (data: RankOneData) => Promise<RankOneData> | RankOneData, path = RANK_ONE_PATH) {
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
    const before = await loadRankOne(path);
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
export function rankOneFamily(race: Pick<TodayRace, "raceName" | "raceType" | "raceTypeCode" | "surface"> & {
  going?: string | null;
}): RankOneFamily | null {
  const subtype = classifyJumpRaceSubtype(race);
  if (subtype === "hurdle")
    return "HURDLE";
  if (subtype === "chase")
    return "CHASE";
  if (isAllWeatherRaceForDisplay({ ...race, going: race.going ?? null }))
    return "AW";
  return isOrdinaryFlatTurfRaceForDisplay({ ...race, going: race.going ?? null }) ? "TURF" : null;
}
export type RankOneModels = {
  turf: FrozenTissueModel;
  jump: JumpTissueModel;
  aw: AwTissueModel;
  comments: Map<string, HistoricalComment[]>;
  awStarts: ReadonlyMap<string, number>;
};
export function currentRankOne(race: TodayRace, course: string, raceDate: string, models: RankOneModels, now: Date) {
  const family = rankOneFamily(race);
  if (!family)
    return null;
  const book = family === "TURF" ? buildTissueForwardRace({ race, course, raceDate, model: models.turf, commentsByHorse: models.comments, recordedAt: now, config: ACTIVE_TURF_TISSUE_CONFIG })?.runners.map(r => ({ runnerId: r.runnerId, rank: r.tissueRank }))
    : family === "AW" ? predictAwTissue(race, models.awStarts, models.aw).runners : predictJumpTissue(race, models.comments, models.jump).runners;
  // Turf uses competition ranks. Resolve an exact rank-1 tie by stable runner ID, without re-ranking.
  const leader = book?.filter(r => r.rank === 1).sort((a, b) => a.runnerId.localeCompare(b.runnerId))[0];
  return leader ? { family, runnerId: leader.runnerId, modelHash: family === "TURF" ? models.turf.checksum : family === "AW" ? models.aw.checksum : models.jump.checksum } : null;
}
export function isWithinRankOneCap(price: number, cap: 21 | 26 | null) { return cap === null || price <= cap; }
export function buildRankOneObservations(input: {
  meetings: TodayMeeting[];
  raceDate: string;
  capturedAt: Date;
  models: RankOneModels;
}): RankOneObservation[] {
  const { capturedAt: now, raceDate, models } = input;
  if (!Number.isFinite(now.getTime()) || now.toISOString() < RANK_ONE_EPOCH || raceDate !== getLocalRacingDate(now))
    return [];
  return input.meetings.flatMap(m => m.races.flatMap(race => {
    if (!race.raceDateTime || now >= race.raceDateTime || getLocalRacingDate(race.raceDateTime) !== raceDate || race.winningTime ||
      race.runners.some(r => r.finishingPosition !== null || (r.resultStatus !== null && r.resultStatus !== "non_runner")))
      return [];
    const active = race.runners.filter(r => r.resultStatus !== "non_runner");
    if (active.length < 2 || !hasCompleteProspectiveField(rankOneFamily(race) === "TURF" ? { ...race, actualRunnerCount: null } : race))
      return [];
    const prices = active.map(r => ({ runner: r, market: summarizeBookmakerMarket(r.bookmakerQuotes) }));
    if (prices.some(p => p.market.decimalPrice === null))
      return [];
    const leader = currentRankOne(race, m.courseName, raceDate, models, now);
    if (!leader)
      return [];
    const selected = prices.find(p => p.runner.runnerId === leader.runnerId);
    if (!selected)
      return [];
    const price = selected.market.decimalPrice!;
    const total = prices.reduce((s, p) => s + 1 / p.market.decimalPrice!, 0);
    const cap = RANK_ONE_CAPS[leader.family];
    return [{ version: RANK_ONE_VERSION, raceId: race.raceId, runnerId: leader.runnerId, horseId: selected.runner.horseId, horseName: selected.runner.horseName,
        ...(leader.family === "TURF" ? { liveSemanticsVersion: TISSUE_V3_LIVE_SEMANTICS_VERSION, liveSemanticsEffectiveAt: TISSUE_V3_EPOCH } : {}),
        family: leader.family, raceDate, scheduledOff: race.raceDateTime.toISOString(), course: m.courseName, raceName: race.raceName,
        rankSource: RANK_ONE_SOURCES[leader.family], modelHash: leader.modelHash, rank: 1, firstCapturedAt: now.toISOString(), capturedFieldRunnerIds: active.map(r => r.runnerId),
        market: { source: "sporting_life_median_bookmaker_at_capture_v1", medianBookmakerDecimal: price, normalizedProbability: (1 / price) / total,
          marketRank: 1 + prices.filter(p => p.market.decimalPrice! < price).length, quotes: selected.market.quotes,
          fieldPrices: prices.map(p => ({ runnerId: p.runner.runnerId, decimalPrice: p.market.decimalPrice! })) }, cap, withinCap: isWithinRankOneCap(price, cap), outcome: null }];
  }));
}
export function appendRankOne(data: RankOneData, rows: RankOneObservation[]) {
  // Also enforce one frozen selection per race/family/version if the live rank changes later.
  const key = (r: RankOneObservation) => `${r.version}|${r.family}|${r.raceId}`;
  const known = new Set(data.observations.map(key));
  const additions = rows.filter(r => { if (known.has(key(r)) || r.version !== data.version || r.firstCapturedAt < data.epoch || r.firstCapturedAt >= r.scheduledOff || r.raceDate !== getLocalRacingDate(new Date(r.firstCapturedAt)) || r.outcome)
    return false; known.add(key(r)); return true; });
  return additions.length ? { ...data, observations: [...data.observations, ...additions] } : data;
}
export function settleRankOne(data: RankOneData, races: ReadonlyMap<string, TodayRace>, now = new Date()): RankOneData {
  const observations = data.observations.map(row => {
    if (row.outcome)
      return row;
    const race = races.get(row.raceId);
    const runner = race?.runners.find(r => r.runnerId === row.runnerId);
    if (!race || !runner)
      return row;
    const base = { finishPosition: runner.finishingPosition, resultStatus: runner.resultStatus, settledAt: now.toISOString() };
    if (isVoidBetResultStatus(runner.resultStatus))
      return { ...row, outcome: { ...base, status: runner.resultStatus?.trim().toLowerCase() === "non_runner" ? "NR" as const : "void" as const, winner: null, deadHeatDivisor: 1, grossReturn: null, profitLoss: null, roi: null } };
    if (now < new Date(row.scheduledOff) || !row.capturedFieldRunnerIds.every(id => race.runners.some(r => r.runnerId === id)) || new Set(race.runners.map(r => r.runnerId)).size !== race.runners.length)
      return row;
    const starters = race.runners.filter(r => !isVoidBetResultStatus(r.resultStatus));
    const winners = starters.filter(r => r.finishingPosition === 1);
    if (!winners.length || (race.actualRunnerCount !== starters.length && race.actualRunnerCount !== race.runners.length) || starters.some(r => (r.finishingPosition !== null && (!Number.isInteger(r.finishingPosition) || r.finishingPosition < 1 || r.finishingPosition > starters.length)) ||
      settleSelection({ targetRaceId: race.raceId, targetRunnerId: r.runnerId, finishingPosition: r.finishingPosition, resultStatus: r.resultStatus, won: null, placed: null, startingPrice: null, startingPriceDecimal: "2" }) === null))
      return row;
    const winner = runner.finishingPosition === 1;
    const divisor = winner ? winners.length : 1;
    const settlement = settleSelection({ targetRaceId: race.raceId, targetRunnerId: row.runnerId, finishingPosition: runner.finishingPosition, resultStatus: runner.resultStatus, won: winner, placed: null, startingPrice: null, startingPriceDecimal: String(row.market.medianBookmakerDecimal), deadHeatDivisor: divisor });
    return { ...row, outcome: { ...base, status: "settled" as const, winner, deadHeatDivisor: divisor, grossReturn: settlement?.grossReturn ?? null, profitLoss: settlement?.profitLoss ?? null, roi: settlement?.profitLoss ?? null } };
  });
  return observations.every((r, i) => r === data.observations[i]) ? data : { ...data, observations };
}
export function rankOneMetrics(rows: RankOneObservation[]) {
  const settled = rows.filter(r => r.outcome?.status === "settled");
  const winners = settled.filter(r => r.outcome?.winner).length;
  const expected = settled.reduce((s, r) => s + r.market.normalizedProbability, 0);
  const priced = settled.filter(r => r.outcome?.profitLoss !== null);
  const profit = priced.length ? priced.reduce((s, r) => s + r.outcome!.profitLoss!, 0) : null;
  return { tracked: rows.length, settled: settled.length, winners, strikeRate: settled.length ? winners / settled.length : null, marketExpectedWinners: expected,
    ae: expected ? winners / expected : null, pricedSettled: priced.length, profitLoss: profit, roi: priced.length && profit !== null ? profit / priced.length : null,
    nonRunners: rows.filter(r => r.outcome?.status === "NR").length, voids: rows.filter(r => r.outcome?.status === "void").length };
}
export function summarizeRankOne(data: RankOneData) {
  const v3 = (row: RankOneObservation) => row.liveSemanticsVersion === TISSUE_V3_LIVE_SEMANTICS_VERSION && row.firstCapturedAt >= TISSUE_V3_EPOCH;
  const v2 = (row: RankOneObservation) => row.liveSemanticsVersion === TURF_TISSUE_LIVE_SEMANTICS_VERSION && row.firstCapturedAt >= TURF_TISSUE_LIVE_SEMANTICS_EPOCH;
  const summarize = (family: RankOneFamily, rows: RankOneObservation[], cohort: string, epoch: string) => ({
    family, cohort, epoch, cap: RANK_ONE_CAPS[family], ...rankOneMetrics(rows), withinCap: rankOneMetrics(rows.filter(r => r.withinCap)),
  });
  const summaries = RANK_ONE_FAMILIES.map(family => summarize(family,
    data.observations.filter(r => r.family === family && (family !== "TURF" || v3(r))),
    family === "TURF" ? TISSUE_V3_LIVE_SEMANTICS_VERSION : "original",
    family === "TURF" ? TISSUE_V3_EPOCH : data.epoch));
  const correctedV2 = data.observations.filter(r => r.family === "TURF" && v2(r));
  if (correctedV2.length) summaries.push(summarize("TURF", correctedV2, TURF_TISSUE_LIVE_SEMANTICS_VERSION, TURF_TISSUE_LIVE_SEMANTICS_EPOCH));
  const legacy = data.observations.filter(r => r.family === "TURF" && !v3(r) && !v2(r));
  if (legacy.length) summaries.push(summarize("TURF", legacy, "legacy live semantics", data.epoch));
  return summaries;
}
export async function runRankOneCycle(input: {
  data: RankOneData;
  mode: "morning" | "live" | "after";
  raceDate: string;
  now?: Date;
  loadCapture: () => Promise<{
    meetings: TodayMeeting[];
    models: RankOneModels;
  }>;
  loadResults: (ids: string[]) => Promise<ReadonlyMap<string, TodayRace>>;
}) {
  const now = input.now ?? new Date();
  let data = input.data;
  if (input.mode === "morning" && getLocalRacingDate(now) === input.raceDate && now.toISOString() >= RANK_ONE_EPOCH) {
    const capture = await input.loadCapture();
    data = appendRankOne(data, buildRankOneObservations({ ...capture, raceDate: input.raceDate, capturedAt: input.now ?? new Date() }));
  }
  const ids = [...new Set(data.observations.filter(r => !r.outcome).map(r => r.raceId))];
  return ids.length ? settleRankOne(data, await input.loadResults(ids), now) : data;
}
