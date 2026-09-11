import { DEFAULT_PERFORMANCE_REFERENCE_WEIGHT_LB } from "./weight-performance";

export const TODAYS_RATING_CALCULATION_VERSION = "todays_rating_v1";

export type TodaysRating = {
  historicalPerformanceRating: number;
  currentWeightCarriedLb: number;
  referenceWeightLb: number;
  currentWeightAdjustment: number;
  todaysRating: number;
  calculationVersion: typeof TODAYS_RATING_CALCULATION_VERSION;
};

export function calculateTodaysRating(input: {
  historicalPerformanceRating: number | null;
  currentWeightCarriedLb: number | null;
  referenceWeightLb?: number;
}): TodaysRating | null {
  if (
    input.historicalPerformanceRating === null ||
    input.currentWeightCarriedLb === null ||
    !Number.isFinite(input.historicalPerformanceRating) ||
    !Number.isFinite(input.currentWeightCarriedLb) ||
    input.currentWeightCarriedLb <= 0
  ) {
    return null;
  }

  const referenceWeightLb =
    input.referenceWeightLb ?? DEFAULT_PERFORMANCE_REFERENCE_WEIGHT_LB;
  const currentWeightAdjustment = input.currentWeightCarriedLb - referenceWeightLb;
  return {
    historicalPerformanceRating: input.historicalPerformanceRating,
    currentWeightCarriedLb: input.currentWeightCarriedLb,
    referenceWeightLb,
    currentWeightAdjustment,
    todaysRating: input.historicalPerformanceRating - currentWeightAdjustment,
    calculationVersion: TODAYS_RATING_CALCULATION_VERSION,
  };
}
