import { and, eq, inArray, sql } from "drizzle-orm";
import { TODAY_RACE_SOURCE_TYPES } from "./todays-racing";
import type { createDbConnection } from "@/db";
import { races, raceRunners, sourceImports } from "@/db/schema";

type Db = ReturnType<typeof createDbConnection>["db"];
/** Importers update updated_at on every upsert, including results, NR, cards and
 * prices. Counts also detect deletions. Keep timestamp text to retain microseconds.
 * No racecard payloads, model work or bookmaker JSON is needed for this identity.
 */
export async function researchDatabaseIdentity(db: Db): Promise<string> {
  const rows = await db.execute(sql`select
    (select count(*)::text || ':' || coalesce(max(updated_at)::text, '') from ${races}) as races,
    (select count(*)::text || ':' || coalesce(max(updated_at)::text, '') from ${raceRunners}) as runners,
    (select count(*)::text || ':' || coalesce(max(updated_at)::text, '') from ${sourceImports}) as imports`);
  return JSON.stringify(rows);
}

export type ResearchResultRow = {
  raceId: string; winningTime: string | null; finishingPosition: number | null;
  resultStatus: string | null; oddsDecimal: string | null;
};
/** Same conclusive-result predicate as todayRaceHasConclusiveResult, projected
 * from settlement columns only (no full Today racecard joins/JSON extraction).
 */
export function canonicalResearchResultIds(rows: ResearchResultRow[]): ReadonlySet<string> {
  const groups = new Map<string, ResearchResultRow[]>();
  for (const row of rows) {
    const group = groups.get(row.raceId) ?? [];
    group.push(row); groups.set(row.raceId, group);
  }
  return new Set([...groups].filter(([, runners]) => Boolean(runners[0].winningTime?.trim()) &&
    runners.some(r => r.finishingPosition === 1) && runners.every(r => r.resultStatus === "non_runner" ||
      Boolean(r.oddsDecimal?.trim()) && (r.finishingPosition !== null || Boolean(r.resultStatus?.trim())))).map(([id]) => id));
}
export async function getResearchCanonicalResultRaceIds(db: Db, raceIds: string[]): Promise<ReadonlySet<string>> {
  if (!raceIds.length) return new Set();
  return canonicalResearchResultIds(await db.select({ raceId: races.id, winningTime: races.winningTime,
    finishingPosition: raceRunners.finishingPosition, resultStatus: raceRunners.resultStatus,
    oddsDecimal: raceRunners.startingPriceDecimal,
  }).from(races).innerJoin(raceRunners, eq(raceRunners.raceId, races.id)).where(and(inArray(races.id, [...new Set(raceIds)]), eq(races.source, "sporting_life"), eq(raceRunners.source, "sporting_life"),
    sql`exists (select 1 from ${sourceImports} where ${sourceImports.source} = 'sporting_life'
      and ${sourceImports.sourceType} in (${sql.join(TODAY_RACE_SOURCE_TYPES.map(type => sql`${type}`), sql`, `)})
      and ${sourceImports.sourceId} = ${races.sourceId})`)));
}
