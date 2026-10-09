import { createDbConnection } from "@/db";
import { currentDayProspectiveCapture } from "@/lib/racing/current-day-sync";
import { appendTodaysRatingWeightObservations, buildTodaysRatingWeightObservations, loadTodaysRatingWeightForward,
  mutateTodaysRatingWeightForward, pendingTodaysRatingWeightRaceIds, refreshTodaysRatingWeightMarkets,
  renderTodaysRatingWeightSummary, renderTodaysRatingWeightToday, updateTodaysRatingWeightSettlements } from "@/lib/racing/todays-rating-weight-forward";
import { loadTodaysRatingWeightPriors } from "@/lib/racing/todays-rating-weight-prior";
import { getLocalRacingDate, getRacecardRowsForRaceIds, getTodaysRacingData, groupTodaysRacingRows,
  isOrdinaryFlatTurfRaceForDisplay, isValidRacingDate, type TodayMeeting, type TodayRace } from "@/lib/racing/todays-racing";

const command = process.argv[2] ?? "summary";
const date = process.argv[3] ?? getLocalRacingDate();
if (!isValidRacingDate(date)) throw new Error("Expected YYYY-MM-DD.");
if (command === "summary") console.log(renderTodaysRatingWeightSummary(await loadTodaysRatingWeightForward()));
else if (command === "today") console.log(renderTodaysRatingWeightToday(await loadTodaysRatingWeightForward(), date));
else if (command === "sync") await sync(date);
else throw new Error("Usage: track-todays-rating-weight-forward.ts <sync|today|summary> [YYYY-MM-DD]");

async function sync(raceDate: string) {
  const started = performance.now();
  const progress = (message: string) => console.log(`[Today's Rating weight +${((performance.now() - started) / 1000).toFixed(1)}s] ${message}`);
  const heartbeat = setInterval(() => progress("Sync still running"), 15_000);
  heartbeat.unref();
  const connection = createDbConnection();
  try {
    const before = await loadTodaysRatingWeightForward();
    const pending = pendingTodaysRatingWeightRaceIds(before);
    const rows = pending.length ? await getRacecardRowsForRaceIds(connection.db, pending) : [];
    const results = raceMap(groupTodaysRacingRows(rows));
    let meetings: TodayMeeting[] = [];
    if (raceDate === getLocalRacingDate()) {
      progress("Loading current Turf cards and metrics");
      const capture = currentDayProspectiveCapture(await getTodaysRacingData(connection.db, raceDate,
        { raceFilter: isOrdinaryFlatTurfRaceForDisplay, onTiming: (name, ms) => progress(`${name}: ${Math.round(ms)}ms`) }));
      meetings = capture.meetings;
      if (capture.skipped) progress(capture.message);
    } else progress("Capture skipped: only today's genuinely prospective cards qualify. Pending selections will still be settled.");
    progress("Loading latest usable prior Turf performances");
    const priors = await loadTodaysRatingWeightPriors(connection.db, meetings);
    const currentRaces = raceMap(meetings);
    const updated = await mutateTodaysRatingWeightForward((latest) => {
      // Timestamp after all loading and lock acquisition, so elapsed loading cannot create a post-off capture.
      const now = new Date();
      let next = updateTodaysRatingWeightSettlements(latest, results, now).data;
      next = appendTodaysRatingWeightObservations(next, buildTodaysRatingWeightObservations({ meetings, raceDate, priorByRunner: priors, recordedAt: now }));
      next = refreshTodaysRatingWeightMarkets(next, currentRaces, now);
      return updateTodaysRatingWeightSettlements(next, currentRaces, now).data;
    });
    progress(`Captured ${updated.observations.length - before.observations.length} new qualifiers; tracked ${updated.observations.length}`);
    console.log(renderTodaysRatingWeightToday(updated, raceDate));
  } finally { clearInterval(heartbeat); await connection.client.end(); }
}

function raceMap(meetings: TodayMeeting[]): Map<string, TodayRace> {
  return new Map(meetings.flatMap((meeting) => meeting.races.map((race) => [race.raceId, race] as const)));
}
