import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { CHASE_SPEED_RELIABILITY_DECLARED as declared, summarizeChaseSpeedReliability, type ChaseSpeedObservation } from "./chase-speed-reliability-shadow";
import { attachChaseSpeedState, freezeChaseSpeedState, loadChaseSpeedSnapshots } from "./chase-speed-reliability-capture";
import { assessJumpSpeedReliability } from "./jump-speed-reliability";
import { calculateHorseMetricsAsOf } from "./horse-metrics";
import type { TodayRace } from "./todays-racing";
import { ChaseSpeedReliabilityShadow } from "../../app/racing/research/forward-value/chase-speed-reliability-shadow";
const at = "2026-10-29T09:00:00.000Z";
function row(overrides: Partial<ChaseSpeedObservation> = {}): ChaseSpeedObservation {
  return { family: "CHASE", raceId: "race", runnerId: "one", tissueRank: 1, probability: .25, capturedAt: at, capturedPrice: 5,
    reliability: { ...assessJumpSpeedReliability(), level: "HIGH", relevantJumpRuns: 3 }, bestL3SpeedRank: 2,
    handicap: true, orRank: 2, marketRank: 3, modelMarketRatio: 1.4,
    outcome: { status: "settled", winner: true, finishPosition: 1, resultStatus: "finished", deadHeatDivisor: 2, grossReturn: 2.5, profitLoss: 1.5, settledAt: at }, ...overrides };
}
const phase = (rows: ChaseSpeedObservation[], prices = rows) => summarizeChaseSpeedReliability(rows, prices)[0];
test("scope includes Chase ranks 1/2 only, never other families", () => {
  const rows = [row(), row({ tissueRank: 2 }), row({ tissueRank: 3 }), ...(["HURDLE", "TURF", "AW"] as const).map(family => row({ family }))];
  assert.deepEqual(phase(rows).ranks.map(s => s.rows[0].captured), [1, 1, 2]);
});
test("fixed reliability groups, separate ranks, pending/NR/void and frozen canonical metrics", () => {
  const rows = [row(), row({ tissueRank: 2, probability: .1 }), row({ outcome: null }), row({ capturedPrice: null }),
    ...(["MEDIUM", "LOW"] as const).map(level => row({ reliability: { ...assessJumpSpeedReliability(), level }, outcome: { ...row().outcome!, winner: false, profitLoss: -1 } })),
    row({ outcome: { ...row().outcome!, status: "NR" } }), row({ outcome: { ...row().outcome!, status: "void" } }), row({ reliability: null })];
  const before = JSON.stringify(rows), summary = phase(rows), top = summary.ranks[2].rows;
  assert.equal(top[0].captured, 6); assert.equal(top[0].settled, 3); assert.equal(top[0].winners, 3);
  assert.equal(top[0].modelExpected, .6); assert.equal(top[0].meanTissueProbability, .6 / 3);
  assert.equal(top[0].actualModelExpected, 5); assert.equal(top[0].price.priceN, 2); assert.equal(top[0].price.profitLoss, 3); assert.equal(top[0].price.roi, 1.5);
  assert.deepEqual(top.map(r => r.settled), [3, 1, 1, 2]); assert.equal(summary.unavailable, 1);
  assert.equal(JSON.stringify(rows), before);
  const separate = phase([row()], [row({ probability: .7, tissueRank: 2, reliability: { ...assessJumpSpeedReliability(), level: "LOW" } })]);
  assert.equal(separate.ranks[0].rows[0].price.priceN, 0); assert.equal(separate.ranks[1].rows[2].price.modelExpected, .7);
});
test("context uses fixed watch, structured handicap, OR, market, confidence and existing ratio bands", () => {
  const rows = [row(), row({ bestL3SpeedRank: 1, handicap: false, orRank: 1, marketRank: 1, probability: .1, modelMarketRatio: 2 }),
    row({ reliability: { ...assessJumpSpeedReliability(), level: "LOW" }, bestL3SpeedRank: null, handicap: null, orRank: null, marketRank: null, modelMarketRatio: null })];
  const contexts = phase(rows).contexts;
  for (const name of ["Best L3 watch", "Handicap", "OR rank", "Market rank", "Tissue probability", "Model/market ratio"]) {
    const context = contexts.find(c => c.name === name)!;
    assert.equal(context.rows.reduce((n, r) => n + r.settled, 0), 3);
  }
  assert.equal(contexts[0].rows.find(r => r.group === "HIGH" && r.label === "WATCH")!.settled, 1);
  assert.equal(contexts[1].rows.find(r => r.group === "HIGH" && r.label === "HANDICAP")!.winners, 1);
  assert.equal(contexts[2].rows.find(r => r.group === "HIGH" && r.label === "2-3")!.actualModelExpected, 4);
  assert.equal(contexts[5].rows.find(r => r.group === "HIGH" && r.label === "2.00+")!.settled, 1);
});
test("chronology is capture-time based including exact declaration boundary; unknown clocks fail closed", () => {
  const periods = summarizeChaseSpeedReliability([row({ capturedAt: "2026-10-28T09:35:42.999Z" }), row({ capturedAt: declared }), row({ capturedAt: undefined })]);
  assert.deepEqual(periods.map(p => p.ranks[2].rows[0].settled), [1, 1, 1]);
  for (const [n, sample] of [[49, "TOO EARLY"], [50, "EARLY"], [149, "EARLY"], [150, "DEVELOPING"], [299, "DEVELOPING"], [300, "MEANINGFUL"]] as const)
    assert.equal(phase(Array.from({ length: n }, () => row())).ranks[2].rows[0].sample, sample);
});
test("immutable capture ledger reuses existing helper state, preserves cohorts and never backfills", async () => {
  const directory = await mkdtemp(join(tmpdir(), "chase-speed-shadow-"));
  try {
    const metrics = calculateHorseMetricsAsOf({ runs: [], beforeDateTime: new Date(at) });
    const race = { raceId: "race", raceName: "Handicap Chase", raceType: "Chase", raceTypeCode: null, raceDateTime: new Date("2026-10-29T14:00:00Z"), runners: [{ runnerId: "one", metrics }] } as TodayRace;
    const input = { cohort: "primary" as const, raceId: "race", capturedAt: at, race, featureNames: ["official_rating", "official_rating_missing"], runners: [{ runnerId: "one", rank: 1, modelInputs: [100, 0] }, { runnerId: "third", rank: 3, modelInputs: [110, 0] }] };
    await freezeChaseSpeedState(input, directory, new Date(at));
    let snapshots = await loadChaseSpeedSnapshots(directory);
    assert.deepEqual(snapshots[0].runners[0].reliability, assessJumpSpeedReliability());
    assert.equal(snapshots[0].runners[0].handicap, null); // Race name alone is not structured evidence.
    assert.equal(snapshots[0].runners.length, 1);
    assert.equal(snapshots[0].runners[0].orRank, 2); // Rank 3 still participates in full-field OR ranking.
    metrics.jumpSpeedReliability = { ...assessJumpSpeedReliability(), level: "HIGH" };
    await freezeChaseSpeedState(input, directory, new Date(at));
    assert.deepEqual(await loadChaseSpeedSnapshots(directory), snapshots);
    await freezeChaseSpeedState({ ...input, capturedAt: "2026-10-27T09:00:00Z" }, directory, new Date(at));
    await freezeChaseSpeedState({ ...input, raceId: "late" }, directory, new Date("2026-10-29T14:01:00Z"));
    await freezeChaseSpeedState({ ...input, raceId: "hurdle", race: { ...race, raceType: "Hurdle", raceName: "Hurdle" } }, directory, new Date(at));
    assert.equal((await loadChaseSpeedSnapshots(directory)).length, 1);
    assert.equal(attachChaseSpeedState([row()], snapshots, "primary")[0].reliability!.level, "LOW");
    assert.equal(attachChaseSpeedState([row({ reliability: undefined })], snapshots, "price")[0].reliability, undefined);
    race.raceType = "Handicap Chase";
    await freezeChaseSpeedState({ ...input, cohort: "price" }, directory, new Date(at));
    snapshots = await loadChaseSpeedSnapshots(directory);
    assert.equal(snapshots.find(s => s.cohort === "price")!.runners[0].handicap, true);
    assert.equal(attachChaseSpeedState([row({ runnerId: "other", reliability: undefined })], snapshots, "primary")[0].reliability, undefined);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test("compact UI separates chronology and price cohort, exposes all fixed contexts with no exclusion", () => {
  const html = renderToStaticMarkup(<ChaseSpeedReliabilityShadow observations={[row()]} priceObservations={[]} />);
  for (const text of ["Chase Speed Reliability — Research Watch", "No exclusion rule applied", "POST-DECLARATION", "PRE-DECLARATION", "CHASE TISSUE RANK 1", "CHASE TISSUE RANK 2", "CHASE TOP 2", "Mean Tissue p", "Value ROI", "OR rank", "Model/market ratio", "TOO EARLY"]) assert.ok(html.includes(text), text);
});
