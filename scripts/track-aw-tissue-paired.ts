import { createDbConnection } from "@/db";
import { currentDayProspectiveCapture } from "@/lib/racing/current-day-sync";
import { loadAwTissuePairedForward, renderAwTissuePairedCompact, renderAwTissuePairedResults, renderAwTissuePairedSummary, renderAwTissuePairedToday } from "@/lib/racing/aw-tissue-paired-forward";
import { syncAwTissuePairedMeetings } from "@/lib/racing/aw-tissue-paired-sync";
import { getLocalRacingDate, getSportingLifeCurrentPricesForDate, getTodaysRacingData, isAllWeatherRaceForDisplay } from "@/lib/racing/todays-racing";

const command = process.argv[2] ?? "summary";
const raceDate = process.argv[3] ?? getLocalRacingDate();

if (command === "summary") {
  console.log(renderAwTissuePairedSummary(await loadAwTissuePairedForward()));
} else if (command === "today") {
  const connection = createDbConnection();
  try {
    console.log(renderAwTissuePairedToday(await loadAwTissuePairedForward(), raceDate, await getSportingLifeCurrentPricesForDate(connection.db, raceDate)));
  } finally {
    await connection.client.end();
  }
} else if (command === "compact") {
  console.log(renderAwTissuePairedCompact(await loadAwTissuePairedForward(), raceDate));
} else if (command === "results") {
  console.log(renderAwTissuePairedResults(await loadAwTissuePairedForward(), raceDate));
} else if (command === "sync") {
  const connection = createDbConnection();
  try {
    const before = await loadAwTissuePairedForward();
    const [today, currentPrices] = await Promise.all([
      getTodaysRacingData(connection.db, raceDate, { raceFilter: isAllWeatherRaceForDisplay }),
      getSportingLifeCurrentPricesForDate(connection.db, raceDate),
    ]);
    const capture = currentDayProspectiveCapture(today);
    const updated = capture.skipped ? before : await syncAwTissuePairedMeetings(connection, capture.meetings, raceDate);
    console.log(`AW_TISSUE_PAIR_SYNC date=${raceDate} created=${updated.races.length - before.races.length} tracked=${updated.races.length} settled=${updated.races.filter((race) => race.settledAt !== null).length}`);
    if (capture.skipped) console.log(capture.message);
    console.log(renderAwTissuePairedToday(updated, raceDate, currentPrices));
  } finally {
    await connection.client.end();
  }
} else {
  throw new Error("Usage: track-aw-tissue-paired.ts <today|compact|results|sync|summary> [YYYY-MM-DD]");
}
