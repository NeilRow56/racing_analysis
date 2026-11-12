import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { HistoricalPreRaceFeatureRow } from "./historical-target-metrics";
import { analyzeCandidateRace, candidateFeatureEligibility, candidateFieldIntegrity, type CandidateRow, type CandidateFieldEvidence, JUMP_CANDIDATE_WARNING } from "./jump-candidate-eligibility";
import { verifyCandidateFullResult, verifyCandidateBytes } from "./jump-candidate-reader";

function runner(id: string, value: number | null = 100): CandidateRow {
  return {
    row: {
      features: { targetRunnerId: id, targetRaceId: "race", horseId: `horse-${id}`, bestSpeedLast3: value, bestPerformanceLast3: 100, bestTodaysRatingLast3: 100, officialRating: 90, priorRuns: 3, daysSinceLastRun: 20, actualRunnerCount: 99 } as HistoricalPreRaceFeatureRow,
      outcome: { targetRunnerId: id, targetRaceId: "race", raceStage: "WEIGHEDIN", finishingPosition: 2, resultStatus: "finished", outcomeCode: "2", won: false, placed: false, startingPrice: "2/1", startingPriceDecimal: "3.000" },
    },
    evidence: { runnerId: id, raceId: "race", sourceFullResult: true, targetTimeMissing: false, settlementState: "loss", validSP: true, threeBestL3Finite: true, referenceEligible: true, ratingsL3Clear: true, strictExploratoryUsable: true, definiteUntimedPriorIds: [], uncertainPriorIds: [], hiddenActualL3Ids: [], potentialL3ContextIds: [], potentialAnyContextCount: 0, builderLast3Ids: ["a", "b", "c"] },
  };
}
function proof(rows: CandidateRow[]): CandidateFieldEvidence {
  return { raceId: "race", runnerIds: rows.map(r => r.evidence.runnerId), starterIds: rows.filter(r => r.row.outcome.resultStatus !== "non_runner").map(r => r.evidence.runnerId), nonRunnerIds: rows.filter(r => r.row.outcome.resultStatus === "non_runner").map(r => r.evidence.runnerId), sourcePath: "fixture", sha256: "fixture" };
}
describe("isolated feature eligibility", () => {
  test("a single metric does not require unrelated finite ratings", () => {
    const r = runner("a"); r.row.features.bestPerformanceLast3 = null; r.row.features.bestTodaysRatingLast3 = null;
    r.evidence.threeBestL3Finite = false; r.evidence.referenceEligible = false; r.evidence.strictExploratoryUsable = false;
    assert.equal(candidateFeatureEligibility(r, "bestSpeedLast3").eligible, true);
    assert.ok(candidateFeatureEligibility(r, "bestPerformanceLast3").reasons.includes("missing_feature:bestPerformanceLast3"));
  });
  for (const key of ["definiteUntimedPriorIds", "uncertainPriorIds", "hiddenActualL3Ids", "potentialL3ContextIds"] as const) test(`retains ${key} exclusions`, () => {
    const r = runner("a"); r.evidence[key] = ["hidden"];
    assert.equal(candidateFeatureEligibility(r, "bestSpeedLast3").eligible, false);
    // The target OR is independent of prior rating/history availability.
    assert.equal(candidateFeatureEligibility(r, "officialRating").eligible, true);
  });
  test("a clean direct L3 never clears broad historical context", () => {
    const r = runner("a"); r.evidence.potentialAnyContextCount = 1;
    assert.ok(candidateFeatureEligibility(r, "bestSpeedLast3").reasons.includes("unverified_historical_rating_context"));
    assert.equal(candidateFeatureEligibility(r, "daysSinceLastRun").eligible, true);
  });
  test("missing/absent rated history fails closed and a short recorded history stays explicit", () => {
    const r = runner("a", null); r.evidence.builderLast3Ids = [];
    assert.deepEqual(candidateFeatureEligibility(r, "bestSpeedLast3").reasons, ["missing_feature:bestSpeedLast3", "rating_history_unverified"]);
    r.row.features.bestSpeedLast3 = 100; r.evidence.builderLast3Ids = ["only-prior"];
    assert.equal(candidateFeatureEligibility(r, "bestSpeedLast3").eligible, true);
    assert.equal(analyzeCandidateRace([r], "bestSpeedLast3").observations[0].history.builderLastThreeDepth, 1);
  });
  test("missing target winning time does not invalidate pre-race metric or canonical outcome", () => {
    const r = runner("a"); r.evidence.targetTimeMissing = true;
    assert.equal(candidateFeatureEligibility(r, "bestSpeedLast3").eligible, true);
    assert.equal(analyzeCandidateRace([r], "bestSpeedLast3").observations[0].settlement?.profitLoss, -1);
  });
});
describe("field and rank integrity", () => {
  test("complete fields retain competition ties 1,1,3", () => {
    const rows = [runner("a", 100), runner("b", 100), runner("c", 80)];
    const result = analyzeCandidateRace(rows, "bestSpeedLast3", proof(rows));
    assert.deepEqual(result.observations.map(o => o.rank.wholeFieldRank), [1, 1, 3]);
    assert.equal(result.observations.every(o => o.rank.status === "verified_whole_field"), true);
  });
  test("a screened leader does not promote the remaining runner to verified rank one", () => {
    const rows = [runner("leader", 150), runner("other", 90)]; rows[0].evidence.potentialAnyContextCount = 1;
    const result = analyzeCandidateRace(rows, "bestSpeedLast3", proof(rows));
    assert.equal(result.observations[0].rank.status, "unavailable");
    assert.deepEqual(result.observations[1].rank, { status: "partial_field_diagnostic", wholeFieldRank: null, diagnosticRank: 1 });
    // Missing a competitor from the input invalidates the independent roster proof.
    const subset = analyzeCandidateRace(rows.slice(1), "bestSpeedLast3", proof(rows));
    assert.equal(subset.field.verified, false); assert.equal(subset.market.valid, false);
  });
  test("finite values and a matching cached actual count cannot establish completeness", () => {
    const rows = [runner("a"), runner("b")]; rows.forEach(r => { r.row.features.actualRunnerCount = 2; });
    assert.equal(analyzeCandidateRace(rows, "bestSpeedLast3").observations[0].rank.wholeFieldRank, null);
  });
  test("genuine NRs are excluded from starters, ranks and normalization", () => {
    const rows = [runner("a"), runner("b"), runner("nr", 200)];
    rows[2].row.outcome.resultStatus = "non_runner"; rows[2].row.outcome.finishingPosition = null;
    const result = analyzeCandidateRace(rows, "bestSpeedLast3", proof(rows));
    assert.equal(result.field.storedRosterCount, 3); assert.equal(result.field.genuineNonRunnerCount, 1); assert.equal(result.field.verifiedStarterCount, 2); assert.equal(result.field.originalDeclaredCount, null); assert.deepEqual(result.field.cachedActualCounts, [99]);
    assert.deepEqual(result.observations.map(o => o.normalizedSPProbability), [0.5, 0.5, null]);
    assert.equal(result.observations[2].rank.status, "unavailable");
  });
  test("market uses all starters before selection eligibility, but withholds invalid-price fields", () => {
    const rows = [runner("a"), runner("b")]; rows[1].evidence.potentialAnyContextCount = 1;
    assert.deepEqual(analyzeCandidateRace(rows, "bestSpeedLast3", proof(rows)).observations.map(o => o.normalizedSPProbability), [0.5, 0.5]);
    rows[1].row.outcome.startingPriceDecimal = null;
    const invalid = analyzeCandidateRace(rows, "bestSpeedLast3", proof(rows));
    assert.equal(invalid.market.valid, false); assert.equal(invalid.observations.every(o => o.normalizedSPProbability === null), true);
  });
  test("unknown and void outcomes cannot be silently classified as starters", () => {
    const rows = [runner("a"), runner("b")]; rows[1].row.outcome.finishingPosition = null; rows[1].row.outcome.resultStatus = "other"; rows[1].row.outcome.outcomeCode = "0";
    assert.equal(candidateFieldIntegrity(rows, proof(rows)).verified, false);
    rows[1].row.outcome.raceStage = "RACEVOID";
    assert.equal(candidateFieldIntegrity(rows, proof(rows)).verified, false);
  });
});
test("V3 retains losses, voids, NRs, dead heats and uncapped 301 winners without mutation", () => {
  const rows = [runner("long"), runner("dh"), runner("fell"), runner("void"), runner("nr")];
  for (const r of rows.slice(0, 2)) { r.row.outcome.finishingPosition = 1; r.row.outcome.won = true; r.row.outcome.startingPriceDecimal = "301"; }
  rows[1].row.outcome.deadHeatDivisor = 2;
  rows[2].row.outcome.finishingPosition = null; rows[2].row.outcome.resultStatus = "fell";
  rows[3].row.outcome.raceStage = "RACEVOID"; rows[4].row.outcome.resultStatus = "non_runner";
  const before = JSON.stringify(rows);
  const result = analyzeCandidateRace(rows, "bestSpeedLast3");
  assert.deepEqual(result.observations.map(o => o.settlement?.grossReturn ?? null), [301, 150.5, 0, null, null]);
  assert.equal(result.observations[2].settlement?.profitLoss, -1);
  assert.equal(result.observations[0].warning, JUMP_CANDIDATE_WARNING);
  assert.equal(result.observations[0].settlement?.settlementVersion, "canonical_settlement_v3");
  assert.equal(JSON.stringify(rows), before);
});
test("independent full-result proof requires exact ride identities and independent starter count", () => {
  const rows = [runner("a")];
  const input = { payload: { props: { pageProps: { race: { race_summary: { date: "2026-01-01", race_stage: "WEIGHEDIN", ride_count: 1, race_summary_reference: { id: 123 } }, rides: [{ ride_reference: { id: 9 }, ride_status: "RUNNER", finish_position: 2, casualty: {} as { reason?: string } }] } } } }, race: { id: "race", source_id: "123", date: "2026-01-01", stage: "WEIGHEDIN", full_count: 1 }, runners: [{ id: "a", source_id: "9", race_id: "race", horse_id: "horse-a", finishing_position: 2, result_status: "finished", outcome_code: "2", sp: "3.000" }], rows, sourcePath: "fixture", sha256: "fixture" };
  assert.deepEqual(verifyCandidateFullResult(input)?.starterIds, ["a"]);
  input.payload.props.pageProps.race.race_summary.ride_count = 2;
  assert.equal(verifyCandidateFullResult(input), null);
  input.payload.props.pageProps.race.race_summary.ride_count = 1;
  input.payload.props.pageProps.race.rides[0].ride_reference.id = 10;
  assert.equal(verifyCandidateFullResult(input), null);
  const ride = input.payload.props.pageProps.race.rides[0];
  ride.ride_reference.id = 9; ride.ride_status = "WITHDRAWN"; ride.finish_position = 0; ride.casualty.reason = "RefusedToRace";
  rows[0].row.outcome.finishingPosition = null; rows[0].row.outcome.resultStatus = "other"; rows[0].row.outcome.outcomeCode = "RefusedToRace";
  assert.deepEqual(verifyCandidateFullResult(input)?.starterIds, ["a"]);
  assert.deepEqual(verifyCandidateFullResult(input)?.nonRunnerIds, []);
});
test("changed or unknown evidence fails hash verification", () => {
  assert.throws(() => verifyCandidateBytes("eligibility.ndjson", "changed"), /hash mismatch/);
  assert.throws(() => verifyCandidateBytes("unknown", "data"), /hash mismatch/);
});
