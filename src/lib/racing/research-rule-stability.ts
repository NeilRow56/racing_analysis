import type { BacktestSummary } from "./backtest";
import type { HistoricalTargetRunnerMetricsRow } from "./historical-target-metrics";
import {
  evaluateResearchRule,
  RATING_METRIC_OPTIONS,
  RELATIVE_METRIC_OPTIONS,
  type NumericCondition,
  type RankCondition,
  type RatingCondition,
  type RelativeCondition,
  type ResearchResult,
  type ResearchRuleV1,
} from "./research-rule";
import { researchRuleKey } from "./research-rule-identity";
import {
  developmentSettlementModeDescription,
  summarizeSelectionsForDevelopmentSettlementMode,
  type DevelopmentSettlementMode,
} from "./research-settlement-mode";

export type ResearchRuleStabilityRow = {
  id: string;
  label: string;
  isCurrent: boolean;
  rule: ResearchRuleV1;
  eligibleRunners: number;
  summary: BacktestSummary;
};

export type ResearchRuleStabilityResult = {
  rows: ResearchRuleStabilityRow[];
  summaryLabel: string;
  settlementMode: DevelopmentSettlementMode;
  settlementModeLabel: string;
  elapsedMs: number;
};

type VariantCandidate = {
  label: string;
  rule: ResearchRuleV1;
};

const TRAINER_PRIOR_RUNS_STEP = 25;
const TRAINER_PRIOR_STRIKE_RATE_STEP = 1;
const CAREER_PRIOR_RUNS_STEP = 1;
const DAYS_SINCE_RUN_STEP = 5;
const FIELD_SIZE_STEP = 1;
const OFFICIAL_RATING_STEP = 5;
const DRAW_STEP = 1;
const RATING_STEP = 5;
const RELATIVE_STEP = 5;
const RANK_STEP = 1;

export function evaluateResearchRuleStability(input: {
  rows: HistoricalTargetRunnerMetricsRow[];
  result: ResearchResult;
  settlementMode?: DevelopmentSettlementMode;
}): ResearchRuleStabilityResult {
  const startedAt = performance.now();
  const settlementMode = input.settlementMode ?? "actual";
  const candidates = researchRuleStabilityVariants(input.result.rule);
  const rows = candidates.map((candidate, index): ResearchRuleStabilityRow => {
    const result = index === 0
      ? input.result
      : evaluateResearchRule({
          rows: input.rows,
          rule: candidate.rule,
          trainerCohort: input.result.trainerCohort,
        });
    return {
      id: researchRuleKey(candidate.rule),
      label: candidate.label,
      isCurrent: index === 0,
      rule: candidate.rule,
      eligibleRunners: result.baselineRows,
      summary: summarizeSelectionsForDevelopmentSettlementMode(result.selectedRunners, settlementMode),
    };
  });

  return {
    rows,
    summaryLabel: stabilitySummaryLabel(rows),
    settlementMode,
    settlementModeLabel: developmentSettlementModeDescription(settlementMode),
    elapsedMs: performance.now() - startedAt,
  };
}

export function researchRuleStabilityVariants(rule: ResearchRuleV1): VariantCandidate[] {
  const currentKey = researchRuleKey(rule);
  const seen = new Set([currentKey]);
  const variants: VariantCandidate[] = [{ label: "Current", rule }];
  const add = (candidate: VariantCandidate) => {
    const key = researchRuleKey(candidate.rule);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    variants.push(candidate);
  };

  addRangeVariants({
    add,
    label: "Field size",
    range: rule.race.fieldSize,
    step: FIELD_SIZE_STEP,
    minValue: 1,
    update: (next) => ({ ...rule, race: { ...rule.race, fieldSize: next } }),
  });
  addRangeVariants({
    add,
    label: "OR",
    range: rule.runner.officialRating,
    step: OFFICIAL_RATING_STEP,
    minValue: 0,
    update: (next) => ({ ...rule, runner: { ...rule.runner, officialRating: next } }),
  });
  if (rule.family !== "jump") {
    addRangeVariants({
      add,
      label: "Draw",
      range: rule.runner.draw,
      step: DRAW_STEP,
      minValue: 1,
      update: (next) => ({ ...rule, runner: { ...rule.runner, draw: next } }),
    });
  }
  addRangeVariants({
    add,
    label: "Days since run",
    range: rule.runner.daysSinceRun,
    step: DAYS_SINCE_RUN_STEP,
    minValue: 0,
    update: (next) => ({ ...rule, runner: { ...rule.runner, daysSinceRun: next } }),
  });
  addRangeVariants({
    add,
    label: "Career prior runs",
    range: rule.runner.priorRuns,
    step: CAREER_PRIOR_RUNS_STEP,
    minValue: 0,
    update: (next) => ({ ...rule, runner: { ...rule.runner, priorRuns: next } }),
  });
  addRangeVariants({
    add,
    label: "Trainer prior runners",
    range: rule.runner.trainerPriorRuns,
    step: TRAINER_PRIOR_RUNS_STEP,
    minValue: 0,
    update: (next) => ({ ...rule, runner: { ...rule.runner, trainerPriorRuns: next } }),
  });
  addRangeVariants({
    add,
    label: "Trainer strike rate",
    range: rule.runner.trainerPriorWinRate,
    step: TRAINER_PRIOR_STRIKE_RATE_STEP,
    minValue: 0,
    suffix: "%",
    update: (next) => ({ ...rule, runner: { ...rule.runner, trainerPriorWinRate: next } }),
  });

  rule.ratings.forEach((condition, index) => {
    addRangeVariants({
      add,
      label: labelForRatingMetric(condition.metric),
      range: condition.range,
      step: RATING_STEP,
      minValue: 0,
      update: (next) => replaceRatingCondition(rule, index, { ...condition, range: next }),
    });
  });
  rule.relatives.forEach((condition, index) => {
    addRangeVariants({
      add,
      label: labelForRelativeMetric(condition.metric),
      range: condition.range,
      step: RELATIVE_STEP,
      update: (next) => replaceRelativeCondition(rule, index, { ...condition, range: next }),
    });
  });
  rule.ranks.forEach((condition, index) => {
    addRangeVariants({
      add,
      label: "Rank",
      range: condition.range,
      step: RANK_STEP,
      minValue: 1,
      update: (next) => replaceRankCondition(rule, index, { ...condition, range: next }),
    });
  });

  return variants;
}

function addRangeVariants(input: {
  add: (candidate: VariantCandidate) => void;
  label: string;
  range: NumericCondition | undefined;
  step: number;
  minValue?: number;
  suffix?: string;
  update: (range: NumericCondition) => ResearchRuleV1;
}) {
  if (!input.range) {
    return;
  }
  for (const bound of ["min", "max"] as const) {
    const value = input.range[bound];
    if (value === undefined) {
      continue;
    }
    for (const direction of [-1, 1] as const) {
      const nextValue = clampLower(value + direction * input.step, input.minValue);
      if (nextValue === value) {
        continue;
      }
      const nextRange = { ...input.range, [bound]: nextValue };
      if (!isValidRange(nextRange)) {
        continue;
      }
      input.add({
        label: `${input.label} ${bound} ${formatThreshold(nextValue, input.suffix)}`,
        rule: input.update(nextRange),
      });
    }
  }
}

function isValidRange(range: NumericCondition): boolean {
  return range.min === undefined || range.max === undefined || range.min <= range.max;
}

function clampLower(value: number, minValue: number | undefined): number {
  return minValue === undefined ? value : Math.max(minValue, value);
}

function formatThreshold(value: number, suffix = ""): string {
  return `${Number.isInteger(value) ? value.toString() : value.toFixed(1)}${suffix}`;
}

function replaceRatingCondition(
  rule: ResearchRuleV1,
  index: number,
  condition: RatingCondition,
): ResearchRuleV1 {
  return {
    ...rule,
    ratings: rule.ratings.map((item, itemIndex) => itemIndex === index ? condition : item),
  };
}

function replaceRelativeCondition(
  rule: ResearchRuleV1,
  index: number,
  condition: RelativeCondition,
): ResearchRuleV1 {
  return {
    ...rule,
    relatives: rule.relatives.map((item, itemIndex) => itemIndex === index ? condition : item),
  };
}

function replaceRankCondition(
  rule: ResearchRuleV1,
  index: number,
  condition: RankCondition,
): ResearchRuleV1 {
  return {
    ...rule,
    ranks: rule.ranks.map((item, itemIndex) => itemIndex === index ? condition : item),
  };
}

function labelForRatingMetric(metric: RatingCondition["metric"]): string {
  return RATING_METRIC_OPTIONS.find((option) => option.value === metric)?.label ?? metric;
}

function labelForRelativeMetric(metric: RelativeCondition["metric"]): string {
  return RELATIVE_METRIC_OPTIONS.find((option) => option.value === metric)?.label ?? metric;
}

function stabilitySummaryLabel(rows: ResearchRuleStabilityRow[]): string {
  const current = rows.find((row) => row.isCurrent);
  const nearby = rows.filter((row) => !row.isCurrent);
  if (!current || nearby.length === 0) {
    return "No nearby numeric variants to test";
  }
  const minimumSelections = Math.max(1, current.summary.selections * 0.5);
  const robustCount = nearby.filter((row) =>
    (row.summary.roiPercentage ?? -Infinity) > 0 &&
    row.summary.selections >= minimumSelections,
  ).length;
  const robustShare = robustCount / nearby.length;
  if (robustShare >= 0.7) {
    return "Nearby variants mostly remain profitable";
  }
  if ((current.summary.roiPercentage ?? -Infinity) > 0 && robustShare <= 0.33) {
    return "Current rule is materially stronger than nearby variants";
  }
  return "Mixed nearby results";
}
