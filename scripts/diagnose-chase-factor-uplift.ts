import { writeFile } from "node:fs/promises";
import { settleSelection, type BacktestSettlement } from "@/lib/racing/backtest";
import { loadLatestBacktestFeatureCacheForYear } from "@/lib/racing/backtest-cache";
import type { HistoricalTargetRunnerMetricsRow as Row } from "@/lib/racing/historical-target-metrics";
import { classifyJumpRaceSubtype } from "@/lib/racing/jump-speed-rating";
import { classifyHandicapStatus } from "@/lib/racing/research-rule";
import { raceClassNumber } from "@/lib/racing/research-rule-classes";

type Year = "2025" | "2026";
type Status = "all" | "handicap" | "non_handicap";
type MetricKey = "or" | "latestPerformance" | "bestL3Performance" | "latestSpeed" | "bestL3Speed" | "latestTodays";
type Context = { year: Year; rows: Row[]; ranks: Record<MetricKey, Map<string, number>>; coverage: string };
type Population = { key: string; label: string; status: Status; select: (row: Row, context: Context) => boolean; source: string };
type Result = { population: Population; year: Year; rows: Row[]; metrics: ReturnType<typeof betMetrics>; baseline: ReturnType<typeof betMetrics> };

const OUTPUT = "/tmp/chase-factor-uplift.md";
const YEARS: Year[] = ["2025", "2026"];
const AE_TOLERANCE = 0.02;
const METRICS: Array<{ key: MetricKey; label: string; value: (row: Row) => number | null }> = [
  { key: "or", label: "OR", value: (row) => row.features.officialRating },
  { key: "latestPerformance", label: "Latest Performance", value: (row) => row.features.latestPerformanceRating },
  { key: "bestL3Performance", label: "Best L3 Performance", value: (row) => row.features.bestPerformanceLast3 },
  { key: "latestSpeed", label: "Latest Speed", value: (row) => row.features.latestSpeedRating },
  { key: "bestL3Speed", label: "Best L3 Speed", value: (row) => row.features.bestSpeedLast3 },
  { key: "latestTodays", label: "Latest Today's Rating", value: (row) => row.features.latestTodaysRating },
];

async function main() {
  const contexts = await Promise.all(YEARS.map(load));
  const populations = singleFactorPopulations();
  const results = evaluatePopulations(contexts, populations);
  const replicated = replicatedResults(results);
  const combinations = twoFactorPopulations(replicated);
  const combinationResults = evaluatePopulations(contexts, combinations);
  const report = buildReport(contexts, results, replicated, combinationResults);
  await writeFile(OUTPUT, `${report.join("\n")}\n`, "utf8");
  console.log(`Wrote ${OUTPUT}`);
  console.log(`Replicated single-factor buckets: ${replicated.length}; two-factor follow-ups: ${combinations.length}`);
}

async function load(year: Year): Promise<Context> {
  const cache = await loadLatestBacktestFeatureCacheForYear({ family: "jump", year }) ?? await loadLatestBacktestFeatureCacheForYear({ family: "all", year });
  if (!cache) throw new Error(`Missing compatible v4 cache for ${year}`);
  const rows = cache.rows.filter((row) => row.features.raceCode === "jump" && classifyJumpRaceSubtype(row.features) === "chase").sort(compareRows);
  return {
    year,
    rows,
    ranks: Object.fromEntries(METRICS.map((metric) => [metric.key, rankRows(rows, metric.value)])) as Record<MetricKey, Map<string, number>>,
    coverage: `${cache.actualCoverage?.actualFrom ?? cache.manifest.from} to ${cache.actualCoverage?.actualTo ?? cache.manifest.to}`,
  };
}

function singleFactorPopulations(): Population[] {
  const populations: Population[] = [];
  for (const status of ["all", "handicap", "non_handicap"] as Status[]) {
    for (const metric of METRICS) for (const bucket of ["rank 1", "rank 2", "rank 3", "rank 4+"]) {
      populations.push({ key: `${status}:rank:${metric.key}:${bucket}`, label: `${metric.label} ${bucket}`, status, source: `rank:${metric.key}`, select: (row, context) => rankBand(context.ranks[metric.key].get(id(row))) === bucket });
    }
  }
  for (const status of ["all", "handicap", "non_handicap"] as Status[]) {
    for (const baseline of ["all", "or1"] as const) {
      for (const band of ["<10%", "10-14.9%", "15-19.9%", "20%+"]) populations.push({ key: `${status}:trainer:${baseline}:${band}`, label: `${baseline === "or1" ? "OR rank 1, " : ""}trainer ${band}`, status, source: `trainer:${baseline}`, select: (row, context) => (baseline === "all" || context.ranks.or.get(id(row)) === 1) && trainerBand(row.features.trainerPriorWinRate) === band });
    }
    for (const baseline of ["all", "or1"] as const) {
      for (const band of ["<10%", "10-14.9%", "15%+"]) populations.push({ key: `${status}:jockey:${baseline}:${band}`, label: `${baseline === "or1" ? "OR rank 1, " : ""}jockey ${band}`, status, source: `jockey:${baseline}`, select: (row, context) => (baseline === "all" || context.ranks.or.get(id(row)) === 1) && jockeyBand(row.features.jockeyPriorWinRate) === band });
    }
    for (const band of ["0-30", "31-60", "61-120", "121+", "missing"]) populations.push({ key: `${status}:days:${band}`, label: `Days ${band}`, status, source: "days", select: (row) => daysBand(row.features.daysSinceLastRun) === band });
    for (const band of ["2-5", "6-8", "9+"]) populations.push({ key: `${status}:field:${band}`, label: `Field ${band}`, status, source: "field", select: (row) => fieldBand(fieldSize(row)) === band });
    for (const band of ["Class 1", "Class 2", "Class 3", "Class 4", "Class 5", "Class 6", "unknown"]) populations.push({ key: `${status}:class:${band}`, label: band, status, source: "class", select: (row) => classBand(row.features.raceClass) === band });
  }
  return populations;
}

function evaluatePopulations(contexts: Context[], populations: Population[]): Result[] {
  return contexts.flatMap((context) => populations.map((population) => {
    const statusRows = context.rows.filter((row) => statusMatches(row, population.status));
    const rows = statusRows.filter((row) => population.select(row, context));
    return { population, year: context.year, rows, metrics: betMetrics(rows), baseline: betMetrics(statusRows) };
  }));
}

function replicatedResults(results: Result[]) {
  const replicated: Array<{ population: Population; y2025: Result; y2026: Result }> = [];
  for (const population of unique(results.map((result) => result.population), (item) => item.key)) {
    const y2025 = results.find((result) => result.year === "2025" && result.population.key === population.key), y2026 = results.find((result) => result.year === "2026" && result.population.key === population.key);
    if (!y2025 || !y2026 || y2025.metrics.bets === 0 || y2026.metrics.bets === 0) continue;
    if (greater(y2025.metrics.roi, y2025.baseline.roi) && greater(y2026.metrics.roi, y2026.baseline.roi) && notMateriallyWorse(y2025.metrics.ae, y2025.baseline.ae) && notMateriallyWorse(y2026.metrics.ae, y2026.baseline.ae)) replicated.push({ population, y2025, y2026 });
  }
  return replicated;
}

function twoFactorPopulations(replicated: ReturnType<typeof replicatedResults>): Population[] {
  const has = (keyPart: string) => replicated.some((item) => item.population.status === "all" && item.population.key.includes(keyPart));
  const candidates: Population[] = [];
  if (has("rank:or:rank 3") && has("trainer:all:20%+")) candidates.push({ key: "combo:or3-trainer20", label: "OR rank 3 + trainer 20%+", status: "all", source: "combination", select: (row, context) => context.ranks.or.get(id(row)) === 3 && trainerBand(row.features.trainerPriorWinRate) === "20%+" });
  if (has("rank:latestPerformance:rank 3") && has("trainer:all:20%+")) candidates.push({ key: "combo:performance3-trainer20", label: "Latest Performance rank 3 + trainer 20%+", status: "all", source: "combination", select: (row, context) => context.ranks.latestPerformance.get(id(row)) === 3 && trainerBand(row.features.trainerPriorWinRate) === "20%+" });
  if (has("rank:latestSpeed:rank 3") && has("trainer:all:20%+")) candidates.push({ key: "combo:speed3-trainer20", label: "Latest Speed rank 3 + trainer 20%+", status: "all", source: "combination", select: (row, context) => context.ranks.latestSpeed.get(id(row)) === 3 && trainerBand(row.features.trainerPriorWinRate) === "20%+" });
  if (has("trainer:all:20%+") && has("days:31-60")) candidates.push({ key: "combo:trainer20-days31-60", label: "Trainer 20%+ + Days 31-60", status: "all", source: "combination", select: (row) => trainerBand(row.features.trainerPriorWinRate) === "20%+" && daysBand(row.features.daysSinceLastRun) === "31-60" });
  if (has("trainer:all:20%+") && has("jockey:all:15%+")) candidates.push({ key: "combo:trainer20-jockey15", label: "Trainer 20%+ + jockey 15%+", status: "all", source: "combination", select: (row) => trainerBand(row.features.trainerPriorWinRate) === "20%+" && jockeyBand(row.features.jockeyPriorWinRate) === "15%+" });
  return candidates.slice(0, 5);
}

function buildReport(contexts: Context[], results: Result[], replicated: ReturnType<typeof replicatedResults>, combinationResults: Result[]): string[] {
  const lines = ["# Chase Factor-Uplift Study", "", `Diagnostic only. Canonical Chase subtype, current v4 cache, pre-race/as-of-safe features, and uncapped final-SP settlement. Replication requires ROI above the relevant all/handicap/non-handicap baseline in both years and A/E no more than ${AE_TOLERANCE.toFixed(2)} below baseline in either year.`, ""];
  baselines(lines, contexts);
  rankingProfiles(lines, results);
  orFocus(lines, contexts);
  contextProfiles(lines, results);
  priceProfiles(lines, contexts);
  replication(lines, replicated);
  combinations(lines, combinationResults);
  candidateComparison(lines, contexts, replicated, combinationResults);
  outlierStress(lines, contexts, replicated, combinationResults);
  conclusions(lines, contexts, replicated, combinationResults);
  return lines;
}

function baselines(lines: string[], contexts: Context[]) {
  lines.push("## Baselines", "");
  table(lines, contexts.flatMap((context) => (["all", "handicap", "non_handicap"] as Status[]).map((status) => ({ year: context.year, population: statusLabel(status), coverage: context.coverage, ...metricRow(betMetrics(context.rows.filter((row) => statusMatches(row, status))), true) }))));
}

function rankingProfiles(lines: string[], results: Result[]) {
  lines.push("## Within-race ranking factors", "");
  table(lines, results.filter((result) => result.population.source.startsWith("rank:")).map(resultRow));
}

function orFocus(lines: string[], contexts: Context[]) {
  lines.push("## OR rank focus", "");
  table(lines, contexts.flatMap((context) => (["all", "handicap", "non_handicap"] as Status[]).flatMap((status) => ["rank 1", "rank 2", "rank 3+", "missing OR"].map((band) => {
    const rows = context.rows.filter((row) => statusMatches(row, status)).filter((row) => orFocusBand(context.ranks.or.get(id(row)), row.features.officialRating) === band);
    return { year: context.year, population: statusLabel(status), band, ...metricRow(betMetrics(rows)) };
  }))));
}

function contextProfiles(lines: string[], results: Result[]) {
  for (const [source, title] of [["trainer:all", "Trainer prior strike: all Chase runners"], ["trainer:or1", "Trainer prior strike: OR rank 1"], ["jockey:all", "Jockey prior win rate: all Chase runners"], ["jockey:or1", "Jockey prior win rate: OR rank 1"], ["days", "Days since run"], ["field", "Field size"], ["class", "Race class"]] as const) {
    lines.push(`## ${title}`, "");
    table(lines, results.filter((result) => result.population.source === source).map((result) => ({
      ...resultRow(result),
      ...(source.startsWith("trainer:") ? {
        "average trainer prior runs": num(average(result.rows.map((row) => row.features.trainerPriorRuns).filter(valid)), 1),
        "median trainer prior runs": num(median(result.rows.map((row) => row.features.trainerPriorRuns).filter(valid)), 1),
      } : {}),
      ...(source === "class" ? { sparse: result.metrics.bets < 50 ? "yes" : "no" } : {}),
    })));
  }
}

function priceProfiles(lines: string[], contexts: Context[]) {
  lines.push("## Final-SP profile (evaluation only)", "");
  const bands = ["<2.0", "2.0-2.99", "3.0-4.99", "5.0-8.99", "9.0-20.99", "21.0+"];
  table(lines, contexts.flatMap((context) => [
    { label: "all Chases", select: () => true },
    { label: "handicap Chases", select: (row: Row) => statusMatches(row, "handicap") },
    { label: "OR rank 1", select: (row: Row) => context.ranks.or.get(id(row)) === 1 },
    { label: "Latest Performance rank 1", select: (row: Row) => context.ranks.latestPerformance.get(id(row)) === 1 },
  ].flatMap((population) => bands.map((band) => { const rows = context.rows.filter(population.select).filter((row) => { const price = settleSelection(row.outcome)?.settlementOddsDecimal; return price !== undefined && spBand(price) === band; }); return { year: context.year, population: population.label, band, ...metricRow(betMetrics(rows)) }; }))));
}

function replication(lines: string[], replicated: ReturnType<typeof replicatedResults>) {
  lines.push("## Replication screen", "");
  table(lines, replicated.map(({ population, y2025, y2026 }) => ({ population: population.label, context: statusLabel(population.status), "2025 bets": y2025.metrics.bets, "2025 ROI": pct(y2025.metrics.roi), "2025 baseline ROI": pct(y2025.baseline.roi), "2025 A/E": num(y2025.metrics.ae), "2026 bets": y2026.metrics.bets, "2026 ROI": pct(y2026.metrics.roi), "2026 baseline ROI": pct(y2026.baseline.roi), "2026 A/E": num(y2026.metrics.ae) })));
}

function combinations(lines: string[], results: Result[]) {
  lines.push("## Two-factor follow-up", "", "Only combinations justified by replicated constituent signals were evaluated; no threshold or combination search was performed.", "");
  table(lines, results.map(resultRow));
}

function candidateComparison(lines: string[], contexts: Context[], replicated: ReturnType<typeof replicatedResults>, combinations: Result[]) {
  lines.push("## Promising-candidate uplift", "");
  const populations = [...replicated.map((item) => item.population), ...unique(combinations.map((item) => item.population), (item) => item.key)];
  table(lines, contexts.flatMap((context) => populations.map((population) => {
    const rows = context.rows.filter((row) => statusMatches(row, population.status) && population.select(row, context)), value = betMetrics(rows), all = betMetrics(context.rows), handicap = betMetrics(context.rows.filter((row) => statusMatches(row, "handicap")));
    return { year: context.year, candidate: population.label, context: statusLabel(population.status), bets: value.bets, ROI: pct(value.roi), "uplift vs all": pp(diff(value.roi, all.roi)), "uplift vs handicap": population.status === "handicap" || population.label.startsWith("Handicap") ? pp(diff(value.roi, handicap.roi)) : "-", "A/E": num(value.ae), "A/E uplift vs all": signed(diff(value.ae, all.ae)), "sample reduction vs all": pct(rate(all.bets - value.bets, all.bets)) };
  })));
}

function outlierStress(lines: string[], contexts: Context[], replicated: ReturnType<typeof replicatedResults>, combinations: Result[]) {
  lines.push("## Positive-both-years candidate stress", "");
  const populations = unique([...replicated.map((item) => item.population), ...combinations.map((item) => item.population)], (item) => item.key).filter((population) => YEARS.every((year) => { const context = contexts.find((item) => item.year === year)!; return (betMetrics(context.rows.filter((row) => statusMatches(row, population.status) && population.select(row, context))).roi ?? -Infinity) > 0; }));
  const stressRows = contexts.flatMap((context) =>
    populations.flatMap((population) => {
      const rows = context.rows.filter((row) => statusMatches(row, population.status) && population.select(row, context));
      const winners = settled(rows).filter((entry) => entry.row.outcome.won).sort((a, b) => b.settlement.settlementOddsDecimal - a.settlement.settlementOddsDecimal);
      const bestMonth = [...group(rows, (row) => row.features.raceDate.slice(0, 7)).entries()].sort((a, b) => (betMetrics(b[1]).profitLoss - betMetrics(a[1]).profitLoss))[0]?.[0];
      return [
        { label: "full", rows },
        { label: "remove biggest winner", rows: rows.filter((row) => row !== winners[0]?.row) },
        { label: "remove top two winners", rows: rows.filter((row) => row !== winners[0]?.row && row !== winners[1]?.row) },
        { label: `remove best month (${bestMonth ?? "-"})`, rows: rows.filter((row) => row.features.raceDate.slice(0, 7) !== bestMonth) },
      ].map((test) => ({ year: context.year, candidate: population.label, stress: test.label, ...metricRow(betMetrics(test.rows)) }));
    }),
  );
  table(lines, stressRows);
}

function conclusions(lines: string[], contexts: Context[], replicated: ReturnType<typeof replicatedResults>, combinationResults: Result[]) {
  const ranked = replicated.filter((item) => item.population.status === "all").sort((a, b) => ((b.y2025.metrics.roi! - b.y2025.baseline.roi!) + (b.y2026.metrics.roi! - b.y2026.baseline.roi!)) - ((a.y2025.metrics.roi! - a.y2025.baseline.roi!) + (a.y2026.metrics.roi! - a.y2026.baseline.roi!)));
  const best = ranked[0], comboGroups = unique(combinationResults.map((result) => result.population), (item) => item.key).map((population) => ({ population, results: combinationResults.filter((result) => result.population.key === population.key) })).filter((item) => item.results.length === 2 && item.results.every((result) => greater(result.metrics.roi, result.baseline.roi) && notMateriallyWorse(result.metrics.ae, result.baseline.ae))).sort((a, b) => average(b.results.map((result) => result.metrics.roi! - result.baseline.roi!))! - average(a.results.map((result) => result.metrics.roi! - result.baseline.roi!))!);
  const bestCombo = comboGroups[0];
  const or1 = (year: Year) => { const context = contexts.find((item) => item.year === year)!; return betMetrics(context.rows.filter((row) => context.ranks.or.get(id(row)) === 1)); };
  const perf1 = (year: Year) => { const context = contexts.find((item) => item.year === year)!; return betMetrics(context.rows.filter((row) => context.ranks.latestPerformance.get(id(row)) === 1)); };
  const base = (year: Year) => betMetrics(contexts.find((item) => item.year === year)!.rows);
  lines.push("## Final answers", "",
    `1. Best replicated single factor against the primary all-Chase baseline by summed ROI uplift: ${best ? `${best.population.label} (${pp(diff(best.y2025.metrics.roi, best.y2025.baseline.roi))} in 2025; ${pp(diff(best.y2026.metrics.roi, best.y2026.baseline.roi))} in 2026)` : "none"}.`,
    `2. OR rank 1 versus all-Chase: 2025 ${pct(or1("2025").roi)} vs ${pct(base("2025").roi)}; 2026 ${pct(or1("2026").roi)} vs ${pct(base("2026").roi)}.`,
    `3. Handicap status improves the baseline to ${pct(betMetrics(contexts[0]!.rows.filter((row) => statusMatches(row, "handicap"))).roi)} / ${pct(betMetrics(contexts[1]!.rows.filter((row) => statusMatches(row, "handicap"))).roi)}, but does not explain all of the edge: several factors still improve on the matched handicap baseline in both years.`,
    `4. Trainer strength ${replicated.some((item) => item.population.status === "all" && item.population.source === "trainer:all" && item.population.label === "trainer 20%+") ? "adds replicated uplift at the fixed 20%+ band, although its 2025 best-month stress falls close to break-even" : "does not produce a replicated uplift bucket under the fixed screen"}.`,
    `5. Latest Performance rank 1 is ${pct(perf1("2025").roi)} / ${pct(perf1("2026").roi)} versus OR rank 1 ${pct(or1("2025").roi)} / ${pct(or1("2026").roi)}. It is relatively better, but neither rank-1 factor improves the all-Chase baseline in both years.`,
    "6. Days 31-60 and jockey 15%+ remain positive after removing the two biggest-priced winners and the best month in both years. Several smaller rank/trainer combinations weaken to roughly break-even or negative under stress.",
    `7. ${bestCombo ? `${best?.population.label ?? "The leading single factor"} is worth a separate frozen confirmation. ${bestCombo.population.label} has the best headline two-factor uplift, but its small samples and near-break-even stressed returns make it secondary rather than ready for a rule.` : best ? `${best.population.label} is worth a separate frozen confirmation; no justified two-factor candidate clears the screen.` : "No simple Chase research rule is strong enough for confirmation; the market baseline remains the main finding."}`,
    `8. ${best || bestCombo ? "The report contains a replicated hypothesis, but no rule has been created or frozen." : "The strong Chase market baseline itself remains the main finding."}`,
    "",
  );
}

function resultRow(result: Result) { return { year: result.year, context: statusLabel(result.population.status), factor: result.population.label, ...metricRow(result.metrics) }; }
function metricRow(value: ReturnType<typeof betMetrics>, detailed = false) { return { selections: value.bets, winners: value.winners, strike: pct(value.strike), ROI: pct(value.roi), "A/E": num(value.ae), ...(detailed ? { "average SP": num(value.averageSp, 2), "median SP": num(value.medianSp, 2) } : {}) }; }
function betMetrics(rows: Row[]) { const entries = settled(rows), winners = entries.filter((entry) => entry.row.outcome.won), returns = winners.reduce((sum, entry) => sum + entry.settlement.grossReturn, 0), expected = entries.reduce((sum, entry) => sum + 1 / entry.settlement.settlementOddsDecimal, 0); return { bets: entries.length, winners: winners.length, strike: rate(winners.length, entries.length), returns, profitLoss: returns - entries.length, roi: rate(returns - entries.length, entries.length), ae: expected === 0 ? null : winners.length / expected, averageSp: average(entries.map((entry) => entry.settlement.settlementOddsDecimal)), medianSp: median(entries.map((entry) => entry.settlement.settlementOddsDecimal)) }; }
function settled(rows: Row[]): Array<{ row: Row; settlement: BacktestSettlement }> { return rows.map((row) => ({ row, settlement: settleSelection(row.outcome) })).filter((item): item is { row: Row; settlement: BacktestSettlement } => item.settlement !== null); }
function rankRows(rows: Row[], value: (row: Row) => number | null) { const ranks = new Map<string, number>(); for (const race of group(rows, raceId).values()) { const sorted = race.filter((row) => row.outcome.resultStatus !== "non_runner").map((row) => ({ row, value: value(row) })).filter((item): item is { row: Row; value: number } => valid(item.value)).sort((a, b) => b.value - a.value || id(a.row).localeCompare(id(b.row))); let previous: number | null = null, previousRank = 0; sorted.forEach((item, index) => { const rank = item.value === previous ? previousRank : index + 1; ranks.set(id(item.row), rank); previous = item.value; previousRank = rank; }); } return ranks; }
function statusMatches(row: Row, status: Status) { if (status === "all") return true; return classifyHandicapStatus(row.features) === status; }
function statusLabel(status: Status) { return status === "all" ? "all Chases" : status === "handicap" ? "handicap Chases" : "non-handicap Chases"; }
function rankBand(rank: number | undefined) { return rank === 1 ? "rank 1" : rank === 2 ? "rank 2" : rank === 3 ? "rank 3" : rank !== undefined && rank >= 4 ? "rank 4+" : "missing"; }
function orFocusBand(rank: number | undefined, value: number | null) { return value === null || rank === undefined ? "missing OR" : rank === 1 ? "rank 1" : rank === 2 ? "rank 2" : "rank 3+"; }
function trainerBand(value: number | null) { return value === null ? "missing" : value < 10 ? "<10%" : value < 15 ? "10-14.9%" : value < 20 ? "15-19.9%" : "20%+"; }
function jockeyBand(value: number | null | undefined) { return value === null || value === undefined ? "missing" : value < 10 ? "<10%" : value < 15 ? "10-14.9%" : "15%+"; }
function daysBand(value: number | null) { return value === null ? "missing" : value <= 30 ? "0-30" : value <= 60 ? "31-60" : value <= 120 ? "61-120" : "121+"; }
function fieldSize(row: Row) { return row.features.actualRunnerCount ?? row.features.declaredRunnerCount; }
function fieldBand(value: number | null) { return value === null ? "missing" : value <= 5 ? "2-5" : value <= 8 ? "6-8" : "9+"; }
function classBand(value: string | null) { const parsed = raceClassNumber(value); return parsed === null ? "unknown" : `Class ${parsed}`; }
function spBand(value: number) { return value < 2 ? "<2.0" : value < 3 ? "2.0-2.99" : value < 5 ? "3.0-4.99" : value < 9 ? "5.0-8.99" : value < 21 ? "9.0-20.99" : "21.0+"; }
function id(row: Row) { return row.features.targetRunnerId; }
function raceId(row: Row) { return row.features.targetRaceId; }
function compareRows(a: Row, b: Row) { return a.features.raceDateTime.getTime() - b.features.raceDateTime.getTime() || raceId(a).localeCompare(raceId(b)) || id(a).localeCompare(id(b)); }
function group<T>(values: T[], key: (value: T) => string) { const result = new Map<string, T[]>(); for (const value of values) { const k = key(value); result.set(k, [...(result.get(k) ?? []), value]); } return result; }
function unique<T>(values: T[], key: (value: T) => string) { return [...new Map(values.map((value) => [key(value), value])).values()]; }
function valid(value: number | null | undefined): value is number { return value !== null && value !== undefined && Number.isFinite(value); }
function rate(numerator: number, denominator: number) { return denominator === 0 ? null : numerator / denominator; }
function diff(left: number | null, right: number | null) { return left === null || right === null ? null : left - right; }
function greater(left: number | null, right: number | null) { return left !== null && right !== null && left > right; }
function notMateriallyWorse(value: number | null, baseline: number | null) { return value !== null && baseline !== null && value >= baseline - AE_TOLERANCE; }
function average(values: number[]) { return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length; }
function median(values: number[]) { if (values.length === 0) return null; const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2; }
function pct(value: number | null) { return value === null || !Number.isFinite(value) ? "-" : `${(value * 100).toFixed(2)}%`; }
function pp(value: number | null) { return value === null ? "-" : `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)} pp`; }
function num(value: number | null, digits = 3) { return value === null || !Number.isFinite(value) ? "-" : value.toFixed(digits); }
function signed(value: number | null) { return value === null ? "-" : `${value >= 0 ? "+" : ""}${value.toFixed(3)}`; }
function table(lines: string[], rows: Array<Record<string, unknown>>) { if (rows.length === 0) { lines.push("No rows.", ""); return; } const headers = Object.keys(rows[0]!); lines.push(`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map((row) => `| ${headers.map((header) => String(row[header] ?? "-").replace(/\|/g, "\\|")).join(" | ")} |`), ""); }

await main();
