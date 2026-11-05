import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { raceSoftmax, score, type Model } from "../../../scripts/diagnose-independent-tissue-feasibility";
import { GENERATION_FEATURES, tissueGenerationFeatures, type TissueGenerationContext } from "./tissue-generation-features";
import type { TissueValueFamily } from "./tissue-value-metrics";
import { GENERATION_MODEL_HASHES, TISSUE_GENERATION_EPOCH, TISSUE_DEVELOPMENT_CUTOFF } from "./tissue-generation-config";

export const GENERATION_MODEL_VERSIONS = {
  TURF: "TURF_TISSUE_V4", AW: "AW_TISSUE_V3", HURDLE: "HURDLE_TISSUE_V2", CHASE: "CHASE_TISSUE_V2",
} as const;
export type TissueGenerationModel = {
  generation: "TISSUE_GENERATION_2026_11"; version: string; family: TissueValueFamily;
  developmentCutoff: string; frozenAt: string; prospectiveEpoch: string; status: "frozen";
  baseVersion: string; baseChecksum: string; baseModel: Model; adjustment: Model;
  trainingSample: { races: number; runners: number };
  development: { sourceHashes: Record<string, string>; datasetHash: string; l2: number | null; contextRetained: boolean; note: string };
  checksum: string;
};
export const generationModelPath = (family: TissueValueFamily) => `data/research/tissue-generation-2026-11-${family.toLowerCase()}.json`;
export function generationChecksum(content: Omit<TissueGenerationModel, "checksum">) {
  return createHash("sha256").update(JSON.stringify(content)).digest("hex");
}
export async function loadTissueGenerationModels() {
  return Object.fromEntries(await Promise.all((Object.keys(GENERATION_MODEL_VERSIONS) as TissueValueFamily[]).map(async family => {
    const artifact = JSON.parse(await readFile(generationModelPath(family), "utf8")) as TissueGenerationModel;
    const { checksum, ...content } = artifact;
    if (artifact.family !== family || artifact.version !== GENERATION_MODEL_VERSIONS[family] || artifact.status !== "frozen" ||
      checksum !== generationChecksum(content) || checksum !== GENERATION_MODEL_HASHES[family] || artifact.prospectiveEpoch !== TISSUE_GENERATION_EPOCH ||
      artifact.developmentCutoff !== TISSUE_DEVELOPMENT_CUTOFF || JSON.stringify(artifact.adjustment.names) !== JSON.stringify(GENERATION_FEATURES[family])) throw new Error(`Invalid frozen ${family} generation model`);
    for (const model of [artifact.baseModel, artifact.adjustment]) for (const key of ["weights", "means", "scales"] as const) {
      if (model[key].length !== model.names.length || model[key].some(n => !Number.isFinite(n) || (key === "scales" && n <= 0))) throw new Error("Invalid frozen model parameters");
    }
    return [family, artifact];
  }))) as Record<TissueValueFamily, TissueGenerationModel>;
}

/** Frozen base racing logits plus a small family-specific fitted racing-context adjustment.
 * No market fields, filters, manual rank suppression, or target outcomes enter scoring.
 */
export function predictTissueGeneration(model: TissueGenerationModel, input: {
  family: TissueValueFamily; raceId: string; capturedAt: string; featureNames: readonly string[];
  runners: readonly { runnerId: string; modelInputs: readonly number[]; context?: TissueGenerationContext }[];
}) {
  if (model.family !== input.family || JSON.stringify(model.baseModel.names) !== JSON.stringify(input.featureNames) || input.runners.length < 2 ||
    input.runners.some(r => r.modelInputs.length !== model.baseModel.names.length || r.modelInputs.some(v => !Number.isFinite(v)))) throw new Error("Generation scoring field/schema mismatch");
  const features = tissueGenerationFeatures(input);
  const probabilities = raceSoftmax(input.runners.map(r => score(model.baseModel, [...r.modelInputs]) + score(model.adjustment, features.get(r.runnerId)!)));
  const order = [...input.runners.keys()].sort((a, b) => probabilities[b] - probabilities[a] || input.runners[a].runnerId.localeCompare(input.runners[b].runnerId));
  return input.runners.map((r, i) => ({ runnerId: r.runnerId, probability: probabilities[i],
    rank: input.family === "TURF" ? 1 + probabilities.filter(p => p > probabilities[i]).length : order.indexOf(i) + 1,
    adjustmentInputs: features.get(r.runnerId)! }));
}
