import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  BACKTEST_FEATURE_CACHE_VERSION,
} from "./backtest-cache";
import {
  BACKTEST_FEATURE_SOURCE_VERSION,
} from "./historical-target-metrics";
import {
  RESEARCH_RULE_VERSION,
  defaultResearchRule,
  type ResearchResult,
  type ResearchRuleV1,
} from "./research-rule";
import {
  canonicalResearchRule,
  researchRuleKey,
} from "./research-rule-identity";
import { trainerCohortRule } from "./trainer-cohorts";
import { TURF_PERFORMANCE_RATING_VERSION } from "./turf-performance-rating";
import {
  CANONICAL_SETTLEMENT_VERSION,
  isLegacySettlementSnapshot,
} from "./research-settlement-version";
import {
  developmentSnapshotFromResult,
  assertCanValidateHoldout,
  canValidateHoldout,
  freezeSavedResearchRuleRecord,
  holdoutSnapshotWithActualCoverage,
  prepareFrozenSavedResearchRule,
  prepareSavedResearchRule,
  replaceDraftResearchRuleRecord,
  savedResearchRuleFromRow,
  withSavedResearchRulesDb,
  type SavedResearchRule,
} from "./saved-research-rules";

describe("saved research rules", () => {
  test("prepares an executed rule for persistence with canonical rule and identity", () => {
    const rule: ResearchRuleV1 = {
      ...defaultResearchRule("all_weather_flat"),
      race: { courseIds: ["course-b", "course-a"], raceClasses: [5, 1, 2, 2] },
      runner: {
        trainerIds: ["trainer-b", "trainer-a"],
        jockeyIds: ["jockey-b", "jockey-a"],
        jockeyPriorRuns: { min: 50 },
        officialRating: { min: 0, max: 100 },
        draw: { min: 1, max: 3 },
      },
      ratings: [{ metric: "latestSpeedRating", range: { min: 72 } }],
      ranks: [{ metric: "latestSpeedRating", range: { max: 2 } }],
    };
    const result = researchResult(rule);

    const prepared = prepareSavedResearchRule({
      name: "  AW speed rank  ",
      notes: "  promising first pass  ",
      rule,
      developmentSnapshot: developmentSnapshotFromResult(result),
      cacheMetadata: {
        featureSchemaVersion: "backtest_features_v2",
        sourceFeatureVersion: "historical_target_metrics_v1",
        cacheFamily: "all_weather_flat",
        cacheGeneratedAt: "2026-09-11T10:00:00.000Z",
        calculationVersions: { todaysRating: "todays_rating_v1" },
      },
    });

    assert.equal(prepared.name, "AW speed rank");
    assert.equal(prepared.notes, "promising first pass");
    assert.equal(prepared.status, "draft");
    assert.equal(prepared.ruleSchemaVersion, RESEARCH_RULE_VERSION);
    assert.equal(prepared.ruleIdentity, researchRuleKey(rule));
    assert.deepEqual(prepared.canonicalRule, canonicalResearchRule(rule));
    assert.deepEqual((prepared.canonicalRule as { race?: { courseIds?: string[] } }).race?.courseIds, ["course-a", "course-b"]);
    assert.deepEqual((prepared.canonicalRule as { race?: { raceClasses?: number[] } }).race?.raceClasses, [1, 2, 5]);
    assert.deepEqual((prepared.canonicalRule as { runner?: { trainerIds?: string[] } }).runner?.trainerIds, ["trainer-a", "trainer-b"]);
    assert.deepEqual((prepared.canonicalRule as { runner?: { jockeyIds?: string[] } }).runner?.jockeyIds, ["jockey-a", "jockey-b"]);
    assert.deepEqual((prepared.canonicalRule as { runner?: { jockeyPriorRuns?: { min?: number } } }).runner?.jockeyPriorRuns, { min: 50 });
    assert.deepEqual(prepared.developmentSnapshot, {
      settlementVersion: CANONICAL_SETTLEMENT_VERSION,
      eligibleRunners: 20,
      selections: 5,
      settledSelections: 4,
      winners: 2,
      strikeRate: 50,
      places: 3,
      placeStrikeRate: 75,
      profitLoss: 7.5,
      roiPercentage: 187.5,
      maxConsecutiveLosers: 2,
    });
  });

  test("prepares a new main UI save as frozen immediately", () => {
    const rule = defaultResearchRule("turf_flat");
    const before = Date.now();
    const prepared = prepareFrozenSavedResearchRule({
      name: "Frozen from Research",
      rule,
      developmentSnapshot: developmentSnapshotFromResult(researchResult(rule)),
    });
    const after = Date.now();

    assert.equal(prepared.status, "frozen");
    assert.ok(prepared.frozenAt instanceof Date);
    assert.ok(prepared.frozenAt.getTime() >= before);
    assert.ok(prepared.frozenAt.getTime() <= after);
    assert.deepEqual(prepared.canonicalRule, canonicalResearchRule(rule));
    assert.equal(prepared.ruleIdentity, researchRuleKey(rule));
    const snapshot = prepared.developmentSnapshot as ReturnType<typeof developmentSnapshotFromResult>;
    assert.equal(snapshot.settlementVersion, CANONICAL_SETTLEMENT_VERSION);
    assert.equal(isLegacySettlementSnapshot(snapshot), false);
  });

  test("detects legacy snapshots without inferring v2 or changing historical data", () => {
    const rule = defaultResearchRule("jump");
    const legacySnapshot = {
      ...developmentSnapshotFromResult(researchResult(rule)),
      settlementVersion: undefined,
      settledSelections: 17,
      profitLoss: 12.5,
      roiPercentage: 73.529,
    };
    const before = structuredClone(legacySnapshot);

    assert.equal(isLegacySettlementSnapshot(legacySnapshot), true);
    assert.deepEqual(legacySnapshot, before);
    assert.equal(legacySnapshot.settlementVersion, undefined);
    assert.equal(legacySnapshot.settledSelections, 17);
    assert.equal(legacySnapshot.profitLoss, 12.5);
    assert.equal(legacySnapshot.roiPercentage, 73.529);
  });

  test("preserves a legacy Speed-vs-OR condition in a frozen rule", () => {
    const rule: ResearchRuleV1 = {
      ...defaultResearchRule("turf_flat"),
      relatives: [{ metric: "bestL3SpeedMinusOR", range: { min: 3, max: 8 } }],
    };
    const prepared = prepareFrozenSavedResearchRule({
      name: "Legacy speed difference",
      rule,
      developmentSnapshot: developmentSnapshotFromResult(researchResult(rule)),
    });

    assert.deepEqual((prepared.canonicalRule as ResearchRuleV1).relatives, rule.relatives);
    assert.equal(prepared.ruleIdentity, researchRuleKey(rule));
  });

  test("preserves generic TPR rank in frozen rule identity and canonical data", () => {
    const rule: ResearchRuleV1 = {
      ...defaultResearchRule("turf_flat"),
      ranks: [{ metric: "turfPerformanceRating", range: { min: 1, max: 2 } }],
    };

    const prepared = prepareFrozenSavedResearchRule({
      name: "TPR top two",
      rule,
      developmentSnapshot: developmentSnapshotFromResult(researchResult(rule)),
    });

    assert.deepEqual((prepared.canonicalRule as ResearchRuleV1).ranks, rule.ranks);
    assert.equal(prepared.ruleIdentity, researchRuleKey(rule));
  });

  test("preserves diagnostic W50 rank in frozen rule identity and canonical data", () => {
    const rule: ResearchRuleV1 = {
      ...defaultResearchRule("turf_flat"),
      ranks: [
        { metric: "turfPerformanceW50Rating", range: { min: 1, max: 1 } },
        { metric: "officialRating", range: { min: 1, max: 1 } },
      ],
    };

    const prepared = prepareFrozenSavedResearchRule({
      name: "W50 and OR rank one",
      rule,
      developmentSnapshot: developmentSnapshotFromResult(researchResult(rule)),
    });

    assert.deepEqual((prepared.canonicalRule as ResearchRuleV1).ranks, rule.ranks);
    assert.equal(prepared.ruleIdentity, researchRuleKey(rule));
    assert.notEqual(
      prepared.ruleIdentity,
      researchRuleKey({ ...rule, ranks: [{ metric: "turfPerformanceRating", range: { min: 1, max: 1 } }] }),
    );
  });

  test("preserves Jump subtype in frozen rule identity and canonical data", () => {
    const rule: ResearchRuleV1 = {
      ...defaultResearchRule("jump"),
      race: { jumpSubtype: "chase" },
    };

    const prepared = prepareFrozenSavedResearchRule({
      name: "Chases only",
      rule,
      developmentSnapshot: developmentSnapshotFromResult(researchResult(rule)),
    });

    assert.equal((prepared.canonicalRule as ResearchRuleV1).race.jumpSubtype, "chase");
    assert.equal(prepared.ruleIdentity, researchRuleKey(rule));
    assert.notEqual(prepared.ruleIdentity, researchRuleKey(defaultResearchRule("jump")));
  });

  test("preserves calendar period in frozen identity without changing legacy rule identity", () => {
    const legacy = defaultResearchRule("jump");
    const rule: ResearchRuleV1 = {
      ...legacy,
      calendarPeriod: { monthFrom: 10, monthTo: 3 },
    };
    const prepared = prepareFrozenSavedResearchRule({
      name: "Winter Jump",
      rule,
      developmentSnapshot: developmentSnapshotFromResult(researchResult(rule)),
    });

    assert.deepEqual((prepared.canonicalRule as ResearchRuleV1).calendarPeriod, { monthFrom: 10, monthTo: 3 });
    assert.equal(prepared.ruleIdentity, researchRuleKey(rule));
    assert.notEqual(prepared.ruleIdentity, researchRuleKey(legacy));
    assert.equal("calendarPeriod" in canonicalResearchRule(legacy), false);
  });

  test("round-trips the exact frozen Chase 31-60 days rule", () => {
    const rule: ResearchRuleV1 = {
      ...defaultResearchRule("jump"),
      race: { jumpSubtype: "chase" },
      runner: { daysSinceRun: { min: 31, max: 60 } },
    };

    const prepared = prepareFrozenSavedResearchRule({
      name: "Chase 31-60 days",
      rule,
      developmentSnapshot: developmentSnapshotFromResult(researchResult(rule)),
    });

    assert.equal(prepared.status, "frozen");
    assert.equal(prepared.family, "jump");
    assert.deepEqual(prepared.canonicalRule, canonicalResearchRule(rule));
    assert.equal((prepared.canonicalRule as ResearchRuleV1).race.jumpSubtype, "chase");
    assert.deepEqual((prepared.canonicalRule as ResearchRuleV1).runner.daysSinceRun, { min: 31, max: 60 });
    assert.equal(prepared.ruleIdentity, researchRuleKey(rule));
  });

  test("records development settlement mode metadata without changing frozen rule identity", () => {
    const rule = defaultResearchRule("jump");
    const result = researchResult(rule);
    const cappedSummary = {
      ...result.summary,
      profitLoss: 3.5,
      roiPercentage: 87.5,
    };
    const prepared = prepareFrozenSavedResearchRule({
      name: "Capped analysis",
      rule,
      developmentSnapshot: developmentSnapshotFromResult(result, {
        summary: cappedSummary,
        settlementMode: "cap_20_1",
      }),
    });

    assert.equal(prepared.ruleIdentity, researchRuleKey(rule));
    assert.deepEqual(prepared.canonicalRule, canonicalResearchRule(rule));
    assert.equal(
      (prepared.developmentSnapshot as { developmentSettlementMode?: string }).developmentSettlementMode,
      "cap_20_1",
    );
    assert.equal(
      (prepared.developmentSnapshot as { profitLoss: number }).profitLoss,
      3.5,
    );
  });

  test("existing single-class saved representation normalizes on load", () => {
    const legacyRule = {
      version: "research_rule_v1",
      family: "jump",
      dateRange: { from: "2025-01-01", to: "2025-12-31" },
      race: { raceClass: "Class 3" },
      runner: {},
      ratings: [],
      relatives: [],
      ranks: [],
    };
    const legacySnapshot = {
      ...developmentSnapshotFromResult(researchResult(defaultResearchRule("jump"))),
      settlementVersion: undefined,
      settledSelections: 17,
      profitLoss: 12.5,
      roiPercentage: 73.529,
    };
    const legacySnapshotBefore = structuredClone(legacySnapshot);
    const saved = savedResearchRuleFromRow({
      id: "a1111111-1111-4111-8111-111111111111",
      name: "Legacy class rule",
      notes: null,
      status: "frozen",
      ruleSchemaVersion: RESEARCH_RULE_VERSION,
      ruleIdentity: JSON.stringify(legacyRule),
      canonicalRule: legacyRule,
      family: "jump",
      developmentFrom: "2025-01-01",
      developmentTo: "2025-12-31",
      developmentSnapshot: legacySnapshot,
      holdoutSnapshot: null,
      cacheMetadata: null,
      createdAt: new Date("2026-09-11T10:00:00.000Z"),
      updatedAt: new Date("2026-09-11T10:00:00.000Z"),
      frozenAt: new Date("2026-09-11T10:30:00.000Z"),
    });

    const expectedRule: ResearchRuleV1 = {
      ...defaultResearchRule("jump"),
      race: { raceClasses: [3] },
    };
    assert.deepEqual(saved.canonicalRule, canonicalResearchRule(expectedRule));
    assert.equal(saved.ruleIdentity, researchRuleKey(expectedRule));
    assert.equal(saved.status, "frozen");
    assert.equal(isLegacySettlementSnapshot(saved.developmentSnapshot), true);
    assert.equal(saved.developmentSnapshot.settlementVersion, undefined);
    assert.equal(saved.developmentSnapshot.settledSelections, 17);
    assert.equal(saved.developmentSnapshot.profitLoss, 12.5);
    assert.equal(saved.developmentSnapshot.roiPercentage, 73.529);
    assert.deepEqual(legacySnapshot, legacySnapshotBefore);
  });

  test("canonical rule and identity survive save/load mapping unchanged", () => {
    const rule: ResearchRuleV1 = {
      ...defaultResearchRule("jump"),
      runner: { returnBucket: "days_91_180" },
      relatives: [{ metric: "latestTodaysRatingMinusOR", range: { min: 5 } }],
    };
    const prepared = prepareSavedResearchRule({
      name: "Jump return angle",
      rule,
      developmentSnapshot: developmentSnapshotFromResult(researchResult(rule)),
    });
    const saved = savedResearchRuleFromRow({
      id: "a1111111-1111-4111-8111-111111111111",
      createdAt: new Date("2026-09-11T10:00:00.000Z"),
      updatedAt: new Date("2026-09-11T10:00:00.000Z"),
      ...prepared,
      notes: prepared.notes ?? null,
      status: prepared.status ?? "draft",
      holdoutSnapshot: prepared.holdoutSnapshot ?? null,
      cacheMetadata: prepared.cacheMetadata ?? null,
      frozenAt: prepared.frozenAt ?? null,
    });

    assert.deepEqual(saved.canonicalRule, canonicalResearchRule(rule));
    assert.equal(saved.ruleIdentity, researchRuleKey(rule));
    assert.equal(saved.developmentSnapshot.selections, 5);
  });

  test("draft rule definition can be replaced with the current executed result", () => {
    const originalRule = defaultResearchRule("jump");
    const replacementRule: ResearchRuleV1 = {
      ...defaultResearchRule("jump"),
      ratings: [{ metric: "latestSpeedRating", range: { min: 100 } }],
    };
    const draft = savedRuleFor(originalRule, "draft");

    const replaced = replaceDraftResearchRuleRecord(draft, researchResult(replacementRule, {
      selections: 1,
      roiPercentage: 25,
    }));

    assert.equal(replaced.status, "draft");
    assert.equal(replaced.ruleIdentity, researchRuleKey(replacementRule));
    assert.deepEqual(replaced.canonicalRule, canonicalResearchRule(replacementRule));
    assert.equal(replaced.developmentSnapshot.selections, 1);
    assert.equal(replaced.developmentSnapshot.roiPercentage, 25);
  });

  test("draft can be frozen and records frozen timestamp", () => {
    const frozenAt = new Date("2026-09-11T12:00:00.000Z");
    const frozen = freezeSavedResearchRuleRecord(savedRuleFor(defaultResearchRule("turf_flat"), "draft"), frozenAt);

    assert.equal(frozen.status, "frozen");
    assert.equal(frozen.frozenAt, frozenAt);
    assert.equal(frozen.updatedAt, frozenAt);
  });

  test("frozen rule definition cannot be replaced", () => {
    const frozen = savedRuleFor(defaultResearchRule("jump"), "frozen");
    const replacementRule: ResearchRuleV1 = {
      ...defaultResearchRule("jump"),
      ranks: [{ metric: "latestSpeedRating", range: { max: 1 } }],
    };

    assert.throws(
      () => replaceDraftResearchRuleRecord(frozen, researchResult(replacementRule)),
      /Frozen research rule definitions cannot be replaced/,
    );
    assert.equal(frozen.ruleIdentity, researchRuleKey(defaultResearchRule("jump")));
  });

  test("holdout validation is only available for frozen rules without a snapshot", () => {
    const draft = savedRuleFor(defaultResearchRule("jump"), "draft");
    const frozen = savedRuleFor(defaultResearchRule("jump"), "frozen");
    const alreadyValidated = {
      ...frozen,
      holdoutSnapshot: holdoutSnapshotFor(frozen),
    };

    assert.equal(canValidateHoldout(draft), false);
    assert.equal(canValidateHoldout(frozen), true);
    assert.equal(canValidateHoldout(alreadyValidated), false);
    assert.throws(() => assertCanValidateHoldout(draft), /Only frozen research rules/);
    assert.throws(() => assertCanValidateHoldout(alreadyValidated), /already been completed/);
  });

  test("backfilled holdout coverage updates dates without changing performance numbers", () => {
    const frozen = savedRuleFor(defaultResearchRule("jump"), "frozen");
    const original = holdoutSnapshotFor(frozen);

    const corrected = holdoutSnapshotWithActualCoverage(original, {
      actualFrom: "2026-01-01",
      actualTo: "2026-09-11",
    }, {
      from: "2026-01-01",
      to: "2026-12-31",
    });

    assert.equal(corrected.holdoutFrom, "2026-01-01");
    assert.equal(corrected.holdoutTo, "2026-09-11");
    assert.equal(corrected.requestedCacheFrom, "2026-01-01");
    assert.equal(corrected.requestedCacheTo, "2026-12-31");
    assert.deepEqual(
      {
        selections: corrected.selections,
        settledSelections: corrected.settledSelections,
        winners: corrected.winners,
        strikeRate: corrected.strikeRate,
        places: corrected.places,
        placeStrikeRate: corrected.placeStrikeRate,
        profitLoss: corrected.profitLoss,
        roiPercentage: corrected.roiPercentage,
        maxConsecutiveLosers: corrected.maxConsecutiveLosers,
      },
      {
        selections: original.selections,
        settledSelections: original.settledSelections,
        winners: original.winners,
        strikeRate: original.strikeRate,
        places: original.places,
        placeStrikeRate: original.placeStrikeRate,
        profitLoss: original.profitLoss,
        roiPercentage: original.roiPercentage,
        maxConsecutiveLosers: original.maxConsecutiveLosers,
      },
    );
  });

  test("equivalent canonical rules retain identity and material changes alter it", () => {
    const base: ResearchRuleV1 = {
      ...defaultResearchRule("jump"),
      race: { handicapStatus: "all", raceClasses: [5, 1, 2, 2] },
      runner: { returnBucket: "all" },
    };
    const equivalent: ResearchRuleV1 = {
      ...defaultResearchRule("jump"),
      race: { raceClasses: [1, 2, 5] },
    };
    const different: ResearchRuleV1 = {
      ...defaultResearchRule("jump"),
      race: { raceClasses: [1, 2] },
    };

    assert.equal(researchRuleKey(base), researchRuleKey(equivalent));
    assert.notEqual(researchRuleKey(base), researchRuleKey(different));
  });

  test("canonical saved rules preserve frozen TPR filter version and ranges", () => {
    const rule: ResearchRuleV1 = {
      ...defaultResearchRule("turf_flat"),
      turfPerformance: {
        version: TURF_PERFORMANCE_RATING_VERSION,
        rating: { min: 110 },
        rank: { min: 1, max: 1 },
        lead: { min: 4 },
      },
    };
    const saved = savedRuleFor(rule, "frozen");

    assert.deepEqual((saved.canonicalRule as ResearchRuleV1).turfPerformance, {
      version: TURF_PERFORMANCE_RATING_VERSION,
      rating: { min: 110 },
      rank: { min: 1, max: 1 },
      lead: { min: 4 },
    });
    assert.equal(saved.ruleIdentity, researchRuleKey(rule));
  });

  test("canonical saved trainer cohort rules preserve the dynamic concept, not a literal year", () => {
    const rule: ResearchRuleV1 = {
      ...defaultResearchRule("turf_flat"),
      runner: { trainerCohort: trainerCohortRule(30) },
    };
    const saved = savedRuleFor(rule, "frozen");

    assert.deepEqual((saved.canonicalRule as ResearchRuleV1).runner.trainerCohort, {
      top: 30,
      period: "prior_calendar_year",
      rankingMetric: "wins",
    });
    assert.equal("referenceYear" in ((saved.canonicalRule as ResearchRuleV1).runner.trainerCohort ?? {}), false);
    assert.equal(saved.ruleIdentity, researchRuleKey(rule));
  });

  test("saved and frozen flat rules preserve Draw without changing legacy rules", () => {
    const rule: ResearchRuleV1 = {
      ...defaultResearchRule("all_weather_flat"),
      runner: { draw: { min: 1, max: 3 } },
    };
    const saved = savedRuleFor(rule, "frozen");

    assert.deepEqual((saved.canonicalRule as ResearchRuleV1).runner.draw, { min: 1, max: 3 });
    assert.equal(saved.ruleIdentity, researchRuleKey(rule));
    assert.equal((savedRuleFor(defaultResearchRule("all_weather_flat"), "frozen").canonicalRule as Partial<ResearchRuleV1>).runner?.draw, undefined);
  });

  test("database helper keeps the client open until the operation settles", async () => {
    const events: string[] = [];
    const db = {};
    const result = await withSavedResearchRulesDb(
      async (receivedDb) => {
        assert.equal(receivedDb, db);
        events.push("operation-start");
        await Promise.resolve();
        events.push("operation-finished");
        return "saved";
      },
      () => ({
        db,
        client: {
          async end() {
            events.push("client-ended");
          },
        },
      }) as never,
    );

    assert.equal(result, "saved");
    assert.deepEqual(events, ["operation-start", "operation-finished", "client-ended"]);
  });
});

function savedRuleFor(rule: ResearchRuleV1, status: SavedResearchRule["status"]): SavedResearchRule {
  return {
    id: "a1111111-1111-4111-8111-111111111111",
    name: "Saved rule",
    notes: null,
    status,
    ruleSchemaVersion: RESEARCH_RULE_VERSION,
    ruleIdentity: researchRuleKey(rule),
    canonicalRule: canonicalResearchRule(rule),
    family: rule.family,
    developmentFrom: rule.dateRange.from,
    developmentTo: rule.dateRange.to,
    developmentSnapshot: developmentSnapshotFromResult(researchResult(rule)),
    holdoutSnapshot: null,
    cacheMetadata: null,
    createdAt: new Date("2026-09-11T10:00:00.000Z"),
    updatedAt: new Date("2026-09-11T10:00:00.000Z"),
    frozenAt: status === "frozen" ? new Date("2026-09-11T10:30:00.000Z") : null,
  };
}

function holdoutSnapshotFor(rule: SavedResearchRule): NonNullable<SavedResearchRule["holdoutSnapshot"]> {
  return {
    holdoutYear: "2026",
    holdoutFrom: "2026-01-01",
    holdoutTo: "2026-12-31",
    validatedAt: "2026-09-12T10:00:00.000Z",
    ruleSchemaVersion: RESEARCH_RULE_VERSION,
    ruleIdentity: rule.ruleIdentity,
    cacheMetadata: {
      featureSchemaVersion: "backtest_features_v2",
      sourceFeatureVersion: "historical_target_metrics_v2",
      cacheFamily: rule.family,
      cacheGeneratedAt: "2026-09-12T09:00:00.000Z",
      calculationVersions: {},
    },
    status: "completed",
    eligibleRunners: 10,
    selections: 3,
    settledSelections: 3,
    winners: 1,
    strikeRate: 33.333,
    places: 2,
    placeStrikeRate: 66.667,
    profitLoss: 1.5,
    roiPercentage: 50,
    maxConsecutiveLosers: 1,
  };
}

function researchResult(
  rule: ResearchRuleV1,
  summaryOverrides: Partial<ResearchResult["summary"]> = {},
): ResearchResult {
  return {
    settlementVersion: CANONICAL_SETTLEMENT_VERSION,
    rule,
    rowsEvaluated: 30,
    baselineRows: 20,
    baselineSettledRunners: 18,
    baselineWins: 4,
    baselineWinStrikeRate: 22.222,
    selectedRunners: [],
    summary: {
      totalEligibleRunners: 20,
      selections: 5,
      settledSelections: 4,
      wins: 2,
      winStrikeRate: 50,
      places: 3,
      placeStrikeRate: 75,
      averageOdds: 3.25,
      totalStakes: 4,
      grossReturn: 11.5,
      profitLoss: 7.5,
      roiPercentage: 187.5,
      maxConsecutiveLosers: 2,
      ...summaryOverrides,
    },
    missingData: {
      noSpeed: 0,
      noPerformance: 0,
      noTodaysRating: 0,
      noOr: 0,
      noWeight: 0,
      noTrainerPriorHistory: 0,
      noSettlementSp: 0,
      nonRunnerOrUnsettled: 1,
    },
    strategySummary: [],
    cache: {
      directory: "data/research/backtest-cache/test",
      manifest: {
        featureSchemaVersion: BACKTEST_FEATURE_CACHE_VERSION,
        sourceFeatureVersion: BACKTEST_FEATURE_SOURCE_VERSION,
        source: "sporting_life",
        from: "2025-01-01",
        to: "2025-12-31",
        family: rule.family,
        generatedAt: "2026-09-11T10:00:00.000Z",
        rowCount: 30,
        featuresFile: "features.ndjson",
        outcomesFile: "outcomes.ndjson",
        calculationVersions: {
          jumpSpeed: "jump_speed_v1",
          awSpeed: "aw_speed_v1",
          turfSpeed: "turf_speed_v2",
          weightPerformance: "weight_performance_v1",
          todaysRating: "todays_rating_v1",
        },
      },
    },
    elapsedMs: 10,
    trainerCohort: null,
  };
}
