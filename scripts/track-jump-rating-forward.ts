import { createDbConnection } from "@/db";
import {
  buildJumpRatingForwardRace,
  JUMP_RATING_FORWARD_PATH,
  loadJumpRatingForward,
  pendingJumpRatingRaceIds,
  renderJumpRatingToday,
  saveJumpRatingForward,
  settlePendingJumpRatingRaces,
  summarizeJumpRatingForward,
  upsertJumpRatingForwardRaces,
  type JumpRatingForwardData,
} from "@/lib/racing/jump-rating-forward";
import {
  getLocalRacingDate,
  getRacecardRowsForRaceIds,
  getTodaysRacingData,
  groupTodaysRacingRows,
  isJumpRaceForDisplay,
  type TodayRace,
} from "@/lib/racing/todays-racing";

const command = process.argv[2] ?? "summary";
const raceDate = process.argv[3] ?? getLocalRacingDate();

if (command === "sync") await sync(raceDate);
else if (command === "today") await today(raceDate);
else if (command === "summary") await summary();
else throw new Error("Usage: track-jump-rating-forward.ts <sync|today|summary> [YYYY-MM-DD]");

async function sync(date: string) {
  const startedAt = performance.now();
  const now = new Date();
  const connection = createDbConnection();
  try {
    const existing = await loadJumpRatingForward();
    const pendingBefore = pendingJumpRatingRaceIds(existing);
    const settlementStartedAt = performance.now();
    const priorSettlement = await settlePendingFromDb(connection.db, existing, now);
    let settlementMs = performance.now() - settlementStartedAt;
    const todayData = await getTodaysRacingData(connection.db, date, {
      raceFilter: isJumpRaceForDisplay,
    });
    if (todayData.status !== "ok") throw new Error(todayData.message);
    const candidates = todayData.meetings.flatMap((meeting) => meeting.races
      .map((race) => buildJumpRatingForwardRace({
        raceDate: date,
        course: meeting.courseName,
        race,
        recordedAt: now,
      }))
      .filter((race): race is NonNullable<typeof race> => race !== null));
    let updated = upsertJumpRatingForwardRaces(priorSettlement.data, candidates);
    const todayRaces = new Map(todayData.meetings.flatMap((meeting) =>
      meeting.races.map((race) => [race.raceId, race] as const)
    ));
    const currentSettlementStartedAt = performance.now();
    const currentSettlement = settlePendingJumpRatingRaces(updated, todayRaces, now);
    settlementMs += performance.now() - currentSettlementStartedAt;
    updated = currentSettlement.data;
    if (JSON.stringify(updated) !== JSON.stringify(existing)) {
      await saveJumpRatingForward(updated);
    }
    const existingIds = new Set(existing.races.map((race) => race.raceId));
    const created = updated.races.filter((race) => !existingIds.has(race.raceId));
    console.log([
      `JUMP_RATING_SYNC date=${date}`,
      `tracked=${updated.races.length}`,
      `clean_created=${created.length}`,
      `pending_before=${pendingBefore.length}`,
      `settled_from_pending=${priorSettlement.settled}`,
      `settled_current=${currentSettlement.settled}`,
      `settlement_queries=${priorSettlement.queryCount}`,
      `settlement_ms=${Math.round(settlementMs)}`,
      `elapsed_ms=${Math.round(performance.now() - startedAt)}`,
    ].join(" "));
  } finally {
    await connection.client.end();
  }
}

async function today(date: string) {
  const connection = createDbConnection();
  try {
    const data = await getTodaysRacingData(connection.db, date, {
      raceFilter: isJumpRaceForDisplay,
    });
    if (data.status !== "ok") throw new Error(data.message);
    console.log(renderJumpRatingToday(data.meetings, date));
  } finally {
    await connection.client.end();
  }
}

async function summary() {
  const data = await loadJumpRatingForward();
  const value = summarizeJumpRatingForward(data);
  console.log("# Jump Rating Forward Summary\n");
  console.log(`Data: ${JUMP_RATING_FORWARD_PATH}`);
  console.log(`Forward start timestamp: ${data.forwardStartAt}`);
  console.log(`JPR-A: ${data.jprAVersion}`);
  console.log(`JPR-B: ${data.jprBVersion}\n`);
  console.log(`Clean races: ${value.cleanRaces}`);
  console.log(`Pending: ${value.pending}`);
  console.log(`Settled: ${value.settled}`);
  printCandidate("JPR-A", value.jprA);
  printCandidate("JPR-B", value.jprB);
  console.log(`OR agreement: ${value.orAgreement.agreements}/${value.orAgreement.eligible}`);
  console.log("\nSubtype | Races | Pending | Settled | JPR-A rank-1 strike | JPR-A top-3 capture");
  console.log("---|---:|---:|---:|---:|---:");
  for (const subtype of value.subtypes) {
    console.log(`${subtype.subtype} | ${subtype.races} | ${subtype.pending} | ${subtype.settled} | ${pct(subtype.jprARank1Strike)} | ${pct(subtype.jprATop3Capture)}`);
  }
  console.log("\nDescriptive forward validation only. No profitability claim is supported without a meaningful settled sample.");
}

async function settlePendingFromDb(
  db: ReturnType<typeof createDbConnection>["db"],
  data: JumpRatingForwardData,
  settledAt: Date,
) {
  const raceIds = pendingJumpRatingRaceIds(data);
  if (raceIds.length === 0) return { data, settled: 0, queryCount: 0 };
  const rows = await getRacecardRowsForRaceIds(db, raceIds);
  const races = new Map<string, TodayRace>(
    groupTodaysRacingRows(rows).flatMap((meeting) =>
      meeting.races.map((race) => [race.raceId, race] as const)
    ),
  );
  return { ...settlePendingJumpRatingRaces(data, races, settledAt), queryCount: 1 };
}

function printCandidate(
  label: string,
  value: ReturnType<typeof summarizeJumpRatingForward>["jprA"],
) {
  console.log(`${label} rank-1 selections: ${value.rank1Winners}/${value.rank1Selections} (${pct(value.rank1Strike)})`);
  console.log(`${label} rank-1 denominator: ${value.rank1Selections} settled, non-void selections; voided rank-1 selections: ${value.voidRank1Selections}; tied rank-1 races: ${value.rank1TiedRaces}`);
  console.log(`${label} top-3 capture: ${pct(value.top3Capture)} (${value.coveredRaces} covered races)`);
}

function pct(value: number | null) {
  return value === null ? "-" : `${(value * 100).toFixed(1)}%`;
}
