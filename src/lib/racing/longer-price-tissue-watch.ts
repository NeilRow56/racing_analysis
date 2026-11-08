export const LONGER_PRICE_TISSUE_WATCH_TOOLTIP = "Longer-price Tissue watch: Tissue Rank 1/2 captured above 5/1. Research identification only; no selection rule is applied.";

/** Pass only the authoritative frozen genuine bookmaker price, never current odds or SP. */
export function isLongerPriceTissueTop2({ tissueRank, capturedPrice, resultStatus }: {
  resultStatus?: string | null;
  tissueRank?: number | null;
  capturedPrice?: number | null;
}): boolean {
  return resultStatus !== "non_runner" && (tissueRank === 1 || tissueRank === 2) &&
    typeof capturedPrice === "number" && Number.isFinite(capturedPrice) && capturedPrice > 6;
}
