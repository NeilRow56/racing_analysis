import type { createDbConnection } from "@/db";
import { loadJumpTissueModel, jumpTissueSubtype } from "./jump-tissue-model";
import { loadJumpTissueCommentsForRaces } from "./jump-tissue-sync";
import { buildHurdlePair, captureHurdlePairs, mutateHurdlePair, updateHurdlePairs } from "./hurdle-tissue-challenger-forward";
import { getLocalRacingDate, getRacecardRowsForRaceIds, groupTodaysRacingRows, type TodayMeeting } from "./todays-racing";

export async function syncHurdlePairMeetings(connection: ReturnType<typeof createDbConnection>, meetings: TodayMeeting[], raceDate: string) {
  const now = new Date();
  if (raceDate !== getLocalRacingDate(now)) throw new Error("Hurdle paired sync only captures the current local racing date; no backfill.");
  const hurdles = meetings.flatMap((meeting) => meeting.races.filter((race) => jumpTissueSubtype(race).code === "hurdle").map((race) => ({ race, course: meeting.courseName })));
  const model = hurdles.length ? await loadJumpTissueModel() : null;
  const comments = model ? await loadJumpTissueCommentsForRaces(connection.client, hurdles.map(({ race }) => race)) : new Map();
  return mutateHurdlePair(async (latest) => {
    const pending = latest.races.filter((race) => race.settledAt === null).map((race) => race.raceId);
    const results = pending.length ? groupTodaysRacingRows(await getRacecardRowsForRaceIds(connection.db, pending)).flatMap((meeting) => meeting.races) : [];
    const capturedAt = new Date();
    let updated = updateHurdlePairs(latest, new Map(results.map((race) => [race.raceId, race])), capturedAt, true);
    const known = new Set(updated.races.map((race) => race.raceId));
    const additions = model ? hurdles.filter(({ race }) => !known.has(race.raceId)).flatMap(({ race, course }) => {
      const pair = buildHurdlePair({ raceDate, course, race, model, commentsByHorse: comments, recordedAt: capturedAt });
      return pair ? [pair] : [];
    }) : [];
    updated = captureHurdlePairs(updated, additions);
    return updateHurdlePairs(updated, new Map(hurdles.map(({ race }) => [race.raceId, race])), capturedAt);
  });
}
