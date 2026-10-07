import { writeFile } from "node:fs/promises";
import { createDbConnection } from "@/db";
import { loadAwTissueForward } from "@/lib/racing/aw-tissue-forward";
import { loadAwTissueModel } from "@/lib/racing/aw-tissue-model";
import { captureAwShadow, loadAwShadowForward, mutateAwShadow, updateAwShadow } from "@/lib/racing/aw-tissue-shadow-forward";
import { loadAwShadowModel, type AwShadowExtras } from "@/lib/racing/aw-tissue-shadow-model";
import { renderAwShadowReport, summarizeAwShadow } from "@/lib/racing/aw-tissue-shadow-report";
import { awShadowOperationalWarnings, renderAwShadowOperationalWarnings } from "@/lib/racing/aw-tissue-shadow-guard";
import { currentDayProspectiveCapture } from "@/lib/racing/current-day-sync";
import { loadForwardValueData } from "@/lib/racing/forward-value";
import { getLocalRacingDate, getTodaysRacingData, isAllWeatherRaceForDisplay } from "@/lib/racing/todays-racing";

async function main() {
  const command = process.argv[2] ?? "summary", date = process.argv[3] ?? getLocalRacingDate();
  if (!["summary", "sync"].includes(command)) throw new Error("Usage: bun run scripts/track-aw-tissue-shadow.ts <summary|sync> [YYYY-MM-DD]");
  const [v1Model, candidate, v1Forward, forward] = await Promise.all([loadAwTissueModel(), loadAwShadowModel(), loadAwTissueForward(), loadForwardValueData()]);
  const sources = new Map(v1Forward.races.map(r => [r.raceId, r]));
  let cards: { raceDate: string; raceIds: string[] } | undefined;
  console.log("AW_SHADOW_DIAGNOSTIC forward-validation only");
  let data = await loadAwShadowForward();
  if (command === "sync") {
    const connection = createDbConnection();
    try {
      const today = await getTodaysRacingData(connection.db, date, { raceFilter: isAllWeatherRaceForDisplay });
      const capture = currentDayProspectiveCapture(today);
      const now = new Date();
      const races = capture.meetings.flatMap(m => m.races);
      cards = { raceDate: date, raceIds: races.filter(isAllWeatherRaceForDisplay).map(r => r.raceId) };
      if (capture.skipped) console.log(capture.message);
      const known = new Set(data.races.map(r => r.raceId));
      const eligible = races.filter(r => sources.has(r.raceId) && !known.has(r.raceId) && r.raceDateTime && r.raceDateTime > now && !r.winningTime && r.runners.every(s => s.finishingPosition === null));
      const targets = eligible.flatMap(r => r.runners.filter(s => s.resultStatus !== "non_runner").map(s => ({ runner_id: s.runnerId, horse_id: s.horseId, cutoff: r.raceDateTime!.toISOString() })));
      const extras = new Map<string, AwShadowExtras>(eligible.flatMap(r => r.runners.map(s => [s.runnerId, {
        trainerPriorRuns: s.trainerMetrics?.trainerPriorRuns ?? 0, jockeyPriorRuns: s.jockeyMetrics?.jockeyPriorRuns ?? 0, comments: [],
      }] as const)));
      if (targets.length) {
        const comments = await connection.client.begin("read only", async sql => {
          await sql`set local statement_timeout = '60s'`;
          return sql<Array<{ runnerId: string; raceId: string; raceDateTime: Date; comment: string }>>`
            with targets as (select * from jsonb_to_recordset(${JSON.stringify(targets)}::jsonb) as t(runner_id uuid, horse_id uuid, cutoff timestamptz))
            select t.runner_id as "runnerId", r.id as "raceId", r.race_datetime as "raceDateTime", rr.runner_comment as comment
            from targets t join race_runners rr on rr.horse_id=t.horse_id join races r on r.id=rr.race_id
            where r.race_datetime < t.cutoff and r.race_datetime < ${now.toISOString()}::timestamptz
              and rr.source='sporting_life' and r.source='sporting_life'
              and (rr.result_status is not null or rr.finishing_position is not null)
              and lower(coalesce(rr.result_status,'')) not in ('non_runner','abandoned','cancelled','canceled','no_race','race_void','void','void_race')
              and trim(coalesce(rr.runner_comment,'')) <> ''
            order by r.race_datetime desc
          `;
        });
        for (const c of comments) {
          const extra = extras.get(c.runnerId)!;
          if (extra.comments.length < 3) extra.comments.push({ raceId: c.raceId, raceDateTime: new Date(c.raceDateTime).toISOString(), comment: c.comment });
        }
      }
      // Prediction timestamp follows completion of all input reads.
      const capturedAt = new Date();
      const additions = eligible.flatMap(r => {
        const captured = captureAwShadow(sources.get(r.raceId)!, r, extras, v1Model, candidate, capturedAt);
        return captured ? [captured] : [];
      });
      data = await mutateAwShadow(latest => {
        const ids = new Set(latest.races.map(r => r.raceId));
        return { ...latest, races: [...latest.races, ...additions.filter(r => !ids.has(r.raceId))].map(r => updateAwShadow(r, sources.get(r.raceId), forward.races)) };
      });
      console.log(`AW_SHADOW_SYNC date=${date} eligible_source_fields=${eligible.length} captures=${additions.length} skipped=${eligible.length - additions.length} tracked=${data.races.length}`);
    } finally { await connection.client.end(); }
  }
  // Summary merges already-frozen source prices/results in memory and never writes a tracker.
  const reportData = { ...data, races: data.races.map(r => updateAwShadow(r, sources.get(r.raceId), forward.races)) };
  const missing = v1Forward.races.filter(r => !data.races.some(s => s.raceId === r.raceId)).length;
  const warnings = awShadowOperationalWarnings(reportData, v1Forward.races, forward.races, cards);
  for (const warning of warnings) console.warn(`AW_SHADOW_DIAGNOSTIC_WARNING ${warning.code}: ${warning.message}`);
  const report = `${renderAwShadowReport(reportData, missing)}\n${renderAwShadowOperationalWarnings(warnings)}`;
  await writeFile("/tmp/aw-tissue-shadow-comparison.md", report);
  await writeFile("/tmp/aw-tissue-shadow-comparison.json", `${JSON.stringify({ ...summarizeAwShadow(reportData), operationalWarnings: warnings }, null, 2)}\n`);
  const summary = summarizeAwShadow(reportData);
  console.log(`AW_SHADOW prospective=${summary.prospectiveRaces} runners=${summary.prospectiveRunners} settled=${summary.settledRaces} pending=${summary.pendingRaces} changed_top1=${summary.changedTop1.length} existing_V1_without_shadow=${missing}`);
  for (const m of summary.metrics) console.log(`${m.model}: races=${m.races} logLoss=${m.logLoss ?? "-"} Brier=${m.brier ?? "-"} top1=${m.top1 ?? "-"}`);
  console.log("Reports: /tmp/aw-tissue-shadow-comparison.md and /tmp/aw-tissue-shadow-comparison.json");
}

if (process.argv[1]?.endsWith("track-aw-tissue-shadow.ts")) await main();
