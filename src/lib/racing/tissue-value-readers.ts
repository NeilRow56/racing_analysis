import { cache } from "react";
import { VALUE_COHORTS, type ValueCohortConfig } from "./tissue-value-config";
import { loadValueForward, type TissueValueData } from "./tissue-value-forward";
export type ValueCohortSnapshot = { config: ValueCohortConfig; data: TissueValueData };
/** Four parallel reads, memoized per server render, never per race or runner. */
export const loadAllTissueValue = cache(async (): Promise<ValueCohortSnapshot[]> => Promise.all(
  VALUE_COHORTS.map(async config => ({ config, data: await loadValueForward(config) })),
));
