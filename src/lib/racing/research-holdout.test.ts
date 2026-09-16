import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import {
  BACKTEST_FEATURE_CACHE_VERSION,
  cacheDirectory,
  type BacktestFeatureCacheManifest,
} from "./backtest-cache";
import { BACKTEST_FEATURE_SOURCE_VERSION } from "./historical-target-metrics";
import type {
  HistoricalPostRaceOutcome,
  HistoricalPreRaceFeatureRow,
  HistoricalTargetRunnerMetricsRow,
} from "./historical-target-metrics";
import {
  HOLDOUT_CACHE_MISSING_MESSAGE,
  evaluateHoldoutForSavedRule,
} from "./research-holdout";
import {
  RESEARCH_RULE_VERSION,
  defaultResearchRule,
  type ResearchRuleV1,
} from "./research-rule";
import { canonicalResearchRule, researchRuleKey } from "./research-rule-identity";
import { trainerCohortRule, type ResolvedTrainerCohort } from "./trainer-cohorts";
import { TURF_PERFORMANCE_RATING_VERSION } from "./turf-performance-rating";
import {
  developmentSnapshotFromResult,
  type SavedResearchRule,
} from "./saved-research-rules";

describe("research holdout validation", () => {
  test("rejects missing or incompatible 2026 holdout cache before evaluating", async () => {
    const root = await mkdtemp(join(tmpdir(), "racing-holdout-missing-"));
    await assert.rejects(
      () => evaluateHoldoutForSavedRule(savedRuleFor(defaultResearchRule("jump")), { outputDir: root }),
      new RegExp(HOLDOUT_CACHE_MISSING_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );

    await writeCache(root, {
      manifest: manifestFor({
        family: "jump",
        sourceFeatureVersion: "old" as typeof BACKTEST_FEATURE_SOURCE_VERSION,
        from: "2026-01-01",
        to: "2026-06-30",
      }),
      rows: [row({ raceDate: "2026-01-03" })],
    });

    await assert.rejects(
      () => evaluateHoldoutForSavedRule(savedRuleFor(defaultResearchRule("jump")), { outputDir: root }),
      new RegExp(HOLDOUT_CACHE_MISSING_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  });

  test("evaluates the frozen rule against the 2026 range without mutating the stored canonical rule", async () => {
    const root = await mkdtemp(join(tmpdir(), "racing-holdout-"));
    const rule: ResearchRuleV1 = {
      ...defaultResearchRule("jump"),
      race: { raceClasses: [2, 1] },
      runner: { trainerId: "trainer-a" },
      ratings: [{ metric: "latestSpeedRating", range: { min: 100 } }],
      ranks: [{ metric: "latestSpeedRating", range: { max: 2 } }],
    };
    const savedRule = savedRuleFor(rule);
    await writeCache(root, {
      manifest: manifestFor({ family: "jump", from: "2026-01-01", to: "2026-12-31", rowCount: 5 }),
      rows: [
        row({
          targetRunnerId: "winner",
          trainerId: "trainer-a",
          latestSpeedRating: 105,
          raceClass: "Class 1",
          raceDate: "2026-01-03",
        }, { won: true, placed: true, finishingPosition: 1, startingPriceDecimal: "3.000" }),
        row({
          targetRunnerId: "loser",
          trainerId: "trainer-a",
          latestSpeedRating: 104,
          raceClass: "Class 2",
          raceDate: "2026-09-11",
        }, { won: false, placed: false, finishingPosition: 5, startingPriceDecimal: "5.000" }),
        row({ targetRunnerId: "too-slow", trainerId: "trainer-a", latestSpeedRating: 90, raceDate: "2026-02-01" }),
        row({
          targetRaceId: "race-2",
          targetRunnerId: "wrong-trainer",
          trainerId: "trainer-b",
          latestSpeedRating: 110,
          raceDate: "2026-02-01",
        }),
      ],
    });

    const snapshot = await evaluateHoldoutForSavedRule(savedRule, {
      outputDir: root,
      validatedAt: new Date("2026-09-12T12:00:00.000Z"),
    });

    assert.equal((savedRule.canonicalRule as ResearchRuleV1).dateRange.from, "2025-01-01");
    assert.equal(snapshot.holdoutYear, "2026");
    assert.equal(snapshot.holdoutFrom, "2026-01-03");
    assert.equal(snapshot.holdoutTo, "2026-09-11");
    assert.equal(snapshot.requestedCacheFrom, "2026-01-01");
    assert.equal(snapshot.requestedCacheTo, "2026-12-31");
    assert.equal(snapshot.ruleIdentity, savedRule.ruleIdentity);
    assert.equal(snapshot.ruleSchemaVersion, RESEARCH_RULE_VERSION);
    assert.equal(snapshot.eligibleRunners, 3);
    assert.equal(snapshot.selections, 2);
    assert.equal(snapshot.settledSelections, 2);
    assert.equal(snapshot.winners, 1);
    assert.equal(snapshot.places, 1);
    assert.equal(snapshot.profitLoss, 1);
    assert.equal(snapshot.roiPercentage, 50);
    assert.equal(snapshot.maxConsecutiveLosers, 1);
    assert.equal(snapshot.status, "insufficient_holdout_sample");
  });

  test("records no-settled status and uses the latest compatible 2026 cache range", async () => {
    const root = await mkdtemp(join(tmpdir(), "racing-holdout-latest-"));
    const savedRule = savedRuleFor(defaultResearchRule("jump"));
    await writeCache(root, {
      manifest: manifestFor({ family: "jump", from: "2026-01-01", to: "2026-03-31", rowCount: 1 }),
      rows: [row({ targetRunnerId: "early", raceDate: "2026-03-01" })],
    });
    await writeCache(root, {
      manifest: manifestFor({ family: "jump", from: "2026-01-01", to: "2026-08-31", rowCount: 1 }),
      rows: [row({ targetRunnerId: "late", raceDate: "2026-08-01" }, { resultStatus: "non_runner" })],
    });

    const snapshot = await evaluateHoldoutForSavedRule(savedRule, { outputDir: root });

    assert.equal(snapshot.holdoutTo, "2026-08-01");
    assert.equal(snapshot.requestedCacheTo, "2026-08-31");
    assert.equal(snapshot.selections, 1);
    assert.equal(snapshot.settledSelections, 0);
    assert.equal(snapshot.status, "no_settled_holdout_selections");
  });

  test("resolves frozen trainer cohort concept against the supplied 2026 holdout cohort", async () => {
    const root = await mkdtemp(join(tmpdir(), "racing-holdout-cohort-"));
    const rule: ResearchRuleV1 = {
      ...defaultResearchRule("jump"),
      runner: { trainerCohort: trainerCohortRule(20) },
    };
    await writeCache(root, {
      manifest: manifestFor({ family: "jump", from: "2026-01-01", to: "2026-12-31", rowCount: 2 }),
      rows: [
        row({ targetRunnerId: "matched", trainerId: "trainer-2025", raceDate: "2026-01-03" }),
        row({ targetRunnerId: "old-dev-member", trainerId: "trainer-2024", raceDate: "2026-01-03" }),
      ],
    });

    const snapshot = await evaluateHoldoutForSavedRule(savedRuleFor(rule), {
      outputDir: root,
      trainerCohort: resolvedCohort(rule, ["trainer-2025"], 2026),
    });

    assert.equal(snapshot.selections, 1);
    assert.equal(snapshot.settledSelections, 1);
  });

  test("evaluates frozen trainer and course arrays against the 2026 holdout cache", async () => {
    const root = await mkdtemp(join(tmpdir(), "racing-holdout-multi-"));
    const rule: ResearchRuleV1 = {
      ...defaultResearchRule("jump"),
      race: { courseIds: ["course-1", "course-2"] },
      runner: { trainerIds: ["trainer-a", "trainer-c"] },
    };
    await writeCache(root, {
      manifest: manifestFor({ family: "jump", from: "2026-01-01", to: "2026-12-31", rowCount: 4 }),
      rows: [
        row({ targetRunnerId: "trainer-a-course-1", trainerId: "trainer-a", courseId: "course-1", raceDate: "2026-01-03" }),
        row({ targetRunnerId: "trainer-c-course-2", trainerId: "trainer-c", courseId: "course-2", raceDate: "2026-01-04" }),
        row({ targetRunnerId: "wrong-trainer", trainerId: "trainer-b", courseId: "course-1", raceDate: "2026-01-05" }),
        row({ targetRunnerId: "wrong-course", trainerId: "trainer-a", courseId: "course-3", raceDate: "2026-01-06" }),
      ],
    });

    const snapshot = await evaluateHoldoutForSavedRule(savedRuleFor(rule), { outputDir: root });

    assert.equal(snapshot.selections, 2);
    assert.equal(snapshot.settledSelections, 2);
  });

  test("evaluates frozen jockey filters against the 2026 holdout cache", async () => {
    const root = await mkdtemp(join(tmpdir(), "racing-holdout-jockey-"));
    const rule: ResearchRuleV1 = {
      ...defaultResearchRule("jump"),
      runner: {
        jockeyIds: ["jockey-a", "jockey-c"],
        jockeyPriorRuns: { min: 50 },
        jockeyPriorWinRate: { min: 15 },
      },
    };
    await writeCache(root, {
      manifest: manifestFor({ family: "jump", from: "2026-01-01", to: "2026-12-31", rowCount: 4 }),
      rows: [
        row({ targetRunnerId: "selected", jockeyId: "jockey-a", jockeyName: "A Jockey", jockeyPriorRuns: 80, jockeyPriorWins: 16, jockeyPriorWinRate: 20, raceDate: "2026-01-03" }),
        row({ targetRunnerId: "low-runs", jockeyId: "jockey-a", jockeyName: "A Jockey", jockeyPriorRuns: 49, jockeyPriorWins: 10, jockeyPriorWinRate: 20.4, raceDate: "2026-01-04" }),
        row({ targetRunnerId: "wrong-jockey", jockeyId: "jockey-b", jockeyName: "B Jockey", jockeyPriorRuns: 80, jockeyPriorWins: 16, jockeyPriorWinRate: 20, raceDate: "2026-01-05" }),
        row({ targetRunnerId: "missing-rate", jockeyId: "jockey-c", jockeyName: "C Jockey", jockeyPriorRuns: 0, jockeyPriorWins: 0, jockeyPriorWinRate: null, raceDate: "2026-01-06" }),
      ],
    });

    const snapshot = await evaluateHoldoutForSavedRule(savedRuleFor(rule), { outputDir: root });

    assert.equal(snapshot.selections, 1);
    assert.equal(snapshot.settledSelections, 1);
  });

  test("evaluates frozen Starting Price filters against the 2026 holdout cache", async () => {
    const root = await mkdtemp(join(tmpdir(), "racing-holdout-sp-"));
    const rule: ResearchRuleV1 = {
      ...defaultResearchRule("jump"),
      startingPrice: { minDecimal: 4, maxDecimalExclusive: 7 },
    };
    await writeCache(root, {
      manifest: manifestFor({ family: "jump", from: "2026-01-01", to: "2026-12-31", rowCount: 4 }),
      rows: [
        row({ targetRunnerId: "below", raceDate: "2026-01-03" }, { won: false, placed: false, finishingPosition: 4, startingPriceDecimal: "3.999" }),
        row({ targetRunnerId: "lower-bound", raceDate: "2026-01-04" }, { won: false, placed: false, finishingPosition: 4, startingPriceDecimal: "4.000" }),
        row({ targetRunnerId: "upper-band", raceDate: "2026-01-05" }, { won: false, placed: false, finishingPosition: 4, startingPriceDecimal: "6.999" }),
        row({ targetRunnerId: "upper-exclusive", raceDate: "2026-01-06" }, { won: false, placed: false, finishingPosition: 4, startingPriceDecimal: "7.000" }),
      ],
    });

    const snapshot = await evaluateHoldoutForSavedRule(savedRuleFor(rule), { outputDir: root });

    assert.equal(snapshot.selections, 2);
    assert.equal(snapshot.settledSelections, 2);
  });

  test("evaluates official rating rank alongside a generic rank in holdout", async () => {
    const root = await mkdtemp(join(tmpdir(), "racing-holdout-or-rank-"));
    const rule: ResearchRuleV1 = {
      ...defaultResearchRule("jump"),
      ranks: [
        { metric: "latestSpeedRating", range: { min: 3 } },
        { metric: "officialRating", range: { min: 3 } },
      ],
    };
    await writeCache(root, {
      manifest: manifestFor({ family: "jump", from: "2026-01-01", to: "2026-12-31", rowCount: 5 }),
      rows: [
        row({ targetRunnerId: "top-speed-top-or", latestSpeedRating: 120, officialRating: 150, raceDate: "2026-01-03" }),
        row({ targetRunnerId: "second-speed-second-or", latestSpeedRating: 110, officialRating: 140, raceDate: "2026-01-03" }),
        row({ targetRunnerId: "selected-third", latestSpeedRating: 100, officialRating: 130, raceDate: "2026-01-03" }),
        row({ targetRunnerId: "selected-fourth", latestSpeedRating: 90, officialRating: 120, raceDate: "2026-01-03" }),
        row({ targetRunnerId: "missing-or", latestSpeedRating: 80, officialRating: null, raceDate: "2026-01-03" }),
      ],
    });

    const snapshot = await evaluateHoldoutForSavedRule(savedRuleFor(rule), { outputDir: root });

    assert.equal(snapshot.selections, 2);
    assert.equal(snapshot.settledSelections, 2);
  });

  test("evaluates frozen TPR version filters against the 2026 holdout cache", async () => {
    const root = await mkdtemp(join(tmpdir(), "racing-holdout-tpr-"));
    const rule: ResearchRuleV1 = {
      ...defaultResearchRule("turf_flat"),
      turfPerformance: {
        version: TURF_PERFORMANCE_RATING_VERSION,
        rank: { min: 1, max: 1 },
        lead: { min: 10 },
      },
    };
    await writeCache(root, {
      manifest: manifestFor({ family: "turf_flat", from: "2026-01-01", to: "2026-12-31", rowCount: 3 }),
      rows: [
        row(turfPerformanceFeature("tpr-top", 120, 135, "2026-01-03")),
        row(turfPerformanceFeature("tpr-second", 85, 100, "2026-01-03")),
        row(turfPerformanceFeature("tpr-third", 75, 90, "2026-01-03")),
      ],
    });

    const snapshot = await evaluateHoldoutForSavedRule(savedRuleFor(rule), { outputDir: root });

    assert.equal(snapshot.selections, 1);
    assert.equal(snapshot.settledSelections, 1);
  });

  test("uses actual result SP for holdout even when development snapshot was capped", async () => {
    const root = await mkdtemp(join(tmpdir(), "racing-holdout-actual-sp-"));
    const savedRule = savedRuleFor(defaultResearchRule("jump"));
    savedRule.developmentSnapshot.developmentSettlementMode = "cap_20_1";
    await writeCache(root, {
      manifest: manifestFor({ family: "jump", from: "2026-01-01", to: "2026-12-31", rowCount: 1 }),
      rows: [
        row(
          { targetRunnerId: "huge-price-winner", raceDate: "2026-03-01" },
          { won: true, placed: true, finishingPosition: 1, startingPriceDecimal: "201.000" },
        ),
      ],
    });

    const snapshot = await evaluateHoldoutForSavedRule(savedRule, { outputDir: root });

    assert.equal(snapshot.profitLoss, 200);
    assert.equal(snapshot.roiPercentage, 20000);
    assert.equal(snapshot.developmentSettlementMode, undefined);
  });
});

async function writeCache(
  root: string,
  input: { manifest: BacktestFeatureCacheManifest; rows: HistoricalTargetRunnerMetricsRow[] },
): Promise<void> {
  const directory = cacheDirectory({
    outputDir: root,
    from: input.manifest.from,
    to: input.manifest.to,
    family: input.manifest.family,
    source: input.manifest.source,
  });
  await import("node:fs/promises").then(({ mkdir }) => mkdir(directory, { recursive: true }));
  const manifest = { ...input.manifest, rowCount: input.rows.length };
  await writeFile(join(directory, "manifest.json"), JSON.stringify(manifest), "utf8");
  await writeFile(
    join(directory, "features.ndjson"),
    input.rows
      .map(({ features }) => JSON.stringify({ ...features, raceDateTime: features.raceDateTime.toISOString() }))
      .join("\n") + "\n",
    "utf8",
  );
  await writeFile(
    join(directory, "outcomes.ndjson"),
    input.rows.map(({ outcome }) => JSON.stringify(outcome)).join("\n") + "\n",
    "utf8",
  );
}

function savedRuleFor(rule: ResearchRuleV1): SavedResearchRule {
  return {
    id: "a1111111-1111-4111-8111-111111111111",
    name: "Saved rule",
    notes: null,
    status: "frozen",
    ruleSchemaVersion: RESEARCH_RULE_VERSION,
    ruleIdentity: researchRuleKey(rule),
    canonicalRule: canonicalResearchRule(rule),
    family: rule.family,
    developmentFrom: rule.dateRange.from,
    developmentTo: rule.dateRange.to,
    developmentSnapshot: developmentSnapshotFromResult({
      rule,
      rowsEvaluated: 0,
      baselineRows: 0,
      baselineSettledRunners: 0,
      baselineWins: 0,
      baselineWinStrikeRate: null,
      selectedRunners: [],
      summary: {
        totalEligibleRunners: 0,
        selections: 0,
        settledSelections: 0,
        wins: 0,
        winStrikeRate: null,
        places: 0,
        placeStrikeRate: null,
        averageOdds: null,
        totalStakes: 0,
        grossReturn: 0,
        profitLoss: 0,
        roiPercentage: null,
        maxConsecutiveLosers: 0,
      },
      missingData: {
        noSpeed: 0,
        noPerformance: 0,
        noTodaysRating: 0,
        noOr: 0,
        noWeight: 0,
        noTrainerPriorHistory: 0,
        noSettlementSp: 0,
        nonRunnerOrUnsettled: 0,
      },
      strategySummary: [],
      cache: null,
      elapsedMs: 0,
      trainerCohort: null,
    }),
    holdoutSnapshot: null,
    cacheMetadata: null,
    createdAt: new Date("2026-09-11T10:00:00.000Z"),
    updatedAt: new Date("2026-09-11T10:00:00.000Z"),
    frozenAt: new Date("2026-09-11T10:30:00.000Z"),
  };
}

function resolvedCohort(rule: ResearchRuleV1, trainerIds: string[], cohortYear: number): ResolvedTrainerCohort {
  return {
    definition: rule.runner.trainerCohort ?? trainerCohortRule(10),
    cohortYear,
    referenceYear: cohortYear - 1,
    family: rule.family,
    members: trainerIds.map((trainerId, index) => ({
      cohortYear,
      referenceYear: cohortYear - 1,
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

function manifestFor(overrides: Partial<BacktestFeatureCacheManifest> = {}): BacktestFeatureCacheManifest {
  return {
    featureSchemaVersion: BACKTEST_FEATURE_CACHE_VERSION,
    sourceFeatureVersion: BACKTEST_FEATURE_SOURCE_VERSION,
    source: "sporting_life",
    from: "2026-01-01",
    to: "2026-06-30",
    family: "jump",
    generatedAt: "2026-09-12T00:00:00.000Z",
    rowCount: 0,
    featuresFile: "features.ndjson",
    outcomesFile: "outcomes.ndjson",
    calculationVersions: {
      jumpSpeed: "jump_speed_v1",
      awSpeed: "aw_speed_v1",
      turfSpeed: "turf_speed_v1",
      weightPerformance: "weight_performance_v1",
      todaysRating: "todays_rating_v1",
    },
    ...overrides,
  };
}

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

function feature(overrides: Partial<HistoricalPreRaceFeatureRow> = {}): HistoricalPreRaceFeatureRow {
  const raceDate = overrides.raceDate ?? "2026-01-01";
  return {
    targetRaceId: "race-1",
    targetRunnerId: "runner-1",
    source: "sporting_life",
    horseId: "horse-1",
    horseName: "Example",
    trainerId: "trainer-a",
    trainerName: "A Trainer",
    trainerPriorRuns: 20,
    trainerPriorWins: 3,
    trainerPriorWinRate: 15,
    raceDateTime: new Date(`${raceDate}T12:00:00.000Z`),
    raceDate,
    courseId: "course-1",
    courseName: "Worcester",
    raceName: "Handicap Chase",
    raceClass: "Class 1",
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
    latestRunDate: "2025-12-01",
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

function turfPerformanceFeature(
  targetRunnerId: string,
  latestPerformanceRating: number,
  latestTurfSpeedRating: number,
  raceDate: string,
): Partial<HistoricalPreRaceFeatureRow> {
  return {
    targetRunnerId,
    raceDate,
    raceCode: "turf",
    raceName: "Turf Handicap",
    raceClass: "Class 4",
    raceType: "Flat",
    distanceYards: 1760,
    weightCarriedLbs: 126,
    latestPerformanceRating,
    previousPerformanceRating: null,
    averagePerformanceLast3: null,
    latestTurfSpeedRating,
    previousTurfSpeedRating: null,
    averageTurfSpeedLast3: null,
  };
}

function outcome(overrides: Partial<HistoricalPostRaceOutcome> = {}): HistoricalPostRaceOutcome {
  return {
    targetRaceId: "race-1",
    targetRunnerId: "runner-1",
    finishingPosition: 1,
    resultStatus: "finished",
    won: true,
    placed: true,
    startingPrice: "2/1",
    startingPriceDecimal: "3.000",
    ...overrides,
  };
}
