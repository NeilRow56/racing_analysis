export type RelativeMetric =
  | "latestSpeedMinusOR"
  | "bestL3SpeedMinusOR"
  | "latestPerformanceMinusOR"
  | "bestPerformanceL3MinusOR"
  | "latestTodaysRatingMinusOR"
  | "bestTodaysRatingL3MinusOR";

export const RELATIVE_METRIC_OPTIONS: Array<{ value: RelativeMetric; label: string }> = [
  { value: "latestSpeedMinusOR", label: "Latest Speed minus OR" },
  { value: "bestL3SpeedMinusOR", label: "Best L3 Speed minus OR" },
  { value: "latestPerformanceMinusOR", label: "Latest Performance minus OR" },
  { value: "bestPerformanceL3MinusOR", label: "Best L3 Performance minus OR" },
  { value: "latestTodaysRatingMinusOR", label: "Latest Today's Rating minus OR" },
  { value: "bestTodaysRatingL3MinusOR", label: "Best L3 Today's Rating minus OR" },
];

const LEGACY_SPEED_RELATIVE_METRICS: RelativeMetric[] = [
  "latestSpeedMinusOR",
  "bestL3SpeedMinusOR",
];

// TODO: Replace uncalibrated differences with a chronologically fitted,
// versioned OR-calibrated residual if that feature passes holdout validation.
export const CREATABLE_RELATIVE_METRIC_OPTIONS = RELATIVE_METRIC_OPTIONS.filter(
  (option) => !LEGACY_SPEED_RELATIVE_METRICS.includes(option.value),
);

export function isLegacySpeedRelativeMetric(value: string): value is RelativeMetric {
  return LEGACY_SPEED_RELATIVE_METRICS.includes(value as RelativeMetric);
}
