import type { HistoricalTargetRunnerMetricsRow } from "./historical-target-metrics";
import { settleSelection } from "./backtest";
import { settlementOutcomeState } from "./settlement-outcome";
import { CANONICAL_SETTLEMENT_VERSION } from "./research-settlement-version";

export const JUMP_CANDIDATE_WARNING = "Reconstructed exploratory evidence — historical publication-time provenance incomplete.";
// Only fields covered by the recorded aggregate audit. No model/tissue eligibility is inferred.
export const CANDIDATE_RATING_FEATURES = [
  "latestSpeedRating", "previousSpeedRating", "bestSpeedLast3", "averageSpeedLast3", "bestSpeedLast5",
  "latestPerformanceRating", "previousPerformanceRating", "bestPerformanceLast3", "averagePerformanceLast3", "bestPerformanceLast5",
  "latestTodaysRating", "previousTodaysRating", "bestTodaysRatingLast3", "averageTodaysRatingLast3", "bestTodaysRatingLast5",
] as const;
export const CANDIDATE_FEATURES = [...CANDIDATE_RATING_FEATURES, "officialRating", "priorRuns", "daysSinceLastRun"] as const;
export type CandidateFeature = typeof CANDIDATE_FEATURES[number];
export type CandidateSidecar = {
  runnerId: string; raceId: string; sourceFullResult: boolean; targetTimeMissing: boolean;
  settlementState: ReturnType<typeof settlementOutcomeState>; validSP: boolean;
  threeBestL3Finite: boolean; referenceEligible: boolean; ratingsL3Clear: boolean; strictExploratoryUsable: boolean;
  definiteUntimedPriorIds: string[]; uncertainPriorIds: string[]; hiddenActualL3Ids: string[];
  potentialL3ContextIds: string[]; potentialAnyContextCount: number; builderLast3Ids: string[];
};
export type CandidateRow = { row: HistoricalTargetRunnerMetricsRow; evidence: CandidateSidecar };
/** Independently checked full-result roster, never a count inferred from cache rows. */
export type CandidateFieldEvidence = {
  raceId: string; runnerIds: readonly string[]; starterIds: readonly string[]; nonRunnerIds: readonly string[];
  sourcePath: string; sha256: string;
};
export type FeatureEligibility = { eligible: boolean; reasons: string[] };
export type CandidateRank = {
  status: "verified_whole_field" | "partial_field_diagnostic" | "unavailable";
  wholeFieldRank: number | null; diagnosticRank: number | null;
};
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
export function candidateFeatureEligibility({ row, evidence: e }: CandidateRow, feature: CandidateFeature): FeatureEligibility {
  if (!(CANDIDATE_FEATURES as readonly string[]).includes(feature)) throw new Error(`Unsupported candidate feature: ${feature}`);
  const reasons: string[] = [];
  if (!e.sourceFullResult) reasons.push("target_full_result_unverified");
  if (!finite(row.features[feature])) reasons.push(`missing_feature:${feature}`);
  if (feature !== "officialRating") {
    if (e.definiteUntimedPriorIds.length) reasons.push("definite_untimed_prior");
    if (e.uncertainPriorIds.length) reasons.push("uncertain_prior_evidence");
    if (e.hiddenActualL3Ids.length) reasons.push("hidden_untimed_last_three");
  }
  if ((CANDIDATE_RATING_FEATURES as readonly string[]).includes(feature)) {
    // The sidecar has no per-feature dependency clearance. A finite rating or a clean
    // direct prior is never evidence that the wider historical context was verified.
    if (e.potentialL3ContextIds.length) reasons.push("unverified_last_three_rating_context");
    if (e.potentialAnyContextCount > 0) reasons.push("unverified_historical_rating_context");
    if (!e.builderLast3Ids.length) reasons.push("rating_history_unverified");
  }
  return { eligible: reasons.length === 0, reasons };
}
const sameIds = (a: readonly string[], b: readonly string[]) => a.length === b.length && new Set(a).size === a.length && new Set(b).size === b.length && a.every(id => b.includes(id));
export function candidateFieldIntegrity(rows: readonly CandidateRow[], proof?: CandidateFieldEvidence) {
  const runnerIds = rows.map(r => r.row.features.targetRunnerId);
  const starters = rows.filter(r => ["win", "loss"].includes(settlementOutcomeState(r.row.outcome)));
  const nrs = rows.filter(r => settlementOutcomeState(r.row.outcome) === "NR");
  const verified = !!proof && rows.length > 0 && rows.every(r => r.evidence.sourceFullResult && r.row.features.targetRaceId === proof.raceId)
    && sameIds(runnerIds, proof.runnerIds)
    && sameIds(starters.map(r => r.row.features.targetRunnerId), proof.starterIds)
    && sameIds(nrs.map(r => r.row.features.targetRunnerId), proof.nonRunnerIds)
    && starters.length > 0 && starters.length + nrs.length === rows.length;
  return {
    storedRosterCount: rows.length, genuineNonRunnerCount: nrs.length,
    observedStarterCount: starters.length, verifiedStarterCount: verified ? starters.length : null,
    originalDeclaredCount: null, originalDeclarationReason: "pre_race_declaration_provenance_missing",
    cachedActualCounts: [...new Set(rows.map(r => r.row.features.actualRunnerCount))],
    verified, reason: verified ? null : "independent_complete_starter_field_unverified",
  };
}

/** Always called on the full candidate before any selection filtering. */
export function analyzeCandidateRace(rows: readonly CandidateRow[], feature: CandidateFeature, proof?: CandidateFieldEvidence) {
  const field = candidateFieldIntegrity(rows, proof);
  const starters = rows.filter(r => ["win", "loss"].includes(settlementOutcomeState(r.row.outcome)));
  const rankable = starters.filter(r => candidateFeatureEligibility(r, feature).eligible).slice().sort((a, b) =>
    (b.row.features[feature] ?? -Infinity) - (a.row.features[feature] ?? -Infinity) || a.row.features.targetRunnerId.localeCompare(b.row.features.targetRunnerId));
  const complete = field.verified && rankable.length === starters.length;
  const ranks = new Map<string, CandidateRank>();
  let previous: number | null = null, previousRank = 0;
  rankable.forEach((r, index) => {
    const value = r.row.features[feature]!;
    const rank = value === previous ? previousRank : index + 1; // competition ties: 1,1,3
    ranks.set(r.row.features.targetRunnerId, {
      status: complete ? "verified_whole_field" : "partial_field_diagnostic",
      wholeFieldRank: complete ? rank : null, diagnosticRank: complete ? null : rank,
    });
    previous = value; previousRank = rank;
  });
  const marketComplete = field.verified && starters.every(r => r.evidence.sourceFullResult && settleSelection(r.row.outcome) !== null);
  const overround = marketComplete ? starters.reduce((sum, r) => sum + 1 / Number(r.row.outcome.startingPriceDecimal), 0) : null;
  return {
    field, completeComparisonField: complete,
    market: { valid: marketComplete, overround, reason: marketComplete ? null : "incomplete_or_invalid_starter_market" },
    observations: rows.map(r => {
      const state = settlementOutcomeState(r.row.outcome);
      const settlement = r.evidence.sourceFullResult ? settleSelection(r.row.outcome) : null;
      const eligibility = candidateFeatureEligibility(r, feature);
      return {
        warning: JUMP_CANDIDATE_WARNING, runnerId: r.row.features.targetRunnerId, raceId: r.row.features.targetRaceId,
        date: r.row.features.raceDate, horse: r.row.features.horseName, course: r.row.features.courseName,
        feature, value: eligibility.eligible ? r.row.features[feature] : null, eligibility,
        strictRatingObservation: r.evidence.strictExploratoryUsable,
        originalExclusionEvidence: structuredClone(r.evidence),
        history: { recordedPriorRuns: r.row.features.priorRuns, builderLastThreeDepth: r.evidence.builderLast3Ids.length },
        outcomeState: state, historicalSP: Number.isFinite(Number(r.row.outcome.startingPriceDecimal)) && Number(r.row.outcome.startingPriceDecimal) > 1 ? Number(r.row.outcome.startingPriceDecimal) : null,
        priceUse: "retrospective_settlement_only" as const, settlement,
        settlementExclusions: settlement ? [] : [!r.evidence.sourceFullResult ? "target_full_result_unverified" : `settlement:${state}`, ...(!r.evidence.validSP ? ["invalid_sp"] : [])],
        rank: ranks.get(r.row.features.targetRunnerId) ?? { status: "unavailable", wholeFieldRank: null, diagnosticRank: null } satisfies CandidateRank,
        normalizedSPProbability: overround !== null && settlement && (state === "win" || state === "loss") ? (1 / settlement.settlementOddsDecimal) / overround : null,
      };
    }),
  };
}

export function candidateCoverage(races: ReturnType<typeof analyzeCandidateRace>[], feature: CandidateFeature) {
  const observations = races.flatMap(r => r.observations);
  const reasons: Record<string, number> = {}, depth: Record<string, number> = {};
  const bands = Object.fromEntries(["(1,3]", "(3,6]", "(6,11]", "(11,21]", ">21", "unknown/invalid"].map(b => [b, { records: 0, settled: 0, winners: 0, retainedWinners: 0, excludedWinners: 0, strictWinners: 0 }]));
  for (const o of observations) {
    for (const reason of o.eligibility.reasons) reasons[reason] = (reasons[reason] ?? 0) + 1;
    const key = `${o.history.builderLastThreeDepth}`; depth[key] = (depth[key] ?? 0) + 1;
    const p = o.historicalSP;
    const b = bands[p === null ? "unknown/invalid" : p <= 3 ? "(1,3]" : p <= 6 ? "(3,6]" : p <= 11 ? "(6,11]" : p <= 21 ? "(11,21]" : ">21"];
    b.records++; if (o.settlement) b.settled++;
    if (o.settlement && o.outcomeState === "win") {
      b.winners++; if (o.eligibility.eligible) b.retainedWinners++; else b.excludedWinners++;
      if (o.strictRatingObservation) b.strictWinners++;
    }
  }
  return {
    warning: JUMP_CANDIDATE_WARNING, settlementVersion: CANONICAL_SETTLEMENT_VERSION, feature,
    runners: observations.length, races: races.length,
    eligibleObservations: observations.filter(o => o.eligibility.eligible).length,
    eligibleSettledObservations: observations.filter(o => o.eligibility.eligible && o.settlement).length,
    strictRatingObservations: observations.filter(o => o.strictRatingObservation).length,
    historicalSPSettlementPopulation: observations.filter(o => o.settlement).length,
    exclusionsByReason: reasons, overlappingExclusions: true, builderLastThreeDepth: depth,
    recordedPriorRunDepth: observations.reduce<Record<string, number>>((counts, o) => { const k = String(o.history.recordedPriorRuns); counts[k] = (counts[k] ?? 0) + 1; return counts; }, {}),
    completeComparisonFields: races.filter(r => r.completeComparisonField).length,
    partialComparisonFields: races.filter(r => !r.completeComparisonField && r.observations.some(o => o.rank.status === "partial_field_diagnostic")).length,
    unavailableComparisonFields: races.filter(r => r.observations.every(o => o.rank.status === "unavailable")).length,
    verifiedRankObservations: observations.filter(o => o.rank.status === "verified_whole_field").length,
    validMarketFields: races.filter(r => r.market.valid).length,
    validMarketObservations: observations.filter(o => o.normalizedSPProbability !== null).length,
    verifiedStarterFields: races.filter(r => r.field.verified).length,
    originalDeclaredFields: 0, winnersBySPBand: bands,
  };
}
