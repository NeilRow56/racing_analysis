import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { raceSoftmax } from "../../../scripts/diagnose-independent-tissue-feasibility";
import { HURDLE_V3_ALL_FEATURES, HURDLE_V3_SCHEMA, type HurdleV3Feature, type HurdleV3Raw } from "./hurdle-v3-challenger-features";

export const HURDLE_V3_CHALLENGER_VERSION = "HURDLE_TISSUE_V3_CHALLENGER" as const;
export const HURDLE_V3_CHALLENGER_PATH = "data/research/hurdle-tissue-v3-challenger.json";
export type HurdleV3ChallengerModel = {
  version: typeof HURDLE_V3_CHALLENGER_VERSION; family: "HURDLE"; status: "challenger_not_promoted";
  featureSchema: typeof HURDLE_V3_SCHEMA; createdAt: string;
  trainingPeriod: { from: "2025-01-01"; to: "2025-12-31"; races: number; runners: number };
  trainingDataHash: string; fitRaceIds: string[]; selectionProtocol: Record<string, unknown>;
  calibration: "race_softmax_temperature_1"; intercept: 0;
  imputation: "observed_training_mean_no_positive_missingness_increment";
  prospectiveStatus: "not_started_no_backfill";
  model: { names: HurdleV3Feature[]; means: number[]; scales: number[]; weights: number[];
    l2: number; penaltyMultipliers: number[]; nonPositiveFeatures: string[]; iterations: number; converged: true };
  checksum: string;
};
export const hurdleV3Checksum = (content: Omit<HurdleV3ChallengerModel, "checksum">) => createHash("sha256").update(JSON.stringify(content)).digest("hex");
export function validateHurdleV3Model(artifact: HurdleV3ChallengerModel) {
  const { checksum, ...content } = artifact, model = artifact.model;
  if (artifact.version !== HURDLE_V3_CHALLENGER_VERSION || artifact.family !== "HURDLE" || artifact.status !== "challenger_not_promoted" ||
      artifact.featureSchema !== HURDLE_V3_SCHEMA || artifact.trainingPeriod.from !== "2025-01-01" || artifact.trainingPeriod.to !== "2025-12-31" ||
      artifact.calibration !== "race_softmax_temperature_1" || artifact.intercept !== 0 || artifact.prospectiveStatus !== "not_started_no_backfill" ||
      artifact.imputation !== "observed_training_mean_no_positive_missingness_increment" || !model.converged ||
      checksum !== hurdleV3Checksum(content) || new Set(model.names).size !== model.names.length ||
      model.names.some(n => !(HURDLE_V3_ALL_FEATURES as readonly string[]).includes(n)) ||
      artifact.fitRaceIds.length !== artifact.trainingPeriod.races || new Set(artifact.fitRaceIds).size !== artifact.fitRaceIds.length) throw new Error("Invalid isolated Hurdle V3 challenger artifact");
  for (const key of ["means", "scales", "weights", "penaltyMultipliers"] as const) {
    if (model[key].length !== model.names.length || model[key].some(v => !Number.isFinite(v) || (key === "scales" || key === "penaltyMultipliers") && v <= 0)) throw new Error("Invalid Hurdle V3 parameters");
  }
  const bounded = model.names.filter(n => n.endsWith("_missing") || n.includes("_missing_with_history"));
  if (JSON.stringify(bounded) !== JSON.stringify(model.nonPositiveFeatures) || bounded.some(n => model.weights[model.names.indexOf(n)] > 1e-12)) throw new Error("Positive Hurdle V3 missing-data increment is forbidden");
  return artifact;
}
export async function loadHurdleV3Challenger(path = HURDLE_V3_CHALLENGER_PATH) {
  return validateHurdleV3Model(JSON.parse(await readFile(path, "utf8")) as HurdleV3ChallengerModel);
}
/** This module has no production registration, writer, settlement or capture hook. */
export function scoreHurdleV3Field(artifact: HurdleV3ChallengerModel, runners: readonly { runnerId: string; raw: HurdleV3Raw }[]) {
  validateHurdleV3Model(artifact);
  if (runners.length < 2 || new Set(runners.map(r => r.runnerId)).size !== runners.length) throw new Error("Invalid Hurdle V3 field");
  const m = artifact.model;
  const rows = runners.map(r => {
    const contributions = m.names.map((name, i) => {
      const value = r.raw[name];
      if (value !== null && !Number.isFinite(value)) throw new Error("Nonfinite Hurdle V3 input");
      if (m.nonPositiveFeatures.includes(name) && value !== 0 && value !== 1) throw new Error("Invalid Hurdle V3 missing flag");
      const encoded = value === null ? m.means[i] : value;
      return { name, raw: value, imputed: value === null, encoded, contribution: m.weights[i]*(encoded-m.means[i])/m.scales[i] };
    });
    const logit = contributions.reduce((a,c) => a+c.contribution,0);
    const netMissingPackage = m.names.reduce((total,name,i) => total + (m.nonPositiveFeatures.includes(name) ? (r.raw[name] ?? 0)*m.weights[i]/m.scales[i] : 0),0);
    return { runnerId:r.runnerId,logit,contributions,netMissingPackage };
  });
  const probabilities=raceSoftmax(rows.map(r=>r.logit)),order=[...rows.keys()].sort((a,b)=>probabilities[b]-probabilities[a]||rows[a].runnerId.localeCompare(rows[b].runnerId));
  return rows.map((r,i)=>({...r,probability:probabilities[i],rank:order.indexOf(i)+1}));
}
