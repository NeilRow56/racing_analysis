import { buildTissueForwardRace, TISSUE_V3_CONFIG, type FrozenTissueModel } from "./tissue-forward";
import type { TodayMeeting } from "./todays-racing";
import type { HistoricalComment } from "../../../scripts/diagnose-independent-tissue-feasibility";
import { appendValueForward, buildValueRace, emptyValueForward, loadValueForward, mutateValueForward, settleValueForward, type TissueValueData, type TissueValueRace, type TissueValueRunner } from "./tissue-value-forward";
import { TURF_VALUE_CONFIG } from "./tissue-value-config";
export { TURF_VALUE_VERSION, TURF_VALUE_EPOCH, TURF_VALUE_PATH, VALUE_FEATURE_SCHEMA, VALUE_MARKET_SOURCE, VALUE_FEATURE_NAMES } from "./turf-value-definition";
export type TurfValueData = TissueValueData;
export type TurfValueRace = TissueValueRace;
export type TurfValueRunner = TissueValueRunner;
export const emptyTurfValue = () => emptyValueForward(TURF_VALUE_CONFIG);
export const loadTurfValue = (path?: string) => loadValueForward(TURF_VALUE_CONFIG, path);
export const appendTurfValue = (data: TurfValueData, races: TurfValueRace[]) => appendValueForward(data, races, TURF_VALUE_CONFIG);
export const settleTurfValue = settleValueForward;
export const mutateTurfValue = (mutate: (data: TurfValueData) => TurfValueData | Promise<TurfValueData>, path?: string) => mutateValueForward(TURF_VALUE_CONFIG, mutate, path);

/** Compatibility API: the original Turf cohort, epoch and stored shape remain unchanged. */
export function buildTurfValueRaces(input: {
  meetings: TodayMeeting[]; raceDate: string; capturedAt: Date; model: FrozenTissueModel; commentsByHorse: Map<string, HistoricalComment[]>;
}): TurfValueRace[] {
  return input.meetings.flatMap(meeting => meeting.races.flatMap(race => {
    const book = buildTissueForwardRace({ race, course: meeting.courseName, raceDate: input.raceDate, model: input.model,
      commentsByHorse: input.commentsByHorse, recordedAt: input.capturedAt, config: TISSUE_V3_CONFIG });
    if (!book?.featureCutoffAt) return [];
    const value = buildValueRace({ config: TURF_VALUE_CONFIG, race, course: meeting.courseName, raceDate: input.raceDate, capturedAt: input.capturedAt,
      book: { modelVersion: book.tissueModelVersion, modelChecksum: book.tissueModelChecksum, scorerVersion: book.liveSemanticsVersion!,
        featureSchemaVersion: TURF_VALUE_CONFIG.featureSchemaVersion, featureNames: input.model.model.names, featureCutoffAt: book.featureCutoffAt,
        runners: book.runners.map(r => ({ runnerId: r.runnerId, probability: r.probability, tissueRank: r.tissueRank, modelInputs: r.modelInputs })) } });
    return value ? [value] : [];
  }));
}
