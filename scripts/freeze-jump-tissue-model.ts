import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createDbConnection } from "@/db";
import { loadBacktestFeatureCache } from "@/lib/racing/backtest-cache";
import { classifyJumpRaceSubtype, JUMP_SPEED_RATING_CALCULATION_VERSION } from "@/lib/racing/jump-speed-rating";
import {
  JUMP_TISSUE_FEATURE_NAMES,
  JUMP_TISSUE_IMPLEMENTED_AT,
  JUMP_TISSUE_MODEL_PATH,
  JUMP_TISSUE_SCHEMA,
  JUMP_TISSUE_STAGE1_PREDICTIONS_PATH,
  JUMP_TISSUE_TRAINING_FROM,
  JUMP_TISSUE_TRAINING_TO,
  JUMP_TISSUE_VERSION,
} from "@/lib/racing/jump-tissue-model";
import type { HistoricalPreRaceFeatureRow, HistoricalTargetRunnerMetricsRow } from "@/lib/racing/historical-target-metrics";
import {
  commentVector,
  loadHistoricalComments,
  priorCommentsForTarget,
  raceSoftmax,
  type HistoricalComment,
} from "./diagnose-independent-tissue-feasibility";

type Example = { row: HistoricalTargetRunnerMetricsRow; raceId: string; won: boolean; values: number[] };

const cache = await loadBacktestFeatureCache({ from: JUMP_TISSUE_TRAINING_FROM, to: JUMP_TISSUE_TRAINING_TO, family: "jump" });
if (!cache) throw new Error("Missing 2025 Jump backtest cache");

const connection = createDbConnection();
try {
  const comments = await loadHistoricalComments(connection.client);
  const examples = buildExamples(cache.rows, comments);
  const model = fitJumpTissueModel(examples);
  const stage1DiagnosticPredictionsHash = await fileHash(JUMP_TISSUE_STAGE1_PREDICTIONS_PATH);
  const raceCount = new Set(examples.map((example) => example.raceId)).size;
  const contents = {
    version: JUMP_TISSUE_VERSION,
    featureSchemaVersion: JUMP_TISSUE_SCHEMA,
    implementedAt: JUMP_TISSUE_IMPLEMENTED_AT,
    candidate: "J-T1" as const,
    trainingPeriod: { from: JUMP_TISSUE_TRAINING_FROM, to: JUMP_TISSUE_TRAINING_TO, races: raceCount, runners: examples.length },
    dependencies: { jumpSpeed: JUMP_SPEED_RATING_CALCULATION_VERSION, settlement: "canonical_settlement_v2" as const },
    stage1DiagnosticPredictionsPath: JUMP_TISSUE_STAGE1_PREDICTIONS_PATH,
    stage1DiagnosticPredictionsHash,
    model,
  };
  const checksum = createHash("sha256").update(JSON.stringify(contents)).digest("hex");
  await writeFile(JUMP_TISSUE_MODEL_PATH, `${JSON.stringify({ ...contents, checksum }, null, 2)}\n`, "utf8");
  console.log(`Wrote ${JUMP_TISSUE_MODEL_PATH} races=${raceCount} runners=${examples.length} checksum=${checksum}`);
} finally {
  await connection.client.end();
}

function buildExamples(rows: HistoricalTargetRunnerMetricsRow[], commentsByHorse: Map<string, HistoricalComment[]>): Example[] {
  const active = rows.filter((row) => row.features.raceCode === "jump" && subtypeSupported(row.features) && row.outcome.resultStatus !== "non_runner");
  const grouped = groupBy(active, (row) => row.features.targetRaceId);
  const settled = new Set([...grouped].filter(([, raceRows]) =>
    raceRows.filter((row) => row.outcome.won === true).length === 1 &&
    raceRows.every((row) => row.outcome.won !== null)
  ).map(([raceId]) => raceId));
  return active.filter((row) => settled.has(row.features.targetRaceId)).map((row) => {
    const priors = priorCommentsForTarget(commentsByHorse.get(row.features.horseId) ?? [], row.features.raceDateTime);
    return { row, raceId: row.features.targetRaceId, won: row.outcome.won === true, values: [...numericVector(row.features), ...commentVector(priors)] };
  });
}

function numericVector(features: HistoricalPreRaceFeatureRow): number[] {
  const values = [
    features.officialRating,
    features.latestJumpSpeedRating,
    features.bestJumpSpeedLast3,
    features.averageJumpSpeedLast3,
    features.trainerPriorWinRate,
    Math.log1p(features.trainerPriorRuns),
    features.jockeyPriorWinRate ?? null,
    Math.log1p(features.jockeyPriorRuns ?? 0),
    features.daysSinceLastRun,
    Math.log1p(features.priorRuns),
    features.horseAge,
    features.weightCarriedLbs,
    numericClass(features.raceClass),
    features.distanceYards === null ? null : features.distanceYards / 220,
    features.actualRunnerCount ?? features.declaredRunnerCount,
    /handicap/i.test(`${features.raceName ?? ""} ${features.raceType ?? ""}`) ? 1 : 0,
    /soft|heavy/i.test(features.going ?? "") ? 1 : 0,
    /firm/i.test(features.going ?? "") ? 1 : 0,
  ];
  return [
    ...values.map((value) => typeof value === "number" && Number.isFinite(value) ? value : 0),
    ...values.map((value) => typeof value === "number" && Number.isFinite(value) ? 0 : 1),
  ];
}

function subtypeSupported(features: HistoricalPreRaceFeatureRow) {
  return classifyJumpRaceSubtype(features) !== "unknown_other";
}

async function fileHash(path: string): Promise<string | null> {
  try {
    return createHash("sha256").update(await readFile(path)).digest("hex");
  } catch {
    return null;
  }
}

function numericClass(value: string | null) {
  const match = value?.match(/\d+/);
  return match ? Number(match[0]) : null;
}

function groupBy<T, K>(values: T[], keyFor: (value: T) => K) {
  const groups = new Map<K, T[]>();
  for (const value of values) groups.set(keyFor(value), [...(groups.get(keyFor(value)) ?? []), value]);
  return groups;
}

function fitJumpTissueModel(examples: Example[]) {
  const means = JUMP_TISSUE_FEATURE_NAMES.map((_, index) => average(examples.map((example) => example.values[index]!)));
  const scales = JUMP_TISSUE_FEATURE_NAMES.map((_, index) => Math.max(standardDeviation(examples.map((example) => example.values[index]!), means[index]!), 1e-6));
  const matrix = examples.map((example) => example.values.map((value, index) => (value - means[index]!) / scales[index]!));
  const races = [...groupBy(examples.map((example, index) => ({ example, index })), (entry) => entry.example.raceId).values()].map((entries) => entries.map((entry) => entry.index));
  const weights = Array(JUMP_TISSUE_FEATURE_NAMES.length).fill(0) as number[];
  for (let epoch = 0; epoch < 90; epoch += 1) {
    const gradient = Array(weights.length).fill(0) as number[];
    for (const indexes of races) {
      const probabilities = raceSoftmax(indexes.map((index) => dot(weights, matrix[index]!)));
      for (let position = 0; position < indexes.length; position += 1) {
        const index = indexes[position]!;
        const residual = (examples[index]!.won ? 1 : 0) - probabilities[position]!;
        for (let feature = 0; feature < weights.length; feature += 1) gradient[feature]! += residual * matrix[index]![feature]!;
      }
    }
    const rate = 0.12 / Math.sqrt(1 + epoch / 10);
    for (let feature = 0; feature < weights.length; feature += 1) weights[feature]! += rate * (gradient[feature]! / races.length - 0.02 * weights[feature]!);
  }
  return { names: [...JUMP_TISSUE_FEATURE_NAMES], means, scales, weights };
}

function dot(left: number[], right: number[]) {
  return left.reduce((sum, value, index) => sum + value * right[index]!, 0);
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[], mean: number) {
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
}
