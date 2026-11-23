import { readFile } from "node:fs/promises";
import { z } from "zod";
import { type AwProfitResult } from "./aw-profit-shadow";
import { AW_SAME_OR_POLICY, decideAwSameOr } from "./aw-same-or-policy";
import { settleSelection } from "./backtest";
import { mutateFrozenJson } from "./frozen-json-store";
import { CANONICAL_SETTLEMENT_VERSION } from "./research-settlement-version";
import { isVoidRaceOutcome, settlementOutcomeState } from "./settlement-outcome";
import { generationRaceSchema, validGenerationCapture, type GenerationRace } from "./tissue-generation-forward";
import { type TissueGenerationModel } from "./tissue-generation-model";
import { getLocalRacingDate, type TodayRace } from "./todays-racing";

export const AW_SAME_OR_SHADOW_PATH = "data/research/aw-same-or-shadow-v1.json";
const preOffStages = ["DORMANT", "PRE_RACE", "PARADING", "GOINGDOWN", "GOINGBEHIND", "ATTHEPOST"] as const;
const terminalStages = new Set(["WEIGHEDIN", "OFFICIAL", "COMPLETED"]);
const timestamp = z.iso.datetime();
const outcomeMeta = { settlementVersion: z.literal(CANONICAL_SETTLEMENT_VERSION), settledAt: timestamp };
const outcomeSchema = z.discriminatedUnion("status", [
  z.object({ ...outcomeMeta, status: z.enum(["NR", "void"]) }).strict(),
  z.object({ ...outcomeMeta, status: z.literal("settled"), startingPrice: z.string(),
    decimalSP: z.number().finite().gt(1), won: z.boolean(), deadHeatDivisor: z.number().int().positive(),
    grossReturn: z.number().finite(), profitLoss: z.number().finite() }).strict(),
]);
const observationSchema = z.object({
  book: generationRaceSchema, sourceId: z.string().min(1), sourceStage: z.enum(preOffStages), decidedAt: timestamp,
  decision: z.object({ originalT1: z.string(), leaderWithoutSameOr: z.string().nullable(),
    selection: z.string().nullable(), originalMarketRank: z.number().int().positive().nullable(), triggered: z.boolean() }).strict(),
  outcomes: z.record(z.string(), outcomeSchema),
}).strict();
const ledgerSchema = z.object({
  version: z.literal("aw_same_or_shadow_v1"), policy: z.literal(AW_SAME_OR_POLICY), armedAt: timestamp,
  observations: z.array(observationSchema),
}).strict();
type Ledger = z.infer<typeof ledgerSchema>;
type Observation = z.infer<typeof observationSchema>;

function selectedIds({ decision }: Observation) {
  return decision.selection === null ? [] : [...new Set([decision.originalT1, decision.selection])];
}

function parseLedger(value: unknown) {
  const data = ledgerSchema.parse(value);
  const ids = new Set<string>();
  for (const o of data.observations) {
    const { book, decision } = o;
    const captured = Date.parse(book.capturedAt), decided = Date.parse(o.decidedAt), off = Date.parse(book.scheduledOff);
    const t1 = book.runners.find(r => r.rank === 1);
    const rank = book.completeMarket && t1?.capturedPrice != null
      ? 1 + book.runners.filter(r => r.capturedPrice! < t1.capturedPrice!).length : null;
    const leader = decision.leaderWithoutSameOr;
    const trigger = rank !== null && rank >= 4 && leader !== decision.originalT1;
    if (book.family !== "AW" || !validGenerationCapture(book) || ids.has(book.raceId) || captured < Date.parse(data.armedAt) ||
        decided < captured || decided >= off ||
        book.raceDate !== getLocalRacingDate(new Date(o.decidedAt)) || book.runners.some(r => r.outcome !== null) ||
        t1?.runnerId !== decision.originalT1 || decision.originalMarketRank !== rank ||
        (book.completeMarket ? !book.runners.some(r => r.runnerId === leader) : leader !== null) ||
        decision.triggered !== trigger || decision.selection !== (rank === null ? null : trigger ? leader : decision.originalT1) ||
        Object.entries(o.outcomes).some(([id, result]) => !selectedIds(o).includes(id) || Date.parse(result.settledAt) < off)) {
      throw new Error("Invalid AW same-OR shadow ledger");
    }
    ids.add(book.raceId);
  }
  return data;
}

export async function loadAwSameOrShadow(path = AW_SAME_OR_SHADOW_PATH) {
  try { return parseLedger(JSON.parse(await readFile(path, "utf8"))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}

function updateLedger(path: string, update: (data: Ledger | null) => Ledger) {
  return mutateFrozenJson<Ledger | null>(path, () => loadAwSameOrShadow(path), parseLedger, (before, after) => {
    if (!after) throw new Error("Invalid AW same-OR update");
    if (!before) return;
    if (before.armedAt !== after.armedAt || before.observations.length > after.observations.length) {
      throw new Error("Cannot reset AW same-OR history");
    }
    for (const [i, { outcomes, ...frozen }] of before.observations.entries()) {
      const { outcomes: current, ...rest } = after.observations[i];
      if (JSON.stringify(frozen) !== JSON.stringify(rest) ||
          Object.entries(outcomes).some(([id, result]) => JSON.stringify(result) !== JSON.stringify(current[id]))) {
        throw new Error("Cannot rewrite AW same-OR observations or outcomes");
      }
    }
  }, update);
}

/** Explicit activation only. The timestamp is assigned under the write lock. */
export function initAwSameOrShadow(path = AW_SAME_OR_SHADOW_PATH, clock = () => new Date()) {
  return updateLedger(path, data => data ?? {
    version: "aw_same_or_shadow_v1", policy: AW_SAME_OR_POLICY, armedAt: clock().toISOString(), observations: [],
  });
}

function requireArmed(data: Ledger | null) {
  if (!data) throw new Error("AW same-OR shadow is unarmed");
  return data;
}

export function captureAwSameOrShadow(model: TissueGenerationModel, books: readonly GenerationRace[],
  cards: ReadonlyMap<string, TodayRace>, since: Date, path = AW_SAME_OR_SHADOW_PATH, clock = () => new Date()) {
  const start = since.getTime();
  if (!Number.isFinite(start)) throw new Error("Invalid collection start");
  return updateLedger(path, current => {
    const data = requireArmed(current);
    const known = new Set(data.observations.map(o => o.book.raceId));
    for (const book of [...books].sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt))) {
      const race = cards.get(book.raceId);
      const stage = preOffStages.find(s => s === race?.raceStage?.trim().toUpperCase());
      const now = clock();
      const captured = Date.parse(book.capturedAt);
      if (!race?.sourceId || !stage || known.has(book.raceId) || book.family !== "AW" || race.winningTime ||
          race.raceId !== book.raceId || race.raceDateTime?.getTime() !== Date.parse(book.scheduledOff) ||
          !Number.isFinite(now.getTime()) || captured < Math.max(start, Date.parse(data.armedAt)) ||
          now.getTime() < captured || now.getTime() >= Date.parse(book.scheduledOff) ||
          book.raceDate !== getLocalRacingDate(now) || book.runners.some(r => r.outcome !== null) ||
          race.runners.some(r => r.finishingPosition !== null || (r.resultStatus !== null && r.resultStatus !== "non_runner"))) continue;

      const active = new Map(race.runners.filter(r => r.resultStatus !== "non_runner").map(r => [r.runnerId, r.horseId]));
      if (new Set(race.runners.map(r => r.runnerId)).size !== race.runners.length || active.size !== book.runners.length ||
          book.runners.some(r => active.get(r.runnerId) !== r.horseId)) continue;

      const decision = decideAwSameOr(model, book);
      const decidedAt = clock();
      if (!Number.isFinite(decidedAt.getTime()) || decidedAt.getTime() < now.getTime() ||
          decidedAt.getTime() >= Date.parse(book.scheduledOff)) continue;
      data.observations.push({ book, sourceId: race.sourceId, sourceStage: stage, decidedAt: decidedAt.toISOString(), decision, outcomes: {} });
      known.add(book.raceId);
    }
    return data;
  });
}

export function pendingAwSameOrShadow(data: Ledger) {
  return data.observations.filter(o => selectedIds(o).some(id => !o.outcomes[id])).map(o => o.book.raceId);
}

function settle(o: Observation, { race, prices }: AwProfitResult, now: Date) {
  if (!Number.isFinite(now.getTime()) || now.getTime() < Date.parse(o.book.scheduledOff) ||
      race.raceId !== o.book.raceId || race.sourceId !== o.sourceId) return;
  const card = new Map(race.runners.map(r => [r.runnerId, r]));
  if (card.size !== race.runners.length) return;
  const stage = race.raceStage?.trim().toUpperCase() ?? "";
  const state = (r: TodayRace["runners"][number]) => settlementOutcomeState({ ...r, raceStage: stage });
  const members = new Map(o.book.runners.map(r => [r.runnerId, r.horseId]));
  const starters = race.runners.filter(r => state(r) !== "NR");
  const divisor = starters.filter(r => state(r) === "win").length;
  const complete = terminalStages.has(stage) && divisor > 0 &&
    (race.actualRunnerCount === starters.length || race.actualRunnerCount === race.runners.length) &&
    o.book.runners.every(r => card.get(r.runnerId)?.horseId === r.horseId) &&
    starters.every(r => members.get(r.runnerId) === r.horseId &&
      (r.finishingPosition === null || r.finishingPosition <= starters.length) && ["win", "loss"].includes(state(r)));
  const meta = { settlementVersion: CANONICAL_SETTLEMENT_VERSION, settledAt: now.toISOString() };
  for (const id of selectedIds(o)) {
    if (o.outcomes[id]) continue;
    const runner = card.get(id);
    if (isVoidRaceOutcome({ raceStage: stage, finishingPosition: null, resultStatus: null })) {
      o.outcomes[id] = { ...meta, status: runner && runner.horseId === members.get(id) && state(runner) === "NR" ? "NR" : "void" };
      continue;
    }
    if (!runner || runner.horseId !== members.get(id)) continue;
    const result = state(runner);
    if (result === "NR" || (result === "void" && terminalStages.has(stage))) {
      o.outcomes[id] = { ...meta, status: result };
      continue;
    }
    const price = prices.get(id);
    if (!complete || !price) continue;
    const won = result === "win";
    const value = settleSelection({ ...runner, raceStage: stage, targetRaceId: race.raceId, targetRunnerId: id,
      won, placed: null, startingPrice: price.fractional, startingPriceDecimal: String(price.decimal), deadHeatDivisor: divisor });
    if (value) o.outcomes[id] = { ...meta, status: "settled", startingPrice: price.fractional, decimalSP: value.settlementOddsDecimal,
      won, deadHeatDivisor: divisor, grossReturn: value.grossReturn, profitLoss: value.profitLoss };
  }
}

export function settleAwSameOrShadow(results: ReadonlyMap<string, AwProfitResult>, path = AW_SAME_OR_SHADOW_PATH, now = new Date()) {
  return updateLedger(path, current => {
    const data = requireArmed(current);
    for (const o of data.observations) {
      const result = results.get(o.book.raceId);
      if (result) settle(o, result, now);
    }
    return data;
  });
}

export function summarizeAwSameOrShadow(data: Ledger) {
  return (["originalT1", "selection"] as const).map(arm => {
    const selected = data.observations.filter(o => o.decision.selection !== null);
    const results = selected.map(o => o.outcomes[o.decision[arm]!]);
    const bets = results.filter(r => r?.status === "settled");
    const profitLoss = bets.reduce((total, r) => total + r.profitLoss, 0);
    return { arm, observations: data.observations.length, substitutions: selected.filter(o => o.decision.triggered).length,
      abstentions: data.observations.length - selected.length, bets: bets.length, wins: bets.filter(r => r.won).length,
      pending: results.filter(r => !r).length, voids: results.filter(r => r && r.status !== "settled").length,
      profitLoss, roiPercent: bets.length ? 100 * profitLoss / bets.length : null };
  });
}
