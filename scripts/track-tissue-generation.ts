import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { createDbConnection } from "@/db";
import { getLocalRacingDate, getTodaysRacingData } from "@/lib/racing/todays-racing";
import { loadTissueGeneration, summarizeTissueGeneration } from "@/lib/racing/tissue-generation-forward";
import { syncTissueGeneration } from "@/lib/racing/tissue-generation-sync";
import { TISSUE_GENERATION, TISSUE_GENERATION_EPOCH } from "@/lib/racing/tissue-generation-config";
export async function main(args: string[]) {
  const forceRefresh = args.includes("--force-refresh");
  args = args.filter(arg => arg !== "--force-refresh");
  const command = args[0] ?? "summary", date = args[1] ?? getLocalRacingDate();
  if (args.length > 2 || !["summary", "sync", "results"].includes(command) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Use summary|sync|results [YYYY-MM-DD] [--force-refresh]");
  let data = await loadTissueGeneration();
  if (command !== "summary") {
    const connection = createDbConnection();
    try {
      const today = command === "sync" && date === getLocalRacingDate() ? await getTodaysRacingData(connection.db, date) : null;
      data = await syncTissueGeneration(connection, today?.status === "ok" ? today.meetings : [], date, command === "sync", forceRefresh);
    } finally { await connection.client.end(); }
  }
  console.log(`GENERATION: ${TISSUE_GENERATION}\nEPOCH: ${TISSUE_GENERATION_EPOCH}\nNO BACKFILL\nCAPTURED RACES: ${data.races.length}`);
  for (const group of summarizeTissueGeneration(data)) { console.log(`TISSUE ${group.rank}`); console.table(group.rows); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main(process.argv.slice(2));
