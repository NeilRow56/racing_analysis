import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { calculateJumpRaceRatings, type JumpRatingInput } from "./jump-performance-rating";
import {
  calculateJumpRaceA0Ratings,
  JUMP_RATING_A0_VERSION,
} from "./jump-performance-rating-a0";

describe("JPR_A0_V1", () => {
  test("preserves normal JPR-A scores and adds trainer fallback on the same rank scale", () => {
    const inputs = [
      runner("normal-a", 120, 10, 1),
      runner("fallback", null, 30, 999),
      runner("normal-b", 100, 20, 500),
    ];
    const frozenA = calculateJumpRaceRatings(inputs);
    const a0 = calculateJumpRaceA0Ratings(inputs);

    assert.equal(frozenA.get("normal-a")?.jprA?.score, 2);
    assert.equal(a0.get("normal-a")?.score, frozenA.get("normal-a")?.jprA?.score);
    assert.equal(a0.get("normal-a")?.ratingSource, "normal_jpr_a");
    assert.equal(a0.get("fallback")?.score, 1);
    assert.equal(a0.get("fallback")?.rank, 1);
    assert.equal(a0.get("fallback")?.ratingSource, "trainer_fallback");
    assert.equal(a0.get("fallback")?.version, JUMP_RATING_A0_VERSION);
  });

  test("leaves a speedless runner without trainer strike rate unrated", () => {
    const ratings = calculateJumpRaceA0Ratings([
      runner("unrated", null, null, 200),
      runner("rated", 100, 10, 1),
    ]);
    assert.equal(ratings.get("unrated"), null);
  });

  test("does not use official rating", () => {
    const lowOr = calculateJumpRaceA0Ratings([
      runner("fallback", null, 20, 1),
      runner("other", null, 10, 200),
    ]);
    const highOr = calculateJumpRaceA0Ratings([
      runner("fallback", null, 20, 999),
      runner("other", null, 10, 1),
    ]);
    assert.deepEqual(lowOr, highOr);
  });

  test("uses competition ranking for equal mixed-source scores", () => {
    const ratings = calculateJumpRaceA0Ratings([
      runner("normal", 100, 10, null),
      runner("fallback", null, 20, null),
      runner("third", 90, 30, null),
    ]);
    assert.equal(ratings.get("normal")?.score, 2);
    assert.equal(ratings.get("fallback")?.score, 2);
    assert.equal(ratings.get("normal")?.rank, 2);
    assert.equal(ratings.get("fallback")?.rank, 2);
    assert.equal(ratings.get("third")?.rank, 1);
  });
});

function runner(
  runnerId: string,
  averageJumpSpeedLast3: number | null,
  trainerPriorStrikeRate: number | null,
  officialRating: number | null,
): JumpRatingInput {
  return { runnerId, resultStatus: null, averageJumpSpeedLast3, trainerPriorStrikeRate, officialRating };
}
