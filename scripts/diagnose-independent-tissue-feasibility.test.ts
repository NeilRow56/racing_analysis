import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parsePriorRunComment, priorCommentsForTarget, raceSoftmax } from "./diagnose-independent-tissue-feasibility";

describe("independent tissue comment features", () => {
  test("extracts representative transparent phrase flags", () => {
    const flags = parsePriorRunComment("Slowly away, held up in rear, hampered and switched, stayed on strongly; nearest finish");
    assert.equal(flags.slowlyAway, 1);
    assert.equal(flags.heldUpRear, 1);
    assert.equal(flags.hampered, 1);
    assert.equal(flags.switched, 1);
    assert.equal(flags.stayedOn, 1);
    assert.equal(flags.strongFinish, 1);
    assert.equal(flags.led, 0);
  });

  test("uses only strictly earlier comments in reverse chronological order", () => {
    const comments = [
      { raceDate: "2026-01-01", raceId: "prior", raceDateTime: new Date("2026-01-01T12:00:00Z"), comment: "stayed on" },
      { raceDate: "2026-01-02", raceId: "target", raceDateTime: new Date("2026-01-02T12:00:00Z"), comment: "won target" },
      { raceDate: "2026-01-03", raceId: "future", raceDateTime: new Date("2026-01-03T12:00:00Z"), comment: "future" },
    ];
    assert.deepEqual(priorCommentsForTarget(comments, new Date("2026-01-02T12:00:00Z")).map((row) => row.raceId), ["prior"]);
  });

  test("softmax produces a finite 100 percent race book", () => {
    const probabilities = raceSoftmax([-4, 0, 2, 9]);
    assert.ok(probabilities.every((value) => value > 0 && value < 1));
    assert.ok(Math.abs(probabilities.reduce((sum, value) => sum + value, 0) - 1) < 1e-12);
  });
});
