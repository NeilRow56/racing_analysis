import { latestPreOffCaptures } from "@/lib/racing/frozen-capture-selection";
import { validGenerationCapture, type GenerationData } from "@/lib/racing/tissue-generation-forward";
import { validValueCapture } from "@/lib/racing/tissue-value-forward";
import type { ValueCohortSnapshot } from "@/lib/racing/tissue-value-readers";
import { valueCompetitionRanks, type TissueValueFamily } from "@/lib/racing/tissue-value-metrics";

export type ActiveResearchCapture = {
  raceId: string; raceDate: string; course: string; family: TissueValueFamily;
  scheduledOff: string; capturedAt: string; modelVersion: string;
  runners: Array<{ runnerId: string; horseName: string; tissueRank: number; probability: number;
    marketPrice: number | null; marketRank: number | null }>;
};

/** Read-only projection of whole frozen books. Value cohorts and archive observations stay untouched. */
export function selectActiveResearchCaptures(
  cohorts: readonly ValueCohortSnapshot[], generation: GenerationData, date: string, now = new Date(),
): ActiveResearchCapture[] {
  const legacy: ActiveResearchCapture[] = cohorts.flatMap(({ config, data }) => data.races
    .filter(r => r.raceDate === date && validValueCapture(r, config))
    .map(r => ({ raceId: r.raceId, raceDate: r.raceDate, course: r.course, family: r.family,
      scheduledOff: r.scheduledOff, capturedAt: r.capturedAt, modelVersion: r.modelVersion,
      runners: r.runners.map(x => ({ runnerId: x.runnerId, horseName: x.horseName, tissueRank: x.tissueRank,
        probability: x.probability, marketPrice: x.marketPrice, marketRank: x.marketRank })) })));
  const current: ActiveResearchCapture[] = generation.races
    .filter(r => r.raceDate === date && validGenerationCapture(r))
    .map(r => {
      // Incomplete-market books deliberately have no frozen prices. Never fill them from live odds or an older book.
      const ranks = r.completeMarket ? valueCompetitionRanks(r.runners.map(x => x.capturedPrice!), false) : null;
      return { raceId: r.raceId, raceDate: r.raceDate, course: r.course, family: r.family,
        scheduledOff: r.scheduledOff, capturedAt: r.capturedAt, modelVersion: r.modelVersion,
        runners: r.runners.map((x, i) => ({ runnerId: x.runnerId, horseName: x.horseName, tissueRank: x.rank,
          probability: x.probability, marketPrice: x.capturedPrice, marketRank: ranks?.[i] ?? null })) };
    });
  return latestPreOffCaptures([...legacy, ...current].filter(r => Date.parse(r.capturedAt) <= now.getTime()))
    .sort((a, b) => a.scheduledOff.localeCompare(b.scheduledOff) || a.raceId.localeCompare(b.raceId));
}
