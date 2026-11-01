import { isTissueTop2SpeedRankWatch } from "./tissue-speed-rank-watch";
import { formatRaceTimeForDisplay, type TodayMeeting } from "./todays-racing";

export type NonRedTissueDailyRow = {
  raceId: string;
  runnerId: string;
  course: string;
  time: string;
  horseName: string;
  tissueRank: number;
};

/** Research shortlist only. Pass the genuine frozen bookmaker price, never live/forecast odds or SP. */
export function isTissueDailyWatchCandidate(candidate: {
  tissueRank?: number | null;
  bestL3SpeedRank?: number | null;
  capturedPrice?: number | null;
}): boolean {
  const { tissueRank, capturedPrice } = candidate;
  if (isTissueTop2SpeedRankWatch(candidate) || typeof capturedPrice !== "number" || !Number.isFinite(capturedPrice)) return false;
  return (tissueRank === 1 && capturedPrice >= 3 && capturedPrice < 6) ||
    (tissueRank === 2 && capturedPrice >= 6 && capturedPrice < 11);
}

/** Project validated frozen Today observations without reranking or changing the racecard. */
export function buildNonRedTissueDailyList(meetings: readonly TodayMeeting[]): NonRedTissueDailyRow[] {
  return meetings.flatMap(meeting => meeting.races.flatMap(race =>
    race.runners.filter(({ tissueValue }) =>
      isTissueDailyWatchCandidate({ tissueRank: tissueValue?.tissueRank,
        bestL3SpeedRank: tissueValue?.bestL3SpeedRank, capturedPrice: tissueValue?.marketPrice }),
    ).map(runner => ({
      raceId: race.raceId,
      runnerId: runner.runnerId,
      course: meeting.courseName,
      time: formatRaceTimeForDisplay(race),
      horseName: runner.horseName,
      tissueRank: runner.tissueValue!.tissueRank,
    }))),
  ).sort((a, b) => a.time.localeCompare(b.time) || a.course.localeCompare(b.course, "en-GB"));
}

export function formatNonRedTissueDailyList(rows: readonly NonRedTissueDailyRow[]): string {
  return rows.map(row => `${row.course} ${row.time} ${row.horseName} — T${row.tissueRank}`).join("\n");
}
