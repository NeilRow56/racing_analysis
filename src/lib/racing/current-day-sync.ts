import type { TodayMeeting, TodayRace, TodayRunner, TodaysRacingData } from "./todays-racing";

// Racecards supply declarations; actual starters are only known after results.
// Counts may include or exclude declared non-runners, but must cover the loaded field.
export function hasCompleteProspectiveField(race: TodayRace): boolean {
  const active = race.runners.filter(runner => runner.resultStatus !== "non_runner");
  const count = race.actualRunnerCount ?? race.declaredRunnerCount;
  return active.length > 0 && new Set(race.runners.map(runner => runner.runnerId)).size === race.runners.length &&
    (count === active.length || count === race.runners.length);
}

export type CurrentDayProspectiveCapture =
  | { skipped: false; meetings: TodayMeeting[] }
  | { skipped: true; meetings: []; message: string };

export function currentDayProspectiveCapture(
  data: TodaysRacingData,
): CurrentDayProspectiveCapture {
  if (data.status === "ok") {
    if (process.env.RESEARCH_EXISTING_CARDS_DATE !== data.raceDate) return { skipped: false, meetings: data.meetings };
    return {
      skipped: false,
      meetings: data.meetings.map((meeting) => ({
        ...meeting,
        races: meeting.races.map((race) => ({ ...race, runners: race.runners.map(withoutStaleCapturePrices) })),
      })),
    };
  }
  return {
    skipped: true,
    meetings: [],
    message: noCurrentDayRacecardsMessage(data.raceDate),
  };
}

function withoutStaleCapturePrices(runner: TodayRunner): TodayRunner {
  const hasResult = runner.finishingPosition !== null || (runner.resultStatus !== null && runner.resultStatus !== "non_runner");
  return {
    ...runner,
    bookmakerQuotes: [],
    forecastOdds: null,
    forecastDecimalOdds: null,
    odds: hasResult ? runner.odds : null,
    oddsDecimal: hasResult ? runner.oddsDecimal : null,
  };
}

// Pending-race loaders also feed price enrichment. Preserve SP/result fields for settlement.
export function withoutStaleBookmakerQuotes<T extends { raceDate: string; bookmakerQuotes?: unknown }>(row: T): T {
  return process.env.RESEARCH_EXISTING_CARDS_DATE === row.raceDate ? { ...row, bookmakerQuotes: [] } : row;
}

export function noCurrentDayRacecardsMessage(raceDate: string) {
  return `No racecards imported for ${raceDate}; prospective capture skipped.`;
}
