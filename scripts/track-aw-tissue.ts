import { createDbConnection } from "@/db";
import { loadAwTissueForward, renderAwTissueSummary, renderAwTissueToday } from "@/lib/racing/aw-tissue-forward";
import { syncAwTissueMeetings } from "@/lib/racing/aw-tissue-sync";
import { loadAwV2Forward } from "@/lib/racing/aw-tissue-v2";
import { AW_TISSUE_V2_ACTIVE } from "@/lib/racing/aw-tissue-v2-activation";
import { currentDayProspectiveCapture } from "@/lib/racing/current-day-sync";
import { getLocalRacingDate, getSportingLifeCurrentPricesForDate, getTodaysRacingData, isAllWeatherRaceForDisplay } from "@/lib/racing/todays-racing";

const command = process.argv[2] ?? "summary";
const legacy = process.argv[3] === "v1";
const raceDate = legacy ? getLocalRacingDate() : process.argv[3] ?? getLocalRacingDate();
const readForward = legacy || !AW_TISSUE_V2_ACTIVE ? loadAwTissueForward : loadAwV2Forward;
if (command === "summary") console.log(renderAwTissueSummary(await readForward()));
else if (command === "today") {
  const connection = createDbConnection();
  try {
    console.log(renderAwTissueToday(await readForward(), raceDate, await getSportingLifeCurrentPricesForDate(connection.db, raceDate)));
  } finally { await connection.client.end(); }
}
else if (command === "sync") {
  if (legacy) throw new Error("Archived v1 CLI is read-only; use summary v1");
  const connection = createDbConnection();
  try {
    const before = await readForward();
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
