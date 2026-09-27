import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { settleSelection } from "./backtest";
import { formatRaceTimeForDisplay, type TodayMeeting, type TodayRace } from "./todays-racing";

export const FORWARD_VALUE_VERSION = "forward_value_v1" as const;
export const FORWARD_VALUE_PATH = "data/research/forward-value-v1.json";
export const FORWARD_VALUE_CALIBRATION_PATH = "data/research/forward-value-calibration-v1.json";
export const EDGE_BANDS = ["<=0pp", ">0-2pp", ">2-5pp", ">5-10pp", ">10pp"] as const;
export const FORWARD_VALUE_PRICE_SOURCE = "sporting_life_imported_racecard" as const;
export const FORWARD_VALUE_SETTLEMENT_VERSION = "canonical_settlement_v2" as const;
export const FORWARD_VALUE_PRICE_WINDOWS = {
  t60: { minimumMinutesBeforeOff: 45, maximumMinutesBeforeOff: 75 },
  t15: { minimumMinutesBeforeOff: 5, maximumMinutesBeforeOff: 25 },
} as const;

export type ValueFamily = "turf" | "jump" | "aw";
export type EdgeBand = typeof EDGE_BANDS[number];
export type ValueExclusionReason =
  | "missing_price"
  | "captured_after_off"
  | "missing_rating_probability"
  | "non_runner"
  | "invalid_or_unknown_settlement"
  | "retrospective_or_non_prospective";
export type ValueSampleStatus =
  | "VERY EARLY"
  | "EARLY"
  | "DEVELOPING"
  | "USABLE FOR INITIAL ASSESSMENT";
export type ForwardValuePriceStage = "early" | "t60" | "t15";

export type ForwardValuePriceSnapshot = {
  decimalPrice: number;
  impliedProbability: number;
  capturedAt: string;
  minutesBeforeScheduledOff: number;
  ratingProbability: number;
  ratingEdgePercentagePoints: number;
};

export type CalibrationBand = {
  key: string;
  minimumGap: number | null;
  maximumGap: number | null;
  selections: number;
  winners: number;
  probability: number;
};

export type FamilyCalibration = {
  family: ValueFamily;
  calibrationVersion: "TPR_CAL_V1" | "JPR_CAL_V1" | "AW_CAL_V1";
  ratingVersion: string;
  leaderProbability: number;
  gapQuartiles: number[];
  gapBands: CalibrationBand[];
};

export type ForwardValueCalibration = {
  version: "forward_value_calibration_v1";
  createdAt: string;
  developmentYear: "2025";
  validationYear: "2026";
  settlementVersion: "canonical_settlement_v2";
  priceVersion: "actual_sp_v2";
  families: Record<ValueFamily, FamilyCalibration>;
  diagnostics: unknown;
};

export type ForwardValueRecord = {
  family: ValueFamily;
  raceId: string;
  raceDate: string;
  raceDateTime: string;
  raceTime: string;
  course: string;
  raceName: string | null;
  ratingVersion: string;
  calibrationVersion: string;
  recordedAt: string;
  recordedPreRace: boolean;
  captureMode?: "live_sync" | "retrospective_or_imported";
  settlementVersion?: typeof FORWARD_VALUE_SETTLEMENT_VERSION;
  phase2ExclusionReason?: ValueExclusionReason | null;
  leaderRunnerId: string;
  leaderHorseId?: string;
  leaderHorseName: string;
  leaderRank: 1;
  leaderScore: number;
  leaderGap: number | null;
  calibratedProbability: number;
  capturedPrice: string | null;
  priceSource?: typeof FORWARD_VALUE_PRICE_SOURCE;
  priceCapturedAt?: string | null;
  minutesBeforeScheduledOff?: number | null;
  capturedDecimalOdds: number | null;
  capturedMarketProbability: number | null;
  edgePercentagePoints: number | null;
  edgeBand: EdgeBand | null;
  earlyPriceSnapshot?: ForwardValuePriceSnapshot | null;
  t60PriceSnapshot?: ForwardValuePriceSnapshot | null;
  t15PriceSnapshot?: ForwardValuePriceSnapshot | null;
  marketFavouriteRunnerIds: string[];
  marketFavouriteHorseNames: string[];
  agreesWithMarketFavourite: boolean | null;
  leaderIsMarketFavourite?: boolean | null;
  tissueRunnerId: string | null;
  tissueHorseName: string | null;
  tissueProbability: number | null;
  tissueAgreesWithTpr: boolean | null;
  tissueCapturedPrice?: string | null;
  tissueCapturedDecimalOdds?: number | null;
  tissueMarketProbability?: number | null;
  tissueEdgePercentagePoints?: number | null;
  tissuePriceCapturedAt?: string | null;
  winnerRunnerIds: string[];
  leaderResultStatus: string | null;
  leaderFinishingPosition: number | null;
  leaderWon: boolean | null;
  finalSp: number | null;
  grossReturn: number | null;
  profitLoss: number | null;
  capturedPriceGrossReturn?: number | null;
  capturedPriceProfitLoss?: number | null;
  settledAt: string | null;
};

export type ForwardValueData = {
  version: typeof FORWARD_VALUE_VERSION;
  races: ForwardValueRecord[];
};

export function emptyForwardValueData(): ForwardValueData {
  return { version: FORWARD_VALUE_VERSION, races: [] };
}

export async function loadForwardValueCalibration(path = FORWARD_VALUE_CALIBRATION_PATH): Promise<ForwardValueCalibration> {
  return JSON.parse(await readFile(path, "utf8")) as ForwardValueCalibration;
}

export async function loadForwardValueData(path = FORWARD_VALUE_PATH): Promise<ForwardValueData> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as ForwardValueData;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyForwardValueData();
    throw error;
  }
}

export async function saveForwardValueData(data: ForwardValueData, path = FORWARD_VALUE_PATH) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

export async function mutateForwardValueData(
  mutation: (latest: ForwardValueData) => ForwardValueData | Promise<ForwardValueData>,
  path = FORWARD_VALUE_PATH,
): Promise<ForwardValueData> {
  const lockPath = `${resolve(path)}.lock`;
  const deadline = Date.now() + 30_000;
  await mkdir(dirname(lockPath), { recursive: true });
  while (true) {
    try {
      await mkdir(lockPath);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST" || Date.now() >= deadline) throw error;
      await new Promise((resolveWait) => setTimeout(resolveWait, 10));
    }
  }
  try {
    const latest = await loadForwardValueData(path);
    const updated = await mutation(latest);
    if (JSON.stringify(updated) !== JSON.stringify(latest)) await saveForwardValueData(updated, path);
    return updated;
  } finally {
    await rm(lockPath, { recursive: true, force: true });
  }
}

export function buildForwardValueRecord(input: {
  family: ValueFamily;
  raceDate: string;
  course: string;
  race: TodayRace;
  calibration: FamilyCalibration;
  recordedAt?: Date;
  tissue?: { runnerId: string; horseName: string; probability: number } | null;
}): ForwardValueRecord | null {
  const recordedAt = input.recordedAt ?? new Date();
  const raceDateTime = input.race.raceDateTime;
  if (!raceDateTime || !input.race.scheduledTime || recordedAt >= raceDateTime) return null;
  const active = input.race.runners.filter((runner) => runner.resultStatus !== "non_runner");
  const ranked = active.flatMap((runner) => {
    if (input.family === "turf" && runner.turfPerformanceRating) {
      return [{ runner, rank: runner.turfPerformanceRating.rank, score: runner.turfPerformanceRating.rating, gap: runner.turfPerformanceRating.gap }];
    }
    if (input.family === "jump" && runner.jumpRating?.jprA) {
      return [{ runner, rank: runner.jumpRating.jprA.rank, score: runner.jumpRating.jprA.score, gap: null }];
    }
    if (input.family === "aw" && runner.awRating?.awD) {
      return [{ runner, rank: runner.awRating.awD.rank, score: runner.awRating.awD.score, gap: null }];
    }
    return [];
  }).sort((left, right) => left.rank - right.rank || left.runner.runnerId.localeCompare(right.runner.runnerId));
  const leader = ranked.find((entry) => entry.rank === 1);
  if (!leader) return null;
  const secondScore = ranked.find((entry) => entry.rank > 1)?.score ?? null;
  const gap = input.family === "turf"
    ? leader.gap
    : secondScore === null ? null : secondScore - leader.score;
  const probability = calibratedLeaderProbability(input.calibration, gap);
  const capturedDecimalOdds = decimal(leader.runner.oddsDecimal);
  const marketProbability = capturedDecimalOdds === null ? null : 1 / capturedDecimalOdds;
  const edge = marketProbability === null ? null : (probability - marketProbability) * 100;
  const priced = active.flatMap((runner) => {
    const price = decimal(runner.oddsDecimal);
    return price === null ? [] : [{ runner, price }];
  });
  const shortest = priced.length === 0 ? null : Math.min(...priced.map((entry) => entry.price));
  const favourites = shortest === null ? [] : priced.filter((entry) => entry.price === shortest);
  const tissue = input.family === "turf" ? input.tissue ?? null : null;
  const tissueRunner = tissue ? active.find((runner) => runner.runnerId === tissue.runnerId) : null;
  const tissueDecimalOdds = decimal(tissueRunner?.oddsDecimal);
  const tissueMarketProbability = tissueDecimalOdds === null ? null : 1 / tissueDecimalOdds;
  const tissueEdge = tissue && tissueMarketProbability !== null
    ? (tissue.probability - tissueMarketProbability) * 100
    : null;
  const minutesBeforeScheduledOff = (raceDateTime.getTime() - recordedAt.getTime()) / 60_000;
  const earlyPriceSnapshot = capturedDecimalOdds === null ? null : createPriceSnapshot({
    decimalPrice: capturedDecimalOdds,
    capturedAt: recordedAt,
    raceDateTime,
    ratingProbability: probability,
  });
  return {
    family: input.family,
    raceId: input.race.raceId,
    raceDate: input.raceDate,
    raceDateTime: raceDateTime.toISOString(),
    raceTime: input.race.scheduledTime.slice(0, 5),
    course: input.course,
    raceName: input.race.raceName,
    ratingVersion: input.calibration.ratingVersion,
    calibrationVersion: input.calibration.calibrationVersion,
    recordedAt: recordedAt.toISOString(),
    recordedPreRace: true,
    captureMode: "live_sync",
    settlementVersion: FORWARD_VALUE_SETTLEMENT_VERSION,
    phase2ExclusionReason: capturedDecimalOdds === null ? "missing_price" : null,
    leaderRunnerId: leader.runner.runnerId,
    leaderHorseId: leader.runner.horseId,
    leaderHorseName: leader.runner.horseName,
    leaderRank: 1,
    leaderScore: leader.score,
    leaderGap: gap,
    calibratedProbability: probability,
    capturedPrice: leader.runner.odds,
    priceSource: FORWARD_VALUE_PRICE_SOURCE,
    priceCapturedAt: capturedDecimalOdds === null ? null : recordedAt.toISOString(),
    minutesBeforeScheduledOff: capturedDecimalOdds === null ? null : minutesBeforeScheduledOff,
    capturedDecimalOdds,
    capturedMarketProbability: marketProbability,
    edgePercentagePoints: edge,
    edgeBand: edge === null ? null : edgeBand(edge),
    earlyPriceSnapshot,
    t60PriceSnapshot: null,
    t15PriceSnapshot: null,
    marketFavouriteRunnerIds: favourites.map((entry) => entry.runner.runnerId),
    marketFavouriteHorseNames: favourites.map((entry) => entry.runner.horseName),
    agreesWithMarketFavourite: favourites.length === 0 ? null : favourites.some((entry) => entry.runner.runnerId === leader.runner.runnerId),
    leaderIsMarketFavourite: favourites.length === 0 ? null : favourites.some((entry) => entry.runner.runnerId === leader.runner.runnerId),
    tissueRunnerId: tissue?.runnerId ?? null,
    tissueHorseName: tissue?.horseName ?? null,
    tissueProbability: tissue?.probability ?? null,
    tissueAgreesWithTpr: tissue ? tissue.runnerId === leader.runner.runnerId : null,
    tissueCapturedPrice: tissueRunner?.odds ?? null,
    tissueCapturedDecimalOdds: tissueDecimalOdds,
    tissueMarketProbability,
    tissueEdgePercentagePoints: tissueEdge,
    tissuePriceCapturedAt: tissueDecimalOdds === null ? null : recordedAt.toISOString(),
    winnerRunnerIds: [],
    leaderResultStatus: null,
    leaderFinishingPosition: null,
    leaderWon: null,
    finalSp: null,
    grossReturn: null,
    profitLoss: null,
    capturedPriceGrossReturn: null,
    capturedPriceProfitLoss: null,
    settledAt: null,
  };
}

export function upsertForwardValueRecords(data: ForwardValueData, candidates: ForwardValueRecord[]): ForwardValueData {
  const ids = new Set(data.races.map((race) => race.raceId));
  const additions = candidates.filter((candidate) => {
    if (ids.has(candidate.raceId)) return false;
    ids.add(candidate.raceId);
    return true;
  });
  return additions.length === 0 ? data : { ...data, races: [...data.races, ...additions] };
}

export function priceSnapshotStage(minutesBeforeScheduledOff: number): Exclude<ForwardValuePriceStage, "early"> | null {
  if (!Number.isFinite(minutesBeforeScheduledOff)) return null;
  const t60 = FORWARD_VALUE_PRICE_WINDOWS.t60;
  if (minutesBeforeScheduledOff >= t60.minimumMinutesBeforeOff && minutesBeforeScheduledOff <= t60.maximumMinutesBeforeOff) {
    return "t60";
  }
  const t15 = FORWARD_VALUE_PRICE_WINDOWS.t15;
  if (minutesBeforeScheduledOff >= t15.minimumMinutesBeforeOff && minutesBeforeScheduledOff <= t15.maximumMinutesBeforeOff) {
    return "t15";
  }
  return null;
}

export function forwardValuePriceSnapshot(
  record: ForwardValueRecord,
  stage: ForwardValuePriceStage,
): ForwardValuePriceSnapshot | null {
  if (stage === "t60") return record.t60PriceSnapshot ?? null;
  if (stage === "t15") return record.t15PriceSnapshot ?? null;
  if (record.earlyPriceSnapshot) return record.earlyPriceSnapshot;
  if (
    record.capturedDecimalOdds === null ||
    record.capturedMarketProbability === null ||
    record.edgePercentagePoints === null ||
    !record.priceCapturedAt ||
    record.minutesBeforeScheduledOff === null ||
    record.minutesBeforeScheduledOff === undefined
  ) return null;
  return {
    decimalPrice: record.capturedDecimalOdds,
    impliedProbability: record.capturedMarketProbability,
    capturedAt: record.priceCapturedAt,
    minutesBeforeScheduledOff: record.minutesBeforeScheduledOff,
    ratingProbability: record.calibratedProbability,
    ratingEdgePercentagePoints: record.edgePercentagePoints,
  };
}

export function enrichForwardValuePriceSnapshots(
  data: ForwardValueData,
  input: { family: ValueFamily; meetings: TodayMeeting[]; capturedAt?: Date },
): ForwardValueData {
  const capturedAt = input.capturedAt ?? new Date();
  const racesById = new Map(input.meetings.flatMap((meeting) => meeting.races.map((race) => [race.raceId, race] as const)));
  let changed = false;
  const races = data.races.map((record) => {
    if (record.family !== input.family || record.settledAt !== null) return record;
    const race = racesById.get(record.raceId);
    const off = new Date(record.raceDateTime);
    if (!race || !Number.isFinite(off.getTime()) || capturedAt >= off) return record;
    const runner = race.runners.find((candidate) => candidate.runnerId === record.leaderRunnerId);
    const decimalPrice = decimal(runner?.oddsDecimal);
    if (decimalPrice === null) return record;
    const minutesBeforeScheduledOff = (off.getTime() - capturedAt.getTime()) / 60_000;
    const snapshot = createPriceSnapshot({
      decimalPrice,
      capturedAt,
      raceDateTime: off,
      ratingProbability: record.calibratedProbability,
    });
    const stage = priceSnapshotStage(minutesBeforeScheduledOff);
    const hasEarlyPrice = forwardValuePriceSnapshot(record, "early") !== null;
    const addEarly = !hasEarlyPrice;
    const addT60 = stage === "t60" && !record.t60PriceSnapshot;
    const addT15 = stage === "t15" && !record.t15PriceSnapshot;
    if (!addEarly && !addT60 && !addT15) return record;
    changed = true;
    return {
      ...record,
      ...(addEarly ? {
        capturedPrice: runner?.odds ?? String(decimalPrice),
        priceSource: FORWARD_VALUE_PRICE_SOURCE,
        priceCapturedAt: capturedAt.toISOString(),
        minutesBeforeScheduledOff,
        capturedDecimalOdds: decimalPrice,
        capturedMarketProbability: snapshot.impliedProbability,
        edgePercentagePoints: snapshot.ratingEdgePercentagePoints,
        edgeBand: edgeBand(snapshot.ratingEdgePercentagePoints),
        earlyPriceSnapshot: snapshot,
        phase2ExclusionReason: record.phase2ExclusionReason === "missing_price" ? null : record.phase2ExclusionReason,
      } : {}),
      ...(addT60 ? { t60PriceSnapshot: snapshot } : {}),
      ...(addT15 ? { t15PriceSnapshot: snapshot } : {}),
    };
  });
  return changed ? { ...data, races } : data;
}

export function forwardValuePriceMovement(
  from: ForwardValuePriceSnapshot | null,
  toDecimalPrice: number | null,
): number | null {
  if (!from || toDecimalPrice === null || !Number.isFinite(toDecimalPrice) || toDecimalPrice <= 1) return null;
  return toDecimalPrice / from.decimalPrice - 1;
}

export function buildForwardValueRecordsFromMeetings(input: {
  family: ValueFamily;
  raceDate: string;
  meetings: TodayMeeting[];
  calibration: FamilyCalibration;
  recordedAt?: Date;
  tissueByRaceId?: Map<string, { runnerId: string; horseName: string; probability: number }>;
}) {
  return input.meetings.flatMap((meeting) => meeting.races.flatMap((race) => {
    const record = buildForwardValueRecord({
      family: input.family,
      raceDate: input.raceDate,
      course: meeting.courseName,
      race,
      calibration: input.calibration,
      recordedAt: input.recordedAt,
      tissue: input.tissueByRaceId?.get(race.raceId),
    });
    return record ? [record] : [];
  }));
}

export function attachTissueValueSnapshots(
  data: ForwardValueData,
  snapshots: Map<string, {
    runnerId: string;
    horseName: string;
    probability: number;
    recordedPreRace: boolean | null;
    capturedPrice?: string | null;
    capturedDecimalOdds?: number | null;
    priceCapturedAt?: string | null;
  }>,
): ForwardValueData {
  let updated = false;
  const races = data.races.map((race) => {
    if (race.family !== "turf" || race.settledAt !== null) return race;
    const tissue = snapshots.get(race.raceId);
    if (!tissue || tissue.recordedPreRace !== true) return race;
    const canAttachProbability = race.tissueProbability === null;
    const tissuePriceAt = tissue.priceCapturedAt ? new Date(tissue.priceCapturedAt) : null;
    const canAttachPrice = race.tissueCapturedDecimalOdds == null &&
      tissue.capturedDecimalOdds != null &&
      tissuePriceAt !== null &&
      Number.isFinite(tissuePriceAt.getTime()) &&
      tissuePriceAt < new Date(race.raceDateTime);
    if (!canAttachProbability && !canAttachPrice) return race;
    const probability = canAttachProbability ? tissue.probability : race.tissueProbability;
    const marketProbability = canAttachPrice ? 1 / tissue.capturedDecimalOdds! : race.tissueMarketProbability ?? null;
    updated = true;
    return {
      ...race,
      tissueRunnerId: canAttachProbability ? tissue.runnerId : race.tissueRunnerId,
      tissueHorseName: canAttachProbability ? tissue.horseName : race.tissueHorseName,
      tissueProbability: probability,
      tissueAgreesWithTpr: canAttachProbability ? tissue.runnerId === race.leaderRunnerId : race.tissueAgreesWithTpr,
      tissueCapturedPrice: canAttachPrice ? tissue.capturedPrice ?? null : race.tissueCapturedPrice ?? null,
      tissueCapturedDecimalOdds: canAttachPrice ? tissue.capturedDecimalOdds! : race.tissueCapturedDecimalOdds ?? null,
      tissueMarketProbability: marketProbability,
      tissueEdgePercentagePoints: probability === null || marketProbability === null
        ? null
        : (probability - marketProbability) * 100,
      tissuePriceCapturedAt: canAttachPrice ? tissue.priceCapturedAt! : race.tissuePriceCapturedAt ?? null,
    };
  });
  return updated ? { ...data, races } : data;
}

export function pendingForwardValueRaceIds(data: ForwardValueData, family?: ValueFamily): string[] {
  return data.races.filter((race) => (!family || race.family === family) && race.settledAt === null).map((race) => race.raceId);
}

export function settleForwardValueRecords(data: ForwardValueData, racesById: Map<string, TodayRace>, settledAt = new Date()) {
  let settled = 0;
  const races = data.races.map((record) => {
    if (record.settledAt !== null) return record;
    const race = racesById.get(record.raceId);
    if (!race) return record;
    const winners = race.runners.filter((runner) => runner.finishingPosition === 1);
    if (winners.length === 0) return record;
    const result = race.runners.find((runner) => runner.runnerId === record.leaderRunnerId);
    if (!result) return record;
    const settlement = settleSelection({
      targetRaceId: record.raceId,
      targetRunnerId: result.runnerId,
      finishingPosition: result.finishingPosition,
      resultStatus: result.resultStatus,
      won: result.finishingPosition === 1,
      placed: result.finishingPosition !== null && result.finishingPosition <= 3,
      startingPrice: result.odds,
      startingPriceDecimal: result.oddsDecimal,
      deadHeatDivisor: winners.length,
    });
    const capturedPriceSettlement = settleSelection({
      targetRaceId: record.raceId,
      targetRunnerId: result.runnerId,
      finishingPosition: result.finishingPosition,
      resultStatus: result.resultStatus,
      won: result.finishingPosition === 1,
      placed: result.finishingPosition !== null && result.finishingPosition <= 3,
      startingPrice: record.capturedPrice,
      startingPriceDecimal: record.capturedDecimalOdds === null ? null : String(record.capturedDecimalOdds),
      deadHeatDivisor: winners.length,
    });
    const phase2ExclusionReason = record.phase2ExclusionReason ?? (
      isNonRunnerStatus(result.resultStatus)
        ? "non_runner"
        : capturedPriceSettlement === null
          ? "invalid_or_unknown_settlement"
          : null
    );
    settled += 1;
    return {
      ...record,
      winnerRunnerIds: winners.map((winner) => winner.runnerId),
      leaderResultStatus: result.resultStatus,
      leaderFinishingPosition: result.finishingPosition,
      leaderWon: result.finishingPosition === 1,
      finalSp: decimal(result.oddsDecimal),
      grossReturn: settlement?.grossReturn ?? null,
      profitLoss: settlement?.profitLoss ?? null,
      capturedPriceGrossReturn: capturedPriceSettlement?.grossReturn ?? null,
      capturedPriceProfitLoss: capturedPriceSettlement?.profitLoss ?? null,
      phase2ExclusionReason,
      settledAt: settledAt.toISOString(),
    };
  });
  return { data: settled === 0 ? data : { ...data, races }, settled };
}

export function calibratedLeaderProbability(calibration: FamilyCalibration, gap: number | null): number {
  if (gap === null || !Number.isFinite(gap)) return calibration.leaderProbability;
  return calibration.gapBands.find((band) =>
    (band.minimumGap === null || gap > band.minimumGap) &&
    (band.maximumGap === null || gap <= band.maximumGap)
  )?.probability ?? calibration.leaderProbability;
}

export function edgeBand(edge: number): EdgeBand {
  if (edge <= 0) return "<=0pp";
  if (edge <= 2) return ">0-2pp";
  if (edge <= 5) return ">2-5pp";
  if (edge <= 10) return ">5-10pp";
  return ">10pp";
}

export function valueExclusionReason(record: ForwardValueRecord): ValueExclusionReason | null {
  const off = new Date(record.raceDateTime);
  const captured = new Date(record.priceCapturedAt ?? record.recordedAt);
  if (
    record.recordedPreRace !== true ||
    (record.captureMode !== undefined && record.captureMode !== "live_sync") ||
    !Number.isFinite(off.getTime()) ||
    !Number.isFinite(captured.getTime())
  ) return "retrospective_or_non_prospective";
  if (captured >= off) return "captured_after_off";
  if (!Number.isFinite(record.calibratedProbability) || record.calibratedProbability <= 0 || record.calibratedProbability >= 1) {
    return "missing_rating_probability";
  }
  if (record.capturedDecimalOdds === null || !Number.isFinite(record.capturedDecimalOdds) || record.capturedDecimalOdds <= 1) {
    return "missing_price";
  }
  if (record.settlementVersion !== undefined && record.settlementVersion !== FORWARD_VALUE_SETTLEMENT_VERSION) {
    return "invalid_or_unknown_settlement";
  }
  if (isNonRunnerStatus(record.leaderResultStatus)) return "non_runner";
  if (record.settledAt !== null && (typeof record.leaderWon !== "boolean" || capturedPriceProfitLoss(record) === null)) {
    return "invalid_or_unknown_settlement";
  }
  return null;
}

export function isCleanPhase2Observation(record: ForwardValueRecord): boolean {
  return valueExclusionReason(record) === null;
}

export function isCleanSettledPhase2Observation(record: ForwardValueRecord): boolean {
  return record.settledAt !== null && isCleanPhase2Observation(record);
}

export function capturedPriceProfitLoss(record: ForwardValueRecord): number | null {
  if (record.capturedPriceProfitLoss !== undefined) return record.capturedPriceProfitLoss;
  if (typeof record.leaderWon !== "boolean" || record.capturedDecimalOdds === null || isNonRunnerStatus(record.leaderResultStatus)) return null;
  if (!record.leaderWon) return -1;
  return record.capturedDecimalOdds / Math.max(record.winnerRunnerIds.length, 1) - 1;
}

export function valueSampleStatus(observations: number): ValueSampleStatus {
  if (observations < 25) return "VERY EARLY";
  if (observations < 100) return "EARLY";
  if (observations < 250) return "DEVELOPING";
  return "USABLE FOR INITIAL ASSESSMENT";
}

export function tissueValueAgreement(record: ForwardValueRecord): "both_positive" | "both_non_positive" | "disagree" | null {
  if (record.edgePercentagePoints === null || record.tissueEdgePercentagePoints == null) return null;
  const ratingPositive = record.edgePercentagePoints > 0;
  const tissuePositive = record.tissueEdgePercentagePoints > 0;
  if (ratingPositive !== tissuePositive) return "disagree";
  return ratingPositive ? "both_positive" : "both_non_positive";
}

export function renderForwardValueToday(data: ForwardValueData, date: string): string {
  const records = data.races
    .filter((race) => race.raceDate === date)
    .sort((left, right) => left.raceDateTime.localeCompare(right.raceDateTime));
  const lines = [`# Forward Value Today - ${date}`, ""];
  if (records.length === 0) return `${lines.join("\n")}No clean prospective value records.`;
  for (const family of ["turf", "jump", "aw"] as ValueFamily[]) {
    const selected = records.filter((race) => race.family === family);
    if (selected.length === 0) continue;
    lines.push(`## ${family === "aw" ? "AW" : title(family)}`);
    for (const race of selected) {
      const favourite = race.marketFavouriteHorseNames.length ? race.marketFavouriteHorseNames.join(" / ") : "-";
      const exclusion = valueExclusionReason(race);
      const priceState = race.capturedDecimalOdds === null
        ? "price unavailable"
        : `price frozen ${race.capturedPrice ?? "-"} (${race.capturedDecimalOdds.toFixed(2)}) at ${race.priceCapturedAt ?? race.recordedAt}`;
      const t60 = forwardValuePriceSnapshot(race, "t60");
      const t15 = forwardValuePriceSnapshot(race, "t15");
      const laterPrices = ` | T-60 ${t60 ? `${t60.decimalPrice.toFixed(2)} / ${pp(t60.ratingEdgePercentagePoints)}` : "-"}` +
        ` | T-15 ${t15 ? `${t15.decimalPrice.toFixed(2)} / ${pp(t15.ratingEdgePercentagePoints)}` : "-"}`;
      const tissue = race.tissueProbability === null
        ? ""
        : ` | Tissue ${pct(race.tissueProbability)}, price ${race.tissueCapturedPrice ?? "-"}, edge ${pp(race.tissueEdgePercentagePoints ?? null)}`;
      lines.push(`${formatForwardValueRaceTime(race)} ${race.course}${race.raceName ? ` - ${race.raceName}` : ""}`);
      lines.push(
        `  ${familyLabel(race.family)} | ${race.leaderHorseName} | model ${pct(race.calibratedProbability)} | ` +
        `${priceState}${laterPrices} | ` +
        `market ${pct(race.capturedMarketProbability)} | edge ${pp(race.edgePercentagePoints)} | ` +
        `favourite ${favourite} | leader favourite ${yesNo(race.leaderIsMarketFavourite ?? race.agreesWithMarketFavourite)}${tissue} | ` +
        `${exclusion ? `EXCLUDED: ${exclusion}` : "included in prospective analysis"} | ${race.settledAt ? "settled" : "pending"}`,
      );
    }
    lines.push("");
  }
  lines.push("Diagnostic observation only; not a betting recommendation.");
  return lines.join("\n").trimEnd();
}

export function formatForwardValueRaceTime(
  record: Pick<ForwardValueRecord, "raceDateTime" | "raceTime">,
): string {
  const raceDateTime = new Date(record.raceDateTime);
  return formatRaceTimeForDisplay({
    raceDateTime: Number.isFinite(raceDateTime.getTime()) ? raceDateTime : null,
    scheduledTime: record.raceTime,
  });
}

function createPriceSnapshot(input: {
  decimalPrice: number;
  capturedAt: Date;
  raceDateTime: Date;
  ratingProbability: number;
}): ForwardValuePriceSnapshot {
  const impliedProbability = 1 / input.decimalPrice;
  return {
    decimalPrice: input.decimalPrice,
    impliedProbability,
    capturedAt: input.capturedAt.toISOString(),
    minutesBeforeScheduledOff: (input.raceDateTime.getTime() - input.capturedAt.getTime()) / 60_000,
    ratingProbability: input.ratingProbability,
    ratingEdgePercentagePoints: (input.ratingProbability - impliedProbability) * 100,
  };
}

function decimal(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 1 ? parsed : null;
}

function isNonRunnerStatus(value: string | null) {
  return value?.trim().toLowerCase() === "non_runner";
}

function title(value: string) { return value[0]!.toUpperCase() + value.slice(1); }
function familyLabel(value: ValueFamily) { return value === "turf" ? "TPR / Turf" : value === "jump" ? "JPR-A / Jump" : "AW-D / AW"; }
function pct(value: number | null) { return value === null ? "-" : `${(value * 100).toFixed(1)}%`; }
function pp(value: number | null) { return value === null ? "-" : `${value >= 0 ? "+" : ""}${value.toFixed(1)}pp`; }
function yesNo(value: boolean | null) { return value === null ? "-" : value ? "yes" : "no"; }
