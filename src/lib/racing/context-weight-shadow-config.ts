/** New prospective phase. These definitions never modify the production artifacts. */
export const CONTEXT_SHADOW_EPOCH = "2026-11-07T12:10:00.000Z";
export const CONTEXT_SHADOW_VERSION = "context_weight_shadow_v1" as const;
export const CONTEXT_SHADOW_PATH = "data/research/context-weight-shadow-v1.json";
export const CONTEXT_SHADOW_CANDIDATES = Object.freeze({
  AW: Object.freeze({ id: "aw_context_75_shadow_v1", family: "AW", multiplier: .75,
    features: Object.freeze(["speed_rank_2_3", "same_or_speed_gap"]),
    productionVersion: "AW_TISSUE_V3", productionHash: "c8f75faa0aeacc88ba76f100e7d154a872bc9b2ee31a5a42d18e611e3e64f9a5" }),
  TURF: Object.freeze({ id: "turf_context_25_shadow_v1", family: "TURF", multiplier: .25,
    features: Object.freeze(["same_or_speed_gap"]),
    productionVersion: "TURF_TISSUE_V4", productionHash: "e106fadd07263b1fcc4ece821a4bfcad645faeae873db026433a4902eabbe3fe" }),
} as const);
export type ContextShadowFamily = keyof typeof CONTEXT_SHADOW_CANDIDATES;
