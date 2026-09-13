import {
  summarizeSelections,
  type BacktestSummary,
} from "./backtest";
import type { ResearchResult, ResearchSelection } from "./research-rule";
import {
  selectionForDevelopmentSettlementMode,
  type DevelopmentSettlementMode,
} from "./research-settlement-mode";

export type ResearchPriceSensitivityScenario = {
  id: string;
  label: string;
  summary: BacktestSummary;
};

export type ResearchPriceSensitivityResult = {
  scenarios: ResearchPriceSensitivityScenario[];
  summaryLabel: string;
  diagnostics: {
    largestWinnerProfit: number | null;
    largestWinningDecimalSp: number | null;
    top1WinnerProfitShare: number | null;
    top3WinnerProfitShare: number | null;
    top5WinnerProfitShare: number | null;
  };
};

type PriceThreshold = {
  id: string;
  label: string;
  decimal: number;
  mode?: DevelopmentSettlementMode;
};

const EXCLUSION_THRESHOLDS: PriceThreshold[] = [
  { id: "20_1", label: "20/1", decimal: 21 },
  { id: "33_1", label: "33/1", decimal: 34 },
  { id: "50_1", label: "50/1", decimal: 51 },
];

const CAP_THRESHOLDS: PriceThreshold[] = [
  { id: "20_1", label: "20/1", decimal: 21, mode: "cap_20_1" },
  { id: "33_1", label: "33/1", decimal: 34, mode: "cap_33_1" },
];

export function evaluateResearchPriceSensitivity(
  result: ResearchResult,
): ResearchPriceSensitivityResult {
  const scenarios: ResearchPriceSensitivityScenario[] = [
    {
      id: "actual",
      label: "Actual result SP",
      summary: result.summary,
    },
    ...EXCLUSION_THRESHOLDS.map((threshold) => ({
      id: `exclude_gt_${threshold.id}`,
      label: `Exclude winners >${threshold.label}`,
      summary: summarizeSelections(
        result.selectedRunners.filter((selection) =>
          !isWinningSelectionAbove(selection, threshold.decimal),
        ),
      ),
    })),
    ...CAP_THRESHOLDS.map((threshold) => ({
      id: `cap_${threshold.id}`,
      label: `Cap winners at ${threshold.label}`,
      summary: summarizeSelections(
        result.selectedRunners.map((selection) =>
          selectionForDevelopmentSettlementMode(selection, threshold.mode!),
        ),
      ),
    })),
  ];
  const diagnostics = winnerContributionDiagnostics(result.selectedRunners);

  return {
    scenarios,
    diagnostics,
    summaryLabel: priceSensitivitySummaryLabel(scenarios, diagnostics),
  };
}

function isWinningSelectionAbove(selection: ResearchSelection, thresholdDecimal: number): boolean {
  return Boolean(
    selection.outcome.won &&
      selection.settlement &&
      selection.settlement.settlementOddsDecimal > thresholdDecimal,
  );
}

function winnerContributionDiagnostics(
  selections: ResearchSelection[],
): ResearchPriceSensitivityResult["diagnostics"] {
  const winningProfits = selections
    .filter((selection) => selection.outcome.won && selection.settlement !== null)
    .map((selection) => ({
      profit: selection.settlement!.profitLoss,
      decimalSp: selection.settlement!.settlementOddsDecimal,
    }))
    .filter((winner) => winner.profit > 0)
    .sort((left, right) => right.profit - left.profit);
  const totalWinningProfit = winningProfits.reduce((total, winner) => total + winner.profit, 0);
  if (winningProfits.length === 0 || totalWinningProfit <= 0) {
    return {
      largestWinnerProfit: null,
      largestWinningDecimalSp: null,
      top1WinnerProfitShare: null,
      top3WinnerProfitShare: null,
      top5WinnerProfitShare: null,
    };
  }

  return {
    largestWinnerProfit: winningProfits[0]!.profit,
    largestWinningDecimalSp: Math.max(...winningProfits.map((winner) => winner.decimalSp)),
    top1WinnerProfitShare: share(winningProfits, totalWinningProfit, 1),
    top3WinnerProfitShare: share(winningProfits, totalWinningProfit, 3),
    top5WinnerProfitShare: share(winningProfits, totalWinningProfit, 5),
  };
}

function share(
  winners: Array<{ profit: number }>,
  totalWinningProfit: number,
  count: number,
): number {
  return winners
    .slice(0, count)
    .reduce((total, winner) => total + winner.profit, 0) / totalWinningProfit * 100;
}

function priceSensitivitySummaryLabel(
  scenarios: ResearchPriceSensitivityScenario[],
  diagnostics: ResearchPriceSensitivityResult["diagnostics"],
): string {
  if (diagnostics.largestWinnerProfit === null) {
    return "No winning selections available for price sensitivity";
  }
  const cap20 = scenarios.find((scenario) => scenario.id === "cap_20_1");
  if (
    (cap20?.summary.roiPercentage ?? -Infinity) > 0 &&
    (diagnostics.top3WinnerProfitShare ?? Infinity) < 40
  ) {
    return "Profit remains positive after large-price sensitivity checks";
  }
  if (
    (cap20?.summary.roiPercentage ?? 0) < 0 ||
    (diagnostics.top3WinnerProfitShare ?? 0) >= 60
  ) {
    return "Profit is materially dependent on large-priced winners";
  }
  return "Mixed price sensitivity";
}
