import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { isVoidBetResultStatus, settleSelection } from "./backtest";
import { isCurrentAllWeatherRace } from "./current-race-classification";
import { FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION, summarizeBookmakerMarket } from "./forward-value";
import { canonicalFamilyFormMetrics } from "./horse-metrics";
import { isJumpRace } from "./jump-speed-rating";
import { formatRaceTimeForDisplay, type SportingLifeBookmakerQuote, type TodayMeeting, type TodayRace, type TodayRunner } from "./todays-racing";

export const MODEL_DISAGREEMENT_FORWARD_VERSION = "MODEL_DISAGREEMENT_FORWARD_V1" as const;
export const MODEL_DISAGREEMENT_FORWARD_PATH = "data/research/model-disagreement-forward-v1.json" as const;
export const MODEL_DISAGREEMENT_FORWARD_EPOCH = "2026-10-09T00:00:00.000Z" as const;
export const MODEL_DISAGREEMENT_PRICE_MOVEMENT_VERSION = "fixed_descriptive_v1" as const;
export const MODEL_DISAGREEMENT_LABEL_VERSION = "fixed_signal_labels_v1" as const;
export const MODEL_DISAGREEMENT_MATERIAL_VERSION = "fixed_material_disagreement_v1" as const;
export const MODEL_DISAGREEMENT_MATERIAL_MIN_ABSOLUTE_PP = 5.0;
export const MODEL_DISAGREEMENT_MATERIAL_MIN_RATIO = 1.5;

export type ModelDisagreementFamily = "JUMP" | "ALL_WEATHER";
export type MarketCapturePoint = "NIGHT_BEFORE" | "EARLY_MORNING" | "LATE_MORNING" | "FINAL_PRE_RACE";
export type PriceMovementLabel = "STRONG SHORTEN" | "SHORTEN" | "STABLE" | "DRIFT" | "STRONG DRIFT";
export type DisagreementLabel =
  | "MODEL_HIGH_MARKET_LOW"
  | "MARKET_HIGH_MODEL_LOW"
  | "SPEED_HIGH_TISSUE_LOW"
  | "TISSUE_HIGH_RATING_LOW"
  | "MODEL_AGREEMENT";
export type MaterialDisagreementLabel = "MODEL_HIGH_MARKET_LOW" | "MARKET_HIGH_MODEL_LOW";
export type MaterialDisagreementDisplayLabel = "MODEL FAVOURS" | "MARKET FAVOURS";
export type DisagreementSummaryCohort = "MATERIAL MODEL FAVOURS" | "MATERIAL MARKET FAVOURS" | "CONTROL / AGREEMENT";

export type DisagreementMarketSnapshot = {
  capturePoint: MarketCapturePoint;
  capturedAt: string;
  medianBookmakerDecimal: number;
  impliedProbability: number;
  bestBookmakerDecimal: number | null;
  bestBookmakerFractional: string | null;
  bestBookmakerName: string | null;
  bookmakerQuoteCount: number;
  bookmakerQuotes: SportingLifeBookmakerQuote[];
  marketPriceBasisVersion: typeof FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION;
};

export type DisagreementMovement = {
  from: MarketCapturePoint;
  to: MarketCapturePoint;
  decimalPriceChange: number;
  impliedProbabilityChange: number;
  percentagePriceChange: number;
  label: PriceMovementLabel;
};

export type FrozenDisagreementEvidence = {
  label: DisagreementLabel;
  labelledAt: string;
  modelProbability: number | null;
  modelRank: number | null;
  marketImpliedProbability: number | null;
  edgePercentagePoints: number | null;
  firstQualifyingSnapshot: DisagreementMarketSnapshot | null;
  signalRanks: DisagreementSignals;
};

export type DisagreementSignals = {
  tissueRank: number | null;
  tissueProbability: number | null;
  primaryRatingRank: number | null;
  avgL3SpeedRank: number | null;
  latestSpeedRank: number | null;
  bestL3Rank: number | null;
  officialRatingRank: number | null;
  jumpG4Qualified: boolean | null;
  todaysRating: number | null;
  todaysRatingRank: number | null;
};

export type DisagreementOutcome = {
  status: "settled" | "void";
  resultStatus: string | null;
  finishingPosition: number | null;
  won: boolean | null;
  deadHeatDivisor: number;
  finalSp: number | null;
  qualifyingPriceProfitLoss: number | null;
  finalSpProfitLoss: number | null;
};

export type ModelDisagreementObservation = {
  raceDate: string;
  raceId: string;
  sourceId: string | null;
  scheduledOff: string;
  scheduledTime: string;
  course: string;
  raceName: string | null;
  family: ModelDisagreementFamily;
  runnerId: string;
  horseId: string;
  horseName: string;
  recordedAt: string;
  recordedPreRace: true;
  frozen: FrozenDisagreementEvidence;
  snapshots: Partial<Record<MarketCapturePoint, DisagreementMarketSnapshot>>;
  movements: DisagreementMovement[];
  finalSp: number | null;
  outcome: DisagreementOutcome | null;
  settledAt: string | null;
};

export type ModelDisagreementForwardData = {
  version: typeof MODEL_DISAGREEMENT_FORWARD_VERSION;
  epoch: typeof MODEL_DISAGREEMENT_FORWARD_EPOCH;
  labelVersion: typeof MODEL_DISAGREEMENT_LABEL_VERSION;
  movementVersion: typeof MODEL_DISAGREEMENT_PRICE_MOVEMENT_VERSION;
  notes: string[];
  observations: ModelDisagreementObservation[];
};

export function emptyModelDisagreementForwardData(): ModelDisagreementForwardData {
  return {
    version: MODEL_DISAGREEMENT_FORWARD_VERSION,
    epoch: MODEL_DISAGREEMENT_FORWARD_EPOCH,
    labelVersion: MODEL_DISAGREEMENT_LABEL_VERSION,
    movementVersion: MODEL_DISAGREEMENT_PRICE_MOVEMENT_VERSION,
    notes: [
      "Fresh prospective tracker. No historical observations are backfilled.",
      "Pre-race snapshots are only stored when observed before scheduled off; SP is settlement context only.",
      "Movement and disagreement thresholds are fixed descriptive definitions, not optimised from history.",
      "Material model/market disagreement V1 is fixed prospectively: absolute probability gap >= 5.0 percentage points and larger probability >= 1.50x smaller probability.",
      "Existing raw frozen labels and first-capture provenance are preserved; material cohorts are derived from frozen model/market probabilities for display and reporting.",
      "NIGHT_BEFORE means FIRST_NEXT_DAY_CAPTURE: the first valid next-day racecard snapshot after tomorrow's cards become available, not a literal nighttime requirement.",
    ],
    observations: [],
  };
}

export async function loadModelDisagreementForward(path = MODEL_DISAGREEMENT_FORWARD_PATH): Promise<ModelDisagreementForwardData> {
  try {
    const data = JSON.parse(await readFile(path, "utf8")) as ModelDisagreementForwardData;
    if (data.version !== MODEL_DISAGREEMENT_FORWARD_VERSION || data.epoch !== MODEL_DISAGREEMENT_FORWARD_EPOCH ||
      data.labelVersion !== MODEL_DISAGREEMENT_LABEL_VERSION || data.movementVersion !== MODEL_DISAGREEMENT_PRICE_MOVEMENT_VERSION ||
      !Array.isArray(data.observations)) {
      throw new Error(`Unsupported model disagreement tracker at ${path}`);
    }
    return data;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyModelDisagreementForwardData();
    throw error;
  }
}

export async function mutateModelDisagreementForward(
  mutation: (data: ModelDisagreementForwardData) => ModelDisagreementForwardData | Promise<ModelDisagreementForwardData>,
  path = MODEL_DISAGREEMENT_FORWARD_PATH,
) {
  const lock = `${resolve(path)}.lock`;
  await mkdir(dirname(lock), { recursive: true });
  const deadline = Date.now() + 30_000;
  while (true) {
    try { await mkdir(lock); break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST" || Date.now() >= deadline) throw error;
      await new Promise((wait) => setTimeout(wait, 10));
    }
  }
  try {
    const before = await loadModelDisagreementForward(path);
    const after = await mutation(before);
    if (JSON.stringify(after) !== JSON.stringify(before)) await saveModelDisagreementForward(after, path);
    return after;
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}

async function saveModelDisagreementForward(data: ModelDisagreementForwardData, path: string) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

export function buildModelDisagreementObservations(input: {
  meetings: TodayMeeting[];
  raceDate: string;
  capturePoint: MarketCapturePoint;
  recordedAt?: Date;
}): ModelDisagreementObservation[] {
  const now = input.recordedAt ?? new Date();
  if (!Number.isFinite(now.getTime()) || now < new Date(MODEL_DISAGREEMENT_FORWARD_EPOCH)) return [];
  return input.meetings.flatMap((meeting) => meeting.races.flatMap((race) => {
    const family = raceFamily(race);
    if (family === null || !race.raceDateTime || !race.scheduledTime || now >= race.raceDateTime || hasResult(race)) return [];
    const scheduledOff = race.raceDateTime;
    const scheduledTime = race.scheduledTime;
    const active = race.runners.filter((runner) => !isVoidBetResultStatus(runner.resultStatus));
    if (active.length < 2) return [];
    const ranks = raceRanks(active, family);
    return active.flatMap((runner): ModelDisagreementObservation[] => {
      const snapshot = marketSnapshot(runner, input.capturePoint, now);
      const signals = signalsForRunner(runner, ranks, family);
      const label = disagreementLabel(signals, snapshot);
      const modelProbability = signals.tissueProbability;
      const marketProbability = snapshot?.impliedProbability ?? null;
      const edge = modelProbability === null || marketProbability === null ? null : (modelProbability - marketProbability) * 100;
      return [{
        raceDate: input.raceDate,
        raceId: race.raceId,
        sourceId: race.sourceId,
        scheduledOff: scheduledOff.toISOString(),
        scheduledTime,
        course: meeting.courseName,
        raceName: race.raceName,
        family,
        runnerId: runner.runnerId,
        horseId: runner.horseId,
        horseName: runner.horseName,
        recordedAt: now.toISOString(),
        recordedPreRace: true,
        frozen: {
          label,
          labelledAt: now.toISOString(),
          modelProbability,
          modelRank: signals.tissueRank ?? signals.primaryRatingRank,
          marketImpliedProbability: marketProbability,
          edgePercentagePoints: edge,
          firstQualifyingSnapshot: snapshot,
          signalRanks: signals,
        },
        snapshots: snapshot ? { [input.capturePoint]: snapshot } : {},
        movements: [],
        finalSp: null,
        outcome: null,
        settledAt: null,
      }];
    });
  }));
}

export function upsertModelDisagreementObservations(data: ModelDisagreementForwardData, candidates: ModelDisagreementObservation[]) {
  const seen = new Set(data.observations.map((row) => `${row.raceId}|${row.runnerId}`));
  const additions = candidates.filter((row) => {
    const key = `${row.raceId}|${row.runnerId}`;
    const recordedAt = new Date(row.recordedAt);
    const off = new Date(row.scheduledOff);
    if (seen.has(key) || !row.recordedPreRace || row.settledAt !== null || row.outcome !== null ||
      !Number.isFinite(recordedAt.getTime()) || !Number.isFinite(off.getTime()) ||
      recordedAt < new Date(data.epoch) || recordedAt >= off) return false;
    seen.add(key);
    return true;
  });
  return additions.length ? { ...data, observations: [...data.observations, ...additions] } : data;
}

export function refreshModelDisagreementSnapshots(
  data: ModelDisagreementForwardData,
  races: ReadonlyMap<string, TodayRace>,
  capturePoint: MarketCapturePoint,
  capturedAt = new Date(),
) {
  let changed = false;
  const observations = data.observations.map((row) => {
    if (row.settledAt !== null) return row;
    const race = races.get(row.raceId);
    const runner = race?.runners.find((candidate) => candidate.runnerId === row.runnerId);
    if (!race?.raceDateTime || !runner || capturedAt >= race.raceDateTime || capturedAt >= new Date(row.scheduledOff) ||
      capturedAt < new Date(row.recordedAt) || isVoidBetResultStatus(runner.resultStatus) || hasResult(race)) return row;
    const snapshot = marketSnapshot(runner, capturePoint, capturedAt);
    if (!snapshot) return row;
    const snapshots = { ...row.snapshots };
    if (capturePoint !== "FINAL_PRE_RACE" && snapshots[capturePoint]) return row;
    snapshots[capturePoint] = snapshot;
    changed = true;
    return { ...row, snapshots, movements: priceMovements(snapshots) };
  });
  return changed ? { ...data, observations } : data;
}

export function settleModelDisagreementObservations(
  data: ModelDisagreementForwardData,
  races: ReadonlyMap<string, TodayRace>,
  settledAt = new Date(),
) {
  let settled = 0;
  const observations = data.observations.map((row) => {
    if (row.settledAt !== null) return row;
    const race = races.get(row.raceId);
    const runner = race?.runners.find((candidate) => candidate.runnerId === row.runnerId);
    if (!race || !runner) return row;
    const outcome = canonicalOutcome(race, runner, row.frozen.firstQualifyingSnapshot?.medianBookmakerDecimal ?? null);
    if (!outcome) return row;
    settled++;
    return { ...row, finalSp: outcome.finalSp, outcome, settledAt: settledAt.toISOString() };
  });
  return { data: settled ? { ...data, observations } : data, settled };
}

export function pendingModelDisagreementRaceIds(data: ModelDisagreementForwardData) {
  return [...new Set(data.observations.filter((row) => row.settledAt === null).map((row) => row.raceId))];
}

export function priceMovements(snapshots: Partial<Record<MarketCapturePoint, DisagreementMarketSnapshot>>): DisagreementMovement[] {
  const pairs: Array<[MarketCapturePoint, MarketCapturePoint]> = [
    ["NIGHT_BEFORE", "EARLY_MORNING"],
    ["EARLY_MORNING", "LATE_MORNING"],
    ["LATE_MORNING", "FINAL_PRE_RACE"],
    ["NIGHT_BEFORE", "FINAL_PRE_RACE"],
    ["EARLY_MORNING", "FINAL_PRE_RACE"],
  ];
  return pairs.flatMap(([from, to]) => {
    const left = snapshots[from], right = snapshots[to];
    if (!left || !right || left.capturedAt === right.capturedAt) return [];
    const decimalPriceChange = right.medianBookmakerDecimal - left.medianBookmakerDecimal;
    const impliedProbabilityChange = right.impliedProbability - left.impliedProbability;
    const percentagePriceChange = decimalPriceChange / left.medianBookmakerDecimal;
    return [{ from, to, decimalPriceChange, impliedProbabilityChange, percentagePriceChange, label: movementLabel(percentagePriceChange) }];
  });
}

export function movementLabel(percentagePriceChange: number): PriceMovementLabel {
  if (percentagePriceChange <= -0.20) return "STRONG SHORTEN";
  if (percentagePriceChange <= -0.05) return "SHORTEN";
  if (percentagePriceChange < 0.05) return "STABLE";
  if (percentagePriceChange < 0.20) return "DRIFT";
  return "STRONG DRIFT";
}

export function renderModelDisagreementToday(data: ModelDisagreementForwardData, raceDate: string) {
  const rows = data.observations.filter((row) => row.raceDate === raceDate && row.settledAt === null && materialModelMarketDisagreement(row) !== null)
    .sort((a, b) => a.scheduledOff.localeCompare(b.scheduledOff) || a.course.localeCompare(b.course) || a.horseName.localeCompare(b.horseName));
  if (!rows.length) return `Model Disagreement Today - ${raceDate}\n\nNo material model/market disagreement rows.`;
  return [`Model Disagreement Today - ${raceDate}`, "",
    ...rows.map((row) => `${formatRaceTimeForDisplay({ raceDateTime: new Date(row.scheduledOff), scheduledTime: row.scheduledTime })} | ${row.course} | ${row.horseName}
${materialDisagreementDisplayLabel(materialModelMarketDisagreement(row)!)}
Model ${pct(row.frozen.modelProbability)} vs market ${pct(row.frozen.marketImpliedProbability)}
${pricePath(row)}
${latestMovement(row)}`),
  ].join("\n");
}

export function summarizeModelDisagreementForward(data: ModelDisagreementForwardData) {
  const byCohort = group(data.observations, materialDisagreementSummaryCohort);
  const order: DisagreementSummaryCohort[] = ["MATERIAL MODEL FAVOURS", "MATERIAL MARKET FAVOURS", "CONTROL / AGREEMENT"];
  return order.flatMap((label) => {
    const rows = byCohort.get(label) ?? [];
    if (!rows.length && label !== "CONTROL / AGREEMENT") return [];
    const settled = rows.filter((row) => row.outcome?.status === "settled");
    const winners = settled.filter((row) => row.outcome?.won === true);
    const priced = settled.flatMap((row) => {
      const impliedProbability = row.frozen.firstQualifyingSnapshot?.impliedProbability;
      const profitLoss = row.outcome?.qualifyingPriceProfitLoss;
      return finite(impliedProbability) && finite(profitLoss) ? [{ impliedProbability, profitLoss }] : [];
    });
    const expected = priced.reduce((sum, row) => sum + row.impliedProbability, 0);
    const movementAverage = average(rows.flatMap((row) => row.movements.map((movement) => movement.impliedProbabilityChange)));
    return {
      label,
      tracked: rows.length,
      settled: settled.length,
      winners: winners.length,
      strike: settled.length ? winners.length / settled.length : null,
      expectedWinners: expected,
      ae: expected ? winners.length / expected : null,
      roi: priced.length ? priced.reduce((sum, row) => sum + row.profitLoss, 0) / priced.length : null,
      shortenedNightEarly: movementRate(rows, "NIGHT_BEFORE", "EARLY_MORNING"),
      shortenedEarlyLate: movementRate(rows, "EARLY_MORNING", "LATE_MORNING"),
      shortenedNightFinal: movementRate(rows, "NIGHT_BEFORE", "FINAL_PRE_RACE"),
      averageImpliedProbabilityMovement: movementAverage,
    };
  });
}

export function renderModelDisagreementSummary(data: ModelDisagreementForwardData) {
  const lines = [
    "Model Disagreement Forward Summary",
    `Version: ${data.version} | epoch: ${data.epoch}`,
    "No historical backfill; NIGHT_BEFORE means first next-day capture; SP is settlement context only.",
    `Material V1: absolute gap >= ${MODEL_DISAGREEMENT_MATERIAL_MIN_ABSOLUTE_PP.toFixed(1)}pp and larger probability >= ${MODEL_DISAGREEMENT_MATERIAL_MIN_RATIO.toFixed(2)}x smaller probability. Raw frozen labels and first-capture provenance are preserved.`,
    "",
    "Label | Tracked | Settled | Winners | Strike | Exp winners | A/E | ROI | N→E shorten | E→L shorten | N→F shorten | Avg implied move",
    ...summarizeModelDisagreementForward(data).map((row) => [
      row.label, row.tracked, row.settled, row.winners, pct(row.strike), num(row.expectedWinners), num(row.ae), pct(row.roi),
      pct(row.shortenedNightEarly), pct(row.shortenedEarlyLate), pct(row.shortenedNightFinal), pp(row.averageImpliedProbabilityMovement),
    ].join(" | ")),
  ];
  for (const [name, rows] of [["WINNERS", data.observations.filter((row) => row.outcome?.won === true)], ["LOSERS", data.observations.filter((row) => row.outcome?.won === false)]] as const) {
    lines.push(`${name} avg implied-probability movement: ${pp(average(rows.flatMap((row) => row.movements.map((movement) => movement.impliedProbabilityChange))))}`);
  }
  return lines.join("\n");
}

export function modelDisagreementResearchRows(data: ModelDisagreementForwardData, raceDate: string) {
  return data.observations.filter((row) => row.raceDate === raceDate && row.settledAt === null && materialModelMarketDisagreement(row) !== null).map((row) => ({
    raceId: row.raceId,
    runnerId: row.runnerId,
    horseId: row.horseId,
    horseName: row.horseName,
    course: row.course,
    time: formatRaceTimeForDisplay({ raceDateTime: new Date(row.scheduledOff), scheduledTime: row.scheduledTime }),
    sortTime: row.scheduledOff,
    price: latestSnapshot(row)?.medianBookmakerDecimal ?? null,
    reason: `${materialDisagreementDisplayLabel(materialModelMarketDisagreement(row)!)} · Model ${pct(row.frozen.modelProbability)} vs market ${pct(row.frozen.marketImpliedProbability)}`,
    context: pricePath(row),
    movement: latestMovement(row),
  }));
}

export function materialModelMarketDisagreement(row: ModelDisagreementObservation): MaterialDisagreementLabel | null {
  return materialModelMarketDisagreementForProbabilities(row.frozen.modelProbability, row.frozen.marketImpliedProbability);
}

export function materialModelMarketDisagreementForProbabilities(modelProbability: number | null, marketProbability: number | null): MaterialDisagreementLabel | null {
  if (!finite(modelProbability) || !finite(marketProbability) || modelProbability === marketProbability) return null;
  const absoluteGapPp = Math.abs(modelProbability - marketProbability) * 100;
  const larger = Math.max(modelProbability, marketProbability);
  const smaller = Math.min(modelProbability, marketProbability);
  const ratio = smaller === 0 ? (larger > 0 ? Infinity : 1) : larger / smaller;
  if (absoluteGapPp + 1e-12 < MODEL_DISAGREEMENT_MATERIAL_MIN_ABSOLUTE_PP || ratio + 1e-12 < MODEL_DISAGREEMENT_MATERIAL_MIN_RATIO) return null;
  return modelProbability > marketProbability ? "MODEL_HIGH_MARKET_LOW" : "MARKET_HIGH_MODEL_LOW";
}

export function materialDisagreementDisplayLabel(label: MaterialDisagreementLabel): MaterialDisagreementDisplayLabel {
  return label === "MODEL_HIGH_MARKET_LOW" ? "MODEL FAVOURS" : "MARKET FAVOURS";
}

export function materialDisagreementSummaryCohort(row: ModelDisagreementObservation): DisagreementSummaryCohort {
  const material = materialModelMarketDisagreement(row);
  if (material === "MODEL_HIGH_MARKET_LOW") return "MATERIAL MODEL FAVOURS";
  if (material === "MARKET_HIGH_MODEL_LOW") return "MATERIAL MARKET FAVOURS";
  return "CONTROL / AGREEMENT";
}

function raceFamily(race: TodayRace): ModelDisagreementFamily | null {
  if (isJumpRace(race)) return "JUMP";
  if (isCurrentAllWeatherRace(race)) return "ALL_WEATHER";
  return null;
}

function hasResult(race: TodayRace) {
  return Boolean(race.winningTime) || race.runners.some((runner) => runner.finishingPosition !== null ||
    (runner.resultStatus !== null && runner.resultStatus !== "non_runner"));
}

function marketSnapshot(runner: TodayRunner, capturePoint: MarketCapturePoint, capturedAt: Date): DisagreementMarketSnapshot | null {
  const market = summarizeBookmakerMarket(runner.bookmakerQuotes);
  if (market.decimalPrice === null || market.impliedProbability === null) return null;
  return {
    capturePoint,
    capturedAt: capturedAt.toISOString(),
    medianBookmakerDecimal: market.decimalPrice,
    impliedProbability: market.impliedProbability,
    bestBookmakerDecimal: market.bestDecimalPrice,
    bestBookmakerFractional: market.bestFractionalPrice,
    bestBookmakerName: market.bestBookmakerName,
    bookmakerQuoteCount: market.quoteCount,
    bookmakerQuotes: market.quotes,
    marketPriceBasisVersion: FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION,
  };
}

function signalsForRunner(runner: TodayRunner, ranks: ReturnType<typeof raceRanks>, family: ModelDisagreementFamily): DisagreementSignals {
  const todaysRating = runner.metrics ? canonicalFamilyFormMetrics(runner.metrics, family === "JUMP" ? "jump" : "aw").todaysRating.latest : null;
  const tissue = family === "JUMP" ? runner.jumpTissue : runner.awTissue;
  return {
    tissueRank: tissue?.rank ?? null,
    tissueProbability: tissue?.probability ?? null,
    primaryRatingRank: family === "JUMP" ? runner.jumpRating?.jprA?.rank ?? null : runner.awRating?.awD?.rank ?? null,
    avgL3SpeedRank: ranks.avgL3.get(runner.runnerId) ?? null,
    latestSpeedRank: ranks.latest.get(runner.runnerId) ?? null,
    bestL3Rank: ranks.best.get(runner.runnerId) ?? null,
    officialRatingRank: ranks.or.get(runner.runnerId) ?? null,
    jumpG4Qualified: family === "JUMP" ? g4Like(runner) : null,
    todaysRating,
    todaysRatingRank: ranks.todaysRating.get(runner.runnerId) ?? null,
  };
}

function disagreementLabel(signals: DisagreementSignals, snapshot: DisagreementMarketSnapshot | null): DisagreementLabel {
  const material = materialModelMarketDisagreementForProbabilities(signals.tissueProbability, snapshot?.impliedProbability ?? null);
  if (material) return material;
  if ((signals.avgL3SpeedRank !== null && signals.avgL3SpeedRank <= 3 || signals.latestSpeedRank !== null && signals.latestSpeedRank <= 3) &&
    (signals.tissueRank === null || signals.tissueRank >= 5)) return "SPEED_HIGH_TISSUE_LOW";
  if (signals.tissueRank !== null && signals.tissueRank <= 2 && (signals.primaryRatingRank === null || signals.primaryRatingRank >= 5)) return "TISSUE_HIGH_RATING_LOW";
  return "MODEL_AGREEMENT";
}

function raceRanks(runners: TodayRunner[], family: ModelDisagreementFamily) {
  return {
    avgL3: descendingRanks(runners, (runner) => family === "JUMP" ? runner.metrics?.averageJumpSpeedLast3 ?? null : runner.metrics?.averageAwSpeedLast3 ?? null),
    latest: descendingRanks(runners, (runner) => family === "JUMP" ? runner.metrics?.latestJumpSpeedRating ?? null : runner.metrics?.latestAwSpeedRating ?? null),
    best: descendingRanks(runners, (runner) => family === "JUMP" ? runner.metrics?.bestJumpSpeedLast3 ?? null : runner.metrics?.bestAwSpeedLast3 ?? null),
    or: descendingRanks(runners, (runner) => runner.officialRating),
    todaysRating: descendingRanks(runners, (runner) => runner.metrics ? canonicalFamilyFormMetrics(runner.metrics, family === "JUMP" ? "jump" : "aw").todaysRating.latest : null),
  };
}

function descendingRanks(runners: TodayRunner[], valueFor: (runner: TodayRunner) => number | null | undefined) {
  const sorted = runners.map((runner) => ({ runner, value: valueFor(runner) }))
    .filter((entry): entry is { runner: TodayRunner; value: number } => finite(entry.value))
    .sort((a, b) => b.value - a.value || a.runner.runnerId.localeCompare(b.runner.runnerId));
  const ranks = new Map<string, number>();
  let previous: number | null = null;
  let rank = 0;
  sorted.forEach((entry, index) => {
    if (entry.value !== previous) rank = index + 1;
    ranks.set(entry.runner.runnerId, rank);
    previous = entry.value;
  });
  return ranks;
}

function g4Like(runner: TodayRunner) {
  const latest = runner.metrics?.latestJumpSpeedRating ?? null;
  const previous = runner.metrics?.previousJumpSpeedRating ?? null;
  const avgRank = runner.metrics?.averageJumpSpeedLast3 === null ? null : null;
  void avgRank;
  return finite(latest) && finite(previous) ? latest > previous : null;
}

function canonicalOutcome(race: TodayRace, runner: TodayRunner, qualifyingPrice: number | null): DisagreementOutcome | null {
  if (isVoidBetResultStatus(runner.resultStatus)) return { status: "void", resultStatus: runner.resultStatus, finishingPosition: runner.finishingPosition,
    won: null, deadHeatDivisor: 1, finalSp: null, qualifyingPriceProfitLoss: 0, finalSpProfitLoss: 0 };
  const active = race.runners.filter((candidate) => !isVoidBetResultStatus(candidate.resultStatus));
  const winners = active.filter((candidate) => candidate.finishingPosition === 1);
  if (!winners.length || active.some((candidate) => candidate.finishingPosition === null)) return null;
  const outcome = { targetRaceId: race.raceId, targetRunnerId: runner.runnerId, finishingPosition: runner.finishingPosition,
    resultStatus: runner.resultStatus, won: runner.finishingPosition === 1, placed: null, startingPrice: runner.odds,
    startingPriceDecimal: runner.oddsDecimal, deadHeatDivisor: runner.finishingPosition === 1 ? winners.length : 1 };
  const final = settleSelection(outcome);
  if (!final) return null;
  const qualifying = qualifyingPrice === null ? null : settleSelection({ ...outcome, startingPriceDecimal: String(qualifyingPrice) });
  return { status: "settled", resultStatus: runner.resultStatus, finishingPosition: runner.finishingPosition,
    won: runner.finishingPosition === 1, deadHeatDivisor: outcome.deadHeatDivisor, finalSp: final.settlementOddsDecimal,
    qualifyingPriceProfitLoss: qualifying?.profitLoss ?? null, finalSpProfitLoss: final.profitLoss };
}

function movementRate(rows: ModelDisagreementObservation[], from: MarketCapturePoint, to: MarketCapturePoint) {
  const movements = rows.map((row) => row.movements.find((movement) => movement.from === from && movement.to === to)).filter((movement): movement is DisagreementMovement => movement !== undefined);
  return movements.length ? movements.filter((movement) => movement.decimalPriceChange < 0).length / movements.length : null;
}

function latestSnapshot(row: ModelDisagreementObservation) {
  return row.snapshots.FINAL_PRE_RACE ?? row.snapshots.LATE_MORNING ?? row.snapshots.EARLY_MORNING ?? row.snapshots.NIGHT_BEFORE ?? null;
}

function pricePath(row: ModelDisagreementObservation) {
  const labelledSnapshots = [
    ["First", row.snapshots.NIGHT_BEFORE],
    ["Early", row.snapshots.EARLY_MORNING],
    ["Late", row.snapshots.LATE_MORNING],
    ["Final", row.snapshots.FINAL_PRE_RACE],
  ] as const;
  const parts = labelledSnapshots.flatMap(([label, snapshot]) => snapshot ? [`${label} ${snapshot.medianBookmakerDecimal.toFixed(2)}`] : []);
  const latest = latestSnapshot(row);
  const latestIsNamed = labelledSnapshots.some(([, snapshot]) => snapshot?.capturedAt === latest?.capturedAt);
  if (latest && !latestIsNamed) parts.push(`Latest ${latest.medianBookmakerDecimal.toFixed(2)}`);
  return parts.length ? parts.join(" -> ") : "No bookmaker median captured";
}

function latestMovement(row: ModelDisagreementObservation) {
  return row.movements.find((movement) => movement.from === "NIGHT_BEFORE" && movement.to === "FINAL_PRE_RACE")?.label ??
    row.movements.at(-1)?.label ?? "NO MOVEMENT";
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function group<T, K>(values: T[], keyFor: (value: T) => K) {
  const result = new Map<K, T[]>();
  for (const value of values) {
    const key = keyFor(value);
    result.set(key, [...(result.get(key) ?? []), value]);
  }
  return result;
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function pct(value: number | null) {
  return value === null ? "-" : `${(value * 100).toFixed(1)}%`;
}

function pp(value: number | null) {
  return value === null ? "-" : `${(value * 100).toFixed(2)}pp`;
}

function num(value: number | null) {
  return value === null ? "-" : value.toFixed(3);
}
