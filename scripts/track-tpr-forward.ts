import { createDbConnection } from "@/db";
import {
  pendingTprForwardRaceIds,
  renderTprToday,
  settlePendingTprForwardRaces,
  tprForwardRacesFromMeetings,
  upsertTprForwardRaces,
} from "@/lib/racing/tpr-forward-workflow";
import {
  getLocalRacingDate,
  getRacecardRowsForRaceIds,
  getTodaysRacingData,
  groupTodaysRacingRows,
  isOrdinaryFlatTurfRaceForDisplay,
  type TodayRace,
} from "@/lib/racing/todays-racing";
import { currentDayProspectiveCapture } from "@/lib/racing/current-day-sync";
import {
  buildForwardValueRecordsFromMeetings,
  enrichForwardValuePriceSnapshots,
  loadForwardValueCalibration,
  loadForwardValueData,
  mutateForwardValueData,
  pendingForwardValueRaceIds,
  settleForwardValueRecords,
  upsertForwardValueRecords,
} from "@/lib/racing/forward-value";
import { loadTissueForward, TISSUE_V2_CONFIG } from "@/lib/racing/tissue-forward";
import {
  DEFAULT_DATA_PATH,
  loadTrackerData,
  mutateTrackerData,
  renderTprSummary,
  type TrackerData,
} from "./diagnose-tpr-vs-timewise-forward";

const command = process.argv[2] ?? "summary";
const raceDate = process.argv[3] ?? getLocalRacingDate();

if (command === "sync") await sync(raceDate);
else if (command === "today") await today(raceDate);
else if (command === "summary") await summary();
else throw new Error("Usage: track-tpr-forward.ts <sync|today|summary> [YYYY-MM-DD]");

async function sync(date: string) {
  const startedAt = performance.now();
  const recordedAt = new Date();
  const connection = createDbConnection();
  try {
    const [existing, existingValue] = await Promise.all([
      loadTrackerData(),
      loadForwardValueData(),
    ]);
    const pendingBefore = pendingTprForwardRaceIds(existing);
    const valuePending = pendingForwardValueRaceIds(existingValue, "turf");
    const priorResults = await loadRacesById(connection.db, [...new Set([...pendingBefore, ...valuePending])]);
    let settledFromPending = 0;
    let resultUpdates = 0;
    const settledExisting = await mutateTrackerData((latest) => {
      const priorSettlement = settlePendingTprForwardRaces(latest, priorResults);
      settledFromPending = priorSettlement.settled;
      resultUpdates = priorSettlement.updated;
      return priorSettlement.data;
    });
    let valueSettled = 0;
    await mutateForwardValueData((latest) => {
      const valuePrior = settleForwardValueRecords(latest, priorResults, recordedAt);
      valueSettled = valuePrior.settled;
      return valuePrior.data;
    });
    const todayData = await getTodaysRacingData(connection.db, date, {
      raceFilter: isOrdinaryFlatTurfRaceForDisplay,
    });
    const capture = currentDayProspectiveCapture(todayData);
    if (capture.skipped) {
      console.log([
        `TPR_SYNC date=${date}`,
        `tracker=${DEFAULT_DATA_PATH}`,
        `pending_before=${pendingBefore.length}`,
        `settled_pending=${settledFromPending}`,
        `result_updates=${resultUpdates}`,
        `tracked=${settledExisting.races.filter((race) => race.family === "turf").length}`,
        `value_settled=${valueSettled}`,
        `elapsed_ms=${Math.round(performance.now() - startedAt)}`,
      ].join(" "));
      console.log(capture.message);
      return;
    }
    const [calibration, tissue] = await Promise.all([
      loadForwardValueCalibration(),
      loadTissueForward(TISSUE_V2_CONFIG.forwardPath, TISSUE_V2_CONFIG),
    ]);
    const candidates = tprForwardRacesFromMeetings(capture.meetings, date, recordedAt);
    const todayRaces = new Map(capture.meetings.flatMap((meeting) =>
      meeting.races.map((race) => [race.raceId, race] as const)
    ));
    const tissueByRaceId = new Map(tissue.races.flatMap((race) => {
      if (race.recordedPreRace !== true) return [];
      const leader = [...race.runners].sort((a, b) => a.tissueRank - b.tissueRank || a.runnerId.localeCompare(b.runnerId))[0];
      return leader ? [[race.raceId, { runnerId: leader.runnerId, horseName: leader.horseName, probability: leader.probability }] as const] : [];
    }));
    let settledCurrent = 0;
    const updated = await mutateTrackerData((latest) => {
      const captured = upsertTprForwardRaces(latest, candidates);
      const currentSettlement = settlePendingTprForwardRaces(captured, todayRaces);
      settledCurrent = currentSettlement.settled;
      resultUpdates += currentSettlement.updated;
      return currentSettlement.data;
    });
    const existingIdentities = new Set(existing.races.map(raceIdentity));
    const created = updated.races.filter((race) => !existingIdentities.has(raceIdentity(race)));
    const valueCandidates = buildForwardValueRecordsFromMeetings({
      family: "turf", raceDate: date, meetings: capture.meetings,
      calibration: calibration.families.turf, recordedAt, tissueByRaceId,
    });
    const updatedValue = await mutateForwardValueData((latest) => {
      const valueCaptured = upsertForwardValueRecords(latest, valueCandidates);
      const valueEnriched = enrichForwardValuePriceSnapshots(valueCaptured, {
        family: "turf", meetings: capture.meetings, capturedAt: recordedAt,
      });
      const valueCurrent = settleForwardValueRecords(valueEnriched, todayRaces, recordedAt);
      valueSettled += valueCurrent.settled;
      return valueCurrent.data;
    });
    const eligible = capture.meetings.flatMap((meeting) => meeting.races)
      .filter(isOrdinaryFlatTurfRaceForDisplay);
    const postStartSkipped = eligible.filter((race) =>
      race.raceDateTime !== null && recordedAt >= race.raceDateTime &&
      !existing.races.some((record) => record.raceId === race.raceId)
    ).length;
    console.log([
      `TPR_SYNC date=${date}`,
      `tracker=${DEFAULT_DATA_PATH}`,
      `eligible=${eligible.length}`,
      `clean_created=${created.filter((race) => race.timewiseRecordedPreRace === true).length}`,
      `post_start_skipped=${postStartSkipped}`,
      `pending_before=${pendingBefore.length}`,
      `settled_from_pending=${settledFromPending}`,
      `settled_current=${settledCurrent}`,
      `result_updates=${resultUpdates}`,
      `tracked=${updated.races.filter((race) => race.family === "turf").length}`,
      `value_created=${updatedValue.races.length - existingValue.races.length}`,
      `value_settled=${valueSettled}`,
      `elapsed_ms=${Math.round(performance.now() - startedAt)}`,
    ].join(" "));
  } finally {
    await connection.client.end();
  }
}

async function today(date: string) {
  const data = await loadTrackerData();
  console.log(renderTprToday(data, date));
}

async function summary() {
  console.log(renderTprSummary(await loadTrackerData()));
}

async function loadRacesById(
  db: ReturnType<typeof createDbConnection>["db"],
  raceIds: string[],
) {
  if (raceIds.length === 0) return new Map<string, TodayRace>();
  const rows = await getRacecardRowsForRaceIds(db, raceIds);
  return new Map(groupTodaysRacingRows(rows).flatMap((meeting) =>
    meeting.races.map((race) => [race.raceId, race] as const)
  ));
}

function raceIdentity(race: TrackerData["races"][number]) {
  return race.raceId ? `id:${race.raceId}` : `key:${race.raceDate}|${race.course.toLocaleLowerCase("en-GB")}|${race.raceTime}`;
}
