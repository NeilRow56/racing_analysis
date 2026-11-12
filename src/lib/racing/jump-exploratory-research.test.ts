import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeCandidateRace, type CandidateRow, type CandidateFieldEvidence } from "./jump-candidate-eligibility";
import { canCompareExploratory2025, compare2025Outcomes, evaluateJumpExploratory, isJumpExploratorySource, JUMP_EXPLORATORY_SOURCE, parseExploratoryOptions } from "./jump-exploratory-research";
import type { HistoricalPreRaceFeatureRow } from "./historical-target-metrics";
import { ruleFromSearchParams, serializeResearchRule } from "./research-rule";
import { researchRuleKey } from "./research-rule-identity";

export function exploratoryFixture() {
  const rows: CandidateRow[] = ["a", "b", "nr"].map((id, i) => ({
    row: {
      features: { targetRunnerId: id, targetRaceId: "race", horseId: id, horseName: id, courseName: "Fixture", raceDate: "2026-06-01", raceCode: "jump", latestSpeedRating: 110 - i * 10, previousSpeedRating: null, bestSpeedLast3: 105 - i * 10, latestPerformanceRating: null, bestPerformanceLast3: null, officialRating: 100, priorRuns: 3, actualRunnerCount: 999 } as HistoricalPreRaceFeatureRow,
      outcome: { targetRunnerId: id, targetRaceId: "race", raceStage: "WEIGHEDIN", finishingPosition: i === 2 ? null : i + 1, resultStatus: i === 2 ? "non_runner" : "finished", outcomeCode: i === 2 ? "NR" : String(i + 1), won: i === 0, placed: null, startingPrice: null, startingPriceDecimal: i === 0 ? "301" : "3" },
    },
    evidence: { runnerId: id, raceId: "race", sourceFullResult: true, targetTimeMissing: false, settlementState: i === 2 ? "NR" : i === 0 ? "win" : "loss", validSP: true, threeBestL3Finite: false, referenceEligible: false, ratingsL3Clear: true, strictExploratoryUsable: false, definiteUntimedPriorIds: [], uncertainPriorIds: [], hiddenActualL3Ids: [], potentialL3ContextIds: [], potentialAnyContextCount: 0, builderLast3Ids: ["p1", "p2", "p3"] },
  }));
  const proof: CandidateFieldEvidence = { raceId: "race", runnerIds: ["a", "b", "nr"], starterIds: ["a", "b"], nonRunnerIds: ["nr"], sourcePath: "fixture", sha256: "fixture" };
  return { rows, proof };
}
const options = (query = "") => parseExploratoryOptions(new URLSearchParams(query));
test("source is opt-in; unrelated, saved-rule and default parameters cannot activate it", () => {
  for (const query of ["", "family=jump&year=2026", "cmpSource=historical", "cmpSource=jump", `rule=${encodeURIComponent(JUMP_EXPLORATORY_SOURCE)}`]) assert.equal(isJumpExploratorySource(new URLSearchParams(query)), false);
  assert.equal(isJumpExploratorySource(new URLSearchParams(`cmpSource=${JUMP_EXPLORATORY_SOURCE}`)), true);
  assert.equal(options().rankMax, undefined); assert.equal(options().feature, "outcomeSP");
});
test("explicit source and exploratory criteria cannot alter frozen-rule identity", () => {
  const original = ruleFromSearchParams(new URLSearchParams("family=jump")), before = serializeResearchRule(original);
  const params = new URLSearchParams({ rule: before, cmpSource: JUMP_EXPLORATORY_SOURCE, jumpFeature: "latestSpeedRating", jumpRankMax: "1", jumpFrom: "2026-06-01" });
  const parsed = ruleFromSearchParams(params);
  assert.equal(researchRuleKey(parsed), researchRuleKey(original)); assert.equal(serializeResearchRule(parsed), before);
  assert.equal(serializeResearchRule(original), before);
});
test("single feature ignores unrelated missing ratings, while missing requested histories stay excluded", () => {
  const { rows, proof } = exploratoryFixture();
  const speed = evaluateJumpExploratory([analyzeCandidateRace(rows, "latestSpeedRating", proof)], options("jumpFeature=latestSpeedRating"));
  assert.equal(speed.summary.runners, 2); assert.equal(speed.coverage.settlementExcluded, 1);
  const previous = evaluateJumpExploratory([analyzeCandidateRace(rows, "previousSpeedRating", proof)], options("jumpFeature=previousSpeedRating"));
  assert.equal(previous.summary.runners, 0); assert.equal(previous.coverage.featureExcluded, 2);
  assert.equal(previous.coverage.exclusionsByReason["missing_feature:previousSpeedRating"], 2);
});
test("dependency exclusions never promote a partial-field leader; verified leads require all competitors", () => {
  const { rows, proof } = exploratoryFixture(); rows[0].evidence.uncertainPriorIds = ["hidden"];
  const race = analyzeCandidateRace(rows, "latestSpeedRating", proof);
  const ranked = evaluateJumpExploratory([race], options("jumpFeature=latestSpeedRating&jumpRankMax=1"));
  assert.equal(ranked.summary.runners, 0); assert.equal(ranked.coverage.rankUnavailable, 1);
  const diagnostic = evaluateJumpExploratory([race], options("jumpFeature=latestSpeedRating"));
  assert.equal(diagnostic.selected[0].rank.diagnosticRank, 1); assert.equal(diagnostic.selected[0].rank.wholeFieldRank, null);
  assert.equal(evaluateJumpExploratory([race], options("jumpFeature=latestSpeedRating&jumpLeadMin=0")).summary.runners, 0);
});
test("whole-field leads and competition ties are computed before value thresholds", () => {
  const { rows, proof } = exploratoryFixture();
  const race = analyzeCandidateRace(rows, "latestSpeedRating", proof);
  const result = evaluateJumpExploratory([race], options("jumpFeature=latestSpeedRating&jumpMin=105&jumpLeadMin=5"));
  assert.equal(result.summary.runners, 1); assert.equal(result.selected[0].lead, 10);
  rows[1].row.features.latestSpeedRating = 110;
  const tied = evaluateJumpExploratory([analyzeCandidateRace(rows, "latestSpeedRating", proof)], options("jumpFeature=latestSpeedRating&jumpRankMax=1"));
  assert.deepEqual(tied.selected.map(o => o.rank.wholeFieldRank), [1, 1]); assert.deepEqual(tied.selected.map(o => o.lead), [0, 0]);
});
test("starter filters ignore cached counts and withhold unverified fields", () => {
  const { rows, proof } = exploratoryFixture();
  assert.equal(evaluateJumpExploratory([analyzeCandidateRace(rows, "officialRating", proof)], options("jumpStartersMax=2")).summary.runners, 2);
  const missing = evaluateJumpExploratory([analyzeCandidateRace(rows, "officialRating")], options("jumpStartersMax=2"));
  assert.equal(missing.summary.runners, 0); assert.equal(missing.coverage.starterUnavailable, 2);
});
test("market benchmarks retain all starters before SP/value filtering; incomplete markets have no A/E", () => {
  const { rows, proof } = exploratoryFixture();
  const race = analyzeCandidateRace(rows, "officialRating", proof);
  const selected = evaluateJumpExploratory([race], options("jumpSPBand=%3E21"));
  assert.equal(selected.summary.runners, 1);
  assert.ok(Math.abs(selected.summary.expected! - ((1 / 301) / (1 / 301 + 1 / 3))) < 1e-12);
  const invalid = evaluateJumpExploratory([analyzeCandidateRace(rows, "officialRating")], options());
  assert.equal(invalid.summary.expected, null); assert.equal(invalid.summary.ae, null); assert.equal(invalid.summary.missingMarket, 2);
});
test("outcome/SP analysis retains rating-excluded long winners and V3 dead-heat and non-finisher returns", () => {
  const { rows, proof } = exploratoryFixture(); rows[0].evidence.potentialAnyContextCount = 10;
  rows[1].row.outcome.finishingPosition = null; rows[1].row.outcome.resultStatus = "fell";
  const result = evaluateJumpExploratory([analyzeCandidateRace(rows, "latestSpeedRating", proof)], options());
  assert.equal(result.summary.settlementVersion, "canonical_settlement_v3"); assert.equal(result.summary.profit, 299); assert.equal(result.selected[0].settlement?.grossReturn, 301);
  rows[0].row.outcome.deadHeatDivisor = 2;
  assert.equal(evaluateJumpExploratory([analyzeCandidateRace(rows, "officialRating", proof)], options()).summary.profit, 148.5);
  rows[0].row.outcome.raceStage = "RACEVOID";
  assert.equal(evaluateJumpExploratory([analyzeCandidateRace(rows, "officialRating")], options()).summary.runners, 1);
});
test("invalid or incompatible criteria fail closed instead of loosening selection", () => {
  const { rows, proof } = exploratoryFixture();
  for (const query of ["jumpFeature=outcomeSP&jumpRankMax=1", "jumpRankMax=NaN", "jumpFeature=tissue", "jumpFrom=2026-02-30", "jumpFrom=2026-10-15", "jumpFrom=2026-08-01&jumpTo=2026-01-01", "jumpStartersMin=10&jumpStartersMax=2", "jumpSPBand=unknown"]) {
    const o = options(query); assert.ok(o.errors.length, query);
    assert.equal(evaluateJumpExploratory([analyzeCandidateRace(rows, "officialRating", proof)], o).summary.runners, 0);
  }
});
test("2025 comparison requires matching outcome/SP definitions and terminal source evidence", () => {
  const { rows } = exploratoryFixture();
  const historical = rows.map(({ row }) => ({ ...row, features: { ...row.features, raceDate: "2025-06-01" } }));
  const missing = structuredClone(historical[0]); missing.features.targetRunnerId = "unverified"; delete missing.outcome.raceStage; historical.push(missing);
  const comparison = compare2025Outcomes(historical, options())!;
  assert.equal(comparison.usable, 2); assert.equal(comparison.exclusions, 2); assert.equal(comparison.unverifiedSource, 1); assert.equal(comparison.profit, 299);
  assert.equal(canCompareExploratory2025(options("jumpFeature=latestSpeedRating")), false);
  assert.equal(canCompareExploratory2025(options("jumpStartersMin=2")), false);
  assert.equal(compare2025Outcomes(historical, options("jumpFeature=bestSpeedLast3")), null);
});
