import type { ChaseShadowRace } from "@/lib/racing/chase-shadow-forward";
import { classifyJumpRaceSubtype } from "@/lib/racing/jump-speed-rating";
import { isJumpRaceForDisplay, type TodayRace } from "@/lib/racing/todays-racing";

/** Display projection only, from the validated prospective ledger used by winter research. */
export function chaseShadowBadgeRanks(race: TodayRace, book?: ChaseShadowRace): ReadonlyMap<string, 1 | 2> {
  const ranks = new Map<string, 1 | 2>();
  if (!isJumpRaceForDisplay(race) || classifyJumpRaceSubtype(race) !== "chase" ||
    !book || book.raceId !== race.raceId || book.current.subtype !== "Chase" ||
    !book.current.recordedPreRace || book.coverage !== "complete") return ranks;
  for (const runner of book.runners) {
    if ((runner.rank === 1 || runner.rank === 2) &&
      race.runners.some(live => live.runnerId === runner.runnerId && live.horseId === runner.horseId)) {
      ranks.set(runner.runnerId, runner.rank);
    }
  }
  return ranks;
}
