import { loadEarlyTurfContext, matchingEarlyTurfCapture, type EarlyTurfObservation } from "@/lib/racing/turf-early-season";
import { earlyTurfDate } from "@/lib/racing/turf-early-season-method";
import { getLocalRacingDate, isOrdinaryFlatTurfRaceForDisplay, type TodayRace } from "@/lib/racing/todays-racing";
export function EarlyTurfLabel({ observation }: { observation: EarlyTurfObservation }) {
  return <p className="mt-1 text-xs text-slate-500" aria-label="Early-season Turf monitoring">EARLY TURF — {observation.classification}</p>;
}
export async function TurfEarlySeasonLabel({ race }: { race: TodayRace }) {
  if (!race.raceDateTime || !earlyTurfDate(getLocalRacingDate(race.raceDateTime)) || !isOrdinaryFlatTurfRaceForDisplay(race)) return null;
  const context = await loadEarlyTurfContext().catch(() => null);
  const o = context?.data?.observations.find(o => o.raceId === race.raceId && o.scheduledOff === race.raceDateTime!.toISOString());
  if (!o || !context || !matchingEarlyTurfCapture(o, context.generation.races) || !o.diagnostics.every(d => race.runners.some(r => r.runnerId === d.runnerId))) return null;
  return <EarlyTurfLabel observation={o} />;
}
