import { tissueMarketBadge } from "../../app/racing/today/tissue-market-badge";
import { captureIdentity } from "./frozen-capture-selection";
import { normalizeCompleteMarket, valueCompetitionRanks } from "./tissue-value-metrics";
import { validGenerationCapture, type GenerationRace } from "./tissue-generation-forward";

export const POSITIVE_NEUTRAL_VERSION = "TISSUE_POSITIVE_NEUTRAL_PROSPECTIVE_V1";
export const BADGE_STATES = ["POSITIVE", "NEUTRAL", "NEGATIVE", "FALLBACK"] as const;
export const POSITIVE_EDGE_BANDS = ["0.5-<2", "2-<5", "5-<10", "10+"] as const;
export const BADGE_PRICE_BANDS = ["<3", "3-<5", "5-<11", "11+"] as const;
export const POSITIVE_NEUTRAL_RULES = {
  tolerancePP: 0.5, edgeCutoffsPP: [0.5, 2, 5, 10], priceCutoffs: [3, 5, 11],
  capture: "first_genuine_post_arm_capture_per_race_no_replacement",
  badges: "reuse_Today_tissueMarketBadge_including_boundary_roundoff_tolerance",
  scores: "selection_Bernoulli_log_loss_and_Brier_frozen_probability_fractional_dead_heat_target",
  settlement: "read_exact_production_capture_canonical_outcomes_no_independent_settlement",
} as const;
export function tissuePositiveEdgeBand(edgePP: number): typeof POSITIVE_EDGE_BANDS[number] {
  if (!Number.isFinite(edgePP) || edgePP < 0.5 - 1e-10) throw new Error("Positive edge required");
  return POSITIVE_EDGE_BANDS[edgePP < 2 ? 0 : edgePP < 5 ? 1 : edgePP < 10 ? 2 : 3];
}
export function tissueBadgePriceBand(price: number): typeof BADGE_PRICE_BANDS[number] {
  if (!Number.isFinite(price) || price <= 1) throw new Error("Invalid captured price");
  return BADGE_PRICE_BANDS[price < 3 ? 0 : price < 5 ? 1 : price < 11 ? 2 : 3];
}
export function tissueBadgeSelection(probability: number, marketProbability: number | null) {
  const badge = tissueMarketBadge(probability, marketProbability);
  const badgeState: typeof BADGE_STATES[number] = badge ? badge.state.toUpperCase() as Exclude<typeof BADGE_STATES[number], "FALLBACK"> : "FALLBACK";
  const edgePP = marketProbability === null ? null : 100 * (probability - marketProbability);
  return { badgeState, included: badgeState === "POSITIVE" || badgeState === "NEUTRAL", edgePP,
    edgeBand: badgeState === "POSITIVE" ? tissuePositiveEdgeBand(edgePP!) : null };
}
/** Uses precisely the whole frozen production book projected for Today's badge. No Value or live odds. */
export function positiveNeutralCapture(book: GenerationRace) {
  if (!validGenerationCapture(book)) throw new Error("Invalid exact production capture for Tissue badges");
  const normalized = book.completeMarket ? normalizeCompleteMarket(book.runners.map(r => r.capturedPrice)) : null;
  if (book.completeMarket && !normalized) throw new Error("Incomplete same-capture market");
  const ranks = normalized ? valueCompetitionRanks(normalized.probabilities) : [];
  return { bookIdentity: captureIdentity(book), selections: book.runners.flatMap((r, i) => {
    if (r.rank !== 1 && r.rank !== 2) return [];
    const marketProbability = normalized ? r.marketProbability ?? normalized.probabilities[i] : null;
    return [{ runnerId: r.runnerId, horseId: r.horseId, horseName: r.horseName, tissueRank: r.rank as 1 | 2, probability: r.probability,
      marketProbability, price: r.capturedPrice, marketRank: normalized ? ranks[i] : null,
      priceBand: r.capturedPrice === null ? null : tissueBadgePriceBand(r.capturedPrice), ...tissueBadgeSelection(r.probability, marketProbability) }];
  }) };
}
