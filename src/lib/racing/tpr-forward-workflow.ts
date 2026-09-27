import {
  createRecord,
  forwardRaceKey,
  type ForwardRaceRecord,
  type TrackerData,
} from "../../../scripts/diagnose-tpr-vs-timewise-forward";
import {
  buildTodayForwardInput,
  enrichForwardRecordResult,
} from "./tpr-timewise-forward-context";
import {
  isOrdinaryFlatTurfRaceForDisplay,
  type TodayMeeting,
  type TodayRace,
} from "./todays-racing";

export function buildTprForwardRace(input: {
  raceDate: string;
  course: string;
  race: TodayRace;
  recordedAt?: Date;
}): ForwardRaceRecord | null {
  const recordedAt = input.recordedAt ?? new Date();
  if (
    !isOrdinaryFlatTurfRaceForDisplay(input.race) ||
    !input.race.raceDateTime ||
    !input.race.scheduledTime ||
    recordedAt >= input.race.raceDateTime
  ) {
    return null;
  }

  return createRecord({
    ...buildTodayForwardInput({
      course: input.course,
      race: input.race,
      raceDate: input.raceDate,
      timewiseRank1: null,
      timewiseRank2: null,
    }),
    recordedAt: recordedAt.toISOString(),
    recordedPreRace: true,
    timewiseRecordedAt: recordedAt.toISOString(),
    timewiseRecordedPreRace: true,
    timewiseUpdatedAt: null,
  });
}

export function upsertTprForwardRaces(
  data: TrackerData,
  candidates: ForwardRaceRecord[],
): TrackerData {
  const raceIds = new Set(data.races.flatMap((race) => race.raceId ? [race.raceId] : []));
  const keys = new Set(data.races.map(forwardRaceKey));
  const additions = candidates.filter((candidate) => {
    const key = forwardRaceKey(candidate);
    if ((candidate.raceId && raceIds.has(candidate.raceId)) || keys.has(key)) return false;
    if (candidate.raceId) raceIds.add(candidate.raceId);
    keys.add(key);
    return true;
  });
  return additions.length === 0
    ? data
    : { ...data, races: [...data.races, ...additions].sort(compareForwardRaces) };
}

export function pendingTprForwardRaceIds(data: TrackerData): string[] {
  return [...new Set(data.races.flatMap((race) =>
    race.family === "turf" &&
    race.timewiseRecordedPreRace === true &&
    race.winners.length === 0 &&
    race.raceId
      ? [race.raceId]
      : []
  ))];
}

export function settlePendingTprForwardRaces(
  data: TrackerData,
  racesById: Map<string, TodayRace>,
): { data: TrackerData; settled: number; updated: number } {
  let settled = 0;
  let updated = 0;
  const races = data.races.map((record) => {
    if (
      record.family !== "turf" ||
      record.timewiseRecordedPreRace !== true ||
      record.winners.length > 0 ||
      !record.raceId
    ) return record;
    const result = racesById.get(record.raceId);
    if (!result) return record;
    const enriched = enrichForwardRecordResult(record, result);
    if (enriched === record) return record;
    updated += 1;
    if (enriched.winners.length > 0) settled += 1;
    return enriched;
  });
  return updated === 0
    ? { data, settled, updated }
    : { data: { ...data, races }, settled, updated };
}

export function renderTprToday(data: TrackerData, raceDate: string): string {
  const records = data.races
    .filter((race) =>
      race.family === "turf" &&
      race.raceDate === raceDate &&
      race.timewiseRecordedPreRace === true
    )
    .sort(compareForwardRaces);
  const lines = [`TPR Forward Today - ${raceDate}`, ""];
  if (records.length === 0) return `${lines.join("\n")}No clean pre-race TPR records.`;
  for (const race of records) {
    const raceLabel = `${race.raceTime} ${race.course}${race.raceName ? ` - ${race.raceName}` : ""}`;
    lines.push(raceLabel);
    lines.push(`  W100: ${selectionLabel(race.tprRank1, race.tprRank1NonRunner)} | W50: ${selectionLabel(race.w50Rank1, race.w50Rank1NonRunner)} | agree: ${yesNo(agrees(race.tprRank1, race.w50Rank1))}`);
    lines.push(`  OR: ${race.orRank1 ?? "-"} | W100=OR: ${yesNo(race.tpr1AgreesWithOr1)} | W50=OR: ${yesNo(race.w50AgreesWithOr1)} | ${race.winners.length > 0 ? "settled" : "pending"}`, "");
  }
  return lines.join("\n").trimEnd();
}

export function tprForwardRacesFromMeetings(
  meetings: TodayMeeting[],
  raceDate: string,
  recordedAt = new Date(),
): ForwardRaceRecord[] {
  return meetings.flatMap((meeting) => meeting.races
    .map((race) => buildTprForwardRace({
      raceDate,
      course: meeting.courseName,
      race,
      recordedAt,
    }))
    .filter((race): race is ForwardRaceRecord => race !== null));
}

function compareForwardRaces(left: ForwardRaceRecord, right: ForwardRaceRecord) {
  return left.raceDate.localeCompare(right.raceDate) ||
    left.raceTime.localeCompare(right.raceTime) ||
    left.course.localeCompare(right.course);
}

function agrees(left: string | null, right: string | null) {
  if (left === null || right === null) return null;
  return normalize(left) === normalize(right);
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("en-GB").replace(/\s+/g, " ");
}

function yesNo(value: boolean | null) {
  return value === null ? "-" : value ? "yes" : "no";
}

function selectionLabel(horse: string | null, nonRunner: boolean | undefined) {
  if (horse === null) return "-";
  return nonRunner ? `${horse} (NR)` : horse;
}
