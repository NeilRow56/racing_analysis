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
    courseName?: string;
    raceClass?: string;
    distanceYards?: NumericCondition;
    fieldSize?: NumericCondition;
  };
  runner: {
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
      race: parsed.race ?? {},
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
    courseName: textValue(params.get("course")),
    raceClass: textValue(params.get("class")),
    distanceYards: rangeFromParams(params, "distanceMin", "distanceMax"),
    fieldSize: rangeFromParams(params, "fieldMin", "fieldMax"),
  };
  rule.runner = {
    officialRating: rangeFromParams(params, "orMin", "orMax"),
    weightCarriedLbs: rangeFromParams(params, "weightMin", "weightMax"),
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

function matchesRaceConditions(features: HistoricalPreRaceFeatureRow, rule: ResearchRuleV1): boolean {
  const fieldSize = features.actualRunnerCount ?? features.declaredRunnerCount;
  return (!rule.race.courseName || features.courseName === rule.race.courseName) &&
    (!rule.race.raceClass || features.raceClass === rule.race.raceClass) &&
    rangeMatches(features.distanceYards, rule.race.distanceYards) &&
    rangeMatches(fieldSize, rule.race.fieldSize);
}

function matchesRunnerConditions(features: HistoricalPreRaceFeatureRow, rule: ResearchRuleV1): boolean {
  return rangeMatches(features.officialRating, rule.runner.officialRating) &&
    rangeMatches(features.weightCarriedLbs, rule.runner.weightCarriedLbs) &&
    rangeMatches(features.daysSinceLastRun, rule.runner.daysSinceRun) &&
    rangeMatches(features.priorRuns, rule.runner.priorRuns);
}

function matchesRatingConditions(features: HistoricalPreRaceFeatureRow, rule: ResearchRuleV1): boolean {
  return rule.ratings.every((condition) =>
    rangeMatches(metricValue(features, condition.metric), condition.range),
  );
}

function matchesRelativeConditions(features: HistoricalPreRaceFeatureRow, rule: ResearchRuleV1): boolean {
  const derived = deriveBacktestFeatureValues(features);
  return rule.relatives.every((condition) =>
    rangeMatches(derived[condition.metric], condition.range),
  );
}

function matchesRankConditions(row: RankedResearchRow, rule: ResearchRuleV1): boolean {
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

function strategySummary(rule: ResearchRuleV1): string[] {
  const lines = [
    `Family: ${familyLabel(rule.family)}`,
    `Dates: ${rule.dateRange.from} to ${rule.dateRange.to}`,
  ];
  pushRange(lines, "Distance", rule.race.distanceYards, "y");
  pushRange(lines, "Field size", rule.race.fieldSize);
  if (rule.race.courseName) lines.push(`Course: ${rule.race.courseName}`);
  if (rule.race.raceClass) lines.push(`Class: ${rule.race.raceClass}`);
  pushRange(lines, "Current OR", rule.runner.officialRating);
  pushRange(lines, "Current weight", rule.runner.weightCarriedLbs, "lb");
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

function rangeFromParams(params: URLSearchParams, minKey: string, maxKey: string): NumericCondition | undefined {
  const min = numberValue(params.get(minKey));
  const max = numberValue(params.get(maxKey));
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
