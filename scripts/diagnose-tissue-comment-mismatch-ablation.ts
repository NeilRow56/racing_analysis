import { writeFile } from "node:fs/promises";
import { createDbConnection } from "@/db";
import { settleSelection } from "@/lib/racing/backtest";
import { loadBacktestFeatureCache, loadLatestBacktestFeatureCacheForYear } from "@/lib/racing/backtest-cache";
import type { HistoricalPreRaceFeatureRow, HistoricalTargetRunnerMetricsRow } from "@/lib/racing/historical-target-metrics";
import { classifyJumpRaceSubtype } from "@/lib/racing/jump-speed-rating";
import { loadJumpTissueModel } from "@/lib/racing/jump-tissue-model";
import { classifyHandicapStatus } from "@/lib/racing/research-rule";
import { loadFrozenTissueModel, TISSUE_V2_CONFIG } from "@/lib/racing/tissue-forward";
import {
  commentVector,
  loadHistoricalComments,
  numericVector as turfNumericVector,
  priorCommentsForTarget,
  raceSoftmax,
  score,
  type HistoricalComment,
  type Model,
} from "./diagnose-independent-tissue-feasibility";

const MD_OUTPUT = "/tmp/tissue-comment-mismatch-ablation.md";
const JSON_OUTPUT = "/tmp/tissue-comment-mismatch-ablation.json";
const ZERO_BASE_FEATURES = ["checked", "deniedRoom", "shortRoom", "slowlyAway"] as const;
const ZERO_FEATURES = ZERO_BASE_FEATURES.flatMap((name) => [`last_${name}`, `last3_${name}_count`]);
const EPSILON = 1e-12;

type Family = "TURF" | "HURDLE" | "CHASE";
type Variant = "CONTROL" | "MISMATCH_ZERO";
type Scope = "ALL_TURF" | "TURF_5F_8F" | "HURDLE" | "CHASE";

type RunnerEval = {
  raceId: string;
  runnerId: string;
  horseId: string;
  horseName: string;
  won: boolean;
  sp: number;
  controlProbability: number;
  candidateProbability: number;
  controlRank: number;
  candidateRank: number;
  activeNeutralised: string[];
  features: HistoricalPreRaceFeatureRow;
};

type RaceEval = {
  raceId: string;
  date: string;
  course: string;
  family: Family;
  raceName: string | null;
  distanceYards: number | null;
  runners: RunnerEval[];
};

async function main() {
  const [turfModel, jumpModel, turfCache, jumpCache] = await Promise.all([
    loadFrozenTissueModel(TISSUE_V2_CONFIG.modelPath, TISSUE_V2_CONFIG.modelVersion),
    loadJumpTissueModel(),
    loadLatestBacktestFeatureCacheForYear({ year: "2026", family: "turf_flat" }),
    loadBacktestFeatureCache({ from: "2026-01-01", to: "2026-12-31", family: "jump" }),
  ]);
  if (!turfCache) throw new Error("Missing compatible 2026 Turf backtest cache");
  if (!jumpCache) throw new Error("Missing compatible 2026 Jump backtest cache");

  const connection = createDbConnection();
  let comments: Map<string, HistoricalComment[]>;
  try {
    comments = await loadHistoricalComments(connection.client);
  } finally {
    await connection.client.end();
  }

  const turf = buildTurfRaces(turfCache.rows, comments, turfModel.model);
  const jump = buildJumpRaces(jumpCache.rows, comments, jumpModel.model);
  const races = [...turf, ...jump];
  const report = buildReport({
    generatedAt: new Date().toISOString(),
    models: {
      turf: { path: TISSUE_V2_CONFIG.modelPath, version: turfModel.version, checksum: turfModel.checksum, zeroedFeatures: presentZeroFeatures(turfModel.model) },
      jump: { path: "data/research/jump-tissue-model-v1.json", version: jumpModel.version, checksum: jumpModel.checksum, zeroedFeatures: presentZeroFeatures(jumpModel.model) },
    },
    caches: {
      turf: { directory: turfCache.directory, coverage: turfCache.actualCoverage },
      jump: { directory: jumpCache.directory, coverage: jumpCache.actualCoverage },
    },
    races,
  });

  await writeFile(JSON_OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(MD_OUTPUT, markdown(report), "utf8");
  printTerminalSummary(report);
}

function buildTurfRaces(rows: HistoricalTargetRunnerMetricsRow[], comments: Map<string, HistoricalComment[]>, model: Model): RaceEval[] {
  return buildRaces(rows.filter((row) => row.features.raceCode === "turf"), "TURF", model, (features) => [
    ...turfNumericVector(features),
    ...commentVector(priorCommentsForTarget(comments.get(features.horseId) ?? [], features.raceDateTime)),
  ]);
}

function buildJumpRaces(rows: HistoricalTargetRunnerMetricsRow[], comments: Map<string, HistoricalComment[]>, model: Model): RaceEval[] {
  return buildRaces(rows.filter((row) => row.features.raceCode === "jump" && jumpFamily(row.features) !== null), "HURDLE", model, (features) => [
    ...jumpNumericVector(features),
    ...commentVector(priorCommentsForTarget(comments.get(features.horseId) ?? [], features.raceDateTime)),
  ], (features) => jumpFamily(features)!);
}

function buildRaces(
  rows: HistoricalTargetRunnerMetricsRow[],
  defaultFamily: Family,
  model: Model,
  valuesFor: (features: HistoricalPreRaceFeatureRow) => number[],
  familyFor: (features: HistoricalPreRaceFeatureRow) => Family = () => defaultFamily,
): RaceEval[] {
  const races: RaceEval[] = [];
  for (const [raceId, raceRows] of groupBy(rows, (row) => row.features.targetRaceId)) {
    const active = raceRows.filter((row) => settleSelection({ ...row.outcome, startingPriceDecimal: "2" }) !== null);
    const settlements = active.map((row) => settleSelection(row.outcome));
    const expected = active[0]?.features.actualRunnerCount;
    if (
      active.length < 2 ||
      expected == null ||
      (expected !== active.length && expected !== raceRows.length) ||
      settlements.some((settlement) => settlement === null) ||
      active.filter((row) => row.outcome.won === true || row.outcome.finishingPosition === 1).length !== 1
    ) continue;

    const controlValues = active.map((row) => valuesFor(row.features));
    const candidateValues = controlValues.map((values) => zeroMismatchFeatures(model, values));
    const controlProbabilities = raceSoftmax(controlValues.map((values) => score(model, values)));
    const candidateProbabilities = raceSoftmax(candidateValues.map((values) => score(model, values)));
    const controlRanks = ranks(controlProbabilities, active.map((row) => row.features.targetRunnerId));
    const candidateRanks = ranks(candidateProbabilities, active.map((row) => row.features.targetRunnerId));
    const first = active[0]!.features;
    races.push({
      raceId,
      date: first.raceDate,
      course: first.courseName,
      family: familyFor(first),
      raceName: first.raceName,
      distanceYards: first.distanceYards,
      runners: active.map((row, index) => ({
        raceId,
        runnerId: row.features.targetRunnerId,
        horseId: row.features.horseId,
        horseName: row.features.horseName,
        won: row.outcome.won === true || row.outcome.finishingPosition === 1,
        sp: settlements[index]!.settlementOddsDecimal,
        controlProbability: controlProbabilities[index]!,
        candidateProbability: candidateProbabilities[index]!,
        controlRank: controlRanks[index]!,
        candidateRank: candidateRanks[index]!,
        activeNeutralised: activeZeroFeatures(model, controlValues[index]!),
        features: row.features,
      })),
    });
  }
  return races;
}

function zeroMismatchFeatures(model: Model, values: number[]) {
  const next = [...values];
  for (const feature of ZERO_FEATURES) {
    const index = model.names.indexOf(feature);
    if (index >= 0) next[index] = 0;
  }
  return next;
}

function presentZeroFeatures(model: Model) {
  return ZERO_FEATURES.filter((feature) => model.names.includes(feature));
}

function activeZeroFeatures(model: Model, values: number[]) {
  return ZERO_FEATURES.filter((feature) => {
    const index = model.names.indexOf(feature);
    return index >= 0 && values[index] !== 0;
  });
}

function jumpNumericVector(features: HistoricalPreRaceFeatureRow): number[] {
  const values = [
    features.officialRating,
    features.latestJumpSpeedRating,
    features.bestJumpSpeedLast3,
    features.averageJumpSpeedLast3,
    features.trainerPriorWinRate,
    Math.log1p(features.trainerPriorRuns),
    features.jockeyPriorWinRate ?? null,
    Math.log1p(features.jockeyPriorRuns ?? 0),
    features.daysSinceLastRun,
    Math.log1p(features.priorRuns),
    features.horseAge,
    features.weightCarriedLbs,
    numericClass(features.raceClass),
    features.distanceYards === null ? null : features.distanceYards / 220,
    features.actualRunnerCount ?? features.declaredRunnerCount,
    classifyHandicapStatus(features) === "unknown" ? null : classifyHandicapStatus(features) === "handicap" ? 1 : 0,
    /soft|heavy/i.test(features.going ?? "") ? 1 : 0,
    /firm/i.test(features.going ?? "") ? 1 : 0,
  ];
  return [
    ...values.map((value) => typeof value === "number" && Number.isFinite(value) ? value : 0),
    ...values.map((value) => typeof value === "number" && Number.isFinite(value) ? 0 : 1),
  ];
}

function buildReport(input: {
  generatedAt: string;
  models: unknown;
  caches: unknown;
  races: RaceEval[];
}) {
  const scopeRaces = {
    ALL_TURF: input.races.filter((race) => race.family === "TURF"),
    TURF_5F_8F: input.races.filter((race) => race.family === "TURF" && race.distanceYards !== null && race.distanceYards >= 1100 && race.distanceYards <= 1760),
    HURDLE: input.races.filter((race) => race.family === "HURDLE"),
    CHASE: input.races.filter((race) => race.family === "CHASE"),
  } satisfies Record<Scope, RaceEval[]>;
  const scopes = Object.fromEntries(Object.entries(scopeRaces).map(([scope, races]) => [scope, compareScope(races)])) as Record<Scope, ReturnType<typeof compareScope>>;
  const examples = rankChangeExamples(input.races);
  return {
    generatedAt: input.generatedAt,
    experiment: {
      name: "COMMENT_MISMATCH_ABLATION",
      candidate: "MISMATCH_ZERO",
      evaluationYear: "2026",
      developmentContext: "2025 frozen model training only; no fitting or threshold selection in 2026",
      zeroedBaseFeatures: ZERO_BASE_FEATURES,
      valueDefinition: "Retrospective diagnostic final-SP value: rank-1 model probability > 1 / final SP decimal. No production prospective VALUE rule, price cap or threshold was changed.",
    },
    models: input.models,
    caches: input.caches,
    scopes,
    hurdleLongPriceFocus: compareLongPrice(scopeRaces.HURDLE, 15),
    turfLongPriceFocus: compareLongPrice(scopeRaces.ALL_TURF, 21),
    examples,
    decision: {
      turf: decision(scopes.ALL_TURF.control, scopes.ALL_TURF.candidate, scopes.ALL_TURF.rank1Changes),
      hurdle: decision(scopes.HURDLE.control, scopes.HURDLE.candidate, scopes.HURDLE.rank1Changes),
      chase: decision(scopes.CHASE.control, scopes.CHASE.candidate, scopes.CHASE.rank1Changes),
    },
  };
}

function compareScope(races: RaceEval[]) {
  const control = metrics(races, "CONTROL");
  const candidate = metrics(races, "MISMATCH_ZERO");
  const rankChanges = changedLeaders(races);
  const valueChanges = races.filter((race) => diagnosticValueLeader(race, "CONTROL")?.runnerId !== diagnosticValueLeader(race, "MISMATCH_ZERO")?.runnerId).length;
  return {
    races: races.length,
    runners: races.reduce((sum, race) => sum + race.runners.length, 0),
    control,
    candidate,
    delta: {
      logLoss: candidate.logLoss - control.logLoss,
      brier: candidate.brier - control.brier,
      calibrationError: candidate.calibrationError - control.calibrationError,
      rank1Strike: candidate.rank1Strike - control.rank1Strike,
      top2Capture: candidate.top2Capture - control.top2Capture,
      top3Capture: candidate.top3Capture - control.top3Capture,
    },
    rank1Changes: rankChanges.length,
    valueSelectionsChanged: valueChanges,
    longPricedRank1Changed: rankChanges.filter((change) => change.control.sp > 15 || change.candidate.sp > 15).length,
    longPricedRank1Displaced: rankChanges.filter((change) => change.control.sp > 15 && change.candidate.sp <= 15).length,
  };
}

function metrics(races: RaceEval[], variant: Variant) {
  const probability = (runner: RunnerEval) => variant === "CONTROL" ? runner.controlProbability : runner.candidateProbability;
  const rank = (runner: RunnerEval) => variant === "CONTROL" ? runner.controlRank : runner.candidateRank;
  const logLoss = average(races.map((race) => -Math.log(Math.max(sum(race.runners.filter((runner) => runner.won).map(probability)), EPSILON))));
  const brier = average(races.map((race) => sum(race.runners.map((runner) => (probability(runner) - (runner.won ? 1 : 0)) ** 2))));
  const calibrationError = weightedCalibrationError(races, probability);
  return {
    logLoss,
    brier,
    calibrationError,
    rank1Strike: average(races.map((race) => race.runners.some((runner) => rank(runner) === 1 && runner.won) ? 1 : 0)),
    top2Capture: average(races.map((race) => race.runners.some((runner) => rank(runner) <= 2 && runner.won) ? 1 : 0)),
    top3Capture: average(races.map((race) => race.runners.some((runner) => rank(runner) <= 3 && runner.won) ? 1 : 0)),
    calibration: calibrationBands(races, probability),
  };
}

function compareLongPrice(races: RaceEval[], minSpExclusive: number) {
  return {
    control: rankOneSummary(races, "CONTROL", minSpExclusive),
    candidate: rankOneSummary(races, "MISMATCH_ZERO", minSpExclusive),
  };
}

function rankOneSummary(races: RaceEval[], variant: Variant, minSpExclusive: number) {
  const rows = races.flatMap((race) => leaders(race, variant)).filter((runner) => runner.sp > minSpExclusive);
  const expected = sum(rows.map((runner) => variant === "CONTROL" ? runner.controlProbability : runner.candidateProbability));
  const winners = rows.filter((runner) => runner.won).length;
  return { selections: rows.length, winners, expectedWinners: expected, calibration: ratio(winners, expected) };
}

function changedLeaders(races: RaceEval[]) {
  return races.flatMap((race) => {
    const control = leader(race, "CONTROL");
    const candidate = leader(race, "MISMATCH_ZERO");
    if (!control || !candidate || control.runnerId === candidate.runnerId) return [];
    return [{ race, control, candidate }];
  });
}

function rankChangeExamples(races: RaceEval[]) {
  return changedLeaders(races)
    .map((change) => ({
      disagreement: Math.abs(change.control.controlProbability - 1 / change.control.sp) + Math.abs(change.candidate.candidateProbability - 1 / change.candidate.sp),
      date: change.race.date,
      course: change.race.course,
      family: change.race.family,
      raceName: change.race.raceName,
      controlRank1: change.control.horseName,
      candidateRank1: change.candidate.horseName,
      controlResult: resultLabel(change.control),
      candidateResult: resultLabel(change.candidate),
      featuresNeutralised: [...new Set([...change.control.activeNeutralised, ...change.candidate.activeNeutralised])].sort(),
      priceContext: {
        controlSp: change.control.sp,
        candidateSp: change.candidate.sp,
        controlProbability: change.control.controlProbability,
        candidateProbability: change.candidate.candidateProbability,
        controlMarketGap: change.control.controlProbability - 1 / change.control.sp,
        candidateMarketGap: change.candidate.candidateProbability - 1 / change.candidate.sp,
      },
    }))
    .sort((left, right) => right.disagreement - left.disagreement)
    .slice(0, 20)
    .map((row) => ({
      date: row.date,
      course: row.course,
      family: row.family,
      raceName: row.raceName,
      controlRank1: row.controlRank1,
      candidateRank1: row.candidateRank1,
      controlResult: row.controlResult,
      candidateResult: row.candidateResult,
      featuresNeutralised: row.featuresNeutralised,
      priceContext: row.priceContext,
    }));
}

function diagnosticValueLeader(race: RaceEval, variant: Variant) {
  const current = leader(race, variant);
  if (!current) return null;
  const probability = variant === "CONTROL" ? current.controlProbability : current.candidateProbability;
  return probability > 1 / current.sp ? current : null;
}

function leader(race: RaceEval, variant: Variant) {
  return leaders(race, variant)[0] ?? null;
}

function leaders(race: RaceEval, variant: Variant) {
  const rank = (runner: RunnerEval) => variant === "CONTROL" ? runner.controlRank : runner.candidateRank;
  return race.runners.filter((runner) => rank(runner) === 1);
}

function calibrationBands(races: RaceEval[], probability: (runner: RunnerEval) => number) {
  const bands = [
    { label: "<5%", min: 0, max: 0.05 },
    { label: "5-10%", min: 0.05, max: 0.10 },
    { label: "10-15%", min: 0.10, max: 0.15 },
    { label: "15-20%", min: 0.15, max: 0.20 },
    { label: "20-30%", min: 0.20, max: 0.30 },
    { label: "30%+", min: 0.30, max: Infinity },
  ];
  const runners = races.flatMap((race) => race.runners.map((runner) => ({ runner, probability: probability(runner) })));
  return bands.map((band) => {
    const rows = runners.filter((row) => row.probability >= band.min && row.probability < band.max);
    return {
      band: band.label,
      runners: rows.length,
      meanPredicted: average(rows.map((row) => row.probability)),
      actualStrike: average(rows.map((row) => row.runner.won ? 1 : 0)),
      absoluteError: Math.abs(average(rows.map((row) => row.probability)) - average(rows.map((row) => row.runner.won ? 1 : 0))),
    };
  });
}

function weightedCalibrationError(races: RaceEval[], probability: (runner: RunnerEval) => number) {
  const bands = calibrationBands(races, probability);
  const runners = sum(bands.map((band) => band.runners));
  return runners ? sum(bands.map((band) => band.absoluteError * band.runners)) / runners : 0;
}

function decision(control: ReturnType<typeof metrics>, candidate: ReturnType<typeof metrics>, rankChanges: number) {
  const ll = control.logLoss - candidate.logLoss;
  const brier = control.brier - candidate.brier;
  const calibration = control.calibrationError - candidate.calibrationError;
  const score = Number(ll > 0.002) + Number(brier > 0.001) + Number(calibration > 0.001) + Number(candidate.rank1Strike >= control.rank1Strike);
  const classification = score >= 3 && rankChanges > 0 ? "STRONG IMPROVEMENT" : score >= 2 ? "MODEST IMPROVEMENT" : "NO IMPROVEMENT";
  return {
    classification,
    recommendation: classification === "NO IMPROVEMENT" ? "KEEP CONTROL" : "PROMOTE TO PROSPECTIVE SHADOW",
    rationale: `Delta control-candidate: LL ${fmt(ll)}, Brier ${fmt(brier)}, calibration ${fmt(calibration)}, rank1 ${signedPct(candidate.rank1Strike - control.rank1Strike)}.`,
  };
}

function markdown(report: ReturnType<typeof buildReport>) {
  const scopeRows = Object.entries(report.scopes).flatMap(([scope, row]) => [
    `| ${scope} | CONTROL | ${row.races} | ${fmt(row.control.logLoss)} | ${fmt(row.control.brier)} | ${fmt(row.control.calibrationError)} | ${pct(row.control.rank1Strike)} | ${pct(row.control.top2Capture)} | ${pct(row.control.top3Capture)} | - | - | - |`,
    `| ${scope} | MISMATCH_ZERO | ${row.races} | ${fmt(row.candidate.logLoss)} | ${fmt(row.candidate.brier)} | ${fmt(row.candidate.calibrationError)} | ${pct(row.candidate.rank1Strike)} | ${pct(row.candidate.top2Capture)} | ${pct(row.candidate.top3Capture)} | ${row.rank1Changes} | ${row.valueSelectionsChanged} | ${row.longPricedRank1Changed} |`,
  ]);
  return [
    "# Tissue Comment Mismatch Ablation",
    "",
    "Read-only frozen-model diagnostic. The candidate sets only checked, deniedRoom, shortRoom and slowlyAway last-run / last-three-count features to zero where those columns exist. It does not reverse signs, refit, touch AW, or alter production artifacts.",
    "",
    "## Scope Metrics",
    "",
    "| Scope | Variant | Races | Log loss | Brier | Calibration error | Rank-1 strike | Top-2 capture | Top-3 capture | Rank-1 changes | Value changes | Long-price rank-1 changes |",
    "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ...scopeRows,
    "",
    "## Long-Price Focus",
    "",
    `- Hurdle rank-1 SP >14/1 CONTROL: ${longLine(report.hurdleLongPriceFocus.control)}.`,
    `- Hurdle rank-1 SP >14/1 MISMATCH_ZERO: ${longLine(report.hurdleLongPriceFocus.candidate)}.`,
    `- Turf rank-1 SP >20/1 CONTROL: ${longLine(report.turfLongPriceFocus.control)}.`,
    `- Turf rank-1 SP >20/1 MISMATCH_ZERO: ${longLine(report.turfLongPriceFocus.candidate)}.`,
    "",
    "## Decisions",
    "",
    `- Turf: ${report.decision.turf.classification}; ${report.decision.turf.recommendation}. ${report.decision.turf.rationale}`,
    `- Hurdle: ${report.decision.hurdle.classification}; ${report.decision.hurdle.recommendation}. ${report.decision.hurdle.rationale}`,
    `- Chase: ${report.decision.chase.classification}; ${report.decision.chase.recommendation}. ${report.decision.chase.rationale}`,
    "",
    "## Rank-Change Examples",
    "",
    "| Date | Course | Family | Control rank-1 | Candidate rank-1 | Control result | Candidate result | Features neutralised | Price context |",
    "|---|---|---|---|---|---|---|---|---|",
    ...report.examples.map((row) => `| ${row.date} | ${escapeCell(row.course)} | ${row.family} | ${escapeCell(row.controlRank1)} | ${escapeCell(row.candidateRank1)} | ${row.controlResult} | ${row.candidateResult} | ${row.featuresNeutralised.join(", ") || "none"} | control SP ${fmt(row.priceContext.controlSp, 2)} p ${pct(row.priceContext.controlProbability)}; candidate SP ${fmt(row.priceContext.candidateSp, 2)} p ${pct(row.priceContext.candidateProbability)} |`),
    "",
    "## Files",
    "",
    `- JSON: ${JSON_OUTPUT}`,
    `- Markdown: ${MD_OUTPUT}`,
    "",
  ].join("\n");
}

function printTerminalSummary(report: ReturnType<typeof buildReport>) {
  const turf = report.scopes.ALL_TURF;
  const hurdle = report.scopes.HURDLE;
  const chase = report.scopes.CHASE;
  console.log(`TURF CONTROL\n2026 LL: ${fmt(turf.control.logLoss)}\nBrier: ${fmt(turf.control.brier)}\nRank1: ${pct(turf.control.rank1Strike)}\nLong-price calibration: ${fmt(report.turfLongPriceFocus.control.calibration)}`);
  console.log(`\nTURF MISMATCH_ZERO\n2026 LL: ${fmt(turf.candidate.logLoss)}\nBrier: ${fmt(turf.candidate.brier)}\nRank1: ${pct(turf.candidate.rank1Strike)}\nLong-price calibration: ${fmt(report.turfLongPriceFocus.candidate.calibration)}\nRank1 changes: ${turf.rank1Changes}`);
  console.log(`\nHURDLE CONTROL\n2026 LL: ${fmt(hurdle.control.logLoss)}\nBrier: ${fmt(hurdle.control.brier)}\nRank1: ${pct(hurdle.control.rank1Strike)}\n>14/1 calibration: ${fmt(report.hurdleLongPriceFocus.control.calibration)}`);
  console.log(`\nHURDLE MISMATCH_ZERO\n2026 LL: ${fmt(hurdle.candidate.logLoss)}\nBrier: ${fmt(hurdle.candidate.brier)}\nRank1: ${pct(hurdle.candidate.rank1Strike)}\n>14/1 calibration: ${fmt(report.hurdleLongPriceFocus.candidate.calibration)}\nRank1 changes: ${hurdle.rank1Changes}`);
  console.log(`\nCHASE CONTROL\n2026 LL: ${fmt(chase.control.logLoss)}\nBrier: ${fmt(chase.control.brier)}\nRank1: ${pct(chase.control.rank1Strike)}`);
  console.log(`\nCHASE MISMATCH_ZERO\n2026 LL: ${fmt(chase.candidate.logLoss)}\nBrier: ${fmt(chase.candidate.brier)}\nRank1: ${pct(chase.candidate.rank1Strike)}`);
  console.log(`\nRecommendation:\nTurf: ${report.decision.turf.recommendation}\nHurdle: ${report.decision.hurdle.recommendation}\nChase: ${report.decision.chase.recommendation}`);
  console.log(`\nWrote ${MD_OUTPUT}\nWrote ${JSON_OUTPUT}`);
}

function ranks(probabilities: number[], ids: string[]) {
  const sorted = probabilities.map((value, index) => ({ value, id: ids[index]!, index })).sort((a, b) => b.value - a.value || a.id.localeCompare(b.id));
  const ranksByIndex = new Map(sorted.map((entry, position) => [entry.index, position + 1]));
  return probabilities.map((_, index) => ranksByIndex.get(index)!);
}

function jumpFamily(features: HistoricalPreRaceFeatureRow): Family | null {
  const subtype = classifyJumpRaceSubtype(features);
  if (subtype === "hurdle") return "HURDLE";
  if (subtype === "chase") return "CHASE";
  return null;
}

function numericClass(value: string | null) { const match = value?.match(/\d+/); return match ? Number(match[0]) : null; }
function resultLabel(runner: RunnerEval) { return runner.won ? "won" : `lost at SP ${fmt(runner.sp, 2)}`; }
function longLine(row: ReturnType<typeof rankOneSummary>) { return `${row.selections} selections, ${row.winners} winners, ${fmt(row.expectedWinners)} expected, calibration ${fmt(row.calibration)}`; }
function groupBy<T>(values: T[], key: (value: T) => string) { const map = new Map<string, T[]>(); for (const value of values) { const k = key(value); map.set(k, [...(map.get(k) ?? []), value]); } return map; }
function sum(values: number[]) { return values.reduce((total, value) => total + value, 0); }
function average(values: number[]) { return values.length ? sum(values) / values.length : 0; }
function ratio(numerator: number, denominator: number) { return denominator ? numerator / denominator : null; }
function fmt(value: number | null, digits = 4) { return value === null || !Number.isFinite(value) ? "-" : value.toFixed(digits); }
function pct(value: number | null) { return value === null || !Number.isFinite(value) ? "-" : `${(value * 100).toFixed(1)}%`; }
function signedPct(value: number) { return `${value >= 0 ? "+" : ""}${pct(value)}`; }
function escapeCell(value: string) { return value.replaceAll("|", "\\|").replaceAll("\n", " "); }

if (process.argv[1]?.endsWith("diagnose-tissue-comment-mismatch-ablation.ts")) await main();
