import { and, eq, inArray, sql } from "drizzle-orm";
import { createDbConnection } from "@/db";
import { raceRunners, races, sourceImports } from "@/db/schema";
import type { HistoricalTargetRunnerMetricsRow } from "./historical-target-metrics";

export type HistoricalSettlementEvidence = {
  runnerId: string;
  raceId: string;
  horseId: string;
  source: string | null;
  raceDate: string;
  raceStage: string | null;
  outcomeCode: string | null;
  finishingPosition: number | null;
  resultStatus: string | null;
};

/** Read-time annotation only. Never refreshes cached positions, prices or features. */
export function withHistoricalSettlementEvidence(
  rows: HistoricalTargetRunnerMetricsRow[], evidence: HistoricalSettlementEvidence[],
): HistoricalTargetRunnerMetricsRow[] {
  const byRunner = new Map(evidence.map(e => [e.runnerId, e]));
  const stages = new Map<string, string>();
  for (const row of rows) {
    const e = byRunner.get(row.features.targetRunnerId);
    if (e && e.raceId === row.features.targetRaceId && e.horseId === row.features.horseId &&
      e.source === row.features.source && e.raceDate === row.features.raceDate && e.raceStage) stages.set(e.raceId, e.raceStage);
  }
  return rows.map(row => {
    const e = byRunner.get(row.features.targetRunnerId);
    const raceStage = row.outcome.raceStage ?? stages.get(row.features.targetRaceId);
    const sameOutcome = e && e.raceId === row.features.targetRaceId && e.horseId === row.features.horseId &&
      e.source === row.features.source && e.raceDate === row.features.raceDate &&
      e.finishingPosition === row.outcome.finishingPosition && e.resultStatus === row.outcome.resultStatus;
    const outcomeCode = row.outcome.outcomeCode ?? (sameOutcome ? e.outcomeCode : undefined);
    if (raceStage === undefined && outcomeCode === undefined) return row;
    return { ...row, outcome: { ...row.outcome, raceStage, outcomeCode } };
  });
}

/** Older caches lack race-stage/non-finisher evidence. Fail closed without it. */
export async function resolveHistoricalSettlementEvidence(rows: HistoricalTargetRunnerMetricsRow[]) {
  const raceIds = [...new Set(rows.filter(r => r.outcome.raceStage === undefined).map(r => r.features.targetRaceId))]
    .filter(id => /^[a-f0-9-]{36}$/i.test(id));
  const ids = rows.filter(r => r.outcome.raceStage === undefined && r.outcome.resultStatus === "other")
    .map(r => r.features.targetRunnerId).filter(id => /^[a-f0-9-]{36}$/i.test(id));
  if (!raceIds.length || !process.env.DATABASE_URL) return rows;
  const { client, db } = createDbConnection();
  try {
    const stages = new Map<string, { source: string | null; raceDate: string; raceStage: string | null }>();
    for (let offset = 0; offset < raceIds.length; offset += 1000) {
      const found = await db.select({ raceId: races.id, source: races.source, raceDate: races.raceDate,
        raceStage: sql<string | null>`${sourceImports.payload} #>> '{props,pageProps,race,race_summary,race_stage}'`,
      }).from(races).leftJoin(sourceImports, and(eq(sourceImports.source, races.source), eq(sourceImports.sourceId, races.sourceId), eq(sourceImports.sourceType, "full-result-next-data")))
        .where(inArray(races.id, raceIds.slice(offset, offset + 1000)));
      for (const race of found) stages.set(race.raceId, race);
    }
    const annotated = rows.map(row => {
      const stage = stages.get(row.features.targetRaceId);
      return stage?.raceStage && stage.source === row.features.source && stage.raceDate === row.features.raceDate
        ? { ...row, outcome: { ...row.outcome, raceStage: row.outcome.raceStage ?? stage.raceStage } } : row;
    });
    const evidence: HistoricalSettlementEvidence[] = [];
    for (let offset = 0; offset < ids.length; offset += 1000) {
      evidence.push(...await db.select({
        runnerId: raceRunners.id, raceId: races.id, horseId: raceRunners.horseId,
        source: raceRunners.source, raceDate: races.raceDate,
        finishingPosition: raceRunners.finishingPosition, resultStatus: raceRunners.resultStatus,
        outcomeCode: raceRunners.outcomeCode,
        raceStage: sql<string | null>`${sourceImports.payload} #>> '{props,pageProps,race,race_summary,race_stage}'`,
      }).from(raceRunners).innerJoin(races, eq(races.id, raceRunners.raceId))
        .leftJoin(sourceImports, and(eq(sourceImports.source, races.source), eq(sourceImports.sourceId, races.sourceId), eq(sourceImports.sourceType, "full-result-next-data")))
        .where(inArray(raceRunners.id, ids.slice(offset, offset + 1000))));
    }
    return withHistoricalSettlementEvidence(annotated, evidence);
  } finally { await client.end(); }
}

/** Include database settlement-evidence changes in the process-local reader cache. */
export async function historicalSettlementEvidenceIdentity(): Promise<string> {
  if (!process.env.DATABASE_URL) return "no-database-evidence";
  const { client } = createDbConnection();
  try {
    const rows = await client`select
      (select count(*)::text || ':' || coalesce(max(updated_at)::text, '') from races) races,
      (select count(*)::text || ':' || coalesce(max(updated_at)::text, '') from race_runners) runners,
      (select count(*)::text || ':' || coalesce(max(updated_at)::text, '') from source_imports) imports`;
    return JSON.stringify(rows);
  } finally { await client.end(); }
}
