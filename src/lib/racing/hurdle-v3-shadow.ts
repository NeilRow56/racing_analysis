import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { mutateFrozenJson } from "./frozen-json-store";
import { buildHurdleV3Field, HURDLE_V3_ALL_FEATURES } from "./hurdle-v3-challenger-features";
import { HURDLE_V3_CHALLENGER_PATH, HURDLE_V3_CHALLENGER_VERSION, loadHurdleV3Challenger, scoreHurdleV3Field } from "./hurdle-v3-challenger-model";
import { hurdleV3ShadowTags, HURDLE_V3_LED_SHADOW_LOGIT, HURDLE_V3_TAG_VERSION } from "./hurdle-v3-shadow-tags";
import type { HurdleV3ShadowInput } from "./hurdle-v3-shadow-inputs";
import { emptyTissueGeneration, generationRaceSchema, settleTissueGeneration, validGenerationCapture, type GenerationRace } from "./tissue-generation-forward";
import { GENERATION_MODEL_HASHES } from "./tissue-generation-config";
import { loadTissueGenerationModels } from "./tissue-generation-model";
import { getLocalRacingDate, type TodayRace } from "./todays-racing";

export const HURDLE_V3_SHADOW_PATH = "data/research/hurdle-v3-prospective-shadow-v1.json";
export const HURDLE_V3_SHADOW_VERSION = "HURDLE_V2_V3_PROSPECTIVE_SHADOW_V1";
export const HURDLE_V3_FROZEN_HASH = "50f6e1842ca1cb0c4ed4c068a91adbc934755b7018c07f4e6f77e3b56fa80bf4";
// Refuse new captures if any scoring, history, signal or settlement implementation drifts.
export const HURDLE_V3_SHADOW_PIN_PATHS = [HURDLE_V3_CHALLENGER_PATH, "data/research/tissue-generation-2026-11-hurdle.json",
  "src/lib/racing/hurdle-v3-challenger-model.ts", "src/lib/racing/hurdle-v3-challenger-features.ts",
  "src/lib/racing/hurdle-v3-shadow-tags.ts", "src/lib/racing/hurdle-v3-shadow-inputs.ts", "src/lib/racing/hurdle-v3-shadow.ts",
  "src/lib/racing/hurdle-v3-shadow-sync.ts", "src/lib/racing/jump-speed-ratings.ts", "src/lib/racing/jump-speed-rating.ts",
  "src/lib/racing/backtest.ts", "scripts/diagnose-independent-tissue-feasibility.ts"];
const finite = z.number().finite(), time = z.iso.datetime(), hash = z.string().regex(/^[a-f0-9]{64}$/);
const participant = z.object({ starts: z.number().int().nonnegative(), wins: z.number().int().nonnegative(), latestAt: time.nullable() }).strict();
const target = z.object({ runnerId: z.string(), raceId: z.string(), cutoff: time, scheduledOff: time,
  officialRating: finite.nullable(), age: finite.nullable(), weightLbs: finite.nullable(), trainer: participant, jockey: participant }).strict();
const history = z.object({ runnerId: z.string(), raceId: z.string(), family: z.literal("HURDLE"), at: time,
  finishingPosition: finite.nullable(), resultStatus: z.string().nullable(), speed: finite.nullable(), comment: z.string().nullable() }).strict();
const audit = z.object({ sourceRows: z.number().int().nonnegative(), excluded: z.number().int().nonnegative(), nonFinisherStarters: z.number().int().nonnegative(), starterIdsHash: hash }).strict();
const prediction = z.object({ runnerId: z.string(), logit: finite, probability: finite.positive().max(1), rank: z.number().int().positive() }).strict();
const tags = z.object({ latestLed: z.boolean(), anyLast3Led: z.boolean(), last3LedCount: z.number().int().min(0).max(3), ledDecay: finite.min(0).max(1), ledPresent: z.boolean(), ledAddedLogit: finite,
  latestPU: z.boolean(), last2PU: z.boolean(), recentPU: z.boolean(), latestHurdleDays: finite.nullable(), latestPUDays: finite.nullable(),
  evidence: z.array(z.object({ runnerId: z.string(), ageDays: finite.positive(), led: z.boolean(), decayed: finite.min(0).max(1) }).strict()).max(3) }).strict();
const observation = z.object({ raceId: z.string(), capturedAt: time, frozenAt: time, captureMode: z.literal("new_production_capture"),
  production: generationRaceSchema,
  runners: z.array(z.object({ target, history: z.array(history), participantAudit: z.object({ trainer: audit, jockey: audit }).strict(),
    raw: z.record(z.enum(HURDLE_V3_ALL_FEATURES), finite.nullable()), tags,
    official: prediction, ledCounterfactual: prediction }).strict()).min(2) }).strict();
const schema = z.object({ version: z.literal(HURDLE_V3_SHADOW_VERSION), armedAt: time, epoch: time.nullable(),
  v2Version: z.literal("HURDLE_TISSUE_V2"), v2Hash: hash, v3Version: z.literal(HURDLE_V3_CHALLENGER_VERSION), v3Hash: z.literal(HURDLE_V3_FROZEN_HASH),
  tagVersion: z.literal(HURDLE_V3_TAG_VERSION), ledCoefficient: z.literal(HURDLE_V3_LED_SHADOW_LOGIT),
  sourceHashes: z.record(z.string(), hash), observations: z.array(observation) }).strict();
export type HurdleV3ShadowData = z.infer<typeof schema>;
export type HurdleV3ShadowObservation = z.infer<typeof observation>;
export async function hurdleV3SourceHashes() {
  return Object.fromEntries(await Promise.all(HURDLE_V3_SHADOW_PIN_PATHS.map(async p => [p, createHash("sha256").update(await readFile(p)).digest("hex")])));
}
export async function assertHurdleV3ShadowPins(data: HurdleV3ShadowData) {
  if (JSON.stringify(await hurdleV3SourceHashes()) !== JSON.stringify(data.sourceHashes)) throw new Error("Hurdle V3 shadow implementation changed; create a new version, no refit or feature changes in this epoch");
  if ((await loadHurdleV3Challenger()).checksum !== data.v3Hash) throw new Error("Hurdle V3 shadow model hash mismatch");
}
export async function initializeHurdleV3Shadow(path = HURDLE_V3_SHADOW_PATH, now = new Date()) {
  if ((await loadHurdleV3Challenger()).checksum !== HURDLE_V3_FROZEN_HASH) throw new Error("Unexpected V3 model");
  if ((await loadTissueGenerationModels()).HURDLE.checksum !== GENERATION_MODEL_HASHES.HURDLE) throw new Error("Unexpected production Hurdle model");
  const data: HurdleV3ShadowData = { version: HURDLE_V3_SHADOW_VERSION, armedAt: now.toISOString(), epoch: null,
    v2Version: "HURDLE_TISSUE_V2", v2Hash: GENERATION_MODEL_HASHES.HURDLE, v3Version: HURDLE_V3_CHALLENGER_VERSION, v3Hash: HURDLE_V3_FROZEN_HASH,
    tagVersion: HURDLE_V3_TAG_VERSION, ledCoefficient: HURDLE_V3_LED_SHADOW_LOGIT, sourceHashes: await hurdleV3SourceHashes(), observations: [] };
  await mkdir(dirname(path), { recursive: true });
  // Exclusive creation: initialization cannot restart or erase an existing epoch.
  await writeFile(path, JSON.stringify(schema.parse(data), null, 2) + "\n", { flag: "wx" });
  return data;
}
export function validHurdleV3Shadow(o: HurdleV3ShadowObservation, data: HurdleV3ShadowData) {
  if (!observation.safeParse(o).success) return false;
  const p = o.production;
  if (!validGenerationCapture(p) || p.family !== "HURDLE" || p.modelHash !== data.v2Hash || p.modelVersion !== data.v2Version ||
    o.raceId !== p.raceId || o.capturedAt !== p.capturedAt || p.featureCutoffAt < data.armedAt || o.capturedAt < data.armedAt ||
    Date.parse(o.frozenAt) < Date.parse(o.capturedAt) || Date.parse(o.frozenAt) >= Date.parse(p.scheduledOff) ||
    Date.parse(o.frozenAt) - Date.parse(o.capturedAt) > 60000 || o.runners.length !== p.runners.length ||
    new Set(o.runners.map(r => r.target.runnerId)).size !== o.runners.length) return false;
  const fields = buildHurdleV3Field(o.runners);
  for (const r of o.runners) {
    if (!p.runners.some(x => x.runnerId === r.target.runnerId) || r.target.raceId !== p.raceId || r.target.cutoff !== p.featureCutoffAt || r.target.scheduledOff !== p.scheduledOff ||
      r.official.runnerId !== r.target.runnerId || r.ledCounterfactual.runnerId !== r.target.runnerId ||
      HURDLE_V3_ALL_FEATURES.some(n => fields.find(f => f.runnerId === r.target.runnerId)!.raw[n] !== r.raw[n]) ||
      JSON.stringify(fields.find(f => f.runnerId === r.target.runnerId)!.provenance.priorRunnerIds) !== JSON.stringify(r.history.map(h => h.runnerId)) ||
      JSON.stringify(hurdleV3ShadowTags(r.target, r.history)) !== JSON.stringify(r.tags)) return false;
    for (const key of ["trainer", "jockey"] as const) {
      const a = r.participantAudit[key], prior = r.target[key];
      if (a.sourceRows - a.excluded !== prior.starts || a.nonFinisherStarters > prior.starts) return false;
    }
  }
  for (const key of ["official", "ledCounterfactual"] as const) {
    const rows = o.runners.map(r => r[key]), max = Math.max(...rows.map(r => r.logit)), ex = rows.map(r => Math.exp(r.logit - max)), total = ex.reduce((s, x) => s + x, 0);
    const order = [...rows].sort((a, b) => b.logit - a.logit || a.runnerId.localeCompare(b.runnerId));
    if (rows.some((r, i) => Math.abs(r.probability - ex[i] / total) > 1e-12 || r.rank !== order.findIndex(x => x.runnerId === r.runnerId) + 1)) return false;
  }
  return o.runners.every(r => Math.abs(r.ledCounterfactual.logit - r.official.logit - r.tags.ledAddedLogit) < 1e-12);
}
export async function loadHurdleV3Shadow(path = HURDLE_V3_SHADOW_PATH): Promise<HurdleV3ShadowData | null> {
  try {
    const data = schema.parse(JSON.parse(await readFile(path, "utf8")));
    if (data.v2Hash !== GENERATION_MODEL_HASHES.HURDLE || (data.epoch === null) !== (data.observations.length === 0) ||
      data.epoch !== (data.observations[0]?.capturedAt ?? null) || new Set(data.observations.map(o => o.raceId)).size !== data.observations.length ||
      data.observations.some(o => o.capturedAt < data.epoch! || !validHurdleV3Shadow(o, data))) throw new Error("Invalid prospective Hurdle V3 ledger");
    return data;
  } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return null; throw e; }
}
export async function buildHurdleV3Shadow(book: GenerationRace, inputs: ReadonlyMap<string, HurdleV3ShadowInput>, now = new Date()): Promise<HurdleV3ShadowObservation | null> {
  if (book.family !== "HURDLE" || book.runners.some(r => r.outcome !== null) || now.getTime() >= Date.parse(book.scheduledOff)) return null;
  const rows = book.runners.map(p => inputs.get(p.runnerId));
  if (rows.some(r => !r)) return null;
  const field = rows as HurdleV3ShadowInput[], features = buildHurdleV3Field(field), model = await loadHurdleV3Challenger();
  if (model.checksum !== HURDLE_V3_FROZEN_HASH) throw new Error("V3 changed");
  const official = scoreHurdleV3Field(model, features), tagged = field.map(r => hurdleV3ShadowTags(r.target, r.history));
  const logits = official.map((p, i) => p.logit + tagged[i].ledAddedLogit), max = Math.max(...logits), ex = logits.map(v => Math.exp(v - max)), total = ex.reduce((s, v) => s + v, 0);
  const order = [...official.keys()].sort((a, b) => logits[b] - logits[a] || official[a].runnerId.localeCompare(official[b].runnerId));
  return observation.parse({ raceId: book.raceId, capturedAt: book.capturedAt, frozenAt: now.toISOString(), captureMode: "new_production_capture", production: structuredClone(book),
    runners: field.map((r, i) => ({ ...structuredClone(r), raw: features[i].raw, tags: tagged[i],
      official: { runnerId: official[i].runnerId, logit: official[i].logit, probability: official[i].probability, rank: official[i].rank },
      ledCounterfactual: { runnerId: official[i].runnerId, logit: logits[i], probability: ex[i] / total, rank: order.indexOf(i) + 1 } })) });
}
export function appendHurdleV3Shadows(data: HurdleV3ShadowData, additions: HurdleV3ShadowObservation[], now = new Date()) {
  const known = new Set(data.observations.map(o => o.raceId)), accepted: HurdleV3ShadowObservation[] = [];
  for (const o of [...additions].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))) {
    if (known.has(o.raceId) || !validHurdleV3Shadow(o, data) || o.production.runners.some(r => r.outcome !== null) ||
      Date.parse(o.frozenAt) > now.getTime() || now.getTime() >= Date.parse(o.production.scheduledOff) ||
      now.getTime() - Date.parse(o.capturedAt) > 60000 || getLocalRacingDate(now) !== o.production.raceDate ||
      data.epoch !== null && o.capturedAt < data.epoch) continue;
    known.add(o.raceId); accepted.push(structuredClone(o));
  }
  return accepted.length ? { ...data, epoch: data.epoch ?? accepted[0].capturedAt, observations: [...data.observations, ...accepted] } : data;
}
export function settleHurdleV3Shadows(data: HurdleV3ShadowData, results: ReadonlyMap<string, TodayRace>, now = new Date()) {
  return { ...data, observations: data.observations.map(o => ({ ...o,
    production: settleTissueGeneration({ ...emptyTissueGeneration(), races: [o.production] }, results, now).races[0] })) };
}
export async function mutateHurdleV3Shadow(mutate: (data: HurdleV3ShadowData) => HurdleV3ShadowData | Promise<HurdleV3ShadowData>, path = HURDLE_V3_SHADOW_PATH) {
  return mutateFrozenJson(path, async () => { const d = await loadHurdleV3Shadow(path); if (!d) throw new Error("Initialize the Hurdle V3 shadow epoch before capture"); return d; }, value => schema.parse(value), (before, after) => {
    if (JSON.stringify({ ...before, epoch: null, observations: [] }) !== JSON.stringify({ ...after, epoch: null, observations: [] }) ||
      before.epoch !== null && before.epoch !== after.epoch || after.observations.length < before.observations.length || after.epoch !== (after.observations[0]?.capturedAt ?? null)) throw new Error("Cannot rewrite shadow epoch or pins");
    const frozen = (o: HurdleV3ShadowObservation) => ({ ...o, production: { ...o.production, runners: o.production.runners.map(r => ({ ...r, outcome: null })) } });
    for (const [i, old] of before.observations.entries()) if (JSON.stringify(frozen(old)) !== JSON.stringify(frozen(after.observations[i])) ||
      old.production.runners.some((r, j) => r.outcome && JSON.stringify(r.outcome) !== JSON.stringify(after.observations[i].production.runners[j].outcome))) throw new Error("Cannot rewrite a frozen Hurdle shadow");
    if (after.observations.some(o => !validHurdleV3Shadow(o, after)) || new Set(after.observations.map(o => o.raceId)).size !== after.observations.length ||
      after.observations.slice(before.observations.length).some(o => o.production.runners.some(r => r.outcome !== null) || Date.now() >= Date.parse(o.production.scheduledOff))) throw new Error("Invalid shadow additions");
  }, mutate);
}
