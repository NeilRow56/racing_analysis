import { captureIdentity, captureState, latestPreOffCaptures } from "./frozen-capture-selection";
import { readFile } from "node:fs/promises";
import { mutateFrozenJson } from "./frozen-json-store";
import { z } from "zod";
import { GENERATION_MODEL_HASHES, TISSUE_GENERATION, TISSUE_GENERATION_EPOCH, tissueGenerationActive } from "./tissue-generation-config";
import { GENERATION_MODEL_VERSIONS } from "./tissue-generation-model";
import { getLocalRacingDate, type TodayRace, type TodayMeeting } from "./todays-racing";
import { isVoidBetResultStatus, settleSelection } from "./backtest";
import { normalizeCompleteMarket, TISSUE_VALUE_FAMILIES, type ValueOutcome } from "./tissue-value-metrics";
import { summarizeProspectiveTissue } from "./tissue-prospective-summary";
import { summarizeBookmakerMarket } from "./forward-value";

export const TISSUE_GENERATION_FORWARD_PATH = "data/research/tissue-generation-forward-2026-11.json";
const finite = z.number().finite(), timestamp = z.iso.datetime();
const outcome = z.object({ status: z.enum(["settled", "NR", "void"]), winner: z.boolean().nullable(),
  finishPosition: z.number().int().positive().nullable(), resultStatus: z.string().nullable(), deadHeatDivisor: z.number().int().positive(),
  grossReturn: finite.nullable(), profitLoss: finite.nullable(), settledAt: timestamp }).strict();
const raceSchema = z.object({ family: z.enum(TISSUE_VALUE_FAMILIES), modelVersion: z.string(), modelHash: z.string().regex(/^[a-f0-9]{64}$/),
  raceId: z.string(), raceDate: z.iso.date(), course: z.string(), scheduledOff: timestamp, capturedAt: timestamp, featureCutoffAt: timestamp,
  featureNames: z.array(z.string()), adjustmentFeatureNames: z.array(z.string()), completeMarket: z.boolean(),
  marketSource: z.literal("sporting_life_median_bookmaker_at_capture_v1"),
  runners: z.array(z.object({ runnerId: z.string(), horseId: z.string(), horseName: z.string(), probability: finite.positive().max(1), rank: z.number().int().positive(),
    modelInputs: z.array(finite), adjustmentInputs: z.array(finite), capturedPrice: finite.gt(1).nullable(), marketProbability: finite.positive().max(1).nullable().optional(),
    quotes: z.array(z.object({ bookmakerId: z.number().nullable(), bookmakerName: z.string().nullable(), fractionalOdds: z.string().nullable(), decimalOdds: finite.gt(1) }).strict()),
    outcome: outcome.nullable() }).strict()).min(2),
}).strict();
const schema = z.object({ version: z.literal(TISSUE_GENERATION), epoch: z.literal(TISSUE_GENERATION_EPOCH), races: z.array(raceSchema) }).strict();
export const generationRaceSchema = raceSchema;
export type GenerationRace = z.infer<typeof raceSchema>;
export type GenerationData = z.infer<typeof schema>;
export const emptyTissueGeneration = (): GenerationData => ({ version: TISSUE_GENERATION, epoch: TISSUE_GENERATION_EPOCH, races: [] });
export function validGenerationCapture(r: GenerationRace) {
  if (![r.capturedAt, r.featureCutoffAt, r.scheduledOff].every(t => Number.isFinite(Date.parse(t)))) return false;
  if (r.modelVersion !== GENERATION_MODEL_VERSIONS[r.family] || r.modelHash !== GENERATION_MODEL_HASHES[r.family] || !tissueGenerationActive(new Date(r.capturedAt)) ||
    Date.parse(r.featureCutoffAt) > Date.parse(r.capturedAt) || Date.parse(r.capturedAt) >= Date.parse(r.scheduledOff) ||
    getLocalRacingDate(new Date(r.capturedAt)) !== r.raceDate || getLocalRacingDate(new Date(r.scheduledOff)) !== r.raceDate ||
    new Set(r.runners.map(x => x.runnerId)).size !== r.runners.length || Math.abs(r.runners.reduce((s, x) => s + x.probability, 0) - 1) > 1e-10 ||
    r.completeMarket !== r.runners.every(x => summarizeBookmakerMarket(x.quotes).decimalPrice !== null) ||
    r.runners.some(x => x.modelInputs.length !== r.featureNames.length || x.adjustmentInputs.length !== r.adjustmentFeatureNames.length ||
      (r.completeMarket ? x.capturedPrice !== summarizeBookmakerMarket(x.quotes).decimalPrice : x.capturedPrice !== null))) return false;
  const market = r.completeMarket ? normalizeCompleteMarket(r.runners.map(x => x.capturedPrice)) : null;
  if (r.runners.some((x, i) => x.marketProbability !== undefined &&
    (market ? x.marketProbability === null || !Number.isFinite(x.marketProbability) || Math.abs(x.marketProbability - market.probabilities[i]) > 1e-12 : x.marketProbability !== null))) return false;
  const order = [...r.runners].sort((a, b) => b.probability - a.probability || a.runnerId.localeCompare(b.runnerId));
  return r.runners.every(x => x.rank === (r.family === "TURF" ? 1 + r.runners.filter(y => y.probability > x.probability).length : order.findIndex(y => y.runnerId === x.runnerId) + 1));
}
export async function loadTissueGeneration(path = TISSUE_GENERATION_FORWARD_PATH): Promise<GenerationData> {
  try {
    const data = schema.parse(JSON.parse(await readFile(path, "utf8")));
    if (data.races.some(r => !validGenerationCapture(r)) || new Set(data.races.map(captureIdentity)).size !== data.races.length) throw new Error("Invalid generation ledger");
    return data;
  } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return emptyTissueGeneration(); throw e; }
}
export function appendTissueGeneration(data: GenerationData, additions: GenerationRace[], now = new Date(), forceRefresh = false) {
  const known = new Set(data.races.map(r => r.raceId));
  const identities = new Set(data.races.map(captureIdentity));
  const states = new Map(latestPreOffCaptures(data.races).map(r => [r.raceId, captureState(r)]));
  const accepted = additions.filter(r => {
    if ((!forceRefresh && known.has(r.raceId)) || identities.has(captureIdentity(r)) || states.get(r.raceId) === captureState(r) || !raceSchema.safeParse(r).success || !validGenerationCapture(r) ||
      r.runners.some(x => x.outcome !== null) || Date.parse(r.capturedAt) > now.getTime() || now.getTime() >= Date.parse(r.scheduledOff) ||
      getLocalRacingDate(now) !== r.raceDate) return false;
    known.add(r.raceId); identities.add(captureIdentity(r)); states.set(r.raceId, captureState(r)); return true;
  });
  return accepted.length ? { ...data, races: [...data.races, ...structuredClone(accepted)] } : data;
}
export function settleTissueGeneration(data: GenerationData, results: ReadonlyMap<string, TodayRace>, now = new Date()): GenerationData {
  return { ...data, races: data.races.map(book => {
    const race = results.get(book.raceId);
    if (!race || now < new Date(book.scheduledOff)) return book;
    const ids = new Set(race.runners.map(r => r.runnerId));
    if (ids.size !== race.runners.length || book.runners.some(r => !ids.has(r.runnerId))) return book;
    const starters = race.runners.filter(r => !isVoidBetResultStatus(r.resultStatus)), winners = starters.filter(r => r.finishingPosition === 1);
    if (starters.some(r => !book.runners.some(x => x.runnerId === r.runnerId))) return book;
    const complete = winners.length > 0 && (race.actualRunnerCount === starters.length || race.actualRunnerCount === race.runners.length) &&
      starters.every(r => (r.finishingPosition === null || (Number.isInteger(r.finishingPosition) && r.finishingPosition > 0 && r.finishingPosition <= starters.length)) &&
        settleSelection({ targetRaceId: race.raceId, targetRunnerId: r.runnerId, finishingPosition: r.finishingPosition, resultStatus: r.resultStatus, won: null, placed: null, startingPrice: null, startingPriceDecimal: "2" }) !== null);
    return { ...book, runners: book.runners.map(row => {
      if (row.outcome) return row;
      const runner = race.runners.find(r => r.runnerId === row.runnerId)!;
      const base = { finishPosition: runner.finishingPosition, resultStatus: runner.resultStatus, settledAt: now.toISOString() };
      if (isVoidBetResultStatus(runner.resultStatus)) return { ...row, outcome: { ...base, status: runner.resultStatus?.trim().toLowerCase() === "non_runner" ? "NR" as const : "void" as const, winner: null, deadHeatDivisor: 1, grossReturn: null, profitLoss: null } };
      if (!complete) return row;
      const winner = runner.finishingPosition === 1, deadHeatDivisor = winner ? winners.length : 1;
      const settled = settleSelection({ targetRaceId: race.raceId, targetRunnerId: row.runnerId, finishingPosition: runner.finishingPosition, resultStatus: runner.resultStatus,
        won: winner, placed: null, startingPrice: null, startingPriceDecimal: String(row.capturedPrice ?? 2), deadHeatDivisor });
      return settled ? { ...row, outcome: { ...base, status: "settled" as const, winner, deadHeatDivisor,
        grossReturn: row.capturedPrice === null ? null : settled.grossReturn, profitLoss: row.capturedPrice === null ? null : settled.profitLoss } } : row;
    }) };
  }) };
}
export async function mutateTissueGeneration(mutate: (data: GenerationData) => GenerationData | Promise<GenerationData>, path = TISSUE_GENERATION_FORWARD_PATH) {
  return mutateFrozenJson(path, () => loadTissueGeneration(path), value => schema.parse(value), (before, after) => {
    if (after.races.length < before.races.length) throw new Error("Cannot remove generation observations");
    for (const [i, old] of before.races.entries()) {
      const frozen = (r: GenerationRace) => ({ ...r, runners: r.runners.map(x => ({ ...x, outcome: null })) });
      if (JSON.stringify(frozen(old)) !== JSON.stringify(frozen(after.races[i])) || old.runners.some((r, j) => r.outcome && JSON.stringify(r.outcome) !== JSON.stringify(after.races[i].runners[j].outcome))) throw new Error("Cannot rewrite frozen generation observations");
    }
    if (after.races.some(r => !validGenerationCapture(r)) || new Set(after.races.map(captureIdentity)).size !== after.races.length || after.races.slice(before.races.length).some(r => r.runners.some(x => x.outcome !== null))) throw new Error("Invalid generation additions");
  }, mutate);
}
export function summarizeTissueGeneration(data: GenerationData) {
  return summarizeProspectiveTissue(data.races.flatMap(r => r.runners.map(x => ({ family: r.family, tissueRank: x.rank, probability: x.probability,
    capturedPrice: x.capturedPrice, outcome: x.outcome as ValueOutcome | null }))));
}
export function attachTissueGeneration(meetings: TodayMeeting[], data: GenerationData): TodayMeeting[] {
  const index = new Map(latestPreOffCaptures(data.races.filter(validGenerationCapture)).flatMap(r => {
    // Legacy books are projected from their own frozen prices only; never rewrite the ledger.
    const market = r.completeMarket ? normalizeCompleteMarket(r.runners.map(x => x.capturedPrice)) : null;
    return r.runners.map((x, i) => [`${r.raceId}|${x.runnerId}`, { rank: x.rank, probability: x.probability,
      modelVersion: r.modelVersion, capturedAt: r.capturedAt, family: r.family, generation: data.version,
      capturedPrice: x.capturedPrice, marketProbability: market ? x.marketProbability ?? market.probabilities[i] : null,
      completeMarket: r.completeMarket, bookIdentity: captureIdentity(r), marketSource: r.marketSource }] as const);
  }));
  return meetings.map(m => ({ ...m, races: m.races.map(r => ({ ...r, runners: r.runners.map(row => ({ ...row,
    activeTissue: index.get(`${r.raceId}|${row.runnerId}`), tissueGenerationActive: tissueGenerationActive() && r.raceDateTime !== null && r.raceDateTime >= new Date(TISSUE_GENERATION_EPOCH) })) })) }));
}
