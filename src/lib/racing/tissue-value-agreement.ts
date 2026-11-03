export const TISSUE_VALUE_AGREEMENT_TOOLTIP = "Tissue Rank 1 and Value Rank 1 agree on this runner. Research confirmation marker only. Current agreement sample remains small; no selection rule is applied.";

/** Pass both persisted ranks from one runner in the same validated frozen Value book. */
export function isTissue1Value1Agreement(observation?: {
  tissueRank?: number | null;
  valueRank?: number | null;
} | null): boolean {
  return observation?.tissueRank === 1 && observation.valueRank === 1;
}
