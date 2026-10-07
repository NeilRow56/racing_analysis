import { createDbConnection } from "@/db";
import { loadAwTissueForward, renderAwTissueSummary, renderAwTissueToday } from "@/lib/racing/aw-tissue-forward";
import { syncAwTissueMeetings } from "@/lib/racing/aw-tissue-sync";
import { currentDayProspectiveCapture } from "@/lib/racing/current-day-sync";
import { getLocalRacingDate, getSportingLifeCurrentPricesForDate, getTodaysRacingData, isAllWeatherRaceForDisplay } from "@/lib/racing/todays-racing";

const command = process.argv[2] ?? "summary";
const raceDate = process.argv[3] ?? getLocalRacingDate();
if (command === "summary") console.log(renderAwTissueSummary(await loadAwTissueForward()));
else if (command === "today") {
  const connection = createDbConnection();
  try {
    console.log(renderAwTissueToday(await loadAwTissueForward(), raceDate, await getSportingLifeCurrentPricesForDate(connection.db, raceDate)));
  } finally { await connection.client.end(); }
}
else if (command === "sync") {
  const connection = createDbConnection();
  try {
    const before = await loadAwTissueForward();
    const [today, currentPrices] = await Promise.all([
      getTodaysRacingData(connection.db, raceDate, { raceFilter: isAllWeatherRaceForDisplay }),
      getSportingLifeCurrentPricesForDate(connection.db, raceDate),
    ]);
    const capture = currentDayProspectiveCapture(today);
    const updated = await syncAwTissueMeetings(connection, capture.meetings, raceDate);
    console.log(`AW_TISSUE_SYNC date=${raceDate} created=${updated.races.length - before.races.length} tracked=${updated.races.length} settled=${updated.races.filter((r) => r.settledAt !== null).length}`);
    if (capture.skipped) console.log(capture.message);
    console.log(renderAwTissueToday(updated, raceDate, currentPrices));
  } finally { await connection.client.end(); }
} else throw new Error("Usage: track-aw-tissue.ts <today|sync|summary> [YYYY-MM-DD]");
