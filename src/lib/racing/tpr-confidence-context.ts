import { calculateWeightAdjustedPerformance } from "./weight-performance";

export type UsableTurfHistoryRun = {
  runnerId?: string;
  raceDateTime: Date;
  resultStatus: string | null;
  finishingPosition: number | null;
  weightCarriedLbs?: number | null;
  turfSpeedRating?: { rating: number | null } | null;
};

export type TprConfidenceContext = {
  usableTurfHistoryCount: number;
  historyDepthLabel: "1-run basis" | "2-run basis" | "3+ run basis" | "Insufficient history";
  latestUsableTurfRunDateTime: string | null;
  daysSinceUsableTurfRun: number | null;
  limitedHistory: boolean;
  staleTurfEvidence: boolean;
};

export function getTprConfidenceContext(
  runs: readonly UsableTurfHistoryRun[],
  beforeDateTime: Date,
): TprConfidenceContext {
  const seen = new Set<string>();
  const usable = runs.filter(run => {
    if (run.raceDateTime >= beforeDateTime || !Number.isFinite(run.raceDateTime.getTime()) ||
      run.resultStatus === "non_runner" || (run.resultStatus === null && run.finishingPosition === null)) return false;
    const performance = calculateWeightAdjustedPerformance({
      rawSpeedRating: run.turfSpeedRating?.rating ?? null,
      weightCarriedLb: run.weightCarriedLbs ?? null,
    });
    if (!performance || !Number.isFinite(performance.performanceRating)) return false;
    if (run.runnerId) {
      if (seen.has(run.runnerId)) return false;
      seen.add(run.runnerId);
    }
    return true;
  });
  const count = usable.length;
  const latest = usable.reduce<Date | null>((date, run) => date === null || run.raceDateTime > date ? run.raceDateTime : date, null);
  const days = latest === null ? null : Math.floor((beforeDateTime.getTime() - latest.getTime()) / 86_400_000);
  return {
    usableTurfHistoryCount: count,
    historyDepthLabel: count === 1 ? "1-run basis" : count === 2 ? "2-run basis" : count >= 3 ? "3+ run basis" : "Insufficient history",
    latestUsableTurfRunDateTime: latest?.toISOString() ?? null,
    daysSinceUsableTurfRun: days,
    limitedHistory: count === 1,
    staleTurfEvidence: days !== null && days > 180,
  };
}
