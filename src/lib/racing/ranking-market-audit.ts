export type MarketAuditSelection = {
  family: "Turf" | "Jump" | "All Weather";
  model: string;
  cohort: "frozen_forward" | "historical_cache";
  basis: "prospective_median" | "final_sp";
  raceId: string;
  raceDate: string;
  runnerId: string;
  won: boolean;
  price: number;
  modelProbability: number | null;
  confidence: "HIGH" | "MEDIUM" | "LOW" | "UNAVAILABLE";
  favourite: "favourite" | "joint_favourite" | "not_favourite" | "unknown";
  capturedAt: string | null;
};

export const MARKET_PRICE_BANDS = [
  "odds-on", "evens to <2/1", "2/1 to <4/1", "4/1 to <8/1", "8/1+",
] as const;
export const SHORT_MARKET_PRICE_BANDS = ["odds-on", "evens to <6/4", "6/4 to <2/1"] as const;

export function marketPriceBand(price: number): typeof MARKET_PRICE_BANDS[number] {
  return price < 2 ? "odds-on" : price < 3 ? "evens to <2/1" : price < 5 ? "2/1 to <4/1" : price < 9 ? "4/1 to <8/1" : "8/1+";
}

export function shortMarketPriceBand(price: number): typeof SHORT_MARKET_PRICE_BANDS[number] | null {
  return price < 2 ? "odds-on" : price < 2.5 ? "evens to <6/4" : price < 3 ? "6/4 to <2/1" : null;
}

export function validMarketPrice(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 1;
}

export function safeMarketCapture(capturedAt: string | null | undefined, recordedAt: string, offAt: string): boolean {
  const capture = Date.parse(capturedAt ?? "");
  return Number.isFinite(capture) && capture >= Date.parse(recordedAt) && capture < Date.parse(offAt);
}

export function marketFavourite(runnerId: string, prices: Array<{ runnerId: string; price: number | null }>): MarketAuditSelection["favourite"] {
  // An incomplete field cannot establish favourite status, even when the leader is priced.
  if (prices.length < 2 || prices.some((row) => !validMarketPrice(row.price))) return "unknown";
  const minimum = Math.min(...prices.map((row) => row.price!));
  const favourites = prices.filter((row) => Math.abs(row.price! - minimum) < 1e-8);
  return favourites.some((row) => row.runnerId === runnerId)
    ? favourites.length > 1 ? "joint_favourite" : "favourite"
    : "not_favourite";
}

export function summarizeMarketSelections(rows: MarketAuditSelection[]) {
  if (new Set(rows.map((row) => `${row.cohort}|${row.basis}|${row.model}`)).size > 1) {
    throw new Error("Market summaries must keep models, cohorts and price bases separate");
  }
  if (rows.some((row) => !validMarketPrice(row.price))) throw new Error("Invalid market price");
  const n = rows.length;
  const winners = rows.filter((row) => row.won).length;
  const marketExpected = rows.reduce((sum, row) => sum + 1 / row.price, 0);
  const variance = rows.reduce((sum, row) => { const p = 1 / row.price; return sum + p * (1 - p); }, 0);
  const priced = [...rows.map((row) => row.price)].sort((a, b) => a - b);
  const modelRows = rows.filter((row) => row.modelProbability !== null);
  const modelExpected = n > 0 && modelRows.length === n
    ? modelRows.reduce((sum, row) => sum + row.modelProbability!, 0) : null;
  const residual = winners - marketExpected;
  return {
    selections: n, actualWinners: winners, actualStrike: n ? winners / n : null,
    marketExpectedWinners: marketExpected, marketExpectedStrike: n ? marketExpected / n : null,
    actualMinusExpectedWinners: n ? residual : null, actualMinusExpectedStrike: n ? residual / n : null,
    ae: marketExpected ? winners / marketExpected : null,
    modelProbabilitySelections: modelRows.length, modelExpectedWinners: modelExpected,
    actualMinusModelExpected: modelExpected === null ? null : winners - modelExpected,
    averagePrice: n ? priced.reduce((sum, price) => sum + price, 0) / n : null,
    medianPrice: n ? (priced[Math.floor(n / 2)]! + priced[Math.floor((n - 1) / 2)]!) / 2 : null,
    underTwoToOne: n ? rows.filter((row) => row.price < 3).length / n : null,
    priceDistribution: MARKET_PRICE_BANDS.map((band) => ({ band, selections: rows.filter((row) => marketPriceBand(row.price) === band).length, proportion: n ? rows.filter((row) => marketPriceBand(row.price) === band).length / n : null })),
    marketResidualZ: variance > 0 ? residual / Math.sqrt(variance) : null,
    aeApprox95: marketExpected ? [Math.max(0, (winners - 1.96 * Math.sqrt(variance)) / marketExpected), (winners + 1.96 * Math.sqrt(variance)) / marketExpected] : null,
  };
}
