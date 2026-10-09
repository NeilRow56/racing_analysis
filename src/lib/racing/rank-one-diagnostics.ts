import { isCleanSettledPhase2Observation, type ForwardValueData } from "./forward-value";
import { cleanAwTissueRace, type AwTissueForwardData } from "./aw-tissue-forward";
import { cleanJumpTissueRace, type JumpTissueForwardData } from "./jump-tissue-forward";
import type { TissueForwardData, TissueForwardRace, TissueForwardRunner } from "./tissue-forward";

export type RankOneModelFamily = "Turf" | "Jump" | "All Weather";

export type RankOneDiagnosticSelection = {
  family: RankOneModelFamily;
  model: string;
  raceId: string;
  raceDate: string;
  course: string;
  raceTime: string;
  horseName: string;
  runnerId: string;
  won: boolean;
  finalSp: number;
  marketImpliedProbability: number;
  modelProbability: number | null;
  probabilityGap: number | null;
  ratingGap: number | null;
  independentAgreements: number;
};

export type PriceBandId =
  | "odds_on"
  | "evens_to_lt_2_1"
  | "2_1_to_lt_4_1"
  | "4_1_to_lt_8_1"
  | "8_1_plus";

export type ShortPriceBandId =
  | "lt_evens"
  | "evens_to_lt_6_4"
  | "6_4_to_lt_2_1"
  | "gte_2_1";

export type ConfidenceBand = "high" | "medium" | "low";

export type RankOneBandSummary = {
  band: string;
  selections: number;
  winners: number;
  strike: number | null;
  marketImpliedWinRate: number | null;
  modelPredictedWinRate: number | null;
  actualMinusMarketExpectation: number | null;
  actualMinusModelExpectation: number | null;
};

export type ShortPriceConfidenceSummary = RankOneBandSummary & {
  priceBand: string;
  confidence: ConfidenceBand;
};

export type RankOneModelAudit = {
  family: RankOneModelFamily;
  model: string;
  selections: number;
  winners: number;
  strike: number | null;
  priceBands: RankOneBandSummary[];
  shortPriceConfidence: ShortPriceConfidenceSummary[];
};

const PRICE_BANDS: Array<{ id: PriceBandId; label: string; includes: (decimalSp: number) => boolean }> = [
  { id: "odds_on", label: "odds-on", includes: (decimalSp) => decimalSp < 2 },
  { id: "evens_to_lt_2_1", label: "evens to <2/1", includes: (decimalSp) => decimalSp >= 2 && decimalSp < 3 },
  { id: "2_1_to_lt_4_1", label: "2/1 to <4/1", includes: (decimalSp) => decimalSp >= 3 && decimalSp < 5 },
  { id: "4_1_to_lt_8_1", label: "4/1 to <8/1", includes: (decimalSp) => decimalSp >= 5 && decimalSp < 9 },
  { id: "8_1_plus", label: "8/1+", includes: (decimalSp) => decimalSp >= 9 },
];

const SHORT_PRICE_BANDS: Array<{ id: ShortPriceBandId; label: string; includes: (decimalSp: number) => boolean }> = [
  { id: "lt_evens", label: "< Evens", includes: (decimalSp) => decimalSp < 2 },
  { id: "evens_to_lt_6_4", label: "Evens to <6/4", includes: (decimalSp) => decimalSp >= 2 && decimalSp < 2.5 },
  { id: "6_4_to_lt_2_1", label: "6/4 to <2/1", includes: (decimalSp) => decimalSp >= 2.5 && decimalSp < 3 },
  { id: "gte_2_1", label: ">=2/1", includes: (decimalSp) => decimalSp >= 3 },
];

export function auditRankOneSelections(
  selections: RankOneDiagnosticSelection[],
): RankOneModelAudit[] {
  return [...groupBy(selections, (selection) => `${selection.family}|${selection.model}`)]
    .map(([, rows]) => ({
      family: rows[0]!.family,
      model: rows[0]!.model,
      selections: rows.length,
      winners: rows.filter((selection) => selection.won).length,
      strike: rate(rows.filter((selection) => selection.won).length, rows.length),
      priceBands: PRICE_BANDS.map((band) => summarizeBand(
        band.label,
        rows.filter((selection) => band.includes(selection.finalSp)),
      )),
      shortPriceConfidence: SHORT_PRICE_BANDS.flatMap((priceBand) =>
        (["high", "medium", "low"] as ConfidenceBand[]).map((confidence) => ({
          priceBand: priceBand.label,
          confidence,
          ...summarizeBand(
            `${priceBand.label} / ${confidence}`,
            rows.filter((selection) =>
              priceBand.includes(selection.finalSp) &&
              confidenceBand(selection) === confidence
            ),
          ),
        }))
      ),
    }))
    .sort((left, right) => left.family.localeCompare(right.family) || left.model.localeCompare(right.model));
}

export function confidenceBand(selection: RankOneDiagnosticSelection): ConfidenceBand {
  const probability = selection.modelProbability;
  const probabilityGap = selection.probabilityGap;
  const ratingGap = selection.ratingGap;
  const agreements = selection.independentAgreements;
  const strongProbability = probability !== null && probability >= 0.3;
  const veryStrongProbability = probability !== null && probability >= 0.38;
  const strongGap = probabilityGap !== null
    ? probabilityGap >= 0.08
    : ratingGap !== null && ratingGap >= 10;
  const usableGap = probabilityGap !== null
    ? probabilityGap >= 0.04
    : ratingGap !== null && ratingGap >= 4;

  if (veryStrongProbability || strongGap || (strongProbability && agreements >= 1)) return "high";
  if ((probability !== null && probability >= 0.2) || usableGap || agreements >= 1) return "medium";
  return "low";
}

export function forwardValueRankOneSelections(data: ForwardValueData): RankOneDiagnosticSelection[] {
  return data.races
    .filter(isCleanSettledPhase2Observation)
    .filter((record) => record.finalSp !== null && typeof record.leaderWon === "boolean")
    .map((record) => ({
      family: record.family === "turf" ? "Turf" : record.family === "jump" ? "Jump" : "All Weather",
      model: record.family === "turf" ? "TPR_S2_V1" : record.family === "jump" ? "JPR-A" : "AW-D",
      raceId: record.raceId,
      raceDate: record.raceDate,
      course: record.course,
      raceTime: record.raceTime,
      horseName: record.leaderHorseName,
      runnerId: record.leaderRunnerId,
      won: record.leaderWon!,
      finalSp: record.finalSp!,
      marketImpliedProbability: 1 / record.finalSp!,
      modelProbability: record.calibratedProbability,
      probabilityGap: null,
      ratingGap: record.leaderGap,
      independentAgreements: Number(record.tissueAgreesWithTpr === true || record.agreesWithMarketFavourite === true),
    }));
}

export function turfTissueRankOneSelections(
  data: TissueForwardData,
  model = data.tissueModelVersion,
): RankOneDiagnosticSelection[] {
  return data.races.flatMap((race) => {
    if (race.recordedPreRace !== true || race.winners.length === 0) return [];
    const leader = race.runners.find((runner) => runner.tissueRank === 1);
    if (!leader?.finalSp) return [];
    const sorted = rankedTissueRunners(race);
    return [{
      family: "Turf",
      model,
      raceId: race.raceId,
      raceDate: race.raceDate,
      course: race.course,
      raceTime: race.raceTime,
      horseName: leader.horseName,
      runnerId: leader.runnerId,
      won: race.winners.some((winner) => sameHorse(winner, leader.horseName)),
      finalSp: leader.finalSp,
      marketImpliedProbability: 1 / leader.finalSp,
      modelProbability: leader.probability,
      probabilityGap: probabilityGap(sorted, leader.runnerId),
      ratingGap: null,
      independentAgreements: 0,
    }];
  });
}

export function jumpTissueRankOneSelections(data: JumpTissueForwardData): RankOneDiagnosticSelection[] {
  return data.races.flatMap((race) => {
    if (!cleanJumpTissueRace(race) || race.settledAt === null || race.top1 === null) return [];
    const leader = race.runners.find((runner) => runner.runnerId === race.top1);
    if (!leader?.outcome?.finalSp || typeof leader.outcome.won !== "boolean") return [];
    const sorted = race.runners
      .filter((runner) => runner.rank !== null && runner.probability !== null)
      .sort((left, right) => left.rank! - right.rank!);
    return [{
      family: "Jump",
      model: "JUMP_TISSUE_V1",
      raceId: race.raceId,
      raceDate: race.raceDate,
      course: race.course,
      raceTime: race.scheduledTime.slice(0, 5),
      horseName: leader.horseName,
      runnerId: leader.runnerId,
      won: leader.outcome.won,
      finalSp: leader.outcome.finalSp,
      marketImpliedProbability: 1 / leader.outcome.finalSp,
      modelProbability: leader.probability,
      probabilityGap: probabilityGap(sorted, leader.runnerId),
      ratingGap: null,
      independentAgreements: Number(race.jprALeader === race.top1) + Number(race.jprBLeader === race.top1),
    }];
  });
}

export function awTissueRankOneSelections(data: AwTissueForwardData): RankOneDiagnosticSelection[] {
  return data.races.flatMap((race) => {
    if (!cleanAwTissueRace(race) || race.settledAt === null || race.top1 === null) return [];
    const leader = race.runners.find((runner) => runner.runnerId === race.top1);
    if (!leader?.outcome?.finalSp || typeof leader.outcome.won !== "boolean") return [];
    const sorted = race.runners
      .filter((runner) => runner.rank !== null && runner.probability !== null)
      .sort((left, right) => left.rank! - right.rank!);
    return [{
      family: "All Weather",
      model: "AW_TISSUE_V1",
      raceId: race.raceId,
      raceDate: race.raceDate,
      course: race.course,
      raceTime: race.scheduledTime.slice(0, 5),
      horseName: leader.horseName,
      runnerId: leader.runnerId,
      won: leader.outcome.won,
      finalSp: leader.outcome.finalSp,
      marketImpliedProbability: 1 / leader.outcome.finalSp,
      modelProbability: leader.probability,
      probabilityGap: probabilityGap(sorted, leader.runnerId),
      ratingGap: null,
      independentAgreements: Number(race.awDLeader === race.top1) + Number(race.awALeader === race.top1),
    }];
  });
}

export function renderRankOneAudit(audits: RankOneModelAudit[]): string {
  const lines = [
    "# Rank-1 Failure Diagnostic",
    "",
    "Diagnostic only. Final SP is used after each model has already frozen rank 1; it is not a model input.",
    "Actual-minus-expectation columns are winner counts minus summed implied/model probabilities.",
    "",
  ];
  for (const audit of audits) {
    lines.push(`## ${audit.family} / ${audit.model}`, "");
    lines.push(`Selections: ${audit.selections} | winners: ${audit.winners} | strike: ${pct(audit.strike)}`, "");
    table(lines, [
      ["SP band", "Selections", "Winners", "Strike", "Market implied win rate", "Model predicted win rate", "Actual - market exp", "Actual - model exp"],
      ...audit.priceBands.map(summaryRow),
    ]);
    lines.push("", "Short-price confidence gate diagnostic", "");
    table(lines, [
      ["Market group / confidence", "Selections", "Winners", "Strike", "Market implied win rate", "Model predicted win rate", "Actual - market exp", "Actual - model exp"],
      ...audit.shortPriceConfidence
        .filter((row) => row.selections > 0)
        .map((row) => summaryRow({ ...row, band: `${row.priceBand} / ${row.confidence}` })),
    ]);
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

function rankedTissueRunners(race: TissueForwardRace): TissueForwardRunner[] {
  return [...race.runners].sort((left, right) =>
    left.tissueRank - right.tissueRank ||
    right.probability - left.probability ||
    left.horseName.localeCompare(right.horseName)
  );
}

function probabilityGap(
  runners: Array<{ runnerId: string; probability: number | null }>,
  leaderRunnerId: string,
): number | null {
  const ranked = runners.filter((runner) => runner.probability !== null);
  const leaderIndex = ranked.findIndex((runner) => runner.runnerId === leaderRunnerId);
  if (leaderIndex === -1 || ranked.length < 2) return null;
  const leader = ranked[leaderIndex]!.probability!;
  const next = ranked.find((runner) => runner.runnerId !== leaderRunnerId)?.probability ?? null;
  return next === null ? null : leader - next;
}

function summarizeBand(band: string, selections: RankOneDiagnosticSelection[]): RankOneBandSummary {
  const winners = selections.filter((selection) => selection.won).length;
  const marketExpected = sum(selections.map((selection) => selection.marketImpliedProbability));
  const modelProbabilities = selections
    .map((selection) => selection.modelProbability)
    .filter((value): value is number => value !== null);
  const modelExpected = modelProbabilities.length === selections.length
    ? sum(modelProbabilities)
    : null;
  return {
    band,
    selections: selections.length,
    winners,
    strike: rate(winners, selections.length),
    marketImpliedWinRate: rate(marketExpected, selections.length),
    modelPredictedWinRate: modelExpected === null ? null : rate(modelExpected, selections.length),
    actualMinusMarketExpectation: selections.length === 0 ? null : winners - marketExpected,
    actualMinusModelExpectation: selections.length === 0 || modelExpected === null ? null : winners - modelExpected,
  };
}

function summaryRow(row: RankOneBandSummary): string[] {
  return [
    row.band,
    String(row.selections),
    String(row.winners),
    pct(row.strike),
    pct(row.marketImpliedWinRate),
    pct(row.modelPredictedWinRate),
    signed(row.actualMinusMarketExpectation),
    signed(row.actualMinusModelExpectation),
  ];
}

function table(lines: string[], rows: string[][]) {
  lines.push(`| ${rows[0]!.join(" | ")} |`);
  lines.push(`| ${rows[0]!.map(() => "---").join(" | ")} |`);
  for (const row of rows.slice(1)) lines.push(`| ${row.join(" | ")} |`);
}

function groupBy<T, K>(values: T[], keyFor: (value: T) => K) {
  const groups = new Map<K, T[]>();
  for (const value of values) {
    const key = keyFor(value);
    const group = groups.get(key) ?? [];
    group.push(value);
    groups.set(key, group);
  }
  return groups;
}

function sameHorse(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function rate(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : null;
}

function pct(value: number | null) {
  return value === null ? "-" : `${(value * 100).toFixed(1)}%`;
}

function signed(value: number | null) {
  return value === null ? "-" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}
