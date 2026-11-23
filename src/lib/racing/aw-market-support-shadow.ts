import { readFile } from "node:fs/promises";
import { z } from "zod";
import { type AwProfitResult } from "./aw-profit-shadow";
import { settleSelection } from "./backtest";
import { captureIdentity } from "./frozen-capture-selection";
import { mutateFrozenJson } from "./frozen-json-store";
import { CANONICAL_SETTLEMENT_VERSION } from "./research-settlement-version";
import { isVoidRaceOutcome, settlementOutcomeState } from "./settlement-outcome";
import { TISSUE_GENERATION, TISSUE_GENERATION_EPOCH } from "./tissue-generation-config";
import { generationRaceSchema, TISSUE_GENERATION_FORWARD_PATH, validGenerationCapture, type GenerationRace } from "./tissue-generation-forward";
import { getLocalRacingDate, type TodayRace } from "./todays-racing";

export const AW_MARKET_SUPPORT_POLICY = "AW_MARKET_SUPPORT_V1" as const;
export const AW_MARKET_SUPPORT_SHADOW_PATH = "data/research/aw-market-support-shadow-v1.json";
const preOffStages = ["DORMANT", "PRE_RACE", "PARADING", "GOINGDOWN", "GOINGBEHIND", "ATTHEPOST"] as const;
const finalStages = new Set(["WEIGHEDIN", "OFFICIAL", "COMPLETED"]);
const timestamp = z.iso.datetime();
const decisionSchema = z.object({
  runnerId: z.string().min(1),
  tissueRank: z.union([z.literal(1), z.literal(2)]),
  marketRank: z.number().int().positive().nullable(),
  decision: z.enum(["retain", "no-bet"]),
  reason: z.enum(["market-top-three", "market-rank-four-plus", "market-unverified"]),
}).strict();
type Decision = z.infer<typeof decisionSchema>;

/** Frozen capture ranks are the picks. Only prices within this same book can qualify them. */
export function decideAwMarketSupport(book: GenerationRace): Decision[] {
  const verified = validGenerationCapture(book);
  if (book.family !== "AW" || (!verified && !validGenerationCapture({
    ...book, completeMarket: false,
    runners: book.runners.map(r => ({ ...r, quotes: [], capturedPrice: null, marketProbability: null })),
  }))) throw new Error("Invalid frozen AW V3 capture");

  return ([1, 2] as const).map(tissueRank => {
    const runner = book.runners.find(r => r.rank === tissueRank)!;
    const marketRank = verified && book.completeMarket
      ? 1 + book.runners.filter(r => r.capturedPrice! < runner.capturedPrice!).length : null;
    return { runnerId: runner.runnerId, tissueRank, marketRank,
      decision: marketRank !== null && marketRank <= 3 ? "retain" : "no-bet",
      reason: marketRank === null ? "market-unverified" : marketRank <= 3 ? "market-top-three" : "market-rank-four-plus" };
  });
}

/** Validate the source envelope without treating inconsistent price metadata as a verified board. */
export async function loadAwMarketSupportCaptureBooks(path = TISSUE_GENERATION_FORWARD_PATH) {
  const envelope = z.object({ version: z.literal(TISSUE_GENERATION), epoch: z.literal(TISSUE_GENERATION_EPOCH),
    races: z.array(generationRaceSchema) }).strict();
  const { races } = envelope.parse(JSON.parse(await readFile(path, "utf8")));
  if (new Set(races.map(captureIdentity)).size !== races.length) throw new Error("Duplicate Tissue generation capture");
  return races.filter(book => book.family === "AW");
}

const outcomeMeta = { settlementVersion: z.literal(CANONICAL_SETTLEMENT_VERSION), settledAt: timestamp };
const outcomeSchema = z.discriminatedUnion("status", [
  z.object({ ...outcomeMeta, status: z.enum(["NR", "void"]) }).strict(),
  z.object({ ...outcomeMeta, status: z.literal("settled"), finishPosition: z.number().int().positive().nullable(),
    resultStatus: z.string().nullable(), startingPrice: z.string(), decimalSP: z.number().finite().gt(1),
    won: z.boolean(), deadHeatDivisor: z.number().int().positive(),
    grossReturn: z.number().finite(), profitLoss: z.number().finite() }).strict(),
]);
const observationSchema = z.object({
  book: generationRaceSchema, sourceId: z.string().min(1), sourceStage: z.enum(preOffStages),
  decidedAt: timestamp, decisions: z.array(decisionSchema).length(2), outcomes: z.record(z.string(), outcomeSchema),
}).strict();
const ledgerSchema = z.object({
  policy: z.literal(AW_MARKET_SUPPORT_POLICY), armedAt: timestamp, observations: z.array(observationSchema),
}).strict();
type Ledger = z.infer<typeof ledgerSchema>;
type Observation = z.infer<typeof observationSchema>;

function parseLedger(value: unknown) {
  const data = ledgerSchema.parse(value);
  const ids = new Set<string>();
  for (const { book, decidedAt, decisions, outcomes } of data.observations) {
    if (ids.has(book.raceId) || Date.parse(book.capturedAt) < Date.parse(data.armedAt) ||
        Date.parse(decidedAt) < Date.parse(book.capturedAt) || Date.parse(decidedAt) >= Date.parse(book.scheduledOff) ||
        getLocalRacingDate(new Date(decidedAt)) !== book.raceDate || book.runners.some(r => r.outcome !== null) ||
        JSON.stringify(decisions) !== JSON.stringify(decideAwMarketSupport(book)) ||
        Object.entries(outcomes).some(([id, result]) =>
          !decisions.some(d => d.runnerId === id) || Date.parse(result.settledAt) < Date.parse(book.scheduledOff))) {
      throw new Error("Invalid AW market-support ledger");
    }
    ids.add(book.raceId);
  }
  return data;
}

export async function loadAwMarketSupport(path = AW_MARKET_SUPPORT_SHADOW_PATH) {
  try { return parseLedger(JSON.parse(await readFile(path, "utf8"))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}

function updateLedger(path: string, update: (data: Ledger | null) => Ledger) {
  return mutateFrozenJson<Ledger | null>(path, () => loadAwMarketSupport(path), parseLedger, (before, after) => {
    if (!after) throw new Error("Invalid AW market-support update");
    if (!before) return;
    if (before.armedAt !== after.armedAt || before.observations.length > after.observations.length) {
      throw new Error("Cannot reset AW market-support history");
    }
    for (const [i, { outcomes, ...frozen }] of before.observations.entries()) {
      const { outcomes: current, ...snapshot } = after.observations[i];
      if (JSON.stringify(frozen) !== JSON.stringify(snapshot) ||
          Object.entries(outcomes).some(([id, result]) => JSON.stringify(result) !== JSON.stringify(current[id]))) {
        throw new Error("Cannot rewrite AW market-support decisions or results");
      }
    }
  }, update);
}

export function initAwMarketSupport(path = AW_MARKET_SUPPORT_SHADOW_PATH, clock = () => new Date()) {
  return updateLedger(path, data => data ?? { policy: AW_MARKET_SUPPORT_POLICY, armedAt: clock().toISOString(), observations: [] });
}

function requireArmed(data: Ledger | null) {
  if (!data) throw new Error("AW market-support shadow is unarmed");
  return data;
}

export function captureAwMarketSupport(books: readonly GenerationRace[], cards: ReadonlyMap<string, TodayRace>,
  since: Date, path = AW_MARKET_SUPPORT_SHADOW_PATH, clock = () => new Date()) {
  if (!Number.isFinite(since.getTime())) throw new Error("Invalid collection start");
  return updateLedger(path, current => {
    const data = requireArmed(current);
    const known = new Set(data.observations.map(o => o.book.raceId));
    const earliest = Math.max(since.getTime(), Date.parse(data.armedAt));
    for (const book of [...books].sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt))) {
      const race = cards.get(book.raceId);
      const stage = preOffStages.find(s => s === race?.raceStage?.trim().toUpperCase());
      const capturedAt = Date.parse(book.capturedAt), off = Date.parse(book.scheduledOff);
      if (book.family !== "AW" || known.has(book.raceId) || !race?.sourceId || !stage || race.winningTime ||
          !Number.isFinite(capturedAt) || capturedAt < earliest || race.raceId !== book.raceId ||
          race.raceDateTime?.getTime() !== off || book.runners.some(r => r.outcome !== null) ||
          race.runners.some(r => r.finishingPosition !== null || (r.resultStatus !== null && r.resultStatus !== "non_runner"))) continue;
      const active = new Map(race.runners.filter(r => r.resultStatus !== "non_runner").map(r => [r.runnerId, r.horseId]));
      if (new Set(race.runners.map(r => r.runnerId)).size !== race.runners.length || active.size !== book.runners.length ||
          book.runners.some(r => active.get(r.runnerId) !== r.horseId)) continue;

      const decisions = decideAwMarketSupport(book);
      const decidedAt = clock();
      if (!Number.isFinite(decidedAt.getTime()) || decidedAt.getTime() < capturedAt ||
          decidedAt.getTime() >= off || getLocalRacingDate(decidedAt) !== book.raceDate) continue;
      data.observations.push({ book, sourceId: race.sourceId, sourceStage: stage,
        decidedAt: decidedAt.toISOString(), decisions, outcomes: {} });
      known.add(book.raceId);
    }
    return data;
  });
}

export function pendingAwMarketSupport(data: Ledger) {
  return data.observations.filter(o => o.decisions.some(d => !o.outcomes[d.runnerId])).map(o => o.book.raceId);
}

function settle(o: Observation, { race, prices }: AwProfitResult, now: Date) {
  if (!Number.isFinite(now.getTime()) || now.getTime() < Date.parse(o.book.scheduledOff) ||
      race.raceId !== o.book.raceId || race.sourceId !== o.sourceId) return;
  const result = new Map(race.runners.map(r => [r.runnerId, r]));
  if (result.size !== race.runners.length) return;

  const stage = race.raceStage?.trim().toUpperCase() ?? "";
  const raceVoid = isVoidRaceOutcome({ raceStage: stage, finishingPosition: null, resultStatus: null });
  const state = (r: TodayRace["runners"][number]) => settlementOutcomeState({ ...r, raceStage: stage });
  const frozen = new Map(o.book.runners.map(r => [r.runnerId, r.horseId]));
  const starters = race.runners.filter(r => state(r) !== "NR");
  const winners = starters.filter(r => state(r) === "win").length;
  const complete = finalStages.has(stage) && winners > 0 &&
    (race.actualRunnerCount === starters.length || race.actualRunnerCount === race.runners.length) &&
    o.book.runners.every(r => result.get(r.runnerId)?.horseId === r.horseId) &&
    starters.every(r => frozen.get(r.runnerId) === r.horseId &&
      (r.finishingPosition === null || r.finishingPosition <= starters.length) && ["win", "loss"].includes(state(r)));
  const meta = { settlementVersion: CANONICAL_SETTLEMENT_VERSION, settledAt: now.toISOString() };

  // Record outcomes for the original reference picks even when the filter abstained.
  for (const { runnerId } of o.decisions) {
    if (o.outcomes[runnerId]) continue;
    const runner = result.get(runnerId);
    const matched = runner && runner.horseId === frozen.get(runnerId) ? runner : undefined;
    const status = matched && state(matched);
    if (status === "NR" || raceVoid || (status === "void" && finalStages.has(stage))) {
      o.outcomes[runnerId] = { ...meta, status: status === "NR" ? "NR" : "void" };
      continue;
    }

    const price = prices.get(runnerId);
    if (!complete || !matched || !price) continue;
    const won = status === "win", deadHeatDivisor = won ? winners : 1;
    const stake = settleSelection({ ...matched, raceStage: stage, targetRaceId: race.raceId, targetRunnerId: runnerId, won,
      placed: null, startingPrice: price.fractional, startingPriceDecimal: String(price.decimal), deadHeatDivisor });
    if (stake) o.outcomes[runnerId] = { ...meta, status: "settled", finishPosition: matched.finishingPosition,
      resultStatus: matched.resultStatus, startingPrice: price.fractional, decimalSP: stake.settlementOddsDecimal,
      won, deadHeatDivisor, grossReturn: stake.grossReturn, profitLoss: stake.profitLoss };
  }
}

export function settleAwMarketSupport(results: ReadonlyMap<string, AwProfitResult>, path = AW_MARKET_SUPPORT_SHADOW_PATH, now = new Date()) {
  return updateLedger(path, current => {
    const data = requireArmed(current);
    for (const o of data.observations) {
      const result = results.get(o.book.raceId);
      if (result) settle(o, result, now);
    }
    return data;
  });
}

export function summarizeAwMarketSupport(data: Ledger) {
  return ([1, 2] as const).flatMap(tissueRank => (["original", "market-support"] as const).map(arm => {
    const results = data.observations.flatMap(o => o.decisions.filter(d =>
      d.tissueRank === tissueRank && (arm === "original" || d.decision === "retain")).map(d => o.outcomes[d.runnerId]));
    const bets = results.filter(r => r?.status === "settled");
    const profitLoss = bets.reduce((total, r) => total + r.profitLoss, 0);
    return { tissueRank, arm, observations: data.observations.length, abstentions: data.observations.length - results.length,
      bets: bets.length, wins: bets.filter(r => r.won).length, pending: results.filter(r => !r).length,
      voids: results.filter(r => r && r.status !== "settled").length, profitLoss, roiPercent: bets.length ? 100 * profitLoss / bets.length : null };
  }));
}
