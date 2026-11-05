import { descendingRanks } from "./descending-ranks";
import { completionStatus } from "./hurdle-recency-forward";
import { isVoidBetResultStatus } from "./backtest";
import type { TissueValueFamily } from "./tissue-value-metrics";

export type CompletionPrior = { raceId: string; raceDateTime: string; finishingPosition: number | null; resultStatus: string | null };
export type TissueGenerationContext = { completionPriors?: CompletionPrior[]; usableJumpSpeedCount?: number | null };
export const GENERATION_FEATURES: Record<TissueValueFamily, string[]> = {
  TURF: ["speed_rank_2_3", "speed_rank_missing", "same_or_speed_gap"],
  AW: ["speed_rank_2_3", "speed_rank_missing", "same_or_speed_gap"],
  HURDLE: ["speed_rank_2_3", "speed_rank_missing", "recent_non_completion", "latest_pulled_up", "completed_last3_fraction", "completion_history_missing"],
  CHASE: ["speed_rank_2_3", "speed_rank_missing", "usable_jump_speed_last3", "usable_jump_speed_missing"],
};
export function frozenNumeric(names: readonly string[], values: readonly number[], name: string): number | null {
  const i = names.indexOf(name), missing = names.indexOf(`${name}_missing`);
  return i < 0 || missing < 0 || values[missing] !== 0 || !Number.isFinite(values[i]) ? null : values[i];
}

/** Only already completed prior races strictly before capture can enter this vector. */
export function generationCompletion(priors: readonly CompletionPrior[] | undefined, raceId: string, capturedAt: string, days: number | null) {
  const history = (priors ?? []).filter(r => r.raceId !== raceId && Date.parse(r.raceDateTime) < Date.parse(capturedAt) &&
    !isVoidBetResultStatus(r.resultStatus) && (r.finishingPosition !== null || r.resultStatus !== null))
    .sort((a, b) => Date.parse(b.raceDateTime) - Date.parse(a.raceDateTime)).slice(0, 3);
  const statuses = history.map(completionStatus), latest = statuses[0];
  return [days !== null && days <= 30 && latest !== undefined && latest !== "completed" ? 1 : 0,
    latest === "pulled_up" ? 1 : 0, history.length ? statuses.filter(s => s === "completed").length / history.length : 0,
    history.length ? 0 : 1];
}

/** Same representation for development and live capture. No market or Value fields accepted. */
export function tissueGenerationFeatures(input: {
  family: TissueValueFamily; raceId: string; capturedAt: string; featureNames: readonly string[];
  runners: readonly { runnerId: string; modelInputs: readonly number[]; context?: TissueGenerationContext }[];
}): Map<string, number[]> {
  const speedName = input.family === "TURF" || input.family === "AW" ? "best_l3_turf_speed" : "best_l3_jump_speed";
  const value = (r: typeof input.runners[number], n: string) => frozenNumeric(input.featureNames, r.modelInputs, n);
  const speedRanks = descendingRanks(input.runners, r => value(r, speedName));
  return new Map(input.runners.map(r => {
    const rank = speedRanks.get(r.runnerId), features = [rank === 2 || rank === 3 ? 1 : 0, rank === undefined ? 1 : 0];
    if (input.family === "TURF" || input.family === "AW") {
      const speed = value(r, speedName), or = value(r, "official_rating");
      const peers = or === null ? [] : input.runners.filter(p => p.runnerId !== r.runnerId && value(p, "official_rating") === or)
        .map(p => value(p, speedName)).filter((v): v is number => v !== null);
      features.push(speed !== null && peers.length ? (speed - peers.reduce((a, b) => a + b, 0) / peers.length) / 10 : 0);
    } else if (input.family === "HURDLE") {
      features.push(...generationCompletion(r.context?.completionPriors, input.raceId, input.capturedAt, value(r, "days_since_run")));
    } else {
      const count = r.context?.usableJumpSpeedCount;
      const known = count != null && Number.isInteger(count) && count >= 0 && count <= 3;
      features.push(known ? count : 0, known ? 0 : 1);
    }
    return [r.runnerId, features];
  }));
}
