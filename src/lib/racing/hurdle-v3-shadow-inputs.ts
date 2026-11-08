import { createHash } from "node:crypto";
import type { createDbConnection } from "@/db";
import { classifyJumpRaceSubtype } from "./jump-speed-rating";
import { getJumpSpeedRatingsAsOfRuns } from "./jump-speed-ratings";
import { canonicalHurdleV3Starter, hurdleV3PriorHistory, type HurdleV3Prior, type HurdleV3Target } from "./hurdle-v3-challenger-features";
import type { TodayMeeting } from "./todays-racing";

export type HurdleParticipantSource = { id: string; at: Date | string; finish: number | null; status: string | null };
export function hurdleV3ParticipantPrior(rows: readonly HurdleParticipantSource[], cutoff: string) {
  const before = rows.filter(r => Date.parse(new Date(r.at).toISOString()) < Date.parse(cutoff));
  if (new Set(before.map(r => r.id)).size !== before.length) throw new Error("Duplicate participant starter");
  const valid = before.filter(r => canonicalHurdleV3Starter({ finishingPosition: r.finish, resultStatus: r.status }));
  const ids = valid.map(r => r.id).sort();
  return { prior: { starts: valid.length, wins: valid.filter(r => r.finish === 1).length,
    latestAt: valid.length ? valid.map(r => new Date(r.at).toISOString()).sort().at(-1)! : null },
    audit: { sourceRows: before.length, excluded: before.length - valid.length,
      nonFinisherStarters: valid.filter(r => r.finish === null).length,
      starterIdsHash: createHash("sha256").update(JSON.stringify(ids)).digest("hex") } };
}
export type HurdleV3ShadowInput = {
  target: HurdleV3Target; history: HurdleV3Prior[];
  participantAudit: { trainer: ReturnType<typeof hurdleV3ParticipantPrior>["audit"]; jockey: ReturnType<typeof hurdleV3ParticipantPrior>["audit"] };
};

/** Read-only, as-of-capture adapter. No career totals and no horse history from other codes. */
export async function loadHurdleV3ShadowInputs(connection: ReturnType<typeof createDbConnection>, meetings: TodayMeeting[], cutoff: Date) {
  const races = meetings.flatMap(m => m.races).filter(r => classifyJumpRaceSubtype(r) === "hurdle" && r.raceDateTime && r.raceDateTime > cutoff);
  const runners = races.flatMap(r => r.runners.filter(p => p.resultStatus !== "non_runner"));
  const result = new Map<string, HurdleV3ShadowInput>();
  if (!runners.length) return result;
  const horses = [...new Set(runners.map(r => r.horseId))], trainers = [...new Set(runners.flatMap(r => r.trainerId ? [r.trainerId] : []))], jockeys = [...new Set(runners.flatMap(r => r.jockeyId ? [r.jockeyId] : []))];
  type History = { id: string; horse: string; race: string; at: Date; raceName: string | null; raceType: string | null; raceTypeCode: string | null; finish: number | null; status: string | null; comment: string | null };
  type Participant = HurdleParticipantSource & { trainer: string | null; jockey: string | null };
  const historyRows = await connection.client<History[]>`
    select rr.id, rr.horse_id as horse, rr.race_id as race, r.race_datetime as at,
      r.race_name as "raceName", r.race_type as "raceType", r.race_type_code as "raceTypeCode",
      rr.finishing_position as finish, rr.result_status as status, rr.runner_comment as comment
    from race_runners rr join races r on r.id=rr.race_id
    where rr.horse_id in ${connection.client(horses)} and rr.source='sporting_life' and r.source='sporting_life'
      and r.race_datetime < ${cutoff.toISOString()}::timestamptz order by r.race_datetime desc, rr.id`;
  const participantRows = trainers.length || jockeys.length ? await connection.client<Participant[]>`
    select rr.id, rr.trainer_id as trainer, rr.jockey_id as jockey, r.race_datetime as at,
      rr.finishing_position as finish, rr.result_status as status
    from race_runners rr join races r on r.id=rr.race_id
    where (rr.trainer_id = any(${trainers}::uuid[]) or rr.jockey_id = any(${jockeys}::uuid[]))
      and rr.source='sporting_life' and r.source='sporting_life' and r.race_datetime < ${cutoff.toISOString()}::timestamptz
    order by r.race_datetime,rr.id` : [];
  const histories = new Map<string, HurdleV3Prior[]>();
  for (const h of historyRows) {
    if (classifyJumpRaceSubtype(h) !== "hurdle" || !canonicalHurdleV3Starter({ finishingPosition: h.finish, resultStatus: h.status })) continue;
    const rows = histories.get(h.horse) ?? [];
    rows.push({ runnerId: h.id, raceId: h.race, family: "HURDLE", at: new Date(h.at).toISOString(),
      finishingPosition: h.finish, resultStatus: h.status, speed: null, comment: h.comment }); histories.set(h.horse, rows);
  }
  const trainerRows = new Map<string, Participant[]>(), jockeyRows = new Map<string, Participant[]>();
  for (const row of participantRows) for (const [id, index] of [[row.trainer, trainerRows], [row.jockey, jockeyRows]] as const) {
    if (id) { const rows = index.get(id) ?? []; rows.push(row); index.set(id, rows); }
  }
  const speedIds = new Set<string>();
  for (const race of races) for (const runner of race.runners.filter(p => p.resultStatus !== "non_runner")) {
    const trainer = hurdleV3ParticipantPrior(trainerRows.get(runner.trainerId ?? "") ?? [], cutoff.toISOString());
    const jockey = hurdleV3ParticipantPrior(jockeyRows.get(runner.jockeyId ?? "") ?? [], cutoff.toISOString());
    const target: HurdleV3Target = { runnerId: runner.runnerId, raceId: race.raceId, cutoff: cutoff.toISOString(), scheduledOff: race.raceDateTime!.toISOString(),
      officialRating: runner.officialRating, age: runner.horseAge, weightLbs: runner.weightCarriedLbs, trainer: trainer.prior, jockey: jockey.prior };
    const history = hurdleV3PriorHistory(target, histories.get(runner.horseId) ?? []);
    history.slice(0, 3).forEach(h => speedIds.add(h.runnerId));
    result.set(runner.runnerId, { target, history, participantAudit: { trainer: trainer.audit, jockey: jockey.audit } });
  }
  // Canonical Hurdle source run IDs only, using the same as-of-prior-run rating API as training.
  const ratings = new Map<string, number | null>(), ids = [...speedIds];
  for (let i = 0; i < ids.length; i += 500) {
    const batch = ids.slice(i, i + 500), values = await getJumpSpeedRatingsAsOfRuns(connection.db, batch, { source: "sporting_life" });
    batch.forEach(id => ratings.set(id, values.get(id)?.rating ?? null));
  }
  for (const input of result.values()) for (const h of input.history) h.speed = ratings.get(h.runnerId) ?? null;
  return result;
}
