import type { createDbConnection } from "@/db";
import { getTargetRunnerMetricsForDate } from "./horse-metrics";
import { getTrainerPriorMetricsForTargets, getJockeyPriorMetricsForTargets } from "./trainer-quality";
import { getAwSpeedRatingsAsOfRuns } from "./aw-speed-ratings";
import { isSupportedAllWeatherRace } from "./aw-speed-rating";
import { isVoidBetResultStatus } from "./backtest";
import { buildAwSurfaceFeatures, type SurfacePrior, type AwSurfaceFeatures } from "./aw-tissue-v2-features";
import { buildAwV2Race, loadAwV2Model, emptyAwV2Forward, captureAwV2Races, AW_TISSUE_V2_FORWARD_PATH, type AwV2Context } from "./aw-tissue-v2";
import { AW_TISSUE_V2_EPOCH } from "./aw-tissue-v2-activation";
import { loadJumpTissueCommentsForRaces } from "./jump-tissue-sync";
import { mutateAwTissueForward, updateAwTissueForward } from "./aw-tissue-forward";
import { getRacecardRowsForRaceIds, groupTodaysRacingRows, isAllWeatherRaceForDisplay, type TodayMeeting } from "./todays-racing";

type Connection = ReturnType<typeof createDbConnection>;
type Row = { runnerId: string; raceId: string; horseId: string; at: Date; course: string; surface: string | null; raceName: string | null; raceType: string | null; winningTime: string | null; resultStatus: string | null; finishingPosition: number | null; weightLbs: number | null };
/** Same canonical capture-bounded horse/participant loaders used by Turf v3;
 * only AW declarations are replaced, and surface history is bounded identically.
 */
export async function loadAwV2CaptureContext(connection: Connection, meetings: TodayMeeting[], raceDate: string, cutoff: Date): Promise<{ meetings: TodayMeeting[]; context: AwV2Context }> {
  const races = meetings.flatMap(m => m.races).filter(r => isAllWeatherRaceForDisplay(r) && r.raceDateTime && cutoff < r.raceDateTime);
  const empty: AwV2Context = { historyCutoffAt: cutoff.toISOString(), surfaceByRunner: new Map(), comments: new Map() };
  if (!races.length) return { meetings, context: empty };
  const targets = races.flatMap(r => r.runners.map(runner => ({ targetRunnerId: runner.runnerId, trainerId: runner.trainerId, jockeyId: runner.jockeyId, raceDateTime: cutoff })));
  const [metrics, trainers, jockeys, comments] = await Promise.all([
    getTargetRunnerMetricsForDate(connection.db, raceDate, "sporting_life", { includeNonRunnerTargets: true, completedPriorRunsOnly: true, targetRunnerIds: targets.map(t => t.targetRunnerId), asOfDateTime: cutoff }),
    getTrainerPriorMetricsForTargets(connection.db, targets, "sporting_life"), getJockeyPriorMetricsForTargets(connection.db, targets, "sporting_life"), loadJumpTissueCommentsForRaces(connection.client, races),
  ]);
  const horses = [...new Set(races.flatMap(r => r.runners.map(runner => runner.horseId)))];
  const min = new Date(Math.min(...races.map(r => r.raceDateTime!.getTime())) - 365 * 86400000).toISOString();
  const sql = connection.client;
  const rows = await sql<Row[]>`with metadata as materialized (select r.*,c.display_name as course,
    (select si.payload #>> '{props,pageProps,race,race_summary,course_surface,surface}' from source_imports si where si.source=r.source and si.source_id=r.source_id and si.source_type='full-result-next-data') as surface
    from races r join courses c on c.id=r.course_id where r.source='sporting_life' and r.race_datetime >= ${min}::timestamptz and r.race_datetime < ${cutoff.toISOString()}::timestamptz)
    select rr.id as "runnerId",r.id as "raceId",rr.horse_id as "horseId",r.race_datetime as at,r.course,r.surface,r.race_name as "raceName",r.race_type as "raceType",r.winning_time as "winningTime",rr.result_status as "resultStatus",rr.finishing_position as "finishingPosition",rr.weight_carried_lbs as "weightLbs"
    from race_runners rr join metadata r on r.id=rr.race_id where rr.source='sporting_life' and rr.horse_id in ${sql(horses)} and r.surface in ('ALLWEATHER','POLYTRACK') order by rr.horse_id,r.race_datetime desc,rr.id`;
  const byHorse = new Map<string, SurfacePrior[]>();
  for (const row of rows) {
    if (!isSupportedAllWeatherRace({ courseName: row.course, surface: row.surface, raceName: row.raceName, raceType: row.raceType }) || isVoidBetResultStatus(row.resultStatus) || (row.resultStatus === null && row.finishingPosition === null)) continue;
    const prior: SurfacePrior = { raceId: row.raceId, runnerId: row.runnerId, course: row.course, surface: row.surface, raceDateTime: new Date(row.at), aw: true, completedTimed: Boolean(row.winningTime?.trim()), speed: null, weightLbs: row.weightLbs };
    const list = byHorse.get(row.horseId) ?? []; list.push(prior); byHorse.set(row.horseId, list);
  }
  const selected = new Set<string>();
  for (const r of races) for (const runner of r.runners) {
    const low = r.raceDateTime!.getTime() - 365 * 86400000;
    for (const p of (byHorse.get(runner.horseId) ?? []).filter(p => p.completedTimed && p.raceId !== r.raceId && p.raceDateTime < cutoff && p.raceDateTime.getTime() >= low).slice(0, 5)) selected.add(p.runnerId);
  }
  const ratings = await getAwSpeedRatingsAsOfRuns(connection.db, [...selected], { source: "sporting_life" });
  for (const priors of byHorse.values()) for (const p of priors) p.speed = ratings.get(p.runnerId)?.rating ?? null;
  const surfaceByRunner = new Map<string, AwSurfaceFeatures>();
  for (const m of meetings) for (const r of m.races) if (races.includes(r)) for (const runner of r.runners) surfaceByRunner.set(runner.runnerId, buildAwSurfaceFeatures({ targetRaceId: r.raceId, targetAt: r.raceDateTime!, historyCutoff: cutoff, course: m.courseName, surface: r.surface, historyLoaded: true, priors: byHorse.get(runner.horseId) ?? [] }));
  const byRunner = new Map(metrics.map(row => [row.target.runnerId, row.metrics]));
  const ids = new Set(races.map(r => r.raceId));
  return { context: { historyCutoffAt: cutoff.toISOString(), surfaceByRunner, comments }, meetings: meetings.map(m => ({ ...m, races: m.races.map(r => !ids.has(r.raceId) ? r : ({ ...r, runners: r.runners.map(runner => ({ ...runner, metrics: byRunner.get(runner.runnerId) ?? null, trainerMetrics: trainers.get(runner.runnerId), jockeyMetrics: jockeys.get(runner.runnerId) })) })) })) };
}
export async function syncAwV2Meetings(connection: Connection, meetings: TodayMeeting[], raceDate: string) {
  const cutoff = new Date();
  const capture = await loadAwV2CaptureContext(connection, meetings, raceDate, cutoff);
  const model = await loadAwV2Model();
  return mutateAwTissueForward(async latest => {
    const pending = latest.races.filter(r => !r.settledAt).map(r => r.raceId);
    const results = pending.length ? groupTodaysRacingRows(await getRacecardRowsForRaceIds(connection.db, pending)).flatMap(m => m.races) : [];
    const now = new Date(), known = new Set(latest.races.map(r => r.raceId));
    const additions = capture.meetings.flatMap(m => m.races.filter(r => isAllWeatherRaceForDisplay(r) && !known.has(r.raceId)).flatMap(r => { const book = buildAwV2Race(r, m.courseName, raceDate, model, capture.context, now, AW_TISSUE_V2_EPOCH); return book ? [book] : []; }));
    return updateAwTissueForward(captureAwV2Races(updateAwTissueForward(latest, new Map(results.map(r => [r.raceId, r])), now), additions), new Map(capture.meetings.flatMap(m => m.races).map(r => [r.raceId, r])), now);
  }, AW_TISSUE_V2_FORWARD_PATH, emptyAwV2Forward());
}
