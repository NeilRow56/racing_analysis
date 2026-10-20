import { classifyJumpRaceSubtype } from "./jump-speed-rating";
import { isAllWeatherRaceForDisplay, isOrdinaryFlatTurfRaceForDisplay, type TodayRace } from "./todays-racing";
import type { TissueValueFamily } from "./tissue-value-metrics";
export function valueFamilyForRace(race: TodayRace): TissueValueFamily | null {
  const subtype = classifyJumpRaceSubtype(race);
  if (subtype === "hurdle") return "HURDLE";
  if (subtype === "chase") return "CHASE";
  if (isAllWeatherRaceForDisplay(race)) return "AW";
  return isOrdinaryFlatTurfRaceForDisplay(race) ? "TURF" : null;
}
