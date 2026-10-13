import type { createDbConnection } from "@/db";
import { loadJumpTissueModel, jumpTissueSubtype } from "./jump-tissue-model";
import { loadJumpTissueCommentsForRaces } from "./jump-tissue-sync";
import { buildChasePair, captureChasePairs, mutateChasePair, updateChasePairs } from "./chase-tissue-challenger-forward";
import { getLocalRacingDate, getRacecardRowsForRaceIds, groupTodaysRacingRows, type TodayMeeting } from "./todays-racing";

export async function syncChasePairMeetings(connection: ReturnType<typeof createDbConnection>, meetings: TodayMeeting[], raceDate: string) {
  const now = new Date();
  if (raceDate !== getLocalRacingDate(now)) throw new Error("Chase paired sync only captures the current local racing date; no backfill.");
  const chases = meetings.flatMap((meeting) => meeting.races.filter((race) => jumpTissueSubtype(race).code === "chase").map((race) => ({ race, course: meeting.courseName })));
  const model = chases.length ? await loadJumpTissueModel() : null;
  const comments = model ? await loadJumpTissueCommentsForRaces(connection.client, chases.map(({ race }) => race)) : new Map();
  return mutateChasePair(async (latest) => {
    const pending = latest.races.filter((race) => race.settledAt === null).map((race) => race.raceId);
    const results = pending.length ? groupTodaysRacingRows(await getRacecardRowsForRaceIds(connection.db, pending)).flatMap((meeting) => meeting.races) : [];
    const capturedAt = new Date();
    let updated = updateChasePairs(latest, new Map(results.map((race) => [race.raceId, race])), capturedAt, true);
    const known = new Set(updated.races.map((race) => race.raceId));
    const additions = model ? chases.filter(({ race }) => !known.has(race.raceId)).flatMap(({ race, course }) => {
      const pair = buildChasePair({ raceDate, course, race, model, commentsByHorse: comments, recordedAt: capturedAt });
      return pair ? [pair] : [];
    }) : [];
    updated = captureChasePairs(updated, additions);
    return updateChasePairs(updated, new Map(chases.map(({ race }) => [race.raceId, race])), capturedAt);
  });
}
