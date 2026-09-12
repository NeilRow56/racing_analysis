import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, test } from "node:test";
import {
  evaluateBacktestRowSet,
  evaluateBacktestRows,
  summarizeSelections,
  type BacktestSelection,
} from "./backtest";
import {
  BACKTEST_FEATURE_CACHE_VERSION,
  DEFAULT_CACHE_BUILD_BATCH_SIZE,
  cacheDirectory,
  actualCoverageForRows,
  featureTargetBatches,
  isCompatibleManifest,
  loadBacktestFeatureCache,
  rowsFromCachedParts,
  type BacktestFeatureCacheManifest,
} from "./backtest-cache";
import { BACKTEST_FEATURE_SOURCE_VERSION } from "./historical-target-metrics";
import type {
  HistoricalPostRaceOutcome,
  HistoricalPreRaceFeatureRow,
  HistoricalTargetRunnerMetricsRow,
} from "./historical-target-metrics";

describe("backtest feature cache", () => {
  test("validates cache feature and calculation versions", () => {
    const manifest = manifestFor();
    assert.equal(
      isCompatibleManifest(manifest, {
        from: "2025-01-01",
        to: "2025-01-31",
        family: "jump",
        source: "sporting_life",
      }),
      true,
    );
    assert.equal(
      isCompatibleManifest(
        { ...manifest, featureSchemaVersion: "stale" as typeof BACKTEST_FEATURE_CACHE_VERSION },
        {
          from: "2025-01-01",
          to: "2025-01-31",
          family: "jump",
          source: "sporting_life",
        },
      ),
      false,
    );
  });

  test("round-trips cached rows and preserves null feature/outcome separation", async () => {
    const root = await mkdtemp(join(tmpdir(), "racing-cache-"));
    const directory = cacheDirectory({
      outputDir: root,
      from: "2025-01-01",
      to: "2025-01-31",
      family: "jump",
      source: "sporting_life",
    });
    await import("node:fs/promises").then(({ mkdir }) => mkdir(directory, { recursive: true }));
    const features = [
      feature({
        targetRunnerId: "runner-1",
        latestSpeedRating: null,
        oddsDecimal: null,
      }),
    ];
    const outcomes = [outcome({ targetRunnerId: "runner-1", startingPriceDecimal: null })];
    const manifest = manifestFor({ rowCount: 1 });
    await writeFile(join(directory, "manifest.json"), JSON.stringify(manifest), "utf8");
    await writeFile(
      join(directory, "features.ndjson"),
      `${JSON.stringify({ ...features[0], raceDateTime: features[0]!.raceDateTime.toISOString() })}\n`,
      "utf8",
    );
    await writeFile(join(directory, "outcomes.ndjson"), `${JSON.stringify(outcomes[0])}\n`, "utf8");

    const cached = await loadBacktestFeatureCache({
      from: "2025-01-01",
      to: "2025-01-31",
      family: "jump",
      source: "sporting_life",
      outputDir: root,
    });

    assert.equal(cached?.rows[0]?.features.raceDateTime instanceof Date, true);
    assert.equal(cached?.rows[0]?.features.latestSpeedRating, null);
    assert.equal(cached?.rows[0]?.outcome.startingPriceDecimal, null);
  });

  test("derives actual race-date coverage from cache rows when requested range is wider", async () => {
    const rows = [
      row({ targetRunnerId: "middle", raceDate: "2026-05-01" }),
      row({ targetRunnerId: "first", raceDate: "2026-01-03" }),
      row({ targetRunnerId: "last", raceDate: "2026-09-11" }),
    ];

    assert.deepEqual(actualCoverageForRows(rows), {
      actualFrom: "2026-01-03",
      actualTo: "2026-09-11",
    });
  });

  test("cached feature parity gives identical selections to live rows", () => {
    const rows = [
      row({ targetRunnerId: "selected", latestSpeedRating: 105, officialRating: 100 }),
      row({ targetRunnerId: "rejected", latestSpeedRating: 99, officialRating: 100 }),
    ];
    const definition = {
      id: "latest-speed-gte-or",
      name: "Latest Speed >= OR",
      relativeSpeed: { latestSpeedMinusOR: { min: 0 } },
    };
    const live = evaluateBacktestRows({
      rows,
      definition,
      startDate: "2025-01-01",
      endDate: "2025-01-31",
    });
    const cached = evaluateBacktestRowSet({
      rows: rowsFromCachedParts({
        features: rows.map((entry) => entry.features),
        outcomes: rows.map((entry) => entry.outcome),
      }),
      definitions: [definition],
      startDate: "2025-01-01",
      endDate: "2025-01-31",
    })[0]!;

    assert.deepEqual(
      cached.selectedRunners.map((selection) => selection.id),
      live.selectedRunners.map((selection) => selection.id),
    );
    assert.deepEqual(cached.summary, live.summary);
  });

  test("chunk aggregation preserves chronological max losing run", () => {
    const chunkA = [selection("a", "2025-01-01", false), selection("b", "2025-01-02", false)];
    const chunkB = [selection("c", "2025-01-03", false), selection("d", "2025-01-04", true)];
    assert.equal(summarizeSelections([...chunkB, ...chunkA]).maxConsecutiveLosers, 3);
  });

  test("splits feature targets into bounded batches without losing or duplicating IDs", () => {
    const ids = Array.from(
      { length: DEFAULT_CACHE_BUILD_BATCH_SIZE + 1 },
      (_, index) => `runner-${index}`,
    );
    const batches = featureTargetBatches(ids);
    const flattened = batches.flat();

    assert.equal(batches.length, 2);
    assert.equal(batches[0]?.length, DEFAULT_CACHE_BUILD_BATCH_SIZE);
    assert.equal(batches[1]?.length, 1);
    assert.deepEqual(flattened, ids);
    assert.equal(new Set(flattened).size, ids.length);
  });

  test("stale cache is rejected before feature files are used", async () => {
    const root = await mkdtemp(join(tmpdir(), "racing-cache-stale-"));
    const directory = cacheDirectory({
      outputDir: root,
      from: "2025-01-01",
      to: "2025-01-31",
      family: "jump",
      source: "sporting_life",
    });
    await import("node:fs/promises").then(({ mkdir }) => mkdir(directory, { recursive: true }));
    await writeFile(
      join(directory, "manifest.json"),
      JSON.stringify({
        ...manifestFor(),
        featureSchemaVersion: "old",
      }),
      "utf8",
    );
    await writeFile(join(directory, "features.ndjson"), "not-json\n", "utf8");
    await writeFile(join(directory, "outcomes.ndjson"), "not-json\n", "utf8");

    assert.equal(
      await loadBacktestFeatureCache({
        from: "2025-01-01",
        to: "2025-01-31",
        family: "jump",
        source: "sporting_life",
        outputDir: root,
      }),
      null,
    );
  });

  test("incomplete cache without a manifest is not treated as valid", async () => {
    const root = await mkdtemp(join(tmpdir(), "racing-cache-incomplete-"));
    const directory = cacheDirectory({
      outputDir: root,
      from: "2025-01-01",
      to: "2025-01-31",
      family: "jump",
      source: "sporting_life",
    });
    await import("node:fs/promises").then(({ mkdir }) => mkdir(directory, { recursive: true }));
    await writeFile(join(directory, "features.ndjson"), "{}\n", "utf8");
    await writeFile(join(directory, "outcomes.ndjson"), "{}\n", "utf8");

    assert.equal(
      await loadBacktestFeatureCache({
        from: "2025-01-01",
        to: "2025-01-31",
        family: "jump",
        source: "sporting_life",
        outputDir: root,
      }),
      null,
    );
  });
});

function manifestFor(
  overrides: Partial<BacktestFeatureCacheManifest> = {},
): BacktestFeatureCacheManifest {
  return {
    featureSchemaVersion: BACKTEST_FEATURE_CACHE_VERSION,
    sourceFeatureVersion: BACKTEST_FEATURE_SOURCE_VERSION,
    source: "sporting_life",
    from: "2025-01-01",
    to: "2025-01-31",
    family: "jump",
    generatedAt: "2026-09-10T00:00:00.000Z",
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

function selection(id: string, date: string, won: boolean): BacktestSelection {
  const features = feature({
    targetRaceId: `race-${id}`,
    targetRunnerId: id,
    raceDate: date,
    raceDateTime: new Date(`${date}T12:00:00.000Z`),
  });
  return {
    id,
    definitionId: "test",
    selectedReason: "test",
    features,
    derived: {
      latestSpeedMinusOR: null,
      bestL3SpeedMinusOR: null,
      latestMinusPreviousSpeed: null,
      latestMinusBestL3: null,
      latestPerformanceMinusOR: null,
      bestPerformanceL3MinusOR: null,
      latestPerformanceMinusPreviousPerformance: null,
      latestTodaysRatingMinusOR: null,
      bestTodaysRatingL3MinusOR: null,
      latestTodaysMinusPreviousTodays: null,
      preRaceOddsDecimal: null,
      fieldSize: null,
    },
    outcome: outcome({
      targetRunnerId: id,
      finishingPosition: won ? 1 : 2,
      won,
      placed: won,
    }),
    settlement: {
      settled: true,
      settlementOddsDecimal: won ? 4 : 2,
      stake: 1,
      grossReturn: won ? 4 : 0,
      profitLoss: won ? 3 : -1,
    },
  };
}
