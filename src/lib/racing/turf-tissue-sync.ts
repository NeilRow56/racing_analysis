import type { createDbConnection } from "@/db";
import { getTargetRunnerMetricsForDate } from "./horse-metrics";
import { getJockeyPriorMetricsForTargets, getTrainerPriorMetricsForTargets } from "./trainer-quality";
import { isOrdinaryFlatTurfRaceForDisplay, type TodayMeeting } from "./todays-racing";

/** Load Turf inputs at a fixed capture-time boundary without changing other families. */
export async function loadTurfTissueCaptureHistory(
  db: ReturnType<typeof createDbConnection>["db"], meetings: TodayMeeting[], raceDate: string, capturedAt: Date,
): Promise<TodayMeeting[]> {
  const turf = meetings.flatMap(m => m.races).filter(r => isOrdinaryFlatTurfRaceForDisplay(r) && r.raceDateTime && capturedAt < r.raceDateTime);
  if (!turf.length) return meetings;
  const targets = turf.flatMap(r => r.runners.map(runner => ({ targetRunnerId: runner.runnerId, trainerId: runner.trainerId, jockeyId: runner.jockeyId, raceDateTime: capturedAt })));
  const [metrics, trainers, jockeys] = await Promise.all([
    getTargetRunnerMetricsForDate(db, raceDate, "sporting_life", { includeNonRunnerTargets: true, completedPriorRunsOnly: true, targetRunnerIds: targets.map(t => t.targetRunnerId), asOfDateTime: capturedAt }),
    getTrainerPriorMetricsForTargets(db, targets, "sporting_life"),
    getJockeyPriorMetricsForTargets(db, targets, "sporting_life"),
  ]);
  const byRunner = new Map(metrics.map(row => [row.target.runnerId, row.metrics]));
  const ids = new Set(turf.map(r => r.raceId));
  return meetings.map(m => ({ ...m, races: m.races.map(r => !ids.has(r.raceId) ? r : ({
    ...r, turfTissueHistoryAsOf: capturedAt.toISOString(), runners: r.runners.map(runner => ({
      ...runner, metrics: byRunner.get(runner.runnerId) ?? null,
      trainerMetrics: trainers.get(runner.runnerId), jockeyMetrics: jockeys.get(runner.runnerId),
    })),
  })) }));
}
