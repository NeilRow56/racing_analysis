import { and, eq, inArray, sql } from "drizzle-orm";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createDbConnection } from "@/db";
import { sourceImports } from "@/db/schema";
import {
  awProfitResult, captureAwProfitShadow, initAwProfitShadow, loadAwProfitShadow, pendingAwProfitShadow,
  settleAwProfitShadow, summarizeAwProfitShadow,
} from "@/lib/racing/aw-profit-shadow";
import { loadTissueGeneration } from "@/lib/racing/tissue-generation-forward";
import { getLocalRacingDate, getRacecardRowsForRaceIds, groupTodaysRacingRows } from "@/lib/racing/todays-racing";

export async function main([action = "summary", sinceText, ...extra]: string[]) {
  if (extra.length || !["init", "summary", "capture", "settle"].includes(action) ||
      (action === "capture") !== (sinceText !== undefined)) {
    throw new Error("Use init|summary|settle or capture <current collection run start ISO timestamp>");
  }
  const data = action === "init" ? await initAwProfitShadow() : await loadAwProfitShadow();
  if (!data) {
    if (action !== "summary") throw new Error("AW profit shadow is unarmed");
    console.log("AW profit shadow is unarmed");
    return;
  }
  if (action === "init" || action === "summary") {
    console.log(`AW profit shadow armed at ${data.armedAt}`);
    console.table(summarizeAwProfitShadow(data));
    return;
  }
  const now = new Date();
  const since = new Date(sinceText ?? "");
  const date = getLocalRacingDate(now);
  if (action === "capture" && (!Number.isFinite(since.getTime()) || since > now || getLocalRacingDate(since) !== date)) {
    throw new Error("Capture requires the start timestamp of today's collection run");
  }
  const recorded = new Set(data.races.map(r => r.raceId));
  const books = action === "capture" ? (await loadTissueGeneration()).races.filter(book =>
    book.family === "AW" && book.raceDate === date && !recorded.has(book.raceId) &&
    Date.parse(book.capturedAt) >= Math.max(since.getTime(), Date.parse(data.armedAt)) &&
    book.runners.every(r => r.outcome === null)) : [];
  const raceIds = action === "capture" ? books.map(b => b.raceId) : pendingAwProfitShadow(data);
  if (!raceIds.length) {
    console.table(summarizeAwProfitShadow(data));
    return;
  }
  const connection = createDbConnection();
  try {
    const rows = await getRacecardRowsForRaceIds(connection.db, raceIds);
    const races = new Map(groupTodaysRacingRows(rows).flatMap(m => m.races.map(r => [r.raceId, r] as const)));
    if (action === "capture") {
      const updated = await captureAwProfitShadow(books, races, since);
      if (!updated) throw new Error("AW profit shadow ledger unavailable");
      const frozen = new Set(updated.races.map(r => r.raceId));
      const skipped = [...new Set(raceIds)].filter(id => !frozen.has(id));
      if (skipped.length) console.warn("AW profit shadow capture unavailable for unverified or expired books:", skipped.join(", "));
      console.table(summarizeAwProfitShadow(updated));
      return;
    }
    const sourceIds = [...new Set([...races.values()].flatMap(r => r.sourceId ? [r.sourceId] : []))];
    const finalResults = await connection.db.select({
      sourceId: sourceImports.sourceId,
      race: sql<unknown>`${sourceImports.payload} #> '{props,pageProps,race}'`,
    }).from(sourceImports).where(and(eq(sourceImports.source, "sporting_life"),
      eq(sourceImports.sourceType, "full-result-next-data"), inArray(sourceImports.sourceId, sourceIds)));
    const raw = new Map(finalResults.map(r => [r.sourceId, r.race]));
    const updated = await settleAwProfitShadow(new Map([...races].map(([id, race]) => [id, awProfitResult(race, raw.get(race.sourceId ?? ""))])));
    if (!updated) throw new Error("AW profit shadow ledger unavailable");
    console.table(summarizeAwProfitShadow(updated));
  } finally { await connection.client.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main(process.argv.slice(2));
