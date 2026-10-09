import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { isVoidBetResultStatus, settleSelection } from "./backtest";
import { FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION, summarizeBookmakerMarket } from "./forward-value";
import { canonicalFamilyFormMetrics } from "./horse-metrics";
import { todayRaceHasConclusiveResult } from "./today-race-status";
import { calculateTodaysRating, TODAYS_RATING_CALCULATION_VERSION } from "./todays-rating";
import { formatRaceTimeForDisplay, getLocalRacingDate, isOrdinaryFlatTurfRaceForDisplay,
  type SportingLifeBookmakerQuote, type TodayMeeting, type TodayRace, type TodayRunner } from "./todays-racing";
import { calculateWeightAdjustedPerformance } from "./weight-performance";

export const TODAYS_RATING_WEIGHT_FORWARD_VERSION = "TODAYS_RATING_WEIGHT_FORWARD_V1" as const;
export const TODAYS_RATING_WEIGHT_FORWARD_PATH = "data/research/todays-rating-weight-forward-v1.json";
export const TODAYS_RATING_WEIGHT_FORWARD_EPOCH = "2026-10-09T11:36:34.000Z" as const;
export const TODAYS_RATING_WEIGHT_BANDS = ["8+ lb lighter", "4-7 lb lighter"] as const;
export type TodaysRatingWeightBand = typeof TODAYS_RATING_WEIGHT_BANDS[number];
export type PriorTurfPerformance = {
  runnerId: string; raceDateTime: string; weightCarriedLbs: number; speed: number;
};
export type WeightMarketSnapshot = {
  capturedAt: string; priceCapturedAt: string | null;
  source: "sporting_life_stored_bookmaker_median_at_capture_v1";
  marketPriceBasisVersion: typeof FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION;
  medianDecimal: number | null; impliedProbability: number | null;
  bookmakerQuoteCount: number; bookmakerQuotes: SportingLifeBookmakerQuote[];
};
export type WeightOutcome = {
  status: "settled" | "void"; resultStatus: string | null; finishingPosition: number | null;
  won: boolean | null; deadHeatDivisor: number; finalSp: number | null;
  qualifyingPriceProfitLoss: number | null; finalSpProfitLoss: number | null;
};
export type TodaysRatingWeightObservation = {
  raceDate: string; raceId: string; sourceId: string | null; scheduledOff: string; scheduledTime: string;
  course: string; horseId: string; horseName: string; runnerId: string;
  recordedAt: string; recordedPreRace: true; ratingVersion: typeof TODAYS_RATING_CALCULATION_VERSION;
  todaysRating: number; latestSpeed: number | null; bestL3Speed: number | null; avgL3Speed: number | null;
  tpr: number | null; todayWeight: number; priorRun: PriorTurfPerformance;
  signedWeightChange: number; weightBand: TodaysRatingWeightBand;
  todaysRatingRank: 1; latestSpeedRank: number | null; bestL3Rank: number | null; tprRank: number | null;
  latestSpeedLeaders: Array<{ runnerId: string; horseId: string; horseName: string; outcome: WeightOutcome | null }>;
  market: { qualifying: WeightMarketSnapshot; later: WeightMarketSnapshot[]; finalStoredPreRace: WeightMarketSnapshot | null };
  outcome: WeightOutcome | null; settledAt: string | null;
};
export type TodaysRatingWeightForwardData = {
  version: typeof TODAYS_RATING_WEIGHT_FORWARD_VERSION;
  epoch: typeof TODAYS_RATING_WEIGHT_FORWARD_EPOCH;
  qualification: { family: "Turf"; todaysRatingRank: 1; bands: readonly TodaysRatingWeightBand[] };
  observations: TodaysRatingWeightObservation[];
};

export function emptyTodaysRatingWeightForward(): TodaysRatingWeightForwardData {
  return { version: TODAYS_RATING_WEIGHT_FORWARD_VERSION, epoch: TODAYS_RATING_WEIGHT_FORWARD_EPOCH,
    qualification: { family: "Turf", todaysRatingRank: 1, bands: TODAYS_RATING_WEIGHT_BANDS }, observations: [] };
}

export async function loadTodaysRatingWeightForward(path = TODAYS_RATING_WEIGHT_FORWARD_PATH): Promise<TodaysRatingWeightForwardData> {
  try {
    const data = JSON.parse(await readFile(path, "utf8")) as TodaysRatingWeightForwardData;
    if (data.version !== TODAYS_RATING_WEIGHT_FORWARD_VERSION || data.epoch !== TODAYS_RATING_WEIGHT_FORWARD_EPOCH ||
      !Array.isArray(data.observations) || JSON.stringify(data.qualification) !== JSON.stringify(emptyTodaysRatingWeightForward().qualification)) {
      throw new Error(`Unsupported Today's Rating weight tracker at ${path}`);
    }
    return data;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyTodaysRatingWeightForward();
    throw error;
  }
}

export async function mutateTodaysRatingWeightForward(
  mutation: (data: TodaysRatingWeightForwardData) => TodaysRatingWeightForwardData | Promise<TodaysRatingWeightForwardData>,
  path = TODAYS_RATING_WEIGHT_FORWARD_PATH,
) {
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
    const before = await loadTodaysRatingWeightForward(path);
    const after = await mutation(before);
    if (JSON.stringify(after) !== JSON.stringify(before)) {
      const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
      await writeFile(temporary, `${JSON.stringify(after, null, 2)}\n`, "utf8");
      await rename(temporary, path);
    }
    return after;
  } finally { await rm(lock, { recursive: true, force: true }); }
}

export function lighterWeightBand(change: number): TodaysRatingWeightBand | null {
  if (!Number.isInteger(change)) return null;
  if (change <= -8) return "8+ lb lighter";
  return change >= -7 && change <= -4 ? "4-7 lb lighter" : null;
}

function turfForm(runner: TodayRunner) {
  return runner.metrics ? canonicalFamilyFormMetrics(runner.metrics, "turf") : null;
}

function descendingRanks(runners: TodayRunner[], value: (runner: TodayRunner) => number | null) {
  const sorted = runners.map((runner) => ({ runner, value: value(runner) })).filter((entry): entry is { runner: TodayRunner; value: number } => finite(entry.value))
    .sort((a, b) => b.value - a.value || a.runner.runnerId.localeCompare(b.runner.runnerId));
  const ranks = new Map<string, number>();
  let previous: number | null = null;
  let rank = 0;
  sorted.forEach((entry, index) => {
    if (entry.value !== previous) rank = index + 1;
    ranks.set(entry.runner.runnerId, rank);
    previous = entry.value;
  });
  return ranks;
}

function hasResult(race: TodayRace) {
  return Boolean(race.winningTime) || race.runners.some((runner) => runner.finishingPosition !== null ||
    (runner.resultStatus !== null && runner.resultStatus !== "non_runner"));
}

export function buildTodaysRatingWeightObservations(input: {
  meetings: TodayMeeting[]; raceDate: string; priorByRunner: ReadonlyMap<string, PriorTurfPerformance>; recordedAt?: Date;
}): TodaysRatingWeightObservation[] {
  const now = input.recordedAt ?? new Date();
  if (!Number.isFinite(now.getTime()) || now < new Date(TODAYS_RATING_WEIGHT_FORWARD_EPOCH) || input.raceDate !== getLocalRacingDate(now)) return [];
  return input.meetings.flatMap((meeting) => meeting.races.flatMap((race) => {
    const off = race.raceDateTime;
    if (!isOrdinaryFlatTurfRaceForDisplay(race) || !off || !Number.isFinite(off.getTime()) || !race.scheduledTime ||
      now >= off || getLocalRacingDate(off) !== input.raceDate || hasResult(race)) return [];
    const scheduledTime = race.scheduledTime;
    const active = race.runners.filter((runner) => !isVoidBetResultStatus(runner.resultStatus));
    if (active.length < 2) return [];
    const todayRanks = descendingRanks(active, (runner) => turfForm(runner)?.todaysRating.latest ?? null);
    const latestRanks = descendingRanks(active, (runner) => turfForm(runner)?.speed.latest ?? null);
    const bestRanks = descendingRanks(active, (runner) => turfForm(runner)?.speed.bestLast3 ?? null);
    const latestLeaders = active.filter((runner) => latestRanks.get(runner.runnerId) === 1);
    return active.flatMap((runner): TodaysRatingWeightObservation[] => {
      if (todayRanks.get(runner.runnerId) !== 1) return [];
      const form = turfForm(runner)!;
      const rating = form.todaysRating.latest;
      const prior = input.priorByRunner.get(runner.runnerId);
      const weight = runner.weightCarriedLbs;
      if (!finite(rating) || !finite(weight) || weight <= 0 || !prior || !finite(prior.weightCarriedLbs) ||
        prior.weightCarriedLbs <= 0 || !finite(prior.speed) || !Number.isFinite(Date.parse(prior.raceDateTime)) ||
        new Date(prior.raceDateTime) >= now || new Date(prior.raceDateTime) >= off) return [];
      const performance = calculateWeightAdjustedPerformance({ rawSpeedRating: prior.speed, weightCarriedLb: prior.weightCarriedLbs });
      const reconstructed = calculateTodaysRating({ historicalPerformanceRating: performance?.performanceRating ?? null,
        currentWeightCarriedLb: weight })?.todaysRating;
      if (reconstructed === undefined || Math.abs(reconstructed - rating) > 0.000001) return [];
      const change = weight - prior.weightCarriedLbs;
      const band = lighterWeightBand(change);
      if (band === null) return [];
      const market = marketSnapshot(runner, now);
      return [{ raceDate: input.raceDate, raceId: race.raceId, sourceId: race.sourceId,
        scheduledOff: off.toISOString(), scheduledTime, course: meeting.courseName,
        horseId: runner.horseId, horseName: runner.horseName, runnerId: runner.runnerId,
        recordedAt: now.toISOString(), recordedPreRace: true, ratingVersion: TODAYS_RATING_CALCULATION_VERSION,
        todaysRating: rating, latestSpeed: form.speed.latest, bestL3Speed: form.speed.bestLast3, avgL3Speed: form.speed.averageLast3,
        tpr: runner.turfPerformanceRating?.rating ?? null, todayWeight: weight, priorRun: { ...prior },
        signedWeightChange: change, weightBand: band, todaysRatingRank: 1, latestSpeedRank: latestRanks.get(runner.runnerId) ?? null,
        bestL3Rank: bestRanks.get(runner.runnerId) ?? null, tprRank: runner.turfPerformanceRating?.rank ?? null,
        latestSpeedLeaders: latestLeaders.map((leader) => ({ runnerId: leader.runnerId, horseId: leader.horseId, horseName: leader.horseName, outcome: null })),
        market: { qualifying: market, later: [], finalStoredPreRace: market.medianDecimal === null ? null : market },
        outcome: null, settledAt: null }];
    });
  }));
}

export function appendTodaysRatingWeightObservations(data: TodaysRatingWeightForwardData, candidates: TodaysRatingWeightObservation[]) {
  const seen = new Set(data.observations.map((row) => `${row.raceId}|${row.runnerId}`));
  const additions = candidates.filter((row) => {
    const key = `${row.raceId}|${row.runnerId}`;
    const capture = new Date(row.recordedAt);
    const off = new Date(row.scheduledOff);
    if (seen.has(key) || !row.recordedPreRace || !Number.isFinite(capture.getTime()) || !Number.isFinite(off.getTime()) ||
      capture < new Date(data.epoch) || capture >= off || row.raceDate !== getLocalRacingDate(capture) ||
      row.raceDate !== getLocalRacingDate(off) || row.todaysRatingRank !== 1 ||
      lighterWeightBand(row.signedWeightChange) !== row.weightBand || row.settledAt !== null || row.outcome !== null) return false;
    seen.add(key);
    return true;
  });
  return additions.length ? { ...data, observations: [...data.observations, ...additions] } : data;
}

function marketSnapshot(runner: TodayRunner, now: Date): WeightMarketSnapshot {
  const market = summarizeBookmakerMarket(runner.bookmakerQuotes);
  return { capturedAt: now.toISOString(), priceCapturedAt: market.decimalPrice === null ? null : now.toISOString(),
    source: "sporting_life_stored_bookmaker_median_at_capture_v1", marketPriceBasisVersion: FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION,
    medianDecimal: market.decimalPrice, impliedProbability: market.impliedProbability,
    bookmakerQuoteCount: market.quoteCount, bookmakerQuotes: market.quotes };
}

export function refreshTodaysRatingWeightMarkets(data: TodaysRatingWeightForwardData, races: ReadonlyMap<string, TodayRace>, now = new Date()) {
  let changed = false;
  const observations = data.observations.map((row) => {
    const race = races.get(row.raceId);
    const runner = race?.runners.find((runner) => runner.runnerId === row.runnerId);
    if (row.settledAt !== null || !race?.raceDateTime || !runner || isVoidBetResultStatus(runner.resultStatus) || hasResult(race) ||
      now >= race.raceDateTime || now >= new Date(row.scheduledOff) ||
      now <= new Date(row.market.later.at(-1)?.capturedAt ?? row.recordedAt)) return row;
    const snapshot = marketSnapshot(runner, now);
    if (snapshot.medianDecimal === null) return row;
    changed = true;
    return { ...row, market: { ...row.market, later: [...row.market.later, snapshot], finalStoredPreRace: snapshot } };
  });
  return changed ? { ...data, observations } : data;
}

export function pendingTodaysRatingWeightRaceIds(data: TodaysRatingWeightForwardData) {
  return [...new Set(data.observations.filter((row) => row.settledAt === null).map((row) => row.raceId))];
}

function canonicalOutcome(race: TodayRace, runner: TodayRunner, qualifyingPrice: number | null): WeightOutcome | null {
  if (isVoidBetResultStatus(runner.resultStatus)) {
    return { status: "void", resultStatus: runner.resultStatus, finishingPosition: runner.finishingPosition,
      won: null, deadHeatDivisor: 1, finalSp: null, qualifyingPriceProfitLoss: 0, finalSpProfitLoss: 0 };
  }
  if (!todayRaceHasConclusiveResult(race)) return null;
  const winners = race.runners.filter((candidate) => !isVoidBetResultStatus(candidate.resultStatus) && candidate.finishingPosition === 1);
  const outcomeFor = (candidate: TodayRunner) => ({ targetRaceId: race.raceId, targetRunnerId: candidate.runnerId,
    finishingPosition: candidate.finishingPosition, resultStatus: candidate.resultStatus,
    won: candidate.finishingPosition === 1 ? true : null, placed: null, startingPrice: candidate.odds,
    startingPriceDecimal: candidate.oddsDecimal, deadHeatDivisor: candidate.finishingPosition === 1 ? winners.length : 1 });
  if (race.runners.some((candidate) => !isVoidBetResultStatus(candidate.resultStatus) && settleSelection(outcomeFor(candidate)) === null)) return null;
  const outcome = outcomeFor(runner);
  const final = settleSelection(outcome);
  if (!final) return null;
  const qualifying = qualifyingPrice === null ? null : settleSelection({ ...outcome, startingPriceDecimal: String(qualifyingPrice) });
  return { status: "settled", resultStatus: runner.resultStatus, finishingPosition: runner.finishingPosition,
    won: runner.finishingPosition === 1, deadHeatDivisor: outcome.deadHeatDivisor, finalSp: final.settlementOddsDecimal,
    qualifyingPriceProfitLoss: qualifying?.profitLoss ?? null, finalSpProfitLoss: final.profitLoss };
}

export function updateTodaysRatingWeightSettlements(data: TodaysRatingWeightForwardData, races: ReadonlyMap<string, TodayRace>, now = new Date()) {
  let settled = 0;
  const observations = data.observations.map((row) => {
    if (row.settledAt !== null) return row;
    const race = races.get(row.raceId);
    const runner = race?.runners.find((runner) => runner.runnerId === row.runnerId);
    if (!race || !runner) return row;
    const outcome = canonicalOutcome(race, runner, row.market.qualifying.medianDecimal);
    if (!outcome) return row;
    const leaders = row.latestSpeedLeaders.map((leader) => {
      const result = race.runners.find((runner) => runner.runnerId === leader.runnerId);
      return { ...leader, outcome: result ? canonicalOutcome(race, result, null) : null };
    });
    if (outcome.status !== "void" && leaders.some((leader) => leader.outcome === null)) return row;
    settled++;
    return { ...row, outcome, latestSpeedLeaders: leaders, settledAt: now.toISOString() };
  });
  return { data: settled ? { ...data, observations } : data, settled };
}

export function summarizeTodaysRatingWeight(rows: TodaysRatingWeightObservation[]) {
  const settled = rows.filter((row) => row.outcome?.status === "settled");
  const priced = settled.filter((row) => row.market.qualifying.impliedProbability !== null && row.outcome?.qualifyingPriceProfitLoss !== null);
  const expected = priced.reduce((sum, row) => sum + row.market.qualifying.impliedProbability!, 0);
  const profit = priced.reduce((sum, row) => sum + row.outcome!.qualifyingPriceProfitLoss!, 0);
  const winners = settled.filter((row) => row.outcome?.won).length;
  const disagreement = rows.filter((row) => row.latestSpeedRank !== null && row.latestSpeedRank !== 1);
  const settledDisagreement = disagreement.filter((row) => row.outcome?.status === "settled");
  return { tracked: rows.length, settled: settled.length, voided: rows.filter((row) => row.outcome?.status === "void").length,
    pending: rows.filter((row) => row.settledAt === null).length, winners, strike: ratio(winners, settled.length),
    pricedSettled: priced.length, pricedWinners: priced.filter((row) => row.outcome?.won).length,
    expectedWinners: priced.length ? expected : null, ae: expected ? priced.filter((row) => row.outcome?.won).length / expected : null,
    profitLoss: priced.length ? profit : null, roi: ratio(profit, priced.length),
    averageQualifyingPrice: priced.length ? priced.reduce((sum, row) => sum + row.market.qualifying.medianDecimal!, 0) / priced.length : null,
    agreement: rows.filter((row) => row.latestSpeedRank === 1).length, disagreement: disagreement.length,
    comparisonUnavailable: rows.filter((row) => row.latestSpeedRank === null).length,
    settledDisagreement: settledDisagreement.length,
    todaysDisagreementWinners: settledDisagreement.filter((row) => row.outcome?.won).length,
    latestDisagreementWinners: settledDisagreement.filter((row) => row.latestSpeedLeaders.some((leader) => leader.outcome?.won)).length };
}

export function renderTodaysRatingWeightToday(data: TodaysRatingWeightForwardData, date: string) {
  const rows = data.observations.filter((row) => row.raceDate === date).sort((a, b) => a.scheduledOff.localeCompare(b.scheduledOff) || a.horseName.localeCompare(b.horseName));
  const lines = [`Today's Rating - Lighter Weight shadow: ${date}`, "Time | Course | Horse | Band | Today's Rating | Latest Speed rank | Qualifying median | Latest stored pre-race median"];
  for (const row of rows) lines.push([formatRaceTimeForDisplay({ raceDateTime: new Date(row.scheduledOff), scheduledTime: row.scheduledTime }),
    row.course, row.horseName, row.weightBand, number(row.todaysRating), row.latestSpeedRank ?? "-",
    number(row.market.qualifying.medianDecimal), number(row.market.finalStoredPreRace?.medianDecimal ?? null)].join(" | "));
  if (!rows.length) lines.push("No prospective qualifiers recorded for this date.");
  return lines.join("\n");
}

export function renderTodaysRatingWeightSummary(data: TodaysRatingWeightForwardData) {
  const lines = ["Today's Rating - Lighter Weight prospective SHADOW", `Epoch: ${data.epoch}`, `Data: ${TODAYS_RATING_WEIGHT_FORWARD_PATH}`,
    "Band | Tracked | Settled | Void | Pending | Winners | Strike | Priced settled | Exp wins | A/E | £1 P/L | ROI | Avg qualifying price | Agree | Disagree | Comparison missing | Settled disagree | Today's disagree wins | Latest disagree wins"];
  for (const band of [...TODAYS_RATING_WEIGHT_BANDS, "combined"] as const) {
    const summary = summarizeTodaysRatingWeight(data.observations.filter((row) => band === "combined" || row.weightBand === band));
    lines.push([band, summary.tracked, summary.settled, summary.voided, summary.pending, summary.winners, percent(summary.strike),
      summary.pricedSettled, number(summary.expectedWinners), number(summary.ae), number(summary.profitLoss), percent(summary.roi),
      number(summary.averageQualifyingPrice), summary.agreement, summary.disagreement, summary.comparisonUnavailable,
      summary.settledDisagreement, summary.todaysDisagreementWinners, summary.latestDisagreementWinners].join(" | "));
  }
  lines.push("A/E, P/L, ROI and average price use settled non-void selections with a qualifying bookmaker median. Missing qualifying prices are never filled retrospectively. Agreement includes tied Latest Speed leaders; disagreement winner counts are per tracked selection.",
    "Final stored pre-race median means the last observed pre-off snapshot, not a guaranteed closing price. No production model or VALUE qualification is changed.");
  return lines.join("\n");
}

function finite(value: number | null | undefined): value is number { return typeof value === "number" && Number.isFinite(value); }
function ratio(numerator: number, denominator: number) { return denominator ? numerator / denominator : null; }
function number(value: number | null) { return value === null ? "-" : value.toFixed(2); }
function percent(value: number | null) { return value === null ? "-" : `${(value * 100).toFixed(2)}%`; }
