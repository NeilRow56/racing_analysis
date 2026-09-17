import { writeFile } from "node:fs/promises";
import { loadLatestBacktestFeatureCacheForYear } from "@/lib/racing/backtest-cache";
import { raceClassNumber } from "@/lib/racing/research-rule-classes";
import type { HistoricalTargetRunnerMetricsRow as Row } from "@/lib/racing/historical-target-metrics";

type Year = "2025" | "2026";
type Getter = (row: Row) => number | null;
type Candidate = { key: string; label: string; get: Getter };
type Context = { year: Year; rows: Row[]; settled: Row[]; coverage: string };
type Evaluation = { year: Year; candidate: Candidate; rows: Row[]; values: Map<string, number>; ranks: Map<string, number> };

const OUTPUT = "/tmp/hurdle-rating-foundation.md";
const YEARS: Year[] = ["2025", "2026"];
const individual: Candidate[] = [
  candidate("or", "Official Rating", row => row.features.officialRating),
  candidate("perf_latest", "Latest Performance", row => row.features.latestPerformanceRating),
  candidate("perf_best3", "Best L3 Performance", row => row.features.bestPerformanceLast3),
  candidate("perf_avg3", "Avg L3 Performance", row => row.features.averagePerformanceLast3),
  candidate("speed_latest", "Latest Speed", row => row.features.latestSpeedRating),
  candidate("speed_best3", "Best L3 Speed", row => row.features.bestSpeedLast3),
  candidate("speed_avg3", "Avg L3 Speed", row => row.features.averageSpeedLast3),
  candidate("today_latest", "Latest Today's Rating", row => row.features.latestTodaysRating),
  candidate("today_best3", "Best L3 Today's Rating", row => row.features.bestTodaysRatingLast3),
];
const constructions: Candidate[] = [
  ...individual.filter(item => item.key.startsWith("perf_") || item.key.startsWith("speed_")),
  candidate("perf_weighted3", "Performance weighted L3 (50/30/20)", row => weighted3(row.features.latestPerformanceRating, row.features.previousPerformanceRating, row.features.averagePerformanceLast3)),
  candidate("speed_weighted3", "Speed weighted L3 (50/30/20)", row => weighted3(row.features.latestSpeedRating, row.features.previousSpeedRating, row.features.averageSpeedLast3)),
];

async function main() {
  const contexts = await Promise.all(YEARS.map(load));
  const development = contexts[0]!;
  const bestPerformance = best2025(constructions.filter(item => item.key.startsWith("perf_")), development);
  const bestSpeed = best2025(constructions.filter(item => item.key.startsWith("speed_")), development);
  const blends = blendCandidates(bestPerformance, bestSpeed, contexts);
  const bestBlend = best2025(blends, development);
  const orBlend = blendedCandidate("or_blend", `80% ${bestBlend.label} / 20% OR`, bestBlend, individual[0]!, 0.8, 0.2, contexts);
  const candidates = uniqueCandidates([...individual, ...constructions, ...blends, orBlend]);
  const evaluations = contexts.flatMap(context => candidates.map(item => evaluate(context.year, context.settled, item)));
  const strongest = best2025([individual[0]!, bestPerformance, bestSpeed, bestBlend, orBlend], development);
  const leaders = uniqueCandidates([strongest, bestPerformance, bestBlend]).slice(0, 3);
  const leadCuts = leadQuartiles(find(evaluations, "2025", strongest.key));
  const lines = ["# Hurdle Performance Rating Foundation Study", "", "Diagnostic only. Hurdles, current v4 cache, as-of-safe pre-race features, uncapped final-SP evaluation. No production, Today, Research, schema, or cache changes.", ""];
  coverage(lines, contexts);
  definitions(lines, bestPerformance, bestSpeed, bestBlend, strongest);
  section(lines, "Individual Benchmarks", evaluations.filter(evaluation => individual.some(item => item.key === evaluation.candidate.key)));
  section(lines, "Recent-Form Constructions", evaluations.filter(evaluation => constructions.some(item => item.key === evaluation.candidate.key)));
  comparison(lines, evaluations, bestPerformance, bestSpeed);
  section(lines, "Fixed Performance / Speed Blends", evaluations.filter(evaluation => blends.some(item => item.key === evaluation.candidate.key)));
  orSplit(lines, contexts, evaluations, bestPerformance, bestSpeed, bestBlend, orBlend);
  orContribution(lines, contexts, evaluations, bestPerformance, bestBlend, orBlend);
  disagreements(lines, contexts, evaluations, bestPerformance, bestBlend);
  missingOr(lines, contexts, evaluations, bestPerformance, bestSpeed, bestBlend);
  statusProfile(lines, contexts, evaluations, strongest);
  noviceProfile(lines, contexts, evaluations, strongest, bestBlend);
  profile(lines, evaluations, strongest, "Field Size", row => fieldBand(fieldSize(row)), true);
  profile(lines, evaluations, strongest, "Days Since Run", row => daysBand(row.features.daysSinceLastRun), false);
  profile(lines, evaluations, strongest, "Race Class", row => classBand(row.features.raceClass), false);
  profile(lines, evaluations, strongest, "Going", row => goingBand(row.features.going), false);
  profile(lines, evaluations, strongest, "Distance", row => distanceBand(row.features.distanceYards), false);
  leadProfile(lines, evaluations, strongest, leadCuts);
  profile(lines, evaluations, strongest, "Final-SP Behaviour", row => priceBand(sp(row)), true);
  stability(lines, evaluations, leaders);
  conclusion(lines, contexts, evaluations, bestPerformance, bestSpeed, bestBlend, orBlend, strongest);
  await writeFile(OUTPUT, `${lines.join("\n")}\n`, "utf8");
  console.log(`Wrote ${OUTPUT}`);
  console.log(`2025 choices: performance=${bestPerformance.label}; speed=${bestSpeed.label}; blend=${bestBlend.label}; strongest=${strongest.label}`);
}

async function load(year: Year): Promise<Context> {
  const cache = await loadLatestBacktestFeatureCacheForYear({ family: "jump", year }) ?? await loadLatestBacktestFeatureCacheForYear({ family: "all", year });
  if (!cache) throw new Error(`Missing compatible v4 Jump cache for ${year}`);
  const rows = cache.rows.filter(row => row.features.raceCode === "jump" && subtype(row) === "hurdle").sort(compareRows);
  return { year, rows, settled: rows.filter(isSettled), coverage: `${cache.actualCoverage?.actualFrom ?? cache.manifest.from} to ${cache.actualCoverage?.actualTo ?? cache.manifest.to}` };
}

function coverage(lines: string[], contexts: Context[]) {
  lines.push("## Coverage", "");
  const metrics = individual;
  table(lines, contexts.map(context => {
    const row: Record<string, unknown> = { year: context.year, coverage: context.coverage, races: distinct(context.rows, item => item.features.targetRaceId), runners: context.rows.length, "settled runners": context.settled.length };
    for (const metric of metrics) { const validCount = count(context.settled, item => valid(metric.get(item))); row[metric.label] = `${validCount} valid; ${pct(1 - validCount / Math.max(1, context.settled.length))} missing`; }
    return row;
  }));
  lines.push("Coverage splits:", "");
  const rows: Record<string, unknown>[] = [];
  for (const context of contexts) for (const [split, splitRows] of group(context.settled, row => `${isHandicap(row) ? "handicap" : "non-handicap"} / ${noviceBand(row)}`)) {
    const item: Record<string, unknown> = { year: context.year, split, runners: splitRows.length, races: distinct(splitRows, row => row.features.targetRaceId) };
    for (const metric of metrics) item[`${metric.label} missing`] = pct(rate(count(splitRows, row => !valid(metric.get(row))), splitRows.length));
    rows.push(item);
  }
  table(lines, rows);
}

function definitions(lines: string[], performance: Candidate, speed: Candidate, blend: Candidate, strongest: Candidate) {
  lines.push("## Definitions And Frozen Selection", "",
    "Performance is the cached as-of RPR-style prior-run series; Speed is the cached as-of Jump speed series. Weighted L3 reconstructs the third value only when latest, previous, and average L3 are present, applies fixed 50/30/20 weights, and renormalises over available runs.", "",
    "All component blends use within-race competition-rank percentiles (highest = 1, lowest = 0), require the active components, and preserve tied competition ranks. Candidate selection uses 2025 Hurdles only; 2026 is holdout.", "",
    `2025-selected Performance: ${performance.label}. Speed: ${speed.label}. Blend: ${blend.label}. Strongest shortlist candidate: ${strongest.label}.`, "");
}

function section(lines: string[], title: string, evaluations: Evaluation[]) { lines.push(`## ${title}`, ""); table(lines, evaluations.map(summaryRow)); }
function comparison(lines: string[], evaluations: Evaluation[], performance: Candidate, speed: Candidate) { lines.push("## Performance Vs Speed", ""); table(lines, YEARS.flatMap(year => [summaryRow(find(evaluations, year, performance.key)), summaryRow(find(evaluations, year, speed.key))])); }

function orSplit(lines: string[], contexts: Context[], evaluations: Evaluation[], performance: Candidate, speed: Candidate, blend: Candidate, orBlend: Candidate) {
  lines.push("## OR-Covered Vs OR-Missing", "", "Segments classify the selected rank-1 runner by whether that runner has a usable OR.", "");
  const rows: Record<string, unknown>[] = [];
  for (const year of YEARS) for (const model of [performance, speed, blend, orBlend]) {
    const evaluation = find(evaluations, year, model.key);
    for (const [segment, selections] of group(rankOne(evaluation), row => row.features.officialRating === null ? "OR-missing rank 1" : "OR-covered rank 1")) rows.push({ year, model: model.label, segment, races: distinct(selections, row => row.features.targetRaceId), ...selectionMetrics(selections), "top3 capture": top3Capture(evaluation, new Set(selections.map(row => row.features.targetRaceId))) });
  }
  table(lines, rows);
  void contexts;
}

function orContribution(lines: string[], contexts: Context[], evaluations: Evaluation[], performance: Candidate, blend: Candidate, orBlend: Candidate) {
  lines.push("## OR Contribution On Matched OR-Covered Runners", "");
  const rows: Record<string, unknown>[] = [];
  for (const context of contexts) {
    const ids = new Set(context.settled.filter(row => row.features.officialRating !== null && valid(blend.get(row))).map(id));
    for (const model of [individual[0]!, performance, blend, orBlend]) rows.push({ population: "OR-covered matched", ...summaryRow(restrict(find(evaluations, context.year, model.key), ids)) });
  }
  table(lines, rows);
}

function disagreements(lines: string[], contexts: Context[], evaluations: Evaluation[], performance: Candidate, blend: Candidate) {
  lines.push("## OR-Covered Pairwise Disagreements", "", "Only matched races with one unambiguous rank-1 selection per method are counted.", "");
  const rows: Record<string, unknown>[] = [];
  for (const context of contexts) {
    const ids = new Set(context.settled.filter(row => row.features.officialRating !== null && valid(blend.get(row))).map(id));
    const official = restrict(find(evaluations, context.year, "or"), ids), perf = restrict(find(evaluations, context.year, performance.key), ids), blended = restrict(find(evaluations, context.year, blend.key), ids);
    rows.push(disagreement(official, perf, "OR vs best Performance"), disagreement(official, blended, "OR vs best blend"), disagreement(perf, blended, "best Performance vs best blend"));
  }
  table(lines, rows);
}

function missingOr(lines: string[], contexts: Context[], evaluations: Evaluation[], performance: Candidate, speed: Candidate, blend: Candidate) {
  lines.push("## Missing-OR Model", "", "Models are reranked among OR-missing runners within each race; no OR is imputed.", "");
  const rows: Record<string, unknown>[] = [];
  for (const context of contexts) {
    const ids = new Set(context.settled.filter(row => row.features.officialRating === null).map(id));
    for (const model of [individual.find(item => item.key === "perf_latest")!, individual.find(item => item.key === "perf_best3")!, performance, speed, blend]) rows.push(summaryRow(restrict(find(evaluations, context.year, model.key), ids)));
  }
  table(lines, rows);
}

function statusProfile(lines: string[], contexts: Context[], evaluations: Evaluation[], strongest: Candidate) {
  lines.push("## Handicap Vs Non-Handicap", ""); const rows: Record<string, unknown>[] = [];
  for (const context of contexts) { const evaluation = find(evaluations, context.year, strongest.key); for (const band of ["handicap", "non-handicap"]) { const population = context.settled.filter(row => (isHandicap(row) ? "handicap" : "non-handicap") === band), ids = new Set(population.map(id)), sub = restrict(evaluation, ids); rows.push({ band, ...summaryRow(sub), "OR coverage": pct(rate(count(population, row => row.features.officialRating !== null), population.length)) }); } }
  table(lines, rows);
}

function noviceProfile(lines: string[], contexts: Context[], evaluations: Evaluation[], strongest: Candidate, blend: Candidate) {
  lines.push("## Novice / Maiden Context", "", "Classification uses explicit novice, maiden, and beginners text in cached race name/type metadata; ambiguous races remain other.", ""); const rows: Record<string, unknown>[] = [];
  for (const context of contexts) for (const band of ["novice", "maiden", "other"]) { const population = context.settled.filter(row => noviceBand(row) === band), ids = new Set(population.map(id)), primary = restrict(find(evaluations, context.year, strongest.key), ids), blended = restrict(find(evaluations, context.year, blend.key), ids); rows.push({ year: context.year, band, races: distinct(population, row => row.features.targetRaceId), "OR coverage": pct(rate(count(population, row => row.features.officialRating !== null), population.length)), "best benchmark strike": pct(rawStrike(primary)), "best blend strike": pct(rawStrike(blended)), "best benchmark A/E": num(metrics(primary).ae), sparse: distinct(population, row => row.features.targetRaceId) < 50 ? "yes" : "no" }); }
  table(lines, rows);
}

function profile(lines: string[], evaluations: Evaluation[], strongest: Candidate, title: string, key: (row: Row) => string, withRoi: boolean) {
  lines.push(`## ${title}`, ""); const rows: Record<string, unknown>[] = [];
  for (const year of YEARS) for (const [band, selections] of group(rankOne(find(evaluations, year, strongest.key)), key)) { const metric = selectionMetrics(selections); rows.push({ year, candidate: strongest.label, band, selections: metric.selections, strike: metric.strike, ...(withRoi ? { ROI: metric.ROI } : {}), "A/E": metric["A/E"], sparse: selections.length < 50 ? "yes" : "no" }); }
  table(lines, rows);
}

function leadProfile(lines: string[], evaluations: Evaluation[], strongest: Candidate, cuts: number[]) {
  lines.push("## Lead / Confidence", "", `2025-derived quartiles frozen for 2026: ${cuts.map(value => value.toFixed(4)).join(", ")}. Unambiguous rank-1 races with at least two rated runners only.`, ""); const rows: Record<string, unknown>[] = [];
  for (const year of YEARS) for (const [band, entries] of group(leadRows(find(evaluations, year, strongest.key)), entry => leadBand(entry.lead, cuts))) rows.push({ year, band, ...selectionMetrics(entries.map(entry => entry.row)) });
  table(lines, rows);
}

function stability(lines: string[], evaluations: Evaluation[], leaders: Candidate[]) {
  lines.push("## Monthly Stability", ""); const rows: Record<string, unknown>[] = [];
  for (const model of leaders) for (const year of YEARS) for (const [month, selections] of group(rankOne(find(evaluations, year, model.key)), row => row.features.raceDate.slice(0, 7))) rows.push({ candidate: model.label, year, month, ...selectionMetrics(selections) });
  table(lines, rows); lines.push("Positive-ROI outlier stress:", ""); const stress: Record<string, unknown>[] = [];
  for (const model of leaders) for (const year of YEARS) { const selections = rankOne(find(evaluations, year, model.key)); if ((bet(selections).roi ?? -Infinity) <= 0) continue; const winners = [...selections].filter(row => row.outcome.won && sp(row) !== null).sort((a, b) => sp(b)! - sp(a)!); const bestMonth = [...group(selections, row => row.features.raceDate.slice(0, 7))].map(([month, monthRows]) => ({ month, roi: bet(monthRows).roi ?? -Infinity })).sort((a, b) => b.roi - a.roi)[0]?.month; for (const variant of [{ label: "full", rows: selections }, { label: "remove biggest winner", rows: removeIds(selections, winners.slice(0, 1)) }, { label: "remove top two winners", rows: removeIds(selections, winners.slice(0, 2)) }, { label: `remove best month (${bestMonth})`, rows: selections.filter(row => row.features.raceDate.slice(0, 7) !== bestMonth) }]) stress.push({ candidate: model.label, year, stress: variant.label, ...selectionMetrics(variant.rows) }); }
  table(lines, stress);
}

function conclusion(lines: string[], contexts: Context[], evaluations: Evaluation[], performance: Candidate, speed: Candidate, blend: Candidate, orBlend: Candidate, strongest: Candidate) {
  const e = (year: Year, model: Candidate) => find(evaluations, year, model.key), or = individual[0]!;
  const matched = (year: Year, model: Candidate) => { const context = contexts.find(item => item.year === year)!; return restrict(e(year, model), new Set(context.settled.filter(row => row.features.officialRating !== null && valid(blend.get(row))).map(id))); };
  const missing = (year: Year, model: Candidate) => { const context = contexts.find(item => item.year === year)!; return restrict(e(year, model), new Set(context.settled.filter(row => row.features.officialRating === null).map(id))); };
  const blendImproves = rawStrike(e("2025", blend))! > rawStrike(e("2025", performance))! && rawStrike(e("2026", blend))! > rawStrike(e("2026", performance))!;
  const orImproves = rawStrike(matched("2025", orBlend))! > rawStrike(matched("2025", blend))! && rawStrike(matched("2026", orBlend))! > rawStrike(matched("2026", blend))!;
  const missingChoices = [individual.find(item => item.key === "perf_latest")!, individual.find(item => item.key === "perf_best3")!, performance, speed, blend];
  const bestMissing = [...missingChoices].sort((a, b) => compareEvaluation(missing("2025", a), missing("2025", b)))[0]!;
  const bespokeCandidate = strongest.key !== "or" && rawStrike(e("2026", strongest)) !== null && metrics(e("2026", strongest)).ae !== null;
  lines.push("## Candidate Structure Decision", "",
    `1. Best standalone Hurdle metric on 2025 rank-1 strike: ${strongest.label} (${pct(rawStrike(e("2025", strongest)))}; 2026 ${pct(rawStrike(e("2026", strongest)))}).`,
    `2. OR where available: ${pct(rawStrike(matched("2025", or)))} in 2025 and ${pct(rawStrike(matched("2026", or)))} in 2026; compare directly with the matched table.`,
    `3. Latest Performance vs Best L3 Performance: 2025 ${pct(rawStrike(e("2025", individual[1]!)))} vs ${pct(rawStrike(e("2025", individual[2]!)))}; 2026 ${pct(rawStrike(e("2026", individual[1]!)))} vs ${pct(rawStrike(e("2026", individual[2]!)))}.`,
    `4. Speed contribution: best Speed is ${speed.label}; its 2025/2026 strike is ${pct(rawStrike(e("2025", speed)))} / ${pct(rawStrike(e("2026", speed)))} versus Performance ${pct(rawStrike(e("2025", performance)))} / ${pct(rawStrike(e("2026", performance)))}.`,
    `5. A fixed Performance/Speed blend ${blendImproves ? "improves" : "does not improve"} Performance strike in both years; selected blend is ${blend.label}.`,
    `6. Adding fixed 20% OR ${orImproves ? "improves" : "does not improve"} the selected base in both matched years.`,
    `7. Best 2025-selected missing-OR approach: ${bestMissing.label}; 2025/2026 strike ${pct(rawStrike(missing("2025", bestMissing)))} / ${pct(rawStrike(missing("2026", bestMissing)))}.`,
    `8. OR-missing Hurdles are ${averageStrike([missing("2025", bestMissing), missing("2026", bestMissing)]) < averageStrike([matched("2025", or), matched("2026", or)]) ? "weaker" : "not clearly weaker"} to rank than matched OR-covered runners.`,
    "9. Handicap/non-handicap tables show materially different OR coverage; separate missing-OR treatment is warranted if a model advances.",
    "10. Novice/maiden splits are descriptive and metadata-based; sparse/low-coverage cells should not yet drive separate formulas.",
    `11. ${bespokeCandidate ? `${strongest.label} is the single simple candidate worth a second-stage confirmation study, with OR-missing behavior retained as a separate gate.` : "No bespoke candidate clears the evidence for second-stage confirmation: OR itself is strongest, and the fixed OR blend remains weaker than OR alone."}`,
    `12. ${bespokeCandidate ? "Do not deploy yet; freeze the selected structure and run confirmation." : "Hurdles should remain unrated by a bespoke production model for now."}`, "");
}

function summaryRow(evaluation: Evaluation) { const result = metrics(evaluation); return { year: evaluation.year, candidate: evaluation.candidate.label, "valid races": result.validRaces, "rank1 selections": result.selections, "rank1 winners": result.winners, "rank1 strike": pct(result.strike), "top3 winner capture": pct(result.top3Winner), "top3 place capture": pct(result.top3Place), "win correlation": num(result.correlation), "average SP": num(result.averageSp), ROI: pct(result.roi), "A/E": num(result.ae) }; }
function metrics(evaluation: Evaluation) { const picks = rankOne(evaluation), top3 = evaluation.rows.filter(row => (evaluation.ranks.get(id(row)) ?? Infinity) <= 3), winners = evaluation.rows.filter(row => row.outcome.won), places = evaluation.rows.filter(row => row.outcome.placed), prices = picks.map(sp).filter(valid), result = bet(picks); return { validRaces: distinct(evaluation.rows.filter(row => evaluation.values.has(id(row))), row => row.features.targetRaceId), selections: picks.length, winners: count(picks, row => row.outcome.won === true), strike: rate(count(picks, row => row.outcome.won === true), picks.length), top3Winner: rate(count(top3, row => row.outcome.won === true), winners.length), top3Place: rate(count(top3, row => row.outcome.placed === true), places.length), correlation: association(evaluation), averageSp: average(prices), roi: result.roi, ae: result.ae }; }
function selectionMetrics(rows: Row[]) { const result = bet(rows); return { selections: rows.length, winners: count(rows, row => row.outcome.won === true), strike: pct(rate(count(rows, row => row.outcome.won === true), rows.length)), ROI: pct(result.roi), "A/E": num(result.ae) }; }
function top3Capture(evaluation: Evaluation, races: Set<string>) { const winners = evaluation.rows.filter(row => races.has(row.features.targetRaceId) && row.outcome.won), top = winners.filter(row => (evaluation.ranks.get(id(row)) ?? Infinity) <= 3); return pct(rate(top.length, winners.length)); }
function disagreement(left: Evaluation, right: Evaluation, comparison: string) { const a = uniqueRankOne(left), b = uniqueRankOne(right); let races = 0, leftWinners = 0, rightWinners = 0, neither = 0; for (const race of new Set([...a.keys(), ...b.keys()])) { const l = a.get(race), r = b.get(race); if (!l || !r || id(l) === id(r)) continue; races++; if (l.outcome.won) leftWinners++; if (r.outcome.won) rightWinners++; if (!l.outcome.won && !r.outcome.won) neither++; } return { year: left.year, comparison, "disagreement races": races, "left winners": leftWinners, "right winners": rightWinners, neither, "net left": leftWinners - rightWinners }; }

function blendCandidates(performance: Candidate, speed: Candidate, contexts: Context[]) { return [[1, 0], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0, 1]].map(([p, s]) => blendedCandidate(`blend_${p}_${s}`, `${p! * 100}% Performance / ${s! * 100}% Speed`, performance, speed, p!, s!, contexts)); }
function blendedCandidate(key: string, label: string, left: Candidate, right: Candidate, leftWeight: number, rightWeight: number, contexts: Context[]) { const values = new Map<string, number>(); for (const context of contexts) for (const race of group(context.settled, row => row.features.targetRaceId).values()) { const a = percentiles(race, left.get), b = percentiles(race, right.get); for (const row of race) { const av = a.get(id(row)), bv = b.get(id(row)); if ((leftWeight === 0 || av !== undefined) && (rightWeight === 0 || bv !== undefined)) values.set(id(row), leftWeight * (av ?? 0) + rightWeight * (bv ?? 0)); } } return candidate(key, label, row => values.get(id(row)) ?? null); }
function best2025(candidates: Candidate[], context: Context) { return [...candidates].sort((a, b) => compareEvaluation(evaluate("2025", context.settled, a), evaluate("2025", context.settled, b)))[0]!; }
function compareEvaluation(left: Evaluation, right: Evaluation) { return numeric(rawStrike(right)) - numeric(rawStrike(left)) || numeric(metrics(right).top3Winner) - numeric(metrics(left).top3Winner) || numeric(metrics(right).correlation) - numeric(metrics(left).correlation); }
function evaluate(year: Year, rows: Row[], item: Candidate): Evaluation { const values = new Map<string, number>(); for (const row of rows) { const value = item.get(row); if (valid(value)) values.set(id(row), value); } return { year, candidate: item, rows, values, ranks: rank(rows, row => values.get(id(row)) ?? null) }; }
function restrict(evaluation: Evaluation, ids: Set<string>): Evaluation { const rows = evaluation.rows.filter(row => ids.has(id(row))), values = new Map([...evaluation.values].filter(([key]) => ids.has(key))); return { ...evaluation, rows, values, ranks: rank(rows, row => values.get(id(row)) ?? null) }; }
function find(evaluations: Evaluation[], year: Year, key: string) { const result = evaluations.find(item => item.year === year && item.candidate.key === key); if (!result) throw new Error(`Missing ${year}/${key}`); return result; }
function rawStrike(evaluation: Evaluation) { const picks = rankOne(evaluation); return rate(count(picks, row => row.outcome.won === true), picks.length); }
function averageStrike(evaluations: Evaluation[]) { return evaluations.reduce((sum, evaluation) => sum + numeric(rawStrike(evaluation)), 0) / evaluations.length; }
function rankOne(evaluation: Evaluation) { return evaluation.rows.filter(row => evaluation.ranks.get(id(row)) === 1); }
function uniqueRankOne(evaluation: Evaluation) { const result = new Map<string, Row>(); for (const [race, rows] of group(rankOne(evaluation), row => row.features.targetRaceId)) if (rows.length === 1) result.set(race, rows[0]!); return result; }
function leadRows(evaluation: Evaluation) { const result: Array<{ row: Row; lead: number }> = []; for (const race of group(evaluation.rows.filter(row => evaluation.values.has(id(row))), row => row.features.targetRaceId).values()) { const sorted = [...race].sort((a, b) => evaluation.values.get(id(b))! - evaluation.values.get(id(a))! || id(a).localeCompare(id(b))); if (sorted.length >= 2 && evaluation.values.get(id(sorted[0]!))! > evaluation.values.get(id(sorted[1]!))!) result.push({ row: sorted[0]!, lead: evaluation.values.get(id(sorted[0]!))! - evaluation.values.get(id(sorted[1]!))! }); } return result; }
function leadQuartiles(evaluation: Evaluation) { const values = leadRows(evaluation).map(entry => entry.lead).sort((a, b) => a - b); return [quantile(values, 0.25), quantile(values, 0.5), quantile(values, 0.75)]; }
function leadBand(value: number, cuts: number[]) { return value <= cuts[0]! ? "very small" : value <= cuts[1]! ? "small" : value <= cuts[2]! ? "medium" : "large"; }
function weighted3(latest: number | null, previous: number | null, averageL3: number | null) { const third = latest !== null && previous !== null && averageL3 !== null ? averageL3 * 3 - latest - previous : null, entries: Array<[number | null, number]> = [[latest, 0.5], [previous, 0.3], [third, 0.2]], available = entries.filter((entry): entry is [number, number] => valid(entry[0])), total = available.reduce((sum, entry) => sum + entry[1], 0); return total === 0 ? null : available.reduce((sum, entry) => sum + entry[0] * entry[1] / total, 0); }
function percentiles(rows: Row[], get: Getter) { const ranks = rank(rows, get), result = new Map<string, number>(); for (const [key, value] of ranks) result.set(key, ranks.size <= 1 ? 1 : (ranks.size - value) / (ranks.size - 1)); return result; }
function rank(rows: Row[], get: Getter) { const result = new Map<string, number>(); for (const race of group(rows, row => row.features.targetRaceId).values()) { const sorted = race.map(row => ({ row, value: get(row) })).filter((item): item is { row: Row; value: number } => valid(item.value)).sort((a, b) => b.value - a.value || id(a.row).localeCompare(id(b.row))); let previous: number | null = null, previousRank = 0; sorted.forEach((item, index) => { const current = item.value === previous ? previousRank : index + 1; result.set(id(item.row), current); previous = item.value; previousRank = current; }); } return result; }
function association(evaluation: Evaluation) { const values: number[] = [], finishes: number[] = []; for (const row of evaluation.rows) { const value = evaluation.values.get(id(row)), finish = row.outcome.finishingPosition; if (value !== undefined && finish !== null) { values.push(value); finishes.push(-finish); } } return pearson(rankValues(values), rankValues(finishes)); }
function bet(rows: Row[]) { const settled = rows.filter(row => sp(row) !== null), winners = settled.filter(row => row.outcome.won), returns = winners.reduce((sum, row) => sum + sp(row)!, 0), expected = settled.reduce((sum, row) => sum + 1 / sp(row)!, 0); return { roi: rate(returns - settled.length, settled.length), ae: expected === 0 ? null : winners.length / expected }; }
function removeIds(rows: Row[], removed: Row[]) { const ids = new Set(removed.map(id)); return rows.filter(row => !ids.has(id(row))); }

function subtype(row: Row) { const value = `${row.features.raceName} ${row.features.raceType}`.toLowerCase(); return /\bhurdles?\b/.test(value) ? "hurdle" : /\bchase\b|\bsteeplechase\b/.test(value) ? "chase" : "other"; }
function isHandicap(row: Row) { return /handicap|nursery/i.test(`${row.features.raceName} ${row.features.raceType}`); }
function noviceBand(row: Row) { const value = `${row.features.raceName} ${row.features.raceType}`; return /maiden/i.test(value) ? "maiden" : /novice|beginners?/i.test(value) ? "novice" : "other"; }
function fieldSize(row: Row) { return row.features.actualRunnerCount ?? row.features.declaredRunnerCount; }
function fieldBand(value: number | null) { return value === null ? "unknown" : value <= 5 ? "2-5" : value <= 8 ? "6-8" : "9+"; }
function daysBand(value: number | null) { return value === null ? "missing" : value <= 30 ? "0-30" : value <= 60 ? "31-60" : value <= 120 ? "61-120" : "121+"; }
function classBand(value: string | null) { const parsed = raceClassNumber(value); return parsed === null ? "unknown" : `Class ${parsed}`; }
function goingBand(value: string | null) { const text = (value ?? "").toLowerCase(); return /heavy|soft/.test(text) ? "soft/heavy" : /good/.test(text) ? "good" : /firm/.test(text) ? "firm" : "other"; }
function distanceBand(value: number | null) { return value === null ? "unknown" : value < 3960 ? "<18f" : value < 5280 ? "18-23.9f" : "24f+"; }
function priceBand(value: number | null) { return value === null ? "missing" : value < 2 ? "<2.0" : value < 3 ? "2.0-2.99" : value < 5 ? "3.0-4.99" : value < 9 ? "5.0-8.99" : "9.0+"; }
function isSettled(row: Row) { return row.outcome.resultStatus !== "non_runner" && row.outcome.finishingPosition !== null; }
function sp(row: Row) { const value = Number(row.outcome.startingPriceDecimal); return Number.isFinite(value) && value > 0 ? value : null; }
function candidate(key: string, label: string, get: Getter): Candidate { return { key, label, get }; }
function uniqueCandidates(items: Candidate[]) { return [...new Map(items.map(item => [item.key, item])).values()]; }
function id(row: Row) { return row.features.targetRunnerId; }
function compareRows(left: Row, right: Row) { return left.features.raceDateTime.getTime() - right.features.raceDateTime.getTime() || id(left).localeCompare(id(right)); }
function valid(value: number | null | undefined): value is number { return value !== null && value !== undefined && Number.isFinite(value); }
function numeric(value: number | null) { return value ?? -Infinity; }
function group<T>(values: T[], key: (value: T) => string) { const result = new Map<string, T[]>(); for (const value of values) { const groupKey = key(value); result.set(groupKey, [...(result.get(groupKey) ?? []), value]); } return result; }
function count<T>(values: T[], predicate: (value: T) => boolean) { return values.filter(predicate).length; }
function distinct<T>(values: T[], key: (value: T) => string) { return new Set(values.map(key)).size; }
function rate(numerator: number, denominator: number) { return denominator === 0 ? null : numerator / denominator; }
function average(values: number[]) { return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length; }
function quantile(values: number[], q: number) { if (values.length === 0) return 0; const index = (values.length - 1) * q, lower = Math.floor(index), upper = Math.ceil(index); return lower === upper ? values[lower]! : values[lower]! * (upper - index) + values[upper]! * (index - lower); }
function rankValues(values: number[]) { const sorted = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value || a.index - b.index), result = Array<number>(values.length); for (let index = 0; index < sorted.length;) { let end = index + 1; while (end < sorted.length && sorted[end]!.value === sorted[index]!.value) end++; for (let item = index; item < end; item++) result[sorted[item]!.index] = (index + 1 + end) / 2; index = end; } return result; }
function pearson(left: number[], right: number[]) { if (left.length < 2) return null; const aMean = average(left)!, bMean = average(right)!; let numerator = 0, aSquares = 0, bSquares = 0; for (let index = 0; index < left.length; index++) { const a = left[index]! - aMean, b = right[index]! - bMean; numerator += a * b; aSquares += a * a; bSquares += b * b; } return aSquares > 0 && bSquares > 0 ? numerator / Math.sqrt(aSquares * bSquares) : null; }
function pct(value: number | null) { return value === null || !Number.isFinite(value) ? "-" : `${(value * 100).toFixed(2)}%`; }
function num(value: number | null) { return value === null || !Number.isFinite(value) ? "-" : value.toFixed(3); }
function table(lines: string[], rows: Record<string, unknown>[]) { if (rows.length === 0) { lines.push("No rows.", ""); return; } const headers = Object.keys(rows[0]!); lines.push(`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map(row => `| ${headers.map(header => String(row[header] ?? "-").replace(/\|/g, "\\|")).join(" | ")} |`), ""); }

await main();
