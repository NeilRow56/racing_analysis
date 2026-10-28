import type { ProspectiveGoing } from "./prospective-going";
import type { TissueInputReliability } from "./tissue-input-reliability";
import { TISSUE_VALUE_FAMILIES, type TissueValueFamily, type ValueOutcome } from "./tissue-value-metrics";

export const TISSUE_PROSPECTIVE_START = "2026-10-20";
export type ProspectiveTissueObservation = ProspectiveGoing & {
  family: TissueValueFamily;
  tissueRank: number;
  probability: number;
  capturedPrice: number | null;
  bestL3SpeedRank?: number | null;
  inputReliability?: TissueInputReliability;
  runnerId?: string;
  raceId?: string;
  capturedAt?: string;
  outcome: ValueOutcome | null;
};

/** Reporting only: P/L is the persisted canonical settlement, never recalculated here. */
export function tissueProspectiveMetrics(rows: ProspectiveTissueObservation[]) {
  const settled = rows.filter(row => row.outcome?.status === "settled");
  const winners = settled.filter(row => row.outcome!.winner === true).length;
  const modelExpected = settled.reduce((sum, row) => sum + row.probability, 0);
  const priced = settled.filter(row => row.capturedPrice !== null && Number.isFinite(row.capturedPrice) && row.capturedPrice > 1 &&
    row.outcome!.profitLoss !== null && Number.isFinite(row.outcome!.profitLoss));
  const profitLoss = priced.length ? priced.reduce((sum, row) => sum + row.outcome!.profitLoss!, 0) : null;
  return {
    captured: rows.length, settled: settled.length, winners,
    strikeRate: settled.length ? winners / settled.length : null,
    modelExpected, actualModelExpected: modelExpected > 0 ? winners / modelExpected : null,
    priceN: priced.length, profitLoss, roi: profitLoss !== null ? profitLoss / priced.length : null,
    sample: settled.length < 50 ? "TOO EARLY" : settled.length < 150 ? "EARLY" : settled.length < 300 ? "DEVELOPING" : "MEANINGFUL",
  };
}

export function summarizeProspectiveTissue(rows: ProspectiveTissueObservation[]) {
  return ([1, 2, "TOP_2"] as const).map(rank => {
    const selected = rows.filter(row => rank === "TOP_2" ? row.tissueRank === 1 || row.tissueRank === 2 : row.tissueRank === rank);
    return {
      rank,
      rows: [...TISSUE_VALUE_FAMILIES, "ALL" as const].map(family => ({
        family, ...tissueProspectiveMetrics(selected.filter(row => family === "ALL" || row.family === family)),
      })),
    };
  });
}
