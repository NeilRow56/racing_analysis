import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { assessJumpWinningTime, reviewJumpMissingMinute } from "./jump-winning-time-integrity";
import { calculateJumpSpeedRating } from "./jump-speed-rating";
import { jumpWinningTimeReviews, type JumpTimingContext } from "./jump-winning-time-references";

describe("targeted missing-minute winning-time guard", () => {
  const peers = [306, 310, 312, 315, 318, 322];
  test("confirmed Newcastle omission is caught with explicit diagnostics", () => {
    const review = assessJumpWinningTime(253.53, peers);
    assert.equal(review.missingMinute.classification, "LIKELY_MISSING_MINUTE");
    assert.equal(review.shouldWithhold, true);
    assert.equal(review.missingMinute.candidatePlus60, 313.53);
  });
  test("ordinary fast, corrected, slow and invalid times are not missing-minute errors", () => {
    for (const time of [295, 314.41, 375, 0, -1, NaN, Infinity]) {
      assert.equal(reviewJumpMissingMinute(time, peers).classification, "NO_MISSING_MINUTE_SIGNAL");
    }
    assert.equal(reviewJumpMissingMinute(253.53, []).classification, "NO_MISSING_MINUTE_SIGNAL");
  });
  test("tolerates observed +60.88s and +60.51s differences, without exact equality", () => {
    assert.equal(reviewJumpMissingMinute(253.53, [313, 314.41, 316]).classification, "LIKELY_MISSING_MINUTE");
    assert.equal(reviewJumpMissingMinute(249.18, [308, 309.69, 312]).classification, "LIKELY_MISSING_MINUTE");
  });
  test("two exact peers can add coverage; one cannot; a poor +60 hypothesis is rejected", () => {
    const sparse = assessJumpWinningTime(250, [309, 311]);
    assert.equal(sparse.genericShouldWithhold, false);
    assert.equal(sparse.shouldWithhold, true);
    assert.equal(assessJumpWinningTime(316.5, [375.3]).shouldWithhold, false);
    // Confirmed Killarney: the hypothesis is still too fast against its tight two-peer reference.
    assert.equal(assessJumpWinningTime(244.9, [327, 331]).shouldWithhold, false);
    assert.equal(reviewJumpMissingMinute(242.4, [370, 380, 390]).classification, "NO_MISSING_MINUTE_SIGNAL");
    // Candidate improves, but remains too slow in a tightly clustered reference.
    assert.equal(reviewJumpMissingMinute(250, [295, 296, 297]).classification, "NO_MISSING_MINUTE_SIGNAL");
  });
  test("withholds every computed figure with an explicit reason and never corrects input", () => {
    const input = { raceName: "Handicap Chase", distanceYards: 4419, winningTime: "4m 13.53s",
      baseStandardSeconds: 315.11, standardSampleSize: 6, cumulativeBeatenLengths: 2,
      sameDayAdjustmentSecondsPerFurlong: 0.1, sameDayPeerCount: 6, sameDayStdevSecondsPerFurlong: 0.1,
      winningTimeReview: assessJumpWinningTime(253.53, peers) };
    const before = structuredClone(input);
    const result = calculateJumpSpeedRating(input);
    assert.deepEqual(input, before);
    assert.equal(result.method, "withheld");
    assert.equal(result.withheldReason, "LIKELY_MISSING_MINUTE");
    assert.equal(result.rating, null);
    assert.equal(result.baseRating, null);
    assert.equal(result.sameDayAdjustedRating, null);
    // The time diagnostic still withholds when a production rating standard is unavailable.
    assert.equal(calculateJumpSpeedRating({ ...input, baseStandardSeconds: null, standardSampleSize: null }).withheldReason, "LIKELY_MISSING_MINUTE");
  });
  test("exact references exclude target, other courses, distances, subtypes and AWT bumpers", () => {
    const target: JumpTimingContext = { raceId: "target", courseId: "course", distanceYards: 4400,
      winningTime: "253.53s", raceName: "Handicap Chase", raceType: "handicap" };
    const refs = peers.map((seconds, i) => ({ ...target, raceId: `peer-${i}`, winningTime: `${seconds}s` }));
    assert.equal(jumpWinningTimeReviews([...refs, target]).get(target.raceId)!.missingMinute.sampleSize, peers.length);
    for (const change of [{ courseId: "other" }, { distanceYards: 4410 }, { raceName: "Handicap Hurdle" }, { raceName: "NH Flat Race (AWT)" }]) {
      const review = jumpWinningTimeReviews([...refs.map((r) => ({ ...r, ...change })), target]).get(target.raceId)!;
      assert.equal(review.sampleSize, 0);
      assert.equal(review.shouldWithhold, false);
    }
    const bumper = { ...target, raceName: "NH Flat Race" };
    const awt = refs.map((r) => ({ ...r, raceName: "NH Flat Race (AWT)" }));
    assert.equal(jumpWinningTimeReviews([...awt, bumper]).get(target.raceId)!.sampleSize, 0);
  });
});
