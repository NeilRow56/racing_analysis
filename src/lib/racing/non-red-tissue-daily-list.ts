import { isTissueTop2SpeedRankWatch } from "./tissue-speed-rank-watch";
import { isTissue1Value1Agreement } from "./tissue-value-agreement";
import { formatRaceTimeForDisplay, type TodayMeeting, type TodayRunner } from "./todays-racing";
import { todayRaceHasConclusiveResult } from "./today-race-status";
import { resultStatusLabel } from "./today-rule-matches";
import { isVoidBetResultStatus } from "./backtest";

export type NonRedTissueDailyRow = {
  raceId: string;
  runnerId: string;
  course: string;
  time: string;
  horseName: string;
  tissueRank: number;
  agreement: boolean;
  speedWatch: boolean;
  result: { label: string; winner: boolean; settled: boolean } | null;
};

/** Research shortlist only. Pass the genuine frozen bookmaker price, never live/forecast odds or SP. */
export function isTissueDailyWatchCandidate(candidate: {
  tissueRank?: number | null;
  valueRank?: number | null;
  activeValue1?: boolean;
  bestL3SpeedRank?: number | null;
  capturedPrice?: number | null;
}): boolean {
  if (isTissue1Value1Agreement(candidate)) return true;
  const { tissueRank, capturedPrice } = candidate;
  if (isTissueTop2SpeedRankWatch(candidate) || typeof capturedPrice !== "number" || !Number.isFinite(capturedPrice)) return false;
  return (tissueRank === 1 && capturedPrice >= 3 && capturedPrice < 6) ||
    (tissueRank === 2 && capturedPrice >= 6 && capturedPrice < 11);
}

/** Project validated frozen Today observations without reranking or changing the racecard. */
export function buildNonRedTissueDailyList(meetings: readonly TodayMeeting[]): NonRedTissueDailyRow[] {
  return meetings.flatMap(meeting => meeting.races.flatMap(race => {
    const hasConclusiveResult = todayRaceHasConclusiveResult(race);
    return race.runners.filter(({ tissueValue }) =>
      isTissueDailyWatchCandidate({ tissueRank: tissueValue?.tissueRank,
        valueRank: tissueValue?.valueRank,
        activeValue1: tissueValue?.activeValue1,
        bestL3SpeedRank: tissueValue?.bestL3SpeedRank, capturedPrice: tissueValue?.marketPrice }),
    ).map(runner => ({
      raceId: race.raceId,
      runnerId: runner.runnerId,
      course: meeting.courseName,
      time: formatRaceTimeForDisplay(race),
      horseName: runner.horseName,
      tissueRank: runner.tissueValue!.tissueRank,
      agreement: isTissue1Value1Agreement(runner.tissueValue),
      speedWatch: isTissueTop2SpeedRankWatch(runner.tissueValue ?? {}),
      result: watchListResult(runner, hasConclusiveResult),
    }));
  })).sort((a, b) => a.time.localeCompare(b.time) || a.course.localeCompare(b.course, "en-GB"));
}

/** Result decoration only; never participates in the frozen membership predicate. */
function watchListResult(
  runner: Pick<TodayRunner, "resultStatus" | "finishingPosition">,
  hasConclusiveResult: boolean,
): NonRedTissueDailyRow["result"] {
  if (runner.resultStatus === "non_runner") return { label: "NR", winner: false, settled: false };
  if (!hasConclusiveResult) return null;
  if (isVoidBetResultStatus(runner.resultStatus)) {
    return { label: resultStatusLabel(runner.resultStatus!), winner: false, settled: false };
  }
  const position = runner.finishingPosition;
  if (position === 1) return { label: "WIN", winner: true, settled: true };
  if (position != null) {
    const lastTwo = position % 100;
    const suffix = lastTwo >= 11 && lastTwo <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[position % 10] ?? "th");
    return { label: `${position}${suffix}`, winner: false, settled: true };
  }
  return runner.resultStatus ? { label: resultStatusLabel(runner.resultStatus), winner: false, settled: true } : null;
}

export function formatNonRedTissueDailyList(rows: readonly NonRedTissueDailyRow[]): string {
  return rows.map(row => `${row.course} ${row.time} ${row.horseName} — T${row.tissueRank}${row.agreement ? " — T1=V1" : ""}${row.speedWatch ? " — pale-red Speed watch" : ""}${row.result ? ` — ${row.result.label}` : ""}`).join("\n");
}
