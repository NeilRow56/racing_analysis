import { readFile } from "node:fs/promises";
import { z } from "zod";
import { AW_PROFIT_V1, AW_PROFIT_V3, selectAwProfitShadow } from "./aw-profit-policy";
import { settleSelection } from "./backtest";
import { descendingRanks } from "./descending-ranks";
import { summarizeBookmakerMarket } from "./forward-value";
import { mutateFrozenJson } from "./frozen-json-store";
import { CANONICAL_SETTLEMENT_VERSION } from "./research-settlement-version";
import { isVoidRaceOutcome, settlementOutcomeState } from "./settlement-outcome";
import { GENERATION_MODEL_HASHES } from "./tissue-generation-config";
import { frozenNumeric } from "./tissue-generation-features";
import { generationRaceSchema, validGenerationCapture, type GenerationRace } from "./tissue-generation-forward";
import { GENERATION_MODEL_VERSIONS } from "./tissue-generation-model";
import { parseSportingLifeEstimatedPrice } from "./tissue-forward";
import { getLocalRacingDate, type TodayRace } from "./todays-racing";

export const AW_PROFIT_SHADOW_PATH = "data/research/aw-profit-shadow-v1.json";
const ledgerVersion = "aw_profit_shadow_v1";
const preOff = new Set(["DORMANT", "PRE_RACE", "PARADING", "GOINGDOWN", "GOINGBEHIND", "ATTHEPOST"]);
const finalStages = new Set(["WEIGHEDIN", "OFFICIAL", "COMPLETED"]);
const latestPerformance = "latest_performance", bestL3Speed = "best_l3_turf_speed";
const timestamp = z.iso.datetime(), rank = z.number().int().positive();
const quote = generationRaceSchema.shape.runners.element.shape.quotes.element;
const runnerSchema = z.object({
  runnerId: z.string(), horseId: z.string(), horseName: z.string(), rank,
  probability: z.number().positive().max(1),
  latestPerformance: z.number().finite().nullable(), performanceRank: rank.nullable(),
  bestL3Speed: z.number().finite().nullable(),
  medianBookmakerDecimal: z.number().finite().gt(1).nullable(), quotes: z.array(quote),
}).strict();
const version = z.literal(CANONICAL_SETTLEMENT_VERSION);
const outcomeSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("settled"), settlementVersion: version, settledAt: timestamp,
    startingPrice: z.string().nullable(), decimalSP: z.number().finite().gt(1), won: z.boolean(), deadHeatDivisor: rank,
    stake: z.literal(1), grossReturn: z.number().finite(), profitLoss: z.number().finite() }).strict(),
  z.object({ status: z.enum(["NR", "void"]), settlementVersion: version, settledAt: timestamp }).strict(),
]);
const observationSchema = z.object({
  raceId: z.string(), raceDate: z.iso.date(), course: z.string(), sourceId: z.string(),
  scheduledOff: timestamp, sourceCapturedAt: timestamp, featureCutoffAt: timestamp, decidedAt: timestamp,
  sourceStage: z.string(), modelVersion: z.literal(GENERATION_MODEL_VERSIONS.AW),
  modelHash: z.literal(GENERATION_MODEL_HASHES.AW), marketSource: generationRaceSchema.shape.marketSource,
  completeMarket: z.boolean(), runners: z.array(runnerSchema).min(2),
  picks: z.object({ AW_TISSUE_V3: z.string(), [AW_PROFIT_V1]: z.string().nullable(),
    [AW_PROFIT_V3]: z.string().nullable() }).strict(),
  outcomes: z.record(z.string(), outcomeSchema),
}).strict();
const ledgerSchema = z.object({
  version: z.literal(ledgerVersion), armedAt: timestamp, races: z.array(observationSchema),
}).strict();
type Ledger = z.infer<typeof ledgerSchema>;
type Observation = z.infer<typeof observationSchema>;
type FinalPrice = { fractional: string; decimal: number };
export type AwProfitResult = { race: TodayRace; prices: ReadonlyMap<string, FinalPrice> };

const byRaceId = <T extends { raceId: string }>(races: readonly T[]) => new Map(races.map(r => [r.raceId, r]));
const ms = Date.parse;
function picksFor(runners: readonly z.infer<typeof runnerSchema>[]): Observation["picks"] {
  const { t1, v1, v3 } = selectAwProfitShadow(runners);
  if (!t1) throw new Error("Missing original AW Tissue rank one");
  return { AW_TISSUE_V3: t1.runnerId, [AW_PROFIT_V1]: v1?.runnerId ?? null, [AW_PROFIT_V3]: v3?.runnerId ?? null };
}
const pickIds = (r: Observation) => new Set(Object.values(r.picks).filter(id => id !== null));

function validLedger(data: Ledger) {
  return byRaceId(data.races).size === data.races.length && data.races.every(race => {
    const runners = race.runners;
    const ranks = descendingRanks(runners, r => r.latestPerformance);
    return ms(data.armedAt) <= ms(race.sourceCapturedAt) && ms(race.featureCutoffAt) <= ms(race.sourceCapturedAt) &&
      ms(race.sourceCapturedAt) <= ms(race.decidedAt) && ms(race.decidedAt) < ms(race.scheduledOff) &&
      getLocalRacingDate(new Date(race.decidedAt)) === race.raceDate && preOff.has(race.sourceStage) &&
      new Set(runners.map(r => r.runnerId)).size === runners.length &&
      runners.every((r, i) => r.rank === i + 1 && r.performanceRank === (ranks.get(r.runnerId) ?? null) &&
        r.medianBookmakerDecimal === summarizeBookmakerMarket(r.quotes).decimalPrice) &&
      race.completeMarket === runners.every(r => r.medianBookmakerDecimal !== null) &&
      JSON.stringify(race.picks) === JSON.stringify(picksFor(runners)) &&
      Object.entries(race.outcomes).every(([id, outcome]) => pickIds(race).has(id) && ms(outcome.settledAt) >= ms(race.scheduledOff));
  });
}

export async function loadAwProfitShadow(path = AW_PROFIT_SHADOW_PATH) {
  try {
    const data = ledgerSchema.parse(JSON.parse(await readFile(path, "utf8")));
    if (!validLedger(data)) throw new Error("Invalid AW profit shadow ledger");
    return data;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function mutateShadow(path: string, mutate: (data: Ledger | null) => Ledger) {
  return mutateFrozenJson<Ledger | null>(path, () => loadAwProfitShadow(path), value => ledgerSchema.parse(value), (before, after) => {
    if (!after || !validLedger(after)) throw new Error("Invalid AW profit shadow write");
    if (!before) return;
    if (after.armedAt !== before.armedAt || after.races.length < before.races.length) throw new Error("Cannot rewrite AW profit shadow history");
    for (const [i, old] of before.races.entries()) {
      const { outcomes: previous, ...frozen } = old;
      const { outcomes, ...current } = after.races[i];
      if (JSON.stringify(frozen) !== JSON.stringify(current) ||
          Object.entries(previous).some(([id, value]) => JSON.stringify(outcomes[id]) !== JSON.stringify(value))) {
        throw new Error("Cannot rewrite frozen AW profit shadow decisions or settlements");
      }
    }
  }, mutate);
}

export const initAwProfitShadow = (path = AW_PROFIT_SHADOW_PATH) =>
  mutateShadow(path, data => data ?? { version: ledgerVersion, armedAt: new Date().toISOString(), races: [] });

function buildObservation(book: GenerationRace, race: TodayRace, now: Date): Observation | null {
  const sourceStage = race.raceStage?.trim().toUpperCase() ?? "";
  if (book.family !== "AW" || !validGenerationCapture(book) || book.runners.some(r => r.outcome !== null) ||
    !race.sourceId || !preOff.has(sourceStage) || race.winningTime ||
    book.raceId !== race.raceId || race.raceDateTime?.getTime() !== ms(book.scheduledOff) ||
    now.getTime() >= ms(book.scheduledOff) || now.getTime() < ms(book.capturedAt) ||
    book.raceDate !== getLocalRacingDate(now) ||
    race.runners.some(r => r.finishingPosition !== null || (r.resultStatus !== null && r.resultStatus !== "non_runner"))) return null;
  const active = new Map(race.runners.filter(r => r.resultStatus !== "non_runner").map(r => [r.runnerId, r.horseId]));
  if (new Set(race.runners.map(r => r.runnerId)).size !== race.runners.length ||
    active.size !== book.runners.length || book.runners.some(r => active.get(r.runnerId) !== r.horseId)) return null;
  const names = book.featureNames;
  if (![latestPerformance, bestL3Speed].every(n => names.includes(n) && names.includes(n + "_missing"))) return null;
  const values = book.runners.map(r => ({
    runnerId: r.runnerId, horseId: r.horseId, horseName: r.horseName, rank: r.rank, probability: r.probability,
    latestPerformance: frozenNumeric(names, r.modelInputs, latestPerformance),
    bestL3Speed: frozenNumeric(names, r.modelInputs, bestL3Speed),
    medianBookmakerDecimal: summarizeBookmakerMarket(r.quotes).decimalPrice, quotes: r.quotes,
  })).sort((a, b) => a.rank - b.rank);
  const performance = descendingRanks(values, r => r.latestPerformance);
  const runners = values.map(r => ({ ...r, performanceRank: performance.get(r.runnerId) ?? null }));
  return { raceId: book.raceId, raceDate: book.raceDate, course: book.course, sourceId: race.sourceId,
    scheduledOff: book.scheduledOff, sourceCapturedAt: book.capturedAt, featureCutoffAt: book.featureCutoffAt,
    decidedAt: now.toISOString(), sourceStage, modelVersion: GENERATION_MODEL_VERSIONS.AW, modelHash: book.modelHash,
    marketSource: book.marketSource, completeMarket: book.completeMarket, runners, picks: picksFor(runners), outcomes: {} };
}

function requireArmed(data: Ledger | null) {
  if (!data) throw new Error("AW profit shadow is unarmed");
  return data;
}

/** Recheck the current time inside the write lock, after filtering to the current run. */
export function captureAwProfitShadow(books: readonly GenerationRace[], cards: ReadonlyMap<string, TodayRace>,
  since: Date, path = AW_PROFIT_SHADOW_PATH, clock = () => new Date()) {
  if (!Number.isFinite(since.getTime())) throw new Error("Invalid collection start");
  return mutateShadow(path, current => {
    const data = requireArmed(current);
    const candidates = [...books].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
    const existing = byRaceId(data.races);
    for (const book of candidates) {
      const card = cards.get(book.raceId);
      if (!card || existing.has(book.raceId) || ms(book.capturedAt) < Math.max(since.getTime(), ms(data.armedAt))) continue;
      const observation = buildObservation(book, card, clock());
      if (!observation) continue;
      data.races.push(observation);
      existing.set(book.raceId, observation);
    }
    return data;
  });
}

export function pendingAwProfitShadow(data: Ledger) {
  return data.races.filter(r => [...pickIds(r)].some(id => !r.outcomes[id])).map(r => r.raceId);
}

const rawResult = z.object({
  race_summary: z.object({ race_stage: z.string() }),
  rides: z.array(z.object({
    ride_reference: z.object({ id: z.union([z.string(), z.number()]).transform(String) }),
    finish_position: z.unknown(),
    betting: z.object({ current_odds: z.string().nullish() }).nullish(),
  })),
});

/** Bind exact fractional SP to its full-result ride and reconcile it to the stored result. */
export function awProfitResult(race: TodayRace, raw: unknown): AwProfitResult {
  const prices = new Map<string, FinalPrice>();
  const parsed = rawResult.safeParse(raw);
  const stage = race.raceStage?.trim().toUpperCase() ?? "";
  if (!parsed.success || !finalStages.has(stage) || parsed.data.race_summary.race_stage.trim().toUpperCase() !== stage ||
      parsed.data.rides.length !== race.runners.length) return { race, prices };
  const rides = new Map(parsed.data.rides.map(r => [r.ride_reference.id, r]));
  if (rides.size !== parsed.data.rides.length || new Set(race.runners.map(r => r.runnerSourceId)).size !== race.runners.length ||
      race.runners.some(r => !r.runnerSourceId || !rides.has(r.runnerSourceId))) return { race, prices };
  for (const runner of race.runners) {
    const ride = rides.get(runner.runnerSourceId!)!;
    const position = Number(ride.finish_position);
    const rawPosition = Number.isInteger(position) && position > 0 ? position : null;
    const fractional = ride.betting?.current_odds ?? null;
    const decimal = parseSportingLifeEstimatedPrice(fractional);
    const stored = Number(runner.oddsDecimal);
    if (rawPosition === runner.finishingPosition && fractional && decimal !== null && decimal > 1 &&
      Number.isFinite(stored) && Math.abs(decimal - stored) <= 0.0005000001) prices.set(runner.runnerId, { fractional, decimal });
  }
  return { race, prices };
}

function settleRace(book: Observation, { race, prices }: AwProfitResult, now: Date): Observation {
  if (!Number.isFinite(now.getTime()) || now.getTime() < ms(book.scheduledOff) ||
      race.raceId !== book.raceId || race.sourceId !== book.sourceId) return book;
  const stage = race.raceStage?.trim().toUpperCase() ?? "";
  const raceVoid = isVoidRaceOutcome({ raceStage: stage, finishingPosition: null, resultStatus: null });
  const result = new Map(race.runners.map(r => [r.runnerId, r]));
  if (result.size !== race.runners.length) return book;
  const evidence = new Map(race.runners.map(r => [r.runnerId, settlementOutcomeState({ ...r, raceStage: stage })]));
  const captured = new Map(book.runners.map(r => [r.runnerId, r.horseId]));
  const starters = race.runners.filter(r => evidence.get(r.runnerId) !== "NR");
  const winners = starters.filter(r => evidence.get(r.runnerId) === "win");
  const complete = finalStages.has(stage) && winners.length > 0 &&
    (race.actualRunnerCount === starters.length || race.actualRunnerCount === race.runners.length) &&
    book.runners.every(r => result.get(r.runnerId)?.horseId === r.horseId) &&
    starters.every(r => captured.get(r.runnerId) === r.horseId &&
      (r.finishingPosition === null || r.finishingPosition <= starters.length) &&
      ["win", "loss"].includes(evidence.get(r.runnerId)!));
  const outcomes = { ...book.outcomes };
  const meta = { settlementVersion: CANONICAL_SETTLEMENT_VERSION, settledAt: now.toISOString() };
  for (const id of pickIds(book)) {
    if (outcomes[id]) continue;
    const runner = result.get(id);
    const state = runner?.horseId === captured.get(id) ? evidence.get(id) : undefined;
    const price = prices.get(id);
    if (state === "NR" || raceVoid || (finalStages.has(stage) && state === "void")) {
      outcomes[id] = { ...meta, status: state === "NR" ? "NR" : "void" };
    } else if (complete && runner && price && (state === "win" || state === "loss")) {
      const won = state === "win", deadHeatDivisor = won ? winners.length : 1;
      const stake = settleSelection({ targetRaceId: book.raceId, targetRunnerId: id, ...runner, raceStage: stage,
        won, placed: null, startingPrice: price.fractional, startingPriceDecimal: String(price.decimal), deadHeatDivisor });
      if (stake) outcomes[id] = { ...meta, status: "settled", won, deadHeatDivisor, startingPrice: price.fractional,
        decimalSP: stake.settlementOddsDecimal, stake: 1, grossReturn: stake.grossReturn, profitLoss: stake.profitLoss };
    }
  }
  return { ...book, outcomes };
}

export function settleAwProfitShadow(results: ReadonlyMap<string, AwProfitResult>, path = AW_PROFIT_SHADOW_PATH, now = new Date()) {
  return mutateShadow(path, current => {
    const data = requireArmed(current);
    return { ...data, races: data.races.map(book => {
      const race = results.get(book.raceId);
      return race ? settleRace(book, race, now) : book;
    }) };
  });
}

export function summarizeAwProfitShadow(data: Ledger) {
  const policies = ["AW_TISSUE_V3", AW_PROFIT_V1, AW_PROFIT_V3] as const;
  return policies.map(policy => {
    let bets = 0, wins = 0, pending = 0, voids = 0, abstentions = 0, profitLoss = 0;
    for (const race of data.races) {
      const id = race.picks[policy];
      if (id === null) { abstentions++; continue; }
      const result = race.outcomes[id];
      if (!result) pending++;
      else if (result.status !== "settled") voids++;
      else { bets++; wins += Number(result.won); profitLoss += result.profitLoss; }
    }
    return { policy, races: data.races.length, bets, wins, pending, voids, abstentions, profitLoss,
      roiPercent: bets ? 100 * profitLoss / bets : null };
  });
}
