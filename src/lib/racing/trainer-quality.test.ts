import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  calculateTrainerPriorMetricsForTargets,
  type TrainerMetricTarget,
  type TrainerPriorMetrics,
  type TrainerPriorRun,
} from "./trainer-quality";
import { featureTargetBatches } from "./backtest-cache";

describe("trainer prior metrics", () => {
  test("uses only settled prior runs before each target race", () => {
    const metrics = calculateTrainerPriorMetricsForTargets(
      [
        target("first", "2025-01-01T12:00:00.000Z"),
        target("second", "2025-01-05T12:00:00.000Z"),
        target("third", "2025-01-10T12:00:00.000Z"),
      ],
      [
        run("2025-01-01T12:00:00.000Z", 1),
        run("2025-01-07T12:00:00.000Z", 2),
        run("2025-01-10T12:00:00.000Z", 1),
        run("2025-01-20T12:00:00.000Z", 1),
      ],
    );

    assert.deepEqual(metrics.get("first"), {
      trainerPriorRuns: 0,
      trainerPriorWins: 0,
      trainerPriorWinRate: null,
    });
    assert.deepEqual(metrics.get("second"), {
      trainerPriorRuns: 1,
      trainerPriorWins: 1,
      trainerPriorWinRate: 100,
    });
    assert.deepEqual(metrics.get("third"), {
      trainerPriorRuns: 2,
      trainerPriorWins: 1,
      trainerPriorWinRate: 50,
    });
  });

  test("ignores non-runners and unsettled runs", () => {
    const metrics = calculateTrainerPriorMetricsForTargets(
      [target("target", "2025-01-10T12:00:00.000Z")],
      [
        run("2025-01-01T12:00:00.000Z", null, "non_runner"),
        run("2025-01-02T12:00:00.000Z", null, null),
        run("2025-01-03T12:00:00.000Z", 1),
      ],
    );

    assert.deepEqual(metrics.get("target"), {
      trainerPriorRuns: 1,
      trainerPriorWins: 1,
      trainerPriorWinRate: 100,
    });
  });

  test("reports percentage win rate from prior wins and runs", () => {
    const priorRuns = Array.from({ length: 20 }, (_, index) =>
      run(`2025-01-${String(index + 1).padStart(2, "0")}T12:00:00.000Z`, index < 3 ? 1 : 2),
    );
    const metrics = calculateTrainerPriorMetricsForTargets(
      [target("target", "2025-02-01T12:00:00.000Z")],
      priorRuns,
    );

    assert.deepEqual(metrics.get("target"), {
      trainerPriorRuns: 20,
      trainerPriorWins: 3,
      trainerPriorWinRate: 15,
    });
  });

  test("groups by stable trainer ID", () => {
    const metrics = calculateTrainerPriorMetricsForTargets(
      [
        target("trainer-a-target", "2025-01-10T12:00:00.000Z", "trainer-a"),
        target("trainer-b-target", "2025-01-10T12:00:00.000Z", "trainer-b"),
      ],
      [
        run("2025-01-01T12:00:00.000Z", 1, "finished", "trainer-a"),
        run("2025-01-02T12:00:00.000Z", 2, "finished", "trainer-b"),
      ],
    );

    assert.deepEqual(metrics.get("trainer-a-target"), {
      trainerPriorRuns: 1,
      trainerPriorWins: 1,
      trainerPriorWinRate: 100,
    });
    assert.deepEqual(metrics.get("trainer-b-target"), {
      trainerPriorRuns: 1,
      trainerPriorWins: 0,
      trainerPriorWinRate: 0,
    });
  });

  test("trainer metrics are identical when targets are split across feature batches", () => {
    const targets = [
      target("target-1", "2025-01-02T12:00:00.000Z"),
      target("target-2", "2025-01-04T12:00:00.000Z"),
      target("target-3", "2025-01-06T12:00:00.000Z"),
      target("target-4", "2025-01-08T12:00:00.000Z"),
      target("target-5", "2025-01-10T12:00:00.000Z"),
    ];
    const runs = [
      run("2025-01-01T12:00:00.000Z", 1),
      run("2025-01-03T12:00:00.000Z", 2),
      run("2025-01-05T12:00:00.000Z", 1),
      run("2025-01-07T12:00:00.000Z", 2),
      run("2025-01-12T12:00:00.000Z", 1),
    ];
    const allAtOnce = calculateTrainerPriorMetricsForTargets(targets, runs);
    const recombined = new Map<string, TrainerPriorMetrics>();

    for (const batch of featureTargetBatches(targets, 2)) {
      for (const [targetRunnerId, metrics] of calculateTrainerPriorMetricsForTargets(batch, runs)) {
        assert.equal(recombined.has(targetRunnerId), false);
        recombined.set(targetRunnerId, metrics);
      }
    }

    assert.deepEqual(recombined, allAtOnce);
    assert.deepEqual(recombined.get("target-5"), {
      trainerPriorRuns: 4,
      trainerPriorWins: 2,
      trainerPriorWinRate: 50,
    });
  });
});

function target(
  targetRunnerId: string,
  raceDateTime: string,
  trainerId = "trainer-1",
): TrainerMetricTarget {
  return {
    targetRunnerId,
    trainerId,
    raceDateTime: new Date(raceDateTime),
  };
}

function run(
  raceDateTime: string,
  finishingPosition: number | null,
  resultStatus: string | null = "finished",
  trainerId = "trainer-1",
): TrainerPriorRun {
  return {
    trainerId,
    raceDateTime: new Date(raceDateTime),
    finishingPosition,
    resultStatus,
  };
}
