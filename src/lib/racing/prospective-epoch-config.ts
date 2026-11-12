export const EPOCH_ROOT = "data/research/prospective-epochs-2026-11-11";
export const EPOCH_MANIFEST = `${EPOCH_ROOT}/activation.json`;
export const COLLECTION_SEMANTICS = "production_capture_dependencies_2026_11_11_v2";
export const EPOCHS = {
  positiveNeutral: { id: "TISSUE_POSITIVE_NEUTRAL_COLLECTION_V2_2026_11_11", ledger: `${EPOCH_ROOT}/positive-neutral-v2.json` },
  shadow: { id: "HURDLE_V3_SHADOW_COLLECTION_V2_2026_11_11", ledger: `${EPOCH_ROOT}/hurdle-v3-shadow-v2.json` },
  marketEdge: { id: "HURDLE_V3_MARKET_EDGE_COLLECTION_V2_2026_11_11", ledger: `${EPOCH_ROOT}/hurdle-v3-market-edge-v2.json` },
} as const;
