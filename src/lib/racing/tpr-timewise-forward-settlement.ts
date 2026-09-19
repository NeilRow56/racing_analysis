import type { TodayMeeting } from "./todays-racing";
import {
  enrichForwardRecordResult,
  isTimewiseEligibleRace,
  timewiseRaceFamily,
  trackerRaceTime,
} from "./tpr-timewise-forward-context";
import {
  forwardRaceKey,
  loadTrackerData,
  saveTrackerData,
  type TrackerData,
} from "../../../scripts/diagnose-tpr-vs-timewise-forward";

export async function enrichTodayForwardTrackerResults(
  meetings: TodayMeeting[],
  raceDate: string,
  existingData?: TrackerData,
) {
  const data = existingData ?? await loadTrackerData();
  const records = new Map(data.races
    .filter((record) => record.raceDate === raceDate)
    .map((record) => [forwardRaceKey(record), record]));
  let updated = 0;

  for (const meeting of meetings) {
    for (const race of meeting.races) {
      if (!isTimewiseEligibleRace(race)) continue;
      const raceTime = trackerRaceTime(race.scheduledTime);
      if (!raceTime) continue;
      const record = records.get(forwardRaceKey({ raceDate, course: meeting.courseName, raceTime }));
      if (!record) continue;
      if (record.family !== timewiseRaceFamily(race)) continue;
      const enriched = enrichForwardRecordResult(record, race);
      if (enriched === record) continue;
      const index = data.races.findIndex((candidate) => forwardRaceKey(candidate) === forwardRaceKey(enriched));
      if (index >= 0) data.races[index] = enriched;
      records.set(forwardRaceKey(enriched), enriched);
      updated += 1;
    }
  }

  if (updated > 0) await saveTrackerData(data);
  return { data, updated };
}
