import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { buildExamples, classifySignal, distanceBand, drawEffect, parseOpeningStyle, priorWindow, regularisedRate, selectCombination, timestamp, yearDirection, type Run } from "./run-aw-feature-experiment";

function run(raceId: string, horseId: string, when: string, position: number, changes: Partial<Run> = {}): Run {
  return {
    raceId, runnerId: `${raceId}:${horseId}`, horseId, trainerId: "trainer", jockeyId: "jockey",
    raceDate: when.slice(0, 10), raceDateTime: new Date(when), time: timestamp(when), courseId: "course", courseName: "Lingfield",
    surface: "POLYTRACK", surfaceGroup: "Polytrack", aw: true, awSpeedRating: null, speed: null,
    raceName: "Handicap", raceType: "Flat", raceTypeCode: "flat", raceClass: "Class 5", distanceYards: 1760, going: "Standard",
    declaredRunnerCount: 2, actualRunnerCount: 2, finishingPosition: position, resultStatus: "finished", outcomeCode: null,
    racingPostRating: null, topspeedRating: null, officialRating: 60, weightCarriedLbs: 130, horseAge: 5, draw: position,
    startingPriceDecimal: "3", isFavourite: false, runnerComment: "held up, stayed on", winningTime: "1m 40s", ...changes,
  };
}
const race = (id: string, when: string) => [run(id, "horse-a", when, 1), run(id, "horse-b", when, 2)];

describe("Controlled AW experiment", () => {
  test("preserves Date and PostgreSQL offset timestamps and rejects missing/invalid time", () => {
    assert.equal(timestamp(new Date("2025-06-01T14:00:00Z")), timestamp("2025-06-01 15:00:00+01"));
    for (const value of [undefined, null, "", "bad", new Date(NaN)]) assert.throws(() => timestamp(value), /Invalid or missing/);
  });
  test("same-timestamp races cannot contribute to any other target at that timestamp", () => {
    const rows = [...race("r1", "2025-01-01T12:00:00Z"), ...race("r2", "2025-01-01T12:00:00Z"), ...race("r3", "2025-01-02T12:00:00Z")];
    const result = buildExamples(rows.reverse());
    assert.equal(result.examples.length, 6);
    for (const e of result.examples.filter((e) => e.row.raceId !== "r3")) {
      assert.equal(e.values.jockey_14d_runs, 0);
      assert.equal(e.values.prior_aw_starts, 0);
      assert.equal(e.values.combination_runs, 0);
    }
    const next = result.examples.find((e) => e.row.raceId === "r3")!;
    assert.equal(next.values.jockey_14d_runs, 4);
    assert.equal(next.values.jockey_14d_wins, 2);
    assert.equal(next.values.jockey_prior_rate, 50);
    assert.equal(next.values.prior_aw_starts, 2);
  });
  test("changing future results and comments leaves earlier feature vectors unchanged", () => {
    const prior = race("r1", "2025-01-01T12:00:00Z"), future = race("r2", "2025-01-03T12:00:00Z");
    const original = buildExamples([...prior, ...future]).examples.filter((e) => e.row.raceId === "r1");
    const changed = buildExamples([...prior, ...future.map((r) => ({ ...r, finishingPosition: 3 - r.finishingPosition!, runnerComment: "made all", officialRating: 120 }))]).examples.filter((e) => e.row.raceId === "r1");
    assert.deepEqual(changed.map((e) => e.values), original.map((e) => e.values));
  });
  test("history windows include the lower boundary and exclude target and future times", () => {
    const target = timestamp("2025-01-15T12:00:00Z");
    const history = [run("a", "h", "2025-01-01T12:00:00Z", 1), run("b", "h", "2025-01-01T11:59:59Z", 1), run("c", "h", "2025-01-15T12:00:00Z", 1)];
    assert.deepEqual(priorWindow(history, target, 14).map((r) => r.raceId), ["a"]);
    assert.equal(regularisedRate(1, 2, 0.1), 3 / 22);
    assert.ok(regularisedRate(1, 2, 0.1) < regularisedRate(10, 20, 0.1));
  });
  test("draw cells are neutral below the minimum distinct-race depth", () => {
    assert.equal(drawEffect(10, 2, 29), 0);
    assert.equal(drawEffect(10, 2, 30), 8 / 22);
    assert.equal(distanceBand(1430), "5-6f");
    assert.equal(distanceBand(1431), "7-8f");
  });
  test("incomplete historical fields cannot enter draw cells", () => {
    const incomplete = race("incomplete", "2024-12-31T12:00:00Z").map((r) => ({ ...r, actualRunnerCount: 3 }));
    assert.equal(buildExamples(incomplete).drawCells, 0);
    assert.equal(buildExamples(race("complete", "2024-12-31T12:00:00Z")).drawCells, 2);
  });
  test("late leading is not mistaken for early running style", () => {
    assert.equal(parseOpeningStyle("Led 1f out, kept on"), "unknown");
    assert.equal(parseOpeningStyle("Held up, led 1f out"), "held_up");
    assert.equal(parseOpeningStyle("made all, ran on"), "front");
    assert.equal(parseOpeningStyle("chased leaders, weakened"), "prominent");
    assert.equal(parseOpeningStyle(null), "unknown");
  });
  test("replication requires several folds, both years and market-controlled improvement", () => {
    const improves = { deltaLogLoss: -0.002, deltaBrier: -0.001 }, fails = { deltaLogLoss: 0.002, deltaBrier: 0.001 };
    assert.equal(classifySignal([improves, improves, improves, fails], [improves, improves], [improves, improves]), "MODEST REPLICATED SIGNAL");
    assert.equal(classifySignal([improves, fails, fails], [improves, improves], [improves, improves]), "WEAK / UNSTABLE");
    assert.equal(classifySignal([improves, improves, improves], [improves, fails], [improves, improves]), "WEAK / UNSTABLE");
    assert.equal(classifySignal([improves, improves, improves], [improves, improves], [fails, fails]), "WEAK / UNSTABLE");
    assert.equal(yearDirection([-0.002, 0.002]), "reverses");
    assert.equal(yearDirection([-0.002, -0.003]), "improves both");
  });
  test("A6 selection uses only replicated 2025 evidence and caps the family count", () => {
    const rows = ["jockey", "surface", "draw"].flatMap((family, index) => ["2025-Q3", "2025-Q4", "2026-H1"].map((fold) => ({ candidate: `F:${family}`, fold, deltaLogLoss: fold.startsWith("2026") ? -0.1 : -0.002 - index * 0.001, deltaBrier: -0.001, deltaRank1: 0, trainPeriod: "", validationPeriod: "", trainRaces: 1, metrics: { races: 1, runners: 2, rank1: 0, top2: 1, top3: 1, logLoss: 1, brier: 1, calibrationMae: 0 } })));
    assert.deepEqual(selectCombination(rows, rows), ["draw", "surface"]);
    assert.deepEqual(selectCombination(rows.filter((r) => !r.fold.startsWith("2025")), rows), []);
  });
});
