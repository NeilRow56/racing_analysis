import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  JUMP_RATING_A_VERSION,
  JUMP_RATING_B_VERSION,
  calculateJumpRaceRatings,
  type JumpRatingInput,
} from "./jump-performance-rating";

describe("Jump Performance Rating prototypes", () => {
  test("uses equal complete-case component-rank averages", () => {
    const ratings = calculateJumpRaceRatings([
      input("a", { averageJumpSpeedLast3: 120, trainerPriorStrikeRate: 10, officialRating: 140 }),
      input("b", { averageJumpSpeedLast3: 110, trainerPriorStrikeRate: 20, officialRating: 120 }),
      input("c", { averageJumpSpeedLast3: 100, trainerPriorStrikeRate: 5, officialRating: 130 }),
    ]);

    assert.deepEqual(ratings.get("a"), {
      components: {
        averageJumpSpeedLast3: 1,
        trainerPriorStrikeRate: 2,
        officialRating: 1,
      },
      jprA: { version: JUMP_RATING_A_VERSION, score: 1.5, rank: 1 },
      jprB: { version: JUMP_RATING_B_VERSION, score: 1, rank: 1 },
    });
    assert.equal(ratings.get("b")?.jprA?.score, 1.5);
    assert.equal(ratings.get("b")?.jprA?.rank, 1);
  });

  test("preserves component and composite competition ties", () => {
    const ratings = calculateJumpRaceRatings([
      input("a", { averageJumpSpeedLast3: 120, trainerPriorStrikeRate: 20 }),
      input("b", { averageJumpSpeedLast3: 120, trainerPriorStrikeRate: 20 }),
      input("c", { averageJumpSpeedLast3: 100, trainerPriorStrikeRate: 10 }),
    ]);

    assert.equal(ratings.get("a")?.components.averageJumpSpeedLast3, 1);
    assert.equal(ratings.get("b")?.components.averageJumpSpeedLast3, 1);
    assert.equal(ratings.get("a")?.jprA?.rank, 1);
    assert.equal(ratings.get("b")?.jprA?.rank, 1);
    assert.equal(ratings.get("c")?.jprA?.rank, 3);
  });

  test("leaves incomplete candidates unrated without imputation", () => {
    const ratings = calculateJumpRaceRatings([
      input("complete", {}),
      input("missing-trainer", { trainerPriorStrikeRate: null }),
      input("missing-or", { officialRating: null }),
    ]);

    assert.equal(ratings.get("missing-trainer")?.jprA, null);
    assert.notEqual(ratings.get("missing-trainer")?.jprB, null);
    assert.notEqual(ratings.get("missing-or")?.jprA, null);
    assert.equal(ratings.get("missing-or")?.jprB, null);
  });

  test("excludes non-runners before ranking", () => {
    const ratings = calculateJumpRaceRatings([
      input("runner", { averageJumpSpeedLast3: 100, trainerPriorStrikeRate: 10 }),
      input("non-runner", {
        averageJumpSpeedLast3: 200,
        trainerPriorStrikeRate: 30,
        resultStatus: "non_runner",
      }),
    ]);

    assert.equal(ratings.get("runner")?.jprA?.rank, 1);
    assert.equal(ratings.get("non-runner")?.jprA, null);
    assert.deepEqual(ratings.get("non-runner")?.components, {
      averageJumpSpeedLast3: null,
      trainerPriorStrikeRate: null,
      officialRating: null,
    });
  });

  test("uses identical calculation semantics for Chase and Hurdle inputs", () => {
    const chase = calculateJumpRaceRatings([
      input("one", {}),
      input("two", { averageJumpSpeedLast3: 90, trainerPriorStrikeRate: 8 }),
    ]);
    const hurdle = calculateJumpRaceRatings([
      input("one", {}),
      input("two", { averageJumpSpeedLast3: 90, trainerPriorStrikeRate: 8 }),
    ]);
    assert.deepEqual(chase, hurdle);
  });
});

function input(
  runnerId: string,
  overrides: Partial<JumpRatingInput>,
): JumpRatingInput {
  return {
    runnerId,
    resultStatus: null,
    averageJumpSpeedLast3: 100,
    trainerPriorStrikeRate: 10,
    officialRating: 100,
    ...overrides,
  };
}
