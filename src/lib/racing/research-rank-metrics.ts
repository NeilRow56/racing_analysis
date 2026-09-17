export type RankMetric =
  | "officialRating"
  | "latestSpeedRating"
  | "latestPerformanceRating"
  | "latestTodaysRating"
  | "bestSpeedLast3"
  | "bestPerformanceLast3"
  | "bestTodaysRatingLast3"
  | "turfPerformanceRating";

export const RANK_METRIC_OPTIONS: Array<{ value: RankMetric; label: string }> = [
  { value: "officialRating", label: "OR rank" },
  { value: "latestSpeedRating", label: "Latest Speed rank" },
  { value: "latestPerformanceRating", label: "Latest Performance rank" },
  { value: "latestTodaysRating", label: "Latest Today's Rating rank" },
  { value: "bestSpeedLast3", label: "Best L3 Speed rank" },
  { value: "bestPerformanceLast3", label: "Best L3 Performance rank" },
  { value: "bestTodaysRatingLast3", label: "Best L3 Today's Rating rank" },
];
