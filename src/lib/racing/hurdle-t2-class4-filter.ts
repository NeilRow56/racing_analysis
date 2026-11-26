import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { hurdleT2FilterDecision } from "./hurdle-t2-nonhandicap-filter";
import { classifyHandicapStatus } from "./research-rule";
import { winGrossReturn } from "./win-settlement";
import { mutateFrozenJson } from "./frozen-json-store";
import { verifyFrozenFinalSp, type HurdleFinalSpResults } from "./hurdle-final-sp";
import { CANONICAL_SETTLEMENT_VERSION } from "./research-settlement-version";
import { GENERATION_MODEL_HASHES } from "./tissue-generation-config";
import { frozenNumeric } from "./tissue-generation-features";
import { generationRaceSchema, validGenerationCapture, type GenerationRace } from "./tissue-generation-forward";
import { getLocalRacingDate, type TodayRace } from "./todays-racing";

export const HURDLE_CLASS4_ID = "HURDLE_T2_CLASS4_FILTER_V1";
export const HURDLE_CLASS4_PATH = "data/research/hurdle-t2-class4-filter-v1.json";

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
const handicapSchema = z.enum(["handicap", "non-handicap", "unknown"]);
const decisionSchema = z.enum(["BET", "NO BET"]);
const preOffStages = new Set(["DORMANT", "PRE_RACE", "PARADING", "GOINGDOWN", "GOINGBEHIND", "ATTHEPOST"]);
const evidenceSchema = z.object({
  cardSourceId: z.string().nullable(),
  cardStage: z.string().nullable(),
  cardIdentityVerified: z.boolean(),
  cardClass: z.string().nullable(),
  cardHandicap: handicapSchema,
  cardDistanceYards: z.number().finite().nullable(),
  classInputs: z.array(z.number().finite().nullable()).min(2),
  distanceInputs: z.array(z.number().finite().nullable()).min(2),
}).strict();

const raceSchema = z.object({
  raceId: z.string().min(1), raceDate: z.iso.date(), course: z.string().min(1),
  scheduledOff: timestamp, sourceCapturedAt: timestamp, featureCutoffAt: timestamp,
  capturedAt: timestamp, modelHash: z.literal(GENERATION_MODEL_HASHES.HURDLE),
  handicap: handicapSchema,
  handicapEvidence: z.object({
    source: z.literal("frozen_tissue_handicap_input"),
    values: z.array(z.union([z.literal(0), z.literal(1), z.null()])).min(2),
  }).strict(),
  distanceFurlongs: z.number().finite().positive().nullable(),
  evidence: evidenceSchema,
  officialClass: z.number().int().positive().nullable(),
  confirmedHandicap: handicapSchema,
  confirmedDistanceYards: z.number().int().positive().nullable(),
  t2: z.object({
    runnerId: z.string().min(1), horseId: z.string().min(1), horseName: z.string().min(1),
    rank: z.literal(2), capturedPrice: price.nullable(),
    quotes: z.array(generationRaceSchema.shape.runners.element.shape.quotes.element),
  }).strict(),
  originalDecision: z.literal("BET"),
  existingDecision: decisionSchema,
  decision: decisionSchema,
  selectionRunnerId: z.string().min(1).nullable(),
  abstentionReason: z.enum(["confirmed_non_handicap_under_18f", "confirmed_class_4"]).nullable(),
  settlement: settlement.nullable(),
}).strict();
type Observation = z.infer<typeof raceSchema>;

function handicapStatus(values: readonly (0 | 1 | null)[]): Observation["handicap"] {
  if (values.every(value => value === 1)) return "handicap";
  if (values.every(value => value === 0)) return "non-handicap";
  return "unknown";
}

function confirm(evidence: Observation["evidence"], handicap: Observation["handicap"], distanceFurlongs: number | null) {
  const verified = evidence.cardIdentityVerified && !!evidence.cardSourceId &&
    evidence.cardStage !== null && preOffStages.has(evidence.cardStage);
  const numericClass = Number(evidence.cardClass?.trim().match(/^(?:class\s+)?([1-9]\d*)$/i)?.[1]);
  const yards = evidence.cardDistanceYards;
  return {
    officialClass: verified && Number.isSafeInteger(numericClass) && evidence.classInputs.every(value => value === numericClass)
      ? numericClass : null,
    confirmedHandicap: verified && evidence.cardHandicap === handicap ? handicap : "unknown" as const,
    confirmedDistanceYards: verified && yards !== null && Number.isSafeInteger(yards) && yards > 0 &&
      distanceFurlongs !== null && Math.abs(distanceFurlongs * 220 - yards) < 1e-7 ? yards : null,
  };
}

function decide(row: Pick<Observation, "handicap" | "distanceFurlongs" | "officialClass" | "confirmedHandicap" | "confirmedDistanceYards">) {
  const existingDecision = hurdleT2FilterDecision(row.handicap, row.distanceFurlongs);
  const abstentionReason = existingDecision === "NO BET" ? "confirmed_non_handicap_under_18f" as const :
    row.officialClass === 4 && row.confirmedHandicap !== "unknown" && row.confirmedDistanceYards !== null
      ? "confirmed_class_4" as const : null;
  return { existingDecision, decision: abstentionReason ? "NO BET" as const : "BET" as const, abstentionReason };
}

function frozenDistance(values: Observation["evidence"]["distanceInputs"]) {
  const distance = values[0];
  return distance !== null && distance > 0 && values.every(value => value === distance) ? distance : null;
}

const parseTime = Date.parse;
const schema = z.object({
  policy: z.literal(HURDLE_CLASS4_ID), armedAt: timestamp, races: z.array(raceSchema),
}).strict().refine(data => {
  if (new Set(data.races.map(r => r.raceId)).size !== data.races.length) return false;
  return data.races.every(r => {
    const noBet = r.decision === "NO BET";
    const outcome = r.settlement;
    const confirmed = confirm(r.evidence, r.handicap, r.distanceFurlongs);
    const expected = decide({ ...r, ...confirmed });
    return parseTime(data.armedAt) <= parseTime(r.sourceCapturedAt) &&
      parseTime(r.featureCutoffAt) <= parseTime(r.sourceCapturedAt) &&
      parseTime(r.sourceCapturedAt) <= parseTime(r.capturedAt) &&
      parseTime(r.capturedAt) < parseTime(r.scheduledOff) &&
      [r.sourceCapturedAt, r.capturedAt, r.scheduledOff].every(at => getLocalRacingDate(new Date(at)) === r.raceDate) &&
      handicapStatus(r.handicapEvidence.values) === r.handicap &&
      r.distanceFurlongs === frozenDistance(r.evidence.distanceInputs) &&
      r.officialClass === confirmed.officialClass && r.confirmedHandicap === confirmed.confirmedHandicap &&
      r.confirmedDistanceYards === confirmed.confirmedDistanceYards &&
      r.existingDecision === expected.existingDecision && r.decision === expected.decision &&
      r.selectionRunnerId === (noBet ? null : r.t2.runnerId) &&
      r.abstentionReason === expected.abstentionReason &&
      (!outcome || parseTime(outcome.recordedAt) >= parseTime(r.scheduledOff) &&
        (outcome.status === "settled"
          ? typeof outcome.winner === "boolean" && (r.t2.capturedPrice === null) === (outcome.capturedProfitLoss === null)
          : outcome.winner === null && outcome.capturedProfitLoss === null && outcome.finalSp === null));
  });
}, "Invalid Hurdle Class 4 filter ledger");
export type HurdleClass4Data = z.infer<typeof schema>;

export async function loadHurdleClass4(path = HURDLE_CLASS4_PATH): Promise<HurdleClass4Data | null> {
  try {
    return schema.parse(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function mutateFilter(path: string, mutate: (data: HurdleClass4Data | null) => HurdleClass4Data | null) {
  return mutateFrozenJson(path, () => loadHurdleClass4(path), value => schema.nullable().parse(value), (before, after) => {
    if (!before) {
      if (after?.races.length) throw new Error("Hurdle Class 4 filter must arm with an empty ledger");
      return;
    }
    if (!after || before.armedAt !== after.armedAt || after.races.length < before.races.length)
      throw new Error("Cannot change Hurdle Class 4 filter activation or remove observations");
    for (const [i, old] of before.races.entries()) {
      const { settlement: previous, ...frozen } = old;
      const { settlement: next, ...current } = after.races[i];
      const previousResult = previous && { ...previous, finalSp: null };
      const nextResult = next && { ...next, finalSp: null };
      if (JSON.stringify(frozen) !== JSON.stringify(current) ||
          (previous && JSON.stringify(previousResult) !== JSON.stringify(nextResult)) ||
          (previous?.finalSp && JSON.stringify(previous.finalSp) !== JSON.stringify(next?.finalSp))) {
        throw new Error("Cannot rewrite Hurdle Class 4 filter observations or recorded outcomes");
      }
    }
  }, mutate);
}

export function armHurdleClass4(path = HURDLE_CLASS4_PATH) {
  return mutateFilter(path, data => data ?? { policy: HURDLE_CLASS4_ID, armedAt: new Date().toISOString(), races: [] });
}

function freezeDecision(book: GenerationRace, card: TodayRace | undefined, since: Date, armedAt: string, now: Date): Observation | null {
  if (book.family !== "HURDLE" ||
      getLocalRacingDate(now) !== book.raceDate || now >= new Date(book.scheduledOff) ||
      parseTime(book.capturedAt) > now.getTime() ||
      parseTime(book.capturedAt) < Math.max(since.getTime(), parseTime(armedAt)) ||
      book.runners.some(runner => runner.outcome !== null) || !generationRaceSchema.safeParse(book).success || !validGenerationCapture(book)) return null;
  const candidates = book.runners.filter(runner => runner.rank === 2);
  if (candidates.length !== 1) return null;
  const t2 = candidates[0];
  // The generation's handicap input is derived by the existing race-type classifier.
  const values = book.runners.map(runner => {
    const value = frozenNumeric(book.featureNames, runner.modelInputs, "handicap");
    return value === 0 || value === 1 ? value : null;
  });
  const handicap = handicapStatus(values);
  if (!t2.runnerId || !t2.horseId || !t2.horseName || book.runners.filter(runner => runner.horseId === t2.horseId).length !== 1) return null;
  const stage = card?.raceStage?.trim().toUpperCase() ?? null;
  if (card && ((stage && !preOffStages.has(stage)) || card.winningTime ||
      card.runners.some(r => r.finishingPosition !== null || (r.resultStatus !== null && r.resultStatus !== "non_runner")))) return null;
  const cardIdentityVerified = !!card?.sourceId && !!stage && preOffStages.has(stage) &&
    card.raceId === book.raceId && card.raceDateTime?.getTime() === parseTime(book.scheduledOff) &&
    new Set(card.runners.map(r => r.runnerId)).size === card.runners.length &&
    book.runners.every(r => card.runners.some(c => c.runnerId === r.runnerId && c.horseId === r.horseId)) &&
    card.runners.filter(c => c.resultStatus !== "non_runner").every(c => book.runners.some(r => r.runnerId === c.runnerId && r.horseId === c.horseId));
  const nonHandicapText = card && /\bnon[ -]+handicap\b/i.test([card.raceName, card.raceType, card.raceTypeCode].join(" "));
  const cardHandicap = cardIdentityVerified && card && !nonHandicapText ? classifyHandicapStatus(card) : "unknown";
  const evidence: Observation["evidence"] = {
    cardSourceId: card?.sourceId ?? null, cardStage: stage, cardIdentityVerified,
    cardClass: card?.raceClass ?? null, cardDistanceYards: card?.distanceYards ?? null,
    cardHandicap: cardHandicap === "non_handicap" ? "non-handicap" : cardHandicap,
    classInputs: book.runners.map(r => frozenNumeric(book.featureNames, r.modelInputs, "class")),
    distanceInputs: book.runners.map(r => frozenNumeric(book.featureNames, r.modelInputs, "distance_furlongs")),
  };
  const distanceFurlongs = frozenDistance(evidence.distanceInputs);
  const confirmed = confirm(evidence, handicap, distanceFurlongs);
  const decisions = decide({ handicap, distanceFurlongs, ...confirmed });
  return {
    raceId: book.raceId, raceDate: book.raceDate, course: book.course, scheduledOff: book.scheduledOff,
    sourceCapturedAt: book.capturedAt, featureCutoffAt: book.featureCutoffAt, capturedAt: now.toISOString(),
    modelHash: book.modelHash, handicap, handicapEvidence: { source: "frozen_tissue_handicap_input", values }, distanceFurlongs,
    t2: { runnerId: t2.runnerId, horseId: t2.horseId, horseName: t2.horseName, rank: 2, capturedPrice: t2.capturedPrice, quotes: t2.quotes },
    evidence, ...confirmed, originalDecision: "BET", ...decisions,
    selectionRunnerId: decisions.decision === "BET" ? t2.runnerId : null, settlement: null,
  };
}

export function captureHurdleClass4(books: readonly GenerationRace[], cards: ReadonlyMap<string, TodayRace>, since: Date, path = HURDLE_CLASS4_PATH, clock = () => new Date()) {
  return mutateFilter(path, data => {
    if (!data) return null;
    const now = clock();
    if (!Number.isFinite(since.getTime()) || since > now || getLocalRacingDate(since) !== getLocalRacingDate(now))
      throw new Error("Capture requires the start of today's collection run");
    const seen = new Set(data.races.map(r => r.raceId));
    for (const book of [...books].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))) {
      if (seen.has(book.raceId)) continue;
      const record = freezeDecision(book, cards.get(book.raceId), since, data.armedAt, clock());
      if (!record) continue;
      seen.add(book.raceId);
      data.races.push(record);
    }
    return data;
  });
}

export function pendingHurdleClass4(data: HurdleClass4Data) {
  return data.races.filter(r => !r.settlement || (r.settlement.status === "settled" && !r.settlement.finalSp));
}

export function settleHurdleClass4(books: readonly GenerationRace[], finalResults: HurdleFinalSpResults,
  path = HURDLE_CLASS4_PATH, now = new Date()) {
  const sources = new Map(books.filter(book => book.family === "HURDLE").map(book => [book.raceId + "|" + book.capturedAt, book]));
  return mutateFilter(path, data => {
    if (!data) return null;
    for (const r of pendingHurdleClass4(data)) {
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
        capturedProfitLoss: result.status === "settled" && r.t2.capturedPrice !== null
          ? winGrossReturn({ won: result.winner === true, decimalOdds: r.t2.capturedPrice, deadHeatDivisor: result.deadHeatDivisor }) - 1 : null,
        finalSp: sp && fractional ? { fractional, decimal: sp.settlementOddsDecimal, profitLoss: sp.profitLoss } : null,
      };
    }
    return data;
  });
}

type Basis = "captured" | "sp";
const class4 = (r: Observation) => r.abstentionReason === "confirmed_class_4";
const retainedByExisting = (r: Observation) => r.existingDecision === "BET";
const amount = (r: Observation, basis: Basis) =>
  (basis === "captured" ? r.settlement?.capturedProfitLoss : r.settlement?.finalSp?.profitLoss) ?? null;

function compare(races: readonly Observation[], basis: Basis) {
  const matched = races.filter(r => amount(r, basis) !== null);
  const totals = (bet: (r: Observation) => boolean) => {
    const selected = matched.filter(bet);
    const profit = matched.length ? selected.reduce((sum, r) => sum + (amount(r, basis) ?? 0), 0) : null;
    return {
      bets: selected.length, abstentions: matched.length - selected.length,
      winners: selected.filter(r => r.settlement?.winner).length,
      missedWinners: matched.filter(r => !bet(r) && r.settlement?.winner).length,
      profit, roi: profit !== null && selected.length ? profit / selected.length : null,
    };
  };
  const original = totals(() => true), existing = totals(retainedByExisting), combined = totals(r => r.decision === "BET");
  return {
    basis, matched: matched.length, original, existing, combined,
    improvement: combined.profit !== null && original.profit !== null ? combined.profit - original.profit : null,
    incremental: combined.profit !== null && existing.profit !== null ? combined.profit - existing.profit : null,
  };
}

const CONTROL_DRAWS = 1000;
const CONTROL_SEED = "HURDLE_T2_CLASS4_FILTER_V1:month-handicap:v1";
const controlStratum = (r: Observation) => r.raceDate.slice(0, 7) + "|" + r.confirmedHandicap;

// Draw equal-sized samples within each adequately covered stratum. Only stake
// eligibility and frozen fields determine membership and order, never returns.
export function hurdleClass4Control(races: readonly Observation[], basis: Basis) {
  const matched = races.filter(r => retainedByExisting(r) && r.confirmedHandicap !== "unknown" && amount(r, basis) !== null);
  const groups = new Map<string, { triggers: Observation[]; controls: Observation[] }>();
  for (const r of matched) {
    const key = controlStratum(r);
    const group = groups.get(key) ?? { triggers: [], controls: [] };
    groups.set(key, group);
    if (class4(r)) group.triggers.push(r);
    else group.controls.push(r);
  }
  const strata = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).flatMap(([key, group]) => {
    const triggers = group.triggers.sort((a, b) => a.raceId.localeCompare(b.raceId));
    if (!triggers.length || group.controls.length < triggers.length) return [];
    return [{ key, triggers, controls: group.controls }];
  });
  const target = matched.filter(class4).length;
  const covered = strata.reduce((n, { triggers }) => n + triggers.length, 0);
  if (!covered) return { basis, target, covered, draws: 0, actual: null, median: null, p05: null, p95: null, actualMinusMedian: null, fractionAtLeastActual: null };
  const actual = 0 - strata.reduce((total, { triggers }) =>
    total + triggers.reduce((sum, r) => sum + (amount(r, basis) ?? 0), 0), 0);
  const distribution = Array.from({ length: CONTROL_DRAWS }, (_, draw) =>
    0 - strata.reduce((total, { key, controls, triggers }) => {
      const ordered = controls.map(r => ({
        r, order: createHash("sha256").update(JSON.stringify([CONTROL_SEED, draw, key, r.raceId])).digest("hex"),
      })).sort((a, b) => a.order.localeCompare(b.order) || a.r.raceId.localeCompare(b.r.raceId));
      return total + ordered.slice(0, triggers.length).reduce((sum, { r }) => sum + (amount(r, basis) ?? 0), 0);
    }, 0)).sort((a, b) => a - b);
  const quantile = (p: number) => distribution[Math.floor((distribution.length - 1) * p)];
  const median = quantile(0.5);
  return {
    basis, target, covered, draws: distribution.length, actual, median, p05: quantile(0.05), p95: quantile(0.95),
    actualMinusMedian: actual - median, fractionAtLeastActual: distribution.filter(value => value >= actual - 1e-10).length / distribution.length,
  };
}

const discoveryCourses = new Set(["Musselburgh", "Limerick", "Clonmel", "Ffos Las", "Newton Abbot"]);
const byBasis = (races: readonly Observation[]) => [compare(races, "captured"), compare(races, "sp")];

export function summarizeHurdleClass4(data: HurdleClass4Data | null) {
  const races = data?.races ?? [];
  const resolved = races.filter(r => r.settlement?.status === "settled");
  const class4Settled = resolved.filter(class4);
  const reviewRace = class4Settled[149];
  const review = reviewRace ? races.slice(0, races.indexOf(reviewRace) + 1) : races;
  const meetings = new Map<string, Observation[]>();
  for (const r of races) {
    const key = r.raceDate + " · " + r.course;
    const group = meetings.get(key) ?? [];
    group.push(r);
    meetings.set(key, group);
  }
  return {
    eligible: races.length, retained: races.filter(r => r.decision === "BET").length,
    existingAbstentions: races.filter(r => !retainedByExisting(r)).length,
    additionalAbstentions: races.filter(class4).length,
    winners: resolved.filter(r => r.decision === "BET" && r.settlement?.winner).length,
    missedWinners: resolved.filter(r => r.decision === "NO BET" && r.settlement?.winner).length,
    pending: races.filter(r => !r.settlement).length,
    refunds: races.filter(r => r.settlement && r.settlement.status !== "settled").length,
    missingCapturedPrice: races.filter(r => r.t2.capturedPrice === null).length,
    class4Settled: class4Settled.length,
    prices: byBasis(races),
    reviewCutoff: reviewRace?.capturedAt ?? null,
    reviewPrices: byBasis(review),
    outsideDiscoveryCourses: byBasis(review.filter(r => !discoveryCourses.has(r.course))),
    controls: (["captured", "sp"] as const).map(basis => hurdleClass4Control(review, basis)),
    meetings: [...meetings].map(([meeting, group]) => ({ meeting, prices: byBasis(group) })),
  };
}
