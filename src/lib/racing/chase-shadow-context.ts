import type { createDbConnection } from "@/db";
import { classifyJumpRaceSubtype } from "./jump-speed-rating";
import { isVoidBetResultStatus } from "./backtest";
import type { ChaseContext } from "./chase-shadow-forward";
import type { TodayRace } from "./todays-racing";

type PriorRun = {
  horseId: string; raceDateTime: Date; raceName: string | null; raceType: string | null; raceTypeCode: string | null;
  finishingPosition: number | null; resultStatus: string | null;
};
export const chaseExperienceGroup = (starts: number | null) => starts === null ? "unavailable" : starts === 0 ? "0" : starts <= 2 ? "1–2" : "3+";
export function classifyChaseContext(history: PriorRun[], cutoff: Date): ChaseContext {
  const prior = history.filter(r => new Date(r.raceDateTime) < cutoff && !isVoidBetResultStatus(r.resultStatus) && (r.finishingPosition !== null || r.resultStatus !== null))
    .sort((a, b) => new Date(b.raceDateTime).getTime() - new Date(a.raceDateTime).getTime());
  const latest = prior[0];
  const nonCompletion = new Set(["pulled_up", "fell", "unseated", "unseated_rider", "brought_down", "refused", "ran_out", "slipped_up"]);
  return { priorChaseStarts: prior.filter(r => classifyJumpRaceSubtype(r) === "chase").length,
    latestCompletion: !latest ? "unavailable" : latest.finishingPosition !== null ? "completed" : nonCompletion.has(latest.resultStatus?.trim().toLowerCase() ?? "") ? "non_completion" : "unavailable" };
}
/** Research annotations only. Results read strictly before capture, never reconstructed during settlement. */
export async function loadChaseContexts(client: ReturnType<typeof createDbConnection>["client"], race: TodayRace, capturedAt: Date) {
  const ids = [...new Set(race.runners.map(r => r.horseId))];
  if (!ids.length) return new Map<string, ChaseContext>();
  const rows = await client<PriorRun[]>`
    select rr.horse_id as "horseId", r.race_datetime as "raceDateTime", r.race_name as "raceName",
      r.race_type as "raceType", r.race_type_code as "raceTypeCode", rr.finishing_position as "finishingPosition", rr.result_status as "resultStatus"
    from race_runners rr join races r on r.id = rr.race_id
    where rr.horse_id in ${client(ids)} and rr.source = 'sporting_life' and r.source = 'sporting_life'
      and r.race_datetime < ${capturedAt.toISOString()}
    order by r.race_datetime desc, rr.id
  `;
  return new Map(ids.map(id => [id, classifyChaseContext(rows.filter(r => r.horseId === id), capturedAt)]));
}
