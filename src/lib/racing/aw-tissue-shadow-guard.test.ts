import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";
import { AW_TISSUE_ARTIFACT_HASH } from "./aw-tissue-model";
import type { AwTissueRace } from "./aw-tissue-forward";
import { emptyAwShadow, type ShadowRace, type ShadowRunner } from "./aw-tissue-shadow-forward";
import { AW_SHADOW_CHECKSUM, AW_SHADOW_IMPLEMENTED_AT } from "./aw-tissue-shadow-model";
import { awShadowOperationalWarnings, renderAwShadowOperationalWarnings } from "./aw-tissue-shadow-guard";
import { FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION, type ForwardValuePriceSnapshot, type ForwardValueRecord } from "./forward-value";

const date = "2026-10-07", off = "2026-10-07T18:00:00.000Z";
function price(capturedAt = "2026-10-07T04:00:00.000Z"): ForwardValuePriceSnapshot {
  return { decimalPrice: 5, impliedProbability: .2, capturedAt, minutesBeforeScheduledOff: 840,
    ratingProbability: .4, ratingEdgePercentagePoints: 20, marketPriceBasisVersion: FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION };
}
function runner(id: string, v1Rank: number): ShadowRunner {
  return { runnerId: id, horseName: id, v1Probability: v1Rank === 1 ? .6 : .4, candidateProbability: v1Rank === 1 ? .4 : .6,
    v1Rank, candidateRank: 3 - v1Rank, baseInputs: [], candidateInputs: [],
    extras: { trainerPriorRuns: 0, jockeyPriorRuns: 0, comments: [] }, prices: {}, outcome: null };
}
function race(): ShadowRace {
  return { raceId: "race", raceDate: date, course: "Newcastle", scheduledOffAt: off, capturedAt: AW_SHADOW_IMPLEMENTED_AT,
    v1RecordedAt: "2026-10-07T03:57:10.000Z", captureMode: "live_sync", modelHash: AW_SHADOW_CHECKSUM,
    v1ModelHash: AW_TISSUE_ARTIFACT_HASH, runners: [runner("a", 1), runner("b", 2)], settledAt: null, winners: [], excludedReason: null };
}
function source(snapshot: ForwardValuePriceSnapshot): AwTissueRace {
  return { raceId: "race", recordedPreRace: true, recordedAt: "2026-10-07T03:57:10.000Z", scheduledOffAt: off,
    excludedReason: null, predictedRunnerCount: 2, activeRunnerCount: 2, top1: "a", prices: { early: snapshot, t180: null, t60: null } } as AwTissueRace;
}

describe("AW shadow operational safeguard", () => {
  test("warns when AW cards have zero captures, including a missing V1 source, without a false warning on no AW cards", () => {
    const warnings = awShadowOperationalWarnings(emptyAwShadow(), [], [], { raceDate: date, raceIds: ["race", "other"] });
    assert.equal(warnings[0]!.code, "NO_CAPTURES");
    assert.deepEqual(warnings[0]!.raceIds, ["race", "other"]);
    assert.match(warnings[0]!.message, /2 AW racecards, 0 paired prospective captures/);
    assert.deepEqual(awShadowOperationalWarnings(emptyAwShadow(), [], [], { raceDate: date, raceIds: [] }), []);
  });
  test("counts existing captures on repeat syncs, deduplicates cards and flags partial or retrospective-only coverage", () => {
    const data = { ...emptyAwShadow(), races: [race()] };
    const repeat = awShadowOperationalWarnings(data, [], [], { raceDate: date, raceIds: ["race", "race"] });
    assert.ok(!repeat.some(w => w.code === "NO_CAPTURES" || w.code === "PARTIAL_CAPTURES"));
    const partial = awShadowOperationalWarnings(data, [], [], { raceDate: date, raceIds: ["race", "missing"] });
    assert.deepEqual(partial.find(w => w.code === "PARTIAL_CAPTURES")!.raceIds, ["missing"]);
    data.races[0]!.captureMode = "retrospective_or_imported";
    assert.equal(awShadowOperationalWarnings(data, [], [], { raceDate: date, raceIds: ["race"] })[0]!.code, "NO_CAPTURES");
  });
  test("warns only for changed candidate leaders lacking any clean supported price stage", () => {
    const r = race(), data = { ...emptyAwShadow(), races: [r] };
    assert.equal(awShadowOperationalWarnings(data, [], [])[0]!.code, "UNPRICED_CHANGED_LEADER");
    r.runners[1]!.prices.t60 = { source: "aw_tissue", snapshot: price() };
    assert.deepEqual(awShadowOperationalWarnings(data, [], []), []);
    r.runners[1]!.prices.t60 = { source: "aw_tissue", snapshot: price(off) };
    assert.equal(awShadowOperationalWarnings(data, [], [])[0]!.code, "UNPRICED_CHANGED_LEADER");
    r.runners[1]!.candidateRank = 2; r.runners[0]!.candidateRank = 1;
    assert.deepEqual(awShadowOperationalWarnings(data, [], []), []);
  });
  test("reports pre-shadow source price exclusions while retaining probability observations and usable later stages", () => {
    const r = race(), data = { ...emptyAwShadow(), races: [r] };
    r.runners[1]!.prices.t60 = { source: "forward_value", snapshot: price() };
    const sources = [source(price("2026-10-07T03:57:10.000Z"))];
    const before = JSON.stringify({ data, sources });
    const warnings = awShadowOperationalWarnings(data, sources, []);
    assert.deepEqual(warnings.map(w => w.code), ["PRE_SHADOW_PRICE"]);
    assert.match(warnings[0]!.message, /Probability observation is retained/);
    assert.equal(JSON.stringify({ data, sources }), before);
    assert.deepEqual(awShadowOperationalWarnings(data, [source(price(AW_SHADOW_IMPLEMENTED_AT))], []), []);
  });
  test("checks clean Forward Value leader/tissue snapshots, deduplicates duplicate source stages and ignores retrospective sources", () => {
    const r = race(), stale = price("2026-10-07T03:57:10.000Z");
    r.runners[1]!.prices.t60 = { source: "forward_value", snapshot: price() };
    const fv = { family: "aw", raceId: r.raceId, raceDateTime: off, recordedPreRace: true, captureMode: "live_sync",
      recordedAt: r.v1RecordedAt, priceCapturedAt: stale.capturedAt, calibratedProbability: .3, capturedDecimalOdds: 5,
      leaderRunnerId: "a", tissueRunnerId: "a", earlyPriceSnapshot: stale, tissueEarlyPriceSnapshot: stale,
      leaderResultStatus: null, settledAt: null } as ForwardValueRecord;
    const warnings = awShadowOperationalWarnings({ ...emptyAwShadow(), races: [r] }, [source(stale)], [fv]);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0]!.message, /snapshots a\/early predate/);
    fv.captureMode = "retrospective_or_imported";
    assert.deepEqual(awShadowOperationalWarnings({ ...emptyAwShadow(), races: [r] }, [], [fv]), []);
    assert.match(renderAwShadowOperationalWarnings(warnings), /Diagnostic \/ Forward Validation Only/);
  });
  test("wrapper runs only the independent shadow sync and leaves the production AW sync command intact", async () => {
    const pkg = JSON.parse(await readFile("package.json", "utf8"));
    assert.equal(pkg.scripts["sync:aw-shadow"], "bun --env-file=.env.local run scripts/track-aw-tissue-shadow.ts sync");
    assert.equal(pkg.scripts["aw-tissue:sync"], "bun --env-file=.env.local run scripts/track-aw-tissue.ts sync");
  });
});
