import { assertCompatibleCapturePins } from "./capture-pin-compatibility";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { mutateFrozenJson } from "./frozen-json-store";
import { generationRaceSchema, loadTissueGeneration, validGenerationCapture, type GenerationRace } from "./tissue-generation-forward";
import { loadTissueGenerationModels, type TissueGenerationModel } from "./tissue-generation-model";
import { GENERATION_MODEL_HASHES } from "./tissue-generation-config";
import { getLocalRacingDate } from "./todays-racing";
import { classifyEarlyTurf, earlyTurfDate, earlyTurfDiagnostics, earlyTurfMarket, EARLY_TURF_COHORTS, EARLY_TURF_VERSION, type TurfEvidenceInput } from "./turf-early-season-method";

export const EARLY_TURF_PATH = "data/research/turf-2027-early-season-v1.json";
export type EarlyTurfObservation = { raceId: string; raceDate: string; capturedAt: string; frozenAt: string; scheduledOff: string;
  captureHash: string; classification: typeof EARLY_TURF_COHORTS[number]; market: ReturnType<typeof earlyTurfMarket>;
  diagnostics: ReturnType<typeof earlyTurfDiagnostics>; sameOrGapShare: number | null;
  modelVersion: string; modelHash: string; t1: string[]; t2: string[] };
export type EarlyTurfData = { version: typeof EARLY_TURF_VERSION; armedAt: string; epoch: string | null; sourceHashes: Record<string, string>; observations: EarlyTurfObservation[] };
const time = z.iso.datetime(), finite = z.number().finite(), count = z.number().int().nonnegative(), rank = z.number().int().positive();
const seasonal = z.object({ starts: count, completed: count, latestSpeed: finite.nullable(), bestL3Speed: finite.nullable(), averageL3Speed: finite.nullable(),
  orAvailable: z.boolean(), surfaceHistoryAvailable: z.boolean(), sameOrAvailable: z.boolean() }).strict();
const diagnostic = z.object({ runnerId: z.string(), rank, current: seasonal, prior: seasonal,
  history: z.array(z.object({ runnerId: z.string(), raceId: z.string(), at: time, date: z.iso.date(), turf: z.boolean(), completed: z.boolean(),
    officialRating: finite.nullable(), speed: finite.nullable(), productionSpeed: finite.nullable(), performance: finite.nullable(), timed: z.boolean() }).strict()),
  targetOr: finite.nullable(), trainer: finite, jockey: finite, combinedTrainerJockey: finite, trainerJockeyPositiveShare: finite.min(0).max(1).nullable(),
  sameOrRaw: finite, sameOrContribution: finite, missingIndicatorCount: count, missingnessContribution: finite,
  split: z.object({ current: finite, prior: finite, residual: finite, currentSpeed: finite, priorSpeed: finite, currentPerformance: finite, priorPerformance: finite, priorPositive: finite }).strict(),
  priorCarryover: z.boolean(), score: finite, currentAvailability: z.array(z.boolean()).length(8), currentMissingCount: count.max(8),
  evidence: z.enum(["HIGH CURRENT-SEASON EVIDENCE", "MEDIUM", "LOW"]) }).strict();
const observationSchema = z.object({ raceId: z.string(), raceDate: z.iso.date(), capturedAt: time, frozenAt: time, scheduledOff: time,
  captureHash: z.string().regex(/^[a-f0-9]{64}$/), classification: z.enum(EARLY_TURF_COHORTS),
  market: z.object({ status: z.enum(["COMPLETE", "MARKET INCOMPLETE / UNAVAILABLE"]), completeMarket: z.boolean(), capturedAt: time, source: z.literal("sporting_life_median_bookmaker_at_capture_v1"),
    favourite: z.string().nullable(), secondFavourite: z.string().nullable(), runners: z.array(z.object({ runnerId: z.string(), price: finite.gt(1), probability: finite.positive().max(1), rank }).strict()) }).strict(),
  diagnostics: z.array(diagnostic).min(2), sameOrGapShare: finite.nullable(), modelVersion: z.literal("TURF_TISSUE_V4"), modelHash: z.string(), t1: z.array(z.string()), t2: z.array(z.string()) }).strict();
const schema = z.object({ version: z.literal(EARLY_TURF_VERSION), armedAt: time, epoch: time.nullable(), sourceHashes: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)),
  observations: z.array(observationSchema) }).strict();
export function earlyTurfCaptureHash(book: GenerationRace) {
  const canonical = generationRaceSchema.parse(book);
  return createHash("sha256").update(JSON.stringify({ ...canonical, runners: canonical.runners.map(r => ({ ...r, outcome: null })) })).digest("hex");
}
export function matchingEarlyTurfCapture(o: EarlyTurfObservation, books: readonly GenerationRace[]) {
  return books.find(b => b.raceId === o.raceId && b.capturedAt === o.capturedAt && earlyTurfCaptureHash(b) === o.captureHash);
}
export async function earlyTurfSourceHashes() {
  const paths = ["turf-early-season.ts", "turf-early-season-method.ts", "turf-early-season-inputs.ts", "turf-early-season-metrics.ts"].map(p => `src/lib/racing/${p}`);
  return Object.fromEntries(await Promise.all(paths.map(async p => [p, createHash("sha256").update(await readFile(p)).digest("hex")])));
}
function validate(data: EarlyTurfData) {
  if (data.epoch !== (data.observations[0]?.capturedAt ?? null) || new Set(data.observations.map(o => o.raceId)).size !== data.observations.length) throw new Error("Invalid early Turf epoch/identity");
  for (const [i, o] of data.observations.entries()) {
    if (!earlyTurfDate(o.raceDate) || !EARLY_TURF_COHORTS.includes(o.classification) || ![o.capturedAt, o.frozenAt, o.scheduledOff].every(t => time.safeParse(t).success) ||
      o.capturedAt < (data.observations[i - 1]?.capturedAt ?? data.armedAt) || o.capturedAt > o.frozenAt || o.frozenAt >= o.scheduledOff ||
      Date.parse(o.frozenAt) - Date.parse(o.capturedAt) > 60000 || getLocalRacingDate(new Date(o.capturedAt)) !== o.raceDate ||
      o.modelVersion !== "TURF_TISSUE_V4" || o.modelHash !== GENERATION_MODEL_HASHES.TURF || !/^[a-f0-9]{64}$/.test(o.captureHash) ||
      o.diagnostics.length < 2 || new Set(o.diagnostics.map(r => r.runnerId)).size !== o.diagnostics.length ||
      classifyEarlyTurf(o.diagnostics.map(r => r.current)) !== o.classification || !o.t1.length ||
      JSON.stringify(o.t1) !== JSON.stringify(o.diagnostics.filter(r => r.rank === 1).map(r => r.runnerId)) ||
      JSON.stringify(o.t2) !== JSON.stringify(o.diagnostics.filter(r => r.rank === 2).map(r => r.runnerId))) throw new Error("Invalid frozen early Turf observation");
    const m = o.market;
    if (m.capturedAt !== o.capturedAt || m.completeMarket !== (m.status === "COMPLETE")) throw new Error("Invalid early Turf market clock");
    if (m.completeMarket) {
      const total = m.runners.reduce((s, r) => s + 1 / r.price, 0);
      const order = [...m.runners].sort((a, b) => a.price - b.price || a.runnerId.localeCompare(b.runnerId));
      if (m.runners.length !== o.diagnostics.length || new Set(m.runners.map(r => r.runnerId)).size !== m.runners.length ||
        m.runners.some(r => !Number.isFinite(r.price) || r.price <= 1 || !o.diagnostics.some(d => d.runnerId === r.runnerId) || Math.abs(r.probability - 1 / r.price / total) > 1e-12 || r.rank !== order.findIndex(s => s.runnerId === r.runnerId) + 1) ||
        m.favourite !== order[0].runnerId || m.secondFavourite !== order[1].runnerId) throw new Error("Invalid early Turf market book");
    } else if (m.runners.length || m.favourite !== null || m.secondFavourite !== null) throw new Error("Partial market must remain unavailable");
  }
}
export async function loadEarlyTurf(path = EARLY_TURF_PATH): Promise<EarlyTurfData | null> {
  try { const data = schema.parse(JSON.parse(await readFile(path, "utf8"))); validate(data); return data; }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return null; throw e; }
}
export async function initializeEarlyTurf(path = EARLY_TURF_PATH, now = new Date()) {
  const data: EarlyTurfData = { version: EARLY_TURF_VERSION, armedAt: now.toISOString(), epoch: null, sourceHashes: await earlyTurfSourceHashes(), observations: [] };
  await mkdir(dirname(path), { recursive: true }); await writeFile(path, JSON.stringify(data, null, 2) + "\n", { flag: "wx" }); return data;
}
/** Only newly accepted production captures are passed here. Never scan old books for additions. */
export function appendEarlyTurf(data: EarlyTurfData, fresh: readonly GenerationRace[], inputs: ReadonlyMap<string, TurfEvidenceInput>, model: TissueGenerationModel, now = new Date()): EarlyTurfData {
  if (model.checksum !== GENERATION_MODEL_HASHES.TURF || model.version !== "TURF_TISSUE_V4") throw new Error("V4 artifact changed");
  const observations = [...data.observations], known = new Set(observations.map(o => o.raceId));
  for (const b of [...fresh].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))) {
    if (known.has(b.raceId) || b.family !== "TURF" || !earlyTurfDate(b.raceDate) || !generationRaceSchema.safeParse(b).success || !validGenerationCapture(b) ||
      b.capturedAt < (observations.at(-1)?.capturedAt ?? data.armedAt) || Date.parse(b.capturedAt) > now.getTime() || now.getTime() - Date.parse(b.capturedAt) > 60000 ||
      now.getTime() >= Date.parse(b.scheduledOff) || getLocalRacingDate(now) !== b.raceDate || b.runners.some(r => r.outcome !== null)) continue;
    const diagnostics = earlyTurfDiagnostics(b, inputs, model), first = diagnostics.filter(r => r.rank === 1), second = diagnostics.filter(r => r.rank === 2);
    const gap = first.length === 1 && second.length === 1 ? first[0].score - second[0].score : 0;
    observations.push({ raceId: b.raceId, raceDate: b.raceDate, capturedAt: b.capturedAt, frozenAt: now.toISOString(), scheduledOff: b.scheduledOff,
      captureHash: earlyTurfCaptureHash(b), classification: classifyEarlyTurf(diagnostics.map(r => r.current)), market: earlyTurfMarket(b), diagnostics,
      sameOrGapShare: gap > 1e-12 ? (first[0].sameOrContribution - second[0].sameOrContribution) / gap : null,
      modelVersion: b.modelVersion, modelHash: b.modelHash, t1: first.map(r => r.runnerId), t2: second.map(r => r.runnerId) }); known.add(b.raceId);
  }
  const next = { ...data, epoch: data.epoch ?? observations[0]?.capturedAt ?? null, observations }; validate(next); return next;
}
export async function mutateEarlyTurf(mutate: (data: EarlyTurfData) => EarlyTurfData, path = EARLY_TURF_PATH) {
  return mutateFrozenJson(path, async () => { const d = await loadEarlyTurf(path); if (!d) throw new Error("Early Turf monitor not armed"); return d; }, v => schema.parse(v), (before, after) => {
    if (JSON.stringify({ ...before, epoch: null, observations: [] }) !== JSON.stringify({ ...after, epoch: null, observations: [] }) ||
      before.epoch !== null && after.epoch !== before.epoch || after.observations.length < before.observations.length ||
      before.observations.some((o, i) => JSON.stringify(o) !== JSON.stringify(after.observations[i]))) throw new Error("Cannot rewrite frozen early Turf observations/methodology");
    validate(after);
    if (after.observations.slice(before.observations.length).some(o => Date.now() >= Date.parse(o.scheduledOff) || Date.now() < Date.parse(o.capturedAt) || Date.now() - Date.parse(o.capturedAt) > 60000)) throw new Error("No retrospective early Turf additions");
  }, async data => {
    await assertCompatibleCapturePins(data.sourceHashes, await earlyTurfSourceHashes(), "turf-early-season");
    return mutate(data);
  });
}
export async function syncEarlyTurf(fresh: readonly GenerationRace[], inputs: ReadonlyMap<string, TurfEvidenceInput>) {
  const eligible = fresh.filter(b => b.family === "TURF" && earlyTurfDate(b.raceDate));
  if (!eligible.length || !await loadEarlyTurf()) return;
  const model = (await loadTissueGenerationModels()).TURF;
  await mutateEarlyTurf(data => appendEarlyTurf(data, eligible, inputs, model));
}
export async function loadEarlyTurfContext() {
  const [data, generation] = await Promise.all([loadEarlyTurf(), loadTissueGeneration()]); return { data, generation };
}
