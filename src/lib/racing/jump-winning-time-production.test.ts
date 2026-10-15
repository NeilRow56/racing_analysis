import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { winningTimeCorrections, correctedWinningTime } from "./winning-time-corrections";
import { calculateJumpSpeedRating } from "./jump-speed-rating";
import { jumpWinningTimeReviews, type JumpTimingContext } from "./jump-winning-time-references";

describe("audited corrections and production guard", () => {
  test("all ten corrections preserve raw values, are idempotent and reject unreviewed disagreement", () => {
    assert.equal(winningTimeCorrections.length, 10);
    for (const c of winningTimeCorrections) {
      const payload = { winning_time: c.original, race_id: c.sourceId };
      const before = JSON.stringify(payload);
      assert.equal(correctedWinningTime(c.sourceId, c.raceDate, payload.winning_time), c.corrected);
      assert.equal(correctedWinningTime(c.sourceId, c.raceDate, c.corrected), c.corrected);
      assert.equal(JSON.stringify(payload), before);
      assert.throws(() => correctedWinningTime(c.sourceId, c.raceDate, "9m 59.00s"));
    }
    assert.equal(correctedWinningTime("unconfirmed", "2025-01-01", "4m 2.40s"), "4m 2.40s");
  });
  const target: JumpTimingContext = { raceId: "904023", courseId: "Newcastle", distanceYards: 4419, raceName: "Handicap Chase", raceType: "handicap", winningTime: "4m 13.53s" };
  const peers = [306, 310, 312, 315, 318, 322].map((s, i) => ({ ...target, raceId: `peer-${i}`, winningTime: `${s}s` }));
  function rating(time: string, refs = peers) {
    const row = { ...target, winningTime: time };
    return calculateJumpSpeedRating({ ...row, baseStandardSeconds: 315.11, standardSampleSize: refs.length, cumulativeBeatenLengths: 2, winningTimeReview: jumpWinningTimeReviews([...refs, row]).get(row.raceId) });
  }
  test("original Newcastle time is withheld in the production calculator; corrected and ordinary fast races remain usable", () => {
    const bad = rating("4m 13.53s");
    assert.equal(bad.method, "withheld"); assert.equal(bad.rating, null);
    assert.equal(bad.withheldReason, "LIKELY_MISSING_MINUTE");
    assert.equal(bad.baseRating, null);
    assert.ok(Math.abs(rating("5m 14.41s").rating! - 100.6026) < 0.001);
    assert.equal(rating("4m 55s").method, "base");
  });
  test("a single peer cannot withhold; unrelated types/courses/distances are excluded", () => {
    assert.equal(rating("4m 13.53s", peers.slice(0, 1)).method, "unavailable");
    const unrelated = [...peers.map((r) => ({ ...r, courseId: "Elsewhere" })), ...peers.map((r) => ({ ...r, distanceYards: 3520 })), ...peers.map((r) => ({ ...r, raceName: "Novices Hurdle" }))];
    assert.equal(jumpWinningTimeReviews([...unrelated, target]).get(target.raceId)!.sampleSize, 0);
  });
});
