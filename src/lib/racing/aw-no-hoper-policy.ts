import { raceSoftmax } from "../../../scripts/diagnose-independent-tissue-feasibility";
import { descendingRanks } from "./descending-ranks";
import { normalizeCompleteMarket } from "./tissue-value-metrics";

export const AW_NO_HOPER_POLICY = "AW_NO_HOPER_V1" as const;

type PreOffRunner = {
  runnerId: string;
  capturedPrice: number | null;
  frozenScore: number;
  scoreWithoutSameOr: number;
  latestAwPerformance: number | null;
};

/** AW Tissue V3 research only. Each input field must be from the same pre-race book. */
export function evaluateAwNoHoperField(runners: readonly PreOffRunner[]) {
  if (runners.length < 2 || new Set(runners.map(r => r.runnerId)).size !== runners.length ||
      runners.some(r => !Number.isFinite(r.frozenScore) || !Number.isFinite(r.scoreWithoutSameOr))) {
    throw new Error("Invalid AW Tissue scoring field");
  }
  if (!normalizeCompleteMarket(runners.map(r => r.capturedPrice))) return null;

  const order = (scores: number[]) => {
    const probabilities = raceSoftmax(scores);
    return runners.map((runner, i) => ({ runner, probability: probabilities[i] }))
      .sort((a, b) => b.probability - a.probability || a.runner.runnerId.localeCompare(b.runner.runnerId))
      .map(r => r.runner);
  };
  const original = order(runners.map(r => r.frozenScore));
  const remaining = order(runners.map(r => r.scoreWithoutSameOr));
  const performance = descendingRanks(runners, r => r.latestAwPerformance);

  return ([1, 2] as const).map(tissueRank => {
    const runner = original[tissueRank - 1];
    const marketRank = 1 + runners.filter(r => r.capturedPrice! < runner.capturedPrice!).length;
    const rankWithoutSameOr = 1 + remaining.indexOf(runner);
    const latestAwPerformanceRank = performance.get(runner.runnerId) ?? null;
    const flagged = marketRank >= 4 && runner.frozenScore > runner.scoreWithoutSameOr && rankWithoutSameOr > tissueRank;
    const exclude = flagged && (latestAwPerformanceRank === null || latestAwPerformanceRank > 3);
    return { runnerId: runner.runnerId, tissueRank, marketRank, rankWithoutSameOr, latestAwPerformanceRank, flagged, exclude };
  });
}
