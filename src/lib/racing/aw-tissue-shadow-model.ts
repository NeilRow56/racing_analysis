import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { AW_TISSUE_ARTIFACT_HASH, AW_TISSUE_FEATURES } from "./aw-tissue-model";

export const AW_SHADOW_MODEL_PATH = "data/research/aw-tissue-parity-shadow-model-v1.json";
export const AW_SHADOW_VERSION = "AW_TISSUE_PARITY_SHADOW_V1";
export const AW_SHADOW_SCHEMA = "aw_tissue_parity_shadow_features_v1";
export const AW_SHADOW_IMPLEMENTED_AT = "2026-10-07T03:57:11.000Z";
export const AW_SHADOW_CHECKSUM = "a31c8be2f1e86034bf22ae8955ca59bbda2f3f18e4ab1529bf6e8212b7d1bf1e";
const NUMERIC = [...AW_TISSUE_FEATURES, "log_trainer_prior_runs", "log_jockey_prior_runs"];
export const AW_SHADOW_NAMES = [...NUMERIC, ...NUMERIC.map(n => `${n}_missing`), "prior_comment_count", "last_weakened", "last3_weakened_count"];
export type AwShadowModel = {
  version: string; schema: string; diagnosticOnly: boolean; implementedAt: string; candidate: string;
  productionV1Checksum: string; checksum: string;
  model: { names: string[]; means: number[]; scales: number[]; weights: number[] };
};
export type AwShadowComment = { raceId: string; raceDateTime: string; comment: string };
export type AwShadowExtras = { trainerPriorRuns: number; jockeyPriorRuns: number; comments: AwShadowComment[] };

export async function loadAwShadowModel(path = AW_SHADOW_MODEL_PATH): Promise<AwShadowModel> {
  const artifact = JSON.parse(await readFile(path, "utf8")) as AwShadowModel;
  const { checksum, ...contents } = artifact;
  if (checksum !== AW_SHADOW_CHECKSUM || createHash("sha256").update(JSON.stringify(contents)).digest("hex") !== checksum ||
      artifact.version !== AW_SHADOW_VERSION || artifact.schema !== AW_SHADOW_SCHEMA || artifact.diagnosticOnly !== true ||
      artifact.implementedAt !== AW_SHADOW_IMPLEMENTED_AT || artifact.candidate !== "AW-R2" ||
      artifact.productionV1Checksum !== AW_TISSUE_ARTIFACT_HASH || JSON.stringify(artifact.model.names) !== JSON.stringify(AW_SHADOW_NAMES)) {
    throw new Error("Invalid frozen diagnostic AW shadow artifact");
  }
  for (const key of ["means", "scales", "weights"] as const) {
    const values = artifact.model[key];
    if (values.length !== AW_SHADOW_NAMES.length || values.some(v => !Number.isFinite(v) || (key === "scales" && v <= 0))) throw new Error("Invalid AW shadow parameters");
  }
  return artifact;
}

export function shadowInputs(base: Array<number | null>, extras: AwShadowExtras, targetRaceId: string, off: string, capturedAt: string): Array<number | null> {
  if (base.length !== AW_TISSUE_FEATURES.length || base.some(v => v !== null && !Number.isFinite(v)) ||
      [extras.trainerPriorRuns, extras.jockeyPriorRuns].some(n => !Number.isInteger(n) || n < 0)) throw new Error("Invalid shadow inputs");
  const prior = extras.comments.filter(c => c.raceId !== targetRaceId && c.comment.trim() &&
    Number.isFinite(Date.parse(c.raceDateTime)) && Date.parse(c.raceDateTime) < Date.parse(off) && Date.parse(c.raceDateTime) < Date.parse(capturedAt))
    .sort((a, b) => Date.parse(b.raceDateTime) - Date.parse(a.raceDateTime)).slice(0, 3);
  const weakened = prior.map(c => /\bweakened\b/i.test(c.comment) ? 1 : 0);
  const numeric = [...base, Math.log1p(extras.trainerPriorRuns), Math.log1p(extras.jockeyPriorRuns)];
  return [...numeric, ...numeric.map(v => v === null ? 1 : 0), prior.length, weakened[0] ?? 0, weakened.reduce<number>((a, b) => a + b, 0)];
}

export function shadowProbabilities(inputs: Array<Array<number | null>>, artifact: AwShadowModel): number[] {
  const m = artifact.model;
  if (inputs.length < 2 || inputs.some(r => r.length !== AW_SHADOW_NAMES.length)) throw new Error("Incomplete AW shadow field");
  const scores = inputs.map(r => r.reduce<number>((s, v, j) => s + m.weights[j]! * ((v ?? m.means[j]!) - m.means[j]!) / m.scales[j]!, 0));
  const maximum = Math.max(...scores), weights = scores.map(s => Math.exp(s - maximum));
  const total = weights.reduce((a, b) => a + b, 0), probabilities = weights.map(w => w / total);
  if (probabilities.some(p => !Number.isFinite(p) || p <= 0) || Math.abs(probabilities.reduce((a, b) => a + b, 0) - 1) > 1e-12) throw new Error("Invalid AW shadow book");
  return probabilities;
}
