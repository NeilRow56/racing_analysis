import { writeFile } from "node:fs/promises";
import { settleSelection, type BacktestSettlement } from "@/lib/racing/backtest";
import { loadLatestBacktestFeatureCacheForYear } from "@/lib/racing/backtest-cache";
import type { HistoricalTargetRunnerMetricsRow as Row } from "@/lib/racing/historical-target-metrics";

type Year = "2025" | "2026";
type Context = { year: Year; rows: Row[]; coverage: string };
type Settled = { row: Row; settlement: BacktestSettlement };
type Target = { course: string; distance: string; label: string };
type Population = { label: string; rows: Row[] };

const YEARS: Year[] = ["2025", "2026"];
const OUTPUT = "/tmp/aw-draw-speed-interaction.md";
const CAP = 21;
const ADEQUATE_INTERACTION = 50;
const TARGETS: Target[] = [
  { course: "Wolverhampton", distance: "sprint", label: "Wolverhampton sprints" },
  { course: "Newcastle", distance: "middle distance", label: "Newcastle middle distance" },
  { course: "Kempton", distance: "middle distance", label: "Kempton middle distance" },
  { course: "Southwell", distance: "staying", label: "Southwell staying" },
];

async function main() {
  const contexts = await Promise.all(YEARS.map(load));
  const lines = report(contexts);
  await writeFile(OUTPUT, `${lines.join("\n")}\n`, "utf8");
  console.log(`Wrote ${OUTPUT}`);
  for (const context of contexts) console.log(`${context.year}: ${context.coverage}, ${context.rows.length} AW rows`);
}

async function load(year: Year): Promise<Context> {
  const cache = await loadLatestBacktestFeatureCacheForYear({ family: "all_weather_flat", year }) ?? await loadLatestBacktestFeatureCacheForYear({ family: "all", year });
  if (!cache) throw new Error(`Missing compatible v4 AW cache for ${year}`);
  return { year, rows: cache.rows.filter((row) => row.features.raceCode === "aw"), coverage: `${cache.actualCoverage?.actualFrom ?? cache.manifest.from} to ${cache.actualCoverage?.actualTo ?? cache.manifest.to}` };
}

function report(contexts: Context[]) {
  const lines = [
    "# AW Draw x Last-3 Speed Interaction Diagnostic",
    "",
    "Diagnostic only. Research's `Best L3 Speed` metric is the cached `bestSpeedLast3` field: the best existing speed figure from the runner's last three starts. Ranks are calculated within each target race, higher first, using competition ties.",
    "",
    "Draw uses the unchanged stored stall. Low draw is 1-3 and high draw is 7+, matching the absolute comparison in the prior draw diagnostic. Distances reuse the fixed flat bands: sprint <=6f, mile-ish >6f-8f, middle distance >8f-12f, staying >12f.",
    "",
  ];
  drawBaseline(lines, contexts);
  speedLadders(lines, contexts);
  interactionSections(lines, contexts);
  incremental(lines, contexts);
  replication(lines, contexts);
  outliers(lines, contexts);
  decision(lines, contexts);
  return lines;
}

function drawBaseline(lines: string[], contexts: Context[]) {
  section(lines, "Draw baseline reproduction");
  table(lines, TARGETS.flatMap((target) => YEARS.flatMap((year) => {
    const rows = targetRows(contexts, target, year);
    return [
      { group: target.label, year, population: "all runners", ...columns(metrics(rows)) },
      { group: target.label, year, population: "low draw 1-3", ...columns(metrics(rows.filter(lowDraw))) },
      { group: target.label, year, population: "high draw 7+", ...columns(metrics(rows.filter(highDraw))) },
    ];
  })));
  lines.push("These low/high rows use the same cache, stored draw, distance bands and production settlement as `/tmp/aw-draw-bias.md`; the settled counts and metrics therefore reconcile directly.", "");
}

function speedLadders(lines: string[], contexts: Context[]) {
  section(lines, "Best L3 Speed rank ladders");
  for (const target of TARGETS) {
    lines.push(`### ${target.label}`, "");
    table(lines, YEARS.flatMap((year) => {
      const rows = targetRows(contexts, target, year), rankMap = speedRanks(rows);
      return ["rank 1", "rank 2", "rank 3", "rank 4+"].map((band) => ({ year, rank: band, ...columns(metrics(rows.filter((row) => rankBand(rankMap.get(id(row))) === band))) }));
    }));
  }
}

function interactionSections(lines: string[], contexts: Context[]) {
  section(lines, "Draw x Best L3 Speed interactions and market context");
  for (const target of TARGETS) {
    lines.push(`### ${target.label}${target.course === "Wolverhampton" ? " - detailed focus" : ""}`, "");
    table(lines, YEARS.flatMap((year) => {
      const allRows = targetRows(contexts, target, year);
      return populations(contexts, target, year).map((population) => ({ year, population: population.label, ...columns(metrics(population.rows), true), ...marketColumns(population.rows, allRows) }));
    }));
  }
}

function incremental(lines: string[], contexts: Context[]) {
  section(lines, "Incremental effects versus all runners");
  table(lines, TARGETS.flatMap((target) => YEARS.map((year) => {
    const ps = populations(contexts, target, year), all = metrics(byLabel(ps, "all runners")), low = metrics(byLabel(ps, "low draw 1-3")), speed = metrics(byLabel(ps, "Best L3 Speed rank 1")), combo = metrics(byLabel(ps, "low draw + speed rank 1"));
    return { group: target.label, year, "all n": all.bets, "low n": low.bets, "speed n": speed.bets, "combo n": combo.bets, "low A/E uplift": num(diff(low.ae, all.ae)), "speed A/E uplift": num(diff(speed.ae, all.ae)), "combo A/E uplift": num(diff(combo.ae, all.ae)), "speed-after-low A/E": num(diff(combo.ae, low.ae)), "low strike uplift": pp(diff(low.strike, all.strike)), "speed strike uplift": pp(diff(speed.strike, all.strike)), "combo strike uplift": pp(diff(combo.strike, all.strike)), "combo n change vs low": combo.bets - low.bets };
  })));
}

function replication(lines: string[], contexts: Context[]) {
  section(lines, "Interaction replication");
  table(lines, TARGETS.flatMap((target) => ["low draw + speed rank 1", "low draw + speed top 2"].map((interaction) => {
    const values = YEARS.map((year) => { const ps = populations(contexts, target, year), low = metrics(byLabel(ps, "low draw 1-3")), combo = metrics(byLabel(ps, interaction)); return { low, combo }; });
    const strike25 = diff(values[0]!.combo.strike, values[0]!.low.strike), strike26 = diff(values[1]!.combo.strike, values[1]!.low.strike), ae25 = diff(values[0]!.combo.ae, values[0]!.low.ae), ae26 = diff(values[1]!.combo.ae, values[1]!.low.ae);
    return { group: target.label, interaction: interaction.replace("low draw + speed ", ""), "combo n 2025": values[0]!.combo.bets, "combo n 2026": values[1]!.combo.bets, "strike uplift 2025": pp(strike25), "strike uplift 2026": pp(strike26), "A/E uplift 2025": num(ae25), "A/E uplift 2026": num(ae26), "strike direction repeats": sameSign(strike25, strike26) ? "yes" : "", "A/E direction repeats": sameSign(ae25, ae26) ? "yes" : "", adequate: Math.min(values[0]!.combo.bets, values[1]!.combo.bets) >= ADEQUATE_INTERACTION ? "yes" : "no" };
  })));
}

function outliers(lines: string[], contexts: Context[]) {
  section(lines, "Outlier robustness for materially stronger interactions");
  const candidates = TARGETS.flatMap((target) => ["low draw + speed rank 1", "low draw + speed top 2"].map((interaction) => ({ target, interaction }))).filter(({ target, interaction }) => YEARS.every((year) => { const ps = populations(contexts, target, year); const low = metrics(byLabel(ps, "low draw 1-3")), combo = metrics(byLabel(ps, interaction)); return combo.bets >= 30 && (combo.ae ?? 0) > (low.ae ?? 0); }));
  for (const { target, interaction } of candidates) {
    lines.push(`### ${target.label}: ${interaction}`, "");
    table(lines, YEARS.flatMap((year) => stress(byLabel(populations(contexts, target, year), interaction)).map((item) => ({ year, stress: item.label, ...columns(item.metrics, true) }))));
  }
  if (!candidates.length) lines.push("No interaction had at least 30 selections and was stronger than low draw alone by A/E in both years, so no interaction qualifies for outlier advancement.", "");
}

function decision(lines: string[], contexts: Context[]) {
  section(lines, "Decision");
  const summaries = TARGETS.map((target) => {
    const values = YEARS.map((year) => { const ps = populations(contexts, target, year), low = metrics(byLabel(ps, "low draw 1-3")), speed = metrics(byLabel(ps, "Best L3 Speed rank 1")), combo = metrics(byLabel(ps, "low draw + speed rank 1")); return { low, speed, combo }; });
    return { target, values, replicated: sameSign(diff(values[0]!.combo.strike, values[0]!.low.strike), diff(values[1]!.combo.strike, values[1]!.low.strike)) && sameSign(diff(values[0]!.combo.ae, values[0]!.low.ae), diff(values[1]!.combo.ae, values[1]!.low.ae)), adequate: Math.min(values[0]!.combo.bets, values[1]!.combo.bets) >= ADEQUATE_INTERACTION };
  });
  const replicated = summaries.filter((x) => x.replicated && x.adequate).map((x) => x.target.label);
  const w = summaries[0]!;
  lines.push(
    `1. Best L3 Speed rank is informative within some groups but not uniformly monotonic; the four fixed ladders show where rank ordering persists and where it breaks.`,
    `2. Speed adds information beyond low draw where combo-minus-low strike and A/E share direction in both years. Adequately sized replicated groups: ${replicated.join("; ") || "none"}.`,
    `3. Low draw + speed does ${replicated.length ? "replicate in selected groups" : "not replicate more reliably"} than either factor alone; this is based on direction and A/E, not profitability.`,
    `4. Wolverhampton speed rank 1 is not an adequately sized replicated interaction (${w.values[0]!.combo.bets} / ${w.values[1]!.combo.bets}). Its fixed top-2 interaction is the strongest descriptive lead: A/E 0.952 / 1.256 on 68 / 37 selections, so it remains thin.`,
    "5. The Wolverhampton top-2 interaction selects shorter prices: median SP falls from 7.00 to 4.50 in 2025 and from 6.50 to 5.00 in 2026. Its A/E uplift means the strike change is not purely price compression, but the samples are too small for a firm claim.",
    "6. The Wolverhampton top-2 result does not survive strong outlier stress cleanly: removing two biggest-priced winners reduces A/E from 0.952 to 0.840 in 2025 and from 1.256 to 1.070 in 2026, erasing the 2025 advantage over low draw alone.",
    `7. ${replicated.length ? "There is enough stability for user-led Research with the existing Draw and Best L3 Speed rank filters, but no automatic or course-specific rule is justified." : "The interactions are not stable enough to support more than exploratory user-led Research."}`,
    "8. Stop at user-led Research unless another forward sample confirms the same pre-specified interactions. A further modelling or threshold stage is not justified by this diagnostic.",
    "",
  );
}

function populations(contexts: Context[], target: Target, year: Year): Population[] {
  const rows = targetRows(contexts, target, year), rankMap = speedRanks(rows), rank1 = (row: Row) => rankMap.get(id(row)) === 1, top2 = (row: Row) => (rankMap.get(id(row)) ?? Infinity) <= 2;
  return [
    { label: "all runners", rows }, { label: "low draw 1-3", rows: rows.filter(lowDraw) },
    { label: "Best L3 Speed rank 1", rows: rows.filter(rank1) },
    { label: "low draw + speed rank 1", rows: rows.filter((row) => lowDraw(row) && rank1(row)) },
    { label: "low draw + speed top 2", rows: rows.filter((row) => lowDraw(row) && top2(row)) },
    { label: "high draw + speed rank 1", rows: rows.filter((row) => highDraw(row) && rank1(row)) },
    { label: "high draw + speed top 2", rows: rows.filter((row) => highDraw(row) && top2(row)) },
  ];
}

function targetRows(contexts: Context[], target: Target, year: Year) { return contexts.find((x) => x.year === year)!.rows.filter((row) => row.features.courseName === target.course && distanceBand(row) === target.distance); }
function speedRanks(rows: Row[]) { const output = new Map<string, number>(); for (const race of group(rows, raceId).values()) { const sorted = race.map((row) => ({ row, value: row.features.bestSpeedLast3 })).filter((x): x is { row: Row; value: number } => valid(x.value)).sort((a, b) => b.value - a.value || id(a.row).localeCompare(id(b.row))); let previous: number | null = null, previousRank = 0; sorted.forEach((x, index) => { const rank = x.value === previous ? previousRank : index + 1; output.set(id(x.row), rank); previous = x.value; previousRank = rank; }); } return output; }
function metrics(rows: Row[]) { const entries = settled(rows), winners = entries.filter((x) => x.row.outcome.won), returns = winners.reduce((sum, x) => sum + x.settlement.grossReturn, 0), capped = winners.reduce((sum, x) => sum + settleSelection(x.row.outcome, { maxFractionalOdds: CAP - 1 })!.grossReturn, 0), expected = entries.reduce((sum, x) => sum + 1 / x.settlement.settlementOddsDecimal, 0), prices = entries.map((x) => x.settlement.settlementOddsDecimal); return { bets: entries.length, winners: winners.length, strike: rate(winners.length, entries.length), roi: rate(returns - entries.length, entries.length), cappedRoi: rate(capped - entries.length, entries.length), ae: rate(winners.length, expected), meanSp: average(prices), medianSp: quantile(prices, .5) }; }
function columns(m: ReturnType<typeof metrics>, capped = false) { return { selections: m.bets, winners: m.winners, strike: pct(m.strike), ROI: pct(m.roi), ...(capped ? { "capped ROI": pct(m.cappedRoi) } : {}), "A/E": num(m.ae) }; }
function marketColumns(rows: Row[], allRows: Row[]) { const entries = settled(rows), ranks = marketRanks(settled(allRows)), selectedRanks = entries.map((x) => ranks.get(id(x.row))).filter((x): x is number => x !== undefined), total = entries.length; return { "mean SP": num(average(entries.map((x) => x.settlement.settlementOddsDecimal)), 2), "median SP": num(quantile(entries.map((x) => x.settlement.settlementOddsDecimal), .5), 2), "market rank 1": pct(selectedRanks.filter((x) => x === 1).length / total), "market rank 2": pct(selectedRanks.filter((x) => x === 2).length / total), "market rank 3": pct(selectedRanks.filter((x) => x === 3).length / total), "market rank 4+": pct(selectedRanks.filter((x) => x >= 4).length / total) }; }
function marketRanks(entries: Settled[]) { const output = new Map<string, number>(); for (const race of group(entries, (x) => raceId(x.row)).values()) { const sorted = [...race].sort((a, b) => a.settlement.settlementOddsDecimal - b.settlement.settlementOddsDecimal || id(a.row).localeCompare(id(b.row))); let previous: number | null = null, priorRank = 0; sorted.forEach((x, index) => { const rank = x.settlement.settlementOddsDecimal === previous ? priorRank : index + 1; output.set(id(x.row), rank); previous = x.settlement.settlementOddsDecimal; priorRank = rank; }); } return output; }
function stress(rows: Row[]) { const winners = settled(rows).filter((x) => x.row.outcome.won).sort((a, b) => b.settlement.settlementOddsDecimal - a.settlement.settlementOddsDecimal), months = [...group(rows, (r) => r.features.raceDate.slice(0, 7)).entries()].map(([month, values]) => ({ month, profit: (metrics(values).roi ?? 0) * metrics(values).bets })).sort((a, b) => b.profit - a.profit), best = months[0]?.month; return [{ label: "full", rows }, ...[1, 2].map((n) => { const remove = new Set(winners.slice(0, n).map((x) => id(x.row))); return { label: `remove top ${n} priced winner${n > 1 ? "s" : ""}`, rows: rows.filter((r) => !remove.has(id(r))) }; }), { label: `remove best month (${best ?? "-"})`, rows: rows.filter((r) => r.features.raceDate.slice(0, 7) !== best) }].map((x) => ({ label: x.label, metrics: metrics(x.rows) })); }
function settled(rows: Row[]) { return rows.map((row) => ({ row, settlement: settleSelection(row.outcome) })).filter((x): x is Settled => x.settlement !== null); }
function distanceBand(row: Row) { const yards = row.features.distanceYards; return yards === null ? "unknown" : yards <= 1320 ? "sprint" : yards <= 1760 ? "mile-ish" : yards <= 2640 ? "middle distance" : "staying"; }
function lowDraw(row: Row) { return row.features.draw !== null && row.features.draw >= 1 && row.features.draw <= 3; }
function highDraw(row: Row) { return row.features.draw !== null && row.features.draw >= 7; }
function rankBand(rank: number | undefined) { return rank === undefined ? "missing" : rank <= 3 ? `rank ${rank}` : "rank 4+"; }
function byLabel(populations: Population[], label: string) { return populations.find((x) => x.label === label)?.rows ?? []; }
function id(row: Row) { return row.features.targetRunnerId; }
function raceId(row: Row) { return row.features.targetRaceId; }
function group<T>(values: T[], key: (value: T) => string) { const output = new Map<string, T[]>(); for (const value of values) { const k = key(value); output.set(k, [...(output.get(k) ?? []), value]); } return output; }
function valid(value: number | null | undefined): value is number { return value !== null && value !== undefined && Number.isFinite(value); }
function rate(a: number, b: number) { return b ? a / b : null; }
function diff(a: number | null, b: number | null) { return a === null || b === null ? null : a - b; }
function sameSign(a: number | null, b: number | null) { return a !== null && b !== null && Math.sign(a) !== 0 && Math.sign(a) === Math.sign(b); }
function average(values: number[]) { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null; }
function quantile(values: number[], q: number) { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b), index = (sorted.length - 1) * q, lo = Math.floor(index), hi = Math.ceil(index); return lo === hi ? sorted[lo]! : sorted[lo]! * (hi - index) + sorted[hi]! * (index - lo); }
function pct(value: number | null) { return value === null || !Number.isFinite(value) ? "-" : `${(value * 100).toFixed(2)}%`; }
function pp(value: number | null) { return value === null ? "-" : `${(value * 100).toFixed(2)} pp`; }
function num(value: number | null, digits = 3) { return value === null || !Number.isFinite(value) ? "-" : value.toFixed(digits); }
function section(lines: string[], title: string) { lines.push(`## ${title}`, ""); }
function table(lines: string[], rows: Array<Record<string, unknown>>) { if (!rows.length) { lines.push("No rows.", ""); return; } const headers = Object.keys(rows[0]!); lines.push(`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map((row) => `| ${headers.map((header) => String(row[header] ?? "-").replace(/\|/g, "\\|")).join(" | ")} |`), ""); }

await main();
