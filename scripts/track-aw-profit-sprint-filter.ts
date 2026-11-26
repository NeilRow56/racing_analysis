import { and, eq, inArray, sql } from "drizzle-orm";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createDbConnection } from "@/db";
import { sourceImports } from "@/db/schema";
import { loadAwProfitShadow } from "@/lib/racing/aw-profit-shadow";
import { armAwSprint, captureAwSprint, loadAwSprint, pendingAwSprint, settleAwSprint, summarizeAwSprint } from "@/lib/racing/aw-profit-sprint-filter";
import { loadVerifiedFinalSpResults } from "@/lib/racing/hurdle-final-sp";
import { loadTissueGeneration } from "@/lib/racing/tissue-generation-forward";
import { getLocalRacingDate, getRacecardRowsForRaceIds, groupTodaysRacingRows } from "@/lib/racing/todays-racing";

export async function main([action = "summary", sinceText, ...extra]: string[]) {
  if (extra.length || !["init", "summary", "capture", "settle"].includes(action) ||
      (action === "capture") !== (sinceText !== undefined)) throw new Error("Use init, summary, settle, or capture <current collection start>");
  let data = action === "init" ? await armAwSprint() : await loadAwSprint();
  if (!data) {
    if (action !== "summary") throw new Error("AW sprint filter is unarmed");
    console.log("AW sprint filter is unarmed");
    return;
  }
  if (action === "capture") {
    const now = new Date(), since = new Date(sinceText ?? ""), date = getLocalRacingDate(now);
    if (!Number.isFinite(since.getTime()) || since > now || getLocalRacingDate(since) !== date)
      throw new Error("Capture requires today's collection start");
    const source = await loadAwProfitShadow();
    if (!source) throw new Error("Frozen AW Profit V1 source is unarmed");
    const recorded = new Set(data.races.map(r => r.raceId));
    const cutoff = Math.max(since.getTime(), Date.parse(data.armedAt));
    const current = source.races.filter(r => r.raceDate === date && !recorded.has(r.raceId) &&
      Date.parse(r.sourceCapturedAt) >= cutoff && Date.parse(r.scheduledOff) > now.getTime());
    if (current.length) {
      const { races: books } = await loadTissueGeneration();
      const connection = createDbConnection();
      try {
        const grouped = groupTodaysRacingRows(await getRacecardRowsForRaceIds(connection.db, current.map(r => r.raceId)));
        const flags = await connection.db.select({
          sourceId: sourceImports.sourceId,
          fetchedMs: sql<number>`(extract(epoch from ${sourceImports.fetchedAt}) * 1000)::double precision`,
          stage: sql<string | null>`${sourceImports.payload} #>> '{props,pageProps,race,race_summary,race_stage}'`,
          flag: sql<unknown>`${sourceImports.payload} #> '{props,pageProps,race,race_summary,has_handicap}'`,
        }).from(sourceImports).where(and(eq(sourceImports.source, "sporting_life"), eq(sourceImports.sourceType, "racecard-next-data"),
          inArray(sourceImports.sourceId, [...new Set(current.map(r => r.sourceId))])));
        const cutoffBySource = new Map(current.map(r => [r.sourceId, Date.parse(r.scheduledOff)]));
        const verified = new Map(flags.filter(r => /^(DORMANT|PRE_RACE|PARADING|GOINGDOWN|GOINGBEHIND|ATTHEPOST)$/.test(r.stage?.trim().toUpperCase() ?? "") &&
          r.fetchedMs <= Date.now() &&
          r.fetchedMs < (cutoffBySource.get(r.sourceId) ?? 0)).map(r => [r.sourceId, typeof r.flag === "boolean" ? r.flag : null]));
        const cards = new Map(grouped.flatMap(m => m.races.map(race =>
          [race.raceId, { race, sourceHandicap: verified.get(race.sourceId ?? "") ?? null }] as const)));
        data = await captureAwSprint(current, books, cards, since) ?? data;
        const captured = new Set(data.races.map(r => r.raceId));
        const skipped = current.filter(r => !captured.has(r.raceId));
        if (skipped.length) console.warn("AW sprint shadow skipped expired or ineligible frozen V1 decisions:", skipped.map(r => r.raceId).join(", "));
      } finally { await connection.client.end(); }
    }
  } else if (action === "settle") {
    const pending = new Map(pendingAwSprint(data).map(r => [r.raceId, r]));
    if (pending.size) {
      const { races } = await loadTissueGeneration();
      const finalIds = races.flatMap(b => {
        const r = pending.get(b.raceId);
        return r?.sourceCapturedAt === b.capturedAt && b.runners.some(p => p.outcome?.status === "settled" &&
          (p.runnerId === r.t2.runnerId || p.runnerId === r.v1?.runnerId)) ? [b.raceId] : [];
      });
      data = await settleAwSprint(races, await loadVerifiedFinalSpResults(finalIds)) ?? data;
    }
  }
  console.log(JSON.stringify({ armedAt: data.armedAt, ...summarizeAwSprint(data) }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main(process.argv.slice(2));
