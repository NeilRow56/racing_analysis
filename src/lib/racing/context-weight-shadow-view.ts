import { latestContextWeightShadows, type ContextShadowData } from "./context-weight-shadow-forward";
import type { ContextShadowFamily } from "./context-weight-shadow-config";
import { valueFamilyForRace } from "./tissue-value-family";
import type { TodayMeeting } from "./todays-racing";

export type ContextShadowView = { family: ContextShadowFamily; candidateVersion: string; capturedAt: string;
  productionProbability: number; shadowProbability: number; productionRank: number; shadowRank: number };
export type ContextShadowViews = ReadonlyMap<string, ContextShadowView>;
/** Display only. Never attach shadow values to production/selection objects or sort runners. */
export function contextWeightShadowViews(meetings: TodayMeeting[], data: ContextShadowData): ContextShadowViews {
  const views = new Map<string, ContextShadowView>();
  for (const book of latestContextWeightShadows(data)) {
    const race = meetings.flatMap(m => m.races).find(r => r.raceId === book.raceId);
    if (!race || valueFamilyForRace(race) !== book.family) continue;
    for (const runner of race.runners) {
      const p = book.production.runners.find(r => r.runnerId === runner.runnerId && r.horseId === runner.horseId);
      const s = book.runners.find(r => r.runnerId === runner.runnerId), active = runner.activeTissue;
      if (!p || !s || !active || runner.resultStatus === "non_runner" || active.family !== book.family ||
        active.modelVersion !== book.production.modelVersion || active.capturedAt !== book.capturedAt || active.rank !== p.rank || active.probability !== p.probability) continue;
      views.set(`${book.raceId}|${runner.runnerId}`, { family: book.family, candidateVersion: book.candidateVersion, capturedAt: book.frozenAt,
        productionProbability: p.probability, shadowProbability: s.probability, productionRank: p.rank, shadowRank: s.rank });
    }
  }
  return views;
}
