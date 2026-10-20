import { buildTurfValueRaces } from "./turf-value-forward";
import { buildAwV2Race, type AwV2Context, type AwV2Model } from "./aw-tissue-v2";
import { predictJumpTissue, type JumpTissueModel } from "./jump-tissue-model";
import { buildValueRace, type TissueValueRace } from "./tissue-value-forward";
import { AW_VALUE_CONFIG, CHASE_VALUE_CONFIG, HURDLE_VALUE_CONFIG } from "./tissue-value-config";
import { classifyJumpRaceSubtype } from "./jump-speed-rating";
import { isAllWeatherRaceForDisplay, type TodayMeeting } from "./todays-racing";
import type { FrozenTissueModel } from "./tissue-forward";
import type { HistoricalComment } from "../../../scripts/diagnose-independent-tissue-feasibility";

export type ValueCaptureModels = { turf: FrozenTissueModel; aw: AwV2Model; jump: JumpTissueModel };
export function buildAllFamilyValueRaces(input: {
  meetings: TodayMeeting[]; raceDate: string; capturedAt: Date; historyCutoffAt: string; models: ValueCaptureModels;
  commentsByHorse: Map<string, HistoricalComment[]>; awContext: AwV2Context;
}): TissueValueRace[] {
  const turf = buildTurfValueRaces({ ...input, model: input.models.turf });
  const comments = new Map([...input.commentsByHorse].map(([horse, rows]) => [horse, rows.filter(r => r.raceDateTime < new Date(input.historyCutoffAt))]));
  const others = input.meetings.flatMap(meeting => meeting.races.flatMap(race => {
    if (isAllWeatherRaceForDisplay(race)) {
      const book = buildAwV2Race(race, meeting.courseName, input.raceDate, input.models.aw, input.awContext, input.capturedAt);
      if (!book) return [];
      const value = buildValueRace({ config: AW_VALUE_CONFIG, race, course: meeting.courseName, raceDate: input.raceDate, capturedAt: input.capturedAt,
        book: { modelVersion: book.modelVersion, modelChecksum: book.modelHash, scorerVersion: book.liveSemanticsVersion!, featureSchemaVersion: book.featureSchemaVersion,
          featureNames: input.models.aw.model.names, featureCutoffAt: book.featureCutoffAt!,
          runners: book.runners.map(r => ({ runnerId: r.runnerId, probability: r.predictionAvailable ? r.probability : null, tissueRank: r.rank, modelInputs: r.modelInputs })) } });
      return value ? [value] : [];
    }
    const subtype = classifyJumpRaceSubtype(race);
    if (subtype !== "hurdle" && subtype !== "chase") return [];
    const config = subtype === "hurdle" ? HURDLE_VALUE_CONFIG : CHASE_VALUE_CONFIG;
    // Genuine existing Jump scorer, with a pre-race declaration field and capture-bounded loaded history/comments.
    const book = predictJumpTissue({ ...race, actualRunnerCount: null }, comments, input.models.jump);
    const value = buildValueRace({ config, race, course: meeting.courseName, raceDate: input.raceDate, capturedAt: input.capturedAt,
      book: { modelVersion: input.models.jump.version, modelChecksum: input.models.jump.checksum, scorerVersion: config.scorerVersion,
        featureSchemaVersion: input.models.jump.featureSchemaVersion, featureNames: input.models.jump.model.names, featureCutoffAt: input.historyCutoffAt,
        runners: book.runners.map(r => ({ runnerId: r.runnerId, probability: r.predictionAvailable ? r.probability : null, tissueRank: r.rank, modelInputs: r.modelInputs })) } });
    return value ? [value] : [];
  }));
  return [...turf, ...others];
}
