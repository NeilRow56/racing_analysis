import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  applyCalibrationModel,
  fitHurdleCalibrationModels,
  rankingChanged,
  type RaceCalibrationInput,
} from "./hurdle-tissue-calibration";

describe("Hurdle Tissue calibration", () => {
  test("candidate calibrators keep coherent whole-field books", () => {
    const races = sampleRaces();
    const models = fitHurdleCalibrationModels(races);
    assert.deepEqual(models.map((model) => model.id), ["CONTROL", "PLATT_LOGISTIC", "POWER_GAMMA", "ISOTONIC"]);

    for (const model of models) {
      const calibrated = applyCalibrationModel(model, races[0]!.runners.map((runner) => runner.probability));
      assert.equal(Number(calibrated.reduce((sum, value) => sum + value, 0).toFixed(12)), 1);
      assert.ok(calibrated.every((value) => value > 0 && value < 1));
    }
  });

  test("monotonic calibration preserves runner order", () => {
    const race = sampleRaces()[0]!;
    const models = fitHurdleCalibrationModels(sampleRaces());
    for (const model of models) {
      const calibrated = applyCalibrationModel(model, race.runners.map((runner) => runner.probability));
      const check = rankingChanged(
        race.runners.map((runner) => ({ runnerId: runner.runnerId, probability: runner.probability })),
        race.runners.map((runner, index) => ({ runnerId: runner.runnerId, probability: calibrated[index]! })),
      );
      assert.equal(check.sameRankOne, true, model.id);
      assert.equal(check.sameOrder, true, model.id);
    }
  });
});

function sampleRaces(): RaceCalibrationInput[] {
  return [
    race("r1", [0.55, 0.25, 0.14, 0.06], 0),
    race("r2", [0.45, 0.28, 0.18, 0.09], 1),
    race("r3", [0.62, 0.2, 0.11, 0.07], 0),
    race("r4", [0.37, 0.31, 0.2, 0.12], 2),
  ];
}

function race(raceId: string, probabilities: number[], winnerIndex: number): RaceCalibrationInput {
  return {
    raceId,
    runners: probabilities.map((probability, index) => ({
      runnerId: `${raceId}-${index}`,
      probability,
      won: index === winnerIndex,
    })),
  };
}
