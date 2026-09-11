import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  classifyCurrentRaceFamily,
  isCurrentAllWeatherRace,
} from "./current-race-classification";

describe("current race family classification", () => {
  test("accepts AW-only venue blank going when course source ID evidence is sufficient", () => {
    assert.equal(
      classifyCurrentRaceFamily({
        courseName: "Chelmsford City",
        courseSourceId: "361",
        raceName: "Handicap",
        raceType: "handicap",
        going: "",
        surface: null,
      }),
      "all_weather_flat",
    );
  });

  test("accepts Lingfield AW with explicit racecard surface despite blank going", () => {
    assert.equal(
      classifyCurrentRaceFamily({
        courseName: "Lingfield",
        courseSourceId: "353",
        raceName: "Nursery",
        raceType: null,
        going: "",
        surface: "POLYTRACK",
      }),
      "all_weather_flat",
    );
  });

  test("rejects Lingfield Turf", () => {
    assert.equal(
      isCurrentAllWeatherRace({
        courseName: "Lingfield",
        courseSourceId: "353",
        raceName: "Handicap",
        raceType: "handicap",
        going: "Good",
        surface: "TURF",
      }),
      false,
    );
    assert.equal(
      classifyCurrentRaceFamily({
        courseName: "Lingfield",
        courseSourceId: "353",
        raceName: "Handicap",
        raceType: "handicap",
        going: "Good",
        surface: "TURF",
      }),
      "turf_flat",
    );
  });

  test("leaves ambiguous Lingfield blank-going race unknown without surface evidence", () => {
    assert.equal(
      classifyCurrentRaceFamily({
        courseName: "Lingfield",
        courseSourceId: "353",
        raceName: "Handicap",
        raceType: "handicap",
        going: "",
        surface: null,
      }),
      "unknown",
    );
  });

  test("does not classify a Turf venue as AW", () => {
    assert.equal(
      isCurrentAllWeatherRace({
        courseName: "Doncaster",
        courseSourceId: "308",
        raceName: "Stakes",
        raceType: "stakes",
        going: "",
        surface: "TURF",
      }),
      false,
    );
  });

  test("keeps jumps out of AW even with standard going", () => {
    assert.equal(
      classifyCurrentRaceFamily({
        courseName: "Worcester",
        courseSourceId: "513",
        raceName: "Handicap Chase",
        raceType: "chase",
        going: "Standard",
        surface: null,
      }),
      "jump",
    );
  });
});
