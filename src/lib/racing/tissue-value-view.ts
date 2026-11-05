import { captureIdentity, latestPreOffCaptures } from "./frozen-capture-selection";
import type { TissueValueData, TissueValueRace, TissueValueRunner } from "./tissue-value-forward";
import type { TissueValueFamily, TissueValueFamilyFilter } from "./tissue-value-metrics";
import type { TodayMeeting } from "./todays-racing";
import { frozenBestL3SpeedRanks } from "./tissue-speed-rank-watch";
import { getTissueInputReliability, type TissueInputReliability } from "./tissue-input-reliability";
import { VALUE_RANK_VERSION, type ValueRankDecision } from "./value-rank-v2";

export type DisplayValueRunner = Omit<TissueValueRunner, "modelInputs" | "quotes"> & { bestL3SpeedRank?: number | null };
export type DisplayValueRace = Omit<TissueValueRace, "runners" | "featureNames"> & { runners: DisplayValueRunner[] };
export type ValueCohortDisplay = {
  family: TissueValueFamily; version: string; epoch: string; modelVersion: string; available: boolean; reason: string | null; races: DisplayValueRace[];
};
export function filterValueRaces<T extends { family: TissueValueFamily }>(races: T[], family: TissueValueFamilyFilter): T[] {
  return races.filter(r => family === "ALL" || r.family === family);
}
export type FrozenValueDisplay = Pick<TissueValueRunner, "probability" | "tissueRank" | "valueRank" | "marketRank" | "marketPrice" | "marketProbability" | "modelMarketRatio"> & {
  family: TissueValueFamily; modelVersion: string; valueTrackerVersion: string; capturedAt: string;
  bestL3SpeedRank?: number | null;
  inputReliability?: TissueInputReliability;
  activeValue1?: boolean;
  valueSelectionVersion?: "VALUE_RANK_V1" | typeof VALUE_RANK_VERSION;
  valueRankDecision?: ValueRankDecision;
};
/** Projection only: both screens consume these persisted ranks; no UI value-rank calculation. */
export function frozenValueIndex(datasets: TissueValueData[]): ReadonlyMap<string, FrozenValueDisplay> {
  const index = new Map<string, FrozenValueDisplay>();
  const races = datasets.flatMap(data => data.races);
  if (new Set(races.map(captureIdentity)).size !== races.length) throw new Error("Ambiguous frozen value observation");
  for (const race of latestPreOffCaptures(races)) {
    const speedRanks = frozenBestL3SpeedRanks(race.family, race.featureNames, race.runners);
    for (const row of race.runners) {
      const key = `${race.raceId}|${row.runnerId}`;
      if (index.has(key)) throw new Error("Ambiguous frozen value observation");
      const decision = race.valueRankPolicy?.legacyRankOne.find(d => d.runnerId === row.runnerId);
      index.set(key, { probability: row.probability, tissueRank: row.tissueRank, valueRank: row.valueRank, marketRank: row.marketRank, marketPrice: row.marketPrice,
        marketProbability: row.marketProbability, modelMarketRatio: row.modelMarketRatio, family: race.family, modelVersion: race.modelVersion, valueTrackerVersion: race.version, capturedAt: race.capturedAt,
        activeValue1: row.valueRank === 1 && (!race.valueRankPolicy || decision?.retained === true),
        valueSelectionVersion: race.valueRankPolicy?.version ?? "VALUE_RANK_V1", valueRankDecision: decision,
        bestL3SpeedRank: speedRanks.get(row.runnerId) ?? null,
        inputReliability: getTissueInputReliability({ family: race.family, featureNames: race.featureNames, modelInputs: row.modelInputs }) });
    }
  }
  return index;
}
export function attachFrozenValueToMeetings(meetings: TodayMeeting[], datasets: TissueValueData[]): TodayMeeting[] {
  const index = frozenValueIndex(datasets);
  return meetings.map(m => ({ ...m, races: m.races.map(r => ({ ...r, runners: r.runners.map(row => ({ ...row, tissueValue: index.get(`${r.raceId}|${row.runnerId}`) })) })) }));
}
