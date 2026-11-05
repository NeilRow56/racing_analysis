import { isActiveValueOne, VALUE_RANK_VERSION } from "./value-rank-v2";

export const TISSUE_VALUE_AGREEMENT_TOOLTIP = "Tissue Rank 1 and active Value 1 agree on this runner. Post-epoch captures use VALUE_RANK_V2, including its experience gate. Research confirmation only; not independent validation.";

/** Value retains its own frozen book; active Tissue may come from the new family-model ledger. */
export function isTissue1Value1Agreement(observation?: {
  tissueRank?: number | null;
  valueRank?: number | null;
  activeValue1?: boolean;
  activeTissueRank?: number | null;
  valueSelectionVersion?: string;
} | null): boolean {
  const tissueRank = observation?.activeTissueRank === undefined ? observation?.tissueRank : observation.activeTissueRank;
  if (observation?.activeTissueRank !== undefined &&
    (observation.valueSelectionVersion !== VALUE_RANK_VERSION || observation.activeValue1 !== true)) return false;
  return tissueRank === 1 && isActiveValueOne(observation);
}
