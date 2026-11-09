import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { mutateFrozenJson } from "./frozen-json-store";
import { loadHurdleV3Shadow, type HurdleV3ShadowObservation } from "./hurdle-v3-shadow";
import { HURDLE_V3_FROZEN_HASH } from "./hurdle-v3-shadow";
import { loadHurdleV3Challenger, type HurdleV3ChallengerModel } from "./hurdle-v3-challenger-model";
import { captureHurdleMarket, classifyHurdleForm, FORM_COHORTS, hurdleConnectionDependence, LOW_FORM_VERSION } from "./hurdle-low-form-method";
import { getLocalRacingDate } from "./todays-racing";

export const LOW_FORM_PATH = "data/research/hurdle-low-form-prospective-v1.json";
const time = z.iso.datetime(), finite = z.number().finite();
const observation = z.object({ raceId: z.string(), capturedAt: time, frozenAt: time, scheduledOff: time, raceDate: z.iso.date(),
  shadowHash: z.string().regex(/^[a-f0-9]{64}$/), classification: z.enum(FORM_COHORTS),
  market: z.object({ status: z.enum(["COMPLETE", "MARKET UNAVAILABLE / INCOMPLETE"]), capturedAt: time, source: z.string(),
    favourite: z.string().nullable(), secondFavourite: z.string().nullable(), runners: z.array(z.object({ runnerId: z.string(), price: finite.gt(1), probability: finite.positive().max(1), rank: z.number().int().positive() }).strict()) }).strict(),
  evidence: z.array(z.object({ runnerId: z.string(), rank: z.number().int().positive(), trainer: finite, jockey: finite, combined: finite,
    positiveShare: finite.min(0).max(1).nullable(), starts: z.number().int().nonnegative(), completed: z.number().int().nonnegative(), established: z.boolean(), evidence: z.enum(["HIGH", "MEDIUM", "LOW"]) }).strict()) }).strict();
const schema = z.object({ version: z.literal(LOW_FORM_VERSION), armedAt: time, epoch: time.nullable(),
  sourceHashes: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)), observations: z.array(observation) }).strict();
export type LowFormData = z.infer<typeof schema>;
export type LowFormObservation = z.infer<typeof observation>;
export function hurdleShadowCaptureHash(o: HurdleV3ShadowObservation) {
  return createHash("sha256").update(JSON.stringify({ ...o, production: { ...o.production, runners: o.production.runners.map(r => ({ ...r, outcome: null })) } })).digest("hex");
}
export function matchingLowFormShadow(o: LowFormObservation, shadows: readonly HurdleV3ShadowObservation[]) {
  return shadows.find(s => s.raceId === o.raceId && s.capturedAt === o.capturedAt && hurdleShadowCaptureHash(s) === o.shadowHash);
}
export async function lowFormSourceHashes() {
  const paths = ["src/lib/racing/hurdle-low-form-method.ts", "src/lib/racing/hurdle-low-form.ts", "src/lib/racing/hurdle-low-form-metrics.ts"];
  return Object.fromEntries(await Promise.all(paths.map(async p => [p, createHash("sha256").update(await readFile(p)).digest("hex")])));
}
function validateLowFormData(data: LowFormData) {
  if (data.epoch !== (data.observations.find(o => o.classification !== "ESTABLISHED FORM")?.capturedAt ?? null) ||
    new Set(data.observations.map(o => o.raceId)).size !== data.observations.length) throw new Error("Invalid low-form epoch or duplicate race");
  for (const [i, o] of data.observations.entries()) {
    const market = o.market, rows = market.runners;
    if (o.capturedAt < (data.observations[i - 1]?.capturedAt ?? data.armedAt) || o.capturedAt > o.frozenAt || o.frozenAt >= o.scheduledOff ||
      Date.parse(o.frozenAt) - Date.parse(o.capturedAt) > 60000 || getLocalRacingDate(new Date(o.capturedAt)) !== o.raceDate ||
      market.capturedAt !== o.capturedAt || new Set(o.evidence.map(r => r.runnerId)).size !== o.evidence.length || o.evidence.length < 2) throw new Error("Invalid low-form capture");
    if (market.status === "COMPLETE") {
      const sorted = [...rows].sort((a, b) => a.price - b.price || a.runnerId.localeCompare(b.runnerId));
      const total = rows.reduce((s, r) => s + 1 / r.price, 0);
      if (rows.length !== o.evidence.length || new Set(rows.map(r => r.runnerId)).size !== rows.length ||
        rows.some(r => !o.evidence.some(e => e.runnerId === r.runnerId) || r.rank !== sorted.findIndex(s => s.runnerId === r.runnerId) + 1 || Math.abs(r.probability - (1 / r.price) / total) > 1e-12) ||
        market.favourite !== sorted[0].runnerId || market.secondFavourite !== sorted[1].runnerId) throw new Error("Invalid frozen low-form market");
    } else if (rows.length || market.favourite !== null || market.secondFavourite !== null) throw new Error("Incomplete market must not contain a normalized book");
  }
}
export async function loadLowForm(path = LOW_FORM_PATH): Promise<LowFormData | null> {
  try {
    const data = schema.parse(JSON.parse(await readFile(path, "utf8")));
    validateLowFormData(data);
    return data;
  }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return null; throw e; }
}
export async function initializeLowForm(path = LOW_FORM_PATH, now = new Date()) {
  const data: LowFormData = { version: LOW_FORM_VERSION, armedAt: now.toISOString(), epoch: null, sourceHashes: await lowFormSourceHashes(), observations: [] };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2) + "\n", { flag: "wx" });
  return data;
}
/** Called only with newly accepted V3 observations; never scan historical books for additions. */
export function appendLowForm(data: LowFormData, fresh: readonly HurdleV3ShadowObservation[], model: HurdleV3ChallengerModel, now = new Date()): LowFormData {
  if (model.checksum !== HURDLE_V3_FROZEN_HASH) throw new Error("V3 artifact changed");
  const additions: LowFormObservation[] = [], known = new Set(data.observations.map(o => o.raceId));
  for (const o of [...fresh].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))) {
    if (known.has(o.raceId) || o.production.family !== "HURDLE" || o.captureMode !== "new_production_capture" ||
      o.capturedAt < data.armedAt || o.capturedAt < (additions.at(-1)?.capturedAt ?? data.observations.at(-1)?.capturedAt ?? data.armedAt) ||
      Date.parse(o.capturedAt) > now.getTime() || now.getTime() - Date.parse(o.capturedAt) > 60000 ||
      Date.parse(o.frozenAt) > now.getTime() || now.getTime() >= Date.parse(o.production.scheduledOff) ||
      getLocalRacingDate(now) !== o.production.raceDate || o.production.runners.some(r => r.outcome !== null)) continue;
    known.add(o.raceId);
    additions.push({ raceId: o.raceId, capturedAt: o.capturedAt, frozenAt: now.toISOString(), scheduledOff: o.production.scheduledOff, raceDate: o.production.raceDate,
      shadowHash: hurdleShadowCaptureHash(o), classification: classifyHurdleForm(o.runners), market: captureHurdleMarket(o),
      evidence: o.runners.map(r => hurdleConnectionDependence(r, model)) });
  }
  const observations = [...data.observations, ...additions];
  return { ...data, epoch: data.epoch ?? observations.find(o => o.classification !== "ESTABLISHED FORM")?.capturedAt ?? null, observations };
}
export async function mutateLowForm(mutate: (data: LowFormData) => LowFormData, path = LOW_FORM_PATH) {
  return mutateFrozenJson(path, async () => { const d = await loadLowForm(path); if (!d) throw new Error("Low-form monitor not armed"); return d; }, value => schema.parse(value), (before, after) => {
    if (JSON.stringify({ ...before, epoch: null, observations: [] }) !== JSON.stringify({ ...after, epoch: null, observations: [] }) ||
      before.epoch !== null && before.epoch !== after.epoch || after.epoch !== (after.observations.find(o => o.classification !== "ESTABLISHED FORM")?.capturedAt ?? null) ||
      after.observations.length < before.observations.length || before.observations.some((o, i) => JSON.stringify(o) !== JSON.stringify(after.observations[i]))) throw new Error("Cannot rewrite frozen low-form observations or methodology");
    if (new Set(after.observations.map(o => o.raceId)).size !== after.observations.length || after.observations.some((o, i) => o.capturedAt < (after.observations[i - 1]?.capturedAt ?? after.armedAt))) throw new Error("Invalid low-form chronology");
    validateLowFormData(after);
    if (after.observations.slice(before.observations.length).some(o => Date.now() >= Date.parse(o.scheduledOff) || Date.now() - Date.parse(o.capturedAt) > 60000)) throw new Error("No retrospective low-form additions");
  }, async data => {
    if (JSON.stringify(data.sourceHashes) !== JSON.stringify(await lowFormSourceHashes())) throw new Error("Low-form methodology changed; start a new version");
    return mutate(data);
  });
}
export async function syncLowForm(fresh: readonly HurdleV3ShadowObservation[]) {
  if (!fresh.length || !await loadLowForm()) return;
  const model = await loadHurdleV3Challenger();
  await mutateLowForm(data => appendLowForm(data, fresh, model));
}
/** Settlement is read directly from the canonical frozen V3/V2 observation. No duplicated result store. */
export async function loadLowFormContext() {
  const [data, shadows] = await Promise.all([loadLowForm(), loadHurdleV3Shadow()]);
  return { data, shadows };
}
