import { readFile, writeFile } from "node:fs/promises";
import { createDbConnection } from "@/db";
import { loadBacktestFeatureCache } from "@/lib/racing/backtest-cache";
import type { HistoricalPreRaceFeatureRow, HistoricalTargetRunnerMetricsRow } from "@/lib/racing/historical-target-metrics";
import { isSupportedAllWeatherRace } from "@/lib/racing/aw-speed-rating";
import { awTissueModelInputs, awTissueProbabilities, loadAwTissueModel, type AwTissueModel } from "@/lib/racing/aw-tissue-model";
import { cleanAwTissueRace, loadAwTissueForward, summarizeAwTissueForward } from "@/lib/racing/aw-tissue-forward";
import { loadTissueForward, summarizeTissueForward, TISSUE_V2_CONFIG, type FrozenTissueModel, type TissueForwardData } from "@/lib/racing/tissue-forward";
import {
  NUMERIC_FEATURES,
  commentVector,
  priorCommentsForTarget,
  raceSoftmax,
  score,
  type HistoricalComment,
} from "./diagnose-independent-tissue-feasibility";

const MD_PATH = "/tmp/turf-tissue-on-aw-diagnostic.md";
const JSON_PATH = "/tmp/turf-tissue-on-aw-diagnostic.json";
const YEARS = ["2025", "2026"] as const;
const PERIODS = ["2025", "2026", "combined"] as const;
const EPSILON = 1e-12;

type Year = typeof YEARS[number];
type Period = typeof PERIODS[number];
type SystemKey = "turf_on_turf" | "turf_on_aw_literal" | "turf_on_aw_structural" | "aw_on_aw";
type ScoredRunner = {
  system: SystemKey;
  year: Year;
  row: HistoricalTargetRunnerMetricsRow;
  probability: number;
  rank: number;
  scoreable: boolean;
};
type RaceCoverage = {
  raceId: string;
  year: Year;
  active: number;
  scored: number;
  full: boolean;
};
type Evaluation = {
  key: SystemKey;
  label: string;
  rows: ScoredRunner[];
  coverage: RaceCoverage[];
};

type MarketMetrics = {
  selections: number;
  winners: number;
  strike: number | null;
  expectedWinners: number;
  ae: number | null;
  profitLoss: number;
  roi: number | null;
  averageSp: number | null;
  medianSp: number | null;
};

type ProbabilityMetrics = {
  races: number;
  runners: number;
  scoreableRunners: number;
  missingPct: number | null;
  fullRaceCoverage: number;
  partialRaceCoverage: number;
  logLoss: number | null;
  brier: number | null;
  calibrationRatio: number | null;
  rank1Strike: number | null;
  top2Capture: number | null;
  top3Capture: number | null;
};
type PositiveEdgeMetrics = ReturnType<typeof positiveEdgeMetrics>;
type PriceProfile = ReturnType<typeof priceProfile>;
type RobustnessMetrics = ReturnType<typeof robustness>[Period];
export type DiagnosticResult = {
  generatedAt: string;
  modelDefinitions: {
    turf: {
      path: string;
      version: string;
      checksum: string;
      trainedAt: string;
      trainingWindow: FrozenTissueModel["trainingWindow"];
      featureCount: number;
    };
    aw: {
      path: string;
      version: string;
      checksum: string;
      implementedAt: string;
      trainingPeriod: AwTissueModel["trainingPeriod"];
      featureCount: number;
    };
  };
  featureCompatibility: Array<{ feature: string; classification: string; note: string }>;
  metrics: Record<SystemKey, Record<Period, ProbabilityMetrics>>;
  market: Record<SystemKey, Record<Period, MarketMetrics>>;
  positiveEdge: Record<SystemKey, Record<Period, PositiveEdgeMetrics>>;
  calibrationBands: Record<SystemKey, Record<Period, ReturnType<typeof calibrationBands>>>;
  priceProfile: { turfTransferStructural: PriceProfile; awTissue: PriceProfile };
  context: ReturnType<typeof contextBreakdowns>;
  robustness: { turfTransferStructural: Record<Period, RobustnessMetrics>; awTissue: Record<Period, RobustnessMetrics> };
  awDisagreement: ReturnType<typeof awDisagreement>;
  prospective: {
    turf: ReturnType<typeof summarizeTissueForward>;
    aw: ReturnType<typeof summarizeAwTissueForward>;
    turfValue: ReturnType<typeof prospectiveValueTurf>;
    awValue: ReturnType<typeof prospectiveValueAw>;
  };
  transferClassification: string;
  tissue2Implication: string;
};

const turfFeatureAudit = [
  ["official_rating", "directly available on AW", "Official rating is a runner attribute."],
  ["latest_performance", "directly available on AW", "Weight-performance rating is not surface-named."],
  ["best_l3_performance", "directly available on AW", "Same performance series and last-three aggregation."],
  ["avg_l3_performance", "directly available on AW", "Same performance series and last-three aggregation."],
  ["latest_turf_speed", "available but surface-specific", "Literal transfer keeps prior Turf speed; structural transfer maps to latest AW speed."],
  ["best_l3_turf_speed", "available but surface-specific", "Literal transfer keeps prior Turf speed; structural transfer maps to best last-three AW speed."],
  ["avg_l3_turf_speed", "available but surface-specific", "Literal transfer keeps prior Turf speed; structural transfer maps to average last-three AW speed."],
  ["latest_todays_rating", "directly available on AW", "Same mathematical rating field in the cache."],
  ["best_l3_todays_rating", "directly available on AW", "Same mathematical rating field in the cache."],
  ["avg_l3_todays_rating", "directly available on AW", "Same mathematical rating field in the cache."],
  ["trainer_prior_rate", "same semantic meaning on AW", "Prior-only trainer strike rate."],
  ["log_trainer_prior_runs", "same semantic meaning on AW", "Prior-only trainer sample size transform."],
  ["jockey_prior_rate", "same semantic meaning on AW", "Prior-only jockey strike rate."],
  ["log_jockey_prior_runs", "same semantic meaning on AW", "Prior-only jockey sample size transform."],
  ["days_since_run", "same semantic meaning on AW", "Prior run recency."],
  ["log_prior_runs", "same semantic meaning on AW", "Horse prior-run count transform."],
  ["age", "directly available on AW", "Runner age."],
  ["weight_lbs", "directly available on AW", "Weight carried."],
  ["class", "directly available on AW", "Parsed race class."],
  ["distance_furlongs", "directly available on AW", "Distance yards divided by 220."],
  ["field_size", "directly available on AW", "Actual runner count where available, else declared count."],
  ["draw", "directly available on AW", "Stall draw."],
  ["draw_fraction", "same semantic meaning on AW", "Draw divided by field size."],
  ["handicap", "same semantic meaning on AW", "Race-name/type handicap flag."],
  ["going_soft", "available but surface-specific", "AW going/surface text is not Turf going; retained literally and usually false/missing."],
  ["going_firm", "available but surface-specific", "AW going/surface text is not Turf going; retained literally and usually false/missing."],
] as const;

async function main() {
  const [caches, turfModel, awModel, commentsByHorse, turfForward, awForward] = await Promise.all([
    loadCaches(),
    readJson<FrozenTissueModel>(TISSUE_V2_CONFIG.modelPath),
    loadAwTissueModel(),
    loadComments(),
    loadTissueForward(TISSUE_V2_CONFIG.forwardPath, TISSUE_V2_CONFIG),
    loadAwTissueForward(),
  ]);
  assertFrozenTurfModel(turfModel);

  const allRows = YEARS.flatMap((year) => caches[year].rows.map((row) => ({ year, row })));
  const awRows = allRows.filter(({ row }) => eligible(row, "aw"));
  const priorAwStarts = await loadPriorAwStarts(awRows);
  const evaluations: Evaluation[] = [
    evaluateTurfModel("turf_on_turf", "Turf Tissue on Turf", allRows.filter(({ row }) => eligible(row, "turf")), turfModel, commentsByHorse, "native"),
    evaluateTurfModel("turf_on_aw_literal", "Turf Tissue on AW transfer-literal", awRows, turfModel, commentsByHorse, "literal"),
    evaluateTurfModel("turf_on_aw_structural", "Turf Tissue on AW transfer-structural", awRows, turfModel, commentsByHorse, "structural"),
    evaluateAwModel(awRows, awModel, priorAwStarts),
  ];

  const primaryTransfer = evaluations.find((item) => item.key === "turf_on_aw_structural")!;
  const dedicatedAw = evaluations.find((item) => item.key === "aw_on_aw")!;
  const turfBase = evaluations.find((item) => item.key === "turf_on_turf")!;
  const disagreement = awDisagreement(primaryTransfer, dedicatedAw);
  const classification = classifyTransfer(primaryTransfer, dedicatedAw, turfBase);
  const implication = implicationForTissue2(classification, primaryTransfer, dedicatedAw);
  const prospective = {
    turf: summarizeTissueForward(turfForward),
    aw: summarizeAwTissueForward(awForward),
    turfValue: prospectiveValueTurf(turfForward),
    awValue: prospectiveValueAw(awForward),
  };

  const result: DiagnosticResult = {
    generatedAt: new Date().toISOString(),
    modelDefinitions: {
      turf: {
        path: TISSUE_V2_CONFIG.modelPath,
        version: turfModel.version,
        checksum: turfModel.checksum,
        trainedAt: turfModel.trainedAt,
        trainingWindow: turfModel.trainingWindow,
        featureCount: turfModel.model.names.length,
      },
      aw: {
        path: "data/research/aw-tissue-model-v1.json",
        version: awModel.version,
        checksum: awModel.checksum,
        implementedAt: awModel.implementedAt,
        trainingPeriod: awModel.trainingPeriod,
        featureCount: awModel.model.names.length,
      },
    },
    featureCompatibility: turfFeatureAudit.map(([feature, classification, note]) => ({ feature, classification, note })),
    metrics: systemRecord(evaluations, periodMetrics),
    market: systemRecord(evaluations, periodMarket),
    positiveEdge: systemRecord(evaluations, periodPositiveEdge),
    calibrationBands: systemRecord(evaluations, periodCalibrationBands),
    priceProfile: {
      turfTransferStructural: priceProfile(rankOnes(periodRows(primaryTransfer, "combined"))),
      awTissue: priceProfile(rankOnes(periodRows(dedicatedAw, "combined"))),
    },
    context: contextBreakdowns(primaryTransfer, dedicatedAw),
    robustness: {
      turfTransferStructural: robustness(primaryTransfer) as Record<Period, RobustnessMetrics>,
      awTissue: robustness(dedicatedAw) as Record<Period, RobustnessMetrics>,
    },
    awDisagreement: disagreement,
    prospective,
    transferClassification: classification,
    tissue2Implication: implication,
  };

  await Promise.all([
    writeFile(JSON_PATH, `${JSON.stringify(result, null, 2)}\n`, "utf8"),
    writeFile(MD_PATH, renderMarkdown(result, evaluations), "utf8"),
  ]);
  printTerminal(result, evaluations);
}

async function loadCaches() {
  const entries = await Promise.all(YEARS.map(async (year) => {
    const [turf, aw] = await Promise.all([
      loadBacktestFeatureCache({ from: `${year}-01-01`, to: `${year}-12-31`, family: "turf_flat" }),
      loadBacktestFeatureCache({ from: `${year}-01-01`, to: `${year}-12-31`, family: "all_weather_flat" }),
    ]);
    if (!turf || !aw) throw new Error(`Missing compatible v4 family caches for ${year}`);
    return [year, { rows: [...turf.rows, ...aw.rows] }] as const;
  }));
  return Object.fromEntries(entries) as unknown as Record<Year, { rows: HistoricalTargetRunnerMetricsRow[] }>;
}

async function loadComments() {
  const connection = createDbConnection();
  try {
    const rows = await connection.client<Array<{ horseId: string; raceId: string; raceDate: string; raceDateTime: Date; comment: string }>>`
      select rr.horse_id as "horseId", r.id as "raceId", r.race_date::text as "raceDate",
             r.race_datetime as "raceDateTime", rr.runner_comment as comment
      from race_runners rr join races r on r.id = rr.race_id
      where r.source = 'sporting_life' and rr.runner_comment is not null
        and btrim(rr.runner_comment) <> '' and r.race_datetime < '2027-01-01'
        and coalesce(rr.result_status, '') <> 'non_runner'
      order by rr.horse_id, r.race_datetime
    `;
    const grouped = new Map<string, HistoricalComment[]>();
    for (const row of rows) grouped.set(row.horseId, [...(grouped.get(row.horseId) ?? []), { ...row, raceDateTime: new Date(row.raceDateTime) }]);
    return grouped;
  } finally {
    await connection.client.end();
  }
}

async function loadPriorAwStarts(targets: Array<{ year: Year; row: HistoricalTargetRunnerMetricsRow }>) {
  if (!targets.length) return new Map<string, number>();
  const connection = createDbConnection();
  try {
    const payload = JSON.stringify(targets.map(({ row }) => ({
      runner_id: row.features.targetRunnerId,
      horse_id: row.features.horseId,
      cutoff: row.features.raceDateTime.toISOString(),
    })));
    const result = await connection.client<Array<{ runnerId: string; raceName: string | null; raceType: string | null; courseName: string; going: string | null; surface: string | null }>>`
      with targets as (select * from jsonb_to_recordset(${payload}::jsonb) as t(runner_id uuid, horse_id uuid, cutoff timestamptz))
      select t.runner_id as "runnerId", r.race_name as "raceName", r.race_type as "raceType", c.display_name as "courseName", r.going,
        si.payload #>> '{props,pageProps,race,race_summary,course_surface,surface}' as surface
      from targets t join race_runners rr on rr.horse_id = t.horse_id
      join races r on r.id = rr.race_id and r.race_datetime < t.cutoff
      join courses c on c.id = r.course_id
      left join source_imports si on si.source = r.source and si.source_id = r.source_id and si.source_type = 'full-result-next-data'
      where r.source = 'sporting_life' and rr.source = 'sporting_life'
        and (rr.result_status is not null or rr.finishing_position is not null)
        and lower(coalesce(rr.result_status, '')) not in ('non_runner','abandoned','cancelled','canceled','no_race','race_void','void','void_race')
    `;
    const counts = new Map(targets.map(({ row }) => [row.features.targetRunnerId, 0]));
    for (const row of result) if (isSupportedAllWeatherRace(row)) counts.set(row.runnerId, counts.get(row.runnerId)! + 1);
    return counts;
  } finally {
    await connection.client.end();
  }
}

function assertFrozenTurfModel(model: FrozenTissueModel) {
  if (model.version !== TISSUE_V2_CONFIG.modelVersion || model.checksum !== "d10c97e7de7e663d086f32e5764526b481520c7e0b6e56b7376ebcf1a6b99b61") {
    throw new Error("Unexpected Turf Tissue v2 artifact");
  }
}

function evaluateTurfModel(
  key: SystemKey,
  label: string,
  targets: Array<{ year: Year; row: HistoricalTargetRunnerMetricsRow }>,
  model: FrozenTissueModel,
  commentsByHorse: Map<string, HistoricalComment[]>,
  mode: "native" | "literal" | "structural",
): Evaluation {
  const rows: ScoredRunner[] = [];
  const coverage: RaceCoverage[] = [];
  for (const [raceId, raceRows] of groupBy(targets, ({ row }) => row.features.targetRaceId)) {
    const scores = raceRows.map(({ year, row }) => {
      const priors = priorCommentsForTarget(commentsByHorse.get(row.features.horseId) ?? [], row.features.raceDateTime);
      const values = [...turfNumericVector(row.features, mode), ...commentVector(priors)];
      return { year, row, score: score(model.model, values) };
    });
    const probabilities = raceSoftmax(scores.map((entry) => entry.score));
    const ranks = ranksDescending(probabilities);
    coverage.push({ raceId, year: raceRows[0]!.year, active: raceRows.length, scored: raceRows.length, full: true });
    scores.forEach((entry, index) => rows.push({ system: key, year: entry.year, row: entry.row, probability: probabilities[index]!, rank: ranks[index]!, scoreable: true }));
  }
  return { key, label, rows, coverage };
}

function evaluateAwModel(targets: Array<{ year: Year; row: HistoricalTargetRunnerMetricsRow }>, model: AwTissueModel, priorAwStarts: ReadonlyMap<string, number>): Evaluation {
  const rows: ScoredRunner[] = [];
  const coverage: RaceCoverage[] = [];
  for (const [raceId, raceRows] of groupBy(targets, ({ row }) => row.features.targetRaceId)) {
    const inputs = raceRows.map(({ row }) => awRawInputs(row.features, priorAwStarts.get(row.features.targetRunnerId) ?? null));
    const scoreable = inputs.map((raw) => raw !== null);
    coverage.push({ raceId, year: raceRows[0]!.year, active: raceRows.length, scored: scoreable.filter(Boolean).length, full: scoreable.every(Boolean) });
    if (!scoreable.every(Boolean) || raceRows.length < 2) continue;
    const probabilities = awTissueProbabilities(inputs.map((raw) => awTissueModelInputs(raw!, model)), model);
    const ranks = ranksDescending(probabilities);
    raceRows.forEach((entry, index) => rows.push({ system: "aw_on_aw", year: entry.year, row: entry.row, probability: probabilities[index]!, rank: ranks[index]!, scoreable: true }));
  }
  return { key: "aw_on_aw", label: "AW Tissue on AW", rows, coverage };
}

function turfNumericVector(features: HistoricalPreRaceFeatureRow, mode: "native" | "literal" | "structural") {
  const values = NUMERIC_FEATURES.map(([name, get]) => {
    if (mode === "structural") {
      if (name === "latest_turf_speed") return features.latestAwSpeedRating;
      if (name === "best_l3_turf_speed") return features.bestAwSpeedLast3;
      if (name === "avg_l3_turf_speed") return features.averageAwSpeedLast3;
    }
    return get(features);
  });
  return [...values.map((value) => value ?? 0), ...values.map((value) => value === null || !Number.isFinite(value) ? 1 : 0)];
}

function awRawInputs(features: HistoricalPreRaceFeatureRow, priorAwStarts: number | null): Array<number | null> | null {
  if (priorAwStarts === null) return null;
  const values = [
    features.averageAwSpeedLast3,
    features.trainerPriorWinRate,
    features.jockeyPriorWinRate ?? null,
    features.declaredRunnerCount,
    numericClass(features.raceClass),
    features.distanceYards === null ? null : features.distanceYards / 220,
    /handicap/i.test(`${features.raceName ?? ""} ${features.raceType ?? ""}`) ? 1 : 0,
    features.latestAwSpeedRating,
    features.bestAwSpeedLast3,
    features.averagePerformanceLast3,
    features.latestPerformanceRating,
    features.officialRating,
    priorAwStarts,
    features.horseAge,
    features.draw,
    features.daysSinceLastRun,
  ];
  return values.map((value) => typeof value === "number" && Number.isFinite(value) ? value : null);
}

function eligible(row: HistoricalTargetRunnerMetricsRow, raceCode: "turf" | "aw") {
  return row.features.raceCode === raceCode &&
    row.outcome.resultStatus !== "non_runner" &&
    row.outcome.won !== null &&
    groupSettlementValid(row);
}

function groupSettlementValid(row: HistoricalTargetRunnerMetricsRow) {
  return row.outcome.finishingPosition !== null || row.outcome.won === true || row.outcome.won === false;
}

function periodMetrics(evaluation: Evaluation) {
  return periodRecord((period) => probabilityMetrics(evaluation, period));
}

function probabilityMetrics(evaluation: Evaluation, period: Period): ProbabilityMetrics {
  const rows = periodRows(evaluation, period);
  const coverage = periodCoverage(evaluation, period);
  const raceGroups = [...groupBy(rows, (row) => row.row.features.targetRaceId).values()];
  const fullRaceGroups = raceGroups.filter((group) => group.length >= 2 && group.every((runner) => runner.row.outcome.won !== null));
  const captures = (n: number) => mean(fullRaceGroups.map((group) => group.some((runner) => runner.rank <= n && runner.row.outcome.won === true) ? 1 : 0));
  const probabilityRaces = fullRaceGroups.filter((group) => group.some((runner) => runner.row.outcome.won === true));
  const logLoss = mean(probabilityRaces.map((group) => -Math.log(Math.max(group.filter((runner) => runner.row.outcome.won === true).reduce((sum, runner) => sum + runner.probability, 0), EPSILON))));
  const brier = mean(probabilityRaces.map((group) => group.reduce((sum, runner) => sum + (runner.probability - (runner.row.outcome.won === true ? 1 / Math.max(group.filter((r) => r.row.outcome.won === true).length, 1) : 0)) ** 2, 0)));
  const predictedWinners = sum(rows.map((runner) => runner.probability));
  const actualWinners = rows.filter((runner) => runner.row.outcome.won === true).length;
  const active = coverage.reduce((total, item) => total + item.active, 0);
  const scored = coverage.reduce((total, item) => total + item.scored, 0);
  return {
    races: coverage.length,
    runners: active,
    scoreableRunners: scored,
    missingPct: active ? 1 - scored / active : null,
    fullRaceCoverage: coverage.filter((item) => item.full).length,
    partialRaceCoverage: coverage.filter((item) => item.scored > 0 && !item.full).length,
    logLoss,
    brier,
    calibrationRatio: predictedWinners ? actualWinners / predictedWinners : null,
    rank1Strike: captures(1),
    top2Capture: captures(2),
    top3Capture: captures(3),
  };
}

function periodMarket(evaluation: Evaluation) {
  return periodRecord((period) => marketMetrics(rankOnes(periodRows(evaluation, period))));
}

function marketMetrics(selections: ScoredRunner[]): MarketMetrics {
  const priced = selections.filter((runner) => sp(runner) !== null);
  const winners = priced.filter((runner) => runner.row.outcome.won === true);
  const expectedWinners = sum(priced.map((runner) => 1 / sp(runner)!));
  const profitLoss = sum(priced.map((runner) => runner.row.outcome.won === true ? (sp(runner)! - 1) / (runner.row.outcome.deadHeatDivisor ?? 1) : -1));
  return {
    selections: priced.length,
    winners: winners.length,
    strike: divide(winners.length, priced.length),
    expectedWinners,
    ae: divide(winners.length, expectedWinners),
    profitLoss,
    roi: divide(profitLoss, priced.length),
    averageSp: mean(priced.map((runner) => sp(runner)!)),
    medianSp: median(priced.map((runner) => sp(runner)!)),
  };
}

function periodPositiveEdge(evaluation: Evaluation) {
  return periodRecord((period) => positiveEdgeMetrics(rankOnes(periodRows(evaluation, period))));
}

function positiveEdgeMetrics(selections: ScoredRunner[]) {
  const qualifying = selections.filter((runner) => {
    const price = sp(runner);
    return price !== null && runner.probability - 1 / price > 0;
  });
  const winners = qualifying.filter((runner) => runner.row.outcome.won === true).length;
  const qualifyingExpectedWinners = sum(qualifying.map((runner) => runner.probability));
  const marketExpectedWinners = sum(qualifying.map((runner) => 1 / sp(runner)!));
  const profitLoss = sum(qualifying.map((runner) => runner.row.outcome.won === true ? (sp(runner)! - 1) / (runner.row.outcome.deadHeatDivisor ?? 1) : -1));
  return {
    selections: qualifying.length,
    winners,
    qualifyingExpectedWinners,
    marketExpectedWinners,
    ae: divide(winners, marketExpectedWinners),
    roi: divide(profitLoss, qualifying.length),
  };
}

function periodCalibrationBands(evaluation: Evaluation) {
  return periodRecord((period) => calibrationBands(periodRows(evaluation, period)));
}

function calibrationBands(rows: ScoredRunner[]) {
  const bands: Array<[string, number, number]> = [["0-5%", 0, .05], ["5-10%", .05, .10], ["10-20%", .10, .20], ["20-30%", .20, .30], ["30-50%", .30, .50], ["50%+", .50, 1.01]];
  return bands.map(([band, low, high]) => {
    const group = rows.filter((runner) => runner.probability >= low && runner.probability < high);
    const predictedWinners = sum(group.map((runner) => runner.probability));
    const actualWinners = group.filter((runner) => runner.row.outcome.won === true).length;
    return { band, runners: group.length, predictedWinners, actualWinners, calibrationRatio: divide(actualWinners, predictedWinners) };
  });
}

function awDisagreement(turf: Evaluation, aw: Evaluation) {
  const turfByRace = leadersByRace(turf);
  const awByRace = leadersByRace(aw);
  const common = [...turfByRace].filter(([raceId]) => awByRace.has(raceId));
  const rows = common.map(([raceId, turfLeader]) => ({ raceId, turfLeader, awLeader: awByRace.get(raceId)! }));
  const different = rows.filter((row) => row.turfLeader.row.features.targetRunnerId !== row.awLeader.row.features.targetRunnerId);
  const wins = (runner: ScoredRunner) => runner.row.outcome.won === true;
  return {
    comparableRaces: rows.length,
    sameLeader: rows.length - different.length,
    differentLeader: different.length,
    turfTransferWins: different.filter((row) => wins(row.turfLeader)).length,
    awTissueWins: different.filter((row) => wins(row.awLeader)).length,
    neitherWins: different.filter((row) => !wins(row.turfLeader) && !wins(row.awLeader)).length,
    turfSpExpectedWinners: sum(different.map((row) => sp(row.turfLeader) === null ? 0 : 1 / sp(row.turfLeader)!)),
    awSpExpectedWinners: sum(different.map((row) => sp(row.awLeader) === null ? 0 : 1 / sp(row.awLeader)!)),
  };
}

function priceProfile(selections: ScoredRunner[]) {
  const prices = selections.map(sp).filter(isNumber);
  return {
    selections: prices.length,
    medianSp: median(prices),
    averageSp: mean(prices),
    under4To1: divide(prices.filter((price) => price < 5).length, prices.length),
    from4ToUnder8To1: divide(prices.filter((price) => price >= 5 && price < 9).length, prices.length),
    from8ToUnder16To1: divide(prices.filter((price) => price >= 9 && price < 17).length, prices.length),
    over16To1: divide(prices.filter((price) => price >= 17).length, prices.length),
  };
}

function contextBreakdowns(turf: Evaluation, aw: Evaluation) {
  const breakdown = (evaluation: Evaluation, keyFor: (runner: ScoredRunner) => string) => Object.fromEntries(
    [...groupBy(rankOnes(periodRows(evaluation, "combined")), keyFor)].map(([key, rows]) => [key, marketMetrics(rows)]),
  );
  return {
    turfTransferStructural: {
      distance: breakdown(turf, (runner) => distanceBand(runner.row.features.distanceYards)),
      handicap: breakdown(turf, (runner) => /handicap/i.test(`${runner.row.features.raceName ?? ""} ${runner.row.features.raceType ?? ""}`) ? "handicap" : "non-handicap"),
      fieldSize: breakdown(turf, (runner) => fieldBand(runner.row.features.actualRunnerCount ?? runner.row.features.declaredRunnerCount)),
      course: courseBreakdown(turf),
    },
    awTissue: {
      distance: breakdown(aw, (runner) => distanceBand(runner.row.features.distanceYards)),
      handicap: breakdown(aw, (runner) => /handicap/i.test(`${runner.row.features.raceName ?? ""} ${runner.row.features.raceType ?? ""}`) ? "handicap" : "non-handicap"),
      fieldSize: breakdown(aw, (runner) => fieldBand(runner.row.features.actualRunnerCount ?? runner.row.features.declaredRunnerCount)),
      course: courseBreakdown(aw),
    },
  };
}

function courseBreakdown(evaluation: Evaluation) {
  const grouped = [...groupBy(rankOnes(periodRows(evaluation, "combined")), (runner) => runner.row.features.courseName)];
  return Object.fromEntries(grouped.filter(([, rows]) => rows.length >= 30).map(([course, rows]) => [course, marketMetrics(rows)]));
}

function robustness(evaluation: Evaluation) {
  return Object.fromEntries(PERIODS.map((period) => {
    const selections = rankOnes(periodRows(evaluation, period)).filter((runner) => sp(runner) !== null);
    const winners = selections.filter((runner) => runner.row.outcome.won === true).sort((a, b) => sp(b)! - sp(a)!);
    return [period, {
      sampleSize: selections.length,
      largestWinnerContribution: winners[0] ? sp(winners[0])! - 1 : null,
      roi: marketMetrics(selections).roi,
      roiExLargestWinner: marketMetrics(excludeWinnerIndexes(selections, winners.slice(0, 1))).roi,
      roiExTop3Winners: marketMetrics(excludeWinnerIndexes(selections, winners.slice(0, 3))).roi,
    }];
  }));
}

function prospectiveValueTurf(data: TissueForwardData) {
  const settled = data.races.filter((race) => race.recordedPreRace === true && race.winners.length > 0);
  const rankOnes = settled.flatMap((race) => race.runners.filter((runner) => runner.tissueRank === 1).map((runner) => ({ race, runner })));
  const positive = rankOnes.filter(({ runner }) => runner.finalSp && runner.probability - (runner.marketImpliedProbability ?? 0) > 0);
  return {
    settledComparable: rankOnes.length,
    positiveSelections: positive.length,
    winners: positive.filter(({ race, runner }) => race.winners.includes(runner.horseName)).length,
    tissueExpectedWinners: sum(positive.map(({ runner }) => runner.probability)),
    marketExpectedWinners: sum(positive.map(({ runner }) => runner.marketImpliedProbability ?? 0)),
    roi: divide(sum(positive.map(({ race, runner }) => race.winners.includes(runner.horseName) ? (runner.finalSp ?? 0) - 1 : -1)), positive.length),
  };
}

function prospectiveValueAw(data: Awaited<ReturnType<typeof loadAwTissueForward>>) {
  const settled = data.races.filter((race) => cleanAwTissueRace(race) && race.settledAt !== null);
  const positive = settled.flatMap((race) => {
    const runner = race.runners.find((item) => item.runnerId === race.top1);
    const price = race.prices.t60 ?? race.prices.t180 ?? race.prices.early;
    if (!runner?.probability || !price || runner.probability - price.impliedProbability <= 0) return [];
    return [{ race, runner, price }];
  });
  return {
    settledComparable: settled.length,
    positiveSelections: positive.length,
    winners: positive.filter(({ runner }) => runner.outcome?.won === true).length,
    tissueExpectedWinners: sum(positive.map(({ runner }) => runner.probability!)),
    marketExpectedWinners: sum(positive.map(({ price }) => price.impliedProbability)),
    roi: divide(sum(positive.map(({ race }) => race.selectedPriceProfitLoss.finalSp ?? 0)), positive.length),
  };
}

function classifyTransfer(transfer: Evaluation, aw: Evaluation, turf: Evaluation) {
  const combined = probabilityMetrics(transfer, "combined");
  const awCombined = probabilityMetrics(aw, "combined");
  const market = marketMetrics(rankOnes(periodRows(transfer, "combined")));
  const m2025 = marketMetrics(rankOnes(periodRows(transfer, "2025")));
  const m2026 = marketMetrics(rankOnes(periodRows(transfer, "2026")));
  const calibrationOk = combined.calibrationRatio !== null && combined.calibrationRatio >= 0.9 && combined.calibrationRatio <= 1.1;
  const comparableAw = awCombined.logLoss !== null && combined.logLoss !== null && combined.logLoss <= awCombined.logLoss * 1.03;
  const consistent = (m2025.ae ?? 0) >= 0.9 && (m2026.ae ?? 0) >= 0.9;
  const useful = (market.ae ?? 0) >= 0.95 && (combined.rank1Strike ?? 0) > 0 && (combined.top3Capture ?? 0) >= 0.45;
  const turfM = probabilityMetrics(turf, "combined");
  if (!useful || !calibrationOk) return "FAILS TO TRANSFER";
  if (!consistent) return "WEAK / UNSTABLE TRANSFER";
  if (comparableAw && combined.logLoss !== null && turfM.logLoss !== null && combined.logLoss <= turfM.logLoss * 1.15) return "STRONG TRANSFERABILITY";
  return "MODEST TRANSFERABILITY";
}

function implicationForTissue2(classification: string, transfer: Evaluation, aw: Evaluation) {
  const transferM = probabilityMetrics(transfer, "combined");
  const awM = probabilityMetrics(aw, "combined");
  if (classification === "STRONG TRANSFERABILITY" && transferM.logLoss !== null && awM.logLoss !== null && transferM.logLoss <= awM.logLoss) return "1. Turf Tissue as the common base";
  if (classification === "FAILS TO TRANSFER") return "2. separate surface-specific models";
  return "3. common base plus small surface adjustment";
}

function renderMarkdown(result: DiagnosticResult, evaluations: Evaluation[]) {
  const lines: string[] = [];
  lines.push("# Turf Tissue on AW Diagnostic", "");
  lines.push("Research-only cross-surface diagnostic. No frozen artifacts, trackers, VALUE semantics, racecards, settlement records, or model coefficients were modified.", "");
  lines.push("## Executive Summary", "");
  lines.push(`- Primary transfer classification: **${result.transferClassification}**.`);
  lines.push(`- Tissue 2 implication: **${result.tissue2Implication}**.`);
  lines.push("- TRANSFER-LITERAL keeps Turf speed-history inputs on AW runners where present. TRANSFER-STRUCTURAL uses the same frozen Turf coefficients but maps the three explicitly Turf-speed inputs to their AW-speed equivalents.");
  lines.push("- Positive-edge historical rows use the existing positive edge sign convention with final SP as the only historical market price available in the cache; no threshold was tuned.", "");
  lines.push("## Frozen Model Definitions", "");
  lines.push(`- Turf Tissue: \`${result.modelDefinitions.turf.version}\`, checksum \`${result.modelDefinitions.turf.checksum}\`, trained ${result.modelDefinitions.turf.trainedAt}.`);
  lines.push(`- AW Tissue: \`${result.modelDefinitions.aw.version}\`, checksum \`${result.modelDefinitions.aw.checksum}\`, implemented ${result.modelDefinitions.aw.implementedAt}.`, "");
  lines.push("## Feature Compatibility", "");
  table(lines, result.featureCompatibility);
  for (const evaluation of evaluations) {
    lines.push(`## ${evaluation.label}`, "");
    table(lines, PERIODS.map((period) => ({ period, ...metricColumns(result.metrics[evaluation.key][period]), ...marketColumns(result.market[evaluation.key][period]) })));
  }
  lines.push("## Probability Performance", "");
  table(lines, evaluations.flatMap((evaluation) => PERIODS.map((period) => ({ system: evaluation.label, period, ...metricColumns(result.metrics[evaluation.key][period]) }))));
  lines.push("## Market-Adjusted Performance", "");
  table(lines, evaluations.flatMap((evaluation) => PERIODS.map((period) => ({ system: evaluation.label, period, ...marketColumns(result.market[evaluation.key][period]) }))));
  lines.push("## Positive-Edge Performance", "");
  table(lines, evaluations.flatMap((evaluation) => PERIODS.map((period) => ({ system: evaluation.label, period, ...positiveColumns(result.positiveEdge[evaluation.key][period]) }))));
  lines.push("## Calibration", "");
  for (const evaluation of evaluations) {
    lines.push(`### ${evaluation.label}`, "");
    table(lines, result.calibrationBands[evaluation.key].combined);
  }
  lines.push("## AW Rank Disagreement", "");
  table(lines, [result.awDisagreement]);
  lines.push("## Price Profile", "");
  table(lines, [
    { system: "Turf Tissue AW structural", ...priceColumns(result.priceProfile.turfTransferStructural) },
    { system: "AW Tissue", ...priceColumns(result.priceProfile.awTissue) },
  ]);
  lines.push("## Robustness", "");
  table(lines, PERIODS.map((period) => ({ system: "Turf Tissue AW structural", period, ...robustColumns(result.robustness.turfTransferStructural[period]) })));
  table(lines, PERIODS.map((period) => ({ system: "AW Tissue", period, ...robustColumns(result.robustness.awTissue[period]) })));
  lines.push("## Existing Prospective Tissue Context", "");
  lines.push(`- Turf Tissue v2 tracker: tracked ${result.prospective.turf.racesTracked}, settled ${result.prospective.turf.settled}, top-1 ${pct(result.prospective.turf.top1)}, Tissue VALUE proxy selections ${result.prospective.turfValue.positiveSelections}, winners ${result.prospective.turfValue.winners}, ROI ${pct(result.prospective.turfValue.roi)}.`);
  lines.push(`- AW Tissue tracker: tracked ${result.prospective.aw.racesTracked}, settled ${result.prospective.aw.settled}, top-1 ${pct(result.prospective.aw.top1)}, positive-edge selections ${result.prospective.awValue.positiveSelections}, winners ${result.prospective.awValue.winners}, ROI ${pct(result.prospective.awValue.roi)}.`, "");
  lines.push("## Transfer Classification", "", result.transferClassification, "");
  lines.push("## Tissue 2 Implications", "", result.tissue2Implication, "");
  lines.push("## Interpretation", "");
  lines.push(`A. Useful predictive power on AW: ${answerUseful(result)}.`);
  lines.push(`B. Outperforms AW Tissue: ${answerOutperforms(result)}.`);
  lines.push(`C. Remains calibrated: ${answerCalibrated(result)}.`);
  lines.push(`D. Same horses as AW Tissue: ${result.awDisagreement.sameLeader}/${result.awDisagreement.comparableRaces} same leaders; disagreement is material when same-leader rate is low.`);
  lines.push("E. Surface-specific speed features: literal and structural transfer are reported separately; the delta between them is the direct speed-feature sensitivity check.");
  lines.push(`F. Core structure generalisable: ${result.transferClassification === "FAILS TO TRANSFER" ? "not sufficiently on this evidence" : "yes, with caveats from AW comparison and robustness"}.`);
  lines.push(`G. Start Tissue 2 from: ${result.tissue2Implication}.`, "");
  return `${lines.join("\n")}\n`;
}

function printTerminal(result: DiagnosticResult, evaluations: Evaluation[]) {
  const show = (key: SystemKey) => {
    const label = evaluations.find((evaluation) => evaluation.key === key)!.label.toUpperCase();
    const m25 = result.metrics[key]["2025"], m26 = result.metrics[key]["2026"], mc = result.metrics[key].combined, market = result.market[key].combined;
    console.log(label);
    console.log(`2025: races=${m25.races} runners=${m25.runners} A/E=${num(result.market[key]["2025"].ae)}`);
    console.log(`2026: races=${m26.races} runners=${m26.runners} A/E=${num(result.market[key]["2026"].ae)}`);
    console.log(`Log loss: ${num(mc.logLoss)}`);
    console.log(`Brier: ${num(mc.brier)}`);
    console.log(`Rank1 strike: ${pct(mc.rank1Strike)}`);
    console.log(`A/E: ${num(market.ae)}`);
    console.log("");
  };
  show("turf_on_turf");
  show("turf_on_aw_structural");
  show("aw_on_aw");
  console.log("AW disagreement:");
  console.log(`Same leader: ${result.awDisagreement.sameLeader}`);
  console.log(`Different leader: ${result.awDisagreement.differentLeader}`);
  console.log(`Turf-transfer wins: ${result.awDisagreement.turfTransferWins}`);
  console.log(`AW-Tissue wins: ${result.awDisagreement.awTissueWins}`);
  console.log(`Neither: ${result.awDisagreement.neitherWins}`);
  console.log("");
  console.log("Existing Turf Tissue prospective:");
  console.log(`Tracked: ${result.prospective.turf.racesTracked}`);
  console.log(`Settled: ${result.prospective.turf.settled}`);
  console.log(`Winners: ${Math.round((result.prospective.turf.top1 ?? 0) * result.prospective.turf.settled)}`);
  console.log(`Tissue expected: ${num(result.prospective.turfValue.tissueExpectedWinners)}`);
  console.log(`Market expected: ${num(result.prospective.turfValue.marketExpectedWinners)}`);
  console.log(`ROI: ${pct(result.prospective.turfValue.roi)}`);
  console.log("");
  console.log(`Transfer classification: ${result.transferClassification}`);
  console.log(`Tissue 2 implication: ${result.tissue2Implication}`);
  console.log(`Wrote ${MD_PATH}`);
  console.log(`Wrote ${JSON_PATH}`);
}

function periodRows(evaluation: Evaluation, period: Period) {
  return evaluation.rows.filter((runner) => period === "combined" || runner.year === period);
}
function systemRecord<T>(evaluations: Evaluation[], valueFor: (evaluation: Evaluation) => T): Record<SystemKey, T> {
  return Object.fromEntries(evaluations.map((evaluation) => [evaluation.key, valueFor(evaluation)])) as Record<SystemKey, T>;
}
function periodRecord<T>(valueFor: (period: Period) => T): Record<Period, T> {
  return Object.fromEntries(PERIODS.map((period) => [period, valueFor(period)])) as Record<Period, T>;
}
function periodCoverage(evaluation: Evaluation, period: Period) {
  return evaluation.coverage.filter((item) => period === "combined" || item.year === period);
}
function rankOnes(rows: ScoredRunner[]) {
  return rows.filter((runner) => runner.rank === 1);
}
function leadersByRace(evaluation: Evaluation) {
  return new Map(rankOnes(periodRows(evaluation, "combined")).map((runner) => [runner.row.features.targetRaceId, runner]));
}
function ranksDescending(values: number[]) {
  const sorted = values.map((value, index) => ({ value, index })).sort((a, b) => b.value - a.value || a.index - b.index);
  const ranks = Array<number>(values.length);
  sorted.forEach((entry, index) => { ranks[entry.index] = index + 1; });
  return ranks;
}
function groupBy<T, K>(values: T[], keyFor: (value: T) => K) {
  const grouped = new Map<K, T[]>();
  for (const value of values) grouped.set(keyFor(value), [...(grouped.get(keyFor(value)) ?? []), value]);
  return grouped;
}
function numericClass(value: string | null) {
  const match = value?.match(/\d+/);
  return match ? Number(match[0]) : null;
}
function sp(runner: ScoredRunner) {
  const value = Number(runner.row.outcome.startingPriceDecimal);
  return Number.isFinite(value) && value > 1 ? value : null;
}
function excludeWinnerIndexes(selections: ScoredRunner[], winners: ScoredRunner[]) {
  const excluded = new Set(winners.map((runner) => runner.row.features.targetRunnerId));
  return selections.filter((runner) => !excluded.has(runner.row.features.targetRunnerId));
}
function distanceBand(yards: number | null) {
  if (yards === null) return "unknown";
  const furlongs = yards / 220;
  return furlongs < 7 ? "sprint" : furlongs < 12 ? "middle" : "staying";
}
function fieldBand(value: number | null) {
  return value === null ? "unknown" : value <= 7 ? "2-7" : value <= 11 ? "8-11" : "12+";
}
function answerUseful(result: DiagnosticResult) {
  const m = result.metrics.turf_on_aw_structural.combined;
  const market = result.market.turf_on_aw_structural.combined;
  return (m.rank1Strike ?? 0) > 0 && (market.ae ?? 0) >= 0.9 ? "yes, at least directionally" : "not convincingly";
}
function answerOutperforms(result: DiagnosticResult) {
  const transfer = result.metrics.turf_on_aw_structural.combined;
  const aw = result.metrics.aw_on_aw.combined;
  return transfer.logLoss !== null && aw.logLoss !== null && transfer.logLoss < aw.logLoss ? "yes on log loss" : "no on the primary log-loss comparison";
}
function answerCalibrated(result: DiagnosticResult) {
  const ratio = result.metrics.turf_on_aw_structural.combined.calibrationRatio;
  return ratio !== null && ratio >= 0.9 && ratio <= 1.1 ? "yes within +/-10%" : "no";
}
function metricColumns(m: ProbabilityMetrics) {
  return { races: m.races, runners: m.runners, scoreable: m.scoreableRunners, missing: pct(m.missingPct), full: m.fullRaceCoverage, partial: m.partialRaceCoverage, logLoss: num(m.logLoss), brier: num(m.brier), calibration: num(m.calibrationRatio), rank1: pct(m.rank1Strike), top2: pct(m.top2Capture), top3: pct(m.top3Capture) };
}
function marketColumns(m: MarketMetrics) {
  return { selections: m.selections, winners: m.winners, strike: pct(m.strike), spExpected: num(m.expectedWinners), ae: num(m.ae), profit: money(m.profitLoss), roi: pct(m.roi), avgSp: num(m.averageSp), medSp: num(m.medianSp) };
}
function positiveColumns(m: PositiveEdgeMetrics) {
  return { selections: m.selections, winners: m.winners, tissueExpected: num(m.qualifyingExpectedWinners), marketExpected: num(m.marketExpectedWinners), ae: num(m.ae), roi: pct(m.roi) };
}
function priceColumns(m: PriceProfile) {
  return { selections: m.selections, medianSp: num(m.medianSp), averageSp: num(m.averageSp), under4_1: pct(m.under4To1), from4_8: pct(m.from4ToUnder8To1), from8_16: pct(m.from8ToUnder16To1), over16_1: pct(m.over16To1) };
}
function robustColumns(m: RobustnessMetrics) {
  return { sample: m.sampleSize, largestWinner: money(m.largestWinnerContribution), roi: pct(m.roi), roiExLargest: pct(m.roiExLargestWinner), roiExTop3: pct(m.roiExTop3Winners) };
}
function table(lines: string[], rows: Array<Record<string, unknown>>) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]!);
  lines.push(`| ${headers.join(" | ")} |`);
  lines.push(`| ${headers.map(() => "---").join(" | ")} |`);
  for (const row of rows) lines.push(`| ${headers.map((header) => String(row[header] ?? "-").replaceAll("|", "\\|")).join(" | ")} |`);
  lines.push("");
}
async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}
function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}
function mean(values: number[]) {
  const clean = values.filter(Number.isFinite);
  return clean.length ? sum(clean) / clean.length : null;
}
function median(values: number[]) {
  const clean = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!clean.length) return null;
  const middle = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[middle]! : (clean[middle - 1]! + clean[middle]!) / 2;
}
function divide(a: number, b: number) {
  return b > 0 && Number.isFinite(b) ? a / b : null;
}
function isNumber(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}
function num(value: number | null) {
  return value === null || !Number.isFinite(value) ? "-" : value.toFixed(4);
}
function pct(value: number | null) {
  return value === null || !Number.isFinite(value) ? "-" : `${(value * 100).toFixed(2)}%`;
}
function money(value: number | null) {
  return value === null || !Number.isFinite(value) ? "-" : `${value >= 0 ? "+" : "-"}£${Math.abs(value).toFixed(2)}`;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
