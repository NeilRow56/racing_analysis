import assert from "node:assert/strict";
import { describe, test } from "node:test";
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
import {
  developmentSnapshotFromResult,
  assertCanValidateHoldout,
  canValidateHoldout,
  freezeSavedResearchRuleRecord,
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
      race: { raceClasses: [5, 1, 2, 2] },
      runner: { officialRating: { min: 0, max: 100 } },
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
    assert.deepEqual((prepared.canonicalRule as { race?: { raceClasses?: number[] } }).race?.raceClasses, [1, 2, 5]);
    assert.deepEqual(prepared.developmentSnapshot, {
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
      developmentSnapshot: developmentSnapshotFromResult(researchResult(defaultResearchRule("jump"))),
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
      noSettlementSp: 0,
      nonRunnerOrUnsettled: 1,
    },
    strategySummary: [],
    cache: {
      directory: "data/research/backtest-cache/test",
      manifest: {
        featureSchemaVersion: "backtest_features_v2",
        sourceFeatureVersion: "historical_target_metrics_v2",
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
          turfSpeed: "turf_speed_v1",
          weightPerformance: "weight_performance_v1",
          todaysRating: "todays_rating_v1",
        },
      },
    },
    elapsedMs: 10,
  };
}
