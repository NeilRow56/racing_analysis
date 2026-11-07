import { refreshedSourceAllowed } from "./frozen-capture-selection";
import { contextShadowAfterProduction, pendingContextWeightShadowRaceIds, syncContextWeightShadow } from "./context-weight-shadow-sync";
import type { createDbConnection } from "@/db";
import { loadValueCaptureInputs } from "./tissue-value-sync";
import { loadTissueGenerationContexts } from "./tissue-generation-context";
import { loadTissueGenerationModels, predictTissueGeneration, type TissueGenerationModel } from "./tissue-generation-model";
import { tissueGenerationActive } from "./tissue-generation-config";
import { GENERATION_FEATURES, type TissueGenerationContext } from "./tissue-generation-features";
import { loadTissueGeneration, mutateTissueGeneration, appendTissueGeneration, settleTissueGeneration, type GenerationRace } from "./tissue-generation-forward";
import { valueFamilyForRace } from "./tissue-value-family";
import { buildTissueForwardRace, TISSUE_V3_CONFIG } from "./tissue-forward";
import { buildAwV2Race } from "./aw-tissue-v2";
import { predictJumpTissue } from "./jump-tissue-model";
import { summarizeBookmakerMarket } from "./forward-value";
import { hasCompleteProspectiveField } from "./current-day-sync";
import { getLocalRacingDate, getRacecardRowsForRaceIds, groupTodaysRacingRows, type TodayMeeting } from "./todays-racing";
import type { TissueValueFamily } from "./tissue-value-metrics";

type Inputs = Awaited<ReturnType<typeof loadValueCaptureInputs>>;
export function buildTissueGenerationRaces(input: Inputs & { raceDate: string; capturedAt: Date; historyCutoffAt: string;
  generationModels: Record<TissueValueFamily, TissueGenerationModel>; contexts: ReadonlyMap<string, TissueGenerationContext> }): GenerationRace[] {
  const now = input.capturedAt;
  if (!tissueGenerationActive(now) || getLocalRacingDate(now) !== input.raceDate) return [];
  return input.meetings.flatMap(meeting => meeting.races.flatMap(race => {
    const family = valueFamilyForRace(race);
    if (!family || !race.raceDateTime || now >= race.raceDateTime || getLocalRacingDate(race.raceDateTime) !== input.raceDate ||
      !hasCompleteProspectiveField({ ...race, actualRunnerCount: null }) || race.winningTime ||
      race.runners.some(r => r.finishingPosition !== null || (r.resultStatus !== null && r.resultStatus !== "non_runner"))) return [];
    const active = race.runners.filter(r => r.resultStatus !== "non_runner");
    let rows: Array<{ runnerId: string; modelInputs?: number[] | null }>;
    if (family === "TURF") {
      const book = buildTissueForwardRace({ race, raceDate: input.raceDate, course: meeting.courseName, model: input.models.turf,
        commentsByHorse: input.commentsByHorse, recordedAt: now, config: TISSUE_V3_CONFIG });
      if (!book) return []; rows = book.runners;
    } else if (family === "AW") {
      const book = buildAwV2Race(race, meeting.courseName, input.raceDate, input.models.aw, input.awContext, now);
      if (!book) return []; rows = book.runners;
    } else {
      const book = predictJumpTissue({ ...race, actualRunnerCount: null }, input.commentsByHorse, input.models.jump);
      if (book.runners.some(r => !r.predictionAvailable || r.probability === null)) return [];
      rows = book.runners;
    }
    if (rows.length !== active.length || rows.some(r => !r.modelInputs || r.modelInputs.some(v => !Number.isFinite(v)))) return [];
    const model = input.generationModels[family];
    if (rows.some(r => r.modelInputs!.length !== model.baseModel.names.length)) return [];
    const runners = rows.map(r => ({ runnerId: r.runnerId, modelInputs: r.modelInputs!, context: input.contexts.get(r.runnerId) }));
    const predictions = predictTissueGeneration(model, { family, raceId: race.raceId, capturedAt: now.toISOString(), featureNames: model.baseModel.names, runners });
    const markets = new Map(active.map(r => [r.runnerId, summarizeBookmakerMarket(r.bookmakerQuotes)]));
    const completeMarket = active.every(r => markets.get(r.runnerId)!.decimalPrice !== null);
    return [{ family, raceId: race.raceId, raceDate: input.raceDate, course: meeting.courseName, modelVersion: model.version, modelHash: model.checksum,
      capturedAt: now.toISOString(), scheduledOff: race.raceDateTime.toISOString(), featureCutoffAt: input.historyCutoffAt,
      featureNames: [...model.baseModel.names], adjustmentFeatureNames: [...GENERATION_FEATURES[family]], completeMarket, marketSource: "sporting_life_median_bookmaker_at_capture_v1" as const,
      runners: predictions.map(p => { const runner = active.find(r => r.runnerId === p.runnerId)!; return { ...p,
        horseId: runner.horseId, horseName: runner.horseName, modelInputs: [...rows.find(r => r.runnerId === p.runnerId)!.modelInputs!],
        capturedPrice: completeMarket ? markets.get(p.runnerId)!.decimalPrice : null, quotes: markets.get(p.runnerId)!.quotes, outcome: null,
      }; }),
    }];
  }));
}

export async function syncTissueGeneration(connection: ReturnType<typeof createDbConnection>, meetings: TodayMeeting[], date: string, capture = true, forceRefresh = false) {
  const before = await loadTissueGeneration(), cutoff = new Date();
  const known = new Set(before.races.map(r => r.raceId));
  const eligible = meetings.map(m => ({ ...m, races: m.races.filter(r => (forceRefresh || !known.has(r.raceId)) && refreshedSourceAllowed(r.sourceId) && r.raceDateTime && r.raceDateTime > cutoff && valueFamilyForRace(r) !== null) }));
  let additions: GenerationRace[] = [];
  if (capture && tissueGenerationActive(cutoff) && date === getLocalRacingDate(cutoff) && eligible.some(m => m.races.length)) {
    const [inputs, generationModels] = await Promise.all([loadValueCaptureInputs(connection, eligible, date, cutoff), loadTissueGenerationModels()]);
    const contexts = await loadTissueGenerationContexts(connection, inputs.meetings, cutoff);
    additions = buildTissueGenerationRaces({ ...inputs, contexts, generationModels, raceDate: date, capturedAt: new Date(), historyCutoffAt: cutoff.toISOString() });
  }
  const pending = [...new Set([...before.races.filter(r => r.runners.some(x => x.outcome === null)).map(r => r.raceId), ...await pendingContextWeightShadowRaceIds()])];
  const results = new Map(groupTodaysRacingRows(pending.length ? await getRacecardRowsForRaceIds(connection.db, pending) : []).flatMap(m => m.races.map(r => [r.raceId, r] as const)));
  const production = await mutateTissueGeneration(data => settleTissueGeneration(appendTissueGeneration(data, additions, new Date(), forceRefresh), results));
  // Only books actually accepted by the production writer can be paired. Never backfill from before.races.
  const accepted = production.races.slice(before.races.length).filter(r => additions.some(a => a.raceId === r.raceId && a.capturedAt === r.capturedAt));
  return contextShadowAfterProduction(production, () => syncContextWeightShadow(accepted, results));
}
