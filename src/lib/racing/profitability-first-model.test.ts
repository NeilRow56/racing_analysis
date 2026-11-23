import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import definitions from "../../../docs/profitability-first-model-definitions-v1.json";
import { replayProfitabilityFirst } from "../../../scripts/preview-profitability-first";
import { choose } from "../../../scripts/profitability-first-research";
import { predictProfitabilityFirstV1 } from "./profitability-first-model";
import { generationRaceSchema, loadTissueGeneration, type GenerationRace } from "./tissue-generation-forward";
import { loadTissueGenerationModels } from "./tissue-generation-model";

type Pick = { identity: string; p: number; price: number; edge: number; utility?: number };
type Policies = Record<"A" | "B" | "C", Pick | null>;
type RetrospectiveFixture = {
  id: string; family: string; priceSource: string;
  offers: Parameters<typeof choose>[0]; expected: { B: Pick; C: Pick };
};
type Fixtures = {
  captures: { book: unknown; expected: Policies | null }[];
  retrospective: RetrospectiveFixture[];
};
const fixtures = JSON.parse(await readFile(new URL("../../../scripts/fixtures/profitability-first-v1.json", import.meta.url), "utf8")) as Fixtures;
const books = fixtures.captures.map(({ book, expected }) => ({ book: generationRaceSchema.parse(book), expected }));
const models = await loadTissueGenerationModels();
const keys = ["A", "B", "C"] as const;
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} differs from ${expected}`);

function matchup(book: GenerationRace, expected: Policies, context?: Parameters<typeof predictProfitabilityFirstV1>[2]) {
  const decision = predictProfitabilityFirstV1(models[book.family], book, context);
  assert.equal(decision.capture?.raceId, book.raceId);
  for (const key of keys) {
    const actual = decision.decisions[key], reference = expected[key];
    if (reference) {
      assert.equal(actual.status, "selection");
      assert.equal(actual.runnerId, reference.identity);
      assert.equal(actual.price, reference.price);
      close(actual.probability, reference.p);
      close(actual.edge, reference.edge);
      if (reference.utility !== undefined) close(actual.utility!, reference.utility);
    } else {
      assert.equal(actual.status, "no-selection");
      assert.equal(actual.reason, "insufficient-edge");
    }
  }
}

for (const { book, expected } of books) {
  test(`reproduces all three pre-off decisions for ${book.family} at ${book.course} on ${book.raceDate}`, () => {
    if (expected) {
      matchup(book, expected, { raceId: book.raceId, scheduledOff: new Date(book.scheduledOff), asOf: new Date(book.capturedAt),
        raceClosed: false, activeRunnerIds: book.runners.map(row => row.runnerId) });
    } else {
      const { decisions } = predictProfitabilityFirstV1(models[book.family], book);
      for (const key of keys) {
        const actual = decisions[key];
        assert.equal(actual.status, "no-selection");
        assert.equal(actual.reason, "incomplete-market");
      }
    }
  });
}

for (const { family, priceSource, offers, expected } of fixtures.retrospective) {
  test(`return utility and projected edge make different choices on a real ${family} SP-only book`, () => {
    assert.equal(priceSource, "retrospective-final-SP");
    const { a, b, c } = choose(offers, definitions.content.weights, false);
    assert.equal(a, null);
    assert.ok(b && c);
    assert.notEqual(b.index, c.index);
    assert.ok(b.edge > c.edge);
    assert.ok(c.utility > b.utility);
    for (const [actual, reference] of [[b, expected.B], [c, expected.C]] as const) {
      assert.equal(offers[actual.index].id, reference.identity);
      close(actual.edge, reference.edge);
      close(actual.p, reference.p);
      close(actual.utility, reference.utility!);
    }
    const rejection = predictProfitabilityFirstV1(models.AW, offers);
    assert.equal(rejection.capture, null);
    assert.ok(Object.values(rejection.decisions).every(d => d.status === "no-selection" && d.reason === "invalid-capture"));
  });
}

test("pre-off predictions enforce capture time, race identity and the whole active field", () => {
  const { book } = books[0];
  const activeRunnerIds = book.runners.map(runner => runner.runnerId);
  const context = { raceId: book.raceId, scheduledOff: new Date(book.scheduledOff), asOf: new Date(book.capturedAt), raceClosed: false, activeRunnerIds };
  for (const [overrides, reason] of [
    [{ asOf: new Date(context.asOf.getTime() - 1) }, "capture-not-yet-available"],
    [{ asOf: new Date(book.scheduledOff) }, "race-closed"],
    [{ raceClosed: true }, "race-closed"],
    [{ scheduledOff: null }, "race-mismatch"],
    [{ activeRunnerIds: activeRunnerIds.slice(1) }, "active-field-changed"],
    [{ activeRunnerIds: activeRunnerIds.map(() => activeRunnerIds[0]) }, "active-field-changed"],
  ] as const) {
    const { decisions } = predictProfitabilityFirstV1(models[book.family], book, { ...context, ...overrides });
    assert.ok(Object.values(decisions).every(d => d.status === "no-selection" && d.reason === reason));
  }
});

test("the complete November pre-off opportunity set reproduces the frozen decisions", async () => {
  type EvaluationRow = [string, string, GenerationRace["family"], string, Pick, Pick, Pick | null, Pick | null, Pick | null];
  type BaselineRow = { raceId: string; capture: string; matched: boolean };
  const [ledger, baseline, evaluation] = await Promise.all([
    loadTissueGeneration(),
    readFile("docs/tissue-t2-profit-baseline-v1.json", "utf8").then(bytes => JSON.parse(bytes) as { content: { rows: BaselineRow[] } }),
    readFile("docs/profitability-first-model-evaluation-v1.json", "utf8").then(bytes =>
      JSON.parse(bytes) as { content: { rows: { novemberCommon: { decisions: EvaluationRow[] } } } }),
  ]);
  const index = new Map(ledger.races.map(book => [`${book.raceId}|${book.capturedAt}`, book]));
  const dates = new Map(baseline.content.rows.filter(row => row.matched).map(row => [row.raceId, row.capture]));
  const population = evaluation.content.rows.novemberCommon.decisions;
  assert.equal(population.length, 332);
  assert.equal(new Set(population.map(row => row[0])).size, 332);
  for (const [id, , family, , , , A, B, C] of population) {
    const book = index.get(`${id}|${dates.get(id)}`);
    assert.ok(book, id);
    assert.equal(book.family, family);
    matchup(book, { A, B, C });
  }
});

test("the local command reports missing captures for every policy", async () => {
  const replay = await replayProfitabilityFirst(["--race-id", "missing-race"]);
  assert.equal(replay.predictions[0].capture, null);
  assert.ok(Object.values(replay.predictions[0].decisions).every(d => d.status === "no-selection" && d.reason === "no-matching-capture"));
});
