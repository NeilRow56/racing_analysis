import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { createDbConnection } from "@/db";
import { currentDayProspectiveCapture } from "@/lib/racing/current-day-sync";
import { getLocalRacingDate, getTodaysRacingData } from "@/lib/racing/todays-racing";
import { appendOrSpeed, buildOrSpeedObservations, loadOrSpeed, mutateOrSpeed, OR_SPEED_EPOCH, summarizeOrSpeed } from "@/lib/racing/or-speed-forward";
import { isValidDate } from "./run-research-workflow";

export async function main(args: string[]) {
  const command = args[0] ?? "summary", date = args[1] ?? getLocalRacingDate();
  if (!["capture", "summary"].includes(command) || args.length > 2 || !isValidDate(date))
    throw new Error("Usage: track-or-speed-forward.ts <capture|summary> [YYYY-MM-DD]");
  let data = await loadOrSpeed();
  const startedAt = new Date();
  if (command === "capture" && date === getLocalRacingDate(startedAt) && startedAt >= new Date(OR_SPEED_EPOCH)) {
    const connection = createDbConnection();
    try {
      const today = await getTodaysRacingData(connection.db, date);
      const capture = currentDayProspectiveCapture(today);
      if (capture.skipped) console.log(capture.message);
      // Use completion time: a race that started while loading must never be captured.
      const rows = buildOrSpeedObservations({ meetings: capture.meetings, raceDate: date, capturedAt: new Date() });
      data = await mutateOrSpeed(latest => appendOrSpeed(latest, rows));
    } finally { await connection.client.end(); }
  } else if (command === "capture") console.log("Capture skipped: current-day post-activation pre-race only. No backfill.");
  console.log(`TRACKER: ${data.version}\nEPOCH: ${data.epoch}\nBACKFILL: DISABLED\nResearch only. Sample labels use settled starters; small samples do not establish significance. NR/void excluded from performance rates.`);
  console.table(summarizeOrSpeed(data));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main(process.argv.slice(2));
