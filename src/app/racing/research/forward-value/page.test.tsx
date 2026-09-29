import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ForwardValueData, ForwardValueRecord } from "@/lib/racing/forward-value";
import {
  filterForwardValueObservations,
  summarizeForwardValue,
  summarizeTurfModelAgreement,
} from "@/lib/racing/forward-value-summary";
import {
  EdgeBucketTables,
  FamilySummaryTable,
  RecentObservations,
  SparseSampleWarning,
  TurfModelAgreementCounts,
} from "./page";
import {
  hasHorizontalOverflow,
  shouldShowStickyScrollbar,
  synchronizeHorizontalScroll,
} from "./recent-observations-scroll";

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

  test("renders compact Edge Bucket tables with narrow responsive overflow fallbacks", () => {
    const html = renderToStaticMarkup(<EdgeBucketTables summary={summarizeForwardValue(data)} />);
    assert.equal(html.match(/data-testid="edge-bucket-scroll"/g)?.length, 3);
    assert.equal(html.match(/min-w-\[420px\] table-fixed text-xs/g)?.length, 3);
    assert.equal(html.match(/overflow-x-auto/g)?.length, 3);
    assert.doesNotMatch(html, /min-w-\[680px\]/);
    assert.match(html, /whitespace-nowrap px-1\.5 py-1\.5 text-right tabular-nums/);
    assert.match(html, /&gt; 10pp/);
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

  test("renders Turf TPR-versus-Tissue race table columns", () => {
    const recentHtml = renderToStaticMarkup(<RecentObservations filters={{ family: "all", state: "all", edge: "all" }} observations={[
      record({
        raceId: "turf-tissue-row",
        capturedPrice: "4/1",
        capturedDecimalOdds: 5,
        tissueRunnerId: "tissue-runner",
        tissueHorseName: "Tissue Choice",
        tissueProbability: .25,
        tissueAgreesWithTpr: false,
        tissueCapturedPrice: "9/2",
        tissueCapturedDecimalOdds: 5.5,
        tissueMarketProbability: 1 / 5.5,
        tissueEdgePercentagePoints: 6.8,
      }),
    ]} />);
    assert.match(recentHtml, /TPR horse/);
    assert.match(recentHtml, /Tissue Choice/);
    assert.match(recentHtml, /9\/2 \(5\.50\)/);
    assert.match(recentHtml, /\+6\.8pp/);
    assert.match(recentHtml, />No</);
  });

  test("renders the compact Recent Observations layout with constrained race text", () => {
    const recentHtml = renderToStaticMarkup(<RecentObservations filters={{ family: "all", state: "all", edge: "all" }} observations={[
      record({ raceId: "compact", course: "Long Course", raceName: "A Long Race Name That Needs To Wrap Within The Race Column" }),
    ]} />);
    assert.equal(recentHtml.match(/min-w-\[1446px\]/g)?.length, 2);
    assert.match(recentHtml, /table-fixed text-left text-xs/);
    assert.match(recentHtml, /line-clamp-2 break-words font-medium leading-4/);
    assert.match(recentHtml, /title="Long Course \/ A Long Race Name That Needs To Wrap Within The Race Column"/);
    assert.match(recentHtml, /data-testid="recent-observations-native-scrollbar"/);
  });

  test("renders section-constrained sticky filters above the sticky table header", () => {
    const html = renderToStaticMarkup(<RecentObservations filters={{ family: "turf", state: "settled", edge: "positive" }} observations={data.races} />);
    const filtersIndex = html.indexOf('data-testid="recent-observations-sticky-filters"');
    const headerIndex = html.indexOf('data-testid="recent-observations-sticky-header"');
    const tableIndex = html.indexOf('data-testid="recent-observations-native-scrollbar"');

    assert.ok(filtersIndex >= 0);
    assert.ok(headerIndex > filtersIndex);
    assert.ok(tableIndex > headerIndex);
    assert.match(html, /sticky top-0 z-30 bg-stone-50/);
    assert.match(html, /sticky z-20 h-0 overflow-visible/);
    assert.match(html, /aria-hidden="true"/);
  });

  test("keeps the Recent Observations filters as a GET submission form", () => {
    const html = renderToStaticMarkup(<RecentObservations filters={{ family: "turf", state: "settled", edge: "positive" }} observations={data.races} />);
    assert.match(html, /<form[^>]*method="get"/);
    assert.match(html, /<select[^>]*name="family"/);
    assert.match(html, /<select[^>]*name="state"/);
    assert.match(html, /<select[^>]*name="edge"/);
    assert.match(html, /<button[^>]*type="submit"[^>]*>Apply<\/button>/);
  });

  test("detects horizontal overflow and only shows the sticky scrollbar when relevant", () => {
    assert.equal(hasHorizontalOverflow({ clientWidth: 1000, scrollWidth: 1446 }), true);
    assert.equal(hasHorizontalOverflow({ clientWidth: 1446, scrollWidth: 1446 }), false);
    assert.equal(shouldShowStickyScrollbar(true, true), true);
    assert.equal(shouldShowStickyScrollbar(true, false), false);
    assert.equal(shouldShowStickyScrollbar(false, true), false);
  });

  test("synchronizes horizontal scroll positions in either direction", () => {
    const nativeScroller = { scrollLeft: 180 };
    const stickyScroller = { scrollLeft: 0 };
    synchronizeHorizontalScroll(nativeScroller, stickyScroller);
    assert.equal(stickyScroller.scrollLeft, 180);
    stickyScroller.scrollLeft = 72;
    synchronizeHorizontalScroll(stickyScroller, nativeScroller);
    assert.equal(nativeScroller.scrollLeft, 72);
  });

  test("summarizes Turf model agreement", () => {
    const summary = summarizeTurfModelAgreement([turfComparisonRecord({ raceId: "agree", tissueAgreesWithTpr: true })]);
    assert.equal(summary.comparableRaces, 1);
    assert.equal(summary.tprTissueAgree, 1);
    assert.equal(summary.disagree, 0);
  });

  test("summarizes Turf model disagreement", () => {
    const summary = summarizeTurfModelAgreement([turfComparisonRecord({ raceId: "disagree", tissueAgreesWithTpr: false })]);
    assert.equal(summary.comparableRaces, 1);
    assert.equal(summary.tprTissueAgree, 0);
    assert.equal(summary.disagree, 1);
  });

  test("summarizes TPR-only positive edge", () => {
    const summary = summarizeTurfModelAgreement([turfComparisonRecord({ raceId: "tpr-only", edgePercentagePoints: 4, tissueEdgePercentagePoints: -1 })]);
    assert.equal(summary.tprPositiveOnly, 1);
    assert.equal(summary.tissuePositiveOnly, 0);
    assert.equal(summary.bothPositiveEdge, 0);
  });

  test("summarizes Tissue-only positive edge", () => {
    const summary = summarizeTurfModelAgreement([turfComparisonRecord({ raceId: "tissue-only", edgePercentagePoints: -2, tissueEdgePercentagePoints: 3 })]);
    assert.equal(summary.tissuePositiveOnly, 1);
    assert.equal(summary.tprPositiveOnly, 0);
    assert.equal(summary.bothPositiveEdge, 0);
  });

  test("summarizes both positive edges", () => {
    const summary = summarizeTurfModelAgreement([turfComparisonRecord({ raceId: "both-positive", edgePercentagePoints: 2, tissueEdgePercentagePoints: 3 })]);
    assert.equal(summary.bothPositiveEdge, 1);
    assert.equal(summary.tprPositiveOnly, 0);
    assert.equal(summary.tissuePositiveOnly, 0);
  });

  test("ignores missing Tissue observations in Turf agreement counts", () => {
    const summary = summarizeTurfModelAgreement([
      turfComparisonRecord({ raceId: "missing-tissue", tissueAgreesWithTpr: null, tissueProbability: null, tissueEdgePercentagePoints: null }),
    ]);
    assert.equal(summary.comparableRaces, 0);
    assert.equal(summary.tprTissueAgree, 0);
    assert.equal(summary.disagree, 0);
  });

  test("renders compact Turf model agreement counts", () => {
    const html = renderToStaticMarkup(<TurfModelAgreementCounts summary={{
      comparableRaces: 6,
      tprTissueAgree: 2,
      disagree: 4,
      bothPositiveEdge: 1,
      tprPositiveOnly: 2,
      tissuePositiveOnly: 3,
      neitherPositive: 0,
    }} />);
    assert.match(html, /Comparable races/);
    assert.match(html, /TPR positive only/);
    assert.match(html, />6</);
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

function turfComparisonRecord(overrides: Partial<ForwardValueRecord> & { raceId: string }): ForwardValueRecord {
  return record({
    tissueRunnerId: "tissue-runner",
    tissueHorseName: "Tissue Choice",
    tissueProbability: .3,
    tissueAgreesWithTpr: false,
    tissueCapturedPrice: "4/1",
    tissueCapturedDecimalOdds: 5,
    tissueMarketProbability: .2,
    tissueEdgePercentagePoints: 10,
    ...overrides,
  });
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
