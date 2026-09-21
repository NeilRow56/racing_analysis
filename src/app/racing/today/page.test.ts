import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import {
  getTodayRaceState,
  todayRaceStatusLabel,
} from "@/lib/racing/today-race-status";
import type { TodayRace, TodayRunner } from "@/lib/racing/todays-racing";

describe("Today race status label", () => {
  test("future race has no completed badge", () => {
    assert.equal(
      todayRaceStatusLabel(
        race({ raceDateTime: new Date("2026-09-12T15:00:00.000Z") }),
        new Date("2026-09-12T14:59:59.000Z"),
      ),
      null,
    );
  });

  test("past race without result settlement is awaiting result", () => {
    assert.equal(
      todayRaceStatusLabel(
        race({ raceDateTime: new Date("2026-09-12T15:00:00.000Z") }),
        new Date("2026-09-12T15:00:00.000Z"),
      ),
      "Awaiting result",
    );
  });

  test("past partial result metadata is awaiting result rather than race over", () => {
    assert.equal(
      todayRaceStatusLabel(
        race({
          actualRunnerCount: 7,
          raceDateTime: new Date("2026-09-18T15:22:00.000Z"),
          runners: [runner({ resultStatus: "other" })],
        }),
        new Date("2026-09-18T15:24:00.000Z"),
      ),
      "Awaiting result",
    );
  });

  test("past race with stored result keeps Race over wording", () => {
    assert.equal(
      todayRaceStatusLabel(
        race({
          actualRunnerCount: 4,
          raceDateTime: new Date("2026-09-12T15:00:00.000Z"),
          runners: [runner({ finishingPosition: 1, resultStatus: "finished" })],
          winningTime: "1m 12.00s",
        }),
        new Date("2026-09-12T15:20:00.000Z"),
      ),
      "Race over",
    );
  });

  test("future full-result payload with actual runner count remains upcoming", () => {
    assert.equal(
      getTodayRaceState(
        race({
          actualRunnerCount: 6,
          raceDateTime: new Date("2026-09-18T17:45:00.000Z"),
          runners: [runner({ resultStatus: "other" })],
        }),
        new Date("2026-09-18T15:24:00.000Z"),
      ),
      "upcoming",
    );
  });

  test("future race with actual runner count is not race over", () => {
    assert.equal(
      todayRaceStatusLabel(
        race({
          actualRunnerCount: 12,
          raceDateTime: new Date("2026-09-18T18:15:00.000Z"),
        }),
        new Date("2026-09-18T15:24:00.000Z"),
      ),
      null,
    );
  });

  test("future race with fallback OTHER statuses is not race over", () => {
    assert.equal(
      todayRaceStatusLabel(
        race({
          raceDateTime: new Date("2026-09-18T17:45:00.000Z"),
          runners: [runner({ resultStatus: "other" })],
        }),
        new Date("2026-09-18T15:24:00.000Z"),
      ),
      null,
    );
  });

  test("BST comparison uses absolute instants for an evening race", () => {
    const eveningRace = race({ raceDateTime: new Date("2026-09-18T17:45:00.000Z") });

    assert.equal(
      getTodayRaceState(eveningRace, new Date("2026-09-18T18:44:59+01:00")),
      "upcoming",
    );
    assert.equal(
      getTodayRaceState(eveningRace, new Date("2026-09-18T18:45:00+01:00")),
      "past_due_pending_result",
    );
  });
});

describe("Today request orchestration", () => {
  test("synchronizes AW forward comparisons once per page request", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    const calls = source.match(/\bsyncAwForwardComparisons\(/g) ?? [];
    assert.equal(calls.length, 1);
  });

  test("loads trainer cohorts alongside the initial Today data", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    const initialRequest = source.slice(
      source.indexOf("const savedRulesPromise"),
      source.indexOf("let data = initialData"),
    );

    assert.match(initialRequest, /const trainerCohortsPromise = savedRulesPromise\.then/);
    assert.match(initialRequest, /Promise\.all\(\[[\s\S]*getTodaysRacingData[\s\S]*trainerCohortsPromise/);
  });

  test("shows compact Going form help without claiming current-going suitability", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

    assert.match(source, /Going form/);
    assert.match(source, /Previous 1st or 2nd finishes on going containing these terms\./);
    assert.doesNotMatch(source, /suit(?:s|able|ability)/i);
  });
});

function race(overrides: Partial<TodayRace> = {}): TodayRace {
  return {
    raceId: "race-1",
    sourceId: "937435",
    scheduledTime: "15:00:00",
    raceDateTime: new Date("2026-09-12T15:00:00.000Z"),
    courseCountry: "ENG",
    raceName: "Carlisle Novice Stakes",
    raceClass: "Class 3",
    raceType: "Flat",
    raceTypeCode: null,
    distance: "6f",
    distanceYards: 1320,
    going: "Good",
    surface: "TURF",
    declaredRunnerCount: 4,
    actualRunnerCount: null,
    winningTime: null,
    runners: [],
    ...overrides,
  };
}

function runner(overrides: Partial<TodayRunner> = {}): TodayRunner {
  return {
    runnerId: "runner-1",
    runnerSourceId: "ride-1",
    horseId: "horse-1",
    horseName: "Example Horse",
    saddleclothNumber: 1,
    horseAge: 4,
    horseSex: "f",
    weight: "9-2",
    weightCarriedLbs: 128,
    draw: 4,
    jockeyName: "A Jockey",
    trainerId: "trainer-1",
    trainerName: "A Trainer",
    officialRating: 92,
    odds: "5/1",
    oddsDecimal: "6",
    resultStatus: null,
    finishingPosition: null,
    metrics: null,
    ...overrides,
  };
}
