import type { BacktestSummary } from "./backtest";
import type { HistoricalTargetRunnerMetricsRow } from "./historical-target-metrics";
import {
  evaluateResearchRule,
  type ResearchResult,
  type ResearchRuleV1,
} from "./research-rule";

export type ResearchTimeSliceRow = {
  id: string;
  label: string;
  from: string;
  to: string;
  isFullPeriod: boolean;
  smallSample: boolean;
  eligibleRunners: number;
  summary: BacktestSummary;
  rule: ResearchRuleV1;
};

export type ResearchTimeSliceStabilityResult = {
  rows: ResearchTimeSliceRow[];
  summaryLabel: string;
  concentrationLabel: string | null;
  elapsedMs: number;
};

type SliceDefinition = {
  label: string;
  from: string;
  to: string;
  isFullPeriod: boolean;
};

const QUARTERS: SliceDefinition[] = [
  { label: "Jan-Mar", from: "2025-01-01", to: "2025-03-31", isFullPeriod: false },
  { label: "Apr-Jun", from: "2025-04-01", to: "2025-06-30", isFullPeriod: false },
  { label: "Jul-Sep", from: "2025-07-01", to: "2025-09-30", isFullPeriod: false },
  { label: "Oct-Dec", from: "2025-10-01", to: "2025-12-31", isFullPeriod: false },
];

const SMALL_SETTLED_SAMPLE = 25;
const CONCENTRATION_THRESHOLD = 0.6;

export function evaluateResearchTimeSliceStability(input: {
  rows: HistoricalTargetRunnerMetricsRow[];
  result: ResearchResult;
}): ResearchTimeSliceStabilityResult {
  const startedAt = performance.now();
  const slices = researchTimeSlices(input.result.rule);
  const rows = slices.map((slice): ResearchTimeSliceRow => {
    const rule = slice.isFullPeriod
      ? input.result.rule
      : { ...input.result.rule, dateRange: { from: slice.from, to: slice.to } };
    const result = slice.isFullPeriod
      ? input.result
      : evaluateResearchRule({ rows: input.rows, rule });

    return {
      id: `${slice.from}:${slice.to}`,
      label: slice.label,
      from: slice.from,
      to: slice.to,
      isFullPeriod: slice.isFullPeriod,
      smallSample: result.summary.settledSelections > 0 &&
        result.summary.settledSelections < SMALL_SETTLED_SAMPLE,
      eligibleRunners: result.baselineRows,
      summary: result.summary,
      rule,
    };
  });

  return {
    rows,
    summaryLabel: timeSliceSummaryLabel(rows),
    concentrationLabel: profitConcentrationLabel(rows),
    elapsedMs: performance.now() - startedAt,
  };
}

export function researchTimeSlices(rule: ResearchRuleV1): SliceDefinition[] {
  const from = rule.dateRange.from;
  const to = rule.dateRange.to;
  const quarterSlices = QUARTERS
    .map((quarter) => intersectSlice(quarter, from, to))
    .filter((slice): slice is SliceDefinition => slice !== null);

  return [
    ...quarterSlices,
    {
      label: "Full period",
      from,
      to,
      isFullPeriod: true,
    },
  ];
}

function intersectSlice(
  slice: SliceDefinition,
  rangeFrom: string,
  rangeTo: string,
): SliceDefinition | null {
  const from = maxDate(slice.from, rangeFrom);
  const to = minDate(slice.to, rangeTo);
  if (from > to) {
    return null;
  }
  return {
    ...slice,
    from,
    to,
  };
}

function timeSliceSummaryLabel(rows: ResearchTimeSliceRow[]): string {
  const slices = rows.filter((row) => !row.isFullPeriod);
  if (slices.some((row) => row.summary.settledSelections === 0)) {
    return "No settled selections in some periods";
  }
  if (slices.length === 0) {
    return "No time slices available";
  }
  const profitable = slices.filter((row) => (row.summary.roiPercentage ?? -Infinity) > 0).length;
  if (profitable === slices.length) {
    return `Profitable in ${profitable} of ${slices.length} periods`;
  }
  if (profitable >= Math.max(2, slices.length - 1)) {
    return `Profitable in ${profitable} of ${slices.length} periods`;
  }
  const concentrationRatio = profitConcentrationRatio(slices);
  if (concentrationRatio !== null && concentrationRatio >= CONCENTRATION_THRESHOLD) {
    return "Profit concentrated in one period";
  }
  return "Mixed results across periods";
}

function profitConcentrationLabel(rows: ResearchTimeSliceRow[]): string | null {
  const slices = rows.filter((row) => !row.isFullPeriod);
  const ratio = profitConcentrationRatio(slices);
  if (ratio === null) {
    return null;
  }
  if (ratio >= CONCENTRATION_THRESHOLD) {
    return "Development profit is concentrated in one period.";
  }
  return "Development profit is spread across profitable periods.";
}

function profitConcentrationRatio(rows: ResearchTimeSliceRow[]): number | null {
  const positiveProfits = rows
    .map((row) => row.summary.profitLoss)
    .filter((value) => value > 0);
  const totalPositiveProfit = positiveProfits.reduce((total, value) => total + value, 0);
  if (totalPositiveProfit <= 0) {
    return null;
  }
  return Math.max(...positiveProfits) / totalPositiveProfit;
}

function maxDate(left: string, right: string): string {
  return left > right ? left : right;
}

function minDate(left: string, right: string): string {
  return left < right ? left : right;
}
