/** Presentational only. Never use this tolerance for ranking or Value selection. */
const NEUTRAL_TOLERANCE = 0.005;

export function tissueMarketBadge(probability: number | null | undefined, marketProbability: number | null | undefined) {
  if (typeof probability !== "number" || !Number.isFinite(probability) || probability < 0 || probability > 1 ||
      typeof marketProbability !== "number" || !Number.isFinite(marketProbability) || marketProbability <= 0 || marketProbability > 1) return null;
  const edge = probability - marketProbability;
  // Ignore floating-point subtraction noise at the exact half-percentage-point boundary.
  const state = Math.abs(edge) < NEUTRAL_TOLERANCE - 1e-12 ? "neutral" : edge < 0 ? "negative" : "positive";
  const displayEdge = (edge * 100).toFixed(1);
  const tooltip = `Tissue ${(probability * 100).toFixed(1)}% · Market ${(marketProbability * 100).toFixed(1)}% · Edge ${edge > 0 ? "+" : ""}${displayEdge} pp. Frozen capture; this is not Value rank.`;
  return { state, tooltip };
}
