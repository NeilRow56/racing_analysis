import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { createDbConnection } from "@/db";
import { races, raceRunners, sourceImports } from "@/db/schema";
import { loadLatestBacktestFeatureCacheForYear } from "@/lib/racing/backtest-cache";
import { getHistoricalTargetRunnerMetrics } from "@/lib/racing/historical-target-metrics";
import { getTurfSpeedRatingsAsOfRuns } from "@/lib/racing/turf-speed-ratings";
import { isOrdinaryFlatTurfRace } from "@/lib/racing/turf-speed-rating";
import { getTprConfidenceContext, type UsableTurfHistoryRun, type TprConfidenceContext } from "@/lib/racing/tpr-confidence-context";
import { rankRows } from "@/lib/racing/research-rule";
import { getTodaysRacingData } from "@/lib/racing/todays-racing";
import { calculateTurfPerformanceRating, rankTurfPerformanceRatings } from "@/lib/racing/turf-performance-rating";
import { TurfPerformanceRatingCell } from "@/app/racing/today/tpr-display";

const output = "/tmp/tpr-confidence-context-audit.md";
const today = "2026-10-01";
async function main() {
  const { db, client } = createDbConnection();
  try {
    const contexts = [];
    for (const year of ["2025", "2026"]) {
      const cache = await loadLatestBacktestFeatureCacheForYear({ family: "turf_flat", year });
      if (!cache || cache.manifest.calculationVersions.turfSpeed !== "turf_speed_v2") throw new Error(`Missing current cache ${year}`);
      const extra = await db.select({ id: raceRunners.id, raceName: races.raceName, raceType: races.raceType, raceTypeCode: races.raceTypeCode, surface: sql<string | null>`${sourceImports.payload} #>> '{props,pageProps,race,race_summary,course_surface,surface}'` }).from(raceRunners).innerJoin(races, eq(raceRunners.raceId, races.id)).innerJoin(sourceImports, and(eq(sourceImports.sourceId, races.sourceId), eq(sourceImports.source, races.source), eq(sourceImports.sourceType, "full-result-next-data"))).where(and(eq(races.source, "sporting_life"), eq(raceRunners.source, "sporting_life"), sql`${races.raceDate} > ${cache.actualCoverage?.actualTo ?? cache.manifest.to}`, sql`${races.raceDate} <= ${year === "2026" ? "2026-09-30" : "2025-12-31"}`));
      const ids = extra.filter(isOrdinaryFlatTurfRace).map(r => r.id);
      const fresh = ids.length ? await getHistoricalTargetRunnerMetrics(db, { targetRunnerIds: ids, ratingFamily: "turf" }) : [];
      cache.rows.push(...fresh.filter(r => r.features.raceCode === "turf"));
      contexts.push({ year, cache });
      console.log(`${year}: ${cache.rows.length} current Turf rows`);
    }
    const horseIds = [...new Set(contexts.flatMap(c => c.cache.rows.map(r => r.features.horseId)))];
    const candidates = [];
    for (let i = 0; i < horseIds.length; i += 2000) candidates.push(...await db.select({ runnerId: raceRunners.id, horseId: raceRunners.horseId, raceDateTime: races.raceDatetime, weightCarriedLbs: raceRunners.weightCarriedLbs, resultStatus: raceRunners.resultStatus, finishingPosition: raceRunners.finishingPosition }).from(raceRunners).innerJoin(races, eq(raceRunners.raceId, races.id)).where(and(inArray(raceRunners.horseId, horseIds.slice(i, i + 2000)), eq(raceRunners.source, "sporting_life"), eq(races.source, "sporting_life"), lt(races.raceDatetime, new Date("2026-10-01")), sql`${races.winningTime} is not null and btrim(${races.winningTime}) <> ''`)));
    const speeds = await getTurfSpeedRatingsAsOfRuns(db, candidates.map(r => r.runnerId), { onTiming: (name, ms) => console.log(`${name}: ${Math.round(ms)}ms`) });
    const byHorse = new Map<string, UsableTurfHistoryRun[]>();
    for (const r of candidates) {
      if (!r.raceDateTime) continue;
      const history = byHorse.get(r.horseId) ?? [];
      history.push({ ...r, raceDateTime: r.raceDateTime, turfSpeedRating: speeds.get(r.runnerId) ?? null });
      byHorse.set(r.horseId, history);
    }
    const audit = [];
    const corrected = [];
    for (const { year, cache } of contexts) {
      const rated = rankRows(cache.rows).filter(r => r.turfPerformance);
      const observations = rated.map(row => ({ row, context: getTprConfidenceContext(byHorse.get(row.features.horseId) ?? [], row.features.raceDateTime) }));
      const oldOne = observations.filter(o => o.row.turfPerformance!.historyDepth === 1);
      const erroneousOne = oldOne.filter(o => o.context.usableTurfHistoryCount >= 2);
      const mismatches = observations.filter(o => o.row.turfPerformance!.historyDepth !== Math.min(3, o.context.usableTurfHistoryCount));
      const dates = cache.rows.map(r => r.features.raceDate).sort();
      audit.push({ year, coverage: `${dates[0]} to ${dates.at(-1)}`, ratedObservations: rated.length, oldOneRunObservations: oldOne.length, oldOneRunDistinctHorses: new Set(oldOne.map(o => o.row.features.horseId)).size, oldOneActuallyTwoPlus: erroneousOne.length, actualTwoPlusObservations: observations.filter(o => o.context.usableTurfHistoryCount >= 2).length, correctedOneLabels: erroneousOne.length, allIncorrectDepthLabels: mismatches.length, correctedDistinctHorses: new Set(mismatches.map(o => o.row.features.horseId)).size });
      corrected.push(...mismatches.map(o => ({ year, horseName: o.row.features.horseName, runnerId: o.row.features.targetRunnerId, raceId: o.row.features.targetRaceId, date: o.row.features.raceDate, oldDepth: o.row.turfPerformance!.historyDepth, ...o.context })));
    }
    const current = await getTodaysRacingData(db, today, { onTiming: (name, ms) => console.log(`${name}: ${Math.round(ms)}ms`) });
    if (current.status !== "ok") throw new Error("Missing current racecard");
    const warnings: Array<TprConfidenceContext & { horseName: string; horseId: string; runnerId: string; raceId: string; time: string | null; course: string }> = [];
    let ratedToday = 0; let labelChangesToday = 0;
    for (const meeting of current.meetings) for (const race of meeting.races) {
      const baseline = rankTurfPerformanceRatings(race.runners.map(r => ({ id: r.runnerId, rating: r.turfPerformanceInput ? calculateTurfPerformanceRating(r.turfPerformanceInput) : null })));
      for (const runner of race.runners) {
        if (!runner.turfPerformanceRating) continue;
        assert.deepEqual(runner.turfPerformanceRating, baseline.get(runner.runnerId));
        const context = runner.tprConfidence;
        assert.ok(context, `Missing context for ${runner.horseName}`);
        ratedToday++;
        if (runner.turfPerformanceRating.historyDepth !== Math.min(3, context.usableTurfHistoryCount)) labelChangesToday++;
        if (context.limitedHistory || context.staleTurfEvidence) warnings.push({ horseName: runner.horseName, horseId: runner.horseId, runnerId: runner.runnerId, raceId: race.raceId, time: race.scheduledTime, course: meeting.courseName, ...context });
      }
    }
    const race = current.meetings.flatMap(m => m.races).find(r => r.raceId === "f05add74-2cf6-4ac0-80e1-4852fc55962b");
    const exact = race?.runners.find(r => r.horseName === "Exactly Right");
    assert.ok(exact?.turfPerformanceRating);
    assert.equal(exact.turfPerformanceRating.rating.toFixed(3), "108.093");
    assert.equal(exact.turfPerformanceRating.rank, 1);
    assert.equal(exact.turfPerformanceRating.gap?.toFixed(3), "1.596");
    assert.equal(exact.tprConfidence?.usableTurfHistoryCount, 1);
    assert.equal(exact.tprConfidence?.limitedHistory, true);
    assert.equal(exact.tprConfidence?.staleTurfEvidence, true);
    assert.equal(exact.tprConfidence?.daysSinceUsableTurfRun, 545);
    assert.equal(exact.metrics?.daysSinceLastRun, 294);
    const html = renderToStaticMarkup(createElement(TurfPerformanceRatingCell, { runner: exact, coverage: race?.tprRatingCoverage }));
    for (const label of ["TPR 108", "Rank 1", "1-run basis", "Limited history", "Stale Turf evidence"]) assert.ok(html.includes(label));
    const uniqueCount = (pred: (r: typeof warnings[number]) => boolean) => new Set(warnings.filter(pred).map(r => r.horseId)).size;
    const summary = { date: today, ratedToday, labelChangesToday, limitedHistory: uniqueCount(r => r.limitedHistory), staleTurfEvidence: uniqueCount(r => r.staleTurfEvidence), both: uniqueCount(r => r.limitedHistory && r.staleTurfEvidence) };
    const lines = ["# TPR Confidence Context Implementation Audit", "", "Read-only audit using current TPR_S2_V1, turf_speed_v2, compatible v4 caches extended in memory through currently imported supported results. No rating, tracker, rules or historical data written. Counts refer to rated runner-race observations; distinct horse counts are explicitly separate. These are actual-depth corrections, excluding the wording-only change from 3-run to 3+ run basis.", "", "Canonical source: getTprConfidenceContext on the current pipeline's underlying as-of Turf speed/weight-performance runs, strictly earlier than the target race. The same helper is used by calculateHorseMetricsAsOf for Today and newly generated historical feature provenance. Cached reconstructed depth is compared, never used as the actual history count.", "", "| Year | Supported coverage | Rated observations | Old 1-run observations | Old 1-run distinct horses | Old 1-run actually 2+ | All actual 2+ | Corrected 1-run labels | All incorrect depth labels | Corrected distinct horses |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"];
    for (const r of audit) lines.push(`| ${r.year} | ${r.coverage} | ${r.ratedObservations} | ${r.oldOneRunObservations} | ${r.oldOneRunDistinctHorses} | ${r.oldOneActuallyTwoPlus} | ${r.actualTwoPlusObservations} | ${r.correctedOneLabels} | ${r.allIncorrectDepthLabels} | ${r.correctedDistinctHorses} |`);
    lines.push("", "Historical corrections above are diagnostic counts only; no historical labels or tracker records were rewritten. Today uses corrected labels automatically from current run-level provenance.", "", `Current day ${today}: ${ratedToday} active rated Turf runners, ${labelChangesToday} depth labels differing from reconstructed depth. Distinct horses: Limited history ${summary.limitedHistory}; Stale Turf evidence ${summary.staleTurfEvidence}; both ${summary.both}.`, "", "| Horse | Course | Time | Basis | Limited | Stale | Days since usable Turf run |", "| --- | --- | --- | --- | --- | --- | --- |");
    for (const r of warnings) lines.push(`| ${r.horseName} | ${r.course} | ${r.time} | ${r.historyDepthLabel} | ${r.limitedHistory} | ${r.staleTurfEvidence} | ${r.daysSinceUsableTurfRun} |`);
    lines.push("", "Exactly Right: unchanged TPR 108.093 (display 108), rank 1, lead +1.596 (display +1.6), count 1, 1-run basis, Limited history, Stale Turf evidence. Usable Turf evidence age 545 days; days since ANY run remains 294. HTML cell render and live-data assertions passed. All current-day rating fields and ranks deep-equal direct calculations using the unchanged frozen canonical inputs.", "", "Warnings: Limited history iff actual usable Turf count is exactly 1. Stale Turf evidence iff integer days since the latest usable prior Turf run is >180; AW, missing/withheld speed, invalid prior weight, non-runners, same-race and future runs do not reset it. No score/rank adjustment or exclusion. No age/race-type penalties added.", "", "Forward Value: new prospective captures optionally copy context; it appears only inside expanded TPR context details. Existing records remain unchanged and unannotated, with no backfill. Calculation/settlement/summary tests compare financial fields, probabilities, selection, P/L and ROI before and after metadata; append-only upsert preserves old snapshots.", "");
    await writeFile(output, `${lines.join("\n")}\n`);
    await writeFile("/tmp/tpr-confidence-context-audit.json", JSON.stringify({ audit, summary, warnings, corrected }, null, 2));
    await writeFile("/tmp/exactly-right-tpr-confidence-cell.html", html);
    console.log(JSON.stringify({ output, audit, summary }));
  } finally { await client.end(); }
}
await main();
