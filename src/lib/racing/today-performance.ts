import { getTodaysRacingData } from "./todays-racing";
import { profilingEnabled, recordTiming } from "./performance-profile";

/** Keep the frozen loader untouched. Its last callback precedes runner grouping/rating.
 * This tail is an estimate including Promise continuation overhead, not exclusive CPU time.
 */
export async function getTodaysRacingDataWithProfile(...args: Parameters<typeof getTodaysRacingData>) {
  if (!profilingEnabled()) return getTodaysRacingData(...args);
  const [db, raceDate, options] = args;
  let lastCompletedAt: number | undefined;
  const data = await getTodaysRacingData(db, raceDate, {
    ...options,
    onTiming(name, elapsedMs) {
      recordTiming(name, elapsedMs);
      options?.onTiming?.(name, elapsedMs);
      lastCompletedAt = performance.now();
    },
  });
  if (data.status === "ok" && lastCompletedAt !== undefined) {
    recordTiming("today.runner_rating_and_grouping_tail", performance.now() - lastCompletedAt, "estimated");
  }
  return data;
}
