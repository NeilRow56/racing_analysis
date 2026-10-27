import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { summarizeTissueInputReliability, summarizeTissueReliabilityInteraction, summarizeTissueReliabilityChronology } from "./tissue-input-reliability-summary";
import { summarizeProspectiveTissue, type ProspectiveTissueObservation } from "./tissue-prospective-summary";
import { TISSUE_VALUE_FAMILIES } from "./tissue-value-metrics";
import { settleSelection } from "./backtest";
import { TissueInputReliabilityWatch } from "../../app/racing/research/forward-value/tissue-input-reliability";
const row = (overrides: Partial<ProspectiveTissueObservation> = {}): ProspectiveTissueObservation => ({ family: "TURF", tissueRank: 1, probability: .2, capturedPrice: 6,
  raceId: "race", capturedAt: "2026-10-21T08:00:00.000Z", bestL3SpeedRank: 2, inputReliability: { level: "GOOD", reasons: [] },
  outcome: { status: "settled", finishPosition: 2, resultStatus: "finished", winner: false, deadHeatDivisor: 1, grossReturn: 0, profitLoss: -1, settledAt: "2026-10-21T18:00:00.000Z" }, ...overrides });
const caution = { level: "CAUTION", reasons: ["Missing Turf performance inputs."] } as const;
const pooled = (ranks: ReturnType<typeof summarizeProspectiveTissue>) => ranks[2].rows.at(-1)!;

test("rank, family and reliability partitions reconcile; probabilities and canonical settlements remain intact", () => {
  const canonical = settleSelection({ targetRaceId: "race", targetRunnerId: "runner", finishingPosition: 1, resultStatus: "finished", won: true, placed: null,
    startingPrice: null, startingPriceDecimal: "6", deadHeatDivisor: 2 })!;
  const win = row({ probability: .3, outcome: { ...row().outcome!, finishPosition: 1, winner: true, deadHeatDivisor: 2, grossReturn: canonical.grossReturn, profitLoss: canonical.profitLoss } });
  const rows = [win, row({ tissueRank: 2, capturedPrice: null, probability: .1, outcome: { ...win.outcome!, profitLoss: null, grossReturn: null } }), row({ outcome: null }),
    row({ outcome: { ...row().outcome!, status: "NR", winner: null, profitLoss: null } }),row({ outcome: { ...row().outcome!, status: "void", winner: null, profitLoss: null } }),
    row({ tissueRank: 3 }),row({ tissueRank: 2, inputReliability: { ...caution, reasons: [...caution.reasons] } }),row({ inputReliability: undefined })];
  const before = JSON.stringify(rows), groups = summarizeTissueInputReliability(rows), good = pooled(groups[0].ranks);
  assert.equal(good.captured, 5); assert.equal(good.settled, 2); assert.equal(good.winners, 2); assert.ok(Math.abs(good.modelExpected - .4) < 1e-12);
  assert.equal(good.priceN, 1); assert.equal(good.profitLoss, canonical.profitLoss); assert.equal(good.roi, canonical.profitLoss);
  assert.equal(pooled(groups[1].ranks).settled, 1); assert.equal(pooled(groups[2].ranks).settled, 1);
  const all = summarizeProspectiveTissue(rows);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 5; j++) for (const k of ["captured", "settled", "winners", "modelExpected", "priceN"] as const)
    assert.ok(Math.abs(groups.reduce((sum, g) => sum + g.ranks[i].rows[j][k], 0) - all[i].rows[j][k]) < 1e-12);
  assert.equal(JSON.stringify(rows), before);
});

test("all four racing families, both ranks, missing metadata and independent 2x2 groups", () => {
  const rows = TISSUE_VALUE_FAMILIES.flatMap(family => [row({ family }),row({ family, tissueRank: 2, bestL3SpeedRank: 4 }),
    row({ family, tissueRank: 2, inputReliability: { ...caution, reasons: [...caution.reasons] } }),row({ family, bestL3SpeedRank: null, inputReliability: { ...caution, reasons: [...caution.reasons] } })]);
  const groups = summarizeTissueInputReliability(rows);
  assert.equal(pooled(groups[0].ranks).captured, 8); assert.equal(pooled(groups[1].ranks).captured, 8);
  for (let i = 0; i < 4; i++) { assert.equal(groups[0].ranks[0].rows[i].captured, 1); assert.equal(groups[1].ranks[1].rows[i].captured, 1); }
  const interaction = summarizeTissueReliabilityInteraction(rows);
  for (const g of interaction.filter(g => g.level !== "UNKNOWN")) assert.equal(pooled(g.ranks).captured, 4);
  assert.equal(summarizeTissueInputReliability([row({ inputReliability: undefined })])[2].ranks[0].rows[0].captured, 1);
});

test("chronology splits distinct race captures, not runner/outcome counts; ties and unknown clocks remain explicit", () => {
  const rows = [row({ raceId: "early" }),row({ raceId: "early", tissueRank: 2 }),row({ raceId: "middle", capturedAt: "2026-10-22T08:00:00.000Z" }),
    row({ raceId: "late", capturedAt: "2026-10-23T08:00:00.000Z", outcome: null }),row({ capturedAt: undefined })];
  const s = summarizeTissueReliabilityChronology(rows);
  assert.equal(s.boundary, "2026-10-22T08:00:00.000Z");
  assert.deepEqual(s.windows.map(w => pooled(w.groups[0].ranks).captured), [2, 2, 1]);
  assert.deepEqual(s.windows.map(w => pooled(w.groups[0].ranks).settled), [2, 1, 1]);
  const changedResults = rows.map(r => ({ ...r, outcome: null }));assert.equal(summarizeTissueReliabilityChronology(changedResults).boundary, s.boundary);
  assert.throws(() => summarizeTissueReliabilityChronology([row(),row({ capturedAt: "2026-10-22T08:00:00.000Z" })]), /Inconsistent/);
});

test("compact panel labels primary vs money populations, unknowns, discovery and capture chronology", () => {
  const html = renderToStaticMarkup(<TissueInputReliabilityWatch observations={[row({ capturedPrice: null })]} priceObservations={[row({ inputReliability: { ...caution, reasons: [...caution.reasons] } })]} />);
  for (const label of ["Tissue Input Reliability — Research Watch", "GOOD", "CAUTION", "UNKNOWN", "TISSUE RANK 1", "TISSUE RANK 2", "TISSUE TOP 2", "Turf", "AW", "Hurdle", "Chase", "All families", "Actual/model first", "Separate Value cohort", "NON-WATCH + GOOD", "WATCH + CAUTION", "EARLIER HALF", "LATER HALF", "UNKNOWN CAPTURE TIME", "2026-10-27", "discovery context", "all market ratios", "No exclusion rule", "Price n", "Captured-price P/L"]) assert.ok(html.includes(label), label);
  assert.ok(!/<details[^>]*\bopen\b/.test(html));
});
