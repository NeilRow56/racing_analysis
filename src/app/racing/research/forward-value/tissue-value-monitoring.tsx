import type { TissueValueData } from "@/lib/racing/tissue-value-forward";
import type { ValueCohortSnapshot } from "@/lib/racing/tissue-value-readers";
import { VALUE_COHORTS } from "@/lib/racing/tissue-value-config";
import { TissueValueMonitoringClient } from "./tissue-value-monitoring-client";
import { frozenBestL3SpeedRanks } from "@/lib/racing/tissue-speed-rank-watch";

export function TissueValueMonitoring({ data, cohorts, date }: { data?: TissueValueData; cohorts?: ValueCohortSnapshot[]; date: string }) {
  const snapshots = cohorts ?? VALUE_COHORTS.map(config => ({ config, data: config.family === "TURF" && data ? data : { version: config.version, epoch: config.epoch, races: [] } }));
  const display = snapshots.map(({ config, data }) => ({ family: config.family, version: config.version, epoch: config.epoch, modelVersion: config.modelVersion,
    available: config.probabilityAvailable, reason: config.unavailableReason,
    races: data.races.map(race => {
      const speedRanks = frozenBestL3SpeedRanks(race.family, race.featureNames, race.runners);
      return { ...omit(race, "featureNames"), runners: race.runners.map(runner => ({ ...omit(runner, "modelInputs", "quotes"), bestL3SpeedRank: speedRanks.get(runner.runnerId) ?? null })) };
    }),
  }));
  return <TissueValueMonitoringClient cohorts={display} date={date} />;
}
function omit<T extends object, K extends keyof T>(value: T, ...keys: K[]): Omit<T, K> {
  const copy = { ...value };
  for (const key of keys) delete copy[key];
  return copy;
}
