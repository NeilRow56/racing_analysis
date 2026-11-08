import { TISSUE_GENERATION } from "./tissue-generation-config";
import { isLiveRunnerEligible } from "./live-runner-eligibility";
import { isTissue1Value1Agreement } from "./tissue-value-agreement";
import { formatRaceTimeForDisplay, type TodayMeeting, type TodayRunner } from "./todays-racing";
import { todayRaceHasConclusiveResult } from "./today-race-status";
import { resultStatusLabel } from "./today-rule-matches";
import { isVoidBetResultStatus } from "./backtest";

export type TissueDailyWatchRow = {
  raceId: string; runnerId: string; course: string; time: string; horseName: string;
  tissueRank: number; agreement: boolean;
  result: { label: string; winner: boolean; settled: boolean } | null;
};
type Candidate = {
  resultStatus?: string | null;
  generation?: string; tissueRank?: number | null; capturedPrice?: number | null;
  valueRank?: number | null; activeValue1?: boolean; valueSelectionVersion?: string;
};
export function isActiveTissueWatchCandidate(candidate: Candidate): boolean {
  if (!isLiveRunnerEligible(candidate)) return false;
  if (candidate.generation !== TISSUE_GENERATION) return false;
  if (isTissue1Value1Agreement({ ...candidate, activeTissueRank: candidate.tissueRank ?? null })) return true;
  const price = candidate.capturedPrice;
  if (typeof price !== "number" || !Number.isFinite(price)) return false;
  return (candidate.tissueRank === 1 && price >= 3 && price < 6) ||
    (candidate.tissueRank === 2 && price >= 6 && price < 11);
}

/** Use frozen ranks/prices, with canonical NR status controlling live eligibility. */
export function buildTissueDailyWatchList(meetings: readonly TodayMeeting[]): TissueDailyWatchRow[] {
  const seen = new Set<string>();
  return meetings.flatMap(meeting => meeting.races.flatMap(race => {
    const complete = todayRaceHasConclusiveResult(race);
    return race.runners.flatMap(runner => {
      const tissue = runner.activeTissue, value = runner.tissueValue;
      const candidate = { resultStatus: runner.resultStatus, generation: tissue?.generation, tissueRank: tissue?.rank, capturedPrice: tissue?.capturedPrice,
        valueRank: value?.valueRank, activeValue1: value?.activeValue1, valueSelectionVersion: value?.valueSelectionVersion };
      const key = `${race.raceId}|${runner.runnerId}`;
      if (seen.has(key) || !isActiveTissueWatchCandidate(candidate)) return [];
      seen.add(key);
      return [{ raceId: race.raceId, runnerId: runner.runnerId, course: meeting.courseName, time: formatRaceTimeForDisplay(race),
        horseName: runner.horseName, tissueRank: tissue!.rank,
        agreement: isTissue1Value1Agreement({ ...candidate, activeTissueRank: tissue!.rank }),
        result: watchListResult(runner, complete) }];
    });
  })).sort((a, b) => a.time.localeCompare(b.time) || a.course.localeCompare(b.course, "en-GB"));
}

/** Shared result decoration, independent of membership, rank and price. */
export function watchListResult(runner: Pick<TodayRunner, "resultStatus" | "finishingPosition">, hasConclusiveResult: boolean): TissueDailyWatchRow["result"] {
  if (runner.resultStatus === "non_runner") return { label: "NR", winner: false, settled: false };
  if (!hasConclusiveResult) return null;
  if (isVoidBetResultStatus(runner.resultStatus)) return { label: resultStatusLabel(runner.resultStatus!), winner: false, settled: false };
  const position = runner.finishingPosition;
  if (position === 1) return { label: "WIN", winner: true, settled: true };
  if (position != null) {
    const lastTwo = position % 100;
    const suffix = lastTwo >= 11 && lastTwo <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[position % 10] ?? "th");
    return { label: `${position}${suffix}`, winner: false, settled: true };
  }
  return runner.resultStatus ? { label: resultStatusLabel(runner.resultStatus), winner: false, settled: true } : null;
}
export function formatTissueDailyWatchList(rows: readonly TissueDailyWatchRow[]): string {
  return rows.map(row => `${row.course} ${row.time} ${row.horseName} — T${row.tissueRank}${row.agreement ? " — T1=V1" : ""}${row.result ? ` — ${row.result.label}` : ""}`).join("\n");
}
