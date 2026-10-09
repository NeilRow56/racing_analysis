import { writeFile } from "node:fs/promises";
import { createDbConnection } from "@/db";
import { raceClassNumber } from "@/lib/racing/research-rule-classes";

const MD_OUTPUT = "/tmp/jump-trainer-form-experiment.md";
const JSON_OUTPUT = "/tmp/jump-trainer-form-experiment.json";
const SOURCE = "sporting_life";
const TARGET_FROM = "2025-01-01";
const TARGET_TO = "2026-12-31";
const SHRINKAGE_RUNNERS = 8;
const CANDIDATES = ["J0", "J1", "J2", "J3", "J4", "J5"] as const;
const FOLDS = [
  {
    label: "2025-H2",
    trainLabel: "to 2025-06-30",
    validationLabel: "2025-07-01 to 2025-12-31",
    train: (race: Race) => race.raceDate <= "2025-06-30",
    test: (race: Race) => race.raceDate >= "2025-07-01" && race.raceDate <= "2025-12-31",
  },
  {
    label: "2026-H1",
    trainLabel: "to 2025-12-31",
    validationLabel: "2026-01-01 to 2026-06-30",
    train: (race: Race) => race.raceDate < "2026-01-01",
    test: (race: Race) => race.raceDate >= "2026-01-01" && race.raceDate <= "2026-06-30",
  },
  {
    label: "2026-H2",
    trainLabel: "to 2026-06-30",
    validationLabel: "2026-07-01 onward",
    train: (race: Race) => race.raceDate <= "2026-06-30",
    test: (race: Race) => race.raceDate >= "2026-07-01",
  },
] as const;

type CandidateId = typeof CANDIDATES[number];
type Subtype = "Hurdle" | "Chase" | "NH Flat";
type SignalClassification = "NO SIGNAL" | "WEAK / UNSTABLE" | "MODEST REPLICATED SIGNAL" | "STRONG REPLICATED SIGNAL";

type DbRunner = {
  raceId: string;
  runnerId: string;
  raceDate: string;
  raceDateTime: unknown;
  courseName: string;
  raceName: string | null;
  raceClass: string | null;
  raceType: string | null;
  raceTypeCode: string | null;
  distanceYards: number | null;
  horseId: string;
  horseName: string;
  trainerId: string | null;
  trainerName: string | null;
  officialRating: number | null;
  topspeedRating: number | null;
  startingPriceDecimal: string | number | null;
  isFavourite: boolean | null;
  finishingPosition: number | null;
  resultStatus: string | null;
  outcomeCode: string | null;
};

type Runner = {
  raceId: string;
  runnerId: string;
  raceDate: string;
  raceDateTime: Date;
  courseName: string;
  horseId: string;
  horseName: string;
  trainerId: string | null;
  trainerName: string | null;
  won: boolean;
  finalSp: number;
  marketProbability: number;
  isFavourite: boolean;
  subtype: Subtype;
  raceClassNumber: number | null;
  officialRating: number | null;
  topspeedRating: number | null;
  trainerPrior365Runs: number;
  trainerPrior365Wins: number;
  trainerPrior365Rate: number | null;
  trainerPrior180Runs: number;
  trainerPrior180Rate: number | null;
  trainerLogPrior365Runs: number;
  trainer14Runs: number;
  trainer14Wins: number;
  trainer14RawRate: number | null;
  trainer14RegularisedRate: number;
  trainer14LogRuns: number;
  trainerFormDelta14d: number;
  winnerPrev1d: number;
  winnerPrev3d: number;
  winnerPrev7d: number;
  twoPlusWinnersPrev7d: number;
  winnerPrev14d: number;
  threePlusWinnersPrev14d: number;
  daysSinceTrainerRunner: number | null;
  oneRunnerToday: number;
  oneRunnerAtMeeting: number;
  officialRatingRank: number | null;
  topspeedRank: number | null;
  classMove: number | null;
  trainerScale: ScaleGroup;
  hotForm: boolean;
};

type Race = {
  raceId: string;
  raceDate: string;
  subtype: Subtype;
  runners: Runner[];
};

type ScaleGroup = "high" | "medium" | "low";
type TrainerHistoryRun = { time: number; raceDate: string; won: boolean };
type HorseHistoryRun = { classNumber: number | null };
type ScaleCutoffs = { high: number; medium: number; hotDelta: number };
type Model = {
  id: CandidateId;
  featureNames: string[];
  weights: number[];
  means: number[];
  sds: number[];
};
type EvaluatedRunner = Runner & { probability: number };
type EvaluatedRace = Race & { evaluated: EvaluatedRunner[]; ranking: EvaluatedRunner[] };
type MetricSummary = {
  races: number;
  runners: number;
  rank1Strike: number | null;
  top2Capture: number | null;
  top3Capture: number | null;
  logLoss: number | null;
  brier: number | null;
  calibrationMae: number | null;
  marketExpectedWinners: number | null;
  actualWinners: number;
  ae: number | null;
};
type SegmentSummary = {
  segment: string;
  runners: number;
  winners: number;
  expectedWinners: number;
  strike: number | null;
  ae: number | null;
  meanMarketProbability: number | null;
  medianMarketProbability: number | null;
  favouriteFrequency: number | null;
};
type FoldRow = {
  fold: string;
  candidate: CandidateId;
  trainDates: string;
  validationDates: string;
  trainRaces: number;
  validationRaces: number;
  metrics: MetricSummary;
  deltaLogLoss: number | null;
  deltaBrier: number | null;
  deltaRank1: number | null;
};
type YearRow = {
  year: "2025" | "2026";
  candidate: CandidateId;
  metrics: MetricSummary;
  deltaLogLoss: number | null;
  deltaBrier: number | null;
  deltaRank1: number | null;
};

type Report = {
  generatedAt: string;
  methodology: Record<string, string>;
  dataCoverage: Record<string, unknown>;
  trainerConcentration: Array<Record<string, unknown>>;
  trainerStrength: Array<Record<string, unknown>>;
  trainerForm14d: Array<Record<string, unknown>>;
  trainerRelativeForm: Array<Record<string, unknown>>;
  winnerClusters: Array<Record<string, unknown>>;
  trainerScale: SegmentSummary[];
  hotFormScale: SegmentSummary[];
  smallTrainerSelectivity: Array<Record<string, unknown>>;
  marketCompression: SegmentSummary[];
  shortPriceMajorYards: SegmentSummary[];
  candidateModels: Record<CandidateId, MetricSummary>;
  walkForward: FoldRow[];
  yearRows: YearRow[];
  coefficients: Array<Record<string, unknown>>;
  classifications: Record<string, SignalClassification>;
  recommendation: string;
  bestCandidate: CandidateId;
};

export function normaliseRaceTimestamp(value: unknown, context = "raceDateTime"): number {
  const timestamp = value instanceof Date
    ? value.getTime()
    : typeof value === "string" && value.trim() !== ""
      ? Date.parse(value)
      : NaN;
  if (!Number.isFinite(timestamp)) {
    throw new Error(`Invalid or missing raceDateTime (${context}): ${String(value)}`);
  }
  return timestamp;
}

export function regularisedTrainerForm14d(input: {
  wins14: number;
  runs14: number;
  baselineRate: number | null;
  globalFallbackRate?: number;
  shrinkageRunners?: number;
}) {
  const baseline = input.baselineRate ?? input.globalFallbackRate ?? 0.1;
  const shrinkage = input.shrinkageRunners ?? SHRINKAGE_RUNNERS;
  return (input.wins14 + baseline * shrinkage) / (input.runs14 + shrinkage);
}

export function classifyTrainerSignal(input: {
  deltaLogLoss: number | null;
  deltaBrier: number | null;
  improvedFolds: number;
  improvedYears: number;
}): SignalClassification {
  if (
    input.deltaLogLoss !== null &&
    input.deltaBrier !== null &&
    input.deltaLogLoss < -0.004 &&
    input.deltaBrier < -0.001 &&
    input.improvedFolds >= 3 &&
    input.improvedYears === 2
  ) return "STRONG REPLICATED SIGNAL";
  if (
    input.deltaLogLoss !== null &&
    input.deltaBrier !== null &&
    input.deltaLogLoss < -0.001 &&
    input.deltaBrier < 0 &&
    input.improvedFolds >= 2 &&
    input.improvedYears === 2
  ) return "MODEST REPLICATED SIGNAL";
  if (input.improvedFolds > 0 || input.deltaLogLoss !== null && input.deltaLogLoss < 0) return "WEAK / UNSTABLE";
  return "NO SIGNAL";
}

async function main() {
  const connection = createDbConnection();
  try {
    await confirmPostgres(connection.client);
    const raw = await loadJumpRows(connection.client);
    const runners = buildRunnerFeatures(raw);
    const races = buildModelRaces(runners);
    const cutoffs = scaleCutoffs(runners.filter((runner) => runner.raceDate < "2026-01-01"));
    applyScaleAndHotForm(runners, cutoffs);
    const usableRaces = races.filter((race) => race.runners.every((runner) => runner.trainerScale));
    const models = fitAllModels(usableRaces);
    const evaluations = Object.fromEntries(CANDIDATES.map((id) => [id, evaluateModel(models[id], usableRaces)])) as Record<CandidateId, EvaluatedRace[]>;
    const candidateModels = Object.fromEntries(CANDIDATES.map((id) => [id, metrics(evaluations[id])])) as Record<CandidateId, MetricSummary>;
    const walkForward = walkForwardRows(usableRaces);
    const yearRows = yearRowsFor(usableRaces, models);
    const bestCandidate = bestCandidateFor(candidateModels, walkForward, yearRows);
    const classifications = classificationsFor(candidateModels, walkForward, yearRows);
    const report: Report = {
      generatedAt: new Date().toISOString(),
      methodology: {
        scope: "Historical Jump races only, split into Hurdle, Chase and NH Flat monitoring segments.",
        postgres: "Local Postgres was required and queried directly; no cache-only fallback was used.",
        chronology: "Trainer and horse-derived features are calculated from races before the target race time. Same-race rows are grouped before history is updated.",
        shrinkage: `TRAINER_FORM_14D regularised rate = (wins14 + baselineRate * ${SHRINKAGE_RUNNERS}) / (runs14 + ${SHRINKAGE_RUNNERS}), where baselineRate is the trainer's prior 365-day rate or the prior global Jump rate fallback.`,
        market: "Final SP implied probabilities are normalised within race and used as a retrospective diagnostic market offset/control, not as a deployable pre-race feature.",
        modelling: "Small race-level softmax candidates J0-J5. Chronological folds train only on earlier races. ROI is not optimised.",
      },
      dataCoverage: dataCoverage(raw, runners, usableRaces),
      trainerConcentration: trainerConcentration(runners),
      trainerStrength: trainerStrengthRows(runners),
      trainerForm14d: bucketRows(runners, "trainer_form_14d", (runner) => runner.trainer14RegularisedRate, [
        ["cold", (value) => value < 0.08],
        ["normal", (value) => value >= 0.08 && value < 0.16],
        ["hot", (value) => value >= 0.16],
      ]),
      trainerRelativeForm: bucketRows(runners, "trainer_form_delta_14d", (runner) => runner.trainerFormDelta14d, [
        ["below baseline", (value) => value < -0.03],
        ["near baseline", (value) => value >= -0.03 && value <= 0.03],
        ["above baseline", (value) => value > 0.03],
      ]),
      winnerClusters: winnerClusterRows(runners),
      trainerScale: segmentSummaries(runners, (runner) => runner.trainerScale),
      hotFormScale: segmentSummaries(runners, (runner) => `${runner.trainerScale}_${runner.hotForm ? "hot" : "normal_cold"}`),
      smallTrainerSelectivity: smallTrainerSelectivityRows(runners),
      marketCompression: segmentSummaries(runners, (runner) => runner.trainerScale),
      shortPriceMajorYards: shortPriceMajorYardRows(runners),
      candidateModels,
      walkForward,
      yearRows,
      coefficients: coefficientRows(models),
      classifications,
      recommendation: recommendationFor(classifications),
      bestCandidate,
    };
    await writeFile(JSON_OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(MD_OUTPUT, renderMarkdown(report), "utf8");
    printTerminalSummary(report);
  } finally {
    await connection.client.end({ timeout: 1 }).catch(() => undefined);
  }
}

async function confirmPostgres(client: ReturnType<typeof createDbConnection>["client"]) {
  const rows = await client<Array<{ host: string | null; port: number | null; races: number }>>`
    select inet_server_addr()::text as host, inet_server_port()::int as port, (select count(*)::int from races) as races
  `;
  const row = rows[0];
  if (!row || row.races === 0) throw new Error("Postgres unavailable or empty.");
}

async function loadJumpRows(client: ReturnType<typeof createDbConnection>["client"]) {
  const rows = await client<DbRunner[]>`
    select
      r.id::text as "raceId",
      rr.id::text as "runnerId",
      r.race_date::text as "raceDate",
      coalesce(r.race_datetime, r.local_race_datetime, (r.race_date::timestamp + coalesce(r.scheduled_time, time '12:00'))) as "raceDateTime",
      c.display_name as "courseName",
      r.race_name as "raceName",
      r.race_class as "raceClass",
      r.race_type as "raceType",
      r.race_type_code as "raceTypeCode",
      r.distance_yards as "distanceYards",
      h.id::text as "horseId",
      h.display_name as "horseName",
      t.id::text as "trainerId",
      t.display_name as "trainerName",
      rr.official_rating as "officialRating",
      rr.topspeed_rating as "topspeedRating",
      rr.starting_price_decimal as "startingPriceDecimal",
      rr.is_favourite as "isFavourite",
      rr.finishing_position as "finishingPosition",
      rr.result_status as "resultStatus",
      rr.outcome_code as "outcomeCode"
    from races r
    join race_runners rr on rr.race_id = r.id
    join horses h on h.id = rr.horse_id
    join courses c on c.id = r.course_id
    left join trainers t on t.id = rr.trainer_id
    where r.source = ${SOURCE}
      and rr.source = ${SOURCE}
      and r.race_date >= date '2024-01-01'
      and (
        lower(coalesce(r.race_type_code, '') || ' ' || coalesce(r.race_type, '') || ' ' || coalesce(r.race_name, '')) like '%hurdle%'
        or lower(coalesce(r.race_type_code, '') || ' ' || coalesce(r.race_type, '') || ' ' || coalesce(r.race_name, '')) like '%chase%'
        or lower(coalesce(r.race_type_code, '') || ' ' || coalesce(r.race_type, '') || ' ' || coalesce(r.race_name, '')) like '%nh flat%'
        or lower(coalesce(r.race_type_code, '') || ' ' || coalesce(r.race_type, '') || ' ' || coalesce(r.race_name, '')) like '%national hunt flat%'
        or lower(coalesce(r.race_type_code, '') || ' ' || coalesce(r.race_type, '') || ' ' || coalesce(r.race_name, '')) like '%bumper%'
      )
    order by "raceDateTime", r.id, rr.id
  `;
  return rows;
}

function buildRunnerFeatures(rows: DbRunner[]) {
  const started = rows.filter((row) => !isNonRunner(row)).map((row) => ({
    ...row,
    raceTimestamp: normaliseRaceTimestamp(row.raceDateTime, `race ${row.raceId}, runner ${row.runnerId}`),
  }));
  const globalPrior: TrainerHistoryRun[] = [];
  const trainerHistory = new Map<string, TrainerHistoryRun[]>();
  const horseHistory = new Map<string, HorseHistoryRun[]>();
  const trainerDayCounts = counts(started.filter(inTargetWindow), (row) => `${row.trainerId ?? "unknown"}::${row.raceDate}`);
  const trainerMeetingCounts = counts(started.filter(inTargetWindow), (row) => `${row.trainerId ?? "unknown"}::${row.raceDate}::${row.courseName}`);
  const byTime = groupBy(started, (row) => `${row.raceTimestamp}::${row.raceId}`);
  const runners: Runner[] = [];
  for (const group of [...byTime.values()].sort((left, right) => left[0]!.raceTimestamp - right[0]!.raceTimestamp)) {
    for (const row of group) {
      if (!inTargetWindow(row)) continue;
      const subtype = jumpSubtype(row);
      if (!subtype) continue;
      const finalSp = decimal(row.startingPriceDecimal);
      if (finalSp === null || finalSp <= 1) continue;
      const trainerId = row.trainerId ?? "unknown";
      const history = trainerHistory.get(trainerId) ?? [];
      const prior365 = priorSince(history, row.raceTimestamp, 365);
      const prior180 = priorSince(history, row.raceTimestamp, 180);
      const prior14 = priorSince(history, row.raceTimestamp, 14);
      const global365 = priorSince(globalPrior, row.raceTimestamp, 365);
      const baselineRate = rate(wins(prior365), prior365.length) ?? rate(wins(global365), global365.length) ?? 0.1;
      const reg14 = regularisedTrainerForm14d({
        wins14: wins(prior14),
        runs14: prior14.length,
        baselineRate,
      });
      const horsePrior = horseHistory.get(row.horseId) ?? [];
      const previousClass = horsePrior.at(-1)?.classNumber ?? null;
      const currentClass = raceClassNumber(row.raceClass);
      runners.push({
        raceId: row.raceId,
        runnerId: row.runnerId,
        raceDate: row.raceDate,
        raceDateTime: new Date(row.raceTimestamp),
        courseName: row.courseName,
        horseId: row.horseId,
        horseName: row.horseName,
        trainerId: row.trainerId,
        trainerName: row.trainerName,
        won: row.finishingPosition === 1,
        finalSp,
        marketProbability: 0,
        isFavourite: row.isFavourite === true,
        subtype,
        raceClassNumber: currentClass,
        officialRating: row.officialRating,
        topspeedRating: row.topspeedRating,
        trainerPrior365Runs: prior365.length,
        trainerPrior365Wins: wins(prior365),
        trainerPrior365Rate: rate(wins(prior365), prior365.length),
        trainerPrior180Runs: prior180.length,
        trainerPrior180Rate: rate(wins(prior180), prior180.length),
        trainerLogPrior365Runs: Math.log1p(prior365.length),
        trainer14Runs: prior14.length,
        trainer14Wins: wins(prior14),
        trainer14RawRate: rate(wins(prior14), prior14.length),
        trainer14RegularisedRate: reg14,
        trainer14LogRuns: Math.log1p(prior14.length),
        trainerFormDelta14d: reg14 - baselineRate,
        winnerPrev1d: wins(priorSince(history, row.raceTimestamp, 1)) > 0 ? 1 : 0,
        winnerPrev3d: wins(priorSince(history, row.raceTimestamp, 3)) > 0 ? 1 : 0,
        winnerPrev7d: wins(priorSince(history, row.raceTimestamp, 7)) > 0 ? 1 : 0,
        twoPlusWinnersPrev7d: wins(priorSince(history, row.raceTimestamp, 7)) >= 2 ? 1 : 0,
        winnerPrev14d: wins(prior14) > 0 ? 1 : 0,
        threePlusWinnersPrev14d: wins(prior14) >= 3 ? 1 : 0,
        daysSinceTrainerRunner: history.length ? Math.max(0, (row.raceTimestamp - history.at(-1)!.time) / 86_400_000) : null,
        oneRunnerToday: trainerDayCounts.get(`${trainerId}::${row.raceDate}`) === 1 ? 1 : 0,
        oneRunnerAtMeeting: trainerMeetingCounts.get(`${trainerId}::${row.raceDate}::${row.courseName}`) === 1 ? 1 : 0,
        officialRatingRank: null,
        topspeedRank: null,
        classMove: currentClass !== null && previousClass !== null ? currentClass - previousClass : null,
        trainerScale: "low",
        hotForm: false,
      });
    }
    for (const row of group) {
      const trainerId = row.trainerId ?? "unknown";
      const entry = { time: row.raceTimestamp, raceDate: row.raceDate, won: row.finishingPosition === 1 };
      const history = trainerHistory.get(trainerId) ?? [];
      history.push(entry);
      trainerHistory.set(trainerId, history);
      globalPrior.push(entry);
      const horseRuns = horseHistory.get(row.horseId) ?? [];
      horseRuns.push({ classNumber: raceClassNumber(row.raceClass) });
      horseHistory.set(row.horseId, horseRuns);
    }
  }
  for (const race of groupBy(runners, (runner) => runner.raceId).values()) {
    applyRanks(race, "officialRating", "officialRatingRank");
    applyRanks(race, "topspeedRating", "topspeedRank");
    const total = sum(race.map((runner) => 1 / runner.finalSp));
    for (const runner of race) runner.marketProbability = (1 / runner.finalSp) / total;
  }
  return runners;
}

function buildModelRaces(runners: Runner[]) {
  return [...groupBy(runners, (runner) => runner.raceId).values()]
    .filter((race) => race.length >= 2 && race.filter((runner) => runner.won).length === 1)
    .map((race): Race => ({
      raceId: race[0]!.raceId,
      raceDate: race[0]!.raceDate,
      subtype: race[0]!.subtype,
      runners: race,
    }))
    .sort((left, right) => left.raceDate.localeCompare(right.raceDate) || left.raceId.localeCompare(right.raceId));
}

function scaleCutoffs(development: Runner[]): ScaleCutoffs {
  return {
    high: quantile(development.map((runner) => runner.trainerPrior365Runs), 0.67) ?? 40,
    medium: quantile(development.map((runner) => runner.trainerPrior365Runs), 0.33) ?? 12,
    hotDelta: Math.max(0.02, quantile(development.map((runner) => runner.trainerFormDelta14d), 0.75) ?? 0.03),
  };
}

function applyScaleAndHotForm(runners: Runner[], cutoffs: ScaleCutoffs) {
  for (const runner of runners) {
    runner.trainerScale = runner.trainerPrior365Runs >= cutoffs.high
      ? "high"
      : runner.trainerPrior365Runs >= cutoffs.medium ? "medium" : "low";
    runner.hotForm = runner.trainerFormDelta14d >= cutoffs.hotDelta && runner.trainer14Runs >= 2;
  }
}

function fitAllModels(races: Race[]) {
  return Object.fromEntries(CANDIDATES.map((id) => [id, fitModel(id, races.filter((race) => race.raceDate < "2026-01-01"))])) as Record<CandidateId, Model>;
}

function fitModel(id: CandidateId, races: Race[]): Model {
  const featureNames = featureNamesFor(id);
  const stats = featureNames.map((name) => {
    const values = races.flatMap((race) => race.runners.map((runner) => rawFeature(runner, name))).filter(isNumber);
    const mean = average(values) ?? 0;
    const sd = Math.sqrt(average(values.map((value) => (value - mean) ** 2)) ?? 0);
    return { mean, sd: sd > 1e-9 ? sd : 1 };
  });
  const weights = featureNames.map(() => 0);
  if (featureNames.length === 0) return { id, featureNames, weights, means: [], sds: [] };
  const learningRate = 0.04;
  const l2 = 0.002;
  for (let epoch = 0; epoch < 260; epoch += 1) {
    const gradient = featureNames.map(() => 0);
    for (const race of races) {
      const xs = race.runners.map((runner) => featureNames.map((name, index) => standardise(rawFeature(runner, name), stats[index]!)));
      const scores = race.runners.map((runner, index) => Math.log(Math.max(runner.marketProbability, 1e-9)) + dot(weights, xs[index]!));
      const probabilities = softmax(scores);
      for (let runnerIndex = 0; runnerIndex < race.runners.length; runnerIndex += 1) {
        const error = probabilities[runnerIndex]! - (race.runners[runnerIndex]!.won ? 1 : 0);
        for (let featureIndex = 0; featureIndex < featureNames.length; featureIndex += 1) {
          gradient[featureIndex]! += error * xs[runnerIndex]![featureIndex]!;
        }
      }
    }
    for (let index = 0; index < weights.length; index += 1) {
      const penalty = l2 * weights[index]!;
      weights[index]! -= learningRate * ((gradient[index]! / Math.max(1, races.length)) + penalty);
    }
  }
  return {
    id,
    featureNames,
    weights,
    means: stats.map((item) => item.mean),
    sds: stats.map((item) => item.sd),
  };
}

function evaluateModel(model: Model, races: Race[]): EvaluatedRace[] {
  return races.map((race) => {
    const scores = race.runners.map((runner) => {
      const features = model.featureNames.map((name, index) => standardise(rawFeature(runner, name), { mean: model.means[index]!, sd: model.sds[index]! }));
      return Math.log(Math.max(runner.marketProbability, 1e-9)) + dot(model.weights, features);
    });
    const probabilities = softmax(scores);
    const evaluated = race.runners.map((runner, index) => ({ ...runner, probability: probabilities[index]! }));
    const ranking = [...evaluated].sort((left, right) => right.probability - left.probability || left.horseName.localeCompare(right.horseName));
    return { ...race, evaluated, ranking };
  });
}

function walkForwardRows(races: Race[]): FoldRow[] {
  return FOLDS.flatMap((fold) => {
    const train = races.filter(fold.train);
    const test = races.filter(fold.test);
    const models = Object.fromEntries(CANDIDATES.map((id) => [id, fitModel(id, train)])) as Record<CandidateId, Model>;
    const baseline = metrics(evaluateModel(models.J0, test));
    return CANDIDATES.map((candidate) => {
      const m = metrics(evaluateModel(models[candidate], test));
      return {
        fold: fold.label,
        candidate,
        trainDates: fold.trainLabel,
        validationDates: fold.validationLabel,
        trainRaces: train.length,
        validationRaces: test.length,
        metrics: m,
        deltaLogLoss: diff(m.logLoss, baseline.logLoss),
        deltaBrier: diff(m.brier, baseline.brier),
        deltaRank1: diff(m.rank1Strike, baseline.rank1Strike),
      };
    });
  });
}

function yearRowsFor(races: Race[], models: Record<CandidateId, Model>): YearRow[] {
  return (["2025", "2026"] as const).flatMap((year) => {
    const subset = races.filter((race) => race.raceDate.startsWith(year));
    const baseline = metrics(evaluateModel(models.J0, subset));
    return CANDIDATES.map((candidate) => {
      const m = metrics(evaluateModel(models[candidate], subset));
      return {
        year,
        candidate,
        metrics: m,
        deltaLogLoss: diff(m.logLoss, baseline.logLoss),
        deltaBrier: diff(m.brier, baseline.brier),
        deltaRank1: diff(m.rank1Strike, baseline.rank1Strike),
      };
    });
  });
}

function metrics(rows: EvaluatedRace[]): MetricSummary {
  const rank1Winners = rows.filter((row) => row.ranking[0]?.won).length;
  const runners = rows.flatMap((row) => row.evaluated);
  const topSelections = rows.flatMap((row) => row.ranking[0] ? [row.ranking[0]] : []);
  const marketExpectedWinners = sum(topSelections.map((runner) => runner.marketProbability));
  return {
    races: rows.length,
    runners: runners.length,
    rank1Strike: rate(rank1Winners, rows.length),
    top2Capture: rate(rows.filter((row) => row.ranking.slice(0, 2).some((runner) => runner.won)).length, rows.length),
    top3Capture: rate(rows.filter((row) => row.ranking.slice(0, 3).some((runner) => runner.won)).length, rows.length),
    logLoss: average(rows.map((row) => -Math.log(Math.max(row.evaluated.find((runner) => runner.won)?.probability ?? 1e-12, 1e-12)))),
    brier: average(rows.map((row) => sum(row.evaluated.map((runner) => (runner.probability - (runner.won ? 1 : 0)) ** 2)))),
    calibrationMae: calibrationMae(runners),
    marketExpectedWinners,
    actualWinners: rank1Winners,
    ae: marketExpectedWinners > 0 ? rank1Winners / marketExpectedWinners : null,
  };
}

function dataCoverage(raw: DbRunner[], runners: Runner[], races: Race[]) {
  return {
    rawJumpRowsLoadedFrom2024: raw.length,
    races: races.length,
    runners: runners.length,
    trainers: new Set(runners.map((runner) => runner.trainerId ?? "unknown")).size,
    winners: runners.filter((runner) => runner.won).length,
    dateRange: `${min(runners.map((runner) => runner.raceDate))} to ${max(runners.map((runner) => runner.raceDate))}`,
    coverage: {
      officialRating: rate(runners.filter((runner) => runner.officialRating !== null).length, runners.length),
      topspeedRating: rate(runners.filter((runner) => runner.topspeedRating !== null).length, runners.length),
      trainerId: rate(runners.filter((runner) => runner.trainerId !== null).length, runners.length),
      startingPriceDecimal: rate(runners.filter((runner) => Number.isFinite(runner.finalSp)).length, runners.length),
    },
    subtype: Object.fromEntries(["Hurdle", "Chase", "NH Flat"].map((subtype) => [
      subtype,
      {
        races: races.filter((race) => race.subtype === subtype).length,
        runners: runners.filter((runner) => runner.subtype === subtype).length,
        winners: runners.filter((runner) => runner.subtype === subtype && runner.won).length,
      },
    ])),
  };
}

function trainerConcentration(runners: Runner[]) {
  return ["all", "Hurdle", "Chase", "NH Flat"].map((segment) => {
    const subset = segment === "all" ? runners : runners.filter((runner) => runner.subtype === segment);
    const trainerRows = [...groupBy(subset, (runner) => runner.trainerId ?? "unknown").values()]
      .map((items) => ({ runners: items.length, winners: items.filter((runner) => runner.won).length }))
      .sort((left, right) => right.winners - left.winners);
    const totalWinners = sum(trainerRows.map((row) => row.winners));
    return {
      segment,
      trainers: trainerRows.length,
      runners: subset.length,
      winners: totalWinners,
      top5WinnerShare: share(sum(trainerRows.slice(0, 5).map((row) => row.winners)), totalWinners),
      top10WinnerShare: share(sum(trainerRows.slice(0, 10).map((row) => row.winners)), totalWinners),
      top20WinnerShare: share(sum(trainerRows.slice(0, 20).map((row) => row.winners)), totalWinners),
    };
  });
}

function trainerStrengthRows(runners: Runner[]) {
  return bucketRows(runners, "trainer_prior_365_rate", (runner) => runner.trainerPrior365Rate ?? 0, [
    ["0-5%", (value) => value < 0.05],
    ["5-10%", (value) => value >= 0.05 && value < 0.1],
    ["10-15%", (value) => value >= 0.1 && value < 0.15],
    ["15%+", (value) => value >= 0.15],
  ]);
}

function winnerClusterRows(runners: Runner[]) {
  const features: Array<[string, (runner: Runner) => boolean]> = [
    ["winner previous 1 day", (runner) => runner.winnerPrev1d === 1],
    ["winner previous 3 days", (runner) => runner.winnerPrev3d === 1],
    ["winner previous 7 days", (runner) => runner.winnerPrev7d === 1],
    ["2+ winners previous 7 days", (runner) => runner.twoPlusWinnersPrev7d === 1],
    ["winner previous 14 days", (runner) => runner.winnerPrev14d === 1],
    ["3+ winners previous 14 days", (runner) => runner.threePlusWinnersPrev14d === 1],
  ];
  return features.flatMap(([feature, matches]) => [
    { feature, bucket: "yes", ...plainSummary(runners.filter(matches)) },
    { feature, bucket: "no", ...plainSummary(runners.filter((runner) => !matches(runner))) },
  ]);
}

function smallTrainerSelectivityRows(runners: Runner[]) {
  const low = runners.filter((runner) => runner.trainerScale === "low");
  const tests: Array<[string, (runner: Runner) => boolean]> = [
    ["one runner that day", (runner) => runner.oneRunnerToday === 1],
    ["one runner at meeting", (runner) => runner.oneRunnerAtMeeting === 1],
    ["14+ days since trainer runner", (runner) => (runner.daysSinceTrainerRunner ?? 0) >= 14],
    ["OR rank 1-2", (runner) => runner.officialRatingRank !== null && runner.officialRatingRank <= 2],
    ["speed rank 1-2", (runner) => runner.topspeedRank !== null && runner.topspeedRank <= 2],
    ["class drop", (runner) => runner.classMove !== null && runner.classMove > 0],
  ];
  return tests.map(([feature, matches]) => ({
    feature,
    testedWithin: "low-volume trainers only",
    matched: plainSummary(low.filter(matches)),
    unmatched: plainSummary(low.filter((runner) => !matches(runner))),
    residualCorrelation: pearson(
      low.map((runner) => matches(runner) ? 1 : 0),
      low.map((runner) => (runner.won ? 1 : 0) - runner.marketProbability),
    ),
  }));
}

function shortPriceMajorYardRows(runners: Runner[]) {
  const bands: Array<[string, (sp: number) => boolean]> = [
    ["odds-on", (sp) => sp < 2],
    ["evens to <6/4", (sp) => sp >= 2 && sp < 2.5],
    ["6/4 to <2/1", (sp) => sp >= 2.5 && sp < 3],
    [">=2/1", (sp) => sp >= 3],
  ];
  return bands.flatMap(([band, matches]) =>
    segmentSummaries(runners.filter((runner) => matches(runner.finalSp)), (runner) => `${runner.trainerScale}_${band}`)
  );
}

function bucketRows(
  runners: Runner[],
  feature: string,
  valueFor: (runner: Runner) => number,
  buckets: Array<[string, (value: number) => boolean]>,
) {
  return buckets.map(([bucket, matches]) => ({
    feature,
    bucket,
    ...plainSummary(runners.filter((runner) => matches(valueFor(runner)))),
  }));
}

function segmentSummaries(runners: Runner[], segmentFor: (runner: Runner) => string): SegmentSummary[] {
  return [...groupBy(runners, segmentFor).entries()]
    .map(([segment, subset]) => ({ segment, ...plainSummary(subset) }))
    .sort((left, right) => left.segment.localeCompare(right.segment));
}

function plainSummary(runners: Runner[]) {
  const winners = runners.filter((runner) => runner.won).length;
  const expectedWinners = sum(runners.map((runner) => runner.marketProbability));
  const marketProbabilities = runners.map((runner) => runner.marketProbability);
  return {
    runners: runners.length,
    winners,
    expectedWinners,
    strike: rate(winners, runners.length),
    ae: expectedWinners > 0 ? winners / expectedWinners : null,
    meanMarketProbability: average(marketProbabilities),
    medianMarketProbability: quantile(marketProbabilities, 0.5),
    favouriteFrequency: rate(runners.filter((runner) => runner.isFavourite).length, runners.length),
  };
}

function classificationsFor(candidateModels: Record<CandidateId, MetricSummary>, folds: FoldRow[], years: YearRow[]) {
  const family = (candidate: CandidateId) => {
    const deltaLogLoss = diff(candidateModels[candidate].logLoss, candidateModels.J0.logLoss);
    const deltaBrier = diff(candidateModels[candidate].brier, candidateModels.J0.brier);
    return classifyTrainerSignal({
      deltaLogLoss,
      deltaBrier,
      improvedFolds: folds.filter((row) => row.candidate === candidate && (row.deltaLogLoss ?? 1) < 0 && (row.deltaBrier ?? 1) < 0).length,
      improvedYears: years.filter((row) => row.candidate === candidate && (row.deltaLogLoss ?? 1) < 0 && (row.deltaBrier ?? 1) < 0).length,
    });
  };
  return {
    longTermTrainerStrength: family("J1"),
    trainerForm14d: family("J2"),
    trainerRelativeForm: family("J3"),
    winnerClusters: family("J4"),
    smallTrainerSelectivity: family("J5"),
  };
}

function bestCandidateFor(candidateModels: Record<CandidateId, MetricSummary>, folds: FoldRow[], years: YearRow[]) {
  return CANDIDATES.slice(1)
    .map((candidate) => ({
      candidate,
      deltaLogLoss: diff(candidateModels[candidate].logLoss, candidateModels.J0.logLoss),
      improvedFolds: folds.filter((row) => row.candidate === candidate && (row.deltaLogLoss ?? 1) < 0).length,
      improvedYears: years.filter((row) => row.candidate === candidate && (row.deltaLogLoss ?? 1) < 0).length,
    }))
    .sort((left, right) =>
      (right.improvedFolds - left.improvedFolds) ||
      (right.improvedYears - left.improvedYears) ||
      (left.deltaLogLoss ?? Infinity) - (right.deltaLogLoss ?? Infinity)
    )[0]?.candidate ?? "J0";
}

function recommendationFor(classifications: Record<string, SignalClassification>) {
  return Object.values(classifications).some((value) => value === "MODEST REPLICATED SIGNAL" || value === "STRONG REPLICATED SIGNAL")
    ? "YES: at least one trainer/stable feature family clears the replicated-signal threshold for a future Jump V2 shadow experiment. Do not create production Jump V2 yet."
    : "NO: trainer/stable features do not clear the replicated-signal threshold. Keep monitoring; do not move them into a Jump V2 experiment yet.";
}

function coefficientRows(models: Record<CandidateId, Model>) {
  return CANDIDATES.flatMap((candidate) =>
    models[candidate].featureNames.map((feature, index) => ({
      candidate,
      feature,
      coefficient: models[candidate].weights[index],
      direction: direction(models[candidate].weights[index] ?? null),
    }))
  );
}

export function featureNamesFor(id: CandidateId): string[] {
  const horse = ["official_rating_z", "topspeed_z", "class_number", "field_size"];
  const longTerm = ["trainer_prior_365_rate", "trainer_prior_180_rate", "trainer_log_prior_365_runs", "trainer_prior_365_wins"];
  const form14 = ["trainer_14_reg_rate", "trainer_14_log_runs"];
  const relative = ["trainer_form_delta_14d"];
  const clusters = ["winner_prev_1d", "winner_prev_3d", "winner_prev_7d", "two_plus_winners_prev_7d", "winner_prev_14d", "three_plus_winners_prev_14d"];
  const selectivity = ["low_one_runner_today", "low_one_runner_meeting", "low_days_since_trainer_runner", "low_or_rank", "low_speed_rank", "low_class_move"];
  if (id === "J0") return horse;
  if (id === "J1") return [...horse, ...longTerm];
  if (id === "J2") return [...horse, ...longTerm, ...form14];
  if (id === "J3") return [...horse, ...longTerm, ...form14, ...relative];
  if (id === "J4") return [...horse, ...longTerm, ...form14, ...relative, ...clusters];
  return [...horse, ...longTerm, ...form14, ...relative, ...selectivity];
}

function rawFeature(runner: Runner, name: string): number | null {
  const map: Record<string, number | null> = {
    official_rating_z: runner.officialRating,
    topspeed_z: runner.topspeedRating,
    class_number: runner.raceClassNumber,
    field_size: null,
    trainer_prior_365_rate: runner.trainerPrior365Rate,
    trainer_prior_180_rate: runner.trainerPrior180Rate,
    trainer_log_prior_365_runs: runner.trainerLogPrior365Runs,
    trainer_prior_365_wins: Math.log1p(runner.trainerPrior365Wins),
    trainer_14_reg_rate: runner.trainer14RegularisedRate,
    trainer_14_log_runs: runner.trainer14LogRuns,
    trainer_form_delta_14d: runner.trainerFormDelta14d,
    winner_prev_1d: runner.winnerPrev1d,
    winner_prev_3d: runner.winnerPrev3d,
    winner_prev_7d: runner.winnerPrev7d,
    two_plus_winners_prev_7d: runner.twoPlusWinnersPrev7d,
    winner_prev_14d: runner.winnerPrev14d,
    three_plus_winners_prev_14d: runner.threePlusWinnersPrev14d,
    low_one_runner_today: runner.trainerScale === "low" ? runner.oneRunnerToday : 0,
    low_one_runner_meeting: runner.trainerScale === "low" ? runner.oneRunnerAtMeeting : 0,
    low_days_since_trainer_runner: runner.trainerScale === "low" ? Math.log1p(runner.daysSinceTrainerRunner ?? 0) : 0,
    low_or_rank: runner.trainerScale === "low" && runner.officialRatingRank !== null ? -runner.officialRatingRank : 0,
    low_speed_rank: runner.trainerScale === "low" && runner.topspeedRank !== null ? -runner.topspeedRank : 0,
    low_class_move: runner.trainerScale === "low" ? runner.classMove : 0,
  };
  if (name === "field_size") return null;
  return map[name] ?? null;
}

function renderMarkdown(report: Report) {
  const lines = [
    "# Jump Trainer Form Experiment",
    "",
    `Generated ${report.generatedAt}. Research only. Production Jump models, trackers, settlement, price history and Forward Value were not mutated.`,
    "",
    "## Executive Summary",
    "",
    `Best candidate: ${report.bestCandidate}. Baseline log loss ${fmt(report.candidateModels.J0.logLoss)}, candidate log loss ${fmt(report.candidateModels[report.bestCandidate].logLoss)} (${fmtSigned(diff(report.candidateModels[report.bestCandidate].logLoss, report.candidateModels.J0.logLoss))}). Recommendation: ${report.recommendation}`,
    "",
    `Trainer-form shrinkage: ${report.methodology.shrinkage}`,
    "",
  ];
  section(lines, "Data Coverage", report.dataCoverage);
  table(lines, "Trainer Concentration", report.trainerConcentration);
  table(lines, "Long-Term Trainer Strength", report.trainerStrength);
  table(lines, "TRAINER_FORM_14D", report.trainerForm14d);
  table(lines, "Trainer Relative Form", report.trainerRelativeForm);
  table(lines, "Winner Clusters", report.winnerClusters);
  table(lines, "Trainer Scale", report.trainerScale);
  table(lines, "Small-Trainer Selectivity", report.smallTrainerSelectivity);
  table(lines, "Market Compression", report.marketCompression);
  table(lines, "Short-Price Major-Yard Analysis", report.shortPriceMajorYards);
  table(lines, "Candidate Models", CANDIDATES.map((candidate) => ({ candidate, ...report.candidateModels[candidate], deltaLogLoss: diff(report.candidateModels[candidate].logLoss, report.candidateModels.J0.logLoss), deltaBrier: diff(report.candidateModels[candidate].brier, report.candidateModels.J0.brier) })));
  table(lines, "Walk-Forward Validation", report.walkForward);
  table(lines, "2025 vs 2026", report.yearRows.filter((row) => ["J0", "J2", "J3"].includes(row.candidate)));
  table(lines, "Feature Interpretation", report.coefficients.filter((row) => /trainer|winner|low/.test(String(row.feature))));
  section(lines, "Signal Classification", report.classifications);
  lines.push("## Recommendation", "", report.recommendation, "");
  return `${lines.join("\n").trimEnd()}\n`;
}

function printTerminalSummary(report: Report) {
  const top = report.trainerConcentration.find((row) => row.segment === "all");
  const best = report.candidateModels[report.bestCandidate];
  const base = report.candidateModels.J0;
  const y2025J2 = report.yearRows.find((row) => row.year === "2025" && row.candidate === "J2");
  const y2026J2 = report.yearRows.find((row) => row.year === "2026" && row.candidate === "J2");
  console.log("Trainer concentration:");
  console.log(`Top trainer groups share of winners: top5 ${pct(numberValue(top?.top5WinnerShare))}, top10 ${pct(numberValue(top?.top10WinnerShare))}, top20 ${pct(numberValue(top?.top20WinnerShare))}`);
  console.log("");
  console.log("TRAINER_FORM_14D:");
  console.log(`Signal classification: ${report.classifications.trainerForm14d}`);
  console.log(`2025 direction: ${direction(y2025J2?.deltaLogLoss ?? null)}`);
  console.log(`2026 direction: ${direction(y2026J2?.deltaLogLoss ?? null)}`);
  console.log("");
  console.log("Trainer relative form:");
  console.log(`Signal classification: ${report.classifications.trainerRelativeForm}`);
  console.log("");
  console.log("Small-trainer selectivity:");
  console.log(`Signal classification: ${report.classifications.smallTrainerSelectivity}`);
  console.log("");
  console.log(`Best candidate: ${report.bestCandidate}`);
  console.log(`Baseline log loss: ${fmt(base.logLoss)}`);
  console.log(`Candidate log loss: ${fmt(best.logLoss)}`);
  console.log(`Delta: ${fmtSigned(diff(best.logLoss, base.logLoss))}`);
  console.log("");
  console.log(`Baseline rank-1: ${pct(base.rank1Strike)}`);
  console.log(`Candidate rank-1: ${pct(best.rank1Strike)}`);
  console.log("");
  console.log("Should trainer/stable features move to a Jump V2 experiment?");
  console.log(report.recommendation.startsWith("YES") ? "YES" : "NO");
  console.log("");
  console.log(`Wrote ${MD_OUTPUT}`);
  console.log(`Wrote ${JSON_OUTPUT}`);
}

function jumpSubtype(row: Pick<DbRunner, "raceName" | "raceType" | "raceTypeCode">): Subtype | null {
  const text = `${row.raceTypeCode ?? ""} ${row.raceType ?? ""} ${row.raceName ?? ""}`.toLowerCase();
  if (/nh flat|national hunt flat|bumper/.test(text)) return "NH Flat";
  if (/chase/.test(text)) return "Chase";
  if (/hurdle/.test(text)) return "Hurdle";
  return null;
}

function isNonRunner(row: Pick<DbRunner, "resultStatus" | "outcomeCode" | "finishingPosition">) {
  return /non.?runner|withdrawn/i.test(`${row.resultStatus ?? ""} ${row.outcomeCode ?? ""}`) || row.finishingPosition === null;
}

function inTargetWindow(row: Pick<DbRunner, "raceDate">) {
  return row.raceDate >= TARGET_FROM && row.raceDate <= TARGET_TO;
}

function priorSince(history: TrainerHistoryRun[], raceTimestamp: number, days: number) {
  const cutoff = raceTimestamp - days * 86_400_000;
  return history.filter((run) => run.time >= cutoff && run.time < raceTimestamp);
}

function wins(history: TrainerHistoryRun[]) {
  return history.filter((run) => run.won).length;
}

function applyRanks<T extends "officialRatingRank" | "topspeedRank">(runners: Runner[], source: "officialRating" | "topspeedRating", target: T) {
  const ranked = runners
    .filter((runner) => runner[source] !== null)
    .sort((left, right) => right[source]! - left[source]! || left.horseName.localeCompare(right.horseName));
  let prior: number | null = null;
  let rank = 0;
  ranked.forEach((runner, index) => {
    if (runner[source] !== prior) rank = index + 1;
    runner[target] = rank;
    prior = runner[source];
  });
}

function standardise(value: number | null, stats: { mean: number; sd: number }) {
  return value === null || !Number.isFinite(value) ? 0 : (value - stats.mean) / stats.sd;
}

function calibrationMae(runners: EvaluatedRunner[]) {
  const bands = [
    [0, 0.05],
    [0.05, 0.1],
    [0.1, 0.15],
    [0.15, 0.2],
    [0.2, 0.3],
    [0.3, 1.01],
  ] as const;
  const errors = bands
    .map(([low, high]) => runners.filter((runner) => runner.probability >= low && runner.probability < high))
    .filter((band) => band.length >= 20)
    .map((band) => Math.abs(average(band.map((runner) => runner.probability))! - average(band.map((runner) => runner.won ? 1 : 0))!));
  return average(errors);
}

function table(lines: string[], title: string, rows: Array<Record<string, unknown>>) {
  lines.push(`## ${title}`, "");
  if (rows.length === 0) {
    lines.push("No rows.", "");
    return;
  }
  const keys = Object.keys(rows[0]!);
  lines.push(`| ${keys.join(" | ")} |`, `| ${keys.map(() => "---").join(" | ")} |`);
  for (const row of rows) lines.push(`| ${keys.map((key) => formatCell(row[key])).join(" | ")} |`);
  lines.push("");
}

function section(lines: string[], title: string, value: unknown) {
  lines.push(`## ${title}`, "", "```json", JSON.stringify(value, null, 2), "```", "");
}

function formatCell(value: unknown): string {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "n/a";
    return Math.abs(value) <= 1 ? value.toFixed(4) : value.toFixed(2);
  }
  if (value && typeof value === "object") return JSON.stringify(value).replaceAll("|", "\\|");
  return String(value ?? "n/a").replaceAll("|", "\\|");
}

function groupBy<T>(items: T[], keyFor: (item: T) => string) {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFor(item);
    const group = grouped.get(key) ?? [];
    group.push(item);
    grouped.set(key, group);
  }
  return grouped;
}

function counts<T>(items: T[], keyFor: (item: T) => string) {
  const result = new Map<string, number>();
  for (const item of items) result.set(keyFor(item), (result.get(keyFor(item)) ?? 0) + 1);
  return result;
}

function decimal(value: string | number | null): number | null {
  if (value === null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function softmax(scores: number[]) {
  const max = Math.max(...scores);
  const weights = scores.map((score) => Math.exp(score - max));
  const total = sum(weights);
  return weights.map((weight) => weight / total);
}

function dot(left: number[], right: number[]) {
  return left.reduce((total, value, index) => total + value * (right[index] ?? 0), 0);
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function average(values: number[]) {
  return values.length ? sum(values) / values.length : null;
}

function quantile(values: Array<number | null>, q: number) {
  const sorted = values.filter(isNumber).sort((left, right) => left - right);
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * q)));
  return sorted[index]!;
}

function min(values: string[]) {
  return values.length ? [...values].sort()[0] : null;
}

function max(values: string[]) {
  return values.length ? [...values].sort().at(-1) : null;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function rate(numerator: number, denominator: number) {
  return denominator ? numerator / denominator : null;
}

function share(numerator: number, denominator: number) {
  return denominator ? numerator / denominator : null;
}

function diff(left: number | null, right: number | null) {
  return left === null || right === null ? null : left - right;
}

function pearson(xs: number[], ys: number[]) {
  if (xs.length !== ys.length || xs.length < 3) return null;
  const mx = average(xs)!;
  const my = average(ys)!;
  const cov = sum(xs.map((x, index) => (x - mx) * (ys[index]! - my)));
  const sx = Math.sqrt(sum(xs.map((x) => (x - mx) ** 2)));
  const sy = Math.sqrt(sum(ys.map((y) => (y - my) ** 2)));
  return sx > 0 && sy > 0 ? cov / (sx * sy) : null;
}

function direction(value: number | null) {
  if (value === null || Math.abs(value) < 0.0005) return "flat";
  return value < 0 ? "improves" : "worse";
}

function numberValue(value: unknown) {
  return typeof value === "number" ? value : null;
}

function fmt(value: number | null | undefined) {
  return value === null || value === undefined || !Number.isFinite(value) ? "n/a" : value.toFixed(4);
}

function pct(value: number | null | undefined) {
  return value === null || value === undefined || !Number.isFinite(value) ? "n/a" : `${(value * 100).toFixed(1)}%`;
}

function fmtSigned(value: number | null | undefined) {
  return value === null || value === undefined || !Number.isFinite(value) ? "n/a" : `${value >= 0 ? "+" : ""}${value.toFixed(4)}`;
}

if (process.argv[1]?.endsWith("run-jump-trainer-form-experiment.ts")) await main();
