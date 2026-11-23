import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateAwNoHoperField } from "./aw-no-hoper-policy";

const field = [
  { runnerId: "a", capturedPrice: 12, frozenScore: 2, scoreWithoutSameOr: 0.6, latestAwPerformance: 65 },
  { runnerId: "b", capturedPrice: 15, frozenScore: 1.8, scoreWithoutSameOr: 0.5, latestAwPerformance: null },
  { runnerId: "c", capturedPrice: 3, frozenScore: 1.4, scoreWithoutSameOr: 1.4, latestAwPerformance: 72 },
  { runnerId: "d", capturedPrice: 4, frozenScore: 1.3, scoreWithoutSameOr: 1.3, latestAwPerformance: 65 },
  { runnerId: "e", capturedPrice: 5, frozenScore: 1, scoreWithoutSameOr: 1, latestAwPerformance: 68 },
];

test("keeps a flagged outsider with tied top-three AW performance and excludes an unsupported T2", () => {
  assert.deepEqual(evaluateAwNoHoperField(field), [
    { runnerId: "a", tissueRank: 1, marketRank: 4, rankWithoutSameOr: 4, latestAwPerformanceRank: 3, flagged: true, exclude: false },
    { runnerId: "b", tissueRank: 2, marketRank: 5, rankWithoutSameOr: 5, latestAwPerformanceRank: null, flagged: true, exclude: true },
  ]);
});

test("requires a decisive positive contribution and a verified complete board", () => {
  const altered = field.map(r => ({ ...r }));
  altered[0].scoreWithoutSameOr = 2.01;
  altered[1].scoreWithoutSameOr = 1.81;
  assert.deepEqual(evaluateAwNoHoperField(altered)?.map(r => r.flagged), [false, false]);
  altered[0].scoreWithoutSameOr = 1.99;
  assert.equal(evaluateAwNoHoperField(altered)?.[0].flagged, false);
  altered[4].capturedPrice = Number.NaN;
  assert.equal(evaluateAwNoHoperField(altered), null);
  assert.throws(() => evaluateAwNoHoperField([...field, field[0]]), /Invalid/);
});
