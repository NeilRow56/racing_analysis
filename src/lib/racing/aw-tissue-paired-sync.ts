import type { createDbConnection } from "@/db";
import { loadAwTissueModel } from "./aw-tissue-model";
import { loadAwTissuePriorStarts } from "./aw-tissue-forward";
import {
  buildAwTissuePairedRace,
  captureAwTissuePairedRaces,
  mutateAwTissuePairedForward,
  updateAwTissuePairedForward,
  type AwTissuePairedForwardData,
} from "./aw-tissue-paired-forward";
import { loadFrozenTissueModel, TISSUE_V2_CONFIG } from "./tissue-forward";
import { getRacecardRowsForRaceIds, groupTodaysRacingRows, isAllWeatherRaceForDisplay, type TodayMeeting } from "./todays-racing";
import { loadHistoricalComments } from "../../../scripts/diagnose-independent-tissue-feasibility";

export async function syncAwTissuePairedMeetings(connection: ReturnType<typeof createDbConnection>, meetings: TodayMeeting[], raceDate: string): Promise<AwTissuePairedForwardData> {
  const aw = meetings.flatMap((meeting) => meeting.races.filter(isAllWeatherRaceForDisplay).map((race) => ({ race, course: meeting.courseName })));
  const [awModel, turfModel, commentsByHorse, starts] = aw.length
    ? await Promise.all([
      loadAwTissueModel(),
      loadFrozenTissueModel(TISSUE_V2_CONFIG.modelPath, TISSUE_V2_CONFIG.modelVersion),
      loadHistoricalComments(connection.client),
      loadAwTissuePriorStarts(connection.client, aw.map(({ race }) => race)),
    ])
    : [null, null, new Map(), new Map()] as const;
  return mutateAwTissuePairedForward(async (latest) => {
    const pending = latest.races.filter((race) => race.settledAt === null).map((race) => race.raceId);
    const results = pending.length ? groupTodaysRacingRows(await getRacecardRowsForRaceIds(connection.db, pending)).flatMap((meeting) => meeting.races) : [];
    const now = new Date();
    let updated = updateAwTissuePairedForward(latest, new Map(results.map((race) => [race.raceId, race])), now);
    const known = new Set(updated.races.map((race) => race.raceId));
    const additions = awModel && turfModel ? aw.filter(({ race }) => !known.has(race.raceId)).flatMap(({ race, course }) => {
      const captured = buildAwTissuePairedRace({ raceDate, course, race, awModel, turfModel, priorAwStarts: starts, commentsByHorse, recordedAt: now });
      return captured ? [captured] : [];
    }) : [];
    updated = captureAwTissuePairedRaces(updated, additions);
    return updateAwTissuePairedForward(updated, new Map(aw.map(({ race }) => [race.raceId, race])), now);
  });
}
