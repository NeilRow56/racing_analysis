import { summarizeValueRunners, type ValueSummaryRunner } from "./tissue-value-metrics";

export const VALUE_RANK_VERSION = "VALUE_RANK_V2" as const;
export const VALUE_RANK_EPOCH = "2026-11-05T06:37:02.000Z" as const;
export const VALUE_RANK_REJECTION_REASONS = ["PRIOR_RUNS_0_4", "PRIOR_RUNS_10_PLUS", "PRIOR_RUNS_MISSING"] as const;
export type ValueRankRejection = typeof VALUE_RANK_REJECTION_REASONS[number];
export const VALUE_RANK_REJECTION_LABELS: Record<ValueRankRejection, string> = {
  PRIOR_RUNS_0_4: "0–4 prior runs",
  PRIOR_RUNS_10_PLUS: "10+ prior runs",
  PRIOR_RUNS_MISSING: "Missing prior runs",
};
export type ValueRankDecision = {
  runnerId: string;
  priorCareerRuns: number | null;
  retained: boolean;
  rejectionReason: ValueRankRejection | null;
};
export type ValueRankPolicy = {
  version: typeof VALUE_RANK_VERSION;
  epoch: typeof VALUE_RANK_EPOCH;
  legacyRankOne: ValueRankDecision[];
};

type CaptureBook = {
  family: string; capturedAt: string; featureNames: readonly string[];
  runners: readonly { runnerId: string; valueRank: number; marketPrice: number; modelInputs: readonly number[] }[];
};

/** Read only the capture-bounded feature, never a later career total.
 * Jump's inherited slot name is populated by metrics.priorRuns (all-code history).
 * Missing/invalid counts fail the gate; zero remains a genuine zero.
 */
export function frozenPriorCareerRuns(family: string, names: readonly string[], inputs: readonly number[]): number | null {
  const name = family === "HURDLE" || family === "CHASE" ? "log_prior_jump_starts" : "log_prior_runs";
  const index = names.indexOf(name), missing = names.indexOf(`${name}_missing`);
  if (index < 0 || missing < 0 || inputs[missing] !== 0 || !Number.isFinite(inputs[index])) return null;
  const value = Math.expm1(inputs[index]), count = Math.round(value);
  return Number.isSafeInteger(count) && count >= 0 && Math.abs(value - count) < 1e-7 ? count : null;
}

export function valueRankOneDecision(runnerId: string, capturedPrice: number, priorCareerRuns: number | null): ValueRankDecision {
  const count = priorCareerRuns !== null && Number.isSafeInteger(priorCareerRuns) && priorCareerRuns >= 0 ? priorCareerRuns : null;
  const rejectionReason = capturedPrice >= 21 && capturedPrice < 51
    ? count === null ? "PRIOR_RUNS_MISSING" : count < 5 ? "PRIOR_RUNS_0_4" : count > 9 ? "PRIOR_RUNS_10_PLUS" : null
    : null;
  return { runnerId, priorCareerRuns: count, retained: rejectionReason === null, rejectionReason };
}

/** Capture once after the epoch, for original rank-1 runners only. Never promote rank 2.
 * Tied original leaders keep the existing competition-rank policy, with a gate per leader.
 */
export function buildValueRankPolicy(book: CaptureBook): ValueRankPolicy | undefined {
  if (book.capturedAt < VALUE_RANK_EPOCH) return undefined;
  return { version: VALUE_RANK_VERSION, epoch: VALUE_RANK_EPOCH,
    legacyRankOne: book.runners.filter(r => r.valueRank === 1).map(r =>
      valueRankOneDecision(r.runnerId, r.marketPrice, frozenPriorCareerRuns(book.family, book.featureNames, r.modelInputs))) };
}

/** Historical observations retain V1 semantics; V2 observations carry an explicit flag. */
export function isActiveValueOne(row?: { valueRank?: number | null; activeValue1?: boolean } | null): boolean {
  return row?.valueRank === 1 && row.activeValue1 !== false;
}

type SummaryBook = {
  capturedAt: string;
  valueRankPolicy?: ValueRankPolicy;
  runners: Array<ValueSummaryRunner & { runnerId: string; valueRank: number; marketPrice: number }>;
};

/** Shadow outcomes reference the original frozen runner's canonical settlement, never a second settlement. */
export function summarizeValueRankV2(races: readonly SummaryBook[]) {
  const prospective = races.filter(r => r.capturedAt >= VALUE_RANK_EPOCH && r.valueRankPolicy?.version === VALUE_RANK_VERSION);
  const decisions = prospective.flatMap(race => race.valueRankPolicy!.legacyRankOne.map(decision => {
    const runner = race.runners.find(r => r.runnerId === decision.runnerId && r.valueRank === 1);
    if (!runner) throw new Error("Missing legacy Value 1 observation");
    return { decision, runner };
  }));
  const retained = decisions.filter(r => r.decision.retained), rejected = decisions.filter(r => !r.decision.retained);
  const racesWithValue1 = prospective.filter(r => r.valueRankPolicy!.legacyRankOne.some(d => d.retained)).length;
  const target = decisions.filter(r => r.runner.marketPrice >= 21 && r.runner.marketPrice < 51);
  return {
    version: VALUE_RANK_VERSION, epoch: VALUE_RANK_EPOCH,
    racesEvaluated: prospective.length, racesWithValue1, racesWithoutValue1: prospective.length - racesWithValue1,
    active: summarizeValueRunners(retained.map(r => r.runner)),
    legacyShadow: summarizeValueRunners(decisions.map(r => r.runner)),
    rejected: summarizeValueRunners(rejected.map(r => r.runner)),
    rejectionReasons: VALUE_RANK_REJECTION_REASONS.map(reason => ({ reason, label: VALUE_RANK_REJECTION_LABELS[reason],
      ...summarizeValueRunners(rejected.filter(r => r.decision.rejectionReason === reason).map(r => r.runner)) })),
    targetBand: [
      { group: "V2 RETAINED: 5–9 prior runs", ...summarizeValueRunners(target.filter(r => r.decision.retained).map(r => r.runner)) },
      ...VALUE_RANK_REJECTION_REASONS.map(reason => ({ group: `V1 REJECTED: ${VALUE_RANK_REJECTION_LABELS[reason]}`,
        ...summarizeValueRunners(target.filter(r => r.decision.rejectionReason === reason).map(r => r.runner)) })),
    ],
    historicalV1: summarizeValueRunners(races.filter(r => r.capturedAt < VALUE_RANK_EPOCH).flatMap(r => r.runners.filter(r => r.valueRank === 1))),
  };
}
