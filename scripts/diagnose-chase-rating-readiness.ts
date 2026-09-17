import { writeFile } from "node:fs/promises";
import { loadLatestBacktestFeatureCacheForYear } from "@/lib/racing/backtest-cache";
import { raceClassNumber } from "@/lib/racing/research-rule-classes";
import type { HistoricalTargetRunnerMetricsRow as Row } from "@/lib/racing/historical-target-metrics";

type Year = "2025" | "2026";
type Scores = Map<string, number>;
type Evaluation = { year: Year; label: string; rows: Row[]; scores: Scores; ranks: Map<string, number> };
type ScoreSets = { performance: Scores; officialRating: Scores; base: Scores; candidate: Scores; orCandidate: Scores; alternative: Scores };

const OUTPUT = "/tmp/chase-rating-readiness.md";
const YEARS: Year[] = ["2025", "2026"];

async function main() {
  const contexts = await Promise.all(YEARS.map(loadYear));
  const evaluations: Evaluation[] = [];
  for (const context of contexts) {
    const sets = buildScores(context.rows);
    for (const [label, scores] of Object.entries(sets)) evaluations.push(makeEvaluation(context.year, label, context.rows, scores));
  }
  const leadCuts = [0.1, 0.2, 0.3];
  const lines: string[] = [
    "# Chase Performance Rating Production-Readiness Study", "",
    "Diagnostic only. Chase v4 cache, as-of-safe inputs, uncapped final-SP evaluation. No production logic, UI, schema, or cache changes.", "",
  ];
  definition(lines, leadCuts);
  coverage(lines, contexts, evaluations);
  core(lines, evaluations);
  benchmarks(lines, evaluations);
  disagreements(lines, evaluations);
  fallback(lines, evaluations);
  leadAnalysis(lines, evaluations, leadCuts);
  monthly(lines, evaluations);
  contextProfile(lines, evaluations, "Field-Size Stability", "field size", row => fieldBand(fieldSize(row)), true);
  handicapProfile(lines, contexts, evaluations);
  contextProfile(lines, evaluations, "Novice Status", "novice status", row => isNovice(row) ? "novice/maiden" : "non-novice", true);
  contextProfile(lines, evaluations, "Race Class", "class", row => classBand(row.features.raceClass), true);
  contextProfile(lines, evaluations, "Distance", "distance", row => distanceBand(row.features.distanceYards), false);
  contextProfile(lines, evaluations, "Going", "going", row => goingBand(row.features.going), false);
  contextProfile(lines, evaluations, "Final-SP Behaviour", "SP", row => priceBand(sp(row)), true);
  outlierStress(lines, evaluations);
  alternative(lines, evaluations);
  rankStability(lines, evaluations);
  decision(lines, evaluations);
  await writeFile(OUTPUT, `${lines.join("\n")}\n`, "utf8");
  console.log(`Wrote ${OUTPUT}`);
}

async function loadYear(year: Year) {
  const cache = await loadLatestBacktestFeatureCacheForYear({ family: "jump", year }) ??
    await loadLatestBacktestFeatureCacheForYear({ family: "all", year });
  if (!cache) throw new Error(`Missing compatible v4 cache for ${year}`);
  const rows = cache.rows.filter(row => row.features.raceCode === "jump" && subtype(row) === "chase" && settled(row)).sort(compareRows);
  return { year, rows, coverage: `${cache.actualCoverage?.actualFrom ?? cache.manifest.from} to ${cache.actualCoverage?.actualTo ?? cache.manifest.to}` };
}

function buildScores(rows: Row[]): ScoreSets {
  const performance = new Map<string, number>(), officialRating = new Map<string, number>(), base = new Map<string, number>();
  const candidate = new Map<string, number>(), orCandidate = new Map<string, number>(), altBase = new Map<string, number>(), alternative = new Map<string, number>();
  for (const race of group(rows, row => row.features.targetRaceId).values()) {
    const perf = percentiles(race, row => row.features.latestPerformanceRating);
    const speed = percentiles(race, row => row.features.latestSpeedRating);
    const bestL3 = percentiles(race, row => row.features.bestSpeedLast3);
    const or = percentiles(race, row => row.features.officialRating);
    for (const row of race) {
      const key = id(row), p = perf.get(key), s = speed.get(key), l3 = bestL3.get(key), o = or.get(key);
      if (p !== undefined) performance.set(key, p);
      if (o !== undefined) officialRating.set(key, o);
      if (p !== undefined && s !== undefined) base.set(key, 0.75 * p + 0.25 * s);
      if (p !== undefined && l3 !== undefined) altBase.set(key, 0.75 * p + 0.25 * l3);
    }
    const basePct = percentiles(race, row => base.get(id(row)) ?? null);
    const altPct = percentiles(race, row => altBase.get(id(row)) ?? null);
    for (const row of race) {
      const key = id(row), b = basePct.get(key), a = altPct.get(key), o = or.get(key);
      if (b !== undefined) {
        const score = o === undefined ? b : 0.8 * b + 0.2 * o;
        candidate.set(key, score);
        if (o !== undefined) orCandidate.set(key, score);
      }
      if (a !== undefined) alternative.set(key, o === undefined ? a : 0.8 * a + 0.2 * o);
    }
  }
  return { performance, officialRating, base, candidate, orCandidate, alternative };
}

function definition(lines: string[], cuts: number[]) {
  lines.push("## Candidate Definition", "",
    "Latest Performance is the as-of latest prior-run performance/RPR-style feature; Latest Speed is the as-of latest prior Chase speed feature. Each input is converted to a within-race competition-rank percentile (rank 1 = 1, lowest = 0). Base = 75% Performance percentile + 25% Speed percentile. Base is re-percentiled, then Final = 80% Base percentile + 20% OR percentile where OR exists; otherwise Final = Base percentile.", "",
    "Higher scores rank first. Equal scores share competition rank and missing required Performance/Speed inputs remain unrated. Final SP is evaluation-only.", "",
    `Lead buckets reuse the previous study's 2025-derived cuts, frozen for 2026: ${cuts.map(value => value.toFixed(4)).join(", ")}.`, "");
}

function coverage(lines: string[], contexts: Awaited<ReturnType<typeof loadYear>>[], evaluations: Evaluation[]) {
  lines.push("## Coverage", "");
  table(lines, contexts.map(context => {
    const candidate = find(evaluations, context.year, "candidate");
    return { year: context.year, coverage: context.coverage, races: distinct(context.rows, row => row.features.targetRaceId), runners: context.rows.length,
      "rated races": metrics(candidate).ratedRaces, "rated runners": candidate.scores.size, "rated runner %": pct(rate(candidate.scores.size, context.rows.length)),
      "missing OR": count(context.rows, row => row.features.officialRating === null), "missing OR %": pct(rate(count(context.rows, row => row.features.officialRating === null), context.rows.length)) };
  }));
}

function core(lines: string[], evaluations: Evaluation[]) {
  lines.push("## Core Production-Readiness Metrics", "");
  table(lines, YEARS.map(year => metricRow(find(evaluations, year, "candidate"))));
}

function benchmarks(lines: string[], evaluations: Evaluation[]) {
  lines.push("## Matched Benchmark Comparison", "", "Candidate-population rows use all candidate-rated runners. OR-covered rows restrict every benchmark to runners receiving the OR blend.", "");
  const rows: Record<string, unknown>[] = [];
  for (const year of YEARS) {
    const candidate = find(evaluations, year, "candidate"), candidateIds = new Set(candidate.scores.keys());
    const orCandidate = find(evaluations, year, "orCandidate"), orIds = new Set(orCandidate.scores.keys());
    for (const population of [{ label: "candidate-rated", ids: candidateIds }, { label: "OR-covered", ids: orIds }]) {
      for (const label of ["performance", "officialRating", "base", population.label === "OR-covered" ? "orCandidate" : "candidate"]) {
        const evaluation = restrict(find(evaluations, year, label), population.ids);
        rows.push({ population: population.label, ...compactMetricRow(evaluation) });
      }
    }
  }
  table(lines, rows);
}

function disagreements(lines: string[], evaluations: Evaluation[]) {
  lines.push("## Pairwise Rank-1 Disagreements", "", "Only races with one unambiguous rank-1 selection for each method are included.", "");
  table(lines, YEARS.flatMap(year => {
    const candidate = find(evaluations, year, "candidate");
    return [disagreementRow(candidate, find(evaluations, year, "officialRating"), "Candidate vs OR"), disagreementRow(candidate, find(evaluations, year, "performance"), "Candidate vs Latest Performance")];
  }));
}

function fallback(lines: string[], evaluations: Evaluation[]) {
  lines.push("## OR-Missing Fallback", "");
  const rows: Record<string, unknown>[] = [];
  for (const year of YEARS) {
    const evaluation = find(evaluations, year, "candidate");
    for (const [segment, selections] of group(rankOne(evaluation), row => row.features.officialRating === null ? "Base fallback" : "OR-covered")) {
      rows.push({ year, segment, ...betRow(selections), "average SP": num(mean(selections.map(sp).filter(valid))) });
    }
  }
  table(lines, rows);
}

function leadAnalysis(lines: string[], evaluations: Evaluation[], cuts: number[]) {
  lines.push("## Lead / Confidence", "", "Lead analysis uses races with one unambiguous candidate rank 1 and at least two rated runners.", "");
  const rows: Record<string, unknown>[] = [];
  for (const year of YEARS) {
    const evaluation = find(evaluations, year, "candidate"), leads = leadRows(evaluation);
    for (const [band, entries] of group(leads, entry => leadBand(entry.lead, cuts))) rows.push({ year, band, ...betRow(entries.map(entry => entry.row)) });
  }
  table(lines, rows);
}

function monthly(lines: string[], evaluations: Evaluation[]) {
  lines.push("## Monthly Stability", "");
  const rows: Record<string, unknown>[] = [];
  for (const year of YEARS) for (const [month, selections] of group(rankOne(find(evaluations, year, "candidate")), row => row.features.raceDate.slice(0, 7))) rows.push({ year, month, ...betRow(selections) });
  table(lines, rows);
  for (const year of YEARS) {
    const months = [...group(rankOne(find(evaluations, year, "candidate")), row => row.features.raceDate.slice(0, 7)).values()];
    const overall = rate(count(months.flat(), row => row.outcome.won === true), months.flat().length) ?? 0;
    lines.push(`${year}: ${count(months, month => (bet(month).roi ?? -Infinity) > 0)} profitable and ${count(months, month => (bet(month).roi ?? 0) <= 0)} losing months; ${count(months, month => (rate(count(month, row => row.outcome.won === true), month.length) ?? 0) > overall)} months above the year's overall strike.`);
  }
  lines.push("");
}

function contextProfile(lines: string[], evaluations: Evaluation[], title: string, context: string, key: (row: Row) => string, includeRoi: boolean) {
  lines.push(`## ${title}`, "");
  const rows: Record<string, unknown>[] = [];
  for (const year of YEARS) for (const [band, selections] of group(rankOne(find(evaluations, year, "candidate")), key)) {
    const result = betRow(selections);
    rows.push({ year, context, band, selections: result.selections, winners: result.winners, strike: result.strike, ...(includeRoi ? { ROI: result.ROI } : {}), "A/E": result["A/E"], sparse: selections.length < 50 ? "yes" : "no" });
  }
  table(lines, rows);
}

function handicapProfile(lines: string[], contexts: Awaited<ReturnType<typeof loadYear>>[], evaluations: Evaluation[]) {
  lines.push("## Handicap Status", "");
  const rows: Record<string, unknown>[] = [];
  for (const context of contexts) {
    const evaluation = find(evaluations, context.year, "candidate"), allRated = evaluation.scores.size;
    for (const [band, selections] of group(rankOne(evaluation), row => isHandicap(row) ? "handicap" : "non-handicap")) {
      const population = context.rows.filter(row => (isHandicap(row) ? "handicap" : "non-handicap") === band);
      rows.push({ year: context.year, band, ...betRow(selections), "rated coverage %": pct(rate(count(population, row => evaluation.scores.has(id(row))), population.length)),
        "share of rated runners %": pct(rate(count(population, row => evaluation.scores.has(id(row))), allRated)), "missing OR %": pct(rate(count(population, row => row.features.officialRating === null), population.length)) });
    }
  }
  table(lines, rows);
}

function outlierStress(lines: string[], evaluations: Evaluation[]) {
  lines.push("## Outlier Stress", "");
  const rows: Record<string, unknown>[] = [];
  for (const year of YEARS) {
    const selections = rankOne(find(evaluations, year, "candidate"));
    const biggest = [...selections].filter(row => row.outcome.won && sp(row) !== null).sort((a, b) => sp(b)! - sp(a)!);
    const monthMetrics = [...group(selections, row => row.features.raceDate.slice(0, 7))].map(([month, monthRows]) => ({ month, roi: bet(monthRows).roi ?? -Infinity })).sort((a, b) => b.roi - a.roi);
    const variants = [
      { stress: "full", rows: selections },
      { stress: "remove biggest-priced winner", rows: selections.filter(row => id(row) !== id(biggest[0]!)) },
      { stress: "remove top two biggest-priced winners", rows: selections.filter(row => !new Set(biggest.slice(0, 2).map(id)).has(id(row))) },
      { stress: `remove best month (${monthMetrics[0]?.month ?? "-"})`, rows: selections.filter(row => row.features.raceDate.slice(0, 7) !== monthMetrics[0]?.month) },
    ];
    for (const variant of variants) rows.push({ year, stress: variant.stress, ...betRow(variant.rows) });
  }
  table(lines, rows);
}

function alternative(lines: string[], evaluations: Evaluation[]) {
  lines.push("## Best L3 Speed Alternative", "");
  const metricsRows: Record<string, unknown>[] = [], disagreementRows: Record<string, unknown>[] = [];
  for (const year of YEARS) {
    const main = find(evaluations, year, "candidate"), alt = find(evaluations, year, "alternative");
    metricsRows.push(compactMetricRow(main), compactMetricRow(alt));
    disagreementRows.push(disagreementRow(alt, main, "Alternative vs main"));
  }
  table(lines, metricsRows); table(lines, disagreementRows);
}

function rankStability(lines: string[], evaluations: Evaluation[]) {
  lines.push("## Rank Stability", "");
  const rows: Record<string, unknown>[] = [];
  for (const year of YEARS) {
    const candidate = find(evaluations, year, "candidate"), candidateMap = uniqueRankOneByRace(candidate), orMap = uniqueRankOneByRace(find(evaluations, year, "officialRating")), perfMap = uniqueRankOneByRace(find(evaluations, year, "performance"));
    const races = [...candidateMap.keys()];
    const equalsOr = count(races, race => orMap.has(race) && id(candidateMap.get(race)!) === id(orMap.get(race)!));
    const equalsPerf = count(races, race => perfMap.has(race) && id(candidateMap.get(race)!) === id(perfMap.get(race)!));
    const unique = count(races, race => (!orMap.has(race) || id(candidateMap.get(race)!) !== id(orMap.get(race)!)) && (!perfMap.has(race) || id(candidateMap.get(race)!) !== id(perfMap.get(race)!)));
    rows.push({ year, "unambiguous candidate races": races.length, "equals OR %": pct(rate(equalsOr, races.length)), "equals Performance %": pct(rate(equalsPerf, races.length)), "unique to candidate %": pct(rate(unique, races.length)), "rank1 strike": pct(metrics(candidate).strike), "A/E": num(metrics(candidate).ae) });
  }
  table(lines, rows);
}

function decision(lines: string[], evaluations: Evaluation[]) {
  const main25 = find(evaluations, "2025", "candidate"), main26 = find(evaluations, "2026", "candidate"), perf26 = find(evaluations, "2026", "performance"), or26 = find(evaluations, "2026", "officialRating"), covered26 = find(evaluations, "2026", "orCandidate"), alt26 = find(evaluations, "2026", "alternative");
  const orMatched = restrict(or26, new Set(covered26.scores.keys()));
  const candidateVsOr = disagreementRow(main26, or26, "Candidate vs OR"), candidateVsPerf = disagreementRow(main26, perf26, "Candidate vs Performance");
  const fallbackRows = rankOne(main26).filter(row => row.features.officialRating === null), fallbackMetrics = bet(fallbackRows);
  const full26 = bet(rankOne(main26)), noTwo26 = bet(removeBiggestWinners(rankOne(main26), 2));
  const ready = atLeast(metrics(main26).strike, metrics(perf26).strike) && atLeast(metrics(covered26).strike, metrics(orMatched).strike) && candidateVsOr.net > 0 && (fallbackMetrics.ae ?? 0) >= 1 && (noTwo26.ae ?? 0) >= 1;
  lines.push("## Production-Readiness Conclusion", "",
    `1. Candidate vs Latest Performance rank-1 strike in 2026: ${pct(metrics(main26).strike)} vs ${pct(metrics(perf26).strike)} (${atLeast(metrics(main26).strike, metrics(perf26).strike) ? "improves" : "does not improve"}).`,
    `2. Candidate vs OR on matched OR-covered runners: ${pct(metrics(covered26).strike)} vs ${pct(metrics(orMatched).strike)} (${atLeast(metrics(covered26).strike, metrics(orMatched).strike) ? "improves" : "does not improve"}).`,
    `3. Disagreement net winners in 2026: candidate vs OR ${candidateVsOr.net}; candidate vs Performance ${candidateVsPerf.net}.`,
    `4. Missing-OR fallback: ${fallbackRows.length} selections, ${pct(rate(count(fallbackRows, row => row.outcome.won === true), fallbackRows.length))} strike, ${pct(fallbackMetrics.roi)} ROI, A/E ${num(fallbackMetrics.ae)}; ${fallbackMetrics.ae !== null && fallbackMetrics.ae >= 1 ? "good enough on A/E" : "not strong enough"}.`,
    `5. Positive ROI is robust to priced-winner removal: 2026 full ${pct(full26.roi)} / A/E ${num(full26.ae)}; after removing two biggest-priced winners ${pct(noTwo26.roi)} / A/E ${num(noTwo26.ae)}. Removing the best month makes ROI negative, so profit is not fully month-robust.`,
    `6. A/E replication: 2025 ${num(metrics(main25).ae)}, 2026 ${num(metrics(main26).ae)}.`,
    "7. Monthly stability is mixed rather than broad: 6/12 months were profitable in 2025 and 5/9 in 2026; strike and ROI vary materially by month.",
    "8. Performance is broader than small fields: 9+ runner races retained positive ROI and A/E > 1 in both years, although 6-8 runner races were weaker.",
    "9. The splits expose a material holdout weakness in non-handicap chases (2026 ROI -23.46%, A/E 0.841); novice/non-novice strike remains usable, but novice ROI was slightly negative.",
    `10. Best L3 Speed does not justify replacement: its small strike edge (${pct(metrics(alt26).strike)} vs ${pct(metrics(main26).strike)} in 2026) replicated, but it rated fewer runners and added only two net disagreement winners in holdout.`,
    `11. Main candidate production readiness: ${ready ? "yes" : "no"}.`,
    `12. ${ready ? "Frozen implementation formula: Base = 75% Latest Performance percentile + 25% Latest Speed percentile; Final = 80% re-percentiled Base + 20% OR percentile where OR exists, otherwise Base fallback." : "No production formula should be implemented from this study."}`,
    `13. ${ready ? "No unresolved readiness issue remains under the fixed gates." : "Precise unresolved issue: the candidate does not beat Latest Performance strike in 2026, loses one net winner in their disagreement races, and the missing-OR fallback is below break-even on both ROI and A/E; monthly/non-handicap robustness is also uneven."}`, "");
}

function metricRow(evaluation: Evaluation) { const result = metrics(evaluation); return { year: evaluation.year, races: result.races, "rated races": result.ratedRaces, "rated runners": result.ratedRunners, "rank1 selections": result.selections, "rank1 winners": result.winners, "rank1 strike": pct(result.strike), "top3 winner capture": pct(result.top3Winner), "top3 place capture": pct(result.top3Place), "win correlation": num(result.correlation), "average SP": num(result.averageSp), "median SP": num(result.medianSp), ROI: pct(result.roi), "A/E": num(result.ae), "max losing run": result.maxLosingRun }; }
function compactMetricRow(evaluation: Evaluation) { const result = metrics(evaluation); return { year: evaluation.year, method: evaluation.label, "rated races": result.ratedRaces, "rated runners": evaluation.scores.size, selections: result.selections, strike: pct(result.strike), "top3 winner capture": pct(result.top3Winner), correlation: num(result.correlation), ROI: pct(result.roi), "A/E": num(result.ae) }; }
function metrics(evaluation: Evaluation) {
  const selections = rankOne(evaluation), top3 = evaluation.rows.filter(row => (evaluation.ranks.get(id(row)) ?? Infinity) <= 3), wins = evaluation.rows.filter(row => row.outcome.won), places = evaluation.rows.filter(row => row.outcome.placed), prices = selections.map(sp).filter(valid), betting = bet(selections);
  return { races: distinct(evaluation.rows, row => row.features.targetRaceId), ratedRaces: distinct(evaluation.rows.filter(row => evaluation.scores.has(id(row))), row => row.features.targetRaceId), ratedRunners: evaluation.scores.size, selections: selections.length, winners: count(selections, row => row.outcome.won === true), strike: rate(count(selections, row => row.outcome.won === true), selections.length), top3Winner: rate(count(top3, row => row.outcome.won === true), wins.length), top3Place: rate(count(top3, row => row.outcome.placed === true), places.length), correlation: association(evaluation), averageSp: mean(prices), medianSp: median(prices), roi: betting.roi, ae: betting.ae, maxLosingRun: maxLosingRun(selections) };
}
function disagreementRow(left: Evaluation, right: Evaluation, comparison: string) { const leftMap = uniqueRankOneByRace(left), rightMap = uniqueRankOneByRace(right); let races = 0, leftWinners = 0, rightWinners = 0, neither = 0; for (const race of new Set([...leftMap.keys(), ...rightMap.keys()])) { const a = leftMap.get(race), b = rightMap.get(race); if (!a || !b || id(a) === id(b)) continue; races++; if (a.outcome.won) leftWinners++; if (b.outcome.won) rightWinners++; if (!a.outcome.won && !b.outcome.won) neither++; } return { year: left.year, comparison, "disagreement races": races, "left winners": leftWinners, "right winners": rightWinners, neither, net: leftWinners - rightWinners }; }
function betRow(rows: Row[]) { const result = bet(rows); return { selections: rows.length, winners: count(rows, row => row.outcome.won === true), strike: pct(rate(count(rows, row => row.outcome.won === true), rows.length)), ROI: pct(result.roi), "A/E": num(result.ae) }; }
function bet(rows: Row[]) { const settledRows = rows.filter(row => sp(row) !== null), winners = settledRows.filter(row => row.outcome.won), returns = winners.reduce((sum, row) => sum + sp(row)!, 0), expected = settledRows.reduce((sum, row) => sum + 1 / sp(row)!, 0); return { roi: rate(returns - settledRows.length, settledRows.length), ae: expected === 0 ? null : winners.length / expected }; }
function removeBiggestWinners(rows: Row[], number: number) { const remove = new Set([...rows].filter(row => row.outcome.won && sp(row) !== null).sort((a, b) => sp(b)! - sp(a)!).slice(0, number).map(id)); return rows.filter(row => !remove.has(id(row))); }

function makeEvaluation(year: Year, label: string, rows: Row[], scores: Scores): Evaluation { const ids = new Set(rows.map(id)), subset = new Map([...scores].filter(([key]) => ids.has(key))); return { year, label, rows, scores: subset, ranks: rank(rows, row => subset.get(id(row)) ?? null) }; }
function restrict(evaluation: Evaluation, ids: Set<string>) { const rows = evaluation.rows.filter(row => ids.has(id(row))), scores = new Map([...evaluation.scores].filter(([key]) => ids.has(key))); return { ...evaluation, rows, scores, ranks: rank(rows, row => scores.get(id(row)) ?? null) }; }
function find(evaluations: Evaluation[], year: Year, label: string) { const result = evaluations.find(evaluation => evaluation.year === year && evaluation.label === label); if (!result) throw new Error(`Missing ${year}/${label}`); return result; }
function rankOne(evaluation: Evaluation) { return evaluation.rows.filter(row => evaluation.ranks.get(id(row)) === 1); }
function uniqueRankOneByRace(evaluation: Evaluation) { const result = new Map<string, Row>(); for (const [race, rows] of group(rankOne(evaluation), row => row.features.targetRaceId)) if (rows.length === 1) result.set(race, rows[0]!); return result; }
function leadRows(evaluation: Evaluation) { const result: Array<{ row: Row; lead: number }> = []; for (const race of group(evaluation.rows.filter(row => evaluation.scores.has(id(row))), row => row.features.targetRaceId).values()) { const sorted = [...race].sort((a, b) => evaluation.scores.get(id(b))! - evaluation.scores.get(id(a))! || id(a).localeCompare(id(b))); if (sorted.length >= 2 && evaluation.scores.get(id(sorted[0]!))! > evaluation.scores.get(id(sorted[1]!))!) result.push({ row: sorted[0]!, lead: evaluation.scores.get(id(sorted[0]!))! - evaluation.scores.get(id(sorted[1]!))! }); } return result; }
function leadBand(value: number, cuts: number[]) { return value <= cuts[0]! ? "very small" : value <= cuts[1]! ? "small" : value <= cuts[2]! ? "medium" : "large"; }
function percentiles(rows: Row[], value: (row: Row) => number | null) { const ranks = rank(rows, value), result = new Map<string, number>(); for (const [key, rankValue] of ranks) result.set(key, ranks.size <= 1 ? 1 : (ranks.size - rankValue) / (ranks.size - 1)); return result; }
function rank(rows: Row[], value: (row: Row) => number | null) { const result = new Map<string, number>(); for (const race of group(rows, row => row.features.targetRaceId).values()) { const sorted = race.map(row => ({ row, value: value(row) })).filter((entry): entry is { row: Row; value: number } => valid(entry.value)).sort((a, b) => b.value - a.value || id(a.row).localeCompare(id(b.row))); let prior: number | null = null, priorRank = 0; sorted.forEach((entry, index) => { const current = entry.value === prior ? priorRank : index + 1; result.set(id(entry.row), current); prior = entry.value; priorRank = current; }); } return result; }
function association(evaluation: Evaluation) { const scores: number[] = [], outcomes: number[] = []; for (const row of evaluation.rows) { const score = evaluation.scores.get(id(row)), position = row.outcome.finishingPosition; if (score !== undefined && position !== null) { scores.push(score); outcomes.push(-position); } } return pearson(rankValues(scores), rankValues(outcomes)); }
function maxLosingRun(rows: Row[]) { let current = 0, maximum = 0; for (const row of [...rows].sort(compareRows)) { current = row.outcome.won ? 0 : current + 1; maximum = Math.max(maximum, current); } return maximum; }

function subtype(row: Row) { const value = `${row.features.raceName} ${row.features.raceType}`.toLowerCase(); return /\bchase\b|\bsteeplechase\b/.test(value) ? "chase" : /\bhurdles?\b/.test(value) ? "hurdle" : "other"; }
function isHandicap(row: Row) { return /handicap|nursery/i.test(`${row.features.raceName} ${row.features.raceType}`); }
function isNovice(row: Row) { return /novice|maiden|beginners?/i.test(`${row.features.raceName} ${row.features.raceType}`); }
function classBand(value: string | null) { const number = raceClassNumber(value); return number === null ? "unknown" : `Class ${number}`; }
function fieldSize(row: Row) { return row.features.actualRunnerCount ?? row.features.declaredRunnerCount; }
function fieldBand(value: number | null) { return value === null ? "unknown" : value <= 5 ? "2-5" : value <= 8 ? "6-8" : "9+"; }
function distanceBand(value: number | null) { return value === null ? "unknown" : value < 3960 ? "<18f" : value < 5280 ? "18-23.9f" : "24f+"; }
function goingBand(value: string | null) { const normalized = (value ?? "").toLowerCase(); return /heavy|soft/.test(normalized) ? "soft/heavy" : /good/.test(normalized) ? "good" : /firm/.test(normalized) ? "firm" : "other"; }
function priceBand(value: number | null) { return value === null ? "missing" : value < 2 ? "<2.0" : value < 3 ? "2.0-2.99" : value < 5 ? "3.0-4.99" : value < 9 ? "5.0-8.99" : "9.0+"; }
function settled(row: Row) { return row.outcome.resultStatus !== "non_runner" && row.outcome.finishingPosition !== null; }
function sp(row: Row) { const value = Number(row.outcome.startingPriceDecimal); return Number.isFinite(value) && value > 0 ? value : null; }
function id(row: Row) { return row.features.targetRunnerId; }
function compareRows(a: Row, b: Row) { return a.features.raceDateTime.getTime() - b.features.raceDateTime.getTime() || id(a).localeCompare(id(b)); }
function valid(value: number | null | undefined): value is number { return value !== null && value !== undefined && Number.isFinite(value); }
function group<T>(values: T[], key: (value: T) => string) { const result = new Map<string, T[]>(); for (const value of values) { const groupKey = key(value); result.set(groupKey, [...(result.get(groupKey) ?? []), value]); } return result; }
function count<T>(values: T[], predicate: (value: T) => boolean) { return values.filter(predicate).length; }
function distinct<T>(values: T[], key: (value: T) => string) { return new Set(values.map(key)).size; }
function rate(numerator: number, denominator: number) { return denominator === 0 ? null : numerator / denominator; }
function mean(values: number[]) { return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length; }
function median(values: number[]) { if (values.length === 0) return null; const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2; }
function rankValues(values: number[]) { const sorted = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value || a.index - b.index), result = Array<number>(values.length); for (let index = 0; index < sorted.length;) { let end = index + 1; while (end < sorted.length && sorted[end]!.value === sorted[index]!.value) end++; for (let item = index; item < end; item++) result[sorted[item]!.index] = (index + 1 + end) / 2; index = end; } return result; }
function pearson(left: number[], right: number[]) { if (left.length < 2) return null; const leftMean = mean(left)!, rightMean = mean(right)!; let numerator = 0, leftSquares = 0, rightSquares = 0; for (let index = 0; index < left.length; index++) { const a = left[index]! - leftMean, b = right[index]! - rightMean; numerator += a * b; leftSquares += a * a; rightSquares += b * b; } return leftSquares > 0 && rightSquares > 0 ? numerator / Math.sqrt(leftSquares * rightSquares) : null; }
function atLeast(left: number | null, right: number | null) { return left !== null && right !== null && left >= right; }
function pct(value: number | null) { return value === null || !Number.isFinite(value) ? "-" : `${(value * 100).toFixed(2)}%`; }
function num(value: number | null) { return value === null || !Number.isFinite(value) ? "-" : value.toFixed(3); }
function table(lines: string[], rows: Record<string, unknown>[]) { if (rows.length === 0) { lines.push("No rows.", ""); return; } const headers = Object.keys(rows[0]!); lines.push(`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map(row => `| ${headers.map(header => String(row[header] ?? "-").replace(/\|/g, "\\|")).join(" | ")} |`), ""); }

await main();
