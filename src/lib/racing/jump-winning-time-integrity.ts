import { median } from "./speed-research";

export const JUMP_WINNING_TIME_GUARD_VERSION = "jump_winning_time_guard_v2_missing_minute";
export const JUMP_WINNING_TIME_GUARD_MINIMUM_PEERS = 5;

export const MISSING_MINUTE_POLICY = {
  minimumPeers: 2,
  minimumFastFraction: 0.12,
  minimumDeficitSeconds: 45,
  maximumDeficitSeconds: 85,
  maximumCandidateResidualSeconds: 25,
  maximumCandidateRobustDeviation: 1.5,
  minimumImprovementSeconds: 40,
  minimumImprovementFraction: 0.65,
} as const;

/** Diagnostic hypothesis only: candidatePlus60 is never an authoritative time.
 * Exact course/distance/subtype peers, excluding the target, are required.
 * Sparsity alone never withholds; even this targeted rule needs two peers.
 */
export function reviewJumpMissingMinute(actualSeconds: number, peerSeconds: number[]) {
  const stored = reviewJumpWinningTime(actualSeconds, peerSeconds);
  const candidatePlus60 = Number.isFinite(actualSeconds) && actualSeconds > 0 ? actualSeconds + 60 : null;
  const candidate = reviewJumpWinningTime(candidatePlus60 ?? NaN, peerSeconds);
  const deficitSeconds = stored.standardSeconds === null ? null : stored.standardSeconds - actualSeconds;
  const candidateResidualSeconds = deficitSeconds === null ? null : Math.abs(deficitSeconds - 60);
  const improvementSeconds = deficitSeconds === null || candidateResidualSeconds === null ? null : deficitSeconds - candidateResidualSeconds;
  const p = MISSING_MINUTE_POLICY;
  const flagged = candidatePlus60 !== null && stored.sampleSize >= p.minimumPeers &&
    stored.deviationFraction !== null && stored.deviationFraction <= -p.minimumFastFraction &&
    deficitSeconds !== null && deficitSeconds >= p.minimumDeficitSeconds && deficitSeconds <= p.maximumDeficitSeconds &&
    candidateResidualSeconds !== null && candidateResidualSeconds <= p.maximumCandidateResidualSeconds &&
    candidate.robustDeviation !== null && Math.abs(candidate.robustDeviation) <= p.maximumCandidateRobustDeviation &&
    improvementSeconds !== null && improvementSeconds >= p.minimumImprovementSeconds &&
    improvementSeconds / deficitSeconds >= p.minimumImprovementFraction;
  return { classification: flagged ? "LIKELY_MISSING_MINUTE" as const : "NO_MISSING_MINUTE_SIGNAL" as const,
    candidatePlus60, standardSeconds: stored.standardSeconds, sampleSize: stored.sampleSize,
    deficitSeconds, candidateResidualSeconds, candidateRobustDeviation: candidate.robustDeviation, improvementSeconds };
}

/** Independent generic and targeted guards; no time correction or rating clipping. */
export function assessJumpWinningTime(actualSeconds: number, peerSeconds: number[]) {
  const review = reviewJumpWinningTime(actualSeconds, peerSeconds);
  const genericShouldWithhold = review.sampleSize >= JUMP_WINNING_TIME_GUARD_MINIMUM_PEERS && review.reason.startsWith("extreme_time");
  const missingMinute = reviewJumpMissingMinute(actualSeconds, peerSeconds);
  const likelyMissingMinute = missingMinute.classification === "LIKELY_MISSING_MINUTE";
  return { ...review, status: likelyMissingMinute ? "REVIEW" as const : review.status,
    reason: likelyMissingMinute ? "LIKELY_MISSING_MINUTE" : review.reason,
    genericReason: review.reason, genericShouldWithhold, missingMinute, guardVersion: JUMP_WINNING_TIME_GUARD_VERSION,
    shouldWithhold: genericShouldWithhold || likelyMissingMinute };
}

/** Review diagnostic only: never clips ratings or changes frozen observations.
 * Peers must exclude the target and match course, distance and jump subtype.
 * Wide going variation increases MAD and therefore makes the rule conservative.
 */
export function reviewJumpWinningTime(actualSeconds: number, peerSeconds: number[]) {
  const peers = peerSeconds.filter((v) => Number.isFinite(v) && v > 0);
  const standardSeconds = median(peers);
  if (!Number.isFinite(actualSeconds) || actualSeconds <= 0 || standardSeconds === null) {
    return { status: "REVIEW" as const, reason: "invalid_or_missing_time", standardSeconds, sampleSize: peers.length, deviationFraction: null, robustDeviation: null };
  }
  const deviationFraction = (actualSeconds - standardSeconds) / standardSeconds;
  const mad = median(peers.map((v) => Math.abs(v - standardSeconds))) ?? 0;
  // 2% floor prevents near-identical small samples from generating huge scores.
  const robustDeviation = (actualSeconds - standardSeconds) / Math.max(1.4826 * mad, standardSeconds * 0.02);
  const sparse = peers.length < 10;
  const extreme = deviationFraction < -0.15 && robustDeviation < -4 || deviationFraction > 0.35 && robustDeviation > 6;
  return { status: extreme || sparse ? "REVIEW" as const : "PASS" as const,
    reason: extreme ? sparse ? "extreme_time_sparse_standard" : "extreme_time_against_standard" : sparse ? "sparse_standard" : "within_conservative_bounds",
    standardSeconds, sampleSize: peers.length, deviationFraction, robustDeviation };
}

export const NEWCASTLE_WINNING_TIME_CORRECTION = {
  source: "sporting_life", sourceId: "904023", raceDate: "2026-02-21",
  original: "4m 13.53s", corrected: "5m 14.41s",
  reason: "Sporting Life published anomalous 4m13.53s; Racing Post independently records 5m14.41s and comparable Newcastle 2m4f chase times support the latter.",
} as const;

/** Compare-and-set precondition for the one explicitly authorised repair. */
export function validateNewcastleCorrection(race: { source: string | null; source_id: string | null; race_date: string; winning_time: string | null }) {
  const c = NEWCASTLE_WINNING_TIME_CORRECTION;
  if (race.source !== c.source || race.source_id !== c.sourceId || race.race_date !== c.raceDate || race.winning_time !== c.original) {
    throw new Error("Newcastle correction precondition failed; refusing to change race");
  }
  return c.corrected;
}
