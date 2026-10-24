import { descendingRanks } from "./descending-ranks";
import type { TissueValueFamily } from "./tissue-value-metrics";

export const TISSUE_SPEED_RANK_WATCH_TOOLTIP = "Research watch: Tissue top-2 runner with Best L3 Speed rank 2–3. Early prospective results for this subgroup are weaker; no exclusion rule is applied.";

export function isTissueTop2SpeedRankWatch({ tissueRank, bestL3SpeedRank }: {
  tissueRank?: number | null;
  bestL3SpeedRank?: number | null;
}): boolean {
  return (tissueRank === 1 || tissueRank === 2) && (bestL3SpeedRank === 2 || bestL3SpeedRank === 3);
}

/** Read the existing frozen Best L3 feature, using the established research rank routine.
 * AW v2 retains the inherited feature name but its slot contains AW Speed.
 * Use the entire captured field, including subsequent NRs; never rerank current starters.
 * Missing vectors/flags are unknown, not an imputed zero Speed figure.
 */
export function frozenBestL3SpeedRanks(family: TissueValueFamily, featureNames: readonly string[] | undefined,
  runners: readonly { runnerId: string; modelInputs?: readonly number[] | null }[]) {
  const name = family === "HURDLE" || family === "CHASE" ? "best_l3_jump_speed" : "best_l3_turf_speed";
  const valueIndex = featureNames?.indexOf(name) ?? -1;
  const missingIndex = featureNames?.indexOf(`${name}_missing`) ?? -1;
  if (valueIndex < 0 || missingIndex < 0 || runners.some(({ modelInputs: values }) => !values || values.length !== featureNames?.length ||
    (values[missingIndex] !== 0 && values[missingIndex] !== 1) || (values[missingIndex] === 0 && !Number.isFinite(values[valueIndex])))) return new Map<string, number>();
  return descendingRanks(runners, (runner) => {
    const values = runner.modelInputs;
    if (valueIndex < 0 || missingIndex < 0 || !values || values.length !== featureNames?.length || values[missingIndex] !== 0) return null;
    return values[valueIndex];
  });
}
