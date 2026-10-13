export const HURDLE_TISSUE_V2_CALIBRATION = "HURDLE_TISSUE_V2_CALIBRATION" as const;

export type CalibrationMethodId = "CONTROL" | "PLATT_LOGISTIC" | "POWER_GAMMA" | "ISOTONIC";

export type RaceCalibrationInput = {
  raceId: string;
  runners: Array<{
    runnerId: string;
    probability: number;
    won: boolean;
  }>;
};

export type CalibrationModel =
  | { id: "CONTROL"; label: "A. CONTROL"; fittedOn: "none" }
  | { id: "PLATT_LOGISTIC"; label: "B. PLATT / LOGISTIC"; fittedOn: "2025 Hurdles"; intercept: number; slope: number }
  | { id: "POWER_GAMMA"; label: "D. MONOTONIC POWER"; fittedOn: "2025 Hurdles"; gamma: number }
  | { id: "ISOTONIC"; label: "C. ISOTONIC"; fittedOn: "2025 Hurdles"; points: Array<{ x: number; y: number }> };

export function fitHurdleCalibrationModels(races: RaceCalibrationInput[]): CalibrationModel[] {
  return [
    { id: "CONTROL", label: "A. CONTROL", fittedOn: "none" },
    fitPlattLogistic(races),
    fitPowerGamma(races),
    fitIsotonic(races),
  ];
}

export function applyCalibrationModel(model: CalibrationModel, probabilities: number[]): number[] {
  if (!probabilities.length) return [];
  const mapped = probabilities.map((probability) => {
    if (model.id === "CONTROL") return probability;
    if (model.id === "PLATT_LOGISTIC") return sigmoid(model.intercept + model.slope * logit(probability));
    if (model.id === "POWER_GAMMA") return Math.max(EPSILON, probability) ** model.gamma;
    return isotonicPredict(model.points, probability);
  });
  return normalize(mapped);
}

export function rankingChanged(before: Array<{ runnerId: string; probability: number }>, after: Array<{ runnerId: string; probability: number }>) {
  const beforeOrder = rankOrder(before);
  const afterOrder = rankOrder(after);
  return {
    sameRankOne: beforeOrder[0] === afterOrder[0],
    sameOrder: beforeOrder.length === afterOrder.length && beforeOrder.every((runnerId, index) => runnerId === afterOrder[index]),
    beforeOrder,
    afterOrder,
  };
}

function fitPlattLogistic(races: RaceCalibrationInput[]): CalibrationModel {
  const rows = races.flatMap((race) => race.runners.map((runner) => ({ x: logit(runner.probability), y: runner.won ? 1 : 0 })));
  let intercept = logit(rows.reduce((sum, row) => sum + row.y, 0) / Math.max(rows.length, 1));
  let slope = 1;
  for (let iteration = 0; iteration < 2_000; iteration += 1) {
    let gradIntercept = 0;
    let gradSlope = 0;
    for (const row of rows) {
      const predicted = sigmoid(intercept + slope * row.x);
      gradIntercept += predicted - row.y;
      gradSlope += (predicted - row.y) * row.x;
    }
    gradIntercept /= Math.max(rows.length, 1);
    gradSlope = gradSlope / Math.max(rows.length, 1) + 0.01 * (slope - 1);
    intercept -= 0.05 * gradIntercept;
    slope = Math.max(0.001, slope - 0.05 * gradSlope);
  }
  return { id: "PLATT_LOGISTIC", label: "B. PLATT / LOGISTIC", fittedOn: "2025 Hurdles", intercept, slope };
}

function fitPowerGamma(races: RaceCalibrationInput[]): CalibrationModel {
  const candidates = [1.1, 1.2, 1.35, 1.5, 1.75, 2.0, 2.35, 2.75, 3.25, 4.0];
  const scored = candidates.map((gamma) => ({ gamma, loss: raceLogLoss(races, (p) => Math.max(EPSILON, p) ** gamma) }));
  const best = scored.sort((left, right) => left.loss - right.loss || Math.abs(left.gamma - 1) - Math.abs(right.gamma - 1))[0]!;
  return { id: "POWER_GAMMA", label: "D. MONOTONIC POWER", fittedOn: "2025 Hurdles", gamma: best.gamma };
}

function fitIsotonic(races: RaceCalibrationInput[]): CalibrationModel {
  const rows = races.flatMap((race) => race.runners.map((runner) => ({ x: runner.probability, y: runner.won ? 1 : 0 }))).sort((left, right) => left.x - right.x);
  const blocks = rows.map((row) => ({ xSum: row.x, weight: 1, y: row.y }));
  for (let index = 0; index < blocks.length - 1;) {
    if (blocks[index]!.y <= blocks[index + 1]!.y) {
      index += 1;
      continue;
    }
    const merged = {
      xSum: blocks[index]!.xSum + blocks[index + 1]!.xSum,
      weight: blocks[index]!.weight + blocks[index + 1]!.weight,
      y: (blocks[index]!.y * blocks[index]!.weight + blocks[index + 1]!.y * blocks[index + 1]!.weight) / (blocks[index]!.weight + blocks[index + 1]!.weight),
    };
    blocks.splice(index, 2, merged);
    index = Math.max(0, index - 1);
  }
  const points = blocks.map((block) => ({ x: block.xSum / block.weight, y: Math.max(EPSILON, block.y) }));
  return { id: "ISOTONIC", label: "C. ISOTONIC", fittedOn: "2025 Hurdles", points };
}

function raceLogLoss(races: RaceCalibrationInput[], map: (probability: number) => number) {
  return mean(races.map((race) => {
    const probabilities = normalize(race.runners.map((runner) => map(runner.probability)));
    const winner = race.runners.findIndex((runner) => runner.won);
    return -Math.log(Math.max(probabilities[winner] ?? EPSILON, EPSILON));
  })) ?? Number.POSITIVE_INFINITY;
}

function isotonicPredict(points: Array<{ x: number; y: number }>, probability: number) {
  if (!points.length) return probability;
  if (probability <= points[0]!.x) return points[0]!.y + EPSILON * probability;
  for (let index = 1; index < points.length; index += 1) {
    const right = points[index]!;
    if (probability > right.x) continue;
    const left = points[index - 1]!;
    const span = Math.max(right.x - left.x, EPSILON);
    const fraction = (probability - left.x) / span;
    return left.y + (right.y - left.y) * fraction + EPSILON * probability;
  }
  return points.at(-1)!.y + EPSILON * probability;
}

function rankOrder(rows: Array<{ runnerId: string; probability: number }>) {
  return [...rows].sort((left, right) => right.probability - left.probability || left.runnerId.localeCompare(right.runnerId)).map((row) => row.runnerId);
}

function normalize(values: number[]) {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!Number.isFinite(total) || total <= 0) return values.map(() => 1 / values.length);
  return values.map((value) => value / total);
}

function logit(value: number) {
  const clamped = Math.min(1 - EPSILON, Math.max(EPSILON, value));
  return Math.log(clamped / (1 - clamped));
}

function sigmoid(value: number) {
  if (value >= 0) {
    const z = Math.exp(-value);
    return 1 / (1 + z);
  }
  const z = Math.exp(value);
  return z / (1 + z);
}

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

const EPSILON = 1e-12;
