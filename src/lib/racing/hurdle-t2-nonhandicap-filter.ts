import { readFile } from "node:fs/promises";
import { z } from "zod";
import { mutateFrozenJson } from "./frozen-json-store";
import { verifyFrozenFinalSp, type HurdleFinalSpResults } from "./hurdle-final-sp";
import { CANONICAL_SETTLEMENT_VERSION } from "./research-settlement-version";
import { GENERATION_MODEL_HASHES } from "./tissue-generation-config";
import { frozenNumeric } from "./tissue-generation-features";
import { validGenerationCapture, type GenerationRace } from "./tissue-generation-forward";
import { getLocalRacingDate } from "./todays-racing";

export const HURDLE_T2_FILTER_ID = "HURDLE_T2_NONHANDICAP_FILTER_V1";
export const HURDLE_T2_FILTER_PATH = "data/research/hurdle-t2-nonhandicap-filter-v1.json";

const timestamp = z.iso.datetime();
const price = z.number().finite().gt(1);
const finalSp = z.object({
  fractional: z.string(), decimal: price, profitLoss: z.number().finite(),
}).strict();
const settlement = z.object({
  version: z.literal(CANONICAL_SETTLEMENT_VERSION),
  status: z.enum(["settled", "NR", "void"]),
  recordedAt: timestamp,
  winner: z.boolean().nullable(),
  finishPosition: z.number().int().positive().nullable(),
  deadHeatDivisor: z.number().int().positive(),
  capturedProfitLoss: z.number().finite().nullable(),
  finalSp: finalSp.nullable(),
}).strict();
const raceSchema = z.object({
  raceId: z.string().min(1), raceDate: z.iso.date(), course: z.string().min(1),
  scheduledOff: timestamp, sourceCapturedAt: timestamp, featureCutoffAt: timestamp,
  capturedAt: timestamp, modelHash: z.literal(GENERATION_MODEL_HASHES.HURDLE),
  handicap: z.enum(["handicap", "non-handicap", "unknown"]),
  handicapEvidence: z.object({
    source: z.literal("frozen_tissue_handicap_input"),
    values: z.array(z.union([z.literal(0), z.literal(1), z.null()])).min(2),
  }).strict(),
  distanceFurlongs: z.number().finite().positive().nullable(),
  t2: z.object({
    runnerId: z.string().min(1), horseId: z.string().min(1), horseName: z.string().min(1),
    rank: z.literal(2), capturedPrice: price.nullable(),
  }).strict(),
  decision: z.enum(["BET", "NO BET"]),
  selectionRunnerId: z.string().min(1).nullable(),
  abstentionReason: z.literal("confirmed_non_handicap_under_18f").nullable(),
  settlement: settlement.nullable(),
}).strict();
type Observation = z.infer<typeof raceSchema>;

function handicapStatus(values: readonly (0 | 1 | null)[]): Observation["handicap"] {
  if (values.every(value => value === 1)) return "handicap";
  if (values.every(value => value === 0)) return "non-handicap";
  return "unknown";
}

export function hurdleT2FilterDecision(handicap: Observation["handicap"], distanceFurlongs: number | null) {
  return handicap === "non-handicap" && distanceFurlongs !== null && distanceFurlongs > 0 && distanceFurlongs < 18
    ? "NO BET" as const : "BET" as const;
}

const parseTime = Date.parse;
const schema = z.object({
  policy: z.literal(HURDLE_T2_FILTER_ID), armedAt: timestamp, races: z.array(raceSchema),
}).strict().refine(data => {
  if (new Set(data.races.map(r => r.raceId)).size !== data.races.length) return false;
  return data.races.every(r => {
    const noBet = r.decision === "NO BET";
    const outcome = r.settlement;
    return parseTime(data.armedAt) <= parseTime(r.sourceCapturedAt) &&
      parseTime(r.featureCutoffAt) <= parseTime(r.sourceCapturedAt) &&
      parseTime(r.sourceCapturedAt) <= parseTime(r.capturedAt) &&
      parseTime(r.capturedAt) < parseTime(r.scheduledOff) &&
      [r.sourceCapturedAt, r.capturedAt, r.scheduledOff].every(at => getLocalRacingDate(new Date(at)) === r.raceDate) &&
      handicapStatus(r.handicapEvidence.values) === r.handicap &&
      hurdleT2FilterDecision(r.handicap, r.distanceFurlongs) === r.decision &&
      r.selectionRunnerId === (noBet ? null : r.t2.runnerId) &&
      r.abstentionReason === (noBet ? "confirmed_non_handicap_under_18f" : null) &&
      (!outcome || parseTime(outcome.recordedAt) >= parseTime(r.scheduledOff) &&
        (outcome.status === "settled"
          ? typeof outcome.winner === "boolean" && (r.t2.capturedPrice === null) === (outcome.capturedProfitLoss === null)
          : outcome.winner === null && outcome.capturedProfitLoss === null && outcome.finalSp === null));
  });
}, "Invalid Hurdle T2 filter ledger");
export type HurdleT2FilterData = z.infer<typeof schema>;

export async function loadHurdleT2Filter(path = HURDLE_T2_FILTER_PATH): Promise<HurdleT2FilterData | null> {
  try {
    return schema.parse(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function mutateFilter(path: string, mutate: (data: HurdleT2FilterData | null) => HurdleT2FilterData | null) {
  return mutateFrozenJson(path, () => loadHurdleT2Filter(path), value => schema.nullable().parse(value), (before, after) => {
    if (!before) {
      if (after?.races.length) throw new Error("Hurdle T2 filter must arm with an empty ledger");
      return;
    }
    if (!after || before.armedAt !== after.armedAt || after.races.length < before.races.length)
      throw new Error("Cannot change Hurdle T2 filter activation or remove observations");
    for (const [i, old] of before.races.entries()) {
      const { settlement: previous, ...frozen } = old;
      const { settlement: next, ...current } = after.races[i];
      const previousResult = previous && { ...previous, finalSp: null };
      const nextResult = next && { ...next, finalSp: null };
      if (JSON.stringify(frozen) !== JSON.stringify(current) ||
          (previous && JSON.stringify(previousResult) !== JSON.stringify(nextResult)) ||
          (previous?.finalSp && JSON.stringify(previous.finalSp) !== JSON.stringify(next?.finalSp))) {
        throw new Error("Cannot rewrite Hurdle T2 filter observations or recorded outcomes");
      }
    }
  }, mutate);
}

export function armHurdleT2Filter(path = HURDLE_T2_FILTER_PATH) {
  return mutateFilter(path, data => data ?? { policy: HURDLE_T2_FILTER_ID, armedAt: new Date().toISOString(), races: [] });
}

function freezeDecision(book: GenerationRace, since: Date, armedAt: string, now: Date): Observation | null {
  if (book.family !== "HURDLE" ||
      getLocalRacingDate(now) !== book.raceDate || now >= new Date(book.scheduledOff) ||
      parseTime(book.capturedAt) > now.getTime() ||
      parseTime(book.capturedAt) < Math.max(since.getTime(), parseTime(armedAt)) ||
      book.runners.some(runner => runner.outcome !== null) || !validGenerationCapture(book)) return null;
  const candidates = book.runners.filter(runner => runner.rank === 2);
  if (candidates.length !== 1) return null;
  const t2 = candidates[0];
  // The generation's handicap input is derived by the existing race-type classifier.
  const values = book.runners.map(runner => {
    const value = frozenNumeric(book.featureNames, runner.modelInputs, "handicap");
    return value === 0 || value === 1 ? value : null;
  });
  const handicap = handicapStatus(values);
  const distance = frozenNumeric(book.featureNames, t2.modelInputs, "distance_furlongs");
  const distanceFurlongs = distance !== null && distance > 0 && book.runners.every(runner =>
    frozenNumeric(book.featureNames, runner.modelInputs, "distance_furlongs") === distance) ? distance : null;
  const decision = hurdleT2FilterDecision(handicap, distanceFurlongs);
  return {
    raceId: book.raceId, raceDate: book.raceDate, course: book.course, scheduledOff: book.scheduledOff,
    sourceCapturedAt: book.capturedAt, featureCutoffAt: book.featureCutoffAt, capturedAt: now.toISOString(),
    modelHash: book.modelHash, handicap, handicapEvidence: { source: "frozen_tissue_handicap_input", values }, distanceFurlongs,
    t2: { runnerId: t2.runnerId, horseId: t2.horseId, horseName: t2.horseName, rank: 2, capturedPrice: t2.capturedPrice },
    decision, selectionRunnerId: decision === "BET" ? t2.runnerId : null,
    abstentionReason: decision === "NO BET" ? "confirmed_non_handicap_under_18f" : null, settlement: null,
  };
}

export function captureHurdleT2Filter(books: readonly GenerationRace[], since: Date, path = HURDLE_T2_FILTER_PATH, clock = () => new Date()) {
  return mutateFilter(path, data => {
    if (!data) return null;
    const now = clock();
    if (!Number.isFinite(since.getTime()) || since > now || getLocalRacingDate(since) !== getLocalRacingDate(now))
      throw new Error("Capture requires the start of today's collection run");
    const seen = new Set(data.races.map(r => r.raceId));
    for (const book of [...books].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))) {
      if (seen.has(book.raceId)) continue;
      const record = freezeDecision(book, since, data.armedAt, clock());
      if (!record) continue;
      seen.add(book.raceId);
      data.races.push(record);
    }
    return data;
  });
}

export function pendingHurdleT2Filter(data: HurdleT2FilterData) {
  return data.races.filter(r => !r.settlement || (r.settlement.status === "settled" && !r.settlement.finalSp));
}

export function settleHurdleT2Filter(books: readonly GenerationRace[], finalResults: HurdleFinalSpResults,
  path = HURDLE_T2_FILTER_PATH, now = new Date()) {
  const sources = new Map(books.filter(book => book.family === "HURDLE").map(book => [book.raceId + "|" + book.capturedAt, book]));
  return mutateFilter(path, data => {
    if (!data) return null;
    for (const r of pendingHurdleT2Filter(data)) {
      if (now < new Date(r.scheduledOff)) continue;
      const book = sources.get(r.raceId + "|" + r.sourceCapturedAt);
      const runner = book?.runners.find(x => x.rank === 2 && x.runnerId === r.t2.runnerId && x.horseId === r.t2.horseId);
      const result = runner?.outcome;
      if (book?.modelHash !== r.modelHash || runner?.capturedPrice !== r.t2.capturedPrice ||
          !result || result.settlementVersion !== CANONICAL_SETTLEMENT_VERSION ||
          parseTime(result.settledAt) < parseTime(r.scheduledOff) || parseTime(result.settledAt) > now.getTime()) continue;
      const field = finalResults.get(r.raceId);
      const sp = result.status === "settled" ? verifyFrozenFinalSp(field, r.t2.runnerId, result).settlement : null;
      const fractional = field?.get(r.t2.runnerId)?.resultPrice;
      r.settlement = {
        version: CANONICAL_SETTLEMENT_VERSION, status: result.status, recordedAt: r.settlement?.recordedAt ?? now.toISOString(),
        winner: result.winner, finishPosition: result.finishPosition, deadHeatDivisor: result.deadHeatDivisor,
        capturedProfitLoss: result.profitLoss,
        finalSp: sp && fractional ? { fractional, decimal: sp.settlementOddsDecimal, profitLoss: sp.profitLoss } : null,
      };
    }
    return data;
  });
}

export function summarizeHurdleT2Filter(data: HurdleT2FilterData | null) {
  const races = data?.races ?? [];
  const abstentions = races.filter(r => r.decision === "NO BET");
  const selected = races.filter(r => r.decision === "BET");
  const resolved = races.filter(r => r.settlement !== null);
  const summarize = (cohort: readonly Observation[], basis: "captured" | "sp") => {
    const returns = cohort.flatMap(r => {
      const amount = basis === "captured" ? r.settlement?.capturedProfitLoss : r.settlement?.finalSp?.profitLoss;
      return amount == null ? [] : [amount];
    });
    const profit = returns.length ? returns.reduce((a, b) => a + b, 0) : null;
    return { bets: returns.length, profit, roi: profit === null ? null : profit / returns.length };
  };
  const compare = (basis: "captured" | "sp") => {
    const benchmark = summarize(races, basis), shadow = summarize(selected, basis);
    const shadowProfit = benchmark.profit === null ? null : shadow.profit ?? 0;
    return { basis, benchmark, shadow: { ...shadow, profit: shadowProfit },
      difference: shadowProfit === null || benchmark.profit === null ? null : shadowProfit - benchmark.profit };
  };
  return {
    eligible: races.length, selected: selected.length, abstentions: abstentions.length,
    pending: races.length - resolved.length, settled: resolved.filter(r => r.settlement?.status === "settled").length,
    refunds: resolved.filter(r => r.settlement?.status !== "settled").length,
    winners: selected.filter(r => r.settlement?.winner).length,
    benchmarkWinners: races.filter(r => r.settlement?.winner).length,
    missedWinners: abstentions.filter(r => r.settlement?.winner).length,
    capturedQuotes: races.filter(r => r.t2.capturedPrice !== null).length,
    latestCapture: races.map(r => r.capturedAt).sort().at(-1) ?? null,
    prices: [compare("captured"), compare("sp")],
  };
}
