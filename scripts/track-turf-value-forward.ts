import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { createDbConnection } from "@/db";
import { currentDayProspectiveCapture } from "@/lib/racing/current-day-sync";
import { getLocalRacingDate, getRacecardRowsForRaceIds, getTodaysRacingData, groupTodaysRacingRows, isOrdinaryFlatTurfRaceForDisplay } from "@/lib/racing/todays-racing";
import { loadTurfTissueCaptureHistory } from "@/lib/racing/turf-tissue-sync";
import { loadJumpTissueCommentsForRaces } from "@/lib/racing/jump-tissue-sync";
import { loadFrozenTissueModel, TISSUE_V3_CONFIG } from "@/lib/racing/tissue-forward";
import { buildTurfValueRaces, appendTurfValue, loadTurfValue, mutateTurfValue, settleTurfValue, TURF_VALUE_EPOCH } from "@/lib/racing/turf-value-forward";
import { summarizeValueBands } from "@/lib/racing/tissue-value-metrics";
import { isValidDate } from "./run-research-workflow";

export async function main(args: string[]) {
  const command = args[0] ?? "summary", date = args[1] ?? getLocalRacingDate();
  if (!["sync", "results", "summary"].includes(command) || args.length > 2 || !isValidDate(date))
    throw new Error("Usage: track-turf-value-forward.ts <sync|results|summary> [YYYY-MM-DD]");
  let data = await loadTurfValue();
  const startedAt = new Date();
  // Historical date arguments may settle existing books, but can never load capture inputs.
  const captureAllowed = command === "sync" && date === getLocalRacingDate(startedAt) && startedAt >= new Date(TURF_VALUE_EPOCH);
  if (command === "sync" && !captureAllowed) console.log("Capture skipped: current-day post-activation pre-race observations only; no backfill.");
  if (captureAllowed || (command !== "summary" && data.races.some(r => r.runners.some(row => row.outcome === null)))) {
    const connection = createDbConnection();
    try {
      let additions: ReturnType<typeof buildTurfValueRaces> = [];
      if (captureAllowed) {
        const today = await getTodaysRacingData(connection.db, date, { raceFilter: isOrdinaryFlatTurfRaceForDisplay });
        const capture = currentDayProspectiveCapture(today);
        if (capture.skipped) console.log(capture.message);
        const known = new Set(data.races.map(r => r.raceId));
        const uncaptured = capture.meetings.map(m => ({ ...m, races: m.races.filter(r => !known.has(r.raceId)) }));
        const meetings = await loadTurfTissueCaptureHistory(connection.db, uncaptured, date, startedAt);
        const [model, commentsByHorse] = await Promise.all([
          loadFrozenTissueModel(TISSUE_V3_CONFIG.modelPath, TISSUE_V3_CONFIG.modelVersion),
          // Query comments using the history cutoff, not the later scheduled off.
          loadJumpTissueCommentsForRaces(connection.client, meetings.flatMap(m => m.races.map(r => ({ ...r, raceDateTime: startedAt })))),
        ]);
        additions = buildTurfValueRaces({ meetings, model, commentsByHorse, raceDate: date, capturedAt: new Date() });
      }
      data = await mutateTurfValue(async latest => {
        const appended = appendTurfValue(latest, additions);
        const ids = appended.races.filter(r => r.runners.some(row => row.outcome === null)).map(r => r.raceId);
        if (!ids.length) return appended;
        const results = new Map(groupTodaysRacingRows(await getRacecardRowsForRaceIds(connection.db, ids)).flatMap(m => m.races.map(r => [r.raceId, r] as const)));
        return settleTurfValue(appended, results, new Date());
      });
    } finally { await connection.client.end(); }
  }
  console.log(`TRACKER: ${data.version}\nMODEL: TURF V3\nEPOCH: ${data.epoch}\nBACKFILL: DISABLED\nCAPTURED RACES: ${data.races.length}`);
  const summary = summarizeValueBands(data.races.flatMap(r => r.runners));
  console.table(summary.ratio);
  console.table(summary.marketRank);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main(process.argv.slice(2));
