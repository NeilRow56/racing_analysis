import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { dirname } from "node:path";
import type { HistoricalPreRaceFeatureRow } from "./historical-target-metrics";
import type { TodayRace, TodayRunner } from "./todays-racing";
import type { SportingLifeEstimatedPrice } from "./todays-racing";
import { isOrdinaryFlatTurfRaceForDisplay } from "./todays-racing";
import type { HistoricalComment, Model } from "../../../scripts/diagnose-independent-tissue-feasibility";
import { COMMENT_NAMES, commentVector, numericVector, priorCommentsForTarget, raceSoftmax, score } from "../../../scripts/diagnose-independent-tissue-feasibility";

export const TISSUE_FORWARD_VERSION = "tissue_forward_v1" as const;
export const TISSUE_MODEL_VERSION = "independent_tissue_numeric_comments_v1_2025" as const;
export const TISSUE_FORWARD_START = "2026-09-19";
export const TISSUE_FORWARD_PATH = "data/research/tissue-forward.json";
export const TISSUE_MODEL_PATH = "data/research/tissue-model-v1.json";
export const TISSUE_V2_FORWARD_VERSION = "tissue_forward_v2" as const;
export const TISSUE_V2_MODEL_VERSION = "tissue_model_v2" as const;
export const TISSUE_V2_FORWARD_PATH = "data/research/tissue-forward-v2.json";
export const TISSUE_V2_MODEL_PATH = "data/research/tissue-model-v2.json";
export const TISSUE_V2_FORWARD_START_AT = "2026-09-19T17:35:53.410Z";

export type TissueVersionConfig = {
  forwardVersion: string;
  modelVersion: string;
  forwardStart: string;
  forwardStartAt?: string;
  forwardPath: string;
  modelPath: string;
  turfSpeedVersion: string;
};

export const TISSUE_V1_CONFIG: TissueVersionConfig = {
  forwardVersion: TISSUE_FORWARD_VERSION,
  modelVersion: TISSUE_MODEL_VERSION,
  forwardStart: TISSUE_FORWARD_START,
  forwardPath: TISSUE_FORWARD_PATH,
  modelPath: TISSUE_MODEL_PATH,
  turfSpeedVersion: "turf_speed_v1",
};
export const TISSUE_V2_CONFIG: TissueVersionConfig = {
  forwardVersion: TISSUE_V2_FORWARD_VERSION,
  modelVersion: TISSUE_V2_MODEL_VERSION,
  forwardStart: TISSUE_V2_FORWARD_START_AT.slice(0, 10),
  forwardStartAt: TISSUE_V2_FORWARD_START_AT,
  forwardPath: TISSUE_V2_FORWARD_PATH,
  modelPath: TISSUE_V2_MODEL_PATH,
  turfSpeedVersion: "turf_speed_v2",
};

export type FrozenTissueModel = {
  version: string;
  trainedAt: string;
  trainingWindow: { from: string; to: string };
  checksum: string;
  model: Model;
};

export type TissueForwardRunner = {
  runnerId: string;
  horseId: string;
  horseName: string;
  probability: number;
  fairDecimalOdds: number;
  tissueRank: number;
  commentFeatures: string[];
  finishingPosition: number | null;
  finalSp: number | null;
  marketImpliedProbability: number | null;
  marketRank: number | null;
};

export type TissueForwardRace = {
  raceDate: string;
  course: string;
  raceTime: string;
  raceId: string;
  sourceId: string | null;
  raceName: string | null;
  tissueModelVersion: string;
  tissueModelChecksum: string;
  recordedAt: string;
  recordedPreRace: boolean | null;
  runners: TissueForwardRunner[];
  winners: string[];
  settledAt: string | null;
};

export type TissueForwardData = {
  version: string;
  tissueModelVersion: string;
  forwardStart: string;
  forwardStartAt?: string;
  races: TissueForwardRace[];
};

export function buildTissueForwardRace(input: {
  raceDate: string;
  course: string;
  race: TodayRace;
  model: FrozenTissueModel;
  commentsByHorse: Map<string, HistoricalComment[]>;
  recordedAt?: Date;
  config?: TissueVersionConfig;
}): TissueForwardRace | null {
  const config = input.config ?? TISSUE_V1_CONFIG;
  if (input.raceDate < config.forwardStart || !isOrdinaryFlatTurfRaceForDisplay(input.race)) return null;
  if (!input.race.raceDateTime || !input.race.scheduledTime) return null;
  if (config.forwardStartAt && input.race.raceDateTime < new Date(config.forwardStartAt)) return null;
  const active = input.race.runners.filter((runner) => runner.resultStatus !== "non_runner");
  if (active.length < 2) return null;
  const scored = active.map((runner) => {
    const priors = priorCommentsForTarget(input.commentsByHorse.get(runner.horseId) ?? [], input.race.raceDateTime!);
    const values = [...numericVector(featureInput(input.race, runner)), ...commentVector(priors)];
    return { runner, priors, score: score(input.model.model, values) };
  });
  const probabilities = raceSoftmax(scored.map((entry) => entry.score));
  const ranks = competitionRanks(probabilities);
  const recordedAt = input.recordedAt ?? new Date();
  return {
    raceDate: input.raceDate,
    course: input.course,
    raceTime: input.race.scheduledTime.slice(0, 5),
    raceId: input.race.raceId,
    sourceId: input.race.sourceId,
    raceName: input.race.raceName,
    tissueModelVersion: input.model.version,
    tissueModelChecksum: input.model.checksum,
    recordedAt: recordedAt.toISOString(),
    recordedPreRace: recordedAt < input.race.raceDateTime,
    runners: scored.map((entry, index) => ({
      runnerId: entry.runner.runnerId,
      horseId: entry.runner.horseId,
      horseName: entry.runner.horseName,
      probability: probabilities[index]!,
      fairDecimalOdds: 1 / probabilities[index]!,
      tissueRank: ranks[index]!,
      commentFeatures: activeCommentFeatures(commentVector(entry.priors)),
      finishingPosition: null,
      finalSp: null,
      marketImpliedProbability: null,
      marketRank: null,
    })),
    winners: [],
    settledAt: null,
  };
}

export function upsertTissueRaces(data: TissueForwardData, races: TissueForwardRace[]) {
  const existing = new Set(data.races.map((race) => race.raceId));
  const additions: TissueForwardRace[] = [];
  for (const race of races) {
    if (existing.has(race.raceId)) continue;
    existing.add(race.raceId);
    additions.push(race);
  }
  return { ...data, races: [...data.races, ...additions] };
}

export function enrichTissueForwardRace(record: TissueForwardRace, race: TodayRace, settledAt = new Date()): TissueForwardRace {
  const byId = new Map(race.runners.map((runner) => [runner.runnerId, runner]));
  const marketRanks = marketCompetitionRanks(race.runners);
  const winners = race.runners.filter((runner) => runner.finishingPosition === 1);
  if (winners.length === 0) return record;
  const runners = record.runners.map((runner) => {
    const result = byId.get(runner.runnerId);
    const finalSp = decimal(result?.oddsDecimal ?? null);
    return {
      ...runner,
      finishingPosition: result?.finishingPosition ?? null,
      finalSp,
      marketImpliedProbability: finalSp === null ? null : 1 / finalSp,
      marketRank: result ? marketRanks.get(result.runnerId) ?? null : null,
    };
  });
  const winnerNames = winners.map((winner) => winner.horseName);
  if (JSON.stringify(runners) === JSON.stringify(record.runners) && JSON.stringify(winnerNames) === JSON.stringify(record.winners)) return record;
  return { ...record, runners, winners: winnerNames, settledAt: record.settledAt ?? settledAt.toISOString() };
}

export function pendingCleanPreRaceTissueRaceIds(data: TissueForwardData): string[] {
  return data.races
    .filter((race) => race.recordedPreRace === true && race.winners.length === 0)
    .map((race) => race.raceId);
}

export function settlePendingTissueForwardRaces(
  data: TissueForwardData,
  racesById: Map<string, TodayRace>,
  settledAt = new Date(),
): { data: TissueForwardData; settled: number } {
  let settled = 0;
  const races = data.races.map((record) => {
    if (record.recordedPreRace !== true || record.winners.length > 0) return record;
    const race = racesById.get(record.raceId);
    if (!race) return record;
    const enriched = enrichTissueForwardRace(record, race, settledAt);
    if (enriched !== record && enriched.winners.length > 0) settled += 1;
    return enriched;
  });
  return { data: { ...data, races }, settled };
}

export function summarizeTissueForward(data: TissueForwardData) {
  const clean = data.races.filter((race) => race.recordedPreRace === true);
  const settled = clean.filter((race) => race.winners.length > 0);
  const pending = clean.length - settled.length;
  const top = (count: number) => settled.filter((race) => race.runners.some((runner) => runner.tissueRank <= count && race.winners.includes(runner.horseName))).length / Math.max(settled.length, 1);
  const logLoss = average(settled.map((race) => -Math.log(Math.max(sum(race.runners.filter((runner) => race.winners.includes(runner.horseName)).map((runner) => runner.probability)), 1e-12))));
  const brier = average(settled.map((race) => sum(race.runners.map((runner) => (runner.probability - (race.winners.includes(runner.horseName) ? 1 : 0)) ** 2))));
  return {
    racesTracked: data.races.length,
    cleanPreRaceRaces: clean.length,
    pending,
    settled: settled.length,
    postRaceBackfilledExcluded: data.races.length - clean.length,
    top1: top(1), top2: top(2), top3: top(3), logLoss, brier,
    calibration: calibration(settled, (runner) => runner.probability),
    marketCalibration: calibration(settled, (runner) => runner.marketImpliedProbability),
  };
}

export function renderTissueTodayReport(
  data: TissueForwardData,
  estimatedPrices: SportingLifeEstimatedPrice[] = [],
): string {
  const clean = data.races.filter((race) => race.recordedPreRace === true);
  const latestDate = clean.map((race) => race.raceDate).sort().at(-1);
  if (!latestDate) {
    return "Tissue Today\n\nNo clean pre-race Tissue races are available.";
  }

  const races = clean
    .filter((race) => race.raceDate === latestDate)
    .sort((left, right) =>
      tissueTodayDisplayTime(left, estimatedPrices).localeCompare(tissueTodayDisplayTime(right, estimatedPrices)) ||
      left.course.localeCompare(right.course)
    );
  const priceByRunner = new Map(estimatedPrices.map((price) => [
    `${price.raceId}|${price.runnerId}`,
    price,
  ]));
  const lines = [`Tissue Today - ${latestDate}`, ""];
  const positiveRankOne: string[] = [];
  for (const race of races) {
    const displayRaceTime = tissueTodayDisplayTime(race, estimatedPrices);
    lines.push(`${displayRaceTime} ${race.course}${race.raceName ? ` - ${race.raceName}` : ""}`);
    const topThree = [...race.runners]
      .sort((left, right) =>
        left.tissueRank - right.tissueRank ||
        right.probability - left.probability ||
        left.horseName.localeCompare(right.horseName)
      )
      .slice(0, 3);
    for (const runner of topThree) {
      const nonRunner = isFrozenTissueNonRunner(race, runner) ? " - non-runner" : "";
      const currentPrice = race.winners.length === 0
        ? priceByRunner.get(`${race.raceId}|${runner.runnerId}`)
        : undefined;
      const comparison = tissueEstimatedPriceComparison(
        runner.probability,
        currentPrice?.estimatedSp ?? null,
        currentPrice?.estimatedDecimalOdds ?? null,
      );
      lines.push(`${runner.tissueRank}. ${runner.horseName}${nonRunner}`);
      lines.push(`   ${formatTissuePriceComparison(runner.probability, comparison)}`);
      if (runner.tissueRank === 1 && comparison?.isValue) {
        positiveRankOne.push(
          `${displayRaceTime} ${race.course} - ${runner.horseName} | Tissue ${pct1(runner.probability)} | Est SP ${comparison.estimatedSp} | Edge ${signedPp(comparison.edge)}`,
        );
      }
    }
    lines.push(`   Status: ${tissueRaceStatus(race)}`, "");
  }
  lines.push("Current positive-edge Tissue rank-1 horses");
  lines.push(...(positiveRankOne.length > 0 ? positiveRankOne : ["None"]), "");
  lines.push("Value comparison uses the current Sporting Life estimated SP and may change before the race.");
  lines.push("Monitoring only; not a betting recommendation.");
  return lines.join("\n").trimEnd();
}

function tissueTodayDisplayTime(
  race: TissueForwardRace,
  racecardContext: SportingLifeEstimatedPrice[],
): string {
  return racecardContext.find((entry) => entry.raceId === race.raceId)?.displayRaceTime ?? race.raceTime;
}

export type TissueEstimatedPriceComparison = {
  estimatedSp: string;
  decimalOdds: number;
  marketProbability: number;
  edge: number;
  isValue: boolean;
};

export function tissueEstimatedPriceComparison(
  tissueProbability: number,
  estimatedSp: string | null,
  estimatedDecimalOdds: string | null = null,
): TissueEstimatedPriceComparison | null {
  const decimalOdds = parseDecimalEstimatedPrice(estimatedDecimalOdds) ?? parseSportingLifeEstimatedPrice(estimatedSp);
  if (decimalOdds === null || estimatedSp === null || estimatedSp.trim() === "") return null;
  const marketProbability = 1 / decimalOdds;
  const edge = tissueProbability - marketProbability;
  return {
    estimatedSp: estimatedSp.trim(),
    decimalOdds,
    marketProbability,
    edge,
    isValue: edge > 0,
  };
}

export function parseSportingLifeEstimatedPrice(value: string | null): number | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  if (["EVENS", "EVS", "EVEN"].includes(normalized)) return 2;
  const match = normalized.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const numerator = Number(match[1]);
  const denominator = Number(match[2]);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return numerator / denominator + 1;
}

function parseDecimalEstimatedPrice(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 1 ? parsed : null;
}

function formatTissuePriceComparison(
  tissueProbability: number,
  comparison: TissueEstimatedPriceComparison | null,
): string {
  if (!comparison) return `Tissue ${pct1(tissueProbability)} | Est SP: —`;
  return [
    `Tissue ${pct1(tissueProbability)}`,
    `Est SP ${comparison.estimatedSp}`,
    `Market ${pct1(comparison.marketProbability)}`,
    `Edge ${signedPp(comparison.edge)}`,
    ...(comparison.isValue ? ["VALUE"] : []),
  ].join(" | ");
}

function signedPp(value: number): string {
  const points = value * 100;
  return `${points >= 0 ? "+" : ""}${points.toFixed(1)}pp`;
}

function tissueRaceStatus(race: TissueForwardRace): string {
  if (race.winners.length === 0) return "pending";
  const winnerWord = race.winners.length === 1 ? "winner" : "winners";
  const winners = race.winners.map((winner) => {
    const runner = race.runners.find((candidate) => sameHorse(candidate.horseName, winner));
    return `${winner} (Tissue rank ${runner?.tissueRank ?? "unranked"})`;
  }).join("; ");
  const rankOneWon = race.runners.some((runner) =>
    runner.tissueRank === 1 && race.winners.some((winner) => sameHorse(winner, runner.horseName))
  );
  const rankOneNonRunner = race.runners.some((runner) => runner.tissueRank === 1 && isFrozenTissueNonRunner(race, runner));
  return [
    "settled",
    ...(rankOneNonRunner ? ["Tissue rank 1 non-runner"] : []),
    `${winnerWord} ${winners}`,
    `Tissue rank 1 won: ${rankOneWon ? "yes" : "no"}`,
  ].join(" - ");
}

function isFrozenTissueNonRunner(race: TissueForwardRace, runner: TissueForwardRunner): boolean {
  return race.winners.length > 0 && runner.finishingPosition === null && runner.finalSp === null;
}

export function compareTissueWithTimewise(data: TissueForwardData, timewise: Array<{ raceDate: string; course: string; raceTime: string; timewiseRank1: string | null; winners: Array<{ horseName: string }> }>) {
  const index = new Map(timewise.map((race) => [`${race.raceDate}|${race.course}|${race.raceTime}`, race]));
  let comparable = 0, agreement = 0, tissueOnly = 0, timewiseOnly = 0, neither = 0;
  for (const race of data.races.filter((candidate) => candidate.recordedPreRace === true && candidate.winners.length > 0)) {
    const other = index.get(`${race.raceDate}|${race.course}|${race.raceTime}`);
    const tissue = race.runners.find((runner) => runner.tissueRank === 1)?.horseName;
    if (!other?.timewiseRank1 || !tissue) continue;
    comparable += 1;
    if (sameHorse(tissue, other.timewiseRank1)) agreement += 1;
    else {
      const tissueWon = race.winners.some((winner) => sameHorse(winner, tissue));
      const timewiseWon = race.winners.some((winner) => sameHorse(winner, other.timewiseRank1!));
      if (tissueWon) tissueOnly += 1;
      else if (timewiseWon) timewiseOnly += 1;
      else neither += 1;
    }
  }
  return { comparable, agreement, disagreement: comparable - agreement, tissueOnly, timewiseOnly, neither };
}

export async function loadFrozenTissueModel(path = TISSUE_MODEL_PATH, expectedVersion: string = TISSUE_MODEL_VERSION): Promise<FrozenTissueModel> {
  const model = JSON.parse(await readFile(path, "utf8")) as FrozenTissueModel;
  if (model.version !== expectedVersion) throw new Error(`Unsupported tissue model ${model.version}`);
  return model;
}
export async function loadTissueForward(path = TISSUE_FORWARD_PATH, config = TISSUE_V1_CONFIG): Promise<TissueForwardData> {
  try {
    const data = JSON.parse(await readFile(path, "utf8")) as TissueForwardData;
    if (data.version !== config.forwardVersion || data.tissueModelVersion !== config.modelVersion) throw new Error("Unsupported tissue forward data");
    return data;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: config.forwardVersion, tissueModelVersion: config.modelVersion, forwardStart: config.forwardStart, ...(config.forwardStartAt ? { forwardStartAt: config.forwardStartAt } : {}), races: [] };
    throw error;
  }
}
export async function saveTissueForward(data: TissueForwardData, path = TISSUE_FORWARD_PATH) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

function featureInput(race: TodayRace, runner: TodayRunner): HistoricalPreRaceFeatureRow {
  const metrics = runner.metrics;
  return {
    officialRating: runner.officialRating,
    latestPerformanceRating: metrics?.latestPerformanceRating ?? null,
    bestPerformanceLast3: metrics?.bestPerformanceLast3 ?? null,
    averagePerformanceLast3: metrics?.averagePerformanceLast3 ?? null,
    latestTurfSpeedRating: metrics?.latestTurfSpeedRating ?? null,
    bestTurfSpeedLast3: metrics?.bestTurfSpeedLast3 ?? null,
    averageTurfSpeedLast3: metrics?.averageTurfSpeedLast3 ?? null,
    latestTodaysRating: metrics?.latestTodaysRating ?? null,
    bestTodaysRatingLast3: metrics?.bestTodaysRatingLast3 ?? null,
    averageTodaysRatingLast3: metrics?.averageTodaysRatingLast3 ?? null,
    trainerPriorWinRate: runner.trainerMetrics?.trainerPriorWinRate ?? null,
    trainerPriorRuns: runner.trainerMetrics?.trainerPriorRuns ?? 0,
    jockeyPriorWinRate: runner.jockeyMetrics?.jockeyPriorWinRate ?? null,
    jockeyPriorRuns: runner.jockeyMetrics?.jockeyPriorRuns ?? 0,
    daysSinceLastRun: metrics?.daysSinceLastRun ?? null,
    priorRuns: metrics?.priorRuns ?? 0,
    horseAge: runner.horseAge,
    weightCarriedLbs: runner.weightCarriedLbs,
    raceClass: race.raceClass,
    distanceYards: race.distanceYards,
    actualRunnerCount: race.actualRunnerCount,
    declaredRunnerCount: race.declaredRunnerCount,
    draw: runner.draw,
    raceName: race.raceName,
    raceType: race.raceType,
    going: race.going,
  } as HistoricalPreRaceFeatureRow;
}
function activeCommentFeatures(values: number[]) { return COMMENT_NAMES.filter((_, index) => values[1 + index] || values[1 + COMMENT_NAMES.length + index]); }
function competitionRanks(values: number[]) { const sorted = [...values].sort((a, b) => b - a); return values.map((value) => sorted.indexOf(value) + 1); }
function marketCompetitionRanks(runners: TodayRunner[]) { const active = runners.map((runner) => ({ runner, sp: decimal(runner.oddsDecimal) })).filter((item): item is { runner: TodayRunner; sp: number } => item.sp !== null).sort((a, b) => a.sp - b.sp || a.runner.runnerId.localeCompare(b.runner.runnerId)); const ranks = new Map<string, number>(); let prior: number | null = null, rank = 0; active.forEach((item, index) => { if (item.sp !== prior) rank = index + 1; ranks.set(item.runner.runnerId, rank); prior = item.sp; }); return ranks; }
function calibration(races: TissueForwardRace[], probability: (runner: TissueForwardRunner) => number | null) {
  const bands: Array<[string, number, number]> = [["<5%", 0, .05], ["5-9.99%", .05, .1], ["10-14.99%", .1, .15], ["15-19.99%", .15, .2], ["20-29.99%", .2, .3], ["30%+", .3, Infinity]];
  const runners = races.flatMap((race) => race.runners
    .map((runner) => ({ race, runner, probability: probability(runner) }))
    .filter((row): row is { race: TissueForwardRace; runner: TissueForwardRunner; probability: number } => row.probability !== null));
  return bands.map(([band, low, high]) => {
    const rows = runners.filter((row) => row.probability >= low && row.probability < high);
    return {
      band,
      runners: rows.length,
      meanPredicted: average(rows.map((row) => row.probability)),
      actualStrike: average(rows.map((row) => raceWinner(row.race, row.runner) ? 1 : 0)),
    };
  });
}
function raceWinner(race: TissueForwardRace, runner: TissueForwardRunner) { return race.winners.some((winner) => sameHorse(winner, runner.horseName)); }
function pct1(value: number) { return `${(value * 100).toFixed(1)}%`; }
function decimal(value: string | null) { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 1 ? parsed : null; }
function sameHorse(a: string, b: string) { return a.trim().toLowerCase() === b.trim().toLowerCase(); }
function sum(values: number[]) { return values.reduce((total, value) => total + value, 0); }
function average(values: number[]) { return values.length ? sum(values) / values.length : 0; }
