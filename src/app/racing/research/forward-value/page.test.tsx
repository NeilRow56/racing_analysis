import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ForwardValueData, ForwardValueRecord } from "@/lib/racing/forward-value";
import {
  filterForwardValueObservations,
  summarizeForwardValue,
} from "@/lib/racing/forward-value-summary";
import {
  FamilySummaryTable,
  RecentObservations,
  SparseSampleWarning,
} from "./page";

describe("Forward Value dashboard", () => {
  const data = fixtureData();

  test("summary counts match tracker classifications", () => {
    const summary = summarizeForwardValue(data);
    assert.equal(summary.totalProspectiveObservations, 4);
    assert.equal(summary.cleanSettledObservations, 2);
    assert.equal(summary.unsettledObservations, 1);
    assert.equal(summary.excludedObservations, 1);
    assert.equal(summary.earliestObservationDate, "2026-09-25");
    assert.equal(summary.latestObservationDate, "2026-09-27");
  });

  test("family filter returns only the requested rating family", () => {
    const filtered = filterForwardValueObservations(data.races, { family: "turf", state: "all", edge: "all" });
    assert.equal(filtered.length, 2);
    assert.ok(filtered.every((race) => race.family === "turf"));
  });

  test("uses frozen edge bucket assignment in family summaries", () => {
    const turf = summarizeForwardValue(data).families.find((family) => family.family === "turf")!;
    assert.equal(turf.edgeBuckets.find((bucket) => bucket.band === ">10pp")!.observations, 1);
    assert.equal(turf.edgeBuckets.find((bucket) => bucket.band === "<=0pp")!.observations, 1);
  });

  test("summarizes immutable price snapshots without counting missing stages", () => {
    const diagnostics = summarizeForwardValue(data).families.find((family) => family.family === "turf")!.priceDiagnostics;
    assert.equal(diagnostics.snapshots.early.observations, 2);
    assert.equal(diagnostics.snapshots.t60.observations, 1);
    assert.equal(diagnostics.snapshots.t15.observations, 1);
    assert.equal(diagnostics.persistence.earlyToT60.comparableObservations, 1);
    assert.equal(diagnostics.persistence.earlyToT60.stillPositive.wins, 1);
    assert.ok(Math.abs((diagnostics.movements.earlyToT60.meanMovement ?? 0) - -.2) < 1e-9);
    assert.ok(Math.abs((diagnostics.movements.t15ToFinalSp.meanMovement ?? 0) - .2) < 1e-9);
  });

  test("filters clean settled, clean unsettled, and excluded observations", () => {
    assert.deepEqual(ids("settled"), ["turf-new", "turf-old"]);
    assert.deepEqual(ids("unsettled"), ["jump-pending"]);
    assert.deepEqual(ids("excluded"), ["aw-missing"]);
  });

  test("renders captured-price P/L in summary and recent observations", () => {
    const summaryHtml = renderToStaticMarkup(<FamilySummaryTable summary={summarizeForwardValue(data)} />);
    const recentHtml = renderToStaticMarkup(<RecentObservations filters={{ family: "all", state: "all", edge: "all" }} observations={data.races} />);
    assert.match(summaryHtml, /\+3\.00/);
    assert.match(recentHtml, /\+4\.00/);
    assert.match(recentHtml, />14:00</);
  });

  test("sorts observations newest first", () => {
    const filtered = filterForwardValueObservations(data.races, { family: "all", state: "all", edge: "all" });
    assert.deepEqual(filtered.map((race) => race.raceId), ["turf-new", "jump-pending", "aw-missing", "turf-old"]);
  });

  test("renders the sparse-sample warning", () => {
    assert.equal(summarizeForwardValue(data).sparseSampleWarning, true);
    assert.match(renderToStaticMarkup(<SparseSampleWarning show />), /too small for meaningful profitability conclusions/);
  });

  function ids(state: "settled" | "unsettled" | "excluded") {
    return filterForwardValueObservations(data.races, { family: "all", state, edge: "all" }).map((race) => race.raceId);
  }
});

function fixtureData(): ForwardValueData {
  return {
    version: "forward_value_v1",
    races: [
      record({ raceId: "turf-old", raceDate: "2026-09-25", raceDateTime: "2026-09-25T13:00:00Z", recordedAt: "2026-09-25T11:00:00Z", calibratedProbability: .3, capturedDecimalOdds: 2, capturedMarketProbability: .5, edgePercentagePoints: -20, leaderWon: false, capturedPriceProfitLoss: -1 }),
      record({ raceId: "aw-missing", family: "aw", raceDate: "2026-09-26", raceDateTime: "2026-09-26T15:00:00Z", recordedAt: "2026-09-26T12:00:00Z", capturedPrice: null, capturedDecimalOdds: null, capturedMarketProbability: null, edgePercentagePoints: null, settledAt: null, leaderWon: null, capturedPriceProfitLoss: null, phase2ExclusionReason: "missing_price" }),
      record({ raceId: "jump-pending", family: "jump", raceDateTime: "2026-09-27T14:00:00Z", recordedAt: "2026-09-27T10:00:00Z", settledAt: null, leaderWon: null, capturedPriceProfitLoss: null }),
      record({
        raceId: "turf-new", recordedAt: "2026-09-27T11:00:00Z", leaderWon: true, capturedPriceProfitLoss: 4,
        t60PriceSnapshot: { decimalPrice: 4, impliedProbability: .25, capturedAt: "2026-09-27T12:00:00Z", minutesBeforeScheduledOff: 60, ratingProbability: .4, ratingEdgePercentagePoints: 15 },
        t15PriceSnapshot: { decimalPrice: 10 / 3, impliedProbability: .3, capturedAt: "2026-09-27T12:45:00Z", minutesBeforeScheduledOff: 15, ratingProbability: .4, ratingEdgePercentagePoints: 10 },
      }),
    ],
  };
}

function record(overrides: Partial<ForwardValueRecord> & { raceId: string }): ForwardValueRecord {
  const { raceId, ...rest } = overrides;
  return {
    family: "turf",
    raceId,
    raceDate: "2026-09-27",
    raceDateTime: "2026-09-27T13:00:00Z",
    raceTime: "13:00",
    course: "Test",
    raceName: "Research Stakes",
    ratingVersion: "TPR_S2_V1",
    calibrationVersion: "TPR_CAL_V1",
    recordedAt: "2026-09-27T09:00:00Z",
    recordedPreRace: true,
    captureMode: "live_sync",
    settlementVersion: "canonical_settlement_v2",
    phase2ExclusionReason: null,
    leaderRunnerId: `${raceId}-runner`,
    leaderHorseId: `${raceId}-horse`,
    leaderHorseName: "Example Leader",
    leaderRank: 1,
    leaderScore: 1,
    leaderGap: .5,
    calibratedProbability: .4,
    capturedPrice: "4/1",
    priceSource: "sporting_life_imported_racecard",
    priceCapturedAt: overrides.priceCapturedAt ?? overrides.recordedAt ?? "2026-09-27T09:00:00Z",
    minutesBeforeScheduledOff: 240,
    capturedDecimalOdds: 5,
    capturedMarketProbability: .2,
    edgePercentagePoints: 20,
    edgeBand: ">10pp",
    marketFavouriteRunnerIds: [],
    marketFavouriteHorseNames: [],
    agreesWithMarketFavourite: false,
    leaderIsMarketFavourite: false,
    tissueRunnerId: null,
    tissueHorseName: null,
    tissueProbability: null,
    tissueAgreesWithTpr: null,
    winnerRunnerIds: [],
    leaderResultStatus: "finished",
    leaderFinishingPosition: 1,
    leaderWon: true,
    finalSp: 4,
    grossReturn: 4,
    profitLoss: 3,
    capturedPriceGrossReturn: 5,
    capturedPriceProfitLoss: 4,
    settledAt: "2026-09-27T14:00:00Z",
    ...rest,
  };
}
