import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { mutateFrozenJson } from "./frozen-json-store";
import { loadTissueGeneration, type GenerationRace } from "./tissue-generation-forward";
import { GENERATION_MODEL_HASHES } from "./tissue-generation-config";
import { generationModelPath, GENERATION_MODEL_VERSIONS, loadTissueGenerationModels } from "./tissue-generation-model";
import { TISSUE_VALUE_FAMILIES } from "./tissue-value-metrics";
import { BADGE_PRICE_BANDS, BADGE_STATES, POSITIVE_EDGE_BANDS, positiveNeutralCapture, POSITIVE_NEUTRAL_RULES, POSITIVE_NEUTRAL_VERSION, tissueBadgePriceBand, tissueBadgeSelection } from "./tissue-positive-neutral-method";
import { getLocalRacingDate } from "./todays-racing";

export const POSITIVE_NEUTRAL_PATH = "data/research/tissue-positive-neutral-prospective-v1.json";
const finite = z.number().finite(), time = z.iso.datetime(), id = z.string().min(1), hash = z.string().regex(/^[a-f0-9]{64}$/);
const selectionSchema = z.object({ runnerId: id, horseId: id, horseName: id, tissueRank: z.union([z.literal(1), z.literal(2)]), probability: finite.positive().max(1),
  marketProbability: finite.positive().max(1).nullable(), price: finite.gt(1).nullable(), marketRank: z.number().int().positive().nullable(),
  priceBand: z.enum(BADGE_PRICE_BANDS).nullable(), badgeState: z.enum(BADGE_STATES), included: z.boolean(), edgePP: finite.nullable(), edgeBand: z.enum(POSITIVE_EDGE_BANDS).nullable() }).strict();
const observationSchema = z.object({ raceId: id, bookIdentity: id, raceDate: z.iso.date(), course: id, scheduledOff: time, capturedAt: time, frozenAt: time, featureCutoffAt: time,
  family: z.enum(TISSUE_VALUE_FAMILIES), modelVersion: id, modelHash: hash, captureHash: hash, completeMarket: z.boolean(), marketSource: id, marketCapturedAt: time,
  selections: z.array(selectionSchema).min(1) }).strict();
const schema = z.object({ version: z.literal(POSITIVE_NEUTRAL_VERSION), armedAt: time, epoch: time.nullable(),
  rules: z.object({ tolerancePP: z.literal(.5), edgeCutoffsPP: z.tuple([z.literal(.5), z.literal(2), z.literal(5), z.literal(10)]), priceCutoffs: z.tuple([z.literal(3), z.literal(5), z.literal(11)]),
    capture: z.literal(POSITIVE_NEUTRAL_RULES.capture), badges: z.literal(POSITIVE_NEUTRAL_RULES.badges), scores: z.literal(POSITIVE_NEUTRAL_RULES.scores), settlement: z.literal(POSITIVE_NEUTRAL_RULES.settlement) }).strict(),
  modelHashes: z.record(z.enum(TISSUE_VALUE_FAMILIES), hash), modelVersions: z.record(z.enum(TISSUE_VALUE_FAMILIES), id),
  sourceHashes: z.record(z.string(), hash), observations: z.array(observationSchema) }).strict();
export type PositiveNeutralData = z.infer<typeof schema>;
export type PositiveNeutralObservation = z.infer<typeof observationSchema>;
export type PositiveNeutralSelection = z.infer<typeof selectionSchema>;
export function tissueBadgeCaptureHash(book: GenerationRace) {
  return createHash("sha256").update(JSON.stringify({ ...book, runners: book.runners.map(r => ({ ...r, outcome: null })) })).digest("hex");
}
export function matchingPositiveNeutralCapture(o: PositiveNeutralObservation, books: readonly GenerationRace[]) {
  return books.find(b => b.raceId === o.raceId && b.capturedAt === o.capturedAt && b.family === o.family && b.modelVersion === o.modelVersion && tissueBadgeCaptureHash(b) === o.captureHash);
}
export async function positiveNeutralSourceHashes() {
  const paths = ["src/lib/racing/tissue-positive-neutral-method.ts", "src/lib/racing/tissue-positive-neutral.ts", "src/lib/racing/tissue-positive-neutral-metrics.ts",
    "src/app/racing/today/tissue-market-badge.ts", "src/lib/racing/tissue-generation-forward.ts", "src/lib/racing/tissue-value-metrics.ts",
    "src/lib/racing/tissue-generation-config.ts", "src/lib/racing/tissue-generation-model.ts", ...TISSUE_VALUE_FAMILIES.map(generationModelPath)];
  return Object.fromEntries(await Promise.all(paths.map(async p => [p, createHash("sha256").update(await readFile(p)).digest("hex")])));
}
function validate(data: PositiveNeutralData) {
  if (data.epoch !== (data.observations[0]?.capturedAt ?? null) || new Set(data.observations.map(o => o.raceId)).size !== data.observations.length ||
    TISSUE_VALUE_FAMILIES.some(f => data.modelHashes[f] !== GENERATION_MODEL_HASHES[f] || data.modelVersions[f] !== GENERATION_MODEL_VERSIONS[f])) throw new Error("Invalid Tissue badge monitor epoch, models or duplicate race");
  for (const [i, o] of data.observations.entries()) {
    if (o.capturedAt < (data.observations[i - 1]?.capturedAt ?? data.armedAt) || o.featureCutoffAt < data.armedAt || o.featureCutoffAt > o.capturedAt ||
      o.capturedAt > o.frozenAt || o.frozenAt >= o.scheduledOff || Date.parse(o.frozenAt) - Date.parse(o.capturedAt) > 60000 || o.marketCapturedAt !== o.capturedAt ||
      getLocalRacingDate(new Date(o.capturedAt)) !== o.raceDate || getLocalRacingDate(new Date(o.scheduledOff)) !== o.raceDate || o.bookIdentity !== `${o.raceId}|${o.capturedAt}` ||
      o.modelVersion !== data.modelVersions[o.family] || o.modelHash !== data.modelHashes[o.family] || new Set(o.selections.map(r => r.runnerId)).size !== o.selections.length) throw new Error("Invalid Tissue badge capture");
    for (const r of o.selections) {
      const expected = tissueBadgeSelection(r.probability, r.marketProbability);
      if (r.badgeState !== expected.badgeState || r.included !== expected.included || r.edgeBand !== expected.edgeBand ||
        (r.edgePP === null ? expected.edgePP !== null : expected.edgePP === null || Math.abs(r.edgePP - expected.edgePP) > 1e-12) ||
        r.priceBand !== (r.price === null ? null : tissueBadgePriceBand(r.price)) ||
        (o.completeMarket ? r.marketProbability === null || r.price === null || r.marketRank === null : [r.marketProbability, r.price, r.marketRank].some(v => v !== null))) throw new Error("Invalid frozen Tissue badge selection");
    }
  }
}
export async function loadPositiveNeutral(path = POSITIVE_NEUTRAL_PATH): Promise<PositiveNeutralData | null> {
  try { const data = schema.parse(JSON.parse(await readFile(path, "utf8"))); validate(data); return data; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
export async function initializePositiveNeutral(path = POSITIVE_NEUTRAL_PATH, now = new Date()) {
  await loadTissueGenerationModels();
  const data = schema.parse({ version: POSITIVE_NEUTRAL_VERSION, armedAt: now.toISOString(), epoch: null, rules: POSITIVE_NEUTRAL_RULES,
    modelHashes: GENERATION_MODEL_HASHES, modelVersions: GENERATION_MODEL_VERSIONS, sourceHashes: await positiveNeutralSourceHashes(), observations: [] });
  await mkdir(dirname(path), { recursive: true }); await writeFile(path, JSON.stringify(data, null, 2) + "\n", { flag: "wx" }); return data;
}
/** Only the fresh books actually accepted by this production invocation, never prior ledger contents. */
export function appendPositiveNeutral(data: PositiveNeutralData, fresh: readonly GenerationRace[], now = new Date()) {
  const additions: PositiveNeutralObservation[] = [], known = new Set(data.observations.map(o => o.raceId));
  for (const b of [...fresh].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))) {
    if (known.has(b.raceId) || b.capturedAt < data.armedAt || b.featureCutoffAt < data.armedAt ||
      b.capturedAt < (additions.at(-1)?.capturedAt ?? data.observations.at(-1)?.capturedAt ?? data.armedAt) || Date.parse(b.capturedAt) > now.getTime() ||
      now.getTime() - Date.parse(b.capturedAt) > 60000 || now.getTime() >= Date.parse(b.scheduledOff) || getLocalRacingDate(now) !== b.raceDate || b.runners.some(r => r.outcome !== null)) continue;
    const captured = positiveNeutralCapture(b);
    additions.push({ ...captured, raceId: b.raceId, raceDate: b.raceDate, course: b.course, scheduledOff: b.scheduledOff, capturedAt: b.capturedAt, frozenAt: now.toISOString(),
      featureCutoffAt: b.featureCutoffAt, family: b.family, modelVersion: b.modelVersion, modelHash: b.modelHash, captureHash: tissueBadgeCaptureHash(b),
      completeMarket: b.completeMarket, marketSource: b.marketSource, marketCapturedAt: b.capturedAt }); known.add(b.raceId);
  }
  const observations = [...data.observations, ...additions], after = { ...data, epoch: data.epoch ?? observations[0]?.capturedAt ?? null, observations }; validate(after); return after;
}
export async function mutatePositiveNeutral(mutate: (data: PositiveNeutralData) => PositiveNeutralData, path = POSITIVE_NEUTRAL_PATH) {
  return mutateFrozenJson(path, async () => { const data = await loadPositiveNeutral(path); if (!data) throw new Error("Tissue badge monitor not armed"); return data; }, v => schema.parse(v), (before, after) => {
    if (JSON.stringify({ ...before, epoch: null, observations: [] }) !== JSON.stringify({ ...after, epoch: null, observations: [] }) || before.epoch !== null && before.epoch !== after.epoch ||
      after.observations.length < before.observations.length || before.observations.some((o, i) => JSON.stringify(o) !== JSON.stringify(after.observations[i]))) throw new Error("Cannot rewrite Tissue badge methodology, epoch or observations");
    validate(after);
    if (after.observations.slice(before.observations.length).some(o => Date.now() >= Date.parse(o.scheduledOff) || Date.parse(o.frozenAt) > Date.now() || Date.now() - Date.parse(o.capturedAt) > 60000 || getLocalRacingDate() !== o.raceDate)) throw new Error("No retrospective Tissue badge additions");
  }, async data => {
    if (JSON.stringify(data.sourceHashes) !== JSON.stringify(await positiveNeutralSourceHashes())) throw new Error("Tissue badge methodology changed; create a new version");
    return mutate(data);
  });
}
export async function syncPositiveNeutral(fresh: readonly GenerationRace[]) {
  if (!fresh.length || !await loadPositiveNeutral()) return;
  return mutatePositiveNeutral(data => appendPositiveNeutral(data, fresh));
}
export async function loadPositiveNeutralContext() {
  const [data, generation] = await Promise.all([loadPositiveNeutral(), loadTissueGeneration()]); return { data, generation };
}
