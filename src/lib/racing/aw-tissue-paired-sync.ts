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
import { getRacecardRowsForRaceIds, groupTodaysRacingRows, isAllWeatherRaceForDisplay, type TodayMeeting } from "./todays-racing";

export async function syncAwTissuePairedMeetings(connection: ReturnType<typeof createDbConnection>, meetings: TodayMeeting[], raceDate: string): Promise<AwTissuePairedForwardData> {
  const aw = meetings.flatMap((meeting) => meeting.races.filter(isAllWeatherRaceForDisplay).map((race) => ({ race, course: meeting.courseName })));
  const [awModel, starts] = aw.length
    ? await Promise.all([
      loadAwTissueModel(),
      loadAwTissuePriorStarts(connection.client, aw.map(({ race }) => race)),
    ])
    : [null, new Map()] as const;
  return mutateAwTissuePairedForward(async (latest) => {
    const pending = latest.races.filter((race) => race.settledAt === null).map((race) => race.raceId);
    const results = pending.length ? groupTodaysRacingRows(await getRacecardRowsForRaceIds(connection.db, pending)).flatMap((meeting) => meeting.races) : [];
    const now = new Date();
    let updated = updateAwTissuePairedForward(latest, new Map(results.map((race) => [race.raceId, race])), now);
    const known = new Set(updated.races.map((race) => race.raceId));
    const additions = awModel ? aw.filter(({ race }) => !known.has(race.raceId)).flatMap(({ race, course }) => {
      const captured = buildAwTissuePairedRace({ raceDate, course, race, awModel, priorAwStarts: starts, recordedAt: now });
      return captured ? [captured] : [];
    }) : [];
    updated = captureAwTissuePairedRaces(updated, additions);
    return updateAwTissuePairedForward(updated, new Map(aw.map(({ race }) => [race.raceId, race])), now);
  });
}
