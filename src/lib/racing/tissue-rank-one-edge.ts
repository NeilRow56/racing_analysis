import type { SportingLifeCurrentPrice } from "./todays-racing";
import type { ForwardValuePriceSnapshot } from "./forward-value";

export const LARGE_PROBABILITY_GAP_PP = 10;

export type TissueRankOneEdge = {
  price: SportingLifeCurrentPrice;
  impliedProbability: number;
  edge: number;
};

export type FrozenTissueRankOneEdge = TissueRankOneEdge & {
  qualificationPrice: ForwardValuePriceSnapshot;
  qualificationStage: "early" | "t180" | "t60";
  latestPrice: SportingLifeCurrentPrice | null;
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

export function frozenTissueRankOneEdge(
  tissueProbability: number | null | undefined,
  raceId: string,
  runnerId: string,
  prices: { early: ForwardValuePriceSnapshot | null; t180: ForwardValuePriceSnapshot | null; t60: ForwardValuePriceSnapshot | null },
  latestPrice: SportingLifeCurrentPrice | null | undefined,
): FrozenTissueRankOneEdge | null {
  if (tissueProbability === null || tissueProbability === undefined || !Number.isFinite(tissueProbability)) return null;
  const [qualificationStage, qualificationPrice] = prices.t60
    ? ["t60", prices.t60] as const
    : prices.t180
      ? ["t180", prices.t180] as const
      : prices.early
        ? ["early", prices.early] as const
        : [null, null] as const;
  if (!qualificationStage || !qualificationPrice) return null;
  if ((qualificationPrice.bookmakerQuoteCount ?? 0) <= 0 || !Number.isFinite(qualificationPrice.decimalPrice) || qualificationPrice.decimalPrice <= 1) return null;
  const impliedProbability = qualificationPrice.impliedProbability;
  if (!Number.isFinite(impliedProbability) || impliedProbability <= 0) return null;
  const edge = tissueProbability - impliedProbability;
  return {
    price: {
      raceId,
      runnerId,
      marketPrice: qualificationPrice.decimalPrice.toFixed(2),
      marketDecimalOdds: qualificationPrice.decimalPrice,
      bookmakerQuoteCount: qualificationPrice.bookmakerQuoteCount ?? 0,
      forecastPrice: qualificationPrice.forecastPrice ?? null,
      forecastDecimalOdds: qualificationPrice.forecastDecimalPrice ?? null,
      displayRaceTime: latestPrice?.displayRaceTime ?? "",
    },
    impliedProbability,
    edge,
    qualificationPrice,
    qualificationStage,
    latestPrice: latestPrice ?? null,
  };
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
