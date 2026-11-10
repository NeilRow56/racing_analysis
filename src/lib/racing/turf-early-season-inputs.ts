import type { createDbConnection } from "@/db";
import type { TodayMeeting } from "./todays-racing";
import { isOrdinaryFlatTurfRace } from "./turf-speed-rating";
import { getTurfSpeedRatingsAsOfRuns, getTurfSpeedRatingsForRunners } from "./turf-speed-ratings";
import { calculateWeightAdjustedPerformance } from "./weight-performance";
import { isVoidBetResultStatus, settledWinValue } from "./backtest";
import { earlyTurfDate, type TurfEvidenceInput } from "./turf-early-season-method";

/** Separate read-only adapter; never changes production inputs. Empty outside the 2027 window. */
export async function loadEarlyTurfInputs(connection: ReturnType<typeof createDbConnection>, meetings: TodayMeeting[], cutoff: Date) {
  const result = new Map<string, TurfEvidenceInput>();
  if (!earlyTurfDate(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(cutoff))) return result;
  const runners = meetings.flatMap(m => m.races.filter(r => isOrdinaryFlatTurfRace(r) && r.raceDateTime && r.raceDateTime > cutoff).flatMap(r => r.runners));
  const horses = [...new Set(runners.map(r => r.horseId))];
  if (!horses.length) return result;
  type Row = { runnerId: string; horseId: string; raceId: string; at: Date; date: string; raceName: string | null; raceType: string | null;
    raceTypeCode: string | null; surface: string | null; finish: number | null; status: string | null; officialRating: number | null; weight: number | null; winningTime: string | null };
  const rows = await connection.client<Row[]>`
    select rr.id as "runnerId", rr.horse_id as "horseId", r.id as "raceId", r.race_datetime as at, r.race_date::text as date,
      r.race_name as "raceName", r.race_type as "raceType", r.race_type_code as "raceTypeCode",
      si.payload #>> '{props,pageProps,race,race_summary,course_surface,surface}' as surface,
      rr.finishing_position as finish, rr.result_status as status, rr.official_rating as "officialRating",
      rr.weight_carried_lbs as weight, r.winning_time as "winningTime"
    from race_runners rr join races r on r.id=rr.race_id
    left join source_imports si on si.source=r.source and si.source_id=r.source_id and si.source_type='full-result-next-data'
    where rr.horse_id in ${connection.client(horses)} and rr.source='sporting_life' and r.source='sporting_life'
      and r.race_datetime < ${cutoff.toISOString()}::timestamptz order by r.race_datetime desc, rr.id`;
  const valid = rows.filter(r => !isVoidBetResultStatus(r.status) && settledWinValue({ finishingPosition: r.finish, resultStatus: r.status, won: null }) !== null);
  if (new Set(valid.map(r => r.runnerId)).size !== valid.length) throw new Error("Duplicate Turf history source");
  const ids = valid.filter(isOrdinaryFlatTurfRace).map(r => r.runnerId);
  const [seasonal, production] = await Promise.all([
    getTurfSpeedRatingsAsOfRuns(connection.db, ids, { source: "sporting_life" }),
    getTurfSpeedRatingsForRunners(connection.db, ids, { source: "sporting_life", calculationCutoffDateTime: cutoff }),
  ]);
  for (const runner of runners) result.set(runner.runnerId, { cutoff: cutoff.toISOString(), runs: valid.filter(h => h.horseId === runner.horseId).map(h => {
    const productionSpeed = production.get(h.runnerId)?.rating ?? null;
    return { runnerId: h.runnerId, raceId: h.raceId, at: new Date(h.at).toISOString(), date: h.date, turf: isOrdinaryFlatTurfRace(h),
      completed: h.finish !== null && h.finish > 0, officialRating: h.officialRating, speed: seasonal.get(h.runnerId)?.rating ?? null,
      productionSpeed, performance: calculateWeightAdjustedPerformance({ rawSpeedRating: productionSpeed, weightCarriedLb: h.weight })?.performanceRating ?? null,
      timed: Boolean(h.winningTime?.trim()) };
  }) });
  return result;
}
