import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  calculateGoingFormForTargets,
  parseGoingTerms,
  type GoingFormHistoricalRun,
  type GoingFormTarget,
} from "./going-form";

describe("going term parsing", () => {
  test("extracts every recognised term in compound going descriptions", () => {
    assert.deepEqual(parseGoingTerms("Good to Firm"), ["good", "firm"]);
    assert.deepEqual(parseGoingTerms("GOOD TO SOFT"), ["good", "soft"]);
    assert.deepEqual(parseGoingTerms("Yielding to Soft"), ["yielding", "soft"]);
  });

  test("extracts single terms and rejects All Weather descriptions", () => {
    assert.deepEqual(parseGoingTerms("Heavy"), ["heavy"]);
    assert.deepEqual(parseGoingTerms("Good"), ["good"]);
    assert.deepEqual(parseGoingTerms("Yielding"), ["yielding"]);
    assert.deepEqual(parseGoingTerms("Standard"), []);
    assert.deepEqual(parseGoingTerms("Standard to Slow"), []);
    assert.deepEqual(parseGoingTerms(null), []);
  });
});

describe("historical going form", () => {
  test("uses only prior first and second finishes and counts compound evidence once per run", () => {
    const form = calculateGoingFormForTargets([target()], [
      run({ raceId: "good-first", finishingPosition: 1, going: "Good" }),
      run({ raceId: "soft-second", finishingPosition: 2, going: "Soft" }),
      run({ raceId: "good-third", finishingPosition: 3, going: "Good" }),
      run({ raceId: "good-firm-first", finishingPosition: 1, going: "Good to Firm" }),
      run({ raceId: "good-soft-second", finishingPosition: 2, going: "Good to Soft" }),
      run({ raceId: "yielding-soft-first", finishingPosition: 1, going: "Yielding to Soft" }),
      run({ raceId: "heavy-first", finishingPosition: 1, going: "Heavy" }),
      run({ raceId: "standard-first", finishingPosition: 1, going: "Standard" }),
    ]).get("target-runner");

    assert.deepEqual(form, {
      firm: true,
      good: true,
      soft: true,
      yielding: true,
      heavy: true,
      firmCount: 1,
      goodCount: 3,
      softCount: 3,
      yieldingCount: 1,
      heavyCount: 1,
    });
  });

  test("excludes the target race, future runs, non-runners, and other race families", () => {
    const form = calculateGoingFormForTargets([target()], [
      run({ raceId: "target-race", going: "Firm" }),
      run({ raceId: "future", raceDateTime: new Date("2026-09-20T13:01:00Z"), going: "Soft" }),
      run({ raceId: "non-runner", resultStatus: "non_runner", going: "Heavy" }),
      run({ raceId: "aw", raceName: "Handicap", raceType: "handicap", going: "Standard", courseName: "Kempton" }),
      run({ raceId: "jump", raceName: "Novices' Hurdle", raceType: "hurdle", going: "Yielding" }),
    ]).get("target-runner");

    assert.deepEqual(form, {
      firm: false,
      good: false,
      soft: false,
      yielding: false,
      heavy: false,
      firmCount: 0,
      goodCount: 0,
      softCount: 0,
      yieldingCount: 0,
      heavyCount: 0,
    });
  });

  test("does not duplicate displayed flags when several runs qualify", () => {
    const form = calculateGoingFormForTargets([target()], [
      run({ raceId: "good-1", going: "Good" }),
      run({ raceId: "good-2", going: "Good" }),
    ]).get("target-runner")!;

    assert.equal(form.good, true);
    assert.equal(form.goodCount, 2);
  });
});

function target(overrides: Partial<GoingFormTarget> = {}): GoingFormTarget {
  return {
    targetRunnerId: "target-runner",
    targetRaceId: "target-race",
    horseId: "horse-1",
    raceDateTime: new Date("2026-09-20T13:00:00Z"),
    raceFamily: "turf_flat",
    ...overrides,
  };
}

function run(overrides: Partial<GoingFormHistoricalRun> = {}): GoingFormHistoricalRun {
  return {
    raceId: "historical-race",
    horseId: "horse-1",
    raceDateTime: new Date("2026-09-19T13:00:00Z"),
    finishingPosition: 1,
    resultStatus: "finished",
    going: "Good",
    raceName: "Flat Stakes",
    raceType: "stakes",
    raceTypeCode: null,
    courseName: "Newmarket",
    courseSourceId: "174",
    ...overrides,
  };
}
