/** A capture is identified within its existing ledger by race and capture time. */
export function captureIdentity(race: { raceId: string; capturedAt: string }): string {
  return `${race.raceId}|${race.capturedAt}`;
}

/** Ignore observation clocks and settlements when detecting an unchanged source/model state. */
export function captureState(race: { capturedAt: string; featureCutoffAt: string; runners: Array<{ outcome: unknown }> }): string {
  return JSON.stringify({ ...race, capturedAt: undefined, featureCutoffAt: undefined,
    runners: race.runners.map(row => ({ ...row, outcome: null })) });
}

/** Select whole books, so runners removed by a later declaration cannot leak from an older book. */
export function latestPreOffCaptures<T extends { raceId: string; capturedAt: string; scheduledOff: string }>(races: readonly T[]): T[] {
  const latest = new Map<string, T>();
  for (const race of races) {
    const at = Date.parse(race.capturedAt), off = Date.parse(race.scheduledOff);
    if (!Number.isFinite(at) || !Number.isFinite(off) || at >= off) continue;
    const previous = latest.get(race.raceId);
    if (!previous || at > Date.parse(previous.capturedAt)) latest.set(race.raceId, race);
  }
  return [...latest.values()];
}

/** Manual refresh children may only capture source cards successfully fetched in this run. */
export function refreshedSourceAllowed(sourceId: string | null): boolean {
  const refreshed = process.env.RESEARCH_REFRESH_SOURCE_IDS;
  return refreshed === undefined || (sourceId !== null && refreshed.split(",").includes(sourceId));
}
