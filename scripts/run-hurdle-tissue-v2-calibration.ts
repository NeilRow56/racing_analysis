import { writeFile } from "node:fs/promises";
import { createDbConnection } from "@/db";
import { settleSelection } from "@/lib/racing/backtest";
import { loadBacktestFeatureCache } from "@/lib/racing/backtest-cache";
import type { HistoricalPreRaceFeatureRow, HistoricalTargetRunnerMetricsRow } from "@/lib/racing/historical-target-metrics";
import {
  applyCalibrationModel,
  fitHurdleCalibrationModels,
  HURDLE_TISSUE_V2_CALIBRATION,
  rankingChanged,
  type CalibrationModel,
  type RaceCalibrationInput,
} from "@/lib/racing/hurdle-tissue-calibration";
import { classifyJumpRaceSubtype } from "@/lib/racing/jump-speed-rating";
import { JUMP_TISSUE_MODEL_PATH, JUMP_TISSUE_VERSION, loadJumpTissueModel } from "@/lib/racing/jump-tissue-model";
import { classifyHandicapStatus } from "@/lib/racing/research-rule";
import { loadHistoricalComments, priorCommentsForTarget, raceSoftmax, score, commentVector, type HistoricalComment } from "./diagnose-independent-tissue-feasibility";

const OUTPUT = "/tmp/hurdle-tissue-v2-calibration";
const YEARS = ["2025", "2026"] as const;
type Year = typeof YEARS[number];

type RunnerEntry = {
  year: Year;
  raceId: string;
  runnerId: string;
  sp: number;
  won: boolean;
  rawProbability: number;
  rank: number;
};
type RaceEntry = {
  year: Year;
  raceId: string;
  runners: RunnerEntry[];
};
type EvaluatedRace = Omit<RaceEntry, "runners"> & {
  runners: Array<RunnerEntry & { probability: number }>;
};
type Evaluation = ReturnType<typeof evaluateCalibrator>;
type Report = {
  generatedAt: string;
  experiment: string;
  control: string;
  source: string;
  chronology: string;
  normalization: string;
  exclusions: string;
  population: { races: number; runners: number; developmentRaces: number; holdoutRaces: number };
  evaluations: Evaluation[];
  recommendation: string;
};

async function main() {
  const model = await loadJumpTissueModel(JUMP_TISSUE_MODEL_PATH);
  const caches = await Promise.all(YEARS.map((year) => loadBacktestFeatureCache({ from: `${year}-01-01`, to: `${year}-12-31`, family: "jump" })));
  if (caches.some((cache) => cache === null)) throw new Error("Missing compatible 2025/2026 jump backtest caches");

  const connection = createDbConnection();
  let comments: Map<string, HistoricalComment[]>;
  try {
    comments = await loadHistoricalComments(connection.client);
  } finally {
    await connection.client.end();
  }

  const races = buildHurdleRaces(caches.flatMap((cache) => cache!.rows), comments, model.model);
  const development = races.filter((race) => race.year === "2025");
  const holdout = races.filter((race) => race.year === "2026");
  const calibrators = fitHurdleCalibrationModels(development.map(toCalibrationInput));
  const evaluations = calibrators.map((calibrator) => evaluateCalibrator(calibrator, races));
  const report = {
    generatedAt: new Date().toISOString(),
    experiment: HURDLE_TISSUE_V2_CALIBRATION,
    control: JUMP_TISSUE_VERSION,
    model: { path: JUMP_TISSUE_MODEL_PATH, checksum: model.checksum },
    source: "Frozen Jump Tissue v1 over 2025/2026 jump backtest_feature caches; Hurdle races only; final SP used for diagnostics and long-price segmentation only.",
    chronology: "Calibration candidates are fitted on 2025 Hurdle outcomes and evaluated untouched on 2026 Hurdle outcomes.",
    normalization: "Each runner probability is transformed by a monotonic calibration mapping, then renormalized within the race so the field sums to 1. CONTROL is unchanged apart from numeric pass-through.",
    exclusions: "Chases, NH Flat, unknown Jump subtypes, incomplete fields, void/unresolved outcomes, and races without exactly one winner are excluded from this Hurdle-only experiment.",
    population: { races: races.length, runners: races.reduce((sum, race) => sum + race.runners.length, 0), developmentRaces: development.length, holdoutRaces: holdout.length },
    calibrators,
    evaluations,
    recommendation: recommendation(evaluations),
  };
  await writeFile(`${OUTPUT}.json`, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(`${OUTPUT}.md`, markdown(report), "utf8");
  printSummary(report);
}

function buildHurdleRaces(rows: HistoricalTargetRunnerMetricsRow[], commentsByHorse: Map<string, HistoricalComment[]>, model: Awaited<ReturnType<typeof loadJumpTissueModel>>["model"]): RaceEntry[] {
  const byRace = groupBy(rows.filter((row) => row.features.raceCode === "jump" && classifyJumpRaceSubtype(row.features) === "hurdle"), (row) => row.features.targetRaceId);
  const races: RaceEntry[] = [];
  for (const [raceId, raceRows] of byRace) {
    const active = raceRows.filter((row) => settleSelection({ ...row.outcome, startingPriceDecimal: "2" }) !== null);
    const settlements = active.map((row) => settleSelection(row.outcome));
    const expected = active[0]?.features.actualRunnerCount;
    if (
      active.length < 2 ||
      settlements.some((settlement) => settlement === null) ||
      expected == null ||
      (expected !== active.length && expected !== raceRows.length) ||
      active.filter((row) => row.outcome.won === true || row.outcome.finishingPosition === 1).length !== 1
    ) continue;
    const values = active.map((row) => [...numericVector(row.features), ...commentVector(priorCommentsForTarget(commentsByHorse.get(row.features.horseId) ?? [], row.features.raceDateTime))]);
    const probabilities = raceSoftmax(values.map((value) => score(model, value)));
    const ranked = active.map((row, index) => ({ row, probability: probabilities[index]! }))
      .sort((left, right) => right.probability - left.probability || left.row.features.targetRunnerId.localeCompare(right.row.features.targetRunnerId));
    const rankByRunner = new Map(ranked.map((entry, index) => [entry.row.features.targetRunnerId, index + 1]));
    races.push({
      year: active[0]!.features.raceDate.slice(0, 4) as Year,
      raceId,
      runners: active.map((row, index) => ({
        year: row.features.raceDate.slice(0, 4) as Year,
        raceId,
        runnerId: row.features.targetRunnerId,
        sp: settlements[index]!.settlementOddsDecimal,
        won: row.outcome.won === true || row.outcome.finishingPosition === 1,
        rawProbability: probabilities[index]!,
        rank: rankByRunner.get(row.features.targetRunnerId)!,
      })),
    });
  }
  return races;
}

function evaluateCalibrator(calibrator: CalibrationModel, races: RaceEntry[]) {
  const evaluated = races.map((race) => {
    const probabilities = applyCalibrationModel(calibrator, race.runners.map((runner) => runner.rawProbability));
    const rankCheck = rankingChanged(
      race.runners.map((runner) => ({ runnerId: runner.runnerId, probability: runner.rawProbability })),
      race.runners.map((runner, index) => ({ runnerId: runner.runnerId, probability: probabilities[index]! })),
    );
    return { ...race, rankCheck, runners: race.runners.map((runner, index) => ({ ...runner, probability: probabilities[index]! })) };
  });
  const changed = evaluated.filter((race) => !race.rankCheck.sameOrder);
  return {
    id: calibrator.id,
    label: calibrator.label,
    fitted: fittedSummary(calibrator),
    ranking: {
      changedRaces: changed.length,
      changedRankOneRaces: evaluated.filter((race) => !race.rankCheck.sameRankOne).length,
      firstChangedRace: changed[0] ? { raceId: changed[0].raceId, before: changed[0].rankCheck.beforeOrder, after: changed[0].rankCheck.afterOrder } : null,
    },
    periods: [
      { period: "2025 development", ...metrics(evaluated.filter((race) => race.year === "2025")) },
      { period: "2026 holdout", ...metrics(evaluated.filter((race) => race.year === "2026")) },
      { period: "combined", ...metrics(evaluated) },
    ],
    longPrice: [
      { period: "2025 development", ...longPrice(evaluated.filter((race) => race.year === "2025")) },
      { period: "2026 holdout", ...longPrice(evaluated.filter((race) => race.year === "2026")) },
      { period: "combined", ...longPrice(evaluated) },
    ],
  };
}

function metrics(races: EvaluatedRace[]) {
  const runners = races.flatMap((race) => race.runners);
  return {
    races: races.length,
    runners: runners.length,
    logLoss: mean(races.map((race) => -Math.log(Math.max(race.runners.filter((runner) => runner.won).reduce((sum, runner) => sum + runner.probability, 0), 1e-12)))),
    brier: mean(races.map((race) => race.runners.reduce((sum, runner) => sum + (runner.probability - (runner.won ? 1 : 0)) ** 2, 0))),
    calibrationError: calibrationError(runners),
    rank1Strike: capture(races, 1),
    top2Capture: capture(races, 2),
    top3Capture: capture(races, 3),
  };
}

function longPrice(races: EvaluatedRace[]) {
  const rows = races.flatMap((race) => race.runners).filter((runner) => runner.sp > 15);
  const predictedWinners = sum(rows.map((runner) => runner.probability));
  const actualWinners = rows.filter((runner) => runner.won).length;
  return {
    runners: rows.length,
    predictedWinners,
    actualWinners,
    calibrationRatio: predictedWinners === 0 ? null : actualWinners / predictedWinners,
    meanPredictedProbability: mean(rows.map((runner) => runner.probability)),
  };
}

function calibrationError(rows: Array<{ probability: number; won: boolean }>) {
  const bands = [[0, .05], [.05, .1], [.1, .15], [.15, .2], [.2, .3], [.3, 1.01]] as const;
  return sum(bands.map(([low, high]) => {
    const band = rows.filter((row) => row.probability >= low && row.probability < high);
    return band.length * Math.abs((mean(band.map((row) => row.probability)) ?? 0) - (mean(band.map((row) => row.won ? 1 : 0)) ?? 0));
  })) / Math.max(rows.length, 1);
}

function capture(races: EvaluatedRace[], rank: number) {
  return mean(races.map((race) => race.runners.some((runner) => runner.rank <= rank && runner.won) ? 1 : 0));
}

function toCalibrationInput(race: RaceEntry): RaceCalibrationInput {
  return { raceId: race.raceId, runners: race.runners.map((runner) => ({ runnerId: runner.runnerId, probability: runner.rawProbability, won: runner.won })) };
}

function numericVector(features: HistoricalPreRaceFeatureRow): number[] {
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

function recommendation(evaluations: ReturnType<typeof evaluateCalibrator>[]) {
  const control = evaluations.find((row) => row.id === "CONTROL")!;
  const candidates = evaluations.filter((row) => row.id !== "CONTROL" && row.ranking.changedRaces === 0);
  const controlHoldout = control.periods.find((row) => row.period === "2026 holdout")!;
  const improved = candidates.filter((row) => {
    const holdout = row.periods.find((period) => period.period === "2026 holdout")!;
    const long = row.longPrice.find((period) => period.period === "2026 holdout")!;
    return holdout.logLoss !== null && controlHoldout.logLoss !== null && holdout.logLoss <= controlHoldout.logLoss && (long.calibrationRatio ?? 0) > 0.75 && (long.calibrationRatio ?? 2) < 1.25;
  });
  return improved.length
    ? `Promote ${improved.sort((left, right) => (left.periods[1]!.logLoss ?? 99) - (right.periods[1]!.logLoss ?? 99))[0]!.id} to a monitored Hurdle Tissue 2 shadow branch; do not alter Chase Tissue.`
    : "No calibrator clears holdout probability quality and long-price calibration checks; keep Jump Tissue v1 as control and continue diagnostics.";
}

function fittedSummary(calibrator: CalibrationModel) {
  if (calibrator.id === "PLATT_LOGISTIC") return { intercept: calibrator.intercept, slope: calibrator.slope };
  if (calibrator.id === "POWER_GAMMA") return { gamma: calibrator.gamma };
  if (calibrator.id === "ISOTONIC") return { points: calibrator.points.length };
  return {};
}

function markdown(report: Report) {
  return [
    "# Hurdle Tissue 2 Calibration Experiment",
    "",
    `Experiment: **${report.experiment}**. Control: **${report.control}**.`,
    "",
    "## Method",
    report.source,
    report.chronology,
    report.normalization,
    report.exclusions,
    "",
    `Population: ${report.population.races} Hurdle races, ${report.population.runners} runners. Development races: ${report.population.developmentRaces}; holdout races: ${report.population.holdoutRaces}.`,
    "",
    "## Primary Evaluation",
    table(["Method", "Period", "Races", "Runners", "Log loss", "Brier", "Cal error", "Rank-1", "Top-2", "Top-3", "Rank changes"], report.evaluations.flatMap((row) => row.periods.map((period) => [
      row.id, period.period, period.races, period.runners, fmt(period.logLoss), fmt(period.brier), fmt(period.calibrationError), pct(period.rank1Strike), pct(period.top2Capture), pct(period.top3Capture), row.ranking.changedRaces,
    ]))),
    "## SP >14/1 Hurdle Calibration",
    table(["Method", "Period", "Runners", "Pred winners", "Actual", "Cal ratio", "Mean p"], report.evaluations.flatMap((row) => row.longPrice.map((period) => [
      row.id, period.period, period.runners, fmt(period.predictedWinners), period.actualWinners, fmt(period.calibrationRatio), pct(period.meanPredictedProbability),
    ]))),
    "## Rank Preservation",
    table(["Method", "Changed races", "Changed rank-1 races", "First changed race"], report.evaluations.map((row) => [row.id, row.ranking.changedRaces, row.ranking.changedRankOneRaces, row.ranking.firstChangedRace?.raceId ?? "-"])),
    "## Recommendation",
    report.recommendation,
    "",
  ].join("\n");
}

function printSummary(report: Report) {
  console.log(`Wrote ${OUTPUT}.md`);
  console.log(`Wrote ${OUTPUT}.json`);
  console.log(`Experiment: ${report.experiment}`);
  for (const row of report.evaluations) {
    const holdout = row.periods.find((period) => period.period === "2026 holdout")!;
    const long = row.longPrice.find((period) => period.period === "2026 holdout")!;
    console.log(`${row.id}: holdout LL=${fmt(holdout.logLoss)} Brier=${fmt(holdout.brier)} long cal=${fmt(long.calibrationRatio)} rank changes=${row.ranking.changedRaces}`);
  }
  console.log(report.recommendation);
}

function numericClass(value: string | null) { return Number(value?.match(/\d+/)?.[0] ?? NaN) || null; }
function sum(values: number[]) { return values.reduce((total, value) => total + value, 0); }
function mean(values: number[]) { return values.length ? sum(values) / values.length : null; }
function fmt(value: number | null | undefined) { return value === null || value === undefined || !Number.isFinite(value) ? "-" : value.toFixed(5); }
function pct(value: number | null | undefined) { return value === null || value === undefined || !Number.isFinite(value) ? "-" : `${(value * 100).toFixed(2)}%`; }
function groupBy<T, K>(values: T[], keyFor: (value: T) => K) {
  const groups = new Map<K, T[]>();
  for (const value of values) {
    const key = keyFor(value);
    const group = groups.get(key) ?? [];
    group.push(value);
    groups.set(key, group);
  }
  return groups;
}
function table(headers: string[], rows: Array<Array<string | number>>) {
  return [`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map((row) => `| ${row.join(" | ")} |`), ""].join("\n");
}

await main();
