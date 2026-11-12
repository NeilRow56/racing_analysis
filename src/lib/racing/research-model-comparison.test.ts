import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { cachedModelObservations, coverage, evidenceLabel, matchedPopulation, modelBreakdowns, normalizedSpMarkets, selectObservations, storedTissueObservations, summarizeModel } from "./research-model-comparison";
import { defaultResearchRule, evaluateResearchRule } from "./research-rule";
import type { HistoricalTargetRunnerMetricsRow as Row } from "./historical-target-metrics";
import type { FrozenTissueModel, TissueForwardData, TissueForwardRace } from "./tissue-forward";

import { readFileSync } from "node:fs";
// Self-contained feature fixture: nullable stored metrics are intentionally explicit.
function row(id: string, speed: number | null, sp: string | null = "4", won = false): Row {
  return { features: { targetRaceId: "race", targetRunnerId: id, raceDate: "2025-06-01", raceDateTime: new Date("2025-06-01T13:00:00Z"), raceCode: "turf", raceName: "Test Handicap", raceType: "Flat", raceTypeCode: "flat", actualRunnerCount: 2, declaredRunnerCount: 2, latestSpeedRating: speed, latestPerformanceRating: speed, latestTodaysRating: id === "a" ? null : 90, bestSpeedLast3: speed, bestPerformanceLast3: speed, bestTodaysRatingLast3: null, horseId: id, horseName: id, trainerId: null, trainerName: null, courseId: "course", courseName: "Test", source: "sporting_life", raceClass: "4", distanceYards: 1760, going: null, surface: "Turf", horseAge: 4, officialRating: 80, weight: null, weightCarriedLbs: null, currentWeightCarriedLb: null, draw: null, odds: null, oddsDecimal: null, priorRuns: 0, priorWins: 0, priorPlaces: 0, trainerPriorRuns: 0, trainerPriorWins: 0, trainerPriorWinRate: null, winPercentage: null, placePercentage: null, latestRunDate: null, daysSinceLastRun: null, breakLengthDays: null, runAfterBreakNumber: null, latestOr: null, previousOr: null, previousSpeedRating: null, bestSpeedLast5: null, averageSpeedLast3: null, averageSpeedLast5: null, previousPerformanceRating: null, bestPerformanceLast5: null, averagePerformanceLast3: null, averagePerformanceLast5: null, latestPerformanceCalculationVersion: null, previousTodaysRating: null, bestTodaysRatingLast5: null, averageTodaysRatingLast3: null, averageTodaysRatingLast5: null, todaysRatingCalculationVersion: null, latestJumpSpeedRating: null, previousJumpSpeedRating: null, bestJumpSpeedLast3: null, bestJumpSpeedLast5: null, averageJumpSpeedLast3: null, averageJumpSpeedLast5: null, latestAwSpeedRating: null, previousAwSpeedRating: null, bestAwSpeedLast3: null, bestAwSpeedLast5: null, averageAwSpeedLast3: null, averageAwSpeedLast5: null, latestTurfSpeedRating: null, previousTurfSpeedRating: null, bestTurfSpeedLast3: null, bestTurfSpeedLast5: null, averageTurfSpeedLast3: null, averageTurfSpeedLast5: null, latestSpeedMethod: null, latestSpeedConfidence: null, speedCalculationVersion: null }, outcome: { targetRaceId: "race", targetRunnerId: id, finishingPosition: won ? 1 : 2, resultStatus: "finished", won, placed: won, startingPrice: null, startingPriceDecimal: sp } };
}
const period = { from: "2025-01-01", to: "2025-12-31" };
const artifact = { version: "tissue_model_v3", checksum: "frozen", trainedAt: "2026-10-19T20:23:47Z", trainingWindow: period } satisfies Pick<FrozenTissueModel, "version" | "checksum" | "trainedAt" | "trainingWindow">;
function ledger(): TissueForwardData {
  return { version: "tissue_forward_v3", tissueModelVersion: "tissue_model_v3", forwardStart: "2026-10-20", races: [{ raceId: "race", raceDate: "2026-10-20", raceTime: "14:00", course: "Test", sourceId: null, raceName: "Test Handicap", tissueModelVersion: artifact.version, tissueModelChecksum: artifact.checksum, liveSemanticsVersion: "TURF_TISSUE_V3_PRERACE", recordedAt: "2026-10-20T08:00:00Z", featureCutoffAt: "2026-10-20T07:00:00Z", recordedPreRace: true, winners: ["a"], settledAt: "2026-10-20T15:00:00Z", runners: ["a", "b"].map((id, i) => ({ runnerId: id, horseId: id, horseName: id, probability: i ? 0.4 : 0.6, fairDecimalOdds: i ? 2.5 : 1 / 0.6, tissueRank: i + 1, commentFeatures: [], finishingPosition: i + 1, finalSp: 2.5, marketImpliedProbability: 999, marketRank: 99 })) }] };
}
describe("read-only research model comparisons", () => {
  test("model coverage excludes missing scores, preserves zero and tied ranks", () => {
    const rows = [row("a", 0), row("b", 0), { ...row("c", null), features: { ...row("c", null).features, actualRunnerCount: 3 } }];
    const speed = cachedModelObservations(rows, "latestSpeedRating");
    assert.equal(coverage(speed).runners, 2); assert.deepEqual(speed.map(r => r.rank), [1, 1]);
    const matched = matchedPopulation([speed, cachedModelObservations(rows, "latestTodaysRating")]);
    assert.deepEqual([...matched], ["race:b"]);
    assert.equal(selectObservations(speed, { period, population: matched, rankMax: 1 }).length, 1);
  });
  test("normalizes the complete market before rank selection and matching", () => {
    const rows = [row("a", 100, "2.5", true), row("b", 90, "2.5")];
    assert.deepEqual([...normalizedSpMarkets(rows).values()], [0.5, 0.5]);
    const speed = cachedModelObservations(rows, "latestSpeedRating");
    const summary = summarizeModel(selectObservations(speed, { period, rankMax: 1 }));
    assert.equal(summary.expected, 0.5); assert.equal(summary.ae, 2); assert.equal(summary.profit, 1.5); assert.equal(summary.roi, 150);
    assert.equal(speed[1].rank, 2);
  });
  test("void, abandoned and provisional fields contribute neither stakes nor market expected wins", () => {
    for (const raceStage of ["RACEVOID", "ABANDONED", "DORMANT", "RESULT"]) {
      const rows = [row("a", 100, "2.5", true), row("b", 90, "2.5")].map(r => ({ ...r, outcome: { ...r.outcome, raceStage } }));
      const original = JSON.stringify(rows);
      const markets = normalizedSpMarkets(rows);
      assert.equal(markets.size, 0);
      const summary = summarizeModel(cachedModelObservations(rows, "latestSpeedRating", markets));
      assert.equal(summary.settled, 0);
      assert.equal(summary.profit, 0);
      assert.equal(summary.roi, null);
      assert.equal(summary.ae, null);
      assert.equal(JSON.stringify(rows), original);
    }
  });
  test("missing, invalid, duplicated, partial and unknown-size fields have no benchmark", () => {
    for (const rows of [[row("a", 1)], [row("a", 1), row("b", 2, null)], [row("a", 1), row("b", 2, "1")], [row("a", 1), row("a", 2)], [row("a", 1), { ...row("b", 2), features: { ...row("b", 2).features, actualRunnerCount: null } }]]) assert.equal(normalizedSpMarkets(rows).size, 0);
    const observations = cachedModelObservations([row("a", 1, null), row("b", 2)], "latestSpeedRating");
    const result = summarizeModel(observations); assert.equal(result.missingSettlement, 1); assert.equal(result.missingMarket, 2); assert.equal(result.ae, null);
  });
  test("A/E excludes unmatched winners from both numerator and denominator; dead heat settlement", () => {
    const observations = cachedModelObservations([row("a", 1, "4", true), row("b", 2, "4", true)], "latestSpeedRating");
    for (const observation of observations) observation.outcome = { ...observation.outcome, deadHeatDivisor: 2 };
    observations[0].market = null;
    const summary = summarizeModel(observations); assert.equal(summary.expected, 0.5); assert.equal(summary.ae, 1); assert.equal(summary.profit, 2);
  });
  test("two periods respect inclusive boundaries and label used evidence", () => {
    const observations = cachedModelObservations([row("a", 100), row("b", 90)], "latestSpeedRating");
    assert.equal(selectObservations(observations, { period: { from: "2025-06-01", to: "2025-06-01" } }).length, 2);
    assert.equal(selectObservations(observations, { period: { from: "2026-01-01", to: "2026-12-31" } }).length, 0);
    assert.match(evidenceLabel("2025-06-01"), /development/); assert.match(evidenceLabel("2026-01-01"), /previously used/);
  });
  test("every fixed breakdown partitions selections with missing coverage and no rating edge", () => {
    const observations = cachedModelObservations([row("a", 100), row("b", 90, null)], "latestSpeedRating");
    const breakdowns = modelBreakdowns(observations, false); assert.equal(breakdowns.length, 6);
    for (const breakdown of breakdowns) assert.equal(breakdown.rows.reduce((n, r) => n + r.runners, 0), 2);
    assert.equal(breakdowns.find(b => b.name.startsWith("Historical SP"))?.rows.find(r => r.label === "Missing")?.runners, 1);
    assert.equal(selectObservations(observations, { period, edgeMin: 0 }).length, 0);
  });
  test("uses only stored V3 probabilities and native ledger full-field SP, with no replay", () => {
    const result = storedTissueObservations(ledger(), artifact, []);
    assert.equal(result.observations.length, 2); assert.equal(result.observations[0].probability, 0.6); assert.equal(result.observations[0].market, 0.5);
    assert.equal(result.observations[0].rank, 1); assert.equal(modelBreakdowns(result.observations, true).length, 7);
    const missing = ledger(); missing.races[0].runners[1].finalSp = null;
    assert.equal(storedTissueObservations(missing, artifact, []).observations[0].market, null);
  });
  test("rejects future information, late captures, wrong semantics, checksum, duplicate races and training overlap", () => {
    const changes: Partial<TissueForwardRace>[] = [{ recordedPreRace: false }, { recordedAt: "2026-10-20T16:00:00Z" }, { featureCutoffAt: "2026-10-21T00:00:00Z" }, { tissueModelChecksum: "other" }, { liveSemanticsVersion: "old" }, { raceDate: "2025-06-01" }, { recordedAt: "invalid" }];
    for (const change of changes) { const data = ledger(); Object.assign(data.races[0], change); assert.equal(storedTissueObservations(data, artifact, []).observations.length, 0); }
    const duplicate = ledger(); duplicate.races.push(duplicate.races[0]); assert.equal(storedTissueObservations(duplicate, artifact, []).observations.length, 0);
  });
  test("comparison and advanced rule evaluations do not mutate frozen rules or historical rows", () => {
    const rule = defaultResearchRule("turf_flat"); const rows = [row("a", 100), row("b", 90)];
    const original = JSON.stringify({ rule, rows });
    const result = evaluateResearchRule({ rows, rule: { ...rule, dateRange: period } });
    const speed = cachedModelObservations(rows, "latestSpeedRating");
    selectObservations(speed, { period, rankMax: 1, advancedKeys: new Set(result.selectedRunners.map(r => `race:${r.id}`)) });
    assert.equal(JSON.stringify({ rule, rows }), original);
    const source = readFileSync(new URL("./research-model-sources.ts", import.meta.url), "utf8");
    assert.doesNotMatch(source, /writeFile|buildBacktest|createDbConnection|\bsync\s*\(/);
  });
});

test("withdrawals do not enter full-field markets or model ranks", () => {
  const withdrawn = row("nr", 999, null); withdrawn.outcome.resultStatus = "non_runner";
  const rows = [row("a", 100, "3", true), row("b", 90, "3"), withdrawn];
  assert.equal(normalizedSpMarkets(rows).size, 2);
  const observations = cachedModelObservations(rows, "latestSpeedRating");
  assert.equal(observations.length, 2); assert.equal(observations[0].rank, 1);
});
test("matched or advanced populations cannot promote a runner's full-race rank", () => {
  const observations = cachedModelObservations([row("a", 100, "3", true), row("b", 90, "3")], "latestSpeedRating");
  const selected = selectObservations(observations, { period, population: new Set(["race:b"]), advancedKeys: new Set(["race:b"]), rankMax: 1 });
  assert.equal(selected.length, 0); assert.equal(observations[1].market, 0.5);
});
test("changing later outcomes and SP cannot change stored model scores or full-field ranks", () => {
  const rows = [row("a", 100, "3", true), row("b", 90, "3")];
  const before = cachedModelObservations(rows, "latestSpeedRating").map(r => [r.value, r.rank]);
  rows[0].outcome.won = false; rows[0].outcome.finishingPosition = 2; rows[0].outcome.startingPriceDecimal = "101";
  rows[1].outcome.won = true; rows[1].outcome.finishingPosition = 1;
  assert.deepEqual(cachedModelObservations(rows, "latestSpeedRating").map(r => [r.value, r.rank]), before);
  const data = ledger(); const probability = storedTissueObservations(data, artifact, []).observations[0].probability;
  data.races[0].runners[0].finishingPosition = 2; data.races[0].runners[0].finalSp = 101;
  assert.equal(storedTissueObservations(data, artifact, []).observations[0].probability, probability);
});
