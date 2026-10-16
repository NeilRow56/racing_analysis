import { and, eq, inArray, isNotNull, lt, or } from "drizzle-orm";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { createDbConnection } from "@/db";
import { races, raceRunners } from "@/db/schema";
import { currentDayProspectiveCapture } from "@/lib/racing/current-day-sync";
import { classifyJumpRaceSubtype } from "@/lib/racing/jump-speed-rating";
import { HURDLE_RECENCY_PATH, loadHurdleRecency, mutateHurdleRecency, pendingHurdleRecencyRaceIds,
  renderHurdleRecencyRows, renderHurdleRecencySummary, runHurdleRecencyCycle,
  type HurdlePriorRun, type HurdleRecencyCommand } from "@/lib/racing/hurdle-recency-forward";
import { getLocalRacingDate, getRacecardRowsForRaceIds, getTodaysRacingData, groupTodaysRacingRows } from "@/lib/racing/todays-racing";

export async function main(args: string[]) {
  const command = args[0] ?? "summary";
  if (!["sync", "today", "summary", "results"].includes(command) || args.length > 2) {
    throw new Error("Usage: track-hurdle-recency-forward.ts <sync|today|summary|results> [YYYY-MM-DD]");
  }
  const date = args[1] ?? getLocalRacingDate();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T12:00:00Z`)) || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date) {
    throw new Error("Invalid date; use YYYY-MM-DD");
  }
  if (command === "summary" || command === "today") {
    const data = await loadHurdleRecency();
    console.log(command === "summary" ? renderHurdleRecencySummary(data) : renderHurdleRecencyRows(data, date));
    return;
  }
  // Results with an empty tracker needs neither cards nor a database connection.
  const before = await loadHurdleRecency();
  if (command === "results" && !pendingHurdleRecencyRaceIds(before).length) {
    console.log(renderHurdleRecencySummary(before)); return;
  }
  const connection = createDbConnection();
  try {
    const data = await mutateHurdleRecency((latest) => runHurdleRecencyCycle({
      command: command as Extract<HurdleRecencyCommand, "sync" | "results">, raceDate: date, data: latest,
      loadCapture: async () => {
        const today = await getTodaysRacingData(connection.db, date, { raceFilter: (race) => classifyJumpRaceSubtype(race) === "hurdle" });
        const capture = currentDayProspectiveCapture(today);
        if (capture.skipped) console.log(capture.message);
        const horseIds = [...new Set(capture.meetings.flatMap((meeting) => meeting.races.flatMap((race) => race.runners.map((runner) => runner.horseId))))];
        const historyByHorse = new Map<string, HurdlePriorRun[]>(horseIds.map((id) => [id, []]));
        // Recorded prior outcomes only; full history, all codes, same source population as the follow-up raw export.
        for (let offset = 0; offset < horseIds.length; offset += 2_000) {
          const history = await connection.db.select({ runnerId: raceRunners.id, raceId: races.id, horseId: raceRunners.horseId,
            raceDateTime: races.raceDatetime, finishingPosition: raceRunners.finishingPosition, resultStatus: raceRunners.resultStatus })
            .from(raceRunners).innerJoin(races, eq(raceRunners.raceId, races.id))
            .where(and(eq(races.source, "sporting_life"), inArray(raceRunners.horseId, horseIds.slice(offset, offset + 2_000)),
              lt(races.raceDatetime, new Date()), or(isNotNull(raceRunners.resultStatus), isNotNull(raceRunners.finishingPosition))));
          for (const run of history) if (run.raceDateTime) historyByHorse.get(run.horseId)!.push({ ...run, raceDateTime: run.raceDateTime });
        }
        return { meetings: capture.meetings, historyByHorse };
      },
      loadResults: async (ids) => {
        const rows = await getRacecardRowsForRaceIds(connection.db, ids);
        return new Map(groupTodaysRacingRows(rows).flatMap((meeting) => meeting.races.map((race) => [race.raceId, race] as const)));
      },
    }));
    console.log(`HURDLE_RECENCY_${command.toUpperCase()} created=${data.observations.length - before.observations.length} data=${HURDLE_RECENCY_PATH}`);
    if (date !== getLocalRacingDate()) console.log("Prospective capture skipped: requested date is not today. Existing observations only.");
    console.log(command === "sync" ? renderHurdleRecencyRows(data, date) : `${renderHurdleRecencyRows(data, date)}\n${renderHurdleRecencySummary(data)}`);
  } finally { await connection.client.end(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main(process.argv.slice(2));
