import type { createDbConnection } from "@/db";
import type { TodayMeeting } from "./todays-racing";
import type { TissueGenerationContext, CompletionPrior } from "./tissue-generation-features";

/** One batched read, strictly bounded by capture. Never load current career totals. */
export async function loadTissueGenerationContexts(connection: ReturnType<typeof createDbConnection>, meetings: TodayMeeting[], cutoff: Date) {
  const runners = meetings.flatMap(m => m.races.flatMap(r => r.runners)), horses = [...new Set(runners.map(r => r.horseId))];
  if (!horses.length) return new Map<string, TissueGenerationContext>();
  const rows = await connection.client<Array<CompletionPrior & { horseId: string }>>`
    select rr.horse_id as "horseId", r.id as "raceId", r.race_datetime as "raceDateTime",
      rr.finishing_position as "finishingPosition", rr.result_status as "resultStatus"
    from race_runners rr join races r on r.id = rr.race_id
    where rr.horse_id in ${connection.client(horses)} and rr.source = 'sporting_life' and r.source = 'sporting_life'
      and r.race_datetime < ${cutoff.toISOString()}
    order by r.race_datetime desc, rr.id
  `;
  const byHorse = new Map<string, CompletionPrior[]>();
  for (const row of rows) {
    const list = byHorse.get(row.horseId) ?? [];
    list.push({ ...row, raceDateTime: new Date(row.raceDateTime).toISOString() }); byHorse.set(row.horseId, list);
  }
  return new Map(runners.map(r => [r.runnerId, { completionPriors: byHorse.get(r.horseId) ?? [],
    usableJumpSpeedCount: r.metrics?.jumpSpeedReliability?.relevantJumpRuns ?? null }]));
}
