import { raceSoftmax } from "../../../scripts/diagnose-independent-tissue-feasibility";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { mutateFrozenJson } from "./frozen-json-store";
import { latestPreOffCaptures, captureIdentity } from "./frozen-capture-selection";
import { generationRaceSchema, validGenerationCapture, settleTissueGeneration, emptyTissueGeneration, type GenerationRace } from "./tissue-generation-forward";
import { CONTEXT_SHADOW_VERSION, CONTEXT_SHADOW_EPOCH, CONTEXT_SHADOW_PATH, CONTEXT_SHADOW_CANDIDATES, type ContextShadowFamily } from "./context-weight-shadow-config";
import { contextShadowHash, predictContextWeightShadow } from "./context-weight-shadow-model";
import type { TissueGenerationModel } from "./tissue-generation-model";
import { getLocalRacingDate, type TodayRace } from "./todays-racing";

const finite = z.number().finite();
const predictionSchema = z.object({ runnerId: z.string(), probability: finite.positive().max(1), rank: z.number().int().positive(),
  productionLogit: finite, contextContribution: finite, shadowLogit: finite }).strict();
const observationSchema = z.object({ raceId: z.string(), family: z.enum(["AW", "TURF"]), candidateVersion: z.string(), candidateHash: z.string(),
  capturedAt: z.iso.datetime(), scheduledOff: z.iso.datetime(), frozenAt: z.iso.datetime(), captureMode: z.literal("live_sync"),
  production: generationRaceSchema, runners: z.array(predictionSchema).min(2) }).strict();
const schema = z.object({ version: z.literal(CONTEXT_SHADOW_VERSION), epoch: z.literal(CONTEXT_SHADOW_EPOCH), observations: z.array(observationSchema) }).strict();
export type ContextShadowObservation = z.infer<typeof observationSchema>;
export type ContextShadowData = z.infer<typeof schema>;
export const emptyContextWeightShadow = (): ContextShadowData => ({ version: CONTEXT_SHADOW_VERSION, epoch: CONTEXT_SHADOW_EPOCH, observations: [] });
const identity = (r: ContextShadowObservation) => `${r.candidateVersion}|${captureIdentity(r)}`;

export function validContextWeightShadow(r: ContextShadowObservation): boolean {
  if (!observationSchema.safeParse(r).success || !validGenerationCapture(r.production)) return false;
  const definition = CONTEXT_SHADOW_CANDIDATES[r.family];
  if (r.candidateVersion !== definition.id || r.candidateHash !== contextShadowHash(r.family) || r.production.family !== r.family ||
    r.production.modelHash !== definition.productionHash || r.production.modelVersion !== definition.productionVersion ||
    r.raceId !== r.production.raceId || r.capturedAt !== r.production.capturedAt || r.scheduledOff !== r.production.scheduledOff ||
    Date.parse(r.capturedAt) < Date.parse(CONTEXT_SHADOW_EPOCH) || Date.parse(r.frozenAt) < Date.parse(r.capturedAt) ||
    Date.parse(r.frozenAt) - Date.parse(r.capturedAt) > 60_000 || Date.parse(r.frozenAt) >= Date.parse(r.scheduledOff) ||
    new Set(r.runners.map(x => x.runnerId)).size !== r.runners.length || r.runners.length !== r.production.runners.length ||
    r.runners.some(x => !r.production.runners.some(p => p.runnerId === x.runnerId)) ||
    r.production.runners.some(x => x.outcome && (Date.parse(x.outcome.settledAt) < Date.parse(r.scheduledOff) ||
      (x.outcome.status === "settled" ? x.outcome.winner === null : x.outcome.winner !== null))) ||
    Math.abs(r.runners.reduce((s, x) => s + x.probability, 0) - 1) > 1e-10) return false;
  const multiplier = definition.multiplier;
  const productionP = raceSoftmax(r.runners.map(x => x.productionLogit)), shadowP = raceSoftmax(r.runners.map(x => x.shadowLogit));
  if (r.runners.some((x, i) => Math.abs(x.probability - shadowP[i]) > 1e-12 ||
    Math.abs(r.production.runners.find(p => p.runnerId === x.runnerId)!.probability - productionP[i]) > 1e-12)) return false;
  if (r.runners.some(x => Math.abs(x.shadowLogit - (x.productionLogit + (multiplier - 1) * x.contextContribution)) > 1e-12)) return false;
  const order = [...r.runners].sort((a, b) => b.probability - a.probability || a.runnerId.localeCompare(b.runnerId));
  return r.runners.every(x => x.rank === (r.family === "TURF" ? 1 + r.runners.filter(p => p.probability > x.probability).length : order.findIndex(p => p.runnerId === x.runnerId) + 1));
}

/** Only newly captured production books; never reconstruct a missed/old observation. */
export function buildContextWeightShadow(book: GenerationRace, model: TissueGenerationModel, now = new Date()): ContextShadowObservation | null {
  if ((book.family !== "AW" && book.family !== "TURF") || !validGenerationCapture(book) || book.runners.some(r => r.outcome !== null) ||
    !Number.isFinite(now.getTime()) || Date.parse(book.capturedAt) < Date.parse(CONTEXT_SHADOW_EPOCH) ||
    now.getTime() < Date.parse(book.capturedAt) || now.getTime() - Date.parse(book.capturedAt) > 60_000 ||
    now.getTime() >= Date.parse(book.scheduledOff) || getLocalRacingDate(now) !== book.raceDate) return null;
  const record: ContextShadowObservation = { raceId: book.raceId, family: book.family, candidateVersion: CONTEXT_SHADOW_CANDIDATES[book.family].id,
    candidateHash: contextShadowHash(book.family), capturedAt: book.capturedAt, scheduledOff: book.scheduledOff, frozenAt: now.toISOString(), captureMode: "live_sync",
    production: structuredClone(book), runners: predictContextWeightShadow(book, model) };
  return validContextWeightShadow(record) ? record : null;
}
export function appendContextWeightShadow(data: ContextShadowData, additions: ContextShadowObservation[], now = new Date()): ContextShadowData {
  const known = new Set(data.observations.map(identity));
  const accepted = additions.filter(r => {
    if (known.has(identity(r)) || !validContextWeightShadow(r) || r.production.runners.some(x => x.outcome !== null) ||
      Date.parse(r.frozenAt) > now.getTime() || now.getTime() >= Date.parse(r.scheduledOff) ||
      now.getTime() - Date.parse(r.capturedAt) > 60_000 || getLocalRacingDate(now) !== r.production.raceDate) return false;
    known.add(identity(r)); return true;
  });
  return accepted.length ? { ...data, observations: [...data.observations, ...structuredClone(accepted)] } : data;
}
export function settleContextWeightShadow(data: ContextShadowData, results: ReadonlyMap<string, TodayRace>, now = new Date()): ContextShadowData {
  return { ...data, observations: data.observations.map(r => ({ ...r,
    production: settleTissueGeneration({ ...emptyTissueGeneration(), races: [r.production] }, results, now).races[0] })) };
}
export function latestContextWeightShadows(data: ContextShadowData) {
  return (["AW", "TURF"] as ContextShadowFamily[]).flatMap(f => latestPreOffCaptures(data.observations.filter(r => r.family === f && validContextWeightShadow(r))));
}
export async function loadContextWeightShadow(path = CONTEXT_SHADOW_PATH): Promise<ContextShadowData> {
  try {
    const data = schema.parse(JSON.parse(await readFile(path, "utf8")));
    if (data.observations.some(r => !validContextWeightShadow(r)) || new Set(data.observations.map(identity)).size !== data.observations.length) throw new Error("Invalid context shadow ledger");
    return data;
  } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return emptyContextWeightShadow(); throw e; }
}
export function mutateContextWeightShadow(mutate: (data: ContextShadowData) => ContextShadowData | Promise<ContextShadowData>, path = CONTEXT_SHADOW_PATH) {
  return mutateFrozenJson(path, () => loadContextWeightShadow(path), value => schema.parse(value), (before, after) => {
    if (after.observations.length < before.observations.length) throw new Error("Cannot remove context shadow observations");
    for (const [i, old] of before.observations.entries()) {
      const frozen = (r: ContextShadowObservation) => ({ ...r, production: { ...r.production, runners: r.production.runners.map(x => ({ ...x, outcome: null })) } });
      const updated = after.observations[i];
      if (JSON.stringify(frozen(old)) !== JSON.stringify(frozen(updated)) || old.production.runners.some((r, j) => r.outcome &&
        JSON.stringify(r.outcome) !== JSON.stringify(updated.production.runners[j].outcome))) throw new Error("Cannot rewrite frozen context shadow");
    }
    if (after.observations.some(r => !validContextWeightShadow(r)) || new Set(after.observations.map(identity)).size !== after.observations.length ||
      after.observations.slice(before.observations.length).some(r => r.production.runners.some(x => x.outcome !== null))) throw new Error("Invalid context shadow additions");
  }, mutate);
}
