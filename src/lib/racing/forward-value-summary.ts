import {
  EDGE_BANDS,
  FORWARD_VALUE_PRICE_SNAPSHOT_SCHEDULE_VERSION,
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
import type { SportingLifeCurrentPrice } from "./todays-racing";
import { currentPositiveTurfTissueRankOneEdges, type TissueForwardData, type TissueForwardRace, type TissueForwardRunner } from "./tissue-forward";
import { cleanAwTissueRace, currentPositiveAwTissueRankOneEdges, type AwTissueForwardData, type AwTissueRace } from "./aw-tissue-forward";
import { cleanJumpTissueRace, currentPositiveJumpTissueRankOneEdges, type JumpTissueForwardData, type JumpTissueRace } from "./jump-tissue-forward";
import { formatPositiveTissueRankOneEdgeLine, LARGE_PROBABILITY_GAP_PP, type TissueRankOneEdge } from "./tissue-rank-one-edge";

export { LARGE_PROBABILITY_GAP_PP };

export type ForwardValueObservationState = "all" | "settled" | "unsettled" | "excluded" | "superseded";
export type ForwardValueEdgeFilter = "all" | "positive" | "non_positive";
export type ForwardValueReportingStatus =
  | "current"
  | "superseded_race_version"
  | "ordinary_historical_observation";

export type ForwardValueReportingScope = {
  rawRecords: ForwardValueRecord[];
  analyticalRecords: ForwardValueRecord[];
  supersededRecords: ForwardValueRecord[];
  statusByRaceId: ReadonlyMap<string, ForwardValueReportingStatus>;
};

export type DailyPositiveTissueRankOneSummaryInput = {
  date: string;
  turf: TissueForwardData;
  jump: JumpTissueForwardData;
  aw: AwTissueForwardData;
  currentPrices: SportingLifeCurrentPrice[];
  currentRaceIds?: ReadonlySet<string>;
};

export function renderDailyPositiveTissueRankOneSummary(input: DailyPositiveTissueRankOneSummaryInput): string {
  const families = dailyPositiveTissueRankOneFamilies(input);
  const lines = ["Today's positive-edge Tissue rank-1 horses", ""];
  for (const family of families) {
    lines.push(family.heading);
    if (family.selections.length === 0) {
      lines.push("None", "");
      continue;
    }
    for (const selection of family.selections) {
      lines.push(`${selection.displayTime} ${selection.course} - ${selection.horseName}`);
      lines.push(formatPositiveTissueRankOneEdgeLine({
        tissueProbability: selection.tissueProbability,
        marketPrice: selection.comparison.price.marketPrice!,
        edge: selection.comparison.edge,
        bookmakerQuoteCount: selection.comparison.price.bookmakerQuoteCount,
      }));
      lines.push("");
    }
  }
  const turf = families[0]!.selections.length;
  const jump = families[1]!.selections.length;
  const aw = families[2]!.selections.length;
  const total = turf + jump + aw;
  const large = families.reduce((sum, family) => sum + family.selections.filter((selection) => selection.comparison.edge * 100 >= LARGE_PROBABILITY_GAP_PP - 1e-9).length, 0);
  lines.push("Daily positive-edge rank-1 summary:");
  lines.push(`Turf ${turf} | Jump ${jump} | AW ${aw} | Total ${total}`);
  lines.push(`Large edges >=${LARGE_PROBABILITY_GAP_PP}pp: ${large}`);
  lines.push("");
  lines.push("Monitoring only; not a betting recommendation.");
  return lines.join("\n").trimEnd();
}

function dailyPositiveTissueRankOneFamilies(input: DailyPositiveTissueRankOneSummaryInput) {
  const turfRaces = input.turf.races
    .filter((race) => race.raceDate === input.date && race.recordedPreRace === true && (!input.currentRaceIds || input.currentRaceIds.has(race.raceId)))
    .sort((left, right) => turfDisplayTime(left, input.currentPrices).localeCompare(turfDisplayTime(right, input.currentPrices)) || left.course.localeCompare(right.course));
  const jumpRaces = input.jump.races
    .filter((race) => race.raceDate === input.date && race.recordedPreRace && cleanJumpTissueRace(race))
    .sort((left, right) => left.currentOffAt.localeCompare(right.currentOffAt) || left.course.localeCompare(right.course));
  const awRaces = input.aw.races
    .filter((race) => race.raceDate === input.date && race.recordedPreRace && cleanAwTissueRace(race))
    .sort((left, right) => left.currentOffAt.localeCompare(right.currentOffAt) || left.course.localeCompare(right.course));
  return [
    {
      heading: "TURF",
      selections: currentPositiveTurfTissueRankOneEdges(turfRaces, input.currentPrices).selections.map(({ race, runner, comparison }) => ({
        displayTime: turfDisplayTime(race, input.currentPrices),
        course: race.course,
        horseName: runner.horseName,
        tissueProbability: runner.probability,
        comparison,
      })),
    },
    {
      heading: "JUMP",
      selections: currentPositiveJumpTissueRankOneEdges(jumpRaces, input.currentPrices).selections.map(({ race, runner, comparison }) => ({
        displayTime: comparison.price.displayRaceTime || race.scheduledTime.slice(0, 5),
        course: race.course,
        horseName: runner.horseName,
        tissueProbability: runner.probability!,
        comparison,
      })),
    },
    {
      heading: "ALL WEATHER",
      selections: currentPositiveAwTissueRankOneEdges(awRaces, input.currentPrices).selections.map(({ race, runner, comparison }) => ({
        displayTime: comparison.price.displayRaceTime || race.scheduledTime.slice(0, 5),
        course: race.course,
        horseName: runner.horseName,
        tissueProbability: runner.probability!,
        comparison,
      })),
    },
  ] satisfies Array<{ heading: string; selections: DailyPositiveTissueRankOneSelection[] }>;
}

type DailyPositiveTissueRankOneSelection = {
  displayTime: string;
  course: string;
  horseName: string;
  tissueProbability: number;
  comparison: TissueRankOneEdge;
};

function turfDisplayTime(race: TissueForwardRace, currentPrices: SportingLifeCurrentPrice[]): string {
  return currentPrices.find((entry) => entry.raceId === race.raceId)?.displayRaceTime ?? race.raceTime;
}

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
  medianMarketProfitLoss: number | null;
  medianMarketRoi: number | null;
  medianMarketSettled: number;
  bestBookmakerProfitLoss: number | null;
  bestBookmakerRoi: number | null;
  bestBookmakerSettled: number;
  legacyForecastProfitLoss: number | null;
  legacyForecastRoi: number | null;
  legacyForecastSettled: number;
  finalSpProfitLoss: number | null;
  finalSpRoi: number | null;
  finalSpSettled: number;
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

export type TurfModelAgreementSummary = {
  comparableRaces: number;
  tprTissueAgree: number;
  disagree: number;
  bothPositiveEdge: number;
  bothPositiveSameHorse: number;
  bothPositiveDifferentHorses: number;
  tprPositiveOnly: number;
  tissuePositiveOnly: number;
  neitherPositive: number;
  largeDisagreements: number;
};

export type TurfDisagreementClassification =
  | "same_horse_similar_probability"
  | "same_horse_materially_different_probability"
  | "different_horses_tpr_positive_only"
  | "different_horses_tissue_positive_only"
  | "different_horses_both_positive"
  | "different_horses_neither_positive";

export type TurfModelHorseDiagnostic = {
  runnerId: string | null;
  horseName: string;
  tprProbability: number | null;
  tissueProbability: number | null;
  tprRank: number | null;
  tissueRank: number | null;
  tprScore: number | null;
  tprGap: number | null;
  officialRating: number | null;
  latestSpeed: number | null;
  bestSpeed: number | null;
  averageSpeed: number | null;
  latestPerformance: number | null;
  bestPerformance: number | null;
  averagePerformance: number | null;
  trainerStrikeRate: number | null;
  jockeyStrikeRate: number | null;
  capturedPrice: string | null;
  capturedDecimalOdds: number | null;
  marketImpliedProbability: number | null;
  edgePercentagePoints: number | null;
  commentFeatures: string[];
  finalSp: number | null;
  won: boolean | null;
};

export type TurfModelDisagreementDiagnostic = {
  race: ForwardValueRecord;
  classification: TurfDisagreementClassification;
  largeDifference: boolean;
  probabilityDifferencePercentagePoints: number;
  edgeDifferencePercentagePoints: number | null;
  sameHorse: boolean;
  tprPositive: boolean;
  tissuePositive: boolean;
  fieldSize: number | null;
  tprHorse: TurfModelHorseDiagnostic;
  tissueHorse: TurfModelHorseDiagnostic;
  contributionNote: string;
  outcome: {
    tprWon: boolean | null;
    tissueWon: boolean | null;
    neitherWon: boolean | null;
    tprFinalSp: number | null;
    tissueFinalSp: number | null;
    tprPriceMovement: number | null;
    tissuePriceMovement: number | null;
  };
};

export type ForwardValueSnapshotMetrics = {
  observations: number;
  meanEdgePercentagePoints: number | null;
  positiveEdgeProportion: number | null;
};

export type ForwardValueMovementMetrics = {
  observations: number;
  meanMovement: number | null;
  medianMovement: number | null;
  shorteningProportion: number | null;
  driftingProportion: number | null;
  unchangedProportion: number | null;
};

export type ForwardValuePersistenceMetrics = {
  sourcePositiveObservations: number;
  comparableObservations: number;
  stillPositive: ForwardValueOutcomeMetrics;
  turnedNonPositive: ForwardValueOutcomeMetrics;
};

export type ForwardValueOutcomeMetrics = {
  observations: number;
  settledObservations: number;
  wins: number;
  strikeRate: number | null;
};

export type ForwardValuePriceDiagnostics = {
  newSchedule: {
    scheduleVersion: typeof FORWARD_VALUE_PRICE_SNAPSHOT_SCHEDULE_VERSION;
    records: number;
    snapshots: {
      early: ForwardValueSnapshotMetrics;
      t180: ForwardValueSnapshotMetrics;
      t60: ForwardValueSnapshotMetrics;
    };
    movements: {
      earlyToT180: ForwardValueMovementMetrics;
      t180ToT60: ForwardValueMovementMetrics;
      t60ToFinalSp: ForwardValueMovementMetrics;
      earlyToFinalSp: ForwardValueMovementMetrics;
    };
    persistence: {
      earlyToT180: ForwardValuePersistenceMetrics;
      earlyToT60: ForwardValuePersistenceMetrics;
      t180ToT60: ForwardValuePersistenceMetrics;
    };
  };
  legacy: {
    records: number;
    snapshots: {
      early: ForwardValueSnapshotMetrics;
      t60: ForwardValueSnapshotMetrics;
      t15: ForwardValueSnapshotMetrics;
    };
    movements: {
      earlyToT60: ForwardValueMovementMetrics;
      t60ToT15: ForwardValueMovementMetrics;
      t15ToFinalSp: ForwardValueMovementMetrics;
      earlyToFinalSp: ForwardValueMovementMetrics;
    };
    persistence: {
      earlyToT60: ForwardValuePersistenceMetrics;
      earlyToT15: ForwardValuePersistenceMetrics;
      t60ToT15: ForwardValuePersistenceMetrics;
    };
  };
};

export type ForwardValueSummary = {
  rawObservations: number;
  totalProspectiveObservations: number;
  cleanSettledObservations: number;
  unsettledObservations: number;
  excludedObservations: number;
  supersededRaceVersions: number;
  earliestObservationDate: string | null;
  latestObservationDate: string | null;
  sparseSampleWarning: boolean;
  exclusionCounts: Partial<Record<ValueExclusionReason, number>>;
  turfModelAgreement: TurfModelAgreementSummary;
  families: ForwardValueFamilySummary[];
};

export type SameLeaderProbabilityGapInput = {
  raceId: string;
  family: ValueFamily;
  modelRunnerId: string | null;
  tissueRunnerId: string | null;
  modelProbability: number | null;
  tissueProbability: number | null;
  marketImpliedProbability: number | null;
  primaryEdgePercentagePoints: number | null;
  tissueEdgePercentagePoints: number | null;
  leaderWon: boolean | null;
  settledAt: string | null;
  cleanProspective: boolean;
  recordedPreRace: boolean;
};

export type SameLeaderProbabilityGapObservation = SameLeaderProbabilityGapInput & {
  probabilityGapPp: number;
  largeProbabilityDisagreement: boolean;
  direction: "tissue_higher" | "primary_higher";
  marketPosition: "below_both" | "between_models" | "above_both" | "missing";
  edgeDirection: "primary_negative_tissue_positive" | "primary_positive_tissue_negative" | "both_positive" | "both_negative" | "missing";
};

export type SameLeaderProbabilityGapFamilySummary = {
  family: ValueFamily;
  label: string;
  sameLeaderComparableRaces: number;
  largeProbabilityDisagreements: number;
  largeProbabilityDisagreementRate: number | null;
};

export type SameLeaderProbabilityGapOutcomeSummary = {
  races: number;
  winners: number;
  strikeRate: number | null;
  meanModelProbability: number | null;
  meanTissueProbability: number | null;
  meanMarketImpliedProbability: number | null;
  meanAbsoluteProbabilityGapPp: number | null;
};

export type SameLeaderProbabilityGapDiagnostics = {
  families: SameLeaderProbabilityGapFamilySummary[];
  largeGapObservations: SameLeaderProbabilityGapObservation[];
  outcome: SameLeaderProbabilityGapOutcomeSummary;
  direction: Record<"tissue_higher" | "primary_higher", SameLeaderProbabilityGapOutcomeSummary>;
  marketPosition: Record<"below_both" | "between_models" | "above_both", SameLeaderProbabilityGapOutcomeSummary>;
  edgeDirection: Record<"primary_negative_tissue_positive" | "primary_positive_tissue_negative" | "both_positive" | "both_negative", number>;
};

export type ForwardValueObservationFilters = {
  family: ValueFamily | "all";
  state: ForwardValueObservationState;
  edge: ForwardValueEdgeFilter;
};

export function buildForwardValueReportingScope(
  records: ForwardValueRecord[],
  reconciliation: {
    currentReplacementRaceIds: ReadonlySet<string>;
    supersededRaceIds: ReadonlySet<string>;
  },
): ForwardValueReportingScope {
  const statusByRaceId = new Map<string, ForwardValueReportingStatus>();
  for (const record of records) {
    const status = reconciliation.supersededRaceIds.has(record.raceId)
      ? "superseded_race_version"
      : reconciliation.currentReplacementRaceIds.has(record.raceId)
        ? "current"
        : "ordinary_historical_observation";
    statusByRaceId.set(record.raceId, status);
  }
  const supersededRecords = records.filter((record) =>
    statusByRaceId.get(record.raceId) === "superseded_race_version"
  );
  return {
    rawRecords: records,
    analyticalRecords: records.filter((record) =>
      statusByRaceId.get(record.raceId) !== "superseded_race_version"
    ),
    supersededRecords,
    statusByRaceId,
  };
}

export function summarizeForwardValue(
  data: ForwardValueData,
  reportingScope?: ForwardValueReportingScope,
): ForwardValueSummary {
  const records = reportingScope?.analyticalRecords ?? data.races;
  const prospective = records.filter(isProspectiveObservation);
  const settled = prospective.filter(isCleanSettledPhase2Observation);
  const unsettled = prospective.filter((race) => isCleanPhase2Observation(race) && race.settledAt === null);
  const excluded = records.filter((race) => valueExclusionReason(race) !== null);
  const dates = prospective.map((race) => race.raceDate).sort();
  const exclusionCounts: Partial<Record<ValueExclusionReason, number>> = {};
  for (const race of excluded) {
    const reason = valueExclusionReason(race)!;
    exclusionCounts[reason] = (exclusionCounts[reason] ?? 0) + 1;
  }
  return {
    rawObservations: data.races.length,
    totalProspectiveObservations: prospective.length,
    cleanSettledObservations: settled.length,
    unsettledObservations: unsettled.length,
    excludedObservations: excluded.length,
    supersededRaceVersions: reportingScope?.supersededRecords.length ?? 0,
    earliestObservationDate: dates[0] ?? null,
    latestObservationDate: dates.at(-1) ?? null,
    sparseSampleWarning: settled.length < 25,
    exclusionCounts,
    turfModelAgreement: summarizeTurfModelAgreement(records),
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
        priceDiagnostics: summarizeForwardValuePriceDiagnostics(familyProspective),
      };
    }),
  };
}

export function summarizeTurfModelAgreement(records: ForwardValueRecord[]): TurfModelAgreementSummary {
  const comparable = records.filter((record) =>
    record.family === "turf" &&
    isProspectiveObservation(record) &&
    record.tissueAgreesWithTpr !== null &&
    record.edgePercentagePoints !== null &&
    record.tissueEdgePercentagePoints != null
  );
  const summary: TurfModelAgreementSummary = {
    comparableRaces: comparable.length,
    tprTissueAgree: 0,
    disagree: 0,
    bothPositiveEdge: 0,
    bothPositiveSameHorse: 0,
    bothPositiveDifferentHorses: 0,
    tprPositiveOnly: 0,
    tissuePositiveOnly: 0,
    neitherPositive: 0,
    largeDisagreements: 0,
  };
  for (const race of comparable) {
    if (race.tissueAgreesWithTpr) summary.tprTissueAgree += 1;
    else summary.disagree += 1;
    const tprPositive = race.edgePercentagePoints! > 0;
    const tissuePositive = race.tissueEdgePercentagePoints! > 0;
    if (tprPositive && tissuePositive) {
      summary.bothPositiveEdge += 1;
      if (race.tissueAgreesWithTpr) summary.bothPositiveSameHorse += 1;
      else summary.bothPositiveDifferentHorses += 1;
    }
    else if (tprPositive) summary.tprPositiveOnly += 1;
    else if (tissuePositive) summary.tissuePositiveOnly += 1;
    else summary.neitherPositive += 1;
    if (turfModelDisagreementLargeDifference(race)) summary.largeDisagreements += 1;
  }
  return summary;
}

export function buildSameLeaderProbabilityGapDiagnostics(
  records: ForwardValueRecord[],
  sources: { jump?: JumpTissueForwardData; aw?: AwTissueForwardData } = {},
): SameLeaderProbabilityGapDiagnostics {
  const observations = [
    ...records.flatMap(turfSameLeaderProbabilityGapInput),
    ...trackerSameLeaderProbabilityGapInputs(records, sources.jump?.races ?? [], "jump"),
    ...trackerSameLeaderProbabilityGapInputs(records, sources.aw?.races ?? [], "aw"),
  ].flatMap((input): SameLeaderProbabilityGapObservation[] => {
    if (
      !input.cleanProspective ||
      !input.recordedPreRace ||
      input.modelRunnerId === null ||
      input.tissueRunnerId === null ||
      input.modelRunnerId !== input.tissueRunnerId ||
      input.modelProbability === null ||
      input.tissueProbability === null
    ) return [];
    const probabilityGapPp = Math.abs(input.tissueProbability - input.modelProbability) * 100;
    const largeProbabilityDisagreement = probabilityGapPp >= LARGE_PROBABILITY_GAP_PP;
    return [{
      ...input,
      probabilityGapPp,
      largeProbabilityDisagreement,
      direction: input.tissueProbability >= input.modelProbability ? "tissue_higher" : "primary_higher",
      marketPosition: probabilityGapMarketPosition(input),
      edgeDirection: probabilityGapEdgeDirection(input),
    }];
  });
  const largeGapObservations = observations.filter((observation) => observation.largeProbabilityDisagreement);
  const families = (["turf", "jump", "aw"] as ValueFamily[]).map((family) => {
    const sameFamily = observations.filter((observation) => observation.family === family);
    const large = sameFamily.filter((observation) => observation.largeProbabilityDisagreement);
    return {
      family,
      label: `${forwardValueFamilyLabel(family)} / ${family === "turf" ? "Turf" : family === "jump" ? "Jump" : "AW"} Tissue`,
      sameLeaderComparableRaces: sameFamily.length,
      largeProbabilityDisagreements: large.length,
      largeProbabilityDisagreementRate: rate(large.length, sameFamily.length),
    };
  });
  return {
    families,
    largeGapObservations,
    outcome: summarizeProbabilityGapOutcomes(largeGapObservations.filter(isSettledCleanProbabilityGap)),
    direction: {
      tissue_higher: summarizeProbabilityGapOutcomes(largeGapObservations.filter((observation) =>
        observation.direction === "tissue_higher" && isSettledCleanProbabilityGap(observation)
      )),
      primary_higher: summarizeProbabilityGapOutcomes(largeGapObservations.filter((observation) =>
        observation.direction === "primary_higher" && isSettledCleanProbabilityGap(observation)
      )),
    },
    marketPosition: {
      below_both: summarizeProbabilityGapOutcomes(largeGapObservations.filter((observation) =>
        observation.marketPosition === "below_both" && isSettledCleanProbabilityGap(observation)
      )),
      between_models: summarizeProbabilityGapOutcomes(largeGapObservations.filter((observation) =>
        observation.marketPosition === "between_models" && isSettledCleanProbabilityGap(observation)
      )),
      above_both: summarizeProbabilityGapOutcomes(largeGapObservations.filter((observation) =>
        observation.marketPosition === "above_both" && isSettledCleanProbabilityGap(observation)
      )),
    },
    edgeDirection: {
      primary_negative_tissue_positive: largeGapObservations.filter((observation) => observation.edgeDirection === "primary_negative_tissue_positive").length,
      primary_positive_tissue_negative: largeGapObservations.filter((observation) => observation.edgeDirection === "primary_positive_tissue_negative").length,
      both_positive: largeGapObservations.filter((observation) => observation.edgeDirection === "both_positive").length,
      both_negative: largeGapObservations.filter((observation) => observation.edgeDirection === "both_negative").length,
    },
  };
}

export function sameLeaderProbabilityGapPp(input: {
  agreesWithModel: boolean | null;
  modelProbability: number | null;
  tissueProbability: number | null;
  recordedPreRace?: boolean | null;
}): number | null {
  if (input.agreesWithModel !== true || input.modelProbability === null || input.tissueProbability === null || input.recordedPreRace === false) return null;
  return Math.abs(input.tissueProbability - input.modelProbability) * 100;
}

function turfSameLeaderProbabilityGapInput(record: ForwardValueRecord): SameLeaderProbabilityGapInput[] {
  if (record.family !== "turf") return [];
  return [{
    raceId: record.raceId,
    family: record.family,
    modelRunnerId: record.leaderRunnerId,
    tissueRunnerId: record.tissueRunnerId,
    modelProbability: record.calibratedProbability,
    tissueProbability: record.tissueProbability,
    marketImpliedProbability: record.capturedMarketProbability,
    primaryEdgePercentagePoints: record.edgePercentagePoints,
    tissueEdgePercentagePoints: record.tissueEdgePercentagePoints ?? null,
    leaderWon: record.leaderWon,
    settledAt: record.settledAt,
    cleanProspective: isCleanPhase2Observation(record),
    recordedPreRace: record.recordedPreRace,
  }];
}

function trackerSameLeaderProbabilityGapInputs(
  records: ForwardValueRecord[],
  races: readonly (JumpTissueRace | AwTissueRace)[],
  family: "jump" | "aw",
): SameLeaderProbabilityGapInput[] {
  const byId = new Map(records.filter((record) => record.family === family).map((record) => [record.raceId, record]));
  return races.flatMap((race) => {
    const record = byId.get(race.raceId);
    if (!record) return [];
    const clean = family === "jump" ? cleanJumpTissueRace(race as JumpTissueRace) : cleanAwTissueRace(race as AwTissueRace);
    const leaderRunnerId = race.top1;
    const leader = leaderRunnerId ? race.runners.find((runner) => runner.runnerId === leaderRunnerId) : null;
    const snapshot = race.prices.t60 ?? race.prices.t180 ?? race.prices.early;
    return [{
      raceId: record.raceId,
      family,
      modelRunnerId: record.leaderRunnerId,
      tissueRunnerId: leaderRunnerId,
      modelProbability: record.calibratedProbability,
      tissueProbability: leader?.probability ?? null,
      marketImpliedProbability: record.capturedMarketProbability,
      primaryEdgePercentagePoints: record.edgePercentagePoints,
      tissueEdgePercentagePoints: snapshot?.ratingEdgePercentagePoints ?? null,
      leaderWon: record.leaderWon,
      settledAt: record.settledAt,
      cleanProspective: clean && isCleanPhase2Observation(record),
      recordedPreRace: race.recordedPreRace,
    }];
  });
}

function probabilityGapMarketPosition(input: SameLeaderProbabilityGapInput): SameLeaderProbabilityGapObservation["marketPosition"] {
  if (input.marketImpliedProbability === null || input.modelProbability === null || input.tissueProbability === null) return "missing";
  const lower = Math.min(input.modelProbability, input.tissueProbability);
  const upper = Math.max(input.modelProbability, input.tissueProbability);
  if (input.marketImpliedProbability < lower) return "below_both";
  if (input.marketImpliedProbability > upper) return "above_both";
  return "between_models";
}

function probabilityGapEdgeDirection(input: SameLeaderProbabilityGapInput): SameLeaderProbabilityGapObservation["edgeDirection"] {
  if (input.primaryEdgePercentagePoints === null || input.tissueEdgePercentagePoints === null) return "missing";
  const primaryPositive = input.primaryEdgePercentagePoints > 0;
  const tissuePositive = input.tissueEdgePercentagePoints > 0;
  if (!primaryPositive && tissuePositive) return "primary_negative_tissue_positive";
  if (primaryPositive && !tissuePositive) return "primary_positive_tissue_negative";
  if (primaryPositive && tissuePositive) return "both_positive";
  return "both_negative";
}

function isSettledCleanProbabilityGap(observation: SameLeaderProbabilityGapObservation): boolean {
  return observation.cleanProspective && observation.settledAt !== null && observation.leaderWon !== null;
}

function summarizeProbabilityGapOutcomes(
  observations: SameLeaderProbabilityGapObservation[],
): SameLeaderProbabilityGapOutcomeSummary {
  const winners = observations.filter((observation) => observation.leaderWon).length;
  return {
    races: observations.length,
    winners,
    strikeRate: rate(winners, observations.length),
    meanModelProbability: average(observations.map((observation) => observation.modelProbability!)),
    meanTissueProbability: average(observations.map((observation) => observation.tissueProbability!)),
    meanMarketImpliedProbability: average(observations.flatMap((observation) =>
      observation.marketImpliedProbability === null ? [] : [observation.marketImpliedProbability]
    )),
    meanAbsoluteProbabilityGapPp: average(observations.map((observation) => observation.probabilityGapPp)),
  };
}

export function turfModelDisagreementClassification(record: ForwardValueRecord): TurfDisagreementClassification | null {
  if (
    record.family !== "turf" ||
    !isProspectiveObservation(record) ||
    record.tissueAgreesWithTpr === null ||
    record.tissueProbability === null ||
    record.edgePercentagePoints === null ||
    record.tissueEdgePercentagePoints == null
  ) return null;
  const probabilityDifference = Math.abs(record.calibratedProbability - record.tissueProbability) * 100;
  if (record.tissueAgreesWithTpr) {
    return probabilityDifference >= 10
      ? "same_horse_materially_different_probability"
      : "same_horse_similar_probability";
  }
  const tprPositive = record.edgePercentagePoints > 0;
  const tissuePositive = record.tissueEdgePercentagePoints > 0;
  if (tprPositive && tissuePositive) return "different_horses_both_positive";
  if (tprPositive) return "different_horses_tpr_positive_only";
  if (tissuePositive) return "different_horses_tissue_positive_only";
  return "different_horses_neither_positive";
}

export function turfModelDisagreementLargeDifference(record: ForwardValueRecord): boolean {
  if (
    record.tissueAgreesWithTpr === null ||
    record.tissueProbability === null ||
    record.edgePercentagePoints === null ||
    record.tissueEdgePercentagePoints == null
  ) return false;
  if (record.tissueAgreesWithTpr) {
    return Math.abs(record.calibratedProbability - record.tissueProbability) * 100 >= 10;
  }
  return Math.abs(record.edgePercentagePoints - record.tissueEdgePercentagePoints) >= 10;
}

export function buildTurfModelDisagreementDiagnostics(
  records: ForwardValueRecord[],
  tissueData?: TissueForwardData,
): TurfModelDisagreementDiagnostic[] {
  const tissueByRaceId = new Map((tissueData?.races ?? []).map((race) => [race.raceId, race]));
  return records.flatMap((race) => {
    const classification = turfModelDisagreementClassification(race);
    if (!classification || race.tissueRunnerId === null || race.tissueHorseName === null || race.tissueProbability === null) return [];
    const tissueRace = tissueByRaceId.get(race.raceId) ?? null;
    const tprTissueRunner = tissueRace?.runners.find((runner) => runner.runnerId === race.leaderRunnerId) ?? null;
    const tissueRunner = tissueRace?.runners.find((runner) => runner.runnerId === race.tissueRunnerId) ?? null;
    const sameHorse = race.tissueAgreesWithTpr === true;
    const tissueFinalSp = tissueRunner?.finalSp ?? null;
    const tissueWon = tissueRunner?.finishingPosition === 1 ? true : tissueRunner?.finishingPosition === null || tissueRunner?.finishingPosition === undefined ? null : false;
    const tprWon = race.leaderWon;
    return [{
      race,
      classification,
      largeDifference: turfModelDisagreementLargeDifference(race),
      probabilityDifferencePercentagePoints: Math.abs(race.calibratedProbability - race.tissueProbability) * 100,
      edgeDifferencePercentagePoints: race.edgePercentagePoints === null || race.tissueEdgePercentagePoints == null
        ? null
        : Math.abs(race.edgePercentagePoints - race.tissueEdgePercentagePoints),
      sameHorse,
      tprPositive: (race.edgePercentagePoints ?? 0) > 0,
      tissuePositive: (race.tissueEdgePercentagePoints ?? 0) > 0,
      fieldSize: tissueRace?.runners.length ?? null,
      tprHorse: diagnosticHorse({
        model: "tpr",
        record: race,
        runnerId: race.leaderRunnerId,
        horseName: race.leaderHorseName,
        tissueRunner: tprTissueRunner,
      }),
      tissueHorse: diagnosticHorse({
        model: "tissue",
        record: race,
        runnerId: race.tissueRunnerId,
        horseName: race.tissueHorseName,
        tissueRunner,
      }),
      contributionNote: "Tissue v2 forward snapshots persist probabilities, ranks and comment feature flags; individual numeric inputs and fitted feature contributions are not persisted. Forward Value persists the TPR leader score, rank, gap and calibrated probability, but not the decomposed TPR component inputs.",
      outcome: {
        tprWon,
        tissueWon,
        neitherWon: tprWon === null && tissueWon === null ? null : tprWon !== true && tissueWon !== true,
        tprFinalSp: race.finalSp,
        tissueFinalSp,
        tprPriceMovement: forwardValuePriceMovement(forwardValuePriceSnapshot(race, "early"), race.finalSp),
        tissuePriceMovement: forwardValuePriceMovement(
          race.tissueCapturedDecimalOdds == null
            ? null
            : {
              decimalPrice: race.tissueCapturedDecimalOdds,
              impliedProbability: race.tissueMarketProbability ?? 1 / race.tissueCapturedDecimalOdds,
              capturedAt: race.tissuePriceCapturedAt ?? race.recordedAt,
              minutesBeforeScheduledOff: race.minutesBeforeScheduledOff ?? 0,
              ratingProbability: race.tissueProbability,
              ratingEdgePercentagePoints: race.tissueEdgePercentagePoints ?? 0,
            },
          tissueFinalSp,
        ),
      },
    }];
  }).sort((left, right) =>
    Number(right.largeDifference) - Number(left.largeDifference) ||
    right.race.recordedAt.localeCompare(left.race.recordedAt) ||
    right.probabilityDifferencePercentagePoints - left.probabilityDifferencePercentagePoints
  );
}

export function summarizeForwardValuePriceDiagnostics(records: ForwardValueRecord[]): ForwardValuePriceDiagnostics {
  const newSchedule = records.filter((record) =>
    record.priceSnapshotScheduleVersion === FORWARD_VALUE_PRICE_SNAPSHOT_SCHEDULE_VERSION
  );
  const legacy = records.filter((record) => !record.priceSnapshotScheduleVersion);
  return {
    newSchedule: {
      scheduleVersion: FORWARD_VALUE_PRICE_SNAPSHOT_SCHEDULE_VERSION,
      records: newSchedule.length,
      snapshots: {
        early: snapshotMetrics(newSchedule, "early"),
        t180: snapshotMetrics(newSchedule, "t180"),
        t60: snapshotMetrics(newSchedule, "t60"),
      },
      movements: {
        earlyToT180: movementMetrics(newSchedule, "early", "t180"),
        t180ToT60: movementMetrics(newSchedule, "t180", "t60"),
        t60ToFinalSp: finalMovementMetrics(newSchedule, "t60"),
        earlyToFinalSp: finalMovementMetrics(newSchedule, "early"),
      },
      persistence: {
        earlyToT180: persistenceMetrics(newSchedule, "early", "t180"),
        earlyToT60: persistenceMetrics(newSchedule, "early", "t60"),
        t180ToT60: persistenceMetrics(newSchedule, "t180", "t60"),
      },
    },
    legacy: {
      records: legacy.length,
      snapshots: {
        early: snapshotMetrics(legacy, "early"),
        t60: snapshotMetrics(legacy, "t60"),
        t15: snapshotMetrics(legacy, "t15"),
      },
      movements: {
        earlyToT60: movementMetrics(legacy, "early", "t60"),
        t60ToT15: movementMetrics(legacy, "t60", "t15"),
        t15ToFinalSp: finalMovementMetrics(legacy, "t15"),
        earlyToFinalSp: finalMovementMetrics(legacy, "early"),
      },
      persistence: {
        earlyToT60: persistenceMetrics(legacy, "early", "t60"),
        earlyToT15: persistenceMetrics(legacy, "early", "t15"),
        t60ToT15: persistenceMetrics(legacy, "t60", "t15"),
      },
    },
  };
}

export function summarizeForwardValueRecords(records: ForwardValueRecord[]): ForwardValueMetrics {
  const observations = records.length;
  const wins = records.filter((race) => race.leaderWon).length;
  const expectedWins = sum(records.map((race) => race.calibratedProbability));
  const profitLoss = observations ? sum(records.map((race) => capturedPriceProfitLoss(race)!)) : null;
  const medianMarketReturns = records.flatMap((race) => race.medianMarketPriceProfitLoss == null ? [] : [race.medianMarketPriceProfitLoss]);
  const bestBookmakerReturns = records.flatMap((race) => race.bestBookmakerPriceProfitLoss == null ? [] : [race.bestBookmakerPriceProfitLoss]);
  const legacyForecastReturns = records.flatMap((race) =>
    race.marketPriceBasisVersion === undefined && capturedPriceProfitLoss(race) !== null
      ? [capturedPriceProfitLoss(race)!]
      : []
  );
  const finalSpReturns = records.flatMap((race) => race.profitLoss == null ? [] : [race.profitLoss]);
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
    medianMarketProfitLoss: totalOrNull(medianMarketReturns),
    medianMarketRoi: rate(sum(medianMarketReturns), medianMarketReturns.length),
    medianMarketSettled: medianMarketReturns.length,
    bestBookmakerProfitLoss: totalOrNull(bestBookmakerReturns),
    bestBookmakerRoi: rate(sum(bestBookmakerReturns), bestBookmakerReturns.length),
    bestBookmakerSettled: bestBookmakerReturns.length,
    legacyForecastProfitLoss: totalOrNull(legacyForecastReturns),
    legacyForecastRoi: rate(sum(legacyForecastReturns), legacyForecastReturns.length),
    legacyForecastSettled: legacyForecastReturns.length,
    finalSpProfitLoss: totalOrNull(finalSpReturns),
    finalSpRoi: rate(sum(finalSpReturns), finalSpReturns.length),
    finalSpSettled: finalSpReturns.length,
    sampleStatus: valueSampleStatus(observations),
  };
}

export function filterForwardValueObservations(
  records: ForwardValueRecord[],
  filters: ForwardValueObservationFilters,
  reportingScope?: ForwardValueReportingScope,
): ForwardValueRecord[] {
  const candidates = filters.state === "superseded"
    ? reportingScope?.supersededRecords ?? []
    : reportingScope?.analyticalRecords ?? records;
  return candidates
    .filter((race) => filters.state === "superseded" || isProspectiveObservation(race))
    .filter((race) => filters.family === "all" || race.family === filters.family)
    .filter((race) => matchesState(race, filters.state))
    .filter((race) => matchesEdge(race, filters.edge))
    .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt) || right.raceDateTime.localeCompare(left.raceDateTime));
}

export function forwardValueObservationStatus(
  record: ForwardValueRecord,
  reportingStatus?: ForwardValueReportingStatus,
): string {
  if (reportingStatus === "superseded_race_version") return "Superseded race version";
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
  if (state === "superseded") return true;
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

function finalMovementMetrics(records: ForwardValueRecord[], fromStage: ForwardValuePriceStage): ForwardValueMovementMetrics {
  const movements = records.flatMap((record) => {
    const movement = forwardValuePriceMovement(forwardValuePriceSnapshot(record, fromStage), record.finalSp);
    return movement === null ? [] : [movement];
  });
  return summarizeMovements(movements);
}

function summarizeMovements(movements: number[]): ForwardValueMovementMetrics {
  return {
    observations: movements.length,
    meanMovement: average(movements),
    medianMovement: median(movements),
    shorteningProportion: rate(movements.filter((movement) => movement < 0).length, movements.length),
    driftingProportion: rate(movements.filter((movement) => movement > 0).length, movements.length),
    unchangedProportion: rate(movements.filter((movement) => movement === 0).length, movements.length),
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
  const settled = records.filter((record) => typeof record.leaderWon === "boolean");
  const wins = settled.filter((record) => record.leaderWon).length;
  return { observations: records.length, settledObservations: settled.length, wins, strikeRate: rate(wins, settled.length) };
}

function diagnosticHorse(input: {
  model: "tpr" | "tissue";
  record: ForwardValueRecord;
  runnerId: string | null;
  horseName: string;
  tissueRunner: TissueForwardRunner | null;
}): TurfModelHorseDiagnostic {
  const isTpr = input.model === "tpr";
  const hasTprPrice = input.record.capturedDecimalOdds != null && input.record.capturedMarketProbability != null;
  const hasTissuePrice = input.record.tissueCapturedDecimalOdds != null && input.record.tissueMarketProbability != null;
  return {
    runnerId: input.runnerId,
    horseName: input.horseName,
    tprProbability: isTpr ? input.record.calibratedProbability : null,
    tissueProbability: isTpr ? null : input.record.tissueProbability,
    tprRank: isTpr ? input.record.leaderRank : null,
    tissueRank: isTpr ? null : input.tissueRunner?.tissueRank ?? 1,
    tprScore: isTpr ? input.record.leaderScore : null,
    tprGap: isTpr ? input.record.leaderGap : null,
    officialRating: null,
    latestSpeed: null,
    bestSpeed: null,
    averageSpeed: null,
    latestPerformance: null,
    bestPerformance: null,
    averagePerformance: null,
    trainerStrikeRate: null,
    jockeyStrikeRate: null,
    capturedPrice: isTpr ? input.record.capturedPrice : input.record.tissueCapturedPrice ?? null,
    capturedDecimalOdds: isTpr ? input.record.capturedDecimalOdds : input.record.tissueCapturedDecimalOdds ?? null,
    marketImpliedProbability: isTpr ? input.record.capturedMarketProbability : input.record.tissueMarketProbability ?? null,
    edgePercentagePoints: isTpr
      ? hasTprPrice ? input.record.edgePercentagePoints : null
      : hasTissuePrice ? input.record.tissueEdgePercentagePoints ?? null : null,
    commentFeatures: isTpr ? [] : input.tissueRunner?.commentFeatures ?? [],
    finalSp: isTpr ? input.record.finalSp : input.tissueRunner?.finalSp ?? null,
    won: isTpr
      ? input.record.leaderWon
      : input.tissueRunner?.finishingPosition === 1 ? true : input.tissueRunner?.finishingPosition == null ? null : false,
  };
}

function sum(values: number[]) { return values.reduce((total, value) => total + value, 0); }
function totalOrNull(values: number[]) { return values.length ? sum(values) : null; }
function average(values: number[]) { return values.length ? sum(values) / values.length : null; }
function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}
function rate(numerator: number, denominator: number) { return denominator ? numerator / denominator : null; }
