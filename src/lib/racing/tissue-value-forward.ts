import { captureIdentity, captureState, latestPreOffCaptures } from "./frozen-capture-selection";
import { captureProspectiveGoing } from "./prospective-going";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { summarizeBookmakerMarket } from "./forward-value";
import { getLocalRacingDate, type TodayRace } from "./todays-racing";
import { isVoidBetResultStatus, settleSelection } from "./backtest";
import { hasCompleteProspectiveField } from "./current-day-sync";
import { CANONICAL_SETTLEMENT_VERSION } from "./research-settlement-version";
import { normalizeCompleteMarket, calculateValueMetrics, valueCompetitionRanks, TISSUE_VALUE_FAMILIES } from "./tissue-value-metrics";
import { VALUE_MARKET_SOURCE } from "./turf-value-definition";
import { valueFamilyForRace } from "./tissue-value-family";
import type { ValueCohortConfig } from "./tissue-value-config";
import { buildValueRankPolicy, VALUE_RANK_VERSION, VALUE_RANK_EPOCH, VALUE_RANK_PRICE_CAP_EPOCH, VALUE_RANK_REJECTION_REASONS } from "./value-rank-v2";

const finite = z.number().finite();
const probability = finite.positive().max(1);
const rank = z.number().int().positive();
const timestamp = z.iso.datetime();
const outcomeSchema = z.object({
  settlementVersion: z.literal(CANONICAL_SETTLEMENT_VERSION), status: z.enum(["settled", "NR", "void"]), finishPosition: rank.nullable(), resultStatus: z.string().nullable(),
  winner: z.boolean().nullable(), deadHeatDivisor: rank, grossReturn: finite.nonnegative().nullable(), profitLoss: finite.nullable(), settledAt: timestamp,
}).strict();
const runnerSchema = z.object({
  runnerId: z.string().min(1), horseId: z.string().min(1), horseName: z.string().min(1),
  modelInputs: z.array(finite).min(1), probability, tissueRank: rank,
  marketPrice: finite.gt(1), rawMarketProbability: probability, marketProbability: probability, marketRank: rank,
  quotes: z.array(z.object({ bookmakerId: z.number().nullable(), bookmakerName: z.string().nullable(), fractionalOdds: z.string().nullable(), decimalOdds: finite.gt(1) }).strict()).min(1),
  fairOdds: finite.positive(), probabilityEdge: finite, modelMarketRatio: finite.positive(), expectedReturn: finite,
  valueRank: rank, probabilityEdgeRank: rank, modelMarketRatioRank: rank, outcome: outcomeSchema.nullable(),
}).strict();
const valueRankPolicySchema = z.object({
  version: z.literal(VALUE_RANK_VERSION), epoch: z.enum([VALUE_RANK_EPOCH, VALUE_RANK_PRICE_CAP_EPOCH]),
  legacyRankOne: z.array(z.object({
    runnerId: z.string().min(1), priorCareerRuns: z.number().int().nonnegative().nullable(),
    retained: z.boolean(), rejectionReason: z.enum(VALUE_RANK_REJECTION_REASONS).nullable(),
  }).strict()).min(1),
}).strict();
const raceSchema = z.object({
  goingRaw: z.string().nullable().optional(), goingCanonical: z.string().nullable().optional(),
  version: z.string().min(1), family: z.enum(TISSUE_VALUE_FAMILIES), raceId: z.string().min(1), sourceId: z.string().nullable(),
  raceDate: z.iso.date(), course: z.string().min(1), raceName: z.string().nullable(), scheduledOff: timestamp, capturedAt: timestamp,
  modelVersion: z.string().min(1), modelChecksum: z.string().regex(/^[a-f0-9]{64}$/), scorerVersion: z.string().min(1),
  featureSchemaVersion: z.string().min(1), featureNames: z.array(z.string()).min(1), featureCutoffAt: timestamp,
  marketSource: z.literal(VALUE_MARKET_SOURCE), marketBookSum: finite.positive(), declaredRunnerCount: rank,
  runners: z.array(runnerSchema).min(2),
  valueRankPolicy: valueRankPolicySchema.optional(),
}).strict();
const dataSchema = z.object({ version: z.string().min(1), epoch: z.string().min(1), races: z.array(raceSchema) }).strict();
export type TissueValueRace = z.infer<typeof raceSchema>;
export type TissueValueRunner = z.infer<typeof runnerSchema>;
export type TissueValueData = z.infer<typeof dataSchema>;
/** Includes every family and capture; settlements never need a new pre-race capture. */
export function pendingTissueValueRaceIds(datasets: readonly TissueValueData[]): string[] {
  return [...new Set(datasets.flatMap(d => d.races.filter(r => r.runners.some(x => x.outcome === null)).map(r => r.raceId)))];
}

export function emptyValueForward(config: ValueCohortConfig): TissueValueData { return { version: config.version, epoch: config.epoch, races: [] }; }

export function validValueCapture(row: TissueValueRace, config: ValueCohortConfig): boolean {
  const at = new Date(row.capturedAt), off = new Date(row.scheduledOff), cutoff = new Date(row.featureCutoffAt);
  if (!config.probabilityAvailable || row.version !== config.version || row.family !== config.family || row.modelVersion !== config.modelVersion || row.scorerVersion !== config.scorerVersion || row.featureSchemaVersion !== config.featureSchemaVersion ||
    row.capturedAt < config.epoch || cutoff < new Date(config.epoch) || cutoff > at || at >= off ||
    row.raceDate !== getLocalRacingDate(at) || row.raceDate !== getLocalRacingDate(off) ||
    JSON.stringify(row.featureNames) !== JSON.stringify(config.featureNames) || new Set(row.runners.map(r => r.runnerId)).size !== row.runners.length)
    return false;
  // A new policy is frozen only on new captures. Historical books must not gain V2 metadata.
  if (JSON.stringify(row.valueRankPolicy) !== JSON.stringify(buildValueRankPolicy(row))) return false;
  const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
  const close = (a: number, b: number) => Math.abs(a - b) <= 1e-10 * Math.max(1, Math.abs(a), Math.abs(b));
  if (!close(sum(row.runners.map(r => r.probability)), 1) || !close(sum(row.runners.map(r => r.marketProbability)), 1) ||
    !close(sum(row.runners.map(r => 1 / r.marketPrice)), row.marketBookSum)) return false;
  const tissue = nativeTissueRanks(row.runners, config);
  const market = valueCompetitionRanks(row.runners.map(r => r.marketPrice), false);
  const value = valueCompetitionRanks(row.runners.map(r => r.expectedReturn));
  const edge = valueCompetitionRanks(row.runners.map(r => r.probabilityEdge));
  const ratio = valueCompetitionRanks(row.runners.map(r => r.modelMarketRatio));
  return row.runners.every((r, i) => {
    const metrics = calculateValueMetrics(r.probability, r.marketPrice, r.marketProbability);
    return r.modelInputs.length === config.featureNames.length && close(r.rawMarketProbability, 1 / r.marketPrice) && close(r.marketProbability, r.rawMarketProbability / row.marketBookSum) &&
      summarizeBookmakerMarket(r.quotes).decimalPrice === r.marketPrice &&
      Object.entries(metrics).every(([key, v]) => close(r[key as keyof typeof metrics], v)) &&
      r.tissueRank === tissue[i] && r.marketRank === market[i] && r.valueRank === value[i] && r.probabilityEdgeRank === edge[i] && r.modelMarketRatioRank === ratio[i];
  });
}


export function settleValueForward(data: TissueValueData, results: ReadonlyMap<string, TodayRace>, now = new Date()): TissueValueData {
  if (!Number.isFinite(now.getTime())) return data;
  const races = data.races.map(book => {
    const race = results.get(book.raceId);
    if (!race || now < new Date(book.scheduledOff)) return book;
    const ids = new Set(race.runners.map(r => r.runnerId));
    if (ids.size !== race.runners.length || book.runners.some(r => !ids.has(r.runnerId))) return book;
    const starters = race.runners.filter(r => !isVoidBetResultStatus(r.resultStatus));
    const winners = starters.filter(r => r.finishingPosition === 1);
    const complete = winners.length > 0 && (race.actualRunnerCount === starters.length || race.actualRunnerCount === race.runners.length) && starters.every(r =>
      (r.finishingPosition === null || (Number.isInteger(r.finishingPosition) && r.finishingPosition >= 1 && r.finishingPosition <= starters.length)) &&
      settleSelection({ targetRaceId: race.raceId, targetRunnerId: r.runnerId, finishingPosition: r.finishingPosition, resultStatus: r.resultStatus, won: null, placed: null, startingPrice: null, startingPriceDecimal: "2" }) !== null);
    const runners = book.runners.map(row => {
      if (row.outcome) return row;
      const runner = race.runners.find(r => r.runnerId === row.runnerId)!;
      const base = { settlementVersion: CANONICAL_SETTLEMENT_VERSION, finishPosition: runner.finishingPosition, resultStatus: runner.resultStatus, settledAt: now.toISOString() };
      if (isVoidBetResultStatus(runner.resultStatus)) return { ...row, outcome: { ...base, status: runner.resultStatus!.trim().toLowerCase() === "non_runner" ? "NR" as const : "void" as const,
        winner: null, deadHeatDivisor: 1, grossReturn: null, profitLoss: null } };
      if (!complete) return row;
      const winner = runner.finishingPosition === 1, deadHeatDivisor = winner ? winners.length : 1;
      const settlement = settleSelection({ targetRaceId: race.raceId, targetRunnerId: row.runnerId, finishingPosition: runner.finishingPosition,
        resultStatus: runner.resultStatus, won: winner, placed: null, startingPrice: null, startingPriceDecimal: String(row.marketPrice), deadHeatDivisor });
      return settlement ? { ...row, outcome: { ...base, status: "settled" as const, winner, deadHeatDivisor, grossReturn: settlement.grossReturn, profitLoss: settlement.profitLoss } } : row;
    });
    return runners.every((r, i) => r === book.runners[i]) ? book : { ...book, runners };
  });
  return races.every((r, i) => r === data.races[i]) ? data : { ...data, races };
}


export async function loadValueForward(config: ValueCohortConfig, path = config.path): Promise<TissueValueData> {
  try {
    const data = dataSchema.parse(JSON.parse(await readFile(path, "utf8")));
    if (data.version !== config.version || data.epoch !== config.epoch || new Set(data.races.map(captureIdentity)).size !== data.races.length || data.races.some(r => !validValueCapture(r, config))) throw new Error("Invalid Tissue value capture");
    return data;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyValueForward(config);
    throw error;
  }
}

/** Locked, atomic persistence. Existing capture fields and outcomes cannot be rewritten. */
export async function mutateValueForward(config: ValueCohortConfig, mutate: (data: TissueValueData) => TissueValueData | Promise<TissueValueData>, path = config.path): Promise<TissueValueData> {
  const lock = `${resolve(path)}.lock`;
  await mkdir(dirname(lock), { recursive: true });
  const deadline = Date.now() + 30000;
  while (true) {
    try { await mkdir(lock); break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST" || Date.now() >= deadline) throw error;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
  let temporary: string | undefined;
  try {
    const before = await loadValueForward(config, path), snapshot = JSON.stringify(before);
    const after = dataSchema.parse(await mutate(structuredClone(before)));
    if (after.version !== config.version || after.epoch !== config.epoch) throw new Error("Value cohort mismatch");
    if (after.races.length < before.races.length) throw new Error("Cannot remove frozen Tissue value races");
    for (const [i, old] of before.races.entries()) {
      const next = after.races[i];
      const captures = (race: TissueValueRace) => ({ ...race, runners: race.runners.map(row => ({ ...row, outcome: null })) });
      if (JSON.stringify(captures(old)) !== JSON.stringify(captures(next)) || old.runners.some((row, j) => row.outcome !== null && JSON.stringify(row.outcome) !== JSON.stringify(next.runners[j].outcome)))
        throw new Error("Cannot rewrite frozen Tissue value observations");
    }
    if (after.races.some(r => !validValueCapture(r, config)) || new Set(after.races.map(captureIdentity)).size !== after.races.length || after.races.slice(before.races.length).some(r => r.runners.some(row => row.outcome !== null)))
      throw new Error("Invalid prospective Tissue value additions");
    if (JSON.stringify(after) !== snapshot) {
      temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
      await writeFile(temporary, JSON.stringify(after, null, 2) + "\n");
      await rename(temporary, path);
    }
    return after;
  } finally {
    if (temporary) await rm(temporary, { force: true });
    await rm(lock, { recursive: true, force: true });
  }
}

function nativeTissueRanks(rows: Array<{ probability: number; runnerId: string }>, config: ValueCohortConfig) {
  if (config.tissueTies === "competition") return valueCompetitionRanks(rows.map(r => r.probability));
  const order = [...rows].sort((a, b) => b.probability - a.probability || a.runnerId.localeCompare(b.runnerId));
  return rows.map(r => order.findIndex(other => other.runnerId === r.runnerId) + 1);
}

export type ValueModelBook = {
  modelVersion: string; modelChecksum: string; scorerVersion: string; featureSchemaVersion: string; featureNames: readonly string[];
  featureCutoffAt: string;
  runners: Array<{ runnerId: string; probability: number | null; tissueRank: number | null; modelInputs: number[] | null | undefined }>;
};

/** Accept probabilities only from the actual family scorer. Never infer or renormalize them. */
export function buildValueRace(input: {
  config: ValueCohortConfig; race: TodayRace; course: string; raceDate: string; capturedAt: Date; book: ValueModelBook;
}): TissueValueRace | null {
  const { config, race, book, capturedAt: now } = input;
  if (valueFamilyForRace(race) !== config.family || !config.probabilityAvailable || !Number.isFinite(now.getTime()) || now < new Date(config.epoch) ||
    input.raceDate !== getLocalRacingDate(now) || !race.raceDateTime || !Number.isFinite(race.raceDateTime.getTime()) || now >= race.raceDateTime ||
    getLocalRacingDate(race.raceDateTime) !== input.raceDate || !race.scheduledTime ||
    !hasCompleteProspectiveField({ ...race, actualRunnerCount: null }) || race.winningTime ||
    race.runners.some(r => r.finishingPosition !== null || (r.resultStatus !== null && r.resultStatus !== "non_runner"))) return null;
  const active = race.runners.filter(r => r.resultStatus !== "non_runner"), byId = new Map(book.runners.map(r => [r.runnerId, r]));
  if (active.length < 2 || book.runners.length !== active.length || byId.size !== active.length || active.some(r => !byId.has(r.runnerId)) ||
    book.runners.some(r => r.probability === null || !Number.isFinite(r.probability) || r.probability <= 0 || r.probability > 1 ||
      !Number.isFinite(1 / r.probability) || r.tissueRank === null || !Number.isInteger(r.tissueRank) || r.tissueRank < 1 ||
      !r.modelInputs || r.modelInputs.length !== config.featureNames.length || r.modelInputs.some(v => !Number.isFinite(v))) ||
    Math.abs(book.runners.reduce((sum, r) => sum + r.probability!, 0) - 1) > 1e-10) return null;
  const markets = active.map(r => summarizeBookmakerMarket(r.bookmakerQuotes));
  if (markets.some(m => m.decimalPrice === null || !Number.isFinite(m.decimalPrice))) return null;
  const normalized = normalizeCompleteMarket(markets.map(m => m.decimalPrice));
  if (!normalized) return null;
  const total = normalized.total;
  const runners = active.map((runner, i) => {
    const model = byId.get(runner.runnerId)!, market = markets[i], price = market.decimalPrice!, q = normalized.probabilities[i];
    return { runnerId: runner.runnerId, horseId: runner.horseId, horseName: runner.horseName, modelInputs: [...model.modelInputs!],
      probability: model.probability!, tissueRank: model.tissueRank!, marketPrice: price, rawMarketProbability: 1 / price, marketProbability: q,
      marketRank: 1 + markets.filter(m => m.decimalPrice! < price).length, quotes: market.quotes,
      ...calculateValueMetrics(model.probability!, price, q), valueRank: 0, probabilityEdgeRank: 0, modelMarketRatioRank: 0, outcome: null };
  });
  const values = valueCompetitionRanks(runners.map(r => r.expectedReturn)), edges = valueCompetitionRanks(runners.map(r => r.probabilityEdge)), ratios = valueCompetitionRanks(runners.map(r => r.modelMarketRatio));
  runners.forEach((r, i) => { r.valueRank = values[i]; r.probabilityEdgeRank = edges[i]; r.modelMarketRatioRank = ratios[i]; });
  const valueRankPolicy = buildValueRankPolicy({ family: config.family, capturedAt: now.toISOString(), featureNames: book.featureNames, runners });
  const parsed = raceSchema.safeParse({ version: config.version, family: config.family, raceId: race.raceId, sourceId: race.sourceId,
    raceDate: input.raceDate, course: input.course, raceName: race.raceName, scheduledOff: race.raceDateTime.toISOString(), capturedAt: now.toISOString(),
    ...book, ...captureProspectiveGoing(race.going, now, config.family === "AW"), runners, marketSource: VALUE_MARKET_SOURCE, marketBookSum: total, declaredRunnerCount: race.declaredRunnerCount,
    ...(valueRankPolicy ? { valueRankPolicy } : {}) });
  return parsed.success && validValueCapture(parsed.data, config) ? parsed.data : null;
}

export function appendValueForward(data: TissueValueData, races: TissueValueRace[], config: ValueCohortConfig, forceRefresh = false, now = new Date()): TissueValueData {
  if (data.version !== config.version || data.epoch !== config.epoch) throw new Error("Value cohort mismatch");
  const known = new Set(data.races.map(r => r.raceId));
  const identities = new Set(data.races.map(captureIdentity));
  const states = new Map(latestPreOffCaptures(data.races).map(r => [r.raceId, captureState(r)]));
  const additions = races.filter(r => {
    if ((!forceRefresh && known.has(r.raceId)) || identities.has(captureIdentity(r)) || states.get(r.raceId) === captureState(r) ||
      (forceRefresh && (Date.parse(r.capturedAt) > now.getTime() || now.getTime() >= Date.parse(r.scheduledOff) || getLocalRacingDate(now) !== r.raceDate)) || !raceSchema.safeParse(r).success || !validValueCapture(r, config) || r.runners.some(row => row.outcome !== null)) return false;
    known.add(r.raceId); identities.add(captureIdentity(r)); states.set(r.raceId, captureState(r)); return true;
  });
  return additions.length ? { ...data, races: [...data.races, ...structuredClone(additions)] } : data;
}
