import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { TodayRace, TodayRunner } from "./todays-racing";
import { isCurrentAllWeatherRace } from "./current-race-classification";
import { classifyHandicapStatus } from "./research-rule";
import { AW_SPEED_RATING_CALCULATION_VERSION } from "./aw-speed-rating";
import { WEIGHT_PERFORMANCE_CALCULATION_VERSION } from "./weight-performance";

export const AW_TISSUE_VERSION = "AW_TISSUE_V1" as const;
export const AW_TISSUE_SCHEMA = "aw_tissue_stage1_features_v1" as const;
export const AW_TISSUE_IMPLEMENTED_AT = "2026-10-02T05:16:55.000Z";
export const AW_TISSUE_MODEL_PATH = "data/research/aw-tissue-model-v1.json";
export const AW_TISSUE_STAGE1_HASH = "073f19c1aadc53807d683fbeaa3d28c9f63e0fa5bffda7f73fe76a055389fc8c";
export const AW_TISSUE_ARTIFACT_HASH = "52376e5361e41da6b991aebfbb7f202cebb1f437b1259d55711824f55eead8a8";
export const AW_TISSUE_FEATURES = [
  "avg_l3_aw_speed", "trainer_prior_rate", "jockey_prior_rate", "declared_field_size",
  "class", "distance_furlongs", "handicap", "latest_aw_speed", "best_l3_aw_speed",
  "avg_l3_aw_performance", "latest_aw_performance", "official_rating", "prior_aw_starts",
  "age", "draw", "days_since_run",
] as const;
export const AW_TISSUE_VECTOR_NAMES = [...AW_TISSUE_FEATURES, ...AW_TISSUE_FEATURES.map((name) => `${name}_missing`)];
export type AwTissueModel = {
  version: typeof AW_TISSUE_VERSION;
  featureSchemaVersion: typeof AW_TISSUE_SCHEMA;
  implementedAt: string;
  stage1ArtifactHash: string;
  checksum: string;
  candidate: "AW-T0";
  trainingPeriod: { from: string; to: string; races: number };
  dependencies: { awSpeed: string; performance: string; settlement: string };
  model: { names: string[]; means: number[]; scales: number[]; weights: number[] };
};
export type AwTissuePrediction = {
  runnerId: string;
  probability: number | null;
  rank: number | null;
  predictionAvailable: boolean;
  unavailableReason: string | null;
  zeroHistoryRunner: boolean | null;
  priorAwStarts: number | null;
  rawInputs: Array<number | null>;
  modelInputs: number[] | null;
  modelVersion: typeof AW_TISSUE_VERSION;
  featureSchemaVersion: typeof AW_TISSUE_SCHEMA;
};
export type AwTissueBook = {
  runners: AwTissuePrediction[];
  activeRunnerCount: number;
  predictedRunnerCount: number;
  predictionCoverage: number;
};

export async function loadAwTissueModel(path = AW_TISSUE_MODEL_PATH): Promise<AwTissueModel> {
  const artifact = JSON.parse(await readFile(path, "utf8")) as AwTissueModel;
  const { checksum, ...contents } = artifact;
  if (checksum !== AW_TISSUE_ARTIFACT_HASH || createHash("sha256").update(JSON.stringify(contents)).digest("hex") !== checksum ||
      artifact.version !== AW_TISSUE_VERSION || artifact.featureSchemaVersion !== AW_TISSUE_SCHEMA ||
      artifact.implementedAt !== AW_TISSUE_IMPLEMENTED_AT || artifact.stage1ArtifactHash !== AW_TISSUE_STAGE1_HASH ||
      artifact.candidate !== "AW-T0" || artifact.trainingPeriod.from !== "2025-01-01" || artifact.trainingPeriod.to !== "2025-12-31" ||
      artifact.dependencies.awSpeed !== AW_SPEED_RATING_CALCULATION_VERSION || artifact.dependencies.performance !== WEIGHT_PERFORMANCE_CALCULATION_VERSION ||
      artifact.dependencies.settlement !== "canonical_settlement_v2" ||
      JSON.stringify(artifact.model.names) !== JSON.stringify(AW_TISSUE_VECTOR_NAMES)) {
    throw new Error("Invalid frozen AW Tissue artifact");
  }
  for (const [key, values] of Object.entries(artifact.model)) {
    if (key === "names") continue;
    if (values.length !== AW_TISSUE_VECTOR_NAMES.length || values.some((v) => typeof v !== "number" || !Number.isFinite(v) || (key === "scales" && v <= 0))) throw new Error("Invalid AW Tissue parameters");
  }
  return artifact;
}

export function awTissueRawInputs(race: TodayRace, runner: TodayRunner, priorAwStarts: number | null): Array<number | null> {
  const m = runner.metrics;
  const raceClass = race.raceClass?.match(/\d+/);
  const handicap = classifyHandicapStatus(race);
  const values = [
    m?.averageAwSpeedLast3, runner.trainerMetrics?.trainerPriorWinRate, runner.jockeyMetrics?.jockeyPriorWinRate,
    race.declaredRunnerCount, raceClass ? Number(raceClass[0]) : null,
    race.distanceYards === null ? null : race.distanceYards / 220,
    handicap === "unknown" ? null : handicap === "handicap" ? 1 : 0,
    m?.latestAwSpeedRating, m?.bestAwSpeedLast3, m?.averageAwPerformanceLast3,
    m?.latestAwPerformanceRating, runner.officialRating, priorAwStarts, runner.horseAge, runner.draw, m?.daysSinceLastRun,
  ];
  return values.map((v) => typeof v === "number" && Number.isFinite(v) ? v : null);
}

export function awTissueModelInputs(raw: Array<number | null>, model: AwTissueModel): number[] {
  if (raw.length !== AW_TISSUE_FEATURES.length) throw new Error("AW Tissue input schema mismatch");
  return [...raw.map((v, i) => v ?? model.model.means[i]!), ...raw.map((v) => v === null ? 1 : 0)];
}

export function awTissueProbabilities(inputs: number[][], model: AwTissueModel): number[] {
  const scores = inputs.map((values) => values.reduce((sum, value, i) => sum + model.model.weights[i]! * ((value - model.model.means[i]!) / model.model.scales[i]!), 0));
  const maximum = Math.max(...scores);
  const weights = scores.map((value) => Math.exp(value - maximum));
  const total = weights.reduce((a, b) => a + b, 0);
  const probabilities = weights.map((value) => value / total);
  if (probabilities.some((p) => !Number.isFinite(p) || p <= 0) || Math.abs(probabilities.reduce((a, b) => a + b, 0) - 1) > 1e-12) throw new Error("Invalid AW Tissue probability book");
  return probabilities;
}

export function predictAwTissue(race: TodayRace, priorStartsByRunner: ReadonlyMap<string, number>, model: AwTissueModel): AwTissueBook {
  const active = race.runners.filter((r) => r.resultStatus !== "non_runner");
  const runners: AwTissuePrediction[] = active.map((runner) => {
    const count = priorStartsByRunner.get(runner.runnerId);
    const priorAwStarts = count !== undefined && Number.isInteger(count) && count >= 0 ? count : null;
    const unavailableReason = !isCurrentAllWeatherRace(race) ? "unsupported_race" :
      priorAwStarts === null ? "prior_aw_starts_unavailable" : runner.metrics === null ? "canonical_history_unavailable" : null;
    const rawInputs = awTissueRawInputs(race, runner, priorAwStarts);
    return {
      runnerId: runner.runnerId, probability: null, rank: null, predictionAvailable: false,
      unavailableReason, zeroHistoryRunner: priorAwStarts === null ? null : priorAwStarts === 0,
      priorAwStarts, rawInputs, modelInputs: unavailableReason ? null : awTissueModelInputs(rawInputs, model),
      modelVersion: AW_TISSUE_VERSION, featureSchemaVersion: AW_TISSUE_SCHEMA,
    };
  });
  // Conditional logit requires the entire active field; partial books are not invented.
  if (active.length < 2 || runners.some((r) => r.modelInputs === null)) {
    for (const runner of runners) runner.unavailableReason ??= active.length < 2 ? "fewer_than_two_active_runners" : "incomplete_field_inputs";
    return { runners, activeRunnerCount: active.length, predictedRunnerCount: 0, predictionCoverage: 0 };
  }
  const probabilities = awTissueProbabilities(runners.map((r) => r.modelInputs!), model);
  const ranks = [...runners.keys()].sort((a, b) => probabilities[b]! - probabilities[a]! || runners[a]!.runnerId.localeCompare(runners[b]!.runnerId));
  ranks.forEach((index, order) => {
    runners[index]!.probability = probabilities[index]!;
    runners[index]!.rank = order + 1;
    runners[index]!.predictionAvailable = true;
  });
  return { runners, activeRunnerCount: active.length, predictedRunnerCount: runners.length, predictionCoverage: 1 };
}
