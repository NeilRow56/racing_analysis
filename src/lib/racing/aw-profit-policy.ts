type RecentPerformanceRunner = { rank: number; performanceRank: number | null };

export function selectAwRecentPerformance<T extends RecentPerformanceRunner>(runners: readonly T[]) {
  return runners.reduce<T | undefined>((best, runner) =>
    runner.rank <= 3 && runner.performanceRank !== null && runner.performanceRank <= 3 &&
    (!best || runner.rank < best.rank) ? runner : best, undefined);
}

export const AW_PROFIT_V1 = "AW_PROFIT_V1" as const;
export const AW_PROFIT_V3 = "AW_PROFIT_V3" as const;

export function selectAwProfitShadow<T extends RecentPerformanceRunner & { bestL3Speed: number | null }>(runners: readonly T[]) {
  const t1 = runners.find(runner => runner.rank === 1);
  const v1 = selectAwRecentPerformance(runners);
  if (!v1) return { t1, v1, v3: undefined };
  const permitted = v1.bestL3Speed !== null && runners.every(runner => runner.rank >= v1.rank || runner.bestL3Speed === null);
  return { t1, v1, v3: permitted ? v1 : t1 };
}
