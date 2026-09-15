import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  bestL3LargeGapThresholdFromDevelopmentGaps,
  bestL3TrustComponentCombination,
  bestL3TrustScore,
  bestL3TrustSpBand,
} from "./best-l3-trust-score";

describe("best L3 trust score", () => {
  test("uses the top quartile of positive development gaps as the large-gap threshold", () => {
    assert.equal(
      bestL3LargeGapThresholdFromDevelopmentGaps([null, -1, 0, 1, 2, 3, 4, 100]),
      4,
    );
  });

  test("returns null threshold when no positive development gaps exist", () => {
    assert.equal(bestL3LargeGapThresholdFromDevelopmentGaps([null, -1, 0]), null);
  });

  test("scores one point for each diagnostic trust component", () => {
    const result = bestL3TrustScore({
      topGapToRank2: 12,
      largeGapThreshold: 10,
      trainerPriorWinRate: 15,
      fieldSize: 5,
    });

    assert.equal(result.score, 3);
    assert.deepEqual(result.components, {
      largeGap: true,
      trainerStrike: true,
      smallField: true,
    });
  });

  test("does not award trainer point when trainer strike is missing", () => {
    const result = bestL3TrustScore({
      topGapToRank2: 12,
      largeGapThreshold: 10,
      trainerPriorWinRate: null,
      fieldSize: 5,
    });

    assert.equal(result.score, 2);
    assert.equal(result.components.trainerStrike, false);
  });

  test("does not award large-gap point when the frozen threshold is missing", () => {
    const result = bestL3TrustScore({
      topGapToRank2: 100,
      largeGapThreshold: null,
      trainerPriorWinRate: 14.999,
      fieldSize: 6,
    });

    assert.equal(result.score, 0);
    assert.deepEqual(result.components, {
      largeGap: false,
      trainerStrike: false,
      smallField: false,
    });
  });

  test("classifies exact component combinations deterministically", () => {
    assert.equal(bestL3TrustComponentCombination({
      largeGap: false,
      trainerStrike: false,
      smallField: false,
    }), "none");
    assert.equal(bestL3TrustComponentCombination({
      largeGap: true,
      trainerStrike: false,
      smallField: false,
    }), "large_gap_only");
    assert.equal(bestL3TrustComponentCombination({
      largeGap: true,
      trainerStrike: true,
      smallField: false,
    }), "large_gap_and_trainer");
    assert.equal(bestL3TrustComponentCombination({
      largeGap: true,
      trainerStrike: true,
      smallField: true,
    }), "all_three");
  });

  test("classifies decimal SP bands and rejects unusable SP", () => {
    assert.equal(bestL3TrustSpBand(null), null);
    assert.equal(bestL3TrustSpBand(0), null);
    assert.equal(bestL3TrustSpBand(1.99), "lt_2");
    assert.equal(bestL3TrustSpBand(2), "2_00_to_2_99");
    assert.equal(bestL3TrustSpBand(3), "3_00_to_4_99");
    assert.equal(bestL3TrustSpBand(5), "5_00_to_7_99");
    assert.equal(bestL3TrustSpBand(8), "8_plus");
  });
});
