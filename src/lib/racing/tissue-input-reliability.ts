import type { TissueValueFamily } from "./tissue-value-metrics";

export type TissueInputReliability = {
  level: "GOOD" | "CAUTION" | "UNKNOWN";
  reasons: string[];
};
export const TISSUE_INPUT_RELIABILITY_TOOLTIP = "Research watch: this Tissue estimate uses materially sparse or incomplete pre-race inputs. No exclusion rule is applied.";
export const TISSUE_INPUT_RELIABILITY_DECLARED = "2026-10-27";

/** Diagnostic definition from /tmp/tissue-overlay-driver-family-diagnostic.md:
 * any frozen numeric missing flag OR zero frozen prior starts. No rate-sample
 * cutoff, outcome, Speed-watch status or figure-age inference is involved.
 * Missing/incompatible frozen vectors are UNKNOWN, never assumed complete.
 */
export function getTissueInputReliability({ family, featureNames, modelInputs }: {
  family: TissueValueFamily;
  featureNames?: readonly string[];
  modelInputs?: readonly number[] | null;
}): TissueInputReliability {
  const unknown = (): TissueInputReliability => ({ level: "UNKNOWN", reasons: ["Frozen input completeness is unavailable."] });
  const jump = family === "HURDLE" || family === "CHASE";
  // Current fitted schemas: numeric values, their paired flags, 43 comment terms.
  const numericCount = jump ? 18 : 26;
  if (!featureNames || !modelInputs || featureNames.length !== numericCount * 2 + 43 ||
    modelInputs.length !== featureNames.length || new Set(featureNames).size !== featureNames.length ||
    modelInputs.some(value => !Number.isFinite(value))) return unknown();
  const missing: string[] = [];
  for (let i = 0; i < numericCount; i++) {
    const name = featureNames[i], flag = modelInputs[numericCount + i];
    if (featureNames[numericCount + i] !== `${name}_missing` || (flag !== 0 && flag !== 1) ||
      (flag === 1 && modelInputs[i] !== 0)) return unknown();
    if (flag === 1) missing.push(name);
  }
  const historyName = jump ? "log_prior_jump_starts" : "log_prior_runs";
  const historyIndex = featureNames.indexOf(historyName);
  const speedIndex = featureNames.indexOf(jump ? "best_l3_jump_speed" : "best_l3_turf_speed");
  if (historyIndex < 0 || historyIndex >= numericCount || speedIndex < 0 || speedIndex >= numericCount) return unknown();
  const contextNames = family === "AW" ? ["log_surface_runs_365d", "surface_recent_performance_delta"] : ["going_soft", "going_firm"];
  if (contextNames.some(name => featureNames.indexOf(name) < 0 || featureNames.indexOf(name) >= numericCount)) return unknown();
  const historyMissing = missing.includes(historyName);
  const count = Math.expm1(modelInputs[historyIndex]);
  if (!historyMissing && (!Number.isFinite(count) || count < 0 || Math.abs(count - Math.round(count)) > 1e-6)) return unknown();
  const reasons: string[] = [];
  if (missing.some(name => /^(latest|best_l3|avg_l3)_/.test(name))) {
    reasons.push(`Missing ${family === "TURF" ? "Turf" : family === "AW" ? "AW" : "Jump"} performance inputs.`);
  }
  if (family === "AW" && missing.some(name => name === "log_surface_runs_365d" || name === "surface_recent_performance_delta")) {
    reasons.push("Incomplete AW surface-history inputs.");
  }
  if (missing.some(name => /trainer|jockey/.test(name))) reasons.push("Missing connection inputs.");
  if (!historyMissing && Math.round(count) === 0) reasons.push("No recorded prior starts in the frozen history count.");
  if (missing.length > 0 && reasons.length === 0) reasons.push("Missing pre-race model inputs.");
  return { level: missing.length > 0 || (!historyMissing && Math.round(count) === 0) ? "CAUTION" : "GOOD", reasons };
}
