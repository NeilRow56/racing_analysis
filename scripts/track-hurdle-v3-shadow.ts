import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { createDbConnection } from "@/db";
import { initializeHurdleV3Shadow, loadHurdleV3Shadow } from "@/lib/racing/hurdle-v3-shadow";
import { summarizeHurdleV3Shadow } from "@/lib/racing/hurdle-v3-shadow-metrics";
import { pendingHurdleV3ShadowRaceIds, settleHurdleV3ShadowResults } from "@/lib/racing/hurdle-v3-shadow-sync";
import { getLocalRacingDate, getRacecardRowsForRaceIds, getTodaysRacingData, groupTodaysRacingRows } from "@/lib/racing/todays-racing";
import { syncTissueGeneration } from "@/lib/racing/tissue-generation-sync";
import { classifyJumpRaceSubtype } from "@/lib/racing/jump-speed-rating";

export async function main(args: string[]) {
  const command = args[0] ?? "summary";
  if (args.length > 1 || !["init", "sync", "results", "summary"].includes(command)) throw new Error("Usage: track-hurdle-v3-shadow.ts init|sync|results|summary (current day only; no backfill)");
  if (command === "init") await initializeHurdleV3Shadow();
  if (command === "sync" || command === "results") {
    if (!await loadHurdleV3Shadow()) throw new Error("Initialize the shadow ledger first");
    const connection = createDbConnection();
    try {
      if (command === "sync") {
        const date = getLocalRacingDate(), cards = await getTodaysRacingData(connection.db, date, { raceFilter: r => classifyJumpRaceSubtype(r) === "hurdle" });
        // Normal production capture, newly accepted books only. No force refresh and no replay of old books.
        if (cards.status === "ok" && cards.meetings.some(m => m.races.length)) await syncTissueGeneration(connection, cards.meetings, date);
        else console.log(`No current-day Hurdle racecards available for ${date}; capture skipped.`);
      } else {
        const ids = await pendingHurdleV3ShadowRaceIds();
        const races = ids.length ? groupTodaysRacingRows(await getRacecardRowsForRaceIds(connection.db, ids)).flatMap(m => m.races) : [];
        await settleHurdleV3ShadowResults(new Map(races.map(r => [r.raceId, r])));
      }
    } finally { await connection.client.end(); }
  }
  const data = await loadHurdleV3Shadow();
  console.log(`V2 STATUS:\nLIVE PRODUCTION\n\nV3 STATUS:\n${data ? "PROSPECTIVE SHADOW" : "NOT ARMED"}\n\nV3 SHADOW EPOCH:\n${data?.epoch ?? "PENDING FIRST GENUINE PRE-OFF CAPTURE"}\n\nV3 HASH:\n${data?.v3Hash ?? "NOT ARMED"}\n\nHISTORICAL BACKFILL:\nNONE\n\nLED/MADE-ALL:\nFROZEN OBSERVATION ONLY\n\nPU:\nOBSERVATION ONLY\n\nFIRST PROSPECTIVE OBSERVATIONS:\n${data?.observations.length ?? 0}\n\nPRODUCTION MODEL CHANGED:\nNO`);
  console.log(JSON.stringify(summarizeHurdleV3Shadow(data), null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main(process.argv.slice(2));
