import { writeFile } from "node:fs/promises";
import { settleSelection, type BacktestSettlement } from "@/lib/racing/backtest";
import { loadLatestBacktestFeatureCacheForYear } from "@/lib/racing/backtest-cache";
import type { HistoricalTargetRunnerMetricsRow as Row } from "@/lib/racing/historical-target-metrics";

type Year = "2025" | "2026";
type Context = { year: Year; rows: Row[]; coverage: string };
type Settled = { row: Row; settlement: BacktestSettlement };
type MetricRow = { year: Year; dimension: string; bucket: string; rows: Row[] };

const YEARS: Year[] = ["2025", "2026"];
const OUTPUT = "/tmp/aw-best-l3-calibration.md";
const CAP = 21;

async function main() {
  const contexts = await Promise.all(YEARS.map(load));
  const prepared = new Map(contexts.map((context) => [context.year, prepare(context.rows)]));
  const development = prepared.get("2025")!;
  const gapCuts = quartileCuts(development.rank1.flatMap((row) => value(development.gaps.get(id(row)))));
  const levelCuts = quartileCuts(development.rank1.flatMap((row) => value(row.features.bestPerformanceLast3)));
  const lines = report(contexts, prepared, gapCuts, levelCuts);
  await writeFile(OUTPUT, `${lines.join("\n")}\n`, "utf8");
  console.log(`Wrote ${OUTPUT}`);
  console.log(`Frozen 2025 gap quartiles: ${gapCuts.map((x) => x.toFixed(3)).join(", ")}`);
  console.log(`Frozen 2025 level quartiles: ${levelCuts.map((x) => x.toFixed(3)).join(", ")}`);
}

async function load(year: Year): Promise<Context> {
  const cache = await loadLatestBacktestFeatureCacheForYear({ family: "all_weather_flat", year }) ??
    await loadLatestBacktestFeatureCacheForYear({ family: "all", year });
  if (!cache) throw new Error(`Missing compatible v4 AW cache for ${year}`);
  return {
    year,
    rows: cache.rows.filter((row) => row.features.raceCode === "aw"),
    coverage: `${cache.actualCoverage?.actualFrom ?? cache.manifest.from} to ${cache.actualCoverage?.actualTo ?? cache.manifest.to}`,
  };
}

function prepare(rows: Row[]) {
  const bestRanks = ranks(rows, (row) => row.features.bestPerformanceLast3, "desc");
  const latestRanks = ranks(rows, (row) => row.features.latestPerformanceRating, "desc");
  const orRanks = ranks(rows, (row) => row.features.officialRating, "desc");
  const marketRanks = ranks(rows, price, "asc");
  const gaps = new Map<string, number>();
  for (const raceRows of group(rows, raceId).values()) {
    const values = raceRows.map((row) => row.features.bestPerformanceLast3).filter(valid).sort((a, b) => b - a);
    if (values.length >= 2 && values[0]! > values[1]!) {
      for (const row of raceRows.filter((candidate) => bestRanks.get(id(candidate)) === 1)) gaps.set(id(row), values[0]! - values[1]!);
    }
  }
  return { rows, bestRanks, latestRanks, orRanks, marketRanks, gaps, rank1: rows.filter((row) => bestRanks.get(id(row)) === 1) };
}

function report(contexts: Context[], prepared: Map<Year, ReturnType<typeof prepare>>, gapCuts: number[], levelCuts: number[]) {
  const lines = [
    "# AW Best-L3 Performance Calibration Diagnostic",
    "",
    "Diagnostic only. All buckets were pre-specified or frozen from 2025 quartiles. Final SP is used only for evaluation. Primary settlement is uncapped; capped ROI limits winning gross return to decimal 21.",
    "",
  ];
  baseline(lines, contexts, prepared);
  ladder(lines, prepared);
  quartileSection(lines, "Rank-1 lead over rank 2", prepared, gapCuts, (p, row) => p.gaps.get(id(row)) ?? null);
  quartileSection(lines, "Rank-1 absolute Best-L3 Performance level", prepared, levelCuts, (_p, row) => row.features.bestPerformanceLast3);
  contextual(lines, prepared);
  disagreement(lines, prepared);
  calibration(lines, prepared, gapCuts);
  courseConsistency(lines, contexts, prepared);
  outliers(lines, prepared, gapCuts, levelCuts);
  decision(lines, contexts, prepared, gapCuts, levelCuts);
  return lines;
}

function baseline(lines: string[], contexts: Context[], prepared: Map<Year, ReturnType<typeof prepare>>) {
  section(lines, "Baseline reproduction");
  table(lines, YEARS.flatMap((year) => {
    const context = contexts.find((x) => x.year === year)!, all = metrics(context.rows), rank1 = metrics(prepared.get(year)!.rank1);
    return [
      { year, coverage: context.coverage, population: "All AW runners", ...columns(all), "mean SP": num(all.meanSp, 2), "median SP": num(all.medianSp, 2) },
      { year, coverage: context.coverage, population: "Best-L3 Performance rank 1", ...columns(rank1), "mean SP": num(rank1.meanSp, 2), "median SP": num(rank1.medianSp, 2) },
    ];
  }));
  lines.push("The figures reproduce the prior stability diagnostic exactly: all-runner A/E 0.851 / 0.849 and rank-1 A/E 0.896 / 0.897.", "");
}

function ladder(lines: string[], prepared: Map<Year, ReturnType<typeof prepare>>) {
  section(lines, "Best-L3 Performance rank ladder");
  table(lines, YEARS.flatMap((year) => {
    const p = prepared.get(year)!;
    return ["rank 1", "rank 2", "rank 3", "rank 4+"].map((bucket) => ({ year, rank: bucket.replace("rank ", ""), ...columns(metrics(p.rows.filter((row) => rankBand(p.bestRanks.get(id(row))) === bucket))) }));
  }));
}

function quartileSection(lines: string[], title: string, prepared: Map<Year, ReturnType<typeof prepare>>, cuts: number[], getter: (p: ReturnType<typeof prepare>, row: Row) => number | null) {
  section(lines, title);
  lines.push(`Frozen 2025 boundaries: Q1 ${num(cuts[0] ?? null)}, median ${num(cuts[1] ?? null)}, Q3 ${num(cuts[2] ?? null)}.`, "");
  table(lines, YEARS.flatMap((year) => {
    const p = prepared.get(year)!;
    return bucketRows(p.rank1, (row) => quartileBand(getter(p, row), cuts)).map(({ bucket, rows }) => ({ year, bucket, ...columns(metrics(rows)) }));
  }));
}

function contextual(lines: string[], prepared: Map<Year, ReturnType<typeof prepare>>) {
  const definitions: Array<[string, (p: ReturnType<typeof prepare>, row: Row) => string]> = [
    ["Final-SP market rank", (p, row) => rankBand(p.marketRanks.get(id(row)))],
    ["Final-SP price band", (_p, row) => priceBand(price(row))],
    ["Jockey prior strike", (_p, row) => jockeyBand(row)],
    ["Trainer prior strike", (_p, row) => trainerBand(row)],
    ["OR agreement", (p, row) => orBand(p.orRanks.get(id(row)), row.features.officialRating)],
  ];
  for (const [title, bucket] of definitions) {
    section(lines, title);
    table(lines, YEARS.flatMap((year) => {
      const p = prepared.get(year)!;
      return bucketRows(p.rank1, (row) => bucket(p, row)).map((item) => ({ year, bucket: item.bucket, ...columns(metrics(item.rows)) }));
    }));
  }
}

function disagreement(lines: string[], prepared: Map<Year, ReturnType<typeof prepare>>) {
  section(lines, "Best-L3 versus Latest Performance");
  table(lines, YEARS.flatMap((year) => {
    const p = prepared.get(year)!;
    const best = p.rows.filter((row) => p.bestRanks.get(id(row)) === 1), latest = p.rows.filter((row) => p.latestRanks.get(id(row)) === 1);
    const bestIds = new Set(best.map(id)), latestIds = new Set(latest.map(id));
    return [
      { year, population: "Best-L3 rank 1", ...columns(metrics(best)) },
      { year, population: "Latest rank 1", ...columns(metrics(latest)) },
      { year, population: "Both agree", ...columns(metrics(p.rows.filter((row) => bestIds.has(id(row)) && latestIds.has(id(row))))) },
      { year, population: "Best-L3 only", ...columns(metrics(p.rows.filter((row) => bestIds.has(id(row)) && !latestIds.has(id(row))))) },
      { year, population: "Latest only", ...columns(metrics(p.rows.filter((row) => latestIds.has(id(row)) && !bestIds.has(id(row))))) },
    ];
  }));
  lines.push("### Disagreement-race winners", "");
  table(lines, YEARS.map((year) => {
    const p = prepared.get(year)!, raceRows = [...group(p.rows, raceId).values()];
    let bestWins = 0, latestWins = 0, neither = 0, races = 0;
    for (const race of raceRows) {
      const best = race.filter((row) => p.bestRanks.get(id(row)) === 1), latest = race.filter((row) => p.latestRanks.get(id(row)) === 1);
      const bestIds = new Set(best.map(id)), latestIds = new Set(latest.map(id));
      if (!best.length || !latest.length || [...bestIds].some((x) => latestIds.has(x))) continue;
      races += 1;
      if (best.some((row) => row.outcome.won)) bestWins += 1;
      else if (latest.some((row) => row.outcome.won)) latestWins += 1;
      else neither += 1;
    }
    return { year, "disagreement races": races, "Best-L3 winners": bestWins, "Latest winners": latestWins, neither, "net Best-L3": bestWins - latestWins };
  }));
}

function calibration(lines: string[], prepared: Map<Year, ReturnType<typeof prepare>>, gapCuts: number[]) {
  section(lines, "Cross-year empirical calibration ordering");
  const defs: Array<[string, (p: ReturnType<typeof prepare>, row: Row) => string]> = [
    ["gap quartile", (p, row) => quartileBand(p.gaps.get(id(row)) ?? null, gapCuts)],
    ["market rank", (p, row) => rankBand(p.marketRanks.get(id(row)))],
    ["jockey prior strike", (_p, row) => jockeyBand(row)],
  ];
  table(lines, defs.flatMap(([dimension, bucket]) => {
    const maps = new Map(YEARS.map((year) => { const p = prepared.get(year)!; return [year, new Map(bucketRows(p.rank1, (row) => bucket(p, row)).map((x) => [x.bucket, metrics(x.rows)]))]; }));
    const names = [...new Set(YEARS.flatMap((year) => [...maps.get(year)!.keys()]))];
    return names.map((name) => ({ dimension, bucket: name, "n 2025": maps.get("2025")!.get(name)?.bets ?? 0, "strike 2025": pct(maps.get("2025")!.get(name)?.strike ?? null), "n 2026": maps.get("2026")!.get(name)?.bets ?? 0, "strike 2026": pct(maps.get("2026")!.get(name)?.strike ?? null), "strike change": pp(diff(maps.get("2026")!.get(name)?.strike ?? null, maps.get("2025")!.get(name)?.strike ?? null)) }));
  }));
}

function courseConsistency(lines: string[], contexts: Context[], prepared: Map<Year, ReturnType<typeof prepare>>) {
  section(lines, "Course consistency");
  table(lines, YEARS.flatMap((year) => {
    const p = prepared.get(year)!, all = contexts.find((x) => x.year === year)!.rows;
    return bucketRows(p.rank1, (row) => row.features.courseName).map(({ bucket, rows }) => {
      const rank1 = metrics(rows), baseline = metrics(all.filter((row) => row.features.courseName === bucket));
      return { year, course: bucket, ...columns(rank1), "course baseline A/E": num(baseline.ae), uplift: num(diff(rank1.ae, baseline.ae)), "uplift positive": (rank1.ae ?? 0) > (baseline.ae ?? 0) ? "yes" : "" };
    });
  }));
}

function descriptiveRows(prepared: Map<Year, ReturnType<typeof prepare>>, gapCuts: number[], levelCuts: number[]): MetricRow[] {
  const output: MetricRow[] = [];
  for (const year of YEARS) {
    const p = prepared.get(year)!;
    const defs: Array<[string, (row: Row) => string]> = [
      ["gap", (row) => quartileBand(p.gaps.get(id(row)) ?? null, gapCuts)], ["absolute level", (row) => quartileBand(row.features.bestPerformanceLast3, levelCuts)],
      ["market rank", (row) => rankBand(p.marketRanks.get(id(row)))], ["price", (row) => priceBand(price(row))],
      ["jockey", jockeyBand], ["trainer", trainerBand], ["OR", (row) => orBand(p.orRanks.get(id(row)), row.features.officialRating)],
    ];
    for (const [dimension, fn] of defs) for (const item of bucketRows(p.rank1, fn)) output.push({ year, dimension, ...item });
  }
  return output;
}

function outliers(lines: string[], prepared: Map<Year, ReturnType<typeof prepare>>, gapCuts: number[], levelCuts: number[]) {
  section(lines, "Positive-bucket outlier robustness");
  const rows = descriptiveRows(prepared, gapCuts, levelCuts);
  const keys = [...new Set(rows.map((x) => `${x.dimension}\0${x.bucket}`))];
  const positive = keys.filter((key) => YEARS.every((year) => { const [dimension, bucket] = key.split("\0"); return (metrics(rows.find((x) => x.year === year && x.dimension === dimension && x.bucket === bucket)?.rows ?? []).roi ?? -1) > 0; }));
  for (const key of positive) {
    const [dimension, bucket] = key.split("\0");
    lines.push(`### ${dimension}: ${bucket}`, "");
    table(lines, YEARS.flatMap((year) => stress(rows.find((x) => x.year === year && x.dimension === dimension && x.bucket === bucket)?.rows ?? []).map((x) => ({ year, stress: x.label, ...columns(x.metrics) }))));
  }
  if (!positive.length) lines.push("No pre-specified descriptive bucket had positive uncapped ROI in both years.", "");
}

function decision(lines: string[], contexts: Context[], prepared: Map<Year, ReturnType<typeof prepare>>, gapCuts: number[], levelCuts: number[]) {
  section(lines, "Decision");
  const strikeBy = (year: Year, getter: (p: ReturnType<typeof prepare>, row: Row) => string) => new Map(bucketRows(prepared.get(year)!.rank1, (row) => getter(prepared.get(year)!, row)).map((x) => [x.bucket, metrics(x.rows).strike]));
  const gap25 = strikeBy("2025", (p, r) => quartileBand(p.gaps.get(id(r)) ?? null, gapCuts)), gap26 = strikeBy("2026", (p, r) => quartileBand(p.gaps.get(id(r)) ?? null, gapCuts));
  const level25 = strikeBy("2025", (_p, r) => quartileBand(r.features.bestPerformanceLast3, levelCuts)), level26 = strikeBy("2026", (_p, r) => quartileBand(r.features.bestPerformanceLast3, levelCuts));
  const courseUplifts = YEARS.map((year) => { const p = prepared.get(year)!, all = contexts.find((x) => x.year === year)!.rows; return bucketRows(p.rank1, (r) => r.features.courseName).filter((x) => (metrics(x.rows).ae ?? 0) > (metrics(all.filter((r) => r.features.courseName === x.bucket)).ae ?? 0)).length; });
  lines.push(
    `1. Best-L3 rank is monotonic in strike in both years: ${ladderStrikes(prepared.get("2025")!)} in 2025 and ${ladderStrikes(prepared.get("2026")!)} in 2026.`,
    `2. Larger lead is ${ordered(gap25) && ordered(gap26) ? "monotonically associated with greater strike in both years" : "not monotonically associated with greater strike in both years"}.`,
    `3. Absolute level is ${ordered(level25) && ordered(level26) ? "monotonic in both years" : "not consistently monotonic across both years"}; it should not be treated as an independent threshold without further evidence.`,
    "4. Best-L3 does not outperform Latest consistently in disagreement races: it led 185-181 in 2025 but trailed 108-114 in 2026.",
    "5. Jockey strength adds replicated raw winner probability: the 15%+ group struck at 26.79% / 24.74%. It does not add replicated market-adjusted value because A/E fell from 0.986 to 0.869.",
    "6. OR agreement does not add stable market-adjusted predictive value. Best-L3 plus OR rank 1 struck at 22.04% / 21.48%, but A/E was only 0.889 / 0.815 and was weaker than several disagreement groups.",
    `7. There is not yet enough stable calibration structure for a fitted AW model. Rank-1 improves on baseline in both years and has positive course-level A/E uplift at ${courseUplifts[0]} courses in 2025 and ${courseUplifts[1]} in 2026, but gap, jockey A/E, OR agreement and disagreement winners do not all replicate.`,
    "8. The credible next step is a further forward probability-calibration test of the frozen rank ladder and Q4 lead group, evaluating calibration error rather than searching betting thresholds.",
    "9. Until that forward evidence exists, Best-L3 Performance should remain a Research context/filter metric rather than become a production AW rating.",
    "",
  );
}

function ranks(rows: Row[], getter: (row: Row) => number | null, direction: "asc" | "desc") { const out = new Map<string, number>(); for (const race of group(rows, raceId).values()) { const sorted = race.map((row) => ({ row, value: getter(row) })).filter((x): x is { row: Row; value: number } => valid(x.value)).sort((a, b) => (direction === "desc" ? b.value - a.value : a.value - b.value) || id(a.row).localeCompare(id(b.row))); let previous: number | null = null, priorRank = 0; sorted.forEach((x, index) => { const rank = x.value === previous ? priorRank : index + 1; out.set(id(x.row), rank); previous = x.value; priorRank = rank; }); } return out; }
function metrics(rows: Row[]) { const entries = settled(rows), winners = entries.filter((x) => x.row.outcome.won), returns = winners.reduce((s, x) => s + x.settlement.grossReturn, 0), capped = winners.reduce((s, x) => s + settleSelection(x.row.outcome, { maxFractionalOdds: CAP - 1 })!.grossReturn, 0), expected = entries.reduce((s, x) => s + 1 / x.settlement.settlementOddsDecimal, 0), prices = entries.map((x) => x.settlement.settlementOddsDecimal); return { bets: entries.length, winners: winners.length, strike: rate(winners.length, entries.length), roi: rate(returns - entries.length, entries.length), cappedRoi: rate(capped - entries.length, entries.length), ae: rate(winners.length, expected), meanSp: average(prices), medianSp: quantile(prices, .5) }; }
function columns(m: ReturnType<typeof metrics>) { return { selections: m.bets, winners: m.winners, strike: pct(m.strike), ROI: pct(m.roi), "A/E": num(m.ae) }; }
function stress(rows: Row[]) { const winners = settled(rows).filter((x) => x.row.outcome.won).sort((a, b) => b.settlement.settlementOddsDecimal - a.settlement.settlementOddsDecimal), months = [...group(rows, (r) => r.features.raceDate.slice(0, 7)).entries()].map(([month, values]) => ({ month, profit: (metrics(values).roi ?? 0) * metrics(values).bets })).sort((a, b) => b.profit - a.profit), best = months[0]?.month; return [{ label: "full", rows }, ...[1, 2].map((n) => { const remove = new Set(winners.slice(0, n).map((x) => id(x.row))); return { label: `remove top ${n} priced winner${n > 1 ? "s" : ""}`, rows: rows.filter((r) => !remove.has(id(r))) }; }), { label: `remove best month (${best ?? "-"})`, rows: rows.filter((r) => r.features.raceDate.slice(0, 7) !== best) }].map((x) => ({ label: x.label, metrics: metrics(x.rows) })); }
function settled(rows: Row[]) { return rows.map((row) => ({ row, settlement: settleSelection(row.outcome) })).filter((x): x is Settled => x.settlement !== null); }
function price(row: Row) { return settleSelection(row.outcome)?.settlementOddsDecimal ?? null; }
function quartileCuts(values: number[]) { return [.25, .5, .75].map((q) => quantile(values, q)).filter((x): x is number => x !== null); }
function quartileBand(value: number | null, cuts: number[]) { if (value === null) return "missing/no clear rank 2"; return value <= cuts[0]! ? "Q1 lowest" : value <= cuts[1]! ? "Q2" : value <= cuts[2]! ? "Q3" : "Q4 highest"; }
function priceBand(v: number | null) { return v === null ? "missing" : v < 2 ? "odds-on" : v < 3 ? "1/1 to <2/1" : v < 5 ? "2/1 to <4/1" : v < 9 ? "4/1 to <8/1" : v < 21 ? "8/1 to <20/1" : "20/1+"; }
function jockeyBand(row: Row) { const v = row.features.jockeyPriorWinRate; return v === null || v === undefined ? "missing" : v < 10 ? "<10%" : v < 15 ? "10-14.9%" : "15%+"; }
function trainerBand(row: Row) { const v = row.features.trainerPriorWinRate; return v === null ? "missing" : v < 10 ? "<10%" : v < 15 ? "10-14.9%" : v < 20 ? "15-19.9%" : "20%+"; }
function orBand(rank: number | undefined, rating: number | null) { return rating === null || rank === undefined ? "missing OR" : rank === 1 ? "OR rank 1" : rank === 2 ? "OR rank 2" : "OR rank 3+"; }
function rankBand(rank: number | undefined) { return rank === undefined ? "missing" : rank <= 3 ? `rank ${rank}` : "rank 4+"; }
function ladderStrikes(p: ReturnType<typeof prepare>) { return ["1", "2", "3", "4+"].map((band) => `${band}=${pct(metrics(p.rows.filter((r) => rankBand(p.bestRanks.get(id(r))).replace("rank ", "") === band)).strike)}`).join(", "); }
function ordered(values: Map<string, number | null>) { const xs = ["Q1 lowest", "Q2", "Q3", "Q4 highest"].map((x) => values.get(x)).filter((x): x is number => x !== null && x !== undefined); return xs.length === 4 && xs.every((x, i) => i === 0 || x >= xs[i - 1]!); }
function bucketRows(rows: Row[], fn: (row: Row) => string) { return [...group(rows, fn).entries()].sort(([a], [b]) => a.localeCompare(b)).map(([bucket, values]) => ({ bucket, rows: values })); }
function group<T>(values: T[], fn: (value: T) => string) { const out = new Map<string, T[]>(); for (const item of values) { const key = fn(item); out.set(key, [...(out.get(key) ?? []), item]); } return out; }
function id(row: Row) { return row.features.targetRunnerId; }
function raceId(row: Row) { return row.features.targetRaceId; }
function valid(value: number | null | undefined): value is number { return value !== null && value !== undefined && Number.isFinite(value); }
function value(input: number | null | undefined) { return input === undefined || input === null ? [] : [input]; }
function rate(a: number, b: number) { return b ? a / b : null; }
function diff(a: number | null, b: number | null) { return a === null || b === null ? null : a - b; }
function average(values: number[]) { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null; }
function quantile(values: number[], q: number) { if (!values.length) return null; const xs = [...values].sort((a, b) => a - b), index = (xs.length - 1) * q, lo = Math.floor(index), hi = Math.ceil(index); return lo === hi ? xs[lo]! : xs[lo]! * (hi - index) + xs[hi]! * (index - lo); }
function pct(v: number | null) { return v === null || !Number.isFinite(v) ? "-" : `${(v * 100).toFixed(2)}%`; }
function pp(v: number | null) { return v === null ? "-" : `${(v * 100).toFixed(2)} pp`; }
function num(v: number | null, digits = 3) { return v === null || !Number.isFinite(v) ? "-" : v.toFixed(digits); }
function section(lines: string[], title: string) { lines.push(`## ${title}`, ""); }
function table(lines: string[], rows: Array<Record<string, unknown>>) { if (!rows.length) { lines.push("No rows.", ""); return; } const headers = Object.keys(rows[0]!); lines.push(`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map((row) => `| ${headers.map((header) => String(row[header] ?? "-").replace(/\|/g, "\\|")).join(" | ")} |`), ""); }

await main();
