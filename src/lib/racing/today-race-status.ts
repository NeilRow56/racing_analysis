import type { TodayRace } from "./todays-racing";

export function todayRaceStatusLabel(race: TodayRace, now = new Date()): string | null {
  return isRaceOver(race, now) ? "Race over" : null;
}

export function isRaceOver(race: TodayRace, now = new Date()): boolean {
  if (race.raceDateTime && now.getTime() >= race.raceDateTime.getTime()) {
    return true;
  }
  return Boolean(
    race.winningTime ||
      race.actualRunnerCount !== null ||
      race.runners.some((runner) => runner.finishingPosition !== null),
  );
}
