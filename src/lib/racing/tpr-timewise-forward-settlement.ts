import type { TodayMeeting } from "./todays-racing";
import { isOrdinaryFlatTurfRaceForDisplay } from "./todays-racing";
import {
  enrichForwardRecordResult,
  trackerRaceTime,
} from "./tpr-timewise-forward-context";
import {
  forwardRaceKey,
  loadTrackerData,
  saveTrackerRace,
} from "../../../scripts/diagnose-tpr-vs-timewise-forward";

export async function enrichTodayForwardTrackerResults(
  meetings: TodayMeeting[],
  raceDate: string,
) {
  const data = await loadTrackerData();
  const records = new Map(data.races
    .filter((record) => record.raceDate === raceDate)
    .map((record) => [forwardRaceKey(record), record]));
  let updated = 0;

  for (const meeting of meetings) {
    for (const race of meeting.races) {
      if (!isOrdinaryFlatTurfRaceForDisplay(race)) continue;
      const raceTime = trackerRaceTime(race.scheduledTime);
      if (!raceTime) continue;
      const record = records.get(forwardRaceKey({ raceDate, course: meeting.courseName, raceTime }));
      if (!record) continue;
      const enriched = enrichForwardRecordResult(record, race);
      if (enriched === record) continue;
      await saveTrackerRace(enriched, true);
      records.set(forwardRaceKey(enriched), enriched);
      updated += 1;
    }
  }

  return updated;
}
