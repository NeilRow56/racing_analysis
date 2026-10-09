import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  classifyTrainerSignal,
  featureNamesFor,
  normaliseRaceTimestamp,
  regularisedTrainerForm14d,
} from "./run-jump-trainer-form-experiment";

describe("Jump trainer form experiment helpers", () => {
  test("normalises Date and ISO timestamps to the same exact instant", () => {
    const iso = "2026-01-01T14:00:00.123Z";
    const expected = Date.UTC(2026, 0, 1, 14, 0, 0, 123);
    assert.equal(normaliseRaceTimestamp(new Date(iso)), expected);
    assert.equal(normaliseRaceTimestamp(iso), expected);
  });

  test("preserves offsets and chronology in PostgreSQL timestamp strings", () => {
    assert.equal(normaliseRaceTimestamp("2026-01-01 14:00:00+00"), Date.UTC(2026, 0, 1, 14));
    assert.equal(normaliseRaceTimestamp("2020-09-01 16:40:00+01"), Date.UTC(2020, 8, 1, 15, 40));
    assert.equal(normaliseRaceTimestamp("2020-09-01T16:40:00+01:00"), normaliseRaceTimestamp("2020-09-01T15:40:00Z"));
    assert.ok(normaliseRaceTimestamp("2020-09-01 16:40:00+01") < normaliseRaceTimestamp("2020-09-01 16:00:00+00"));
  });

  test("rejects invalid, missing, and unsupported timestamps with row context", () => {
    for (const value of [null, undefined, "", " ", "invalid", new Date(NaN), 0, {}]) {
      assert.throws(() => normaliseRaceTimestamp(value, "race 123, runner 456"), /Invalid or missing raceDateTime \(race 123, runner 456\)/);
    }
  });

  test("shrinks sparse hot recent form toward the trainer baseline", () => {
    const oneForOne = regularisedTrainerForm14d({ wins14: 1, runs14: 1, baselineRate: 0.1 });
    const tenForTen = regularisedTrainerForm14d({ wins14: 10, runs14: 10, baselineRate: 0.1 });

    assert.ok(oneForOne < tenForTen);
    assert.equal(Number(oneForOne.toFixed(4)), 0.2);
    assert.equal(Number(tenForTen.toFixed(4)), 0.6);
  });

  test("keeps trainer feature families staged in the requested candidate order", () => {
    assert.ok(!featureNamesFor("J0").some((name) => name.startsWith("trainer_")));
    assert.ok(featureNamesFor("J1").includes("trainer_prior_365_rate"));
    assert.ok(featureNamesFor("J2").includes("trainer_14_reg_rate"));
    assert.ok(featureNamesFor("J3").includes("trainer_form_delta_14d"));
    assert.ok(featureNamesFor("J4").includes("winner_prev_7d"));
    assert.ok(featureNamesFor("J5").includes("low_one_runner_today"));
  });

  test("requires replicated fold and year improvement before modest signal", () => {
    assert.equal(classifyTrainerSignal({ deltaLogLoss: -0.002, deltaBrier: -0.001, improvedFolds: 2, improvedYears: 2 }), "MODEST REPLICATED SIGNAL");
    assert.equal(classifyTrainerSignal({ deltaLogLoss: -0.002, deltaBrier: -0.001, improvedFolds: 1, improvedYears: 2 }), "WEAK / UNSTABLE");
    assert.equal(classifyTrainerSignal({ deltaLogLoss: 0.001, deltaBrier: 0.001, improvedFolds: 0, improvedYears: 0 }), "NO SIGNAL");
  });
});
