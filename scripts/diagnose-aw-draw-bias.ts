import { writeFile } from "node:fs/promises";
import { settleSelection, type BacktestSettlement } from "@/lib/racing/backtest";
import { loadLatestBacktestFeatureCacheForYear } from "@/lib/racing/backtest-cache";
import type { HistoricalTargetRunnerMetricsRow as Row } from "@/lib/racing/historical-target-metrics";

type Year = "2025" | "2026";
type Context = { year: Year; rows: Row[]; coverage: string };
type Settled = { row: Row; settlement: BacktestSettlement };
type Effect = { course: string; distance: string; kind: "absolute" | "relative"; year: Year; low: ReturnType<typeof metrics>; high: ReturnType<typeof metrics> };

const YEARS: Year[] = ["2025", "2026"];
const OUTPUT = "/tmp/aw-draw-bias.md";
const CAP = 21;
const MATERIAL_GROUP = 200;
const SMALL_BAND = 100;
const DISTANCES = ["sprint", "mile-ish", "middle distance", "staying"];
const ABSOLUTE_DRAWS = ["1-3", "4-6", "7-9", "10+"];
const RELATIVE_DRAWS = ["low third", "middle third", "high third"];

async function main() {
  const contexts = await Promise.all(YEARS.map(load));
  const lines = report(contexts);
  await writeFile(OUTPUT, `${lines.join("\n")}\n`, "utf8");
  console.log(`Wrote ${OUTPUT}`);
  for (const context of contexts) console.log(`${context.year}: ${context.rows.length} AW rows, ${context.rows.filter(hasDraw).length} stored draws, ${context.coverage}`);
}

async function load(year: Year): Promise<Context> {
  const cache = await loadLatestBacktestFeatureCacheForYear({ family: "all_weather_flat", year }) ??
    await loadLatestBacktestFeatureCacheForYear({ family: "all", year });
  if (!cache) throw new Error(`Missing compatible v4 AW cache for ${year}`);
  return { year, rows: cache.rows.filter((row) => row.features.raceCode === "aw"), coverage: `${cache.actualCoverage?.actualFrom ?? cache.manifest.from} to ${cache.actualCoverage?.actualTo ?? cache.manifest.to}` };
}

function report(contexts: Context[]) {
  const lines = [
    "# All Weather Draw-Bias Diagnostic",
    "",
    "Diagnostic only. Draw means the cache's stored stall number. Stalls are not renumbered after non-runners. Absolute bands are fixed at 1-3, 4-6, 7-9 and 10+. Relative thirds use stored draw against recorded actual field size (falling back to declared size); no relative-draw Research filter is created.",
    "",
    "Distance bands reuse the existing flat convention: sprint <=6f, mile-ish >6f-8f, middle distance >8f-12f, staying >12f. No course-specific boundaries are fitted.",
    "",
  ];
  coverage(lines, contexts);
  absolute(lines, contexts);
  relative(lines, contexts);
  wolverhampton(lines, contexts);
  const effects = stability(lines, contexts);
  bestL3(lines, contexts);
  decision(lines, contexts, effects);
  return lines;
}

function coverage(lines: string[], contexts: Context[]) {
  section(lines, "Coverage and race-distance inventory");
  table(lines, contexts.map((context) => ({ year: context.year, coverage: context.coverage, races: distinct(context.rows, raceId), runners: context.rows.length, "stored draw": context.rows.filter(hasDraw).length, "draw coverage": pct(context.rows.filter(hasDraw).length / context.rows.length), "missing draw": context.rows.filter((row) => !hasDraw(row)).length })));
  table(lines, contexts.flatMap((context) => [...group(context.rows, courseDistance).entries()].map(([key, rows]) => { const [course, distance] = key.split("\0"); const exact = [...new Set(rows.map((row) => row.features.distanceYards).filter(valid))].sort((a, b) => a - b); return { year: context.year, course, band: distance, races: distinct(rows, raceId), runners: rows.length, "drawn runners": rows.filter(hasDraw).length, "actual distances": exact.map(formatDistance).join(", ") }; })));
}

function absolute(lines: string[], contexts: Context[]) {
  section(lines, "Absolute draw by course and distance");
  for (const course of courses(contexts)) {
    lines.push(`### ${course}`, "");
    table(lines, YEARS.flatMap((year) => DISTANCES.flatMap((distance) => ABSOLUTE_DRAWS.map((draw) => {
      const rows = groupRows(contexts, year, course, distance).filter((row) => absoluteDraw(row) === draw), m = metrics(rows);
      return { year, distance, draw, ...columns(m, true), sparse: m.bets < SMALL_BAND ? "yes" : "" };
    }))));
  }
}

function relative(lines: string[], contexts: Context[]) {
  section(lines, "Relative draw thirds by course and distance");
  for (const course of courses(contexts)) {
    lines.push(`### ${course}`, "");
    table(lines, YEARS.flatMap((year) => DISTANCES.flatMap((distance) => RELATIVE_DRAWS.map((draw) => {
      const rows = groupRows(contexts, year, course, distance).filter((row) => relativeDraw(row) === draw), m = metrics(rows);
      return { year, distance, draw, ...columns(m, true), sparse: m.bets < SMALL_BAND ? "yes" : "" };
    }))));
  }
}

function wolverhampton(lines: string[], contexts: Context[]) {
  section(lines, "Wolverhampton sprint focus");
  table(lines, YEARS.flatMap((year) => ["1-3", "4-6", "7+"].map((draw) => {
    const rows = groupRows(contexts, year, "Wolverhampton", "sprint").filter((row) => wolverhamptonDraw(row) === draw), m = metrics(rows);
    return { year, draw, ...columns(m, true), "average field size": num(average(rows.map(fieldSize).filter(valid)), 2), sparse: m.bets < SMALL_BAND ? "yes" : "" };
  })));
  lines.push("Low-draw replication is assessed from the sign of the 1-3 versus 7+ strike and A/E differences in the stability section, not from either year's ROI alone.", "");
}

function stability(lines: string[], contexts: Context[]) {
  section(lines, "Year-to-year draw-effect stability");
  const effects: Effect[] = [];
  for (const course of courses(contexts)) for (const distance of DISTANCES) for (const year of YEARS) {
    const rows = groupRows(contexts, year, course, distance);
    effects.push({ course, distance, kind: "absolute", year, low: metrics(rows.filter((r) => absoluteDraw(r) === "1-3")), high: metrics(rows.filter((r) => ["7-9", "10+"].includes(absoluteDraw(r)))) });
    effects.push({ course, distance, kind: "relative", year, low: metrics(rows.filter((r) => relativeDraw(r) === "low third")), high: metrics(rows.filter((r) => relativeDraw(r) === "high third")) });
  }
  const pairs = effects.filter((effect) => effect.year === "2025").map((a) => ({ a, b: effects.find((effect) => effect.year === "2026" && effect.course === a.course && effect.distance === a.distance && effect.kind === a.kind)! })).filter((x) => x.a.low.bets + x.a.high.bets > 0 || x.b.low.bets + x.b.high.bets > 0);
  table(lines, pairs.map(({ a, b }) => {
    const aStrike = diff(a.low.strike, a.high.strike), bStrike = diff(b.low.strike, b.high.strike), aAe = diff(a.low.ae, a.high.ae), bAe = diff(b.low.ae, b.high.ae), aRoi = diff(a.low.roi, a.high.roi), bRoi = diff(b.low.roi, b.high.roi);
    return { course: a.course, distance: a.distance, basis: a.kind, "n25 low/high": `${a.low.bets}/${a.high.bets}`, "n26 low/high": `${b.low.bets}/${b.high.bets}`, "strike diff 25": pp(aStrike), "strike diff 26": pp(bStrike), "A/E diff 25": num(aAe), "A/E diff 26": num(bAe), "ROI diff 25": pp(aRoi), "ROI diff 26": pp(bRoi), "direction repeats": sameNonZeroSign(aStrike, bStrike) && sameNonZeroSign(aAe, bAe) ? "yes" : "", sparse: Math.min(a.low.bets, a.high.bets, b.low.bets, b.high.bets) < SMALL_BAND ? "yes" : "" };
  }));
  return effects;
}

function bestL3(lines: string[], contexts: Context[]) {
  section(lines, "Best-L3 Performance rank-1 interaction");
  lines.push(`Material groups require at least ${MATERIAL_GROUP} runners with stored draws in each year. Low/middle/high refer to diagnostic relative thirds.`, "");
  const eligible = courses(contexts).flatMap((course) => DISTANCES.map((distance) => ({ course, distance }))).filter(({ course, distance }) => YEARS.every((year) => groupRows(contexts, year, course, distance).filter(hasDraw).length >= MATERIAL_GROUP));
  for (const { course, distance } of eligible) {
    lines.push(`### ${course} - ${distance}`, "");
    table(lines, YEARS.flatMap((year) => {
      const rows = groupRows(contexts, year, course, distance).filter(hasDraw), rankMap = ranks(rows, (row) => row.features.bestPerformanceLast3), rank1 = rows.filter((row) => rankMap.get(id(row)) === 1);
      return [
        { year, population: "all runners", ...columns(metrics(rows), true) },
        { year, population: "Best-L3 rank 1", ...columns(metrics(rank1), true) },
        ...RELATIVE_DRAWS.map((draw) => ({ year, population: `Best-L3 rank 1 + ${draw}`, ...columns(metrics(rank1.filter((row) => relativeDraw(row) === draw)), true) })),
      ];
    }));
  }
  if (!eligible.length) lines.push("No course/distance group met the material-size rule in both years.", "");
}

function decision(lines: string[], contexts: Context[], effects: Effect[]) {
  section(lines, "Decision");
  const pairs = effects.filter((x) => x.year === "2025").map((a) => ({ a, b: effects.find((x) => x.year === "2026" && x.course === a.course && x.distance === a.distance && x.kind === a.kind)! }));
  const stable = pairs.filter(({ a, b }) => Math.min(a.low.bets, a.high.bets, b.low.bets, b.high.bets) >= SMALL_BAND && sameNonZeroSign(diff(a.low.strike, a.high.strike), diff(b.low.strike, b.high.strike)) && sameNonZeroSign(diff(a.low.ae, a.high.ae), diff(b.low.ae, b.high.ae)));
  const absolute = stable.filter((x) => x.a.kind === "absolute"), relative = stable.filter((x) => x.a.kind === "relative");
  const strongest = [...stable].sort((x, y) => replicatedStrength(y) - replicatedStrength(x)).slice(0, 6);
  const w = pairs.find((x) => x.a.course === "Wolverhampton" && x.a.distance === "sprint" && x.a.kind === "absolute")!;
  const wReplicates = sameNonZeroSign(diff(w.a.low.strike, w.a.high.strike), diff(w.b.low.strike, w.b.high.strike)) && sameNonZeroSign(diff(w.a.low.ae, w.a.high.ae), diff(w.b.low.ae, w.b.high.ae));
  const stableLabels = strongest.map(({ a, b }) => `${a.course} ${a.distance} (${a.kind}, ${((diff(a.low.ae, a.high.ae) ?? 0) > 0 && (diff(b.low.ae, b.high.ae) ?? 0) > 0) ? "low" : "high"} favored)`).join("; ") || "none with >=100 runners in every compared band";
  const bestL3Summary = bestL3ReplicationSummary(contexts);
  lines.push(
    `1. Wolverhampton sprint low draw ${wReplicates ? "does" : "does not"} replicate directionally on both strike and A/E. Low-versus-high strike differences are ${pp(diff(w.a.low.strike, w.a.high.strike))} / ${pp(diff(w.b.low.strike, w.b.high.strike))}; A/E differences are ${num(diff(w.a.low.ae, w.a.high.ae))} / ${num(diff(w.b.low.ae, w.b.high.ae))}.`,
    `2. The clearest directionally repeated, non-sparse effects by minimum cross-year A/E separation are: ${stableLabels}. This ranking uses stability magnitude, not profitability.`,
    `3. Relative thirds produced ${relative.length} repeated non-sparse effects versus ${absolute.length} for absolute low/high bands. This comparison indicates which representation is more consistently informative, not which should be traded.`,
    `4. Best-L3 does behave differently by draw in individual groups, but there is no general interaction: ${bestL3Summary.repeated}/${bestL3Summary.testable} materially sized groups with at least 30 rank-1 runners in each low/high comparison repeated the same strike and A/E direction. Repeated groups: ${bestL3Summary.labels || "none"}.`,
    `5. ${relative.length ? "Relative draw has enough repeated course-specific structure to justify a later, separately specified Research feasibility study, but not immediate promotion." : "Relative draw does not show enough repeated non-sparse structure to justify adding a Research filter yet."}`,
    "6. Draw effects are expected to be course-and-distance specific; disagreement between groups and years is evidence against a general AW-wide draw rule.",
    "",
    `Cache coverage was ${contexts.map((x) => `${x.year}: ${x.coverage}`).join("; ")}.`,
    "",
  );
}

function replicatedStrength(pair: { a: Effect; b: Effect }) {
  return Math.min(Math.abs(diff(pair.a.low.ae, pair.a.high.ae) ?? 0), Math.abs(diff(pair.b.low.ae, pair.b.high.ae) ?? 0));
}

function bestL3ReplicationSummary(contexts: Context[]) {
  let testable = 0, repeated = 0;
  const labels: string[] = [];
  for (const course of courses(contexts)) for (const distance of DISTANCES) {
    const comparisons = YEARS.map((year) => {
      const rows = groupRows(contexts, year, course, distance).filter(hasDraw), rankMap = ranks(rows, (row) => row.features.bestPerformanceLast3), rank1 = rows.filter((row) => rankMap.get(id(row)) === 1);
      return { low: metrics(rank1.filter((row) => relativeDraw(row) === "low third")), high: metrics(rank1.filter((row) => relativeDraw(row) === "high third")) };
    });
    if (Math.min(...comparisons.flatMap((x) => [x.low.bets, x.high.bets])) < 30) continue;
    testable += 1;
    if (sameNonZeroSign(diff(comparisons[0]!.low.strike, comparisons[0]!.high.strike), diff(comparisons[1]!.low.strike, comparisons[1]!.high.strike)) && sameNonZeroSign(diff(comparisons[0]!.low.ae, comparisons[0]!.high.ae), diff(comparisons[1]!.low.ae, comparisons[1]!.high.ae))) {
      repeated += 1;
      labels.push(`${course} ${distance}`);
    }
  }
  return { testable, repeated, labels: labels.join("; ") };
}

function metrics(rows: Row[]) { const entries = settled(rows.filter(hasDraw)), winners = entries.filter((x) => x.row.outcome.won), returns = winners.reduce((sum, x) => sum + x.settlement.grossReturn, 0), capped = winners.reduce((sum, x) => sum + settleSelection(x.row.outcome, { maxFractionalOdds: CAP - 1 })!.grossReturn, 0), expected = entries.reduce((sum, x) => sum + 1 / x.settlement.settlementOddsDecimal, 0); return { bets: entries.length, winners: winners.length, strike: rate(winners.length, entries.length), roi: rate(returns - entries.length, entries.length), cappedRoi: rate(capped - entries.length, entries.length), ae: rate(winners.length, expected) }; }
function columns(m: ReturnType<typeof metrics>, capped = false) { return { runners: m.bets, winners: m.winners, strike: pct(m.strike), ROI: pct(m.roi), ...(capped ? { "capped ROI": pct(m.cappedRoi) } : {}), "A/E": num(m.ae) }; }
function settled(rows: Row[]) { return rows.map((row) => ({ row, settlement: settleSelection(row.outcome) })).filter((x): x is Settled => x.settlement !== null); }
function ranks(rows: Row[], getter: (row: Row) => number | null) { const output = new Map<string, number>(); for (const race of group(rows, raceId).values()) { const sorted = race.map((row) => ({ row, value: getter(row) })).filter((x): x is { row: Row; value: number } => valid(x.value)).sort((a, b) => b.value - a.value || id(a.row).localeCompare(id(b.row))); let previous: number | null = null, priorRank = 0; sorted.forEach((x, index) => { const rank = x.value === previous ? priorRank : index + 1; output.set(id(x.row), rank); previous = x.value; priorRank = rank; }); } return output; }
function groupRows(contexts: Context[], year: Year, course: string, distance: string) { return contexts.find((x) => x.year === year)!.rows.filter((row) => row.features.courseName === course && distanceBand(row) === distance); }
function courses(contexts: Context[]) { return [...new Set(contexts.flatMap((x) => x.rows.map((row) => row.features.courseName)))].sort(); }
function courseDistance(row: Row) { return `${row.features.courseName}\0${distanceBand(row)}`; }
function distanceBand(row: Row) { const yards = row.features.distanceYards; return yards === null ? "unknown" : yards <= 1320 ? "sprint" : yards <= 1760 ? "mile-ish" : yards <= 2640 ? "middle distance" : "staying"; }
function absoluteDraw(row: Row) { const draw = row.features.draw; return draw === null ? "missing" : draw <= 3 ? "1-3" : draw <= 6 ? "4-6" : draw <= 9 ? "7-9" : "10+"; }
function relativeDraw(row: Row) { const draw = row.features.draw, size = fieldSize(row); if (draw === null || size === null || size <= 0) return "missing"; const third = Math.ceil(size / 3); return draw <= third ? "low third" : draw <= third * 2 ? "middle third" : "high third"; }
function wolverhamptonDraw(row: Row) { const draw = row.features.draw; return draw === null ? "missing" : draw <= 3 ? "1-3" : draw <= 6 ? "4-6" : "7+"; }
function fieldSize(row: Row) { return row.features.actualRunnerCount ?? row.features.declaredRunnerCount; }
function hasDraw(row: Row): boolean { return row.features.draw !== null && row.features.draw > 0; }
function formatDistance(yards: number) { const furlongs = yards / 220; return Number.isInteger(furlongs) ? `${furlongs}f` : `${furlongs.toFixed(1)}f`; }
function id(row: Row) { return row.features.targetRunnerId; }
function raceId(row: Row) { return row.features.targetRaceId; }
function group<T>(values: T[], key: (value: T) => string) { const output = new Map<string, T[]>(); for (const value of values) { const k = key(value); output.set(k, [...(output.get(k) ?? []), value]); } return output; }
function distinct<T>(values: T[], key: (value: T) => string) { return new Set(values.map(key)).size; }
function valid(value: number | null | undefined): value is number { return value !== null && value !== undefined && Number.isFinite(value); }
function rate(a: number, b: number) { return b ? a / b : null; }
function diff(a: number | null, b: number | null) { return a === null || b === null ? null : a - b; }
function sameNonZeroSign(a: number | null, b: number | null) { return a !== null && b !== null && Math.sign(a) !== 0 && Math.sign(a) === Math.sign(b); }
function average(values: number[]) { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null; }
function pct(value: number | null) { return value === null || !Number.isFinite(value) ? "-" : `${(value * 100).toFixed(2)}%`; }
function pp(value: number | null) { return value === null ? "-" : `${(value * 100).toFixed(2)} pp`; }
function num(value: number | null, digits = 3) { return value === null || !Number.isFinite(value) ? "-" : value.toFixed(digits); }
function section(lines: string[], title: string) { lines.push(`## ${title}`, ""); }
function table(lines: string[], rows: Array<Record<string, unknown>>) { if (!rows.length) { lines.push("No rows.", ""); return; } const headers = Object.keys(rows[0]!); lines.push(`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map((row) => `| ${headers.map((header) => String(row[header] ?? "-").replace(/\|/g, "\\|")).join(" | ")} |`), ""); }

await main();
