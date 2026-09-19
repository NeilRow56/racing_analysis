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
  mutateTrackerData,
  type TrackerData,
} from "../../../scripts/diagnose-tpr-vs-timewise-forward";

export async function enrichTodayForwardTrackerResults(
  meetings: TodayMeeting[],
  raceDate: string,
  existingData?: TrackerData,
  path?: string,
) {
  let updated = 0;
  const initialData = existingData ?? await loadTrackerData();
  const hasSettleableRace = meetings.some((meeting) => meeting.races.some((race) =>
    isTimewiseEligibleRace(race) && race.runners.some((runner) => runner.finishingPosition === 1)
  ));
  if (!hasSettleableRace) return { data: initialData, updated };
  const data = await mutateTrackerData((latest) => {
    const races = [...latest.races];
    const records = new Map(races
      .filter((record) => record.raceDate === raceDate)
      .map((record) => [forwardRaceKey(record), record]));
    for (const meeting of meetings) {
      for (const race of meeting.races) {
        if (!isTimewiseEligibleRace(race)) continue;
        const raceTime = trackerRaceTime(race.scheduledTime);
        if (!raceTime) continue;
        const key = forwardRaceKey({ raceDate, course: meeting.courseName, raceTime });
        const record = records.get(key);
        if (!record || record.family !== timewiseRaceFamily(race)) continue;
        const enriched = enrichForwardRecordResult(record, race);
        if (enriched === record) continue;
        const index = races.findIndex((candidate) => forwardRaceKey(candidate) === key);
        if (index >= 0) races[index] = enriched;
        records.set(key, enriched);
        updated += 1;
      }
    }
    return { ...latest, races };
  }, path);
  return { data, updated };
}
