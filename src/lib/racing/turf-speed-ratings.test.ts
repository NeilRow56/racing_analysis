import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  calculateTurfSpeedRatingsFromContextForTest,
  canonicalLoadedContextForTest,
  missingPeerStandardKeysForTest,
  turfContextCacheKeyForTest,
} from "./turf-speed-ratings";

describe("Turf speed context cache identity", () => {
  test("canonicalises repeated standard context keys", () => {
    const cutoff = new Date("2025-09-01T12:30:00.000Z");

    assert.equal(
      turfContextCacheKeyForTest({
        kind: "standard",
        source: "sporting_life",
        cutoff,
        keys: ["ascot:1760:TURF", "york:1540:TURF", "ascot:1760:TURF"],
      }),
      turfContextCacheKeyForTest({
        kind: "standard",
        source: "sporting_life",
        cutoff,
        keys: ["york:1540:TURF", "ascot:1760:TURF"],
      }),
    );
  });

  test("keeps as-of, source and context kind isolated", () => {
    const base = turfContextCacheKeyForTest({
      kind: "standard",
      source: "sporting_life",
      cutoff: new Date("2025-09-01T12:30:00.000Z"),
      keys: ["ascot:1760:TURF"],
    });

    assert.notEqual(
      base,
      turfContextCacheKeyForTest({
        kind: "standard",
        source: "sporting_life",
        cutoff: new Date("2025-09-02T12:30:00.000Z"),
        keys: ["ascot:1760:TURF"],
      }),
    );
    assert.notEqual(
      base,
      turfContextCacheKeyForTest({
        kind: "standard",
        source: "other_source",
        cutoff: new Date("2025-09-01T12:30:00.000Z"),
        keys: ["ascot:1760:TURF"],
      }),
    );
    assert.notEqual(
      base,
      turfContextCacheKeyForTest({
        kind: "same-day",
        source: "sporting_life",
        cutoff: new Date("2025-09-01T12:30:00.000Z"),
        keys: ["2025-08-31:ascot:TURF"],
      }),
    );
  });
});

describe("Turf speed batch invariance", () => {
  test("returns identical ratings for large, reversed and partitioned target batches", () => {
    const first = race("target-a", "runner-a", "2026-01-05T12:00:00Z", "course-a", 100);
    const second = race("target-b", "runner-b", "2026-01-05T13:00:00Z", "course-a", 110);
    const context = {
      standardContexts: [
        ...standards("course-a", 100),
        first,
        second,
      ],
      sameDayContexts: [first, second],
    };
    const marginsByRaceId = margins(first, second);
    const large = calculateTurfSpeedRatingsFromContextForTest({ targets: [first, second], context, marginsByRaceId });
    const reversed = calculateTurfSpeedRatingsFromContextForTest({ targets: [second, first], context, marginsByRaceId });
    const partitioned = new Map([
      ...calculateTurfSpeedRatingsFromContextForTest({ targets: [first], context, marginsByRaceId }),
      ...calculateTurfSpeedRatingsFromContextForTest({ targets: [second], context, marginsByRaceId }),
    ]);
    assert.deepEqual([...large], [...reversed].reverse());
    assert.deepEqual([...large], [...partitioned]);
  });

  test("uses each target's own chronology when dates differ in one batch", () => {
    const earlier = race("target-early", "runner-early", "2026-01-04T12:00:00Z", "course-a", 101);
    const later = race("target-late", "runner-late", "2026-01-06T12:00:00Z", "course-a", 101);
    const lateStandards = [
      race("standard-late-a", null, "2026-01-05T10:00:00Z", "course-a", 140),
      race("standard-late-b", null, "2026-01-05T11:00:00Z", "course-a", 150),
    ];
    const context = {
      standardContexts: [...standards("course-a", 100), ...lateStandards, earlier, later],
      sameDayContexts: [earlier, later],
    };
    const marginsByRaceId = margins(earlier, later);
    const together = calculateTurfSpeedRatingsFromContextForTest({ targets: [earlier, later], context, marginsByRaceId });
    const earlyAlone = calculateTurfSpeedRatingsFromContextForTest({ targets: [earlier], context, marginsByRaceId });
    const lateAlone = calculateTurfSpeedRatingsFromContextForTest({ targets: [later], context, marginsByRaceId });
    assert.deepEqual(together.get("runner-early"), earlyAlone.get("runner-early"));
    assert.deepEqual(together.get("runner-late"), lateAlone.get("runner-late"));
    assert.notEqual(together.get("runner-early")?.rating, together.get("runner-late")?.rating);
  });

  test("does not treat a same-day peer key as a fully loaded standard key", () => {
    const target = race("target", "runner", "2026-01-05T12:00:00Z", "course-a", 100);
    const peer = race("peer", null, "2026-01-05T11:00:00Z", "course-b", 110);
    assert.deepEqual(missingPeerStandardKeysForTest([target], [target, peer]), ["course-b:1540:TURF"]);
    assert.deepEqual(missingPeerStandardKeysForTest([target, peer], [target, peer]), []);
  });

  test("does not inject arbitrary batch targets into canonical context populations", () => {
    const target = race("target", "runner", "2026-01-05T12:00:00Z", "course-a", 100);
    const standard = race("standard", null, "2026-01-04T12:00:00Z", "course-a", 101);
    const peer = race("peer", null, "2026-01-05T11:00:00Z", "course-a", 102);
    const context = canonicalLoadedContextForTest([target], [standard], [peer]);
    assert.deepEqual(context.standardContexts.map((row) => row.raceId), ["standard", "peer"]);
    assert.deepEqual(context.sameDayContexts.map((row) => row.raceId), ["peer"]);
  });
});

function race(raceId: string, runnerId: string | null, iso: string, courseId: string, seconds: number) {
  return {
    runnerId: runnerId ?? undefined,
    raceId,
    source: "sporting_life",
    sourceId: raceId,
    raceDate: iso.slice(0, 10),
    raceDateTime: new Date(iso),
    courseId,
    distanceYards: 1540,
    winningTime: `${Math.floor(seconds / 60)}m ${(seconds % 60).toFixed(2)}s`,
    raceName: "Flat Stakes",
    raceType: "Flat",
    raceTypeCode: "FLAT",
    surface: "TURF",
  };
}

function standards(courseId: string, base: number) {
  return [1, 2, 3].map((day, index) =>
    race(`${courseId}-standard-${day}`, null, `2026-01-0${day}T12:00:00Z`, courseId, base + index)
  );
}

function margins(...targets: ReturnType<typeof race>[]) {
  return new Map(targets.map((target) => [target.raceId, [{
    id: target.runnerId!,
    raceId: target.raceId,
    finishingPosition: 1,
    resultStatus: "finished",
    beatenDistance: null,
  }]]));
}
