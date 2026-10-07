import { createDbConnection } from "@/db";
import {
  AW_RATING_FORWARD_PATH,
  buildAwRatingForwardRace,
  loadAwRatingForward,
  pendingAwRatingRaceIds,
  renderAwRatingToday,
  saveAwRatingForward,
  settlePendingAwRatingRaces,
  summarizeAwRatingForward,
  upsertAwRatingForwardRaces,
  type AwRatingForwardData,
} from "@/lib/racing/aw-rating-forward";
import {
  getLocalRacingDate,
  getRacecardRowsForRaceIds,
  getTodaysRacingData,
  groupTodaysRacingRows,
  isAllWeatherRaceForDisplay,
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

const command = process.argv[2] ?? "summary";
const raceDate = process.argv[3] ?? getLocalRacingDate();

if (command === "sync") await sync(raceDate);
else if (command === "today") await today(raceDate);
else if (command === "summary") await summary();
else throw new Error("Usage: track-aw-rating-forward.ts <sync|today|summary> [YYYY-MM-DD]");

async function sync(date: string) {
  const startedAt = performance.now();
  const now = new Date();
  const connection = createDbConnection();
  try {
    const [existing, existingValue] = await Promise.all([
      loadAwRatingForward(), loadForwardValueData(),
    ]);
    const pendingBefore = pendingAwRatingRaceIds(existing);
    const valuePending = pendingForwardValueRaceIds(existingValue, "aw");
    const valuePriorRaces = await loadRacesByIds(connection.db, valuePending);
    const settlementStartedAt = performance.now();
    const priorSettlement = await settlePendingFromDb(connection.db, existing, now);
    let settlementMs = performance.now() - settlementStartedAt;
    if (JSON.stringify(priorSettlement.data) !== JSON.stringify(existing)) {
      await saveAwRatingForward(priorSettlement.data);
    }
    let valueSettled = 0;
    await mutateForwardValueData((latest) => {
      const valuePrior = settleForwardValueRecords(latest, valuePriorRaces, now);
      valueSettled = valuePrior.settled;
      return valuePrior.data;
    });
    const todayData = await getTodaysRacingData(connection.db, date, {
      raceFilter: isAllWeatherRaceForDisplay,
    });
    const capture = currentDayProspectiveCapture(todayData);
    const meetings = capture.meetings;
    if (capture.skipped) {
      console.log([
        `AW_RATING_SYNC date=${date}`,
        `tracked=${priorSettlement.data.races.length}`,
        `pending_before=${pendingBefore.length}`,
        `settled_pending=${priorSettlement.settled}`,
        `settlement_queries=${priorSettlement.queryCount}`,
        `settlement_ms=${Math.round(settlementMs)}`,
        `elapsed_ms=${Math.round(performance.now() - startedAt)}`,
        `value_settled=${valueSettled}`,
      ].join(" "));
      console.log(capture.message);
      return;
    }
    const calibration = await loadForwardValueCalibration();
    const candidates = meetings.flatMap((meeting) => meeting.races
      .map((race) => buildAwRatingForwardRace({
        raceDate: date,
        course: meeting.courseName,
        race,
        recordedAt: now,
      }))
      .filter((race): race is NonNullable<typeof race> => race !== null));
    let updated = upsertAwRatingForwardRaces(priorSettlement.data, candidates);
    const todayRaces = new Map(meetings.flatMap((meeting) =>
      meeting.races.map((race) => [race.raceId, race] as const)
    ));
    const currentSettlementStartedAt = performance.now();
    const currentSettlement = settlePendingAwRatingRaces(updated, todayRaces, now);
    settlementMs += performance.now() - currentSettlementStartedAt;
    updated = currentSettlement.data;
    if (JSON.stringify(updated) !== JSON.stringify(existing)) {
      await saveAwRatingForward(updated);
    }
    const valueCandidates = buildForwardValueRecordsFromMeetings({
      family: "aw", raceDate: date, meetings,
      calibration: calibration.families.aw, recordedAt: now,
    });
    const updatedValue = await mutateForwardValueData((latest) => {
      const valueCaptured = upsertForwardValueRecords(latest, valueCandidates);
      const valueEnriched = enrichForwardValuePriceSnapshots(valueCaptured, {
        family: "aw", meetings, capturedAt: now,
      });
      const valueCurrent = settleForwardValueRecords(valueEnriched, todayRaces, now);
      valueSettled += valueCurrent.settled;
      return valueCurrent.data;
    });
    const existingIds = new Set(existing.races.map((race) => race.raceId));
    const created = updated.races.filter((race) => !existingIds.has(race.raceId));
    console.log([
      `AW_RATING_SYNC date=${date}`,
      `tracked=${updated.races.length}`,
      `clean_created=${created.length}`,
      `pending_before=${pendingBefore.length}`,
      `settled_from_pending=${priorSettlement.settled}`,
      `settled_current=${currentSettlement.settled}`,
      `settlement_queries=${priorSettlement.queryCount}`,
      `settlement_ms=${Math.round(settlementMs)}`,
      `elapsed_ms=${Math.round(performance.now() - startedAt)}`,
      `value_created=${updatedValue.races.length - existingValue.races.length}`,
      `value_settled=${valueSettled}`,
    ].join(" "));
  } finally {
    await connection.client.end();
  }
}

async function loadRacesByIds(
  db: ReturnType<typeof createDbConnection>["db"],
  raceIds: string[],
) {
  if (raceIds.length === 0) return new Map<string, TodayRace>();
  const rows = await getRacecardRowsForRaceIds(db, raceIds);
  return new Map<string, TodayRace>(groupTodaysRacingRows(rows).flatMap((meeting) =>
    meeting.races.map((race) => [race.raceId, race] as const)
  ));
}

async function today(date: string) {
  const connection = createDbConnection();
  try {
    const data = await getTodaysRacingData(connection.db, date, {
      raceFilter: isAllWeatherRaceForDisplay,
    });
    if (data.status !== "ok") {
      console.log(`AW Rating Today - ${date}\n\n${data.message}`);
      return;
    }
    console.log(renderAwRatingToday(data.meetings, date));
  } finally {
    await connection.client.end();
  }
}

async function summary() {
  const data = await loadAwRatingForward();
  const value = summarizeAwRatingForward(data);
  console.log("# AW Rating Forward Summary\n");
  console.log(`Data: ${AW_RATING_FORWARD_PATH}`);
  console.log(`Forward start timestamp: ${data.forwardStartAt}`);
  console.log(`AW-D: ${data.awDVersion}`);
  console.log(`AW-A: ${data.awAVersion}\n`);
  console.log(`Clean races: ${value.cleanRaces}`);
  console.log(`Pending: ${value.pending}`);
  console.log(`Settled: ${value.settled}`);
  printCandidate("AW-D", value.awD);
  printCandidate("AW-A", value.awA);
  console.log(`Rank-1 agreement: ${value.rank1Agreement.agreements}/${value.rank1Agreement.eligible}`);
  console.log(`Zero-history: ${value.zeroHistory.runners} runners in ${value.zeroHistory.races} races; ${value.zeroHistory.settledWinners} settled winners`);
  console.log(`Zero-history unrated: AW-D ${value.zeroHistory.unratedByAwD}, AW-A ${value.zeroHistory.unratedByAwA}`);
  printContexts("Handicap status", value.handicap);
  printContexts("Distance", value.distance);
  console.log("\nDescriptive forward validation only. No inference is supported without a meaningful settled sample.");
}

async function settlePendingFromDb(
  db: ReturnType<typeof createDbConnection>["db"],
  data: AwRatingForwardData,
  settledAt: Date,
) {
  const raceIds = pendingAwRatingRaceIds(data);
  if (raceIds.length === 0) return { data, settled: 0, queryCount: 0 };
  const rows = await getRacecardRowsForRaceIds(db, raceIds);
  const races = new Map<string, TodayRace>(
    groupTodaysRacingRows(rows).flatMap((meeting) =>
      meeting.races.map((race) => [race.raceId, race] as const)
    ),
  );
  return { ...settlePendingAwRatingRaces(data, races, settledAt), queryCount: 1 };
}

function printCandidate(
  label: string,
  value: ReturnType<typeof summarizeAwRatingForward>["awD"],
) {
  console.log(`${label} rank-1: ${value.rank1Winners}/${value.rank1Selections} (${pct(value.rank1Strike)})`);
  console.log(`${label} top-3 capture: ${pct(value.top3Capture)} (${value.coveredRaces} covered races)`);
}

function printContexts(
  label: string,
  values: Array<{
    context: unknown;
    races: number;
    pending: number;
    settled: number;
    awDRank1Strike: number | null;
    awDTop3Capture: number | null;
    awARank1Strike: number | null;
    awATop3Capture: number | null;
  }>,
) {
  console.log(`\n${label} | Races | Pending | Settled | AW-D strike | AW-D top 3 | AW-A strike | AW-A top 3`);
  console.log("---|---:|---:|---:|---:|---:|---:|---:");
  for (const value of values) {
    console.log(`${String(value.context)} | ${value.races} | ${value.pending} | ${value.settled} | ${pct(value.awDRank1Strike)} | ${pct(value.awDTop3Capture)} | ${pct(value.awARank1Strike)} | ${pct(value.awATop3Capture)}`);
  }
}

function pct(value: number | null) {
  return value === null ? "-" : `${(value * 100).toFixed(1)}%`;
}
