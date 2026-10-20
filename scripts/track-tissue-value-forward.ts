import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { createDbConnection } from "@/db";
import { currentDayProspectiveCapture } from "@/lib/racing/current-day-sync";
import { getLocalRacingDate, getRacecardRowsForRaceIds, getTodaysRacingData, groupTodaysRacingRows } from "@/lib/racing/todays-racing";
import { loadAllTissueValue } from "@/lib/racing/tissue-value-readers";
import { VALUE_COHORTS } from "@/lib/racing/tissue-value-config";
import { appendValueForward, mutateValueForward, settleValueForward } from "@/lib/racing/tissue-value-forward";
import { buildAllFamilyValueRaces } from "@/lib/racing/tissue-value-capture";
import { loadValueCaptureInputs } from "@/lib/racing/tissue-value-sync";
import { summarizeValueBands } from "@/lib/racing/tissue-value-metrics";
import { valueFamilyForRace } from "@/lib/racing/tissue-value-family";
import { isValidDate } from "./run-research-workflow";

export async function main(args: string[]) {
  const command = args[0] ?? "summary", date = args[1] ?? getLocalRacingDate();
  if (!["sync", "results", "summary"].includes(command) || args.length > 2 || !isValidDate(date))
    throw new Error("Usage: track-tissue-value-forward.ts <sync|results|summary> [YYYY-MM-DD]");
  const snapshots = await loadAllTissueValue(), startedAt = new Date();
  const captureAllowed = command === "sync" && date === getLocalRacingDate(startedAt) && VALUE_COHORTS.some(c => startedAt >= new Date(c.epoch));
  if (command === "sync" && !captureAllowed) console.log("Capture skipped: current-day post-activation observations only; no backfill.");
  const pending = snapshots.flatMap(c => c.data.races.filter(r => r.runners.some(row => row.outcome === null)).map(r => r.raceId));
  if (captureAllowed || (command !== "summary" && pending.length)) {
    const connection = createDbConnection();
    try {
      let additions: ReturnType<typeof buildAllFamilyValueRaces> = [];
      if (captureAllowed) {
        const known = new Set(snapshots.flatMap(c => c.data.races.map(r => r.raceId)));
        const today = await getTodaysRacingData(connection.db, date, { raceFilter: r => valueFamilyForRace(r) !== null && !known.has(r.raceId) });
        const capture = currentDayProspectiveCapture(today);
        if (capture.skipped) console.log(capture.message);
        const inputs = await loadValueCaptureInputs(connection, capture.meetings, date, startedAt);
        additions = buildAllFamilyValueRaces({ ...inputs, raceDate: date, capturedAt: new Date(), historyCutoffAt: startedAt.toISOString() });
      }
      const ids = [...new Set([...pending, ...additions.map(r => r.raceId)])];
      const results = ids.length ? new Map(groupTodaysRacingRows(await getRacecardRowsForRaceIds(connection.db, ids)).flatMap(m => m.races.map(r => [r.raceId, r] as const))) : new Map();
      // One batched result read shared by every family. Each file has its own lock/atomic append.
      for (const snapshot of snapshots) snapshot.data = await mutateValueForward(snapshot.config, latest =>
        settleValueForward(appendValueForward(latest, additions.filter(r => r.family === snapshot.config.family), snapshot.config), results, new Date()));
    } finally { await connection.client.end(); }
  }
  for (const { config, data } of snapshots) {
    console.log(`FAMILY: ${config.family}\nMODEL: ${config.modelVersion}\nTRACKER: ${data.version}\nEPOCH: ${data.epoch}\nBACKFILL: DISABLED\nCAPTURED RACES: ${data.races.length}`);
    const summary = summarizeValueBands(data.races.flatMap(r => r.runners)); console.table(summary.ratio); console.table(summary.marketRank);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main(process.argv.slice(2));
