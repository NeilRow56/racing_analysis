import { writeFile } from "node:fs/promises";
import { calculateAwRaceRatings } from "@/lib/racing/aw-performance-rating";
import { calculateJumpRaceRatings } from "@/lib/racing/jump-performance-rating";
import { calculateTurfPerformanceRating, rankTurfPerformanceRatings } from "@/lib/racing/turf-performance-rating";
import { raceClassNumber } from "@/lib/racing/research-rule-classes";
import { candidates, evaluateRace, loadHistoricalRaces } from "./build-ranking-model-stage2";

type FamilyId = "turf" | "jump" | "aw";
type Race = Awaited<ReturnType<typeof loadHistoricalRaces>>[number];
type Runner = Race["runners"][number];
type ModelId = "M0" | "M1" | "M2" | "M3" | "M4" | "M5" | "M6" | "M7";
type Feature = { name: string; value: (runner: Runner, race: Race, context: RaceContext) => number | null };
type RaceContext = {
  market: Map<string, number>;
  stage2Probability: Map<string, number>;
  ratingScore: Map<string, number>;
};
type FittedModel = { id: ModelId; family: FamilyId; featureNames: string[]; weights: number[] };
type EvaluatedRunner = { runner: Runner; probability: number; marketProbability: number; score: number };
type EvaluatedRace = { race: Race; runners: EvaluatedRunner[]; ranking: EvaluatedRunner[]; marketRanking: Runner[] };
type MetricSummary = {
  races: number;
  rank1Strike: number | null;
  top2Capture: number | null;
  top3Capture: number | null;
  logLoss: number | null;
  brier: number | null;
  calibrationMae: number | null;
};
type Stage3Report = {
  generatedAt: string;
  summaries: Record<FamilyId, Record<ModelId, MetricSummary>>;
  byYear: Record<FamilyId, Record<ModelId, Record<string, MetricSummary>>>;
  walkForward: Record<FamilyId, WalkForwardRow[]>;
  residualAssociations: Record<FamilyId, ReturnType<typeof associationRows>>;
  interactions: Record<FamilyId, ReturnType<typeof interactionRows>>;
  shortPrices: Record<FamilyId, ReturnType<typeof shortPriceRows>>;
  verdicts: Record<FamilyId, ReturnType<typeof verdictFor>>;
};

const MD_OUTPUT = "/tmp/ranking-market-residual-stage3.md";
const JSON_OUTPUT = "/tmp/ranking-market-residual-stage3.json";
const FAMILIES: FamilyId[] = ["turf", "jump", "aw"];
const FAMILY_LABEL: Record<FamilyId, string> = { turf: "Turf", jump: "Jump", aw: "All Weather" };
const MODEL_LABEL: Record<ModelId, string> = {
  M0: "Market probability only",
  M1: "Market + speed/performance",
  M2: "Market + OR + speed/performance",
  M3: "Market + trainer/jockey",
  M4: "Market + comments/history context proxies",
  M5: "Market + all stable non-market cache features",
  M6: "Market + current Tissue-proxy probability",
  M7: "Market + current rating score/rank",
};
const MODEL_IDS: ModelId[] = ["M0", "M1", "M2", "M3", "M4", "M5", "M6", "M7"];
const SHORT_BANDS = [
  { label: "odds-on", includes: (price: number) => price < 2 },
  { label: "evens-<6/4", includes: (price: number) => price >= 2 && price < 2.5 },
  { label: "6/4-<2/1", includes: (price: number) => price >= 2.5 && price < 3 },
];
const FOLDS = [
  { label: "2025-H2", train: (race: Race) => race.raceDate <= "2025-06-30", test: (race: Race) => race.raceDate >= "2025-07-01" && race.raceDate <= "2025-12-31" },
  { label: "2026-H1", train: (race: Race) => race.raceDate < "2026-01-01", test: (race: Race) => race.raceDate >= "2026-01-01" && race.raceDate <= "2026-06-30" },
  { label: "2026-H2", train: (race: Race) => race.raceDate <= "2026-06-30", test: (race: Race) => race.raceDate >= "2026-07-01" },
];

async function main() {
  const races = (await loadHistoricalRaces()).filter((race) => race.runners.length >= 2);
  console.log(`Loaded ${races.length} historical races.`);
  const contexts = buildContexts(races);
  const byFamily = Object.fromEntries(FAMILIES.map((family) => [family, races.filter((race) => race.family === family)])) as Record<FamilyId, Race[]>;
  console.log("Fitting family market-offset models.");
  const fitted = Object.fromEntries(FAMILIES.map((family) => [family, fitFamilyModels(family, byFamily[family], contexts)])) as Record<FamilyId, Record<ModelId, FittedModel>>;
  const evaluations = Object.fromEntries(FAMILIES.map((family) => [family, Object.fromEntries(MODEL_IDS.map((id) => [id, evaluateModel(fitted[family][id], byFamily[family], contexts)]))])) as Record<FamilyId, Record<ModelId, EvaluatedRace[]>>;
  const summaries = mapFamilyModels(evaluations, metrics);
  const byYear = mapFamilyModels(evaluations, (rows) => Object.fromEntries(["2025", "2026"].map((year) => [year, metrics(rows.filter((row) => row.race.raceDate.startsWith(year)))])));
  console.log("Running chronological folds.");
  const walkForward = Object.fromEntries(FAMILIES.map((family) => [family, walkForwardRows(family, byFamily[family], contexts)])) as Stage3Report["walkForward"];
  const residualAssociations = Object.fromEntries(FAMILIES.map((family) => [family, associationRows(family, byFamily[family], contexts)])) as Stage3Report["residualAssociations"];
  const interactions = Object.fromEntries(FAMILIES.map((family) => [family, interactionRows(family, byFamily[family], contexts)])) as Stage3Report["interactions"];
  const overrides = Object.fromEntries(FAMILIES.map((family) => [family, overrideRows(evaluations[family])]));
  const shortPrices = Object.fromEntries(FAMILIES.map((family) => [family, shortPriceRows(byFamily[family], contexts)])) as Stage3Report["shortPrices"];
  const verdicts = Object.fromEntries(FAMILIES.map((family) => [family, verdictFor(summaries[family], walkForward[family])])) as Stage3Report["verdicts"];
  const report = {
    generatedAt: new Date().toISOString(),
    methodology: {
      marketBaseline: "Final SP implied probabilities normalised within race; retrospective only.",
      featureModel: "Conditional softmax with log(normalised market probability) as an offset/control. Lower log loss/Brier is better.",
      chronology: "No random split. Walk-forward folds train only on earlier chronological periods.",
      productionSafety: "No production models, trackers, settlement, price history or Forward Value artifacts are mutated.",
      tissueCaveat: "M6 uses the nearest cache-reconstructable current Tissue-style probability proxy from the Stage 2 family scorebook, not a prospective frozen bookmaker-price record.",
    },
    summaries,
    byYear,
    walkForward,
    residualAssociations,
    interactions,
    overrides,
    shortPrices,
    verdicts,
    fittedWeights: fitted,
  };
  await writeFile(JSON_OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(MD_OUTPUT, renderMarkdown(report), "utf8");
  printTerminalSummary(summaries, verdicts);
}

function fitFamilyModels(family: FamilyId, races: Race[], contexts: Map<string, RaceContext>) {
  const features = featuresFor(family);
  console.log(`  ${FAMILY_LABEL[family]}: fitting ${races.length} races.`);
  const models = Object.fromEntries(MODEL_IDS.map((id) => {
    const names = modelFeatureNames(id, family, features);
    return [id, fitModel(id, family, races, contexts, features.filter((feature) => names.includes(feature.name)))];
  })) as Record<ModelId, FittedModel>;
  return models;
}

function fitModel(id: ModelId, family: FamilyId, races: Race[], contexts: Map<string, RaceContext>, features: Feature[]): FittedModel {
  if (id === "M0" || features.length === 0 || races.length === 0) return { id, family, featureNames: features.map((feature) => feature.name), weights: features.map(() => 0) };
  const weights = Array.from({ length: features.length }, () => 0);
  const lr = 0.035;
  const l2 = 0.015;
  for (let epoch = 0; epoch < 8; epoch++) {
    const gradient = Array.from({ length: features.length }, () => 0);
    for (const race of races) {
      const ctx = contexts.get(race.raceId)!;
      const rows = race.runners.map((runner) => features.map((feature) => valueOrZero(feature.value(runner, race, ctx))));
      const scores = race.runners.map((runner, i) => Math.log(ctx.market.get(runner.runnerId)!) + dot(rows[i]!, weights));
      const probabilities = softmax(scores);
      rows.forEach((row, i) => {
        const error = probabilities[i]! - (race.runners[i]!.won ? 1 : 0);
        row.forEach((value, j) => { gradient[j]! += error * value; });
      });
    }
    for (let j = 0; j < weights.length; j++) {
      weights[j]! -= lr * ((gradient[j]! / races.length) + (l2 * weights[j]!));
    }
  }
  return { id, family, featureNames: features.map((feature) => feature.name), weights };
}

function evaluateModel(model: FittedModel, races: Race[], contexts: Map<string, RaceContext>): EvaluatedRace[] {
  const allFeatures = featuresFor(model.family);
  const features = model.featureNames.map((name) => allFeatures.find((feature) => feature.name === name)!);
  return races.map((race) => {
    const ctx = contexts.get(race.raceId)!;
    const scores = race.runners.map((runner) => Math.log(ctx.market.get(runner.runnerId)!) + dot(features.map((feature) => valueOrZero(feature.value(runner, race, ctx))), model.weights));
    const probabilities = softmax(scores);
    const runners = race.runners.map((runner, i) => ({ runner, probability: probabilities[i]!, marketProbability: ctx.market.get(runner.runnerId)!, score: scores[i]! }));
    return {
      race,
      runners,
      ranking: [...runners].sort((left, right) => right.probability - left.probability || left.runner.horseName.localeCompare(right.runner.horseName)),
      marketRanking: [...race.runners].sort((left, right) => ctx.market.get(right.runnerId)! - ctx.market.get(left.runnerId)! || left.horseName.localeCompare(right.horseName)),
    };
  });
}

function metrics(rows: EvaluatedRace[]): MetricSummary {
  const n = rows.length;
  const rank1 = rows.filter((row) => row.ranking[0]?.runner.won).length;
  return {
    races: n,
    rank1Strike: rate(rank1, n),
    top2Capture: rate(rows.filter((row) => row.ranking.slice(0, 2).some((entry) => entry.runner.won)).length, n),
    top3Capture: rate(rows.filter((row) => row.ranking.slice(0, 3).some((entry) => entry.runner.won)).length, n),
    logLoss: average(rows.map((row) => -Math.log(Math.max(row.runners.find((entry) => entry.runner.won)?.probability ?? 1e-12, 1e-12)))),
    brier: average(rows.map((row) => row.runners.reduce((sum, entry) => sum + (entry.probability - (entry.runner.won ? 1 : 0)) ** 2, 0))),
    calibrationMae: calibrationMae(rows),
  };
}

function buildContexts(races: Race[]) {
  const contexts = new Map<string, RaceContext>();
  const stage2ByFamily = {
    turf: candidates.find((candidate) => candidate.id === "TURF-R3")!,
    jump: candidates.find((candidate) => candidate.id === "JUMP-R3")!,
    aw: candidates.find((candidate) => candidate.id === "AW-R3")!,
  };
  for (const race of races) {
    const rawMarket = race.runners.map((runner) => 1 / runner.finalSp);
    const marketTotal = rawMarket.reduce((sum, value) => sum + value, 0);
    const market = new Map(race.runners.map((runner, i) => [runner.runnerId, rawMarket[i]! / marketTotal]));
    const stage2 = evaluateRace(stage2ByFamily[race.family], race);
    contexts.set(race.raceId, {
      market,
      stage2Probability: stage2.probabilities,
      ratingScore: ratingScores(race),
    });
  }
  return contexts;
}

function ratingScores(race: Race) {
  if (race.family === "turf") {
    const medianWeight = median(race.runners.map((runner) => numberFeature(runner, "weightCarriedLbs")).filter(isNumber));
    const ranked = rankTurfPerformanceRatings(race.runners.map((runner) => ({
      id: runner.runnerId,
      rating: calculateTurfPerformanceRating({
        latestPerformanceRating: numberFeature(runner, "latestPerformanceRating"),
        previousPerformanceRating: numberFeature(runner, "previousPerformanceRating"),
        averagePerformanceLast3: numberFeature(runner, "averagePerformanceLast3"),
        latestSpeedRating: numberFeature(runner, "latestTurfSpeedRating"),
        previousSpeedRating: numberFeature(runner, "previousTurfSpeedRating"),
        averageSpeedLast3: numberFeature(runner, "averageTurfSpeedLast3"),
        raceClass: stringOrNull(runner.features.raceClass),
        weightCarriedLbs: numberFeature(runner, "weightCarriedLbs"),
        raceMedianWeightCarriedLbs: medianWeight,
      }),
    })));
    return new Map(race.runners.map((runner) => [runner.runnerId, ranked.get(runner.runnerId)?.rating ?? 0]));
  }
  if (race.family === "jump") {
    const ratings = calculateJumpRaceRatings(race.runners.map((runner) => ({ runnerId: runner.runnerId, resultStatus: "runner", averageJumpSpeedLast3: numberFeature(runner, "averageJumpSpeedLast3"), trainerPriorStrikeRate: numberFeature(runner, "trainerPriorWinRate"), officialRating: numberFeature(runner, "officialRating") })));
    return new Map(race.runners.map((runner) => [runner.runnerId, ratings.get(runner.runnerId)?.jprA?.score == null ? 0 : -ratings.get(runner.runnerId)!.jprA!.score]));
  }
  const ratings = calculateAwRaceRatings(race.runners.map((runner) => ({ runnerId: runner.runnerId, resultStatus: "runner", averageAwSpeedLast3: numberFeature(runner, "averageAwSpeedLast3"), trainerPriorStrikeRate: numberFeature(runner, "trainerPriorWinRate"), jockeyPriorStrikeRate: numberFeature(runner, "jockeyPriorWinRate") })));
  return new Map(race.runners.map((runner) => [runner.runnerId, ratings.get(runner.runnerId)?.awD?.score == null ? 0 : -ratings.get(runner.runnerId)!.awD!.score]));
}

function featuresFor(family: FamilyId): Feature[] {
  const prefix = family === "turf" ? "Turf" : family === "jump" ? "Jump" : "Aw";
  return [
    z(`latest_speed`, `latest${prefix}SpeedRating`),
    z(`avg_l3_speed`, `average${prefix}SpeedLast3`),
    z(`best_l3_speed`, `best${prefix}SpeedLast3`),
    z("latest_performance", "latestPerformanceRating"),
    z("avg_l3_performance", "averagePerformanceLast3"),
    z("official_rating", "officialRating"),
    z("trainer_prior_rate", "trainerPriorWinRate"),
    z("trainer_history_depth", "trainerPriorRuns"),
    z("jockey_prior_rate", "jockeyPriorWinRate"),
    z("jockey_history_depth", "jockeyPriorRuns"),
    z("history_depth", "priorRuns"),
    { name: "recency", value: (runner, race) => -valueOrZero(zValue(runner, race, "daysSinceLastRun")) },
    { name: "class", value: (runner) => raceClassNumber(runner.features.raceClass) },
    z("distance", "distanceYards"),
    { name: "weight", value: (runner, race) => -valueOrZero(zValue(runner, race, "weightCarriedLbs")) },
    { name: "draw", value: (runner, race) => -valueOrZero(zValue(runner, race, "draw")) },
    z("win_history", "winPercentage"),
    z("place_history", "placePercentage"),
    { name: "weakening_proxy", value: (runner) => /weak|fade|eased|outpaced|never/i.test(String(runner.features.raceName ?? "")) ? 1 : 0 },
    { name: "handicap_context", value: (_runner, race) => race.handicap ? 1 : 0 },
    { name: "going_soft", value: (runner) => /soft|heavy/i.test(String(runner.features.going ?? "")) ? 1 : 0 },
    { name: "surface_polytrack", value: (runner) => /polytrack/i.test(String(runner.features.surface ?? "")) ? 1 : 0 },
    { name: "surface_tapeta", value: (runner) => /tapeta/i.test(String(runner.features.surface ?? "")) ? 1 : 0 },
    { name: "course_context", value: (runner) => hashBucket(String(runner.features.courseName ?? ""), 7) },
    { name: "hurdle_context", value: (_runner, race) => race.subtype === "Hurdle" ? 1 : 0 },
    { name: "chase_context", value: (_runner, race) => race.subtype === "Chase" ? 1 : 0 },
    { name: "completion_proxy", value: (runner) => valueOrZero(numberFeature(runner, "placePercentage")) },
    { name: "tissue_probability", value: (runner, _race, context) => logit(context.stage2Probability.get(runner.runnerId) ?? null) },
    { name: "rating_score", value: (runner, race, context) => zMapValue(runner.runnerId, race, context.ratingScore) },
  ];
}

function modelFeatureNames(id: ModelId, family: FamilyId, features: Feature[]) {
  if (id === "M0") return [];
  const speed = ["latest_speed", "avg_l3_speed", "best_l3_speed", "latest_performance", "avg_l3_performance"];
  const orSpeed = [...speed, "official_rating"];
  const tj = ["trainer_prior_rate", "trainer_history_depth", "jockey_prior_rate", "jockey_history_depth"];
  const context = ["history_depth", "recency", "class", "distance", "weight", "draw", "win_history", "place_history", "weakening_proxy", "handicap_context", "completion_proxy"];
  if (family === "turf") context.push("going_soft");
  if (family === "aw") context.push("surface_polytrack", "surface_tapeta", "course_context");
  if (family === "jump") context.push("hurdle_context", "chase_context");
  if (id === "M1") return speed;
  if (id === "M2") return orSpeed;
  if (id === "M3") return tj;
  if (id === "M4") return context;
  if (id === "M5") return [...new Set([...orSpeed, ...tj, ...context])].filter((name) => features.some((feature) => feature.name === name));
  if (id === "M6") return ["tissue_probability"];
  if (id === "M7") return ["rating_score"];
  return [];
}

type WalkForwardRow = { fold: string; model: ModelId; trainRaces: number; validationRaces: number; metrics: MetricSummary; deltaLogLoss: number | null; deltaBrier: number | null; deltaRank1: number | null };
function walkForwardRows(family: FamilyId, races: Race[], contexts: Map<string, RaceContext>): WalkForwardRow[] {
  return FOLDS.flatMap((fold) => {
    const train = races.filter(fold.train);
    const test = races.filter(fold.test);
    const models = fitFamilyModels(family, train, contexts);
    const baseline = metrics(evaluateModel(models.M0, test, contexts));
    return MODEL_IDS.map((id) => {
      const m = metrics(evaluateModel(models[id], test, contexts));
      return { fold: fold.label, model: id, trainRaces: train.length, validationRaces: test.length, metrics: m, deltaLogLoss: diff(m.logLoss, baseline.logLoss), deltaBrier: diff(m.brier, baseline.brier), deltaRank1: diff(m.rank1Strike, baseline.rank1Strike) };
    });
  });
}

function associationRows(family: FamilyId, races: Race[], contexts: Map<string, RaceContext>) {
  const wanted = modelFeatureNames("M5", family, featuresFor(family));
  const features = featuresFor(family).filter((feature) => wanted.includes(feature.name));
  return features.map((feature) => {
    const xs: number[] = [], residuals: number[] = [];
    for (const race of races) {
      const ctx = contexts.get(race.raceId)!;
      for (const runner of race.runners) {
        xs.push(valueOrZero(feature.value(runner, race, ctx)));
        residuals.push((runner.won ? 1 : 0) - ctx.market.get(runner.runnerId)!);
      }
    }
    const r = pearson(xs, residuals);
    return { feature: feature.name, correlation: r, direction: r === null ? "unavailable" : r > 0 ? "positive" : r < 0 ? "negative" : "flat", strength: strength(r) };
  }).sort((left, right) => Math.abs(right.correlation ?? 0) - Math.abs(left.correlation ?? 0));
}

function interactionRows(family: FamilyId, races: Race[], contexts: Map<string, RaceContext>) {
  const base = featuresFor(family);
  const pairs = ["history_depth", "avg_l3_speed", "official_rating", "tissue_probability", "weakening_proxy", "trainer_prior_rate"];
  return pairs.filter((name) => base.some((feature) => feature.name === name)).map((name) => {
    const feature = base.find((item) => item.name === name)!;
    const xs: number[] = [], residuals: number[] = [];
    for (const race of races) {
      const ctx = contexts.get(race.raceId)!;
      for (const runner of race.runners) {
        xs.push(ctx.market.get(runner.runnerId)! * valueOrZero(feature.value(runner, race, ctx)));
        residuals.push((runner.won ? 1 : 0) - ctx.market.get(runner.runnerId)!);
      }
    }
    const r = pearson(xs, residuals);
    return { interaction: `market_probability x ${name}`, correlation: r, direction: r === null ? "unavailable" : r > 0 ? "positive" : r < 0 ? "negative" : "flat", strength: strength(r) };
  }).sort((left, right) => Math.abs(right.correlation ?? 0) - Math.abs(left.correlation ?? 0));
}

function overrideRows(rows: Record<ModelId, EvaluatedRace[]>) {
  return MODEL_IDS.filter((id) => id !== "M0").map((id) => {
    const subset = rows[id];
    const overrides = subset.filter((row) => row.ranking[0]!.runner.runnerId !== row.marketRanking[0]!.runnerId);
    return {
      model: id,
      races: subset.length,
      overrides: overrides.length,
      overrideRate: rate(overrides.length, subset.length),
      winners: overrides.filter((row) => row.ranking[0]!.runner.won).length,
      strike: rate(overrides.filter((row) => row.ranking[0]!.runner.won).length, overrides.length),
      marketExpectedWinners: sum(overrides.map((row) => row.ranking[0]!.marketProbability)),
    };
  });
}

function shortPriceRows(races: Race[], contexts: Map<string, RaceContext>) {
  return SHORT_BANDS.map((band) => {
    const runners = races.flatMap((race) => race.runners.filter((runner) => runner.finalSp && band.includes(runner.finalSp) && runner.finalSp === Math.min(...race.runners.map((item) => item.finalSp))).map((runner) => ({ race, runner, ctx: contexts.get(race.raceId)! })));
    const winners = runners.filter((row) => row.runner.won);
    const losers = runners.filter((row) => !row.runner.won);
    return {
      band: band.label,
      favourites: runners.length,
      winners: winners.length,
      losers: losers.length,
      strike: rate(winners.length, runners.length),
      marketExpectedWinners: sum(runners.map((row) => row.ctx.market.get(row.runner.runnerId)!)),
      distinguishingFeatures: associationRowsForRows(runners.map((row) => row.race), contexts, runners.map((row) => row.runner.runnerId)).slice(0, 8),
    };
  });
}

function associationRowsForRows(races: Race[], contexts: Map<string, RaceContext>, runnerIds: string[]) {
  const ids = new Set(runnerIds);
  const family = races[0]?.family ?? "turf";
  return featuresFor(family).filter((feature) => modelFeatureNames("M5", family, featuresFor(family)).includes(feature.name)).map((feature) => {
    const xs: number[] = [], ys: number[] = [];
    for (const race of races) {
      const ctx = contexts.get(race.raceId)!;
      for (const runner of race.runners.filter((item) => ids.has(item.runnerId))) {
        xs.push(valueOrZero(feature.value(runner, race, ctx)));
        ys.push(runner.won ? 1 : 0);
      }
    }
    return { feature: feature.name, correlation: pearson(xs, ys), strength: strength(pearson(xs, ys)) };
  }).sort((left, right) => Math.abs(right.correlation ?? 0) - Math.abs(left.correlation ?? 0));
}

function verdictFor(summaries: Record<ModelId, MetricSummary>, folds: WalkForwardRow[]) {
  const baseline = summaries.M0;
  const best = MODEL_IDS.slice(1).map((id) => ({ id, metrics: summaries[id] })).sort((a, b) => (a.metrics.logLoss ?? Infinity) - (b.metrics.logLoss ?? Infinity))[0]!;
  const logDelta = diff(best.metrics.logLoss, baseline.logLoss);
  const brierDelta = diff(best.metrics.brier, baseline.brier);
  const improvedFolds = folds.filter((row) => row.model === best.id && (row.deltaLogLoss ?? 1) < 0 && (row.deltaBrier ?? 1) < 0).length;
  const verdict = logDelta !== null && brierDelta !== null && logDelta < -0.01 && brierDelta < -0.005 && improvedFolds >= 2
    ? "STRONG INCREMENTAL SIGNAL"
    : logDelta !== null && brierDelta !== null && logDelta < -0.002 && brierDelta < 0 && improvedFolds >= 2
      ? "MODEST INCREMENTAL SIGNAL"
      : improvedFolds > 0 || (logDelta !== null && logDelta < 0)
        ? "UNSTABLE"
        : "NO RELIABLE INCREMENTAL SIGNAL";
  return { verdict, bestModel: best.id, deltaLogLoss: logDelta, deltaBrier: brierDelta, improvedFolds };
}

function renderMarkdown(report: Stage3Report) {
  const lines: string[] = ["# Ranking Market Residual Stage 3", "", `Generated ${report.generatedAt}. Research only.`, ""];
  lines.push("## Executive Summary", "");
  for (const family of FAMILIES) {
    const verdict = report.verdicts[family];
    lines.push(`- ${FAMILY_LABEL[family]}: ${verdict.verdict}. Best diagnostic model ${verdict.bestModel} (${MODEL_LABEL[verdict.bestModel]}), delta log loss ${fmtSigned(verdict.deltaLogLoss)}, delta Brier ${fmtSigned(verdict.deltaBrier)} versus M0.`);
  }
  lines.push("", "Final SP is used here only as a retrospective market-control baseline. It is not prospectively available and this script does not create betting rules or production models.", "");
  sectionTable(lines, "Market Baseline", ["Family", "Races", "Rank-1", "Top-2", "Top-3", "Log loss", "Brier", "Calibration MAE"], FAMILIES.map((family) => metricRow(FAMILY_LABEL[family], report.summaries[family].M0)));
  for (const family of FAMILIES) {
    sectionTable(lines, `${FAMILY_LABEL[family]} Incremental Signal`, ["Model", "Description", "Races", "Rank-1", "Top-3", "Log loss", "Delta LL", "Brier", "Delta Brier", "Calibration"], MODEL_IDS.map((id) => {
      const m = report.summaries[family][id], b = report.summaries[family].M0;
      return [id, MODEL_LABEL[id], m.races, pct(m.rank1Strike), pct(m.top3Capture), fmt(m.logLoss), fmtSigned(diff(m.logLoss, b.logLoss)), fmt(m.brier), fmtSigned(diff(m.brier, b.brier)), fmt(m.calibrationMae)];
    }));
  }
  sectionTable(lines, "Tissue Beyond Market", ["Family", "Delta log loss", "Delta Brier", "Rank-1 change", "Verdict"], FAMILIES.map((family) => deltaRow(family, "M6", report)));
  sectionTable(lines, "Ratings Beyond Market", ["Family", "Delta log loss", "Delta Brier", "Rank-1 change", "Verdict"], FAMILIES.map((family) => deltaRow(family, "M7", report)));
  lines.push("## Short-Priced Winner vs Loser Analysis", "");
  for (const family of FAMILIES) {
    lines.push(`### ${FAMILY_LABEL[family]}`, "");
    sectionTable(lines, "", ["Band", "Favourites", "Winners", "Strike", "Market expected winners", "Top stable associations"], report.shortPrices[family].map((row) => [row.band, row.favourites, row.winners, pct(row.strike), fmt(row.marketExpectedWinners), row.distinguishingFeatures.filter((item) => item.strength !== "weak").slice(0, 3).map((item) => `${item.feature} ${fmt(item.correlation)}`).join("; ") || "none stable"]));
  }
  sectionTable(lines, "Residual Feature Associations", ["Family", "Feature", "Direction", "Correlation", "Strength"], FAMILIES.flatMap((family) => report.residualAssociations[family].slice(0, 12).map((row) => [FAMILY_LABEL[family], row.feature, row.direction, fmt(row.correlation), row.strength])));
  sectionTable(lines, "Interaction Tests", ["Family", "Interaction", "Direction", "Correlation", "Strength"], FAMILIES.flatMap((family) => report.interactions[family].map((row) => [FAMILY_LABEL[family], row.interaction, row.direction, fmt(row.correlation), row.strength])));
  sectionTable(lines, "Walk-Forward Validation", ["Family", "Fold", "Model", "Train", "Validation", "Delta LL", "Delta Brier", "Delta rank-1"], FAMILIES.flatMap((family) => report.walkForward[family].filter((row) => row.model !== "M0").map((row) => [FAMILY_LABEL[family], row.fold, row.model, row.trainRaces, row.validationRaces, fmtSigned(row.deltaLogLoss), fmtSigned(row.deltaBrier), fmtSigned(row.deltaRank1)])));
  sectionTable(lines, "2025 vs 2026", ["Family", "Model", "2025 LL", "2026 LL", "2025 Brier", "2026 Brier", "2025 rank-1", "2026 rank-1"], FAMILIES.flatMap((family) => MODEL_IDS.map((id) => {
    const y = report.byYear[family][id] as Record<string, MetricSummary>;
    return [FAMILY_LABEL[family], id, fmt(y["2025"].logLoss), fmt(y["2026"].logLoss), fmt(y["2025"].brier), fmt(y["2026"].brier), pct(y["2025"].rank1Strike), pct(y["2026"].rank1Strike)];
  })));
  sectionTable(lines, "Family Comparison", ["Family", "Best model", "Verdict", "Improved folds", "Tissue adds signal?", "Rating adds signal?"], FAMILIES.map((family) => [FAMILY_LABEL[family], report.verdicts[family].bestModel, report.verdicts[family].verdict, report.verdicts[family].improvedFolds, signalLabel(report.summaries[family], "M6"), signalLabel(report.summaries[family], "M7")]));
  lines.push("## Recommendation", "", "Do not replace production models. The only justified next step is a later prospective shadow experiment for any family/model whose walk-forward deltas repeat, using timestamped frozen bookmaker median prices rather than final SP. Treat M6 as a cache-reconstructable Tissue-style proxy diagnostic unless a full runner-level frozen Tissue probability archive is available.", "");
  return `${lines.join("\n").trimEnd()}\n`;
}

function printTerminalSummary(summaries: Record<FamilyId, Record<ModelId, MetricSummary>>, verdicts: Record<FamilyId, ReturnType<typeof verdictFor>>) {
  for (const family of FAMILIES) {
    const base = summaries[family].M0;
    const best = summaries[family][verdicts[family].bestModel];
    console.log(`${FAMILY_LABEL[family]}`);
    console.log(`Market baseline log loss: ${fmt(base.logLoss)}`);
    console.log(`Best market+feature log loss: ${fmt(best.logLoss)}`);
    console.log(`Delta: ${fmtSigned(diff(best.logLoss, base.logLoss))}`);
    console.log(`Market baseline Brier: ${fmt(base.brier)}`);
    console.log(`Best market+feature Brier: ${fmt(best.brier)}`);
    console.log(`Delta: ${fmtSigned(diff(best.brier, base.brier))}`);
    console.log(`Market favourite strike: ${pct(base.rank1Strike)}`);
    console.log(`Best combined rank-1 strike: ${pct(best.rank1Strike)}`);
    console.log(`Tissue adds signal? ${signalLabel(summaries[family], "M6")}`);
    console.log(`Rating adds signal? ${signalLabel(summaries[family], "M7")}`);
    console.log(`Verdict: ${verdicts[family].verdict}`);
    console.log("");
  }
  console.log(`Wrote ${MD_OUTPUT}`);
  console.log(`Wrote ${JSON_OUTPUT}`);
}

function mapFamilyModels<T>(input: Record<FamilyId, Record<ModelId, EvaluatedRace[]>>, fn: (rows: EvaluatedRace[]) => T) {
  return Object.fromEntries(FAMILIES.map((family) => [family, Object.fromEntries(MODEL_IDS.map((id) => [id, fn(input[family][id])]))])) as Record<FamilyId, Record<ModelId, T>>;
}

function z(name: string, key: string): Feature {
  return { name, value: (runner, race) => zValue(runner, race, key) };
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
function stringOrNull(value: unknown) { return typeof value === "string" ? value : null; }
function valueOrZero(value: number | null | undefined) { return value !== null && value !== undefined && Number.isFinite(value) ? value : 0; }
function hashBucket(value: string, buckets: number) { let hash = 0; for (const char of value) hash = ((hash * 31) + char.charCodeAt(0)) | 0; return ((Math.abs(hash) % buckets) / Math.max(1, buckets - 1)) - 0.5; }
function logit(value: number | null) { if (value === null || !Number.isFinite(value)) return null; const p = Math.min(0.999, Math.max(0.001, value)); return Math.log(p / (1 - p)); }
function softmax(scores: number[]) { const max = Math.max(...scores); const weights = scores.map((score) => Math.exp(score - max)); const total = sum(weights); return weights.map((weight) => weight / total); }
function dot(left: number[], right: number[]) { return left.reduce((total, value, i) => total + value * (right[i] ?? 0), 0); }
function sum(values: number[]) { return values.reduce((total, value) => total + value, 0); }
function average(values: number[]) { return values.length ? sum(values) / values.length : null; }
function median(values: number[]) { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b); return (sorted[Math.floor((sorted.length - 1) / 2)]! + sorted[Math.floor(sorted.length / 2)]!) / 2; }
function isNumber(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
function rate(numerator: number, denominator: number) { return denominator ? numerator / denominator : null; }
function diff(left: number | null, right: number | null) { return left === null || right === null ? null : left - right; }
function pearson(xs: number[], ys: number[]) {
  if (xs.length !== ys.length || xs.length < 3) return null;
  const mx = average(xs)!, my = average(ys)!;
  const cov = sum(xs.map((x, i) => (x - mx) * (ys[i]! - my)));
  const sx = Math.sqrt(sum(xs.map((x) => (x - mx) ** 2)));
  const sy = Math.sqrt(sum(ys.map((y) => (y - my) ** 2)));
  return sx > 0 && sy > 0 ? cov / (sx * sy) : null;
}
function strength(value: number | null) { const abs = Math.abs(value ?? 0); return abs >= 0.06 ? "moderate" : abs >= 0.03 ? "small" : "weak"; }
function calibrationMae(rows: EvaluatedRace[]) {
  const bands = [[0, 0.1], [0.1, 0.2], [0.2, 0.3], [0.3, 1.01]];
  const errors = bands.map(([low, high]) => rows.flatMap((row) => row.runners.filter((entry) => entry.probability >= low! && entry.probability < high!))).filter((band) => band.length >= 20).map((band) => Math.abs(average(band.map((entry) => entry.probability))! - average(band.map((entry) => entry.runner.won ? 1 : 0))!));
  return average(errors);
}
function signalLabel(summaries: Record<ModelId, MetricSummary>, id: ModelId) {
  const ll = diff(summaries[id].logLoss, summaries.M0.logLoss);
  const br = diff(summaries[id].brier, summaries.M0.brier);
  if (ll !== null && br !== null && ll < -0.002 && br < 0) return "YES";
  if (ll !== null && br !== null && (ll < 0 || br < 0)) return "UNSTABLE";
  return "NO";
}
function metricRow(label: string, m: MetricSummary) { return [label, m.races, pct(m.rank1Strike), pct(m.top2Capture), pct(m.top3Capture), fmt(m.logLoss), fmt(m.brier), fmt(m.calibrationMae)]; }
function deltaRow(family: FamilyId, id: ModelId, report: Stage3Report) {
  const m = report.summaries[family][id], b = report.summaries[family].M0;
  return [FAMILY_LABEL[family], fmtSigned(diff(m.logLoss, b.logLoss)), fmtSigned(diff(m.brier, b.brier)), fmtSigned(diff(m.rank1Strike, b.rank1Strike)), signalLabel(report.summaries[family], id)];
}
function sectionTable(lines: string[], title: string, headers: string[], rows: Array<Array<string | number | null>>) {
  if (title) lines.push(`## ${title}`, "");
  lines.push(`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`);
  for (const row of rows) lines.push(`| ${row.map((value) => value ?? "n/a").join(" | ")} |`);
  lines.push("");
}
function fmt(value: number | null | undefined) { return value === null || value === undefined || !Number.isFinite(value) ? "n/a" : value.toFixed(4); }
function pct(value: number | null | undefined) { return value === null || value === undefined || !Number.isFinite(value) ? "n/a" : `${(value * 100).toFixed(1)}%`; }
function fmtSigned(value: number | null | undefined) { return value === null || value === undefined || !Number.isFinite(value) ? "n/a" : `${value >= 0 ? "+" : ""}${value.toFixed(4)}`; }

if (process.argv[1]?.endsWith("diagnose-ranking-market-residual-stage3.ts")) await main();
