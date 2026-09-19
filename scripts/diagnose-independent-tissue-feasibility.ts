import { writeFile } from "node:fs/promises";
import { createDbConnection } from "@/db";
import { loadBacktestFeatureCache, loadLatestBacktestFeatureCacheForYear } from "@/lib/racing/backtest-cache";
import type { HistoricalPreRaceFeatureRow, HistoricalTargetRunnerMetricsRow } from "@/lib/racing/historical-target-metrics";

const REPORT_PATH = "/tmp/independent-tissue-feasibility.md";
const EPSILON = 1e-12;
const EPOCHS = 90;
const L2 = 0.02;

export const COMMENT_PATTERNS = {
  slowlyAway: /\b(?:slow(?:ly)? away|dwelt|slow(?:ly)? into stride)\b/i,
  awkwardStart: /\b(?:awkward(?:ly)? away|awkward start|awkwardly into stride|reared start)\b/i,
  prominent: /\bprominent\b/i,
  led: /\b(?:led|made all|made virtually all)\b/i,
  heldUpRear: /\b(?:held up|in rear|towards rear|chased leaders from rear)\b/i,
  racedFreely: /\b(?:raced freely|pulled hard|took keen hold|keen)\b/i,
  hampered: /\bhampered\b/i,
  bumped: /\bbumped\b/i,
  checked: /\bchecked\b/i,
  deniedRoom: /\b(?:denied room|no clear run)\b/i,
  shortRoom: /\b(?:short of room|not much room)\b/i,
  switched: /\bswitched\b/i,
  racedWide: /\b(?:raced wide|wide throughout|kept wide)\b/i,
  stayedOn: /\bstayed on\b/i,
  strongFinish: /\b(?:finished strongly|nearest finish|ran on strongly|kept on strongly)\b/i,
  weakened: /\bweakened\b/i,
  faded: /\bfaded\b/i,
  eased: /\beased\b/i,
  neverDangerous: /\b(?:never dangerous|never involved|never on terms)\b/i,
  lostTouch: /\blost touch\b/i,
  equipment: /\b(?:blinkers?|visor|cheekpieces?|hood|tongue[- ]tie|eye shield)\b/i,
} as const;

export type CommentFlag = keyof typeof COMMENT_PATTERNS;
export type CommentFlags = Record<CommentFlag, number>;

export function parsePriorRunComment(comment: string): CommentFlags {
  return Object.fromEntries(
    Object.entries(COMMENT_PATTERNS).map(([name, pattern]) => [name, pattern.test(comment) ? 1 : 0]),
  ) as CommentFlags;
}

export type HistoricalComment = {
  raceDateTime: Date;
  raceDate: string;
  raceId: string;
  comment: string;
};

export function priorCommentsForTarget(
  comments: HistoricalComment[],
  targetRaceDateTime: Date,
  limit = 3,
): HistoricalComment[] {
  return comments
    .filter((comment) => comment.raceDateTime.getTime() < targetRaceDateTime.getTime())
    .sort((left, right) => right.raceDateTime.getTime() - left.raceDateTime.getTime())
    .slice(0, limit);
}

export type Example = {
  row: HistoricalTargetRunnerMetricsRow;
  raceId: string;
  won: boolean;
  numeric: number[];
  comments: number[];
  priorComments: HistoricalComment[];
  numericProbability?: number;
  commentProbability?: number;
};

export type Model = { names: string[]; means: number[]; scales: number[]; weights: number[] };

export const NUMERIC_FEATURES: Array<[string, (f: HistoricalPreRaceFeatureRow) => number | null]> = [
  ["official_rating", (f) => f.officialRating],
  ["latest_performance", (f) => f.latestPerformanceRating],
  ["best_l3_performance", (f) => f.bestPerformanceLast3],
  ["avg_l3_performance", (f) => f.averagePerformanceLast3],
  ["latest_turf_speed", (f) => f.latestTurfSpeedRating],
  ["best_l3_turf_speed", (f) => f.bestTurfSpeedLast3],
  ["avg_l3_turf_speed", (f) => f.averageTurfSpeedLast3],
  ["latest_todays_rating", (f) => f.latestTodaysRating],
  ["best_l3_todays_rating", (f) => f.bestTodaysRatingLast3],
  ["avg_l3_todays_rating", (f) => f.averageTodaysRatingLast3],
  ["trainer_prior_rate", (f) => f.trainerPriorWinRate],
  ["log_trainer_prior_runs", (f) => Math.log1p(f.trainerPriorRuns)],
  ["jockey_prior_rate", (f) => f.jockeyPriorWinRate ?? null],
  ["log_jockey_prior_runs", (f) => Math.log1p(f.jockeyPriorRuns ?? 0)],
  ["days_since_run", (f) => f.daysSinceLastRun],
  ["log_prior_runs", (f) => Math.log1p(f.priorRuns)],
  ["age", (f) => f.horseAge],
  ["weight_lbs", (f) => f.weightCarriedLbs],
  ["class", (f) => numericClass(f.raceClass)],
  ["distance_furlongs", (f) => f.distanceYards === null ? null : f.distanceYards / 220],
  ["field_size", (f) => f.actualRunnerCount ?? f.declaredRunnerCount],
  ["draw", (f) => f.draw],
  ["draw_fraction", (f) => f.draw === null || !(f.actualRunnerCount ?? f.declaredRunnerCount) ? null : f.draw / (f.actualRunnerCount ?? f.declaredRunnerCount)!],
  ["handicap", (f) => /handicap/i.test(`${f.raceName ?? ""} ${f.raceType ?? ""}`) ? 1 : 0],
  ["going_soft", (f) => /soft|heavy/i.test(f.going ?? "") ? 1 : 0],
  ["going_firm", (f) => /firm/i.test(f.going ?? "") ? 1 : 0],
];

export const COMMENT_NAMES = Object.keys(COMMENT_PATTERNS) as CommentFlag[];
export const COMMENT_FEATURE_NAMES = [
  "prior_comment_count",
  ...COMMENT_NAMES.map((name) => `last_${name}`),
  ...COMMENT_NAMES.map((name) => `last3_${name}_count`),
];

export function raceSoftmax(scores: number[]): number[] {
  const maximum = Math.max(...scores);
  const weights = scores.map((score) => Math.exp(score - maximum));
  const total = weights.reduce((sum, value) => sum + value, 0);
  return weights.map((value) => value / total);
}

async function main() {
  const [developmentCache, holdoutCache] = await Promise.all([
    loadBacktestFeatureCache({ from: "2025-01-01", to: "2025-12-31", family: "turf_flat" }),
    loadLatestBacktestFeatureCacheForYear({ year: "2026", family: "turf_flat" }),
  ]);
  if (!developmentCache || !holdoutCache) throw new Error("Compatible Turf caches are required");

  const connection = createDbConnection();
  try {
    const commentsByHorse = await loadHistoricalComments(connection.client);
    const development = buildExamples(developmentCache.rows, commentsByHorse);
    const holdout = buildExamples(holdoutCache.rows, commentsByHorse);
    const numericModel = fitModel(development, false);
    const commentModel = fitModel(development, true);
    predict(development, numericModel, false, "numericProbability");
    predict(development, commentModel, true, "commentProbability");
    predict(holdout, numericModel, false, "numericProbability");
    predict(holdout, commentModel, true, "commentProbability");
    const report = buildReport({ development, holdout, numericModel, commentModel, developmentCache, holdoutCache });
    await writeFile(REPORT_PATH, report, "utf8");
    console.log(`Wrote ${REPORT_PATH}`);
    console.log(summaryLine("2025 numeric", metrics(development, "numericProbability")));
    console.log(summaryLine("2025 comments", metrics(development, "commentProbability")));
    console.log(summaryLine("2026 numeric", metrics(holdout, "numericProbability")));
    console.log(summaryLine("2026 comments", metrics(holdout, "commentProbability")));
  } finally {
    await connection.client.end();
  }
}

export async function loadHistoricalComments(client: ReturnType<typeof createDbConnection>["client"]) {
  const rows = await client<Array<{ horseId: string; raceId: string; raceDate: string; raceDateTime: Date; comment: string }>>`
    select rr.horse_id as "horseId", r.id as "raceId", r.race_date::text as "raceDate",
           r.race_datetime as "raceDateTime", rr.runner_comment as comment
    from race_runners rr join races r on r.id = rr.race_id
    where r.source = 'sporting_life' and rr.runner_comment is not null
      and btrim(rr.runner_comment) <> '' and r.race_datetime < '2027-01-01'
      and coalesce(rr.result_status, '') <> 'non_runner'
    order by rr.horse_id, r.race_datetime
  `;
  const grouped = new Map<string, HistoricalComment[]>();
  for (const row of rows) {
    const list = grouped.get(row.horseId) ?? [];
    list.push({ raceId: row.raceId, raceDate: row.raceDate, raceDateTime: new Date(row.raceDateTime), comment: row.comment });
    grouped.set(row.horseId, list);
  }
  return grouped;
}

export function buildExamples(rows: HistoricalTargetRunnerMetricsRow[], commentsByHorse: Map<string, HistoricalComment[]>) {
  const settledRaceIds = new Set<string>();
  const activeRows = rows.filter((row) => row.features.raceCode === "turf" && row.outcome.resultStatus !== "non_runner");
  const grouped = groupBy(activeRows, (row) => row.features.targetRaceId);
  for (const [raceId, raceRows] of grouped) {
    if (raceRows.filter((row) => row.outcome.won === true).length === 1 && raceRows.every((row) => row.outcome.won !== null)) settledRaceIds.add(raceId);
  }
  return activeRows
    .filter((row) => settledRaceIds.has(row.features.targetRaceId))
    .map((row): Example => {
      const priors = priorCommentsForTarget(commentsByHorse.get(row.features.horseId) ?? [], row.features.raceDateTime);
      return {
        row,
        raceId: row.features.targetRaceId,
        won: row.outcome.won === true,
        numeric: numericVector(row.features),
        comments: commentVector(priors),
        priorComments: priors,
      };
    });
}

function numericVector(features: HistoricalPreRaceFeatureRow) {
  const values = NUMERIC_FEATURES.map(([, get]) => get(features));
  return [...values.map((value) => value ?? 0), ...values.map((value) => value === null || !Number.isFinite(value) ? 1 : 0)];
}

function commentVector(comments: HistoricalComment[]) {
  const parsed = comments.map((comment) => parsePriorRunComment(comment.comment));
  return [
    comments.length,
    ...COMMENT_NAMES.map((name) => parsed[0]?.[name] ?? 0),
    ...COMMENT_NAMES.map((name) => parsed.reduce((sum, flags) => sum + flags[name], 0)),
  ];
}

export function fitModel(examples: Example[], includeComments: boolean, commentFeatureIndexes?: number[]): Model {
  const names = [
    ...NUMERIC_FEATURES.map(([name]) => name),
    ...NUMERIC_FEATURES.map(([name]) => `${name}_missing`),
    ...(includeComments ? (commentFeatureIndexes ?? COMMENT_FEATURE_NAMES.map((_, index) => index)).map((index) => COMMENT_FEATURE_NAMES[index]!) : []),
  ];
  const raw = examples.map((example) => includeComments
    ? [...example.numeric, ...(commentFeatureIndexes ?? COMMENT_FEATURE_NAMES.map((_, index) => index)).map((index) => example.comments[index]!)]
    : example.numeric);
  const means = names.map((_, index) => average(raw.map((row) => row[index]!)));
  const scales = names.map((_, index) => Math.max(standardDeviation(raw.map((row) => row[index]!), means[index]!), 1e-6));
  const matrix = raw.map((row) => row.map((value, index) => (value - means[index]!) / scales[index]!));
  const races = groupIndexes(examples);
  const weights = Array(names.length).fill(0) as number[];
  for (let epoch = 0; epoch < EPOCHS; epoch += 1) {
    const gradient = Array(names.length).fill(0) as number[];
    for (const indexes of races) {
      const probabilities = raceSoftmax(indexes.map((index) => dot(weights, matrix[index]!)));
      for (let position = 0; position < indexes.length; position += 1) {
        const index = indexes[position]!;
        const residual = (examples[index]!.won ? 1 : 0) - probabilities[position]!;
        for (let feature = 0; feature < weights.length; feature += 1) gradient[feature]! += residual * matrix[index]![feature]!;
      }
    }
    const rate = 0.12 / Math.sqrt(1 + epoch / 10);
    for (let feature = 0; feature < weights.length; feature += 1) {
      weights[feature]! += rate * (gradient[feature]! / races.length - L2 * weights[feature]!);
    }
  }
  return { names, means, scales, weights };
}

export function predict(examples: Example[], model: Model, includeComments: boolean, key: "numericProbability" | "commentProbability", commentFeatureIndexes?: number[]) {
  for (const indexes of groupIndexes(examples)) {
    const probabilities = raceSoftmax(indexes.map((index) => score(model, includeComments
      ? [...examples[index]!.numeric, ...(commentFeatureIndexes ?? COMMENT_FEATURE_NAMES.map((_, position) => position)).map((position) => examples[index]!.comments[position]!)]
      : examples[index]!.numeric)));
    indexes.forEach((index, position) => { examples[index]![key] = probabilities[position]; });
  }
}

function score(model: Model, values: number[]) {
  return dot(model.weights, values.map((value, index) => (value - model.means[index]!) / model.scales[index]!));
}

export type ProbabilityKey = "numericProbability" | "commentProbability";
export function metrics(examples: Example[], key: ProbabilityKey) {
  const races = groupIndexes(examples);
  const winners = examples.filter((example) => example.won);
  const logLoss = -average(winners.map((winner) => Math.log(Math.max(winner[key]!, EPSILON))));
  const brier = average(races.map((indexes) => indexes.reduce((sum, index) => sum + (examples[index]![key]! - (examples[index]!.won ? 1 : 0)) ** 2, 0)));
  const captures = [1, 2, 3].map((count) => races.filter((indexes) => [...indexes].sort((a, b) => examples[b]![key]! - examples[a]![key]!).slice(0, count).some((index) => examples[index]!.won)).length / races.length);
  return { races: races.length, runners: examples.length, logLoss, brier, top1: captures[0]!, top2: captures[1]!, top3: captures[2]! };
}

function buildReport(input: {
  development: Example[];
  holdout: Example[];
  numericModel: Model;
  commentModel: Model;
  developmentCache: { manifest: { generatedAt: string; rowCount: number } };
  holdoutCache: { manifest: { generatedAt: string; rowCount: number }; actualCoverage: { actualFrom: string; actualTo: string } | null };
}) {
  const { development, holdout, numericModel, commentModel } = input;
  const devNumeric = metrics(development, "numericProbability");
  const devComments = metrics(development, "commentProbability");
  const holdNumeric = metrics(holdout, "numericProbability");
  const holdComments = metrics(holdout, "commentProbability");
  const lines = [
    "# Independent Turf Tissue Feasibility", "",
    "Diagnostic only. No Today, selection, rating, cache, or production behavior was changed.", "",
    "## Scope and leakage audit", "",
    `- Development: 2025, ${devNumeric.races} settled single-winner races / ${devNumeric.runners} runners (cache rows ${input.developmentCache.manifest.rowCount}).`,
    `- Holdout: ${input.holdoutCache.actualCoverage?.actualFrom ?? "2026-01-01"} to ${input.holdoutCache.actualCoverage?.actualTo ?? "current cache"}, ${holdNumeric.races} races / ${holdNumeric.runners} runners (cache rows ${input.holdoutCache.manifest.rowCount}).`,
    "- Target result is used only as the response label after features are built.",
    "- Historical comments require race_datetime < target race_datetime; target and future comments are rejected.",
    "- SP, market rank, Timewise, tissue and Betfair data are absent from both feature vectors. Final SP is not used by this diagnostic model.",
    "- Ratings and trainer/jockey statistics come from historical_target_metrics_v4, whose candidate runs and participant statistics are target-time prior-only.",
    "- Races without exactly one known winner are excluded from fitting/evaluation; probabilities otherwise include every settled runner.", "",
    "## Features", "",
    `Numeric values: ${NUMERIC_FEATURES.map(([name]) => name).join(", ")}. Each has a missingness indicator; continuous values are standardized from 2025 only.`, "",
    `Comment values: prior comment count; most-recent flags; last-three counts for ${COMMENT_NAMES.join(", ")}. Phrase rules are explicit in the script.`, "",
    "Course was audited but omitted from this first baseline to avoid hundreds of sparse coefficients. Going is represented by frozen soft/heavy and firm flags; handicap is parsed from pre-race race metadata.", "",
    "## Comment coverage", "",
    ...coverageTable(development, holdout), "",
    "## Model results", "",
    "| Sample | Model | Races | Runners | Log loss | Race Brier | Top 1 | Top 2 | Top 3 |",
    "|---|---|---:|---:|---:|---:|---:|---:|---:|",
    metricRow("2025 development", "Numeric", devNumeric),
    metricRow("2025 development", "Numeric + comments", devComments),
    metricRow("2026 holdout", "Numeric", holdNumeric),
    metricRow("2026 holdout", "Numeric + comments", holdComments), "",
    "## 2026 calibration", "",
    ...calibrationSection(holdout), "",
    "## Ranking comparisons (2026)", "",
    "The cache does not persist the target race's assembled production TPR, so this diagnostic does not fabricate it. The table reports the chronologically safe prior-run Today's-rating feature instead; a true TPR comparison requires rebuilding target-time TPR from its frozen production components.", "",
    ...rankingTable(holdout), "",
    "## Comment influence", "",
    "Largest absolute standardized comment coefficients (direction is conditional association, not causality):", "",
    ...coefficientLines(commentModel), "",
    `Holdout delta, comments minus numeric: log loss ${signed(holdComments.logLoss - holdNumeric.logLoss)}, Brier ${signed(holdComments.brier - holdNumeric.brier)}, top-1 ${signedPct(holdComments.top1 - holdNumeric.top1)}.`, "",
    "## Largest comment-driven probability changes (2026)", "",
    ...tripEvidence(holdout), "",
    "## Example 100% tissues", "",
    ...tissueExamples(holdout), "",
    "## Decision", "",
    ...decisionLines(holdNumeric, holdComments), "",
    "## Reproducibility", "",
    `- Conditional-logit runner score, race softmax, L2=${L2}, epochs=${EPOCHS}.`,
    `- Cache generated: 2025 ${input.developmentCache.manifest.generatedAt}; 2026 ${input.holdoutCache.manifest.generatedAt}.`,
    `- Numeric coefficient count ${numericModel.weights.length}; comment-model coefficient count ${commentModel.weights.length}.`,
  ];
  return `${lines.join("\n")}\n`;
}

function coverageTable(development: Example[], holdout: Example[]) {
  const rows = [["2025", development], ["2026", holdout]] as const;
  return [
    "| Sample | Targets | With >=1 prior comment | With 3 prior comments | Mean prior comments (max 3) |",
    "|---|---:|---:|---:|---:|",
    ...rows.map(([label, examples]) => `| ${label} | ${examples.length} | ${count(examples, (e) => e.priorComments.length > 0)} (${pct(count(examples, (e) => e.priorComments.length > 0) / examples.length)}) | ${count(examples, (e) => e.priorComments.length === 3)} (${pct(count(examples, (e) => e.priorComments.length === 3) / examples.length)}) | ${fmt(average(examples.map((e) => e.priorComments.length)), 2)} |`),
  ];
}

function calibrationSection(examples: Example[]) {
  return ["### Numeric only", "", ...calibrationTable(examples, "numericProbability"), "", "### Numeric + comments", "", ...calibrationTable(examples, "commentProbability")];
}

function calibrationTable(examples: Example[], key: ProbabilityKey) {
  const bands: Array<[string, number, number]> = [["<5%", 0, .05], ["5-9.99%", .05, .1], ["10-14.99%", .1, .15], ["15-19.99%", .15, .2], ["20-29.99%", .2, .3], ["30%+", .3, 1.01]];
  return ["| Band | Predictions | Average predicted | Actual strike |", "|---|---:|---:|---:|", ...bands.map(([label, low, high]) => {
    const rows = examples.filter((example) => example[key]! >= low && example[key]! < high);
    return `| ${label} | ${rows.length} | ${pct(average(rows.map((row) => row[key]!)))} | ${pct(average(rows.map((row) => row.won ? 1 : 0)))} |`;
  })];
}

function rankingTable(examples: Example[]) {
  const comparators: Array<[string, (example: Example) => number | null]> = [
    ["Prior-run Today's rating", (e) => e.row.features.latestTodaysRating],
    ["Official Rating", (e) => e.row.features.officialRating],
    ["Best L3 Performance", (e) => e.row.features.bestPerformanceLast3],
    ["Latest Performance", (e) => e.row.features.latestPerformanceRating],
  ];
  const races = groupIndexes(examples);
  return ["| Tissue | Comparator | Comparable | Agreement | Tissue only won | Comparator only won | Neither won |", "|---|---|---:|---:|---:|---:|---:|", ...(["numericProbability", "commentProbability"] as ProbabilityKey[]).flatMap((key) => comparators.map(([name, get]) => {
    let comparable = 0, agreement = 0, tissueOnly = 0, comparatorOnly = 0, neither = 0;
    for (const indexes of races) {
      const available = indexes.filter((index) => get(examples[index]!) !== null);
      if (available.length !== indexes.length) continue;
      comparable += 1;
      const tissue = maxIndex(indexes, (index) => examples[index]![key]!);
      const comparator = maxIndex(indexes, (index) => get(examples[index]!)!);
      if (tissue === comparator) agreement += 1;
      else if (examples[tissue]!.won) tissueOnly += 1;
      else if (examples[comparator]!.won) comparatorOnly += 1;
      else neither += 1;
    }
    return `| ${key === "numericProbability" ? "Numeric" : "Comments"} | ${name} | ${comparable} | ${pct(agreement / comparable)} | ${tissueOnly} | ${comparatorOnly} | ${neither} |`;
  }))];
}

function coefficientLines(model: Model) {
  return model.names.map((name, index) => ({ name, weight: model.weights[index]! }))
    .filter(({ name }) => COMMENT_FEATURE_NAMES.includes(name))
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight)).slice(0, 12)
    .map(({ name, weight }) => `- ${name}: ${signed(weight)}`);
}

function tripEvidence(examples: Example[]) {
  const rows = examples.filter((e) => e.priorComments.length > 0)
    .sort((a, b) => Math.abs(b.commentProbability! - b.numericProbability!) - Math.abs(a.commentProbability! - a.numericProbability!)).slice(0, 20);
  return ["| Horse | Target | Relevant prior comments | Extracted flags | Numeric | Comments | Result |", "|---|---|---|---|---:|---:|---|", ...rows.map((e) => {
    const flags = COMMENT_NAMES.filter((name) => e.comments[1 + COMMENT_NAMES.indexOf(name)] || e.comments[1 + COMMENT_NAMES.length + COMMENT_NAMES.indexOf(name)]).join(", ") || "none";
    const comments = e.priorComments.map((c) => `${c.raceDate}: ${escapeCell(c.comment)}`).join(" / ");
    return `| ${escapeCell(e.row.features.horseName)} | ${e.row.features.raceDate} ${escapeCell(e.row.features.courseName)} | ${comments} | ${flags} | ${pct(e.numericProbability!)} | ${pct(e.commentProbability!)} | ${e.won ? "Won" : `Pos ${e.row.outcome.finishingPosition ?? "-"}`} |`;
  })];
}

function tissueExamples(examples: Example[]) {
  const races = groupIndexes(examples).slice(0, 3);
  return races.flatMap((indexes) => {
    const first = examples[indexes[0]!]!;
    const rows = [...indexes].sort((a, b) => examples[b]!.commentProbability! - examples[a]!.commentProbability!);
    const total = rows.reduce((sum, index) => sum + examples[index]!.commentProbability!, 0);
    return [`### ${first.row.features.raceDate} ${first.row.features.courseName} - ${first.row.features.raceName ?? "Race"}`, "", `Book total: ${pct(total, 4)}`, "", "| Horse | Probability | Fair decimal | Fair fractional approximation |", "|---|---:|---:|---:|", ...rows.map((index) => {
      const e = examples[index]!, decimal = 1 / e.commentProbability!;
      return `| ${escapeCell(e.row.features.horseName)} | ${pct(e.commentProbability!, 2)} | ${fmt(decimal, 2)} | ${fmt(decimal - 1, 2)}/1 |`;
    }), ""];
  });
}

function decisionLines(numeric: ReturnType<typeof metrics>, comments: ReturnType<typeof metrics>) {
  const improved = comments.logLoss < numeric.logLoss && comments.brier < numeric.brier;
  return [
    `1. Existing numeric data ${numeric.top1 > 0 ? "can" : "cannot"} produce a reproducible independent 100% tissue; usefulness is constrained by holdout log loss ${fmt(numeric.logLoss, 4)} and calibration above.`,
    `2. Historical comments ${improved ? "improve" : "do not jointly improve"} 2026 log loss and Brier out of sample.`,
    "3. The coefficient table identifies candidate comment families, but correlated phrases and sparse flags prevent causal interpretation.",
    `4. A production Tissue v1 is ${improved ? "plausible, but should require rolling-year validation and stable calibration before exposure" : "not justified by comment augmentation on this holdout alone"}.`,
    `5. Comments should ${improved ? "remain interpretable structured inputs with contextual display" : "remain contextual explanation rather than production model inputs for now"}.`,
    "6. The transparent conditional logit is sufficient as the baseline; richer models are justified only after stronger rolling holdouts.",
    "7. Minimum production candidate: OR, prior performance/speed summaries, prior-only trainer/jockey rates and samples, recency, age, weight, class, distance, field size, draw, going and handicap status, with explicit missingness. Market data stays evaluation-only.",
  ];
}

function numericClass(value: string | null) { const match = value?.match(/\d+/); return match ? Number(match[0]) : null; }
export function groupIndexes(examples: Example[]) { return [...groupBy(examples.map((_, index) => index), (index) => examples[index]!.raceId).values()]; }
function groupBy<T>(values: T[], key: (value: T) => string) { const map = new Map<string, T[]>(); for (const value of values) { const k = key(value); map.set(k, [...(map.get(k) ?? []), value]); } return map; }
function dot(left: number[], right: number[]) { let total = 0; for (let i = 0; i < left.length; i += 1) total += left[i]! * right[i]!; return total; }
function average(values: number[]) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function standardDeviation(values: number[], mean: number) { return Math.sqrt(average(values.map((value) => (value - mean) ** 2))); }
function maxIndex(indexes: number[], value: (index: number) => number) { return indexes.reduce((best, index) => value(index) > value(best) ? index : best); }
function count<T>(values: T[], predicate: (value: T) => boolean) { return values.filter(predicate).length; }
function fmt(value: number, digits = 4) { return Number.isFinite(value) ? value.toFixed(digits) : "-"; }
function pct(value: number, digits = 1) { return Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : "-"; }
function signed(value: number) { return `${value >= 0 ? "+" : ""}${fmt(value)}`; }
function signedPct(value: number) { return `${value >= 0 ? "+" : ""}${pct(value)}`; }
function escapeCell(value: string) { return value.replaceAll("|", "\\|").replaceAll("\n", " "); }
function metricRow(sample: string, model: string, m: ReturnType<typeof metrics>) { return `| ${sample} | ${model} | ${m.races} | ${m.runners} | ${fmt(m.logLoss)} | ${fmt(m.brier)} | ${pct(m.top1)} | ${pct(m.top2)} | ${pct(m.top3)} |`; }
function summaryLine(label: string, m: ReturnType<typeof metrics>) { return `${label}: races=${m.races} runners=${m.runners} log_loss=${fmt(m.logLoss)} brier=${fmt(m.brier)} top1=${pct(m.top1)}`; }

if (process.argv[1]?.endsWith("diagnose-independent-tissue-feasibility.ts")) await main();
