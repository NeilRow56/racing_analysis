import { sql } from "drizzle-orm";
import {
  turfPerformanceRatingShadowSnapshots,
  turfPerformanceRatingSnapshots,
} from "@/db/schema";
import { createDbConnection } from "@/db";
import type { TodayMeeting } from "./todays-racing";
import { TURF_PERFORMANCE_RATING_W50_SHADOW_VERSION } from "./turf-performance-rating";

type Db = ReturnType<typeof createDbConnection>["db"];

export type TurfPerformanceRatingSnapshotInput = {
  raceId: string;
  runnerId: string;
  horseId: string;
  raceDate: string;
  rating: string;
  rawRating: string;
  rank: number;
  gap: string | null;
  historyDepth: number;
  formulaVersion: string;
  ratingBasis: string;
  isCrossSurfaceFallback: boolean;
  fallbackSourceSurface: string | null;
};

export type TurfPerformanceRatingShadowSnapshotInput = {
  raceId: string;
  runnerId: string;
  horseId: string;
  raceDate: string;
  raceDatetime: Date | null;
  formulaVersion: string;
  ratingBasis: string;
  isCrossSurfaceFallback: boolean;
  fallbackSourceSurface: string | null;
  w100Rating: string | null;
  w100RawRating: string | null;
  w100Rank: number | null;
  w50Rating: string | null;
  w50RawRating: string | null;
  w50Rank: number | null;
  isW100Rank1: boolean;
  isW50Rank1: boolean;
  shadowAgreement: boolean | null;
};

export function turfPerformanceRatingSnapshotRows(
  meetings: TodayMeeting[],
  raceDate: string,
): TurfPerformanceRatingSnapshotInput[] {
  return meetings.flatMap((meeting) =>
    meeting.races.flatMap((race) =>
      race.runners.flatMap((runner) => {
        const rating = runner.turfPerformanceRating;
        if (!rating) return [];
        return [{
          raceId: race.raceId,
          runnerId: runner.runnerId,
          horseId: runner.horseId,
          raceDate,
          rating: rating.rating.toFixed(3),
          rawRating: rating.rawRating.toFixed(6),
          rank: rating.rank,
          gap: rating.gap === null ? null : rating.gap.toFixed(3),
          historyDepth: rating.historyDepth,
          formulaVersion: rating.version,
          ratingBasis: rating.basis ?? "turf",
          isCrossSurfaceFallback: rating.isCrossSurfaceFallback ?? false,
          fallbackSourceSurface: rating.fallbackSourceSurface ?? null,
        }];
      })
    )
  );
}

export function turfPerformanceRatingShadowSnapshotRows(
  meetings: TodayMeeting[],
  raceDate: string,
): TurfPerformanceRatingShadowSnapshotInput[] {
  return meetings.flatMap((meeting) =>
    meeting.races.flatMap((race) =>
      race.runners.flatMap((runner) => {
        const w100 = runner.turfPerformanceRating;
        const w50 = runner.turfPerformanceShadowRating;
        if (!w100 && !w50) return [];
        const basis = w100?.basis ?? w50?.basis ?? "turf";
        const fallbackSourceSurface = w100?.fallbackSourceSurface ?? w50?.fallbackSourceSurface ?? null;
        return [{
          raceId: race.raceId,
          runnerId: runner.runnerId,
          horseId: runner.horseId,
          raceDate,
          raceDatetime: race.raceDateTime,
          formulaVersion: TURF_PERFORMANCE_RATING_W50_SHADOW_VERSION,
          ratingBasis: basis,
          isCrossSurfaceFallback: basis === "aw_fallback",
          fallbackSourceSurface,
          w100Rating: w100 ? w100.rating.toFixed(3) : null,
          w100RawRating: w100 ? w100.rawRating.toFixed(6) : null,
          w100Rank: w100?.rank ?? null,
          w50Rating: w50 ? w50.rating.toFixed(3) : null,
          w50RawRating: w50 ? w50.rawRating.toFixed(6) : null,
          w50Rank: w50?.rank ?? null,
          isW100Rank1: w100?.rank === 1,
          isW50Rank1: w50?.rank === 1,
          shadowAgreement: race.turfPerformanceShadow?.agreement ?? null,
        }];
      })
    )
  );
}

export async function saveTurfPerformanceRatingSnapshots(
  db: Db,
  meetings: TodayMeeting[],
  raceDate: string,
): Promise<{ attempted: number; inserted: number }> {
  const rows = turfPerformanceRatingSnapshotRows(meetings, raceDate);
  if (rows.length === 0) {
    return { attempted: 0, inserted: 0 };
  }

  const inserted = await db
    .insert(turfPerformanceRatingSnapshots)
    .values(rows)
    .onConflictDoNothing({
      target: [
        turfPerformanceRatingSnapshots.runnerId,
        turfPerformanceRatingSnapshots.formulaVersion,
      ],
    })
    .returning({ id: turfPerformanceRatingSnapshots.id });

  return { attempted: rows.length, inserted: inserted.length };
}

export async function saveTurfPerformanceRatingShadowSnapshots(
  db: Db,
  meetings: TodayMeeting[],
  raceDate: string,
): Promise<{ attempted: number; inserted: number }> {
  const rows = turfPerformanceRatingShadowSnapshotRows(meetings, raceDate);
  if (rows.length === 0) {
    return { attempted: 0, inserted: 0 };
  }

  const inserted = await db
    .insert(turfPerformanceRatingShadowSnapshots)
    .values(rows)
    .onConflictDoNothing({
      target: [
        turfPerformanceRatingShadowSnapshots.runnerId,
        turfPerformanceRatingShadowSnapshots.formulaVersion,
      ],
    })
    .returning({ id: turfPerformanceRatingShadowSnapshots.id });

  return { attempted: rows.length, inserted: inserted.length };
}

export type TurfPerformanceShadowSummary = {
  turfRacesChecked: number;
  agreements: number;
  disagreements: number;
  settledDisagreementRaces: number;
  w50DisagreementWinners: number;
  w100DisagreementWinners: number;
};

export async function summarizeTurfPerformanceShadowSnapshots(
  db: Db,
  raceDate: string,
): Promise<TurfPerformanceShadowSummary> {
  const rows = await db.execute(sql<{
    turf_races_checked: string;
    agreements: string;
    disagreements: string;
    settled_disagreement_races: string;
    w50_disagreement_winners: string;
    w100_disagreement_winners: string;
  }>`
    with race_summary as (
      select
        s.race_id,
        bool_or(s.shadow_agreement is true) as agreement,
        bool_or(s.shadow_agreement is false) as disagreement,
        max(case when s.is_w50_rank_1 then rr.finishing_position end) as w50_finish,
        max(case when s.is_w100_rank_1 then rr.finishing_position end) as w100_finish,
        bool_or(rr.finishing_position is not null) as settled
      from ${turfPerformanceRatingShadowSnapshots} s
      left join race_runners rr on rr.id = s.runner_id
      where s.race_date = ${raceDate}
      group by s.race_id
    )
    select
      count(*)::text as turf_races_checked,
      count(*) filter (where agreement)::text as agreements,
      count(*) filter (where disagreement)::text as disagreements,
      count(*) filter (where disagreement and settled)::text as settled_disagreement_races,
      count(*) filter (where disagreement and w50_finish = 1)::text as w50_disagreement_winners,
      count(*) filter (where disagreement and w100_finish = 1)::text as w100_disagreement_winners
    from race_summary
  `);
  const row = rows[0];
  return {
    turfRacesChecked: Number(row?.turf_races_checked ?? 0),
    agreements: Number(row?.agreements ?? 0),
    disagreements: Number(row?.disagreements ?? 0),
    settledDisagreementRaces: Number(row?.settled_disagreement_races ?? 0),
    w50DisagreementWinners: Number(row?.w50_disagreement_winners ?? 0),
    w100DisagreementWinners: Number(row?.w100_disagreement_winners ?? 0),
  };
}
