import type { TissueValueData, TissueValueRace, TissueValueRunner } from "./tissue-value-forward";
import type { TissueValueFamily, TissueValueFamilyFilter } from "./tissue-value-metrics";
import type { TodayMeeting } from "./todays-racing";
import { frozenBestL3SpeedRanks } from "./tissue-speed-rank-watch";
import { getTissueInputReliability, type TissueInputReliability } from "./tissue-input-reliability";

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
};
/** Projection only: both screens consume these persisted ranks; no UI value-rank calculation. */
export function frozenValueIndex(datasets: TissueValueData[]): ReadonlyMap<string, FrozenValueDisplay> {
  const index = new Map<string, FrozenValueDisplay>();
  for (const data of datasets) for (const race of data.races) {
    const speedRanks = frozenBestL3SpeedRanks(race.family, race.featureNames, race.runners);
    for (const row of race.runners) {
      const key = `${race.raceId}|${row.runnerId}`;
      if (index.has(key)) throw new Error("Ambiguous frozen value observation");
      index.set(key, { probability: row.probability, tissueRank: row.tissueRank, valueRank: row.valueRank, marketRank: row.marketRank, marketPrice: row.marketPrice,
        marketProbability: row.marketProbability, modelMarketRatio: row.modelMarketRatio, family: race.family, modelVersion: race.modelVersion, valueTrackerVersion: race.version, capturedAt: race.capturedAt,
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
