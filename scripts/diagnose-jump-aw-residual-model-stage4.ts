import { writeFile } from "node:fs/promises";
import { calculateAwRaceRatings } from "@/lib/racing/aw-performance-rating";
import { calculateJumpRaceRatings } from "@/lib/racing/jump-performance-rating";
import { raceClassNumber } from "@/lib/racing/research-rule-classes";
import { candidates, evaluateRace, loadHistoricalRaces } from "./build-ranking-model-stage2";

export type FamilyId = "jump" | "aw";
type HistoricalRace = Awaited<ReturnType<typeof loadHistoricalRaces>>[number];
type Race = Omit<HistoricalRace, "family"> & { family: FamilyId };
type Runner = HistoricalRace["runners"][number];
export type CandidateId = "R0" | "R1" | "R2" | "R3" | "R4" | "R5";
type Feature = {
  name: string;
  label: string;
  value: (runner: Runner, race: Race, context: RaceContext) => number | null;
};
type RaceContext = {
  market: Map<string, number>;
  tissueProbability: Map<string, number>;
  ratingScore: Map<string, number>;
};
type FittedModel = {
  id: CandidateId;
  family: FamilyId;
  featureNames: string[];
  weights: number[];
};
type EvaluatedRunner = {
  runner: Runner;
  probability: number;
  marketProbability: number;
  score: number;
};
type EvaluatedRace = {
  race: Race;
  runners: EvaluatedRunner[];
  ranking: EvaluatedRunner[];
  marketRanking: EvaluatedRunner[];
};
export type MetricSummary = {
  races: number;
  runners: number;
  rank1Strike: number | null;
  top2Capture: number | null;
  top3Capture: number | null;
  logLoss: number | null;
  brier: number | null;
  calibrationMae: number | null;
};
type WalkForwardRow = {
  fold: string;
  candidate: CandidateId;
  trainRaces: number;
  validationRaces: number;
  metrics: MetricSummary;
  deltaLogLoss: number | null;
  deltaBrier: number | null;
  deltaRank1: number | null;
  calibrationChange: number | null;
};
type PeriodRow = {
  period: string;
  candidate: CandidateId;
  metrics: MetricSummary;
  deltaLogLoss: number | null;
  deltaBrier: number | null;
  deltaRank1: number | null;
  calibrationChange: number | null;
};
type CalibrationBandRow = {
  band: string;
  runners: number;
  meanPredicted: number | null;
  actualStrike: number | null;
};
type ShortPriceRow = {
  band: string;
  favourites: number;
  marketExpectedWinners: number | null;
  residualExpectedWinners: number | null;
  actualWinners: number;
  residualDirection: number | null;
  marketCalibrationError: number | null;
  residualCalibrationError: number | null;
};
type OverrideRow = {
  group: "agrees_with_market_favourite" | "changes_rank1_away_from_market_favourite";
  races: number;
  winners: number;
  strike: number | null;
  marketExpectedWinners: number | null;
  combinedExpectedWinners: number | null;
  logLoss: number | null;
};
type Verdict = {
  classification: "NO INCREMENTAL SIGNAL" | "WEAK / UNSTABLE" | "MODEST REPLICATED SIGNAL" | "STRONG REPLICATED SIGNAL";
  bestCandidate: CandidateId;
  rationale: string;
  improvedFolds: number;
  improvedYears: number;
  bestDeltaLogLoss: number | null;
  bestDeltaBrier: number | null;
};
type Report = {
  generatedAt: string;
  methodology: Record<string, string>;
  summaries: Record<FamilyId, Record<CandidateId, MetricSummary>>;
  walkForward: Record<FamilyId, WalkForwardRow[]>;
  periods: Record<FamilyId, PeriodRow[]>;
  residualAssociations: Record<FamilyId, ReturnType<typeof associationRows>>;
  subtypeSegments: Record<FamilyId, Array<{ segment: string; candidate: CandidateId; metrics: MetricSummary; deltaLogLoss: number | null; deltaBrier: number | null }>>;
  shortPrices: Record<FamilyId, ShortPriceRow[]>;
  overrides: Record<FamilyId, Record<CandidateId, OverrideRow[]>>;
  calibration: Record<FamilyId, Record<"market" | "best", CalibrationBandRow[]>>;
  verdicts: Record<FamilyId, Verdict>;
  fittedWeights: Record<FamilyId, Record<CandidateId, FittedModel>>;
};

const MD_OUTPUT = "/tmp/jump-aw-residual-model-stage4.md";
const JSON_OUTPUT = "/tmp/jump-aw-residual-model-stage4.json";
export const FAMILIES: FamilyId[] = ["jump", "aw"];
export const FAMILY_LABEL: Record<FamilyId, string> = { jump: "Jump", aw: "All Weather" };
export const CANDIDATE_IDS: CandidateId[] = ["R0", "R1", "R2", "R3", "R4", "R5"];
export const CANDIDATE_LABEL: Record<CandidateId, string> = {
  R0: "Market only",
  R1: "Market + core numeric residual features",
  R2: "Market + core numeric + current Tissue signal",
  R3: "Market + core numeric + current rating signal",
  R4: "Market + core numeric + reduced comments/context",
  R5: "Market + strongest stable fixed combination",
};
const FOLDS = [
  {
    label: "2025-H2",
    train: (race: Race) => race.raceDate <= "2025-06-30",
    test: (race: Race) => race.raceDate >= "2025-07-01" && race.raceDate <= "2025-12-31",
  },
  {
    label: "2026-H1",
    train: (race: Race) => race.raceDate < "2026-01-01",
    test: (race: Race) => race.raceDate >= "2026-01-01" && race.raceDate <= "2026-06-30",
  },
  {
    label: "2026-H2",
    train: (race: Race) => race.raceDate <= "2026-06-30",
    test: (race: Race) => race.raceDate >= "2026-07-01",
  },
];
const PERIODS = [
  { label: "2025", includes: (race: Race) => race.raceDate.startsWith("2025") },
  { label: "2026", includes: (race: Race) => race.raceDate.startsWith("2026") },
  { label: "2025-H1", includes: (race: Race) => race.raceDate <= "2025-06-30" },
  { label: "2025-H2", includes: (race: Race) => race.raceDate >= "2025-07-01" && race.raceDate <= "2025-12-31" },
  { label: "2026-H1", includes: (race: Race) => race.raceDate >= "2026-01-01" && race.raceDate <= "2026-06-30" },
  { label: "2026-H2", includes: (race: Race) => race.raceDate >= "2026-07-01" },
];
const SHORT_PRICE_BANDS = [
  { label: "odds-on", includes: (price: number) => price < 2 },
  { label: "evens to <6/4", includes: (price: number) => price >= 2 && price < 2.5 },
  { label: "6/4 to <2/1", includes: (price: number) => price >= 2.5 && price < 3 },
  { label: ">=2/1", includes: (price: number) => price >= 3 },
];
const CALIBRATION_BANDS = [
  { label: "<5%", low: 0, high: 0.05 },
  { label: "5-9.99%", low: 0.05, high: 0.1 },
  { label: "10-14.99%", low: 0.1, high: 0.15 },
  { label: "15-19.99%", low: 0.15, high: 0.2 },
  { label: "20-29.99%", low: 0.2, high: 0.3 },
  { label: "30%+", low: 0.3, high: 1.01 },
];

async function main() {
  const allRaces = await loadHistoricalRaces();
  const races = allRaces.filter((race): race is Race =>
    (race.family === "jump" || race.family === "aw") &&
    race.runners.length >= 2 &&
    !race.runners.some((runner) => !Number.isFinite(runner.finalSp) || runner.finalSp <= 1)
  );
  console.log(`Loaded ${races.length} Jump/AW historical races.`);
  const contexts = buildContexts(races);
  const byFamily = Object.fromEntries(FAMILIES.map((family) => [
    family,
    races.filter((race) => race.family === family),
  ])) as Record<FamilyId, Race[]>;
  const fitted = Object.fromEntries(FAMILIES.map((family) => [
    family,
    fitFamilyModels(family, byFamily[family], contexts),
  ])) as Report["fittedWeights"];
  const evaluations = Object.fromEntries(FAMILIES.map((family) => [
    family,
    Object.fromEntries(CANDIDATE_IDS.map((id) => [
      id,
      evaluateModel(fitted[family][id], byFamily[family], contexts),
    ])),
  ])) as Record<FamilyId, Record<CandidateId, EvaluatedRace[]>>;
  const summaries = mapFamilyCandidates(evaluations, metrics);
  const walkForward = Object.fromEntries(FAMILIES.map((family) => [
    family,
    walkForwardRows(family, byFamily[family], contexts),
  ])) as Report["walkForward"];
  const periods = Object.fromEntries(FAMILIES.map((family) => [
    family,
    periodRows(evaluations[family]),
  ])) as Report["periods"];
  const residualAssociations = Object.fromEntries(FAMILIES.map((family) => [
    family,
    associationRows(family, byFamily[family], contexts),
  ])) as Report["residualAssociations"];
  const subtypeSegments = Object.fromEntries(FAMILIES.map((family) => [
    family,
    segmentRows(family, evaluations[family]),
  ])) as Report["subtypeSegments"];
  const verdicts = Object.fromEntries(FAMILIES.map((family) => [
    family,
    verdictFor(family, summaries[family], walkForward[family], periods[family]),
  ])) as Report["verdicts"];
  const shortPrices = Object.fromEntries(FAMILIES.map((family) => [
    family,
    shortPriceRows(evaluations[family].R0, evaluations[family][verdicts[family].bestCandidate]),
  ])) as Report["shortPrices"];
  const overrides = Object.fromEntries(FAMILIES.map((family) => [
    family,
    Object.fromEntries(CANDIDATE_IDS.filter((id) => id !== "R0").map((id) => [
      id,
      overrideRows(evaluations[family].R0, evaluations[family][id]),
    ])),
  ])) as Report["overrides"];
  const calibration = Object.fromEntries(FAMILIES.map((family) => [
    family,
    {
      market: calibrationBands(evaluations[family].R0, "probability"),
      best: calibrationBands(evaluations[family][verdicts[family].bestCandidate], "probability"),
    },
  ])) as Report["calibration"];
  const report: Report = {
    generatedAt: new Date().toISOString(),
    methodology: {
      scope: "Jump and All Weather only. Turf Tissue v2 and Turf Forward Value are deliberately untouched.",
      baseline: "Final SP implied probabilities normalised within race are used as a retrospective market-only baseline. This is not prospectively available.",
      prospectiveConstraint: "A justified future shadow model must use timestamped bookmaker median probabilities available at capture time, never final SP or reconstructed prices.",
      modelForm: "Race-level conditional softmax: log(normalised market probability) is the fixed offset, and fitted coefficients learn only non-market residual adjustments.",
      chronology: "No random shuffle. Each validation fold trains only on earlier races.",
      tissueCaveat: "R2 uses cache-reconstructable current Tissue-style probability from the Stage 2 family scorebook, not a true frozen prospective Tissue probability archive.",
      productionSafety: "No trackers, model coefficients, Forward Value logic, production JSON files, or Turf artifacts are written.",
    },
    summaries,
    walkForward,
    periods,
    residualAssociations,
    subtypeSegments,
    shortPrices,
    overrides,
    calibration,
    verdicts,
    fittedWeights: fitted,
  };
  await writeFile(JSON_OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(MD_OUTPUT, renderMarkdown(report), "utf8");
  printTerminalSummary(report);
}

function fitFamilyModels(family: FamilyId, races: Race[], contexts: Map<string, RaceContext>) {
  return Object.fromEntries(CANDIDATE_IDS.map((id) => [
    id,
    fitModel(id, family, races, contexts),
  ])) as Record<CandidateId, FittedModel>;
}

function fitModel(id: CandidateId, family: FamilyId, races: Race[], contexts: Map<string, RaceContext>): FittedModel {
  const features = featuresFor(family).filter((feature) => featureNamesFor(id, family).includes(feature.name));
  if (id === "R0" || features.length === 0 || races.length === 0) {
    return { id, family, featureNames: features.map((feature) => feature.name), weights: features.map(() => 0) };
  }
  const weights = Array.from({ length: features.length }, () => 0);
  const lr = 0.032;
  const l2 = 0.02;
  for (let epoch = 0; epoch < 10; epoch++) {
    const gradient = Array.from({ length: features.length }, () => 0);
    for (const race of races) {
      const ctx = contexts.get(race.raceId)!;
      const rows = race.runners.map((runner) => features.map((feature) => valueOrZero(feature.value(runner, race, ctx))));
      const scores = race.runners.map((runner, index) => Math.log(ctx.market.get(runner.runnerId)!) + dot(rows[index]!, weights));
      const probabilities = softmax(scores);
      rows.forEach((row, index) => {
        const error = probabilities[index]! - (race.runners[index]!.won ? 1 : 0);
        row.forEach((value, j) => { gradient[j]! += error * value; });
      });
    }
    for (let j = 0; j < weights.length; j++) {
      weights[j]! -= lr * ((gradient[j]! / Math.max(races.length, 1)) + (l2 * weights[j]!));
    }
  }
  return { id, family, featureNames: features.map((feature) => feature.name), weights };
}

function evaluateModel(model: FittedModel, races: Race[], contexts: Map<string, RaceContext>): EvaluatedRace[] {
  const features = model.featureNames.map((name) => featuresFor(model.family).find((feature) => feature.name === name)!);
  return races.map((race) => {
    const ctx = contexts.get(race.raceId)!;
    const scores = race.runners.map((runner) =>
      Math.log(ctx.market.get(runner.runnerId)!) +
      dot(features.map((feature) => valueOrZero(feature.value(runner, race, ctx))), model.weights)
    );
    const probabilities = softmax(scores);
    const runners = race.runners.map((runner, index) => ({
      runner,
      probability: probabilities[index]!,
      marketProbability: ctx.market.get(runner.runnerId)!,
      score: scores[index]!,
    }));
    const ranking = [...runners].sort(compareEvaluatedRunners);
    const marketRanking = [...runners].sort((left, right) =>
      right.marketProbability - left.marketProbability ||
      left.runner.horseName.localeCompare(right.runner.horseName)
    );
    return { race, runners, ranking, marketRanking };
  });
}

function buildContexts(races: Race[]) {
  const contexts = new Map<string, RaceContext>();
  const stage2ByFamily = {
    jump: candidates.find((candidate) => candidate.id === "JUMP-R3")!,
    aw: candidates.find((candidate) => candidate.id === "AW-R3")!,
  };
  for (const race of races) {
    const rawMarket = race.runners.map((runner) => 1 / runner.finalSp);
    const marketTotal = sum(rawMarket);
    const market = new Map(race.runners.map((runner, index) => [runner.runnerId, rawMarket[index]! / marketTotal]));
    const tissue = evaluateRace(stage2ByFamily[race.family], race);
    contexts.set(race.raceId, {
      market,
      tissueProbability: tissue.probabilities,
      ratingScore: ratingScores(race),
    });
  }
  return contexts;
}

function ratingScores(race: Race) {
  if (race.family === "jump") {
    const ratings = calculateJumpRaceRatings(race.runners.map((runner) => ({
      runnerId: runner.runnerId,
      resultStatus: "runner",
      averageJumpSpeedLast3: numberFeature(runner, "averageJumpSpeedLast3"),
      trainerPriorStrikeRate: numberFeature(runner, "trainerPriorWinRate"),
      officialRating: numberFeature(runner, "officialRating"),
    })));
    return new Map(race.runners.map((runner) => [
      runner.runnerId,
      ratings.get(runner.runnerId)?.jprA?.score == null ? 0 : -ratings.get(runner.runnerId)!.jprA!.score,
    ]));
  }
  const ratings = calculateAwRaceRatings(race.runners.map((runner) => ({
    runnerId: runner.runnerId,
    resultStatus: "runner",
    averageAwSpeedLast3: numberFeature(runner, "averageAwSpeedLast3"),
    trainerPriorStrikeRate: numberFeature(runner, "trainerPriorWinRate"),
    jockeyPriorStrikeRate: numberFeature(runner, "jockeyPriorWinRate"),
  })));
  return new Map(race.runners.map((runner) => [
    runner.runnerId,
    ratings.get(runner.runnerId)?.awD?.score == null ? 0 : -ratings.get(runner.runnerId)!.awD!.score,
  ]));
}

function featuresFor(family: FamilyId): Feature[] {
  const prefix = family === "jump" ? "Jump" : "Aw";
  const common: Feature[] = [
    z("latest_speed", "latest speed", `latest${prefix}SpeedRating`),
    z("avg_l3_speed", "avg L3 speed", `average${prefix}SpeedLast3`),
    z("best_l3_speed", "best L3 speed", `best${prefix}SpeedLast3`),
    z("official_rating", "Official Rating", "officialRating"),
    { name: "or_missing", label: "OR missing indicator", value: (runner) => numberFeature(runner, "officialRating") === null ? 1 : 0 },
    z("trainer_prior_rate", "trainer prior rate", "trainerPriorWinRate"),
    { name: "trainer_depth", label: "log trainer prior runs/depth", value: (runner) => Math.log1p(valueOrZero(numberFeature(runner, "trainerPriorRuns"))) },
    z("jockey_prior_rate", "jockey prior rate", "jockeyPriorWinRate"),
    { name: "jockey_depth", label: "log jockey prior runs/depth", value: (runner) => Math.log1p(valueOrZero(numberFeature(runner, "jockeyPriorRuns"))) },
    { name: "history_depth", label: "prior starts/history depth", value: (runner) => Math.log1p(valueOrZero(numberFeature(runner, "priorRuns"))) },
    { name: "class", label: "class", value: (runner) => raceClassNumber(runner.features.raceClass) },
    z("weight", "weight", "weightCarriedLbs"),
    z("distance", "distance", "distanceYards"),
    { name: "days_since_run", label: "days since run", value: (runner, race) => zValue(runner, race, "daysSinceLastRun") },
    z("win_history", "prior win performance", "winPercentage"),
    z("place_history", "prior place performance", "placePercentage"),
    z("latest_performance", "latest performance/comment proxy", "latestPerformanceRating"),
    z("avg_l3_performance", "finishing effort/performance proxy", "averagePerformanceLast3"),
    { name: "weakening_proxy", label: "weakened/comment proxy", value: (runner) => /weak|fade|eased|outpaced|never/i.test(String(runner.features.raceName ?? "")) ? 1 : 0 },
    { name: "tissue_probability", label: "current Tissue-style proxy probability", value: (runner, _race, context) => logit(context.tissueProbability.get(runner.runnerId) ?? null) },
    { name: "rating_score", label: family === "jump" ? "JPR-A score/rank" : "AW-D score/rank", value: (runner, race, context) => zMapValue(runner.runnerId, race, context.ratingScore) },
  ];
  if (family === "jump") {
    return [
      ...common,
      { name: "hurdle_subtype", label: "hurdle subtype", value: (_runner, race) => race.subtype === "Hurdle" ? 1 : 0 },
      { name: "chase_subtype", label: "chase subtype", value: (_runner, race) => race.subtype === "Chase" ? 1 : 0 },
      { name: "nh_flat_subtype", label: "NH Flat monitoring subtype", value: (_runner, race) => race.subtype === "NH Flat" ? 1 : 0 },
      { name: "completion_risk_proxy", label: "completion/jumping risk proxy", value: (runner) => 1 - (valueOrZero(numberFeature(runner, "placePercentage")) / 100) },
      { name: "jumping_error_proxy", label: "jumping-error canonical proxy", value: (runner) => /jump|mistake|blunder|hamper/i.test(String(runner.features.raceName ?? "")) ? 1 : 0 },
    ];
  }
  return [
    ...common,
    z("draw", "draw", "draw"),
    { name: "surface_polytrack", label: "surface Polytrack", value: (runner) => /polytrack/i.test(String(runner.features.surface ?? "")) ? 1 : 0 },
    { name: "surface_tapeta", label: "surface Tapeta", value: (runner) => /tapeta/i.test(String(runner.features.surface ?? "")) ? 1 : 0 },
    { name: "surface_fibresand", label: "surface Fibresand", value: (runner) => /fibresand/i.test(String(runner.features.surface ?? "")) ? 1 : 0 },
    { name: "course_context", label: "course context", value: (runner) => hashBucket(String(runner.features.courseName ?? ""), 9) },
  ];
}

export function featureNamesFor(id: CandidateId, family: FamilyId): string[] {
  const core = [
    "latest_speed",
    "avg_l3_speed",
    "best_l3_speed",
    "official_rating",
    "or_missing",
    "trainer_prior_rate",
    "trainer_depth",
    "jockey_prior_rate",
    "jockey_depth",
    "class",
    "weight",
    "distance",
    "days_since_run",
    "history_depth",
  ];
  const comments = ["win_history", "place_history", "latest_performance", "avg_l3_performance", "weakening_proxy"];
  const familyContext = family === "jump"
    ? ["hurdle_subtype", "chase_subtype", "nh_flat_subtype", "completion_risk_proxy", "jumping_error_proxy"]
    : ["draw", "surface_polytrack", "surface_tapeta", "surface_fibresand", "course_context"];
  if (id === "R0") return [];
  if (id === "R1") return core;
  if (id === "R2") return [...core, "tissue_probability"];
  if (id === "R3") return [...core, "rating_score"];
  if (id === "R4") return [...core, ...comments, ...familyContext];
  return [...core, "tissue_probability", "rating_score", ...comments, ...familyContext];
}

function metrics(rows: EvaluatedRace[]): MetricSummary {
  const n = rows.length;
  const rank1 = rows.filter((row) => row.ranking[0]?.runner.won).length;
  return {
    races: n,
    runners: rows.reduce((total, row) => total + row.runners.length, 0),
    rank1Strike: rate(rank1, n),
    top2Capture: rate(rows.filter((row) => row.ranking.slice(0, 2).some((entry) => entry.runner.won)).length, n),
    top3Capture: rate(rows.filter((row) => row.ranking.slice(0, 3).some((entry) => entry.runner.won)).length, n),
    logLoss: average(rows.map((row) => -Math.log(Math.max(row.runners.find((entry) => entry.runner.won)?.probability ?? 1e-12, 1e-12)))),
    brier: average(rows.map((row) => row.runners.reduce((total, entry) => total + (entry.probability - (entry.runner.won ? 1 : 0)) ** 2, 0))),
    calibrationMae: calibrationMae(rows),
  };
}

function walkForwardRows(family: FamilyId, races: Race[], contexts: Map<string, RaceContext>): WalkForwardRow[] {
  return FOLDS.flatMap((fold) => {
    const train = races.filter(fold.train);
    const test = races.filter(fold.test);
    const models = fitFamilyModels(family, train, contexts);
    const baseline = metrics(evaluateModel(models.R0, test, contexts));
    return CANDIDATE_IDS.map((candidate) => {
      const m = metrics(evaluateModel(models[candidate], test, contexts));
      return {
        fold: fold.label,
        candidate,
        trainRaces: train.length,
        validationRaces: test.length,
        metrics: m,
        deltaLogLoss: diff(m.logLoss, baseline.logLoss),
        deltaBrier: diff(m.brier, baseline.brier),
        deltaRank1: diff(m.rank1Strike, baseline.rank1Strike),
        calibrationChange: diff(m.calibrationMae, baseline.calibrationMae),
      };
    });
  });
}

function periodRows(rows: Record<CandidateId, EvaluatedRace[]>): PeriodRow[] {
  return PERIODS.flatMap((period) => {
    const baseline = metrics(rows.R0.filter((row) => period.includes(row.race)));
    return CANDIDATE_IDS.map((candidate) => {
      const m = metrics(rows[candidate].filter((row) => period.includes(row.race)));
      return {
        period: period.label,
        candidate,
        metrics: m,
        deltaLogLoss: diff(m.logLoss, baseline.logLoss),
        deltaBrier: diff(m.brier, baseline.brier),
        deltaRank1: diff(m.rank1Strike, baseline.rank1Strike),
        calibrationChange: diff(m.calibrationMae, baseline.calibrationMae),
      };
    });
  });
}

function associationRows(family: FamilyId, races: Race[], contexts: Map<string, RaceContext>) {
  const featureNames = [...new Set(featureNamesFor("R5", family).filter((name) => name !== "tissue_probability" && name !== "rating_score"))];
  const featureMap = new Map(featuresFor(family).map((feature) => [feature.name, feature]));
  return featureNames.map((name) => {
    const feature = featureMap.get(name)!;
    const xs: number[] = [];
    const residuals: number[] = [];
    for (const race of races) {
      const ctx = contexts.get(race.raceId)!;
      for (const runner of race.runners) {
        xs.push(valueOrZero(feature.value(runner, race, ctx)));
        residuals.push((runner.won ? 1 : 0) - ctx.market.get(runner.runnerId)!);
      }
    }
    const correlation = pearson(xs, residuals);
    return {
      feature: feature.label,
      key: feature.name,
      direction: direction(correlation),
      correlation,
      stability: associationStability(feature, races, contexts),
    };
  }).sort((left, right) => Math.abs(right.correlation ?? 0) - Math.abs(left.correlation ?? 0));
}

function associationStability(feature: Feature, races: Race[], contexts: Map<string, RaceContext>) {
  const directions = ["2025", "2026"].map((year) => {
    const xs: number[] = [];
    const residuals: number[] = [];
    for (const race of races.filter((item) => item.raceDate.startsWith(year))) {
      const ctx = contexts.get(race.raceId)!;
      for (const runner of race.runners) {
        xs.push(valueOrZero(feature.value(runner, race, ctx)));
        residuals.push((runner.won ? 1 : 0) - ctx.market.get(runner.runnerId)!);
      }
    }
    return pearson(xs, residuals);
  });
  if (directions.some((value) => value === null || Math.abs(value) < 0.01)) return "too small to judge";
  if (Math.sign(directions[0]!) === Math.sign(directions[1]!)) return "same direction in 2025 and 2026";
  return "direction reverses";
}

function segmentRows(family: FamilyId, rows: Record<CandidateId, EvaluatedRace[]>) {
  const segments = family === "jump" ? ["Hurdle", "Chase", "NH Flat"] : [...new Set(rows.R0.map((row) => row.race.subtype))].sort();
  return segments.flatMap((segment) => {
    const baseline = metrics(rows.R0.filter((row) => row.race.subtype === segment));
    return CANDIDATE_IDS.map((candidate) => {
      const m = metrics(rows[candidate].filter((row) => row.race.subtype === segment));
      return { segment, candidate, metrics: m, deltaLogLoss: diff(m.logLoss, baseline.logLoss), deltaBrier: diff(m.brier, baseline.brier) };
    });
  });
}

function shortPriceRows(marketRows: EvaluatedRace[], residualRows: EvaluatedRace[]): ShortPriceRow[] {
  const byRace = new Map(residualRows.map((row) => [row.race.raceId, row]));
  return SHORT_PRICE_BANDS.map((band) => {
    const favourites = marketRows.flatMap((marketRow) => {
      const favourite = marketRow.marketRanking[0];
      const residualRow = byRace.get(marketRow.race.raceId);
      if (!favourite || !residualRow || !band.includes(favourite.runner.finalSp)) return [];
      const residualFavourite = residualRow.runners.find((entry) => entry.runner.runnerId === favourite.runner.runnerId);
      return residualFavourite ? [{ market: favourite, residual: residualFavourite }] : [];
    });
    const actualWinners = favourites.filter((row) => row.market.runner.won).length;
    const marketExpected = sum(favourites.map((row) => row.market.marketProbability));
    const residualExpected = sum(favourites.map((row) => row.residual.probability));
    const actual = rate(actualWinners, favourites.length);
    return {
      band: band.label,
      favourites: favourites.length,
      marketExpectedWinners: favourites.length ? marketExpected : null,
      residualExpectedWinners: favourites.length ? residualExpected : null,
      actualWinners,
      residualDirection: favourites.length ? residualExpected - marketExpected : null,
      marketCalibrationError: actual === null ? null : marketExpected / favourites.length - actual,
      residualCalibrationError: actual === null ? null : residualExpected / favourites.length - actual,
    };
  });
}

function overrideRows(marketRows: EvaluatedRace[], residualRows: EvaluatedRace[]): OverrideRow[] {
  const byRace = new Map(marketRows.map((row) => [row.race.raceId, row]));
  const groups = {
    agrees_with_market_favourite: [] as EvaluatedRace[],
    changes_rank1_away_from_market_favourite: [] as EvaluatedRace[],
  };
  for (const residual of residualRows) {
    const market = byRace.get(residual.race.raceId);
    if (!market) continue;
    const group = residual.ranking[0]!.runner.runnerId === market.marketRanking[0]!.runner.runnerId
      ? "agrees_with_market_favourite"
      : "changes_rank1_away_from_market_favourite";
    groups[group].push(residual);
  }
  return (Object.keys(groups) as Array<keyof typeof groups>).map((group) => {
    const rows = groups[group];
    const winners = rows.filter((row) => row.ranking[0]!.runner.won).length;
    return {
      group,
      races: rows.length,
      winners,
      strike: rate(winners, rows.length),
      marketExpectedWinners: rows.length ? sum(rows.map((row) => row.ranking[0]!.marketProbability)) : null,
      combinedExpectedWinners: rows.length ? sum(rows.map((row) => row.ranking[0]!.probability)) : null,
      logLoss: metrics(rows).logLoss,
    };
  });
}

function calibrationBands(rows: EvaluatedRace[], field: "probability" | "marketProbability"): CalibrationBandRow[] {
  const runners = rows.flatMap((row) => row.runners);
  return CALIBRATION_BANDS.map((band) => {
    const subset = runners.filter((entry) => entry[field] >= band.low && entry[field] < band.high);
    return {
      band: band.label,
      runners: subset.length,
      meanPredicted: average(subset.map((entry) => entry[field])),
      actualStrike: rate(subset.filter((entry) => entry.runner.won).length, subset.length),
    };
  });
}

function verdictFor(
  _family: FamilyId,
  summaries: Record<CandidateId, MetricSummary>,
  folds: WalkForwardRow[],
  periods: PeriodRow[],
): Verdict {
  const ranked = CANDIDATE_IDS.filter((id) => id !== "R0")
    .map((id) => ({
      id,
      metrics: summaries[id],
      deltaLogLoss: diff(summaries[id].logLoss, summaries.R0.logLoss),
      deltaBrier: diff(summaries[id].brier, summaries.R0.brier),
      improvedFolds: folds.filter((row) => row.candidate === id && (row.deltaLogLoss ?? 1) < 0 && (row.deltaBrier ?? 1) < 0).length,
      improvedYears: ["2025", "2026"].filter((year) => {
        const row = periods.find((entry) => entry.period === year && entry.candidate === id);
        return (row?.deltaLogLoss ?? 1) < 0 && (row?.deltaBrier ?? 1) < 0;
      }).length,
    }))
    .sort((left, right) =>
      (right.improvedFolds - left.improvedFolds) ||
      (right.improvedYears - left.improvedYears) ||
      (left.deltaLogLoss ?? Infinity) - (right.deltaLogLoss ?? Infinity) ||
      CANDIDATE_IDS.indexOf(left.id) - CANDIDATE_IDS.indexOf(right.id)
    );
  const best = ranked[0]!;
  const logDelta = best.deltaLogLoss;
  const brierDelta = best.deltaBrier;
  const classification = logDelta !== null && brierDelta !== null && logDelta < -0.006 && brierDelta < -0.002 && best.improvedFolds >= 3 && best.improvedYears === 2
    ? "STRONG REPLICATED SIGNAL"
    : logDelta !== null && brierDelta !== null && logDelta < -0.0015 && brierDelta < 0 && best.improvedFolds >= 2 && best.improvedYears === 2
      ? "MODEST REPLICATED SIGNAL"
      : best.improvedFolds > 0 || (logDelta !== null && logDelta < 0)
        ? "WEAK / UNSTABLE"
        : "NO INCREMENTAL SIGNAL";
  const rationale = classification === "MODEST REPLICATED SIGNAL" || classification === "STRONG REPLICATED SIGNAL"
    ? "Repeated improvement across chronological folds and both 2025 and 2026 clears the shadow-model threshold."
    : "Improvement is absent, too small, or period-dependent, so a prospective shadow model is not justified.";
  return {
    classification,
    bestCandidate: best.id,
    rationale,
    improvedFolds: best.improvedFolds,
    improvedYears: best.improvedYears,
    bestDeltaLogLoss: logDelta,
    bestDeltaBrier: brierDelta,
  };
}

function renderMarkdown(report: Report) {
  const lines: string[] = [
    "# Jump/AW Residual Model Stage 4",
    "",
    `Generated ${report.generatedAt}. Research diagnostic only.`,
    "",
    "Turf is deliberately excluded. Turf Tissue v2, Turf coefficients, Turf trackers and Turf Forward Value logic are unchanged.",
    "",
    "## Executive Summary",
    "",
  ];
  for (const family of FAMILIES) {
    const verdict = report.verdicts[family];
    lines.push(`- ${FAMILY_LABEL[family]}: ${verdict.classification}. Best diagnostic candidate ${verdict.bestCandidate} (${CANDIDATE_LABEL[verdict.bestCandidate]}), delta log loss ${fmtSigned(verdict.bestDeltaLogLoss)}, delta Brier ${fmtSigned(verdict.bestDeltaBrier)}, improved folds ${verdict.improvedFolds}/3, improved years ${verdict.improvedYears}/2. ${verdict.rationale}`);
  }
  lines.push(
    "",
    "Final SP is used only as a retrospective market baseline. A future prospective implementation would need timestamped bookmaker-median probabilities captured before the race. R2 Tissue is a cache-reconstructable proxy, not evidence from a true frozen prospective Tissue-probability archive.",
    "",
  );
  sectionTable(lines, "Market Baseline", ["Family", "Races", "Runners", "Rank-1", "Top-2", "Top-3", "Log loss", "Brier", "Calibration MAE"], FAMILIES.map((family) => metricRow(FAMILY_LABEL[family], report.summaries[family].R0)));
  for (const family of FAMILIES) {
    sectionTable(lines, `${FAMILY_LABEL[family]} Candidate Results`, ["Candidate", "Description", "Races", "Rank-1", "Top-2", "Top-3", "Log loss", "Delta LL", "Brier", "Delta Brier", "Calibration MAE"], CANDIDATE_IDS.map((id) => {
      const m = report.summaries[family][id];
      const b = report.summaries[family].R0;
      return [id, CANDIDATE_LABEL[id], m.races, pct(m.rank1Strike), pct(m.top2Capture), pct(m.top3Capture), fmt(m.logLoss), fmtSigned(diff(m.logLoss, b.logLoss)), fmt(m.brier), fmtSigned(diff(m.brier, b.brier)), fmt(m.calibrationMae)];
    }));
  }
  sectionTable(lines, "Tissue Incremental Test", ["Family", "Delta log loss", "Delta Brier", "Rank-1 change", "Verdict"], FAMILIES.map((family) => deltaLabelRow(family, "R2", report)));
  sectionTable(lines, "Current Rating Incremental Test", ["Family", "Rating", "Delta log loss", "Delta Brier", "Rank-1 change", "Verdict"], FAMILIES.map((family) => [FAMILY_LABEL[family], family === "jump" ? "JPR-A" : "AW-D", ...deltaLabelRow(family, "R3", report).slice(1)]));
  sectionTable(lines, "Walk-Forward Metrics", ["Family", "Fold", "Candidate", "Train", "Validation", "Races", "Log loss", "Delta LL", "Brier", "Delta Brier", "Rank-1", "Rank-1 change", "Calibration change"], FAMILIES.flatMap((family) => report.walkForward[family].map((row) => [FAMILY_LABEL[family], row.fold, row.candidate, row.trainRaces, row.validationRaces, row.metrics.races, fmt(row.metrics.logLoss), fmtSigned(row.deltaLogLoss), fmt(row.metrics.brier), fmtSigned(row.deltaBrier), pct(row.metrics.rank1Strike), fmtSigned(row.deltaRank1), fmtSigned(row.calibrationChange)])));
  sectionTable(lines, "Year And Period Stability", ["Family", "Period", "Candidate", "Delta LL", "Delta Brier", "Rank-1 change", "Calibration change", "Flag"], FAMILIES.flatMap((family) => report.periods[family].filter((row) => row.candidate !== "R0").map((row) => [FAMILY_LABEL[family], row.period, row.candidate, fmtSigned(row.deltaLogLoss), fmtSigned(row.deltaBrier), fmtSigned(row.deltaRank1), fmtSigned(row.calibrationChange), stabilityFlag(row)])));
  sectionTable(lines, "Jump Hurdle/Chase And Monitoring Segments", ["Family", "Segment", "Candidate", "Races", "Delta LL", "Delta Brier", "Rank-1"], report.subtypeSegments.jump.map((row) => ["Jump", row.segment, row.candidate, row.metrics.races, fmtSigned(row.deltaLogLoss), fmtSigned(row.deltaBrier), pct(row.metrics.rank1Strike)]));
  sectionTable(lines, "AW Surface Segments", ["Family", "Surface", "Candidate", "Races", "Delta LL", "Delta Brier", "Rank-1"], report.subtypeSegments.aw.map((row) => ["All Weather", row.segment, row.candidate, row.metrics.races, fmtSigned(row.deltaLogLoss), fmtSigned(row.deltaBrier), pct(row.metrics.rank1Strike)]));
  sectionTable(lines, "Feature Residual Associations", ["Family", "Feature", "Direction", "Correlation", "Stability"], FAMILIES.flatMap((family) => report.residualAssociations[family].slice(0, 18).map((row) => [FAMILY_LABEL[family], row.feature, row.direction, fmt(row.correlation), row.stability])));
  for (const family of FAMILIES) {
    sectionTable(lines, `${FAMILY_LABEL[family]} Short-Price Favourite Diagnostic (${report.verdicts[family].bestCandidate})`, ["Band", "Favourites", "Market expected", "Residual expected", "Actual", "Residual direction", "Market cal err", "Residual cal err"], report.shortPrices[family].map((row) => [row.band, row.favourites, fmt(row.marketExpectedWinners), fmt(row.residualExpectedWinners), row.actualWinners, fmtSigned(row.residualDirection), fmtSigned(row.marketCalibrationError), fmtSigned(row.residualCalibrationError)]));
  }
  for (const family of FAMILIES) {
    sectionTable(lines, `${FAMILY_LABEL[family]} Market Override Analysis`, ["Candidate", "Group", "Races", "Winners", "Strike", "Market expected", "Combined expected", "Log loss"], CANDIDATE_IDS.filter((id) => id !== "R0").flatMap((id) => report.overrides[family][id].map((row) => [id, row.group, row.races, row.winners, pct(row.strike), fmt(row.marketExpectedWinners), fmt(row.combinedExpectedWinners), fmt(row.logLoss)])));
  }
  for (const family of FAMILIES) {
    sectionTable(lines, `${FAMILY_LABEL[family]} Calibration Bands`, ["Model", "Band", "Runners", "Mean predicted", "Actual strike"], [
      ...report.calibration[family].market.map((row) => ["Market", row.band, row.runners, pct(row.meanPredicted), pct(row.actualStrike)]),
      ...report.calibration[family].best.map((row) => [`Best ${report.verdicts[family].bestCandidate}`, row.band, row.runners, pct(row.meanPredicted), pct(row.actualStrike)]),
    ]);
  }
  lines.push(
    "## Recommendation",
    "",
    "Create no production residual model unless the family classification is at least MODEST REPLICATED SIGNAL. Even then, the next step is a prospective shadow using timestamped bookmaker-median capture probabilities, not final SP. Do not convert short-price findings into avoid-favourite betting rules.",
    "",
  );
  return `${lines.join("\n").trimEnd()}\n`;
}

function printTerminalSummary(report: Report) {
  for (const family of FAMILIES) {
    const verdict = report.verdicts[family];
    const base = report.summaries[family].R0;
    const best = report.summaries[family][verdict.bestCandidate];
    console.log(`${FAMILY_LABEL[family]} baseline log loss: ${fmt(base.logLoss)}`);
    console.log(`${FAMILY_LABEL[family]} best ${verdict.bestCandidate} log loss: ${fmt(best.logLoss)} (${fmtSigned(verdict.bestDeltaLogLoss)})`);
    console.log(`${FAMILY_LABEL[family]} best Brier delta: ${fmtSigned(verdict.bestDeltaBrier)}`);
    console.log(`${FAMILY_LABEL[family]} verdict: ${verdict.classification}`);
    console.log("");
  }
  console.log(`Wrote ${MD_OUTPUT}`);
  console.log(`Wrote ${JSON_OUTPUT}`);
}

function mapFamilyCandidates<T>(input: Record<FamilyId, Record<CandidateId, EvaluatedRace[]>>, fn: (rows: EvaluatedRace[]) => T) {
  return Object.fromEntries(FAMILIES.map((family) => [
    family,
    Object.fromEntries(CANDIDATE_IDS.map((id) => [id, fn(input[family][id])])),
  ])) as Record<FamilyId, Record<CandidateId, T>>;
}

function z(name: string, label: string, key: string): Feature {
  return { name, label, value: (runner, race) => zValue(runner, race, key) };
}

function zValue(runner: Runner, race: Race, key: string) {
  const value = numberFeature(runner, key);
  const values = race.runners.map((item) => numberFeature(item, key)).filter(isNumber);
  if (value === null || values.length < 2) return null;
  const mean = average(values);
  const sd = Math.sqrt(average(values.map((item) => (item - mean!) ** 2)) ?? 0);
  return sd > 0 && mean !== null ? (value - mean) / sd : 0;
}

function zMapValue(runnerId: string, race: Race, values: Map<string, number>) {
  const value = values.get(runnerId);
  const field = race.runners.map((runner) => values.get(runner.runnerId)).filter(isNumber);
  if (value === undefined || field.length < 2) return null;
  const mean = average(field)!;
  const sd = Math.sqrt(average(field.map((item) => (item - mean) ** 2)) ?? 0);
  return sd > 0 ? (value - mean) / sd : 0;
}

function numberFeature(runner: Runner, key: string) {
  const value = runner.features[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function valueOrZero(value: number | null | undefined) {
  return value !== null && value !== undefined && Number.isFinite(value) ? value : 0;
}

function hashBucket(value: string, buckets: number) {
  let hash = 0;
  for (const char of value) hash = ((hash * 31) + char.charCodeAt(0)) | 0;
  return ((Math.abs(hash) % buckets) / Math.max(1, buckets - 1)) - 0.5;
}

function logit(value: number | null) {
  if (value === null || !Number.isFinite(value)) return null;
  const p = Math.min(0.999, Math.max(0.001, value));
  return Math.log(p / (1 - p));
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

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function rate(numerator: number, denominator: number) {
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

function calibrationMae(rows: EvaluatedRace[]) {
  const errors = CALIBRATION_BANDS.map((band) =>
    rows.flatMap((row) => row.runners.filter((entry) => entry.probability >= band.low && entry.probability < band.high))
  )
    .filter((band) => band.length >= 20)
    .map((band) => Math.abs(average(band.map((entry) => entry.probability))! - average(band.map((entry) => entry.runner.won ? 1 : 0))!));
  return average(errors);
}

function compareEvaluatedRunners(left: EvaluatedRunner, right: EvaluatedRunner) {
  return right.probability - left.probability || left.runner.horseName.localeCompare(right.runner.horseName);
}

function direction(value: number | null) {
  if (value === null || Math.abs(value) < 0.005) return "flat";
  return value > 0 ? "positive" : "negative";
}

function signalLabel(deltaLogLoss: number | null, deltaBrier: number | null) {
  if (deltaLogLoss !== null && deltaBrier !== null && deltaLogLoss < -0.0015 && deltaBrier < 0) return "possible stable improvement";
  if ((deltaLogLoss ?? 1) < 0 || (deltaBrier ?? 1) < 0) return "weak / unstable";
  return "no improvement";
}

function stabilityFlag(row: PeriodRow) {
  if ((row.deltaLogLoss ?? 1) < 0 && (row.deltaBrier ?? 1) < 0) return "improves this period";
  if ((row.deltaLogLoss ?? 0) > 0 && (row.deltaBrier ?? 0) > 0) return "worse this period";
  return "too small to judge";
}

function metricRow(label: string, m: MetricSummary) {
  return [label, m.races, m.runners, pct(m.rank1Strike), pct(m.top2Capture), pct(m.top3Capture), fmt(m.logLoss), fmt(m.brier), fmt(m.calibrationMae)];
}

function deltaLabelRow(family: FamilyId, id: CandidateId, report: Report) {
  const m = report.summaries[family][id];
  const b = report.summaries[family].R0;
  const ll = diff(m.logLoss, b.logLoss);
  const br = diff(m.brier, b.brier);
  return [FAMILY_LABEL[family], fmtSigned(ll), fmtSigned(br), fmtSigned(diff(m.rank1Strike, b.rank1Strike)), signalLabel(ll, br)];
}

function sectionTable(lines: string[], title: string, headers: string[], rows: Array<Array<string | number | null>>) {
  if (title) lines.push(`## ${title}`, "");
  lines.push(`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`);
  for (const row of rows) lines.push(`| ${row.map((value) => value ?? "n/a").join(" | ")} |`);
  lines.push("");
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

if (process.argv[1]?.endsWith("diagnose-jump-aw-residual-model-stage4.ts")) await main();
