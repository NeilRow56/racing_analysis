import {
  EDGE_BANDS,
  capturedPriceProfitLoss,
  edgeBand,
  forwardValuePriceMovement,
  forwardValuePriceSnapshot,
  isCleanPhase2Observation,
  isCleanSettledPhase2Observation,
  valueExclusionReason,
  valueSampleStatus,
  type EdgeBand,
  type ForwardValueData,
  type ForwardValueRecord,
  type ForwardValuePriceStage,
  type ValueExclusionReason,
  type ValueFamily,
  type ValueSampleStatus,
} from "./forward-value";

export type ForwardValueObservationState = "all" | "settled" | "unsettled" | "excluded";
export type ForwardValueEdgeFilter = "all" | "positive" | "non_positive";

export type ForwardValueMetrics = {
  observations: number;
  wins: number;
  strikeRate: number | null;
  expectedWinRate: number | null;
  expectedWins: number;
  actualMinusExpectedWins: number | null;
  averageCapturedDecimalPrice: number | null;
  averageMarketImpliedProbability: number | null;
  averageRatingEdgePercentagePoints: number | null;
  profitLoss: number | null;
  roi: number | null;
  sampleStatus: ValueSampleStatus;
};

export type ForwardValueFamilySummary = {
  family: ValueFamily;
  label: string;
  prospectiveObservations: number;
  cleanSettledObservations: number;
  metrics: ForwardValueMetrics;
  edgeBuckets: Array<ForwardValueMetrics & { band: EdgeBand }>;
  priceDiagnostics: ForwardValuePriceDiagnostics;
};

export type ForwardValueSnapshotMetrics = {
  observations: number;
  meanEdgePercentagePoints: number | null;
  positiveEdgeProportion: number | null;
};

export type ForwardValueMovementMetrics = {
  observations: number;
  meanMovement: number | null;
  shorteningProportion: number | null;
  driftingProportion: number | null;
};

export type ForwardValuePersistenceMetrics = {
  sourcePositiveObservations: number;
  comparableObservations: number;
  stillPositive: ForwardValueOutcomeMetrics;
  turnedNonPositive: ForwardValueOutcomeMetrics;
};

export type ForwardValueOutcomeMetrics = {
  observations: number;
  wins: number;
  strikeRate: number | null;
};

export type ForwardValuePriceDiagnostics = {
  snapshots: Record<ForwardValuePriceStage, ForwardValueSnapshotMetrics>;
  movements: {
    earlyToT60: ForwardValueMovementMetrics;
    t60ToT15: ForwardValueMovementMetrics;
    t15ToFinalSp: ForwardValueMovementMetrics;
  };
  persistence: {
    earlyToT60: ForwardValuePersistenceMetrics;
    earlyToT15: ForwardValuePersistenceMetrics;
    t60ToT15: ForwardValuePersistenceMetrics;
  };
};

export type ForwardValueSummary = {
  totalProspectiveObservations: number;
  cleanSettledObservations: number;
  unsettledObservations: number;
  excludedObservations: number;
  earliestObservationDate: string | null;
  latestObservationDate: string | null;
  sparseSampleWarning: boolean;
  exclusionCounts: Partial<Record<ValueExclusionReason, number>>;
  families: ForwardValueFamilySummary[];
};

export type ForwardValueObservationFilters = {
  family: ValueFamily | "all";
  state: ForwardValueObservationState;
  edge: ForwardValueEdgeFilter;
};

export function summarizeForwardValue(data: ForwardValueData): ForwardValueSummary {
  const prospective = data.races.filter(isProspectiveObservation);
  const settled = prospective.filter(isCleanSettledPhase2Observation);
  const unsettled = prospective.filter((race) => isCleanPhase2Observation(race) && race.settledAt === null);
  const excluded = data.races.filter((race) => valueExclusionReason(race) !== null);
  const dates = prospective.map((race) => race.raceDate).sort();
  const exclusionCounts: Partial<Record<ValueExclusionReason, number>> = {};
  for (const race of excluded) {
    const reason = valueExclusionReason(race)!;
    exclusionCounts[reason] = (exclusionCounts[reason] ?? 0) + 1;
  }
  return {
    totalProspectiveObservations: prospective.length,
    cleanSettledObservations: settled.length,
    unsettledObservations: unsettled.length,
    excludedObservations: excluded.length,
    earliestObservationDate: dates[0] ?? null,
    latestObservationDate: dates.at(-1) ?? null,
    sparseSampleWarning: settled.length < 25,
    exclusionCounts,
    families: (["turf", "jump", "aw"] as ValueFamily[]).map((family) => {
      const familyProspective = prospective.filter((race) => race.family === family);
      const cleanSettled = familyProspective.filter(isCleanSettledPhase2Observation);
      return {
        family,
        label: forwardValueFamilyLabel(family),
        prospectiveObservations: familyProspective.length,
        cleanSettledObservations: cleanSettled.length,
        metrics: summarizeForwardValueRecords(cleanSettled),
        edgeBuckets: EDGE_BANDS.map((band) => ({
          band,
          ...summarizeForwardValueRecords(cleanSettled.filter((race) =>
            race.edgePercentagePoints !== null && edgeBand(race.edgePercentagePoints) === band
          )),
        })),
        priceDiagnostics: summarizeForwardValuePriceDiagnostics(cleanSettled),
      };
    }),
  };
}

export function summarizeForwardValuePriceDiagnostics(records: ForwardValueRecord[]): ForwardValuePriceDiagnostics {
  return {
    snapshots: {
      early: snapshotMetrics(records, "early"),
      t60: snapshotMetrics(records, "t60"),
      t15: snapshotMetrics(records, "t15"),
    },
    movements: {
      earlyToT60: movementMetrics(records, "early", "t60"),
      t60ToT15: movementMetrics(records, "t60", "t15"),
      t15ToFinalSp: finalMovementMetrics(records),
    },
    persistence: {
      earlyToT60: persistenceMetrics(records, "early", "t60"),
      earlyToT15: persistenceMetrics(records, "early", "t15"),
      t60ToT15: persistenceMetrics(records, "t60", "t15"),
    },
  };
}

export function summarizeForwardValueRecords(records: ForwardValueRecord[]): ForwardValueMetrics {
  const observations = records.length;
  const wins = records.filter((race) => race.leaderWon).length;
  const expectedWins = sum(records.map((race) => race.calibratedProbability));
  const profitLoss = observations ? sum(records.map((race) => capturedPriceProfitLoss(race)!)) : null;
  return {
    observations,
    wins,
    strikeRate: rate(wins, observations),
    expectedWinRate: average(records.map((race) => race.calibratedProbability)),
    expectedWins,
    actualMinusExpectedWins: observations ? wins - expectedWins : null,
    averageCapturedDecimalPrice: average(records.map((race) => race.capturedDecimalOdds!)),
    averageMarketImpliedProbability: average(records.map((race) => race.capturedMarketProbability!)),
    averageRatingEdgePercentagePoints: average(records.map((race) => race.edgePercentagePoints!)),
    profitLoss,
    roi: profitLoss === null ? null : rate(profitLoss, observations),
    sampleStatus: valueSampleStatus(observations),
  };
}

export function filterForwardValueObservations(
  records: ForwardValueRecord[],
  filters: ForwardValueObservationFilters,
): ForwardValueRecord[] {
  return records
    .filter(isProspectiveObservation)
    .filter((race) => filters.family === "all" || race.family === filters.family)
    .filter((race) => matchesState(race, filters.state))
    .filter((race) => matchesEdge(race, filters.edge))
    .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt) || right.raceDateTime.localeCompare(left.raceDateTime));
}

export function forwardValueObservationStatus(record: ForwardValueRecord): string {
  const exclusion = valueExclusionReason(record);
  if (exclusion) return `Excluded: ${exclusion}`;
  if (record.settledAt === null) return "Unsettled";
  return record.leaderWon ? "Won" : "Lost";
}

export function isProspectiveObservation(record: ForwardValueRecord): boolean {
  const exclusion = valueExclusionReason(record);
  return exclusion !== "captured_after_off" && exclusion !== "retrospective_or_non_prospective";
}

export function forwardValueFamilyLabel(family: ValueFamily): string {
  return family === "turf" ? "TPR" : family === "jump" ? "JPR-A" : "AW-D";
}

function matchesState(record: ForwardValueRecord, state: ForwardValueObservationState) {
  if (state === "all") return true;
  if (state === "excluded") return valueExclusionReason(record) !== null;
  if (state === "settled") return isCleanSettledPhase2Observation(record);
  return isCleanPhase2Observation(record) && record.settledAt === null;
}

function matchesEdge(record: ForwardValueRecord, edge: ForwardValueEdgeFilter) {
  if (edge === "all") return true;
  if (record.edgePercentagePoints === null) return false;
  return edge === "positive" ? record.edgePercentagePoints > 0 : record.edgePercentagePoints <= 0;
}

function snapshotMetrics(records: ForwardValueRecord[], stage: ForwardValuePriceStage): ForwardValueSnapshotMetrics {
  const snapshots = records.flatMap((record) => {
    const snapshot = forwardValuePriceSnapshot(record, stage);
    return snapshot ? [snapshot] : [];
  });
  return {
    observations: snapshots.length,
    meanEdgePercentagePoints: average(snapshots.map((snapshot) => snapshot.ratingEdgePercentagePoints)),
    positiveEdgeProportion: rate(snapshots.filter((snapshot) => snapshot.ratingEdgePercentagePoints > 0).length, snapshots.length),
  };
}

function movementMetrics(
  records: ForwardValueRecord[],
  fromStage: ForwardValuePriceStage,
  toStage: ForwardValuePriceStage,
): ForwardValueMovementMetrics {
  const movements = records.flatMap((record) => {
    const from = forwardValuePriceSnapshot(record, fromStage);
    const to = forwardValuePriceSnapshot(record, toStage);
    const movement = forwardValuePriceMovement(from, to?.decimalPrice ?? null);
    return movement === null ? [] : [movement];
  });
  return summarizeMovements(movements);
}

function finalMovementMetrics(records: ForwardValueRecord[]): ForwardValueMovementMetrics {
  const movements = records.flatMap((record) => {
    const movement = forwardValuePriceMovement(forwardValuePriceSnapshot(record, "t15"), record.finalSp);
    return movement === null ? [] : [movement];
  });
  return summarizeMovements(movements);
}

function summarizeMovements(movements: number[]): ForwardValueMovementMetrics {
  return {
    observations: movements.length,
    meanMovement: average(movements),
    shorteningProportion: rate(movements.filter((movement) => movement < 0).length, movements.length),
    driftingProportion: rate(movements.filter((movement) => movement > 0).length, movements.length),
  };
}

function persistenceMetrics(
  records: ForwardValueRecord[],
  sourceStage: ForwardValuePriceStage,
  targetStage: ForwardValuePriceStage,
): ForwardValuePersistenceMetrics {
  const sourcePositive = records.filter((record) =>
    (forwardValuePriceSnapshot(record, sourceStage)?.ratingEdgePercentagePoints ?? 0) > 0
  );
  const comparable = sourcePositive.filter((record) => forwardValuePriceSnapshot(record, targetStage) !== null);
  const stillPositive = comparable.filter((record) =>
    forwardValuePriceSnapshot(record, targetStage)!.ratingEdgePercentagePoints > 0
  );
  const turnedNonPositive = comparable.filter((record) =>
    forwardValuePriceSnapshot(record, targetStage)!.ratingEdgePercentagePoints <= 0
  );
  return {
    sourcePositiveObservations: sourcePositive.length,
    comparableObservations: comparable.length,
    stillPositive: outcomeMetrics(stillPositive),
    turnedNonPositive: outcomeMetrics(turnedNonPositive),
  };
}

function outcomeMetrics(records: ForwardValueRecord[]): ForwardValueOutcomeMetrics {
  const wins = records.filter((record) => record.leaderWon).length;
  return { observations: records.length, wins, strikeRate: rate(wins, records.length) };
}

function sum(values: number[]) { return values.reduce((total, value) => total + value, 0); }
function average(values: number[]) { return values.length ? sum(values) / values.length : null; }
function rate(numerator: number, denominator: number) { return denominator ? numerator / denominator : null; }
