import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { turfContextCacheKeyForTest } from "./turf-speed-ratings";

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
