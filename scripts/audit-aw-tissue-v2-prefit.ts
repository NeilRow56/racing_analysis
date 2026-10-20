import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../src/db/schema";
import { getAwSpeedRatingsAsOfRuns } from "../src/lib/racing/aw-speed-ratings";
import { isSupportedAllWeatherRace } from "../src/lib/racing/aw-speed-rating";
import { isVoidBetResultStatus } from "../src/lib/racing/backtest";
import { AW_SURFACE_MAPPING_VERSION, resolveAwMaterial } from "../src/lib/racing/aw-surface-material";
import { AW_SURFACE_FEATURE_POLICY, AW_V2_NAMES, awV2NumericVector, buildAwSurfaceFeatures, type SurfacePrior } from "../src/lib/racing/aw-tissue-v2-features";
import type { HistoricalPreRaceFeatureRow, HistoricalPostRaceOutcome } from "../src/lib/racing/historical-target-metrics";

type PriorRow = { runnerId: string; raceId: string; horseId: string; at: Date; course: string; surface: string | null; raceName: string | null; raceType: string | null; winningTime: string | null; resultStatus: string | null; finishingPosition: number | null; weightLbs: number | null };
export async function auditAwV2Prefit() {
  // Thresholds fixed before viewing rated coverage; not optimized against outcomes.
  const gatePolicy = { minimumExposureCoverage: .95, minimumPerformanceCoverage: .50, minimumLargeMaterialPerformanceCoverage: .40, largeMaterialMinimumRunners: 100 };
  const load = async (year: number) => {
    const directory = `data/research/backtest-cache/backtest_features_v4-sporting_life-all_weather_flat-${year}-01-01-${year}-12-31`;
    const lines = async <T>(name: string): Promise<T[]> => (await readFile(`${directory}/${name}.ndjson`, "utf8")).trim().split("\n").map(s => JSON.parse(s) as T);
    const [features, outcomes] = await Promise.all([lines<HistoricalPreRaceFeatureRow>("features"), lines<HistoricalPostRaceOutcome>("outcomes")]);
    const byRunner = new Map(outcomes.map(o => [o.targetRunnerId, o]));
    const groups = new Map<string, Array<{ features: HistoricalPreRaceFeatureRow; outcome: HistoricalPostRaceOutcome }>>();
    for (const raw of features) {
      assert.equal(raw.raceCode, "aw");
      const f = { ...raw, raceDateTime: new Date(raw.raceDateTime) }, outcome = byRunner.get(f.targetRunnerId)!;
      assert(outcome);
      if (outcome.resultStatus === "non_runner") continue;
      const rows = groups.get(f.targetRaceId) ?? []; rows.push({ features: f, outcome }); groups.set(f.targetRaceId, rows);
    }
    const settled = [...groups.values()].filter(rs => rs.filter(r => r.outcome.won === true).length === 1 && rs.every(r => r.outcome.won !== null));
    const excludedMaterial = settled.filter(rs => rs.some(({ features: f }) => resolveAwMaterial({ course: f.courseName, raceDate: f.raceDate, surface: f.surface, aw: true }).material === "UNKNOWN"));
    return { year, directory, excludedMaterial: excludedMaterial.map(rs => rs[0]!.features.targetRaceId), rows: settled.filter(rs => !excludedMaterial.includes(rs)).flat() };
  };
  const caches = await Promise.all([load(2025), load(2026)]);
  const targets = caches.flatMap(c => c.rows);
  const min = Math.min(...targets.map(r => r.features.raceDateTime.getTime())) - 365 * 86400000;
  const max = Math.max(...targets.map(r => r.features.raceDateTime.getTime()));
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, connect_timeout: 8, connection: { default_transaction_read_only: true, statement_timeout: 60000 } });
  const db = drizzle(sql, { schema });
  try {
    console.log("Connecting read-only pre-fit audit");
    assert.equal((await sql`show default_transaction_read_only`)[0]!.default_transaction_read_only, "on");
    console.log("Read-only verified; loading prior metadata");
    const horses = [...new Set(targets.map(r => r.features.horseId))];
    const raw = await sql<PriorRow[]>`with metadata as materialized (select r.*,c.display_name as course,
      (select si.payload #>> '{props,pageProps,race,race_summary,course_surface,surface}' from source_imports si where si.source=r.source and si.source_id=r.source_id and si.source_type='full-result-next-data') as surface,
      r.race_name as "raceName",r.race_type as "raceType",r.winning_time as "winningTime"
      from races r join courses c on c.id=r.course_id where r.source='sporting_life' and r.race_datetime < ${new Date(max).toISOString()}::timestamptz)
      select rr.id as "runnerId",r.id as "raceId",rr.horse_id as "horseId",r.race_datetime as at,r.course,r.surface,r."raceName",r."raceType",r."winningTime",
      rr.result_status as "resultStatus",rr.finishing_position as "finishingPosition",rr.weight_carried_lbs as "weightLbs"
      from race_runners rr join metadata r on r.id=rr.race_id
      where rr.source='sporting_life' and rr.horse_id in ${sql(horses)} and r.surface in ('ALLWEATHER','POLYTRACK')
      order by rr.horse_id,r.race_datetime desc,rr.id`;
    console.log(`Loaded ${raw.length} prior source rows; earliest required lookback ${new Date(min).toISOString()}`);
    const byHorse = new Map<string, SurfacePrior[]>();
    for (const row of raw) {
      const aw = isSupportedAllWeatherRace({ courseName: row.course, surface: row.surface, raceName: row.raceName, raceType: row.raceType });
      if (!aw || isVoidBetResultStatus(row.resultStatus) || (row.finishingPosition === null && row.resultStatus === null)) continue;
      const p: SurfacePrior = { raceId: row.raceId, runnerId: row.runnerId, course: row.course, surface: row.surface, weightLbs: row.weightLbs, raceDateTime: new Date(row.at), aw, completedTimed: Boolean(row.winningTime?.trim()), speed: null };
      const list = byHorse.get(row.horseId) ?? []; list.push(p); byHorse.set(row.horseId, list);
    }
    const selected = new Set<string>();
    for (const { features: f } of targets) {
      const candidates = (byHorse.get(f.horseId) ?? []).filter(p => p.completedTimed && p.raceId !== f.targetRaceId && p.raceDateTime < f.raceDateTime && p.raceDateTime.getTime() >= f.raceDateTime.getTime() - 365 * 86400000).slice(0, 5);
      for (const p of candidates) selected.add(p.runnerId);
    }
    const sourceChecksum = createHash("sha256").update(JSON.stringify(raw)).digest("hex");
    const ratingPath = "/tmp/aw-v2-prior-asof-ratings.json";
    let saved: { sourceChecksum: string; ratings: Record<string, number | null> } | null = null;
    try { saved = JSON.parse(await readFile(ratingPath, "utf8")); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
    const ratings: Record<string, number | null> = saved?.sourceChecksum === sourceChecksum ? saved.ratings : {};
    const ids = [...selected].filter(id => !(id in ratings));
    console.log(`AW pre-fit: ${targets.length} target runners; ${selected.size} unique latest-five prior runners; ${ids.length} ratings to load`);
    for (let i = 0; i < ids.length; i += 2500) {
      const batch = ids.slice(i, i + 2500);
      const result = await getAwSpeedRatingsAsOfRuns(db, batch, { source: "sporting_life" });
      for (const id of batch) ratings[id] = result.get(id)?.rating ?? null;
      await writeFile(ratingPath, JSON.stringify({ sourceChecksum, ratings }));
      console.log(`Canonical AW as-of rating progress: ${Math.min(i + batch.length, ids.length)}/${ids.length}`);
    }
    for (const priors of byHorse.values()) for (const p of priors) p.speed = ratings[p.runnerId] ?? null;
    const rows = targets.map(row => {
      const f = row.features;
      const surface = buildAwSurfaceFeatures({ targetRaceId: f.targetRaceId, targetAt: f.raceDateTime, historyCutoff: f.raceDateTime, course: f.courseName, surface: f.surface, historyLoaded: true, priors: byHorse.get(f.horseId) ?? [] });
      const numeric = awV2NumericVector(f, surface);
      assert.equal(numeric.length, 52); assert(numeric.every(Number.isFinite));
      const priorAwStarts = (byHorse.get(f.horseId) ?? []).filter(p => p.raceId !== f.targetRaceId && p.raceDateTime < f.raceDateTime).length;
      return { ...row, surface, numeric, priorAwStarts, year: f.raceDate.slice(0, 4) };
    });
    const coverage = (rs: typeof rows) => ({ runners: rs.length, races: new Set(rs.map(r => r.features.targetRaceId)).size,
      exposure: rs.filter(r => r.surface.exposure !== null).length, performance: rs.filter(r => r.surface.relativePerformance !== null).length,
      both: rs.filter(r => r.surface.exposure !== null && r.surface.relativePerformance !== null).length,
      reasons: rs.reduce((acc, r) => { const reason = r.surface.performanceReason ?? "available"; acc[reason] = (acc[reason] ?? 0) + 1; return acc; }, {} as Record<string, number>),
      starts: rs.reduce((acc, r) => { const n = r.surface.matchingStarts; const key = n === null ? "unknown" : n === 0 ? "0" : n <= 2 ? "1-2" : n <= 4 ? "3-4" : "5+"; acc[key] = (acc[key] ?? 0) + 1; return acc; }, {} as Record<string, number>) });
    const groups = Object.fromEntries([...new Set(rows.map(r => `${r.year}/${r.surface.material}`))].map(k => [k, coverage(rows.filter(r => `${r.year}/${r.surface.material}` === k))]));
    const all = coverage(rows);
    const gate = all.exposure / all.runners >= gatePolicy.minimumExposureCoverage && ["2025", "2026"].every(y => { const c = coverage(rows.filter(r => r.year === y)); return c.performance / c.runners >= gatePolicy.minimumPerformanceCoverage; }) && Object.values(groups).every(g => g.runners < gatePolicy.largeMaterialMinimumRunners || g.performance / g.runners >= gatePolicy.minimumLargeMaterialPerformanceCoverage);
    const rowsBytes = rows.map(r => JSON.stringify(r)).join("\n") + "\n";
    const rowsChecksum = createHash("sha256").update(rowsBytes).digest("hex");
    const audit = { gate, gatePolicy, methodology: "TURF_V3_CORE_AW_SURFACE_HISTORY_V1", mappingVersion: AW_SURFACE_MAPPING_VERSION, surfacePolicy: AW_SURFACE_FEATURE_POLICY, names: AW_V2_NAMES, sourceChecksum, rowsChecksum,
      caches: caches.map(c => ({ year: c.year, directory: c.directory, excludedUnknownMaterialRaces: c.excludedMaterial })), all, groups,
      historicalPublicationTimesVerified: false, historyLoading: "Successful full source query; observed-source history, not certified lifetime completeness", createdAt: new Date().toISOString() };
    await writeFile("/tmp/aw-v2-prefit-audit.json", JSON.stringify(audit, null, 2) + "\n");
    await writeFile("/tmp/aw-v2-prefit-rows.ndjson", rowsBytes);
    console.log(JSON.stringify(audit, null, 2));
  } finally { await sql.end({ timeout: 2 }); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await auditAwV2Prefit();
