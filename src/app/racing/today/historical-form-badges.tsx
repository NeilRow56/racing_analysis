import type { HistoricalFormFlags } from "@/lib/racing/historical-form-flags";

export function HistoricalFormBadges({ flags, officialRating }: {
  flags?: HistoricalFormFlags;
  officialRating: number | null;
}) {
  if (!flags) return null;
  return <>
    {flags.lastWinWithin3lbOr && flags.lastWinningOr !== null && officialRating !== null ? (
      <span
        className="border border-amber-200 bg-amber-50 px-1 py-0.5 text-[10px] font-semibold leading-none text-amber-800"
        title={`Last win off OR ${flags.lastWinningOr}; today's OR ${officialRating}`}
      >OR ±3</span>
    ) : null}
    {flags.courseFirstOrSecond ? (
      <span
        className="border border-emerald-200 bg-emerald-50 px-1 py-0.5 text-[10px] font-semibold leading-none text-emerald-800"
        title={`Previously finished 1st or 2nd here. Course record: ${flags.courseWins} ${flags.courseWins === 1 ? "win" : "wins"}, ${flags.courseSeconds} ${flags.courseSeconds === 1 ? "second" : "seconds"}${flags.latestCourseFinish ? `; latest: ${flags.latestCourseFinish.position === 1 ? "1st" : "2nd"} on ${flags.latestCourseFinish.raceDateTime.slice(0, 10)}` : ""}`}
      >COURSE 1/2</span>
    ) : null}
  </>;
}
