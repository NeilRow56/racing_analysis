import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { JUMP_TISSUE_FEATURE_NAMES, JUMP_TISSUE_SCHEMA } from "./jump-tissue-model";
import type { Model } from "../../../scripts/diagnose-independent-tissue-feasibility";

export const CHASE_SHADOW_VERSION = "CHASE_SHADOW_V1" as const;
export const CHASE_SHADOW_SCHEMA = JUMP_TISSUE_SCHEMA;
export const CHASE_SHADOW_HASH = "ae956fa262be218f0574816c7607ef958b4221e6ae414432c1793744bea8a602";
export const CHASE_SHADOW_FILE_HASH = "5555629b517413a2caed8e15be46619309d88d527e888a1720d3de6a12ea8dd4";
export const CHASE_SHADOW_MODEL_PATH = "data/research/chase-shadow-v1-frozen.json";
export type ChaseShadowModel = {
  version: typeof CHASE_SHADOW_VERSION; set: "A"; frozenAt: string;
  trainingPeriod: string; developmentTrain: string; validation: string;
  checksum: string; model: Model;
};
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");

/** Byte-for-byte copy of the completed report artifact. No fitting or fallback. */
export async function loadChaseShadowModel(path = CHASE_SHADOW_MODEL_PATH): Promise<ChaseShadowModel> {
  try {
    const bytes = await readFile(path);
    const artifact = JSON.parse(bytes.toString()) as ChaseShadowModel;
    const { checksum, ...content } = artifact;
    if (hash(bytes) !== CHASE_SHADOW_FILE_HASH || checksum !== CHASE_SHADOW_HASH || hash(JSON.stringify(content)) !== checksum ||
      artifact.version !== CHASE_SHADOW_VERSION || artifact.set !== "A" ||
      artifact.trainingPeriod !== "2025-01-01/2025-12-31" || artifact.validation !== "2025-10-01/2025-12-31" ||
      JSON.stringify(artifact.model.names) !== JSON.stringify(JUMP_TISSUE_FEATURE_NAMES)) throw new Error("identity mismatch");
    for (const key of ["means", "scales", "weights"] as const) {
      const values = artifact.model[key];
      if (values.length !== JUMP_TISSUE_FEATURE_NAMES.length || values.some(n => !Number.isFinite(n) || (key === "scales" && n <= 0))) throw new Error("invalid parameters");
    }
    return artifact;
  } catch (cause) {
    throw new Error("Cannot load exact frozen CHASE_SHADOW_V1 artifact; shadow capture stopped", { cause });
  }
}
