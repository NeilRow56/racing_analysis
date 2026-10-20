export const TISSUE_VALUE_FAMILIES = ["TURF", "AW", "HURDLE", "CHASE"] as const;
export type TissueValueFamily = typeof TISSUE_VALUE_FAMILIES[number];
export type TissueValueFamilyFilter = TissueValueFamily | "ALL";

/** Market-comparison math shared by prospective value monitors; no selection rules. */
export const VALUE_RATIO_BANDS = ["<0.75", "0.75–<1.00", "1.00–<1.25", "1.25–<1.50", "1.50–<2.00", "2.00+"] as const;
export const VALUE_MARKET_RANK_BANDS = ["1", "2", "3", "4–5", "6–10", "11+"] as const;

export function valueRatioBand(ratio: number): typeof VALUE_RATIO_BANDS[number] {
  return VALUE_RATIO_BANDS[ratio < .75 ? 0 : ratio < 1 ? 1 : ratio < 1.25 ? 2 : ratio < 1.5 ? 3 : ratio < 2 ? 4 : 5];
}
export function valueMarketRankBand(rank: number): typeof VALUE_MARKET_RANK_BANDS[number] {
  return VALUE_MARKET_RANK_BANDS[rank === 1 ? 0 : rank === 2 ? 1 : rank === 3 ? 2 : rank <= 5 ? 3 : rank <= 10 ? 4 : 5];
}

export function calculateValueMetrics(probability: number, price: number, marketProbability: number) {
  if (![probability, price, marketProbability].every(Number.isFinite) || probability <= 0 || probability > 1 || price <= 1 || marketProbability <= 0 || marketProbability > 1)
    throw new Error("Invalid prospective value inputs");
  return {
    fairOdds: 1 / probability,
    probabilityEdge: probability - marketProbability,
    modelMarketRatio: probability / marketProbability,
    expectedReturn: probability * price - 1,
  };
}

/** Exact competition ties share a rank. Stable runner IDs order tied table rows. */
export function valueCompetitionRanks(values: number[], descending = true): number[] {
  return values.map(value => 1 + values.filter(other => descending ? other > value : other < value).length);
}

export type ValueOutcome = {
  status: "settled" | "NR" | "void";
  finishPosition: number | null;
  resultStatus: string | null;
  winner: boolean | null;
  deadHeatDivisor: number;
  grossReturn: number | null;
  profitLoss: number | null;
  settledAt: string;
};
export type ValueSummaryRunner = {
  probability: number;
  marketProbability: number;
  marketRank: number;
  modelMarketRatio: number;
  outcome: ValueOutcome | null;
};
export function summarizeValueRunners(rows: ValueSummaryRunner[]) {
  const settled = rows.filter(row => row.outcome?.status === "settled");
  const winners = settled.filter(row => row.outcome!.winner === true).length;
  const modelExpected = settled.reduce((sum, row) => sum + row.probability, 0);
  const marketExpected = settled.reduce((sum, row) => sum + row.marketProbability, 0);
  const priced = settled.filter(row => row.outcome!.profitLoss !== null);
  const profitLoss = priced.reduce((sum, row) => sum + row.outcome!.profitLoss!, 0);
  return {
    tracked: rows.length, runners: settled.length, winners,
    strikeRate: settled.length ? winners / settled.length : null,
    meanModelProbability: settled.length ? modelExpected / settled.length : null,
    meanMarketProbability: settled.length ? marketExpected / settled.length : null,
    modelExpected, marketExpected,
    actualModelExpected: modelExpected > 0 ? winners / modelExpected : null,
    actualMarketExpected: marketExpected > 0 ? winners / marketExpected : null,
    roi: priced.length ? profitLoss / priced.length : null,
    profitLoss: priced.length ? profitLoss : null,
    pending: rows.filter(row => row.outcome === null).length,
    nonRunners: rows.filter(row => row.outcome?.status === "NR").length,
    voids: rows.filter(row => row.outcome?.status === "void").length,
  };
}
export function summarizeValueBands(rows: ValueSummaryRunner[]) {
  return {
    ratio: VALUE_RATIO_BANDS.map(band => ({ band, ...summarizeValueRunners(rows.filter(row => valueRatioBand(row.modelMarketRatio) === band)) })),
    marketRank: VALUE_MARKET_RANK_BANDS.map(band => ({ band, ...summarizeValueRunners(rows.filter(row => valueMarketRankBand(row.marketRank) === band)) })),
  };
}

export type ValueSort = "valueRank" | "tissueRank" | "marketRank";
export function sortValueRunners<T extends { runnerId: string; valueRank: number; tissueRank: number; marketRank: number }>(rows: T[], by: ValueSort): T[] {
  return [...rows].sort((a, b) => a[by] - b[by] || a.runnerId.localeCompare(b.runnerId));
}
