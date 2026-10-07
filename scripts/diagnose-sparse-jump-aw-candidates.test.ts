import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  summarizeCandidateSelections,
  type CandidateSelection,
} from "./diagnose-sparse-jump-aw-candidates";

describe("sparse Jump/AW candidate diagnostics", () => {
  test("summarizes canonical settlement, no-selection rate, losing run and drawdown", () => {
    const selections = [
      selection("race-1", "runner-1", "2026-01-01", true, 4),
      selection("race-2", "runner-2", "2026-01-01", false, 3),
      selection("race-3", "runner-3", "2026-01-02", false, 5),
      selection("race-4", "runner-4", "2026-01-03", true, 2),
    ];

    const summary = summarizeCandidateSelections(selections, 10);

    assert.equal(summary.eligibleRaces, 4);
    assert.equal(summary.selections, 4);
    assert.equal(summary.racingDays, 3);
    assertClose(summary.noSelectionRate, 0.6);
    assert.equal(summary.winners, 2);
    assertClose(summary.strikeRate, 0.5);
    assertClose(summary.averageOdds, 3.5);
    assertClose(summary.ae, 2 / (1 / 4 + 1 / 3 + 1 / 5 + 1 / 2));
    assertClose(summary.profitLoss, 2);
    assertClose(summary.roi, 0.5);
    assert.equal(summary.maxLosingSequence, 2);
    assertClose(summary.maxDrawdown, 2);
  });

  test("reports unavailable overlaps when no clean Tissue or market rows are present", () => {
    const summary = summarizeCandidateSelections([
      selection("race-1", "runner-1", "2026-01-01", false, 6, {
        tissueTop1: null,
        marketTop1: null,
      }),
    ], 1);

    assert.equal(summary.tissueTop1Overlap, null);
    assert.equal(summary.marketTop1Overlap, null);
  });
});

function assertClose(actual: number | null, expected: number) {
  assert.notEqual(actual, null);
  assert.ok(Math.abs(actual! - expected) < 1e-9, `${actual} not close to ${expected}`);
}

function selection(
  raceId: string,
  runnerId: string,
  raceDate: string,
  won: boolean,
  odds: number,
  overrides: Partial<CandidateSelection> = {},
): CandidateSelection {
  return {
    definitionId: "aw-handicap-rating",
    score: 1,
    ratingTop1: true,
    officialRatingTop1: false,
    tissueTop1: false,
    marketTop1: false,
    row: {
      features: {
        targetRaceId: raceId,
        targetRunnerId: runnerId,
        raceDate,
      },
      outcome: {
        targetRaceId: raceId,
        targetRunnerId: runnerId,
        finishingPosition: won ? 1 : 2,
        resultStatus: "finished",
        won,
        placed: null,
        startingPrice: null,
        startingPriceDecimal: String(odds),
      },
      ranks: { bestSpeedLast3: 1, officialRating: 2 },
      turfPerformance: null,
      turfPerformanceW50: null,
    } as CandidateSelection["row"],
    ...overrides,
  };
}
