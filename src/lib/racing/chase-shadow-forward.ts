import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { raceSoftmax, score } from "../../../scripts/diagnose-independent-tissue-feasibility";
import { CHASE_SHADOW_HASH, CHASE_SHADOW_SCHEMA, CHASE_SHADOW_VERSION, loadChaseShadowModel, type ChaseShadowModel } from "./chase-shadow-model";
import { JUMP_TISSUE_VERSION } from "./jump-tissue-model";
import { cleanJumpTissueRace, settleJumpTissueRace, type JumpTissueRace } from "./jump-tissue-forward";
import { classifyHandicapStatus } from "./research-rule";
import { summarizeBookmakerMarket } from "./forward-value";
import type { JumpSpeedReliability } from "./jump-speed-reliability";
import type { TodayRace, SportingLifeBookmakerQuote } from "./todays-racing";

export const CHASE_SHADOW_PATH = "data/research/chase-shadow-prospective-v1.json";
export const CHASE_SHADOW_EPOCH = {
  name: "CHASE_SHADOW_V1_PROSPECTIVE",
  declaredAt: "2026-10-30T06:41:15.000Z",
  modelVersion: CHASE_SHADOW_VERSION,
  modelHash: CHASE_SHADOW_HASH,
  featureSchema: CHASE_SHADOW_SCHEMA,
  settlementVersion: "canonical_settlement_v2",
} as const;
export type ChaseContext = {
  priorChaseStarts: number | null;
  latestCompletion: "completed" | "non_completion" | "unavailable";
};
export type ShadowRunner = ChaseContext & {
  runnerId: string; horseId: string; probability: number | null; rank: number | null; logit: number | null;
  featureCoverage: "complete_vector" | "unavailable"; missingNumericFeatures: string[];
  reliability: JumpSpeedReliability | null;
  price: { decimal: number; capturedAt: string; basis: "median_bookmaker"; quotes: SportingLifeBookmakerQuote[] } | null;
};
export type ChaseShadowRace = {
  raceId: string; capturedAt: string; frozenAt: string; modelVersion: typeof CHASE_SHADOW_VERSION;
  modelHash: string; featureSchema: typeof CHASE_SHADOW_SCHEMA;
  coverage: "complete" | "unavailable";
  handicap: ReturnType<typeof classifyHandicapStatus>;
  current: JumpTissueRace; runners: ShadowRunner[];
};
export type ChaseShadowData = { version: "chase_shadow_prospective_v1"; epoch: typeof CHASE_SHADOW_EPOCH; races: ChaseShadowRace[];
  checkpoints: { target: number; recordedAt: string; raceIds: string[] }[] };
export const emptyChaseShadow = (): ChaseShadowData => ({ version: "chase_shadow_prospective_v1", epoch: { ...CHASE_SHADOW_EPOCH }, races: [], checkpoints: [] });

/** Accept only a newly created primary book, while still at its capture point. Never reconstruct an old book. */
export function buildChaseShadow(current: JumpTissueRace, race: TodayRace, contexts: ReadonlyMap<string, ChaseContext>, model: ChaseShadowModel, now = new Date()): ChaseShadowRace | null {
  const at = Date.parse(current.recordedAt), off = race.raceDateTime?.getTime() ?? NaN, frozenOff = Date.parse(current.scheduledOffAt);
  if (current.subtype !== "Chase" || current.raceId !== race.raceId || !current.recordedPreRace || current.settledAt !== null ||
    !Number.isFinite(at) || !Number.isFinite(off) || !Number.isFinite(frozenOff) || !Number.isFinite(now.getTime()) || at < Date.parse(CHASE_SHADOW_EPOCH.declaredAt) ||
    at > now.getTime() || now.getTime() - at > 60_000 || now.getTime() >= off || now.getTime() >= frozenOff ||
    race.winningTime || race.runners.some(r => r.finishingPosition !== null || (r.resultStatus !== null && r.resultStatus !== "non_runner"))) return null;
  if (model.checksum !== CHASE_SHADOW_HASH || model.version !== CHASE_SHADOW_VERSION || current.featureSchemaVersion !== CHASE_SHADOW_SCHEMA || current.modelVersion !== JUMP_TISSUE_VERSION) throw new Error("Chase shadow capture identity mismatch");
  const complete = cleanJumpTissueRace(current) && current.runners.every(r => r.modelInputs?.length === model.model.names.length && r.modelInputs.every(Number.isFinite));
  const logits = complete ? current.runners.map(r => score(model.model, r.modelInputs!)) : [];
  const probabilities = complete ? raceSoftmax(logits) : [];
  const order = [...current.runners.keys()].sort((a, b) => probabilities[b]! - probabilities[a]! || current.runners[a]!.runnerId.localeCompare(current.runners[b]!.runnerId));
  return {
    raceId: current.raceId, capturedAt: current.recordedAt, frozenAt: now.toISOString(),
    modelVersion: CHASE_SHADOW_VERSION, modelHash: model.checksum, featureSchema: CHASE_SHADOW_SCHEMA,
    coverage: complete ? "complete" : "unavailable", handicap: classifyHandicapStatus(race), current: structuredClone(current),
    runners: current.runners.map((r, i) => {
      const live = race.runners.find(t => t.runnerId === r.runnerId);
      const market = summarizeBookmakerMarket(live?.bookmakerQuotes);
      return { runnerId: r.runnerId, horseId: r.horseId, probability: probabilities[i] ?? null,
        rank: complete ? order.indexOf(i) + 1 : null, logit: logits[i] ?? null,
        featureCoverage: complete ? "complete_vector" : "unavailable",
        missingNumericFeatures: model.model.names.filter((name, j) => name.endsWith("_missing") && r.modelInputs?.[j] === 1),
        ...(contexts.get(r.horseId) ?? { priorChaseStarts: null, latestCompletion: "unavailable" as const }),
        reliability: live?.metrics?.jumpSpeedReliability ?? null,
        price: market.decimalPrice === null ? null : { decimal: market.decimalPrice, capturedAt: current.recordedAt, basis: "median_bookmaker" as const, quotes: market.quotes },
      };
    }),
  };
}

export function captureChaseShadow(data: ChaseShadowData, additions: ChaseShadowRace[]): ChaseShadowData {
  const known = new Set(data.races.map(r => r.raceId));
  const accepted = additions.filter(r => {
    if (known.has(r.raceId) || Date.parse(r.capturedAt) < Date.parse(data.epoch.declaredAt)) return false;
    known.add(r.raceId); return true;
  });
  return accepted.length ? { ...data, races: [...data.races, ...accepted] } : data;
}
export function settleChaseShadow(data: ChaseShadowData, results: ReadonlyMap<string, TodayRace>, now = new Date()): ChaseShadowData {
  const races = data.races.map(r => {
    const result = results.get(r.raceId);
    return result && r.current.settledAt === null ? { ...r, current: settleJumpTissueRace(r.current, result, now) } : r;
  });
  const settled = races.filter(r => r.coverage === "complete" && cleanJumpTissueRace(r.current) && r.current.settledAt !== null)
    .sort((a, b) => a.current.settledAt!.localeCompare(b.current.settledAt!) || a.current.scheduledOffAt.localeCompare(b.current.scheduledOffAt) || a.raceId.localeCompare(b.raceId));
  const checkpoints = [...data.checkpoints];
  for (const target of [50, 100, 200]) if (settled.length >= target && !checkpoints.some(c => c.target === target)) {
    checkpoints.push({ target, recordedAt: now.toISOString(), raceIds: settled.slice(0, target).map(r => r.raceId) });
  }
  return { ...data, races, checkpoints };
}
export async function loadChaseShadow(path = CHASE_SHADOW_PATH): Promise<ChaseShadowData> {
  try {
    const data = JSON.parse(await readFile(path, "utf8")) as ChaseShadowData;
    if (data.version !== "chase_shadow_prospective_v1" || JSON.stringify(data.epoch) !== JSON.stringify(CHASE_SHADOW_EPOCH)) throw new Error("Chase shadow epoch identity mismatch");
    for (const r of data.races) {
      if (r.modelHash !== CHASE_SHADOW_HASH || r.modelVersion !== CHASE_SHADOW_VERSION || r.featureSchema !== CHASE_SHADOW_SCHEMA ||
        !Number.isFinite(Date.parse(r.capturedAt)) || Date.parse(r.capturedAt) < Date.parse(data.epoch.declaredAt) ||
        r.capturedAt !== r.current.recordedAt || Date.parse(r.capturedAt) >= Date.parse(r.current.scheduledOffAt)) throw new Error("Invalid prospective Chase shadow record");
    }
    return data;
  } catch (error) {
    // Only the ledger may start empty. The frozen model never has a fallback.
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyChaseShadow();
    throw error;
  }
}
export async function mutateChaseShadow(mutation: (data: ChaseShadowData) => ChaseShadowData | Promise<ChaseShadowData>, path = CHASE_SHADOW_PATH) {
  await loadChaseShadowModel();
  const lock = `${resolve(path)}.lock`;
  await mkdir(dirname(lock), { recursive: true });
  const deadline = Date.now() + 30_000;
  while (true) {
    try { await mkdir(lock); break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST" || Date.now() >= deadline) throw error;
      await new Promise(wait => setTimeout(wait, 10));
    }
  }
  try {
    const original = await loadChaseShadow(path), updated = await mutation(original);
    if (JSON.stringify(original) !== JSON.stringify(updated)) {
      const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
      await writeFile(tmp, JSON.stringify(updated, null, 2) + "\n");
      await rename(tmp, path);
    }
    return updated;
  } finally { await rm(lock, { recursive: true, force: true }); }
}
