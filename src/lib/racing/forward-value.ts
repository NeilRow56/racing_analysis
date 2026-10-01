import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { settleSelection } from "./backtest";
import type { TprConfidenceContext } from "./tpr-confidence-context";
import { calculateAwDRatingCoverage } from "./aw-performance-rating";
import {
  calculateRatingCoverage,
  JPR_A_RATING_COVERAGE_GUARD_IMPLEMENTED_AT,
  JPR_A_RATING_COVERAGE_GUARD_VERSION,
  TPR_RATING_COVERAGE_GUARD_IMPLEMENTED_AT,
  TPR_RATING_COVERAGE_GUARD_VERSION,
} from "./rating-coverage";
import {
  formatRaceTimeForDisplay,
  type SportingLifeBookmakerQuote,
  type TodayMeeting,
  type TodayRace,
  type TodayRunner,
} from "./todays-racing";

export const FORWARD_VALUE_VERSION = "forward_value_v1" as const;
export const FORWARD_VALUE_PATH = "data/research/forward-value-v1.json";
export const FORWARD_VALUE_CALIBRATION_PATH = "data/research/forward-value-calibration-v1.json";
export const EDGE_BANDS = ["<=0pp", ">0-2pp", ">2-5pp", ">5-10pp", ">10pp"] as const;
export const FORWARD_VALUE_PRICE_SOURCE = "sporting_life_imported_racecard" as const;
export const FORWARD_VALUE_SETTLEMENT_VERSION = "canonical_settlement_v2" as const;
export const FORWARD_VALUE_PRICE_SNAPSHOT_SCHEDULE_VERSION = "early_t180_t60_v1" as const;
export const FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION = "median_bookmaker_v1" as const;
export const FORWARD_VALUE_MARKET_PRICE_BASIS_IMPLEMENTED_AT = "2026-09-29T05:58:30.000Z" as const;
export const FORWARD_VALUE_PRICE_WINDOWS = {
  t180: { minimumMinutesBeforeOff: 150, maximumMinutesBeforeOff: 210 },
  t60: { minimumMinutesBeforeOff: 30, maximumMinutesBeforeOff: 90 },
} as const;
export const LEGACY_FORWARD_VALUE_PRICE_WINDOWS = {
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
export type ForwardValuePriceSnapshotScheduleVersion = typeof FORWARD_VALUE_PRICE_SNAPSHOT_SCHEDULE_VERSION;
export type ForwardValuePriceStage = "early" | "t180" | "t60" | "t15";

export type ForwardValuePriceSnapshot = {
  price?: string | null;
  decimalPrice: number;
  impliedProbability: number;
  capturedAt: string;
  minutesBeforeScheduledOff: number;
  ratingProbability: number;
  ratingEdgePercentagePoints: number;
  marketPriceBasisVersion?: typeof FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION;
  bookmakerQuoteCount?: number;
  bookmakerQuotes?: SportingLifeBookmakerQuote[];
  medianBookmakerPriceDecimal?: number;
  medianBookmakerImpliedProbability?: number;
  bestBookmakerPriceDecimal?: number | null;
  bestBookmakerPriceFractional?: string | null;
  bestBookmakerName?: string | null;
  forecastPrice?: string | null;
  forecastDecimalPrice?: number | null;
};

export type ForwardValueBookmakerMarket = {
  decimalPrice: number | null;
  impliedProbability: number | null;
  quoteCount: number;
  quotes: SportingLifeBookmakerQuote[];
  bestDecimalPrice: number | null;
  bestFractionalPrice: string | null;
  bestBookmakerName: string | null;
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
  leaderTprConfidence?: TprConfidenceContext;
  leaderGap: number | null;
  calibratedProbability: number;
  capturedPrice: string | null;
  marketPriceBasisVersion?: typeof FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION;
  marketPriceBasisImplementedAt?: typeof FORWARD_VALUE_MARKET_PRICE_BASIS_IMPLEMENTED_AT;
  forecastPrice?: string | null;
  forecastDecimalPrice?: number | null;
  bookmakerQuoteCount?: number;
  bookmakerQuotes?: SportingLifeBookmakerQuote[];
  medianBookmakerPriceDecimal?: number | null;
  medianBookmakerImpliedProbability?: number | null;
  bestBookmakerPriceDecimal?: number | null;
  bestBookmakerPriceFractional?: string | null;
  bestBookmakerName?: string | null;
  priceSource?: typeof FORWARD_VALUE_PRICE_SOURCE;
  priceCapturedAt?: string | null;
  minutesBeforeScheduledOff?: number | null;
  capturedDecimalOdds: number | null;
  capturedMarketProbability: number | null;
  edgePercentagePoints: number | null;
  edgeBand: EdgeBand | null;
  priceSnapshotScheduleVersion?: ForwardValuePriceSnapshotScheduleVersion;
  earlyPriceSnapshot?: ForwardValuePriceSnapshot | null;
  t180PriceSnapshot?: ForwardValuePriceSnapshot | null;
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
  tissueForecastPrice?: string | null;
  tissueForecastDecimalPrice?: number | null;
  tissueBookmakerQuoteCount?: number;
  tissueBookmakerQuotes?: SportingLifeBookmakerQuote[];
  tissueMedianBookmakerPriceDecimal?: number | null;
  tissueMedianBookmakerImpliedProbability?: number | null;
  tissueBestBookmakerPriceDecimal?: number | null;
  tissueBestBookmakerPriceFractional?: string | null;
  tissueBestBookmakerName?: string | null;
  tissueEarlyPriceSnapshot?: ForwardValuePriceSnapshot | null;
  tissueT180PriceSnapshot?: ForwardValuePriceSnapshot | null;
  tissueT60PriceSnapshot?: ForwardValuePriceSnapshot | null;
  winnerRunnerIds: string[];
  leaderResultStatus: string | null;
  leaderFinishingPosition: number | null;
  leaderWon: boolean | null;
  finalSp: number | null;
  grossReturn: number | null;
  profitLoss: number | null;
  capturedPriceGrossReturn?: number | null;
  capturedPriceProfitLoss?: number | null;
  medianMarketPriceGrossReturn?: number | null;
  medianMarketPriceProfitLoss?: number | null;
  bestBookmakerPriceGrossReturn?: number | null;
  bestBookmakerPriceProfitLoss?: number | null;
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

export function summarizeBookmakerMarket(
  quotes: SportingLifeBookmakerQuote[] | null | undefined,
): ForwardValueBookmakerMarket {
  const valid = (quotes ?? [])
    .filter((quote) => Number.isFinite(quote.decimalOdds) && quote.decimalOdds > 1)
    .map((quote) => ({ ...quote }))
    .sort((left, right) => left.decimalOdds - right.decimalOdds ||
      (left.bookmakerName ?? "").localeCompare(right.bookmakerName ?? ""));
  if (valid.length === 0) {
    return {
      decimalPrice: null,
      impliedProbability: null,
      quoteCount: 0,
      quotes: [],
      bestDecimalPrice: null,
      bestFractionalPrice: null,
      bestBookmakerName: null,
    };
  }
  const middle = Math.floor(valid.length / 2);
  const decimalPrice = valid.length % 2 === 1
    ? valid[middle]!.decimalOdds
    : (valid[middle - 1]!.decimalOdds + valid[middle]!.decimalOdds) / 2;
  const bestDecimalPrice = valid.at(-1)!.decimalOdds;
  const bestQuotes = valid.filter((quote) => quote.decimalOdds === bestDecimalPrice);
  return {
    decimalPrice,
    impliedProbability: 1 / decimalPrice,
    quoteCount: valid.length,
    quotes: valid,
    bestDecimalPrice,
    bestFractionalPrice: bestQuotes[0]?.fractionalOdds ?? null,
    bestBookmakerName: bestQuotes.length === 1 ? bestQuotes[0]!.bookmakerName : null,
  };
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
  if (input.family === "turf") {
    const coverage = input.race.tprRatingCoverage ?? calculateRatingCoverage(
      active,
      (runner) => runner.turfPerformanceRating !== undefined,
      TPR_RATING_COVERAGE_GUARD_VERSION,
      TPR_RATING_COVERAGE_GUARD_IMPLEMENTED_AT,
    );
    if (coverage.ratingCoverageStatus === "insufficient_coverage") return null;
  }
  if (input.family === "jump") {
    const coverage = input.race.jumpRatingCoverage?.jprA ?? calculateRatingCoverage(
      active,
      (runner) => runner.jumpRating?.jprA !== null && runner.jumpRating?.jprA !== undefined,
      JPR_A_RATING_COVERAGE_GUARD_VERSION,
      JPR_A_RATING_COVERAGE_GUARD_IMPLEMENTED_AT,
    );
    if (coverage.ratingCoverageStatus === "insufficient_coverage") return null;
  }
  if (input.family === "aw") {
    const coverage = input.race.awRatingCoverage?.awD ?? calculateAwDRatingCoverage(
      active.map((runner) => ({ runnerId: runner.runnerId, resultStatus: runner.resultStatus })),
      new Map(active.map((runner) => [runner.runnerId, runner.awRating ?? { components: { averageAwSpeedLast3: null, trainerPriorStrikeRate: null, jockeyPriorStrikeRate: null }, awD: null, awA: null }])),
    );
    if (coverage.ratingCoverageStatus === "insufficient_coverage") return null;
  }
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
  const leaderMarket = summarizeBookmakerMarket(leader.runner.bookmakerQuotes);
  const capturedDecimalOdds = leaderMarket.decimalPrice;
  const marketProbability = leaderMarket.impliedProbability;
  const edge = marketProbability === null ? null : (probability - marketProbability) * 100;
  const priced = active.flatMap((runner) => {
    const price = summarizeBookmakerMarket(runner.bookmakerQuotes).decimalPrice;
    return price === null ? [] : [{ runner, price }];
  });
  const shortest = priced.length === 0 ? null : Math.min(...priced.map((entry) => entry.price));
  const favourites = shortest === null ? [] : priced.filter((entry) => entry.price === shortest);
  const tissue = input.family === "turf" ? input.tissue ?? null : null;
  const tissueRunner = tissue ? active.find((runner) => runner.runnerId === tissue.runnerId) : null;
  const tissueMarket = summarizeBookmakerMarket(tissueRunner?.bookmakerQuotes);
  const tissueDecimalOdds = tissueMarket.decimalPrice;
  const tissueMarketProbability = tissueMarket.impliedProbability;
  const tissueEdge = tissue && tissueMarketProbability !== null
    ? (tissue.probability - tissueMarketProbability) * 100
    : null;
  const minutesBeforeScheduledOff = (raceDateTime.getTime() - recordedAt.getTime()) / 60_000;
  const earlyPriceSnapshot = capturedDecimalOdds === null ? null : createPriceSnapshot({
    price: null,
    decimalPrice: capturedDecimalOdds,
    capturedAt: recordedAt,
    raceDateTime,
    ratingProbability: probability,
    market: leaderMarket,
    runner: leader.runner,
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
    ...(input.family === "turf" && leader.runner.tprConfidence
      ? { leaderTprConfidence: { ...leader.runner.tprConfidence } }
      : {}),
    leaderGap: gap,
    calibratedProbability: probability,
    capturedPrice: null,
    marketPriceBasisVersion: FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION,
    marketPriceBasisImplementedAt: FORWARD_VALUE_MARKET_PRICE_BASIS_IMPLEMENTED_AT,
    forecastPrice: leader.runner.forecastOdds ?? leader.runner.odds,
    forecastDecimalPrice: leader.runner.forecastDecimalOdds ?? decimal(leader.runner.oddsDecimal),
    bookmakerQuoteCount: leaderMarket.quoteCount,
    bookmakerQuotes: leaderMarket.quotes,
    medianBookmakerPriceDecimal: leaderMarket.decimalPrice,
    medianBookmakerImpliedProbability: leaderMarket.impliedProbability,
    bestBookmakerPriceDecimal: leaderMarket.bestDecimalPrice,
    bestBookmakerPriceFractional: leaderMarket.bestFractionalPrice,
    bestBookmakerName: leaderMarket.bestBookmakerName,
    priceSource: FORWARD_VALUE_PRICE_SOURCE,
    priceCapturedAt: capturedDecimalOdds === null ? null : recordedAt.toISOString(),
    minutesBeforeScheduledOff: capturedDecimalOdds === null ? null : minutesBeforeScheduledOff,
    capturedDecimalOdds,
    capturedMarketProbability: marketProbability,
    edgePercentagePoints: edge,
    edgeBand: edge === null ? null : edgeBand(edge),
    priceSnapshotScheduleVersion: FORWARD_VALUE_PRICE_SNAPSHOT_SCHEDULE_VERSION,
    earlyPriceSnapshot,
    t180PriceSnapshot: null,
    t60PriceSnapshot: null,
    marketFavouriteRunnerIds: favourites.map((entry) => entry.runner.runnerId),
    marketFavouriteHorseNames: favourites.map((entry) => entry.runner.horseName),
    agreesWithMarketFavourite: favourites.length === 0 ? null : favourites.some((entry) => entry.runner.runnerId === leader.runner.runnerId),
    leaderIsMarketFavourite: favourites.length === 0 ? null : favourites.some((entry) => entry.runner.runnerId === leader.runner.runnerId),
    tissueRunnerId: tissue?.runnerId ?? null,
    tissueHorseName: tissue?.horseName ?? null,
    tissueProbability: tissue?.probability ?? null,
    tissueAgreesWithTpr: tissue ? tissue.runnerId === leader.runner.runnerId : null,
    tissueCapturedPrice: null,
    tissueCapturedDecimalOdds: tissueDecimalOdds,
    tissueMarketProbability,
    tissueEdgePercentagePoints: tissueEdge,
    tissuePriceCapturedAt: tissueDecimalOdds === null ? null : recordedAt.toISOString(),
    tissueForecastPrice: tissueRunner?.forecastOdds ?? tissueRunner?.odds ?? null,
    tissueForecastDecimalPrice: tissueRunner?.forecastDecimalOdds ?? decimal(tissueRunner?.oddsDecimal),
    tissueBookmakerQuoteCount: tissueMarket.quoteCount,
    tissueBookmakerQuotes: tissueMarket.quotes,
    tissueMedianBookmakerPriceDecimal: tissueMarket.decimalPrice,
    tissueMedianBookmakerImpliedProbability: tissueMarket.impliedProbability,
    tissueBestBookmakerPriceDecimal: tissueMarket.bestDecimalPrice,
    tissueBestBookmakerPriceFractional: tissueMarket.bestFractionalPrice,
    tissueBestBookmakerName: tissueMarket.bestBookmakerName,
    tissueEarlyPriceSnapshot: tissue && tissueRunner && tissueDecimalOdds !== null
      ? createPriceSnapshot({
        price: null,
        decimalPrice: tissueDecimalOdds,
        capturedAt: recordedAt,
        raceDateTime,
        ratingProbability: tissue.probability,
        market: tissueMarket,
        runner: tissueRunner,
      })
      : null,
    tissueT180PriceSnapshot: null,
    tissueT60PriceSnapshot: null,
    winnerRunnerIds: [],
    leaderResultStatus: null,
    leaderFinishingPosition: null,
    leaderWon: null,
    finalSp: null,
    grossReturn: null,
    profitLoss: null,
    capturedPriceGrossReturn: null,
    capturedPriceProfitLoss: null,
    medianMarketPriceGrossReturn: null,
    medianMarketPriceProfitLoss: null,
    bestBookmakerPriceGrossReturn: null,
    bestBookmakerPriceProfitLoss: null,
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

export function priceSnapshotStage(
  minutesBeforeScheduledOff: number,
  scheduleVersion: ForwardValuePriceSnapshotScheduleVersion | null = FORWARD_VALUE_PRICE_SNAPSHOT_SCHEDULE_VERSION,
): Exclude<ForwardValuePriceStage, "early"> | null {
  if (!Number.isFinite(minutesBeforeScheduledOff)) return null;
  const windows = scheduleVersion === FORWARD_VALUE_PRICE_SNAPSHOT_SCHEDULE_VERSION
    ? FORWARD_VALUE_PRICE_WINDOWS
    : LEGACY_FORWARD_VALUE_PRICE_WINDOWS;
  if ("t180" in windows) {
    const t180 = windows.t180;
    if (minutesBeforeScheduledOff >= t180.minimumMinutesBeforeOff && minutesBeforeScheduledOff <= t180.maximumMinutesBeforeOff) {
      return "t180";
    }
  }
  const t60 = windows.t60;
  if (minutesBeforeScheduledOff >= t60.minimumMinutesBeforeOff && minutesBeforeScheduledOff <= t60.maximumMinutesBeforeOff) {
    return "t60";
  }
  if ("t15" in windows) {
    const t15 = windows.t15;
    if (minutesBeforeScheduledOff >= t15.minimumMinutesBeforeOff && minutesBeforeScheduledOff <= t15.maximumMinutesBeforeOff) {
      return "t15";
    }
  }
  return null;
}

export function forwardValuePriceSnapshot(
  record: ForwardValueRecord,
  stage: ForwardValuePriceStage,
): ForwardValuePriceSnapshot | null {
  if (stage === "t180") return record.t180PriceSnapshot ?? null;
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
    const usesMedianMarket = record.marketPriceBasisVersion === FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION;
    const market = usesMedianMarket ? summarizeBookmakerMarket(runner?.bookmakerQuotes) : null;
    const decimalPrice = usesMedianMarket ? market!.decimalPrice : decimal(runner?.oddsDecimal);
    const minutesBeforeScheduledOff = (off.getTime() - capturedAt.getTime()) / 60_000;
    const scheduleVersion = record.priceSnapshotScheduleVersion ?? null;
    const stage = priceSnapshotStage(minutesBeforeScheduledOff, scheduleVersion);
    const hasEarlyPrice = forwardValuePriceSnapshot(record, "early") !== null;
    const snapshot = decimalPrice === null ? null : createPriceSnapshot({
      price: usesMedianMarket ? null : runner?.odds ?? String(decimalPrice),
      decimalPrice,
      capturedAt,
      raceDateTime: off,
      ratingProbability: record.calibratedProbability,
      market: market ?? undefined,
      runner,
    });
    const addEarly = snapshot !== null && !hasEarlyPrice;
    const addT180 = snapshot !== null && stage === "t180" && !record.t180PriceSnapshot;
    const addT60 = snapshot !== null && stage === "t60" && !record.t60PriceSnapshot;
    const addT15 = snapshot !== null && scheduleVersion === null && stage === "t15" && !record.t15PriceSnapshot;

    const tissueRunner = record.tissueRunnerId
      ? race.runners.find((candidate) => candidate.runnerId === record.tissueRunnerId)
      : null;
    const tissueMarket = usesMedianMarket ? summarizeBookmakerMarket(tissueRunner?.bookmakerQuotes) : null;
    const tissueDecimalPrice = usesMedianMarket ? tissueMarket!.decimalPrice : decimal(tissueRunner?.oddsDecimal);
    const tissueSnapshot = tissueRunner && record.tissueProbability !== null && tissueDecimalPrice !== null
      ? createPriceSnapshot({
        price: usesMedianMarket ? null : tissueRunner.odds,
        decimalPrice: tissueDecimalPrice,
        capturedAt,
        raceDateTime: off,
        ratingProbability: record.tissueProbability,
        market: tissueMarket ?? undefined,
        runner: tissueRunner,
      })
      : null;
    const addTissueEarly = usesMedianMarket && tissueSnapshot !== null && !record.tissueEarlyPriceSnapshot;
    const addTissueT180 = usesMedianMarket && tissueSnapshot !== null && stage === "t180" && !record.tissueT180PriceSnapshot;
    const addTissueT60 = usesMedianMarket && tissueSnapshot !== null && stage === "t60" && !record.tissueT60PriceSnapshot;
    if (!addEarly && !addT180 && !addT60 && !addT15 && !addTissueEarly && !addTissueT180 && !addTissueT60) return record;
    changed = true;
    return {
      ...record,
      ...(addEarly ? {
        capturedPrice: usesMedianMarket ? null : runner?.odds ?? String(decimalPrice),
        priceSource: FORWARD_VALUE_PRICE_SOURCE,
        priceCapturedAt: capturedAt.toISOString(),
        minutesBeforeScheduledOff,
        capturedDecimalOdds: decimalPrice,
        capturedMarketProbability: snapshot!.impliedProbability,
        edgePercentagePoints: snapshot!.ratingEdgePercentagePoints,
        edgeBand: edgeBand(snapshot!.ratingEdgePercentagePoints),
        earlyPriceSnapshot: snapshot,
        ...(usesMedianMarket ? marketRecordFields(runner, market!) : {}),
        phase2ExclusionReason: record.phase2ExclusionReason === "missing_price" ? null : record.phase2ExclusionReason,
      } : {}),
      ...(addT180 ? { t180PriceSnapshot: snapshot } : {}),
      ...(addT60 ? { t60PriceSnapshot: snapshot } : {}),
      ...(addT15 ? { t15PriceSnapshot: snapshot } : {}),
      ...(addTissueEarly ? {
        tissueCapturedPrice: null,
        tissueCapturedDecimalOdds: tissueDecimalPrice,
        tissueMarketProbability: tissueSnapshot!.impliedProbability,
        tissueEdgePercentagePoints: tissueSnapshot!.ratingEdgePercentagePoints,
        tissuePriceCapturedAt: capturedAt.toISOString(),
        tissueEarlyPriceSnapshot: tissueSnapshot,
        ...tissueMarketRecordFields(tissueRunner!, tissueMarket!),
      } : {}),
      ...(addTissueT180 ? { tissueT180PriceSnapshot: tissueSnapshot } : {}),
      ...(addTissueT60 ? { tissueT60PriceSnapshot: tissueSnapshot } : {}),
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
    forecastPrice?: string | null;
    forecastDecimalPrice?: number | null;
    bookmakerQuotes?: SportingLifeBookmakerQuote[];
  }>,
): ForwardValueData {
  let updated = false;
  const races = data.races.map((race) => {
    if (race.family !== "turf" || race.settledAt !== null) return race;
    const tissue = snapshots.get(race.raceId);
    if (!tissue || tissue.recordedPreRace !== true) return race;
    const canAttachProbability = race.tissueProbability === null;
    const tissuePriceAt = tissue.priceCapturedAt ? new Date(tissue.priceCapturedAt) : null;
    const tissueMarket = summarizeBookmakerMarket(tissue.bookmakerQuotes);
    const usesMedianMarket = race.marketPriceBasisVersion === FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION;
    const canAttachLegacyPrice = !usesMedianMarket &&
      race.tissueCapturedDecimalOdds == null &&
      tissue.capturedDecimalOdds != null &&
      tissuePriceAt !== null &&
      Number.isFinite(tissuePriceAt.getTime()) &&
      tissuePriceAt < new Date(race.raceDateTime);
    const canAttachMedianPrice = usesMedianMarket &&
      race.tissueCapturedDecimalOdds == null &&
      tissueMarket.decimalPrice !== null &&
      tissuePriceAt !== null &&
      Number.isFinite(tissuePriceAt.getTime()) &&
      tissuePriceAt < new Date(race.raceDateTime);
    const canAttachPrice = canAttachLegacyPrice || canAttachMedianPrice;
    if (!canAttachProbability && !canAttachPrice) return race;
    const probability = canAttachProbability ? tissue.probability : race.tissueProbability;
    const attachedDecimalPrice = canAttachMedianPrice ? tissueMarket.decimalPrice : tissue.capturedDecimalOdds ?? null;
    const marketProbability = canAttachPrice && attachedDecimalPrice !== null
      ? 1 / attachedDecimalPrice
      : race.tissueMarketProbability ?? null;
    const off = new Date(race.raceDateTime);
    const tissueSnapshot = canAttachMedianPrice && probability !== null && tissuePriceAt
      ? createPriceSnapshot({
        price: null,
        decimalPrice: tissueMarket.decimalPrice!,
        capturedAt: tissuePriceAt,
        raceDateTime: off,
        ratingProbability: probability,
        market: tissueMarket,
        forecastPrice: tissue.forecastPrice,
        forecastDecimalPrice: tissue.forecastDecimalPrice,
      })
      : null;
    const tissueStage = tissueSnapshot ? priceSnapshotStage(tissueSnapshot.minutesBeforeScheduledOff) : null;
    updated = true;
    return {
      ...race,
      tissueRunnerId: canAttachProbability ? tissue.runnerId : race.tissueRunnerId,
      tissueHorseName: canAttachProbability ? tissue.horseName : race.tissueHorseName,
      tissueProbability: probability,
      tissueAgreesWithTpr: canAttachProbability ? tissue.runnerId === race.leaderRunnerId : race.tissueAgreesWithTpr,
      tissueCapturedPrice: canAttachPrice ? canAttachMedianPrice ? null : tissue.capturedPrice ?? null : race.tissueCapturedPrice ?? null,
      tissueCapturedDecimalOdds: canAttachPrice ? attachedDecimalPrice : race.tissueCapturedDecimalOdds ?? null,
      tissueMarketProbability: marketProbability,
      tissueEdgePercentagePoints: probability === null || marketProbability === null
        ? null
        : (probability - marketProbability) * 100,
      tissuePriceCapturedAt: canAttachPrice ? tissue.priceCapturedAt! : race.tissuePriceCapturedAt ?? null,
      ...(canAttachMedianPrice ? {
        tissueForecastPrice: tissue.forecastPrice ?? null,
        tissueForecastDecimalPrice: tissue.forecastDecimalPrice ?? null,
        tissueBookmakerQuoteCount: tissueMarket.quoteCount,
        tissueBookmakerQuotes: tissueMarket.quotes,
        tissueMedianBookmakerPriceDecimal: tissueMarket.decimalPrice,
        tissueMedianBookmakerImpliedProbability: tissueMarket.impliedProbability,
        tissueBestBookmakerPriceDecimal: tissueMarket.bestDecimalPrice,
        tissueBestBookmakerPriceFractional: tissueMarket.bestFractionalPrice,
        tissueBestBookmakerName: tissueMarket.bestBookmakerName,
        tissueEarlyPriceSnapshot: race.tissueEarlyPriceSnapshot ?? tissueSnapshot,
        tissueT180PriceSnapshot: tissueStage === "t180" && !race.tissueT180PriceSnapshot ? tissueSnapshot : race.tissueT180PriceSnapshot,
        tissueT60PriceSnapshot: tissueStage === "t60" && !race.tissueT60PriceSnapshot ? tissueSnapshot : race.tissueT60PriceSnapshot,
      } : {}),
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
    const bestPriceSettlement = record.marketPriceBasisVersion === FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION
      ? settleSelection({
        targetRaceId: record.raceId,
        targetRunnerId: result.runnerId,
        finishingPosition: result.finishingPosition,
        resultStatus: result.resultStatus,
        won: result.finishingPosition === 1,
        placed: result.finishingPosition !== null && result.finishingPosition <= 3,
        startingPrice: record.bestBookmakerPriceFractional ?? null,
        startingPriceDecimal: record.bestBookmakerPriceDecimal == null ? null : String(record.bestBookmakerPriceDecimal),
        deadHeatDivisor: winners.length,
      })
      : null;
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
      medianMarketPriceGrossReturn: record.marketPriceBasisVersion === FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION
        ? capturedPriceSettlement?.grossReturn ?? null
        : record.medianMarketPriceGrossReturn,
      medianMarketPriceProfitLoss: record.marketPriceBasisVersion === FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION
        ? capturedPriceSettlement?.profitLoss ?? null
        : record.medianMarketPriceProfitLoss,
      bestBookmakerPriceGrossReturn: record.marketPriceBasisVersion === FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION
        ? bestPriceSettlement?.grossReturn ?? null
        : record.bestBookmakerPriceGrossReturn,
      bestBookmakerPriceProfitLoss: record.marketPriceBasisVersion === FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION
        ? bestPriceSettlement?.profitLoss ?? null
        : record.bestBookmakerPriceProfitLoss,
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
        : race.marketPriceBasisVersion === FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION
          ? `median bookmaker price ${race.capturedDecimalOdds.toFixed(2)} (${race.bookmakerQuoteCount ?? 0} quotes) at ${race.priceCapturedAt ?? race.recordedAt}; best ${decimalLabel(race.bestBookmakerPriceDecimal ?? null)}${race.bestBookmakerName ? ` ${race.bestBookmakerName}` : ""}; forecast ${race.forecastPrice ?? decimalLabel(race.forecastDecimalPrice ?? null)}`
          : `legacy forecast price ${race.capturedPrice ?? "-"} (${race.capturedDecimalOdds.toFixed(2)}) at ${race.priceCapturedAt ?? race.recordedAt}`;
      const early = forwardValuePriceSnapshot(race, "early");
      const t60 = forwardValuePriceSnapshot(race, "t60");
      const pricePath = race.priceSnapshotScheduleVersion === FORWARD_VALUE_PRICE_SNAPSHOT_SCHEDULE_VERSION
        ? `Early ${snapshotLabel(early)} | T-180 ${snapshotLabel(forwardValuePriceSnapshot(race, "t180"))} | T-60 ${snapshotLabel(t60)} | SP ${decimalLabel(race.finalSp)}`
        : `Early ${snapshotLabel(early)} | T-60 ${snapshotLabel(t60)} | T-15 ${snapshotLabel(forwardValuePriceSnapshot(race, "t15"))} | SP ${decimalLabel(race.finalSp)}`;
      const tissue = race.tissueProbability === null
        ? ""
        : ` | Tissue ${pct(race.tissueProbability)}, price ${race.tissueCapturedPrice ?? "-"}, edge ${pp(race.tissueEdgePercentagePoints ?? null)}`;
      lines.push(`${formatForwardValueRaceTime(race)} ${race.course}${race.raceName ? ` - ${race.raceName}` : ""}`);
      lines.push(
        `  ${familyLabel(race.family)} | ${race.leaderHorseName} | model ${pct(race.calibratedProbability)} | ` +
        `${priceState} | ${pricePath} | ` +
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
  price: string | null;
  decimalPrice: number;
  capturedAt: Date;
  raceDateTime: Date;
  ratingProbability: number;
  market?: ForwardValueBookmakerMarket;
  runner?: TodayRunner;
  forecastPrice?: string | null;
  forecastDecimalPrice?: number | null;
}): ForwardValuePriceSnapshot {
  const impliedProbability = 1 / input.decimalPrice;
  return {
    price: input.price,
    decimalPrice: input.decimalPrice,
    impliedProbability,
    capturedAt: input.capturedAt.toISOString(),
    minutesBeforeScheduledOff: (input.raceDateTime.getTime() - input.capturedAt.getTime()) / 60_000,
    ratingProbability: input.ratingProbability,
    ratingEdgePercentagePoints: (input.ratingProbability - impliedProbability) * 100,
    ...(input.market ? {
      marketPriceBasisVersion: FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION,
      bookmakerQuoteCount: input.market.quoteCount,
      bookmakerQuotes: input.market.quotes,
      medianBookmakerPriceDecimal: input.market.decimalPrice!,
      medianBookmakerImpliedProbability: input.market.impliedProbability!,
      bestBookmakerPriceDecimal: input.market.bestDecimalPrice,
      bestBookmakerPriceFractional: input.market.bestFractionalPrice,
      bestBookmakerName: input.market.bestBookmakerName,
      forecastPrice: input.forecastPrice ?? input.runner?.forecastOdds ?? input.runner?.odds ?? null,
      forecastDecimalPrice: input.forecastDecimalPrice ?? input.runner?.forecastDecimalOdds ?? decimal(input.runner?.oddsDecimal),
    } : {}),
  };
}

function marketRecordFields(runner: TodayRunner | undefined, market: ForwardValueBookmakerMarket) {
  return {
    forecastPrice: runner?.forecastOdds ?? runner?.odds ?? null,
    forecastDecimalPrice: runner?.forecastDecimalOdds ?? decimal(runner?.oddsDecimal),
    bookmakerQuoteCount: market.quoteCount,
    bookmakerQuotes: market.quotes,
    medianBookmakerPriceDecimal: market.decimalPrice,
    medianBookmakerImpliedProbability: market.impliedProbability,
    bestBookmakerPriceDecimal: market.bestDecimalPrice,
    bestBookmakerPriceFractional: market.bestFractionalPrice,
    bestBookmakerName: market.bestBookmakerName,
  };
}

function tissueMarketRecordFields(runner: TodayRunner, market: ForwardValueBookmakerMarket) {
  return {
    tissueForecastPrice: runner.forecastOdds ?? runner.odds,
    tissueForecastDecimalPrice: runner.forecastDecimalOdds ?? decimal(runner.oddsDecimal),
    tissueBookmakerQuoteCount: market.quoteCount,
    tissueBookmakerQuotes: market.quotes,
    tissueMedianBookmakerPriceDecimal: market.decimalPrice,
    tissueMedianBookmakerImpliedProbability: market.impliedProbability,
    tissueBestBookmakerPriceDecimal: market.bestDecimalPrice,
    tissueBestBookmakerPriceFractional: market.bestFractionalPrice,
    tissueBestBookmakerName: market.bestBookmakerName,
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
function snapshotLabel(value: ForwardValuePriceSnapshot | null) {
  return value ? `${value.price ? `${value.price} / ` : ""}${value.decimalPrice.toFixed(2)} / ${pp(value.ratingEdgePercentagePoints)}` : "-";
}
function decimalLabel(value: number | null) { return value === null ? "-" : value.toFixed(2); }
function pct(value: number | null) { return value === null ? "-" : `${(value * 100).toFixed(1)}%`; }
function pp(value: number | null) { return value === null ? "-" : `${value >= 0 ? "+" : ""}${value.toFixed(1)}pp`; }
function yesNo(value: boolean | null) { return value === null ? "-" : value ? "yes" : "no"; }
