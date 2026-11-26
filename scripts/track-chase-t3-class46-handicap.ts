import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createDbConnection } from "@/db";
import {
  armChaseClass46, captureChaseClass46, loadChaseClass46, pendingChaseClass46, settleChaseClass46, summarizeChaseClass46,
} from "@/lib/racing/chase-t3-class46-handicap";
import { loadVerifiedFinalSpResults } from "@/lib/racing/hurdle-final-sp";
import { loadTissueGeneration } from "@/lib/racing/tissue-generation-forward";
import { getLocalRacingDate, getRacecardRowsForRaceIds, groupTodaysRacingRows } from "@/lib/racing/todays-racing";

export async function main([action = "summary", sinceText, ...extra]: string[]) {
  if (extra.length || !["init", "summary", "capture", "settle"].includes(action) ||
      (action === "capture") !== (sinceText !== undefined)) throw new Error("Use init, summary, settle, or capture <current collection start>");
  const data = action === "init" ? await armChaseClass46() : await loadChaseClass46();
  if (!data) {
    if (action !== "summary") throw new Error("Chase Class 4–6 shadow is unarmed");
    console.log("Chase Class 4–6 shadow is unarmed");
    return;
  }
  let updated = data;
  if (action === "capture") {
    const now = new Date(), since = new Date(sinceText ?? "");
    const date = getLocalRacingDate(now);
    if (!Number.isFinite(since.getTime()) || since > now || getLocalRacingDate(since) !== date)
      throw new Error("Capture requires today's collection start");
    const recorded = new Set(data.races.map(r => r.raceId));
    const cutoff = Math.max(since.getTime(), Date.parse(data.armedAt));
    const books = (await loadTissueGeneration()).races.filter(r => r.family === "CHASE" && r.raceDate === date &&
      Date.parse(r.capturedAt) >= cutoff && Date.parse(r.scheduledOff) > now.getTime() &&
      !recorded.has(r.raceId) && r.runners.every(runner => runner.outcome === null));
    if (books.length) {
      const connection = createDbConnection();
      try {
        const ids = [...new Set(books.map(r => r.raceId))];
        const cards = groupTodaysRacingRows(await getRacecardRowsForRaceIds(connection.db, ids)).flatMap(meeting => meeting.races);
        updated = (await captureChaseClass46(books, new Map(cards.map(r => [r.raceId, r])), since)) ?? data;
        const captured = new Set(updated.races.map(r => r.raceId));
        const skipped = ids.filter(id => !captured.has(id));
        if (skipped.length) console.warn("Chase Class 4–6 shadow skipped expired or ineligible books:", skipped.join(", "));
      } finally {
        await connection.client.end();
      }
    }
  } else if (action === "settle") {
    const pending = new Map(pendingChaseClass46(data).map(r => [r.raceId, r]));
    if (pending.size) {
      const { races } = await loadTissueGeneration();
      const finalIds = races.flatMap(book => {
        const row = pending.get(book.raceId);
        return row?.sourceCapturedAt === book.capturedAt &&
          book.runners.some(r => r.outcome?.status === "settled" &&
            (r.runnerId === row.t2?.runnerId || r.runnerId === row.selectionRunnerId)) ? [book.raceId] : [];
      });
      updated = (await settleChaseClass46(races, await loadVerifiedFinalSpResults(finalIds))) ?? data;
    }
  }
  console.log(JSON.stringify({ armedAt: updated.armedAt, ...summarizeChaseClass46(updated) }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main(process.argv.slice(2));
