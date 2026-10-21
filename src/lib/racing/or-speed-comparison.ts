import type { TodayRunner } from "./todays-racing";

export type ComparableRunner = Pick<TodayRunner, "runnerId" | "officialRating" | "metrics">;

// Shared descriptive comparison of the runners in one race, using existing metrics.
// Tied leaders have no edge; missing figures cannot supply a comparison.
export function sameOrSpeedEdges(runners: ComparableRunner[], isTurfRace: boolean): Map<string, number> {
  return speedEdgesForMetric(runners, isTurfRace, "bestTurfSpeedLast3");
}

export function sameOrAwSpeedEdges(runners: ComparableRunner[], isAllWeatherRace: boolean): Map<string, number> {
  return speedEdgesForMetric(runners, isAllWeatherRace, "bestAwSpeedLast3");
}

// Display context only: count all higher valid ORs, regardless of Speed availability.
// Competition ties share a rank and leave gaps (86, 84, 84, 82 => 1, 2, 2, 4).
export function officialRatingRanks(runners: Pick<ComparableRunner, "runnerId" | "officialRating">[]): Map<string, number> {
  const ratings = runners.map((runner) => runner.officialRating).filter(finite).sort((a, b) => b - a);
  const ranks = new Map<number, number>();
  ratings.forEach((rating, index) => {
    if (!ranks.has(rating)) ranks.set(rating, index + 1);
  });
  return new Map(runners.flatMap((runner) => finite(runner.officialRating)
    ? [[runner.runnerId, ranks.get(runner.officialRating)!] as const]
    : []));
}

function speedEdgesForMetric(
  runners: ComparableRunner[],
  enabled: boolean,
  metric: "bestTurfSpeedLast3" | "bestAwSpeedLast3",
): Map<string, number> {
  const edges = new Map<string, number>();
  if (!enabled) return edges;
  const groups = new Map<number, { runnerId: string; speed: number }[]>();
  for (const runner of runners) {
    const or = runner.officialRating;
    const speed = runner.metrics?.[metric];
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

export function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function formatSpeedEdge(value: number): string { return value.toFixed(2); }
