import { createDbConnection } from "@/db";
import { currentDayProspectiveCapture } from "@/lib/racing/current-day-sync";
import { loadHurdlePair, renderHurdlePairDay, renderHurdlePairSummary } from "@/lib/racing/hurdle-tissue-challenger-forward";
import { syncHurdlePairMeetings } from "@/lib/racing/hurdle-tissue-challenger-sync";
import { getLocalRacingDate, getTodaysRacingData } from "@/lib/racing/todays-racing";
import { jumpTissueSubtype } from "@/lib/racing/jump-tissue-model";

const command = process.argv[2] ?? "summary";
const date = process.argv[3] ?? getLocalRacingDate();
if (command === "summary") {
  console.log(renderHurdlePairSummary(await loadHurdlePair()));
} else if (command === "today" || command === "results") {
  console.log(renderHurdlePairDay(await loadHurdlePair(), date, command === "results"));
} else if (command === "sync") {
  if (date !== getLocalRacingDate()) throw new Error("Hurdle paired sync only accepts today's local racing date; no backfill.");
  const connection = createDbConnection();
  try {
    const before = await loadHurdlePair();
    const cards = currentDayProspectiveCapture(await getTodaysRacingData(connection.db, date, { raceFilter: (race) => jumpTissueSubtype(race).code === "hurdle" }));
    const updated = cards.skipped ? before : await syncHurdlePairMeetings(connection, cards.meetings, date);
    console.log(`HURDLE_PAIR_SYNC date=${date} created=${updated.races.length - before.races.length} tracked=${updated.races.length}`);
    if (cards.skipped) console.log(cards.message);
    console.log(renderHurdlePairDay(updated, date));
  } finally { await connection.client.end(); }
} else {
  throw new Error("Usage: track-hurdle-tissue-paired.ts <sync|today|summary|results> [YYYY-MM-DD]");
}
