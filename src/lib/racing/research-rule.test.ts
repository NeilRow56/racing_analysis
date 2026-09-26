import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  defaultResearchRule,
  distanceBucketIdForYards,
  evaluateResearchRule,
  formatExactDistance,
  formatWeightLbsAsStonePounds,
  hydrateResearchRuleMetadata,
  jockeyOptionsForRows,
  parseWeightOptionToLbs,
  parseResearchRule,
  rankRows,
  ruleFromSearchParams,
  classifyHandicapStatus,
  courseOptionsForRows,
  researchFilterOptionsForRows,
  serializeResearchRule,
  strategySummary,
  trainerOptionsForRows,
  weightOptions,
  type ResearchRuleV1,
} from "./research-rule";
import { researchRuleKey } from "./research-rule-identity";
import { CANONICAL_SETTLEMENT_VERSION } from "./research-settlement-version";
import { trainerCohortRule, type ResolvedTrainerCohort } from "./trainer-cohorts";
import {
  buildCanonicalTurfPerformanceRatingInput,
  calculateTurfPerformanceRating,
  TURF_PERFORMANCE_RATING_VERSION,
  TURF_PERFORMANCE_RATING_W50_WEIGHT_MULTIPLIER,
} from "./turf-performance-rating";
import type {
  HistoricalPostRaceOutcome,
  HistoricalPreRaceFeatureRow,
  HistoricalTargetRunnerMetricsRow,
} from "./historical-target-metrics";

describe("research rule ranking", () => {
  test("assigns clear ranks, preserves ties and resets per race", () => {
    const ranked = rankRows([
      row({ targetRaceId: "race-a", targetRunnerId: "a1", latestSpeedRating: 100 }),
      row({ targetRaceId: "race-a", targetRunnerId: "a2", latestSpeedRating: 90 }),
      row({ targetRaceId: "race-a", targetRunnerId: "a3", latestSpeedRating: 90 }),
      row({ targetRaceId: "race-b", targetRunnerId: "b1", latestSpeedRating: 80 }),
    ]);
    const ranks = new Map(ranked.map((entry) => [entry.features.targetRunnerId, entry.ranks.latestSpeedRating]));

    assert.equal(ranks.get("a1"), 1);
    assert.equal(ranks.get("a2"), 2);
    assert.equal(ranks.get("a3"), 2);
    assert.equal(ranks.get("b1"), 1);
  });

  test("excludes missing ratings and non-runners from ranking", () => {
    const ranked = rankRows([
      row({ targetRunnerId: "valid", latestSpeedRating: 100 }),
      row({ targetRunnerId: "missing", latestSpeedRating: null }),
      row({ targetRunnerId: "nr", latestSpeedRating: 110 }, { resultStatus: "non_runner" }),
    ]);
    const ranks = new Map(ranked.map((entry) => [entry.features.targetRunnerId, entry.ranks.latestSpeedRating]));

    assert.equal(ranks.get("valid"), 1);
    assert.equal(ranks.get("missing"), undefined);
    assert.equal(ranks.get("nr"), undefined);
  });

  test("ranks official ratings highest first with competition ties", () => {
    const ranked = rankRows([
      row({ targetRunnerId: "top-or", officialRating: 100 }),
      row({ targetRunnerId: "second-or", officialRating: 95 }),
      row({ targetRunnerId: "tied-third-a", officialRating: 90 }),
      row({ targetRunnerId: "tied-third-b", officialRating: 90 }),
      row({ targetRunnerId: "missing-or", officialRating: null }),
    ]);
    const ranks = new Map(ranked.map((entry) => [entry.features.targetRunnerId, entry.ranks.officialRating]));

    assert.equal(ranks.get("top-or"), 1);
    assert.equal(ranks.get("second-or"), 2);
    assert.equal(ranks.get("tied-third-a"), 3);
    assert.equal(ranks.get("tied-third-b"), 3);
    assert.equal(ranks.get("missing-or"), undefined);
  });
});

describe("research rule evaluation", () => {
  test("blank filters do not filter and missing values are not treated as zero", () => {
    const result = evaluateResearchRule({
      rows: [
        row({ targetRunnerId: "with-or", officialRating: 100 }),
        row({ targetRunnerId: "missing-or", officialRating: null }),
      ],
      rule: defaultResearchRule("jump"),
    });

    assert.equal(result.baselineRows, 2);
    assert.equal(result.selectedRunners.length, 2);
    assert.equal(result.settlementVersion, CANONICAL_SETTLEMENT_VERSION);

    const filtered = evaluateResearchRule({
      rows: [
        row({ targetRunnerId: "with-or", officialRating: 100 }),
        row({ targetRunnerId: "missing-or", officialRating: null }),
      ],
      rule: {
        ...defaultResearchRule("jump"),
        runner: { officialRating: { min: 1 } },
      },
    });
    assert.deepEqual(filtered.selectedRunners.map((selection) => selection.id), ["with-or"]);
  });

  test("applies OR-relative, rank and combined conditions", () => {
    const rule: ResearchRuleV1 = {
      ...defaultResearchRule("jump"),
      relatives: [{ metric: "latestTodaysRatingMinusOR", range: { min: 5 } }],
      ranks: [{ metric: "latestTodaysRating", range: { max: 1 } }],
    };
    const result = evaluateResearchRule({
      rows: [
        row({ targetRunnerId: "selected", latestTodaysRating: 110, officialRating: 100 }),
        row({ targetRunnerId: "ranked-second", latestTodaysRating: 108, officialRating: 100 }),
        row({ targetRunnerId: "below-or", latestTodaysRating: 104, officialRating: 100 }),
      ],
      rule,
    });

    assert.deepEqual(result.selectedRunners.map((selection) => selection.id), ["selected"]);
  });

  test("keeps legacy Speed-vs-OR rules evaluable and their summaries intelligible", () => {
    const rule: ResearchRuleV1 = {
      ...defaultResearchRule("jump"),
      relatives: [{ metric: "latestSpeedMinusOR", range: { min: 5 } }],
    };
    const result = evaluateResearchRule({
      rows: [
        row({ targetRunnerId: "selected", latestSpeedRating: 106, officialRating: 100 }),
        row({ targetRunnerId: "excluded", latestSpeedRating: 104, officialRating: 100 }),
      ],
      rule,
    });
    assert.deepEqual(parseResearchRule(JSON.stringify(rule))?.relatives, rule.relatives);
    assert.deepEqual(result.selectedRunners.map((selection) => selection.id), ["selected"]);
    assert.ok(strategySummary(rule).includes("Latest Speed minus OR: >= 5"));
  });

  test("continues to resolve legacy Speed-vs-OR query parameters", () => {
    const rule = ruleFromSearchParams(new URLSearchParams({
      family: "turf_flat",
      relativeMetric: "bestL3SpeedMinusOR",
      relativeMin: "3",
    }));
    assert.deepEqual(rule.relatives, [{ metric: "bestL3SpeedMinusOR", range: { min: 3, max: undefined } }]);
  });

  test("applies official rating rank independently of generic rating rank", () => {
    const rule: ResearchRuleV1 = {
      ...defaultResearchRule("jump"),
      ranks: [
        { metric: "bestSpeedLast3", range: { min: 3 } },
        { metric: "officialRating", range: { min: 3 } },
      ],
    };
    const result = evaluateResearchRule({
      rows: [
        row({ targetRunnerId: "best-speed-but-top-or", bestSpeedLast3: 100, officialRating: 120 }),
        row({ targetRunnerId: "second-speed-second-or", bestSpeedLast3: 95, officialRating: 115 }),
        row({ targetRunnerId: "selected", bestSpeedLast3: 90, officialRating: 110 }),
        row({ targetRunnerId: "low-speed-low-or", bestSpeedLast3: 85, officialRating: 105 }),
        row({ targetRunnerId: "missing-or", bestSpeedLast3: 80, officialRating: null }),
      ],
      rule,
    });

    assert.deepEqual(result.selectedRunners.map((selection) => selection.id).sort(), ["low-speed-low-or", "selected"]);
  });

  test("applies frozen Turf Performance Rating score, rank and rank-1 lead filters", () => {
    const rows = turfPerformanceRows();
    const rankOne = evaluateResearchRule({
      rows,
      rule: {
        ...defaultResearchRule("turf_flat"),
        turfPerformance: {
          version: TURF_PERFORMANCE_RATING_VERSION,
          rank: { min: 1, max: 1 },
        },
      },
    });
    const idsForLead = (min: number) =>
      evaluateResearchRule({
        rows,
        rule: {
          ...defaultResearchRule("turf_flat"),
          turfPerformance: {
            version: TURF_PERFORMANCE_RATING_VERSION,
            rank: { min: 1, max: 1 },
            lead: { min },
          },
        },
      }).selectedRunners.map((selection) => selection.id);
    const score = evaluateResearchRule({
      rows,
      rule: {
        ...defaultResearchRule("turf_flat"),
        turfPerformance: {
          version: TURF_PERFORMANCE_RATING_VERSION,
          rating: { min: 110 },
        },
      },
    });

    assert.deepEqual(rankOne.selectedRunners.map((selection) => selection.id), ["tpr-top"]);
    assert.deepEqual(idsForLead(2), ["tpr-top"]);
    assert.deepEqual(idsForLead(4), ["tpr-top"]);
    assert.deepEqual(idsForLead(6), ["tpr-top"]);
    assert.deepEqual(idsForLead(10), ["tpr-top"]);
    assert.ok((rankOne.selectedRunners[0]?.turfPerformance?.gap ?? 0) >= 10);
    assert.deepEqual(score.selectedRunners.map((selection) => selection.id), ["tpr-top"]);
    assert.equal(rankOne.selectedRunners[0]?.turfPerformance?.version, TURF_PERFORMANCE_RATING_VERSION);
  });

  test("excludes missing TPR and ignores TPR filters outside Turf", () => {
    const rows = [
      ...turfPerformanceRows(),
      row({
        targetRunnerId: "missing-tpr",
        raceCode: "turf",
        latestPerformanceRating: null,
        latestTurfSpeedRating: null,
      }),
    ];
    const tprRule: ResearchRuleV1 = {
      ...defaultResearchRule("turf_flat"),
      turfPerformance: {
        version: TURF_PERFORMANCE_RATING_VERSION,
        rank: { min: 1, max: 1 },
      },
    };

    assert.deepEqual(
      evaluateResearchRule({ rows, rule: tprRule }).selectedRunners.map((selection) => selection.id),
      ["tpr-top"],
    );
    assert.deepEqual(
      evaluateResearchRule({
        rows: [row({ targetRunnerId: "jump", raceCode: "jump" })],
        rule: { ...defaultResearchRule("jump"), turfPerformance: tprRule.turfPerformance },
      }).selectedRunners,
      [],
    );
  });

  test("filters generic TPR rank ranges using the existing production TPR rank", () => {
    const rows = [
      ...turfPerformanceRows(),
      row({
        targetRunnerId: "missing-tpr",
        raceCode: "turf",
        latestPerformanceRating: null,
        latestTurfSpeedRating: null,
      }),
    ];
    const idsFor = (range: { min?: number; max?: number }) =>
      evaluateResearchRule({
        rows,
        rule: {
          ...defaultResearchRule("turf_flat"),
          ranks: [{ metric: "turfPerformanceRating", range }],
        },
      }).selectedRunners.map((selection) => selection.id);

    assert.deepEqual(idsFor({ min: 1, max: 1 }), ["tpr-top"]);
    assert.deepEqual(idsFor({ min: 1, max: 2 }), ["tpr-second", "tpr-top"]);
    assert.deepEqual(idsFor({ min: 3 }), ["tpr-third"]);

    const ranked = rankRows(rows);
    for (const entry of ranked) {
      assert.equal(entry.ranks.turfPerformanceRating, entry.turfPerformance?.rank);
    }
    assert.equal(
      ranked.find((entry) => entry.features.targetRunnerId === "missing-tpr")?.ranks.turfPerformanceRating,
      undefined,
    );
  });

  test("keeps legacy generic and dedicated TPR rank filters with AND semantics", () => {
    const result = evaluateResearchRule({
      rows: turfPerformanceRows(),
      rule: {
        ...defaultResearchRule("turf_flat"),
        ranks: [{ metric: "turfPerformanceRating", range: { min: 1, max: 2 } }],
        turfPerformance: {
          version: TURF_PERFORMANCE_RATING_VERSION,
          rank: { min: 2, max: 3 },
        },
      },
    });

    assert.deepEqual(result.selectedRunners.map((selection) => selection.id), ["tpr-second"]);
  });

  test("ranks diagnostic W50 with the shared TPR implementation and combines it with OR rank", () => {
    const rows = [
      row({
        ...turfPerformanceFeature("w100-top", 75, 75),
        officialRating: 100,
        weightCarriedLbs: 140,
      }),
      row({
        ...turfPerformanceFeature("w50-or-top", 100, 100),
        officialRating: 110,
        weightCarriedLbs: 120,
      }),
    ];
    const ranked = rankRows(rows);
    const w100Top = ranked.find((entry) => entry.features.targetRunnerId === "w100-top")!;
    const w50Top = ranked.find((entry) => entry.features.targetRunnerId === "w50-or-top")!;
    const expectedW50 = calculateTurfPerformanceRating(buildCanonicalTurfPerformanceRatingInput({
      latestPerformanceRating: 100,
      previousPerformanceRating: null,
      averagePerformanceLast3: null,
      latestSpeedRating: 100,
      previousSpeedRating: null,
      averageSpeedLast3: null,
      raceClass: "Class 4",
      weightCarriedLbs: 120,
      raceMedianWeightCarriedLbs: 130,
      weightCoefficientMultiplier: TURF_PERFORMANCE_RATING_W50_WEIGHT_MULTIPLIER,
    }));

    assert.equal(w100Top.ranks.turfPerformanceRating, 1);
    assert.equal(w50Top.ranks.turfPerformanceW50Rating, 1);
    assert.equal(w50Top.turfPerformanceW50?.rating, expectedW50?.rating);

    const result = evaluateResearchRule({
      rows,
      rule: {
        ...defaultResearchRule("turf_flat"),
        ranks: [
          { metric: "turfPerformanceW50Rating", range: { min: 1, max: 1 } },
          { metric: "officialRating", range: { min: 1, max: 1 } },
        ],
      },
    });
    assert.deepEqual(result.selectedRunners.map((selection) => selection.id), ["w50-or-top"]);
  });

  test("gives W50 ties the same competition rank and excludes missing and non-runners", () => {
    const ranked = rankRows([
      row({ ...turfPerformanceFeature("tie-a", 100, 100), targetRaceId: "w50-ties" }),
      row({ ...turfPerformanceFeature("tie-b", 100, 100), targetRaceId: "w50-ties" }),
      row({
        ...turfPerformanceFeature("missing", 100, 100),
        targetRaceId: "w50-ties",
        weightCarriedLbs: null,
      }),
      row(
        { ...turfPerformanceFeature("non-runner", 120, 120), targetRaceId: "w50-ties" },
        { resultStatus: "non_runner", won: false, placed: false, finishingPosition: null },
      ),
    ]);
    const ranks = new Map(ranked.map((entry) => [entry.features.targetRunnerId, entry.ranks.turfPerformanceW50Rating]));

    assert.equal(ranks.get("tie-a"), 1);
    assert.equal(ranks.get("tie-b"), 1);
    assert.equal(ranks.get("missing"), undefined);
    assert.equal(ranks.get("non-runner"), undefined);
  });

  test("combines Latest Performance rank 2-5 with dedicated TPR rank 1", () => {
    const rows = [
      row(turfPerformanceFeature("performance-first", 120, 80)),
      row(turfPerformanceFeature("tpr-first", 110, 180)),
      row(turfPerformanceFeature("third", 90, 90)),
    ];
    const result = evaluateResearchRule({
      rows,
      rule: {
        ...defaultResearchRule("turf_flat"),
        ranks: [{ metric: "latestPerformanceRating", range: { min: 2, max: 5 } }],
        turfPerformance: {
          version: TURF_PERFORMANCE_RATING_VERSION,
          rank: { min: 1, max: 1 },
        },
      },
    });

    assert.deepEqual(result.selectedRunners.map((selection) => selection.id), ["tpr-first"]);
  });

  test("keeps Jump, AW and Turf isolated", () => {
    const result = evaluateResearchRule({
      rows: [
        row({ targetRunnerId: "jump", raceCode: "jump" }),
        row({ targetRunnerId: "aw", raceCode: "aw" }),
        row({ targetRunnerId: "turf", raceCode: "turf" }),
      ],
      rule: defaultResearchRule("all_weather_flat"),
    });

    assert.deepEqual(result.selectedRunners.map((selection) => selection.id), ["aw"]);
  });

  test("filters courses by stable course ID while preserving old course-name rules", () => {
    const rows = [
      row({ targetRunnerId: "selected", courseId: "course-a", courseName: "Lingfield" }),
      row({ targetRunnerId: "rejected", courseId: "course-b", courseName: "Lingfield" }),
      row({ targetRunnerId: "also-selected", courseId: "course-c", courseName: "Ascot" }),
    ];

    assert.deepEqual(
      evaluateResearchRule({
        rows,
        rule: { ...defaultResearchRule("jump"), race: { courseId: "course-a" } },
      }).selectedRunners.map((selection) => selection.id),
      ["selected"],
    );

    assert.deepEqual(
      evaluateResearchRule({
        rows,
        rule: { ...defaultResearchRule("jump"), race: { courseIds: ["course-c", "course-a"] } },
      }).selectedRunners.map((selection) => selection.id).sort(),
      ["also-selected", "selected"],
    );

    assert.deepEqual(
      evaluateResearchRule({
        rows,
        rule: { ...defaultResearchRule("jump"), race: { courseName: "Lingfield" } },
      }).selectedRunners.map((selection) => selection.id).sort(),
      ["rejected", "selected"],
    );
  });

  test("filters manual trainers by stable IDs with OR semantics and suppresses cohort intersection", () => {
    const rows = [
      row({ targetRunnerId: "trainer-a", trainerId: "trainer-a" }),
      row({ targetRunnerId: "trainer-b", trainerId: "trainer-b" }),
      row({ targetRunnerId: "trainer-c", trainerId: "trainer-c" }),
      row({ targetRunnerId: "missing", trainerId: null }),
    ];
    const rule = {
      ...defaultResearchRule("jump"),
      runner: { trainerIds: ["trainer-b", "trainer-a"], trainerCohort: trainerCohortRule(20) },
    };

    assert.deepEqual(
      evaluateResearchRule({
        rows,
        rule,
        trainerCohort: resolvedCohort(rule, ["trainer-c"]),
      }).selectedRunners.map((selection) => selection.id).sort(),
      ["trainer-a", "trainer-b"],
    );
    assert.ok(strategySummary(rule).includes("Trainers: 2 selected"));
    assert.equal(strategySummary(rule).some((line) => line.startsWith("Trainer cohort:")), false);
  });

  test("matches trainer and course selections beyond six selected IDs", () => {
    const trainerIds = numberedIds("trainer", 20);
    const courseIds = numberedIds("course", 20);
    const rows = [
      row({
        targetRunnerId: "first-selected",
        trainerId: "trainer-01",
        courseId: "course-01",
      }),
      row({
        targetRunnerId: "twentieth-selected",
        trainerId: "trainer-20",
        courseId: "course-20",
      }),
      row({
        targetRunnerId: "wrong-trainer",
        trainerId: "trainer-21",
        courseId: "course-20",
      }),
      row({
        targetRunnerId: "wrong-course",
        trainerId: "trainer-20",
        courseId: "course-21",
      }),
    ];

    assert.deepEqual(
      evaluateResearchRule({
        rows,
        rule: { ...defaultResearchRule("jump"), race: { courseIds }, runner: { trainerIds } },
      }).selectedRunners.map((selection) => selection.id).sort(),
      ["first-selected", "twentieth-selected"],
    );
  });

  test("filters by resolved trainer cohort membership and changes canonical identity by cohort size", () => {
    const rows = [
      row({ targetRunnerId: "cohort-trainer", trainerId: "trainer-a" }),
      row({ targetRunnerId: "outside-trainer", trainerId: "trainer-b" }),
      row({ targetRunnerId: "missing-trainer", trainerId: null }),
    ];
    const rule = {
      ...defaultResearchRule("jump"),
      runner: { trainerCohort: trainerCohortRule(20) },
    };
    const cohort = resolvedCohort(rule, ["trainer-a"]);

    assert.deepEqual(
      evaluateResearchRule({ rows, rule, trainerCohort: cohort }).selectedRunners.map((selection) => selection.id),
      ["cohort-trainer"],
    );
    assert.deepEqual(
      evaluateResearchRule({ rows, rule, trainerCohort: null }).selectedRunners.map((selection) => selection.id),
      [],
    );
    assert.notEqual(
      researchRuleKey(rule),
      researchRuleKey({ ...rule, runner: { trainerCohort: trainerCohortRule(30) } }),
    );
    assert.ok(strategySummary(rule).includes("Trainer cohort: Top 20 by 2024 Jump wins"));
    assert.ok(strategySummary({
      ...rule,
      dateRange: { from: "2026-03-01", to: "2026-12-31" },
    }).includes("Trainer cohort: Top 20 by 2025 Jump wins"));
  });

  test("filters distance buckets using racing-distance tolerance", () => {
    const bucket = distanceBucketIdForYards(4400);
    const result = evaluateResearchRule({
      rows: [
        row({ targetRunnerId: "short-edge", distanceYards: 4300 }),
        row({ targetRunnerId: "nominal", distanceYards: 4400 }),
        row({ targetRunnerId: "long-edge", distanceYards: 4500 }),
        row({ targetRunnerId: "too-long", distanceYards: 4501 }),
      ],
      rule: {
        ...defaultResearchRule("jump"),
        race: { distanceBucketFrom: bucket, distanceBucketTo: bucket },
      },
    });

    assert.deepEqual(
      result.selectedRunners.map((selection) => selection.id).sort(),
      ["long-edge", "nominal", "short-edge"],
    );
    assert.ok(result.strategySummary.includes("Distance: 2m4f"));
  });

  test("filters distance bucket ranges in either selected order", () => {
    const result = evaluateResearchRule({
      rows: [
        row({ targetRunnerId: "two-miles", distanceYards: 3520 }),
        row({ targetRunnerId: "two-four", distanceYards: 4400 }),
        row({ targetRunnerId: "three-miles", distanceYards: 5280 }),
      ],
      rule: {
        ...defaultResearchRule("jump"),
        race: {
          distanceBucketFrom: distanceBucketIdForYards(4400),
          distanceBucketTo: distanceBucketIdForYards(3520),
        },
      },
    });

    assert.deepEqual(
      result.selectedRunners.map((selection) => selection.id).sort(),
      ["two-four", "two-miles"],
    );
    assert.ok(result.strategySummary.includes("Distance: 2m to 2m4f"));
  });

  test("filters multiple race classes with OR semantics", () => {
    const rows = [
      row({ targetRunnerId: "class-1", raceClass: "Class 1" }),
      row({ targetRunnerId: "class-2", raceClass: "2" }),
      row({ targetRunnerId: "class-3", raceClass: "Class 3" }),
      row({ targetRunnerId: "class-5", raceClass: "5" }),
      row({ targetRunnerId: "unknown", raceClass: null }),
    ];

    assert.deepEqual(
      evaluateResearchRule({
        rows,
        rule: { ...defaultResearchRule("jump"), race: {} },
      }).selectedRunners.map((selection) => selection.id).sort(),
      ["class-1", "class-2", "class-3", "class-5", "unknown"],
    );
    assert.deepEqual(
      evaluateResearchRule({
        rows,
        rule: { ...defaultResearchRule("jump"), race: { raceClasses: [3] } },
      }).selectedRunners.map((selection) => selection.id),
      ["class-3"],
    );
    assert.deepEqual(
      evaluateResearchRule({
        rows,
        rule: { ...defaultResearchRule("jump"), race: { raceClasses: [1, 2, 5] } },
      }).selectedRunners.map((selection) => selection.id).sort(),
      ["class-1", "class-2", "class-5"],
    );
    assert.ok(strategySummary({
      ...defaultResearchRule("jump"),
      race: { raceClasses: [5, 1, 2] },
    }).includes("Classes 1, 2 & 5"));
  });

  test("outcome changes do not alter ranks or selected runner IDs", () => {
    const features = [
      row({ targetRunnerId: "selected", latestSpeedRating: 100 }),
      row({ targetRunnerId: "rejected", latestSpeedRating: 90 }),
    ];
    const changedOutcomes = features.map((entry) => ({
      features: entry.features,
      outcome: {
        ...entry.outcome,
        finishingPosition: entry.outcome.finishingPosition === 1 ? 7 : 1,
        won: !entry.outcome.won,
      },
    }));
    const rule: ResearchRuleV1 = {
      ...defaultResearchRule("jump"),
      ranks: [{ metric: "latestSpeedRating", range: { max: 1 } }],
    };

    assert.deepEqual(
      evaluateResearchRule({ rows: features, rule }).selectedRunners.map((selection) => selection.id),
      evaluateResearchRule({ rows: changedOutcomes, rule }).selectedRunners.map((selection) => selection.id),
    );
  });

  test("serializes and parses ResearchRuleV1", () => {
    const rule: ResearchRuleV1 = {
      ...defaultResearchRule("turf_flat"),
      race: {
        courseIds: ["course-1"],
        raceClasses: [1, 2, 5],
        distanceBucketFrom: distanceBucketIdForYards(1760),
        distanceBucketTo: distanceBucketIdForYards(2200),
        distanceYards: { min: 1760, max: 2200 },
      },
      ranks: [{ metric: "turfPerformanceRating", range: { min: 1, max: 2 } }],
    };

    const parsed = parseResearchRule(serializeResearchRule(rule));
    assert.deepEqual(parsed?.race.courseIds, ["course-1"]);
    assert.deepEqual(parsed?.ranks, [{ metric: "turfPerformanceRating", range: { min: 1, max: 2 } }]);
    assert.equal(researchRuleKey(parsed!), researchRuleKey(rule));
  });

  test("parses old single trainer, jockey and course values into arrays", () => {
    const parsed = parseResearchRule(JSON.stringify({
      version: "research_rule_v1",
      family: "jump",
      dateRange: { from: "2025-01-01", to: "2025-12-31" },
      race: { courseId: "course-a" },
      runner: { trainerId: "trainer-a", jockeyId: "jockey-a" },
      ratings: [],
      relatives: [],
      ranks: [],
    }));

    assert.deepEqual(parsed?.race.courseIds, ["course-a"]);
    assert.equal(parsed?.race.courseId, undefined);
    assert.deepEqual(parsed?.runner.trainerIds, ["trainer-a"]);
    assert.equal(parsed?.runner.trainerId, undefined);
    assert.deepEqual(parsed?.runner.jockeyIds, ["jockey-a"]);
    assert.equal(parsed?.runner.jockeyId, undefined);
  });

  test("parses old single-class rules as multi-class rules", () => {
    const parsed = parseResearchRule(JSON.stringify({
      version: "research_rule_v1",
      family: "jump",
      dateRange: { from: "2025-01-01", to: "2025-12-31" },
      race: { raceClass: "Class 3" },
      runner: {},
      ratings: [],
      relatives: [],
      ranks: [],
    }));

    assert.deepEqual(parsed?.race.raceClasses, [3]);
    assert.equal("raceClass" in (parsed?.race ?? {}), false);
  });

  test("parses repeated race class URL params", () => {
    const rule = ruleFromSearchParams(new URLSearchParams([
      ["family", "jump"],
      ["class", "5"],
      ["class", "1"],
      ["class", "2"],
      ["class", "2"],
    ]));

    assert.deepEqual(rule.race.raceClasses, [1, 2, 5]);
  });

  test("parses repeated trainer, jockey and course URL params and sorts canonical identity", () => {
    const left = ruleFromSearchParams(new URLSearchParams([
      ["family", "jump"],
      ["trainerId", "trainer-b"],
      ["trainerId", "trainer-a"],
      ["jockeyId", "jockey-b"],
      ["jockeyId", "jockey-a"],
      ["courseId", "course-b"],
      ["courseId", "course-a"],
      ["jockeyPriorRunsMin", "50"],
      ["jockeyPriorWinRateMin", "15"],
    ]));
    const right = ruleFromSearchParams(new URLSearchParams([
      ["family", "jump"],
      ["trainerId", "trainer-a"],
      ["trainerId", "trainer-b"],
      ["jockeyId", "jockey-a"],
      ["jockeyId", "jockey-b"],
      ["courseId", "course-a"],
      ["courseId", "course-b"],
      ["jockeyPriorRunsMin", "50"],
      ["jockeyPriorWinRateMin", "15"],
    ]));

    assert.deepEqual(left.runner.trainerIds, ["trainer-a", "trainer-b"]);
    assert.deepEqual(left.runner.jockeyIds, ["jockey-a", "jockey-b"]);
    assert.deepEqual(left.runner.jockeyPriorRuns, { min: 50, max: undefined });
    assert.deepEqual(left.runner.jockeyPriorWinRate, { min: 15, max: undefined });
    assert.deepEqual(left.race.courseIds, ["course-a", "course-b"]);
    assert.equal(researchRuleKey(left), researchRuleKey(right));
  });

  test("parses official rating rank alongside the generic rank filter", () => {
    const rule = ruleFromSearchParams(new URLSearchParams([
      ["family", "jump"],
      ["rankMetric", "bestSpeedLast3"],
      ["rankMin", "3"],
      ["orRankMin", "3"],
      ["orRankMax", "5"],
    ]));

    assert.equal(rule.ranks[0]?.metric, "bestSpeedLast3");
    assert.equal(rule.ranks[0]?.range.min, 3);
    assert.equal(rule.ranks[0]?.range.max, undefined);
    assert.equal(rule.ranks[1]?.metric, "officialRating");
    assert.equal(rule.ranks[1]?.range.min, 3);
    assert.equal(rule.ranks[1]?.range.max, 5);
    assert.ok(strategySummary(rule).includes("Best L3 Speed rank: >= 3"));
    assert.ok(strategySummary(rule).includes("OR rank: >= 3"));
    assert.ok(strategySummary(rule).includes("OR rank: <= 5"));
  });

  test("parses and preserves a distinct W50 diagnostic rank identity", () => {
    const rule = ruleFromSearchParams(new URLSearchParams([
      ["family", "turf_flat"],
      ["rankMetric", "turfPerformanceW50Rating"],
      ["rankMin", "1"],
      ["rankMax", "1"],
      ["orRankMin", "1"],
      ["orRankMax", "1"],
    ]));
    const parsed = parseResearchRule(serializeResearchRule(rule));

    assert.deepEqual(rule.ranks, [
      { metric: "turfPerformanceW50Rating", range: { min: 1, max: 1 } },
      { metric: "officialRating", range: { min: 1, max: 1 } },
    ]);
    assert.deepEqual(parsed?.ranks, rule.ranks);
    assert.ok(strategySummary(rule).includes("TPR W50 (diagnostic): 1"));
    assert.equal(researchRuleKey(parsed!), researchRuleKey(rule));
    assert.notEqual(
      researchRuleKey(rule),
      researchRuleKey({
        ...rule,
        ranks: [
          { metric: "turfPerformanceRating", range: { min: 1, max: 1 } },
          { metric: "officialRating", range: { min: 1, max: 1 } },
        ],
      }),
    );
  });

  test("parses and summarizes frozen TPR filters for Turf URLs", () => {
    const rule = ruleFromSearchParams(new URLSearchParams([
      ["family", "turf_flat"],
      ["tprMin", "110"],
      ["tprRankMin", "1"],
      ["tprRankMax", "1"],
      ["tprLeadMin", "4"],
    ]));

    assert.deepEqual(rule.turfPerformance, {
      version: TURF_PERFORMANCE_RATING_VERSION,
      rating: { min: 110, max: undefined },
      rank: { min: 1, max: 1 },
      lead: { min: 4, max: undefined },
    });
    assert.ok(strategySummary(rule).includes(`TPR version: ${TURF_PERFORMANCE_RATING_VERSION}`));
    assert.ok(strategySummary(rule).includes("TPR: >= 110"));
    assert.ok(strategySummary(rule).includes("TPR rank: 1"));
    assert.ok(strategySummary(rule).includes("TPR lead: >= 4"));
  });

  test("maps legacy generic TPR rank URL params to the dedicated TPR condition", () => {
    const rule = ruleFromSearchParams(new URLSearchParams([
      ["family", "turf_flat"],
      ["rankMetric", "turfPerformanceRating"],
      ["rankMin", "1"],
      ["rankMax", "2"],
      ["tprRankMax", "1"],
    ]));

    assert.deepEqual(rule.ranks, []);
    assert.deepEqual(rule.turfPerformance?.rank, { min: 1, max: 1 });
    assert.equal(strategySummary(rule).filter((line) => line.startsWith("TPR rank:")).length, 1);
  });
});

describe("research latest speed filters", () => {
  test("does not filter when Latest Speed has no min or max", () => {
    const result = evaluateResearchRule({
      rows: [
        row({ targetRunnerId: "rated", latestSpeedRating: 80 }),
        row({ targetRunnerId: "missing", latestSpeedRating: null }),
      ],
      rule: {
        ...defaultResearchRule("jump"),
        ratings: [{ metric: "latestSpeedRating", range: {} }],
      },
    });

    assert.deepEqual(result.selectedRunners.map((selection) => selection.id), ["missing", "rated"]);
  });

  test("applies Latest Speed minimum inclusively and excludes missing values", () => {
    const result = evaluateResearchRule({
      rows: [
        row({ targetRunnerId: "below", latestSpeedRating: 99 }),
        row({ targetRunnerId: "equal", latestSpeedRating: 100 }),
        row({ targetRunnerId: "above", latestSpeedRating: 101 }),
        row({ targetRunnerId: "missing", latestSpeedRating: null }),
      ],
      rule: {
        ...defaultResearchRule("jump"),
        ratings: [{ metric: "latestSpeedRating", range: { min: 100 } }],
      },
    });

    assert.deepEqual(result.selectedRunners.map((selection) => selection.id), ["above", "equal"]);
  });

  test("applies Latest Speed maximum inclusively and excludes missing values", () => {
    const result = evaluateResearchRule({
      rows: [
        row({ targetRunnerId: "below", latestSpeedRating: 99 }),
        row({ targetRunnerId: "equal", latestSpeedRating: 100 }),
        row({ targetRunnerId: "above", latestSpeedRating: 101 }),
        row({ targetRunnerId: "missing", latestSpeedRating: null }),
      ],
      rule: {
        ...defaultResearchRule("jump"),
        ratings: [{ metric: "latestSpeedRating", range: { max: 100 } }],
      },
    });

    assert.deepEqual(result.selectedRunners.map((selection) => selection.id), ["below", "equal"]);
  });

  test("treats zero as a valid Latest Speed threshold", () => {
    const result = evaluateResearchRule({
      rows: [
        row({ targetRunnerId: "negative", latestSpeedRating: -1 }),
        row({ targetRunnerId: "zero", latestSpeedRating: 0 }),
        row({ targetRunnerId: "positive", latestSpeedRating: 1 }),
      ],
      rule: {
        ...defaultResearchRule("jump"),
        ratings: [{ metric: "latestSpeedRating", range: { min: 0 } }],
      },
    });

    assert.deepEqual(result.selectedRunners.map((selection) => selection.id), ["positive", "zero"]);
  });

  test("changing Latest Speed min or max changes the rule key and effective result", () => {
    const rows = [
      row({ targetRunnerId: "low", latestSpeedRating: 80 }),
      row({ targetRunnerId: "mid", latestSpeedRating: 90 }),
      row({ targetRunnerId: "high", latestSpeedRating: 100 }),
    ];
    const min90: ResearchRuleV1 = {
      ...defaultResearchRule("jump"),
      ratings: [{ metric: "latestSpeedRating", range: { min: 90 } }],
    };
    const min95: ResearchRuleV1 = {
      ...defaultResearchRule("jump"),
      ratings: [{ metric: "latestSpeedRating", range: { min: 95 } }],
    };
    const max90: ResearchRuleV1 = {
      ...defaultResearchRule("jump"),
      ratings: [{ metric: "latestSpeedRating", range: { max: 90 } }],
    };

    assert.notEqual(researchRuleKey(min90), researchRuleKey(min95));
    assert.notEqual(researchRuleKey(min90), researchRuleKey(max90));
    assert.deepEqual(
      evaluateResearchRule({ rows, rule: min90 }).selectedRunners.map((selection) => selection.id),
      ["high", "mid"],
    );
    assert.deepEqual(
      evaluateResearchRule({ rows, rule: min95 }).selectedRunners.map((selection) => selection.id),
      ["high"],
    );
    assert.deepEqual(
      evaluateResearchRule({ rows, rule: max90 }).selectedRunners.map((selection) => selection.id),
      ["low", "mid"],
    );
  });

  test("composes Latest Speed with trainer, family, date and ranking filters", () => {
    const rows = [
      row({ targetRaceId: "race-1", targetRunnerId: "selected", trainerId: "trainer-a", raceDate: "2025-06-01", latestSpeedRating: 102 }),
      row({ targetRaceId: "race-1", targetRunnerId: "wrong-trainer", trainerId: "trainer-b", raceDate: "2025-06-01", latestSpeedRating: 101 }),
      row({ targetRaceId: "race-1", targetRunnerId: "below-speed", trainerId: "trainer-a", raceDate: "2025-06-01", latestSpeedRating: 90 }),
      row({ targetRaceId: "race-2", targetRunnerId: "wrong-family", trainerId: "trainer-a", raceDate: "2025-06-01", raceCode: "aw", latestSpeedRating: 110 }),
      row({ targetRaceId: "race-3", targetRunnerId: "wrong-date", trainerId: "trainer-a", raceDate: "2024-12-31", latestSpeedRating: 110 }),
    ];
    const result = evaluateResearchRule({
      rows,
      rule: {
        ...defaultResearchRule("jump"),
        dateRange: { from: "2025-01-01", to: "2025-12-31" },
        runner: { trainerId: "trainer-a" },
        ratings: [{ metric: "latestSpeedRating", range: { min: 95 } }],
        ranks: [{ metric: "latestSpeedRating", range: { max: 1 } }],
      },
    });

    assert.deepEqual(result.selectedRunners.map((selection) => selection.id), ["selected"]);
  });
});

describe("research Starting Price filters", () => {
  const priceRows = [
    row({ targetRunnerId: "sp-1-99" }, { startingPriceDecimal: "1.99", won: false, placed: false, finishingPosition: 4 }),
    row({ targetRunnerId: "sp-2-00" }, { startingPriceDecimal: "2.00", won: false, placed: false, finishingPosition: 4 }),
    row({ targetRunnerId: "sp-2-99" }, { startingPriceDecimal: "2.99", won: false, placed: false, finishingPosition: 4 }),
    row({ targetRunnerId: "sp-3-00" }, { startingPriceDecimal: "3.00", won: false, placed: false, finishingPosition: 4 }),
    row({ targetRunnerId: "sp-5-99" }, { startingPriceDecimal: "5.99", won: false, placed: false, finishingPosition: 4 }),
    row({ targetRunnerId: "sp-6-00" }, { startingPriceDecimal: "6.00", won: false, placed: false, finishingPosition: 4 }),
    row({ targetRunnerId: "sp-6-99" }, { startingPriceDecimal: "6.99", won: false, placed: false, finishingPosition: 4 }),
    row({ targetRunnerId: "sp-20-99" }, { startingPriceDecimal: "20.99", won: false, placed: false, finishingPosition: 4 }),
    row({ targetRunnerId: "sp-21-00" }, { startingPriceDecimal: "21.00", won: false, placed: false, finishingPosition: 4 }),
    row({ targetRunnerId: "missing-sp" }, { startingPriceDecimal: null, won: false, placed: false, finishingPosition: 4 }),
    row({ targetRunnerId: "priced-faller" }, { startingPriceDecimal: "6.00", resultStatus: "fell", won: null, placed: null, finishingPosition: null }),
  ];

  function idsFor(startingPrice: ResearchRuleV1["startingPrice"]) {
    return evaluateResearchRule({
      rows: priceRows,
      rule: { ...defaultResearchRule("jump"), startingPrice },
    }).selectedRunners.map((selection) => selection.id).sort();
  }

  test("does not filter when no price filter is active", () => {
    assert.deepEqual(idsFor(undefined), [
      "missing-sp",
      "priced-faller",
      "sp-1-99",
      "sp-2-00",
      "sp-2-99",
      "sp-20-99",
      "sp-21-00",
      "sp-3-00",
      "sp-5-99",
      "sp-6-00",
      "sp-6-99",
    ]);
  });

  test("applies under-evens, minimum, range and 20/1+ boundaries", () => {
    assert.deepEqual(idsFor({ maxDecimalExclusive: 2 }), ["sp-1-99"]);
    assert.deepEqual(idsFor({ minDecimal: 2 }), [
      "sp-2-00",
      "sp-2-99",
      "sp-20-99",
      "sp-21-00",
      "sp-3-00",
      "sp-5-99",
      "sp-6-00",
      "sp-6-99",
    ]);
    assert.deepEqual(idsFor({ minDecimal: 4, maxDecimalExclusive: 7 }), [
      "sp-5-99",
      "sp-6-00",
      "sp-6-99",
    ]);
    assert.deepEqual(idsFor({ minDecimal: 21 }), ["sp-21-00"]);
  });

  test("rejects missing SP when an active price filter is present", () => {
    assert.equal(idsFor({ minDecimal: 1 }).includes("missing-sp"), false);
  });

  test("keeps existing final-SP rule eligibility unchanged for non-finishers", () => {
    assert.equal(idsFor({ minDecimal: 1 }).includes("priced-faller"), false);
  });

  test("treats invalid min-greater-than-max filters as matching no runners", () => {
    assert.deepEqual(idsFor({ minDecimal: 7, maxDecimalExclusive: 4 }), []);
  });

  test("parses URLs, round-trips saved JSON and changes canonical identity", () => {
    const rule = ruleFromSearchParams(new URLSearchParams([
      ["family", "jump"],
      ["trainerCohort", "30"],
      ["spMin", "3_1"],
      ["spMax", "5_1"],
    ]));
    const serialized = parseResearchRule(serializeResearchRule(rule));

    assert.deepEqual(rule.startingPrice, { minDecimal: 4, maxDecimalExclusive: 7 });
    assert.deepEqual(rule.runner.trainerCohort, trainerCohortRule(30));
    assert.deepEqual(serialized?.startingPrice, rule.startingPrice);
    assert.deepEqual(serialized?.runner.trainerCohort, trainerCohortRule(30));
    assert.notEqual(
      researchRuleKey({ ...defaultResearchRule("jump"), startingPrice: { minDecimal: 4 } }),
      researchRuleKey({ ...defaultResearchRule("jump"), startingPrice: { minDecimal: 5 } }),
    );
    assert.ok(strategySummary(rule).includes("Starting price: 3/1 to 5/1"));
    assert.ok(strategySummary(rule).includes("Trainer cohort: Top 30 by 2024 Jump wins"));
  });
});

describe("research Draw filters", () => {
  const rows = [
    row({ targetRunnerId: "draw-1", raceCode: "aw", draw: 1 }),
    row({ targetRunnerId: "draw-3", raceCode: "aw", draw: 3 }),
    row({ targetRunnerId: "draw-4", raceCode: "aw", draw: 4 }),
    row({ targetRunnerId: "draw-8", raceCode: "aw", draw: 8 }),
    row({ targetRunnerId: "missing", raceCode: "aw", draw: null }),
  ];
  const idsFor = (draw: ResearchRuleV1["runner"]["draw"]) => evaluateResearchRule({
    rows,
    rule: { ...defaultResearchRule("all_weather_flat"), runner: { draw } },
  }).selectedRunners.map((selection) => selection.id);

  test("supports inclusive ranges, one-sided ranges, missing values and an inactive criterion", () => {
    assert.deepEqual(idsFor({ min: 1, max: 3 }), ["draw-1", "draw-3"]);
    assert.deepEqual(idsFor({ min: 8 }), ["draw-8"]);
    assert.deepEqual(idsFor({ max: 3 }), ["draw-1", "draw-3"]);
    assert.deepEqual(idsFor(undefined), ["draw-1", "draw-3", "draw-4", "draw-8", "missing"]);
  });

  test("round-trips flat URL and JSON rules, summarizes ranges and changes identity", () => {
    const rule = ruleFromSearchParams(new URLSearchParams("family=all_weather_flat&drawMin=1&drawMax=3"));
    const serialized = parseResearchRule(serializeResearchRule(rule));

    assert.deepEqual(rule.runner.draw, { min: 1, max: 3 });
    assert.deepEqual(serialized?.runner.draw, { min: 1, max: 3 });
    assert.ok(strategySummary(rule).includes("Draw: 1–3"));
    assert.ok(strategySummary({ ...rule, runner: { draw: { min: 8 } } }).includes("Draw: >= 8"));
    assert.ok(strategySummary({ ...rule, runner: { draw: { max: 3 } } }).includes("Draw: <= 3"));
    assert.notEqual(
      researchRuleKey({ ...defaultResearchRule("turf_flat"), runner: { draw: { min: 1, max: 3 } } }),
      researchRuleKey({ ...defaultResearchRule("turf_flat"), runner: { draw: { min: 4, max: 6 } } }),
    );
  });

  test("legacy and Jump rules ignore Draw while Turf retains it", () => {
    const legacy = parseResearchRule(serializeResearchRule(defaultResearchRule("all_weather_flat")));
    const jump = parseResearchRule(JSON.stringify({ ...defaultResearchRule("jump"), runner: { draw: { min: 1, max: 3 } } }));
    const turf = parseResearchRule(JSON.stringify({ ...defaultResearchRule("turf_flat"), runner: { draw: { min: 1, max: 3 } } }));

    assert.equal(legacy?.runner.draw, undefined);
    assert.equal(jump?.runner.draw, undefined);
    assert.deepEqual(turf?.runner.draw, { min: 1, max: 3 });
    assert.equal(researchRuleKey({ ...defaultResearchRule("jump"), runner: { draw: { min: 1 } } }), researchRuleKey(defaultResearchRule("jump")));
  });
});

describe("research filter options", () => {
  test("derives course, class and distance dropdown options from cached rows", () => {
    const options = researchFilterOptionsForRows([
      row({ courseId: "course-b", courseName: "Worcester", raceClass: "3", distanceYards: 4400 }),
      row({ courseId: "course-a", courseName: "Ascot", raceClass: "1", distanceYards: 1100 }),
      row({ courseId: "course-b", courseName: "Worcester", raceClass: "3", distanceYards: 4435 }),
      row({ courseId: "course-c", courseName: "Bath", raceClass: null, distanceYards: null }),
    ]);

    assert.deepEqual(
      options.courses.map((option) => [option.courseId, option.courseName, option.count]),
      [
        ["course-a", "Ascot", 1],
        ["course-c", "Bath", 1],
        ["course-b", "Worcester", 2],
      ],
    );
    assert.deepEqual(
      options.classes.map((option) => [option.value, option.label, option.count]),
      [
        [1, "Class 1", 1],
        [3, "Class 3", 2],
      ],
    );
    assert.deepEqual(
      options.distances.map((option) => [option.id, option.label, option.count]),
      [
        [distanceBucketIdForYards(1100), "5f", 1],
        [distanceBucketIdForYards(4400), "2m4f", 2],
      ],
    );
    assert.equal(options.weights[0].label, "8-11");
    assert.equal(options.weights.at(-1)?.label, "12-7");
  });

  test("derives trainer options from stable IDs and hydrates trainer display names", () => {
    const rows = [
      row({ targetRunnerId: "a", trainerId: "trainer-b", trainerName: "B Trainer" }),
      row({ targetRunnerId: "b", trainerId: "trainer-a", trainerName: "A Trainer" }),
      row({ targetRunnerId: "c", trainerId: "trainer-b", trainerName: "B Trainer" }),
      row({ targetRunnerId: "missing", trainerId: null, trainerName: null }),
    ];

    assert.deepEqual(
      trainerOptionsForRows(rows).map((option) => [option.trainerId, option.trainerName, option.count]),
      [
        ["trainer-a", "A Trainer", 1],
        ["trainer-b", "B Trainer", 2],
      ],
    );
    assert.equal(
      hydrateResearchRuleMetadata(
        { ...defaultResearchRule("jump"), runner: { trainerId: "trainer-b" } },
        rows,
      ).runner.trainerNames?.[0],
      "B Trainer",
    );
    assert.deepEqual(
      hydrateResearchRuleMetadata(
        { ...defaultResearchRule("jump"), runner: { trainerIds: ["trainer-b", "trainer-a"] } },
        rows,
      ).runner.trainerNames,
      ["A Trainer", "B Trainer"],
    );
    assert.deepEqual(
      hydrateResearchRuleMetadata(
        { ...defaultResearchRule("jump"), runner: { trainerId: "trainer-missing" } },
        rows,
      ).runner.trainerIds,
      [],
    );
  });

  test("derives jockey options from stable IDs and hydrates jockey display names", () => {
    const rows = [
      row({ targetRunnerId: "a", jockeyId: "jockey-b", jockeyName: "B Jockey" }),
      row({ targetRunnerId: "b", jockeyId: "jockey-a", jockeyName: "A Jockey" }),
      row({ targetRunnerId: "c", jockeyId: "jockey-b", jockeyName: "B Jockey" }),
      row({ targetRunnerId: "missing", jockeyId: null, jockeyName: null }),
    ];

    assert.deepEqual(
      jockeyOptionsForRows(rows).map((option) => [option.jockeyId, option.jockeyName, option.count]),
      [
        ["jockey-a", "A Jockey", 1],
        ["jockey-b", "B Jockey", 2],
      ],
    );
    assert.equal(
      hydrateResearchRuleMetadata(
        { ...defaultResearchRule("jump"), runner: { jockeyId: "jockey-b" } },
        rows,
      ).runner.jockeyNames?.[0],
      "B Jockey",
    );
  });

  test("keeps duplicate trainer names as separate stable ID options in alphabetical order", () => {
    const rows = [
      row({ targetRunnerId: "a", trainerId: "trainer-b", trainerName: "Shared Name" }),
      row({ targetRunnerId: "b", trainerId: "trainer-a", trainerName: "Shared Name" }),
      row({ targetRunnerId: "c", trainerId: "trainer-c", trainerName: "Another Trainer" }),
    ];

    assert.deepEqual(
      trainerOptionsForRows(rows).map((option) => [option.trainerId, option.trainerName, option.count]),
      [
        ["trainer-c", "Another Trainer", 1],
        ["trainer-a", "Shared Name", 1],
        ["trainer-b", "Shared Name", 1],
      ],
    );
  });

  test("derives trainer and course options from the current family rows only", () => {
    const rows = [
      row({ targetRunnerId: "jump", raceCode: "jump", trainerId: "trainer-jump", trainerName: "Jump Trainer", courseId: "course-jump", courseName: "Worcester" }),
      row({ targetRunnerId: "turf", raceCode: "turf", trainerId: "trainer-turf", trainerName: "Turf Trainer", courseId: "course-turf", courseName: "Ascot" }),
    ];
    const turfRows = rows.filter((entry) => entry.features.raceCode === "turf");

    assert.deepEqual(
      trainerOptionsForRows(turfRows).map((option) => [option.trainerId, option.trainerName]),
      [["trainer-turf", "Turf Trainer"]],
    );
    assert.deepEqual(
      courseOptionsForRows(turfRows).map((option) => [option.courseId, option.courseName]),
      [["course-turf", "Ascot"]],
    );
  });

  test("hydrates display metadata for stable-ID and old course-name rules", () => {
    const rows = [row({ courseId: "course-a", courseName: "Ascot" })];

    assert.equal(
      hydrateResearchRuleMetadata(
        { ...defaultResearchRule("jump"), race: { courseId: "course-a" } },
        rows,
      ).race.courseNames?.[0],
      "Ascot",
    );

    assert.equal(
      hydrateResearchRuleMetadata(
        { ...defaultResearchRule("jump"), race: { courseName: "Ascot" } },
        rows,
      ).race.courseIds?.[0],
      "course-a",
    );
  });

  test("formats exact runner distances without raw yard-only display", () => {
    assert.equal(formatExactDistance(1540), "7f");
    assert.equal(formatExactDistance(1576), "7f36y");
    assert.equal(formatExactDistance(4400), "2m4f");
    assert.equal(formatExactDistance(null), "-");
  });
});

describe("research weight filters", () => {
  test("formats and parses racing weights", () => {
    assert.equal(formatWeightLbsAsStonePounds(123), "8-11");
    assert.equal(formatWeightLbsAsStonePounds(126), "9-0");
    assert.equal(formatWeightLbsAsStonePounds(147), "10-7");
    assert.equal(formatWeightLbsAsStonePounds(168), "12-0");
    assert.equal(formatWeightLbsAsStonePounds(175), "12-7");
    assert.equal(parseWeightOptionToLbs("147"), 147);
  });

  test("generates supported dropdown range in ascending pounds", () => {
    const options = weightOptions();

    assert.equal(options.length, 53);
    assert.deepEqual(options[0], { value: 123, label: "8-11" });
    assert.deepEqual(options.at(-1), { value: 175, label: "12-7" });
  });

  test("filters by exact pound bounds and summarizes in stone-pounds", () => {
    const result = evaluateResearchRule({
      rows: [
        row({ targetRunnerId: "too-light", weightCarriedLbs: 146 }),
        row({ targetRunnerId: "selected-low", weightCarriedLbs: 147 }),
        row({ targetRunnerId: "selected-high", weightCarriedLbs: 168 }),
        row({ targetRunnerId: "too-heavy", weightCarriedLbs: 169 }),
      ],
      rule: {
        ...defaultResearchRule("jump"),
        runner: { weightCarriedLbs: { min: 147, max: 168 } },
      },
    });

    assert.deepEqual(
      result.selectedRunners.map((selection) => selection.id).sort(),
      ["selected-high", "selected-low"],
    );
    assert.ok(result.strategySummary.includes("Weight: 10-7 to 12-0"));

    const minOnly = evaluateResearchRule({
      rows: [row({ weightCarriedLbs: 147 })],
      rule: { ...defaultResearchRule("jump"), runner: { weightCarriedLbs: { min: 147 } } },
    });
    assert.ok(minOnly.strategySummary.includes("Weight: 10-7+"));

    const maxOnly = evaluateResearchRule({
      rows: [row({ weightCarriedLbs: 164 })],
      rule: { ...defaultResearchRule("jump"), runner: { weightCarriedLbs: { max: 164 } } },
    });
    assert.ok(maxOnly.strategySummary.includes("Weight: up to 11-10"));
  });
});

describe("research handicap filters", () => {
  test("classifies clear handicap and non-handicap race metadata", () => {
    assert.equal(classifyHandicapStatus(feature({
      raceName: "Jordan Recycling Innovation Handicap Chase",
      raceType: "handicap",
    })), "handicap");
    assert.equal(classifyHandicapStatus(feature({
      raceName: "Nursery",
      raceType: "stakes",
    })), "handicap");
    assert.equal(classifyHandicapStatus(feature({
      raceName: "Restricted Novice Stakes",
      raceType: "novice",
    })), "non_handicap");
    assert.equal(classifyHandicapStatus(feature({
      raceName: "Beginners Chase",
      raceType: "chase",
    })), "non_handicap");
    assert.equal(classifyHandicapStatus(feature({
      raceName: "Irishinjuredjockeys.com Rated Race",
      raceType: null,
    })), "non_handicap");
    assert.equal(classifyHandicapStatus(feature({
      raceName: "Wishing Everyone A Healthy 2025 Mares Hurdle",
      raceType: "hurdle",
    })), "unknown");
  });

  test("covers representative Jump, AW, Turf and Irish-style examples", () => {
    const examples = [
      feature({ raceName: "Conditional Jockeys' Handicap Chase", raceType: "handicap", raceCode: "jump" }),
      feature({ raceName: "Amateur Riders' Handicap", raceType: "handicap", raceCode: "aw" }),
      feature({ raceName: "Nua Healthcare Irish Lincolnshire (Premier Handicap)", raceType: "handicap", raceCode: "turf" }),
      feature({ raceName: "David Flynn Construction Maiden Hurdle", raceType: "maiden", raceCode: "jump" }),
      feature({ raceName: "Classified Stakes", raceType: "stakes", raceCode: "aw" }),
      feature({ raceName: "TOTE Irish EBF Devoy Stakes (Listed)", raceType: "stakes", raceCode: "turf" }),
    ];

    assert.deepEqual(examples.map((example) => classifyHandicapStatus(example)), [
      "handicap",
      "handicap",
      "handicap",
      "non_handicap",
      "non_handicap",
      "non_handicap",
    ]);
  });

  test("filters handicap, non-handicap and unknown without forcing unknown into either side", () => {
    const rows = [
      row({ targetRunnerId: "handicap", raceName: "Handicap Hurdle", raceType: "handicap" }),
      row({ targetRunnerId: "non-handicap", raceName: "Maiden Stakes", raceType: "maiden" }),
      row({ targetRunnerId: "unknown", raceName: "Mares Hurdle", raceType: "hurdle" }),
    ];

    assert.deepEqual(
      evaluateResearchRule({
        rows,
        rule: { ...defaultResearchRule("jump"), race: { handicapStatus: "handicap" } },
      }).selectedRunners.map((selection) => selection.id),
      ["handicap"],
    );
    assert.deepEqual(
      evaluateResearchRule({
        rows,
        rule: { ...defaultResearchRule("jump"), race: { handicapStatus: "non_handicap" } },
      }).selectedRunners.map((selection) => selection.id),
      ["non-handicap"],
    );
    assert.deepEqual(
      evaluateResearchRule({
        rows,
        rule: { ...defaultResearchRule("jump"), race: { handicapStatus: "unknown" } },
      }).selectedRunners.map((selection) => selection.id),
      ["unknown"],
    );
  });

  test("old URL params default to all race types", () => {
    const rule = ruleFromSearchParams(new URLSearchParams("family=jump"));

    assert.equal(rule.race.handicapStatus, undefined);
    assert.equal(evaluateResearchRule({
      rows: [
        row({ targetRunnerId: "handicap", raceName: "Handicap Chase", raceType: "handicap" }),
        row({ targetRunnerId: "unknown", raceName: "Mares Hurdle", raceType: "hurdle" }),
      ],
      rule,
    }).selectedRunners.length, 2);
  });
});

describe("research calendar period filters", () => {
  const datedRows = [
    row({ targetRunnerId: "jan", raceDate: "2025-01-01" }),
    row({ targetRunnerId: "mar", raceDate: "2025-03-31" }),
    row({ targetRunnerId: "apr", raceDate: "2025-04-01" }),
    row({ targetRunnerId: "jun", raceDate: "2025-06-30" }),
    row({ targetRunnerId: "jul", raceDate: "2025-07-01" }),
    row({ targetRunnerId: "oct", raceDate: "2025-10-01" }),
    row({ targetRunnerId: "dec", raceDate: "2025-12-31" }),
  ];

  function selected(monthFrom: number, monthTo: number) {
    return evaluateResearchRule({
      rows: datedRows,
      rule: { ...defaultResearchRule("jump"), calendarPeriod: { monthFrom, monthTo } },
    }).selectedRunners.map((selection) => selection.id);
  }

  test("includes boundary months for Jan-Mar and Apr-Jun", () => {
    assert.deepEqual(selected(1, 3), ["jan", "mar"]);
    assert.deepEqual(selected(4, 6), ["apr", "jun"]);
  });

  test("supports an inclusive Oct-Mar wrap-around range", () => {
    assert.deepEqual(selected(10, 3), ["dec", "jan", "mar", "oct"]);
  });

  test("uses identical month semantics for Turf, All Weather and Jump", () => {
    for (const [family, raceCode] of [
      ["turf_flat", "turf"],
      ["all_weather_flat", "aw"],
      ["jump", "jump"],
    ] as const) {
      const result = evaluateResearchRule({
        rows: [
          row({ targetRunnerId: `${family}-jun`, raceCode, raceDate: "2025-06-15" }),
          row({ targetRunnerId: `${family}-jul`, raceCode, raceDate: "2025-07-01" }),
        ],
        rule: { ...defaultResearchRule(family), calendarPeriod: { monthFrom: 4, monthTo: 6 } },
      });
      assert.deepEqual(result.selectedRunners.map((selection) => selection.id), [`${family}-jun`]);
    }
  });

  test("round-trips complete periods, ignores incomplete periods and preserves legacy identity", () => {
    const complete = ruleFromSearchParams(new URLSearchParams("family=jump&monthFrom=4&monthTo=9"));
    const incomplete = ruleFromSearchParams(new URLSearchParams("family=jump&monthFrom=4"));
    const roundTrip = parseResearchRule(serializeResearchRule(complete));
    const legacy = defaultResearchRule("jump");

    assert.deepEqual(complete.calendarPeriod, { monthFrom: 4, monthTo: 9 });
    assert.deepEqual(roundTrip?.calendarPeriod, complete.calendarPeriod);
    assert.equal(incomplete.calendarPeriod, undefined);
    assert.equal(researchRuleKey(legacy), researchRuleKey(parseResearchRule(serializeResearchRule(legacy))!));
    assert.notEqual(researchRuleKey(complete), researchRuleKey(legacy));
    assert.ok(strategySummary(complete).includes("Calendar period: Apr–Sep"));
    assert.ok(strategySummary({ ...legacy, calendarPeriod: { monthFrom: 10, monthTo: 3 } }).includes("Calendar period: Oct–Mar"));
  });
});

describe("research Jump subtype filters", () => {
  const jumpRows = [
    row({ targetRunnerId: "hurdle", raceName: "Mares Hurdle", raceType: "Hurdle", raceTypeCode: "HURDLE" }),
    row({ targetRunnerId: "chase", raceName: "Novices Chase", raceType: "Chase", raceTypeCode: "CHASE" }),
    row({ targetRunnerId: "bumper", raceName: "National Hunt Flat Race", raceType: "NH Flat", raceTypeCode: "NHF" }),
    row({ targetRunnerId: "unknown", raceName: "Unclassified Jump Race", raceType: null, raceTypeCode: null }),
  ];

  test("defaults legacy and explicit All rules to every Jump subtype", () => {
    const legacy = defaultResearchRule("jump");
    const explicit = { ...defaultResearchRule("jump"), race: { jumpSubtype: "all" as const } };

    assert.deepEqual(evaluateResearchRule({ rows: jumpRows, rule: legacy }).selectedRunners.map((item) => item.id).sort(), ["bumper", "chase", "hurdle", "unknown"]);
    assert.deepEqual(evaluateResearchRule({ rows: jumpRows, rule: explicit }).selectedRunners.map((item) => item.id).sort(), ["bumper", "chase", "hurdle", "unknown"]);
    assert.equal(researchRuleKey(legacy), researchRuleKey(explicit));
  });

  test("filters hurdles and chases into disjoint subsets while excluding NH Flat and unknown", () => {
    const hurdles = evaluateResearchRule({ rows: jumpRows, rule: { ...defaultResearchRule("jump"), race: { jumpSubtype: "hurdle" } } }).selectedRunners.map((item) => item.id);
    const chases = evaluateResearchRule({ rows: jumpRows, rule: { ...defaultResearchRule("jump"), race: { jumpSubtype: "chase" } } }).selectedRunners.map((item) => item.id);

    assert.deepEqual(hurdles, ["hurdle"]);
    assert.deepEqual(chases, ["chase"]);
    assert.equal(hurdles.some((id) => chases.includes(id)), false);
    assert.ok(hurdles.length + chases.length <= jumpRows.length);
  });

  test("round-trips URL and saved JSON and omits the All default from summaries", () => {
    const hurdle = ruleFromSearchParams(new URLSearchParams("family=jump&jumpSubtype=hurdle"));
    const chase = parseResearchRule(serializeResearchRule({ ...defaultResearchRule("jump"), race: { jumpSubtype: "chase" } }));
    const legacy = parseResearchRule(JSON.stringify(defaultResearchRule("jump")));

    assert.equal(hurdle.race.jumpSubtype, "hurdle");
    assert.equal(chase?.race.jumpSubtype, "chase");
    assert.equal(legacy?.race.jumpSubtype, undefined);
    assert.ok(strategySummary(hurdle).includes("Jump subtype: Hurdles"));
    assert.ok(strategySummary(chase!).includes("Jump subtype: Chases"));
    assert.equal(strategySummary(defaultResearchRule("jump")).some((line) => line.startsWith("Jump subtype:")), false);
    assert.notEqual(researchRuleKey(hurdle), researchRuleKey(chase!));
  });

  test("ignores Jump subtype outside the Jump family", () => {
    const turfRows = [row({ targetRunnerId: "turf", raceCode: "turf", raceName: "Flat Stakes", raceType: "Flat" })];
    const rule = { ...defaultResearchRule("turf_flat"), race: { jumpSubtype: "hurdle" as const } };

    assert.deepEqual(evaluateResearchRule({ rows: turfRows, rule }).selectedRunners.map((item) => item.id), ["turf"]);
    assert.equal(researchRuleKey(rule), researchRuleKey(defaultResearchRule("turf_flat")));
  });

  test("applies the frozen Chase 31-60 days definition with inclusive boundaries", () => {
    const rule: ResearchRuleV1 = {
      ...defaultResearchRule("jump"),
      race: { jumpSubtype: "chase" },
      runner: { daysSinceRun: { min: 31, max: 60 } },
    };
    const rows = [
      row({ targetRunnerId: "day-30", daysSinceLastRun: 30, raceName: "Handicap Chase", raceType: "Chase" }),
      row({ targetRunnerId: "day-31", daysSinceLastRun: 31, raceName: "Handicap Chase", raceType: "Chase" }),
      row({ targetRunnerId: "day-60", daysSinceLastRun: 60, raceName: "Novices Chase", raceType: "Chase" }),
      row({ targetRunnerId: "day-61", daysSinceLastRun: 61, raceName: "Handicap Chase", raceType: "Chase" }),
      row({ targetRunnerId: "hurdle-day-45", daysSinceLastRun: 45, raceName: "Mares Hurdle", raceType: "Hurdle" }),
      row({ targetRunnerId: "missing-days", daysSinceLastRun: null, raceName: "Handicap Chase", raceType: "Chase" }),
    ];

    assert.deepEqual(
      evaluateResearchRule({ rows, rule }).selectedRunners.map((selection) => selection.id),
      ["day-31", "day-60"],
    );
    assert.ok(strategySummary(rule).includes("Family: Jump"));
    assert.ok(strategySummary(rule).includes("Jump subtype: Chases"));
    assert.ok(strategySummary(rule).includes("Days since run: >= 31"));
    assert.ok(strategySummary(rule).includes("Days since run: <= 60"));
  });
});

describe("research trainer and return filters", () => {
  test("filters by stable trainer ID and shows trainer name in summary", () => {
    const rows = [
      row({ targetRunnerId: "selected", trainerId: "trainer-a", trainerName: "A Trainer" }),
      row({ targetRunnerId: "rejected", trainerId: "trainer-b", trainerName: "B Trainer" }),
      row({ targetRunnerId: "missing", trainerId: null, trainerName: null }),
    ];
    const rule = hydrateResearchRuleMetadata(
      { ...defaultResearchRule("jump"), runner: { trainerId: "trainer-a" } },
      rows,
    );
    const result = evaluateResearchRule({ rows, rule });

    assert.deepEqual(result.selectedRunners.map((selection) => selection.id), ["selected"]);
    assert.ok(result.strategySummary.includes("Trainer: A Trainer"));
  });

  test("filters by stable jockey ID and jockey prior metrics", () => {
    const rows = [
      row({
        targetRunnerId: "selected",
        jockeyId: "jockey-a",
        jockeyName: "A Jockey",
        jockeyPriorRuns: 50,
        jockeyPriorWins: 10,
        jockeyPriorWinRate: 20,
      }),
      row({
        targetRunnerId: "low-rate",
        jockeyId: "jockey-a",
        jockeyName: "A Jockey",
        jockeyPriorRuns: 50,
        jockeyPriorWins: 5,
        jockeyPriorWinRate: 10,
      }),
      row({
        targetRunnerId: "wrong-jockey",
        jockeyId: "jockey-b",
        jockeyName: "B Jockey",
        jockeyPriorRuns: 80,
        jockeyPriorWins: 20,
        jockeyPriorWinRate: 25,
      }),
      row({
        targetRunnerId: "missing-rate",
        jockeyId: "jockey-a",
        jockeyName: "A Jockey",
        jockeyPriorRuns: 0,
        jockeyPriorWins: 0,
        jockeyPriorWinRate: null,
      }),
    ];
    const rule = hydrateResearchRuleMetadata(
      {
        ...defaultResearchRule("jump"),
        runner: {
          jockeyId: "jockey-a",
          jockeyPriorRuns: { min: 50 },
          jockeyPriorWinRate: { min: 15 },
        },
      },
      rows,
    );
    const result = evaluateResearchRule({ rows, rule });

    assert.deepEqual(result.selectedRunners.map((selection) => selection.id), ["selected"]);
    assert.ok(result.strategySummary.includes("Jockey: A Jockey"));
    assert.ok(result.strategySummary.includes("Jockey prior rides: >= 50"));
    assert.ok(result.strategySummary.includes("Jockey prior win rate: >= 15%"));
  });

  test("return bucket boundaries and first career run remain distinct", () => {
    const rows = [
      row({ targetRunnerId: "d0", daysSinceLastRun: 0 }),
      row({ targetRunnerId: "d30", daysSinceLastRun: 30 }),
      row({ targetRunnerId: "d31", daysSinceLastRun: 31 }),
      row({ targetRunnerId: "d60", daysSinceLastRun: 60 }),
      row({ targetRunnerId: "d61", daysSinceLastRun: 61 }),
      row({ targetRunnerId: "d90", daysSinceLastRun: 90 }),
      row({ targetRunnerId: "d91", daysSinceLastRun: 91 }),
      row({ targetRunnerId: "d180", daysSinceLastRun: 180 }),
      row({ targetRunnerId: "d181", daysSinceLastRun: 181 }),
      row({ targetRunnerId: "d365", daysSinceLastRun: 365 }),
      row({ targetRunnerId: "d366", daysSinceLastRun: 366 }),
      row({ targetRunnerId: "first", daysSinceLastRun: null }),
    ];

    const idsFor = (returnBucket: ResearchRuleV1["runner"]["returnBucket"]) =>
      evaluateResearchRule({
        rows,
        rule: { ...defaultResearchRule("jump"), runner: { returnBucket } },
      }).selectedRunners.map((selection) => selection.id).sort();

    assert.deepEqual(idsFor("days_0_30"), ["d0", "d30"]);
    assert.deepEqual(idsFor("days_31_60"), ["d31", "d60"]);
    assert.deepEqual(idsFor("days_61_90"), ["d61", "d90"]);
    assert.deepEqual(idsFor("days_91_180"), ["d180", "d91"]);
    assert.deepEqual(idsFor("days_181_365"), ["d181", "d365"]);
    assert.deepEqual(idsFor("days_366_plus"), ["d366"]);
    assert.deepEqual(idsFor("first_run"), ["first"]);
  });

  test("return bucket and exact days filters are combined with AND semantics", () => {
    const result = evaluateResearchRule({
      rows: [
        row({ targetRunnerId: "too-short", daysSinceLastRun: 91 }),
        row({ targetRunnerId: "selected", daysSinceLastRun: 120 }),
        row({ targetRunnerId: "too-long", daysSinceLastRun: 181 }),
      ],
      rule: {
        ...defaultResearchRule("jump"),
        runner: {
          returnBucket: "days_91_180",
          daysSinceRun: { min: 100, max: 150 },
        },
      },
    });

    assert.deepEqual(result.selectedRunners.map((selection) => selection.id), ["selected"]);
  });

  test("filters run number after a 90-day break", () => {
    const rows = [
      row({ targetRunnerId: "run1", runAfterBreakNumber: 1 }),
      row({ targetRunnerId: "run2", runAfterBreakNumber: 2 }),
      row({ targetRunnerId: "run3", runAfterBreakNumber: 3 }),
      row({ targetRunnerId: "run4", runAfterBreakNumber: 4 }),
      row({ targetRunnerId: "none", runAfterBreakNumber: null }),
    ];
    const idsFor = (runAfterBreak: ResearchRuleV1["runner"]["runAfterBreak"]) =>
      evaluateResearchRule({
        rows,
        rule: { ...defaultResearchRule("jump"), runner: { runAfterBreak } },
      }).selectedRunners.map((selection) => selection.id);

    assert.deepEqual(idsFor("run_1"), ["run1"]);
    assert.deepEqual(idsFor("run_2"), ["run2"]);
    assert.deepEqual(idsFor("run_3"), ["run3"]);
    assert.deepEqual(idsFor("run_4_plus"), ["run4"]);
  });

  test("filters career prior runs inclusively and treats zero as a real value", () => {
    const rows = [
      row({ targetRunnerId: "debutant", priorRuns: 0 }),
      row({ targetRunnerId: "one-run", priorRuns: 1 }),
      row({ targetRunnerId: "two-runs", priorRuns: 2 }),
      row({ targetRunnerId: "many-runs", priorRuns: 7 }),
      row({ targetRunnerId: "missing", priorRuns: null as unknown as number }),
    ];
    const idsFor = (priorRuns: ResearchRuleV1["runner"]["priorRuns"]) =>
      evaluateResearchRule({
        rows,
        rule: { ...defaultResearchRule("jump"), runner: { priorRuns } },
      }).selectedRunners.map((selection) => selection.id).sort();

    assert.deepEqual(idsFor(undefined), ["debutant", "many-runs", "missing", "one-run", "two-runs"]);
    assert.deepEqual(idsFor({ min: 1 }), ["many-runs", "one-run", "two-runs"]);
    assert.deepEqual(idsFor({ min: 1, max: 1 }), ["one-run"]);
    assert.deepEqual(idsFor({ min: 2 }), ["many-runs", "two-runs"]);
    assert.deepEqual(idsFor({ max: 0 }), ["debutant"]);
  });
});

function row(
  featureOverrides: Partial<HistoricalPreRaceFeatureRow> = {},
  outcomeOverrides: Partial<HistoricalPostRaceOutcome> = {},
): HistoricalTargetRunnerMetricsRow {
  const features = feature(featureOverrides);
  return {
    features,
    outcome: outcome({
      targetRaceId: features.targetRaceId,
      targetRunnerId: features.targetRunnerId,
      ...outcomeOverrides,
    }),
  };
}

function turfPerformanceRows(): HistoricalTargetRunnerMetricsRow[] {
  return [
    row(turfPerformanceFeature("tpr-top", 120, 135)),
    row(turfPerformanceFeature("tpr-second", 85, 100)),
    row(turfPerformanceFeature("tpr-third", 75, 90)),
  ];
}

function turfPerformanceFeature(
  targetRunnerId: string,
  latestPerformanceRating: number,
  latestTurfSpeedRating: number,
): Partial<HistoricalPreRaceFeatureRow> {
  return {
    targetRunnerId,
    raceCode: "turf",
    raceClass: "Class 4",
    weightCarriedLbs: 126,
    latestPerformanceRating,
    previousPerformanceRating: null,
    averagePerformanceLast3: null,
    latestTurfSpeedRating,
    previousTurfSpeedRating: null,
    averageTurfSpeedLast3: null,
  };
}

function feature(
  overrides: Partial<HistoricalPreRaceFeatureRow> = {},
): HistoricalPreRaceFeatureRow {
  return {
    targetRaceId: "race-1",
    targetRunnerId: "runner-1",
    source: "sporting_life",
    horseId: "horse-1",
    horseName: "Example",
    trainerId: "trainer-1",
    trainerName: "A Trainer",
    trainerPriorRuns: 20,
    trainerPriorWins: 3,
    trainerPriorWinRate: 15,
    raceDateTime: new Date("2025-01-01T12:00:00.000Z"),
    raceDate: "2025-01-01",
    courseId: "course-1",
    courseName: "Worcester",
    raceName: "Handicap Chase",
    raceClass: "Class 3",
    raceType: "Chase",
    raceTypeCode: null,
    distanceYards: 4400,
    going: "Good",
    declaredRunnerCount: 8,
    actualRunnerCount: 8,
    surface: null,
    raceCode: "jump",
    horseAge: 7,
    officialRating: 100,
    weight: "11-2",
    weightCarriedLbs: 156,
    draw: null,
    odds: null,
    oddsDecimal: null,
    priorRuns: 3,
    priorWins: 1,
    priorPlaces: 2,
    winPercentage: 33.333,
    placePercentage: 66.667,
    latestRunDate: "2024-12-01",
    daysSinceLastRun: 31,
    breakLengthDays: null,
    runAfterBreakNumber: null,
    latestOr: 98,
    previousOr: 97,
    latestSpeedRating: 105,
    previousSpeedRating: 101,
    bestSpeedLast3: 106,
    bestSpeedLast5: 106,
    averageSpeedLast3: 102,
    averageSpeedLast5: 102,
    latestPerformanceRating: 100,
    previousPerformanceRating: 99,
    bestPerformanceLast3: 103,
    bestPerformanceLast5: 103,
    averagePerformanceLast3: 100,
    averagePerformanceLast5: 100,
    latestPerformanceCalculationVersion: "weight_performance_v1",
    currentWeightCarriedLb: 156,
    latestTodaysRating: 112,
    previousTodaysRating: 111,
    bestTodaysRatingLast3: 115,
    bestTodaysRatingLast5: 115,
    averageTodaysRatingLast3: 112,
    averageTodaysRatingLast5: 112,
    todaysRatingCalculationVersion: "todays_rating_v1",
    latestJumpSpeedRating: 105,
    previousJumpSpeedRating: 101,
    bestJumpSpeedLast3: 106,
    bestJumpSpeedLast5: 106,
    averageJumpSpeedLast3: 102,
    averageJumpSpeedLast5: 102,
    latestAwSpeedRating: null,
    previousAwSpeedRating: null,
    bestAwSpeedLast3: null,
    bestAwSpeedLast5: null,
    averageAwSpeedLast3: null,
    averageAwSpeedLast5: null,
    latestTurfSpeedRating: null,
    previousTurfSpeedRating: null,
    bestTurfSpeedLast3: null,
    bestTurfSpeedLast5: null,
    averageTurfSpeedLast3: null,
    averageTurfSpeedLast5: null,
    latestSpeedMethod: "base",
    latestSpeedConfidence: "medium",
    speedCalculationVersion: "jump_speed_v1",
    ...overrides,
  };
}

function outcome(
  overrides: Partial<HistoricalPostRaceOutcome> = {},
): HistoricalPostRaceOutcome {
  return {
    targetRaceId: "race-1",
    targetRunnerId: "runner-1",
    finishingPosition: 1,
    resultStatus: "finished",
    won: true,
    placed: true,
    startingPrice: "5/1",
    startingPriceDecimal: "6.000",
    ...overrides,
  };
}

function resolvedCohort(rule: ResearchRuleV1, trainerIds: string[]): ResolvedTrainerCohort {
  return {
    definition: rule.runner.trainerCohort ?? trainerCohortRule(10),
    cohortYear: 2025,
    referenceYear: 2024,
    family: rule.family,
    members: trainerIds.map((trainerId, index) => ({
      cohortYear: 2025,
      referenceYear: 2024,
      family: rule.family,
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

function numberedIds(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => `${prefix}-${String(index + 1).padStart(2, "0")}`);
}
