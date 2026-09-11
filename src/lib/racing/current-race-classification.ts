import { isSupportedAllWeatherRace } from "./aw-speed-rating";
import { isJumpRace } from "./jump-speed-rating";
import { isNhFlatOrBumperStyle } from "./turf-speed-rating";

export type CurrentRaceFamily = "jump" | "all_weather_flat" | "turf_flat" | "unknown";

export type CurrentRaceClassificationInput = {
  raceName?: string | null;
  raceType?: string | null;
  raceTypeCode?: string | null;
  courseName?: string | null;
  courseSourceId?: string | null;
  going?: string | null;
  surface?: string | null;
};

const AW_SURFACES = new Set(["ALLWEATHER", "POLYTRACK"]);

// Source IDs observed in the live Sporting Life data as AW-only in the local
// 2025-2026 corpus. Mixed venues such as Lingfield, Kempton, Newcastle and
// Southwell deliberately stay out of this fallback.
const AW_ONLY_FLAT_COURSE_SOURCE_IDS = new Set([
  "292", // Wolverhampton
  "361", // Chelmsford City
]);

const MIXED_FLAT_COURSE_SOURCE_IDS = new Set([
  "278", // Newcastle
  "296", // Southwell
  "353", // Lingfield
  "366", // Kempton
]);

export function classifyCurrentRaceFamily(
  race: CurrentRaceClassificationInput,
): CurrentRaceFamily {
  if (isJumpRace(race)) {
    return "jump";
  }

  if (isCurrentAllWeatherRace(race)) {
    return "all_weather_flat";
  }

  if (isCurrentOrdinaryFlatTurfRace(race)) {
    return "turf_flat";
  }

  return "unknown";
}

export function isCurrentAllWeatherRace(
  race: CurrentRaceClassificationInput,
): boolean {
  if (isJumpRace(race)) {
    return false;
  }

  const surface = normalizedSurface(race.surface);
  if (surface !== null) {
    return AW_SURFACES.has(surface);
  }

  if (isSupportedAllWeatherRace(race)) {
    return true;
  }

  return Boolean(
    race.courseSourceId &&
      AW_ONLY_FLAT_COURSE_SOURCE_IDS.has(race.courseSourceId) &&
      !isNhFlatOrBumperStyle(race),
  );
}

export function isCurrentOrdinaryFlatTurfRace(
  race: CurrentRaceClassificationInput,
): boolean {
  if (isJumpRace(race) || isNhFlatOrBumperStyle(race)) {
    return false;
  }

  const surface = normalizedSurface(race.surface);
  if (surface !== null) {
    return surface === "TURF";
  }

  if (
    race.courseSourceId &&
    MIXED_FLAT_COURSE_SOURCE_IDS.has(race.courseSourceId) &&
    !(race.going ?? "").trim()
  ) {
    return false;
  }

  return !isCurrentAllWeatherRace(race) &&
    !(race.going ?? "").trim().toLowerCase().startsWith("standard");
}

function normalizedSurface(surface: string | null | undefined): string | null {
  const value = surface?.trim().toUpperCase();
  return value ? value : null;
}
