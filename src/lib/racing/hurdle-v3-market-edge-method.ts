import type { HurdleV3ChallengerModel } from "./hurdle-v3-challenger-model";
import { hurdleV3PriorHistory } from "./hurdle-v3-challenger-features";
import type { HurdleV3ShadowObservation } from "./hurdle-v3-shadow";
import { normalizeCompleteMarket, valueCompetitionRanks } from "./tissue-value-metrics";

export const MARKET_EDGE_VERSION = "HURDLE_V3_MARKET_EDGE_PROSPECTIVE_V1";
export const EDGE_BANDS = ["NEGATIVE", "SMALL POSITIVE", "MEDIUM POSITIVE", "LARGE POSITIVE"] as const;
export const SPEED_DEPTHS = ["NO USABLE RECENT SPEED", "ONE USABLE RECENT SPEED", "TWO USABLE RECENT SPEEDS", "THREE+ / ESTABLISHED SPEED"] as const;
export const MARKET_RANK_BANDS = ["1-2", "3-5", "6-8", "9+"] as const;
export const CONTRIBUTION_GROUPS = ["OR", "Speed", "Speed context", "trainer", "jockey", "age", "recency", "Hurdle experience", "completion", "comments", "missingness", "other"] as const;
export const MARKET_EDGE_RULES = {
  edgeCutoffsPP: [0, 5, 10], speedWindowStarts: 3, lowSpeedMaximum: 1, marketRankUpperBounds: [2, 5, 8],
  market: "exact_same_capture_full_book", speed: "finite_ratings_in_actual_last_three_canonical_hurdle_starts_no_backfill_no_age_cutoff",
  calibration: "runner_weighted_ECE_ten_fixed_probability_bins", settlement: "read_exact_canonical_shadow_renormalize_actual_starters",
} as const;
export function hurdleEdgeBand(edgePP: number): typeof EDGE_BANDS[number] {
  if (!Number.isFinite(edgePP)) throw new Error("Nonfinite V3 market edge");
  return EDGE_BANDS[edgePP < 0 ? 0 : edgePP < 5 ? 1 : edgePP < 10 ? 2 : 3];
}
export function hurdleMarketRankBand(rank: number): typeof MARKET_RANK_BANDS[number] {
  if (!Number.isInteger(rank) || rank < 1) throw new Error("Invalid market rank");
  return MARKET_RANK_BANDS[rank <= 2 ? 0 : rank <= 5 ? 1 : rank <= 8 ? 2 : 3];
}
export function hurdleSpeedDepth(r: HurdleV3ShadowObservation["runners"][number]) {
  const count = hurdleV3PriorHistory(r.target, r.history).slice(0, 3).filter(h => h.speed !== null && Number.isFinite(h.speed)).length;
  return { count, category: SPEED_DEPTHS[count], evidence: count <= 1 ? "LOW SPEED EVIDENCE" as const : "ESTABLISHED SPEED EVIDENCE" as const };
}
function contributionGroup(name: string): typeof CONTRIBUTION_GROUPS[number] {
  if (name.includes("missing")) return "missingness";
  if (name === "official_rating" || name === "or_field_percentile") return "OR";
  if (name.includes("speed_field") || name.includes("speed_rank")) return "Speed context";
  if (name.includes("speed")) return "Speed";
  if (name.includes("trainer")) return "trainer";
  if (name.includes("jockey")) return "jockey";
  if (name === "age") return "age";
  if (name.includes("days_since")) return "recency";
  if (name === "log_prior_hurdle_starts") return "Hurdle experience";
  if (name.includes("completed") || name.includes("pulled_up") || name.includes("fell_unseated")) return "completion";
  if (name.includes("comment")) return "comments";
  return "other";
}
export function hurdleEdgeContributions(r: HurdleV3ShadowObservation["runners"][number], model: HurdleV3ChallengerModel) {
  const m = model.model;
  const features = m.names.map((name, i) => ({ name, contribution: m.weights[i] * ((r.raw[name] ?? m.means[i]) - m.means[i]) / m.scales[i] }));
  const groups = CONTRIBUTION_GROUPS.map(group => ({ name: group, contribution: features.filter(f => contributionGroup(f.name) === group).reduce((s, f) => s + f.contribution, 0) }));
  if (Math.abs(groups.reduce((s, g) => s + g.contribution, 0) - r.official.logit) > 1e-12) throw new Error("V3 edge attribution does not match frozen score");
  const positive = (rows: { name: string; contribution: number }[]) => rows.filter(r => r.contribution > 0).sort((a, b) => b.contribution - a.contribution || a.name.localeCompare(b.name)).slice(0, 3);
  return { groups, topPositiveGroups: positive(groups), topPositiveFeatures: positive(features) };
}
/** No external odds or approximate match is accepted. A mismatch is not an incomplete book. */
export function exactHurdleEdgeMarket(o: HurdleV3ShadowObservation) {
  const b = o.production;
  if (o.raceId !== b.raceId || o.capturedAt !== b.capturedAt || Date.parse(b.capturedAt) >= Date.parse(b.scheduledOff) ||
    b.runners.length !== o.runners.length || new Set(b.runners.map(r => r.runnerId)).size !== b.runners.length ||
    new Set(o.runners.map(r => r.target.runnerId)).size !== o.runners.length ||
    o.runners.some(r => !b.runners.some(p => p.runnerId === r.target.runnerId) || r.target.raceId !== b.raceId || r.target.cutoff !== b.featureCutoffAt || r.target.scheduledOff !== b.scheduledOff)) throw new Error("V3 market requires exact same-capture field and cutoff");
  const normalized = b.completeMarket ? normalizeCompleteMarket(b.runners.map(r => r.capturedPrice)) : null;
  if (!normalized) return null;
  const ranks = valueCompetitionRanks(normalized.probabilities);
  const rows = b.runners.map((r, i) => ({ runnerId: r.runnerId, price: r.capturedPrice!, probability: normalized.probabilities[i], rank: ranks[i] }));
  const ordered = [...rows].sort((a, b) => b.probability - a.probability || a.runnerId.localeCompare(b.runnerId));
  return { rows, favourite: ordered[0].runnerId, secondFavourite: ordered[1].runnerId };
}
