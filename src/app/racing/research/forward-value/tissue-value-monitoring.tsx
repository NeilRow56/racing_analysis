import { summarizeValueBands, summarizeValueRunners, TISSUE_VALUE_FAMILIES } from "@/lib/racing/tissue-value-metrics";
import { summarizeValueRankV2 } from "@/lib/racing/value-rank-v2";
import type { TissueValueData } from "@/lib/racing/tissue-value-forward";
import type { ValueCohortSnapshot } from "@/lib/racing/tissue-value-readers";
import { VALUE_COHORTS } from "@/lib/racing/tissue-value-config";
import { TissueValueMonitoringClient } from "./tissue-value-monitoring-client";
import { frozenBestL3SpeedRanks } from "@/lib/racing/tissue-speed-rank-watch";

export function TissueValueMonitoring({ data, cohorts, date, includeArchive = true }: { data?: TissueValueData; cohorts?: ValueCohortSnapshot[]; date: string; includeArchive?: boolean }) {
  const snapshots = cohorts ?? VALUE_COHORTS.map(config => ({ config, data: config.family === "TURF" && data ? data : { version: config.version, epoch: config.epoch, races: [] } }));
  let projection = projections.get(snapshots);
  if (!projection) { projection = projectCohorts(snapshots); projections.set(snapshots, projection); }
  const { display, summaries, totals } = projection;
  return <TissueValueMonitoringClient cohorts={includeArchive ? display : display.map(c => ({ ...c, races: [] }))} summaries={summaries} totals={totals} date={date} includeArchive={includeArchive} />;
}
const projections = new WeakMap<ValueCohortSnapshot[], ReturnType<typeof projectCohorts>>();
function projectCohorts(snapshots: ValueCohortSnapshot[]) {
  const display = snapshots.map(({ config, data }) => ({ family: config.family, version: config.version, epoch: config.epoch, modelVersion: config.modelVersion,
    available: config.probabilityAvailable, reason: config.unavailableReason,
    races: data.races.map(race => {
      const speedRanks = frozenBestL3SpeedRanks(race.family, race.featureNames, race.runners);
      return { ...omit(race, "featureNames"), runners: race.runners.map(runner => ({ ...omit(runner, "modelInputs", "quotes"), bestL3SpeedRank: speedRanks.get(runner.runnerId) ?? null })) };
    }),
  }));
  const summaries = Object.fromEntries(["ALL" as const, ...TISSUE_VALUE_FAMILIES].map(family => {
    const races = display.filter(c => c.available && (family === "ALL" || c.family === family)).flatMap(c => c.races);
    const runners = races.flatMap(r => r.runners);
    return [family, { summary: summarizeValueRunners(runners), bands: summarizeValueBands(runners), valueRank: summarizeValueRankV2(races) }];
  }));
  const totals = display.map(c => summarizeValueRunners(c.races.flatMap(r => r.runners)));
  return { display, summaries, totals };
}
function omit<T extends object, K extends keyof T>(value: T, ...keys: K[]): Omit<T, K> {
  const copy = { ...value };
  for (const key of keys) delete copy[key];
  return copy;
}
