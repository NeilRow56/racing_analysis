import type { HurdleV3ShadowObservation } from "@/lib/racing/hurdle-v3-shadow";
import { classifyJumpRaceSubtype } from "@/lib/racing/jump-speed-rating";
import { isLiveRunnerEligible } from "@/lib/racing/live-runner-eligibility";
import type { TodayRace } from "@/lib/racing/todays-racing";

/** Read-only comparison. Never attach shadow ranks to production runners. */
export function HurdleModelComparison({ race, shadow }: {
  race: TodayRace;
  shadow?: HurdleV3ShadowObservation;
}) {
  if (classifyJumpRaceSubtype(race) !== "hurdle") return null;
  const matchingShadow = shadow?.raceId === race.raceId &&
    shadow.production.family === "HURDLE" &&
    race.raceDateTime?.toISOString() === shadow.production.scheduledOff &&
    shadow.production.runners.every(stored => race.runners.some(live =>
      live.runnerId === stored.runnerId && live.horseId === stored.horseId)) ? shadow : undefined;
  const production = (rank: number) => race.runners.find(r =>
    r.activeTissue?.family === "HURDLE" && r.activeTissue.modelVersion === "HURDLE_TISSUE_V2" && r.activeTissue.rank === rank);
  const selection = (rank: number, model: "v2" | "v3") => {
    const id = matchingShadow?.runners.find(r => r.official.rank === rank)?.target.runnerId;
    const runner = model === "v2" ? production(rank) : race.runners.find(r => r.runnerId === id);
    if (!runner) return "Unavailable";
    return `${runner.horseName}${isLiveRunnerEligible(runner) ? "" : " (NR · frozen selection)"}`;
  };
  return <aside aria-label="Hurdle V2 and V3 shadow selections" className="mt-3 grid grid-cols-2 gap-4 border-t border-slate-200 pt-3">
    <div className="text-sm text-slate-900">
      <p className="font-semibold">V2:</p>
      {[1, 2].map(rank => <p key={rank}>T{rank} {selection(rank, "v2")}</p>)}
    </div>
    <div className="text-xs text-slate-500">
      <p className="font-medium">V3 SHADOW:</p>
      {[1, 2].map(rank => <p key={rank}>T{rank} {selection(rank, "v3")}</p>)}
      <p className="mt-1">{matchingShadow ? `Frozen at ${matchingShadow.capturedAt}` : "No matching prospective shadow capture"}</p>
      <p>Comparison only</p>
    </div>
  </aside>;
}
