import { writeFile } from "node:fs/promises";
import { createDbConnection } from "@/db";
import { settleSelection } from "@/lib/racing/backtest";
import { loadBacktestFeatureCache } from "@/lib/racing/backtest-cache";
import type { HistoricalPreRaceFeatureRow, HistoricalTargetRunnerMetricsRow } from "@/lib/racing/historical-target-metrics";
import { classifyJumpRaceSubtype } from "@/lib/racing/jump-speed-rating";
import { JUMP_TISSUE_MODEL_PATH, loadJumpTissueModel, type JumpTissueModel } from "@/lib/racing/jump-tissue-model";
import { classifyHandicapStatus } from "@/lib/racing/research-rule";
import { loadHistoricalComments, priorCommentsForTarget, raceSoftmax, commentVector, type HistoricalComment } from "./diagnose-independent-tissue-feasibility";

const OUTPUT = "/tmp/jump-tissue-feature-attribution";
const YEARS = ["2025", "2026"] as const;
const STRONG_DRIVER_COUNT = 20;
const REPLICATION_EPSILON = 0.02;

type Year = typeof YEARS[number];
type Family =
  | "speed / ratings"
  | "recent form"
  | "class"
  | "trainer"
  | "jockey"
  | "comments / text-derived signals"
  | "recency"
  | "distance"
  | "going"
  | "weight"
  | "field/race context"
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
  rawScore: number;
  rawInputs: number[];
  standardizedInputs: number[];
  contributions: number[];
};

type FeatureStat = {
  feature: string;
  family: Family;
  meanContribution: number | null;
  medianContribution: number | null;
  meanRawValue: number | null;
  meanStandardizedValue: number | null;
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
  feature: string;
  family: Family;
  winnerMeanContribution: number | null;
  loserMeanContribution: number | null;
  standardizedDifference: number | null;
  direction: "winner higher" | "loser higher" | "flat";
  winnerMeanRawValue: number | null;
  loserMeanRawValue: number | null;
};

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

type CohortSummary = ReturnType<typeof summarize>;
type ContributionGroupSummary = ReturnType<typeof contributionSummary>;
type DiagnosticReport = {
  generatedAt: string;
  source: string;
  model: { path: typeof JUMP_TISSUE_MODEL_PATH; checksum: string; featureCount: number };
  contributionMethod: string;
  definitions: Record<string, string | boolean>;
  cohortSummary: {
    primary: CohortSummary;
    shortRankOne: CohortSummary;
    longRankOneWinners: CohortSummary;
    longRankOneLosers: CohortSummary;
    allHurdleRunners: CohortSummary;
    allHurdleWinners: CohortSummary;
  };
  featureStats: FeatureStat[];
  featureComparison: ComparisonRow[];
  familyStats: FamilyStat[];
  familyComparison: FamilyComparisonRow[];
  winnerLoserFeature: SplitRow[];
  winnerLoserFamily: SplitRow[];
  yearReplication: Array<ComparisonRow & {
    years: Array<{ year: Year; primaryMean: number | null; shortRankOneMean: number | null; difference: number | null }>;
    classification: string;
  }>;
  commentDiagnostics: {
    primary: ContributionGroupSummary;
    shortRankOne: ContributionGroupSummary;
    longRankOneLosers: ContributionGroupSummary;
    yearComparison: Array<{ year: Year; primary: ContributionGroupSummary; shortRankOne: ContributionGroupSummary }>;
    strongestCommentFeatures: ComparisonRow[];
  };
  speedFormDiagnostics: Array<{
    feature: string;
    primaryMeanContribution: number | null;
    shortRankOneMeanContribution: number | null;
    contributionDifference: number | null;
    primaryMeanRawValue: number | null;
    shortRankOneMeanRawValue: number | null;
  }>;
  examples: Array<{
    year: Year;
    raceDate: string;
    courseName: string;
    horseName: string;
    sp: number;
    won: boolean;
    probability: number;
    rawScore: number;
    topPositiveContributors: Array<{ feature: string; family: Family; contribution: number; rawValue: number }>;
    topNegativeContributors: Array<{ feature: string; family: Family; contribution: number; rawValue: number }>;
  }>;
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

  const entries = buildEntries(caches.flatMap((cache) => cache!.rows), comments, model.model);
  const hurdle = entries;
  const primary = hurdle.filter((entry) => entry.rank === 1 && isLongPrice(entry.sp));
  const shortRankOne = hurdle.filter((entry) => entry.rank === 1 && !isLongPrice(entry.sp));
  const primaryWinners = primary.filter((entry) => entry.won);
  const primaryLosers = primary.filter((entry) => !entry.won);
  const allHurdleWinners = hurdle.filter((entry) => entry.won);

  const featureFamilies = model.model.names.map(featureFamily);
  const featureStats = statsByFeature(primary, model.model.names, featureFamilies);
  const shortFeatureStats = statsByFeature(shortRankOne, model.model.names, featureFamilies);
  const featureComparison = compareFeatureStats(featureStats, shortFeatureStats);
  const familyStats = statsByFamily(primary, model.model.names, featureFamilies);
  const shortFamilyStats = statsByFamily(shortRankOne, model.model.names, featureFamilies);
  const familyComparison = compareFamilyStats(familyStats, shortFamilyStats);
  const winnerLoserFeature = splitByFeature(primaryWinners, primaryLosers, model.model.names, featureFamilies);
  const winnerLoserFamily = splitByFamily(primaryWinners, primaryLosers, model.model.names, featureFamilies);
  const strongestDrivers = strongestDriverReplication(primary, shortRankOne, model.model.names, featureFamilies);

  const report: DiagnosticReport = {
    generatedAt: new Date().toISOString(),
    source: "Frozen Jump Tissue v1 over the same 2025/2026 backtest_features_v4 Sporting Life jump caches used by the Hurdle long-price calibration diagnostic.",
    model: { path: JUMP_TISSUE_MODEL_PATH, checksum: model.checksum, featureCount: model.model.names.length },
    contributionMethod: "Exact linear contribution: ((raw feature value - frozen training mean) / frozen training scale) * frozen coefficient. The race softmax is applied after summing raw runner scores, so contributions explain raw score and therefore within-race ranking pressure.",
    definitions: {
      primaryCohort: "Hurdle races only, Jump Tissue rank = 1, final decimal SP > 15.0 (>14/1).",
      shortRankOneComparison: "Hurdle races only, Jump Tissue rank = 1, final decimal SP <= 15.0.",
      settlement: "Canonical settlement via settleSelection; incomplete/void fields and races without exactly one winner excluded.",
      noModelChange: true,
    },
    cohortSummary: {
      primary: summarize(primary),
      shortRankOne: summarize(shortRankOne),
      longRankOneWinners: summarize(primaryWinners),
      longRankOneLosers: summarize(primaryLosers),
      allHurdleRunners: summarize(hurdle),
      allHurdleWinners: summarize(allHurdleWinners),
    },
    featureStats,
    featureComparison,
    familyStats,
    familyComparison,
    winnerLoserFeature,
    winnerLoserFamily,
    yearReplication: strongestDrivers,
    commentDiagnostics: commentDiagnostics(primary, shortRankOne, primaryLosers, model.model.names, featureFamilies),
    speedFormDiagnostics: speedFormDiagnostics(primary, shortRankOne, model.model.names),
    examples: topPrimaryExamples(primary, model.model.names, featureFamilies),
  };

  await writeFile(`${OUTPUT}.json`, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(`${OUTPUT}.md`, markdown(report), "utf8");
  printSummary(report);
}

function buildEntries(rows: HistoricalTargetRunnerMetricsRow[], commentsByHorse: Map<string, HistoricalComment[]>, model: JumpTissueModel["model"]): Entry[] {
  const supported = rows.filter((row) => row.features.raceCode === "jump" && classifyJumpRaceSubtype(row.features) === "hurdle");
  const byRace = groupBy(supported, (row) => row.features.targetRaceId);
  const entries: Entry[] = [];
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

    const vectors = active.map((row) => [...numericVector(row.features), ...commentVector(priorCommentsForTarget(commentsByHorse.get(row.features.horseId) ?? [], row.features.raceDateTime))]);
    const contributions = vectors.map((vector) => contributionVector(model, vector));
    const scores = contributions.map(sum);
    const probabilities = raceSoftmax(scores);
    const ranked = active.map((row, index) => ({ row, probability: probabilities[index]! }))
      .sort((left, right) => right.probability - left.probability || left.row.features.targetRunnerId.localeCompare(right.row.features.targetRunnerId));
    const rankByRunner = new Map(ranked.map((entry, index) => [entry.row.features.targetRunnerId, index + 1]));
    for (const [index, row] of active.entries()) {
      const settlement = settlements[index]!;
      entries.push({
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
        rank: rankByRunner.get(row.features.targetRunnerId)!,
        rawScore: scores[index]!,
        rawInputs: vectors[index]!,
        standardizedInputs: standardizedVector(model, vectors[index]!),
        contributions: contributions[index]!,
      });
    }
  }
  return entries;
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

function contributionVector(model: JumpTissueModel["model"], values: number[]) {
  return values.map((value, index) => ((value - model.means[index]!) / model.scales[index]!) * model.weights[index]!);
}

function standardizedVector(model: JumpTissueModel["model"], values: number[]) {
  return values.map((value, index) => (value - model.means[index]!) / model.scales[index]!);
}

function statsByFeature(entries: Entry[], names: string[], families: Family[]): FeatureStat[] {
  const top3Counts = top3FeatureCounts(entries);
  return names.map((feature, index) => {
    const values = entries.map((entry) => entry.contributions[index]!);
    const top3PositiveFrequency = top3Counts.get(index) ?? 0;
    return {
      feature,
      family: families[index]!,
      meanContribution: meanOrNull(values),
      medianContribution: median(values),
      meanRawValue: meanOrNull(entries.map((entry) => entry.rawInputs[index]!)),
      meanStandardizedValue: meanOrNull(entries.map((entry) => entry.standardizedInputs[index]!)),
      top3PositiveFrequency,
      top3PositiveRate: ratio(top3PositiveFrequency, entries.length),
    };
  });
}

function statsByFamily(entries: Entry[], names: string[], families: Family[]): FamilyStat[] {
  const familyIndexes = indexesByFamily(names, families);
  const top3Counts = top3FamilyCounts(entries, families);
  return [...familyIndexes].map(([family, indexes]) => {
    const values = entries.map((entry) => sum(indexes.map((index) => entry.contributions[index]!)));
    const top3PositiveFrequency = top3Counts.get(family) ?? 0;
    return {
      family,
      meanContribution: meanOrNull(values),
      medianContribution: median(values),
      top3PositiveFrequency,
      top3PositiveRate: ratio(top3PositiveFrequency, entries.length),
    };
  });
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
      difference: nullableDiff(row.meanContribution, other.meanContribution),
      primaryMedian: row.medianContribution,
      comparisonMedian: other.medianContribution,
      primaryTop3Rate: row.top3PositiveRate,
      comparisonTop3Rate: other.top3PositiveRate,
      top3RateDifference: nullableDiff(row.top3PositiveRate, other.top3PositiveRate),
    };
  }).sort((left, right) => Math.abs(right.difference ?? 0) - Math.abs(left.difference ?? 0));
}

function compareFamilyStats(primary: FamilyStat[], comparison: FamilyStat[]): FamilyComparisonRow[] {
  const byFamily = new Map(comparison.map((row) => [row.family, row]));
  return primary.map((row) => {
    const other = byFamily.get(row.family)!;
    return {
      family: row.family,
      primaryMean: row.meanContribution,
      comparisonMean: other.meanContribution,
      difference: nullableDiff(row.meanContribution, other.meanContribution),
      primaryMedian: row.medianContribution,
      comparisonMedian: other.medianContribution,
    };
  }).sort((left, right) => Math.abs(right.difference ?? 0) - Math.abs(left.difference ?? 0));
}

function splitByFeature(winners: Entry[], losers: Entry[], names: string[], families: Family[]): SplitRow[] {
  return names.map((feature, index) => {
    const winnerValues = winners.map((entry) => entry.contributions[index]!);
    const loserValues = losers.map((entry) => entry.contributions[index]!);
    const winnerMean = meanOrNull(winnerValues);
    const loserMean = meanOrNull(loserValues);
    const diff = standardizedDifference(winnerValues, loserValues);
    return {
      feature,
      family: families[index]!,
      winnerMeanContribution: winnerMean,
      loserMeanContribution: loserMean,
      standardizedDifference: diff,
      direction: direction(winnerMean, loserMean),
      winnerMeanRawValue: meanOrNull(winners.map((entry) => entry.rawInputs[index]!)),
      loserMeanRawValue: meanOrNull(losers.map((entry) => entry.rawInputs[index]!)),
    };
  }).sort((left, right) => Math.abs(right.standardizedDifference ?? 0) - Math.abs(left.standardizedDifference ?? 0));
}

function splitByFamily(winners: Entry[], losers: Entry[], names: string[], families: Family[]): SplitRow[] {
  return [...indexesByFamily(names, families)].map(([family, indexes]) => {
    const winnerValues = winners.map((entry) => sum(indexes.map((index) => entry.contributions[index]!)));
    const loserValues = losers.map((entry) => sum(indexes.map((index) => entry.contributions[index]!)));
    const winnerMean = meanOrNull(winnerValues);
    const loserMean = meanOrNull(loserValues);
    return {
      feature: family,
      family,
      winnerMeanContribution: winnerMean,
      loserMeanContribution: loserMean,
      standardizedDifference: standardizedDifference(winnerValues, loserValues),
      direction: direction(winnerMean, loserMean),
      winnerMeanRawValue: null,
      loserMeanRawValue: null,
    };
  }).sort((left, right) => Math.abs(right.standardizedDifference ?? 0) - Math.abs(left.standardizedDifference ?? 0));
}

function strongestDriverReplication(primary: Entry[], shortRankOne: Entry[], names: string[], families: Family[]) {
  const combined = compareFeatureStats(statsByFeature(primary, names, families), statsByFeature(shortRankOne, names, families)).slice(0, STRONG_DRIVER_COUNT);
  return combined.map((row) => {
    const years = YEARS.map((year) => {
      const primaryYear = primary.filter((entry) => entry.year === year);
      const shortYear = shortRankOne.filter((entry) => entry.year === year);
      const index = names.indexOf(row.feature);
      const primaryMean = meanOrNull(primaryYear.map((entry) => entry.contributions[index]!));
      const shortMean = meanOrNull(shortYear.map((entry) => entry.contributions[index]!));
      return { year, primaryMean, shortRankOneMean: shortMean, difference: nullableDiff(primaryMean, shortMean) };
    });
    const differences = years.map((item) => item.difference);
    return { ...row, years, classification: replicateStatus(differences[0] ?? null, differences[1] ?? null) };
  });
}

function commentDiagnostics(primary: Entry[], shortRankOne: Entry[], primaryLosers: Entry[], names: string[], families: Family[]) {
  const indexes = names.map((name, index) => ({ name, index, family: families[index]! })).filter((item) => item.family === "comments / text-derived signals");
  return {
    primary: contributionSummary(primary, indexes.map((item) => item.index)),
    shortRankOne: contributionSummary(shortRankOne, indexes.map((item) => item.index)),
    longRankOneLosers: contributionSummary(primaryLosers, indexes.map((item) => item.index)),
    yearComparison: YEARS.map((year) => ({
      year,
      primary: contributionSummary(primary.filter((entry) => entry.year === year), indexes.map((item) => item.index)),
      shortRankOne: contributionSummary(shortRankOne.filter((entry) => entry.year === year), indexes.map((item) => item.index)),
    })),
    strongestCommentFeatures: compareFeatureStats(
      statsByFeature(primary, names, families).filter((row) => row.family === "comments / text-derived signals"),
      statsByFeature(shortRankOne, names, families).filter((row) => row.family === "comments / text-derived signals"),
    ).slice(0, 12),
  };
}

function speedFormDiagnostics(primary: Entry[], shortRankOne: Entry[], names: string[]) {
  const watched = [
    "latest_jump_speed",
    "best_l3_jump_speed",
    "avg_l3_jump_speed",
    "latest_jump_speed_missing",
    "best_l3_jump_speed_missing",
    "avg_l3_jump_speed_missing",
    "official_rating",
    "official_rating_missing",
    "class",
    "days_since_run",
    "log_prior_jump_starts",
  ];
  return watched.map((feature) => {
    const index = names.indexOf(feature);
    const primaryValues = primary.map((entry) => entry.contributions[index]!);
    const shortValues = shortRankOne.map((entry) => entry.contributions[index]!);
    return {
      feature,
      primaryMeanContribution: meanOrNull(primaryValues),
      shortRankOneMeanContribution: meanOrNull(shortValues),
      contributionDifference: nullableDiff(meanOrNull(primaryValues), meanOrNull(shortValues)),
      primaryMeanRawValue: meanOrNull(primary.map((entry) => entry.rawInputs[index]!)),
      shortRankOneMeanRawValue: meanOrNull(shortRankOne.map((entry) => entry.rawInputs[index]!)),
    };
  }).sort((left, right) => Math.abs(right.contributionDifference ?? 0) - Math.abs(left.contributionDifference ?? 0));
}

function topPrimaryExamples(primary: Entry[], names: string[], families: Family[]) {
  return [...primary].sort((left, right) => right.probability - left.probability).slice(0, 12).map((entry) => ({
    year: entry.year,
    raceDate: entry.raceDate,
    courseName: entry.courseName,
    horseName: entry.horseName,
    sp: entry.sp,
    won: entry.won,
    probability: entry.probability,
    rawScore: entry.rawScore,
    topPositiveContributors: topContributors(entry, names, families, 5, "positive"),
    topNegativeContributors: topContributors(entry, names, families, 5, "negative"),
  }));
}

function contributionSummary(entries: Entry[], indexes: number[]) {
  const values = entries.map((entry) => sum(indexes.map((index) => entry.contributions[index]!)));
  const positiveScoreShare = entries.map((entry) => {
    const positiveTotal = sum(entry.contributions.filter((value) => value > 0));
    if (positiveTotal <= 0) return null;
    return sum(indexes.map((index) => Math.max(0, entry.contributions[index]!))) / positiveTotal;
  }).filter((value): value is number => value !== null);
  return {
    count: entries.length,
    meanContribution: meanOrNull(values),
    medianContribution: median(values),
    meanPositiveScoreShare: meanOrNull(positiveScoreShare),
  };
}

function topContributors(entry: Entry, names: string[], families: Family[], count: number, directionType: "positive" | "negative") {
  return entry.contributions.map((value, index) => ({ feature: names[index]!, family: families[index]!, contribution: value, rawValue: entry.rawInputs[index]! }))
    .filter((item) => directionType === "positive" ? item.contribution > 0 : item.contribution < 0)
    .sort((left, right) => directionType === "positive" ? right.contribution - left.contribution : left.contribution - right.contribution)
    .slice(0, count);
}

function top3FeatureCounts(entries: Entry[]) {
  const counts = new Map<number, number>();
  for (const entry of entries) {
    const top = entry.contributions.map((value, index) => ({ value, index })).filter((item) => item.value > 0).sort((left, right) => right.value - left.value).slice(0, 3);
    for (const item of top) counts.set(item.index, (counts.get(item.index) ?? 0) + 1);
  }
  return counts;
}

function top3FamilyCounts(entries: Entry[], families: Family[]) {
  const counts = new Map<Family, number>();
  for (const entry of entries) {
    const familyTotals = [...indexesByFamily(entry.contributions.map(String), families)].map(([family, indexes]) => ({ family, value: sum(indexes.map((index) => entry.contributions[index]!)) }));
    for (const item of familyTotals.filter((row) => row.value > 0).sort((left, right) => right.value - left.value).slice(0, 3)) counts.set(item.family, (counts.get(item.family) ?? 0) + 1);
  }
  return counts;
}

function indexesByFamily(names: string[], families: Family[]) {
  const grouped = new Map<Family, number[]>();
  for (const [index] of names.entries()) grouped.set(families[index]!, [...(grouped.get(families[index]!) ?? []), index]);
  return grouped;
}

function featureFamily(name: string): Family {
  if (/comment|last_|last3_/.test(name)) return "comments / text-derived signals";
  if (/jump_speed|official_rating/.test(name)) return "speed / ratings";
  if (/best_l3|avg_l3|latest_|prior_jump_starts/.test(name)) return "recent form";
  if (/trainer/.test(name)) return "trainer";
  if (/jockey/.test(name)) return "jockey";
  if (/days_since_run/.test(name)) return "recency";
  if (/class|handicap/.test(name)) return "class";
  if (/distance/.test(name)) return "distance";
  if (/going/.test(name)) return "going";
  if (/weight/.test(name)) return "weight";
  if (/field_size/.test(name)) return "field/race context";
  return "other";
}

function summarize(entries: Entry[]) {
  const winners = entries.filter((entry) => entry.won).length;
  const tissueExpected = sum(entries.map((entry) => entry.probability));
  const marketExpected = sum(entries.map((entry) => 1 / entry.sp));
  return {
    runners: entries.length,
    winners,
    tissueExpected,
    calibrationRatio: ratio(winners, tissueExpected),
    marketExpected,
    marketAe: ratio(winners, marketExpected),
    meanProbability: meanOrNull(entries.map((entry) => entry.probability)),
    medianProbability: median(entries.map((entry) => entry.probability)),
    meanSp: meanOrNull(entries.map((entry) => entry.sp)),
    byYear: Object.fromEntries(YEARS.map((year) => [year, {
      runners: entries.filter((entry) => entry.year === year).length,
      winners: entries.filter((entry) => entry.year === year && entry.won).length,
      tissueExpected: sum(entries.filter((entry) => entry.year === year).map((entry) => entry.probability)),
      calibrationRatio: ratio(entries.filter((entry) => entry.year === year && entry.won).length, sum(entries.filter((entry) => entry.year === year).map((entry) => entry.probability))),
    }])),
  };
}

function markdown(report: DiagnosticReport) {
  const primary = report.cohortSummary.primary;
  return [
    "# Jump Tissue Feature Attribution Diagnostic",
    "",
    "Diagnostic only. No production model, tracker, cache, or app behavior was changed.",
    "",
    "## Executive Summary",
    `Primary cohort: ${primary.runners} Hurdle rank-1 runners at SP >14/1, ${primary.winners} winners, Tissue expected ${fmt(primary.tissueExpected)}, calibration ${fmt(primary.calibrationRatio)}, market A/E ${fmt(primary.marketAe)}.`,
    `Exact contribution method: ${report.contributionMethod}`,
    "",
    "Largest family differences versus rank-1 Hurdles SP <=14/1:",
    table(["Family", "Long rank-1 mean", "Short rank-1 mean", "Diff", "Long median", "Short median"], report.familyComparison.map((row) => [row.family, fmt(row.primaryMean), fmt(row.comparisonMean), signed(row.difference), fmt(row.primaryMedian), fmt(row.comparisonMedian)])),
    "## Cohorts",
    table(["Cohort", "Runners", "Winners", "Tissue exp", "Cal", "Market exp", "A/E", "Mean p", "Median p", "Mean SP"], [
      ["Primary long rank-1", primary.runners, primary.winners, fmt(primary.tissueExpected), fmt(primary.calibrationRatio), fmt(primary.marketExpected), fmt(primary.marketAe), pct(primary.meanProbability), pct(primary.medianProbability), fmt(primary.meanSp)],
      ["Rank-1 SP <=14/1", report.cohortSummary.shortRankOne.runners, report.cohortSummary.shortRankOne.winners, fmt(report.cohortSummary.shortRankOne.tissueExpected), fmt(report.cohortSummary.shortRankOne.calibrationRatio), fmt(report.cohortSummary.shortRankOne.marketExpected), fmt(report.cohortSummary.shortRankOne.marketAe), pct(report.cohortSummary.shortRankOne.meanProbability), pct(report.cohortSummary.shortRankOne.medianProbability), fmt(report.cohortSummary.shortRankOne.meanSp)],
      ["Long rank-1 winners", report.cohortSummary.longRankOneWinners.runners, report.cohortSummary.longRankOneWinners.winners, fmt(report.cohortSummary.longRankOneWinners.tissueExpected), fmt(report.cohortSummary.longRankOneWinners.calibrationRatio), fmt(report.cohortSummary.longRankOneWinners.marketExpected), fmt(report.cohortSummary.longRankOneWinners.marketAe), pct(report.cohortSummary.longRankOneWinners.meanProbability), pct(report.cohortSummary.longRankOneWinners.medianProbability), fmt(report.cohortSummary.longRankOneWinners.meanSp)],
      ["Long rank-1 losers", report.cohortSummary.longRankOneLosers.runners, report.cohortSummary.longRankOneLosers.winners, fmt(report.cohortSummary.longRankOneLosers.tissueExpected), fmt(report.cohortSummary.longRankOneLosers.calibrationRatio), fmt(report.cohortSummary.longRankOneLosers.marketExpected), fmt(report.cohortSummary.longRankOneLosers.marketAe), pct(report.cohortSummary.longRankOneLosers.meanProbability), pct(report.cohortSummary.longRankOneLosers.medianProbability), fmt(report.cohortSummary.longRankOneLosers.meanSp)],
      ["All Hurdle runners", report.cohortSummary.allHurdleRunners.runners, report.cohortSummary.allHurdleRunners.winners, fmt(report.cohortSummary.allHurdleRunners.tissueExpected), fmt(report.cohortSummary.allHurdleRunners.calibrationRatio), fmt(report.cohortSummary.allHurdleRunners.marketExpected), fmt(report.cohortSummary.allHurdleRunners.marketAe), pct(report.cohortSummary.allHurdleRunners.meanProbability), pct(report.cohortSummary.allHurdleRunners.medianProbability), fmt(report.cohortSummary.allHurdleRunners.meanSp)],
      ["All Hurdle winners", report.cohortSummary.allHurdleWinners.runners, report.cohortSummary.allHurdleWinners.winners, fmt(report.cohortSummary.allHurdleWinners.tissueExpected), fmt(report.cohortSummary.allHurdleWinners.calibrationRatio), fmt(report.cohortSummary.allHurdleWinners.marketExpected), fmt(report.cohortSummary.allHurdleWinners.marketAe), pct(report.cohortSummary.allHurdleWinners.meanProbability), pct(report.cohortSummary.allHurdleWinners.medianProbability), fmt(report.cohortSummary.allHurdleWinners.meanSp)],
    ]),
    "## Top Positive Contribution Features",
    featureTable(report.featureStats.filter((row) => (row.meanContribution ?? 0) > 0).sort((left, right) => (right.meanContribution ?? 0) - (left.meanContribution ?? 0)).slice(0, 20)),
    "## Top Negative Contribution Features",
    featureTable(report.featureStats.filter((row) => (row.meanContribution ?? 0) < 0).sort((left, right) => (left.meanContribution ?? 0) - (right.meanContribution ?? 0)).slice(0, 20)),
    "## Largest Feature Differences Vs Short Rank-1",
    table(["Feature", "Family", "Long mean", "Short mean", "Diff", "Long top3", "Short top3", "Top3 diff"], report.featureComparison.slice(0, 30).map((row) => [row.feature, row.family, fmt(row.primaryMean), fmt(row.comparisonMean), signed(row.difference), pct(row.primaryTop3Rate), pct(row.comparisonTop3Rate), signedPct(row.top3RateDifference)])),
    "## Long Rank-1 Winners Vs Losers",
    "Descriptive only: 8 winners is too small for model fitting or threshold selection.",
    table(["Family", "Winner mean", "Loser mean", "Std diff", "Direction"], report.winnerLoserFamily.map((row) => [row.family, fmt(row.winnerMeanContribution), fmt(row.loserMeanContribution), signed(row.standardizedDifference), row.direction])),
    table(["Feature", "Family", "Winner mean", "Loser mean", "Std diff", "Direction", "Winner raw", "Loser raw"], report.winnerLoserFeature.slice(0, 30).map((row) => [row.feature, row.family, fmt(row.winnerMeanContribution), fmt(row.loserMeanContribution), signed(row.standardizedDifference), row.direction, fmt(row.winnerMeanRawValue), fmt(row.loserMeanRawValue)])),
    "## 2025 Vs 2026 Replication",
    `Classification uses mean-contribution difference versus short rank-1 by year. Differences below ${fmt(REPLICATION_EPSILON)} raw-score units are treated as weak.`,
    table(["Feature", "Family", "Combined diff", "2025 diff", "2026 diff", "Class"], report.yearReplication.map((row) => [row.feature, row.family, signed(row.difference), signed(row.years[0]!.difference), signed(row.years[1]!.difference), row.classification])),
    "## Comment Features",
    `Long rank-1 comment contribution: mean ${fmt(report.commentDiagnostics.primary.meanContribution)}, median ${fmt(report.commentDiagnostics.primary.medianContribution)}, mean positive-score share ${pct(report.commentDiagnostics.primary.meanPositiveScoreShare)}.`,
    `Short rank-1 comment contribution: mean ${fmt(report.commentDiagnostics.shortRankOne.meanContribution)}, median ${fmt(report.commentDiagnostics.shortRankOne.medianContribution)}, mean positive-score share ${pct(report.commentDiagnostics.shortRankOne.meanPositiveScoreShare)}.`,
    `Long rank-1 loser comment contribution: mean ${fmt(report.commentDiagnostics.longRankOneLosers.meanContribution)}, median ${fmt(report.commentDiagnostics.longRankOneLosers.medianContribution)}, mean positive-score share ${pct(report.commentDiagnostics.longRankOneLosers.meanPositiveScoreShare)}.`,
    table(["Year", "Long mean", "Short mean", "Diff", "Long pos share", "Short pos share"], report.commentDiagnostics.yearComparison.map((row) => [row.year, fmt(row.primary.meanContribution), fmt(row.shortRankOne.meanContribution), signed(nullableDiff(row.primary.meanContribution, row.shortRankOne.meanContribution)), pct(row.primary.meanPositiveScoreShare), pct(row.shortRankOne.meanPositiveScoreShare)])),
    table(["Feature", "Long mean", "Short mean", "Diff", "Long top3", "Short top3"], report.commentDiagnostics.strongestCommentFeatures.map((row) => [row.feature, fmt(row.primaryMean), fmt(row.comparisonMean), signed(row.difference), pct(row.primaryTop3Rate), pct(row.comparisonTop3Rate)])),
    "## Speed / Form Features",
    table(["Feature", "Long contrib", "Short contrib", "Diff", "Long raw", "Short raw"], report.speedFormDiagnostics.map((row) => [row.feature, fmt(row.primaryMeanContribution), fmt(row.shortRankOneMeanContribution), signed(row.contributionDifference), fmt(row.primaryMeanRawValue), fmt(row.shortRankOneMeanRawValue)])),
    "## Highest-Probability Long Rank-1 Examples",
    table(["Date", "Course", "Horse", "SP", "Won", "Prob", "Top positive contributors"], report.examples.map((row) => [row.raceDate, row.courseName, escapeCell(row.horseName), fmt(row.sp), row.won ? "yes" : "no", pct(row.probability), row.topPositiveContributors.map((item) => `${item.feature} ${signed(item.contribution)}`).join("; ")])),
    "## Reproducibility",
    `JSON: ${OUTPUT}.json`,
    `Markdown: ${OUTPUT}.md`,
    `Model checksum: ${report.model.checksum}`,
    "",
  ].join("\n");
}

function featureTable(rows: FeatureStat[]) {
  return table(["Feature", "Family", "Mean", "Median", "Mean raw", "Mean z", "Top3 freq", "Top3 rate"], rows.map((row) => [row.feature, row.family, fmt(row.meanContribution), fmt(row.medianContribution), fmt(row.meanRawValue), fmt(row.meanStandardizedValue), row.top3PositiveFrequency, pct(row.top3PositiveRate)]));
}

function printSummary(report: DiagnosticReport) {
  console.log(`Wrote ${OUTPUT}.md`);
  console.log(`Wrote ${OUTPUT}.json`);
  console.log("");
  console.log("Primary Hurdle rank-1 SP >14/1");
  console.log(`Selections: ${report.cohortSummary.primary.runners}`);
  console.log(`Winners: ${report.cohortSummary.primary.winners}`);
  console.log(`Tissue expected: ${fmt(report.cohortSummary.primary.tissueExpected)}`);
  console.log(`Calibration ratio: ${fmt(report.cohortSummary.primary.calibrationRatio)}`);
  console.log(`Market A/E: ${fmt(report.cohortSummary.primary.marketAe)}`);
}

function isLongPrice(sp: number) { return sp > 15; }
function numericClass(value: string | null) { return Number(value?.match(/\d+/)?.[0] ?? NaN) || null; }
function sum(values: number[]) { return values.reduce((total, value) => total + value, 0); }
function meanOrNull(values: number[]) { return values.length ? sum(values) / values.length : null; }
function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length % 2 ? sorted[(sorted.length - 1) / 2]! : (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2;
}
function ratio(numerator: number, denominator: number) { return denominator === 0 ? null : numerator / denominator; }
function nullableDiff(left: number | null, right: number | null) { return left === null || right === null ? null : left - right; }
function standardDeviation(values: number[], m = meanOrNull(values)) { return m === null || values.length < 2 ? null : Math.sqrt(sum(values.map((value) => (value - m) ** 2)) / (values.length - 1)); }
function standardizedDifference(left: number[], right: number[]) {
  const leftMean = meanOrNull(left), rightMean = meanOrNull(right);
  const leftSd = standardDeviation(left, leftMean), rightSd = standardDeviation(right, rightMean);
  if (leftMean === null || rightMean === null || leftSd === null || rightSd === null) return null;
  const pooled = Math.sqrt(((left.length - 1) * leftSd ** 2 + (right.length - 1) * rightSd ** 2) / Math.max(left.length + right.length - 2, 1));
  return pooled === 0 ? null : (leftMean - rightMean) / pooled;
}
function direction(left: number | null, right: number | null): SplitRow["direction"] {
  if (left === null || right === null || Math.abs(left - right) < 1e-9) return "flat";
  return left > right ? "winner higher" : "loser higher";
}
function replicateStatus(left: number | null, right: number | null) {
  const activeLeft = left !== null && Math.abs(left) >= REPLICATION_EPSILON;
  const activeRight = right !== null && Math.abs(right) >= REPLICATION_EPSILON;
  if (activeLeft && activeRight && Math.sign(left!) === Math.sign(right!)) return "REPLICATED";
  if (activeLeft && !activeRight) return "2025 ONLY";
  if (!activeLeft && activeRight) return "2026 ONLY";
  return "MIXED";
}
function groupBy<T, K>(values: T[], keyFor: (value: T) => K) {
  const groups = new Map<K, T[]>();
  for (const value of values) groups.set(keyFor(value), [...(groups.get(keyFor(value)) ?? []), value]);
  return groups;
}
function table(headers: string[], rows: Array<Array<string | number>>) {
  return [`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map((row) => `| ${row.join(" | ")} |`), ""].join("\n");
}
function fmt(value: number | null | undefined) { return value === null || value === undefined || !Number.isFinite(value) ? "-" : value.toFixed(4); }
function pct(value: number | null | undefined) { return value === null || value === undefined || !Number.isFinite(value) ? "-" : `${(value * 100).toFixed(2)}%`; }
function signed(value: number | null | undefined) { return value === null || value === undefined || !Number.isFinite(value) ? "-" : `${value >= 0 ? "+" : ""}${fmt(value)}`; }
function signedPct(value: number | null | undefined) { return value === null || value === undefined || !Number.isFinite(value) ? "-" : `${value >= 0 ? "+" : ""}${pct(value)}`; }
function escapeCell(value: string) { return value.replaceAll("|", "\\|").replaceAll("\n", " "); }

await main();
