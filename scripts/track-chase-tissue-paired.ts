import { createDbConnection } from "@/db";
import { currentDayProspectiveCapture } from "@/lib/racing/current-day-sync";
import { loadChasePair, renderChasePairDay, renderChasePairSummary } from "@/lib/racing/chase-tissue-challenger-forward";
import { syncChasePairMeetings } from "@/lib/racing/chase-tissue-challenger-sync";
import { getLocalRacingDate, getTodaysRacingData } from "@/lib/racing/todays-racing";
import { jumpTissueSubtype } from "@/lib/racing/jump-tissue-model";

const command = process.argv[2] ?? "summary";
const date = process.argv[3] ?? getLocalRacingDate();
if (command === "summary") {
  console.log(renderChasePairSummary(await loadChasePair()));
} else if (command === "today" || command === "results") {
  console.log(renderChasePairDay(await loadChasePair(), date, command === "results"));
} else if (command === "sync") {
  if (date !== getLocalRacingDate()) throw new Error("Chase paired sync only accepts today's local racing date; no backfill.");
  const connection = createDbConnection();
  try {
    const before = await loadChasePair();
    const cards = currentDayProspectiveCapture(await getTodaysRacingData(connection.db, date, { raceFilter: (race) => jumpTissueSubtype(race).code === "chase" }));
    const updated = cards.skipped ? before : await syncChasePairMeetings(connection, cards.meetings, date);
    console.log(`CHASE_PAIR_SYNC date=${date} created=${updated.races.length - before.races.length} tracked=${updated.races.length}`);
    if (cards.skipped) console.log(cards.message);
    console.log(renderChasePairDay(updated, date));
  } finally { await connection.client.end(); }
} else {
  throw new Error("Usage: track-chase-tissue-paired.ts <sync|today|summary|results> [YYYY-MM-DD]");
}
