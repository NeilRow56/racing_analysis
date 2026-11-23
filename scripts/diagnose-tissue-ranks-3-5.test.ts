import assert from "node:assert/strict";
import { test } from "node:test";
import { hasAllRanks, matchedRaces, metrics, robustness, type Book, type Pick } from "./diagnose-tissue-ranks-3-5";
import { CANONICAL_SETTLEMENT_VERSION, LEGACY_SETTLEMENT_VERSION } from "../src/lib/racing/research-settlement-version";

const date = "2026-11-12";
function pick(overrides: Partial<Pick> = {}): Pick {
  return {
    rank: 1, probability: .2, market: .25, price: 5, marketRank: 1, raceDate: date, raceId: "a", runnerId: "runner", course: "Fixture", horseName: "Runner",
    outcome: {
      settlementVersion: CANONICAL_SETTLEMENT_VERSION, status: "settled", winner: false, finishPosition: 2,
      resultStatus: "finished", deadHeatDivisor: 1, grossReturn: 0, profitLoss: -1, settledAt: date,
    },
    ...overrides,
  };
}
const win = (gross: number, divisor = 1): NonNullable<Pick["outcome"]> => ({
  ...pick().outcome!, winner: true, finishPosition: 1, deadHeatDivisor: divisor, grossReturn: gross, profitLoss: gross - 1,
});

test("rank metrics align expected winners and stakes with their own eligible samples", () => {
  const legacy = { ...pick().outcome!, settlementVersion: LEGACY_SETTLEMENT_VERSION };
  const rows = [
    pick({ outcome: win(2.5, 2) }), pick({ price: 3 }), pick({ price: 9, outcome: legacy }),
    pick({ price: null, market: null, outcome: { ...win(0), profitLoss: null } }),
    pick({ price: 11, outcome: { ...pick().outcome!, profitLoss: null } }),
    pick({ outcome: null }), pick({ outcome: { ...pick().outcome!, status: "NR" } }),
    pick({ outcome: { ...pick().outcome!, status: "void" } }),
  ];
  const m = metrics(rows);
  assert.equal(m.captured, 8);
  assert.equal(m.settled, 5);
  assert.equal(m.winners, 2);
  assert.equal(m.strike, .4);
  assert.equal(m.modelExpected, 1);
  assert.equal(m.modelAE, 1.5);
  assert.equal(m.marketN, 4);
  assert.equal(m.marketExpected, 1);
  assert.equal(m.marketAE, .5);
  assert.equal(m.capturePriceN, 7);
  assert.equal(m.priced, 4);
  assert.equal(m.stakes, 2);
  assert.equal(m.profit, .5);
  assert.equal(m.roi, .25);
  assert.equal(m.averageOdds, 7);
  assert.equal(m.medianOdds, 7);
  assert.equal(metrics([pick({ outcome: null })]).roi, null);
});

test("matched race hits use the best winner rank and preserve skipped ranks and withdrawals", () => {
  const base: Book = { family: "TURF", model: "TURF_TISSUE_V4", raceId: "a", raceDate: date, capturedAt: date, scheduledOff: date, picks: [] };
  const complete = {
    ...base, picks: [pick({ rank: 1 }), pick({ rank: 2 }), pick({ rank: 3, marketRank: 6, outcome: win(2.5, 2) }),
      pick({ rank: 4, outcome: { ...pick().outcome!, status: "NR" } }), pick({ rank: 5, marketRank: 7, outcome: win(2.5, 2) })],
  };
  const incomplete = { ...base, raceId: "b", picks: [1, 1, 3, 4, 5].map(rank => pick({ rank, raceId: "b" })) };
  assert.equal(hasAllRanks(incomplete), false);
  const m = matchedRaces([complete, incomplete]);
  assert.equal(m.available, 1);
  assert.equal(m.deadHeats, 1);
  assert.deepEqual(m.distribution, [0, 0, 1, 0, 0, 0]);
  assert.deepEqual(m.hits, [0, 0, 1, 1]);
  assert.deepEqual(m.marketHits, [0, 0, 0, 0]);
  assert.equal(m.longMarketWinners, 1);
  assert.equal(m.fullSettled.length, 0);
  assert.throws(() => matchedRaces([complete, complete]), assert.AssertionError);
});

test("winner sensitivity drops all stakes from two distinct winning races", () => {
  const rows = [
    pick({ outcome: win(10) }), pick({ outcome: win(9) }), pick(),
    pick({ raceId: "b", outcome: win(6) }),
    pick({ raceId: "c", raceDate: "2026-11-13" }),
  ];
  const result = robustness(rows);
  assert.equal(result.dates, 2);
  assert.equal(result.winners, 3);
  assert.equal(result.second?.raceId, "b");
  assert.deepEqual(result.afterOne, { profit: 4, roi: 2 });
  assert.deepEqual(result.afterTwo, { profit: -1, roi: -1 });
});
