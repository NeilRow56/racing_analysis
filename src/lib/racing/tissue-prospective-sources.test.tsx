import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { buildProspectiveTissueSources, TISSUE_PENDING_IDENTITY_QUARANTINE } from "./tissue-prospective-sources";
import { summarizeProspectiveTissue } from "./tissue-prospective-summary";
import { TISSUE_V3_CONFIG, TISSUE_V3_LIVE_SEMANTICS_VERSION, type TissueForwardData, type TissueForwardRace } from "./tissue-forward";
import { emptyAwV2Forward } from "./aw-tissue-v2";
import type { AwTissueRace } from "./aw-tissue-forward";
import { emptyJumpTissueForward, type JumpTissueRace } from "./jump-tissue-forward";
import { TURF_VALUE_CONFIG } from "./tissue-value-config";
import type { ValueCohortSnapshot } from "./tissue-value-readers";
import type { TissueValueRace } from "./tissue-value-forward";
import { TissueProspectiveSummary } from "../../app/racing/research/forward-value/tissue-prospective-summary";

const at = "2026-10-22T10:00:00.000Z", settledAt = "2026-10-22T14:00:00.000Z";
function turfRace(): TissueForwardRace {
  return { raceId: "turf", sourceId: "turf-source", raceDate: "2026-10-22", course: "Test", raceTime: "13:00", raceName: null,
    tissueModelVersion: TISSUE_V3_CONFIG.modelVersion, tissueModelChecksum: "hash", liveSemanticsVersion: TISSUE_V3_LIVE_SEMANTICS_VERSION,
    recordedAt: at, recordedPreRace: true, settledAt, winners: ["one"], runners: [1, 2].map(n => ({ runnerId: n === 1 ? "one" : "two", horseId: `horse${n}`, horseName: `Horse ${n}`,
      probability: n === 1 ? .6 : .4, tissueRank: n, fairDecimalOdds: n === 1 ? 1 / .6 : 2.5, commentFeatures: [],
      finishingPosition: n, finalSp: null, marketImpliedProbability: null, marketRank: null })) };
}
function awRace(): AwTissueRace {
  return { raceId: "aw", sourceId: "aw-source", raceDate: "2026-10-22", course: "Test", scheduledOffAt: "2026-10-22T13:00:00.000Z", recordedAt: at,
    recordedPreRace: true, modelVersion: "AW_TISSUE_V2", excludedReason: null, settledAt, runners: [1, 2].map(n => ({ runnerId: `aw-${n}`, probability: n === 1 ? .7 : .3, rank: n,
      outcome: { finishingPosition: n, resultStatus: "finished", won: n === 1, deadHeatDivisor: 1, finalSp: null, finalSpProfitLoss: null } })) } as AwTissueRace;
}
function valueRace(): TissueValueRace {
  return { raceId: "turf", raceDate: "2026-10-22", family: "TURF", capturedAt: at,
    runners: [1, 2].map(n => ({ runnerId: n === 1 ? "one" : "two", tissueRank: n, valueRank: 9 - n, probability: n === 1 ? .8 : .2,
      marketPrice: 5, outcome: { status: "settled", finishPosition: n, resultStatus: "finished", winner: n === 1, deadHeatDivisor: 1,
        grossReturn: n === 1 ? 5 : 0, profitLoss: n === 1 ? 4 : -1, settledAt } })) } as TissueValueRace;
}
function fixture() {
  const turf: TissueForwardData = { version: TISSUE_V3_CONFIG.forwardVersion, tissueModelVersion: TISSUE_V3_CONFIG.modelVersion,
    forwardStart: TISSUE_V3_CONFIG.forwardStart, races: [turfRace()] };
  const cohorts: ValueCohortSnapshot[] = [{ config: TURF_VALUE_CONFIG, data: { version: TURF_VALUE_CONFIG.version, epoch: TURF_VALUE_CONFIG.epoch, races: [valueRace()] } }];
  return { turf, aw: { ...emptyAwV2Forward(), races: [awRace()] }, jump: emptyJumpTissueForward(), cohorts };
}

test("Turf joins only result status; primary and Value ranks, probabilities and money stay separate", () => {
  const input = fixture(), before = JSON.stringify(input), output = buildProspectiveTissueSources(input);
  const primary = output.observations.find(r => r.family === "TURF" && r.tissueRank === 1)!;
  assert.equal(primary.probability, .6);
  assert.equal(primary.capturedPrice, null);
  assert.equal(primary.outcome!.profitLoss, null);
  assert.equal(output.priceObservations[0].probability, .8);
  assert.equal(output.priceObservations[0].outcome!.profitLoss, 4);
  assert.equal(JSON.stringify(input), before);
  const html = renderToStaticMarkup(<TissueProspectiveSummary {...output} />);
  assert.ok(html.includes("Separate Value cohort"));
  assert.ok(html.includes("these returns do not describe every runner"));
});

test("Turf requires matching canonical positions; null position without status stays unresolved", () => {
  const input = fixture();
  input.turf.races[0].runners[1].finishingPosition = null;
  assert.throws(() => buildProspectiveTissueSources(input), /evidence disagrees/);
  input.cohorts = [];
  const output = buildProspectiveTissueSources(input);
  assert.deepEqual(output.unresolvedResults, ["turf|two"]);
  assert.equal(output.observations.find(r => r.family === "TURF" && r.tissueRank === 2)!.outcome, null);
  assert.equal(summarizeProspectiveTissue(output.observations)[2].rows[0].settled, 1);
});

test("positive Turf finishes work without Value membership or SP; pending books never borrow outcomes", () => {
  const input = fixture();
  input.cohorts = [];
  assert.equal(summarizeProspectiveTissue(buildProspectiveTissueSources(input).observations)[2].rows[0].settled, 2);
  input.cohorts = fixture().cohorts;
  input.turf.races[0].settledAt = null;
  assert.ok(buildProspectiveTissueSources(input).observations.filter(r => r.family === "TURF").every(r => r.outcome === null));
});

test("NR, void and started non-finishers follow canonical result eligibility", () => {
  const input = fixture();
  input.aw.races[0].runners[0].outcome = { ...input.aw.races[0].runners[0].outcome!, finishingPosition: null, won: false, resultStatus: "fell" };
  input.aw.races[0].runners[1].outcome = { ...input.aw.races[0].runners[1].outcome!, finishingPosition: null, won: null, resultStatus: "non_runner" };
  let output = buildProspectiveTissueSources(input);
  assert.equal(output.observations.find(r => r.family === "AW" && r.tissueRank === 1)!.outcome!.status, "settled");
  assert.equal(output.observations.find(r => r.family === "AW" && r.tissueRank === 2)!.outcome!.status, "NR");
  input.aw.races[0].runners[1].outcome!.resultStatus = "race_void";
  output = buildProspectiveTissueSources(input);
  assert.equal(output.observations.find(r => r.family === "AW" && r.tissueRank === 2)!.outcome!.status, "void");
});

test("Hurdle and Chase retain frozen rank-2 winners outside Value coverage; NH Flat is excluded", () => {
  const input = fixture();
  input.jump.races = ["Hurdle", "Chase", "NH Flat"].map(subtype => ({ ...awRace(), raceId: subtype, subtype, modelVersion: "JUMP_TISSUE_V1",
    runners: awRace().runners.map(r => ({ ...r, outcome: { ...r.outcome!, won: r.rank === 2, finishingPosition: r.rank === 2 ? 1 : 2 } })) })) as unknown as JumpTissueRace[];
  const output = buildProspectiveTissueSources(input), rank2 = summarizeProspectiveTissue(output.observations)[1].rows;
  assert.equal(rank2.find(r => r.family === "HURDLE")!.winners, 1);
  assert.equal(rank2.find(r => r.family === "CHASE")!.winners, 1);
  assert.equal(output.observations.length, 8);
});

test("the exact three audit identities are quarantined, while settled 945340 remains", () => {
  const input = fixture();
  input.aw.races = TISSUE_PENDING_IDENTITY_QUARANTINE.filter(q => q.family === "AW").map(q => ({ ...awRace(), sourceId: q.sourceId, raceDate: q.date, raceId: q.sourceId, settledAt: null }));
  const chase = { ...awRace(), raceId: "chase", sourceId: "944784", subtype: "Chase", modelVersion: "JUMP_TISSUE_V1", settledAt: null } as unknown as JumpTissueRace;
  input.jump.races = [chase, { ...chase, sourceId: "945340", raceId: "retained", settledAt }];
  const output = buildProspectiveTissueSources(input);
  assert.deepEqual(output.quarantined.map(q => q.sourceId).sort(), ["944784", "945140", "945533"]);
  assert.equal(output.observations.filter(r => r.family === "AW").length, 0);
  assert.equal(output.observations.filter(r => r.family === "CHASE").length, 2);
  assert.equal(input.aw.races.length, 2);
  assert.ok(renderToStaticMarkup(<TissueProspectiveSummary {...output} />).includes("Reporting quarantine: 3"));
});

test("date, activation, model and clean-book guards reject ineligible captures", () => {
  for (const mutate of [
    (input: ReturnType<typeof fixture>) => { input.aw.races[0].raceDate = "2026-10-19"; },
    (input: ReturnType<typeof fixture>) => { input.aw.races[0].recordedAt = "2026-10-20T03:00:00.000Z"; },
    (input: ReturnType<typeof fixture>) => { input.aw.races[0].recordedAt = input.aw.races[0].scheduledOffAt; },
    (input: ReturnType<typeof fixture>) => { input.aw.races[0].excludedReason = "field_changed_after_capture"; },
    (input: ReturnType<typeof fixture>) => { input.aw.races[0].recordedPreRace = false; },
    (input: ReturnType<typeof fixture>) => { input.aw.races[0].runners[0].probability = .1; },
  ]) {
    const input = fixture(); mutate(input);
    assert.ok(buildProspectiveTissueSources(input).observations.every(r => r.family !== "AW"));
  }
  const wrongModel = fixture(); wrongModel.turf.races[0].tissueModelVersion = "tissue_model_v2";
  assert.ok(buildProspectiveTissueSources(wrongModel).observations.every(r => r.family !== "TURF"));
  const input = fixture();
  input.cohorts[0].data.races[0].capturedAt = "2026-10-20T04:00:00.000Z";
  assert.equal(buildProspectiveTissueSources(input).priceObservations.length, 0);
});

test("duplicate primary observations fail closed", () => {
  const input = fixture(); input.aw.races.push(structuredClone(input.aw.races[0]));
  assert.throws(() => buildProspectiveTissueSources(input), /Duplicate primary/);
});

test("new stored settlements appear on the next projection without any UI settlement", () => {
  const input = fixture(); input.aw.races[0].settledAt = null;
  const before = summarizeProspectiveTissue(buildProspectiveTissueSources(input).observations)[0].rows[1];
  input.aw.races[0].settledAt = settledAt;
  const after = summarizeProspectiveTissue(buildProspectiveTissueSources(input).observations)[0].rows[1];
  assert.equal(before.captured, after.captured);
  assert.equal(before.settled, 0);
  assert.equal(after.settled, 1);
});

test("shadow Speed ranks come from each book's frozen full field without changing baseline membership or results", async () => {
  const { VALUE_COHORTS } = await import("./tissue-value-config");
  const input = fixture();
  input.jump.races = (["Hurdle", "Chase"] as const).map((subtype): JumpTissueRace => ({ ...input.aw.races[0], raceId: subtype, subtype, modelVersion: "JUMP_TISSUE_V1",
    featureSchemaVersion: "jump_tissue_stage1_numeric_prior_comments_v1", nhFlat: false, jprALeader: null, jprBLeader: null,
    runners: input.aw.races[0].runners.map(r => ({ ...r, runnerId: `${subtype}-${r.runnerId}`, modelVersion: "JUMP_TISSUE_V1",
      featureSchemaVersion: "jump_tissue_stage1_numeric_prior_comments_v1", rawInputs: [], priorJumpStarts: 3, historyBucket: "three_plus",
      zeroPriorJumpStarts: false, onePriorJumpStart: false, twoPriorJumpStarts: false, threePlusPriorJumpStarts: true,
      commentProvenance: { representationVersion: "jump_tissue_stage1_numeric_prior_comments_v1", sourceObservationCutoff: at, priorCommentCount: 0,
        activeCommentFeatures: [], chronologySafe: true, targetRacePostResultCommentExcluded: true } })) }));
  const withSpeed = (names: readonly string[], i: number) => {
    const values = names.map(() => 0), name = names.includes("best_l3_jump_speed") ? "best_l3_jump_speed" : "best_l3_turf_speed";
    values[names.indexOf(name)] = i === 0 ? 100 : 90;
    return values;
  };
  input.turf.races[0].runners.forEach((r, i) => { r.modelInputs = withSpeed(VALUE_COHORTS[0].featureNames, i); });
  input.aw.races[0].runners.forEach((r, i) => { r.modelInputs = withSpeed(VALUE_COHORTS[1].featureNames, i); });
  input.jump.races.forEach(race => race.runners.forEach((r, i) => { r.modelInputs = withSpeed(VALUE_COHORTS[2].featureNames, i); }));
  const value = input.cohorts[0].data.races[0]; value.featureNames = [...VALUE_COHORTS[0].featureNames];
  value.runners.forEach((r, i) => { r.modelInputs = withSpeed(value.featureNames, 1 - i); });
  const before = JSON.stringify(input), output = buildProspectiveTissueSources(input);
  for (const family of ["TURF", "AW", "HURDLE", "CHASE"]) {
    const rows = output.observations.filter(r => r.family === family);
    assert.deepEqual(rows.map(r => [r.tissueRank, r.bestL3SpeedRank]), [[1, 1], [2, 2]]);
  }
  // The separate Value capture keeps its own field's Speed and Tissue order.
  assert.deepEqual(output.priceObservations.map(r => [r.tissueRank, r.bestL3SpeedRank]), [[1, 2], [2, 1]]);
  assert.equal(output.observations.length, 8); assert.equal(JSON.stringify(input), before);
  const baseline = summarizeProspectiveTissue(output.observations);
  input.turf.races[0].runners[0].modelInputs = undefined;
  const incomplete = buildProspectiveTissueSources(input);
  assert.ok(incomplete.observations.filter(r => r.family === "TURF").every(r => r.bestL3SpeedRank === null));
  assert.deepEqual(summarizeProspectiveTissue(incomplete.observations), baseline);
});
