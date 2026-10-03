import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AwTissueValueSection, JumpTissueValueSection } from "./aw-tissue-value";
import { emptyAwTissueForward, type AwTissueForwardData } from "@/lib/racing/aw-tissue-forward";
import type { ForwardValuePriceSnapshot } from "@/lib/racing/forward-value";
import { emptyJumpTissueForward, type JumpTissueForwardData } from "@/lib/racing/jump-tissue-forward";
import { AwTissueCell } from "../../today/page";
import type { TodayRunner } from "@/lib/racing/todays-racing";

test("AW Forward Value has a separate responsive section and explicit empty state", () => {
  const html = renderToStaticMarkup(<AwTissueValueSection data={emptyAwTissueForward()} ratings={[]} />);
  assert.match(html, /AW Tissue \(diagnostic\)/);
  assert.match(html, /No prospective AW Tissue observations/);
  assert.match(html, /Median bookmaker/);
  assert.match(html, /T-180/);
  assert.match(html, /Final SP/);
  assert.match(html, /overflow-x-auto/);
});

test("AW Tissue diagnostic defaults collapsed with compact summary", () => {
  const html = renderToStaticMarkup(<AwTissueValueSection data={awTissueData(1)} ratings={[]} />);
  assert.match(html, /<details class="border border-slate-200 bg-white"><summary[^>]*>AW Tissue \(diagnostic\)<\/summary>/);
  assert.doesNotMatch(html, /<details open/);
  assert.match(html, /Comparable AW-D races/);
});

test("AW Tissue expanded detail markup keeps the observation table", () => {
  const html = renderToStaticMarkup(<AwTissueValueSection data={awTissueData(1)} ratings={[]} />);
  assert.match(html, /Newest first\. Showing up to 100 observations\./);
  assert.match(html, /AW Tissue probability/);
  assert.match(html, /Median bookmaker/);
  assert.match(html, /Final SP/);
  assert.match(html, /Settlement\/status/);
  assert.match(html, /AW Horse 0/);
});

test("AW Tissue detail limits initial display to 100 newest observations", () => {
  const html = renderToStaticMarkup(<AwTissueValueSection data={awTissueData(101)} ratings={[]} />);
  assert.equal(html.match(/AW Horse/g)?.length, 100);
  assert.match(html, /AW Horse 100/);
  assert.doesNotMatch(html, /AW Horse 0</);
});

test("Jump Tissue renders empty state without hiding section", () => {
  const html = renderToStaticMarkup(<JumpTissueValueSection data={emptyJumpTissueForward()} ratings={[]} />);
  assert.match(html, /Jump Tissue \(diagnostic\)/);
  assert.match(html, /No prospective Jump Tissue observations yet/);
  assert.match(html, /Comparable JPR-A races/);
});

test("Jump Tissue renders summary and detail rows", () => {
  const html = renderToStaticMarkup(<JumpTissueValueSection data={jumpTissueData(1)} ratings={[]} />);
  assert.match(html, /Comparable JPR-A races/);
  assert.match(html, /Jump Tissue probability/);
  assert.match(html, /Jump Horse 0/);
  assert.match(html, /Early/);
  assert.match(html, /T-180/);
  assert.match(html, /T-60/);
  assert.match(html, /Settlement\/status/);
});

test("Today shows frozen AW probability/rank, zero history and explicit unavailable state", () => {
  const runner = { awTissue: { predictionAvailable: true, probability: .234, rank: 2, zeroHistoryRunner: true } } as TodayRunner;
  const html = renderToStaticMarkup(<AwTissueCell runner={runner} />);
  assert.match(html, /23\.4%/);
  assert.match(html, /#2/);
  assert.match(html, /0 prior AW starts/);
  const unavailable = { awTissue: { predictionAvailable: false, probability: null, unavailableReason: "prior_aw_starts_unavailable" } } as TodayRunner;
  assert.match(renderToStaticMarkup(<AwTissueCell runner={unavailable} />), /prior_aw_starts_unavailable/);
});

function awTissueData(count: number): AwTissueForwardData {
  return {
    ...emptyAwTissueForward(),
    races: Array.from({ length: count }, (_, index) => ({
      ...baseTissueRace(index, "AW Horse"),
      runners: [{
        ...baseAwPrediction("runner-1"),
        horseId: "horse-1",
        horseName: `AW Horse ${index}`,
        outcome: null,
      }],
      top1: "runner-1",
      top2: ["runner-1"],
      top3: ["runner-1"],
      awDLeader: "runner-1",
      awALeader: "runner-1",
      awDCoverage: { ratedRunnerCount: 2, activeRunnerCount: 2, ratingCoverage: 1, ratingCoverageStatus: "eligible" },
    })),
  } as unknown as AwTissueForwardData;
}

function jumpTissueData(count: number): JumpTissueForwardData {
  return {
    ...emptyJumpTissueForward(),
    races: Array.from({ length: count }, (_, index) => ({
      ...baseTissueRace(index, "Jump Horse"),
      subtype: "Hurdle",
      nhFlat: false,
      runners: [{
        ...baseJumpPrediction("runner-1"),
        horseId: "horse-1",
        horseName: `Jump Horse ${index}`,
        outcome: null,
      }],
      top1: "runner-1",
      top2: ["runner-1"],
      top3: ["runner-1"],
      jprALeader: "runner-1",
      jprBLeader: "runner-1",
    })),
  } as unknown as JumpTissueForwardData;
}

function baseTissueRace(index: number, horsePrefix: string) {
  const recordedAt = new Date(Date.UTC(2026, 9, 3, 12, index)).toISOString();
  const offAt = new Date(Date.UTC(2026, 9, 3, 13, index)).toISOString();
  const snapshot = priceSnapshot();
  return {
    raceId: `race-${index}`,
    sourceId: null,
    raceDate: "2026-10-03",
    course: "Test",
    raceName: `${horsePrefix} Stakes`,
    scheduledTime: "13:00",
    scheduledOffAt: offAt,
    currentOffAt: offAt,
    fieldSize: 2,
    activeRunnerCount: 2,
    predictedRunnerCount: 2,
    predictionCoverage: 1,
    recordedAt,
    recordedPreRace: true,
    modelVersion: "test",
    featureSchemaVersion: "test",
    modelHash: "hash",
    winners: [],
    settledAt: null,
    excludedReason: null,
    marketPriceBasisVersion: "median_bookmaker_v1",
    priceSnapshotScheduleVersion: "early_t180_t60_v1",
    prices: { early: snapshot, t180: snapshot, t60: snapshot },
    selectedPriceProfitLoss: { early: null, t180: null, t60: null, bestEarly: null, finalSp: null },
  };
}

function priceSnapshot(): ForwardValuePriceSnapshot {
  return {
    decimalPrice: 4,
    impliedProbability: .25,
    capturedAt: "2026-10-02T10:00:00Z",
    minutesBeforeScheduledOff: 180,
    ratingProbability: .3,
    ratingEdgePercentagePoints: 5,
    marketPriceBasisVersion: "median_bookmaker_v1",
    bookmakerQuoteCount: 1,
    bookmakerQuotes: [{ bookmakerId: 1, bookmakerName: "Book", fractionalOdds: "3/1", decimalOdds: 4 }],
    bestBookmakerPriceDecimal: 4.2,
    bestBookmakerPriceFractional: "16/5",
    bestBookmakerName: "Book",
    forecastPrice: "3/1",
    forecastDecimalPrice: 4,
  };
}

function baseAwPrediction(runnerId: string) {
  return {
    runnerId,
    probability: .3,
    rank: 1,
    predictionAvailable: true,
    unavailableReason: null,
    zeroHistoryRunner: false,
    priorAwStarts: 3,
    rawInputs: [],
    modelInputs: [],
    modelVersion: "AW_TISSUE_V1",
    featureSchemaVersion: "aw_tissue_stage1_features_v1",
  };
}

function baseJumpPrediction(runnerId: string) {
  return {
    runnerId,
    probability: .3,
    rank: 1,
    predictionAvailable: true,
    unavailableReason: null,
    rawInputs: [],
    modelInputs: [],
    modelVersion: "JUMP_TISSUE_V1",
    featureSchemaVersion: "jump_tissue_stage1_numeric_prior_comments_v1",
    priorJumpStarts: 3,
    historyBucket: "three_plus",
    zeroPriorJumpStarts: false,
    onePriorJumpStart: false,
    twoPriorJumpStarts: false,
    threePlusPriorJumpStarts: true,
    commentProvenance: {
      representationVersion: "jump_tissue_stage1_numeric_prior_comments_v1",
      sourceObservationCutoff: null,
      priorCommentCount: 0,
      activeCommentFeatures: [],
      chronologySafe: true,
      targetRacePostResultCommentExcluded: true,
    },
  };
}
