import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { settleSelection } from "./backtest";
import { summarizeProspectiveTissue, tissueProspectiveMetrics, type ProspectiveTissueObservation } from "./tissue-prospective-summary";
import { TissueProspectiveSummary } from "../../app/racing/research/forward-value/tissue-prospective-summary";

function row(rank = 1, overrides: Partial<ProspectiveTissueObservation> = {}): ProspectiveTissueObservation {
  return { family: "TURF", tissueRank: rank, probability: .25, capturedPrice: 5, outcome: {
    status: "settled", finishPosition: 2, resultStatus: "finished", winner: false, deadHeatDivisor: 1,
    grossReturn: 0, profitLoss: -1, settledAt: "2026-10-22T18:00:00.000Z",
  }, ...overrides };
}
function winner(price = 5, divisor = 1) {
  const settlement = settleSelection({ targetRaceId: "race", targetRunnerId: "runner", finishingPosition: 1, resultStatus: "finished",
    won: true, placed: null, startingPrice: null, startingPriceDecimal: String(price), deadHeatDivisor: divisor })!;
  return row(1, { capturedPrice: price, outcome: { ...row().outcome!, finishPosition: 1, winner: true, deadHeatDivisor: divisor,
    grossReturn: settlement.grossReturn, profitLoss: settlement.profitLoss } });
}

test("membership uses Tissue rank alone, including when Value rank disagrees", () => {
  const input = [{ ...row(1), valueRank: 8 }, { ...row(2), valueRank: 3 }, { ...row(3), valueRank: 2 }, { ...row(8), valueRank: 1 }];
  const sections = summarizeProspectiveTissue(input);
  assert.deepEqual(sections.map(s => s.rows.at(-1)!.captured), [1, 1, 2]);
});

test("pending, NR and void count as captured but do not enter settled metrics", () => {
  const pending = row(1, { outcome: null });
  const nr = row(2, { outcome: { ...row().outcome!, status: "NR", winner: null, profitLoss: null } });
  const voided = row(1, { outcome: { ...nr.outcome!, status: "void" } });
  const summary = tissueProspectiveMetrics([pending, nr, voided, winner(), row()]);
  assert.equal(summary.captured, 5);
  assert.equal(summary.settled, 2);
  assert.equal(summary.winners, 1);
  assert.equal(summary.strikeRate, .5);
  assert.equal(summary.modelExpected, .5);
  assert.equal(summary.actualModelExpected, 2);
  assert.equal(summary.priceN, 2);
  assert.equal(summary.profitLoss, 3);
});

test("captured-price returns use stored canonical dead-heat settlement", () => {
  const summary = tissueProspectiveMetrics([winner(6, 2), row()]);
  assert.equal(summary.winners, 1);
  assert.equal(summary.profitLoss, 1.5); // Canonical profit deduction: (6 - 1) / 2, then a losing stake
  assert.equal(summary.roi, .75);
});

test("missing, invalid and unsettled prices never become losing stakes", () => {
  const rows = [row(1, { capturedPrice: null }), row(2, { capturedPrice: 1 }), row(1, { capturedPrice: NaN }),
    row(1, { outcome: { ...row().outcome!, profitLoss: null } }), winner(5)];
  const summary = tissueProspectiveMetrics(rows);
  assert.equal(summary.settled, 5);
  assert.equal(summary.priceN, 1);
  assert.equal(summary.profitLoss, 4);
  assert.equal(summary.roi, 4);
  assert.equal(tissueProspectiveMetrics([rows[0]]).profitLoss, null);
});

test("family and pooled totals sum frozen probabilities and P/L", () => {
  const rows = (["TURF", "AW", "HURDLE", "CHASE"] as const).flatMap(family => [
    { ...winner(), family, probability: .3 }, row(2, { family, probability: .2 }),
  ]);
  const top2 = summarizeProspectiveTissue(rows)[2].rows;
  assert.deepEqual(top2.map(r => r.family), ["TURF", "AW", "HURDLE", "CHASE", "ALL"]);
  for (const family of top2.slice(0, 4)) {
    assert.equal(family.profitLoss, 3);
    assert.equal(family.modelExpected, .5);
    assert.equal(family.actualModelExpected, 2);
  }
  assert.equal(top2[4].priceN, 8);
  assert.equal(top2[4].profitLoss, 12);
  assert.equal(top2[4].roi, 1.5);
  assert.equal(top2[4].modelExpected, 2);
});

test("sample labels follow existing settled-count thresholds", () => {
  for (const [n, sample] of [[0, "TOO EARLY"], [49, "TOO EARLY"], [50, "EARLY"], [149, "EARLY"], [150, "DEVELOPING"], [299, "DEVELOPING"], [300, "MEANINGFUL"]] as const)
    assert.equal(tissueProspectiveMetrics(Array.from({ length: n }, () => row())).sample, sample);
});

test("compact panel renders all three tables, families, price sample and pooled caveat", () => {
  const html = renderToStaticMarkup(<TissueProspectiveSummary observations={[winner(), row(2)]} priceObservations={[winner(), row(2)]} />);
  for (const label of ["TISSUE RANK 1", "TISSUE RANK 2", "TISSUE TOP 2", "Captured", "Price n", "Captured-price P/L", "ROI", "Model exp.", "Actual/model", "Turf", "AW", "Hurdle", "Chase", "All families", "+£4.00", "−£1.00", "descriptive pool", "TOO EARLY"])
    assert.ok(html.includes(label), label);
  assert.equal((html.match(/<table/g) ?? []).length, 3);
  assert.ok(renderToStaticMarkup(<TissueProspectiveSummary observations={[]} />).includes("—"));
});
