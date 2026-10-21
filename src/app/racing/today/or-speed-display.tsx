import type { TodayRunner } from "@/lib/racing/todays-racing";

type ComparableRunner = Pick<TodayRunner, "runnerId" | "officialRating" | "metrics">;

export const BEST_L3_TURF_HELP = "Best L3 is the horse's best Turf Speed figure from its last three eligible Turf runs.";

// Display-only comparison of the runners in one race, using existing metrics.
// Tied leaders have no edge; missing figures cannot supply a comparison.
export function sameOrSpeedEdges(runners: ComparableRunner[], isTurfRace: boolean): Map<string, number> {
  const edges = new Map<string, number>();
  if (!isTurfRace) return edges;
  const groups = new Map<number, { runnerId: string; speed: number }[]>();
  for (const runner of runners) {
    const or = runner.officialRating;
    const speed = runner.metrics?.bestTurfSpeedLast3;
    if (!finite(or) || !finite(speed)) continue;
    const group = groups.get(or) ?? [];
    group.push({ runnerId: runner.runnerId, speed });
    groups.set(or, group);
  }
  for (const group of groups.values()) {
    group.sort((a, b) => b.speed - a.speed);
    const [leader, next] = group;
    if (leader && next && leader.speed > next.speed) {
      edges.set(leader.runnerId, leader.speed - next.speed);
    }
  }
  return edges;
}

export function OrSpeedCell({ runner, speedEdge }: {
  runner: Pick<ComparableRunner, "officialRating" | "metrics">;
  speedEdge?: number;
}) {
  const speed = runner.metrics?.bestTurfSpeedLast3;
  const hasEdge = finite(runner.officialRating) && finite(speed) && finite(speedEdge) && speedEdge > 0;
  return (
    <div className="space-y-0.5">
      <div className="whitespace-nowrap font-semibold text-slate-900" title={BEST_L3_TURF_HELP}>
        OR {display(runner.officialRating)} · Best L3 {display(speed)}
      </div>
      {hasEdge ? (
        <span
          className={speedEdge >= 10
            ? "inline-block border border-emerald-200 bg-emerald-50 px-1 text-[10px] font-semibold text-emerald-800"
            : "inline-block border border-slate-200 px-1 text-[10px] text-slate-600"}
          title={`Best L3 Speed is ${speedEdge} points higher than the next-highest comparable runner in this race carrying the same Official Rating. Prospective research observation. Emphasis uses the unrounded gap of at least 10.`}
        >
          Speed edge +{display(speedEdge)}
        </span>
      ) : null}
    </div>
  );
}

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function display(value: number | null | undefined): string {
  if (!finite(value)) return "—";
  // Keep floating-point figures compact without rounding a positive gap to zero.
  const rounded = Number(value.toFixed(2));
  return String(rounded === 0 && value !== 0 ? Number(value.toPrecision(2)) : rounded);
}
