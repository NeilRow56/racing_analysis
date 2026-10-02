import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { calculateAwDRatingCoverage, calculateAwRaceRatings } from "./aw-performance-rating";
import { isSupportedAllWeatherRace } from "./aw-speed-rating";
import { isVoidBetResultStatus, settleSelection } from "./backtest";
import {
  FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION, FORWARD_VALUE_PRICE_SNAPSHOT_SCHEDULE_VERSION,
  forwardValuePriceSnapshot, isCleanPhase2Observation, priceSnapshotStage, summarizeBookmakerMarket,
  type ForwardValuePriceSnapshot, type ForwardValueRecord,
} from "./forward-value";
import {
  AW_TISSUE_IMPLEMENTED_AT, AW_TISSUE_SCHEMA, AW_TISSUE_VERSION, predictAwTissue,
  type AwTissueBook, type AwTissueModel, type AwTissuePrediction,
} from "./aw-tissue-model";
import { formatRaceTimeForDisplay, type SportingLifeCurrentPrice, type TodayMeeting, type TodayRace } from "./todays-racing";
import type { createDbConnection } from "@/db";

export const AW_TISSUE_FORWARD_VERSION = "aw_tissue_forward_v1";
export const AW_TISSUE_FORWARD_PATH = "data/research/aw-tissue-forward-v1.json";
type Outcome = { resultStatus: string | null; finishingPosition: number | null; won: boolean | null; finalSp: number | null; deadHeatDivisor: number; finalSpProfitLoss: number | null };
export type AwTissueRunner = AwTissuePrediction & { horseId: string; horseName: string; outcome: Outcome | null };
export type AwTissueRace = Omit<AwTissueBook, "runners"> & {
  raceId: string; sourceId: string | null; raceDate: string; course: string; raceName: string | null;
  scheduledTime: string; scheduledOffAt: string; currentOffAt: string; fieldSize: number;
  recordedAt: string; recordedPreRace: boolean; modelVersion: string; featureSchemaVersion: string; modelHash: string;
  runners: AwTissueRunner[]; top1: string | null; top2: string[]; top3: string[];
  awDLeader: string | null; awALeader: string | null; awDCoverage: ReturnType<typeof calculateAwDRatingCoverage>;
  winners: string[]; settledAt: string | null; excludedReason: string | null;
  marketPriceBasisVersion: typeof FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION;
  priceSnapshotScheduleVersion: typeof FORWARD_VALUE_PRICE_SNAPSHOT_SCHEDULE_VERSION;
  prices: { early: ForwardValuePriceSnapshot | null; t180: ForwardValuePriceSnapshot | null; t60: ForwardValuePriceSnapshot | null };
  selectedPriceProfitLoss: { early: number | null; t180: number | null; t60: number | null; bestEarly: number | null; finalSp: number | null };
};
export type AwTissueForwardData = { version: string; modelVersion: string; featureSchemaVersion: string; implementedAt: string; races: AwTissueRace[] };

export function emptyAwTissueForward(): AwTissueForwardData {
  return { version: AW_TISSUE_FORWARD_VERSION, modelVersion: AW_TISSUE_VERSION, featureSchemaVersion: AW_TISSUE_SCHEMA, implementedAt: AW_TISSUE_IMPLEMENTED_AT, races: [] };
}

export async function loadAwTissueForward(path = AW_TISSUE_FORWARD_PATH): Promise<AwTissueForwardData> {
  try {
    const data = JSON.parse(await readFile(path, "utf8")) as AwTissueForwardData;
    if (data.version !== AW_TISSUE_FORWARD_VERSION || data.modelVersion !== AW_TISSUE_VERSION || data.featureSchemaVersion !== AW_TISSUE_SCHEMA || data.implementedAt !== AW_TISSUE_IMPLEMENTED_AT) throw new Error("Unsupported AW Tissue tracker");
    return data;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyAwTissueForward();
    throw error;
  }
}

export async function mutateAwTissueForward(mutation: (data: AwTissueForwardData) => AwTissueForwardData | Promise<AwTissueForwardData>, path = AW_TISSUE_FORWARD_PATH) {
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
    const original = await loadAwTissueForward(path);
    const updated = await mutation(original);
    if (JSON.stringify(updated) !== JSON.stringify(original)) {
      const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
      await writeFile(temporary, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
      await rename(temporary, path);
    }
    return updated;
  } finally { await rm(lock, { recursive: true, force: true }); }
}

export async function loadAwTissuePriorStarts(client: ReturnType<typeof createDbConnection>["client"], races: TodayRace[]): Promise<Map<string, number>> {
  const targets = races.flatMap((race) => race.raceDateTime ? race.runners.filter((r) => r.resultStatus !== "non_runner").map((runner) => ({ runner_id: runner.runnerId, horse_id: runner.horseId, cutoff: race.raceDateTime!.toISOString() })) : []);
  if (!targets.length) return new Map();
  const result = await client<Array<{ runnerId: string; raceName: string | null; raceType: string | null; courseName: string; going: string | null; surface: string | null }>>`
    with targets as (select * from jsonb_to_recordset(${JSON.stringify(targets)}::jsonb) as t(runner_id uuid, horse_id uuid, cutoff timestamptz))
    select t.runner_id as "runnerId", r.race_name as "raceName", r.race_type as "raceType", c.display_name as "courseName", r.going,
      si.payload #>> '{props,pageProps,race,race_summary,course_surface,surface}' as surface
    from targets t join race_runners rr on rr.horse_id = t.horse_id
    join races r on r.id = rr.race_id and r.race_datetime < t.cutoff
    join courses c on c.id = r.course_id
    left join source_imports si on si.source = r.source and si.source_id = r.source_id and si.source_type = 'full-result-next-data'
    where r.source = 'sporting_life' and rr.source = 'sporting_life'
      and (rr.result_status is not null or rr.finishing_position is not null)
      and lower(coalesce(rr.result_status, '')) not in ('non_runner','abandoned','cancelled','canceled','no_race','race_void','void','void_race')
  `;
  const counts = new Map(targets.map((t) => [t.runner_id, 0]));
  for (const row of result) if (isSupportedAllWeatherRace(row)) counts.set(row.runnerId, counts.get(row.runnerId)! + 1);
  return counts;
}

export function buildAwTissueRace(race: TodayRace, course: string, raceDate: string, starts: ReadonlyMap<string, number>, model: AwTissueModel, recordedAt = new Date()): AwTissueRace | null {
  const off = race.raceDateTime;
  if (!isSupportedAllWeatherRace({ ...race, courseName: course }) || !off || !race.scheduledTime ||
      !Number.isFinite(off.getTime()) || recordedAt < new Date(AW_TISSUE_IMPLEMENTED_AT) || off <= recordedAt ||
      race.winningTime || race.runners.some((r) => r.finishingPosition !== null || (r.resultStatus !== null && r.resultStatus !== "non_runner"))) return null;
  const book = predictAwTissue(race, starts, model);
  if (book.activeRunnerCount < 2) return null;
  const byId = new Map(race.runners.map((r) => [r.runnerId, r]));
  const inputs = race.runners.map((r) => ({ runnerId: r.runnerId, resultStatus: r.resultStatus, averageAwSpeedLast3: r.metrics?.averageAwSpeedLast3 ?? null, trainerPriorStrikeRate: r.trainerMetrics?.trainerPriorWinRate ?? null, jockeyPriorStrikeRate: r.jockeyMetrics?.jockeyPriorWinRate ?? null }));
  const ratings = calculateAwRaceRatings(inputs);
  const awDCoverage = calculateAwDRatingCoverage(inputs, ratings);
  const leader = (kind: "awD" | "awA") => [...ratings].filter(([, r]) => r[kind] !== null).sort((a, b) => a[1][kind]!.score - b[1][kind]!.score || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
  const ranked = [...book.runners].filter((r) => r.rank !== null).sort((a, b) => a.rank! - b.rank!);
  return {
    ...book, raceId: race.raceId, sourceId: race.sourceId, raceDate, course, raceName: race.raceName,
    scheduledTime: race.scheduledTime, scheduledOffAt: off.toISOString(), currentOffAt: off.toISOString(), fieldSize: book.activeRunnerCount,
    recordedAt: recordedAt.toISOString(), recordedPreRace: true, modelVersion: model.version, featureSchemaVersion: model.featureSchemaVersion, modelHash: model.checksum,
    runners: book.runners.map((p) => ({ ...p, horseId: byId.get(p.runnerId)!.horseId, horseName: byId.get(p.runnerId)!.horseName, outcome: null })),
    top1: ranked[0]?.runnerId ?? null, top2: ranked.slice(0, 2).map((r) => r.runnerId), top3: ranked.slice(0, 3).map((r) => r.runnerId),
    awDLeader: awDCoverage.ratingCoverageStatus === "eligible" ? leader("awD") : null, awALeader: leader("awA"), awDCoverage,
    winners: [], settledAt: null, excludedReason: book.predictedRunnerCount === 0 ? "prediction_unavailable" : null,
    marketPriceBasisVersion: FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION, priceSnapshotScheduleVersion: FORWARD_VALUE_PRICE_SNAPSHOT_SCHEDULE_VERSION,
    prices: { early: null, t180: null, t60: null },
    selectedPriceProfitLoss: { early: null, t180: null, t60: null, bestEarly: null, finalSp: null },
  };
}

export function captureAwTissueRaces(data: AwTissueForwardData, races: AwTissueRace[]): AwTissueForwardData {
  const existing = new Set(data.races.map((r) => r.raceId));
  const additions: AwTissueRace[] = [];
  for (const race of races) {
    if (existing.has(race.raceId) || !race.recordedPreRace || race.recordedAt < AW_TISSUE_IMPLEMENTED_AT || race.recordedAt >= race.scheduledOffAt || race.settledAt !== null) continue;
    existing.add(race.raceId); additions.push(race);
  }
  return additions.length ? { ...data, races: [...data.races, ...additions] } : data;
}

export function enrichAwTissuePrices(record: AwTissueRace, race: TodayRace, capturedAt: Date): AwTissueRace {
  const off = race.raceDateTime;
  if (record.settledAt || !record.recordedPreRace || record.recordedAt < AW_TISSUE_IMPLEMENTED_AT || capturedAt.toISOString() < record.recordedAt ||
      !off || capturedAt >= off || race.winningTime || race.runners.some((r) => r.finishingPosition !== null)) return record;
  const leader = record.runners.find((r) => r.runnerId === record.top1);
  const current = race.runners.find((r) => r.runnerId === record.top1);
  if (!leader?.probability || !current || current.resultStatus === "non_runner") return record;
  const market = summarizeBookmakerMarket(current.bookmakerQuotes);
  if (market.decimalPrice === null || market.impliedProbability === null) return record;
  const snapshot: ForwardValuePriceSnapshot = {
    price: null, decimalPrice: market.decimalPrice, impliedProbability: market.impliedProbability,
    capturedAt: capturedAt.toISOString(), minutesBeforeScheduledOff: (off.getTime() - capturedAt.getTime()) / 60_000,
    ratingProbability: leader.probability, ratingEdgePercentagePoints: (leader.probability - market.impliedProbability) * 100,
    marketPriceBasisVersion: FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION,
    bookmakerQuoteCount: market.quoteCount, bookmakerQuotes: market.quotes,
    medianBookmakerPriceDecimal: market.decimalPrice, medianBookmakerImpliedProbability: market.impliedProbability,
    bestBookmakerPriceDecimal: market.bestDecimalPrice, bestBookmakerPriceFractional: market.bestFractionalPrice, bestBookmakerName: market.bestBookmakerName,
    forecastPrice: current.forecastOdds ?? null, forecastDecimalPrice: current.forecastDecimalOdds ?? null,
  };
  const stage = priceSnapshotStage(snapshot.minutesBeforeScheduledOff);
  const prices = { ...record.prices };
  let changed = false;
  if (!prices.early) { prices.early = snapshot; changed = true; }
  if (stage === "t180" && !prices.t180) { prices.t180 = snapshot; changed = true; }
  if (stage === "t60" && !prices.t60) { prices.t60 = snapshot; changed = true; }
  return changed ? { ...record, currentOffAt: off.toISOString(), prices } : record;
}

export function settleAwTissueRace(record: AwTissueRace, race: TodayRace, settledAt = new Date()): AwTissueRace {
  if (record.settledAt !== null || !record.recordedPreRace) return record;
  const byId = new Map(race.runners.map((r) => [r.runnerId, r]));
  if (record.runners.some((r) => !byId.has(r.runnerId))) return record;
  const started = race.runners.filter((r) => !isVoidBetResultStatus(r.resultStatus));
  if (race.actualRunnerCount === null || (race.actualRunnerCount !== started.length && race.actualRunnerCount !== race.runners.length)) return record;
  const winners = started.filter((r) => r.finishingPosition === 1);
  if (!winners.length || started.some((r) => settleSelection({ targetRaceId: race.raceId, targetRunnerId: r.runnerId, finishingPosition: r.finishingPosition, resultStatus: r.resultStatus, won: r.finishingPosition === 1 ? true : null, placed: null, startingPrice: null, startingPriceDecimal: "2" }) === null)) return record;
  const changedField = started.some((r) => !record.runners.some((frozen) => frozen.runnerId === r.runnerId));
  const runners = record.runners.map((runner): AwTissueRunner => {
    const result = byId.get(runner.runnerId)!;
    const voided = isVoidBetResultStatus(result.resultStatus);
    const won = voided ? null : result.finishingPosition === 1;
    const outcome = { targetRaceId: race.raceId, targetRunnerId: runner.runnerId, finishingPosition: result.finishingPosition, resultStatus: result.resultStatus, won, placed: null, startingPrice: result.odds, startingPriceDecimal: result.oddsDecimal, deadHeatDivisor: won ? winners.length : 1 };
    const settlement = settleSelection(outcome);
    const finalSp = settlement?.settlementOddsDecimal ?? null;
    return { ...runner, outcome: { finishingPosition: result.finishingPosition, resultStatus: result.resultStatus, won, finalSp, deadHeatDivisor: won ? winners.length : 1, finalSpProfitLoss: settlement?.profitLoss ?? null } };
  });
  const leader = runners.find((r) => r.runnerId === record.top1);
  const pricedProfit = (price: number | null | undefined) => {
    if (price == null || !leader?.outcome) return null;
    const outcome = leader.outcome;
    return settleSelection({ targetRaceId: race.raceId, targetRunnerId: leader.runnerId, finishingPosition: outcome.finishingPosition,
      resultStatus: outcome.resultStatus, won: outcome.won, placed: null, startingPrice: null, startingPriceDecimal: String(price), deadHeatDivisor: outcome.deadHeatDivisor })?.profitLoss ?? null;
  };
  return { ...record, runners, winners: winners.map((r) => r.runnerId), settledAt: settledAt.toISOString(), excludedReason: changedField ? "field_changed_after_capture" : record.excludedReason,
    selectedPriceProfitLoss: { early: pricedProfit(record.prices.early?.decimalPrice), t180: pricedProfit(record.prices.t180?.decimalPrice),
      t60: pricedProfit(record.prices.t60?.decimalPrice), bestEarly: pricedProfit(record.prices.early?.bestBookmakerPriceDecimal), finalSp: leader?.outcome?.finalSpProfitLoss ?? null },
  };
}

export function updateAwTissueForward(data: AwTissueForwardData, currentById: ReadonlyMap<string, TodayRace>, capturedAt: Date): AwTissueForwardData {
  const races = data.races.map((r) => { const current = currentById.get(r.raceId); return current ? settleAwTissueRace(enrichAwTissuePrices(r, current, capturedAt), current, capturedAt) : r; });
  return races.every((r, i) => r === data.races[i]) ? data : { ...data, races };
}

const mean = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const percentage = (n: number | null) => n === null ? "-" : `${(n * 100).toFixed(2)}%`;
const number = (n: number | null) => n === null ? "-" : n.toFixed(4);
const percentage1 = (n: number) => `${(n * 100).toFixed(1)}%`;
const signedPp1 = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}pp`;
export function cleanAwTissueRace(race: AwTissueRace): boolean { return race.recordedPreRace && race.recordedAt >= AW_TISSUE_IMPLEMENTED_AT && race.recordedAt < race.scheduledOffAt && race.excludedReason === null && race.predictedRunnerCount === race.activeRunnerCount; }

export function summarizeAwTissueForward(data: AwTissueForwardData) {
  const clean = data.races.filter(cleanAwTissueRace), settled = clean.filter((r) => r.settledAt !== null);
  const capture = (n: number) => mean(settled.filter((r) => r.runners.some((runner) => runner.rank !== null && runner.rank <= n && runner.outcome?.won !== null)).map((r) => r.runners.some((runner) => runner.rank !== null && runner.rank <= n && runner.outcome?.won === true) ? 1 : 0));
  // Void runners have no label; probabilities remain exactly as captured, never renormalised.
  const observations = settled.flatMap((r) => r.runners.filter((runner) => runner.outcome?.won != null && runner.probability !== null));
  const calibration = [["<5%", 0, .05], ["5-9.99%", .05, .1], ["10-14.99%", .1, .15], ["15-19.99%", .15, .2], ["20-29.99%", .2, .3], ["30%+", .3, 1.01]].map(([band, low, high]) => {
    const rows = observations.filter((r) => r.probability! >= (low as number) && r.probability! < (high as number));
    return { band: band as string, runners: rows.length, meanPredicted: mean(rows.map((r) => r.probability!)), actualStrike: mean(rows.map((r) => r.outcome!.won ? 1 : 0)) };
  });
  const probabilityRaces = settled.filter((r) => r.runners.every((runner) => runner.outcome?.won != null));
  const logLoss = mean(probabilityRaces.map((r) => -Math.log(Math.max(r.runners.filter((runner) => runner.outcome!.won).reduce((sum, runner) => sum + runner.probability!, 0), 1e-12))));
  const brier = mean(probabilityRaces.map((r) => r.runners.reduce((sum, runner) => sum + (runner.probability! - (runner.outcome!.won ? 1 / r.winners.length : 0)) ** 2, 0)));
  const common = settled.filter((r) => r.top1 !== null && r.awDLeader !== null && r.runners.find((runner) => runner.runnerId === r.top1)?.outcome?.won != null && r.runners.find((runner) => runner.runnerId === r.awDLeader)?.outcome?.won != null);
  const comparison = [true, false].map((same) => {
    const races = common.filter((r) => (r.top1 === r.awDLeader) === same);
    const wins = (r: AwTissueRace, leader: string | null) => r.runners.find((runner) => runner.runnerId === leader)?.outcome?.won === true;
    return { sameLeader: same, races: races.length, tissueWinners: races.filter((r) => wins(r, r.top1)).length, awDWinners: races.filter((r) => wins(r, r.awDLeader)).length, both: races.filter((r) => wins(r, r.top1) && wins(r, r.awDLeader)).length, neither: races.filter((r) => !wins(r, r.top1) && !wins(r, r.awDLeader)).length };
  });
  return { racesTracked: data.races.length, cleanPreRace: clean.length, pending: clean.filter((r) => r.settledAt === null).length, settled: settled.length, excluded: data.races.length - clean.length, top1: capture(1), top2: capture(2), top3: capture(3), logLoss, brier, probabilityRaces: probabilityRaces.length, calibration, comparison, commonRaces: common.length,
    tissueCommonStrike: mean(common.map((r) => r.runners.find((runner) => runner.runnerId === r.top1)!.outcome!.won ? 1 : 0)),
    awDCommonStrike: mean(common.map((r) => r.runners.find((runner) => runner.runnerId === r.awDLeader)!.outcome!.won ? 1 : 0)),
  };
}

export function renderAwTissueSummary(data: AwTissueForwardData) {
  const s = summarizeAwTissueForward(data);
  const zeroHistory = data.races.flatMap((race) => race.runners.filter((runner) => runner.zeroHistoryRunner));
  const unavailable = data.races.filter((race) => race.predictedRunnerCount !== race.activeRunnerCount);
  return ["AW Tissue Forward Summary", `Model: ${data.modelVersion} | schema: ${data.featureSchemaVersion}`, `Implementation epoch: ${data.implementedAt}`,
    `Tracked: ${s.racesTracked} | clean pre-race: ${s.cleanPreRace} | pending: ${s.pending} | settled: ${s.settled} | excluded/post-race: ${s.excluded}`,
    `Prediction coverage: ${data.races.reduce((sum, race) => sum + race.predictedRunnerCount, 0)}/${data.races.reduce((sum, race) => sum + race.activeRunnerCount, 0)} runners | incomplete books: ${unavailable.length}`,
    `Zero prior AW starts: ${zeroHistory.length} runners | predictions available: ${zeroHistory.filter((runner) => runner.predictionAvailable).length}`,
    `Top-1: ${percentage(s.top1)} | top-2: ${percentage(s.top2)} | top-3: ${percentage(s.top3)}`,
    `Log loss: ${number(s.logLoss)} | race Brier: ${number(s.brier)} | full-field probability races: ${s.probabilityRaces}`,
    "Probability quality excludes fields with subsequent void runners; no probabilities are recomputed. Dead heats use winner probability mass for log loss and equal winner shares for Brier.",
    "Band | Runners | Mean predicted | Actual strike", ...s.calibration.map((b) => `${b.band} | ${b.runners} | ${percentage(b.meanPredicted)} | ${percentage(b.actualStrike)}`),
    "AW-D comparison: group | races | Tissue winners | AW-D winners | both | neither",
    ...s.comparison.map((c) => `${c.sameLeader ? "same leader" : "different leader"} | ${c.races} | ${c.tissueWinners} | ${c.awDWinners} | ${c.both} | ${c.neither}`),
    `Common clean races: ${s.commonRaces} | AW Tissue top-1 ${percentage(s.tissueCommonStrike)} | AW-D top-1 ${percentage(s.awDCommonStrike)}`,
    "AW-T1 comments shadow: deferred. Small prospective samples do not establish superiority or define betting rules.",
  ].join("\n");
}

export type AwTissueRankOnePriceEdge = {
  race: AwTissueRace;
  runner: AwTissueRunner;
  price: SportingLifeCurrentPrice;
  impliedProbability: number;
  edge: number;
};

export function currentPositiveAwTissueRankOneEdges(
  races: AwTissueRace[],
  currentPrices: SportingLifeCurrentPrice[] = [],
): { selections: AwTissueRankOnePriceEdge[]; comparableRaces: number } {
  const priceByRunner = new Map(currentPrices.map((price) => [`${price.raceId}|${price.runnerId}`, price]));
  let comparableRaces = 0;
  const selections: AwTissueRankOnePriceEdge[] = [];
  for (const race of races) {
    const runner = race.runners.find((candidate) => candidate.runnerId === race.top1);
    if (!runner || runner.probability === null) continue;
    const price = priceByRunner.get(`${race.raceId}|${runner.runnerId}`);
    if (!price || price.bookmakerQuoteCount <= 0 || price.marketDecimalOdds === null || !Number.isFinite(price.marketDecimalOdds) || price.marketDecimalOdds <= 1 || !price.marketPrice?.trim()) continue;
    comparableRaces += 1;
    const impliedProbability = 1 / price.marketDecimalOdds;
    const edge = runner.probability - impliedProbability;
    if (edge > 0) selections.push({ race, runner, price, impliedProbability, edge });
  }
  return { selections, comparableRaces };
}

export function renderAwTissueToday(
  data: AwTissueForwardData,
  date: string,
  currentPrices: SportingLifeCurrentPrice[] = [],
) {
  const races = data.races.filter((r) => r.raceDate === date && r.recordedPreRace);
  const sortedRaces = races.sort((a, b) => a.currentOffAt.localeCompare(b.currentOffAt));
  const positiveEdges = currentPositiveAwTissueRankOneEdges(sortedRaces, currentPrices);
  const displayRaceTime = (race: AwTissueRace) => formatRaceTimeForDisplay({ raceDateTime: new Date(race.currentOffAt), scheduledTime: race.scheduledTime });
  return [`AW Tissue (diagnostic) - ${date}`, ...(sortedRaces.length ? sortedRaces.flatMap((r) => {
    const name = (runnerId: string | null) => r.runners.find((runner) => runner.runnerId === runnerId)?.horseName ?? "-";
    return [`${displayRaceTime(r)} ${r.course} - ${r.raceName ?? "Race"}`,
      ...r.top3.map((runnerId) => { const runner = r.runners.find((p) => p.runnerId === runnerId)!; return `  ${runner.rank}. ${runner.horseName} ${percentage(runner.probability)}`; }),
      `  AW-D: ${name(r.awDLeader)} | same leader: ${r.awDLeader && r.top1 ? r.awDLeader === r.top1 ? "yes" : "no" : "-"} | predictions: ${r.predictedRunnerCount}/${r.activeRunnerCount} (${percentage(r.predictionCoverage)})`,
      ...(r.excludedReason ? [`  Unavailable: ${r.excludedReason}`] : [])];
  }) : ["No prospective AW races recorded for this date."]),
  "",
  "Current positive-edge AW Tissue rank-1 horses",
  ...(positiveEdges.selections.length > 0 ? positiveEdges.selections.flatMap(({ race, runner, price, impliedProbability, edge }) => [
    `${price.displayRaceTime || displayRaceTime(race)} ${race.course} | ${runner.horseName}`,
    `Tissue ${percentage1(runner.probability!)} | Market ${price.marketPrice!.trim()} | Implied ${percentage1(impliedProbability)} | Edge ${signedPp1(edge * 100)} | Quotes ${price.bookmakerQuoteCount}${edge * 100 >= 10 - 1e-9 ? " | LARGE" : ""}`,
    "",
  ]).slice(0, -1) : ["None"]),
  "",
  `Positive-edge rank-1 horses: ${positiveEdges.selections.length} / comparable races ${positiveEdges.comparableRaces}`].join("\n").trimEnd();
}

export function awTissueValueAgreement(data: AwTissueForwardData, ratings: ForwardValueRecord[]) {
  const byId = new Map(ratings.filter((r) => r.family === "aw" && r.recordedAt >= AW_TISSUE_IMPLEMENTED_AT && isCleanPhase2Observation(r) && r.marketPriceBasisVersion === FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION).map((r) => [r.raceId, r]));
  const rows = data.races.filter(cleanAwTissueRace).flatMap((race) => {
    const rating = byId.get(race.raceId);
    if (!rating || race.top1 === null) return [];
    const stage = race.prices.t60 && forwardValuePriceSnapshot(rating, "t60") ? "t60" : race.prices.t180 && forwardValuePriceSnapshot(rating, "t180") ? "t180" : "early";
    const tissuePrice = race.prices[stage], ratingPrice = forwardValuePriceSnapshot(rating, stage);
    if (!tissuePrice || !ratingPrice || ratingPrice.marketPriceBasisVersion !== FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION || ratingPrice.capturedAt < AW_TISSUE_IMPLEMENTED_AT) return [];
    return [{ same: race.top1 === rating.leaderRunnerId, tissuePositive: tissuePrice.ratingEdgePercentagePoints > 0, ratingPositive: ratingPrice.ratingEdgePercentagePoints > 0 }];
  });
  return { comparable: rows.length, sameLeader: rows.filter((r) => r.same).length, differentLeader: rows.filter((r) => !r.same).length,
    bothPositive: rows.filter((r) => r.tissuePositive && r.ratingPositive).length, awDPositiveOnly: rows.filter((r) => !r.tissuePositive && r.ratingPositive).length,
    tissuePositiveOnly: rows.filter((r) => r.tissuePositive && !r.ratingPositive).length, neitherPositive: rows.filter((r) => !r.tissuePositive && !r.ratingPositive).length };
}

export function renderAwTissueValue(data: AwTissueForwardData, ratings: ForwardValueRecord[], date?: string) {
  const a = awTissueValueAgreement(data, ratings);
  return ["AW Tissue / Forward Value (median_bookmaker_v1)", ...data.races.filter((r) => cleanAwTissueRace(r) && (!date || r.raceDate === date)).map((r) => {
    const leader = r.runners.find((runner) => runner.runnerId === r.top1)!;
    const p = r.prices.t60 ?? r.prices.t180 ?? r.prices.early;
    return `${r.raceDate} ${formatRaceTimeForDisplay({ raceDateTime: new Date(r.currentOffAt), scheduledTime: r.scheduledTime })} ${r.course} | ${leader.horseName} | probability ${percentage(leader.probability)} | median ${p?.decimalPrice.toFixed(2) ?? "-"} | implied ${percentage(p?.impliedProbability ?? null)} | edge ${p?.ratingEdgePercentagePoints.toFixed(2) ?? "-"}pp | best ${p?.bestBookmakerPriceDecimal?.toFixed(2) ?? "-"} | forecast ${p?.forecastPrice ?? "-"} | quotes ${p?.bookmakerQuoteCount ?? 0} | Early ${r.prices.early?.decimalPrice.toFixed(2) ?? "-"} | T-180 ${r.prices.t180?.decimalPrice.toFixed(2) ?? "-"} | T-60 ${r.prices.t60?.decimalPrice.toFixed(2) ?? "-"} | final SP ${leader.outcome?.finalSp?.toFixed(2) ?? "-"}`;
  }), `AW model agreement: comparable=${a.comparable} same=${a.sameLeader} different=${a.differentLeader} both_positive=${a.bothPositive} aw_d_positive_only=${a.awDPositiveOnly} tissue_positive_only=${a.tissuePositiveOnly} neither=${a.neitherPositive}`].join("\n");
}

export function attachAwTissueToMeetings(meetings: TodayMeeting[], data: AwTissueForwardData): TodayMeeting[] {
  const byId = new Map(data.races.map((r) => [r.raceId, r]));
  return meetings.map((meeting) => ({ ...meeting, races: meeting.races.map((race) => {
    const frozen = byId.get(race.raceId);
    if (!frozen) return race;
    return { ...race, runners: race.runners.map((runner) => ({ ...runner, awTissue: frozen.runners.find((r) => r.runnerId === runner.runnerId) })) };
  }) }));
}
