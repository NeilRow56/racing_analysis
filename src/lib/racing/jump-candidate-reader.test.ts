import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { readIsolatedJumpCandidate, ISOLATED_JUMP_CANDIDATE, JUMP_CANDIDATE_PINS } from "./jump-candidate-reader";

async function hashFile(path: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
async function cacheFiles(directory: string): Promise<string[]> {
  const paths: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...await cacheFiles(path)); else if (entry.isFile()) paths.push(path);
  }
  return paths.sort();
}
async function fingerprints(paths: string[]) {
  const hashes: Record<string, string> = {};
  for (const path of paths) hashes[path] = await hashFile(path);
  return hashes;
}
test("isolated access reconciles audit, checks complete fields and preserves candidate and existing caches", { timeout: 120_000 }, async () => {
  const paths = [...await cacheFiles("data/research/backtest-cache"), ...Object.keys(JUMP_CANDIDATE_PINS).map(path => join(ISOLATED_JUMP_CANDIDATE, path))];
  const before = await fingerprints(paths);
  const candidate = await readIsolatedJumpCandidate();
  assert.deepEqual(candidate.audit, { runners: 32901, races: 3353, historicalSPSettlementPopulation: 29856, referenceEligible: 25251, strictRatingObservations: 10661, broadContextOnlyExclusions: 13737, referenceDependencyExclusions: 14590 });
  assert.equal(candidate.activated, false);
  const speed = candidate.analyze("bestSpeedLast3"), c = speed.coverage;
  assert.equal(c.eligibleSettledObservations, 10661);
  assert.equal(c.completeComparisonFields, 114); assert.equal(c.partialComparisonFields, 2024); assert.equal(c.unavailableComparisonFields, 1215);
  assert.equal(c.verifiedRankObservations, 856); assert.equal(c.validMarketFields, 3351); assert.equal(c.validMarketObservations, 29841);
  assert.equal(c.originalDeclaredFields, 0);
  assert.deepEqual(Object.values(c.winnersBySPBand).map(b => b.records), [2779, 6928, 7201, 6420, 9518, 55]);
  assert.deepEqual(Object.values(c.winnersBySPBand).map(b => b.strictWinners), [316, 370, 218, 121, 36, 0]);
  const observations = speed.races.flatMap(r => r.observations);
  assert.equal(observations.filter(o => o.outcomeState === "NR").length, 3036);
  assert.equal(observations.filter(o => o.outcomeState === "void").length, 9);
  assert.equal(observations.filter(o => o.outcomeState === "unresolved").length, 0);
  assert.equal(c.winnersBySPBand[">21"].winners, 118);
  const max = observations.filter(o => o.outcomeState === "win").sort((a, b) => (b.historicalSP ?? 0) - (a.historicalSP ?? 0))[0];
  assert.equal(max.historicalSP, 301); assert.equal(max.settlement?.grossReturn, 301);
  assert.ok(Object.isFrozen(speed.races[0].observations[0].originalExclusionEvidence));
  for (const race of speed.races) {
    if (race.market.valid) assert.ok(Math.abs(race.observations.reduce((sum, o) => sum + (o.normalizedSPProbability ?? 0), 0) - 1) < 1e-12);
    else assert.ok(race.observations.every(o => o.normalizedSPProbability === null));
    if (!race.completeComparisonField) assert.ok(race.observations.every(o => o.rank.wholeFieldRank === null));
  }
  // Read-only reporting reproduces the checked-in feature report, including history
  // depths, overlapping exclusions and winners retained/excluded in each SP band.
  const report = JSON.parse(await readFile("docs/jump-2026-controlled-research-coverage.json", "utf8")) as { features: typeof c[] };
  for (const coverage of report.features) assert.deepEqual(coverage.feature === "bestSpeedLast3" ? c : candidate.analyze(coverage.feature).coverage, coverage);
  assert.deepEqual(await fingerprints(paths), before);
  for (const proof of candidate.fieldProofs) assert.equal(await hashFile(proof.sourcePath), proof.sha256);
});
