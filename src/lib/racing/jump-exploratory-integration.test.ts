import assert from "node:assert/strict";
import { test } from "node:test";
import { readIsolatedJumpCandidate } from "./jump-candidate-reader";
import { evaluateJumpExploratory, parseExploratoryOptions } from "./jump-exploratory-research";

test("Research Filters controlled adapter reproduces real candidate coverage and uncapped outcomes", { timeout: 60_000 }, async () => {
  const candidate = await readIsolatedJumpCandidate();
  assert.equal(candidate.buildDate, "2026-11-11T16:56:04.829Z");
  const outcome = evaluateJumpExploratory(candidate.analyze("officialRating").races, parseExploratoryOptions(new URLSearchParams()));
  assert.equal(outcome.coverage.runners, 32901); assert.equal(outcome.coverage.races, 3353);
  assert.equal(outcome.summary.settled, 29856); assert.equal(outcome.coverage.settlementExcluded, 3045);
  assert.equal(outcome.coverage.validMarketFields, 3351); assert.equal(outcome.summary.benchmarkRunners, 29841); assert.equal(outcome.summary.missingMarket, 15);
  assert.equal(outcome.coverage.settlementExclusionsByReason["settlement:NR"], 3036); assert.equal(outcome.coverage.settlementExclusionsByReason["settlement:void"], 9);
  const longWinners = outcome.selected.filter(o => o.outcomeState === "win" && o.historicalSP! > 21);
  assert.equal(longWinners.length, 118); assert.equal(Math.max(...longWinners.map(o => o.settlement!.grossReturn)), 301);
  for (const [feature, count] of [["latestSpeedRating", 11401], ["previousPerformanceRating", 9110], ["bestTodaysRatingLast3", 10661], ["averageSpeedLast3", 10661], ["bestPerformanceLast5", 11194]] as const) {
    const analysis = candidate.analyze(feature);
    const unfiltered = evaluateJumpExploratory(analysis.races, parseExploratoryOptions(new URLSearchParams({ jumpFeature: feature })));
    assert.equal(unfiltered.summary.runners, count, feature);
    if (feature === "averageSpeedLast3") {
      assert.equal(unfiltered.coverage.completeComparisonFields, 114); assert.equal(unfiltered.coverage.partialComparisonFields, 2024);
      const ranked = evaluateJumpExploratory(analysis.races, parseExploratoryOptions(new URLSearchParams({ jumpFeature: feature, jumpRankMax: "1" })));
      assert.ok(ranked.selected.every(o => o.rank.status === "verified_whole_field" && o.rank.wholeFieldRank === 1 && o.rank.diagnosticRank === null));
    }
  }
});
