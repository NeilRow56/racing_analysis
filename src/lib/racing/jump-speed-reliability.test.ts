import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { assessJumpSpeedReliability } from "./jump-speed-reliability";
import { calculateHorseMetricsAsOf, type HistoricalRunInput } from "./horse-metrics";
import { calculateJumpSpeedRating } from "./jump-speed-rating";

function run(raceType: string, rating: number | null = 100, day = 10): HistoricalRunInput {
  return {
    horseId: "horse", raceType, raceName: raceType, courseId: "course",
    raceDate: `2026-10-${day}`, raceDateTime: new Date(`2026-10-${day}T12:00:00Z`),
    distanceYards: 4400, going: "Good", resultStatus: "finished", finishingPosition: 4,
    racingPostRating: null, topspeedRating: null, officialRating: null,
    jumpSpeedRating: { ...calculateJumpSpeedRating({ raceType: "Chase", distanceYards: 4400,
      winningTime: "5m 0s", baseStandardSeconds: 300, standardSampleSize: 10, cumulativeBeatenLengths: 0 }), rating },
  };
}

describe("Jump Best L3 history reliability", () => {
  test("three usable Jump priors are HIGH, including the existing NH Flat domain", () => {
    const result = assessJumpSpeedReliability([run("Hurdle"), run("Chase"), run("NH Flat")]);
    assert.equal(result.level, "HIGH");
    assert.equal(result.relevantJumpRuns, 3);
    assert.equal(result.nonJumpRuns, 0);
  });

  test("two relevant priors are MEDIUM, with or without a third non-Jump slot", () => {
    assert.equal(assessJumpSpeedReliability([run("Hurdle"), run("Chase")]).level, "MEDIUM");
    for (const family of ["Flat", "All Weather Flat"]) {
      // A non-Jump run is not counted even if it unexpectedly carries a rating.
      const assessment = assessJumpSpeedReliability([run("Chase"), run("Hurdle"), run(family)]);
      assert.equal(assessment.level, "MEDIUM");
      assert.equal(assessment.nonJumpRuns, 1);
      assert.match(assessment.reason, /Two relevant Jump runs.*non-Jump run/);
    }
  });

  test("one usable Jump prior is LOW, both alone and with other-family history", () => {
    for (const runs of [[run("Hurdle")], [run("Chase"), run("Flat"), run("All Weather Flat")]]) {
      assert.equal(assessJumpSpeedReliability(runs).level, "LOW");
      assert.equal(assessJumpSpeedReliability(runs).relevantJumpRuns, 1);
    }
  });

  test("missing/unavailable/nonfinite figures cannot imply complete evidence", () => {
    assert.equal(assessJumpSpeedReliability().level, "LOW");
    const assessment = assessJumpSpeedReliability([run("Chase"), run("Hurdle", null), run("NH Flat", NaN)]);
    assert.equal(assessment.level, "LOW");
    assert.match(assessment.reason, /no usable Speed figure/);
    assert.equal(assessJumpSpeedReliability([run("Hurdle", Infinity)]).relevantJumpRuns, 0);
  });

  test("coverage depends on neither Speed magnitude nor result quality", () => {
    const base = [run("Hurdle"), run("Chase"), run("Chase")];
    const changed = base.map((r, i) => ({ ...r, finishingPosition: i + 1, officialRating: 180,
      jumpSpeedRating: { ...r.jumpSpeedRating!, rating: [-100, 0, 250][i]! } }));
    assert.deepEqual(assessJumpSpeedReliability(base), assessJumpSpeedReliability(changed));
    assert.deepEqual(assessJumpSpeedReliability(base), assessJumpSpeedReliability(base));
  });

  test("Glen To Glen regression: the same all-code L3 window produces 76 and MEDIUM", () => {
    const runs = [run("Hurdle", 71.07566504917321, 20), run("Chase", 75.84646128484849, 19),
      run("Flat", null, 18), run("Chase", 130.93586244343888, 17)];
    const original = structuredClone(runs);
    const metrics = calculateHorseMetricsAsOf({ runs, beforeDateTime: new Date("2026-10-23T12:50:00Z") });
    assert.equal(metrics.bestJumpSpeedLast3, 75.84646128484849);
    assert.equal(Math.round(metrics.bestJumpSpeedLast3!), 76);
    assert.equal(metrics.bestJumpSpeedLast5, 130.93586244343888);
    assert.equal(metrics.averageJumpSpeedLast3, 73.46106316701085);
    assert.equal(metrics.jumpSpeedReliability?.level, "MEDIUM");
    assert.equal(metrics.jumpSpeedReliability?.relevantJumpRuns, 2);
    assert.equal(metrics.jumpSpeedReliability?.nonJumpRuns, 1);
    assert.deepEqual(runs, original);
  });

  test("assessment uses canonical eligible chronology, excluding NR and cutoff/future runs", () => {
    const cutoff = new Date("2026-10-20T12:00:00Z");
    const metrics = calculateHorseMetricsAsOf({ beforeDateTime: cutoff, runs: [
      run("Chase", 150, 21), run("Chase", 150, 20),
      { ...run("Chase", 150, 19), resultStatus: "non_runner" },
      { ...run("Chase", 150, 18), resultStatus: null, finishingPosition: null },
      run("Hurdle", 80, 17), run("Flat", null, 16), run("Chase", null, 15), run("Chase", 150, 14),
    ] });
    assert.equal(metrics.bestJumpSpeedLast3, 80);
    assert.equal(metrics.jumpSpeedReliability?.level, "LOW");
    assert.equal(metrics.jumpSpeedReliability?.windowRuns, 3);
    assert.equal(metrics.jumpSpeedReliability?.relevantJumpRuns, 1);
  });
});
