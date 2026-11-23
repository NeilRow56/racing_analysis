import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { finalSp, historyFamily, reconcileHistoryRace, type DatasetRace, type DbRace } from "../../../scripts/build-full-history-profitability";
import definitions from "../../../docs/full-history-profitability-parameters-v1.json";
import { FULL_HISTORY_V1, IndependentRaceHistory, predictFullHistoryV1 } from "./full-history-profitability";

type Fixture = {
  model: string; dataset: string; repairHistory: { prior: string; target: string; horse: string }; deadHeat: string; nonterminal: string;
  raw: DbRace[]; fixtures: (Pick<DatasetRace, "race" | "source" | "features" | "quotes" | "quoteAt"> & {
    expected: Record<"A" | "B" | "C" | "D", { id: string }[]>;
  })[];
};
const fixture = JSON.parse(await readFile(new URL("../../../scripts/fixtures/full-history-profitability-v1.json", import.meta.url), "utf8")) as Fixture;
const weights = definitions.content.parameters;
const bySource = new Map(fixture.raw.map(r => [r.source, r]));
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-12, `${a} differs from ${b}`);
function trusted(source: string) {
  const row = bySource.get(source);
  assert.ok(row);
  const result = reconcileHistoryRace(row, historyFamily(row));
  assert.ok(result.race && result.outcomes);
  return result;
}

test("the fixed model and real-race fixtures share the verified version and dataset", () => {
  assert.deepEqual(definitions.content.specification, FULL_HISTORY_V1);
  assert.equal(createHash("sha256").update(JSON.stringify(definitions.content)).digest("hex"), fixture.model);
  assert.equal(definitions.sha256, fixture.model);
  assert.equal(definitions.content.datasetSha256, fixture.dataset);
  assert.equal(definitions.content.training.last, FULL_HISTORY_V1.fit.chronologicalCutoff);
});

for (const book of fixture.fixtures) {
  test(`fixed policies reproduce pre-off decisions on a real ${book.race.family} race`, () => {
    assert.ok(book.quoteAt);
    const result = predictFullHistoryV1(book.features, weights, book.quotes ?? undefined);
    assert.ok(result.probabilities);
    for (const k of ["A", "B", "C", "D"] as const) {
      assert.deepEqual(result[k].selections, book.expected[k]);
      assert.equal(result[k].status, book.expected[k].length ? "selection" : "no-selection");
    }
    for (const p of Object.values(result.probabilities)) {
      assert.ok(p);
      close(p.reduce((sum, value) => sum + value, 0), 1);
    }
    const noPrice = predictFullHistoryV1(book.features, weights);
    for (const k of ["A", "B", "C"] as const) {
      const decision = noPrice[k];
      assert.equal(decision.status, "no-selection");
      assert.equal(decision.reason, "no-complete-pre-off-quotes");
    }
    assert.deepEqual(noPrice.D, result.D);
  });
}

test("horse history and trainer/jockey rates use earlier outcomes only", () => {
  const { prior, target, horse } = fixture.repairHistory;
  const first = trusted(prior), second = trusted(target);
  const index = first.race.runners.findIndex(r => r.horse === horse);
  const targetIndex = second.race.runners.findIndex(r => r.horse === horse);
  assert.ok(index >= 0 && targetIndex >= 0 && first.race.date < second.race.date);
  const participant = second.race.runners[targetIndex];
  assert.equal(participant.trainer, first.race.runners[index].trainer);
  assert.equal(participant.jockey, first.race.runners[index].jockey);
  const h = new IndependentRaceHistory();
  const cold = h.prepare(second.race)[targetIndex];
  assert.equal(cold.coverage.form, false);
  assert.equal(cold.coverage.trainerHistory, false);
  assert.equal(cold.coverage.jockeyHistory, false);
  h.record(first.race, first.outcomes);
  const warm = h.prepare(second.race)[targetIndex];
  assert.equal(warm.coverage.form, true);
  assert.equal(warm.coverage.trainerHistory, true);
  assert.equal(warm.coverage.jockeyHistory, true);
  for (const [key, slot] of [["trainer", 0], ["jockey", 1]] as const) {
    const starts = first.race.runners.flatMap((r, i) => r[key] === participant[key] ? [first.outcomes[i].credit] : []);
    close(warm.B[slot], (starts.reduce((a, b) => a + b, 0) - 0.1 * starts.length) * 5 / (starts.length + 12));
  }
  assert.deepEqual(h.prepare(second.race)[targetIndex], warm);
  h.record(second.race, second.outcomes);
  assert.throws(() => h.prepare(second.race), /before recording/);
  assert.throws(() => h.record(first.race, first.outcomes), /Out-of-order/);
});

test("the repaired October books reconcile without counting withdrawals as starters", () => {
  for (const [id, count] of [["942523", 11], ["942524", 10]] as const) {
    const r = trusted(id);
    assert.equal(r.race.date, "2026-10-09");
    assert.equal(r.race.runners.length, count);
    assert.equal(r.completeSP, true);
    assert.ok(bySource.get(id)!.runners.length > count);
  }
});

test("canonical dead heat splits gross return and market credit", () => {
  const { outcomes } = trusted(fixture.deadHeat);
  const winners = outcomes.filter(o => o.status === "win");
  assert.ok(winners.length >= 2);
  close(winners.reduce((total, win) => total + win.credit, 0), 1);
  for (const winner of winners) {
    assert.equal(winner.divisor, winners.length);
    close(winner.pl!, winner.sp! / winners.length - 1);
  }
  assert.ok(outcomes.filter(o => o.status === "loss").every(o => o.pl === -1));
});

test("void, unresolved and identity-mismatched results never train the model", () => {
  const bad = bySource.get(fixture.nonterminal)!;
  assert.ok("reason" in reconcileHistoryRace(bad, historyFamily(bad)));
  const book = bySource.get("942523")!;
  assert.equal(reconcileHistoryRace({ ...book, stage: "RACEVOID" }, "TURF").reason, "void-or-abandoned");
  const changed = structuredClone(book);
  changed.resultRides![0][1] = "different-horse";
  assert.equal(reconcileHistoryRace(changed, "TURF").reason, "ride-or-horse-identity-mismatch");
  assert.equal(finalSp("9/2"), 5.5);
  assert.equal(finalSp("EVS"), 2);
  assert.equal(finalSp("SP"), null);
});

test("incomplete prices and malformed fields are distinct abstentions", () => {
  const b = fixture.fixtures[0];
  const result = predictFullHistoryV1(b.features, weights, [0]);
  assert.equal(result.A.status, "no-selection");
  assert.equal(result.A.reason, "no-complete-pre-off-quotes");
  const invalid = predictFullHistoryV1([b.features[0], b.features[0]], weights);
  assert.equal(invalid.D.status, "no-selection");
  assert.equal(invalid.D.reason, "invalid-field");
});
