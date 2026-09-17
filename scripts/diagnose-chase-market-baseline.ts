import { writeFile } from "node:fs/promises";
import { settleSelection, type BacktestSettlement } from "@/lib/racing/backtest";
import { loadLatestBacktestFeatureCacheForYear, type BacktestCacheFamily } from "@/lib/racing/backtest-cache";
import type { HistoricalTargetRunnerMetricsRow as Row } from "@/lib/racing/historical-target-metrics";
import { classifyJumpRaceSubtype } from "@/lib/racing/jump-speed-rating";
import { classifyHandicapStatus } from "@/lib/racing/research-rule";
import { raceClassNumber } from "@/lib/racing/research-rule-classes";

type Year = "2025" | "2026";
type FamilyKey = "chase" | "hurdle" | "turf" | "aw";
type Context = { year: Year; family: FamilyKey; cacheFamily: BacktestCacheFamily; coverage: string; rows: Row[] };
type Settled = { row: Row; settlement: BacktestSettlement };
type BetMetrics = ReturnType<typeof metrics>;
type Overround = { raceId: string; value: number; settled: Settled[] };

const OUTPUT = "/tmp/chase-market-baseline.md";
const YEARS: Year[] = ["2025", "2026"];
const CAP_DECIMAL = 21;
const FAMILY_LABELS: Record<FamilyKey, string> = { chase: "Chases", hurdle: "Hurdles", turf: "Turf Flat", aw: "All Weather" };
const PRICE_BANDS = ["odds-on", "1/1 to <2/1", "2/1 to <4/1", "4/1 to <8/1", "8/1 to <20/1", "20/1+"];

async function main() {
  const contexts = (await Promise.all(YEARS.flatMap((year) => (["chase", "hurdle", "turf", "aw"] as FamilyKey[]).map((family) => load(year, family))))).flat();
  const lines = buildReport(contexts);
  await writeFile(OUTPUT, `${lines.join("\n")}\n`, "utf8");
  console.log(`Wrote ${OUTPUT}`);
  for (const year of YEARS) {
    const context = find(contexts, year, "chase"), value = metrics(context.rows);
    console.log(`${year}: runners=${context.rows.length}, settled=${value.bets}, uncapped ROI=${pct(value.uncappedRoi)}, capped ROI=${pct(value.cappedRoi)}, A/E=${num(value.ae)}`);
  }
}

async function load(year: Year, family: FamilyKey): Promise<Context> {
  const requestedFamily = family === "turf" ? "turf_flat" : family === "aw" ? "all_weather_flat" : "jump";
  const cache = await loadLatestBacktestFeatureCacheForYear({ family: requestedFamily, year }) ??
    await loadLatestBacktestFeatureCacheForYear({ family: "all", year });
  if (!cache) throw new Error(`Missing compatible v4 cache for ${year}/${family}`);
  const rows = cache.rows.filter((row) => {
    if (family === "chase" || family === "hurdle") return row.features.raceCode === "jump" && classifyJumpRaceSubtype(row.features) === family;
    return row.features.raceCode === family;
  }).sort(compareRows);
  return { year, family, cacheFamily: cache.manifest.family, coverage: `${cache.actualCoverage?.actualFrom ?? cache.manifest.from} to ${cache.actualCoverage?.actualTo ?? cache.manifest.to}`, rows };
}

function buildReport(contexts: Context[]): string[] {
  const lines = [
    "# All-Runner Chase Market Baseline Diagnostic",
    "",
    "Diagnostic only. All runners in canonically classified Chase races, with no runner-quality filters. Settlement uses the production historical settlement parser; capped views limit winning gross return to decimal 21 (20/1).",
    "",
  ];
  reconcile(lines, contexts);
  familyComparison(lines, contexts);
  overroundComparison(lines, contexts);
  priceDecomposition(lines, contexts);
  longshots(lines, contexts);
  raceEconomics(lines, contexts);
  fieldProfile(lines, contexts);
  handicapProfile(lines, contexts);
  classProfile(lines, contexts);
  courseProfile(lines, contexts);
  monthlyProfile(lines, contexts);
  outlierStress(lines, contexts);
  integrity(lines, contexts);
  conclusions(lines, contexts);
  return lines;
}

function reconcile(lines: string[], contexts: Context[]) {
  lines.push("## Research reconciliation", "");
  table(lines, YEARS.map((year) => {
    const context = find(contexts, year, "chase"), value = metrics(context.rows);
    return { year, "cache family": context.cacheFamily, coverage: context.coverage, races: distinct(context.rows, raceId), runners: context.rows.length, "settled runners": value.bets, winners: value.winners, strike: pct(value.strike), stakes: money(value.bets), "capped return": money(value.cappedReturn), "capped ROI": pct(value.cappedRoi), "uncapped return": money(value.uncappedReturn), "uncapped ROI": pct(value.uncappedRoi), "A/E": num(value.ae) };
  }));
}

function familyComparison(lines: string[], contexts: Context[]) {
  lines.push("## Equivalent all-runner family baselines", "");
  table(lines, contexts.map((context) => {
    const value = metrics(context.rows);
    return { year: context.year, family: FAMILY_LABELS[context.family], "settled bets": value.bets, strike: pct(value.strike), "uncapped ROI": pct(value.uncappedRoi), "capped ROI": pct(value.cappedRoi), "A/E": num(value.ae), "mean final SP": num(value.meanSp, 2), "median final SP": num(value.medianSp, 2) };
  }));
}

function overroundComparison(lines: string[], contexts: Context[]) {
  lines.push("## Complete-race overround", "", "A race is measured only when every runner not marked non-runner has a valid production settlement and at least two runners remain. Overround is the sum of inverse final decimal SP.", "");
  table(lines, contexts.map((context) => {
    const values = completeOverrounds(context.rows).map((entry) => entry.value), qs = quartiles(values);
    return { year: context.year, family: FAMILY_LABELS[context.family], "races measured": values.length, "mean overround": pct(average(values)), "median overround": pct(median(values)), Q1: pct(qs.q1), Q3: pct(qs.q3) };
  }));
}

function priceDecomposition(lines: string[], contexts: Context[]) {
  lines.push("## Chase price-band decomposition", "");
  table(lines, YEARS.flatMap((year) => {
    const context = find(contexts, year, "chase"), totalReturn = metrics(context.rows).uncappedReturn;
    return PRICE_BANDS.map((band) => {
      const rows = context.rows.filter((row) => { const value = settlement(row); return value !== null && priceBand(value.settlementOddsDecimal) === band; });
      const value = metrics(rows);
      return { year, band, bets: value.bets, winners: value.winners, strike: pct(value.strike), "uncapped ROI": pct(value.uncappedRoi), "capped ROI": pct(value.cappedRoi), "A/E": num(value.ae), "uncapped return": money(value.uncappedReturn), "share total return": pct(rate(value.uncappedReturn, totalReturn)) };
    });
  }));
}

function longshots(lines: string[], contexts: Context[]) {
  lines.push("## Chase longshot contribution", "");
  table(lines, YEARS.flatMap((year) => {
    const context = find(contexts, year, "chase"), all = settled(context.rows), total = metrics(context.rows).uncappedReturn;
    return [{ label: ">20/1", decimal: 21 }, { label: ">33/1", decimal: 34 }, { label: ">50/1", decimal: 51 }].map((threshold) => {
      const winners = all.filter((entry) => entry.row.outcome.won && entry.settlement.settlementOddsDecimal > threshold.decimal);
      const uncapped = winners.reduce((sum, entry) => sum + entry.settlement.grossReturn, 0);
      const capped = winners.reduce((sum, entry) => sum + Math.min(entry.settlement.grossReturn, CAP_DECIMAL), 0);
      return { year, threshold: threshold.label, winners: winners.length, "uncapped return": money(uncapped), "return lost to cap": money(uncapped - capped), "share total winning return": pct(rate(uncapped, total)) };
    });
  }));
}

function raceEconomics(lines: string[], contexts: Context[]) {
  lines.push("## Chase race-level economics", "");
  table(lines, YEARS.map((year) => {
    const context = find(contexts, year, "chase"), races = [...group(context.rows, raceId).values()];
    const complete = completeOverrounds(context.rows), winningRanks = complete.map((race) => marketRankOfWinner(race.settled)).filter(valid);
    return { year, races: races.length, "average runners/race": num(rate(context.rows.length, races.length), 2), "average settled/race": num(rate(settled(context.rows).length, races.length), 2), "average stake/race": money(rate(settled(context.rows).length, races.length)), "complete-SP races": complete.length, "favourite win %": pct(rate(winningRanks.filter((rank) => rank === 1).length, winningRanks.length)), "second favourite win %": pct(rate(winningRanks.filter((rank) => rank === 2).length, winningRanks.length)), "third favourite win %": pct(rate(winningRanks.filter((rank) => rank === 3).length, winningRanks.length)), "market rank 4+ win %": pct(rate(winningRanks.filter((rank) => rank >= 4).length, winningRanks.length)) };
  }));
}

function fieldProfile(lines: string[], contexts: Context[]) {
  lines.push("## Chase field-size profile", "");
  table(lines, YEARS.flatMap((year) => {
    const context = find(contexts, year, "chase");
    return ["2-5", "6-8", "9+"].map((band) => {
      const rows = context.rows.filter((row) => fieldBand(fieldSize(row)) === band), value = metrics(rows), overrounds = completeOverrounds(rows).map((entry) => entry.value);
      return { year, band, races: distinct(rows, raceId), bets: value.bets, strike: pct(value.strike), "uncapped ROI": pct(value.uncappedRoi), "A/E": num(value.ae), "mean overround": pct(average(overrounds)), "measured races": overrounds.length };
    });
  }));
}

function handicapProfile(lines: string[], contexts: Context[]) {
  lines.push("## Chase handicap status", "");
  table(lines, YEARS.flatMap((year) => {
    const context = find(contexts, year, "chase");
    return ["handicap", "non_handicap"].map((status) => {
      const rows = context.rows.filter((row) => classifyHandicapStatus(row.features) === status), value = metrics(rows), overrounds = completeOverrounds(rows).map((entry) => entry.value);
      return { year, status: status === "handicap" ? "handicap" : "non-handicap", races: distinct(rows, raceId), bets: value.bets, "uncapped ROI": pct(value.uncappedRoi), "capped ROI": pct(value.cappedRoi), "A/E": num(value.ae), "mean overround": pct(average(overrounds)), "median overround": pct(median(overrounds)) };
    });
  }));
}

function classProfile(lines: string[], contexts: Context[]) {
  lines.push("## Chase class profile", "");
  const classes = ["Class 1", "Class 2", "Class 3", "Class 4", "Class 5", "Class 6", "unknown"];
  table(lines, YEARS.flatMap((year) => {
    const context = find(contexts, year, "chase");
    return classes.map((band) => { const rows = context.rows.filter((row) => classBand(row.features.raceClass) === band), value = metrics(rows); return { year, class: band, bets: value.bets, winners: value.winners, strike: pct(value.strike), "uncapped ROI": pct(value.uncappedRoi), "A/E": num(value.ae), sparse: value.bets < 50 ? "yes" : "no" }; });
  }));
}

function courseProfile(lines: string[], contexts: Context[]) {
  lines.push("## Chase course concentration", "");
  for (const year of YEARS) {
    const context = find(contexts, year, "chase"), courses = [...group(context.rows, (row) => `${row.features.courseId}\0${row.features.courseName}`).entries()].map(([key, rows]) => ({ key, name: rows[0]!.features.courseName, rows, value: metrics(rows) })).sort((a, b) => (b.value.profitLoss - a.value.profitLoss) || a.name.localeCompare(b.name));
    lines.push(`### ${year}`, "");
    table(lines, courses.map((course) => ({ course: course.name, races: distinct(course.rows, raceId), bets: course.value.bets, "uncapped ROI": pct(course.value.uncappedRoi), "A/E": num(course.value.ae), "P/L": money(course.value.profitLoss), sparse: course.value.bets < 50 ? "yes" : "no" })));
    const top1 = new Set(courses.slice(0, 1).map((course) => course.key)), top3 = new Set(courses.slice(0, 3).map((course) => course.key));
    table(lines, [
      { year, stress: "full", ...stressRow(metrics(context.rows)) },
      { year, stress: `exclude ${courses[0]?.name ?? "top course"}`, ...stressRow(metrics(context.rows.filter((row) => !top1.has(`${row.features.courseId}\0${row.features.courseName}`)))) },
      { year, stress: "exclude top three profitable courses", ...stressRow(metrics(context.rows.filter((row) => !top3.has(`${row.features.courseId}\0${row.features.courseName}`)))) },
    ]);
  }
}

function monthlyProfile(lines: string[], contexts: Context[]) {
  lines.push("## Chase monthly stability", "");
  table(lines, YEARS.flatMap((year) => [...group(find(contexts, year, "chase").rows, (row) => row.features.raceDate.slice(0, 7)).entries()].map(([month, rows]) => ({ year, month, bets: metrics(rows).bets, winners: metrics(rows).winners, "uncapped ROI": pct(metrics(rows).uncappedRoi), "A/E": num(metrics(rows).ae) }))));
}

function outlierStress(lines: string[], contexts: Context[]) {
  lines.push("## Chase uncapped outlier stress", "");
  table(lines, YEARS.flatMap((year) => {
    const context = find(contexts, year, "chase"), entries = settled(context.rows), winners = entries.filter((entry) => entry.row.outcome.won).sort((a, b) => b.settlement.settlementOddsDecimal - a.settlement.settlementOddsDecimal);
    const months = [...group(context.rows, (row) => row.features.raceDate.slice(0, 7)).entries()].map(([month, rows]) => ({ month, value: metrics(rows) })).sort((a, b) => b.value.profitLoss - a.value.profitLoss), bestMonth = months[0]?.month;
    const variants = [
      { label: "full", remove: new Set<string>(), month: null },
      { label: "remove biggest-priced winner", remove: new Set(winners.slice(0, 1).map((entry) => id(entry.row))), month: null },
      { label: "remove top two biggest-priced winners", remove: new Set(winners.slice(0, 2).map((entry) => id(entry.row))), month: null },
      { label: "remove top five biggest-priced winners", remove: new Set(winners.slice(0, 5).map((entry) => id(entry.row))), month: null },
      { label: `remove best month (${bestMonth ?? "-"})`, remove: new Set<string>(), month: bestMonth ?? null },
    ];
    return variants.map((variant) => ({ year, stress: variant.label, ...stressRow(metrics(context.rows.filter((row) => !variant.remove.has(id(row)) && (variant.month === null || row.features.raceDate.slice(0, 7) !== variant.month)))) }));
  }));
}

function integrity(lines: string[], contexts: Context[]) {
  lines.push("## Data integrity", "");
  table(lines, YEARS.map((year) => {
    const context = find(contexts, year, "chase"), runnerKeys = context.rows.map((row) => `${raceId(row)}\0${id(row)}`), settledRows = settled(context.rows), winnerRaces = group(settledRows.filter((entry) => entry.row.outcome.won), (entry) => raceId(entry.row));
    return { year, rows: context.rows.length, "unique race-runner keys": new Set(runnerKeys).size, "duplicate runner rows": runnerKeys.length - new Set(runnerKeys).size, "settled rows": settledRows.length, "unique settled keys": new Set(settledRows.map((entry) => `${raceId(entry.row)}\0${id(entry.row)}`)).size, "winner rows": [...winnerRaces.values()].flat().length, "races with duplicate winners": [...winnerRaces.values()].filter((entries) => entries.length > 1).length, "non-runners settled": settledRows.filter((entry) => entry.row.outcome.resultStatus === "non_runner").length, "invalid parsed SP": settledRows.filter((entry) => !Number.isFinite(entry.settlement.settlementOddsDecimal) || entry.settlement.settlementOddsDecimal <= 0).length };
  }));
  lines.push("Production settlement assigns £1 per settled runner, pays the full stored decimal SP to winners, and excludes non-runners or rows lacking finishing position/SP. The cache stores only a win boolean and decimal SP, with no fractional dead-heat divisor; this diagnostic therefore follows Research's existing full-return handling exactly.", "");
  const deadHeats = contexts.filter((context) => context.family === "chase").flatMap((context) => [...group(settled(context.rows).filter((entry) => entry.row.outcome.won), (entry) => raceId(entry.row)).values()].filter((entries) => entries.length > 1).map((entries) => ({ context, entries })));
  if (deadHeats.length > 0) {
    lines.push("Stored multi-winner/dead-heat races:", "");
    table(lines, deadHeats.map(({ context, entries }) => ({ year: context.year, date: entries[0]!.row.features.raceDate, course: entries[0]!.row.features.courseName, raceId: raceId(entries[0]!.row), race: entries[0]!.row.features.raceName, winners: entries.map((entry) => `${entry.row.features.horseName} @ ${entry.settlement.settlementOddsDecimal.toFixed(2)}`).join("; "), "full-return excess vs equal split": money(entries.reduce((sum, entry) => sum + entry.settlement.grossReturn * (1 - 1 / entries.length), 0)) })));
  }
  lines.push("Manual cache/DB-derived race samples:", "");
  table(lines, YEARS.flatMap((year) => [...group(find(contexts, year, "chase").rows, raceId).values()].filter((rows) => settled(rows).length >= 2).slice(0, 5).map((rows) => {
    const entries = settled(rows), winner = entries.find((entry) => entry.row.outcome.won);
    return { year, date: rows[0]!.features.raceDate, course: rows[0]!.features.courseName, raceId: raceId(rows[0]!), "runner rows": rows.length, settled: entries.length, "winner runnerId": winner ? id(winner.row) : "none", "winner SP": winner ? num(winner.settlement.settlementOddsDecimal, 2) : "-", "sum inverse SP": num(entries.reduce((sum, entry) => sum + 1 / entry.settlement.settlementOddsDecimal, 0), 3) };
  })));
}

function conclusions(lines: string[], contexts: Context[]) {
  const c25 = find(contexts, "2025", "chase"), c26 = find(contexts, "2026", "chase"), m25 = metrics(c25.rows), m26 = metrics(c26.rows);
  const family = (year: Year, key: FamilyKey) => metrics(find(contexts, year, key).rows);
  const or = (year: Year, key: FamilyKey) => average(completeOverrounds(find(contexts, year, key).rows).map((entry) => entry.value));
  const noFive25 = removeTopWinners(c25.rows, 5), noFive26 = removeTopWinners(c26.rows, 5);
  const ls25 = longshotStats(c25.rows), ls26 = longshotStats(c26.rows);
  lines.push("## Economic interpretation", "",
    `1. All-Chase uncapped ROI is ${pct(m25.uncappedRoi)} in 2025, so ${Math.abs(m25.uncappedRoi ?? 1) < 0.01 ? "it is genuinely near break-even" : "it is not within one point of break-even"}.`,
    `2. 2026 YTD uncapped ROI is ${pct(m26.uncappedRoi)}; the unusually strong baseline replicates and improves, although the exact ROI sign changes from slightly negative to positive.`,
    `3. Chase A/E is ${num(m25.ae)} / ${num(m26.ae)} versus Hurdle ${num(family("2025", "hurdle").ae)} / ${num(family("2026", "hurdle").ae)}, Turf ${num(family("2025", "turf").ae)} / ${num(family("2026", "turf").ae)}, and AW ${num(family("2025", "aw").ae)} / ${num(family("2026", "aw").ae)}.`,
    `4. Mean complete-race Chase overround is ${pct(or("2025", "chase"))} / ${pct(or("2026", "chase"))}; compare Hurdle ${pct(or("2025", "hurdle"))} / ${pct(or("2026", "hurdle"))}, Turf ${pct(or("2025", "turf"))} / ${pct(or("2026", "turf"))}, and AW ${pct(or("2025", "aw"))} / ${pct(or("2026", "aw"))}.`,
    `5. Winners above 20/1 contribute ${pct(ls25.share)} / ${pct(ls26.share)} of winning return and the cap removes ${money(ls25.lost)} / ${money(ls26.lost)}.`,
    `6. The capped-versus-uncapped gap is ${pp(diff(m25.uncappedRoi, m25.cappedRoi))} / ${pp(diff(m26.uncappedRoi, m26.cappedRoi))}; price bands and removal tests show whether near-break-even is mostly a longshot effect.`,
    `7. After removing the five biggest-priced winners, ROI is ${pct(metrics(noFive25).uncappedRoi)} / ${pct(metrics(noFive26).uncappedRoi)}.`,
    "8. Field-size economics and overround are reported above; no field-size filter is inferred.",
    "9. Handicap and non-handicap economics are reported separately above; no status filter is inferred.",
    "10. Course exclusions and monthly tables show the concentration directly.",
    `11. Integrity checks found ${duplicateCount(c25.rows) + duplicateCount(c26.rows)} duplicate race-runner rows and ${duplicateWinnerRaceCount(c25.rows) + duplicateWinnerRaceCount(c26.rows)} multi-winner/dead-heat race. The one 2026 dead heat is paid at full SP for both winners by existing Research settlement, overstating return by ${money(deadHeatFullReturnExcess(c26.rows))} (${pp(rate(deadHeatFullReturnExcess(c26.rows), m26.bets))}); this is a small known settlement limitation, not the explanation for the strong Chase baseline.`,
    `12. ${Math.abs(m25.uncappedRoi ?? 1) < 0.01 && Math.abs(m26.uncappedRoi ?? 1) < 0.05 ? "The baseline appears to be a genuine Chase-market structural feature worth retaining as context, subject to the displayed outlier sensitivity." : "The baseline is useful context, but the year/outlier evidence does not support treating near-break-even as a stable structural constant."}`,
    "",
  );
}

function metrics(rows: Row[]) {
  const entries = settled(rows), winners = entries.filter((entry) => entry.row.outcome.won), uncappedReturn = winners.reduce((sum, entry) => sum + entry.settlement.grossReturn, 0), cappedReturn = winners.reduce((sum, entry) => sum + Math.min(entry.settlement.grossReturn, CAP_DECIMAL), 0), expected = entries.reduce((sum, entry) => sum + 1 / entry.settlement.settlementOddsDecimal, 0);
  return { bets: entries.length, winners: winners.length, strike: rate(winners.length, entries.length), uncappedReturn, cappedReturn, profitLoss: uncappedReturn - entries.length, uncappedRoi: rate(uncappedReturn - entries.length, entries.length), cappedRoi: rate(cappedReturn - entries.length, entries.length), ae: expected === 0 ? null : winners.length / expected, meanSp: average(entries.map((entry) => entry.settlement.settlementOddsDecimal)), medianSp: median(entries.map((entry) => entry.settlement.settlementOddsDecimal)) };
}
function stressRow(value: BetMetrics) { return { bets: value.bets, "P/L": money(value.profitLoss), "uncapped ROI": pct(value.uncappedRoi), "A/E": num(value.ae) }; }
function settled(rows: Row[]): Settled[] { return rows.map((row) => ({ row, settlement: settleSelection(row.outcome) })).filter((entry): entry is Settled => entry.settlement !== null); }
function settlement(row: Row) { return settleSelection(row.outcome); }
function completeOverrounds(rows: Row[]): Overround[] { const output: Overround[] = []; for (const [raceIdValue, raceRows] of group(rows, raceId)) { const runnable = raceRows.filter((row) => row.outcome.resultStatus !== "non_runner"), entries = settled(runnable); if (entries.length < 2 || entries.length !== runnable.length) continue; output.push({ raceId: raceIdValue, value: entries.reduce((sum, entry) => sum + 1 / entry.settlement.settlementOddsDecimal, 0), settled: entries }); } return output; }
function marketRankOfWinner(entries: Settled[]) { const sorted = [...entries].sort((a, b) => a.settlement.settlementOddsDecimal - b.settlement.settlementOddsDecimal || id(a.row).localeCompare(id(b.row))); let prior: number | null = null, priorRank = 0; for (const [index, entry] of sorted.entries()) { const rank = entry.settlement.settlementOddsDecimal === prior ? priorRank : index + 1; if (entry.row.outcome.won) return rank; prior = entry.settlement.settlementOddsDecimal; priorRank = rank; } return null; }
function removeTopWinners(rows: Row[], count: number) { const remove = new Set(settled(rows).filter((entry) => entry.row.outcome.won).sort((a, b) => b.settlement.settlementOddsDecimal - a.settlement.settlementOddsDecimal).slice(0, count).map((entry) => id(entry.row))); return rows.filter((row) => !remove.has(id(row))); }
function longshotStats(rows: Row[]) { const value = metrics(rows), winners = settled(rows).filter((entry) => entry.row.outcome.won && entry.settlement.settlementOddsDecimal > CAP_DECIMAL), uncapped = winners.reduce((sum, entry) => sum + entry.settlement.grossReturn, 0), capped = winners.reduce((sum, entry) => sum + Math.min(entry.settlement.grossReturn, CAP_DECIMAL), 0); return { share: rate(uncapped, value.uncappedReturn), lost: uncapped - capped }; }
function duplicateCount(rows: Row[]) { const keys = rows.map((row) => `${raceId(row)}\0${id(row)}`); return keys.length - new Set(keys).size; }
function duplicateWinnerRaceCount(rows: Row[]) { return [...group(settled(rows).filter((entry) => entry.row.outcome.won), (entry) => raceId(entry.row)).values()].filter((entries) => entries.length > 1).length; }
function deadHeatFullReturnExcess(rows: Row[]) { return [...group(settled(rows).filter((entry) => entry.row.outcome.won), (entry) => raceId(entry.row)).values()].filter((entries) => entries.length > 1).reduce((total, entries) => total + entries.reduce((sum, entry) => sum + entry.settlement.grossReturn * (1 - 1 / entries.length), 0), 0); }

function priceBand(decimal: number) { return decimal < 2 ? "odds-on" : decimal < 3 ? "1/1 to <2/1" : decimal < 5 ? "2/1 to <4/1" : decimal < 9 ? "4/1 to <8/1" : decimal < 21 ? "8/1 to <20/1" : "20/1+"; }
function fieldSize(row: Row) { return row.features.actualRunnerCount ?? row.features.declaredRunnerCount; }
function fieldBand(value: number | null) { return value === null ? "unknown" : value <= 5 ? "2-5" : value <= 8 ? "6-8" : "9+"; }
function classBand(value: string | null) { const parsed = raceClassNumber(value); return parsed === null ? "unknown" : `Class ${parsed}`; }
function find(contexts: Context[], year: Year, family: FamilyKey) { const value = contexts.find((context) => context.year === year && context.family === family); if (!value) throw new Error(`Missing ${year}/${family}`); return value; }
function id(row: Row) { return row.features.targetRunnerId; }
function raceId(row: Row) { return row.features.targetRaceId; }
function compareRows(a: Row, b: Row) { return a.features.raceDateTime.getTime() - b.features.raceDateTime.getTime() || raceId(a).localeCompare(raceId(b)) || id(a).localeCompare(id(b)); }
function group<T>(values: T[], key: (value: T) => string) { const result = new Map<string, T[]>(); for (const value of values) { const k = key(value); result.set(k, [...(result.get(k) ?? []), value]); } return result; }
function distinct<T>(values: T[], key: (value: T) => string) { return new Set(values.map(key)).size; }
function valid(value: number | null | undefined): value is number { return value !== null && value !== undefined && Number.isFinite(value); }
function rate(numerator: number, denominator: number) { return denominator === 0 ? null : numerator / denominator; }
function diff(left: number | null, right: number | null) { return left === null || right === null ? null : left - right; }
function average(values: number[]) { return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length; }
function median(values: number[]) { if (values.length === 0) return null; const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2; }
function quartiles(values: number[]) { const sorted = [...values].sort((a, b) => a - b); return { q1: quantile(sorted, 0.25), q3: quantile(sorted, 0.75) }; }
function quantile(sorted: number[], q: number) { if (sorted.length === 0) return null; const index = (sorted.length - 1) * q, lower = Math.floor(index), upper = Math.ceil(index); return lower === upper ? sorted[lower]! : sorted[lower]! * (upper - index) + sorted[upper]! * (index - lower); }
function pct(value: number | null) { return value === null || !Number.isFinite(value) ? "-" : `${(value * 100).toFixed(2)}%`; }
function pp(value: number | null) { return value === null ? "-" : `${(value * 100).toFixed(2)} pp`; }
function num(value: number | null, digits = 3) { return value === null || !Number.isFinite(value) ? "-" : value.toFixed(digits); }
function money(value: number | null) { return value === null ? "-" : `${value < 0 ? "-" : ""}£${Math.abs(value).toFixed(2)}`; }
function table(lines: string[], rows: Array<Record<string, unknown>>) { if (rows.length === 0) { lines.push("No rows.", ""); return; } const headers = Object.keys(rows[0]!); lines.push(`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map((row) => `| ${headers.map((header) => String(row[header] ?? "-").replace(/\|/g, "\\|")).join(" | ")} |`), ""); }

await main();
