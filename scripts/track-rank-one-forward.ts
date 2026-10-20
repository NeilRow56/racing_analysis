import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { createDbConnection } from "@/db";
import { currentDayProspectiveCapture } from "@/lib/racing/current-day-sync";
import { getLocalRacingDate, getTodaysRacingData, getRacecardRowsForRaceIds, groupTodaysRacingRows } from "@/lib/racing/todays-racing";
import { loadFrozenTissueModel, ACTIVE_TURF_TISSUE_CONFIG } from "@/lib/racing/tissue-forward";
import { loadTurfTissueCaptureHistory } from "@/lib/racing/turf-tissue-sync";
import { loadJumpTissueModel } from "@/lib/racing/jump-tissue-model";
import { loadAwTissueModel } from "@/lib/racing/aw-tissue-model";
import { loadAwTissuePriorStarts } from "@/lib/racing/aw-tissue-forward";
import { loadJumpTissueCommentsForRaces } from "@/lib/racing/jump-tissue-sync";
import { loadRankOne, mutateRankOne, runRankOneCycle, summarizeRankOne, rankOneFamily } from "@/lib/racing/rank-one-forward";
import { isValidDate } from "./run-research-workflow";
export async function main(args: string[]) {
  const command = args[0] ?? "summary", date = args[1] ?? getLocalRacingDate();
  if (!["sync", "today", "summary", "results"].includes(command) || args.length > 2 || !isValidDate(date))
    throw new Error("Usage: track-rank-one-forward.ts <sync|today|summary|results> [YYYY-MM-DD]");
  let data = await loadRankOne();
  if (command === "sync" || (command === "results" && data.observations.some(r => !r.outcome))) {
    const connection = createDbConnection();
    try {
      data = await mutateRankOne(latest => runRankOneCycle({ data: latest, mode: command === "sync" ? "morning" : "after", raceDate: date,
        loadCapture: async () => {
          const capturedAt = new Date();
          const today = await getTodaysRacingData(connection.db, date, { raceFilter: race => rankOneFamily(race) !== null });
          const capture = currentDayProspectiveCapture(today);
          if (capture.skipped)
            console.log(capture.message);
          capture.meetings = await loadTurfTissueCaptureHistory(connection.db, capture.meetings, date, capturedAt);
          const races = capture.meetings.flatMap(m => m.races);
          const [turf, jump, aw, comments, awStarts] = await Promise.all([
            loadFrozenTissueModel(ACTIVE_TURF_TISSUE_CONFIG.modelPath, ACTIVE_TURF_TISSUE_CONFIG.modelVersion), loadJumpTissueModel(), loadAwTissueModel(),
            loadJumpTissueCommentsForRaces(connection.client, races), loadAwTissuePriorStarts(connection.client, races.filter(r => rankOneFamily(r) === "AW"))
          ]);
          return { meetings: capture.meetings, models: { turf, jump, aw, comments, awStarts } };
        },
        loadResults: async (ids) => new Map(groupTodaysRacingRows(await getRacecardRowsForRaceIds(connection.db, ids)).flatMap(m => m.races.map(r => [r.raceId, r] as const))),
      }));
    }
    finally {
      await connection.client.end();
    }
  }
  console.log(`TRACKER: ${data.version}\nEPOCH: ${data.epoch}\nBACKFILL: DISABLED`);
  if (command === "summary" || command === "results")
    console.table(summarizeRankOne(data).map(row => ({family:row.family, cohort:row.cohort, epoch:row.epoch, cap:row.cap??"NONE", tracked:row.tracked, settled:row.settled, winners:row.winners, strike:row.strikeRate, expected:row.marketExpectedWinners, ae:row.ae, qualifyingPriceProfit:row.profitLoss, roi:row.roi, pricedSettled:row.pricedSettled})));
  if (command !== "summary")
    console.table(data.observations.filter(r => r.raceDate === date).map(r => ({ time: r.scheduledOff, course: r.course, horse: r.horseName, family: r.family, source: r.rankSource,
      price: r.market.medianBookmakerDecimal, marketRank: r.market.marketRank, cap: r.cap === null ? "NONE" : r.withinCap ? "IN CAP" : "ABOVE CAP", result: r.outcome?.status ?? "pending", profit: r.outcome?.profitLoss ?? null })));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await main(process.argv.slice(2));
