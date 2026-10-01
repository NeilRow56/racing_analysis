import { readFile, writeFile } from "node:fs/promises";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { createDbConnection } from "@/db";
import { raceRunners, races, sourceImports } from "@/db/schema";
import { loadLatestBacktestFeatureCacheForYear } from "@/lib/racing/backtest-cache";
import { settleSelection, isVoidBetResultStatus } from "@/lib/racing/backtest";
import { rankRows, type RankedResearchRow } from "@/lib/racing/research-rule";
import { getHistoricalTargetRunnerMetrics } from "@/lib/racing/historical-target-metrics";
import { getTargetRunnerMetricsForDate } from "@/lib/racing/horse-metrics";
import { getTurfSpeedRatingsAsOfRuns } from "@/lib/racing/turf-speed-ratings";
import { isOrdinaryFlatTurfRace } from "@/lib/racing/turf-speed-rating";
import { calculateWeightAdjustedPerformance } from "@/lib/racing/weight-performance";
import { rankTurfPerformanceRatings, turfPerformanceRelativeWeightContribution, TURF_PERFORMANCE_RATING_VERSION } from "@/lib/racing/turf-performance-rating";
import { CANONICAL_SETTLEMENT_VERSION } from "@/lib/racing/research-settlement-version";
import { isRatingCoverageEligible } from "@/lib/racing/rating-coverage";

type Variant = "A" | "B" | "C" | "D";
type Entry = { row: RankedResearchRow; depth: number; days: number | null; weight: number | null };
type Ranked = { entry: Entry; score: number; rank: number; gap: number | null };
type Race = { id: string; entries: Entry[]; eligible: boolean; ranked: Record<Variant, Ranked[]> };
const variants: Variant[] = ["A", "B", "C", "D"];
const scale = 10 / 1.223;
const output = "/tmp/tpr-one-run-history-diagnostic.md";
const lines: string[] = [];
const results: unknown[] = [];
const fmt = (v: number | null, digits = 3): string => v === null || !Number.isFinite(v) ? "missing" : v.toFixed(digits);
const pct = (n: number, d: number): string => d ? `${(100 * n / d).toFixed(1)}%` : "missing";
const mean = (xs: number[]): number | null => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
function quantile(xs: number[], p: number): number | null {
  if (!xs.length) return null;
  const values = [...xs].sort((a, b) => a - b);
  const index = (values.length - 1) * p;
  const lo = Math.floor(index);
  return values[lo]! + (values[Math.ceil(index)]! - values[lo]!) * (index - lo);
}
function table(title: string, rows: Record<string, unknown>[]) {
  lines.push(`## ${title}`, "");
  if (!rows.length) { lines.push("No observations.", ""); return; }
  const keys = Object.keys(rows[0]!);
  lines.push(`| ${keys.join(" | ")} |`, `| ${keys.map(() => "---").join(" | ")} |`);
  for (const row of rows) lines.push(`| ${keys.map(k => String(row[k] ?? "missing").replaceAll("|", "/")).join(" | ")} |`);
  lines.push("");
}
function midranks(values: number[]): number[] {
  const sorted = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks: number[] = [];
  for (let i = 0; i < sorted.length;) {
    let j = i + 1;
    while (j < sorted.length && sorted[j]!.v === sorted[i]!.v) j++;
    for (let k = i; k < j; k++) ranks[sorted[k]!.i] = (i + j + 1) / 2;
    i = j;
  }
  return ranks;
}
function spearman(pairs: [number, number][]): number | null {
  if (pairs.length < 3) return null;
  const x = midranks(pairs.map(p => p[0]));
  const y = midranks(pairs.map(p => p[1]));
  const mx = mean(x)!; const my = mean(y)!;
  let cov = 0; let vx = 0; let vy = 0;
  x.forEach((v, i) => { cov += (v - mx) * (y[i]! - my); vx += (v - mx) ** 2; vy += (y[i]! - my) ** 2; });
  return vx && vy ? cov / Math.sqrt(vx * vy) : null;
}
function outcomeKnown(e: Entry): boolean {
  const o = e.row.outcome;
  return !isVoidBetResultStatus(o.resultStatus) && (o.finishingPosition !== null || settleSelection(o) !== null);
}
function winner(e: Entry): boolean { return e.row.outcome.won ?? e.row.outcome.finishingPosition === 1; }
function raceType(e: Entry): string {
  const f = e.row.features;
  const text = `${f.raceName ?? ""} ${f.raceType ?? ""} ${f.raceTypeCode ?? ""}`.toLowerCase();
  if (/handicap/.test(text)) return "handicap";
  if (/maiden/.test(text)) return "maiden";
  if (/novice/.test(text)) return "novice";
  return "other";
}
function rankings(entries: Entry[], v: Variant): Ranked[] {
  const scored = entries.flatMap(entry => {
    const tpr = entry.row.turfPerformance;
    if (!tpr) return [];
    const reduction = entry.depth === 1 ? v === "B" ? 1 : v === "C" ? 0.5 : 0 : 0;
    return [{ entry, rating: { ...tpr, rawRating: tpr.rawRating - reduction * (entry.weight ?? 0), rating: tpr.rating - reduction * (entry.weight ?? 0) * scale } }];
  });
  // D promotes the strongest eligible horse(s) but preserves the remaining score order.
  const eligible = scored;
  const ratings = rankTurfPerformanceRatings(eligible.map(s => ({ id: s.entry.row.features.targetRunnerId, rating: s.rating })));
  const main = eligible.map(s => ({ entry: s.entry, score: s.rating.rating, rank: ratings.get(s.entry.row.features.targetRunnerId)!.rank, gap: ratings.get(s.entry.row.features.targetRunnerId)!.gap })).sort((a, b) => a.rank - b.rank || a.entry.row.features.targetRunnerId.localeCompare(b.entry.row.features.targetRunnerId));
  if (v === "D") {
    const selected = main.find(s => s.entry.depth >= 2);
    if (!selected) return [];
    const leaders = main.filter(s => s.entry.depth >= 2 && s.score === selected.score);
    const rest = main.filter(s => !leaders.includes(s));
    const ordered = [...leaders, ...rest];
    let lastScore: number | null = null; let lastRank = 0;
    ordered.forEach((s, i) => {
      s.rank = i < leaders.length ? 1 : i > leaders.length && s.score === lastScore ? lastRank : i + 1;
      s.gap = s.rank === 1 ? rest.length ? s.score - rest[0]!.score : null : s.score - selected.score;
      lastScore = s.score; lastRank = s.rank;
    });
    return ordered;
  }
  return main;
}
function stats(racesInput: Race[], v: Variant, predicate: (e: Entry) => boolean = () => true) {
  const ranks = racesInput.flatMap(r => r.ranked[v]);
  const entries = ranks.filter(r => predicate(r.entry));
  const tops = entries.filter(r => r.rank === 1 && (v !== "D" || r.entry.depth >= 2));
  const settled = tops.filter(r => outcomeKnown(r.entry));
  const winners = entries.filter(r => winner(r.entry) && outcomeKnown(r.entry));
  const pairs: [number, number][] = entries.flatMap(r => r.entry.row.outcome.finishingPosition === null || !outcomeKnown(r.entry) ? [] : [[r.rank, r.entry.row.outcome.finishingPosition] as [number, number]]);
  const normalized: [number, number][] = racesInput.flatMap(r => {
    const size = r.entries.filter(e => !isVoidBetResultStatus(e.row.outcome.resultStatus)).length;
    const rated = r.ranked[v].length;
    return r.ranked[v].flatMap(x => predicate(x.entry) && outcomeKnown(x.entry) && x.entry.row.outcome.finishingPosition !== null && size > 1 && rated > 1 ? [[(x.rank - 1) / (rated - 1), (x.entry.row.outcome.finishingPosition - 1) / (size - 1)] as [number, number]] : []);
  });
  const winnerRaces = racesInput.filter(r => r.entries.some(e => winner(e) && outcomeKnown(e)));
  const capture = winnerRaces.filter(r => r.ranked[v].some(x => x.rank <= 3 && predicate(x.entry) && winner(x.entry)));
  const settledBets = settled.map(r => settleSelection(r.entry.row.outcome)).filter(s => s !== null);
  return {
    "analytically ranked runners": entries.length, "rank-1 races": new Set(tops.map(r => r.entry.row.features.targetRaceId)).size,
    "settled rank-1": settled.length, "rank-1 strike": pct(settled.filter(r => winner(r.entry)).length, settled.length),
    "rank-1 finish <=3": pct(settled.filter(r => (r.entry.row.outcome.finishingPosition ?? Infinity) <= 3).length, settled.length),
    "top-3 winner capture (all winners)": pct(capture.length, winnerRaces.length),
    "top-3 capture (group winners)": pct(winners.filter(r => r.rank <= 3).length, winners.length),
    "winner mean rank": fmt(mean(winners.map(r => r.rank))), "Spearman": fmt(spearman(pairs)), "normalized Spearman": fmt(spearman(normalized)), "association n": pairs.length,
    "mean lead": fmt(mean(tops.flatMap(r => r.gap === null ? [] : [r.gap]))), "median lead": fmt(quantile(tops.flatMap(r => r.gap === null ? [] : [r.gap]), 0.5)),
    "mean weight raw": fmt(mean(entries.flatMap(r => r.entry.weight === null ? [] : [r.entry.weight]))), "median weight raw": fmt(quantile(entries.flatMap(r => r.entry.weight === null ? [] : [r.entry.weight]), 0.5)),
    "ROI descriptive": pct(settledBets.reduce((s, b) => s + b.profitLoss, 0), settledBets.length),
  };
}

async function main() {
  const connection = createDbConnection();
  try {
    const caches = await Promise.all(["2025", "2026"].map(async year => {
      const cache = await loadLatestBacktestFeatureCacheForYear({ family: "turf_flat", year });
      if (!cache || cache.manifest.calculationVersions.turfSpeed !== "turf_speed_v2") throw new Error(`Missing current Turf cache ${year}`);
      return { year, cache };
    }));
    const importedTargets = await connection.db.select({ id: raceRunners.id, raceDate: races.raceDate, raceName: races.raceName, raceType: races.raceType, raceTypeCode: races.raceTypeCode, surface: sql<string | null>`${sourceImports.payload} #>> '{props,pageProps,race,race_summary,course_surface,surface}'` }).from(raceRunners).innerJoin(races, eq(raceRunners.raceId, races.id)).innerJoin(sourceImports, and(eq(sourceImports.sourceId, races.sourceId), eq(sourceImports.source, races.source), eq(sourceImports.sourceType, "full-result-next-data"))).where(and(eq(races.source, "sporting_life"), eq(raceRunners.source, "sporting_life"), sql`${races.raceDate} >= '2025-01-01'`, sql`${races.raceDate} <= '2026-09-30'`));
    const extensions = new Map<string, number>();
    for (const { year, cache } of caches) {
      const existing = new Set(cache.rows.map(r => r.features.targetRunnerId));
      const missing = importedTargets.filter(t => t.raceDate.startsWith(year) && isOrdinaryFlatTurfRace(t) && !existing.has(t.id));
      console.log(`${year}: ${missing.length} current Turf targets outside cache; adding in memory`);
      let added = 0;
      for (let i = 0; i < missing.length; i += 3000) {
        const fresh = await getHistoricalTargetRunnerMetrics(connection.db, { targetRunnerIds: missing.slice(i, i + 3000).map(t => t.id), ratingFamily: "turf" });
        const turf = fresh.filter(r => r.features.raceCode === "turf");
        cache.rows.push(...turf); added += turf.length;
      }
      extensions.set(year, added);
    }
    const allRows = caches.flatMap(c => c.cache.rows);
    const targetRows = await getHistoricalTargetRunnerMetrics(connection.db, { targetRaceIds: ["f05add74-2cf6-4ac0-80e1-4852fc55962b"], ratingFamily: "turf" });
    const todayMetrics = await getTargetRunnerMetricsForDate(connection.db, "2026-10-01", "sporting_life", { includeNonRunnerTargets: true, completedPriorRunsOnly: true });
    for (const row of targetRows) {
      const metrics = todayMetrics.find(m => m.target.runnerId === row.features.targetRunnerId)?.metrics;
      if (!metrics) throw new Error("Missing Today replay metrics");
      Object.assign(row.features, { raceCode: "turf", latestPerformanceRating: metrics.latestTurfPerformanceRating, previousPerformanceRating: metrics.previousTurfPerformanceRating, averagePerformanceLast3: metrics.averageTurfPerformanceLast3, latestTurfSpeedRating: metrics.latestTurfSpeedRating, previousTurfSpeedRating: metrics.previousTurfSpeedRating, averageTurfSpeedLast3: metrics.averageTurfSpeedLast3, daysSinceLastRun: metrics.daysSinceLastRun });
    }
    const horseIds = [...new Set([...allRows, ...targetRows].map(r => r.features.horseId))];
    const runs = [];
    const cutoff = new Date("2026-10-02T00:00:00Z");
    for (let i = 0; i < horseIds.length; i += 2000) {
      runs.push(...await connection.db.select({ runnerId: raceRunners.id, horseId: raceRunners.horseId, date: races.raceDatetime, weight: raceRunners.weightCarriedLbs, status: raceRunners.resultStatus, finish: raceRunners.finishingPosition }).from(raceRunners).innerJoin(races, eq(raceRunners.raceId, races.id)).where(and(inArray(raceRunners.horseId, horseIds.slice(i, i + 2000)), eq(raceRunners.source, "sporting_life"), eq(races.source, "sporting_life"), lt(races.raceDatetime, cutoff), sql`${races.winningTime} is not null and btrim(${races.winningTime}) <> ''`)));
    }
    console.log(`Loaded ${runs.length} prior-run candidates; calculating authoritative as-of Turf speeds`);
    const speeds = await getTurfSpeedRatingsAsOfRuns(connection.db, runs.map(r => r.runnerId), { onTiming: (name, ms, n) => console.log(`${name}: ${Math.round(ms)}ms ${n ?? ""}`) });
    const byHorse = new Map<string, { date: Date; id: string }[]>();
    for (const run of runs) {
      if (!run.date || run.status === "non_runner" || (run.status === null && run.finish === null)) continue;
      if (!calculateWeightAdjustedPerformance({ rawSpeedRating: speeds.get(run.runnerId)?.rating ?? null, weightCarriedLb: run.weight })) continue;
      const history = byHorse.get(run.horseId) ?? [];
      history.push({ date: run.date, id: run.runnerId }); byHorse.set(run.horseId, history);
    }
    for (const history of byHorse.values()) history.sort((a, b) => a.date.getTime() - b.date.getTime());
    function makeRaces(rows: RankedResearchRow[]): Race[] {
      const byRace = new Map<string, Entry[]>();
      for (const row of rows) {
        const prior = (byHorse.get(row.features.horseId) ?? []).filter(r => r.date < row.features.raceDateTime);
        const entry: Entry = { row, depth: prior.length, days: prior.length ? Math.floor((row.features.raceDateTime.getTime() - prior.at(-1)!.date.getTime()) / 86400000) : null, weight: null };
        const entries = byRace.get(row.features.targetRaceId) ?? []; entries.push(entry); byRace.set(row.features.targetRaceId, entries);
      }
      return [...byRace].map(([id, entries]) => {
        const active = entries.filter(e => e.row.outcome.resultStatus !== "non_runner");
        const median = quantile(active.flatMap(e => e.row.features.weightCarriedLbs === null ? [] : [e.row.features.weightCarriedLbs]), 0.5);
        for (const e of entries) e.weight = turfPerformanceRelativeWeightContribution({ weightCarriedLbs: e.row.features.weightCarriedLbs, raceMedianWeightCarriedLbs: median });
        const rated = active.filter(e => e.row.turfPerformance !== null).length;
        return { id, entries, eligible: isRatingCoverageEligible({ ratedRunnerCount: rated, ratingCoverage: active.length ? rated / active.length : 0 }), ranked: Object.fromEntries(variants.map(v => [v, rankings(entries, v)])) as Record<Variant, Ranked[]> };
      });
    }
    lines.push(
      "# TPR One-Run History Diagnostic", "",
      "Diagnostic only. Fixed variants were specified before analysis; no ROI optimisation or production changes. 2025 is development, 2026 is holdout. This is a retrospective diagnostic on the existing holdout, not a new prospective validation.", "",
      `Formula: ${TURF_PERFORMANCE_RATING_VERSION}; speed: turf_speed_v2; performance: weight_performance_v1; settlement: ${CANONICAL_SETTLEMENT_VERSION} via settleSelection.`, "",
      "History groups count usable prior Turf runs in the current database with valid as-of turf_speed_v2 and weight-adjusted performance, strictly before the target timestamp. Zero usable history is separately accounted for. Frozen scores use compatible historical_target_metrics_v4 / backtest_features_v4 inputs, extended IN MEMORY through all currently imported Flat Turf results up to 2026-09-30 using the same current historical pipeline. No cache or historical data is written. Result flags only settle/exclude non-runners. No cross-surface fallback.", "",
      "Positive Spearman means better TPR rank is associated with better finish. Pooled Spearman uses numbered finishers; normalized Spearman divides rank/finish position by each race's rated/active field size. Non-finishers remain losing selections but are excluded from association. Top-3 winner capture counts races whose winner appears among analytical ranks <=3; tied ranks are included. Group-winner capture conditions on the winner belonging to that history group. Strike counts observed outcomes, without requiring SP; ROI uses only canonical settled bets with SP. Population total rated counts cover all active runners; the other performance metrics and rated-runner column use guard-eligible races.", "",
      "A=current. B=zero relative weight only for exactly-one-run horses. C=50% relative weight only for exactly-one-run horses. D=leave scores intact, promote the strongest eligible 2+ history horse(s) to analytical rank 1, and keep the remaining runners in original score order; no analytical selection if there are no eligible 2+ horses. D is an eligibility treatment, not score shrinkage; its association/top-three metrics refer to this explicit analytical order. Coverage guard requires >=2 rated active runners and >=20% coverage; scoring coverage is unchanged by variants. D selection coverage is reported separately.", "",
    );
    const populations = [];
    const provenance = [];
    const distributions = [];
    const treatmentRows = [];
    const layoffRows = [];
    const typeRows = [];
    const ageRows = [];
    const confoundingRows = [];
    const depthRows = [];
    const pairRows = [];
    for (const { year, cache } of caches) {
      console.log(`Analysing ${year}`);
      const racesAll = makeRaces(rankRows(cache.rows.filter(r => r.features.raceCode === "turf")));
      const eligible = racesAll.filter(r => r.eligible);
      const active = racesAll.flatMap(r => r.entries).filter(e => e.row.outcome.resultStatus !== "non_runner");
      const dates = cache.rows.map(r => r.features.raceDate).sort();
      provenance.push({ year, directory: cache.directory, generated: cache.manifest.generatedAt, "cached actual": `${cache.actualCoverage?.actualFrom} to ${cache.actualCoverage?.actualTo}`, "current actual": `${dates[0]} to ${dates.at(-1)}`, "fresh in-memory rows": extensions.get(year), rows: cache.rows.length, races: racesAll.length, "guard eligible": eligible.length, "guard excluded": racesAll.length - eligible.length, "zero-history active": active.filter(e => e.depth === 0).length, "rated/active": `${active.filter(e => e.row.turfPerformance).length}/${active.length}`, "missing outcome active": active.filter(e => !outcomeKnown(e)).length });
      for (const depth of [1, 2, 3]) {
        const pred = (e: Entry) => depth === 3 ? e.depth >= 3 : e.depth === depth;
        populations.push({ year, history: depth === 3 ? "3+" : depth, runners: active.filter(pred).length, "total rated runners": active.filter(e => pred(e) && e.row.turfPerformance).length, ...stats(eligible, "A", pred) });
        const group = active.filter(e => pred(e) && e.row.turfPerformance);
        const weights = group.flatMap(e => e.weight === null ? [] : [e.weight]);
        const movements = racesAll.flatMap(r => r.ranked.A.filter(x => pred(x.entry)).map(x => {
          const ownWeightRemoved = x.score - (x.entry.weight ?? 0) * scale;
          const rankWithoutOwnWeight = 1 + r.ranked.A.filter(other => other.entry !== x.entry && other.score > ownWeightRemoved).length;
          return { delta: x.rank - rankWithoutOwnWeight };
        }));
        distributions.push({ year, history: depth === 3 ? "3+" : depth, n: weights.length, mean: fmt(mean(weights)), median: fmt(quantile(weights, 0.5)), p10: fmt(quantile(weights, 0.1)), p90: fmt(quantile(weights, 0.9)), "mean abs": fmt(mean(weights.map(Math.abs))), "rank movement 0": pct(movements.filter(x => x.delta === 0).length, movements.length), "movement 1": pct(movements.filter(x => Math.abs(x.delta) === 1).length, movements.length), "movement 2+": pct(movements.filter(x => Math.abs(x.delta) >= 2).length, movements.length), "promoted by weight": pct(movements.filter(x => x.delta < 0).length, movements.length), "demoted by weight": pct(movements.filter(x => x.delta > 0).length, movements.length) });
        for (const formulaDepth of [1, 2, 3]) depthRows.push({ year, "actual history": depth === 3 ? "3+" : depth, "TPR reconstructed depth": formulaDepth, runners: group.filter(e => e.row.turfPerformance!.historyDepth === formulaDepth).length });
      }
      const affected = eligible.filter(r => r.ranked.A.some(x => x.rank === 1 && x.entry.depth === 1));
      for (const v of variants) {
        const changed = affected.filter(r => r.ranked.A.filter(x => x.rank === 1).map(x => x.entry.row.features.targetRunnerId).join() !== r.ranked[v].filter(x => x.rank === 1 && (v !== "D" || x.entry.depth >= 2)).map(x => x.entry.row.features.targetRunnerId).join());
        const selectionRaces = affected.filter(r => r.ranked[v].some(x => x.rank === 1 && (v !== "D" || x.entry.depth >= 2)));
        treatmentRows.push({ year, variant: v, "races affected": affected.length, "rank-1 changed": changed.length, "selection race coverage": pct(selectionRaces.length, affected.length), "selection races": selectionRaces.length, ...stats(affected, v) });
        pairRows.push({ year, variant: v, ...paired(affected, v) });
      }
      const one = (e: Entry) => e.depth === 1;
      for (const band of ["<=90", "91–180", ">180", "missing"]) {
        const pred = (e: Entry) => one(e) && (band === "missing" ? e.days === null : e.days !== null && (band === "<=90" ? e.days <= 90 : band === "91–180" ? e.days > 90 && e.days <= 180 : e.days > 180));
        layoffRows.push({ year, "days since usable Turf run": band, ...stats(eligible, "A", pred) });
      }
      for (const type of ["maiden", "novice", "handicap", "other"]) {
        typeRows.push({ year, "race type": type, ...stats(eligible.filter(r => raceType(r.entries[0]!) === type), "A", one) });
        for (const depth of [1, 2, 3]) confoundingRows.push({ year, "race type": type, history: depth === 3 ? "3+" : depth, ...stats(eligible.filter(r => raceType(r.entries[0]!) === type), "A", e => depth === 3 ? e.depth >= 3 : e.depth === depth) });
      }
      for (const age of ["2yo", "3yo", "older", "missing"]) ageRows.push({ year, age, ...stats(eligible, "A", e => one(e) && (age === "missing" ? e.row.features.horseAge === null : age === "2yo" ? e.row.features.horseAge === 2 : age === "3yo" ? e.row.features.horseAge === 3 : (e.row.features.horseAge ?? 0) >= 4)) });
      results.push({ year, affected: affected.length, population: populations.filter(r => r.year === year), treatments: treatmentRows.filter(r => r.year === year) });
    }
    table("Population And Provenance", provenance);
    table("Current TPR By Actual Usable History", populations);
    table("Relative Weight Distribution And Rank Influence", distributions);
    lines.push("Weight is in raw TPR units; multiply by 8.1766 for displayed TPR points. Rank movements remove each runner's OWN weight term, holding all rivals fixed. Signed promotion means the term improves rank. Distribution uses all active rated runners, including guard-excluded races, while selection performance uses guard-eligible races.", "");
    table("Actual History Versus TPR Reconstructed Depth", depthRows);
    table("Fixed Treatments In Baseline One-Run Rank-1 Races", treatmentRows);
    table("Paired Outcome Changes Versus A", pairRows);
    lines.push("Paired differences use races with observed selections under both variants. Intervals are approximate 95% normal intervals on per-race differences; they are descriptive, not a multiple-testing-adjusted claim. Coverage losses are reported separately. No percentage or threshold was selected from results.", "");
    table("One-Run Layoff Interaction", layoffRows);
    lines.push("Layoff here is measured since the last usable Turf run, not the last run on any surface. TPR applies no layoff term. Missing layoff is explicitly retained.", "");
    table("One-Run Rank-1 Race Types", typeRows);
    table("One-Run Rank-1 Age Groups", ageRows);
    table("Race-Type Controls Across History Groups", confoundingRows);
    const replay = makeRaces(rankRows(targetRows))[0];
    if (!replay) throw new Error("Missing Exactly Right race");
    const replayRows = variants.map(v => {
      const x = replay.ranked[v].find(x => x.entry.row.features.horseName === "Exactly Right");
      if (!x) throw new Error("Missing Exactly Right runner");
      const rival = replay.ranked[v].find(r => r.entry !== x.entry && (v !== "D" || r.entry.depth >= 2));
      return { variant: v, score: fmt(x.score), "score rank": rankings(replay.entries, v === "D" ? "A" : v).find(r => r.entry === x.entry)?.rank, "analytical rank": x.rank, "signed margin vs strongest eligible rival": fmt(rival ? x.score - rival.score : null), "eligible rank 1": v !== "D" && x.rank === 1, "selected horse": replay.ranked[v].find(r => r.rank === 1 && (v !== "D" || r.entry.depth >= 2))?.entry.row.features.horseName, "usable history": x.entry.depth, "days since usable Turf run": x.entry.days, "Today days since any run": x.entry.row.features.daysSinceLastRun };
    });
    table("Exactly Right Current Database Replay", replayRows);
    lines.push(`Race ${replay.id}, source race 941161. Recomputed from current chronology-safe historical feature path. This is separately identified from the previously frozen Today display, so a changed current replay is not silently presented as the old snapshot. D leaves Exactly Right's score unchanged but removes eligibility; its signed score margin is not an analytical lead.`, "");
    const importVersion = await connection.db.select({ count: sql<number>`count(*)::int`, latest: sql<string>`max(${races.raceDate})` }).from(races).innerJoin(sourceImports, and(eq(sourceImports.sourceId, races.sourceId), eq(sourceImports.source, "sporting_life"), eq(sourceImports.sourceType, "full-result-next-data"))).where(and(eq(races.source, "sporting_life"), sql`${races.raceDate} >= '2026-01-01'`, sql`${races.raceDate} <= '2026-10-01'`));
    table("Database Result Coverage Check", importVersion);
    await writeFile(output, `${lines.join("\n")}\n`);
    await writeFile("/tmp/tpr-one-run-history-diagnostic-results.json", JSON.stringify({ results, provenance, populations, distributions, treatmentRows, pairRows, layoffRows, typeRows, ageRows, depthRows, replayRows }, null, 2));
    console.log(`Wrote ${output}`);
  } finally { await connection.client.end(); }
}
function paired(racesInput: Race[], v: Variant) {
  const strike: number[] = []; const top3: number[] = []; const capture: number[] = [];
  for (const r of racesInput) {
    const a = r.ranked.A.find(x => x.rank === 1);
    const b = r.ranked[v].find(x => x.rank === 1 && (v !== "D" || x.entry.depth >= 2));
    if (a && b && outcomeKnown(a.entry) && outcomeKnown(b.entry)) {
      strike.push(Number(winner(b.entry)) - Number(winner(a.entry)));
      top3.push(Number((b.entry.row.outcome.finishingPosition ?? Infinity) <= 3) - Number((a.entry.row.outcome.finishingPosition ?? Infinity) <= 3));
    }
    if (r.entries.some(e => winner(e) && outcomeKnown(e))) capture.push(Number(r.ranked[v].some(x => x.rank <= 3 && winner(x.entry))) - Number(r.ranked.A.some(x => x.rank <= 3 && winner(x.entry))));
  }
  function interval(xs: number[]) {
    if (!xs.length) return "missing";
    const m = mean(xs)!;
    const se = xs.length > 1 ? Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1) / xs.length) : 0;
    return `${fmt(m * 100, 2)} pp [${fmt((m - 1.96 * se) * 100, 2)}, ${fmt((m + 1.96 * se) * 100, 2)}]`;
  }
  return { "paired selection races": strike.length, "strike delta [95% CI]": interval(strike), "rank-1 top3 delta [95% CI]": interval(top3), "winner capture delta [95% CI]": interval(capture) };
}
async function appendLatestRunLayoff() {
  const audit: { populations: { year: string; history: number | string; "total rated runners": number; "rank-1 races": number }[]; depthRows: { year: string; "actual history": number | string; "TPR reconstructed depth": number; runners: number }[] } = JSON.parse(await readFile("/tmp/tpr-one-run-history-diagnostic-results.json", "utf8"));
  if (audit.depthRows.some(r => r["actual history"] !== 1 && r["TPR reconstructed depth"] === 1 && r.runners > 0)) throw new Error("Cannot identify actual one-run group using verified equivalent input depth");
  const connection = createDbConnection();
  try {
    const rowsForReport = [];
    for (const year of ["2025", "2026"]) {
      const cache = await loadLatestBacktestFeatureCacheForYear({ family: "turf_flat", year });
      if (!cache) throw new Error("Missing cache");
      if (year === "2026") {
        const extra = await connection.db.select({ id: raceRunners.id, raceName: races.raceName, raceType: races.raceType, raceTypeCode: races.raceTypeCode, surface: sql<string | null>`${sourceImports.payload} #>> '{props,pageProps,race,race_summary,course_surface,surface}'` }).from(raceRunners).innerJoin(races, eq(raceRunners.raceId, races.id)).innerJoin(sourceImports, and(eq(sourceImports.sourceId, races.sourceId), eq(sourceImports.source, races.source), eq(sourceImports.sourceType, "full-result-next-data"))).where(and(eq(races.source, "sporting_life"), eq(raceRunners.source, "sporting_life"), sql`${races.raceDate} > '2026-09-19'`, sql`${races.raceDate} <= '2026-09-30'`));
        const ids = extra.filter(isOrdinaryFlatTurfRace).map(r => r.id);
        const fresh = await getHistoricalTargetRunnerMetrics(connection.db, { targetRunnerIds: ids, ratingFamily: "turf" });
        cache.rows.push(...fresh.filter(r => r.features.raceCode === "turf"));
      }
      const byRace = new Map<string, Entry[]>();
      for (const row of rankRows(cache.rows)) {
        const entries = byRace.get(row.features.targetRaceId) ?? [];
        entries.push({ row, depth: row.turfPerformance?.historyDepth === 1 ? 1 : 2, days: row.features.daysSinceLastRun, weight: null });
        byRace.set(row.features.targetRaceId, entries);
      }
      const racesInput: Race[] = [...byRace].map(([id, entries]) => {
        const active = entries.filter(e => e.row.outcome.resultStatus !== "non_runner");
        const rated = active.filter(e => e.row.turfPerformance).length;
        const a = rankings(entries, "A");
        return { id, entries, eligible: isRatingCoverageEligible({ ratedRunnerCount: rated, ratingCoverage: active.length ? rated / active.length : 0 }), ranked: { A: a, B: a, C: a, D: a } };
      });
      const expected = audit.populations.find(p => p.year === year && p.history === 1)!;
      const actual = racesInput.flatMap(r => r.ranked.A).filter(r => r.entry.depth === 1).length;
      const guardRaces = racesInput.filter(r => r.eligible);
      const actualTops = stats(guardRaces, "A", e => e.depth === 1)["rank-1 races"];
      if (actual !== expected["total rated runners"] || actualTops !== expected["rank-1 races"]) throw new Error(`Latest-run population mismatch ${year}: ${actual}/${actualTops}`);
      for (const band of ["<=90", "91-180", ">180", "missing"]) {
        const metrics = stats(guardRaces, "A", e => e.depth === 1 && (band === "missing" ? e.days === null : e.days !== null && (band === "<=90" ? e.days <= 90 : band === "91-180" ? e.days > 90 && e.days <= 180 : e.days > 180)));
        rowsForReport.push({ year, "days since ANY prior run": band, runners: metrics["analytically ranked runners"], "rank-1 races": metrics["rank-1 races"], "observed rank-1": metrics["settled rank-1"], strike: metrics["rank-1 strike"], "rank-1 top3 finish": metrics["rank-1 finish <=3"], "group-winner top3 capture": metrics["top-3 capture (group winners)"], "winner mean rank": metrics["winner mean rank"], Spearman: metrics.Spearman, "normalized Spearman": metrics["normalized Spearman"], "association n": metrics["association n"] });
      }
      console.log(`${year}: latest-run layoff population matched ${actual} one-run horses and ${actualTops} rank-1 races`);
    }
    table("One-Run Actual Absence Since Any Run", rowsForReport);
    lines.push("This table uses the chronology-safe daysSinceLastRun input used by Today, including intervening AW/other runs. The independent actual-history audit established that reconstructed depth 1 exactly matches actual one-run history in this population, and runner/rank-1 counts were checked against the full audit before appending. The Turf-evidence table above instead measures staleness of the usable Turf evidence. Neither measure enters TPR_S2_V1.", "");
    await writeFile(output, `${await readFile(output, "utf8")}\n${lines.join("\n")}\n`);
    await writeFile("/tmp/tpr-one-run-latest-run-layoff.json", JSON.stringify(rowsForReport, null, 2));
  } finally { await connection.client.end(); }
}
if (process.argv.includes("--append-latest-run-layoff")) await appendLatestRunLayoff();
else await main();
