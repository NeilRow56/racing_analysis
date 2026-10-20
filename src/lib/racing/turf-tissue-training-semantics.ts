import type { HistoricalPreRaceFeatureRow } from "./historical-target-metrics";

/** Declarations are available on a racecard; result-list counts are not.
 * Applied to a copy so the original training cache remains immutable.
 */
export function declarationOnlyTurfFeatures(features: HistoricalPreRaceFeatureRow): HistoricalPreRaceFeatureRow {
  return { ...features, actualRunnerCount: null };
}
