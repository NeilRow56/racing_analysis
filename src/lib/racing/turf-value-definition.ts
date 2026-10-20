import { COMMENT_FEATURE_NAMES, NUMERIC_FEATURES } from "../../../scripts/diagnose-independent-tissue-feasibility";

export const TURF_VALUE_VERSION = "TURF_TISSUE_V3_VALUE_FORWARD_V1" as const;
export const TURF_VALUE_EPOCH = "2026-10-20T04:39:30.000Z";
export const TURF_VALUE_PATH = "data/research/turf-tissue-v3-value-forward-v1.json";
export const VALUE_FEATURE_SCHEMA = "tissue_numeric_comments_95_v1" as const;
export const VALUE_MARKET_SOURCE = "sporting_life_median_bookmaker_at_capture_v1" as const;
export const VALUE_FEATURE_NAMES = [...NUMERIC_FEATURES.map(([name]) => name), ...NUMERIC_FEATURES.map(([name]) => `${name}_missing`), ...COMMENT_FEATURE_NAMES];

