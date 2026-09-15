export type BestL3TrustScoreInput = {
  topGapToRank2: number | null;
  largeGapThreshold: number | null;
  trainerPriorWinRate: number | null;
  fieldSize: number | null;
};

export type BestL3TrustScoreComponents = {
  largeGap: boolean;
  trainerStrike: boolean;
  smallField: boolean;
};

export type BestL3TrustScore = {
  score: 0 | 1 | 2 | 3;
  components: BestL3TrustScoreComponents;
};

export type BestL3TrustComponentCombination =
  | "none"
  | "large_gap_only"
  | "trainer_strike_only"
  | "small_field_only"
  | "large_gap_and_trainer"
  | "large_gap_and_small_field"
  | "trainer_and_small_field"
  | "all_three";

export type BestL3TrustSpBand =
  | "lt_2"
  | "2_00_to_2_99"
  | "3_00_to_4_99"
  | "5_00_to_7_99"
  | "8_plus";

export function bestL3LargeGapThresholdFromDevelopmentGaps(
  gaps: Array<number | null>,
): number | null {
  const positiveGaps = gaps
    .filter((gap): gap is number => gap !== null && Number.isFinite(gap) && gap > 0)
    .sort((left, right) => left - right);
  return percentileValue(positiveGaps, 0.75);
}

export function bestL3TrustScore(input: BestL3TrustScoreInput): BestL3TrustScore {
  const components: BestL3TrustScoreComponents = {
    largeGap: input.largeGapThreshold !== null &&
      input.topGapToRank2 !== null &&
      input.topGapToRank2 >= input.largeGapThreshold,
    trainerStrike: input.trainerPriorWinRate !== null && input.trainerPriorWinRate >= 15,
    smallField: input.fieldSize !== null && input.fieldSize <= 5,
  };
  const score = [
    components.largeGap,
    components.trainerStrike,
    components.smallField,
  ].filter(Boolean).length as 0 | 1 | 2 | 3;
  return { score, components };
}

export function bestL3TrustComponentCombination(
  components: BestL3TrustScoreComponents,
): BestL3TrustComponentCombination {
  if (components.largeGap && components.trainerStrike && components.smallField) return "all_three";
  if (components.largeGap && components.trainerStrike) return "large_gap_and_trainer";
  if (components.largeGap && components.smallField) return "large_gap_and_small_field";
  if (components.trainerStrike && components.smallField) return "trainer_and_small_field";
  if (components.largeGap) return "large_gap_only";
  if (components.trainerStrike) return "trainer_strike_only";
  if (components.smallField) return "small_field_only";
  return "none";
}

export function bestL3TrustSpBand(decimalSp: number | null): BestL3TrustSpBand | null {
  if (decimalSp === null || !Number.isFinite(decimalSp) || decimalSp <= 0) return null;
  if (decimalSp < 2) return "lt_2";
  if (decimalSp < 3) return "2_00_to_2_99";
  if (decimalSp < 5) return "3_00_to_4_99";
  if (decimalSp < 8) return "5_00_to_7_99";
  return "8_plus";
}

function percentileValue(sortedValues: number[], percentile: number) {
  if (sortedValues.length === 0) return null;
  const index = (sortedValues.length - 1) * percentile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower]!;
  const weight = index - lower;
  return sortedValues[lower]! * (1 - weight) + sortedValues[upper]! * weight;
}
