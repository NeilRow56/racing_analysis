import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import {
  emptyTissueValueReviewData,
  loadTissueValueReviews,
  saveTissueValueReview,
  summarizeTissueValueReviews,
  tissueValueReviewKey,
  tissueValueReviewMap,
  upsertTissueValueReview,
  type TissueValueReviewData,
} from "./tissue-value-review";

describe("Tissue VALUE post-race reviews", () => {
  test("stores reviews in a separate layer without altering prospective evidence", () => {
    const frozenSelection = {
      raceId: "race-1",
      top1: "runner-1",
      recordedPreRace: true,
      recordedAt: "2026-10-01T10:00:00.000Z",
      prices: { t60: { decimalPrice: 5.5, ratingEdgePercentagePoints: 3.2 } },
      selectedPriceProfitLoss: { t60: -1, finalSp: -1 },
      settledAt: "2026-10-01T15:10:00.000Z",
    };
    const before = JSON.stringify(frozenSelection);

    const reviews = upsertTissueValueReview(emptyTissueValueReviewData(), {
      family: "aw",
      raceId: "race-1",
      runnerId: "runner-1",
      status: "reviewed",
      outcomeSummary: "unplaced",
      tags: ["BAD_DRAW_OR_WIDE_TRIP"],
      couldHaveBeenIdentifiedPreRace: null,
      note: "Wide stall over sharp 5f.",
      updatedAt: "2026-10-02T09:00:00.000Z",
    });

    assert.equal(JSON.stringify(frozenSelection), before);
    assert.equal(reviews.reviews.length, 1);
    assert.equal(reviews.reviews[0]!.raceId, frozenSelection.raceId);
  });

  test("saves multiple tags for one review", () => {
    const data = reviewData([
      {
        raceId: "race-1",
        runnerId: "runner-1",
        outcomeSummary: "unplaced",
        tags: ["BAD_DRAW_OR_WIDE_TRIP", "DENIED_CLEAR_RUN"],
      },
    ]);
    const review = data.reviews[0]!;
    assert.deepEqual(review.tags, ["BAD_DRAW_OR_WIDE_TRIP", "DENIED_CLEAR_RUN"]);
  });

  test("persists reviews after reload", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tissue-value-review-"));
    const path = join(dir, "reviews.json");
    try {
      await saveTissueValueReview({
        family: "jump",
        raceId: "race-2",
        runnerId: "runner-2",
        status: "reviewed",
        outcomeSummary: "winner",
        tags: ["OTHER", "NEVER_TRAVELLED"],
        couldHaveBeenIdentifiedPreRace: null,
        note: "Won despite review note.",
        updatedAt: "2026-10-02T09:00:00.000Z",
      }, path);
      const reloaded = await loadTissueValueReviews(path);
      const review = tissueValueReviewMap(reloaded).get(tissueValueReviewKey({ family: "jump", raceId: "race-2", runnerId: "runner-2" }));
      assert.equal(review?.status, "reviewed");
      assert.deepEqual(review?.tags, ["OTHER", "NEVER_TRAVELLED"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("Turf reviews save and reload from the shared store", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tissue-value-review-"));
    const path = join(dir, "reviews.json");
    try {
      await saveTissueValueReview({
        family: "turf",
        raceId: "turf-race",
        runnerId: "turf-runner",
        status: "reviewed",
        outcomeSummary: "unplaced",
        tags: ["BAD_DRAW_OR_WIDE_TRIP", "GROUND_UNSUITABLE"],
        couldHaveBeenIdentifiedPreRace: null,
        note: "Wide throughout on ground softer than ideal.",
        updatedAt: "2026-10-02T09:00:00.000Z",
      }, path);
      const reloaded = await loadTissueValueReviews(path);
      const review = tissueValueReviewMap(reloaded).get("turf:turf-race:turf-runner");
      assert.equal(review?.family, "turf");
      assert.equal(review?.status, "reviewed");
      assert.deepEqual(review?.tags, ["BAD_DRAW_OR_WIDE_TRIP", "GROUND_UNSUITABLE"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("Turf and Jump/AW reviews coexist with distinct family keys", () => {
    let data = emptyTissueValueReviewData();
    for (const family of ["turf", "jump", "aw"] as const) {
      data = upsertTissueValueReview(data, {
        family,
        raceId: "shared-race",
        runnerId: "shared-runner",
        status: "reviewed",
        outcomeSummary: "unplaced",
        tags: ["BAD_DRAW_OR_WIDE_TRIP"],
        couldHaveBeenIdentifiedPreRace: null,
        note: family,
        updatedAt: "2026-10-02T09:00:00.000Z",
      });
    }
    const reviews = tissueValueReviewMap(data);
    assert.equal(data.reviews.length, 3);
    assert.equal(reviews.get("turf:shared-race:shared-runner")?.note, "turf");
    assert.equal(reviews.get("jump:shared-race:shared-runner")?.note, "jump");
    assert.equal(reviews.get("aw:shared-race:shared-runner")?.note, "aw");
    assert.notEqual(
      tissueValueReviewKey({ family: "turf", raceId: "shared-race", runnerId: "shared-runner" }),
      tissueValueReviewKey({ family: "jump", raceId: "shared-race", runnerId: "shared-runner" }),
    );
  });

  test("allows winners and losers to both be reviewed", () => {
    const data = reviewData([
      { raceId: "race-1", runnerId: "runner-1", outcomeSummary: "winner", tags: ["PACE_UNSUITABLE"] },
      { raceId: "race-2", runnerId: "runner-2", outcomeSummary: "unplaced", tags: ["HAMPERED"] },
    ]);
    const summary = summarizeTissueValueReviews(data);
    assert.equal(summary.reviewed, 2);
    assert.equal(summary.reviewedLosers, 1);
    assert.equal(summary.resultsByTag.PACE_UNSUITABLE.winner, 1);
    assert.equal(summary.resultsByTag.HAMPERED.unplaced, 1);
  });

  test("does not alter clean P/L or settlement fields", () => {
    const settledSelection = {
      settledAt: "2026-10-01T15:10:00.000Z",
      winners: ["runner-9"],
      selectedPriceProfitLoss: { early: -1, t180: -1, t60: -1, bestEarly: -1, finalSp: -1 },
      runners: [{ runnerId: "runner-1", outcome: { won: false, finalSpProfitLoss: -1 } }],
    };
    const before = structuredClone(settledSelection);
    upsertTissueValueReview(emptyTissueValueReviewData(), {
      family: "aw",
      raceId: "race-3",
      runnerId: "runner-1",
      status: "reviewed",
      outcomeSummary: "unplaced",
      tags: ["DENIED_CLEAR_RUN"],
      couldHaveBeenIdentifiedPreRace: null,
      note: "Checked in running.",
      updatedAt: "2026-10-02T09:00:00.000Z",
    });
    assert.deepEqual(settledSelection, before);
  });

  test("builds diagnostic tag counts and grouped outcomes", () => {
    const data = reviewData([
      { raceId: "race-1", runnerId: "runner-1", outcomeSummary: "unplaced", tags: ["BAD_DRAW_OR_WIDE_TRIP", "DENIED_CLEAR_RUN"] },
      { raceId: "race-2", runnerId: "runner-2", outcomeSummary: "placed_non_winner", tags: ["BAD_DRAW_OR_WIDE_TRIP"] },
      { raceId: "race-3", runnerId: "runner-3", outcomeSummary: "winner", tags: ["DENIED_CLEAR_RUN"] },
    ]);
    const summary = summarizeTissueValueReviews(data);
    assert.equal(summary.reviewedLosers, 2);
    assert.equal(summary.taggedReviews, 3);
    assert.equal(summary.tagCounts.BAD_DRAW_OR_WIDE_TRIP, 2);
    assert.equal(summary.tagCounts.DENIED_CLEAR_RUN, 2);
    assert.equal(summary.resultsByTag.BAD_DRAW_OR_WIDE_TRIP.unplaced, 1);
    assert.equal(summary.resultsByTag.BAD_DRAW_OR_WIDE_TRIP.placed_non_winner, 1);
    assert.equal(summary.resultsByTag.DENIED_CLEAR_RUN.winner, 1);
  });

  test("Turf review tags appear in diagnostics without changing prospective evidence", () => {
    const frozenEvidence = {
      family: "turf",
      raceId: "turf-race",
      tissueRunnerId: "runner-1",
      tissueProbability: .31,
      tissueCapturedDecimalOdds: 5,
      tissueEdgePercentagePoints: 11,
      settledAt: "2026-10-02T15:00:00.000Z",
    };
    const before = structuredClone(frozenEvidence);
    const data = upsertTissueValueReview(emptyTissueValueReviewData(), {
      family: "turf",
      raceId: "turf-race",
      runnerId: "runner-1",
      status: "reviewed",
      outcomeSummary: "unplaced",
      tags: ["BAD_DRAW_OR_WIDE_TRIP", "DENIED_CLEAR_RUN", "GROUND_UNSUITABLE"],
      couldHaveBeenIdentifiedPreRace: null,
      note: "Kept wide and met trouble.",
      updatedAt: "2026-10-02T09:00:00.000Z",
    });
    const summary = summarizeTissueValueReviews(data);
    assert.equal(summary.tagCounts.BAD_DRAW_OR_WIDE_TRIP, 1);
    assert.equal(summary.tagCounts.DENIED_CLEAR_RUN, 1);
    assert.equal(summary.tagCounts.GROUND_UNSUITABLE, 1);
    assert.equal(summary.resultsByTag.BAD_DRAW_OR_WIDE_TRIP.unplaced, 1);
    assert.deepEqual(frozenEvidence, before);
  });

  test("normalizes older review tags into the post-race vocabulary", () => {
    const data = upsertTissueValueReview(emptyTissueValueReviewData(), {
      family: "aw",
      raceId: "race-legacy",
      runnerId: "runner-legacy",
      status: "reviewed",
      outcomeSummary: "unplaced",
      tags: ["wide_trip", "trouble_in_running", "going_concern"] as never,
      couldHaveBeenIdentifiedPreRace: "yes",
      note: "Legacy tags should stay useful.",
      updatedAt: "2026-10-02T09:00:00.000Z",
    });
    assert.deepEqual(data.reviews[0]!.tags, ["BAD_DRAW_OR_WIDE_TRIP", "DENIED_CLEAR_RUN", "GROUND_UNSUITABLE"]);
  });

  test("trims post-race review notes to a short research note", () => {
    const data = upsertTissueValueReview(emptyTissueValueReviewData(), {
      family: "jump",
      raceId: "race-note",
      runnerId: "runner-note",
      status: "reviewed",
      outcomeSummary: "unplaced",
      tags: ["OTHER"],
      couldHaveBeenIdentifiedPreRace: null,
      note: ` ${"x".repeat(1200)} `,
      updatedAt: "2026-10-02T09:00:00.000Z",
    });
    assert.equal(data.reviews[0]!.note.length, 1000);
  });
});

function reviewData(entries: Array<{
  raceId: string;
  runnerId: string;
  outcomeSummary: "winner" | "placed_non_winner" | "unplaced" | "non_runner";
  tags: Array<"BAD_DRAW_OR_WIDE_TRIP" | "DENIED_CLEAR_RUN" | "OTHER" | "NEVER_TRAVELLED" | "PACE_UNSUITABLE" | "HAMPERED" | "GROUND_UNSUITABLE">;
  couldHaveBeenIdentifiedPreRace?: "yes" | "no" | "unclear" | null;
}>): TissueValueReviewData {
  return entries.reduce((data, entry) => upsertTissueValueReview(data, {
    family: "aw",
    raceId: entry.raceId,
    runnerId: entry.runnerId,
    status: "reviewed",
    outcomeSummary: entry.outcomeSummary,
    tags: entry.tags,
    couldHaveBeenIdentifiedPreRace: entry.couldHaveBeenIdentifiedPreRace ?? null,
    note: "",
    updatedAt: "2026-10-02T09:00:00.000Z",
  }), emptyTissueValueReviewData());
}
