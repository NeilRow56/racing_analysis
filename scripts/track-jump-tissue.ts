import { createDbConnection } from "@/db";
import { loadForwardValueData } from "@/lib/racing/forward-value";
import { currentDayProspectiveCapture } from "@/lib/racing/current-day-sync";
import { loadJumpTissueForward, renderJumpTissueSummary, renderJumpTissueToday, renderJumpTissueValue } from "@/lib/racing/jump-tissue-forward";
import { syncJumpTissueMeetings } from "@/lib/racing/jump-tissue-sync";
import { getLocalRacingDate, getSportingLifeCurrentPricesForDate, getTodaysRacingData, isJumpRaceForDisplay } from "@/lib/racing/todays-racing";

const command = process.argv[2] ?? "summary";
const raceDate = process.argv[3] ?? getLocalRacingDate();

if (command === "summary") {
  console.log(renderJumpTissueSummary(await loadJumpTissueForward()));
} else if (command === "today") {
  const connection = createDbConnection();
  try {
    console.log(renderJumpTissueToday(await loadJumpTissueForward(), raceDate, await getSportingLifeCurrentPricesForDate(connection.db, raceDate)));
  } finally {
    await connection.client.end();
  }
} else if (command === "sync") {
  const connection = createDbConnection();
  try {
    const before = await loadJumpTissueForward();
    const [today, currentPrices] = await Promise.all([
      getTodaysRacingData(connection.db, raceDate, { raceFilter: isJumpRaceForDisplay }),
      getSportingLifeCurrentPricesForDate(connection.db, raceDate),
    ]);
    const capture = currentDayProspectiveCapture(today);
    const updated = await syncJumpTissueMeetings(connection, capture.meetings, raceDate);
    console.log(`JUMP_TISSUE_SYNC date=${raceDate} created=${updated.races.length - before.races.length} tracked=${updated.races.length} settled=${updated.races.filter((race) => race.settledAt !== null).length}`);
    if (capture.skipped) console.log(capture.message);
    console.log(renderJumpTissueToday(updated, raceDate, currentPrices));
  } finally {
    await connection.client.end();
  }
} else if (command === "value") {
  const [tissue, value] = await Promise.all([loadJumpTissueForward(), loadForwardValueData()]);
  console.log(renderJumpTissueValue(tissue, value.races, process.argv[3]));
} else {
  throw new Error("Usage: track-jump-tissue.ts <today|sync|summary|value> [YYYY-MM-DD]");
}
