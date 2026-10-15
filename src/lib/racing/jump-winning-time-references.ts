import { classifyJumpRaceSubtype } from "./jump-speed-rating";
import { assessJumpWinningTime } from "./jump-winning-time-integrity";
import { sanityCheckWinningTime } from "./speed-research";

export type JumpTimingContext = {
  raceId: string; courseId: string; distanceYards: number | null;
  winningTime: string | null; raceName: string | null; raceType: string | null;
};

/** Same course/exact distance/subtype. Keep explicitly AWT bumpers separate.
 * Callers supply their existing as-of context; the target is always excluded.
 */
export function jumpWinningTimeReviews(rows: JumpTimingContext[]) {
  const groups = new Map<string, Array<{ raceId: string; seconds: number }>>();
  const key = (r: JumpTimingContext) => `${r.courseId}:${r.distanceYards}:${classifyJumpRaceSubtype(r)}:${/\b(?:AWT|A-W|Polytrack|Tapeta|Fibresand)\b/i.test(r.raceName ?? "") ? "aw" : "other"}`;
  for (const row of rows) {
    const seconds = sanityCheckWinningTime(row).usableSeconds;
    if (seconds === null || classifyJumpRaceSubtype(row) === "unknown_other") continue;
    const k = key(row);
    const group = groups.get(k) ?? [];
    group.push({ raceId: row.raceId, seconds }); groups.set(k, group);
  }
  return new Map(rows.map((r) => [r.raceId, assessJumpWinningTime(
    sanityCheckWinningTime(r).usableSeconds ?? NaN,
    (groups.get(key(r)) ?? []).filter((p) => p.raceId !== r.raceId).map((p) => p.seconds),
  )]));
}
