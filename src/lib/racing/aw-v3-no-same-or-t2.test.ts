import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { score } from "../../../scripts/diagnose-independent-tissue-feasibility";
import { replayAwV3NoSameOrT2 } from "../../../scripts/preview-aw-v3-no-same-or-t2";
import { AW_V3_NO_SAME_OR_T2, predictAwV3NoSameOrT2, selectAwV3NoSameOrT2ForToday } from "./aw-v3-no-same-or-t2";
import { generationRaceSchema, type GenerationRace } from "./tissue-generation-forward";
import { loadTissueGenerationModels } from "./tissue-generation-model";

type Fixture = {
  book: unknown;
  expected: {
    runnerId: string; horse: string; probability: number; score: number; originalRunnerId: string;
    finalSP: string | null; result: string; won: boolean | null;
  };
};
const { fixtures } = JSON.parse(await readFile(new URL("../../../scripts/fixtures/aw-v3-no-same-or-t2.json", import.meta.url), "utf8")) as { fixtures: Fixture[] };
const models = await loadTissueGenerationModels();

for (const { book: input, expected } of fixtures) {
  test(`revision 1 reproduces the isolated AW comparison for ${expected.horse}`, () => {
    const book = generationRaceSchema.parse(input);
    const before = structuredClone({ book, model: models.AW });
    const decision = predictAwV3NoSameOrT2(models.AW, book);
    assert.equal(decision.status, "selection");
    assert.equal(decision.model, AW_V3_NO_SAME_OR_T2);
    assert.equal(decision.selection.rank, 2);
    assert.equal(decision.selection.runnerId, expected.runnerId);
    assert.equal(decision.selection.horseName, expected.horse);
    assert.equal(decision.originalT2.runnerId, expected.originalRunnerId);
    assert.ok(Math.abs(decision.selection.probability - expected.probability) < 1e-12);
    assert.ok(Math.abs(decision.rankings.reduce((total, row) => total + row.probability, 0) - 1) < 1e-12);

    const runner = book.runners.find(row => row.runnerId === expected.runnerId);
    assert.ok(runner);
    const { baseModel, adjustment } = models.AW;
    const retainedScore = score(baseModel, runner.modelInputs) +
      adjustment.names.reduce((total, feature, i) => feature === "same_or_speed_gap" ? total :
        total + adjustment.weights[i] * (runner.adjustmentInputs[i] - adjustment.means[i]) / adjustment.scales[i], 0);
    assert.ok(Math.abs(retainedScore - expected.score) < 1e-12);
    assert.deepEqual({ book, model: models.AW }, before);
  });
}

function openCard(book: GenerationRace) {
  return {
    raceId: book.raceId,
    scheduledOff: new Date(book.scheduledOff),
    asOf: new Date(book.capturedAt),
    raceClosed: false,
    activeRunnerIds: book.runners.map(row => row.runnerId),
  };
}

test("the captured outsider winner remains T2 with outcomes and the entire market removed", () => {
  const fixture = fixtures.find(row => row.expected.horse === "Xirivella");
  assert.ok(fixture);
  const book = generationRaceSchema.parse(fixture.book);
  assert.equal(fixture.expected.finalSP, "9/1");
  assert.equal(book.runners.find(row => row.runnerId === fixture.expected.runnerId)?.outcome?.winner, true);
  const live = { ...book, completeMarket: false, runners: book.runners.map(row => ({
    ...row, outcome: null, quotes: [], capturedPrice: null, marketProbability: null,
  })) };
  assert.deepEqual(selectAwV3NoSameOrT2ForToday(models.AW, live, openCard(live)), predictAwV3NoSameOrT2(models.AW, book));
});

test("the real later withdrawal gives no live selection from a stale book", () => {
  const fixture = fixtures.find(row => row.expected.horse === "Roosike");
  assert.ok(fixture);
  const book = generationRaceSchema.parse(fixture.book);
  const card = openCard(book);
  const withdrawn = book.runners.find(row => row.runnerId === fixture.expected.runnerId);
  assert.equal(withdrawn?.outcome?.status, "NR");
  const earlier = { ...book, runners: book.runners.map(row => ({ ...row, outcome: null })) };
  const afterWithdrawal = { ...card, activeRunnerIds: card.activeRunnerIds.filter(id => id !== fixture.expected.runnerId) };
  assert.deepEqual(selectAwV3NoSameOrT2ForToday(models.AW, earlier, afterWithdrawal), {
    status: "no-selection", reason: "active-field-changed", model: AW_V3_NO_SAME_OR_T2,
  });
});

test("the live selector rejects a future capture, an off or closed race, and another race", () => {
  const book = generationRaceSchema.parse(fixtures[0].book);
  const live = { ...book, runners: book.runners.map(row => ({ ...row, outcome: null })) };
  const card = openCard(live);
  for (const [override, reason] of [
    [{ asOf: new Date(card.asOf.getTime() - 1) }, "capture-not-yet-available"],
    [{ asOf: new Date(live.scheduledOff) }, "race-closed"],
    [{ raceClosed: true }, "race-closed"],
    [{ raceId: "another-race" }, "race-mismatch"],
  ] as const) {
    assert.deepEqual(selectAwV3NoSameOrT2ForToday(models.AW, live, { ...card, ...override }), {
      status: "no-selection", reason, model: AW_V3_NO_SAME_OR_T2,
    });
  }
});

test("invalid inputs and the wrong source model produce explicit no-selection decisions", () => {
  const book = generationRaceSchema.parse(fixtures[0].book);
  const capture = structuredClone(book);
  capture.runners[0].adjustmentInputs[0] += 1;
  assert.deepEqual(predictAwV3NoSameOrT2(models.AW, capture), {
    status: "no-selection", reason: "captured-input-mismatch", model: AW_V3_NO_SAME_OR_T2,
  });
  capture.runners[0].modelInputs.pop();
  assert.deepEqual(predictAwV3NoSameOrT2(models.AW, capture), {
    status: "no-selection", reason: "invalid-capture", model: AW_V3_NO_SAME_OR_T2,
  });
  assert.deepEqual(predictAwV3NoSameOrT2(models.HURDLE, book), {
    status: "no-selection", reason: "model-mismatch", model: AW_V3_NO_SAME_OR_T2,
  });
});

test("the local replay reports a missing capture", async () => {
  assert.deepEqual(await replayAwV3NoSameOrT2(["--race-id", "no-such-frozen-race"]), {
    mode: "frozen-replay", status: "no-selection", reason: "no-matching-capture", model: AW_V3_NO_SAME_OR_T2,
  });
});
