import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  defaultResearchRule,
  distanceBucketIdForYards,
  evaluateResearchRule,
  formatExactDistance,
  formatWeightLbsAsStonePounds,
  hydrateResearchRuleMetadata,
  parseWeightOptionToLbs,
  parseResearchRule,
  rankRows,
  ruleFromSearchParams,
  classifyHandicapStatus,
  researchFilterOptionsForRows,
  serializeResearchRule,
  trainerOptionsForRows,
  weightOptions,
  type ResearchRuleV1,
} from "./research-rule";
import { researchRuleKey } from "./research-rule-identity";
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
        rule: { ...defaultResearchRule("jump"), race: { courseName: "Lingfield" } },
      }).selectedRunners.map((selection) => selection.id).sort(),
      ["rejected", "selected"],
    );
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
        courseId: "course-1",
        distanceBucketFrom: distanceBucketIdForYards(1760),
        distanceBucketTo: distanceBucketIdForYards(2200),
        distanceYards: { min: 1760, max: 2200 },
      },
      ranks: [{ metric: "bestPerformanceLast3", range: { max: 2 } }],
    };

    assert.deepEqual(parseResearchRule(serializeResearchRule(rule)), rule);
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
        ["1", "Class 1", 1],
        ["3", "Class 3", 2],
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
      ).runner.trainerName,
      "B Trainer",
    );
    assert.equal(
      hydrateResearchRuleMetadata(
        { ...defaultResearchRule("jump"), runner: { trainerId: "trainer-missing" } },
        rows,
      ).runner.trainerId,
      undefined,
    );
  });

  test("hydrates display metadata for stable-ID and old course-name rules", () => {
    const rows = [row({ courseId: "course-a", courseName: "Ascot" })];

    assert.equal(
      hydrateResearchRuleMetadata(
        { ...defaultResearchRule("jump"), race: { courseId: "course-a" } },
        rows,
      ).race.courseName,
      "Ascot",
    );

    assert.equal(
      hydrateResearchRuleMetadata(
        { ...defaultResearchRule("jump"), race: { courseName: "Ascot" } },
        rows,
      ).race.courseId,
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
