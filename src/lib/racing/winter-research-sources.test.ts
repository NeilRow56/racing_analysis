import assert from "node:assert/strict";
import { test } from "node:test";
import { buildWinterResearchSources } from "./winter-research-sources";
import { emptyAwV2Forward } from "./aw-tissue-v2";
import { emptyJumpTissueForward, type JumpTissueRace } from "./jump-tissue-forward";
import { TISSUE_V3_CONFIG, type TissueForwardData } from "./tissue-forward";
import { HURDLE_VALUE_CONFIG } from "./tissue-value-config";
import { emptyHurdleRecency, type HurdleRecencyObservation } from "./hurdle-recency-forward";
import type { ChaseSpeedSnapshot } from "./chase-speed-reliability-capture";

const at = "2026-10-28T10:00:00.000Z", off = "2026-10-28T14:00:00.000Z";
function fixture() {
  const vector = (or: number, handicap: number, missingOr = false) => {
    const names = HURDLE_VALUE_CONFIG.featureNames, values = names.map(() => 0);
    values[names.indexOf("official_rating")] = missingOr ? 0 : or;
    values[names.indexOf("official_rating_missing")] = missingOr ? 1 : 0;
    values[names.indexOf("handicap")] = handicap;
    return values;
  };
  // Minimal stored-book fixtures: the projection only reads frozen fields.
  const race = (subtype: "Chase" | "Hurdle"): JumpTissueRace => ({ raceId: subtype, sourceId: subtype, raceDate: "2026-10-28", subtype,
    scheduledOffAt: off, recordedAt: at, recordedPreRace: true, modelVersion: "JUMP_TISSUE_V1", excludedReason: null, settledAt: "2026-10-28T15:00:00.000Z",
    runners: [1, 2, 3, 4].map(n => ({ runnerId: `${subtype}-${n}`, rank: n, probability: .25,
      modelInputs: vector(n === 1 ? 100 : 110, n === 1 ? 1 : 0, n === 2),
      outcome: { finishingPosition: n, resultStatus: "finished", won: n === 1, deadHeatDivisor: 1, finalSp: null, finalSpProfitLoss: null } })) } as JumpTissueRace);
  const turf: TissueForwardData = { version: TISSUE_V3_CONFIG.forwardVersion, tissueModelVersion: TISSUE_V3_CONFIG.modelVersion, forwardStart: TISSUE_V3_CONFIG.forwardStart, races: [] };
  return { turf, aw: emptyAwV2Forward(), jump: { ...emptyJumpTissueForward(), races: [race("Chase"), race("Hurdle")] }, cohorts: [] };
}

test("owning full-field frozen inputs determine handicap and competition OR ranks, retaining non-Top-2 runners", () => {
  const input = fixture(), before = structuredClone(input);
  const source = buildWinterResearchSources(input, [], emptyHurdleRecency());
  const chase = source.observations.filter(r => r.family === "CHASE");
  assert.equal(chase.length, 2);
  assert.equal(chase[0].orFrozen, 3); // Two higher, tied full-field runners, both outside Top 2.
  assert.equal(chase[1].orFrozen, null);
  assert.equal(chase[0].handicapFrozen, true);
  assert.equal(chase[1].handicapFrozen, false);
  assert.equal(chase[0].scheduledOff, off);
  assert.equal(chase[0].reliability, undefined);
  assert.deepEqual(input, before);
});

test("Chase reliability requires exact owning cohort/race/capture/runner identity", () => {
  const reliability = { level: "HIGH" as const, relevantJumpRuns: 3, windowRuns: 3, nonJumpRuns: 0, reason: "Frozen" };
  const snapshot: ChaseSpeedSnapshot = { cohort: "primary", raceId: "Chase", capturedAt: at, frozenAt: at,
    runners: [{ runnerId: "Chase-1", reliability, handicap: null, orRank: 99, marketRank: null, modelMarketRatio: null }] };
  const select = (s: ChaseSpeedSnapshot) => buildWinterResearchSources(fixture(), [s], emptyHurdleRecency()).observations[0];
  assert.equal(select(snapshot).reliability?.level, "HIGH");
  assert.equal(select(snapshot).orFrozen, 3); // Separate frozen feature context, never annotation substitution.
  assert.equal(select({ ...snapshot, capturedAt: "2026-10-28T10:01:00.000Z" }).reliability, undefined);
  assert.equal(select({ ...snapshot, cohort: "price" }).reliability, undefined);
  assert.equal(select({ ...snapshot, raceId: "wrong" }).reliability, undefined);
  assert.equal(select({ ...snapshot, runners: [{ ...snapshot.runners[0], runnerId: "wrong" }] }).reliability, undefined);
});

test("Hurdle recency accepts only an existing identity-matched snapshot at or before the owning capture and before off", () => {
  const recency = { ...emptyHurdleRecency(), observations: [{ raceId: "Hurdle", runnerId: "Hurdle-1", firstCapturedAt: at,
    scheduledOff: off, flags: { RECENT_COMPLETER: true, LATEST_RUN_PU: false }, features: { latestRunCompleted: true } } as HurdleRecencyObservation] };
  const read = () => buildWinterResearchSources(fixture(), [], recency).observations.find(r => r.runnerId === "Hurdle-1")!;
  const before = structuredClone(recency);
  assert.equal(read().recency?.flags.RECENT_COMPLETER, true);
  assert.deepEqual(recency, before);
  recency.observations[0].firstCapturedAt = "2026-10-28T10:00:01.000Z";
  assert.equal(read().recency, null);
  recency.observations[0].firstCapturedAt = at;
  recency.observations[0].scheduledOff = at;
  assert.equal(read().recency, null);
  recency.observations[0].scheduledOff = off;
  recency.observations[0].runnerId = "wrong";
  assert.equal(read().recency, null);
});
