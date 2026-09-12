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
      manifest: manifestFor({ family: "jump", from: "2026-01-01", to: "2026-06-30", rowCount: 5 }),
      rows: [
        row({
          targetRunnerId: "winner",
          trainerId: "trainer-a",
          latestSpeedRating: 105,
          raceClass: "Class 1",
          raceDate: "2026-02-01",
        }, { won: true, placed: true, finishingPosition: 1, startingPriceDecimal: "3.000" }),
        row({
          targetRunnerId: "loser",
          trainerId: "trainer-a",
          latestSpeedRating: 104,
          raceClass: "Class 2",
          raceDate: "2026-02-01",
        }, { won: false, placed: false, finishingPosition: 5, startingPriceDecimal: "5.000" }),
        row({ targetRunnerId: "too-slow", trainerId: "trainer-a", latestSpeedRating: 90, raceDate: "2026-02-01" }),
        row({
          targetRaceId: "race-2",
          targetRunnerId: "wrong-trainer",
          trainerId: "trainer-b",
          latestSpeedRating: 110,
          raceDate: "2026-02-01",
        }),
        row({
          targetRaceId: "race-3",
          targetRunnerId: "wrong-year",
          trainerId: "trainer-a",
          latestSpeedRating: 120,
          raceDate: "2025-12-31",
        }),
      ],
    });

    const snapshot = await evaluateHoldoutForSavedRule(savedRule, {
      outputDir: root,
      validatedAt: new Date("2026-09-12T12:00:00.000Z"),
    });

    assert.equal((savedRule.canonicalRule as ResearchRuleV1).dateRange.from, "2025-01-01");
    assert.equal(snapshot.holdoutYear, "2026");
    assert.equal(snapshot.holdoutFrom, "2026-01-01");
    assert.equal(snapshot.holdoutTo, "2026-06-30");
    assert.equal(snapshot.ruleIdentity, savedRule.ruleIdentity);
    assert.equal(snapshot.ruleSchemaVersion, RESEARCH_RULE_VERSION);
    assert.equal(snapshot.eligibleRunners, 3);
    assert.equal(snapshot.selections, 2);
    assert.equal(snapshot.settledSelections, 2);
    assert.equal(snapshot.winners, 1);
    assert.equal(snapshot.places, 1);
    assert.equal(snapshot.profitLoss, 1);
    assert.equal(snapshot.roiPercentage, 50);
    assert.equal(snapshot.maxConsecutiveLosers, 0);
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

    assert.equal(snapshot.holdoutTo, "2026-08-31");
    assert.equal(snapshot.selections, 1);
    assert.equal(snapshot.settledSelections, 0);
    assert.equal(snapshot.status, "no_settled_holdout_selections");
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
        noSettlementSp: 0,
        nonRunnerOrUnsettled: 0,
      },
      strategySummary: [],
      cache: null,
      elapsedMs: 0,
    }),
    holdoutSnapshot: null,
    cacheMetadata: null,
    createdAt: new Date("2026-09-11T10:00:00.000Z"),
    updatedAt: new Date("2026-09-11T10:00:00.000Z"),
    frozenAt: new Date("2026-09-11T10:30:00.000Z"),
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
