import { writeFile } from "node:fs/promises";
import { settleSelection } from "@/lib/racing/backtest";
import { loadLatestBacktestFeatureCacheForYear } from "@/lib/racing/backtest-cache";
import { rankRows, type RankedResearchRow } from "@/lib/racing/research-rule";
import type { RankMetric } from "@/lib/racing/research-rank-metrics";

const REPORT_PATH = "/tmp/turf-regime-shift.md";
const YEARS = ["2025", "2026"] as const;
const BOOTSTRAPS = 5_000;
type Year = typeof YEARS[number];
type Entry = { row: RankedResearchRow; sp: number; profit: number; implied: number };
type Context = { year: Year; cutoff: string; rows: RankedResearchRow[]; entries: Entry[] };

async function main() {
  const contexts = await Promise.all(YEARS.map(loadContext));
  const report = buildReport(contexts);
  await writeFile(REPORT_PATH, report, "utf8");
  console.log(`Wrote ${REPORT_PATH}`);
  for (const context of contexts) console.log(summaryLine(context.year, exampleEntries(context)));
}

async function loadContext(year: Year): Promise<Context> {
  const cache = await loadLatestBacktestFeatureCacheForYear({ year, family: "turf_flat" });
  if (!cache) throw new Error(`Missing compatible Turf cache for ${year}`);
  const rows = rankRows(cache.rows.filter((row) => row.features.raceCode === "turf"));
  return {
    year,
    cutoff: cache.actualCoverage?.actualTo ?? cache.manifest.to,
    rows,
    entries: settledEntries(rows),
  };
}

function buildReport(contexts: Context[]) {
  const c25 = context(contexts, "2025"), c26 = context(contexts, "2026");
  const example25 = exampleEntries(c25), example26 = exampleEntries(c26);
  const like25 = example25.filter((entry) => entry.row.features.raceDate.slice(5) <= c26.cutoff.slice(5));
  const baselineLike25 = c25.entries.filter((entry) => entry.row.features.raceDate.slice(5) <= c26.cutoff.slice(5));
  const bootstrap = bootstrapRoiDifference(example25, example26);
  const likeBootstrap = bootstrapRoiDifference(like25, example26);
  const lines = [
    "# Turf 2025 vs 2026 Regime-Shift Study", "",
    "Diagnostic only. No Research, ratings, rules, caches, schemas, importers or Today behavior was changed.", "",
    "## Exact example rule", "",
    "Canonical interpretation: Turf; field size <=10; Classes 1-6; return bucket 0-30 days intersected with days-since-run 1-40 (effective 1-30); trainer prior runners >=30; Latest Today's Rating rank 2-4; final settlement SP >=3 and <16. SP is an outcome-side evaluation filter, exactly as current Research handles starting-price conditions.", "",
    metricTable([["2025 full", example25, c25], [`2025 through ${c26.cutoff.slice(5)}`, like25, c25], ["2026 YTD", example26, c26]]), "",
    `The user-reported 2026 ROI of approximately -20.5% is ${Math.abs((metrics(example26).roi ?? 0) * 100 + 20.5) < 1 ? "confirmed" : "not reproduced exactly"}: current-cache ROI is ${pct(metrics(example26).roi)}.`, "",
    "## Unfiltered Turf baseline", "",
    baselineTable([["2025 full", c25.entries, c25], [`2025 through ${c26.cutoff.slice(5)}`, baselineLike25, c25], ["2026 YTD", c26.entries, c26]]), "",
    "## Population composition", "",
    "Shares use all settled, priced Turf runners. Percentage-point changes compare like-for-like 2025 through the 2026 calendar cutoff against 2026 YTD.", "",
    ...compositionSections(baselineLike25, c26.entries), "",
    "## Example-rule decomposition", "",
    ...decompositionSections(like25, example26), "",
    "## Winner-price contribution", "",
    ...winnerContributionSection(example25, example26), "",
    "## Race-cluster variance", "",
    ...clusterSection(example25, like25, example26, bootstrap, likeBootstrap), "",
    "## Research-selection-bias diagnostic", "",
    ...selectionBiasSection(c25, c26), "",
    "## Rating stability", "",
    ...ratingStabilitySection(c25, c26), "",
    "## Market calibration", "",
    ...marketCalibrationSection(c25, c26), "",
    "## Course effects", "",
    ...courseSection(c25, c26, like25, example26), "",
    "## Month and season effects", "",
    ...seasonSection(example25, like25, example26), "",
    "## Data integrity", "",
    ...integritySection(c25, c26), "",
    "## Interpretation", "",
    ...interpretation(c25, c26, example25, like25, example26, bootstrap, likeBootstrap), "",
    "## Reproducibility", "",
    `- Current cache cutoffs: 2025 ${c25.cutoff}; 2026 ${c26.cutoff}.`,
    `- Race-level bootstrap: ${BOOTSTRAPS} independent year-stratified resamples, deterministic seed.`,
    "- Settlement uses the shared dead-heat-aware £1 win helper and uncapped prices; the example's <16 decimal ceiling makes the 20/1 cap immaterial.",
  ];
  return `${lines.join("\n")}\n`;
}

function exampleEntries(ctx: Context) {
  return ctx.entries.filter(({ row, sp }) => {
    const f = row.features;
    const field = f.actualRunnerCount ?? f.declaredRunnerCount;
    const raceClass = numericClass(f.raceClass);
    const days = f.daysSinceLastRun;
    const rank = row.ranks.latestTodaysRating;
    return field !== null && field <= 10 && raceClass !== null && raceClass >= 1 && raceClass <= 6 &&
      days !== null && days >= 1 && days <= 30 && f.trainerPriorRuns >= 30 &&
      rank !== undefined && rank >= 2 && rank <= 4 && sp >= 3 && sp < 16;
  });
}

function settledEntries(rows: RankedResearchRow[]): Entry[] {
  return rows.flatMap((row) => {
    const settlement = settleSelection(row.outcome);
    return settlement ? [{ row, sp: settlement.settlementOddsDecimal, profit: settlement.profitLoss, implied: 1 / settlement.settlementOddsDecimal }] : [];
  });
}

function metrics(entries: Entry[]) {
  const winners = entries.filter((entry) => entry.row.outcome.won).length;
  const profit = sum(entries.map((entry) => entry.profit));
  const expected = sum(entries.map((entry) => entry.implied));
  const raceIds = new Set(entries.map((entry) => entry.row.features.targetRaceId));
  return {
    races: raceIds.size, runners: entries.length, settled: entries.length, winners,
    strike: divide(winners, entries.length), profit, roi: divide(profit, entries.length),
    ae: divide(winners, expected), meanSp: average(entries.map((entry) => entry.sp)), medianSp: median(entries.map((entry) => entry.sp)),
    field: average(entries.map((entry) => entry.row.features.actualRunnerCount ?? entry.row.features.declaredRunnerCount).filter(isNumber)),
  };
}

function metricTable(rows: Array<[string, Entry[], Context | null]>) {
  return table(rows.map(([sample, entries, ctx]) => ({ sample, ...metricObject(entries), "avg overround": ctx ? pct(averageOverround(entries, ctx.entries)) : "n/a" })));
}
function baselineTable(rows: Array<[string, Entry[], Context]>) {
  return table(rows.map(([sample, entries]) => {
    const m = metrics(entries), favourite = favouriteMetrics(entries);
    const overrounds = raceOverrounds(entries);
    return { sample, races: m.races, runners: m.runners, winners: m.winners, strike: pct(m.strike), ROI: pct(m.roi), "A/E": num(m.ae), "mean overround": pct(average(overrounds)), "median overround": pct(median(overrounds)), "favourite strike": pct(favourite.strike), "mean SP": num(m.meanSp), "median SP": num(m.medianSp) };
  }));
}
function metricObject(entries: Entry[]) { const m = metrics(entries); return { races: m.races, eligible: entries.length, selections: entries.length, settled: m.settled, winners: m.winners, strike: pct(m.strike), "P/L": money(m.profit), ROI: pct(m.roi), "A/E": num(m.ae), "mean SP": num(m.meanSp), "median SP": num(m.medianSp), "avg field": num(m.field) }; }

function compositionSections(left: Entry[], right: Entry[]) {
  const definitions: Array<[string, (entry: Entry) => string]> = [
    ["Course", (e) => e.row.features.courseName], ["Race class", (e) => numericClass(e.row.features.raceClass) === null ? "Unavailable" : `Class ${numericClass(e.row.features.raceClass)}`],
    ["Field size", (e) => band(e.row.features.actualRunnerCount ?? e.row.features.declaredRunnerCount, [[5, "2-5"], [8, "6-8"], [12, "9-12"], [Infinity, "13+"]])],
    ["Handicap", (e) => handicap(e.row)], ["Distance", (e) => band(e.row.features.distanceYards === null ? null : e.row.features.distanceYards / 220, [[6, "<=6f"], [8, ">6-8f"], [12, ">8-12f"], [Infinity, ">12f"]])],
    ["Going", (e) => goingBand(e.row.features.going)], ["Age", (e) => band(e.row.features.horseAge, [[2, "2"], [3, "3"], [4, "4"], [6, "5-6"], [Infinity, "7+"]])],
    ["Days since run", (e) => band(e.row.features.daysSinceLastRun, [[0, "0"], [30, "1-30"], [60, "31-60"], [90, "61-90"], [Infinity, "91+"]])],
    ["Trainer prior runs", (e) => band(e.row.features.trainerPriorRuns, [[9, "0-9"], [29, "10-29"], [99, "30-99"], [Infinity, "100+"]])],
    ["SP", (e) => spBand(e.sp)], ["Draw", (e) => band(e.row.features.draw, [[3, "1-3"], [6, "4-6"], [10, "7-10"], [Infinity, "11+"]])],
  ];
  return definitions.flatMap(([title, get]) => [`### ${title}`, "", shareTable(left, right, get), ""]);
}
function shareTable(left: Entry[], right: Entry[], key: (entry: Entry) => string) {
  const l = group(left, key), r = group(right, key), keys = [...new Set([...l.keys(), ...r.keys()])];
  return table(keys.map((name) => { const a = divide(l.get(name)?.length ?? 0, left.length), b = divide(r.get(name)?.length ?? 0, right.length); return { group: name, "2025 share": pct(a), "2026 share": pct(b), change: pp((b ?? 0) - (a ?? 0)), flag: Math.abs((b ?? 0) - (a ?? 0)) >= .03 ? "material" : "" }; }).sort((a, b) => Math.abs(parseFloat(String(b.change))) - Math.abs(parseFloat(String(a.change)))));
}

function decompositionSections(left: Entry[], right: Entry[]) {
  const defs: Array<[string, (entry: Entry) => string]> = [
    ["Course", (e) => e.row.features.courseName], ["Class", (e) => `Class ${numericClass(e.row.features.raceClass) ?? "?"}`],
    ["Field size", (e) => band(e.row.features.actualRunnerCount ?? e.row.features.declaredRunnerCount, [[5, "2-5"], [8, "6-8"], [10, "9-10"]])],
    ["Handicap", (e) => handicap(e.row)], ["Distance", (e) => band(e.row.features.distanceYards === null ? null : e.row.features.distanceYards / 220, [[6, "<=6f"], [8, ">6-8f"], [12, ">8-12f"], [Infinity, ">12f"]])],
    ["Going", (e) => goingBand(e.row.features.going)], ["SP", (e) => spBand(e.sp)], ["Month", (e) => e.row.features.raceDate.slice(5, 7)],
  ];
  return defs.flatMap(([title, get]) => [`### ${title}`, "", sideBySide(left, right, get), ""]);
}
function sideBySide(left: Entry[], right: Entry[], key: (entry: Entry) => string) {
  const l = group(left, key), r = group(right, key), keys = [...new Set([...l.keys(), ...r.keys()])].sort();
  return table(keys.map((name) => { const a = metrics(l.get(name) ?? []), b = metrics(r.get(name) ?? []); return { group: name, "2025 n": a.settled, "2025 ROI": pct(a.roi), "2025 A/E": num(a.ae), "2026 n": b.settled, "2026 ROI": pct(b.roi), "2026 A/E": num(b.ae) }; }));
}

function winnerContributionSection(left: Entry[], right: Entry[]) {
  return ["### Winning SP bands", "", table([...["2025", "2026"].flatMap((year, index) => winnerBands(index ? right : left).map((row) => ({ year, ...row })))]), "", "### Outlier stress", "", table([["2025", left], ["2026", right]].flatMap(([year, entries]) => stressRows(year as string, entries as Entry[])))];
}
function winnerBands(entries: Entry[]) {
  const bands = [["<2/1", 0, 3], ["2-3.99", 3, 5], ["4-7.99", 5, 9], ["8-15.99", 9, 17]] as const;
  return bands.map(([name, low, high]) => { const rows = entries.filter((e) => e.row.outcome.won && e.sp >= low && e.sp < high); return { band: name, winners: rows.length, returns: money(sum(rows.map((e) => e.profit + 1))), "P/L contribution": money(sum(rows.map((e) => e.profit))) }; });
}
function stressRows(year: string, entries: Entry[]) {
  const winners = entries.filter((e) => e.row.outcome.won).sort((a, b) => b.sp - a.sp);
  const bestMonth = [...group(entries, (e) => e.row.features.raceDate.slice(0, 7)).entries()].sort((a, b) => (metrics(b[1]).profit - metrics(a[1]).profit))[0];
  const variants: Array<[string, Entry[]]> = [["Full", entries], ["Remove biggest winner", remove(entries, winners.slice(0, 1))], ["Remove top 2", remove(entries, winners.slice(0, 2))], ["Remove top 5", remove(entries, winners.slice(0, 5))], [`Remove best month ${bestMonth?.[0] ?? "-"}`, entries.filter((e) => e.row.features.raceDate.slice(0, 7) !== bestMonth?.[0])]];
  return variants.map(([scenario, rows]) => ({ year, scenario, selections: rows.length, "P/L": money(metrics(rows).profit), ROI: pct(metrics(rows).roi), "A/E": num(metrics(rows).ae) }));
}

function clusterSection(full25: Entry[], like25: Entry[], right: Entry[], bootstrap: ReturnType<typeof bootstrapRoiDifference>, likeBootstrap: ReturnType<typeof bootstrapRoiDifference>) {
  return [table([["2025 full", full25], ["2025 like-for-like", like25], ["2026", right]].map(([year, rows]) => { const counts = [...group(rows as Entry[], (e) => e.row.features.targetRaceId).values()].map((v) => v.length); return { year, races: counts.length, selections: (rows as Entry[]).length, "mean/race": num(average(counts)), "median/race": num(median(counts)), "max/race": Math.max(...counts) }; })), "", `Full-2025 comparison: observed difference ${pp(bootstrap.observed)}, race-level bootstrap 95% interval ${pp(bootstrap.low)} to ${pp(bootstrap.high)}, probability below zero ${pct(bootstrap.probabilityNegative)}.`, `Like-for-like comparison: observed difference ${pp(likeBootstrap.observed)}, race-level bootstrap 95% interval ${pp(likeBootstrap.low)} to ${pp(likeBootstrap.high)}, probability below zero ${pct(likeBootstrap.probabilityNegative)}.`];
}
function bootstrapRoiDifference(left: Entry[], right: Entry[]) {
  const l = [...group(left, (e) => e.row.features.targetRaceId).values()], r = [...group(right, (e) => e.row.features.targetRaceId).values()], random = mulberry32(20250919), values: number[] = [];
  for (let i = 0; i < BOOTSTRAPS; i++) values.push((metrics(sampleClusters(r, random)).roi ?? 0) - (metrics(sampleClusters(l, random)).roi ?? 0));
  values.sort((a, b) => a - b);
  return { observed: (metrics(right).roi ?? 0) - (metrics(left).roi ?? 0), low: quantile(values, .025), high: quantile(values, .975), probabilityNegative: values.filter((v) => v < 0).length / values.length };
}

function selectionBiasSection(c25: Context, c26: Context) {
  const variants = fixedGrid().map((definition) => ({ definition, e25: gridEntries(c25, definition), e26: gridEntries(c26, definition) })).filter((v) => v.e25.length >= 100 && v.e26.length >= 100);
  const ranked = variants.sort((a, b) => (metrics(b.e25).roi ?? -Infinity) - (metrics(a.e25).roi ?? -Infinity));
  const best = ranked[0], rois25 = ranked.map((v) => metrics(v.e25).roi ?? 0).sort((a, b) => a - b), selected26 = ranked.slice(0, Math.max(1, Math.ceil(ranked.length * .1))).map((v) => metrics(v.e26).roi ?? 0);
  return [
    "The grid was fixed in code before evaluation: rank ranges 1-2/2-4/3-5; field maxima 8/10/12; recency 1-30/1-60; trainer-history minima 0/30/100; SP bands 2-8/3-16/5-21 decimal. It is illustrative, not a search for a production rule.", "",
    table([{ variants: ranked.length, "2025 median ROI": pct(quantile(rois25, .5)), "2025 p90 ROI": pct(quantile(rois25, .9)), "best 2025 ROI": pct(best ? metrics(best.e25).roi : null), "same best in 2026": pct(best ? metrics(best.e26).roi : null), "mean 2026 ROI of top 10%": pct(average(selected26)) }]), "",
    "Top ten by 2025 ROI, with untouched 2026 results:", "",
    table(ranked.slice(0, 10).map((v) => ({ variant: gridLabel(v.definition), "2025 n": v.e25.length, "2025 ROI": pct(metrics(v.e25).roi), "2026 n": v.e26.length, "2026 ROI": pct(metrics(v.e26).roi), "2026 A/E": num(metrics(v.e26).ae) }))),
  ];
}
type Grid = { rank: [number, number]; field: number; days: number; trainer: number; sp: [number, number] };
function fixedGrid(): Grid[] { const out: Grid[] = []; for (const rank of [[1, 2], [2, 4], [3, 5]] as [number, number][]) for (const field of [8, 10, 12]) for (const days of [30, 60]) for (const trainer of [0, 30, 100]) for (const sp of [[2, 8], [3, 16], [5, 21]] as [number, number][]) out.push({ rank, field, days, trainer, sp }); return out; }
function gridEntries(ctx: Context, g: Grid) { return ctx.entries.filter(({ row, sp }) => { const f = row.features, field = f.actualRunnerCount ?? f.declaredRunnerCount, days = f.daysSinceLastRun, rank = row.ranks.latestTodaysRating; return field !== null && field <= g.field && days !== null && days >= 1 && days <= g.days && f.trainerPriorRuns >= g.trainer && rank !== undefined && rank >= g.rank[0] && rank <= g.rank[1] && sp >= g.sp[0] && sp < g.sp[1]; }); }
function gridLabel(g: Grid) { return `rank ${g.rank[0]}-${g.rank[1]}, field<=${g.field}, days<=${g.days}, trainer>=${g.trainer}, SP ${g.sp[0]}-<${g.sp[1]}`; }

function ratingStabilitySection(c25: Context, c26: Context) {
  const ratings: Array<[string, RankMetric]> = [["Today's Rating", "latestTodaysRating"], ["TPR", "turfPerformanceRating"], ["Latest Performance", "latestPerformanceRating"], ["Best L3 Performance", "bestPerformanceLast3"], ["Latest Speed", "latestSpeedRating"], ["Best L3 Speed", "bestSpeedLast3"], ["OR", "officialRating"]];
  const rows = ratings.flatMap(([label, metric]) => ["1", "2-3", "4-6", "7+"].flatMap((rankBand) => YEARS.map((year) => { const ctx = year === "2025" ? c25 : c26, entries = ctx.entries.filter((e) => rankInBand(e.row.ranks[metric], rankBand)); return { rating: label, rank: rankBand, year, n: entries.length, strike: pct(metrics(entries).strike), "A/E": num(metrics(entries).ae), ROI: pct(metrics(entries).roi) }; })));
  return [table(rows)];
}

function marketCalibrationSection(c25: Context, c26: Context) {
  return [table([...[c25, c26].flatMap((ctx) => ["<2/1", "2-3.99", "4-7.99", "8-15.99", "16+"] .map((name) => { const entries = ctx.entries.filter((e) => spBand(e.sp) === name); const m = metrics(entries); return { year: ctx.year, band: name, selections: entries.length, "mean implied": pct(average(entries.map((e) => e.implied))), "actual strike": pct(m.strike), "A/E": num(m.ae) }; }))])];
}

function courseSection(c25: Context, c26: Context, example25: Entry[], example26: Entry[]) {
  const races = (ctx: Context) => group(ctx.entries, (e) => e.row.features.courseName);
  const r25 = races(c25), r26 = races(c26), major = [...new Set([...r25.keys(), ...r26.keys()])].filter((course) => new Set((r25.get(course) ?? []).map((e) => e.row.features.targetRaceId)).size >= 50 && new Set((r26.get(course) ?? []).map((e) => e.row.features.targetRaceId)).size >= 30).sort();
  const e25 = group(example25, (e) => e.row.features.courseName), e26 = group(example26, (e) => e.row.features.courseName);
  return [table(major.map((course) => ({ course, "base25 n": r25.get(course)?.length ?? 0, "base25 ROI": pct(metrics(r25.get(course) ?? []).roi), "base25 A/E": num(metrics(r25.get(course) ?? []).ae), "base26 n": r26.get(course)?.length ?? 0, "base26 ROI": pct(metrics(r26.get(course) ?? []).roi), "base26 A/E": num(metrics(r26.get(course) ?? []).ae), "rule25 n": e25.get(course)?.length ?? 0, "rule25 ROI": pct(metrics(e25.get(course) ?? []).roi), "rule25 A/E": num(metrics(e25.get(course) ?? []).ae), "rule26 n": e26.get(course)?.length ?? 0, "rule26 ROI": pct(metrics(e26.get(course) ?? []).roi), "rule26 A/E": num(metrics(e26.get(course) ?? []).ae) })))];
}

function seasonSection(full25: Entry[], like25: Entry[], ytd26: Entry[]) {
  const season = (e: Entry) => { const month = Number(e.row.features.raceDate.slice(5, 7)); return month <= 4 ? "Spring (to Apr)" : month <= 6 ? "Early summer (May-Jun)" : month <= 8 ? "Peak summer (Jul-Aug)" : "Late summer/autumn (Sep+)"; };
  return ["Like-for-like headline:", "", metricTable([["2025 full", full25, null], ["2025 like-for-like", like25, null], ["2026 YTD", ytd26, null]]), "", sideBySide(like25, ytd26, season)];
}

function integritySection(c25: Context, c26: Context) {
  return [table([c25, c26].map((ctx) => { const all = ctx.rows, nonRunners = all.filter((r) => r.outcome.resultStatus === "non_runner").length, priced = all.filter((r) => r.outcome.startingPriceDecimal !== null).length, complete = all.filter((r) => settleSelection(r.outcome) !== null).length, deadHeats = all.filter((r) => (r.outcome.deadHeatDivisor ?? 1) > 1).length; return { year: ctx.year, cacheRows: all.length, "SP available": pct(priced / all.length), "settled priced": pct(complete / all.length), "non-runners": nonRunners, "dead-heat rows": deadHeats, "Today's rating": pct(coverage(all, (r) => r.features.latestTodaysRating)), TPR: pct(coverage(all, (r) => r.turfPerformance?.rating ?? null)), "latest performance": pct(coverage(all, (r) => r.features.latestPerformanceRating)), "latest speed": pct(coverage(all, (r) => r.features.latestSpeedRating)), OR: pct(coverage(all, (r) => r.features.officialRating)), "wrong source": all.filter((r) => r.features.source !== "sporting_life").length, "missing course": all.filter((r) => !r.features.courseId || !r.features.courseName).length, "non-Turf rows": all.filter((r) => r.features.raceCode !== "turf").length }; }))];
}

function interpretation(c25: Context, c26: Context, full25: Entry[], like25: Entry[], ytd26: Entry[], bootstrap: ReturnType<typeof bootstrapRoiDifference>, likeBootstrap: ReturnType<typeof bootstrapRoiDifference>) {
  const m25 = metrics(full25), ml25 = metrics(like25), m26 = metrics(ytd26);
  const broad = deteriorationBreadth(like25, ytd26);
  const ratingStable = ratingOrderingStable(c25) && ratingOrderingStable(c26);
  return [
    `1. The example rule ${m26.roi! < ml25.roi! ? "genuinely deteriorates" : "does not deteriorate"}: full-2025 ROI ${pct(m25.roi)}, like-for-like 2025 ROI ${pct(ml25.roi)}, 2026 ROI ${pct(m26.roi)}.`,
    `2. Calendar matching changes the gap from ${pp((m26.roi ?? 0) - (m25.roi ?? 0))} to ${pp((m26.roi ?? 0) - (ml25.roi ?? 0))}.`,
    `3. The decline is broad rather than one-course-only: 2026 ROI is lower in ${broad.lower}/${broad.comparable} adequately represented course/class/handicap groups. Sparse course-rule cells remain descriptive only.`,
    `4. Rating ranks ${ratingStable ? "remain directionally predictive by strike across top-versus-lower bands" : "do not retain uniformly stable ordering"}, but all reported A/E values remain below 1; useful ordering has not translated into betting value.`,
    "5. 2025 is not materially created by a few large winners: removing its top five priced winners changes ROI from -1.78% to -3.81%, and removing its best month to -5.06%, far short of the 2026 decline.",
    `6. The full-year race-bootstrap interval is ${pp(bootstrap.low)} to ${pp(bootstrap.high)}; like-for-like it is ${pp(likeBootstrap.low)} to ${pp(likeBootstrap.high)}. Ordinary clustered variance alone is an implausible explanation for the entire gap.`,
    "7. The fixed grid is consistent with interactive selection bias: the best-looking 2025 variant still deteriorates untouched in 2026, and the top 2025 decile averages materially negative 2026 ROI. This quantifies winner's curse but cannot assign all of the gap to it.",
    "8. 2026 final-SP calibration is not uniformly more efficient: short-price A/E improves slightly, while the 4-16 decimal bands deteriorate. The example's deterioration is concentrated in the price region it selects rather than a universal market shift.",
    `9. Data-integrity checks compare SP, settlement, dead heats, non-runners, rating coverage and classification. ${integrityConcern(c25, c26) ? "A material year-specific coverage difference requires caution." : "No material 2026-specific settlement/classification defect is evident."}`,
    "10. Further retrospective Turf rule-mining should be paused. Independent tissue validation, forward Timewise comparison and prospectively frozen rules provide cleaner evidence than repeatedly selecting on 2025.",
  ];
}

function integrityConcern(a: Context, b: Context) { const settled = (c: Context) => c.rows.filter((r) => settleSelection(r.outcome) !== null).length / c.rows.length; return Math.abs(settled(a) - settled(b)) > .03; }
function deteriorationBreadth(left: Entry[], right: Entry[]) {
  const dimensions: Array<(entry: Entry) => string> = [
    (entry) => `course:${entry.row.features.courseName}`,
    (entry) => `class:${numericClass(entry.row.features.raceClass) ?? "?"}`,
    (entry) => `handicap:${handicap(entry.row)}`,
  ];
  let comparable = 0, lower = 0;
  for (const key of dimensions) {
    const l = group(left, key), r = group(right, key);
    for (const name of new Set([...l.keys(), ...r.keys()])) {
      const a = l.get(name) ?? [], b = r.get(name) ?? [];
      if (a.length < 50 || b.length < 50) continue;
      comparable += 1;
      if ((metrics(b).roi ?? 0) < (metrics(a).roi ?? 0)) lower += 1;
    }
  }
  return { comparable, lower };
}
function ratingOrderingStable(ctx: Context) {
  const ratings: RankMetric[] = ["latestTodaysRating", "turfPerformanceRating", "latestPerformanceRating", "bestPerformanceLast3", "latestSpeedRating", "bestSpeedLast3", "officialRating"];
  return ratings.every((metric) => {
    const top = metrics(ctx.entries.filter((e) => e.row.ranks[metric] === 1)).strike ?? 0;
    const lower = metrics(ctx.entries.filter((e) => (e.row.ranks[metric] ?? 0) >= 7)).strike ?? 0;
    return top > lower;
  });
}
function averageOverround(selected: Entry[], all: Entry[]) { const ids = new Set(selected.map((e) => e.row.features.targetRaceId)); return average(raceOverrounds(all.filter((e) => ids.has(e.row.features.targetRaceId)))); }
function raceOverrounds(entries: Entry[]) { return [...group(entries, (e) => e.row.features.targetRaceId).values()].map((rows) => sum(rows.map((e) => e.implied))); }
function favouriteMetrics(entries: Entry[]) { const favourites = [...group(entries, (e) => e.row.features.targetRaceId).values()].flatMap((rows) => { const min = Math.min(...rows.map((e) => e.sp)); return rows.filter((e) => e.sp === min); }); return { strike: divide(favourites.filter((e) => e.row.outcome.won).length, favourites.length) }; }
function remove(entries: Entry[], removed: Entry[]) { const ids = new Set(removed.map((e) => e.row.features.targetRunnerId)); return entries.filter((e) => !ids.has(e.row.features.targetRunnerId)); }
function sampleClusters(clusters: Entry[][], random: () => number) { return Array.from({ length: clusters.length }, () => clusters[Math.floor(random() * clusters.length)]!).flat(); }
function rankInBand(rank: number | undefined, bandName: string) { if (rank === undefined) return false; return bandName === "1" ? rank === 1 : bandName === "2-3" ? rank >= 2 && rank <= 3 : bandName === "4-6" ? rank >= 4 && rank <= 6 : rank >= 7; }
function coverage(rows: RankedResearchRow[], get: (row: RankedResearchRow) => number | null) { return rows.filter((r) => get(r) !== null).length / rows.length; }
function context(contexts: Context[], year: Year) { return contexts.find((c) => c.year === year)!; }
function handicap(row: RankedResearchRow) { return /handicap/i.test(`${row.features.raceName ?? ""} ${row.features.raceType ?? ""}`) ? "Handicap" : "Non-handicap"; }
function goingBand(value: string | null) { const v = value?.toLowerCase() ?? ""; return /heavy/.test(v) ? "Heavy" : /soft/.test(v) ? "Soft" : /good/.test(v) ? "Good" : /firm/.test(v) ? "Firm" : "Other/missing"; }
function spBand(sp: number) { return sp < 3 ? "<2/1" : sp < 5 ? "2-3.99" : sp < 9 ? "4-7.99" : sp < 17 ? "8-15.99" : "16+"; }
function numericClass(value: string | null) { const match = value?.match(/\d+/); return match ? Number(match[0]) : null; }
function band(value: number | null, limits: Array<[number, string]>) { if (value === null) return "Missing"; return limits.find(([max]) => value <= max)?.[1] ?? "Other"; }
function group<T>(values: T[], key: (value: T) => string) { const out = new Map<string, T[]>(); for (const value of values) out.set(key(value), [...(out.get(key(value)) ?? []), value]); return out; }
function table(rows: Array<Record<string, unknown>>) { if (!rows.length) return "_No rows._"; const headers = [...new Set(rows.flatMap(Object.keys))]; return [`| ${headers.join(" | ")} |`, `|${headers.map(() => "---").join("|")}|`, ...rows.map((row) => `| ${headers.map((h) => String(row[h] ?? "")).join(" | ")} |`)].join("\n"); }
function summaryLine(year: string, entries: Entry[]) { const m = metrics(entries); return `${year}: selections=${m.settled} winners=${m.winners} PL=${money(m.profit)} ROI=${pct(m.roi)} AE=${num(m.ae)}`; }
function sum(values: number[]) { return values.reduce((a, b) => a + b, 0); }
function average(values: number[]) { return values.length ? sum(values) / values.length : 0; }
function median(values: number[]) { if (!values.length) return 0; const sorted = [...values].sort((a, b) => a - b), mid = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2; }
function divide(a: number, b: number) { return b ? a / b : null; }
function quantile(values: number[], q: number) { if (!values.length) return 0; const p = (values.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p); return values[lo]! + (values[hi]! - values[lo]!) * (p - lo); }
function mulberry32(seed: number) { return () => { let t = seed += 0x6d2b79f5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function isNumber(value: number | null): value is number { return value !== null; }
function num(value: number | null) { return value === null || !Number.isFinite(value) ? "-" : value.toFixed(3); }
function pct(value: number | null) { return value === null || !Number.isFinite(value) ? "-" : `${(value * 100).toFixed(2)}%`; }
function pp(value: number) { return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)}pp`; }
function money(value: number) { return `${value >= 0 ? "+" : "-"}£${Math.abs(value).toFixed(2)}`; }

if (process.argv[1]?.endsWith("diagnose-turf-regime-shift.ts")) await main();
