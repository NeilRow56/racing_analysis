import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { classifyHandicapStatus } from "./research-rule";
import { classifyJumpRaceSubtype, isJumpRace, JUMP_SPEED_RATING_CALCULATION_VERSION, type JumpRaceSubtype } from "./jump-speed-rating";
import type { TodayRace, TodayRunner } from "./todays-racing";
import type { HistoricalComment, Model } from "../../../scripts/diagnose-independent-tissue-feasibility";
import { COMMENT_FEATURE_NAMES, COMMENT_NAMES, commentVector, priorCommentsForTarget, raceSoftmax, score } from "../../../scripts/diagnose-independent-tissue-feasibility";

export const JUMP_TISSUE_VERSION = "JUMP_TISSUE_V1" as const;
export const JUMP_TISSUE_SCHEMA = "jump_tissue_stage1_numeric_prior_comments_v1" as const;
export const JUMP_TISSUE_IMPLEMENTED_AT = "2026-10-02T13:45:00.000Z" as const;
export const JUMP_TISSUE_MODEL_PATH = "data/research/jump-tissue-model-v1.json" as const;
export const JUMP_TISSUE_STAGE1_PREDICTIONS_PATH = "/tmp/jump-tissue-stage1-predictions.json" as const;
export const JUMP_TISSUE_TRAINING_FROM = "2025-01-01" as const;
export const JUMP_TISSUE_TRAINING_TO = "2025-12-31" as const;

export const JUMP_TISSUE_NUMERIC_FEATURES = [
  "official_rating",
  "latest_jump_speed",
  "best_l3_jump_speed",
  "avg_l3_jump_speed",
  "trainer_prior_rate",
  "log_trainer_prior_runs",
  "jockey_prior_rate",
  "log_jockey_prior_runs",
  "days_since_run",
  "log_prior_jump_starts",
  "age",
  "weight_lbs",
  "class",
  "distance_furlongs",
  "field_size",
  "handicap",
  "going_soft",
  "going_firm",
] as const;
export const JUMP_TISSUE_FEATURE_NAMES = [
  ...JUMP_TISSUE_NUMERIC_FEATURES,
  ...JUMP_TISSUE_NUMERIC_FEATURES.map((name) => `${name}_missing`),
  ...COMMENT_FEATURE_NAMES,
] as const;

export type JumpTissueModel = {
  version: typeof JUMP_TISSUE_VERSION;
  featureSchemaVersion: typeof JUMP_TISSUE_SCHEMA;
  implementedAt: typeof JUMP_TISSUE_IMPLEMENTED_AT;
  candidate: "J-T1";
  trainingPeriod: { from: typeof JUMP_TISSUE_TRAINING_FROM; to: typeof JUMP_TISSUE_TRAINING_TO; races: number; runners: number };
  dependencies: { jumpSpeed: typeof JUMP_SPEED_RATING_CALCULATION_VERSION; settlement: "canonical_settlement_v2" };
  stage1DiagnosticPredictionsPath: typeof JUMP_TISSUE_STAGE1_PREDICTIONS_PATH;
  stage1DiagnosticPredictionsHash: string | null;
  checksum: string;
  model: Model;
};

export type JumpTissueHistoryBucket = "zero" | "one" | "two" | "three_plus" | "unknown";

export type JumpTissueCommentProvenance = {
  representationVersion: typeof JUMP_TISSUE_SCHEMA;
  sourceObservationCutoff: string | null;
  priorCommentCount: number;
  activeCommentFeatures: string[];
  chronologySafe: boolean;
  targetRacePostResultCommentExcluded: boolean;
};

export type JumpTissuePrediction = {
  runnerId: string;
  probability: number | null;
  rank: number | null;
  predictionAvailable: boolean;
  unavailableReason: string | null;
  rawInputs: number[];
  modelInputs: number[] | null;
  modelVersion: typeof JUMP_TISSUE_VERSION;
  featureSchemaVersion: typeof JUMP_TISSUE_SCHEMA;
  priorJumpStarts: number | null;
  historyBucket: JumpTissueHistoryBucket;
  zeroPriorJumpStarts: boolean | null;
  onePriorJumpStart: boolean | null;
  twoPriorJumpStarts: boolean | null;
  threePlusPriorJumpStarts: boolean | null;
  commentProvenance: JumpTissueCommentProvenance;
};

export type JumpTissueBook = {
  runners: JumpTissuePrediction[];
  activeRunnerCount: number;
  predictedRunnerCount: number;
  predictionCoverage: number;
};

export async function loadJumpTissueModel(path = JUMP_TISSUE_MODEL_PATH): Promise<JumpTissueModel> {
  const artifact = JSON.parse(await readFile(path, "utf8")) as JumpTissueModel;
  const { checksum, ...contents } = artifact;
  const actual = createHash("sha256").update(JSON.stringify(contents)).digest("hex");
  if (
    checksum !== actual ||
    artifact.version !== JUMP_TISSUE_VERSION ||
    artifact.featureSchemaVersion !== JUMP_TISSUE_SCHEMA ||
    artifact.implementedAt !== JUMP_TISSUE_IMPLEMENTED_AT ||
    artifact.candidate !== "J-T1" ||
    artifact.trainingPeriod.from !== JUMP_TISSUE_TRAINING_FROM ||
    artifact.trainingPeriod.to !== JUMP_TISSUE_TRAINING_TO ||
    artifact.dependencies.jumpSpeed !== JUMP_SPEED_RATING_CALCULATION_VERSION ||
    artifact.dependencies.settlement !== "canonical_settlement_v2" ||
    JSON.stringify(artifact.model.names) !== JSON.stringify(JUMP_TISSUE_FEATURE_NAMES)
  ) {
    throw new Error("Invalid frozen Jump Tissue artifact");
  }
  for (const [key, values] of Object.entries(artifact.model)) {
    if (key === "names") continue;
    const numericValues = values as number[];
    if (numericValues.length !== JUMP_TISSUE_FEATURE_NAMES.length || numericValues.some((value) => !Number.isFinite(value) || (key === "scales" && value <= 0))) {
      throw new Error("Invalid Jump Tissue parameters");
    }
  }
  return artifact;
}

export function predictJumpTissue(
  race: TodayRace,
  commentsByHorse: ReadonlyMap<string, HistoricalComment[]>,
  model: JumpTissueModel,
): JumpTissueBook {
  const active = race.runners.filter((runner) => runner.resultStatus !== "non_runner");
  const runners: JumpTissuePrediction[] = active.map((runner) => {
    const priorComments = race.raceDateTime ? priorCommentsForTarget(commentsByHorse.get(runner.horseId) ?? [], race.raceDateTime) : [];
    const commentFeatures = commentVector(priorComments);
    const priorJumpStarts = validCount(runner.metrics?.priorRuns ?? null);
    const unavailableReason = !isJumpRace(race) ? "unsupported_race" :
      !race.raceDateTime ? "missing_race_datetime" :
      runner.metrics === null ? "canonical_history_unavailable" :
      priorJumpStarts === null ? "prior_jump_starts_unavailable" :
      null;
    const rawInputs = [...jumpTissueNumericVector(race, runner), ...commentFeatures];
    return {
      runnerId: runner.runnerId,
      probability: null,
      rank: null,
      predictionAvailable: false,
      unavailableReason,
      rawInputs,
      modelInputs: unavailableReason ? null : rawInputs,
      modelVersion: JUMP_TISSUE_VERSION,
      featureSchemaVersion: JUMP_TISSUE_SCHEMA,
      priorJumpStarts,
      historyBucket: historyBucket(priorJumpStarts),
      zeroPriorJumpStarts: priorJumpStarts === null ? null : priorJumpStarts === 0,
      onePriorJumpStart: priorJumpStarts === null ? null : priorJumpStarts === 1,
      twoPriorJumpStarts: priorJumpStarts === null ? null : priorJumpStarts === 2,
      threePlusPriorJumpStarts: priorJumpStarts === null ? null : priorJumpStarts >= 3,
      commentProvenance: {
        representationVersion: JUMP_TISSUE_SCHEMA,
        sourceObservationCutoff: race.raceDateTime?.toISOString() ?? null,
        priorCommentCount: priorComments.length,
        activeCommentFeatures: activeCommentFeatures(commentFeatures),
        chronologySafe: priorComments.every((comment) => race.raceDateTime !== null && comment.raceDateTime < race.raceDateTime),
        targetRacePostResultCommentExcluded: true,
      },
    } satisfies JumpTissuePrediction;
  });
  if (active.length < 2 || runners.some((runner) => runner.modelInputs === null)) {
    for (const runner of runners) runner.unavailableReason ??= active.length < 2 ? "fewer_than_two_active_runners" : "incomplete_field_inputs";
    return { runners, activeRunnerCount: active.length, predictedRunnerCount: 0, predictionCoverage: 0 };
  }
  const probabilities = raceSoftmax(runners.map((runner) => score(model.model, runner.modelInputs!)));
  const order = [...runners.keys()].sort((left, right) => probabilities[right]! - probabilities[left]! || runners[left]!.runnerId.localeCompare(runners[right]!.runnerId));
  order.forEach((index, position) => {
    runners[index]!.probability = probabilities[index]!;
    runners[index]!.rank = position + 1;
    runners[index]!.predictionAvailable = true;
  });
  return { runners, activeRunnerCount: active.length, predictedRunnerCount: runners.length, predictionCoverage: runners.length / active.length };
}

export function jumpTissueSubtype(race: TodayRace): { subtype: "Hurdle" | "Chase" | "NH Flat" | "Other Jump"; nhFlat: boolean; code: JumpRaceSubtype } {
  const code = classifyJumpRaceSubtype(race);
  if (code === "hurdle") return { subtype: "Hurdle", nhFlat: false, code };
  if (code === "chase") return { subtype: "Chase", nhFlat: false, code };
  if (code === "nh_flat") return { subtype: "NH Flat", nhFlat: true, code };
  return { subtype: "Other Jump", nhFlat: false, code };
}

export function jumpTissueNumericVector(race: TodayRace, runner: TodayRunner): number[] {
  const metrics = runner.metrics;
  const values: Array<number | null> = [
    runner.officialRating,
    metrics?.latestJumpSpeedRating ?? null,
    metrics?.bestJumpSpeedLast3 ?? null,
    metrics?.averageJumpSpeedLast3 ?? null,
    runner.trainerMetrics?.trainerPriorWinRate ?? null,
    Math.log1p(runner.trainerMetrics?.trainerPriorRuns ?? 0),
    runner.jockeyMetrics?.jockeyPriorWinRate ?? null,
    Math.log1p(runner.jockeyMetrics?.jockeyPriorRuns ?? 0),
    metrics?.daysSinceLastRun ?? null,
    metrics?.priorRuns === undefined || metrics?.priorRuns === null ? null : Math.log1p(metrics.priorRuns),
    runner.horseAge,
    runner.weightCarriedLbs,
    numericClass(race.raceClass),
    race.distanceYards === null ? null : race.distanceYards / 220,
    race.actualRunnerCount ?? race.declaredRunnerCount,
    classifyHandicapStatus(race) === "unknown" ? null : classifyHandicapStatus(race) === "handicap" ? 1 : 0,
    /soft|heavy/i.test(race.going ?? "") ? 1 : 0,
    /firm/i.test(race.going ?? "") ? 1 : 0,
  ];
  return [
    ...values.map((value) => typeof value === "number" && Number.isFinite(value) ? value : 0),
    ...values.map((value) => typeof value === "number" && Number.isFinite(value) ? 0 : 1),
  ];
}

function validCount(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function historyBucket(value: number | null): JumpTissueHistoryBucket {
  if (value === null) return "unknown";
  if (value === 0) return "zero";
  if (value === 1) return "one";
  if (value === 2) return "two";
  return "three_plus";
}

function activeCommentFeatures(values: number[]) {
  return COMMENT_NAMES.filter((_, index) => values[1 + index] || values[1 + COMMENT_NAMES.length + index]);
}

function numericClass(value: string | null) {
  const match = value?.match(/\d+/);
  return match ? Number(match[0]) : null;
}
