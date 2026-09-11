import { and, asc, eq, gte, lte } from "drizzle-orm";
import { createDbConnection } from "@/db";
import { raceRunners, races } from "@/db/schema";
import {
  getHistoricalTargetRunnerMetrics,
  type HistoricalPostRaceOutcome,
  type HistoricalPreRaceFeatureRow,
  type HistoricalRaceCode,
  type HistoricalTargetRunnerMetricsRow,
} from "./historical-target-metrics";
import {
  loadBacktestFeatureCache,
  type BacktestCacheFamily,
} from "./backtest-cache";

type Db = ReturnType<typeof createDbConnection>["db"];

export type BacktestRaceSegment = "jump" | "all_weather_flat" | "turf_flat";

export type NumericRange = {
  min?: number;
  max?: number;
};

export type BacktestDefinition = {
  id: string;
  name: string;
  description?: string;
  race?: {
    segments?: BacktestRaceSegment[];
    courseIds?: string[];
    courseNames?: string[];
    raceClasses?: string[];
    distanceYards?: NumericRange;
    fieldSize?: NumericRange;
  };
  runner?: {
    age?: NumericRange;
    officialRating?: NumericRange;
    weightCarriedLbs?: NumericRange;
    daysSinceRun?: NumericRange;
    priorRuns?: NumericRange;
  };
  speed?: {
    latestSpeedRating?: NumericRange;
    previousSpeedRating?: NumericRange;
    bestSpeedLast3?: NumericRange;
    bestSpeedLast5?: NumericRange;
    averageSpeedLast3?: NumericRange;
    averageSpeedLast5?: NumericRange;
    latestPerformanceRating?: NumericRange;
    previousPerformanceRating?: NumericRange;
    bestPerformanceLast3?: NumericRange;
    bestPerformanceLast5?: NumericRange;
    averagePerformanceLast3?: NumericRange;
    averagePerformanceLast5?: NumericRange;
    latestTodaysRating?: NumericRange;
    previousTodaysRating?: NumericRange;
    bestTodaysRatingLast3?: NumericRange;
    bestTodaysRatingLast5?: NumericRange;
    averageTodaysRatingLast3?: NumericRange;
    averageTodaysRatingLast5?: NumericRange;
  };
  relativeSpeed?: {
    latestSpeedMinusOR?: NumericRange;
    bestL3SpeedMinusOR?: NumericRange;
    latestMinusPreviousSpeed?: NumericRange;
    latestMinusBestL3?: NumericRange;
    latestPerformanceMinusOR?: NumericRange;
    bestPerformanceL3MinusOR?: NumericRange;
    latestPerformanceMinusPreviousPerformance?: NumericRange;
    latestTodaysRatingMinusOR?: NumericRange;
    bestTodaysRatingL3MinusOR?: NumericRange;
    latestTodaysMinusPreviousTodays?: NumericRange;
  };
  odds?: {
    preRaceDecimal?: NumericRange;
  };
};

export type BacktestDerivedFeatureValues = {
  latestSpeedMinusOR: number | null;
  bestL3SpeedMinusOR: number | null;
  latestMinusPreviousSpeed: number | null;
  latestMinusBestL3: number | null;
  latestPerformanceMinusOR: number | null;
  bestPerformanceL3MinusOR: number | null;
  latestPerformanceMinusPreviousPerformance: number | null;
  latestTodaysRatingMinusOR: number | null;
  bestTodaysRatingL3MinusOR: number | null;
  latestTodaysMinusPreviousTodays: number | null;
  preRaceOddsDecimal: number | null;
  fieldSize: number | null;
};

export type BacktestSelection = {
  id: string;
  definitionId: string;
  selectedReason: string;
  features: HistoricalPreRaceFeatureRow;
  derived: BacktestDerivedFeatureValues;
  outcome: HistoricalPostRaceOutcome;
  settlement: BacktestSettlement | null;
};

export type BacktestSettlement = {
  settled: boolean;
  settlementOddsDecimal: number;
  stake: number;
  grossReturn: number;
  profitLoss: number;
};

export type BacktestMissingDataAudit = {
  noPriorSpeedRating: number;
  noCurrentOr: number;
  noUsableOdds: number;
  insufficientHistoricalRuns: number;
  unavailableOrWithheldSpeedRating: number;
  missingSettlementOutcome: number;
};

export type BacktestBaseline = {
  totalEligibleRunners: number;
  settledRunners: number;
  totalWinners: number;
  strikeRate: number | null;
  averageSettlementOdds: number | null;
};

export type BacktestOddsBandSummary = BacktestSummary & {
  band: string;
};

export type BacktestSummary = {
  totalEligibleRunners: number;
  selections: number;
  settledSelections: number;
  wins: number;
  winStrikeRate: number | null;
  places: number;
  placeStrikeRate: number | null;
  averageOdds: number | null;
  totalStakes: number;
  grossReturn: number;
  profitLoss: number;
  roiPercentage: number | null;
  maxConsecutiveLosers: number;
};

export type BacktestResult = {
  definition: BacktestDefinition;
  startDate: string;
  endDate: string;
  calculationVersions: string[];
  selectedRunners: BacktestSelection[];
  summary: BacktestSummary;
  baseline: BacktestBaseline;
  oddsBands: BacktestOddsBandSummary[];
  missingData: BacktestMissingDataAudit;
  warnings: string[];
  performance: {
    targetRunnerIds: number;
    featureRows: number;
    elapsedMs: number;
    heapUsedMb: number | null;
  };
};

export type BacktestRunMode = "live" | "cache";

export type BacktestSetResult = {
  mode: BacktestRunMode;
  cacheDirectory: string | null;
  results: BacktestResult[];
};

export const FIXED_BACKTEST_PRESETS: BacktestDefinition[] = [
  {
    id: "latest-speed-gte-or",
    name: "Latest Speed >= OR",
    relativeSpeed: { latestSpeedMinusOR: { min: 0 } },
  },
  {
    id: "latest-speed-gte-or-plus-5",
    name: "Latest Speed >= OR + 5",
    relativeSpeed: { latestSpeedMinusOR: { min: 5 } },
  },
  {
    id: "latest-speed-gte-or-plus-10",
    name: "Latest Speed >= OR + 10",
    relativeSpeed: { latestSpeedMinusOR: { min: 10 } },
  },
  {
    id: "best-l3-gte-or",
    name: "Best L3 >= OR",
    relativeSpeed: { bestL3SpeedMinusOR: { min: 0 } },
  },
  {
    id: "latest-performance-gte-or",
    name: "Latest Performance >= OR",
    relativeSpeed: { latestPerformanceMinusOR: { min: 0 } },
  },
  {
    id: "latest-performance-gte-or-plus-5",
    name: "Latest Performance >= OR + 5",
    relativeSpeed: { latestPerformanceMinusOR: { min: 5 } },
  },
  {
    id: "best-performance-l3-gte-or",
    name: "Best L3 Performance >= OR",
    relativeSpeed: { bestPerformanceL3MinusOR: { min: 0 } },
  },
  {
    id: "latest-todays-rating-gte-or",
    name: "Latest Today's Rating >= OR",
    relativeSpeed: { latestTodaysRatingMinusOR: { min: 0 } },
  },
  {
    id: "latest-todays-rating-gte-or-plus-5",
    name: "Latest Today's Rating >= OR + 5",
    relativeSpeed: { latestTodaysRatingMinusOR: { min: 5 } },
  },
  {
    id: "best-todays-rating-l3-gte-or",
    name: "Best L3 Today's Rating >= OR",
    relativeSpeed: { bestTodaysRatingL3MinusOR: { min: 0 } },
  },
  {
    id: "best-l3-gte-or-plus-10",
    name: "Best L3 >= OR + 10",
    relativeSpeed: { bestL3SpeedMinusOR: { min: 10 } },
  },
  {
    id: "latest-gt-previous-speed",
    name: "Latest Speed > Previous Speed",
    relativeSpeed: { latestMinusPreviousSpeed: { min: Number.MIN_VALUE } },
  },
  {
    id: "latest-within-5-of-best-l3",
    name: "Latest Speed within 5 of Best L3",
    relativeSpeed: { latestMinusBestL3: { min: -5, max: 0 } },
  },
  {
    id: "latest-speed-or-plus-5-odds-2-to-12",
    name: "Latest Speed >= OR + 5 and pre-race odds 2.0-12.0",
    relativeSpeed: { latestSpeedMinusOR: { min: 5 } },
    odds: { preRaceDecimal: { min: 2, max: 12 } },
  },
];

export const ODDS_BANDS = [
  { label: "<2.0", min: undefined, max: 1.999999 },
  { label: "2.0-2.99", min: 2, max: 2.999999 },
  { label: "3.0-4.99", min: 3, max: 4.999999 },
  { label: "5.0-7.99", min: 5, max: 7.999999 },
  { label: "8.0-11.99", min: 8, max: 11.999999 },
  { label: "12.0+", min: 12, max: undefined },
] as const;

const DEFAULT_SOURCE = "sporting_life";
const DEFAULT_BATCH_SIZE = 250;

export async function runHistoricalBacktest(input: {
  db: Db;
  startDate: string;
  endDate: string;
  definition: BacktestDefinition;
  source?: string;
  batchSize?: number;
}): Promise<BacktestResult> {
  const startedAt = performance.now();
  const source = input.source ?? DEFAULT_SOURCE;
  const targetRunnerIds = await loadTargetRunnerIds(input.db, {
    source,
    startDate: input.startDate,
    endDate: input.endDate,
  });
  const rows: HistoricalTargetRunnerMetricsRow[] = [];
  for (const chunk of chunks(targetRunnerIds, input.batchSize ?? DEFAULT_BATCH_SIZE)) {
    rows.push(
      ...(await getHistoricalTargetRunnerMetrics(input.db, {
        source,
        targetRunnerIds: chunk,
      })),
    );
  }

  const result = evaluateBacktestRows({
    rows,
    definition: input.definition,
    startDate: input.startDate,
    endDate: input.endDate,
    targetRunnerIds: targetRunnerIds.length,
    elapsedMs: performance.now() - startedAt,
  });

  return result;
}

export async function runHistoricalBacktestSet(input: {
  db: Db;
  startDate: string;
  endDate: string;
  definitions: BacktestDefinition[];
  source?: string;
  batchSize?: number;
}): Promise<BacktestResult[]> {
  const startedAt = performance.now();
  const source = input.source ?? DEFAULT_SOURCE;
  const targetRunnerIds = await loadTargetRunnerIds(input.db, {
    source,
    startDate: input.startDate,
    endDate: input.endDate,
  });
  const rows: HistoricalTargetRunnerMetricsRow[] = [];
  for (const chunk of chunks(targetRunnerIds, input.batchSize ?? DEFAULT_BATCH_SIZE)) {
    rows.push(
      ...(await getHistoricalTargetRunnerMetrics(input.db, {
        source,
        targetRunnerIds: chunk,
      })),
    );
  }
  const elapsedMs = performance.now() - startedAt;

  return input.definitions.map((definition) =>
    evaluateBacktestRows({
      rows,
      definition,
      startDate: input.startDate,
      endDate: input.endDate,
      targetRunnerIds: targetRunnerIds.length,
      elapsedMs,
    }),
  );
}

export async function runHistoricalBacktestSetWithCache(input: {
  db: Db;
  startDate: string;
  endDate: string;
  family: BacktestCacheFamily;
  definitions: BacktestDefinition[];
  source?: string;
  batchSize?: number;
  cache?: boolean;
  cacheDir?: string;
}): Promise<BacktestSetResult> {
  if (input.cache !== false) {
    const cached = await loadBacktestFeatureCache({
      from: input.startDate,
      to: input.endDate,
      family: input.family,
      source: input.source,
      outputDir: input.cacheDir,
    });
    if (cached) {
      const startedAt = performance.now();
      return {
        mode: "cache",
        cacheDirectory: cached.directory,
        results: evaluateBacktestRowSet({
          rows: cached.rows,
          definitions: input.definitions,
          startDate: input.startDate,
          endDate: input.endDate,
          targetRunnerIds: cached.rows.length,
          elapsedMs: performance.now() - startedAt,
        }),
      };
    }
  }

  return {
    mode: "live",
    cacheDirectory: null,
    results: await runHistoricalBacktestSet(input),
  };
}

export function evaluateBacktestRowSet(input: {
  rows: HistoricalTargetRunnerMetricsRow[];
  definitions: BacktestDefinition[];
  startDate: string;
  endDate: string;
  targetRunnerIds?: number;
  elapsedMs?: number;
}): BacktestResult[] {
  return input.definitions.map((definition) =>
    evaluateBacktestRows({
      rows: input.rows,
      definition,
      startDate: input.startDate,
      endDate: input.endDate,
      targetRunnerIds: input.targetRunnerIds,
      elapsedMs: input.elapsedMs,
    }),
  );
}

export function evaluateBacktestRows(input: {
  rows: HistoricalTargetRunnerMetricsRow[];
  definition: BacktestDefinition;
  startDate: string;
  endDate: string;
  targetRunnerIds?: number;
  elapsedMs?: number;
}): BacktestResult {
  const warnings = [
    "Selection filters use feature rows only; outcomes are joined after selection.",
    "Pre-race odds are unavailable in the current historical feature layer, so odds filters only match rows with a genuine feature odds value.",
    "Settlement uses race_runners.starting_price_decimal from result data.",
    "Dead-heat payout fractions are not reconstructed; dead heats are scored from stored finishing_position only.",
  ];
  const basePopulation = input.rows
    .filter((row) => row.features.raceDate >= input.startDate)
    .filter((row) => row.features.raceDate <= input.endDate)
    .filter((row) => matchesRaceFilters(row.features, input.definition));
  const selected = basePopulation
    .filter((row) => matchesDefinition(row.features, input.definition))
    .map((row) => toSelection(row, input.definition));
  const selectedRunners = selected.sort(compareSelections);
  const summary = summarizeSelections(selectedRunners);
  const baseline = summarizeBaseline(basePopulation);

  return {
    definition: input.definition,
    startDate: input.startDate,
    endDate: input.endDate,
    calculationVersions: calculationVersions(input.rows),
    selectedRunners,
    summary,
    baseline,
    oddsBands: summarizeOddsBands(selectedRunners),
    missingData: missingDataAudit(basePopulation, input.definition),
    warnings,
    performance: {
      targetRunnerIds: input.targetRunnerIds ?? input.rows.length,
      featureRows: input.rows.length,
      elapsedMs: input.elapsedMs ?? 0,
      heapUsedMb: heapUsedMb(),
    },
  };
}

export function matchesDefinition(
  features: HistoricalPreRaceFeatureRow,
  definition: BacktestDefinition,
): boolean {
  const derived = deriveBacktestFeatureValues(features);
  return matchesRaceFilters(features, definition) &&
    matchesRunnerFilters(features, definition) &&
    matchesSpeedFilters(features, definition) &&
    matchesRelativeSpeedFilters(derived, definition) &&
    matchesOddsFilters(derived, definition);
}

export function deriveBacktestFeatureValues(
  features: HistoricalPreRaceFeatureRow,
): BacktestDerivedFeatureValues {
  return {
    latestSpeedMinusOR: difference(features.latestSpeedRating, features.officialRating),
    bestL3SpeedMinusOR: difference(features.bestSpeedLast3, features.officialRating),
    latestMinusPreviousSpeed: difference(
      features.latestSpeedRating,
      features.previousSpeedRating,
    ),
    latestMinusBestL3: difference(features.latestSpeedRating, features.bestSpeedLast3),
    latestPerformanceMinusOR: difference(
      features.latestPerformanceRating,
      features.officialRating,
    ),
    bestPerformanceL3MinusOR: difference(
      features.bestPerformanceLast3,
      features.officialRating,
    ),
    latestPerformanceMinusPreviousPerformance: difference(
      features.latestPerformanceRating,
      features.previousPerformanceRating,
    ),
    latestTodaysRatingMinusOR: difference(
      features.latestTodaysRating,
      features.officialRating,
    ),
    bestTodaysRatingL3MinusOR: difference(
      features.bestTodaysRatingLast3,
      features.officialRating,
    ),
    latestTodaysMinusPreviousTodays: difference(
      features.latestTodaysRating,
      features.previousTodaysRating,
    ),
    preRaceOddsDecimal: parseDecimal(features.oddsDecimal),
    fieldSize: features.actualRunnerCount ?? features.declaredRunnerCount,
  };
}

export function settleSelection(
  outcome: HistoricalPostRaceOutcome,
): BacktestSettlement | null {
  if (outcome.resultStatus === "non_runner") {
    return null;
  }
  const settlementOddsDecimal = parseDecimal(outcome.startingPriceDecimal);
  if (
    outcome.finishingPosition === null ||
    outcome.won === null ||
    settlementOddsDecimal === null
  ) {
    return null;
  }
  const stake = 1;
  const grossReturn = outcome.won ? settlementOddsDecimal : 0;
  return {
    settled: true,
    settlementOddsDecimal,
    stake,
    grossReturn,
    profitLoss: grossReturn - stake,
  };
}

export function summarizeSelections(
  selections: BacktestSelection[],
): BacktestSummary {
  const settled = selections.filter((selection) => selection.settlement !== null);
  const wins = settled.filter((selection) => selection.outcome.won).length;
  const places = settled.filter((selection) => selection.outcome.placed).length;
  const totalStakes = settled.reduce(
    (total, selection) => total + (selection.settlement?.stake ?? 0),
    0,
  );
  const grossReturn = settled.reduce(
    (total, selection) => total + (selection.settlement?.grossReturn ?? 0),
    0,
  );
  const profitLoss = grossReturn - totalStakes;
  const odds = settled
    .map((selection) => selection.settlement?.settlementOddsDecimal ?? null)
    .filter((value): value is number => value !== null);

  return {
    totalEligibleRunners: selections.length,
    selections: selections.length,
    settledSelections: settled.length,
    wins,
    winStrikeRate: percentage(wins, settled.length),
    places,
    placeStrikeRate: percentage(places, settled.length),
    averageOdds: average(odds),
    totalStakes,
    grossReturn,
    profitLoss,
    roiPercentage: percentage(profitLoss, totalStakes),
    maxConsecutiveLosers: maxConsecutiveLosers(settled),
  };
}

export function oddsBandFor(decimalOdds: number | null): string {
  if (decimalOdds === null) {
    return "missing";
  }
  const band = ODDS_BANDS.find(
    (candidate) =>
      (candidate.min === undefined || decimalOdds >= candidate.min) &&
      (candidate.max === undefined || decimalOdds <= candidate.max),
  );
  return band?.label ?? "missing";
}

async function loadTargetRunnerIds(
  db: Db,
  input: {
    source: string;
    startDate: string;
    endDate: string;
  },
): Promise<string[]> {
  const rows = await db
    .select({ runnerId: raceRunners.id })
    .from(raceRunners)
    .innerJoin(races, eq(raceRunners.raceId, races.id))
    .where(
      and(
        eq(raceRunners.source, input.source),
        eq(races.source, input.source),
        gte(races.raceDate, input.startDate),
        lte(races.raceDate, input.endDate),
      ),
    )
    .orderBy(asc(races.raceDate), asc(races.scheduledTime), asc(raceRunners.id));
  return rows.map((row) => row.runnerId);
}

function matchesRaceFilters(
  features: HistoricalPreRaceFeatureRow,
  definition: BacktestDefinition,
): boolean {
  const race = definition.race;
  if (!race) {
    return true;
  }
  if (race.segments?.length) {
    const segment = segmentFor(features.raceCode);
    if (segment === null || !race.segments.includes(segment)) {
      return false;
    }
  }
  if (race.courseIds?.length && !race.courseIds.includes(features.courseId)) {
    return false;
  }
  if (race.courseNames?.length && !race.courseNames.includes(features.courseName)) {
    return false;
  }
  if (race.raceClasses?.length && !race.raceClasses.includes(features.raceClass ?? "")) {
    return false;
  }
  const derived = deriveBacktestFeatureValues(features);
  return rangeMatches(features.distanceYards, race.distanceYards) &&
    rangeMatches(derived.fieldSize, race.fieldSize);
}

function matchesRunnerFilters(
  features: HistoricalPreRaceFeatureRow,
  definition: BacktestDefinition,
): boolean {
  const runner = definition.runner;
  if (!runner) {
    return true;
  }
  return rangeMatches(features.horseAge, runner.age) &&
    rangeMatches(features.officialRating, runner.officialRating) &&
    rangeMatches(features.weightCarriedLbs, runner.weightCarriedLbs) &&
    rangeMatches(features.daysSinceLastRun, runner.daysSinceRun) &&
    rangeMatches(features.priorRuns, runner.priorRuns);
}

function matchesSpeedFilters(
  features: HistoricalPreRaceFeatureRow,
  definition: BacktestDefinition,
): boolean {
  const speed = definition.speed;
  if (!speed) {
    return true;
  }
  return rangeMatches(features.latestSpeedRating, speed.latestSpeedRating) &&
    rangeMatches(features.previousSpeedRating, speed.previousSpeedRating) &&
    rangeMatches(features.bestSpeedLast3, speed.bestSpeedLast3) &&
    rangeMatches(features.bestSpeedLast5, speed.bestSpeedLast5) &&
    rangeMatches(features.averageSpeedLast3, speed.averageSpeedLast3) &&
    rangeMatches(features.averageSpeedLast5, speed.averageSpeedLast5) &&
    rangeMatches(features.latestPerformanceRating, speed.latestPerformanceRating) &&
    rangeMatches(features.previousPerformanceRating, speed.previousPerformanceRating) &&
    rangeMatches(features.bestPerformanceLast3, speed.bestPerformanceLast3) &&
    rangeMatches(features.bestPerformanceLast5, speed.bestPerformanceLast5) &&
    rangeMatches(features.averagePerformanceLast3, speed.averagePerformanceLast3) &&
    rangeMatches(features.averagePerformanceLast5, speed.averagePerformanceLast5) &&
    rangeMatches(features.latestTodaysRating, speed.latestTodaysRating) &&
    rangeMatches(features.previousTodaysRating, speed.previousTodaysRating) &&
    rangeMatches(features.bestTodaysRatingLast3, speed.bestTodaysRatingLast3) &&
    rangeMatches(features.bestTodaysRatingLast5, speed.bestTodaysRatingLast5) &&
    rangeMatches(features.averageTodaysRatingLast3, speed.averageTodaysRatingLast3) &&
    rangeMatches(features.averageTodaysRatingLast5, speed.averageTodaysRatingLast5);
}

function matchesRelativeSpeedFilters(
  derived: BacktestDerivedFeatureValues,
  definition: BacktestDefinition,
): boolean {
  const relative = definition.relativeSpeed;
  if (!relative) {
    return true;
  }
  return rangeMatches(derived.latestSpeedMinusOR, relative.latestSpeedMinusOR) &&
    rangeMatches(derived.bestL3SpeedMinusOR, relative.bestL3SpeedMinusOR) &&
    rangeMatches(
      derived.latestMinusPreviousSpeed,
      relative.latestMinusPreviousSpeed,
    ) &&
    rangeMatches(derived.latestMinusBestL3, relative.latestMinusBestL3) &&
    rangeMatches(
      derived.latestPerformanceMinusOR,
      relative.latestPerformanceMinusOR,
    ) &&
    rangeMatches(
      derived.bestPerformanceL3MinusOR,
      relative.bestPerformanceL3MinusOR,
    ) &&
    rangeMatches(
      derived.latestPerformanceMinusPreviousPerformance,
      relative.latestPerformanceMinusPreviousPerformance,
    ) &&
    rangeMatches(
      derived.latestTodaysRatingMinusOR,
      relative.latestTodaysRatingMinusOR,
    ) &&
    rangeMatches(
      derived.bestTodaysRatingL3MinusOR,
      relative.bestTodaysRatingL3MinusOR,
    ) &&
    rangeMatches(
      derived.latestTodaysMinusPreviousTodays,
      relative.latestTodaysMinusPreviousTodays,
    );
}

function matchesOddsFilters(
  derived: BacktestDerivedFeatureValues,
  definition: BacktestDefinition,
): boolean {
  return rangeMatches(
    derived.preRaceOddsDecimal,
    definition.odds?.preRaceDecimal,
  );
}

function toSelection(
  row: HistoricalTargetRunnerMetricsRow,
  definition: BacktestDefinition,
): BacktestSelection {
  const derived = deriveBacktestFeatureValues(row.features);
  return {
    id: row.features.targetRunnerId,
    definitionId: definition.id,
    selectedReason: definition.name,
    features: row.features,
    derived,
    outcome: row.outcome,
    settlement: settleSelection(row.outcome),
  };
}

function summarizeBaseline(
  rows: HistoricalTargetRunnerMetricsRow[],
): BacktestBaseline {
  const settled = rows
    .map((row) => ({ row, settlement: settleSelection(row.outcome) }))
    .filter((row): row is { row: HistoricalTargetRunnerMetricsRow; settlement: BacktestSettlement } =>
      row.settlement !== null,
    );
  const totalWinners = settled.filter(({ row }) => row.outcome.won).length;
  return {
    totalEligibleRunners: rows.length,
    settledRunners: settled.length,
    totalWinners,
    strikeRate: percentage(totalWinners, settled.length),
    averageSettlementOdds: average(
      settled.map(({ settlement }) => settlement.settlementOddsDecimal),
    ),
  };
}

function summarizeOddsBands(
  selections: BacktestSelection[],
): BacktestOddsBandSummary[] {
  const groups = new Map<string, BacktestSelection[]>();
  for (const selection of selections) {
    const label = oddsBandFor(selection.derived.preRaceOddsDecimal);
    groups.set(label, [...(groups.get(label) ?? []), selection]);
  }
  return ["<2.0", "2.0-2.99", "3.0-4.99", "5.0-7.99", "8.0-11.99", "12.0+", "missing"]
    .map((band) => ({ band, ...summarizeSelections(groups.get(band) ?? []) }));
}

function missingDataAudit(
  rows: HistoricalTargetRunnerMetricsRow[],
  definition: BacktestDefinition,
): BacktestMissingDataAudit {
  const minPriorRuns = definition.runner?.priorRuns?.min ?? 1;
  return {
    noPriorSpeedRating: rows.filter((row) => row.features.latestSpeedRating === null).length,
    noCurrentOr: rows.filter((row) => row.features.officialRating === null).length,
    noUsableOdds: rows.filter(
      (row) => deriveBacktestFeatureValues(row.features).preRaceOddsDecimal === null,
    ).length,
    insufficientHistoricalRuns: rows.filter(
      (row) => row.features.priorRuns < minPriorRuns,
    ).length,
    unavailableOrWithheldSpeedRating: rows.filter(
      (row) =>
        row.features.priorRuns > 0 &&
        row.features.latestSpeedRating === null,
    ).length,
    missingSettlementOutcome: rows.filter(
      (row) => settleSelection(row.outcome) === null,
    ).length,
  };
}

function calculationVersions(rows: HistoricalTargetRunnerMetricsRow[]): string[] {
  return [
    ...new Set(
      rows
        .flatMap((row) => [
          row.features.speedCalculationVersion,
          row.features.latestPerformanceCalculationVersion,
          row.features.todaysRatingCalculationVersion,
        ])
        .filter((value): value is string => value !== null),
    ),
  ].sort();
}

function segmentFor(raceCode: HistoricalRaceCode): BacktestRaceSegment | null {
  if (raceCode === "jump") {
    return "jump";
  }
  if (raceCode === "aw") {
    return "all_weather_flat";
  }
  if (raceCode === "turf") {
    return "turf_flat";
  }
  return null;
}

function rangeMatches(value: number | null, range: NumericRange | undefined): boolean {
  if (!range) {
    return true;
  }
  if (value === null || !Number.isFinite(value)) {
    return false;
  }
  return (range.min === undefined || value >= range.min) &&
    (range.max === undefined || value <= range.max);
}

function difference(left: number | null, right: number | null): number | null {
  return left === null || right === null ? null : left - right;
}

function parseDecimal(value: string | null): number | null {
  if (value === null) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function percentage(count: number, total: number): number | null {
  return total === 0 ? null : (count / total) * 100;
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function maxConsecutiveLosers(selections: BacktestSelection[]): number {
  const raceSelections = new Map<string, BacktestSelection[]>();
  for (const selection of selections) {
    raceSelections.set(selection.features.targetRaceId, [
      ...(raceSelections.get(selection.features.targetRaceId) ?? []),
      selection,
    ]);
  }

  let current = 0;
  let max = 0;
  const races = [...raceSelections.values()].sort((left, right) =>
    compareSelections(left[0], right[0]),
  );
  for (const race of races) {
    const settled = race.filter((selection) => selection.settlement !== null);
    if (settled.length === 0) {
      continue;
    }
    if (settled.some((selection) => selection.outcome.won)) {
      current = 0;
      continue;
    }
    current += 1;
    max = Math.max(max, current);
  }
  return max;
}

function compareSelections(left: BacktestSelection, right: BacktestSelection): number {
  return left.features.raceDateTime.getTime() - right.features.raceDateTime.getTime() ||
    left.features.courseName.localeCompare(right.features.courseName) ||
    left.features.targetRaceId.localeCompare(right.features.targetRaceId) ||
    left.features.targetRunnerId.localeCompare(right.features.targetRunnerId);
}

function heapUsedMb(): number | null {
  if (typeof process === "undefined") {
    return null;
  }
  return Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 10) / 10;
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}
