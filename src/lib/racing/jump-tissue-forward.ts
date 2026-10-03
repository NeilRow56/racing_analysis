import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { isVoidBetResultStatus, settleSelection } from "./backtest";
import { calculateJumpRaceRatings, jumpRatingInputForTodayRunner, JUMP_RATING_A_VERSION, JUMP_RATING_B_VERSION } from "./jump-performance-rating";
import {
  FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION,
  FORWARD_VALUE_PRICE_SNAPSHOT_SCHEDULE_VERSION,
  forwardValuePriceSnapshot,
  isCleanPhase2Observation,
  priceSnapshotStage,
  summarizeBookmakerMarket,
  type ForwardValuePriceSnapshot,
  type ForwardValueRecord,
} from "./forward-value";
import {
  JUMP_TISSUE_IMPLEMENTED_AT,
  JUMP_TISSUE_SCHEMA,
  JUMP_TISSUE_VERSION,
  jumpTissueSubtype,
  predictJumpTissue,
  type JumpTissueBook,
  type JumpTissueModel,
  type JumpTissuePrediction,
} from "./jump-tissue-model";
import { formatRaceTimeForDisplay, type SportingLifeCurrentPrice, type TodayMeeting, type TodayRace } from "./todays-racing";

export const JUMP_TISSUE_FORWARD_VERSION = "jump_tissue_forward_v1" as const;
export const JUMP_TISSUE_FORWARD_PATH = "data/research/jump-tissue-forward-v1.json" as const;

type Outcome = { resultStatus: string | null; finishingPosition: number | null; won: boolean | null; finalSp: number | null; deadHeatDivisor: number; finalSpProfitLoss: number | null };

export type JumpTissueRunner = JumpTissuePrediction & {
  horseId: string;
  horseName: string;
  outcome: Outcome | null;
};

export type JumpTissueRace = Omit<JumpTissueBook, "runners"> & {
  raceId: string;
  sourceId: string | null;
  raceDate: string;
  course: string;
  raceName: string | null;
  scheduledTime: string;
  scheduledOffAt: string;
  currentOffAt: string;
  subtype: "Hurdle" | "Chase" | "NH Flat" | "Other Jump";
  nhFlat: boolean;
  fieldSize: number;
  recordedAt: string;
  recordedPreRace: boolean;
  modelVersion: typeof JUMP_TISSUE_VERSION;
  featureSchemaVersion: typeof JUMP_TISSUE_SCHEMA;
  modelHash: string;
  runners: JumpTissueRunner[];
  top1: string | null;
  top2: string[];
  top3: string[];
  jprALeader: string | null;
  jprBLeader: string | null;
  winners: string[];
  settledAt: string | null;
  excludedReason: string | null;
  marketPriceBasisVersion: typeof FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION;
  priceSnapshotScheduleVersion: typeof FORWARD_VALUE_PRICE_SNAPSHOT_SCHEDULE_VERSION;
  prices: { early: ForwardValuePriceSnapshot | null; t180: ForwardValuePriceSnapshot | null; t60: ForwardValuePriceSnapshot | null };
  selectedPriceProfitLoss: { early: number | null; t180: number | null; t60: number | null; bestEarly: number | null; finalSp: number | null };
};

export type JumpTissueForwardData = {
  version: typeof JUMP_TISSUE_FORWARD_VERSION;
  modelVersion: typeof JUMP_TISSUE_VERSION;
  featureSchemaVersion: typeof JUMP_TISSUE_SCHEMA;
  implementedAt: typeof JUMP_TISSUE_IMPLEMENTED_AT;
  races: JumpTissueRace[];
};

export function emptyJumpTissueForward(): JumpTissueForwardData {
  return { version: JUMP_TISSUE_FORWARD_VERSION, modelVersion: JUMP_TISSUE_VERSION, featureSchemaVersion: JUMP_TISSUE_SCHEMA, implementedAt: JUMP_TISSUE_IMPLEMENTED_AT, races: [] };
}

export async function loadJumpTissueForward(path = JUMP_TISSUE_FORWARD_PATH): Promise<JumpTissueForwardData> {
  try {
    const data = JSON.parse(await readFile(path, "utf8")) as JumpTissueForwardData;
    if (data.version !== JUMP_TISSUE_FORWARD_VERSION || data.modelVersion !== JUMP_TISSUE_VERSION || data.featureSchemaVersion !== JUMP_TISSUE_SCHEMA || data.implementedAt !== JUMP_TISSUE_IMPLEMENTED_AT) {
      throw new Error("Unsupported Jump Tissue tracker");
    }
    return data;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyJumpTissueForward();
    throw error;
  }
}

export async function mutateJumpTissueForward(mutation: (data: JumpTissueForwardData) => JumpTissueForwardData | Promise<JumpTissueForwardData>, path = JUMP_TISSUE_FORWARD_PATH) {
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
    const original = await loadJumpTissueForward(path);
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

export function buildJumpTissueRace(input: {
  raceDate: string;
  course: string;
  race: TodayRace;
  commentsByHorse: ReadonlyMap<string, import("../../../scripts/diagnose-independent-tissue-feasibility").HistoricalComment[]>;
  model: JumpTissueModel;
  recordedAt?: Date;
}): JumpTissueRace | null {
  const recordedAt = input.recordedAt ?? new Date();
  const off = input.race.raceDateTime;
  if (!off || !input.race.scheduledTime || recordedAt < new Date(JUMP_TISSUE_IMPLEMENTED_AT) || recordedAt >= off) return null;
  if (input.race.winningTime || input.race.runners.some((runner) => runner.finishingPosition !== null || (runner.resultStatus !== null && runner.resultStatus !== "non_runner"))) return null;
  const subtype = jumpTissueSubtype(input.race);
  if (subtype.subtype === "Other Jump") return null;
  const book = predictJumpTissue(input.race, input.commentsByHorse, input.model);
  if (book.activeRunnerCount < 2) return null;
  const byId = new Map(input.race.runners.map((runner) => [runner.runnerId, runner]));
  const ratings = calculateJumpRaceRatings(input.race.runners.filter((runner) => runner.resultStatus !== "non_runner").map(jumpRatingInputForTodayRunner));
  const leader = (kind: "jprA" | "jprB") => [...ratings].filter(([, rating]) => rating[kind] !== null).sort((left, right) => left[1][kind]!.rank - right[1][kind]!.rank || left[0].localeCompare(right[0]))[0]?.[0] ?? null;
  const ranked = [...book.runners].filter((runner) => runner.rank !== null).sort((left, right) => left.rank! - right.rank! || left.runnerId.localeCompare(right.runnerId));
  return {
    ...book,
    raceId: input.race.raceId,
    sourceId: input.race.sourceId,
    raceDate: input.raceDate,
    course: input.course,
    raceName: input.race.raceName,
    scheduledTime: input.race.scheduledTime,
    scheduledOffAt: off.toISOString(),
    currentOffAt: off.toISOString(),
    subtype: subtype.subtype,
    nhFlat: subtype.nhFlat,
    fieldSize: book.activeRunnerCount,
    recordedAt: recordedAt.toISOString(),
    recordedPreRace: true,
    modelVersion: JUMP_TISSUE_VERSION,
    featureSchemaVersion: JUMP_TISSUE_SCHEMA,
    modelHash: input.model.checksum,
    runners: book.runners.map((prediction) => ({ ...prediction, horseId: byId.get(prediction.runnerId)!.horseId, horseName: byId.get(prediction.runnerId)!.horseName, outcome: null })),
    top1: ranked[0]?.runnerId ?? null,
    top2: ranked.slice(0, 2).map((runner) => runner.runnerId),
    top3: ranked.slice(0, 3).map((runner) => runner.runnerId),
    jprALeader: leader("jprA"),
    jprBLeader: leader("jprB"),
    winners: [],
    settledAt: null,
    excludedReason: book.predictedRunnerCount === 0 ? "prediction_unavailable" : null,
    marketPriceBasisVersion: FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION,
    priceSnapshotScheduleVersion: FORWARD_VALUE_PRICE_SNAPSHOT_SCHEDULE_VERSION,
    prices: { early: null, t180: null, t60: null },
    selectedPriceProfitLoss: { early: null, t180: null, t60: null, bestEarly: null, finalSp: null },
  };
}

export function captureJumpTissueRaces(data: JumpTissueForwardData, races: JumpTissueRace[]): JumpTissueForwardData {
  const existing = new Set(data.races.map((race) => race.raceId));
  const additions = races.filter((race) => {
    if (existing.has(race.raceId) || !race.recordedPreRace || race.recordedAt < JUMP_TISSUE_IMPLEMENTED_AT || race.recordedAt >= race.scheduledOffAt || race.settledAt !== null) return false;
    existing.add(race.raceId);
    return true;
  });
  return additions.length ? { ...data, races: [...data.races, ...additions] } : data;
}

export function enrichJumpTissuePrices(record: JumpTissueRace, race: TodayRace, capturedAt = new Date()): JumpTissueRace {
  const off = race.raceDateTime;
  if (record.settledAt || !off || capturedAt >= off || capturedAt.toISOString() < record.recordedAt) return record;
  const leader = record.runners.find((runner) => runner.runnerId === record.top1);
  const current = race.runners.find((runner) => runner.runnerId === record.top1);
  if (!leader?.probability || !current || current.resultStatus === "non_runner") return record;
  const market = summarizeBookmakerMarket(current.bookmakerQuotes);
  if (market.decimalPrice === null || market.impliedProbability === null) return record;
  const snapshot: ForwardValuePriceSnapshot = {
    price: null,
    decimalPrice: market.decimalPrice,
    impliedProbability: market.impliedProbability,
    capturedAt: capturedAt.toISOString(),
    minutesBeforeScheduledOff: (off.getTime() - capturedAt.getTime()) / 60_000,
    ratingProbability: leader.probability,
    ratingEdgePercentagePoints: (leader.probability - market.impliedProbability) * 100,
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
  };
  const stage = priceSnapshotStage(snapshot.minutesBeforeScheduledOff);
  const prices = { ...record.prices };
  let changed = false;
  if (!prices.early) { prices.early = snapshot; changed = true; }
  if (stage === "t180" && !prices.t180) { prices.t180 = snapshot; changed = true; }
  if (stage === "t60" && !prices.t60) { prices.t60 = snapshot; changed = true; }
  return changed ? { ...record, currentOffAt: off.toISOString(), prices } : record;
}

export function settleJumpTissueRace(record: JumpTissueRace, race: TodayRace, settledAt = new Date()): JumpTissueRace {
  if (record.settledAt !== null || !record.recordedPreRace) return record;
  const byId = new Map(race.runners.map((runner) => [runner.runnerId, runner]));
  if (record.runners.some((runner) => !byId.has(runner.runnerId))) return record;
  const started = race.runners.filter((runner) => !isVoidBetResultStatus(runner.resultStatus));
  if (race.actualRunnerCount === null || (race.actualRunnerCount !== started.length && race.actualRunnerCount !== race.runners.length)) return record;
  const winners = started.filter((runner) => runner.finishingPosition === 1);
  if (!winners.length || started.some((runner) => settleSelection({ targetRaceId: race.raceId, targetRunnerId: runner.runnerId, finishingPosition: runner.finishingPosition, resultStatus: runner.resultStatus, won: runner.finishingPosition === 1 ? true : null, placed: null, startingPrice: null, startingPriceDecimal: "2" }) === null)) return record;
  const changedField = started.some((runner) => !record.runners.some((snapshot) => snapshot.runnerId === runner.runnerId));
  const runners = record.runners.map((runner): JumpTissueRunner => {
    const result = byId.get(runner.runnerId)!;
    const voided = isVoidBetResultStatus(result.resultStatus);
    const won = voided ? null : result.finishingPosition === 1;
    const settlement = settleSelection({ targetRaceId: race.raceId, targetRunnerId: runner.runnerId, finishingPosition: result.finishingPosition, resultStatus: result.resultStatus, won, placed: null, startingPrice: result.odds, startingPriceDecimal: result.oddsDecimal, deadHeatDivisor: won ? winners.length : 1 });
    return { ...runner, outcome: { finishingPosition: result.finishingPosition, resultStatus: result.resultStatus, won, finalSp: settlement?.settlementOddsDecimal ?? null, deadHeatDivisor: won ? winners.length : 1, finalSpProfitLoss: settlement?.profitLoss ?? null } };
  });
  const leader = runners.find((runner) => runner.runnerId === record.top1);
  const pricedProfit = (price: number | null | undefined) => {
    if (price == null || !leader?.outcome) return null;
    const outcome = leader.outcome;
    return settleSelection({ targetRaceId: race.raceId, targetRunnerId: leader.runnerId, finishingPosition: outcome.finishingPosition, resultStatus: outcome.resultStatus, won: outcome.won, placed: null, startingPrice: null, startingPriceDecimal: String(price), deadHeatDivisor: outcome.deadHeatDivisor })?.profitLoss ?? null;
  };
  return {
    ...record,
    runners,
    winners: winners.map((runner) => runner.runnerId),
    settledAt: settledAt.toISOString(),
    excludedReason: changedField ? "field_changed_after_capture" : record.excludedReason,
    selectedPriceProfitLoss: { early: pricedProfit(record.prices.early?.decimalPrice), t180: pricedProfit(record.prices.t180?.decimalPrice), t60: pricedProfit(record.prices.t60?.decimalPrice), bestEarly: pricedProfit(record.prices.early?.bestBookmakerPriceDecimal), finalSp: leader?.outcome?.finalSpProfitLoss ?? null },
  };
}

export function updateJumpTissueForward(data: JumpTissueForwardData, currentById: ReadonlyMap<string, TodayRace>, capturedAt = new Date()): JumpTissueForwardData {
  const races = data.races.map((record) => {
    const current = currentById.get(record.raceId);
    return current ? settleJumpTissueRace(enrichJumpTissuePrices(record, current, capturedAt), current, capturedAt) : record;
  });
  return races.every((race, index) => race === data.races[index]) ? data : { ...data, races };
}

export function cleanJumpTissueRace(race: JumpTissueRace): boolean {
  return race.recordedPreRace && race.recordedAt >= JUMP_TISSUE_IMPLEMENTED_AT && race.recordedAt < race.scheduledOffAt && race.excludedReason === null && race.predictedRunnerCount === race.activeRunnerCount;
}

export function summarizeJumpTissueForward(data: JumpTissueForwardData) {
  const clean = data.races.filter(cleanJumpTissueRace);
  const settled = clean.filter((race) => race.settledAt !== null);
  return {
    racesTracked: data.races.length,
    cleanPreRace: clean.length,
    pending: clean.filter((race) => race.settledAt === null).length,
    settled: settled.length,
    excluded: data.races.length - clean.length,
    ...summaryForRaces(settled),
    subtypes: ["Hurdle", "Chase", "NH Flat"].map((subtype) => ({ subtype, ...summaryForRaces(settled.filter((race) => race.subtype === subtype)), races: clean.filter((race) => race.subtype === subtype).length })),
    comparison: jprComparison(settled, "jprALeader"),
    jprBComparison: jprComparison(settled, "jprBLeader"),
  };
}

export function renderJumpTissueSummary(data: JumpTissueForwardData) {
  const summary = summarizeJumpTissueForward(data);
  const unavailable = data.races.filter((race) => race.predictedRunnerCount !== race.activeRunnerCount);
  return ["Jump Tissue Forward Summary", `Model: ${data.modelVersion} | schema: ${data.featureSchemaVersion}`, `Implementation epoch: ${data.implementedAt}`,
    `Tracked: ${summary.racesTracked} | clean pre-race: ${summary.cleanPreRace} | pending: ${summary.pending} | settled: ${summary.settled} | excluded/post-race: ${summary.excluded}`,
    `Prediction coverage: ${data.races.reduce((sum, race) => sum + race.predictedRunnerCount, 0)}/${data.races.reduce((sum, race) => sum + race.activeRunnerCount, 0)} runners | incomplete books: ${unavailable.length}`,
    `Top-1: ${pct(summary.top1)} | top-2: ${pct(summary.top2)} | top-3: ${pct(summary.top3)}`,
    `Log loss: ${num(summary.logLoss)} | race Brier: ${num(summary.brier)} | probability races: ${summary.probabilityRaces}`,
    "Band | Runners | Mean predicted | Actual strike", ...summary.calibration.map((row) => `${row.band} | ${row.runners} | ${pct(row.meanPredicted)} | ${pct(row.actualStrike)}`),
    "Subtype | Races | Top-1 | Top-2 | Top-3 | Log loss | Brier | Coverage",
    ...summary.subtypes.map((row) => `${row.subtype}${row.subtype === "NH Flat" ? " (separate monitoring segment)" : ""} | ${row.races} | ${pct(row.top1)} | ${pct(row.top2)} | ${pct(row.top3)} | ${num(row.logLoss)} | ${num(row.brier)} | ${pct(row.coverage)}`),
    "JPR-A comparison: group | races | Tissue winners | JPR-A winners | both | neither",
    ...summary.comparison.groups.map((row) => `${row.sameLeader ? "same leader" : "different leader"} | ${row.races} | ${row.tissueWinners} | ${row.ratingWinners} | ${row.both} | ${row.neither}`),
    `Common clean races: ${summary.comparison.commonRaces} | Jump Tissue top-1 ${pct(summary.comparison.tissueStrike)} | JPR-A top-1 ${pct(summary.comparison.ratingStrike)}`,
    `JPR-B common clean races: ${summary.jprBComparison.commonRaces}`,
    "NH Flat is reported separately and is not evidence for common-model stability in early tracking.",
    "Descriptive forward validation only. No rule creation.",
  ].join("\n");
}

export function renderJumpTissueToday(data: JumpTissueForwardData, date: string, currentPrices: SportingLifeCurrentPrice[] = []) {
  const races = data.races.filter((race) => race.raceDate === date && race.recordedPreRace).sort((left, right) => left.currentOffAt.localeCompare(right.currentOffAt));
  const edges = currentPositiveJumpTissueRankOneEdges(races, currentPrices);
  const displayRaceTime = (race: JumpTissueRace) => formatRaceTimeForDisplay({ raceDateTime: new Date(race.currentOffAt), scheduledTime: race.scheduledTime });
  return [`Jump Tissue (diagnostic) - ${date}`, ...(races.length ? races.flatMap((race) => {
    const name = (runnerId: string | null) => race.runners.find((runner) => runner.runnerId === runnerId)?.horseName ?? "-";
    return [`${displayRaceTime(race)} ${race.course} | ${race.subtype}${race.raceName ? ` - ${race.raceName}` : ""}`,
      ...race.top3.map((runnerId) => { const runner = race.runners.find((candidate) => candidate.runnerId === runnerId)!; return `  ${runner.rank}. ${runner.horseName} ${pct(runner.probability)}`; }),
      `  JPR-A: ${name(race.jprALeader)} | same leader: ${race.top1 && race.jprALeader ? race.top1 === race.jprALeader ? "yes" : "no" : "-"} | coverage: ${race.predictedRunnerCount}/${race.activeRunnerCount} (${pct(race.predictionCoverage)})`,
      ...(race.excludedReason ? [`  Unavailable: ${race.excludedReason}`] : [])];
  }) : ["No prospective Jump Tissue races recorded for this date."]),
  "",
  "Current positive-edge Jump Tissue rank-1 horses",
  ...(edges.selections.length ? edges.selections.flatMap(({ race, runner, price, impliedProbability, edge }) => [
    `${price.displayRaceTime || displayRaceTime(race)} ${race.course} | ${runner.horseName}`,
    `Tissue ${pct1(runner.probability!)} | Market ${price.marketPrice!.trim()} | Implied ${pct1(impliedProbability)} | Edge ${signedPp1(edge * 100)} | Quotes ${price.bookmakerQuoteCount}${edge * 100 >= 10 - 1e-9 ? " | LARGE" : ""}`,
    "",
  ]).slice(0, -1) : ["None"]),
  "",
  `Positive-edge rank-1 horses: ${edges.selections.length} / comparable races ${edges.comparableRaces}`].join("\n").trimEnd();
}

export function currentPositiveJumpTissueRankOneEdges(races: JumpTissueRace[], currentPrices: SportingLifeCurrentPrice[] = []) {
  const priceByRunner = new Map(currentPrices.map((price) => [`${price.raceId}|${price.runnerId}`, price]));
  let comparableRaces = 0;
  const selections: Array<{ race: JumpTissueRace; runner: JumpTissueRunner; price: SportingLifeCurrentPrice; impliedProbability: number; edge: number }> = [];
  for (const race of races) {
    const runner = race.runners.find((candidate) => candidate.runnerId === race.top1);
    if (!runner?.probability) continue;
    const price = priceByRunner.get(`${race.raceId}|${runner.runnerId}`);
    if (!price || price.bookmakerQuoteCount <= 0 || price.marketDecimalOdds === null || !Number.isFinite(price.marketDecimalOdds) || price.marketDecimalOdds <= 1 || !price.marketPrice?.trim()) continue;
    comparableRaces += 1;
    const impliedProbability = 1 / price.marketDecimalOdds;
    const edge = runner.probability - impliedProbability;
    if (edge > 0) selections.push({ race, runner, price, impliedProbability, edge });
  }
  return { selections, comparableRaces };
}

export function jumpTissueValueAgreement(data: JumpTissueForwardData, ratings: ForwardValueRecord[]) {
  const byId = new Map(ratings.filter((record) => record.family === "jump" && record.recordedAt >= JUMP_TISSUE_IMPLEMENTED_AT && isCleanPhase2Observation(record) && record.marketPriceBasisVersion === FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION).map((record) => [record.raceId, record]));
  const rows = data.races.filter(cleanJumpTissueRace).flatMap((race) => {
    const rating = byId.get(race.raceId);
    if (!rating || race.top1 === null) return [];
    const stage = race.prices.t60 && forwardValuePriceSnapshot(rating, "t60") ? "t60" : race.prices.t180 && forwardValuePriceSnapshot(rating, "t180") ? "t180" : "early";
    const tissuePrice = race.prices[stage], ratingPrice = forwardValuePriceSnapshot(rating, stage);
    if (!tissuePrice || !ratingPrice) return [];
    return [{ same: race.top1 === rating.leaderRunnerId, tissuePositive: tissuePrice.ratingEdgePercentagePoints > 0, ratingPositive: ratingPrice.ratingEdgePercentagePoints > 0 }];
  });
  return { comparable: rows.length, sameLeader: rows.filter((row) => row.same).length, differentLeader: rows.filter((row) => !row.same).length, bothPositive: rows.filter((row) => row.tissuePositive && row.ratingPositive).length, jprAPositiveOnly: rows.filter((row) => !row.tissuePositive && row.ratingPositive).length, tissuePositiveOnly: rows.filter((row) => row.tissuePositive && !row.ratingPositive).length, neitherPositive: rows.filter((row) => !row.tissuePositive && !row.ratingPositive).length };
}

export function renderJumpTissueValue(data: JumpTissueForwardData, ratings: ForwardValueRecord[], date?: string) {
  const agreement = jumpTissueValueAgreement(data, ratings);
  return ["Jump Tissue / Forward Value (median_bookmaker_v1)", ...data.races.filter((race) => cleanJumpTissueRace(race) && (!date || race.raceDate === date)).map((race) => {
    const leader = race.runners.find((runner) => runner.runnerId === race.top1)!;
    const price = race.prices.t60 ?? race.prices.t180 ?? race.prices.early;
    return `${race.raceDate} ${formatRaceTimeForDisplay({ raceDateTime: new Date(race.currentOffAt), scheduledTime: race.scheduledTime })} ${race.course} | ${leader.horseName} | probability ${pct(leader.probability)} | median ${price?.decimalPrice.toFixed(2) ?? "-"} | implied ${pct(price?.impliedProbability ?? null)} | edge ${price?.ratingEdgePercentagePoints.toFixed(2) ?? "-"}pp | best ${price?.bestBookmakerPriceDecimal?.toFixed(2) ?? "-"} | forecast ${price?.forecastPrice ?? "-"} | quotes ${price?.bookmakerQuoteCount ?? 0} | Early ${race.prices.early?.decimalPrice.toFixed(2) ?? "-"} | T-180 ${race.prices.t180?.decimalPrice.toFixed(2) ?? "-"} | T-60 ${race.prices.t60?.decimalPrice.toFixed(2) ?? "-"} | final SP ${leader.outcome?.finalSp?.toFixed(2) ?? "-"}`;
  }), `Jump model agreement: comparable=${agreement.comparable} same=${agreement.sameLeader} different=${agreement.differentLeader} both_positive=${agreement.bothPositive} jpr_a_positive_only=${agreement.jprAPositiveOnly} jump_tissue_positive_only=${agreement.tissuePositiveOnly} neither=${agreement.neitherPositive}`].join("\n");
}

export function attachJumpTissueToMeetings(meetings: TodayMeeting[], data: JumpTissueForwardData): TodayMeeting[] {
  const byId = new Map(data.races.map((race) => [race.raceId, race]));
  return meetings.map((meeting) => ({ ...meeting, races: meeting.races.map((race) => {
    const frozen = byId.get(race.raceId);
    if (!frozen) return race;
    return { ...race, jumpTissueCoverage: { activeRunnerCount: frozen.activeRunnerCount, predictedRunnerCount: frozen.predictedRunnerCount, predictionCoverage: frozen.predictionCoverage }, runners: race.runners.map((runner) => ({ ...runner, jumpTissue: frozen.runners.find((candidate) => candidate.runnerId === runner.runnerId) })) };
  }) }));
}

function summaryForRaces(settled: JumpTissueRace[]) {
  const capture = (count: number) => avg(settled.filter((race) => race.runners.some((runner) => runner.rank !== null && runner.rank <= count && runner.outcome?.won !== null)).map((race) => race.runners.some((runner) => runner.rank !== null && runner.rank <= count && runner.outcome?.won === true) ? 1 : 0));
  const observations = settled.flatMap((race) => race.runners.filter((runner) => runner.probability !== null && runner.outcome?.won !== null));
  const probabilityRaces = settled.filter((race) => race.runners.every((runner) => runner.probability !== null && runner.outcome?.won !== null));
  const calibration = [["<5%", 0, .05], ["5-9.99%", .05, .1], ["10-14.99%", .1, .15], ["15-19.99%", .15, .2], ["20-29.99%", .2, .3], ["30%+", .3, 1.01]].map(([band, low, high]) => {
    const rows = observations.filter((runner) => runner.probability! >= (low as number) && runner.probability! < (high as number));
    return { band: band as string, runners: rows.length, meanPredicted: avg(rows.map((runner) => runner.probability!)), actualStrike: avg(rows.map((runner) => runner.outcome!.won ? 1 : 0)) };
  });
  return {
    top1: capture(1),
    top2: capture(2),
    top3: capture(3),
    logLoss: avg(probabilityRaces.map((race) => -Math.log(Math.max(race.runners.filter((runner) => runner.outcome!.won).reduce((sum, runner) => sum + runner.probability!, 0), 1e-12)))),
    brier: avg(probabilityRaces.map((race) => race.runners.reduce((sum, runner) => sum + (runner.probability! - (runner.outcome!.won ? 1 / race.winners.length : 0)) ** 2, 0))),
    probabilityRaces: probabilityRaces.length,
    calibration,
    coverage: avg(settled.map((race) => race.predictionCoverage)),
  };
}

function jprComparison(settled: JumpTissueRace[], key: "jprALeader" | "jprBLeader") {
  const common = settled.filter((race) => race.top1 !== null && race[key] !== null && race.runners.find((runner) => runner.runnerId === race.top1)?.outcome?.won !== null && race.runners.find((runner) => runner.runnerId === race[key])?.outcome?.won !== null);
  const wins = (race: JumpTissueRace, runnerId: string | null) => race.runners.find((runner) => runner.runnerId === runnerId)?.outcome?.won === true;
  const groups = [true, false].map((sameLeader) => {
    const races = common.filter((race) => (race.top1 === race[key]) === sameLeader);
    return { sameLeader, races: races.length, tissueWinners: races.filter((race) => wins(race, race.top1)).length, ratingWinners: races.filter((race) => wins(race, race[key])).length, both: races.filter((race) => wins(race, race.top1) && wins(race, race[key])).length, neither: races.filter((race) => !wins(race, race.top1) && !wins(race, race[key])).length };
  });
  return { groups, commonRaces: common.length, tissueStrike: avg(common.map((race) => wins(race, race.top1) ? 1 : 0)), ratingStrike: avg(common.map((race) => wins(race, race[key]) ? 1 : 0)) };
}

const avg = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const pct = (value: number | null) => value === null ? "-" : `${(value * 100).toFixed(2)}%`;
const pct1 = (value: number) => `${(value * 100).toFixed(1)}%`;
const signedPp1 = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(1)}pp`;
const num = (value: number | null) => value === null ? "-" : value.toFixed(4);
