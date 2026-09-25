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
import { classifyJumpRaceSubtype } from "./jump-speed-rating";
import { normalizeRaceClasses, raceClassNumber } from "./research-rule-classes";
import { RANK_METRIC_OPTIONS, type RankMetric } from "./research-rank-metrics";
import { RELATIVE_METRIC_OPTIONS, type RelativeMetric } from "./research-or-relative-metrics";
import {
  isTrainerCohortTop,
  trainerCohortLabel,
  trainerCohortReferenceYearFromDate,
  trainerCohortRule,
  type ResolvedTrainerCohort,
  type TrainerCohortRule,
} from "./trainer-cohort-mode";
import {
  isImpossibleStartingPriceCondition,
  startingPriceConditionFromValues,
  startingPriceDecimalMatches,
  type StartingPriceCondition,
} from "./starting-price-filter";
import {
  buildCanonicalTurfPerformanceRatingInput,
  calculateTurfPerformanceRating,
  rankTurfPerformanceRatings,
  TURF_PERFORMANCE_RATING_W50_WEIGHT_MULTIPLIER,
  TURF_PERFORMANCE_RATING_VERSION,
  type RankedTurfPerformanceRating,
} from "./turf-performance-rating";
export { normalizeRaceClasses } from "./research-rule-classes";
export { RANK_METRIC_OPTIONS, type RankMetric } from "./research-rank-metrics";
export {
  CREATABLE_RELATIVE_METRIC_OPTIONS,
  RELATIVE_METRIC_OPTIONS,
  isLegacySpeedRelativeMetric,
  type RelativeMetric,
} from "./research-or-relative-metrics";
export {
  STARTING_PRICE_MAX_OPTIONS,
  STARTING_PRICE_MIN_OPTIONS,
  isImpossibleStartingPriceCondition,
  startingPriceConditionFromValues,
  startingPriceMaxValue,
  startingPriceMinValue,
} from "./starting-price-filter";
export type {
  StartingPriceCondition,
  StartingPriceFilterOption,
  StartingPriceFilterValue,
} from "./starting-price-filter";

export const RESEARCH_RULE_VERSION = "research_rule_v1";
export const DEVELOPMENT_DATASET_YEAR = "2025";
export const DEVELOPMENT_FROM = "2025-01-01";
export const DEVELOPMENT_TO = "2025-12-31";

const courseIdSetCache = new WeakMap<ResearchRuleV1, { key: string; set: Set<string> }>();
const trainerIdSetCache = new WeakMap<ResearchRuleV1, { key: string; set: Set<string> }>();
const jockeyIdSetCache = new WeakMap<ResearchRuleV1, { key: string; set: Set<string> }>();

export type ResearchRuleV1 = {
  version: typeof RESEARCH_RULE_VERSION;
  family: Exclude<BacktestCacheFamily, "all">;
  dateRange: {
    from: string;
    to: string;
  };
  race: {
    courseIds?: string[];
    courseNames?: string[];
    /** @deprecated Use courseIds. Kept so older saved rules and URLs parse safely. */
    courseId?: string;
    /** @deprecated Use courseNames. Kept so older saved rules and URLs parse safely. */
    courseName?: string;
    raceClasses?: number[];
    handicapStatus?: HandicapStatusFilter;
    jumpSubtype?: JumpSubtypeFilter;
    distanceBucketFrom?: string;
    distanceBucketTo?: string;
    distanceYards?: NumericCondition;
    fieldSize?: NumericCondition;
  };
  runner: {
    trainerIds?: string[];
    trainerNames?: string[];
    jockeyIds?: string[];
    jockeyNames?: string[];
    /** @deprecated Use trainerIds. Kept so older saved rules and URLs parse safely. */
    trainerId?: string;
    /** @deprecated Use trainerNames. Kept so older saved rules and URLs parse safely. */
    trainerName?: string;
    /** @deprecated Use jockeyIds. Kept so older saved rules and URLs parse safely. */
    jockeyId?: string;
    /** @deprecated Use jockeyNames. Kept so older saved rules and URLs parse safely. */
    jockeyName?: string;
    trainerCohort?: TrainerCohortRule;
    returnBucket?: ReturnBucket;
    runAfterBreak?: RunAfterBreakFilter;
    officialRating?: NumericCondition;
    draw?: NumericCondition;
    weightCarriedLbs?: NumericCondition;
    daysSinceRun?: NumericCondition;
    priorRuns?: NumericCondition;
    trainerPriorRuns?: NumericCondition;
    trainerPriorWinRate?: NumericCondition;
    jockeyPriorRuns?: NumericCondition;
    jockeyPriorWinRate?: NumericCondition;
  };
  ratings: RatingCondition[];
  relatives: RelativeCondition[];
  ranks: RankCondition[];
  turfPerformance?: TurfPerformanceCondition;
  startingPrice?: StartingPriceCondition;
};

export type NumericCondition = {
  min?: number;
  max?: number;
};

export type HandicapStatus = "handicap" | "non_handicap" | "unknown";
export type HandicapStatusFilter = "all" | HandicapStatus;
export type JumpSubtypeFilter = "all" | "hurdle" | "chase";
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

export type TurfPerformanceCondition = {
  version: typeof TURF_PERFORMANCE_RATING_VERSION;
  rating?: NumericCondition;
  rank?: NumericCondition;
  lead?: NumericCondition;
};

export type RankedResearchRow = HistoricalTargetRunnerMetricsRow & {
  ranks: Partial<Record<RankMetric, number>>;
  turfPerformance: RankedTurfPerformanceRating | null;
  turfPerformanceW50: RankedTurfPerformanceRating | null;
};

export type ResearchSelection = BacktestSelection & {
  ranks: Partial<Record<RankMetric, number>>;
  turfPerformance: RankedTurfPerformanceRating | null;
  turfPerformanceW50: RankedTurfPerformanceRating | null;
};

export type ResearchMissingData = {
  noSpeed: number;
  noPerformance: number;
  noTodaysRating: number;
  noOr: number;
  noWeight: number;
  noTrainerPriorHistory: number;
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
  trainerCohort: ResolvedTrainerCohort | null;
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
  family?: ResearchRuleV1["family"];
  courses: ResearchCourseOption[];
  classes: ResearchClassOption[];
  distances: ResearchDistanceBucketOption[];
  weights: ResearchWeightOption[];
  trainers: ResearchTrainerOption[];
  jockeys?: ResearchJockeyOption[];
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

export type ResearchJockeyOption = {
  jockeyId: string;
  jockeyName: string;
  count: number;
};

export const HANDICAP_STATUS_OPTIONS: Array<{ value: HandicapStatusFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "handicap", label: "Handicap" },
  { value: "non_handicap", label: "Non-handicap" },
  { value: "unknown", label: "Unknown" },
];

export const JUMP_SUBTYPE_OPTIONS: Array<{ value: JumpSubtypeFilter; label: string }> = [
  { value: "all", label: "All jump races" },
  { value: "hurdle", label: "Hurdles" },
  { value: "chase", label: "Chases" },
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

const LEGACY_TPR_RANK_OPTION = { value: "turfPerformanceRating" as const, label: "TPR rank" };
const COMPATIBLE_RANK_METRIC_OPTIONS: Array<{ value: RankMetric; label: string }> = [
  ...RANK_METRIC_OPTIONS,
  LEGACY_TPR_RANK_OPTION,
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
  trainerCohort?: ResolvedTrainerCohort | null;
}): ResearchResult {
  const rows = input.rows.filter((row) => row.features.raceCode === raceCodeForFamily(input.rule.family));
  const rankedRows = rankRows(rows);
  const baseline = rankedRows
    .filter((row) => row.features.raceDate >= input.rule.dateRange.from)
    .filter((row) => row.features.raceDate <= input.rule.dateRange.to)
    .filter((row) => matchesRaceConditions(row.features, input.rule))
    .filter((row) => matchesRunnerConditions(row.features, input.rule, input.trainerCohort ?? null));
  const selectedRows = baseline
    .filter((row) => matchesRatingConditions(row.features, input.rule))
    .filter((row) => matchesRelativeConditions(row.features, input.rule))
    .filter((row) => matchesRankConditions(row, input.rule))
    .filter((row) => matchesTurfPerformanceConditions(row, input.rule))
    .filter((row) => matchesStartingPriceCondition(row, input.rule));
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
    trainerCohort: input.trainerCohort ?? null,
  };
}

export function rankRows(rows: HistoricalTargetRunnerMetricsRow[]): RankedResearchRow[] {
  const ranked = rows.map((row) => ({
    ...row,
    ranks: {} as Partial<Record<RankMetric, number>>,
    turfPerformance: null,
    turfPerformanceW50: null,
  }));
  const rowsByRace = new Map<string, RankedResearchRow[]>();
  for (const row of ranked) {
    rowsByRace.set(row.features.targetRaceId, [...(rowsByRace.get(row.features.targetRaceId) ?? []), row]);
  }

  for (const metric of RANK_METRIC_OPTIONS
    .map((option) => option.value)
    .filter((metric) => metric !== "turfPerformanceW50Rating")) {
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

  for (const raceRows of rowsByRace.values()) {
    attachTurfPerformanceRatings(raceRows);
    for (const row of raceRows) {
      if (row.turfPerformance) {
        row.ranks.turfPerformanceRating = row.turfPerformance.rank;
      }
      if (row.turfPerformanceW50) {
        row.ranks.turfPerformanceW50Rating = row.turfPerformanceW50.rank;
      }
    }
  }

  return ranked;
}

export function serializeResearchRule(rule: ResearchRuleV1): string {
  return JSON.stringify({
    ...rule,
    runner: {
      ...rule.runner,
      draw: rule.family === "jump" ? undefined : rule.runner.draw,
    },
  });
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
      runner: normalizeRunnerRule(parsed.runner, parsed.family),
      ratings: parsed.ratings ?? [],
      relatives: parsed.relatives ?? [],
      ranks: parsed.ranks ?? [],
      turfPerformance: normalizeTurfPerformanceCondition(parsed.turfPerformance),
      startingPrice: normalizeStartingPriceCondition(parsed.startingPrice),
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
    courseIds: textValues(params.getAll("courseId")),
    courseName: textValue(params.get("course")),
    raceClasses: raceClassesFromParams(params),
    handicapStatus: handicapStatusValue(params.get("handicapStatus")),
    jumpSubtype: family === "jump" ? jumpSubtypeValue(params.get("jumpSubtype")) : undefined,
    distanceBucketFrom: textValue(params.get("distanceFrom")),
    distanceBucketTo: textValue(params.get("distanceTo")),
    distanceYards: rangeFromParams(params, "distanceMin", "distanceMax"),
    fieldSize: rangeFromParams(params, "fieldMin", "fieldMax"),
  };
  rule.race = normalizeRaceRule(rule.race);
  rule.runner = {
    trainerIds: textValues(params.getAll("trainerId")),
    trainerCohort: trainerCohortFromTop(params.get("trainerCohort")),
    returnBucket: returnBucketValue(params.get("returnBucket")),
    runAfterBreak: runAfterBreakValue(params.get("runAfterBreak")),
    officialRating: rangeFromParams(params, "orMin", "orMax"),
    draw: family === "jump" ? undefined : rangeFromParams(params, "drawMin", "drawMax"),
    weightCarriedLbs: weightRangeFromParams(params, "weightMin", "weightMax"),
    daysSinceRun: rangeFromParams(params, "daysMin", "daysMax"),
    priorRuns: rangeFromParams(params, "priorRunsMin", "priorRunsMax"),
    trainerPriorRuns: rangeFromParams(params, "trainerPriorRunsMin", "trainerPriorRunsMax"),
    trainerPriorWinRate: rangeFromParams(params, "trainerPriorWinRateMin", "trainerPriorWinRateMax"),
    jockeyIds: textValues(params.getAll("jockeyId")),
    jockeyPriorRuns: rangeFromParams(params, "jockeyPriorRunsMin", "jockeyPriorRunsMax"),
    jockeyPriorWinRate: rangeFromParams(params, "jockeyPriorWinRateMin", "jockeyPriorWinRateMax"),
  };
  rule.runner = normalizeRunnerRule(rule.runner, family);

  const ratingMetric = metricParam<RatingMetric>(params.get("ratingMetric"), RATING_METRIC_OPTIONS);
  const ratingRange = rangeFromParams(params, "ratingMin", "ratingMax");
  rule.ratings = ratingMetric && ratingRange ? [{ metric: ratingMetric, range: ratingRange }] : [];

  const relativeMetric = metricParam<RelativeMetric>(params.get("relativeMetric"), RELATIVE_METRIC_OPTIONS);
  const relativeRange = rangeFromParams(params, "relativeMin", "relativeMax");
  rule.relatives = relativeMetric && relativeRange ? [{ metric: relativeMetric, range: relativeRange }] : [];

  const rankMetric = metricParam<RankMetric>(params.get("rankMetric"), COMPATIBLE_RANK_METRIC_OPTIONS);
  const rankRange = rangeFromParams(params, "rankMin", "rankMax");
  const officialRatingRankRange = rangeFromParams(params, "orRankMin", "orRankMax");
  rule.ranks = [
    ...(rankMetric && rankMetric !== "turfPerformanceRating" && rankRange ? [{ metric: rankMetric, range: rankRange }] : []),
    ...(officialRatingRankRange ? [{ metric: "officialRating" as const, range: officialRatingRankRange }] : []),
  ];
  rule.turfPerformance = turfPerformanceFromParams(params, rule.family);
  if (rule.family === "turf_flat" && rankMetric === "turfPerformanceRating" && rankRange) {
    rule.turfPerformance = {
      version: TURF_PERFORMANCE_RATING_VERSION,
      ...rule.turfPerformance,
      rank: intersectRanges(rule.turfPerformance?.rank, rankRange),
    };
  }
  rule.startingPrice = startingPriceFromParams(params);

  return rule;
}

export function researchFilterOptionsForRows(rows: HistoricalTargetRunnerMetricsRow[]): ResearchFilterOptions {
  return {
    courses: courseOptionsForRows(rows),
    classes: classOptionsForRows(rows),
    distances: distanceBucketOptionsForRows(rows),
    weights: weightOptions(),
    trainers: trainerOptionsForRows(rows),
    jockeys: jockeyOptionsForRows(rows),
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

export function jockeyOptionsForRows(rows: HistoricalTargetRunnerMetricsRow[]): ResearchJockeyOption[] {
  const options = new Map<string, ResearchJockeyOption>();
  for (const row of rows) {
    const jockeyId = row.features.jockeyId;
    const jockeyName = row.features.jockeyName;
    if (!jockeyId || !jockeyName) continue;
    const existing = options.get(jockeyId);
    options.set(jockeyId, {
      jockeyId,
      jockeyName,
      count: (existing?.count ?? 0) + 1,
    });
  }
  return [...options.values()].sort((left, right) =>
    left.jockeyName.localeCompare(right.jockeyName) || left.jockeyId.localeCompare(right.jockeyId),
  );
}

export function hydrateResearchRuleMetadata(
  rule: ResearchRuleV1,
  rows: HistoricalTargetRunnerMetricsRow[],
): ResearchRuleV1 {
  const courses = courseOptionsForRows(rows);
  let courseIds = selectedCourseIds(rule);
  if (courseIds.length === 0 && rule.race.courseName) {
    const matchingCourses = courses.filter((option) => option.courseName === rule.race.courseName);
    if (matchingCourses.length === 1) {
      courseIds = [matchingCourses[0].courseId];
    }
  }
  const coursesById = new Map(courses.map((option) => [option.courseId, option]));
  const validCourses = courseIds
    .map((courseId) => coursesById.get(courseId))
    .filter((option): option is ResearchCourseOption => Boolean(option));
  const hydratedRule = {
    ...rule,
    race: {
      ...rule.race,
      courseIds: validCourses.map((option) => option.courseId),
      courseNames: validCourses.length > 0
        ? validCourses.map((option) => option.courseName)
        : selectedCourseNames(rule),
      courseId: undefined,
      courseName: undefined,
    },
  };
  return hydrateTrainerMetadata(hydratedRule, rows);
}

function hydrateTrainerMetadata(rule: ResearchRuleV1, rows: HistoricalTargetRunnerMetricsRow[]): ResearchRuleV1 {
  const trainerIds = selectedTrainerIds(rule);
  const trainersById = new Map(trainerOptionsForRows(rows).map((option) => [option.trainerId, option]));
  const validTrainers = trainerIds
    .map((trainerId) => trainersById.get(trainerId))
    .filter((option): option is ResearchTrainerOption => Boolean(option));
  const hydratedRule = {
    ...rule,
    runner: {
      ...rule.runner,
      trainerIds: validTrainers.map((option) => option.trainerId),
      trainerNames: validTrainers.map((option) => option.trainerName),
      trainerId: undefined,
      trainerName: undefined,
      trainerCohort: validTrainers.length > 0 ? undefined : rule.runner.trainerCohort,
    },
  };
  return hydrateJockeyMetadata(hydratedRule, rows);
}

function hydrateJockeyMetadata(rule: ResearchRuleV1, rows: HistoricalTargetRunnerMetricsRow[]): ResearchRuleV1 {
  const jockeyIds = selectedJockeyIds(rule);
  const jockeysById = new Map(jockeyOptionsForRows(rows).map((option) => [option.jockeyId, option]));
  const validJockeys = jockeyIds
    .map((jockeyId) => jockeysById.get(jockeyId))
    .filter((option): option is ResearchJockeyOption => Boolean(option));
  return {
    ...rule,
    runner: {
      ...rule.runner,
      jockeyIds: validJockeys.map((option) => option.jockeyId),
      jockeyNames: validJockeys.map((option) => option.jockeyName),
      jockeyId: undefined,
      jockeyName: undefined,
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
    turfPerformance: row.turfPerformance,
    turfPerformanceW50: row.turfPerformanceW50,
  };
}

export function matchesRaceConditions(features: HistoricalPreRaceFeatureRow, rule: ResearchRuleV1): boolean {
  const fieldSize = features.actualRunnerCount ?? features.declaredRunnerCount;
  const distanceRange = distanceRangeForRule(rule) ?? rule.race.distanceYards;
  return courseMatches(features, rule) &&
    raceClassesMatch(features.raceClass, rule.race.raceClasses) &&
    handicapStatusMatches(features, rule.race.handicapStatus) &&
    jumpSubtypeMatches(features, rule) &&
    rangeMatches(features.distanceYards, distanceRange) &&
    rangeMatches(fieldSize, rule.race.fieldSize);
}

export function matchesRunnerConditions(
  features: HistoricalPreRaceFeatureRow,
  rule: ResearchRuleV1,
  trainerCohort: ResolvedTrainerCohort | null = null,
): boolean {
  return trainerMatches(features, rule) &&
    jockeyMatches(features, rule) &&
    trainerCohortMatches(features.trainerId, rule, trainerCohort) &&
    returnBucketMatches(features.daysSinceLastRun, rule.runner.returnBucket) &&
    runAfterBreakMatches(features.runAfterBreakNumber, rule.runner.runAfterBreak) &&
    rangeMatches(features.officialRating, rule.runner.officialRating) &&
    rangeMatches(features.draw, rule.family === "jump" ? undefined : rule.runner.draw) &&
    rangeMatches(features.weightCarriedLbs, rule.runner.weightCarriedLbs) &&
    rangeMatches(features.daysSinceLastRun, rule.runner.daysSinceRun) &&
    rangeMatches(features.priorRuns, rule.runner.priorRuns) &&
    rangeMatches(features.trainerPriorRuns, rule.runner.trainerPriorRuns) &&
    rangeMatches(features.trainerPriorWinRate, rule.runner.trainerPriorWinRate) &&
    rangeMatches(features.jockeyPriorRuns ?? 0, rule.runner.jockeyPriorRuns) &&
    rangeMatches(features.jockeyPriorWinRate ?? null, rule.runner.jockeyPriorWinRate);
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

export function matchesTurfPerformanceConditions(row: RankedResearchRow, rule: ResearchRuleV1): boolean {
  const condition = rule.turfPerformance;
  if (!condition) {
    return true;
  }
  if (rule.family !== "turf_flat" || condition.version !== TURF_PERFORMANCE_RATING_VERSION) {
    return false;
  }
  const rating = row.turfPerformance;
  return rangeMatches(rating?.rating ?? null, condition.rating) &&
    rangeMatches(rating?.rank ?? null, condition.rank) &&
    rangeMatches(turfPerformanceLead(rating), condition.lead);
}

export function matchesStartingPriceCondition(row: RankedResearchRow, rule: ResearchRuleV1): boolean {
  const condition = rule.startingPrice;
  if (!hasStartingPriceCondition(rule)) {
    return true;
  }
  const settlement = settleSelection(row.outcome);
  if (!settlement) {
    return false;
  }
  return startingPriceDecimalMatches(settlement.settlementOddsDecimal, condition);
}

export function hasStartingPriceCondition(rule: ResearchRuleV1): boolean {
  const condition = rule.startingPrice;
  return Boolean(
    condition &&
      (condition.minDecimal !== undefined || condition.maxDecimalExclusive !== undefined),
  );
}

function attachTurfPerformanceRatings(raceRows: RankedResearchRow[]) {
  if (raceRows[0]?.features.raceCode !== "turf") {
    return;
  }
  const raceMedianWeight = median(
    raceRows
      .filter((row) => row.outcome.resultStatus !== "non_runner")
      .map((row) => row.features.weightCarriedLbs)
      .filter(isNumber),
  );
  const ratingInputs = raceRows.map((row) => ({
    row,
    input: buildCanonicalTurfPerformanceRatingInput({
      latestPerformanceRating: row.features.latestPerformanceRating,
      previousPerformanceRating: row.features.previousPerformanceRating,
      averagePerformanceLast3: row.features.averagePerformanceLast3,
      latestSpeedRating: row.features.latestTurfSpeedRating,
      previousSpeedRating: row.features.previousTurfSpeedRating,
      averageSpeedLast3: row.features.averageTurfSpeedLast3,
      raceClass: row.features.raceClass,
      weightCarriedLbs: row.features.weightCarriedLbs,
      raceMedianWeightCarriedLbs: raceMedianWeight,
    }),
  }));
  const ratings = rankTurfPerformanceRatings(
    ratingInputs.map(({ row, input }) => ({
      id: row.features.targetRunnerId,
      rating: row.outcome.resultStatus === "non_runner"
        ? null
        : calculateTurfPerformanceRating(input),
    })),
  );
  const w50Ratings = rankTurfPerformanceRatings(
    ratingInputs.map(({ row, input }) => ({
      id: row.features.targetRunnerId,
      rating: row.outcome.resultStatus === "non_runner"
        ? null
        : calculateTurfPerformanceRating({
            ...input,
            weightCoefficientMultiplier: TURF_PERFORMANCE_RATING_W50_WEIGHT_MULTIPLIER,
          }),
    })),
  );
  for (const row of raceRows) {
    row.turfPerformance = ratings.get(row.features.targetRunnerId) ?? null;
    row.turfPerformanceW50 = w50Ratings.get(row.features.targetRunnerId) ?? null;
  }
}

function turfPerformanceLead(rating: RankedTurfPerformanceRating | null | undefined): number | null {
  if (!rating || rating.rank !== 1) {
    return null;
  }
  return rating.gap;
}

function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function isNumber(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function metricValue(features: HistoricalPreRaceFeatureRow, metric: RatingMetric | RankMetric): number | null {
  if (metric === "turfPerformanceRating" || metric === "turfPerformanceW50Rating") {
    return null;
  }
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

function trainerCohortMatches(
  trainerId: string | null,
  rule: ResearchRuleV1,
  trainerCohort: ResolvedTrainerCohort | null,
): boolean {
  if (selectedTrainerIds(rule).length > 0) {
    return true;
  }
  if (!rule.runner.trainerCohort) {
    return true;
  }
  if (!trainerId || !trainerCohort) {
    return false;
  }
  return trainerCohort.trainerIds.has(trainerId);
}

function missingDataFor(rows: RankedResearchRow[]): ResearchMissingData {
  return {
    noSpeed: rows.filter((row) => row.features.latestSpeedRating === null).length,
    noPerformance: rows.filter((row) => row.features.latestPerformanceRating === null).length,
    noTodaysRating: rows.filter((row) => row.features.latestTodaysRating === null).length,
    noOr: rows.filter((row) => row.features.officialRating === null).length,
    noWeight: rows.filter((row) => row.features.weightCarriedLbs === null).length,
    noTrainerPriorHistory: rows.filter((row) => row.features.trainerPriorRuns === 0).length,
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
  pushSelectionSummary(lines, "Course", "Courses", selectedCourseNames(rule), selectedCourseIds(rule));
  pushRaceClasses(lines, rule.race.raceClasses);
  pushHandicapStatus(lines, rule.race.handicapStatus);
  pushJumpSubtype(lines, rule);
  pushSelectionSummary(lines, "Trainer", "Trainers", selectedTrainerNames(rule), selectedTrainerIds(rule));
  pushTrainerCohort(lines, rule);
  pushSelectionSummary(lines, "Jockey", "Jockeys", selectedJockeyNames(rule), selectedJockeyIds(rule));
  pushReturnBucket(lines, rule.runner.returnBucket);
  pushRunAfterBreak(lines, rule.runner.runAfterBreak);
  pushRange(lines, "Current OR", rule.runner.officialRating);
  if (rule.family !== "jump") {
    pushDrawRange(lines, rule.runner.draw);
  }
  pushWeightRange(lines, "Weight", rule.runner.weightCarriedLbs);
  pushRange(lines, "Days since run", rule.runner.daysSinceRun);
  pushRange(lines, "Career prior runs", rule.runner.priorRuns);
  pushRange(lines, "Trainer prior runners", rule.runner.trainerPriorRuns);
  pushRange(lines, "Trainer prior strike rate", rule.runner.trainerPriorWinRate, "%");
  pushRange(lines, "Jockey prior rides", rule.runner.jockeyPriorRuns);
  pushRange(lines, "Jockey prior win rate", rule.runner.jockeyPriorWinRate, "%");
  pushStartingPriceSummary(lines, rule.startingPrice);
  for (const condition of rule.ratings) {
    pushRange(lines, labelForMetric(condition.metric), condition.range);
  }
  for (const condition of rule.relatives) {
    pushRange(lines, labelForMetric(condition.metric), condition.range);
  }
  for (const condition of rule.ranks) {
    pushRange(lines, rankLabelForMetric(condition.metric), condition.range);
  }
  pushTurfPerformanceSummary(lines, rule);
  return lines;
}

function pushTrainerCohort(lines: string[], rule: ResearchRuleV1) {
  const cohort = rule.runner.trainerCohort;
  if (!cohort || selectedTrainerIds(rule).length > 0) {
    return;
  }
  const referenceYear = trainerCohortReferenceYearFromDate(rule.dateRange.from);
  lines.push(`Trainer cohort: ${trainerCohortLabel({
    top: cohort.top,
    referenceYear,
    family: rule.family,
  })}`);
}

function pushSelectionSummary(
  lines: string[],
  singularLabel: string,
  pluralLabel: string,
  names: string[],
  ids: string[],
) {
  const selectedCount = Math.max(names.length, ids.length);
  if (selectedCount === 0) {
    return;
  }
  if (names.length === 1) {
    lines.push(`${singularLabel}: ${names[0]}`);
    return;
  }
  if (names.length > 1 && names.length <= 5) {
    lines.push(`${pluralLabel}: ${names.join("; ")}`);
    return;
  }
  lines.push(`${pluralLabel}: ${selectedCount} selected`);
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

function pushJumpSubtype(lines: string[], rule: ResearchRuleV1) {
  const subtype = rule.race.jumpSubtype;
  if (rule.family !== "jump" || !subtype || subtype === "all") {
    return;
  }
  const label = JUMP_SUBTYPE_OPTIONS.find((option) => option.value === subtype)?.label ?? subtype;
  lines.push(`Jump subtype: ${label}`);
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

function pushTurfPerformanceSummary(lines: string[], rule: ResearchRuleV1) {
  const condition = rule.turfPerformance;
  if (!condition) {
    return;
  }
  lines.push(`TPR version: ${condition.version}`);
  pushRange(lines, "TPR", condition.rating);
  if (!rule.ranks.some((rank) => rank.metric === "turfPerformanceRating")) {
    pushRange(lines, "TPR rank", condition.rank);
  }
  pushRange(lines, "TPR lead", condition.lead);
}

function pushStartingPriceSummary(lines: string[], condition: StartingPriceCondition | undefined) {
  if (!condition || (condition.minDecimal === undefined && condition.maxDecimalExclusive === undefined)) {
    return;
  }
  if (isImpossibleStartingPriceCondition(condition)) {
    lines.push("Starting price: invalid range");
    return;
  }
  const minLabel = startingPriceMinLabel(condition.minDecimal);
  const maxLabel = startingPriceMaxLabel(condition.maxDecimalExclusive);
  if (condition.minDecimal === undefined && condition.maxDecimalExclusive === 2) {
    lines.push("Starting price: under 1/1");
    return;
  }
  if (minLabel && maxLabel) {
    lines.push(`Starting price: ${minLabel} to ${maxLabel}`);
    return;
  }
  if (minLabel) {
    lines.push(`Starting price: ${minLabel}+`);
  }
  if (maxLabel) {
    lines.push(`Starting price: up to ${maxLabel}`);
  }
}

function startingPriceMinLabel(value: number | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  return value >= 21 ? "20/1" : `${value - 1}/1`;
}

function startingPriceMaxLabel(value: number | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  return value === 2 ? "under 1/1" : `${value - 2}/1`;
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

function pushDrawRange(lines: string[], range: NumericCondition | undefined) {
  if (!range || (range.min === undefined && range.max === undefined)) return;
  if (range.min !== undefined && range.max !== undefined) {
    lines.push(`Draw: ${range.min === range.max ? range.min : `${range.min}–${range.max}`}`);
  } else if (range.min !== undefined) {
    lines.push(`Draw: >= ${range.min}`);
  } else if (range.max !== undefined) {
    lines.push(`Draw: <= ${range.max}`);
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
  return COMPATIBLE_RANK_METRIC_OPTIONS.find((option) => option.value === metric)?.label ?? `${metric} rank`;
}

function normalizeRaceRule(race: Partial<ResearchRuleV1["race"]> | undefined): ResearchRuleV1["race"] {
  const { raceClass: legacyRaceClass, ...rest } = (race ?? {}) as Partial<ResearchRuleV1["race"]> & {
    raceClass?: unknown;
  };
  const courseIds = normalizedTextValues([
    ...(Array.isArray(rest.courseIds) ? rest.courseIds : []),
    rest.courseId,
  ]);
  const courseNames = normalizedTextValues(Array.isArray(rest.courseNames) ? rest.courseNames : []);
  if (courseIds.length === 0 && rest.courseName) {
    courseNames.push(rest.courseName.trim());
  }
  return {
    ...rest,
    courseIds,
    courseNames,
    courseId: undefined,
    courseName: undefined,
    raceClasses: normalizeRaceClasses([
      ...(Array.isArray(rest.raceClasses) ? rest.raceClasses : []),
      raceClassNumber(legacyRaceClass),
    ]),
    jumpSubtype: jumpSubtypeValue(rest.jumpSubtype),
  };
}

function normalizeRunnerRule(
  runner: Partial<ResearchRuleV1["runner"]> | undefined,
  family: ResearchRuleV1["family"],
): ResearchRuleV1["runner"] {
  const trainerIds = normalizedTextValues([
    ...(Array.isArray(runner?.trainerIds) ? runner.trainerIds : []),
    runner?.trainerId,
  ]);
  const trainerNames = normalizedTextValues([
    ...(Array.isArray(runner?.trainerNames) ? runner.trainerNames : []),
    runner?.trainerName,
  ]);
  const jockeyIds = normalizedTextValues([
    ...(Array.isArray(runner?.jockeyIds) ? runner.jockeyIds : []),
    runner?.jockeyId,
  ]);
  const jockeyNames = normalizedTextValues([
    ...(Array.isArray(runner?.jockeyNames) ? runner.jockeyNames : []),
    runner?.jockeyName,
  ]);
  const trainerCohort = normalizeTrainerCohortRule(runner?.trainerCohort);
  const draw = family === "jump" ? undefined : normalizeRange(runner?.draw);
  if (trainerCohort && trainerIds.length === 0) {
    return {
      ...runner,
      trainerIds,
      trainerNames,
      jockeyIds,
      jockeyNames,
      trainerId: undefined,
      trainerName: undefined,
      jockeyId: undefined,
      jockeyName: undefined,
      trainerCohort,
      draw,
    };
  }
  const normalized = { ...(runner ?? {}) };
  delete normalized.trainerCohort;
  return {
    ...normalized,
    trainerIds,
    trainerNames,
    jockeyIds,
    jockeyNames,
    draw,
    trainerId: undefined,
    trainerName: undefined,
    jockeyId: undefined,
    jockeyName: undefined,
  };
}

function normalizeTurfPerformanceCondition(value: unknown): TurfPerformanceCondition | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const version = value.version === TURF_PERFORMANCE_RATING_VERSION
    ? TURF_PERFORMANCE_RATING_VERSION
    : undefined;
  const rating = normalizeRange(value.rating);
  const rank = normalizeRange(value.rank);
  const lead = normalizeRange(value.lead);
  if (!version || (!rating && !rank && !lead)) {
    return undefined;
  }
  return { version, rating, rank, lead };
}

function normalizeStartingPriceCondition(value: unknown): StartingPriceCondition | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const minDecimal = numericField(value.minDecimal);
  const maxDecimalExclusive = numericField(value.maxDecimalExclusive);
  return minDecimal === undefined && maxDecimalExclusive === undefined
    ? undefined
    : { minDecimal, maxDecimalExclusive };
}

function numericField(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeTrainerCohortRule(value: unknown): TrainerCohortRule | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const top = (value as Partial<TrainerCohortRule>).top;
  return isTrainerCohortTop(top) ? trainerCohortRule(top) : undefined;
}

function trainerCohortFromTop(value: string | null): TrainerCohortRule | undefined {
  const top = Number(value);
  return isTrainerCohortTop(top) ? trainerCohortRule(top) : undefined;
}

function turfPerformanceFromParams(
  params: URLSearchParams,
  family: ResearchRuleV1["family"],
): TurfPerformanceCondition | undefined {
  const rating = rangeFromParams(params, "tprMin", "tprMax");
  const rank = rangeFromParams(params, "tprRankMin", "tprRankMax");
  const lead = rangeFromParams(params, "tprLeadMin", "tprLeadMax");
  if (family !== "turf_flat" || (!rating && !rank && !lead)) {
    return undefined;
  }
  return { version: TURF_PERFORMANCE_RATING_VERSION, rating, rank, lead };
}

export function startingPriceFromParams(params: URLSearchParams): StartingPriceCondition | undefined {
  return startingPriceConditionFromValues(params.get("spMin"), params.get("spMax"));
}

function rangeFromParams(params: URLSearchParams, minKey: string, maxKey: string): NumericCondition | undefined {
  const min = numberValue(params.get(minKey));
  const max = numberValue(params.get(maxKey));
  return min === undefined && max === undefined ? undefined : { min, max };
}

function intersectRanges(left: NumericCondition | undefined, right: NumericCondition): NumericCondition {
  const mins = [left?.min, right.min].filter((value): value is number => value !== undefined);
  const maxes = [left?.max, right.max].filter((value): value is number => value !== undefined);
  return {
    min: mins.length > 0 ? Math.max(...mins) : undefined,
    max: maxes.length > 0 ? Math.min(...maxes) : undefined,
  };
}

function normalizeRange(value: unknown): NumericCondition | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const min = typeof value.min === "number" && Number.isFinite(value.min) ? value.min : undefined;
  const max = typeof value.max === "number" && Number.isFinite(value.max) ? value.max : undefined;
  return min === undefined && max === undefined ? undefined : { min, max };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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

function textValues(values: Array<string | null>): string[] {
  return normalizedTextValues(values);
}

function normalizedTextValues(values: unknown[]): string[] {
  const unique = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") continue;
    const text = value.trim();
    if (text) unique.add(text);
  }
  return [...unique].sort((left, right) => left.localeCompare(right));
}

function selectedCourseIds(rule: ResearchRuleV1): string[] {
  return normalizedTextValues([
    ...(Array.isArray(rule.race.courseIds) ? rule.race.courseIds : []),
    rule.race.courseId,
  ]);
}

function selectedCourseNames(rule: ResearchRuleV1): string[] {
  return normalizedTextValues([
    ...(Array.isArray(rule.race.courseNames) ? rule.race.courseNames : []),
    rule.race.courseName,
  ]);
}

function selectedTrainerIds(rule: ResearchRuleV1): string[] {
  return normalizedTextValues([
    ...(Array.isArray(rule.runner.trainerIds) ? rule.runner.trainerIds : []),
    rule.runner.trainerId,
  ]);
}

function selectedTrainerNames(rule: ResearchRuleV1): string[] {
  return normalizedTextValues([
    ...(Array.isArray(rule.runner.trainerNames) ? rule.runner.trainerNames : []),
    rule.runner.trainerName,
  ]);
}

function selectedJockeyIds(rule: ResearchRuleV1): string[] {
  return normalizedTextValues([
    ...(Array.isArray(rule.runner.jockeyIds) ? rule.runner.jockeyIds : []),
    rule.runner.jockeyId,
  ]);
}

function selectedJockeyNames(rule: ResearchRuleV1): string[] {
  return normalizedTextValues([
    ...(Array.isArray(rule.runner.jockeyNames) ? rule.runner.jockeyNames : []),
    rule.runner.jockeyName,
  ]);
}

function courseMatches(features: HistoricalPreRaceFeatureRow, rule: ResearchRuleV1): boolean {
  const courseIds = selectedCourseIds(rule);
  if (courseIds.length > 0) {
    return selectedCourseIdSet(rule, courseIds).has(features.courseId);
  }
  const courseNames = selectedCourseNames(rule);
  return courseNames.length === 0 || courseNames.includes(features.courseName);
}

function trainerMatches(features: HistoricalPreRaceFeatureRow, rule: ResearchRuleV1): boolean {
  const trainerIds = selectedTrainerIds(rule);
  if (trainerIds.length === 0) {
    return true;
  }
  return features.trainerId !== null && selectedTrainerIdSet(rule, trainerIds).has(features.trainerId);
}

function jockeyMatches(features: HistoricalPreRaceFeatureRow, rule: ResearchRuleV1): boolean {
  const jockeyIds = selectedJockeyIds(rule);
  if (jockeyIds.length === 0) {
    return true;
  }
  const jockeyId = features.jockeyId;
  return jockeyId ? selectedJockeyIdSet(rule, jockeyIds).has(jockeyId) : false;
}

function selectedCourseIdSet(rule: ResearchRuleV1, ids = selectedCourseIds(rule)): Set<string> {
  return selectedIdSet(rule, ids, courseIdSetCache);
}

function selectedTrainerIdSet(rule: ResearchRuleV1, ids = selectedTrainerIds(rule)): Set<string> {
  return selectedIdSet(rule, ids, trainerIdSetCache);
}

function selectedJockeyIdSet(rule: ResearchRuleV1, ids = selectedJockeyIds(rule)): Set<string> {
  return selectedIdSet(rule, ids, jockeyIdSetCache);
}

function selectedIdSet(
  rule: ResearchRuleV1,
  ids: string[],
  cache: WeakMap<ResearchRuleV1, { key: string; set: Set<string> }>,
): Set<string> {
  const key = ids.join("\0");
  const cached = cache.get(rule);
  if (cached?.key === key) {
    return cached.set;
  }
  const next = { key, set: new Set(ids) };
  cache.set(rule, next);
  return next.set;
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

function jumpSubtypeValue(value: unknown): JumpSubtypeFilter | undefined {
  return JUMP_SUBTYPE_OPTIONS.some((option) => option.value === value)
    ? value as JumpSubtypeFilter
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

function jumpSubtypeMatches(
  features: HistoricalPreRaceFeatureRow,
  rule: ResearchRuleV1,
): boolean {
  const filter = rule.race.jumpSubtype;
  if (rule.family !== "jump" || !filter || filter === "all") {
    return true;
  }
  return classifyJumpRaceSubtype(features) === filter;
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
