import { readFile } from "node:fs/promises";
import { z } from "zod";
import { summarizeBookmakerMarket } from "./forward-value";
import { mutateFrozenJson } from "./frozen-json-store";
import { verifyFrozenFinalSp, type HurdleFinalSpResults } from "./hurdle-final-sp";
import { classifyHandicapStatus } from "./research-rule";
import { CANONICAL_SETTLEMENT_VERSION } from "./research-settlement-version";
import { GENERATION_MODEL_HASHES } from "./tissue-generation-config";
import { frozenNumeric } from "./tissue-generation-features";
import { generationRaceSchema, type GenerationRace } from "./tissue-generation-forward";
import { GENERATION_MODEL_VERSIONS } from "./tissue-generation-model";
import { getLocalRacingDate, type TodayRace } from "./todays-racing";
import { winGrossReturn } from "./win-settlement";

export const CHASE_CLASS46_ID = "CHASE_T3_CLASS46_HANDICAP_V1";
export const CHASE_CLASS46_PATH = "data/research/chase-t3-class46-handicap-v1.json";

const timestamp = z.iso.datetime();
const price = z.number().finite().gt(1);
const id = z.string().min(1);
const raceClass = z.number().int().positive();
const quote = generationRaceSchema.shape.runners.element.shape.quotes.element;
const pickSchema = z.object({
  runnerId: id, horseId: id, horseName: id, rank: z.union([z.literal(2), z.literal(3)]),
  probability: z.number().positive().max(1), quotes: z.array(quote), capturedPrice: price.nullable(),
  priceCapturedAt: timestamp, priceStatus: z.enum(["available", "missing"]),
}).strict();
const outcomeSchema = z.object({
  version: z.literal(CANONICAL_SETTLEMENT_VERSION), status: z.enum(["settled", "NR", "void"]),
  recordedAt: timestamp, winner: z.boolean().nullable(), deadHeatDivisor: z.number().int().positive(),
  finishPosition: z.number().int().positive().nullable(), capturedProfitLoss: z.number().finite().nullable(),
  finalSp: z.object({ fractional: id, decimal: price, profitLoss: z.number().finite(), verifiedAt: timestamp }).strict().nullable(),
}).strict();
const observationSchema = z.object({
  raceId: id, raceDate: z.iso.date(), course: id, family: z.literal("CHASE"),
  scheduledOff: timestamp, sourceCapturedAt: timestamp, featureCutoffAt: timestamp, capturedAt: timestamp,
  modelHash: z.literal(GENERATION_MODEL_HASHES.CHASE),
  handicap: z.enum(["handicap", "non-handicap", "unknown"]),
  officialClass: raceClass.nullable(),
  evidence: z.object({
    handicapInputs: z.array(z.union([z.literal(0), z.literal(1), z.null()])).min(2),
    classInputs: z.array(raceClass.nullable()).min(2),
    officialClassText: z.string().nullable(), cardIdentityVerified: z.boolean(),
    cardHandicap: z.enum(["handicap", "non-handicap", "unknown"]),
    cardSourceId: id.nullable(), cardStage: z.string().nullable(), t3Withdrawn: z.boolean(),
  }).strict(),
  t2: pickSchema.nullable(), t3: pickSchema.nullable(),
  decision: z.enum(["T3_SUBSTITUTION", "T2_RETAINED", "NO_SELECTION"]),
  selectionRunnerId: id.nullable(),
  reason: z.enum(["class46_handicap", "missing_or_invalid_t2", "missing_or_invalid_t3", "t3_withdrawn",
    "unknown_handicap", "non_handicap", "unknown_class", "other_class"]),
  outcomes: z.object({ t2: outcomeSchema.nullable(), shadow: outcomeSchema.nullable() }).strict(),
}).strict();

type FrozenPick = z.infer<typeof pickSchema>;
type Outcome = z.infer<typeof outcomeSchema>;
export type ChaseClass46Observation = z.infer<typeof observationSchema>;
type Decision = Pick<ChaseClass46Observation, "decision" | "selectionRunnerId" | "reason">;

function handicapStatus(evidence: ChaseClass46Observation["evidence"]) {
  const values = evidence.handicapInputs;
  const frozen = values.every(value => value === 1) ? "handicap" : values.every(value => value === 0) ? "non-handicap" : "unknown";
  return evidence.cardIdentityVerified && evidence.cardHandicap === frozen ? frozen : "unknown";
}

function officialClass(evidence: ChaseClass46Observation["evidence"]) {
  const match = evidence.officialClassText?.trim().match(/^(?:class\s+)?([1-9]\d*)$/i);
  const value = match && Number(match[1]);
  return evidence.cardIdentityVerified && value && evidence.classInputs.every(input => input === value) ? value : null;
}

function choose({ t2, t3, handicap, officialClass, evidence }: Pick<ChaseClass46Observation,
  "t2" | "t3" | "handicap" | "officialClass" | "evidence">): Decision {
  if (!t2) return { decision: "NO_SELECTION", selectionRunnerId: null, reason: "missing_or_invalid_t2" };
  const retain = (reason: Decision["reason"]): Decision => ({ decision: "T2_RETAINED", selectionRunnerId: t2.runnerId, reason });
  if (!t3) return retain("missing_or_invalid_t3");
  if (evidence.t3Withdrawn) return retain("t3_withdrawn");
  if (handicap !== "handicap") return retain(handicap === "unknown" ? "unknown_handicap" : "non_handicap");
  if (officialClass === null) return retain("unknown_class");
  if (![4, 5, 6].includes(officialClass)) return retain("other_class");
  return { decision: "T3_SUBSTITUTION", selectionRunnerId: t3.runnerId, reason: "class46_handicap" };
}

export function shadowPick(row: ChaseClass46Observation) {
  return row.decision === "T3_SUBSTITUTION" ? row.t3 : row.decision === "T2_RETAINED" ? row.t2 : null;
}

const parseTime = Date.parse;
const schema = z.object({
  policy: z.literal(CHASE_CLASS46_ID), version: z.literal(1), armedAt: timestamp, races: z.array(observationSchema),
}).strict().refine(data => new Set(data.races.map(r => r.raceId)).size === data.races.length && data.races.every(r => {
  const decision = choose(r);
  return parseTime(data.armedAt) <= parseTime(r.sourceCapturedAt) &&
    parseTime(r.featureCutoffAt) <= parseTime(r.sourceCapturedAt) &&
    parseTime(r.sourceCapturedAt) <= parseTime(r.capturedAt) &&
    parseTime(r.capturedAt) < parseTime(r.scheduledOff) &&
    [r.sourceCapturedAt, r.capturedAt, r.scheduledOff].every(at => getLocalRacingDate(new Date(at)) === r.raceDate) &&
    r.handicap === handicapStatus(r.evidence) && r.officialClass === officialClass(r.evidence) &&
    (!r.t2 || r.t2.rank === 2) && (!r.t3 || r.t3.rank === 3) &&
    (!r.t2 || !r.t3 || (r.t2.runnerId !== r.t3.runnerId && r.t2.horseId !== r.t3.horseId && r.t2.probability >= r.t3.probability)) &&
    [r.t2, r.t3].every(p => !p || (p.priceCapturedAt === r.sourceCapturedAt &&
      p.capturedPrice === summarizeBookmakerMarket(p.quotes).decimalPrice &&
      p.priceStatus === (p.capturedPrice === null ? "missing" : "available"))) &&
    r.decision === decision.decision && r.selectionRunnerId === decision.selectionRunnerId && r.reason === decision.reason &&
    (!r.outcomes.t2 || !!r.t2) && (!r.outcomes.shadow || !!shadowPick(r)) &&
    Object.values(r.outcomes).every(o => !o || parseTime(o.recordedAt) >= parseTime(r.scheduledOff) &&
      (o.status === "settled" ? o.winner !== null : o.winner === null && o.capturedProfitLoss === null && o.finalSp === null));
}), "Invalid Chase Class 4–6 shadow ledger");

export type ChaseClass46Data = z.infer<typeof schema>;

export async function loadChaseClass46(path = CHASE_CLASS46_PATH): Promise<ChaseClass46Data | null> {
  try {
    return schema.parse(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function mutateChase(path: string, mutate: (data: ChaseClass46Data | null) => ChaseClass46Data | null) {
  return mutateFrozenJson(path, () => loadChaseClass46(path), value => schema.nullable().parse(value), (before, after) => {
    if (!before) {
      if (after?.races.length) throw new Error("Chase shadow must arm with an empty ledger");
      return;
    }
    if (!after || before.armedAt !== after.armedAt || after.races.length < before.races.length)
      throw new Error("Cannot reset Chase shadow activation or remove observations");
    for (const [index, row] of before.races.entries()) {
      const { outcomes: old, ...frozen } = row;
      const { outcomes: next, ...current } = after.races[index];
      if (JSON.stringify(frozen) !== JSON.stringify(current)) throw new Error("Cannot rewrite Chase shadow decisions");
      for (const arm of ["t2", "shadow"] as const) {
        const prior = old[arm], update = next[arm];
        if (prior && (!update ||
            JSON.stringify({ ...prior, finalSp: null }) !== JSON.stringify({ ...update, finalSp: null }) ||
            (prior.finalSp && JSON.stringify(prior.finalSp) !== JSON.stringify(update.finalSp)))) {
          throw new Error("Cannot rewrite recorded Chase outcomes");
        }
      }
    }
  }, mutate);
}

export function armChaseClass46(path = CHASE_CLASS46_PATH) {
  return mutateChase(path, data => data ?? { policy: CHASE_CLASS46_ID, version: 1, armedAt: new Date().toISOString(), races: [] });
}

const preOffStages = new Set(["DORMANT", "PRE_RACE", "PARADING", "GOINGDOWN", "GOINGBEHIND", "ATTHEPOST"]);
function freezePick(book: GenerationRace, rank: 2 | 3): FrozenPick | null {
  const runners = book.runners.filter(r => r.rank === rank);
  const r = runners[0];
  if (runners.length !== 1 || book.runners.filter(x => x.runnerId === r.runnerId || x.horseId === r.horseId).length !== 1) return null;
  const capturedPrice = summarizeBookmakerMarket(r.quotes).decimalPrice;
  const parsed = pickSchema.safeParse({
    runnerId: r.runnerId, horseId: r.horseId, horseName: r.horseName, rank, probability: r.probability,
    quotes: r.quotes, capturedPrice, priceCapturedAt: book.capturedAt, priceStatus: capturedPrice === null ? "missing" : "available",
  });
  return parsed.success ? parsed.data : null;
}

function freezeObservation(book: GenerationRace, card: TodayRace | undefined, since: Date, armedAt: string, now: Date): ChaseClass46Observation | null {
  if (book.family !== "CHASE" || book.modelHash !== GENERATION_MODEL_HASHES.CHASE || book.modelVersion !== GENERATION_MODEL_VERSIONS.CHASE ||
      getLocalRacingDate(now) !== book.raceDate || now >= new Date(book.scheduledOff) ||
      parseTime(book.capturedAt) > now.getTime() || parseTime(book.capturedAt) < Math.max(since.getTime(), parseTime(armedAt)) ||
      book.runners.some(r => r.outcome !== null) || !generationRaceSchema.safeParse(book).success) return null;
  const stage = card?.raceStage?.trim().toUpperCase();
  if (card && ((stage && !preOffStages.has(stage)) || card.winningTime ||
      card.runners.some(r => r.finishingPosition !== null || (r.resultStatus !== null && r.resultStatus !== "non_runner")))) return null;
  const t2 = freezePick(book, 2);
  const third = freezePick(book, 3);
  const t3 = t2 && third && third.probability > t2.probability ? null : third;
  const cardIdentityVerified = !!card && !!stage && card.raceId === book.raceId && !!card.sourceId &&
    card.raceDateTime?.getTime() === parseTime(book.scheduledOff) &&
    new Set(card.runners.map(r => r.runnerId)).size === card.runners.length &&
    book.runners.every(r => card.runners.some(c => c.runnerId === r.runnerId && c.horseId === r.horseId)) &&
    card.runners.filter(c => c.resultStatus !== "non_runner").every(c => book.runners.some(r => r.runnerId === c.runnerId && r.horseId === c.horseId));
  const explicitNonHandicap = card && /\bnon[ -]+handicap\b/i.test([card.raceName, card.raceType, card.raceTypeCode].join(" "));
  const classified = cardIdentityVerified && card && !explicitNonHandicap ? classifyHandicapStatus(card) : "unknown";
  const evidence: ChaseClass46Observation["evidence"] = {
    handicapInputs: book.runners.map(r => {
      const value = frozenNumeric(book.featureNames, r.modelInputs, "handicap");
      return value === 0 || value === 1 ? value : null;
    }),
    classInputs: book.runners.map(r => {
      const value = frozenNumeric(book.featureNames, r.modelInputs, "class");
      return value !== null && Number.isInteger(value) && value > 0 ? value : null;
    }),
    officialClassText: card?.raceClass ?? null, cardSourceId: card?.sourceId ?? null, cardStage: stage ?? null,
    cardHandicap: classified === "non_handicap" ? "non-handicap" : classified,
    cardIdentityVerified,
    t3Withdrawn: cardIdentityVerified && !!t3 && !!card?.runners.some(r => r.runnerId === t3.runnerId && r.resultStatus === "non_runner"),
  };
  const eligibility = { t2, t3, handicap: handicapStatus(evidence), officialClass: officialClass(evidence), evidence } as const;
  return {
    ...eligibility, ...choose(eligibility), family: "CHASE", modelHash: book.modelHash, raceId: book.raceId,
    raceDate: book.raceDate, course: book.course, scheduledOff: book.scheduledOff, capturedAt: now.toISOString(),
    sourceCapturedAt: book.capturedAt, featureCutoffAt: book.featureCutoffAt, outcomes: { t2: null, shadow: null },
  };
}

export function captureChaseClass46(books: readonly GenerationRace[], cards: ReadonlyMap<string, TodayRace>,
  since: Date, path = CHASE_CLASS46_PATH, clock = () => new Date()) {
  return mutateChase(path, data => {
    if (!data) return null;
    const now = clock();
    if (!Number.isFinite(since.getTime()) || since > now || getLocalRacingDate(since) !== getLocalRacingDate(now))
      throw new Error("Capture requires today's collection start");
    const seen = new Set(data.races.map(r => r.raceId));
    for (const book of [...books].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))) {
      if (seen.has(book.raceId)) continue;
      const row = freezeObservation(book, cards.get(book.raceId), since, data.armedAt, clock());
      if (!row) continue;
      seen.add(row.raceId);
      data.races.push(row);
    }
    return data;
  });
}

export function pendingChaseClass46(data: ChaseClass46Data) {
  const pending = (outcome: Outcome | null) => !outcome || (outcome.status === "settled" && !outcome.finalSp);
  return data.races.filter(r => r.t2 && (pending(r.outcomes.t2) || pending(r.outcomes.shadow)));
}

export function settleChaseClass46(books: readonly GenerationRace[], results: HurdleFinalSpResults,
  path = CHASE_CLASS46_PATH, now = new Date()) {
  const byCapture = new Map(books.filter(b => b.family === "CHASE").map(b => [b.raceId + "|" + b.capturedAt, b]));
  return mutateChase(path, data => {
    if (!data) return null;
    for (const row of pendingChaseClass46(data)) {
      const book = byCapture.get(row.raceId + "|" + row.sourceCapturedAt);
      if (book?.modelHash !== row.modelHash || now < new Date(row.scheduledOff)) continue;
      const field = results.get(row.raceId);
      const update = (pick: FrozenPick | null, previous: Outcome | null): Outcome | null => {
        if (!pick || previous?.finalSp || (previous && previous.status !== "settled")) return previous;
        const frozen = book.runners.find(r => r.runnerId === pick.runnerId && r.horseId === pick.horseId &&
          r.rank === pick.rank && r.probability === pick.probability);
        const out = frozen?.outcome;
        if (!out || out.settlementVersion !== CANONICAL_SETTLEMENT_VERSION ||
            parseTime(out.settledAt) < parseTime(row.scheduledOff) || parseTime(out.settledAt) > now.getTime()) return previous;
        const sp = out.status === "settled" ? verifyFrozenFinalSp(field, pick.runnerId, out).settlement : null;
        const fractional = field?.get(pick.runnerId)?.resultPrice;
        return {
          version: CANONICAL_SETTLEMENT_VERSION, status: out.status, recordedAt: previous?.recordedAt ?? now.toISOString(),
          winner: out.winner, deadHeatDivisor: out.deadHeatDivisor, finishPosition: out.finishPosition,
          capturedProfitLoss: out.status === "settled" && pick.capturedPrice !== null
            ? winGrossReturn({ won: out.winner === true, decimalOdds: pick.capturedPrice, deadHeatDivisor: out.deadHeatDivisor }) - 1 : null,
          finalSp: sp && fractional ? { fractional, decimal: sp.settlementOddsDecimal, profitLoss: sp.profitLoss, verifiedAt: now.toISOString() } : null,
        };
      };
      const benchmark = update(row.t2, row.outcomes.t2);
      row.outcomes = { t2: benchmark, shadow: row.decision === "T2_RETAINED" ? benchmark : update(shadowPick(row), row.outcomes.shadow) };
    }
    return data;
  });
}

type Basis = "captured" | "sp";
function pairAmount(outcome: Outcome, basis: Basis) {
  if (outcome.status !== "settled") return 0;
  return basis === "captured" ? outcome.capturedProfitLoss : outcome.finalSp?.profitLoss ?? null;
}

export function chaseClass46Difference(row: ChaseClass46Observation, basis: Basis) {
  const { t2, shadow } = row.outcomes;
  if (!t2 || !shadow || (basis === "captured" && !hasPrices(row))) return null;
  const a = pairAmount(t2, basis), b = pairAmount(shadow, basis);
  return a === null || b === null ? null : b - a;
}

function hasPrices(row: ChaseClass46Observation) {
  return row.t2?.capturedPrice != null && shadowPick(row)?.capturedPrice != null;
}

function summarizeCohort(races: readonly ChaseClass46Observation[]) {
  const selected = races.filter(r => r.t2);
  const settled = selected.filter(r => r.outcomes.t2 && r.outcomes.shadow);
  const substitutions = races.filter(r => r.decision === "T3_SUBSTITUTION");
  const compare = (basis: Basis) => {
    const pairs = settled.filter(r => chaseClass46Difference(r, basis) !== null);
    const totals = (arm: "t2" | "shadow") => {
      const bets = pairs.map(r => r.outcomes[arm]!).filter(o => o.status === "settled");
      const profit = pairs.length ? bets.reduce((sum, o) => sum + (pairAmount(o, basis) ?? 0), 0) : null;
      return { bets: bets.length, winners: bets.filter(o => o.winner).length, profit, roi: profit !== null && bets.length ? profit / bets.length : null };
    };
    const benchmark = totals("t2"), shadow = totals("shadow");
    return { basis, pairs: pairs.length, benchmark, shadow,
      difference: benchmark.profit === null || shadow.profit === null ? null : shadow.profit - benchmark.profit };
  };
  return {
    captured: races.length, settled: settled.length, pending: selected.length - settled.length,
    substitutions: substitutions.length, retained: races.filter(r => r.decision === "T2_RETAINED").length,
    noSelection: races.length - selected.length, pairedQuotes: selected.filter(hasPrices).length,
    missingPrices: selected.filter(r => !hasPrices(r)).length,
    winners: settled.filter(r => r.outcomes.shadow?.winner).length,
    winnersGained: settled.filter(r => r.decision === "T3_SUBSTITUTION" && r.outcomes.shadow?.winner && !r.outcomes.t2?.winner).length,
    winnersMissed: settled.filter(r => r.decision === "T3_SUBSTITUTION" && r.outcomes.t2?.winner && !r.outcomes.shadow?.winner).length,
    capturedPrice: compare("captured"), finalSp: compare("sp"),
  };
}

export function summarizeChaseClass46(data: ChaseClass46Data | null) {
  const races = data?.races ?? [];
  return {
    ...summarizeCohort(races),
    latestCapture: races.map(r => r.capturedAt).sort().at(-1) ?? null,
    byClass: ([4, 5, 6, "Other"] as const).map(group => ({ group, ...summarizeCohort(races.filter(r =>
      group === "Other" ? ![4, 5, 6].includes(r.officialClass ?? 0) : r.officialClass === group)) })),
  };
}
