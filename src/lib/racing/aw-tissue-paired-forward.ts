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
  awTissueScore,
  predictAwTissue,
  type AwTissueModel,
} from "./aw-tissue-model";
import { isSupportedAllWeatherRace } from "./aw-speed-rating";
import { formatRaceTimeForDisplay, type SportingLifeCurrentPrice, type TodayRace, type TodayRunner } from "./todays-racing";

export const AW_TISSUE_PAIRED_FORWARD_VERSION = "AW_TISSUE_PAIRED_FORWARD_V1" as const;
export const AW_TISSUE_PAIRED_FORWARD_PATH = "data/research/aw-longshot-tj-paired-forward-v1.json";
export const AW_TISSUE_PAIRED_FORWARD_EPOCH = "2026-10-13T00:00:00.000Z";
export const LONGSHOT_TJ_ZERO_VERSION = "LONGSHOT_TJ_ZERO_V1" as const;
export const AW_LONGSHOT_PRICE_BOUNDARY_DECIMAL = 21.0;

export type PairedModelKey = "awTissue" | "longshotTjZero";
export type PairValueBucket = "BOTH_VALUE" | "AW_ONLY_VALUE" | "LONGSHOT_TJ_ZERO_ONLY_VALUE" | "NEITHER_VALUE";
export type PairedRunner = {
  runnerId: string;
  horseId: string;
  horseName: string;
  probability: number;
  rank: number;
  firstCapturedPriceDecimal: number | null;
  longshotTrainerJockeyAdjusted: boolean;
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
  longshotTjZero: PairedModelSnapshot;
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
  longshotTjZero: { version: typeof LONGSHOT_TJ_ZERO_VERSION; controlVersion: typeof AW_TISSUE_VERSION; priceBoundaryDecimal: typeof AW_LONGSHOT_PRICE_BOUNDARY_DECIMAL; conditioning: "first_captured_valid_bookmaker_median_price_gt_21"; trainerMultiplier: 0; jockeyMultiplier: 0 };
  races: AwTissuePairedRace[];
};

export function emptyAwTissuePairedForward(): AwTissuePairedForwardData {
  return {
    version: AW_TISSUE_PAIRED_FORWARD_VERSION,
    epoch: AW_TISSUE_PAIRED_FORWARD_EPOCH,
    awTissue: { version: AW_TISSUE_VERSION, schema: AW_TISSUE_SCHEMA, implementedAt: AW_TISSUE_IMPLEMENTED_AT },
    longshotTjZero: { version: LONGSHOT_TJ_ZERO_VERSION, controlVersion: AW_TISSUE_VERSION, priceBoundaryDecimal: AW_LONGSHOT_PRICE_BOUNDARY_DECIMAL, conditioning: "first_captured_valid_bookmaker_median_price_gt_21", trainerMultiplier: 0, jockeyMultiplier: 0 },
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

export function buildAwTissuePairedRace(input: {
  raceDate: string;
  course: string;
  race: TodayRace;
  awModel: AwTissueModel;
  priorAwStarts: ReadonlyMap<string, number>;
  recordedAt?: Date;
}): AwTissuePairedRace | null {
  const recordedAt = input.recordedAt ?? new Date();
  const off = input.race.raceDateTime;
  if (!off || !input.race.scheduledTime || recordedAt.toISOString() < AW_TISSUE_PAIRED_FORWARD_EPOCH || recordedAt >= off ||
      input.race.winningTime || input.race.runners.some((r) => r.finishingPosition !== null || (r.resultStatus !== null && r.resultStatus !== "non_runner")) ||
      !isSupportedAllWeatherRace({ ...input.race, courseName: input.course })) return null;
  const aw = predictAwTissue(input.race, input.priorAwStarts, input.awModel);
  if (aw.predictedRunnerCount !== aw.activeRunnerCount || aw.activeRunnerCount < 2) return null;
  const active = input.race.runners.filter((runner) => runner.resultStatus !== "non_runner");
  const firstCapturedPrices = new Map(active.map((runner) => [runner.runnerId, firstCapturedBookmakerPrice(runner)]));
  const awSnapshot = snapshot("awTissue", aw.runners.map((runner) => ({
    runner: active.find((r) => r.runnerId === runner.runnerId)!,
    probability: runner.probability!,
    rank: runner.rank!,
    firstCapturedPriceDecimal: firstCapturedPrices.get(runner.runnerId) ?? null,
    longshotTrainerJockeyAdjusted: false,
  })), input.awModel.version, input.awModel.checksum);
  const challenger = predictLongshotTjZero(aw.runners.map((runner) => ({
    runner: active.find((r) => r.runnerId === runner.runnerId)!,
    modelInputs: runner.modelInputs!,
    firstCapturedPriceDecimal: firstCapturedPrices.get(runner.runnerId) ?? null,
  })), input.awModel);
  const challengerSnapshot = snapshot("longshotTjZero", challenger, LONGSHOT_TJ_ZERO_VERSION, input.awModel.checksum);
  const rank1Agreement = awSnapshot.rank1RunnerId === challengerSnapshot.rank1RunnerId;
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
    longshotTjZero: challengerSnapshot,
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
  for (const key of ["awTissue", "longshotTjZero"] as const) {
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
  prices.sp.longshotTjZero = byId.get(record.longshotTjZero.rank1RunnerId)?.oddsDecimal ? Number(byId.get(record.longshotTjZero.rank1RunnerId)!.oddsDecimal) : null;
  const changedField = started.some((runner) => !record.runners.some((frozen) => frozen.runnerId === runner.runnerId));
  return applyValueFlags({ ...record, prices, awTissue: updateModel(record.awTissue), longshotTjZero: updateModel(record.longshotTjZero), winners: winners.map((runner) => runner.runnerId), settledAt: settledAt.toISOString(), excludedReason: changedField ? "field_changed_after_capture" : record.excludedReason });
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
    longshotTjZero: modelSummary("longshotTjZero"),
    disagreementPerformance: {
      awTissue: modelSummary("awTissue", disagreement),
      longshotTjZero: modelSummary("longshotTjZero", disagreement),
      awWins: disagreement.filter((race) => winner(race, "awTissue")).length,
      longshotTjZeroWins: disagreement.filter((race) => winner(race, "longshotTjZero")).length,
      neither: disagreement.filter((race) => !winner(race, "awTissue") && !winner(race, "longshotTjZero")).length,
    },
    value: {
      both: settled.filter((race) => race.valueBucket === "BOTH_VALUE").length,
      awOnly: settled.filter((race) => race.valueBucket === "AW_ONLY_VALUE").length,
      longshotTjZeroOnly: settled.filter((race) => race.valueBucket === "LONGSHOT_TJ_ZERO_ONLY_VALUE").length,
      neither: settled.filter((race) => race.valueBucket === "NEITHER_VALUE").length,
      awTissue: modelSummary("awTissue", settled.filter((race) => race.awTissue.valueQualified)),
      longshotTjZero: modelSummary("longshotTjZero", settled.filter((race) => race.longshotTjZero.valueQualified)),
    },
    probability: {
      awTissue: probabilitySummary(settled, "awTissue"),
      longshotTjZero: probabilitySummary(settled, "longshotTjZero"),
    },
    longshotControlRank1: longshotControlRank1Summary(settled),
    ordinaryControlRank1: ordinaryControlRank1Summary(settled),
    disagreements: disagreement.map((race) => disagreementRow(race)),
    suppressedRunners: settled.reduce((sum, race) => sum + race.longshotTjZero.probabilities.filter((runner) => runner.longshotTrainerJockeyAdjusted).length, 0),
    marketConditioning: "first captured valid bookmaker median price > 21.0",
    priceBoundaryDecimal: AW_LONGSHOT_PRICE_BOUNDARY_DECIMAL,
    challengerLabel: "LONGSHOT_TJ_ZERO",
    challengerRank1: modelSummary("longshotTjZero"),
    calibration: {
      control: probabilitySummary(settled, "awTissue"),
      challenger: probabilitySummary(settled, "longshotTjZero"),
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
      race.longshotTjZero.rank1HorseName,
      race.classification,
      `${pct(race.awTissue.rank1Probability)} / ${pct(race.longshotTjZero.rank1Probability)}`,
      `${price("awTissue")} / ${price("longshotTjZero")}`,
    ].join(" | ");
  };
  return [`AW Longshot Trainer/Jockey Paired Forward - ${date}`, "time | course | CONTROL #1 | LONGSHOT_TJ_ZERO #1 | agree/disagree | control p / challenger p | market prices", ...(races.length ? races.map(line) : ["No paired AW races recorded for this date."])].join("\n");
}

export function renderAwTissuePairedCompact(data: AwTissuePairedForwardData, date: string) {
  const races = data.races.filter((race) => race.raceDate === date && race.excludedReason === null);
  return [
    "AW PAIRED",
    `Races tracked today: ${races.length}`,
    `Agree: ${races.filter((race) => race.classification === "AGREE").length}`,
    `Disagree: ${races.filter((race) => race.classification === "DISAGREE").length}`,
    `Suppressed longshot runners: ${races.reduce((sum, race) => sum + race.longshotTjZero.probabilities.filter((runner) => runner.longshotTrainerJockeyAdjusted).length, 0)}`,
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
    `CONTROL winners: ${disagreement.filter((race) => winner(race, "awTissue")).length}`,
    `LONGSHOT_TJ_ZERO winners: ${disagreement.filter((race) => winner(race, "longshotTjZero")).length}`,
    `Neither: ${disagreement.filter((race) => !winner(race, "awTissue") && !winner(race, "longshotTjZero")).length}`,
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
    `Market-conditioned research shadow: suppress trainer/jockey only when first captured valid bookmaker median price is > ${AW_LONGSHOT_PRICE_BOUNDARY_DECIMAL.toFixed(1)}. This is not a market-independent Tissue model and does not change the AW VALUE cap.`,
    modelLine("CONTROL AW Tissue", s.awTissue),
    modelLine("LONGSHOT_TJ_ZERO", s.longshotTjZero),
    `Disagreement: CONTROL wins ${s.disagreementPerformance.awWins} | LONGSHOT_TJ_ZERO wins ${s.disagreementPerformance.longshotTjZeroWins} | neither ${s.disagreementPerformance.neither}`,
    `Positive-edge buckets (not actionable cap changes): CONTROL-only ${s.value.awOnly} | LONGSHOT_TJ_ZERO-only ${s.value.longshotTjZeroOnly} | both ${s.value.both} | neither ${s.value.neither}`,
    modelLine("CONTROL positive edge", s.value.awTissue),
    modelLine("LONGSHOT_TJ_ZERO positive edge", s.value.longshotTjZero),
    `>20/1 CONTROL rank-1: selections ${s.longshotControlRank1.selections} | displaced ${s.longshotControlRank1.displaced} | wins ${s.longshotControlRank1.winners} | expected ${s.longshotControlRank1.expectedWinners.toFixed(2)} | calibration ${num(s.longshotControlRank1.calibration)}`,
    `<=20/1 CONTROL rank-1: selections ${s.ordinaryControlRank1.selections} | same challenger rank-1 ${s.ordinaryControlRank1.sameChallengerRank1} | wins ${s.ordinaryControlRank1.winners} | expected ${s.ordinaryControlRank1.expectedWinners.toFixed(2)} | calibration ${num(s.ordinaryControlRank1.calibration)}`,
    `Probability: CONTROL log loss ${num(s.probability.awTissue.logLoss)} | CONTROL Brier ${num(s.probability.awTissue.brier)} | LONGSHOT_TJ_ZERO log loss ${num(s.probability.longshotTjZero.logLoss)} | LONGSHOT_TJ_ZERO Brier ${num(s.probability.longshotTjZero.brier)}`,
    "Paired significance is deliberately withheld until the prospective sample is large enough.",
  ].join("\n");
}

function snapshot(key: PairedModelKey, scored: Array<{ runner: TodayRunner; probability: number; rank: number; firstCapturedPriceDecimal: number | null; longshotTrainerJockeyAdjusted: boolean }>, modelVersion: string, modelHash: string): PairedModelSnapshot {
  const runners = scored.map(({ runner, probability, rank, firstCapturedPriceDecimal, longshotTrainerJockeyAdjusted }): PairedRunner => ({ runnerId: runner.runnerId, horseId: runner.horseId, horseName: runner.horseName, probability, rank, firstCapturedPriceDecimal, longshotTrainerJockeyAdjusted, outcome: null })).sort((a, b) => a.rank - b.rank || b.probability - a.probability || a.runnerId.localeCompare(b.runnerId));
  const leader = runners[0];
  if (!leader) throw new Error(`No ${key} leader`);
  return { modelVersion, modelHash, probabilities: runners, rankOrder: runners.map((runner) => runner.runnerId), rank1RunnerId: leader.runnerId, rank1HorseName: leader.horseName, rank1Probability: leader.probability, valueQualified: null, selectedPriceProfitLoss: null };
}

function ranksDescending(values: number[]) {
  const sorted = [...values].sort((a, b) => b - a);
  return values.map((value) => sorted.indexOf(value) + 1);
}

function emptyPrices(): PairedPriceContext {
  const empty = () => ({ awTissue: null, longshotTjZero: null });
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
  const challenger = flag("longshotTjZero");
  const valueBucket: PairValueBucket = aw && challenger ? "BOTH_VALUE" : aw ? "AW_ONLY_VALUE" : challenger ? "LONGSHOT_TJ_ZERO_ONLY_VALUE" : "NEITHER_VALUE";
  return { ...record, valueBucket, awTissue: { ...record.awTissue, valueQualified: aw }, longshotTjZero: { ...record.longshotTjZero, valueQualified: challenger } };
}

function selectedPriceProfit(record: AwTissuePairedRace, model: PairedModelSnapshot, runners: PairedRunner[]): number | null {
  const price = qualificationPrice(record, model.rank1RunnerId === record.awTissue.rank1RunnerId && model.modelVersion === record.awTissue.modelVersion ? "awTissue" : "longshotTjZero");
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

function firstCapturedBookmakerPrice(runner: TodayRunner): number | null {
  const market = summarizeBookmakerMarket(runner.bookmakerQuotes);
  return market.decimalPrice !== null && Number.isFinite(market.decimalPrice) ? market.decimalPrice : null;
}

function isLongshotAdjustmentPrice(price: number | null): boolean {
  return price !== null && price > AW_LONGSHOT_PRICE_BOUNDARY_DECIMAL;
}

function predictLongshotTjZero(
  runners: Array<{ runner: TodayRunner; modelInputs: number[]; firstCapturedPriceDecimal: number | null }>,
  model: AwTissueModel,
) {
  const scores = runners.map(({ modelInputs, firstCapturedPriceDecimal }) => {
    if (!isLongshotAdjustmentPrice(firstCapturedPriceDecimal)) return awTissueScore(modelInputs, model);
    return awTissueScore(modelInputs, model, { trainer_prior_rate: 0, jockey_prior_rate: 0 });
  });
  const maximum = Math.max(...scores);
  const weights = scores.map((value) => Math.exp(value - maximum));
  const total = weights.reduce((sum, value) => sum + value, 0);
  const probabilities = weights.map((value) => value / total);
  const ranks = ranksDescending(probabilities);
  return runners.map(({ runner, firstCapturedPriceDecimal }, index) => ({
    runner,
    probability: probabilities[index]!,
    rank: ranks[index]!,
    firstCapturedPriceDecimal,
    longshotTrainerJockeyAdjusted: isLongshotAdjustmentPrice(firstCapturedPriceDecimal),
  }));
}

function selectedOutcome(race: AwTissuePairedRace, key: PairedModelKey) {
  return race[key].probabilities.find((runner) => runner.runnerId === race[key].rank1RunnerId)?.outcome ?? null;
}

function longshotControlRank1Summary(races: AwTissuePairedRace[]) {
  const selections = races.filter((race) => {
    const leader = race.awTissue.probabilities.find((runner) => runner.runnerId === race.awTissue.rank1RunnerId);
    return isLongshotAdjustmentPrice(leader?.firstCapturedPriceDecimal ?? null) && leader?.outcome?.won !== null;
  });
  const winners = selections.filter((race) => selectedOutcome(race, "awTissue")?.won === true).length;
  const expectedWinners = selections.reduce((sum, race) => sum + race.awTissue.rank1Probability, 0);
  return {
    selections: selections.length,
    winners,
    expectedWinners,
    calibration: ratio(winners, expectedWinners),
    displaced: selections.filter((race) => race.awTissue.rank1RunnerId !== race.longshotTjZero.rank1RunnerId).length,
    replacements: selections.filter((race) => race.awTissue.rank1RunnerId !== race.longshotTjZero.rank1RunnerId).map((race) => ({
      raceId: race.raceId,
      controlRunnerId: race.awTissue.rank1RunnerId,
      controlHorseName: race.awTissue.rank1HorseName,
      challengerRunnerId: race.longshotTjZero.rank1RunnerId,
      challengerHorseName: race.longshotTjZero.rank1HorseName,
    })),
  };
}

function ordinaryControlRank1Summary(races: AwTissuePairedRace[]) {
  const selections = races.filter((race) => {
    const leader = race.awTissue.probabilities.find((runner) => runner.runnerId === race.awTissue.rank1RunnerId);
    return !isLongshotAdjustmentPrice(leader?.firstCapturedPriceDecimal ?? null) && leader?.outcome?.won !== null;
  });
  const winners = selections.filter((race) => selectedOutcome(race, "awTissue")?.won === true).length;
  const expectedWinners = selections.reduce((sum, race) => sum + race.awTissue.rank1Probability, 0);
  return {
    selections: selections.length,
    winners,
    expectedWinners,
    calibration: ratio(winners, expectedWinners),
    sameChallengerRank1: selections.filter((race) => race.awTissue.rank1RunnerId === race.longshotTjZero.rank1RunnerId).length,
  };
}

function disagreementRow(race: AwTissuePairedRace) {
  const suppressed = race.longshotTjZero.probabilities.filter((runner) => runner.longshotTrainerJockeyAdjusted);
  const resultFor = (key: PairedModelKey) => {
    const outcome = selectedOutcome(race, key);
    if (!outcome) return "pending";
    return outcome.won === true ? "winner" : outcome.won === null ? "void" : outcome.finishingPosition !== null ? `finished ${outcome.finishingPosition}` : outcome.resultStatus ?? "settled";
  };
  return {
    time: formatRaceTimeForDisplay({ raceDateTime: new Date(race.currentOffAt), scheduledTime: race.scheduledTime }),
    course: race.course,
    controlRank1: race.awTissue.rank1HorseName,
    controlProbability: race.awTissue.rank1Probability,
    controlPrice: qualificationPrice(race, "awTissue")?.medianDecimalPrice ?? race.awTissue.probabilities.find((runner) => runner.runnerId === race.awTissue.rank1RunnerId)?.firstCapturedPriceDecimal ?? null,
    challengerRank1: race.longshotTjZero.rank1HorseName,
    challengerProbability: race.longshotTjZero.rank1Probability,
    challengerPrice: qualificationPrice(race, "longshotTjZero")?.medianDecimalPrice ?? race.longshotTjZero.probabilities.find((runner) => runner.runnerId === race.longshotTjZero.rank1RunnerId)?.firstCapturedPriceDecimal ?? null,
    suppressed: suppressed.map((runner) => ({ runnerId: runner.runnerId, horseName: runner.horseName, firstCapturedPriceDecimal: runner.firstCapturedPriceDecimal })),
    result: { control: resultFor("awTissue"), challenger: resultFor("longshotTjZero") },
  };
}
