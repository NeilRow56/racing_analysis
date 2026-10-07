import type { TodayMeeting, TodaysRacingData } from "./todays-racing";

export type CurrentDayProspectiveCapture =
  | { skipped: false; meetings: TodayMeeting[] }
  | { skipped: true; meetings: []; message: string };

export function currentDayProspectiveCapture(
  data: TodaysRacingData,
): CurrentDayProspectiveCapture {
  if (data.status === "ok") return { skipped: false, meetings: data.meetings };
  return {
    skipped: true,
    meetings: [],
    message: noCurrentDayRacecardsMessage(data.raceDate),
  };
}

export function noCurrentDayRacecardsMessage(raceDate: string) {
  return `No racecards imported for ${raceDate}; prospective capture skipped.`;
}
