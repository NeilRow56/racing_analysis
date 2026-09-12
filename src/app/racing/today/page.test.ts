import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { todayRaceStatusLabel } from "@/lib/racing/today-race-status";
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

  test("past race without result settlement is labelled Race over", () => {
    assert.equal(
      todayRaceStatusLabel(
        race({ raceDateTime: new Date("2026-09-12T15:00:00.000Z") }),
        new Date("2026-09-12T15:00:00.000Z"),
      ),
      "Race over",
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

  test("stored result metadata labels race over even without a race datetime", () => {
    assert.equal(
      todayRaceStatusLabel(
        race({
          raceDateTime: null,
          runners: [runner({ finishingPosition: 2, resultStatus: "finished" })],
        }),
        new Date("2026-09-12T12:00:00.000Z"),
      ),
      "Race over",
    );
  });
});

function race(overrides: Partial<TodayRace> = {}): TodayRace {
  return {
    raceId: "race-1",
    sourceId: "937435",
    scheduledTime: "15:00:00",
    raceDateTime: new Date("2026-09-12T15:00:00.000Z"),
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
