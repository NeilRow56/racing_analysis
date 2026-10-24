import { isTissueTop2SpeedRankWatch } from "./tissue-speed-rank-watch";
import { formatRaceTimeForDisplay, type TodayMeeting } from "./todays-racing";

export type NonRedTissueDailyRow = {
  raceId: string;
  runnerId: string;
  course: string;
  time: string;
  horseName: string;
};

/** Project the canonical Today badges without reranking or changing the racecard. */
export function buildNonRedTissueDailyList(meetings: readonly TodayMeeting[]): NonRedTissueDailyRow[] {
  return meetings.flatMap(meeting => meeting.races.flatMap(race =>
    race.runners.filter(({ tissueValue }) =>
      (tissueValue?.tissueRank === 1 || tissueValue?.tissueRank === 2) &&
      !isTissueTop2SpeedRankWatch(tissueValue),
    ).map(runner => ({
      raceId: race.raceId,
      runnerId: runner.runnerId,
      course: meeting.courseName,
      time: formatRaceTimeForDisplay(race),
      horseName: runner.horseName,
    }))),
  ).sort((a, b) => a.time.localeCompare(b.time) || a.course.localeCompare(b.course, "en-GB"));
}

export function formatNonRedTissueDailyList(rows: readonly NonRedTissueDailyRow[]): string {
  return rows.map(row => `${row.course} ${row.time} ${row.horseName}`).join("\n");
}
