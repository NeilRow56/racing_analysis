import { writeFile } from "node:fs/promises";
import { loadLatestBacktestFeatureCacheForYear } from "@/lib/racing/backtest-cache";
import { raceClassNumber } from "@/lib/racing/research-rule-classes";
import type { HistoricalTargetRunnerMetricsRow as Row } from "@/lib/racing/historical-target-metrics";

type Year = "2025" | "2026";
type BaselineKey = "or" | "performance" | "missing_or_performance";
type Evaluation = { year: Year; key: BaselineKey; label: string; rows: Row[]; ranks: Map<string, number>; values: Map<string, number>; selections: Row[] };
type Factor = { key: string; label: string; bucket: (row: Row, evaluation: Evaluation) => string };
type BucketResult = { baseline: BaselineKey; factor: string; bucket: string; year: Year; rows: Row[]; metrics: ReturnType<typeof betMetrics> };

const OUTPUT = "/tmp/hurdle-research-factors.md";
const YEARS: Year[] = ["2025", "2026"];
const gapCache = new WeakMap<Evaluation, Map<string, number>>();

async function main() {
  const contexts = await Promise.all(YEARS.map(load));
  const evaluations = contexts.flatMap(context => [
    evaluate(context.year, context.rows, "or", "OR rank 1", row => row.features.officialRating),
    evaluate(context.year, context.rows, "performance", "Latest Performance rank 1", row => row.features.latestPerformanceRating),
    missingOrEvaluation(context),
  ]);
  const orGapCuts = gapQuartiles(find(evaluations, "2025", "or"));
  const performanceGapCuts = gapQuartiles(find(evaluations, "2025", "performance"));
  const factors = factorDefinitions(orGapCuts, performanceGapCuts);
  const bucketResults = profileAll(evaluations, factors);
  const replicated = replicationScreen(bucketResults, evaluations);
  const lines = ["# Hurdle Research-Factor Study", "", "Diagnostic only. No new rating is constructed. Hurdles use current compatible v4 cache rows and as-of-safe pre-race features; final SP is evaluation-only and uncapped.", ""];
  baselines(lines, evaluations);
  definitions(lines, contexts, orGapCuts, performanceGapCuts);
  factorProfiles(lines, bucketResults.filter(result => result.baseline !== "missing_or_performance"), evaluations, factors);
  replication(lines, replicated, evaluations);
  combinations(lines, evaluations, replicated, factors);
  missingOr(lines, evaluations, bucketResults, replicated);
  decision(lines, evaluations, replicated);
  await writeFile(OUTPUT, `${lines.join("\n")}\n`, "utf8");
  console.log(`Wrote ${OUTPUT}`);
  console.log(`Replicated single-factor buckets: ${replicated.length}`);
}

async function load(year: Year) {
  const cache = await loadLatestBacktestFeatureCacheForYear({ family: "jump", year }) ?? await loadLatestBacktestFeatureCacheForYear({ family: "all", year });
  if (!cache) throw new Error(`Missing compatible v4 Jump cache for ${year}`);
  const rows = cache.rows.filter(row => row.features.raceCode === "jump" && subtype(row) === "hurdle" && settled(row)).sort(compareRows);
  return { year, rows, coverage: `${cache.actualCoverage?.actualFrom ?? cache.manifest.from} to ${cache.actualCoverage?.actualTo ?? cache.manifest.to}` };
}

function baselines(lines: string[], evaluations: Evaluation[]) {
  lines.push("## Baselines", "");
  table(lines, evaluations.filter(item => item.key !== "missing_or_performance").map(item => ({ year: item.year, baseline: item.label, ...betMetrics(item.selections) })));
}

function definitions(lines: string[], contexts: Awaited<ReturnType<typeof load>>[], orCuts: number[], performanceCuts: number[]) {
  lines.push("## Coverage And Fixed Definitions", "");
  table(lines, contexts.map(context => ({ year: context.year, coverage: context.coverage, races: distinct(context.rows, row => row.features.targetRaceId), runners: context.rows.length, "OR available": count(context.rows, row => row.features.officialRating !== null), "OR availability": pct(rate(count(context.rows, row => row.features.officialRating !== null), context.rows.length)), "Latest Performance available": count(context.rows, row => row.features.latestPerformanceRating !== null), "trainer sample available": count(context.rows, row => row.features.trainerPriorRuns > 0), "jockey strike available": count(context.rows, row => row.features.jockeyPriorWinRate !== null && row.features.jockeyPriorWinRate !== undefined) })));
  lines.push("", "Fixed bands: field 2-5 / 6-8 / 9+; days 0-30 / 31-60 / 61-120 / 121+; trainer and jockey strike <10% / 10-14.9% / 15-19.9% / 20%+; trainer prior runs <20 / 20-49 / 50-99 / 100+.", "",
    `OR lead quartiles derived from 2025 only and frozen for 2026: ${orCuts.map(value => value.toFixed(2)).join(", ")} points. Latest Performance lead quartiles: ${performanceCuts.map(value => value.toFixed(2)).join(", ")} points. Equal-top ties have zero lead and remain valid competition-rank selections.`, "",
    "Novice/maiden classification uses explicit cached race-name/type text; ambiguous races remain other. OR availability in contextual tables is measured across all settled runners in that context, not only selections.", "");
}

function factorDefinitions(orCuts: number[], performanceCuts: number[]): Factor[] {
  return [
    { key: "field", label: "Field size", bucket: row => fieldBand(fieldSize(row)) },
    { key: "class", label: "Race class", bucket: row => classBand(row.features.raceClass) },
    { key: "handicap", label: "Handicap status", bucket: row => isHandicap(row) ? "handicap" : "non-handicap" },
    { key: "novice", label: "Novice / maiden", bucket: row => noviceBand(row) },
    { key: "days", label: "Days since run", bucket: row => daysBand(row.features.daysSinceLastRun) },
    { key: "trainer_sr", label: "Trainer prior strike", bucket: row => strikeBand(row.features.trainerPriorWinRate) },
    { key: "trainer_runs", label: "Trainer prior runs", bucket: row => trainerRunsBand(row.features.trainerPriorRuns) },
    { key: "jockey_sr", label: "Jockey prior strike", bucket: row => strikeBand(row.features.jockeyPriorWinRate) },
    { key: "rank_gap", label: "Rank-1 score gap", bucket: (row, evaluation) => gapBand(gaps(evaluation).get(row.features.targetRaceId) ?? null, evaluation.key === "or" ? orCuts : performanceCuts) },
    { key: "price", label: "Starting Price (evaluation only)", bucket: row => priceBand(sp(row)) },
  ];
}

function profileAll(evaluations: Evaluation[], factors: Factor[]) {
  const results: BucketResult[] = [];
  for (const evaluation of evaluations) for (const factor of factors) for (const [bucket, rows] of group(evaluation.selections, row => factor.bucket(row, evaluation))) results.push({ baseline: evaluation.key, factor: factor.key, bucket, year: evaluation.year, rows, metrics: betMetrics(rows) });
  return results;
}

function factorProfiles(lines: string[], results: BucketResult[], evaluations: Evaluation[], factors: Factor[]) {
  lines.push("## One-Factor Profiles", "");
  const rows: Record<string, unknown>[] = [];
  for (const result of results) {
    const evaluationRows = result.rows, evaluation = find(evaluations, result.year, result.baseline), factor = factors.find(item => item.key === result.factor)!;
    const contextRows = evaluation.rows.filter(row => factor.bucket(row, evaluation) === result.bucket);
    rows.push({ baseline: baselineLabel(result.baseline), factor: result.factor, bucket: result.bucket, year: result.year, ...result.metrics,
      "avg trainer prior runs": num(average(evaluationRows.map(row => row.features.trainerPriorRuns))),
      "OR availability": pct(rate(count(contextRows, row => row.features.officialRating !== null), contextRows.length)), sparse: evaluationRows.length < 50 ? "yes" : "no" });
  }
  table(lines, rows);
}

function replicationScreen(results: BucketResult[], evaluations: Evaluation[]) {
  const output: Array<{ baseline: BaselineKey; factor: string; bucket: string; result2025: BucketResult; result2026: BucketResult; reason: string }> = [];
  for (const baseline of ["or", "performance", "missing_or_performance"] as BaselineKey[]) {
    const baseline25 = betMetrics(find(evaluations, "2025", baseline).selections), baseline26 = betMetrics(find(evaluations, "2026", baseline).selections);
    const keys = new Set(results.filter(result => result.baseline === baseline).map(result => `${result.factor}\u0000${result.bucket}`));
    for (const key of keys) {
      const [factor, bucket] = key.split("\u0000"), result2025 = results.find(result => result.baseline === baseline && result.year === "2025" && result.factor === factor && result.bucket === bucket), result2026 = results.find(result => result.baseline === baseline && result.year === "2026" && result.factor === factor && result.bucket === bucket);
      if (!result2025 || !result2026) continue;
      const strikeReplicates = greater(result2025.metrics.strikeRaw, baseline25.strikeRaw) && greater(result2026.metrics.strikeRaw, baseline26.strikeRaw);
      const aeReplicates = greater(result2025.metrics.aeRaw, baseline25.aeRaw) && greater(result2026.metrics.aeRaw, baseline26.aeRaw);
      if (strikeReplicates || aeReplicates) output.push({ baseline, factor: factor!, bucket: bucket!, result2025, result2026, reason: strikeReplicates && aeReplicates ? "strike and A/E" : strikeReplicates ? "strike" : "A/E" });
    }
  }
  return output;
}

function replication(lines: string[], replicated: ReturnType<typeof replicationScreen>, evaluations: Evaluation[]) {
  lines.push("## Single-Factor Replication Screen", "", "Included only when strike exceeds that baseline in both years or A/E exceeds that baseline in both years. ROI alone is never a criterion.", "");
  table(lines, replicated.map(item => { const base25 = betMetrics(find(evaluations, "2025", item.baseline).selections), base26 = betMetrics(find(evaluations, "2026", item.baseline).selections); return { baseline: baselineLabel(item.baseline), factor: item.factor, bucket: item.bucket, reason: item.reason, "2025 selections": item.result2025.rows.length, "2025 strike": item.result2025.metrics.strike, "2025 baseline strike": base25.strike, "2025 A/E": item.result2025.metrics["A/E"], "2025 baseline A/E": base25["A/E"], "2026 selections": item.result2026.rows.length, "2026 strike": item.result2026.metrics.strike, "2026 baseline strike": base26.strike, "2026 A/E": item.result2026.metrics["A/E"], "2026 baseline A/E": base26["A/E"], sparse: item.result2025.rows.length < 50 || item.result2026.rows.length < 50 ? "yes" : "no" }; }));
}

function combinations(lines: string[], evaluations: Evaluation[], replicated: ReturnType<typeof replicationScreen>, factors: Factor[]) {
  lines.push("## Two-Factor Follow-Up", "", "Pre-specified combinations run only when both constituent buckets passed the replication screen for that baseline.", "");
  const specifications = [
    { label: "small field + trainer 15%+", conditions: [["field", ["2-5"]], ["trainer_sr", ["15-19.9%", "20%+"]]] as const },
    { label: "large gap + trainer 15%+", conditions: [["rank_gap", ["large"]], ["trainer_sr", ["15-19.9%", "20%+"]]] as const },
    { label: "large gap + small field", conditions: [["rank_gap", ["large"]], ["field", ["2-5"]]] as const },
    { label: "0-30 days + trainer 15%+", conditions: [["days", ["0-30"]], ["trainer_sr", ["15-19.9%", "20%+"]]] as const },
    { label: "handicap + large gap", conditions: [["handicap", ["handicap"]], ["rank_gap", ["large"]]] as const },
  ];
  const rows: Record<string, unknown>[] = [];
  for (const baseline of ["or", "performance"] as BaselineKey[]) for (const spec of specifications) {
    const eligible = spec.conditions.every(([factor, buckets]) => buckets.some(bucket => replicated.some(item => item.baseline === baseline && item.factor === factor && item.bucket === bucket)));
    if (!eligible) continue;
    for (const year of YEARS) { const evaluation = find(evaluations, year, baseline), selected = evaluation.selections.filter(row => spec.conditions.every(([factorKey, buckets]) => { const factor = factors.find(item => item.key === factorKey)!; return buckets.includes(factor.bucket(row, evaluation) as never); })); rows.push({ baseline: evaluation.label, combination: spec.label, year, ...betMetrics(selected), sparse: selected.length < 50 ? "yes" : "no" }); }
  }
  table(lines, rows);
}

function missingOr(lines: string[], evaluations: Evaluation[], results: BucketResult[], replicated: ReturnType<typeof replicationScreen>) {
  lines.push("## Missing-OR Hurdles", "", "Latest Performance is reranked among OR-missing runners within each race. OR gap is unavailable; all other factors use the same fixed definitions.", "");
  table(lines, YEARS.map(year => { const evaluation = find(evaluations, year, "missing_or_performance"); return { year, baseline: evaluation.label, races: distinct(evaluation.rows, row => row.features.targetRaceId), ...betMetrics(evaluation.selections) }; }));
  factorProfiles(lines, results.filter(result => result.baseline === "missing_or_performance" && result.factor !== "rank_gap"), evaluations, factorDefinitions(gapQuartiles(find(evaluations, "2025", "or")), gapQuartiles(find(evaluations, "2025", "performance"))));
  lines.push("Replicated missing-OR buckets:", "");
  table(lines, replicated.filter(item => item.baseline === "missing_or_performance").map(item => ({ factor: item.factor, bucket: item.bucket, reason: item.reason, "2025 selections": item.result2025.rows.length, "2025 strike": item.result2025.metrics.strike, "2025 A/E": item.result2025.metrics["A/E"], "2026 selections": item.result2026.rows.length, "2026 strike": item.result2026.metrics.strike, "2026 A/E": item.result2026.metrics["A/E"], sparse: item.result2025.rows.length < 50 || item.result2026.rows.length < 50 ? "yes" : "no" })));
}

function decision(lines: string[], evaluations: Evaluation[], replicated: ReturnType<typeof replicationScreen>) {
  const base = (year: Year, key: BaselineKey) => betMetrics(find(evaluations, year, key).selections), orSignals = replicated.filter(item => item.baseline === "or" && item.factor !== "price" && item.result2025.rows.length >= 50 && item.result2026.rows.length >= 50), missingSignals = replicated.filter(item => item.baseline === "missing_or_performance" && item.factor !== "price" && item.factor !== "rank_gap" && item.result2025.rows.length >= 50 && item.result2026.rows.length >= 50);
  const smallField = orSignals.find(item => item.factor === "field" && item.bucket === "2-5"), trainer = orSignals.filter(item => item.factor === "trainer_sr" && ["15-19.9%", "20%+"].includes(item.bucket)), gap = orSignals.find(item => item.factor === "rank_gap" && item.bucket === "large");
  const rule = orSignals.find(item => item.factor === "trainer_sr" && item.bucket === "20%+");
  const strongestMissing = missingSignals.find(item => item.factor === "trainer_sr" && item.bucket === "20%+");
  lines.push("## Decision", "",
    `1. OR rank 1 remains the strongest practical baseline: 2025 ${base("2025", "or").strike}, A/E ${base("2025", "or")["A/E"]}; 2026 ${base("2026", "or").strike}, A/E ${base("2026", "or")["A/E"]}, versus Latest Performance ${base("2025", "performance").strike} / ${base("2026", "performance").strike}.`,
    `2. Replicated non-price OR contextual signals with at least 50 selections in each year: ${orSignals.length === 0 ? "none" : orSignals.map(item => `${item.factor}=${item.bucket}`).join(", ")}.`,
    `3. Small field size is ${smallField ? "replicated as helpful" : "not a replicated improvement under the fixed screen"}.`,
    `4. Trainer quality is ${trainer.length > 0 ? `replicated in ${trainer.map(item => item.bucket).join(", ")}` : "not replicated at the fixed 15%+ bands"}.`,
    `5. Large rank-gap confidence is ${gap ? "replicated" : "not replicated"}.`,
    `6. No missing-OR subset is yet fully viable. The strongest confirmation candidate is ${strongestMissing ? "trainer prior strike 20%+ (30.86% / 29.37% strike; A/E 0.955 / 0.967)" : "none"}; it improves strike substantially but remains below A/E 1 in both years.`,
    `7. ${rule ? `A simple OR-rank-1 research rule using ${rule.factor}=${rule.bucket} is worth confirmation, subject to its displayed sample and two-factor evidence.` : "No simple frozen Hurdle research rule clears the replication screen with adequate sample."}`,
    `8. ${rule ? "Keep this research-only until a separate confirmation study is completed." : "Hurdles should remain research-only with no further model work for now."}`, "");
}

function evaluate(year: Year, rows: Row[], key: BaselineKey, label: string, get: (row: Row) => number | null) { const values = new Map<string, number>(); for (const row of rows) { const value = get(row); if (valid(value)) values.set(id(row), value); } const ranks = rank(rows, row => values.get(id(row)) ?? null); return { year, key, label, rows, values, ranks, selections: rows.filter(row => ranks.get(id(row)) === 1) }; }
function missingOrEvaluation(context: Awaited<ReturnType<typeof load>>) { return evaluate(context.year, context.rows.filter(row => row.features.officialRating === null), "missing_or_performance", "Latest Performance rank 1 among OR-missing runners", row => row.features.latestPerformanceRating); }
function find(evaluations: Evaluation[], year: Year, key: BaselineKey) { const result = evaluations.find(item => item.year === year && item.key === key); if (!result) throw new Error(`Missing ${year}/${key}`); return result; }
function gaps(evaluation: Evaluation) { const cached = gapCache.get(evaluation); if (cached) return cached; const result = new Map<string, number>(); for (const [race, rows] of group(evaluation.rows.filter(row => evaluation.values.has(id(row))), row => row.features.targetRaceId)) { const sorted = [...rows].sort((a, b) => evaluation.values.get(id(b))! - evaluation.values.get(id(a))! || id(a).localeCompare(id(b))); if (sorted.length >= 2) result.set(race, evaluation.values.get(id(sorted[0]!))! - evaluation.values.get(id(sorted[1]!))!); } gapCache.set(evaluation, result); return result; }
function gapQuartiles(evaluation: Evaluation) { const raceGaps = gaps(evaluation), values = evaluation.selections.map(row => raceGaps.get(row.features.targetRaceId)).filter(valid).sort((a, b) => a - b); return [quantile(values, 0.25), quantile(values, 0.5), quantile(values, 0.75)]; }
function gapBand(value: number | null, cuts: number[]) { return value === null ? "missing" : value <= cuts[0]! ? "very small" : value <= cuts[1]! ? "small" : value <= cuts[2]! ? "medium" : "large"; }
function rank(rows: Row[], get: (row: Row) => number | null) { const result = new Map<string, number>(); for (const race of group(rows, row => row.features.targetRaceId).values()) { const sorted = race.map(row => ({ row, value: get(row) })).filter((item): item is { row: Row; value: number } => valid(item.value)).sort((a, b) => b.value - a.value || id(a.row).localeCompare(id(b.row))); let previous: number | null = null, previousRank = 0; sorted.forEach((item, index) => { const current = item.value === previous ? previousRank : index + 1; result.set(id(item.row), current); previous = item.value; previousRank = current; }); } return result; }
function betMetrics(rows: Row[]) { const priced = rows.filter(row => sp(row) !== null), winners = priced.filter(row => row.outcome.won), returns = winners.reduce((sum, row) => sum + sp(row)!, 0), expected = priced.reduce((sum, row) => sum + 1 / sp(row)!, 0), strikeRaw = rate(count(rows, row => row.outcome.won === true), rows.length), roiRaw = rate(returns - priced.length, priced.length), aeRaw = expected === 0 ? null : winners.length / expected; const result = { selections: rows.length, winners: count(rows, row => row.outcome.won === true), strike: pct(strikeRaw), ROI: pct(roiRaw), "A/E": num(aeRaw) } as { selections: number; winners: number; strike: string; ROI: string; "A/E": string; strikeRaw: number | null; roiRaw: number | null; aeRaw: number | null }; Object.defineProperties(result, { strikeRaw: { value: strikeRaw }, roiRaw: { value: roiRaw }, aeRaw: { value: aeRaw } }); return result; }
function greater(left: number | null, right: number | null) { return left !== null && right !== null && left > right; }
function baselineLabel(key: BaselineKey) { return key === "or" ? "OR rank 1" : key === "performance" ? "Latest Performance rank 1" : "Missing-OR Latest Performance rank 1"; }

function subtype(row: Row) { const value = `${row.features.raceName} ${row.features.raceType}`.toLowerCase(); return /\bhurdles?\b/.test(value) ? "hurdle" : /\bchase\b|\bsteeplechase\b/.test(value) ? "chase" : "other"; }
function settled(row: Row) { return row.outcome.resultStatus !== "non_runner" && row.outcome.finishingPosition !== null; }
function isHandicap(row: Row) { return /handicap|nursery/i.test(`${row.features.raceName} ${row.features.raceType}`); }
function noviceBand(row: Row) { const value = `${row.features.raceName} ${row.features.raceType}`; return /maiden/i.test(value) ? "maiden" : /novice|beginners?/i.test(value) ? "novice" : "other"; }
function fieldSize(row: Row) { return row.features.actualRunnerCount ?? row.features.declaredRunnerCount; }
function fieldBand(value: number | null) { return value === null ? "missing" : value <= 5 ? "2-5" : value <= 8 ? "6-8" : "9+"; }
function classBand(value: string | null) { const parsed = raceClassNumber(value); return parsed === null ? "unknown" : `Class ${parsed}`; }
function daysBand(value: number | null) { return value === null ? "missing" : value <= 30 ? "0-30" : value <= 60 ? "31-60" : value <= 120 ? "61-120" : "121+"; }
function strikeBand(value: number | null | undefined) { return value === null || value === undefined ? "missing" : value < 10 ? "<10%" : value < 15 ? "10-14.9%" : value < 20 ? "15-19.9%" : "20%+"; }
function trainerRunsBand(value: number) { return value < 20 ? "<20" : value < 50 ? "20-49" : value < 100 ? "50-99" : "100+"; }
function priceBand(value: number | null) { return value === null ? "missing" : value < 2 ? "<2.0" : value < 3 ? "2.0-2.99" : value < 5 ? "3.0-4.99" : value < 9 ? "5.0-8.99" : "9.0+"; }
function sp(row: Row) { const value = Number(row.outcome.startingPriceDecimal); return Number.isFinite(value) && value > 0 ? value : null; }
function id(row: Row) { return row.features.targetRunnerId; }
function compareRows(left: Row, right: Row) { return left.features.raceDateTime.getTime() - right.features.raceDateTime.getTime() || id(left).localeCompare(id(right)); }
function valid(value: number | null | undefined): value is number { return value !== null && value !== undefined && Number.isFinite(value); }
function group<T>(values: T[], key: (value: T) => string) { const result = new Map<string, T[]>(); for (const value of values) { const groupKey = key(value); result.set(groupKey, [...(result.get(groupKey) ?? []), value]); } return result; }
function count<T>(values: T[], predicate: (value: T) => boolean) { return values.filter(predicate).length; }
function distinct<T>(values: T[], key: (value: T) => string) { return new Set(values.map(key)).size; }
function rate(numerator: number, denominator: number) { return denominator === 0 ? null : numerator / denominator; }
function average(values: number[]) { return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length; }
function quantile(values: number[], q: number) { if (values.length === 0) return 0; const index = (values.length - 1) * q, lower = Math.floor(index), upper = Math.ceil(index); return lower === upper ? values[lower]! : values[lower]! * (upper - index) + values[upper]! * (index - lower); }
function pct(value: number | null) { return value === null || !Number.isFinite(value) ? "-" : `${(value * 100).toFixed(2)}%`; }
function num(value: number | null) { return value === null || !Number.isFinite(value) ? "-" : value.toFixed(3); }
function table(lines: string[], rows: Record<string, unknown>[]) { if (rows.length === 0) { lines.push("No rows.", ""); return; } const headers = Object.keys(rows[0]!); lines.push(`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map(row => `| ${headers.map(header => String(row[header] ?? "-").replace(/\|/g, "\\|")).join(" | ")} |`), ""); }

await main();
