import { profileCall } from "@/lib/racing/performance-profile";
import { loadHurdleV3Shadow, type HurdleV3ShadowObservation } from "@/lib/racing/hurdle-v3-shadow";
import { EPOCHS } from "@/lib/racing/prospective-epoch-config";

/** Display only: retain original historical comparisons and prefer the replacement cohort.
 * Captured ranks are passed through unchanged; RaceBlock still validates race/off/runner identity.
 */
export function indexHurdleComparisonShadows(original: readonly HurdleV3ShadowObservation[], current: readonly HurdleV3ShadowObservation[]) {
  return new Map([...original, ...current].map(book => [book.raceId, book]));
}

export async function loadHurdleComparisonShadows(loader = loadHurdleV3Shadow) {
  const [original, current] = await Promise.all([profileCall("ledger.hurdle_shadow.original", loader), profileCall("ledger.hurdle_shadow.epoch", loader, EPOCHS.shadow.ledger)]);
  return indexHurdleComparisonShadows(original?.observations ?? [], current?.observations ?? []);
}
