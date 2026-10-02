import type { createDbConnection } from "@/db";
import { loadAwTissueModel } from "./aw-tissue-model";
import {
  buildAwTissueRace, captureAwTissueRaces, loadAwTissuePriorStarts, mutateAwTissueForward,
  updateAwTissueForward, type AwTissueForwardData,
} from "./aw-tissue-forward";
import { getRacecardRowsForRaceIds, groupTodaysRacingRows, isAllWeatherRaceForDisplay, type TodayMeeting } from "./todays-racing";

export async function syncAwTissueMeetings(connection: ReturnType<typeof createDbConnection>, meetings: TodayMeeting[], raceDate: string): Promise<AwTissueForwardData> {
  const model = await loadAwTissueModel();
  const aw = meetings.flatMap((meeting) => meeting.races.filter(isAllWeatherRaceForDisplay).map((race) => ({ race, course: meeting.courseName })));
  const starts = await loadAwTissuePriorStarts(connection.client, aw.map(({ race }) => race));
  return mutateAwTissueForward(async (latest) => {
    const pending = latest.races.filter((r) => r.recordedPreRace && r.settledAt === null).map((r) => r.raceId);
    const results = pending.length ? groupTodaysRacingRows(await getRacecardRowsForRaceIds(connection.db, pending)).flatMap((m) => m.races) : [];
    const now = new Date();
    let updated = updateAwTissueForward(latest, new Map(results.map((r) => [r.raceId, r])), now);
    const known = new Set(updated.races.map((r) => r.raceId));
    const additions = aw.filter(({ race }) => !known.has(race.raceId)).flatMap(({ race, course }) => {
      const captured = buildAwTissueRace(race, course, raceDate, starts, model, now);
      return captured ? [captured] : [];
    });
    updated = captureAwTissueRaces(updated, additions);
    return updateAwTissueForward(updated, new Map(aw.map(({ race }) => [race.raceId, race])), now);
  });
}
