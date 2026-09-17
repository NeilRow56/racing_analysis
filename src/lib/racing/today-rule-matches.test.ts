import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { defaultResearchRule, type ResearchRuleV1 } from "./research-rule";
import type { SavedResearchRule } from "./saved-research-rules";
import { trainerCohortRule, type ResolvedTrainerCohort } from "./trainer-cohorts";
import { TURF_PERFORMANCE_RATING_VERSION } from "./turf-performance-rating";
import {
  attachFrozenRuleMatchesToToday,
  buildTodayRuleSelections,
  summarizeTodayFrozenRuleMatches,
} from "./today-rule-matches";
import type {
  TodayMeeting,
  TodayRace,
  TodayRunner,
  TodaySavedRuleMatch,
} from "./todays-racing";

describe("Today frozen rule matching", () => {
  test("matches only runners satisfying the full frozen rule with race-wide ranks", () => {
    const matched = matchIds(exampleFrozenRule());

    assert.deepEqual(matched, ["runner-rank-2", "runner-rank-3"]);
  });

  test("rejects wrong family, trainer, race type, distance, return bucket and speed", () => {
    assert.deepEqual(matchIds(exampleFrozenRule({ family: "jump" })), []);
    assert.deepEqual(matchIds(exampleFrozenRule(), {}, { trainerId: "other-trainer" }), []);
    assert.deepEqual(matchIds(exampleFrozenRule(), { raceName: "Class 3 Handicap", raceType: "Handicap" }), []);
    assert.deepEqual(matchIds(exampleFrozenRule(), { distanceYards: 3520 }), []);
    assert.deepEqual(matchIds(exampleFrozenRule(), {}, {}, { daysSinceLastRun: 45 }), []);
    assert.deepEqual(matchIds(exampleFrozenRule(), {}, {}, { bestTurfSpeedLast3: 79 }), []);
  });

  test("ignores the development date range when matching current races", () => {
    const matched = matchIds(exampleFrozenRule({
      dateRange: { from: "2025-01-01", to: "2025-12-31" },
    }), {}, {}, {}, "2026-09-11");

    assert.deepEqual(matched, ["runner-rank-2", "runner-rank-3"]);
  });

  test("missing rank metric and non-runner do not match", () => {
    const matched = matchIds(
      exampleFrozenRule(),
      {},
      {},
      {},
      "2026-09-11",
      [
        runner("runner-rank-1", { latestPerformanceRating: 100 }),
        runner("runner-rank-2", { latestPerformanceRating: 95 }),
        runner("runner-missing-rank", { latestPerformanceRating: null }),
        runner("runner-non-runner", { latestPerformanceRating: 90 }, { resultStatus: "non_runner" }),
      ],
    );

    assert.deepEqual(matched, ["runner-rank-2"]);
  });

  test("matches official rating rank alongside the generic rank filter", () => {
    const matched = matchIds(
      exampleFrozenRule({
        ranks: [
          { metric: "latestPerformanceRating", range: { min: 3 } },
          { metric: "officialRating", range: { min: 3 } },
        ],
      }),
      {},
      {},
      {},
      "2026-09-11",
      [
        runner("runner-rank-1", { latestPerformanceRating: 100 }, { officialRating: 120 }),
        runner("runner-rank-2", { latestPerformanceRating: 95 }, { officialRating: 115 }),
        runner("runner-rank-3", { latestPerformanceRating: 90 }, { officialRating: 110 }),
        runner("runner-rank-4", { latestPerformanceRating: 80 }, { officialRating: 105 }),
      ],
    );

    assert.deepEqual(matched, ["runner-rank-3", "runner-rank-4"]);
  });

  test("matches frozen TPR version rules using current Today TPR inputs", () => {
    const matched = matchIds(
      exampleFrozenRule({
        race: {},
        runner: {},
        ratings: [],
        ranks: [],
        turfPerformance: {
          version: TURF_PERFORMANCE_RATING_VERSION,
          rank: { min: 1, max: 1 },
          lead: { min: 10 },
        },
      }),
      {},
      {},
      {},
      "2026-09-11",
      [
        runner("tpr-top", {
          latestPerformanceRating: 120,
          previousPerformanceRating: null,
          averagePerformanceLast3: null,
          latestTurfSpeedRating: 135,
          previousTurfSpeedRating: null,
          averageTurfSpeedLast3: null,
        }, { weightCarriedLbs: 126 }),
        runner("tpr-second", {
          latestPerformanceRating: 85,
          previousPerformanceRating: null,
          averagePerformanceLast3: null,
          latestTurfSpeedRating: 100,
          previousTurfSpeedRating: null,
          averageTurfSpeedLast3: null,
        }, { weightCarriedLbs: 126 }),
        runner("tpr-third", {
          latestPerformanceRating: 75,
          previousPerformanceRating: null,
          averagePerformanceLast3: null,
          latestTurfSpeedRating: 90,
          previousTurfSpeedRating: null,
          averageTurfSpeedLast3: null,
        }, { weightCarriedLbs: 126 }),
      ],
    );

    assert.deepEqual(matched, ["tpr-top"]);
  });

  test("matches generic TPR rank rules using production W100 Today inputs", () => {
    const matched = matchIds(
      exampleFrozenRule({
        race: {},
        runner: {},
        ratings: [],
        ranks: [{ metric: "turfPerformanceRating", range: { min: 1, max: 1 } }],
      }),
      {},
      {},
      {},
      "2026-09-11",
      [
        runner("tpr-top", {
          latestPerformanceRating: 120,
          previousPerformanceRating: null,
          averagePerformanceLast3: null,
          latestTurfSpeedRating: 135,
          previousTurfSpeedRating: null,
          averageTurfSpeedLast3: null,
        }, { weightCarriedLbs: 126 }),
        runner("tpr-second", {
          latestPerformanceRating: 85,
          previousPerformanceRating: null,
          averagePerformanceLast3: null,
          latestTurfSpeedRating: 100,
          previousTurfSpeedRating: null,
          averageTurfSpeedLast3: null,
        }, { weightCarriedLbs: 126 }),
        runner("missing-tpr", {
          latestPerformanceRating: null,
          latestTurfSpeedRating: null,
        }, { weightCarriedLbs: 126 }),
      ],
    );

    assert.deepEqual(matched, ["tpr-top"]);
  });

  test("supports multiple frozen matches and ignores drafts", () => {
    const extraRule = savedRule("rule-extra", "Extra frozen rule", exampleRule({
      ranks: [],
      ratings: [{ metric: "bestSpeedLast3", range: { min: 80 } }],
    }), "frozen");
    const draft = savedRule("rule-draft", "Draft rule", exampleRule({ ranks: [] }), "draft");
    const meeting = meetingWithRace(race(), [
      runner("runner-rank-1", { latestPerformanceRating: 100 }),
      runner("runner-rank-2", { latestPerformanceRating: 95 }),
      runner("runner-rank-3", { latestPerformanceRating: 90 }),
      runner("runner-rank-4", { latestPerformanceRating: 80 }),
    ]);

    const [displayMeeting] = attachFrozenRuleMatchesToToday(
      [meeting],
      [exampleFrozenRule(), extraRule, draft],
      "2026-09-11",
    );
    const secondRunner = displayMeeting!.races[0]!.runners.find((item) => item.runnerId === "runner-rank-2");

    assert.deepEqual(
      secondRunner?.savedRuleMatches?.map((match) => match.ruleName),
      ["K R Burke Turf Non-Handicap 80+", "Extra frozen rule"],
    );
  });

  test("does not partially match metric-dependent rules when current metrics are unavailable", () => {
    const matched = matchIds(
      exampleFrozenRule(),
      {},
      { metrics: null },
    );

    assert.deepEqual(matched, []);
  });

  test("matches trainer-quality rules only when current trainer metrics satisfy them", () => {
    const rule = exampleFrozenRule({
      runner: {
        trainerId: "trainer-burke",
        trainerPriorRuns: { min: 50 },
        trainerPriorWinRate: { min: 10, max: 20 },
      },
      ratings: [],
      ranks: [],
    });

    assert.deepEqual(
      matchIds(rule, {}, { trainerMetrics: { trainerPriorRuns: 80, trainerPriorWins: 12, trainerPriorWinRate: 15 } }),
      ["runner-rank-1", "runner-rank-2", "runner-rank-3", "runner-rank-4"],
    );
    assert.deepEqual(
      matchIds(rule, {}, { trainerMetrics: { trainerPriorRuns: 49, trainerPriorWins: 8, trainerPriorWinRate: 16.3265306122449 } }),
      [],
    );
    assert.deepEqual(
      matchIds(rule, {}, { trainerMetrics: { trainerPriorRuns: 80, trainerPriorWins: 0, trainerPriorWinRate: null } }),
      [],
    );
    assert.deepEqual(matchIds(rule), []);
  });

  test("uses the same career prior-runs numeric semantics for frozen rules", () => {
    const rule = exampleFrozenRule({
      runner: { priorRuns: { min: 1, max: 1 } },
      ratings: [],
      ranks: [],
    });
    const matched = matchIds(
      rule,
      {},
      {},
      {},
      "2026-09-11",
      [
        runner("debutant", { priorRuns: 0 }),
        runner("one-run", { priorRuns: 1 }),
        runner("two-runs", { priorRuns: 2 }),
        runner("missing-metrics", {}, { metrics: null }),
      ],
    );

    assert.deepEqual(matched, ["one-run"]);
  });

  test("matches manual trainer and course arrays with OR semantics for frozen rules", () => {
    const rule = exampleFrozenRule({
      race: { courseIds: ["course-carlisle", "course-york"] },
      runner: { trainerIds: ["trainer-burke", "trainer-other"] },
      ratings: [],
      ranks: [],
    });
    const [displayMeeting] = attachFrozenRuleMatchesToToday(
      [meetingWithRace(race(), [
        runner("burke-runner", {}, { trainerId: "trainer-burke" }),
        runner("other-runner", {}, { trainerId: "trainer-other" }),
        runner("rejected-runner", {}, { trainerId: "trainer-missing" }),
      ])],
      [rule],
      "2026-09-11",
    );

    assert.deepEqual(
      displayMeeting!.races[0]!.runners
        .filter((item) => (item.savedRuleMatches?.length ?? 0) > 0)
        .map((item) => item.runnerId),
      ["burke-runner", "other-runner"],
    );
  });

  test("matches manual jockey arrays and jockey prior metrics for frozen rules", () => {
    const rule = exampleFrozenRule({
      race: {},
      runner: {
        jockeyIds: ["jockey-a", "jockey-c"],
        jockeyPriorRuns: { min: 50 },
        jockeyPriorWinRate: { min: 15 },
      },
      ratings: [],
      ranks: [],
    });
    const matched = matchIds(
      rule,
      {},
      {},
      {},
      "2026-09-11",
      [
        runner("selected", {}, {
          jockeyId: "jockey-a",
          jockeyName: "A Jockey",
          jockeyMetrics: { jockeyPriorRuns: 80, jockeyPriorWins: 16, jockeyPriorWinRate: 20 },
        }),
        runner("low-runs", {}, {
          jockeyId: "jockey-a",
          jockeyName: "A Jockey",
          jockeyMetrics: { jockeyPriorRuns: 49, jockeyPriorWins: 10, jockeyPriorWinRate: 20.4 },
        }),
        runner("wrong-jockey", {}, {
          jockeyId: "jockey-b",
          jockeyName: "B Jockey",
          jockeyMetrics: { jockeyPriorRuns: 80, jockeyPriorWins: 16, jockeyPriorWinRate: 20 },
        }),
        runner("missing-rate", {}, {
          jockeyId: "jockey-c",
          jockeyName: "C Jockey",
          jockeyMetrics: { jockeyPriorRuns: 0, jockeyPriorWins: 0, jockeyPriorWinRate: null },
        }),
      ],
    );

    assert.deepEqual(matched, ["selected"]);
  });

  test("does not confirm SP-filtered frozen matches before final SP settlement is available", () => {
    const rule = exampleFrozenRule({
      race: {},
      runner: {},
      ratings: [],
      ranks: [],
      startingPrice: { minDecimal: 4, maxDecimalExclusive: 7 },
    });

    assert.deepEqual(matchIds(rule), []);
  });

  test("matches SP-filtered frozen rules once Today final SP settlement is available", () => {
    const rule = exampleFrozenRule({
      race: {},
      runner: {},
      ratings: [],
      ranks: [],
      startingPrice: { minDecimal: 4, maxDecimalExclusive: 7 },
    });

    assert.deepEqual(
      matchIds(rule, {}, {}, {}, "2026-09-11", [
        runner("below", {}, {
          finishingPosition: 4,
          odds: "2/1",
          oddsDecimal: "3",
          resultStatus: "finished",
        }),
        runner("selected", {}, {
          finishingPosition: 4,
          odds: "5/1",
          oddsDecimal: "6",
          resultStatus: "finished",
        }),
        runner("above", {}, {
          finishingPosition: 4,
          odds: "6/1",
          oddsDecimal: "7",
          resultStatus: "finished",
        }),
      ]),
      ["selected"],
    );
  });

  test("matches trainer cohort rules using supplied 2026 prior-year membership", () => {
    const rule = exampleFrozenRule({
      runner: { trainerCohort: trainerCohortRule(20) },
      ratings: [],
      ranks: [],
    });
    const matched = matchIds(
      rule,
      {},
      {},
      {},
      "2026-09-11",
      [
        runner("cohort-runner", {}, { trainerId: "trainer-2025" }),
        runner("old-dev-runner", {}, { trainerId: "trainer-2024" }),
      ],
      new Map([[rule.id, resolvedCohort(rule, ["trainer-2025"], 2026)]]),
    );

    assert.deepEqual(matched, ["cohort-runner"]);
  });

  test("summarizes zero frozen rules and zero matches", () => {
    const [displayMeeting] = attachFrozenRuleMatchesToToday(
      [meetingWithRace(race(), [runner("runner-rank-2", { latestPerformanceRating: 95 })])],
      [],
      "2026-09-11",
    );

    assert.deepEqual(summarizeTodayFrozenRuleMatches([displayMeeting!], 0), {
      frozenRulesChecked: 0,
      matchingRunners: 0,
      ruleMatches: 0,
    });
  });

  test("summarizes one frozen rule with no matching runners", () => {
    const [displayMeeting] = attachFrozenRuleMatchesToToday(
      [meetingWithRace(race(), [runner("runner-rank-2", { latestPerformanceRating: 95 }, { trainerId: "other-trainer" })])],
      [exampleFrozenRule()],
      "2026-09-11",
    );

    assert.deepEqual(summarizeTodayFrozenRuleMatches([displayMeeting!], 1), {
      frozenRulesChecked: 1,
      matchingRunners: 0,
      ruleMatches: 0,
    });
  });

  test("summarizes multiple frozen rules with one matching runner", () => {
    const [displayMeeting] = attachFrozenRuleMatchesToToday(
      [meetingWithRace(race(), [
        runner("runner-rank-1", { latestPerformanceRating: 100 }),
        runner("runner-rank-2", { latestPerformanceRating: 95 }),
      ])],
      [
        exampleFrozenRule(),
        savedRule("rule-other", "Other frozen rule", exampleRule({
          runner: { trainerId: "other-trainer" },
        }), "frozen"),
      ],
      "2026-09-11",
    );

    assert.deepEqual(summarizeTodayFrozenRuleMatches([displayMeeting!], 2), {
      frozenRulesChecked: 2,
      matchingRunners: 1,
      ruleMatches: 1,
    });
  });

  test("counts one runner matching multiple rules as one matching runner", () => {
    const [displayMeeting] = attachFrozenRuleMatchesToToday(
      [meetingWithRace(race(), [
        runner("runner-rank-1", { latestPerformanceRating: 100 }),
        runner("runner-rank-2", { latestPerformanceRating: 95 }),
      ])],
      [
        exampleFrozenRule(),
        savedRule("rule-extra", "Extra frozen rule", exampleRule(), "frozen"),
      ],
      "2026-09-11",
    );

    assert.deepEqual(summarizeTodayFrozenRuleMatches([displayMeeting!], 2), {
      frozenRulesChecked: 2,
      matchingRunners: 1,
      ruleMatches: 2,
    });
  });
});

describe("Today rule selections", () => {
  test("shows no selections summary and rows when no runners have matches", () => {
    const selections = buildTodayRuleSelections([
      meetingWithRace(race(), [runner("runner-rank-2", { latestPerformanceRating: 95 })]),
    ]);

    assert.deepEqual(selections.summary, {
      selections: 0,
      settled: 0,
      profitLoss: 0,
    });
    assert.deepEqual(selections.rows, []);
  });

  test("includes one unsettled selection without counting it in P/L", () => {
    const selections = buildTodayRuleSelections([
      meetingWithRace(race(), [
        runner("runner-unsettled", {}, { savedRuleMatches: [todayMatch("rule-a", "Rule A")] }),
      ]),
    ]);

    assert.equal(selections.rows.length, 1);
    assert.equal(selections.rows[0]?.result, "—");
    assert.equal(selections.rows[0]?.settlement, null);
    assert.deepEqual(selections.summary, {
      selections: 1,
      settled: 0,
      profitLoss: 0,
    });
  });

  test("settles a winning selection at 5/1 as plus five pounds", () => {
    const selections = buildTodayRuleSelections([
      meetingWithRace(race(), [
        runner("runner-winner", {}, {
          finishingPosition: 1,
          odds: "5/1",
          oddsDecimal: "6",
          resultStatus: "finished",
          savedRuleMatches: [todayMatch("rule-a", "Rule A")],
        }),
      ]),
    ]);

    assert.equal(selections.rows[0]?.result, "1");
    assert.equal(selections.rows[0]?.settlement?.profitLoss, 5);
    assert.deepEqual(selections.summary, {
      selections: 1,
      settled: 1,
      profitLoss: 5,
    });
  });

  test("settles a losing selection as minus one pound", () => {
    const selections = buildTodayRuleSelections([
      meetingWithRace(race(), [
        runner("runner-loser", {}, {
          finishingPosition: 2,
          odds: "5/1",
          oddsDecimal: "6",
          resultStatus: "finished",
          savedRuleMatches: [todayMatch("rule-a", "Rule A")],
        }),
      ]),
    ]);

    assert.equal(selections.rows[0]?.result, "2");
    assert.equal(selections.rows[0]?.settlement?.profitLoss, -1);
    assert.deepEqual(selections.summary, {
      selections: 1,
      settled: 1,
      profitLoss: -1,
    });
  });

  test("sums multiple settled selections and excludes unsettled runners", () => {
    const selections = buildTodayRuleSelections([
      meetingWithRace(race(), [
        runner("runner-winner", {}, {
          finishingPosition: 1,
          oddsDecimal: "6",
          resultStatus: "finished",
          savedRuleMatches: [todayMatch("rule-a", "Rule A")],
        }),
        runner("runner-loser", {}, {
          finishingPosition: 4,
          oddsDecimal: "3",
          resultStatus: "finished",
          savedRuleMatches: [todayMatch("rule-b", "Rule B")],
        }),
        runner("runner-unsettled", {}, {
          savedRuleMatches: [todayMatch("rule-c", "Rule C")],
        }),
      ]),
    ]);

    assert.deepEqual(selections.summary, {
      selections: 3,
      settled: 2,
      profitLoss: 4,
    });
  });

  test("keeps one row for a horse matching multiple rules and counts P/L once", () => {
    const selections = buildTodayRuleSelections([
      meetingWithRace(race(), [
        runner("runner-multi-rule", {}, {
          finishingPosition: 1,
          odds: "5/1",
          oddsDecimal: "6",
          resultStatus: "finished",
          savedRuleMatches: [
            todayMatch("rule-a", "Rule A"),
            todayMatch("rule-b", "Rule B"),
          ],
        }),
      ]),
    ]);

    assert.equal(selections.rows.length, 1);
    assert.deepEqual(selections.rows[0]?.ruleNames, ["Rule A", "Rule B"]);
    assert.deepEqual(selections.summary, {
      selections: 1,
      settled: 1,
      profitLoss: 5,
    });
  });

  test("shows non-runners as unsettled and excludes them from the total", () => {
    const selections = buildTodayRuleSelections([
      meetingWithRace(race(), [
        runner("runner-nr", {}, {
          resultStatus: "non_runner",
          odds: "5/1",
          oddsDecimal: "6",
          savedRuleMatches: [todayMatch("rule-a", "Rule A")],
        }),
      ]),
    ]);

    assert.equal(selections.rows[0]?.result, "NR");
    assert.equal(selections.rows[0]?.settlement, null);
    assert.deepEqual(selections.summary, {
      selections: 1,
      settled: 0,
      profitLoss: 0,
    });
  });

  test("sorts rows in race time order", () => {
    const selections = buildTodayRuleSelections([
      meetingWithRace(
        race({
          raceId: "race-late",
          scheduledTime: "16:10:00",
          raceDateTime: new Date("2026-09-11T15:10:00.000Z"),
        }),
        [
          runner("runner-late", {}, {
            horseName: "Late Horse",
            savedRuleMatches: [todayMatch("rule-a", "Rule A")],
          }),
        ],
      ),
      meetingWithRace(
        race({
          raceId: "race-early",
          scheduledTime: "13:40:00",
          raceDateTime: new Date("2026-09-11T12:40:00.000Z"),
        }),
        [
          runner("runner-early", {}, {
            horseName: "Early Horse",
            savedRuleMatches: [todayMatch("rule-a", "Rule A")],
          }),
        ],
      ),
    ]);

    assert.deepEqual(
      selections.rows.map((row) => row.horseName),
      ["Early Horse", "Late Horse"],
    );
  });
});

function matchIds(
  rule: SavedResearchRule,
  raceOverrides: Partial<TodayRace> = {},
  runnerOverrides: Partial<TodayRunner> = {},
  metricOverrides: Partial<NonNullable<TodayRunner["metrics"]>> = {},
  raceDate = "2026-09-11",
  runners = [
    runner("runner-rank-1", { latestPerformanceRating: 100 }, runnerOverrides, metricOverrides),
    runner("runner-rank-2", { latestPerformanceRating: 95 }, runnerOverrides, metricOverrides),
    runner("runner-rank-3", { latestPerformanceRating: 90 }, runnerOverrides, metricOverrides),
    runner("runner-rank-4", { latestPerformanceRating: 80 }, runnerOverrides, metricOverrides),
  ],
  trainerCohortsByRule = new Map<string, ResolvedTrainerCohort | null>(),
): string[] {
  const [displayMeeting] = attachFrozenRuleMatchesToToday(
    [meetingWithRace(race(raceOverrides), runners)],
    [rule],
    raceDate,
    trainerCohortsByRule,
  );
  return displayMeeting!.races[0]!.runners
    .filter((item) => (item.savedRuleMatches?.length ?? 0) > 0)
    .map((item) => item.runnerId);
}

function exampleFrozenRule(overrides: Partial<ResearchRuleV1> = {}): SavedResearchRule {
  return savedRule("rule-burke", "K R Burke Turf Non-Handicap 80+", exampleRule(overrides), "frozen");
}

function exampleRule(overrides: Partial<ResearchRuleV1> = {}): ResearchRuleV1 {
  return {
    ...defaultResearchRule("turf_flat"),
    race: {
      distanceYards: { min: 1100, max: 3080 },
      handicapStatus: "non_handicap",
      raceClasses: [3],
    },
    runner: {
      trainerId: "trainer-burke",
      returnBucket: "days_0_30",
    },
    ratings: [{ metric: "bestSpeedLast3", range: { min: 80 } }],
    relatives: [],
    ranks: [{ metric: "latestPerformanceRating", range: { min: 2, max: 3 } }],
    ...overrides,
  };
}

function savedRule(
  id: string,
  name: string,
  rule: ResearchRuleV1,
  status: SavedResearchRule["status"],
): SavedResearchRule {
  return {
    id,
    name,
    notes: null,
    status,
    ruleSchemaVersion: "research_rule_v1",
    ruleIdentity: id,
    canonicalRule: rule,
    family: rule.family,
    developmentFrom: rule.dateRange.from,
    developmentTo: rule.dateRange.to,
    developmentSnapshot: {
      eligibleRunners: 139,
      selections: 39,
      settledSelections: 39,
      winners: 18,
      strikeRate: 46.15384615384615,
      places: 26,
      placeStrikeRate: 66.66666666666666,
      profitLoss: 40.134,
      roiPercentage: 102.9076923076923,
      maxConsecutiveLosers: 5,
    },
    holdoutSnapshot: null,
    cacheMetadata: null,
    createdAt: new Date("2026-09-11T10:00:00.000Z"),
    updatedAt: new Date("2026-09-11T10:00:00.000Z"),
    frozenAt: status === "frozen" ? new Date("2026-09-11T10:30:00.000Z") : null,
  };
}

function resolvedCohort(rule: SavedResearchRule, trainerIds: string[], cohortYear: number): ResolvedTrainerCohort {
  const parsed = rule.canonicalRule as ResearchRuleV1;
  return {
    definition: parsed.runner.trainerCohort ?? trainerCohortRule(10),
    cohortYear,
    referenceYear: cohortYear - 1,
    family: parsed.family,
    members: trainerIds.map((trainerId, index) => ({
      cohortYear,
      referenceYear: cohortYear - 1,
      family: parsed.family,
      rank: index + 1,
      trainerId,
      trainerName: `Trainer ${index + 1}`,
      priorYearRuns: 50,
      priorYearWins: 10 - index,
      priorYearWinRate: 20 - index,
    })),
    trainerIds: new Set(trainerIds),
  };
}

function todayMatch(ruleId: string, ruleName: string): TodaySavedRuleMatch {
  return {
    ruleId,
    ruleName,
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

function meetingWithRace(race: TodayRace, runners: TodayRunner[]): TodayMeeting {
  return {
    courseId: "course-carlisle",
    courseSourceId: "302",
    courseName: "Carlisle",
    country: "ENG",
    order: 0,
    races: [{ ...race, runners }],
  };
}

function race(overrides: Partial<TodayRace> = {}): TodayRace {
  return {
    raceId: "race-1",
    sourceId: "race-source-1",
    scheduledTime: "13:40:00",
    raceDateTime: new Date("2026-09-11T12:40:00.000Z"),
    courseCountry: "ENG",
    raceName: "Class 3 Fillies Stakes",
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

function runner(
  runnerId: string,
  metricOverrides: Partial<NonNullable<TodayRunner["metrics"]>> = {},
  runnerOverrides: Partial<TodayRunner> = {},
  sharedMetricOverrides: Partial<NonNullable<TodayRunner["metrics"]>> = {},
): TodayRunner {
  return {
    runnerId,
    runnerSourceId: runnerId,
    horseId: `horse-${runnerId}`,
    horseName: runnerId,
    saddleclothNumber: Number(runnerId.replace(/\D/g, "")) || 1,
    horseAge: 4,
    horseSex: "f",
    weight: "9-2",
    weightCarriedLbs: 128,
    draw: 4,
    jockeyName: "A Jockey",
    trainerId: "trainer-burke",
    trainerName: "K R Burke",
    officialRating: 92,
    odds: "6/1",
    oddsDecimal: null,
    resultStatus: null,
    finishingPosition: null,
    metrics: metrics({ ...sharedMetricOverrides, ...metricOverrides }),
    ...runnerOverrides,
  };
}

function metrics(
  overrides: Partial<NonNullable<TodayRunner["metrics"]>> = {},
): NonNullable<TodayRunner["metrics"]> {
  return {
    priorRuns: 3,
    priorWins: 1,
    priorPlaces: 2,
    winPercentage: 33.333,
    placePercentage: 66.667,
    latestRpr: null,
    previousRpr: null,
    bestRprLast3: null,
    bestRprLast5: null,
    averageRprLast3: null,
    averageRprLast5: null,
    latestTs: null,
    previousTs: null,
    bestTsLast3: null,
    bestTsLast5: null,
    averageTsLast3: null,
    averageTsLast5: null,
    latestJumpSpeedRating: null,
    previousJumpSpeedRating: null,
    bestJumpSpeedLast3: null,
    bestJumpSpeedLast5: null,
    averageJumpSpeedLast3: null,
    averageJumpSpeedLast5: null,
    latestAwSpeedRating: null,
    previousAwSpeedRating: null,
    bestAwSpeedLast3: null,
    bestAwSpeedLast5: null,
    averageAwSpeedLast3: null,
    averageAwSpeedLast5: null,
    latestTurfSpeedRating: 82,
    previousTurfSpeedRating: 79,
    bestTurfSpeedLast3: 82,
    bestTurfSpeedLast5: 82,
    averageTurfSpeedLast3: 80,
    averageTurfSpeedLast5: 80,
    latestPerformanceRating: 95,
    previousPerformanceRating: 89,
    bestPerformanceLast3: 95,
    bestPerformanceLast5: 95,
    averagePerformanceLast3: 91,
    averagePerformanceLast5: 91,
    latestTodaysRating: 96,
    previousTodaysRating: 90,
    bestTodaysRatingLast3: 96,
    bestTodaysRatingLast5: 96,
    averageTodaysRatingLast3: 92,
    averageTodaysRatingLast5: 92,
    todaysRatingCalculationVersion: "todays_rating_v1",
    latestJumpTodaysRating: null,
    latestAwTodaysRating: null,
    latestTurfTodaysRating: 96,
    latestOr: 90,
    latestRprMinusPreviousRpr: null,
    latestTsMinusPreviousTs: null,
    latestRprMinusLatestOr: null,
    latestRunDate: "2026-08-25",
    daysSinceLastRun: 17,
    breakLengthDays: null,
    runAfterBreakNumber: null,
    runsAtCourse: 0,
    winsAtCourse: 0,
    placesAtCourse: 0,
    runsAtExactDistance: 1,
    winsAtExactDistance: 0,
    placesAtExactDistance: 1,
    runsOnGoing: 2,
    winsOnGoing: 1,
    placesOnGoing: 1,
    ...overrides,
  };
}
