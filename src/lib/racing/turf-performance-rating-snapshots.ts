import { turfPerformanceRatingSnapshots } from "@/db/schema";
import { createDbConnection } from "@/db";
import type { TodayMeeting } from "./todays-racing";

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
