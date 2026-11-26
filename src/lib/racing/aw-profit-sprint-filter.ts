import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { AW_PROFIT_V1 } from "./aw-profit-policy";
import type { loadAwProfitShadow } from "./aw-profit-shadow";
import { resolveAwMaterial } from "./aw-surface-material";
import { isSupportedAllWeatherRace } from "./aw-speed-rating";
import { mutateFrozenJson } from "./frozen-json-store";
import { verifyFrozenFinalSp, type HurdleFinalSpResults } from "./hurdle-final-sp";
import { classifyHandicapStatus } from "./research-rule";
import { CANONICAL_SETTLEMENT_VERSION } from "./research-settlement-version";
import { GENERATION_MODEL_HASHES } from "./tissue-generation-config";
import { frozenNumeric } from "./tissue-generation-features";
import { generationRaceSchema, validGenerationCapture, type GenerationRace } from "./tissue-generation-forward";
import { getLocalRacingDate, type TodayRace } from "./todays-racing";
import { winGrossReturn } from "./win-settlement";

export const AW_SPRINT_ID = "AW_PROFIT_V1_SPRINT_FILTER_V1";
export const AW_SPRINT_PATH = "data/research/aw-profit-v1-sprint-filter-v1.json";
type Source = NonNullable<Awaited<ReturnType<typeof loadAwProfitShadow>>>["races"][number];
export type SprintCard = { race: TodayRace; sourceHandicap: boolean | null };
const iso = z.iso.datetime(), id = z.string().min(1), price = z.number().finite().gt(1);
const stages = new Set(["DORMANT", "PRE_RACE", "PARADING", "GOINGDOWN", "GOINGBEHIND", "ATTHEPOST"]);
const pick = z.object({
  runnerId: id, horseId: id, horseName: id, rank: z.number().int().min(1).max(3),
  capturedPrice: price.nullable(), quotes: z.array(generationRaceSchema.shape.runners.element.shape.quotes.element),
}).strict();
const outcome = z.object({
  version: z.literal(CANONICAL_SETTLEMENT_VERSION), status: z.enum(["settled", "NR", "void"]),
  settledAt: iso, recordedAt: iso, winner: z.boolean().nullable(), finishPosition: z.number().int().positive().nullable(),
  divisor: z.number().int().positive(), capturedPL: z.number().finite().nullable(),
  finalSp: z.object({ fractional: id, decimal: price, profitLoss: z.number().finite() }).strict().nullable(),
}).strict();
const rowSchema = z.object({
  raceId: id, raceDate: z.iso.date(), course: id, sourceId: id, modelHash: z.literal(GENERATION_MODEL_HASHES.AW),
  scheduledOff: iso, sourceCapturedAt: iso, featureCutoffAt: iso, v1DecidedAt: iso, capturedAt: iso,
  awConfirmed: z.boolean(), handicap: z.enum(["handicap", "non-handicap", "unknown"]),
  distanceYards: z.number().int().positive().nullable(), material: z.enum(["TAPETA", "POLYTRACK", "FIBRESAND", "UNKNOWN"]),
  completeMarket: z.boolean(), t2: pick, v1: pick.nullable(), selectionRunnerId: id.nullable(),
  reason: z.enum(["v1_no_bet", "sprint_handicap_filter", "v1_retained"]),
  outcomes: z.object({ t2: outcome.nullable(), v1: outcome.nullable() }).strict(),
}).strict();
type Row = z.infer<typeof rowSchema>;

export function sprintDecision(v1: Row["v1"], awConfirmed: boolean, handicap: Row["handicap"], distanceYards: number | null) {
  if (!v1) return { selectionRunnerId: null, reason: "v1_no_bet" as const };
  if (awConfirmed && handicap === "handicap" && distanceYards !== null &&
      Number.isSafeInteger(distanceYards) && distanceYards >= 990 && distanceYards <= 1429)
    return { selectionRunnerId: null, reason: "sprint_handicap_filter" as const };
  return { selectionRunnerId: v1.runnerId, reason: "v1_retained" as const };
}

const schema = z.object({ policy: z.literal(AW_SPRINT_ID), version: z.literal(1), armedAt: iso, races: z.array(rowSchema) }).strict()
  .refine(data => new Set(data.races.map(r => r.raceId)).size === data.races.length && data.races.every(r => {
    const expected = sprintDecision(r.v1, r.awConfirmed, r.handicap, r.distanceYards);
    return data.armedAt <= r.sourceCapturedAt && r.featureCutoffAt <= r.sourceCapturedAt &&
      r.sourceCapturedAt <= r.v1DecidedAt && r.v1DecidedAt <= r.capturedAt && r.capturedAt < r.scheduledOff &&
      [r.sourceCapturedAt, r.capturedAt, r.scheduledOff].every(t => getLocalRacingDate(new Date(t)) === r.raceDate) &&
      r.t2.rank === 2 && r.reason === expected.reason && r.selectionRunnerId === expected.selectionRunnerId &&
      [r.t2, r.v1].every(p => !p || r.completeMarket === (p.capturedPrice !== null)) &&
      (!r.outcomes.v1 || !!r.v1) && [r.outcomes.t2, r.outcomes.v1].every(o => !o ||
        r.scheduledOff <= o.settledAt && o.settledAt <= o.recordedAt && (o.status === "settled" ? o.winner !== null :
          o.winner === null && o.capturedPL === null && o.finalSp === null));
  }), "Invalid sprint filter ledger");
export type AwSprintData = z.infer<typeof schema>;

export async function loadAwSprint(path = AW_SPRINT_PATH): Promise<AwSprintData | null> {
  try { return schema.parse(JSON.parse(await readFile(path, "utf8"))); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return null; throw e; }
}

function mutate(path: string, update: (data: AwSprintData | null) => AwSprintData | null) {
  return mutateFrozenJson(path, () => loadAwSprint(path), value => schema.nullable().parse(value), (before, after) => {
    if (!before) {
      if (after?.races.length) throw new Error("Sprint filter must arm empty");
      return;
    }
    if (!after || before.armedAt !== after.armedAt || before.races.length > after.races.length) throw new Error("Cannot reset sprint filter");
    for (const [i, { outcomes, ...old }] of before.races.entries()) {
      const { outcomes: next, ...frozen } = after.races[i];
      if (JSON.stringify(old) !== JSON.stringify(frozen)) throw new Error("Cannot rewrite sprint filter decisions");
      for (const arm of ["t2", "v1"] as const) {
        const prior = outcomes[arm], current = next[arm];
        if (prior && (!current || JSON.stringify({ ...prior, finalSp: null }) !== JSON.stringify({ ...current, finalSp: null }) ||
            prior.finalSp && JSON.stringify(prior.finalSp) !== JSON.stringify(current.finalSp))) throw new Error("Cannot rewrite sprint filter settlement");
      }
    }
  }, update);
}

export const armAwSprint = (path = AW_SPRINT_PATH) =>
  mutate(path, data => data ?? { policy: AW_SPRINT_ID, version: 1, armedAt: new Date().toISOString(), races: [] });

const bookKey = (raceId: string, capturedAt: string) => raceId + "|" + capturedAt;

function freeze(source: Source, book: GenerationRace, card: SprintCard | undefined, now: Date): Row | null {
  const capturedAt = now.toISOString();
  if (book.family !== "AW" || !validGenerationCapture(book) || book.runners.some(r => r.outcome) ||
      source.featureCutoffAt !== book.featureCutoffAt || source.scheduledOff !== book.scheduledOff ||
      source.raceDate !== book.raceDate || source.course !== book.course || source.modelHash !== book.modelHash ||
      source.completeMarket !== book.completeMarket || !stages.has(source.sourceStage) ||
      source.decidedAt > capturedAt || capturedAt >= source.scheduledOff || getLocalRacingDate(now) !== source.raceDate ||
      source.runners.length !== book.runners.length || Object.keys(source.outcomes).length) return null;
  const frozen = new Map(book.runners.map(r => [r.runnerId, r]));
  if (!source.runners.every(r => {
    const match = frozen.get(r.runnerId);
    return match && match.horseId === r.horseId && match.rank === r.rank && match.probability === r.probability &&
      JSON.stringify(match.quotes) === JSON.stringify(r.quotes);
  })) return null;
  const makePick = (runner: GenerationRace["runners"][number]): Row["t2"] => ({
    runnerId: runner.runnerId, horseId: runner.horseId, horseName: runner.horseName, rank: runner.rank,
    capturedPrice: runner.capturedPrice, quotes: runner.quotes,
  });
  const second = book.runners.find(r => r.rank === 2);
  const v1Id = source.picks[AW_PROFIT_V1];
  const v1Runner = v1Id === null ? null : frozen.get(v1Id);
  if (!second || (v1Id !== null && !v1Runner)) return null;

  const race = card?.race;
  const stage = race?.raceStage?.trim().toUpperCase();
  if (race && ((stage && !stages.has(stage)) || race.winningTime ||
      race.runners.some(r => r.finishingPosition !== null || r.resultStatus !== null && r.resultStatus !== "non_runner"))) return null;
  const active = (race?.runners ?? []).filter(r => r.resultStatus !== "non_runner");
  const verified = !!race && !!stage && race.sourceId === source.sourceId && race.raceId === source.raceId &&
    race.raceDateTime?.toISOString() === source.scheduledOff && active.length === book.runners.length &&
    new Set(active.map(r => r.runnerId)).size === active.length && active.every(r => frozen.get(r.runnerId)?.horseId === r.horseId);
  const awConfirmed = verified && isSupportedAllWeatherRace({ ...race, courseName: source.course });
  const type = verified ? classifyHandicapStatus(race) : "unknown";
  const explicitNon = race && /\bnon[ -]+handicap\b/i.test([race.raceName, race.raceType, race.raceTypeCode].join(" "));
  const value = (runner: GenerationRace["runners"][number], k: string) => frozenNumeric(book.featureNames, runner.modelInputs, k);
  const handicap = type === "handicap" && !explicitNon && card?.sourceHandicap === true && book.runners.every(r => value(r, "handicap") === 1)
    ? "handicap" : type === "non_handicap" && card?.sourceHandicap === false && book.runners.every(r => value(r, "handicap") === 0)
      ? "non-handicap" : "unknown";
  const yards = race?.distanceYards;
  const distanceYards = verified && yards != null && Number.isSafeInteger(yards) && yards > 0 && book.runners.every(r => {
    const x = value(r, "distance_furlongs");
    return x !== null && Math.abs(x * 220 - yards) < 1e-7;
  }) ? yards : null;
  const material = resolveAwMaterial({ course: source.course, raceDate: source.raceDate, surface: race?.surface ?? null, aw: awConfirmed }).material;
  const v1 = v1Runner ? makePick(v1Runner) : null;
  return {
    raceId: source.raceId, raceDate: source.raceDate, course: source.course, sourceId: source.sourceId, modelHash: book.modelHash,
    scheduledOff: source.scheduledOff, sourceCapturedAt: source.sourceCapturedAt, featureCutoffAt: source.featureCutoffAt,
    v1DecidedAt: source.decidedAt, capturedAt, awConfirmed, handicap, distanceYards, material,
    completeMarket: book.completeMarket, t2: makePick(second), v1, ...sprintDecision(v1, awConfirmed, handicap, distanceYards),
    outcomes: { t2: null, v1: null },
  };
}

export function captureAwSprint(sources: readonly Source[], books: readonly GenerationRace[], cards: ReadonlyMap<string, SprintCard>,
  since: Date, path = AW_SPRINT_PATH, clock = () => new Date()) {
  const byBook = new Map(books.map(b => [bookKey(b.raceId, b.capturedAt), b]));
  return mutate(path, data => {
    if (!data) return null;
    const now = clock();
    if (!Number.isFinite(since.getTime()) || since > now || getLocalRacingDate(since) !== getLocalRacingDate(now))
      throw new Error("Capture requires today's collection start");
    const seen = new Set(data.races.map(r => r.raceId));
    for (const source of sources) {
      if (seen.has(source.raceId) || source.sourceCapturedAt < data.armedAt || Date.parse(source.sourceCapturedAt) < since.getTime()) continue;
      const book = byBook.get(bookKey(source.raceId, source.sourceCapturedAt));
      const row = book && freeze(source, book, cards.get(source.raceId), clock());
      if (!row) continue;
      data.races.push(row);
      seen.add(row.raceId);
    }
    return data;
  });
}

export function pendingAwSprint(data: AwSprintData) {
  return data.races.filter(r => {
    const pending = (o: Row["outcomes"]["t2"]) => !o || o.status === "settled" && !o.finalSp;
    return pending(r.outcomes.t2) || !!r.v1 && pending(r.outcomes.v1);
  });
}

export function settleAwSprint(books: readonly GenerationRace[], results: HurdleFinalSpResults, path = AW_SPRINT_PATH, now = new Date()) {
  const byBook = new Map(books.map(b => [bookKey(b.raceId, b.capturedAt), b]));
  return mutate(path, data => {
    if (!data) return null;
    for (const r of pendingAwSprint(data)) {
      const b = byBook.get(bookKey(r.raceId, r.sourceCapturedAt));
      if (b?.family !== "AW" || b.modelHash !== r.modelHash || now < new Date(r.scheduledOff)) continue;
      const field = results.get(r.raceId);
      for (const arm of ["t2", "v1"] as const) {
        const p = r[arm], previous = r.outcomes[arm];
        if (!p || previous?.finalSp || previous && previous.status !== "settled") continue;
        const source = b.runners.find(x => x.runnerId === p.runnerId && x.horseId === p.horseId && x.rank === p.rank && x.capturedPrice === p.capturedPrice)?.outcome;
        if (!source || source.settlementVersion !== CANONICAL_SETTLEMENT_VERSION ||
            source.settledAt < r.scheduledOff || Date.parse(source.settledAt) > now.getTime()) continue;
        const sp = source.status === "settled" ? verifyFrozenFinalSp(field, p.runnerId, source).settlement : null;
        const fractional = field?.get(p.runnerId)?.resultPrice;
        r.outcomes[arm] = {
          version: CANONICAL_SETTLEMENT_VERSION, status: source.status, settledAt: source.settledAt, recordedAt: previous?.recordedAt ?? now.toISOString(),
          winner: source.winner, finishPosition: source.finishPosition, divisor: source.deadHeatDivisor,
          capturedPL: source.status === "settled" && p.capturedPrice !== null
            ? winGrossReturn({ won: source.winner === true, decimalOdds: p.capturedPrice, deadHeatDivisor: source.deadHeatDivisor }) - 1 : null,
          finalSp: sp && fractional ? { fractional, decimal: sp.settlementOddsDecimal, profitLoss: sp.profitLoss } : null,
        };
      }
    }
    return data;
  });
}

type Basis = "captured" | "sp";
function amount(o: Row["outcomes"]["t2"], basis: Basis) {
  return !o ? null : o.status !== "settled" ? 0 : basis === "captured" ? o.capturedPL : o.finalSp?.profitLoss ?? null;
}

function matched(r: Row, basis: Basis) {
  return (basis !== "captured" || r.completeMarket) &&
    amount(r.outcomes.t2, basis) !== null && (!r.v1 || amount(r.outcomes.v1, basis) !== null);
}

function comparison(races: readonly Row[], basis: Basis) {
  const rows = races.filter(r => matched(r, basis));
  const totals = (arm: "t2" | "v1" | "shadow") => {
    const outcome = (r: Row) => arm === "t2" ? r.outcomes.t2 : arm === "v1" || r.selectionRunnerId ? r.outcomes.v1 : null;
    const selected = rows.map(outcome).filter(o => o?.status === "settled");
    const profit = rows.length ? selected.reduce((total, o) => total + (amount(o, basis) ?? 0), 0) : null;
    return { bets: selected.length, winners: selected.filter(o => o?.winner).length, profit,
      roi: profit !== null && selected.length ? profit / selected.length : null,
      abstentions: rows.filter(r => arm === "v1" ? !r.v1 : arm === "shadow" && !r.selectionRunnerId).length,
      missed: arm === "shadow" ? rows.filter(r => r.reason === "sprint_handicap_filter" && r.outcomes.v1?.winner).length : 0 };
  };
  const t2 = totals("t2"), v1 = totals("v1"), shadow = totals("shadow");
  return { basis, matched: rows.length, t2, v1, shadow,
    gainV1: shadow.profit === null ? null : shadow.profit - (v1.profit ?? 0),
    gainT2: shadow.profit === null ? null : shadow.profit - (t2.profit ?? 0) };
}

export function awSprintControl(races: readonly Row[], basis: Basis) {
  const eligible = races.filter(r => matched(r, basis) && r.outcomes.v1?.status === "settled" &&
    r.awConfirmed && r.handicap === "handicap" && r.distanceYards !== null);
  const target = eligible.filter(r => r.reason === "sprint_handicap_filter").length;
  const groups = Map.groupBy(eligible.filter(r => r.material !== "UNKNOWN"), r => r.raceDate.slice(0, 7) + "|" + r.material);
  const strata = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, rows]) => ({
    key,
    triggers: rows.filter(r => r.reason === "sprint_handicap_filter").sort((a, b) => a.raceId.localeCompare(b.raceId)),
    controls: rows.filter(r => r.reason === "v1_retained"),
  })).filter(g => g.triggers.length > 0);
  const comparable = strata.reduce((n, g) => n + g.controls.length, 0);
  const covered = strata.filter(g => g.controls.length >= g.triggers.length);
  const count = covered.reduce((n, g) => n + g.triggers.length, 0);
  if (!count) return { basis, comparable, target, count, draws: 0, actual: null, median: null, low: null, high: null, delta: null, atLeastActual: null, controlProfit: null };
  const stake = (r: Row) => amount(r.outcomes.v1, basis) ?? 0;
  const actual = 0 - covered.reduce((s, g) => s + g.triggers.reduce((p, r) => p + stake(r), 0), 0);
  // Membership uses frozen conditions and stake/price availability. Hash ordering uses no returns or winners.
  const gains = Array.from({ length: 1000 }, (_, draw) => 0 - covered.reduce((s, g) => {
    const ordered = g.controls.map(r => ({ r, order: createHash("sha256")
      .update(JSON.stringify([AW_SPRINT_ID, "month-material:v1", draw, g.key, r.raceId])).digest("hex") }))
      .sort((a, b) => a.order.localeCompare(b.order) || a.r.raceId.localeCompare(b.r.raceId));
    return s + ordered.slice(0, g.triggers.length).reduce((p, x) => p + stake(x.r), 0);
  }, 0)).sort((a, b) => a - b);
  const quantile = (p: number) => gains[Math.floor((gains.length - 1) * p)];
  const median = quantile(0.5);
  const v1Profit = comparison(races, basis).v1.profit ?? 0;
  return { basis, comparable, target, count, draws: gains.length, actual, median, low: quantile(0.05), high: quantile(0.95),
    delta: actual - median, atLeastActual: gains.filter(x => x >= actual - 1e-10).length / gains.length,
    controlProfit: { median: v1Profit + median, low: v1Profit + quantile(0.05), high: v1Profit + quantile(0.95) } };
}

export function summarizeAwSprint(data: AwSprintData | null) {
  const rows = data?.races ?? [];
  return {
    races: rows.length, completeBoards: rows.filter(r => r.completeMarket).length,
    v1Selections: rows.filter(r => r.v1).length, shadowSelections: rows.filter(r => r.selectionRunnerId).length,
    sprintAbstentions: rows.filter(r => r.reason === "sprint_handicap_filter").length,
    missed: rows.filter(r => r.reason === "sprint_handicap_filter" && r.outcomes.v1?.winner).length,
    prices: (["captured", "sp"] as const).map(basis => comparison(rows, basis)),
    controls: (["captured", "sp"] as const).map(basis => awSprintControl(rows, basis)),
  };
}
