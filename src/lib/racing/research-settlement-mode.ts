import {
  summarizeSelections,
  type BacktestSelection,
  type BacktestSettlement,
  type BacktestSummary,
} from "./backtest";
import type { DevelopmentSettlementMode } from "./development-settlement-mode";
export {
  developmentSettlementModeDescription,
  developmentSettlementModeLabel,
  parseDevelopmentSettlementMode,
  type DevelopmentSettlementMode,
} from "./development-settlement-mode";

const MODE_CAP_DECIMAL: Partial<Record<DevelopmentSettlementMode, number>> = {
  cap_20_1: 21,
  cap_33_1: 34,
};

export function summarizeSelectionsForDevelopmentSettlementMode(
  selections: BacktestSelection[],
  mode: DevelopmentSettlementMode,
): BacktestSummary {
  return summarizeSelections(
    selections.map((selection) => selectionForDevelopmentSettlementMode(selection, mode)),
  );
}

export function selectionForDevelopmentSettlementMode<TSelection extends BacktestSelection>(
  selection: TSelection,
  mode: DevelopmentSettlementMode,
): TSelection {
  const capDecimal = MODE_CAP_DECIMAL[mode];
  if (
    capDecimal === undefined ||
    !selection.outcome.won ||
    !selection.settlement ||
    selection.settlement.settlementOddsDecimal <= capDecimal
  ) {
    return selection;
  }
  const settlement: BacktestSettlement = {
    ...selection.settlement,
    settlementOddsDecimal: capDecimal,
    grossReturn: capDecimal,
    profitLoss: cappedWinningProfit(selection.settlement.stake, capDecimal),
  };
  return {
    ...selection,
    settlement,
  };
}

function cappedWinningProfit(stake: number, cappedDecimalOdds: number): number {
  return cappedDecimalOdds - stake;
}
