import assert from "node:assert/strict";
import { test } from "node:test";
import { marketFavourite, marketPriceBand, safeMarketCapture, shortMarketPriceBand, summarizeMarketSelections, type MarketAuditSelection } from "./ranking-market-audit";

const row = (price: number, won: boolean, modelProbability: number | null = .4): MarketAuditSelection => ({ family: "Turf", model: "test", cohort: "frozen_forward", basis: "final_sp", raceId: String(price), raceDate: "2026-01-01", runnerId: "a", won, price, modelProbability, confidence: "LOW", favourite: "unknown", capturedAt: null });

test("sums individual market probabilities and handles missing model probabilities", () => {
  const result = summarizeMarketSelections([row(2, true), row(4, false, null)]);
  assert.equal(result.marketExpectedWinners, .75);
  assert.equal(result.marketExpectedStrike, .375);
  assert.equal(result.ae, 4 / 3);
  assert.equal(result.actualMinusExpectedWinners, .25);
  assert.equal(result.medianPrice, 3);
  assert.equal(result.modelExpectedWinners, null);
  assert.equal(summarizeMarketSelections([]).ae, null);
});

test("price bands respect fractional-to-decimal boundaries", () => {
  assert.deepEqual([1.99, 2, 3, 5, 9].map(marketPriceBand), ["odds-on", "evens to <2/1", "2/1 to <4/1", "4/1 to <8/1", "8/1+"]);
  assert.deepEqual([1.99, 2, 2.5, 3].map(shortMarketPriceBand), ["odds-on", "evens to <6/4", "6/4 to <2/1", null]);
});

test("keeps price bases separate and rejects invalid prices", () => {
  assert.throws(() => summarizeMarketSelections([row(2, true), { ...row(3, false), basis: "prospective_median" }]));
  assert.throws(() => summarizeMarketSelections([row(Infinity, false)]));
});

test("capture chronology excludes at-off, after-off and before-prediction quotes", () => {
  const recorded = "2026-01-01T10:00:00Z", off = "2026-01-01T12:00:00Z";
  assert.equal(safeMarketCapture(recorded, recorded, off), true);
  assert.equal(safeMarketCapture(off, recorded, off), false);
  assert.equal(safeMarketCapture("2026-01-01T09:00:00Z", recorded, off), false);
  assert.equal(safeMarketCapture(null, recorded, off), false);
});

test("favourites require a complete field and distinguish ties", () => {
  assert.equal(marketFavourite("a", [{ runnerId: "a", price: 2 }, { runnerId: "b", price: 2 }]), "joint_favourite");
  assert.equal(marketFavourite("a", [{ runnerId: "a", price: 2 }, { runnerId: "b", price: 3 }]), "favourite");
  assert.equal(marketFavourite("b", [{ runnerId: "a", price: 2 }, { runnerId: "b", price: 3 }]), "not_favourite");
  assert.equal(marketFavourite("a", [{ runnerId: "a", price: 2 }, { runnerId: "b", price: null }]), "unknown");
});
