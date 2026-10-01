import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  AW_RATING_A_VERSION,
  AW_RATING_D_VERSION,
  calculateAwDRatingCoverage,
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

  test("applies the AW-D race coverage guard after preserving scores", () => {
    const elevenWithOneRated = Array.from({ length: 11 }, (_, index) => input(String(index + 1), {
      averageAwSpeedLast3: index === 0 ? 100 : null,
      trainerPriorStrikeRate: index === 0 ? 20 : 10,
      jockeyPriorStrikeRate: index === 0 ? 20 : 10,
    }));
    const oneRatedRatings = calculateAwRaceRatings(elevenWithOneRated);
    const oneRatedCoverage = calculateAwDRatingCoverage(elevenWithOneRated, oneRatedRatings);
    assert.equal(oneRatedCoverage.activeRunnerCount, 11);
    assert.equal(oneRatedCoverage.ratedRunnerCount, 1);
    assert.equal(Math.round(oneRatedCoverage.ratingCoverage * 10000) / 100, 9.09);
    assert.equal(oneRatedCoverage.ratingCoverageStatus, "insufficient_coverage");
    assert.equal(oneRatedRatings.get("1")?.awD?.score, 1);

    const twoOfEleven = elevenWithOneRated.map((runner, index) =>
      index === 1 ? { ...runner, averageAwSpeedLast3: 90, trainerPriorStrikeRate: 15, jockeyPriorStrikeRate: 15 } : runner
    );
    assert.equal(
      calculateAwDRatingCoverage(twoOfEleven, calculateAwRaceRatings(twoOfEleven)).ratingCoverageStatus,
      "insufficient_coverage",
    );

    const threeOfEleven = twoOfEleven.map((runner, index) =>
      index === 2 ? { ...runner, averageAwSpeedLast3: 80, trainerPriorStrikeRate: 12, jockeyPriorStrikeRate: 12 } : runner
    );
    assert.equal(
      calculateAwDRatingCoverage(threeOfEleven, calculateAwRaceRatings(threeOfEleven)).ratingCoverageStatus,
      "eligible",
    );

    const twoOfFive = Array.from({ length: 5 }, (_, index) => input(String(index + 1), {
      averageAwSpeedLast3: index < 2 ? 100 - index : null,
      trainerPriorStrikeRate: index < 2 ? 20 - index : 10,
      jockeyPriorStrikeRate: index < 2 ? 20 - index : 10,
    }));
    assert.equal(
      calculateAwDRatingCoverage(twoOfFive, calculateAwRaceRatings(twoOfFive)).ratingCoverageStatus,
      "eligible",
    );

    const withNonRunner = [...twoOfFive, input("nr", {
      averageAwSpeedLast3: null,
      trainerPriorStrikeRate: null,
      jockeyPriorStrikeRate: null,
      resultStatus: "non_runner",
    })];
    const nonRunnerCoverage = calculateAwDRatingCoverage(withNonRunner, calculateAwRaceRatings(withNonRunner));
    assert.equal(nonRunnerCoverage.activeRunnerCount, 5);
    assert.equal(nonRunnerCoverage.ratedRunnerCount, 2);
    assert.equal(nonRunnerCoverage.ratingCoverageStatus, "eligible");
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
