export const WEIGHT_PERFORMANCE_CALCULATION_VERSION = "weight_performance_v1";
export const DEFAULT_PERFORMANCE_REFERENCE_WEIGHT_LB = 168;

export type WeightAdjustedPerformance = {
  rawSpeedRating: number;
  weightCarriedLb: number;
  referenceWeightLb: number;
  weightAdjustment: number;
  performanceRating: number;
  calculationVersion: typeof WEIGHT_PERFORMANCE_CALCULATION_VERSION;
};

export function calculateWeightAdjustedPerformance(input: {
  rawSpeedRating: number | null;
  weightCarriedLb: number | null;
  referenceWeightLb?: number;
}): WeightAdjustedPerformance | null {
  if (
    input.rawSpeedRating === null ||
    input.weightCarriedLb === null ||
    !Number.isFinite(input.rawSpeedRating) ||
    !Number.isFinite(input.weightCarriedLb) ||
    input.weightCarriedLb <= 0
  ) {
    return null;
  }

  const referenceWeightLb =
    input.referenceWeightLb ?? DEFAULT_PERFORMANCE_REFERENCE_WEIGHT_LB;
  const weightAdjustment = input.weightCarriedLb - referenceWeightLb;
  return {
    rawSpeedRating: input.rawSpeedRating,
    weightCarriedLb: input.weightCarriedLb,
    referenceWeightLb,
    weightAdjustment,
    performanceRating: input.rawSpeedRating + weightAdjustment,
    calculationVersion: WEIGHT_PERFORMANCE_CALCULATION_VERSION,
  };
}
