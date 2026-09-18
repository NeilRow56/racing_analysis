import type { TodayRace } from "./todays-racing";

export type TodayRaceState =
  | "upcoming"
  | "past_due_pending_result"
  | "conclusively_completed";

export function todayRaceStatusLabel(race: TodayRace, now = new Date()): string | null {
  const state = getTodayRaceState(race, now);
  if (state === "conclusively_completed") {
    return "Race over";
  }
  if (state === "past_due_pending_result") {
    return "Awaiting result";
  }
  return null;
}

export function isRaceOver(race: TodayRace, now = new Date()): boolean {
  return getTodayRaceState(race, now) === "conclusively_completed";
}

export function getTodayRaceState(race: TodayRace, now = new Date()): TodayRaceState {
  if (todayRaceHasConclusiveResult(race)) {
    return "conclusively_completed";
  }
  if (race.raceDateTime && now.getTime() >= race.raceDateTime.getTime()) {
    return "past_due_pending_result";
  }
  return "upcoming";
}

export function todayRaceHasConclusiveResult(race: TodayRace): boolean {
  if (!nonBlank(race.winningTime) || !race.runners.some((runner) => runner.finishingPosition === 1)) {
    return false;
  }
  return race.runners.every((runner) => {
    if (runner.resultStatus === "non_runner") {
      return true;
    }
    return Boolean(
      nonBlank(runner.oddsDecimal) &&
      (runner.finishingPosition !== null || nonBlank(runner.resultStatus)),
    );
  });
}

function nonBlank(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
