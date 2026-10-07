import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { marketBook, quality, residualBook, selective, timestampsSafe, UPLIFT_BANDS, type Race } from "./diagnose-market-residual";

describe("market residual diagnostic", () => {
  test("normalises bookmaker overround and rejects incomplete books", () => {
    marketBook([2, 3, 4]).forEach((p, i) => assert.ok(Math.abs(p - [6 / 13, 4 / 13, 3 / 13][i]!) < 1e-12));
    assert.throws(() => marketBook([2]));
    assert.throws(() => marketBook([2, NaN]));
    assert.throws(() => marketBook([1, 3]));
  });
  test("zero residual exactly retains baseline and a common shift cancels", () => {
    const market = marketBook([2, 3, 4]);
    for (const adjustment of [[0, 0, 0], [5, 5, 5]]) {
      residualBook(market, adjustment).forEach((p, i) => assert.ok(Math.abs(p - market[i]!) < 1e-12));
    }
    const adjusted = residualBook(market, [1, 0, 0]);
    assert.ok(adjusted[0]! > market[0]!);
    assert.ok(Math.abs(adjusted.reduce((a, b) => a + b, 0) - 1) < 1e-12);
    assert.throws(() => residualBook([0.5, 0.5], [0]));
  });
  test("rejects late prices and prediction timestamps, accepts equal capture/prediction", () => {
    const off = "2026-10-01T12:00:00Z", pre = "2026-10-01T11:00:00Z";
    assert.equal(timestampsSafe(pre, pre, off, off), true);
    assert.equal(timestampsSafe(off, pre, off, off), false);
    assert.equal(timestampsSafe(pre, off, off, off), false);
    assert.equal(timestampsSafe("invalid", pre, off, off), false);
    assert.equal(timestampsSafe(pre, pre, off, pre), false);
  });
  const races: Race[] = [{ id: "r1", date: "2026-10-01", capturedAt: "", predictedAt: "", overround: 1.1, runners: [
    { id: "a", odds: 2, market: 0.5, tissue: 0.625, won: true },
    { id: "b", odds: 2, market: 0.5, tissue: 0.375, won: false },
  ] }, { id: "r2", date: "2026-10-02", capturedAt: "", predictedAt: "", overround: 1, runners: [
    { id: "c", odds: 4, market: 0.25, tissue: 0.375, won: false },
    { id: "d", odds: 4 / 3, market: 0.75, tissue: 0.625, won: true },
  ] }];
  test("uses race-level categorical log loss and Brier", () => {
    assert.ok(Math.abs(quality(races, "market").logLoss! - (-Math.log(0.5) - Math.log(0.75)) / 2) < 1e-12);
    assert.ok(Math.abs(quality(races, "market").brier! - (0.5 + 0.125) / 2) < 1e-12);
    assert.throws(() => quality([{ ...races[0]!, runners: races[0]!.runners.map((r) => ({ ...r, won: false })) }], "market"));
  });
  test("fixed bands include all qualifiers and use captured odds for ROI", () => {
    assert.deepEqual(UPLIFT_BANDS, [0.025, 0.05, 0.075, 0.1]);
    const m = selective(races, 0.125);
    assert.equal(m.qualifiers, 2);
    assert.equal(m.races, 2);
    assert.equal(m.roi, 0);
    assert.equal(m.marketAE, 1 / 0.75);
    assert.equal(m.maximumLosing, 1);
    assert.equal(m.noQualifier, 0);
    assert.equal(selective(races, 0.2).noQualifier, 1);
    assert.equal(selective(races, 0.2).roi, null);
  });
});
