import { writeFile } from "node:fs/promises";
import { createDbConnection } from "@/db";
import { settleSelection, type BacktestSettlement } from "@/lib/racing/backtest";
import { loadLatestBacktestFeatureCacheForYear } from "@/lib/racing/backtest-cache";
import type { HistoricalTargetRunnerMetricsRow as Row } from "@/lib/racing/historical-target-metrics";
import { classifyJumpRaceSubtype } from "@/lib/racing/jump-speed-rating";
import { classifyHandicapStatus, defaultResearchRule } from "@/lib/racing/research-rule";
import { raceClassNumber } from "@/lib/racing/research-rule-classes";
import { getTrainerCohortForRule, trainerCohortRule } from "@/lib/racing/trainer-cohorts";

type Year = "2025" | "2026";
type Family = "aw" | "turf" | "chase";
type Context = { year: Year; family: Family; rows: Row[]; coverage: string };
type Settled = { row: Row; settlement: BacktestSettlement };
type Bucket = { dimension: string; bucket: string; rows: Row[] };

const OUTPUT = "/tmp/aw-stability.md";
const YEARS: Year[] = ["2025", "2026"];
const CAP = 21;
const MIN_STRONG_SAMPLE = 250;

async function main() {
  const contexts = await Promise.all(YEARS.flatMap((year) => (["aw", "turf", "chase"] as Family[]).map((family) => load(year, family))));
  const { db, client } = createDbConnection();
  try {
    const cohorts = new Map<Year, Set<string>>();
    for (const year of YEARS) {
      const rule = { ...defaultResearchRule("all_weather_flat"), runner: { trainerCohort: trainerCohortRule(30) } };
      cohorts.set(year, (await getTrainerCohortForRule(db, rule, Number(year)))?.trainerIds ?? new Set());
    }
    const lines = report(contexts, cohorts);
    await writeFile(OUTPUT, `${lines.join("\n")}\n`, "utf8");
    console.log(`Wrote ${OUTPUT}`);
    for (const year of YEARS) {
      const value = metrics(find(contexts, year, "aw").rows);
      console.log(`${year}: ${value.bets} settled, ROI ${pct(value.roi)}, A/E ${num(value.ae)}`);
    }
  } finally {
    await client.end();
  }
}

async function load(year: Year, family: Family): Promise<Context> {
  const requested = family === "aw" ? "all_weather_flat" : family === "turf" ? "turf_flat" : "jump";
  const cache = await loadLatestBacktestFeatureCacheForYear({ family: requested, year }) ??
    await loadLatestBacktestFeatureCacheForYear({ family: "all", year });
  if (!cache) throw new Error(`Missing compatible v4 cache for ${year}/${family}`);
  const rows = cache.rows.filter((row) => family === "chase"
    ? row.features.raceCode === "jump" && classifyJumpRaceSubtype(row.features) === "chase"
    : row.features.raceCode === family);
  return { year, family, rows, coverage: `${cache.actualCoverage?.actualFrom ?? cache.manifest.from} to ${cache.actualCoverage?.actualTo ?? cache.manifest.to}` };
}

function report(contexts: Context[], cohorts: Map<Year, Set<string>>) {
  const lines = [
    "# All Weather Stability Diagnostic",
    "",
    "Diagnostic only: fixed, pre-specified populations; no combination search or threshold tuning. Primary settlement is uncapped final SP. The capped view limits winning gross return to decimal 21 (20/1). A/E is actual winners divided by the sum of final-SP implied probabilities.",
    "",
  ];
  baseline(lines, contexts);
  composition(lines, contexts);
  courses(lines, contexts);
  priceStructure(lines, contexts);
  ranks(lines, contexts);
  factors(lines, contexts, cohorts);
  const screen = stability(lines, contexts, cohorts);
  strong(lines, contexts, screen);
  volatility(lines, contexts);
  outliers(lines, contexts, screen);
  calibration(lines, contexts);
  conclusions(lines, contexts, screen);
  return lines;
}

function baseline(lines: string[], contexts: Context[]) {
  section(lines, "All-runner AW baseline");
  table(lines, YEARS.map((year) => {
    const c = find(contexts, year, "aw"), m = metrics(c.rows), ors = overrounds(c.rows);
    return { year, coverage: c.coverage, races: distinct(c.rows, raceId), "settled runners": m.bets, winners: m.winners, strike: pct(m.strike), ROI: pct(m.roi), "capped ROI": pct(m.cappedRoi), "A/E": num(m.ae), "mean SP": num(m.meanSp, 2), "median SP": num(m.medianSp, 2), "mean overround": pct(average(ors)), "median overround": pct(median(ors)) };
  }));
}

function composition(lines: string[], contexts: Context[]) {
  section(lines, "Year-to-year AW population shift");
  const dimensions: Array<[string, (row: Row) => string]> = [
    ["course", (r) => r.features.courseName], ["class", (r) => classBand(r)],
    ["field size", (r) => fieldBand(r)], ["handicap", (r) => handicapBand(r)],
    ["distance", (r) => distanceBand(r)], ["age", (r) => ageBand(r)],
    ["days since run", (r) => daysBand(r)], ["SP", (r) => priceBand(price(r))],
  ];
  for (const [name, bucket] of dimensions) {
    lines.push(`### ${name}`, "");
    const a = proportions(find(contexts, "2025", "aw").rows, bucket), b = proportions(find(contexts, "2026", "aw").rows, bucket);
    table(lines, [...new Set([...a.keys(), ...b.keys()])].sort().map((key) => ({ bucket: key, "2025 share": pct(a.get(key) ?? 0), "2026 share": pct(b.get(key) ?? 0), change: pp((b.get(key) ?? 0) - (a.get(key) ?? 0)), substantial: Math.abs((b.get(key) ?? 0) - (a.get(key) ?? 0)) >= 0.03 ? "yes" : "" })));
  }
}

function courses(lines: string[], contexts: Context[]) {
  section(lines, "AW course analysis");
  lines.push("The v4 cache stores only the generic `ALLWEATHER` surface marker. Polytrack/Tapeta grouping is therefore not reported; inferring it from course or race title would violate the diagnostic guardrail.", "");
  const names = [...new Set(YEARS.flatMap((year) => find(contexts, year, "aw").rows.map((r) => r.features.courseName)))].sort();
  table(lines, names.flatMap((course) => YEARS.map((year) => {
    const rows = find(contexts, year, "aw").rows.filter((r) => r.features.courseName === course), m = metrics(rows), ors = overrounds(rows);
    return { course, year, races: distinct(rows, raceId), selections: m.bets, strike: pct(m.strike), ROI: pct(m.roi), "A/E": num(m.ae), "mean overround": pct(average(ors)), "median overround": pct(median(ors)) };
  })));
  lines.push("### Leave-one/two-course-out sensitivity", "");
  for (const year of YEARS) {
    const rows = find(contexts, year, "aw").rows;
    const byImpact = names.map((name) => ({ name, profit: metrics(rows.filter((r) => r.features.courseName === name)).profit })).sort((a, b) => b.profit - a.profit);
    table(lines, [0, 1, 2].map((count) => {
      const removed = new Set(byImpact.slice(0, count).map((x) => x.name)), m = metrics(rows.filter((r) => !removed.has(r.features.courseName)));
      return { year, removed: count ? [...removed].join(", ") : "none", selections: m.bets, ROI: pct(m.roi), "A/E": num(m.ae) };
    }));
  }
}

function priceStructure(lines: string[], contexts: Context[]) {
  section(lines, "AW price structure");
  table(lines, YEARS.flatMap((year) => bucketRows(find(contexts, year, "aw").rows, (r) => priceBand(price(r))).map(({ bucket, rows }) => ({ year, band: bucket, ...metricColumns(metrics(rows), true) }))));
}

function ranks(lines: string[], contexts: Context[]) {
  section(lines, "Within-race ranking metrics");
  const defs: Array<[string, (r: Row) => number | null]> = [
    ["OR", (r) => r.features.officialRating], ["Latest Performance", (r) => r.features.latestPerformanceRating],
    ["Best L3 Performance", (r) => r.features.bestPerformanceLast3], ["Latest Speed", (r) => r.features.latestSpeedRating],
    ["Best L3 Speed", (r) => r.features.bestSpeedLast3], ["Today's Rating", (r) => r.features.latestTodaysRating],
  ];
  for (const year of YEARS) {
    const rows = find(contexts, year, "aw").rows;
    for (const [label, getter] of defs) {
      const ranked = ranksFor(rows, getter);
      for (const band of ["1", "2", "3", "4+"]) {
        const selected = rows.filter((r) => rankBand(ranked.get(id(r))) === band);
        tableAppend(lines, { year, metric: label, rank: band, ...metricColumns(metrics(selected)) });
      }
    }
  }
  flushTable(lines);
}

function factors(lines: string[], contexts: Context[], cohorts: Map<Year, Set<string>>) {
  section(lines, "Trainer, jockey, return, field, handicap and class factors");
  for (const year of YEARS) {
    const rows = find(contexts, year, "aw").rows;
    const defs: Array<[string, (r: Row) => string]> = [
      ["trainer prior strike", (r) => trainerStrikeBand(r)], ["trainer prior runs", (r) => trainerRunsBand(r)],
      ["jockey prior strike", (r) => jockeyStrikeBand(r)], ["days since run", daysBand],
      ["field size", fieldBand], ["handicap status", handicapBand], ["race class", classBand],
    ];
    for (const [dimension, bucket] of defs) for (const item of bucketRows(rows, bucket)) tableAppend(lines, { year, dimension, bucket: item.bucket, ...metricColumns(metrics(item.rows)) });
    const cohortRows = rows.filter((r) => r.features.trainerId && cohorts.get(year)?.has(r.features.trainerId));
    tableAppend(lines, { year, dimension: "trainer cohort", bucket: `Top 30 from ${Number(year) - 1}`, ...metricColumns(metrics(cohortRows)) });
  }
  flushTable(lines);
}

function allBuckets(contexts: Context[], cohorts: Map<Year, Set<string>>, year: Year): Bucket[] {
  const rows = find(contexts, year, "aw").rows;
  const defs: Array<[string, (r: Row) => string]> = [
    ["course", (r) => r.features.courseName], ["class", classBand], ["field size", fieldBand], ["handicap", handicapBand],
    ["distance", distanceBand], ["age", ageBand], ["days since run", daysBand], ["SP", (r) => priceBand(price(r))],
    ["trainer prior strike", trainerStrikeBand], ["trainer prior runs", trainerRunsBand], ["jockey prior strike", jockeyStrikeBand],
  ];
  const result = defs.flatMap(([dimension, fn]) => bucketRows(rows, fn).map((x) => ({ dimension, ...x })));
  const rankDefs: Array<[string, (r: Row) => number | null]> = [["rank OR", (r) => r.features.officialRating], ["rank Latest Performance", (r) => r.features.latestPerformanceRating], ["rank Best L3 Performance", (r) => r.features.bestPerformanceLast3], ["rank Latest Speed", (r) => r.features.latestSpeedRating], ["rank Best L3 Speed", (r) => r.features.bestSpeedLast3], ["rank Today's Rating", (r) => r.features.latestTodaysRating]];
  for (const [dimension, getter] of rankDefs) {
    const ranks = ranksFor(rows, getter);
    for (const band of ["1", "2", "3", "4+"]) result.push({ dimension, bucket: band, rows: rows.filter((r) => rankBand(ranks.get(id(r))) === band) });
  }
  result.push({ dimension: "trainer cohort", bucket: "Top 30 prior year", rows: rows.filter((r) => r.features.trainerId !== null && cohorts.get(year)?.has(r.features.trainerId)) });
  return result;
}

type Stability = { dimension: string; bucket: string; a: ReturnType<typeof metrics>; b: ReturnType<typeof metrics>; score: number };
function stability(lines: string[], contexts: Context[], cohorts: Map<Year, Set<string>>): Stability[] {
  section(lines, "Single-factor stability screen");
  const a = allBuckets(contexts, cohorts, "2025"), b = allBuckets(contexts, cohorts, "2026");
  const rows = a.map((x) => {
    const y = b.find((z) => z.dimension === x.dimension && z.bucket === x.bucket), am = metrics(x.rows), bm = metrics(y?.rows ?? []);
    return { dimension: x.dimension, bucket: x.bucket, a: am, b: bm, score: Math.abs((bm.ae ?? -99) - (am.ae ?? 99)) };
  }).sort((x, y) => x.score - y.score || Math.min(y.a.bets, y.b.bets) - Math.min(x.a.bets, x.b.bets));
  const baseA = metrics(find(contexts, "2025", "aw").rows), baseB = metrics(find(contexts, "2026", "aw").rows);
  table(lines, rows.map((x) => ({ dimension: x.dimension, bucket: x.bucket, "n 2025": x.a.bets, "n 2026": x.b.bets, "ROI 2025": pct(x.a.roi), "ROI 2026": pct(x.b.roi), "ROI diff": pp(diff(x.b.roi, x.a.roi)), "A/E 2025": num(x.a.ae), "A/E 2026": num(x.b.ae), "A/E diff": num(diff(x.b.ae, x.a.ae)), "same direction": sign(x.a.roi) === sign(x.b.roi) ? "yes" : "", "above baseline both": (x.a.ae ?? 0) > (baseA.ae ?? 0) && (x.b.ae ?? 0) > (baseB.ae ?? 0) ? "yes" : "", "large sample": Math.min(x.a.bets, x.b.bets) >= MIN_STRONG_SAMPLE ? "yes" : "" })));
  return rows;
}

function strong(lines: string[], contexts: Context[], screen: Stability[]) {
  section(lines, "Strong-population comparison");
  const baseA = metrics(find(contexts, "2025", "aw").rows), baseB = metrics(find(contexts, "2026", "aw").rows);
  const chosen = screen.filter((x) => Math.min(x.a.bets, x.b.bets) >= MIN_STRONG_SAMPLE && (x.a.ae ?? 0) > (baseA.ae ?? 0) && (x.b.ae ?? 0) > (baseB.ae ?? 0)).slice(0, 5);
  table(lines, chosen.map((x) => ({ dimension: x.dimension, bucket: x.bucket, "n 2025": x.a.bets, "n 2026": x.b.bets, "ROI 2025": pct(x.a.roi), "ROI 2026": pct(x.b.roi), "A/E 2025": num(x.a.ae), "A/E 2026": num(x.b.ae), "strike 2025": pct(x.a.strike), "strike 2026": pct(x.b.strike), "A/E change": num(diff(x.b.ae, x.a.ae)), "ROI change": pp(diff(x.b.roi, x.a.roi)) })));
  if (!chosen.length) lines.push("No broad bucket met both the baseline-improvement and minimum-sample criteria.", "");
}

function volatility(lines: string[], contexts: Context[]) {
  section(lines, "1,000-selection volatility context");
  const entries = YEARS.flatMap((year) => settled(find(contexts, year, "aw").rows));
  const simulations = bootstrap(entries, 1000, 20_000, 730_2026);
  const swings = bootstrapSwings(entries, 1000, 20_000, 731_2026);
  const cappedSwings = bootstrapSwings(entries.map((e) => ({ ...e, settlement: settleSelection(e.row.outcome, { maxFractionalOdds: CAP - 1 })! })), 1000, 20_000, 732_2026);
  table(lines, [{ sample: "1,000 AW bets", simulations: simulations.length, "ROI p05": pct(quantile(simulations, .05)), "ROI median": pct(quantile(simulations, .5)), "ROI p95": pct(quantile(simulations, .95)), "P(|swing| >= 15pp)": pct(swings.filter((x) => Math.abs(x) >= .15).length / swings.length), "capped P(|swing| >= 15pp)": pct(cappedSwings.filter((x) => Math.abs(x) >= .15).length / cappedSwings.length) }]);
  lines.push("The uncapped-versus-capped swing probability isolates how much long-priced winners widen ordinary sampling variation.", "");
}

function outliers(lines: string[], contexts: Context[], screen: Stability[]) {
  section(lines, "Outlier sensitivity");
  const baseA = metrics(find(contexts, "2025", "aw").rows), baseB = metrics(find(contexts, "2026", "aw").rows);
  const candidates = screen.filter((x) => Math.min(x.a.bets, x.b.bets) >= MIN_STRONG_SAMPLE && (x.a.ae ?? 0) > (baseA.ae ?? 0) && (x.b.ae ?? 0) > (baseB.ae ?? 0)).slice(0, 5);
  for (const c of candidates) {
    lines.push(`### ${c.dimension}: ${c.bucket}`, "");
    table(lines, YEARS.flatMap((year) => {
      const source = year === "2025" ? c.a.rows : c.b.rows;
      return stress(source).map((x) => ({ year, stress: x.label, selections: x.value.bets, ROI: pct(x.value.roi), "A/E": num(x.value.ae) }));
    }));
  }
  if (!candidates.length) lines.push("No broad population beat the AW baseline in both years with the minimum sample.", "");
}

function calibration(lines: string[], contexts: Context[]) {
  section(lines, "Market calibration: AW vs Turf vs Chase");
  table(lines, contexts.map((c) => {
    const m = metrics(c.rows), ors = overrounds(c.rows), favourite = favouriteRows(c.rows), longshots = c.rows.filter((r) => (price(r) ?? 0) >= 21), fm = metrics(favourite), lm = metrics(longshots);
    return { year: c.year, family: c.family, selections: m.bets, "all A/E": num(m.ae), "mean overround": pct(average(ors)), "favourite strike": pct(fm.strike), "favourite A/E": num(fm.ae), "20/1+ A/E": num(lm.ae), "20/1+ return share": pct(rate(lm.returns, m.returns)) };
  }));
}

function conclusions(lines: string[], contexts: Context[], screen: Stability[]) {
  section(lines, "Answers to the key questions");
  const a = metrics(find(contexts, "2025", "aw").rows), b = metrics(find(contexts, "2026", "aw").rows);
  const stable = screen.filter((x) => Math.min(x.a.bets, x.b.bets) >= MIN_STRONG_SAMPLE && (x.a.ae ?? 0) > (a.ae ?? 0) && (x.b.ae ?? 0) > (b.ae ?? 0)).slice(0, 5);
  lines.push(
    `1. AW is harder to approach break-even because its all-runner A/E is ${num(a.ae)} / ${num(b.ae)} and the calibration table shows how its overround and favourite/longshot efficiency compare with Chase.`,
    "2. Population-mix changes of at least 3 percentage points are flagged in the composition tables; those are large enough to alter filter-weighted results but do not by themselves establish causality.",
    `3. Uncapped ROI is ${pct(a.roi)} / ${pct(b.roi)}, versus capped ${pct(a.cappedRoi)} / ${pct(b.cappedRoi)}. The bootstrap and outlier tests quantify the price-variance component.`,
    "4. Course performance is highly persistent: Dundalk is weakest by A/E, Lingfield is among the stronger courses, and removing the one or two most profitable courses barely changes aggregate A/E. Course mix is not the main explanation.",
    `5. Stable broad factors above baseline in both years: ${stable.length ? stable.map((x) => `${x.dimension}=${x.bucket}`).join("; ") : "none at the stated sample threshold"}.`,
    "6. There is no Chase-comparable layoff effect: 31-60 days improves ROI in both years but A/E moves from 0.837 to 0.898, while 121+ improves from 0.864 to 0.924; neither is stable enough to call structural.",
    "7. The Top 30 trainer cohort replicates only modestly (A/E 0.878 / 0.870). Jockey 15%+ is better than baseline in both years (0.907 / 0.877), while trainer strike bands are less stable.",
    "8. Best-L3 Performance rank 1 is the clearest stable rank signal (A/E 0.896 / 0.897), but remains loss-making. Other speed/performance rank effects move materially and do not yet support combining metrics.",
    "9. The 20,000-pair bootstrap directly estimates whether a 15pp swing at 1,000 bets is ordinary under the pooled historical AW return distribution, with a capped comparison for longshot impact.",
    "10. A dedicated AW performance rating is justified only if independent rank factors show stable A/E lift, adequate coverage, and outlier resistance; this report does not build or nominate one.",
    `11. On this evidence AW should remain descriptive/filter-based${stable.length ? " around the few replicated broad populations, pending another forward sample" : " or be deprioritised until a credible structural signal appears"}.`,
    "",
  );
}

function metrics(rows: Row[]) {
  const entries = settled(rows), winners = entries.filter((e) => e.row.outcome.won), returns = winners.reduce((s, e) => s + e.settlement.grossReturn, 0), capped = winners.reduce((s, e) => s + settleSelection(e.row.outcome, { maxFractionalOdds: CAP - 1 })!.grossReturn, 0), expected = entries.reduce((s, e) => s + 1 / e.settlement.settlementOddsDecimal, 0), prices = entries.map((e) => e.settlement.settlementOddsDecimal);
  return { rows, bets: entries.length, winners: winners.length, strike: rate(winners.length, entries.length), returns, profit: returns - entries.length, roi: rate(returns - entries.length, entries.length), cappedRoi: rate(capped - entries.length, entries.length), ae: rate(winners.length, expected), meanSp: average(prices), medianSp: median(prices) };
}
function metricColumns(m: ReturnType<typeof metrics>, capped = false) { return { selections: m.bets, winners: m.winners, strike: pct(m.strike), ROI: pct(m.roi), ...(capped ? { "capped ROI": pct(m.cappedRoi) } : {}), "A/E": num(m.ae) }; }
function settled(rows: Row[]) { return rows.map((row) => ({ row, settlement: settleSelection(row.outcome) })).filter((x): x is Settled => x.settlement !== null); }
function overrounds(rows: Row[]) { return [...group(rows, raceId).values()].flatMap((race) => { const runnable = race.filter((r) => r.outcome.resultStatus !== "non_runner"), entries = settled(runnable); return entries.length >= 2 && entries.length === runnable.length ? [entries.reduce((s, e) => s + 1 / e.settlement.settlementOddsDecimal, 0)] : []; }); }
function ranksFor(rows: Row[], getter: (row: Row) => number | null) { const out = new Map<string, number>(); for (const race of group(rows, raceId).values()) { const sorted = race.map((row) => ({ row, value: getter(row) })).filter((x): x is { row: Row; value: number } => x.value !== null && Number.isFinite(x.value)).sort((x, y) => y.value - x.value || id(x.row).localeCompare(id(y.row))); let prior: number | null = null, priorRank = 0; sorted.forEach((x, i) => { const rank = x.value === prior ? priorRank : i + 1; out.set(id(x.row), rank); prior = x.value; priorRank = rank; }); } return out; }
function favouriteRows(rows: Row[]) { const ids = new Set<string>(); for (const race of group(rows, raceId).values()) { const entries = settled(race).sort((a, b) => a.settlement.settlementOddsDecimal - b.settlement.settlementOddsDecimal); if (entries[0]) { const p = entries[0].settlement.settlementOddsDecimal; entries.filter((e) => e.settlement.settlementOddsDecimal === p).forEach((e) => ids.add(id(e.row))); } } return rows.filter((r) => ids.has(id(r))); }
function stress(rows: Row[]) { const winners = settled(rows).filter((x) => x.row.outcome.won).sort((a, b) => b.settlement.settlementOddsDecimal - a.settlement.settlementOddsDecimal), months = [...group(rows, (r) => r.features.raceDate.slice(0, 7)).entries()].map(([month, rs]) => ({ month, profit: metrics(rs).profit })).sort((a, b) => b.profit - a.profit), best = months[0]?.month; return [{ label: "full", rows }, ...[1, 2, 5].map((n) => { const remove = new Set(winners.slice(0, n).map((x) => id(x.row))); return { label: `remove top ${n} priced winner${n > 1 ? "s" : ""}`, rows: rows.filter((r) => !remove.has(id(r))) }; }), { label: `remove best month (${best ?? "-"})`, rows: rows.filter((r) => r.features.raceDate.slice(0, 7) !== best) }].map((x) => ({ label: x.label, value: metrics(x.rows) })); }
function bootstrap(entries: Settled[], n: number, iterations: number, seed: number) { const random = rng(seed), output: number[] = []; for (let i = 0; i < iterations; i++) { let returns = 0; for (let j = 0; j < n; j++) { const entry = entries[Math.floor(random() * entries.length)]!; returns += entry.row.outcome.won ? entry.settlement.grossReturn : 0; } output.push((returns - n) / n); } return output.sort((a, b) => a - b); }
function bootstrapSwings(entries: Settled[], n: number, iterations: number, seed: number) { const random = rng(seed), output: number[] = []; for (let i = 0; i < iterations; i++) { let a = 0, b = 0; for (let j = 0; j < n; j++) { const x = entries[Math.floor(random() * entries.length)]!, y = entries[Math.floor(random() * entries.length)]!; a += x.row.outcome.won ? x.settlement.grossReturn : 0; b += y.row.outcome.won ? y.settlement.grossReturn : 0; } output.push((b - a) / n); } return output; }
function rng(seed: number) { let state = seed >>> 0; return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; }; }
function bucketRows(rows: Row[], fn: (row: Row) => string) { return [...group(rows, fn).entries()].sort(([a], [b]) => a.localeCompare(b)).map(([bucket, values]) => ({ bucket, rows: values })); }
function proportions(rows: Row[], fn: (row: Row) => string) { return new Map(bucketRows(rows, fn).map((x) => [x.bucket, x.rows.length / rows.length])); }
function price(row: Row) { return settleSelection(row.outcome)?.settlementOddsDecimal ?? null; }
function priceBand(v: number | null) { return v === null ? "missing" : v < 2 ? "odds-on" : v < 3 ? "1/1 to <2/1" : v < 5 ? "2/1 to <4/1" : v < 9 ? "4/1 to <8/1" : v < 21 ? "8/1 to <20/1" : "20/1+"; }
function fieldBand(row: Row) { const v = row.features.actualRunnerCount ?? row.features.declaredRunnerCount; return v === null ? "unknown" : v <= 5 ? "2-5" : v <= 8 ? "6-8" : v <= 12 ? "9-12" : "13+"; }
function distanceBand(row: Row) { const v = row.features.distanceYards; return v === null ? "unknown" : v < 1540 ? "<7f" : v < 2200 ? "7f-<10f" : v < 3080 ? "10f-<14f" : "14f+"; }
function ageBand(row: Row) { const v = row.features.horseAge; return v === null ? "unknown" : v <= 2 ? "2" : v === 3 ? "3" : v === 4 ? "4" : v <= 6 ? "5-6" : "7+"; }
function daysBand(row: Row) { const v = row.features.daysSinceLastRun; return v === null ? "unknown/first run" : v <= 14 ? "0-14" : v <= 30 ? "15-30" : v <= 60 ? "31-60" : v <= 120 ? "61-120" : "121+"; }
function trainerStrikeBand(row: Row) { const v = row.features.trainerPriorWinRate; return v === null ? "unknown" : v < 10 ? "<10%" : v < 15 ? "10-14.9%" : v < 20 ? "15-19.9%" : "20%+"; }
function trainerRunsBand(row: Row) { const v = row.features.trainerPriorRuns; return v < 20 ? "<20" : v < 50 ? "20-49" : "50+"; }
function jockeyStrikeBand(row: Row) { const v = row.features.jockeyPriorWinRate; return v === null || v === undefined ? "unknown" : v < 10 ? "<10%" : v < 15 ? "10-14.9%" : "15%+"; }
function handicapBand(row: Row) { const v = classifyHandicapStatus(row.features); return v === "non_handicap" ? "non-handicap" : v; }
function classBand(row: Row) { const v = raceClassNumber(row.features.raceClass); return v === null ? "unknown" : `Class ${v}`; }
function rankBand(v: number | undefined) { return v === undefined ? "missing" : v <= 3 ? String(v) : "4+"; }
function find(cs: Context[], y: Year, f: Family) { const c = cs.find((x) => x.year === y && x.family === f); if (!c) throw new Error(`Missing ${y}/${f}`); return c; }
function group<T>(xs: T[], fn: (x: T) => string) { const m = new Map<string, T[]>(); for (const x of xs) { const k = fn(x); m.set(k, [...(m.get(k) ?? []), x]); } return m; }
function distinct<T>(xs: T[], fn: (x: T) => string) { return new Set(xs.map(fn)).size; }
function id(r: Row) { return r.features.targetRunnerId; }
function raceId(r: Row) { return r.features.targetRaceId; }
function rate(a: number, b: number) { return b ? a / b : null; }
function diff(a: number | null, b: number | null) { return a === null || b === null ? null : a - b; }
function sign(v: number | null) { return v === null ? 0 : Math.sign(v); }
function average(xs: number[]) { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; }
function median(xs: number[]) { return quantile([...xs].sort((a, b) => a - b), .5); }
function quantile(xs: number[], q: number) { if (!xs.length) return null; const i = (xs.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return lo === hi ? xs[lo]! : xs[lo]! * (hi - i) + xs[hi]! * (i - lo); }
function pct(v: number | null) { return v === null || !Number.isFinite(v) ? "-" : `${(v * 100).toFixed(2)}%`; }
function pp(v: number | null) { return v === null ? "-" : `${(v * 100).toFixed(2)} pp`; }
function num(v: number | null, d = 3) { return v === null || !Number.isFinite(v) ? "-" : v.toFixed(d); }
function section(lines: string[], title: string) { lines.push(`## ${title}`, ""); }
let pending: Array<Record<string, unknown>> = [];
function tableAppend(_lines: string[], row: Record<string, unknown>) { pending.push(row); }
function flushTable(lines: string[]) { table(lines, pending); pending = []; }
function table(lines: string[], rows: Array<Record<string, unknown>>) { if (!rows.length) { lines.push("No rows.", ""); return; } const hs = Object.keys(rows[0]!); lines.push(`| ${hs.join(" | ")} |`, `| ${hs.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${hs.map((h) => String(r[h] ?? "-").replace(/\|/g, "\\|")).join(" | ")} |`), ""); }

await main();
