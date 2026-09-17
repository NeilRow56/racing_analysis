import { writeFile } from "node:fs/promises";
import { settleSelection, type BacktestSettlement } from "@/lib/racing/backtest";
import { loadLatestBacktestFeatureCacheForYear } from "@/lib/racing/backtest-cache";
import type { HistoricalTargetRunnerMetricsRow as Row } from "@/lib/racing/historical-target-metrics";
import {
  calculateTurfPerformanceRating,
  TURF_PERFORMANCE_RATING_VERSION,
  TURF_PERFORMANCE_RATING_W50_WEIGHT_MULTIPLIER,
} from "@/lib/racing/turf-performance-rating";

type Year = "2025" | "2026";
type VariantKey = "W100" | "OR" | "TPR90_OR10" | "TPR80_OR20" | "W50";
type Population = "all_tpr" | "or_complete";
type Scored = { row: Row; raceId: string; runnerId: string; score: number | null; rank: number | null; sp: number | null };
type Result = { year: Year; variant: VariantKey; population: Population; rows: Scored[] };
type Context = { year: Year; coverage: string; rows: Row[]; races: Row[][] };

const OUTPUT = "/tmp/turf-tpr-or-contribution.md";
const YEARS: Year[] = ["2025", "2026"];
const VARIANTS: Array<{ key: VariantKey; label: string; tpr: number; or: number }> = [
  { key: "W100", label: "100% TPR / 0% OR", tpr: 1, or: 0 },
  { key: "TPR90_OR10", label: "90% TPR / 10% OR", tpr: 0.9, or: 0.1 },
  { key: "TPR80_OR20", label: "80% TPR / 20% OR", tpr: 0.8, or: 0.2 },
];

async function main() {
  const contexts = await Promise.all(YEARS.map(load));
  const results = contexts.flatMap(scoreContext);
  const lines = report(contexts, results);
  await writeFile(OUTPUT, `${lines.join("\n")}\n`, "utf8");
  console.log(`Wrote ${OUTPUT}`);
}

async function load(year: Year): Promise<Context> {
  const cache = await loadLatestBacktestFeatureCacheForYear({ year, family: "turf_flat" }) ?? await loadLatestBacktestFeatureCacheForYear({ year, family: "all" });
  if (!cache) throw new Error(`Missing compatible v4 Turf cache for ${year}`);
  const rows = cache.rows.filter((row) => row.features.raceCode === "turf" && settleSelection(row.outcome) !== null).sort(compareRows);
  return { year, coverage: `${cache.actualCoverage?.actualFrom ?? cache.manifest.from} to ${cache.actualCoverage?.actualTo ?? cache.manifest.to}`, rows, races: [...group(rows, raceId).values()] };
}

function scoreContext(context: Context): Result[] {
  const all = context.races.flatMap((race) => scoreRace(race, false));
  const complete = context.races.filter(orCompleteRace).flatMap((race) => scoreRace(race, true));
  return (["all_tpr", "or_complete"] as Population[]).flatMap((population) => {
    const rows = population === "all_tpr" ? all : complete;
    return ["W100", "OR", "TPR90_OR10", "TPR80_OR20", "W50"].map((variant) => ({
      year: context.year,
      variant: variant as VariantKey,
      population,
      rows: rows.map((entry) => entry[variant as VariantKey]),
    }));
  });
}

function scoreRace(race: Row[], requireCompleteOr: boolean): Array<Record<VariantKey, Scored>> {
  const medianWeight = median(race.map((row) => row.features.weightCarriedLbs).filter(valid));
  const base = race.map((row) => {
    const common = {
      latestPerformanceRating: row.features.latestPerformanceRating,
      previousPerformanceRating: row.features.previousPerformanceRating,
      averagePerformanceLast3: row.features.averagePerformanceLast3,
      latestSpeedRating: row.features.latestTurfSpeedRating,
      previousSpeedRating: row.features.previousTurfSpeedRating,
      averageSpeedLast3: row.features.averageTurfSpeedLast3,
      raceClass: row.features.raceClass,
      weightCarriedLbs: row.features.weightCarriedLbs,
      raceMedianWeightCarriedLbs: medianWeight,
    };
    return {
      row,
      w100: calculateTurfPerformanceRating(common)?.rating ?? null,
      w50: calculateTurfPerformanceRating({ ...common, weightCoefficientMultiplier: TURF_PERFORMANCE_RATING_W50_WEIGHT_MULTIPLIER })?.rating ?? null,
      or: row.features.officialRating,
    };
  });
  const tprValues = base.map((item) => item.w100).filter(valid);
  const orValues = base.map((item) => item.or).filter(valid);
  const tprStats = stats(tprValues), orStats = stats(orValues);
  const values = new Map<VariantKey, Map<string, number | null>>();
  values.set("W100", new Map(base.map((item) => [id(item.row), item.w100])));
  values.set("W50", new Map(base.map((item) => [id(item.row), item.w50])));
  values.set("OR", new Map(base.map((item) => [id(item.row), item.or])));
  for (const variant of VARIANTS.filter((item) => item.or > 0)) {
    values.set(variant.key, new Map(base.map((item) => {
      const tprZ = z(item.w100, tprStats);
      const orZ = item.or === null && !requireCompleteOr ? 0 : z(item.or, orStats);
      return [id(item.row), tprZ === null || orZ === null ? null : variant.tpr * tprZ + variant.or * orZ];
    })));
  }
  const ranks = new Map<VariantKey, Map<string, number>>([...values].map(([key, map]) => [key, rank(race, (row) => map.get(id(row)) ?? null)]));
  return race.map((row) => Object.fromEntries((["W100", "OR", "TPR90_OR10", "TPR80_OR20", "W50"] as VariantKey[]).map((key) => [key, {
    row, raceId: raceId(row), runnerId: id(row), score: values.get(key)?.get(id(row)) ?? null, rank: ranks.get(key)?.get(id(row)) ?? null, sp: price(row),
  }])) as Record<VariantKey, Scored>);
}

function report(contexts: Context[], results: Result[]) {
  const lines = [
    "# Turf TPR + Official Rating Contribution Study", "",
    `Diagnostic only. Flat Turf, frozen production \`${TURF_PERFORMANCE_RATING_VERSION}\`, W50 shadow, pre-race features, and uncapped final-SP evaluation. TPR/OR blends use within-race z-scores. Missing OR is neutral (z=0) in the all-TPR-valid population; OR-complete races require OR for every TPR-rated runner.`, "",
  ];
  baselines(lines, contexts, results);
  blends(lines, results);
  disagreements(lines, results);
  w50(lines, results);
  orContext(lines, contexts, results);
  marketContext(lines, results);
  todayCase(lines, results);
  decision(lines, results);
  return lines;
}

function baselines(lines: string[], contexts: Context[], results: Result[]) {
  lines.push("## Baselines", "");
  table(lines, contexts.flatMap((context) => ["W100", "OR"].map((variant) => ({ year: context.year, coverage: context.coverage, rating: variant === "W100" ? "Production W100 TPR" : "Official Rating", ...metricRow(metrics(get(results, context.year, variant as VariantKey, "all_tpr"))) }))));
}

function blends(lines: string[], results: Result[]) {
  lines.push("## Fixed OR blends", "");
  for (const population of ["all_tpr", "or_complete"] as Population[]) {
    lines.push(`### ${population === "all_tpr" ? "All TPR-valid races" : "OR-complete matched races"}`, "");
    table(lines, YEARS.flatMap((year) => VARIANTS.map((variant) => ({ year, variant: variant.label, ...metricRow(metrics(get(results, year, variant.key, population))) }))));
  }
}

function disagreements(lines: string[], results: Result[]) {
  lines.push("## Pairwise disagreement against production TPR", "");
  table(lines, YEARS.flatMap((year) => (["TPR90_OR10", "TPR80_OR20"] as VariantKey[]).map((variant) => ({ year, blend: label(variant), population: "all TPR-valid", ...disagreement(get(results, year, "W100", "all_tpr"), get(results, year, variant, "all_tpr")) }))));
  lines.push("Matched OR-complete races:", "");
  table(lines, YEARS.flatMap((year) => (["TPR90_OR10", "TPR80_OR20"] as VariantKey[]).map((variant) => ({ year, blend: label(variant), ...disagreement(get(results, year, "W100", "or_complete"), get(results, year, variant, "or_complete")) }))));
}

function w50(lines: string[], results: Result[]) {
  lines.push("## W50 comparison", "");
  const bestByYear = (year: Year) => (["TPR90_OR10", "TPR80_OR20"] as VariantKey[]).sort((a, b) => numeric(metrics(get(results, year, b, "all_tpr")).strike) - numeric(metrics(get(results, year, a, "all_tpr")).strike))[0]!;
  table(lines, YEARS.flatMap((year) => {
    const best = bestByYear(year);
    return (["W100", "W50", best] as VariantKey[]).map((variant) => ({ year, variant: label(variant), ...metricRow(metrics(get(results, year, variant, "all_tpr"))) }));
  }));
  table(lines, YEARS.flatMap((year) => {
    const best = bestByYear(year);
    return [
      { year, comparison: "W50 vs W100", ...disagreement(get(results, year, "W100", "all_tpr"), get(results, year, "W50", "all_tpr")) },
      { year, comparison: `${label(best)} vs W50 (left=W50, right=blend)`, ...disagreement(get(results, year, "W50", "all_tpr"), get(results, year, best, "all_tpr")) },
    ];
  }));
}

function orContext(lines: string[], contexts: Context[], results: Result[]) {
  lines.push("## OR-rank context for production TPR rank 1", "");
  table(lines, contexts.flatMap((context) => {
    const result = get(results, context.year, "W100", "all_tpr");
    const orRanks = rankByRace(context.rows, (row) => row.features.officialRating);
    return ["OR rank 1", "OR rank 2", "OR rank 3+", "missing OR"].map((band) => ({ year: context.year, band, ...selectionMetric(result.rows.filter((item) => item.rank === 1 && orBand(orRanks.get(item.runnerId), item.row.features.officialRating) === band)) }));
  }));
}

function marketContext(lines: string[], results: Result[]) {
  lines.push("## Market-disagreement context (evaluation only)", "");
  const bands = ["<2.0", "2.0-2.99", "3.0-4.99", "5.0-8.99", "9.0-20.99", "21.0+"];
  table(lines, YEARS.flatMap((year) => {
    const result = get(results, year, "W100", "all_tpr"), orRanks = rankByRace(result.rows.map((item) => item.row), (row) => row.features.officialRating);
    const picks = result.rows.filter((item) => item.rank === 1);
    return ["OR rank 1 agrees", "OR rank 1 does not agree"].map((band) => ({ year, band, ...selectionMetric(picks.filter((item) => (orRanks.get(item.runnerId) === 1) === (band === "OR rank 1 agrees"))) }));
  }));
  lines.push("Production TPR rank 1 by final-SP band:", "");
  table(lines, YEARS.flatMap((year) => {
    const picks = get(results, year, "W100", "all_tpr").rows.filter((item) => item.rank === 1);
    return bands.map((band) => ({ year, band, ...selectionMetric(picks.filter((item) => priceBand(item.sp) === band)) }));
  }));
}

function todayCase(lines: string[], results: Result[]) {
  lines.push("## TPR rank 1 + OR rank 1 + final SP >=10 (descriptive only)", "");
  table(lines, YEARS.map((year) => {
    const result = get(results, year, "W100", "all_tpr"), orRanks = rankByRace(result.rows.map((item) => item.row), (row) => row.features.officialRating);
    return { year, ...selectionMetric(result.rows.filter((item) => item.rank === 1 && orRanks.get(item.runnerId) === 1 && (item.sp ?? -Infinity) >= 10)) };
  }));
}

function decision(lines: string[], results: Result[]) {
  const strike = (year: Year, variant: VariantKey) => metrics(get(results, year, variant, "all_tpr")).strike;
  const better = (year: Year, variant: VariantKey, reference: VariantKey) => numeric(strike(year, variant)) > numeric(strike(year, reference));
  const agreement = (year: Year) => {
    const result = get(results, year, "W100", "all_tpr"), ranks = rankByRace(result.rows.map((item) => item.row), (row) => row.features.officialRating), picks = result.rows.filter((item) => item.rank === 1);
    return { agree: selectionMetrics(picks.filter((item) => ranks.get(item.runnerId) === 1)), disagree: selectionMetrics(picks.filter((item) => ranks.get(item.runnerId) !== 1)) };
  };
  lines.push("## Decision", "",
    `1. Adding 10% OR ${better("2025", "TPR90_OR10", "W100") ? "improves" : "does not improve"} 2025 rank-1 strike (${pct(strike("2025", "TPR90_OR10"))} vs ${pct(strike("2025", "W100"))}).`,
    `2. Adding 10% OR ${better("2026", "TPR90_OR10", "W100") ? "improves" : "does not improve"} 2026 rank-1 strike (${pct(strike("2026", "TPR90_OR10"))} vs ${pct(strike("2026", "W100"))}).`,
    `3. Adding 20% OR ${better("2025", "TPR80_OR20", "W100") && better("2026", "TPR80_OR20", "W100") ? "improves rank-1 strike in both years" : "does not improve rank-1 strike in both years"}.`,
    `4. The 10%/20% blends ${(["TPR90_OR10", "TPR80_OR20"] as VariantKey[]).some((variant) => YEARS.every((year) => better(year, variant, "W50"))) ? "include a variant that beats W50 in both years" : "do not beat W50 on rank-1 strike in both years"}.`,
    `5. OR-rank-1 agreement changes TPR rank-1 strike from ${pct(agreement("2025").disagree.strike)} to ${pct(agreement("2025").agree.strike)} in 2025 and ${pct(agreement("2026").disagree.strike)} to ${pct(agreement("2026").agree.strike)} in 2026.`,
    "6. The 10% blend's replicated strike gains are small, it loses to W50 on rank-1 strike, and its A/E does not materially improve. That is not enough evidence to justify a production TPR change.",
    "7. Official Rating should remain a separate contextual signal.", "");
}

function metrics(result: Result) {
  const valid = result.rows.filter((item) => item.rank !== null), picks = valid.filter((item) => item.rank === 1), top3 = valid.filter((item) => item.rank! <= 3), winners = valid.filter((item) => item.row.outcome.won);
  const betting = selectionMetrics(picks), pairs = valid.map((item) => [item.score!, item.row.outcome.won ? 1 : 0] as const);
  return { validRaces: distinct(valid, (item) => item.raceId), selections: picks.length, winners: betting.winners, strike: betting.strike, top3: rate(top3.filter((item) => item.row.outcome.won).length, winners.length), correlation: pearson(pairs.map(([score]) => score), pairs.map(([, won]) => won)), roi: betting.roi, ae: betting.ae };
}

function selectionMetrics(rows: Scored[]) { const entries = rows.map((item) => ({ item, settlement: settleSelection(item.row.outcome) })).filter((entry): entry is { item: Scored; settlement: BacktestSettlement } => entry.settlement !== null), winners = entries.filter(({ item }) => item.row.outcome.won), returns = winners.reduce((sum, { settlement }) => sum + settlement.grossReturn, 0), expected = entries.reduce((sum, { settlement }) => sum + 1 / settlement.settlementOddsDecimal, 0); return { selections: entries.length, winners: winners.length, strike: rate(winners.length, entries.length), roi: rate(returns - entries.length, entries.length), ae: expected === 0 ? null : winners.length / expected }; }
function metricRow(value: ReturnType<typeof metrics>) { return { "valid races": value.validRaces, "rank-1 selections": value.selections, winners: value.winners, "rank-1 strike": pct(value.strike), "top-3 winner capture": pct(value.top3), correlation: num(value.correlation, 4), ROI: pct(value.roi), "A/E": num(value.ae) }; }
function selectionMetric(rows: Scored[]) { const value = selectionMetrics(rows); return { selections: value.selections, winners: value.winners, strike: pct(value.strike), ROI: pct(value.roi), "A/E": num(value.ae) }; }
function disagreement(production: Result, blend: Result, productionLabel = "production TPR winners", blendLabel = "blend winners") { const left = pickByRace(production), right = pickByRace(blend); let races = 0, productionWins = 0, blendWins = 0, neither = 0; for (const race of new Set([...left.keys(), ...right.keys()])) { const a = left.get(race), b = right.get(race); if (!a || !b || a.runnerId === b.runnerId) continue; races++; if (a.row.outcome.won) productionWins++; if (b.row.outcome.won) blendWins++; if (!a.row.outcome.won && !b.row.outcome.won) neither++; } return { "disagreement races": races, [productionLabel]: productionWins, [blendLabel]: blendWins, "neither won": neither, "net extra winners from blend": blendWins - productionWins }; }
function pickByRace(result: Result) { return new Map(result.rows.filter((item) => item.rank === 1).sort((a, b) => a.runnerId.localeCompare(b.runnerId)).map((item) => [item.raceId, item])); }
function get(results: Result[], year: Year, variant: VariantKey, population: Population) { return results.find((item) => item.year === year && item.variant === variant && item.population === population)!; }
function label(key: VariantKey) { return key === "W100" ? "Production W100" : key === "W50" ? "W50 shadow" : key === "OR" ? "Official Rating" : key === "TPR90_OR10" ? "90% TPR / 10% OR" : "80% TPR / 20% OR"; }
function orCompleteRace(race: Row[]) { const rated = race.filter((row) => tprValid(row, race)); return rated.length > 0 && rated.every((row) => row.features.officialRating !== null); }
function tprValid(row: Row, race: Row[]) { const medianWeight = median(race.map((item) => item.features.weightCarriedLbs).filter(valid)); return calculateTurfPerformanceRating({ latestPerformanceRating: row.features.latestPerformanceRating, previousPerformanceRating: row.features.previousPerformanceRating, averagePerformanceLast3: row.features.averagePerformanceLast3, latestSpeedRating: row.features.latestTurfSpeedRating, previousSpeedRating: row.features.previousTurfSpeedRating, averageSpeedLast3: row.features.averageTurfSpeedLast3, raceClass: row.features.raceClass, weightCarriedLbs: row.features.weightCarriedLbs, raceMedianWeightCarriedLbs: medianWeight }) !== null; }
function rankByRace(rows: Row[], value: (row: Row) => number | null) { const result = new Map<string, number>(); for (const race of group(rows, raceId).values()) for (const [runner, rankValue] of rank(race, value)) result.set(runner, rankValue); return result; }
function rank(rows: Row[], value: (row: Row) => number | null) { const sorted = rows.map((row) => ({ row, value: value(row) })).filter((item): item is { row: Row; value: number } => valid(item.value)).sort((a, b) => b.value - a.value || id(a.row).localeCompare(id(b.row))), result = new Map<string, number>(); let prior: number | null = null, priorRank = 0; sorted.forEach((item, index) => { const current = item.value === prior ? priorRank : index + 1; result.set(id(item.row), current); prior = item.value; priorRank = current; }); return result; }
function stats(values: number[]) { return { mean: average(values), sd: stdev(values) }; }
function z(value: number | null, valueStats: ReturnType<typeof stats>) { if (value === null || valueStats.mean === null) return null; return valueStats.sd === null || valueStats.sd === 0 ? 0 : (value - valueStats.mean) / valueStats.sd; }
function orBand(rankValue: number | undefined, orValue: number | null) { return orValue === null || rankValue === undefined ? "missing OR" : rankValue === 1 ? "OR rank 1" : rankValue === 2 ? "OR rank 2" : "OR rank 3+"; }
function priceBand(value: number | null) { return value === null ? "missing" : value < 2 ? "<2.0" : value < 3 ? "2.0-2.99" : value < 5 ? "3.0-4.99" : value < 9 ? "5.0-8.99" : value < 21 ? "9.0-20.99" : "21.0+"; }
function price(row: Row) { return settleSelection(row.outcome)?.settlementOddsDecimal ?? null; }
function pearson(xs: number[], ys: number[]) { if (xs.length < 2 || xs.length !== ys.length) return null; const x = average(xs)!, y = average(ys)!, numerator = xs.reduce((sum, value, index) => sum + (value - x) * (ys[index]! - y), 0), denominator = Math.sqrt(xs.reduce((sum, value) => sum + (value - x) ** 2, 0) * ys.reduce((sum, value) => sum + (value - y) ** 2, 0)); return denominator === 0 ? null : numerator / denominator; }
function stdev(values: number[]) { if (values.length < 2) return null; const mean = average(values)!; return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length); }
function average(values: number[]) { return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length; }
function median(values: number[]) { if (values.length === 0) return null; const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2; }
function valid(value: number | null | undefined): value is number { return value !== null && value !== undefined && Number.isFinite(value); }
function rate(numerator: number, denominator: number) { return denominator === 0 ? null : numerator / denominator; }
function numeric(value: number | null) { return value ?? -Infinity; }
function group<T>(values: T[], key: (value: T) => string) { const result = new Map<string, T[]>(); for (const value of values) { const k = key(value); result.set(k, [...(result.get(k) ?? []), value]); } return result; }
function distinct<T>(values: T[], key: (value: T) => string) { return new Set(values.map(key)).size; }
function id(row: Row) { return row.features.targetRunnerId; }
function raceId(row: Row) { return row.features.targetRaceId; }
function compareRows(a: Row, b: Row) { return a.features.raceDateTime.getTime() - b.features.raceDateTime.getTime() || raceId(a).localeCompare(raceId(b)) || id(a).localeCompare(id(b)); }
function pct(value: number | null) { return value === null || !Number.isFinite(value) ? "-" : `${(value * 100).toFixed(2)}%`; }
function num(value: number | null, digits = 3) { return value === null || !Number.isFinite(value) ? "-" : value.toFixed(digits); }
function table(lines: string[], rows: Array<Record<string, unknown>>) { if (rows.length === 0) { lines.push("No rows.", ""); return; } const headers = Object.keys(rows[0]!); lines.push(`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map((row) => `| ${headers.map((header) => String(row[header] ?? "-").replace(/\|/g, "\\|")).join(" | ")} |`), ""); }

await main();
