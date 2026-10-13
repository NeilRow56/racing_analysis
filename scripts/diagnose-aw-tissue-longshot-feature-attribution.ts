import { writeFile } from "node:fs/promises";
import { isSupportedAllWeatherRace } from "@/lib/racing/aw-speed-rating";
import {
  AW_TISSUE_FEATURES,
  AW_TISSUE_MODEL_PATH,
  awTissueModelInputs,
  awTissueProbabilities,
  loadAwTissueModel,
  type AwTissueModel,
} from "@/lib/racing/aw-tissue-model";
import { isVoidBetResultStatus, settleSelection } from "@/lib/racing/backtest";
import { loadBacktestFeatureCache } from "@/lib/racing/backtest-cache";
import type { HistoricalTargetRunnerMetricsRow as Row } from "@/lib/racing/historical-target-metrics";
import { featureValues, groupBy, loadHistory, type Example, type PriorRun } from "./diagnose-aw-tissue-stage1";

const YEARS = ["2025", "2026"] as const;
const OUTPUT = "/tmp/aw-tissue-longshot-feature-attribution";
const LONG_SP = 21;

type Year = typeof YEARS[number];
type Family =
  | "speed / ratings"
  | "recent form"
  | "trainer"
  | "jockey"
  | "class"
  | "recency"
  | "official rating"
  | "weight"
  | "distance"
  | "going / surface context"
  | "race context"
  | "missing-data indicators"
  | "other";

type Entry = {
  year: Year;
  raceId: string;
  runnerId: string;
  horseName: string;
  raceDate: string;
  courseName: string;
  raceName: string | null;
  sp: number;
  won: boolean;
  probability: number;
  rank: number;
  rank2Probability: number;
  probabilityGapToRank2: number;
  probabilityRatioToRank2: number | null;
  rawScore: number;
  rawInputs: Array<number | null>;
  modelInputs: number[];
  standardizedInputs: number[];
  contributions: number[];
};

type FeatureStat = {
  feature: string;
  family: Family;
  coefficient: number;
  meanRawValue: number | null;
  meanStandardizedValue: number | null;
  meanContribution: number | null;
  medianContribution: number | null;
  top3PositiveFrequency: number;
  top3PositiveRate: number | null;
};

type ComparisonRow = {
  feature: string;
  family: Family;
  primaryMean: number | null;
  comparisonMean: number | null;
  difference: number | null;
  primaryMedian: number | null;
  comparisonMedian: number | null;
  primaryTop3Rate: number | null;
  comparisonTop3Rate: number | null;
  top3RateDifference: number | null;
};

type SplitRow = {
  name: string;
  family?: Family;
  winnerMean: number | null;
  loserMean: number | null;
  standardizedDifference: number | null;
  direction: "winner higher" | "loser higher" | "flat";
};

type AblationRow = {
  ablation: string;
  family: Family | "trainer+jockey";
  displacedLongRank1: number;
  longRank1Before: number;
  displacementRate: number | null;
  rankOne2026Strike: number | null;
  top3Capture2026: number | null;
  logLoss2026: number | null;
  brier2026: number | null;
};

type RaceBook = { year: Year; raceId: string; entries: Entry[] };
type FamilyStat = {
  family: Family;
  meanContribution: number | null;
  medianContribution: number | null;
  top3PositiveFrequency: number;
  top3PositiveRate: number | null;
};
type FamilyComparisonRow = {
  family: Family;
  primaryMean: number | null;
  comparisonMean: number | null;
  difference: number | null;
  primaryMedian: number | null;
  comparisonMedian: number | null;
};
type DiagnosticReport = {
  generatedAt: string;
  model: {
    path: typeof AW_TISSUE_MODEL_PATH;
    checksum: string;
    featureNames: string[];
    coefficients: Record<string, number>;
    means: Record<string, number>;
    scales: Record<string, number>;
  };
  contributionMethod: string;
  definitions: Record<string, string | boolean>;
  cohortSummary: {
    primary: ReturnType<typeof summarize>;
    ordinaryRankOne: ReturnType<typeof summarize>;
    longRankOneWinners: ReturnType<typeof summarize>;
    longRankOneLosers: ReturnType<typeof summarize>;
    allAwRunners: ReturnType<typeof summarize>;
    allAwWinners: ReturnType<typeof summarize>;
  };
  scoreMargin: {
    primary: ReturnType<typeof marginSummary>;
    ordinaryRankOne: ReturnType<typeof marginSummary>;
  };
  marketDisagreement: {
    primary: ReturnType<typeof marketSummary>;
    winners: ReturnType<typeof marketSummary>;
    losers: ReturnType<typeof marketSummary>;
  };
  featureStats: FeatureStat[];
  featureComparison: ComparisonRow[];
  familyStats: FamilyStat[];
  familyComparison: FamilyComparisonRow[];
  winnerLoserFeature: SplitRow[];
  winnerLoserFamily: SplitRow[];
  yearReplication: ReturnType<typeof replication>;
  speedRatings: ReturnType<typeof speedRatingDiagnostics>;
  trainerJockey: ReturnType<typeof trainerJockeyDiagnostics>;
  missingData: ReturnType<typeof missingDataDiagnostics>;
  ablations: AblationRow[];
  examples: ReturnType<typeof exampleRows>;
  diagnosis: ReturnType<typeof diagnose>;
};

async function main() {
  const model = await loadAwTissueModel(AW_TISSUE_MODEL_PATH);
  const caches = await Promise.all(YEARS.map((year) => loadBacktestFeatureCache({ from: `${year}-01-01`, to: `${year}-12-31`, family: "all_weather_flat" })));
  if (caches.some((cache) => cache === null)) throw new Error("Missing compatible 2025/2026 all_weather_flat backtest cache");
  const rows = caches.flatMap((cache) => cache!.rows);
  const history = await loadHistory(rows);
  const books = buildBooks(rows, history, model);
  const entries = books.flatMap((book) => book.entries);
  const primary = entries.filter((entry) => entry.rank === 1 && isLongPrice(entry.sp));
  const ordinaryRankOne = entries.filter((entry) => entry.rank === 1 && !isLongPrice(entry.sp));
  const primaryWinners = primary.filter((entry) => entry.won);
  const primaryLosers = primary.filter((entry) => !entry.won);
  const allWinners = entries.filter((entry) => entry.won);
  const names = model.model.names;
  const families = names.map(featureFamily);

  const featureStats = statsByFeature(primary, names, families, model.model.weights);
  const ordinaryFeatureStats = statsByFeature(ordinaryRankOne, names, families, model.model.weights);
  const featureComparison = compareFeatureStats(featureStats, ordinaryFeatureStats);
  const familyStats = statsByFamily(primary, names, families);
  const ordinaryFamilyStats = statsByFamily(ordinaryRankOne, names, families);
  const familyComparison = compareFamilyStats(familyStats, ordinaryFamilyStats);
  const strongest = familyComparison.filter((row) => row.difference !== null).sort((a, b) => Math.abs(b.difference!) - Math.abs(a.difference!))[0]?.family ?? "speed / ratings";
  const ablations = runAblations(books, names, families, strongest);
  const report: DiagnosticReport = {
    generatedAt: new Date().toISOString(),
    model: {
      path: AW_TISSUE_MODEL_PATH,
      checksum: model.checksum,
      featureNames: names,
      coefficients: Object.fromEntries(names.map((name, index) => [name, model.model.weights[index]!])),
      means: Object.fromEntries(names.map((name, index) => [name, model.model.means[index]!])),
      scales: Object.fromEntries(names.map((name, index) => [name, model.model.scales[index]!])),
    },
    contributionMethod: "Exact linear raw-score contribution: ((model input - frozen mean) / frozen scale) * frozen coefficient. Race probabilities are the softmax of raw scores.",
    definitions: {
      primaryCohort: "All-weather races only, frozen AW Tissue rank = 1, final decimal SP > 21.0 (>20/1).",
      ordinaryRankOne: "All-weather races only, frozen AW Tissue rank = 1, final decimal SP <= 21.0.",
      settlement: "Canonical settlement. Void/non-runner rows are excluded from books; complete verified fields and single-winner races only.",
      marketUse: "Final SP is used retrospectively only for diagnosis, never as a model input.",
      noRetraining: true,
    },
    cohortSummary: {
      primary: summarize(primary),
      ordinaryRankOne: summarize(ordinaryRankOne),
      longRankOneWinners: summarize(primaryWinners),
      longRankOneLosers: summarize(primaryLosers),
      allAwRunners: summarize(entries),
      allAwWinners: summarize(allWinners),
    },
    scoreMargin: {
      primary: marginSummary(primary),
      ordinaryRankOne: marginSummary(ordinaryRankOne),
    },
    marketDisagreement: {
      primary: marketSummary(primary),
      winners: marketSummary(primaryWinners),
      losers: marketSummary(primaryLosers),
    },
    featureStats,
    featureComparison,
    familyStats,
    familyComparison,
    winnerLoserFeature: splitByFeature(primaryWinners, primaryLosers, names, families),
    winnerLoserFamily: splitByFamily(primaryWinners, primaryLosers, names, families),
    yearReplication: replication(primary, ordinaryRankOne, names, families),
    speedRatings: speedRatingDiagnostics(primary, ordinaryRankOne, primaryWinners, primaryLosers),
    trainerJockey: trainerJockeyDiagnostics(primary, ordinaryRankOne),
    missingData: missingDataDiagnostics(primary, ordinaryRankOne, names),
    ablations,
    examples: exampleRows(primary, names, families),
    diagnosis: diagnose(familyComparison, ablations),
  };

  await writeFile(`${OUTPUT}.json`, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(`${OUTPUT}.md`, markdown(report), "utf8");
  printSummary(report);
}

function buildBooks(rows: Row[], history: Map<string, PriorRun[]>, model: AwTissueModel): RaceBook[] {
  const supported = rows.filter((row) => row.features.raceCode === "aw" && isSupportedAllWeatherRace(row.features));
  const books: RaceBook[] = [];
  for (const [raceId, raceRows] of groupBy(supported, (row) => row.features.targetRaceId)) {
    const active = raceRows.filter((row) => !isVoidBetResultStatus(row.outcome.resultStatus));
    const labels = active.map((row) => settleSelection({ ...row.outcome, startingPriceDecimal: "2" }));
    const settlements = active.map((row) => settleSelection(row.outcome));
    const expected = active[0]?.features.actualRunnerCount;
    if (
      active.length < 2 ||
      new Set(active.map((row) => row.features.targetRunnerId)).size !== active.length ||
      raceRows.some((row) => row.features.targetRunnerId !== row.outcome.targetRunnerId || row.features.targetRaceId !== row.outcome.targetRaceId) ||
      expected == null ||
      active.some((row) => row.features.actualRunnerCount !== expected) ||
      (expected !== active.length && expected !== raceRows.length) ||
      labels.some((label) => label === null) ||
      labels.filter((label) => label!.grossReturn > 0).length !== 1
    ) continue;
    if (active.some((row) => row.features.odds !== null || row.features.oddsDecimal !== null || (row.features.latestRunDate !== null && row.features.latestRunDate >= row.features.raceDate))) {
      throw new Error(`Unsafe pre-race features: ${raceId}`);
    }
    const examples: Example[] = active.map((row, index) => {
      const runs = (history.get(row.features.horseId) ?? []).filter((run) => run.raceId !== raceId && run.raceDateTime < row.features.raceDateTime);
      return { row, raceId, won: labels[index]!.grossReturn > 0, priorAwStarts: runs.filter((run) => run.aw).length, priorComments: [], probabilities: {} };
    });
    const rawInputs = examples.map((example) => featureValues(example, "AW-T0").slice(0, AW_TISSUE_FEATURES.length) as Array<number | null>);
    const modelInputs = rawInputs.map((raw) => awTissueModelInputs(raw, model));
    const contributions = modelInputs.map((inputs) => contributionVector(model, inputs));
    const scores = contributions.map(sum);
    const probabilities = awTissueProbabilities(modelInputs, model);
    const order = [...active.keys()].sort((a, b) => probabilities[b]! - probabilities[a]! || active[a]!.features.targetRunnerId.localeCompare(active[b]!.features.targetRunnerId));
    const rankByIndex = new Map(order.map((index, rank) => [index, rank + 1]));
    const rank2 = probabilities[order[1]!]!;
    const bookEntries: Entry[] = [];
    for (const [index, row] of active.entries()) {
      const settlement = settlements[index];
      if (!settlement) continue;
      bookEntries.push({
        year: row.features.raceDate.slice(0, 4) as Year,
        raceId,
        runnerId: row.features.targetRunnerId,
        horseName: row.features.horseName,
        raceDate: row.features.raceDate,
        courseName: row.features.courseName,
        raceName: row.features.raceName,
        sp: settlement.settlementOddsDecimal,
        won: row.outcome.won === true || row.outcome.finishingPosition === 1,
        probability: probabilities[index]!,
        rank: rankByIndex.get(index)!,
        rank2Probability: rankByIndex.get(index) === 1 ? rank2 : probabilities[order[0]!]!,
        probabilityGapToRank2: rankByIndex.get(index) === 1 ? probabilities[index]! - rank2 : probabilities[index]! - probabilities[order[0]!]!,
        probabilityRatioToRank2: rankByIndex.get(index) === 1 && rank2 > 0 ? probabilities[index]! / rank2 : null,
        rawScore: scores[index]!,
        rawInputs: rawInputs[index]!,
        modelInputs: modelInputs[index]!,
        standardizedInputs: standardizedVector(model, modelInputs[index]!),
        contributions: contributions[index]!,
      });
    }
    books.push({ year: active[0]!.features.raceDate.slice(0, 4) as Year, raceId, entries: bookEntries });
  }
  return books;
}

function contributionVector(model: AwTissueModel, inputs: number[]) {
  return inputs.map((value, index) => model.model.weights[index]! * ((value - model.model.means[index]!) / model.model.scales[index]!));
}

function standardizedVector(model: AwTissueModel, inputs: number[]) {
  return inputs.map((value, index) => (value - model.model.means[index]!) / model.model.scales[index]!);
}

function featureFamily(name: string): Family {
  if (name.endsWith("_missing")) return "missing-data indicators";
  if (["avg_l3_aw_speed", "latest_aw_speed", "best_l3_aw_speed", "avg_l3_aw_performance", "latest_aw_performance"].includes(name)) return "speed / ratings";
  if (name === "official_rating") return "official rating";
  if (name === "trainer_prior_rate") return "trainer";
  if (name === "jockey_prior_rate") return "jockey";
  if (name === "class" || name === "handicap") return "class";
  if (name === "days_since_run" || name === "prior_aw_starts" || name === "age") return name === "days_since_run" ? "recency" : "recent form";
  if (name === "distance_furlongs") return "distance";
  if (name === "declared_field_size" || name === "draw") return "race context";
  return "other";
}

function statsByFeature(rows: Entry[], names: string[], families: Family[], weights: number[]): FeatureStat[] {
  return names.map((feature, index) => {
    return {
      feature,
      family: families[index]!,
      coefficient: weights[index]!,
      meanRawValue: mean(rows.flatMap((entry) => valueAt(entry, index))),
      meanStandardizedValue: mean(rows.map((entry) => entry.standardizedInputs[index]!)),
      meanContribution: mean(rows.map((entry) => entry.contributions[index]!)),
      medianContribution: median(rows.map((entry) => entry.contributions[index]!)),
      top3PositiveFrequency: rows.filter((entry) => topPositiveIndexes(entry, 3).includes(index)).length,
      top3PositiveRate: ratio(rows.filter((entry) => topPositiveIndexes(entry, 3).includes(index)).length, rows.length),
    };
  }).sort((a, b) => Math.abs(b.meanContribution ?? 0) - Math.abs(a.meanContribution ?? 0));
}

function valueAt(entry: Entry, index: number) {
  if (index < AW_TISSUE_FEATURES.length) return entry.rawInputs[index] === null ? [] : [entry.rawInputs[index]!];
  return [entry.modelInputs[index]!];
}

function topPositiveIndexes(entry: Entry, count: number) {
  return [...entry.contributions.keys()].filter((index) => entry.contributions[index]! > 0).sort((a, b) => entry.contributions[b]! - entry.contributions[a]!).slice(0, count);
}

function compareFeatureStats(primary: FeatureStat[], comparison: FeatureStat[]): ComparisonRow[] {
  const byFeature = new Map(comparison.map((row) => [row.feature, row]));
  return primary.map((row) => {
    const other = byFeature.get(row.feature)!;
    return {
      feature: row.feature,
      family: row.family,
      primaryMean: row.meanContribution,
      comparisonMean: other.meanContribution,
      difference: diff(row.meanContribution, other.meanContribution),
      primaryMedian: row.medianContribution,
      comparisonMedian: other.medianContribution,
      primaryTop3Rate: row.top3PositiveRate,
      comparisonTop3Rate: other.top3PositiveRate,
      top3RateDifference: diff(row.top3PositiveRate, other.top3PositiveRate),
    };
  }).sort((a, b) => Math.abs(b.difference ?? 0) - Math.abs(a.difference ?? 0));
}

function statsByFamily(rows: Entry[], names: string[], families: Family[]): FamilyStat[] {
  return [...new Set(families)].map((family) => {
    const indexes = names.flatMap((_, index) => families[index] === family ? [index] : []);
    const totals = rows.map((entry) => sum(indexes.map((index) => entry.contributions[index]!)));
    return {
      family,
      meanContribution: mean(totals),
      medianContribution: median(totals),
      top3PositiveFrequency: rows.filter((entry) => topPositiveIndexes(entry, 3).some((index) => families[index] === family)).length,
      top3PositiveRate: ratio(rows.filter((entry) => topPositiveIndexes(entry, 3).some((index) => families[index] === family)).length, rows.length),
    };
  }).sort((a, b) => Math.abs(b.meanContribution ?? 0) - Math.abs(a.meanContribution ?? 0));
}

function compareFamilyStats(primary: FamilyStat[], comparison: FamilyStat[]): FamilyComparisonRow[] {
  const byFamily = new Map(comparison.map((row) => [row.family, row]));
  return primary.map((row) => {
    const other = byFamily.get(row.family)!;
    return {
      family: row.family,
      primaryMean: row.meanContribution,
      comparisonMean: other.meanContribution,
      difference: diff(row.meanContribution, other.meanContribution),
      primaryMedian: row.medianContribution,
      comparisonMedian: other.medianContribution,
    };
  }).sort((a, b) => Math.abs(b.difference ?? 0) - Math.abs(a.difference ?? 0));
}

function splitByFeature(winners: Entry[], losers: Entry[], names: string[], families: Family[]): SplitRow[] {
  return names.map((name, index) => splitRow(name, families[index], winners.map((entry) => entry.contributions[index]!), losers.map((entry) => entry.contributions[index]!)))
    .sort((a, b) => Math.abs(b.standardizedDifference ?? 0) - Math.abs(a.standardizedDifference ?? 0));
}

function splitByFamily(winners: Entry[], losers: Entry[], names: string[], families: Family[]): SplitRow[] {
  return [...new Set(families)].map((family) => {
    const indexes = names.flatMap((_, index) => families[index] === family ? [index] : []);
    return splitRow(family, family, winners.map((entry) => sum(indexes.map((index) => entry.contributions[index]!))), losers.map((entry) => sum(indexes.map((index) => entry.contributions[index]!))));
  }).sort((a, b) => Math.abs(b.standardizedDifference ?? 0) - Math.abs(a.standardizedDifference ?? 0));
}

function splitRow(name: string, family: Family | undefined, left: number[], right: number[]): SplitRow {
  const winnerMean = mean(left), loserMean = mean(right), sd = pooledSd(left, right);
  return {
    name,
    family,
    winnerMean,
    loserMean,
    standardizedDifference: sd && winnerMean !== null && loserMean !== null ? (winnerMean - loserMean) / sd : null,
    direction: winnerMean === null || loserMean === null || Math.abs(winnerMean - loserMean) < 1e-9 ? "flat" : winnerMean > loserMean ? "winner higher" : "loser higher",
  };
}

function replication(primary: Entry[], ordinary: Entry[], names: string[], families: Family[]) {
  const weights = names.map(() => 0);
  const strongest = compareFeatureStats(statsByFeature(primary, names, families, weights), statsByFeature(ordinary, names, families, weights)).slice(0, 12);
  return strongest.map((row) => {
    const years = YEARS.map((year) => {
      const p = primary.filter((entry) => entry.year === year), o = ordinary.filter((entry) => entry.year === year);
      const index = names.indexOf(row.feature);
      const primaryMean = mean(p.map((entry) => entry.contributions[index]!));
      const ordinaryMean = mean(o.map((entry) => entry.contributions[index]!));
      return { year, primaryMean, ordinaryMean, difference: diff(primaryMean, ordinaryMean) };
    });
    const signs = years.map((item) => item.difference === null || Math.abs(item.difference) < 0.02 ? 0 : Math.sign(item.difference));
    return {
      ...row,
      years,
      classification: signs[0] !== 0 && signs[0] === signs[1] ? "REPLICATED" : signs[0] !== 0 && signs[1] === 0 ? "2025 ONLY" : signs[0] === 0 && signs[1] !== 0 ? "2026 ONLY" : "MIXED",
    };
  });
}

function speedRatingDiagnostics(primary: Entry[], ordinary: Entry[], winners: Entry[], losers: Entry[]) {
  const keys = ["avg_l3_aw_speed", "best_l3_aw_speed", "latest_aw_speed", "avg_l3_aw_performance", "latest_aw_performance", "official_rating"] as const;
  return keys.map((feature) => {
    const index = featureIndex(feature);
    return {
      feature,
      primaryMeanRaw: mean(primary.flatMap((entry) => valueAt(entry, index))),
      ordinaryMeanRaw: mean(ordinary.flatMap((entry) => valueAt(entry, index))),
      primaryMeanContribution: mean(primary.map((entry) => entry.contributions[index]!)),
      ordinaryMeanContribution: mean(ordinary.map((entry) => entry.contributions[index]!)),
      contributionDifference: diff(mean(primary.map((entry) => entry.contributions[index]!)), mean(ordinary.map((entry) => entry.contributions[index]!))),
      winnerMeanContribution: mean(winners.map((entry) => entry.contributions[index]!)),
      loserMeanContribution: mean(losers.map((entry) => entry.contributions[index]!)),
    };
  });
}

function trainerJockeyDiagnostics(primary: Entry[], ordinary: Entry[]) {
  const trainer = featureIndex("trainer_prior_rate"), jockey = featureIndex("jockey_prior_rate");
  const combined = (rows: Entry[]) => rows.map((entry) => entry.contributions[trainer]! + entry.contributions[jockey]!);
  return {
    primaryTrainerMean: mean(primary.map((entry) => entry.contributions[trainer]!)),
    ordinaryTrainerMean: mean(ordinary.map((entry) => entry.contributions[trainer]!)),
    primaryJockeyMean: mean(primary.map((entry) => entry.contributions[jockey]!)),
    ordinaryJockeyMean: mean(ordinary.map((entry) => entry.contributions[jockey]!)),
    primaryCombinedMean: mean(combined(primary)),
    ordinaryCombinedMean: mean(combined(ordinary)),
    combinedDifference: diff(mean(combined(primary)), mean(combined(ordinary))),
  };
}

function missingDataDiagnostics(primary: Entry[], ordinary: Entry[], names: string[]) {
  return names.flatMap((name, index) => name.endsWith("_missing") ? [{
    feature: name,
    primaryRate: mean(primary.map((entry) => entry.modelInputs[index]!)),
    ordinaryRate: mean(ordinary.map((entry) => entry.modelInputs[index]!)),
    rateDifference: diff(mean(primary.map((entry) => entry.modelInputs[index]!)), mean(ordinary.map((entry) => entry.modelInputs[index]!))),
    primaryMeanContribution: mean(primary.map((entry) => entry.contributions[index]!)),
    ordinaryMeanContribution: mean(ordinary.map((entry) => entry.contributions[index]!)),
    positiveContributionWhenMissing: primary.some((entry) => entry.modelInputs[index] === 1 && entry.contributions[index]! > 0),
  }] : []);
}

function runAblations(books: RaceBook[], names: string[], families: Family[], strongest: Family): AblationRow[] {
  const definitions: Array<[string, Family | "trainer+jockey", (family: Family) => boolean]> = [
    ["speed/ratings removed", "speed / ratings", (family) => family === "speed / ratings"],
    ["trainer removed", "trainer", (family) => family === "trainer"],
    ["jockey removed", "jockey", (family) => family === "jockey"],
    ["trainer+jockey removed", "trainer+jockey", (family) => family === "trainer" || family === "jockey"],
    ["official-rating/missing-rating removed", "official rating", () => false],
    [`strongest family removed (${strongest})`, strongest, (family) => family === strongest],
  ];
  return definitions.map(([ablation, family, predicate]) => {
    const remove = family === "official rating" && ablation.startsWith("official") ?
      names.map((name, index) => name === "official_rating" || name === "official_rating_missing" ? index : -1).filter((index) => index >= 0) :
      names.flatMap((_, index) => predicate(families[index]!) ? [index] : []);
    let displaced = 0, longBefore = 0;
    const rankOne2026: Entry[] = [];
    let top3Hits = 0, races2026 = 0;
    const logLosses: number[] = [], briers: number[] = [];
    for (const book of books) {
      const beforeTop = book.entries.find((entry) => entry.rank === 1);
      if (beforeTop && isLongPrice(beforeTop.sp)) longBefore += 1;
      const scores = book.entries.map((entry) => entry.rawScore - sum(remove.map((index) => entry.contributions[index]!)));
      const probabilities = softmax(scores);
      const order = [...book.entries.keys()].sort((a, b) => probabilities[b]! - probabilities[a]! || book.entries[a]!.runnerId.localeCompare(book.entries[b]!.runnerId));
      if (beforeTop && isLongPrice(beforeTop.sp) && book.entries[order[0]!]!.runnerId !== beforeTop.runnerId) displaced += 1;
      if (book.year === "2026") {
        races2026 += 1;
        const leader = book.entries[order[0]!]!;
        rankOne2026.push(leader);
        if (order.slice(0, 3).some((index) => book.entries[index]!.won)) top3Hits += 1;
        const winnerIndex = book.entries.findIndex((entry) => entry.won);
        if (winnerIndex >= 0) logLosses.push(-Math.log(probabilities[winnerIndex]!));
        briers.push(sum(book.entries.map((entry, index) => (probabilities[index]! - (entry.won ? 1 : 0)) ** 2)));
      }
    }
    return {
      ablation,
      family,
      displacedLongRank1: displaced,
      longRank1Before: longBefore,
      displacementRate: ratio(displaced, longBefore),
      rankOne2026Strike: ratio(rankOne2026.filter((entry) => entry.won).length, rankOne2026.length),
      top3Capture2026: ratio(top3Hits, races2026),
      logLoss2026: mean(logLosses),
      brier2026: mean(briers),
    };
  });
}

function exampleRows(primary: Entry[], names: string[], families: Family[]) {
  const winners = primary.filter((entry) => entry.won).sort((a, b) => a.raceDate.localeCompare(b.raceDate));
  const losers = primary.filter((entry) => !entry.won).sort((a, b) => b.probability - a.probability || b.sp - a.sp).slice(0, 20);
  return [...winners, ...losers].map((entry) => ({
    year: entry.year,
    raceDate: entry.raceDate,
    courseName: entry.courseName,
    raceName: entry.raceName,
    horseName: entry.horseName,
    sp: entry.sp,
    result: entry.won ? "winner" : "loser",
    probability: entry.probability,
    rank2Probability: entry.rank2Probability,
    topPositiveContributors: topContributors(entry, names, families, "positive", 5),
    topNegativeContributors: topContributors(entry, names, families, "negative", 5),
  }));
}

function topContributors(entry: Entry, names: string[], families: Family[], direction: "positive" | "negative", count: number) {
  return [...entry.contributions.keys()]
    .filter((index) => direction === "positive" ? entry.contributions[index]! > 0 : entry.contributions[index]! < 0)
    .sort((a, b) => direction === "positive" ? entry.contributions[b]! - entry.contributions[a]! : entry.contributions[a]! - entry.contributions[b]!)
    .slice(0, count)
    .map((index) => ({ feature: names[index]!, family: families[index]!, contribution: entry.contributions[index]!, rawValue: index < AW_TISSUE_FEATURES.length ? entry.rawInputs[index] : entry.modelInputs[index]! }));
}

function summarize(rows: Entry[]) {
  const expected = sum(rows.map((row) => row.probability));
  const winners = rows.filter((row) => row.won).length;
  return {
    selections: rows.length,
    races: new Set(rows.map((row) => row.raceId)).size,
    winners,
    strike: ratio(winners, rows.length),
    tissueExpected: expected,
    calibrationRatio: ratio(winners, expected),
    meanProbability: mean(rows.map((row) => row.probability)),
    medianProbability: median(rows.map((row) => row.probability)),
    meanSp: mean(rows.map((row) => row.sp)),
    medianSp: median(rows.map((row) => row.sp)),
  };
}

function marginSummary(rows: Entry[]) {
  return {
    meanGap: mean(rows.map((row) => row.probabilityGapToRank2)),
    medianGap: median(rows.map((row) => row.probabilityGapToRank2)),
    meanRatio: mean(rows.flatMap((row) => row.probabilityRatioToRank2 === null ? [] : [row.probabilityRatioToRank2])),
    bands: [
      band(rows, "gap <=1pp", (row) => row.probabilityGapToRank2 <= 0.01),
      band(rows, "1-2.5pp", (row) => row.probabilityGapToRank2 > 0.01 && row.probabilityGapToRank2 <= 0.025),
      band(rows, "2.5-5pp", (row) => row.probabilityGapToRank2 > 0.025 && row.probabilityGapToRank2 <= 0.05),
      band(rows, ">5pp", (row) => row.probabilityGapToRank2 > 0.05),
    ],
  };
}

function marketSummary(rows: Entry[]) {
  return {
    meanTissueProbability: mean(rows.map((row) => row.probability)),
    meanMarketProbability: mean(rows.map((row) => 1 / row.sp)),
    meanAbsoluteProbabilityGap: mean(rows.map((row) => row.probability - 1 / row.sp)),
    medianAbsoluteProbabilityGap: median(rows.map((row) => row.probability - 1 / row.sp)),
    meanTissueMarketRatio: mean(rows.map((row) => row.probability * row.sp)),
    medianTissueMarketRatio: median(rows.map((row) => row.probability * row.sp)),
  };
}

function band(rows: Entry[], label: string, predicate: (entry: Entry) => boolean) {
  const count = rows.filter(predicate).length;
  return { band: label, count, rate: ratio(count, rows.length) };
}

function diagnose(familyComparison: ReturnType<typeof compareFamilyStats>, ablations: AblationRow[]) {
  const top = familyComparison[0];
  const bestAblation = [...ablations].sort((a, b) => b.displacedLongRank1 - a.displacedLongRank1)[0]!;
  const materialSingle = bestAblation.displacementRate !== null && bestAblation.displacementRate >= 0.25;
  return {
    mainReason: top ? `${top.family} contributes ${fmt(top.primaryMean)} on long-priced rank-1 horses versus ${fmt(top.comparisonMean)} on ordinary rank-1 horses.` : "No clear contribution difference.",
    dominantFamily: top?.family ?? null,
    classification: materialSingle && top ? "ONE LIKELY DRIVER" : "MULTIPLE LIKELY DRIVERS",
    bestAblation,
    recommendation: materialSingle && top?.family ? "B. Create prospective shadow with one specific feature family reduced/removed" : "A. Keep current AW Tissue + 20/1 cap",
  };
}

function markdown(report: DiagnosticReport) {
  const lines = [
    "# AW Tissue Longshot Feature Attribution",
    "",
    "## Executive Summary",
    "",
    `Primary cohort: ${report.cohortSummary.primary.selections} AW rank-1 selections at final SP >20/1, ${report.cohortSummary.primary.winners} winners, ${fmt(report.cohortSummary.primary.tissueExpected)} expected, calibration ${fmt(report.cohortSummary.primary.calibrationRatio)}.`,
    `Largest family difference: ${report.familyComparison[0]?.family ?? "-"} (${fmt(report.familyComparison[0]?.difference)} raw-score contribution versus ordinary rank-1).`,
    `Diagnosis: ${report.diagnosis.classification}. Recommendation: ${report.diagnosis.recommendation}.`,
    "",
    "## Cohort",
    table(["cohort", "selections", "winners", "expected", "calibration", "mean prob", "median SP"], [
      ["AW rank-1 >20/1", report.cohortSummary.primary.selections, report.cohortSummary.primary.winners, fmt(report.cohortSummary.primary.tissueExpected), fmt(report.cohortSummary.primary.calibrationRatio), pct(report.cohortSummary.primary.meanProbability), fmt(report.cohortSummary.primary.medianSp, 2)],
      ["AW rank-1 <=20/1", report.cohortSummary.ordinaryRankOne.selections, report.cohortSummary.ordinaryRankOne.winners, fmt(report.cohortSummary.ordinaryRankOne.tissueExpected), fmt(report.cohortSummary.ordinaryRankOne.calibrationRatio), pct(report.cohortSummary.ordinaryRankOne.meanProbability), fmt(report.cohortSummary.ordinaryRankOne.medianSp, 2)],
      [">20/1 winners", report.cohortSummary.longRankOneWinners.selections, report.cohortSummary.longRankOneWinners.winners, fmt(report.cohortSummary.longRankOneWinners.tissueExpected), fmt(report.cohortSummary.longRankOneWinners.calibrationRatio), pct(report.cohortSummary.longRankOneWinners.meanProbability), fmt(report.cohortSummary.longRankOneWinners.medianSp, 2)],
      [">20/1 losers", report.cohortSummary.longRankOneLosers.selections, report.cohortSummary.longRankOneLosers.winners, fmt(report.cohortSummary.longRankOneLosers.tissueExpected), fmt(report.cohortSummary.longRankOneLosers.calibrationRatio), pct(report.cohortSummary.longRankOneLosers.meanProbability), fmt(report.cohortSummary.longRankOneLosers.medianSp, 2)],
      ["all AW runners", report.cohortSummary.allAwRunners.selections, report.cohortSummary.allAwRunners.winners, fmt(report.cohortSummary.allAwRunners.tissueExpected), fmt(report.cohortSummary.allAwRunners.calibrationRatio), pct(report.cohortSummary.allAwRunners.meanProbability), fmt(report.cohortSummary.allAwRunners.medianSp, 2)],
    ]),
    "## Feature Contributions",
    "",
    "Exact feature set: " + report.model.featureNames.join(", "),
    "",
    table(["feature", "family", "coef", "mean raw", "mean z", "mean contrib", "median contrib", "top3 + rate"], report.featureStats.map((row) => [row.feature, row.family, fmt(row.coefficient), fmt(row.meanRawValue), fmt(row.meanStandardizedValue), fmt(row.meanContribution), fmt(row.medianContribution), pct(row.top3PositiveRate)])),
    "## Long-priced vs Ordinary Rank-1",
    table(["feature", "family", "long mean", "ordinary mean", "diff", "top3 diff"], report.featureComparison.slice(0, 20).map((row: ComparisonRow) => [row.feature, row.family, fmt(row.primaryMean), fmt(row.comparisonMean), fmt(row.difference), pct(row.top3RateDifference)])),
    table(["family", "long mean", "ordinary mean", "diff", "long median", "ordinary median"], report.familyComparison.map((row) => [row.family, fmt(row.primaryMean), fmt(row.comparisonMean), fmt(row.difference), fmt(row.primaryMedian), fmt(row.comparisonMedian)])),
    "## Winners vs Losers",
    table(["feature", "family", "winner mean", "loser mean", "std diff", "direction"], report.winnerLoserFeature.slice(0, 20).map((row: SplitRow) => [row.name, row.family ?? "", fmt(row.winnerMean), fmt(row.loserMean), fmt(row.standardizedDifference), row.direction])),
    table(["family", "winner mean", "loser mean", "std diff", "direction"], report.winnerLoserFamily.map((row: SplitRow) => [row.name, fmt(row.winnerMean), fmt(row.loserMean), fmt(row.standardizedDifference), row.direction])),
    "## 2025 vs 2026",
    table(["feature", "combined diff", "2025 diff", "2026 diff", "classification"], report.yearReplication.map((row) => [row.feature, fmt(row.difference), fmt(row.years[0]!.difference), fmt(row.years[1]!.difference), row.classification])),
    "## Speed / Ratings",
    table(["feature", "long raw", "ordinary raw", "long contrib", "ordinary contrib", "diff"], report.speedRatings.map((row) => [row.feature, fmt(row.primaryMeanRaw), fmt(row.ordinaryMeanRaw), fmt(row.primaryMeanContribution), fmt(row.ordinaryMeanContribution), fmt(row.contributionDifference)])),
    "## Trainer / Jockey",
    table(["metric", "long", "ordinary", "diff"], [
      ["trainer contribution", fmt(report.trainerJockey.primaryTrainerMean), fmt(report.trainerJockey.ordinaryTrainerMean), fmt(diff(report.trainerJockey.primaryTrainerMean, report.trainerJockey.ordinaryTrainerMean))],
      ["jockey contribution", fmt(report.trainerJockey.primaryJockeyMean), fmt(report.trainerJockey.ordinaryJockeyMean), fmt(diff(report.trainerJockey.primaryJockeyMean, report.trainerJockey.ordinaryJockeyMean))],
      ["combined", fmt(report.trainerJockey.primaryCombinedMean), fmt(report.trainerJockey.ordinaryCombinedMean), fmt(report.trainerJockey.combinedDifference)],
    ]),
    "## Missing-data Signals",
    table(["feature", "long rate", "ordinary rate", "rate diff", "long contrib", "positive when missing"], report.missingData.map((row) => [row.feature, pct(row.primaryRate), pct(row.ordinaryRate), pct(row.rateDifference), fmt(row.primaryMeanContribution), row.positiveContributionWhenMissing ? "yes" : "no"])),
    "## Rank-1 Margin",
    table(["cohort", "mean gap", "median gap", "mean ratio"], [["long", pct(report.scoreMargin.primary.meanGap), pct(report.scoreMargin.primary.medianGap), fmt(report.scoreMargin.primary.meanRatio)], ["ordinary", pct(report.scoreMargin.ordinaryRankOne.meanGap), pct(report.scoreMargin.ordinaryRankOne.medianGap), fmt(report.scoreMargin.ordinaryRankOne.meanRatio)]]),
    table(["long gap band", "count", "rate"], report.scoreMargin.primary.bands.map((row) => [row.band, row.count, pct(row.rate)])),
    "## Market Disagreement",
    table(["cohort", "tissue prob", "market prob", "prob gap", "tissue/market"], [["long", pct(report.marketDisagreement.primary.meanTissueProbability), pct(report.marketDisagreement.primary.meanMarketProbability), pct(report.marketDisagreement.primary.meanAbsoluteProbabilityGap), fmt(report.marketDisagreement.primary.meanTissueMarketRatio)], ["winners", pct(report.marketDisagreement.winners.meanTissueProbability), pct(report.marketDisagreement.winners.meanMarketProbability), pct(report.marketDisagreement.winners.meanAbsoluteProbabilityGap), fmt(report.marketDisagreement.winners.meanTissueMarketRatio)], ["losers", pct(report.marketDisagreement.losers.meanTissueProbability), pct(report.marketDisagreement.losers.meanMarketProbability), pct(report.marketDisagreement.losers.meanAbsoluteProbabilityGap), fmt(report.marketDisagreement.losers.meanTissueMarketRatio)]]),
    "## Feature Ablations",
    table(["ablation", "displaced", "rate", "2026 rank1", "2026 top3", "2026 logloss", "2026 brier"], report.ablations.map((row: AblationRow) => [row.ablation, row.displacedLongRank1, pct(row.displacementRate), pct(row.rankOne2026Strike), pct(row.top3Capture2026), fmt(row.logLoss2026), fmt(row.brier2026)])),
    "## Example Horses",
    ...report.examples.flatMap((example) => [
      `### ${example.raceDate} ${example.courseName} - ${example.horseName}`,
      "",
      `SP ${fmt(example.sp, 2)}, ${example.result}, AW Tissue ${pct(example.probability)}, rank-2 ${pct(example.rank2Probability)}.`,
      "",
      `Top positive: ${example.topPositiveContributors.map((x) => `${x.feature} ${fmt(x.contribution)}`).join("; ")}`,
      "",
      `Top negative: ${example.topNegativeContributors.map((x) => `${x.feature} ${fmt(x.contribution)}`).join("; ")}`,
      "",
    ]),
    "## Diagnosis",
    "",
    `A. Main reason: ${report.diagnosis.mainReason}`,
    `B. Dominant family: ${report.diagnosis.dominantFamily ?? "none"}.`,
    `C. Replication: see strongest feature table above; replicated features are those marked REPLICATED.`,
    "D. Cause classification: " + report.diagnosis.classification + ".",
    `E. Best single ablation: ${report.diagnosis.bestAblation.ablation}, displacing ${report.diagnosis.bestAblation.displacedLongRank1}/${report.diagnosis.bestAblation.longRank1Before} long-priced rank-1 selections.`,
    "",
    "## Recommendation",
    "",
    report.diagnosis.recommendation,
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function printSummary(report: DiagnosticReport) {
  const drivers = report.familyComparison.slice(0, 2);
  const ratingDiff = report.familyComparison.find((row) => row.family === "speed / ratings")?.difference ?? 0;
  const trainerDiff = report.familyComparison.find((row) => row.family === "trainer")?.difference ?? 0;
  const jockeyDiff = report.familyComparison.find((row) => row.family === "jockey")?.difference ?? 0;
  const missingDiff = report.familyComparison.find((row) => row.family === "missing-data indicators")?.difference ?? 0;
  console.log(`Wrote ${OUTPUT}.md`);
  console.log(`Wrote ${OUTPUT}.json`);
  console.log("");
  console.log("AW >20/1 RANK-1");
  console.log(`Selections: ${report.cohortSummary.primary.selections}`);
  console.log(`Winners: ${report.cohortSummary.primary.winners}`);
  console.log("");
  console.log(`TOP DRIVER 1: ${drivers[0]?.family ?? "-"}`);
  console.log(`Contribution difference: ${fmt(drivers[0]?.difference)}`);
  console.log(`Replication: ${replicationForFamily(report, drivers[0]?.family)}`);
  console.log("");
  console.log(`TOP DRIVER 2: ${drivers[1]?.family ?? "-"}`);
  console.log(`Contribution difference: ${fmt(drivers[1]?.difference)}`);
  console.log(`Replication: ${replicationForFamily(report, drivers[1]?.family)}`);
  console.log("");
  console.log(`SPEED/RATINGS: ${driverLevel(ratingDiff)}`);
  console.log(`TRAINER: ${driverLevel(trainerDiff)}`);
  console.log(`JOCKEY: ${driverLevel(jockeyDiff)}`);
  console.log(`MISSING DATA: ${driverLevel(missingDiff)}`);
  console.log("");
  console.log(`BEST SINGLE ABLATION: ${report.diagnosis.bestAblation.ablation}`);
  console.log(`Long-priced rank1 displaced: ${report.diagnosis.bestAblation.displacedLongRank1}`);
  console.log(`2026 rank1 effect: ${pct(report.diagnosis.bestAblation.rankOne2026Strike)} strike, ${pct(report.diagnosis.bestAblation.top3Capture2026)} top-3`);
  console.log("");
  console.log(`Diagnosis: ${report.diagnosis.classification}`);
  console.log(`Recommendation: ${report.diagnosis.recommendation[0]}`);
}

function replicationForFamily(report: DiagnosticReport, family: Family | undefined) {
  if (!family) return "-";
  const rows = report.yearReplication.filter((row) => row.family === family);
  if (!rows.length) return "-";
  return rows.some((row) => row.classification === "REPLICATED") ? "REPLICATED" : rows.map((row) => row.classification).join("/");
}

function driverLevel(diffValue: number) {
  const value = Math.abs(diffValue);
  return value >= 0.25 ? "Major driver" : value >= 0.1 ? "Elevated" : "Normal";
}

function featureIndex(feature: string) {
  const index = [...AW_TISSUE_FEATURES, ...AW_TISSUE_FEATURES.map((name) => `${name}_missing`)].indexOf(feature as never);
  if (index < 0) throw new Error(`Unknown AW feature: ${feature}`);
  return index;
}

function isLongPrice(sp: number) { return sp > LONG_SP; }
function sum(values: number[]) { return values.reduce((a, b) => a + b, 0); }
function mean(values: number[]): number | null { return values.length ? sum(values) / values.length : null; }
function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}
function ratio(a: number, b: number): number | null { return b ? a / b : null; }
function diff(a: number | null | undefined, b: number | null | undefined): number | null { return a == null || b == null ? null : a - b; }
function pooledSd(a: number[], b: number[]) {
  const all = [...a, ...b], m = mean(all);
  return m === null || all.length < 2 ? null : Math.sqrt(sum(all.map((value) => (value - m) ** 2)) / (all.length - 1));
}
function softmax(scores: number[]) {
  const max = Math.max(...scores), exp = scores.map((score) => Math.exp(score - max)), total = sum(exp);
  return exp.map((value) => value / total);
}
function fmt(n: number | null | undefined, digits = 4) { return typeof n === "number" && Number.isFinite(n) ? n.toFixed(digits) : "-"; }
function pct(n: number | null | undefined) { return typeof n === "number" && Number.isFinite(n) ? `${(100 * n).toFixed(2)}%` : "-"; }
function table(headers: string[], rows: Array<Array<string | number>>) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map((value) => String(value).replaceAll("|", "\\|")).join(" | ")} |`),
    "",
  ].join("\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
