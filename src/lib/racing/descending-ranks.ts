/** Existing Best L3 / research competition ranks: finite values only; ties share rank. */
export function descendingRanks<T extends { runnerId: string }>(runners: readonly T[], valueFor: (runner: T) => number | null | undefined) {
  const sorted = runners.map((runner) => ({ runner, value: valueFor(runner) }))
    .filter((entry): entry is { runner: T; value: number } => typeof entry.value === "number" && Number.isFinite(entry.value))
    .sort((a, b) => b.value - a.value || a.runner.runnerId.localeCompare(b.runner.runnerId));
  const ranks = new Map<string, number>();
  let previous: number | null = null;
  let rank = 0;
  sorted.forEach((entry, index) => {
    if (entry.value !== previous) rank = index + 1;
    ranks.set(entry.runner.runnerId, rank);
    previous = entry.value;
  });
  return ranks;
}
