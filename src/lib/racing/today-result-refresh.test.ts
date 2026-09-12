import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import {
  clearTodayResultRefreshChecksForTest,
  getEligibleResultRefreshRaces,
  refreshEligibleTodaySelectionResults,
  type EligibleResultRefreshRace,
} from "./today-result-refresh";
import { buildTodayRuleSelections } from "./today-rule-matches";
import type {
  TodayMeeting,
  TodayRace,
  TodayRunner,
  TodaySavedRuleMatch,
} from "./todays-racing";

describe("Today result refresh eligibility", () => {
  beforeEach(() => {
    clearTodayResultRefreshChecksForTest();
  });

  test("race before scheduled time plus buffer is not eligible", () => {
    const eligible = getEligibleResultRefreshRaces(
      [meeting(race({ raceDateTime: new Date("2026-09-12T13:00:00.000Z") }))],
      "2026-09-12",
      { now: new Date("2026-09-12T13:09:59.000Z") },
    );

    assert.equal(eligible.length, 0);
  });

  test("race after scheduled time plus buffer is eligible", () => {
    const eligible = getEligibleResultRefreshRaces(
      [meeting(race({ raceDateTime: new Date("2026-09-12T13:00:00.000Z") }))],
      "2026-09-12",
      { now: new Date("2026-09-12T13:10:00.000Z") },
    );

    assert.equal(eligible.length, 1);
    assert.match(eligible[0]!.resultUrl, /\/racing\/results\/2026-09-12\/carlisle\/937435\//);
  });

  test("already settled races are not eligible", () => {
    const eligible = getEligibleResultRefreshRaces(
      [meeting(race({ winningTime: "1m 12.00s" }))],
      "2026-09-12",
      { now: new Date("2026-09-12T14:00:00.000Z") },
    );

    assert.equal(eligible.length, 0);
  });

  test("race with no frozen-rule matched runner is not eligible", () => {
    const eligible = getEligibleResultRefreshRaces(
      [meeting(race(), [runner({ savedRuleMatches: [] })])],
      "2026-09-12",
      { now: new Date("2026-09-12T14:00:00.000Z") },
    );

    assert.equal(eligible.length, 0);
  });

  test("recently checked race inside retry interval is not eligible", async () => {
    const meetings = [meeting(race())];
    const now = new Date("2026-09-12T14:00:00.000Z");
    await refreshEligibleTodaySelectionResults(meetings, "2026-09-12", {
      now,
      refreshRaceResult: async (refreshRace) => outcome(refreshRace, "not_ready"),
    });

    const eligible = getEligibleResultRefreshRaces(meetings, "2026-09-12", {
      now: new Date("2026-09-12T14:14:59.000Z"),
    });

    assert.equal(eligible.length, 0);
  });
});

describe("Today result refresh", () => {
  beforeEach(() => {
    clearTodayResultRefreshChecksForTest();
  });

  test("completed result reports imported", async () => {
    const summary = await refreshEligibleTodaySelectionResults(
      [meeting(race())],
      "2026-09-12",
      {
        now: new Date("2026-09-12T14:00:00.000Z"),
        refreshRaceResult: async (refreshRace) => outcome(refreshRace, "imported"),
      },
    );

    assert.equal(summary.eligible, 1);
    assert.equal(summary.attempted, 1);
    assert.equal(summary.imported, 1);
    assert.equal(summary.notReady, 0);
    assert.equal(summary.failed, 0);
  });

  test("incomplete result leaves race unsettled", async () => {
    const meetings = [meeting(race())];
    const summary = await refreshEligibleTodaySelectionResults(
      meetings,
      "2026-09-12",
      {
        now: new Date("2026-09-12T14:00:00.000Z"),
        refreshRaceResult: async (refreshRace) => outcome(refreshRace, "not_ready"),
      },
    );

    assert.equal(summary.notReady, 1);
    assert.equal(buildTodayRuleSelections(meetings).summary.settled, 0);
  });

  test("source failure is non-fatal", async () => {
    const summary = await refreshEligibleTodaySelectionResults(
      [meeting(race())],
      "2026-09-12",
      {
        now: new Date("2026-09-12T14:00:00.000Z"),
        refreshRaceResult: async () => {
          throw new Error("source unavailable");
        },
      },
    );

    assert.equal(summary.failed, 1);
    assert.equal(summary.outcomes[0]?.message, "source unavailable");
  });

  test("repeated refresh is idempotent for races already settled locally", async () => {
    let calls = 0;
    const summary = await refreshEligibleTodaySelectionResults(
      [meeting(race({ winningTime: "1m 12.00s" }))],
      "2026-09-12",
      {
        now: new Date("2026-09-12T14:00:00.000Z"),
        refreshRaceResult: async (refreshRace) => {
          calls += 1;
          return outcome(refreshRace, "imported");
        },
      },
    );

    assert.equal(summary.eligible, 0);
    assert.equal(calls, 0);
  });
});

describe("Today result refresh selection settlement integration", () => {
  test("refreshed winner, loser and non-runner update the daily P/L table from stored results", () => {
    const selections = buildTodayRuleSelections([
      meeting(race({ winningTime: "1m 12.00s" }), [
        runner({
          runnerId: "winner",
          horseName: "Winner",
          finishingPosition: 1,
          odds: "5/1",
          oddsDecimal: "6",
          resultStatus: "finished",
        }),
        runner({
          runnerId: "loser",
          horseName: "Loser",
          finishingPosition: 4,
          odds: "3/1",
          oddsDecimal: "4",
          resultStatus: "finished",
        }),
        runner({
          runnerId: "non-runner",
          horseName: "Non Runner",
          resultStatus: "non_runner",
          odds: "5/1",
          oddsDecimal: "6",
        }),
      ]),
    ]);

    assert.deepEqual(
      selections.rows.map((row) => [row.runnerId, row.result, row.settlement?.profitLoss ?? null]),
      [
        ["loser", "4", -1],
        ["non-runner", "NR", null],
        ["winner", "1", 5],
      ],
    );
    assert.deepEqual(selections.summary, {
      selections: 3,
      settled: 2,
      profitLoss: 4,
    });
  });
});

function outcome(
  refreshRace: EligibleResultRefreshRace,
  status: "imported" | "not_ready",
) {
  return {
    raceId: refreshRace.race.raceId,
    sourceId: refreshRace.race.sourceId!,
    status,
    message: null,
  };
}

function meeting(
  raceValue: TodayRace,
  runners: TodayRunner[] = [runner()],
): TodayMeeting {
  return {
    courseId: "course-carlisle",
    courseSourceId: "302",
    courseName: "Carlisle",
    country: "ENG",
    order: 0,
    races: [{ ...raceValue, runners }],
  };
}

function race(overrides: Partial<TodayRace> = {}): TodayRace {
  return {
    raceId: "race-1",
    sourceId: "937435",
    scheduledTime: "13:00:00",
    raceDateTime: new Date("2026-09-12T13:00:00.000Z"),
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
    savedRuleMatches: [todayMatch()],
    ...overrides,
  };
}

function todayMatch(): TodaySavedRuleMatch {
  return {
    ruleId: "rule-1",
    ruleName: "Frozen Rule",
    development: {
      selections: 10,
      winners: 4,
      strikeRate: 40,
      roiPercentage: 20,
      profitLoss: 2,
      maxConsecutiveLosers: 3,
    },
  };
}
