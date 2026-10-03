import type { SportingLifeCurrentPrice } from "./todays-racing";

export const LARGE_PROBABILITY_GAP_PP = 10;

export type TissueRankOneEdge = {
  price: SportingLifeCurrentPrice;
  impliedProbability: number;
  edge: number;
};

export function currentTissueRankOneEdge(
  tissueProbability: number | null | undefined,
  price: SportingLifeCurrentPrice | null | undefined,
): TissueRankOneEdge | null {
  if (tissueProbability === null || tissueProbability === undefined || !Number.isFinite(tissueProbability)) return null;
  if (!price || price.bookmakerQuoteCount <= 0 || price.marketDecimalOdds === null || !Number.isFinite(price.marketDecimalOdds) || price.marketDecimalOdds <= 1 || !price.marketPrice?.trim()) return null;
  const impliedProbability = 1 / price.marketDecimalOdds;
  const edge = tissueProbability - impliedProbability;
  return { price, impliedProbability, edge };
}

export function isLargeTissueEdge(edge: number): boolean {
  return edge * 100 >= LARGE_PROBABILITY_GAP_PP - 1e-9;
}

export function formatTissueProbability(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatTissueEdge(value: number): string {
  const points = value * 100;
  return `${points >= 0 ? "+" : ""}${points.toFixed(1)}pp`;
}

export function formatPositiveTissueRankOneEdgeLine(input: {
  tissueProbability: number;
  marketPrice: string;
  edge: number;
  bookmakerQuoteCount: number;
}): string {
  return [
    `Tissue ${formatTissueProbability(input.tissueProbability)}`,
    `Market ${input.marketPrice.trim()}`,
    `Edge ${formatTissueEdge(input.edge)}`,
    `Quotes ${input.bookmakerQuoteCount}`,
    ...(isLargeTissueEdge(input.edge) ? ["LARGE"] : []),
  ].join(" | ");
}
