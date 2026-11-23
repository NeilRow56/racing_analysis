import { and, eq, inArray, sql } from "drizzle-orm";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createDbConnection } from "@/db";
import { sourceImports } from "@/db/schema";
import { awProfitResult } from "@/lib/racing/aw-profit-shadow";
import {
  captureAwMarketSupport, initAwMarketSupport, loadAwMarketSupport, loadAwMarketSupportCaptureBooks, pendingAwMarketSupport,
  settleAwMarketSupport, summarizeAwMarketSupport,
} from "@/lib/racing/aw-market-support-shadow";
import { getLocalRacingDate, getRacecardRowsForRaceIds, groupTodaysRacingRows } from "@/lib/racing/todays-racing";

export async function main([action = "summary", argument, ...extra]: string[]) {
  if (extra.length || !["summary", "arm", "capture", "settle"].includes(action) ||
      (action === "arm" ? argument !== "--confirm" : (action === "capture") !== (argument !== undefined))) {
    throw new Error("Use summary, arm --confirm, capture <collection start ISO timestamp>, or settle");
  }
  const data = action === "arm" ? await initAwMarketSupport() : await loadAwMarketSupport();
  if (!data) {
    if (action !== "summary") throw new Error("AW market-support shadow is unarmed");
    console.log("AW market-support shadow is unarmed");
    return;
  }
  if (action === "summary" || action === "arm") {
    console.log(`${data.policy} armed at ${data.armedAt}`);
    console.table(summarizeAwMarketSupport(data));
    return;
  }

  const now = new Date();
  const since = new Date(argument ?? "");
  const date = getLocalRacingDate(now);
  if (action === "capture" && (!Number.isFinite(since.getTime()) || since > now || getLocalRacingDate(since) !== date)) {
    throw new Error("Capture requires the start timestamp of today's collection run");
  }
  const known = new Set(data.observations.map(o => o.book.raceId));
  const books = action === "capture" ? (await loadAwMarketSupportCaptureBooks()).filter(book =>
    book.raceDate === date && !known.has(book.raceId) &&
    Date.parse(book.capturedAt) >= Math.max(since.getTime(), Date.parse(data.armedAt)) &&
    Date.parse(book.scheduledOff) > now.getTime() && book.runners.every(r => r.outcome === null)) : [];
  const ids = action === "capture" ? [...new Set(books.map(b => b.raceId))] : pendingAwMarketSupport(data);
  if (!ids.length) {
    console.table(summarizeAwMarketSupport(data));
    return;
  }

  const connection = createDbConnection();
  try {
    const rows = await getRacecardRowsForRaceIds(connection.db, ids);
    const cards = new Map(groupTodaysRacingRows(rows).flatMap(m => m.races.map(r => [r.raceId, r] as const)));
    if (action === "capture") {
      const updated = await captureAwMarketSupport(books, cards, since);
      if (!updated) throw new Error("AW market-support shadow ledger unavailable");
      const captured = new Set(updated.observations.map(o => o.book.raceId));
      const skipped = ids.filter(id => !captured.has(id));
      if (skipped.length) console.warn("AW market-support capture unavailable for unverified or expired books:", skipped.join(", "));
      console.table(summarizeAwMarketSupport(updated));
      return;
    }
    const sourceIds = [...new Set([...cards.values()].flatMap(r => r.sourceId ? [r.sourceId] : []))];
    const raw = sourceIds.length ? await connection.db.select({
      sourceId: sourceImports.sourceId,
      race: sql<unknown>`${sourceImports.payload} #> '{props,pageProps,race}'`,
    }).from(sourceImports).where(and(eq(sourceImports.source, "sporting_life"),
      eq(sourceImports.sourceType, "full-result-next-data"), inArray(sourceImports.sourceId, sourceIds),
      sql`${sourceImports.payload} #>> '{props,pageProps,race,race_summary,race_summary_reference,id}' = ${sourceImports.sourceId}`)) : [];
    const results = new Map(raw.map(r => [r.sourceId, r.race]));
    const updated = await settleAwMarketSupport(new Map([...cards].map(([id, race]) =>
      [id, awProfitResult(race, results.get(race.sourceId ?? ""))])));
    if (!updated) throw new Error("AW market-support shadow ledger unavailable");
    console.table(summarizeAwMarketSupport(updated));
  } finally { await connection.client.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main(process.argv.slice(2));
