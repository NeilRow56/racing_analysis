import { loadLowForm, matchingLowFormShadow, type LowFormObservation } from "@/lib/racing/hurdle-low-form";
import type { HurdleV3ShadowObservation } from "@/lib/racing/hurdle-v3-shadow";
import type { TodayRace } from "@/lib/racing/todays-racing";
export async function HurdleLowFormLabel({ race, shadow }: { race: TodayRace; shadow?: HurdleV3ShadowObservation }) {
  if (!shadow || race.raceId !== shadow.raceId || race.raceDateTime?.toISOString() !== shadow.production.scheduledOff ||
    !shadow.production.runners.every(r => race.runners.some(live => live.runnerId === r.runnerId && live.horseId === r.horseId))) return null;
  const result = await loadLowForm().then(data => ({ data, failed: false })).catch(() => ({ data: null, failed: true }));
  if (result.failed) return <p className="mt-1 text-xs text-slate-500">Low-form monitoring unavailable</p>;
  const observation = result.data?.observations.find(o => o.raceId === race.raceId);
  return <LowFormLabel race={race} shadow={shadow} observation={observation} />;
}
export function LowFormLabel({ race, shadow, observation }: { race: TodayRace; shadow: HurdleV3ShadowObservation; observation?: LowFormObservation }) {
  if (!observation || observation.classification === "ESTABLISHED FORM" || !matchingLowFormShadow(observation, [shadow])) return null;
  const names = [observation.market.favourite, observation.market.secondFavourite].map(id => {
    const stored = shadow.production.runners.find(r => r.runnerId === id), live = race.runners.find(r => r.runnerId === id);
    return `${stored?.horseName ?? "Unavailable"}${live?.resultStatus === "non_runner" ? " (NR · frozen selection)" : ""}`;
  });
  return <div className="mt-1 text-xs text-slate-500" aria-label="Low-form Hurdle monitoring">
    <p>LOW FORM — {observation.classification.replace(" FORM", "")}</p>
    {observation.market.status === "COMPLETE" ? <p>Market T1 {names[0]} · T2 {names[1]} · frozen comparison only</p> : <p>MARKET UNAVAILABLE / INCOMPLETE</p>}
  </div>;
}
