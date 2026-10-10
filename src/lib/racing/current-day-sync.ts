import type { TodayMeeting, TodayRunner, TodaysRacingData } from "./todays-racing";

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
