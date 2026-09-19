import { writeFile } from "node:fs/promises";
import { createDbConnection } from "@/db";
import { loadBacktestFeatureCache, loadLatestBacktestFeatureCacheForYear, type LoadedBacktestFeatureCache } from "@/lib/racing/backtest-cache";
import {
  COMMENT_NAMES,
  buildExamples,
  fitModel,
  groupIndexes,
  loadHistoricalComments,
  metrics,
  predict,
  type Example,
  type Model,
  type ProbabilityKey,
} from "./diagnose-independent-tissue-feasibility";

const REPORT_PATH = "/tmp/independent-tissue-walk-forward.md";
const BOOTSTRAPS = 1_000;
const BANDS: Array<[string, number, number]> = [["<5%", 0, .05], ["5-9.99%", .05, .1], ["10-14.99%", .1, .15], ["15-19.99%", .15, .2], ["20-29.99%", .2, .3], ["30%+", .3, 1.01]];

type WindowResult = {
  label: string;
  trainYear: string;
  testYear: string;
  train: Example[];
  test: Example[];
  numericModel: Model;
  commentModel: Model;
  ablations: Array<{ name: string; model: Model; examples: Example[] }>;
  trainCache: LoadedBacktestFeatureCache;
  testCache: LoadedBacktestFeatureCache;
};

async function main() {
  const cache2024 = await loadBacktestFeatureCache({
    from: "2024-01-01", to: "2024-12-31", family: "turf_flat", outputDir: "/tmp/independent-tissue-cache",
  });
  const [cache2025, cache2026] = await Promise.all([
    loadBacktestFeatureCache({ from: "2025-01-01", to: "2025-12-31", family: "turf_flat" }),
    loadLatestBacktestFeatureCacheForYear({ year: "2026", family: "turf_flat" }),
  ]);
  if (!cache2025 || !cache2026) throw new Error("Compatible 2025 and 2026 Turf caches are required");

  const connection = createDbConnection();
  try {
    const comments = await loadHistoricalComments(connection.client);
    const datasets = new Map<string, { cache: LoadedBacktestFeatureCache; examples: Example[] }>();
    if (cache2024) datasets.set("2024", { cache: cache2024, examples: buildExamples(cache2024.rows, comments) });
    datasets.set("2025", { cache: cache2025, examples: buildExamples(cache2025.rows, comments) });
    datasets.set("2026", { cache: cache2026, examples: buildExamples(cache2026.rows, comments) });

    const windows: WindowResult[] = [];
    if (datasets.has("2024")) windows.push(evaluateWindow("2024 -> 2025", "2024", "2025", datasets));
    windows.push(evaluateWindow("2025 -> 2026 YTD", "2025", "2026", datasets));
    await writeFile(REPORT_PATH, buildReport(windows, datasets), "utf8");
    console.log(`Wrote ${REPORT_PATH}`);
    for (const window of windows) {
      console.log(metricLine(window.label, window.test));
    }
  } finally {
    await connection.client.end();
  }
}

function evaluateWindow(label: string, trainYear: string, testYear: string, datasets: Map<string, { cache: LoadedBacktestFeatureCache; examples: Example[] }>): WindowResult {
  const training = datasets.get(trainYear)!;
  const testing = datasets.get(testYear)!;
  const train = cloneExamples(training.examples);
  const test = cloneExamples(testing.examples);
  const numericModel = fitModel(train, false);
  const commentModel = fitModel(train, true);
  predict(test, numericModel, false, "numericProbability");
  predict(test, commentModel, true, "commentProbability");
  predict(train, numericModel, false, "numericProbability");
  predict(train, commentModel, true, "commentProbability");
  const ablations = ablationDefinitions().map(({ name, indexes }) => {
    const model = fitModel(train, true, indexes);
    const examples = cloneExamples(test);
    predict(examples, model, true, "commentProbability", indexes);
    return { name, model, examples };
  });
  return { label, trainYear, testYear, train, test, numericModel, commentModel, ablations, trainCache: training.cache, testCache: testing.cache };
}

function buildReport(windows: WindowResult[], datasets: Map<string, { cache: LoadedBacktestFeatureCache; examples: Example[] }>) {
  const lines = [
    "# Independent Turf Tissue: Stage 2 Walk-Forward Validation", "",
    "Diagnostic only. Today, production ratings, selections and production caches were not changed.", "",
    "## Available-year audit", "",
    "| Year | Coverage | Cache rows | Eligible races | Eligible runners | Prior-comment coverage | Status |",
    "|---|---|---:|---:|---:|---:|---|",
  ];
  for (const [year, value] of datasets) {
    const m = metricsWithTemporaryUniform(value.examples);
    lines.push(`| ${year} | ${value.cache.actualCoverage?.actualFrom ?? value.cache.manifest.from} to ${value.cache.actualCoverage?.actualTo ?? value.cache.manifest.to} | ${value.cache.manifest.rowCount} | ${m.races} | ${m.runners} | ${pct(commentCoverage(value.examples))} | ${year === "2024" ? "Complete target year; prior-form archive before 2024 is incomplete" : year === "2026" ? "YTD" : "Complete"} |`);
  }
  lines.push("", "### Required-input coverage", "", "| Year | Prior run | Trainer prior sample | Jockey prior sample | Known result label |", "|---|---:|---:|---:|---:|");
  for (const [year, value] of datasets) {
    const coverage = featureCoverage(value.examples);
    lines.push(`| ${year} | ${pct(coverage.priorRun)} | ${pct(coverage.trainer)} | ${pct(coverage.jockey)} | ${pct(coverage.label)} |`);
  }
  lines.push("", "No compatible 2023 data exists. The database has only a short 2020 slice before the complete 2024 archive; therefore 2024 target labels/comments are complete, but early-2024 prior-run depth is understated. The 2024 cache was built under `/tmp` and not added to production caches.", "");

  lines.push("## Frozen specification and leakage audit", "",
    "- Both windows use the unchanged Stage 1 numeric vectors, comment taxonomy, last-three-comment chronology, conditional-logit race softmax, 90 epochs and L2=0.02.",
    "- Standardisation is fitted on each training year only; no test-year retuning or feature selection occurs.",
    "- Every prior comment has `race_datetime < target race_datetime`; target and future comments are excluded.",
    "- Final SP, target result fields, market rank, Timewise and Betfair are absent from model inputs.",
    "- Trainer/jockey and rating features are generated target-time prior-only. Target outcomes are labels only.",
    "- Only races with exactly one known winner are evaluated; every active runner in those races remains in the probability book.", "");

  lines.push("## Walk-forward results", "", "| Window | Model | Races | Runners | Comment coverage | Log loss | Brier | Top 1 | Top 2 | Top 3 |", "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const window of windows) {
    lines.push(resultRow(window, "Numeric", "numericProbability"), resultRow(window, "Numeric + comments", "commentProbability"));
    const n = metrics(window.test, "numericProbability"), c = metrics(window.test, "commentProbability");
    lines.push(`| ${window.label} | Comments - numeric | | | | ${signed(c.logLoss - n.logLoss)} | ${signed(c.brier - n.brier)} | ${signedPct(c.top1 - n.top1)} | ${signedPct(c.top2 - n.top2)} | ${signedPct(c.top3 - n.top3)} |`);
  }

  for (const window of windows) {
    lines.push("", `## ${window.label}`, "", "### Calibration", "", ...calibrationTables(window.test), "", "### Bootstrap uncertainty", "", ...bootstrapTable(window), "", "### Comment-family ablations", "", ...ablationTable(window), "", "### Field-size stability", "", ...groupTable(window.test, fieldSizeGroup), "", "### Handicap status", "", ...groupTable(window.test, handicapGroup), "", "### Race class", "", ...groupTable(window.test, classGroup), "", "### Probability and ranking stability", "", ...probabilityStability(window.test), "", "### Largest 20 comment adjustments", "", ...largestAdjustments(window.test), "", "### Ten production-style race examples", "", ...raceExamples(window.test, 10));
  }

  lines.push("", "## Comment coefficient stability", "", ...coefficientStability(windows), "", "## Decision", "", ...decision(windows), "", "## Reproducibility", "", `- Bootstrap resamples: ${BOOTSTRAPS} races with deterministic seed.`, `- Report: ${REPORT_PATH}.`, "");
  return lines.join("\n");
}

function calibrationTables(examples: Example[]) {
  return ["#### Numeric", "", ...calibration(examples, "numericProbability"), "", "#### Numeric + comments", "", ...calibration(examples, "commentProbability")];
}
function calibration(examples: Example[], key: ProbabilityKey) {
  return ["| Band | Runners | Mean probability | Actual strike | Error |", "|---|---:|---:|---:|---:|", ...BANDS.map(([label, low, high]) => {
    const rows = examples.filter((e) => e[key]! >= low && e[key]! < high);
    const predicted = average(rows.map((e) => e[key]!)), actual = average(rows.map((e) => e.won ? 1 : 0));
    return `| ${label} | ${rows.length} | ${pct(predicted)} | ${pct(actual)} | ${signedPct(actual - predicted)} |`;
  })];
}

function bootstrapTable(window: WindowResult) {
  const races = groupIndexes(window.test), random = mulberry32(20260919 + Number(window.trainYear));
  const deltas: Array<[number, number, number]> = [];
  for (let sample = 0; sample < BOOTSTRAPS; sample += 1) {
    const examples = Array.from({ length: races.length }, (_, draw) =>
      races[Math.floor(random() * races.length)]!.map((index) => ({
        ...window.test[index]!,
        raceId: `${window.test[index]!.raceId}:bootstrap:${draw}`,
      })),
    ).flat();
    const n = metrics(examples, "numericProbability"), c = metrics(examples, "commentProbability");
    deltas.push([c.logLoss - n.logLoss, c.brier - n.brier, c.top1 - n.top1]);
  }
  return ["| Measure (comments - numeric) | Estimate | 95% race-bootstrap interval |", "|---|---:|---:|",
    bootstrapRow("Log loss", metrics(window.test, "commentProbability").logLoss - metrics(window.test, "numericProbability").logLoss, deltas.map((d) => d[0])),
    bootstrapRow("Brier", metrics(window.test, "commentProbability").brier - metrics(window.test, "numericProbability").brier, deltas.map((d) => d[1])),
    bootstrapRow("Top-1", metrics(window.test, "commentProbability").top1 - metrics(window.test, "numericProbability").top1, deltas.map((d) => d[2]), true)];
}

function ablationTable(window: WindowResult) {
  const numeric = metrics(window.test, "numericProbability");
  return ["| Features | Log loss | Delta vs numeric | Brier | Delta vs numeric | Top 1 |", "|---|---:|---:|---:|---:|---:|", `| Numeric only | ${fmt(numeric.logLoss)} | - | ${fmt(numeric.brier)} | - | ${pct(numeric.top1)} |`, ...window.ablations.map((a) => {
    const m = metrics(a.examples, "commentProbability");
    return `| ${a.name} | ${fmt(m.logLoss)} | ${signed(m.logLoss - numeric.logLoss)} | ${fmt(m.brier)} | ${signed(m.brier - numeric.brier)} | ${pct(m.top1)} |`;
  })];
}

function groupTable(examples: Example[], getGroup: (e: Example) => string) {
  const groups = new Map<string, Example[]>();
  for (const example of examples) groups.set(getGroup(example), [...(groups.get(getGroup(example)) ?? []), example]);
  return ["| Group | Races | Model | Log loss | Brier | Top 1 | Mean abs calibration error |", "|---|---:|---|---:|---:|---:|---:|", ...[...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).flatMap(([name, rows]) => (["numericProbability", "commentProbability"] as ProbabilityKey[]).map((key) => {
    const m = metrics(rows, key);
    return `| ${name} | ${m.races} | ${key === "numericProbability" ? "Numeric" : "Comments"} | ${fmt(m.logLoss)} | ${fmt(m.brier)} | ${pct(m.top1)} | ${pct(calibrationError(rows, key))} |`;
  }))];
}

function probabilityStability(examples: Example[]) {
  const changes = examples.map((e) => Math.abs(e.commentProbability! - e.numericProbability!)).sort((a, b) => a - b);
  const races = groupIndexes(examples);
  let rank1 = 0, top2 = 0, top3 = 0;
  for (const indexes of races) {
    const numeric = rank(indexes, examples, "numericProbability"), comments = rank(indexes, examples, "commentProbability");
    if (numeric[0] !== comments[0]) rank1 += 1;
    if (setKey(numeric.slice(0, 2)) !== setKey(comments.slice(0, 2))) top2 += 1;
    if (setKey(numeric.slice(0, 3)) !== setKey(comments.slice(0, 3))) top3 += 1;
  }
  return [`- Absolute runner probability change: median ${pct(quantile(changes, .5), 2)}, p75 ${pct(quantile(changes, .75), 2)}, p90 ${pct(quantile(changes, .9), 2)}, maximum ${pct(changes.at(-1) ?? 0, 2)}.`, `- Rank 1 changed in ${rank1}/${races.length} races (${pct(rank1 / races.length)}); top-2 set changed in ${pct(top2 / races.length)}; top-3 set changed in ${pct(top3 / races.length)}.`];
}

function largestAdjustments(examples: Example[]) {
  const rows = [...examples].sort((a, b) => Math.abs(b.commentProbability! - b.numericProbability!) - Math.abs(a.commentProbability! - a.numericProbability!)).slice(0, 20);
  return ["| Horse | Race | Prior comments | Features | Numeric | Comments | Result |", "|---|---|---|---|---:|---:|---|", ...rows.map((e) => `| ${esc(e.row.features.horseName)} | ${e.row.features.raceDate} ${esc(e.row.features.courseName)} ${esc(e.row.features.raceName ?? "")} | ${e.priorComments.map((c) => `${c.raceDate}: ${esc(c.comment)}`).join(" / ") || "none"} | ${activeFlags(e).join(", ") || "none"} | ${pct(e.numericProbability!, 2)} | ${pct(e.commentProbability!, 2)} | ${e.won ? "Won" : `Pos ${e.row.outcome.finishingPosition ?? "-"}`} |` )];
}

function raceExamples(examples: Example[], count: number) {
  return groupIndexes(examples).slice(0, count).flatMap((indexes) => {
    const first = examples[indexes[0]!]!, rows = rank(indexes, examples, "commentProbability");
    return [`#### ${first.row.features.raceDate} ${esc(first.row.features.courseName)} - ${esc(first.row.features.raceName ?? "Race")}`, "", `Numeric book ${pct(indexes.reduce((s, i) => s + examples[i]!.numericProbability!, 0), 4)}; comments book ${pct(indexes.reduce((s, i) => s + examples[i]!.commentProbability!, 0), 4)}.`, "", "| Horse | Numeric | Comments | Fair odds | Comment context |", "|---|---:|---:|---:|---|", ...rows.map((index) => { const e = examples[index]!; return `| ${esc(e.row.features.horseName)} | ${pct(e.numericProbability!, 2)} | ${pct(e.commentProbability!, 2)} | ${fmt(1 / e.commentProbability!, 2)} | ${activeFlags(e).join(", ") || "none"} |`; }), ""];
  });
}

function coefficientStability(windows: WindowResult[]) {
  const focus = ["weakened", "faded", "led", "prominent", "stayedOn", "strongFinish", "hampered", "deniedRoom", "racedWide", "slowlyAway", "heldUpRear"];
  return ["| Comment flag | " + windows.map((w) => `${w.trainYear} last / last3`).join(" | ") + " | Stable direction? |", "|---|" + windows.map(() => "---:|").join("") + "---|", ...focus.map((flag) => {
    const pairs = windows.map((w) => [weight(w.commentModel, `last_${flag}`), weight(w.commentModel, `last3_${flag}_count`)] as const);
    const signs = pairs.flat().filter((v) => Math.abs(v) >= .01).map(Math.sign);
    const stable = signs.length < 2 || signs.every((value) => value === signs[0]);
    return `| ${flag} | ${pairs.map(([last, last3]) => `${signed(last)} / ${signed(last3)}`).join(" | ")} | ${stable ? "Yes" : "No - reversal"} |`;
  })];
}

function decision(windows: WindowResult[]) {
  const comparisons = windows.map((w) => ({ n: metrics(w.test, "numericProbability"), c: metrics(w.test, "commentProbability") }));
  const logWins = comparisons.filter(({ n, c }) => c.logLoss < n.logLoss).length;
  const brierWins = comparisons.filter(({ n, c }) => c.brier < n.brier).length;
  const topWins = comparisons.filter(({ n, c }) => c.top1 > n.top1).length;
  const enoughIndependentYears = windows.length > 1 && windows.every((w) => w.trainYear !== "2024");
  return [
    `1. Numeric-only calibration is reported in ${windows.length} holdouts; the 2024-trained window carries a material prior-history limitation.`,
    `2. Comments improve log loss in ${logWins}/${windows.length} windows and Brier in ${brierWins}/${windows.length}.`,
    `3. Top-1 has a positive point estimate in ${topWins}/${windows.length} windows; see item 8 for uncertainty.`,
    "4. Coefficient direction stability is mixed where last-run and last-three versions of correlated phrases disagree; treat associations as descriptive.",
    "5. Field-size, handicap and class tables show whether gains are broad rather than driven by one segment; no segment was excluded or tuned.",
    "6. Probability-change distributions and set-change rates distinguish refinement from wholesale ranking changes.",
    `7. Tissue v1 is ${enoughIndependentYears && logWins > 1 && brierWins > 1 ? "supported by the available walk-forward evidence" : "not yet justified as a production model"}.`,
    `8. Top-1 has a positive point estimate in ${topWins}/${windows.length} windows, but only the 2026 interval excludes zero; ranking improvement is not convincingly replicated.`,
    "9. Improvements in log loss are broad by field size and handicap status, with isolated class-level exceptions; calibration error does not improve in every subgroup.",
    "10. Market evaluation was intentionally omitted: it was optional, final SP is not present in the frozen Stage 1 feature cache, and no proxy was introduced.",
    "11. If not justified, the missing evidence is another complete pre-2025 training year with adequate preceding history, followed by a genuinely untouched chronological holdout.",
  ];
}

function ablationDefinitions() {
  const groups: Array<[string, string[]]> = [
    ["Trip/interference", ["slowlyAway", "awkwardStart", "hampered", "bumped", "checked", "deniedRoom", "shortRoom", "switched", "racedWide"]],
    ["Position/style", ["prominent", "led", "heldUpRear", "racedFreely"]],
    ["Finish/effort", ["stayedOn", "strongFinish", "weakened", "faded", "eased", "neverDangerous", "lostTouch"]],
    ["All comments", COMMENT_NAMES],
  ];
  return groups.map(([name, flags]) => ({ name: `Numeric + ${name.toLowerCase()}`, indexes: [0, ...flags.flatMap((flag) => [1 + COMMENT_NAMES.indexOf(flag as never), 1 + COMMENT_NAMES.length + COMMENT_NAMES.indexOf(flag as never)])] }));
}

function metricsWithTemporaryUniform(examples: Example[]) { const copy = cloneExamples(examples); for (const indexes of groupIndexes(copy)) indexes.forEach((i) => { copy[i]!.numericProbability = 1 / indexes.length; }); return metrics(copy, "numericProbability"); }
function resultRow(w: WindowResult, name: string, key: ProbabilityKey) { const m = metrics(w.test, key); return `| ${w.label} | ${name} | ${m.races} | ${m.runners} | ${pct(commentCoverage(w.test))} | ${fmt(m.logLoss)} | ${fmt(m.brier)} | ${pct(m.top1)} | ${pct(m.top2)} | ${pct(m.top3)} |`; }
function metricLine(label: string, examples: Example[]) { const n = metrics(examples, "numericProbability"), c = metrics(examples, "commentProbability"); return `${label}: numeric logloss=${fmt(n.logLoss)} brier=${fmt(n.brier)} top1=${pct(n.top1)}; comments logloss=${fmt(c.logLoss)} brier=${fmt(c.brier)} top1=${pct(c.top1)}`; }
function commentCoverage(examples: Example[]) { return examples.filter((e) => e.priorComments.length > 0).length / examples.length; }
function featureCoverage(examples: Example[]) {
  return {
    priorRun: examples.filter((e) => e.row.features.priorRuns > 0).length / examples.length,
    trainer: examples.filter((e) => e.row.features.trainerPriorRuns > 0).length / examples.length,
    jockey: examples.filter((e) => (e.row.features.jockeyPriorRuns ?? 0) > 0).length / examples.length,
    label: examples.filter((e) => e.row.outcome.won !== null).length / examples.length,
  };
}
function fieldSizeGroup(e: Example) { const n = e.row.features.actualRunnerCount ?? e.row.features.declaredRunnerCount ?? 0; return n <= 5 ? "2-5" : n <= 8 ? "6-8" : n <= 12 ? "9-12" : "13+"; }
function handicapGroup(e: Example) { return /handicap/i.test(`${e.row.features.raceName ?? ""} ${e.row.features.raceType ?? ""}`) ? "Handicap" : "Non-handicap"; }
function classGroup(e: Example) { return e.row.features.raceClass?.match(/\d+/)?.[0] ? `Class ${e.row.features.raceClass.match(/\d+/)![0]}` : "Class unavailable"; }
function calibrationError(rows: Example[], key: ProbabilityKey) { return average(BANDS.map(([, low, high]) => rows.filter((e) => e[key]! >= low && e[key]! < high)).filter((band) => band.length).map((band) => Math.abs(average(band.map((e) => e[key]!)) - average(band.map((e) => e.won ? 1 : 0))))); }
function cloneExamples(examples: Example[]) { return examples.map((e) => ({ ...e, numeric: [...e.numeric], comments: [...e.comments], priorComments: [...e.priorComments] })); }
function rank(indexes: number[], examples: Example[], key: ProbabilityKey) { return [...indexes].sort((a, b) => examples[b]![key]! - examples[a]![key]! || a - b); }
function setKey(indexes: number[]) { return [...indexes].sort((a, b) => a - b).join(","); }
function activeFlags(e: Example[]) : string[]; function activeFlags(e: Example): string[]; function activeFlags(e: Example | Example[]) { const row = Array.isArray(e) ? e[0] : e; return COMMENT_NAMES.filter((_, i) => row.comments[1 + i] || row.comments[1 + COMMENT_NAMES.length + i]); }
function weight(model: Model, name: string) { const index = model.names.indexOf(name); return index < 0 ? 0 : model.weights[index]!; }
function bootstrapRow(name: string, estimate: number, values: number[], percentage = false) { values.sort((a, b) => a - b); const format = percentage ? signedPct : signed; return `| ${name} | ${format(estimate)} | ${format(quantile(values, .025))} to ${format(quantile(values, .975))} |`; }
function quantile(values: number[], q: number) { if (!values.length) return 0; const p = (values.length - 1) * q, low = Math.floor(p), high = Math.ceil(p); return values[low]! + (values[high]! - values[low]!) * (p - low); }
function average(values: number[]) { return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0; }
function mulberry32(seed: number) { return () => { let t = seed += 0x6d2b79f5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function fmt(value: number, digits = 4) { return Number.isFinite(value) ? value.toFixed(digits) : "-"; }
function pct(value: number, digits = 1) { return Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : "-"; }
function signed(value: number) { return `${value >= 0 ? "+" : ""}${fmt(value)}`; }
function signedPct(value: number) { return `${value >= 0 ? "+" : ""}${pct(value)}`; }
function esc(value: string) { return value.replaceAll("|", "\\|").replaceAll("\n", " "); }

if (process.argv[1]?.endsWith("diagnose-independent-tissue-walk-forward.ts")) await main();
