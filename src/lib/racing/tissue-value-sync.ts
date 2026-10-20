import type { createDbConnection } from "@/db";
import { getTargetRunnerMetricsForDate } from "./horse-metrics";
import { getTrainerPriorMetricsForTargets, getJockeyPriorMetricsForTargets } from "./trainer-quality";
import { loadAwV2CaptureContext } from "./aw-tissue-v2-sync";
import { loadAwV2Model } from "./aw-tissue-v2";
import { loadFrozenTissueModel, TISSUE_V3_CONFIG } from "./tissue-forward";
import { loadJumpTissueModel } from "./jump-tissue-model";
import { loadJumpTissueCommentsForRaces } from "./jump-tissue-sync";
import { valueFamilyForRace } from "./tissue-value-family";
import type { TodayMeeting } from "./todays-racing";

/** Batched capture-bounded inputs, without changing any model or existing monitor loader. */
export async function loadValueCaptureInputs(connection: ReturnType<typeof createDbConnection>, meetings: TodayMeeting[], date: string, cutoff: Date) {
  const nonAw = meetings.flatMap(m => m.races).filter(r => valueFamilyForRace(r) !== null && valueFamilyForRace(r) !== "AW" && r.raceDateTime && cutoff < r.raceDateTime);
  const targets = nonAw.flatMap(r => r.runners.map(row => ({ targetRunnerId: row.runnerId, trainerId: row.trainerId, jockeyId: row.jockeyId, raceDateTime: cutoff })));
  const [metrics, trainers, jockeys, commentsByHorse, awCapture, turf, aw, jump] = await Promise.all([
    getTargetRunnerMetricsForDate(connection.db, date, "sporting_life", { includeNonRunnerTargets: true, completedPriorRunsOnly: true, targetRunnerIds: targets.map(t => t.targetRunnerId), asOfDateTime: cutoff }),
    getTrainerPriorMetricsForTargets(connection.db, targets, "sporting_life"),
    getJockeyPriorMetricsForTargets(connection.db, targets, "sporting_life"),
    loadJumpTissueCommentsForRaces(connection.client, nonAw.map(r => ({ ...r, raceDateTime: cutoff }))),
    loadAwV2CaptureContext(connection, meetings, date, cutoff),
    loadFrozenTissueModel(TISSUE_V3_CONFIG.modelPath, TISSUE_V3_CONFIG.modelVersion), loadAwV2Model(), loadJumpTissueModel(),
  ]);
  const byRunner = new Map(metrics.map(row => [row.target.runnerId, row.metrics])), ids = new Set(nonAw.map(r => r.raceId));
  return { meetings: awCapture.meetings.map(m => ({ ...m, races: m.races.map(r => !ids.has(r.raceId) ? r : ({ ...r,
    turfTissueHistoryAsOf: cutoff.toISOString(), runners: r.runners.map(row => ({ ...row, metrics: byRunner.get(row.runnerId) ?? null,
      trainerMetrics: trainers.get(row.runnerId), jockeyMetrics: jockeys.get(row.runnerId) })),
  })) })), commentsByHorse, awContext: awCapture.context, models: { turf, aw, jump } };
}
