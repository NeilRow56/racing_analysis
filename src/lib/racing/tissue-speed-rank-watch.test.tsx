import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { frozenBestL3SpeedRanks, isTissueTop2SpeedRankWatch } from "./tissue-speed-rank-watch";
import { summarizeTissueSpeedRankWatch, TISSUE_SPEED_RANK_WATCH_START } from "./tissue-speed-rank-watch-summary";
import { summarizeProspectiveTissue, type ProspectiveTissueObservation } from "./tissue-prospective-summary";
import { VALUE_COHORTS } from "./tissue-value-config";
import { settleSelection } from "./backtest";
import { TissueSpeedRankWatch } from "../../app/racing/research/forward-value/tissue-speed-rank-watch";

for (const [tissueRank, bestL3SpeedRank, expected] of [
  [1, 2, true], [1, 3, true], [2, 2, true], [2, 3, true],
  [1, 1, false], [2, 4, false], [3, 2, false], [1, null, false], [2, undefined, false],
  [null, 2, false], [1, NaN, false], [1, 2.5, false],
] as const) test(`Tissue ${tissueRank} / Best L3 ${bestL3SpeedRank}: ${expected ? "watch" : "normal"}`, () => {
  assert.equal(isTissueTop2SpeedRankWatch({ tissueRank, bestL3SpeedRank }), expected);
});

function vector(names: readonly string[], speed: number | null) {
  const values = names.map(() => 0), name = names.includes("best_l3_jump_speed") ? "best_l3_jump_speed" : "best_l3_turf_speed";
  values[names.indexOf(name)] = speed ?? 0; values[names.indexOf(`${name}_missing`)] = speed === null ? 1 : 0;
  return values;
}
test("all families reuse frozen Best L3 competition ranks, ties and missing flags", () => {
  for (const config of VALUE_COHORTS) {
    const runners = [100, 100, 90, null, 0].map((speed, i) => ({ runnerId: String(i), modelInputs: vector(config.featureNames, speed) }));
    const before = JSON.stringify(runners);
    assert.deepEqual([...frozenBestL3SpeedRanks(config.family, config.featureNames, runners)], [["0", 1], ["1", 1], ["2", 3], ["4", 4]]);
    // Later outcomes cannot remove a captured runner or promote a rank after NR.
    Object.assign(runners[0], { outcome: { status: "NR" } });
    assert.equal(frozenBestL3SpeedRanks(config.family, config.featureNames, runners).get("2"), 3);
    delete (runners[0] as typeof runners[0] & { outcome?: unknown }).outcome;
    assert.equal(JSON.stringify(runners), before);
    const broken = runners.map(r => ({ ...r })); broken[0].modelInputs = [];
    assert.equal(frozenBestL3SpeedRanks(config.family, config.featureNames, broken).size, 0);
    assert.equal(frozenBestL3SpeedRanks(config.family, undefined, runners).size, 0);
    const nonfinite = runners.map(r => ({ ...r, modelInputs: [...r.modelInputs] }));
    nonfinite[0].modelInputs[config.featureNames.indexOf(config.family === "HURDLE" || config.family === "CHASE" ? "best_l3_jump_speed" : "best_l3_turf_speed")] = NaN;
    assert.equal(frozenBestL3SpeedRanks(config.family, config.featureNames, nonfinite).size, 0);
  }
});

function row(overrides: Partial<ProspectiveTissueObservation> = {}): ProspectiveTissueObservation {
  return { family: "TURF", tissueRank: 1, bestL3SpeedRank: 2, probability: .2, capturedPrice: 5,
    outcome: { status: "settled", finishPosition: 2, resultStatus: "finished", winner: false, deadHeatDivisor: 1, grossReturn: 0, profitLoss: -1, settledAt: "2026-10-23T18:00:00Z" }, ...overrides };
}
const pooled = (rows: ReturnType<typeof summarizeProspectiveTissue>) => rows[2].rows.at(-1)!;
test("shadow uses only top-2 Speed 2/3, preserving canonical results, pending, NR, void and missing prices", () => {
  const canonical = settleSelection({ targetRaceId: "race", targetRunnerId: "runner", finishingPosition: 1, resultStatus: "finished", won: true, placed: null,
    startingPrice: null, startingPriceDecimal: "6", deadHeatDivisor: 2 })!;
  const win = row({ capturedPrice: 6, probability: .3, outcome: { ...row().outcome!, finishPosition: 1, winner: true, deadHeatDivisor: 2,
    grossReturn: canonical.grossReturn, profitLoss: canonical.profitLoss } });
  const missingPrice = row({ tissueRank: 2, bestL3SpeedRank: 3, capturedPrice: null, probability: .1, outcome: { ...win.outcome!, profitLoss: null, grossReturn: null } });
  const rows = [win, row(), missingPrice, row({ outcome: null }),
    row({ outcome: { ...row().outcome!, status: "NR", winner: null, profitLoss: null } }), row({ outcome: { ...row().outcome!, status: "void", winner: null, profitLoss: null } }),
    row({ bestL3SpeedRank: 1 }), row({ bestL3SpeedRank: 4 }), row({ bestL3SpeedRank: null }), row({ tissueRank: 3 })];
  const before = JSON.stringify(rows), s = summarizeTissueSpeedRankWatch(rows), m = pooled(s.watch);
  assert.equal(m.captured, 6); assert.equal(m.settled, 3); assert.equal(m.winners, 2);
  assert.ok(Math.abs(m.modelExpected - .6) < 1e-12); assert.equal(m.priceN, 2);
  assert.equal(m.profitLoss, canonical.profitLoss - 1); assert.equal(m.roi, (canonical.profitLoss - 1) / 2);
  assert.equal(pooled(s.complement).captured, 3); assert.equal(s.missingSpeedRank, 1);
  assert.equal(pooled(s.watch).captured + pooled(s.complement).captured, pooled(summarizeProspectiveTissue(rows)).captured);
  assert.equal(JSON.stringify(rows), before);
});
test("family splits and each Tissue rank reconcile to the unchanged baseline", () => {
  const rows = VALUE_COHORTS.flatMap(({ family }) => [row({ family }), row({ family, tissueRank: 2, bestL3SpeedRank: 3 }), row({ family, bestL3SpeedRank: 1 }), row({ family, tissueRank: 2, bestL3SpeedRank: null })]);
  const s = summarizeTissueSpeedRankWatch(rows), base = summarizeProspectiveTissue(rows);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 5; j++) {
    const watch = s.watch[i].rows[j], control = s.complement[i].rows[j], all = base[i].rows[j];
    for (const key of ["captured", "settled", "winners", "priceN", "modelExpected"] as const) assert.ok(Math.abs(watch[key] + control[key] - all[key]) < 1e-12);
  }
  assert.equal(TISSUE_SPEED_RANK_WATCH_START, "2026-10-20");
});
test("compact shadow panel labels two populations, complement, missing ranks and discovery period", () => {
  const html = renderToStaticMarkup(<TissueSpeedRankWatch observations={[row({ capturedPrice: null })]} priceObservations={[row({ tissueRank: 2, bestL3SpeedRank: 3 })]} />);
  for (const label of ["Best L3 Speed Rank 2–3 — Research Watch", "TISSUE RANK 1", "TISSUE RANK 2", "TISSUE TOP 2", "Turf", "AW", "Hurdle", "Chase", "All families",
    "Separate Value cohort", "NOT 2–3 (includes missing)", "no exclusion rule applied", "2026-10-20", "2026-10-24", "discovery context", "Jump Speed reliability remains separate", "Price n", "Captured-price P/L"])
    assert.ok(html.includes(label), label);
  assert.equal((html.match(/<table/g) ?? []).length, 6);
  assert.ok(!html.includes('<details class="mt-2" open'));
});
