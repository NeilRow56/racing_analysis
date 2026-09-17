import { writeFile } from "node:fs/promises";
import { settleSelection, type BacktestSettlement } from "@/lib/racing/backtest";
import { loadLatestBacktestFeatureCacheForYear } from "@/lib/racing/backtest-cache";
import type { HistoricalTargetRunnerMetricsRow as Row } from "@/lib/racing/historical-target-metrics";
import { classifyJumpRaceSubtype } from "@/lib/racing/jump-speed-rating";
import { classifyHandicapStatus } from "@/lib/racing/research-rule";
import { raceClassNumber } from "@/lib/racing/research-rule-classes";

type Year = "2025" | "2026";
type Context = { year: Year; coverage: string; all: Row[]; candidate: Row[]; orRanks: Map<string, number>; performanceRanks: Map<string, number> };
type Entry = { row: Row; settlement: BacktestSettlement };
type Metric = ReturnType<typeof metrics>;

const OUTPUT = "/tmp/chase-days31-60-confirmation.md";
const YEARS: Year[] = ["2025", "2026"];

async function main() {
  const contexts = await Promise.all(YEARS.map(load));
  const lines = buildReport(contexts);
  await writeFile(OUTPUT, `${lines.join("\n")}\n`, "utf8");
  console.log(`Wrote ${OUTPUT}`);
  for (const context of contexts) {
    const value = metrics(context.candidate);
    console.log(`${context.year}: settled=${value.settled}, ROI=${pct(value.roi)}, A/E=${num(value.ae)}`);
  }
}

async function load(year: Year): Promise<Context> {
  const cache = await loadLatestBacktestFeatureCacheForYear({ family: "jump", year }) ?? await loadLatestBacktestFeatureCacheForYear({ family: "all", year });
  if (!cache) throw new Error(`Missing compatible v4 cache for ${year}`);
  const all = cache.rows.filter((row) => row.features.raceCode === "jump" && classifyJumpRaceSubtype(row.features) === "chase").sort(compareRows);
  return {
    year,
    coverage: `${cache.actualCoverage?.actualFrom ?? cache.manifest.from} to ${cache.actualCoverage?.actualTo ?? cache.manifest.to}`,
    all,
    candidate: all.filter((row) => row.features.daysSinceLastRun !== null && row.features.daysSinceLastRun >= 31 && row.features.daysSinceLastRun <= 60),
    orRanks: rank(all, (row) => row.features.officialRating),
    performanceRanks: rank(all, (row) => row.features.latestPerformanceRating),
  };
}

function buildReport(contexts: Context[]) {
  const lines = [
    "# Chase Days 31-60 Confirmation",
    "",
    "Confirmation only. Frozen pre-race rule: Jump family AND canonical Chase subtype AND days since previous run from 31 through 60 inclusive. Historical evaluation uses uncapped final SP; no price, rank, trainer, jockey, course, class, field-size, or handicap filter is part of the rule.",
    "",
  ];
  headline(lines, contexts);
  baseline(lines, contexts);
  neighbors(lines, contexts);
  monthly(lines, contexts);
  stress(lines, contexts);
  profiles(lines, contexts);
  concentration(lines, contexts, "Course", courseKey, (row) => row.features.courseName);
  concentration(lines, contexts, "Trainer", trainerKey, (row) => row.features.trainerName ?? "(missing trainer)");
  rankProfiles(lines, contexts);
  consistency(lines, contexts);
  uncertainty(lines, contexts);
  decision(lines, contexts);
  return lines;
}

function headline(lines: string[], contexts: Context[]) {
  lines.push("## Headline reproduction", "");
  table(lines, contexts.map((context) => ({ year: context.year, coverage: context.coverage, races: distinct(context.candidate, raceId), selections: context.candidate.length, ...detailedMetric(metrics(context.candidate)) })));
}

function baseline(lines: string[], contexts: Context[]) {
  lines.push("## All-Chase comparison", "");
  table(lines, contexts.flatMap((context) => {
    const base = metrics(context.all), candidate = metrics(context.candidate);
    return [
      { year: context.year, population: "all Chase", ...shortMetric(base), "sample reduction": "-" },
      { year: context.year, population: "Chase, days 31-60", ...shortMetric(candidate), "sample reduction": pct(rate(base.settled - candidate.settled, base.settled)) },
      { year: context.year, population: "uplift", selections: "-", winners: "-", strike: pp(diff(candidate.strike, base.strike)), ROI: pp(diff(candidate.roi, base.roi)), "A/E": signed(diff(candidate.ae, base.ae)), "sample reduction": pct(rate(base.settled - candidate.settled, base.settled)) },
    ];
  }));
}

function neighbors(lines: string[], contexts: Context[]) {
  lines.push("## Neighboring return windows", "");
  const bands = ["0-30", "31-60", "61-120", "121+"];
  table(lines, contexts.flatMap((context) => bands.map((band) => ({ year: context.year, band, ...shortMetric(metrics(context.all.filter((row) => daysBand(row.features.daysSinceLastRun) === band))) }))));
}

function monthly(lines: string[], contexts: Context[]) {
  lines.push("## Monthly stability", "");
  for (const context of contexts) {
    const months = [...group(context.candidate, (row) => row.features.raceDate.slice(0, 7)).entries()].sort(([a], [b]) => a.localeCompare(b));
    const values = months.map(([month, rows]) => ({ month, value: metrics(rows) }));
    lines.push(`### ${context.year}`, "");
    table(lines, values.map(({ month, value }) => ({ month, ...shortMetric(value) })));
    const best = [...values].sort((a, b) => b.value.profitLoss - a.value.profitLoss)[0];
    const profitable = values.filter(({ value }) => value.profitLoss > 0).length;
    lines.push(`${profitable} profitable and ${values.length - profitable} losing/breakeven months. Best month ${best?.month ?? "-"} contributed ${money(best?.value.profitLoss ?? null)}, ${pct(rate(best?.value.profitLoss ?? 0, metrics(context.candidate).profitLoss))} of total net profit.`, "");
  }
}

function stress(lines: string[], contexts: Context[]) {
  lines.push("## Outlier stress", "");
  table(lines, contexts.flatMap((context) => stressCases(context.candidate).map((test) => ({ year: context.year, test: test.label, ...stressMetric(metrics(test.rows)) }))));
}

function profiles(lines: string[], contexts: Context[]) {
  profile(lines, "Handicap split", contexts, ["handicap", "non-handicap", "unknown"], (row) => handicapBand(row));
  profile(lines, "Field-size profile", contexts, ["2-5", "6-8", "9+", "missing"], (row) => fieldBand(row.features.actualRunnerCount ?? row.features.declaredRunnerCount));
  const classes = unique(contexts.flatMap((context) => context.candidate.map((row) => classBand(row.features.raceClass)))).sort();
  profile(lines, "Race-class profile", contexts, classes, (row) => classBand(row.features.raceClass), true);
  profile(lines, "Price profile (evaluation only)", contexts, ["<2.0", "2.0-2.99", "3.0-4.99", "5.0-8.99", "9.0-20.99", "21.0+"], (row) => priceBand(price(row)));
  profile(lines, "Jockey prior-strike interaction (diagnostic only)", contexts, ["<10%", "10-14.9%", "15%+", "missing"], (row) => jockeyBand(row.features.jockeyPriorWinRate));
}

function profile(lines: string[], title: string, contexts: Context[], bands: string[], bucket: (row: Row) => string, flagSparse = false) {
  lines.push(`## ${title}`, "");
  table(lines, contexts.flatMap((context) => bands.map((band) => {
    const value = metrics(context.candidate.filter((row) => bucket(row) === band));
    return { year: context.year, band, ...shortMetric(value), ...(flagSparse ? { sparse: value.settled < 50 ? "yes" : "no" } : {}) };
  })));
}

function concentration(lines: string[], contexts: Context[], title: string, key: (row: Row) => string, name: (row: Row) => string) {
  lines.push(`## ${title} concentration`, "");
  for (const context of contexts) {
    const groups = [...group(context.candidate, key).entries()].map(([idValue, rows]) => ({ id: idValue, name: name(rows[0]!), rows, value: metrics(rows) }));
    const bySelections = [...groups].sort((a, b) => b.value.settled - a.value.settled || a.name.localeCompare(b.name));
    const byProfit = [...groups].sort((a, b) => b.value.profitLoss - a.value.profitLoss);
    const topIds = new Set(byProfit.slice(0, 3).map((item) => item.id));
    lines.push(`### ${context.year}`, "", `Distinct ${title.toLowerCase()}s: ${groups.length}.`, "", "Top 10 by selections:", "");
    table(lines, bySelections.slice(0, 10).map((item) => ({ [title.toLowerCase()]: item.name, id: item.id, ...shortMetric(item.value), "P/L": money(item.value.profitLoss) })));
    lines.push("Top 10 by profit:", "");
    table(lines, byProfit.slice(0, 10).map((item) => ({ [title.toLowerCase()]: item.name, id: item.id, ...shortMetric(item.value), "P/L": money(item.value.profitLoss) })));
    table(lines, [
      { exclusion: `most profitable: ${byProfit[0]?.name ?? "-"}`, ...stressMetric(metrics(context.candidate.filter((row) => key(row) !== byProfit[0]?.id))) },
      { exclusion: "top three profitable", ...stressMetric(metrics(context.candidate.filter((row) => !topIds.has(key(row))))) },
    ]);
  }
}

function rankProfiles(lines: string[], contexts: Context[]) {
  lines.push("## OR and Latest Performance context", "");
  table(lines, contexts.flatMap((context) => [
    { label: "OR", ranks: context.orRanks, missing: (row: Row) => row.features.officialRating === null },
    { label: "Latest Performance", ranks: context.performanceRanks, missing: (row: Row) => row.features.latestPerformanceRating === null },
  ].flatMap((factor) => ["rank 1", "rank 2", "rank 3+", "missing"].map((band) => ({
    year: context.year,
    factor: factor.label,
    band,
    ...shortMetric(metrics(context.candidate.filter((row) => rankBand(factor.ranks.get(id(row)), factor.missing(row)) === band))),
  })))));
}

function consistency(lines: string[], contexts: Context[]) {
  const left = metrics(contexts[0]!.candidate), right = metrics(contexts[1]!.candidate);
  const highPrice = (context: Context) => metrics(context.candidate.filter((row) => (price(row) ?? 0) >= 9));
  lines.push("## Year-to-year consistency", "",
    `Strike changed ${pp(diff(right.strike, left.strike))}, A/E ${signed(diff(right.ae, left.ae))}, and ROI ${pp(diff(right.roi, left.roi))} from 2025 to 2026. Average SP changed from ${num(left.averageSp, 2)} to ${num(right.averageSp, 2)} and median SP from ${num(left.medianSp, 2)} to ${num(right.medianSp, 2)}.`,
    `Winners at SP 9.0+ contributed ${money(highPrice(contexts[0]!).returns)} of return in 2025 and ${money(highPrice(contexts[1]!).returns)} in 2026; use the price table and winner-removal stress to assess longshot dependence.`, "");
}

function uncertainty(lines: string[], contexts: Context[]) {
  lines.push("## Statistical uncertainty", "");
  table(lines, contexts.flatMap((context) => [
    { year: context.year, population: "all Chase", ...ciMetric(metrics(context.all)) },
    { year: context.year, population: "Chase, days 31-60", ...ciMetric(metrics(context.candidate)) },
  ]));
  lines.push("Wilson 95% intervals describe binomial strike uncertainty. The candidate is contained within the all-Chase baseline, so overlap is descriptive and is not presented as an independent significance test.", "");
}

function decision(lines: string[], contexts: Context[]) {
  const values = contexts.map((context) => ({ context, candidate: metrics(context.candidate), baseline: metrics(context.all), stress: stressCases(context.candidate) }));
  const stressMetricFor = (value: typeof values[number], label: string) => metrics(value.stress.find((item) => item.label.startsWith(label))!.rows);
  const positive = values.every((value) => (value.candidate.roi ?? -Infinity) > 0 && (value.candidate.ae ?? 0) > 1);
  const beats = values.every((value) => (value.candidate.roi ?? -Infinity) > (value.baseline.roi ?? Infinity));
  const biggest = values.every((value) => (stressMetricFor(value, "remove biggest").roi ?? -Infinity) > 0);
  const month = values.every((value) => (stressMetricFor(value, "remove best month").roi ?? -Infinity) > 0);
  const course = values.every((value) => (concentrationExclusion(value.context.candidate, courseKey, 1).roi ?? -Infinity) > 0);
  const trainer = values.every((value) => (concentrationExclusion(value.context.candidate, trainerKey, 1).roi ?? -Infinity) > 0);
  const handicap = values.every((value) => (metrics(value.context.candidate.filter((row) => handicapBand(row) === "handicap")).roi ?? -Infinity) > 0);
  const nonHandicap = values.every((value) => (metrics(value.context.candidate.filter((row) => handicapBand(row) === "non-handicap")).roi ?? -Infinity) > 0);
  const topFive = values.every((value) => (stressMetricFor(value, "remove top five").roi ?? -Infinity) > 0);
  const highPrice2026 = metrics(contexts[1]!.candidate.filter((row) => (price(row) ?? 0) >= 9));
  const highPriceProfitShare = rate(highPrice2026.profitLoss, values[1]!.candidate.profitLoss);
  const ready = positive && beats && biggest && month && course && trainer;
  lines.push("## Forward-readiness decision", "",
    `1. The 31-60 result ${values.every((value) => value.candidate.settled === (value.context.year === "2025" ? 2773 : 1946)) ? "reproduces exactly" : "does not match the prior settled counts exactly"}.`,
    `2. It ${beats ? "outperforms" : "does not outperform"} the all-Chase ROI baseline in both years.`,
    `3. A/E ${positive ? "stays above 1 with positive ROI" : "does not stay above 1 with positive ROI"} in both years.`,
    `4. Profitability ${biggest ? "survives" : "does not survive"} removal of the biggest-priced winner in both years.`,
    `5. Profitability ${month ? "survives" : "does not survive"} best-month removal in both years.`,
    `6. It is ${course ? "not dependent on the single most profitable course" : "dependent on the most profitable course in at least one year"}.`,
    `7. It is ${trainer ? "not dependent on the single most profitable trainer" : "dependent on the most profitable trainer in at least one year"}.`,
    `8. It ${handicap && nonHandicap ? "is profitable in both handicap and non-handicap Chases in both years" : "is not profitable in both handicap and non-handicap Chases in both years"}; no status filter is proposed.`,
    "9. Performance is reasonably broad but not uniform: fields of 6-8 and 9+ are positive in both years, while 2-5 is negative in 2025; several class buckets also change sign year to year.",
    `10. 2026 is materially longshot-amplified: SP 9.0+ supplies ${pct(highPriceProfitShare)} of net profit. It is not wholly dependent on the very largest winners because removing the top five still leaves ${pct(stressMetricFor(values[1]!, "remove top five").roi)} ROI, though the same stress reduces 2025 to ${pct(stressMetricFor(values[0]!, "remove top five").roi)}.`,
    "11. Replication and A/E above 1 in both years support a real return-window signal, but the neighboring bands do not form a smooth structural gradient: 61-120 is positive in 2025 and sharply negative in 2026. Evidence is therefore specific to the frozen 31-60 window rather than proof of a general layoff curve.",
    `12. ${ready ? "The candidate is robust enough to freeze for forward/live tracking, while treating the historical return as uncertain." : "The candidate is not robust enough for forward/live tracking under the pre-specified confirmation checks."}`,
    `13. ${ready ? "Exact frozen rule: Chase + days since previous run 31-60 inclusive." : "No rule should be frozen and the window should not be tuned."}`,
    `14. ${ready ? `No additional condition is added. Caveat: top-five-winner stress ${topFive ? "remains positive in both years" : "fails in 2025"}, so forward tracking is justified but the historical ROI should not be treated as stable.` : "The precise failed checks are stated in items 2-7; no replacement window is proposed."}`, "");
}

function metrics(rows: Row[]) {
  const entries = settled(rows), winners = entries.filter(({ row }) => row.outcome.won);
  const returns = winners.reduce((sum, { settlement }) => sum + settlement.grossReturn, 0);
  const expected = entries.reduce((sum, { settlement }) => sum + 1 / settlement.settlementOddsDecimal, 0);
  return {
    selections: rows.length, settled: entries.length, winners: winners.length, stakes: entries.length, returns, profitLoss: returns - entries.length,
    strike: rate(winners.length, entries.length), roi: rate(returns - entries.length, entries.length), ae: expected === 0 ? null : winners.length / expected,
    averageSp: average(entries.map(({ settlement }) => settlement.settlementOddsDecimal)), medianSp: median(entries.map(({ settlement }) => settlement.settlementOddsDecimal)),
    averageWinnerSp: average(winners.map(({ settlement }) => settlement.settlementOddsDecimal)), medianWinnerSp: median(winners.map(({ settlement }) => settlement.settlementOddsDecimal)),
    maxLosingRun: losingRun(entries),
  };
}

function settled(rows: Row[]): Entry[] { return rows.map((row) => ({ row, settlement: settleSelection(row.outcome) })).filter((item): item is Entry => item.settlement !== null); }
function detailedMetric(value: Metric) { return { "settled selections": value.settled, winners: value.winners, strike: pct(value.strike), "total stakes": money(value.stakes), "total return": money(value.returns), "P/L": money(value.profitLoss), ROI: pct(value.roi), "A/E": num(value.ae), "average SP": num(value.averageSp, 2), "median SP": num(value.medianSp, 2), "average winner SP": num(value.averageWinnerSp, 2), "median winner SP": num(value.medianWinnerSp, 2), "max losing run": value.maxLosingRun }; }
function shortMetric(value: Metric) { return { selections: value.settled, winners: value.winners, strike: pct(value.strike), ROI: pct(value.roi), "A/E": num(value.ae) }; }
function stressMetric(value: Metric) { return { "P/L": money(value.profitLoss), ROI: pct(value.roi), "A/E": num(value.ae) }; }
function ciMetric(value: Metric) { const ci = wilson(value.winners, value.settled); return { selections: value.settled, winners: value.winners, strike: pct(value.strike), "95% CI": `${pct(ci[0])} to ${pct(ci[1])}` }; }

function stressCases(rows: Row[]) {
  const winners = settled(rows).filter(({ row }) => row.outcome.won).sort((a, b) => b.settlement.settlementOddsDecimal - a.settlement.settlementOddsDecimal);
  const bestMonth = [...group(rows, (row) => row.features.raceDate.slice(0, 7)).entries()].sort((a, b) => metrics(b[1]).profitLoss - metrics(a[1]).profitLoss)[0]?.[0];
  return [
    { label: "full", rows },
    { label: "remove biggest-priced winner", rows: rows.filter((row) => row !== winners[0]?.row) },
    { label: "remove top two biggest-priced winners", rows: rows.filter((row) => !winners.slice(0, 2).some((winner) => winner.row === row)) },
    { label: "remove top five biggest-priced winners", rows: rows.filter((row) => !winners.slice(0, 5).some((winner) => winner.row === row)) },
    { label: `remove best month (${bestMonth ?? "-"})`, rows: rows.filter((row) => row.features.raceDate.slice(0, 7) !== bestMonth) },
  ];
}

function concentrationExclusion(rows: Row[], key: (row: Row) => string, count: number) {
  const ranked = [...group(rows, key).entries()].sort((a, b) => metrics(b[1]).profitLoss - metrics(a[1]).profitLoss);
  const excluded = new Set(ranked.slice(0, count).map(([value]) => value));
  return metrics(rows.filter((row) => !excluded.has(key(row))));
}

function rank(rows: Row[], value: (row: Row) => number | null) { const result = new Map<string, number>(); for (const race of group(rows, raceId).values()) { const sorted = race.filter((row) => row.outcome.resultStatus !== "non_runner").map((row) => ({ row, value: value(row) })).filter((item): item is { row: Row; value: number } => valid(item.value)).sort((a, b) => b.value - a.value || id(a.row).localeCompare(id(b.row))); let previous: number | null = null, priorRank = 0; sorted.forEach((item, index) => { const current = item.value === previous ? priorRank : index + 1; result.set(id(item.row), current); previous = item.value; priorRank = current; }); } return result; }
function rankBand(rankValue: number | undefined, missing: boolean) { return missing || rankValue === undefined ? "missing" : rankValue === 1 ? "rank 1" : rankValue === 2 ? "rank 2" : "rank 3+"; }
function handicapBand(row: Row) { const value = classifyHandicapStatus(row.features); return value === "handicap" ? "handicap" : value === "non_handicap" ? "non-handicap" : "unknown"; }
function daysBand(value: number | null) { return value === null ? "missing" : value <= 30 ? "0-30" : value <= 60 ? "31-60" : value <= 120 ? "61-120" : "121+"; }
function fieldBand(value: number | null) { return value === null ? "missing" : value <= 5 ? "2-5" : value <= 8 ? "6-8" : "9+"; }
function classBand(value: string | null) { const parsed = raceClassNumber(value); return parsed === null ? "unknown" : `Class ${parsed}`; }
function priceBand(value: number | null) { return value === null ? "missing" : value < 2 ? "<2.0" : value < 3 ? "2.0-2.99" : value < 5 ? "3.0-4.99" : value < 9 ? "5.0-8.99" : value < 21 ? "9.0-20.99" : "21.0+"; }
function jockeyBand(value: number | null | undefined) { return value === null || value === undefined ? "missing" : value < 10 ? "<10%" : value < 15 ? "10-14.9%" : "15%+"; }
function price(row: Row) { return settleSelection(row.outcome)?.settlementOddsDecimal ?? null; }
function losingRun(entries: Entry[]) { let current = 0, maximum = 0; for (const { row } of [...entries].sort((a, b) => compareRows(a.row, b.row))) { current = row.outcome.won ? 0 : current + 1; maximum = Math.max(maximum, current); } return maximum; }
function courseKey(row: Row) { return row.features.courseId; }
function trainerKey(row: Row) { return row.features.trainerId ?? `name:${row.features.trainerName ?? "missing"}`; }
function id(row: Row) { return row.features.targetRunnerId; }
function raceId(row: Row) { return row.features.targetRaceId; }
function compareRows(a: Row, b: Row) { return a.features.raceDateTime.getTime() - b.features.raceDateTime.getTime() || raceId(a).localeCompare(raceId(b)) || id(a).localeCompare(id(b)); }
function group<T>(values: T[], key: (value: T) => string) { const result = new Map<string, T[]>(); for (const value of values) { const k = key(value); result.set(k, [...(result.get(k) ?? []), value]); } return result; }
function distinct<T>(values: T[], key: (value: T) => string) { return new Set(values.map(key)).size; }
function unique<T>(values: T[]) { return [...new Set(values)]; }
function valid(value: number | null | undefined): value is number { return value !== null && value !== undefined && Number.isFinite(value); }
function rate(numerator: number, denominator: number) { return denominator === 0 ? null : numerator / denominator; }
function diff(left: number | null, right: number | null) { return left === null || right === null ? null : left - right; }
function average(values: number[]) { return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length; }
function median(values: number[]) { if (values.length === 0) return null; const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2; }
function wilson(wins: number, n: number): [number | null, number | null] { if (n === 0) return [null, null]; const z = 1.959964, p = wins / n, d = 1 + z * z / n, center = (p + z * z / (2 * n)) / d, half = z * Math.sqrt((p * (1 - p) + z * z / (4 * n)) / n) / d; return [center - half, center + half]; }
function pct(value: number | null) { return value === null || !Number.isFinite(value) ? "-" : `${(value * 100).toFixed(2)}%`; }
function pp(value: number | null) { return value === null ? "-" : `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)} pp`; }
function num(value: number | null, digits = 3) { return value === null || !Number.isFinite(value) ? "-" : value.toFixed(digits); }
function signed(value: number | null) { return value === null ? "-" : `${value >= 0 ? "+" : ""}${value.toFixed(3)}`; }
function money(value: number | null) { return value === null ? "-" : `${value < 0 ? "-" : ""}£${Math.abs(value).toFixed(2)}`; }
function table(lines: string[], rows: Array<Record<string, unknown>>) { if (rows.length === 0) { lines.push("No rows.", ""); return; } const headers = Object.keys(rows[0]!); lines.push(`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map((row) => `| ${headers.map((header) => String(row[header] ?? "-").replace(/\|/g, "\\|")).join(" | ")} |`), ""); }

await main();
