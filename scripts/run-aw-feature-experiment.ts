import { writeFile } from "node:fs/promises";
import { createDbConnection } from "@/db";
import { AW_TISSUE_FEATURES } from "@/lib/racing/aw-tissue-model";
import { getAwSpeedRatingsAsOfRuns } from "@/lib/racing/aw-speed-ratings";
import { isSupportedAllWeatherRace, type AwSpeedRating } from "@/lib/racing/aw-speed-rating";
import { calculateHorseMetricsAsOf, type HistoricalRunInput } from "@/lib/racing/horse-metrics";
import { classifyHandicapStatus } from "@/lib/racing/research-rule";
import { isVoidBetResultStatus, settleSelection } from "@/lib/racing/backtest";

const OUTPUT = "/tmp/aw-feature-experiment";
const DAY = 86_400_000;
const EPOCHS = 90;
const L2 = 0.02;
const FOLDS = [
  { name: "2025-Q3", trainTo: "2025-06-30", from: "2025-07-01", to: "2025-09-30" },
  { name: "2025-Q4", trainTo: "2025-09-30", from: "2025-10-01", to: "2025-12-31" },
  { name: "2026-H1", trainTo: "2025-12-31", from: "2026-01-01", to: "2026-06-30" },
  { name: "2026-H2", trainTo: "2026-06-30", from: "2026-07-01", to: "2026-12-31" },
] as const;
const FAMILIES = {
  jockey: ["jockey_form_14d", "jockey_form_delta_14d", "jockey_recent_sample_depth"],
  combination: ["combination_rate", "combination_delta", "combination_depth"],
  surface: ["surface_starts", "surface_speed", "surface_best_speed", "surface_performance_delta", "surface_speed_depth"],
  courseDistance: ["course_starts", "course_speed_delta", "distance_starts", "distance_speed_delta", "course_distance_starts", "course_distance_speed_delta"],
  draw: ["draw_normalised", "draw_context_effect", "draw_context_depth", "draw_context_interaction"],
  pace: ["front_tendency", "prominent_tendency", "held_up_tendency", "style_consistency", "likely_leaders", "pace_pressure"],
  confidence: ["usable_aw_runs", "usable_l3_runs", "latest_aw_age", "speed_sd", "speed_best_minus_average"],
  trend: ["speed_latest_minus_average", "speed_slope_l3", "speed_improving", "speed_declining"],
  classMovement: ["class_up", "class_down", "class_same", "class_move_magnitude"],
  orRelativity: ["or_rank", "or_gap_rank2", "or_field_delta", "or_change"],
} as const;
type Family = keyof typeof FAMILIES;
type Values = Record<string, number | null>;
type Classification = "NO SIGNAL" | "WEAK / UNSTABLE" | "MODEST REPLICATED SIGNAL" | "STRONG REPLICATED SIGNAL";
type Raw = {
  raceId: string; runnerId: string; horseId: string; trainerId: string | null; jockeyId: string | null;
  raceDate: string; raceDateTime: unknown; courseId: string; courseName: string; surface: string | null;
  raceName: string | null; raceType: string | null; raceTypeCode: string | null; raceClass: string | null;
  distanceYards: number | null; going: string | null; declaredRunnerCount: number | null; actualRunnerCount: number | null;
  finishingPosition: number | null; resultStatus: string | null; outcomeCode: string | null;
  racingPostRating: number | null; topspeedRating: number | null; officialRating: number | null;
  weightCarriedLbs: number | null; horseAge: number | null; draw: number | null;
  startingPriceDecimal: string | null; isFavourite: boolean | null; runnerComment: string | null; winningTime: string | null;
};
export type Run = Raw & { time: number; raceDateTime: Date; aw: boolean; surfaceGroup: string; speed: number | null; awSpeedRating: AwSpeedRating | null };
export type Example = { row: Run; won: boolean; values: Values; probabilities: Record<string, number> };
type Race = Example[];
type Model = { names: string[]; means: number[]; scales: number[]; weights: number[] };
type Metrics = { races: number; runners: number; rank1: number; top2: number; top3: number; logLoss: number; brier: number; calibrationMae: number };
type Comparison = { candidate: string; fold: string; trainPeriod: string; validationPeriod: string; trainRaces: number; metrics: Metrics; deltaLogLoss: number; deltaBrier: number; deltaRank1: number };
type Candidate = { id: string; families: Family[] };
const BASELINE = [...AW_TISSUE_FEATURES];
const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
const finite = (x: number | null | undefined): x is number => typeof x === "number" && Number.isFinite(x);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
function groupBy<T>(xs: T[], key: (x: T) => string) {
  const groups = new Map<string, T[]>();
  for (const x of xs) { const k = key(x); const group = groups.get(k) ?? []; group.push(x); groups.set(k, group); }
  return groups;
}

export function timestamp(value: unknown): number {
  const result = value instanceof Date ? value.getTime() : typeof value === "string" && value.trim() ? Date.parse(value) : NaN;
  if (!Number.isFinite(result)) throw new Error(`Invalid or missing race timestamp: ${String(value)}`);
  return result;
}
export function regularisedRate(wins: number, runs: number, baseline: number, depth = 20) {
  return (wins + depth * baseline) / (runs + depth);
}
export function distanceBand(yards: number | null) {
  if (yards === null) return "unknown";
  const furlongs = yards / 220;
  return furlongs <= 6.5 ? "5-6f" : furlongs <= 8.5 ? "7-8f" : furlongs <= 10.5 ? "9-10f" : furlongs <= 12.5 ? "11-12f" : "13f+";
}
function fieldBand(n: number) { return n <= 7 ? "2-7" : n <= 11 ? "8-11" : "12+"; }
function classNumber(value: string | null) { const match = value?.match(/\d+/); return match ? Number(match[0]) : null; }
function surfaceGroup(row: Raw) {
  const value = row.surface?.toUpperCase();
  if (value === "POLYTRACK") return "Polytrack";
  if (value === "TAPETA") return "Tapeta";
  // ALLWEATHER is the source's label for Tapeta at these courses in the study period.
  if (value === "ALLWEATHER" || !value) {
    if (["newcastle", "wolverhampton"].includes(row.courseName.toLowerCase())) return "Tapeta";
    if (row.courseName.toLowerCase() === "southwell") return row.raceDate >= "2021-12-07" ? "Tapeta" : "Fibresand";
    if (["kempton", "lingfield", "chelmsford city", "dundalk"].includes(row.courseName.toLowerCase())) return "Polytrack";
  }
  return value ?? "Unknown";
}
export function priorWindow(runs: Run[], time: number, days: number) { return runs.filter((run) => run.time < time && run.time >= time - days * DAY); }
export function parseOpeningStyle(comment: string | null): "front" | "prominent" | "midfield" | "held_up" | "unknown" {
  const opening = (comment ?? "").split(/[,;]/)[0]!.trim();
  if (/\b(?:led|prominent|held up|in rear)\b.*\b(?:out|remaining|final|furlong)\b/i.test(opening)) return "unknown";
  if (/^(?:made (?:virtually )?all|led(?:\s|$)|soon led)/i.test(opening)) return "front";
  if (/^(?:held up|in rear|towards rear)/i.test(opening)) return "held_up";
  if (/^(?:prominent|tracked leaders|chased leaders|close up)/i.test(opening)) return "prominent";
  if (/^(?:midfield|mid-division|in touch)/i.test(opening)) return "midfield";
  return "unknown";
}
export function drawEffect(wins: number, expected: number, races: number) {
  return races < 30 ? 0 : (wins - expected) / (expected + 20);
}
function participantRate(runs: Run[]) { return runs.length ? runs.filter((r) => r.finishingPosition === 1).length / runs.length : null; }
function started(row: Raw) { return !isVoidBetResultStatus(row.resultStatus) && !/non.?runner|withdrawn/i.test(row.outcomeCode ?? "") && (row.resultStatus !== null || row.finishingPosition !== null); }
function validParticipantRun(row: Run) { return started(row) && row.finishingPosition !== null; }
function speedSummary(runs: Run[]) {
  const speeds = runs.map((r) => r.speed).filter(finite);
  return { count: speeds.length, average: mean(speeds), best: speeds.length ? Math.max(...speeds) : null };
}
function performance(row: Run) { return row.speed === null || row.weightCarriedLbs === null ? null : row.speed + row.weightCarriedLbs - 168; }
function relativeSummary(runs: Run[], baseline: number | null) {
  const summary = speedSummary(runs);
  return { ...summary, delta: baseline !== null && summary.average !== null ? (summary.average - baseline) * summary.count / (summary.count + 5) : null };
}
function drawZone(value: number) { return value < 1 / 3 ? "low" : value < 2 / 3 ? "middle" : "high"; }

export function buildExamples(rows: Run[]) {
  const horse = new Map<string, Run[]>(), jockey = new Map<string, Run[]>(), trainer = new Map<string, Run[]>(), pairs = new Map<string, Run[]>();
  const drawCells = new Map<string, { wins: number; expected: number; races: Set<string>; runners: number }>();
  const examples: Example[] = [];
  const exclusions: Record<string, number> = {};
  const add = (map: Map<string, Run[]>, key: string | null, row: Run) => { if (key) { const history = map.get(key) ?? []; history.push(row); map.set(key, history); } };
  const ordered = [...rows].sort((a, b) => a.time - b.time || a.raceId.localeCompare(b.raceId) || a.runnerId.localeCompare(b.runnerId));
  for (const timeRows of groupBy(ordered, (r) => String(r.time)).values()) {
    for (const raceRows of groupBy(timeRows, (r) => r.raceId).values()) {
      const target = raceRows[0]!;
      if (!target.aw || target.raceDate < "2025-01-01" || target.raceDate > "2026-12-31") continue;
      const active = raceRows.filter(started);
      const labels = active.map((r) => settleSelection({ targetRaceId: r.raceId, targetRunnerId: r.runnerId, finishingPosition: r.finishingPosition, resultStatus: r.resultStatus, won: r.finishingPosition === null ? null : r.finishingPosition === 1, placed: null, startingPrice: null, startingPriceDecimal: "2" }));
      const reason = active.length < 2 ? "fewer than two starters" : new Set(active.map((r) => r.runnerId)).size !== active.length ? "duplicate runner" :
        target.actualRunnerCount === null || (target.actualRunnerCount !== active.length && target.actualRunnerCount !== raceRows.length) ? "incomplete/unverified field" :
          labels.some((label) => label === null) ? "unresolved outcome" : labels.filter((label) => label!.grossReturn > 0).length !== 1 ? "multi-winner/no-winner" : null;
      if (reason) { exclusions[reason] = (exclusions[reason] ?? 0) + 1; continue; }
      const ratings = active.map((r) => r.officialRating).filter(finite).sort((a, b) => b - a);
      const raceExamples: Example[] = [];
      for (const [index, row] of active.entries()) {
        const horseRuns = horse.get(row.horseId) ?? [];
        const awRuns = horseRuns.filter((r) => r.aw);
        const canonicalRuns = horseRuns.filter((r) => Boolean(r.winningTime?.trim()));
        const metrics = calculateHorseMetricsAsOf({ runs: canonicalRuns satisfies HistoricalRunInput[], beforeDateTime: row.raceDateTime, targetCourseId: row.courseId, targetDistanceYards: row.distanceYards, targetGoing: row.going, targetWeightCarriedLbs: row.weightCarriedLbs });
        const j = row.jockeyId ? jockey.get(row.jockeyId) ?? [] : [];
        const t = row.trainerId ? trainer.get(row.trainerId) ?? [] : [];
        const combination = row.trainerId && row.jockeyId ? pairs.get(`${row.trainerId}:${row.jockeyId}`) ?? [] : [];
        const jBaseline = participantRate(j), tBaseline = participantRate(t);
        const baselineRate = jBaseline ?? 0.1;
        const handicap = classifyHandicapStatus(row);
        const values: Values = {
          avg_l3_aw_speed: metrics.averageAwSpeedLast3, trainer_prior_rate: tBaseline === null ? null : tBaseline * 100,
          jockey_prior_rate: jBaseline === null ? null : jBaseline * 100, declared_field_size: row.declaredRunnerCount,
          class: classNumber(row.raceClass), distance_furlongs: row.distanceYards === null ? null : row.distanceYards / 220,
          handicap: handicap === "unknown" ? null : handicap === "handicap" ? 1 : 0,
          latest_aw_speed: metrics.latestAwSpeedRating, best_l3_aw_speed: metrics.bestAwSpeedLast3,
          avg_l3_aw_performance: metrics.averageAwPerformanceLast3, latest_aw_performance: metrics.latestAwPerformanceRating,
          official_rating: row.officialRating, prior_aw_starts: canonicalRuns.filter((r) => r.aw).length,
          age: row.horseAge, draw: row.draw, days_since_run: metrics.daysSinceLastRun,
        };
        for (const days of [7, 14, 30, 60]) {
          const recent = priorWindow(j, row.time, days), wins = recent.filter((r) => r.finishingPosition === 1).length;
          values[`jockey_${days}d_runs`] = recent.length; values[`jockey_${days}d_wins`] = wins;
          values[`jockey_${days}d_strike`] = participantRate(recent); values[`jockey_${days}d_log_runs`] = Math.log1p(recent.length);
          values[`jockey_${days}d_regularised`] = regularisedRate(wins, recent.length, baselineRate);
        }
        values.jockey_form_14d = row.jockeyId ? values.jockey_14d_regularised! : null;
        values.jockey_form_delta_14d = row.jockeyId ? values.jockey_form_14d! - baselineRate : null;
        values.jockey_recent_sample_depth = row.jockeyId ? values.jockey_14d_log_runs! : null;
        values.combination_depth = Math.log1p(combination.length);
        values.combination_runs = combination.length; values.combination_wins = combination.filter((r) => r.finishingPosition === 1).length;
        values.combination_strike = participantRate(combination);
        const pairBaseline = mean([jBaseline, tBaseline].filter(finite)) ?? 0.1;
        values.combination_rate = row.jockeyId && row.trainerId ? regularisedRate(values.combination_wins, combination.length, pairBaseline, 30) : null;
        values.combination_delta = values.combination_rate === null ? null : values.combination_rate! - pairBaseline;
        const generic = speedSummary(awRuns), surfaceRuns = awRuns.filter((r) => r.surfaceGroup === row.surfaceGroup);
        const surface = speedSummary(surfaceRuns), overallPerformance = mean(awRuns.map(performance).filter(finite)), surfacePerformance = mean(surfaceRuns.map(performance).filter(finite));
        values.surface_starts = surfaceRuns.length; values.surface_wins = surfaceRuns.filter((r) => r.finishingPosition === 1).length;
        values.surface_speed = surface.average; values.surface_best_speed = surface.best; values.surface_speed_depth = surface.count;
        values.surface_performance_delta = surfacePerformance !== null && overallPerformance !== null ? (surfacePerformance - overallPerformance) * surfaceRuns.map(performance).filter(finite).length / (surfaceRuns.map(performance).filter(finite).length + 5) : null;
        for (const [name, history] of [
          ["course", awRuns.filter((r) => r.courseId === row.courseId)],
          ["distance", awRuns.filter((r) => distanceBand(r.distanceYards) === distanceBand(row.distanceYards) && row.distanceYards !== null)],
          ["course_distance", awRuns.filter((r) => r.courseId === row.courseId && distanceBand(r.distanceYards) === distanceBand(row.distanceYards) && row.distanceYards !== null)],
        ] as const) {
          const summary = relativeSummary(history, generic.average);
          values[`${name}_starts`] = history.length; values[`${name}_speed`] = summary.average;
          values[`${name}_speed_depth`] = summary.count; values[`${name}_speed_delta`] = summary.delta;
        }
        const draw = row.draw !== null && row.draw > 0 && row.declaredRunnerCount !== null && row.declaredRunnerCount >= row.draw && row.declaredRunnerCount > 1 ? (row.draw - 1) / (row.declaredRunnerCount - 1) : null;
        const contextKey = `${row.courseId}:${distanceBand(row.distanceYards)}:${row.surfaceGroup}:${fieldBand(row.declaredRunnerCount ?? active.length)}`;
        const cell = draw === null ? undefined : drawCells.get(`${contextKey}:${drawZone(draw)}`);
        values.draw_normalised = draw; values.draw_context_effect = draw === null ? null : drawEffect(cell?.wins ?? 0, cell?.expected ?? 0, cell?.races.size ?? 0);
        values.draw_context_depth = draw === null ? null : Math.log1p(cell?.runners ?? 0);
        values.draw_context_interaction = draw === null ? null : (draw - 0.5) * values.draw_context_effect!;
        const usable = awRuns.filter((r) => r.speed !== null).slice(-3), speeds = usable.map((r) => r.speed!).filter(finite), average = mean(speeds);
        values.usable_aw_runs = generic.count; values.usable_l3_runs = canonicalRuns.slice(-3).filter((r) => r.speed !== null).length;
        values.latest_aw_age = usable.length ? (row.time - usable.at(-1)!.time) / DAY : null;
        values.speed_sd = speeds.length >= 2 ? Math.sqrt(mean(speeds.map((s) => (s - average!) ** 2))!) : null;
        values.speed_best_minus_average = average === null ? null : Math.max(...speeds) - average;
        values.speed_latest_minus_average = speeds.length >= 2 ? speeds.at(-1)! - mean(speeds.slice(0, -1))! : null;
        values.speed_slope_l3 = speeds.length === 3 ? (speeds[2]! - speeds[0]!) / 2 : null;
        values.speed_improving = values.speed_slope_l3 === null ? null : values.speed_slope_l3! > 2 ? 1 : 0;
        values.speed_declining = values.speed_slope_l3 === null ? null : values.speed_slope_l3! < -2 ? 1 : 0;
        values.speed_flat = values.speed_slope_l3 === null ? null : Math.abs(values.speed_slope_l3!) <= 2 ? 1 : 0;
        const previous = horseRuns.at(-1), currentClass = classNumber(row.raceClass), previousClass = previous ? classNumber(previous.raceClass) : null;
        const move = currentClass !== null && previousClass !== null ? previousClass - currentClass : null;
        values.class_up = move === null ? null : move > 0 ? 1 : 0; values.class_down = move === null ? null : move < 0 ? 1 : 0;
        values.class_same = move === null ? null : move === 0 ? 1 : 0; values.class_move_magnitude = move === null ? null : Math.abs(move);
        values.or_rank = row.officialRating === null ? null : 1 + ratings.filter((r) => r > row.officialRating!).length;
        values.or_gap_rank2 = row.officialRating !== null && ratings.length >= 2 ? row.officialRating - ratings[1]! : null;
        values.or_field_delta = row.officialRating === null || !ratings.length ? null : row.officialRating - mean(ratings)!;
        values.or_change = row.officialRating !== null && previous?.officialRating != null ? row.officialRating - previous.officialRating : null;
        const styleRuns = awRuns.slice(-5).map((r) => parseOpeningStyle(r.runnerComment)), known = styleRuns.filter((s) => s !== "unknown");
        for (const [name, style] of [["front_tendency", "front"], ["prominent_tendency", "prominent"], ["held_up_tendency", "held_up"]] as const) values[name] = known.length >= 2 ? known.filter((s) => s === style).length / known.length : null;
        values.style_known_runs = known.length; values.style_consistency = known.length >= 2 ? Math.max(...["front", "prominent", "midfield", "held_up"].map((s) => known.filter((k) => k === s).length / known.length)) : null;
        const example: Example = { row, won: labels[index]!.grossReturn > 0, values, probabilities: {} };
        raceExamples.push(example);
      }
      const leaders = raceExamples.filter((e) => (e.values.front_tendency ?? 0) >= 0.5).length;
      for (const example of raceExamples) { example.values.likely_leaders = leaders; example.values.pace_pressure = example.values.front_tendency === null ? null : example.values.front_tendency! * Math.max(0, leaders - 1); }
      examples.push(...raceExamples);
    }
    // Update every race at this timestamp only after all targets have been evaluated.
    for (const raceRows of groupBy(timeRows, (r) => r.raceId).values()) {
      const active = raceRows.filter(started), winnerCount = active.filter((r) => r.finishingPosition === 1).length;
      const expectedCount = raceRows[0]!.actualRunnerCount;
      const completeDrawField = active.length >= 2 && expectedCount !== null &&
        (expectedCount === active.length || expectedCount === raceRows.length) &&
        active.every((r) => r.finishingPosition !== null);
      for (const row of active) {
        add(horse, row.horseId, row);
        if (validParticipantRun(row)) { add(jockey, row.jockeyId, row); add(trainer, row.trainerId, row); add(pairs, row.trainerId && row.jockeyId ? `${row.trainerId}:${row.jockeyId}` : null, row); }
        if (!completeDrawField || !row.aw || winnerCount !== 1 || row.distanceYards === null || row.draw === null || row.draw <= 0 || row.declaredRunnerCount === null || row.declaredRunnerCount < row.draw || row.declaredRunnerCount < 2) continue;
        const norm = (row.draw - 1) / (row.declaredRunnerCount - 1);
        const key = `${row.courseId}:${distanceBand(row.distanceYards)}:${row.surfaceGroup}:${fieldBand(row.declaredRunnerCount)}:${drawZone(norm)}`;
        const cell = drawCells.get(key) ?? { wins: 0, expected: 0, races: new Set<string>(), runners: 0 };
        cell.wins += row.finishingPosition === 1 ? 1 : 0; cell.expected += 1 / active.length; cell.races.add(row.raceId); cell.runners++; drawCells.set(key, cell);
      }
    }
  }
  return { examples, exclusions, drawCells: drawCells.size };
}

function namesFor(families: Family[]) { const names = [...BASELINE, ...families.flatMap((f) => [...FAMILIES[f]])]; return [...names, ...names.map((n) => `${n}_missing`)]; }
function rawVector(e: Example, families: Family[]) { const values = [...BASELINE, ...families.flatMap((f) => [...FAMILIES[f]])].map((n) => finite(e.values[n]) ? e.values[n]! : null); return [...values, ...values.map((v) => v === null ? 1 : 0)]; }
function softmax(scores: number[]) { const max = Math.max(...scores), xs = scores.map((s) => Math.exp(s - max)), total = sum(xs); const p = xs.map((x) => x / total); if (p.some((x) => !Number.isFinite(x) || x <= 0)) throw new Error("Invalid probability book"); return p; }
function marketBook(race: Race) { const implied = race.map((e) => Number(e.row.startingPriceDecimal)); if (race.some((e) => e.row.startingPriceDecimal === null) || implied.some((p) => !Number.isFinite(p) || p <= 1)) return null; const total = sum(implied.map((p) => 1 / p)); return implied.map((p) => (1 / p) / total); }
function dot(a: number[], b: number[]) { let total = 0; for (let i = 0; i < a.length; i++) total += a[i]! * b[i]!; return total; }
function fit(races: Race[], families: Family[], market: boolean): Model {
  if (!races.length) throw new Error("Empty training sample");
  const examples = races.flat(), names = namesFor(families), raw = examples.map((e) => rawVector(e, families));
  const means = names.map((_, j) => mean(raw.flatMap((r) => r[j] === null ? [] : [r[j]!])) ?? 0);
  const scales = names.map((_, j) => Math.max(Math.sqrt(mean(raw.map((r) => ((r[j] ?? means[j]!) - means[j]!) ** 2))!), 1e-6));
  const matrix = raw.map((r) => r.map((v, j) => ((v ?? means[j]!) - means[j]!) / scales[j]!));
  let position = 0;
  const groups = races.map((race) => { const offset = position; position += race.length; return { offset, length: race.length, market: market ? marketBook(race)!.map(Math.log) : race.map(() => 0) }; });
  const weights = names.map(() => 0);
  for (let epoch = 0; epoch < EPOCHS; epoch++) {
    const gradient = names.map(() => 0);
    for (const g of groups) {
      const p = softmax(Array.from({ length: g.length }, (_, i) => dot(weights, matrix[g.offset + i]!) + g.market[i]!));
      for (let k = 0; k < g.length; k++) { const i = g.offset + k, error = (examples[i]!.won ? 1 : 0) - p[k]!; for (let j = 0; j < weights.length; j++) gradient[j]! += error * matrix[i]![j]!; }
    }
    const rate = 0.12 / Math.sqrt(1 + epoch / 10);
    for (let j = 0; j < weights.length; j++) weights[j]! += rate * (gradient[j]! / races.length - L2 * weights[j]!);
  }
  return { names, means, scales, weights };
}
function predict(races: Race[], candidate: Candidate, model: Model, market = false, suffix = "") {
  for (const race of races) {
    const offset = market ? marketBook(race)!.map(Math.log) : race.map(() => 0);
    const p = softmax(race.map((e, i) => dot(model.weights, rawVector(e, candidate.families).map((v, j) => ((v ?? model.means[j]!) - model.means[j]!) / model.scales[j]!)) + offset[i]!));
    race.forEach((e, i) => { e.probabilities[candidate.id + suffix] = p[i]!; });
  }
}
function metrics(races: Race[], id: string): Metrics {
  if (!races.length) throw new Error(`Empty evaluation sample: ${id}`);
  const captures = [1, 2, 3].map((n) => mean(races.map((race) => [...race].sort((a, b) => b.probabilities[id]! - a.probabilities[id]! || a.row.runnerId.localeCompare(b.row.runnerId)).slice(0, n).some((e) => e.won) ? 1 : 0))!);
  const runners = races.flat();
  if (races.some((race) => Math.abs(sum(race.map((e) => e.probabilities[id]!)) - 1) > 1e-10) || runners.some((e) => !finite(e.probabilities[id]))) throw new Error(`Incomplete probability book: ${id}`);
  const bands = Array.from({ length: 10 }, (_, i) => runners.filter((e) => Math.min(9, Math.floor(e.probabilities[id]! * 10)) === i)).filter((r) => r.length);
  const calibrationMae = sum(bands.map((band) => Math.abs(mean(band.map((e) => e.probabilities[id]!))! - mean(band.map((e) => e.won ? 1 : 0))!) * band.length)) / runners.length;
  return { races: races.length, runners: runners.length, rank1: captures[0]!, top2: captures[1]!, top3: captures[2]!, logLoss: -mean(runners.filter((e) => e.won).map((e) => Math.log(e.probabilities[id]!)))!, brier: mean(races.map((race) => sum(race.map((e) => (e.probabilities[id]! - (e.won ? 1 : 0)) ** 2))))!, calibrationMae };
}
function comparison(candidate: string, fold: string, train: Race[], test: Race[], baseline: Metrics, id = candidate): Comparison {
  const m = metrics(test, id);
  return { candidate, fold, trainPeriod: `${train[0]![0]!.row.raceDate} to ${train.at(-1)![0]!.row.raceDate}`, validationPeriod: `${test[0]![0]!.row.raceDate} to ${test.at(-1)![0]!.row.raceDate}`, trainRaces: train.length, metrics: m, deltaLogLoss: m.logLoss - baseline.logLoss, deltaBrier: m.brier - baseline.brier, deltaRank1: m.rank1 - baseline.rank1 };
}
export function yearDirection(deltas: number[]): "improves both" | "one-year only" | "reverses" | "too small" {
  if (deltas.length !== 2 || deltas.some((v) => !Number.isFinite(v))) return "too small";
  if (deltas.every((v) => v < -0.001)) return "improves both";
  if (deltas.some((v) => v < -0.001) && deltas.some((v) => v > 0.001)) return "reverses";
  return deltas.some((v) => v < -0.001) ? "one-year only" : "too small";
}
export function classifySignal(folds: Pick<Comparison, "deltaLogLoss" | "deltaBrier">[], years: Pick<Comparison, "deltaLogLoss" | "deltaBrier">[], market: Pick<Comparison, "deltaLogLoss" | "deltaBrier">[]): Classification {
  const improving = (r: Pick<Comparison, "deltaLogLoss" | "deltaBrier">) => r.deltaLogLoss < -0.001 && r.deltaBrier < 0;
  const replicated = folds.filter(improving).length >= 3 && years.length === 2 && years.every(improving) && market.filter(improving).length >= 2;
  if (replicated && years.every((r) => r.deltaLogLoss < -0.004 && r.deltaBrier < -0.001) && folds.every(improving)) return "STRONG REPLICATED SIGNAL";
  if (replicated) return "MODEST REPLICATED SIGNAL";
  return folds.some((r) => r.deltaLogLoss < 0) ? "WEAK / UNSTABLE" : "NO SIGNAL";
}
export function selectCombination(development: Comparison[], market: Comparison[]): Family[] {
  return (Object.keys(FAMILIES) as Family[]).filter((family) => family !== "pace" && [development, market].every((rows) => {
    const relevant = rows.filter((r) => r.candidate === `F:${family}` && r.fold.startsWith("2025"));
    return relevant.length === 2 && relevant.every((r) => r.deltaLogLoss < -0.001 && r.deltaBrier < 0);
  })).sort((a, b) => mean(development.filter((r) => r.candidate === `F:${a}` && r.fold.startsWith("2025")).map((r) => r.deltaLogLoss))! - mean(development.filter((r) => r.candidate === `F:${b}` && r.fold.startsWith("2025")).map((r) => r.deltaLogLoss))!).slice(0, 2);
}

async function loadRows(connection: ReturnType<typeof createDbConnection>) {
  const gate = await connection.client<Array<{ host: string; port: number; races: number }>>`select inet_server_addr()::text as host, inet_server_port()::int as port, (select count(*)::int from races) as races`;
  if (!gate[0] || !gate[0].races || gate[0].port !== 5432 || !gate[0].host.startsWith("127.0.0.1")) throw new Error("Required local PostgreSQL unavailable");
  console.log("Local PostgreSQL confirmed; loading full source history.");
  const raw = await connection.client<Raw[]>`
    select r.id::text as "raceId", rr.id::text as "runnerId", rr.horse_id::text as "horseId", rr.trainer_id::text as "trainerId", rr.jockey_id::text as "jockeyId",
      r.race_date::text as "raceDate", coalesce(r.race_datetime, r.local_race_datetime) as "raceDateTime",
      r.course_id::text as "courseId", c.display_name as "courseName", si.surface, r.race_name as "raceName", r.race_type as "raceType", r.race_type_code as "raceTypeCode", r.race_class as "raceClass",
      r.distance_yards as "distanceYards", r.going, r.declared_runner_count as "declaredRunnerCount", r.actual_runner_count as "actualRunnerCount",
      rr.finishing_position as "finishingPosition", rr.result_status as "resultStatus", rr.outcome_code as "outcomeCode", rr.racing_post_rating as "racingPostRating", rr.topspeed_rating as "topspeedRating",
      rr.official_rating as "officialRating", rr.weight_carried_lbs as "weightCarriedLbs", rr.horse_age as "horseAge", rr.draw, rr.starting_price_decimal as "startingPriceDecimal", rr.is_favourite as "isFavourite", rr.runner_comment as "runnerComment", r.winning_time as "winningTime"
    from races r join race_runners rr on rr.race_id = r.id join courses c on c.id = r.course_id
    left join lateral (select payload #>> '{props,pageProps,race,race_summary,course_surface,surface}' as surface from source_imports
      where source = r.source and source_id = r.source_id and source_type = 'full-result-next-data' limit 1) si on true
    where r.source = 'sporting_life' and rr.source = 'sporting_life' and r.race_date <= date '2026-10-09'
    order by "raceDateTime", r.id, rr.id
  `;
  let missingTimes = 0;
  const rows: Run[] = raw.flatMap((r) => {
    if (r.raceDateTime == null) { missingTimes++; return []; }
    const time = timestamp(r.raceDateTime);
    return [{ ...r, time, raceDateTime: new Date(time), aw: isSupportedAllWeatherRace(r), surfaceGroup: surfaceGroup(r), speed: null, awSpeedRating: null }];
  });
  const aw = rows.filter((r) => r.aw && started(r));
  console.log(`Loaded ${rows.length} dated history rows; ${aw.length} AW starts. ${missingTimes} undated rows excluded explicitly.`);
  for (let start = 0; start < aw.length; start += 5000) {
    const batch = aw.slice(start, start + 5000);
    const ratings = await getAwSpeedRatingsAsOfRuns(connection.db, batch.map((r) => r.runnerId));
    for (const r of batch) { r.awSpeedRating = ratings.get(r.runnerId) ?? null; r.speed = r.awSpeedRating?.rating ?? null; }
    console.log(`Canonical prior-time AW ratings: ${Math.min(start + 5000, aw.length)}/${aw.length}`);
  }
  return { rows, gate: { host: gate[0].host, port: gate[0].port, races: gate[0].races }, missingTimes, rawRows: raw.length };
}

function coverage(examples: Example[], fields: readonly string[]) {
  return fields.map((feature) => {
    const values = examples.map((e) => e.values[feature]).filter(finite).sort((a, b) => a - b);
    return { feature, runners: examples.length, available: values.length, coverage: values.length / examples.length, zero: values.filter((v) => v === 0).length, median: values.length ? values[Math.floor(values.length / 2)] : null, mean: mean(values) };
  });
}
function calibration(races: Race[], id: string) {
  const examples = races.flat();
  return Array.from({ length: 10 }, (_, i) => { const group = examples.filter((e) => Math.min(9, Math.floor(e.probabilities[id]! * 10)) === i); return { band: `${i * 10}-${(i + 1) * 10}%`, runners: group.length, predicted: mean(group.map((e) => e.probabilities[id]!)), actual: mean(group.map((e) => e.won ? 1 : 0)) }; });
}
function featureBuckets(races: Race[], family: Family) {
  const field = FAMILIES[family][0], examples = races.flat();
  const dev = examples.filter((e) => e.row.raceDate < "2026").map((e) => e.values[field]).filter(finite).sort((a, b) => a - b);
  const cuts = [0.25, 0.5, 0.75].map((q) => dev[Math.floor(dev.length * q)] ?? 0);
  return ["2025", "2026"].flatMap((year) => ["missing", "Q1", "Q2", "Q3", "Q4"].map((bucket) => {
    const selected = examples.filter((e) => e.row.raceDate.startsWith(year) && (e.values[field] == null ? "missing" : e.values[field]! <= cuts[0]! ? "Q1" : e.values[field]! <= cuts[1]! ? "Q2" : e.values[field]! <= cuts[2]! ? "Q3" : "Q4") === bucket);
    return { year, feature: field, bucket, runners: selected.length, actualWinners: selected.filter((e) => e.won).length, strike: mean(selected.map((e) => e.won ? 1 : 0)), normalisedMarketExpected: sum(selected.map((e) => e.probabilities.SP!)) };
  }));
}
function shortPrices(races: Race[], best: string) {
  return ["all priced runners", "favourites"].flatMap((group) => ["odds-on", "evens to <6/4", "6/4 to <2/1", ">=2/1"].flatMap((band) => {
    const selected = races.flatMap((race) => race.filter((e) => {
      const sp = Number(e.row.startingPriceDecimal), minimum = Math.min(...race.map((r) => Number(r.row.startingPriceDecimal)));
      const favourite = e.row.isFavourite === true || sp === minimum;
      return (group !== "favourites" || favourite) && (sp < 2 ? "odds-on" : sp < 2.5 ? "evens to <6/4" : sp < 3 ? "6/4 to <2/1" : ">=2/1") === band;
    }));
    const summarise = (items: Example[], subset: string) => ({ group, band, subset, runners: items.length, actualWinners: items.filter((e) => e.won).length, marketExpectedWinners: sum(items.map((e) => 1 / Number(e.row.startingPriceDecimal))), normalisedMarketExpectedWinners: sum(items.map((e) => e.probabilities.SP!)), baselineExpectedWinners: sum(items.map((e) => e.probabilities.A0!)), bestCandidateExpectedWinners: sum(items.map((e) => e.probabilities[best]!)) });
    return [summarise(selected, "all"), summarise(selected.filter((e) => e.probabilities[best]! < e.probabilities.A0! - 0.02), "candidate downgraded >2pp")];
  }));
}
function table(rows: object[]) {
  if (!rows.length) return "No eligible rows.";
  const headers = Object.keys(rows[0]!);
  const format = (v: unknown): string => v === null || v === undefined ? "-" : typeof v === "number" ? Number.isInteger(v) ? String(v) : v.toFixed(5) : typeof v === "object" ? JSON.stringify(v) : String(v).replaceAll("|", "\\|");
  return [`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map((row) => `| ${headers.map((key) => format((row as Record<string, unknown>)[key])).join(" | ")} |`)].join("\n");
}
function comparisonTable(rows: Comparison[]) { return table(rows.map(({ metrics: m, ...row }) => ({ ...row, ...m }))); }

async function main() {
  const connection = createDbConnection();
  try {
    const loaded = await loadRows(connection);
    console.log("Building chronology-safe features.");
    const population = buildExamples(loaded.rows);
    const races = [...groupBy(population.examples, (e) => e.row.raceId).values()];
    if (!races.length) throw new Error("No eligible complete AW races");
    const candidates: Candidate[] = [{ id: "A0", families: [] }, { id: "A1", families: ["jockey"] }, { id: "A2", families: ["surface", "courseDistance"] }, { id: "A3", families: ["draw"] }, { id: "A4", families: ["confidence", "trend"] }, ...(Object.keys(FAMILIES) as Family[]).filter((f) => f !== "pace").map((f) => ({ id: `F:${f}`, families: [f] }))];
    const walkForward: Comparison[] = [], marketAdjusted: Comparison[] = [];
    const oos: Race[] = [], marketOos: Race[] = [];
    let combination: Family[] = [];
    for (const fold of FOLDS) {
      if (fold.name === "2026-H1") {
        combination = selectCombination(walkForward, marketAdjusted);
        candidates.push({ id: "A6", families: combination });
        console.log(`A6 frozen from 2025 validation: ${combination.join(", ") || "no replicated family; identical to A0"}`);
      }
      const train = races.filter((r) => r[0]!.row.raceDate <= fold.trainTo), test = races.filter((r) => r[0]!.row.raceDate >= fold.from && r[0]!.row.raceDate <= fold.to);
      const marketTrain = train.filter((r) => marketBook(r) !== null), marketTest = test.filter((r) => marketBook(r) !== null);
      if (!train.length || !test.length || !marketTrain.length || !marketTest.length) throw new Error(`Insufficient data for ${fold.name}`);
      console.log(`Fitting ${fold.name}: ${train.length} train races, ${test.length} validation races.`);
      for (const candidate of candidates) {
        predict(test, candidate, fit(train, candidate.families, false));
        predict(marketTest, candidate, fit(marketTrain, candidate.families, true), true, ":market");
        walkForward.push(comparison(candidate.id, fold.name, train, test, metrics(test, "A0")));
        marketAdjusted.push(comparison(candidate.id, fold.name, marketTrain, marketTest, metrics(marketTest, "A0:market"), candidate.id + ":market"));
        console.log(`  ${candidate.id}: log loss ${metrics(test, candidate.id).logLoss.toFixed(5)}`);
      }
      oos.push(...test); marketOos.push(...marketTest);
    }
    // A6's 2025 scores are descriptive only: its families were selected using these folds.
    const a6 = candidates.find((c) => c.id === "A6")!;
    for (const fold of FOLDS.filter((f) => f.name.startsWith("2025"))) {
      const train = races.filter((r) => r[0]!.row.raceDate <= fold.trainTo), test = races.filter((r) => r[0]!.row.raceDate >= fold.from && r[0]!.row.raceDate <= fold.to);
      predict(test, a6, fit(train, a6.families, false));
    }
    const developmentScores = candidates.filter((c) => !c.id.startsWith("F:") && c.id !== "A6").map((c) => ({ id: c.id, loss: metrics(oos.filter((r) => r[0]!.row.raceDate.startsWith("2025")), c.id).logLoss }));
    const bestCandidate = developmentScores.sort((a, b) => a.loss - b.loss || a.id.localeCompare(b.id))[0]!.id;
    const train2025 = races.filter((r) => r[0]!.row.raceDate.startsWith("2025")), holdout = races.filter((r) => r[0]!.row.raceDate.startsWith("2026"));
    console.log(`Development nominee frozen: ${bestCandidate}. Fitting 2025-only models for the full 2026 holdout.`);
    const years: Comparison[] = [], marketYears: Comparison[] = [];
    const dev = oos.filter((r) => r[0]!.row.raceDate.startsWith("2025")), marketDev = marketOos.filter((r) => r[0]!.row.raceDate.startsWith("2025"));
    const marketHoldout = holdout.filter((r) => marketBook(r) !== null), marketTrain = train2025.filter((r) => marketBook(r) !== null);
    for (const candidate of candidates) {
      predict(holdout, candidate, fit(train2025, candidate.families, false), false, ":frozen");
      predict(marketHoldout, candidate, fit(marketTrain, candidate.families, true), true, ":frozenMarket");
      years.push(comparison(candidate.id, "2025 OOS Q3-Q4", races.filter((r) => r[0]!.row.raceDate <= "2025-09-30"), dev, metrics(dev, "A0")));
      years.push(comparison(candidate.id, "2026 frozen 2025 fit", train2025, holdout, metrics(holdout, "A0:frozen"), candidate.id + ":frozen"));
      if (candidate.id !== "A6") marketYears.push(comparison(candidate.id, "2025 OOS Q3-Q4", marketTrain, marketDev, metrics(marketDev, "A0:market"), candidate.id + ":market"));
      marketYears.push(comparison(candidate.id, "2026 frozen 2025 fit", marketTrain, marketHoldout, metrics(marketHoldout, "A0:frozenMarket"), candidate.id + ":frozenMarket"));
    }
    const classifications = Object.fromEntries((Object.keys(FAMILIES) as Family[]).map((f) => [f, f === "pace" ? "NO SIGNAL" : classifySignal(walkForward.filter((r) => r.candidate === `F:${f}`), years.filter((r) => r.candidate === `F:${f}`), marketAdjusted.filter((r) => r.candidate === `F:${f}`))])) as Record<Family, Classification>;
    const recommended = (Object.keys(FAMILIES) as Family[]).filter((f) => /^(MODEST|STRONG)/.test(classifications[f]));
    const exampleHoldout = holdout.flat(), fields = Object.keys(population.examples[0]!.values);
    // Use frozen full-year probabilities for all final holdout diagnostics.
    for (const e of exampleHoldout) for (const c of candidates) e.probabilities[c.id] = e.probabilities[c.id + ":frozen"]!;
    for (const race of marketHoldout) { const p = marketBook(race)!; race.forEach((e, i) => { e.probabilities.SP = p[i]!; }); }
    for (const race of marketDev) { const p = marketBook(race)!; race.forEach((e, i) => { e.probabilities.SP = p[i]!; }); }
    const dataCoverage = {
      postgres: loaded.gate, rawHistoryRows: loaded.rawRows, undatedHistoryRowsExcluded: loaded.missingTimes,
      races: races.length, runners: population.examples.length, dateRange: `${races[0]![0]!.row.raceDate} to ${races.at(-1)![0]!.row.raceDate}`,
      courses: [...groupBy(races, (r) => r[0]!.row.courseName)].map(([course, items]) => ({ course, races: items.length })),
      surfaces: [...groupBy(races, (r) => r[0]!.row.surfaceGroup)].map(([surface, items]) => ({ surface, races: items.length })),
      sourceSurfaceInventory: [...groupBy(loaded.rows.filter((r) => r.raceDate >= "2025-01-01"), (r) => `${r.surface ?? "missing"}:${r.aw ? "supported AW" : "outside canonical AW support"}`)].map(([surfaceAndSupport, items]) => ({ surfaceAndSupport, races: new Set(items.map((r) => r.raceId)).size, runners: items.length })),
      fieldSizes: [...groupBy(races, (r) => fieldBand(r.length))].map(([band, items]) => ({ band, races: items.length })),
      handicap: [...groupBy(races, (r) => classifyHandicapStatus(r[0]!.row))].map(([status, items]) => ({ status, races: items.length })),
      exclusions: population.exclusions, marketDiagnosticRaces2026: marketHoldout.length, unpricedRaces2026: holdout.length - marketHoldout.length,
      featureCoverage: coverage(population.examples, fields), baselineFeatures: BASELINE, drawCells: population.drawCells,
    };
    const pace = { status: "NOT TESTED: parsing reliability not established against labelled early-position data", classificationMeaning: "NO SIGNAL means no validated evidence, not a tested null effect", parser: "Conservative opening clause only; late leading and unrecognised/ambiguous openings are unknown", priorTendencyCoverage: coverage(population.examples.filter((e) => e.row.raceDate < "2026"), ["front_tendency", "prominent_tendency", "held_up_tendency", "style_consistency", "style_known_runs"]), examples: loaded.rows.filter((r) => r.aw && r.raceDate < "2026" && r.runnerComment).slice(0, 40).map((r) => ({ comment: r.runnerComment, openingStyle: parseOpeningStyle(r.runnerComment) })), humanValidated: false, A5: "withheld" };
    const best = metrics(holdout, bestCandidate), baseline = metrics(holdout, "A0");
    const shortPrice = shortPrices(marketHoldout, bestCandidate);
    const downgraded = shortPrice.filter((r) => r.group === "favourites" && r.subset === "candidate downgraded >2pp" && r.band !== ">=2/1");
    const downgradedRunners = sum(downgraded.map((r) => r.runners)), downgradedWins = sum(downgraded.map((r) => r.actualWinners));
    const baselineExpected = sum(downgraded.map((r) => r.baselineExpectedWinners)), candidateExpected = sum(downgraded.map((r) => r.bestCandidateExpectedWinners));
    const shortPriceFinding = `Among favourites shorter than 2/1 downgraded by more than two percentage points: ${downgradedRunners} runners, ${downgradedWins} actual winners, A0 ${baselineExpected.toFixed(2)} expected and ${bestCandidate} ${candidateExpected.toFixed(2)} expected. ` +
      (downgradedRunners < 50 ? "The subset is too small to establish weak-runner identification." : Math.abs(downgradedWins - candidateExpected) < Math.abs(downgradedWins - baselineExpected) ? "Aggregate expected-winner calibration is closer, but a single-year selected subset does not establish replicated weak-runner identification." : "Downgrading moves expected winners farther from the actual count; this does not support better weak-short-price identification.");
    const familyEvidence = (Object.keys(FAMILIES) as Family[]).map((family) => ({ family, classification: classifications[family],
      rawImprovingFolds: walkForward.filter((r) => r.candidate === `F:${family}` && r.deltaLogLoss < -0.001 && r.deltaBrier < 0).length,
      marketImprovingFolds: marketAdjusted.filter((r) => r.candidate === `F:${family}` && r.deltaLogLoss < -0.001 && r.deltaBrier < 0).length,
      yearDirection: family === "pace" ? "not tested" : yearDirection(years.filter((r) => r.candidate === `F:${family}`).map((r) => r.deltaLogLoss)),
    }));
    const report = {
      generatedAt: new Date().toISOString(), methodology: {
        scope: "Research only. Direct full local PostgreSQL history; no cache fallback. No production files or database writes.",
        baseline: "A0 uses all 16 stable AW_TISSUE_V1 numeric inputs, including the three AW-D components, plus native missingness flags. Refitted per training fold; no current model output as predictor.",
        chronology: "Exact offset-preserving timestamps; all same-timestamp races scored before updating any history. Canonical speed ratings computed as of each historical run using aw_speed_v1; only earlier runs enter target features.",
        history: "All dated sporting_life history in PostgreSQL loaded with no lower-date cutoff. Trainer/jockey baseline matches current lifetime prior settled-run rates; horse core uses canonical winning-time history eligibility. New horse families use all prior AW starts and available canonical speeds.",
        fitting: `Conditional race softmax; ${EPOCHS} epochs; L2 ${L2}; learning rate .12/sqrt(1+epoch/10). Training-only available-value mean imputation, scaling, missingness. Fixed hyperparameters; no ROI objective. Precomputed feature matrices. UUID tie order.`,
        design: "A1 recent jockey; A2 surface+course/distance; A3 draw; A4 confidence+trend. Individual family add-ons isolate all requested families. A5 withheld pending parser validation. A6 at most two families helping both 2025 folds in raw and market-controlled probability metrics; frozen before 2026.",
        selection: "Best candidate nominated from A0-A4 using pooled 2025 OOS log loss only. A6 has selection-contaminated descriptive 2025 scores, so it cannot be ranked using those scores or called independently replicated there.",
        validation: "2025 Q3/Q4 OOS walk-forward; 2026 H1/H2 walk-forward. Separate 2026 entire-year holdout uses frozen 2025 fit. 2025 year metrics cover July-Dec OOS, not in-sample Jan-June. 2026 is exploratory after prior AW programme exposure, not a pristine programme-wide holdout.",
        market: "Final SP only in separate complete-priced race diagnostics as normalised log market offset. Raw implied 1/SP expected wins also reported with overround retained. Same-priced-population A0 controls for long-term jockey/trainer. No betting rule or price filter.",
        shrinkage: "Jockey recent rates: 20 pseudo-runners at own lifetime rate (0.1 cold-start fallback); combination: 30 at mean jockey/trainer rates. Suitability deltas shrink by usable depth/(depth+5). Draw: verified complete settled fields only; prior winner-minus-uniform-field expectation divided by expected+20, neutral below 30 distinct prior races per zone.",
        context: "Five distance bands (<=6.5f, <=8.5f, <=10.5f, <=12.5f, longer), three declared-field bands; three draw zones; course+distance+surface+field context only. One fixed normalised-draw x learned-context interaction; no broad interaction mining.",
        trend: "Last three usable prior AW speeds in chronological order; slope per run=(last-first)/2; improving/declining threshold +/-2 points per run; flat otherwise. SD needs two observations. Latest-minus-average excludes latest from comparator.",
        interpretation: "At least three improving folds, both years improving LL >.001 and Brier, and at least two market-controlled improving folds for modest. Strong additionally all folds improve and both year deltas LL <-.004, Brier <-.001. Many correlated families tested: exploratory replication requires prospective confirmation.",
        limitations: "Retrospective DB does not prove comment/OR metadata availability at historical prediction time. Source ALLWEATHER mapped to course-era surface; Southwell pre-2021-12-07 retained as Fibresand. Source histories can be incomplete. Undated rows explicitly excluded rather than guessing time. Sparse/absent evidence is reported.",
      }, dataCoverage, candidates: candidates.map((c) => ({ ...c, features: namesFor(c.families) })), walkForward, years, marketAdjusted, marketYears,
      yearDirections: candidates.map((c) => ({ candidate: c.id, direction: yearDirection(years.filter((r) => r.candidate === c.id).map((r) => r.deltaLogLoss)) })),
      classifications, pace, combination, bestCandidate, holdoutBaseline: baseline, holdoutBest: best,
      candidateMetrics: candidates.map((c) => ({ candidate: c.id, ...metrics(holdout, c.id) })),
      calibration: calibration(holdout, bestCandidate), marketBaseline: metrics(marketHoldout, "SP"),
      featureMarketBuckets: Object.fromEntries((Object.keys(FAMILIES) as Family[]).map((f) => [f, featureBuckets([...marketDev, ...marketHoldout], f)])),
      shortPrice, shortPriceFinding, familyEvidence, recommendation: recommended.length ? `YES: separate AW V2 research may test ${recommended.join(", ")}; no model created. Require prospective confirmation.` : "NO: no family meets the pre-specified replication threshold; retain the current AW baseline.",
    };
    await writeFile(`${OUTPUT}.json`, JSON.stringify(report, null, 2) + "\n");
    const lines = ["# Controlled All Weather Feature Experiment", "", `Generated ${report.generatedAt}`, "", "## Executive Summary", "", `Development nominee: ${bestCandidate}. Frozen 2026 log loss ${best.logLoss.toFixed(5)} versus A0 ${baseline.logLoss.toFixed(5)}. ${report.recommendation}`, "", "## Data Coverage", "", "```json", JSON.stringify({ ...dataCoverage, featureCoverage: undefined }, null, 2), "```", "", "## Baseline", "", report.methodology.baseline, "", table([baseline]), "", table(coverage(population.examples, BASELINE))];
    const sectionNames: [string, Family][] = [["Jockey Recent Form", "jockey"], ["Trainer/Jockey Combination", "combination"], ["Surface Suitability", "surface"], ["Course/Distance Suitability", "courseDistance"], ["Draw Bias", "draw"], ["Pace / Running Style", "pace"], ["Speed Confidence", "confidence"], ["Speed Trend", "trend"], ["Class Movement", "classMovement"], ["OR Relativity", "orRelativity"]];
    for (const [title, family] of sectionNames) {
      lines.push("", `## ${title}`, "", `Classification: ${classifications[family]}`, "", table(coverage(population.examples, family === "jockey" ? fields.filter((f) => f.startsWith("jockey_")) : family === "combination" ? fields.filter((f) => f.startsWith("combination_")) : family === "surface" ? fields.filter((f) => f.startsWith("surface_")) : family === "courseDistance" ? fields.filter((f) => /^(course_|distance_)/.test(f)) : family === "trend" ? fields.filter((f) => /^speed_(latest|slope|improving|declining|flat)/.test(f)) : [...FAMILIES[family]])));
      if (family === "pace") lines.push("", pace.status, "", pace.classificationMeaning, "", table(pace.examples));
      else lines.push("", table(familyEvidence.filter((r) => r.family === family)), "", comparisonTable(years.filter((r) => r.candidate === `F:${family}`)));
    }
    lines.push("", "## Candidate Models", "", table(report.candidateMetrics), "", "A5 withheld. A6 2025 figures are selected-development descriptions, not independent validation.", "", "## Walk-Forward Validation", "", comparisonTable(walkForward), "", "## 2025 vs 2026", "", comparisonTable(years), "", table(report.yearDirections), "", "## Market-Adjusted Diagnostic", "", comparisonTable(marketAdjusted), "", comparisonTable(marketYears), "", table([report.marketBaseline]), "", "2026 calibration (raw nominated candidate)", "", table(report.calibration));
    for (const [family, buckets] of Object.entries(report.featureMarketBuckets)) lines.push("", family, "", table(buckets));
    lines.push("", "## Short-Price Analysis", "", "Complete-priced 2026 fields; odds bands are diagnostic only. Downgrades compare the frozen candidate with A0; raw and normalised market expectations are separated. Actual versus expected counts describe calibration, not a betting filter.", "", shortPriceFinding, "", table(shortPrice), "", "## Signal Classification", "", table(familyEvidence), "", "## Recommendation", "", report.recommendation, "", "Methodology and limitations", "", ...Object.entries(report.methodology).map(([key, value]) => `- ${key}: ${value}`), "");
    await writeFile(`${OUTPUT}.md`, lines.join("\n"));
    for (const [label, family] of [["Jockey recent form", "jockey"], ["Surface suitability", "surface"], ["Draw/context", "draw"], ["Speed confidence", "confidence"], ["Pace/running style", "pace"]] as const) console.log(`\n${label}:\nSignal classification: ${classifications[family]}`);
    console.log(`\nBest candidate: ${bestCandidate}\nBaseline log loss: ${baseline.logLoss.toFixed(5)}\nCandidate log loss: ${best.logLoss.toFixed(5)}\nDelta: ${(best.logLoss - baseline.logLoss).toFixed(5)}\n\nBaseline rank-1: ${(baseline.rank1 * 100).toFixed(2)}%\nCandidate rank-1: ${(best.rank1 * 100).toFixed(2)}%\n\nShould any AW feature family move to an AW V2 experiment?\n${recommended.length ? "YES" : "NO"}\n\nWrote ${OUTPUT}.md\nWrote ${OUTPUT}.json`);
  } finally { await connection.client.end({ timeout: 1 }); }
}
if (process.argv[1]?.endsWith("run-aw-feature-experiment.ts")) await main();
