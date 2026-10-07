import type { createDbConnection } from "@/db";
import { loadJumpTissueModel } from "./jump-tissue-model";
import {
  buildJumpTissueRace,
  captureJumpTissueRaces,
  mutateJumpTissueForward,
  updateJumpTissueForward,
  type JumpTissueForwardData,
} from "./jump-tissue-forward";
import { getRacecardRowsForRaceIds, groupTodaysRacingRows, isJumpRaceForDisplay, type TodayMeeting, type TodayRace } from "./todays-racing";
import type { HistoricalComment } from "../../../scripts/diagnose-independent-tissue-feasibility";

export async function syncJumpTissueMeetings(connection: ReturnType<typeof createDbConnection>, meetings: TodayMeeting[], raceDate: string): Promise<JumpTissueForwardData> {
  const jumps = meetings.flatMap((meeting) => meeting.races.filter(isJumpRaceForDisplay).map((race) => ({ race, course: meeting.courseName })));
  const model = jumps.length ? await loadJumpTissueModel().catch((error) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }) : null;
  const commentsByHorse = model === null ? new Map() : await loadJumpTissueCommentsForRaces(connection.client, jumps.map(({ race }) => race));
  return mutateJumpTissueForward(async (latest) => {
    const pending = latest.races.filter((race) => race.recordedPreRace && race.settledAt === null).map((race) => race.raceId);
    const results = pending.length ? groupTodaysRacingRows(await getRacecardRowsForRaceIds(connection.db, pending)).flatMap((meeting) => meeting.races) : [];
    const now = new Date();
    let updated = updateJumpTissueForward(latest, new Map(results.map((race) => [race.raceId, race])), now);
    const known = new Set(updated.races.map((race) => race.raceId));
    const additions = model === null ? [] : jumps.filter(({ race }) => !known.has(race.raceId)).flatMap(({ race, course }) => {
      const captured = buildJumpTissueRace({ raceDate, course, race, commentsByHorse, model, recordedAt: now });
      return captured ? [captured] : [];
    });
    updated = captureJumpTissueRaces(updated, additions);
    return updateJumpTissueForward(updated, new Map(jumps.map(({ race }) => [race.raceId, race])), now);
  });
}

export async function loadJumpTissueCommentsForRaces(client: ReturnType<typeof createDbConnection>["client"], races: TodayRace[]): Promise<Map<string, HistoricalComment[]>> {
  const targets = races.flatMap((race) => race.raceDateTime ? race.runners.map((runner) => ({ horse_id: runner.horseId, cutoff: race.raceDateTime!.toISOString() })) : []);
  if (!targets.length) return new Map();
  const rows = await client<Array<{ horseId: string; raceId: string; raceDate: string; raceDateTime: Date; comment: string }>>`
    with targets as (
      select horse_id, min(cutoff) as cutoff
      from jsonb_to_recordset(${JSON.stringify(targets)}::jsonb) as target(horse_id uuid, cutoff timestamptz)
      group by horse_id
    )
    select rr.horse_id as "horseId", r.id as "raceId", r.race_date::text as "raceDate",
           r.race_datetime as "raceDateTime", rr.runner_comment as comment
    from targets
    join race_runners rr on rr.horse_id = targets.horse_id
    join races r on r.id = rr.race_id and r.race_datetime < targets.cutoff
    where r.source = 'sporting_life' and rr.runner_comment is not null
      and btrim(rr.runner_comment) <> '' and coalesce(rr.result_status, '') <> 'non_runner'
    order by rr.horse_id, r.race_datetime
  `;
  const grouped = new Map<string, HistoricalComment[]>();
  for (const row of rows) grouped.set(row.horseId, [...(grouped.get(row.horseId) ?? []), { ...row, raceDateTime: new Date(row.raceDateTime) }]);
  return grouped;
}
