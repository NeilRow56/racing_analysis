import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import {
  clearTodayResultRefreshChecksForTest,
  getEligibleResultRefreshRaces,
  raceDateTimeFromLondonScheduledTime,
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

  test("force retry bypasses the retry interval for manual refresh", async () => {
    const meetings = [meeting(race())];
    const now = new Date("2026-09-12T14:00:00.000Z");
    await refreshEligibleTodaySelectionResults(meetings, "2026-09-12", {
      now,
      refreshRaceResult: async (refreshRace) => outcome(refreshRace, "not_ready"),
    });

    const eligible = getEligibleResultRefreshRaces(meetings, "2026-09-12", {
      forceRetry: true,
      now: new Date("2026-09-12T14:01:00.000Z"),
    });

    assert.equal(eligible.length, 1);
  });

  test("race scheduled-time fallback uses Europe/London during BST", () => {
    assert.equal(
      raceDateTimeFromLondonScheduledTime("2026-09-12", "16:00:00")?.toISOString(),
      "2026-09-12T15:00:00.000Z",
    );

    const eligibleBeforeBuffer = getEligibleResultRefreshRaces(
      [meeting(race({ scheduledTime: "16:00:00", raceDateTime: null }))],
      "2026-09-12",
      { now: new Date("2026-09-12T15:09:59.000Z") },
    );
    const eligibleAtBuffer = getEligibleResultRefreshRaces(
      [meeting(race({ scheduledTime: "16:00:00", raceDateTime: null }))],
      "2026-09-12",
      { now: new Date("2026-09-12T15:10:00.000Z") },
    );

    assert.equal(eligibleBeforeBuffer.length, 0);
    assert.equal(eligibleAtBuffer.length, 1);
  });

  test("race scheduled-time fallback uses Europe/London during GMT", () => {
    assert.equal(
      raceDateTimeFromLondonScheduledTime("2026-12-05", "16:00:00")?.toISOString(),
      "2026-12-05T16:00:00.000Z",
    );

    const eligible = getEligibleResultRefreshRaces(
      [meeting(race({ scheduledTime: "16:00:00", raceDateTime: null }))],
      "2026-12-05",
      { now: new Date("2026-12-05T16:10:00.000Z") },
    );

    assert.equal(eligible.length, 1);
  });

  test("BST afternoon races become eligible exactly ten minutes after local off time", () => {
    const raceTimes = [
      ["15:30:00", "2026-09-12T14:30:00.000Z"],
      ["16:00:00", "2026-09-12T15:00:00.000Z"],
      ["16:30:00", "2026-09-12T15:30:00.000Z"],
      ["17:00:00", "2026-09-12T16:00:00.000Z"],
      ["18:00:00", "2026-09-12T17:00:00.000Z"],
    ] as const;

    for (const [scheduledTime, instant] of raceTimes) {
      const scheduledAt = new Date(instant);
      const beforeBuffer = getEligibleResultRefreshRaces(
        [meeting(race({ scheduledTime, raceDateTime: scheduledAt }))],
        "2026-09-12",
        { now: new Date(scheduledAt.getTime() + 9 * 60_000) },
      );
      const atBuffer = getEligibleResultRefreshRaces(
        [meeting(race({ scheduledTime, raceDateTime: scheduledAt }))],
        "2026-09-12",
        { now: new Date(scheduledAt.getTime() + 10 * 60_000) },
      );
      const afterBuffer = getEligibleResultRefreshRaces(
        [meeting(race({ scheduledTime, raceDateTime: scheduledAt }))],
        "2026-09-12",
        { now: new Date(scheduledAt.getTime() + 20 * 60_000) },
      );

      assert.equal(beforeBuffer.length, 0, `${scheduledTime} should not refresh after 9 minutes`);
      assert.equal(atBuffer.length, 1, `${scheduledTime} should refresh after 10 minutes`);
      assert.equal(afterBuffer.length, 1, `${scheduledTime} should refresh after 20 minutes`);
    }
  });

  test("retry throttle expires after fifteen minutes", async () => {
    const meetings = [meeting(race())];
    await refreshEligibleTodaySelectionResults(meetings, "2026-09-12", {
      now: new Date("2026-09-12T14:00:00.000Z"),
      refreshRaceResult: async (refreshRace) => outcome(refreshRace, "not_ready"),
    });

    const eligible = getEligibleResultRefreshRaces(meetings, "2026-09-12", {
      now: new Date("2026-09-12T14:15:00.000Z"),
    });

    assert.equal(eligible.length, 1);
  });

  test("retry throttle is independent per source race", async () => {
    const checkedRace = race({ sourceId: "937435" });
    const uncheckedRace = race({
      raceId: "race-2",
      sourceId: "937436",
      raceName: "Carlisle Handicap",
    });
    await refreshEligibleTodaySelectionResults(
      [meeting(checkedRace), meeting(uncheckedRace)],
      "2026-09-12",
      {
        now: new Date("2026-09-12T14:00:00.000Z"),
        refreshRaceResult: async (refreshRace) =>
          refreshRace.race.sourceId === "937435"
            ? outcome(refreshRace, "not_ready")
            : outcome(refreshRace, "imported"),
      },
    );

    const eligible = getEligibleResultRefreshRaces(
      [meeting(checkedRace), meeting(uncheckedRace)],
      "2026-09-12",
      { now: new Date("2026-09-12T14:01:00.000Z") },
    );

    assert.deepEqual(
      eligible.map((refreshRace) => refreshRace.race.sourceId),
      [],
    );

    const nextRaceEligible = getEligibleResultRefreshRaces(
      [
        meeting(checkedRace),
        meeting(race({ raceId: "race-3", sourceId: "937437", raceName: "Carlisle Stakes" })),
      ],
      "2026-09-12",
      { now: new Date("2026-09-12T14:01:00.000Z") },
    );

    assert.deepEqual(
      nextRaceEligible.map((refreshRace) => refreshRace.race.sourceId),
      ["937437"],
    );
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
