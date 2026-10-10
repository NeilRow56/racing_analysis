import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { settleSelection, isVoidBetResultStatus } from "./backtest";
import {
  FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION,
  priceSnapshotStage,
  summarizeBookmakerMarket,
  type ForwardValuePriceSnapshot,
} from "./forward-value";
import {
  AW_TISSUE_IMPLEMENTED_AT,
  AW_TISSUE_SCHEMA,
  AW_TISSUE_VERSION,
  predictAwTissue,
  type AwTissueModel,
} from "./aw-tissue-model";
import { isSupportedAllWeatherRace } from "./aw-speed-rating";
import {
  NUMERIC_FEATURES,
  commentVector,
  priorCommentsForTarget,
  raceSoftmax,
  score,
  type HistoricalComment,
} from "../../../scripts/diagnose-independent-tissue-feasibility";
import {
  TISSUE_V2_CONFIG,
  type FrozenTissueModel,
} from "./tissue-forward";
import { formatRaceTimeForDisplay, type SportingLifeCurrentPrice, type TodayRace, type TodayRunner } from "./todays-racing";
import type { HistoricalPreRaceFeatureRow } from "./historical-target-metrics";

export const AW_TISSUE_PAIRED_FORWARD_VERSION = "AW_TISSUE_PAIRED_FORWARD_V1" as const;
export const AW_TISSUE_PAIRED_FORWARD_PATH = "data/research/aw-tissue-paired-forward-v1.json";
export const AW_TISSUE_PAIRED_FORWARD_EPOCH = "2026-10-10T00:00:00.000Z";
export const TURF_ARCH_AW_VERSION = "TURF_ARCH_AW_V1" as const;

export type PairedModelKey = "awTissue" | "turfArch";
export type PairValueBucket = "BOTH_VALUE" | "AW_ONLY_VALUE" | "TURF_ARCH_ONLY_VALUE" | "NEITHER_VALUE";
export type PairedRunner = {
  runnerId: string;
  horseId: string;
  horseName: string;
  probability: number;
  rank: number;
  outcome: { resultStatus: string | null; finishingPosition: number | null; won: boolean | null; finalSp: number | null; deadHeatDivisor: number; finalSpProfitLoss: number | null } | null;
};
export type PairedModelSnapshot = {
  modelVersion: string;
  modelHash: string;
  probabilities: PairedRunner[];
  rankOrder: string[];
  rank1RunnerId: string;
  rank1HorseName: string;
  rank1Probability: number;
  valueQualified: boolean | null;
  selectedPriceProfitLoss: number | null;
};
export type PairedRankOneMarket = {
  runnerId: string;
  medianDecimalPrice: number | null;
  impliedProbability: number | null;
  bookmakerQuoteCount: number;
  capturedAt: string;
  snapshot: ForwardValuePriceSnapshot | null;
};
export type PairedPriceContext = {
  firstAvailable: Record<PairedModelKey, PairedRankOneMarket | null>;
  earlyMorning: Record<PairedModelKey, PairedRankOneMarket | null>;
  late: Record<PairedModelKey, PairedRankOneMarket | null>;
  finalPreRace: Record<PairedModelKey, PairedRankOneMarket | null>;
  sp: Record<PairedModelKey, number | null>;
};
export type AwTissuePairedRace = {
  raceId: string;
  sourceId: string | null;
  raceDate: string;
  course: string;
  raceName: string | null;
  scheduledTime: string;
  scheduledOffAt: string;
  currentOffAt: string;
  firstCapturedAt: string;
  runners: Array<{ runnerId: string; horseId: string; horseName: string }>;
  awTissue: PairedModelSnapshot;
  turfArch: PairedModelSnapshot;
  rank1Agreement: boolean;
  classification: "AGREE" | "DISAGREE";
  valueBucket: PairValueBucket;
  prices: PairedPriceContext;
  winners: string[];
  settledAt: string | null;
  excludedReason: string | null;
};
export type AwTissuePairedForwardData = {
  version: typeof AW_TISSUE_PAIRED_FORWARD_VERSION;
  epoch: typeof AW_TISSUE_PAIRED_FORWARD_EPOCH;
  awTissue: { version: typeof AW_TISSUE_VERSION; schema: typeof AW_TISSUE_SCHEMA; implementedAt: typeof AW_TISSUE_IMPLEMENTED_AT };
  turfArch: { version: typeof TURF_ARCH_AW_VERSION; tissueVersion: string; tissueModelPath: string; featureMapping: "turf_v2_structural_aw_speed_v1" };
  races: AwTissuePairedRace[];
};

export function emptyAwTissuePairedForward(): AwTissuePairedForwardData {
  return {
    version: AW_TISSUE_PAIRED_FORWARD_VERSION,
    epoch: AW_TISSUE_PAIRED_FORWARD_EPOCH,
    awTissue: { version: AW_TISSUE_VERSION, schema: AW_TISSUE_SCHEMA, implementedAt: AW_TISSUE_IMPLEMENTED_AT },
    turfArch: { version: TURF_ARCH_AW_VERSION, tissueVersion: TISSUE_V2_CONFIG.modelVersion, tissueModelPath: TISSUE_V2_CONFIG.modelPath, featureMapping: "turf_v2_structural_aw_speed_v1" },
    races: [],
  };
}

export async function loadAwTissuePairedForward(path = AW_TISSUE_PAIRED_FORWARD_PATH): Promise<AwTissuePairedForwardData> {
  try {
    const data = JSON.parse(await readFile(path, "utf8")) as AwTissuePairedForwardData;
    if (data.version !== AW_TISSUE_PAIRED_FORWARD_VERSION || data.epoch !== AW_TISSUE_PAIRED_FORWARD_EPOCH) throw new Error("Unsupported paired AW tracker");
    return data;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyAwTissuePairedForward();
    throw error;
  }
}

export async function mutateAwTissuePairedForward(mutation: (data: AwTissuePairedForwardData) => AwTissuePairedForwardData | Promise<AwTissuePairedForwardData>, path = AW_TISSUE_PAIRED_FORWARD_PATH) {
  const lock = `${resolve(path)}.lock`;
  await mkdir(dirname(lock), { recursive: true });
  const deadline = Date.now() + 30_000;
  while (true) {
    try { await mkdir(lock); break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST" || Date.now() >= deadline) throw error;
      await new Promise((wait) => setTimeout(wait, 10));
    }
  }
  try {
    const original = await loadAwTissuePairedForward(path);
    const updated = await mutation(original);
    if (JSON.stringify(updated) !== JSON.stringify(original)) {
      const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
      await writeFile(temporary, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
      await rename(temporary, path);
    }
    return updated;
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}

export function structuralAwFeatureVector(race: TodayRace, runner: TodayRunner): number[] {
  const features = currentFeatureInput(race, runner);
  const values = NUMERIC_FEATURES.map(([name, get]) => {
    if (name === "latest_turf_speed") return features.latestAwSpeedRating;
    if (name === "best_l3_turf_speed") return features.bestAwSpeedLast3;
    if (name === "avg_l3_turf_speed") return features.averageAwSpeedLast3;
    return get(features);
  });
  return [...values.map((value) => value ?? 0), ...values.map((value) => value === null || !Number.isFinite(value) ? 1 : 0)];
}

export function predictTurfArchOnAw(race: TodayRace, commentsByHorse: Map<string, HistoricalComment[]>, model: FrozenTissueModel) {
  const active = race.runners.filter((runner) => runner.resultStatus !== "non_runner");
  if (active.length < 2 || !isSupportedAllWeatherRace({ ...race, courseName: "" }) || !race.raceDateTime) return null;
  const scored = active.map((runner) => {
    const priors = priorCommentsForTarget(commentsByHorse.get(runner.horseId) ?? [], race.raceDateTime!);
    const values = [...structuralAwFeatureVector(race, runner), ...commentVector(priors)];
    return { runner, probability: 0, score: score(model.model, values) };
  });
  const probabilities = raceSoftmax(scored.map((entry) => entry.score));
  const ranks = ranksDescending(probabilities);
  return scored.map((entry, index) => ({ runner: entry.runner, probability: probabilities[index]!, rank: ranks[index]! }));
}

export function buildAwTissuePairedRace(input: {
  raceDate: string;
  course: string;
  race: TodayRace;
  awModel: AwTissueModel;
  turfModel: FrozenTissueModel;
  priorAwStarts: ReadonlyMap<string, number>;
  commentsByHorse: Map<string, HistoricalComment[]>;
  recordedAt?: Date;
}): AwTissuePairedRace | null {
  const recordedAt = input.recordedAt ?? new Date();
  const off = input.race.raceDateTime;
  if (!off || !input.race.scheduledTime || recordedAt.toISOString() < AW_TISSUE_PAIRED_FORWARD_EPOCH || recordedAt >= off ||
      input.race.winningTime || input.race.runners.some((r) => r.finishingPosition !== null || (r.resultStatus !== null && r.resultStatus !== "non_runner")) ||
      !isSupportedAllWeatherRace({ ...input.race, courseName: input.course })) return null;
  const aw = predictAwTissue(input.race, input.priorAwStarts, input.awModel);
  const turf = predictTurfArchOnAw(input.race, input.commentsByHorse, input.turfModel);
  if (!turf || aw.predictedRunnerCount !== aw.activeRunnerCount || aw.activeRunnerCount < 2) return null;
  const awSnapshot = snapshot("awTissue", aw.runners.map((runner) => ({ runner: input.race.runners.find((r) => r.runnerId === runner.runnerId)!, probability: runner.probability!, rank: runner.rank! })), input.awModel.version, input.awModel.checksum);
  const turfSnapshot = snapshot("turfArch", turf, TURF_ARCH_AW_VERSION, input.turfModel.checksum);
  const rank1Agreement = awSnapshot.rank1RunnerId === turfSnapshot.rank1RunnerId;
  const prices = emptyPrices();
  return {
    raceId: input.race.raceId,
    sourceId: input.race.sourceId,
    raceDate: input.raceDate,
    course: input.course,
    raceName: input.race.raceName,
    scheduledTime: input.race.scheduledTime,
    scheduledOffAt: off.toISOString(),
    currentOffAt: off.toISOString(),
    firstCapturedAt: recordedAt.toISOString(),
    runners: input.race.runners.filter((r) => r.resultStatus !== "non_runner").map((r) => ({ runnerId: r.runnerId, horseId: r.horseId, horseName: r.horseName })),
    awTissue: awSnapshot,
    turfArch: turfSnapshot,
    rank1Agreement,
    classification: rank1Agreement ? "AGREE" : "DISAGREE",
    valueBucket: "NEITHER_VALUE",
    prices,
    winners: [],
    settledAt: null,
    excludedReason: null,
  };
}

export function captureAwTissuePairedRaces(data: AwTissuePairedForwardData, races: AwTissuePairedRace[]): AwTissuePairedForwardData {
  const existing = new Set(data.races.map((race) => race.raceId));
  const additions = races.filter((race) => {
    if (existing.has(race.raceId) || race.firstCapturedAt < AW_TISSUE_PAIRED_FORWARD_EPOCH || race.firstCapturedAt >= race.scheduledOffAt || race.settledAt !== null) return false;
    existing.add(race.raceId);
    return true;
  });
  return additions.length ? { ...data, races: [...data.races, ...additions] } : data;
}

export function enrichAwTissuePairedPrices(record: AwTissuePairedRace, race: TodayRace, capturedAt = new Date()): AwTissuePairedRace {
  const off = race.raceDateTime;
  if (record.settledAt || !off || capturedAt >= off || capturedAt.toISOString() < record.firstCapturedAt || race.winningTime) return record;
  const minutesBeforeScheduledOff = (off.getTime() - capturedAt.getTime()) / 60_000;
  const bucket = priceContextBucket(capturedAt, minutesBeforeScheduledOff);
  const prices = clonePrices(record.prices);
  let changed = false;
  for (const key of ["awTissue", "turfArch"] as const) {
    const runnerId = record[key].rank1RunnerId;
    const current = race.runners.find((runner) => runner.runnerId === runnerId);
    if (!current || current.resultStatus === "non_runner") continue;
    const market = summarizeBookmakerMarket(current.bookmakerQuotes);
    if (market.decimalPrice === null || market.impliedProbability === null) continue;
    const snapshot: PairedRankOneMarket = {
      runnerId,
      medianDecimalPrice: market.decimalPrice,
      impliedProbability: market.impliedProbability,
      bookmakerQuoteCount: market.quoteCount,
      capturedAt: capturedAt.toISOString(),
      snapshot: {
        decimalPrice: market.decimalPrice,
        impliedProbability: market.impliedProbability,
        capturedAt: capturedAt.toISOString(),
        minutesBeforeScheduledOff,
        ratingProbability: record[key].rank1Probability,
        ratingEdgePercentagePoints: (record[key].rank1Probability - market.impliedProbability) * 100,
        marketPriceBasisVersion: FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION,
        bookmakerQuoteCount: market.quoteCount,
        bookmakerQuotes: market.quotes,
        medianBookmakerPriceDecimal: market.decimalPrice,
        medianBookmakerImpliedProbability: market.impliedProbability,
        bestBookmakerPriceDecimal: market.bestDecimalPrice,
        bestBookmakerPriceFractional: market.bestFractionalPrice,
        bestBookmakerName: market.bestBookmakerName,
        forecastPrice: current.forecastOdds ?? null,
        forecastDecimalPrice: current.forecastDecimalOdds ?? null,
      },
    };
    if (!prices.firstAvailable[key]) { prices.firstAvailable[key] = snapshot; changed = true; }
    if (!prices[bucket][key]) { prices[bucket][key] = snapshot; changed = true; }
  }
  if (!changed) return record;
  return applyValueFlags({ ...record, currentOffAt: off.toISOString(), prices });
}

export function settleAwTissuePairedRace(record: AwTissuePairedRace, race: TodayRace, settledAt = new Date()): AwTissuePairedRace {
  if (record.settledAt !== null) return record;
  const byId = new Map(race.runners.map((runner) => [runner.runnerId, runner]));
  if (record.runners.some((runner) => !byId.has(runner.runnerId))) return record;
  const started = race.runners.filter((runner) => !isVoidBetResultStatus(runner.resultStatus));
  if (race.actualRunnerCount === null || (race.actualRunnerCount !== started.length && race.actualRunnerCount !== race.runners.length)) return record;
  const winners = started.filter((runner) => runner.finishingPosition === 1);
  if (!winners.length) return record;
  const updateModel = (model: PairedModelSnapshot): PairedModelSnapshot => {
    const runners = model.probabilities.map((runner): PairedRunner => {
      const result = byId.get(runner.runnerId)!;
      const voided = isVoidBetResultStatus(result.resultStatus);
      const won = voided ? null : result.finishingPosition === 1;
      const settlement = settleSelection({ targetRaceId: race.raceId, targetRunnerId: runner.runnerId, finishingPosition: result.finishingPosition, resultStatus: result.resultStatus, won, placed: null, startingPrice: result.odds, startingPriceDecimal: result.oddsDecimal, deadHeatDivisor: won ? winners.length : 1 });
      return { ...runner, outcome: { resultStatus: result.resultStatus, finishingPosition: result.finishingPosition, won, finalSp: settlement?.settlementOddsDecimal ?? null, deadHeatDivisor: won ? winners.length : 1, finalSpProfitLoss: settlement?.profitLoss ?? null } };
    });
    const profitLoss = selectedPriceProfit(record, model, runners);
    return { ...model, probabilities: runners, selectedPriceProfitLoss: profitLoss };
  };
  const prices = clonePrices(record.prices);
  prices.sp.awTissue = byId.get(record.awTissue.rank1RunnerId)?.oddsDecimal ? Number(byId.get(record.awTissue.rank1RunnerId)!.oddsDecimal) : null;
  prices.sp.turfArch = byId.get(record.turfArch.rank1RunnerId)?.oddsDecimal ? Number(byId.get(record.turfArch.rank1RunnerId)!.oddsDecimal) : null;
  const changedField = started.some((runner) => !record.runners.some((frozen) => frozen.runnerId === runner.runnerId));
  return applyValueFlags({ ...record, prices, awTissue: updateModel(record.awTissue), turfArch: updateModel(record.turfArch), winners: winners.map((runner) => runner.runnerId), settledAt: settledAt.toISOString(), excludedReason: changedField ? "field_changed_after_capture" : record.excludedReason });
}

export function updateAwTissuePairedForward(data: AwTissuePairedForwardData, currentById: ReadonlyMap<string, TodayRace>, capturedAt = new Date()): AwTissuePairedForwardData {
  const races = data.races.map((record) => {
    const current = currentById.get(record.raceId);
    return current ? settleAwTissuePairedRace(enrichAwTissuePairedPrices(record, current, capturedAt), current, capturedAt) : record;
  });
  return races.every((race, index) => race === data.races[index]) ? data : { ...data, races };
}

export function summarizeAwTissuePairedForward(data: AwTissuePairedForwardData) {
  const clean = data.races.filter((race) => race.excludedReason === null);
  const settled = clean.filter((race) => race.settledAt !== null);
  const modelSummary = (key: PairedModelKey, races = settled) => {
    const selections = races.filter((race) => race[key].probabilities.find((runner) => runner.runnerId === race[key].rank1RunnerId)?.outcome?.won !== null);
    const winners = selections.filter((race) => race[key].probabilities.find((runner) => runner.runnerId === race[key].rank1RunnerId)?.outcome?.won === true).length;
    const expected = selections.reduce((sum, race) => sum + race[key].rank1Probability, 0);
    const marketExpected = selections.reduce((sum, race) => sum + (qualificationPrice(race, key)?.impliedProbability ?? 0), 0);
    const profitLoss = selections.reduce((sum, race) => sum + (race[key].selectedPriceProfitLoss ?? 0), 0);
    return { selections: selections.length, winners, strike: ratio(winners, selections.length), expectedWinners: expected, marketExpectedWinners: marketExpected, ae: ratio(winners, marketExpected), profitLoss, roi: ratio(profitLoss, selections.length) };
  };
  const disagreement = settled.filter((race) => race.classification === "DISAGREE");
  const winner = (race: AwTissuePairedRace, key: PairedModelKey) => race[key].probabilities.find((runner) => runner.runnerId === race[key].rank1RunnerId)?.outcome?.won === true;
  return {
    tracked: data.races.length,
    clean: clean.length,
    settled: settled.length,
    agreement: clean.filter((race) => race.classification === "AGREE").length,
    disagreement: clean.filter((race) => race.classification === "DISAGREE").length,
    awTissue: modelSummary("awTissue"),
    turfArch: modelSummary("turfArch"),
    disagreementPerformance: {
      awTissue: modelSummary("awTissue", disagreement),
      turfArch: modelSummary("turfArch", disagreement),
      awWins: disagreement.filter((race) => winner(race, "awTissue")).length,
      turfArchWins: disagreement.filter((race) => winner(race, "turfArch")).length,
      neither: disagreement.filter((race) => !winner(race, "awTissue") && !winner(race, "turfArch")).length,
    },
    value: {
      both: settled.filter((race) => race.valueBucket === "BOTH_VALUE").length,
      awOnly: settled.filter((race) => race.valueBucket === "AW_ONLY_VALUE").length,
      turfArchOnly: settled.filter((race) => race.valueBucket === "TURF_ARCH_ONLY_VALUE").length,
      neither: settled.filter((race) => race.valueBucket === "NEITHER_VALUE").length,
      awTissue: modelSummary("awTissue", settled.filter((race) => race.awTissue.valueQualified)),
      turfArch: modelSummary("turfArch", settled.filter((race) => race.turfArch.valueQualified)),
    },
    probability: {
      awTissue: probabilitySummary(settled, "awTissue"),
      turfArch: probabilitySummary(settled, "turfArch"),
    },
  };
}

export function renderAwTissuePairedToday(data: AwTissuePairedForwardData, date: string, currentPrices: SportingLifeCurrentPrice[] = []) {
  const currentByRunner = new Map(currentPrices.map((price) => [`${price.raceId}|${price.runnerId}`, price]));
  const races = data.races.filter((race) => race.raceDate === date).sort((a, b) => a.currentOffAt.localeCompare(b.currentOffAt));
  const line = (race: AwTissuePairedRace) => {
    const price = (key: PairedModelKey) => {
      const latest = currentByRunner.get(`${race.raceId}|${race[key].rank1RunnerId}`);
      const frozen = qualificationPrice(race, key);
      return latest?.marketPrice ?? (frozen?.medianDecimalPrice ? frozen.medianDecimalPrice.toFixed(2) : "-");
    };
    return [
      formatRaceTimeForDisplay({ raceDateTime: new Date(race.currentOffAt), scheduledTime: race.scheduledTime }),
      race.course,
      race.awTissue.rank1HorseName,
      race.turfArch.rank1HorseName,
      race.classification,
      `${pct(race.awTissue.rank1Probability)} / ${pct(race.turfArch.rank1Probability)}`,
      `${price("awTissue")} / ${price("turfArch")}`,
    ].join(" | ");
  };
  return [`AW Paired Tissue Forward - ${date}`, "time | course | AW Tissue #1 | Turf-arch #1 | agree/disagree | AW p / Turf p | market prices", ...(races.length ? races.map(line) : ["No paired AW races recorded for this date."])].join("\n");
}

export function renderAwTissuePairedCompact(data: AwTissuePairedForwardData, date: string) {
  const races = data.races.filter((race) => race.raceDate === date && race.excludedReason === null);
  return [
    "AW PAIRED",
    `Races tracked today: ${races.length}`,
    `Agree: ${races.filter((race) => race.classification === "AGREE").length}`,
    `Disagree: ${races.filter((race) => race.classification === "DISAGREE").length}`,
  ].join("\n");
}

export function renderAwTissuePairedResults(data: AwTissuePairedForwardData, date: string) {
  const races = data.races.filter((race) => race.raceDate === date && race.excludedReason === null);
  const settled = races.filter((race) => race.settledAt !== null);
  const disagreement = settled.filter((race) => race.classification === "DISAGREE");
  const winner = (race: AwTissuePairedRace, key: PairedModelKey) =>
    race[key].probabilities.find((runner) => runner.runnerId === race[key].rank1RunnerId)?.outcome?.won === true;
  return [
    "AW PAIRED",
    `Settled races: ${settled.length}`,
    `Agree: ${settled.filter((race) => race.classification === "AGREE").length}`,
    `Disagree: ${disagreement.length}`,
    `AW Tissue winners: ${disagreement.filter((race) => winner(race, "awTissue")).length}`,
    `Turf-architecture winners: ${disagreement.filter((race) => winner(race, "turfArch")).length}`,
    `Neither: ${disagreement.filter((race) => !winner(race, "awTissue") && !winner(race, "turfArch")).length}`,
  ].join("\n");
}

export function renderAwTissuePairedSummary(data: AwTissuePairedForwardData) {
  const s = summarizeAwTissuePairedForward(data);
  const modelLine = (label: string, m: ReturnType<typeof summarizeAwTissuePairedForward>["awTissue"]) =>
    `${label}: selections ${m.selections} | wins ${m.winners} | strike ${pctNull(m.strike)} | expected ${m.expectedWinners.toFixed(2)} | market exp ${m.marketExpectedWinners.toFixed(2)} | A/E ${num(m.ae)} | ROI ${pctNull(m.roi)}`;
  return [
    "AW Tissue Paired Forward Summary",
    `Epoch: ${data.epoch}`,
    `Tracked races: ${s.tracked} | settled races: ${s.settled} | agreement races: ${s.agreement} | disagreement races: ${s.disagreement}`,
    modelLine("AW Tissue", s.awTissue),
    modelLine("Turf architecture", s.turfArch),
    `Disagreement: AW wins ${s.disagreementPerformance.awWins} | Turf-arch wins ${s.disagreementPerformance.turfArchWins} | neither ${s.disagreementPerformance.neither}`,
    `VALUE buckets: AW-only ${s.value.awOnly} | Turf-arch-only ${s.value.turfArchOnly} | both ${s.value.both} | neither ${s.value.neither}`,
    modelLine("AW Tissue VALUE", s.value.awTissue),
    modelLine("Turf architecture VALUE", s.value.turfArch),
    `Probability: AW log loss ${num(s.probability.awTissue.logLoss)} | AW Brier ${num(s.probability.awTissue.brier)} | Turf log loss ${num(s.probability.turfArch.logLoss)} | Turf Brier ${num(s.probability.turfArch.brier)}`,
    "Paired significance is deliberately withheld until the prospective sample is large enough.",
  ].join("\n");
}

function snapshot(key: PairedModelKey, scored: Array<{ runner: TodayRunner; probability: number; rank: number }>, modelVersion: string, modelHash: string): PairedModelSnapshot {
  const runners = scored.map(({ runner, probability, rank }): PairedRunner => ({ runnerId: runner.runnerId, horseId: runner.horseId, horseName: runner.horseName, probability, rank, outcome: null })).sort((a, b) => a.rank - b.rank || b.probability - a.probability || a.runnerId.localeCompare(b.runnerId));
  const leader = runners[0];
  if (!leader) throw new Error(`No ${key} leader`);
  return { modelVersion, modelHash, probabilities: runners, rankOrder: runners.map((runner) => runner.runnerId), rank1RunnerId: leader.runnerId, rank1HorseName: leader.horseName, rank1Probability: leader.probability, valueQualified: null, selectedPriceProfitLoss: null };
}

function currentFeatureInput(race: TodayRace, runner: TodayRunner): HistoricalPreRaceFeatureRow {
  const metrics = runner.metrics;
  return {
    officialRating: runner.officialRating,
    latestPerformanceRating: metrics?.latestPerformanceRating ?? metrics?.latestAwPerformanceRating ?? null,
    bestPerformanceLast3: metrics?.bestPerformanceLast3 ?? null,
    averagePerformanceLast3: metrics?.averagePerformanceLast3 ?? metrics?.averageAwPerformanceLast3 ?? null,
    latestTurfSpeedRating: metrics?.latestTurfSpeedRating ?? null,
    bestTurfSpeedLast3: metrics?.bestTurfSpeedLast3 ?? null,
    averageTurfSpeedLast3: metrics?.averageTurfSpeedLast3 ?? null,
    latestAwSpeedRating: metrics?.latestAwSpeedRating ?? null,
    bestAwSpeedLast3: metrics?.bestAwSpeedLast3 ?? null,
    averageAwSpeedLast3: metrics?.averageAwSpeedLast3 ?? null,
    latestTodaysRating: metrics?.latestTodaysRating ?? null,
    bestTodaysRatingLast3: metrics?.bestTodaysRatingLast3 ?? null,
    averageTodaysRatingLast3: metrics?.averageTodaysRatingLast3 ?? null,
    trainerPriorWinRate: runner.trainerMetrics?.trainerPriorWinRate ?? null,
    trainerPriorRuns: runner.trainerMetrics?.trainerPriorRuns ?? 0,
    jockeyPriorWinRate: runner.jockeyMetrics?.jockeyPriorWinRate ?? null,
    jockeyPriorRuns: runner.jockeyMetrics?.jockeyPriorRuns ?? 0,
    daysSinceLastRun: metrics?.daysSinceLastRun ?? null,
    priorRuns: metrics?.priorRuns ?? 0,
    horseAge: runner.horseAge,
    weightCarriedLbs: runner.weightCarriedLbs,
    raceClass: race.raceClass,
    distanceYards: race.distanceYards,
    actualRunnerCount: race.actualRunnerCount,
    declaredRunnerCount: race.declaredRunnerCount,
    draw: runner.draw,
    raceName: race.raceName,
    raceType: race.raceType,
    going: race.going,
  } as HistoricalPreRaceFeatureRow;
}

function ranksDescending(values: number[]) {
  const sorted = [...values].sort((a, b) => b - a);
  return values.map((value) => sorted.indexOf(value) + 1);
}

function emptyPrices(): PairedPriceContext {
  const empty = () => ({ awTissue: null, turfArch: null });
  return { firstAvailable: empty(), earlyMorning: empty(), late: empty(), finalPreRace: empty(), sp: empty() };
}

function clonePrices(prices: PairedPriceContext): PairedPriceContext {
  return JSON.parse(JSON.stringify(prices)) as PairedPriceContext;
}

function priceContextBucket(capturedAt: Date, minutesBeforeOff: number): "earlyMorning" | "late" | "finalPreRace" {
  const stage = priceSnapshotStage(minutesBeforeOff);
  if (stage === "t60") return "finalPreRace";
  if (stage === "t180") return "late";
  return capturedAt.getUTCHours() < 12 ? "earlyMorning" : "late";
}

function qualificationPrice(race: AwTissuePairedRace, key: PairedModelKey): PairedRankOneMarket | null {
  return race.prices.finalPreRace[key] ?? race.prices.late[key] ?? race.prices.earlyMorning[key] ?? race.prices.firstAvailable[key];
}

function applyValueFlags(record: AwTissuePairedRace): AwTissuePairedRace {
  const flag = (key: PairedModelKey) => {
    const price = qualificationPrice(record, key);
    return price?.impliedProbability === null || price?.impliedProbability === undefined ? null : record[key].rank1Probability - price.impliedProbability > 0;
  };
  const aw = flag("awTissue");
  const turf = flag("turfArch");
  const valueBucket: PairValueBucket = aw && turf ? "BOTH_VALUE" : aw ? "AW_ONLY_VALUE" : turf ? "TURF_ARCH_ONLY_VALUE" : "NEITHER_VALUE";
  return { ...record, valueBucket, awTissue: { ...record.awTissue, valueQualified: aw }, turfArch: { ...record.turfArch, valueQualified: turf } };
}

function selectedPriceProfit(record: AwTissuePairedRace, model: PairedModelSnapshot, runners: PairedRunner[]): number | null {
  const price = qualificationPrice(record, model.rank1RunnerId === record.awTissue.rank1RunnerId && model.modelVersion === record.awTissue.modelVersion ? "awTissue" : "turfArch");
  const leader = runners.find((runner) => runner.runnerId === model.rank1RunnerId);
  if (!price?.medianDecimalPrice || !leader?.outcome) return null;
  return settleSelection({ targetRaceId: record.raceId, targetRunnerId: leader.runnerId, finishingPosition: leader.outcome.finishingPosition, resultStatus: leader.outcome.resultStatus, won: leader.outcome.won, placed: null, startingPrice: null, startingPriceDecimal: String(price.medianDecimalPrice), deadHeatDivisor: leader.outcome.deadHeatDivisor })?.profitLoss ?? null;
}

function probabilitySummary(races: AwTissuePairedRace[], key: PairedModelKey) {
  const complete = races.filter((race) => race[key].probabilities.every((runner) => runner.outcome?.won !== null));
  const logLoss = average(complete.map((race) => -Math.log(Math.max(race[key].probabilities.filter((runner) => runner.outcome!.won).reduce((sum, runner) => sum + runner.probability, 0), 1e-12))));
  const brier = average(complete.map((race) => race[key].probabilities.reduce((sum, runner) => sum + (runner.probability - (runner.outcome!.won ? 1 / race.winners.length : 0)) ** 2, 0)));
  const observations = races.flatMap((race) => race[key].probabilities.filter((runner) => runner.outcome?.won !== null));
  const bands = [[0, .05, "0-5%"], [.05, .1, "5-10%"], [.1, .2, "10-20%"], [.2, .3, "20-30%"], [.3, .5, "30-50%"], [.5, Infinity, "50%+"]].map(([low, high, label]) => {
    const rows = observations.filter((runner) => runner.probability >= (low as number) && runner.probability < (high as number));
    return { band: label as string, runners: rows.length, predictedWinners: rows.reduce((sum, runner) => sum + runner.probability, 0), actualWinners: rows.filter((runner) => runner.outcome!.won).length };
  });
  return { races: complete.length, logLoss, brier, calibration: bands };
}

function ratio(numerator: number, denominator: number) { return denominator ? numerator / denominator : null; }
function average(values: number[]) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; }
function pct(value: number) { return `${(value * 100).toFixed(1)}%`; }
function pctNull(value: number | null) { return value === null ? "-" : pct(value); }
function num(value: number | null) { return value === null ? "-" : value.toFixed(4); }
