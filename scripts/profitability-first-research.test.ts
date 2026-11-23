import assert from "node:assert/strict";
import { test } from "node:test";
import { choose, prepare } from "./profitability-first-research";

const market = [
  { id: "first", price: 1.5, or: 90, speed: 101, recent: 99, prior: 10, tissue: .55, tissueRank: 1 },
  { id: "second", price: 4, or: 85, speed: 96, recent: 97, prior: 6, tissue: .20, tissueRank: 2 },
  { id: "outsider", price: 20, or: 98, speed: 104, recent: 103, prior: 8, tissue: .25, tissueRank: 3 },
];

test("an overround book with zero form tilt produces no B or C selection", () => {
  const result = choose(market.map(r => ({ ...r, price: r.id === "second" ? 2 : r.price })), [0, 0, 0], false);
  assert.equal(result.a, null);
  assert.equal(result.b, null);
  assert.equal(result.c, null);
  assert.ok(Math.abs(result.bForecast.reduce((total, p) => total + p, 0) - 1) < 1e-14);
});

test("supported outsiders can qualify outside Tissue ranks 1 and 2", () => {
  const result = choose(market, [1, 1, 0], true);
  assert.equal(market[result.b!.index].id, "outsider");
  assert.equal(market[result.c!.index].id, "outsider");
  assert.equal(result.a, null);
  assert.ok(result.c!.utility! > 0);
});

test("missing Speed is neutral in the market tilt and only frozen T2 is eligible for A", () => {
  const offers = market.map(r => r.id === "second" ?
    { ...r, price: 9, tissue: .30, speed: null, recent: null } : r);
  assert.equal(prepare(offers).x[1][0], 0);
  const result = choose(offers, [0, 0, 0], true);
  assert.equal(result.a?.index, 1);
  assert.ok(Math.abs(result.aForecast!.reduce((sum, p) => sum + p, 0) - 1) < 1e-14);
  assert.equal(choose(offers, [0, 0, 0], false).a, null);
});
