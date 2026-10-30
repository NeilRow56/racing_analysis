import assert from "node:assert/strict";
import { test } from "node:test";
import { AW_WINTER_PERIODS, CHASE_WINTER_PERIODS, WINTER_QUESTIONS, WINTER_STATUSES, inWinterPeriod, summarizeWinterResearch, type WinterObservation } from "./winter-research";

function row(overrides: Partial<WinterObservation> = {}): WinterObservation {
  return { family: "AW", tissueRank: 1, probability: .25, capturedPrice: null, bestL3SpeedRank: 1,
    scheduledOff: "2026-10-28T14:00:00.000Z", capturedAt: "2026-10-28T10:00:00.000Z",
    handicapFrozen: null, orFrozen: null, recency: null,
    outcome: { status: "settled", finishPosition: 1, resultStatus: "finished", winner: true,
      deadHeatDivisor: 1, grossReturn: null, profitLoss: null, settledAt: "2026-10-28T15:00:00.000Z" }, ...overrides };
}
const loss = { ...row().outcome!, finishPosition: null, resultStatus: "pulled_up", winner: false };
const reliability = (level: "HIGH" | "MEDIUM" | "LOW") => ({ level, relevantJumpRuns: 2, windowRuns: 3, nonJumpRuns: 0, reason: "Frozen" });

test("AW, Hurdle and Chase summaries keep fixed statuses and separate model/price denominators", () => {
  const primary = [row(), row({ outcome: loss, tissueRank: 2 }), row({ family: "HURDLE" }), row({ family: "CHASE", outcome: loss }),
    row({ outcome: null }), row({ outcome: { ...loss, status: "NR" } }), row({ outcome: { ...loss, status: "void" } }),
    row({ family: "TURF" }), row({ tissueRank: 3 })];
  const prices = [row({ probability: .1, capturedPrice: 10, outcome: { ...row().outcome!, profitLoss: 4, deadHeatDivisor: 2 } })];
  const before = structuredClone({ primary, prices });
  const s = summarizeWinterResearch(primary, prices);
  assert.deepEqual(s.cards.map(c => [c.label, c.settled, c.winners, c.modelExpected, c.actualModelExpected, c.status]),
    [["AW", 2, 1, .5, 2, "KEEP"], ["HURDLE", 1, 1, .25, 4, "KEEP"], ["CHASE", 1, 0, .25, 0, "INVESTIGATE"]]);
  assert.equal(s.cards[0].strikeRate, .5);
  assert.equal(s.cards[0].price.priceN, 1);
  assert.equal(s.cards[0].price.roi, 4); // Canonical dead-heat return, never price - 1.
  assert.equal(s.cards[1].price.roi, null);
  assert.deepEqual({ primary, prices }, before);
  assert.deepEqual(WINTER_STATUSES, { AW: "KEEP", HURDLE: "KEEP", CHASE: "INVESTIGATE" });
});

test("red and exact non-red complement cover only winter Top 2; missing Speed remains visible", () => {
  const s = summarizeWinterResearch([row({ bestL3SpeedRank: 2 }), row({ tissueRank: 2, bestL3SpeedRank: 3 }),
    row({ bestL3SpeedRank: null, outcome: loss }), row({ bestL3SpeedRank: undefined }), row({ bestL3SpeedRank: 4 }),
    row({ family: "TURF", bestL3SpeedRank: 2 })], []);
  assert.equal(s.red[0].settled, 2);
  assert.equal(s.red[1].settled, 3);
  assert.equal(s.red[6].settled, 2);
  assert.equal(s.red[7].settled, 3);
  assert.equal(s.missingSpeed[0].settled, 2);
  assert.equal(s.missingSpeed[0].winners, 1);
  assert.equal(s.missingSpeed[0].actualModelExpected, 2);
  assert.equal(s.missingSpeed[1].actualModelExpected, null);
});

test("Chase reliability, ranks, race type and OR bins preserve unclassified coverage", () => {
  const chase = (overrides: Partial<WinterObservation>) => row({ family: "CHASE", ...overrides });
  const rows = [chase({ reliability: reliability("HIGH"), handicapFrozen: true, orFrozen: 1 }),
    chase({ reliability: reliability("MEDIUM"), handicapFrozen: false, orFrozen: 2, tissueRank: 2 }),
    chase({ reliability: reliability("LOW"), orFrozen: 4 }), chase({ orFrozen: null })];
  const s = summarizeWinterResearch(rows, []);
  assert.deepEqual(s.chaseReliability.map(r => [r.label, r.settled]), [["HIGH", 1], ["MEDIUM", 1], ["LOW", 1], ["MEDIUM/LOW", 2], ["Unclassified reliability", 1]]);
  assert.deepEqual(s.chaseRank.map(r => r.settled), [3, 1]);
  assert.deepEqual(s.chaseRaceType.map(r => r.settled), [1, 1, 2]);
  assert.deepEqual(s.chaseOr.map(r => r.settled), [1, 1, 1, 1]);
  assert.equal(s.chaseChronology[5].high.settled, 1);
  assert.equal(s.chaseChronology[5].mediumLow.settled, 2);
  assert.equal(s.chaseChronology[0].high.actualModelExpected, null);
});

test("longer-price uses genuine finite price >6 and the Value population for every metric", () => {
  const prices = [row({ capturedPrice: 6 }), row({ capturedPrice: 6.01, probability: .1, outcome: { ...loss, profitLoss: -1 } }),
    row({ capturedPrice: Infinity }), row({ capturedPrice: NaN }), row({ capturedPrice: null }), row({ capturedPrice: 1 }),
    row({ capturedPrice: 8, tissueRank: 3 }), row({ capturedPrice: 8, outcome: null }),
    row({ capturedPrice: 9, outcome: { ...row().outcome!, profitLoss: null } })];
  const s = summarizeWinterResearch([row({ capturedPrice: 20 })], prices);
  assert.equal(s.longerPrice[0].settled, 2);
  assert.equal(s.longerPrice[0].winners, 1);
  assert.equal(s.longerPrice[0].modelExpected, .35);
  assert.equal(s.longerPrice[0].price.priceN, 1);
  assert.equal(s.longerPrice[0].price.roi, -1);
  assert.equal(s.aw.at(-1)!.settled, 1);
  assert.equal(s.aw.at(-2)!.settled, 2);
});

test("fixed chronology keeps exact inclusive/exclusive cuts without re-optimizing", () => {
  assert.equal(CHASE_WINTER_PERIODS[2].end, "2026-10-22T15:53:00.000Z");
  assert.equal(CHASE_WINTER_PERIODS[3].end, "2026-10-25T12:32:00.000Z");
  assert.equal(CHASE_WINTER_PERIODS[4].end, "2026-10-27T15:31:00.000Z");
  const boundary = row({ scheduledOff: "2026-10-25T12:32:00.000Z", family: "CHASE" });
  assert.equal(inWinterPeriod(boundary, CHASE_WINTER_PERIODS[3]), false);
  assert.equal(inWinterPeriod(boundary, CHASE_WINTER_PERIODS[4]), true);
  assert.equal(inWinterPeriod(row({ scheduledOff: "2026-10-26T16:30:00.000Z" }), AW_WINTER_PERIODS[0]), false);
  const recent = summarizeWinterResearch([row({ bestL3SpeedRank: 2, scheduledOff: "2026-10-27T15:39:59.000Z" }),
    row({ bestL3SpeedRank: 2, scheduledOff: "2026-10-27T15:40:00.000Z" })], []);
  assert.equal(recent.recentRed[0].settled, 1);
  const future = row({ scheduledOff: "2027-01-01T12:00:00.000Z", family: "CHASE" });
  assert.equal(summarizeWinterResearch([boundary, future], []).chaseChronology[4].settled, 1);
  assert.equal(summarizeWinterResearch([boundary, future], []).chaseChronology[5].settled, 1);
});

test("three research questions retain exact labels and wording", () => {
  assert.deepEqual(WINTER_QUESTIONS, [
    ["RED WATCH", "Does Best L3 Speed rank 2–3 continue to underperform its complement?"],
    ["CHASE SPEED RELIABILITY", "Does Chase MEDIUM/LOW reliability continue to underperform HIGH reliability?"],
    ["HURDLE RECENCY", "Does latest-run PU/non-completion remain weaker than recent completion?"],
  ]);
});
