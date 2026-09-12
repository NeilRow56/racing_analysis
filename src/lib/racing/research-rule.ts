import {
  deriveBacktestFeatureValues,
  settleSelection,
  summarizeSelections,
  type BacktestSelection,
  type BacktestSummary,
} from "./backtest";
import type { BacktestCacheFamily, BacktestFeatureCacheManifest } from "./backtest-cache";
import type {
  HistoricalPreRaceFeatureRow,
  HistoricalTargetRunnerMetricsRow,
} from "./historical-target-metrics";
import { normalizeRaceClasses, raceClassNumber } from "./research-rule-classes";
export { normalizeRaceClasses } from "./research-rule-classes";

export const RESEARCH_RULE_VERSION = "research_rule_v1";
export const DEVELOPMENT_DATASET_YEAR = "2025";
export const DEVELOPMENT_FROM = "2025-01-01";
export const DEVELOPMENT_TO = "2025-12-31";

export type ResearchRuleV1 = {
  version: typeof RESEARCH_RULE_VERSION;
  family: Exclude<BacktestCacheFamily, "all">;
  dateRange: {
    from: string;
    to: string;
  };
  race: {
    courseId?: string;
    courseName?: string;
    raceClasses?: number[];
    handicapStatus?: HandicapStatusFilter;
    distanceBucketFrom?: string;
    distanceBucketTo?: string;
    distanceYards?: NumericCondition;
    fieldSize?: NumericCondition;
  };
  runner: {
    trainerId?: string;
    trainerName?: string;
    returnBucket?: ReturnBucket;
    runAfterBreak?: RunAfterBreakFilter;
    officialRating?: NumericCondition;
    weightCarriedLbs?: NumericCondition;
    daysSinceRun?: NumericCondition;
    priorRuns?: NumericCondition;
  };
  ratings: RatingCondition[];
  relatives: RelativeCondition[];
  ranks: RankCondition[];
};

export type NumericCondition = {
  min?: number;
  max?: number;
};

export type HandicapStatus = "handicap" | "non_handicap" | "unknown";
export type HandicapStatusFilter = "all" | HandicapStatus;
export type ReturnBucket =
  | "all"
  | "days_0_30"
  | "days_31_60"
  | "days_61_90"
  | "days_91_180"
  | "days_181_365"
  | "days_366_plus"
  | "first_run";
export type RunAfterBreakFilter = "all" | "run_1" | "run_2" | "run_3" | "run_4_plus";

export type RatingMetric =
  | "latestSpeedRating"
  | "previousSpeedRating"
  | "bestSpeedLast3"
  | "bestSpeedLast5"
  | "averageSpeedLast3"
  | "averageSpeedLast5"
  | "latestPerformanceRating"
  | "previousPerformanceRating"
  | "bestPerformanceLast3"
  | "bestPerformanceLast5"
  | "averagePerformanceLast3"
  | "averagePerformanceLast5"
  | "latestTodaysRating"
  | "previousTodaysRating"
  | "bestTodaysRatingLast3"
  | "bestTodaysRatingLast5"
  | "averageTodaysRatingLast3"
  | "averageTodaysRatingLast5";

export type RelativeMetric =
  | "latestSpeedMinusOR"
  | "bestL3SpeedMinusOR"
  | "latestPerformanceMinusOR"
  | "bestPerformanceL3MinusOR"
  | "latestTodaysRatingMinusOR"
  | "bestTodaysRatingL3MinusOR";

export type RankMetric =
  | "latestSpeedRating"
  | "latestPerformanceRating"
  | "latestTodaysRating"
  | "bestSpeedLast3"
  | "bestPerformanceLast3"
  | "bestTodaysRatingLast3";

export type RatingCondition = {
  metric: RatingMetric;
  range: NumericCondition;
};

export type RelativeCondition = {
  metric: RelativeMetric;
  range: NumericCondition;
};

export type RankCondition = {
  metric: RankMetric;
  range: NumericCondition;
};

export type RankedResearchRow = HistoricalTargetRunnerMetricsRow & {
  ranks: Partial<Record<RankMetric, number>>;
};

export type ResearchSelection = BacktestSelection & {
  ranks: Partial<Record<RankMetric, number>>;
};

export type ResearchMissingData = {
  noSpeed: number;
  noPerformance: number;
  noTodaysRating: number;
  noOr: number;
  noWeight: number;
  noSettlementSp: number;
  nonRunnerOrUnsettled: number;
};

export type ResearchResult = {
  rule: ResearchRuleV1;
  rowsEvaluated: number;
  baselineRows: number;
  baselineSettledRunners: number;
  baselineWins: number;
  baselineWinStrikeRate: number | null;
  selectedRunners: ResearchSelection[];
  summary: BacktestSummary;
  missingData: ResearchMissingData;
  strategySummary: string[];
  cache: {
    manifest: BacktestFeatureCacheManifest;
    directory: string;
  } | null;
  elapsedMs: number;
};

export type ResearchCourseOption = {
  courseId: string;
  courseName: string;
  count: number;
};

export type ResearchClassOption = {
  value: number;
  label: string;
  count: number;
};

export type ResearchDistanceBucketOption = {
  id: string;
  label: string;
  nominalYards: number;
  minYards: number;
  maxYards: number;
  count: number;
};

export type ResearchFilterOptions = {
  courses: ResearchCourseOption[];
  classes: ResearchClassOption[];
  distances: ResearchDistanceBucketOption[];
  weights: ResearchWeightOption[];
  trainers: ResearchTrainerOption[];
};

export const DISTANCE_BUCKET_TOLERANCE_YARDS = 100;
export const MIN_RESEARCH_WEIGHT_LBS = 123;
export const MAX_RESEARCH_WEIGHT_LBS = 175;

export type ResearchWeightOption = {
  value: number;
  label: string;
};

export type ResearchTrainerOption = {
  trainerId: string;
  trainerName: string;
  count: number;
};

export const HANDICAP_STATUS_OPTIONS: Array<{ value: HandicapStatusFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "handicap", label: "Handicap" },
  { value: "non_handicap", label: "Non-handicap" },
  { value: "unknown", label: "Unknown" },
];

export const RETURN_BUCKET_OPTIONS: Array<{ value: ReturnBucket; label: string }> = [
  { value: "all", label: "All" },
  { value: "days_0_30", label: "0-30 days" },
  { value: "days_31_60", label: "31-60 days" },
  { value: "days_61_90", label: "61-90 days" },
  { value: "days_91_180", label: "91-180 days" },
  { value: "days_181_365", label: "181-365 days" },
  { value: "days_366_plus", label: "366+ days" },
  { value: "first_run", label: "First career run / no prior run" },
];

export const RUN_AFTER_BREAK_OPTIONS: Array<{ value: RunAfterBreakFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "run_1", label: "1st run" },
  { value: "run_2", label: "2nd run" },
  { value: "run_3", label: "3rd run" },
  { value: "run_4_plus", label: "4th+ run" },
];

export const FAMILY_OPTIONS: Array<{
  value: ResearchRuleV1["family"];
  label: string;
}> = [
  { value: "jump", label: "Jump" },
  { value: "all_weather_flat", label: "All Weather" },
  { value: "turf_flat", label: "Turf" },
];

export const RATING_METRIC_OPTIONS: Array<{ value: RatingMetric; label: string; group: string }> = [
  { value: "latestSpeedRating", label: "Latest Speed", group: "Raw Speed" },
  { value: "previousSpeedRating", label: "Previous Speed", group: "Raw Speed" },
  { value: "bestSpeedLast3", label: "Best L3 Speed", group: "Raw Speed" },
  { value: "bestSpeedLast5", label: "Best L5 Speed", group: "Raw Speed" },
  { value: "averageSpeedLast3", label: "Average L3 Speed", group: "Raw Speed" },
  { value: "averageSpeedLast5", label: "Average L5 Speed", group: "Raw Speed" },
  { value: "latestPerformanceRating", label: "Latest Performance", group: "Historical Performance" },
  { value: "previousPerformanceRating", label: "Previous Performance", group: "Historical Performance" },
  { value: "bestPerformanceLast3", label: "Best L3 Performance", group: "Historical Performance" },
  { value: "bestPerformanceLast5", label: "Best L5 Performance", group: "Historical Performance" },
  { value: "averagePerformanceLast3", label: "Average L3 Performance", group: "Historical Performance" },
  { value: "averagePerformanceLast5", label: "Average L5 Performance", group: "Historical Performance" },
  { value: "latestTodaysRating", label: "Latest Today's Rating", group: "Today-Adjusted" },
  { value: "previousTodaysRating", label: "Previous Today's Rating", group: "Today-Adjusted" },
  { value: "bestTodaysRatingLast3", label: "Best L3 Today's Rating", group: "Today-Adjusted" },
  { value: "bestTodaysRatingLast5", label: "Best L5 Today's Rating", group: "Today-Adjusted" },
  { value: "averageTodaysRatingLast3", label: "Average L3 Today's Rating", group: "Today-Adjusted" },
  { value: "averageTodaysRatingLast5", label: "Average L5 Today's Rating", group: "Today-Adjusted" },
];

export const RELATIVE_METRIC_OPTIONS: Array<{ value: RelativeMetric; label: string }> = [
  { value: "latestSpeedMinusOR", label: "Latest Speed minus OR" },
  { value: "bestL3SpeedMinusOR", label: "Best L3 Speed minus OR" },
  { value: "latestPerformanceMinusOR", label: "Latest Performance minus OR" },
  { value: "bestPerformanceL3MinusOR", label: "Best L3 Performance minus OR" },
  { value: "latestTodaysRatingMinusOR", label: "Latest Today's Rating minus OR" },
  { value: "bestTodaysRatingL3MinusOR", label: "Best L3 Today's Rating minus OR" },
];

export const RANK_METRIC_OPTIONS: Array<{ value: RankMetric; label: string }> = [
  { value: "latestSpeedRating", label: "Latest Speed rank" },
  { value: "latestPerformanceRating", label: "Latest Performance rank" },
  { value: "latestTodaysRating", label: "Latest Today's Rating rank" },
  { value: "bestSpeedLast3", label: "Best L3 Speed rank" },
  { value: "bestPerformanceLast3", label: "Best L3 Performance rank" },
  { value: "bestTodaysRatingLast3", label: "Best L3 Today's Rating rank" },
];

export function defaultResearchRule(
  family: ResearchRuleV1["family"] = "jump",
): ResearchRuleV1 {
  return {
    version: RESEARCH_RULE_VERSION,
    family,
    dateRange: { from: DEVELOPMENT_FROM, to: DEVELOPMENT_TO },
    race: {},
    runner: {},
    ratings: [],
    relatives: [],
    ranks: [],
  };
}

export function evaluateResearchRule(input: {
  rows: HistoricalTargetRunnerMetricsRow[];
  rule: ResearchRuleV1;
  cache?: { manifest: BacktestFeatureCacheManifest; directory: string } | null;
  elapsedMs?: number;
}): ResearchResult {
  const rows = input.rows.filter((row) => row.features.raceCode === raceCodeForFamily(input.rule.family));
  const rankedRows = rankRows(rows);
  const baseline = rankedRows
    .filter((row) => row.features.raceDate >= input.rule.dateRange.from)
    .filter((row) => row.features.raceDate <= input.rule.dateRange.to)
    .filter((row) => matchesRaceConditions(row.features, input.rule))
    .filter((row) => matchesRunnerConditions(row.features, input.rule));
  const selectedRows = baseline
    .filter((row) => matchesRatingConditions(row.features, input.rule))
    .filter((row) => matchesRelativeConditions(row.features, input.rule))
    .filter((row) => matchesRankConditions(row, input.rule));
  const selectedRunners = selectedRows
    .map((row) => researchSelection(row, input.rule))
    .sort(compareSelections);
  const baselineSettled = baseline
    .map((row) => ({ row, settlement: settleSelection(row.outcome) }))
    .filter((row) => row.settlement !== null);
  const baselineWins = baselineSettled.filter(({ row }) => row.outcome.won).length;

  return {
    rule: input.rule,
    rowsEvaluated: rows.length,
    baselineRows: baseline.length,
    baselineSettledRunners: baselineSettled.length,
    baselineWins,
    baselineWinStrikeRate: percentage(baselineWins, baselineSettled.length),
    selectedRunners,
    summary: summarizeSelections(selectedRunners),
    missingData: missingDataFor(baseline),
    strategySummary: strategySummary(input.rule),
    cache: input.cache ?? null,
    elapsedMs: input.elapsedMs ?? 0,
  };
}

export function rankRows(rows: HistoricalTargetRunnerMetricsRow[]): RankedResearchRow[] {
  const ranked = rows.map((row) => ({ ...row, ranks: {} as Partial<Record<RankMetric, number>> }));
  const rowsByRace = new Map<string, RankedResearchRow[]>();
  for (const row of ranked) {
    rowsByRace.set(row.features.targetRaceId, [...(rowsByRace.get(row.features.targetRaceId) ?? []), row]);
  }

  for (const metric of RANK_METRIC_OPTIONS.map((option) => option.value)) {
    for (const raceRows of rowsByRace.values()) {
      const rankable = raceRows
        .filter((row) => row.outcome.resultStatus !== "non_runner")
        .filter((row) => metricValue(row.features, metric) !== null)
        .sort(
          (left, right) =>
            (metricValue(right.features, metric) ?? -Infinity) -
              (metricValue(left.features, metric) ?? -Infinity) ||
            left.features.targetRunnerId.localeCompare(right.features.targetRunnerId),
        );
      let previousValue: number | null = null;
      let previousRank = 0;
      rankable.forEach((row, index) => {
        const value = metricValue(row.features, metric);
        const rank = value === previousValue ? previousRank : index + 1;
        row.ranks[metric] = rank;
        previousValue = value;
        previousRank = rank;
      });
    }
  }

  return ranked;
}

export function serializeResearchRule(rule: ResearchRuleV1): string {
  return JSON.stringify(rule);
}

export function parseResearchRule(value: string): ResearchRuleV1 | null {
  try {
    const parsed = JSON.parse(value) as Partial<ResearchRuleV1>;
    if (parsed.version !== RESEARCH_RULE_VERSION || !isFamily(parsed.family)) {
      return null;
    }
    return {
      ...defaultResearchRule(parsed.family),
      ...parsed,
      dateRange: {
        from: safeDevelopmentDate(parsed.dateRange?.from, DEVELOPMENT_FROM),
        to: safeDevelopmentDate(parsed.dateRange?.to, DEVELOPMENT_TO),
      },
      race: normalizeRaceRule(parsed.race),
      runner: parsed.runner ?? {},
      ratings: parsed.ratings ?? [],
      relatives: parsed.relatives ?? [],
      ranks: parsed.ranks ?? [],
    };
  } catch {
    return null;
  }
}

export function ruleFromSearchParams(params: URLSearchParams): ResearchRuleV1 {
  const fromSerialized = params.get("rule");
  const serializedRule = fromSerialized ? parseResearchRule(fromSerialized) : null;
  if (serializedRule) {
    return serializedRule;
  }

  const family = isFamily(params.get("family")) ? params.get("family") as ResearchRuleV1["family"] : "jump";
  const rule = defaultResearchRule(family);
  rule.dateRange = {
    from: safeDevelopmentDate(params.get("from"), DEVELOPMENT_FROM),
    to: safeDevelopmentDate(params.get("to"), DEVELOPMENT_TO),
  };
  rule.race = {
    courseId: textValue(params.get("courseId")),
    courseName: textValue(params.get("course")),
    raceClasses: raceClassesFromParams(params),
    handicapStatus: handicapStatusValue(params.get("handicapStatus")),
    distanceBucketFrom: textValue(params.get("distanceFrom")),
    distanceBucketTo: textValue(params.get("distanceTo")),
    distanceYards: rangeFromParams(params, "distanceMin", "distanceMax"),
    fieldSize: rangeFromParams(params, "fieldMin", "fieldMax"),
  };
  rule.runner = {
    trainerId: textValue(params.get("trainerId")),
    returnBucket: returnBucketValue(params.get("returnBucket")),
    runAfterBreak: runAfterBreakValue(params.get("runAfterBreak")),
    officialRating: rangeFromParams(params, "orMin", "orMax"),
    weightCarriedLbs: weightRangeFromParams(params, "weightMin", "weightMax"),
    daysSinceRun: rangeFromParams(params, "daysMin", "daysMax"),
    priorRuns: rangeFromParams(params, "priorRunsMin", "priorRunsMax"),
  };

  const ratingMetric = metricParam<RatingMetric>(params.get("ratingMetric"), RATING_METRIC_OPTIONS);
  const ratingRange = rangeFromParams(params, "ratingMin", "ratingMax");
  rule.ratings = ratingMetric && ratingRange ? [{ metric: ratingMetric, range: ratingRange }] : [];

  const relativeMetric = metricParam<RelativeMetric>(params.get("relativeMetric"), RELATIVE_METRIC_OPTIONS);
  const relativeRange = rangeFromParams(params, "relativeMin", "relativeMax");
  rule.relatives = relativeMetric && relativeRange ? [{ metric: relativeMetric, range: relativeRange }] : [];

  const rankMetric = metricParam<RankMetric>(params.get("rankMetric"), RANK_METRIC_OPTIONS);
  const rankRange = rangeFromParams(params, "rankMin", "rankMax");
  rule.ranks = rankMetric && rankRange ? [{ metric: rankMetric, range: rankRange }] : [];

  return rule;
}

export function researchFilterOptionsForRows(rows: HistoricalTargetRunnerMetricsRow[]): ResearchFilterOptions {
  return {
    courses: courseOptionsForRows(rows),
    classes: classOptionsForRows(rows),
    distances: distanceBucketOptionsForRows(rows),
    weights: weightOptions(),
    trainers: trainerOptionsForRows(rows),
  };
}

export function courseOptionsForRows(rows: HistoricalTargetRunnerMetricsRow[]): ResearchCourseOption[] {
  const options = new Map<string, ResearchCourseOption>();
  for (const row of rows) {
    const existing = options.get(row.features.courseId);
    options.set(row.features.courseId, {
      courseId: row.features.courseId,
      courseName: row.features.courseName,
      count: (existing?.count ?? 0) + 1,
    });
  }
  return [...options.values()].sort((left, right) =>
    left.courseName.localeCompare(right.courseName) || left.courseId.localeCompare(right.courseId),
  );
}

export function classOptionsForRows(rows: HistoricalTargetRunnerMetricsRow[]): ResearchClassOption[] {
  const counts = new Map<number, number>();
  for (const row of rows) {
    const value = raceClassNumber(row.features.raceClass);
    if (value === null) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, label: raceClassLabel(value), count }))
    .sort((left, right) => left.value - right.value);
}

export function distanceBucketOptionsForRows(rows: HistoricalTargetRunnerMetricsRow[]): ResearchDistanceBucketOption[] {
  const counts = new Map<number, number>();
  for (const row of rows) {
    if (row.features.distanceYards === null) continue;
    const nominalYards = nominalDistanceBucketYards(row.features.distanceYards);
    counts.set(nominalYards, (counts.get(nominalYards) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([nominalYards, count]) => distanceBucketOption(nominalYards, count))
    .sort((left, right) => left.nominalYards - right.nominalYards);
}

export function trainerOptionsForRows(rows: HistoricalTargetRunnerMetricsRow[]): ResearchTrainerOption[] {
  const options = new Map<string, ResearchTrainerOption>();
  for (const row of rows) {
    const trainerId = row.features.trainerId;
    const trainerName = row.features.trainerName;
    if (!trainerId || !trainerName) continue;
    const existing = options.get(trainerId);
    options.set(trainerId, {
      trainerId,
      trainerName,
      count: (existing?.count ?? 0) + 1,
    });
  }
  return [...options.values()].sort((left, right) =>
    left.trainerName.localeCompare(right.trainerName) || left.trainerId.localeCompare(right.trainerId),
  );
}

export function hydrateResearchRuleMetadata(
  rule: ResearchRuleV1,
  rows: HistoricalTargetRunnerMetricsRow[],
): ResearchRuleV1 {
  const courses = courseOptionsForRows(rows);
  if (!rule.race.courseId && rule.race.courseName) {
    const matchingCourses = courses.filter((option) => option.courseName === rule.race.courseName);
    if (matchingCourses.length === 1) {
      return {
        ...rule,
        race: {
          ...rule.race,
          courseId: matchingCourses[0].courseId,
          courseName: matchingCourses[0].courseName,
        },
      };
    }
  }
  if (!rule.race.courseId) {
    return hydrateTrainerMetadata(rule, rows);
  }
  const course = courses.find((option) => option.courseId === rule.race.courseId);
  return hydrateTrainerMetadata({
    ...rule,
    race: {
      ...rule.race,
      courseName: course?.courseName ?? rule.race.courseName,
    },
  }, rows);
}

function hydrateTrainerMetadata(rule: ResearchRuleV1, rows: HistoricalTargetRunnerMetricsRow[]): ResearchRuleV1 {
  if (!rule.runner.trainerId) {
    return rule;
  }
  const trainer = trainerOptionsForRows(rows).find((option) => option.trainerId === rule.runner.trainerId);
  if (!trainer) {
    return {
      ...rule,
      runner: {
        ...rule.runner,
        trainerId: undefined,
        trainerName: undefined,
      },
    };
  }
  return {
    ...rule,
    runner: {
      ...rule.runner,
      trainerName: trainer.trainerName,
    },
  };
}

export function distanceBucketIdForYards(nominalYards: number): string {
  return `d_${nominalYards}`;
}

export function formatExactDistance(distanceYards: number | null): string {
  return distanceYards === null ? "-" : formatRacingDistance(distanceYards);
}

export function weightOptions(
  minLbs = MIN_RESEARCH_WEIGHT_LBS,
  maxLbs = MAX_RESEARCH_WEIGHT_LBS,
): ResearchWeightOption[] {
  const options: ResearchWeightOption[] = [];
  for (let value = minLbs; value <= maxLbs; value += 1) {
    options.push({ value, label: formatWeightLbsAsStonePounds(value) });
  }
  return options;
}

export function formatWeightLbsAsStonePounds(weightLbs: number | null | undefined): string {
  if (weightLbs === null || weightLbs === undefined || !Number.isFinite(weightLbs)) {
    return "-";
  }
  const stones = Math.floor(weightLbs / 14);
  const pounds = weightLbs - stones * 14;
  return `${stones}-${pounds}`;
}

export function parseWeightOptionToLbs(value: string | null): number | undefined {
  return numberValue(value);
}

export function classifyHandicapStatus(
  race: Pick<HistoricalPreRaceFeatureRow, "raceName" | "raceType" | "raceTypeCode">,
): HandicapStatus {
  const raceTypeText = normalizedText([race.raceType, race.raceTypeCode].join(" "));
  const allText = normalizedText([race.raceName, race.raceType, race.raceTypeCode].join(" "));
  if (/\bhandicap\b|\bnursery\b/.test(raceTypeText) || /\bhandicap\b|\bnursery\b/.test(allText)) {
    return "handicap";
  }
  if (nonHandicapPattern().test(allText)) {
    return "non_handicap";
  }
  return "unknown";
}

function researchSelection(row: RankedResearchRow, rule: ResearchRuleV1): ResearchSelection {
  const derived = deriveBacktestFeatureValues(row.features);
  return {
    id: row.features.targetRunnerId,
    definitionId: rule.version,
    selectedReason: "Research rule",
    features: row.features,
    derived,
    outcome: row.outcome,
    settlement: settleSelection(row.outcome),
    ranks: row.ranks,
  };
}

export function matchesRaceConditions(features: HistoricalPreRaceFeatureRow, rule: ResearchRuleV1): boolean {
  const fieldSize = features.actualRunnerCount ?? features.declaredRunnerCount;
  const distanceRange = distanceRangeForRule(rule) ?? rule.race.distanceYards;
  return (!rule.race.courseId || features.courseId === rule.race.courseId) &&
    (!!rule.race.courseId || !rule.race.courseName || features.courseName === rule.race.courseName) &&
    raceClassesMatch(features.raceClass, rule.race.raceClasses) &&
    handicapStatusMatches(features, rule.race.handicapStatus) &&
    rangeMatches(features.distanceYards, distanceRange) &&
    rangeMatches(fieldSize, rule.race.fieldSize);
}

export function matchesRunnerConditions(features: HistoricalPreRaceFeatureRow, rule: ResearchRuleV1): boolean {
  return (!rule.runner.trainerId || features.trainerId === rule.runner.trainerId) &&
    returnBucketMatches(features.daysSinceLastRun, rule.runner.returnBucket) &&
    runAfterBreakMatches(features.runAfterBreakNumber, rule.runner.runAfterBreak) &&
    rangeMatches(features.officialRating, rule.runner.officialRating) &&
    rangeMatches(features.weightCarriedLbs, rule.runner.weightCarriedLbs) &&
    rangeMatches(features.daysSinceLastRun, rule.runner.daysSinceRun) &&
    rangeMatches(features.priorRuns, rule.runner.priorRuns);
}

export function matchesRatingConditions(features: HistoricalPreRaceFeatureRow, rule: ResearchRuleV1): boolean {
  return rule.ratings.every((condition) =>
    rangeMatches(metricValue(features, condition.metric), condition.range),
  );
}

export function matchesRelativeConditions(features: HistoricalPreRaceFeatureRow, rule: ResearchRuleV1): boolean {
  const derived = deriveBacktestFeatureValues(features);
  return rule.relatives.every((condition) =>
    rangeMatches(derived[condition.metric], condition.range),
  );
}

export function matchesRankConditions(row: RankedResearchRow, rule: ResearchRuleV1): boolean {
  return rule.ranks.every((condition) =>
    rangeMatches(row.ranks[condition.metric] ?? null, condition.range),
  );
}

function metricValue(features: HistoricalPreRaceFeatureRow, metric: RatingMetric | RankMetric): number | null {
  return features[metric];
}

function rangeMatches(value: number | null, range: NumericCondition | undefined): boolean {
  if (!range || (range.min === undefined && range.max === undefined)) {
    return true;
  }
  if (value === null || !Number.isFinite(value)) {
    return false;
  }
  return (range.min === undefined || value >= range.min) &&
    (range.max === undefined || value <= range.max);
}

function missingDataFor(rows: RankedResearchRow[]): ResearchMissingData {
  return {
    noSpeed: rows.filter((row) => row.features.latestSpeedRating === null).length,
    noPerformance: rows.filter((row) => row.features.latestPerformanceRating === null).length,
    noTodaysRating: rows.filter((row) => row.features.latestTodaysRating === null).length,
    noOr: rows.filter((row) => row.features.officialRating === null).length,
    noWeight: rows.filter((row) => row.features.weightCarriedLbs === null).length,
    noSettlementSp: rows.filter((row) => row.outcome.startingPriceDecimal === null).length,
    nonRunnerOrUnsettled: rows.filter((row) => settleSelection(row.outcome) === null).length,
  };
}

export function strategySummary(rule: ResearchRuleV1): string[] {
  const lines = [
    `Family: ${familyLabel(rule.family)}`,
    `Dates: ${rule.dateRange.from} to ${rule.dateRange.to}`,
  ];
  pushDistanceSummary(lines, rule);
  if (!rule.race.distanceBucketFrom && !rule.race.distanceBucketTo) {
    pushRange(lines, "Distance", rule.race.distanceYards, "y");
  }
  pushRange(lines, "Field size", rule.race.fieldSize);
  if (rule.race.courseName) lines.push(`Course: ${rule.race.courseName}`);
  pushRaceClasses(lines, rule.race.raceClasses);
  pushHandicapStatus(lines, rule.race.handicapStatus);
  if (rule.runner.trainerName) lines.push(`Trainer: ${rule.runner.trainerName}`);
  pushReturnBucket(lines, rule.runner.returnBucket);
  pushRunAfterBreak(lines, rule.runner.runAfterBreak);
  pushRange(lines, "Current OR", rule.runner.officialRating);
  pushWeightRange(lines, "Weight", rule.runner.weightCarriedLbs);
  pushRange(lines, "Days since run", rule.runner.daysSinceRun);
  pushRange(lines, "Prior runs", rule.runner.priorRuns);
  for (const condition of rule.ratings) {
    pushRange(lines, labelForMetric(condition.metric), condition.range);
  }
  for (const condition of rule.relatives) {
    pushRange(lines, labelForMetric(condition.metric), condition.range);
  }
  for (const condition of rule.ranks) {
    pushRange(lines, rankLabelForMetric(condition.metric), condition.range);
  }
  return lines;
}

function pushDistanceSummary(lines: string[], rule: ResearchRuleV1) {
  const from = bucketNominalYardsFromId(rule.race.distanceBucketFrom);
  const to = bucketNominalYardsFromId(rule.race.distanceBucketTo);
  if (from !== null && to !== null && from === to) {
    lines.push(`Distance: ${formatRacingDistance(from)}`);
  } else if (from !== null && to !== null) {
    lines.push(`Distance: ${formatRacingDistance(Math.min(from, to))} to ${formatRacingDistance(Math.max(from, to))}`);
  } else if (from !== null) {
    lines.push(`Distance: from ${formatRacingDistance(from)}`);
  } else if (to !== null) {
    lines.push(`Distance: up to ${formatRacingDistance(to)}`);
  }
}

function pushHandicapStatus(lines: string[], status: HandicapStatusFilter | undefined) {
  if (!status || status === "all") {
    return;
  }
  const label = HANDICAP_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
  lines.push(`Race type: ${label}`);
}

function pushReturnBucket(lines: string[], bucket: ReturnBucket | undefined) {
  if (!bucket || bucket === "all") {
    return;
  }
  const label = RETURN_BUCKET_OPTIONS.find((option) => option.value === bucket)?.label ?? bucket;
  lines.push(`Return: ${label}`);
}

function pushRunAfterBreak(lines: string[], value: RunAfterBreakFilter | undefined) {
  if (!value || value === "all") {
    return;
  }
  const label = RUN_AFTER_BREAK_OPTIONS.find((option) => option.value === value)?.label ?? value;
  lines.push(`Run after break: ${label}`);
}

function pushWeightRange(lines: string[], label: string, range: NumericCondition | undefined) {
  if (!range || (range.min === undefined && range.max === undefined)) {
    return;
  }
  if (range.min !== undefined && range.max !== undefined && range.min === range.max) {
    lines.push(`${label}: ${formatWeightLbsAsStonePounds(range.min)}`);
    return;
  }
  if (range.min !== undefined && range.max !== undefined) {
    lines.push(`${label}: ${formatWeightLbsAsStonePounds(range.min)} to ${formatWeightLbsAsStonePounds(range.max)}`);
    return;
  }
  if (range.min !== undefined) {
    lines.push(`${label}: ${formatWeightLbsAsStonePounds(range.min)}+`);
  }
  if (range.max !== undefined) {
    lines.push(`${label}: up to ${formatWeightLbsAsStonePounds(range.max)}`);
  }
}

function pushRange(lines: string[], label: string, range: NumericCondition | undefined, suffix = "") {
  if (!range || (range.min === undefined && range.max === undefined)) {
    return;
  }
  if (range.min !== undefined && range.max !== undefined && range.min === range.max) {
    lines.push(`${label}: ${range.min}${suffix}`);
    return;
  }
  if (range.min !== undefined) {
    lines.push(`${label}: >= ${range.min}${suffix}`);
  }
  if (range.max !== undefined) {
    lines.push(`${label}: <= ${range.max}${suffix}`);
  }
}

function labelForMetric(metric: RatingMetric | RelativeMetric | RankMetric): string {
  return RATING_METRIC_OPTIONS.find((option) => option.value === metric)?.label ??
    RELATIVE_METRIC_OPTIONS.find((option) => option.value === metric)?.label ??
    RANK_METRIC_OPTIONS.find((option) => option.value === metric)?.label ??
    metric;
}

function rankLabelForMetric(metric: RankMetric): string {
  return RANK_METRIC_OPTIONS.find((option) => option.value === metric)?.label ?? `${metric} rank`;
}

function normalizeRaceRule(race: Partial<ResearchRuleV1["race"]> | undefined): ResearchRuleV1["race"] {
  const { raceClass: legacyRaceClass, ...rest } = (race ?? {}) as Partial<ResearchRuleV1["race"]> & {
    raceClass?: unknown;
  };
  return {
    ...rest,
    raceClasses: normalizeRaceClasses([
      ...(Array.isArray(rest.raceClasses) ? rest.raceClasses : []),
      raceClassNumber(legacyRaceClass),
    ]),
  };
}

function rangeFromParams(params: URLSearchParams, minKey: string, maxKey: string): NumericCondition | undefined {
  const min = numberValue(params.get(minKey));
  const max = numberValue(params.get(maxKey));
  return min === undefined && max === undefined ? undefined : { min, max };
}

function raceClassesFromParams(params: URLSearchParams): number[] | undefined {
  return normalizeRaceClasses([
    ...params.getAll("class"),
    params.get("raceClass"),
    ...params.getAll("raceClasses"),
  ]);
}

function weightRangeFromParams(params: URLSearchParams, minKey: string, maxKey: string): NumericCondition | undefined {
  const min = parseWeightOptionToLbs(params.get(minKey));
  const max = parseWeightOptionToLbs(params.get(maxKey));
  return min === undefined && max === undefined ? undefined : { min, max };
}

function metricParam<T extends string>(
  value: string | null,
  options: Array<{ value: T }>,
): T | null {
  return options.some((option) => option.value === value) ? value as T : null;
}

function numberValue(value: string | null): number | undefined {
  if (value === null || value.trim() === "") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function textValue(value: string | null): string | undefined {
  const text = value?.trim();
  return text ? text : undefined;
}

function raceClassesMatch(value: string | null, selected: number[] | undefined): boolean {
  const classes = normalizeRaceClasses(selected);
  if (!classes) {
    return true;
  }
  const actual = raceClassNumber(value);
  return actual !== null && classes.includes(actual);
}

function handicapStatusValue(value: string | null): HandicapStatusFilter | undefined {
  return HANDICAP_STATUS_OPTIONS.some((option) => option.value === value)
    ? value as HandicapStatusFilter
    : undefined;
}

function returnBucketValue(value: string | null): ReturnBucket | undefined {
  return RETURN_BUCKET_OPTIONS.some((option) => option.value === value)
    ? value as ReturnBucket
    : undefined;
}

function runAfterBreakValue(value: string | null): RunAfterBreakFilter | undefined {
  return RUN_AFTER_BREAK_OPTIONS.some((option) => option.value === value)
    ? value as RunAfterBreakFilter
    : undefined;
}

function handicapStatusMatches(
  features: HistoricalPreRaceFeatureRow,
  filter: HandicapStatusFilter | undefined,
): boolean {
  if (!filter || filter === "all") {
    return true;
  }
  return classifyHandicapStatus(features) === filter;
}

function returnBucketMatches(daysSinceLastRun: number | null, bucket: ReturnBucket | undefined): boolean {
  if (!bucket || bucket === "all") {
    return true;
  }
  if (bucket === "first_run") {
    return daysSinceLastRun === null;
  }
  if (daysSinceLastRun === null) {
    return false;
  }
  switch (bucket) {
    case "days_0_30":
      return daysSinceLastRun >= 0 && daysSinceLastRun <= 30;
    case "days_31_60":
      return daysSinceLastRun >= 31 && daysSinceLastRun <= 60;
    case "days_61_90":
      return daysSinceLastRun >= 61 && daysSinceLastRun <= 90;
    case "days_91_180":
      return daysSinceLastRun >= 91 && daysSinceLastRun <= 180;
    case "days_181_365":
      return daysSinceLastRun >= 181 && daysSinceLastRun <= 365;
    case "days_366_plus":
      return daysSinceLastRun >= 366;
  }
}

function runAfterBreakMatches(
  runAfterBreakNumber: number | null,
  filter: RunAfterBreakFilter | undefined,
): boolean {
  if (!filter || filter === "all") {
    return true;
  }
  if (runAfterBreakNumber === null) {
    return false;
  }
  if (filter === "run_4_plus") {
    return runAfterBreakNumber >= 4;
  }
  return runAfterBreakNumber === Number(filter.replace("run_", ""));
}

function normalizedText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function nonHandicapPattern(): RegExp {
  return /\b(maiden|novice|novices|conditions|listed|group|grade|graded|beginners|beginner|stakes|classified stakes|claiming race|claiming stakes|rated race|hunters chase|hunter chase|nh flat race|national hunt flat|bumper|auction stakes|median auction|fillies stakes|colts geldings stakes|open race)\b/;
}

function distanceRangeForRule(rule: ResearchRuleV1): NumericCondition | undefined {
  const from = bucketNominalYardsFromId(rule.race.distanceBucketFrom);
  const to = bucketNominalYardsFromId(rule.race.distanceBucketTo);
  if (from === null && to === null) {
    return undefined;
  }
  if (from !== null && to === null) {
    return { min: from - DISTANCE_BUCKET_TOLERANCE_YARDS };
  }
  if (from === null && to !== null) {
    return { max: to + DISTANCE_BUCKET_TOLERANCE_YARDS };
  }
  const lower = from as number;
  const upper = to as number;
  return {
    min: Math.min(lower, upper) - DISTANCE_BUCKET_TOLERANCE_YARDS,
    max: Math.max(lower, upper) + DISTANCE_BUCKET_TOLERANCE_YARDS,
  };
}

function distanceBucketOption(nominalYards: number, count: number): ResearchDistanceBucketOption {
  return {
    id: distanceBucketIdForYards(nominalYards),
    label: formatRacingDistance(nominalYards),
    nominalYards,
    minYards: nominalYards - DISTANCE_BUCKET_TOLERANCE_YARDS,
    maxYards: nominalYards + DISTANCE_BUCKET_TOLERANCE_YARDS,
    count,
  };
}

function nominalDistanceBucketYards(distanceYards: number): number {
  return Math.max(220, Math.round(distanceYards / 220) * 220);
}

function bucketNominalYardsFromId(id: string | undefined): number | null {
  if (!id) return null;
  const match = /^d_(\d+)$/.exec(id);
  if (!match) return null;
  const yards = Number(match[1]);
  return Number.isFinite(yards) ? yards : null;
}

function formatRacingDistance(distanceYards: number): string {
  const miles = Math.floor(distanceYards / 1760);
  const afterMiles = distanceYards - miles * 1760;
  const furlongs = Math.floor(afterMiles / 220);
  const yards = afterMiles - furlongs * 220;
  const parts: string[] = [];
  if (miles > 0) parts.push(`${miles}m`);
  if (furlongs > 0) parts.push(`${furlongs}f`);
  if (yards > 0 || parts.length === 0) parts.push(`${yards}y`);
  return parts.join("");
}

function raceClassLabel(value: number): string {
  return `Class ${value}`;
}

function pushRaceClasses(lines: string[], values: number[] | undefined) {
  const classes = normalizeRaceClasses(values);
  if (!classes) {
    return;
  }
  if (classes.length === 1) {
    lines.push(`Class ${classes[0]}`);
    return;
  }
  lines.push(`Classes ${humanList(classes.map(String))}`);
}

function humanList(values: string[]): string {
  if (values.length <= 1) {
    return values[0] ?? "";
  }
  return `${values.slice(0, -1).join(", ")} & ${values.at(-1)}`;
}

function safeDevelopmentDate(value: string | null | undefined, fallback: string): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return fallback;
  }
  if (value < DEVELOPMENT_FROM) {
    return DEVELOPMENT_FROM;
  }
  if (value > DEVELOPMENT_TO) {
    return DEVELOPMENT_TO;
  }
  return value;
}

function raceCodeForFamily(family: ResearchRuleV1["family"]) {
  if (family === "all_weather_flat") return "aw";
  if (family === "turf_flat") return "turf";
  return "jump";
}

function isFamily(value: unknown): value is ResearchRuleV1["family"] {
  return value === "jump" || value === "all_weather_flat" || value === "turf_flat";
}

function familyLabel(family: ResearchRuleV1["family"]): string {
  return FAMILY_OPTIONS.find((option) => option.value === family)?.label ?? family;
}

function percentage(count: number, total: number): number | null {
  return total === 0 ? null : (count / total) * 100;
}

function compareSelections(left: ResearchSelection, right: ResearchSelection): number {
  return left.features.raceDateTime.getTime() - right.features.raceDateTime.getTime() ||
    left.features.courseName.localeCompare(right.features.courseName) ||
    left.features.targetRaceId.localeCompare(right.features.targetRaceId) ||
    left.features.targetRunnerId.localeCompare(right.features.targetRunnerId);
}
