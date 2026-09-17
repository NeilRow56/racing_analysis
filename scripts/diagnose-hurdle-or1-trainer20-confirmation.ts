import { writeFile } from "node:fs/promises";
import { loadLatestBacktestFeatureCacheForYear } from "@/lib/racing/backtest-cache";
import type { HistoricalTargetRunnerMetricsRow as Row } from "@/lib/racing/historical-target-metrics";
import { raceClassNumber } from "@/lib/racing/research-rule-classes";

type Year = "2025" | "2026";
type Context = { year: Year; coverage: string; rows: Row[]; orRank1: Row[]; candidate: Row[]; gaps: Map<string, number> };
type Metric = ReturnType<typeof metrics>;

const OUTPUT = "/tmp/hurdle-or1-trainer20-confirmation.md";
const YEARS: Year[] = ["2025", "2026"];
const OR_GAP_CUTS = [0, 2, 5] as const;

async function main() {
  const contexts = await Promise.all(YEARS.map(load));
  const lines = buildReport(contexts);
  await writeFile(OUTPUT, `${lines.join("\n")}\n`, "utf8");
  console.log(`Wrote ${OUTPUT}`);
  for (const context of contexts) {
    const value = metrics(context.candidate);
    console.log(`${context.year}: n=${value.settled}, winners=${value.winners}, strike=${pct(value.strike)}, ROI=${pct(value.roi)}, A/E=${num(value.ae)}`);
  }
}

async function load(year: Year): Promise<Context> {
  const cache = await loadLatestBacktestFeatureCacheForYear({ family: "jump", year }) ??
    await loadLatestBacktestFeatureCacheForYear({ family: "all", year });
  if (!cache) throw new Error(`Missing compatible v4 Jump cache for ${year}`);
  const rows = cache.rows
    .filter((row) => row.features.raceCode === "jump" && subtype(row) === "hurdle" && settled(row))
    .sort(compareRows);
  const ranks = rank(rows, (row) => row.features.officialRating);
  const orRank1 = rows.filter((row) => ranks.get(id(row)) === 1);
  const candidate = orRank1.filter((row) => (row.features.trainerPriorWinRate ?? -Infinity) >= 20);
  return {
    year,
    coverage: `${cache.actualCoverage?.actualFrom ?? cache.manifest.from} to ${cache.actualCoverage?.actualTo ?? cache.manifest.to}`,
    rows,
    orRank1,
    candidate,
    gaps: raceGaps(rows, (row) => row.features.officialRating),
  };
}

function buildReport(contexts: Context[]): string[] {
  const lines = [
    "# Hurdle OR Rank-1 + Trainer 20% Confirmation",
    "",
    "Confirmation only. Frozen rule: Hurdles AND Official Rating competition rank exactly 1 AND as-of trainer prior strike rate >=20%. Historical betting uses uncapped final SP; SP is not part of the rule.",
    "",
  ];
  headline(lines, contexts);
  matchedBaseline(lines, contexts);
  trainerSample(lines, contexts);
  trainerBands(lines, contexts);
  monthly(lines, contexts);
  stress(lines, contexts);
  profiles(lines, contexts);
  concentration(lines, contexts);
  turnover(lines, contexts);
  paired(lines, contexts);
  uncertainty(lines, contexts);
  decision(lines, contexts);
  return lines;
}

function headline(lines: string[], contexts: Context[]) {
  lines.push("## Frozen candidate baseline", "");
  table(lines, contexts.map((context) => ({
    year: context.year,
    coverage: context.coverage,
    "eligible races": distinct(context.candidate, raceId),
    selections: context.candidate.length,
    ...metricRow(metrics(context.candidate), true),
  })));
  lines.push("All cache rows used here are settled runners, so selections and settled selections are equal. Place means cached finishing position 1-3.", "");
}

function matchedBaseline(lines: string[], contexts: Context[]) {
  lines.push("## Matched OR-rank-1 baseline", "");
  table(lines, contexts.flatMap((context) => {
    const baseline = metrics(context.orRank1), candidate = metrics(context.candidate);
    return [
      { year: context.year, population: "all OR rank 1", ...shortMetricRow(baseline), "sample reduction": "-" },
      { year: context.year, population: "trainer >=20%", ...shortMetricRow(candidate), "sample reduction": pct(rate(baseline.settled - candidate.settled, baseline.settled)) },
      { year: context.year, population: "increment", selections: candidate.settled - baseline.settled, winners: "-", strike: pp(diff(candidate.strike, baseline.strike)), ROI: pp(diff(candidate.roi, baseline.roi)), "A/E": signed(diff(candidate.ae, baseline.ae)), "sample reduction": pct(rate(baseline.settled - candidate.settled, baseline.settled)) },
    ];
  }));
}

function trainerSample(lines: string[], contexts: Context[]) {
  lines.push("## Trainer prior-run sample quality", "");
  const bands = ["0-9", "10-19", "20-49", "50+"];
  table(lines, contexts.flatMap((context) => bands.map((band) => ({
    year: context.year,
    "prior runs": band,
    ...shortMetricRow(metrics(context.candidate.filter((row) => trainerRunBand(row.features.trainerPriorRuns) === band))),
  }))));
}

function trainerBands(lines: string[], contexts: Context[]) {
  lines.push("## OR rank 1 by trainer strike band", "");
  const bands = ["<10%", "10-14.9%", "15-19.9%", "20-24.9%", "25%+"];
  table(lines, contexts.flatMap((context) => bands.map((band) => ({
    year: context.year,
    "trainer band": band,
    ...shortMetricRow(metrics(context.orRank1.filter((row) => trainerStrikeBand(row.features.trainerPriorWinRate) === band))),
  }))));
}

function monthly(lines: string[], contexts: Context[]) {
  lines.push("## Monthly stability", "");
  for (const context of contexts) {
    const groups = [...group(context.candidate, (row) => row.features.raceDate.slice(0, 7)).entries()].sort(([a], [b]) => a.localeCompare(b));
    const monthlyRows = groups.map(([month, rows]) => ({ month, rows, metric: metrics(rows) }));
    lines.push(`### ${context.year}`, "");
    table(lines, monthlyRows.map((entry) => ({ month: entry.month, ...shortMetricRow(entry.metric) })));
    const profitable = monthlyRows.filter((entry) => (entry.metric.profitLoss ?? 0) > 0);
    const best = [...monthlyRows].sort((a, b) => (b.metric.profitLoss ?? -Infinity) - (a.metric.profitLoss ?? -Infinity))[0];
    lines.push(`${profitable.length} profitable and ${monthlyRows.length - profitable.length} losing/breakeven months. Best month: ${best?.month ?? "-"}, P/L ${money(best?.metric.profitLoss ?? null)}; share of positive-month profit ${pct(rate(best?.metric.profitLoss ?? 0, profitable.reduce((sum, entry) => sum + Math.max(0, entry.metric.profitLoss ?? 0), 0)))}.`, "");
  }
}

function stress(lines: string[], contexts: Context[]) {
  lines.push("## Outlier stress", "");
  table(lines, contexts.flatMap((context) => {
    const winners = context.candidate.filter((row) => row.outcome.won).sort((a, b) => sp(b)! - sp(a)!);
    const months = [...group(context.candidate, (row) => row.features.raceDate.slice(0, 7)).entries()];
    const bestMonth = months.sort((a, b) => (metrics(b[1]).profitLoss ?? -Infinity) - (metrics(a[1]).profitLoss ?? -Infinity))[0]?.[0];
    const cases = [
      { label: "full", rows: context.candidate },
      { label: "remove biggest-priced winner", rows: context.candidate.filter((row) => row !== winners[0]) },
      { label: "remove top two winners", rows: context.candidate.filter((row) => row !== winners[0] && row !== winners[1]) },
      { label: `remove best month (${bestMonth ?? "-"})`, rows: context.candidate.filter((row) => row.features.raceDate.slice(0, 7) !== bestMonth) },
    ];
    return cases.map((test) => ({ year: context.year, test: test.label, ...stressMetricRow(metrics(test.rows)) }));
  }));
}

function profiles(lines: string[], contexts: Context[]) {
  profile(lines, "Price bands (evaluation only)", contexts, ["<2.0", "2.0-2.99", "3.0-4.99", "5.0-8.99", "9.0-20.99", "21.0+"], (row) => priceBand(sp(row)));
  profile(lines, "Field size", contexts, ["2-5", "6-8", "9+"], (row) => fieldBand(row.features.actualRunnerCount ?? row.features.declaredRunnerCount));
  profile(lines, "OR lead", contexts, ["very small", "small", "medium", "large", "missing"], (row, context) => gapBand(context.gaps.get(raceId(row)) ?? null));
  profile(lines, "Handicap status", contexts, ["handicap", "non-handicap"], (row) => isHandicap(row) ? "handicap" : "non-handicap");
  profile(lines, "Novice / maiden / other", contexts, ["novice", "maiden", "other"], noviceBand);
  const classes = [...new Set(contexts.flatMap((context) => context.candidate.map((row) => classBand(row.features.raceClass))))].sort();
  profile(lines, "Race class", contexts, classes, (row) => classBand(row.features.raceClass), true);
}

function profile(lines: string[], title: string, contexts: Context[], bands: string[], bucket: (row: Row, context: Context) => string, sparse = false) {
  lines.push(`## ${title}`, "");
  table(lines, contexts.flatMap((context) => bands.map((band) => {
    const value = metrics(context.candidate.filter((row) => bucket(row, context) === band));
    return { year: context.year, band, ...shortMetricRow(value), ...(sparse ? { sparse: value.settled < 30 ? "yes" : "no" } : {}) };
  })));
}

function concentration(lines: string[], contexts: Context[]) {
  lines.push("## Trainer concentration", "");
  for (const context of contexts) {
    const trainers = trainerGroups(context.candidate);
    const byCount = [...trainers].sort((a, b) => b.rows.length - a.rows.length || a.name.localeCompare(b.name));
    const byProfit = [...trainers].sort((a, b) => (metrics(b.rows).profitLoss ?? -Infinity) - (metrics(a.rows).profitLoss ?? -Infinity));
    const positiveProfit = byProfit.reduce((sum, trainer) => sum + Math.max(0, metrics(trainer.rows).profitLoss ?? 0), 0);
    const mostProfitable = byProfit[0];
    lines.push(`### ${context.year}`, "",
      `Distinct trainers: ${trainers.length}. Top five by volume provide ${pct(rate(byCount.slice(0, 5).reduce((sum, trainer) => sum + trainer.rows.length, 0), context.candidate.length))} of selections. Top five profitable trainers provide ${pct(rate(byProfit.slice(0, 5).reduce((sum, trainer) => sum + Math.max(0, metrics(trainer.rows).profitLoss ?? 0), 0), positiveProfit))} of all positive trainer-level profit.`, "");
    table(lines, byCount.slice(0, 10).map((trainer) => ({ trainer: trainer.name, trainerId: trainer.key, ...shortMetricRow(metrics(trainer.rows)) })));
    lines.push("Top 10 by P/L:", "");
    table(lines, byProfit.slice(0, 10).map((trainer) => ({ trainer: trainer.name, trainerId: trainer.key, ...shortMetricRow(metrics(trainer.rows)), "P/L": money(metrics(trainer.rows).profitLoss) })));
    lines.push(`Excluding most profitable trainer (${mostProfitable?.name ?? "-"}):`, "");
    table(lines, [{ year: context.year, ...metricRow(metrics(context.candidate.filter((row) => trainerKey(row) !== mostProfitable?.key)), true) }]);
  }
}

function turnover(lines: string[], contexts: Context[]) {
  lines.push("## Year-to-year trainer turnover", "");
  const left = contexts[0]!, right = contexts[1]!;
  const ids25 = new Set(left.candidate.map(trainerKey)), ids26 = new Set(right.candidate.map(trainerKey));
  const repeat = new Set([...ids25].filter((key) => ids26.has(key)));
  const unique25 = new Set([...ids25].filter((key) => !ids26.has(key)));
  const unique26 = new Set([...ids26].filter((key) => !ids25.has(key)));
  table(lines, [
    { measure: "distinct trainers", "year 2025": ids25.size, "year 2026": ids26.size },
    { measure: "appearing both years", "year 2025": repeat.size, "year 2026": repeat.size },
    { measure: "unique to year", "year 2025": unique25.size, "year 2026": unique26.size },
  ]);
  table(lines, contexts.flatMap((context) => [
    { year: context.year, population: "repeat trainers", ...shortMetricRow(metrics(context.candidate.filter((row) => repeat.has(trainerKey(row))))) },
    { year: context.year, population: "year-unique trainers", ...shortMetricRow(metrics(context.candidate.filter((row) => (context.year === "2025" ? unique25 : unique26).has(trainerKey(row))))) },
  ]));
}

function paired(lines: string[], contexts: Context[]) {
  lines.push("## Paired OR-rank-1 trainer comparison", "");
  table(lines, contexts.flatMap((context) => [
    { year: context.year, population: "trainer >=20%", ...shortMetricRow(metrics(context.candidate)) },
    { year: context.year, population: "trainer <20% or missing", ...shortMetricRow(metrics(context.orRank1.filter((row) => !context.candidate.includes(row)))) },
  ]));
}

function uncertainty(lines: string[], contexts: Context[]) {
  lines.push("## Statistical uncertainty", "");
  table(lines, contexts.flatMap((context) => [
    { year: context.year, population: "candidate", ...ciRow(context.candidate) },
    { year: context.year, population: "all OR rank 1", ...ciRow(context.orRank1) },
  ]));
  lines.push("Approximate Wilson 95% intervals describe strike uncertainty. The two-proportion test compares the candidate with the disjoint OR-rank-1 group below 20%/missing, avoiding a candidate-versus-containing-baseline test.", "");
  table(lines, contexts.map((context) => {
    const other = context.orRank1.filter((row) => !context.candidate.includes(row));
    const test = twoProportion(context.candidate, other);
    return { year: context.year, "candidate strike": pct(metrics(context.candidate).strike), "other OR1 strike": pct(metrics(other).strike), "uplift": pp(diff(metrics(context.candidate).strike, metrics(other).strike)), z: num(test.z), "two-sided p": pValue(test.z) };
  }));
}

function decision(lines: string[], contexts: Context[]) {
  const values = contexts.map((context) => ({ context, full: metrics(context.candidate), baseline: metrics(context.orRank1), stresses: stressed(context) }));
  const aePreserved = values.every((value) => (value.full.ae ?? 0) >= 1);
  const robustWinner = values.every((value) => (value.stresses.removeOne.roi ?? -1) > 0 && (value.stresses.removeTwo.roi ?? -1) > 0);
  const robustMonth = values.every((value) => (value.stresses.removeMonth.roi ?? -1) > 0);
  const smallShare = values.map(({ context }) => rate(context.candidate.filter((row) => row.features.trainerPriorRuns < 20).length, context.candidate.length));
  const repeat = new Set(contexts[0]!.candidate.map(trainerKey).filter((key) => new Set(contexts[1]!.candidate.map(trainerKey)).has(key)));
  const ready = values.every((value) => (value.full.roi ?? -1) > 0 && (value.full.ae ?? 0) >= 1) && robustWinner && robustMonth;
  lines.push("## Forward-rule readiness", "",
    `1. The original result is ${values.every((value) => (value.full.roi ?? -1) > 0) ? "reproduced with positive ROI in both years" : "not reproduced in both years"}.`,
    `2. Trainer >=20% adds ${pp(diff(values[0]!.full.strike, values[0]!.baseline.strike))} / ${pp(diff(values[1]!.full.strike, values[1]!.baseline.strike))} strike and ${signed(diff(values[0]!.full.ae, values[0]!.baseline.ae))} / ${signed(diff(values[1]!.full.ae, values[1]!.baseline.ae))} A/E in 2025/2026: a material strike improvement in both years.`,
    `3. Removing the biggest winner ${robustWinner ? "leaves positive ROI in both years" : "does not leave the result robust in both years"}.`,
    `4. Removing the top two winners ${values.every((value) => (value.stresses.removeTwo.roi ?? -1) > 0) ? "leaves positive ROI in both years" : "breaks positive ROI in at least one year"}.`,
    `5. Removing the best month ${robustMonth ? "leaves positive ROI in both years" : "breaks positive ROI in at least one year"}.`,
    `6. A/E >=1 is ${aePreserved ? "preserved in both full-year samples" : "not preserved in both full-year samples"}.`,
    `7. Prior samples below 20 runs account for ${pct(smallShare[0]!)} / ${pct(smallShare[1]!)} of selections; the sample-size table shows whether their returns dominate.`,
    `8. Trainer concentration and the single-yard exclusion are shown above; no concentration claim is based solely on overall profit.`,
    `9. ${repeat.size} trainers occur in both years; repeat-versus-new results show whether the effect survives turnover.`,
    "10. The fixed price profile and winner-removal stress show whether profitability depends on longshots.",
    `11. ${ready ? "The rule is simple and robust enough to freeze for forward/live research tracking, without treating the historical return as guaranteed." : "The rule is not robust enough to freeze for forward/live tracking under the pre-specified stress standard."}`,
    `12. ${ready ? "Exact frozen rule: Hurdles + OR rank 1 + trainer prior strike rate >=20%." : "No rule should be frozen from this confirmation."}`,
    `13. ${ready ? "No further condition is added." : `Precise weakness: ${!aePreserved ? "A/E does not remain at least 1 in both years" : !robustWinner ? "profit does not survive winner-removal stress in both years" : "profit does not survive best-month removal in both years"}; no tuned replacement is proposed.`}`,
    "",
  );
}

function stressed(context: Context) {
  const winners = context.candidate.filter((row) => row.outcome.won).sort((a, b) => sp(b)! - sp(a)!);
  const bestMonth = [...group(context.candidate, (row) => row.features.raceDate.slice(0, 7)).entries()].sort((a, b) => (metrics(b[1]).profitLoss ?? -Infinity) - (metrics(a[1]).profitLoss ?? -Infinity))[0]?.[0];
  return {
    removeOne: metrics(context.candidate.filter((row) => row !== winners[0])),
    removeTwo: metrics(context.candidate.filter((row) => row !== winners[0] && row !== winners[1])),
    removeMonth: metrics(context.candidate.filter((row) => row.features.raceDate.slice(0, 7) !== bestMonth)),
  };
}

function metrics(rows: Row[]) {
  const priced = rows.filter((row) => sp(row) !== null), winners = priced.filter((row) => row.outcome.won);
  const returns = winners.reduce((sum, row) => sum + sp(row)!, 0), expected = priced.reduce((sum, row) => sum + 1 / sp(row)!, 0);
  return {
    selections: rows.length,
    settled: priced.length,
    winners: winners.length,
    places: rows.filter((row) => row.outcome.placed).length,
    strike: rate(winners.length, priced.length),
    placeStrike: rate(rows.filter((row) => row.outcome.placed).length, rows.length),
    stakes: priced.length,
    returns,
    profitLoss: returns - priced.length,
    roi: rate(returns - priced.length, priced.length),
    ae: expected === 0 ? null : winners.length / expected,
    averageSp: average(priced.map((row) => sp(row)!)),
    medianSp: median(priced.map((row) => sp(row)!)),
    averageWinnerSp: average(winners.map((row) => sp(row)!)),
    medianWinnerSp: median(winners.map((row) => sp(row)!)),
    maxLosingRun: maxLosingRun(priced),
  };
}

function metricRow(value: Metric, detailed = false): Record<string, unknown> {
  return {
    "settled selections": value.settled, winners: value.winners, strike: pct(value.strike), places: value.places,
    "place strike": pct(value.placeStrike), stakes: money(value.stakes), returns: money(value.returns), "P/L": money(value.profitLoss), ROI: pct(value.roi), "A/E": num(value.ae),
    ...(detailed ? { "average SP": num(value.averageSp, 2), "median SP": num(value.medianSp, 2), "average winner SP": num(value.averageWinnerSp, 2), "median winner SP": num(value.medianWinnerSp, 2), "max losing run": value.maxLosingRun } : {}),
  };
}
function shortMetricRow(value: Metric) { return { selections: value.settled, winners: value.winners, strike: pct(value.strike), ROI: pct(value.roi), "A/E": num(value.ae) }; }
function stressMetricRow(value: Metric) { return { "P/L": money(value.profitLoss), ROI: pct(value.roi), "A/E": num(value.ae), strike: pct(value.strike) }; }

function trainerGroups(rows: Row[]) {
  return [...group(rows, trainerKey).entries()].map(([key, values]) => ({ key, name: values[0]?.features.trainerName ?? "(missing trainer)", rows: values }));
}
function trainerKey(row: Row) { return row.features.trainerId ?? `name:${row.features.trainerName ?? "missing"}`; }
function ciRow(rows: Row[]) { const wins = rows.filter((row) => row.outcome.won).length, ci = wilson(wins, rows.length); return { selections: rows.length, winners: wins, strike: pct(rate(wins, rows.length)), "95% CI": `${pct(ci[0])} to ${pct(ci[1])}` }; }
function wilson(wins: number, n: number): [number | null, number | null] { if (n === 0) return [null, null]; const z = 1.959964, p = wins / n, d = 1 + z * z / n, center = (p + z * z / (2 * n)) / d, half = z * Math.sqrt((p * (1 - p) + z * z / (4 * n)) / n) / d; return [center - half, center + half]; }
function twoProportion(left: Row[], right: Row[]) { const x1 = left.filter((row) => row.outcome.won).length, x2 = right.filter((row) => row.outcome.won).length, pooled = (x1 + x2) / (left.length + right.length), se = Math.sqrt(pooled * (1 - pooled) * (1 / left.length + 1 / right.length)); return { z: se === 0 ? null : (x1 / left.length - x2 / right.length) / se }; }
function pValue(z: number | null) { if (z === null) return "-"; const p = 2 * (1 - normalCdf(Math.abs(z))); return p < 0.0001 ? "<0.0001" : p.toFixed(4); }
function normalCdf(x: number) { const t = 1 / (1 + 0.2316419 * x), d = 0.3989423 * Math.exp(-x * x / 2), probability = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return 1 - probability; }

function rank(rows: Row[], get: (row: Row) => number | null) { const result = new Map<string, number>(); for (const race of group(rows, raceId).values()) { const sorted = race.map((row) => ({ row, value: get(row) })).filter((item): item is { row: Row; value: number } => valid(item.value)).sort((a, b) => b.value - a.value || id(a.row).localeCompare(id(b.row))); let previous: number | null = null, previousRank = 0; sorted.forEach((item, index) => { const current = item.value === previous ? previousRank : index + 1; result.set(id(item.row), current); previous = item.value; previousRank = current; }); } return result; }
function raceGaps(rows: Row[], get: (row: Row) => number | null) { const result = new Map<string, number>(); for (const [raceIdValue, race] of group(rows.filter((row) => valid(get(row))), raceId)) { const values = race.map(get).filter(valid).sort((a, b) => b - a); if (values.length >= 2) result.set(raceIdValue, values[0]! - values[1]!); } return result; }
function maxLosingRun(rows: Row[]) { let current = 0, maximum = 0; for (const row of [...rows].sort(compareRows)) { current = row.outcome.won ? 0 : current + 1; maximum = Math.max(maximum, current); } return maximum; }
function trainerRunBand(value: number) { return value < 10 ? "0-9" : value < 20 ? "10-19" : value < 50 ? "20-49" : "50+"; }
function trainerStrikeBand(value: number | null) { return value === null ? "missing" : value < 10 ? "<10%" : value < 15 ? "10-14.9%" : value < 20 ? "15-19.9%" : value < 25 ? "20-24.9%" : "25%+"; }
function priceBand(value: number | null) { return value === null ? "missing" : value < 2 ? "<2.0" : value < 3 ? "2.0-2.99" : value < 5 ? "3.0-4.99" : value < 9 ? "5.0-8.99" : value < 21 ? "9.0-20.99" : "21.0+"; }
function fieldBand(value: number | null) { return value === null ? "missing" : value <= 5 ? "2-5" : value <= 8 ? "6-8" : "9+"; }
function gapBand(value: number | null) { return value === null ? "missing" : value <= OR_GAP_CUTS[0] ? "very small" : value <= OR_GAP_CUTS[1] ? "small" : value <= OR_GAP_CUTS[2] ? "medium" : "large"; }
function classBand(value: string | null) { const parsed = raceClassNumber(value); return parsed === null ? "unknown" : `Class ${parsed}`; }
function subtype(row: Row) { const value = `${row.features.raceName} ${row.features.raceType}`.toLowerCase(); return /\bhurdles?\b/.test(value) ? "hurdle" : /\bchase\b|\bsteeplechase\b/.test(value) ? "chase" : "other"; }
function isHandicap(row: Row) { return /handicap|nursery/i.test(`${row.features.raceName} ${row.features.raceType}`); }
function noviceBand(row: Row) { const value = `${row.features.raceName} ${row.features.raceType}`; return /maiden/i.test(value) ? "maiden" : /novice|beginners?/i.test(value) ? "novice" : "other"; }
function settled(row: Row) { return row.outcome.resultStatus !== "non_runner" && row.outcome.finishingPosition !== null; }
function sp(row: Row) { const value = Number(row.outcome.startingPriceDecimal); return Number.isFinite(value) && value > 0 ? value : null; }
function id(row: Row) { return row.features.targetRunnerId; }
function raceId(row: Row) { return row.features.targetRaceId; }
function compareRows(a: Row, b: Row) { return a.features.raceDateTime.getTime() - b.features.raceDateTime.getTime() || raceId(a).localeCompare(raceId(b)) || id(a).localeCompare(id(b)); }
function valid(value: number | null | undefined): value is number { return value !== null && value !== undefined && Number.isFinite(value); }
function group<T>(values: T[], key: (value: T) => string) { const result = new Map<string, T[]>(); for (const value of values) { const k = key(value); result.set(k, [...(result.get(k) ?? []), value]); } return result; }
function distinct<T>(values: T[], key: (value: T) => string) { return new Set(values.map(key)).size; }
function rate(numerator: number, denominator: number) { return denominator === 0 ? null : numerator / denominator; }
function diff(left: number | null, right: number | null) { return left === null || right === null ? null : left - right; }
function average(values: number[]) { return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length; }
function median(values: number[]) { if (values.length === 0) return null; const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2; }
function pct(value: number | null) { return value === null || !Number.isFinite(value) ? "-" : `${(value * 100).toFixed(2)}%`; }
function pp(value: number | null) { return value === null ? "-" : `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)} pp`; }
function num(value: number | null, digits = 3) { return value === null || !Number.isFinite(value) ? "-" : value.toFixed(digits); }
function signed(value: number | null) { return value === null ? "-" : `${value >= 0 ? "+" : ""}${value.toFixed(3)}`; }
function money(value: number | null) { return value === null ? "-" : `${value < 0 ? "-" : ""}£${Math.abs(value).toFixed(2)}`; }
function table(lines: string[], rows: Array<Record<string, unknown>>) { if (rows.length === 0) { lines.push("No rows.", ""); return; } const headers = Object.keys(rows[0]!); lines.push(`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map((row) => `| ${headers.map((header) => String(row[header] ?? "-").replace(/\|/g, "\\|")).join(" | ")} |`), ""); }

await main();
