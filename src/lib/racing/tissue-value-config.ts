import { TURF_VALUE_EPOCH, TURF_VALUE_PATH, TURF_VALUE_VERSION, VALUE_FEATURE_NAMES, VALUE_FEATURE_SCHEMA } from "./turf-value-definition";
import { TISSUE_V3_MODEL_VERSION, TISSUE_V3_LIVE_SEMANTICS_VERSION } from "./tissue-forward";
import { AW_TISSUE_V2_VERSION, AW_TISSUE_V2_SCORER } from "./aw-tissue-v2";
import { AW_TISSUE_V2_SCHEMA, AW_V2_NAMES } from "./aw-tissue-v2-features";
import { JUMP_TISSUE_VERSION, JUMP_TISSUE_SCHEMA, JUMP_TISSUE_FEATURE_NAMES } from "./jump-tissue-model";
import type { TissueValueFamily } from "./tissue-value-metrics";

export type ValueCohortConfig = {
  family: TissueValueFamily; version: string; epoch: string; path: string; modelVersion: string; scorerVersion: string;
  featureSchemaVersion: string; featureNames: readonly string[]; tissueTies: "competition" | "ordinal";
  probabilityAvailable: boolean; unavailableReason: string | null;
};
export const NEW_FAMILY_VALUE_EPOCH = "2026-10-20T04:49:53.000Z";
export const TURF_VALUE_CONFIG: ValueCohortConfig = { family: "TURF", version: TURF_VALUE_VERSION, epoch: TURF_VALUE_EPOCH, path: TURF_VALUE_PATH,
  modelVersion: TISSUE_V3_MODEL_VERSION, scorerVersion: TISSUE_V3_LIVE_SEMANTICS_VERSION, featureSchemaVersion: VALUE_FEATURE_SCHEMA, featureNames: VALUE_FEATURE_NAMES,
  tissueTies: "competition", probabilityAvailable: true, unavailableReason: null };
export const AW_VALUE_CONFIG: ValueCohortConfig = { family: "AW", version: "AW_TISSUE_V2_VALUE_FORWARD_V1", epoch: NEW_FAMILY_VALUE_EPOCH,
  path: "data/research/aw-tissue-v2-value-forward-v1.json", modelVersion: AW_TISSUE_V2_VERSION, scorerVersion: AW_TISSUE_V2_SCORER,
  featureSchemaVersion: AW_TISSUE_V2_SCHEMA, featureNames: AW_V2_NAMES, tissueTies: "competition", probabilityAvailable: true, unavailableReason: null };
export const HURDLE_VALUE_CONFIG: ValueCohortConfig = { family: "HURDLE", version: "HURDLE_JUMP_TISSUE_V1_VALUE_FORWARD_V1", epoch: NEW_FAMILY_VALUE_EPOCH,
  path: "data/research/hurdle-jump-tissue-v1-value-forward-v1.json", modelVersion: JUMP_TISSUE_VERSION, scorerVersion: "predictJumpTissue",
  featureSchemaVersion: JUMP_TISSUE_SCHEMA, featureNames: JUMP_TISSUE_FEATURE_NAMES, tissueTies: "ordinal", probabilityAvailable: true, unavailableReason: null };
export const CHASE_VALUE_CONFIG: ValueCohortConfig = { ...HURDLE_VALUE_CONFIG, family: "CHASE", version: "CHASE_JUMP_TISSUE_V1_VALUE_FORWARD_V1",
  path: "data/research/chase-jump-tissue-v1-value-forward-v1.json" };
export const VALUE_COHORTS = [TURF_VALUE_CONFIG, AW_VALUE_CONFIG, HURDLE_VALUE_CONFIG, CHASE_VALUE_CONFIG] as const;
