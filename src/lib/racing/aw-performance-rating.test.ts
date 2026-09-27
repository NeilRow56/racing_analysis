import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  AW_RATING_A_VERSION,
  AW_RATING_D_VERSION,
  calculateAwRaceRatings,
  type AwRatingInput,
} from "./aw-performance-rating";

describe("All Weather Performance Rating V1", () => {
  test("uses the frozen AW-D three-component and AW-A two-component means", () => {
    const ratings = calculateAwRaceRatings([
      input("a", { averageAwSpeedLast3: 120, trainerPriorStrikeRate: 10, jockeyPriorStrikeRate: 20 }),
      input("b", { averageAwSpeedLast3: 110, trainerPriorStrikeRate: 20, jockeyPriorStrikeRate: 10 }),
      input("c", { averageAwSpeedLast3: 100, trainerPriorStrikeRate: 5, jockeyPriorStrikeRate: 5 }),
    ]);

    assert.deepEqual(ratings.get("a"), {
      components: {
        averageAwSpeedLast3: 1,
        trainerPriorStrikeRate: 2,
        jockeyPriorStrikeRate: 1,
      },
      awD: { version: AW_RATING_D_VERSION, score: 4 / 3, rank: 1 },
      awA: { version: AW_RATING_A_VERSION, score: 1.5, rank: 1 },
    });
    assert.equal(ratings.get("b")?.awD?.score, 5 / 3);
    assert.equal(ratings.get("b")?.awA?.score, 1.5);
  });

  test("preserves component and composite competition ties", () => {
    const ratings = calculateAwRaceRatings([
      input("a", {}),
      input("b", {}),
      input("c", { averageAwSpeedLast3: 90, trainerPriorStrikeRate: 5, jockeyPriorStrikeRate: 5 }),
    ]);

    assert.equal(ratings.get("a")?.components.averageAwSpeedLast3, 1);
    assert.equal(ratings.get("b")?.components.averageAwSpeedLast3, 1);
    assert.equal(ratings.get("a")?.awD?.rank, 1);
    assert.equal(ratings.get("b")?.awD?.rank, 1);
    assert.equal(ratings.get("c")?.awD?.rank, 3);
  });

  test("leaves a candidate unrated when any required component is missing", () => {
    const ratings = calculateAwRaceRatings([
      input("complete", {}),
      input("missing-trainer", { trainerPriorStrikeRate: null }),
      input("missing-jockey", { jockeyPriorStrikeRate: null }),
    ]);

    assert.equal(ratings.get("missing-trainer")?.awD, null);
    assert.equal(ratings.get("missing-trainer")?.awA, null);
    assert.equal(ratings.get("missing-jockey")?.awD, null);
    assert.notEqual(ratings.get("missing-jockey")?.awA, null);
  });

  test("can produce an AW-D and AW-A rank-1 disagreement", () => {
    const ratings = calculateAwRaceRatings([
      input("a", { averageAwSpeedLast3: 100, trainerPriorStrikeRate: 30, jockeyPriorStrikeRate: 30 }),
      input("b", { averageAwSpeedLast3: 120, trainerPriorStrikeRate: 20, jockeyPriorStrikeRate: 10 }),
      input("c", { averageAwSpeedLast3: 110, trainerPriorStrikeRate: 10, jockeyPriorStrikeRate: 20 }),
    ]);

    assert.equal(ratings.get("a")?.awD?.rank, 1);
    assert.equal(ratings.get("b")?.awA?.rank, 1);
  });

  test("excludes non-runners before component ranking", () => {
    const ratings = calculateAwRaceRatings([
      input("runner", {}),
      input("non-runner", {
        averageAwSpeedLast3: 200,
        trainerPriorStrikeRate: 30,
        jockeyPriorStrikeRate: 30,
        resultStatus: "non_runner",
      }),
    ]);

    assert.equal(ratings.get("runner")?.awD?.rank, 1);
    assert.equal(ratings.get("non-runner")?.awD, null);
  });
});

function input(runnerId: string, overrides: Partial<AwRatingInput>): AwRatingInput {
  return {
    runnerId,
    resultStatus: null,
    averageAwSpeedLast3: 100,
    trainerPriorStrikeRate: 10,
    jockeyPriorStrikeRate: 10,
    ...overrides,
  };
}
