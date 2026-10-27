import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { getTissueInputReliability } from "./tissue-input-reliability";
import { VALUE_COHORTS } from "./tissue-value-config";

for (const config of VALUE_COHORTS) {
  const vector = () => {
    const inputs = config.featureNames.map(() => 0);
    inputs[config.featureNames.indexOf(config.family === "HURDLE" || config.family === "CHASE" ? "log_prior_jump_starts" : "log_prior_runs")] = Math.log1p(5);
    return inputs;
  };
  const classify = (modelInputs?: number[] | null, featureNames: readonly string[] | undefined = config.featureNames) => getTissueInputReliability({ family: config.family, featureNames, modelInputs });
  test(`${config.family}: complete GOOD, actual missing flags and zero history CAUTION`, () => {
    const inputs = vector(), before = [...inputs];
    assert.equal(classify(inputs).level, "GOOD");
    const speed = config.family === "HURDLE" || config.family === "CHASE" ? "best_l3_jump_speed" : "best_l3_turf_speed";
    inputs[config.featureNames.indexOf(`${speed}_missing`)] = 1;
    const result = classify(inputs);
    assert.equal(result.level, "CAUTION"); assert.match(result.reasons.join(" "), /performance inputs/);
    inputs[config.featureNames.indexOf(`${speed}_missing`)] = 0;
    inputs[config.featureNames.indexOf(config.family === "HURDLE" || config.family === "CHASE" ? "log_prior_jump_starts" : "log_prior_runs")] = 0;
    assert.equal(classify(inputs).level, "CAUTION");
    assert.match(classify(inputs).reasons.join(" "), /No recorded prior starts/);
    assert.equal(classify(before).level, "GOOD");
    // Every numeric missing flag participates, including non-performance inputs.
    for (const name of config.featureNames.filter(name => name.endsWith("_missing"))) {
      const missing = vector(); missing[config.featureNames.indexOf(name)] = 1;
      missing[config.featureNames.indexOf(name.replace(/_missing$/, ""))] = 0;
      assert.equal(classify(missing).level, "CAUTION", name);
    }
  });
  test(`${config.family}: legacy/incompatible vectors UNKNOWN; low connection samples are independent`, () => {
    for (const input of [undefined, null, [], vector().slice(1)]) assert.equal(classify(input).level, "UNKNOWN");
    assert.equal(getTissueInputReliability({ family: config.family, modelInputs: vector() }).level, "UNKNOWN");
    const values = vector(); values[0] = NaN; assert.equal(classify(values).level, "UNKNOWN");
    const bad = vector(); bad[config.featureNames.indexOf("official_rating_missing")] = .5; assert.equal(classify(bad).level, "UNKNOWN");
    const contradicting = vector(); contradicting[0] = 100; contradicting[config.featureNames.indexOf("official_rating_missing")] = 1; assert.equal(classify(contradicting).level, "UNKNOWN");
    const small = vector(); small[config.featureNames.indexOf("log_jockey_prior_runs")] = Math.log1p(7);
    small[config.featureNames.indexOf("log_trainer_prior_runs")] = Math.log1p(1);
    assert.equal(classify(small).level, "GOOD");
    const runner = { family: config.family, featureNames: config.featureNames, modelInputs: small, outcome: { winner: true } };
    const before = structuredClone(runner); const good = getTissueInputReliability(runner);runner.outcome.winner = false;
    assert.deepEqual(getTissueInputReliability(runner), good);assert.deepEqual(runner.modelInputs, before.modelInputs);
  });
}

test("AW explicit missing surface terms mean incomplete, never an invented thin-history cutoff", () => {
  const config = VALUE_COHORTS[1], inputs = config.featureNames.map(() => 0);
  inputs[config.featureNames.indexOf("log_prior_runs")] = Math.log1p(3);
  // A genuine zero material count/delta is observed, not missing.
  assert.equal(getTissueInputReliability({ family: "AW", featureNames: config.featureNames, modelInputs: inputs }).level, "GOOD");
  inputs[config.featureNames.indexOf("surface_recent_performance_delta_missing")] = 1;
  assert.deepEqual(getTissueInputReliability({ family: "AW", featureNames: config.featureNames, modelInputs: inputs }), { level: "CAUTION", reasons: ["Incomplete AW surface-history inputs."] });
});

test("available forensic examples classify from their actual frozen vectors, without horse-name logic", () => {
  const expected = new Map([["Molly Valentine", "CAUTION"], ["Power Of Prayer", "GOOD"], ["Ten Cuidado", "GOOD"], ["Glitter Code", "GOOD"], ["Midnight Lir", "GOOD"]]);
  for (const config of VALUE_COHORTS.slice(0, 2)) {
    const data = JSON.parse(readFileSync(config.path, "utf8"));
    for (const race of data.races) for (const runner of race.runners) {
      if (race.raceDate !== "2026-10-26" || !expected.has(runner.horseName)) continue;
      assert.equal(getTissueInputReliability({ family: config.family, featureNames: race.featureNames, modelInputs: runner.modelInputs }).level, expected.get(runner.horseName));
    }
  }
});
